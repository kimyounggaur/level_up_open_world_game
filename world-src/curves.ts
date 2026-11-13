// 곡선과 길 그리기. 길은 지나는 점들을 매끈하게 이은 꺾은선이다(원심 Catmull-Rom).
import type { Point } from '../src/world/nav';
import { COLOR } from './palette';
import { num, path } from './shapes';

/** 점들을 모두 지나는 매끈한 선을 step px 간격의 꺾은선으로 돌려준다. closed면 첫 점과 끝 점을 이어 닫는다 */
export function catmullRom(points: readonly Point[], opts: { closed?: boolean; step?: number } = {}): Point[] {
  const step = opts.step ?? 24;
  const closed = opts.closed ?? false;
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  if (closed && pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a.x === b.x && a.y === b.y) pts.pop();
  }
  const n = pts.length;
  if (n < 2) return pts;
  const get = (i: number): Point => {
    if (closed) return pts[((i % n) + n) % n]!;
    if (i < 0) return { x: 2 * pts[0]!.x - pts[1]!.x, y: 2 * pts[0]!.y - pts[1]!.y };
    if (i >= n) return { x: 2 * pts[n - 1]!.x - pts[n - 2]!.x, y: 2 * pts[n - 1]!.y - pts[n - 2]!.y };
    return pts[i]!;
  };
  const lerp = (a: Point, b: Point, ta: number, tb: number, t: number): Point => {
    if (tb === ta) return a;
    const u = (tb - t) / (tb - ta);
    const v = (t - ta) / (tb - ta);
    return { x: u * a.x + v * b.x, y: u * a.y + v * b.y };
  };
  const dist = (a: Point, b: Point): number => Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)); // 원심: 거리의 0.5제곱
  const out: Point[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const t0 = 0;
    const t1 = t0 + dist(p0, p1);
    const t2 = t1 + dist(p1, p2);
    const t3 = t2 + dist(p2, p3);
    const count = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 0; k < count; k++) {
      const t = t1 + ((t2 - t1) * k) / count;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      out.push(lerp(b1, b2, t1, t2, t));
    }
  }
  out.push(closed ? { ...out[0]! } : { ...pts[n - 1]! });
  return out;
}

/** 꺾은선의 'M x y L x y …' 경로 */
export const polylineD = (pts: readonly Point[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join('');

/** 꺾은선을 옆으로 d px 옮긴 꺾은선(왼쪽이 +) */
export function offsetPolyline(pts: readonly Point[], d: number): Point[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: p.x + (-ty / len) * d, y: p.y + (tx / len) * d };
  });
}

/** 점에서 꺾은선까지의 거리 */
export function distToPolyline(px: number, py: number, pts: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)));
  }
  return best;
}

/** 길 하나: 지나는 점(월드 px)과 폭 */
export interface RoadSegment {
  id: string;
  /** 그려질 점들. 곡선이면 catmullRom으로 이미 잘게 나눈 점이다 */
  points: Point[];
  width: number;
}

/** 시안의 길 가장자리는 폭보다 12(월드 36) 넓다 */
export const ROAD_EDGE_EXTRA = 36;

/**
 * 길을 그린다. 가장자리를 모두 먼저, 다음에 길바닥, 마지막에 점선을 그려 길이 만나는 곳에 선이 가로지르지 않게 한다.
 * (시안은 길마다 세 겹을 차례로 그려 만나는 곳에 가장자리 선이 희미하게 남는다. 그 흔적만 다르다.)
 */
export function roadsSvg(roads: readonly RoadSegment[]): string {
  const withD = roads.map((r) => ({ ...r, d: polylineD(r.points) }));
  const stroke = (d: string, color: string, width: number, extra: Record<string, string | number> = {}): string => path(d, { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
  return [
    ...withD.map((r) => stroke(r.d, COLOR.roadEdge, r.width + ROAD_EDGE_EXTRA)),
    ...withD.map((r) => stroke(r.d, COLOR.road, r.width)),
    ...withD.map((r) => stroke(r.d, COLOR.roadDash, 3, { 'stroke-dasharray': '6 54' })),
  ].join('');
}
