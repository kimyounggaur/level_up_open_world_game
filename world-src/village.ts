// 음악 마을의 원본(설계서 3.3). 시안 B01의 도형을 시안 좌표 그대로 적고, 3배로 키워 월드 가운데에 놓는다.
//   변환식: 월드 x = 2592 + 3 × 시안 x, 월드 y = 2016 + 3 × 시안 y
// 같은 데이터에서 바닥 그림(SVG), 충돌 도형, 정거장의 누르기 영역을 뽑는다. 나무는 지도 파일(village.tmj)에 놓인다(6-3).
import type { Rect } from '../src/world/interact';
import type { Collider } from './shapes';
import { circle, line, num, path, rect, splitAlpha } from './shapes';
import { COLOR } from './palette';
import { roadsSvg } from './curves';
import type { RoadSegment } from './curves';
import { treeCanopyInlineSvg, treeShadowSvg } from './trees';
import type { TreeSpec } from './trees';

export const ORIGIN = { x: 2592, y: 2016 } as const;
export const SCALE = 3;
export const toWorldX = (x: number): number => ORIGIN.x + SCALE * x;
export const toWorldY = (y: number): number => ORIGIN.y + SCALE * y;
const worldRect = (x: number, y: number, w: number, h: number): Rect => ({ x: toWorldX(x), y: toWorldY(y), w: SCALE * w, h: SCALE * h });
const inVillage = (inner: string): string => `<g transform="translate(${ORIGIN.x} ${ORIGIN.y}) scale(${SCALE})">${inner}</g>`;

// ───── 바닥 위의 면(시안 좌표) ─────
const PATCHES: ReadonlyArray<{ d: string; fill: string }> = [
  { d: 'M-15 95C120 35 200 70 300 38S460-4 542 10L560 95C440 72 346 114 248 135S75 115-15 170Z', fill: COLOR.patchA },
  { d: 'M40 560C100 505 230 552 269 620L291 714H-6V580Z', fill: COLOR.patchA },
  { d: 'M900 451c-51-24-98 6-103 54-6 48 42 80 112 65s90-31 91-87v-37Z', fill: COLOR.patchB },
];

export const villagePatchesSvg = (): string => inVillage(PATCHES.map((p) => path(p.d, { fill: p.fill })).join(''));

// ───── 길(3.3 표). 폭 62(월드 186) ─────
const ROAD_W = 62 * SCALE;
const road = (id: string, x1: number, y1: number, x2: number, y2: number): RoadSegment => ({ id, width: ROAD_W, points: [{ x: toWorldX(x1), y: toWorldY(y1) }, { x: toWorldX(x2), y: toWorldY(y2) }] });

export const villageRoads = (): RoadSegment[] => [
  road('village-east-west', 35, 355, 958, 355),
  road('village-north-south', 488, 42, 488, 678),
  road('village-north-west', 120, 153, 488, 153),
  road('village-north-east', 788, 350, 788, 80),
  road('village-south-west', 215, 355, 215, 650),
  road('village-scale', 488, 551, 945, 551),
];

/** 마을의 출구 다섯 곳(3.3, 월드 px): 북문, 동문, 서문, 남문, 음계길 문. 길의 끝이 문 가까이면 막다른 길이 아니다(발견 요소 검사) */
export const VILLAGE_GATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 4056, y: 2016 },
  { x: 5600, y: 3081 },
  { x: 2592, y: 3081 },
  { x: 4056, y: 4128 },
  { x: 5600, y: 3669 },
];

export const PLAZA = { cx: 488, cy: 355 } as const;

// ───── 건물(작업대 셋) ─────
interface BuildingSpec {
  stationId: string;
  name: string;
  /** 지붕 (x, y, 너비, 높이) 시안 좌표 */
  roof: readonly [number, number, number, number];
  roofColor: string;
  diamondColor: string;
  /** 지붕 위 무늬(창, 건반 따위). 시안 좌표 */
  extras: string[];
}

const KEYS = [173, 186, 199, 212, 225, 238, 251];
const BLACK_KEYS = new Set([186, 225]);

const BUILDINGS: readonly BuildingSpec[] = [
  {
    stationId: 'H1',
    name: '음자리 작업대',
    roof: [106, 172, 206, 118],
    roofColor: '#587F75',
    diamondColor: '#6F9687',
    extras: [rect(137, 202, 54, 35, '#CBD8BF', { rx: 2 }), rect(228, 204, 53, 35, '#CBD8BF', { rx: 2 })],
  },
  {
    stationId: 'H2',
    name: '리듬 작업대',
    roof: [693, 126, 190, 128],
    roofColor: '#B46E53',
    diamondColor: '#CA8B67',
    extras: [rect(723, 153, 45, 54, '#D8AD7E', { rx: 3 }), circle(745, 178, 15, '#805B41'), circle(745, 178, 10, '#BA9970'), rect(809, 162, 42, 41, '#E4C3A1', { rx: 2 })],
  },
  {
    stationId: 'H3',
    name: '화음 작업대',
    roof: [128, 484, 198, 112],
    roofColor: '#A58F58',
    diamondColor: '#C2AA70',
    extras: [rect(167, 509, 104, 56, '#E5D4A6', { rx: 2 }), ...KEYS.map((x) => rect(x, 516, 11, 42, BLACK_KEYS.has(x) ? '#334F48' : '#FCF6DE', { rx: 1 }))],
  },
];

/** 정거장의 누르기 영역(월드 px). 건물은 지붕과 문 앞 디딤판까지 */
const BUILDING_HITS: Readonly<Record<string, Rect>> = Object.fromEntries(
  BUILDINGS.map((b) => {
    const [x, y, w, h] = b.roof;
    return [b.stationId, worldRect(x, y, w, h + 17)];
  }),
);

// ───── 울타리 ─────
const HEDGES: ReadonlyArray<readonly [number, number, number, number]> = [
  [655, 486, 241, 19],
  [655, 594, 241, 19],
  [576, 201, 22, 102],
  [348, 52, 110, 18],
  [52, 637, 87, 16],
];

// ───── 디딤돌 ─────
/** 시안은 7개이고 Q07이 여덟 자리를 쓰므로 8개로 늘린다(3.3). 돌 속 점의 색은 풀빛에서 볕빛으로 이어진다 */
export const STONE_DOTS = ['#728F6F', '#799975', '#809E7A', '#8AAA80', '#9AB383', '#AFBC85', '#C2C58B', '#D2CE92'] as const;
export const STONE_COUNT = STONE_DOTS.length;
/** 돌 하나의 시안 좌표: x = 661 + 33i, y = 521, 27×51 */
export const stoneRect = (i: number): [number, number, number, number] => [661 + 33 * i, 521, 27, 51];

// ───── 나무 ─────
/** 캐노피 가운데와 반지름(시안 좌표) */
const TREE_MOCK: ReadonlyArray<{ cx: number; cy: number; r: number }> = [
  { cx: 939, cy: 614, r: 32 },
  { cx: 956, cy: 92, r: 27 },
  { cx: 581, cy: 119, r: 31 },
  { cx: 63, cy: 257, r: 22 },
  { cx: 64, cy: 494, r: 30 },
  { cx: 351, cy: 566, r: 25 },
  { cx: 353, cy: 213, r: 23 },
  { cx: 618, cy: 648, r: 25 },
  { cx: 904, cy: 295, r: 25 },
];

/** 처음 지도(village.tmj)를 만들 때 쓴 나무 아홉 그루의 자리. 지금 원본은 지도 파일이고, 시안과 나란히 놓아 볼 때만 쓴다 */
export const villageTrees = (): TreeSpec[] => TREE_MOCK.map((t, i) => ({ id: `tree-village-${i + 1}`, regionId: 'village', cx: toWorldX(t.cx), cy: toWorldY(t.cy), r: t.r * SCALE }));

const BENCH = { x: 568, y: 456, w: 54, h: 29 } as const;

/** 마을의 앞쪽 그림: 합주 광장, 건물, 울타리, 디딤돌, 의자. 길 위에 그린다 */
export function villageFrontSvg(): string {
  const parts: string[] = [];
  const { cx, cy } = PLAZA;
  parts.push(circle(cx, cy, 120, COLOR.plazaOuter), circle(cx, cy, 111, COLOR.plaza));
  parts.push(circle(cx, cy, 96, 'none', { stroke: COLOR.plazaRing, 'stroke-width': 2 }), circle(cx, cy, 79, 'none', { stroke: COLOR.plazaRing, 'stroke-width': 2 }));
  parts.push(rect(435, 300, 106, 47, COLOR.stage, { rx: 8 }), rect(443, 295, 90, 38, COLOR.stageTop, { rx: 4 }));
  parts.push(line(450, 305, 527, 305, COLOR.stageLine, { 'stroke-width': 2 }), line(450, 316, 527, 316, COLOR.stageLine, { 'stroke-width': 2 }));
  for (const [x, y] of [[418, 373], [441, 398], [478, 407], [515, 398], [538, 373]] as const) parts.push(rect(x, y, 20, 12, COLOR.stool, { rx: 3 }));
  parts.push(circle(cx, cy, 128, 'none', { stroke: COLOR.teal, 'stroke-width': 3 }), circle(cx, cy, 135, 'none', { stroke: COLOR.white, 'stroke-width': 3 }));

  for (const b of BUILDINGS) {
    const [x, y, w, h] = b.roof;
    const mx = x + w / 2;
    const my = y + h / 2;
    parts.push(rect(x + 7, y + 12, w, h, COLOR.buildingShadow, { rx: 12 }));
    parts.push(rect(x, y, w, h, b.roofColor, { rx: 10 }));
    parts.push(path(`M${num(x)} ${num(my)}L${num(mx)} ${num(y + 14)}L${num(x + w)} ${num(my)}L${num(mx)} ${num(y + h - 14)}Z`, { fill: b.diamondColor }));
    const l1 = splitAlpha('#FFFFFF55');
    const l2 = splitAlpha('#FFFFFF44');
    parts.push(line(x + 18, my, x + w - 18, my, l1.color, { 'stroke-width': 2, 'stroke-opacity': l1.opacity }));
    parts.push(line(mx, y + 14, mx, y + h - 14, l2.color, { 'stroke-width': 2, 'stroke-opacity': l2.opacity }));
    parts.push(rect(mx - 22, y + h - 3, 44, 17, COLOR.doorStep, { rx: 2 }), line(mx - 26, y + h + 17, mx + 26, y + h + 17, COLOR.doorLine, { 'stroke-width': 2 }));
  }
  for (const b of BUILDINGS) parts.push(...b.extras);

  for (const [x, y, w, h] of HEDGES) {
    const rx = Math.min(w, h) / 2;
    parts.push(rect(x + 3, y + 5, w, h, COLOR.hedgeShadow, { rx }), rect(x, y, w, h, COLOR.hedge, { rx }));
  }

  for (let i = 0; i < STONE_COUNT; i++) {
    const [x, y, w, h] = stoneRect(i);
    parts.push(rect(x, y, w, h, COLOR.stone, { rx: 4, stroke: COLOR.stoneEdge, 'stroke-width': 1 }), circle(x + 13.5, 548, 5, STONE_DOTS[i]!));
  }

  parts.push(rect(BENCH.x, BENCH.y, BENCH.w, 12, COLOR.benchSeat, { rx: 3 }), rect(BENCH.x, 475, BENCH.w, 9, COLOR.benchDark, { rx: 2 }), rect(569, 456, 4, 29, COLOR.benchDark), rect(617, 456, 4, 29, COLOR.benchDark));

  // 나무 그림자는 이 그림에 넣지 않는다. 나무는 지도(world-src/regions/village.tmj)에 놓이고, 그림자는 모든 나무가 한꺼번에 바닥에 굽는다(6-3)
  return inVillage(parts.join(''));
}

/** 시안과 나란히 놓아 볼 때만 쓰는, 바닥 위에 직접 얹는 마을 나무 캐노피 */
export const villageCanopiesSvg = (): string => villageTrees().map(treeCanopyInlineSvg).join('');

// ───── 충돌 ─────
export function villageColliders(): Collider[] {
  const out: Collider[] = [];
  for (const b of BUILDINGS) out.push({ kind: 'rect', ...worldRect(...b.roof), note: `${b.name} 지붕` });
  HEDGES.forEach((h, i) => out.push({ kind: 'rect', ...worldRect(...h), note: `울타리 ${i + 1}` }));
  out.push({ kind: 'rect', ...worldRect(BENCH.x, BENCH.y, BENCH.w, BENCH.h), note: '의자' });
  return out;
}

/** 디딤돌 줄 전체의 누르기 영역(H4)과 합주 무대의 누르기 영역(H5: 무대 윗면과 걸상까지) */
const STONES_HIT: Rect = worldRect(661, 521, 33 * (STONE_COUNT - 1) + 27, 51);
const STAGE_HIT: Rect = worldRect(435, 295, 106, 130);

/** 시안에서 마을 안에 있는 정거장의 누르기 영역 */
export const villageHits = (): Record<string, Rect> => ({ ...BUILDING_HITS, H4: STONES_HIT, H5: STAGE_HIT });

/** 마을만 따로 그린 그림(시안과 나란히 놓아 볼 때). 월드 좌표의 SVG 조각이며 밑바닥 색과 점 무늬를 포함하지 않는다 */
export const villageStandaloneSvg = (): string => `${villagePatchesSvg()}${roadsSvg(villageRoads())}${villageFrontSvg()}${villageTrees().map(treeShadowSvg).join('')}${villageCanopiesSvg()}`;
