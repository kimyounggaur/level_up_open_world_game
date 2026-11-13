// 8-4 화면 밖 그림 건너뛰기(world/cull.ts)와 그것을 쓰는 설치물 층.
// 규칙: 화면(카메라가 보는 월드 사각형 + CULL_MARGIN)에 닿지 않는 그래픽은 카메라 필터로 거르고, 화면 밖 설치물은 그리는 호출만 건너뛴다.
// 건너뛰는 것은 그리는 일뿐이다: 설치물의 '그린 기록'(debug)과 글자의 자리는 화면 밖이어도 그대로 계산한다(낭독기와 점검이 읽는다).
// Phaser 없이 가짜 장면으로 시험한다. 실제 화면에서 끈 것과 켠 것이 같은 그림인지는 브라우저 흐름 시험(tests/flow/cull.flow.ts)이 화소로 본다.
import { describe, expect, it } from 'vitest';
import { WorldBridge } from '@/platform/bridge';
import type { SlotMark } from '@/platform/bridge';
import type { InstallationDef } from '@/domain/installation';
import { CULL_MARGIN, NO_DRAW, ViewCull, footBox, grow, overlaps } from '@/world/cull';
import { InstallationLayer } from '@/world/installations/layer';
import { installation } from './controller-rig';
import { FakeScene, fakeCull } from './fake-phaser';

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
const thing = (cameraFilter = 0) => ({ cameraFilter });

describe('사각형 계산', () => {
  it('맞닿으면 겹친 것으로 보고, 떨어져 있으면 아니다', () => {
    expect(overlaps(box(0, 0, 10, 10), box(10, 10, 20, 20))).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(11, 0, 20, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(0, -20, 10, -1))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(3, 3, 4, 4))).toBe(true);
  });

  it('grow는 사방으로 넓히고, footBox는 발치 둘레의 넉넉한 범위다(게시판 ±75, 위로 98을 담는다)', () => {
    expect(grow(box(0, 0, 10, 10), 5)).toEqual(box(-5, -5, 15, 15));
    const b = footBox(1000, 2000);
    expect(b.x0).toBeLessThanOrEqual(1000 - 75);
    expect(b.x1).toBeGreaterThanOrEqual(1000 + 75);
    expect(b.y0).toBeLessThanOrEqual(2000 - 98);
    expect(b.y1).toBeGreaterThanOrEqual(2000 + 11);
  });
});

describe('ViewCull: 정적 그래픽을 카메라 필터로 거른다', () => {
  const make = () => {
    const cull = new ViewCull({ id: 1 } as never);
    return cull;
  };

  it('화면을 알려 주기 전에는 아무것도 거르지 않고 모두 보인다고 답한다', () => {
    const cull = make();
    const a = thing();
    cull.track(a as never, box(5000, 5000, 5100, 5100));
    expect(a.cameraFilter).toBe(0);
    expect(cull.sees(box(-1e9, -1e9, -1e9 + 1, -1e9 + 1))).toBe(true);
  });

  it('화면 + 여유에 닿지 않으면 월드 카메라의 비트를 켜서 거르고, 닿으면 다시 끈다', () => {
    const cull = make();
    const a = thing();
    cull.track(a as never, box(0, 0, 100, 100));
    cull.update({ x: 1000, y: 0, w: 500, h: 500 });
    expect(a.cameraFilter).toBe(1);
    expect(cull.stats()).toEqual({ enabled: true, tracked: 1, hidden: 1 });
    // 카메라가 그래픽 쪽으로 돌아오면 다시 켠다
    cull.update({ x: 0, y: 0, w: 500, h: 500 });
    expect(a.cameraFilter).toBe(0);
    expect(cull.stats().hidden).toBe(0);
  });

  it('여유 바로 밖은 거르고 바로 안은 거르지 않는다', () => {
    const cull = make();
    const a = thing();
    cull.track(a as never, box(0, 0, 100, 100));
    // 화면의 왼쪽 가장자리가 x = 100 + 여유 + 1이면 사각형 오른쪽 끝(100)과 여유를 더해도 닿지 않는다
    cull.update({ x: 100 + CULL_MARGIN + 1, y: 0, w: 300, h: 300 });
    expect(a.cameraFilter).toBe(1);
    cull.update({ x: 100 + CULL_MARGIN, y: 0, w: 300, h: 300 });
    expect(a.cameraFilter).toBe(0);
  });

  it('다른 카메라의 비트는 건드리지 않는다', () => {
    const cull = make();
    const a = thing(2);
    cull.track(a as never, box(0, 0, 10, 10));
    cull.update({ x: 5000, y: 5000, w: 100, h: 100 });
    expect(a.cameraFilter).toBe(3);
    cull.update({ x: 0, y: 0, w: 100, h: 100 });
    expect(a.cameraFilter).toBe(2);
  });

  it('enabled를 끄면 모두 다시 보이고 sees는 늘 참이다(걸러 내지 않은 화면과 견주는 점검용)', () => {
    const cull = make();
    const a = thing();
    cull.track(a as never, box(0, 0, 10, 10));
    cull.update({ x: 5000, y: 5000, w: 100, h: 100 });
    expect(a.cameraFilter).toBe(1);
    expect(cull.sees(box(0, 0, 10, 10))).toBe(false);
    cull.enabled = false;
    cull.update({ x: 5000, y: 5000, w: 100, h: 100 });
    expect(a.cameraFilter).toBe(0);
    expect(cull.sees(box(0, 0, 10, 10))).toBe(true);
    expect(cull.stats()).toEqual({ enabled: false, tracked: 1, hidden: 0 });
  });

  it('untrack은 거른 채로 두지 않고 되돌린다', () => {
    const cull = make();
    const a = thing();
    cull.track(a as never, box(0, 0, 10, 10));
    cull.update({ x: 5000, y: 5000, w: 100, h: 100 });
    expect(a.cameraFilter).toBe(1);
    cull.untrack(a as never);
    expect(a.cameraFilter).toBe(0);
    expect(cull.stats().tracked).toBe(0);
    // 맡기지 않은 것을 걷어도 아무 일이 없다
    expect(() => cull.untrack(thing() as never)).not.toThrow();
  });

  it('바로 이동해 화면이 크게 바뀌어도 같은 update에서 새 자리의 것이 켜진다(한 프레임 늦지 않는다)', () => {
    const cull = make();
    const near = thing();
    const far = thing();
    cull.track(near as never, box(0, 0, 100, 100));
    cull.track(far as never, box(7000, 5000, 7100, 5100));
    cull.update({ x: 0, y: 0, w: 1280, h: 720 });
    expect([near.cameraFilter, far.cameraFilter]).toEqual([0, 1]);
    cull.update({ x: 6800, y: 4900, w: 1280, h: 720 });
    expect([near.cameraFilter, far.cameraFilter]).toEqual([1, 0]);
  });
});

describe('NO_DRAW: 화면 밖 설치물이 부르는 그리기를 받아 버린다', () => {
  it('어떤 메서드든 이어 불러도 던지지 않고, 자기 자신이 이어진다', () => {
    const g = NO_DRAW;
    expect(() => g.fillStyle(0xffffff, 1).fillRoundedRect(0, 0, 10, 10, 4).lineStyle(2, 0, 1).strokeRoundedRect(0, 0, 10, 10, 4).lineBetween(0, 0, 1, 1)).not.toThrow();
    expect(g.fillStyle(0, 1)).toBe(g);
    expect(() => {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(1, 1);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }).not.toThrow();
  });

  it('약속(Promise)처럼 다뤄지지 않는다', () => {
    expect((NO_DRAW as unknown as { then?: unknown }).then).toBeUndefined();
  });
});

// ───── 설치물 층: 화면 밖 설치물은 그리는 호출만 건너뛴다 ─────

const A = installation('inst.village.scale-stones');
const B = installation('inst.scale-trail.major-path');
/** A는 (4575–5268, 3579), B는 (5550–6243, 4724): 세로로 1100 px 넘게 떨어져 있다 */
const VIEW_A = { x: 4400, y: 3400, w: 1000, h: 400 };
const VIEW_B = { x: 5500, y: 4500, w: 900, h: 450 };

const placed = (inst: InstallationDef): SlotMark[] => inst.slots.map((s) => ({ slot: s.slot, name: 'C4', midi: 60, flagged: false, selected: false, playing: false }));

function rig() {
  const scene = new FakeScene();
  const bridge = new WorldBridge({ x: 0, y: 0, facing: 'down' });
  bridge.installationViews.set([
    { installationId: A.installationId, slots: placed(A) },
    { installationId: B.installationId, slots: placed(B) },
  ]);
  const cull = fakeCull();
  const layer = new InstallationLayer(scene as never, [A, B], bridge, cull);
  const g = scene.graphics[0]!;
  const frame = (): Array<{ name: string; args: unknown[] }> => {
    g.reset();
    layer.update(0, false);
    return [...g.log];
  };
  return { scene, bridge, cull, layer, g, frame };
}

describe('설치물 층: 화면 밖 설치물은 그리는 호출만 건너뛴다', () => {
  it('화면을 알려 주기 전에는 두 설치물을 모두 그린다', () => {
    const t = rig();
    const log = t.frame();
    expect(log.filter((c) => c.name === 'fillRoundedRect')).toHaveLength(A.slots.length + B.slots.length);
    expect(t.layer.skippedCount()).toBe(0);
  });

  it('A만 화면에 닿으면 A의 호출만 남고, B는 건너뛴다. 남은 호출은 모두 켰을 때의 앞부분(A)과 같다', () => {
    const t = rig();
    const all = t.frame();
    t.cull.update(VIEW_A);
    const onlyA = t.frame();
    expect(t.layer.skippedCount()).toBe(1);
    expect(onlyA.filter((c) => c.name === 'fillRoundedRect')).toHaveLength(A.slots.length);
    expect(onlyA.length).toBeLessThan(all.length);
    expect(onlyA).toEqual(all.slice(0, onlyA.length));
  });

  it('B만 화면에 닿으면 B의 호출만 남는다(두 설치물이 서로 가리지 않는다)', () => {
    const t = rig();
    t.cull.update(VIEW_B);
    const onlyB = t.frame();
    expect(t.layer.skippedCount()).toBe(1);
    const xs = onlyB.filter((c) => c.name === 'fillRoundedRect').map((c) => c.args[0] as number);
    expect(xs).toHaveLength(B.slots.length);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(5500);
  });

  it('둘 다 화면 밖이면 둘 다 건너뛴다', () => {
    const t = rig();
    t.cull.update({ x: 0, y: 0, w: 800, h: 600 });
    const none = t.frame();
    expect(none.filter((c) => c.name === 'fillRoundedRect')).toHaveLength(0);
    expect(t.layer.skippedCount()).toBe(2);
  });

  it('건너뛰어도 그린 기록(debug)과 글자의 자리는 그대로 계산한다', () => {
    const t = rig();
    t.frame();
    const full = JSON.stringify(t.layer.debug());
    const fullTexts = t.scene.texts.map((x) => [x.visible, x.content, x.x, x.y]);
    t.cull.update({ x: 0, y: 0, w: 800, h: 600 });
    t.frame();
    expect(t.layer.skippedCount()).toBe(2);
    expect(JSON.stringify(t.layer.debug())).toBe(full);
    expect(t.scene.texts.map((x) => [x.visible, x.content, x.x, x.y])).toEqual(fullTexts);
  });

  it('enabled를 끄면 화면 밖이어도 모두 그린다', () => {
    const t = rig();
    t.cull.update(VIEW_A);
    t.cull.enabled = false;
    t.cull.update(VIEW_A);
    const log = t.frame();
    expect(log.filter((c) => c.name === 'fillRoundedRect')).toHaveLength(A.slots.length + B.slots.length);
    expect(t.layer.skippedCount()).toBe(0);
  });
});
