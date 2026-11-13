// 3-1 카메라 배율과 따라가기. 7.1 표의 값은 설계서에서 손으로 옮겨 적었다.
import { describe, expect, it } from 'vitest';
import { BEAT_FOLLOW_SECONDS, CameraRig, DEADZONE_SCREEN, FOLLOW_LERP, FRAME_PAD, FRAME_SECONDS, MENU_BAND, SHOW_MARGIN, blendPose, cameraZoom, clampCenter, clampFrameCenter, easeInOut, followPose, followStep, framePose, snapCenter, visibleWorld } from '../../src/world/camera';
import type { RigStep } from '../../src/world/camera';

// 7.1: 화면, 배율(소수 둘째 자리), 보이는 월드 범위
const SCREENS: ReadonlyArray<[string, number, number, number, number, number]> = [
  ['PC 1600×1000', 1600, 1000, 1.39, 1152, 720],
  ['노트북 1366×768', 1366, 768, 1.07, 1281, 720],
  ['태블릿 1280×800', 1280, 800, 1.11, 1152, 720],
  ['태블릿 1180×820', 1180, 820, 1.14, 1036, 720],
  ['휴대폰 세로 430×932', 430, 932, 0.8, 540, 1170],
];

describe('7.1 화면 배율', () => {
  it.each(SCREENS)('%s: 배율 %f, 보이는 범위 %i×%i', (_name, w, h, zoom, visW, visH) => {
    expect(cameraZoom({ width: w, height: h })).toBeCloseTo(zoom, 2);
    const v = visibleWorld({ width: w, height: h });
    expect(Math.round(v.width)).toBe(visW);
    expect(Math.round(v.height)).toBe(visH);
  });

  it('가로 화면은 세로가 정확히 720, 세로 화면은 가로가 정확히 540이다', () => {
    for (const [, w, h] of SCREENS) {
      const v = visibleWorld({ width: w, height: h });
      if (w >= h) expect(v.height).toBeCloseTo(720, 9);
      else expect(v.width).toBeCloseTo(540, 9);
    }
  });

  it('캐릭터(48×72)는 화면에서 폭 38–67 px, 디딤돌(폭 81)은 휴대폰에서도 48 px 이상이다', () => {
    const widths = SCREENS.map(([, w, h]) => 48 * cameraZoom({ width: w, height: h }));
    expect(Math.round(Math.min(...widths))).toBe(38);
    expect(Math.round(Math.max(...widths))).toBe(67);
    expect(81 * cameraZoom({ width: 430, height: 932 })).toBeGreaterThanOrEqual(48);
  });

  it('정사각형 화면은 가로 화면으로 센다', () => {
    expect(cameraZoom({ width: 800, height: 800 })).toBeCloseTo(800 / 720, 9);
  });

  it('크기가 0이면 배율 1', () => {
    expect(cameraZoom({ width: 0, height: 0 })).toBe(1);
  });
});

describe('7.3 카메라: 경계', () => {
  const view = { width: 1600, height: 1000 }; // 보이는 범위 1152×720
  it('월드 밖을 비추지 않는다', () => {
    expect(clampCenter({ x: 0, y: 0 }, view)).toEqual({ x: 576, y: 360 });
    expect(clampCenter({ x: 9000, y: 9000 }, view).x).toBeCloseTo(8192 - 576, 9);
    expect(clampCenter({ x: 9000, y: 9000 }, view).y).toBeCloseTo(6144 - 360, 9);
    expect(clampCenter({ x: 4000, y: 3000 }, view)).toEqual({ x: 4000, y: 3000 });
  });
  it('보이는 범위가 월드보다 큰 축은 월드 가운데에 둔다', () => {
    const tiny = { width: 400, height: 300 };
    const world = { width: 500, height: 300 }; // 배율 300/720, 보이는 범위 960×720
    expect(clampCenter({ x: 0, y: 0 }, tiny, world)).toEqual({ x: 250, y: 150 });
  });
});

describe('7.3 카메라: 따라가기', () => {
  const view = { width: 1600, height: 1000 };
  const zoom = cameraZoom(view);
  const dzHalfW = DEADZONE_SCREEN.width / zoom / 2;
  const dzHalfH = DEADZONE_SCREEN.height / zoom / 2;

  it('데드존은 160×120 화면 px이다', () => {
    expect(DEADZONE_SCREEN).toEqual({ width: 160, height: 120 });
    expect(dzHalfW * 2 * zoom).toBeCloseTo(160, 9);
    expect(dzHalfH * 2 * zoom).toBeCloseTo(120, 9);
  });

  it('화면 가운데 160×120 안에서 움직이면 카메라는 멈춰 있다', () => {
    const c = { x: 4000, y: 3000 };
    for (const t of [{ x: 4000, y: 3000 }, { x: 4000 + dzHalfW - 0.5, y: 3000 }, { x: 4000 - dzHalfW + 0.5, y: 3000 + dzHalfH - 0.5 }]) {
      expect(followStep(c, t, 1 / 60, view)).toEqual(c);
    }
  });

  it('데드존 밖으로 나가면 따라가고, 오래 지나면 목표가 데드존 가장자리에 걸친다', () => {
    let c = { x: 4000, y: 3000 };
    const t = { x: 4600, y: 3000 };
    const first = followStep(c, t, 1 / 60, view);
    expect(first.x).toBeGreaterThan(c.x);
    expect(first.y).toBe(3000);
    for (let i = 0; i < 600; i++) c = followStep(c, t, 1 / 60, view);
    expect(c.x).toBeCloseTo(t.x - dzHalfW, 3);
    expect(c.y).toBeCloseTo(3000, 9);
  });

  it('한 프레임에 목표까지 남은 거리의 12%를 따라간다(60프레임 기준)', () => {
    expect(FOLLOW_LERP).toBe(0.12);
    const c = { x: 4000, y: 3000 };
    const t = { x: 4000 + dzHalfW + 1000, y: 3000 };
    const next = followStep(c, t, 1 / 60, view);
    expect(next.x - c.x).toBeCloseTo(0.12 * 1000, 6);
  });

  it('프레임이 떨어져도 1초 뒤 위치가 거의 같다(보간이 시간 기준)', () => {
    const t = { x: 6000, y: 3000 };
    const run = (fps: number): number => {
      let c = { x: 4000, y: 3000 };
      for (let i = 0; i < fps; i++) c = followStep(c, t, 1 / fps, view);
      return c.x;
    };
    expect(run(30)).toBeCloseTo(run(60), 6);
    expect(run(20)).toBeCloseTo(run(144), 6);
  });

  it('월드 가장자리에서는 목표가 가장자리여도 월드 밖을 비추지 않는다', () => {
    let c = { x: 700, y: 400 };
    const t = { x: 10, y: 10 };
    for (let i = 0; i < 600; i++) c = followStep(c, t, 1 / 60, view);
    expect(c.x).toBeCloseTo(576, 6);
    expect(c.y).toBeCloseTo(360, 6);
  });

  it('바로 옮기기는 목표를 가운데에 둔다(가장자리는 가둔다)', () => {
    expect(snapCenter({ x: 3984, y: 3480 }, view)).toEqual({ x: 3984, y: 3480 });
    expect(snapCenter({ x: 5, y: 5 }, view)).toEqual({ x: 576, y: 360 });
  });

  it('시간이 0이거나 음수면 움직이지 않는다', () => {
    const c = { x: 4000, y: 3000 };
    expect(followStep(c, { x: 6000, y: 3000 }, 0, view)).toEqual(c);
    expect(followStep(c, { x: 6000, y: 3000 }, -1, view)).toEqual(c);
  });

  it('세로 화면에서는 데드존이 월드 px로 더 넓다(배율 0.8)', () => {
    const portrait = { width: 430, height: 932 };
    const z = cameraZoom(portrait);
    const c = { x: 4000, y: 3000 };
    const inside = { x: 4000 + 160 / z / 2 - 1, y: 3000 };
    expect(followStep(c, inside, 1 / 60, portrait)).toEqual(c);
    const outside = { x: 4000 + 160 / z / 2 + 50, y: 3000 };
    expect(followStep(c, outside, 1 / 60, portrait).x).toBeGreaterThan(4000);
  });
});

// ───── 4.2 설치물 모드의 카메라 ─────
describe('4.2 설치물 모드의 카메라: 설치물 전체를 조작 막대 위에 담는다', () => {
  const stones = { x: 4575, y: 3579, w: 774, h: 153 };
  const centerOf = { x: stones.x + stones.w / 2, y: stones.y + stones.h / 2 };
  const screenY = (worldY: number, pose: { center: { y: number }; zoom: number }, viewH: number): number => viewH / 2 + (worldY - pose.center.y) * pose.zoom;
  const screenX = (worldX: number, pose: { center: { x: number }; zoom: number }, viewW: number): number => viewW / 2 + (worldX - pose.center.x) * pose.zoom;

  it('넓은 가로 화면: 기본 배율로 이미 다 들어오면 배율은 그대로이고, 설치물 가운데가 화면 가운데에 온다', () => {
    const view = { width: 1280, height: 720 };
    const pose = framePose(stones, view, {});
    expect(pose.zoom).toBeCloseTo(cameraZoom(view), 9);
    expect(pose.center.x).toBeCloseTo(centerOf.x, 6);
    expect(pose.center.y).toBeCloseTo(centerOf.y, 6);
  });

  it('조작 막대가 아래를 가리면 설치물이 막대 위쪽 자리의 가운데에 놓이게 중심을 아래로 옮긴다', () => {
    const view = { width: 1280, height: 720 };
    const inset = 250;
    const pose = framePose(stones, view, { bottomInset: inset });
    // 막대 위쪽 자리는 화면 위에서 (720 − 250) px: 그 가운데는 235
    expect(screenY(centerOf.y, pose, 720)).toBeCloseTo((720 - inset) / 2, 6);
  });

  it('좁은 세로 화면: 기본 배율로는 넘치니 필요한 만큼만 멀어져서 돌 여덟 개가 모두 화면 안에 들어온다', () => {
    const view = { width: 390, height: 844 };
    const pose = framePose(stones, view, { bottomInset: 300 });
    expect(pose.zoom).toBeLessThan(cameraZoom(view));
    expect(pose.zoom).toBeCloseTo(390 / (stones.w + 2 * FRAME_PAD), 9);
    expect(screenX(stones.x, pose, 390)).toBeGreaterThanOrEqual(0);
    expect(screenX(stones.x + stones.w, pose, 390)).toBeLessThanOrEqual(390);
    // 세로로도 막대 위쪽 자리에 들어온다
    expect(screenY(stones.y, pose, 844)).toBeGreaterThanOrEqual(0);
    expect(screenY(stones.y + stones.h, pose, 844)).toBeLessThanOrEqual(844 - 300);
  });


  it('둘레의 여유(pad)를 줄이면 더 가까이 담는다(화면의 기본 배율까지)', () => {
    const stage = { x: 3799, y: 2871, w: 416, h: 180 };
    const view = { width: 400, height: 844 };
    const roomy = framePose(stage, view, { bottomInset: 300 });
    const tight = framePose(stage, view, { bottomInset: 300, pad: 20 });
    expect(roomy.zoom).toBeCloseTo(400 / (stage.w + 2 * FRAME_PAD), 9);
    expect(tight.zoom).toBeGreaterThan(roomy.zoom);
    expect(tight.zoom).toBeLessThanOrEqual(cameraZoom(view) + 1e-9);
  });

  it('최소 배율(minZoom): 좁은 휴대폰 화면에서도 무대 칸(높이 64)이 화면에서 48px 아래로 줄지 않고, 사각형은 화면 안에 다 들어온다', () => {
    const stage = { x: 3799, y: 2871, w: 416, h: 180 };
    for (const width of [320, 360, 390, 430]) {
      const view = { width, height: 844 };
      const pose = framePose(stage, view, { bottomInset: 300, pad: 20, minZoom: 0.75 });
      expect(pose.zoom, `${width}px`).toBeGreaterThanOrEqual(Math.min(0.75, width / stage.w) - 1e-9);
      expect(screenX(stage.x, pose, width)).toBeGreaterThanOrEqual(-1e-6);
      expect(screenX(stage.x + stage.w, pose, width)).toBeLessThanOrEqual(width + 1e-6);
      if (width >= 360) expect(64 * pose.zoom).toBeGreaterThanOrEqual(48 - 1e-9);
    }
  });

  it('최소 배율은 사각형이 넘치는 한도를 넘지 않는다: 아주 낮은 자리에서는 사각형이 딱 들어가는 배율까지만 올린다', () => {
    const stage = { x: 3799, y: 2871, w: 416, h: 180 };
    const view = { width: 844, height: 390 };
    const pose = framePose(stage, view, { bottomInset: 273, pad: 20, minZoom: 0.75 });
    expect(pose.zoom).toBeCloseTo((390 - 273) / stage.h, 9);
    expect(pose.zoom).toBeLessThan(0.75);
  });

  it('최소 배율보다 이미 가까우면 그대로다', () => {
    const stage = { x: 3799, y: 2871, w: 416, h: 180 };
    const view = { width: 1280, height: 720 };
    expect(framePose(stage, view, { bottomInset: 200, pad: 20, minZoom: 0.75 })).toEqual(framePose(stage, view, { bottomInset: 200, pad: 20 }));
  });

  it('낮은 가로 화면(휴대폰 가로 800×360)에서 막대가 절반 가까이 가려도 돌이 모두 막대 위에 보인다', () => {
    const view = { width: 800, height: 360 };
    const inset = 190;
    const pose = framePose(stones, view, { bottomInset: inset });
    expect(screenX(stones.x, pose, 800)).toBeGreaterThanOrEqual(0);
    expect(screenX(stones.x + stones.w, pose, 800)).toBeLessThanOrEqual(800);
    expect(screenY(stones.y, pose, 360)).toBeGreaterThanOrEqual(0);
    expect(screenY(stones.y + stones.h, pose, 360)).toBeLessThanOrEqual(360 - inset);
  });

  it('막대가 화면의 대부분을 가리는 극단에서도 높이의 70%까지만 가린 것으로 친다', () => {
    const view = { width: 1280, height: 720 };
    const a = framePose(stones, view, { bottomInset: 10_000 });
    const b = framePose(stones, view, { bottomInset: 720 * 0.7 });
    expect(a).toEqual(b);
    expect(framePose(stones, view, { bottomInset: -50 })).toEqual(framePose(stones, view, {}));
  });

  it('월드 가장자리의 설치물도 월드 밖을 비추지 않는다', () => {
    const view = { width: 1280, height: 720 };
    const corner = { x: 0, y: 0, w: 200, h: 100 };
    const pose = framePose(corner, view, { bottomInset: 200 });
    const vis = visibleWorld(view, pose.zoom);
    expect(pose.center.x - vis.width / 2).toBeGreaterThanOrEqual(-1e-9);
    expect(pose.center.y - vis.height / 2).toBeGreaterThanOrEqual(-1e-9);
  });

  it('easeInOut은 0에서 1까지 부드럽고 범위를 벗어난 값은 가둔다', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(9)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOut(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('blendPose는 두 자세 사이를 곡선으로 섞는다', () => {
    const from = { center: { x: 0, y: 0 }, zoom: 1 };
    const to = { center: { x: 100, y: 200 }, zoom: 0.5 };
    expect(blendPose(from, to, 0)).toEqual(from);
    expect(blendPose(from, to, 1)).toEqual(to);
    const mid = blendPose(from, to, 0.5);
    expect(mid.center.x).toBeCloseTo(50, 9);
    expect(mid.center.y).toBeCloseTo(100, 9);
    expect(mid.zoom).toBeCloseTo(0.75, 9);
  });
});

describe('4.2 CameraRig: 0.3초 만에 설치물을 담고, 나오면 0.3초 만에 돌아온다', () => {
  const view = { width: 1280, height: 720 };
  const stones = { x: 4575, y: 3579, w: 774, h: 153 };
  const player = { x: 3984, y: 3480 };
  const base = (): RigStep => ({ dt: 1 / 60, view, target: player, frame: null, bottomInset: 0, snap: false, reduce: false });
  const fresh = (): CameraRig => new CameraRig({ center: snapCenter(player, view), zoom: cameraZoom(view) });
  /** 같은 입력으로 시간을 흘린다 */
  const run = (rig: CameraRig, seconds: number, input: Partial<RigStep>, dt = 1 / 60): void => {
    for (let t = 0; t < seconds - 1e-9; t += dt) rig.step({ ...base(), ...input, dt });
  };

  it('설치물 둘레의 조정값(pad, minZoom)이 주어지면 그 값으로 담는다. 없으면 기본이다', () => {
    const portrait = { width: 390, height: 844 };
    const small = { x: 3799, y: 2871, w: 416, h: 180 };
    const start = { center: snapCenter(player, portrait), zoom: cameraZoom(portrait) };
    const tuned = new CameraRig(start);
    const plain = new CameraRig(start);
    for (let t = 0; t < 1; t += 1 / 60) {
      tuned.step({ ...base(), view: portrait, frame: small, bottomInset: 300, pad: 20, minZoom: 0.75, dt: 1 / 60 });
      plain.step({ ...base(), view: portrait, frame: small, bottomInset: 300, dt: 1 / 60 });
    }
    expect(tuned.pose.zoom).toBeCloseTo(framePose(small, portrait, { bottomInset: 300, pad: 20, minZoom: 0.75 }).zoom, 9);
    expect(plain.pose.zoom).toBeCloseTo(framePose(small, portrait, { bottomInset: 300 }).zoom, 9);
    expect(tuned.pose.zoom).toBeGreaterThan(plain.pose.zoom);
  });

  it('지나가기에서는 캐릭터를 따라간다: 가운데에 있으면 그대로다', () => {
    const rig = fresh();
    const before = rig.pose;
    rig.step(base());
    expect(rig.pose.center).toEqual(before.center);
    expect(rig.pose.zoom).toBeCloseTo(cameraZoom(view), 9);
    expect(rig.framing).toBe(false);
    expect(rig.transitioning).toBe(false);
  });

  it('들어가면 0.3초 동안 옮겨 가고, 끝나면 설치물을 담는 자세에 멈춘다', () => {
    const rig = fresh();
    const goal = framePose(stones, view, { bottomInset: 200 });
    const input = { frame: stones, bottomInset: 200 };
    rig.step({ ...base(), ...input });
    expect(rig.framing).toBe(true);
    expect(rig.transitioning).toBe(true);
    // 중간: 시작도 끝도 아니다
    run(rig, FRAME_SECONDS / 2 - 1 / 60, input);
    expect(rig.transitioning).toBe(true);
    const mid = rig.pose;
    expect(mid.center.x).toBeGreaterThan(player.x);
    expect(mid.center.x).toBeLessThan(goal.center.x);
    // 끝
    run(rig, FRAME_SECONDS, input);
    expect(rig.transitioning).toBe(false);
    expect(rig.pose.center.x).toBeCloseTo(goal.center.x, 6);
    expect(rig.pose.center.y).toBeCloseTo(goal.center.y, 6);
    expect(rig.pose.zoom).toBeCloseTo(goal.zoom, 9);
    // 이후에는 자세를 지킨다
    run(rig, 1, input);
    expect(rig.pose.center.x).toBeCloseTo(goal.center.x, 6);
  });

  it('프레임이 느려도(30fps, 10fps) 걸리는 시간은 같다: 0.3초가 지나면 도착해 있다', () => {
    for (const dt of [1 / 30, 1 / 10]) {
      const rig = fresh();
      const goal = framePose(stones, view, { bottomInset: 200 });
      run(rig, FRAME_SECONDS + dt, { frame: stones, bottomInset: 200 }, dt);
      expect(rig.transitioning, `dt ${dt}`).toBe(false);
      expect(rig.pose.center.x).toBeCloseTo(goal.center.x, 6);
    }
  });

  it('나오면 0.3초 동안 캐릭터가 가운데에 오는 기본 자세로 돌아온 뒤 다시 따라간다', () => {
    const rig = fresh();
    run(rig, 0.5, { frame: stones, bottomInset: 200 });
    expect(rig.framing).toBe(true);
    rig.step({ ...base() });
    expect(rig.framing).toBe(false);
    expect(rig.transitioning).toBe(true);
    run(rig, FRAME_SECONDS + 0.05, {});
    expect(rig.transitioning).toBe(false);
    expect(rig.pose.zoom).toBeCloseTo(cameraZoom(view), 9);
    expect(rig.pose.center.x).toBeCloseTo(snapCenter(player, view).x, 6);
    expect(rig.pose.center.y).toBeCloseTo(snapCenter(player, view).y, 6);
  });

  it('움직임 줄이기: 보간 없이 첫 걸음에 바로 도착한다(들어갈 때와 나올 때 모두)', () => {
    const rig = fresh();
    const goal = framePose(stones, view, { bottomInset: 200 });
    rig.step({ ...base(), frame: stones, bottomInset: 200, reduce: true });
    expect(rig.transitioning).toBe(false);
    expect(rig.pose.center.x).toBeCloseTo(goal.center.x, 9);
    rig.step({ ...base(), reduce: true });
    expect(rig.transitioning).toBe(false);
    expect(rig.pose.center.x).toBeCloseTo(snapCenter(player, view).x, 9);
    expect(rig.pose.zoom).toBeCloseTo(cameraZoom(view), 9);
  });

  it('바로 이동(snap)으로 나올 때도 보간 없이 캐릭터에게 돌아온다', () => {
    const rig = fresh();
    run(rig, 0.5, { frame: stones, bottomInset: 200 });
    const far = { x: 1000, y: 1000 };
    rig.step({ ...base(), target: far, snap: true });
    expect(rig.transitioning).toBe(false);
    expect(rig.pose.center).toEqual(snapCenter(far, view));
  });

  it('창 크기가 바뀌어도(회전) 설치물 모드의 자세는 새 크기로 다시 맞춘다', () => {
    const rig = fresh();
    run(rig, 0.5, { frame: stones, bottomInset: 200 });
    const portrait = { width: 390, height: 844 };
    run(rig, 0.5, { frame: stones, bottomInset: 300, view: portrait });
    const goal = framePose(stones, portrait, { bottomInset: 300 });
    expect(rig.pose.zoom).toBeCloseTo(goal.zoom, 9);
    expect(rig.pose.zoom).toBeLessThan(cameraZoom(portrait));
  });
});

// ---------------------------------------------------------------------------
// 6-5 박을 따라가는 카메라(확대형 줄): 줄은 한 마디가 1920 px라 화면에 다 담지 않고 박 하나(480 px)를 담는다

describe('6-5 followPose: 긴 줄의 한 부분(박 하나)을 담는다', () => {
  // E3 줄의 첫 박: x 6656−44(박 번호 띠) … 6752+32(뗏목 표시 띠), y 700 … 1180
  const beat0 = { x: 6612, y: 700, w: 172, h: 480 };
  const beat3 = { x: 6612, y: 700 + 3 * 480, w: 172, h: 480 };
  const tuning = { pad: 24, minZoom: 0.8 };
  const focusIn = (r: typeof beat0, f = 0.5) => ({ x: r.x + r.w / 2, y: r.y + r.h * f });

  it('박이 보이는 범위에 다 들어오면 framePose와 같다: 박의 가운데를 비추고, 조작 막대가 가리는 만큼 중심이 아래로 간다', () => {
    const view = { width: 1280, height: 720 };
    const opts = { ...tuning, bottomInset: 160 };
    const f = followPose(beat0, focusIn(beat0), view, opts);
    expect(f).toEqual(framePose(beat0, view, opts));
    expect(f.zoom).toBe(1);
    // 담는 구간(여유 24 포함)의 가운데 x 6698, y 940 + 막대 절반(80)
    expect(f.center.x).toBeCloseTo(6698, 6);
    expect(f.center.y).toBeCloseTo(940 + 80, 6);
  });

  it('화면이 낮아 박이 다 들어오지 않아도 칸은 작아지지 않는다(최소 배율 0.8): 대신 고른 칸이 보이는 부분만 비춘다', () => {
    const view = { width: 800, height: 360 };
    const top = followPose(beat0, focusIn(beat0, 0), view, tuning);
    const bottom = followPose(beat0, focusIn(beat0, 1), view, tuning);
    expect(top.zoom).toBeCloseTo(0.8, 9);
    expect(bottom.zoom).toBeCloseTo(0.8, 9);
    // 칸(60 px)이 화면에서 48 px 이상이다
    expect(60 * top.zoom).toBeGreaterThanOrEqual(48);
    const visH = view.height / 0.8;
    // 보이는 세로는 박(여유 포함 528 px)보다 짧다
    expect(visH).toBeLessThan(480 + 48);
    // 첫 칸을 고르면 박의 위쪽을, 마지막 칸을 고르면 아래쪽을 비춘다. 보이는 범위가 담는 구간을 벗어나지 않는다
    expect(top.center.y).toBeLessThan(bottom.center.y);
    expect(top.center.y - visH / 2).toBeCloseTo(700 - 24, 6);
    expect(bottom.center.y + visH / 2).toBeCloseTo(1180 + 24, 6);
    // 고른 칸은 늘 화면 안에 있다
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = followPose(beat0, focusIn(beat0, f), view, tuning);
      expect(Math.abs(focusIn(beat0, f).y - pose.center.y)).toBeLessThanOrEqual(visH / 2 + 1e-6);
    }
  });

  it('좁은 휴대폰 세로 화면(430×932, 막대 340 px)에서도 박 하나가 막대 위에 다 보이고 칸은 48 px 이상이다', () => {
    const view = { width: 430, height: 932 };
    const f = followPose(beat3, focusIn(beat3, 0.9), view, { ...tuning, bottomInset: 340 });
    expect(f.zoom).toBeCloseTo(0.8, 9);
    expect(60 * f.zoom).toBeGreaterThanOrEqual(48);
    const visW = view.width / f.zoom;
    const visH = (view.height - 340) / f.zoom;
    expect(visW).toBeGreaterThanOrEqual(beat3.w);
    expect(visH).toBeGreaterThanOrEqual(beat3.h);
  });

  it('최소 배율은 줄의 두께(너비)가 화면 너비에 다 들어오는 한도 안에서만 올린다', () => {
    const narrow = { width: 120, height: 900 };
    const f = followPose(beat0, focusIn(beat0), narrow, tuning);
    expect(f.zoom).toBeLessThanOrEqual(narrow.width / beat0.w + 1e-9);
  });

  it('월드 가장자리를 벗어나게 비추지 않는다', () => {
    const view = { width: 1280, height: 720 };
    const edge = { x: 100, y: 100, w: 172, h: 480 };
    const f = followPose(edge, focusIn(edge), view, tuning);
    const vis = visibleWorld(view, f.zoom);
    expect(f.center.x - vis.width / 2).toBeGreaterThanOrEqual(-1e-6);
    expect(f.center.y - vis.height / 2).toBeGreaterThanOrEqual(-1e-6);
  });

  describe('위쪽 메뉴 띠(MENU_BAND): 줄의 첫 칸이 메뉴 단추 뒤로 가려지지 않는다', () => {
    /** 월드 y를 화면 y로: 카메라 자세에서 */
    const screenY = (pose: { center: { y: number }; zoom: number }, view: { height: number }, wy: number): number => (wy - (pose.center.y - view.height / 2 / pose.zoom)) * pose.zoom;
    /** 줄의 n번째 칸(0부터)의 가운데. 한 칸 60 px */
    const cellCenter = (n: number) => ({ x: beat0.x + beat0.w / 2, y: beat0.y + 30 + n * 60 });

    it('메뉴 띠는 64 px이다(오른쪽 위 메뉴 단추: 위에서 12 px, 높이 48 px, 그림자 4 px)', () => {
      expect(MENU_BAND).toBe(64);
      expect(MENU_BAND).toBe(12 + 48 + 4);
    });

    it('띠가 없으면(0) 이전과 같다', () => {
      const view = { width: 1280, height: 720 };
      const opts = { ...tuning, bottomInset: 441 };
      expect(followPose(beat0, cellCenter(3), view, { ...opts, topInset: 0 })).toEqual(followPose(beat0, cellCenter(3), view, opts));
    });

    it('박이 다 들어오는 큰 화면(1920×1080, 막대 441)에서는 박과 여유가 띠 아래부터 막대 위까지를 꽉 채운다', () => {
      const view = { width: 1920, height: 1080 };
      const f = followPose(beat0, cellCenter(3), view, { ...tuning, bottomInset: 441, topInset: MENU_BAND });
      // 배율은 (화면 − 막대 − 띠) / (박 + 여유 2×24)다
      expect(f.zoom).toBeCloseTo((1080 - 441 - MENU_BAND) / 528, 9);
      expect(screenY(f, view, 700 - 24)).toBeCloseTo(MENU_BAND, 6);
      expect(screenY(f, view, 1180 + 24)).toBeCloseTo(1080 - 441, 6);
    });

    it('작은 화면(1280×720, 막대 441)에서는 칸이 48 px 아래로 줄지 않고, 박의 어느 칸을 골라도 그 칸이 띠 아래 막대 위에 온전히 보인다', () => {
      const view = { width: 1280, height: 720 };
      for (let n = 0; n < 8; n++) {
        const f = followPose(beat0, cellCenter(n), view, { ...tuning, bottomInset: 441, topInset: MENU_BAND });
        expect(f.zoom).toBeCloseTo(0.8, 9);
        expect(60 * f.zoom).toBeGreaterThanOrEqual(48);
        const c = cellCenter(n).y;
        expect(screenY(f, view, c - 30), `${n + 1}번째 칸 위`).toBeGreaterThanOrEqual(MENU_BAND - 1e-6);
        expect(screenY(f, view, c + 30), `${n + 1}번째 칸 아래`).toBeLessThanOrEqual(720 - 441 + 1e-6);
        // 보이는 범위(띠 아래부터 막대 윗선까지)는 박과 여유를 벗어나지 않는다: 이웃한 박이 비치지 않는다
        expect(screenY(f, view, 700 - 24), `${n + 1}번째 칸일 때 박 위쪽 여유 선`).toBeLessThanOrEqual(MENU_BAND + 1e-6);
        expect(screenY(f, view, 1180 + 24), `${n + 1}번째 칸일 때 박 아래쪽 여유 선`).toBeGreaterThanOrEqual(720 - 441 - 1e-6);
      }
      // 첫 칸을 고르면 박 위쪽 여유(24 px)가 띠 바로 아래에 온다
      const first = followPose(beat0, cellCenter(0), view, { ...tuning, bottomInset: 441, topInset: MENU_BAND });
      expect(screenY(first, view, 700 - 24)).toBeCloseTo(MENU_BAND, 6);
      // 마지막 칸을 고르면 박 아래쪽 여유가 막대 윗선에 온다
      const last = followPose(beat0, cellCenter(7), view, { ...tuning, bottomInset: 441, topInset: MENU_BAND });
      expect(screenY(last, view, 1180 + 24)).toBeCloseTo(720 - 441, 6);
    });

    it('세로 화면(430×932, 막대 646)에서도 같다', () => {
      const view = { width: 430, height: 932 };
      for (let n = 0; n < 8; n++) {
        const f = followPose(beat0, cellCenter(n), view, { ...tuning, bottomInset: 646, topInset: MENU_BAND });
        expect(f.zoom).toBeCloseTo(0.8, 9);
        const c = cellCenter(n).y;
        expect(screenY(f, view, c - 30)).toBeGreaterThanOrEqual(MENU_BAND - 1e-6);
        expect(screenY(f, view, c + 30)).toBeLessThanOrEqual(932 - 646 + 1e-6);
      }
    });

    it('띠와 막대가 화면을 다 먹는 극단에서도 화면의 1할은 남긴다', () => {
      const view = { width: 800, height: 300 };
      const f = followPose(beat0, cellCenter(0), view, { ...tuning, bottomInset: 900, topInset: 900 });
      expect(Number.isFinite(f.zoom)).toBe(true);
      expect(Number.isFinite(f.center.y)).toBe(true);
      expect(f.zoom).toBeGreaterThan(0);
    });
  });
});

describe('6-5 CameraRig: 박이 바뀌면 부드럽게 따라간다', () => {
  const view = { width: 1280, height: 720 };
  const player = { x: 6560, y: 1660 };
  const beat = (n: number) => ({ x: 6612, y: 700 + n * 480, w: 172, h: 480 });
  const focusOf = (n: number) => ({ x: 6704, y: 700 + n * 480 + 30 });
  const base = (): RigStep => ({ dt: 1 / 60, view, target: player, frame: beat(0), focus: focusOf(0), bottomInset: 160, pad: 24, minZoom: 0.8, snap: false, reduce: false });
  const fresh = (): CameraRig => new CameraRig({ center: snapCenter(player, view), zoom: cameraZoom(view) });
  const run = (rig: CameraRig, seconds: number, input: Partial<RigStep>, dt = 1 / 60): void => {
    for (let t = 0; t < seconds - 1e-9; t += dt) rig.step({ ...base(), ...input, dt });
  };
  const goalOf = (n: number) => followPose(beat(n), focusOf(n), view, { bottomInset: 160, pad: 24, minZoom: 0.8 });

  it('들어오는 0.3초 동안은 전환이고, 끝나면 첫 박을 담는 자세에 멈춘다. 따라가기 시간은 0.3초다', () => {
    expect(BEAT_FOLLOW_SECONDS).toBe(0.3);
    expect(BEAT_FOLLOW_SECONDS).toBe(FRAME_SECONDS);
    const rig = fresh();
    run(rig, 0.5, {});
    expect(rig.transitioning).toBe(false);
    expect(rig.framing).toBe(true);
    const goal = goalOf(0);
    expect(rig.pose.center.x).toBeCloseTo(goal.center.x, 6);
    expect(rig.pose.center.y).toBeCloseTo(goal.center.y, 6);
    expect(rig.pose.zoom).toBeCloseTo(goal.zoom, 9);
  });

  it('박이 바뀌면 한 걸음에 건너뛰지 않고 새 박으로 다가간다: 한 프레임 뒤에는 중간이고, 0.3초 뒤에는 95% 이상, 1초 뒤에는 도착한다', () => {
    const rig = fresh();
    run(rig, 0.5, {});
    const from = rig.pose.center.y;
    const to = goalOf(1).center.y;
    expect(to - from).toBeCloseTo(480, 6);
    run(rig, 1 / 60, { frame: beat(1), focus: focusOf(1) });
    const one = rig.pose.center.y;
    expect(one).toBeGreaterThan(from);
    expect(one).toBeLessThan(to);
    run(rig, 0.3 - 1 / 60, { frame: beat(1), focus: focusOf(1) });
    const progress = (rig.pose.center.y - from) / (to - from);
    expect(progress).toBeGreaterThan(0.94);
    expect(progress).toBeLessThan(1);
    run(rig, 1, { frame: beat(1), focus: focusOf(1) });
    expect(rig.pose.center.y).toBeCloseTo(to, 6);
    expect(rig.pose.zoom).toBeCloseTo(goalOf(1).zoom, 9);
  });

  it('프레임이 느려도(30fps, 10fps) 같은 시간 뒤의 자세는 같다(보간이 시간 기준이다)', () => {
    const at = (dt: number): number => {
      const rig = fresh();
      run(rig, 0.5, {});
      run(rig, 0.3, { frame: beat(2), focus: focusOf(2) }, dt);
      return rig.pose.center.y;
    };
    const a = at(1 / 60);
    expect(at(1 / 30)).toBeCloseTo(a, 6);
    expect(at(0.1)).toBeCloseTo(a, 6);
  });

  it('움직임 줄이기: 박이 바뀌면 보간 없이 첫 걸음에 새 박에 도착한다', () => {
    const rig = fresh();
    run(rig, 0.5, { reduce: true });
    run(rig, 1 / 60, { reduce: true, frame: beat(3), focus: focusOf(3) });
    const goal = goalOf(3);
    expect(rig.pose.center.y).toBeCloseTo(goal.center.y, 9);
    expect(rig.pose.center.x).toBeCloseTo(goal.center.x, 9);
  });

  it('바로 이동(snap)에서도 보간 없이 도착한다', () => {
    const rig = fresh();
    run(rig, 0.5, {});
    rig.step({ ...base(), frame: beat(2), focus: focusOf(2), snap: true });
    expect(rig.pose.center.y).toBeCloseTo(goalOf(2).center.y, 9);
  });

  it('focus가 없으면(E1, E2) 따라가기가 아니라 줄 전체를 담는다: 프레임이 바뀌면 바로 새 자세다', () => {
    const rig = fresh();
    const stones = { x: 6760, y: 2708, w: 480, h: 140 };
    run(rig, 0.5, { frame: stones, focus: undefined });
    const other = { ...stones, y: 3508 };
    rig.step({ ...base(), frame: other, focus: undefined });
    expect(rig.pose.center.y).toBeCloseTo(framePose(other, view, { bottomInset: 160, pad: 24, minZoom: 0.8 }).center.y, 9);
  });

  it('같은 박에 머무는 동안은 움직이지 않는다(칸을 옮겨도 박 안에서 박 전체가 보이면 자세가 같다)', () => {
    const rig = fresh();
    run(rig, 0.5, {});
    const pose = rig.pose;
    run(rig, 0.3, { focus: { x: 6704, y: 700 + 400 } });
    expect(rig.pose.center.y).toBeCloseTo(pose.center.y, 9);
    expect(rig.pose.zoom).toBeCloseTo(pose.zoom, 9);
  });

  it('나가면 0.3초 동안 캐릭터에게 돌아온다(따라가기 중에도 같다)', () => {
    const rig = fresh();
    run(rig, 0.5, { frame: beat(1), focus: focusOf(1) });
    run(rig, 0.5, { frame: null, focus: undefined });
    expect(rig.framing).toBe(false);
    expect(rig.pose.center).toEqual(snapCenter(player, view));
  });

  it('메뉴 띠(topInset)는 따라가는 자세에 전해진다. 따라가지 않는 설치물(focus 없음)의 자세는 띠가 있어도 같다', () => {
    const rig = fresh();
    run(rig, 0.6, { topInset: MENU_BAND });
    const goal = followPose(beat(0), focusOf(0), view, { bottomInset: 160, pad: 24, minZoom: 0.8, topInset: MENU_BAND });
    expect(rig.pose.center.y).toBeCloseTo(goal.center.y, 6);
    expect(rig.pose.zoom).toBeCloseTo(goal.zoom, 9);
    expect(rig.pose.center.y).not.toBeCloseTo(goalOf(0).center.y, 3);
    const whole = fresh();
    const stones = { x: 6760, y: 2708, w: 480, h: 140 };
    run(whole, 0.6, { frame: stones, focus: undefined, topInset: MENU_BAND });
    expect(whole.pose).toEqual(framePose(stones, view, { bottomInset: 160, pad: 24, minZoom: 0.8 }));
  });
});

describe('6-6 followPose: 바퀴(고른 칸이 두 곳에 그려진다)', () => {
  // E4 물레방아: 띠와 바퀴 전체 x 5716–6384, y 2096–2576(668 × 480). 칸 80 px, 바퀴 가운데 (6144, 2336)
  const rect = { x: 5716, y: 2096, w: 668, h: 480 };
  const tuning = { pad: 24, minZoom: 0.6 };
  const ring = { x: 6060, y: 2190 }; // 6번 칸의 바퀴 쪽(11시)
  const band = { x: 5808, y: 2536 }; // 같은 칸의 띠 쪽(맨 아래)
  const view = { width: 430, height: 932 };
  const opts = { ...tuning, bottomInset: 646, topInset: MENU_BAND };

  describe('strictMinZoom: 너비에 다 안 들어와도 칸 48 px(배율 0.6)를 지키고 가로로 따라간다', () => {
    const narrow = { width: 360, height: 800 };
    it('없으면 사각형의 너비가 화면에 다 들어오는 배율까지만 올린다(줄의 두께가 좁은 줄을 위한 규칙, 6-5)', () => {
      const f = followPose(rect, ring, narrow, { ...tuning, bottomInset: 560, topInset: MENU_BAND });
      expect(f.zoom).toBeCloseTo(360 / 668, 9);
      expect(80 * f.zoom).toBeLessThan(48);
    });
    it('켜면 배율은 minZoom이고(칸 48 px), 카메라 중심은 고른 칸을 따라 가로로 움직인다', () => {
      const o = { ...tuning, bottomInset: 560, topInset: MENU_BAND, strictMinZoom: true };
      const west = followPose(rect, { x: 5808, y: 2336 }, narrow, o);
      const east = followPose(rect, { x: 6312, y: 2336 }, narrow, o);
      expect(west.zoom).toBeCloseTo(0.6, 9);
      expect(east.zoom).toBeCloseTo(0.6, 9);
      expect(east.center.x).toBeGreaterThan(west.center.x);
      // 보이는 가로(600 px)가 담는 구간(여유 포함 716 px)을 벗어나지 않는다
      const visW = narrow.width / 0.6;
      expect(west.center.x - visW / 2).toBeGreaterThanOrEqual(5716 - 24 - 1e-6);
      expect(east.center.x + visW / 2).toBeLessThanOrEqual(5716 + 668 + 24 + 1e-6);
    });
    it('너비에 이미 들어오는 화면에서는 켜도 같은 자세다(430 px 폭은 배율 0.6에서 401 px만 쓴다)', () => {
      const a = followPose(rect, ring, view, opts);
      const b = followPose(rect, ring, view, { ...opts, strictMinZoom: true });
      expect(b).toEqual(a);
    });
  });

  describe('막대 한계: 막대는 메뉴 띠를 뺀 화면 높이의 90%까지 그대로 믿는다(작은 휴대폰의 막대는 화면의 70%를 넘는다, D-151)', () => {
    const phone = { width: 390, height: 900 };
    const o = { ...tuning, topInset: MENU_BAND, strictMinZoom: true };
    const atY = (f: { center: { y: number }; zoom: number }, y: number): number => phone.height / 2 + (y - f.center.y) * f.zoom;
    it('390×900에서 칸을 하나 놓은 뒤의 막대(690 px, 화면의 77%)에도 고른 칸이 메뉴 띠 아래, 막대 위에 온다', () => {
      for (const y of [2190, 2336, 2482]) {
        const f = followPose(rect, { x: 6144, y }, phone, { ...o, bottomInset: 690 });
        expect(f.zoom, `y=${y}`).toBeCloseTo(0.6, 9);
        const at = atY(f, y);
        expect(at, `y=${y}`).toBeGreaterThanOrEqual(MENU_BAND);
        expect(at, `y=${y}`).toBeLessThanOrEqual(phone.height - 690);
      }
    });
    it('한계(900 px에서 746 px)보다 큰 막대는 그 한계의 막대로 다루고, 한계 아래에서는 막대 높이가 자세를 바꾼다', () => {
      const limit = 0.9 * phone.height - MENU_BAND;
      const focus = { x: 6144, y: 2336 };
      const at = followPose(rect, focus, phone, { ...o, bottomInset: limit });
      expect(followPose(rect, focus, phone, { ...o, bottomInset: limit + 500 })).toEqual(at);
      expect(followPose(rect, focus, phone, { ...o, bottomInset: limit - 40 })).not.toEqual(at);
      // 이전 한계(화면의 70%, 630 px)를 넘는 막대는 이제 그대로 믿는다
      expect(followPose(rect, focus, phone, { ...o, bottomInset: 690 })).not.toEqual(followPose(rect, focus, phone, { ...o, bottomInset: 0.7 * phone.height }));
    });
    it('메뉴 띠가 화면의 2할까지만 쳐지는 것은 그대로다: 띠 + 막대가 90%를 넘지 않는다', () => {
      const f = followPose(rect, { x: 6144, y: 2336 }, { width: 800, height: 300 }, { ...tuning, bottomInset: 900, topInset: 900 });
      // 띠 60 px(2할) + 막대 210 px(90% − 띠) = 270 px → 보이는 구간은 화면의 1할(30 px)
      const view = { width: 800, height: 300 };
      expect(f).toEqual(followPose(rect, { x: 6144, y: 2336 }, view, { ...tuning, bottomInset: 210, topInset: 60 }));
    });
  });

  describe('alsoShow: 두 점이 칸 하나씩의 여유(SHOW_MARGIN)를 두고 보이는 범위에 들면 한가운데, 아니면 focus만', () => {
    it('SHOW_MARGIN은 고리 한 칸 두께(86 px)의 반보다 크다', () => {
      expect(SHOW_MARGIN).toBeGreaterThan(86 / 2);
    });
    it('들지 않으면(430×932에서 6번 칸: 두 점이 346 px 떨어져 있다) focus만 비춘다: alsoShow가 결과를 바꾸지 않는다', () => {
      const alone = followPose(rect, ring, view, opts);
      const withBand = followPose(rect, ring, view, { ...opts, alsoShow: band });
      expect(withBand).toEqual(alone);
    });
    it('들면(2번 칸: 바퀴 칸과 띠 칸이 120 px 떨어져 있다) 둘의 한가운데를 비춘다', () => {
      const r2 = { x: 6312, y: 2336 };
      const b2 = { x: 5808, y: 2216 };
      const alone = followPose(rect, r2, view, opts);
      const withBand = followPose(rect, r2, view, { ...opts, alsoShow: b2 });
      const mid = followPose(rect, { x: (r2.x + b2.x) / 2, y: (r2.y + b2.y) / 2 }, view, opts);
      expect(withBand).toEqual(mid);
      expect(withBand.center.y).toBeLessThan(alone.center.y);
    });
    it('가로로도 같은 규칙이다: 두 점의 가로 거리가 보이는 너비에서 여유를 뺀 것보다 멀면 focus만 비춘다', () => {
      const narrow = { width: 360, height: 800 };
      const o = { ...tuning, bottomInset: 560, topInset: MENU_BAND, strictMinZoom: true };
      // 2번 칸: 바퀴 칸 6312와 띠 칸 5808은 504 px 떨어져 있고, 보이는 너비 600 − 2 × 60 = 480보다 멀다
      const alone = followPose(rect, { x: 6312, y: 2336 }, narrow, o);
      expect(followPose(rect, { x: 6312, y: 2336 }, narrow, { ...o, alsoShow: { x: 5808, y: 2216 } })).toEqual(alone);
      // 1번 칸: 6228과 5808은 420 px라 480 안에 든다: 한가운데
      const pair = followPose(rect, { x: 6228, y: 2190 }, narrow, { ...o, alsoShow: { x: 5808, y: 2136 } });
      expect(pair.center.x).toBeCloseTo(followPose(rect, { x: 6018, y: 2163 }, narrow, o).center.x, 6);
    });
  });

  describe('CameraRig: strictMinZoom과 alsoShow가 followPose까지 전해진다', () => {
    const player = { x: 6450, y: 2300 };
    const fresh = (): CameraRig => new CameraRig({ center: snapCenter(player, view), zoom: cameraZoom(view) });
    it('바로 이동(snap)이면 보간 없이 followPose의 자세에 도착한다', () => {
      const rig = fresh();
      const r2 = { x: 6312, y: 2336 };
      const b2 = { x: 5808, y: 2216 };
      const step: RigStep = { dt: 1 / 60, view: { width: 360, height: 800 }, target: player, frame: rect, focus: r2, alsoShow: b2, bottomInset: 560, topInset: MENU_BAND, pad: 24, minZoom: 0.6, strictMinZoom: true, snap: true, reduce: false };
      const pose = rig.step(step);
      expect(pose).toEqual(followPose(rect, r2, { width: 360, height: 800 }, { pad: 24, minZoom: 0.6, bottomInset: 560, topInset: MENU_BAND, strictMinZoom: true, alsoShow: b2 }));
      expect(pose.zoom).toBeCloseTo(0.6, 9);
    });
  });
});

// ───── 7-2 월드 남쪽 끝 가까이의 설치물 ─────
// 음계 길의 돌 틀(S1 y 4724–4877, S2 y 5224–5377, S3 y 4974–5127)은 월드 아래 끝(6144)에서 767–1420 px 위에 있다.
// 세로 휴대폰은 조작 막대가 화면의 절반이 넘어서(360×640에서 실제로 513 px) 막대 위 자리에 담으려면 카메라가 월드 아래 끝을 넘어 비춰야 한다.
// 넘은 부분은 막대 뒤라 보이지 않는다. 월드 안으로 가두기만 하면 틀이 막대 뒤로 내려가 돌을 누를 수 없다.
// framePose는 막대 높이를 화면의 70%까지만 믿는다(막대가 화면의 대부분을 가리는 극단에서도 설치물이 보이게 두는 오래된 한도). 한도 안의 막대는 틀 전체가 막대 위에 담기고,
// 한도를 넘는 극단(360×640의 513 px = 80%)은 틀의 가운데가 막대 위에 있게만 보장한다.
describe('7-2 월드 남쪽 끝 가까운 설치물도 조작 막대 위에 담긴다', () => {
  const world = { width: 8192, height: 6144 };
  const S1 = { x: 5550, y: 4724, w: 774, h: 153 };
  const S2 = { x: 6250, y: 5224, w: 774, h: 153 };
  const S3 = { x: 6074, y: 4974, w: 576, h: 153 };
  const FRAMES: ReadonlyArray<[string, { x: number; y: number; w: number; h: number }]> = [
    ['S1', S1],
    ['S2', S2],
    ['S3', S3],
  ];
  const VIEWS: ReadonlyArray<[string, { width: number; height: number }, number]> = [
    ['휴대폰 세로 360×640, 막대 440', { width: 360, height: 640 }, 440],
    ['휴대폰 세로 390×844, 막대 400', { width: 390, height: 844 }, 400],
    ['휴대폰 세로 430×932, 막대 450', { width: 430, height: 932 }, 450],
    ['휴대폰 세로 430×932, 막대 600', { width: 430, height: 932 }, 600],
    ['노트북 가로 1366×768, 막대 200', { width: 1366, height: 768 }, 200],
  ];
  const screenY = (worldY: number, pose: { center: { y: number }; zoom: number }, viewH: number): number => viewH / 2 + (worldY - pose.center.y) * pose.zoom;

  describe.each(VIEWS)('%s', (_name, view, inset) => {
    it.each(FRAMES)('%s: 틀이 막대 위쪽 자리 안에 들어오고, 막대 위에 월드 밖이 비치지 않는다', (_code, rect) => {
      const pose = framePose(rect, view, { bottomInset: inset }, world);
      const top = screenY(rect.y, pose, view.height);
      const bottom = screenY(rect.y + rect.h, pose, view.height);
      expect(top).toBeGreaterThanOrEqual(-1e-6);
      expect(bottom).toBeLessThanOrEqual(view.height - inset + 1e-6);
      // 틀의 가운데가 막대 위쪽 자리의 가운데에 온다
      expect((top + bottom) / 2).toBeCloseTo((view.height - inset) / 2, 6);
      // 막대 위로 보이는 곳은 모두 월드 안이다: 월드 아래 끝이 막대 윗변보다 아래에 있다
      expect(screenY(world.height, pose, view.height)).toBeGreaterThanOrEqual(view.height - inset - 1e-6);
      // 위쪽과 양옆은 월드 안이다
      const vis = visibleWorld(view, pose.zoom);
      expect(pose.center.y - vis.height / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(pose.center.x - vis.width / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(pose.center.x + vis.width / 2).toBeLessThanOrEqual(world.width + 1e-6);
    });
  });

  it('360×640 작은 휴대폰(막대 513 px = 화면의 80%): S1·S2의 틀은 막대 위에 담기고, S3는 돌 가운데가 막대 위에 있다', () => {
    const view = { width: 360, height: 640 };
    const inset = 513;
    const barTop = view.height - inset;
    for (const [code, rect] of FRAMES) {
      const pose = framePose(rect, view, { bottomInset: inset }, world);
      const top = screenY(rect.y, pose, view.height);
      const bottom = screenY(rect.y + rect.h, pose, view.height);
      const middle = (top + bottom) / 2;
      expect(middle, `${code} 돌 가운데는 막대 위`).toBeLessThanOrEqual(barTop - 24);
      expect(top, `${code} 위쪽`).toBeGreaterThanOrEqual(0);
      if (code !== 'S3') expect(bottom, `${code} 틀 전체가 막대 위`).toBeLessThanOrEqual(barTop + 1e-6);
      // 막대 위로 월드 밖이 비치지 않는다
      expect(screenY(world.height, pose, view.height), `${code} 월드 아래 끝`).toBeGreaterThanOrEqual(barTop - 1e-6);
    }
  });

  it('검사가 헛돌지 않는다: 월드 안으로만 가두면(clampCenter) 430×932 휴대폰에서 S2의 틀이 막대 뒤로 내려간다', () => {
    const view = { width: 430, height: 932 };
    const inset = 450;
    const good = framePose(S2, view, { bottomInset: inset }, world);
    const wanted = { x: S2.x + S2.w / 2, y: S2.y + S2.h / 2 + inset / 2 / good.zoom };
    const old = { center: clampCenter(wanted, view, world, good.zoom), zoom: good.zoom };
    expect(screenY(S2.y, old, view.height)).toBeGreaterThan(view.height - inset);
    expect(screenY(S2.y + S2.h, good, view.height)).toBeLessThanOrEqual(view.height - inset + 1e-6);
  });

  it('followPose(위쪽 메뉴 띠가 있는 설치물)도 같다: 메뉴 띠 아래, 막대 위 자리의 가운데에 담긴다', () => {
    const view = { width: 430, height: 932 };
    const inset = 441;
    const pose = followPose(S2, { x: S2.x + S2.w / 2, y: S2.y + S2.h / 2 }, view, { bottomInset: inset, topInset: MENU_BAND }, world);
    const top = screenY(S2.y, pose, view.height);
    const bottom = screenY(S2.y + S2.h, pose, view.height);
    expect(top).toBeGreaterThanOrEqual(MENU_BAND - 1e-6);
    expect(bottom).toBeLessThanOrEqual(view.height - inset + 1e-6);
    expect((top + bottom) / 2).toBeCloseTo(MENU_BAND + (view.height - inset - MENU_BAND) / 2, 6);
  });

  describe('clampFrameCenter', () => {
    const view = { width: 430, height: 932 };
    const zoom = 0.5;
    const vis = visibleWorld(view, zoom);

    it('막대가 없으면(0) clampCenter와 똑같다', () => {
      for (const c of [
        { x: 0, y: 0 },
        { x: 9000, y: 9000 },
        { x: 4000, y: 3000 },
        { x: 4000, y: 6000 },
      ]) {
        expect(clampFrameCenter(c, view, world, zoom, 0)).toEqual(clampCenter(c, view, world, zoom));
        expect(clampFrameCenter(c, view, world, zoom)).toEqual(clampCenter(c, view, world, zoom));
        expect(clampFrameCenter(c, view, world, zoom, -20)).toEqual(clampCenter(c, view, world, zoom));
      }
    });

    it('막대가 있으면 아래만 막대 높이(월드 px)만큼 넘어도 된다. 위쪽과 양옆은 그대로 가둔다', () => {
      const inset = 400;
      const below = inset / zoom;
      const low = clampFrameCenter({ x: 4000, y: 9000 }, view, world, zoom, inset);
      expect(low.y).toBeCloseTo(world.height + below - vis.height / 2, 9);
      expect(low.y).toBeGreaterThan(clampCenter({ x: 4000, y: 9000 }, view, world, zoom).y);
      const high = clampFrameCenter({ x: -500, y: -500 }, view, world, zoom, inset);
      expect(high).toEqual(clampCenter({ x: -500, y: -500 }, view, world, zoom));
      expect(clampFrameCenter({ x: 9000, y: 3000 }, view, world, zoom, inset).x).toBeCloseTo(world.width - vis.width / 2, 9);
      // 월드 한가운데는 그대로 둔다
      expect(clampFrameCenter({ x: 4000, y: 3000 }, view, world, zoom, inset)).toEqual({ x: 4000, y: 3000 });
    });

    it('보이는 범위가 월드보다 크면 월드 가운데에 둔다(가릴 것이 없다)', () => {
      const tiny = { width: 500, height: 300 };
      expect(clampFrameCenter({ x: 0, y: 0 }, view, tiny, 0.5, 100)).toEqual(clampCenter({ x: 0, y: 0 }, view, tiny, 0.5));
    });
  });
});
