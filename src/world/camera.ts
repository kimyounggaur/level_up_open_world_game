// 카메라 규칙(설계서 7.1, 7.3). 순수 계산만 둔다. Phaser 카메라에는 장면이 이 값을 옮겨 적는다.
import type { WorldRect } from '../domain/installation';
import { WORLD_H, WORLD_W } from '../domain/world';

/** 가로 화면은 세로로 이만큼의 월드 px가 보이도록 배율을 정한다(7.1) */
export const VIEW_LANDSCAPE_HEIGHT = 720;
/** 세로 화면은 가로로 이만큼의 월드 px가 보이도록 배율을 정한다(7.1) */
export const VIEW_PORTRAIT_WIDTH = 540;
/** 따라가기 보간(7.3). 60프레임 기준 한 프레임에 남은 거리의 12%를 따라간다 */
export const FOLLOW_LERP = 0.12;
/** 화면 가운데 이 크기(화면 px) 안에서 움직일 때는 카메라가 멈춰 있다(7.3) */
export const DEADZONE_SCREEN = { width: 160, height: 120 } as const;

export interface ViewSize {
  width: number;
  height: number;
}

/** 화면 크기에서 배율을 구한다. 가로 화면(너비 ≥ 높이)은 세로 720, 세로 화면은 가로 540이 보인다 */
export function cameraZoom(view: ViewSize): number {
  if (view.width <= 0 || view.height <= 0) return 1;
  return view.width >= view.height ? view.height / VIEW_LANDSCAPE_HEIGHT : view.width / VIEW_PORTRAIT_WIDTH;
}

/** 화면에 보이는 월드의 크기. zoom을 주면 그 배율로 본다(설치물 모드는 기본보다 멀리서 본다) */
export function visibleWorld(view: ViewSize, zoom: number = cameraZoom(view)): ViewSize {
  return { width: view.width / zoom, height: view.height / zoom };
}

export interface Point {
  x: number;
  y: number;
}

/** 카메라 중심(월드 px). 월드 밖을 비추지 않도록 가둔다. 한 축에서 보이는 범위가 월드보다 크면 그 축은 월드 가운데에 둔다 */
export function clampCenter(center: Point, view: ViewSize, world: ViewSize = { width: WORLD_W, height: WORLD_H }, zoom: number = cameraZoom(view)): Point {
  const vis = visibleWorld(view, zoom);
  const axis = (c: number, v: number, w: number): number => (v >= w ? w / 2 : Math.min(Math.max(c, v / 2), w - v / 2));
  return { x: axis(center.x, vis.width, world.width), y: axis(center.y, vis.height, world.height) };
}

/**
 * 설치물 모드의 카메라 중심. clampCenter와 같되, 조작 막대가 가리는 아래쪽(inset 화면 px)만큼은 월드 아래 가장자리를 넘어 비춰도 된다.
 * 넘은 부분은 막대 뒤라 보이지 않으니 월드 밖이 비치는 것이 아니다. 이렇게 하지 않으면 월드 남쪽 끝 가까이에 있는 설치물(음계 길 단음계 길 등)이
 * 막대가 화면의 절반이 넘는 세로 휴대폰에서 월드 가장자리에 막혀 위로 올라오지 못하고 막대 뒤에 가려진다.
 * 위쪽과 양옆은 clampCenter와 같다(월드 밖을 비추지 않는다). inset이 0이면 clampCenter와 똑같다.
 */
export function clampFrameCenter(center: Point, view: ViewSize, world: ViewSize = { width: WORLD_W, height: WORLD_H }, zoom: number = cameraZoom(view), inset = 0): Point {
  const base = clampCenter(center, view, world, zoom);
  if (!(inset > 0)) return base;
  const vis = visibleWorld(view, zoom);
  // 보이는 범위가 월드보다 크면 clampCenter처럼 월드 가운데에 둔다(이 축은 가릴 것이 없다)
  if (vis.height >= world.height) return base;
  const bottom = world.height + inset / zoom;
  return { x: base.x, y: Math.min(Math.max(center.y, vis.height / 2), bottom - vis.height / 2) };
}

/**
 * 따라가기 한 걸음. 목표(캐릭터)가 화면 가운데 160×120 안에 있으면 멈춰 있고,
 * 벗어나면 안쪽 가장자리에 걸치는 위치를 향해 부드럽게 따라간다.
 * 보간은 시간 기준이라 프레임이 떨어져도 따라가는 모양이 같다.
 */
export function followStep(center: Point, target: Point, dtSec: number, view: ViewSize, world: ViewSize = { width: WORLD_W, height: WORLD_H }): Point {
  const z = cameraZoom(view);
  const halfW = DEADZONE_SCREEN.width / z / 2;
  const halfH = DEADZONE_SCREEN.height / z / 2;
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const goalX = center.x + (dx > halfW ? dx - halfW : dx < -halfW ? dx + halfW : 0);
  const goalY = center.y + (dy > halfH ? dy - halfH : dy < -halfH ? dy + halfH : 0);
  const a = 1 - Math.pow(1 - FOLLOW_LERP, Math.max(0, dtSec) * 60);
  return clampCenter({ x: center.x + (goalX - center.x) * a, y: center.y + (goalY - center.y) * a }, view, world);
}

/** 보간 없이 바로 목표를 가운데에 둔다(처음 시작, 바로 이동, 움직임 줄이기) */
export function snapCenter(target: Point, view: ViewSize, world: ViewSize = { width: WORLD_W, height: WORLD_H }): Point {
  return clampCenter(target, view, world);
}

// ───── 설치물 모드의 카메라(설계서 4.2) ─────
// 96 px 안에서 상호작용하면 카메라가 0.3초 동안 설치물 전체를 담도록 움직이고, 나가면 같은 시간 동안 캐릭터에게 돌아온다.

/** 카메라의 자세: 보는 중심(월드 px)과 배율 */
export interface CameraPose {
  center: Point;
  zoom: number;
}

/** 설치물을 담는 데 걸리는 시간(초, 4.2) */
export const FRAME_SECONDS = 0.3;
/** 설치물 둘레에 남기는 여유(월드 px) */
export const FRAME_PAD = 72;
/** 박을 따라가는 카메라가 새 박으로 옮겨 갈 때 남은 거리의 95%를 지나는 데 걸리는 시간(초). 4.2의 설치물 진입과 같은 0.3초다 */
export const BEAT_FOLLOW_SECONDS = 0.3;
/**
 * 화면 위쪽 메뉴 띠의 높이(화면 px). 오른쪽 위 메뉴 단추는 위에서 12 px 떨어져 높이 48 px이고(7.6) 그림자까지 더해 64 px로 본다.
 * 긴 줄의 한 부분은 조작 막대 위쪽 자리를 꽉 채우므로, 이 띠 아래에 담지 않으면 부분의 첫 칸이 메뉴 단추 뒤로 가려서 누를 수 없다.
 */
export const MENU_BAND = 64;

export interface FrameOptions {
  /** 사각형 둘레의 여유(월드 px) */
  pad?: number;
  /**
   * 이 배율보다 멀어지지 않는다: 작은 설치물의 칸이 좁은 화면에서 누르기 어렵게 작아지지 않도록 한다.
   * 단 사각형 자체(여유를 뺀)가 화면에 다 들어오는 한도 안에서만 올린다
   */
  minZoom?: number;
  /** 화면 아래를 조작 막대가 가리는 높이(화면 px). 설치물은 그 위쪽 자리의 가운데에 놓인다 */
  bottomInset?: number;
  /**
   * 켜면 minZoom을 '사각형의 너비가 화면에 다 들어오는 한도'로 깎지 않는다(followPose만 읽는다). 바퀴처럼 가로로도 넓은 설치물이
   * 좁은 휴대폰(폭 401 px 아래)에서도 칸 48 px를 지키게 하려는 것이다. 대신 가로로도 고른 칸을 따라간다(설계서 7.3)
   */
  strictMinZoom?: boolean;
}

/** 긴 줄의 한 부분을 담을 때의 옵션: FrameOptions에 위쪽 메뉴 띠가 더해진다 */
export interface FollowOptions extends FrameOptions {
  /** 화면 위쪽을 메뉴 단추가 가리는 높이(화면 px). 부분은 이 띠 아래와 조작 막대 위 사이에 담긴다 */
  topInset?: number;
  /**
   * 고른 칸이 두 곳에 그려지는 설치물(바퀴와 띠)의 두 번째 점. focus(바퀴의 칸)와 함께 칸 하나씩의 여유(SHOW_MARGIN)를 두고
   * 보이는 범위에 들면 둘의 한가운데를 비추고, 들지 않으면 focus만 비춘다: 눌러야 하는 칸이 하나라도 온전히 보이는 것이 먼저다
   */
  alsoShow?: Point;
}

/** alsoShow를 함께 보이려 할 때 두 점 바깥쪽에 남겨 둘 여유(월드 px): 고리 한 칸의 두께(86)의 반을 넘는다 */
export const SHOW_MARGIN = 60;

/**
 * 설치물 전체(rect)가 조작 막대에 가리지 않고 화면에 들어오는 카메라 자세.
 * 기본 배율로 이미 다 들어오면 배율은 그대로 두고, 넘치면(좁은 세로 화면) 필요한 만큼만 멀어진다.
 */
export function framePose(rect: WorldRect, view: ViewSize, opts: FrameOptions = {}, world: ViewSize = { width: WORLD_W, height: WORLD_H }): CameraPose {
  const pad = opts.pad ?? FRAME_PAD;
  const base = cameraZoom(view);
  // 막대가 화면의 대부분을 가리는 극단에서도 설치물이 보이게 가릴 수 있는 높이에 한계를 둔다
  const inset = Math.min(Math.max(0, opts.bottomInset ?? 0), view.height * 0.7);
  const availableH = Math.max(1, view.height - inset);
  const fit = Math.min(view.width / (rect.w + 2 * pad), availableH / (rect.h + 2 * pad));
  let zoom = Math.min(base, fit);
  if (opts.minZoom !== undefined && zoom < opts.minZoom) {
    // 여유를 줄이면서 가까이 가되, 사각형 자체가 화면을 넘치는 배율까지는 가지 않는다
    const tight = Math.min(view.width / Math.max(1, rect.w), availableH / Math.max(1, rect.h));
    zoom = Math.max(zoom, Math.min(opts.minZoom, tight));
  }
  // 설치물의 가운데가 '막대 위쪽 자리'의 가운데에 오도록, 화면 가운데(카메라 중심)를 막대 높이의 절반만큼 아래로 옮긴다
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 + inset / 2 / zoom };
  return { center: clampFrameCenter(center, view, world, zoom, inset), zoom };
}

/**
 * 줄이 화면보다 길어서 한 부분(박 하나)만 담는 설치물(확대형 징검다리, 4.4)의 카메라 자세. rect는 지금 담을 부분이다.
 * framePose와 다른 점: 칸이 화면에서 minZoom(칸 48px) 아래로 줄지 않는 것이 먼저다. 부분이 조작 막대 위쪽 자리에 다 들어오지 않으면
 * 배율을 지키고 focus(고른 칸)가 보이도록 그 부분 안에서만 비춘다. 부분이 다 들어오면 framePose처럼 부분의 가운데를 비춘다.
 */
export function followPose(rect: WorldRect, focus: Point, view: ViewSize, opts: FollowOptions = {}, world: ViewSize = { width: WORLD_W, height: WORLD_H }): CameraPose {
  const pad = opts.pad ?? FRAME_PAD;
  const base = cameraZoom(view);
  // 위쪽 메뉴 띠와 아래쪽 막대에는 한계를 둔다: 둘을 빼고도 화면의 1할은 남는다. 띠는 화면의 2할까지이고,
  // 막대는 띠를 뺀 나머지의 90%까지 믿는다(작은 휴대폰의 막대는 화면의 70%를 넘기도 해서, 70%로 자르면 고른 칸이 막대 뒤로 가려진다)
  const top = Math.min(Math.max(0, opts.topInset ?? 0), view.height * 0.2);
  const inset = Math.min(Math.max(0, opts.bottomInset ?? 0), view.height * 0.9 - top);
  const availableH = Math.max(1, view.height - inset - top);
  const fit = Math.min(view.width / (rect.w + 2 * pad), availableH / (rect.h + 2 * pad));
  let zoom = Math.min(base, fit);
  // 칸이 작아지지 않는 것이 먼저다. 직각 방향(줄의 두께)이 화면 너비에 다 들어오는 한도 안에서만 올린다.
  // 단 strictMinZoom(바퀴)이면 너비 한도 없이 올리고, 가로로 넘치는 만큼은 고른 칸을 따라간다
  if (opts.minZoom !== undefined && zoom < opts.minZoom) zoom = Math.max(zoom, opts.strictMinZoom ? opts.minZoom : Math.min(opts.minZoom, view.width / Math.max(1, rect.w)));
  const visW = view.width / zoom;
  const visH = availableH / zoom;
  // 두 번째 점(띠의 같은 칸)이 있으면: 둘이 다 보이는 범위에 들 때만 한가운데를, 아니면 focus(바퀴의 칸)만 비춘다
  const also = opts.alsoShow;
  const pair = also !== undefined && Math.abs(also.x - focus.x) <= visW - 2 * SHOW_MARGIN && Math.abs(also.y - focus.y) <= visH - 2 * SHOW_MARGIN;
  const aim = pair && also ? { x: (focus.x + also.x) / 2, y: (focus.y + also.y) / 2 } : focus;
  // 한 축에서 담을 구간이 보이는 길이에 들면 구간의 가운데, 넘치면 aim이 보이는 쪽으로(구간을 벗어나지 않게)
  const axis = (lo: number, hi: number, at: number, vis: number): number => (hi - lo <= vis ? (lo + hi) / 2 : Math.min(Math.max(at, lo + vis / 2), hi - vis / 2));
  const center = {
    x: axis(rect.x - pad, rect.x + rect.w + pad, aim.x, visW),
    // 담는 부분이 '메뉴 띠 아래, 조작 막대 위' 자리의 가운데에 오도록 카메라 중심을 (막대 − 띠)의 절반만큼 아래로 옮긴다
    y: axis(rect.y - pad, rect.y + rect.h + pad, aim.y, visH) + (inset - top) / 2 / zoom,
  };
  return { center: clampFrameCenter(center, view, world, zoom, inset), zoom };
}

/** 부드럽게 시작하고 부드럽게 끝나는 0–1 곡선 */
export const easeInOut = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** 두 자세 사이. t는 0(from)–1(to)이고, 곡선을 입혀서 섞는다 */
export function blendPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const k = easeInOut(t);
  return {
    center: { x: from.center.x + (to.center.x - from.center.x) * k, y: from.center.y + (to.center.y - from.center.y) * k },
    zoom: from.zoom + (to.zoom - from.zoom) * k,
  };
}

export interface RigStep {
  /** 지난 프레임에서 흐른 시간(초) */
  dt: number;
  view: ViewSize;
  /** 캐릭터(월드 px) */
  target: Point;
  /** 설치물 모드면 담아야 할 사각형, 지나가기면 null */
  frame: WorldRect | null;
  /**
   * 있으면 frame은 긴 줄의 한 부분(박 하나)이다(followPose). 카메라는 설치물에 들어오는 0.3초가 지난 뒤에도 부분이 바뀌면
   * 새 부분으로 부드럽게 따라가고(BEAT_FOLLOW_SECONDS), 움직임 줄이기에서는 바로 옮긴다
   */
  focus?: Point;
  /** focus와 함께 보이면 좋은 두 번째 점(followPose의 alsoShow): 바퀴가 쓴다 */
  alsoShow?: Point;
  /** 화면 아래를 조작 막대가 가리는 높이(화면 px) */
  bottomInset: number;
  /** 화면 위쪽을 메뉴 단추가 가리는 높이(화면 px). focus가 있을 때(긴 줄의 한 부분)만 쓴다 */
  topInset?: number;
  /** 설치물 둘레의 여유(월드 px). 없으면 기본값(FRAME_PAD) */
  pad?: number;
  /** 이 배율보다 멀어지지 않는다(framePose의 minZoom) */
  minZoom?: number;
  /** minZoom을 너비 한도로 깎지 않는다(followPose의 strictMinZoom). 바퀴가 쓴다 */
  strictMinZoom?: boolean;
  /** 바로 이동, 처음 시작, 저장 복원: 보간 없이 바로 따라온다 */
  snap: boolean;
  /** 움직임 줄이기: 설치물 모드의 오가는 움직임도 보간 없이 바로 한다(7.3, 9.7) */
  reduce: boolean;
}

/**
 * 카메라 한 대의 상태. 지나가기에서는 캐릭터를 따라가고(followStep),
 * 설치물 모드로 들어가면 0.3초 동안 설치물 전체를 담는 자세로 옮겨 간 뒤 그 자세를 지키고,
 * 나오면 0.3초 동안 캐릭터가 가운데에 오는 기본 자세로 돌아온 뒤 다시 따라간다.
 */
export class CameraRig {
  private cur: CameraPose;
  private blend: { from: CameraPose; elapsed: number } | null = null;
  private framed = false;

  constructor(initial: CameraPose) {
    this.cur = { center: { ...initial.center }, zoom: initial.zoom };
  }

  get pose(): CameraPose {
    return this.cur;
  }

  /** 0.3초 전환이 진행 중인가 */
  get transitioning(): boolean {
    return this.blend !== null;
  }

  /** 지금 설치물을 담는 쪽인가(전환이 끝나지 않았어도 목표가 설치물이면 true) */
  get framing(): boolean {
    return this.framed;
  }

  step(i: RigStep): CameraPose {
    const wantFrame = i.frame !== null;
    if (wantFrame !== this.framed) {
      this.framed = wantFrame;
      this.blend = i.reduce || i.snap ? null : { from: this.cur, elapsed: 0 };
    }
    if (wantFrame) {
      const opts: FrameOptions = {
        bottomInset: i.bottomInset,
        ...(i.pad !== undefined ? { pad: i.pad } : {}),
        ...(i.minZoom !== undefined ? { minZoom: i.minZoom } : {}),
        ...(i.strictMinZoom ? { strictMinZoom: true } : {}),
      };
      const goal = i.focus
        ? followPose(i.frame!, i.focus, i.view, { ...opts, ...(i.topInset !== undefined ? { topInset: i.topInset } : {}), ...(i.alsoShow ? { alsoShow: i.alsoShow } : {}) })
        : framePose(i.frame!, i.view, opts);
      // 박을 따라가는 중이면: 들어오는 0.3초가 지난 뒤에는 목표(박)가 바뀔 때마다 지수 보간으로 다가간다. 움직임 줄이기와 바로 이동은 보간이 없다
      this.cur = this.blend ? this.advance(goal, i.dt) : i.focus && !i.reduce && !i.snap ? this.chase(goal, i.dt) : goal;
    } else if (i.snap) {
      this.blend = null;
      this.cur = { center: snapCenter(i.target, i.view), zoom: cameraZoom(i.view) };
    } else if (this.blend) {
      this.cur = this.advance({ center: snapCenter(i.target, i.view), zoom: cameraZoom(i.view) }, i.dt);
    } else if (i.reduce) {
      this.cur = { center: snapCenter(i.target, i.view), zoom: cameraZoom(i.view) };
    } else {
      // 설치물에서 막 나온 뒤나 창 크기가 바뀐 뒤에도 배율은 화면에 맞는 기본값이다
      this.cur = { center: followStep(this.cur.center, i.target, i.dt, i.view), zoom: cameraZoom(i.view) };
    }
    return this.cur;
  }

  /** 현재 자세에서 목표로 시간 기준의 지수 보간 한 걸음. 거의 다 왔으면(반 픽셀 안) 목표에 붙는다 */
  private chase(goal: CameraPose, dt: number): CameraPose {
    const cur = this.cur;
    const dx = goal.center.x - cur.center.x;
    const dy = goal.center.y - cur.center.y;
    const dz = goal.zoom - cur.zoom;
    if (Math.hypot(dx, dy) < 0.5 && Math.abs(dz) < 0.001) return goal;
    const a = 1 - Math.pow(0.05, Math.max(0, dt) / BEAT_FOLLOW_SECONDS);
    return { center: { x: cur.center.x + dx * a, y: cur.center.y + dy * a }, zoom: cur.zoom + dz * a };
  }

  private advance(goal: CameraPose, dt: number): CameraPose {
    const b = this.blend;
    if (!b) return goal;
    b.elapsed += Math.max(0, dt);
    const t = Math.min(1, b.elapsed / FRAME_SECONDS);
    if (t >= 1) this.blend = null;
    return blendPose(b.from, goal, t);
  }
}
