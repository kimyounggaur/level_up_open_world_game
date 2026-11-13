// 4-7 추천 첫 판(6.6): 목록의 순서를 바꾸고 이유 한 줄을 붙이는 일만 한다. 막거나 경고하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { ContentCatalog } from '@/domain/catalog';
import type { QuestEntry } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { MAX_PER_RULE, REPEATED_REVISIONS, arrange, practiceLinksFrom, recommend } from '@/domain/recommend';
import type { RecommendInput } from '@/domain/recommend';
import { PLANNED_QUESTS, WorldMap, parseRegion } from '@/domain/world';
import { topicName } from '@/ui/common/format';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
/** 지금 만든 과제 전체(5단계가 끝나면 여덟 개) */
const allDefs = fs
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
/**
 * 규칙 시험은 과제 세 개(Q01, Q02, Q07)만 있는 고정된 상태에서 한다. 과제가 늘어도 규칙 시험의 기대가 바뀌지 않게 하려는 것이다.
 * 실제 내용 전체로 하는 시험은 맨 아래 '실제 콘텐츠'에 따로 있다.
 */
const defs = allDefs.filter((d) => [Q01, Q02, Q07].includes(d.questId));
const catalog = new ContentCatalog(defs, 'preview');

let n = 0;
function attempt(questId: string, revised: boolean): AttemptResult {
  return makeAttemptResult({
    attemptId: `a${++n}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: !revised, issues: revised ? [{ code: 'WRONG_PITCH', params: {} }] : [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);
}
const technical = (questId: string): AttemptResult =>
  makeAttemptResult({ attemptId: `a${++n}`, questId, variantId: 'v', contentVersion: '0.1.0', evaluation: null, technicalFailure: { kind: 'audio' }, context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'failed', soundPlayed: false } } as never);

function clone(of: string, questId: string, over: Partial<QuestDefinition> = {}): QuestDefinition {
  const base = JSON.parse(JSON.stringify(defs.find((d) => d.questId === of)!)) as QuestDefinition;
  return { ...base, questId, title: `${base.title} (${questId})`, ...over };
}

const base = (over: Partial<RecommendInput> = {}): RecommendInput => ({ catalog, map, attempts: [], opened: new Set(), currentQuestId: null, regionId: null, topicName, ...over });

describe('규칙 3: 지금 있는 지역에서 아직 열어 보지 않은 과제', () => {
  it('마을에서 아무것도 열지 않았으면 마을 정거장의 차례로 올린다', () => {
    const recs = recommend(base({ regionId: 'village' }));
    expect(recs.map((r) => r.questId)).toEqual([Q01, Q02, Q07]);
    expect(recs.every((r) => r.reason === 'unopenedHere')).toBe(true);
    expect(recs[0]!.text).toBe('지금 있는 음악 마을에서 아직 열어 보지 않은 도전이에요.');
  });

  it('열어 본 과제는 올리지 않는다', () => {
    const recs = recommend(base({ regionId: 'village', opened: new Set([Q01, Q07]) }));
    expect(recs.map((r) => r.questId)).toEqual([Q02]);
  });

  it('지역을 모르면 이 규칙은 아무것도 올리지 않는다', () => {
    expect(recommend(base({ regionId: null }))).toEqual([]);
  });

  it('그 지역에 만든 과제가 없으면 아무것도 올리지 않는다', () => {
    expect(recommend(base({ regionId: 'bell-grove' }))).toEqual([]);
  });

  it('다른 지역의 열어 보지 않은 과제는 올리지 않는다', () => {
    const recs = recommend(base({ regionId: 'scale-trail' }));
    expect(recs.map((r) => r.questId)).toEqual([Q07]);
    expect(recs[0]!.text).toContain('음계 길');
  });
});

describe('규칙 2: 최근에 여러 번 고친 항목과 주제가 같은 과제', () => {
  const twin = clone(Q07, 'scale.pentatonic', { title: '다섯 음 음계', topicTags: ['scale', 'pentatonic'] });
  const other = clone(Q02, 'rhythm.other', { title: '다른 리듬', topicTags: ['rhythm'] });
  const withTwin = new ContentCatalog([...defs, twin, other], 'preview');

  it(`최근 3번 안에 고칠 곳이 ${REPEATED_REVISIONS}번 이상 나온 과제와 주제 태그가 겹치는 다른 과제를 올린다`, () => {
    const recs = recommend(base({ catalog: withTwin, attempts: [attempt(Q07, true), attempt(Q07, true)] }));
    expect(recs).toEqual([{ questId: 'scale.pentatonic', reason: 'sameTopic', text: "'장음계 배열하기'에서 고칠 곳이 여러 번 나왔어요. 같은 주제(음계)의 도전이에요." }]);
  });

  it('겹치는 주제를 모두 이름으로 적는다', () => {
    const twin2 = clone(Q07, 'scale.twin2', { title: '쌍둥이', topicTags: ['scale', 'major'] });
    const recs = recommend(base({ catalog: new ContentCatalog([...defs, twin2], 'preview'), attempts: [attempt(Q07, true), attempt(Q07, true)] }));
    expect(recs[0]!.text).toContain('같은 주제(음계, 장음계)');
  });

  it('한 번만 고쳤으면 올리지 않는다', () => {
    expect(recommend(base({ catalog: withTwin, attempts: [attempt(Q07, true), attempt(Q07, false)] }))).toEqual([]);
  });

  it('통과 기록이 뒤따라 최근 3번 안에서 고친 것이 한 번뿐이면 올리지 않는다', () => {
    const list = [attempt(Q07, true), attempt(Q07, true), attempt(Q07, false), attempt(Q07, false)];
    expect(recommend(base({ catalog: withTwin, attempts: list }))).toEqual([]);
  });

  it('기술 문제는 고친 것으로 세지 않는다(W-8)', () => {
    expect(recommend(base({ catalog: withTwin, attempts: [attempt(Q07, true), technical(Q07), technical(Q07)] }))).toEqual([]);
  });

  it('주제가 겹치지 않는 과제나 그 과제 자신은 올리지 않는다', () => {
    const recs = recommend(base({ catalog: withTwin, attempts: [attempt(Q07, true), attempt(Q07, true)] }));
    expect(recs.map((r) => r.questId)).not.toContain('rhythm.other');
    expect(recs.map((r) => r.questId)).not.toContain(Q07);
  });
});

describe('규칙 1: 지금 하는 과제에 연결된 기본 연습', () => {
  it('설계서의 연결: Q08에서 Q02, Q03, Q05로. 연결은 과제 콘텐츠에 적혀 있다', () => {
    const links = practiceLinksFrom(new ContentCatalog(allDefs, 'preview'));
    expect(links['song.short-piece']!.map((id) => PLANNED_QUESTS[id]!.number)).toEqual(['Q02', 'Q03', 'Q05']);
    // Q08 말고는 이은 연습이 없다
    expect(Object.keys(links)).toEqual(['song.short-piece']);
  });

  it('연습으로 이은 연결만 센다: 듣기 도움 같은 다른 연결은 연습이 아니다', () => {
    const q08 = clone(Q07, 'song.short-piece', { assistanceLinks: [{ type: 'listenBar', label: '소리 듣기' }, { type: 'practice', label: '쉼표 연습', questId: Q02 }] });
    expect(practiceLinksFrom(new ContentCatalog([...defs, q08], 'preview'))).toEqual({ 'song.short-piece': [Q02] });
    expect(practiceLinksFrom(catalog)).toEqual({});
  });

  it('지금 하는 과제의 기본 연습을 올린다(과제가 목록에 있을 때)', () => {
    const q08 = clone(Q07, 'song.short-piece', { title: '선택한 짧은 곡 완성하기', topicTags: ['ensemble'], assistanceLinks: [{ type: 'practice', label: '쉼표 연습', questId: Q02 }] });
    const recs = recommend(base({ catalog: new ContentCatalog([...defs, q08], 'preview'), currentQuestId: 'song.short-piece' }));
    expect(recs).toEqual([{ questId: Q02, reason: 'practice', text: "지금 하는 '선택한 짧은 곡 완성하기'에 이어진 기본 연습이에요." }]);
  });

  it('연결표를 바꿔 쓸 수 있고, 만들지 않은 연습은 올리지 않는다', () => {
    const recs = recommend(base({ currentQuestId: Q07, practiceLinks: { [Q07]: [Q01, 'chord.major-triad', Q02] } }));
    expect(recs.map((r) => r.questId)).toEqual([Q01, Q02]);
    expect(recs.every((r) => r.reason === 'practice')).toBe(true);
  });

  it('지금 하는 과제가 없거나 연결이 없으면 아무것도 올리지 않는다', () => {
    expect(recommend(base({ currentQuestId: null }))).toEqual([]);
    expect(recommend(base({ currentQuestId: Q07 }))).toEqual([]);
  });
});

describe('규칙을 합치기', () => {
  it('규칙 1, 2, 3의 차례로 올리고 앞 규칙이 올린 과제를 뒤 규칙이 다시 올리지 않는다', () => {
    const twin = clone(Q07, 'scale.twin', { title: '쌍둥이', topicTags: ['scale'] });
    const cat = new ContentCatalog([...defs, twin], 'preview');
    const recs = recommend(base({ catalog: cat, currentQuestId: Q01, practiceLinks: { [Q01]: [Q02] }, attempts: [attempt(Q07, true), attempt(Q07, true)], regionId: 'village', opened: new Set([Q01]) }));
    expect(recs.map((r) => [r.questId, r.reason])).toEqual([
      [Q02, 'practice'],
      ['scale.twin', 'sameTopic'],
      [Q07, 'unopenedHere'], // Q02는 규칙 1이 이미 올렸다
    ]);
  });

  it(`규칙마다 ${MAX_PER_RULE}개까지만 올린다`, () => {
    const many = Array.from({ length: 6 }, (_, i) => clone(Q07, `scale.many${i}`, { title: `많은 ${i}`, topicTags: ['scale'] }));
    const cat = new ContentCatalog([...defs, ...many], 'preview');
    const recs = recommend(base({ catalog: cat, attempts: [attempt(Q07, true), attempt(Q07, true)] }));
    expect(recs).toHaveLength(MAX_PER_RULE);
    expect(recs.map((r) => r.questId)).toEqual(['scale.many0', 'scale.many1', 'scale.many2']);
  });

  it('열 수 없는 과제는 올리지 않는다(화면이 없거나 준비 중)', () => {
    const recs = recommend(base({ regionId: 'village', openable: (e: QuestEntry) => e.questId !== Q02 }));
    expect(recs.map((r) => r.questId)).toEqual([Q01, Q07]);
    const release = new ContentCatalog(defs, 'release'); // 초안은 release에서 준비 중이다
    expect(recommend(base({ catalog: release, regionId: 'village' }))).toEqual([]);
  });

  it('이유 문장은 일어난 일과 놓인 자리만 말한다(W-9)', () => {
    const twin = clone(Q07, 'scale.twin', { title: '쌍둥이', topicTags: ['scale'] });
    const cat = new ContentCatalog([...defs, twin], 'preview');
    const recs = recommend(base({ catalog: cat, currentQuestId: Q01, practiceLinks: { [Q01]: [Q02] }, attempts: [attempt(Q07, true), attempt(Q07, true)], regionId: 'village' }));
    const text = recs.map((r) => r.text).join('\n');
    expect(text).not.toMatch(/잘|못했|훌륭|실력|부족|대단|축하|칭찬|좋아|해야|하세요|해 보세요|약해|어려워|위험|주의|경고/);
    expect(text).not.toMatch(/[!！]/);
  });
});

describe('목록의 순서 바꾸기', () => {
  const entries = catalog.list();
  const rec = (questId: string, reason: 'practice' | 'sameTopic' | 'unopenedHere', text: string) => ({ questId, reason, text });

  it('추천이 없으면 순서도 이유도 그대로다', () => {
    const out = arrange(entries, []);
    expect(out.map((a) => a.entry.questId)).toEqual(entries.map((e) => e.questId));
    expect(out.every((a) => a.note === null && a.reason === null)).toBe(true);
  });

  it('추천된 것을 추천의 차례대로 앞에 두고 나머지는 원래 차례대로 둔다. 아무것도 빼지 않는다', () => {
    const out = arrange(entries, [rec(Q07, 'unopenedHere', '이유 7'), rec(Q02, 'sameTopic', '이유 2')]);
    expect(out.map((a) => a.entry.questId)).toEqual([Q07, Q02, ...entries.map((e) => e.questId).filter((id) => id !== Q07 && id !== Q02)]);
    expect(out.map((a) => a.note)).toEqual(['이유 7', '이유 2', null]);
    expect(out).toHaveLength(entries.length);
    expect(new Set(out.map((a) => a.entry.questId)).size).toBe(entries.length);
  });

  it('거르기로 줄어든 목록에는 그 안에 있는 것만 다룬다', () => {
    const shown = catalog.filter({ tag: 'scale' });
    const out = arrange(shown, [rec(Q02, 'practice', '이 목록에 없다'), rec(Q07, 'practice', '이유')]);
    expect(out.map((a) => a.entry.questId)).toEqual([Q07]);
    expect(out[0]!.note).toBe('이유');
  });

  it('같은 과제가 두 번 추천되어도 한 번만 나온다', () => {
    const out = arrange(entries, [rec(Q07, 'practice', '먼저'), rec(Q07, 'unopenedHere', '나중')]);
    expect(out.filter((a) => a.entry.questId === Q07)).toHaveLength(1);
    expect(out[0]!.note).toBe('먼저');
  });
});

describe('실제 콘텐츠 전체(5단계 이후)', () => {
  const full = new ContentCatalog(allDefs, 'preview');

  it('마을에서 아무것도 열지 않았으면 마을 정거장의 차례로 세 개를 올린다: 음자리 작업대의 둘, 리듬 작업대의 첫째', () => {
    const recs = recommend(base({ catalog: full, regionId: 'village' }));
    expect(recs.map((r) => PLANNED_QUESTS[r.questId]!.number)).toEqual(['Q01', 'Q04', 'Q02']);
    expect(recs.every((r) => r.reason === 'unopenedHere')).toBe(true);
  });

  it('설계서의 연결(Q08에서 Q02, Q03, Q05로)이 실제 과제로 모두 올라온다', () => {
    const recs = recommend(base({ catalog: full, currentQuestId: 'song.short-piece' }));
    expect(recs.map((r) => [PLANNED_QUESTS[r.questId]!.number, r.reason])).toEqual([
      ['Q02', 'practice'],
      ['Q03', 'practice'],
      ['Q05', 'practice'],
    ]);
    expect(recs[0]!.text).toBe("지금 하는 '선택한 짧은 곡 완성하기'에 이어진 기본 연습이에요.");
  });

  it('만든 과제가 모두 추천 대상이 된다(마을을 모두 열어 보면 더 올릴 것이 없다)', () => {
    const opened = new Set(allDefs.map((d) => d.questId));
    expect(recommend(base({ catalog: full, regionId: 'village', opened }))).toEqual([]);
    // 범위 A의 여덟 과제와 6단계에서 더한 박자 강가의 과제(Q13–Q19), 종나무 숲의 과제(Q20–Q23), 7단계의 오선 언덕 과제(Q09–Q12)·음계 길 과제(Q24–Q26)·건반 늪 과제(Q27–Q31)
    expect(allDefs.map((d) => PLANNED_QUESTS[d.questId]!.number).sort()).toEqual(['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q11', 'Q12', 'Q13', 'Q14', 'Q15', 'Q16', 'Q17', 'Q18', 'Q19', 'Q20', 'Q21', 'Q22', 'Q23', 'Q24', 'Q25', 'Q26', 'Q27', 'Q28', 'Q29', 'Q30', 'Q31']);
  });
});
