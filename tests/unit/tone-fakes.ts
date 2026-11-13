// 소리 받이 시험용 가짜 Tone. 제품 코드가 아니다. ToneVoiceSink와 ToneNoiseSink와 ToneEngine이 쓰는 부분만 흉내 내고,
// 어떤 노드가 만들어졌고 무엇을 불렀는지를 적어 둔다. 실제 소리는 만들지 않는다(귀로 듣는 점검의 몫).
import type { ToneModule } from '@/audio/instruments';

export interface ParamCall {
  op: 'value' | 'cancel' | 'set' | 'linearRamp' | 'rampTo';
  args: number[];
}

/** Tone의 Param. 부른 일을 차례대로 적는다 */
export class FakeParam {
  calls: ParamCall[] = [];
  private current: number;
  constructor(value: number) {
    this.current = value;
  }
  get value(): number {
    return this.current;
  }
  set value(v: number) {
    this.current = v;
    this.calls.push({ op: 'value', args: [v] });
  }
  cancelScheduledValues(t: number): this {
    this.calls.push({ op: 'cancel', args: [t] });
    return this;
  }
  setValueAtTime(v: number, t: number): this {
    this.calls.push({ op: 'set', args: [v, t] });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.calls.push({ op: 'linearRamp', args: [v, t] });
    return this;
  }
  rampTo(v: number, seconds: number): this {
    this.calls.push({ op: 'rampTo', args: [v, seconds] });
    return this;
  }
  /** 어떤 일만 걸러서 */
  only(op: ParamCall['op']): number[][] {
    return this.calls.filter((c) => c.op === op).map((c) => c.args);
  }
}

class FakeNode {
  disposed = false;
  toDestinationCalled = false;
  readonly outputs: FakeNode[] = [];
  /** Tone처럼 부른 쪽(this)을 돌려준다 */
  connect(dest: FakeNode): this {
    this.outputs.push(dest);
    return this;
  }
  toDestination(): this {
    this.toDestinationCalled = true;
    return this;
  }
  dispose(): this {
    this.disposed = true;
    return this;
  }
}

export class FakeGain extends FakeNode {
  readonly gain: FakeParam;
  constructor(gain = 1) {
    super();
    this.gain = new FakeParam(gain);
  }
}

export class FakePanner extends FakeNode {
  readonly pan: FakeParam;
  constructor(pan = 0) {
    super();
    this.pan = new FakeParam(pan);
  }
}

export interface SynthTrigger {
  /** 배음 합성음은 음높이(Hz), 소음 합성음은 없다 */
  hz?: number;
  duration: number;
  time: number;
  velocity: number;
}

export class FakeSynth extends FakeNode {
  readonly triggers: SynthTrigger[] = [];
  readonly releases: number[] = [];
  constructor(readonly options: Record<string, unknown> = {}) {
    super();
  }
  triggerAttackRelease(hz: number, duration: number, time: number, velocity: number): this {
    this.triggers.push({ hz, duration, time, velocity });
    return this;
  }
  triggerRelease(time: number): this {
    this.releases.push(time);
    return this;
  }
}

export class FakeNoiseSynth extends FakeNode {
  readonly triggers: SynthTrigger[] = [];
  readonly releases: number[] = [];
  constructor(readonly options: { noise?: { type?: string }; envelope?: Record<string, number> } = {}) {
    super();
  }
  triggerAttackRelease(duration: number, time: number, velocity: number): this {
    this.triggers.push({ duration, time, velocity });
    return this;
  }
  triggerRelease(time: number): this {
    this.releases.push(time);
    return this;
  }
}

export class FakeFilter extends FakeNode {
  readonly frequency: FakeParam;
  constructor(readonly options: { type?: string; frequency?: number; Q?: number } = {}) {
    super();
    this.frequency = new FakeParam(options.frequency ?? 350);
  }
}

export interface Created {
  Gain: FakeGain[];
  Panner: FakePanner[];
  Synth: FakeSynth[];
  NoiseSynth: FakeNoiseSynth[];
  Filter: FakeFilter[];
}

export function makeFakeTone() {
  const created: Created = { Gain: [], Panner: [], Synth: [], NoiseSynth: [], Filter: [] };
  const state = { now: 0 };
  const ctx = { state: 'running', lookAhead: 0.1 };
  class Gain extends FakeGain {
    constructor(gain?: number) {
      super(gain);
      created.Gain.push(this);
    }
  }
  class Panner extends FakePanner {
    constructor(pan?: number) {
      super(pan);
      created.Panner.push(this);
    }
  }
  class Synth extends FakeSynth {
    constructor(options?: Record<string, unknown>) {
      super(options);
      created.Synth.push(this);
    }
  }
  class NoiseSynth extends FakeNoiseSynth {
    constructor(options?: ConstructorParameters<typeof FakeNoiseSynth>[0]) {
      super(options);
      created.NoiseSynth.push(this);
    }
  }
  class Filter extends FakeFilter {
    constructor(options?: ConstructorParameters<typeof FakeFilter>[0]) {
      super(options);
      created.Filter.push(this);
    }
  }
  const module = {
    Gain,
    Panner,
    Synth,
    NoiseSynth,
    Filter,
    immediate: (): number => state.now,
    start: async (): Promise<void> => {},
    getContext: () => ctx,
  };
  return {
    /** ToneVoiceSink, ToneNoiseSink, ToneEngine에 건네는 가짜 Tone */
    module: module as unknown as ToneModule,
    created,
    state,
    ctx,
    /** 만든 노드의 기록을 비운다 */
    reset(): void {
      created.Gain.length = 0;
      created.Panner.length = 0;
      created.Synth.length = 0;
      created.NoiseSynth.length = 0;
      created.Filter.length = 0;
      state.now = 0;
      ctx.state = 'running';
    },
  };
}

/** vi.mock('tone')이 돌려주는 하나뿐인 가짜 Tone(엔진 시험이 쓴다) */
export const fakeTone = makeFakeTone();
