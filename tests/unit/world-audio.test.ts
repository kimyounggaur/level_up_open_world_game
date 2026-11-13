// 4-5 광장 합주(맥박, 마을의 화음 깔기 세 단계)와 4-6 서명 소리를 세계 시계에 맞춰 예약하는가(설계서 6.2, 8.1~8.4, W-11).
// 가짜 시계, 가짜 타이머, 가짜 소리 받이로 시험한다. 실제 소리는 손 점검의 몫이다.
import { describe, expect, it } from 'vitest';
import { WORLD_LOOKAHEAD_SEC, WorldClock } from '@/audio/clock';
import { PLAZA_REGION, REGION_FADE_SEC, WorldAudio } from '@/audio/worldAudio';
import type { SoundStation } from '@/audio/worldAudio';
import type { LanternState } from '@/domain/reaction';
import type { RegionId } from '@/domain/world';
import { BAR_SEC, BEAT_SEC, HEAR_RADIUS, REGION_TIMBRE, barInLoop, hearGain, hearPan, plazaBar, rings, signatureOf, signatureOffset } from '@/domain/worldsound';
import { FakeClock, FakeTimer, FakeVisibility, FakeWorldMixer } from './audio-fakes';

const T0 = 1000;

const STATIONS: SoundStation[] = [
  { stationId: 'H1', regionId: 'village', x: 4000, y: 3500 },
  { stationId: 'H2', regionId: 'village', x: 4400, y: 3500 },
  { stationId: 'H3', regionId: 'village', x: 4800, y: 3500 },
  { stationId: 'H4', regionId: 'village', x: 5200, y: 3500 },
  { stationId: 'H5', regionId: 'village', x: 5600, y: 3500 },
  { stationId: 'P1', regionId: 'staff-hill', x: 4000, y: 1000 },
  { stationId: 'Z1', regionId: 'key-marsh', x: 7900, y: 5900 },
];

function rig(opts: { audible?: boolean; at?: { x: number; y: number; regionId: RegionId }; layer?: number; lanterns?: Record<string, LanternState> } = {}) {
  const clock = new FakeClock(T0);
  const world = new WorldClock(clock, T0);
  const timer = new FakeTimer();
  const mixer = new FakeWorldMixer(clock);
  const visibility = new FakeVisibility();
  const state = {
    layer: opts.layer ?? 0,
    lanterns: { ...(opts.lanterns ?? {}) } as Record<string, LanternState>,
    at: opts.at ?? { x: 4600, y: 3500, regionId: 'village' as RegionId },
  };
  mixer.audible = opts.audible ?? true;
  const audio = new WorldAudio({
    mixer,
    clock: world,
    timer,
    stations: STATIONS,
    reaction: () => ({ villageLayer: state.layer, lanterns: state.lanterns }),
    listener: () => state.at,
    visibility,
  });
  const run = (sec: number): void => {
    const end = clock.t + sec;
    while (clock.t < end - 1e-9) {
      clock.t = Math.min(end, clock.t + 0.025);
      timer.fire();
    }
  };
  return { clock, world, timer, mixer, visibility, state, audio, run };
}

type Rig = ReturnType<typeof rig>;
const pulseSink = (r: Rig) => r.mixer.sinkOf('thump')!;
const bedSink = (r: Rig) => r.mixer.sinkOf('pad')!;
const sigSinks = (r: Rig) => r.mixer.registered.filter((x) => x.bus === 'worldSignature');

describe('W-11 소리를 켜기 전에는 아무것도 예약하지 않는다', () => {
  it('소리가 나갈 수 없으면 타이머도 돌지 않고 음도 예약하지 않는다', () => {
    const r = rig({ audible: false });
    r.run(60);
    expect(r.timer.activeCount).toBe(0);
    expect(r.audio.debug().running).toBe(false);
    expect(r.audio.debug().notesScheduled).toBe(0);
    for (const s of r.mixer.allSinks) expect(s.requests).toEqual([]);
  });

  it('소리를 켜면 돌기 시작하고, 끄면(음소거) 멈추고 예약한 음을 지운다', () => {
    const r = rig({ audible: false });
    r.mixer.setAudible(true);
    expect(r.audio.debug().running).toBe(true);
    r.run(7);
    expect(r.audio.debug().notesScheduled).toBeGreaterThan(0);
    const cancelsBefore = pulseSink(r).cancelCalls;
    r.mixer.setAudible(false);
    expect(r.audio.debug().running).toBe(false);
    expect(r.timer.activeCount).toBe(0);
    expect(pulseSink(r).cancelCalls).toBeGreaterThan(cancelsBefore);
    const n = r.audio.debug().notesScheduled;
    r.run(10);
    expect(r.audio.debug().notesScheduled).toBe(n);
  });

  it('다시 켜면 지나간 마디는 건너뛰고 격자에 맞춰 이어진다', () => {
    const r = rig();
    r.run(7);
    r.mixer.setAudible(false);
    r.run(20);
    r.mixer.setAudible(true);
    r.run(7);
    const times = pulseSink(r).requests.map((q) => q.time);
    for (const t of times) expect(((t - T0) / BEAT_SEC) % 1 < 1e-6 || ((t - T0) / BEAT_SEC) % 1 > 1 - 1e-6).toBe(true);
    // 되돌아온 뒤의 음은 모두 되돌아온 시각 이후다
    const resumedAt = T0 + 27;
    expect(times.filter((t) => t > resumedAt).length).toBeGreaterThan(0);
  });
});

describe('4-5 광장 합주: 맥박과 마을의 화음 깔기', () => {
  it('층이 0이어도 맥박이 마디마다 네 박 있다. 화음 깔기는 없다', () => {
    const r = rig({ layer: 0 });
    r.run(24);
    const pulse = pulseSink(r).requests;
    expect(pulse.length).toBeGreaterThanOrEqual(8 * 4 - 4);
    expect(bedSink(r).requests).toEqual([]);
    // 각 마디의 네 박이 0.75초 간격이다
    const byBar = new Map<number, number[]>();
    for (const q of pulse) {
      const bar = Math.floor((q.time - T0) / BAR_SEC + 1e-9);
      byBar.set(bar, [...(byBar.get(bar) ?? []), q.time]);
    }
    for (const [, ts] of byBar) {
      if (ts.length === 4) ts.slice(1).forEach((t, i) => expect(t - ts[i]!).toBeCloseTo(BEAT_SEC, 6));
    }
  });

  it('화음이 8마디 뼈대(C F G C Am F G C)를 따른다: 맥박의 음이 그 마디 화음의 뿌리음이다', () => {
    const r = rig({ layer: 0 });
    r.run(25);
    const first = pulseSink(r).requests.filter((q) => Math.abs(((q.time - T0) % BAR_SEC)) < 1e-6);
    // 마디 첫 박의 음들: 뿌리음 C2 F2 G2 C2 A2 F2 G2 C2
    const bars = new Map<number, number>();
    for (const q of first) bars.set(Math.floor((q.time - T0) / BAR_SEC + 1e-9), q.midi);
    for (const [bar, midi] of bars) expect(midi, `마디 ${bar}`).toBe(plazaBar(barInLoop(bar), 0).pulse[0]!.midi);
  });

  it('마을 층 1, 2, 3이면 화음 깔기가 온음표, 2분음표, 4분음표 펼침이 된다. 층이 바뀐 다음 마디부터다', () => {
    const r = rig({ layer: 0 });
    r.run(3.2); // 한 마디가 지나갔다
    expect(bedSink(r).requests).toEqual([]);
    for (const [layer, perBar, beats] of [[1, 3, [0]], [2, 6, [0, 2]], [3, 4, [0, 1, 2, 3]]] as const) {
      r.state.layer = layer;
      const before = bedSink(r).requests.length;
      r.run(BAR_SEC * 2);
      const added = bedSink(r).requests.slice(before);
      expect(added.length, `층 ${layer}`).toBeGreaterThanOrEqual(perBar);
      const oneBar = added.filter((q) => Math.floor((q.time - T0) / BAR_SEC + 1e-9) === Math.floor((added[0]!.time - T0) / BAR_SEC + 1e-9));
      expect(oneBar).toHaveLength(perBar);
      const startBar = Math.floor((oneBar[0]!.time - T0) / BAR_SEC + 1e-9);
      expect([...new Set(oneBar.map((q) => Math.round(((q.time - T0 - startBar * BAR_SEC) / BEAT_SEC) * 100) / 100))].sort()).toEqual([...beats]);
    }
  });

  it('음은 모두 다장조의 음이고 시작이 시계 격자 위에 있다', () => {
    const r = rig({ layer: 3 });
    r.run(25);
    const major = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const s of [pulseSink(r), bedSink(r)]) {
      for (const q of s.requests) {
        expect(major.has(q.midi % 12)).toBe(true);
        const grid = (q.time - T0) / BEAT_SEC;
        expect(Math.abs(grid - Math.round(grid))).toBeLessThan(1e-6);
      }
    }
  });

  it('음은 마디 시작 전에(예약기가 앞서 부르는 시간 안쪽) 예약된다: 소리가 늦지 않는다', () => {
    const r = rig({ layer: 3 });
    r.run(25);
    for (const q of [...pulseSink(r).requests, ...bedSink(r).requests]) {
      const barStart = T0 + Math.floor((q.time - T0) / BAR_SEC + 1e-9) * BAR_SEC;
      // 예약한 때가 그 마디 시작에서 (앞서 부르는 시간 + 깨우기 간격 25 ms) 이전보다 더 일찍도, 마디 시작보다 늦지도 않다
      expect(barStart - q.requestedAt).toBeLessThanOrEqual(WORLD_LOOKAHEAD_SEC + 0.026);
      expect(q.requestedAt).toBeLessThanOrEqual(barStart + 1e-6);
    }
  });

  it('마을 밖에서는 광장 합주를 예약하지 않고, 마을 소리 받이를 2초에 걸쳐 줄인다. 돌아오면 2초에 걸쳐 되돌린다', () => {
    const r = rig({ layer: 2 });
    r.run(7);
    expect(pulseSink(r).requests.length).toBeGreaterThan(0);
    expect(pulseSink(r).lastLevel).toEqual({ db: 0, ramp: REGION_FADE_SEC });
    r.state.at = { x: 4000, y: 1000, regionId: 'staff-hill' };
    r.run(0.1);
    expect(pulseSink(r).lastLevel).toEqual({ db: -Infinity, ramp: REGION_FADE_SEC });
    expect(bedSink(r).lastLevel).toEqual({ db: -Infinity, ramp: REGION_FADE_SEC });
    const n = pulseSink(r).requests.length;
    const bedN = bedSink(r).requests.length;
    r.run(10);
    // 이미 예약한 마디 뒤로는 더 늘지 않는다(한 마디 안쪽 오차)
    expect(pulseSink(r).requests.length - n).toBeLessThanOrEqual(4);
    expect(bedSink(r).requests.length - bedN).toBeLessThanOrEqual(6);
    r.state.at = { x: 4600, y: 3500, regionId: PLAZA_REGION };
    r.run(0.1);
    expect(pulseSink(r).lastLevel).toEqual({ db: 0, ramp: REGION_FADE_SEC });
    const m = pulseSink(r).requests.length;
    r.run(7);
    expect(pulseSink(r).requests.length).toBeGreaterThan(m);
  });

  it('세계 버스로 나간다: 광장 합주와 지역이 맡은 성부는 세계 층 버스, 지역의 긴 화음과 자연음은 세계 바탕 버스, 서명 소리는 세계 서명 버스(과제 소리에 줄어드는 버스다, W-7)', () => {
    const r = rig();
    r.run(30);
    const buses = new Set(r.mixer.registered.map((x) => x.bus));
    expect([...buses].sort()).toEqual(['worldBed', 'worldLayer', 'worldSignature']);
    const timbres = (bus: string) => r.mixer.registered.filter((x) => x.bus === bus).map((x) => x.options.timbre).sort();
    // 광장 합주 일곱: 맥박(thump), 화음 깔기(pad), 타악(tick), 베이스(bass), 가락(lead), 달리는 음(run), 꾸밈음(spark)(7-5)
    // + 지역 안의 성부 다섯: 오선 언덕의 가락(lead), 박자 강가의 타악(tick), 종나무 숲의 베이스(bass), 음계 길의 달리는 음(run), 건반 늪의 꾸밈음(spark)(6-8, 7-4)
    expect(timbres('worldLayer')).toEqual(['bass', 'bass', 'lead', 'lead', 'pad', 'run', 'run', 'spark', 'spark', 'thump', 'tick', 'tick']);
    // 지역의 바탕 소리: 다섯 지역의 긴 화음 다섯, 산들바람(오선 언덕), 강물, 바람(종나무 숲), 풀잎(음계 길), 안개(건반 늪)(6-8, 7-4)
    expect(timbres('worldBed')).toEqual(['breeze', 'grass', 'mist', 'pad', 'pad', 'pad', 'pad', 'pad', 'river', 'wind']);
  });
});

describe('4-6 서명 소리: 4마디에 한 번, 900 px 안에서, 거리와 좌우를 따른다', () => {
  it('정거장마다 시작 마디가 다르다: 한 정거장은 4마디마다 한 번 울린다', () => {
    // 다섯 정거장이 모두 900 px 안에 드는 자리(가운데 H3)
    const r = rig({ at: { x: 4800, y: 3500, regionId: 'village' } });
    r.run(48);
    const log = r.audio.debug().rings;
    for (const id of ['H1', 'H2', 'H3', 'H4', 'H5']) {
      const bars = log.filter((x) => x.stationId === id).map((x) => x.bar);
      expect(bars.length, id).toBeGreaterThanOrEqual(3);
      bars.slice(1).forEach((b, i) => expect(b - bars[i]!).toBe(4));
      const idx = STATIONS.findIndex((s) => s.stationId === id);
      for (const b of bars) expect(rings(b, signatureOffset(idx))).toBe(true);
    }
    // 한 마디에 다섯이 한꺼번에 울리지 않는다
    const perBar = new Map<number, number>();
    for (const x of log) perBar.set(x.bar, (perBar.get(x.bar) ?? 0) + 1);
    expect(Math.max(...perBar.values())).toBeLessThanOrEqual(2);
  });

  it('900 px 밖의 정거장은 울리지 않는다', () => {
    const r = rig({ at: { x: 4600, y: 3500, regionId: 'village' } });
    r.run(60);
    const ids = new Set(r.audio.debug().rings.map((x) => x.stationId));
    expect(ids.has('P1')).toBe(false); // 2500 px 위
    expect(ids.has('Z1')).toBe(false);
  });

  it('음량은 (1 − 거리 ÷ 900)의 제곱이고, 왼쪽에 있으면 왼쪽으로 쏠린다', () => {
    const r = rig({ at: { x: 4600, y: 3500, regionId: 'village' } });
    r.run(24);
    for (const x of r.audio.debug().rings) {
      const st = STATIONS.find((s) => s.stationId === x.stationId)!;
      const d = Math.hypot(st.x - 4600, st.y - 3500);
      expect(x.gain).toBeCloseTo(hearGain(d), 10);
      expect(x.pan).toBeCloseTo(hearPan(st.x - 4600), 10);
    }
    const left = r.audio.debug().rings.find((x) => x.stationId === 'H1')!; // 600 px 왼쪽
    const right = r.audio.debug().rings.find((x) => x.stationId === 'H5')!; // 1000 px 오른쪽(밖이라 없을 수 있다)
    expect(left.pan).toBeLessThan(0);
    expect(right).toBeUndefined(); // 1000 px: 들리는 거리 밖
    const h4 = r.audio.debug().rings.find((x) => x.stationId === 'H4')!;
    expect(h4.pan).toBeGreaterThan(0);
  });

  it('소리 받이로 나가는 음의 세기가 거리 음량을 따른다. 지역 음색 받이는 좌우를 받는다', () => {
    const r = rig({ at: { x: 4600, y: 3500, regionId: 'village' } });
    r.run(24);
    const sinks = sigSinks(r);
    expect(sinks.length).toBeGreaterThan(0);
    for (const s of sinks) expect(s.options).toEqual({ timbre: REGION_TIMBRE.village, pan: true });
    const q = sinks[0]!.sink.requests;
    const base = signatureOf('H4').base;
    const h4 = q.filter((x) => x.id.startsWith('sig-H4-'));
    expect(h4.length).toBeGreaterThanOrEqual(base.length);
    const g = hearGain(600);
    h4.slice(0, base.length).forEach((x, i) => {
      expect(x.midi).toBe(base[i]!.midi);
      expect(x.velocity).toBeCloseTo(Math.min(1, base[i]!.velocity * g), 10);
      expect(x.pan!).toBeGreaterThan(0);
      expect(x.duration).toBeCloseTo(base[i]!.beats * BEAT_SEC, 10);
    });
  });

  it('꽃등이 켜진 정거장은 성부가 하나 더해진 판이 울린다(통과 뒤 가장 먼저 들리는 세계의 변화)', () => {
    const r = rig({ at: { x: 5000, y: 3500, regionId: 'village' } });
    r.run(13);
    const before = r.audio.debug().rings.filter((x) => x.stationId === 'H4');
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((x) => x.version === 'base')).toBe(true);
    const baseCount = signatureOf('H4').base.length;
    const reqs = () => sigSinks(r).flatMap((s) => s.sink.requests).filter((x) => x.id.startsWith('sig-H4-'));
    const n0 = reqs().length;
    expect(n0 % baseCount).toBe(0);

    r.state.lanterns = { H4: 'flower' };
    r.run(13);
    const after = r.audio.debug().rings.filter((x) => x.stationId === 'H4' && x.version === 'flower');
    expect(after.length).toBeGreaterThan(0);
    const flowerReqs = reqs().slice(n0);
    // 꽃등 판은 기본 가락 + 3도 위 성부(같은 박)
    const sig = signatureOf('H4');
    const oneRing = flowerReqs.slice(0, baseCount * 2);
    expect(oneRing.map((x) => x.midi)).toEqual([...sig.base.map((n) => n.midi), ...sig.flowerVoice.map((n) => n.midi)]);
    // 다른 정거장의 판은 그대로다
    expect(r.audio.debug().rings.filter((x) => x.stationId !== 'H4').every((x) => x.version === 'base')).toBe(true);
  });

  it('정거장이 있는 지역의 음색으로 울린다(처음 쓸 때 받이를 신청한다)', () => {
    const r = rig({ at: { x: 4000, y: 1500, regionId: 'staff-hill' } });
    r.run(24);
    const timbres = sigSinks(r).map((s) => s.options.timbre);
    expect(timbres).toContain(REGION_TIMBRE['staff-hill']);
    expect(timbres).not.toContain(REGION_TIMBRE.village);
    // 마을 밖이므로 광장 합주는 예약하지 않는다
    expect(pulseSink(r).requests).toEqual([]);
  });

  it('가까운 정거장이 없으면 서명 소리가 없다', () => {
    const r = rig({ at: { x: 2000, y: 5800, regionId: 'beat-river' } });
    r.run(30);
    expect(r.audio.debug().rings).toEqual([]);
    expect(sigSinks(r).flatMap((s) => s.sink.requests)).toEqual([]);
  });

  it('들리는 거리 경계: 900 px 직전에는 매우 작게 들리거나(문턱 아래면) 안 들린다', () => {
    const r = rig({ at: { x: 4000 + HEAR_RADIUS - 1, y: 3500, regionId: 'village' } });
    r.run(30);
    // H1에서 899 px: 음량이 문턱 아래이므로 울리지 않는다
    expect(r.audio.debug().rings.some((x) => x.stationId === 'H1')).toBe(false);
  });
});

describe('8.6 탭이 가려지면 멈추고 돌아오면 이어진다', () => {
  it('가려지면 멈추고 예약을 지운다. 돌아오면 다음 마디부터 다시 흐른다', () => {
    const r = rig();
    r.run(7);
    r.visibility.set(true);
    expect(r.audio.debug().running).toBe(false);
    expect(r.timer.activeCount).toBe(0);
    expect(pulseSink(r).cancelCalls).toBeGreaterThan(0);
    const n = r.audio.debug().notesScheduled;
    r.run(30);
    expect(r.audio.debug().notesScheduled).toBe(n);
    r.visibility.set(false);
    expect(r.audio.debug().running).toBe(true);
    r.run(7);
    expect(r.audio.debug().notesScheduled).toBeGreaterThan(n);
  });

  it('가려진 채로 소리를 켜도 돌지 않는다', () => {
    const r = rig({ audible: false });
    r.visibility.set(true);
    r.mixer.setAudible(true);
    expect(r.audio.debug().running).toBe(false);
    r.visibility.set(false);
    expect(r.audio.debug().running).toBe(true);
  });
});

describe('정리', () => {
  it('dispose하면 멈추고 더는 반응하지 않는다', () => {
    const r = rig();
    r.run(4);
    r.audio.dispose();
    expect(r.timer.activeCount).toBe(0);
    const n = r.audio.debug().notesScheduled;
    r.mixer.setAudible(false);
    r.mixer.setAudible(true);
    r.run(10);
    expect(r.audio.debug().notesScheduled).toBe(n);
    expect(r.audio.debug().running).toBe(false);
  });

  it('debug는 지금 마디와 마을 층을 알려 준다', () => {
    const r = rig({ layer: 2 });
    r.run(7);
    const d = r.audio.debug();
    expect(d.villageLayer).toBe(2);
    expect(d.plazaAudible).toBe(true);
    expect(d.bar).toBe(Math.floor(7 / BAR_SEC + 1e-9));
    expect(d.barsScheduled).toBeGreaterThanOrEqual(2);
  });
});
