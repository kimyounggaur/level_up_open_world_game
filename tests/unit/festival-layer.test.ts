// 월드의 악사 층(world/festival/layer.ts): 다리의 festival을 읽어 악사를 세우고 내리고, 박마다 뛰게 한다.
// Phaser 없이 가짜 장면(그리기 호출을 기록만 하는 가짜 Graphics)으로 시험한다. 실제 화면은 브라우저 흐름 시험이 본다.
import { describe, expect, it } from 'vitest';
import { MUSICIAN_NAME_KO, MUSICIAN_ORDER, musicianSpots, stageFloorOf } from '@/domain/festival';
import type { MusicianPart, StageFloor } from '@/domain/festival';
import { BAR_SEC } from '@/domain/worldsound';
import { NO_FESTIVAL, WorldBridge } from '@/platform/bridge';
import { FestivalLayer, MUSICIAN_HOP } from '@/world/festival/layer';
import { installation as installationOf } from './controller-rig';

/** 그리기 호출은 모두 받아서 자기 자신을 돌려 주는 가짜 Graphics. 위치, 깊이, 부서졌는지만 기억한다 */
class FakeGraphics {
  x = 0;
  y = 0;
  depth = 0;
  destroyed = false;
  calls: string[] = [];
  constructor() {
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        return (..._args: unknown[]) => {
          target.calls.push(String(prop));
          return receiver;
        };
      },
    });
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setY(y: number): this {
    this.y = y;
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakeScene {
  made: FakeGraphics[] = [];
  add = {
    graphics: (): FakeGraphics => {
      const g = new FakeGraphics();
      this.made.push(g);
      return g;
    },
  };
  get alive(): FakeGraphics[] {
    return this.made.filter((g) => !g.destroyed);
  }
}

/** 그린 모양의 겉 상자(그린 자리의 가로세로 범위)를 기록하는 가짜 Graphics. 그림자처럼 반투명한 것은 faint로 적어 둔다 */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  faint: boolean;
}

class ShapeGraphics {
  x = 0;
  y = 0;
  depth = 0;
  destroyed = false;
  boxes: Box[] = [];
  private alpha = 1;
  private width = 0;
  private path: Array<[number, number]> = [];
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setY(y: number): this {
    this.y = y;
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
  fillStyle(_color: number, alpha = 1): this {
    this.alpha = alpha;
    return this;
  }
  lineStyle(width: number, _color: number, _alpha = 1): this {
    this.width = width;
    return this;
  }
  private box(x0: number, y0: number, x1: number, y1: number, stroke: boolean): this {
    const w = stroke ? this.width / 2 : 0;
    this.boxes.push({ x0: Math.min(x0, x1) - w, y0: Math.min(y0, y1) - w, x1: Math.max(x0, x1) + w, y1: Math.max(y0, y1) + w, faint: !stroke && this.alpha < 1 });
    return this;
  }
  fillRect(x: number, y: number, w: number, h: number): this {
    return this.box(x, y, x + w, y + h, false);
  }
  strokeRect(x: number, y: number, w: number, h: number): this {
    return this.box(x, y, x + w, y + h, true);
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, _r?: number): this {
    return this.box(x, y, x + w, y + h, false);
  }
  strokeRoundedRect(x: number, y: number, w: number, h: number, _r?: number): this {
    return this.box(x, y, x + w, y + h, true);
  }
  fillCircle(x: number, y: number, r: number): this {
    return this.box(x - r, y - r, x + r, y + r, false);
  }
  strokeCircle(x: number, y: number, r: number): this {
    return this.box(x - r, y - r, x + r, y + r, true);
  }
  fillEllipse(x: number, y: number, w: number, h: number): this {
    return this.box(x - w / 2, y - h / 2, x + w / 2, y + h / 2, false);
  }
  strokeEllipse(x: number, y: number, w: number, h: number): this {
    return this.box(x - w / 2, y - h / 2, x + w / 2, y + h / 2, true);
  }
  strokeTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this {
    return this.box(Math.min(x1, x2, x3), Math.min(y1, y2, y3), Math.max(x1, x2, x3), Math.max(y1, y2, y3), true);
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.box(x1, y1, x2, y2, true);
  }
  beginPath(): this {
    this.path = [];
    return this;
  }
  moveTo(x: number, y: number): this {
    this.path.push([x, y]);
    return this;
  }
  lineTo(x: number, y: number): this {
    this.path.push([x, y]);
    return this;
  }
  closePath(): this {
    return this;
  }
  private pathBox(stroke: boolean): this {
    const xs = this.path.map((p) => p[0]);
    const ys = this.path.map((p) => p[1]);
    return this.box(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), stroke);
  }
  fillPath(): this {
    return this.pathBox(false);
  }
  strokePath(): this {
    return this.pathBox(true);
  }
}

class ShapeScene {
  made: ShapeGraphics[] = [];
  add = {
    graphics: (): ShapeGraphics => {
      const g = new ShapeGraphics();
      this.made.push(g);
      return g;
    },
  };
}

const FLOOR: StageFloor = stageFloorOf([installationOf('inst.village.ensemble-stage')])!;
const BEAT = BAR_SEC / 4;

function rig(floor: StageFloor | null = FLOOR) {
  const scene = new FakeScene();
  const bridge = new WorldBridge({ x: 4056, y: 3300, facing: 'down' });
  const layer = new FestivalLayer(scene as never, floor, bridge);
  return { scene, bridge, layer };
}

describe('세우고 내리기', () => {
  it('잔치가 열려 있지 않으면 아무도 없다', () => {
    const t = rig();
    expect(t.layer.debug()).toEqual([]);
    expect(t.scene.made).toHaveLength(0);
  });

  it('잔치가 열리면 성부마다 악사가 서고, 자리는 무대 위 한 줄(musicianSpots)이다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    const spots = musicianSpots(FLOOR, 2);
    const shown = t.layer.debug();
    expect(shown.map((m) => m.part)).toEqual(['pulse', 'bed']);
    expect(shown.map((m) => m.name)).toEqual([MUSICIAN_NAME_KO.pulse, MUSICIAN_NAME_KO.bed]);
    expect(shown.map((m) => ({ x: m.x, y: m.y }))).toEqual(spots);
    // 깊이는 발 위치의 y다(캐릭터와 사물이 쓰는 겹침 순서와 같다)
    for (const m of shown) expect(m.depth).toBe(m.y);
    expect(t.scene.alive).toHaveLength(2);
  });

  it('맥박만 있는 층 0에서도 북 악사 한 명이 선다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse'] });
    expect(t.layer.debug().map((m) => m.part)).toEqual(['pulse']);
  });

  it('다리가 이미 열려 있는 채로 만들어도 바로 선다', () => {
    const scene = new FakeScene();
    const bridge = new WorldBridge({ x: 4056, y: 3300, facing: 'down' });
    bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    const layer = new FestivalLayer(scene as never, FLOOR, bridge);
    expect(layer.debug()).toHaveLength(2);
  });

  it('잔치가 끝나면 모두 내려온다(그린 것을 지운다)', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    t.bridge.festival.set(NO_FESTIVAL);
    expect(t.layer.debug()).toEqual([]);
    expect(t.scene.alive).toHaveLength(0);
  });

  it('같은 악사들로 다시 알려 와도 다시 그리지 않는다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    const made = t.scene.made.length;
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    expect(t.scene.made).toHaveLength(made);
  });

  it('악사 구성이 바뀌면(층이 올랐다) 새로 세운다. 낡은 것은 지운다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse'] });
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    expect(t.layer.debug().map((m) => m.part)).toEqual(['pulse', 'bed']);
    expect(t.scene.alive).toHaveLength(2);
    expect(t.scene.made).toHaveLength(3);
  });

  it('다시 열면 다시 선다(잔치는 몇 번이든 열 수 있다)', () => {
    const t = rig();
    for (let i = 0; i < 3; i++) {
      t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
      expect(t.scene.alive).toHaveLength(2);
      t.bridge.festival.set(NO_FESTIVAL);
      expect(t.scene.alive).toHaveLength(0);
    }
  });

  it('성부마다 다른 모양을 그린다(색만으로 구별하지 않는다): 북은 북채 선을, 종은 길 그리기를 쓴다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    const [drum, bell] = t.scene.alive;
    expect(drum!.calls).toContain('lineBetween');
    expect(drum!.calls).not.toContain('fillPath');
    expect(bell!.calls).toContain('fillPath');
    expect(bell!.calls).not.toContain('lineBetween');
  });

  it('악사 일곱이 모두 서면 일곱이 한 줄로 서고 이름이 하나씩 있다(7-5)', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: [...MUSICIAN_ORDER] });
    const shown = t.layer.debug();
    expect(shown.map((m) => m.part)).toEqual([...MUSICIAN_ORDER]);
    expect(shown.map((m) => m.name)).toEqual(MUSICIAN_ORDER.map((p) => MUSICIAN_NAME_KO[p]));
    expect(shown.map((m) => ({ x: m.x, y: m.y }))).toEqual(musicianSpots(FLOOR, 7));
    expect(t.scene.alive).toHaveLength(7);
    t.bridge.festival.set(NO_FESTIVAL);
    expect(t.scene.alive).toHaveLength(0);
  });

  it('무대가 없으면(floor가 null) 열려도 아무도 서지 않는다', () => {
    const t = rig(null);
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    expect(t.layer.debug()).toEqual([]);
    expect(t.scene.made).toHaveLength(0);
  });

  it('active가 거짓이면 악사 목록이 남아 있어도 서지 않는다', () => {
    const t = rig();
    t.bridge.festival.set({ active: false, musicians: ['pulse'] });
    expect(t.layer.debug()).toEqual([]);
  });
});

/** 한 악사의 그림: 그림자를 뺀 모양들의 겉 상자(발치가 (0, 0)) */
function boxesOf(part: MusicianPart): Box[] {
  const scene = new ShapeScene();
  const bridge = new WorldBridge({ x: 4056, y: 3300, facing: 'down' });
  const layer = new FestivalLayer(scene as never, FLOOR, bridge);
  bridge.festival.set({ active: true, musicians: [part] });
  expect(layer.debug()).toHaveLength(1);
  return scene.made[0]!.boxes.filter((b) => !b.faint);
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('악사의 모양(7-5): 일곱 악사는 모양으로 구별되고 서로 겹치지 않는다', () => {
  it('일곱 성부의 그림이 모두 서로 다르다(색과 옷만이 아니라 악기의 모양이 다르다)', () => {
    const sig = (part: MusicianPart): string => JSON.stringify(boxesOf(part).map((b) => [b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v * 10) / 10)));
    const sigs = MUSICIAN_ORDER.map(sig);
    expect(new Set(sigs).size).toBe(MUSICIAN_ORDER.length);
    // 몸과 머리(그림자를 뺀 앞의 네 모양: 몸 채움, 몸 윤곽, 머리 채움, 머리 윤곽)를 빼고 악기만 보아도 서로 다르다
    const instruments = MUSICIAN_ORDER.map((p) => JSON.stringify(boxesOf(p).slice(4).map((b) => [b.x0, b.y0, b.x1, b.y1])));
    expect(new Set(instruments).size).toBe(MUSICIAN_ORDER.length);
  });

  it('모든 성부가 악기를 그린다: 몸(옷)과 머리 말고도 모양이 셋 이상 더 있다', () => {
    for (const part of MUSICIAN_ORDER) expect(boxesOf(part).length - 4).toBeGreaterThanOrEqual(3);
  });

  it('모든 그림이 발치에서 위로 서 있다: 위쪽 끝이 머리 높이(−55 px 부근)를 넘지 않고 아래쪽 끝은 몸 아래(−3 px)에 닿는다', () => {
    for (const part of MUSICIAN_ORDER) {
      const bs = boxesOf(part);
      expect(Math.min(...bs.map((b) => b.y0))).toBeGreaterThanOrEqual(-60);
      expect(Math.max(...bs.map((b) => b.y1))).toBeLessThanOrEqual(0);
    }
  });

  it('악사가 몇 명 서든(맥박은 늘 서는 하나, 나머지 여섯의 모든 부분 집합 64가지) 이웃한 악사의 그림끼리 겹치지 않는다', () => {
    const rest = MUSICIAN_ORDER.filter((p) => p !== 'pulse');
    const boxes = new Map<MusicianPart, Box[]>(MUSICIAN_ORDER.map((p) => [p, boxesOf(p)]));
    let subsets = 0;
    for (let mask = 0; mask < 1 << rest.length; mask++) {
      const chosen = MUSICIAN_ORDER.filter((p) => p === 'pulse' || mask & (1 << rest.indexOf(p)));
      const xs = musicianSpots(FLOOR, chosen.length).map((s) => s.x);
      for (let i = 0; i < chosen.length; i++) {
        for (let j = i + 1; j < chosen.length; j++) {
          for (const a of boxes.get(chosen[i]!)!) {
            for (const b of boxes.get(chosen[j]!)!) {
              const A: Box = { ...a, x0: a.x0 + xs[i]!, x1: a.x1 + xs[i]! };
              const B: Box = { ...b, x0: b.x0 + xs[j]!, x1: b.x1 + xs[j]! };
              if (overlaps(A, B)) throw new Error(`${chosen[i]}와 ${chosen[j]}의 그림이 겹친다(악사 ${chosen.length}명, 간격 ${xs[1]! - xs[0]!} px)`);
            }
          }
        }
      }
      subsets++;
    }
    expect(subsets).toBe(64);
  });
});

describe('박마다 뛰기', () => {
  it('박의 시작에서는 발이 땅에 있고, 박의 한가운데에서 가장 높이 뜬다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse'] });
    t.layer.update(0, false);
    expect(t.layer.debug()[0]!.lift).toBeCloseTo(0, 6);
    t.layer.update(BEAT / 2, false);
    expect(t.layer.debug()[0]!.lift).toBeCloseTo(MUSICIAN_HOP, 6);
    t.layer.update(BEAT, false);
    expect(t.layer.debug()[0]!.lift).toBeCloseTo(0, 6);
  });

  it('이웃한 악사는 반 박씩 어긋나게 뛴다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    t.layer.update(0, false);
    const [a, b] = t.layer.debug();
    expect(a!.lift).toBeCloseTo(0, 6);
    expect(b!.lift).toBeCloseTo(MUSICIAN_HOP, 6);
  });

  it('일곱 악사도 이웃끼리 반 박씩 어긋난다(짝수째는 같은 때, 홀수째는 반 박 뒤)', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: [...MUSICIAN_ORDER] });
    t.layer.update(0, false);
    const lifts = t.layer.debug().map((m) => m.lift);
    lifts.forEach((lift, i) => expect(lift).toBeCloseTo(i % 2 === 0 ? 0 : MUSICIAN_HOP, 6));
  });

  it('뛰는 높이만큼 그림이 위로 올라가고, 발치 좌표(x, y)와 깊이는 그대로다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse'] });
    const base = t.layer.debug()[0]!;
    t.layer.update(BEAT / 2, false);
    const g = t.scene.alive[0]!;
    expect(g.y).toBeCloseTo(base.y - MUSICIAN_HOP, 6);
    const after = t.layer.debug()[0]!;
    expect(after.y).toBe(base.y);
    expect(after.depth).toBe(base.depth);
  });

  it('움직임 줄이기에서는 뛰지 않는다. 늘 땅에 서 있다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    const ys = t.scene.alive.map((g) => g.y);
    for (const clock of [0, BEAT / 2, BEAT, 1.234, 7.77]) {
      t.layer.update(clock, true);
      expect(t.layer.debug().every((m) => m.lift === 0)).toBe(true);
      expect(t.scene.alive.map((g) => g.y)).toEqual(ys);
    }
  });

  it('뛰다가 움직임 줄이기를 켜면 바로 땅으로 내려온다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse'] });
    const baseY = t.scene.alive[0]!.y;
    t.layer.update(BEAT / 2, false);
    expect(t.scene.alive[0]!.y).toBeLessThan(baseY);
    t.layer.update(BEAT / 2, true);
    expect(t.scene.alive[0]!.y).toBe(baseY);
    expect(t.layer.debug()[0]!.lift).toBe(0);
  });

  it('악사가 없을 때 update를 불러도 아무 일이 없다', () => {
    const t = rig();
    expect(() => t.layer.update(1.5, false)).not.toThrow();
  });
});

describe('정리(destroy)', () => {
  it('서 있던 악사를 지우고, 이후 다리가 바뀌어도 세우지 않는다', () => {
    const t = rig();
    t.bridge.festival.set({ active: true, musicians: ['pulse', 'bed'] });
    t.layer.destroy();
    expect(t.scene.alive).toHaveLength(0);
    t.bridge.festival.set({ active: true, musicians: ['pulse'] });
    expect(t.scene.alive).toHaveLength(0);
    expect(t.layer.debug()).toEqual([]);
  });
});
