// 실제 오디오 장치를 쓰는 엔진(Tone.js). 믹서가 소리 켜기를 누른 뒤에만 만든다(W-11).
// Tone.js는 이 파일에서 처음 불러오므로 첫 화면을 그리는 데는 들어가지 않는다.
import { dbToGain, ToneNoiseSink, ToneVoiceSink } from './instruments';
import type { ToneModule } from './instruments';
import { BUS_IDS } from './mixer';
import type { AudioEngine, BusHandle, BusId } from './mixer';
import { isNoiseTimbre } from './types';
import type { NoteSink, SinkOptions } from './types';

class NamedError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

type Gain = InstanceType<ToneModule['Gain']>;

export class ToneEngine implements AudioEngine {
  private Tone: ToneModule | null = null;
  private master: Gain | null = null;
  private buses = new Map<BusId, Gain>();
  private sinks: Array<NoteSink & { dispose(): void }> = [];

  async start(): Promise<void> {
    const w = globalThis as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
    if (typeof w.AudioContext === 'undefined' && typeof w.webkitAudioContext === 'undefined') {
      throw new NamedError('UnsupportedError', 'Web Audio를 지원하지 않아요');
    }
    const Tone = await import('tone');
    await Tone.start();
    const ctx = Tone.getContext();
    // 음마다 정확한 시각에 시작하게 한다. 기본 여유(0.1초)가 남아 있으면 가까운 음이 뒤로 밀린다.
    (ctx as unknown as { lookAhead: number }).lookAhead = 0;
    if (ctx.state !== 'running') throw new NamedError('NotAllowedError', '오디오가 시작되지 않았어요');
    this.Tone = Tone;
    this.master = new Tone.Gain(0).toDestination();
  }

  /** 멈춘 오디오 장치를 깨운다. 이미 깨어 있으면 아무것도 하지 않는다. 브라우저가 거절하면(누르기 밖) false다 */
  async resume(): Promise<boolean> {
    if (!this.Tone) return false;
    const ctx = this.Tone.getContext();
    // 깨운 뒤에 다시 읽어야 해서 함수로 둔다(위에서 이미 running을 걸러 낸 뒤라 글자 비교만 하면 형식 검사가 같은 값으로 본다)
    const running = (): boolean => ctx.state === 'running';
    if (running()) return true;
    try {
      await ctx.resume();
    } catch {
      /* 누르기 밖에서 부르면 거절될 수 있다. 다음 누르기에서 다시 한다 */
    }
    return running();
  }

  now(): number {
    if (!this.Tone) throw new Error('엔진이 시작되지 않았어요');
    return this.Tone.immediate();
  }

  createBus(id: BusId, initialDb: number): BusHandle {
    const Tone = this.requireTone();
    const bus = new Tone.Gain(dbToGain(initialDb)).connect(this.master!);
    this.buses.set(id, bus);
    return {
      setGainDb: (db, rampSec) => {
        const target = dbToGain(db);
        bus.gain.cancelScheduledValues(Tone.immediate());
        if (rampSec <= 0) bus.gain.value = target;
        else bus.gain.rampTo(target, rampSec);
      },
    };
  }

  createSink(bus: BusId, options: SinkOptions = {}): NoteSink {
    const Tone = this.requireTone();
    const out = this.buses.get(bus);
    if (!out) throw new Error(`버스가 없어요: ${bus}. createBus를 먼저 불러야 해요`);
    // 세계 소리는 한 받이에 목소리가 많이 필요하지 않다. 미리 만들어 두는 수를 줄여 소리 켜기를 가볍게 한다
    const world = bus !== 'task' && bus !== 'ui';
    // 자연음(강, 바람)은 소음을 거른 목소리이고, 나머지는 배음으로 만든 목소리다
    const sink = isNoiseTimbre(options.timbre)
      ? new ToneNoiseSink(Tone, out, { ...options, warmVoices: 1, maxVoices: 4 })
      : new ToneVoiceSink(Tone, out, { ...options, ...(world ? { warmVoices: 2, maxVoices: 12 } : {}) });
    this.sinks.push(sink);
    return sink;
  }

  setMasterDb(db: number, rampSec: number): void {
    const Tone = this.requireTone();
    const target = dbToGain(db);
    this.master!.gain.cancelScheduledValues(Tone.immediate());
    if (rampSec <= 0) this.master!.gain.value = target;
    else this.master!.gain.rampTo(target, rampSec);
  }

  dispose(): void {
    for (const s of this.sinks) s.dispose();
    this.sinks = [];
    for (const id of BUS_IDS) this.buses.get(id)?.dispose();
    this.buses.clear();
    this.master?.dispose();
    this.master = null;
    this.Tone = null;
  }

  private requireTone(): ToneModule {
    if (!this.Tone || !this.master) throw new Error('엔진이 시작되지 않았어요');
    return this.Tone;
  }
}
