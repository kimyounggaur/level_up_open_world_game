// 6-7c 종나무를 담는 카메라(domain/bells.ts의 bellFollowOf, world/camera.ts의 followPose, WorldScene의 연결):
// 나무 하나(W1, W2), 종탑(W3), 빈터(W4) 모두 이름표 띠(열 번호)까지 메뉴 띠 아래, 조작 막대 위에 담긴다.
// 좁은 화면에서는 고리 한 칸을 48 px 아래로 줄이지 않고 고른 나무와 고른 단을 비추고, 넓은 화면에서는 전체를 가운데에 담는다.
import { describe, expect, it } from 'vitest';
import { bellFollowOf, bellTreeNameOf, bellTreeRect } from '@/domain/bells';
import type { BellCursorView } from '@/domain/bells';
import { BELL_CELL_H, BELL_CELL_W, BELL_LABEL_TOP, MIN_CELL_ON_SCREEN, frameTuningOf, slotBounds } from '@/domain/installation';
import { CameraRig, MENU_BAND, cameraZoom, followPose, framePose, snapCenter, visibleWorld } from '@/world/camera';
import type { CameraPose, ViewSize } from '@/world/camera';
import { installation } from './controller-rig';

const W1 = installation('inst.bell-grove.three-bells');
const W2 = installation('inst.bell-grove.bright-dark');
const W3 = installation('inst.bell-grove.bell-tower');
const W4 = installation('inst.bell-grove.three-pillars');
const STONES = installation('inst.village.scale-stones');
const MIN_ZOOM = MIN_CELL_ON_SCREEN / Math.min(BELL_CELL_W, BELL_CELL_H);

describe('나무 이름', () => {
  it('첫째 나무, 둘째 나무 … 다섯째 나무, 그 뒤는 6번째 나무(화면의 문장과 월드의 이름표가 같은 이름을 쓴다)', () => {
    expect([0, 1, 2, 3, 4, 5].map(bellTreeNameOf)).toEqual(['첫째 나무', '둘째 나무', '셋째 나무', '넷째 나무', '다섯째 나무', '6번째 나무']);
  });
});

describe('bellTreeRect: 나무 한 그루가 차지하는 사각형(이름표 띠까지)', () => {
  it('빈터의 나무 셋은 같은 크기이고 오른쪽으로 416 px씩 선다(고리 격자 320 px + 사이 96 px)', () => {
    // 고리 격자(왼쪽 위 356, 1188) 둘레에 왼쪽 띠 52 px, 위쪽 띠 44 px을 더한다
    expect(bellTreeRect(W4, 0)).toEqual({ x: 304, y: 1144, w: 372, h: 332 });
    expect(bellTreeRect(W4, 1)).toEqual({ x: 720, y: 1144, w: 372, h: 332 });
    expect(bellTreeRect(W4, 2)).toEqual({ x: 1136, y: 1144, w: 372, h: 332 });
  });

  it('나무가 하나인 설치물은 설치물 전체(slotBounds)와 같다', () => {
    for (const inst of [W1, W2]) expect(bellTreeRect(inst, 0)).toEqual(slotBounds(inst));
    // 종탑은 열이 셋이라 폭이 52 + 240
    expect(bellTreeRect(W3, 0)).toEqual(slotBounds(W3));
    expect(bellTreeRect(W3, 0)!.w).toBe(52 + 3 * BELL_CELL_W);
  });

  it('빈터 전체는 세 나무를 모두 담는다', () => {
    const all = slotBounds(W4);
    for (let tree = 0; tree < 3; tree++) {
      const r = bellTreeRect(W4, tree)!;
      expect(r.x).toBeGreaterThanOrEqual(all.x);
      expect(r.x + r.w).toBeLessThanOrEqual(all.x + all.w);
      expect(r.y).toBeGreaterThanOrEqual(all.y);
      expect(r.y + r.h).toBeLessThanOrEqual(all.y + all.h);
    }
  });

  it('종나무가 아니거나 없는 나무면 null이다', () => {
    expect(bellTreeRect(STONES, 0)).toBeNull();
    expect(bellTreeRect(W1, 1)).toBeNull();
    expect(bellTreeRect(W4, 3)).toBeNull();
    expect(bellTreeRect(W4, -1)).toBeNull();
    expect(bellTreeRect(W4, 0.5)).toBeNull();
  });
});

describe('bellFollowOf: 종나무는 모두 전체를 담되 고른 칸을 비춘다', () => {
  it('돌 설치물과 종나무가 아닌 설치물은 null이다', () => {
    expect(bellFollowOf(STONES, { cursor: 1 })).toBeNull();
    expect(bellFollowOf(installation('inst.beat-river.waterwheel'), { cursor: 0 })).toBeNull();
  });

  it('나무 하나(W1, W2)와 종탑(W3)도 전체(slotBounds)를 rect로, 나무의 가운데를 focus로 돌려준다', () => {
    for (const inst of [W1, W2, W3]) {
      const all = slotBounds(inst);
      const f = bellFollowOf(inst, { cursor: 1 })!;
      expect(f.rect, inst.installationId).toEqual(all);
      expect(f.focus, inst.installationId).toEqual({ x: all.x + all.w / 2, y: all.y + all.h / 2 });
    }
  });

  it('빈터는 전체(slotBounds)를 담되 고른 나무의 가운데를 비춘다', () => {
    const all = slotBounds(W4);
    expect(all).toEqual({ x: 304, y: 1144, w: 1204, h: 332 });
    // 초안 칸은 나무 × 4열이다: 0–3 첫째, 4–7 둘째, 8–11 셋째 나무
    const focusOf = (cursor: number | null) => bellFollowOf(W4, { cursor })!.focus;
    for (const cursor of [0, 1, 2, 3]) expect(focusOf(cursor), `칸 ${cursor}`).toEqual({ x: 490, y: 1310 });
    for (const cursor of [4, 5, 6, 7]) expect(focusOf(cursor), `칸 ${cursor}`).toEqual({ x: 906, y: 1310 });
    for (const cursor of [8, 9, 10, 11]) expect(focusOf(cursor), `칸 ${cursor}`).toEqual({ x: 1322, y: 1310 });
    expect(bellFollowOf(W4, { cursor: 6 })!.rect).toEqual(all);
  });

  it('고른 단(cursorOctave)이 있으면 세로는 그 단의 가운데다: 위에서부터 5, 4, 3, 2옥타브가 72 px씩 내려간다', () => {
    // 나무의 위쪽 이름표 띠 44 px 아래에서 단이 시작한다
    const top = bellTreeRect(W1, 0)!.y;
    const ys = [5, 4, 3, 2].map((octave) => bellFollowOf(W1, { cursor: 0, cursorOctave: octave })!.focus.y);
    expect(ys).toEqual([top + BELL_LABEL_TOP + 36, top + BELL_LABEL_TOP + 108, top + BELL_LABEL_TOP + 180, top + BELL_LABEL_TOP + 252]);
    // 가로는 단과 상관없이 나무의 가운데다
    for (const octave of [5, 4, 3, 2]) expect(bellFollowOf(W1, { cursor: 0, cursorOctave: octave })!.focus.x).toBe(bellFollowOf(W1, { cursor: 0 })!.focus.x);
    // 빈터에서도 같은 단의 높이다
    const gladeTop = bellTreeRect(W4, 0)!.y;
    expect(bellFollowOf(W4, { cursor: 9, cursorOctave: 3 })!.focus).toEqual({ x: 1322, y: gladeTop + BELL_LABEL_TOP + 180 });
  });

  it('고른 단을 모르거나 나무에 없는 단이면 나무의 가운데다', () => {
    const center = bellFollowOf(W1, { cursor: 0 })!.focus;
    expect(bellFollowOf(W1, { cursor: 0, cursorOctave: null })!.focus).toEqual(center);
    expect(bellFollowOf(W1, { cursor: 0, cursorOctave: 7 })!.focus).toEqual(center);
    expect(bellFollowOf(W1, { cursor: null, cursorOctave: 3 })!.focus.x).toBe(center.x);
  });

  it('고른 종이 없거나 모습이 아직 없으면 첫째 나무다(첫 사건의 나무)', () => {
    expect(bellFollowOf(W4, { cursor: null })!.focus).toEqual({ x: 490, y: 1310 });
    expect(bellFollowOf(W4)!.focus).toEqual({ x: 490, y: 1310 });
    expect(bellFollowOf(W4, null)!.focus).toEqual({ x: 490, y: 1310 });
  });

  it('범위 밖의 칸 번호는 가까운 나무로 가둔다', () => {
    expect(bellFollowOf(W4, { cursor: 99 })!.focus).toEqual({ x: 1322, y: 1310 });
    expect(bellFollowOf(W4, { cursor: -5 })!.focus).toEqual({ x: 490, y: 1310 });
  });
});

// ───── 화면에서 실제로 어떻게 비추는가 ─────

/** 메뉴 띠 아래, 조작 막대 위로 보이는 월드의 사각형 */
function usableWindow(pose: CameraPose, view: ViewSize, bottomInset: number) {
  const vis = visibleWorld(view, pose.zoom);
  return {
    x0: pose.center.x - vis.width / 2,
    x1: pose.center.x + vis.width / 2,
    y0: pose.center.y - vis.height / 2 + MENU_BAND / pose.zoom,
    y1: pose.center.y + vis.height / 2 - bottomInset / pose.zoom,
  };
}

/** WorldScene이 하는 대로: bellFollowOf의 목표를 followPose에 넣는다(메뉴 띠는 MENU_BAND) */
const poseOf = (inst: typeof W4, view: ViewSize, bottomInset: number, cur: BellCursorView): CameraPose => {
  const f = bellFollowOf(inst, cur)!;
  return followPose(f.rect, f.focus, view, { ...frameTuningOf(inst), topInset: MENU_BAND, bottomInset });
};
const gladePose = (view: ViewSize, bottomInset: number, cursor: number | null): CameraPose => poseOf(W4, view, bottomInset, { cursor });

const inside = (w: ReturnType<typeof usableWindow>, r: { x: number; y: number; w: number; h: number }): boolean => r.x >= w.x0 - 1e-6 && r.x + r.w <= w.x1 + 1e-6 && r.y >= w.y0 - 1e-6 && r.y + r.h <= w.y1 + 1e-6;

const SCREENS: Array<{ name: string; view: ViewSize; bar: number }> = [
  { name: '휴대폰 세로 390×844', view: { width: 390, height: 844 }, bar: 300 },
  { name: '작은 휴대폰 360×640', view: { width: 360, height: 640 }, bar: 260 },
  { name: '태블릿 세로 768×1024', view: { width: 768, height: 1024 }, bar: 260 },
  { name: '태블릿 가로 1024×768', view: { width: 1024, height: 768 }, bar: 180 },
  { name: '데스크톱 1280×720', view: { width: 1280, height: 720 }, bar: 150 },
];

describe('어느 화면에서나 고리 한 칸은 48 px 아래로 줄지 않는다(7.6)', () => {
  for (const s of SCREENS) {
    it(`${s.name}: 칸이 화면에서 48 px 이상이고, 고른 나무가 메뉴 띠와 조작 막대 사이에 온전히 들어온다`, () => {
      for (const cursor of [0, 5, 10]) {
        const pose = gladePose(s.view, s.bar, cursor);
        expect(pose.zoom * BELL_CELL_H, `칸 높이 ${cursor}`).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
        expect(pose.zoom * BELL_CELL_W, `칸 너비 ${cursor}`).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
        const tree = bellTreeRect(W4, Math.floor(cursor / 4))!;
        expect(inside(usableWindow(pose, s.view, s.bar), tree), `고른 나무 ${cursor}`).toBe(true);
      }
    });
  }

  it('화면이 넉넉하면(1280×720, 1024×768) 빈터 전체가 한 화면에 들어오고 어느 나무를 골라도 같은 자세다', () => {
    for (const s of SCREENS.filter((x) => x.view.width >= 1024 && x.view.width > x.view.height)) {
      const poses = [0, 5, 10].map((c) => gladePose(s.view, s.bar, c));
      expect(poses[1], s.name).toEqual(poses[0]);
      expect(poses[2], s.name).toEqual(poses[0]);
      expect(inside(usableWindow(poses[0]!, s.view, s.bar), slotBounds(W4)), s.name).toBe(true);
    }
  });

  it('좁은 화면(휴대폰, 세로 태블릿)에서는 배율은 같고 카메라가 고른 나무를 따라 오른쪽으로 옮겨 간다', () => {
    for (const s of SCREENS.filter((x) => x.view.width <= 768)) {
      const [a, b, c] = [0, 5, 10].map((cursor) => gladePose(s.view, s.bar, cursor)) as [CameraPose, CameraPose, CameraPose];
      expect(a.zoom, s.name).toBeCloseTo(MIN_ZOOM, 9);
      expect(b.zoom).toBeCloseTo(a.zoom, 9);
      expect(c.zoom).toBeCloseTo(a.zoom, 9);
      expect(b.center.x, s.name).toBeGreaterThan(a.center.x);
      expect(c.center.x, s.name).toBeGreaterThan(b.center.x);
      // 세 나무를 다 담을 수 없다는 것도 확인한다: 빈터 전체는 보이는 범위를 넘친다
      expect(inside(usableWindow(a, s.view, s.bar), slotBounds(W4)), s.name).toBe(false);
    }
  });

  it('같은 나무 안에서 열이 바뀌어도 카메라는 움직이지 않는다(나무 단위로 따라간다)', () => {
    const view = { width: 390, height: 844 };
    const base = gladePose(view, 300, 4);
    for (const cursor of [5, 6, 7]) expect(gladePose(view, 300, cursor)).toEqual(base);
  });

  it('고른 것이 없으면 첫째 나무를 비춘다(처음 들어왔을 때)', () => {
    const view = { width: 390, height: 844 };
    expect(gladePose(view, 300, null)).toEqual(gladePose(view, 300, 0));
  });
});

describe('나무 하나와 종탑도 위쪽 메뉴 띠 아래에 전체를 담는다', () => {
  const desktop = { width: 1280, height: 720 };
  const phone = { width: 390, height: 844 };
  const forms = [W1, W2, W3, W4];

  it('고치기 전에는(framePose) 위쪽 이름표 띠(열 번호)가 오른쪽 위 메뉴 단추 뒤로 들어갔다', () => {
    // 1280×720에서 조작 막대 400 px: framePose는 위쪽 메뉴 띠를 모르고 막대 위쪽 자리의 가운데에 놓는다
    for (const inst of [W1, W2, W3]) {
      const rect = slotBounds(inst);
      const old = framePose(rect, desktop, { ...frameTuningOf(inst), bottomInset: 400 });
      expect(inside(usableWindow(old, desktop, 400), rect), inst.installationId).toBe(false);
    }
  });

  it('1280×720, 조작 막대 400 px: 이름표 띠까지 전체가 메뉴 띠와 막대 사이에 들어오고 칸은 48 px 이상이다', () => {
    for (const inst of forms) {
      const pose = poseOf(inst, desktop, 400, { cursor: 1, cursorOctave: 4 });
      expect(inside(usableWindow(pose, desktop, 400), slotBounds(inst)), inst.installationId).toBe(true);
      expect(pose.zoom * BELL_CELL_H, inst.installationId).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
      expect(pose.zoom * BELL_CELL_W, inst.installationId).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
    }
  });

  it('전체가 들어오면 고른 단이 바뀌어도 카메라는 움직이지 않는다(가운데에 가만히 있다)', () => {
    for (const inst of forms) {
      const base = poseOf(inst, desktop, 400, { cursor: 1, cursorOctave: 5 });
      for (const octave of [4, 3, 2]) expect(poseOf(inst, desktop, 400, { cursor: 1, cursorOctave: octave }), `${inst.installationId} ${octave}`).toEqual(base);
    }
  });

  it('조작 막대가 더 커서(452 px) 전체가 들어오지 않아도 고른 단은 메뉴 띠 아래, 막대 위에 온전히 보이고 칸은 48 px 이상이다', () => {
    for (const inst of forms) {
      const tree = bellTreeRect(inst, 0)!;
      const poses: CameraPose[] = [];
      [5, 4, 3, 2].forEach((octave, row) => {
        const pose = poseOf(inst, desktop, 452, { cursor: 1, cursorOctave: octave });
        poses.push(pose);
        const rowRect = { x: tree.x, y: tree.y + BELL_LABEL_TOP + row * BELL_CELL_H, w: tree.w, h: BELL_CELL_H };
        expect(inside(usableWindow(pose, desktop, 452), rowRect), `${inst.installationId} ${octave}옥타브`).toBe(true);
        expect(pose.zoom * BELL_CELL_H, `${inst.installationId} ${octave}옥타브`).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
      });
      // 위쪽 단을 고르면 열 번호 띠까지 보이고, 단을 아래로 옮기면 카메라가 아래로 따라간다
      expect(inside(usableWindow(poses[0]!, desktop, 452), { x: tree.x, y: tree.y, w: tree.w, h: BELL_LABEL_TOP }), inst.installationId).toBe(true);
      expect(poses[3]!.center.y, inst.installationId).toBeGreaterThan(poses[0]!.center.y);
    }
  });

  it('휴대폰 390×844에서 조작 막대가 703 px(화면의 대부분)이어도 고른 단은 막대 뒤로 가려지지 않는다', () => {
    for (const inst of forms) {
      const tree = bellTreeRect(inst, 0)!;
      [5, 4, 3, 2].forEach((octave, row) => {
        const pose = poseOf(inst, phone, 703, { cursor: 1, cursorOctave: octave });
        const rowRect = { x: tree.x, y: tree.y + BELL_LABEL_TOP + row * BELL_CELL_H, w: tree.w, h: BELL_CELL_H };
        expect(inside(usableWindow(pose, phone, 703), rowRect), `${inst.installationId} ${octave}옥타브`).toBe(true);
      });
    }
  });
});

describe('CameraRig: 빈터를 따라가는 카메라', () => {
  const view = { width: 390, height: 844 };
  const player = { x: 900, y: 1600 };
  const fresh = (): CameraRig => new CameraRig({ center: snapCenter(player, view), zoom: cameraZoom(view) });
  const step = (rig: CameraRig, cursor: number | null, over: { dt?: number; snap?: boolean; reduce?: boolean } = {}): CameraPose => {
    const f = bellFollowOf(W4, { cursor })!;
    return rig.step({ dt: over.dt ?? 1 / 60, view, target: player, frame: f.rect, focus: f.focus, topInset: MENU_BAND, ...frameTuningOf(W4), bottomInset: 300, snap: over.snap ?? false, reduce: over.reduce ?? false });
  };

  it('바로 이동(snap)과 움직임 줄이기에서는 보간 없이 고른 나무의 자세에 도착한다', () => {
    for (const mode of [{ snap: true }, { reduce: true }]) {
      const rig = fresh();
      expect(step(rig, 9, mode)).toEqual(gladePose(view, 300, 9));
      // 나무를 건너뛰어도 바로 옮겨 간다
      expect(step(rig, 1, mode)).toEqual(gladePose(view, 300, 1));
    }
  });

  it('들어온 뒤 나무를 건너뛰면 카메라가 부드럽게 옮겨 가서 결국 그 나무의 자세에 닿는다', () => {
    const rig = fresh();
    // 들어오는 0.3초 동안은 설치물을 담는 자세로 옮겨 간다
    for (let i = 0; i < 30; i++) step(rig, 0);
    expect(rig.pose).toEqual(gladePose(view, 300, 0));
    const before = rig.pose.center.x;
    step(rig, 5);
    const mid = rig.pose.center.x;
    expect(mid).toBeGreaterThan(before);
    expect(mid).toBeLessThan(gladePose(view, 300, 5).center.x);
    for (let i = 0; i < 120; i++) step(rig, 5);
    expect(rig.pose.center.x).toBeCloseTo(gladePose(view, 300, 5).center.x, 6);
    expect(rig.pose.zoom).toBeCloseTo(MIN_ZOOM, 9);
  });

  it('나무 하나(W1)도 같다: 바로 이동하면 전체를 메뉴 띠 아래에 담은 자세에 도착하고, 단을 옮기면 막대가 클 때만 카메라가 따라간다', () => {
    const desktop = { width: 1280, height: 720 };
    const stepW1 = (rig: CameraRig, octave: number, bar: number): CameraPose => {
      const f = bellFollowOf(W1, { cursor: 0, cursorOctave: octave })!;
      return rig.step({ dt: 1 / 60, view: desktop, target: player, frame: f.rect, focus: f.focus, topInset: MENU_BAND, ...frameTuningOf(W1), bottomInset: bar, snap: true, reduce: false });
    };
    const rig = new CameraRig({ center: snapCenter(player, desktop), zoom: cameraZoom(desktop) });
    const a = stepW1(rig, 5, 400);
    expect(a).toEqual(poseOf(W1, desktop, 400, { cursor: 0, cursorOctave: 5 }));
    expect(inside(usableWindow(a, desktop, 400), slotBounds(W1))).toBe(true);
    expect(stepW1(rig, 2, 400)).toEqual(a);
    const low = stepW1(rig, 2, 452);
    const high = stepW1(rig, 5, 452);
    expect(low.center.y).toBeGreaterThan(high.center.y);
  });
});
