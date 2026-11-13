// 5-2·5-3 음을 오선에 놓는 것이 아니라 고르거나 쌓아서 푸는 과제(음정 이름, 장3화음, 전위)의 칸 계획.
// 초안(DraftContent)은 칸 번호와 글자·음만 담는다. 이 파일이 그 칸을 판정기가 받는 값으로 바꾼다.
// 화면 좌표, 카드의 가로 위치, 걸은 시간은 들어오지 못한다(W-3). 카드 순서를 바꿔도 같은 음이면 같은 결과가 나온다.
import type { QuestVariant } from './content';
import type { ChordSequenceInput, ChordSequenceSpec, IntervalAnswer, IntervalQuestion, InversionInput, InversionSpec, TriadMembershipInput, TriadMembershipSpec } from './evaluators';
import { fillTemplate } from './feedback';
import { INTERVAL_QUALITY_KO, diatonicIndex, intervalName, letterOctaveAt, midiOf, parsePitch, pitchName, writtenOf } from './pitch';
import type { Accidental, IntervalQuality, Letter, SpelledPitch, WrittenPitch } from './pitch';
import type { NoteEvent, Score } from './score';
import { spellWritten } from './session';
import type { DraftContent, DraftEdit, SlotEntry } from './session';
import { VALUE_TICKS, measureTicks } from './time';

// ---------------------------------------------------------------------------
// 음정 이름(Q04 interval-names)

/** 같은 소리/같은 표기에 대한 답 */
export const CHOICE_SAME = 'same';
export const CHOICE_DIFFERENT = 'different';

export type IntervalPart = 'sound' | 'notation' | 'interval' | 'pitch';

export interface IntervalSlotPlan {
  /** 초안의 칸 번호(0부터) */
  slot: number;
  qid: string;
  part: IntervalPart;
  question: IntervalQuestion;
  /** 칸의 이름. 예: '소리', '표기', '음정 이름', '끝 음' */
  label: string;
}

const PART_LABEL: Record<IntervalPart, string> = { sound: '소리', notation: '표기', interval: '음정 이름', pitch: '끝 음' };

/** 질문마다 칸을 차례로 배정한다: 비교(compare)는 둘(소리, 표기), 이름 묻기(identify)와 음 쌓기(build)는 하나 */
export function intervalSlotsOf(variant: QuestVariant): IntervalSlotPlan[] {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'interval') throw new Error('음정 판본이 아니에요');
  const out: IntervalSlotPlan[] = [];
  let slot = 0;
  for (const q of spec.questions) {
    const parts: IntervalPart[] = q.kind === 'compare' ? ['sound', 'notation'] : q.kind === 'identify' ? ['interval'] : ['pitch'];
    for (const part of parts) out.push({ slot: slot++, qid: q.qid, part, question: q, label: PART_LABEL[part] });
  }
  return out;
}

/** 음정 이름을 칸에 담는 글자. 예: 증2도 → 'augmented:2' */
export function intervalChoiceText(i: { quality: IntervalQuality; diatonicNumber: number }): string {
  return `${i.quality}:${i.diatonicNumber}`;
}

const QUALITIES: readonly IntervalQuality[] = ['perfect', 'major', 'minor', 'augmented', 'diminished', 'doublyAugmented', 'doublyDiminished'];

export function parseIntervalChoice(text: string | undefined): { quality: IntervalQuality; diatonicNumber: number } | null {
  if (!text) return null;
  const [q, n] = text.split(':');
  const quality = QUALITIES.find((x) => x === q);
  const number = Number(n);
  if (!quality || !Number.isInteger(number) || number < 1) return null;
  return { quality, diatonicNumber: number };
}

/** 칸의 내용을 판정기의 답으로 바꾼다. 답이 비었으면 undefined(판정기가 '아직 없음'으로 알린다) */
export function intervalAnswersOf(variant: QuestVariant, content: DraftContent): Record<string, IntervalAnswer | undefined> {
  const plan = intervalSlotsOf(variant);
  const keySignature = variant.score.staves[0]?.keySignature ?? 0;
  const entryOf = (slot: number): SlotEntry | undefined => content.slots.find((s) => s.slot === slot);
  const answers: Record<string, IntervalAnswer | undefined> = {};
  const seen = new Set<string>();
  for (const p of plan) {
    if (seen.has(p.qid)) continue;
    seen.add(p.qid);
    const q = p.question;
    if (q.kind === 'compare') {
      const sound = plan.find((x) => x.qid === q.qid && x.part === 'sound')!;
      const notation = plan.find((x) => x.qid === q.qid && x.part === 'notation')!;
      const a = entryOf(sound.slot)?.choice;
      const b = entryOf(notation.slot)?.choice;
      const known = (v: string | undefined): v is string => v === CHOICE_SAME || v === CHOICE_DIFFERENT;
      answers[q.qid] = known(a) && known(b) ? { soundSame: a === CHOICE_SAME, notationSame: b === CHOICE_SAME } : undefined;
    } else if (q.kind === 'identify') {
      answers[q.qid] = parseIntervalChoice(entryOf(p.slot)?.choice) ?? undefined;
    } else {
      const w = entryOf(p.slot)?.writtenPitch;
      answers[q.qid] = w ? { pitch: spellWritten(w, keySignature) } : undefined;
    }
  }
  return answers;
}

/** 답을 고르는 편집 */
export const setChoiceEdit = (slot: number, choice: string): DraftEdit => ({ type: 'setSlot', slot, writtenPitch: null, choice });
/** 고른 답을 지우는 편집 */
export const clearChoiceEdit = (slot: number): DraftEdit => ({ type: 'setSlot', slot, writtenPitch: null });

// ---------------------------------------------------------------------------
// 장3화음 조립(Q05)

/** 한 나무에는 종이 최대 넷 걸린다(4.6). 셋이 정답이므로 하나는 '넘치는 종'을 시험해 볼 자리다 */
export const TRIAD_SLOT_COUNT = 4;

export const toneSlotId = (slot: number): string => `tone-${slot}`;

function keySignatureOf(variant: QuestVariant): number {
  return variant.score.staves[0]?.keySignature ?? 0;
}

function triadSpecOf(variant: QuestVariant): TriadMembershipSpec {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'triadMembership') throw new Error('구성음 판본이 아니에요');
  return spec;
}

/** 칸에 걸린 음들을 판정기 입력으로. 빈 칸은 넘기지 않는다 */
export function triadInputOf(variant: QuestVariant, content: DraftContent): TriadMembershipInput {
  triadSpecOf(variant);
  const keySignature = keySignatureOf(variant);
  const notes = [...content.slots]
    .filter((s) => s.slot >= 0 && s.slot < TRIAD_SLOT_COUNT && s.writtenPitch)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => ({ slotId: toneSlotId(s.slot), pitch: spellWritten(s.writtenPitch!, keySignature) }));
  return { type: 'triadMembership', notes };
}

// ---------------------------------------------------------------------------
// 베이스를 바꾸어 전위 만들기(Q06)

/** 종 세 개가 걸린 채 시작한다(4.6). 기본 위치의 첫 종의 옥타브 */
export const ROOT_POSITION_OCTAVE = 3;
export const INVERSION_SLOT_COUNT = 3;

function inversionSpecOf(variant: QuestVariant): InversionSpec {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'inversion') throw new Error('전위 판본이 아니에요');
  return spec;
}

/** 근음, 3음, 5음을 아래에서 위로 쌓은 기본 위치. 근음은 ROOT_POSITION_OCTAVE에서 시작한다 */
export function rootPositionOf(spec: InversionSpec): SpelledPitch[] {
  const out: SpelledPitch[] = [];
  for (const tone of spec.tones) {
    const prev = out[out.length - 1];
    let octave = ROOT_POSITION_OCTAVE;
    let pitch: SpelledPitch = { letter: tone.letter, alter: tone.alter, octave };
    while (prev && midiOf(pitch) <= midiOf(prev)) {
      octave += 1;
      pitch = { letter: tone.letter, alter: tone.alter, octave };
    }
    out.push(pitch);
  }
  return out;
}

/** 초안에서 종 카드 하나가 지금 어떤 음이고 소리가 나는가. 초안에 없으면 처음 걸려 있던 기본 위치의 종이다 */
export interface ToneCard {
  slot: number;
  slotId: string;
  pitch: SpelledPitch;
  written: WrittenPitch;
  /** 소리를 껐는가 */
  muted: boolean;
  /** 음이름과 옥타브. 예: 'E3' */
  name: string;
  /** 초안에 직접 담겼는가(건드렸는가). 아니면 처음 걸려 있던 종이다 */
  touched: boolean;
}

export function toneCardsOf(variant: QuestVariant, content: DraftContent): ToneCard[] {
  const spec = inversionSpecOf(variant);
  const defaults = rootPositionOf(spec);
  const keySignature = keySignatureOf(variant);
  return defaults.map((fallback, slot) => {
    const entry = content.slots.find((s) => s.slot === slot);
    const written = entry?.writtenPitch ?? writtenOf(fallback);
    const pitch = entry?.writtenPitch ? spellWritten(entry.writtenPitch, keySignature) : fallback;
    return { slot, slotId: toneSlotId(slot), pitch, written, muted: entry?.muted === true, name: pitchName(pitch), touched: entry !== undefined };
  });
}

/** 종 카드를 판정기 입력으로. 소리를 끈 종은 active: false로 넘기고 판정기가 실제로 울리는 음만 본다 */
export function inversionInputOf(variant: QuestVariant, content: DraftContent): InversionInput {
  return {
    type: 'inversion',
    notes: toneCardsOf(variant, content).map((c) => ({ slotId: c.slotId, pitch: c.pitch, active: !c.muted })),
  };
}

/** 음역 안에서 종의 옥타브를 정한 단으로 옮기는 편집. 음역 밖으로는 나가지 않는다(null) */
export function toneOctaveEdit(variant: QuestVariant, content: DraftContent, slot: number, octave: number): DraftEdit | null {
  const card = toneCardsOf(variant, content).find((c) => c.slot === slot);
  if (!card) return null;
  const range = variant.challengeDescriptor.range.split('-');
  const low = midiOf(parsePitch(range[0]!));
  const high = midiOf(parsePitch(range[1] ?? range[0]!));
  const next: SpelledPitch = { ...card.pitch, octave };
  const m = midiOf(next);
  if (m < low || m > high) return null;
  // setSlot은 이미 담긴 '소리 끔'을 그대로 둔다
  return { type: 'setSlot', slot, writtenPitch: { ...card.written, octave: next.octave } };
}

/** 음역 안에서 종의 옥타브를 한 단 옮기는 편집. 음역 밖으로는 나가지 않는다(null) */
export function shiftToneOctaveEdit(variant: QuestVariant, content: DraftContent, slot: number, delta: 1 | -1): DraftEdit | null {
  const card = toneCardsOf(variant, content).find((c) => c.slot === slot);
  return card ? toneOctaveEdit(variant, content, slot, card.pitch.octave + delta) : null;
}

/** 소리를 끄고 켜는 편집. 아직 건드리지 않은 종이면 그 종의 내용을 초안에 먼저 담는다 */
export function toggleToneMuteEdit(variant: QuestVariant, content: DraftContent, slot: number): DraftEdit | null {
  const card = toneCardsOf(variant, content).find((c) => c.slot === slot);
  if (!card) return null;
  const edits: DraftEdit[] = [];
  if (!card.touched) edits.push({ type: 'setSlot', slot, writtenPitch: card.written });
  edits.push({ type: 'setSlotMuted', slot, muted: !card.muted });
  return edits.length === 1 ? edits[0]! : { type: 'batch', edits };
}

/** 가로 순서를 바꾸는 편집: 두 카드의 내용(음과 소리 끔)을 서로 맞바꾼다. 같은 음들이므로 전위는 바뀌지 않는다 */
export function swapToneEdit(variant: QuestVariant, content: DraftContent, a: number, b: number): DraftEdit | null {
  if (a === b) return null;
  const cards = toneCardsOf(variant, content);
  const ca = cards.find((c) => c.slot === a);
  const cb = cards.find((c) => c.slot === b);
  if (!ca || !cb) return null;
  return {
    type: 'batch',
    edits: [
      { type: 'setSlot', slot: a, writtenPitch: cb.written },
      { type: 'setSlotMuted', slot: a, muted: cb.muted },
      { type: 'setSlot', slot: b, writtenPitch: ca.written },
      { type: 'setSlotMuted', slot: b, muted: ca.muted },
    ],
  };
}

/** 이 음역의 diatonic 칸 수(음 고르기 화면에서 옥타브 범위를 정할 때) */
export function octavesOfRange(range: string): number[] {
  const [from, to] = range.split('-');
  const low = letterOctaveAt(diatonicIndex(parsePitch(from!))).octave;
  const high = letterOctaveAt(diatonicIndex(parsePitch(to ?? from!))).octave;
  const out: number[] = [];
  for (let o = low; o <= high; o++) out.push(o);
  return out;
}

// ---------------------------------------------------------------------------
// 5-2·5-3 눌러서 고르는 화면이 쓰는 계산. 고른 것을 초안의 편집으로 바꾸고, 화면에 보여 줄 값과 문장을 만든다.
// 화면 좌표와 시간은 받지 않는다(W-3). 같은 계산을 설치물(종나무, 건반 다리)이 나중에 그대로 쓴다.

/** 음이름·변화·옥타브를 따로 골라 한 음을 만드는 칸(이름표, 종)의 규칙 */
export interface PitchPickRules {
  /** 고를 수 있는 옥타브. 작은 것부터 */
  octaves: readonly number[];
  /** 음이름을 처음 고를 때 쓰는 옥타브 */
  defaultOctave: number;
}

/** 이 화면에서 고르는 변화표. 겹임시표는 이 단계의 과제에 없다(D-70) */
export const PICK_ACCIDENTALS: ReadonlyArray<Extract<Accidental, 'sharp' | 'flat'> | null> = [null, 'sharp', 'flat'];

export type PitchChange =
  | { part: 'letter'; letter: Letter }
  | { part: 'accidental'; accidental: Extract<Accidental, 'sharp' | 'flat'> | null }
  | { part: 'octave'; octave: number }
  | { part: 'clear' };

export type PitchPickResult = { ok: true; edit: DraftEdit | null; text: string } | { ok: false; text: string };

/** 판본의 음역 안에서 고를 수 있는 옥타브와 처음 옥타브 */
export function pitchPickRulesOf(variant: QuestVariant): PitchPickRules {
  const octaves = octavesOfRange(variant.challengeDescriptor.range);
  return { octaves, defaultOctave: octaves[0] ?? 4 };
}

/**
 * 칸 하나의 음을 고친다. 음이름을 고르면 음이 생기고(변화표 없음, 처음 옥타브), 변화표와 옥타브는 이미 있는 음에만 고칠 수 있다.
 * 바뀌지 않는 선택(이미 그 음)은 편집 없이 문장만 돌려준다. 고를 수 없는 것은 이유를 문장으로 돌려준다.
 */
export function pitchPickEdit(variant: QuestVariant, content: DraftContent, slot: number, label: string, change: PitchChange, rules: PitchPickRules): PitchPickResult {
  const keySignature = keySignatureOf(variant);
  const nameOf = (w: WrittenPitch): string => pitchName(spellWritten(w, keySignature));
  const entry = content.slots.find((s) => s.slot === slot);
  const current = entry?.writtenPitch ?? null;

  if (change.part === 'clear') {
    if (!entry) return { ok: true, edit: null, text: fillTemplate('{label:은는} 이미 비어 있어요.', { label }) };
    return { ok: true, edit: clearChoiceEdit(slot), text: fillTemplate('{label:을를} 비웠어요.', { label }) };
  }

  let next: WrittenPitch;
  if (change.part === 'letter') {
    next = { letter: change.letter, accidental: current?.accidental ?? null, octave: current?.octave ?? rules.defaultOctave };
  } else {
    if (!current) return { ok: false, text: `${label}: 먼저 음이름을 골라 주세요.` };
    if (change.part === 'accidental') next = { ...current, accidental: change.accidental };
    else {
      if (!rules.octaves.includes(change.octave)) return { ok: false, text: `${label}: ${change.octave}옥타브는 이 도전의 음역 밖이에요.` };
      next = { ...current, octave: change.octave };
    }
  }
  const name = nameOf(next);
  if (current && current.letter === next.letter && current.accidental === next.accidental && current.octave === next.octave) {
    return { ok: true, edit: null, text: fillTemplate('{label}: 이미 {name:이에요}.', { label, name }) };
  }
  return { ok: true, edit: { type: 'setSlot', slot, writtenPitch: next }, text: fillTemplate('{label}: {name:으로로} {verb}.', { label, name, verb: current ? '바꿨어요' : '걸었어요' }) };
}

/** 칸에 걸린 음의 이름(옥타브까지). 비어 있으면 null */
export function pickedNameOf(variant: QuestVariant, content: DraftContent, slot: number): string | null {
  const w = content.slots.find((s) => s.slot === slot)?.writtenPitch;
  return w ? pitchName(spellWritten(w, keySignatureOf(variant))) : null;
}

// --- 이름표(Q04 name-tags: 음자리표 없는 음이름 과제)

/** 목표에 음자리표가 없는 음이름 판본인가. 이런 판본은 오선이 아니라 이름표를 고른다 */
export function isNameTagVariant(variant: QuestVariant): boolean {
  const spec = variant.evaluatorSpec;
  return spec.type === 'pitchSpelling' && spec.targets.every((t) => !t.clef);
}

export interface NameTagSlot {
  slot: number;
  /** 판정기가 부르는 이름(이슈의 target.slotId) */
  slotId: string;
  label: string;
}

/** 이름표가 걸리는 소리의 건반. 모든 목표가 같은 소리의 검은 건반일 때만 있다 */
export interface NameTagKey {
  midi: number;
  /** 바로 왼쪽의 흰 건반과 바로 오른쪽의 흰 건반 */
  lower: SpelledPitch;
  upper: SpelledPitch;
}

export interface NameTagPlan {
  slots: NameTagSlot[];
  rules: PitchPickRules;
  key: NameTagKey | null;
}

const BLACK_NEIGHBORS: Record<number, [Letter, Letter]> = { 1: ['C', 'D'], 3: ['D', 'E'], 6: ['F', 'G'], 8: ['G', 'A'], 10: ['A', 'B'] };

export function nameTagPlanOf(variant: QuestVariant): NameTagPlan {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'pitchSpelling' || !isNameTagVariant(variant)) throw new Error('이름표 판본이 아니에요');
  const slots = spec.targets.map((t, i) => ({ slot: i, slotId: t.slotId, label: t.label }));
  const midis = new Set(spec.targets.map((t) => midiOf(t.expected)));
  let key: NameTagKey | null = null;
  if (midis.size === 1) {
    const midi = [...midis][0]!;
    const pair = BLACK_NEIGHBORS[((midi % 12) + 12) % 12];
    if (pair) {
      const octave = Math.floor(midi / 12) - 1;
      key = { midi, lower: { letter: pair[0], alter: 0, octave }, upper: { letter: pair[1], alter: 0, octave } };
    }
  }
  return { slots, rules: pitchPickRulesOf(variant), key };
}

/** 이름표 칸의 음들 가운데 걸린 것. 칸 번호 차례로 */
export function nameTagTonesOf(variant: QuestVariant, content: DraftContent): ToneSource[] {
  const plan = nameTagPlanOf(variant);
  const keySignature = keySignatureOf(variant);
  const out: ToneSource[] = [];
  for (const s of plan.slots) {
    const w = content.slots.find((x) => x.slot === s.slot)?.writtenPitch;
    if (w) out.push({ slot: s.slot, written: w, pitch: spellWritten(w, keySignature) });
  }
  return out;
}

// --- 음정 질문(Q04 interval-names)

/** 성질 단추에 나오는 것. 겹증·겹감은 이 단계의 과제에 없다(D-70) */
export const INTERVAL_PICK_QUALITIES: readonly IntervalQuality[] = ['perfect', 'major', 'minor', 'augmented', 'diminished'];
export const INTERVAL_PICK_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const intervalQualityName = (q: IntervalQuality): string => INTERVAL_QUALITY_KO[q];

/** 이름 묻기의 두 단계(성질, 도수) 가운데 지금 골라 둔 것 */
export interface IntervalPick {
  quality: IntervalQuality | null;
  number: number | null;
}

export const EMPTY_INTERVAL_PICK: IntervalPick = { quality: null, number: null };

export function intervalPickOf(choice: string | undefined): IntervalPick {
  const parsed = parseIntervalChoice(choice);
  return parsed ? { quality: parsed.quality, number: parsed.diatonicNumber } : EMPTY_INTERVAL_PICK;
}

/** 성질과 도수가 모두 골라졌을 때만 음정 이름이 된다. 예: '증2도' */
export function intervalPickName(pick: IntervalPick): string | null {
  return pick.quality && pick.number !== null ? intervalName({ quality: pick.quality, diatonicNumber: pick.number }) : null;
}

/** 두 단계가 모두 골라졌을 때만 초안에 담는 편집이 나온다. 하나만 골랐으면 null(초안은 그대로) */
export function intervalPickEdit(slot: number, pick: IntervalPick): DraftEdit | null {
  return pick.quality && pick.number !== null ? setChoiceEdit(slot, intervalChoiceText({ quality: pick.quality, diatonicNumber: pick.number })) : null;
}

/** 질문 하나가 말하는 음들. 비교는 둘, 이름 묻기는 시작과 끝, 음 쌓기는 시작음 */
export function questionPitches(q: IntervalQuestion): SpelledPitch[] {
  if (q.kind === 'compare') return [q.a, q.b];
  if (q.kind === 'identify') return [q.from, q.to];
  return [q.from];
}

/** 질문의 음들을 오선 하나에 그리는 악보(2분음표를 차례로). 정답 음은 담지 않고 질문이 이미 말한 음만 그린다 */
export function questionScoreOf(variant: QuestVariant, q: IntervalQuestion): Score {
  const staff = variant.score.staves[0];
  const voice = variant.score.voices.find((v) => v.staffId === staff?.staffId);
  if (!staff || !voice) throw new Error('악보에 보표나 성부가 없어요');
  const { events: _events, tuplets: _tuplets, chords: _chords, ...rest } = variant.score;
  const events: NoteEvent[] = questionPitches(q).map((pitch, i) => ({
    eventId: `q-${q.qid}-${i}`,
    type: 'note',
    voiceId: voice.voiceId,
    staffId: staff.staffId,
    measureIndex: 0,
    onsetTicks: i * VALUE_TICKS.half,
    durationTicks: VALUE_TICKS.half,
    writtenPitch: writtenOf(pitch),
  }));
  return { ...rest, staves: [staff], voices: [voice], events };
}

// --- 종과 이름표를 소리로 들려 주기

/** 걸려 있는 음 하나. 칸 번호, 기보 음, 이름 있는 음 */
export interface ToneSource {
  slot: number;
  written: WrittenPitch;
  pitch: SpelledPitch;
}

/** 함께 울리기, 아래부터 차례로, 가장 낮은 종만(4.6) */
export type ToneMode = 'together' | 'ascending' | 'lowest';

export const TONE_STEP_TICKS = VALUE_TICKS.half;
export const TONE_CHORD_TICKS = VALUE_TICKS.whole;

export interface ToneNote {
  slot: number;
  midi: number;
  onsetTick: number;
  durationTick: number;
}

/** 들려 줄 음 목록. 같은 높이면 칸 번호가 작은 것이 먼저다 */
export function toneNotesOf(tones: ReadonlyArray<{ slot: number; pitch: SpelledPitch }>, mode: ToneMode): ToneNote[] {
  const sorted = tones.map((t) => ({ slot: t.slot, midi: midiOf(t.pitch) })).sort((a, b) => a.midi - b.midi || a.slot - b.slot);
  if (mode === 'together') return sorted.map((t) => ({ ...t, onsetTick: 0, durationTick: TONE_CHORD_TICKS }));
  if (mode === 'lowest') return sorted.slice(0, 1).map((t) => ({ ...t, onsetTick: 0, durationTick: TONE_CHORD_TICKS }));
  return sorted.map((t, i) => ({ ...t, onsetTick: i * TONE_STEP_TICKS, durationTick: TONE_STEP_TICKS }));
}

// --- 장3화음(Q05)의 종

export interface TriadBell {
  slot: number;
  slotId: string;
  /** 걸린 음. 비어 있으면 null */
  written: WrittenPitch | null;
  pitch: SpelledPitch | null;
  name: string | null;
}

/** 나무 하나의 종 칸 넷의 지금 모습. 걸리지 않은 칸도 나온다. 칸 번호는 초안 전체의 번호다(나무 × 넷 + 열) */
function bellsOnTree(variant: QuestVariant, content: DraftContent, tree: number): TriadBell[] {
  const keySignature = keySignatureOf(variant);
  return Array.from({ length: TRIAD_SLOT_COUNT }, (_, column) => {
    const slot = treeSlot(tree, column);
    const written = content.slots.find((s) => s.slot === slot)?.writtenPitch ?? null;
    const pitch = written ? spellWritten(written, keySignature) : null;
    return { slot, slotId: toneSlotId(slot), written, pitch, name: pitch ? pitchName(pitch) : null };
  });
}

/** 종 칸 넷의 지금 모습. 걸리지 않은 칸도 나온다 */
export function triadBellsOf(variant: QuestVariant, content: DraftContent): TriadBell[] {
  triadSpecOf(variant);
  return bellsOnTree(variant, content, 0);
}

/** 걸려 있는 종들 */
export function hungTonesOf(variant: QuestVariant, content: DraftContent): ToneSource[] {
  return triadBellsOf(variant, content).flatMap((b) => (b.written && b.pitch ? [{ slot: b.slot, written: b.written, pitch: b.pitch }] : []));
}

// --- 화음 사건 목록(Q21 세 기둥, Q23 화음 이어 걷기; 확장 X-3)의 나무들

/** 나무 하나의 종 칸이 초안에서 차지하는 번호: 나무 × 넷 + 열(가로 자리). 나무가 하나인 Q05와 같은 번호 규칙이라 같은 종 카드를 쓴다 */
export const treeSlot = (tree: number, column: number): number => tree * TRIAD_SLOT_COUNT + column;

export function sequenceSpecOf(variant: QuestVariant): ChordSequenceSpec {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'chordSequence') throw new Error('화음 이어 걷기 판본이 아니에요');
  return spec;
}

/** 이 판본이 화음 사건 목록(여러 나무)인가 */
export const isSequenceVariant = (variant: QuestVariant): boolean => variant.evaluatorSpec.type === 'chordSequence';

/** 나무 하나의 종 칸 넷. 구성음 판본이면 나무는 하나(0)이고, 사건 목록 판본이면 spec.trees그루다 */
export function treeBellsOf(variant: QuestVariant, content: DraftContent, tree: number): TriadBell[] {
  const spec = variant.evaluatorSpec;
  const trees = spec.type === 'chordSequence' ? spec.trees : spec.type === 'triadMembership' ? 1 : 0;
  if (trees === 0) throw new Error('종나무 판본이 아니에요');
  if (!Number.isInteger(tree) || tree < 0 || tree >= trees) throw new Error(`나무는 0부터 ${trees - 1}까지예요: ${tree}`);
  return bellsOnTree(variant, content, tree);
}

/** 나무 하나에 걸려 있는 종들 */
export function hungTonesOfTree(variant: QuestVariant, content: DraftContent, tree: number): ToneSource[] {
  return treeBellsOf(variant, content, tree).flatMap((b) => (b.written && b.pitch ? [{ slot: b.slot, written: b.written, pitch: b.pitch }] : []));
}

/** 나무마다 걸린 음을 사건 목록 판정기가 받는 입력으로. 빈 칸은 넘기지 않는다 */
export function chordSequenceInputOf(variant: QuestVariant, content: DraftContent): ChordSequenceInput {
  const spec = sequenceSpecOf(variant);
  return {
    type: 'chordSequence',
    trees: Array.from({ length: spec.trees }, (_, tree) => bellsOnTree(variant, content, tree).flatMap((b) => (b.pitch ? [{ slotId: b.slotId, pitch: b.pitch }] : []))),
  };
}

/**
 * 길을 따라 사건 차례대로 화음을 울린다(Q23 '이어 걷기', Q21 '세 나무'). 화음마다 모드(함께, 아래부터, 가장 낮은 종만)를 따른다.
 * 화음 사이는 그 화음이 울리는 길이만큼 띄우고, 걸린 종이 없는 나무도 한 화음 길이만큼 쉰다(길의 박자를 지킨다). 걸린 종이 하나도 없으면 빈 목록이다.
 */
export function chordRouteNotesOf(variant: QuestVariant, content: DraftContent, mode: ToneMode): ToneNote[] {
  const spec = sequenceSpecOf(variant);
  const out: ToneNote[] = [];
  let offset = 0;
  for (const event of spec.events) {
    const notes = toneNotesOf(hungTonesOfTree(variant, content, event.tree), mode);
    for (const n of notes) out.push({ ...n, onsetTick: n.onsetTick + offset });
    offset += notes.length > 0 ? Math.max(...notes.map((n) => n.onsetTick + n.durationTick)) : TONE_CHORD_TICKS;
  }
  return out;
}

// --- 전위(Q06)의 종 카드

/** 소리를 끄지 않은 종 카드들 */
export function soundingTonesOf(variant: QuestVariant, content: DraftContent): ToneSource[] {
  return toneCardsOf(variant, content)
    .filter((c) => !c.muted)
    .map((c) => ({ slot: c.slot, written: c.written, pitch: c.pitch }));
}

/** 울리는 음 가운데 가장 낮은 것. 높이가 같으면 칸 번호가 작은 것. 없으면 null */
export function lowestToneOf(tones: ReadonlyArray<{ slot: number; pitch: SpelledPitch }>): { slot: number; pitch: SpelledPitch } | null {
  let best: { slot: number; pitch: SpelledPitch } | null = null;
  for (const t of tones) if (!best || midiOf(t.pitch) < midiOf(best.pitch) || (midiOf(t.pitch) === midiOf(best.pitch) && t.slot < best.slot)) best = t;
  return best;
}

/**
 * 종들을 악보에 그린 것. 울리는 종마다 온음표 하나이고, 보표가 둘이면 가운데 도(C4)와 그보다 높은 음은 높은음자리표에, 낮은 음은 낮은음자리표에 적는다.
 * 같은 높이의 음은 하나로 보인다(악보는 겹친 음을 따로 그리지 않는다).
 */
export function toneDisplayScore(variant: QuestVariant, tones: ReadonlyArray<ToneSource>): Score {
  const { events: _events, tuplets: _tuplets, chords: _chords, ...rest } = variant.score;
  const staves = variant.score.staves;
  const treble = staves.find((s) => s.clef === 'treble') ?? staves[0];
  const bass = staves.find((s) => s.clef === 'bass') ?? treble;
  const len = measureTicks(variant.score.meter);
  const seen = new Set<string>();
  const events: NoteEvent[] = [];
  for (const t of tones) {
    const key = `${t.written.letter}${t.written.accidental ?? ''}${t.written.octave}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const staff = staves.length > 1 && midiOf(t.pitch) < 60 ? bass : treble;
    const voice = staff ? variant.score.voices.find((v) => v.staffId === staff.staffId) : undefined;
    if (!staff || !voice) continue;
    events.push({ eventId: `u-${toneSlotId(t.slot)}`, type: 'note', voiceId: voice.voiceId, staffId: staff.staffId, measureIndex: 0, onsetTicks: 0, durationTicks: len, writtenPitch: t.written });
  }
  return { ...rest, events };
}

// --- 화음 이름(Q05)과 종 카드를 고칠 때의 낭독 문장(Q06)

/** 화음 이름. 변종 이름 끝의 괄호에 든 구성음 목록은 답이라서 뺀다. 예: 'C장3화음 (C E G)' → 'C장3화음' */
export function chordTitleOf(variant: QuestVariant): string {
  return (variant.label ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim() || '화음';
}

/** 종 카드를 고친 결과: 초안의 편집과 화면 낭독용 문장. 고칠 수 없으면 이유만 돌려준다 */
export type ToneEditResult = { ok: true; edit: DraftEdit; text: string } | { ok: false; text: string };

export const toneLabelOf = (slot: number): string => `종 ${slot + 1}`;

/** 울리는 종 가운데 가장 낮은 음을 말하는 문장. 소리가 켜진 종이 없으면 그렇게 알린다 */
function lowestSentence(cards: readonly ToneCard[], unchanged = false): string {
  const low = lowestToneOf(cards.filter((c) => !c.muted).map((c) => ({ slot: c.slot, pitch: c.pitch })));
  if (!low) return '소리가 켜진 종이 없어요.';
  return fillTemplate(unchanged ? '가장 낮은 음은 그대로 {name:이에요}.' : '가장 낮은 음은 {name:이에요}.', { name: pitchName(low.pitch) });
}

/** 종의 옥타브를 한 단 올리거나 내린다 */
export function toneShiftResult(variant: QuestVariant, content: DraftContent, slot: number, delta: 1 | -1): ToneEditResult {
  const cards = toneCardsOf(variant, content);
  const card = cards.find((c) => c.slot === slot);
  const label = toneLabelOf(slot);
  if (!card) return { ok: false, text: `${label}은 없어요.` };
  const edit = shiftToneOctaveEdit(variant, content, slot, delta);
  if (!edit) {
    const [from, to] = variant.challengeDescriptor.range.split('-');
    return { ok: false, text: `${label}: 더 ${delta > 0 ? '높이 올릴' : '낮게 내릴'} 수 없어요. 이 도전의 음역은 ${from}부터 ${to ?? from}까지예요.` };
  }
  const moved: SpelledPitch = { ...card.pitch, octave: card.pitch.octave + delta };
  const next = cards.map((c) => (c.slot === slot ? { ...c, pitch: moved } : c));
  const text = fillTemplate('{label}: {name:으로로} {verb}. {lowest}', { label, name: pitchName(moved), verb: delta > 0 ? '올렸어요' : '내렸어요', lowest: lowestSentence(next) });
  return { ok: true, edit, text };
}

/** 종의 옥타브를 정한 단으로 옮긴다(가지를 눌러서 옮기기). 이미 그 단이거나 음역 밖이면 이유만 돌려준다 */
export function toneOctaveResult(variant: QuestVariant, content: DraftContent, slot: number, octave: number): ToneEditResult {
  const cards = toneCardsOf(variant, content);
  const card = cards.find((c) => c.slot === slot);
  const label = toneLabelOf(slot);
  if (!card) return { ok: false, text: `${label}은 없어요.` };
  if (card.pitch.octave === octave) return { ok: false, text: fillTemplate('{label}: 이미 {name:이에요}.', { label, name: card.name }) };
  const edit = toneOctaveEdit(variant, content, slot, octave);
  if (!edit) {
    const [from, to] = variant.challengeDescriptor.range.split('-');
    return { ok: false, text: `${label}: ${octave}옥타브는 이 도전의 음역 밖이에요. 음역은 ${from}부터 ${to ?? from}까지예요.` };
  }
  const moved: SpelledPitch = { ...card.pitch, octave };
  const next = cards.map((c) => (c.slot === slot ? { ...c, pitch: moved } : c));
  const text = fillTemplate('{label}: {name:으로로} {verb}. {lowest}', { label, name: pitchName(moved), verb: octave > card.pitch.octave ? '올렸어요' : '내렸어요', lowest: lowestSentence(next) });
  return { ok: true, edit, text };
}

/** 종의 소리를 끄거나 켠다 */
export function toneMuteResult(variant: QuestVariant, content: DraftContent, slot: number): ToneEditResult {
  const cards = toneCardsOf(variant, content);
  const card = cards.find((c) => c.slot === slot);
  const label = toneLabelOf(slot);
  const edit = toggleToneMuteEdit(variant, content, slot);
  if (!card || !edit) return { ok: false, text: `${label}은 없어요.` };
  const next = cards.map((c) => (c.slot === slot ? { ...c, muted: !c.muted } : c));
  return { ok: true, edit, text: `${label}: 소리를 ${card.muted ? '켰어요' : '껐어요'}. ${lowestSentence(next)}` };
}

/** 종을 옆 칸과 맞바꾼다(가로 순서만 바뀐다). 방향이 가장자리를 넘으면 이유만 돌려준다 */
export function toneSwapResult(variant: QuestVariant, content: DraftContent, slot: number, direction: 'left' | 'right'): ToneEditResult {
  const cards = toneCardsOf(variant, content);
  const label = toneLabelOf(slot);
  const other = slot + (direction === 'right' ? 1 : -1);
  if (!cards.some((c) => c.slot === slot)) return { ok: false, text: `${label}은 없어요.` };
  if (!cards.some((c) => c.slot === other)) return { ok: false, text: `${label}: 더 ${direction === 'right' ? '오른쪽' : '왼쪽'}으로 옮길 수 없어요. 이미 가장자리예요.` };
  const edit = swapToneEdit(variant, content, slot, other);
  if (!edit) return { ok: false, text: `${label}: 자리를 바꿀 수 없어요.` };
  return { ok: true, edit, text: fillTemplate('{a:와과} {b}의 자리를 바꿨어요. {lowest}', { a: label, b: toneLabelOf(other), lowest: lowestSentence(cards, true) }) };
}
