// 6.4 잔치 동안의 월드 소리: 광장 합주를 합주의 첫 마디부터 두 번(16마디) 울리고, 잔치가 아닌 마디는 세계 시계를 그대로 따른다.
// 층이 0이어도 맥박이 있다. 소리를 켜기 전에는 예약하지 않는다(W-11). 가짜 시계, 가짜 타이머, 가짜 소리 받이로 시험한다.
import { describe, expect, it } from 'vitest';
import { WorldClock } from '@/audio/clock';
import { WorldAudio } from '@/audio/worldAudio';
import { FESTIVAL_BARS } from '@/domain/festival';
import type { FestivalRun } from '@/domain/festival';
import type { RegionId } from '@/domain/world';
import { BAR_SEC, CHORD_ROOT, PROGRESSION, barInLoop, plazaBar } from '@/domain/worldsound';
import { FakeClock, FakeTimer, FakeWorldMixer } from './audio-fakes';

const T0 = 1000;

function rig(opts: { layer?: number; run?: FestivalRun | null; audible?: boolean; regionId?: RegionId } = {}) {
  const clock = new FakeClock(T0);
  const world = new WorldClock(clock, T0);
  const timer = new FakeTimer();
  const mixer = new FakeWorldMixer(clock);
  mixer.audible = opts.audible ?? true;
  const state = { layer: opts.layer ?? 0, run: opts.run ?? null, regionId: opts.regionId ?? ('village' as RegionId) };
  const audio = new WorldAudio({
    mixer,
    clock: world,
    timer,
    stations: [],
    festival: () => state.run,
    reaction: () => ({ villageLayer: state.layer, lanterns: {} }),
    listener: () => ({ x: 4056, y: 3300, regionId: state.regionId }),
  });
  const run = (sec: number): void => {
    const end = clock.t + sec;
    while (clock.t < end - 1e-9) {
      clock.t = Math.min(end, clock.t + 0.025);
      timer.fire();
    }
  };
  return { clock, world, mixer, state, audio, run };
}

type Rig = ReturnType<typeof rig>;
const pulseSink = (r: Rig) => r.mixer.sinkOf('thump')!;
const bedSink = (r: Rig) => r.mixer.sinkOf('pad')!;
/** 마디 번호별로 맥박의 뿌리음(그 마디 화음의 뿌리음) */
const rootsByBar = (r: Rig): Map<number, number> => {
  const out = new Map<number, number>();
  for (const q of pulseSink(r).requests) out.set(Math.floor((q.time - T0) / BAR_SEC + 1e-9), q.midi);
  return out;
};

describe('잔치 구간은 합주의 첫 마디부터 두 번 울린다', () => {
  it('6마디째에 열어도 뿌리음이 C F G C Am F G C, C F G C Am F G C 순서다', () => {
    const run: FestivalRun = { startBar: 6, endBar: 6 + FESTIVAL_BARS };
    const r = rig({ run });
    r.run(24 * 3 + 3);
    const roots = rootsByBar(r);
    const expected = [...PROGRESSION, ...PROGRESSION].map((c) => CHORD_ROOT[c]);
    for (let i = 0; i < FESTIVAL_BARS; i++) expect(roots.get(6 + i), `잔치의 ${i}번째 마디`).toBe(expected[i]);
  });

  it('잔치 밖의 마디는 세계 시계를 그대로 따른다: 앞뒤 마디의 화음은 마디 번호의 8마디 주기다', () => {
    const run: FestivalRun = { startBar: 5, endBar: 5 + FESTIVAL_BARS };
    const r = rig({ run });
    r.run(24 * 3);
    const roots = rootsByBar(r);
    for (const bar of [1, 2, 3, 4]) expect(roots.get(bar), `앞 ${bar}`).toBe(CHORD_ROOT[PROGRESSION[barInLoop(bar)]!]);
    for (const bar of [21, 22, 23]) expect(roots.get(bar), `뒤 ${bar}`).toBe(CHORD_ROOT[PROGRESSION[barInLoop(bar)]!]);
  });

  it('잔치의 마디 수를 센다: 16마디', () => {
    const run: FestivalRun = { startBar: 3, endBar: 3 + FESTIVAL_BARS };
    const r = rig({ run });
    r.run(24 * 3);
    expect(r.audio.debug().festivalBars).toBe(FESTIVAL_BARS);
  });

  it('잔치가 아니면 세지 않는다', () => {
    const r = rig();
    r.run(30);
    expect(r.audio.debug().festivalBars).toBe(0);
  });

  it('잔치를 열고 닫으면 다음 마디부터 따라간다(구간을 알려 주는 쪽이 정한다)', () => {
    const r = rig();
    r.run(7); // 마디 0, 1, 2 예약
    r.state.run = { startBar: 4, endBar: 4 + FESTIVAL_BARS };
    r.run(24);
    expect(r.audio.debug().festivalBars).toBeGreaterThan(0);
    const n = r.audio.debug().festivalBars;
    r.state.run = null; // 건너뛰었다
    r.run(12);
    expect(r.audio.debug().festivalBars).toBe(n);
  });
});

describe('층이 0이어도 맥박과 함께 열린다. 층에 따라 화음 깔기가 따라 붙는다(6.4)', () => {
  it('층 0: 잔치 내내 마디마다 맥박 네 박이 있고 화음 깔기는 없다', () => {
    const run: FestivalRun = { startBar: 2, endBar: 2 + FESTIVAL_BARS };
    const r = rig({ layer: 0, run });
    r.run(20 * 3);
    const byBar = new Map<number, number>();
    for (const q of pulseSink(r).requests) byBar.set(Math.floor((q.time - T0) / BAR_SEC + 1e-9), (byBar.get(Math.floor((q.time - T0) / BAR_SEC + 1e-9)) ?? 0) + 1);
    for (let b = 2; b < 2 + FESTIVAL_BARS; b++) expect(byBar.get(b), `마디 ${b}`).toBe(4);
    expect(bedSink(r).requests).toEqual([]);
  });

  it('층 2: 같은 구간에 화음 깔기가 2분음표 화음으로 함께 울린다', () => {
    const run: FestivalRun = { startBar: 2, endBar: 2 + FESTIVAL_BARS };
    const r = rig({ layer: 2, run });
    r.run(20 * 3);
    const first = plazaBar(0, 2);
    const bedAtStart = bedSink(r).requests.filter((q) => Math.floor((q.time - T0) / BAR_SEC + 1e-9) === 2);
    expect(bedAtStart.map((q) => q.midi)).toEqual(first.bed.map((n) => n.midi));
  });
});

describe('소리를 켜기 전과 마을 밖(W-11, 8.1)', () => {
  it('소리가 나갈 수 없으면 잔치가 열려 있어도 아무것도 예약하지 않는다', () => {
    const r = rig({ audible: false, run: { startBar: 1, endBar: 1 + FESTIVAL_BARS } });
    r.run(60);
    expect(r.audio.debug().running).toBe(false);
    expect(r.audio.debug().festivalBars).toBe(0);
    for (const s of r.mixer.allSinks) expect(s.requests).toEqual([]);
  });

  it('잔치 도중에 소리를 켜면 그 뒤 마디부터 울리고, 구간은 소리와 상관없이 지나간다', () => {
    const run: FestivalRun = { startBar: 1, endBar: 1 + FESTIVAL_BARS };
    const r = rig({ audible: false, run });
    r.run(30); // 마디 0–9는 소리 없이 지나간다
    r.mixer.setAudible(true);
    r.run(40);
    expect(r.audio.debug().running).toBe(true);
    const bars = [...rootsByBar(r).keys()];
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(10);
    // 켠 뒤의 마디도 잔치의 몇 번째 마디인가를 따른다: 마디 10은 잔치의 9번째(합주의 둘째 번 첫 마디의 다음)다
    const roots = rootsByBar(r);
    const festIndex = (bar: number): number => (bar - run.startBar) % 8;
    for (const bar of bars.filter((b) => b < run.endBar)) expect(roots.get(bar)).toBe(CHORD_ROOT[PROGRESSION[festIndex(bar)]!]);
  });

  it('마을 밖에서는 광장 합주가 들리지 않으므로 잔치 마디도 세지 않는다', () => {
    const r = rig({ run: { startBar: 1, endBar: 1 + FESTIVAL_BARS }, regionId: 'staff-hill' });
    r.run(40);
    expect(r.audio.debug().festivalBars).toBe(0);
    expect(pulseSink(r)?.requests ?? []).toEqual([]);
  });
});
