// 악보를 재생할 음 목록으로 바꾼다. 소리가 악보와 판정에 쓰인 것과 같은 해석(ScoreResolver)을 쓰게 하려는 것이다.
// "악보, 재생음, 판정 결과가 서로 일치한다"(13.3 G2-3)를 한 곳에서 보장한다.
import { resolveScore, measureCountOf, isNote } from './score';
import type { Score } from './score';
import { countUnitTicks, measureTicks } from './time';
import type { TempoReference } from './time';

/** 재생할 한 음. 틱은 4분음표 960 기준이고 재생 시작부터 센다. */
export interface PlayNote {
  id: string;
  midi: number;
  onsetTick: number;
  durationTick: number;
  velocity?: number;
}

export interface Playback {
  notes: PlayNote[];
  lengthTicks: number;
  tempoBpm: number;
  tempoReference: TempoReference;
}

export interface PlaybackOptions {
  /** 이 성부만 재생한다. 비우면 모두 */
  voiceIds?: readonly string[];
  /** 템포를 덮어쓴다(느리게 듣기 등) */
  tempoBpm?: number;
}

/**
 * 악보를 재생 내용으로 바꾼다. 조표와 임시표는 ScoreResolver가 적용한 해석 음의 MIDI를 쓴다.
 * 쉼표는 음 목록에 넣지 않는다. 쉼표의 길이는 다음 음의 시작 틱과 전체 길이에 들어 있다.
 */
export function scoreToPlayback(score: Score, options: PlaybackOptions = {}): Playback {
  const resolved = resolveScore(score);
  const measureLen = measureTicks(score.meter);
  const wanted = options.voiceIds ? new Set(options.voiceIds) : null;
  const notes: PlayNote[] = [];
  for (const e of resolved.events) {
    if (!isNote(e)) continue;
    if (wanted && !wanted.has(e.voiceId)) continue;
    const midi = e.resolvedPitch?.midi;
    if (midi === undefined) throw new Error(`해석된 음이 없어요: ${e.eventId}`);
    notes.push({ id: e.eventId, midi, onsetTick: e.measureIndex * measureLen + e.onsetTicks, durationTick: e.durationTicks });
  }
  notes.sort((a, b) => a.onsetTick - b.onsetTick || a.midi - b.midi || a.id.localeCompare(b.id));
  const measures = Math.max(1, measureCountOf(score));
  return {
    notes,
    lengthTicks: measures * measureLen,
    tempoBpm: options.tempoBpm ?? score.tempoBpm,
    tempoReference: score.tempoReference,
  };
}

export interface TickRange {
  startTick: number;
  endTick: number;
}

/** 한 마디 안에서 n번째(0부터) 박의 구간. 4/4는 4분음표, 6/8은 점4분음표가 한 박이다. */
export function beatRange(meter: string, measureIndex: number, beatIndex: number): TickRange {
  const unit = countUnitTicks(meter);
  const len = measureTicks(meter);
  const beats = len / unit;
  if (!Number.isInteger(beatIndex) || beatIndex < 0 || beatIndex >= beats) throw new Error(`박 번호가 올바르지 않아요: ${beatIndex} (0–${beats - 1})`);
  const start = measureIndex * len + beatIndex * unit;
  return { startTick: start, endTick: start + unit };
}

export function measureRange(meter: string, measureIndex: number): TickRange {
  const len = measureTicks(meter);
  return { startTick: measureIndex * len, endTick: (measureIndex + 1) * len };
}

/** 느리게 듣기의 템포. 원래 템포의 5/8을 5 단위로 맞춘다(80 → 50). 너무 느려지지 않게 40 아래로는 내리지 않는다. */
export function slowTempoFor(originalBpm: number): number {
  if (!Number.isFinite(originalBpm) || originalBpm <= 0) throw new Error(`템포가 올바르지 않아요: ${originalBpm}`);
  const slow = Math.round((originalBpm * 5) / 8 / 5) * 5;
  return Math.min(originalBpm, Math.max(40, slow));
}
