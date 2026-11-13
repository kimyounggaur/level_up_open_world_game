// 6-9c 놀이 악기의 소리(PlayAudio): 돌을 밟으면 그 돌의 음이 밟은 순간에 나고, 메아리 악기는 한 박 뒤에 절반 세기로 한 번 더 난다.
// 가짜 믹서로 무엇을 몇 번 어느 시각에 예약하는지 보고, 실제 믹서와 가짜 엔진으로 W-11(소리 켜기 전에는 장치도 소리도 없다)과 W-7(과제 소리가 나는 동안 줄어든다)을 본다.
// 귀로 듣는 느낌(음색, 크기, 메아리의 어울림)은 손 점검의 몫이다.
import { describe, expect, it } from 'vitest';
import { BUS_DEFAULT_DB, DEFAULT_MIXER_SETTINGS, DUCK_DB, Mixer, WORLD_BUSES, volumeToDb } from '@/audio/mixer';
import { PlayAudio } from '@/audio/playAudio';
import type { PlayMixer, PlayVoice } from '@/audio/playAudio';
import { loadPlayInstruments } from '@/app/discovery-data';
import { PAD_NOTE_SEC, PAD_VELOCITY } from '@/domain/play';
import { BEAT_SEC } from '@/domain/worldsound';
import { FakeClock, FakeEngine, FakeWorldMixer } from './audio-fakes';

const T0 = 1000;
const REAL = loadPlayInstruments('preview');
const DRUM = 'play.beat-river.drum';
const WALL = 'play.bell-grove.echo-wall';
const SLIDE = 'play.staff-hill.pitch-slide';
const PINWHEELS = 'play.scale-trail.pinwheels';
const LILIES = 'play.key-marsh.lily-chorus';

// ───── 가짜 믹서 ─────
function fakeRig(instruments: readonly PlayVoice[] = REAL) {
  const clock = new FakeClock(T0);
  const fm = new FakeWorldMixer(clock);
  const mixer: PlayMixer = { registerWorldSink: (bus, options) => fm.registerWorldSink(bus, options), clock };
  const audio = new PlayAudio(mixer, instruments);
  return { clock, fm, audio };
}

describe('놀이 악기의 소리 예약(가짜 믹서)', () => {
  it('실제 다섯 악기가 있다(지역 차례): 높낮이 미끄럼길(chime), 물방울 북(thump), 메아리 벽(kalimba, 메아리 있음), 바람개비 줄(wood), 연잎 합창(pluck). 메아리는 메아리 벽에만 있다', () => {
    expect(REAL.map((p) => [p.playId, p.timbre, p.echo])).toEqual([
      [SLIDE, 'chime', false],
      [DRUM, 'thump', false],
      [WALL, 'kalimba', true],
      [PINWHEELS, 'wood', false],
      [LILIES, 'pluck', false],
    ]);
  });

  it('새 세 악기(7-4): 돌 하나를 밟으면 그 돌의 음 하나가 그 악기의 음색으로 바로 예약되고, 메아리는 없다', () => {
    for (const [id, timbre] of [[SLIDE, 'chime'], [PINWHEELS, 'wood'], [LILIES, 'pluck']] as const) {
      const inst = REAL.find((p) => p.playId === id)!;
      expect(inst.pads.length, id).toBeGreaterThanOrEqual(2);
      inst.pads.forEach((pad, i) => {
        const r = fakeRig();
        expect(r.audio.strike(id, i + 1), `${id} ${i + 1}번 돌`).toBe(true);
        const sink = r.fm.sinkOf(timbre)!;
        expect(sink.requests, `${id} ${i + 1}번 돌`).toHaveLength(1);
        expect(sink.requests[0], `${id} ${i + 1}번 돌`).toMatchObject({ midi: pad.midi, time: T0, duration: PAD_NOTE_SEC, velocity: PAD_VELOCITY });
        expect(r.fm.registered.map((x) => [x.bus, x.options.timbre])).toEqual([['worldSignature', timbre]]);
      });
      const r = fakeRig();
      expect(r.audio.strike(id, inst.pads.length + 1), `${id} 없는 돌`).toBe(false);
      expect(r.audio.strike(id, 0), `${id} 0번 돌`).toBe(false);
    }
  });

  it('물방울 북의 돌 하나를 밟으면 그 돌의 음 하나가 밟은 시각에 기본 세기로 예약된다', () => {
    const r = fakeRig();
    expect(r.audio.strike(DRUM, 2)).toBe(true); // 2번 돌은 G3(55)
    const sink = r.fm.sinkOf('thump')!;
    expect(sink.requests).toHaveLength(1);
    expect(sink.requests[0]).toMatchObject({ midi: 55, time: T0, duration: PAD_NOTE_SEC, velocity: PAD_VELOCITY });
    expect(r.audio.recent()).toEqual([{ playId: DRUM, pad: 2, midi: 55, time: T0, velocity: 0.75 }]);
  });

  it('소리 받이는 세계 서명 버스에 그 악기의 음색으로 신청된다(과제 소리에 줄어드는 세계 버스, W-7)', () => {
    const r = fakeRig();
    r.audio.strike(DRUM, 1);
    r.audio.strike(WALL, 1);
    expect(r.fm.registered.map((x) => [x.bus, x.options.timbre])).toEqual([['worldSignature', 'thump'], ['worldSignature', 'kalimba']]);
  });

  it('메아리 벽의 돌 하나를 밟으면 바로 한 번, 한 박(0.75초) 뒤에 같은 음이 절반 세기로 한 번 더 예약된다', () => {
    const r = fakeRig();
    expect(r.audio.strike(WALL, 3)).toBe(true); // 3번 돌은 E4(64)
    const reqs = r.fm.sinkOf('kalimba')!.requests;
    expect(reqs).toHaveLength(2);
    expect(reqs[0]).toMatchObject({ midi: 64, time: T0, duration: PAD_NOTE_SEC, velocity: 0.75 });
    expect(reqs[1]).toMatchObject({ midi: 64, time: T0 + BEAT_SEC, duration: PAD_NOTE_SEC, velocity: 0.375 });
    expect(reqs[1]!.time - reqs[0]!.time).toBe(0.75);
  });

  it('시각은 밟은 때의 시계를 따른다: 시계가 흐른 뒤에 밟으면 그만큼 뒤로 예약된다', () => {
    const r = fakeRig();
    r.audio.strike(WALL, 1);
    r.clock.t += 5.5;
    r.audio.strike(WALL, 5);
    const reqs = r.fm.sinkOf('kalimba')!.requests;
    expect(reqs.map((q) => q.time)).toEqual([T0, T0 + 0.75, T0 + 5.5, T0 + 5.5 + 0.75]);
    expect(reqs.map((q) => q.midi)).toEqual([60, 60, 69, 69]);
  });

  it('돌마다 음이 다르다: 메아리 벽 다섯 돌은 C4 D4 E4 G4 A4, 물방울 북 네 돌은 C3 G3 C4 E4', () => {
    const r = fakeRig();
    for (let pad = 1; pad <= 5; pad++) r.audio.strike(WALL, pad);
    for (let pad = 1; pad <= 4; pad++) r.audio.strike(DRUM, pad);
    const wall = r.fm.sinkOf('kalimba')!.requests.filter((q) => q.velocity === 0.75).map((q) => q.midi);
    const drum = r.fm.sinkOf('thump')!.requests.map((q) => q.midi);
    expect(wall).toEqual([60, 62, 64, 67, 69]);
    expect(drum).toEqual([48, 55, 60, 64]);
  });

  it('모르는 악기나 없는 돌이면 false이고 아무것도 예약하지 않고 받이도 만들지 않는다', () => {
    const r = fakeRig();
    expect(r.audio.strike('play.beat-river.nothing', 1)).toBe(false);
    expect(r.audio.strike(DRUM, 0)).toBe(false);
    expect(r.audio.strike(DRUM, 5)).toBe(false);
    expect(r.audio.strike(WALL, 6)).toBe(false);
    expect(r.audio.strike(WALL, -1)).toBe(false);
    expect(r.fm.registered).toEqual([]);
    expect(r.audio.recent()).toEqual([]);
  });

  it('받이는 음색마다 처음 쓸 때 하나만 만든다. 같은 음색의 악기는 받이를 함께 쓴다', () => {
    const twin: PlayVoice = { playId: 'play.test.twin', timbre: 'thump', echo: false, pads: [{ dx: 0, dy: 0, midi: 60 }] };
    const r = fakeRig([...REAL, twin]);
    expect(r.fm.registered).toEqual([]); // 밟기 전에는 신청하지 않는다
    r.audio.strike(DRUM, 1);
    r.audio.strike(DRUM, 2);
    r.audio.strike('play.test.twin', 1);
    expect(r.fm.registered).toHaveLength(1);
    expect(r.fm.sinkOf('thump')!.requests.map((q) => q.midi)).toEqual([48, 55, 60]);
    r.audio.strike(WALL, 1);
    expect(r.fm.registered).toHaveLength(2);
  });

  it('예약한 음마다 id가 겹치지 않는다', () => {
    const r = fakeRig();
    for (let i = 0; i < 6; i++) r.audio.strike(WALL, (i % 5) + 1);
    const ids = r.fm.sinkOf('kalimba')!.requests.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^play-play\.bell-grove\.echo-wall-1-/);
  });

  it('최근 기록은 64개까지만 남긴다', () => {
    const r = fakeRig();
    for (let i = 0; i < 50; i++) r.audio.strike(WALL, 1); // 두 음씩 100개
    expect(r.audio.recent()).toHaveLength(64);
    expect(r.fm.sinkOf('kalimba')!.requests).toHaveLength(100);
  });

  it('dispose하면 아직 울리지 않은 예약(메아리)을 지우고, 그 뒤로는 소리를 내지 않는다', () => {
    const r = fakeRig();
    r.audio.strike(WALL, 2);
    const sink = r.fm.sinkOf('kalimba')!;
    r.clock.t += 0.7; // 첫 음은 끝났고(0.6초) 메아리(0.75초 뒤)는 아직이다
    expect(sink.pending()).toHaveLength(1);
    r.audio.dispose();
    expect(sink.cancelCalls).toBe(1);
    expect(sink.pending()).toEqual([]);
    expect(sink.requests[1]!.cancelled).toBe(true);
    expect(sink.requests[0]!.cancelled).toBe(false); // 이미 끝난 음은 건드리지 않는다
    expect(r.audio.strike(WALL, 2)).toBe(false);
    expect(sink.requests).toHaveLength(2);
  });

  it('한 번도 밟지 않고 dispose해도 오류가 없다. 두 번 해도 같다', () => {
    const r = fakeRig();
    expect(() => {
      r.audio.dispose();
      r.audio.dispose();
    }).not.toThrow();
    expect(r.audio.strike(DRUM, 1)).toBe(false);
    expect(r.fm.registered).toEqual([]);
  });

  it('악기가 하나도 없으면 어떤 돌도 소리를 내지 않는다', () => {
    const r = fakeRig([]);
    expect(r.audio.strike(DRUM, 1)).toBe(false);
  });
});

// ───── 실제 믹서 + 가짜 엔진 ─────
function realRig() {
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
  const audio = new PlayAudio(mixer, REAL);
  const sinks = (timbre: string) => engine.sinkLog.filter((l) => l.bus === 'worldSignature' && l.options.timbre === timbre);
  return { mono, engine, mixer, audio, created: () => created, sinks };
}

describe('W-11 소리를 켜기 전에는 장치도 소리도 없다', () => {
  it('켜기 전에 돌을 밟아도 엔진을 만들지 않고 아무것도 예약하지 않는다. 밟았다는 것은 아는 악기라 true다', () => {
    const r = realRig();
    expect(r.audio.strike(DRUM, 1)).toBe(true);
    expect(r.audio.strike(WALL, 2)).toBe(true);
    expect(r.created()).toBe(0);
    expect(r.engine.startCalls).toBe(0);
    expect(r.engine.sinkLog).toEqual([]);
  });

  it('켜기가 막혀도(failed) 소리도 오류도 없다', async () => {
    const r = realRig();
    r.engine.startError = Object.assign(new Error('막힘'), { name: 'NotAllowedError' });
    await r.mixer.enable();
    expect(r.mixer.state).toBe('failed');
    expect(() => r.audio.strike(WALL, 1)).not.toThrow();
    expect(r.engine.sinkLog.filter((l) => l.options.timbre === 'kalimba').flatMap((l) => l.sink.requests)).toEqual([]);
  });

  it('소리를 켠 뒤에는 장치의 시각으로 옮겨서 예약한다(밟은 시각 + 장치와 시계의 차이)', async () => {
    const r = realRig();
    await r.mixer.enable();
    expect(r.mixer.state).toBe('on');
    r.audio.strike(DRUM, 3);
    const sink = r.sinks('thump');
    expect(sink).toHaveLength(1);
    const offset = r.engine.clock.now() - r.mono.now();
    expect(sink[0]!.sink.requests).toHaveLength(1);
    expect(sink[0]!.sink.requests[0]).toMatchObject({ midi: 60, time: T0 + offset, velocity: 0.75, duration: PAD_NOTE_SEC });
  });

  it('소리를 켠 뒤 메아리 벽은 두 음을 장치의 시각으로 한 박 간격으로 예약한다', async () => {
    const r = realRig();
    await r.mixer.enable();
    r.audio.strike(WALL, 4);
    const reqs = r.sinks('kalimba')[0]!.sink.requests;
    const offset = r.engine.clock.now() - r.mono.now();
    expect(reqs.map((q) => [q.midi, q.time, q.velocity])).toEqual([[67, T0 + offset, 0.75], [67, T0 + offset + 0.75, 0.375]]);
  });

  it('음소거하면 소리를 내지 않고, 풀면 다시 난다', async () => {
    const r = realRig();
    await r.mixer.enable();
    r.audio.strike(DRUM, 1);
    const sink = r.sinks('thump')[0]!.sink;
    expect(sink.requests).toHaveLength(1);
    r.mixer.setMuted(true);
    r.audio.strike(DRUM, 2);
    expect(sink.requests).toHaveLength(1);
    r.mixer.setMuted(false);
    r.audio.strike(DRUM, 3);
    expect(sink.requests.map((q) => q.midi)).toEqual([48, 60]);
  });
});

describe('W-7 과제 소리가 나는 동안 놀이 악기 소리도 줄어든다', () => {
  it('놀이 악기의 소리 받이는 세계 서명 버스로 나가고, 세계 서명 버스는 과제 소리 동안 12 dB 줄어든다', async () => {
    const r = realRig();
    await r.mixer.enable();
    expect(WORLD_BUSES).toContain('worldSignature');
    r.audio.strike(WALL, 1);
    expect(r.sinks('kalimba')).toHaveLength(1);
    // 배경 소리 크기(기본 0.5)가 더해진 세계 서명 버스의 크기에서 과제 소리 동안 12 dB 줄어든다
    const before = BUS_DEFAULT_DB.worldSignature + volumeToDb(DEFAULT_MIXER_SETTINGS.worldVolume);
    expect(r.engine.lastBusDb('worldSignature')).toBeCloseTo(before, 6);
    const end = r.mixer.beginTaskSound();
    expect(r.engine.lastBusDb('worldSignature')).toBeCloseTo(before + DUCK_DB, 6);
    end();
    expect(r.engine.lastBusDb('worldSignature')).toBeCloseTo(before, 6);
  });

  it('dispose하면 아직 울리지 않은 메아리가 장치에서도 지워진다', async () => {
    const r = realRig();
    await r.mixer.enable();
    r.audio.strike(WALL, 2);
    const sink = r.sinks('kalimba')[0]!.sink;
    r.engine.clock.t += 0.7;
    expect(sink.pending()).toHaveLength(1);
    r.audio.dispose();
    expect(sink.pending()).toEqual([]);
  });
});
