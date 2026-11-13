// 6-6 물레방아(T3, 4.5)의 바퀴를 월드에 그리는 층(world/installations/wheelLayer.ts, layer.ts의 위임): 다리의 timeline을 읽어 못, 빈 구멍, 놓으려는 자리, 큰 박의 무늬, 도는 각도를 옮겨 그린다.
// Phaser 없이 가짜 장면(그리기 호출을 기록만 하는 가짜 Graphics와 가짜 글자)으로 시험한다. 실제 화면의 모습은 브라우저 흐름 시험(phase6.flow.ts)이 본다.
// 앞쪽은 손으로 만든 모습으로 그리는 규칙(색만으로 말하지 않는다, 좌표, 도는 각도)을 확인하고, 뒤쪽은 설치물 컨트롤러 → 다리 → 층의 전체 길에서 '바퀴와 띠가 같은 초안'인지 확인한다(12.9).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InstallationDef } from '@/domain/installation';
import type { StoneMark, TimelineView } from '@/domain/timelineStones';
import { tickToDeg, wheelOf } from '@/domain/waterwheel';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { InstallationLayer } from '@/world/installations/layer';
import { WheelLayer } from '@/world/installations/wheelLayer';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import { fakeCull } from './fake-phaser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q19 = 'rhythm.six-eight';
const WHEEL = 'inst.beat-river.waterwheel';
const FORD1 = 'inst.beat-river.first-ford';
const KEY1 = `${Q19}/dotted-quarter-and-eighths`;
const DEPTH = -90_000;

/** 그리기 호출은 이름과 인자를 기록하고 자기 자신을 돌려 주는 가짜 Graphics */
class FakeGraphics {
  depth = 0;
  destroyed = false;
  log: Array<{ name: string; args: unknown[] }> = [];
  constructor() {
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        return (...args: unknown[]) => {
          target.log.push({ name: String(prop), args });
          return receiver;
        };
      },
    });
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
  count(name: string): number {
    return this.log.filter((c) => c.name === name).length;
  }
  calls(name: string): unknown[][] {
    return this.log.filter((c) => c.name === name).map((c) => c.args);
  }
  reset(): void {
    this.log = [];
  }
}

/** 가짜 글자: 자리, 보임, 크기, 내용만 기억한다. 폭은 글자 수에 비례한다(줄여 넣는지 보려고) */
class FakeText {
  x = 0;
  y = 0;
  visible = true;
  scaleValue = 1;
  depth = 0;
  destroyed = false;
  constructor(public content: string) {}
  get width(): number {
    return this.content.length * 14;
  }
  setOrigin(): this {
    return this;
  }
  setResolution(): this {
    return this;
  }
  setColor(): this {
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
  setText(c: string): this {
    this.content = c;
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setScale(s: number): this {
    this.scaleValue = s;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakeScene {
  graphics: FakeGraphics[] = [];
  texts: FakeText[] = [];
  add = {
    graphics: (): FakeGraphics => {
      const g = new FakeGraphics();
      this.graphics.push(g);
      return g;
    },
    text: (_x: number, _y: number, content: string): FakeText => {
      const t = new FakeText(content);
      this.texts.push(t);
      return t;
    },
  };
  /** 지금 보이는 글자의 내용(만든 순서) */
  shown(): string[] {
    return this.texts.filter((t) => t.visible && !t.destroyed).map((t) => t.content);
  }
}

const mark = (startTick: number, endTick: number, extra: Partial<StoneMark> = {}): StoneMark => ({ startTick, endTick, kind: 'note', name: 'C4', midi: 60, dotted: false, flagged: false, playing: false, ...extra });
const rest = (startTick: number, endTick: number, extra: Partial<StoneMark> = {}): StoneMark => mark(startTick, endTick, { kind: 'rest', name: null, midi: null, ...extra });
/** 6/8 한 마디의 모습: 2880틱, 8분 칸, 큰 박 둘 */
const timeline = (extra: Partial<TimelineView> = {}): TimelineView => ({ measureTicks: 2880, gridTicks: 480, beatTicks: 1440, stones: [], water: [{ from: 0, to: 2880, flagged: false }], waterEmphasis: false, cursor: null, playTick: null, ...extra });
const viewOf = (inst: InstallationDef, tl: TimelineView | undefined): InstallationView => ({ installationId: inst.installationId, slots: [], ...(tl ? { timeline: tl } : {}) });

/** 손으로 만든 모습을 직접 그리는 층 */
function direct() {
  const scene = new FakeScene();
  const w4 = installation(WHEEL);
  const ford = installation(FORD1);
  const layer = new WheelLayer(scene as never, [w4, ford], DEPTH);
  const g = new FakeGraphics();
  const geometry = wheelOf(w4)!;
  const draw = (tl: TimelineView | undefined, active: boolean, reduce = false) => {
    g.reset();
    return layer.draw(g as never, w4, viewOf(w4, tl), active, reduce)!;
  };
  return { scene, w4, ford, layer, g, geometry, draw };
}

/** 그려진 글자 중 이 내용인 것의 수 */
const shownCount = (scene: FakeScene, content: string): number => scene.shown().filter((c) => c === content).length;

describe('층을 만들 때', () => {
  it('물레방아(바퀴가 있는 설치물)만 맡는다. 징검다리와 모르는 설치물은 맡지 않는다', () => {
    const t = direct();
    expect(t.layer.has(WHEEL)).toBe(true);
    expect(t.layer.has(FORD1)).toBe(false);
    expect(t.layer.has('inst.nowhere')).toBe(false);
    expect(t.layer.draw(t.g as never, t.ford, viewOf(t.ford, timeline()), true, false)).toBeNull();
    expect(t.g.log).toEqual([]);
  });

  it('글자는 미리 만들어 두고 처음에는 모두 숨긴다(프레임마다 새로 만들지 않는다)', () => {
    const t = direct();
    // 못 이름 6 + 쉼 6 + ! 표 12(못 6, 빈 구멍 6) + ♪ 6 + 칸 번호 6 + 큰 박 번호 4
    expect(t.scene.texts).toHaveLength(6 + 6 + 12 + 6 + 6 + 4);
    expect(t.scene.texts.every((x) => !x.visible)).toBe(true);
    expect(t.scene.texts.every((x) => x.depth === DEPTH + 1)).toBe(true);
    const before = t.scene.texts.length;
    t.draw(timeline({ stones: [mark(0, 1440, { dotted: true })] }), true);
    t.draw(timeline(), true);
    expect(t.scene.texts).toHaveLength(before);
  });

  it('모습이 아직 올라오지 않았으면 빈 바퀴를 그린다: 못은 없고 구멍 6개, 큰 박 둘의 무늬는 그려진다', () => {
    const t = direct();
    const out = t.draw(undefined, false);
    expect(out).toMatchObject({ cx: 6144, cy: 2336, r: 240, cells: 6, turnDeg: 0, nails: [], holes: [1, 2, 3, 4, 5, 6], flaggedHoles: [], cursor: null, playTick: null, numbered: false, clapper: false });
    expect(out.beats.map((b) => [b.beat, b.pattern])).toEqual([[1, 'stripes'], [2, 'dots']]);
    expect(t.g.count('fillCircle')).toBeGreaterThan(0);
    expect(t.scene.shown()).toEqual([]);
  });

  it('모습이 사라지면 이전에 보이던 못 글자도 숨긴다(설치물 모드에서는 빈 바퀴의 번호만 남는다)', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 480)] }), true);
    expect(t.scene.shown()).toContain('C4');
    t.draw(undefined, true);
    expect(t.scene.shown()).not.toContain('C4');
    expect(t.scene.shown()).toEqual(['1', '2', '3', '4', '5', '6', '1', '2']);
    t.draw(undefined, false);
    expect(t.scene.shown()).toEqual([]);
  });
});

describe('못: 울림 못, 이끼 못(쉼), 점이 붙은 못', () => {
  it('점4분 + 8분 셋으로 채운 한 마디: 못 넷이 각도 구간으로 그려지고 빈 구멍이 없다', () => {
    const t = direct();
    const stones = [mark(0, 1440, { name: 'C4', dotted: true }), mark(1440, 1920, { name: 'D4' }), mark(1920, 2400, { name: 'E4' }), mark(2400, 2880, { name: 'F4' })];
    const out = t.draw(timeline({ stones, water: [] }), true);
    expect(out.holes).toEqual([]);
    expect(out.nails.map((n) => [n.startTick, n.endTick, n.kind, n.label, n.dotted])).toEqual([
      [0, 1440, 'note', 'C4', true],
      [1440, 1920, 'note', 'D4', false],
      [1920, 2400, 'note', 'E4', false],
      [2400, 2880, 'note', 'F4', false],
    ]);
    // 각도는 12시에서 시계 방향: 점4분 못은 0°–180°, 8분 못은 60°씩
    expect(out.nails.map((n) => [n.startDeg, n.endDeg])).toEqual([[0, 180], [180, 240], [240, 300], [300, 360]]);
    expect(t.scene.shown()).toEqual(expect.arrayContaining(['C4', 'D4', 'E4', 'F4']));
  });

  it('이끼 못은 \'쉼\' 글자와 사선(방사) 무늬로 알린다: 울림 못과 무늬가 다르다(색만으로 말하지 않는다)', () => {
    const t = direct();
    const notes = t.draw(timeline({ stones: [mark(0, 480)] }), true);
    const noteLines = t.g.count('lineBetween');
    expect(notes.nails[0]).toMatchObject({ kind: 'note', label: 'C4' });
    expect(shownCount(t.scene, '쉼')).toBe(0);
    const rests = t.draw(timeline({ stones: [rest(0, 480)] }), true);
    expect(rests.nails[0]).toMatchObject({ kind: 'rest', label: '쉼' });
    expect(shownCount(t.scene, '쉼')).toBe(1);
    // 이끼 못은 방사 무늬의 선이 더 있다
    expect(t.g.count('lineBetween')).toBeGreaterThan(noteLines);
  });

  it('점이 붙은 못은 끝쪽에 점을 그린다(점4분 못, 3칸 = 180°). 한 칸 못에는 점이 없다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 480)] }), true);
    const without = t.g.count('fillCircle');
    t.draw(timeline({ stones: [mark(0, 1440, { dotted: true })] }), true);
    // 점 하나: 점 없는 못보다 원이 하나 더 그려진다(빈 구멍 수가 달라 구멍 원은 따로 센다: 구멍 5개 → 3개)
    const holesWithout = 5;
    const holesWith = 3;
    expect(t.g.count('fillCircle') - holesWith).toBe(without - holesWithout + 1);
  });

  it('판정이 가리킨 못에는 산호색 배지와 \'!\' 글자가 붙는다', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 480, { flagged: true }), mark(480, 960)] }), true);
    expect(out.nails.map((n) => n.flagged)).toEqual([true, false]);
    expect(shownCount(t.scene, '!')).toBe(1);
  });

  it('듣는 중인 울림 못에는 금빛 테두리와 ♪ 글자가 붙고, 이끼 못에는 ♪가 없다(소리가 없다)', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 480, { playing: true }), rest(480, 960, { playing: true })] }), true);
    expect(out.nails.map((n) => n.playing)).toEqual([true, true]);
    expect(shownCount(t.scene, '♪')).toBe(1);
  });

  it('좁은 못에는 글자를 줄여 넣는다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 480, { name: 'C♯4' })] }), true);
    const name = t.scene.texts.find((x) => x.visible && x.content === 'C♯4')!;
    expect(name.scaleValue).toBeLessThanOrEqual(1);
    expect(name.scaleValue).toBeGreaterThanOrEqual(0.5);
  });
});

describe('빈 구멍: 못이 덮지 않은 칸', () => {
  it('못이 하나도 없으면 구멍이 여섯이다. 못이 덮은 칸은 구멍이 아니다(점4분 못이 세 칸을 덮는다)', () => {
    const t = direct();
    expect(t.draw(timeline(), true).holes).toEqual([1, 2, 3, 4, 5, 6]);
    expect(t.draw(timeline({ stones: [mark(0, 1440, { dotted: true })] }), true).holes).toEqual([4, 5, 6]);
    expect(t.draw(timeline({ stones: [mark(480, 960)] }), true).holes).toEqual([1, 3, 4, 5, 6]);
  });

  it('판정이 마디가 덜 찼다고 알리면 빈 구멍에 산호색 테두리와 \'!\' 배지가 붙는다', () => {
    const t = direct();
    const stones = [mark(0, 1440, { dotted: true })];
    const quiet = t.draw(timeline({ stones, water: [{ from: 1440, to: 2880, flagged: false }] }), true);
    expect(quiet.flaggedHoles).toEqual([]);
    expect(shownCount(t.scene, '!')).toBe(0);
    const loud = t.draw(timeline({ stones, water: [{ from: 1440, to: 2880, flagged: true }], waterEmphasis: true }), true);
    expect(loud.flaggedHoles).toEqual([4, 5, 6]);
    expect(shownCount(t.scene, '!')).toBe(3);
  });

  it('일부 구간만 강조되면 그 구간의 구멍만 강조된다', () => {
    const t = direct();
    const water = [{ from: 480, to: 960, flagged: true }, { from: 1920, to: 2880, flagged: false }];
    const out = t.draw(timeline({ stones: [mark(0, 480), mark(960, 1920)], water }), true);
    expect(out.holes).toEqual([2, 5, 6]);
    expect(out.flaggedHoles).toEqual([2]);
  });
});

describe('놓으려는 자리와 번호와 방망이(설치물 모드에서만)', () => {
  it('설치물 모드: 칸 번호 1–6, 큰 박 번호 1 2, 12시의 방망이', () => {
    const t = direct();
    const out = t.draw(timeline(), true);
    expect(out).toMatchObject({ numbered: true, clapper: true });
    const shown = t.scene.shown();
    for (const n of ['1', '2', '3', '4', '5', '6']) expect(shown).toContain(n);
    // 큰 박 번호는 둘이다(칸 번호 1, 2와 같은 글자가 한 번씩 더 나온다)
    expect(shownCount(t.scene, '1')).toBe(2);
    expect(shownCount(t.scene, '2')).toBe(2);
    expect(shownCount(t.scene, '3')).toBe(1);
  });

  it('걷는 중(설치물 모드 밖)에는 번호, 놓으려는 자리, 방망이가 없고 못과 구멍은 풍경으로 남는다', () => {
    const t = direct();
    const cursor = { startTick: 0, endTick: 480, kind: 'note' as const, ok: true };
    const out = t.draw(timeline({ stones: [mark(0, 480)], cursor }), false);
    expect(out).toMatchObject({ numbered: false, clapper: false, cursor: null });
    expect(out.nails).toHaveLength(1);
    expect(out.holes).toEqual([2, 3, 4, 5, 6]);
    expect(t.g.count('fillTriangle')).toBe(0);
    expect(t.scene.shown()).toEqual(['C4']);
    // 같은 모습을 설치물 모드로 그리면 놓으려는 자리(▼)와 방망이가 생긴다
    const active = t.draw(timeline({ stones: [mark(0, 480)], cursor }), true);
    expect(active.cursor).toEqual({ startTick: 0, endTick: 480, kind: 'note', ok: true });
    expect(t.g.count('fillTriangle')).toBeGreaterThanOrEqual(2);
  });

  it('놓을 수 있으면 ▼, 놓을 수 없으면 × 표시가 붙는다', () => {
    const t = direct();
    t.draw(timeline({ cursor: { startTick: 480, endTick: 1440, kind: 'note', ok: true } }), true);
    const arrows = t.g.count('fillTriangle');
    const crosses = t.g.count('lineBetween');
    t.draw(timeline({ cursor: { startTick: 480, endTick: 1440, kind: 'note', ok: false } }), true);
    // ▼(삼각형)는 방망이의 삼각형 하나만 남고, × 표시의 선 두 줄이 더 그려진다
    expect(t.g.count('fillTriangle')).toBe(arrows - 1);
    expect(t.g.count('lineBetween')).toBe(crosses + 2);
  });

  it('지우개 자리는 잉크색이고, 놓을 수 없는 자리는 산호색이다(색 말고도 ▼와 ×로 구분된다)', () => {
    const t = direct();
    const colorsOf = () => t.g.calls('lineStyle').map((a) => a[1]);
    t.draw(timeline({ cursor: { startTick: 0, endTick: 480, kind: 'erase', ok: true } }), true);
    const erase = colorsOf();
    t.draw(timeline({ cursor: { startTick: 0, endTick: 480, kind: 'note', ok: false } }), true);
    const blocked = colorsOf();
    expect(erase).not.toEqual(blocked);
  });
});

describe('듣는 동안 바퀴가 돈다(4.5): 한 바퀴가 한 마디', () => {
  it('돌아간 각도는 재생 위치(틱)에 비례한다: 1440틱이면 반 바퀴, 2880틱이면 한 바퀴', () => {
    const t = direct();
    expect(t.draw(timeline({ playTick: null }), true).turnDeg).toBe(0);
    expect(t.draw(timeline({ playTick: 0 }), true).turnDeg).toBe(0);
    expect(t.draw(timeline({ playTick: 480 }), true).turnDeg).toBe(60);
    expect(t.draw(timeline({ playTick: 1440 }), true).turnDeg).toBe(180);
    expect(t.draw(timeline({ playTick: 2880 }), true).turnDeg).toBe(360);
    expect(t.draw(timeline({ playTick: 1440 }), true).playTick).toBe(1440);
  });

  it('움직임 줄이기에서는 돌지 않는다. 듣는 못은 그대로 금빛이다(W-8)', () => {
    const t = direct();
    const out = t.draw(timeline({ playTick: 1440, stones: [mark(1440, 1920, { playing: true })] }), true, true);
    expect(out.turnDeg).toBe(0);
    expect(out.playTick).toBe(1440);
    expect(out.nails[0]).toMatchObject({ playing: true, startDeg: 180 });
  });

  it('못의 각도는 돌지 않은 바퀴 기준으로 보고하고, 그리는 곳만 돈 만큼 옮겨진다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 480)], playTick: null }), true);
    const still = t.g.calls('lineTo').slice(0, 3);
    const turned = t.draw(timeline({ stones: [mark(0, 480)], playTick: 960 }), true);
    expect(turned.nails[0]).toMatchObject({ startDeg: 0, endDeg: 60 });
    expect(turned.turnDeg).toBe(120);
    // 돈 바퀴는 같은 못을 다른 곳에 그린다
    expect(t.g.calls('lineTo').slice(0, 3)).not.toEqual(still);
  });

  it('듣는 중에는 설치물 모드가 아니어도 방망이가 12시에 선다. 듣지 않는 풍경에서는 없다', () => {
    const t = direct();
    expect(t.draw(timeline({ playTick: 480 }), false).clapper).toBe(true);
    expect(t.draw(timeline({ playTick: null }), false).clapper).toBe(false);
  });

  it('글자는 바퀴와 함께 자리만 돌고 늘 바로 선다(회전을 주지 않는다): 글자 객체에 각도를 쓰지 않는다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 480)], playTick: 960 }), true);
    const name = t.scene.texts.find((x) => x.visible && x.content === 'C4')!;
    // 가짜 글자에는 setRotation도 setAngle도 없다: 부르면 TypeError가 났을 것이다
    expect(typeof (name as unknown as Record<string, unknown>)['setRotation']).toBe('undefined');
    // 돈 만큼 옮겨진 자리: 못 한가운데(30° − 120° = −90°, 9시 쪽)에 가깝다
    const w = t.geometry;
    const rMid = (w.ringIn + 10 + w.ringOut - 10) / 2;
    expect(name.x).toBeCloseTo(w.cx - rMid, 3);
    expect(name.y).toBeCloseTo(w.cy, 3);
  });
});

describe('큰 박의 무늬: 색이 아니라 무늬로 구분한다', () => {
  it('첫째 큰 박은 줄무늬(선), 둘째 큰 박은 점무늬(작은 원)가 테두리에 그려진다', () => {
    const t = direct();
    const out = t.draw(timeline(), false);
    expect(out.beats).toEqual([
      { beat: 1, fromTick: 0, toTick: 1440, pattern: 'stripes' },
      { beat: 2, fromTick: 1440, toTick: 2880, pattern: 'dots' },
    ]);
    // 줄무늬: 0°–180°를 6°마다 한 줄 → 30줄, 점무늬: 180°–360°를 9°마다 한 점 → 20개, 살 6줄(칸 경계)
    expect(t.g.count('lineBetween')).toBe(30 + 6);
  });

  it('큰 박의 경계 살은 굵다(0°와 180°): 칸 경계의 가는 살과 선 굵기가 다르다', () => {
    const t = direct();
    t.draw(timeline(), false);
    const widths = t.g.calls('lineStyle').map((a) => a[0] as number);
    expect(widths).toContain(6);
    expect(widths).toContain(2.5);
  });
});

// ---------------------------------------------------------------------------
// 설치물 컨트롤러 → 다리 → 층: 바퀴와 띠가 같은 초안이다(12.9)

class FakeFrames implements FrameScheduler {
  private next = 1;
  readonly pending = new Map<number, () => void>();
  request(fn: () => void): number {
    const handle = this.next++;
    this.pending.set(handle, fn);
    return handle;
  }
  cancel(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  tick(): void {
    const run = [...this.pending.values()];
    this.pending.clear();
    for (const fn of run) fn();
  }
}

function pipeline() {
  const r = rig({ definitions: [quest(Q19)] });
  const bridge = new WorldBridge({ x: 6450, y: 2300, facing: 'left' });
  const w4 = installation(WHEEL);
  const scale = installation('inst.village.scale-stones');
  const frames = new FakeFrames();
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => {} },
    installations: [w4],
    panels: new Set(['panel.rhythm']),
    frames,
  });
  const scene = new FakeScene();
  const layer = new InstallationLayer(scene as never, [w4, scale], bridge, fakeCull());
  const drawn = (id = WHEEL) => {
    layer.update(0, false);
    return layer.debug().find((d) => d.installationId === id)!;
  };
  return { ...r, bridge, w4, scale, ic, frames, scene, layer, drawn };
}

describe('설치물 층: 물레방아는 띠와 바퀴를 모두 그린다', () => {
  it('물레방아는 timeline과 wheel을 함께 돌려주고, 돌 설치물에는 둘 다 없다', () => {
    const t = pipeline();
    t.layer.update(0, false);
    const all = t.layer.debug();
    expect(all.map((d) => d.installationId)).toEqual([WHEEL, 'inst.village.scale-stones']);
    expect(all[0]!.timeline).toBeDefined();
    expect(all[0]!.wheel).toBeDefined();
    expect(all[1]!.timeline).toBeUndefined();
    expect(all[1]!.wheel).toBeUndefined();
    expect(all[0]!.slots).toHaveLength(6);
  });

  it('바퀴와 띠는 같은 초안이다: 들어가서 놓으면 띠의 돌과 바퀴의 못이 같은 틱, 같은 글자로 그려진다', () => {
    const t = pipeline();
    expect(t.ic.enter('E4')).toBe(true);
    expect(t.ic.select(KEY1)).toBe(true);
    const bench = t.ic.timeline!;
    bench.pickLength('quarter', true);
    bench.place(0);
    bench.pickLength('eighth', false);
    bench.moveHand(1);
    bench.place(1440);
    bench.pickKind('rest');
    bench.place(1920);
    const d = t.drawn();
    expect(d.active).toBe(true);
    const band = d.timeline!.stones.map((s) => [s.startTick, s.endTick, s.kind, s.label, s.dotted]);
    const wheel = d.wheel!.nails.map((n) => [n.startTick, n.endTick, n.kind, n.label, n.dotted]);
    expect(band).toEqual([
      [0, 1440, 'note', 'C4', true],
      [1440, 1920, 'note', 'D4', false],
      [1920, 2400, 'rest', '쉼', false],
    ]);
    expect(wheel).toEqual(band);
    // 못의 각도는 띠의 틱과 같은 비례다
    const g = wheelOf(t.w4)!;
    for (const n of d.wheel!.nails) {
      expect(n.startDeg).toBeCloseTo(tickToDeg(g, n.startTick), 9);
      expect(n.endDeg).toBeCloseTo(tickToDeg(g, n.endTick), 9);
    }
    // 빈 구멍(6번 칸)은 띠의 남은 물과 같다
    expect(d.wheel!.holes).toEqual([6]);
    expect(d.timeline!.water).toEqual([{ from: 2400, to: 2880, flagged: false, labelled: false, emphasised: false }]);
  });

  it('바퀴의 칸을 눌러 놓으면 띠에도 같은 자리에 보인다(누른 칸의 시작 틱이 월드에서 올라온다)', () => {
    const t = pipeline();
    t.ic.enter('E4');
    // 바퀴의 3번 칸을 누른다: 월드는 칸 번호와 그 칸의 시작 틱(960)을 알린다
    t.bridge.events.send({ type: 'slot-pressed', installationId: WHEEL, slot: 3, tick: 960 });
    const d = t.drawn();
    expect(d.timeline!.stones.map((s) => [s.startTick, s.endTick, s.label])).toEqual([[960, 1440, 'C4']]);
    expect(d.wheel!.nails.map((n) => [n.startTick, n.endTick, n.label])).toEqual([[960, 1440, 'C4']]);
    expect(d.wheel!.holes).toEqual([1, 2, 4, 5, 6]);
  });

  it('고른 칸은 같은 자리가 띠에서도 바퀴에서도 놓으려는 자리로 그려진다', () => {
    const t = pipeline();
    t.ic.enter('E4');
    const bench = t.ic.timeline!;
    bench.pickLength('quarter', false);
    bench.selectTick(960);
    const d = t.drawn();
    expect(d.timeline!.cursor).toEqual({ startTick: 960, endTick: 1920, kind: 'note', ok: true });
    expect(d.wheel!.cursor).toEqual(d.timeline!.cursor);
    t.ic.exit();
    const walking = t.drawn();
    expect(walking.active).toBe(false);
    expect(walking.wheel!.cursor).toBeNull();
    expect(walking.wheel!.numbered).toBe(false);
  });

  it('확인하면 마디가 덜 찬 곳이 바퀴의 빈 구멍과 띠의 남은 물에서 같이 강조된다', () => {
    const t = pipeline();
    t.ic.enter('E4');
    t.ic.select(KEY1);
    const bench = t.ic.timeline!;
    bench.pickLength('quarter', true);
    bench.place(0);
    bench.perform('check');
    const d = t.drawn();
    expect(t.controller.feedback?.passed).toBe(false);
    expect(d.timeline!.waterEmphasis).toBe(true);
    expect(d.timeline!.water.every((w) => w.emphasised)).toBe(true);
    expect(d.wheel!.holes).toEqual([4, 5, 6]);
    expect(d.wheel!.flaggedHoles).toEqual([4, 5, 6]);
  });

  it('통과하면 강조가 없다: 바퀴에도 띠에도 표시가 남지 않는다', () => {
    const t = pipeline();
    t.ic.enter('E4');
    t.ic.select(KEY1);
    const bench = t.ic.timeline!;
    bench.pickLength('quarter', true);
    bench.place(0);
    bench.pickLength('eighth', false);
    bench.moveHand(1);
    bench.place(1440);
    bench.moveHand(1);
    bench.place(1920);
    bench.moveHand(1);
    bench.place(2400);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    const d = t.drawn();
    expect(d.wheel!.holes).toEqual([]);
    expect(d.wheel!.flaggedHoles).toEqual([]);
    expect(d.wheel!.nails.every((n) => !n.flagged)).toBe(true);
    expect(d.timeline!.waterEmphasis).toBe(false);
    expect(d.wheel!.nails.map((n) => n.label)).toEqual(['C4', 'D4', 'E4', 'F4']);
  });
});
