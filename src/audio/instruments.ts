// 2-2 음색 하나. 설계서 8.5: 과제용은 합성음 하나로 시작한다(삼각파와 사인파를 섞고 어택을 짧게).
// 음원은 Tone.js, 예약은 직접 만든 재생기(transport)가 한다. 재생기가 부르는 소리 받이(NoteSink)를 여기서 만든다.
//
// Tone.PolySynth는 미래 시각의 음을 setTimeout으로 걸어 두므로 예약을 취소할 수 없다.
// 그래서 음마다 목소리(voice) 하나를 따로 두고, 정지하면 아직 울리지 않은 목소리는 버리고 울리는 목소리는 짧게 줄여 끈다.
import { isNoiseTimbre } from './types';
import type { NoiseTimbreId, NoteRequest, NoteSink, SinkOptions, ToneTimbreId } from './types';

export type ToneModule = typeof import('tone');

/** 과제용 음색의 모양. 값을 바꾸면 음량 확인(손 점검)을 다시 한다. */
export const TASK_TIMBRE = {
  /** 삼각파의 배음(홀수 배음이 1/n²로 줄어든다)에 기본음을 조금 더해 사인파와 섞은 모양 */
  partials: [1.3, 0, 0.111, 0, 0.04, 0, 0.0204, 0, 0.0123],
  envelope: { attack: 0.008, decay: 0.12, sustain: 0.65, release: 0.14 },
} as const;

export interface Timbre {
  /** 배음 세기(기본음부터) */
  partials: readonly number[];
  envelope: { attack: number; decay: number; sustain: number; release: number };
}

/**
 * 세계용 음색(8.5의 제안은 교실 악기를 지역에 붙이는 것이고 D-5는 아직 열려 있다). 첫 판은 같은 합성음을 모양만 달리한 것이다.
 * 귀로 듣는 확인(손 점검) 전의 값이다: 소리 크기와 어울림은 기준 기기에서 들어 보고 고친다.
 */
export const TIMBRES: Readonly<Record<ToneTimbreId, Timbre>> = {
  task: TASK_TIMBRE,
  /** 화음 깔기: 천천히 열리고 길게 남는 부드러운 소리 */
  pad: { partials: [1, 0.35, 0.12, 0.05], envelope: { attack: 0.3, decay: 0.4, sustain: 0.7, release: 1.2 } },
  /** 맥박: 낮고 짧게 두드리는 소리 */
  thump: { partials: [1, 0.2], envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.08 } },
  /** 타악(박자 강가, 6-8): 높고 아주 짧게 딱 치는 소리. 음높이보다 두드림으로 들리게 배음을 넓게 둔다 */
  tick: { partials: [1, 0.5, 0.35, 0.2, 0.12], envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.04 } },
  /** 베이스(종나무 숲, 6-8): 낮고 둥글게 울리다 꺼지는 소리 */
  bass: { partials: [1, 0.3, 0.08], envelope: { attack: 0.012, decay: 0.5, sustain: 0.45, release: 0.3 } },
  bell: { partials: [1, 0, 0.5, 0, 0.25, 0.12], envelope: { attack: 0.004, decay: 0.9, sustain: 0, release: 1.1 } },
  chime: { partials: [1, 0, 0, 0.4, 0, 0.2], envelope: { attack: 0.003, decay: 1.2, sustain: 0, release: 1.4 } },
  wood: { partials: [1, 0.6, 0.3], envelope: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.1 } },
  handbell: { partials: [1, 0.3, 0, 0.45, 0, 0.15], envelope: { attack: 0.003, decay: 1.0, sustain: 0, release: 1.3 } },
  kalimba: { partials: [1, 0.5, 0.25, 0.12], envelope: { attack: 0.003, decay: 0.5, sustain: 0, release: 0.5 } },
  pluck: { partials: [1, 0.7, 0.35, 0.2], envelope: { attack: 0.003, decay: 0.35, sustain: 0, release: 0.3 } },
  /** 가락(오선 언덕, 7-4): 맑고 부드럽게 이어지는 소리. 한 음이 한 박 가까이 울리고 다음 음에 자리를 내준다 */
  lead: { partials: [1, 0.25, 0.08, 0.03], envelope: { attack: 0.02, decay: 0.25, sustain: 0.55, release: 0.25 } },
  /** 달리는 음(음계 길, 7-4): 16분음표 하나가 0.15초 남짓이라 아주 짧게 튕기고 곧바로 꺼지는 소리 */
  run: { partials: [1, 0.45, 0.2, 0.08], envelope: { attack: 0.002, decay: 0.09, sustain: 0, release: 0.06 } },
  /** 꾸밈음(건반 늪, 7-4): 작은 방울처럼 톡 울리고 맑게 잦아드는 소리 */
  spark: { partials: [1, 0, 0.3, 0, 0.12], envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.35 } },
  /** 기준음 탑의 울림(건반 늪, 7-4): 소리굽쇠처럼 거의 사인파에 가깝고 천천히 열려 길게 이어지는 소리 */
  fork: { partials: [1, 0.04], envelope: { attack: 0.5, decay: 0.5, sustain: 0.9, release: 1.0 } },
};

/** 음높이에 따른 음량 보정(dB). 모두 0이면 모든 음의 진폭이 같다. 손 점검 뒤에 조정한다 */
export function pitchGainDb(_midi: number): number {
  return 0;
}

export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : Math.pow(10, db / 20);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Voice {
  synth: InstanceType<ToneModule['Synth']>;
  out: InstanceType<ToneModule['Gain']>;
  /** 좌우를 낼 수 있는 소리 받이에서만 있다 */
  panner: InstanceType<ToneModule['Panner']> | null;
  /** 이 목소리가 맡은 마지막 음이 시작하는 시각 */
  startsAt: number;
  /** 이 목소리가 마지막 음의 울림(릴리스)까지 끝나는 시각. 0이면 쉬는 중 */
  busyUntil: number;
}

export interface VoiceSinkOptions extends SinkOptions {
  maxVoices?: number;
  /** 미리 만들어 두는 목소리 수 */
  warmVoices?: number;
  /** 지금 시각(초). 기본은 Tone의 지금 시각이다 */
  nowFn?: () => number;
  /** 지연 실행. 정지할 때 줄여 끈 목소리를 치우는 데 쓴다 */
  setTimer?: (fn: () => void, ms: number) => void;
}

/** 정지할 때 울리는 음을 줄여 끄는 시간(초). 딱 끊으면 '틱' 소리가 난다 */
export const FADE_OUT_SEC = 0.02;
const DISPOSE_AFTER_MS = 80;

export class ToneVoiceSink implements NoteSink {
  private voices: Voice[] = [];
  private readonly maxVoices: number;
  private readonly nowFn: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => void;
  private readonly timbre: Timbre;
  private readonly withPan: boolean;
  /** 이 소리 받이 전체의 크기(setLevel). 목소리들은 모두 여기를 거쳐 버스로 간다 */
  private readonly trim: InstanceType<ToneModule['Gain']>;

  constructor(
    private readonly Tone: ToneModule,
    output: InstanceType<ToneModule['Gain']>,
    options: VoiceSinkOptions = {},
  ) {
    this.maxVoices = options.maxVoices ?? 24;
    this.nowFn = options.nowFn ?? (() => Tone.immediate());
    this.setTimer = options.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
    const id = options.timbre ?? 'task';
    if (isNoiseTimbre(id)) throw new Error(`자연음은 ToneNoiseSink로 만들어요: ${id}`);
    this.timbre = TIMBRES[id];
    this.withPan = options.pan === true;
    this.trim = new Tone.Gain(1).connect(output);
    for (let i = 0; i < (options.warmVoices ?? 6); i++) this.voices.push(this.makeVoice());
  }

  private makeVoice(): Voice {
    const Tone = this.Tone;
    const synth = new Tone.Synth({
      oscillator: { type: 'custom', partials: [...this.timbre.partials] },
      envelope: { ...this.timbre.envelope },
    });
    const out = new Tone.Gain(1);
    synth.connect(out);
    let panner: Voice['panner'] = null;
    if (this.withPan) {
      panner = new Tone.Panner(0);
      out.connect(panner);
      panner.connect(this.trim);
    } else {
      out.connect(this.trim);
    }
    return { synth, out, panner, startsAt: 0, busyUntil: 0 };
  }

  setLevel(db: number, rampSec: number): void {
    const target = dbToGain(db);
    const now = this.nowFn();
    this.trim.gain.cancelScheduledValues(now);
    if (rampSec <= 0) this.trim.gain.value = target;
    else this.trim.gain.rampTo(target, rampSec);
  }

  private pick(time: number): Voice {
    // 이 시각에 이미 쉬고 있을 목소리를 먼저 쓴다.
    const free = this.voices.find((v) => v.busyUntil <= time);
    if (free) return free;
    if (this.voices.length < this.maxVoices) {
      const v = this.makeVoice();
      this.voices.push(v);
      return v;
    }
    // 모두 바쁘면 가장 먼저 끝나는 목소리를 이 음의 시작에서 자르고 쓴다.
    const victim = this.voices.reduce((a, b) => (a.busyUntil <= b.busyUntil ? a : b));
    victim.synth.triggerRelease(time);
    return victim;
  }

  schedule(req: NoteRequest): void {
    const voice = this.pick(req.time);
    const gain = Math.max(0, Math.min(1, req.velocity)) * dbToGain(pitchGainDb(req.midi));
    if (voice.panner) voice.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, req.pan ?? 0)), req.time);
    voice.synth.triggerAttackRelease(midiToHz(req.midi), Math.max(0.01, req.duration), req.time, gain);
    voice.startsAt = req.time;
    voice.busyUntil = req.time + req.duration + this.timbre.envelope.release;
  }

  cancelAll(): void {
    const now = this.nowFn();
    this.voices = this.voices.map((v) => {
      if (v.busyUntil <= now) return v; // 쉬는 목소리는 그대로 둔다
      const replacement = this.makeVoice();
      if (v.startsAt > now) {
        // 아직 시작하지 않은 음: 소리가 난 적이 없으니 바로 버린다.
        this.discard(v);
      } else {
        // 울리는 음: 20 ms에 걸쳐 줄이고 치운다.
        v.out.gain.cancelScheduledValues(now);
        v.out.gain.setValueAtTime(v.out.gain.value, now);
        v.out.gain.linearRampToValueAtTime(0, now + FADE_OUT_SEC);
        this.setTimer(() => this.discard(v), DISPOSE_AFTER_MS);
      }
      return replacement;
    });
  }

  private discard(v: Voice): void {
    try {
      v.synth.dispose();
      v.out.dispose();
      v.panner?.dispose();
    } catch {
      /* 이미 치워진 목소리 */
    }
  }

  /** 지금 쓰는 목소리 수(테스트용) */
  get voiceCount(): number {
    return this.voices.length;
  }

  dispose(): void {
    for (const v of this.voices) this.discard(v);
    this.voices = [];
    try {
      this.trim.dispose();
    } catch {
      /* 이미 치워졌다 */
    }
  }
}

// ---------------------------------------------------------------------------
// 자연음(6-8, 7-4, 설계서 8.1 '세계 바탕'): 소음을 거르고 일었다 잦아드는 모양을 입힌 소리. 강의 물소리, 숲의 바람 소리, 언덕의 바람결, 길가의 풀 소리, 늪의 안개 소리.
// 음이 아니라 '거르는 높이'를 받는다: 받은 midi를 주파수로 읽어 걸러 내는 가운데 주파수로 쓴다.
// 귀로 듣는 확인(손 점검) 전의 값이다: 크기와 질감은 기준 기기에서 들어 보고 고친다.

export interface NatureTimbreDef {
  noise: 'white' | 'pink' | 'brown';
  filter: { type: 'bandpass' | 'lowpass'; q: number };
  envelope: { attack: number; decay: number; sustain: number; release: number };
  /**
   * 소음의 원음은 작고 거르면 더 줄어서(분홍 소음의 띠 거르개는 특히), 같은 세기로는 화음 깔기보다 20~30 dB 작게 나온다.
   * 진짜 Chrome에서 소리 받이에 음 하나를 직접 넣어 출력의 세기(RMS)를 재고, 화음 깔기보다 3~4 dB 작게 맞춘 값이다(dB). 강과 숲은 tests/flow/phase6-layers.flow.ts가, 언덕과 길과 늪은 tests/flow/phase7-regions.flow.ts가 같은 방법으로 잰다. 귀로 듣는 확인(손 점검) 전의 값이다
   */
  trimDb: number;
}

export const NATURE_TIMBRES: Readonly<Record<NoiseTimbreId, NatureTimbreDef>> = {
  /** 강: 분홍 소음을 높은 대역으로 거른 졸졸거림. 마디를 이어 가며 천천히 일었다 잦아든다 */
  river: { noise: 'pink', filter: { type: 'bandpass', q: 0.9 }, envelope: { attack: 0.9, decay: 0.4, sustain: 0.8, release: 1.2 }, trimDb: 15 },
  /** 숲: 갈색 소음을 낮은 대역으로 거른 바람. 더 느리게 일고 더 길게 잦아든다 */
  wind: { noise: 'brown', filter: { type: 'lowpass', q: 0.6 }, envelope: { attack: 1.1, decay: 0.4, sustain: 0.7, release: 1.4 }, trimDb: 7 },
  /** 언덕: 분홍 소음을 가운데 높은 대역에서 좁게 거른 바람결. 휘파람처럼 가늘게 일었다 잦아든다(trimDb 15: 7-4에서 진짜 Chrome으로 세 번 재니 화음 깔기보다 3.6, 4.2, 3.8 dB 작았다) */
  breeze: { noise: 'pink', filter: { type: 'bandpass', q: 1.4 }, envelope: { attack: 1.0, decay: 0.4, sustain: 0.75, release: 1.3 }, trimDb: 15 },
  /** 길: 흰 소음을 가장 높은 대역으로 거른 풀 소리. 사각거리듯 가볍게 일었다 잦아든다(trimDb 6.5: 처음 15로는 화음 깔기보다 5.1 dB 커서 낮췄고, 7-4에서 진짜 Chrome으로 두 번 다시 재니 4.0, 2.9 dB 작았다) */
  grass: { noise: 'white', filter: { type: 'bandpass', q: 0.8 }, envelope: { attack: 0.7, decay: 0.3, sustain: 0.6, release: 1.0 }, trimDb: 6.5 },
  /** 늪: 갈색 소음을 가장 낮은 대역으로 거른 안개 소리. 가장 느리게 일고 가장 길게 잦아든다(trimDb 5.5: 처음 9로는 화음 깔기와 같은 세기(+0.1 dB)여서 낮췄고, 7-4에서 진짜 Chrome으로 두 번 다시 재니 3.7, 3.0 dB 작았다) */
  mist: { noise: 'brown', filter: { type: 'lowpass', q: 0.5 }, envelope: { attack: 1.2, decay: 0.4, sustain: 0.7, release: 1.5 }, trimDb: 5.5 },
};

interface NoiseVoice {
  synth: InstanceType<ToneModule['NoiseSynth']>;
  filter: InstanceType<ToneModule['Filter']>;
  out: InstanceType<ToneModule['Gain']>;
  startsAt: number;
  busyUntil: number;
}

export interface NoiseSinkOptions extends SinkOptions {
  maxVoices?: number;
  warmVoices?: number;
  nowFn?: () => number;
  setTimer?: (fn: () => void, ms: number) => void;
}

/** 자연음을 내는 소리 받이. 한 마디에 한 번 일어나는 소음 하나가 목소리 하나이고, 이웃한 마디의 소음은 잦아드는 동안 겹친다 */
export class ToneNoiseSink implements NoteSink {
  private voices: NoiseVoice[] = [];
  private readonly maxVoices: number;
  private readonly nowFn: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => void;
  private readonly def: NatureTimbreDef;
  private readonly trim: InstanceType<ToneModule['Gain']>;

  constructor(
    private readonly Tone: ToneModule,
    output: InstanceType<ToneModule['Gain']>,
    options: NoiseSinkOptions = {},
  ) {
    const id = options.timbre;
    if (!isNoiseTimbre(id)) throw new Error(`자연음의 이름이 아니에요: ${String(id)}`);
    this.def = NATURE_TIMBRES[id];
    this.maxVoices = options.maxVoices ?? 4;
    this.nowFn = options.nowFn ?? (() => Tone.immediate());
    this.setTimer = options.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
    this.trim = new Tone.Gain(1).connect(output);
    for (let i = 0; i < (options.warmVoices ?? 1); i++) this.voices.push(this.makeVoice());
  }

  private makeVoice(): NoiseVoice {
    const Tone = this.Tone;
    const synth = new Tone.NoiseSynth({ noise: { type: this.def.noise }, envelope: { ...this.def.envelope } });
    const filter = new Tone.Filter({ type: this.def.filter.type, frequency: 1000, Q: this.def.filter.q });
    const out = new Tone.Gain(dbToGain(this.def.trimDb));
    synth.connect(filter);
    filter.connect(out);
    out.connect(this.trim);
    return { synth, filter, out, startsAt: 0, busyUntil: 0 };
  }

  setLevel(db: number, rampSec: number): void {
    const target = dbToGain(db);
    const now = this.nowFn();
    this.trim.gain.cancelScheduledValues(now);
    if (rampSec <= 0) this.trim.gain.value = target;
    else this.trim.gain.rampTo(target, rampSec);
  }

  private pick(time: number): NoiseVoice {
    const free = this.voices.find((v) => v.busyUntil <= time);
    if (free) return free;
    if (this.voices.length < this.maxVoices) {
      const v = this.makeVoice();
      this.voices.push(v);
      return v;
    }
    const victim = this.voices.reduce((a, b) => (a.busyUntil <= b.busyUntil ? a : b));
    victim.synth.triggerRelease(time);
    return victim;
  }

  schedule(req: NoteRequest): void {
    const voice = this.pick(req.time);
    voice.filter.frequency.setValueAtTime(midiToHz(req.midi), req.time);
    voice.synth.triggerAttackRelease(Math.max(0.01, req.duration), req.time, Math.max(0, Math.min(1, req.velocity)));
    voice.startsAt = req.time;
    voice.busyUntil = req.time + req.duration + this.def.envelope.release;
  }

  cancelAll(): void {
    const now = this.nowFn();
    this.voices = this.voices.map((v) => {
      if (v.busyUntil <= now) return v;
      const replacement = this.makeVoice();
      if (v.startsAt > now) {
        this.discard(v);
      } else {
        v.out.gain.cancelScheduledValues(now);
        v.out.gain.setValueAtTime(v.out.gain.value, now);
        v.out.gain.linearRampToValueAtTime(0, now + FADE_OUT_SEC);
        this.setTimer(() => this.discard(v), DISPOSE_AFTER_MS);
      }
      return replacement;
    });
  }

  private discard(v: NoiseVoice): void {
    try {
      v.synth.dispose();
      v.filter.dispose();
      v.out.dispose();
    } catch {
      /* 이미 치워진 목소리 */
    }
  }

  get voiceCount(): number {
    return this.voices.length;
  }

  dispose(): void {
    for (const v of this.voices) this.discard(v);
    this.voices = [];
    try {
      this.trim.dispose();
    } catch {
      /* 이미 치워졌다 */
    }
  }
}

// ---------------------------------------------------------------------------
// 음량 확인(2-2): 음마다 같은 소리 크기로 나는지 오프라인으로 재서 본다.

export interface LoudnessRow {
  midi: number;
  /** 지속 구간(0.25–0.9초)의 RMS */
  rms: number;
  peak: number;
  rmsDb: number;
}

/**
 * 음 하나씩 오프라인으로 그려서 소리 크기를 잰다. 귀로 듣는 손 점검을 대신하지는 않지만,
 * 한 음만 튀게 크거나 작은 실수(음높이 보정 오류, 클리핑)는 잡는다.
 */
export async function measureLoudness(Tone: ToneModule, midis: readonly number[]): Promise<LoudnessRow[]> {
  const rows: LoudnessRow[] = [];
  for (const midi of midis) {
    const buffer = await Tone.Offline(({ transport: _t }) => {
      const out = new Tone.Gain(1).toDestination();
      const sink = new ToneVoiceSink(Tone, out, { warmVoices: 1, nowFn: () => 0 });
      sink.schedule({ id: 'm', midi, time: 0, duration: 1, velocity: 0.8 });
    }, 1.4, 1, 44100);
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const from = Math.floor(0.25 * sr);
    const to = Math.floor(0.9 * sr);
    let sum = 0;
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = data[i]!;
      sum += v * v;
    }
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
    const rms = Math.sqrt(sum / (to - from));
    rows.push({ midi, rms, peak, rmsDb: 20 * Math.log10(Math.max(rms, 1e-9)) });
  }
  return rows;
}
