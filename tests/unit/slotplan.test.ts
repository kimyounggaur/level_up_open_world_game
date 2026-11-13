// 5-2·5-3 이름표·음정 질문·장3화음·전위의 칸 계획: 초안 → 판정기 입력. 화면 없이 인수 기준을 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft, evaluatorInputOf, staffSlotsOf } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import { writtenOf } from '@/domain/pitch';
import { ChallengeSession, validateSessionSnapshot } from '@/domain/session';
import type { DraftEdit } from '@/domain/session';
import {
  CHOICE_DIFFERENT,
  CHOICE_SAME,
  INVERSION_SLOT_COUNT,
  TRIAD_SLOT_COUNT,
  clearChoiceEdit,
  intervalAnswersOf,
  intervalChoiceText,
  intervalSlotsOf,
  inversionInputOf,
  parseIntervalChoice,
  rootPositionOf,
  setChoiceEdit,
  shiftToneOctaveEdit,
  swapToneEdit,
  toggleToneMuteEdit,
  toneCardsOf,
  triadInputOf,
} from '@/domain/slotplan';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const q04 = quest('pitch.same-sound-different-names');
const q05 = quest('chord.major-triad');
const q06 = quest('chord.inversion');
const q08 = quest('song.short-piece');

function open(q: QuestDefinition, variantId: string): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  return s;
}

const place = (slot: number, name: string): DraftEdit => ({ type: 'setSlot', slot, writtenPitch: writtenOf(p(name)) });
const texts = (q: QuestDefinition, s: ChallengeSession, variantId: string): string[] => renderAll(evaluateDraft(q.variants[variantId]!, s.content()).issues, q.feedbackRules);

// ---------------------------------------------------------------------------
describe('Q04 이름표 두 개(음이름 쓰기, 음자리표 없음)', () => {
  const v = q04.variants['name-tags']!;

  it('올려 부른 이름표와 내려 부른 이름표 둘이 칸이고, 오선 칸 계산(staffSlotsOf)은 쓰지 않는다', () => {
    expect(v.evaluatorSpec).toMatchObject({ type: 'pitchSpelling', targets: [{ slotId: 'up' }, { slotId: 'down' }] });
    expect(() => staffSlotsOf(v)).toThrow('음자리표');
  });

  it('C♯4와 D♭4는 같은 소리지만 이름이 다르다: 올린 이름은 C♯4, 내린 이름은 D♭4로 적어야 통과한다', () => {
    const s = open(q04, 'name-tags');
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'C', accidental: 'sharp', octave: 4 } });
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'D', accidental: 'flat', octave: 4 } });
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
  });

  it('두 이름표를 맞바꾸면 소리는 맞아도 이름이 달라서 통과하지 못한다', () => {
    const s = open(q04, 'name-tags');
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'D', accidental: 'flat', octave: 4 } });
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'C', accidental: 'sharp', octave: 4 } });
    const result = evaluateDraft(v, s.content());
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['WRONG_SPELLING_SAME_PITCH', 'WRONG_SPELLING_SAME_PITCH']);
    expect(texts(q04, s, 'name-tags')[0]).toContain('소리 높이는 같지만 이름이 달라요');
  });

  it('비어 있으면 아직 놓지 않았다고만 알린다', () => {
    const s = open(q04, 'name-tags');
    expect(evaluateDraft(v, s.content()).issues.map((i) => i.code)).toEqual(['MISSING_PLACEMENT', 'MISSING_PLACEMENT']);
  });
});

// ---------------------------------------------------------------------------
describe('Q04 음정 이름(고르는 답)', () => {
  const v = q04.variants['interval-names']!;

  it('질문마다 칸을 차례로 배정한다: 비교는 둘(소리, 표기), 이름 묻기는 하나', () => {
    const plan = intervalSlotsOf(v);
    expect(plan.map((x) => [x.slot, x.qid, x.part, x.label])).toEqual([
      [0, 'c1', 'sound', '소리'],
      [1, 'c1', 'notation', '표기'],
      [2, 'i1', 'interval', '음정 이름'],
      [3, 'i2', 'interval', '음정 이름'],
    ]);
  });

  it('고른 답은 글자로만 초안에 담긴다: 같음/다름과 "성질:도수"', () => {
    expect(intervalChoiceText({ quality: 'augmented', diatonicNumber: 2 })).toBe('augmented:2');
    expect(parseIntervalChoice('minor:3')).toEqual({ quality: 'minor', diatonicNumber: 3 });
    expect(parseIntervalChoice('weird:3')).toBeNull();
    expect(parseIntervalChoice('minor:0')).toBeNull();
    expect(parseIntervalChoice(undefined)).toBeNull();
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    s.apply(setChoiceEdit(2, 'augmented:2'));
    expect(s.content().slots).toEqual([
      { slot: 0, writtenPitch: null, choice: 'same' },
      { slot: 2, writtenPitch: null, choice: 'augmented:2' },
    ]);
  });

  it('답이 비어 있으면 질문마다 아직 답이 없다고 알린다', () => {
    const s = open(q04, 'interval-names');
    expect(intervalAnswersOf(v, s.content())).toEqual({ c1: undefined, i1: undefined, i2: undefined });
    expect(evaluateDraft(v, s.content()).issues.map((i) => i.code)).toEqual(['MISSING_PLACEMENT', 'MISSING_PLACEMENT', 'MISSING_PLACEMENT']);
  });

  it('비교 질문은 소리와 표기를 둘 다 골라야 답이 된다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    expect(intervalAnswersOf(v, s.content()).c1).toBeUndefined();
    s.apply(setChoiceEdit(1, CHOICE_DIFFERENT));
    expect(intervalAnswersOf(v, s.content()).c1).toEqual({ soundSame: true, notationSame: false });
  });

  it('C♯4와 D♭4는 같은 소리, 다른 표기이고, C4–D♯4는 증2도, C4–E♭4는 단3도다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    s.apply(setChoiceEdit(1, CHOICE_DIFFERENT));
    s.apply(setChoiceEdit(2, 'augmented:2'));
    s.apply(setChoiceEdit(3, 'minor:3'));
    const r = evaluateDraft(v, s.content());
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('세 반음이라는 이유만으로 증2도와 단3도를 바꿔 채점하지 않는다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    s.apply(setChoiceEdit(1, CHOICE_DIFFERENT));
    s.apply(setChoiceEdit(2, 'minor:3'));
    s.apply(setChoiceEdit(3, 'augmented:2'));
    const r = evaluateDraft(v, s.content());
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => [i.code, i.target?.slotId])).toEqual([['WRONG_INTERVAL', 'i1'], ['WRONG_INTERVAL', 'i2']]);
    expect(texts(q04, s, 'interval-names')[0]).toBe('C4에서 D♯4까지: 목표는 증2도. 지금 고른 것은 단3도.');
  });

  it('소리와 표기를 따로 틀린 이유를 알려 준다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_DIFFERENT));
    s.apply(setChoiceEdit(1, CHOICE_SAME));
    s.apply(setChoiceEdit(2, 'augmented:2'));
    s.apply(setChoiceEdit(3, 'minor:3'));
    const r = evaluateDraft(v, s.content());
    expect(r.issues.map((i) => i.code)).toEqual(['WRONG_SOUND_EQUIV', 'WRONG_NOTATION_EQUIV']);
  });

  it('고른 답을 지우면 칸이 비고 되돌리기로 다시 나타난다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(2, 'augmented:2'));
    s.apply(clearChoiceEdit(2));
    expect(s.content().slots).toEqual([]);
    s.undo();
    expect(s.content().slots).toEqual([{ slot: 2, writtenPitch: null, choice: 'augmented:2' }]);
  });

  it('고른 답이 담긴 세션은 저장하고 되살려도 같다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    s.apply(setChoiceEdit(2, 'augmented:2'));
    const snap = s.serialize();
    expect(validateSessionSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual([]);
    const again = ChallengeSession.restore(JSON.parse(JSON.stringify(snap)));
    expect(again.contentOf(q04.questId, 'interval-names').slots).toEqual(s.content().slots);
  });

  it('판정 입력에는 칸 번호 대신 질문 id와 답만 넘어가고 시간이나 좌표는 없다(W-3)', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    s.apply(setChoiceEdit(1, CHOICE_SAME));
    const input = evaluatorInputOf(v, s.content());
    expect(input).toEqual({ type: 'interval', answers: { c1: { soundSame: true, notationSame: true }, i1: undefined, i2: undefined } });
  });
});

// ---------------------------------------------------------------------------
describe('Q05 장3화음 조립', () => {
  const v = q05.variants['c-major']!;

  it('칸은 최대 넷이다(한 나무에 종 넷)', () => {
    expect(TRIAD_SLOT_COUNT).toBe(4);
  });

  it('C E G를 걸면 통과한다. 거는 칸의 순서는 상관없다', () => {
    const s = open(q05, 'c-major');
    s.apply(place(0, 'G4'));
    s.apply(place(1, 'C4'));
    s.apply(place(3, 'E4'));
    const r = evaluateDraft(v, s.content());
    expect(r.passed).toBe(true);
    expect(triadInputOf(v, s.content()).notes.map((n) => n.slotId)).toEqual(['tone-0', 'tone-1', 'tone-3']);
  });

  it('옥타브가 달라도 같은 음급이면 구성음이다(C4 E5 G4)', () => {
    const s = open(q05, 'c-major');
    s.apply(place(0, 'C4'));
    s.apply(place(1, 'E5'));
    s.apply(place(2, 'G4'));
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
  });

  it('C E G D는 실패한다: 더해진 D를 알려 준다', () => {
    const s = open(q05, 'c-major');
    for (const [i, n] of ['C4', 'E4', 'G4', 'D4'].entries()) s.apply(place(i, n));
    const r = evaluateDraft(v, s.content());
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => [i.code, i.target?.slotId])).toEqual([['EXTRA_NOTE', 'tone-3']]);
    expect(texts(q05, s, 'c-major')).toEqual(['D가 더해져 있어요. 이 화음의 구성음이 아니에요.']);
  });

  it('G가 빠지면 빠진 음을 알려 주고, 아무것도 걸지 않으면 개수를 알려 준다', () => {
    const s = open(q05, 'c-major');
    s.apply(place(0, 'C4'));
    s.apply(place(1, 'E4'));
    expect(evaluateDraft(v, s.content()).issues.map((i) => i.code)).toEqual(['MISSING_TONE']);
    expect(texts(q05, s, 'c-major')).toEqual(['G가 빠졌어요.']);
    expect(evaluateDraft(v, open(q05, 'c-major').content()).issues.map((i) => i.code)).toEqual(['NOTE_COUNT']);
  });

  it('같은 음을 두 번 걸면 겹쳤다고 알린다', () => {
    const s = open(q05, 'c-major');
    for (const [i, n] of ['C4', 'E4', 'G4', 'C5'].entries()) s.apply(place(i, n));
    const r = evaluateDraft(v, s.content());
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(['DUPLICATE_TONE']);
  });

  it('표기가 다르면 같은 소리여도 통과하지 않는다(G♯ 대신 A♭)', () => {
    const f = q05.variants['g-major']!;
    expect(f.evaluatorSpec).toMatchObject({ requiredSpellings: [{ letter: 'G' }, { letter: 'B' }, { letter: 'D' }] });
    const s = open(q05, 'g-major');
    for (const [i, n] of ['G4', 'B4', 'D5'].entries()) s.apply(place(i, n));
    expect(evaluateDraft(f, s.content()).passed).toBe(true);
    const wrong = open(q05, 'g-major');
    for (const [i, n] of ['G4', 'A♭4'.replace('♭', 'b'), 'D5'].entries()) wrong.apply(place(i, n));
    expect(evaluateDraft(f, wrong.content()).passed).toBe(false);
  });

  it('F장3화음(F A C)도 같은 방식이다', () => {
    const f = q05.variants['f-major']!;
    const s = open(q05, 'f-major');
    for (const [i, n] of ['A4', 'C5', 'F4'].entries()) s.apply(place(i, n));
    expect(evaluateDraft(f, s.content()).passed).toBe(true);
  });

  it('칸 번호가 범위 밖이면 판정 입력에서 빠진다', () => {
    const s = open(q05, 'c-major');
    s.apply(place(7, 'C4'));
    expect(triadInputOf(v, s.content()).notes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('Q06 베이스를 바꾸어 전위 만들기', () => {
  const cFirst = q06.variants['c-first']!;
  const cSecond = q06.variants['c-second']!;

  it('종 셋이 기본 위치로 걸린 채 시작한다: C3 E3 G3, F3 A3 C4, G3 B3 D4', () => {
    const names = (id: string) => rootPositionOf(q06.variants[id]!.evaluatorSpec as never).map((x) => `${x.letter}${x.alter === 1 ? '♯' : x.alter === -1 ? '♭' : ''}${x.octave}`);
    expect(names('c-first')).toEqual(['C3', 'E3', 'G3']);
    expect(names('f-first')).toEqual(['F3', 'A3', 'C4']);
    expect(names('g-second')).toEqual(['G3', 'B3', 'D4']);
    expect(INVERSION_SLOT_COUNT).toBe(3);
  });

  it('아무것도 건드리지 않은 초안에서도 카드는 기본 위치이고, 기본 위치는 제1전위 과제를 통과하지 못한다', () => {
    const s = open(q06, 'c-first');
    expect(toneCardsOf(cFirst, s.content()).map((c) => [c.slotId, c.name, c.muted, c.touched])).toEqual([
      ['tone-0', 'C3', false, false],
      ['tone-1', 'E3', false, false],
      ['tone-2', 'G3', false, false],
    ]);
    const r = evaluateDraft(cFirst, s.content());
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(['WRONG_INVERSION']);
    expect(texts(q06, s, 'c-first')[0]).toContain('C3');
  });

  it('C를 한 옥타브 올리면 가장 낮은 음이 E3가 되어 제1전위로 통과한다', () => {
    const s = open(q06, 'c-first');
    const edit = shiftToneOctaveEdit(cFirst, s.content(), 0, 1)!;
    expect(edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'C', accidental: null, octave: 4 } });
    s.apply(edit);
    expect(toneCardsOf(cFirst, s.content()).map((c) => c.name)).toEqual(['C4', 'E3', 'G3']);
    expect(evaluateDraft(cFirst, s.content()).passed).toBe(true);
  });

  it('G를 한 옥타브 내리면 G2가 가장 낮아 제2전위로 통과한다. 제1전위 과제로는 통과하지 못한다', () => {
    const s = open(q06, 'c-second');
    s.apply(shiftToneOctaveEdit(cSecond, s.content(), 2, -1)!);
    expect(toneCardsOf(cSecond, s.content()).map((c) => c.name)).toEqual(['C3', 'E3', 'G2']);
    expect(evaluateDraft(cSecond, s.content()).passed).toBe(true);
    expect(evaluateDraft(cFirst, s.content()).passed).toBe(false);
    expect(evaluateDraft(cFirst, s.content()).issues[0]!.params).toMatchObject({ actualInversion: '제2전위' });
  });

  it('화면 순서(가로 순서)를 바꿔도 전위는 그대로다', () => {
    const s = open(q06, 'c-first');
    s.apply(shiftToneOctaveEdit(cFirst, s.content(), 0, 1)!); // 제1전위
    const before = evaluateDraft(cFirst, s.content());
    expect(before.details).toMatchObject({ currentInversion: 'first' });
    s.apply(swapToneEdit(cFirst, s.content(), 0, 2)!);
    s.apply(swapToneEdit(cFirst, s.content(), 1, 2)!);
    const after = evaluateDraft(cFirst, s.content());
    expect(after.details).toMatchObject({ currentInversion: 'first', bassMidi: before.details && (before.details as { bassMidi: number }).bassMidi });
    expect(after.passed).toBe(true);
    expect(toneCardsOf(cFirst, s.content()).map((c) => c.name)).not.toEqual(['C4', 'E3', 'G3']);
    // 처음 기본 위치에서 순서만 바꿔도 제1전위가 되지 않는다
    const t = open(q06, 'c-first');
    t.apply(swapToneEdit(cFirst, t.content(), 0, 2)!);
    expect(toneCardsOf(cFirst, t.content()).map((c) => c.name)).toEqual(['G3', 'E3', 'C3']);
    expect(evaluateDraft(cFirst, t.content()).details).toMatchObject({ currentInversion: 'root' });
    expect(evaluateDraft(cFirst, t.content()).passed).toBe(false);
  });

  it('순서를 맞바꾸는 일은 실행 취소 한 칸이다', () => {
    const s = open(q06, 'c-first');
    s.apply(swapToneEdit(cFirst, s.content(), 0, 1)!);
    expect(s.undoDepth).toBe(1);
    s.undo();
    expect(s.content().slots).toEqual([]);
  });

  it('소리를 끈 종은 울리지 않는 것으로 센다: 가장 낮은 C3를 끄면 E3가 가장 낮지만 C가 빠졌다고 알린다', () => {
    const s = open(q06, 'c-first');
    s.apply(toggleToneMuteEdit(cFirst, s.content(), 0)!);
    expect(inversionInputOf(cFirst, s.content()).notes.map((n) => n.active)).toEqual([false, true, true]);
    const r = evaluateDraft(cFirst, s.content());
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(['INCOMPLETE_TRIAD']);
    expect(texts(q06, s, 'c-first')[0]).toContain('C');
    // 다시 켜면 처음으로 돌아간다
    s.apply(toggleToneMuteEdit(cFirst, s.content(), 0)!);
    expect(inversionInputOf(cFirst, s.content()).notes.every((n) => n.active)).toBe(true);
  });

  it('소리를 끈 종의 옥타브를 옮겨도 끈 채로 남는다', () => {
    const s = open(q06, 'c-first');
    s.apply(toggleToneMuteEdit(cFirst, s.content(), 1)!);
    s.apply(shiftToneOctaveEdit(cFirst, s.content(), 1, 1)!);
    expect(toneCardsOf(cFirst, s.content())[1]).toMatchObject({ name: 'E4', muted: true });
  });

  it('음역(C2–B5) 밖으로는 옥타브를 옮길 수 없다', () => {
    const s = open(q06, 'c-first');
    s.apply(shiftToneOctaveEdit(cFirst, s.content(), 0, -1)!);
    expect(toneCardsOf(cFirst, s.content())[0]!.name).toBe('C2');
    expect(shiftToneOctaveEdit(cFirst, s.content(), 0, -1)).toBeNull();
    let up = open(q06, 'c-first');
    for (let i = 0; i < 2; i++) up.apply(shiftToneOctaveEdit(cFirst, up.content(), 2, 1)!);
    expect(toneCardsOf(cFirst, up.content())[2]!.name).toBe('G5');
    expect(shiftToneOctaveEdit(cFirst, up.content(), 2, 1)).toBeNull();
    up = open(q06, 'c-first');
    expect(shiftToneOctaveEdit(cFirst, up.content(), 5, 1)).toBeNull();
  });

  it('F장3화음과 G장3화음의 전위도 한 번 옮겨서 만들 수 있다', () => {
    const cases: Array<[string, number, 1 | -1]> = [
      ['f-first', 0, 1], // A3 C4 F4
      ['f-second', 2, -1], // C3 F3 A3
      ['g-first', 0, 1], // B3 D4 G4
      ['g-second', 2, -1], // D3 G3 B3
    ];
    for (const [id, slot, delta] of cases) {
      const v = q06.variants[id]!;
      const s = open(q06, id);
      expect(evaluateDraft(v, s.content()).passed, `${id} 처음`).toBe(false);
      s.apply(shiftToneOctaveEdit(v, s.content(), slot, delta)!);
      expect(evaluateDraft(v, s.content()).passed, `${id} 한 번 옮긴 뒤`).toBe(true);
    }
  });

  it('정답 악보의 음들을 칸에 그대로 걸어도 통과한다(음역 안, 보표에 나눠 적은 악보)', () => {
    for (const id of q06.variantIds) {
      const v = q06.variants[id]!;
      const notes = v.score.events.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(3);
      const s = open(q06, id);
      notes.forEach((e, i) => {
        if (e.type !== 'note') return;
        s.apply({ type: 'setSlot', slot: i, writtenPitch: e.writtenPitch });
      });
      expect(evaluateDraft(v, s.content()).passed, id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Q08 합주 입력과 판정기 연결', () => {
  it('scoreArrangement는 초안을 악보로 만들어 넘긴다(목표 악보의 틀 위에 사용자의 사건만)', () => {
    const v = q08.variants['two-voices']!;
    const input = evaluatorInputOf(v, { slots: [], events: [], tuplets: [] });
    expect(input.type).toBe('scoreArrangement');
    if (input.type !== 'scoreArrangement') return;
    expect(input.score.events).toEqual([]);
    expect(input.score.voices.map((x) => x.voiceId)).toEqual(['v1', 'v2']);
    expect(input.score.measureCount).toBe(4);
  });

  it('아무것도 놓지 않으면 통과하지 못하고 성부마다 아직 없다고 알린다', () => {
    const s = open(q08, 'two-voices');
    const r = evaluateDraft(q08.variants['two-voices']!, s.content());
    expect(r.passed).toBe(false);
    expect(renderAll(r.issues, q08.feedbackRules).slice(0, 2)).toEqual(['위 성부가 아직 없어요.', '아래 성부가 아직 없어요.']);
  });

  it('연결하지 않은 종류의 판정기는 여전히 숨기지 않고 오류로 알린다', () => {
    const v = { ...q08.variants['two-voices']!, evaluatorSpec: { type: 'futureEvaluator' } as never };
    expect(() => evaluatorInputOf(v, { slots: [], events: [], tuplets: [] })).toThrow('아직 연결하지 않았어요');
  });
});

// ---------------------------------------------------------------------------
describe('초안 편집: 묶음(batch)과 고르는 답(choice)', () => {
  it('묶음 편집은 실행 취소 한 칸이고, 하나라도 틀리면 아무것도 바뀌지 않는다', () => {
    const s = open(q05, 'c-major');
    s.apply({ type: 'batch', edits: [place(0, 'C4'), place(1, 'E4')] });
    expect(s.undoDepth).toBe(1);
    expect(s.content().slots).toHaveLength(2);
    const before = JSON.stringify(s.content());
    expect(() => s.apply({ type: 'batch', edits: [place(2, 'G4'), { type: 'removeEvent', eventId: 'nope' }] })).toThrow('없는 사건');
    expect(JSON.stringify(s.content())).toBe(before);
    expect(s.undoDepth).toBe(1);
    s.undo();
    expect(s.content().slots).toEqual([]);
  });

  it('칸을 비우는 편집은 고른 답도 지운다. 같은 답을 다시 고르면 실행 취소 기록을 늘리지 않는다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    s.apply(setChoiceEdit(0, CHOICE_SAME));
    expect(s.undoDepth).toBe(1);
    s.apply(setChoiceEdit(0, CHOICE_DIFFERENT));
    expect(s.content().slots).toEqual([{ slot: 0, writtenPitch: null, choice: 'different' }]);
    s.apply(clearChoiceEdit(0));
    expect(s.content().slots).toEqual([]);
  });

  it('소리를 끈 표시는 칸의 음을 바꿔도 남고, 칸을 비우면 함께 사라진다', () => {
    const s = open(q06, 'c-first');
    s.apply(place(0, 'C3'));
    s.apply({ type: 'setSlotMuted', slot: 0, muted: true });
    s.apply(place(0, 'C4'));
    expect(s.content().slots).toEqual([{ slot: 0, writtenPitch: { letter: 'C', accidental: null, octave: 4 }, muted: true }]);
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: null });
    expect(s.content().slots).toEqual([]);
    expect(() => s.apply({ type: 'setSlotMuted', slot: 0, muted: true })).toThrow('비어 있어요');
  });
});
