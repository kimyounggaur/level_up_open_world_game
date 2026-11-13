// 7-3 건반 다리를 담는 카메라(domain/keyBridge.ts의 bridgeFollowOf, world/camera.ts의 followPose, WorldScene의 연결).
// 설계서 7.3: 자리 하나가 화면에서 48 px보다 작아지면 더 줄이지 않고 선택한 자리를 따라간다. 흰 널 한 장(72 px)은 어느 화면에서나 48 px 이상으로 보이고,
// 다리가 화면(조작 막대 위)에 다 들어오는 곳(노트북, 태블릿)에서는 전체를 가운데에 담으며, 들어오지 않는 곳(휴대폰, 조작 막대가 높은 작은 화면)에서는 널 위 커서가 선 널을 비춘다.
// 실제 Chrome에서 폭 390 px 휴대폰의 흰 널이 26 px로 줄어든 것을 찾아낸 뒤 고친 것이라, 그때 읽은 화면 크기와 조작 막대 높이를 그대로 쓴다(tests/flow/phase7-key-bridge.flow.ts).
import { describe, expect, it } from 'vitest';
import { frameTuningOf } from '@/domain/installation';
import { BRIDGE_FRAME_PAD, BRIDGE_MIN_ZOOM, PLANK_WHITE_W, bridgeBounds, bridgeFitsScreen, bridgeFollowOf, planksOfInstallation } from '@/domain/keyBridge';
import type { BridgeScreen } from '@/domain/keyBridge';
import { CameraRig, MENU_BAND, followPose } from '@/world/camera';
import type { CameraPose, ViewSize } from '@/world/camera';
import { installation } from './controller-rig';

const K1 = installation('inst.key-marsh.key-bridge');
const K2 = installation('inst.key-marsh.interval-rope');
const K3 = installation('inst.key-marsh.natural-bridge');
const K4 = installation('inst.key-marsh.chromatic-path');
const BRIDGES = [
  { code: 'K1', inst: K1 },
  { code: 'K2', inst: K2 },
  { code: 'K3', inst: K3 },
];

interface Screen {
  name: string;
  view: ViewSize;
  /** 조작 막대가 가리는 높이(화면 px) */
  bar: number;
  /** 읽지 않고 정한 값이면 true */
  assumed?: boolean;
}

/**
 * 실제 Chrome(헤드리스)에서 과제를 고른 뒤 읽은 조작 막대의 높이(화면 px, 세로 화면은 아래 탭 막대 64 px를 포함한다).
 * 막대는 설치물마다 다르지만 가장 큰 쪽(이름 과제 K1)을 모든 다리에 쓴다: 막대가 클수록 다리가 들어오기 어려운 쪽이라 더 엄격한 검사다.
 * 태블릿 세로만 읽지 않고 정한 값이다.
 */
const SCREENS: Screen[] = [
  { name: '휴대폰 세로 390×844', view: { width: 390, height: 844 }, bar: 614 },
  { name: '휴대폰 가로 844×390', view: { width: 844, height: 390 }, bar: 299 },
  { name: '작은 휴대폰 360×640', view: { width: 360, height: 640 }, bar: 614 },
  { name: '태블릿 세로 768×1024', view: { width: 768, height: 1024 }, bar: 420, assumed: true },
  { name: '노트북 1280×720', view: { width: 1280, height: 720 }, bar: 399 },
  { name: '큰 화면 1920×1080', view: { width: 1920, height: 1080 }, bar: 399 },
];
const PHONE = SCREENS[0]!;
const PHONE_WIDE = SCREENS[1]!;
const PHONE_SMALL = SCREENS[2]!;
const LAPTOP = SCREENS[4]!;
const BIG = SCREENS[5]!;

const screenOf = (s: Pick<Screen, 'view' | 'bar'>): BridgeScreen => ({ width: s.view.width, height: s.view.height, bottomInset: s.bar });

/** WorldScene이 하는 대로: bridgeFollowOf의 목표를 followPose에 넣는다. 메뉴 띠는 다리가 화면에 다 들어오지 않을 때만 비운다 */
function poseOf(inst: typeof K1, s: Pick<Screen, 'view' | 'bar'>, cursor: number | null): { pose: CameraPose; top: number } {
  const f = bridgeFollowOf(inst, { cursor }, screenOf(s))!;
  const top = f.reserveMenu ? MENU_BAND : 0;
  return { pose: followPose(f.rect, f.focus, s.view, { ...frameTuningOf(inst), topInset: top, bottomInset: s.bar }), top };
}

/** 월드 좌표가 화면의 어디에 그려지는가(화면 px, 왼쪽 위가 0) */
const sx = (pose: CameraPose, view: ViewSize, x: number): number => view.width / 2 + (x - pose.center.x) * pose.zoom;
const sy = (pose: CameraPose, view: ViewSize, y: number): number => view.height / 2 + (y - pose.center.y) * pose.zoom;

/** 흰 널 줄의 세로 가운데(월드) */
function rowMid(inst: typeof K1): number {
  const whites = planksOfInstallation(inst).filter((p) => !p.black).map((p) => p.rect);
  return (Math.min(...whites.map((r) => r.y)) + Math.max(...whites.map((r) => r.y + r.h))) / 2;
}

describe('bridgeFitsScreen: 다리가 흰 널 48 px 배율로 이 화면의 조작 막대 위에 다 들어오는가', () => {
  it('흰 널 한 장은 이 배율에서 48 px이다', () => {
    expect(BRIDGE_MIN_ZOOM * PLANK_WHITE_W).toBeCloseTo(48, 9);
  });

  it('너비는 둘레의 여유까지 본다: K1은 763 px부터, K2·K3은 427 px부터다', () => {
    // K1: (1080 + 2×32) × 2/3 = 762.67 px, K2·K3: (576 + 64) × 2/3 = 426.67 px
    expect((1080 + 2 * BRIDGE_FRAME_PAD) * BRIDGE_MIN_ZOOM).toBeCloseTo(762.667, 3);
    expect(bridgeFitsScreen(bridgeBounds(K1), { width: 763, height: 2000, bottomInset: 0 })).toBe(true);
    expect(bridgeFitsScreen(bridgeBounds(K1), { width: 762, height: 2000, bottomInset: 0 })).toBe(false);
    for (const inst of [K2, K3]) {
      expect(bridgeFitsScreen(bridgeBounds(inst), { width: 427, height: 2000, bottomInset: 0 })).toBe(true);
      expect(bridgeFitsScreen(bridgeBounds(inst), { width: 426, height: 2000, bottomInset: 0 })).toBe(false);
    }
  });

  it('높이는 띠만 본다(여유 없이): 막대 위의 높이가 다리 높이(448 px)의 2/3, 298.7 px 이상이어야 한다', () => {
    for (const { code, inst } of BRIDGES) expect(bridgeBounds(inst).h, code).toBe(448);
    expect(bridgeFitsScreen(bridgeBounds(K1), { width: 1280, height: 720, bottomInset: 421 })).toBe(true); // 299 px
    expect(bridgeFitsScreen(bridgeBounds(K1), { width: 1280, height: 720, bottomInset: 422 })).toBe(false); // 298 px
    // 막대 높이는 화면의 9할까지만 믿는다(followPose와 같다): 막대가 5000 px라고 해도 72 px뿐이다
    expect(bridgeFitsScreen(bridgeBounds(K1), { width: 1280, height: 720, bottomInset: 5000 })).toBe(false);
    expect(bridgeFitsScreen(bridgeBounds(K1), { width: 1280, height: 720, bottomInset: -50 })).toBe(true);
  });
});

describe('bridgeFollowOf: 카메라가 담으려는 것', () => {
  it('건반 다리가 아닌 설치물(반음 계단, 마을 디딤돌)은 null이다', () => {
    expect(bridgeFollowOf(K4, { cursor: 3 }, screenOf(LAPTOP))).toBeNull();
    expect(bridgeFollowOf(installation('inst.village.scale-stones'), null, screenOf(LAPTOP))).toBeNull();
  });

  it('담을 곳(rect)은 위쪽 띠와 아래쪽 이름 띠까지 포함한 다리 전체(bridgeBounds)다', () => {
    for (const { code, inst } of BRIDGES) {
      for (const s of [LAPTOP, PHONE]) expect(bridgeFollowOf(inst, null, screenOf(s))!.rect, `${code} ${s.name}`).toEqual(bridgeBounds(inst));
    }
  });

  it('다리가 화면에 다 들어오면 focus는 다리 전체의 가운데이고 어느 널을 골라도 같다', () => {
    for (const { code, inst } of BRIDGES) {
      const b = bridgeBounds(inst);
      const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      for (const s of [LAPTOP, BIG]) {
        for (const cursor of [null, 1, 7, planksOfInstallation(inst).length]) {
          const f = bridgeFollowOf(inst, { cursor }, screenOf(s))!;
          expect(f.focus, `${code} ${s.name} 커서 ${cursor}`).toEqual(center);
          expect(f.reserveMenu).toBe(false);
        }
      }
    }
  });

  it('들어오지 않으면 가로는 고른 널의 가운데(커서가 없으면 다리 가운데), 세로는 늘 흰 널 줄의 가운데다', () => {
    const screen = screenOf(PHONE);
    const planks = planksOfInstallation(K1);
    const none = bridgeFollowOf(K1, null, screen)!;
    expect(none.focus.x).toBe(bridgeBounds(K1).x + bridgeBounds(K1).w / 2);
    expect(bridgeFollowOf(K1, { cursor: null }, screen)!.focus).toEqual(none.focus);
    expect(none.focus.y).toBe(rowMid(K1));
    // 1번 널(흰 C4)과 25번 널(흰 C6)과 2번 널(검은 C♯4)
    expect(bridgeFollowOf(K1, { cursor: 1 }, screen)!.focus).toEqual({ x: 1760 + 36, y: rowMid(K1) });
    expect(bridgeFollowOf(K1, { cursor: 25 }, screen)!.focus).toEqual({ x: 2768 + 36, y: rowMid(K1) });
    const black = planks.find((p) => p.slot === 2)!;
    expect(black.black).toBe(true);
    expect(bridgeFollowOf(K1, { cursor: 2 }, screen)!.focus).toEqual({ x: black.rect.x + black.rect.w / 2, y: rowMid(K1) });
    // 없는 널 번호는 커서가 없는 것과 같다
    expect(bridgeFollowOf(K1, { cursor: 99 }, screen)!.focus).toEqual(none.focus);
    expect(bridgeFollowOf(K3, { cursor: 7 }, screen)!.focus).toEqual({ x: 3200, y: 5920 });
  });

  it('위쪽 메뉴 띠는 다리가 화면(조작 막대 위)에 다 들어오지 않을 때만 비운다(실제 Chrome에서 읽은 화면과 막대 높이)', () => {
    for (const { code, inst } of BRIDGES) {
      // 노트북(1280×720, K1 막대 399 px)과 큰 화면과 태블릿 세로: 다리 전체가 막대 위에 들어온다 → 메뉴 띠를 비우지 않는다
      for (const s of [LAPTOP, BIG, SCREENS[3]!]) expect(bridgeFollowOf(inst, null, screenOf(s))!.reserveMenu, `${s.name} ${code}`).toBe(false);
      // 휴대폰 세로·작은 휴대폰(너비가 모자란다), 휴대폰 가로(너비는 되지만 막대 위의 높이가 91 px뿐이다) → 널이 메뉴 단추 뒤로 가려지지 않게 띠 아래에 비춘다
      for (const s of [PHONE, PHONE_WIDE, PHONE_SMALL]) expect(bridgeFollowOf(inst, null, screenOf(s))!.reserveMenu, `${s.name} ${code}`).toBe(true);
    }
    // K3 막대를 실제로 읽은 값(노트북 331 px)에서도 같다
    expect(bridgeFollowOf(K3, null, { width: 1280, height: 720, bottomInset: 331 })!.reserveMenu).toBe(false);
  });
});

describe('어느 화면에서나 흰 널 한 장은 48 px 아래로 줄지 않는다(7.3, 7.6)', () => {
  for (const s of SCREENS) {
    for (const { code, inst } of BRIDGES) {
      it(`${s.name}${s.assumed ? '(가정)' : ''} ${code}: 널이 화면에서 48 px 이상이고, 고른 널이 가로로 온전히 보이며 널 줄이 메뉴 띠와 조작 막대 사이에 있다`, () => {
        const planks = planksOfInstallation(inst);
        for (const cursor of [null, 1, Math.ceil(planks.length / 2), planks.length]) {
          const { pose, top } = poseOf(inst, s, cursor);
          expect(pose.zoom * PLANK_WHITE_W, `널 너비 (커서 ${cursor})`).toBeGreaterThanOrEqual(48 - 1e-6);
          if (cursor === null) continue;
          const p = planks.find((x) => x.slot === cursor)!.rect;
          expect(sx(pose, s.view, p.x), `${cursor}번 널 왼쪽`).toBeGreaterThanOrEqual(-1e-6);
          expect(sx(pose, s.view, p.x + p.w), `${cursor}번 널 오른쪽`).toBeLessThanOrEqual(s.view.width + 1e-6);
          // 메뉴 띠를 빼고 막대 위에 남는 자리가 있으면 널 줄의 가운데는 그 안에 있다
          if (s.view.height - s.bar - top > 0) {
            const y = sy(pose, s.view, rowMid(inst));
            expect(y, `${cursor}번 널 줄 가운데`).toBeGreaterThanOrEqual(top - 1e-6);
            expect(y).toBeLessThanOrEqual(s.view.height - s.bar + 1e-6);
          }
        }
      });
    }
  }

  it('작은 휴대폰 360×640은 조작 막대(614 px)가 메뉴 띠를 뺀 화면보다 크다: 월드가 막대 뒤로 가려지고 널은 막대의 ◀ ▶ 단추로 고른다(알려진 한계)', () => {
    expect(PHONE_SMALL.view.height - PHONE_SMALL.bar - MENU_BAND).toBeLessThan(0);
    // 그래도 카메라는 배율(48 px)과 가로 위치를 지킨다
    for (const cursor of [1, 13, 25]) {
      const { pose } = poseOf(K1, PHONE_SMALL, cursor);
      expect(pose.zoom * PLANK_WHITE_W).toBeGreaterThanOrEqual(48 - 1e-6);
    }
  });

  it('다리가 화면에 다 들어오는 곳(노트북, 큰 화면, 태블릿)에서는 어느 널을 골라도 같은 자세이고 다리 전체(위쪽 띠와 흰 널 이름 띠까지)가 막대 위에 들어온다', () => {
    const edge: Screen = { name: '경계 1280×700(막대 위 299 px)', view: { width: 1280, height: 700 }, bar: 401, assumed: true };
    const tabletWide: Screen = { name: '태블릿 가로 1024×768', view: { width: 1024, height: 768 }, bar: 380, assumed: true };
    for (const s of [LAPTOP, BIG, SCREENS[3]!, tabletWide, edge]) {
      for (const { code, inst } of BRIDGES) {
        const planks = planksOfInstallation(inst);
        const poses = [null, 1, Math.ceil(planks.length / 2), planks.length].map((c) => poseOf(inst, s, c));
        for (const q of poses) expect(q.pose, `${s.name} ${code}`).toEqual(poses[0]!.pose);
        expect(poses[0]!.top, `${s.name} ${code}: 메뉴 띠를 비우지 않는다`).toBe(0);
        const pose = poses[0]!.pose;
        const b = bridgeBounds(inst);
        expect(sx(pose, s.view, b.x), `${s.name} ${code} 왼쪽`).toBeGreaterThanOrEqual(-1e-6);
        expect(sx(pose, s.view, b.x + b.w), `${s.name} ${code} 오른쪽`).toBeLessThanOrEqual(s.view.width + 1e-6);
        expect(sy(pose, s.view, b.y), `${s.name} ${code} 위쪽 띠`).toBeGreaterThanOrEqual(-1e-6);
        expect(sy(pose, s.view, b.y + b.h), `${s.name} ${code} 흰 널 이름 띠`).toBeLessThanOrEqual(s.view.height - s.bar + 1e-6);
      }
    }
    // 경계에서 1 px만 더 가려도(막대 402 px) 들어오지 않는 쪽으로 넘어간다
    expect(bridgeFollowOf(K1, null, screenOf({ view: edge.view, bar: 402 }))!.reserveMenu).toBe(true);
  });

  it('K1이 너비에 다 들어오지 않는 좁은 휴대폰(폭 763 px 아래)에서는 배율이 같고 카메라가 고른 널을 따라 오른쪽으로 옮겨 간다', () => {
    const narrow = SCREENS.filter((x) => x.view.width < 763);
    expect(narrow.map((x) => x.view.width)).toEqual([390, 360]);
    const b = bridgeBounds(K1);
    for (const s of narrow) {
      const poses = [1, 7, 13, 19, 25].map((c) => poseOf(K1, s, c).pose);
      for (const q of poses) expect(q.zoom, s.name).toBeCloseTo(BRIDGE_MIN_ZOOM, 9);
      for (let i = 1; i < poses.length; i++) expect(poses[i]!.center.x, `${s.name} ${i}`).toBeGreaterThan(poses[i - 1]!.center.x);
      // 왼쪽 끝 널을 골라도 다리 왼쪽 밖을 비추지 않고, 오른쪽 끝 널도 같다(여유 32 px까지)
      const leftEdge = poses[0]!.center.x - s.view.width / 2 / poses[0]!.zoom;
      const rightEdge = poses[4]!.center.x + s.view.width / 2 / poses[4]!.zoom;
      expect(leftEdge, s.name).toBeGreaterThanOrEqual(b.x - BRIDGE_FRAME_PAD - 1e-6);
      expect(rightEdge, s.name).toBeLessThanOrEqual(b.x + b.w + BRIDGE_FRAME_PAD + 1e-6);
    }
  });

  it('휴대폰 가로(844×390)는 너비에는 다리가 들어오지만 막대 위의 높이가 모자라 메뉴 띠 아래의 얇은 띠에 널 줄을 비춘다', () => {
    const s = PHONE_WIDE;
    const f = bridgeFollowOf(K1, { cursor: 7 }, screenOf(s))!;
    expect(f.reserveMenu).toBe(true);
    const { pose, top } = poseOf(K1, s, 7);
    expect(pose.zoom).toBeCloseTo(BRIDGE_MIN_ZOOM, 9);
    expect(top).toBe(MENU_BAND);
    // 메뉴 띠(64)와 막대의 윗선(390 − 299 = 91) 사이의 27 px 안에 널 줄의 가운데가 있다
    const y = sy(pose, s.view, rowMid(K1));
    expect(y).toBeGreaterThanOrEqual(MENU_BAND);
    expect(y).toBeLessThanOrEqual(s.view.height - s.bar);
    // 너비에는 다리 전체가 들어와 있다
    const b = bridgeBounds(K1);
    expect(sx(pose, s.view, b.x)).toBeGreaterThanOrEqual(-1e-6);
    expect(sx(pose, s.view, b.x + b.w)).toBeLessThanOrEqual(s.view.width + 1e-6);
  });
});

describe('카메라 장치(CameraRig)도 같은 자세를 쓴다', () => {
  it('설치물 모드에 들어가면(바로 이동) 휴대폰에서도 흰 널이 48 px이고, 커서가 오른쪽 끝 널로 가면 따라간다', () => {
    const rig = new CameraRig({ center: { x: 1800, y: 5400 }, zoom: 1 });
    const step = (cursor: number | null): CameraPose => {
      const f = bridgeFollowOf(K1, { cursor }, screenOf(PHONE))!;
      return rig.step({ dt: 1, view: PHONE.view, target: { x: 1800, y: 5400 }, frame: f.rect, focus: f.focus, topInset: f.reserveMenu ? MENU_BAND : 0, ...frameTuningOf(K1), bottomInset: PHONE.bar, snap: true, reduce: false });
    };
    const first = step(1);
    expect(first.zoom * PLANK_WHITE_W).toBeGreaterThanOrEqual(48 - 1e-6);
    const last = step(25);
    expect(last.zoom).toBeCloseTo(first.zoom, 9);
    expect(last.center.x).toBeGreaterThan(first.center.x + 300);
    expect(poseOf(K1, PHONE, 25).pose).toEqual(last);
    expect(rig.framing).toBe(true);
  });

  it('노트북에서는 커서가 어디에 있어도 카메라가 움직이지 않는다', () => {
    const rig = new CameraRig({ center: { x: 1800, y: 5400 }, zoom: 1 });
    const step = (cursor: number | null): CameraPose => {
      const f = bridgeFollowOf(K1, { cursor }, screenOf(LAPTOP))!;
      return rig.step({ dt: 1, view: LAPTOP.view, target: { x: 1800, y: 5400 }, frame: f.rect, focus: f.focus, topInset: f.reserveMenu ? MENU_BAND : 0, ...frameTuningOf(K1), bottomInset: LAPTOP.bar, snap: true, reduce: false });
    };
    const first = step(null);
    for (const cursor of [1, 13, 25]) expect(step(cursor)).toEqual(first);
  });
});
