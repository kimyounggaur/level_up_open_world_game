// 캐릭터 이동(설계서 7.2). 키보드(방향키, WASD)와 누르기로 찾은 길을 같은 걸음으로 걷는다. 순수 계산이다.
// 속도는 220 px/초 한 가지, 대각선도 같은 속도다. 걷는 속도와 경로는 어떤 판정에도 들어가지 않는다(W-3).
import { BODY_RADIUS, WALK_SPEED } from '../domain/world';
import type { Facing } from '../domain/world';
import { moveCircle } from './nav';
import type { NavGrid, Point } from './nav';

export type { Facing };

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  /** 지난 걸음에서 실제로 움직였는가(걷기 그림에 쓴다) */
  moving: boolean;
  /** 남은 길 점들. 없으면 null */
  path: Point[] | null;
  /** 길을 따라가다 막혀 거의 못 움직인 걸음이 이어진 수 */
  stuckSteps: number;
}

export interface MoveInput {
  /** -1 왼쪽, 1 오른쪽, 0 없음 */
  dx: number;
  /** -1 위쪽, 1 아래쪽, 0 없음 */
  dy: number;
}

export interface StepResult {
  state: PlayerState;
  /** 이번 걸음에서 길의 끝에 닿았는가 */
  arrived: boolean;
  /** 길이 막혀 포기했는가(장면이 길을 다시 찾을 수 있다) */
  stuck: boolean;
}

/** 한 번에 이 시간보다 긴 걸음은 쪼갠다. 한 걸음은 220 × (1/60) ≈ 3.7 px로 칸(32 px)보다 훨씬 작아 벽을 뚫지 못한다 */
export const MAX_SUBSTEP_SEC = 1 / 60;
/** 탭이 멈췄다 돌아와도 이 시간만큼만 걷는다 */
export const MAX_FRAME_SEC = 0.1;
/** 막힌 걸음이 이만큼 이어지면 길을 포기한다 */
export const STUCK_LIMIT = 12;

export const createPlayer = (x: number, y: number, facing: Facing = 'down'): PlayerState => ({ x, y, facing, moving: false, path: null, stuckSteps: 0 });

export const startPath = (s: PlayerState, waypoints: readonly Point[]): PlayerState => ({ ...s, path: waypoints.length > 0 ? waypoints.map((p) => ({ ...p })) : null, stuckSteps: 0 });

export const cancelPath = (s: PlayerState): PlayerState => (s.path === null ? s : { ...s, path: null, stuckSteps: 0 });

function facingOf(vx: number, vy: number, prev: Facing): Facing {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (ax === 0 && ay === 0) return prev;
  if (ax > ay) return vx > 0 ? 'right' : 'left';
  if (ay > ax) return vy > 0 ? 'down' : 'up';
  // 대각선(두 성분이 같음): 가로 방향을 본다
  return vx > 0 ? 'right' : 'left';
}

/** 한 프레임만큼 걷는다. 키보드 입력이 있으면 길을 버리고 키를 따른다 */
export function stepPlayer(state: PlayerState, input: MoveInput, dtSec: number, grid: NavGrid): StepResult {
  let dt = Math.min(Math.max(dtSec, 0), MAX_FRAME_SEC);
  let { x, y, facing } = state;
  let path = state.path;
  let stuckSteps = state.stuckSteps;
  let arrived = false;
  let stuck = false;
  const startX = x;
  const startY = y;

  const keyboard = input.dx !== 0 || input.dy !== 0;
  if (keyboard) {
    path = null;
    stuckSteps = 0;
  }

  while (dt > 1e-9) {
    const h = Math.min(dt, MAX_SUBSTEP_SEC);
    dt -= h;
    if (keyboard) {
      const len = Math.hypot(input.dx, input.dy);
      const vx = (input.dx / len) * WALK_SPEED;
      const vy = (input.dy / len) * WALK_SPEED;
      const p = moveCircle(grid, { x, y }, vx * h, vy * h, BODY_RADIUS);
      x = p.x;
      y = p.y;
      facing = facingOf(vx, vy, facing);
    } else if (path && path.length > 0) {
      let budget = WALK_SPEED * h;
      let moved = 0;
      let lastDir: Point = { x: 0, y: 0 };
      while (budget > 1e-9 && path.length > 0) {
        const target = path[0]!;
        const dist = Math.hypot(target.x - x, target.y - y);
        if (dist <= 1e-6) {
          path = path.slice(1);
          continue;
        }
        const stepLen = Math.min(budget, dist);
        const ux = (target.x - x) / dist;
        const uy = (target.y - y) / dist;
        const p = moveCircle(grid, { x, y }, ux * stepLen, uy * stepLen, BODY_RADIUS);
        const got = Math.hypot(p.x - x, p.y - y);
        x = p.x;
        y = p.y;
        moved += got;
        lastDir = { x: ux, y: uy };
        budget -= stepLen;
        if (stepLen === dist && got >= stepLen - 1e-6) {
          // 이 점에 닿았다. 계산 오차를 없애려고 점에 딱 맞춘다
          x = target.x;
          y = target.y;
          path = path.slice(1);
        } else if (got < stepLen * 0.2) break; // 막혀서 거의 못 갔다
      }
      facing = facingOf(lastDir.x, lastDir.y, facing);
      const intended = WALK_SPEED * h - Math.max(budget, 0);
      if (path.length > 0 && intended > 0.5 && moved < intended * 0.2) stuckSteps++;
      else stuckSteps = 0;
      if (path.length === 0) {
        path = null;
        arrived = true;
        break;
      }
      if (stuckSteps >= STUCK_LIMIT) {
        path = null;
        stuckSteps = 0;
        stuck = true;
        break;
      }
    } else {
      break;
    }
  }

  const moving = Math.hypot(x - startX, y - startY) > 0.01;
  return { state: { x, y, facing, moving, path, stuckSteps }, arrived, stuck };
}
