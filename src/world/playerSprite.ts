// 주인공 캐릭터 그림(설계서 9.3)의 이름과 규격, 지금 그릴 장을 고르는 계산. 순수 계산이다: 장면(WorldScene)이 읽어서 그린다.
// 그림은 world-src/art/characters.ts가 칠해 사물 아틀라스에 함께 굽는다(D-308). 48×72 칸, 4방향 × (서 있기 2장 + 걷기 6장) = 32장.
// 움직임 줄이기(9.7)에서는 장을 넘기지 않는다: 주민(7-6)과 같은 규칙이다. 걷는 중 위아래 흔들림도 없다.
import type { Facing } from '../domain/world';

export type PlayerPose = 'idle' | 'walk';

/** 그림 한 장의 크기(월드 px). 아틀라스에는 2배로 구워져 있다 */
export const PLAYER_FRAME_W = 48;
export const PLAYER_FRAME_H = 72;
/** 발이 놓이는 높이(칸 위에서). 그림의 기준점 y 비율은 PLAYER_FOOT_Y / PLAYER_FRAME_H */
export const PLAYER_FOOT_Y = 68;
export const PLAYER_FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];
export const PLAYER_POSE_FRAMES: Readonly<Record<PlayerPose, number>> = { idle: 2, walk: 6 };

/** 그림 이름: chr-player-<방향>-<자세>-<번호> */
export const playerFrameName = (facing: Facing, pose: PlayerPose, i: number): string => `chr-player-${facing}-${pose}-${i}`;

/** 32장 전체의 이름 */
export const playerFrameNames = (): string[] =>
  PLAYER_FACINGS.flatMap((f) => (['idle', 'walk'] as const).flatMap((pose) => Array.from({ length: PLAYER_POSE_FRAMES[pose] }, (_, i) => playerFrameName(f, pose, i))));

/** 걷기 한 바퀴(두 걸음)의 길이(초). 걷는 속도 220 px/초에서 한 걸음이 약 62 px이다 */
export const WALK_CYCLE_SEC = 0.56;
/** 눈 깜박임: 이 간격마다 BLINK_SEC 동안 서 있기의 둘째 장(눈 감음)을 그린다 */
export const BLINK_EVERY_SEC = 3.4;
export const BLINK_SEC = 0.14;
/** 걷는 동안 그림 전체가 위아래로 움직이는 폭(px). 두 발이 모이는 장(0, 3)에서 가장 높다 */
export const WALK_BOB_PX = 1.2;

export interface PlayerLook {
  /** 아틀라스의 틀 이름 */
  frame: string;
  /** 그림을 위아래로 옮길 만큼(음수가 위) */
  bob: number;
}

/** 걷기 한 바퀴의 진행(0–1)을 dt만큼 나아가게 한다. 멈추면 0으로 돌아간다 */
export const advanceWalk = (phase: number, moving: boolean, dt: number): number => (moving ? (phase + Math.max(0, dt) / WALK_CYCLE_SEC) % 1 : 0);

/** 지금 그릴 장. phase는 걷기 한 바퀴의 진행(0–1), clock은 장면 시계(초) */
export function playerLook(facing: Facing, moving: boolean, phase: number, clock: number, reduce: boolean): PlayerLook {
  if (reduce) return { frame: playerFrameName(facing, 'idle', 0), bob: 0 };
  if (moving) {
    const p = ((phase % 1) + 1) % 1;
    const k = Math.min(PLAYER_POSE_FRAMES.walk - 1, Math.floor(p * PLAYER_POSE_FRAMES.walk));
    const c = Math.cos(2 * Math.PI * p);
    return { frame: playerFrameName(facing, 'walk', k), bob: -WALK_BOB_PX * c * c };
  }
  const blink = ((clock % BLINK_EVERY_SEC) + BLINK_EVERY_SEC) % BLINK_EVERY_SEC < BLINK_SEC;
  return { frame: playerFrameName(facing, 'idle', blink ? 1 : 0), bob: 0 };
}
