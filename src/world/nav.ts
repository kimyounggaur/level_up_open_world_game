// 충돌과 길찾기 격자(설계서 3.8, 7.2, 10.5). 32 px 칸의 막힌 칸 표, 몸(반지름 14 px의 원)의 충돌, 격자 A*와 경로 다듬기.
// 순수 계산이라 Phaser 없이 단위 테스트한다. 격자 밖(월드 밖)은 모두 막힌 칸이다.
import { BODY_RADIUS, TILE } from '../domain/world';

export interface Point {
  x: number;
  y: number;
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(cols: number, rows: number, blocked?: Uint8Array) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) throw new Error('격자 크기는 양의 정수여야 해요');
    if (blocked && blocked.length !== cols * rows) throw new Error(`막힌 칸 표의 길이(${blocked.length})가 ${cols}×${rows}와 달라요`);
    this.cols = cols;
    this.rows = rows;
    this.blocked = blocked ? Uint8Array.from(blocked) : new Uint8Array(cols * rows);
  }

  /** 글자 그림에서 만든다. '#'은 막힌 칸, '.'은 걸을 수 있는 칸. 모든 줄의 길이가 같아야 한다 */
  static fromRows(rows: readonly string[]): NavGrid {
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const cells = new Uint8Array(w * h);
    rows.forEach((row, y) => {
      if (row.length !== w) throw new Error(`줄 ${y}의 길이(${row.length})가 첫 줄(${w})과 달라요`);
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch !== '#' && ch !== '.') throw new Error(`줄 ${y}, 칸 ${x}에 알 수 없는 글자예요: ${ch}`);
        cells[y * w + x] = ch === '#' ? 1 : 0;
      }
    });
    return new NavGrid(w, h, cells);
  }

  /** 격자를 글자 그림으로 돌려준다(굽기 도구와 테스트 출력용) */
  toRows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.rows; y++) {
      let row = '';
      for (let x = 0; x < this.cols; x++) row += this.blocked[y * this.cols + x] ? '#' : '.';
      out.push(row);
    }
    return out;
  }

  get widthPx(): number {
    return this.cols * TILE;
  }
  get heightPx(): number {
    return this.rows * TILE;
  }

  isBlockedCell(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true;
    return this.blocked[cy * this.cols + cx] === 1;
  }

  setBlocked(cx: number, cy: number, value: boolean): void {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    this.blocked[cy * this.cols + cx] = value ? 1 : 0;
  }

  cellOf(x: number, y: number): { cx: number; cy: number } {
    return { cx: Math.floor(x / TILE), cy: Math.floor(y / TILE) };
  }

  centerOf(cx: number, cy: number): Point {
    return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
  }

  isBlockedPoint(x: number, y: number): boolean {
    const { cx, cy } = this.cellOf(x, y);
    return this.isBlockedCell(cx, cy);
  }

  /** 반지름 r의 원이 막힌 칸(월드 밖 포함)에 겹치는가. 닿기만 하는 것은 겹침이 아니다 */
  circleHitsBlocked(x: number, y: number, r: number = BODY_RADIUS): boolean {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!this.isBlockedCell(cx, cy)) continue;
        const nx = Math.min(Math.max(x, cx * TILE), (cx + 1) * TILE);
        const ny = Math.min(Math.max(y, cy * TILE), (cy + 1) * TILE);
        const ddx = x - nx;
        const ddy = y - ny;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
    return false;
  }

  /** 걸을 수 있는 칸 수 */
  freeCount(): number {
    let n = 0;
    for (let i = 0; i < this.blocked.length; i++) if (this.blocked[i] === 0) n++;
    return n;
  }
}

// ───── 이동: 벽에 닿으면 미끄러진다(7.2) ─────

/**
 * 한 축으로 최대한 움직인다. 막히면 막히기 직전까지 이분법으로 다가간다.
 * 시작 자리가 이미 겹쳐 있으면 그 축으로는 움직이지 않는다.
 */
function advanceAxis(grid: NavGrid, x: number, y: number, dx: number, dy: number, r: number): Point {
  if (dx === 0 && dy === 0) return { x, y };
  if (!grid.circleHitsBlocked(x + dx, y + dy, r)) return { x: x + dx, y: y + dy };
  if (grid.circleHitsBlocked(x, y, r)) return { x, y };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (grid.circleHitsBlocked(x + dx * mid, y + dy * mid, r)) hi = mid;
    else lo = mid;
  }
  return { x: x + dx * lo, y: y + dy * lo };
}

/** 원을 (dx, dy)만큼 옮긴다. 막힌 쪽 성분은 버리고 열린 쪽 성분으로 미끄러진다 */
export function moveCircle(grid: NavGrid, pos: Point, dx: number, dy: number, r: number = BODY_RADIUS): Point {
  if (!grid.circleHitsBlocked(pos.x + dx, pos.y + dy, r)) return { x: pos.x + dx, y: pos.y + dy };
  const ax = advanceAxis(grid, pos.x, pos.y, dx, 0, r);
  const ay = advanceAxis(grid, ax.x, ax.y, 0, dy, r);
  return ay;
}

// ───── 길찾기: 격자 A*, 8방향, 경로 다듬기(7.2) ─────

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** 이진 힙(최소). 같은 값은 먼저 넣은 것이 먼저 나온다 */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  private readonly seq: number[] = [];
  private counter = 0;
  get size(): number {
    return this.vals.length;
  }
  push(key: number, val: number): void {
    this.keys.push(key);
    this.vals.push(val);
    this.seq.push(this.counter++);
    let i = this.vals.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(i, p)) {
        this.swap(i, p);
        i = p;
      } else break;
    }
  }
  pop(): number {
    const top = this.vals[0]!;
    const lastK = this.keys.pop()!;
    const lastV = this.vals.pop()!;
    const lastS = this.seq.pop()!;
    if (this.vals.length > 0) {
      this.keys[0] = lastK;
      this.vals[0] = lastV;
      this.seq[0] = lastS;
      let i = 0;
      const n = this.vals.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.less(l, m)) m = l;
        if (r < n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number): boolean {
    return this.keys[a]! < this.keys[b]! || (this.keys[a] === this.keys[b] && this.seq[a]! < this.seq[b]!);
  }
  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.vals[a], this.vals[b]] = [this.vals[b]!, this.vals[a]!];
    [this.seq[a], this.seq[b]] = [this.seq[b]!, this.seq[a]!];
  }
}

/** 칸 (cx, cy)에서 (cx+dx, cy+dy)로 갈 수 있는가. 대각선은 옆 두 칸이 모두 열려 있어야 한다(모서리 자르기 금지) */
function canStep(grid: NavGrid, cx: number, cy: number, dx: number, dy: number): boolean {
  if (grid.isBlockedCell(cx + dx, cy + dy)) return false;
  if (dx !== 0 && dy !== 0 && (grid.isBlockedCell(cx + dx, cy) || grid.isBlockedCell(cx, cy + dy))) return false;
  return true;
}

/** 걸을 수 있는 칸 가운데 점에서 가장 가까운 칸. 점이 칸 안이고 열려 있으면 그 칸 */
export function nearestFreeCell(grid: NavGrid, p: Point): { cx: number; cy: number } | null {
  const cx0 = Math.min(Math.max(Math.floor(p.x / TILE), 0), grid.cols - 1);
  const cy0 = Math.min(Math.max(Math.floor(p.y / TILE), 0), grid.rows - 1);
  if (!grid.isBlockedCell(cx0, cy0)) return { cx: cx0, cy: cy0 };
  const maxR = Math.max(grid.cols, grid.rows);
  let best: { cx: number; cy: number; d: number } | null = null;
  for (let ring = 1; ring <= maxR; ring++) {
    // 이 고리 안쪽에서 가장 가까울 수 있는 거리는 (ring-1)*TILE 이상이므로 더 가까운 후보가 나올 수 없으면 멈춘다
    if (best && (ring - 1) * TILE > best.d) break;
    for (let cy = cy0 - ring; cy <= cy0 + ring; cy++) {
      for (let cx = cx0 - ring; cx <= cx0 + ring; cx++) {
        if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) !== ring) continue;
        if (grid.isBlockedCell(cx, cy)) continue;
        const c = grid.centerOf(cx, cy);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (!best || d < best.d) best = { cx, cy, d };
      }
    }
  }
  return best ? { cx: best.cx, cy: best.cy } : null;
}

interface FloodResult {
  cost: Float64Array;
  parent: Int32Array;
}

/** 시작 칸에서 갈 수 있는 모든 칸의 비용(걸음 수 가중)과 부모. 닿지 못하는 칸은 비용이 Infinity */
export function flood(grid: NavGrid, start: { cx: number; cy: number }): FloodResult {
  const n = grid.cols * grid.rows;
  const cost = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  const s = start.cy * grid.cols + start.cx;
  cost[s] = 0;
  heap.push(0, s);
  while (heap.size > 0) {
    const cur = heap.pop();
    const cx = cur % grid.cols;
    const cy = (cur - cx) / grid.cols;
    const base = cost[cur]!;
    for (const [dx, dy, w] of DIRS) {
      if (!canStep(grid, cx, cy, dx, dy)) continue;
      const ni = (cy + dy) * grid.cols + (cx + dx);
      const nc = base + w;
      if (nc < cost[ni]!) {
        cost[ni] = nc;
        parent[ni] = cur;
        heap.push(nc, ni);
      }
    }
  }
  return { cost, parent };
}

/** 시작 점에서 갈 수 있는 칸 표(1이 도달 가능). 정거장 23곳의 도달 확인(W-1)에 쓴다 */
export function reachableFrom(grid: NavGrid, from: Point): Uint8Array {
  const s = nearestFreeCell(grid, from);
  const out = new Uint8Array(grid.cols * grid.rows);
  if (!s) return out;
  const { cost } = flood(grid, s);
  for (let i = 0; i < cost.length; i++) if (cost[i] !== Infinity) out[i] = 1;
  return out;
}

function astar(grid: NavGrid, start: { cx: number; cy: number }, goal: { cx: number; cy: number }): Array<{ cx: number; cy: number }> | null {
  const cols = grid.cols;
  const n = cols * grid.rows;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const si = start.cy * cols + start.cx;
  const gi = goal.cy * cols + goal.cx;
  const h = (cx: number, cy: number): number => {
    const dx = Math.abs(cx - goal.cx);
    const dy = Math.abs(cy - goal.cy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy); // 8방향 거리(옥타일)
  };
  g[si] = 0;
  heap.push(h(start.cx, start.cy), si);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === gi) {
      const path: Array<{ cx: number; cy: number }> = [];
      for (let i = cur; i !== -1; i = parent[i]!) path.push({ cx: i % cols, cy: Math.floor(i / cols) });
      return path.reverse();
    }
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    for (const [dx, dy, w] of DIRS) {
      if (!canStep(grid, cx, cy, dx, dy)) continue;
      const ni = (cy + dy) * cols + (cx + dx);
      if (closed[ni]) continue;
      const ng = g[cur]! + w;
      if (ng < g[ni]!) {
        g[ni] = ng;
        parent[ni] = cur;
        heap.push(ng + h(cx + dx, cy + dy), ni);
      }
    }
  }
  return null;
}

/** 두 점 사이를 원이 막힘 없이 지나갈 수 있는가(4 px 간격으로 살핀다) */
export function hasClearLine(grid: NavGrid, a: Point, b: Point, r: number = BODY_RADIUS): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (grid.circleHitsBlocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r)) return false;
  }
  return true;
}

/**
 * 경로 다듬기: 시선이 닿는 먼 점으로 바로 건너뛴다.
 * 끝점이 한 번에 보이면 곧장 가고(열린 곳), 아니면 앞으로 훑으며 보이는 가장 먼 점을 잡는다.
 * 한 번 안 보인 뒤 열두 점 더 훑어도 안 보이면 멈춘다. 선택한 선분은 모두 시선을 확인한 것이라 몸이 막힌 칸에 겹치지 않는다.
 */
export function smoothPath(grid: NavGrid, points: readonly Point[], r: number = BODY_RADIUS): Point[] {
  if (points.length <= 2) return [...points];
  const last = points.length - 1;
  const out: Point[] = [points[0]!];
  let anchor = 0;
  while (anchor < last) {
    let far = anchor + 1;
    if (anchor + 1 < last && hasClearLine(grid, points[anchor]!, points[last]!, r)) far = last;
    else {
      let misses = 0;
      for (let j = anchor + 2; j <= last; j++) {
        if (hasClearLine(grid, points[anchor]!, points[j]!, r)) {
          far = j;
          misses = 0;
        } else if (++misses > 12) break;
      }
    }
    out.push(points[far]!);
    anchor = far;
  }
  return out;
}

export interface PathResult {
  /** 지나갈 점들. 첫 점은 시작 자리가 아니라 첫 목표 점이다(시작은 이미 거기 있다) */
  waypoints: Point[];
  /** 실제로 도착하는 점 */
  goal: Point;
  /** 누른 곳이 갈 수 없어서 가장 가까운 갈 수 있는 곳으로 바꾸었는가(7.2) */
  adjusted: boolean;
}

/**
 * from에서 to까지의 길. 누른 곳이 막혀 있거나 닿을 수 없으면 가장 가까운 갈 수 있는 칸으로 간다.
 * 갈 곳이 없으면(시작이 갇힘) null.
 */
export function findPath(grid: NavGrid, from: Point, to: Point, r: number = BODY_RADIUS): PathResult | null {
  const start = nearestFreeCell(grid, from);
  if (!start) return null;
  const target = { x: Math.min(Math.max(to.x, 0), grid.widthPx - 0.001), y: Math.min(Math.max(to.y, 0), grid.heightPx - 0.001) };
  const targetCell = grid.cellOf(target.x, target.y);

  let cells: Array<{ cx: number; cy: number }> | null = null;
  let adjusted = false;
  let exact = false;
  if (!grid.isBlockedCell(targetCell.cx, targetCell.cy)) {
    cells = astar(grid, start, targetCell);
    exact = cells !== null && !grid.circleHitsBlocked(target.x, target.y, r);
  }
  if (!cells) {
    // 누른 곳이 막혔거나 닿을 수 없다: 닿을 수 있는 칸 가운데 누른 곳에 가장 가까운 칸으로 간다
    const { cost } = flood(grid, start);
    let best = -1;
    let bestD = Infinity;
    let bestC = Infinity;
    for (let i = 0; i < cost.length; i++) {
      const c = cost[i]!;
      if (c === Infinity) continue;
      const cx = i % grid.cols;
      const cy = (i - cx) / grid.cols;
      const ctr = grid.centerOf(cx, cy);
      const d = Math.hypot(ctr.x - target.x, ctr.y - target.y);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && c < bestC)) {
        best = i;
        bestD = d;
        bestC = c;
      }
    }
    if (best < 0) return null;
    const goalCell = { cx: best % grid.cols, cy: Math.floor(best / grid.cols) };
    cells = astar(grid, start, goalCell);
    adjusted = true;
    if (!cells) return null;
  }

  const pts: Point[] = [from, ...cells.map((c) => grid.centerOf(c.cx, c.cy))];
  // 첫 점(시작 칸의 가운데)은 시작 자리 뒤쪽일 수 있다. 시선이 닿으면 건너뛴다
  const lastCenter = pts[pts.length - 1]!;
  let end = lastCenter;
  if (exact && hasClearLine(grid, lastCenter, target, r)) {
    pts.push(target);
    end = target;
  }
  const smooth = smoothPath(grid, pts, r);
  const waypoints = smooth.slice(1);
  if (waypoints.length === 0) waypoints.push(end);
  return { waypoints, goal: end, adjusted };
}
