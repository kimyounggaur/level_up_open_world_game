// 4.9 무대 바닥에서 쓰지 않는 칸의 사선 무늬와, 6-7c 소리를 끈 종의 점선 테두리: 그리는 것(Phaser)과 떨어진 순수 계산.
import { describe, expect, it } from 'vitest';
import { dashSegments, dashedRectSegments, hatchSegments } from '@/world/installations/hatch';

describe('hatchSegments', () => {
  it('모든 선이 직사각형 안에 있고, / 방향이다(x가 늘면 y가 준다)', () => {
    const x = 10;
    const y = 20;
    const w = 64;
    const h = 52;
    const segs = hatchSegments(x, y, w, h, 12);
    expect(segs.length).toBeGreaterThan(3);
    for (const [x0, y0, x1, y1] of segs) {
      for (const [px, py] of [[x0, y0], [x1, y1]] as const) {
        expect(px).toBeGreaterThanOrEqual(x - 1e-9);
        expect(px).toBeLessThanOrEqual(x + w + 1e-9);
        expect(py).toBeGreaterThanOrEqual(y - 1e-9);
        expect(py).toBeLessThanOrEqual(y + h + 1e-9);
      }
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeLessThan(y0);
      // 기울기는 정확히 -1이다
      expect(y1 - y0).toBeCloseTo(-(x1 - x0), 9);
    }
  });

  it('선 사이 간격은 step이다(x + y가 step씩 늘어난다)', () => {
    const segs = hatchSegments(0, 0, 40, 40, 10);
    const sums = segs.map(([x0, y0]) => x0 + y0);
    expect(sums).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it('가장자리 모서리를 건드리지 않는 선만 있다: 길이가 0인 선은 만들지 않는다', () => {
    for (const [x0, , x1] of hatchSegments(0, 0, 30, 30, 10)) expect(x1 - x0).toBeGreaterThan(0);
  });

  it('쓸 수 없는 크기나 간격이면 아무것도 긋지 않는다', () => {
    expect(hatchSegments(0, 0, 0, 10, 5)).toEqual([]);
    expect(hatchSegments(0, 0, 10, -1, 5)).toEqual([]);
    expect(hatchSegments(0, 0, 10, 10, 0)).toEqual([]);
  });
});

describe('dashSegments: 선분을 점선으로', () => {
  it('길이 dash의 선과 길이 gap의 틈이 번갈아 나온다(마지막 선은 끝에서 잘린다)', () => {
    expect(dashSegments(0, 0, 25, 0, 6, 4)).toEqual([
      [0, 0, 6, 0],
      [10, 0, 16, 0],
      [20, 0, 25, 0],
    ]);
  });

  it('세로선과 기울어진 선도 선분 위에 있다(방향이 같고 길이가 dash 이하다)', () => {
    for (const [x1, y1] of [[0, 30], [30, 40], [-24, 18]] as const) {
      const segs = dashSegments(0, 0, x1, y1, 5, 3);
      expect(segs.length).toBeGreaterThan(3);
      const len = Math.hypot(x1, y1);
      for (const [a, b, c, d] of segs) {
        expect(Math.hypot(c - a, d - b)).toBeLessThanOrEqual(5 + 1e-9);
        // 선분 위: 시작점에서 끝점으로 가는 방향과 같다(외적 0)
        expect(a * y1 - b * x1).toBeCloseTo(0, 9);
        expect(c * y1 - d * x1).toBeCloseTo(0, 9);
        expect(Math.hypot(c, d)).toBeLessThanOrEqual(len + 1e-9);
      }
    }
  });

  it('틈이 0이면 이어진 선, 길이가 0이거나 dash가 0 이하면 아무것도 긋지 않는다', () => {
    expect(dashSegments(0, 0, 10, 0, 5, 0)).toEqual([
      [0, 0, 5, 0],
      [5, 0, 10, 0],
    ]);
    expect(dashSegments(3, 3, 3, 3, 4, 2)).toEqual([]);
    expect(dashSegments(0, 0, 10, 0, 0, 2)).toEqual([]);
    expect(dashSegments(0, 0, 10, 0, -1, 2)).toEqual([]);
  });
});

describe('dashedRectSegments: 직사각형의 네 변을 점선으로', () => {
  it('위, 오른쪽, 아래, 왼쪽 차례이고 모두 직사각형의 둘레 위에 있다', () => {
    const [x, y, w, h] = [10, 20, 54, 28];
    const segs = dashedRectSegments(x, y, w, h, 6, 4);
    // 변마다 ceil(길이 / 10)개: 54 → 6, 28 → 3
    expect(segs).toHaveLength(6 + 3 + 6 + 3);
    expect(segs[0]).toEqual([10, 20, 16, 20]);
    for (const [x0, y0, x1, y1] of segs) {
      for (const [px, py] of [[x0, y0], [x1, y1]] as const) {
        const onEdge = px === x || px === x + w || py === y || py === y + h;
        expect(onEdge).toBe(true);
        expect(px).toBeGreaterThanOrEqual(x - 1e-9);
        expect(px).toBeLessThanOrEqual(x + w + 1e-9);
        expect(py).toBeGreaterThanOrEqual(y - 1e-9);
        expect(py).toBeLessThanOrEqual(y + h + 1e-9);
      }
    }
  });

  it('쓸 수 없는 크기면 아무것도 긋지 않는다', () => {
    expect(dashedRectSegments(0, 0, 0, 10, 4, 2)).toEqual([]);
    expect(dashedRectSegments(0, 0, 10, -3, 4, 2)).toEqual([]);
  });
});
