// 8-6 내용 잠금: 정답 기준이 바뀌면 contentVersion을 올리게 한다(12.11 8-6, 'src/domain/contentlock.ts').
// 시도 기록은 그때의 contentVersion을 가지고, 이전 기록은 새 정답 기준으로 다시 계산하지 않는다. 판이 그대로인 채 정답 기준이 바뀌면 옛 기록의 뜻을 잃는다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@/domain/content';
import { LOCK_HARD, answerBasisOf, canonicalJson, checkLock, compareVersions, lockWritable, parseLock } from '@/domain/contentlock';
import type { ContentLock, LockedQuest } from '@/domain/contentlock';
import { loadContent } from '../../tools/content-loader';
import { buildLock, currentQuests, hashOf, loadLockFile, validateLockDir } from '../../tools/content-lock-files';

const ROOT = path.resolve(__dirname, '../..');
const DEFS = loadContent(ROOT).quests.map((f) => f.data as QuestDefinition);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const Q = DEFS.find((d) => d.questId === 'rhythm.rest-in-a-bar')!;
const hashOfDef = (d: QuestDefinition): string => hashOf(answerBasisOf(d));

describe('canonicalJson', () => {
  it('키 순서가 달라도 같은 글자이고, 배열의 순서는 구분한다', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, 2] }, b: 1 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: '1' }));
  });
  it('정의되지 않은 값은 객체에서 빠지고 배열에서는 null이다', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });
});

describe('compareVersions', () => {
  it('숫자로 견준다(0.10.0은 0.9.0보다 크다)', () => {
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });
  it('형식이 틀리면 NaN이다', () => {
    expect(compareVersions('0.1', '0.1.0')).toBeNaN();
    expect(compareVersions('v1.0.0', '1.0.0')).toBeNaN();
  });
});

describe('정답 기준(answerBasisOf)', () => {
  const base = hashOfDef(Q);
  it('이름표, 공개 상태, 제목, 출처·검수 기록, 배치는 정답 기준이 아니다(내렸다 올리거나 검수 기록을 고쳐도 판을 올리지 않는다)', () => {
    const d = clone(Q);
    d.title = '다른 제목';
    d.availability = d.availability === 'draft' ? 'published' : 'draft';
    for (const v of Object.values(d.variants)) {
      v.label = '다른 이름표';
      v.availability = 'published';
    }
    d.sourceRefs = [];
    d.topicTags = ['x'];
    d.placements = [];
    d.assistanceLinks = [];
    expect(hashOfDef(d)).toBe(base);
  });
  it('JSON 파일의 키 순서가 달라도 같다', () => {
    const d = clone(Q);
    d.variants = Object.fromEntries(Object.entries(d.variants).reverse());
    expect(hashOfDef(d)).toBe(base);
  });
  it('묻는 것, 목표 악보, 판정, 틀렸을 때의 말이 바뀌면 달라진다', () => {
    const first = Object.keys(Q.variants)[0]!;
    const edits: Array<[string, (d: QuestDefinition) => void]> = [
      ['목표 악보', (d) => void (d.variants[first]!.score.tempoBpm += 1)],
      ['판정', (d) => void ((d.variants[first]!.evaluatorSpec as unknown as Record<string, unknown>)['x'] = 1)],
      ['묻는 것', (d) => void (d.variants[first]!.challengeDescriptor.voices += 1)],
      ['틀렸을 때의 말', (d) => void d.feedbackRules.push({ code: 'X', template: '새 말' } as never)],
      ['판본 하나를 뺌', (d) => void delete d.variants[first]],
    ];
    for (const [what, edit] of edits) {
      const d = clone(Q);
      edit(d);
      expect(hashOfDef(d), what).not.toBe(base);
    }
  });
});

describe('parseLock', () => {
  const ok = { schemaVersion: 1, lockedOn: '2026-11-13', quests: { a: { contentVersion: '0.1.0', hash: '0123456789abcdef' } } };
  it('올바른 잠금을 읽는다', () => {
    const r = parseLock(ok);
    expect(r.issues).toEqual([]);
    expect(r.lock?.quests['a']).toEqual({ contentVersion: '0.1.0', hash: '0123456789abcdef' });
  });
  it('모양이 틀린 잠금은 이유와 함께 거절한다', () => {
    const cases: unknown[] = [null, [], { ...ok, schemaVersion: 2 }, { ...ok, lockedOn: '어제' }, { ...ok, quests: [] }, { ...ok, quests: { a: { contentVersion: '1', hash: '0123456789abcdef' } } }, { ...ok, quests: { a: { contentVersion: '0.1.0', hash: 'xyz' } } }];
    for (const c of cases) {
      const r = parseLock(c);
      expect(r.lock).toBeNull();
      expect(r.issues[0]?.code).toBe('LOCK_SHAPE');
    }
  });
});

describe('checkLock: 마지막으로 내보낸 상태와 지금을 견준다', () => {
  const H1 = '1111111111111111';
  const H2 = '2222222222222222';
  const lock: ContentLock = { schemaVersion: 1, lockedOn: '2026-11-13', quests: { a: { contentVersion: '0.1.0', hash: H1 }, b: { contentVersion: '0.2.0', hash: H1 } } };
  const now = (over: Record<string, LockedQuest | null> = {}): Record<string, LockedQuest> => {
    const base: Record<string, LockedQuest | null> = { a: { contentVersion: '0.1.0', hash: H1 }, b: { contentVersion: '0.2.0', hash: H1 }, ...over };
    return Object.fromEntries(Object.entries(base).filter((e): e is [string, LockedQuest] => e[1] !== null));
  };
  const codes = (cur: Record<string, LockedQuest>, l: ContentLock | null = lock): string[] => checkLock(l, cur).map((i) => i.code);

  it('그대로면 문제가 없다', () => expect(codes(now())).toEqual([]));
  it('잠금이 없으면 LOCK_MISSING', () => expect(codes(now(), null)).toEqual(['LOCK_MISSING']));
  it('정답 기준이 바뀌었는데 판이 그대로면 LOCK_CHANGED(막는 문제)', () => {
    const issues = checkLock(lock, now({ a: { contentVersion: '0.1.0', hash: H2 } }));
    expect(issues.map((i) => i.code)).toEqual(['LOCK_CHANGED']);
    expect(issues[0]!.path).toBe('a');
    expect(issues[0]!.message).toContain('판을 올린 뒤');
    expect(lockWritable(issues)).toBe(false);
  });
  it('판을 올렸으면 정답 기준이 바뀌어도 LOCK_STALE(기록하면 되는 문제)', () => {
    const issues = checkLock(lock, now({ a: { contentVersion: '0.1.1', hash: H2 } }));
    expect(issues.map((i) => i.code)).toEqual(['LOCK_STALE']);
    expect(lockWritable(issues)).toBe(true);
  });
  it('판 번호가 내려가면 LOCK_VERSION_DOWN(막는 문제)', () => {
    const issues = checkLock(lock, now({ b: { contentVersion: '0.1.9', hash: H1 } }));
    expect(issues.map((i) => i.code)).toEqual(['LOCK_VERSION_DOWN']);
    expect(lockWritable(issues)).toBe(false);
  });
  it('잠긴 과제의 파일이 사라지면 LOCK_REMOVED(막는 문제). 내리려면 availability를 draft로 둔다', () => {
    const issues = checkLock(lock, now({ b: null }));
    expect(issues.map((i) => i.code)).toEqual(['LOCK_REMOVED']);
    expect(issues[0]!.message).toContain('availability를 draft');
    expect(lockWritable(issues)).toBe(false);
  });
  it('새 과제는 LOCK_NEW(기록하면 되는 문제)', () => {
    const issues = checkLock(lock, now({ c: { contentVersion: '0.1.0', hash: H2 } }));
    expect(issues.map((i) => i.code)).toEqual(['LOCK_NEW']);
    expect(lockWritable(issues)).toBe(true);
  });
  it('막는 문제의 종류는 정해져 있다', () => expect([...LOCK_HARD]).toEqual(['LOCK_CHANGED', 'LOCK_VERSION_DOWN', 'LOCK_REMOVED']));
  it('막는 문제와 기록하면 되는 문제가 함께 있어도 막는 문제가 있으면 쓰지 못한다', () => {
    const issues = checkLock(lock, now({ a: { contentVersion: '0.1.0', hash: H2 }, c: { contentVersion: '0.1.0', hash: H2 } }));
    expect(new Set(issues.map((i) => i.code))).toEqual(new Set(['LOCK_CHANGED', 'LOCK_NEW']));
    expect(lockWritable(issues)).toBe(false);
  });
});

describe('실제 콘텐츠', () => {
  it('저장소의 잠금 파일(content/content-lock.json)이 있고 지금 콘텐츠와 맞는다(공개 점검은 이 파일이 있어야 통과한다)', () => {
    const { lock, issues: shape } = loadLockFile(ROOT);
    expect(shape).toEqual([]);
    expect(lock, '잠금 파일이 없어요. `npm run lock:content`로 만들어요').not.toBeNull();
    expect(Object.keys(lock!.quests).sort()).toEqual(DEFS.map((d) => d.questId).sort());
    expect(validateLockDir(ROOT, { requireFile: true })).toEqual([]);
  });
  it('지금 콘텐츠로 만든 잠금은 지금 콘텐츠와 맞는다(과제 수와 판 번호 형식)', () => {
    const lock = buildLock(ROOT, '2026-11-13');
    expect(Object.keys(lock.quests).sort()).toEqual(DEFS.map((d) => d.questId).sort());
    expect(checkLock(lock, currentQuests(ROOT))).toEqual([]);
    expect(parseLock(JSON.parse(JSON.stringify(lock))).issues).toEqual([]);
  });
  it('실제 과제의 정답 기준을 바꾸면 잠금이 잡는다(대조: 판을 올리면 기록만 하면 된다)', () => {
    const lock = buildLock(ROOT, '2026-11-13');
    const cur = currentQuests(ROOT);
    const q = DEFS[0]!;
    const edited = clone(q);
    const first = Object.keys(edited.variants)[0]!;
    edited.variants[first]!.score.tempoBpm += 1;
    const after = { ...cur, [q.questId]: { contentVersion: q.contentVersion, hash: hashOfDef(edited) } };
    expect(checkLock(lock, after).map((i) => i.code)).toEqual(['LOCK_CHANGED']);
    const raised = { ...cur, [q.questId]: { contentVersion: '9.9.9', hash: hashOfDef(edited) } };
    expect(checkLock(lock, raised).map((i) => i.code)).toEqual(['LOCK_STALE']);
  });
});
