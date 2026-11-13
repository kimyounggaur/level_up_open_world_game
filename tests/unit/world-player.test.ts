// 3-4 캐릭터 이동: 220 px/초, 대각선도 같은 속도, 벽에서 미끄러짐, 찾은 길 따라가기. 값은 손으로 센 것이다.
import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/world/nav';
import { MAX_FRAME_SEC, STUCK_LIMIT, cancelPath, createPlayer, startPath, stepPlayer } from '../../src/world/player';
import type { MoveInput, PlayerState } from '../../src/world/player';

const open = new NavGrid(64, 64); // 2048×2048
const wallRows = Array.from({ length: 16 }, () => '.....#' + '.'.repeat(26)); // 세로 벽 x 160–192, 폭 32칸(1024 px)
const wall = NavGrid.fromRows(wallRows);
const NONE: MoveInput = { dx: 0, dy: 0 };

function run(s: PlayerState, input: MoveInput, seconds: number, fps: number, grid: NavGrid): { state: PlayerState; arrivedAt: number | null; stuckAt: number | null } {
  let state = s;
  let arrivedAt: number | null = null;
  let stuckAt: number | null = null;
  const frames = Math.round(seconds * fps);
  for (let i = 1; i <= frames; i++) {
    const r = stepPlayer(state, input, 1 / fps, grid);
    state = r.state;
    if (r.arrived && arrivedAt === null) arrivedAt = i / fps;
    if (r.stuck && stuckAt === null) stuckAt = i / fps;
  }
  return { state, arrivedAt, stuckAt };
}

describe('7.2 키보드 이동', () => {
  it.each([30, 60, 144])('오른쪽으로 1초 걸으면 정확히 220 px(%i fps)', (fps) => {
    const s = run(createPlayer(500, 500), { dx: 1, dy: 0 }, 1, fps, open).state;
    expect(s.x - 500).toBeCloseTo(220, 6);
    expect(s.y).toBe(500);
  });

  it('대각선도 같은 속도: 1초에 대각선으로 220 px, 가로·세로는 각각 155.56 px', () => {
    const s = run(createPlayer(500, 500), { dx: 1, dy: 1 }, 1, 60, open).state;
    expect(Math.hypot(s.x - 500, s.y - 500)).toBeCloseTo(220, 6);
    expect(s.x - 500).toBeCloseTo(155.5635, 3);
    expect(s.y - 500).toBeCloseTo(155.5635, 3);
  });

  it('네 방향과 대각선 여덟 방향 모두 속도가 같다', () => {
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        if (dx === 0 && dy === 0) continue;
        const s = run(createPlayer(1000, 1000), { dx, dy }, 0.5, 60, open).state;
        expect(Math.hypot(s.x - 1000, s.y - 1000)).toBeCloseTo(110, 6);
      }
    }
  });

  it('키를 떼면 서고 moving이 꺼진다', () => {
    let r = stepPlayer(createPlayer(500, 500), { dx: 1, dy: 0 }, 1 / 60, open);
    expect(r.state.moving).toBe(true);
    r = stepPlayer(r.state, NONE, 1 / 60, open);
    expect(r.state.moving).toBe(false);
    expect(r.state.x).toBeCloseTo(500 + 220 / 60, 9);
  });

  it('보는 방향: 가로 성분이 크면 좌우, 세로가 크면 위아래, 같으면 가로', () => {
    const f = (dx: number, dy: number): string => stepPlayer(createPlayer(500, 500, 'down'), { dx, dy }, 1 / 60, open).state.facing;
    expect(f(1, 0)).toBe('right');
    expect(f(-1, 0)).toBe('left');
    expect(f(0, -1)).toBe('up');
    expect(f(0, 1)).toBe('down');
    expect(f(1, -1)).toBe('right');
    expect(f(-1, 1)).toBe('left');
    expect(stepPlayer(createPlayer(500, 500, 'left'), NONE, 1 / 60, open).state.facing).toBe('left');
  });

  it('프레임이 아주 길어도(탭을 다시 열었을 때) 0.1초만큼만 걷는다', () => {
    expect(MAX_FRAME_SEC).toBe(0.1);
    const r = stepPlayer(createPlayer(500, 500), { dx: 1, dy: 0 }, 5, open);
    expect(r.state.x - 500).toBeCloseTo(22, 6);
  });

  it('시간이 0이거나 음수면 움직이지 않는다', () => {
    expect(stepPlayer(createPlayer(500, 500), { dx: 1, dy: 0 }, 0, open).state.x).toBe(500);
    expect(stepPlayer(createPlayer(500, 500), { dx: 1, dy: 0 }, -1, open).state.x).toBe(500);
  });

  it('받은 상태를 바꾸지 않는다', () => {
    const s = createPlayer(500, 500);
    stepPlayer(s, { dx: 1, dy: 0 }, 0.1, open);
    expect(s).toEqual(createPlayer(500, 500));
  });
});

describe('7.2 충돌', () => {
  it('벽을 향해 계속 걸어도 벽 앞(x ≤ 146)에서 멈춘다', () => {
    const r = run(createPlayer(100, 100), { dx: 1, dy: 0 }, 3, 60, wall);
    expect(r.state.x).toBeLessThanOrEqual(146);
    expect(r.state.x).toBeGreaterThan(145.9);
    expect(r.state.moving).toBe(false);
  });

  it('벽에 비스듬히 닿으면 벽을 따라 미끄러진다', () => {
    const r = run(createPlayer(100, 100), { dx: 1, dy: 1 }, 2, 60, wall);
    expect(r.state.x).toBeLessThanOrEqual(146);
    // 막힌 가로 성분을 버려도 세로 성분은 그대로: 2초 동안 세로로 155.56 × 2 = 311 px (벽 앞 x에 닿은 뒤에도 이어진다)
    expect(r.state.y).toBeGreaterThan(100 + 290);
    expect(r.state.moving).toBe(true);
  });

  it('월드 가장자리(격자 밖)로 나가지 못한다', () => {
    const r = run(createPlayer(30, 30), { dx: -1, dy: -1 }, 2, 60, open);
    expect(r.state.x).toBeGreaterThanOrEqual(14 - 1e-9);
    expect(r.state.y).toBeGreaterThanOrEqual(14 - 1e-9);
  });
});

describe('7.2 누르기로 찾은 길 따라가기', () => {
  it('한 점까지 220 px/초로 걷고 정확히 그 점에서 선다', () => {
    const s0 = startPath(createPlayer(100, 100), [{ x: 300, y: 100 }]);
    const half = run(s0, NONE, 0.5, 60, open).state;
    expect(half.x).toBeCloseTo(210, 6);
    expect(half.path).not.toBeNull();
    const done = run(s0, NONE, 1.0, 60, open);
    expect(done.state.x).toBe(300);
    expect(done.state.y).toBe(100);
    expect(done.state.path).toBeNull();
    // 200 px ÷ 220 px/초 = 0.909초 → 60 fps로 55번째 프레임
    expect(done.arrivedAt).toBeCloseTo(55 / 60, 9);
  });

  it('도착은 한 번만 알린다', () => {
    let s = startPath(createPlayer(100, 100), [{ x: 120, y: 100 }]);
    let arrivals = 0;
    for (let i = 0; i < 30; i++) {
      const r = stepPlayer(s, NONE, 1 / 60, open);
      s = r.state;
      if (r.arrived) arrivals++;
    }
    expect(arrivals).toBe(1);
  });

  it('모서리를 돌아도 속도가 같다: 남은 걸음을 다음 구간에 이어 쓴다', () => {
    const s0 = startPath(createPlayer(100, 100), [{ x: 200, y: 100 }, { x: 200, y: 300 }]);
    const s = run(s0, NONE, 0.5, 60, open).state; // 110 px: 첫 구간 100 + 10
    expect(s.x).toBeCloseTo(200, 6);
    expect(s.y).toBeCloseTo(110, 6);
    expect(s.facing).toBe('down');
  });

  it('프레임이 달라도 같은 길을 같은 시간에 간다', () => {
    const at = (fps: number): PlayerState => run(startPath(createPlayer(100, 100), [{ x: 400, y: 100 }, { x: 400, y: 400 }]), NONE, 1, fps, open).state;
    const a = at(30);
    const b = at(144);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it('키보드를 누르면 길을 버리고 키를 따른다', () => {
    const s0 = startPath(createPlayer(100, 100), [{ x: 900, y: 100 }]);
    const r = stepPlayer(s0, { dx: 0, dy: 1 }, 1 / 60, open);
    expect(r.state.path).toBeNull();
    expect(r.state.y).toBeGreaterThan(100);
    expect(r.state.x).toBe(100);
  });

  it('길 취소: 서 있는다', () => {
    const s0 = startPath(createPlayer(100, 100), [{ x: 900, y: 100 }]);
    const s1 = cancelPath(stepPlayer(s0, NONE, 1 / 60, open).state);
    const s2 = stepPlayer(s1, NONE, 1 / 60, open).state;
    expect(s2.x).toBe(s1.x);
    expect(cancelPath(s2)).toBe(s2);
  });

  it('빈 길은 길이 없는 것이다', () => {
    expect(startPath(createPlayer(1, 1), []).path).toBeNull();
  });

  it('길 점이 벽 너머라 막히면 포기하고 알린다', () => {
    const s0 = startPath(createPlayer(100, 100), [{ x: 300, y: 100 }]);
    const r = run(s0, NONE, 3, 60, wall);
    expect(r.stuckAt).not.toBeNull();
    expect(r.state.path).toBeNull();
    expect(r.state.x).toBeLessThanOrEqual(146);
    expect(r.arrivedAt).toBeNull();
    // 막힌 뒤 STUCK_LIMIT 걸음 안에 포기한다: 벽에 닿는 데 (146−100)/3.67 ≈ 13 걸음
    expect(r.stuckAt!).toBeLessThan((13 + STUCK_LIMIT + 2) / 60);
  });

  it('기둥 옆을 스치는 길(몸이 닿기 직전)도 끝까지 간다', () => {
    const pillar = NavGrid.fromRows(['..........', '...#......', '..........']);
    // 기둥 (3,1): x 96–128, y 32–64. 몸 아래 끝이 기둥 윗면(y=32)에 닿기 직전인 y=18 선을 따라 오른쪽으로
    const s0 = startPath(createPlayer(20, 18), [{ x: 280, y: 18 }]);
    const r = run(s0, NONE, 2, 60, pillar);
    expect(r.state.x).toBe(280);
    expect(r.arrivedAt).not.toBeNull();
  });
});
