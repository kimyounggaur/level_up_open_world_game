// 3-3 충돌과 길찾기. 작은 글자 그림 격자로 손으로 셀 수 있는 사례를 만든다('#'는 막힌 칸, 칸은 32 px).
import { describe, expect, it } from 'vitest';
import { NavGrid, findPath, flood, hasClearLine, moveCircle, nearestFreeCell, reachableFrom, smoothPath } from '../../src/world/nav';
import type { Point } from '../../src/world/nav';

const pathLength = (start: Point, wps: readonly Point[]): number => {
  let len = 0;
  let prev = start;
  for (const p of wps) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
};

/** 경로의 모든 선분 위에서 몸이 막힌 칸에 겹치지 않는지 2 px 간격으로 살핀다 */
function pathIsClear(grid: NavGrid, start: Point, wps: readonly Point[]): boolean {
  let prev = start;
  for (const p of wps) {
    const len = Math.hypot(p.x - prev.x, p.y - prev.y);
    const n = Math.max(1, Math.ceil(len / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (grid.circleHitsBlocked(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t)) return false;
    }
    prev = p;
  }
  return true;
}

describe('격자', () => {
  it('글자 그림에서 만들고 다시 글자 그림으로 돌려준다', () => {
    const rows = ['..#', '#..', '...'];
    expect(NavGrid.fromRows(rows).toRows()).toEqual(rows);
  });

  it('잘못된 그림은 이유를 말하며 거절한다', () => {
    expect(() => NavGrid.fromRows(['..', '...'])).toThrow(/길이/);
    expect(() => NavGrid.fromRows(['.x'])).toThrow(/알 수 없는 글자/);
    expect(() => new NavGrid(0, 3)).toThrow();
    expect(() => new NavGrid(2, 2, new Uint8Array(3))).toThrow(/길이/);
  });

  it('칸 번호와 가운데 좌표: 칸 32 px', () => {
    const g = new NavGrid(10, 10);
    expect(g.cellOf(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(g.cellOf(31.9, 32)).toEqual({ cx: 0, cy: 1 });
    expect(g.cellOf(-0.1, 5)).toEqual({ cx: -1, cy: 0 });
    expect(g.centerOf(3, 2)).toEqual({ x: 112, y: 80 });
    expect(g.widthPx).toBe(320);
    expect(g.heightPx).toBe(320);
  });

  it('격자 밖은 모두 막힌 칸이다', () => {
    const g = new NavGrid(4, 4);
    expect(g.isBlockedCell(-1, 0)).toBe(true);
    expect(g.isBlockedCell(0, -1)).toBe(true);
    expect(g.isBlockedCell(4, 0)).toBe(true);
    expect(g.isBlockedCell(0, 4)).toBe(true);
    expect(g.isBlockedCell(0, 0)).toBe(false);
    expect(g.isBlockedPoint(-5, 10)).toBe(true);
  });

  it('원이 가장자리에 닿기만 하면 겹침이 아니고 1 px 들어가면 겹침이다', () => {
    const g = NavGrid.fromRows(['..#.', '....']);
    // 막힌 칸은 x 64–96, y 0–32. 반지름 14인 원이 왼쪽에서 닿는 중심 x는 50
    expect(g.circleHitsBlocked(50, 16, 14)).toBe(false);
    expect(g.circleHitsBlocked(50.5, 16, 14)).toBe(true);
    // 아래에서: 칸 아래 변 y = 32, 원 중심 y = 46이면 닿기만 한다
    expect(g.circleHitsBlocked(80, 46, 14)).toBe(false);
    expect(g.circleHitsBlocked(80, 45, 14)).toBe(true);
  });

  it('원이 칸 모서리에 닿는 경우는 거리로 센다', () => {
    const g = NavGrid.fromRows(['....', '.#..', '....']);
    // 막힌 칸 (1,1): x 32–64, y 32–64. 모서리 (64, 64)에서 대각선으로 14 떨어진 점
    const d = 14 / Math.SQRT2;
    expect(g.circleHitsBlocked(64 + d + 0.01, 64 + d + 0.01, 14)).toBe(false);
    expect(g.circleHitsBlocked(64 + d - 0.5, 64 + d - 0.5, 14)).toBe(true);
  });

  it('월드 가장자리: 중심이 가장자리에서 14 px 안으로 들어오면 겹친다', () => {
    const g = new NavGrid(4, 4);
    expect(g.circleHitsBlocked(14, 64, 14)).toBe(false);
    expect(g.circleHitsBlocked(13.9, 64, 14)).toBe(true);
    expect(g.circleHitsBlocked(128 - 14, 64, 14)).toBe(false);
    expect(g.circleHitsBlocked(128 - 13.9, 64, 14)).toBe(true);
  });

  it('걸을 수 있는 칸 수를 센다', () => {
    expect(NavGrid.fromRows(['.#.', '###']).freeCount()).toBe(2);
  });
});

describe('7.2 이동: 막힌 칸에 들어가지 않고 벽에서 미끄러진다', () => {
  // 세로 벽: 칸 x=5(160–192) 전체가 막혔다
  const wall = NavGrid.fromRows(Array.from({ length: 8 }, () => '.....#.....'));

  it('열린 곳에서는 그대로 움직인다', () => {
    expect(moveCircle(wall, { x: 50, y: 100 }, 3, 4)).toEqual({ x: 53, y: 104 });
  });

  it('벽 앞에서 멈춘다: 벽 왼쪽 변 160에서 반지름 14 앞(x = 146)', () => {
    const p = moveCircle(wall, { x: 140, y: 100 }, 20, 0);
    expect(p.x).toBeGreaterThan(145.9);
    expect(p.x).toBeLessThanOrEqual(146);
    expect(p.y).toBe(100);
  });

  it('벽에 비스듬히 닿으면 벽을 따라 미끄러진다(막힌 성분만 버린다)', () => {
    let p: Point = { x: 130, y: 60 };
    for (let i = 0; i < 40; i++) p = moveCircle(wall, p, 3, 3);
    expect(p.x).toBeLessThanOrEqual(146);
    expect(p.x).toBeGreaterThan(145.5);
    expect(p.y).toBeCloseTo(180, 6); // 아래로는 한 걸음도 잃지 않는다(60 + 40×3)
  });

  it('가장자리(월드 밖)에서도 미끄러진다', () => {
    let p: Point = { x: 20, y: 100 };
    for (let i = 0; i < 10; i++) p = moveCircle(wall, p, -3, 2);
    expect(p.x).toBeGreaterThanOrEqual(14 - 1e-9);
    expect(p.y).toBeCloseTo(120, 6);
  });

  it('한 걸음이 한 칸(32 px)보다 작으면 벽을 뚫지 못한다', () => {
    let p: Point = { x: 100, y: 100 };
    for (let i = 0; i < 200; i++) p = moveCircle(wall, p, 3.67, 0); // 220 px/s의 1/60초
    expect(p.x).toBeLessThanOrEqual(146);
  });

  it('이미 겹쳐 있는 쪽으로는 더 들어가지 않는다', () => {
    const p = moveCircle(wall, { x: 150, y: 100 }, 5, 0); // 150은 이미 벽에 겹침(160−14=146 초과)
    expect(p.x).toBe(150);
  });

  it('모서리를 도는 움직임: 기둥 모서리에서 막히지 않고 돈다', () => {
    const pillar = NavGrid.fromRows(['........', '..#.....', '........']);
    // 기둥 (2,1): x 64–96, y 32–64. 위쪽 길 y=16에서 오른쪽으로 걷는다
    let p: Point = { x: 20, y: 16 };
    for (let i = 0; i < 60; i++) p = moveCircle(pillar, p, 3, 0);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBe(16);
  });
});

describe('7.2 길찾기: 격자 A*, 8방향, 경로 다듬기', () => {
  const rowsWall = ['............', '............', '....#.......', '....#.......', '....#.......', '....#.......', '............', '............'];
  const g = NavGrid.fromRows(rowsWall);

  it('열린 곳에서는 점 하나로 곧장 간다(경로 다듬기)', () => {
    const open = new NavGrid(20, 20);
    const r = findPath(open, { x: 50, y: 50 }, { x: 500, y: 400 })!;
    expect(r.adjusted).toBe(false);
    expect(r.waypoints).toEqual([{ x: 500, y: 400 }]);
    expect(r.goal).toEqual({ x: 500, y: 400 });
  });

  it('벽을 돌아간다: 길이가 곧은 선과 최적 우회 사이이고 몸이 막힌 칸에 닿지 않는다', () => {
    const start = { x: 48, y: 112 };
    const goal = { x: 240, y: 112 };
    const r = findPath(g, start, goal)!;
    expect(r.adjusted).toBe(false);
    expect(r.goal).toEqual(goal);
    expect(pathIsClear(g, start, r.waypoints)).toBe(true);
    const len = pathLength(start, r.waypoints);
    // 곧은 선 192, 위나 아래로 돌아가는 최적 길이는 약 241(몸 반지름만큼 부풀린 벽 모서리를 지나는 길)
    expect(len).toBeGreaterThan(236);
    expect(len).toBeLessThan(280);
    // 벽 한 줄만 있으니 꺾이는 점은 둘 안팎이다
    expect(r.waypoints.length).toBeLessThanOrEqual(4);
  });

  it('두 번 구해도 같은 길이 나온다', () => {
    const a = findPath(g, { x: 48, y: 112 }, { x: 240, y: 112 })!;
    const b = findPath(g, { x: 48, y: 112 }, { x: 240, y: 112 })!;
    expect(a).toEqual(b);
  });

  it('모서리 자르기 금지: 마주 보는 두 막힌 칸 사이의 대각선으로 지나가지 않는다', () => {
    const diag = NavGrid.fromRows(['......', '..#...', '...#..', '......']);
    // 칸 (2,2)에서 (3,1)로 가려면 대각선이 (3,2)와 (2,1) 사이를 지나므로 돌아가야 한다
    const start = diag.centerOf(2, 2);
    const goal = diag.centerOf(3, 1);
    const r = findPath(diag, start, goal)!;
    expect(pathIsClear(diag, start, r.waypoints)).toBe(true);
    expect(pathLength(start, r.waypoints)).toBeGreaterThan(Math.hypot(goal.x - start.x, goal.y - start.y) + 20);
  });

  it('누른 곳이 막혀 있으면 가장 가까운 갈 수 있는 칸으로 간다', () => {
    const start = { x: 48, y: 112 };
    const r = findPath(g, start, { x: 140, y: 112 })!; // 벽 안(칸 (4,3))
    expect(r.adjusted).toBe(true);
    // 가장 가까운 열린 칸 가운데는 (3,3)이나 (5,3): 누른 곳 (140,112)에서 (112,112)가 28, (176,112)가 36
    expect(r.goal).toEqual({ x: 112, y: 112 });
    expect(pathIsClear(g, start, r.waypoints)).toBe(true);
  });

  it('둘러싸여 닿을 수 없는 곳을 누르면 닿을 수 있는 가장 가까운 칸으로 간다', () => {
    const pocket = NavGrid.fromRows(['..........', '.######...', '.#....#...', '.#....#...', '.######...', '..........']);
    const start = pocket.centerOf(0, 0);
    const r = findPath(pocket, start, pocket.centerOf(3, 2))!; // 주머니 안
    expect(r.adjusted).toBe(true);
    expect(r.goal).toEqual(pocket.centerOf(3, 0)); // 두 칸(64 px) 위, 닿을 수 있는 가장 가까운 칸
    expect(pathIsClear(pocket, start, r.waypoints)).toBe(true);
  });

  it('주머니 안에 갇혀 있으면 그 안에서 가장 가까운 칸으로 간다', () => {
    const pocket = NavGrid.fromRows(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const inside = pocket.centerOf(2, 2);
    const r = findPath(pocket, inside, pocket.centerOf(0, 0))!;
    expect(r.adjusted).toBe(true);
    expect(r.goal).toEqual(inside);
  });

  it('온통 막혀 있으면 길이 없다', () => {
    expect(findPath(NavGrid.fromRows(['##', '##']), { x: 10, y: 10 }, { x: 40, y: 40 })).toBeNull();
  });

  it('월드 밖을 누르면 가장 가까운 가장자리로 간다', () => {
    const open = new NavGrid(10, 10); // 320×320
    const r = findPath(open, { x: 100, y: 100 }, { x: 900, y: -200 })!;
    expect(r.goal.x).toBeLessThanOrEqual(320);
    expect(r.goal.y).toBeGreaterThanOrEqual(0);
    expect(open.circleHitsBlocked(r.goal.x, r.goal.y)).toBe(false);
  });

  it('누른 곳이 가장자리 칸이어도 몸이 월드 밖에 걸치면 칸 가운데로 간다', () => {
    const open = new NavGrid(10, 10);
    const r = findPath(open, { x: 100, y: 100 }, { x: 5, y: 100 })!; // x=5는 가장자리에서 14 px 안쪽이 아니다
    expect(r.adjusted).toBe(false);
    expect(r.goal).toEqual({ x: 16, y: 112 }); // 누른 칸 (0,3)의 가운데
    expect(open.circleHitsBlocked(r.goal.x, r.goal.y)).toBe(false);
  });

  it('출발이 이미 도착 칸 안이어도 길이 나온다', () => {
    const open = new NavGrid(10, 10);
    const r = findPath(open, { x: 100, y: 100 }, { x: 110, y: 105 })!;
    expect(r.goal).toEqual({ x: 110, y: 105 });
    expect(r.waypoints).toEqual([{ x: 110, y: 105 }]);
  });

  it('큰 격자(256×192)에서 구석에서 구석까지 0.5초 안에 찾는다', () => {
    const big = new NavGrid(256, 192);
    // 군데군데 막는다
    for (let x = 20; x < 240; x += 25) for (let y = 0; y < 150; y++) big.setBlocked(x, y, true);
    for (let x = 32; x < 256; x += 25) for (let y = 42; y < 192; y++) big.setBlocked(x, y, true);
    const t0 = performance.now();
    const r = findPath(big, { x: 16, y: 16 }, { x: 8176, y: 6128 })!;
    const ms = performance.now() - t0;
    expect(r).not.toBeNull();
    expect(r.adjusted).toBe(false);
    expect(pathIsClear(big, { x: 16, y: 16 }, r.waypoints)).toBe(true);
    expect(ms).toBeLessThan(500);
  });
});

describe('보조 함수', () => {
  it('가장 가까운 열린 칸: 열려 있으면 그 칸, 막혀 있으면 거리가 가장 가까운 칸', () => {
    const g = NavGrid.fromRows(['..#..', '..#..', '..#..']);
    expect(nearestFreeCell(g, { x: 20, y: 20 })).toEqual({ cx: 0, cy: 0 });
    // (2,1) 칸의 오른쪽 부분을 누르면 오른쪽 이웃 (3,1)이 더 가깝다
    expect(nearestFreeCell(g, { x: 90, y: 48 })).toEqual({ cx: 3, cy: 1 });
    expect(nearestFreeCell(g, { x: 70, y: 48 })).toEqual({ cx: 1, cy: 1 });
    expect(nearestFreeCell(NavGrid.fromRows(['#']), { x: 0, y: 0 })).toBeNull();
  });

  it('도달 가능한 칸 표: 막힌 벽 너머는 닿지 않는다', () => {
    const g = NavGrid.fromRows(['..#..', '..#..', '..#..']);
    const reach = reachableFrom(g, { x: 16, y: 16 });
    expect(reach[0]).toBe(1);
    expect(reach[1]).toBe(1);
    expect(reach[3]).toBe(0);
    expect(reach[2]).toBe(0);
  });

  it('flood는 대각선 비용을 √2로 센다', () => {
    const g = new NavGrid(4, 4);
    const f = flood(g, { cx: 0, cy: 0 });
    expect(f.cost[1 * 4 + 1]).toBeCloseTo(Math.SQRT2, 9);
    expect(f.cost[3 * 4 + 3]).toBeCloseTo(3 * Math.SQRT2, 9);
    expect(f.cost[0 * 4 + 3]).toBe(3);
  });

  it('시선 확인과 경로 다듬기', () => {
    const g = NavGrid.fromRows(['.....', '..#..', '.....']);
    expect(hasClearLine(g, { x: 16, y: 16 }, { x: 144, y: 16 })).toBe(true);
    expect(hasClearLine(g, { x: 16, y: 48 }, { x: 144, y: 48 })).toBe(false);
    const pts = [{ x: 16, y: 80 }, { x: 48, y: 80 }, { x: 80, y: 80 }, { x: 112, y: 80 }, { x: 144, y: 80 }];
    expect(smoothPath(g, pts)).toEqual([{ x: 16, y: 80 }, { x: 144, y: 80 }]);
    expect(smoothPath(g, [pts[0]!])).toEqual([pts[0]]);
  });
});
