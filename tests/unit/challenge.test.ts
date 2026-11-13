// 2-5·2-6의 순수 계산: 초안 → 판정 입력, 칸 놓기, 오선 놓기. 화면 없이 시안의 상태와 같은 문장이 나와야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clearCellEdit,
  clearStaffSlotEdit,
  draftScoreOf,
  eventAtCell,
  eventLabel,
  evaluateDraft,
  evaluatorInputOf,
  gridCellsOf,
  materialsOf,
  placeInCellEdit,
  placeOnStaffEdit,
  slotIdsOf,
  staffSlotsOf,
} from '@/domain/challenge';
import type { Material } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import { ChallengeSession } from '@/domain/session';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const q01 = quest('pitch.same-note-two-clefs');
const q02 = quest('rhythm.rest-in-a-bar');
const q07 = quest('scale.major');
const v01 = q01.variants['middle-c']!;
const v02 = q02.variants['quarter-rest']!;

const quarterNote = (t: string): Material => ({ kind: 'note', pitch: p(t), value: 'quarter' });
const quarterRest: Material = { kind: 'rest', value: 'quarter' };

function sessionFor(q: QuestDefinition, variantId: string): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  return s;
}

describe('Q02 박 칸', () => {
  const cells = gridCellsOf(v02);

  it('4/4 한 마디가 4분음표 칸 네 개다', () => {
    expect(cells.map((c) => [c.label, c.onsetTicks, c.durationTicks, c.measureIndex])).toEqual([
      ['1박', 0, 960, 0],
      ['2박', 960, 960, 0],
      ['3박', 1920, 960, 0],
      ['4박', 2880, 960, 0],
    ]);
  });

  it('놓을 재료는 판본의 음역 안 제자리 음 셋과 쉼이다', () => {
    const m = materialsOf(v02);
    expect(m.pitches.map((x) => `${x.letter}${x.octave}`)).toEqual(['C4', 'D4', 'E4']);
    expect(m.values).toEqual(['quarter']);
    expect(m.rests).toBe(true);
  });

  it('시안의 상태(둘째 박에 D4)에서 시안과 같은 피드백 문장이 나온다', () => {
    const s = sessionFor(q02, 'quarter-rest');
    s.apply(placeInCellEdit(v02, s.content(), cells[0]!, quarterNote('C4')));
    s.apply(placeInCellEdit(v02, s.content(), cells[1]!, quarterNote('D4')));
    s.apply(placeInCellEdit(v02, s.content(), cells[2]!, quarterNote('D4')));
    s.apply(placeInCellEdit(v02, s.content(), cells[3]!, quarterNote('E4')));
    const result = evaluateDraft(v02, s.content());
    expect(result.passed).toBe(false);
    expect(renderAll(result.issues, q02.feedbackRules)).toEqual(['두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.']);
    expect(result.issues[0]!.target).toMatchObject({ onsetTicks: 960 });
  });

  it('둘째 박을 쉼으로 고치면 통과한다. 고친 칸은 같은 사건 id를 쓰고 실행 취소 한 번으로 돌아간다', () => {
    const s = sessionFor(q02, 'quarter-rest');
    for (const [i, t] of [[0, 'C4'], [1, 'D4'], [2, 'D4'], [3, 'E4']] as const) s.apply(placeInCellEdit(v02, s.content(), cells[i]!, quarterNote(t)));
    const before = eventAtCell(s.content(), cells[1]!)!.eventId;
    s.apply(placeInCellEdit(v02, s.content(), cells[1]!, quarterRest));
    s.apply(placeInCellEdit(v02, s.content(), cells[2]!, quarterNote('D4')));
    expect(eventAtCell(s.content(), cells[1]!)!.eventId).toBe(before);
    expect(evaluateDraft(v02, s.content()).passed).toBe(true);
    s.undo();
    s.undo();
    expect(eventLabel(eventAtCell(s.content(), cells[1]!)!)).toBe('D4');
  });

  it('같은 것을 다시 놓아도 실행 취소 기록이 늘지 않는다', () => {
    const s = sessionFor(q02, 'quarter-rest');
    s.apply(placeInCellEdit(v02, s.content(), cells[0]!, quarterNote('C4')));
    const depth = s.undoDepth;
    s.apply(placeInCellEdit(v02, s.content(), cells[0]!, quarterNote('C4')));
    expect(s.undoDepth).toBe(depth);
  });

  it('비어 있는 칸을 지우려 하면 편집이 없다', () => {
    const s = sessionFor(q02, 'quarter-rest');
    expect(clearCellEdit(s.content(), cells[2]!)).toBeNull();
    s.apply(placeInCellEdit(v02, s.content(), cells[2]!, quarterRest));
    expect(clearCellEdit(s.content(), cells[2]!)).toEqual({ type: 'removeEvent', eventId: 'u-m0c2' });
  });

  it('아직 놓지 않은 칸이 있으면 마디에 남는 틱을 사실로 알려 준다', () => {
    const s = sessionFor(q02, 'quarter-rest');
    s.apply(placeInCellEdit(v02, s.content(), cells[0]!, quarterNote('C4')));
    const result = evaluateDraft(v02, s.content());
    expect(result.passed).toBe(false);
    const messages = renderAll(result.issues, q02.feedbackRules);
    expect(messages.join(' ')).toContain('2880틱이 남아요');
  });

  it('판정 입력은 악보(틱과 음 이름)뿐이다. 화면 좌표나 시간 필드가 없다(W-3)', () => {
    const s = sessionFor(q02, 'quarter-rest');
    s.apply(placeInCellEdit(v02, s.content(), cells[0]!, quarterNote('C4')));
    const input = evaluatorInputOf(v02, s.content());
    expect(Object.keys(input).sort()).toEqual(['score', 'type']);
    const text = JSON.stringify(input);
    expect(text).not.toMatch(/"(x|y|px|clientX|clientY|time|timestamp|ms)"/);
  });

  it('draftScoreOf는 목표 악보의 틀을 쓰고 목표 사건을 가져오지 않는다', () => {
    const s = sessionFor(q02, 'quarter-rest');
    const score = draftScoreOf(v02.score, s.content());
    expect(score.events).toEqual([]);
    expect(score.meter).toBe('4/4');
    expect(score.measureCount ?? 1).toBe(v02.score.measureCount ?? 1);
    expect(v02.score.events.length).toBe(4);
  });
});

describe('Q01 오선 놓기', () => {
  const slots = staffSlotsOf(v01);

  it('칸 둘: 높은음자리표 보표와 낮은음자리표 보표', () => {
    expect(slots.map((x) => [x.slot, x.slotId, x.label, x.clef])).toEqual([
      [0, 'treble', '높은음자리표 보표', 'treble'],
      [1, 'bass', '낮은음자리표 보표', 'bass'],
    ]);
    expect(slotIdsOf(v01)).toEqual(['treble', 'bass']);
  });

  it('높은음자리표 맨 아랫줄에 놓으면 E4로 읽고 실패한다', () => {
    const s = sessionFor(q01, 'middle-c');
    s.apply(placeOnStaffEdit(slots[0]!, 0));
    s.apply(placeOnStaffEdit(slots[1]!, 10));
    const input = evaluatorInputOf(v01, s.content());
    expect(input).toMatchObject({ type: 'pitchSpelling', placed: [{ slotId: 'treble', pitch: { letter: 'E', octave: 4, alter: 0 } }, { slotId: 'bass', pitch: { letter: 'C', octave: 4, alter: 0 } }] });
    const result = evaluateDraft(v01, s.content());
    expect(result.passed).toBe(false);
    expect(renderAll(result.issues, q01.feedbackRules)).toEqual(['지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.']);
  });

  it('두 보표에 하나씩 놓지 않으면 놓지 않은 쪽을 알려 준다', () => {
    const s = sessionFor(q01, 'middle-c');
    s.apply(placeOnStaffEdit(slots[0]!, -2));
    const result = evaluateDraft(v01, s.content());
    expect(renderAll(result.issues, q01.feedbackRules)).toEqual(['낮은음자리표 보표에 음이 아직 없어요.']);
  });

  it('높은음자리표 아래 첫 덧줄(−2)과 낮은음자리표 위 첫 덧줄(+10)이 정답이다', () => {
    const s = sessionFor(q01, 'middle-c');
    s.apply(placeOnStaffEdit(slots[0]!, -2));
    s.apply(placeOnStaffEdit(slots[1]!, 10));
    expect(evaluateDraft(v01, s.content()).passed).toBe(true);
  });

  it('같은 위치를 두 음자리표에 놓으면 소리 높이가 다르다고 말한다(−2는 낮은음자리표에서 E2)', () => {
    const s = sessionFor(q01, 'middle-c');
    s.apply(placeOnStaffEdit(slots[0]!, -2));
    s.apply(placeOnStaffEdit(slots[1]!, -2));
    const result = evaluateDraft(v01, s.content());
    expect(renderAll(result.issues, q01.feedbackRules)).toEqual(['지금 위치는 E2예요. 목표 C4는 낮은음자리표의 위 첫 덧줄에 있어요.']);
  });

  it('칸을 비우면 다시 놓지 않은 것으로 돌아간다', () => {
    const s = sessionFor(q01, 'middle-c');
    s.apply(placeOnStaffEdit(slots[0]!, -2));
    s.apply(clearStaffSlotEdit(slots[0]!));
    expect(s.content().slots).toEqual([]);
  });
});

describe('연결하지 않은 판정기', () => {
  it('아직 입력 만들기가 없는 판정기는 숨기지 않고 오류로 알린다', () => {
    // 일곱 판정기는 5단계에서 모두 연결했다. 앞으로 늘어날 종류를 흉내 낸 판본으로 확인한다
    const v = { ...q07.variants['c-major']!, evaluatorSpec: { type: 'futureEvaluator' } as never };
    expect(() => evaluatorInputOf(v, { slots: [], events: [], tuplets: [] })).toThrow('아직 연결하지 않았어요');
  });

  it('orderedScale은 자리 번호와 음이름만 판정기에 넘긴다', () => {
    const v = q07.variants['c-major']!;
    const input = evaluatorInputOf(v, { slots: [{ slot: 1, writtenPitch: { letter: 'C', accidental: null, octave: 4 } }], events: [], tuplets: [] });
    expect(input.type).toBe('orderedScale');
    if (input.type !== 'orderedScale') throw new Error('입력 종류');
    expect(input.placed).toHaveLength(8);
    expect(input.placed[0]).toEqual({ slot: 1, pitch: { letter: 'C', alter: 0, octave: 4 } });
    expect(input.placed[1]).toEqual({ slot: 2, pitch: null });
  });
});
