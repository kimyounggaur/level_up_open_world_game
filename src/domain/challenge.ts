// 2-5·2-6 과제 화면이 쓰는 순수 계산.
// 사용자가 놓은 초안을 판정기 입력으로 바꾸고, 놓을 수 있는 자리와 재료를 정한다.
// 화면 좌표나 시간을 받지 않는다. 판정기에는 칸 번호와 틱 같은 정수와 음 이름만 넘어간다(W-3).
import type { QuestVariant } from './content';
import { evaluate } from './evaluators';
import { expectedPitchesOf } from './evaluators/orderedScale';
import type { Evaluation, EvaluatorInput, PitchSpellingSpec, RhythmPlacementSpec } from './evaluators';
import { diatonicIndex, letterOctaveAt, parsePitch, pitchName, writtenOf } from './pitch';
import type { SpelledPitch } from './pitch';
import { isNote, measureCountOf } from './score';
import type { NoteEvent, RestEvent, Score, ScoreEvent } from './score';
import { spellWritten } from './session';
import type { DraftContent, DraftEdit } from './session';
import { slotMapOf } from './slotmap';
import { chordSequenceInputOf, intervalAnswersOf, inversionInputOf, triadInputOf } from './slotplan';
import { pitchAtStaffPosition } from './staff';
import type { Clef } from './staff';
import { VALUE_TICKS, measureTicks } from './time';
import type { NoteValue } from './time';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 초안을 판정과 재생에 쓰는 악보로 만든다. 목표 악보의 틀(박자, 보표, 성부, 템포, 마디 수)에 사용자가 놓은 사건을 얹는다. */
export function draftScoreOf(frame: Score, content: DraftContent): Score {
  const { events: _events, tuplets: _tuplets, chords: _chords, ...rest } = frame;
  return { ...rest, events: clone(content.events), ...(content.tuplets.length > 0 ? { tuplets: clone(content.tuplets) } : {}) };
}

// ---------------------------------------------------------------------------
// 판정

/** 판정기가 몇 번째 칸을 어떤 id로 부르는가. 칸 번호는 판정 목표의 차례를 따른다 */
export function slotIdsOf(variant: QuestVariant): string[] {
  const spec = variant.evaluatorSpec;
  if (spec.type === 'pitchSpelling') return spec.targets.map((t) => t.slotId);
  return [];
}

/** 초안을 판정기가 받는 입력으로 바꾼다. 아직 연결하지 않은 판정기는 숨기지 않고 오류로 알린다. */
export function evaluatorInputOf(variant: QuestVariant, content: DraftContent): EvaluatorInput {
  const spec = variant.evaluatorSpec;
  switch (spec.type) {
    case 'pitchSpelling':
      return {
        type: 'pitchSpelling',
        placed: spec.targets.map((t, i) => {
          const entry = content.slots.find((s) => s.slot === i);
          const staff = variant.score.staves.find((s) => s.clef === t.clef);
          return { slotId: t.slotId, pitch: entry && entry.writtenPitch ? spellWritten(entry.writtenPitch, staff?.keySignature ?? 0) : null };
        }),
      };
    case 'rhythmPlacement':
      return { type: 'rhythmPlacement', score: draftScoreOf(variant.score, content) };
    case 'orderedScale':
      // 설치물(디딤돌)과 패널이 같은 변환표로 자리 번호를 음이름으로 바꾼다. 좌표와 시간은 넘어가지 않는다(W-3)
      return { type: 'orderedScale', placed: slotMapOf(variant).evaluatorPlacements(content) };
    case 'interval':
      return { type: 'interval', answers: intervalAnswersOf(variant, content) };
    case 'triadMembership':
      return triadInputOf(variant, content);
    case 'chordSequence':
      return chordSequenceInputOf(variant, content);
    case 'inversion':
      return inversionInputOf(variant, content);
    case 'scoreArrangement':
      // 성부마다 따로 비교한다. 한 성부를 끝낸 것을 두 성부를 끝낸 것으로 세지 않는다(5-4)
      return { type: 'scoreArrangement', score: draftScoreOf(variant.score, content) };
    default:
      throw new Error(`'${(spec as { type: string }).type}' 판정에 쓰는 입력 만들기는 아직 연결하지 않았어요`);
  }
}

export function evaluateDraft(variant: QuestVariant, content: DraftContent): Evaluation {
  return evaluate(variant.evaluatorSpec, evaluatorInputOf(variant, content), variant.score);
}

// ---------------------------------------------------------------------------
// 박 칸에 놓기(Q02 같은 리듬 놓기 과제)

export interface GridCell {
  cellId: string;
  measureIndex: number;
  /** 마디 안에서 0부터 센 칸 번호 */
  cellIndex: number;
  onsetTicks: number;
  durationTicks: number;
  /** 화면에 쓰는 이름. 예: '1박' */
  label: string;
}

export type Material = { kind: 'note'; pitch: SpelledPitch; value: NoteValue } | { kind: 'rest'; value: NoteValue };

export interface MaterialSet {
  pitches: SpelledPitch[];
  values: NoteValue[];
  rests: boolean;
}

function rhythmSpec(variant: QuestVariant): RhythmPlacementSpec {
  if (variant.evaluatorSpec.type !== 'rhythmPlacement') throw new Error('리듬 놓기 판본이 아니에요');
  return variant.evaluatorSpec;
}

/** 칸 하나의 길이는 판본이 정한 가장 짧은 음가다 */
export function gridCellsOf(variant: QuestVariant): GridCell[] {
  rhythmSpec(variant);
  const cellTicks = VALUE_TICKS[variant.challengeDescriptor.smallestValue];
  const len = measureTicks(variant.score.meter);
  const perMeasure = len / cellTicks;
  if (!Number.isInteger(perMeasure)) throw new Error(`마디(${len}틱)를 ${cellTicks}틱 칸으로 나눌 수 없어요`);
  const measures = Math.max(1, measureCountOf(variant.score));
  const cells: GridCell[] = [];
  for (let m = 0; m < measures; m++) {
    for (let c = 0; c < perMeasure; c++) {
      cells.push({
        cellId: `m${m}c${c}`,
        measureIndex: m,
        cellIndex: c,
        onsetTicks: c * cellTicks,
        durationTicks: cellTicks,
        label: measures === 1 ? `${c + 1}박` : `${m + 1}마디 ${c + 1}박`,
      });
    }
  }
  return cells;
}

/** 판본이 정한 음역 안의 제자리 음들(예: 'C4-E4' → C4, D4, E4)과 놓을 수 있는 음가 */
export function materialsOf(variant: QuestVariant): MaterialSet {
  const [from, to] = variant.challengeDescriptor.range.split('-');
  const low = parsePitch(from!);
  const high = parsePitch(to ?? from!);
  const pitches: SpelledPitch[] = [];
  for (let i = diatonicIndex(low); i <= diatonicIndex(high); i++) {
    const { letter, octave } = letterOctaveAt(i);
    pitches.push({ letter, alter: 0, octave });
  }
  return { pitches, values: [variant.challengeDescriptor.smallestValue], rests: true };
}

export function eventAtCell(content: DraftContent, cell: GridCell): ScoreEvent | undefined {
  return content.events.find((e) => e.measureIndex === cell.measureIndex && e.onsetTicks === cell.onsetTicks);
}

/** 칸에 놓을 사건을 만든다. 같은 칸에 놓으면 같은 id를 다시 쓴다 */
export function eventForCell(variant: QuestVariant, cell: GridCell, material: Material): ScoreEvent {
  const spec = rhythmSpec(variant);
  const voice = variant.score.voices.find((v) => v.voiceId === spec.voiceId);
  if (!voice) throw new Error(`성부 ${spec.voiceId}가 악보에 없어요`);
  const base = {
    eventId: `u-${cell.cellId}`,
    voiceId: voice.voiceId,
    staffId: voice.staffId,
    measureIndex: cell.measureIndex,
    onsetTicks: cell.onsetTicks,
    durationTicks: VALUE_TICKS[material.value],
  };
  if (material.kind === 'rest') {
    const rest: RestEvent = { ...base, type: 'rest' };
    return rest;
  }
  const note: NoteEvent = { ...base, type: 'note', writtenPitch: writtenOf(material.pitch) };
  return note;
}

/** 칸에 재료를 놓는 편집. 이미 있으면 바꾸고, 같은 것이면 아무 일도 하지 않는다 */
export function placeInCellEdit(variant: QuestVariant, content: DraftContent, cell: GridCell, material: Material): DraftEdit {
  const next = eventForCell(variant, cell, material);
  const existing = eventAtCell(content, cell);
  return existing ? { type: 'replaceEvent', eventId: existing.eventId, event: { ...next, eventId: existing.eventId } } : { type: 'addEvent', event: next };
}

export function clearCellEdit(content: DraftContent, cell: GridCell): DraftEdit | null {
  const existing = eventAtCell(content, cell);
  return existing ? { type: 'removeEvent', eventId: existing.eventId } : null;
}

/** 사건을 화면에 쓸 짧은 이름으로 바꾼다. 음은 '쉼'이 아니면 음 이름이다 */
export function eventLabel(e: ScoreEvent): string {
  if (!isNote(e)) return '쉼';
  const acc = e.writtenPitch.accidental;
  const mark = acc === 'sharp' ? '♯' : acc === 'flat' ? '♭' : acc === 'doubleSharp' ? '𝄪' : acc === 'doubleFlat' ? '𝄫' : acc === 'natural' ? '♮' : '';
  return `${e.writtenPitch.letter}${mark}${e.writtenPitch.octave}`;
}

// ---------------------------------------------------------------------------
// 오선에 놓기(Q01 같은 음이름 과제)

export interface StaffSlot {
  slot: number;
  slotId: string;
  label: string;
  clef: Clef;
  keySignature: number;
}

/** 음계 순서 판본(Q12)에서 한 칸이 읽는 음자리표: 가온 도(C4) 아래는 낮은음자리표, 그 위는 높은음자리표다. 큰보표에서 음역으로 나누는 보통의 방법이다 */
export const scaleSlotClefOf = (midi: number): Clef => (midi < 60 ? 'bass' : 'treble');

/**
 * 오선에 놓는 칸 목록.
 * - 음이름 판본(pitchSpelling): 판정 목표의 차례(0부터)가 칸 번호다.
 * - 음계 순서 판본(orderedScale, Q12 큰보표): 순서(1부터)가 칸 번호이고 칸의 이름은 목표 음의 이름이다. 음자리표는 목표 음의 음역으로 정한다.
 */
export function staffSlotsOf(variant: QuestVariant): StaffSlot[] {
  const spec = variant.evaluatorSpec;
  if (spec.type === 'orderedScale') {
    const keySignature = variant.score.staves.find((s) => s.staffId === variant.score.voices.find((v) => v.voiceId === spec.voiceId)?.staffId)?.keySignature ?? 0;
    return expectedPitchesOf(variant.score, spec.voiceId).map((p, i) => ({ slot: i + 1, slotId: String(i + 1), label: pitchName(p), clef: scaleSlotClefOf(p.midi), keySignature }));
  }
  if (spec.type !== 'pitchSpelling') throw new Error('음이름이나 음계 판본이 아니에요');
  return (spec as PitchSpellingSpec).targets.map((t, i) => {
    if (!t.clef) throw new Error(`목표 ${t.slotId}에 음자리표가 없어요`);
    const staff = variant.score.staves.find((s) => s.clef === t.clef);
    return { slot: i, slotId: t.slotId, label: t.label, clef: t.clef, keySignature: staff?.keySignature ?? 0 };
  });
}

/** 보표 위치에 온음표를 놓는 편집. 임시표 없이 제자리 음으로 읽는다 */
export function placeOnStaffEdit(slot: StaffSlot, position: number): DraftEdit {
  return { type: 'setSlot', slot: slot.slot, writtenPitch: writtenOf(pitchAtStaffPosition(slot.clef, position, 0)) };
}

export function clearStaffSlotEdit(slot: StaffSlot): DraftEdit {
  return { type: 'setSlot', slot: slot.slot, writtenPitch: null };
}

/**
 * 오선 칸 하나를 그리는 악보: 그 칸의 보표 하나에, 놓인 음이 있으면 온음표 하나.
 * 목표 악보의 틀(박자, 템포)을 따르고, 정답 음은 담지 않는다.
 */
export function slotDisplayScore(variant: QuestVariant, slot: StaffSlot, content: DraftContent): Score {
  const staff = variant.score.staves.find((s) => s.clef === slot.clef);
  if (!staff) throw new Error(`악보에 ${slot.clef} 보표가 없어요`);
  const voice = variant.score.voices.find((v) => v.staffId === staff.staffId);
  if (!voice) throw new Error(`보표 ${staff.staffId}에 성부가 없어요`);
  const entry = content.slots.find((x) => x.slot === slot.slot);
  const { events: _events, tuplets: _tuplets, chords: _chords, ...rest } = variant.score;
  const events: ScoreEvent[] = [];
  if (entry && entry.writtenPitch) {
    const note: NoteEvent = {
      eventId: slotEventId(slot),
      type: 'note',
      voiceId: voice.voiceId,
      staffId: staff.staffId,
      measureIndex: 0,
      onsetTicks: 0,
      durationTicks: Math.min(VALUE_TICKS.whole, measureTicks(variant.score.meter)),
      writtenPitch: entry.writtenPitch,
    };
    events.push(note);
  }
  return { ...rest, staves: [staff], voices: [voice], events };
}

/** 오선 칸에 놓인 음을 악보 위에서 가리키는 사건 id */
export const slotEventId = (slot: StaffSlot): string => `u-slot-${slot.slot}`;
