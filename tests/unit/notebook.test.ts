// 4-7 수첩의 순수 계산(6.5): 지역 쪽(열어 봄과 통과, 템포와 도움)과 관찰 문장.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { ContentCatalog } from '@/domain/catalog';
import type { Channel } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { DEFAULT_TEMPLATES } from '@/domain/feedback';
import type { Issue, IssueCode } from '@/domain/feedback';
import { FEW_TRIES_NOTE, ISSUE_GROUP, ISSUE_GROUP_NAME_KO, MAX_OBSERVED_QUESTS, OBSERVATION_WINDOW, buildRegionPages, isJudged, observe } from '@/domain/notebook';
import { WorldMap, parseRegion } from '@/domain/world';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const defs = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const map = new WorldMap(
  fs
    .readdirSync(path.join(root, 'content', 'regions'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => parseRegion(readJson('content', 'regions', f), f).region!),
);

const Q01 = 'pitch.same-note-two-clefs';
const Q02 = 'rhythm.rest-in-a-bar';
const Q07 = 'scale.major';
/** 5단계가 끝나면 마을의 다섯 정거장에 여덟 과제가 번호 차례로 놓인다 */
const VILLAGE_NUMBERS = ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08'];

const catalogOf = (channel: Channel = 'preview', list: readonly QuestDefinition[] = defs): ContentCatalog => new ContentCatalog(list, channel);

let n = 0;
interface Over {
  variant?: string;
  tempo?: number | null;
  original?: number | null;
  assist?: boolean;
  issues?: Issue[];
  sound?: 'on' | 'muted';
}
/** 확인한 시도 하나. issues가 있으면 고칠 곳이 나온 시도이고 없으면 통과다 */
function attempt(questId: string, over: Over = {}): AttemptResult {
  const issues = over.issues ?? [];
  const passed = issues.length === 0;
  return makeAttemptResult({
    attemptId: `a${++n}`,
    questId,
    variantId: over.variant ?? 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed, issues, facts: {} },
    context: { tempoBpm: over.tempo === undefined ? 80 : over.tempo, originalTempoBpm: over.original === undefined ? 80 : over.original, assistUsed: over.assist ?? false, soundState: over.sound ?? 'on', soundPlayed: (over.sound ?? 'on') === 'on' },
  } as never);
}
const issue = (code: IssueCode, position?: number): Issue => ({ code, params: {}, ...(position !== undefined ? { target: { position } } : {}) });
const unscored = (questId: string): AttemptResult => makeAttemptResult({ attemptId: `a${++n}`, questId, variantId: 'v', contentVersion: '0.1.0', evaluation: null, context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true } } as never);
const technical = (questId: string): AttemptResult =>
  makeAttemptResult({ attemptId: `a${++n}`, questId, variantId: 'v', contentVersion: '0.1.0', evaluation: null, technicalFailure: { kind: 'audio' }, context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'failed', soundPlayed: false } } as never);

/** 실제 과제를 베껴 id와 주제와 놓이는 곳을 바꾼 과제(만들지 않은 과제를 흉내 낸다) */
function clone(of: string, questId: string, over: Partial<QuestDefinition> = {}): QuestDefinition {
  const base = JSON.parse(JSON.stringify(defs.find((d) => d.questId === of)!)) as QuestDefinition;
  return { ...base, questId, ...over };
}

const input = (attempts: readonly AttemptResult[], opened: Iterable<string> = [], catalog = catalogOf()) => ({ catalog, map, attempts, opened: new Set(opened) });
const page = (pages: ReturnType<typeof buildRegionPages>, regionId: string) => pages.regions.find((r) => r.regionId === regionId)!;
const questOf = (pages: ReturnType<typeof buildRegionPages>, regionId: string, questId: string) => page(pages, regionId).quests.find((q) => q.questId === questId);

describe('지역 쪽(6.5)', () => {
  it('지역 쪽은 여섯 장이고 마을 쪽에는 그 지역 정거장에 놓인 과제가 번호 차례로 온다', () => {
    const pages = buildRegionPages(input([]));
    expect(pages.regions.map((r) => r.regionId)).toEqual(['village', 'staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh']);
    expect(page(pages, 'village').name).toBe('음악 마을');
    expect(page(pages, 'village').quests.map((q) => q.number)).toEqual(VILLAGE_NUMBERS);
    expect(pages.unplaced).toEqual([]);
  });

  it('만들지 않은 과제는 올리지 않는다. 남은 일의 개수도 만들지 않는다(6.7)', () => {
    const pages = buildRegionPages(input([]));
    // 정거장에는 아직 만들지 않은 과제(종나무 숲의 Q20–Q23 같은 것)도 적혀 있다. 박자 강가에는 만든 것만 올라온다: 징검다리와 잔물결 수로의 Q02, Q03, Q13–Q18, 물레방아의 Q19
    expect(map.stations.flatMap((s) => s.questIds)).toContain('chord.major-and-minor');
    const river = page(pages, 'beat-river').quests;
    expect(river.map((q) => q.questId)).toContain('rhythm.six-eight');
    expect(river.map((q) => q.number)).toEqual(['Q02', 'Q03', 'Q13', 'Q14', 'Q15', 'Q16', 'Q17', 'Q18', 'Q19']);
    // 어느 지역 쪽에도 만들지 않은 과제는 없다
    const built = new Set(defs.map((d) => d.questId));
    for (const r of pages.regions) for (const q of r.quests) expect(built.has(q.questId), q.questId).toBe(true);
    // 종나무 숲에는 만든 화음 과제(Q05, Q06, Q20–Q23)가 모두 올라온다
    expect(page(pages, 'bell-grove').quests.map((q) => q.number)).toEqual(['Q05', 'Q06', 'Q20', 'Q21', 'Q22', 'Q23']);
    const text = JSON.stringify(pages);
    expect(text).not.toMatch(/remaining|total|percent|score|rank|star|xp/i);
  });

  it('과제는 놓인 정거장의 이름을 달고, 같은 과제가 두 지역에 놓이면 두 쪽에 같은 기록이 나온다', () => {
    const attempts = [attempt(Q07, { variant: 'c-major' })];
    const pages = buildRegionPages(input(attempts));
    expect(questOf(pages, 'village', Q07)!.places).toEqual(['음계 디딤돌']);
    expect(questOf(pages, 'scale-trail', Q07)!.places).toEqual(['장음계 길']);
    const a = questOf(pages, 'village', Q07)!.variants.find((v) => v.variantId === 'c-major')!;
    const b = questOf(pages, 'scale-trail', Q07)!.variants.find((v) => v.variantId === 'c-major')!;
    expect(a.passes).toEqual(b.passes);
    expect(a.passes).toHaveLength(1);
  });

  it('열어 봄: 열어 본 과제 id가 있거나 시도 기록이 있으면 열어 본 것이다', () => {
    const none = buildRegionPages(input([]));
    expect(questOf(none, 'village', Q01)!.opened).toBe(false);
    const opened = buildRegionPages(input([], [Q01]));
    expect(questOf(opened, 'village', Q01)!.opened).toBe(true);
    expect(questOf(opened, 'village', Q02)!.opened).toBe(false);
    const tried = buildRegionPages(input([attempt(Q02, { variant: 'quarter-rest', issues: [issue('MISSING_EVENT')] })]));
    expect(questOf(tried, 'village', Q02)!.opened).toBe(true);
  });

  it('통과에는 템포와 도움 사용 여부가 함께 적힌다', () => {
    const pages = buildRegionPages(input([attempt(Q02, { variant: 'quarter-rest', tempo: 80, original: 80, assist: false })]));
    const v = questOf(pages, 'village', Q02)!.variants[0]!;
    expect(v.passes).toEqual([{ tempoBpm: 80, originalTempoBpm: 80, slower: false, assistUsed: false, count: 1 }]);
    expect(v.judged).toBe(1);
  });

  it('느린 템포의 통과를 원래 템포의 통과로 바꿔 적지 않는다: 방식마다 따로 센다', () => {
    const pages = buildRegionPages(
      input([
        attempt(Q02, { variant: 'quarter-rest', tempo: 60, original: 80, assist: true }), // 느리게 + 도움
        attempt(Q02, { variant: 'quarter-rest', tempo: 80, original: 80, assist: false }),
        attempt(Q02, { variant: 'quarter-rest', tempo: 60, original: 80, assist: true }), // 같은 방식은 합친다
        attempt(Q02, { variant: 'quarter-rest', tempo: 80, original: 80, assist: true }), // 원래 템포지만 도움을 쓴 통과
      ]),
    );
    const v = questOf(pages, 'village', Q02)!.variants[0]!;
    expect(v.passes).toEqual([
      { tempoBpm: 60, originalTempoBpm: 80, slower: true, assistUsed: true, count: 2 },
      { tempoBpm: 80, originalTempoBpm: 80, slower: false, assistUsed: false, count: 1 },
      { tempoBpm: 80, originalTempoBpm: 80, slower: false, assistUsed: true, count: 1 },
    ]);
  });

  it('고칠 곳이 나온 시도는 통과로 세지 않는다. 기술 문제와 판정하지 않은 시도는 확인으로도 세지 않는다(W-8)', () => {
    const pages = buildRegionPages(
      input([
        attempt(Q02, { variant: 'quarter-rest', issues: [issue('MISSING_EVENT')] }),
        technical(Q02),
        unscored(Q02),
        attempt(Q02, { variant: 'quarter-rest', sound: 'muted' }), // 소리를 꺼도 통과는 통과다
      ].map((a, i) => (i === 1 || i === 2 ? { ...a, variantId: 'quarter-rest' } : a))),
    );
    const v = questOf(pages, 'village', Q02)!.variants[0]!;
    expect(v.judged).toBe(2);
    expect(v.passes.reduce((s, p) => s + p.count, 0)).toBe(1);
    expect(isJudged(technical(Q02))).toBe(false);
    expect(isJudged(unscored(Q02))).toBe(false);
  });

  it('판본마다 따로 센다', () => {
    const pages = buildRegionPages(input([attempt(Q07, { variant: 'c-major' }), attempt(Q07, { variant: 'f-major', issues: [issue('WRONG_PITCH', 4)] })]));
    const q = questOf(pages, 'village', Q07)!;
    expect(q.variants.map((v) => v.variantId)).toEqual(['c-major', 'f-major', 'g-major', 'd-major', 'bflat-major']);
    expect(q.variants.map((v) => [v.judged, v.passes.length])).toEqual([[1, 1], [1, 0], [0, 0], [0, 0], [0, 0]]);
  });

  it('공개 상태가 바뀌어도 통과 기록은 사라지지 않는다(W-6): 기록이 없는 준비 중 판본만 빠진다', () => {
    const release = catalogOf('release'); // 초안(draft)은 release에서 '준비 중'이다
    const empty = buildRegionPages(input([], [], release));
    expect(page(empty, 'village').quests).toEqual([]);
    const recorded = buildRegionPages(input([attempt(Q07, { variant: 'c-major' })], [], release));
    const q = questOf(recorded, 'village', Q07)!;
    expect(q.variants.map((v) => v.variantId)).toEqual(['c-major']);
    expect(q.variants[0]!.passes).toHaveLength(1);
    expect(page(recorded, 'village').quests.map((x) => x.questId)).toEqual([Q07]);
  });

  it('어느 정거장에도 놓이지 않은 과제는 따로 모은다', () => {
    const orphan = clone(Q07, 'scale.orphan', { title: '떠도는 과제' });
    const catalog = catalogOf('preview', [...defs, orphan]);
    const pages = buildRegionPages(input([], [], catalog));
    expect(pages.unplaced.map((q) => q.questId)).toEqual(['scale.orphan']);
    expect(pages.unplaced[0]!.places).toEqual([]);
  });

  it('계획에 없는 과제는 번호가 없고, 정거장에 놓이지 않았으면 지역 쪽이 아니라 그 밖에 모인다', () => {
    const extra = clone(Q07, 'scale.extra', { title: '계획에 없는 과제' });
    const pages = buildRegionPages(input([], [], catalogOf('preview', [extra, ...defs])));
    expect(page(pages, 'village').quests.map((q) => q.number)).toEqual(VILLAGE_NUMBERS);
    expect(pages.unplaced.map((q) => q.number)).toEqual([null]);
  });
});

const R = (code: IssueCode, position?: number): Issue => issue(code, position);

describe('관찰(6.5)', () => {
  const titleOf = (id: string): string => catalogOf().get(id)?.title ?? id;

  it('확인한 시도가 없으면 관찰도 없다(기술 문제와 판정하지 않은 시도는 확인이 아니다)', () => {
    expect(observe([], titleOf)).toEqual([]);
    expect(observe([technical(Q02), unscored(Q02)], titleOf)).toEqual([]);
  });

  it('가장 최근의 확인 세 번만 살핀다', () => {
    const list = [attempt(Q07, { issues: [R('WRONG_PITCH')] }), attempt(Q07, { issues: [R('WRONG_PITCH')] }), attempt(Q07), attempt(Q07), attempt(Q07)];
    const [o] = observe(list, titleOf);
    expect(o!.checks).toBe(OBSERVATION_WINDOW);
    expect(o!.sentences).toEqual(['최근 3번 확인했고, 모두 통과했어요.']);
    expect(o!.note).toBeNull();
  });

  it('요약 문장: 통과와 고칠 곳이 나온 횟수를 사실로만 적는다', () => {
    const only = (list: AttemptResult[]): string => observe(list, titleOf)[0]!.sentences[0]!;
    expect(only([attempt(Q07)])).toBe('최근 1번 확인했어요. 통과했어요.');
    expect(only([attempt(Q07, { issues: [R('WRONG_PITCH')] })])).toBe('최근 1번 확인했어요. 고칠 곳이 나왔어요.');
    expect(only([attempt(Q07, { issues: [R('WRONG_PITCH')] }), attempt(Q07, { issues: [R('WRONG_PITCH')] })])).toBe('최근 2번 확인했고, 모두 고칠 곳이 나왔어요.');
    expect(only([attempt(Q07, { issues: [R('WRONG_PITCH')] }), attempt(Q07), attempt(Q07, { issues: [R('WRONG_ORDER')] })])).toBe('최근 3번 확인했어요. 통과 1번, 고칠 곳이 나온 것 2번이에요.');
  });

  it('같은 종류의 고칠 곳이 두 번 이상 나왔을 때만 따로 적는다: 쉼표 자리', () => {
    const list = [
      attempt(Q02, { issues: [R('REST_EXPECTED_NOTE_FOUND'), R('NOTE_EXPECTED_REST_FOUND')] }), // 한 확인 안에서 둘이어도 한 번
      attempt(Q02, { issues: [R('DURATION_MISMATCH')] }),
      attempt(Q02, { issues: [R('NOTE_EXPECTED_REST_FOUND')] }),
    ];
    const [o] = observe(list, titleOf);
    expect(o!.sentences).toEqual(['최근 3번 확인했고, 모두 고칠 곳이 나왔어요.', '쉼표 자리가 2번 고칠 곳으로 나왔어요.']);
  });

  it('한 번만 나온 고칠 곳은 따로 적지 않는다', () => {
    const list = [attempt(Q02, { issues: [R('DURATION_MISMATCH')] }), attempt(Q02, { issues: [R('MISSING_EVENT')] }), attempt(Q02)];
    const [o] = observe(list, titleOf);
    expect(o!.sentences).toHaveLength(1);
  });

  it('같은 자리가 두 번 이상 나왔을 때 그 자리를 적는다', () => {
    const list = [attempt(Q07, { issues: [R('WRONG_SPELLING_SAME_PITCH', 4)] }), attempt(Q07, { issues: [R('WRONG_PITCH', 4), R('WRONG_PITCH', 6)] }), attempt(Q07, { issues: [R('WRONG_PITCH', 6)] })];
    const [o] = observe(list, titleOf);
    expect(o!.sentences).toEqual([
      '최근 3번 확인했고, 모두 고칠 곳이 나왔어요.',
      '음의 높이가 2번 고칠 곳으로 나왔어요.',
      '4번째 자리가 2번 고칠 곳으로 나왔어요.',
      '6번째 자리가 2번 고칠 곳으로 나왔어요.',
    ]);
  });

  it('같은 횟수일 때는 묶음의 차례, 자리 번호 차례로 늘어놓는다', () => {
    const list = [attempt(Q07, { issues: [R('WRONG_ORDER', 2), R('OCTAVE_MISMATCH', 5)] }), attempt(Q07, { issues: [R('WRONG_ORDER', 2), R('OCTAVE_MISMATCH', 5)] })];
    const [o] = observe(list, titleOf);
    expect(o!.sentences.slice(1)).toEqual(['옥타브가 2번 고칠 곳으로 나왔어요.', '음의 차례가 2번 고칠 곳으로 나왔어요.', '2번째 자리가 2번 고칠 곳으로 나왔어요.', '5번째 자리가 2번 고칠 곳으로 나왔어요.']);
  });

  it('시도가 세 번보다 적으면 "적은 시도에서 관찰"이라고 밝힌다', () => {
    expect(observe([attempt(Q07)], titleOf)[0]!.note).toBe(FEW_TRIES_NOTE);
    expect(FEW_TRIES_NOTE).toBe('적은 시도에서 관찰');
    expect(observe([attempt(Q07), attempt(Q07)], titleOf)[0]!.note).toBe(FEW_TRIES_NOTE);
    expect(observe([attempt(Q07), attempt(Q07), attempt(Q07)], titleOf)[0]!.note).toBeNull();
  });

  it('가장 최근에 확인한 과제부터, 최대 다섯 과제를 적고 과제 이름을 붙인다', () => {
    const ids = ['a.1', 'a.2', 'a.3', 'a.4', 'a.5', 'a.6', 'a.7'];
    const list = ids.map((id) => attempt(id));
    list.push(attempt('a.2')); // a.2를 다시 확인하면 가장 최근이 된다
    const out = observe(list, (id) => `이름 ${id}`);
    expect(out).toHaveLength(MAX_OBSERVED_QUESTS);
    expect(out.map((o) => o.questId)).toEqual(['a.2', 'a.7', 'a.6', 'a.5', 'a.4']);
    expect(out[0]!.title).toBe('이름 a.2');
    expect(out[0]!.checks).toBe(2);
  });

  it('과제가 달라도 판본이 달라도 한 과제로 본다', () => {
    const list = [attempt(Q07, { variant: 'c-major', issues: [R('WRONG_PITCH', 3)] }), attempt(Q07, { variant: 'f-major', issues: [R('WRONG_PITCH', 3)] })];
    const [o] = observe(list, titleOf);
    expect(o!.checks).toBe(2);
    expect(o!.sentences).toContain('3번째 자리가 2번 고칠 곳으로 나왔어요.');
  });

  it('사실만 말한다: 칭찬, 능력 짐작, 해야 할 일을 만들지 않는다(W-9)', () => {
    const scenarios: AttemptResult[][] = [
      [attempt(Q07)],
      [attempt(Q07), attempt(Q07), attempt(Q07)],
      [attempt(Q07, { issues: [R('WRONG_PITCH', 4)] }), attempt(Q07, { issues: [R('WRONG_PITCH', 4)] }), attempt(Q07)],
      [attempt(Q02, { issues: [R('REST_EXPECTED_NOTE_FOUND')] }), attempt(Q02, { issues: [R('REST_EXPECTED_NOTE_FOUND')] })],
    ];
    const all = scenarios.flatMap((s) => observe(s, titleOf).flatMap((o) => [o.title, o.note ?? '', ...o.sentences])).join('\n');
    expect(all).not.toMatch(/잘|못했|훌륭|실력|부족|대단|축하|칭찬|좋아|해야|하세요|해 보세요|약해|어려워/);
    expect(all).not.toMatch(/[!！]/);
  });

  it('모든 판정 이유 코드가 읽는 묶음에 들어 있고, 묶음마다 이름이 있다', () => {
    const codes = Object.keys(DEFAULT_TEMPLATES) as IssueCode[];
    for (const code of codes) expect(ISSUE_GROUP[code], code).toBeDefined();
    for (const g of new Set(Object.values(ISSUE_GROUP))) expect(ISSUE_GROUP_NAME_KO[g], g).toBeTruthy();
    expect(Object.keys(ISSUE_GROUP).sort()).toEqual([...codes].sort());
  });
});
