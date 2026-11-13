// 4-6 소리 물결의 위치 계산(설계서 8.4, W-8): 화면 밖 900 px 안의 정거장이 있는 쪽 가장자리.
import { describe, expect, it } from 'vitest';
import { computeRipples } from '@/domain/ripple';
import type { RippleSource, WorldView } from '@/domain/ripple';
import { HEAR_RADIUS, hearGain } from '@/domain/worldsound';

const screen = { width: 1280, height: 720 };
// 캐릭터(5000, 3000)를 가운데에 둔 화면: 월드 1280×720이 그대로 보인다(배율 1)
const player = { x: 5000, y: 3000 };
const view: WorldView = { x: 5000 - 640, y: 3000 - 360, width: 1280, height: 720 };
const at = (id: string, dx: number, dy: number): RippleSource => ({ id, name: `정거장 ${id}`, x: player.x + dx, y: player.y + dy });

describe('소리 물결의 위치(8.4)', () => {
  it('화면 안에 보이는 정거장에는 물결이 없다', () => {
    expect(computeRipples([at('a', 100, 50), at('b', -600, 300)], player, view, screen)).toEqual([]);
  });

  it('900 px 밖의 정거장에는 물결이 없다(화면 밖이어도)', () => {
    expect(computeRipples([at('far', HEAR_RADIUS + 1, 0), at('far2', 0, -2000)], player, view, screen)).toEqual([]);
  });

  it('화면 밖 900 px 안이면 그 방향의 가장자리에 물결이 생긴다', () => {
    const [right] = computeRipples([at('r', 800, 0)], player, view, screen);
    expect(right!.edge).toBe('right');
    expect(right!.x).toBeCloseTo(1280 - 14, 5);
    expect(right!.y).toBeCloseTo(360, 5);
    expect(right!.angle).toBeCloseTo(0, 5);

    const [left] = computeRipples([at('l', -800, 0)], player, view, screen);
    expect(left!.edge).toBe('left');
    expect(left!.x).toBeCloseTo(14, 5);

    const [up] = computeRipples([at('u', 0, -600)], player, view, screen);
    expect(up!.edge).toBe('top');
    expect(up!.y).toBeCloseTo(14, 5);
    expect(up!.x).toBeCloseTo(640, 5);
    expect(up!.angle).toBeCloseTo(-90, 5);

    const [down] = computeRipples([at('d', 0, 700)], player, view, screen);
    expect(down!.edge).toBe('bottom');
    expect(down!.y).toBeCloseTo(720 - 14, 5);
    expect(down!.angle).toBeCloseTo(90, 5);
  });

  it('비스듬한 쪽은 화면 가운데에서 그 정거장으로 그은 선이 가장자리와 만나는 곳이다', () => {
    const [r] = computeRipples([at('diag', 700, 500)], player, view, screen);
    // 화면 가운데(640, 360)에서 (700, 500) 방향. 아래 가장자리(안쪽 14 px)에서 만난다
    expect(r!.edge).toBe('bottom');
    expect(r!.y).toBeCloseTo(720 - 14, 5);
    const slope = 500 / 700;
    expect(r!.x).toBeCloseTo(640 + (360 - 14) / slope, 3);
    // 모든 물결은 화면 안에 있다
    expect(r!.x).toBeGreaterThanOrEqual(0);
    expect(r!.x).toBeLessThanOrEqual(1280);
  });

  it('세기는 음량과 같은 식이고, 가까운 것부터 늘어선다', () => {
    const rs = computeRipples([at('far', 850, 0), at('near', 700, 0), at('mid', 0, -780)], player, view, screen);
    expect(rs.map((r) => r.id)).toEqual(['near', 'mid', 'far']);
    expect(rs[0]!.strength).toBeCloseTo(hearGain(700), 10);
    expect(rs[0]!.strength).toBeGreaterThan(rs[2]!.strength);
    expect(rs[0]!.distance).toBeCloseTo(700, 10);
  });

  it('한꺼번에 그리는 물결은 여섯 개까지다(가까운 것이 남는다)', () => {
    const many = Array.from({ length: 10 }, (_, i) => at(`s${i}`, 700 + i * 10, 0));
    const rs = computeRipples(many, player, view, screen);
    expect(rs).toHaveLength(6);
    expect(rs.map((r) => r.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    expect(computeRipples(many, player, view, screen, { max: 2 })).toHaveLength(2);
  });

  it('화면 배율이 다르면 같은 월드 거리가 다른 화면 거리로 바뀐다', () => {
    // 월드 640×360이 1280×720 화면에 보인다(배율 2). 월드로 500 px 떨어진 곳은 화면 밖이다
    const zoomed: WorldView = { x: player.x - 320, y: player.y - 180, width: 640, height: 360 };
    expect(computeRipples([at('a', 500, 0)], player, zoomed, screen)).toHaveLength(1);
    // 같은 곳이 배율 1에서는 보인다
    expect(computeRipples([at('a', 500, 0)], player, view, screen)).toEqual([]);
  });

  it('화면 가장자리 바로 안쪽(24 px 이내)은 아직 안 보이는 것으로 친다', () => {
    expect(computeRipples([at('edge', 640 - 10, 0)], player, view, screen)).toHaveLength(1);
    expect(computeRipples([at('in', 640 - 60, 0)], player, view, screen)).toEqual([]);
  });

  it('화면이나 보이는 범위가 0이면 아무것도 그리지 않는다', () => {
    expect(computeRipples([at('r', 800, 0)], player, view, { width: 0, height: 0 })).toEqual([]);
    expect(computeRipples([at('r', 800, 0)], player, { ...view, width: 0 }, screen)).toEqual([]);
  });

  it('화면 한쪽을 가리는 것이 있으면(세로 화면의 탭 막대) 그쪽 가장자리에서 더 안쪽에 놓인다', () => {
    const [plain] = computeRipples([at('d', 0, 700)], player, view, screen);
    const [inset] = computeRipples([at('d', 0, 700)], player, view, screen, { insets: { bottom: 72 } });
    expect(plain!.y).toBeCloseTo(720 - 14, 5);
    expect(inset!.y).toBeCloseTo(720 - 14 - 72, 5);
    expect(inset!.edge).toBe('bottom');
    expect(inset!.x).toBeCloseTo(640, 5); // 방향은 그대로다
    // 다른 쪽은 그대로다
    const [right] = computeRipples([at('r', 800, 0)], player, view, screen, { insets: { bottom: 72 } });
    expect(right!.x).toBeCloseTo(1280 - 14, 5);
  });

  it('여백을 더해도 비스듬한 방향은 화면 가운데에서 그은 선 위에 있다', () => {
    const insets = { top: 20, right: 30, bottom: 72, left: 10 };
    const [r] = computeRipples([at('diag', 700, 500)], player, view, screen, { insets });
    const slope = 500 / 700;
    expect((r!.y - 360) / (r!.x - 640)).toBeCloseTo(slope, 5);
    expect(r!.y).toBeLessThanOrEqual(720 - 14 - 72 + 1e-9);
    expect(r!.x).toBeLessThanOrEqual(1280 - 14 - 30 + 1e-9);
  });

  it('여백이 화면보다 커도 던지지 않고 화면 가운데에 놓는다(가장자리를 넘지 않는다)', () => {
    const [r] = computeRipples([at('d', 0, 700)], player, view, screen, { insets: { bottom: 5000 } });
    expect(r).toBeDefined();
    expect(Number.isFinite(r!.x) && Number.isFinite(r!.y)).toBe(true);
    expect(r!.y).toBeCloseTo(360, 5);
  });
});
