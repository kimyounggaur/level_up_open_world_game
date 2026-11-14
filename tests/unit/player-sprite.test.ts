// 주인공 캐릭터의 장 고르기(src/world/playerSprite.ts, D-308): 걷기 6장이 한 바퀴에 차례로 지나가고, 서 있으면 가끔 눈을 깜박이며,
// 움직임 줄이기(9.7)에서는 장을 넘기지 않고 흔들림도 없다.
import { describe, expect, it } from 'vitest';
import { BLINK_EVERY_SEC, BLINK_SEC, PLAYER_FOOT_Y, PLAYER_FRAME_H, WALK_BOB_PX, WALK_CYCLE_SEC, advanceWalk, playerFrameName, playerFrameNames, playerLook } from '../../src/world/playerSprite';

describe('캐릭터 그림의 이름과 규격', () => {
  it('이름은 chr-player-<방향>-<자세>-<번호>이고 32장이다', () => {
    expect(playerFrameName('left', 'walk', 3)).toBe('chr-player-left-walk-3');
    const names = playerFrameNames();
    expect(names).toHaveLength(32);
    expect(new Set(names).size).toBe(32);
    for (const f of ['down', 'up', 'left', 'right']) {
      expect(names.filter((n) => n.startsWith(`chr-player-${f}-idle-`))).toHaveLength(2);
      expect(names.filter((n) => n.startsWith(`chr-player-${f}-walk-`))).toHaveLength(6);
    }
  });

  it('발은 칸의 아래쪽에 놓인다(그림자를 그릴 4 px를 남긴다)', () => {
    expect(PLAYER_FRAME_H - PLAYER_FOOT_Y).toBe(4);
  });
});

describe('걷기', () => {
  it('한 바퀴(0–1) 동안 걷기 0–5장이 차례로 지나간다', () => {
    const seen = Array.from({ length: 60 }, (_, i) => playerLook('down', true, i / 60, 0, false).frame);
    expect([...new Set(seen)]).toEqual([0, 1, 2, 3, 4, 5].map((k) => playerFrameName('down', 'walk', k)));
  });

  it('위아래 흔들림은 두 발이 모이는 때(0, 0.5)에 가장 높고 발을 벌린 때(0.25, 0.75)에 0이다', () => {
    expect(playerLook('left', true, 0, 0, false).bob).toBeCloseTo(-WALK_BOB_PX, 6);
    expect(playerLook('left', true, 0.5, 0, false).bob).toBeCloseTo(-WALK_BOB_PX, 6);
    expect(playerLook('left', true, 0.25, 0, false).bob).toBeCloseTo(0, 6);
    expect(playerLook('left', true, 0.75, 0, false).bob).toBeCloseTo(0, 6);
  });

  it('걷는 동안 한 바퀴는 WALK_CYCLE_SEC이고, 멈추면 처음으로 돌아간다', () => {
    let phase = 0;
    for (let i = 0; i < 10; i++) phase = advanceWalk(phase, true, WALK_CYCLE_SEC / 10);
    // 한 바퀴를 돌면 처음 자리(0 또는 계산 오차로 1에 아주 가까운 값)다
    expect(Math.min(phase, 1 - phase)).toBeCloseTo(0, 6);
    expect(advanceWalk(0, true, WALK_CYCLE_SEC / 4)).toBeCloseTo(0.25, 6);
    expect(advanceWalk(0.4, false, 0.016)).toBe(0);
    expect(advanceWalk(0.4, true, -1)).toBeCloseTo(0.4, 6);
  });
});

describe('서 있기', () => {
  it('눈은 BLINK_EVERY_SEC마다 BLINK_SEC 동안만 감는다', () => {
    expect(playerLook('down', false, 0, 0.05, false).frame).toBe('chr-player-down-idle-1');
    expect(playerLook('down', false, 0, BLINK_SEC + 0.01, false).frame).toBe('chr-player-down-idle-0');
    expect(playerLook('down', false, 0, BLINK_EVERY_SEC + 0.05, false).frame).toBe('chr-player-down-idle-1');
    expect(playerLook('up', false, 0, 1.7, false)).toEqual({ frame: 'chr-player-up-idle-0', bob: 0 });
  });
});

describe('움직임 줄이기(9.7)', () => {
  it('걷든 서 있든 바라보는 쪽의 서 있기 첫 장이고 흔들림이 없다', () => {
    for (const facing of ['down', 'up', 'left', 'right'] as const) {
      for (const phase of [0, 0.3, 0.6]) {
        expect(playerLook(facing, true, phase, 0.05, true)).toEqual({ frame: playerFrameName(facing, 'idle', 0), bob: 0 });
        expect(playerLook(facing, false, phase, 0.05, true)).toEqual({ frame: playerFrameName(facing, 'idle', 0), bob: 0 });
      }
    }
  });
});
