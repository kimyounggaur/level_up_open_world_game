// 6-2: 바큇살 길 다섯 개와 둘레길이 설계서 3.4의 표와 같다. 길이는 표의 점들을 직선으로 이은 값이고,
// 그려지는 길은 같은 점들을 모두 지나는 매끈한 곡선이다(곡선이 조금 더 길다). 지역 경계와 이름은 world-data.test.ts와 app-world.test.tsx에서 본다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BODY_RADIUS, PLAYER_START, TILE, WALK_SPEED, WORLD_H, WORLD_W, WorldMap } from '../../src/domain/world';
import { NavGrid, findPath, reachableFrom } from '../../src/world/nav';
import type { Point } from '../../src/world/nav';
import { NAV_ROWS } from '../../src/world/generated/worldData';
import { loadRegionDefs } from '../../tools/world-files';
import { distToPolyline } from '../../world-src/curves';
import { LOOP_LENGTH_PX, LOOP_POINTS, LOOP_SECONDS, LOOP_WIDTH, ROUTE_TABLE, SIDE_PATH_WIDTH, SPOKES, SPOKE_WIDTH, outerRoads, signSpecs } from '../../world-src/outer';
import { EDGE_BAND } from '../../world-src/shapes';

const root = path.resolve(__dirname, '../..');
const regions = loadRegionDefs(root);
const map = new WorldMap(regions);
const grid = NavGrid.fromRows(NAV_ROWS);

const P = (x: number, y: number): Point => ({ x, y });
const lengthOf = (pts: readonly Point[]): number => {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
  return s;
};

/** 설계서 3.4 표를 그대로 옮긴 것: 코드의 표(ROUTE_TABLE)가 이 값과 어긋나면 잡는다 */
const DESIGN: ReadonlyArray<{ id: string; gate: Point; via: Point[]; length: number; seconds: number; endRegion: string }> = [
  { id: 'spoke-north', gate: P(4056, 2016), via: [P(4056, 1560), P(4056, 220)], length: 1796, seconds: 8, endRegion: 'staff-hill' },
  { id: 'spoke-east', gate: P(5600, 3081), via: [P(6400, 3081), P(7000, 3081), P(7800, 3081)], length: 2200, seconds: 10, endRegion: 'beat-river' },
  { id: 'spoke-west', gate: P(2592, 3081), via: [P(1900, 2900), P(1100, 2600)], length: 1570, seconds: 7, endRegion: 'bell-grove' },
  { id: 'spoke-south', gate: P(4056, 4128), via: [P(4056, 4700), P(2900, 5100), P(2840, 5100)], length: 1855, seconds: 8, endRegion: 'key-marsh' },
  { id: 'spoke-scale', gate: P(5600, 3669), via: [P(5800, 4300), P(5400, 4800), P(6100, 5300), P(6800, 5000), P(7200, 5600)], length: 3645, seconds: 17, endRegion: 'scale-trail' },
];
const DESIGN_LOOP = [P(4056, 1560), P(6300, 1500), P(6400, 3081), P(6200, 4500), P(4056, 4700), P(1900, 4600), P(1400, 3081), P(1900, 1500), P(4056, 1560)];

const roads = outerRoads();
const roadOf = (id: string): { id: string; width: number; points: Point[] } => {
  const r = roads.find((x) => x.id === id);
  if (!r) throw new Error(`길 ${id}가 없어요`);
  return r;
};

/** 그려진 곡선에서 마을 문에 가장 가까운 점부터 끝까지의 길이 */
function arcFromGate(points: readonly Point[], gate: Point): number {
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((gate.x - a.x) * dx + (gate.y - a.y) * dy) / l2));
    const d = Math.hypot(gate.x - (a.x + t * dx), gate.y - (a.y + t * dy));
    if (d < best) {
      best = d;
      bi = i;
      bt = t;
    }
  }
  const first = points[bi]!;
  const next = points[bi + 1]!;
  return (1 - bt) * Math.hypot(next.x - first.x, next.y - first.y) + lengthOf(points.slice(bi + 1));
}

describe('6-2 바큇살 길 다섯 개: 3.4의 길이 표', () => {
  it('코드의 길 표가 설계서의 점·길이·걷는 시간과 같다', () => {
    expect(ROUTE_TABLE).toHaveLength(5);
    for (const d of DESIGN) {
      const row = ROUTE_TABLE.find((r) => r.id === d.id);
      expect(row, d.id).toBeDefined();
      expect(row!.gate).toEqual(d.gate);
      expect(row!.via).toEqual(d.via);
      expect(row!.lengthPx).toBe(d.length);
      expect(row!.seconds).toBe(d.seconds);
    }
  });

  it('문에서 표지까지 점들을 직선으로 이은 길이가 표와 같다(북 1,796 / 동 2,200 / 서 1,570 / 남 1,855 / 음계 길 3,645)', () => {
    for (const d of DESIGN) {
      const len = lengthOf([d.gate, ...d.via]);
      expect(Math.round(len), `${d.id} ${len.toFixed(1)}`).toBe(d.length);
    }
  });

  it(`걷는 시간이 표와 같다(한 가지 속도 ${WALK_SPEED} px/초로 나눠 반올림: 8, 10, 7, 8, 17초)`, () => {
    for (const d of DESIGN) expect(Math.round(lengthOf([d.gate, ...d.via]) / WALK_SPEED), d.id).toBe(d.seconds);
  });

  it('그리는 길은 표의 점을 모두 지난다(점에서 길 한가운데 선까지 0.5 px 안), 끝이 표지 자리다', () => {
    for (const d of DESIGN) {
      const road = roadOf(d.id);
      for (const v of d.via) expect(distToPolyline(v.x, v.y, road.points), `${d.id} (${v.x}, ${v.y})`).toBeLessThan(0.5);
      const end = road.points[road.points.length - 1]!;
      expect(end).toEqual(d.via[d.via.length - 1]);
    }
  });

  it('그리는 길은 마을 문에서 이어진다: 문이 길 폭의 절반 안에 든다', () => {
    for (const d of DESIGN) expect(distToPolyline(d.gate.x, d.gate.y, roadOf(d.id).points), d.id).toBeLessThan(SPOKE_WIDTH / 2);
  });

  it('그린 곡선의 길이(문에서 끝까지)는 표의 직선 길이와 같거나 3%까지만 더 길다', () => {
    for (const d of DESIGN) {
      const arc = arcFromGate(roadOf(d.id).points, d.gate);
      expect(arc / d.length, `${d.id} ${arc.toFixed(1)} px`).toBeGreaterThan(0.998);
      expect(arc / d.length, `${d.id} ${arc.toFixed(1)} px`).toBeLessThan(1.03);
    }
  });

  it('그리는 점 목록(SPOKES)은 표의 점들로 끝난다: 마을 안쪽의 한 점에서 시작해 문을 지난다', () => {
    expect(SPOKES.map(([id]) => id)).toEqual(DESIGN.map((d) => d.id));
    for (const [id, pts] of SPOKES) {
      const d = DESIGN.find((x) => x.id === id)!;
      expect(pts.slice(pts.length - d.via.length), id).toEqual(d.via);
      // 시작점은 마을 안(2592–5600 × 2016–4128)이다
      const s = pts[0]!;
      expect(s.x >= 2592 && s.x <= 5600 && s.y >= 2016 && s.y <= 4128, `${id} 시작 (${s.x}, ${s.y})`).toBe(true);
    }
  });

  it('길의 끝은 제 지역 안에 있다', () => {
    for (const d of DESIGN) {
      const end = d.via[d.via.length - 1]!;
      expect(map.regionAt(end.x, end.y).regionId, d.id).toBe(d.endRegion);
    }
  });

  it('북쪽 길은 오선 언덕의 풍향계, 음계 길은 정자, 서쪽 길은 종탑 앞에서 끝난다(표지와 같은 자리)', () => {
    const lm = (id: string): Point => map.region(id as 'staff-hill').landmark;
    expect(DESIGN[0]!.via[1]).toEqual(P(lm('staff-hill').x, lm('staff-hill').y));
    expect(DESIGN[4]!.via[4]).toEqual(P(lm('scale-trail').x, lm('scale-trail').y));
    const tower = lm('bell-grove');
    const west = DESIGN[2]!.via[1]!;
    expect(Math.hypot(west.x - tower.x, west.y - tower.y)).toBeLessThanOrEqual(100);
  });

  it('폭은 마을 안 큰길과 같은 186 px이다', () => {
    expect(SPOKE_WIDTH).toBe(186);
    for (const d of DESIGN) expect(roadOf(d.id).width).toBe(186);
  });
});

describe('6-2 둘레길과 샛길', () => {
  it('둘레길은 3.4의 점 아홉 개이고 처음과 끝이 같다', () => {
    expect(LOOP_POINTS).toEqual(DESIGN_LOOP);
    expect(LOOP_POINTS[0]).toEqual(LOOP_POINTS[LOOP_POINTS.length - 1]);
  });

  it('한 바퀴는 약 14,990 px이고 걸어서 68초다', () => {
    const len = lengthOf(DESIGN_LOOP);
    expect(Math.abs(len - 14990), `${len.toFixed(1)} px`).toBeLessThan(5);
    expect(Math.round(len / WALK_SPEED)).toBe(68);
    expect(LOOP_LENGTH_PX).toBe(14990);
    expect(LOOP_SECONDS).toBe(68);
  });

  it('그리는 둘레길은 점을 모두 지나고 닫힌 곡선이며, 곡선 길이는 직선 길이보다 3%까지만 길다', () => {
    const loop = roadOf('loop');
    for (const v of DESIGN_LOOP) expect(distToPolyline(v.x, v.y, loop.points)).toBeLessThan(0.5);
    expect(loop.points[0]).toEqual(loop.points[loop.points.length - 1]);
    const ratio = lengthOf(loop.points) / lengthOf(DESIGN_LOOP);
    expect(ratio).toBeGreaterThan(0.998);
    expect(ratio).toBeLessThan(1.03);
  });

  it('둘레길은 마을 안을 지나지 않는다(지역에서 지역으로만 간다)', () => {
    for (const p of roadOf('loop').points) expect(map.regionAt(p.x, p.y).regionId, `(${Math.round(p.x)}, ${Math.round(p.y)})`).not.toBe('village');
  });

  it('둘레길은 마을을 뺀 다섯 지역을 모두 지난다', () => {
    const seen = new Set(roadOf('loop').points.map((p) => map.regionAt(p.x, p.y).regionId));
    expect([...seen].sort()).toEqual(['beat-river', 'bell-grove', 'key-marsh', 'scale-trail', 'staff-hill']);
  });

  it('폭은 둘레길 124 px, 샛길 62 px이다', () => {
    expect(LOOP_WIDTH).toBe(124);
    expect(roadOf('loop').width).toBe(124);
    expect(SIDE_PATH_WIDTH).toBe(62);
  });
});

describe('6-2 길은 월드 안에 있고 걸을 수 있다', () => {
  it('길의 모든 점이 가장자리 울타리 안쪽에 있다', () => {
    for (const r of roads) {
      for (const p of r.points) {
        expect(p.x, `${r.id} x`).toBeGreaterThan(EDGE_BAND);
        expect(p.x, `${r.id} x`).toBeLessThan(WORLD_W - EDGE_BAND);
        expect(p.y, `${r.id} y`).toBeGreaterThan(EDGE_BAND);
        expect(p.y, `${r.id} y`).toBeLessThan(WORLD_H - EDGE_BAND);
      }
    }
  });

  it('길 한가운데는 시작 위치에서 걸어 닿는다. 막힌 점은 표지판이 길 위에 선 자리뿐이다', () => {
    const reach = reachableFrom(grid, PLAYER_START);
    const signs = signSpecs(regions);
    for (const r of roads) {
      for (const p of r.points) {
        if (grid.circleHitsBlocked(p.x, p.y)) {
          // 표지판 막대(반지름 14)와 몸(14)에, 격자 한 칸(32)의 올림을 더한 거리 안이다
          const near = signs.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < BODY_RADIUS + 14 + TILE);
          expect(near, `${r.id}: (${Math.round(p.x)}, ${Math.round(p.y)})가 막혀 있어요`).toBe(true);
          continue;
        }
        const c = grid.cellOf(p.x, p.y);
        expect(reach[c.cy * grid.cols + c.cx] === 1, `${r.id}: (${Math.round(p.x)}, ${Math.round(p.y)})에 걸어 닿지 못해요`).toBe(true);
      }
    }
  });

  it('시작 위치에서 다섯 길의 끝까지 걸어가는 길이 나오고, 길을 따라가는 거리보다 크게 돌아가지 않는다', () => {
    for (const d of DESIGN) {
      const end = d.via[d.via.length - 1]!;
      const found = findPath(grid, PLAYER_START, end);
      expect(found, d.id).not.toBeNull();
      expect(found!.adjusted, `${d.id}: 끝이 막혀서 다른 자리로 바뀌었어요`).toBe(false);
      const walked = lengthOf([PLAYER_START, ...found!.waypoints]);
      // 시작 위치에서 문까지(직선)에 표의 길이를 더한 값의 1.25배 안이다
      const viaGate = Math.hypot(d.gate.x - PLAYER_START.x, d.gate.y - PLAYER_START.y) + d.length;
      expect(walked, `${d.id} ${Math.round(walked)} px`).toBeLessThan(viaGate * 1.25);
    }
  });
});
