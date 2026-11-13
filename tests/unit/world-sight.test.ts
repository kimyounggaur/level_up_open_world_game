// 7-7 걷는 시간과 볼거리 간격 점검(설계서 12.10, 3.4의 규칙 1과 2, 3.1의 걷는 시간): 지금 월드의 데이터로 본다.
//  · 규칙 1: 길 위 어느 곳에서든 다음 정거장이 보이거나 들린다. 공개 채널에서는 발견 요소가 검수를 마칠 때까지 보이지 않으므로(G2-7)
//    발견 요소가 하나도 없는 가장 나쁜 경우(정거장, 기준음 탑의 소리, 표지판만)로, 길 폭의 가운데 줄과 양쪽 가장자리에서 모두 알아볼 수 있는지로 본다. 길목 표지판 여섯(waysign-*)이 이 규칙을 지킨다.
//  · 규칙 2: 막다른 길 끝에는 발견 요소가 있다(검사는 이미 있고 여기서는 월드 전체를 한 번 더 센다).
//  · 걷는 시간: 3.4 표의 다섯 길과 둘레길을 실제 걸음 계산(stepPlayer)으로 걸어 본다.
// 순수 계산은 roadsight.test.ts, 이 시험은 데이터가 틀어지는 것을 잡는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDiscoveryFiles } from '@/app/discovery-data';
import { DEAD_END_RADIUS, deadEndsOf, distanceToRoads, spotsOf, validateDiscoveries, visibleDiscoveries, visiblePlayInstruments } from '@/domain/discovery';
import type { RoadLine } from '@/domain/discovery';
import { slotBounds } from '@/domain/installation';
import { RESIDENTS } from '@/domain/residents';
import { BARE_STRETCH_MAX, bareStretches, validateRoadSight } from '@/domain/roadsight';
import type { Sight } from '@/domain/roadsight';
import { PLAYER_START, WALK_SPEED, WORLD_W, WorldMap, regionBoundsPx, standOf } from '@/domain/world';
import type { RegionId } from '@/domain/world';
import { NavGrid, findPath, reachableFrom } from '../../src/world/nav';
import type { Point } from '../../src/world/nav';
import { NAV_ROWS, WORLD_OBJECTS } from '../../src/world/generated/worldData';
import { createPlayer, startPath, stepPlayer } from '../../src/world/player';
import { discoveryWorld, roadSightWorld, SIGNPOST_FILE, validateRoadSightFiles } from '../../tools/content-loader';
import { loadRegionDefs } from '../../tools/world-files';
import { LOOP_POINTS, LOOP_SECONDS, ROUTE_TABLE, outerRoads } from '../../world-src/outer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const regionDefs = loadRegionDefs(root);
const map = new WorldMap(regionDefs);
const grid = NavGrid.fromRows(NAV_ROWS);
const world = roadSightWorld(regionDefs);
const files = loadDiscoveryFiles();
const WAYSIGN = /^waysign-/;

/** 발견 요소와 놀이 악기를 이 채널에서 보이는 만큼 알아볼 수 있는 것으로 */
const discoverySights = (channel: 'preview' | 'release'): Sight[] => [
  ...visibleDiscoveries(files, channel).map((d): Sight => ({ id: d.discoveryId, kind: d.kind, x: d.x, y: d.y })),
  ...visiblePlayInstruments(files, channel).map((p): Sight => ({ id: p.playId, kind: 'playInstrument', x: p.x, y: p.y })),
];
const longest = (sights: readonly Sight[], step?: number): number => Math.max(0, ...world.roads.flatMap((r) => bareStretches(r, sights, step).map((b) => b.length)));
const roadsFlagged = (sights: readonly Sight[]): string[] => [...new Set(validateRoadSight(world.roads, sights).map((i) => i.path.replace('roads.', '')))].sort();

describe('규칙 1 — 길 위 어디서든 다음 정거장이 보이거나 들린다(가장 나쁜 경우: 발견 요소가 하나도 안 보임)', () => {
  it('길은 마을 안 길 여섯과 바큇살 다섯, 둘레길이고, 알아볼 수 있는 것은 정거장 23, 기준음 탑 1, 표지판 24(정거장 곁 18 + 길목 6)다', () => {
    expect(world.roads.map((r) => r.id)).toEqual(['village-east-west', 'village-north-south', 'village-north-west', 'village-north-east', 'village-south-west', 'village-scale', 'spoke-north', 'spoke-east', 'spoke-west', 'spoke-south', 'spoke-scale', 'loop']);
    const count = (kind: string): number => world.sights.filter((s) => s.kind === kind).length;
    expect([count('station'), count('landmarkSound'), count('sign'), count('soundPiece') + count('conceptNote') + count('playInstrument')]).toEqual([23, 1, 24, 0]);
    expect(WORLD_OBJECTS.filter((o) => SIGNPOST_FILE.test(o.file) && o.kind === 'sign')).toHaveLength(18);
    expect(WORLD_OBJECTS.filter((o) => SIGNPOST_FILE.test(o.file) && o.kind === 'prop')).toHaveLength(6);
  });

  it('빈 구간(정거장이 들리지도 보이지도 않고 표지판도 없는 구간)이 600 px를 넘는 길이 없다', () => {
    expect(validateRoadSightFiles(regionDefs)).toEqual([]);
    expect(longest(world.sights)).toBeLessThanOrEqual(BARE_STRETCH_MAX);
  });

  it('표본을 2 px로 촘촘히 훑어도 같다(8 px 표본이 긴 구간을 놓친 것이 아니다)', () => {
    expect(longest(world.sights, 2)).toBeLessThanOrEqual(BARE_STRETCH_MAX);
    expect(Math.abs(longest(world.sights, 2) - longest(world.sights, 8))).toBeLessThanOrEqual(16);
  });

  it('길목 표지판을 모두 빼면 바큇살 남쪽과 음계 길, 둘레길이 규칙을 어긴다(표지판이 필요한 곳이 이 셋이다)', () => {
    expect(roadsFlagged(world.sights.filter((s) => !WAYSIGN.test(s.id)))).toEqual(['loop', 'spoke-scale', 'spoke-south']);
  });

  it('길목 표지판은 하나도 군더더기가 아니다: 어느 하나를 빼도 규칙 1이 깨진다', () => {
    const waysigns = world.sights.filter((s) => WAYSIGN.test(s.id));
    expect(waysigns).toHaveLength(6);
    for (const w of waysigns) expect(validateRoadSight(world.roads, world.sights.filter((s) => s.id !== w.id)).length, `${w.id}을 빼면`).toBeGreaterThan(0);
  });

  it('발견 요소가 보이는 미리보기 채널에서는 빈 구간이 훨씬 짧고(250 px 안쪽), 발견 요소가 더해져 늘어나는 빈 구간은 없다', () => {
    const preview = [...world.sights, ...discoverySights('preview')];
    expect(discoverySights('preview')).toHaveLength(36 + 18 + 5);
    expect(validateRoadSight(world.roads, preview)).toEqual([]);
    expect(longest(preview)).toBeLessThan(250);
    expect(longest(preview)).toBeLessThanOrEqual(longest(world.sights));
  });

  it('정식 공개 채널은 공개된 발견 요소만 더해지므로, 몇 개가 공개되든(지금은 하나도 없다) 규칙 1을 지킨다', () => {
    const release = [...world.sights, ...discoverySights('release')];
    expect(validateRoadSight(world.roads, release)).toEqual([]);
    // 가장 나쁜 경우를 대신 보는 것이 맞으려면 공개 채널에서 보이는 것이 미리보기의 일부여야 한다
    const preview = new Set(discoverySights('preview').map((s) => s.id));
    for (const s of discoverySights('release')) expect(preview.has(s.id), s.id).toBe(true);
  });
});

// ───── 길목 표지판 여섯이 놓인 자리 ─────
const waysigns = WORLD_OBJECTS.filter((o) => WAYSIGN.test(o.id));
const rectOf = (o: (typeof WORLD_OBJECTS)[number]): { x0: number; y0: number; x1: number; y1: number } => ({ x0: o.x - o.ax * o.w, y0: o.y - o.ay * o.h, x1: o.x - o.ax * o.w + o.w, y1: o.y - o.ay * o.h + o.h });
const gap = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>): number => Math.hypot(Math.max(b.x0 - a.x1, a.x0 - b.x1, 0), Math.max(b.y0 - a.y1, a.y0 - b.y1, 0));
const readJson = (...parts: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf-8'));
const installationRects = fs
  .readdirSync(path.join(root, 'content', 'installations'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const def = readJson('content', 'installations', f) as { installationId: string; slots: never; slotMap?: never };
    const r = slotBounds(def as never);
    return { id: def.installationId, rect: { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h } };
  });
const spots = spotsOf(visibleDiscoveries(files, 'preview'));
const reach = reachableFrom(grid, PLAYER_START);

describe('길목 표지판(waysign-*)이 놓인 자리', () => {
  it('여섯 개: 바깥 지역의 이름과 번호가 붙고, 서 있는 지역의 표지판 그림을 쓴다(마을에는 표지판 그림이 없어 놓지 않는다)', () => {
    expect(waysigns.map((o) => o.id).sort()).toEqual(['waysign-beat-river-1', 'waysign-beat-river-2', 'waysign-bell-grove-1', 'waysign-key-marsh-1', 'waysign-key-marsh-2', 'waysign-staff-hill-1']);
    for (const o of waysigns) {
      const region = map.regionAt(o.x, o.y).regionId;
      expect(region, o.id).not.toBe('village');
      expect(o.id.startsWith(`waysign-${region}-`), o.id).toBe(true);
      expect(o.file, o.id).toBe(`obj-${region}-signpost.svg`);
      expect(o.kind, o.id).toBe('prop');
    }
  });

  it('길 곁에 있다: 길 가장자리에서 40–240 px 떨어져 길을 막지도 길에서 멀리 숨지도 않는다', () => {
    for (const o of waysigns) {
      const edge = Math.min(...world.roads.map((r) => distanceToRoads([r], o) - r.width / 2));
      expect(edge, o.id).toBeGreaterThanOrEqual(40);
      expect(edge, o.id).toBeLessThanOrEqual(240);
    }
  });

  it('지역 경계에서 100 px 넘게 안쪽이다', () => {
    for (const o of waysigns) {
      const b = regionBoundsPx(map.region(map.regionAt(o.x, o.y).regionId));
      expect(Math.min(o.x - b.x0, b.x1 - o.x, o.y - b.y0, b.y1 - o.y), o.id).toBeGreaterThanOrEqual(100);
    }
  });

  it('둘레 72 px의 열두 곳이 걸어서 닿는 땅이다(표지판이 스스로 막는 칸은 그 안쪽이라, 표지판이 덤불이나 물 한가운데 갇히지 않았다)', () => {
    for (const o of waysigns) {
      for (let a = 0; a < 360; a += 30) {
        const x = o.x + 72 * Math.cos((a * Math.PI) / 180);
        const y = o.y + 72 * Math.sin((a * Math.PI) / 180);
        const c = grid.cellOf(x, y);
        expect(grid.isBlockedCell(c.cx, c.cy), `${o.id} ${a}도`).toBe(false);
        expect(reach[c.cy * grid.cols + c.cx], `${o.id} ${a}도`).toBe(1);
      }
    }
  });

  it('나무 덮개와 다른 사물의 그림에서 24 px 넘게 떨어져 있고, 설치물이 놓인 자리에서 100 px 넘게 떨어져 있다', () => {
    for (const o of waysigns) {
      const mine = rectOf(o);
      for (const other of WORLD_OBJECTS) if (other.id !== o.id) expect(gap(mine, rectOf(other)), `${o.id} ~ ${other.id}`).toBeGreaterThan(24);
      for (const i of installationRects) expect(gap(mine, i.rect), `${o.id} ~ ${i.id}`).toBeGreaterThan(100);
    }
  });

  it('발견 요소, 정거장과 정거장의 서는 자리, 마을 사람이 서는 자리에서 150 px 넘게 떨어져 있어 그것들을 가리지 않는다', () => {
    const marks = [...spots.map((s) => ({ id: s.id, x: s.x, y: s.y })), ...map.stations.flatMap((s) => [{ id: s.stationId, x: s.x, y: s.y }, { id: `${s.stationId}.stand`, ...standOf(s) }]), ...RESIDENTS.map((r) => ({ id: r.residentId, x: r.x, y: r.y }))];
    for (const o of waysigns) for (const m of marks) expect(Math.hypot(m.x - o.x, m.y - o.y), `${o.id} ~ ${m.id}`).toBeGreaterThan(150);
  });
});

// ───── 규칙 2 ─────
describe('규칙 2 — 막다른 길 끝에는 발견 요소가 있다(월드 전체)', () => {
  const { geometry } = discoveryWorld(regionDefs);
  const ids = regionDefs.map((r) => r.regionId);
  const itemsOf = (id: RegionId): Array<{ id: string; x: number; y: number }> => {
    const f = files.find((x) => x.regionId === id)!;
    return f.items.map((d) => ({ id: d.discoveryId, x: d.x, y: d.y }));
  };

  it('막다른 길 끝은 마을에 셋(세 샛길의 끝), 바깥 지역에 하나씩(길이 지역 안에서 끝나는 표지)으로 모두 여덟이다', () => {
    const ends = Object.fromEntries(ids.map((id) => [id, deadEndsOf(geometry[id]!.roads, geometry[id]!.gates).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)]));
    expect(ends['village']!.sort()).toEqual(['2952,2475', '3237,3966', '4956,2256']);
    expect(ends['staff-hill']).toEqual(['4056,220']);
    expect(ends['beat-river']).toEqual(['7800,3081']);
    expect(ends['bell-grove']).toEqual(['1100,2600']);
    expect(ends['scale-trail']).toEqual(['7200,5600']);
    expect(ends['key-marsh']).toEqual(['2840,5100']);
    expect(Object.values(ends).flat()).toHaveLength(8);
  });

  it('모든 막다른 길 끝에서 200 px 안에 같은 지역의 발견 요소가 있다', () => {
    for (const id of ids) {
      for (const end of deadEndsOf(geometry[id]!.roads, geometry[id]!.gates)) {
        const near = itemsOf(id).filter((d) => Math.hypot(d.x - end.x, d.y - end.y) <= DEAD_END_RADIUS);
        expect(near.length, `${id} (${Math.round(end.x)}, ${Math.round(end.y)})`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('콘텐츠 검사(validateDiscoveries)도 같은 결론이고, 마을의 세 샛길 끝의 요소를 치우면 DEAD_END 문제가 된다(검사가 살아 있다)', () => {
    const { geometry: g, bounds } = discoveryWorld(regionDefs);
    const quests = new Set(Array.from({ length: 31 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`));
    expect(validateDiscoveries(files, { questIds: quests, geometry: g, bounds }).filter((i) => i.code === 'DEAD_END')).toEqual([]);
    const village = files.find((f) => f.regionId === 'village')!;
    for (const end of [{ x: 2952, y: 2475 }, { x: 4956, y: 2256 }, { x: 3237, y: 3966 }]) {
      const trimmed = { ...village, items: village.items.filter((d) => Math.hypot(d.x - end.x, d.y - end.y) > DEAD_END_RADIUS) };
      const issues = validateDiscoveries([trimmed], { questIds: quests, geometry: g, bounds });
      expect(issues.some((i) => i.code === 'DEAD_END' && i.message.includes(`(${end.x}, ${end.y})`)), `${end.x},${end.y}`).toBe(true);
    }
  });
});

// ───── 걷는 시간 ─────
type Walk = { sec: number; arrived: boolean; px: number };
function walk(from: Point, waypoints: readonly Point[]): Walk {
  let st = startPath(createPlayer(from.x, from.y), waypoints);
  let sec = 0;
  let px = 0;
  for (let i = 0; i < 60 * 300; i++) {
    const before = { x: st.x, y: st.y };
    const r = stepPlayer(st, { dx: 0, dy: 0 }, 1 / 60, grid);
    st = r.state;
    sec += 1 / 60;
    px += Math.hypot(st.x - before.x, st.y - before.y);
    if (r.arrived) return { sec, arrived: true, px };
    if (r.stuck) return { sec, arrived: false, px };
  }
  return { sec, arrived: false, px };
}
const pathLength = (pts: readonly Point[]): number => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);

describe('걷는 시간(3.1, 3.4) — 실제 걸음 계산(220 px/초)으로', () => {
  it('3.4 표의 다섯 길을 문에서 지역의 표지까지 걸으면 닿고, 걸린 시간이 표(8, 10, 7, 8, 17초)와 같다', () => {
    for (const row of ROUTE_TABLE) {
      const r = walk(row.gate!, row.via);
      expect(r.arrived, row.id).toBe(true);
      expect(Math.round(r.sec), row.id).toBe(row.seconds);
      // 표의 길이를 속도로 나눈 값보다 빠를 수 없고, 모퉁이의 표지판을 돌아가는 정도(1초 안쪽)만 더 걸린다
      expect(r.sec - row.lengthPx / WALK_SPEED, row.id).toBeGreaterThan(-0.05);
      expect(r.sec - row.lengthPx / WALK_SPEED, row.id).toBeLessThan(1);
    }
  });

  it('길을 따라가지 않고 표지를 눌러 걸어도(길찾기) 닿고, 표의 시간보다 오래 걸리지 않는다(길 밖 풀밭도 걸을 수 있다, 규칙 3)', () => {
    for (const row of ROUTE_TABLE) {
      const end = row.via[row.via.length - 1]!;
      const found = findPath(grid, row.gate!, end);
      expect(found, row.id).not.toBeNull();
      const r = walk(row.gate!, found!.waypoints);
      expect(r.arrived, row.id).toBe(true);
      expect(r.sec, row.id).toBeLessThanOrEqual(row.lengthPx / WALK_SPEED + 0.5);
    }
  });

  it('둘레길은 그려진 대로 한 바퀴를 끝까지 걸을 수 있고, 걸린 시간이 설계서의 68초에서 2초 안쪽이다(그려진 길은 꺾은선 14,990 px보다 약간 긴 약 15,310 px)', () => {
    const loop = outerRoads().find((r) => r.id === 'loop')!.points;
    const r = walk(loop[0]!, loop.slice(1));
    expect(r.arrived).toBe(true);
    expect(Math.abs(r.sec - LOOP_SECONDS)).toBeLessThan(2);
    expect(pathLength(loop)).toBeGreaterThan(pathLength(LOOP_POINTS));
    expect(pathLength(loop)).toBeLessThan(pathLength(LOOP_POINTS) * 1.03);
  });

  it('바큇살 길 가운데 북·동·서·남은 그려진 길을 가운데 줄을 따라 끝까지 걸을 수 있고, 표보다 1초 안쪽으로 더 걸린다', () => {
    for (const id of ['spoke-north', 'spoke-east', 'spoke-west', 'spoke-south']) {
      const row = ROUTE_TABLE.find((x) => x.id === id)!;
      const pts = outerRoads().find((r) => r.id === id)!.points;
      const r = walk(pts[0]!, pts.slice(1));
      expect(r.arrived, id).toBe(true);
      expect(r.sec - row.seconds, id).toBeGreaterThan(0);
      expect(r.sec - row.seconds, id).toBeLessThan(1);
    }
  });

  it('월드를 가로로 끝에서 끝까지는 약 37초, 광장에서 각 지역 표지까지 직선으로 11–18초다(3.1)', () => {
    expect(Math.round(WORLD_W / WALK_SPEED)).toBe(37);
    const plaza = { x: 4056, y: 3081 };
    for (const r of regionDefs) {
      if (r.regionId === 'village') continue;
      const sec = Math.round(Math.hypot(r.landmark.x - plaza.x, r.landmark.y - plaza.y) / WALK_SPEED);
      expect(sec, r.regionId).toBeGreaterThanOrEqual(11);
      expect(sec, r.regionId).toBeLessThanOrEqual(18);
    }
  });

  it('정거장 사이 가장 가까운 이웃까지의 평균이 설계서의 볼거리 사이 평균(약 750 px, 걸어서 3–4초)이고, 발견 요소와 놀이 악기까지 더하면 더 촘촘하다', () => {
    const nearest = (pts: ReadonlyArray<{ x: number; y: number }>): number => pts.reduce((sum, a) => sum + Math.min(...pts.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))), 0) / pts.length;
    const stations = world.sights.filter((s) => s.kind === 'station');
    const all = [...stations, ...discoverySights('preview')];
    expect(stations).toHaveLength(23);
    expect(nearest(stations)).toBeGreaterThanOrEqual(660);
    expect(nearest(stations)).toBeLessThanOrEqual(880);
    expect(nearest(all)).toBeLessThan(nearest(stations));
  });
});

// 길 데이터 자체가 이 시험의 전제(길이 하나도 빠지지 않았다)
describe('시험의 전제', () => {
  it('길은 모두 점이 둘 이상이고 폭이 양수다', () => {
    for (const r of world.roads as RoadLine[]) {
      expect(r.points.length, r.id).toBeGreaterThan(1);
      expect(r.width, r.id).toBeGreaterThan(0);
    }
  });
});
