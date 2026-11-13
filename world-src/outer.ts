// 마을 바깥의 원본: 지역별 풀밭 얼룩, 바큇살 길과 둘레길(3.4), 박자 강가의 강과 다리(3.5), 월드 가장자리의 울타리(3.8),
// 나무, 아직 만들지 않은 정거장의 표지판. 월드 좌표(px)로 적는다.
import type { RegionDef, RegionId } from '../src/domain/world';
import { REGION_IDS, WORLD_H, WORLD_W, regionBoundsPx, standOf } from '../src/domain/world';
import type { Rect } from '../src/world/interact';
import type { Point } from '../src/world/nav';
import { COLOR, ACCENT, groundTint, mixHex } from './palette';
import { catmullRom, distToPolyline, offsetPolyline, polylineD } from './curves';
import type { RoadSegment } from './curves';
import { EDGE_BAND } from './shapes';
import type { Collider, RectShape, WalkRect } from './shapes';
import { circle, num, path, rect } from './shapes';
import { TRUNK_RADIUS, treeCollider, treeFoot } from './trees';
import type { TreeSpec } from './trees';

const P = (x: number, y: number): Point => ({ x, y });

// ───── 길 (3.4) ─────
export const SPOKE_WIDTH = 186;
export const LOOP_WIDTH = 124;

/** 샛길 폭(3.4). 길에서 발견 요소나 놀이 악기로 이어진다 */
export const SIDE_PATH_WIDTH = 62;

/** 바큇살 길 다섯 개. 마을 안 길의 끝에서 이어 각 지역의 표지까지 간다. 그리는 점이다: 마을 안쪽의 한 점에서 시작한다 */
export const SPOKES: ReadonlyArray<readonly [string, readonly Point[]]> = [
  ['spoke-north', [P(4056, 2142), P(4056, 1560), P(4056, 220)]],
  ['spoke-east', [P(5466, 3081), P(6400, 3081), P(7000, 3081), P(7800, 3081)]],
  ['spoke-west', [P(2697, 3081), P(1900, 2900), P(1100, 2600)]],
  ['spoke-south', [P(4056, 4050), P(4056, 4700), P(2900, 5100), P(2840, 5100)]],
  ['spoke-scale', [P(5427, 3669), P(5600, 3669), P(5800, 4300), P(5400, 4800), P(6100, 5300), P(6800, 5000), P(7200, 5600)]],
];

/** 3.4의 길 표: 마을 문에서 지역의 표지까지 지나는 점과, 그 점들을 직선으로 이은 길이(px)와 걷는 시간(초). 시험이 그리는 길과 맞춰 본다 */
export interface RouteRow {
  /** 그리는 길의 id(SPOKES) */
  id: string;
  /** 표의 이름 */
  name: string;
  /** 마을 문(3.3의 다섯 문). 둘레길은 문이 없다 */
  gate: Point | null;
  /** 문 다음에 지나는 점들. 마지막이 지역의 표지다 */
  via: readonly Point[];
  lengthPx: number;
  seconds: number;
}

export const ROUTE_TABLE: readonly RouteRow[] = [
  { id: 'spoke-north', name: '북쪽', gate: P(4056, 2016), via: [P(4056, 1560), P(4056, 220)], lengthPx: 1796, seconds: 8 },
  { id: 'spoke-east', name: '동쪽', gate: P(5600, 3081), via: [P(6400, 3081), P(7000, 3081), P(7800, 3081)], lengthPx: 2200, seconds: 10 },
  { id: 'spoke-west', name: '서쪽', gate: P(2592, 3081), via: [P(1900, 2900), P(1100, 2600)], lengthPx: 1570, seconds: 7 },
  { id: 'spoke-south', name: '남쪽', gate: P(4056, 4128), via: [P(4056, 4700), P(2900, 5100), P(2840, 5100)], lengthPx: 1855, seconds: 8 },
  { id: 'spoke-scale', name: '음계 길', gate: P(5600, 3669), via: [P(5800, 4300), P(5400, 4800), P(6100, 5300), P(6800, 5000), P(7200, 5600)], lengthPx: 3645, seconds: 17 },
];

/** 둘레길: 마을을 거치지 않고 지역에서 지역으로 가는 길. 3.4의 점들이다(처음과 끝이 같다). 약 14,990 px, 68초 */
export const LOOP_POINTS: readonly Point[] = [P(4056, 1560), P(6300, 1500), P(6400, 3081), P(6200, 4500), P(4056, 4700), P(1900, 4600), P(1400, 3081), P(1900, 1500), P(4056, 1560)];
export const LOOP_LENGTH_PX = 14990;
export const LOOP_SECONDS = 68;

export function outerRoads(): RoadSegment[] {
  const out: RoadSegment[] = SPOKES.map(([id, pts]) => ({ id, width: SPOKE_WIDTH, points: catmullRom(pts, { step: 24 }) }));
  out.push({ id: 'loop', width: LOOP_WIDTH, points: catmullRom(LOOP_POINTS, { closed: true, step: 24 }) });
  return out;
}

// ───── 강과 다리 (3.5 박자 강가) ─────
export const RIVER_HALF_WIDTH = 150;
/** 중심선. 월드 밖에서 시작해 월드 밖으로 나간다 */
export const riverCenter = (): Point[] => catmullRom([P(7112, -160), P(7100, 0), P(6950, 1500), P(7000, 3081), P(7150, 4128), P(7300, 4500), P(7640, 4960), P(8192, 5400), P(8340, 5540)], { step: 16 });

/** 동쪽 길의 다리: 칸 경계에 맞춘다(x 6784–7232 = 212–225칸, y 3008–3168 = 94–98칸). 가운데 칸들은 물 위라 따로 연다 */
export const BRIDGE = { x: 6784, y: 3008, w: 448, h: 160 } as const;
export const bridgeWalkable = (): WalkRect[] => [{ ...BRIDGE, note: '동쪽 다리' }];

export function riverSvg(): string {
  const c = riverCenter();
  const d = polylineD(c);
  const stroke = (dd: string, color: string, w: number, extra: Record<string, string | number> = {}): string => path(dd, { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
  const parts = [stroke(d, COLOR.bank, RIVER_HALF_WIDTH * 2 + 56), stroke(d, COLOR.water, RIVER_HALF_WIDTH * 2), stroke(d, COLOR.waterLight, 190)];
  [-72, 0, 72].forEach((off, i) => parts.push(stroke(polylineD(offsetPolyline(c, off)), COLOR.ripple, 5, { 'stroke-dasharray': '40 170', 'stroke-dashoffset': i * 70 })));
  return parts.join('');
}

/**
 * 징검다리가 놓이는 여울목(4.4): 강이 480 px로 넓어진 물웅덩이. 돌이 이 위에 놓이므로 걸어 들어갈 수 없다(돌은 건너는 수단이 아니라 악기다, W-1).
 * 칸(32 px) 경계에 맞춘 사각형이라 그림과 막힌 칸이 같다(3.8: 보이지 않는 벽을 쓰지 않는다). 가운데가 정거장의 줄(480 × 96)이다.
 * 줄의 한 칸은 60 px(8분음표)이고 한 박은 120 px이다. 줄 양끝은 x 6760–7240이다.
 * 잔물결 수로(E3, 확대형)는 같은 물웅덩이를 세로로 길게 세운 것이다: 줄이 위에서 아래로 흐르고(axis 'y') 한 박은 480 px(1 px = 2틱)이다.
 */
export interface Ford {
  stationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 줄이 흐르는 방향. 없으면 가로('x') */
  axis?: 'x' | 'y';
  /** 줄의 첫 칸이 시작하는 좌표(흐르는 방향)와 한 박의 길이(px). 박 말뚝을 이 간격으로 세운다 */
  laneStart: number;
  beatPx: number;
  /**
   * 제방: 물웅덩이와 강 둑 사이에 한 칸(32 px) 폭으로 남는 좁은 틈을 둑 색 땅으로 메운다. 그림과 막힌 칸이 같다(3.8: 통로는 64 px 이상, 보이지 않는 벽 없음).
   * 칸 경계에 맞춘 사각형이다
   */
  levees?: readonly { x: number; y: number; w: number; h: number }[];
}
export const FORDS: readonly Ford[] = [
  { stationId: 'E1', x: 6752, y: 2720, w: 512, h: 160, laneStart: 6760, beatPx: 120 },
  { stationId: 'E2', x: 6752, y: 3520, w: 512, h: 160, laneStart: 6760, beatPx: 120 },
  // E3: 줄 x 6656–6752(96 px), y 700–2620(1920 px = 4박). 왼쪽 박 번호 띠(44 px)와 오른쪽 뗏목 표지 띠(32 px)가 같은 물 안에 든다.
  // 강 둑이 물웅덩이에서 y 864–1216에서는 두 칸, 그 밖에서는 바로 붙어 있어서, 한 칸 폭으로 남는 틈 둘(제방)을 둑 색으로 메운다
  {
    stationId: 'E3',
    x: 6624,
    y: 672,
    w: 160,
    h: 1984,
    axis: 'y',
    laneStart: 700,
    beatPx: 480,
    levees: [
      { x: 6784, y: 864, w: 32, h: 352 },
      { x: 6784, y: 2624, w: 32, h: 32 },
    ],
  },
];
/** 박 말뚝의 수: 4/4 한 마디의 박 경계(4박 = 5개) */
const FORD_BEATS = 4;
export const fordColliders = (): RectShape[] =>
  FORDS.flatMap((f): RectShape[] => [
    { kind: 'rect', x: f.x, y: f.y, w: f.w, h: f.h, note: `${f.stationId} ${f.axis === 'y' ? '수로' : '여울목'}` },
    ...(f.levees ?? []).map((l): RectShape => ({ kind: 'rect', x: l.x, y: l.y, w: l.w, h: l.h, note: `${f.stationId} 제방` })),
  ]);

export function fordSvg(): string {
  const parts: string[] = [];
  for (const f of FORDS) {
    const { x, y, w, h } = f;
    // 물가 띠 → 물 → 옅은 물 → 물결 줄
    parts.push(rect(x - 14, y - 14, w + 28, h + 28, COLOR.bank, { rx: 46 }), rect(x, y, w, h, COLOR.water, { rx: 34 }), rect(x + 16, y + 16, w - 32, h - 32, COLOR.waterLight, { rx: 26, 'fill-opacity': 0.55 }));
    // 제방: 물가 띠와 같은 색이라 물가가 강 둑까지 이어져 보인다
    for (const l of f.levees ?? []) parts.push(rect(l.x - 4, l.y, l.w + 8, l.h, COLOR.bank));
    const vertical = f.axis === 'y';
    [0.3, 0.7].forEach((t, i) =>
      parts.push(
        path(vertical ? `M${num(x + w * t)} ${num(y + 48 + i * 90)} V${num(y + h - 48 - (1 - i) * 90)}` : `M${num(x + 48 + i * 90)} ${num(y + h * t)} H${num(x + w - 48 - (1 - i) * 90)}`, {
          stroke: COLOR.ripple,
          'stroke-width': 5,
          'stroke-linecap': 'round',
          'stroke-dasharray': '36 150',
          'stroke-dashoffset': i * 60,
        }),
      ),
    );
    // 박 말뚝: 줄의 박 경계(4박 = 5개)마다 양쪽 물가에 세운다(가로 줄은 위아래, 세로 줄은 왼쪽 오른쪽). 돌이 하나도 없어도 '네 박짜리 줄'이 보인다
    for (let k = 0; k <= FORD_BEATS; k++) {
      const p = f.laneStart + k * f.beatPx;
      if (vertical) {
        parts.push(rect(x - 24, p - 6, 30, 12, COLOR.plankLine, { rx: 4 }), rect(x - 22, p - 4, 22, 8, COLOR.plank, { rx: 3 }));
        parts.push(rect(x + w - 6, p - 6, 30, 12, COLOR.plankLine, { rx: 4 }), rect(x + w - 4, p - 4, 22, 8, COLOR.plank, { rx: 3 }));
      } else {
        parts.push(rect(p - 6, y - 24, 12, 30, COLOR.plankLine, { rx: 4 }), rect(p - 4, y - 22, 8, 22, COLOR.plank, { rx: 3 }));
        parts.push(rect(p - 6, y + h - 6, 12, 30, COLOR.plankLine, { rx: 4 }), rect(p - 4, y + h - 4, 8, 22, COLOR.plank, { rx: 3 }));
      }
    }
  }
  return parts.join('');
}

/**
 * 물레방아(E4, 4.5)가 서는 방앗간 웅덩이: 바퀴(지름 480 px)와 그 옆에 편 띠(세로, 6칸 × 80 px)가 같은 물 위에 놓인다.
 * 징검다리처럼 걸어 들어갈 수 없다(악기다, W-1). 칸(32 px) 경계에 맞춘 사각형이라 그림과 막힌 칸이 같다(3.8: 보이지 않는 벽이 없다).
 * 동쪽 가장자리는 x 6400에서 멈춘다: 둘레길(x 6408–6532)과 정거장(6450, 2300)이 바로 옆을 지나고, 거기서 서는 사람은 바퀴를 마주 본다.
 * 바퀴가 한 바퀴 도는 시간이 한 마디(2880틱)이고, 띠는 한 칸이 80 px(480틱, 8분음표)라서 큰 박 하나(1440틱)가 240 px이다.
 */
export interface MillPond {
  stationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 띠의 첫 칸이 시작하는 y와 띠의 왼쪽 x와 폭, 한 박의 길이(px)와 박의 수. 박 말뚝을 이 간격으로 띠 양옆에 세운다 */
  laneStart: number;
  laneX: number;
  laneW: number;
  beatPx: number;
  beats: number;
  /** 바퀴의 중심과 반지름 */
  wheel: { cx: number; cy: number; r: number };
}
export const MILL_PONDS: readonly MillPond[] = [{ stationId: 'E4', x: 5696, y: 2080, w: 704, h: 512, laneStart: 2096, laneX: 5760, laneW: 96, beatPx: 240, beats: 2, wheel: { cx: 6144, cy: 2336, r: 240 } }];

export const millPondColliders = (): RectShape[] => MILL_PONDS.map((p): RectShape => ({ kind: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, note: `${p.stationId} 방앗간 웅덩이` }));

export function millPondSvg(): string {
  const parts: string[] = [];
  for (const pond of MILL_PONDS) {
    const { x, y, w, h, wheel } = pond;
    // 물가 띠 → 물 → 옅은 물(웅덩이마다 같다)
    parts.push(rect(x - 14, y - 14, w + 28, h + 28, COLOR.bank, { rx: 46 }), rect(x, y, w, h, COLOR.water, { rx: 34 }), rect(x + 16, y + 16, w - 32, h - 32, COLOR.waterLight, { rx: 26, 'fill-opacity': 0.55 }));
    // 물결: 띠와 바퀴 사이의 물길에 세로 한 줄, 바퀴가 덮지 않는 네 모서리에 짧은 줄
    const gapX = pond.laneX + pond.laneW + (wheel.cx - wheel.r - (pond.laneX + pond.laneW)) / 2;
    const stroke = { stroke: COLOR.ripple, 'stroke-width': 5, 'stroke-linecap': 'round' } as const;
    parts.push(path(`M${num(gapX)} ${num(y + 40)} V${num(y + h - 40)}`, { ...stroke, 'stroke-dasharray': '36 150', 'stroke-dashoffset': 20 }));
    const diag = (wheel.r + 46) / Math.SQRT2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cx = wheel.cx + sx * diag;
      const cy = wheel.cy + sy * diag;
      parts.push(path(`M${num(cx - 16)} ${num(cy)} H${num(cx + 16)}`, stroke));
    }
    // 박 말뚝: 띠의 박 경계(2박 = 3개)마다 띠 양옆에 세운다. 돌(못)이 하나도 없어도 '두 큰 박짜리 띠'가 보인다
    for (let k = 0; k <= pond.beats; k++) {
      const py = pond.laneStart + k * pond.beatPx;
      parts.push(rect(pond.laneX - 30, py - 6, 30, 12, COLOR.plankLine, { rx: 4 }), rect(pond.laneX - 28, py - 4, 22, 8, COLOR.plank, { rx: 3 }));
      parts.push(rect(pond.laneX + pond.laneW, py - 6, 30, 12, COLOR.plankLine, { rx: 4 }), rect(pond.laneX + pond.laneW + 6, py - 4, 22, 8, COLOR.plank, { rx: 3 }));
    }
  }
  return parts.join('');
}

export function bridgeSvg(): string {
  const { x, y, w, h } = BRIDGE;
  const parts = [rect(x + 9, y + 15, w, h, '#243C3A', { 'fill-opacity': 0.16, rx: 6 }), rect(x, y, w, h, COLOR.plank, { rx: 6 })];
  for (let px = x + 32; px < x + w; px += 32) parts.push(rect(px - 1, y + 10, 2, h - 20, COLOR.plankLine, { 'fill-opacity': 0.45 }));
  parts.push(rect(x, y, w, 10, COLOR.plankLine, { rx: 4 }), rect(x, y + h - 10, w, 10, COLOR.plankLine, { rx: 4 }));
  for (let px = x + 24; px < x + w; px += 96) parts.push(rect(px - 6, y - 4, 12, 18, COLOR.plank, { rx: 3 }), rect(px - 6, y + h - 14, 12, 18, COLOR.plank, { rx: 3 }));
  return parts.join('');
}

// ───── 월드 가장자리 울타리 (3.8) ─────
export function fenceSvg(): string {
  const B = EDGE_BAND;
  const parts: string[] = [];
  const horiz = (y0: number): void => {
    parts.push(rect(0, y0, WORLD_W, B, COLOR.fenceBand), rect(0, y0 + 18, WORLD_W, 6, COLOR.plank), rect(0, y0 + 38, WORLD_W, 6, COLOR.plank));
    for (let x = 32; x < WORLD_W; x += 64) parts.push(rect(x - 5, y0 + 10, 10, 42, COLOR.plankLine, { rx: 3 }));
  };
  const vert = (x0: number): void => {
    parts.push(rect(x0, 0, B, WORLD_H, COLOR.fenceBand), rect(x0 + 18, 0, 6, WORLD_H, COLOR.plank), rect(x0 + 38, 0, 6, WORLD_H, COLOR.plank));
    for (let y = 32; y < WORLD_H; y += 64) parts.push(rect(x0 + 10, y - 5, 42, 10, COLOR.plankLine, { rx: 3 }));
  };
  horiz(0);
  horiz(WORLD_H - B);
  vert(0);
  vert(WORLD_W - B);
  return parts.join('');
}

// ───── 무작위(고정 씨앗) ─────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VILLAGE_RECT = { x0: 2592, y0: 2016, x1: 5600, y1: 4128 } as const;
const nearVillage = (x: number, y: number, margin: number): boolean => x > VILLAGE_RECT.x0 - margin && x < VILLAGE_RECT.x1 + margin && y > VILLAGE_RECT.y0 - margin && y < VILLAGE_RECT.y1 + margin;

// ───── 풀밭 얼룩 ─────
function blobPath(cx: number, cy: number, R: number, rng: () => number): string {
  const n = 9;
  const pts: Point[] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const r = R * (0.72 + 0.5 * rng());
    pts.push(P(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.9));
  }
  return `${polylineD(catmullRom(pts, { closed: true, step: 30 }))}Z`;
}

export function outerPatchesSvg(regions: readonly RegionDef[]): string {
  const rng = mulberry32(20261110);
  const parts: string[] = [];
  for (const id of REGION_IDS) {
    if (id === 'village') continue;
    const r = regions.find((x) => x.regionId === id);
    if (!r) continue;
    const b = regionBoundsPx(r);
    const fill = mixHex(groundTint(id), '#A9C29C', 0.4);
    let placed = 0;
    for (let tries = 0; placed < 7 && tries < 200; tries++) {
      const R = 220 + rng() * 260;
      const cx = b.x0 + 200 + rng() * (b.x1 - b.x0 - 400);
      const cy = b.y0 + 200 + rng() * (b.y1 - b.y0 - 400);
      if (nearVillage(cx, cy, R * 1.2)) continue;
      parts.push(path(blobPath(cx, cy, R, rng), { fill }));
      placed++;
    }
  }
  return parts.join('');
}

// ───── 표지판 (아직 만들지 않은 정거장) ─────
export interface SignSpec {
  stationId: string;
  regionId: RegionId;
  /** 발 위치(월드 px) */
  x: number;
  y: number;
  file: string;
  hit: Rect;
}

export const SIGN_SIZE = { w: 120, h: 120 } as const;
/** 그림 안에서 발이 닿는 곳(아래 가운데 근처) */
export const SIGN_FOOT = { x: 60, y: 112 } as const;
/** 서는 자리에서 표지판까지의 거리(옆에 선다). 서는 자리를 따로 둔 정거장은 정거장 점(강 쪽)의 반대편에 세운다 */
export const SIGN_OFFSET = { x: 72, y: -8 } as const;

export function signSpecs(regions: readonly RegionDef[]): SignSpec[] {
  const out: SignSpec[] = [];
  for (const r of regions) {
    if (r.regionId === 'village') continue;
    for (const s of r.stations) {
      const st = standOf(s);
      const side = s.stand ? -(Math.sign(s.x - s.stand.x) || 1) : 1;
      const x = st.x + side * SIGN_OFFSET.x;
      const y = st.y + SIGN_OFFSET.y;
      out.push({ stationId: s.stationId, regionId: r.regionId, x, y, file: `obj-${r.regionId}-signpost.svg`, hit: { x: x - 48, y: y - 104, w: 96, h: 112 } });
    }
  }
  return out;
}

export function signpostSvg(regionId: RegionId): string {
  const accent = ACCENT[regionId];
  const { w, h } = SIGN_SIZE;
  const parts = [
    `<ellipse cx="${SIGN_FOOT.x + 8}" cy="${SIGN_FOOT.y}" rx="28" ry="7" fill="${COLOR.treeShadow}"/>`,
    rect(55, 50, 10, 62, COLOR.signPole, { rx: 3 }),
    rect(14, 10, 92, 52, COLOR.signBoard, { rx: 9 }),
    path('M14 19a9 9 0 0 1 9-9h74a9 9 0 0 1 9 9v6H14Z', { fill: accent }),
    circle(40, 44, 5, COLOR.signPole),
    circle(60, 44, 5, COLOR.signPole),
    circle(80, 44, 5, COLOR.signPole),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>\n`;
}

export const signCollider = (s: SignSpec): Collider => ({ kind: 'circle', x: s.x, y: s.y, r: 14, note: `${s.stationId} 표지판` });

// ───── 나무 흩뿌리기 ─────
const TREE_PLAN: ReadonlyArray<{ id: RegionId; count: number; radii: readonly number[] }> = [
  { id: 'staff-hill', count: 24, radii: [54, 72, 90] },
  { id: 'beat-river', count: 20, radii: [54, 72, 90] },
  { id: 'bell-grove', count: 72, radii: [54, 72, 72, 90] },
  { id: 'scale-trail', count: 22, radii: [54, 72, 90] },
  { id: 'key-marsh', count: 16, radii: [54, 72] },
];

/** 나무 줄기 사이는 걸을 통로가 남도록 이만큼 띄운다 */
const TRUNK_GAP = 190;
/** 줄기와 가장자리 울타리 사이에 남기는 통로 */
const FENCE_CLEAR = 120;

export interface ScatterInput {
  regions: readonly RegionDef[];
  roads: readonly RoadSegment[];
  river: readonly Point[];
  signs: readonly SignSpec[];
}

export function scatterTrees(input: ScatterInput): TreeSpec[] {
  const rng = mulberry32(1110);
  const out: TreeSpec[] = [];
  const keepAway: Point[] = [];
  for (const r of input.regions) {
    for (const s of r.stations) keepAway.push(standOf(s), P(s.x, s.y));
    keepAway.push(P(r.landmark.x, r.landmark.y));
  }
  for (const s of input.signs) keepAway.push(P(s.x, s.y));

  for (const plan of TREE_PLAN) {
    const region = input.regions.find((r) => r.regionId === plan.id);
    if (!region) continue;
    const b = regionBoundsPx(region);
    let n = 0;
    for (let tries = 0; n < plan.count && tries < plan.count * 60; tries++) {
      const r = plan.radii[Math.floor(rng() * plan.radii.length)]!;
      const trunk = r * TRUNK_RADIUS;
      const margin = EDGE_BAND + r + 24;
      const x = Math.round(b.x0 + margin + rng() * (b.x1 - b.x0 - margin * 2));
      const cy = Math.round(b.y0 + margin + rng() * (b.y1 - b.y0 - margin * 2));
      const foot = { x, y: cy + r * 0.5 };
      // 줄기와 월드 가장자리 울타리 사이에 걸을 통로가 남도록
      if (foot.x - trunk < EDGE_BAND + FENCE_CLEAR || foot.x + trunk > WORLD_W - EDGE_BAND - FENCE_CLEAR || foot.y - trunk < EDGE_BAND + FENCE_CLEAR || foot.y + trunk > WORLD_H - EDGE_BAND - FENCE_CLEAR) continue;
      if (nearVillage(foot.x, foot.y, 140)) continue;
      if (input.roads.some((road) => distToPolyline(foot.x, foot.y, road.points) < road.width / 2 + trunk + 56)) continue;
      if (distToPolyline(foot.x, foot.y, input.river) < RIVER_HALF_WIDTH + trunk + 90) continue;
      if (keepAway.some((k) => Math.hypot(k.x - foot.x, k.y - foot.y) < 260)) continue;
      if (out.some((t) => Math.hypot(treeFoot(t).x - foot.x, treeFoot(t).y - foot.y) < TRUNK_GAP)) continue;
      out.push({ id: `tree-${plan.id}-${n + 1}`, regionId: plan.id, cx: x, cy, r });
      n++;
    }
  }
  return out;
}

export const outerTreeColliders = (trees: readonly TreeSpec[]): Collider[] => trees.map(treeCollider);

/** 표지판 영역을 정거장 id로 찾을 수 있게 */
export const signHits = (signs: readonly SignSpec[]): Record<string, Rect> => Object.fromEntries(signs.map((s) => [s.stationId, s.hit]));

