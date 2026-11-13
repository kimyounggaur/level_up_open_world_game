// 8-6 콘텐츠 판 올리기: 정답 기준이 바뀌면 contentVersion을 올리게 하는 잠금(content/content-lock.json)의 순수 계산.
// 시도 기록은 그때의 contentVersion을 가지고 있고, 이전 기록은 새 정답 기준으로 다시 계산하지 않는다(12.11 8-6).
// 정답 기준이 바뀌었는데 판이 그대로면 옛 기록이 '어느 기준으로 통과했는지' 알 수 없게 되므로 그것을 막는다.
// 해시는 노드의 crypto가 필요해서 tools/content-lock-files.ts가 만들고, 여기서는 만들어진 값을 견주기만 한다(domain은 노드를 가져오지 않는다).
import type { ContentIssue, QuestDefinition } from './content';

export const LOCK_SCHEMA_VERSION = 1;
export const LOCK_FILE = 'content/content-lock.json';

export interface LockedQuest {
  contentVersion: string;
  /** 정답 기준(answerBasisOf)의 sha256 앞 16글자 */
  hash: string;
}

export interface ContentLock {
  schemaVersion: number;
  /** 잠근 날(YYYY-MM-DD) */
  lockedOn: string;
  quests: Record<string, LockedQuest>;
}

/** 키 순서에 상관없는 같은 글자 표현. 정답 기준의 해시가 파일에 적힌 키 순서에 흔들리지 않게 한다 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/**
 * 정답 기준: 판본마다 무엇을 묻는지(challengeDescriptor), 목표 악보(score), 판정(evaluatorSpec), 그리고 틀렸을 때 보이는 말(feedbackRules).
 * 이름표(label), 공개 상태(availability), 출처·검수 기록, 제목, 배치는 정답 기준이 아니다:
 * 내리고 다시 올리거나 검수 기록을 고치는 일에는 판을 올리지 않는다.
 */
export function answerBasisOf(def: Pick<QuestDefinition, 'variants' | 'feedbackRules'>): unknown {
  const variants: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(def.variants)) {
    variants[id] = { challengeDescriptor: v.challengeDescriptor, score: v.score, evaluatorSpec: v.evaluatorSpec };
  }
  return { variants, feedbackRules: def.feedbackRules };
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** 0.1.0 같은 판 번호를 견준다. 앞이 작으면 음수, 같으면 0, 크면 양수. 형식이 틀리면 NaN */
export function compareVersions(a: string, b: string): number {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) return Number.NaN;
  for (let i = 1; i <= 3; i++) {
    const d = Number(x[i]) - Number(y[i]);
    if (d !== 0) return d;
  }
  return 0;
}

/** 잠금과 어긋남의 종류. 앞의 셋은 이미 나간 판의 의미를 해치는 것이라 잠금을 새로 쓰는 것도 막는다(LOCK_HARD) */
export const LOCK_HARD = ['LOCK_CHANGED', 'LOCK_VERSION_DOWN', 'LOCK_REMOVED'] as const;

export function parseLock(raw: unknown): { lock: ContentLock | null; issues: ContentIssue[] } {
  const bad = (message: string): { lock: null; issues: ContentIssue[] } => ({ lock: null, issues: [{ code: 'LOCK_SHAPE', path: LOCK_FILE, message }] });
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad('내용 잠금이 객체가 아니에요');
  const o = raw as Record<string, unknown>;
  if (o['schemaVersion'] !== LOCK_SCHEMA_VERSION) return bad(`schemaVersion은 ${LOCK_SCHEMA_VERSION}이어야 해요`);
  if (typeof o['lockedOn'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o['lockedOn'])) return bad('lockedOn은 YYYY-MM-DD여야 해요');
  const q = o['quests'];
  if (typeof q !== 'object' || q === null || Array.isArray(q)) return bad('quests가 객체가 아니에요');
  const quests: Record<string, LockedQuest> = {};
  for (const [id, e] of Object.entries(q as Record<string, unknown>)) {
    const r = e as Record<string, unknown> | null;
    if (!r || typeof r['contentVersion'] !== 'string' || !SEMVER.test(r['contentVersion']) || typeof r['hash'] !== 'string' || !/^[0-9a-f]{16}$/.test(r['hash'])) {
      return bad(`quests.${id}는 { contentVersion: 0.1.0 같은 판 번호, hash: 16글자 16진수 }여야 해요`);
    }
    quests[id] = { contentVersion: r['contentVersion'], hash: r['hash'] };
  }
  return { lock: { schemaVersion: LOCK_SCHEMA_VERSION, lockedOn: o['lockedOn'], quests }, issues: [] };
}

/**
 * 잠금(마지막으로 내보낸 상태)과 지금 콘텐츠를 견준다. 문제가 없으면 빈 목록이다.
 *  LOCK_MISSING      잠금이 없다
 *  LOCK_CHANGED      정답 기준이 바뀌었는데 판이 그대로다(올려야 한다)
 *  LOCK_VERSION_DOWN 판 번호가 내려갔다
 *  LOCK_REMOVED      잠긴 과제의 파일이 사라졌다(내리려면 지우지 말고 availability를 draft로 둔다)
 *  LOCK_NEW          잠금에 없는 새 과제다(기록하면 된다)
 *  LOCK_STALE        판이 올랐는데 잠금이 옛것이다(기록하면 된다)
 */
export function checkLock(lock: ContentLock | null, current: Readonly<Record<string, LockedQuest>>): ContentIssue[] {
  if (!lock) return [{ code: 'LOCK_MISSING', path: LOCK_FILE, message: '내용 잠금이 없어요. 내보낼 내용이 정해지면 `npm run lock:content`로 만들어요' }];
  const issues: ContentIssue[] = [];
  for (const id of Object.keys(current).sort()) {
    const now = current[id]!;
    const then = lock.quests[id];
    if (!then) {
      issues.push({ code: 'LOCK_NEW', path: id, message: `잠금에 없는 새 과제예요(${now.contentVersion}). \`npm run lock:content\`로 기록해요` });
      continue;
    }
    const cmp = compareVersions(now.contentVersion, then.contentVersion);
    if (Number.isNaN(cmp)) issues.push({ code: 'LOCK_VERSION_DOWN', path: id, message: `판 번호를 견줄 수 없어요(${then.contentVersion} → ${now.contentVersion})` });
    else if (cmp < 0) issues.push({ code: 'LOCK_VERSION_DOWN', path: id, message: `판 번호가 내려갔어요(${then.contentVersion} → ${now.contentVersion}). 판은 올리기만 해요` });
    else if (cmp === 0 && now.hash !== then.hash) {
      issues.push({ code: 'LOCK_CHANGED', path: id, message: `정답 기준이 바뀌었는데 contentVersion이 그대로예요(${now.contentVersion}). 판을 올린 뒤 \`npm run lock:content\`로 기록해요` });
    } else if (cmp > 0) {
      issues.push({ code: 'LOCK_STALE', path: id, message: `판이 올랐어요(${then.contentVersion} → ${now.contentVersion}). \`npm run lock:content\`로 기록해요` });
    }
  }
  for (const id of Object.keys(lock.quests).sort()) {
    if (!(id in current)) issues.push({ code: 'LOCK_REMOVED', path: id, message: '잠긴 과제의 파일이 없어요. 내리려면 지우지 말고 availability를 draft로 바꿔요(저장된 기록이 이 과제를 가리킨다)' });
  }
  return issues;
}

/** 잠금을 새로 쓸 수 있는가: 이미 나간 판의 의미를 해치는 어긋남(LOCK_HARD)이 없어야 한다 */
export const lockWritable = (issues: readonly ContentIssue[]): boolean => !issues.some((i) => (LOCK_HARD as readonly string[]).includes(i.code));
