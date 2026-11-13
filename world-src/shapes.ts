// 월드 원본 도구: 충돌 도형을 32 px 격자로 구워 막힌 칸 표를 만든다(설계서 10.5). 순수 계산이다.
import { NavGrid } from '../src/world/nav';
import type { Point } from '../src/world/nav';
import { TILE, WORLD_H, WORLD_TILES_X, WORLD_TILES_Y, WORLD_W } from '../src/domain/world';

export interface RectShape {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  /** 무엇인지(검사 오류 설명용) */
  note: string;
}
export interface CircleShape {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
  note: string;
}
/** 굵은 꺾은선(강). 점들을 이은 선분에서 halfWidth 안이 막힌다 */
export interface ThickLineShape {
  kind: 'thickLine';
  points: Point[];
  halfWidth: number;
  note: string;
}
export type Collider = RectShape | CircleShape | ThickLineShape;

export interface WalkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}

/** 월드 가장자리의 울타리 두께. 두 칸이라 그림(64 px)과 막힌 칸이 같다(3.8: 보이지 않는 벽을 쓰지 않는다) */
export const EDGE_BAND = TILE * 2;

export const edgeColliders = (): RectShape[] => [
  { kind: 'rect', x: 0, y: 0, w: WORLD_W, h: EDGE_BAND, note: '북쪽 가장자리' },
  { kind: 'rect', x: 0, y: WORLD_H - EDGE_BAND, w: WORLD_W, h: EDGE_BAND, note: '남쪽 가장자리' },
  { kind: 'rect', x: 0, y: 0, w: EDGE_BAND, h: WORLD_H, note: '서쪽 가장자리' },
  { kind: 'rect', x: WORLD_W - EDGE_BAND, y: 0, w: EDGE_BAND, h: WORLD_H, note: '동쪽 가장자리' },
];

/** 점에서 칸(사각형)까지의 거리 */
const distToCell = (px: number, py: number, cx: number, cy: number): number => {
  const nx = Math.min(Math.max(px, cx * TILE), (cx + 1) * TILE);
  const ny = Math.min(Math.max(py, cy * TILE), (cy + 1) * TILE);
  return Math.hypot(px - nx, py - ny);
};

/** 선분을 8 px 간격으로 나눈 점들 */
export function samplePolyline(points: readonly Point[], step = 8): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (points.length > 0) out.push(points[points.length - 1]!);
  return out;
}

function stamp(blocked: Uint8Array, shape: Collider): void {
  const mark = (cx: number, cy: number): void => {
    if (cx < 0 || cy < 0 || cx >= WORLD_TILES_X || cy >= WORLD_TILES_Y) return;
    blocked[cy * WORLD_TILES_X + cx] = 1;
  };
  if (shape.kind === 'rect') {
    // 칸 안쪽과 넓이가 겹치는 칸은 모두 막는다(보수적). 변이 칸 경계에 정확히 맞으면 이웃 칸은 막지 않는다
    const x0 = Math.floor(shape.x / TILE);
    const x1 = Math.ceil((shape.x + shape.w) / TILE) - 1;
    const y0 = Math.floor(shape.y / TILE);
    const y1 = Math.ceil((shape.y + shape.h) / TILE) - 1;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) mark(cx, cy);
  } else if (shape.kind === 'circle') {
    const x0 = Math.floor((shape.x - shape.r) / TILE);
    const x1 = Math.floor((shape.x + shape.r) / TILE);
    const y0 = Math.floor((shape.y - shape.r) / TILE);
    const y1 = Math.floor((shape.y + shape.r) / TILE);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (distToCell(shape.x, shape.y, cx, cy) < shape.r) mark(cx, cy);
  } else {
    const hw = shape.halfWidth;
    for (const p of samplePolyline(shape.points, 8)) {
      const x0 = Math.floor((p.x - hw) / TILE);
      const x1 = Math.floor((p.x + hw) / TILE);
      const y0 = Math.floor((p.y - hw) / TILE);
      const y1 = Math.floor((p.y + hw) / TILE);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (distToCell(p.x, p.y, cx, cy) < hw) mark(cx, cy);
    }
  }
}

/** 충돌 도형들을 칸 표로 굽는다. walkable 사각형 안에 통째로 들어가는 칸은 다시 연다(다리 같은 곳) */
export function rasterize(colliders: readonly Collider[], walkable: readonly WalkRect[] = []): NavGrid {
  const blocked = new Uint8Array(WORLD_TILES_X * WORLD_TILES_Y);
  for (const c of colliders) stamp(blocked, c);
  for (const w of walkable) {
    const x0 = Math.ceil(w.x / TILE);
    const x1 = Math.floor((w.x + w.w) / TILE) - 1;
    const y0 = Math.ceil(w.y / TILE);
    const y1 = Math.floor((w.y + w.h) / TILE) - 1;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (cx >= 0 && cy >= 0 && cx < WORLD_TILES_X && cy < WORLD_TILES_Y) blocked[cy * WORLD_TILES_X + cx] = 0;
  }
  return new NavGrid(WORLD_TILES_X, WORLD_TILES_Y, blocked);
}

/**
 * 폭 1칸(32 px)짜리 통로를 찾는다(3.8: 걸을 수 있는 통로는 폭 64 px 이상).
 * 걸을 수 있는 칸인데 좌우 둘 다 또는 상하 둘 다 막혀 있고, 시작점에서 닿을 수 있는 칸을 돌려준다.
 */
export function findNarrowCells(grid: NavGrid, reachable: Uint8Array): Array<{ cx: number; cy: number }> {
  const out: Array<{ cx: number; cy: number }> = [];
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      if (grid.isBlockedCell(cx, cy) || !reachable[cy * grid.cols + cx]) continue;
      const horiz = grid.isBlockedCell(cx - 1, cy) && grid.isBlockedCell(cx + 1, cy);
      const vert = grid.isBlockedCell(cx, cy - 1) && grid.isBlockedCell(cx, cy + 1);
      if (horiz || vert) out.push({ cx, cy });
    }
  }
  return out;
}

/**
 * 폭 1칸 틈을 메운다(3.8: 걸을 수 있는 통로는 폭 64 px 이상). 틈이 메워지면서 새 틈이 생기면 그것도 메운다.
 * 메운 칸의 목록을 돌려준다. 시안의 배치에서 나무와 지붕 사이처럼 54 px짜리 틈이 이렇게 닫힌다.
 */
export function closeNarrowGaps(grid: NavGrid): Array<{ cx: number; cy: number }> {
  const closed: Array<{ cx: number; cy: number }> = [];
  for (let pass = 0; pass < 16; pass++) {
    const batch: Array<{ cx: number; cy: number }> = [];
    for (let cy = 0; cy < grid.rows; cy++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        if (grid.isBlockedCell(cx, cy)) continue;
        const horiz = grid.isBlockedCell(cx - 1, cy) && grid.isBlockedCell(cx + 1, cy);
        const vert = grid.isBlockedCell(cx, cy - 1) && grid.isBlockedCell(cx, cy + 1);
        if (horiz || vert) batch.push({ cx, cy });
      }
    }
    if (batch.length === 0) break;
    for (const c of batch) grid.setBlocked(c.cx, c.cy, true);
    closed.push(...batch);
  }
  return closed;
}

// ───── SVG 조각 만들기 ─────
export const num = (v: number): string => String(Math.round(v * 100) / 100);

export type Attrs = Record<string, string | number | undefined>;
const attrs = (a: Attrs): string =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? num(v) : v}"`)
    .join('');

export const rect = (x: number, y: number, w: number, h: number, fill: string, a: Attrs = {}): string => `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${attrs({ fill, ...a })}/>`;
export const circle = (cx: number, cy: number, r: number, fill: string, a: Attrs = {}): string => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}"${attrs({ fill, ...a })}/>`;
export const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, a: Attrs = {}): string => `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"${attrs({ stroke, ...a })}/>`;
export const path = (d: string, a: Attrs = {}): string => `<path d="${d}"${attrs(a)}/>`;

/** 8자리 색(#RRGGBBAA)을 색과 투명도로 나눈다. 렌더러마다 8자리 색을 읽는 방식이 달라서 풀어 쓴다 */
export function splitAlpha(hex8: string): { color: string; opacity: number } {
  const m = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})$/.exec(hex8);
  if (!m) return { color: hex8, opacity: 1 };
  return { color: `#${m[1]}`, opacity: Math.round((parseInt(m[2]!, 16) / 255) * 1000) / 1000 };
}
