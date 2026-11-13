// 5-1 시간선: 길이가 있는 음과 쉼을 틱으로 놓는 과제가 쓰는 순수 계산.
// Q03(32분음표와 셋잇단의 확대 시간선)과 Q08(합주 악보 편집)이 같은 계산을 쓴다.
// 화면 좌표와 시간은 받지 않는다. 칸 번호, 마디, 틱 같은 정수와 음 이름만 오간다(W-3).
// Q02처럼 박 하나가 한 칸인 과제는 이 계산이 아니라 challenge.ts의 박 칸(gridCellsOf)을 쓴다.
import type { GridCell } from './challenge';
import type { QuestVariant } from './content';
import { hasBatchim } from './feedback';
import { parsePitch, pitchName, writtenOf, diatonicIndex, letterOctaveAt } from './pitch';
import type { SpelledPitch } from './pitch';
import { isNote, measureCountOf } from './score';
import type { NoteEvent, RestEvent, ScoreEvent, TupletGroup } from './score';
import type { DraftContent, DraftEdit } from './session';
import { VALUE_NAME_KO, VALUE_TICKS, countUnitTicks, describeTicks, dottedTicks, measureTicks, tupletNoteTicks } from './time';
import type { NoteValue } from './time';

export interface TimelineVoice {
  voiceId: string;
  staffId: string;
  label: string;
}

export interface TupletKind {
  actualNotes: number;
  normalNotes: number;
  writtenBaseDuration: NoteValue;
}

export interface TimelineSpec {
  measureTicks: number;
  measures: number;
  /** 한 박의 틱. 4/4는 960, 6/8은 1440 */
  beatTicks: number;
  /** 일반 음표가 놓일 수 있는 칸 하나의 틱(판본이 정한 가장 짧은 음가) */
  cellTicks: number;
  voices: TimelineVoice[];
  /**
   * 놓을 수 있는 음가. 한 박 이상의 긴 음이 목표에 나오거나(시간선 판본) 칸이 한 박보다 잘면 가장 짧은 음가부터 마디 길이 이하까지다.
   * 박 하나가 한 칸인 판본(Q02, Q13)은 그 음가 하나뿐이다.
   */
  values: NoteValue[];
  /** 점을 붙여 놓을 수 있는 음가(목표에 점음표가 나오는 판본만). 점음표의 틱이 칸의 배수이고 마디 안에 드는 것만 든다 */
  dottedValues: NoteValue[];
  /** 이 판본의 악보에 나오는 연음. 있으면 묶음 놓기가 열린다 */
  tuplets: TupletKind[];
  /** 화면 칸을 나누는 가장 작은 단위(칸과 연음 돌의 최대공약수) */
  unitTicks: number;
  /** 판본의 음역 문자. 예: 'C4-F4' */
  range: string;
}

const VALUE_ORDER: NoteValue[] = ['thirtySecond', 'sixteenth', 'eighth', 'quarter', 'half', 'whole'];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// 문장에 쓰는 조사. 받침이 있는가는 feedback의 규칙(숫자와 ♯·♭ 읽기 포함)을 따른다
const josa = (text: string, pair: readonly [string, string]): string => `${text}${hasBatchim(text) ? pair[0] : pair[1]}`;
const eulReul = (text: string): string => josa(text, ['을', '를']);
const eunNeun = (text: string): string => josa(text, ['은', '는']);
const waGwa = (text: string): string => josa(text, ['과', '와']);
const euroRo = (text: string): string => josa(text, ['으로', '로']);

/** 연음 돌의 순서 이름 */
const STONE_ORDER = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];

/** 점음표의 이름. 예: '점2분음표' */
export const dottedValueName = (value: NoteValue): string => `점${VALUE_NAME_KO[value]}`;

/** 음가(점 여부 포함)의 이름과 틱. 놓는 재료가 이 길이로 놓인다 */
export const materialValueName = (value: NoteValue, dotted: boolean): string => (dotted ? dottedValueName(value) : VALUE_NAME_KO[value]);
export const materialValueTicks = (value: NoteValue, dotted: boolean): number => (dotted ? dottedTicks(value) : VALUE_TICKS[value]);

/** 이 틱이 점음표(점 하나)의 길이인가. 점2분 2880, 점4분 1440, 점8분 720처럼 */
export const isDottedLength = (ticks: number): boolean => VALUE_ORDER.some((v) => dottedTicks(v) === ticks);

/**
 * 이 판본이 시간선 편집(여러 칸 길이, 연음, 여러 마디나 성부)을 쓰는가. 박 하나가 한 칸인 Q02, Q13은 아니다.
 * 목표에 한 박보다 긴 음이나 쉼(2분음표, 점2분음표 같은)이 나오면 박 칸에는 놓을 수 없으므로 시간선이다.
 */
export function isTimelineVariant(variant: QuestVariant): boolean {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'rhythmPlacement' && spec.type !== 'scoreArrangement') return false;
  const t = timelineOf(variant);
  return t.cellTicks < t.beatTicks || t.tuplets.length > 0 || t.voices.length > 1 || t.measures > 1 || variant.score.events.some((e) => e.durationTicks > t.beatTicks);
}

export function timelineOf(variant: QuestVariant): TimelineSpec {
  const evaluator = variant.evaluatorSpec;
  const score = variant.score;
  let voiceIds: Array<{ voiceId: string; label?: string }>;
  if (evaluator.type === 'rhythmPlacement') voiceIds = [{ voiceId: evaluator.voiceId }];
  else if (evaluator.type === 'scoreArrangement') voiceIds = evaluator.voices;
  else throw new Error(`'${evaluator.type}' 판본에는 시간선이 없어요`);
  const mLen = measureTicks(score.meter);
  const beatTicks = countUnitTicks(score.meter);
  const cellTicks = VALUE_TICKS[variant.challengeDescriptor.smallestValue];
  const voices: TimelineVoice[] = voiceIds.map((v) => {
    const found = score.voices.find((x) => x.voiceId === v.voiceId);
    if (!found) throw new Error(`성부 ${v.voiceId}가 악보에 없어요`);
    return { voiceId: v.voiceId, staffId: found.staffId, label: v.label ?? found.label ?? '성부' };
  });
  const seen = new Set<string>();
  const tuplets: TupletKind[] = [];
  for (const g of score.tuplets ?? []) {
    const key = `${g.actualNotes}:${g.normalNotes}:${g.writtenBaseDuration}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tuplets.push({ actualNotes: g.actualNotes, normalNotes: g.normalNotes, writtenBaseDuration: g.writtenBaseDuration });
  }
  let unit = cellTicks;
  for (const t of tuplets) unit = gcd(unit, tupletNoteTicks(t.writtenBaseDuration, t.actualNotes, t.normalNotes));
  const measures = Math.max(1, measureCountOf(score));
  // 박 하나가 한 칸인 판본(박 칸 패널)은 그 칸 하나의 음가만 놓는다. 더 긴 것을 놓으면 박 칸 패널이 그릴 수 없다
  const wide = cellTicks < beatTicks || tuplets.length > 0 || voices.length > 1 || measures > 1 || score.events.some((e) => e.durationTicks > beatTicks);
  const values = wide ? VALUE_ORDER.filter((v) => VALUE_TICKS[v] >= cellTicks && VALUE_TICKS[v] <= mLen) : [variant.challengeDescriptor.smallestValue];
  // 점음표는 목표에 점음표가 나오는 판본에서만 놓는다. 칸의 배수가 아니거나 마디를 넘으면 뺀다
  const dotted = score.events.some((e) => isDottedLength(e.durationTicks));
  const dottedValues = dotted ? values.filter((v) => dottedTicks(v) % cellTicks === 0 && dottedTicks(v) <= mLen) : [];
  return {
    measureTicks: mLen,
    measures,
    beatTicks,
    cellTicks,
    voices,
    values,
    dottedValues,
    tuplets,
    unitTicks: unit,
    range: variant.challengeDescriptor.range,
  };
}

/** 음역(예: 'C4-F4') 안의 제자리 음들 */
export function timelinePitches(spec: Pick<TimelineSpec, 'range'>): SpelledPitch[] {
  const [from, to] = spec.range.split('-');
  const low = parsePitch(from!);
  const high = parsePitch(to ?? from!);
  const out: SpelledPitch[] = [];
  for (let i = diatonicIndex(low); i <= diatonicIndex(high); i++) {
    const { letter, octave } = letterOctaveAt(i);
    out.push({ letter, alter: 0, octave });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 재료와 놓기

export type StoneMaterial = { kind: 'note'; pitch: SpelledPitch } | { kind: 'rest' };

export type TimelineMaterial =
  /** dotted가 참이면 점음표(길이의 1.5배). 점음표를 놓을 수 있는 판본(spec.dottedValues)에서만 놓인다 */
  | { kind: 'note'; pitch: SpelledPitch; value: NoteValue; dotted?: boolean }
  | { kind: 'rest'; value: NoteValue; dotted?: boolean }
  /** 연음 묶음(뗏목): 박 하나를 연음 돌 셋으로 채운 한 벌. 돌의 내용은 처음에 같은 재료로 채우고 돌마다 바꾼다 */
  | { kind: 'tuplet'; tuplet: TupletKind; stone: StoneMaterial };

export interface TimelineAt {
  voiceId: string;
  measureIndex: number;
  /** 마디 처음부터 센 틱 */
  tick: number;
}

export type PlacementCode = 'UNKNOWN_VOICE' | 'GRID' | 'BARLINE' | 'OVERLAP' | 'RAFT_BEAT' | 'NO_TUPLET' | 'NO_VALUE';

export type Placement =
  | { ok: true; edit: DraftEdit; announce: string; eventIds: string[] }
  | { ok: false; code: PlacementCode; text: string };

const reject = (code: PlacementCode, text: string): Placement => ({ ok: false, code, text });

export const eventEnd = (e: Pick<ScoreEvent, 'onsetTicks' | 'durationTicks'>): number => e.onsetTicks + e.durationTicks;

/** 그 성부·마디의 사건들. 시작 틱 순서 */
export function voiceEventsOf(content: DraftContent, voiceId: string, measureIndex: number): ScoreEvent[] {
  return content.events.filter((e) => e.voiceId === voiceId && e.measureIndex === measureIndex).sort((a, b) => a.onsetTicks - b.onsetTicks);
}

/** 그 틱에 울리고(또는 쉬고) 있는 사건 */
export function eventCovering(content: DraftContent, at: TimelineAt): ScoreEvent | undefined {
  return voiceEventsOf(content, at.voiceId, at.measureIndex).find((e) => e.onsetTicks <= at.tick && at.tick < eventEnd(e));
}

export function groupOfEvent(content: DraftContent, e: ScoreEvent): TupletGroup | undefined {
  return e.groupId ? content.tuplets.find((g) => g.groupId === e.groupId) : undefined;
}

/** 연음의 이름. 예: '8분 셋잇단음표' */
export function tupletKindName(kind: Pick<TupletKind, 'actualNotes' | 'writtenBaseDuration'>): string {
  const n = { 2: '둘', 3: '셋', 4: '넷', 5: '다섯', 6: '여섯' }[kind.actualNotes] ?? String(kind.actualNotes);
  return `${VALUE_NAME_KO[kind.writtenBaseDuration].replace('음표', '')} ${n}잇단음표`;
}

/** 음가 이름. 연음 돌은 '8분 셋잇단음표'처럼 부른다 */
export function valueNameOfEvent(content: DraftContent, e: ScoreEvent): string {
  const g = groupOfEvent(content, e);
  if (g) return tupletKindName(g);
  const exact = (Object.keys(VALUE_TICKS) as NoteValue[]).find((v) => VALUE_TICKS[v] === e.durationTicks);
  if (exact) return VALUE_NAME_KO[exact];
  const dotted = VALUE_ORDER.find((v) => dottedTicks(v) === e.durationTicks);
  return dotted ? dottedValueName(dotted) : describeTicks(e.durationTicks);
}

/** 사건 하나를 말로. 예: 'C4 32분음표', '쉼표 2분음표 길이' */
export function eventText(content: DraftContent, e: ScoreEvent): string {
  const value = valueNameOfEvent(content, e);
  if (isNote(e)) {
    const w = e.writtenPitch;
    const p: SpelledPitch = { letter: w.letter, alter: w.accidental === 'sharp' ? 1 : w.accidental === 'flat' ? -1 : w.accidental === 'doubleSharp' ? 2 : w.accidental === 'doubleFlat' ? -2 : 0, octave: w.octave };
    return `${pitchName(p)} ${value}`;
  }
  return `쉼표 ${value}`;
}

/** 셋잇단 뗏목 하나: 시작 틱(박이 시작하는 자리)과 돌 하나의 틱. 4분음표 셋잇단 뗏목은 두 박에 걸친다 */
export interface RaftSpan {
  start: number;
  each: number;
}

/**
 * 틱을 '2박 3번째 칸'처럼. 박 안쪽은 칸 번호로 센다.
 * 뗏목의 돌은 뗏목이 시작하는 박과 돌의 순서로 부른다('3박 셋째 돌'): 4분음표 셋잇단 뗏목의 셋째 돌은 4박에 놓이지만 3박에서 시작한 뗏목의 돌이다.
 * raft에 뗏목의 시작과 돌의 틱을 주면 그대로 쓴다. rafted만 주면 이 판본의 첫 번째 연음 종류로 계산한다(연음이 한 종류일 때만 맞다).
 */
export function tickLabel(spec: TimelineSpec, measureIndex: number, tick: number, opts: { rafted?: boolean; raft?: RaftSpan } = {}): string {
  const measure = spec.measures > 1 ? `${measureIndex + 1}마디 ` : '';
  const beatLabel = (t: number): string => `${measure}${Math.floor(t / spec.beatTicks) + 1}박`;
  const raft: RaftSpan | null = opts.raft ?? (opts.rafted ? legacyRaftOf(spec, tick) : null);
  if (raft && tick > raft.start) {
    const nth = Math.floor((tick - raft.start) / raft.each);
    return `${beatLabel(raft.start)} ${STONE_ORDER[nth] ?? `${nth + 1}번째`} 돌`;
  }
  const beat = Math.floor(tick / spec.beatTicks) + 1;
  const within = tick % spec.beatTicks;
  if (within === 0 || (raft && tick === raft.start)) return `${measure}${beat}박`;
  return `${measure}${beat}박 ${Math.round(within / spec.cellTicks) + 1}번째 칸`;
}

/** rafted만 주어졌을 때: 틱이 속한 박의 처음을 뗏목의 시작으로, 첫 번째 연음 종류의 돌 틱을 돌 하나로 본다 */
function legacyRaftOf(spec: TimelineSpec, tick: number): RaftSpan {
  const t = spec.tuplets[0];
  const each = t ? tupletNoteTicks(t.writtenBaseDuration, t.actualNotes, t.normalNotes) : spec.cellTicks;
  return { start: Math.floor(tick / spec.beatTicks) * spec.beatTicks, each };
}

/** 연음 돌이 속한 뗏목. 연음 돌이 아니면 undefined */
export function raftSpanOf(content: DraftContent, e: ScoreEvent): RaftSpan | undefined {
  const group = groupOfEvent(content, e);
  if (!group) return undefined;
  const onsets = group.eventIds.map((id) => content.events.find((x) => x.eventId === id)?.onsetTicks).filter((t): t is number => t !== undefined);
  return { start: onsets.length > 0 ? Math.min(...onsets) : e.onsetTicks, each: e.durationTicks };
}

const staffIdOf = (spec: TimelineSpec, voiceId: string): string | undefined => spec.voices.find((v) => v.voiceId === voiceId)?.staffId;

export const timelineEventId = (voiceId: string, measureIndex: number, tick: number): string => `u-${voiceId}-m${measureIndex}-${tick}`;
export const timelineGroupId = (voiceId: string, measureIndex: number, tick: number): string => `g-${voiceId}-m${measureIndex}-${tick}`;

function buildEvent(spec: TimelineSpec, at: TimelineAt, eventId: string, durationTicks: number, stone: StoneMaterial, groupId?: string): ScoreEvent {
  const base = {
    eventId,
    voiceId: at.voiceId,
    staffId: staffIdOf(spec, at.voiceId)!,
    measureIndex: at.measureIndex,
    onsetTicks: at.tick,
    durationTicks,
    ...(groupId ? { groupId } : {}),
  };
  if (stone.kind === 'rest') {
    const rest: RestEvent = { ...base, type: 'rest' };
    return rest;
  }
  const note: NoteEvent = { ...base, type: 'note', writtenPitch: writtenOf(stone.pitch) };
  return note;
}

function overlapText(spec: TimelineSpec, content: DraftContent, at: TimelineAt, others: ScoreEvent[], what: string): string {
  const other = others[0]!;
  const where = tickLabel(spec, at.measureIndex, other.onsetTicks, { raft: raftSpanOf(content, other) });
  const named = `${eventText(content, other)}${others.length > 1 ? ` 외 ${others.length - 1}개` : ''}`;
  return `${tickLabel(spec, at.measureIndex, at.tick)}에 ${eulReul(what)} 놓으면 ${where}의 ${waGwa(named)} 겹쳐요. 겹친 것을 먼저 비워 주세요.`;
}

/**
 * 재료를 놓는 편집을 만든다. 놓을 수 없으면 이유를 사실 문장으로 돌려준다(다른 것과 겹치면 놓이지 않는다, 4.4).
 * - 같은 시작 틱에 이미 사건이 있으면 바꾼다. 새 사건이 다른 사건과 겹치면 바꾸지 않는다.
 * - 연음 돌 위에 음이나 쉼을 놓으면 그 돌의 내용만 바뀐다(돌의 길이와 묶음은 그대로).
 * - 묶음(tuplet)은 박이 시작하는 자리에만 놓이고, 같은 자리의 묶음은 통째로 바뀐다.
 */
export function placeOnTimeline(spec: TimelineSpec, content: DraftContent, at: TimelineAt, material: TimelineMaterial): Placement {
  if (!staffIdOf(spec, at.voiceId)) return reject('UNKNOWN_VOICE', `성부 ${at.voiceId}를 찾지 못했어요.`);
  if (at.measureIndex < 0 || at.measureIndex >= spec.measures) return reject('BARLINE', `${at.measureIndex + 1}번째 마디는 이 곡에 없어요.`);
  const events = voiceEventsOf(content, at.voiceId, at.measureIndex);

  if (material.kind === 'tuplet') return placeRaft(spec, content, at, material, events);

  const existing = events.find((e) => e.onsetTicks === at.tick);
  // 연음 돌: 길이와 묶음은 그대로 두고 내용만 바꾼다
  const covering = events.find((e) => e.onsetTicks <= at.tick && at.tick < eventEnd(e));
  if (covering?.groupId) {
    if (covering.onsetTicks !== at.tick) return reject('GRID', `${eunNeun(tickLabel(spec, at.measureIndex, at.tick))} 셋잇단 묶음 안이라 돌의 자리에만 놓을 수 있어요.`);
    const stone: StoneMaterial = material.kind === 'rest' ? { kind: 'rest' } : { kind: 'note', pitch: material.pitch };
    const next = buildEvent(spec, at, covering.eventId, covering.durationTicks, stone, covering.groupId);
    const where = tickLabel(spec, at.measureIndex, at.tick, { raft: raftSpanOf(content, covering) });
    return { ok: true, edit: { type: 'replaceEvent', eventId: covering.eventId, event: next }, announce: `${where}의 돌을 ${euroRo(stone.kind === 'rest' ? '쉼표' : pitchName(stone.pitch))} 바꿨어요.`, eventIds: [covering.eventId] };
  }

  const dotted = material.dotted === true;
  if (!spec.values.includes(material.value)) return reject('NO_VALUE', `${eunNeun(VALUE_NAME_KO[material.value])} 이 과제에서 놓을 수 없어요.`);
  if (dotted && !spec.dottedValues.includes(material.value)) return reject('NO_VALUE', `${eunNeun(dottedValueName(material.value))} 이 과제에서 놓을 수 없어요.`);
  if (at.tick % spec.cellTicks !== 0) return reject('GRID', `${tickLabel(spec, at.measureIndex, at.tick)}에는 놓을 수 없어요. ${describeTicks(spec.cellTicks)} 칸에만 놓여요.`);
  const name = materialValueName(material.value, dotted);
  const duration = materialValueTicks(material.value, dotted);
  const end = at.tick + duration;
  const what = material.kind === 'rest' ? `${name} 길이의 쉼표` : `${pitchName(material.pitch)} ${name}`;
  if (end > spec.measureTicks) {
    return reject('BARLINE', `${tickLabel(spec, at.measureIndex, at.tick)}에 ${eulReul(what)} 놓으면 마디 선을 ${end - spec.measureTicks}틱 넘어요. 마디는 ${spec.measureTicks}틱이에요.`);
  }
  const overlaps = events.filter((e) => e.onsetTicks < end && eventEnd(e) > at.tick && e !== existing);
  if (overlaps.length > 0) return reject('OVERLAP', overlapText(spec, content, at, overlaps, what));

  const stone: StoneMaterial = material.kind === 'rest' ? { kind: 'rest' } : { kind: 'note', pitch: material.pitch };
  const id = existing?.eventId ?? timelineEventId(at.voiceId, at.measureIndex, at.tick);
  const event = buildEvent(spec, at, id, duration, stone);
  const where = tickLabel(spec, at.measureIndex, at.tick);
  const announce = `${where}에 ${eulReul(what)} 놓았어요.`;
  return existing
    ? { ok: true, edit: { type: 'replaceEvent', eventId: existing.eventId, event }, announce, eventIds: [id] }
    : { ok: true, edit: { type: 'addEvent', event }, announce, eventIds: [id] };
}

function placeRaft(spec: TimelineSpec, content: DraftContent, at: TimelineAt, material: Extract<TimelineMaterial, { kind: 'tuplet' }>, events: ScoreEvent[]): Placement {
  const kind = material.tuplet;
  const known = spec.tuplets.some((t) => t.actualNotes === kind.actualNotes && t.normalNotes === kind.normalNotes && t.writtenBaseDuration === kind.writtenBaseDuration);
  if (!known) return reject('NO_TUPLET', '이 과제에서는 이 연음 묶음을 놓을 수 없어요.');
  const each = tupletNoteTicks(kind.writtenBaseDuration, kind.actualNotes, kind.normalNotes);
  const total = each * kind.actualNotes;
  const name = `${tupletKindName(kind)} 묶음`;
  if (at.tick % spec.beatTicks !== 0) return reject('RAFT_BEAT', `${eunNeun(name)} 박이 시작하는 자리에만 놓을 수 있어요.`);
  const end = at.tick + total;
  if (end > spec.measureTicks) return reject('BARLINE', `${tickLabel(spec, at.measureIndex, at.tick)}에 ${eulReul(name)} 놓으면 마디 선을 넘어요.`);

  const inside = events.filter((e) => e.onsetTicks < end && eventEnd(e) > at.tick);
  // 같은 자리의 묶음이면 통째로 바꾼다
  const groupId = timelineGroupId(at.voiceId, at.measureIndex, at.tick);
  const oldGroup = content.tuplets.find((g) => g.groupId === groupId);
  const oldIds = new Set(oldGroup?.eventIds ?? []);
  const blockers = inside.filter((e) => !oldIds.has(e.eventId));
  if (blockers.length > 0) return reject('OVERLAP', overlapText(spec, content, at, blockers, name));

  const ids = Array.from({ length: kind.actualNotes }, (_, i) => timelineEventId(at.voiceId, at.measureIndex, at.tick + i * each));
  const added = ids.map((id, i) => buildEvent(spec, { ...at, tick: at.tick + i * each }, id, each, material.stone, groupId));
  const group: TupletGroup = { groupId, actualNotes: kind.actualNotes, normalNotes: kind.normalNotes, writtenBaseDuration: kind.writtenBaseDuration, eventIds: ids };
  const edits: DraftEdit[] = [
    ...[...oldIds].map((eventId): DraftEdit => ({ type: 'removeEvent', eventId })),
    ...added.map((event): DraftEdit => ({ type: 'addEvent', event })),
    { type: 'setTuplets', tuplets: [...content.tuplets.filter((g) => g.groupId !== groupId), group] },
  ];
  const stoneText = material.stone.kind === 'rest' ? '쉼표' : pitchName(material.stone.pitch);
  return { ok: true, edit: { type: 'batch', edits }, announce: `${tickLabel(spec, at.measureIndex, at.tick)}에 ${eulReul(name)} 놓았어요. 돌 ${kind.actualNotes}개는 지금 모두 ${josa(stoneText, ['이에요', '예요'])}. 돌을 하나씩 눌러 바꿀 수 있어요.`, eventIds: ids };
}

/** 비울 것이 없는 자리를 비우려 할 때의 말 */
export const alreadyEmptyText = (spec: TimelineSpec, measureIndex: number, tick: number): string => `${eunNeun(tickLabel(spec, measureIndex, tick))} 이미 비어 있어요.`;

/** 그 자리를 비우는 편집. 비울 것이 없으면 null. 연음 돌을 비우면 묶음 전체가 지워진다 */
export function clearOnTimeline(spec: TimelineSpec, content: DraftContent, at: TimelineAt): { edit: DraftEdit; announce: string } | null {
  const covering = eventCovering(content, at);
  if (!covering) return null;
  const where = tickLabel(spec, at.measureIndex, covering.onsetTicks, { raft: raftSpanOf(content, covering) });
  if (covering.groupId) {
    const group = groupOfEvent(content, covering);
    const ids = group ? group.eventIds : [covering.eventId];
    return { edit: { type: 'batch', edits: ids.map((eventId): DraftEdit => ({ type: 'removeEvent', eventId })) }, announce: `${where}의 셋잇단 묶음을 통째로 지웠어요.` };
  }
  return { edit: { type: 'removeEvent', eventId: covering.eventId }, announce: `${where}의 ${eulReul(eventText(content, covering))} 지웠어요.` };
}

// ---------------------------------------------------------------------------
// 화면에 그리는 조각

export interface TimelineBlock {
  key: string;
  kind: 'note' | 'rest' | 'empty';
  /** 창 안으로 자른 시작과 끝(마디 처음부터 센 틱) */
  startTick: number;
  endTick: number;
  /** 사건 전체의 시작과 끝. 자르지 않은 값 */
  fullStart: number;
  fullEnd: number;
  /** 창 앞이나 뒤로 이어지는가 */
  continues: { before: boolean; after: boolean };
  eventId?: string;
  groupId?: string;
  /** 연음 묶음의 돌 수(묶음에 속한 조각만). 예: 셋잇단이면 3 */
  groupSize?: number;
  /** 눈으로 보는 짧은 이름. 예: 'C4', '쉼', '' */
  label: string;
  /** 낭독기와 단추 이름에 쓰는 말. 예: '2박 셋째 돌, E4 8분 셋잇단음표' */
  description: string;
}

/** 한 성부의 한 창(예: 박 하나, 마디 하나)을 조각으로 나눈다. 비어 있는 곳은 칸 하나씩 'empty' 조각이다 */
export function blocksOf(spec: TimelineSpec, content: DraftContent, voiceId: string, measureIndex: number, from: number, to: number): TimelineBlock[] {
  const events = voiceEventsOf(content, voiceId, measureIndex).filter((e) => e.onsetTicks < to && eventEnd(e) > from);
  const blocks: TimelineBlock[] = [];
  for (const e of events) {
    const raft = raftSpanOf(content, e);
    const label = isNote(e) ? pitchName(spelled(e), true) : '쉼';
    blocks.push({
      key: e.eventId,
      kind: isNote(e) ? 'note' : 'rest',
      startTick: Math.max(e.onsetTicks, from),
      endTick: Math.min(eventEnd(e), to),
      fullStart: e.onsetTicks,
      fullEnd: eventEnd(e),
      continues: { before: e.onsetTicks < from, after: eventEnd(e) > to },
      eventId: e.eventId,
      ...(e.groupId ? { groupId: e.groupId } : {}),
      ...(e.groupId && groupOfEvent(content, e) ? { groupSize: groupOfEvent(content, e)!.actualNotes } : {}),
      label,
      description: `${tickLabel(spec, measureIndex, e.onsetTicks, { raft })}, ${eventText(content, e)}`,
    });
  }
  // 빈 칸: 창 안에서 칸 단위로 훑으며 사건이 덮지 않은 칸을 채운다
  const covered = (t: number): boolean => events.some((e) => e.onsetTicks <= t && t < eventEnd(e));
  for (let t = from; t < to; t += spec.cellTicks) {
    if (covered(t)) continue;
    blocks.push({
      key: `empty-${voiceId}-${measureIndex}-${t}`,
      kind: 'empty',
      startTick: t,
      endTick: Math.min(t + spec.cellTicks, to),
      fullStart: t,
      fullEnd: t + spec.cellTicks,
      continues: { before: false, after: false },
      label: '',
      description: `${tickLabel(spec, measureIndex, t)}, 비어 있음`,
    });
  }
  return blocks.sort((a, b) => a.startTick - b.startTick);
}

/** 음표 사건이 적힌 음(조표를 적용하지 않은 기보 그대로) */
export function spelled(e: NoteEvent): SpelledPitch {
  const w = e.writtenPitch;
  const alter = w.accidental === 'sharp' ? 1 : w.accidental === 'flat' ? -1 : w.accidental === 'doubleSharp' ? 2 : w.accidental === 'doubleFlat' ? -2 : 0;
  return { letter: w.letter, alter, octave: w.octave };
}

/** 창들: 박마다 하나(박 확대). 마디 하나를 통째로 한 창으로 보려면 [0, measureTicks)를 쓴다 */
export function beatWindows(spec: TimelineSpec): Array<{ beat: number; from: number; to: number; label: string }> {
  const beats = Math.round(spec.measureTicks / spec.beatTicks);
  return Array.from({ length: beats }, (_, b) => ({ beat: b, from: b * spec.beatTicks, to: (b + 1) * spec.beatTicks, label: `${b + 1}박` }));
}

/**
 * 시간선 과제에서 '고르는 자리'는 박 하나의 확대 창이다(마디마다 박마다 하나).
 * 고른 박 반복과 재생 위치 표시가 이 창을 쓴다. 박 하나가 한 칸인 Q02의 박 칸과 같은 모양(GridCell)이다.
 */
export function beatCellsOf(variant: QuestVariant): GridCell[] {
  const spec = timelineOf(variant);
  const cells: GridCell[] = [];
  for (let m = 0; m < spec.measures; m++) {
    for (const w of beatWindows(spec)) {
      cells.push({
        cellId: `m${m}c${w.beat}`,
        measureIndex: m,
        cellIndex: w.beat,
        onsetTicks: w.from,
        durationTicks: w.to - w.from,
        label: spec.measures > 1 ? `${m + 1}마디 ${w.label}` : w.label,
      });
    }
  }
  return cells;
}

/** 합주 과제(scoreArrangement, Q08)인가. 마디 하나가 한 창이고, 고르는 자리도 마디 하나다 */
export const isArrangementVariant = (variant: QuestVariant): boolean => variant.evaluatorSpec.type === 'scoreArrangement';

/**
 * 합주 과제에서 '고르는 자리'는 마디 하나다(바닥 칸을 고르면 그 마디가 패널에서 열린다, 4.9).
 * 고른 마디 반복과 재생 위치 표시가 이 칸을 쓴다. 박 하나가 한 칸인 Q02의 박 칸과 같은 모양(GridCell)이다.
 */
export function measureCellsOf(variant: QuestVariant): GridCell[] {
  const spec = timelineOf(variant);
  return Array.from({ length: spec.measures }, (_, m): GridCell => ({ cellId: `m${m}`, measureIndex: m, cellIndex: 0, onsetTicks: 0, durationTicks: spec.measureTicks, label: `${m + 1}마디` }));
}

/** 한 성부의 한 마디가 얼마나 채워졌는가(틱). 연음 돌과 쉼표를 모두 센다 */
export function filledTicks(content: DraftContent, voiceId: string, measureIndex: number): number {
  return voiceEventsOf(content, voiceId, measureIndex).reduce((s, e) => s + e.durationTicks, 0);
}
