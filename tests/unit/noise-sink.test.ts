// 6-8 자연음(강물 소리, 바람 소리) 소리 받이와, 엔진이 음색에 맞는 소리 받이를 고르는 일을 가짜 Tone으로 시험한다(설계서 8.1 '세계 바탕').
// 실제로 어떤 소리가 나는지, 크기와 질감이 어울리는지는 귀로 듣는 점검의 몫이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToneEngine } from '@/audio/engine';
import { FADE_OUT_SEC, NATURE_TIMBRES, TASK_TIMBRE, TIMBRES, ToneNoiseSink, ToneVoiceSink, dbToGain, midiToHz } from '@/audio/instruments';
import { BUS_IDS } from '@/audio/mixer';
import { NOISE_TIMBRE_IDS, isNoiseTimbre } from '@/audio/types';
import type { NoiseTimbreId } from '@/audio/types';
import { NATURE_CENTER_MIDI } from '@/domain/worldsound';
import { fakeTone, makeFakeTone } from './tone-fakes';

vi.mock('tone', async () => (await import('./tone-fakes')).fakeTone.module as unknown as Record<string, unknown>);

function noiseRig(timbre: NoiseTimbreId = 'river', extra: { warmVoices?: number; maxVoices?: number } = {}) {
  const fake = makeFakeTone();
  const out = new fake.module.Gain(1);
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const sink = new ToneNoiseSink(fake.module, out, {
    timbre,
    nowFn: () => fake.state.now,
    setTimer: (fn, ms) => void timers.push({ fn, ms }),
    ...extra,
  });
  return { fake, out, sink, timers };
}

const note = (id: string, midi: number, time: number, duration = 3, velocity = 0.5) => ({ id, midi, time, duration, velocity });

describe('자연음의 이름과 모양', () => {
  it('자연음의 이름, 모양 정의, 거르는 높이의 기준(음)은 같은 이름들이다', () => {
    expect([...NOISE_TIMBRE_IDS].sort()).toEqual(Object.keys(NATURE_TIMBRES).sort());
    expect([...NOISE_TIMBRE_IDS].sort()).toEqual(Object.keys(NATURE_CENTER_MIDI).sort());
    expect(isNoiseTimbre('river')).toBe(true);
    expect(isNoiseTimbre('wind')).toBe(true);
    for (const id of ['task', 'pad', 'thump', 'tick', 'bass', 'bell'] as const) expect(isNoiseTimbre(id)).toBe(false);
    expect(isNoiseTimbre(undefined)).toBe(false);
  });

  it('배음 음색 표에는 타악(tick)과 베이스(bass)가 있고 자연음 이름은 섞이지 않는다', () => {
    expect(Object.keys(TIMBRES)).toEqual(expect.arrayContaining(['tick', 'bass']));
    for (const id of NOISE_TIMBRE_IDS) expect(Object.keys(TIMBRES)).not.toContain(id);
    // 타악은 남는 소리 없이 짧게 끝나고, 베이스는 길게 울린다
    expect(TIMBRES.tick.envelope.sustain).toBe(0);
    expect(TIMBRES.tick.envelope.decay + TIMBRES.tick.envelope.release).toBeLessThan(0.15);
    expect(TIMBRES.bass.envelope.sustain).toBeGreaterThan(0);
    expect(TIMBRES.bass.envelope.decay).toBeGreaterThan(0.3);
  });

  it('강은 분홍 소음의 띠 거르개, 바람은 갈색 소음의 낮은 거르개다. 둘 다 일었다 잦아드는 데 1초 안팎이 걸린다', () => {
    expect(NATURE_TIMBRES.river.noise).toBe('pink');
    expect(NATURE_TIMBRES.river.filter.type).toBe('bandpass');
    expect(NATURE_TIMBRES.wind.noise).toBe('brown');
    expect(NATURE_TIMBRES.wind.filter.type).toBe('lowpass');
    for (const id of NOISE_TIMBRE_IDS) {
      expect(NATURE_TIMBRES[id].envelope.attack).toBeGreaterThanOrEqual(0.5);
      expect(NATURE_TIMBRES[id].envelope.release).toBeGreaterThanOrEqual(1);
      // 소음의 원음은 작고 거르면 더 줄어서 올려 둔다(진짜 Chrome에서 잰 값. phase6-layers.flow.ts가 화음 깔기와의 균형을 본다)
      expect(Math.abs(NATURE_TIMBRES[id].trimDb)).toBeLessThanOrEqual(24);
    }
  });
});

describe('ToneNoiseSink: 소음을 걸러 만드는 목소리', () => {
  it('강과 바람은 각자의 소음 종류와 거르개와 모양으로 목소리를 만든다', () => {
    for (const id of NOISE_TIMBRE_IDS) {
      const { fake, sink } = noiseRig(id);
      const def = NATURE_TIMBRES[id];
      expect(sink.voiceCount).toBe(1);
      const synth = fake.created.NoiseSynth[0]!;
      expect(synth.options.noise?.type).toBe(def.noise);
      expect(synth.options.envelope).toEqual(def.envelope);
      const filter = fake.created.Filter[0]!;
      expect(filter.options.type).toBe(def.filter.type);
      expect(filter.options.Q).toBe(def.filter.q);
      // 목소리 → 거르개 → 목소리 크기 → 받이 전체 크기 → 버스
      expect(synth.outputs).toEqual([filter]);
      expect(filter.outputs).toEqual([fake.created.Gain[2]]);
    }
  });

  it('목소리 크기는 소음을 낮춘 값이고, 받이 전체 크기(trim)는 버스에 이어진다', () => {
    const { fake, out } = noiseRig('river');
    const [bus, trim, voiceOut] = fake.created.Gain;
    expect(bus).toBe(out);
    expect(trim!.gain.value).toBe(1);
    expect(trim!.outputs).toEqual([out]);
    expect(voiceOut!.gain.value).toBeCloseTo(dbToGain(NATURE_TIMBRES.river.trimDb), 9);
    expect(voiceOut!.outputs).toEqual([trim]);
  });

  it('음을 받으면 그 음의 높이를 거르는 가운데 주파수로 쓴다(음이 아니라 거르는 높이)', () => {
    const { fake, sink } = noiseRig('river');
    sink.schedule(note('a', NATURE_CENTER_MIDI.river, 10, 3, 0.5));
    const filter = fake.created.Filter[0]!;
    expect(filter.frequency.only('set')).toEqual([[midiToHz(NATURE_CENTER_MIDI.river), 10]]);
    expect(fake.created.NoiseSynth[0]!.triggers).toEqual([{ duration: 3, time: 10, velocity: 0.5 }]);

    const wind = noiseRig('wind');
    wind.sink.schedule(note('b', NATURE_CENTER_MIDI.wind, 4, 3, 0.5));
    expect(wind.fake.created.Filter[0]!.frequency.only('set')).toEqual([[midiToHz(NATURE_CENTER_MIDI.wind), 4]]);
    // 바람은 낮게(C4, 약 262 Hz), 강물은 높게(B5, 약 988 Hz) 거른다
    expect(midiToHz(NATURE_CENTER_MIDI.wind)).toBeCloseTo(261.63, 1);
    expect(midiToHz(NATURE_CENTER_MIDI.river)).toBeCloseTo(987.77, 1);
  });

  it('세기는 0–1로, 길이는 0.01초 이상으로 맞춘다', () => {
    const { fake, sink } = noiseRig('river');
    sink.schedule(note('hi', 83, 1, 3, 2));
    sink.schedule(note('lo', 83, 20, 0, -1));
    const triggers = fake.created.NoiseSynth.flatMap((s) => s.triggers);
    expect(triggers.map((t) => t.velocity).sort()).toEqual([0, 1]);
    expect(Math.min(...triggers.map((t) => t.duration))).toBe(0.01);
  });

  it('한 마디(3초)씩 이어 가는 소음은 잦아드는 동안 겹쳐서 목소리가 둘이 되고, 충분히 떨어진 음은 처음 목소리를 다시 쓴다', () => {
    const { fake, sink } = noiseRig('river');
    const release = NATURE_TIMBRES.river.envelope.release;
    sink.schedule(note('a', 83, 10, 3));
    expect(sink.voiceCount).toBe(1);
    // 첫 소음은 10 + 3 + release(1.2)초까지 바쁘다. 3초 뒤의 다음 마디 소음은 겹친다
    sink.schedule(note('b', 83, 13, 3));
    expect(sink.voiceCount).toBe(2);
    expect(fake.created.NoiseSynth[0]!.triggers).toHaveLength(1);
    expect(fake.created.NoiseSynth[1]!.triggers).toHaveLength(1);
    // 첫 소음이 잦아든 뒤(10 + 3 + release)에는 첫 목소리를 다시 쓴다
    sink.schedule(note('c', 83, 10 + 3 + release + 0.5, 3));
    expect(sink.voiceCount).toBe(2);
    expect(fake.created.NoiseSynth[0]!.triggers).toHaveLength(2);
  });

  it('목소리가 한도에 이르면 가장 먼저 끝나는 목소리를 이 음의 시작에서 자르고 쓴다', () => {
    const { fake, sink } = noiseRig('river', { maxVoices: 2 });
    sink.schedule(note('a', 83, 10, 3)); // 14.2초까지
    sink.schedule(note('b', 83, 11, 3)); // 15.2초까지
    expect(sink.voiceCount).toBe(2);
    sink.schedule(note('c', 83, 12, 3));
    expect(sink.voiceCount).toBe(2);
    const [first, second] = fake.created.NoiseSynth;
    expect(first!.releases).toEqual([12]);
    expect(first!.triggers.map((t) => t.time)).toEqual([10, 12]);
    expect(second!.releases).toEqual([]);
  });

  it('기본 한도는 4개다: 다섯 번째 겹침은 새 목소리를 만들지 않는다', () => {
    const { sink } = noiseRig('wind');
    for (let i = 0; i < 6; i++) sink.schedule(note(`n${i}`, 60, 10 + i * 0.5, 3));
    expect(sink.voiceCount).toBe(4);
  });

  describe('cancelAll', () => {
    it('쉬는 목소리는 그대로 둔다', () => {
      const { fake, sink, timers } = noiseRig('river');
      sink.cancelAll();
      expect(sink.voiceCount).toBe(1);
      expect(fake.created.NoiseSynth).toHaveLength(1);
      expect(fake.created.NoiseSynth[0]!.disposed).toBe(false);
      expect(timers).toEqual([]);
    });

    it('아직 시작하지 않은 음은 소리가 난 적이 없으니 바로 버리고 새 목소리로 바꾼다', () => {
      const { fake, sink, timers } = noiseRig('river');
      fake.state.now = 0;
      sink.schedule(note('a', 83, 5, 3));
      sink.cancelAll();
      expect(fake.created.NoiseSynth[0]!.disposed).toBe(true);
      expect(fake.created.Filter[0]!.disposed).toBe(true);
      expect(sink.voiceCount).toBe(1);
      expect(fake.created.NoiseSynth).toHaveLength(2);
      expect(fake.created.NoiseSynth[1]!.disposed).toBe(false);
      expect(timers).toEqual([]);
    });

    it('울리는 음은 짧게 줄여 끄고(20 ms) 조금 뒤에 치운다', () => {
      const { fake, sink, timers } = noiseRig('river');
      fake.state.now = 0;
      sink.schedule(note('a', 83, 0, 3));
      fake.state.now = 1;
      sink.cancelAll();
      const [, , voiceOut] = fake.created.Gain;
      expect(voiceOut!.gain.only('cancel')).toEqual([[1]]);
      expect(voiceOut!.gain.only('linearRamp')).toEqual([[0, 1 + FADE_OUT_SEC]]);
      expect(fake.created.NoiseSynth[0]!.disposed).toBe(false);
      expect(timers).toHaveLength(1);
      expect(timers[0]!.ms).toBeGreaterThanOrEqual(FADE_OUT_SEC * 1000);
      timers[0]!.fn();
      expect(fake.created.NoiseSynth[0]!.disposed).toBe(true);
      // 이어서 새 목소리가 받는다
      expect(sink.voiceCount).toBe(1);
      expect(fake.created.NoiseSynth).toHaveLength(2);
    });

    it('이미 잦아든 소음의 목소리는 건드리지 않는다', () => {
      const { fake, sink } = noiseRig('river');
      fake.state.now = 0;
      sink.schedule(note('a', 83, 0, 3));
      fake.state.now = 3 + NATURE_TIMBRES.river.envelope.release + 0.1;
      sink.cancelAll();
      expect(fake.created.NoiseSynth).toHaveLength(1);
      expect(fake.created.NoiseSynth[0]!.disposed).toBe(false);
    });
  });

  describe('setLevel(받이 전체의 크기)', () => {
    it('무음으로 2초에 걸쳐 잦아들고, 0 dB로 2초에 걸쳐 일어선다(지역 경계의 섞임, 8.1)', () => {
      const { fake, sink } = noiseRig('river');
      const trim = fake.created.Gain[1]!;
      fake.state.now = 7;
      sink.setLevel(-Infinity, 2);
      expect(trim.gain.only('cancel')).toEqual([[7]]);
      expect(trim.gain.only('rampTo')).toEqual([[0, 2]]);
      sink.setLevel(0, 2);
      expect(trim.gain.only('rampTo')).toEqual([[0, 2], [1, 2]]);
    });

    it('걸리는 시간이 0이면 바로 바꾼다', () => {
      const { fake, sink } = noiseRig('wind');
      const trim = fake.created.Gain[1]!;
      sink.setLevel(-6, 0);
      expect(trim.gain.value).toBeCloseTo(dbToGain(-6), 9);
      expect(trim.gain.only('rampTo')).toEqual([]);
    });
  });

  it('dispose는 목소리와 받이 전체의 크기를 치운다', () => {
    const { fake, sink } = noiseRig('river');
    sink.schedule(note('a', 83, 1, 3));
    sink.schedule(note('b', 83, 2, 3));
    sink.dispose();
    expect(sink.voiceCount).toBe(0);
    for (const n of fake.created.NoiseSynth) expect(n.disposed).toBe(true);
    for (const f of fake.created.Filter) expect(f.disposed).toBe(true);
    // 첫 Gain은 시험 쪽이 만든 버스이고, 나머지(받이 전체 크기, 목소리 크기)는 치워진다
    for (const g of fake.created.Gain.slice(1)) expect(g.disposed).toBe(true);
    expect(fake.created.Gain[0]!.disposed).toBe(false);
  });

  it('자연음이 아닌 이름으로는 만들 수 없고, 배음 소리 받이는 자연음 이름을 받지 않는다', () => {
    const fake = makeFakeTone();
    const out = new fake.module.Gain(1);
    expect(() => new ToneNoiseSink(fake.module, out, { timbre: 'pad' })).toThrow();
    expect(() => new ToneNoiseSink(fake.module, out, {})).toThrow();
    expect(() => new ToneVoiceSink(fake.module, out, { timbre: 'river' })).toThrow();
    expect(() => new ToneVoiceSink(fake.module, out, { timbre: 'wind' })).toThrow();
    expect(() => new ToneVoiceSink(fake.module, out, { timbre: 'tick' })).not.toThrow();
    expect(() => new ToneVoiceSink(fake.module, out, { timbre: 'bass' })).not.toThrow();
  });
});

describe('엔진은 음색에 맞는 소리 받이를 만든다', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', class {});
    fakeTone.reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function started(): Promise<ToneEngine> {
    const engine = new ToneEngine();
    await engine.start();
    for (const id of BUS_IDS) engine.createBus(id, -18);
    return engine;
  }

  it('강물과 바람은 소음 목소리 하나를 데워 둔 자연음 소리 받이이고, 배음 목소리는 만들지 않는다', async () => {
    const engine = await started();
    const synths = fakeTone.created.Synth.length;
    const noises = fakeTone.created.NoiseSynth.length;
    const river = engine.createSink('worldBed', { timbre: 'river' });
    const wind = engine.createSink('worldBed', { timbre: 'wind' });
    expect(river).toBeInstanceOf(ToneNoiseSink);
    expect(wind).toBeInstanceOf(ToneNoiseSink);
    expect(fakeTone.created.NoiseSynth.length - noises).toBe(2);
    expect(fakeTone.created.Synth.length - synths).toBe(0);
    expect(fakeTone.created.Filter.map((f) => f.options.type)).toEqual(['bandpass', 'lowpass']);
    engine.dispose();
  });

  it('타악(tick), 베이스(bass), 화음(pad)은 배음 소리 받이다: 세계 버스에는 목소리를 둘씩 데워 둔다', async () => {
    const engine = await started();
    for (const timbre of ['tick', 'bass', 'pad'] as const) {
      const synths = fakeTone.created.Synth.length;
      const noises = fakeTone.created.NoiseSynth.length;
      const sink = engine.createSink('worldLayer', { timbre });
      expect(sink, timbre).toBeInstanceOf(ToneVoiceSink);
      expect(fakeTone.created.Synth.length - synths, timbre).toBe(2);
      expect(fakeTone.created.NoiseSynth.length - noises, timbre).toBe(0);
      const partials = (fakeTone.created.Synth[synths]!.options.oscillator as { partials: number[] }).partials;
      expect(partials, timbre).toEqual([...TIMBRES[timbre].partials]);
    }
    engine.dispose();
  });

  it('과제 버스의 소리 받이는 전처럼 과제 음색으로 여섯 목소리를 데워 둔다', async () => {
    const engine = await started();
    const synths = fakeTone.created.Synth.length;
    const sink = engine.createSink('task');
    expect(sink).toBeInstanceOf(ToneVoiceSink);
    expect(fakeTone.created.Synth.length - synths).toBe(6);
    expect((fakeTone.created.Synth[synths]!.options.oscillator as { partials: number[] }).partials).toEqual([...TASK_TIMBRE.partials]);
    engine.dispose();
  });

  it('엔진을 치우면 만든 노드를 모두 치운다', async () => {
    const engine = await started();
    engine.createSink('worldBed', { timbre: 'river' });
    engine.createSink('worldBed', { timbre: 'pad' });
    engine.createSink('worldLayer', { timbre: 'tick' });
    engine.dispose();
    const all = [...fakeTone.created.Gain, ...fakeTone.created.Synth, ...fakeTone.created.NoiseSynth, ...fakeTone.created.Filter];
    expect(all.length).toBeGreaterThan(10);
    for (const node of all) expect(node.disposed).toBe(true);
  });
});
