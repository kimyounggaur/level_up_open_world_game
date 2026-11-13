// 5-6 소리 조각(설계서 3.6, 8.4)이 월드 소리로 들리는가: 600 px 안에서만, 거리와 좌우를 따라, 한 마디 울리고 한 마디 쉬며,
// 소리를 켜기 전에는 예약하지 않는다(W-11). 가짜 시계, 가짜 타이머, 가짜 소리 받이로 시험한다. 실제 소리는 손 점검의 몫이다.
import { describe, expect, it } from 'vitest';
import { loadDiscoveries } from '@/app/discovery-data';
import { WorldClock } from '@/audio/clock';
import { WorldAudio } from '@/audio/worldAudio';
import type { SoundPieceSource } from '@/audio/worldAudio';
import { PIECE_HEAR_RADIUS, isSoundPiece, pieceHearGain } from '@/domain/discovery';
import type { SoundPieceDef } from '@/domain/discovery';
import type { RegionId } from '@/domain/world';
import { BEAT_SEC, PIECE_PERIOD_BARS, PIECE_VELOCITY, REGION_TIMBRE, hearPan, pieceRings, pieceWorldNotes } from '@/domain/worldsound';
import { FakeClock, FakeTimer, FakeVisibility, FakeWorldMixer } from './audio-fakes';

const T0 = 1000;
const REAL: SoundPieceDef[] = loadDiscoveries('preview').filter(isSoundPiece);
const note = (midi: number, onsetTicks: number, durationTicks = 960): SoundPieceSource['notes'][number] => ({ midi, onsetTicks, durationTicks });
/** 시험용 조각: id, 자리, 지역 */
const piece = (n: number, x: number, y: number, regionId: RegionId = 'village'): SoundPieceSource => ({
  discoveryId: `disc.test.piece-${n}`,
  regionId,
  x,
  y,
  notes: [note(64, 0), note(62, 960), note(60, 1920, 1920)],
});

function rig(pieces: readonly SoundPieceSource[], opts: { audible?: boolean; at?: { x: number; y: number; regionId?: RegionId } } = {}) {
  const clock = new FakeClock(T0);
  const world = new WorldClock(clock, T0);
  const timer = new FakeTimer();
  const mixer = new FakeWorldMixer(clock);
  const visibility = new FakeVisibility();
  const state = { at: { regionId: 'village' as RegionId, ...(opts.at ?? { x: 4056, y: 3300 }) } };
  mixer.audible = opts.audible ?? true;
  const audio = new WorldAudio({
    mixer,
    clock: world,
    timer,
    stations: [],
    pieces,
    reaction: () => ({ villageLayer: 0, lanterns: {} }),
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
const sigSinks = (r: Rig) => r.mixer.registered.filter((x) => x.bus === 'worldSignature');
const pieceRequests = (r: Rig) => sigSinks(r).flatMap((s) => s.sink.requests).filter((q) => q.id.startsWith('piece-'));

describe('W-11 소리를 켜기 전에는 소리 조각도 예약하지 않는다', () => {
  it('소리가 나갈 수 없으면 조각 옆에 서 있어도 아무것도 울리지 않는다', () => {
    const p = piece(0, 4056, 3300);
    const r = rig([p], { audible: false, at: { x: 4056, y: 3300 } });
    r.run(30);
    expect(r.audio.debug().running).toBe(false);
    expect(r.audio.debug().pieceRings).toEqual([]);
    expect(pieceRequests(r)).toEqual([]);
  });

  it('소리를 켜면 울리고, 끄면(음소거) 멈추고 예약한 음을 지운다', () => {
    const p = piece(0, 4056, 3300);
    const r = rig([p], { audible: false });
    r.mixer.setAudible(true);
    r.run(7);
    expect(r.audio.debug().pieceRings.length).toBeGreaterThan(0);
    const cancels = sigSinks(r).reduce((n, s) => n + s.sink.cancelCalls, 0);
    r.mixer.setAudible(false);
    expect(sigSinks(r).reduce((n, s) => n + s.sink.cancelCalls, 0)).toBeGreaterThan(cancels);
    const n = r.audio.debug().pieceRings.length;
    r.run(10);
    expect(r.audio.debug().pieceRings.length).toBe(n);
  });

  it('탭이 가려지면 멈추고 돌아오면 다시 울린다', () => {
    const r = rig([piece(0, 4056, 3300)]);
    r.run(7);
    r.visibility.set(true);
    const n = r.audio.debug().pieceRings.length;
    r.run(12);
    expect(r.audio.debug().pieceRings.length).toBe(n);
    r.visibility.set(false);
    r.run(9);
    expect(r.audio.debug().pieceRings.length).toBeGreaterThan(n);
  });
});

describe('들리는 거리: 600 px 안에서만, (1 − 거리 ÷ 600)의 제곱', () => {
  it('조각 가까이에 서면 울리고 음량은 pieceHearGain을 따른다', () => {
    const p = piece(0, 4056, 3300);
    const r = rig([p], { at: { x: 4056, y: 3500 } }); // 200 px 아래
    r.run(12);
    const log = r.audio.debug().pieceRings;
    expect(log.length).toBeGreaterThanOrEqual(3);
    for (const x of log) {
      expect(x.discoveryId).toBe(p.discoveryId);
      expect(x.gain).toBeCloseTo(pieceHearGain(200), 10);
    }
  });

  it('530 px에서는 매우 작게나마 들리고 550 px에서는 들리지 않는다(들리는 문턱)', () => {
    const near = rig([piece(0, 4056, 3300)], { at: { x: 4056, y: 3300 + 530 } });
    near.run(12);
    expect(near.audio.debug().pieceRings.length).toBeGreaterThan(0);
    const far = rig([piece(0, 4056, 3300)], { at: { x: 4056, y: 3300 + 550 } });
    far.run(12);
    expect(far.audio.debug().pieceRings).toEqual([]);
    expect(pieceRequests(far)).toEqual([]);
  });

  it(`${PIECE_HEAR_RADIUS} px 밖에서는 정말 아무 음도 소리 받이로 나가지 않는다`, () => {
    const r = rig([piece(0, 4056, 3300)], { at: { x: 4056 + PIECE_HEAR_RADIUS + 10, y: 3300 } });
    r.run(20);
    expect(pieceRequests(r)).toEqual([]);
    expect(r.audio.debug().notesScheduled).toBeGreaterThan(0); // 마을 안이라 광장 합주의 맥박은 울린다. 조각만 없다
  });

  it('조각이 왼쪽에 있으면 왼쪽으로, 오른쪽에 있으면 오른쪽으로 쏠린다', () => {
    const left = rig([piece(0, 3900, 3300)], { at: { x: 4056, y: 3300 } });
    left.run(8);
    const lp = left.audio.debug().pieceRings[0]!;
    expect(lp.pan).toBeLessThan(0);
    expect(lp.pan).toBeCloseTo(hearPan(3900 - 4056), 10);
    const right = rig([piece(0, 4300, 3300)], { at: { x: 4056, y: 3300 } });
    right.run(8);
    expect(right.audio.debug().pieceRings[0]!.pan).toBeGreaterThan(0);
  });

  it('걸어서 다가가면 다음 마디부터 들리기 시작한다', () => {
    const r = rig([piece(0, 4056, 3300)], { at: { x: 4056, y: 3300 + 900 } });
    r.run(12);
    expect(r.audio.debug().pieceRings).toEqual([]);
    r.state.at = { regionId: 'village', x: 4056, y: 3300 + 100 };
    r.run(9);
    expect(r.audio.debug().pieceRings.length).toBeGreaterThan(0);
  });
});

describe('한 마디 울리고 한 마디 쉰다: 이웃한 조각은 번갈아 울린다', () => {
  it('한 조각은 두 마디에 한 번 울린다', () => {
    const r = rig([piece(0, 4056, 3300)]);
    r.run(30);
    const bars = r.audio.debug().pieceRings.map((x) => x.bar);
    expect(bars.length).toBeGreaterThanOrEqual(4);
    bars.slice(1).forEach((b, i) => expect(b - bars[i]!).toBe(PIECE_PERIOD_BARS));
    for (const b of bars) expect(pieceRings(b, 0)).toBe(true);
  });

  it('번호의 짝수와 홀수가 서로 다른 마디에 울려 이웃한 조각이 한꺼번에 울리지 않는다', () => {
    const a = piece(0, 4056, 3300);
    const b = piece(1, 4156, 3300);
    const r = rig([a, b]);
    r.run(40);
    const log = r.audio.debug().pieceRings;
    const barsOf = (id: string) => new Set(log.filter((x) => x.discoveryId === id).map((x) => x.bar));
    const A = barsOf(a.discoveryId);
    const B = barsOf(b.discoveryId);
    expect(A.size).toBeGreaterThan(2);
    expect(B.size).toBeGreaterThan(2);
    for (const bar of A) expect(B.has(bar)).toBe(false);
    // 둘이 합치면 마디마다 한 조각은 울린다
    const all = new Set([...A, ...B]);
    const sorted = [...all].sort((x, y) => x - y);
    sorted.slice(1).forEach((x, i) => expect(x - sorted[i]!).toBe(1));
  });
});

describe('소리 받이로 나가는 음', () => {
  it('조각의 음이 박에 맞춰 나간다: 높이, 시작, 길이, 세기(기본 세기 × 거리 음량), 좌우', () => {
    const p = piece(0, 4056, 3300);
    const r = rig([p], { at: { x: 4056 - 100, y: 3300 } });
    r.run(8);
    const reqs = pieceRequests(r);
    const expected = pieceWorldNotes(p);
    expect(reqs.length).toBeGreaterThanOrEqual(expected.length);
    const first = r.audio.debug().pieceRings[0]!;
    const one = reqs.slice(0, expected.length);
    const g = pieceHearGain(100);
    one.forEach((q, i) => {
      expect(q.id).toBe(`piece-${p.discoveryId}-${first.bar}-${i}`);
      expect(q.midi).toBe(expected[i]!.midi);
      expect(q.time).toBeCloseTo(first.time + expected[i]!.beat * BEAT_SEC, 10);
      expect(q.duration).toBeCloseTo(expected[i]!.beats * BEAT_SEC, 10);
      expect(q.velocity).toBeCloseTo(Math.min(1, PIECE_VELOCITY * g), 10);
      expect(q.pan!).toBeGreaterThan(0); // 듣는 사람의 오른쪽에 있다
    });
  });

  it('지역 음색 받이를 쓴다: 마을의 조각은 마을 음색, 다른 지역의 조각은 그 지역 음색', () => {
    const r = rig([piece(0, 4056, 3300, 'village'), piece(1, 4100, 3300, 'staff-hill')]);
    r.run(12);
    const timbres = sigSinks(r).map((s) => s.options.timbre);
    expect(timbres).toContain(REGION_TIMBRE.village);
    expect(timbres).toContain(REGION_TIMBRE['staff-hill']);
    for (const s of sigSinks(r)) expect(s.options.pan).toBe(true);
  });

  it('세계 서명 버스로 나간다(과제 소리가 나는 동안 줄어드는 버스, W-7)', () => {
    const r = rig([piece(0, 4056, 3300)]);
    r.run(8);
    expect(sigSinks(r).length).toBeGreaterThan(0);
    expect(r.mixer.registered.filter((x) => x.bus === 'worldLayer').every((x) => x.sink.requests.every((q) => !q.id.startsWith('piece-')))).toBe(true);
  });

  it('조각이 없으면(기본값) 조각 소리는 없다', () => {
    const r = rig([], { at: { x: 4056, y: 3300 } });
    r.run(20);
    expect(r.audio.debug().pieceRings).toEqual([]);
    expect(pieceRequests(r)).toEqual([]);
  });
});

describe('진짜 조각(content/discoveries): 마을과 다섯 바깥 지역', () => {
  it('서른여섯 조각의 자리와 음이 있고, 광장 한가운데에서는 어느 것도 들리지 않는다(찾아 나서야 한다)', () => {
    expect(REAL).toHaveLength(36);
    const r = rig(REAL, { at: { x: 4056, y: 3081 } });
    r.run(40);
    expect(r.audio.debug().pieceRings).toEqual([]);
  });

  // 조각끼리는 500 px 이상만 떨어지면 되므로(설계서 3.6 규칙 2) 한 조각 곁에서 이웃 조각이 아주 작게 같이 들릴 수 있다.
  // 그래서 보는 것은 '이웃이 하나도 안 들린다'가 아니라 '곁의 조각이 가장 또렷하고, 같이 들리는 이웃은 곁 조각보다 한참 작으며, 모든 조각이 자기 마디에만 울린다'이다.
  // 곁에서 42 px(30, 30) 떨어져 서면 곁 조각의 음량은 0.8 이상이고, 500 px 떨어진 이웃은 458 px 이상이라 0.06 이하다.
  const NEAR_GAIN_MIN = 0.8;
  const NEIGHBOR_GAIN_MAX = 0.06;
  it.each(REAL.map((p, i) => [p.name, p, i] as const))('%s: 그 자리에 서면 자기 마디에 또렷하게 울리고, 같이 들리는 이웃은 아주 작다', (_name, p, i) => {
    const r = rig(REAL, { at: { x: p.x + 30, y: p.y + 30 } });
    r.run(30);
    const log = r.audio.debug().pieceRings;
    const mine = log.filter((x) => x.discoveryId === p.discoveryId);
    expect(mine.length).toBeGreaterThanOrEqual(4);
    for (const x of mine) {
      expect(pieceRings(x.bar, i)).toBe(true);
      expect(x.gain, `${p.discoveryId} 곁의 음량`).toBeGreaterThanOrEqual(NEAR_GAIN_MIN);
    }
    for (const x of log.filter((y) => y.discoveryId !== p.discoveryId)) {
      const j = REAL.findIndex((q) => q.discoveryId === x.discoveryId);
      expect(pieceRings(x.bar, j), `${x.discoveryId}는 자기 마디에만 울린다`).toBe(true);
      expect(x.gain, `${p.discoveryId} 곁에서 들리는 ${x.discoveryId}`).toBeLessThanOrEqual(NEIGHBOR_GAIN_MAX);
    }
  });

  it('어느 조각의 곁에서든 다른 조각이 곁 조각만큼 크게 들리지는 않는다: 조각끼리의 간격이 500 px 이상이다', () => {
    for (let i = 0; i < REAL.length; i++) {
      for (let j = i + 1; j < REAL.length; j++) {
        const d = Math.hypot(REAL[i]!.x - REAL[j]!.x, REAL[i]!.y - REAL[j]!.y);
        expect(d, `${REAL[i]!.discoveryId}~${REAL[j]!.discoveryId}`).toBeGreaterThanOrEqual(500);
      }
    }
    expect(pieceHearGain(500 - 42)).toBeLessThanOrEqual(NEIGHBOR_GAIN_MAX);
    expect(pieceHearGain(42)).toBeGreaterThanOrEqual(NEAR_GAIN_MIN);
  });
});
