// 월드의 주민 층(world/residents/layer.ts): 다리의 residents를 읽어 연주하는 주민을 가리고, 박마다 장을 넘긴다.
// Phaser 없이 가짜 장면(그리기 호출을 기록만 하는 가짜 Graphics)으로 시험한다. 실제 화면은 브라우저 흐름 시험(phase7-residents.flow.ts)이 본다.
import { describe, expect, it } from 'vitest';
import { RESIDENTS, RESIDENT_BLINK_SEC, RESIDENT_FRAME } from '@/domain/residents';
import { BAR_SEC } from '@/domain/worldsound';
import { WorldBridge } from '@/platform/bridge';
import { INSTRUMENT } from '@/world/festival/layer';
import { NOTE_MARK, PLAY_SWAY, ResidentLayer } from '@/world/residents/layer';
import { fakeCull } from './fake-phaser';

/** 그리기 호출은 모두 받아서 자기 자신을 돌려 주는 가짜 Graphics. 위치, 깊이, 기울기, 보임, 부서졌는지와 호출을 기억한다 */
class FakeGraphics {
  x = 0;
  y = 0;
  depth = 0;
  rotation = 0;
  visible = true;
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
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setRotation(r: number): this {
    this.rotation = r;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
  clear(): this {
    this.calls.push('clear');
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

const BEAT = BAR_SEC / 4;
const start = { x: 0, y: 0, facing: 'down' as const };
const ids = RESIDENTS.map((r) => r.residentId);

function make(playing: readonly string[] = []) {
  const scene = new FakeScene();
  const bridge = new WorldBridge(start);
  bridge.residents.set(playing);
  const layer = new ResidentLayer(scene as never, RESIDENTS, bridge, fakeCull());
  return { scene, bridge, layer };
}
const of = (layer: ResidentLayer, id: string) => layer.debug().find((d) => d.residentId === id)!;
/** 가장 최근에 몸을 다시 그린 뒤의 호출들(눈을 그린 것을 보려고) */
const afterLastClear = (g: FakeGraphics): string[] => g.calls.slice(g.calls.lastIndexOf('clear') + 1);

describe('처음 모습', () => {
  it('주민마다 몸, 악기, 음표 표지의 세 그림을 세우고 모두 발치의 자리와 깊이(발 위치 y)에 둔다', () => {
    const { scene, layer } = make();
    expect(scene.alive).toHaveLength(RESIDENTS.length * 3);
    for (const d of layer.debug()) {
      const r = RESIDENTS.find((x) => x.residentId === d.residentId)!;
      expect(d).toMatchObject({ name: r.name, x: r.x, y: r.y, depth: r.y });
    }
    // 겹침 순서: 몸 → 악기 → 음표 표지(같은 깊이에서는 만든 차례)
    const made = scene.made;
    RESIDENTS.forEach((r, i) => {
      const [body, tool, note] = [made[i * 3]!, made[i * 3 + 1]!, made[i * 3 + 2]!];
      expect([body.depth, tool.depth, note.depth]).toEqual([r.y, r.y, r.y]);
      expect([body.x, tool.x, note.x]).toEqual([r.x, r.x, r.x]);
    });
  });

  it('처음에는 모두 서 있기 첫 장(눈을 뜬 모습)이고 음표 표지는 가려져 있다', () => {
    const { layer } = make();
    for (const d of layer.debug()) {
      expect(d).toMatchObject({ playing: false, pose: 'standing', frame: 0, noteVisible: false, toolOffset: { x: 0, y: 0 } });
    }
  });

  it('성부마다 다른 악기를 그린다: 주민 여섯의 악기 그리기가 모두 불린다(모양으로 구별한다)', () => {
    const { scene } = make();
    RESIDENTS.forEach((r, i) => {
      const tool = scene.made[i * 3 + 1]!;
      const expected = new FakeGraphics();
      INSTRUMENT[r.part](expected as never);
      expect(tool.calls, r.name).toEqual(expected.calls);
    });
    // 서로 다른 모양이라 그리기 호출의 모양이 모두 다르다
    const shapes = RESIDENTS.map((_, i) => scene.made[i * 3 + 1]!.calls.join(','));
    expect(new Set(shapes).size).toBe(6);
  });

  it('다리에 이미 연주하는 주민이 있으면 처음부터 연주 쪽이다(월드가 늦게 시작해도 값을 읽는다)', () => {
    const { layer } = make(['resident.bell-grove']);
    expect(of(layer, 'resident.bell-grove').playing).toBe(true);
    expect(of(layer, 'resident.staff-hill').playing).toBe(false);
  });
});

describe('연주하는 주민(다리의 residents)', () => {
  it('연주하는 주민만 연주 장을 그린다: 음표 표지가 보이고 악기가 박마다 흔들린다', () => {
    const { layer } = make(['resident.staff-hill', 'resident.key-marsh']);
    layer.update(0.01, false);
    for (const d of layer.debug()) {
      if (d.residentId === 'resident.staff-hill' || d.residentId === 'resident.key-marsh') {
        expect(d, d.name).toMatchObject({ playing: true, pose: 'playing', frame: 0, noteVisible: true, toolOffset: { x: PLAY_SWAY[0]!.dx, y: PLAY_SWAY[0]!.dy } });
      } else {
        expect(d, d.name).toMatchObject({ playing: false, pose: 'standing', noteVisible: false });
      }
    }
  });

  it('박마다 한 장씩 넘어가고 한 마디에 네 장이 한 바퀴 돈다. 악기의 흔들림도 그 장을 따른다', () => {
    const { scene, layer } = make(['resident.staff-hill']);
    const tool = scene.made[RESIDENTS.findIndex((r) => r.residentId === 'resident.staff-hill') * 3 + 1]!;
    const seen: number[] = [];
    for (let beat = 0; beat < 8; beat++) {
      layer.update(beat * BEAT + 0.01, false);
      const d = of(layer, 'resident.staff-hill');
      seen.push(d.frame);
      expect(d.toolOffset).toEqual({ x: PLAY_SWAY[beat % 4]!.dx, y: PLAY_SWAY[beat % 4]!.dy });
      expect(tool.rotation).toBeCloseTo(PLAY_SWAY[beat % 4]!.rot, 10);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('주민이 연주를 그만두는 일은 없다고 가정하지 않는다: 다리의 값이 바뀌면 서 있기로 돌아온다', () => {
    const { bridge, layer } = make(['resident.beat-river']);
    layer.update(0.01, false);
    expect(of(layer, 'resident.beat-river').pose).toBe('playing');
    bridge.residents.set([]);
    layer.update(0.02, false);
    expect(of(layer, 'resident.beat-river')).toMatchObject({ playing: false, pose: 'standing', noteVisible: false, toolOffset: { x: 0, y: 0 } });
  });

  it('여섯 모두 연주해도 장은 서로 같은 박에 맞는다(같은 시계)', () => {
    const { layer } = make(ids);
    layer.update(2 * BEAT + 0.01, false);
    expect(layer.debug().map((d) => d.frame)).toEqual([2, 2, 2, 2, 2, 2]);
  });
});

describe('서 있는 주민', () => {
  it('마디의 끝 0.3초만 눈을 감은 장이다: 몸을 다시 그리고 눈이 짧은 가로선 둘이 된다', () => {
    const { scene, layer } = make();
    const body = scene.made[0]!;
    layer.update(0.1, false);
    expect(of(layer, ids[0]!)).toMatchObject({ pose: 'standing', frame: 0 });
    expect(afterLastClear(body)).not.toContain('lineBetween');
    layer.update(BAR_SEC - RESIDENT_BLINK_SEC + 0.01, false);
    expect(of(layer, ids[0]!)).toMatchObject({ pose: 'standing', frame: 1 });
    expect(afterLastClear(body).filter((c) => c === 'lineBetween')).toHaveLength(2);
    layer.update(BAR_SEC + 0.05, false);
    expect(of(layer, ids[0]!)).toMatchObject({ pose: 'standing', frame: 0 });
    expect(afterLastClear(body)).not.toContain('lineBetween');
  });

  it('같은 장이면 다시 그리지 않는다(바뀔 때만 그린다)', () => {
    const { scene, layer } = make();
    layer.update(0.1, false);
    const before = scene.made.map((g) => g.calls.length);
    layer.update(0.2, false);
    layer.update(0.3, false);
    expect(scene.made.map((g) => g.calls.length)).toEqual(before);
  });

  it('연주하는 동안 박이 넘어가도 몸은 다시 그리지 않는다(악기와 표지만 움직인다)', () => {
    const { scene, layer } = make(['resident.staff-hill']);
    const index = RESIDENTS.findIndex((r) => r.residentId === 'resident.staff-hill');
    layer.update(0.01, false);
    const body = scene.made[index * 3]!;
    const before = body.calls.length;
    layer.update(BEAT + 0.01, false);
    layer.update(2 * BEAT + 0.01, false);
    expect(body.calls.length).toBe(before);
  });
});

describe('움직임 줄이기(9.7)', () => {
  it('장을 넘기지 않는다: 서 있기는 눈을 뜬 장, 연주는 연주 첫 장에 서고 악기는 흔들리지 않는다. 음표 표지는 그대로 보인다', () => {
    const { layer } = make(['resident.staff-hill']);
    for (const t of [0.01, BEAT + 0.01, 2 * BEAT + 0.01, BAR_SEC - 0.05]) {
      layer.update(t, true);
      expect(of(layer, 'resident.staff-hill')).toMatchObject({ pose: 'playing', frame: 0, noteVisible: true, toolOffset: { x: PLAY_SWAY[0]!.dx, y: PLAY_SWAY[0]!.dy } });
      expect(of(layer, 'resident.key-marsh')).toMatchObject({ pose: 'standing', frame: 0, noteVisible: false });
    }
  });

  it('연주하는 것은 움직이지 않아도 음표 표지로 알아볼 수 있다(색이나 움직임만으로 뜻을 전하지 않는다)', () => {
    const { layer } = make(['resident.staff-hill']);
    layer.update(0.5, true);
    expect(of(layer, 'resident.staff-hill').noteVisible).toBe(true);
    expect(of(layer, 'resident.beat-river').noteVisible).toBe(false);
  });
});

describe('그림의 크기와 정리', () => {
  it('음표 표지는 그림 칸(48×72) 안, 머리 위쪽 가장자리(−54)보다 위에 선다', () => {
    expect(NOTE_MARK.y).toBeLessThan(-54);
    expect(NOTE_MARK.y).toBeGreaterThanOrEqual(-RESIDENT_FRAME.h);
    expect(Math.abs(NOTE_MARK.x)).toBeLessThanOrEqual(RESIDENT_FRAME.w / 2);
  });

  it('악기의 흔들림은 작다: 한 장에서 3 px와 0.06라디안을 넘지 않아 이웃한 그림 칸을 침범하지 않는다', () => {
    for (const s of PLAY_SWAY) {
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(3);
      expect(Math.abs(s.dy)).toBeLessThanOrEqual(3);
      expect(Math.abs(s.rot)).toBeLessThanOrEqual(0.06 + 1e-9);
    }
    expect(PLAY_SWAY).toHaveLength(4);
  });

  it('destroy는 그림을 모두 없애고 다리 구독을 푼다', () => {
    const { scene, bridge, layer } = make();
    layer.destroy();
    expect(scene.alive).toHaveLength(0);
    expect(layer.debug()).toEqual([]);
    expect(() => bridge.residents.set(ids)).not.toThrow();
  });
});
