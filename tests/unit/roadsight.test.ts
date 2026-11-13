// 7-7 길 위의 볼거리 간격(설계서 3.4 규칙 1)의 순수 계산: 무엇이 언제 알아볼 수 있는 것이고, 어디가 빈 구간인가.
// 월드 데이터로 규칙을 지키는지는 world-sight.test.ts가 본다.
import { describe, expect, it } from 'vitest';
import { PIECE_HEAR_RADIUS } from '@/domain/discovery';
import type { RoadLine } from '@/domain/discovery';
import { BARE_STRETCH_MAX, SAMPLE_STEP, SEE_RADIUS, bareStretches, isPerceivable, sightsOf, validateRoadSight } from '@/domain/roadsight';
import type { Perceivable, Sight } from '@/domain/roadsight';
import { HEAR_RADIUS, MIN_HEARD_GAIN } from '@/domain/worldsound';

/** 폭 0의 길: 가운데 줄만 본다(길 폭이 하는 일은 아래 '길 폭(가장자리)'에서 따로 본다) */
const line = (id: string, ...pts: Array<[number, number]>): RoadLine => ({ id, width: 0, points: pts.map(([x, y]) => ({ x, y })) });
/** 폭이 있는 길(바큇살 길의 폭 186 px) */
const wide = (id: string, ...pts: Array<[number, number]>): RoadLine => ({ id, width: 186, points: pts.map(([x, y]) => ({ x, y })) });
const sign = (id: string, x: number, y: number): Sight => ({ id, kind: 'sign', x, y });
const station = (id: string, x: number, y: number): Sight => ({ id, kind: 'station', x, y });

describe('알아볼 수 있는 거리(isPerceivable)', () => {
  it('정거장과 기준음 탑은 게임이 소리를 내는 거리(음량 ≥ MIN_HEARD_GAIN)까지, 810 px 안에서 들린다', () => {
    const radius = HEAR_RADIUS * (1 - Math.sqrt(MIN_HEARD_GAIN));
    expect(radius).toBeCloseTo(810, 6);
    for (const kind of ['station', 'landmarkSound'] as const) {
      expect(isPerceivable(kind, 0)).toBe(true);
      expect(isPerceivable(kind, 800)).toBe(true);
      expect(isPerceivable(kind, 820)).toBe(false);
      expect(isPerceivable(kind, HEAR_RADIUS)).toBe(false);
    }
  });

  it('소리 조각은 이보다 짧은 540 px 안에서 들린다(소리 조각의 들리는 거리가 600 px이라서)', () => {
    expect(PIECE_HEAR_RADIUS * (1 - Math.sqrt(MIN_HEARD_GAIN))).toBeCloseTo(540, 6);
    expect(isPerceivable('soundPiece', 530)).toBe(true);
    expect(isPerceivable('soundPiece', 550)).toBe(false);
    expect(isPerceivable('soundPiece', PIECE_HEAR_RADIUS)).toBe(false);
  });

  it('표지판, 개념 쪽지, 놀이 악기는 보여서 센다: 세로 화면에서도 보이는 270 px 안', () => {
    expect(SEE_RADIUS).toBe(270);
    for (const kind of ['sign', 'conceptNote', 'playInstrument'] as const) {
      expect(isPerceivable(kind, 0)).toBe(true);
      expect(isPerceivable(kind, 270)).toBe(true);
      expect(isPerceivable(kind, 270.5)).toBe(false);
    }
  });

  it('거리를 알 수 없으면(NaN, 음수) 알아볼 수 없는 것으로 친다', () => {
    for (const kind of ['station', 'landmarkSound', 'soundPiece', 'conceptNote', 'playInstrument', 'sign'] as const) {
      expect(isPerceivable(kind, Number.NaN), kind).toBe(false);
      expect(isPerceivable(kind, -1), kind).toBe(false);
    }
  });
});

describe('월드의 것들을 한 목록으로(sightsOf)', () => {
  it('정거장, 지역 표지, 표지판, 발견 요소를 종류와 함께 모으고, 발견 요소는 없어도 된다', () => {
    const base = { stations: [{ stationId: 'K1', x: 1, y: 2 }], landmarks: [{ regionId: 'key-marsh', x: 3, y: 4 }], signs: [{ id: 'waysign-a', x: 5, y: 6 }] };
    expect(sightsOf(base)).toEqual([
      { id: 'K1', kind: 'station', x: 1, y: 2 },
      { id: 'landmark.key-marsh', kind: 'landmarkSound', x: 3, y: 4 },
      { id: 'waysign-a', kind: 'sign', x: 5, y: 6 },
    ]);
    const withDiscoveries = sightsOf({ ...base, discoveries: [{ id: 'p1', kind: 'soundPiece', x: 7, y: 8 }, { id: 'n1', kind: 'conceptNote', x: 9, y: 10 }, { id: 'play.a', kind: 'playInstrument', x: 11, y: 12 }] });
    expect(withDiscoveries.slice(3).map((s) => [s.id, s.kind])).toEqual([['p1', 'soundPiece'], ['n1', 'conceptNote'], ['play.a', 'playInstrument']]);
  });
});

describe('빈 구간(bareStretches)', () => {
  it('아무것도 없으면 길 전체가 빈 구간이다', () => {
    const [b, ...rest] = bareStretches(line('r', [0, 0], [1000, 0]), []);
    expect(rest).toEqual([]);
    expect(b).toMatchObject({ roadId: 'r', fromArc: 0, toArc: 1000, start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } });
    expect(b!.length).toBe(1000 + SAMPLE_STEP);
  });

  it('정거장 하나는 810 px 앞까지만 알아볼 수 있고, 그 뒤가 빈 구간이다(표본 간격 안쪽의 오차를 두고)', () => {
    const stretches = bareStretches(line('r', [0, 0], [3000, 0]), [station('S', 0, 0)]);
    expect(stretches).toHaveLength(1);
    const b = stretches[0]!;
    expect(b.fromArc).toBeGreaterThan(810 - SAMPLE_STEP);
    expect(b.fromArc).toBeLessThanOrEqual(810 + SAMPLE_STEP);
    expect(b.toArc).toBe(3000);
    expect(Math.abs(b.length - (3000 - 810))).toBeLessThanOrEqual(2 * SAMPLE_STEP);
  });

  it('길에서 비켜 있는 것도 거리로 센다: 270 px보다 멀리 비킨 표지판은 길 위 어디에서도 안 보이고, 가까이 비킨 것은 그만큼 짧게 보인다', () => {
    // 길에서 270 px보다 멀면 길 위 어느 곳에서도 보이지 않는다
    expect(bareStretches(line('r', [0, 0], [1000, 0]), [sign('far', 500, 400)])).toHaveLength(1);
    // 길에서 180 px 떨어진 표지판은 길 위 x = 500 ± √(270² − 180²) ≈ ±201 px에서 보인다
    const [a, b] = bareStretches(line('r', [0, 0], [1000, 0]), [sign('near', 500, 180)]);
    expect(a!.toArc).toBeGreaterThan(500 - 201 - 2 * SAMPLE_STEP);
    expect(a!.toArc).toBeLessThan(500 - 201 + SAMPLE_STEP);
    expect(b!.fromArc).toBeGreaterThan(500 + 201 - SAMPLE_STEP);
    expect(b!.fromArc).toBeLessThan(500 + 201 + 2 * SAMPLE_STEP);
  });

  it('두 표지판 사이의 빈 구간 길이를 잰다(처음과 끝은 알아볼 수 있는 곳이라 빈 구간이 아니다)', () => {
    const road = line('r', [0, 0], [1140, 0]);
    const [only] = bareStretches(road, [sign('a', 0, 0), sign('b', 1140, 0)]);
    expect(bareStretches(road, [sign('a', 0, 0), sign('b', 1140, 0)])).toHaveLength(1);
    expect(only!.fromArc).toBeGreaterThan(270);
    expect(only!.toArc).toBeLessThan(870);
    expect(only!.length).toBeLessThanOrEqual(600 + SAMPLE_STEP);
    expect(only!.length).toBeGreaterThanOrEqual(600 - 2 * SAMPLE_STEP);
  });

  it('꺾인 길은 꺾인 점들을 따라 잰다(직선거리가 아니라 길 위의 거리)', () => {
    const [b] = bareStretches(line('r', [0, 0], [1000, 0], [1000, 1000]), []);
    expect(b!.toArc).toBe(2000);
    expect(b!.end).toEqual({ x: 1000, y: 1000 });
  });

  it('처음과 끝이 같은 닫힌 길은 이음매를 넘는 빈 구간을 둘로 쪼개지 않고 하나로 센다', () => {
    const loop = line('loop', [0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 0]);
    const stretches = bareStretches(loop, [sign('s', 500, 0)]);
    expect(stretches).toHaveLength(1);
    const b = stretches[0]!;
    // 길 둘레는 4000 px이고 표지판은 길 위에 있어 보이는 곳이 길 위 230–770 px쯤(540 px)이다. 나머지 3460 px가 이음매를 넘어 이어진다
    expect(b.fromArc).toBeGreaterThan(b.toArc);
    expect(Math.abs(b.length - 3460)).toBeLessThanOrEqual(2 * SAMPLE_STEP);
    expect(b.start.x).toBeGreaterThan(700);
    expect(b.end.x).toBeLessThan(300);
  });

  it('닫히지 않은 길은 이음매가 없어서 처음과 끝의 빈 구간이 따로 센다', () => {
    const stretches = bareStretches(line('r', [0, 0], [3000, 0]), [sign('s', 1500, 0)]);
    expect(stretches).toHaveLength(2);
    expect(stretches[0]!.fromArc).toBe(0);
    expect(stretches[1]!.toArc).toBe(3000);
  });

  it('길이 없거나 점이 하나뿐이면 빈 구간이 없다', () => {
    expect(bareStretches({ id: 'e', width: 62, points: [] }, [])).toEqual([]);
    expect(bareStretches(line('one', [5, 5]), [])).toEqual([]);
    expect(bareStretches(line('zero', [5, 5], [5, 5]), [])).toEqual([]);
  });

  it('표본 간격을 줄여도 같은 구간이 나온다(8 px 표본이 구간을 놓치지 않는다)', () => {
    const road = line('r', [0, 0], [4000, 0]);
    const sights = [station('a', 300, 0), sign('b', 2400, 100)];
    const coarse = bareStretches(road, sights, 8);
    const fine = bareStretches(road, sights, 1);
    expect(coarse).toHaveLength(fine.length);
    coarse.forEach((c, i) => expect(Math.abs(c.length - fine[i]!.length)).toBeLessThanOrEqual(2 * SAMPLE_STEP));
  });
});

describe('길 폭(가장자리) — 길 위 어느 지점에서든이므로 가운데 줄에서 비켜 선 사람도 센다', () => {
  const HALF = 93;
  const reach = (r: number, off: number): number => Math.sqrt(r * r - off * off);

  it('폭이 0이면 가운데 줄만 보는 것과 같고, 폭이 있으면 같은 표지판이 보이는 구간이 짧아진다(가장자리에서는 √(270² − 93²) ≈ 253 px)', () => {
    const s = [sign('s', 500, 0)];
    const [centerOnly] = bareStretches(line('r', [0, 0], [1000, 0]), s);
    expect(centerOnly!.toArc).toBeGreaterThan(500 - 270 - 2 * SAMPLE_STEP);
    expect(centerOnly!.toArc).toBeLessThan(500 - 270 + SAMPLE_STEP);
    const [edges] = bareStretches(wide('r', [0, 0], [1000, 0]), s);
    expect(edges!.toArc).toBeGreaterThan(500 - reach(270, HALF) - 2 * SAMPLE_STEP);
    expect(edges!.toArc).toBeLessThan(500 - reach(270, HALF) + SAMPLE_STEP);
    expect(edges!.toArc).toBeGreaterThan(centerOnly!.toArc);
  });

  it('정거장의 소리는 810 px라 가장자리에서도 거의 같다(√(810² − 93²) ≈ 805 px)', () => {
    const [b] = bareStretches(wide('r', [0, 0], [3000, 0]), [station('S', 0, 0)]);
    expect(b!.fromArc).toBeGreaterThan(reach(810, HALF) - 2 * SAMPLE_STEP);
    expect(b!.fromArc).toBeLessThanOrEqual(reach(810, HALF) + SAMPLE_STEP);
  });

  it('길에서 비켜 선 표지판은 먼 가장자리에서 270 px 밖이면 길 위 어디에서도 알아볼 수 없다(길 가운데 줄에서 180 px = 가장자리에서 273 px)', () => {
    expect(bareStretches(line('r', [0, 0], [1000, 0]), [sign('beside', 500, 180)])).toHaveLength(2);
    const stretches = bareStretches(wide('r', [0, 0], [1000, 0]), [sign('beside', 500, 180)]);
    expect(stretches).toHaveLength(1);
    expect(stretches[0]!.fromArc).toBe(0);
    expect(stretches[0]!.toArc).toBe(1000);
  });

  it('먼 가장자리가 270 px 안이면 보이는 구간은 먼 가장자리가 정한다(가운데 줄에서 150 px 비킨 표지판은 먼 가장자리에서 243 px)', () => {
    const [a, b] = bareStretches(wide('r', [0, 0], [1000, 0]), [sign('beside', 500, 150)]);
    const half = reach(270, 150 + HALF);
    expect(a!.toArc).toBeGreaterThan(500 - half - 2 * SAMPLE_STEP);
    expect(a!.toArc).toBeLessThan(500 - half + SAMPLE_STEP);
    expect(b!.fromArc).toBeGreaterThan(500 + half - SAMPLE_STEP);
    expect(b!.fromArc).toBeLessThan(500 + half + 2 * SAMPLE_STEP);
  });

  it('꺾인 길에서는 길의 방향마다 그 방향의 수직으로 가장자리를 잡는다(위아래로 뻗은 길도 같다)', () => {
    const [horizontal] = bareStretches(wide('h', [0, 0], [1000, 0]), [sign('s', 500, 0)]);
    const [vertical] = bareStretches(wide('v', [0, 0], [0, 1000]), [sign('s', 0, 500)]);
    expect(Math.abs(horizontal!.toArc - vertical!.toArc)).toBeLessThanOrEqual(1);
    const bent = bareStretches(wide('b', [0, 0], [1000, 0], [1000, 1000]), [sign('s', 1000, 0)]);
    // 꺾이는 곳의 표지판: 두 변 위에서 같은 거리까지 알아볼 수 있다
    expect(bent).toHaveLength(2);
    expect(Math.abs(1000 - bent[0]!.toArc - (bent[1]!.fromArc - 1000))).toBeLessThanOrEqual(2 * SAMPLE_STEP);
  });
});

describe('알아볼 수 있다는 기준을 바꿔 보기(어림값이 틀렸을 때를 재는 보고용, tools/road-sight-report.ts)', () => {
  const road = line('r', [0, 0], [3000, 0]);
  const only = [station('S', 0, 0)];

  it('기준을 넘기지 않거나 isPerceivable을 넘기면 같은 결과다', () => {
    const sights = [station('S', 0, 0), sign('a', 1800, 100)];
    expect(bareStretches(road, sights, SAMPLE_STEP, isPerceivable)).toEqual(bareStretches(road, sights));
    expect(bareStretches(road, sights, undefined, undefined)).toEqual(bareStretches(road, sights));
  });

  it('들리는 거리를 좁히면 빈 구간이 앞에서 시작해 길어지고, 넓히면 짧아진다', () => {
    const heardTo = (radius: number): Perceivable => (kind, d) => kind === 'station' && d <= radius;
    const [tight] = bareStretches(road, only, SAMPLE_STEP, heardTo(500));
    const [normal] = bareStretches(road, only);
    const [broad] = bareStretches(road, only, SAMPLE_STEP, heardTo(1500));
    expect(Math.abs(tight!.fromArc - 500)).toBeLessThanOrEqual(SAMPLE_STEP);
    expect(Math.abs(broad!.fromArc - 1500)).toBeLessThanOrEqual(SAMPLE_STEP);
    expect(tight!.length).toBeGreaterThan(normal!.length);
    expect(normal!.length).toBeGreaterThan(broad!.length);
  });

  it('아무것도 알아볼 수 없다고 하면 길 전체가 빈 구간이다(소리를 켜지 않은 사람의 가장 나쁜 경우를 재는 데 쓴다)', () => {
    const [b, ...rest] = bareStretches(road, only, SAMPLE_STEP, () => false);
    expect(rest).toEqual([]);
    expect(b).toMatchObject({ fromArc: 0, toArc: 3000 });
  });
});

describe('규칙 1 검사(validateRoadSight)', () => {
  it('폭이 있는 길은 가장자리까지 보므로 가운데 줄만으로는 통과하는 간격(600 px)이 문제가 된다', () => {
    const sights = [sign('a', 0, 0), sign('b', 1140, 0)];
    expect(validateRoadSight([line('r', [0, 0], [1140, 0])], sights)).toEqual([]);
    const issues = validateRoadSight([wide('r', [0, 0], [1140, 0])], sights);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('가운데 줄이나 가장자리');
    // 가장자리에서는 표지판마다 253 px까지만 알아볼 수 있어 1140 − 2 × 253 ≈ 633 px가 빈다. 간격을 1080 px로 줄이면 통과한다
    expect(validateRoadSight([wide('r', [0, 0], [1080, 0])], [sign('a', 0, 0), sign('b', 1080, 0)])).toEqual([]);
  });

  it('빈 구간이 600 px 이하면 통과하고 600 px를 넘으면 문제로 돌려준다', () => {
    expect(BARE_STRETCH_MAX).toBe(600);
    const road = line('r', [0, 0], [1140, 0]);
    expect(validateRoadSight([road], [sign('a', 0, 0), sign('b', 1140, 0)])).toEqual([]);
    const wide = line('r', [0, 0], [1200, 0]);
    const issues = validateRoadSight([wide], [sign('a', 0, 0), sign('b', 1200, 0)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'ROAD_BARE', path: 'roads.r' });
    expect(issues[0]!.message).toContain('길 r의');
    expect(issues[0]!.message).toContain('600 px 넘김');
  });

  it('길마다 따로 본다: 문제가 있는 길만 짚는다', () => {
    const good = line('good', [0, 0], [500, 0]);
    const bad = line('bad', [0, 2000], [2000, 2000]);
    const issues = validateRoadSight([good, bad], [sign('a', 250, 0)]);
    expect(issues.map((i) => i.path)).toEqual(['roads.bad']);
  });

  it('문제의 글에 어디서 어디까지인지 좌표가 들어 있다', () => {
    const [issue] = validateRoadSight([line('r', [0, 0], [3000, 0])], [station('S', 0, 0)]);
    expect(issue!.message).toMatch(/\(8\d\d, 0\) → \(3000, 0\)/);
  });

  it('길이 없으면 문제도 없다', () => {
    expect(validateRoadSight([], [])).toEqual([]);
  });
});
