// 8-6 내용 잠금의 파일 쪽: content/quests를 읽어 지금 상태를 만들고 content/content-lock.json과 견준다.
// 견주는 규칙은 순수 계산(src/domain/contentlock.ts)에 있고, 여기는 파일을 읽고 해시를 만든다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ContentIssue, QuestDefinition } from '../src/domain/content';
import { LOCK_FILE, LOCK_SCHEMA_VERSION, answerBasisOf, canonicalJson, checkLock, parseLock } from '../src/domain/contentlock';
import type { ContentLock, LockedQuest } from '../src/domain/contentlock';
import { loadContent } from './content-loader';

/** 정답 기준의 sha256 앞 16글자 */
export const hashOf = (value: unknown): string => crypto.createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 16);

/** 지금 콘텐츠의 과제별 판 번호와 정답 기준 해시 */
export function currentQuests(root: string): Record<string, LockedQuest> {
  const out: Record<string, LockedQuest> = {};
  for (const f of loadContent(root).quests) {
    const def = f.data as QuestDefinition;
    out[def.questId] = { contentVersion: def.contentVersion, hash: hashOf(answerBasisOf(def)) };
  }
  return out;
}

/** 잠금 파일을 읽는다. 파일이 없으면 lock이 null이고 문제는 없다(없다는 것은 호출한 쪽이 판단한다) */
export function loadLockFile(root: string): { lock: ContentLock | null; issues: ContentIssue[] } {
  const file = path.join(root, LOCK_FILE);
  if (!fs.existsSync(file)) return { lock: null, issues: [] };
  try {
    return parseLock(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (err) {
    return { lock: null, issues: [{ code: 'LOCK_SHAPE', path: LOCK_FILE, message: `JSON을 읽을 수 없어요: ${(err as Error).message}` }] };
  }
}

/** 잠금과 지금 콘텐츠의 어긋남. 잠금 파일이 없는 것은 requireFile일 때만 문제다(`npm run validate`는 없어도 통과하고, 공개 점검은 있어야 한다) */
export function validateLockDir(root: string, opts: { requireFile?: boolean } = {}): ContentIssue[] {
  const { lock, issues } = loadLockFile(root);
  if (issues.length > 0) return issues;
  if (!lock) return opts.requireFile ? checkLock(null, {}) : [];
  return checkLock(lock, currentQuests(root));
}

/** 지금 콘텐츠로 잠금을 만든다 */
export const buildLock = (root: string, lockedOn: string): ContentLock => ({ schemaVersion: LOCK_SCHEMA_VERSION, lockedOn, quests: currentQuests(root) });

export function writeLock(root: string, lock: ContentLock): void {
  fs.writeFileSync(path.join(root, LOCK_FILE), JSON.stringify(lock, null, 2) + '\n');
}
