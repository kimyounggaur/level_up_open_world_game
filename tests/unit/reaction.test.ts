// 4-4 세계 반응: 등불, 지역의 소리 층, 합주 층수(6.1~6.3). 통과 기록과 다녀간 정거장에서 매번 계산하고, 늘어나기만 한다(W-6).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import {
  CHORD_STAGES,
  MAX_ENSEMBLE_LEVEL,
  MAX_NEWS_LINES,
  MAX_REGION_LAYER,
  appendNews,
  chordStageOf,
  computeReaction,
  describeChanges,
  ensembleLabel,
  hasAnyPass,
  lanternOf,
  layersOf,
  stationPassed,
  stationsOfQuest,
} from '@/domain/reaction';
import { REGION_IDS, WorldMap, parseRegion } from '@/domain/world';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'content', 'regions');
const map = new WorldMap(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => parseRegion(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).region!));

let n = 0;
/** 시도 하나. passed가 true면 통과, false면 틀린 시도 */
function attempt(questId: string, passed: boolean, over: { tempo?: number; assist?: boolean } = {}): AttemptResult {
  return makeAttemptResult({
    attemptId: `a${++n}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: passed
      ? { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} }
      : { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: false, issues: [{ code: 'MISSING_PLACEMENT', params: {} }], facts: {} },
    context: { tempoBpm: over.tempo ?? 80, originalTempoBpm: 80, assistUsed: over.assist ?? false, soundState: 'on', soundPlayed: true },
  } as never);
}

const Q01 = 'pitch.same-note-two-clefs';
const Q02 = 'rhythm.rest-in-a-bar';
const Q07 = 'scale.major';

describe('등불(6.1 다녀감, 해냄)', () => {
  const h4 = map.station('H4')!;

  it('꺼짐 → 켜짐 → 꽃등', () => {
    expect(lanternOf(h4, new Set(), new Set())).toBe('off');
    expect(lanternOf(h4, new Set(['H4']), new Set())).toBe('on');
    expect(lanternOf(h4, new Set(['H4']), new Set([Q07]))).toBe('flower');
  });

  it('다녀간 기록이 없어도 통과했으면 꽃등이다', () => {
    expect(lanternOf(h4, new Set(), new Set([Q07]))).toBe('flower');
  });

  it('이 정거장의 과제가 아닌 것을 통과해도 꽃등이 되지 않는다', () => {
    expect(stationPassed(h4, new Set([Q01]))).toBe(false);
    expect(lanternOf(h4, new Set(), new Set([Q01]))).toBe('off');
  });

  it('두 정거장에 놓인 과제는 두 정거장 모두 꽃등이 된다', () => {
    expect(stationsOfQuest(map, Q01).sort()).toEqual(['H1', 'N3']);
    expect(stationsOfQuest(map, Q02).sort()).toEqual(['E1', 'H2']);
    expect(stationsOfQuest(map, Q07).sort()).toEqual(['H4', 'S1']);
    const r = computeReaction(map, [attempt(Q01, true)]);
    expect(r.lanterns['H1']).toBe('flower');
    expect(r.lanterns['N3']).toBe('flower');
    expect(r.lanterns['H4']).toBe('off');
  });
});

describe('지역의 소리 층(6.2)', () => {
  it('통과한 서로 다른 과제가 1개, 2개, 3개 이상일 때 한 층씩 오른다', () => {
    expect([0, 1, 2, 3, 4, 9].map((c) => layersOf([1, 2, 3], c))).toEqual([0, 1, 2, 3, 3, 3]);
  });

  it('층은 3에서 멈춘다', () => {
    expect(MAX_REGION_LAYER).toBe(3);
    expect(layersOf([1, 2, 3], 31)).toBe(3);
  });

  it('같은 과제를 여러 번, 여러 판본으로 통과해도 한 개로 센다', () => {
    const r = computeReaction(map, [attempt(Q07, true), attempt(Q07, true), attempt(Q07, true)]);
    expect(r.regionLayers.village).toBe(1);
  });

  it('Q01 → Q02 → Q07을 차례로 통과하면 마을은 1층, 2층, 3층이 된다(4-4 완료 기준)', () => {
    const none = computeReaction(map, []);
    const one = computeReaction(map, [attempt(Q01, true)]);
    const two = computeReaction(map, [attempt(Q01, true), attempt(Q02, true)]);
    const three = computeReaction(map, [attempt(Q01, true), attempt(Q02, true), attempt(Q07, true)]);
    expect([none, one, two, three].map((r) => r.regionLayers.village)).toEqual([0, 1, 2, 3]);
  });

  it('Q01–Q07처럼 두 지역에 놓인 과제는 두 지역 모두에 센다', () => {
    const r = computeReaction(map, [attempt(Q01, true), attempt(Q02, true), attempt(Q07, true)]);
    expect(r.regionLayers['staff-hill']).toBe(1); // Q01(N3)
    expect(r.regionLayers['beat-river']).toBe(1); // Q02(E1)
    expect(r.regionLayers['scale-trail']).toBe(1); // Q07(S1)
    expect(r.regionLayers['bell-grove']).toBe(0);
    expect(r.regionLayers['key-marsh']).toBe(0);
  });
});

describe('합주 층수(6.3)', () => {
  it('여섯 지역의 층을 더한 수이고 0–18이다', () => {
    expect(MAX_ENSEMBLE_LEVEL).toBe(18);
    expect(computeReaction(map, []).ensembleLevel).toBe(0);
    const three = computeReaction(map, [attempt(Q01, true), attempt(Q02, true), attempt(Q07, true)]);
    expect(three.ensembleLevel).toBe(3 + 1 + 1 + 1);
    expect(REGION_IDS.reduce((s, id) => s + three.regionLayers[id], 0)).toBe(three.ensembleLevel);
  });

  it('"합주 ○층" 글자', () => {
    expect(ensembleLabel(0)).toBe('합주 0층');
    expect(ensembleLabel(6)).toBe('합주 6층');
  });
});

describe('W-6 한번 생기면 사라지지 않는다', () => {
  it('통과한 뒤 틀린 시도를 이어서 해도 층, 등불, 합주 층수는 그대로다', () => {
    const passed = [attempt(Q01, true), attempt(Q07, true)];
    const before = computeReaction(map, passed, ['H4']);
    const after = computeReaction(map, [...passed, attempt(Q01, false), attempt(Q07, false), attempt(Q07, false)], ['H4']);
    expect(after).toEqual(before);
  });

  it('도움을 쓰고 느리게 통과해도 원래 템포로 통과한 것과 같이 센다', () => {
    const slow = computeReaction(map, [attempt(Q07, true, { tempo: 40, assist: true })]);
    const normal = computeReaction(map, [attempt(Q07, true)]);
    expect(slow).toEqual(normal);
  });

  it('기록이 늘어날수록 어떤 값도 줄지 않는다(처음부터 하나씩 더해 가며 확인)', () => {
    const seq = [attempt(Q01, false), attempt(Q01, true), attempt(Q02, false), attempt(Q02, true), attempt(Q07, false), attempt(Q07, true), attempt(Q07, false)];
    let prev = computeReaction(map, []);
    for (let i = 1; i <= seq.length; i++) {
      const cur = computeReaction(map, seq.slice(0, i));
      expect(cur.ensembleLevel).toBeGreaterThanOrEqual(prev.ensembleLevel);
      for (const id of REGION_IDS) expect(cur.regionLayers[id]).toBeGreaterThanOrEqual(prev.regionLayers[id]);
      for (const s of map.stations) {
        const order = { off: 0, on: 1, flower: 2 } as const;
        expect(order[cur.lanterns[s.stationId]!]).toBeGreaterThanOrEqual(order[prev.lanterns[s.stationId]!]);
      }
      prev = cur;
    }
  });

  it('통과 기록이 없으면 층은 0이고 hasAnyPass는 false다', () => {
    expect(hasAnyPass([attempt(Q07, false)])).toBe(false);
    expect(hasAnyPass([attempt(Q07, false), attempt(Q07, true)])).toBe(true);
    expect(computeReaction(map, [attempt(Q07, false)]).regionLayers.village).toBe(0);
  });
});

describe('마을의 화음 깔기 단계(6.2 표)', () => {
  it('층 0–3이 없음, 온음표, 2분음표, 4분음표로 펼친 화음', () => {
    expect(CHORD_STAGES).toEqual(['none', 'whole', 'half', 'quarter']);
    expect([0, 1, 2, 3].map(chordStageOf)).toEqual(['none', 'whole', 'half', 'quarter']);
    expect(chordStageOf(9)).toBe('quarter');
    expect(chordStageOf(-1)).toBe('none');
  });
});

describe('변화를 사실 문장으로(W-9)', () => {
  it('Q07을 처음 통과하면 등불, 마을의 소리, 합주 층수가 바뀐다고만 말한다', () => {
    const before = computeReaction(map, [attempt(Q01, true), attempt(Q02, true)]);
    const after = computeReaction(map, [attempt(Q01, true), attempt(Q02, true), attempt(Q07, true)]);
    expect(describeChanges(map, before, after)).toEqual([
      '음계 디딤돌의 등불이 꽃등이 되었어요.',
      `${map.station('S1')!.name}의 등불이 꽃등이 되었어요.`,
      '음악 마을의 소리가 3층이 되었어요.',
      '음계 길의 소리가 1층이 되었어요.',
      '합주 6층이 되었어요.',
    ]);
  });

  it('바뀐 것이 없으면 아무 말도 하지 않는다', () => {
    const r = computeReaction(map, [attempt(Q07, true)]);
    expect(describeChanges(map, r, r)).toEqual([]);
  });

  it('처음 재료를 만지면 등불이 켜졌다고 말한다', () => {
    const before = computeReaction(map, []);
    const after = computeReaction(map, [], ['H4']);
    expect(describeChanges(map, before, after)).toEqual(['음계 디딤돌의 등불이 켜졌어요.']);
  });
});

describe('새 소식을 잇기(4-4, 화면에 쌓이는 줄을 줄인다)', () => {
  const none = computeReaction(map, []);
  const touched = computeReaction(map, [], ['H4', 'S1']);
  const passed = computeReaction(map, [attempt(Q07, true)], ['H4', 'S1']);
  const lit = describeChanges(map, none, touched);
  const flowers = describeChanges(map, touched, passed);

  it('재료를 놓은 뒤 통과하면 두 정거장의 켜졌어요는 거두고 꽃등이 되었어요만 남는다', () => {
    expect(lit).toEqual(['음계 디딤돌의 등불이 켜졌어요.', `${map.station('S1')!.name}의 등불이 켜졌어요.`]);
    const merged = appendNews(lit, flowers);
    expect(merged.some((l) => l.endsWith('켜졌어요.'))).toBe(false);
    expect(merged).toEqual(flowers);
    // 통과로 새로 생긴 소식은 하나도 잃지 않는다
    expect(merged).toEqual(expect.arrayContaining(flowers));
  });

  it('다른 정거장의 켜졌어요는 그대로 둔다', () => {
    const other = ['리듬 작업대의 등불이 켜졌어요.'];
    const merged = appendNews([...other, ...lit], flowers, 20);
    expect(merged.slice(0, 1)).toEqual(other);
    expect(merged.slice(1)).toEqual(flowers);
  });

  it('같은 문장은 한 번만 둔다', () => {
    expect(appendNews(lit, lit)).toEqual(lit);
    expect(appendNews([], [...flowers, ...flowers])).toEqual(flowers);
  });

  it('처음부터 꽃등이 되는 경우(켜졌어요 없이)는 그대로 이어진다', () => {
    expect(appendNews([], flowers)).toEqual(flowers);
  });

  it(`${MAX_NEWS_LINES}줄을 넘으면 오래된 것부터 밀려나고 마지막 소식이 남는다`, () => {
    const many = Array.from({ length: MAX_NEWS_LINES + 3 }, (_, i) => `소식 ${i}`);
    const out = appendNews([], many);
    expect(out).toHaveLength(MAX_NEWS_LINES);
    expect(out[out.length - 1]).toBe(many[many.length - 1]);
    expect(out[0]).toBe(many[many.length - MAX_NEWS_LINES]);
  });

  it('받은 목록을 바꾸지 않는다', () => {
    const before = [...lit];
    appendNews(lit, flowers);
    expect(lit).toEqual(before);
  });

  it('Q07 한 번의 통과로 생기는 소식은 한 화면에 다 들어간다', () => {
    const all = appendNews(appendNews([], lit), describeChanges(map, touched, passed));
    expect(all.length).toBeLessThanOrEqual(MAX_NEWS_LINES);
    expect(all[all.length - 1]).toBe('합주 2층이 되었어요.');
  });
});
