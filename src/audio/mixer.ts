// 2-3 버스와 '소리 켜기'. 설계서 8.1, 8.6, W-7, W-8, W-11.
// - 소리 켜기를 누르기 전에는 오디오 장치를 만들지도, 소리를 내지도 않는다(W-11).
// - 오디오가 실패해도 편집은 계속된다. 소리 받이가 조용히 아무것도 하지 않을 뿐이다(W-8).
// - 과제 소리가 나는 동안 세계 버스 셋을 12 dB 낮췄다가 끝나면 되돌린다. '과제 중 배경 끄기'를 고르면 아예 끈다(W-7).
import { SILENT_SINK } from './types';
import type { AudioClock, NoteRequest, NoteSink, SinkOptions } from './types';
import type { SoundState } from '../domain/attempt';

export type BusId = 'task' | 'worldBed' | 'worldLayer' | 'worldSignature' | 'ui';

export const BUS_IDS: readonly BusId[] = ['task', 'worldBed', 'worldLayer', 'worldSignature', 'ui'];
export const WORLD_BUSES: readonly BusId[] = ['worldBed', 'worldLayer', 'worldSignature'];

/** 8.1의 기본 음량(dB). 기준 기기에서 들어 보고 조정하는 시작값이다. */
export const BUS_DEFAULT_DB: Record<BusId, number> = {
  task: 0,
  worldBed: -18,
  worldLayer: -14,
  worldSignature: -12,
  ui: -20,
};

export const DUCK_DB = -12;
export const DUCK_ATTACK_SEC = 0.15;
export const DUCK_RELEASE_SEC = 0.6;
/** 과제 소리를 낸 뒤 세계 소리를 되돌리기 전에 두는 짧은 여유(음의 끝 울림) */
export const DUCK_TAIL_SEC = 0.05;

export const SILENT_DB = -Infinity;

/** 0–1의 음량을 dB로. 0이면 -Infinity(무음) */
export function volumeToDb(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return SILENT_DB;
  return 20 * Math.log10(Math.min(1, v));
}

export interface BusHandle {
  /** dB로 정한 목표 음량으로 rampSec 동안 부드럽게 간다. -Infinity는 무음이다 */
  setGainDb(db: number, rampSec: number): void;
}

/** 실제 오디오 장치와 가짜가 함께 지키는 약속 */
export interface AudioEngine {
  /** 사용자의 누르기 안에서 부른다. 오디오 장치를 깨운다. 실패하면 오류를 던진다 */
  start(): Promise<void>;
  /** 오디오 시계(초) */
  now(): number;
  createBus(id: BusId, initialDb: number): BusHandle;
  /** 이 버스로 음을 내는 소리 받이 */
  createSink(bus: BusId, options?: SinkOptions): NoteSink;
  /** 전체 음량(dB) */
  setMasterDb(db: number, rampSec: number): void;
  /**
   * 오디오 장치가 멈춰 있으면(전화, 화면 잠금, 앱 전환 뒤. 아이폰은 저절로 깨어나지 않는다) 깨운다. 깨어 있으면 true다.
   * 사용자의 누르기 안에서 불러야 브라우저가 받아 준다. 장치를 깨우는 일이 없는 가짜 엔진은 없어도 된다.
   */
  resume?(): Promise<boolean>;
  dispose(): void;
}

export type MixerState = 'off' | 'starting' | 'on' | 'failed';
export type MixerFailure = 'unsupported' | 'blocked' | 'error';

export interface MixerSettings {
  masterVolume: number;
  worldVolume: number;
  taskVolume: number;
  muteWorldDuringQuest: boolean;
}

export const DEFAULT_MIXER_SETTINGS: MixerSettings = {
  masterVolume: 0.6,
  worldVolume: 0.5,
  taskVolume: 1,
  muteWorldDuringQuest: false,
};

export interface MixerSnapshot {
  state: MixerState;
  muted: boolean;
  failure: MixerFailure | null;
  message: string | null;
  settings: MixerSettings;
  /** 과제 소리가 나서 세계 소리가 줄어 있는가 */
  ducked: boolean;
}

export interface MixerDeps {
  createEngine: () => AudioEngine;
  settings?: Partial<MixerSettings>;
  /** 과제 소리 길이만큼 기다렸다 부를 때 쓰는 타이머. 기본은 setTimeout */
  setTimer?: (fn: () => void, ms: number) => () => void;
  /**
   * 재생기가 쓰는 시계(초). 소리 켜기 전에도 재생 막대가 움직이도록, 오디오 장치와 따로 늘 흐르는 시계를 쓴다.
   * 소리 받이가 음을 오디오 장치의 시각으로 옮겨 준다. 기본은 performance.now()다.
   */
  monotonicNow?: () => number;
}

export type WorldBusId = 'worldBed' | 'worldLayer' | 'worldSignature';

/** 신청해 둔 세계 소리 받이. 오디오 장치는 소리 켜기 뒤 처음 쓸 때 만든다(W-11) */
interface ManagedSink {
  bus: WorldBusId;
  options: SinkOptions;
  engineSink: NoteSink | null;
  /** 마지막으로 정한 크기. 받이가 늦게 만들어져도 처음부터 이 크기로 시작한다 */
  levelDb: number;
}

const defaultSetTimer = (fn: () => void, ms: number): (() => void) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

const defaultMonotonicNow = (): number => performance.now() / 1000;

export class Mixer {
  private readonly createEngine: () => AudioEngine;
  private readonly setTimer: (fn: () => void, ms: number) => () => void;
  private readonly monotonicNow: () => number;
  private engine: AudioEngine | null = null;
  private buses = new Map<BusId, BusHandle>();
  private engineTaskSink: NoteSink = SILENT_SINK;
  private engineWorldSink: NoteSink = SILENT_SINK;
  private managedSinks: ManagedSink[] = [];
  private _state: MixerState = 'off';
  private _muted = false;
  private _failure: MixerFailure | null = null;
  private _message: string | null = null;
  private _settings: MixerSettings;
  private activeTasks = new Set<symbol>();
  private pendingEnable: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private snapshotCache: MixerSnapshot | null = null;

  constructor(deps: MixerDeps) {
    this.createEngine = deps.createEngine;
    this.setTimer = deps.setTimer ?? defaultSetTimer;
    this.monotonicNow = deps.monotonicNow ?? defaultMonotonicNow;
    this._settings = { ...DEFAULT_MIXER_SETTINGS, ...deps.settings };
    for (const k of ['masterVolume', 'worldVolume', 'taskVolume'] as const) this._settings[k] = clamp01(this._settings[k]);
  }

  // ------------------------------------------------------------------ 상태
  get state(): MixerState {
    return this._state;
  }

  get muted(): boolean {
    return this._muted;
  }

  get settings(): MixerSettings {
    return { ...this._settings };
  }

  /** 소리가 실제로 나갈 수 있는 상태인가: 켜졌고, 음소거가 아니다 */
  get audible(): boolean {
    return this._state === 'on' && !this._muted;
  }

  get ducked(): boolean {
    return this.activeTasks.size > 0 && this.audible;
  }

  snapshot(): MixerSnapshot {
    if (!this.snapshotCache) {
      this.snapshotCache = {
        state: this._state,
        muted: this._muted,
        failure: this._failure,
        message: this._message,
        settings: { ...this._settings },
        ducked: this.ducked,
      };
    }
    return this.snapshotCache;
  }

  /** 시도 기록에 적는 소리 상태(W-8). 듣기 성과를 센 적이 있는지 가릴 때 쓴다 */
  soundState(): SoundState {
    if (this._state === 'failed') return this._failure === 'unsupported' ? 'unavailable' : 'failed';
    if (this._state === 'on' && !this._muted) return 'on';
    return 'muted'; // 아직 소리 켜기를 누르지 않았거나, 직접 껐다
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.snapshotCache = null;
    for (const l of [...this.listeners]) l();
  }

  // ------------------------------------------------------------------ 소리 켜기
  /**
   * '소리 켜기'. 사용자의 누르기 안에서 불러야 한다. 여러 번 눌러도 안전하다.
   * 실패하면 상태가 failed가 되고 오류는 던지지 않는다. 편집은 계속된다.
   */
  enable(): Promise<void> {
    if (this._state === 'on') return Promise.resolve();
    if (this.pendingEnable) return this.pendingEnable;
    this._state = 'starting';
    this._failure = null;
    this._message = null;
    this.changed();
    this.pendingEnable = this.doEnable().finally(() => {
      this.pendingEnable = null;
    });
    return this.pendingEnable;
  }

  private async doEnable(): Promise<void> {
    let engine: AudioEngine | null = null;
    try {
      engine = this.createEngine();
      await engine.start();
      this.engine = engine;
      for (const id of BUS_IDS) this.buses.set(id, engine.createBus(id, this.busDb(id)));
      this.engineTaskSink = engine.createSink('task');
      this.engineWorldSink = engine.createSink('worldSignature');
      engine.setMasterDb(this.masterDb(), 0);
      this._state = 'on';
      this._message = null;
    } catch (e) {
      try {
        engine?.dispose();
      } catch {
        /* 정리 중의 오류는 무시한다 */
      }
      this.engine = null;
      this.buses.clear();
      this.engineTaskSink = SILENT_SINK;
      this.engineWorldSink = SILENT_SINK;
      for (const m of this.managedSinks) m.engineSink = null;
      this._state = 'failed';
      const err = e as { name?: string; message?: string };
      this._failure = err?.name === 'UnsupportedError' ? 'unsupported' : err?.name === 'NotAllowedError' ? 'blocked' : 'error';
      this._message =
        this._failure === 'unsupported'
          ? '이 브라우저에서는 소리를 낼 수 없어요. 소리 없이 계속할 수 있어요.'
          : this._failure === 'blocked'
            ? '브라우저가 소리를 막았어요. 소리 켜기를 다시 눌러 보세요. 소리 없이도 계속할 수 있어요.'
            : '소리를 켜지 못했어요. 소리 없이 계속할 수 있어요.';
    }
    this.changed();
  }

  /**
   * 소리를 켠 뒤 오디오 장치가 멈췄으면 깨운다(8.6). 사용자가 다음에 누르거나 화면이 돌아올 때 앱이 부른다.
   * 소리를 켜지 않았거나 켜지 못한 상태에서는 아무 일도 하지 않는다: 누르기 전에는 장치를 만들지도 건드리지도 않는다(W-11).
   * 브라우저가 거절해도(누르기 밖에서 부른 경우) 오류를 내지 않고, 다음 누르기에서 다시 해 본다.
   */
  wake(): void {
    if (this._state !== 'on') return;
    const resume = this.engine?.resume;
    if (!resume) return;
    void resume.call(this.engine).catch(() => undefined);
  }

  /** 음소거를 켜거나 끈다. 소리를 켠 뒤에만 뜻이 있다 */
  setMuted(muted: boolean): void {
    if (muted === this._muted) return;
    this._muted = muted;
    this.applyLevels(0.05);
    this.changed();
  }

  // ------------------------------------------------------------------ 음량
  setSettings(patch: Partial<MixerSettings>): void {
    const next = { ...this._settings, ...patch };
    for (const k of ['masterVolume', 'worldVolume', 'taskVolume'] as const) next[k] = clamp01(next[k]);
    this._settings = next;
    this.applyLevels(0.05);
    this.changed();
  }

  private masterDb(): number {
    return this._muted ? SILENT_DB : volumeToDb(this._settings.masterVolume);
  }

  private busDb(id: BusId): number {
    const base = BUS_DEFAULT_DB[id];
    if (id === 'task') return base + volumeToDb(this._settings.taskVolume);
    if (WORLD_BUSES.includes(id)) {
      if (this.activeTasks.size > 0) {
        if (this._settings.muteWorldDuringQuest) return SILENT_DB;
        return base + volumeToDb(this._settings.worldVolume) + DUCK_DB;
      }
      return base + volumeToDb(this._settings.worldVolume);
    }
    return base;
  }

  private applyLevels(rampSec: number): void {
    if (!this.engine) return;
    this.engine.setMasterDb(this.masterDb(), rampSec);
    for (const id of BUS_IDS) this.buses.get(id)?.setGainDb(this.busDb(id), rampSec);
  }

  /** 지금 버스의 목표 음량(dB). 테스트와 음량 확인 화면이 읽는다 */
  busLevelDb(id: BusId): number {
    return this.busDb(id);
  }

  // ------------------------------------------------------------------ 과제 소리와 배경 줄이기
  /**
   * 과제 소리가 나기 시작했음을 알린다. 돌려주는 함수를 부르면 끝난 것이다.
   * 처음 시작할 때 세계 버스 셋을 0.15초에 걸쳐 낮추고, 마지막 하나가 끝나면 0.6초에 걸쳐 되돌린다.
   */
  beginTaskSound(): () => void {
    const token = Symbol('task-sound');
    const first = this.activeTasks.size === 0;
    this.activeTasks.add(token);
    if (first) this.rampWorld(DUCK_ATTACK_SEC);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.activeTasks.delete(token);
      if (this.activeTasks.size === 0) this.rampWorld(DUCK_RELEASE_SEC);
    };
  }

  /** 짧은 음 하나를 낸다(재료를 놓을 때). 음이 끝나면 배경을 되돌린다 */
  playTaskNote(midi: number, durationSec = 0.6, velocity = 0.8): void {
    if (!this.audible || !this.engine) return;
    const end = this.beginTaskSound();
    this.engineTaskSink.schedule({ id: `note-${midi}`, midi, time: this.engine.now(), duration: durationSec, velocity });
    this.setTimer(end, (durationSec + DUCK_TAIL_SEC) * 1000);
    this.changed();
  }

  /**
   * 월드에서 나는 짧은 음 하나(돌을 밟을 때, 8.1 '지나가며 밟아서 나는 소리'). 세계 서명 버스로 나가므로
   * 과제 소리가 나는 동안에는 다른 세계 소리처럼 줄어든다(W-7). 소리가 꺼져 있으면 아무 일도 하지 않는다(W-11).
   */
  playWorldNote(midi: number, durationSec = 0.5, velocity = 0.7): void {
    if (!this.audible || !this.engine) return;
    this.engineWorldSink.schedule({ id: `world-${midi}`, midi, time: this.engine.now(), duration: durationSec, velocity });
  }

  /**
   * 세계 소리(광장 합주, 서명 소리)가 쓰는 소리 받이를 신청한다. 시각은 `clock`(늘 흐르는 시계) 기준으로 받아 오디오 장치의
   * 시각으로 옮긴다. 소리를 켜기 전이거나 꺼져 있으면 아무것도 하지 않고(W-11), 소리를 켠 뒤 처음 쓸 때 장치에 만든다.
   * 세계 버스로 나가므로 과제 소리가 나는 동안 줄어들거나 꺼진다(W-7).
   */
  registerWorldSink(bus: WorldBusId, options: SinkOptions = {}): NoteSink {
    const entry: ManagedSink = { bus, options, engineSink: null, levelDb: 0 };
    this.managedSinks.push(entry);
    const ensure = (): NoteSink | null => {
      if (!this.engine) return null;
      if (!entry.engineSink) {
        entry.engineSink = this.engine.createSink(bus, options);
        if (entry.levelDb !== 0) entry.engineSink.setLevel?.(entry.levelDb, 0);
      }
      return entry.engineSink;
    };
    return {
      schedule: (req: NoteRequest) => {
        if (!this.audible) return;
        const sink = ensure();
        if (!sink || !this.engine) return;
        const offset = this.engine.now() - this.monotonicNow();
        sink.schedule({ ...req, time: req.time + offset });
      },
      cancelAll: () => entry.engineSink?.cancelAll(),
      setLevel: (db: number, rampSec: number) => {
        entry.levelDb = db;
        entry.engineSink?.setLevel?.(db, rampSec);
      },
    };
  }

  private rampWorld(rampSec: number): void {
    if (this.engine && this.audible) for (const id of WORLD_BUSES) this.buses.get(id)?.setGainDb(this.busDb(id), rampSec);
    this.changed();
  }

  // ------------------------------------------------------------------ 소리 받이
  /**
   * 과제 재생기가 쓰는 소리 받이. 소리가 나갈 수 없는 상태에서는 아무것도 하지 않는다.
   * 그래도 호출은 성공한다. 그래서 소리 없이도 재생 막대와 편집은 그대로 움직인다.
   */
  get taskSink(): NoteSink {
    return this.sinkProxy;
  }

  private sinkProxy: NoteSink = {
    schedule: (req: NoteRequest) => {
      if (!this.audible || !this.engine) return;
      // 재생기의 시각을 오디오 장치의 시각으로 옮긴다. 두 시계는 같은 속도로 흐르므로 매번 차이만 다시 잰다.
      const offset = this.engine.now() - this.monotonicNow();
      this.engineTaskSink.schedule({ ...req, time: req.time + offset });
    },
    cancelAll: () => {
      this.engineTaskSink.cancelAll();
    },
  };

  /** 과제 재생기에 넘기는 시계. 소리 켜기 전에도 흐른다 */
  get clock(): AudioClock {
    return { now: () => this.monotonicNow() };
  }

  /** 이번 재생에서 소리를 실제로 보냈는가(시도 기록의 soundPlayed) */
  get canPlaySound(): boolean {
    return this.audible;
  }

  dispose(): void {
    this.activeTasks.clear();
    this.engine?.dispose();
    this.engine = null;
    this.buses.clear();
    this.engineTaskSink = SILENT_SINK;
    this.engineWorldSink = SILENT_SINK;
    for (const m of this.managedSinks) m.engineSink = null;
    this._state = 'off';
    this.changed();
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
