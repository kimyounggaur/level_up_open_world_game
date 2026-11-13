// 4-2 자리 변환표(SlotMap): 설치물의 '몇 번째 자리'를 음악 데이터로 바꾼다. 설계서 4.2, 4.3, 부록 A.2.
// 판정기는 변환된 음악 데이터(자리 번호와 음이름)만 받는다. 설치물의 화면 좌표, 캐릭터 위치, 걸은 시간은 여기로 들어오지 못한다(W-3).
// 패널의 '장음계 배열하기'와 월드의 디딤돌 길이 같은 변환표를 쓰므로 같은 초안을 두 가지로 보는 것이 된다(4.2 '패널로 보기').
import type { OrderedPlacement } from './evaluators';
import type { QuestVariant } from './content';
import type { Issue } from './feedback';
import { diatonicIndex, letterOctaveAt, midiOf, midiToSharpName, parsePitch, pitchName } from './pitch';
import type { Accidental, Letter, SpelledPitch, WrittenPitch } from './pitch';
import type { PlayNote } from './playback';
import type { Score, ScoreEvent } from './score';
import { spellWritten } from './session';
import type { DraftContent, DraftEdit } from './session';
import { VALUE_TICKS, measureTicks } from './time';

/** 돌을 밟으면 그 돌의 음이 울리는 시간(초, 4.3) */
export const STEP_NOTE_SEC = 0.5;
/** 듣기에서 자리 하나가 차지하는 길이: 4분음표(4.3 '4분음표 80으로 왼쪽부터 차례로') */
export const SLOT_NOTE_TICKS = VALUE_TICKS.quarter;

/** 재료 선반에서 고르는 변화표. 없음, ♯, ♭(4.3). 제자리표를 일부러 적는 일은 이 과제에서 다루지 않는다 */
export const HAND_ACCIDENTALS: readonly (Accidental | null)[] = ['flat', null, 'sharp'];

/** 선반의 한 칸: 음이름의 자리(문자와 옥타브). 변화표는 따로 고른다 */
export interface ShelfPosition {
  letter: Letter;
  octave: number;
  /** 변화표 없이 쓴 이름. 예: 'F4' */
  name: string;
}

/** 손에 든 재료: 선반의 칸 하나와 변화표 */
export interface Hand {
  /** 선반(shelf)의 칸 번호(0부터) */
  shelfIndex: number;
  accidental: Accidental | null;
}

export interface SlotView {
  /** 1부터 */
  slot: number;
  /** 놓인 기보 음. 비었으면 null */
  written: WrittenPitch | null;
  /** 조표를 적용한 음. 비었으면 null */
  spelled: SpelledPitch | null;
  midi: number | null;
  /** 돌에 쓰는 이름. 예: 'B♭4'. 비었으면 null */
  name: string | null;
}

export interface SlotMap {
  readonly kind: 'orderedPitches';
  readonly voiceId: string;
  /** 자리 수 */
  readonly count: number;
  /** 으뜸음 한 음 아래부터 옥타브 위 한 음까지(4.3) */
  readonly shelf: readonly ShelfPosition[];
  /** 으뜸음이 있는 선반 칸 번호(처음 손에 드는 재료) */
  readonly tonicIndex: number;
  /** 이 판본의 조표(♯ 수는 +, ♭ 수는 -) */
  readonly keySignature: number;
  /** 손에 든 재료를 기보 음으로 */
  written(hand: Hand): WrittenPitch;
  /** 재료의 이름(조표를 적용한 소리 이름) */
  nameOf(hand: Hand | WrittenPitch): string;
  midiOf(hand: Hand | WrittenPitch): number;
  place(slot: number, hand: Hand): DraftEdit;
  clear(slot: number): DraftEdit;
  view(content: DraftContent): SlotView[];
  /** 판정기에 넘기는 입력: 자리 번호와 음이름뿐이다 */
  evaluatorPlacements(content: DraftContent): OrderedPlacement[];
  /** 내 배치 듣기: 자리 번호 순서대로 4분음표씩. 빈 자리는 쉰다 */
  playback(content: DraftContent): { notes: PlayNote[]; lengthTicks: number };
  /**
   * 패널의 '내 악보': 놓은 음을 목표 악보의 틀(박자, 조표, 보표)에 4분음표로 늘어놓는다. 빈 자리는 4분쉼표다.
   * 목표 악보의 음은 담지 않는다. 음계 과제는 목표를 보여 주면 답이 되기 때문이다.
   */
  score(content: DraftContent): Score;
}

const isWritten = (v: Hand | WrittenPitch): v is WrittenPitch => 'letter' in v;

/** 판본에 담긴 음계 순서 판정기의 값을 꺼낸다. 다른 판정기면 변환표가 없다 */
export function hasSlotMap(variant: QuestVariant): boolean {
  return variant.evaluatorSpec.type === 'orderedScale';
}

/** 이 판본에서 순서를 보는 성부의 조표 */
function keySignatureOfVoice(variant: QuestVariant, voiceId: string): number {
  const voice = variant.score.voices.find((v) => v.voiceId === voiceId);
  const staff = variant.score.staves.find((s) => s.staffId === voice?.staffId);
  return staff?.keySignature ?? 0;
}

/** 판본의 음역(예: 'F4-F5')에서 선반을 만든다 */
export function shelfOf(range: string): { shelf: ShelfPosition[]; tonicIndex: number } {
  const [from, to] = range.split('-');
  const low = parsePitch(from!);
  const high = parsePitch(to ?? from!);
  const shelf: ShelfPosition[] = [];
  for (let i = diatonicIndex(low) - 1; i <= diatonicIndex(high) + 1; i++) {
    const { letter, octave } = letterOctaveAt(i);
    shelf.push({ letter, octave, name: `${letter}${octave}` });
  }
  return { shelf, tonicIndex: 1 };
}

/** 변환표를 만든다. 판본의 판정기가 음계 순서(orderedScale)가 아니면 오류를 던진다 */
export function slotMapOf(variant: QuestVariant): SlotMap {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'orderedScale') throw new Error(`'${spec.type}' 판정기에는 orderedPitches 변환표를 쓸 수 없어요`);
  const { shelf, tonicIndex } = shelfOf(variant.challengeDescriptor.range);
  const keySignature = keySignatureOfVoice(variant, spec.voiceId);
  const count = spec.count;
  const check = (slot: number): void => {
    if (!Number.isInteger(slot) || slot < 1 || slot > count) throw new Error(`자리 번호는 1부터 ${count}까지예요: ${slot}`);
  };
  const writtenOf = (hand: Hand): WrittenPitch => {
    const pos = shelf[hand.shelfIndex];
    if (!pos) throw new Error(`선반에 없는 칸이에요: ${hand.shelfIndex}`);
    return { letter: pos.letter, accidental: hand.accidental, octave: pos.octave };
  };
  const spell = (w: WrittenPitch): SpelledPitch => spellWritten(w, keySignature);
  const toWritten = (v: Hand | WrittenPitch): WrittenPitch => (isWritten(v) ? v : writtenOf(v));

  const view = (content: DraftContent): SlotView[] =>
    Array.from({ length: count }, (_, i) => {
      const slot = i + 1;
      const entry = content.slots.find((s) => s.slot === slot);
      const w = entry?.writtenPitch ?? null;
      // 이름 없이 소리 높이만 있는 칸(건반 다리의 순서 깃발, 4.8): 소리 높이는 있고 기보 음과 이름은 없다
      if (!w && typeof entry?.midi === 'number') return { slot, written: null, spelled: null, midi: entry.midi, name: midiToSharpName(entry.midi) };
      if (!w) return { slot, written: null, spelled: null, midi: null, name: null };
      const spelled = spell(w);
      return { slot, written: w, spelled, midi: midiOf(spelled), name: pitchName(spelled) };
    });

  return {
    kind: 'orderedPitches',
    voiceId: spec.voiceId,
    count,
    shelf,
    tonicIndex,
    keySignature,
    written: writtenOf,
    nameOf: (v) => pitchName(spell(toWritten(v))),
    midiOf: (v) => midiOf(spell(toWritten(v))),
    place(slot, hand) {
      check(slot);
      return { type: 'setSlot', slot, writtenPitch: writtenOf(hand) };
    },
    clear(slot) {
      check(slot);
      return { type: 'setSlot', slot, writtenPitch: null };
    },
    view,
    evaluatorPlacements: (content) => view(content).map((v) => (v.spelled === null && v.midi !== null ? { slot: v.slot, midi: v.midi } : { slot: v.slot, pitch: v.spelled })),
    playback(content) {
      const notes: PlayNote[] = [];
      for (const v of view(content)) {
        if (v.midi === null) continue;
        notes.push({ id: `slot-${v.slot}`, midi: v.midi, onsetTick: (v.slot - 1) * SLOT_NOTE_TICKS, durationTick: SLOT_NOTE_TICKS });
      }
      return { notes, lengthTicks: count * SLOT_NOTE_TICKS };
    },
    score(content) {
      const { events: _events, tuplets: _tuplets, chords: _chords, measureCount: _measureCount, ...frame } = variant.score;
      const staffId = variant.score.voices.find((v) => v.voiceId === spec.voiceId)?.staffId ?? variant.score.staves[0]?.staffId ?? 's1';
      const perMeasure = Math.max(1, Math.floor(measureTicks(variant.score.meter) / SLOT_NOTE_TICKS));
      const events = view(content).map((v): ScoreEvent => {
        const i = v.slot - 1;
        const base = {
          eventId: `slot-${v.slot}`,
          voiceId: spec.voiceId,
          staffId,
          measureIndex: Math.floor(i / perMeasure),
          onsetTicks: (i % perMeasure) * SLOT_NOTE_TICKS,
          durationTicks: SLOT_NOTE_TICKS,
        };
        return v.written ? { ...base, type: 'note', writtenPitch: v.written } : { ...base, type: 'rest' };
      });
      return { ...frame, measureCount: Math.ceil(count / perMeasure), events };
    },
  };
}

/** 선반의 재료 이름. 변화표를 붙이고 조표를 적용한다. 예: F장조에서 B → 'B♭4' */
export function handName(map: SlotMap, hand: Hand): string {
  return map.nameOf(hand);
}

/** 변화표를 한 칸 올리거나(+1) 내린다(-1). ♭ → 없음 → ♯ 사이를 오간다. 끝에서는 멈춘다 */
export function shiftAccidental(current: Accidental | null, delta: 1 | -1): Accidental | null {
  const i = HAND_ACCIDENTALS.indexOf(current);
  const next = Math.min(HAND_ACCIDENTALS.length - 1, Math.max(0, (i < 0 ? 1 : i) + delta));
  return HAND_ACCIDENTALS[next]!;
}

/** 변화표를 글자로. 없으면 빈 글자 */
export const accidentalText = (a: Accidental | null): string => (a === 'sharp' ? '♯' : a === 'flat' ? '♭' : '');

/** 판정이 가리킨 자리 번호들. 두 자리가 서로 바뀐 경우(WRONG_ORDER)는 두 자리 모두 가리킨다(4.2 '다른 자리에만 느낌표') */
export function flaggedSlots(issues: readonly Issue[]): number[] {
  const set = new Set<number>();
  for (const issue of issues) {
    const p = issue.target?.position;
    if (typeof p === 'number') set.add(p);
    const other = issue.params['otherPosition'];
    if (typeof other === 'number') set.add(other);
  }
  return [...set].sort((a, b) => a - b);
}

/** 선반 칸에 쓰는 변화표 글자(읽을 때) */
export const accidentalWord = (a: Accidental | null): string => (a === 'sharp' ? '올림표' : a === 'flat' ? '내림표' : '변화표 없음');

