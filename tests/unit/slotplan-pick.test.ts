// 5-2·5-3 눌러서 고르는 화면이 쓰는 계산: 이름표와 종의 음이름·변화·옥타브 고르기, 음정 답, 종 연주 모드, 악보 만들기.
// 화면 없이 인수 기준을 다시 확인한다(C♯4와 D♭4는 같은 소리 다른 표기, C E G D는 실패, 순서를 바꿔도 전위는 그대로).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import { midiOf } from '@/domain/pitch';
import { ChallengeSession } from '@/domain/session';
import type { DraftEdit } from '@/domain/session';
import {
  EMPTY_INTERVAL_PICK,
  TONE_CHORD_TICKS,
  TONE_STEP_TICKS,
  hungTonesOf,
  intervalPickEdit,
  intervalPickName,
  intervalPickOf,
  intervalSlotsOf,
  isNameTagVariant,
  lowestToneOf,
  nameTagPlanOf,
  nameTagTonesOf,
  pickedNameOf,
  pitchPickEdit,
  pitchPickRulesOf,
  questionPitches,
  questionScoreOf,
  setChoiceEdit,
  soundingTonesOf,
  swapToneEdit,
  toggleToneMuteEdit,
  toneDisplayScore,
  toneNotesOf,
  triadBellsOf,
} from '@/domain/slotplan';
import type { PitchChange } from '@/domain/slotplan';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const q01 = quest('pitch.same-note-two-clefs');
const q04 = quest('pitch.same-sound-different-names');
const q05 = quest('chord.major-triad');
const q06 = quest('chord.inversion');

function open(q: QuestDefinition, variantId: string): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  return s;
}

/** 이름 고르기를 한 번 하고(편집이 있으면 담고) 문장을 돌려준다 */
function pick(q: QuestDefinition, variantId: string, s: ChallengeSession, slot: number, label: string, change: PitchChange): { ok: boolean; text: string; edited: boolean } {
  const v = q.variants[variantId]!;
  const r = pitchPickEdit(v, s.content(), slot, label, change, pitchPickRulesOf(v));
  if (r.ok && r.edit) s.apply(r.edit);
  return { ok: r.ok, text: r.text, edited: r.ok && r.edit !== null };
}

const letter = (l: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'): PitchChange => ({ part: 'letter', letter: l });
const sharp: PitchChange = { part: 'accidental', accidental: 'sharp' };
const flat: PitchChange = { part: 'accidental', accidental: 'flat' };

const messages = (q: QuestDefinition, variantId: string, s: ChallengeSession): string[] => renderAll(evaluateDraft(q.variants[variantId]!, s.content()).issues, q.feedbackRules);

// ---------------------------------------------------------------------------
describe('이름표 계획(5-2)', () => {
  const v = q04.variants['name-tags']!;

  it('음자리표가 없는 음이름 판본만 이름표 판본이다', () => {
    expect(isNameTagVariant(v)).toBe(true);
    expect(isNameTagVariant(q01.variants[Object.keys(q01.variants)[0]!]!)).toBe(false);
    expect(isNameTagVariant(q04.variants['interval-names']!)).toBe(false);
    expect(() => nameTagPlanOf(q04.variants['interval-names']!)).toThrow('이름표 판본');
  });

  it('칸은 올려 부른 이름표와 내려 부른 이름표이고, 옥타브는 음역(C4–D4)의 4 하나다', () => {
    const plan = nameTagPlanOf(v);
    expect(plan.slots).toEqual([
      { slot: 0, slotId: 'up', label: '올려 부른 이름표' },
      { slot: 1, slotId: 'down', label: '내려 부른 이름표' },
    ]);
    expect(plan.rules).toEqual({ octaves: [4], defaultOctave: 4 });
  });

  it('두 이름표가 부르는 소리는 하나의 검은 건반이고, 왼쪽 흰 건반은 C4, 오른쪽 흰 건반은 D4다(건반 그림용)', () => {
    const key = nameTagPlanOf(v).key!;
    expect(key.midi).toBe(61);
    expect(key.lower).toEqual(p('C4'));
    expect(key.upper).toEqual(p('D4'));
  });
});

describe('이름 고르기(pitchPickEdit)', () => {
  it('음이름을 고르면 변화표 없이 처음 옥타브로 걸린다', () => {
    const s = open(q04, 'name-tags');
    const r = pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('C'));
    expect(r).toMatchObject({ ok: true, edited: true });
    expect(r.text).toBe('올려 부른 이름표: C4로 걸었어요.');
    expect(s.content().slots).toEqual([{ slot: 0, writtenPitch: { letter: 'C', accidental: null, octave: 4 } }]);
  });

  it('변화표는 걸린 음에 붙고, 음이름을 바꿔도 변화표는 남는다', () => {
    const s = open(q04, 'name-tags');
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('C'));
    expect(pick(q04, 'name-tags', s, 0, '올려 부른 이름표', sharp).text).toBe('올려 부른 이름표: C♯4로 바꿨어요.');
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('D'));
    expect(pickedNameOf(q04.variants['name-tags']!, s.content(), 0)).toBe('D♯4');
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', { part: 'accidental', accidental: null });
    expect(pickedNameOf(q04.variants['name-tags']!, s.content(), 0)).toBe('D4');
  });

  it('아직 음이름이 없는 칸에는 변화표도 옥타브도 고를 수 없고 이유만 알린다(초안은 그대로)', () => {
    const s = open(q04, 'name-tags');
    const a = pick(q04, 'name-tags', s, 1, '내려 부른 이름표', flat);
    expect(a).toEqual({ ok: false, text: '내려 부른 이름표: 먼저 음이름을 골라 주세요.', edited: false });
    expect(pick(q04, 'name-tags', s, 1, '내려 부른 이름표', { part: 'octave', octave: 4 }).ok).toBe(false);
    expect(s.content().slots).toEqual([]);
    expect(s.undoDepth).toBe(0);
  });

  it('이미 그렇게 걸려 있으면 편집 없이 알려 주고 실행 취소 기록을 늘리지 않는다', () => {
    const s = open(q04, 'name-tags');
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('C'));
    const depth = s.undoDepth;
    const again = pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('C'));
    expect(again).toEqual({ ok: true, text: '올려 부른 이름표: 이미 C4예요.', edited: false });
    expect(s.undoDepth).toBe(depth);
  });

  it('옥타브는 판본의 음역 안에서만 고른다: 이름표(C4–D4)는 5옥타브가 없고, 종(C4–B5)은 5옥타브까지 있다', () => {
    const tags = open(q04, 'name-tags');
    pick(q04, 'name-tags', tags, 0, '올려 부른 이름표', letter('C'));
    expect(pick(q04, 'name-tags', tags, 0, '올려 부른 이름표', { part: 'octave', octave: 5 })).toEqual({ ok: false, text: '올려 부른 이름표: 5옥타브는 이 도전의 음역 밖이에요.', edited: false });

    const bells = open(q05, 'c-major');
    expect(pitchPickRulesOf(q05.variants['c-major']!)).toEqual({ octaves: [4, 5], defaultOctave: 4 });
    pick(q05, 'c-major', bells, 0, '종 1', letter('G'));
    expect(pick(q05, 'c-major', bells, 0, '종 1', { part: 'octave', octave: 5 }).text).toBe('종 1: G5로 바꿨어요.');
    expect(pick(q05, 'c-major', bells, 0, '종 1', { part: 'octave', octave: 6 }).ok).toBe(false);
  });

  it('비우기는 걸린 칸만 비운다', () => {
    const s = open(q05, 'c-major');
    expect(pick(q05, 'c-major', s, 2, '종 3', { part: 'clear' })).toEqual({ ok: true, text: '종 3은 이미 비어 있어요.', edited: false });
    pick(q05, 'c-major', s, 2, '종 3', letter('E'));
    expect(pick(q05, 'c-major', s, 2, '종 3', { part: 'clear' }).text).toBe('종 3을 비웠어요.');
    expect(s.content().slots).toEqual([]);
  });

  it('5-2 완료 기준: 고르기만으로 올린 이름 C♯4와 내린 이름 D♭4를 걸면 같은 소리, 다른 표기로 통과한다', () => {
    const s = open(q04, 'name-tags');
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('C'));
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', sharp);
    pick(q04, 'name-tags', s, 1, '내려 부른 이름표', letter('D'));
    pick(q04, 'name-tags', s, 1, '내려 부른 이름표', flat);
    const tones = nameTagTonesOf(q04.variants['name-tags']!, s.content());
    expect(tones.map((t) => midiOf(t.pitch))).toEqual([61, 61]);
    expect(evaluateDraft(q04.variants['name-tags']!, s.content()).passed).toBe(true);
  });

  it('같은 소리라도 이름이 다르면 통과하지 못한다: 올려 부른 칸에 D♭4를 걸면 소리 높이는 같지만 이름이 다르다고 알린다', () => {
    const s = open(q04, 'name-tags');
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', letter('D'));
    pick(q04, 'name-tags', s, 0, '올려 부른 이름표', flat);
    pick(q04, 'name-tags', s, 1, '내려 부른 이름표', letter('D'));
    pick(q04, 'name-tags', s, 1, '내려 부른 이름표', flat);
    const ev = evaluateDraft(q04.variants['name-tags']!, s.content());
    expect(ev.passed).toBe(false);
    expect(ev.issues.map((i) => [i.code, i.target?.slotId])).toEqual([['WRONG_SPELLING_SAME_PITCH', 'up']]);
    expect(messages(q04, 'name-tags', s)[0]).toContain('소리 높이는 같지만 이름이 달라요');
  });

  it('비어 있는 이름표는 아직 답이 없다고 알린다(이름표와 음정 질문이 같은 문장을 쓴다)', () => {
    expect(messages(q04, 'name-tags', open(q04, 'name-tags'))).toEqual(['올려 부른 이름표: 아직 답이 없어요.', '내려 부른 이름표: 아직 답이 없어요.']);
    expect(messages(q04, 'interval-names', open(q04, 'interval-names'))[0]).toBe('C♯4와 D♭4: 아직 답이 없어요.');
  });
});

// ---------------------------------------------------------------------------
describe('음정 답 고르기(5-2)', () => {
  const v = q04.variants['interval-names']!;

  it('성질과 도수 둘을 모두 골라야 답이 되고, 하나만 고르면 초안은 그대로다', () => {
    expect(intervalPickEdit(2, { quality: 'augmented', number: null })).toBeNull();
    expect(intervalPickEdit(2, { quality: null, number: 2 })).toBeNull();
    expect(intervalPickEdit(2, EMPTY_INTERVAL_PICK)).toBeNull();
    expect(intervalPickEdit(2, { quality: 'augmented', number: 2 })).toEqual(setChoiceEdit(2, 'augmented:2'));
  });

  it('고른 답을 읽고 이름으로 바꾼다. 읽을 수 없는 글자는 비어 있는 것이다', () => {
    expect(intervalPickOf('augmented:2')).toEqual({ quality: 'augmented', number: 2 });
    expect(intervalPickName(intervalPickOf('augmented:2'))).toBe('증2도');
    expect(intervalPickName(intervalPickOf('minor:3'))).toBe('단3도');
    expect(intervalPickOf(undefined)).toEqual(EMPTY_INTERVAL_PICK);
    expect(intervalPickOf('same')).toEqual(EMPTY_INTERVAL_PICK);
    expect(intervalPickName({ quality: 'major', number: null })).toBeNull();
  });

  it('질문마다 두 음이 나오고, 악보는 그 음들을 2분음표로 차례로 그린다(정답 이름은 담지 않는다)', () => {
    const questions = (v.evaluatorSpec as { questions: Parameters<typeof questionPitches>[0][] }).questions;
    expect(questions.map((q) => questionPitches(q).length)).toEqual([2, 2, 2]);
    const score = questionScoreOf(v, questions[1]!);
    expect(score.events.map((e) => [e.onsetTicks, e.durationTicks, e.type === 'note' ? `${e.writtenPitch.letter}${e.writtenPitch.accidental ?? ''}${e.writtenPitch.octave}` : '쉼'])).toEqual([
      [0, 1920, 'C4'],
      [1920, 1920, 'Dsharp4'],
    ]);
    expect(score.staves).toHaveLength(1);
  });

  it('5-2 완료 기준: 소리는 같고 표기는 다르다, 증2도, 단3도를 고르면 통과한다', () => {
    const slots = intervalSlotsOf(v);
    expect(slots.map((x) => [x.slot, x.part])).toEqual([
      [0, 'sound'],
      [1, 'notation'],
      [2, 'interval'],
      [3, 'interval'],
    ]);
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, 'same'));
    s.apply(setChoiceEdit(1, 'different'));
    s.apply(intervalPickEdit(2, { quality: 'augmented', number: 2 })!);
    s.apply(intervalPickEdit(3, { quality: 'minor', number: 3 })!);
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
  });

  it('증2도와 단3도를 서로 바꿔 고르면(소리가 같다는 이유만으로) 통과하지 못한다', () => {
    const s = open(q04, 'interval-names');
    s.apply(setChoiceEdit(0, 'same'));
    s.apply(setChoiceEdit(1, 'different'));
    s.apply(intervalPickEdit(2, { quality: 'minor', number: 3 })!);
    s.apply(intervalPickEdit(3, { quality: 'augmented', number: 2 })!);
    const ev = evaluateDraft(v, s.content());
    expect(ev.passed).toBe(false);
    expect(ev.issues.map((i) => [i.code, i.target?.slotId])).toEqual([
      ['WRONG_INTERVAL', 'i1'],
      ['WRONG_INTERVAL', 'i2'],
    ]);
  });
});

// ---------------------------------------------------------------------------
describe('종 소리 모드(5-3)', () => {
  const tones = [
    { slot: 0, pitch: p('G4') },
    { slot: 1, pitch: p('C4') },
    { slot: 2, pitch: p('E4') },
  ];

  it('함께 울리기: 모두 처음부터 같이, 온음표 길이로 울린다', () => {
    expect(toneNotesOf(tones, 'together')).toEqual([
      { slot: 1, midi: 60, onsetTick: 0, durationTick: TONE_CHORD_TICKS },
      { slot: 2, midi: 64, onsetTick: 0, durationTick: TONE_CHORD_TICKS },
      { slot: 0, midi: 67, onsetTick: 0, durationTick: TONE_CHORD_TICKS },
    ]);
  });

  it('아래부터 차례로: 낮은 음부터 2분음표씩 이어서 울린다(칸 순서가 아니라 높이 순서)', () => {
    expect(toneNotesOf(tones, 'ascending')).toEqual([
      { slot: 1, midi: 60, onsetTick: 0, durationTick: TONE_STEP_TICKS },
      { slot: 2, midi: 64, onsetTick: TONE_STEP_TICKS, durationTick: TONE_STEP_TICKS },
      { slot: 0, midi: 67, onsetTick: 2 * TONE_STEP_TICKS, durationTick: TONE_STEP_TICKS },
    ]);
  });

  it('가장 낮은 종만: 가장 낮은 하나만 울린다. 높이가 같으면 칸 번호가 작은 종이다', () => {
    expect(toneNotesOf(tones, 'lowest')).toEqual([{ slot: 1, midi: 60, onsetTick: 0, durationTick: TONE_CHORD_TICKS }]);
    const same = [
      { slot: 2, pitch: p('E3') },
      { slot: 0, pitch: p('E3') },
    ];
    expect(toneNotesOf(same, 'lowest')[0]!.slot).toBe(0);
    expect(lowestToneOf(same)!.slot).toBe(0);
    expect(toneNotesOf([], 'together')).toEqual([]);
    expect(lowestToneOf([])).toBeNull();
  });
});

describe('Q05 종 칸(5-3)', () => {
  const v = q05.variants['c-major']!;

  it('칸 넷은 처음에 모두 비어 있고, 걸린 종만 소리가 난다', () => {
    const s = open(q05, 'c-major');
    expect(triadBellsOf(v, s.content()).map((b) => b.name)).toEqual([null, null, null, null]);
    expect(hungTonesOf(v, s.content())).toEqual([]);
    pick(q05, 'c-major', s, 1, '종 2', letter('E'));
    pick(q05, 'c-major', s, 3, '종 4', letter('C'));
    expect(triadBellsOf(v, s.content()).map((b) => b.name)).toEqual([null, 'E4', null, 'C4']);
    expect(hungTonesOf(v, s.content()).map((t) => t.slot)).toEqual([1, 3]);
  });

  it('5-3 완료 기준: C E G 세 종은 통과하고, 네 번째 종 D를 더하면 더해진 D를 알려 주며 실패한다', () => {
    const s = open(q05, 'c-major');
    for (const [slot, l] of [[0, 'C'], [1, 'E'], [2, 'G']] as const) pick(q05, 'c-major', s, slot, `종 ${slot + 1}`, letter(l));
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
    pick(q05, 'c-major', s, 3, '종 4', letter('D'));
    const ev = evaluateDraft(v, s.content());
    expect(ev.passed).toBe(false);
    expect(ev.issues.map((i) => [i.code, i.target?.slotId])).toEqual([['EXTRA_NOTE', 'tone-3']]);
  });

  it('종을 걸어 둔 칸을 비우면 다시 통과한다', () => {
    const s = open(q05, 'c-major');
    for (const [slot, l] of [[0, 'C'], [1, 'E'], [2, 'G'], [3, 'D']] as const) pick(q05, 'c-major', s, slot, `종 ${slot + 1}`, letter(l));
    pick(q05, 'c-major', s, 3, '종 4', { part: 'clear' });
    expect(evaluateDraft(v, s.content()).passed).toBe(true);
  });
});

describe('Q06 종 카드(5-3)', () => {
  const v = q06.variants['c-first']!;

  it('소리를 끈 종은 들려 주는 음에도 가장 낮은 음에도 세지 않는다', () => {
    const s = open(q06, 'c-first');
    expect(soundingTonesOf(v, s.content()).map((t) => t.pitch)).toEqual([p('C3'), p('E3'), p('G3')]);
    s.apply(toggleToneMuteEdit(v, s.content(), 0)!);
    expect(soundingTonesOf(v, s.content()).map((t) => t.slot)).toEqual([1, 2]);
    expect(lowestToneOf(soundingTonesOf(v, s.content()))!.pitch).toEqual(p('E3'));
  });

  it('화면 순서(가로 순서)를 바꿔도 가장 낮은 종은 같다. 순서만 바꿔서는 전위가 바뀌지 않는다', () => {
    const s = open(q06, 'c-first');
    const before = lowestToneOf(soundingTonesOf(v, s.content()))!.pitch;
    s.apply(swapToneEdit(v, s.content(), 0, 2) as DraftEdit);
    const after = lowestToneOf(soundingTonesOf(v, s.content()))!;
    expect(after.pitch).toEqual(before);
    expect(after.slot).toBe(2);
    expect(evaluateDraft(v, s.content()).passed).toBe(false);
  });

  it('악보: 가운데 도(C4)보다 낮은 종은 낮은음자리표에, 그 위는 높은음자리표에 온음표로 적힌다', () => {
    const s = open(q06, 'c-first');
    const score = toneDisplayScore(v, soundingTonesOf(v, s.content()));
    expect(score.staves.map((x) => x.clef)).toEqual(['treble', 'bass']);
    expect(score.events.map((e) => [e.staffId, e.durationTicks])).toEqual([
      ['s2', 3840],
      ['s2', 3840],
      ['s2', 3840],
    ]);
    // C3를 한 옥타브 올려 C4가 되면 그 종은 높은음자리표로 옮겨 간다
    const up = open(q06, 'c-first');
    up.apply({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'C', accidental: null, octave: 4 } });
    const moved = toneDisplayScore(v, soundingTonesOf(v, up.content()));
    expect(moved.events.map((e) => e.staffId)).toEqual(['s1', 's2', 's2']);
  });

  it('악보: 같은 높이의 종은 하나만 그린다(겹친 음을 따로 그리지 않는다)', () => {
    const s = open(q05, 'c-major');
    for (const slot of [0, 1]) pick(q05, 'c-major', s, slot, `종 ${slot + 1}`, letter('C'));
    pick(q05, 'c-major', s, 2, '종 3', letter('E'));
    const score = toneDisplayScore(q05.variants['c-major']!, hungTonesOf(q05.variants['c-major']!, s.content()));
    expect(score.events).toHaveLength(2);
    expect(score.staves).toHaveLength(1);
  });
});
