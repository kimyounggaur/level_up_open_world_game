// 4-5 실제 믹서와 가짜 엔진으로: 소리 켜기 전에는 장치가 없다(W-11), 켠 뒤 세계 소리가 세계 버스로 나가고,
// 과제 소리가 나는 동안 세계 소리가 12 dB 줄고 끝나면 되돌아온다(W-7, 4-5 완료 기준 '과제를 듣는 동안 세계 소리가 줄어든다').
import { describe, expect, it } from 'vitest';
import { WorldClock } from '@/audio/clock';
import { BUS_DEFAULT_DB, DUCK_ATTACK_SEC, DUCK_DB, DUCK_RELEASE_SEC, Mixer, WORLD_BUSES, volumeToDb } from '@/audio/mixer';
import { WorldAudio } from '@/audio/worldAudio';
import type { SoundStation } from '@/audio/worldAudio';
import { BAR_SEC } from '@/domain/worldsound';
import { FakeClock, FakeEngine, FakeTimer } from './audio-fakes';

const T0 = 1000;
const STATIONS: SoundStation[] = [
  { stationId: 'H3', regionId: 'village', x: 4800, y: 3500 },
  { stationId: 'H4', regionId: 'village', x: 5200, y: 3500 },
];

function rig() {
  const mono = new FakeClock(T0);
  const engine = new FakeEngine();
  let created = 0;
  const mixer = new Mixer({
    createEngine: () => {
      created++;
      return engine;
    },
    monotonicNow: () => mono.now(),
    setTimer: () => () => undefined,
  });
  const timer = new FakeTimer();
  const world = new WorldClock(mixer.clock, T0);
  const audio = new WorldAudio({
    mixer,
    clock: world,
    timer,
    stations: STATIONS,
    reaction: () => ({ villageLayer: 1, lanterns: {} }),
    listener: () => ({ x: 5000, y: 3500, regionId: 'village' }),
  });
  const run = (sec: number): void => {
    const end = mono.t + sec;
    while (mono.t < end - 1e-9) {
      mono.t = Math.min(end, mono.t + 0.025);
      engine.clock.t += 0.025;
      timer.fire();
    }
  };
  return { mono, engine, mixer, timer, audio, run, created: () => created };
}

describe('W-11 세계 소리는 소리 켜기 전에 오디오 장치를 만들지 않는다', () => {
  it('켜기 전: 엔진을 만들지도 시작하지도 않고, 타이머도 돌지 않는다', () => {
    const r = rig();
    r.run(60);
    expect(r.created()).toBe(0);
    expect(r.engine.startCalls).toBe(0);
    expect(r.engine.sinkLog).toEqual([]);
    expect(r.timer.activeCount).toBe(0);
    expect(r.audio.debug().running).toBe(false);
  });

  it('켜기가 실패해도(막힘) 세계 소리는 돌지 않고 오류도 없다', async () => {
    const r = rig();
    r.engine.startError = Object.assign(new Error('막힘'), { name: 'NotAllowedError' });
    await r.mixer.enable();
    expect(r.mixer.state).toBe('failed');
    r.run(30);
    expect(r.audio.debug().running).toBe(false);
    expect(r.audio.debug().notesScheduled).toBe(0);
  });
});

describe('소리를 켠 뒤', () => {
  it('세계 소리가 시작되고 세계 버스의 소리 받이로 나간다. 서명 소리는 좌우를 낸다', async () => {
    const r = rig();
    await r.mixer.enable();
    expect(r.mixer.state).toBe('on');
    expect(r.audio.debug().running).toBe(true);
    r.run(30);
    const log = r.engine.sinkLog;
    const worldLog = log.filter((l) => l.bus === 'worldLayer' || (l.bus === 'worldSignature' && l.options.timbre));
    expect(worldLog.map((l) => `${l.bus}:${l.options.timbre}`).sort()).toEqual(['worldLayer:pad', 'worldLayer:thump', 'worldSignature:bell']);
    expect(worldLog.find((l) => l.bus === 'worldSignature')!.options.pan).toBe(true);
    for (const l of worldLog) expect((WORLD_BUSES as readonly string[]).includes(l.bus)).toBe(true);
    for (const l of worldLog) expect(l.sink.requests.length).toBeGreaterThan(0);
  });

  it('시각을 오디오 장치의 시각으로 옮겨서 보낸다', async () => {
    const r = rig();
    await r.mixer.enable();
    r.run(7);
    const pulse = r.engine.sinkLog.find((l) => l.options.timbre === 'thump')!.sink;
    const offset = r.engine.now() - r.mono.now();
    for (const q of pulse.requests) {
      // 장치의 시각은 마디 격자(T0 기준)에 옮긴 만큼 어긋나 있다: 모두 0.75초 격자에 맞는다
      const grid = (q.time - offset - T0) / 0.75;
      expect(Math.abs(grid - Math.round(grid))).toBeLessThan(1e-6);
      expect(q.time).toBeGreaterThanOrEqual(q.requestedAt - 1e-6); // 과거로 예약하지 않는다(장치의 시각 기준)
    }
  });

  it('과제 소리가 나는 동안 세계 버스 셋이 12 dB 줄고, 끝나면 0.6초에 걸쳐 되돌아온다', async () => {
    const r = rig();
    await r.mixer.enable();
    r.run(4);
    const base = (id: 'worldBed' | 'worldLayer' | 'worldSignature') => BUS_DEFAULT_DB[id] + volumeToDb(0.5);
    for (const id of WORLD_BUSES) expect(r.engine.lastBusDb(id)).toBeCloseTo(base(id as never), 6);
    const end = r.mixer.beginTaskSound();
    expect(r.mixer.ducked).toBe(true);
    for (const id of WORLD_BUSES) {
      expect(r.engine.lastBusDb(id)).toBeCloseTo(base(id as never) + DUCK_DB, 6);
      expect(r.engine.lastBusCall(id).ramp).toBe(DUCK_ATTACK_SEC);
    }
    // 세계 소리는 계속 예약되지만(버스가 줄인다) 과제 버스는 줄지 않는다
    expect(r.engine.lastBusDb('task')).toBe(BUS_DEFAULT_DB.task);
    r.run(7);
    expect(r.audio.debug().running).toBe(true);
    end();
    for (const id of WORLD_BUSES) {
      expect(r.engine.lastBusDb(id)).toBeCloseTo(base(id as never), 6);
      expect(r.engine.lastBusCall(id).ramp).toBe(DUCK_RELEASE_SEC);
    }
  });

  it("'과제 중 배경 끄기'를 고르면 과제 소리가 나는 동안 세계 버스가 아예 꺼진다", async () => {
    const r = rig();
    await r.mixer.enable();
    r.mixer.setSettings({ muteWorldDuringQuest: true });
    const end = r.mixer.beginTaskSound();
    for (const id of WORLD_BUSES) expect(r.engine.lastBusDb(id)).toBe(-Infinity);
    end();
    for (const id of WORLD_BUSES) expect(r.engine.lastBusDb(id)).toBeGreaterThan(-40);
  });

  it('음소거하면 세계 소리가 멈추고, 풀면 격자에 맞춰 다시 흐른다', async () => {
    const r = rig();
    await r.mixer.enable();
    r.run(7);
    r.mixer.setMuted(true);
    expect(r.audio.debug().running).toBe(false);
    const n = r.audio.debug().notesScheduled;
    r.run(10);
    expect(r.audio.debug().notesScheduled).toBe(n);
    r.mixer.setMuted(false);
    expect(r.audio.debug().running).toBe(true);
    r.run(7);
    expect(r.audio.debug().notesScheduled).toBeGreaterThan(n);
    // 격자는 그대로다: 마디 번호가 시각에서 바로 나온다
    expect(r.audio.debug().bar).toBe(Math.floor((r.mono.now() - T0) / BAR_SEC + 1e-9));
  });

  it('배경 소리 크기(worldVolume)를 바꾸면 세계 버스 셋이 따라간다', async () => {
    const r = rig();
    await r.mixer.enable();
    r.mixer.setSettings({ worldVolume: 0.25 });
    for (const id of WORLD_BUSES) expect(r.engine.lastBusDb(id)).toBeCloseTo(BUS_DEFAULT_DB[id] + volumeToDb(0.25), 6);
  });

  it('dispose 뒤에 엔진이 다시 만들어져도 받이는 새로 만들어진다', async () => {
    const r = rig();
    await r.mixer.enable();
    r.run(7);
    const first = r.engine.sinkLog.length;
    r.mixer.dispose();
    expect(r.audio.debug().running).toBe(false);
    await r.mixer.enable();
    r.run(7);
    expect(r.engine.sinkLog.length).toBeGreaterThan(first);
    expect(r.audio.debug().running).toBe(true);
  });
});
