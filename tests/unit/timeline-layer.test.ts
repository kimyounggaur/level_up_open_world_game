// 6-4 징검다리(T2, 4.4)를 월드에 그리는 층(world/installations/timelineLayer.ts, layer.ts의 위임): 다리의 timeline을 읽어 돌, 남은 물, 물가 바위, 박 번호, 놓으려는 자리, 물결 선을 옮겨 그린다.
// Phaser 없이 가짜 장면(그리기 호출을 기록만 하는 가짜 Graphics와 가짜 글자)으로 시험한다. 실제 화면의 모습은 브라우저 흐름 시험이 본다.
// 앞쪽은 손으로 만든 모습으로 그리는 규칙(색만으로 말하지 않는다, 좌표)을 확인하고, 뒤쪽은 설치물 컨트롤러 → 다리 → 층의 전체 길을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InstallationDef } from '@/domain/installation';
import { STONES_LABEL_TOP, STONES_RAFT_BAND } from '@/domain/installation';
import { laneOf } from '@/domain/timelineStones';
import type { StoneLane, StoneMark, TimelineView } from '@/domain/timelineStones';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { InstallationLayer } from '@/world/installations/layer';
import { TimelineLayer, stoneBox } from '@/world/installations/timelineLayer';
import { loadRegionDefs } from '../../tools/world-files';
import { Q02, installation, quest, rig } from './controller-rig';
import { fakeCull } from './fake-phaser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q13 = 'rhythm.three-four';
const Q14 = 'rhythm.note-values';
const Q15 = 'rhythm.dotted';
const Q16 = 'rhythm.rest-lengths';
const FORD1 = 'inst.beat-river.first-ford';
const FORD2 = 'inst.beat-river.long-short';
const E3 = 'inst.beat-river.ripple-channel';
const REST_KEY = `${Q02}/quarter-rest`;
const THREE_KEY = `${Q13}/three-quarters`;
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
const timeline = (extra: Partial<TimelineView> = {}): TimelineView => ({ measureTicks: 3840, gridTicks: 960, beatTicks: 960, stones: [], water: [{ from: 0, to: 3840, flagged: false }], waterEmphasis: false, cursor: null, playTick: null, ...extra });
const viewOf = (inst: InstallationDef, tl: TimelineView | undefined): InstallationView => ({ installationId: inst.installationId, slots: [], ...(tl ? { timeline: tl } : {}) });

const FORD_LANE: StoneLane = laneOf(installation(FORD1))!;

/** 격자선: 줄의 위아래로 5 px씩 나온 세로선(글자나 돌의 사선 무늬와 구분된다) */
const gridLines = (g: FakeGraphics): unknown[][] => g.calls('lineBetween').filter((a) => a[0] === a[2] && a[1] === FORD_LANE.cross - 5 && a[3] === FORD_LANE.cross + FORD_LANE.crossSize + 5);

/** 손으로 만든 모습을 직접 그리는 층 */
function direct() {
  const scene = new FakeScene();
  const first = installation(FORD1);
  const second = installation(FORD2);
  const scale = installation('inst.village.scale-stones');
  const layer = new TimelineLayer(scene as never, [first, second, scale], DEPTH);
  const g = new FakeGraphics();
  const draw = (tl: TimelineView | undefined, active: boolean, inst = first) => {
    g.reset();
    return layer.draw(g as never, inst, viewOf(inst, tl), active);
  };
  return { scene, first, second, scale, layer, g, draw };
}

describe('층을 만들 때', () => {
  it('징검다리 설치물만 맡는다(돌 설치물과 모르는 설치물은 맡지 않는다)', () => {
    const t = direct();
    expect(t.layer.has(FORD1)).toBe(true);
    expect(t.layer.has(FORD2)).toBe(true);
    expect(t.layer.has('inst.village.scale-stones')).toBe(false);
    expect(t.layer.has('inst.nowhere')).toBe(false);
  });

  it('글자는 설치물마다 미리 만들어 두고 처음에는 모두 숨긴다(프레임마다 새로 만들지 않는다)', () => {
    const t = direct();
    // 설치물 하나당 돌 이름·쉼·! 표·♪·남은 물·박 번호·뗏목 번호 일곱 묶음, 묶음마다 칸 수(8)만큼
    expect(t.scene.texts).toHaveLength(2 * 7 * 8);
    expect(t.scene.texts.every((x) => !x.visible)).toBe(true);
    expect(t.scene.texts.every((x) => x.depth === DEPTH + 1)).toBe(true);
    const before = t.scene.texts.length;
    t.draw(timeline({ stones: [mark(0, 960), mark(960, 1920, { kind: 'rest', name: null, midi: null })] }), true);
    t.draw(timeline(), true);
    expect(t.scene.texts).toHaveLength(before);
  });

  it('모르는 설치물이거나 모습에 징검다리가 없으면 아무것도 그리지 않는다', () => {
    const t = direct();
    const empty = { stones: [], water: [], waterEmphasis: false, cursor: null, playTick: null, shoreRocks: null, beats: 0, rafts: 0 };
    expect(t.layer.draw(t.g as never, t.scale, viewOf(t.scale, timeline()), true)).toEqual(empty);
    expect(t.draw(undefined, true)).toEqual(empty);
    expect(t.layer.draw(t.g as never, t.first, undefined, true)).toEqual(empty);
    expect(t.g.log).toEqual([]);
  });

  it('모습이 사라지면 이전에 보이던 글자도 숨긴다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 960)] }), true);
    expect(t.scene.shown()).toContain('C4');
    t.draw(undefined, true);
    expect(t.scene.shown()).toEqual([]);
  });
});

describe('바닥: 격자, 남은 물, 박 번호(설치물 모드에서만)', () => {
  it('설치물 모드의 빈 마디: 격자선, 물결 무늬의 남은 물, 박 번호 1 2 3 4', () => {
    const t = direct();
    const out = t.draw(timeline(), true);
    expect(out.beats).toBe(4);
    expect(out.shoreRocks).toBeNull();
    expect(out.water).toEqual([{ from: 0, to: 3840, flagged: false, labelled: false, emphasised: false }]);
    expect(t.scene.shown()).toEqual(['1', '2', '3', '4']);
    // 격자선은 박마다 한 줄(0, 960, …, 3840 → 5줄). 물결은 칸마다 두 줄(4칸 × 2)
    expect(t.g.count('lineBetween')).toBe(5);
    expect(t.g.count('beginPath')).toBe(8);
    // 첫 격자선은 줄의 왼쪽 끝에서 줄 폭 + 양쪽 5 px을 긋는다
    expect(t.g.calls('lineBetween')[0]).toEqual([6760, 2752 - 5, 6760, 2752 + 96 + 5]);
  });

  it('박 번호는 박이 시작하는 선 바로 안쪽, 줄 위쪽 띠에 선다', () => {
    const t = direct();
    t.draw(timeline(), true);
    const numbers = t.scene.texts.filter((x) => x.visible);
    expect(numbers.map((x) => [x.x, x.y])).toEqual([0, 960, 1920, 2880].map((tick) => [6760 + tick / 8 + 20, 2752 - 22 + 1]));
  });

  it('걷는 중(설치물 모드 밖)에는 격자, 남은 물, 박 번호, 놓으려는 자리, 박 번호가 없고 놓은 돌만 풍경으로 남는다', () => {
    const t = direct();
    const stones = [mark(0, 960), mark(960, 1920, { kind: 'rest', name: null, midi: null })];
    const cursor = { startTick: 1920, endTick: 2880, kind: 'note' as const, ok: true };
    const out = t.draw(timeline({ stones, cursor }), false);
    expect(out.beats).toBe(0);
    expect(out.water).toEqual([]);
    expect(out.cursor).toBeNull();
    expect(out.stones).toHaveLength(2);
    // 격자선도, 물결도, 놓으려는 자리(▼)도 그리지 않는다
    expect(gridLines(t.g)).toHaveLength(0);
    expect(t.g.count('beginPath')).toBe(0);
    expect(t.g.count('fillTriangle')).toBe(0);
    expect(t.scene.shown().sort()).toEqual(['C4', '쉼'].sort());
    // 같은 모습을 설치물 모드로 그리면 격자, 물결, 놓으려는 자리가 생긴다
    const active = t.draw(timeline({ stones, cursor }), true);
    expect(gridLines(t.g)).toHaveLength(5);
    expect(t.g.count('beginPath')).toBeGreaterThan(0);
    expect(t.g.count('fillTriangle')).toBe(1);
    expect(active.cursor).toEqual({ startTick: 1920, endTick: 2880, kind: 'note', ok: true });
  });

  it('3/4박자 과제: 쓰지 않는 오른쪽 구간을 물가 바위로 덮는다. 설치물 모드에서도 걷는 중에도 덮여 있다', () => {
    const t = direct();
    const three = timeline({ measureTicks: 2880, water: [{ from: 0, to: 2880, flagged: false }] });
    const active = t.draw(three, true);
    expect(active.shoreRocks).toEqual({ from: 2880, to: 3840 });
    expect(active.beats).toBe(3);
    expect(t.scene.shown()).toEqual(['1', '2', '3']);
    // 격자선은 마디 안쪽만: 0, 960, 1920, 2880 → 4줄(마디 끝 뒤의 바위 구간에는 긋지 않는다)
    expect(gridLines(t.g).map((a) => a[0])).toEqual([0, 960, 1920, 2880].map((tick) => 6760 + tick / 8));
    // 바위는 오른쪽 120 px(2880~3840틱) 칸을 2 px 넉넉히 덮는다
    expect(t.g.calls('fillRoundedRect')).toContainEqual([7118, 2750, 124, 100, 14]);
    const walking = t.draw(three, false);
    expect(walking.shoreRocks).toEqual({ from: 2880, to: 3840 });
    expect(walking.beats).toBe(0);
    expect(gridLines(t.g)).toHaveLength(0);
    expect(t.g.calls('fillRoundedRect')).toContainEqual([7118, 2750, 124, 100, 14]);
    // 바위는 사선 무늬와 둥근 덩어리를 그린다(색만으로 '쓰지 않음'을 말하지 않는다)
    expect(t.g.count('lineBetween')).toBeGreaterThan(0);
    expect(t.g.count('fillCircle')).toBeGreaterThan(0);
    expect(t.g.count('strokeCircle')).toBeGreaterThan(0);
  });

  it('4/4 과제에는 물가 바위가 없다', () => {
    const t = direct();
    expect(t.draw(timeline(), true).shoreRocks).toBeNull();
    expect(t.draw(timeline(), false).shoreRocks).toBeNull();
  });
});

describe('돌', () => {
  it('울림돌은 음 이름 글자가 든 돌이다. 돌 한 개가 덮는 틱 구간을 칸이 아니라 시작~끝으로 그린다', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 960), mark(960, 2880, { name: 'D4', midi: 62 })] }), false);
    const a = stoneBox(FORD_LANE, 0, 960, 2, 8);
    const b = stoneBox(FORD_LANE, 960, 2880, 2, 8);
    expect(out.stones.map((s) => ({ startTick: s.startTick, endTick: s.endTick, kind: s.kind, label: s.label, x: s.x, y: s.y, w: s.w, h: s.h }))).toEqual([
      { startTick: 0, endTick: 960, kind: 'note', label: 'C4', ...a },
      { startTick: 960, endTick: 2880, kind: 'note', label: 'D4', ...b },
    ]);
    // 4/4 줄의 첫 박은 120 px, 양끝을 2 px씩 줄이고 위아래를 8 px씩 줄인다
    expect(a).toEqual({ x: 6762, y: 2760, w: 116, h: 80 });
    // 두 박을 덮는 돌은 그만큼 길다
    expect(b).toEqual({ x: 6882, y: 2760, w: 236, h: 80 });
    expect(t.scene.shown().sort()).toEqual(['C4', 'D4']);
  });

  it('돌 위의 글자는 돌 한가운데에 서고, 좁은 돌에는 줄여 넣는다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 960), mark(960, 1200, { name: 'D4', midi: 62 })] }), false);
    const [wide, narrow] = t.scene.texts.filter((x) => x.visible);
    const a = stoneBox(FORD_LANE, 0, 960, 2, 8);
    expect([wide!.x, wide!.y]).toEqual([a.x + a.w / 2, a.y + a.h / 2]);
    expect(wide!.scaleValue).toBe(1);
    // 240틱 = 30 px, 글자 폭 28 px에 여백 10 px을 더하면 들어가지 않으므로 줄인다(하한 0.5)
    expect(narrow!.scaleValue).toBeLessThan(1);
    expect(narrow!.scaleValue).toBeGreaterThanOrEqual(0.5);
  });

  it('이끼돌(쉼표)은 이름이 아니라 쉼 글자와 사선 무늬로 그린다', () => {
    const t = direct();
    const withRest = t.draw(timeline({ stones: [mark(0, 960, { kind: 'rest', name: null, midi: null })] }), false);
    expect(withRest.stones[0]).toMatchObject({ kind: 'rest', label: '쉼', dotted: false });
    expect(t.scene.shown()).toEqual(['쉼']);
    const hatch = t.g.count('lineBetween');
    expect(hatch).toBeGreaterThan(0);
    // 울림돌에는 사선 무늬가 없다
    t.draw(timeline({ stones: [mark(0, 960)] }), false);
    expect(t.g.count('lineBetween')).toBe(0);
  });

  it('점이 붙은 돌은 오른쪽 끝에 점을 찍고 글자를 왼쪽으로 조금 옮긴다', () => {
    const t = direct();
    const plain = t.draw(timeline({ stones: [mark(0, 1440)] }), false);
    const plainCircles = t.g.count('fillCircle');
    const plainText = t.scene.texts.find((x) => x.visible)!;
    const plainX = plainText.x;
    const dotted = t.draw(timeline({ stones: [mark(0, 1440, { dotted: true })] }), false);
    expect(plain.stones[0]!.dotted).toBe(false);
    expect(dotted.stones[0]!.dotted).toBe(true);
    expect(t.g.count('fillCircle')).toBe(plainCircles + 1);
    const box = stoneBox(FORD_LANE, 0, 1440, 2, 8);
    expect(t.g.calls('fillCircle').at(-1)).toEqual([box.x + box.w - 11, box.y + box.h / 2, 4.5]);
    expect(t.scene.texts.find((x) => x.visible)!.x).toBe(plainX - 5);
  });

  it('판정이 가리킨 돌은 산호색 배지와 ! 글자를 단다(색만으로 말하지 않는다)', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 960), mark(960, 1920, { flagged: true })] }), true);
    expect(out.stones.map((s) => s.flagged)).toEqual([false, true]);
    const box = stoneBox(FORD_LANE, 960, 1920, 2, 8);
    const bang = t.scene.texts.find((x) => x.visible && x.content === '!')!;
    expect(bang).toBeDefined();
    expect([bang.x, bang.y]).toEqual([box.x + box.w - 7, box.y + 7 + 1]);
    expect(bang.scaleValue).toBe(0.8);
    expect(t.scene.shown().filter((c) => c === '!')).toHaveLength(1);
  });

  it('듣는 울림돌은 금빛 테두리와 ♪ 글자를 달고, 듣는 이끼돌은 테두리만 단다(쉼표는 소리가 없다)', () => {
    const t = direct();
    const note = t.draw(timeline({ stones: [mark(0, 960, { playing: true })] }), false);
    expect(note.stones[0]!.playing).toBe(true);
    const box = stoneBox(FORD_LANE, 0, 960, 2, 8);
    const glyph = t.scene.texts.find((x) => x.visible && x.content === '♪')!;
    expect([glyph.x, glyph.y]).toEqual([box.x + box.w / 2, box.y - 20]);
    const rest = t.draw(timeline({ stones: [mark(0, 960, { kind: 'rest', name: null, midi: null, playing: true })] }), false);
    expect(rest.stones[0]!.playing).toBe(true);
    expect(t.scene.shown()).toEqual(['쉼']);
    expect(t.g.count('strokeRoundedRect')).toBeGreaterThanOrEqual(2);
  });

  it('셋잇단 뗏목: 한 벌로 묶인 돌 아래에 널을 대고 3을 단다', () => {
    const t = direct();
    const stones = [mark(0, 320, { groupId: 'g1', groupSize: 3 }), mark(320, 640, { groupId: 'g1', groupSize: 3, name: 'D4', midi: 62 }), mark(640, 960, { groupId: 'g1', groupSize: 3, name: 'E4', midi: 64 })];
    // 박 번호(1 2 3 4)와 섞이지 않게 설치물 모드 밖에서 본다
    const out = t.draw(timeline({ stones }), false);
    expect(out.rafts).toBe(1);
    expect(out.stones).toHaveLength(3);
    expect(out.stones.every((s) => s.raft)).toBe(true);
    expect(t.scene.shown().filter((c) => c === '3')).toHaveLength(1);
    // 널은 줄 아래쪽에 돌 세 개를 한꺼번에 받치고(첫 돌 시작~마지막 돌 끝), 번호 원은 널 바로 아래에 선다
    expect(t.g.calls('fillRoundedRect')).toContainEqual([6762, 2837, 116, 10, 4]);
    expect(t.g.calls('fillCircle')).toContainEqual([6820, 2863, 14]);
    const three = t.scene.texts.find((x) => x.visible && x.content === '3')!;
    expect([three.x, three.y]).toEqual([6820, 2864]);
    // 묶음이 아닌 돌에는 널도 번호도 없다
    const plain = t.draw(timeline({ stones: [mark(0, 960)] }), false);
    expect(plain.rafts).toBe(0);
    expect(plain.stones[0]!.raft).toBe(false);
    expect(t.scene.shown()).not.toContain('3');
    expect(t.g.calls('fillRoundedRect')).not.toContainEqual([6762, 2837, 116, 10, 4]);
  });

  it('묶음마다 널이 따로이고, 묶음의 돌 수가 번호가 된다', () => {
    const t = direct();
    const a = { groupId: 'g1', groupSize: 3 };
    const b = { groupId: 'g2', groupSize: 2 };
    const stones = [mark(0, 320, a), mark(320, 640, a), mark(640, 960, a), mark(1920, 2400, b), mark(2400, 2880, b)];
    const out = t.draw(timeline({ stones }), false);
    expect(out.rafts).toBe(2);
    expect(t.scene.shown().filter((c) => c === '3' || c === '2')).toEqual(['3', '2']);
  });
});

describe('남은 물: 판정이 알리면 강조한다', () => {
  it('강조가 없으면 물결 무늬만 있다(맞고 틀림을 말하지 않는다)', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 960)], water: [{ from: 960, to: 3840, flagged: false }] }), true);
    expect(out.waterEmphasis).toBe(false);
    expect(out.water).toEqual([{ from: 960, to: 3840, flagged: false, labelled: false, emphasised: false }]);
    expect(t.scene.shown()).not.toContain('남은 물');
  });

  it('마디가 덜 채워졌다는 판정이 있으면 산호색 테두리와 \'남은 물\' 글자로 강조한다(구간이 넓을 때)', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 960)], water: [{ from: 960, to: 3840, flagged: true }], waterEmphasis: true }), true);
    expect(out.waterEmphasis).toBe(true);
    expect(out.water).toEqual([{ from: 960, to: 3840, flagged: true, labelled: true, emphasised: true }]);
    const label = t.scene.texts.find((x) => x.visible && x.content === '남은 물')!;
    const box = stoneBox(FORD_LANE, 960, 3840, 3, 6);
    expect([label.x, label.y]).toEqual([box.x + box.w / 2, box.y + box.h / 2]);
  });

  it('좁은 물 구간에는 글자를 달지 않고 테두리와 문장이 알린다(글자가 돌에 겹치지 않게)', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 1920)], water: [{ from: 1920, to: 2880, flagged: true }, { from: 2880, to: 3840, flagged: true }], waterEmphasis: true }), true);
    expect(out.water.map((w) => [w.emphasised, w.labelled])).toEqual([
      [true, false],
      [true, false],
    ]);
    expect(t.scene.shown()).not.toContain('남은 물');
  });

  it('판정이 가리킨 물 구간만 강조되고 강조 표시가 없는 구간은 그대로다', () => {
    const t = direct();
    const out = t.draw(timeline({ water: [{ from: 960, to: 1920, flagged: true }, { from: 2880, to: 3840, flagged: false }], waterEmphasis: false }), true);
    expect(out.water.map((w) => w.emphasised)).toEqual([true, false]);
  });
});

describe('놓으려는 자리와 듣는 중의 물결 선', () => {
  it('놓을 수 있는 자리는 윤곽과 ▼를, 놓을 수 없는 자리는 윤곽과 × 표시를 그린다', () => {
    const t = direct();
    const base = timeline({ stones: [mark(0, 960)], water: [{ from: 960, to: 3840, flagged: false }] });
    t.draw(base, true);
    const baseTriangles = t.g.count('fillTriangle');
    const baseLines = t.g.count('lineBetween');
    const ok = t.draw({ ...base, cursor: { startTick: 960, endTick: 1920, kind: 'note', ok: true } }, true);
    expect(ok.cursor).toEqual({ startTick: 960, endTick: 1920, kind: 'note', ok: true });
    expect(t.g.count('fillTriangle')).toBe(baseTriangles + 1);
    expect(t.g.count('lineBetween')).toBe(baseLines);
    const no = t.draw({ ...base, cursor: { startTick: 0, endTick: 960, kind: 'note', ok: false } }, true);
    expect(no.cursor).toEqual({ startTick: 0, endTick: 960, kind: 'note', ok: false });
    expect(t.g.count('fillTriangle')).toBe(baseTriangles);
    expect(t.g.count('lineBetween')).toBe(baseLines + 2);
  });

  it('비우기의 자리는 지울 돌 전체를 감싼다', () => {
    const t = direct();
    const out = t.draw(timeline({ stones: [mark(0, 1920)], water: [{ from: 1920, to: 3840, flagged: false }], cursor: { startTick: 0, endTick: 1920, kind: 'erase', ok: true } }), true);
    expect(out.cursor).toEqual({ startTick: 0, endTick: 1920, kind: 'erase', ok: true });
  });

  it('듣는 중에는 줄을 가로지르는 선이 재생 위치를 따라간다', () => {
    const t = direct();
    const out = t.draw(timeline({ playTick: 1440 }), false);
    expect(out.playTick).toBe(1440);
    // 1440틱 = 180 px: 줄의 위아래로 10 px씩 나온 선
    expect(t.g.calls('lineBetween')).toContainEqual([6760 + 180, 2752 - 10, 6760 + 180, 2752 + 96 + 10]);
    const none = t.draw(timeline({ playTick: null }), false);
    expect(none.playTick).toBeNull();
    expect(t.g.calls('lineBetween')).toEqual([]);
  });
});

describe('세로 줄과 좌표', () => {
  const vertical: StoneLane = { axis: 'y', start: 700, cross: 6700, crossSize: 96, ticksPerPx: 2, cellTicks: 120, laneTicks: 3840, voiceId: 'v1' };

  it('stoneBox: 가로 줄은 시간 방향이 x이고 위아래를 margin만큼 줄인다', () => {
    expect(stoneBox(FORD_LANE, 0, 960, 2, 8)).toEqual({ x: 6762, y: 2760, w: 116, h: 80 });
    expect(stoneBox(FORD_LANE, 960, 1920, 0, 0)).toEqual({ x: 6880, y: 2752, w: 120, h: 96 });
  });

  it('stoneBox: 세로 줄은 시간 방향이 y이고 좌우를 margin만큼 줄인다', () => {
    expect(stoneBox(vertical, 0, 960, 2, 8)).toEqual({ x: 6708, y: 702, w: 80, h: 476 });
  });

  it('줄이 너무 좁으면 폭이 0 아래로 내려가지 않는다', () => {
    expect(stoneBox(FORD_LANE, 0, 8, 2, 8).w).toBe(0);
    expect(stoneBox({ ...FORD_LANE, crossSize: 10 }, 0, 960, 2, 8).h).toBe(0);
  });
});

describe('잔물결 수로(E3): 세로로 긴 확대형 줄', () => {
  const channel = installation(E3);
  const LANE: StoneLane = laneOf(channel)!;
  /** 32분음표 칸(120틱)의 4/4 마디: 줄은 32칸, 박 하나는 480 px(8칸) */
  const tl = (extra: Partial<TimelineView> = {}): TimelineView => timeline({ gridTicks: 120, water: [{ from: 0, to: 3840, flagged: false }], ...extra });

  function e3() {
    const scene = new FakeScene();
    const layer = new TimelineLayer(scene as never, [channel], DEPTH);
    const g = new FakeGraphics();
    const draw = (view: TimelineView | undefined, active: boolean) => {
      g.reset();
      return layer.draw(g as never, channel, viewOf(channel, view), active);
    };
    return { scene, layer, g, draw };
  }
  const raft = (from: number, each: number, id = 'g1', names = ['D4', 'E4', 'F4']): StoneMark[] => names.map((name, i) => mark(from + i * each, from + (i + 1) * each, { groupId: id, groupSize: 3, name }));

  it('줄은 세로다: 시간이 아래로 흐르고 한 마디는 1920 px이다', () => {
    expect(LANE).toMatchObject({ axis: 'y', start: 700, cross: 6656, crossSize: 96, ticksPerPx: 2, cellTicks: 120, laneTicks: 3840 });
    expect(laneOf(channel)!.laneTicks / LANE.ticksPerPx).toBe(1920);
  });

  it('격자선은 줄을 가로지르는 가로선이다: 칸마다 옅게 33줄, 박마다 굵게 5줄', () => {
    const t = e3();
    t.draw(tl(), true);
    const lines = t.g.calls('lineBetween');
    expect(lines).toHaveLength(33);
    expect(lines.every((a) => a[1] === a[3] && a[0] === LANE.cross - 5 && a[2] === LANE.cross + LANE.crossSize + 5)).toBe(true);
    expect(lines[0]).toEqual([6651, 700, 6757, 700]);
    expect(lines[32]).toEqual([6651, 2620, 6757, 2620]);
    // 박의 선만 굵다(두께 3): 700, 1180, 1660, 2140, 2620
    const beatStyles = t.g.calls('lineStyle').filter((a) => a[0] === 3);
    expect(beatStyles).toHaveLength(5);
  });

  it('남은 물의 물결 무늬는 칸마다 두 줄이다(32칸 × 2)', () => {
    const t = e3();
    const out = t.draw(tl(), true);
    expect(t.g.count('beginPath')).toBe(64);
    expect(out.water).toEqual([{ from: 0, to: 3840, flagged: false, labelled: false, emphasised: false }]);
  });

  it('박 번호는 줄 왼쪽 띠에 서고, 박이 시작하는 선 바로 아래(안쪽)에 선다', () => {
    const t = e3();
    const out = t.draw(tl(), true);
    expect(out.beats).toBe(4);
    const numbers = t.scene.texts.filter((x) => x.visible);
    expect(numbers.map((x) => x.content)).toEqual(['1', '2', '3', '4']);
    expect(numbers.map((x) => [x.x, x.y])).toEqual([0, 1, 2, 3].map((k) => [LANE.cross - 22, 700 + 480 * k + 20 + 1]));
    // 번호의 원(반지름 14)은 이름 띠(왼쪽 44 px) 안에 든다
    for (const [cx, , r] of t.g.calls('fillCircle') as number[][]) {
      expect(cx! - r!).toBeGreaterThanOrEqual(LANE.cross - STONES_LABEL_TOP);
      expect(cx! + r!).toBeLessThanOrEqual(LANE.cross);
    }
  });

  it('돌은 시간 방향(y)으로 틱에 비례해 길고, 줄 폭 안에서 양옆 8 px을 띄운다', () => {
    const t = e3();
    const out = t.draw(tl({ stones: [mark(0, 960), mark(960, 1920, { kind: 'rest', name: null, midi: null })] }), false);
    expect(out.stones.map((s) => [s.label, s.x, s.y, s.w, s.h])).toEqual([
      ['C4', 6664, 702, 80, 476],
      ['쉼', 6664, 1182, 80, 476],
    ]);
    // 글자는 돌 한가운데에 선다
    const c4 = t.scene.texts.find((x) => x.visible && x.content === 'C4')!;
    expect([c4.x, c4.y]).toEqual([6704, 702 + 238]);
  });

  it('칸 하나(120틱)짜리 돌 32개도 모두 글자를 단다(글자 묶음은 칸 수만큼 미리 만들어 둔다)', () => {
    const t = e3();
    const stones = Array.from({ length: 32 }, (_, i) => mark(i * 120, (i + 1) * 120, { name: 'C4' }));
    const out = t.draw(tl({ stones, water: [] }), true);
    expect(out.stones).toHaveLength(32);
    expect(t.scene.texts.filter((x) => x.visible && x.content === 'C4')).toHaveLength(32);
    // 칸 수만큼 만드는 묶음 다섯(이름·쉼·! 표·♪·남은 물)과 박 번호·뗏목 번호 여덟씩
    expect(t.scene.texts).toHaveLength(5 * 32 + 8 + 8);
    // 돌 하나는 60 px 길이에서 양끝 2 px씩 줄인다
    expect(out.stones[0]).toMatchObject({ y: 702, h: 56 });
  });

  it('셋잇단 뗏목: 돌 세 개 옆(줄의 오른쪽 가장자리)에 널을 길게 대고, 오른쪽 띠에 ‘3’을 단다', () => {
    const t = e3();
    const stones = [mark(0, 960), ...raft(960, 320)];
    const out = t.draw(tl({ stones }), false);
    expect(out.rafts).toBe(1);
    expect(out.stones.filter((s) => s.raft).map((s) => [s.y, s.h])).toEqual([
      [1182, 156],
      [1342, 156],
      [1502, 156],
    ]);
    // 널: 뗏목 전체(960–1919틱 = 480 px)를 한꺼번에 받친다
    expect(t.g.calls('fillRoundedRect')).toContainEqual([6741, 1182, 10, 476, 4]);
    // '3'의 원은 오른쪽 띠(줄 오른쪽 끝에서 32 px) 안에 들고 널의 가운데 높이에 선다
    expect(t.g.calls('fillCircle')).toContainEqual([6767, 1420, 14]);
    const three = t.scene.texts.find((x) => x.visible && x.content === '3')!;
    expect([three.x, three.y]).toEqual([6767, 1421]);
    expect(6767 - 14).toBeGreaterThanOrEqual(LANE.cross + LANE.crossSize);
    expect(6767 + 14).toBeLessThanOrEqual(LANE.cross + LANE.crossSize + STONES_RAFT_BAND);
    // 널과 돌 사이: 널은 돌 오른쪽 가장자리(돌은 줄 폭에서 8 px 안쪽)와 겹쳐 돌이 널 위에 놓인 것처럼 보인다
    expect(6741).toBeGreaterThanOrEqual(6664 + 80 - 11);
  });

  it('두 종류의 뗏목(8분 셋잇단 한 박, 4분 셋잇단 두 박)이 한 마디에 함께 있어도 널과 번호가 따로다', () => {
    const t = e3();
    const stones = [mark(0, 960), ...raft(960, 320, 'g1'), ...raft(1920, 640, 'g2', ['G4', 'A4', 'G4'])];
    const out = t.draw(tl({ stones }), false);
    expect(out.rafts).toBe(2);
    expect(t.scene.shown().filter((c) => c === '3')).toHaveLength(2);
    expect(t.g.calls('fillRoundedRect')).toContainEqual([6741, 1182, 10, 476, 4]);
    // 둘째 뗏목은 1920–3839틱(960 px)에 걸친 널 하나다
    expect(t.g.calls('fillRoundedRect')).toContainEqual([6741, 1662, 10, 956, 4]);
    expect(t.g.calls('fillCircle')).toContainEqual([6767, 2140, 14]);
  });

  it('놓으려는 자리: 뗏목 전체의 윤곽에 ▼가 줄 왼쪽에 붙는다. 놓을 수 없으면 윤곽에 × 표시다', () => {
    const t = e3();
    t.draw(tl({ cursor: { startTick: 960, endTick: 1920, kind: 'raft', ok: true } }), true);
    // 윤곽: 줄 폭에서 4 px 안쪽, 시간 방향으로 한 박(480 px)
    expect(t.g.calls('fillRoundedRect')).toContainEqual([6660, 1180, 88, 480, 14]);
    // ▼는 줄의 왼쪽(이름 띠)에서 오른쪽을 가리킨다
    expect(t.g.calls('fillTriangle')).toContainEqual([6624, 1407, 6624, 1433, 6647, 1420]);
    const bad = e3();
    bad.draw(tl({ cursor: { startTick: 2880, endTick: 4800, kind: 'raft', ok: false } }), true);
    expect(bad.g.count('fillTriangle')).toBe(0);
    // × 표시: 윤곽의 한가운데
    const cross = bad.g.calls('lineBetween').filter((a) => (a[2] as number) - (a[0] as number) === 28);
    expect(cross).toHaveLength(2);
  });

  it('듣는 중의 물결 선: 줄을 가로지르는 금빛 가로선이 틱에 맞춰 내려간다', () => {
    const t = e3();
    t.draw(tl({ playTick: 1440 }), false);
    // 1440틱 = 720 px → y 1420
    expect(t.g.calls('lineBetween')).toContainEqual([6646, 1420, 6762, 1420]);
    expect(t.g.calls('fillCircle')).toContainEqual([6643, 1420, 8]);
  });

  it('줄보다 짧은 마디는 남는 구간을 물가 바위가 아래쪽에서 덮는다', () => {
    const t = e3();
    const out = t.draw(tl({ measureTicks: 2880, water: [{ from: 0, to: 2880, flagged: false }] }), false);
    expect(out.shoreRocks).toEqual({ from: 2880, to: 3840 });
    // 2880틱 = 1440 px부터 줄 끝(1920 px)까지 480 px
    expect(t.g.calls('fillRoundedRect')[0]).toEqual([LANE.cross - 2, 700 + 1440 - 2, LANE.crossSize + 4, 480 + 4, 14]);
  });

  it('걷는 중(설치물 모드 밖)에는 격자와 박 번호가 없고 돌과 뗏목은 풍경으로 남는다', () => {
    const t = e3();
    const out = t.draw(tl({ stones: [mark(0, 960), ...raft(960, 320)], cursor: { startTick: 0, endTick: 960, kind: 'note', ok: true } }), false);
    expect(out.beats).toBe(0);
    expect(out.cursor).toBeNull();
    expect(out.rafts).toBe(1);
    expect(t.g.calls('lineBetween')).toEqual([]);
    expect(t.scene.shown()).toEqual(['C4', 'D4', 'E4', 'F4', '3']);
  });
});

describe('다른 설치물과 지우기', () => {
  it('설치물마다 글자 묶음이 따로다: 한 줄을 그려도 다른 줄의 글자는 건드리지 않는다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 960)] }), false, t.first);
    expect(t.scene.shown()).toEqual(['C4']);
    t.draw(timeline({ stones: [mark(0, 960, { name: 'G4', midi: 67 })] }), false, t.second);
    expect(t.scene.shown().sort()).toEqual(['C4', 'G4']);
    // 같은 줄을 다시 그리면 그 줄의 글자만 새로 쓴다
    t.draw(timeline(), false, t.first);
    expect(t.scene.shown()).toEqual(['G4']);
  });

  it('지우면 글자를 모두 부순다', () => {
    const t = direct();
    t.draw(timeline({ stones: [mark(0, 960)] }), true);
    t.layer.destroy();
    expect(t.scene.texts.every((x) => x.destroyed)).toBe(true);
    expect(t.layer.has(FORD1)).toBe(false);
  });
});

// ───── 설치물 컨트롤러 → 다리 → 설치물 층의 전체 길 ─────

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
  const r = rig({ definitions: [Q02, Q13, Q16, Q14, Q15].map(quest) });
  const bridge = new WorldBridge({ x: 6700, y: 2800, facing: 'right' });
  const first = installation(FORD1);
  const second = installation(FORD2);
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
    installations: [first, second],
    panels: new Set(['panel.rhythm']),
    frames,
  });
  const scene = new FakeScene();
  const layer = new InstallationLayer(scene as never, [first, second, scale], bridge, fakeCull());
  const press = (slot: number, inst = first): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot });
  const drawn = (id = FORD1) => {
    layer.update(0, false);
    return layer.debug().find((d) => d.installationId === id)!;
  };
  return { ...r, bridge, first, second, scale, ic, frames, scene, layer, press, drawn };
}

describe('설치물 층의 징검다리 길', () => {
  it('징검다리는 timeline을 돌려주고, 돌 설치물에는 timeline이 없다. 징검다리에는 칸마다의 글자를 따로 만들지 않는다', () => {
    const t = pipeline();
    t.layer.update(0, false);
    const all = t.layer.debug();
    expect(all.map((d) => d.installationId)).toEqual([FORD1, FORD2, 'inst.village.scale-stones']);
    expect(all[0]!.timeline).toBeDefined();
    expect(all[1]!.timeline).toBeDefined();
    expect(all[2]!.timeline).toBeUndefined();
    expect(all[0]!.slots).toHaveLength(8);
    expect(all[0]!.slots.every((s) => !s.numbered)).toBe(true);
    // 칸 번호 글자(돌 설치물용)는 징검다리에 없다: 징검다리 두 줄의 글자 112개 + 돌 설치물의 칸별 글자
    const stoneSlots = t.scale.slots.length;
    expect(t.scene.texts).toHaveLength(2 * 7 * 8 + stoneSlots * 4);
  });

  it('들어가 놓으면 돌이 그려지고 칸 요약에 이름이 보인다. 설치물 모드 밖의 줄은 active가 아니다', () => {
    const t = pipeline();
    t.ic.enter('E1');
    t.ic.select(REST_KEY);
    t.press(1);
    t.bridge.events.send({ type: 'slot-pressed', installationId: FORD1, slot: 5 });
    const d = t.drawn();
    expect(d.active).toBe(true);
    expect(d.timeline!.stones.map((s) => [s.startTick, s.endTick, s.label])).toEqual([
      [0, 960, 'C4'],
      [1920, 2880, 'C4'],
    ]);
    expect(d.slots.map((s) => s.label)).toEqual(['C4', 'C4', null, null, 'C4', 'C4', null, null]);
    expect(d.timeline!.beats).toBe(4);
    const other = t.drawn(FORD2);
    expect(other.active).toBe(false);
    expect(other.timeline!.beats).toBe(0);
    expect(other.timeline!.stones).toEqual([]);
  });

  it('고른 칸은 놓으려는 자리로 그려지고, 칸 요약의 selected도 설치물 모드에서만 켜진다', () => {
    const t = pipeline();
    t.ic.enter('E1');
    t.ic.select(REST_KEY);
    t.press(1);
    const d = t.drawn();
    expect(d.timeline!.cursor).toEqual({ startTick: 960, endTick: 1920, kind: 'note', ok: true });
    expect(d.slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([3, 4]);
    t.ic.exit();
    const walking = t.drawn();
    expect(walking.active).toBe(false);
    expect(walking.timeline!.cursor).toBeNull();
    expect(walking.slots.some((s) => s.selected)).toBe(false);
    // 돌은 풍경으로 남는다
    expect(walking.timeline!.stones.map((s) => s.label)).toEqual(['C4']);
    expect(walking.timeline!.beats).toBe(0);
  });

  it('3/4박자 과제를 열면 물가 바위가 덮이고, 나가도 덮여 있다', () => {
    const t = pipeline();
    t.ic.enter('E1');
    t.ic.select(THREE_KEY);
    expect(t.drawn().timeline!.shoreRocks).toEqual({ from: 2880, to: 3840 });
    expect(t.drawn().timeline!.beats).toBe(3);
    t.ic.exit();
    expect(t.drawn().timeline!.shoreRocks).toEqual({ from: 2880, to: 3840 });
  });

  it('틀린 배치를 확인하면 남은 물이 강조되고 틀린 돌에 배지가 달린다', () => {
    const t = pipeline();
    t.ic.enter('E1');
    t.ic.select(THREE_KEY);
    t.press(1);
    t.press(3);
    expect(t.drawn().timeline!.waterEmphasis).toBe(false);
    t.ic.timeline!.perform('check');
    const d = t.drawn();
    expect(d.timeline!.waterEmphasis).toBe(true);
    expect(d.timeline!.water).toEqual([{ from: 1920, to: 2880, flagged: true, labelled: false, emphasised: true }]);
    expect(d.timeline!.stones.map((s) => s.flagged)).toEqual([false, true]);
    expect(d.slots.map((s) => s.flagged)).toEqual([false, false, true, true, false, false, false, false]);
    expect(t.scene.shown()).toContain('!');
    // 고치면 지워진다
    t.ic.timeline!.perform('undo');
    expect(t.drawn().timeline!.waterEmphasis).toBe(false);
    expect(t.scene.shown()).not.toContain('!');
  });

  it('내 배치를 들으면 지금 울리는 돌이 표시되고 물결 선이 따라간다', () => {
    const t = pipeline();
    t.ic.enter('E1');
    t.ic.select(REST_KEY);
    t.press(1);
    t.press(3);
    t.ic.timeline!.perform('hear-mine');
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    const early = t.drawn();
    expect(early.timeline!.playTick).not.toBeNull();
    expect(early.timeline!.stones.map((s) => s.playing)).toEqual([true, false]);
    expect(t.scene.shown()).toContain('♪');
    t.run(1);
    t.frames.tick();
    const later = t.drawn();
    expect(later.timeline!.stones.map((s) => s.playing)).toEqual([false, true]);
    t.ic.timeline!.perform('stop');
    t.frames.tick();
    const stopped = t.drawn();
    expect(stopped.timeline!.playTick).toBeNull();
    expect(t.scene.shown()).not.toContain('♪');
  });

  it('매 프레임 글자를 새로 만들지 않는다(처음 만든 글자를 다시 쓴다)', () => {
    const t = pipeline();
    t.ic.enter('E1');
    t.ic.select(REST_KEY);
    const made = t.scene.texts.length;
    for (let i = 0; i < 5; i++) {
      t.press(1 + (i % 4) * 2);
      t.layer.update(i, false);
    }
    expect(t.scene.texts).toHaveLength(made);
  });
});
