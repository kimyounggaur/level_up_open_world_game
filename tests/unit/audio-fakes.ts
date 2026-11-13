// 소리 테스트용 가짜 시계, 가짜 타이머, 가짜 소리 받이. 제품 코드가 아니다.
import type { AudioClock, IntervalTimer, NoteRequest, NoteSink, SinkOptions } from '@/audio/types';

export class FakeClock implements AudioClock {
  t: number;
  constructor(start = 100) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
}

interface TimerEntry {
  fn: () => void;
  intervalMs: number;
  active: boolean;
}

export class FakeTimer implements IntervalTimer {
  entries: TimerEntry[] = [];
  start(fn: () => void, intervalMs: number): () => void {
    const e: TimerEntry = { fn, intervalMs, active: true };
    this.entries.push(e);
    return () => {
      e.active = false;
    };
  }
  get activeCount(): number {
    return this.entries.filter((e) => e.active).length;
  }
  fire(): void {
    for (const e of [...this.entries]) if (e.active) e.fn();
  }
}

export interface Recorded extends NoteRequest {
  /** 예약을 받은 시계 시각 */
  requestedAt: number;
  cancelled: boolean;
  /** 취소될 때 이미 울리고 있었는가 */
  cutWhileSounding: boolean;
}

export class FakeSink implements NoteSink {
  requests: Recorded[] = [];
  cancelCalls = 0;
  /** setLevel로 정한 크기들(dB, 걸린 시간) */
  levels: Array<{ db: number; ramp: number }> = [];
  constructor(private readonly clock: FakeClock) {}
  setLevel(db: number, ramp: number): void {
    this.levels.push({ db, ramp });
  }
  get lastLevel(): { db: number; ramp: number } | undefined {
    return this.levels[this.levels.length - 1];
  }
  schedule(req: NoteRequest): void {
    this.requests.push({ ...req, requestedAt: this.clock.now(), cancelled: false, cutWhileSounding: false });
  }
  cancelAll(): void {
    this.cancelCalls++;
    const now = this.clock.now();
    for (const r of this.requests) {
      if (r.cancelled) continue;
      if (r.time + r.duration <= now) continue; // 이미 끝난 음
      r.cancelled = true;
      r.cutWhileSounding = r.time <= now;
    }
  }
  /** 아직 울리지 않았고 취소되지도 않은 예약 */
  pending(): Recorded[] {
    const now = this.clock.now();
    return this.requests.filter((r) => !r.cancelled && r.time > now);
  }
  /** 취소되지 않은 예약만 */
  live(): Recorded[] {
    return this.requests.filter((r) => !r.cancelled);
  }
}

export class AudioRig {
  clock = new FakeClock();
  timer = new FakeTimer();
  sink = new FakeSink(this.clock);
  /** 시계를 stepMs씩 앞으로 보내며 타이머를 부른다. jitter는 한 걸음의 길이를 흔드는 비율이다. */
  run(seconds: number, stepMs = 25, jitter = 0): void {
    const end = this.clock.t + seconds;
    let i = 0;
    while (this.clock.t < end - 1e-9) {
      const wobble = jitter ? 1 + jitter * Math.sin(i * 2.399) : 1;
      this.clock.t = Math.min(end, this.clock.t + (stepMs / 1000) * wobble);
      this.timer.fire();
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// 믹서 테스트용 가짜 엔진

import type { AudioEngine, BusHandle, BusId } from '@/audio/mixer';

export interface BusCall {
  db: number;
  ramp: number;
}

export class FakeEngine implements AudioEngine {
  startCalls = 0;
  /** 멈춘 장치를 깨우라는 요청을 받은 횟수(8.6). resumeResult가 거짓이거나 resumeError가 있으면 깨어나지 못한 것으로 답한다 */
  resumeCalls = 0;
  resumeResult = true;
  resumeError: Error | null = null;
  disposed = false;
  startError: Error | null = null;
  clock = new FakeClock(50);
  masterCalls: BusCall[] = [];
  busCalls = new Map<BusId, BusCall[]>();
  sinks = new Map<BusId, FakeSink>();

  async start(): Promise<void> {
    this.startCalls++;
    if (this.startError) throw this.startError;
  }
  async resume(): Promise<boolean> {
    this.resumeCalls++;
    if (this.resumeError) throw this.resumeError;
    return this.resumeResult;
  }
  now(): number {
    return this.clock.now();
  }
  createBus(id: BusId, initialDb: number): BusHandle {
    const calls: BusCall[] = [{ db: initialDb, ramp: 0 }];
    this.busCalls.set(id, calls);
    return { setGainDb: (db, ramp) => calls.push({ db, ramp }) };
  }
  /** 만든 소리 받이를 만든 차례대로(버스와 옵션과 함께) */
  sinkLog: Array<{ bus: BusId; options: SinkOptions; sink: FakeSink }> = [];
  createSink(bus: BusId, options: SinkOptions = {}): FakeSink {
    const s = new FakeSink(this.clock);
    this.sinks.set(bus, s);
    this.sinkLog.push({ bus, options, sink: s });
    return s;
  }
  setMasterDb(db: number, ramp: number): void {
    this.masterCalls.push({ db, ramp });
  }
  dispose(): void {
    this.disposed = true;
  }
  lastBusDb(id: BusId): number {
    const c = this.busCalls.get(id)!;
    return c[c.length - 1]!.db;
  }
  lastBusCall(id: BusId): BusCall {
    const c = this.busCalls.get(id)!;
    return c[c.length - 1]!;
  }
}

// ---------------------------------------------------------------------------
// 세계 소리 테스트용 가짜 믹서(WorldAudio가 쓰는 부분만)

import type { WorldBusId } from '@/audio/mixer';
import type { WorldSoundMixer } from '@/audio/worldAudio';

export class FakeWorldMixer implements WorldSoundMixer {
  audible = false;
  private readonly listeners = new Set<() => void>();
  registered: Array<{ bus: WorldBusId; options: SinkOptions; sink: FakeSink }> = [];
  constructor(private readonly clock: FakeClock) {}
  registerWorldSink(bus: WorldBusId, options: SinkOptions = {}): FakeSink {
    const sink = new FakeSink(this.clock);
    this.registered.push({ bus, options, sink });
    return sink;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  setAudible(v: boolean): void {
    this.audible = v;
    for (const l of [...this.listeners]) l();
  }
  /** 이 음색으로 신청된 받이 */
  sinkOf(timbre: string): FakeSink | undefined {
    return this.registered.find((r) => r.options.timbre === timbre)?.sink;
  }
  get allSinks(): FakeSink[] {
    return this.registered.map((r) => r.sink);
  }
}

/** 탭이 보이는지를 흉내 낸다 */
export class FakeVisibility {
  isHidden = false;
  private readonly listeners = new Set<() => void>();
  hidden(): boolean {
    return this.isHidden;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  set(hidden: boolean): void {
    this.isHidden = hidden;
    for (const l of [...this.listeners]) l();
  }
}
