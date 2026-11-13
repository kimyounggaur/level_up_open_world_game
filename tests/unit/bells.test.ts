// 6-7 종나무의 칸 계산(bells.ts)과 사건 목록 칸 계획(slotplan의 treeSlot, treeBellsOf, chordSequenceInputOf, chordRouteNotesOf).
// 화면과 월드가 같은 초안을 다른 모양으로 보는 길(초안 하나, 보는 방법 둘)과, 설계서 12.9의 6-7 완료 기준의 도메인 쪽 근거를 확인한다:
//   종탑에서 가로 순서만 바꾸면 전위가 그대로다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft, evaluatorInputOf } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import {
  bellCellOf,
  bellColumnsOf,
  bellDraftCount,
  bellDraftPosition,
  bellMapOf,
  bellPitchOf,
  bellSlotOf,
  bellStatesOf,
  bellTreeCountOf,
  bellViewOf,
  bellsStartHung,
  chordShapeTextOf,
  flaggedBellDrafts,
  treeChordMidis,
  treeChordText,
} from '@/domain/bells';
import type { BellMap } from '@/domain/bells';
import { parseInstallation } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { writtenOf } from '@/domain/pitch';
import { ChallengeSession } from '@/domain/session';
import type { DraftEdit } from '@/domain/session';
import {
  TONE_CHORD_TICKS,
  TONE_STEP_TICKS,
  TRIAD_SLOT_COUNT,
  chordRouteNotesOf,
  chordSequenceInputOf,
  hungTonesOfTree,
  isSequenceVariant,
  sequenceSpecOf,
  shiftToneOctaveEdit,
  toneShiftResult,
  toneSwapResult,
  treeBellsOf,
  treeSlot,
} from '@/domain/slotplan';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const inst = (id: string): InstallationDef => {
  const { installation, issues } = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', `${id}.json`), 'utf-8')), `${id}.json`);
  expect(issues).toEqual([]);
  return installation!;
};
const q05 = quest('chord.major-triad');
const q06 = quest('chord.inversion');
const q21 = quest('chord.primary-triads');
const q23 = quest('chord.progression-walk');
const W1 = inst('inst.bell-grove.three-bells');
const W3 = inst('inst.bell-grove.bell-tower');
const W4 = inst('inst.bell-grove.three-pillars');
const map = (i: InstallationDef): BellMap => bellMapOf(i)!;

const open = (q: QuestDefinition, variantId: string): ChallengeSession => {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  return s;
};
const hang = (s: ChallengeSession, slot: number, name: string): void => {
  const edit: DraftEdit = { type: 'setSlot', slot, writtenPitch: writtenOf(p(name)) };
  s.apply(edit);
};
const NONE = { cursor: null, ringOctave: null, flagged: new Set<number>(), playing: new Set<number>() };

describe('고리 번호 ↔ 나무·단·열', () => {
  it('종나무가 아니면 변환표가 없다', () => {
    expect(bellMapOf({})).toBeNull();
    expect(bellMapOf({ slotMap: { kind: 'orderedPitches', voiceId: 'v1' } })).toBeNull();
    expect(bellMapOf(W1)).toEqual({ kind: 'bellTree', form: 'tree', trees: 1, columns: 4, octaves: [5, 4, 3, 2] });
  });

  it('나무 W1: 1번은 맨 위 단(옥타브 5)의 첫 열, 7번은 둘째 단(4)의 셋째 열, 16번은 맨 아래 단(2)의 끝 열이다', () => {
    const m = map(W1);
    expect(bellCellOf(m, 1)).toEqual({ slot: 1, tree: 0, row: 0, column: 0, octave: 5, draft: 0 });
    expect(bellCellOf(m, 7)).toEqual({ slot: 7, tree: 0, row: 1, column: 2, octave: 4, draft: 2 });
    expect(bellCellOf(m, 16)).toEqual({ slot: 16, tree: 0, row: 3, column: 3, octave: 2, draft: 3 });
  });

  it('빈터 W4: 둘째 나무는 17번부터, 셋째 나무는 33번부터이고 초안 칸 번호는 나무 × 4 + 열이다', () => {
    const m = map(W4);
    expect(bellCellOf(m, 17)).toEqual({ slot: 17, tree: 1, row: 0, column: 0, octave: 5, draft: 4 });
    expect(bellCellOf(m, 48)).toEqual({ slot: 48, tree: 2, row: 3, column: 3, octave: 2, draft: 11 });
    expect(bellDraftCount(m)).toBe(12);
    expect(bellDraftCount(map(W1))).toBe(4);
    expect(bellDraftCount(map(W3))).toBe(3);
  });

  it('범위 밖의 번호는 null이다(0, 총수보다 큰 수, 정수가 아닌 수)', () => {
    const m = map(W1);
    for (const bad of [0, -1, 17, 1.5, Number.NaN]) expect(bellCellOf(m, bad), String(bad)).toBeNull();
    expect(bellCellOf(map(W3), 13)).toBeNull();
  });

  it('고리 번호 → (나무, 단, 열) → 고리 번호가 모든 설치물에서 제자리로 돌아온다', () => {
    for (const i of [W1, W3, W4]) {
      const m = map(i);
      for (const s of i.slots) {
        const c = bellCellOf(m, s.slot)!;
        expect(bellSlotOf(m, c.tree, c.octave, c.column), `${i.installationId} ${s.slot}`).toBe(s.slot);
      }
    }
  });

  it('나무에 없는 단이나 나무, 열은 null이다', () => {
    const m = map(W1);
    expect(bellSlotOf(m, 0, 6, 0)).toBeNull();
    expect(bellSlotOf(m, 0, 1, 0)).toBeNull();
    expect(bellSlotOf(m, 1, 4, 0)).toBeNull();
    expect(bellSlotOf(m, 0, 4, 4)).toBeNull();
    expect(bellSlotOf(m, -1, 4, 0)).toBeNull();
  });

  it('초안 칸 번호가 가리키는 나무와 열', () => {
    const m = map(W4);
    expect(bellDraftPosition(m, 0)).toEqual({ tree: 0, column: 0 });
    expect(bellDraftPosition(m, 6)).toEqual({ tree: 1, column: 2 });
    expect(bellDraftPosition(m, 11)).toEqual({ tree: 2, column: 3 });
    expect(bellDraftPosition(m, 12)).toBeNull();
    expect(bellDraftPosition(m, -1)).toBeNull();
    expect(bellDraftPosition(m, 0.5)).toBeNull();
  });

  it('판본마다 종 칸(열)의 수: 구성음 4, 전위 3, 사건 목록 4. 나무의 수: 1, 1, spec.trees', () => {
    expect(bellColumnsOf(q05.variants['c-major']!)).toBe(4);
    expect(bellColumnsOf(q06.variants['c-first']!)).toBe(3);
    expect(bellColumnsOf(q21.variants['c-major-pillars']!)).toBe(4);
    expect(bellTreeCountOf(q05.variants['c-major']!)).toBe(1);
    expect(bellTreeCountOf(q06.variants['c-first']!)).toBe(1);
    expect(bellTreeCountOf(q23.variants['c-major-walk']!)).toBe(3);
    expect(bellsStartHung(q06.variants['c-first']!)).toBe(true);
    expect(bellsStartHung(q05.variants['c-major']!)).toBe(false);
    expect(bellsStartHung(q21.variants['c-major-pillars']!)).toBe(false);
  });
});

describe('사건 목록의 칸 계획: 나무 × 4 + 열', () => {
  const v = q21.variants['c-major-pillars']!;

  it('treeSlot은 나무 × 4 + 열이다(Q05의 한 나무와 같은 번호 규칙)', () => {
    expect(TRIAD_SLOT_COUNT).toBe(4);
    expect([treeSlot(0, 0), treeSlot(0, 3), treeSlot(1, 0), treeSlot(2, 3)]).toEqual([0, 3, 4, 11]);
  });

  it('사건 목록 판본이다. 나무 셋의 종 칸은 칸 번호 0–3, 4–7, 8–11이다', () => {
    expect(isSequenceVariant(v)).toBe(true);
    expect(isSequenceVariant(q05.variants['c-major']!)).toBe(false);
    expect(sequenceSpecOf(v).trees).toBe(3);
    expect(() => sequenceSpecOf(q05.variants['c-major']!)).toThrow();
    const s = open(q21, 'c-major-pillars');
    expect(treeBellsOf(v, s.content(), 1).map((b) => b.slot)).toEqual([4, 5, 6, 7]);
    expect(treeBellsOf(v, s.content(), 2).map((b) => b.slotId)).toEqual(['tone-8', 'tone-9', 'tone-10', 'tone-11']);
  });

  it('없는 나무는 이유와 함께 거절한다', () => {
    const s = open(q21, 'c-major-pillars');
    expect(() => treeBellsOf(v, s.content(), 3)).toThrow(/0부터 2까지/);
    expect(() => treeBellsOf(v, s.content(), -1)).toThrow();
    expect(() => treeBellsOf(q06.variants['c-first']!, s.content(), 0)).toThrow(/종나무 판본이 아니에요/);
  });

  it('나무마다 걸린 음이 판정기의 입력이 된다: 같은 나무의 종은 같은 목록에 들어간다', () => {
    const s = open(q21, 'c-major-pillars');
    hang(s, 0, 'C4');
    hang(s, 2, 'E4');
    hang(s, 3, 'G4');
    hang(s, 4, 'F4');
    hang(s, 9, 'B4');
    const input = chordSequenceInputOf(v, s.content());
    expect(input.trees.map((t) => t.map((n) => [n.slotId, n.pitch.letter]))).toEqual([
      [['tone-0', 'C'], ['tone-2', 'E'], ['tone-3', 'G']],
      [['tone-4', 'F']],
      [['tone-9', 'B']],
    ]);
    expect(evaluatorInputOf(v, s.content())).toEqual(input);
  });

  it('세 나무에 제 화음을 걸면 판정이 통과한다', () => {
    const s = open(q21, 'c-major-pillars');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(s, treeSlot(0, i), n));
    ['F4', 'A4', 'C5'].forEach((n, i) => hang(s, treeSlot(1, i), n));
    ['G4', 'B4', 'D5'].forEach((n, i) => hang(s, treeSlot(2, i), n));
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
  });

  it('틀린 나무는 이름과 함께 알려 준다', () => {
    const s = open(q21, 'c-major-pillars');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(s, treeSlot(0, i), n));
    ['F4', 'A4'].forEach((n, i) => hang(s, treeSlot(1, i), n));
    ['G4', 'B4', 'D5'].forEach((n, i) => hang(s, treeSlot(2, i), n));
    const r = evaluateDraft(v, s.content());
    expect(r.passed).toBe(false);
    expect(renderAll(r.issues)).toEqual(['버금딸림화음 나무: C가 빠졌어요.']);
    expect(flaggedBellDrafts(r.issues)).toEqual([]);
  });

  it('걸린 종 하나 없이도 계산이 멈추지 않는다: 입력은 빈 나무 셋, 걷는 길은 빈 목록', () => {
    const s = open(q23, 'c-major-walk');
    const w = q23.variants['c-major-walk']!;
    expect(chordSequenceInputOf(w, s.content()).trees).toEqual([[], [], []]);
    expect(chordRouteNotesOf(w, s.content(), 'together')).toEqual([]);
    expect(hungTonesOfTree(w, s.content(), 0)).toEqual([]);
  });

  it('이어 걷기(Q23)는 사건의 차례(나무 0 → 1 → 2 → 0)대로 화음을 울리고, 화음 사이는 화음 길이만큼 뜬다', () => {
    const w = q23.variants['c-major-walk']!;
    const s = open(q23, 'c-major-walk');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(s, treeSlot(0, i), n));
    ['F4', 'A4', 'C5'].forEach((n, i) => hang(s, treeSlot(1, i), n));
    ['G4', 'B4', 'D5'].forEach((n, i) => hang(s, treeSlot(2, i), n));
    const together = chordRouteNotesOf(w, s.content(), 'together');
    expect(together).toHaveLength(12);
    expect(together.map((n) => n.onsetTick)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3].map((k) => k * TONE_CHORD_TICKS));
    expect(together.map((n) => n.midi)).toEqual([60, 64, 67, 65, 69, 72, 67, 71, 74, 60, 64, 67]);
    // 처음과 끝의 으뜸화음은 같은 나무(0)의 같은 종이다
    expect(together.slice(0, 3).map((n) => n.slot)).toEqual(together.slice(9).map((n) => n.slot));
    // 아래부터 차례로: 한 화음이 반 마디씩 3개 = 온음표 하나 반이 아니라 half × 3
    const up = chordRouteNotesOf(w, s.content(), 'ascending');
    expect(up.slice(0, 3).map((n) => n.onsetTick)).toEqual([0, TONE_STEP_TICKS, 2 * TONE_STEP_TICKS]);
    expect(up[3]!.onsetTick).toBe(3 * TONE_STEP_TICKS);
    // 가장 낮은 종만
    const low = chordRouteNotesOf(w, s.content(), 'lowest');
    expect(low.map((n) => n.midi)).toEqual([60, 65, 67, 60]);
  });

  it('걸린 종이 없는 나무는 한 화음 길이만큼 쉰다(길의 박자를 지킨다)', () => {
    const w = q23.variants['c-major-walk']!;
    const s = open(q23, 'c-major-walk');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(s, treeSlot(0, i), n));
    ['G4', 'B4', 'D5'].forEach((n, i) => hang(s, treeSlot(2, i), n));
    const notes = chordRouteNotesOf(w, s.content(), 'together');
    expect(notes.map((n) => n.onsetTick)).toEqual([0, 0, 0, 2, 2, 2, 3, 3, 3].map((k) => k * TONE_CHORD_TICKS));
  });

  it('나무 하나의 종들을 판본의 음이름 그대로 나열한다', () => {
    const s = open(q21, 'c-major-pillars');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(s, treeSlot(0, i), n));
    expect(treeChordText(v, s.content(), 0)).toBe('C4 E4 G4');
    expect(treeChordText(v, s.content(), 1)).toBe('');
  });
});

describe('종 상태와 월드의 모습', () => {
  it('걸지 않은 나무(Q05)는 종이 없다. 건 종은 초안 칸(열)과 음이름·MIDI를 가진다', () => {
    const v = q05.variants['c-major']!;
    const s = open(q05, 'c-major');
    expect(bellStatesOf(v, s.content())).toEqual([]);
    hang(s, 0, 'C4');
    hang(s, 1, 'E5');
    hang(s, 3, 'G4');
    expect(bellStatesOf(v, s.content()).map((b) => [b.draft, b.tree, b.column, b.name, b.midi, b.octave, b.muted, b.lowest])).toEqual([
      [0, 0, 0, 'C4', 60, 4, false, false],
      [1, 0, 1, 'E5', 76, 5, false, false],
      [3, 0, 3, 'G4', 67, 4, false, false],
    ]);
  });

  it('월드가 그리는 모양: 종은 열(가로)과 옥타브(가지 단)가 만나는 고리에 걸린다', () => {
    const v = q05.variants['c-major']!;
    const s = open(q05, 'c-major');
    hang(s, 0, 'C4');
    hang(s, 1, 'E5');
    hang(s, 3, 'G4');
    const view = bellViewOf(map(W1), v, s.content(), { ...NONE, cursor: 2, ringOctave: 4, flagged: new Set([3]), playing: new Set([0]) });
    // C4(열 0, 옥타브 4 = 둘째 단): 5번, E5(열 1, 옥타브 5 = 맨 위 단): 2번, G4(열 3, 옥타브 4): 8번
    expect(view.form).toBe('tree');
    expect(view.bells.map((b) => [b.slot, b.name, b.flagged, b.playing])).toEqual([
      [5, 'C4', false, true],
      [2, 'E5', false, false],
      [8, 'G4', true, false],
    ]);
    // 고른 열(2)은 아직 비어 있어서 새 종이 걸릴 단이 ringOctave(4)다
    expect(view.cursor).toBe(2);
    expect(view.cursorOctave).toBe(4);
    // 음역(C4–B5) 안의 단은 위에서부터 5, 4. 나머지(3, 2)는 쓰지 않는 가지다
    expect(view.usable).toEqual([5, 4]);
  });

  it('고른 열에 종이 걸려 있으면 그 종의 옥타브가 고른 단이다', () => {
    const v = q05.variants['c-major']!;
    const s = open(q05, 'c-major');
    hang(s, 1, 'E5');
    const view = bellViewOf(map(W1), v, s.content(), { ...NONE, cursor: 1, ringOctave: 3 });
    expect(view.cursorOctave).toBe(5);
    expect(bellViewOf(map(W1), v, s.content(), NONE).cursor).toBeNull();
    expect(bellViewOf(map(W1), v, s.content(), NONE).cursorOctave).toBeNull();
  });

  it('나무에 없는 단의 종은 그리지 않는다(옥타브 6)', () => {
    const v = q05.variants['c-major']!;
    const s = open(q05, 'c-major');
    hang(s, 0, 'C6');
    expect(bellStatesOf(v, s.content())).toHaveLength(1);
    expect(bellViewOf(map(W1), v, s.content(), NONE).bells).toEqual([]);
  });

  it('빈터에서는 나무마다의 종이 제 나무의 고리에 걸리고, 나무마다의 화음을 알 수 있다', () => {
    const v = q21.variants['c-major-pillars']!;
    const s = open(q21, 'c-major-pillars');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(s, treeSlot(0, i), n));
    ['F4', 'A4', 'C5'].forEach((n, i) => hang(s, treeSlot(1, i), n));
    const view = bellViewOf(map(W4), v, s.content(), NONE);
    // 둘째 나무(고리 17–32): F4(열 0, 옥타브 4 → 둘째 단) = 21, A4(열 1) = 22, C5(열 2, 옥타브 5 → 맨 위 단) = 19
    expect(view.bells.filter((b) => b.tree === 1).map((b) => [b.slot, b.name])).toEqual([[21, 'F4'], [22, 'A4'], [19, 'C5']]);
    expect(treeChordMidis(view, 0)).toEqual([60, 64, 67]);
    expect(treeChordMidis(view, 1)).toEqual([65, 69, 72]);
    expect(treeChordMidis(view, 2)).toEqual([]);
  });

  it('판정 문제가 가리키는 종은 표식이 된다(tone-N → 초안 칸 N)', () => {
    expect(flaggedBellDrafts([{ target: { slotId: 'tone-3' } }, { target: { slotId: 'tone-1' } }, { target: { slotId: 'tone-3' } }, { target: { slotId: 'other' } }, {}])).toEqual([1, 3]);
    expect(flaggedBellDrafts([])).toEqual([]);
  });

  it('기보 음은 판본의 조표를 따라 소리가 된다(종은 조표 없이 쓴다)', () => {
    const v = q05.variants['c-major']!;
    expect(bellPitchOf(v, writtenOf(p('Eb4')))).toEqual(p('Eb4'));
    expect(bellPitchOf(v, { letter: 'F', accidental: null, octave: 4 })).toEqual(p('F4'));
  });
});

describe('종탑(Q06): 종이 처음부터 걸려 있고, 가장 낮은 종을 알린다', () => {
  const v = q06.variants['c-first']!;

  it('처음에는 기본 위치 C3 E3 G3이고 가장 낮은 종은 C3다', () => {
    const s = open(q06, 'c-first');
    const states = bellStatesOf(v, s.content());
    expect(states.map((b) => [b.column, b.name, b.lowest])).toEqual([[0, 'C3', true], [1, 'E3', false], [2, 'G3', false]]);
    const view = bellViewOf(map(W3), v, s.content(), NONE);
    // 옥타브 3은 셋째 단: 고리 번호 = (0 × 4 + 2) × 3 + 열 + 1 = 7, 8, 9
    expect(view.bells.map((b) => b.slot)).toEqual([7, 8, 9]);
    expect(view.usable).toEqual([5, 4, 3, 2]);
  });

  it('소리를 끈 종은 가장 낮은 종이 되지 않는다', () => {
    const s = open(q06, 'c-first');
    s.apply({ type: 'batch', edits: [{ type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('C3')) }, { type: 'setSlotMuted', slot: 0, muted: true }] });
    const states = bellStatesOf(v, s.content());
    expect(states.map((b) => [b.name, b.muted, b.lowest])).toEqual([['C3', true, false], ['E3', false, true], ['G3', false, false]]);
  });

  describe('6-7 완료 기준(도메인): 가로 순서만 바꾸면 전위가 그대로다', () => {
    /** 종 하나의 소리를 옥타브만 올려 제1전위(E3 G3 C4)로 만든다 */
    function firstInversion(): ChallengeSession {
      const s = open(q06, 'c-first');
      const edit = shiftToneOctaveEdit(v, s.content(), 0, 1);
      expect(edit).not.toBeNull();
      s.apply(edit!);
      return s;
    }

    /** 이웃한 두 칸을 맞바꾸는 모든 차례(최대 네 번)로 닿을 수 있는 칸 배치를 모은다 */
    function swapWalks(s: ChallengeSession): ChallengeSession[] {
      const out: ChallengeSession[] = [];
      const seen = new Set<string>();
      const key = (x: ChallengeSession): string => bellStatesOf(v, x.content()).map((b) => b.name).join(' ');
      const queue: Array<{ s: ChallengeSession; depth: number }> = [{ s, depth: 0 }];
      seen.add(key(s));
      while (queue.length > 0) {
        const cur = queue.shift()!;
        out.push(cur.s);
        if (cur.depth === 4) continue;
        for (const [slot, dir] of [[0, 'right'], [1, 'right'], [1, 'left'], [2, 'left']] as const) {
          const r = toneSwapResult(v, cur.s.content(), slot, dir);
          if (!r.ok) continue;
          const next = new ChallengeSession(cur.s.serialize());
          next.apply(r.edit);
          const k = key(next);
          if (seen.has(k)) continue;
          seen.add(k);
          queue.push({ s: next, depth: cur.depth + 1 });
        }
      }
      return out;
    }

    it('기본 위치 C3 E3 G3은 제1전위가 아니다. 순서를 어떻게 바꿔도 같은 이유로 통과하지 못하고 문장도 같다', () => {
      const base = open(q06, 'c-first');
      const baseline = evaluateDraft(v, base.content());
      expect(baseline.passed).toBe(false);
      const walks = swapWalks(base);
      // 세 종의 순서는 모두 3! = 6가지다
      expect(walks).toHaveLength(6);
      for (const w of walks) {
        const r = evaluateDraft(v, w.content());
        expect(r, bellStatesOf(v, w.content()).map((b) => b.name).join(' ')).toEqual(baseline);
        expect(renderAll(r.issues)).toEqual(renderAll(baseline.issues));
      }
    });

    it('제1전위(E3 G3 C4)를 만들고 나면 순서를 어떻게 바꿔도 통과가 그대로다', () => {
      const first = firstInversion();
      const baseline = evaluateDraft(v, first.content());
      expect(baseline.passed).toBe(true);
      const walks = swapWalks(first);
      expect(walks).toHaveLength(6);
      for (const w of walks) {
        const r = evaluateDraft(v, w.content());
        expect(r.passed, bellStatesOf(v, w.content()).map((b) => b.name).join(' ')).toBe(true);
        expect(r).toEqual(baseline);
        expect(evaluatorInputOf(v, w.content())).toMatchObject({ type: 'inversion' });
      }
    });

    it('순서를 바꾸면 가로 칸(열)만 달라지고, 가장 낮은 종과 그 종이 걸린 단(옥타브)은 그대로다', () => {
      const first = firstInversion();
      const base = bellStatesOf(v, first.content());
      const baseLow = base.find((b) => b.lowest)!;
      expect(baseLow.name).toBe('E3');
      const sortedBase = [...base].map((b) => b.name).sort();
      let someColumnChanged = false;
      for (const w of swapWalks(first)) {
        const states = bellStatesOf(v, w.content());
        // 같은 세 음(소리)이고, 가장 낮은 종은 같은 E3다
        expect([...states].map((b) => b.name).sort()).toEqual(sortedBase);
        const low = states.find((b) => b.lowest)!;
        expect([low.name, low.octave, low.midi]).toEqual([baseLow.name, baseLow.octave, baseLow.midi]);
        // 월드의 고리: 같은 단(옥타브)의 고리 번호만 열을 따라 움직인다
        const view = bellViewOf(map(W3), v, w.content(), NONE);
        const rows = view.bells.map((b) => (b.slot - 1) / 3).map((x) => Math.floor(x)).sort();
        expect(rows).toEqual(bellViewOf(map(W3), v, first.content(), NONE).bells.map((b) => Math.floor((b.slot - 1) / 3)).sort());
        if (states.some((b, i) => b.name !== base[i]!.name)) someColumnChanged = true;
      }
      expect(someColumnChanged).toBe(true);
    });

    it('옥타브를 옮기는 것은 전위를 바꾼다(순서와 다르다): C3을 올리면 가장 낮은 종이 E3가 된다', () => {
      const s = open(q06, 'c-first');
      expect(bellStatesOf(v, s.content()).find((b) => b.lowest)!.name).toBe('C3');
      const r = toneShiftResult(v, s.content(), 0, 1);
      expect(r.ok).toBe(true);
      if (r.ok) {
        s.apply(r.edit);
        expect(r.text).toContain('가장 낮은 음은 E3');
      }
      expect(evaluateDraft(v, s.content()).passed).toBe(true);
    });
  });
});

describe('화음의 전위 알림(Q23): 알려 주기만 하고 판정은 바꾸지 않는다(5.5)', () => {
  const v = q23.variants['c-major-walk']!;
  const LEAD = '전위는 판정하지 않고 알려만 줘요. ';
  const hangTree = (s: ChallengeSession, tree: number, names: string[]): void => names.forEach((n, i) => hang(s, treeSlot(tree, i), n));
  /** 으뜸화음을 첫째 나무에, 버금딸림화음을 둘째 나무에, 딸림화음을 셋째 나무에 건다 */
  const walk = (first: string[], second: string[], third: string[]): ChallengeSession => {
    const s = open(q23, 'c-major-walk');
    hangTree(s, 0, first);
    hangTree(s, 1, second);
    hangTree(s, 2, third);
    return s;
  };

  it('모두 기본 위치로 걸면 네 화음 모두 기본 위치라고 한 문장으로 말한다(마지막 으뜸화음은 첫째 나무를 다시 읽는다)', () => {
    const s = walk(['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']);
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
    expect(chordShapeTextOf(v, s.content())).toBe(`${LEAD}처음 으뜸화음은 기본 위치, 버금딸림화음은 기본 위치, 딸림화음은 기본 위치, 마지막 으뜸화음은 기본 위치예요.`);
  });

  it('전위로 걸어도 통과하고, 가장 낮은 음을 보고 제1전위와 제2전위를 말한다', () => {
    const s = walk(['E3', 'G4', 'C5'], ['F4', 'A4', 'C5'], ['D3', 'G4', 'B4']);
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
    expect(chordShapeTextOf(v, s.content())).toBe(`${LEAD}처음 으뜸화음은 제1전위, 버금딸림화음은 기본 위치, 딸림화음은 제2전위, 마지막 으뜸화음은 제1전위예요.`);
  });

  it('전위만 다른 두 배치는 같은 판정을 받는다: 알림이 다를 뿐 통과와 문제는 같다', () => {
    const root = walk(['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']);
    const inverted = walk(['E3', 'G4', 'C5'], ['A3', 'C5', 'F5'], ['B3', 'D5', 'G5']);
    const a = evaluateDraft(v, inverted.content());
    const b = evaluateDraft(v, root.content());
    expect([a.passed, a.issues]).toEqual([b.passed, b.issues]);
    expect(a.passed).toBe(true);
    expect(chordShapeTextOf(v, inverted.content())).not.toBe(chordShapeTextOf(v, root.content()));
  });

  it('구성음이 다 걸려 있지 않은 화음은 전위를 알 수 없어 말하지 않는다', () => {
    const s = walk(['C4', 'E4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']);
    expect(evaluateDraft(v, s.content()).passed).toBe(false);
    expect(chordShapeTextOf(v, s.content())).toBe(`${LEAD}버금딸림화음은 기본 위치, 딸림화음은 기본 위치예요.`);
  });

  it('하나도 걸지 않았으면 말할 것이 없다(null)', () => {
    expect(chordShapeTextOf(v, open(q23, 'c-major-walk').content())).toBeNull();
  });

  it('알릴 전위가 없는 판본은 null이다: Q21은 사건에 reportTones가 없고, 나무와 종탑은 사건 목록이 아니다', () => {
    const pillars = open(q21, 'c-major-pillars');
    hangTree(pillars, 0, ['C4', 'E4', 'G4']);
    hangTree(pillars, 1, ['F4', 'A4', 'C5']);
    hangTree(pillars, 2, ['G4', 'B4', 'D5']);
    expect(evaluateDraft(q21.variants['c-major-pillars']!, pillars.content()).passed).toBe(true);
    expect(chordShapeTextOf(q21.variants['c-major-pillars']!, pillars.content())).toBeNull();
    expect(chordShapeTextOf(q05.variants['c-major']!, open(q05, 'c-major').content())).toBeNull();
    expect(chordShapeTextOf(q06.variants['c-first']!, open(q06, 'c-first').content())).toBeNull();
  });

  it('가로 위치와 걸은 시간은 들어오지 못한다: 같은 음을 다른 칸 번호에 걸어도 같은 말이다(W-3)', () => {
    const a = open(q23, 'c-major-walk');
    ['C4', 'E4', 'G4'].forEach((n, i) => hang(a, treeSlot(0, i), n));
    ['F4', 'A4', 'C5'].forEach((n, i) => hang(a, treeSlot(1, i), n));
    ['G4', 'B4', 'D5'].forEach((n, i) => hang(a, treeSlot(2, i), n));
    const b = open(q23, 'c-major-walk');
    ['G4', 'C4', 'E4'].forEach((n, i) => hang(b, treeSlot(0, i), n));
    ['C5', 'F4', 'A4'].forEach((n, i) => hang(b, treeSlot(1, i), n));
    ['D5', 'G4', 'B4'].forEach((n, i) => hang(b, treeSlot(2, i), n));
    expect(chordShapeTextOf(v, b.content())).toBe(chordShapeTextOf(v, a.content()));
  });
});
