// 5-4 합주 무대(T7)의 계산: 바닥 칸(성부 줄 × 마디), 칸의 채움, 판정 느낌표의 자리, 듣기 범위, 곡 길이.
// 화면과 소리 장치 없이 확인한다. 연결 검사(설치물 파일 ↔ 과제 Q08)도 여기서 덮는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { draftScoreOf, evaluateDraft } from '@/domain/challenge';
import type { QuestDefinition, QuestVariant } from '@/domain/content';
import { ALL_SCOPE, FREE_MELODY_LABEL, flaggedStageSlots, freeMelodyVariant, playingStageSlots, sameScope, scopeName, scopeSection, scopedPlayback, songLengthTicks, stageCellOfSlot, stageCellViews, stageCells, stageLayoutOf, stageSlotOf, usedVoiceIds } from '@/domain/ensemble';
import type { ListenScope, StageLayout } from '@/domain/ensemble';
import type { Issue } from '@/domain/feedback';
import { ARCHETYPE_CODES, installationOfStation, parseInstallation, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { scoreToPlayback } from '@/domain/playback';
import { ChallengeSession } from '@/domain/session';
import { measureCellsOf, isArrangementVariant, placeOnTimeline, timelineOf } from '@/domain/timeline';
import type { TimelineMaterial } from '@/domain/timeline';
import { WorldMap, parseRegion } from '@/domain/world';
import type { RegionDef } from '@/domain/world';
import { INTERACT_RANGE } from '@/domain/world';
import { validateContentDir } from '../../tools/content-loader';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...parts: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf-8'));
const raw = readJson('content', 'installations', 'inst.village.ensemble-stage.json') as Record<string, unknown>;
const quests = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const q08 = quests.find((q) => q.questId === 'song.short-piece')!;
const regions: RegionDef[] = fs
  .readdirSync(path.join(root, 'content', 'regions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseRegion(readJson('content', 'regions', f), f).region!);
const map = new WorldMap(regions);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const load = (data: unknown = raw): InstallationDef => {
  const { installation, issues } = parseInstallation(data, 'x.json');
  expect(issues).toEqual([]);
  return installation!;
};
const codes = (list: InstallationDef[], ctx = { map, quests }): string[] => validateInstallationSet(list, ctx).map((i) => i.code);

const stage = load();
const layout = stageLayoutOf(stage)!;
const one = q08.variants['one-voice']!;
const two = q08.variants['two-voices']!;
const hard = q08.variants['challenge']!;

type Value = 'whole' | 'half' | 'quarter' | 'eighth';
const valueOf = (ticks: number): Value => (ticks === 3840 ? 'whole' : ticks === 1920 ? 'half' : ticks === 960 ? 'quarter' : 'eighth');

function open(variantId: string): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(q08.questId, variantId);
  return s;
}

/** 정답 악보의 사건 하나를 시간선으로 놓는다. 놓기가 거절되면 시험이 실패한다 */
function putEvent(s: ChallengeSession, variant: QuestVariant, e: QuestVariant['score']['events'][number], pitchName?: string): void {
  const mat: TimelineMaterial =
    e.type === 'note' ? { kind: 'note', pitch: p(pitchName ?? `${e.writtenPitch.letter}${e.writtenPitch.octave}`), value: valueOf(e.durationTicks) } : { kind: 'rest', value: valueOf(e.durationTicks) };
  const r = placeOnTimeline(timelineOf(variant), s.content(), { voiceId: e.voiceId, measureIndex: e.measureIndex, tick: e.onsetTicks }, mat);
  if (!r.ok) throw new Error(`놓기가 거절됐어요: ${r.text}`);
  s.apply(r.edit);
}

/** 초안이 지금 그리고 있는 악보. 소리 듣기가 쓰는 것과 같다 */
const scoreOf = (s: ChallengeSession, variant: QuestVariant) => draftScoreOf(variant.score, s.content());

/** 정답 악보에서 고른 성부(없으면 모두)와 마디(없으면 모두)를 놓는다 */
function fill(s: ChallengeSession, variant: QuestVariant, opts: { voices?: string[]; measures?: number[] } = {}): void {
  for (const e of variant.score.events) {
    if (opts.voices && !opts.voices.includes(e.voiceId)) continue;
    if (opts.measures && !opts.measures.includes(e.measureIndex)) continue;
    putEvent(s, variant, e);
  }
}

describe('H5 합주 무대 설치물 파일(부록 A.2)', () => {
  it('정거장 H5, 마을, 합주 무대(T7), 쌍둥이 패널 panel.song', () => {
    expect(stage.installationId).toBe('inst.village.ensemble-stage');
    expect(stage.stationCode).toBe('H5');
    expect(stage.regionId).toBe('village');
    expect(stage.archetype).toBe('ensembleStage');
    expect(ARCHETYPE_CODES[stage.archetype]).toBe('T7');
    expect(stage.name).toBe('합주 무대');
    expect(stage.panelTwin).toBe('panel.song');
    expect(stage.signatureSoundId).toBe('sig.village.ensemble-stage');
    expect(installationOfStation([stage], 'H5')).toBe(stage);
  });

  it('과제 Q08의 세 판본이 모두 이 무대에서 열린다', () => {
    expect(stage.quests).toEqual([{ questId: 'song.short-piece', variantIds: ['one-voice', 'two-voices', 'challenge'] }]);
  });

  it('바닥은 두 성부 줄 × 네 마디 칸 = 8칸이고, 한 줄을 왼쪽에서 오른쪽으로 읽고 다음 줄로 넘어간다', () => {
    expect(stage.slotMap).toEqual({
      kind: 'stageCells',
      rows: [
        { voiceId: 'v1', label: '위 성부' },
        { voiceId: 'v2', label: '아래 성부' },
      ],
      measures: 4,
    });
    expect(stage.slots).toHaveLength(8);
    expect(stage.slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 같은 줄은 같은 높이, 마디가 갈수록 오른쪽. 아래 줄은 바로 아래
    for (let i = 0; i < 3; i++) {
      expect(stage.slots[i + 1]!.y).toBe(stage.slots[i]!.y);
      expect(stage.slots[i + 1]!.x).toBeGreaterThan(stage.slots[i]!.x + stage.slots[i]!.w - 1);
      expect(stage.slots[i + 5]!.y).toBe(stage.slots[i + 4]!.y);
    }
    for (let m = 0; m < 4; m++) expect(stage.slots[m + 4]!.x).toBe(stage.slots[m]!.x);
    expect(stage.slots[4]!.y).toBeGreaterThanOrEqual(stage.slots[0]!.y + stage.slots[0]!.h);
  });

  it('상호작용 점이 정거장 점에서 96 px 안이다', () => {
    const st = map.station('H5')!;
    expect(Math.hypot(st.x - stage.interactPoint.x, st.y - stage.interactPoint.y)).toBeLessThanOrEqual(INTERACT_RANGE);
  });

  it('content 폴더 전체 검사를 통과한다', () => {
    expect(validateContentDir(root)).toEqual([]);
  });
});

describe('바닥 칸과 악보의 자리', () => {
  it('칸 번호는 줄 × 마디: 1~4가 위 성부 1~4마디, 5~8이 아래 성부 1~4마디', () => {
    const cells = stageCells(layout);
    expect(cells).toHaveLength(8);
    expect(cells.map((c) => [c.slot, c.voiceId, c.measureIndex])).toEqual([
      [1, 'v1', 0],
      [2, 'v1', 1],
      [3, 'v1', 2],
      [4, 'v1', 3],
      [5, 'v2', 0],
      [6, 'v2', 1],
      [7, 'v2', 2],
      [8, 'v2', 3],
    ]);
    expect(cells[0]).toMatchObject({ row: 0, voiceLabel: '위 성부' });
    expect(cells[7]).toMatchObject({ row: 1, voiceLabel: '아래 성부' });
  });

  it('칸 ↔ 성부와 마디는 서로 되돌아온다', () => {
    for (const c of stageCells(layout)) {
      expect(stageSlotOf(layout, c.voiceId, c.measureIndex)).toBe(c.slot);
      expect(stageCellOfSlot(layout, c.slot)).toEqual(c);
    }
  });

  it('바닥에 없는 칸과 성부, 마디는 null이다', () => {
    expect(stageCellOfSlot(layout, 0)).toBeNull();
    expect(stageCellOfSlot(layout, 9)).toBeNull();
    expect(stageCellOfSlot(layout, 1.5)).toBeNull();
    expect(stageSlotOf(layout, 'v3', 0)).toBeNull();
    expect(stageSlotOf(layout, 'v1', 4)).toBeNull();
    expect(stageSlotOf(layout, 'v1', -1)).toBeNull();
    expect(stageSlotOf(layout, 'v1', 0.5)).toBeNull();
  });

  it('디딤돌 길 같은 다른 설치물은 무대 바닥이 아니다', () => {
    const steps = load(readJson('content', 'installations', 'inst.village.scale-stones.json'));
    expect(stageLayoutOf(steps)).toBeNull();
  });

  it('판본이 쓰는 성부: 한 성부 판본은 위 성부만, 나머지는 두 성부', () => {
    expect(usedVoiceIds(layout, one)).toEqual(['v1']);
    expect(usedVoiceIds(layout, two)).toEqual(['v1', 'v2']);
    expect(usedVoiceIds(layout, hard)).toEqual(['v1', 'v2']);
  });

  it('마디 칸 목록은 마디 수만큼이고 마디 하나가 한 칸(3840틱)이다', () => {
    const cells = measureCellsOf(one);
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => [c.cellId, c.measureIndex, c.cellIndex, c.onsetTicks, c.durationTicks, c.label])).toEqual([
      ['m0', 0, 0, 0, 3840, '1마디'],
      ['m1', 1, 0, 0, 3840, '2마디'],
      ['m2', 2, 0, 0, 3840, '3마디'],
      ['m3', 3, 0, 0, 3840, '4마디'],
    ]);
  });

  it('합주 판본은 모두 scoreArrangement이고 다른 과제는 아니다', () => {
    for (const id of q08.variantIds) expect(isArrangementVariant(q08.variants[id]!)).toBe(true);
    const q02 = quests.find((q) => q.questId === 'rhythm.rest-in-a-bar')!;
    for (const id of q02.variantIds) expect(isArrangementVariant(q02.variants[id]!)).toBe(false);
  });
});

describe('칸의 채움(바닥에 보이는 모습)', () => {
  it('처음에는 쓰는 칸이 모두 비어 있고, 쓰지 않는 성부 줄은 쓰지 않는다고 읽는다', () => {
    const s = open('one-voice');
    const views = stageCellViews(layout, one, s.content());
    expect(views.map((v) => v.fill)).toEqual(['empty', 'empty', 'empty', 'empty', 'unused', 'unused', 'unused', 'unused']);
    expect(views[0]).toMatchObject({ slot: 1, name: null, text: '위 성부 1마디: 비어 있어요.' });
    expect(views[4]).toMatchObject({ slot: 5, name: null, text: '아래 성부 1마디: 이 판본에서는 쓰지 않아요.' });
    const two2 = stageCellViews(layout, two, open('two-voices').content());
    expect(two2.every((v) => v.fill === 'empty')).toBe(true);
  });

  it('한 마디가 일부만 차면 칸 수로 읽는다: 한 성부 판본은 마디가 4칸(4분음표)이다', () => {
    const s = open('one-voice');
    putEvent(s, one, { eventId: 'x', type: 'note', voiceId: 'v1', staffId: 's1', measureIndex: 0, onsetTicks: 0, durationTicks: 960, writtenPitch: { letter: 'C', octave: 4, accidental: null } });
    const v = stageCellViews(layout, one, s.content())[0]!;
    expect(v).toMatchObject({ fill: 'partial', filledCells: 1, totalCells: 4, name: '1/4', text: '위 성부 1마디: 4칸 중 1칸이 채워졌어요.' });
  });

  it('높은 도전 판본의 마디는 8칸(8분음표)이다', () => {
    const s = open('challenge');
    putEvent(s, hard, { eventId: 'x', type: 'note', voiceId: 'v1', staffId: 's1', measureIndex: 1, onsetTicks: 0, durationTicks: 1920, writtenPitch: { letter: 'E', octave: 4, accidental: null } });
    const v = stageCellViews(layout, hard, s.content())[1]!;
    expect(v).toMatchObject({ fill: 'partial', filledCells: 4, totalCells: 8, name: '4/8' });
  });

  it('마디를 정답대로 채우면 가득 찬 칸이고, 다른 마디와 다른 성부는 그대로 빈 칸이다', () => {
    const s = open('two-voices');
    fill(s, two, { voices: ['v1'], measures: [2] });
    const views = stageCellViews(layout, two, s.content());
    expect(views.map((v) => v.fill)).toEqual(['empty', 'empty', 'full', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(views[2]).toMatchObject({ name: '4/4', text: '위 성부 3마디: 가득 채워졌어요.' });
  });

  it('성부마다 마디를 따로 센다: 위 성부를 채워도 아래 성부 칸은 비어 있다', () => {
    const s = open('two-voices');
    fill(s, two, { voices: ['v1'] });
    const views = stageCellViews(layout, two, s.content());
    expect(views.slice(0, 4).map((v) => v.fill)).toEqual(['full', 'full', 'full', 'full']);
    expect(views.slice(4).map((v) => v.fill)).toEqual(['empty', 'empty', 'empty', 'empty']);
  });
});

describe('판정이 가리키는 칸(느낌표)', () => {
  const issue = (target: Issue['target']): Issue => ({ code: 'MISSING_VOICE', params: {}, ...(target ? { target } : {}) });

  it('성부와 마디가 함께 있으면 그 칸 하나만 가리킨다', () => {
    expect(flaggedStageSlots(layout, [issue({ voiceId: 'v1', measureIndex: 1 })])).toEqual([2]);
    expect(flaggedStageSlots(layout, [issue({ voiceId: 'v2', measureIndex: 3 })])).toEqual([8]);
  });

  it('마디가 없는 문제는 그 성부의 모든 마디 칸을 가리킨다', () => {
    expect(flaggedStageSlots(layout, [issue({ voiceId: 'v2' })])).toEqual([5, 6, 7, 8]);
  });

  it('성부가 없고 마디만 있으면 모든 줄의 그 마디 칸을 가리킨다', () => {
    expect(flaggedStageSlots(layout, [issue({ measureIndex: 2 })])).toEqual([3, 7]);
  });

  it('대상이 없거나 바닥에 없는 성부와 마디는 가리키지 않는다', () => {
    expect(flaggedStageSlots(layout, [issue(undefined)])).toEqual([]);
    expect(flaggedStageSlots(layout, [issue({ voiceId: 'v9', measureIndex: 0 })])).toEqual([]);
    expect(flaggedStageSlots(layout, [issue({ voiceId: 'v1', measureIndex: 9 })])).toEqual([]);
    expect(flaggedStageSlots(layout, [])).toEqual([]);
  });

  it('여러 문제는 한 번씩만, 칸 번호 순서로 센다', () => {
    expect(flaggedStageSlots(layout, [issue({ voiceId: 'v2', measureIndex: 0 }), issue({ voiceId: 'v1', measureIndex: 3 }), issue({ voiceId: 'v2', measureIndex: 0 })])).toEqual([4, 5]);
  });

  it('실제 판정: 한 성부 판본에서 둘째 마디의 첫 음만 틀리면 그 칸 하나만 가리킨다', () => {
    const s = open('one-voice');
    for (const e of one.score.events) {
      const wrong = e.type === 'note' && e.measureIndex === 1 && e.onsetTicks === 0;
      putEvent(s, one, e, wrong ? (e.writtenPitch.letter === 'C' ? 'A4' : 'C4') : undefined);
    }
    const result = evaluateDraft(one, s.content());
    expect(result.passed).toBe(false);
    expect(flaggedStageSlots(layout, result.issues)).toEqual([2]);
  });

  it('실제 판정: 위 성부만 끝내면 아래 성부 줄 전체가 가리켜진다', () => {
    const s = open('two-voices');
    fill(s, two, { voices: ['v1'] });
    const result = evaluateDraft(two, s.content());
    expect(result.passed).toBe(false);
    expect(flaggedStageSlots(layout, result.issues)).toEqual([5, 6, 7, 8]);
  });

  it('실제 판정: 두 성부를 정답대로 채우면 통과하고 가리키는 칸이 없다', () => {
    for (const [id, variant] of [['one-voice', one], ['two-voices', two], ['challenge', hard]] as const) {
      const s = open(id);
      fill(s, variant);
      const result = evaluateDraft(variant, s.content());
      expect(result.passed, id).toBe(true);
      expect(flaggedStageSlots(layout, result.issues), id).toEqual([]);
    }
  });
});

describe('듣기 범위: 전체, 성부 하나, 고른 마디', () => {
  const measureTicks = 3840;
  const whole = (): ReturnType<typeof open> => {
    const s = open('two-voices');
    fill(s, two);
    return s;
  };

  it('이름과 같음 비교', () => {
    expect(scopeName(ALL_SCOPE, layout.rows)).toBe('전체');
    expect(scopeName({ kind: 'voice', voiceId: 'v1' }, layout.rows)).toBe('위 성부만');
    expect(scopeName({ kind: 'voice', voiceId: 'v2' }, layout.rows)).toBe('아래 성부만');
    expect(scopeName({ kind: 'measure', measureIndex: 1 }, layout.rows)).toBe('2마디만');
    const a: ListenScope = { kind: 'voice', voiceId: 'v1' };
    expect(sameScope(a, { kind: 'voice', voiceId: 'v1' })).toBe(true);
    expect(sameScope(a, { kind: 'voice', voiceId: 'v2' })).toBe(false);
    expect(sameScope(a, ALL_SCOPE)).toBe(false);
    expect(sameScope({ kind: 'measure', measureIndex: 2 }, { kind: 'measure', measureIndex: 2 })).toBe(true);
    expect(sameScope({ kind: 'measure', measureIndex: 2 }, { kind: 'measure', measureIndex: 3 })).toBe(false);
    expect(sameScope(ALL_SCOPE, { kind: 'all' })).toBe(true);
  });

  it('구간은 고른 마디에만 있다: 2마디는 3840~7680틱', () => {
    expect(scopeSection(ALL_SCOPE, '4/4')).toBeNull();
    expect(scopeSection({ kind: 'voice', voiceId: 'v2' }, '4/4')).toBeNull();
    expect(scopeSection({ kind: 'measure', measureIndex: 1 }, '4/4')).toEqual({ startTick: 3840, endTick: 7680 });
  });

  it('전체: 두 성부의 모든 음이 울리고, 구간 없이 곡 전체 길이(15360틱)다', () => {
    const s = whole();
    const all = scopedPlayback(scoreOf(s, two), ALL_SCOPE, 80);
    expect(all.section).toBeNull();
    expect(all.audibleCount).toBe(two.score.events.filter((e) => e.type === 'note').length);
    expect(all.lengthTicks).toBe(15360);
    expect(all.tempoBpm).toBe(80);
  });

  it('성부 하나만: 그 성부의 음만 울리고 곡 길이는 같다', () => {
    const s = whole();
    const upper = scopedPlayback(scoreOf(s, two), { kind: 'voice', voiceId: 'v1' }, 80);
    const lower = scopedPlayback(scoreOf(s, two), { kind: 'voice', voiceId: 'v2' }, 80);
    const notesOf = (voiceId: string) => two.score.events.filter((e) => e.type === 'note' && e.voiceId === voiceId).length;
    expect(upper.audibleCount).toBe(notesOf('v1'));
    expect(lower.audibleCount).toBe(notesOf('v2'));
    expect(upper.audibleCount + lower.audibleCount).toBe(scopedPlayback(scoreOf(s, two), ALL_SCOPE, 80).audibleCount);
    expect(upper.lengthTicks).toBe(15360);
    // 아래 성부 재생에 위 성부의 음이 섞이지 않는다: 정답의 아래 성부와 (시작 틱, 높이)가 같다
    const key = (n: { onsetTick: number; midi: number }) => `${n.onsetTick}:${n.midi}`;
    const answerLower = scoreToPlayback(two.score, { voiceIds: ['v2'] }).notes.map(key).sort();
    expect(lower.notes.map(key).sort()).toEqual(answerLower);
  });

  it('고른 마디만: 그 마디 구간의 음만 센다(두 성부 모두)', () => {
    const s = whole();
    const m1 = scopedPlayback(scoreOf(s, two), { kind: 'measure', measureIndex: 1 }, 80);
    expect(m1.section).toEqual({ startTick: 3840, endTick: 7680 });
    const expected = two.score.events.filter((e) => e.type === 'note' && e.measureIndex === 1).length;
    expect(m1.audibleCount).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('들려 줄 것이 없으면 센 음이 0이다: 빈 마디, 비어 있는 성부', () => {
    const s = open('two-voices');
    fill(s, two, { voices: ['v1'], measures: [0] });
    const score = scoreOf(s, two);
    expect(scopedPlayback(score, { kind: 'measure', measureIndex: 3 }, 80).audibleCount).toBe(0);
    expect(scopedPlayback(score, { kind: 'voice', voiceId: 'v2' }, 80).audibleCount).toBe(0);
    expect(scopedPlayback(score, ALL_SCOPE, 80).audibleCount).toBeGreaterThan(0);
  });

  it('아직 다 놓지 않은 초안도 곡 전체 길이까지 지나간다: 곡의 틀이 마디 수(measureCount)를 쥐고, 없으면 최소 길이를 준다', () => {
    const s = open('two-voices');
    fill(s, two, { voices: ['v1'], measures: [0] });
    const draft = scoreOf(s, two);
    // 틀(variant.score)의 measureCount가 초안에 남으므로 한 마디만 놓아도 재생은 4마디를 지난다
    expect(scopedPlayback(draft, ALL_SCOPE, 80).lengthTicks).toBe(15360);
    // 마디 수가 없는 악보는 놓인 마디까지만 센다. 최소 길이(곡 전체)를 주면 끝 마디까지 지나간다
    const { measureCount: _unused, ...bare } = draft;
    expect(scopedPlayback(bare, ALL_SCOPE, 80).lengthTicks).toBe(3840);
    expect(scopedPlayback(bare, ALL_SCOPE, 80, songLengthTicks(two)).lengthTicks).toBe(15360);
    // 고른 마디(4마디째)의 구간이 재생 길이 안에 있다
    const last = scopedPlayback(bare, { kind: 'measure', measureIndex: 3 }, 80, songLengthTicks(two));
    expect(last.section).toEqual({ startTick: 11520, endTick: 15360 });
    expect(last.section!.endTick).toBeLessThanOrEqual(last.lengthTicks);
  });

  it('느리게 듣기처럼 템포를 바꿔도 음의 틱은 같다', () => {
    const s = whole();
    const normal = scopedPlayback(scoreOf(s, two), ALL_SCOPE, 80);
    const slow = scopedPlayback(scoreOf(s, two), ALL_SCOPE, 50);
    expect(slow.tempoBpm).toBe(50);
    expect(slow.notes).toEqual(normal.notes);
    expect(scoreToPlayback(scoreOf(s, two), { tempoBpm: 50 }).notes).toEqual(slow.notes);
  });

  it('재생 위치가 바닥의 어느 칸인가: 전체는 쓰는 줄의 그 마디 칸들', () => {
    const used = ['v1', 'v2'];
    expect(playingStageSlots(layout, used, ALL_SCOPE, 0, measureTicks)).toEqual([1, 5]);
    expect(playingStageSlots(layout, used, ALL_SCOPE, 3839, measureTicks)).toEqual([1, 5]);
    expect(playingStageSlots(layout, used, ALL_SCOPE, 3840, measureTicks)).toEqual([2, 6]);
    expect(playingStageSlots(layout, used, ALL_SCOPE, 15359, measureTicks)).toEqual([4, 8]);
  });

  it('성부 하나만 들으면 그 줄의 칸만 울린다', () => {
    expect(playingStageSlots(layout, ['v1', 'v2'], { kind: 'voice', voiceId: 'v2' }, 4000, measureTicks)).toEqual([6]);
    expect(playingStageSlots(layout, ['v1'], ALL_SCOPE, 4000, measureTicks)).toEqual([2]);
  });

  it('고른 마디만 들으면 그 마디의 칸만 울리고 다른 마디의 틱은 아무것도 울리지 않는다', () => {
    const scope: ListenScope = { kind: 'measure', measureIndex: 2 };
    expect(playingStageSlots(layout, ['v1', 'v2'], scope, 7680, measureTicks)).toEqual([3, 7]);
    expect(playingStageSlots(layout, ['v1', 'v2'], scope, 0, measureTicks)).toEqual([]);
  });

  it('곡 길이를 넘었거나 위치가 없으면 울리는 칸이 없다', () => {
    expect(playingStageSlots(layout, ['v1', 'v2'], ALL_SCOPE, 15360, measureTicks)).toEqual([]);
    expect(playingStageSlots(layout, ['v1', 'v2'], ALL_SCOPE, -1, measureTicks)).toEqual([]);
    expect(playingStageSlots(layout, ['v1', 'v2'], ALL_SCOPE, Number.NaN, measureTicks)).toEqual([]);
    expect(playingStageSlots(layout, ['v1', 'v2'], ALL_SCOPE, 0, 0)).toEqual([]);
  });
});

describe('합주 전체 길이와 두 성부(12.8, 5-4)', () => {
  it('세 판본 모두 4마디 4/4, 전체 길이 15360틱이다', () => {
    for (const v of [one, two, hard]) {
      expect(songLengthTicks(v)).toBe(15360);
      expect(timelineOf(v).measures).toBe(4);
    }
  });

  it('정답 악보를 재생 내용으로 바꾸면 길이가 곡 길이와 같다', () => {
    for (const v of [one, two, hard]) expect(scoreToPlayback(v.score).lengthTicks).toBe(songLengthTicks(v));
  });

  it('위 성부 한 줄을 끝낸 것은 두 성부를 끝낸 것으로 세지 않는다(한 성부의 통과가 두 성부로 새지 않는다)', () => {
    for (const [id, v] of [['two-voices', two], ['challenge', hard]] as const) {
      const s = open(id);
      fill(s, v, { voices: ['v1'] });
      const r = evaluateDraft(v, s.content());
      expect(r.passed, id).toBe(false);
      expect(r.details, id).toMatchObject({ perVoice: { v1: true, v2: false } });
      // 아래 성부까지 채우면 통과한다
      fill(s, v, { voices: ['v2'] });
      expect(evaluateDraft(v, s.content()).passed, id).toBe(true);
    }
  });

  it('한 성부 판본은 위 성부만 판정한다(아래 성부 줄은 바닥에서 쓰지 않는다)', () => {
    const s = open('one-voice');
    fill(s, one);
    expect(evaluateDraft(one, s.content()).passed).toBe(true);
    expect(usedVoiceIds(layout, one)).toEqual(['v1']);
  });
});

describe('연결 검사: 무대 바닥(stageCells)', () => {
  const good = load();

  it('정상 데이터는 문제가 없다', () => {
    expect(codes([good])).toEqual([]);
    expect(codes([good, load(readJson('content', 'installations', 'inst.village.scale-stones.json'))])).toEqual([]);
  });

  it('원형과 변환표 종류가 맞지 않으면 알린다', () => {
    const wrong = clone(good);
    wrong.slotMap = { kind: 'orderedPitches', voiceId: 'v1' };
    expect(codes([wrong])).toContain('SLOTMAP_ARCHETYPE');
    const steps = clone(load(readJson('content', 'installations', 'inst.village.scale-stones.json')));
    steps.slotMap = clone(good.slotMap);
    expect(codes([steps])).toContain('SLOTMAP_ARCHETYPE');
  });

  it('자리 수가 줄 × 마디와 다르면 알린다', () => {
    const seven = clone(good);
    seven.slots.pop();
    expect(codes([seven])).toContain('SLOT_COUNT');
  });

  it('자리의 순서가 줄 순서(마디는 오른쪽으로, 줄은 아래로)가 아니면 알린다', () => {
    const swapped = clone(good);
    const a = swapped.slots[1]!;
    const b = swapped.slots[2]!;
    [a.x, b.x] = [b.x, a.x];
    expect(codes([swapped])).toContain('SLOT_ORDER');
    const shifted = clone(good);
    shifted.slots[5]!.x += 20;
    expect(codes([shifted])).toContain('SLOT_ORDER');
    const tilted = clone(good);
    tilted.slots[2]!.y += 3;
    expect(codes([tilted])).toContain('SLOT_ORDER');
  });

  it('같은 성부가 두 줄에 나오거나 판본의 성부가 바닥에 없으면 알린다', () => {
    const dup = clone(good);
    if (dup.slotMap.kind === 'stageCells') dup.slotMap.rows[1]!.voiceId = 'v1';
    expect(codes([dup])).toContain('SLOTMAP_VOICE');
    const missing = clone(good);
    if (missing.slotMap.kind === 'stageCells') missing.slotMap.rows = [missing.slotMap.rows[0]!];
    missing.slots = missing.slots.slice(0, 4);
    expect(codes([missing])).toContain('SLOTMAP_VOICE');
  });

  it('바닥의 마디 칸 수와 악보의 마디 수가 다르면 알린다', () => {
    const six = clone(good);
    if (six.slotMap.kind === 'stageCells') six.slotMap.measures = 5;
    expect(codes([six])).toEqual(expect.arrayContaining(['SLOT_COUNT', 'SLOTMAP_COUNT']));
  });

  it('판정기가 scoreArrangement가 아닌 과제는 무대에 올릴 수 없다', () => {
    const wrong = clone(good);
    wrong.quests = [{ questId: 'scale.major', variantIds: ['c-major'] }];
    expect(codes([wrong])).toContain('SLOTMAP_EVALUATOR');
  });

  it('형식 검사: 줄이 비었거나 마디 수가 정수가 아니면 읽지 못한다', () => {
    const base = clone(raw) as Record<string, unknown>;
    const bad = (slotMap: unknown): string[] => parseInstallation({ ...clone(base), slotMap }, 'x.json').issues.map((i) => i.code);
    expect(bad({ kind: 'stageCells', rows: [], measures: 4 }).length).toBeGreaterThan(0);
    expect(bad({ kind: 'stageCells', rows: [{ voiceId: 'v1', label: '위 성부' }], measures: 0 }).length).toBeGreaterThan(0);
    expect(bad({ kind: 'stageCells', rows: [{ voiceId: 'v1', label: '위 성부' }], measures: 2.5 }).length).toBeGreaterThan(0);
    expect(bad({ kind: 'stageCells', rows: [{ voiceId: 'v1' }], measures: 4 }).length).toBeGreaterThan(0);
  });
});

describe('레이아웃 입력', () => {
  it('stageLayoutOf가 돌려주는 틀은 설치물의 줄과 마디 수다', () => {
    const l: StageLayout = layout;
    expect(l.measures).toBe(4);
    expect(l.rows.map((r) => r.voiceId)).toEqual(['v1', 'v2']);
  });
});

describe('자유 가락의 판본(4.9, 5-6)', () => {
  const free = freeMelodyVariant(one);

  it('이름 표는 자유 가락이다', () => {
    expect(FREE_MELODY_LABEL).toBe('자유 가락');
  });

  it('합주 판본의 틀(4마디 4/4, 성부 하나, 음역)은 그대로 두고 목표 악보의 음과 쉼을 모두 비운다', () => {
    expect(free.score.events).toEqual([]);
    expect(free.score.measureCount).toBe(4);
    expect(free.score.meter).toBe(one.score.meter);
    expect(free.score.tempoBpm).toBe(one.score.tempoBpm);
    expect(free.score.PPQ).toBe(one.score.PPQ);
    // 틀 쪽의 성부 정보(성부 수, 줄)는 그대로다
    expect(timelineOf(free).voices.map((v) => v.voiceId)).toEqual(timelineOf(one).voices.map((v) => v.voiceId));
    expect(timelineOf(free).measures).toBe(4);
  });

  it('가장 짧은 음이 8분음표로 늘어난다. 한 칸이 8분음표라 한 마디가 여덟 칸이다', () => {
    expect(one.challengeDescriptor.smallestValue).toBe('quarter');
    expect(free.challengeDescriptor.smallestValue).toBe('eighth');
    const spec = timelineOf(free);
    expect(spec.cellTicks).toBe(480);
    expect(Math.round(spec.measureTicks / spec.cellTicks)).toBe(8);
  });

  it('셋잇단과 화음은 떨어져 나간다(8분음표 격자에 놓이지 않는 것을 틀에 남기지 않는다)', () => {
    const withExtras = { ...one, score: { ...one.score, tuplets: [{ tupletId: 't', ratio: [3, 2] }], chords: [{ chordId: 'c' }] } } as unknown as QuestVariant;
    const made = freeMelodyVariant(withExtras);
    expect('tuplets' in made.score).toBe(false);
    expect('chords' in made.score).toBe(false);
    expect(made.score.events).toEqual([]);
  });

  it('원래 판본은 바뀌지 않는다', () => {
    const before = JSON.stringify(one);
    freeMelodyVariant(one);
    expect(JSON.stringify(one)).toBe(before);
    expect(one.score.events.length).toBeGreaterThan(0);
  });

  it('같은 판본에서는 같은 틀을 돌려준다(화면이 틀이 바뀐 줄 알고 다시 그리지 않는다). 다른 판본이면 다른 틀이다', () => {
    expect(freeMelodyVariant(one)).toBe(free);
    expect(freeMelodyVariant(two)).not.toBe(free);
    expect(freeMelodyVariant(two)).toBe(freeMelodyVariant(two));
  });

  it('배치 도전의 틀이라 시간선 도구가 그대로 쓰인다', () => {
    expect(isArrangementVariant(free)).toBe(true);
    const s = new ChallengeSession();
    s.openChallenge(q08.questId, 'one-voice');
    const r = placeOnTimeline(timelineOf(free), s.content(), { voiceId: 'v1', measureIndex: 0, tick: 0 }, { kind: 'note', pitch: p('E4'), value: 'eighth' });
    expect(r.ok).toBe(true);
  });
});
