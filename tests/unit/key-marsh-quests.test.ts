// 7-3 건반 늪의 과제 Q27–Q31: 정답은 판정기를 통과하고, 판본마다 일부러 틀리게 바꾼 입력에 기대한 설명이 나온다(11.2 검수 점검표 2번).
// 완료 기준(설계서 12.10): Q30(한 마디 안의 임시표)은 깃발 순서대로 66, 65, 65, 66이다 — G장조의 F♯4, 제자리표가 붙은 F4, 이어지는 F4, 다시 조표를 따르는 F♯4.
// 값 자체(설계서 5.7의 MIDI 표, 조표, 임시표)는 content.test.ts가 독립적으로 대조한다. 여기서는 정답 데이터에서 오답을 만들어 판정기에 넣는다.
// 틀리게 바꾸는 방법과 기대하는 코드·문장은 이 파일이 정한다(판정기의 코드를 베끼지 않는다). 설명은 과제 자신의 feedbackRules로 만든다(화면과 같다).
// 만들어 낸 오답은 정답 데이터에서 나온 것이고 사람이 만든 오답이 아니다. 사람이 실제로 많이 하는 틀림인지는 검수에서 본다(관찰 대기).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluate, expectedPitchesOf } from '@/domain/evaluators';
import type { EvaluatorInput } from '@/domain/evaluators';
import { renderAll } from '@/domain/feedback';
import type { IssueCode } from '@/domain/feedback';
import { diatonicIndex, letterOctaveAt, pitchName } from '@/domain/pitch';
import type { SpelledPitch } from '@/domain/pitch';
import type { Score } from '@/domain/score';
import { answerInput } from './answers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (id: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8'));

const Q27 = 'key.black-key-names';
const Q28 = 'key.whole-and-half-steps';
const Q29 = 'key.build-intervals';
const Q30 = 'key.accidentals-in-a-bar';
const Q31 = 'scale.chromatic';

/** 이 단계에서 새로 놓인 판본 */
const NEW_VARIANTS: Array<[string, string[]]> = [
  [Q27, ['black-key-names']],
  [Q28, ['whole-and-half']],
  [Q29, ['basic', 'challenge']],
  [Q30, ['g-major-f']],
  [Q31, ['ascending', 'descending']],
];

interface VariantRef {
  key: string;
  quest: Record<string, any>;
  variantId: string;
  v: Record<string, any>;
}
const VARIANTS: VariantRef[] = NEW_VARIANTS.flatMap(([questId, ids]) => {
  const quest = load(questId);
  return ids.map((variantId) => ({ key: `${questId}/${variantId}`, quest, variantId, v: quest.variants[variantId] as Record<string, any> }));
});
const ref = (key: string): VariantRef => VARIANTS.find((x) => x.key === key)!;

const P = (letter: string, alter: number, octave: number): SpelledPitch => ({ letter: letter as SpelledPitch['letter'], alter, octave });
const stepUp = (q: SpelledPitch, by = 1): SpelledPitch => ({ ...letterOctaveAt(diatonicIndex(q) + by), alter: q.alter });

interface Case {
  what: string;
  input: EvaluatorInput;
  /** 판정기가 돌려주는 설명 코드 전체(순서까지) */
  codes: IssueCode[];
  /** 설명 문장에 들어가야 할 말 */
  text: string[];
  /** 첫 설명이 가리키는 칸(slotId 또는 qid) */
  first?: string;
}

// ───── Q27: 검은 널 다섯 개의 이름표(올려 부른 이름과 내려 부른 이름) ─────

function casesQ27(): Case[] {
  const x = ref(`${Q27}/black-key-names`);
  const targets = x.v.evaluatorSpec.targets as Array<{ slotId: string; label: string; expected: SpelledPitch }>;
  const right = targets.map((t) => ({ slotId: t.slotId, pitch: t.expected }));
  const input = (placed: Array<{ slotId: string; pitch: SpelledPitch }>): EvaluatorInput => ({ type: 'pitchSpelling', placed });
  const change = (slotId: string, pitch: SpelledPitch): EvaluatorInput => input(right.map((p) => (p.slotId === slotId ? { slotId, pitch } : p)));
  const exp = (slotId: string): SpelledPitch => right.find((p) => p.slotId === slotId)!.pitch;
  return [
    { what: '첫 이름표를 걸지 않는다', input: input(right.slice(1)), codes: ['MISSING_PLACEMENT'], text: ['첫째 검은 널의 올려 부른 이름표: 아직 이름표가 없어요.'], first: 'k1-up' },
    { what: '아무것도 걸지 않는다', input: input([]), codes: Array.from({ length: 10 }, () => 'MISSING_PLACEMENT' as IssueCode), text: ['다섯째 검은 널의 내려 부른 이름표: 아직 이름표가 없어요.'], first: 'k1-up' },
    {
      what: '올려 부른 자리에 같은 소리의 내려 부른 이름(D♭)을 건다',
      input: change('k1-up', P('D', -1, 4)),
      codes: ['WRONG_SPELLING_SAME_PITCH'],
      text: ['소리 높이는 같지만 이름이 달라요', '지금은 D♭4, 목표는 C♯4예요'],
      first: 'k1-up',
    },
    {
      what: '내려 부른 자리에 같은 소리의 올려 부른 이름(F♯)을 건다',
      input: change('k3-down', exp('k3-up')),
      codes: ['WRONG_SPELLING_SAME_PITCH'],
      text: ['지금은 F♯4, 목표는 G♭4예요'],
      first: 'k3-down',
    },
    { what: '둘째 검은 널의 올림 자리에 다른 소리의 이름(E♯ 아닌 F♯)을 건다', input: change('k2-up', P('F', 1, 4)), codes: ['WRONG_PITCH'], text: ['지금은 F♯4예요', '목표는 D♯4예요'], first: 'k2-up' },
    { what: '한 옥타브 위의 이름표를 건다', input: change('k1-up', P('C', 1, 5)), codes: ['OCTAVE_MISMATCH'], text: ['옥타브가 달라요', '지금은 C♯5, 목표는 C♯4예요'], first: 'k1-up' },
    {
      what: '모든 널의 두 이름을 맞바꾼다(올려 부른 이름을 내려 부른 자리에)',
      input: input(right.map((p, i) => ({ slotId: p.slotId, pitch: right[i % 2 === 0 ? i + 1 : i - 1]!.pitch }))),
      codes: Array.from({ length: 10 }, () => 'WRONG_SPELLING_SAME_PITCH' as IssueCode),
      text: ['첫째 검은 널의 올려 부른 이름표: 소리 높이는 같지만 이름이 달라요'],
      first: 'k1-up',
    },
  ];
}

// ───── Q28·Q29: 이웃한 두 널의 온음과 반음, 음정 쌓기 ─────

type Answers = Record<string, { diatonicNumber: number; quality: string } | { pitch: SpelledPitch } | { soundSame: boolean; notationSame: boolean }>;
const intervalInput = (answers: Answers): EvaluatorInput => ({ type: 'interval', answers } as EvaluatorInput);

function casesQ28(): Case[] {
  const right: Answers = { h1: { diatonicNumber: 2, quality: 'minor' }, h2: { diatonicNumber: 2, quality: 'minor' }, h3: { diatonicNumber: 2, quality: 'major' }, h4: { diatonicNumber: 2, quality: 'major' } };
  return [
    { what: 'E4에서 F4(반음)를 온음(장2도)이라고 한다', input: intervalInput({ ...right, h1: { diatonicNumber: 2, quality: 'major' } }), codes: ['WRONG_INTERVAL'], text: ['E4에서 F4까지: 목표는 단2도. 지금 고른 것은 장2도.'], first: 'h1' },
    { what: 'B4에서 C5(반음)를 온음이라고 한다', input: intervalInput({ ...right, h2: { diatonicNumber: 2, quality: 'major' } }), codes: ['WRONG_INTERVAL'], text: ['B4에서 C5까지: 목표는 단2도'], first: 'h2' },
    { what: 'C4에서 D4(온음)를 반음(단2도)이라고 한다', input: intervalInput({ ...right, h3: { diatonicNumber: 2, quality: 'minor' } }), codes: ['WRONG_INTERVAL'], text: ['C4에서 D4까지: 목표는 장2도. 지금 고른 것은 단2도.'], first: 'h3' },
    { what: '검은 널을 건너뛴 두 널을 3도라고 한다', input: intervalInput({ ...right, h4: { diatonicNumber: 3, quality: 'minor' } }), codes: ['WRONG_INTERVAL'], text: ['F4에서 G4까지: 목표는 장2도. 지금 고른 것은 단3도.'], first: 'h4' },
    { what: '마지막 쌍에 답하지 않는다', input: intervalInput({ h1: right.h1!, h2: right.h2!, h3: right.h3! }), codes: ['MISSING_PLACEMENT'], text: ['F4에서 G4까지: 아직 답이 없어요.'], first: 'h4' },
    { what: '아무 쌍에도 답하지 않는다', input: intervalInput({}), codes: ['MISSING_PLACEMENT', 'MISSING_PLACEMENT', 'MISSING_PLACEMENT', 'MISSING_PLACEMENT'], text: ['E4에서 F4까지: 아직 답이 없어요.'], first: 'h1' },
    {
      what: '반음이 두 쌍인 것을 모르고 모두 온음이라고 한다',
      input: intervalInput({ h1: { diatonicNumber: 2, quality: 'major' }, h2: { diatonicNumber: 2, quality: 'major' }, h3: right.h3!, h4: right.h4! }),
      codes: ['WRONG_INTERVAL', 'WRONG_INTERVAL'],
      text: ['E4에서 F4까지', 'B4에서 C5까지'],
      first: 'h1',
    },
  ];
}

function casesQ29(variantId: 'basic' | 'challenge'): Case[] {
  const basic = variantId === 'basic';
  // 기본: D4 위 장3도 = F♯4, E4 위 완전5도 = B4 / 높은 도전: F4 위 완전4도 = B♭4, E4 위 장3도 = G♯4
  const right: Answers = basic ? { b1: { pitch: P('F', 1, 4) }, b2: { pitch: P('B', 0, 4) } } : { b1: { pitch: P('B', -1, 4) }, b2: { pitch: P('G', 1, 4) } };
  const label1 = basic ? 'D4 위 장3도' : 'F4 위 완전4도';
  const label2 = basic ? 'E4 위 완전5도' : 'E4 위 장3도';
  const exp1 = basic ? 'F♯4' : 'B♭4';
  const exp2 = basic ? 'B4' : 'G♯4';
  return [
    { what: '첫 질문에 답하지 않는다', input: intervalInput({ b2: right.b2! }), codes: ['MISSING_PLACEMENT'], text: [`${label1}: 아직 답이 없어요.`], first: 'b1' },
    {
      what: basic ? '장3도 자리에 단3도의 널(F4)을 꽂는다' : '완전4도 자리에 온음계의 넷째 음(B♮4)을 꽂는다',
      input: intervalInput({ ...right, b1: { pitch: basic ? P('F', 0, 4) : P('B', 0, 4) } }),
      codes: ['WRONG_PITCH'],
      text: [`${label1}: 지금은 ${basic ? 'F4' : 'B4'}예요. 목표는 ${exp1}예요.`],
      first: 'b1',
    },
    {
      what: basic ? '같은 소리의 다른 이름(G♭4)으로 꽂는다' : '같은 소리의 다른 이름(A♯4)으로 꽂는다',
      input: intervalInput({ ...right, b1: { pitch: basic ? P('G', -1, 4) : P('A', 1, 4) } }),
      codes: ['WRONG_SPELLING_SAME_PITCH'],
      text: ['소리 높이는 같지만 이름이 달라요', `지금은 ${basic ? 'G♭4' : 'A♯4'}, 목표는 ${exp1}예요`],
      first: 'b1',
    },
    { what: '둘째 질문의 끝 말뚝을 한 옥타브 위에 꽂는다', input: intervalInput({ ...right, b2: { pitch: { ...(right.b2 as { pitch: SpelledPitch }).pitch, octave: 5 } } }), codes: ['WRONG_PITCH'], text: [`${label2}: 지금은 ${exp2.replace('4', '5')}예요. 목표는 ${exp2}예요.`], first: 'b2' },
    { what: '두 질문 모두 답하지 않는다', input: intervalInput({}), codes: ['MISSING_PLACEMENT', 'MISSING_PLACEMENT'], text: [`${label1}: 아직 답이 없어요.`, `${label2}: 아직 답이 없어요.`], first: 'b1' },
  ];
}

// ───── Q30: 한 마디 안의 임시표(깃발 4개, 울리는 소리 높이로 판정) ─────

const midiPlaced = (midis: Array<number | null>): EvaluatorInput => ({
  type: 'orderedScale',
  placed: midis.flatMap((m, i) => (m === null ? [] : [{ slot: i + 1, midi: m }])),
});

function casesQ30(): Case[] {
  const mismatch = (slot: number, expected: string, actual: string): string => `${slot}번 깃발: 울릴 음은 ${expected}예요. 지금 꽂은 널은 ${actual}예요.`;
  return [
    { what: '조표를 따르지 않고 처음과 끝 깃발을 F(제자리)에 꽂는다', input: midiPlaced([65, 65, 65, 65]), codes: ['PITCH_MISMATCH', 'PITCH_MISMATCH'], text: [mismatch(1, 'F♯4', 'F4'), mismatch(4, 'F♯4', 'F4')], first: '1' },
    { what: '제자리표를 못 보고 모든 깃발을 F♯에 꽂는다', input: midiPlaced([66, 66, 66, 66]), codes: ['PITCH_MISMATCH', 'PITCH_MISMATCH'], text: [mismatch(2, 'F4', 'F♯4'), mismatch(3, 'F4', 'F♯4')], first: '2' },
    { what: '제자리표가 그 마디 끝까지 이어지는 것을 모르고 셋째 깃발을 F♯에 꽂는다', input: midiPlaced([66, 65, 66, 66]), codes: ['PITCH_MISMATCH'], text: [mismatch(3, 'F4', 'F♯4'), '임시표는 그 마디가 끝날 때까지 이어지고'], first: '3' },
    { what: '넷째 깃발을 F(제자리)에 꽂는다(제자리표가 이어진다고 생각한다)', input: midiPlaced([66, 65, 65, 65]), codes: ['PITCH_MISMATCH'], text: [mismatch(4, 'F♯4', 'F4')], first: '4' },
    { what: '첫째 깃발만 F(제자리)에 꽂는다', input: midiPlaced([65, 65, 65, 66]), codes: ['PITCH_MISMATCH'], text: [mismatch(1, 'F♯4', 'F4')], first: '1' },
    { what: '첫째 깃발을 한 옥타브 위의 F♯에 꽂는다', input: midiPlaced([78, 65, 65, 66]), codes: ['PITCH_MISMATCH'], text: [mismatch(1, 'F♯4', 'F♯5')], first: '1' },
    { what: '넷째 깃발을 꽂지 않는다', input: midiPlaced([66, 65, 65, null]), codes: ['MISSING_PLACEMENT'], text: ['4번 깃발을 아직 꽂지 않았어요.'], first: '4' },
    { what: '아무 깃발도 꽂지 않는다', input: midiPlaced([]), codes: ['MISSING_PLACEMENT', 'MISSING_PLACEMENT', 'MISSING_PLACEMENT', 'MISSING_PLACEMENT'], text: ['1번 깃발을 아직 꽂지 않았어요.'], first: '1' },
    { what: '깃발 다섯 개를 꽂는다', input: midiPlaced([66, 65, 65, 66, 66]), codes: ['SCALE_LENGTH'], text: ['5개', '4개'] },
    { what: '첫째와 둘째 깃발의 순서를 바꾼다(F와 F♯)', input: midiPlaced([65, 66, 65, 66]), codes: ['WRONG_ORDER'], text: ['1번째와 2번째 깃발의 순서가 바뀌었어요.'], first: '1' },
  ];
}

// ───── Q31: 반음계(오름·내림) ─────

function casesQ31(variantId: 'ascending' | 'descending'): Case[] {
  const x = ref(`${Q31}/${variantId}`);
  const right = (answerInput(x.v) as { placed: Array<{ slot: number; pitch: SpelledPitch }> }).placed;
  const up = variantId === 'ascending';
  const input = (placed: Array<{ slot: number; pitch: SpelledPitch | null }>): EvaluatorInput => ({ type: 'orderedScale', placed } as EvaluatorInput);
  const edit = (i: number, pitch: SpelledPitch | null): EvaluatorInput => input(right.map((q, k) => (k === i ? { slot: q.slot, pitch } : q)));
  const exp = (i: number): SpelledPitch => right[i]!.pitch;
  // 같은 소리의 다른 이름: 오를 때는 올림표로, 내릴 때는 내림표로 적는 것이 관례다 → 반대 표기. 오름은 둘째 칸(C♯ 대신 D♭), 내림은 셋째 칸(B♭ 대신 A♯)
  const swapAt = up ? 1 : 2;
  const sameSound = up ? P('D', -1, 4) : P('A', 1, 4);
  return [
    { what: '둘째 칸을 비운다', input: input(right.filter((_, k) => k !== 1)), codes: ['MISSING_PLACEMENT'], text: ['2번째 자리가 비어 있어요.'], first: '2' },
    { what: '아무것도 놓지 않는다', input: input([]), codes: Array.from({ length: 13 }, () => 'MISSING_PLACEMENT' as IssueCode), text: ['13번째 자리가 비어 있어요.'], first: '1' },
    { what: '마지막 칸(시작음의 옥타브)을 한 옥타브 어긋나게 놓는다', input: edit(12, { ...exp(12), octave: exp(12).octave + (up ? -1 : 1) }), codes: ['OCTAVE_MISMATCH'], text: ['옥타브가 달라요', `목표는 ${pitchName(exp(12))}`, '반음계는 시작음에서 한 옥타브'], first: '13' },
    {
      what: `${swapAt + 1}번째 칸을 같은 소리의 반대 표기(${pitchName(sameSound)})로 놓는다`,
      input: edit(swapAt, sameSound),
      codes: ['WRONG_SPELLING_SAME_PITCH'],
      text: ['소리 높이는 같아요', '반음계는 오를 때 올림표, 내릴 때 내림표로 적는 것이 흔한 관례예요'],
      first: String(swapAt + 1),
    },
    {
      what: '둘째 칸과 셋째 칸의 음을 맞바꾼다',
      input: input(right.map((q, k) => ({ slot: q.slot, pitch: k === 1 ? exp(2) : k === 2 ? exp(1) : q.pitch }))),
      codes: ['WRONG_ORDER'],
      text: ['2번째와 3번째 자리의 순서가 바뀌었어요.'],
      first: '2',
    },
    {
      what: '넷째 칸을 온음계 한 칸 위에 놓는다(반음이 아니라 온음계의 이웃을 놓는다)',
      input: edit(3, stepUp(exp(3))),
      codes: ['WRONG_PITCH'],
      text: [`지금은 ${pitchName(stepUp(exp(3)))}`, `목표는 ${pitchName(exp(3))}`],
      first: '4',
    },
    { what: '열네 번째 칸까지 놓는다', input: input([...right, { slot: 14, pitch: stepUp(exp(12)) }]), codes: ['SCALE_LENGTH'], text: ['14개', '13개'] },
    {
      what: `반음 하나(넷째 음 ${pitchName(exp(3))})를 건너뛰고 열두 칸만 놓는다: 넷째부터 열두째까지 한 칸씩 밀리고 열세째 칸이 빈다`,
      input: input(right.filter((_, k) => k !== 3).map((q, i) => ({ slot: i + 1, pitch: q.pitch }))),
      codes: [...Array.from({ length: 9 }, () => 'WRONG_PITCH' as IssueCode), 'MISSING_PLACEMENT'],
      text: [`지금은 ${pitchName(exp(4))}`, `목표는 ${pitchName(exp(3))}`, '13번째 자리가 비어 있어요.'],
      first: '4',
    },
  ];
}

const CASES: Array<[VariantRef, Case[]]> = [
  [ref(`${Q27}/black-key-names`), casesQ27()],
  [ref(`${Q28}/whole-and-half`), casesQ28()],
  [ref(`${Q29}/basic`), casesQ29('basic')],
  [ref(`${Q29}/challenge`), casesQ29('challenge')],
  [ref(`${Q30}/g-major-f`), casesQ30()],
  [ref(`${Q31}/ascending`), casesQ31('ascending')],
  [ref(`${Q31}/descending`), casesQ31('descending')],
];

describe('판본 구성', () => {
  it('새 판본은 모두 일곱 개다: Q27 하나, Q28 하나, Q29 둘, Q30 하나, Q31 둘', () => {
    expect(VARIANTS.map((x) => x.key)).toEqual([`${Q27}/black-key-names`, `${Q28}/whole-and-half`, `${Q29}/basic`, `${Q29}/challenge`, `${Q30}/g-major-f`, `${Q31}/ascending`, `${Q31}/descending`]);
  });

  it('판정 종류가 설계서 4.8과 맞다: Q27 이름 쓰기, Q28·Q29 음정, Q30 깃발 열(방향 sequence), Q31 한 방향 음계', () => {
    const type = (key: string): string => ref(key).v.evaluatorSpec.type;
    expect(type(`${Q27}/black-key-names`)).toBe('pitchSpelling');
    expect(type(`${Q28}/whole-and-half`)).toBe('interval');
    expect(type(`${Q29}/basic`)).toBe('interval');
    expect(type(`${Q29}/challenge`)).toBe('interval');
    expect(ref(`${Q30}/g-major-f`).v.evaluatorSpec).toMatchObject({ type: 'orderedScale', direction: 'sequence', count: 4, requireSpelling: false, requireOctave: true });
    expect(ref(`${Q31}/ascending`).v.evaluatorSpec).toMatchObject({ type: 'orderedScale', direction: 'ascending', count: 13, requireSpelling: true });
    expect(ref(`${Q31}/descending`).v.evaluatorSpec).toMatchObject({ type: 'orderedScale', direction: 'descending', count: 13, requireSpelling: true });
  });
});

describe('정답은 자기 판정기를 통과한다', () => {
  it.each(VARIANTS.map((x) => [x.key, x] as const))('%s', (_key, x) => {
    const r = evaluate(x.v.evaluatorSpec, answerInput(x.v), x.v.score as Score);
    expect(r.issues).toEqual([]);
    expect(r.passed).toBe(true);
  });
});

describe('완료 기준(12.10): Q30은 깃발 순서대로 66, 65, 65, 66이다', () => {
  const x = ref(`${Q30}/g-major-f`);

  it('판정이 기대하는 소리 높이가 66, 65, 65, 66이고 악보에서 풀어도 같다(표지판 악보가 정답을 정한다)', () => {
    const resolved = expectedPitchesOf(x.v.score as Score, x.v.evaluatorSpec.voiceId).map((p) => p.midi);
    expect(resolved).toEqual([66, 65, 65, 66]);
    const r = evaluate(x.v.evaluatorSpec, midiPlaced([66, 65, 65, 66]), x.v.score as Score);
    expect(r.passed).toBe(true);
    expect((r.details as { expectedMidi?: number[] }).expectedMidi).toEqual([66, 65, 65, 66]);
  });

  it('널의 소리 높이만으로 판정한다: 이름이 아니라 MIDI 값을 꽂아도 같은 결과다(깃발은 이름이 아니라 소리 높이만 갖는다)', () => {
    const named: EvaluatorInput = {
      type: 'orderedScale',
      placed: [P('F', 1, 4), P('F', 0, 4), P('F', 0, 4), P('F', 1, 4)].map((pitch, i) => ({ slot: i + 1, pitch })),
    };
    expect(evaluate(x.v.evaluatorSpec, named, x.v.score as Score).passed).toBe(true);
    // 같은 소리인 다른 이름(G♭4 = 66)도 소리 높이로는 맞다: 이 과제는 표기를 묻지 않는다
    const enharmonic: EvaluatorInput = { type: 'orderedScale', placed: [P('G', -1, 4), P('F', 0, 4), P('F', 0, 4), P('G', -1, 4)].map((pitch, i) => ({ slot: i + 1, pitch })) };
    expect(evaluate(x.v.evaluatorSpec, enharmonic, x.v.score as Score).passed).toBe(true);
  });

  it('조표 G장조(올림표 하나), 첫 마디의 제자리표가 그 마디 끝까지 이어지고, 다음 마디에서는 조표로 돌아가는 악보다', () => {
    const staff = x.v.score.staves[0];
    expect(staff.keySignature).toBe(1);
    expect(staff.clef).toBe('treble');
    const notes = (x.v.score.events as any[]).filter((e) => e.type === 'note');
    // 쓴 모양: 첫 마디의 F(조표 때문에 F♯), 제자리표가 붙은 F, 아무 표 없는 F(제자리표가 이어진다), 다음 마디의 F(조표로 돌아간다)
    expect(notes.map((e) => `${e.writtenPitch.letter}${e.writtenPitch.accidental ?? ''}${e.writtenPitch.octave}`)).toEqual(['F4', 'Fnatural4', 'F4', 'F4']);
    expect(notes.map((e) => e.measureIndex)).toEqual([0, 0, 0, 1]);
    expect(notes.map((e) => e.resolvedPitch.midi)).toEqual([66, 65, 65, 66]);
  });
});

describe('11.2의 2: 정답을 일부러 틀리게 바꾸면 기대한 설명이 나온다', () => {
  const ALL = CASES.flatMap(([x, cases]) => cases.map((c) => [`${x.key} · ${c.what}`, x, c] as const));

  it('판본마다 사례가 다섯 개 이상 만들어진다', () => {
    for (const [x, cases] of CASES) expect(cases.length, x.key).toBeGreaterThanOrEqual(5);
    expect(ALL.length).toBe(50); // 7 + 7 + 5 + 5 + 10 + 8 + 8
  });

  it.each(ALL)('%s', (_name, x, c) => {
    const r = evaluate(x.v.evaluatorSpec, c.input, x.v.score as Score);
    expect(r.passed, '틀리게 바꾼 입력이 통과했어요').toBe(false);
    expect(
      r.issues.map((i) => i.code),
      `${x.key}: ${c.what}`,
    ).toEqual(c.codes);
    const texts = renderAll(r.issues, x.quest.feedbackRules);
    expect(texts.every((s) => s.length > 0 && !s.includes('{')), '설명 문장에 채우지 못한 자리가 남았어요').toBe(true);
    const all = texts.join('\n');
    for (const w of c.text) expect(all, `설명에 '${w}'가 없어요`).toContain(w);
    if (c.first) {
      const t = r.issues[0]!.target;
      expect(t?.slotId, '첫 설명이 가리키는 칸').toBe(c.first);
    }
  });
});
