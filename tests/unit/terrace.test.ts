// 7-1 계단밭(T5, 4.7)의 칸 계산(domain/terrace): 온음계 위치와 세로 좌표, 열과 칸의 대응, 놓기·옮기기·빼기·변화표, 월드가 그리는 모습, 판정이 가리킨 열, 자유로 놀기의 틀, 카메라 목표.
// 순수 계산이라 월드(Phaser)와 화면 없이 확인한다. 작업대는 terrace-bench 시험이, 월드의 그림과 걷기는 flow 시험이 맡는다.
// 7-1의 끝 조건("가운데 턱의 C4가 두 음자리표에서 같은 자리다")도 여기서 데이터로 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition, QuestVariant } from '@/domain/content';
import { parseInstallation } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import type { WrittenPitch } from '@/domain/pitch';
import type { DraftContent } from '@/domain/session';
import {
  TERRACE_COLUMNS,
  TERRACE_COLUMN_GAP,
  TERRACE_COLUMN_W,
  TERRACE_LABEL_LEFT,
  TERRACE_LABEL_TOP,
  TERRACE_START_POSITION,
  TERRACE_STEP_PX,
  clefStepRange,
  flaggedTerraceDrafts,
  freeTerraceFrameOf,
  stepOfName,
  terraceAccidentalResult,
  terraceAccidentalSetResult,
  terraceAccidentalsAllowed,
  terraceBounds,
  terraceClearResult,
  terraceColumnX,
  terraceColumnsOf,
  terraceFieldWalls,
  terraceFollowOf,
  terraceLedgerSteps,
  terraceMapOf,
  terracePitchAtStep,
  terracePlaceResult,
  terracePositionOf,
  terraceRangeOf,
  terraceShiftResult,
  terraceSpeakOf,
  terraceStaffSteps,
  terraceStartStep,
  terraceStatesOf,
  terraceStepAtPress,
  terraceStepAtY,
  terraceStepOf,
  terraceTargetsOf,
  terraceViewOf,
  terraceYOfStep,
} from '@/domain/terrace';
import type { TerraceColumn, TerraceMap } from '@/domain/terrace';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
function inst(id: string): InstallationDef {
  const file = `${id}.json`;
  const { installation, issues } = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', file), 'utf-8')), file);
  if (!installation) throw new Error(JSON.stringify(issues));
  return installation;
}

const N1 = inst('inst.staff-hill.treble-terrace');
const N2 = inst('inst.staff-hill.bass-terrace');
const N3 = inst('inst.staff-hill.middle-ledge');
const MAP1 = terraceMapOf(N1)!;
const MAP2 = terraceMapOf(N2)!;
const MAP3 = terraceMapOf(N3)!;

const Q09 = quest('staff.lines-and-spaces');
const Q10 = quest('staff.ledger-lines');
const Q11 = quest('staff.middle-c-neighbors');
const Q12 = quest('staff.range-ladder');
const Q01 = quest('pitch.same-note-two-clefs');
const v = (q: QuestDefinition, id: string): QuestVariant => q.variants[id]!;

const empty = (): DraftContent => ({ slots: [], events: [], tuplets: [] });
const written = (letter: WrittenPitch['letter'], octave: number, accidental: WrittenPitch['accidental'] = null): WrittenPitch => ({ letter, accidental, octave });
const withLamps = (lamps: Array<[number, WrittenPitch]>): DraftContent => ({ slots: lamps.map(([slot, writtenPitch]) => ({ slot, writtenPitch })), events: [], tuplets: [] });

/** 열 하나를 찾는다(초안 칸 번호) */
const colOf = (cols: TerraceColumn[], draft: number): TerraceColumn => cols.find((c) => c.draft === draft)!;

describe('온음계 위치와 세로 좌표(4.7)', () => {
  it('가운데 도(C4)가 0이고 한 칸이 온음계 한 계단이다. 위가 양수, 아래가 음수다', () => {
    expect(terraceStepOf({ letter: 'C', octave: 4 })).toBe(0);
    expect(terraceStepOf({ letter: 'D', octave: 4 })).toBe(1);
    expect(terraceStepOf({ letter: 'B', octave: 3 })).toBe(-1);
    expect(terraceStepOf({ letter: 'C', octave: 5 })).toBe(7);
    expect(terraceStepOf({ letter: 'C', octave: 2 })).toBe(-14);
    expect(terracePitchAtStep(0)).toEqual({ letter: 'C', octave: 4 });
    expect(terracePitchAtStep(-1)).toEqual({ letter: 'B', octave: 3 });
    expect(terracePitchAtStep(9)).toEqual({ letter: 'E', octave: 5 });
  });

  it('세로 좌표는 y = c4Y − 48 × 칸 수다: 높은음자리표의 다섯 줄은 904·808·712·616·520, 낮은음자리표의 다섯 줄은 1480·1384·1288·1192·1096이다', () => {
    expect(TERRACE_STEP_PX).toBe(48);
    expect(MAP3.c4Y).toBe(1000);
    const y = (letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', octave: number): number => terraceYOfStep(MAP3, terraceStepOf({ letter, octave }));
    expect([y('E', 4), y('G', 4), y('B', 4), y('D', 5), y('F', 5)]).toEqual([904, 808, 712, 616, 520]);
    expect([y('G', 2), y('B', 2), y('D', 3), y('F', 3), y('A', 3)]).toEqual([1480, 1384, 1288, 1192, 1096]);
    expect(y('C', 4)).toBe(1000);
  });

  it('줄 간격은 96 px(온음계 두 칸)이고, 세로 좌표를 칸 수로 되돌리면 같은 칸이다. 칸 사이의 점은 가까운 칸으로 간다', () => {
    for (let step = -14; step <= 14; step++) expect(terraceStepAtY(MAP3, terraceYOfStep(MAP3, step)), `칸 ${step}`).toBe(step);
    expect(terraceYOfStep(MAP3, 2) - terraceYOfStep(MAP3, 4)).toBe(96);
    expect(terraceStepAtY(MAP3, 1000 - 23)).toBe(0);
    expect(terraceStepAtY(MAP3, 1000 - 25)).toBe(1);
    expect(terraceStepAtY(MAP3, 1000 + 71)).toBe(-1);
    expect(terraceStepAtY(MAP3, 1000 + 73)).toBe(-2);
  });

  it('눌린 높이는 가장 가까운 칸이고, 열 맨 위·맨 아래의 반 칸 경계는 밭의 범위 안으로 맞춘다(−0은 0이다)', () => {
    // 높은음 밭(−2~14): 열이 304~1120(범위보다 위아래 반 칸씩 넓다)
    expect(terraceStepAtPress(MAP1, 1000)).toBe(0);
    expect(terraceStepAtPress(MAP1, 904)).toBe(2);
    expect(terraceStepAtPress(MAP1, 712 + 20)).toBe(6);
    expect(terraceStepAtPress(MAP1, 304)).toBe(14); // 14.5 → 15를 범위 안으로
    expect(terraceStepAtPress(MAP1, 304 - 500)).toBe(14);
    expect(terraceStepAtPress(MAP1, 1120)).toBe(-2); // −2.5 → −2
    expect(terraceStepAtPress(MAP1, 1120 + 500)).toBe(-2);
    // 낮은음 밭(−14~2)
    expect(terraceStepAtPress(MAP2, 880)).toBe(2); // 2.5 → 3을 범위 안으로
    expect(terraceStepAtPress(MAP2, 1696)).toBe(-14);
    // 두 보표 밭(−14~14): 맨 위는 범위 안으로, 맨 아래 경계는 반올림이 이미 범위 안이다
    expect(terraceStepAtPress(MAP3, 304)).toBe(14);
    expect(terraceStepAtPress(MAP3, 1696)).toBe(-14);
    // 가온 도 바로 아래 몇 px는 −0이 아니라 0이다
    const near = terraceStepAtPress(MAP3, 1000 + 10);
    expect(Object.is(near, 0)).toBe(true);
    expect(Number.isInteger(near)).toBe(true);
    // 범위 안의 모든 칸은 그 칸의 가운데를 누르면 그대로다
    for (const map of [MAP1, MAP2, MAP3]) {
      const range = terraceRangeOf(map);
      for (let step = range.low; step <= range.high; step++) expect(terraceStepAtPress(map, terraceYOfStep(map, step))).toBe(step);
    }
  });

  it('이름으로 칸 수를 읽는다: A3은 −2, C6은 14. 읽을 수 없으면 NaN이다', () => {
    expect(stepOfName('A3')).toBe(-2);
    expect(stepOfName('C6')).toBe(14);
    expect(stepOfName('C2')).toBe(-14);
    expect(stepOfName(' E4 ')).toBe(2);
    expect(Number.isNaN(stepOfName('H4'))).toBe(true);
    expect(Number.isNaN(stepOfName(''))).toBe(true);
    expect(terraceRangeOf(MAP1)).toEqual({ low: -2, high: 14 });
    expect(terraceRangeOf(MAP2)).toEqual({ low: -14, high: 2 });
  });

  it('음자리표마다 쓰는 높이는 덧줄 둘까지다: 높은음자리표는 A3–C6(−2~14), 낮은음자리표는 C2–E4(−14~2). 보표 위치로는 −4~12다', () => {
    expect(clefStepRange('treble')).toEqual({ min: -2, max: 14 });
    expect(clefStepRange('bass')).toEqual({ min: -14, max: 2 });
    expect(terracePositionOf('treble', 2)).toBe(0); // E4 = 높은음자리표 맨 아랫줄
    expect(terracePositionOf('treble', 0)).toBe(-2); // C4 = 아래 첫 덧줄
    expect(terracePositionOf('bass', 0)).toBe(10); // C4 = 낮은음자리표 위 첫 덧줄
    expect(terracePositionOf('bass', -10)).toBe(0); // G2 = 낮은음자리표 맨 아랫줄
  });
});

describe('설치물의 변환표(staffField)', () => {
  it('세 설치물이 같은 c4Y(1000)와 열 여덟 개를 쓴다. 높이 범위는 N1 A3–C6, N2 C2–E4, N3 C2–C6이고 음자리표가 N1 높은음, N2 낮은음, N3 둘이다', () => {
    expect([MAP1.c4Y, MAP2.c4Y, MAP3.c4Y]).toEqual([1000, 1000, 1000]);
    expect([MAP1, MAP2, MAP3].map((m) => [m.low, m.high])).toEqual([
      ['A3', 'C6'],
      ['C2', 'E4'],
      ['C2', 'C6'],
    ]);
    expect([MAP1.clefs, MAP2.clefs, MAP3.clefs]).toEqual([['treble'], ['bass'], ['treble', 'bass']]);
    for (const i of [N1, N2, N3]) {
      expect(i.archetype).toBe('terraceField');
      expect(i.slots).toHaveLength(TERRACE_COLUMNS);
    }
  });

  it('열은 가로 가운데 4400 + 140k(k=0..7), 폭 96이다. 열 번호는 1부터다', () => {
    expect(TERRACE_COLUMN_GAP).toBe(140);
    expect(TERRACE_COLUMN_W).toBe(96);
    for (let k = 0; k < TERRACE_COLUMNS; k++) {
      expect(terraceColumnX(N1, k + 1), `열 ${k + 1}`).toBe(4400 + 140 * k);
      expect(N1.slots[k]!.x).toBe(4352 + 140 * k);
      expect(N1.slots[k]!.w).toBe(96);
    }
    expect(terraceColumnX(N1, 0)).toBeNull();
    expect(terraceColumnX(N1, 9)).toBeNull();
  });

  it('계단밭이 아닌 설치물은 변환표가 없다', () => {
    expect(terraceMapOf(inst('inst.village.scale-stones'))).toBeNull();
    expect(terraceMapOf(inst('inst.bell-grove.three-bells'))).toBeNull();
    expect(freeTerraceFrameOf(inst('inst.village.scale-stones'), () => undefined)).toBeNull();
  });
});

describe('열과 칸의 대응(terraceColumnsOf)', () => {
  it('Q09·Q10은 판정 목표 하나가 열 하나다: 왼쪽부터 차례로, 칸 번호는 0부터, 이름은 목표의 라벨이다', () => {
    const cols = terraceColumnsOf(MAP1, v(Q09, 'treble-lines'));
    expect(cols.map((c) => [c.column, c.draft, c.label, c.clef])).toEqual([
      [1, 0, 'E4', 'treble'],
      [2, 1, 'G4', 'treble'],
      [3, 2, 'B4', 'treble'],
      [4, 3, 'D5', 'treble'],
      [5, 4, 'F5', 'treble'],
    ]);
    // 높이 범위는 설치물의 범위와 음자리표의 범위가 겹치는 곳이다
    expect(cols.every((c) => c.minStep === -2 && c.maxStep === 14)).toBe(true);
    const bass = terraceColumnsOf(MAP2, v(Q09, 'bass-spaces'));
    expect(bass.map((c) => c.label)).toEqual(['A2', 'C3', 'E3', 'G3']);
    expect(bass.every((c) => c.clef === 'bass' && c.minStep === -14 && c.maxStep === 2)).toBe(true);
  });

  it('Q10 낮은음자리표의 덧줄 판본은 E2, C2, C4, E4 네 열이다(설계서 5.3의 순서)', () => {
    const cols = terraceColumnsOf(MAP2, v(Q10, 'bass-ledger'));
    expect(cols.map((c) => c.label)).toEqual(['E2', 'C2', 'C4', 'E4']);
    expect(terraceTargetsOf(v(Q10, 'bass-ledger')).map((t) => t.midi)).toEqual([40, 36, 60, 64]);
  });

  it('Q11은 여섯 열이고 높은음자리표와 낮은음자리표가 번갈아 선다: 이웃한 두 열에서 같은 음을 두 음자리표로 견준다', () => {
    const cols = terraceColumnsOf(MAP3, v(Q11, 'neighbors'));
    expect(cols.map((c) => [c.label, c.clef])).toEqual([
      ['B3 · 높은음자리표', 'treble'],
      ['B3 · 낮은음자리표', 'bass'],
      ['C4 · 높은음자리표', 'treble'],
      ['C4 · 낮은음자리표', 'bass'],
      ['D4 · 높은음자리표', 'treble'],
      ['D4 · 낮은음자리표', 'bass'],
    ]);
  });

  it('Q12(X-1 음계 순서)는 칸 번호가 1부터이고 음자리표는 목표 음의 음역으로 정해진다: 가온 도(C4) 아래는 낮은음자리표, 그 위는 높은음자리표', () => {
    const cols = terraceColumnsOf(MAP3, v(Q12, 'c3-c5'));
    expect(cols.map((c) => [c.draft, c.label, c.clef])).toEqual([
      [1, 'C3', 'bass'],
      [2, 'E3', 'bass'],
      [3, 'G3', 'bass'],
      [4, 'C4', 'treble'],
      [5, 'E4', 'treble'],
      [6, 'G4', 'treble'],
      [7, 'C5', 'treble'],
    ]);
    const wide = terraceColumnsOf(MAP3, v(Q12, 'c2-c6'));
    expect(wide.map((c) => [c.label, c.clef])).toEqual([
      ['C2', 'bass'],
      ['C3', 'bass'],
      ['C4', 'treble'],
      ['C5', 'treble'],
      ['C6', 'treble'],
    ]);
    expect(terraceTargetsOf(v(Q12, 'c3-c5'))).toEqual([48, 52, 55, 60, 64, 67, 72].map((midi, i) => ({ draft: i + 1, midi })));
    expect(terraceTargetsOf(v(Q12, 'c2-c6')).map((t) => t.midi)).toEqual([36, 48, 60, 72, 84]);
  });

  it('Q01도 가운데 턱에서 풀 수 있다: 열 둘(높은음, 낮은음)이고 둘 다 C4다', () => {
    const cols = terraceColumnsOf(MAP3, v(Q01, 'middle-c'));
    expect(cols).toHaveLength(2);
    expect(cols.map((c) => c.clef).sort()).toEqual(['bass', 'treble']);
    expect(terraceTargetsOf(v(Q01, 'middle-c')).map((t) => t.midi)).toEqual([60, 60]);
  });

  it('열의 가운데 줄에서 시작한다: 높은음자리표는 B4, 낮은음자리표는 D3. 범위 밖이면 범위 안으로 맞춘다', () => {
    const treble = terraceColumnsOf(MAP1, v(Q09, 'treble-lines'))[0]!;
    const bass = terraceColumnsOf(MAP2, v(Q09, 'bass-lines'))[0]!;
    expect(TERRACE_START_POSITION).toBe(4);
    expect(terracePitchAtStep(terraceStartStep(treble))).toEqual({ letter: 'B', octave: 4 });
    expect(terracePitchAtStep(terraceStartStep(bass))).toEqual({ letter: 'D', octave: 3 });
    expect(terraceStartStep({ clef: 'treble', minStep: 10, maxStep: 12 })).toBe(10);
    expect(terraceStartStep({ clef: 'treble', minStep: 0, maxStep: 3 })).toBe(3);
  });
});

describe('가운데 턱의 C4: 두 음자리표에서 같은 자리다(7-1 끝 조건)', () => {
  it('높은음자리표와 낮은음자리표의 C4 열은 같은 세로 좌표(c4Y)에 놓이고, 보표 위치만 아래 첫 덧줄과 위 첫 덧줄로 다르게 읽힌다', () => {
    const cols = terraceColumnsOf(MAP3, v(Q01, 'middle-c'));
    const treble = cols.find((c) => c.clef === 'treble')!;
    const bass = cols.find((c) => c.clef === 'bass')!;
    const c4 = written('C', 4);
    const at = (col: TerraceColumn) => terraceStatesOf([col], withLamps([[col.draft, c4]]))[0]!;
    const t = at(treble);
    const b = at(bass);
    expect(t.step).toBe(0);
    expect(b.step).toBe(0);
    expect(terraceYOfStep(MAP3, t.step!)).toBe(1000);
    expect(terraceYOfStep(MAP3, b.step!)).toBe(1000);
    expect(t.midi).toBe(60);
    expect(b.midi).toBe(60);
    expect(t.where).toBe('아래 첫 덧줄');
    expect(b.where).toBe('위 첫 덧줄');
    // 두 열 모두에서 이 높이는 쓸 수 있다(덧줄 하나 이내)
    expect(treble.minStep <= 0 && 0 <= treble.maxStep).toBe(true);
    expect(bass.minStep <= 0 && 0 <= bass.maxStep).toBe(true);
  });

  it('Q11의 여섯 열도 같은 음끼리 같은 높이다: B3 −1, C4 0, D4 1이 높은음 열과 낮은음 열에서 모두 같은 칸이다', () => {
    const cols = terraceColumnsOf(MAP3, v(Q11, 'neighbors'));
    const targets = terraceTargetsOf(v(Q11, 'neighbors'));
    expect(targets.map((t) => t.midi)).toEqual([59, 59, 60, 60, 62, 62]);
    // 짝이 된 두 열의 온음계 위치(가온 도 0)는 같고(B3 −1, C4 0, D4 1), 두 열 모두 그 칸을 쓸 수 있으며, 세로 좌표도 같다(48 px씩)
    expect(cols.map((c) => stepOfName(c.label.split(' ')[0]!))).toEqual([-1, -1, 0, 0, 1, 1]);
    expect([-1, 0, 1].map((s) => terraceYOfStep(MAP3, s))).toEqual([1048, 1000, 952]);
    for (let i = 0; i < cols.length; i += 2) {
      const [a, b] = [cols[i]!, cols[i + 1]!];
      expect(a.clef).toBe('treble');
      expect(b.clef).toBe('bass');
      expect(a.label.split(' ')[0]).toBe(b.label.split(' ')[0]);
      const step = stepOfName(a.label.split(' ')[0]!);
      for (const c of [a, b]) expect(c.minStep <= step && step <= c.maxStep).toBe(true);
    }
  });
});

describe('놓기·옮기기·빼기', () => {
  const cols = terraceColumnsOf(MAP1, v(Q09, 'treble-lines'));
  const col0 = colOf(cols, 0);

  it('등을 놓으면 초안 칸에 기보 음이 들어가고, 문제를 푸는 중에는 보표 위치만 말한다(이름은 말하지 않는다)', () => {
    const r = terracePlaceResult(col0, empty(), 2, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'E', accidental: null, octave: 4 } });
    expect(r.midi).toBe(64);
    expect(r.text).toBe('E4 등을 맨 아랫줄에 놓았어요.');
    expect(r.text).not.toMatch(/E4.*E4/);
  });

  it('자유로 놀 때는 이름과 위치를 함께 말한다', () => {
    const r = terracePlaceResult(col0, empty(), 0, true);
    expect(r.ok && r.text).toBe('E4 등을 C4, 아래 첫 덧줄에 놓았어요.');
    const state = terraceStatesOf([col0], withLamps([[0, written('B', 4, 'flat')]]))[0]!;
    expect(state.where).toBe('가운데 줄');
    expect(terraceSpeakOf(state, true)).toBe('B♭4, 가운데 줄');
    expect(terraceSpeakOf(state, false)).toBe(state.where);
    expect(terraceSpeakOf(terraceStatesOf([col0], empty())[0]!, true)).toBe('');
  });

  it('이미 그 높이에 있으면 바꾸지 않는다(edit이 null)', () => {
    const r = terracePlaceResult(col0, withLamps([[0, written('E', 4)]]), 2, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edit).toBeNull();
    expect(r.text).toContain('이미');
  });

  it('열이 쓸 수 있는 높이를 벗어나면 이유를 말하고 놓지 않는다', () => {
    const above = terracePlaceResult(col0, empty(), 15, false);
    expect(above.ok).toBe(false);
    expect(above.text).toContain('높은음자리표 열은');
    expect(above.text).toContain('까지 놓을 수 있어요');
    const below = terracePlaceResult(col0, empty(), -3, false);
    expect(below.ok).toBe(false);
    expect(terracePlaceResult(col0, empty(), 1.5, false).ok).toBe(false);
  });

  it('덧줄은 보표 밖 둘째까지다: 높은음자리표 A3(아래 둘째 덧줄)과 C6(위 둘째 덧줄)이 끝이다', () => {
    const lowest = terracePlaceResult(col0, empty(), -2, false);
    expect(lowest.ok && lowest.text).toContain('아래 둘째 덧줄');
    const highest = terracePlaceResult(col0, empty(), 14, false);
    expect(highest.ok && highest.text).toContain('위 둘째 덧줄');
    expect(terracePlaceResult(col0, empty(), 15, false).ok).toBe(false);
    expect(terracePlaceResult(col0, empty(), -3, false).ok).toBe(false);
  });

  it('비어 있는 열에서 올리거나 내리면 가운데 줄에서 시작한다', () => {
    for (const delta of [1, -1, 7, -7]) {
      const r = terraceShiftResult(col0, empty(), delta, false);
      expect(r.ok, `delta ${delta}`).toBe(true);
      if (r.ok) expect(r.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'B', accidental: null, octave: 4 } });
    }
  });

  it('한 칸씩 올리고 내린다. 변화표는 그대로 따라간다', () => {
    const up = terraceShiftResult(col0, withLamps([[0, written('E', 4, 'sharp')]]), 1, false);
    expect(up.ok && up.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'F', accidental: 'sharp', octave: 4 } });
    const down = terraceShiftResult(col0, withLamps([[0, written('E', 4)]]), -1, false);
    expect(down.ok && down.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'D', accidental: null, octave: 4 } });
  });

  it('한 옥타브(일곱 칸)를 건너뛴다. 끝에 닿지 않았는데 건너뛰면 끝까지만 가고, 이미 끝이면 멈추고 이유를 말한다', () => {
    const octave = terraceShiftResult(col0, withLamps([[0, written('E', 4)]]), 7, false);
    expect(octave.ok && octave.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'E', accidental: null, octave: 5 } });
    // 14(C6)에서 4칸 아래가 10(위 첫 덧줄)이다: 10 + 7 = 17은 14로 맞춘다
    const clamp = terraceShiftResult(col0, withLamps([[0, written('A', 5)]]), 7, false);
    expect(clamp.ok && clamp.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'C', accidental: null, octave: 6 } });
    const atTop = terraceShiftResult(col0, withLamps([[0, written('C', 6)]]), 1, false);
    expect(atTop.ok).toBe(false);
    expect(atTop.text).toContain('더 위로 옮길 수 없어요');
    const atBottom = terraceShiftResult(col0, withLamps([[0, written('A', 3)]]), -7, false);
    expect(atBottom.ok).toBe(false);
    expect(atBottom.text).toContain('더 아래로 옮길 수 없어요');
  });

  it('빼면 그 칸이 비고, 이미 비어 있으면 그렇게 알린다', () => {
    const r = terraceClearResult(col0, withLamps([[0, written('G', 4)]]));
    expect(r.ok && r.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: null });
    expect(terraceClearResult(col0, empty()).ok).toBe(false);
  });

  it('칸은 판본의 열이므로 다른 열의 등은 건드리지 않는다', () => {
    const content = withLamps([
      [0, written('E', 4)],
      [1, written('G', 4)],
    ]);
    const r = terracePlaceResult(colOf(cols, 1), content, 5, false);
    expect(r.ok && r.edit).toEqual({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'A', accidental: null, octave: 4 } });
  });
});

describe('변화표 꼬리표', () => {
  // 변화표는 자유로 놀기에서 쓴다: 가운데 턱의 틀(열 여덟 개)의 첫 열
  const cols = terraceColumnsOf(MAP3, freeTerraceFrameOf(N3, (q, id) => (q === Q01.questId ? v(Q01, id) : undefined))!);
  const col = cols[0]!;

  it('등이 없으면 먼저 놓으라고 알린다', () => {
    const r = terraceAccidentalSetResult(col, empty(), 'sharp');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('먼저 등을 놓아');
    expect(terraceAccidentalResult(col, empty(), 1).ok).toBe(false);
  });

  it('올림표와 내림표를 달고 뗀다. 소리 높이가 반음씩 달라진다', () => {
    const base = withLamps([[col.draft, written('F', 4)]]);
    const sharp = terraceAccidentalSetResult(col, base, 'sharp');
    expect(sharp.ok && sharp.text).toContain('올림표를 달았어요');
    expect(sharp.ok && sharp.midi).toBe(66);
    const flat = terraceAccidentalSetResult(col, base, 'flat');
    expect(flat.ok && flat.text).toContain('내림표를 달았어요');
    expect(flat.ok && flat.midi).toBe(64);
    const none = terraceAccidentalSetResult(col, withLamps([[col.draft, written('F', 4, 'sharp')]]), null);
    expect(none.ok && none.text).toContain('변화표를 뗐어요');
    expect(none.ok && none.midi).toBe(65);
  });

  it('이미 그 변화표면 바꾸지 않고 말한다', () => {
    const r = terraceAccidentalSetResult(col, withLamps([[col.draft, written('F', 4, 'sharp')]]), 'sharp');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('이미 올림표');
    expect(terraceAccidentalSetResult(col, withLamps([[col.draft, written('F', 4)]]), null).text).toContain('달린 변화표가 없어요');
  });

  it('한 칸씩 올리면 ♭ → 없음 → ♯ 로 가고 끝에서 멈춘다', () => {
    const start = withLamps([[col.draft, written('F', 4, 'flat')]]);
    const a = terraceAccidentalResult(col, start, 1);
    expect(a.ok && a.edit).toEqual({ type: 'setSlot', slot: col.draft, writtenPitch: { letter: 'F', accidental: null, octave: 4 } });
    const b = terraceAccidentalResult(col, withLamps([[col.draft, written('F', 4)]]), 1);
    expect(b.ok && b.edit).toEqual({ type: 'setSlot', slot: col.draft, writtenPitch: { letter: 'F', accidental: 'sharp', octave: 4 } });
    const top = terraceAccidentalResult(col, withLamps([[col.draft, written('F', 4, 'sharp')]]), 1);
    expect(top.ok).toBe(false);
    expect(top.text).toContain('더 올릴 수 없어요');
    expect(terraceAccidentalResult(col, start, -1).text).toContain('더 내릴 수 없어요');
  });

  it('변화표를 쓰는 과제는 조표나 임시표가 나오는 것이다: 자유로 놀기는 쓰고, 4.7의 Q09–Q12는 쓰지 않는다', () => {
    const free = freeTerraceFrameOf(N3, (q, id) => (q === Q01.questId ? v(Q01, id) : undefined))!;
    expect(terraceAccidentalsAllowed(free)).toBe(true);
    for (const [q, ids] of [
      [Q09, Q09.variantIds],
      [Q10, Q10.variantIds],
      [Q11, Q11.variantIds],
      [Q12, Q12.variantIds],
    ] as const) {
      for (const id of ids) expect(terraceAccidentalsAllowed(v(q, id)), `${q.questId}/${id}`).toBe(false);
    }
  });
});

describe('월드가 그리는 모습(terraceViewOf)', () => {
  const cols = terraceColumnsOf(MAP1, v(Q09, 'treble-lines'));
  const input = { cursor: null as number | null, flagged: new Set<number>(), playing: new Set<number>(), free: false };

  it('열마다 등의 높이(칸 수)와 변화표를 싣는다. 문제를 푸는 중에는 이름을 싣지 않는다', () => {
    const view = terraceViewOf(cols, withLamps([[0, written('E', 4)], [2, written('B', 4, 'flat')]]), input);
    expect(view.columns.map((c) => c.step)).toEqual([2, null, 6, null, null]);
    expect(view.columns.map((c) => c.accidental)).toEqual([null, null, 'flat', null, null]);
    expect(view.columns.every((c) => c.name === null)).toBe(true);
    expect(view.columns[0]!.midi).toBe(64);
    expect(view.columns[2]!.midi).toBe(70);
    expect(view.free).toBe(false);
    expect(view.cursor).toBeNull();
    expect(view.cursorStep).toBeNull();
  });

  it('자유로 놀 때만 이름을 싣는다', () => {
    const view = terraceViewOf(cols, withLamps([[0, written('E', 4)]]), { ...input, free: true });
    expect(view.columns[0]!.name).toBe('E4');
    expect(view.columns[1]!.name).toBeNull();
    expect(view.free).toBe(true);
  });

  it('고른 열은 그 열의 등 높이가 놓으려는 높이다. 등이 없는 열은 가운데 줄이다', () => {
    const lamp = terraceViewOf(cols, withLamps([[1, written('A', 4)]]), { ...input, cursor: 1 });
    expect(lamp.cursor).toBe(1);
    expect(lamp.cursorStep).toBe(5);
    const bare = terraceViewOf(cols, empty(), { ...input, cursor: 3 });
    expect(bare.cursor).toBe(3);
    expect(bare.cursorStep).toBe(6);
    // 이 판본에 없는 칸은 고른 것으로 치지 않는다
    expect(terraceViewOf(cols, empty(), { ...input, cursor: 99 }).cursor).toBeNull();
  });

  it('판정이 가리킨 열과 지금 울리는 열을 표시한다', () => {
    const view = terraceViewOf(cols, empty(), { ...input, flagged: new Set([1, 4]), playing: new Set([2]) });
    expect(view.columns.map((c) => c.flagged)).toEqual([false, true, false, false, true]);
    expect(view.columns.map((c) => c.playing)).toEqual([false, false, true, false, false]);
  });

  it('각 열은 쓸 수 있는 높이 범위를 싣는다(월드가 열 밖의 높이를 눌렀을 때 이유를 말하게)', () => {
    const view = terraceViewOf(cols, empty(), input);
    for (const c of view.columns) expect([c.minStep, c.maxStep]).toEqual([-2, 14]);
  });
});

describe('판정이 가리킨 열', () => {
  it('음이름 판정은 slotId로 가리킨다. 가리킨 칸의 초안 번호를 작은 것부터 돌려준다', () => {
    const cols = terraceColumnsOf(MAP1, v(Q09, 'treble-lines'));
    const issues = [{ target: { slotId: 'treble-d5' } }, { target: { slotId: 'treble-e4' } }, { target: { slotId: 'nope' } }, {}];
    expect(flaggedTerraceDrafts(cols, issues)).toEqual([0, 3]);
    expect(flaggedTerraceDrafts(cols, [])).toEqual([]);
  });

  it('음계 순서 판정(Q12)은 칸 번호 문자열로 가리킨다', () => {
    const cols = terraceColumnsOf(MAP3, v(Q12, 'c3-c5'));
    expect(flaggedTerraceDrafts(cols, [{ target: { slotId: '3', position: 3 } }, { target: { slotId: '7', position: 7 } }])).toEqual([3, 7]);
  });
});

describe('자유로 놀기의 틀', () => {
  const lookup = (q: string, id: string): QuestVariant | undefined => {
    const all = [Q01, Q09, Q10, Q11, Q12].find((x) => x.questId === q);
    return all?.variants[id];
  };

  it('열이 여덟 개이고 판정 목표는 틀일 뿐이다(정답은 뜻이 없다). 변화표를 쓴다', () => {
    const frame = freeTerraceFrameOf(N1, lookup)!;
    expect(frame.evaluatorSpec.type).toBe('pitchSpelling');
    expect((frame.evaluatorSpec as { targets: unknown[] }).targets).toHaveLength(8);
    expect(frame.challengeDescriptor.accidentals).toBe('mixed');
    expect(frame.challengeDescriptor.range).toBe('A3-C6');
    expect(frame.score.events).toEqual([]);
    const cols = terraceColumnsOf(MAP1, frame);
    expect(cols).toHaveLength(8);
    expect(cols.map((c) => c.label)).toEqual(['1번 열', '2번 열', '3번 열', '4번 열', '5번 열', '6번 열', '7번 열', '8번 열']);
    expect(cols.every((c) => c.clef === 'treble')).toBe(true);
  });

  it('음자리표가 둘인 가운데 턱의 틀은 높은음과 낮은음이 번갈아 선다(왼쪽부터): 이웃한 두 열에서 같은 높이를 견줄 수 있다', () => {
    const frame = freeTerraceFrameOf(N3, lookup)!;
    const cols = terraceColumnsOf(MAP3, frame);
    expect(cols.map((c) => c.clef)).toEqual(['treble', 'bass', 'treble', 'bass', 'treble', 'bass', 'treble', 'bass']);
    expect(cols[0]!.label).toBe('1번 열 · 높은음자리표');
    expect(cols[1]!.label).toBe('2번 열 · 낮은음자리표');
    expect(frame.score.staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
  });

  it('낮은음자리표의 밭은 낮은음 열만 있고 음역은 C2–E4다', () => {
    const frame = freeTerraceFrameOf(N2, lookup)!;
    expect(frame.challengeDescriptor.range).toBe('C2-E4');
    expect(terraceColumnsOf(MAP2, frame).every((c) => c.clef === 'bass')).toBe(true);
  });

  it('틀로 삼을 판본이 없으면 null이다', () => {
    expect(freeTerraceFrameOf(N1, () => undefined)).toBeNull();
  });
});

describe('카메라가 담을 곳(terraceFollowOf)', () => {
  it('밭 전체의 사각형은 열들의 사각형에 위쪽 56 px, 왼쪽 64 px의 글자 띠를 더한 것이다', () => {
    expect(TERRACE_LABEL_TOP).toBe(56);
    expect(TERRACE_LABEL_LEFT).toBe(64);
    const r1 = terraceBounds(N1);
    expect(r1).toEqual({ x: 4352 - 64, y: 304 - 56, w: 5428 - 4352 + 64, h: 1120 - 304 + 56 });
    const r3 = terraceBounds(N3);
    expect(r3.y).toBe(304 - 56);
    expect(r3.h).toBe(1696 - 304 + 56);
    expect(terraceBounds({ slots: [] })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('고른 열이 없으면 밭 가운데를 비춘다. 고른 열이 있으면 가로는 그 열 가운데, 세로는 등의 높이다', () => {
    const none = terraceFollowOf(N1, null)!;
    expect(none.focus).toEqual({ x: none.rect.x + none.rect.w / 2, y: none.rect.y + none.rect.h / 2 });
    const cols = terraceColumnsOf(MAP1, v(Q09, 'treble-lines'));
    const view = terraceViewOf(cols, withLamps([[2, written('B', 4)]]), { cursor: 2, flagged: new Set(), playing: new Set(), free: false });
    const at = terraceFollowOf(N1, view)!;
    expect(at.focus).toEqual({ x: 4400 + 140 * 2, y: 1000 - 48 * 6 });
    expect(at.rect).toEqual(terraceBounds(N1));
  });

  it('계단밭이 아니면 null이다', () => {
    expect(terraceFollowOf(inst('inst.village.scale-stones'), null)).toBeNull();
  });
});

describe('설계서 4.7의 값을 설치물 데이터가 지킨다', () => {
  const m = (map: TerraceMap): number => map.c4Y;
  it('모든 열의 사각형이 설치물의 범위 안에서 높이 범위를 덮는다: 가장 높은 칸(위 둘째 덧줄)과 가장 낮은 칸이 열 안에 있다', () => {
    for (const [instance, map] of [
      [N1, MAP1],
      [N2, MAP2],
      [N3, MAP3],
    ] as const) {
      const range = terraceRangeOf(map);
      const topY = terraceYOfStep(map, range.high) - TERRACE_STEP_PX / 2;
      const bottomY = terraceYOfStep(map, range.low) + TERRACE_STEP_PX / 2;
      for (const s of instance.slots) {
        expect(s.y, `${instance.installationId} ${s.slot} 위`).toBeLessThanOrEqual(topY);
        expect(s.y + s.h, `${instance.installationId} ${s.slot} 아래`).toBeGreaterThanOrEqual(bottomY);
      }
      expect(m(map)).toBe(1000);
    }
  });
});

describe('밭의 돌담(월드가 그린다): 줄, 가운데 턱, 덧줄(7-1d)', () => {
  it('한 음자리표의 다섯 줄: 높은음은 E4 G4 B4 D5 F5, 낮은음은 G2 B2 D3 F3 A3. 세로 좌표는 c4Y에서 48 px씩 올라간다', () => {
    const name = (step: number): string => {
      const p = terracePitchAtStep(step);
      return `${p.letter}${p.octave}`;
    };
    expect(terraceStaffSteps('treble')).toEqual([2, 4, 6, 8, 10]);
    expect(terraceStaffSteps('treble').map(name)).toEqual(['E4', 'G4', 'B4', 'D5', 'F5']);
    expect(terraceStaffSteps('bass')).toEqual([-10, -8, -6, -4, -2]);
    expect(terraceStaffSteps('bass').map(name)).toEqual(['G2', 'B2', 'D3', 'F3', 'A3']);
    expect(terraceStaffSteps('treble').map((s) => terraceYOfStep(MAP3, s))).toEqual([904, 808, 712, 616, 520]);
    expect(terraceStaffSteps('bass').map((s) => terraceYOfStep(MAP3, s))).toEqual([1480, 1384, 1288, 1192, 1096]);
    // 보표 위치(0, 2, 4, 6, 8)로 읽어도 같다
    for (const clef of ['treble', 'bass'] as const) expect(terraceStaffSteps(clef).map((s) => terracePositionOf(clef, s))).toEqual([0, 2, 4, 6, 8]);
  });

  it('밭의 돌담: 음자리표마다 다섯 줄, 두 음자리표가 모두 있으면 두 보표 사이에 가운데 턱(C4, 위치 0)이 하나 선다. 아래에서 위로 정렬한다', () => {
    const both = terraceFieldWalls(['treble', 'bass']);
    expect(both.map((w) => w.step)).toEqual([-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]);
    expect(both.filter((w) => w.kind === 'middle')).toEqual([{ step: 0, kind: 'middle' }]);
    expect(both.filter((w) => w.kind === 'line')).toHaveLength(10);
    // 가운데 턱은 가온 도의 세로 자리다
    expect(terraceYOfStep(MAP3, both.find((w) => w.kind === 'middle')!.step)).toBe(1000);
    // 음자리표를 알리는 차례와 상관없이 같다
    expect(terraceFieldWalls(['bass', 'treble'])).toEqual(both);
    // 하나뿐인 밭에는 가운데 턱이 없다
    expect(terraceFieldWalls(['treble'])).toEqual([2, 4, 6, 8, 10].map((step) => ({ step, kind: 'line' })));
    expect(terraceFieldWalls(['bass'])).toEqual([-10, -8, -6, -4, -2].map((step) => ({ step, kind: 'line' })));
    expect(terraceFieldWalls([])).toEqual([]);
  });

  it('덧줄: 보표 밖의 줄(짝수 위치)을 놓은 음까지 보표에 가까운 쪽부터 긋는다. 보표 안과 보표 바로 옆 칸(−1, 9)은 덧줄이 없다', () => {
    // 높은음자리표: 위치 −4 −3 −2 −1 → 덧줄 2 1 1 0개, 위치 9 10 11 12 → 0 1 1 2개
    expect(terraceLedgerSteps('treble', -2)).toEqual([0, -2]);
    expect(terraceLedgerSteps('treble', -1)).toEqual([0]);
    expect(terraceLedgerSteps('treble', 0)).toEqual([0]);
    expect(terraceLedgerSteps('treble', 1)).toEqual([]);
    expect(terraceLedgerSteps('treble', 11)).toEqual([]);
    expect(terraceLedgerSteps('treble', 12)).toEqual([12]);
    expect(terraceLedgerSteps('treble', 13)).toEqual([12]);
    expect(terraceLedgerSteps('treble', 14)).toEqual([12, 14]);
    // 낮은음자리표
    expect(terraceLedgerSteps('bass', -14)).toEqual([-12, -14]);
    expect(terraceLedgerSteps('bass', -13)).toEqual([-12]);
    expect(terraceLedgerSteps('bass', -12)).toEqual([-12]);
    expect(terraceLedgerSteps('bass', -11)).toEqual([]);
    expect(terraceLedgerSteps('bass', 0)).toEqual([0]);
    expect(terraceLedgerSteps('bass', 1)).toEqual([0]);
    expect(terraceLedgerSteps('bass', 2)).toEqual([0, 2]);
  });

  it('덧줄은 두 음자리표가 쓰는 모든 높이에서 보표 밖의 짝수 위치에만 있고, 가운데 턱(C4)이 높은음자리표의 아래 첫 덧줄이자 낮은음자리표의 위 첫 덧줄이다', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const range = clefStepRange(clef);
      const inStaff = new Set(terraceStaffSteps(clef));
      for (let step = range.min; step <= range.max; step++) {
        const ledgers = terraceLedgerSteps(clef, step);
        const position = terracePositionOf(clef, step);
        expect(ledgers.length, `${clef} ${step}`).toBe(position <= -2 ? Math.floor(-position / 2) : position >= 10 ? Math.floor((position - 8) / 2) : 0);
        for (const l of ledgers) {
          const p = terracePositionOf(clef, l);
          expect(p % 2 === 0, `${clef} ${step} 덧줄 ${l}`).toBe(true);
          expect(inStaff.has(l), `${clef} ${step} 덧줄 ${l}`).toBe(false);
          // 놓은 음에서 보표 쪽으로 가장 가까운 줄까지 닿는다
          expect(position <= -2 ? l >= step : l <= step).toBe(true);
        }
        // 두 개 넘는 덧줄은 이 밭이 받는 높이에 없다
        expect(ledgers.length).toBeLessThanOrEqual(2);
      }
    }
    expect(terraceLedgerSteps('treble', 0)).toContain(0);
    expect(terraceLedgerSteps('bass', 0)).toContain(0);
    expect(terraceLedgerSteps('treble', -2)[0]).toBe(terraceFieldWalls(['treble', 'bass']).find((w) => w.kind === 'middle')!.step);
  });
});
