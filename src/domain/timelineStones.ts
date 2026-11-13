// 6-4 징검다리(T2, 설계서 4.4)의 순수 계산: 시간(틱)과 월드 위치(px)를 오가고, 아직 물로 남은 구간을 센다.
// 화면은 이 계산의 결과를 그리기만 한다. 걸은 시간이나 캐릭터 위치는 여기로 들어오지 않는다(W-3).
import type { QuestVariant } from './content';
import { STONES_LABEL_TOP, STONES_RAFT_BAND } from './installation';
import type { InstallationDef, SlotMapDef, WorldRect } from './installation';
import { diatonicIndex, letterOctaveAt, midiOf, parsePitch, pitchName } from './pitch';
import { isNote } from './score';
import type { DraftContent } from './session';
import { VALUE_TICKS, describeTicks, dottedTicks, measureTicks } from './time';
import type { NoteValue } from './time';
import { eventEnd, isDottedLength, materialValueName, spelled, tickLabel, voiceEventsOf } from './timeline';
import type { TimelineSpec } from './timeline';

type StoneMap = Extract<SlotMapDef, { kind: 'timelineStones' }>;

/** 징검다리 한 줄: 시간이 흐르는 방향과 월드 위치 */
export interface StoneLane {
  axis: 'x' | 'y';
  ticksPerPx: number;
  /** 첫 칸이 시작하는 월드 좌표(시간 방향) */
  start: number;
  /** 시간 방향과 직각인 쪽의 시작과 두께 */
  cross: number;
  crossSize: number;
  /** 가장 잘게 나눈 칸의 틱 */
  cellTicks: number;
  /** 줄 전체의 틱(칸 수 × 칸). 판본의 한 마디가 이보다 짧으면 나머지는 물가 바위로 가린다 */
  laneTicks: number;
  voiceId: string;
  /** 돌 하나가 덮을 수 있는 가장 긴 틱(물레방아의 못은 세 칸까지, 4.5). 없으면 마디 길이까지 */
  maxStoneTicks?: number;
}

export function isTimelineStones(inst: { slotMap?: SlotMapDef }): inst is { slotMap: StoneMap } {
  return inst.slotMap?.kind === 'timelineStones';
}

/** 설치물의 징검다리 줄. 징검다리 설치물이 아니거나 자리가 없으면 null */
export function laneOf(inst: Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef }): StoneLane | null {
  if (!isTimelineStones(inst)) return null;
  const first = inst.slots[0];
  if (!first) return null;
  const map = inst.slotMap;
  return {
    axis: map.axis,
    ticksPerPx: map.ticksPerPx,
    start: map.axis === 'x' ? first.x : first.y,
    cross: map.axis === 'x' ? first.y : first.x,
    crossSize: map.axis === 'x' ? first.h : first.w,
    cellTicks: map.cellTicks,
    laneTicks: inst.slots.length * map.cellTicks,
    voiceId: map.voiceId,
    ...(map.maxStoneCells !== undefined ? { maxStoneTicks: map.maxStoneCells * map.cellTicks } : {}),
  };
}

/** 편집 중 카메라가 줄 전체를 담지 않고 박 하나를 따라가는 설치물인가(확대형, 4.4) */
export function followsBeat(inst: { slotMap?: SlotMapDef }): boolean {
  return isTimelineStones(inst) && inst.slotMap.follow === 'beat';
}

/** 마디 안의 틱 구간을 월드 사각형으로. inset은 시간 방향 양끝을 안쪽으로 줄이는 px(이웃한 돌 사이를 띄운다) */
export function laneRect(lane: StoneLane, fromTick: number, toTick: number, inset = 0): WorldRect {
  const a = lane.start + fromTick / lane.ticksPerPx + inset;
  const len = Math.max(0, (toTick - fromTick) / lane.ticksPerPx - inset * 2);
  return lane.axis === 'x' ? { x: a, y: lane.cross, w: len, h: lane.crossSize } : { x: lane.cross, y: a, w: lane.crossSize, h: len };
}

/**
 * 눌린 점(월드 px)이 놓인 틱(마디 처음부터). 누른 자리(slot)의 틱 구간 안으로 가둔다: 손가락이 칸 사이의 틈이나 가장자리를 눌러도 그 칸 안의 틱이다.
 * 칸(가장 잘게 나눈 시간 단위)보다 돌이 더 세밀할 수 있다: 셋잇단 돌의 시작(320틱)은 120틱 칸의 경계에 맞지 않아서,
 * 칸 번호만으로는 눌린 곳이 어느 돌인지 알 수 없다. 눌린 틱은 그 구분에 쓴다.
 */
export function tickAtSlotPoint(lane: StoneLane, slot: number, x: number, y: number): number {
  const from = slotStartTick(lane, slot);
  const along = lane.axis === 'x' ? x : y;
  return Math.min(from + lane.cellTicks - 1, Math.max(from, Math.floor((along - lane.start) * lane.ticksPerPx)));
}

/** 월드의 한 점이 줄에서 몇 틱 자리인가(마디 처음부터). 줄 밖이면 null */
export function tickAtPoint(lane: StoneLane, x: number, y: number): number | null {
  const along = lane.axis === 'x' ? x : y;
  const across = lane.axis === 'x' ? y : x;
  if (across < lane.cross || across > lane.cross + lane.crossSize) return null;
  const tick = (along - lane.start) * lane.ticksPerPx;
  return tick < 0 || tick >= lane.laneTicks ? null : Math.floor(tick);
}

/** 자리 번호(1부터)가 시작하는 틱 */
export const slotStartTick = (lane: StoneLane, slot: number): number => (slot - 1) * lane.cellTicks;

/** 틱이 놓인 자리 번호(1부터) */
export const slotOfTick = (lane: StoneLane, tick: number): number => Math.floor(tick / lane.cellTicks) + 1;

/** 편집 중 카메라가 따라가는 박 하나(확대형, 4.4) */
export interface BeatFollow {
  /** 따라가는 박(0부터) */
  beat: number;
  /** 그 박을 담는 사각형(월드 px): 시간 방향은 박 하나의 길이, 직각 방향은 줄의 두께에 박 번호 띠와 뗏목 표시 띠를 더한 것 */
  rect: WorldRect;
  /** 박이 화면보다 길 때 카메라가 가운데에 두려는 점: 고른 칸(듣는 중이면 물결 선)의 자리 */
  focus: { x: number; y: number };
}

/** 월드가 아직 모습을 받지 못했을 때(설치물 모드에 막 들어온 첫 프레임) 한 박의 길이. 4분음표다 */
const FALLBACK_BEAT_TICKS = 960;

/**
 * 카메라가 따라갈 박. 듣는 중이면 물결 선이 있는 박, 아니면 고른 칸이 있는 박, 아무것도 없으면 첫 박이다.
 * 줄은 한 마디 전체(32칸, 1920 px)가 화면보다 길어서 카메라는 박 하나만 담는다. 박이 바뀌면 카메라가 그 박으로 따라간다.
 * 모습(tl)은 화면이 정해 다리에 올린 것이고, 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3).
 */
export function beatFollowOf(lane: StoneLane, tl?: Pick<TimelineView, 'beatTicks' | 'measureTicks' | 'cursor' | 'playTick'>): BeatFollow {
  const beatTicks = Math.max(1, tl?.beatTicks ?? FALLBACK_BEAT_TICKS);
  const used = Math.max(1, Math.min(tl?.measureTicks ?? lane.laneTicks, lane.laneTicks));
  const at = Math.min(Math.max(0, tl?.playTick ?? tl?.cursor?.at ?? tl?.cursor?.startTick ?? 0), used - 1);
  const beat = Math.floor(at / beatTicks);
  const from = beat * beatTicks;
  const to = Math.min(from + beatTicks, used);
  const a0 = lane.start + from / lane.ticksPerPx;
  const a1 = lane.start + to / lane.ticksPerPx;
  const c0 = lane.cross - STONES_LABEL_TOP;
  const c1 = lane.cross + lane.crossSize + STONES_RAFT_BAND;
  const along = lane.start + (at + lane.cellTicks / 2) / lane.ticksPerPx;
  const across = lane.cross + lane.crossSize / 2;
  return lane.axis === 'x'
    ? { beat, rect: { x: a0, y: c0, w: a1 - a0, h: c1 - c0 }, focus: { x: along, y: across } }
    : { beat, rect: { x: c0, y: a0, w: c1 - c0, h: a1 - a0 }, focus: { x: across, y: along } };
}

/** 아직 돌이 놓이지 않은 물의 한 구간(마디 처음부터 센 틱, 앞은 포함 뒤는 제외) */
export interface WaterSegment {
  from: number;
  to: number;
}

/** 한 성부의 한 마디에서 돌이 덮지 않은 구간들. 시간 순서이고 맞닿은 구간은 하나로 합친다 */
export function waterSegments(spec: Pick<TimelineSpec, 'measureTicks'>, content: DraftContent, voiceId: string, measureIndex = 0): WaterSegment[] {
  const out: WaterSegment[] = [];
  let cursor = 0;
  for (const e of voiceEventsOf(content, voiceId, measureIndex)) {
    if (e.onsetTicks > cursor) out.push({ from: cursor, to: Math.min(e.onsetTicks, spec.measureTicks) });
    cursor = Math.max(cursor, eventEnd(e));
  }
  if (cursor < spec.measureTicks) out.push({ from: cursor, to: spec.measureTicks });
  return out;
}

/** 남은 물 구간 하나를 말로. 예: '3박부터 마디 끝까지 1920틱(2분음표 하나 길이)' */
export function waterSegmentText(spec: TimelineSpec, seg: WaterSegment, measureIndex = 0): string {
  const ticks = seg.to - seg.from;
  const end = seg.to >= spec.measureTicks ? '마디 끝' : tickLabel(spec, measureIndex, seg.to);
  return `${tickLabel(spec, measureIndex, seg.from)}부터 ${end}까지 ${ticks}틱(${describeTicks(ticks)})`;
}

/**
 * 남은 곳을 부르는 말. 징검다리는 '남은 물'과 '돌', 물레방아는 '빈 구멍'과 '못'이다(4.5).
 * 둘 다 받침으로 끝나서 '은', '이'가 그대로 붙는다.
 */
export interface WaterWords {
  /** 돌이 덮지 않은 곳 */
  empty: string;
  /** 놓는 한 조각 */
  piece: string;
}
export const STONE_WATER_WORDS: WaterWords = { empty: '남은 물', piece: '돌' };
export const WHEEL_WATER_WORDS: WaterWords = { empty: '빈 구멍', piece: '못' };

/** 남은 물을 알리는 문장. 판정이 아니라 지금 초안의 사실이다(맞고 틀림은 확인할 때만 알린다) */
export function waterSentence(spec: TimelineSpec, segments: readonly WaterSegment[], measureIndex = 0, words: WaterWords = STONE_WATER_WORDS): string {
  if (segments.length === 0) return `${words.empty}이 없어요. ${words.piece}이 한 마디를 빈틈없이 채웠어요.`;
  const total = segments.reduce((s, g) => s + (g.to - g.from), 0);
  const parts = segments.map((g) => waterSegmentText(spec, g, measureIndex));
  return segments.length === 1 ? `${words.empty}은 ${parts[0]}이에요.` : `${words.empty}은 ${segments.length}곳, 모두 ${total}틱이에요. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// 월드가 그리는 모습(설치물 모드와 지나가기 모두). 화면이 정해서 다리(WorldBridge)에 올리고, 월드는 옮겨 그리기만 한다.

/** 놓인 돌 하나. 울림돌(음이 있는 돌)과 이끼돌(쉼표) */
export interface StoneMark {
  /** 마디 처음부터 센 틱, 앞은 포함 뒤는 제외 */
  startTick: number;
  endTick: number;
  kind: 'note' | 'rest';
  /** 울림돌의 음 이름(예: 'C4'). 이끼돌이면 null */
  name: string | null;
  /** 울림돌의 음 높이(MIDI). 이끼돌이면 null */
  midi: number | null;
  /** 점이 붙은 돌인가(길이가 점음표). 묶음(뗏목)의 돌은 아니다 */
  dotted: boolean;
  /** 셋잇단 뗏목에 속한 돌이면 묶음 id, 돌 수는 groupSize */
  groupId?: string;
  groupSize?: number;
  /** 판정이 가리킨 돌(느낌표 표식). 놓은 것이 바뀌면 사라진다 */
  flagged: boolean;
  /** 듣는 중 물결 선이 지금 이 돌 위에 있다 */
  playing: boolean;
}

/** 돌이 덮지 않은 물 한 구간 */
export interface WaterMark extends WaterSegment {
  /** 판정이 가리킨 구간(느낌표 표식) */
  flagged: boolean;
}

/** 놓으려는 자리의 미리보기: 손에 든 돌을 고른 칸에 놓았을 때 차지하는 구간 */
export interface CursorMark {
  startTick: number;
  endTick: number;
  /**
   * 고른 칸의 틱. 윤곽의 처음(startTick)과 다를 때만 담는다: 뗏목을 손에 든 채 뗏목의 셋째 돌을 골랐거나
   * 긴 돌의 가운데 칸을 골라 비울 때, 윤곽은 뗏목이나 돌의 처음부터 시작하지만 카메라는 고른 칸이 있는 박을 따라간다
   */
  at?: number;
  /** 손에 든 것. erase는 비우기(고른 칸의 돌을 가리킨다) */
  kind: 'note' | 'rest' | 'raft' | 'erase';
  /** 지금 누르면 놓이는가(겹치거나 마디 선을 넘으면 false, 비우기는 비울 돌이 있을 때 true) */
  ok: boolean;
}

export interface TimelineView {
  /** 이 판본이 쓰는 마디의 틱. 줄이 이보다 길면 나머지는 물가 바위가 덮는다 */
  measureTicks: number;
  /** 돌이 놓이는 격자 한 칸의 틱(판본의 가장 짧은 음가) */
  gridTicks: number;
  /** 한 박의 틱: 월드가 박 번호(1, 2, 3…)를 달고 박 선을 굵게 긋는 데 쓴다 */
  beatTicks: number;
  stones: readonly StoneMark[];
  water: readonly WaterMark[];
  /** 마디가 덜 채워졌다고 판정이 알렸다: 남은 물 구간을 강조한다 */
  waterEmphasis: boolean;
  cursor: CursorMark | null;
  /** 듣는 중 물결 선의 자리(마디 처음부터 센 틱). 듣지 않으면 null */
  playTick: number | null;
}

export interface TimelineViewInput {
  spec: Pick<TimelineSpec, 'measureTicks' | 'cellTicks' | 'beatTicks'>;
  lane: Pick<StoneLane, 'voiceId' | 'cellTicks'>;
  content: DraftContent;
  /** 판정이 가리킨 구간들(마디 처음부터 센 틱) */
  flagged?: readonly WaterSegment[];
  /** 마디가 덜 채워졌다는 판정이 있었는가 */
  remain?: boolean;
  cursor?: CursorMark | null;
  playTick?: number | null;
}

const overlaps = (a: WaterSegment, from: number, to: number): boolean => a.from < to && a.to > from;

/** 초안과 화면 상태에서 월드가 그릴 모습을 만든다. 마디 하나, 성부 하나(징검다리 한 줄)를 본다 */
export function timelineViewOf(i: TimelineViewInput): TimelineView {
  const flagged = i.flagged ?? [];
  const playTick = i.playTick ?? null;
  const events = voiceEventsOf(i.content, i.lane.voiceId, 0);
  const stones: StoneMark[] = events.map((e) => {
    const end = eventEnd(e);
    const note = isNote(e);
    const p = note ? spelled(e) : null;
    const group = e.groupId ? i.content.tuplets.find((g) => g.groupId === e.groupId) : undefined;
    return {
      startTick: e.onsetTicks,
      endTick: end,
      kind: note ? 'note' : 'rest',
      name: p ? pitchName(p) : null,
      midi: p ? midiOf(p) : null,
      dotted: !e.groupId && isDottedLength(e.durationTicks),
      ...(e.groupId ? { groupId: e.groupId } : {}),
      ...(group ? { groupSize: group.actualNotes } : {}),
      flagged: flagged.some((f) => overlaps(f, e.onsetTicks, end)),
      playing: playTick !== null && e.onsetTicks <= playTick && playTick < end,
    };
  });
  const water: WaterMark[] = waterSegments(i.spec, i.content, i.lane.voiceId, 0).map((g) => ({ ...g, flagged: flagged.some((f) => overlaps(f, g.from, g.to)) }));
  return {
    measureTicks: i.spec.measureTicks,
    gridTicks: Math.max(i.spec.cellTicks, i.lane.cellTicks),
    beatTicks: i.spec.beatTicks,
    stones,
    water,
    waterEmphasis: i.remain === true,
    cursor: i.cursor ?? null,
    playTick: playTick !== null && playTick >= 0 && playTick < i.spec.measureTicks ? playTick : null,
  };
}

// ---------------------------------------------------------------------------
// 손에 드는 돌의 길이

export interface StoneLength {
  value: NoteValue;
  dotted: boolean;
  ticks: number;
  /** 예: '4분음표', '점2분음표' */
  name: string;
}

/**
 * 놓을 수 있는 돌의 길이들. 짧은 것부터, 같은 음가에서는 점이 붙은 것이 바로 뒤에 온다.
 * maxTicks가 있으면 그보다 긴 것은 뺀다(물레방아의 못은 세 칸, 점4분음표까지다).
 */
export function stoneLengthsOf(spec: Pick<TimelineSpec, 'values' | 'dottedValues'>, maxTicks?: number): StoneLength[] {
  const out: StoneLength[] = [];
  for (const value of spec.values) {
    out.push({ value, dotted: false, ticks: VALUE_TICKS[value], name: materialValueName(value, false) });
    if (spec.dottedValues.includes(value)) out.push({ value, dotted: true, ticks: dottedTicks(value), name: materialValueName(value, true) });
  }
  return out.filter((l) => maxTicks === undefined || l.ticks <= maxTicks).sort((a, b) => a.ticks - b.ticks);
}

/** 자유로 놀기에서는 목표가 없으니 칸과 마디 안에 드는 점음표를 모두 놓을 수 있다 */
export function freeSpecOf<T extends Pick<TimelineSpec, 'values' | 'dottedValues' | 'cellTicks' | 'measureTicks'>>(spec: T): T {
  const dottedValues = spec.values.filter((v) => dottedTicks(v) % spec.cellTicks === 0 && dottedTicks(v) <= spec.measureTicks);
  return { ...spec, dottedValues };
}

// ---------------------------------------------------------------------------
// 자유로 놀기의 틀

const FREE_METERS = ['4/4', '3/4', '2/4', '6/8'] as const;

const freeFrames = new WeakMap<QuestVariant, Map<string, QuestVariant>>();

/**
 * 징검다리 설치물의 '자유로 놀기' 틀(4.2). 설치물이 다루는 판본 가운데 가장 잘게 나눈 것을 바탕으로,
 * 목표 악보를 비우고 줄 전체가 한 마디가 되는 박자로 맞춘다. 음역은 설치물의 판본들을 모두 아우른다.
 * 목표는 비어 있어서 들을 것도 판정할 것도 없다. 같은 입력에는 같은 틀을 돌려준다(화면이 틀이 바뀐 줄 알고 다시 그리지 않게).
 */
export function freeStonesVariant(bases: readonly QuestVariant[], lane: Pick<StoneLane, 'cellTicks' | 'laneTicks'>): QuestVariant | null {
  const sorted = [...bases].sort((a, b) => VALUE_TICKS[a.challengeDescriptor.smallestValue] - VALUE_TICKS[b.challengeDescriptor.smallestValue]);
  const first = sorted[0];
  if (!first) return null;
  const key = `${lane.cellTicks}/${lane.laneTicks}/${bases.length}`;
  let byKey = freeFrames.get(first);
  if (!byKey) {
    byKey = new Map();
    freeFrames.set(first, byKey);
  }
  const found = byKey.get(key);
  if (found) return found;

  let low = Infinity;
  let high = -Infinity;
  for (const b of bases) {
    const [from, to] = b.challengeDescriptor.range.split('-');
    low = Math.min(low, diatonicIndex(parsePitch(from!)));
    high = Math.max(high, diatonicIndex(parsePitch(to ?? from!)));
  }
  const at = (index: number): string => {
    const { letter, octave } = letterOctaveAt(index);
    return `${letter}${octave}`;
  };
  // 판본의 박자표가 줄과 맞으면 그 박자표를 쓴다(같은 2880틱이어도 6/8과 3/4는 박의 세는 법이 다르다)
  const own = measureTicks(first.score.meter) === lane.laneTicks ? first.score.meter : undefined;
  const meter = own ?? FREE_METERS.find((m) => measureTicks(m) === lane.laneTicks) ?? first.score.meter;
  const cell = (Object.keys(VALUE_TICKS) as NoteValue[]).find((v) => VALUE_TICKS[v] === lane.cellTicks) ?? first.challengeDescriptor.smallestValue;
  const { tuplets: _tuplets, chords: _chords, ...score } = first.score;
  const made: QuestVariant = {
    ...first,
    score: { ...score, meter, measureCount: 1, events: [] },
    challengeDescriptor: { ...first.challengeDescriptor, smallestValue: cell, range: `${at(low)}-${at(high)}` },
  };
  byKey.set(key, made);
  return made;
}

/** 설치물이 다루는 판본들로 자유로 놀기의 틀을 만든다. 징검다리 설치물이 아니거나 판본이 하나도 없으면 null */
export function freeStonesFrameOf(inst: Pick<InstallationDef, 'slots' | 'quests'> & { slotMap?: SlotMapDef }, variantOf: (questId: string, variantId: string) => QuestVariant | undefined): QuestVariant | null {
  const lane = laneOf(inst);
  if (!lane) return null;
  const bases: QuestVariant[] = [];
  for (const ref of inst.quests) {
    for (const variantId of ref.variantIds) {
      const v = variantOf(ref.questId, variantId);
      if (v) bases.push(v);
    }
  }
  return freeStonesVariant(bases, lane);
}
