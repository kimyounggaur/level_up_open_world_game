// 월드 바닥과 충돌의 조립(설계서 10.5). 순수 계산이다: 같은 입력이면 같은 결과가 나온다.
// 굽기 도구(tools/build-world.ts)가 이 결과를 그림 조각과 생성 파일로 옮기고, 테스트가 다시 계산해 생성 파일이 낡지 않았는지 확인한다.
import { PLAYER_START, REGION_IDS, TILE, WORLD_H, WORLD_TILES_X, WORLD_TILES_Y, WORLD_W, WorldMap, standOf } from '../src/domain/world';
import type { RegionDef } from '../src/domain/world';
import type { Rect } from '../src/world/interact';
import { reachableFrom } from '../src/world/nav';
import type { NavGrid, Point } from '../src/world/nav';
import type { WorldObjectData } from '../src/world/objects';
import { COLOR } from './palette';
import { grassSvg, roadDecorSvg } from './art/ground';
import { roadsSvg } from './curves';
import type { RoadSegment } from './curves';
import { RIVER_HALF_WIDTH, bridgeSvg, bridgeWalkable, fenceSvg, fordColliders, fordSvg, millPondColliders, millPondSvg, outerPatchesSvg, outerRoads, riverCenter, riverSvg } from './outer';
import { placeAll, shadowsSvg } from './placements';
import type { Placed } from './placements';
import { closeNarrowGaps, edgeColliders, findNarrowCells, rasterize } from './shapes';
import type { Collider } from './shapes';
import { keyBridgeColliders, keyBridgeWalkable, keyBridgesSvg } from './keyBridge';
import { trailStonesSvg } from './stones';
import type { TiledMap } from './tiled';
import { villageColliders, villageFrontSvg, villageHits, villagePatchesSvg, villageRoads, villageStandaloneSvg } from './village';

/** 사물 원본(6-3): 지도 파일에 놓인 사물과 사물 그림. 파일에서 읽는 일은 tools/world-source.ts가 한다 */
export interface WorldSource {
  /** 지도(world-src/regions/*.tmj)를 읽는 차례대로. 앞 지도의 사물이 먼저 놓인다 */
  maps: TiledMap[];
  /** 사물 그림 원본: 파일 이름 → SVG 글(world-src/sprites/) */
  sprites: Record<string, string>;
  /** 파일을 읽는 동안 나온 문제 */
  issues: string[];
}

export interface WorldBuild {
  /** 월드 좌표로 적은 SVG 조각들(<svg> 껍데기 없이). 바닥 조각 48장이 이 그림의 서로 다른 부분이다 */
  svgBody: string;
  /** 칸마다 지역 번호(REGION_IDS의 순서). 바닥색 밑칠에 쓴다 */
  regionTiles: Uint8Array;
  grid: NavGrid;
  colliders: Collider[];
  objects: WorldObjectData[];
  /** 사물 그림 파일 이름 → SVG 글 */
  sprites: Record<string, string>;
  /** 정거장 id → 누르기 영역 */
  hits: Record<string, Rect>;
  /** 정거장 id → 서는 자리 */
  stands: Record<string, Point>;
  /** 굽는 동안 확인한 문제. 비어 있어야 한다 */
  issues: string[];
  /** 로그용 숫자 */
  stats: { trees: number; signs: number; props: number; freeCells: number; reachableCells: number; narrowCells: number; closedGaps: Array<{ cx: number; cy: number }> };
}

/** 바닥 점 무늬: 시안과 같다(24 px 간격, 원 (4, 4) r 1, 투명도 .28)의 3배 */
export const DOT_PATTERN_DEFS = `<defs><pattern id="groundDots" width="72" height="72" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="3" fill="${COLOR.dot}" opacity=".28"/></pattern></defs>`;

interface Layout {
  roads: RoadSegment[];
  river: Point[];
}

function layout(): Layout {
  return { roads: [...villageRoads(), ...outerRoads()], river: riverCenter() };
}

function groundBody(regions: readonly RegionDef[], l: Layout, placed: Placed): string {
  return [
    outerPatchesSvg(regions),
    villagePatchesSvg(),
    // 햇살 과슈 화풍의 풀 결(D-308): 시안의 점 무늬 대신 반투명한 풀 포기와 들꽃. 바닥색과 얼룩 위, 길 아래에 깐다
    grassSvg(WORLD_W, WORLD_H),
    roadsSvg(l.roads),
    roadDecorSvg(l.roads, COLOR.road, COLOR.roadEdge),
    villageFrontSvg(),
    // 음계 길의 디딤돌(7-2): 길 위, 나무 그림자 아래
    trailStonesSvg(),
    shadowsSvg(placed.shadows),
    fenceSvg(),
    riverSvg(),
    fordSvg(),
    millPondSvg(),
    bridgeSvg(),
    // 건반 늪의 건반 다리 셋(7-3): 늪 웅덩이와 널. 널 위에 이름·표식을 올려 그리는 것은 설치물 층이다
    keyBridgesSvg(),
  ].join('');
}

export function buildWorld(regions: readonly RegionDef[], source: WorldSource): WorldBuild {
  const map = new WorldMap(regions);
  const issues: string[] = [...source.issues];
  const l = layout();
  const { river } = l;
  const placed = placeAll(source.maps, source.sprites);
  issues.push(...placed.issues);
  const svgBody = groundBody(regions, l, placed);

  const colliders: Collider[] = [...edgeColliders(), ...villageColliders(), ...placed.colliders, { kind: 'thickLine', points: river, halfWidth: RIVER_HALF_WIDTH, note: '박자 강' }, ...fordColliders(), ...millPondColliders(), ...keyBridgeColliders()];
  const grid = rasterize(colliders, [...bridgeWalkable(), ...keyBridgeWalkable()]);
  // 폭 1칸 틈은 통로로 치지 않고 메운다(3.8). 어디를 메웠는지는 stats에 남긴다
  const closedGaps = closeNarrowGaps(grid);

  // 사물: 지도에 놓인 것. 발 위치의 y 순서로 정렬되어 있다
  const objects: WorldObjectData[] = placed.objects;
  const sprites: Record<string, string> = { ...source.sprites };
  for (const o of objects) if (!(o.file in sprites)) issues.push(`${o.id}: 그림 ${o.file}이 없어요`);

  const hits: Record<string, Rect> = { ...villageHits(), ...placed.hits };
  const stands: Record<string, Point> = {};
  for (const s of map.stations) stands[s.stationId] = standOf(s);

  // 지역 번호 칸 표
  const regionTiles = new Uint8Array(WORLD_TILES_X * WORLD_TILES_Y);
  REGION_IDS.forEach((id, i) => {
    const b = map.region(id).boundsTiles;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) regionTiles[y * WORLD_TILES_X + x] = i;
  });

  // ───── 굽는 동안의 점검 ─────
  const startBlocked = grid.circleHitsBlocked(PLAYER_START.x, PLAYER_START.y);
  if (startBlocked) issues.push(`시작 위치(${PLAYER_START.x}, ${PLAYER_START.y})가 막혀 있어요`);
  const reach = reachableFrom(grid, PLAYER_START);
  let reachableCells = 0;
  reach.forEach((v) => {
    if (v) reachableCells++;
  });

  for (const s of map.stations) {
    const st = stands[s.stationId]!;
    if (grid.circleHitsBlocked(st.x, st.y)) issues.push(`${s.stationId}의 서는 자리(${st.x}, ${st.y})가 막혀 있어요`);
    else {
      const c = grid.cellOf(st.x, st.y);
      if (!reach[c.cy * grid.cols + c.cx]) issues.push(`${s.stationId}의 서는 자리(${st.x}, ${st.y})에 시작 위치에서 걸어 닿지 못해요`);
    }
    const hit = hits[s.stationId];
    if (!hit) issues.push(`${s.stationId}의 누르기 영역이 없어요`);
    else if (hit.w <= 0 || hit.h <= 0) issues.push(`${s.stationId}의 누르기 영역 크기가 0이에요`);
  }
  if (map.stations.length !== 23) issues.push(`정거장이 ${map.stations.length}곳이에요(23곳이어야 해요)`);

  const narrow = findNarrowCells(grid, reach);
  for (const n of narrow.slice(0, 20)) issues.push(`폭 1칸 통로: (${n.cx}, ${n.cy}) = 월드 (${n.cx * TILE}, ${n.cy * TILE})`);
  if (narrow.length > 20) issues.push(`폭 1칸 통로가 모두 ${narrow.length}곳이에요`);

  return {
    svgBody,
    regionTiles,
    grid,
    colliders,
    objects,
    sprites,
    hits,
    stands,
    issues,
    stats: { trees: objects.filter((o) => o.kind === 'tree').length, signs: objects.filter((o) => o.kind === 'sign').length, props: objects.filter((o) => o.kind === 'prop').length, freeCells: grid.freeCount(), reachableCells, narrowCells: narrow.length, closedGaps },
  };
}

/** 시안 B01과 나란히 놓아 볼 때 쓰는 마을 장면: 바닥색과 점 무늬 위에 마을만 그린 SVG 조각(월드 좌표) */
export const villagePreviewBody = (): string => `<rect x="${ORIGIN_X}" y="${ORIGIN_Y}" width="3000" height="2100" fill="${COLOR.ground}"/>${DOT_PATTERN_DEFS}<rect x="${ORIGIN_X}" y="${ORIGIN_Y}" width="3000" height="2100" fill="url(#groundDots)"/>${villageStandaloneSvg()}`;
const ORIGIN_X = 2592;
const ORIGIN_Y = 2016;
