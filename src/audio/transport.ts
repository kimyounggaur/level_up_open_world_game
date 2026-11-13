// 2-1 과제 재생기(Transport). 설계서 8.2와 10.1: 직접 만든 짧은 선예약 재생기다.
// - 25 ms마다 깨어나 약 100 ms 앞까지의 음만 예약한다. 화면 프레임이 아니라 오디오 시계를 기준으로 한다.
// - 정지하면 예약을 전부 취소한다.
// - 구간 반복의 경계에서 같은 음을 두 번 예약하지 않고, 경계를 넘는 음은 구간 끝에서 자른다.
// - 템포를 바꾸면(구간을 바꿔도) 멈춘 뒤 구간 처음부터 다시 시작한다.
import { ticksToSeconds } from '../domain/time';
import type { TempoReference } from '../domain/time';
import type { AudioClock, IntervalTimer, NoteSink, PlayNote } from './types';

export const DEFAULT_INTERVAL_MS = 25;
export const DEFAULT_LOOKAHEAD_SEC = 0.1;
/** 재생 버튼을 누른 순간부터 첫 음까지 두는 여유. 첫 음이 잘리지 않게 한다 */
export const DEFAULT_START_DELAY_SEC = 0.06;
/** 이만큼 넘게 늦은 음은 늦게 울리지 않고 건너뛴다 */
export const STALE_NOTE_SEC = 0.25;
export const MIN_BPM = 20;
export const MAX_BPM = 400;

export interface TransportScore {
  notes: readonly PlayNote[];
  /** 전체 길이(틱). 끝에 쉼이 있어도 그만큼 기다린다 */
  lengthTicks: number;
  tempoBpm: number;
  tempoReference?: TempoReference;
}

export interface SectionRange {
  /** 포함 */
  startTick: number;
  /** 제외 */
  endTick: number;
}

export type TransportState = 'stopped' | 'playing';
export type TransportChangeReason = 'play' | 'stop' | 'ended' | 'restart';
export interface TransportChange {
  state: TransportState;
  reason: TransportChangeReason;
}

export interface TransportDeps {
  clock: AudioClock;
  timer: IntervalTimer;
  sink: NoteSink;
  intervalMs?: number;
  lookaheadSec?: number;
  startDelaySec?: number;
}

interface Run {
  /** 이 재생의 번호. 멈춘 재생의 늦은 호출을 무시하는 데 쓴다 */
  id: number;
  t0: number;
  rangeStart: number;
  rangeEnd: number;
  rangeSec: number;
  secPerTick: number;
  repeat: boolean;
  /** 이 구간 안에서 시작하는 음(시작 틱 순) */
  notes: PlayNote[];
  nextIndex: number;
  /** 지금 반복 차례의 시작 시각 */
  iterStart: number;
  iteration: number;
  allScheduled: boolean;
  stopTimer: () => void;
}

export class TaskTransport {
  private readonly clock: AudioClock;
  private readonly timer: IntervalTimer;
  private readonly sink: NoteSink;
  private readonly intervalMs: number;
  private readonly lookahead: number;
  private readonly startDelay: number;

  private score: TransportScore | null = null;
  private tempoBpm = 80;
  private range: SectionRange | null = null;
  private repeat = false;
  private run: Run | null = null;
  private runCounter = 0;
  private listeners = new Set<(c: TransportChange) => void>();

  constructor(deps: TransportDeps) {
    this.clock = deps.clock;
    this.timer = deps.timer;
    this.sink = deps.sink;
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.lookahead = deps.lookaheadSec ?? DEFAULT_LOOKAHEAD_SEC;
    this.startDelay = deps.startDelaySec ?? DEFAULT_START_DELAY_SEC;
  }

  // ------------------------------------------------------------------ 상태 보기
  get state(): TransportState {
    return this.run ? 'playing' : 'stopped';
  }

  get bpm(): number {
    return this.tempoBpm;
  }

  get section(): SectionRange | null {
    return this.range ? { ...this.range } : null;
  }

  get repeating(): boolean {
    return this.repeat;
  }

  /** 지금 재생 위치(틱). 멈춰 있으면 null. 화면의 재생 막대가 쓴다 */
  positionTick(): number | null {
    const r = this.run;
    if (!r) return null;
    const elapsed = this.clock.now() - r.t0;
    if (elapsed <= 0) return r.rangeStart;
    const within = r.repeat ? elapsed % r.rangeSec : Math.min(elapsed, r.rangeSec);
    return r.rangeStart + within / r.secPerTick;
  }

  onChange(listener: (c: TransportChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(c: TransportChange): void {
    for (const l of [...this.listeners]) l(c);
  }

  // ------------------------------------------------------------------ 설정
  /** 재생할 내용을 바꾼다. 재생 중이면 멈춘다. */
  load(score: TransportScore): void {
    if (!Number.isInteger(score.lengthTicks) || score.lengthTicks <= 0) throw new Error(`재생 길이가 올바르지 않아요: ${score.lengthTicks}`);
    assertBpm(score.tempoBpm);
    for (const n of score.notes) {
      if (!Number.isInteger(n.onsetTick) || n.onsetTick < 0) throw new Error(`음의 시작 틱이 올바르지 않아요: ${n.id}`);
      if (!Number.isInteger(n.durationTick) || n.durationTick <= 0) throw new Error(`음의 길이가 올바르지 않아요: ${n.id}`);
    }
    this.stop();
    this.score = { ...score, notes: [...score.notes].sort((a, b) => a.onsetTick - b.onsetTick || a.id.localeCompare(b.id)) };
    this.tempoBpm = score.tempoBpm;
    this.range = null;
    this.repeat = false;
  }

  /** 템포를 바꾼다. 재생 중이면 멈춘 뒤 구간 처음부터 다시 시작한다(8.2). */
  setTempo(bpm: number): void {
    assertBpm(bpm);
    if (bpm === this.tempoBpm) return;
    this.tempoBpm = bpm;
    if (this.run) this.restart();
  }

  /** 재생할 구간과 반복 여부를 정한다. 구간이 null이면 전체다. 재생 중이면 처음부터 다시 시작한다. */
  setSection(range: SectionRange | null, repeat: boolean): void {
    if (range) {
      if (!this.score) throw new Error('재생할 내용이 없어요');
      if (!Number.isInteger(range.startTick) || !Number.isInteger(range.endTick) || range.startTick < 0 || range.endTick <= range.startTick || range.endTick > this.score.lengthTicks) {
        throw new Error(`재생 구간이 올바르지 않아요: ${range.startTick}–${range.endTick}`);
      }
    }
    const same = JSON.stringify(range) === JSON.stringify(this.range) && repeat === this.repeat;
    this.range = range ? { ...range } : null;
    this.repeat = repeat;
    if (!same && this.run) this.restart();
  }

  // ------------------------------------------------------------------ 재생과 정지
  /** 구간 처음부터 재생한다. 이미 재생 중이면 처음부터 다시 한다. */
  play(): void {
    if (!this.score) throw new Error('재생할 내용이 없어요');
    if (this.run) {
      this.restart();
      return;
    }
    this.begin('play');
  }

  /** 멈춘다. 예약을 전부 취소하고 울리는 음도 줄여 끈다. 멈춰 있어도 안전하다. */
  stop(): void {
    const wasPlaying = this.run !== null;
    this.halt();
    this.sink.cancelAll();
    if (wasPlaying) this.emit({ state: 'stopped', reason: 'stop' });
  }

  private restart(): void {
    this.halt();
    this.sink.cancelAll();
    this.begin('restart');
  }

  private halt(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    r.stopTimer();
  }

  private begin(reason: TransportChangeReason): void {
    const score = this.score!;
    const range = this.range ?? { startTick: 0, endTick: score.lengthTicks };
    const secPerTick = ticksToSeconds(1, { reference: score.tempoReference ?? 'quarter', bpm: this.tempoBpm });
    const notes = score.notes.filter((n) => n.onsetTick >= range.startTick && n.onsetTick < range.endTick);
    const t0 = this.clock.now() + this.startDelay;
    const id = ++this.runCounter;
    const run: Run = {
      id,
      t0,
      rangeStart: range.startTick,
      rangeEnd: range.endTick,
      rangeSec: (range.endTick - range.startTick) * secPerTick,
      secPerTick,
      repeat: this.repeat,
      notes,
      nextIndex: 0,
      iterStart: t0,
      iteration: 0,
      allScheduled: false,
      stopTimer: () => {},
    };
    this.run = run;
    run.stopTimer = this.timer.start(() => this.tick(id), this.intervalMs);
    this.emit({ state: 'playing', reason });
    this.tick(id); // 첫 음을 기다리지 않고 바로 예약한다
  }

  // ------------------------------------------------------------------ 선예약
  private tick(runId: number): void {
    const r = this.run;
    if (!r || r.id !== runId) return; // 멈춘 재생의 늦은 호출
    const now = this.clock.now();
    const horizon = now + this.lookahead;

    // 오래 멈췄다 돌아온 경우: 지나간 반복 차례를 통째로 건너뛰어 한꺼번에 쏟아지는 것을 막는다.
    if (r.repeat && now - r.iterStart > r.rangeSec + STALE_NOTE_SEC) {
      const skip = Math.floor((now - r.iterStart) / r.rangeSec);
      r.iterStart += skip * r.rangeSec;
      r.iteration += skip;
      r.nextIndex = 0;
    }

    for (let guard = 0; guard < 10000; guard++) {
      const upto = Math.min(r.rangeEnd, r.rangeStart + (horizon - r.iterStart) / r.secPerTick);
      while (r.nextIndex < r.notes.length && r.notes[r.nextIndex]!.onsetTick < upto) {
        this.scheduleNote(r, r.notes[r.nextIndex]!, now);
        r.nextIndex++;
      }
      if (upto < r.rangeEnd) break; // 다음 호출에서 이어서 예약한다
      // 이 차례의 음을 다 예약했다.
      if (!r.repeat) {
        r.allScheduled = true;
        break;
      }
      r.iterStart += r.rangeSec;
      r.iteration++;
      r.nextIndex = 0;
    }

    if (!r.repeat && r.allScheduled && now >= r.iterStart + r.rangeSec) {
      this.halt();
      this.emit({ state: 'stopped', reason: 'ended' });
    }
  }

  private scheduleNote(r: Run, n: PlayNote, now: number): void {
    const time = r.iterStart + (n.onsetTick - r.rangeStart) * r.secPerTick;
    if (time < now - STALE_NOTE_SEC) return; // 너무 늦은 음은 건너뛴다
    // 구간 끝을 넘는 음은 끝에서 자른다. 다음 반복 차례의 첫 음과 겹치지 않게 한다.
    const endTick = Math.min(n.onsetTick + n.durationTick, r.rangeEnd);
    this.sink.schedule({
      id: n.id,
      midi: n.midi,
      time,
      duration: (endTick - n.onsetTick) * r.secPerTick,
      velocity: n.velocity ?? 0.8,
    });
  }
}

function assertBpm(bpm: number): void {
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) throw new Error(`템포가 올바르지 않아요: ${bpm} (${MIN_BPM}–${MAX_BPM})`);
}
