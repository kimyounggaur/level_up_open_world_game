// 7-3 건반 다리(T6, 4.8)를 월드에 그리는 층(world/installations/keyBridgeLayer.ts, layer.ts의 위임): 다리의 bridge를 읽어 널 위의 커서와 울리는 널과 밟은 널,
// 흰 널의 이름(아래 띠), 이름표 자리, 말뚝과 밧줄과 읽기, 순서 깃발과 깃발 걸이, 표지판 악보를 옮겨 그린다.
// Phaser 없이 가짜 장면(tests/unit/fake-phaser.ts)으로 시험한다. 널 그림 자체는 바닥에 구워져 있어서(key-marsh-site 시험) 여기서는 겹쳐 얹는 표시만 본다.
// 실제 화면의 모습(색, 크기, 글자가 읽히는지)은 브라우저 흐름 시험과 사람의 눈이 본다.
// 앞쪽은 손으로 만든 모습으로 그리는 규칙(색만으로 말하지 않는다, 좌표, 그리는 차례, 걷는 중에 남는 것)을 확인하고, 뒤쪽은 설치물 컨트롤러 → 다리 → 층의 전체 길을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InstallationDef } from '@/domain/installation';
import { FLAG_CLOTH_H, FLAG_CLOTH_W, FLAG_POLE_H, FLAG_STACK_DY, NAME_TAGS, bridgeBounds, bridgeSignOf, flagPoleOf, flagRackSpotOf, planksOfInstallation, signBoardOf, stakeTopOf, tagBoxOf } from '@/domain/keyBridge';
import type { BridgeBox, BridgeFlagMark, BridgeRopeMark, BridgeTagMark, KeyBridgeView } from '@/domain/keyBridge';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView, SlotMark } from '@/platform/bridge';
import { InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { dashedRectSegments } from '@/world/installations/hatch';
import { KeyBridgeLayer } from '@/world/installations/keyBridgeLayer';
import { InstallationLayer, STEP_FLASH_SECONDS } from '@/world/installations/layer';
import { CORAL, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, TEAL, TEAL_LIGHT, WHITE, WHITE_CSS, WOOD, WOOD_DARK } from '@/world/installations/palette';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import { FakeGraphics, FakeScene, fakeCull } from './fake-phaser';
import type { FakeText } from './fake-phaser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q_SAME = 'pitch.same-sound-different-names';
const Q27 = 'key.black-key-names';
const Q28 = 'key.whole-and-half-steps';
const Q29 = 'key.build-intervals';
const Q30 = 'key.accidentals-in-a-bar';
const Q31 = 'scale.chromatic';
const K1_ID = 'inst.key-marsh.key-bridge';
const K2_ID = 'inst.key-marsh.interval-rope';
const K3_ID = 'inst.key-marsh.natural-bridge';
const K4_ID = 'inst.key-marsh.chromatic-path';
const DEPTH = -90_000;

const K1 = installation(K1_ID);
const K2 = installation(K2_ID);
const K3 = installation(K3_ID);
const K4 = installation(K4_ID);
const STATION: Record<string, string> = { [K1_ID]: 'K1', [K2_ID]: 'K2', [K3_ID]: 'K3', [K4_ID]: 'K4' };

/** Q30(G장조 F)의 표지판 악보: 조표 하나, 두 마디, 네 음(F♯ F♮ F♮ F♯) */
const SIGN = bridgeSignOf(quest(Q30).variants['g-major-f']!)!;

const rectOf = (inst: InstallationDef, slot: number) => inst.slots.find((s) => s.slot === slot)!;
const cxOf = (inst: InstallationDef, slot: number): number => rectOf(inst, slot).x + rectOf(inst, slot).w / 2;

// ───── 손으로 만든 모습 ─────

const viewOf = (task: KeyBridgeView['task'], extra: Partial<KeyBridgeView> = {}): KeyBridgeView => ({ task, cursor: null, playing: [], tags: [], ropes: [], flags: [], sign: null, free: false, ...extra });
const tagMark = (draft: number, plank: number, side: 'raised' | 'lowered', extra: Partial<BridgeTagMark> = {}): BridgeTagMark => ({ draft, plank, side, text: null, selected: false, flagged: false, ...extra });
const ropeMark = (qid: string, from: number, to: number | null, extra: Partial<BridgeRopeMark> = {}): BridgeRopeMark => ({ qid, from, to, text: null, selected: false, flagged: false, ...extra });
const flagMark = (draft: number, order: number, plank: number | null, extra: Partial<BridgeFlagMark> = {}): BridgeFlagMark => ({ draft, order, plank, selected: false, flagged: false, ...extra });
/** 널의 요약. 이름은 널의 이름(자유로 놀 때 검은 널의 이름이 이것을 읽는다) */
const namedMarks = (inst: InstallationDef): SlotMark[] => planksOfInstallation(inst).map((p) => ({ slot: p.slot, name: p.name, midi: p.midi, flagged: false, selected: false, playing: false }));
const forInst = (inst: InstallationDef, bridge?: KeyBridgeView, slots: readonly SlotMark[] = []): InstallationView => ({ installationId: inst.installationId, slots, ...(bridge ? { bridge } : {}) });

const K1_BLACKS = planksOfInstallation(K1).filter((p) => p.black);
const K1_WHITES = planksOfInstallation(K1).filter((p) => !p.black);
const K2_WHITES = planksOfInstallation(K2).filter((p) => !p.black);

/** 손으로 만든 모습을 직접 그리는 층 */
function direct(insts: InstallationDef[] = [K1, K2, K3]) {
  const scene = new FakeScene();
  const layer = new KeyBridgeLayer(scene as never, insts, DEPTH);
  const g = new FakeGraphics();
  const draw = (views: InstallationView[] = [], activeId: string | null = null, flashOf: (id: string, slot: number) => number = () => 0) => {
    g.reset();
    return layer.drawAll(() => g as never, views, activeId, flashOf);
  };
  /** 보이는 글자 가운데 내용이 같고 자리가 같은 것 */
  const textAt = (content: string, x: number, y: number): FakeText | undefined => scene.visibleTexts().find((t) => t.content === content && Math.abs(t.x - x) < 0.01 && Math.abs(t.y - y) < 0.01);
  const textsOf = (content: string): FakeText[] => scene.visibleTexts().filter((t) => t.content === content);
  return { scene, layer, g, draw, textAt, textsOf };
}

/** 그리기 호출이 처음 나온 자리(없으면 -1) */
const indexOf = (g: FakeGraphics, name: string, args: unknown[]): number => g.log.findIndex((c) => c.name === name && c.args.length === args.length && c.args.every((v, i) => v === args[i]));
/** 그리기 호출 바로 앞에서 정한 채움·선 모양 */
function styleBefore(g: FakeGraphics, kind: 'fillStyle' | 'lineStyle', name: string, args: unknown[]): unknown[] | undefined {
  const at = indexOf(g, name, args);
  for (let i = at - 1; at >= 0 && i >= 0; i--) if (g.log[i]!.name === kind) return g.log[i]!.args;
  return undefined;
}
const has = (g: FakeGraphics, name: string, args: unknown[]): boolean => indexOf(g, name, args) >= 0;
/** 널의 겉 사각형에 1 px 들여 겹쳐 얹는 표시(반짝임, 울림)의 인자 */
const insetArgs = (r: { x: number; y: number; w: number; h: number }): number[] => [r.x + 1, r.y + 1, r.w - 2, r.h - 2, 6];

const rectsOverlap = (a: BridgeBox, b: BridgeBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** 깃발 천의 사각형: 기둥 끝에서 오른쪽으로 30 × 22 */
const clothOf = (base: { x: number; y: number }): BridgeBox => ({ x: base.x, y: base.y - FLAG_POLE_H, w: FLAG_CLOTH_W, h: FLAG_CLOTH_H });

// ───── 처음 만들 때 ─────

describe('층을 만들 때', () => {
  it('건반 다리 설치물만 맡는다(돌 길과 모르는 설치물은 맡지 않는다)', () => {
    const t = direct([K1, K2, K3, K4]);
    for (const id of [K1_ID, K2_ID, K3_ID]) expect(t.layer.has(id), id).toBe(true);
    expect(t.layer.has(K4_ID)).toBe(false);
    expect(t.layer.has('inst.nowhere')).toBe(false);
    expect([...t.draw().keys()]).toEqual([K1_ID, K2_ID, K3_ID]);
    expect(direct([K4]).draw().size).toBe(0);
  });

  it('널 자리가 변환표와 맞지 않는 설치물은 맡지 않는다(콘텐츠 검사가 먼저 막는다)', () => {
    const broken: InstallationDef = { ...K2, slots: K2.slots.slice(1) };
    const t = direct([broken, K1]);
    expect(t.layer.has(K2_ID)).toBe(false);
    expect([...t.draw().keys()]).toEqual([K1_ID]);
  });

  it('글자는 쓰는 만큼만 그때그때 만들고 돌려 쓴다(프레임마다 새로 만들지 않는다). 쓰지 않는 글자는 숨긴다', () => {
    const t = direct();
    expect(t.scene.texts).toHaveLength(0);
    const free = viewOf('names', { free: true, tags: K1_BLACKS.map((p, i) => tagMark(i, p.slot, 'raised')) });
    t.draw([forInst(K1, free, namedMarks(K1))], K1_ID);
    // 흰 널 이름 열다섯, 검은 널 이름 열(자유로 놀 때), 이름표 자리의 '올림' 열
    expect(t.scene.texts).toHaveLength(35);
    expect(t.scene.visibleTexts()).toHaveLength(35);
    expect(t.scene.texts.every((x) => x.depth === DEPTH + 1)).toBe(true);
    const before = t.scene.texts.length;
    for (let i = 0; i < 5; i++) t.draw([forInst(K1, free, namedMarks(K1))], K1_ID);
    expect(t.scene.texts).toHaveLength(before);
    // 나가면 모두 숨고(글자는 그대로 남아 다음에 돌려 쓴다)
    t.draw([forInst(K1, free, namedMarks(K1))], null);
    expect(t.scene.texts).toHaveLength(before);
    expect(t.scene.visibleTexts()).toHaveLength(0);
  });

  it('지우면 글자를 모두 부수고 더는 맡지 않는다', () => {
    const t = direct();
    t.draw([forInst(K1, viewOf('names', { free: true }))], K1_ID);
    expect(t.scene.texts.length).toBeGreaterThan(0);
    t.layer.destroy();
    expect(t.scene.texts.every((x) => x.destroyed)).toBe(true);
    expect(t.layer.has(K1_ID)).toBe(false);
    expect(t.draw().size).toBe(0);
  });
});

// ───── 걷는 중 ─────

describe('걷는 중(설치물 모드 밖): 널 그림은 바닥에 있어서 겹쳐 얹을 것이 없다', () => {
  it('다리 모습이 없으면 세 다리 모두 비어 있고 아무것도 그리지 않는다', () => {
    const t = direct();
    const out = t.draw();
    expect([...out.keys()]).toEqual([K1_ID, K2_ID, K3_ID]);
    for (const d of out.values()) expect(d).toEqual({ task: null, free: false, names: [], cursor: null, playing: [], flashing: [], tags: [], ropes: [], flags: [], sign: null });
    expect(t.g.log).toEqual([]);
    expect(t.scene.texts).toHaveLength(0);
  });

  it('널 이름은 설치물 모드의 그 다리에서만 쓴다(다른 다리에 들어가 있거나 걷는 중에는 쓰지 않는다)', () => {
    const t = direct();
    const views = [forInst(K1, viewOf('names', { free: true })), forInst(K2, viewOf('interval'))];
    let out = t.draw(views, null);
    expect(out.get(K1_ID)!.names).toEqual([]);
    expect(out.get(K2_ID)!.names).toEqual([]);
    expect(t.scene.visibleTexts()).toHaveLength(0);
    out = t.draw(views, K2_ID);
    expect(out.get(K1_ID)!.names).toEqual([]);
    expect(out.get(K2_ID)!.names).toEqual(K2_WHITES.map((p) => p.name));
    expect(t.scene.shown().sort()).toEqual(K2_WHITES.map((p) => p.name).sort());
  });
});

// ───── 널 위의 표시 ─────

describe('널 위의 표시: 이름, 커서, 울리는 널, 밟은 널', () => {
  it('설치물 모드에서는 흰 널마다 이름이 널 아래 띠에 쓰이고, 검은 널의 이름은 쓰지 않는다(문제를 푸는 중에는 밝히지 않는다)', () => {
    const t = direct();
    const out = t.draw([forInst(K1, viewOf('names'), namedMarks(K1))], K1_ID);
    expect(out.get(K1_ID)!.names).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6']);
    for (const p of K1_WHITES) {
      const r = rectOf(K1, p.slot);
      const at = t.textAt(p.name, r.x + r.w / 2, r.y + r.h + 21);
      expect(at, p.name).toBeDefined();
      expect(at!.color, p.name).toBe(INK_CSS);
    }
    // 이름표 자리가 없으니 글자는 흰 널 열다섯뿐이다
    expect(t.scene.visibleTexts()).toHaveLength(15);
    // 같은 널 이름으로 검은 널을 만나지 않는다
    for (const p of K1_BLACKS) expect(t.scene.shown(), p.name).not.toContain(p.name);
  });

  it('자유로 놀 때만 검은 널의 이름도 쓴다: 널 안쪽 아래에 흰 글자', () => {
    const t = direct();
    t.draw([forInst(K1, viewOf('names', { free: true }), namedMarks(K1))], K1_ID);
    for (const p of K1_BLACKS) {
      const r = rectOf(K1, p.slot);
      const at = t.textAt(p.name, r.x + r.w / 2, r.y + r.h - 22);
      expect(at, p.name).toBeDefined();
      expect(at!.color, p.name).toBe(WHITE_CSS);
    }
    // 이름이 없는 널(콘텐츠가 이름을 알리지 않는 널)은 쓰지 않는다
    const t2 = direct();
    t2.draw([forInst(K1, viewOf('names', { free: true }), [])], K1_ID);
    for (const p of K1_BLACKS) expect(t2.scene.shown(), p.name).not.toContain(p.name);
  });

  it('고른 널(커서)은 굵은 테두리와 ▼ 표식이 함께 있다. 설치물 모드에서만 그린다', () => {
    const t = direct();
    const r = rectOf(K1, 5);
    const cx = r.x + r.w / 2;
    const out = t.draw([forInst(K1, viewOf('names', { cursor: 5 }))], K1_ID);
    expect(out.get(K1_ID)!.cursor).toBe(5);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [r.x - 3, r.y - 3, r.w + 6, r.h + 6, 8])).toEqual([8, TEAL, 1]);
    expect(styleBefore(t.g, 'fillStyle', 'fillTriangle', [cx - 11, r.y + 8, cx + 11, r.y + 8, cx, r.y + 26])).toEqual([TEAL, 1]);
    // 걷는 중에는 커서를 그리지 않는다(다리가 커서를 알려도)
    const w = direct();
    const out2 = w.draw([forInst(K1, viewOf('names', { cursor: 5 }))], null);
    expect(out2.get(K1_ID)!.cursor).toBeNull();
    expect(w.g.count('fillTriangle')).toBe(0);
    expect(w.g.count('strokeRoundedRect')).toBe(0);
  });

  it('울리는 널은 금빛 바탕과 굵은 금빛 테두리와 ♪ 글자가 함께 있다(색만으로 전하지 않는다)', () => {
    const t = direct();
    const white = rectOf(K1, 3);
    const black = rectOf(K1, 2);
    const out = t.draw([forInst(K1, viewOf('names', { playing: [3, 2] }))], K1_ID);
    // 흰 널을 먼저, 검은 널을 나중에 훑으므로 돌려주는 차례도 그렇다
    expect(out.get(K1_ID)!.playing).toEqual([3, 2]);
    for (const r of [white, black]) {
      expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', insetArgs(r)), `${r.slot}번 바탕`).toEqual([GOLD, 0.38]);
      expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', insetArgs(r)), `${r.slot}번 테두리`).toEqual([6, GOLD, 1]);
      const note = t.textAt('♪', r.x + r.w / 2, r.y + r.h - 28);
      expect(note, `${r.slot}번 ♪`).toBeDefined();
      expect(note!.color).toBe(GOLD_TEXT_CSS);
    }
    expect(t.textsOf('♪')).toHaveLength(2);
    // 검은 널은 흰 널 위에 선다: 흰 널의 표시를 먼저 그린다
    expect(indexOf(t.g, 'fillRoundedRect', insetArgs(white))).toBeLessThan(indexOf(t.g, 'fillRoundedRect', insetArgs(black)));
    // 울리지 않는 널에는 아무것도 얹지 않는다
    const quiet = direct();
    quiet.draw([forInst(K1, viewOf('names', { playing: [] }))], K1_ID);
    expect(quiet.textsOf('♪')).toHaveLength(0);
  });

  it('밟은 널은 반짝이다가 사라진다: 남은 반짝임만큼 옅어지고, 다리 모습이 없어도 걷는 중에 보인다', () => {
    const t = direct();
    const r = rectOf(K2, 6);
    const out = t.draw([], null, (id, slot) => (id === K2_ID && slot === 6 ? 0.5 : 0));
    expect(out.get(K2_ID)!.flashing).toEqual([6]);
    expect(out.get(K1_ID)!.flashing).toEqual([]);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', insetArgs(r))).toEqual([GOLD, 0.2]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', insetArgs(r))).toEqual([4, GOLD, 0.5]);
    // 다 지나가면(0) 그리지 않는다
    const gone = direct();
    expect(gone.draw([], null, () => 0).get(K2_ID)!.flashing).toEqual([]);
    expect(gone.g.log).toEqual([]);
  });
});

// ───── 이름표 ─────

describe('이름표 자리: 걸린 이름표는 풍경으로 남고, 빈 자리와 고른 자리는 설치물 모드에서만 보인다', () => {
  it('상자는 검은 널 위쪽 두 줄이다: 올려 부른 이름은 아래줄, 내려 부른 이름은 위줄(널 윗면에서 30 px와 68 px 위)', () => {
    const t = direct();
    const out = t.draw([forInst(K1, viewOf('names', { tags: [tagMark(0, 2, 'raised'), tagMark(1, 2, 'lowered')] }))], K1_ID);
    const tags = out.get(K1_ID)!.tags;
    expect(tags.map((x) => x.box)).toEqual([
      { x: 1802, y: 5255, w: 60, h: 30 },
      { x: 1802, y: 5217, w: 60, h: 30 },
    ]);
    expect(tags.map((x) => x.box)).toEqual([tagBoxOf(rectOf(K1, 2), 'raised'), tagBoxOf(rectOf(K1, 2), 'lowered')]);
    // 상자 가운데는 널 가운데 위다
    for (const x of tags) expect(x.box.x + x.box.w / 2).toBe(cxOf(K1, 2));
  });

  it('빈 자리는 옅은 흰 바탕과 점선 테두리와 \'올림\'·\'내림\' 글자다(비어 있다는 것을 글로 전한다)', () => {
    const t = direct();
    const out = t.draw([forInst(K1, viewOf('names', { tags: [tagMark(0, 2, 'raised'), tagMark(1, 2, 'lowered')] }))], K1_ID);
    const [raised, lowered] = out.get(K1_ID)!.tags;
    for (const [d, label] of [
      [raised!, '올림'],
      [lowered!, '내림'],
    ] as const) {
      const b = d.box;
      expect(d.text).toBeNull();
      expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [b.x, b.y, b.w, b.h, 8]), label).toEqual([WHITE, 0.72]);
      const at = t.textAt(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      expect(at, label).toBeDefined();
      expect(at!.color).toBe(INK_CSS);
      // 점선은 상자의 네 변 위의 짧은 선들이다: 둘레 180 px를 6 px 선과 4 px 틈으로 끊어 열여덟 토막
      const dashes = dashedRectSegments(b.x, b.y, b.w, b.h, 6, 4);
      expect(dashes).toHaveLength(18);
      for (const s of dashes) expect(has(t.g, 'lineBetween', s), `${label} 점선 ${s.join(',')}`).toBe(true);
    }
  });

  it('걸린 이름표는 옅은 초록 바탕과 테두리와 상자 안의 글자다. 걷는 중에도 남는다(빈 자리는 사라진다)', () => {
    const tags = [tagMark(0, 2, 'raised', { text: 'C♯' }), tagMark(1, 2, 'lowered'), tagMark(2, 4, 'raised', { text: 'D♯' })];
    const t = direct();
    const walking = t.draw([forInst(K1, viewOf('names', { tags }))], null);
    expect(walking.get(K1_ID)!.tags.map((x) => [x.plank, x.side, x.text])).toEqual([
      [2, 'raised', 'C♯'],
      [4, 'raised', 'D♯'],
    ]);
    for (const x of walking.get(K1_ID)!.tags) {
      const b = x.box;
      expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [b.x, b.y, b.w, b.h, 8]), x.text!).toEqual([TEAL_LIGHT, 0.95]);
      expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [b.x, b.y, b.w, b.h, 8]), x.text!).toEqual([3, TEAL, 0.95]);
      expect(t.textAt(x.text!, b.x + b.w / 2, b.y + b.h / 2 + 1), x.text!).toBeDefined();
    }
    expect(t.textsOf('올림')).toHaveLength(0);
    expect(t.textsOf('내림')).toHaveLength(0);
    // 설치물 모드에서는 빈 자리도 그린다
    const active = t.draw([forInst(K1, viewOf('names', { tags }))], K1_ID);
    expect(active.get(K1_ID)!.tags.map((x) => [x.plank, x.side, x.text])).toEqual([
      [2, 'raised', 'C♯'],
      [2, 'lowered', null],
      [4, 'raised', 'D♯'],
    ]);
  });

  it('고른 자리는 굵은 테두리가 한 겹 더 있다. 설치물 모드에서만 고른 것으로 알린다', () => {
    const tags = [tagMark(0, 2, 'raised', { text: 'C♯', selected: true }), tagMark(1, 4, 'raised', { selected: false })];
    const t = direct();
    const out = t.draw([forInst(K1, viewOf('names', { tags }))], K1_ID);
    const [a, b] = out.get(K1_ID)!.tags;
    expect([a!.selected, b!.selected]).toEqual([true, false]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [a!.box.x - 3, a!.box.y - 3, a!.box.w + 6, a!.box.h + 6, 10])).toEqual([6, TEAL, 1]);
    expect(t.g.count('strokeRoundedRect')).toBe(2); // 걸린 이름표의 테두리와 고른 테두리. 빈 자리는 점선이라 상자 테두리가 없다
    const w = direct();
    const walking = w.draw([forInst(K1, viewOf('names', { tags }))], null);
    expect(walking.get(K1_ID)!.tags.map((x) => x.selected)).toEqual([false]);
    expect(has(w.g, 'strokeRoundedRect', [a!.box.x - 3, a!.box.y - 3, a!.box.w + 6, a!.box.h + 6, 10])).toBe(false);
  });

  it('판정이 가리킨 자리는 산호색 배지와 \'!\' 글자가 함께 있다', () => {
    const t = direct();
    const out = t.draw([forInst(K1, viewOf('names', { tags: [tagMark(0, 2, 'raised', { text: 'D♭', flagged: true })] }))], K1_ID);
    const x = out.get(K1_ID)!.tags[0]!;
    expect(x.flagged).toBe(true);
    const bx = x.box.x + x.box.w - 2;
    const by = x.box.y + 2;
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [bx, by, 12])).toEqual([CORAL, 1]);
    const bang = t.textAt('!', bx, by + 1);
    expect(bang).toBeDefined();
    expect(bang!.color).toBe(WHITE_CSS);
    expect(bang!.scaleValue).toBeCloseTo(12 / 14);
    // 맞는 자리에는 배지가 없다
    const ok = direct();
    ok.draw([forInst(K1, viewOf('names', { tags: [tagMark(0, 2, 'raised', { text: 'C♯' })] }))], K1_ID);
    expect(ok.textsOf('!')).toHaveLength(0);
  });

  it('없는 널의 이름표 자리는 건너뛴다(그리지도, 돌려주지도 않는다)', () => {
    const t = direct();
    const out = t.draw([forInst(K1, viewOf('names', { tags: [tagMark(0, 99, 'raised', { text: 'C♯' }), tagMark(1, 2, 'raised')] }))], K1_ID);
    expect(out.get(K1_ID)!.tags.map((x) => x.plank)).toEqual([2]);
  });
});

// ───── 말뚝과 밧줄 ─────

describe('말뚝과 밧줄: 끝 말뚝이 꽂힌 밧줄은 풍경으로 남고, 고른 밧줄만 읽기를 쓴다', () => {
  const ROPES = [ropeMark('b1', 3, 5, { text: '2도 · 반음 2개', selected: true }), ropeMark('b2', 5, null)];

  it('말뚝 끝은 널 윗면 가운데에서 44 px 위다. 시작 말뚝은 네모 머리, 끝 말뚝은 동그란 머리다(모양으로 가른다)', () => {
    const t = direct();
    const out = t.draw([forInst(K2, viewOf('interval', { ropes: ROPES }))], K2_ID);
    const b1 = out.get(K2_ID)!.ropes.find((r) => r.qid === 'b1')!;
    expect(b1.a).toEqual({ x: 1020, y: 5656 });
    expect(b1.b).toEqual({ x: 1092, y: 5656 });
    expect(b1.a).toEqual(stakeTopOf(rectOf(K2, 3)));
    expect(b1.b).toEqual(stakeTopOf(rectOf(K2, 5)));
    // 시작 말뚝 머리: 청록 네모(14 px), 끝 말뚝 머리: 먹색 동그라미(반지름 8)
    expect(styleBefore(t.g, 'fillStyle', 'fillRect', [b1.a.x - 7, b1.a.y - 7, 14, 14])).toEqual([TEAL, 1]);
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [b1.b!.x, b1.b!.y, 8])).toEqual([INK, 1]);
    // 말뚝은 널 윗면에서 말뚝 끝까지 선다
    const r3 = rectOf(K2, 3);
    expect(styleBefore(t.g, 'lineStyle', 'lineBetween', [b1.a.x, r3.y, b1.a.x, b1.a.y])).toEqual([5, WOOD_DARK, 1]);
  });

  it('고른 밧줄은 굵고(5 px), 말뚝 머리 둘레에 흰 고리가 있고, 두 말뚝 사이에 늘어진 12조각 줄이다', () => {
    const t = direct();
    const out = t.draw([forInst(K2, viewOf('interval', { ropes: [ROPES[0]!] }))], K2_ID);
    const r = out.get(K2_ID)!.ropes[0]!;
    expect(r.selected).toBe(true);
    expect(styleBefore(t.g, 'lineStyle', 'strokeCircle', [r.a.x, r.a.y, 11])).toEqual([3, WHITE, 1]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeCircle', [r.b!.x, r.b!.y, 10])).toEqual([3, WHITE, 1]);
    // 줄: 두 말뚝 끝 사이를 열두 조각으로 잇고, 가운데가 16 px 처진다
    expect(t.g.count('beginPath')).toBe(1);
    expect(t.g.count('moveTo')).toBe(1);
    expect(t.g.count('lineTo')).toBe(12);
    expect(t.g.calls('moveTo')[0]).toEqual([r.a.x, r.a.y]);
    expect(t.g.calls('lineTo')[11]).toEqual([r.b!.x, r.b!.y]);
    expect(t.g.calls('lineTo')[5]).toEqual([(r.a.x + r.b!.x) / 2, (r.a.y + r.b!.y) / 2 + 16]);
    expect(t.g.count('strokePath')).toBe(1);
    const at = t.g.log.findIndex((c) => c.name === 'beginPath');
    const style = t.g.log
      .slice(0, at)
      .reverse()
      .find((c) => c.name === 'lineStyle');
    expect(style!.args).toEqual([5, WOOD, 1]);
  });

  it('읽기(\'2도 · 반음 2개\')는 고른 밧줄의 둥근 상자에만 쓴다: 흰 바탕과 청록 테두리, 글자 폭 + 24 px', () => {
    const t = direct();
    const out = t.draw([forInst(K2, viewOf('interval', { ropes: ROPES }))], K2_ID);
    const b1 = out.get(K2_ID)!.ropes.find((r) => r.qid === 'b1')!;
    expect(b1.text).toBe('2도 · 반음 2개');
    const x = (b1.a.x + b1.b!.x) / 2;
    const y = b1.a.y - 30;
    const pill = t.textAt('2도 · 반음 2개', x, y + 1);
    expect(pill).toBeDefined();
    expect(pill!.color).toBe(INK_CSS);
    const w = pill!.width + 24;
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [x - w / 2, y - 14, w, 28, 14])).toEqual([WHITE, 0.95]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [x - w / 2, y - 14, w, 28, 14])).toEqual([2.5, TEAL, 0.9]);
    // 고르지 않은 밧줄은 읽기를 쓰지 않는다(글이 있어도)
    const other = direct();
    const o = other.draw([forInst(K2, viewOf('interval', { ropes: [ropeMark('b1', 3, 5, { text: '2도 · 반음 2개' })] }))], K2_ID);
    expect(o.get(K2_ID)!.ropes[0]!.text).toBeNull();
    expect(other.textsOf('2도 · 반음 2개')).toHaveLength(0);
  });

  it('끝 말뚝이 아직 없는 밧줄은 설치물 모드에서만 보이고, 시작 말뚝뿐이다(줄이 없다)', () => {
    const t = direct();
    const active = t.draw([forInst(K2, viewOf('interval', { ropes: ROPES }))], K2_ID);
    const open = active.get(K2_ID)!.ropes.find((r) => r.qid === 'b2')!;
    expect(open.to).toBeNull();
    expect(open.b).toBeNull();
    expect(open.text).toBeNull();
    expect(t.g.count('fillRect')).toBe(2); // 시작 말뚝 둘(b1, b2)의 네모 머리
    expect(t.g.count('fillCircle')).toBe(1); // 끝 말뚝 하나(b1)의 동그란 머리
    expect(t.g.count('beginPath')).toBe(1); // 줄은 b1뿐이다
    // 걷는 중에는 끝 말뚝이 꽂힌 밧줄만 남는다. 읽기는 쓰지 않는다
    const w = direct();
    const walking = w.draw([forInst(K2, viewOf('interval', { ropes: ROPES }))], null);
    expect(walking.get(K2_ID)!.ropes.map((r) => [r.qid, r.selected, r.text])).toEqual([['b1', false, null]]);
    expect(w.g.count('fillRect')).toBe(1);
    expect(w.g.count('strokeCircle')).toBe(0);
    expect(w.scene.visibleTexts()).toHaveLength(0);
  });

  it('고르지 않은 밧줄을 먼저, 고른 밧줄을 나중에 그린다(고른 밧줄이 위에 쌓인다)', () => {
    const t = direct();
    const out = t.draw([forInst(K2, viewOf('interval', { ropes: [ropeMark('a', 1, 3, { selected: true }), ropeMark('b', 5, 6), ropeMark('c', 8, 10)] }))], K2_ID);
    expect(out.get(K2_ID)!.ropes.map((r) => r.qid)).toEqual(['b', 'c', 'a']);
  });

  it('판정이 가리킨 밧줄은 끝 말뚝 옆에 산호색 배지와 \'!\' 글자가 있다. 끝 말뚝이 없으면 배지도 없다', () => {
    const t = direct();
    const out = t.draw([forInst(K2, viewOf('interval', { ropes: [ropeMark('b1', 3, 5, { flagged: true }), ropeMark('b2', 8, null, { flagged: true })] }))], K2_ID);
    const r = out.get(K2_ID)!.ropes.find((x) => x.qid === 'b1')!;
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [r.b!.x + 14, r.b!.y - 14, 12])).toEqual([CORAL, 1]);
    expect(t.textAt('!', r.b!.x + 14, r.b!.y - 14 + 1)).toBeDefined();
    expect(t.textsOf('!')).toHaveLength(1);
  });

  it('없는 널에 꽂힌 밧줄은 건너뛴다. 끝 말뚝의 널이 없으면 끝 말뚝이 없는 밧줄로 그린다', () => {
    const t = direct();
    const out = t.draw([forInst(K2, viewOf('interval', { ropes: [ropeMark('x', 99, 5), ropeMark('y', 3, 99)] }))], K2_ID);
    expect(out.get(K2_ID)!.ropes.map((r) => [r.qid, r.to, r.b])).toEqual([['y', null, null]]);
  });
});

// ───── 깃발과 표지판 악보 ─────

describe('깃발과 깃발 걸이: 꽂은 깃발은 풍경으로 남고, 걸이는 설치물 모드에서만 보인다', () => {
  const frame = bridgeBounds(K3);
  const RACKED = [1, 2, 3, 4].map((o) => flagMark(o, o, null));

  it('꽂지 않은 깃발은 걸이에 선다: 틀의 오른쪽 끝에서 왼쪽으로 44 px씩, 번호 차례로. 선반이 함께 그려진다', () => {
    const t = direct();
    const out = t.draw([forInst(K3, viewOf('flags', { flags: RACKED, sign: SIGN }))], K3_ID);
    const flags = out.get(K3_ID)!.flags;
    expect(flags.map((f) => [f.order, f.plank, f.x, f.y])).toEqual([
      [1, null, 3334, 5716],
      [2, null, 3378, 5716],
      [3, null, 3422, 5716],
      [4, null, 3466, 5716],
    ]);
    for (const f of flags) expect({ x: f.x, y: f.y }).toEqual(flagRackSpotOf(frame, 4, f.order));
    const first = flagRackSpotOf(frame, 4, 1);
    const last = flagRackSpotOf(frame, 4, 4);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [first.x - 24, first.y, last.x - first.x + 48, 8, 4])).toEqual([WOOD, 1]);
    // 걷는 중에는 걸이도 그 위의 깃발도 없다(표지판 악보만 남는다)
    const w = direct();
    const walking = w.draw([forInst(K3, viewOf('flags', { flags: RACKED, sign: SIGN }))], null);
    expect(walking.get(K3_ID)!.flags).toEqual([]);
    expect(walking.get(K3_ID)!.sign).not.toBeNull();
    expect(has(w.g, 'fillRoundedRect', [first.x - 24, first.y, last.x - first.x + 48, 8, 4])).toBe(false);
  });

  it('걸이에 깃발이 하나도 남지 않으면 선반을 그리지 않는다', () => {
    const t = direct();
    const placed = [flagMark(1, 1, 7), flagMark(2, 2, 6), flagMark(3, 3, 6), flagMark(4, 4, 7)];
    t.draw([forInst(K3, viewOf('flags', { flags: placed, sign: SIGN }))], K3_ID);
    const first = flagRackSpotOf(frame, 4, 1);
    const last = flagRackSpotOf(frame, 4, 4);
    expect(has(t.g, 'fillRoundedRect', [first.x - 24, first.y, last.x - first.x + 48, 8, 4])).toBe(false);
  });

  it('깃발 하나는 기둥과 청록 천과 천 안의 번호다. 번호는 흰 글자이고 걷는 중에도 남는다(꽂은 깃발만)', () => {
    const t = direct();
    const flags = [flagMark(1, 1, 8), flagMark(2, 2, null)];
    const walking = t.draw([forInst(K3, viewOf('flags', { flags }))], null);
    // 꽂은 깃발: 8번 널(G4) 윗면 가운데에 선다
    const f = walking.get(K3_ID)!.flags;
    expect(f.map((x) => [x.order, x.plank, x.stack, x.x, x.y])).toEqual([[1, 8, 0, cxOf(K3, 8), rectOf(K3, 8).y]]);
    const { base } = flagPoleOf(rectOf(K3, 8));
    const topY = base.y - FLAG_POLE_H;
    expect(styleBefore(t.g, 'lineStyle', 'lineBetween', [base.x, base.y, base.x, topY])).toEqual([4, WOOD_DARK, 1]);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [base.x, topY, FLAG_CLOTH_W, FLAG_CLOTH_H, 4])).toEqual([TEAL, 1]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [base.x, topY, FLAG_CLOTH_W, FLAG_CLOTH_H, 4])).toEqual([2, INK, 0.9]);
    const num = t.textAt('1', base.x + FLAG_CLOTH_W / 2, topY + FLAG_CLOTH_H / 2 + 1);
    expect(num).toBeDefined();
    expect(num!.color).toBe(WHITE_CSS);
    // 설치물 모드에서는 걸이의 깃발도 함께 보인다
    const a = direct();
    const active = a.draw([forInst(K3, viewOf('flags', { flags }))], K3_ID);
    expect(active.get(K3_ID)!.flags.map((x) => [x.order, x.plank])).toEqual([
      [1, 8],
      [2, null],
    ]);
  });

  it('같은 널에 꽂힌 깃발은 번호가 작은 것부터 아래로 한 줄씩 내려 선다: Q30의 정답 모양(66, 65, 65, 66)에서 네 번호가 모두 보인다', () => {
    // 1번과 4번이 7번 널(F♯4), 2번과 3번이 6번 널(F4)
    const answer = [flagMark(1, 1, 7), flagMark(2, 2, 6), flagMark(3, 3, 6), flagMark(4, 4, 7)];
    const t = direct();
    const out = t.draw([forInst(K3, viewOf('flags', { flags: answer }))], null);
    const f = out.get(K3_ID)!.flags;
    expect(f.map((x) => [x.order, x.plank, x.stack, x.x, x.y])).toEqual([
      [1, 7, 0, 3200, 5800],
      [2, 6, 0, 3164, 5800],
      [3, 6, 1, 3164, 5800 + FLAG_STACK_DY],
      [4, 7, 1, 3200, 5800 + FLAG_STACK_DY],
    ]);
    // 네 번호가 모두 따로 보인다(같은 자리에 겹쳐 쓰지 않는다)
    const spots = f.map((x) => [x.x + FLAG_CLOTH_W / 2, x.y - FLAG_POLE_H + FLAG_CLOTH_H / 2 + 1]);
    expect(new Set(spots.map((s) => s.join(','))).size).toBe(4);
    for (const [i, s] of spots.entries()) expect(t.textAt(String(i + 1), s[0]!, s[1]!), `${i + 1}번 깃발의 번호`).toBeDefined();
    // 천이 서로 겹치지 않는다
    const cloths = f.map((x) => clothOf(x));
    for (let i = 0; i < cloths.length; i++) for (let j = i + 1; j < cloths.length; j++) expect(rectsOverlap(cloths[i]!, cloths[j]!), `${i + 1}번과 ${j + 1}번 천`).toBe(false);
    // 아래로 내려도 천은 널 안쪽(널 윗면 아래)에서 끝나고, 두 줄 모두 표지판 악보판 아래에 있다(악보를 가리지 않는다)
    const board = signBoardOf(frame, 4);
    for (const c of cloths) expect(c.y).toBeGreaterThan(board.y + board.h);
  });

  it('검사가 헛돌지 않는다: 줄을 내리지 않으면 같은 널의 두 천이 완전히 겹친다', () => {
    const noStack = [7, 6, 6, 7].map((plank) => clothOf(flagPoleOf(rectOf(K3, plank)).base));
    expect(rectsOverlap(noStack[1]!, noStack[2]!)).toBe(true);
    expect(rectsOverlap(noStack[0]!, noStack[3]!)).toBe(true);
    // 이웃한 널의 깃발은 줄을 내리지 않아도 겹치지 않는다(7번 널과 6번 널은 36 px 떨어져 있고 천은 30 px)
    expect(rectsOverlap(noStack[0]!, noStack[1]!)).toBe(false);
  });

  it('고른 깃발은 천 둘레에 굵은 금빛 테두리가 있고, 판정이 가리킨 깃발은 산호색 배지와 \'!\' 글자가 있다', () => {
    const t = direct();
    const flags = [flagMark(1, 1, 7, { selected: true }), flagMark(2, 2, 6, { flagged: true }), flagMark(3, 3, null, { selected: true }), flagMark(4, 4, null)];
    const out = t.draw([forInst(K3, viewOf('flags', { flags }))], K3_ID);
    const f = out.get(K3_ID)!.flags;
    expect(f.map((x) => [x.order, x.selected, x.flagged])).toEqual([
      [1, true, false],
      [2, false, true],
      [3, true, false],
      [4, false, false],
    ]);
    const sel = f[0]!;
    const topY = sel.y - FLAG_POLE_H;
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [sel.x - 4, topY - 4, FLAG_CLOTH_W + 8, FLAG_CLOTH_H + 8, 7])).toEqual([5, GOLD, 1]);
    const bad = f[1]!;
    const bx = bad.x + FLAG_CLOTH_W + 4;
    const by = bad.y - FLAG_POLE_H - 2;
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [bx, by, 11])).toEqual([CORAL, 1]);
    expect(t.textAt('!', bx, by + 1)).toBeDefined();
    // 걷는 중에는 고른 표시를 그리지 않는다. 판정 배지는 그 모습이 가리키는 대로 남는다(컨트롤러가 걷는 중의 표식을 지운다)
    const w = direct();
    const walking = w.draw([forInst(K3, viewOf('flags', { flags }))], null);
    expect(walking.get(K3_ID)!.flags.map((x) => [x.order, x.selected])).toEqual([
      [1, false],
      [2, false],
    ]);
  });

  it('깃발 과제가 아니면 깃발과 표지판 악보를 그리지 않는다', () => {
    const t = direct();
    const out = t.draw([forInst(K3, viewOf('interval', { flags: [flagMark(1, 1, 7)], sign: SIGN }))], K3_ID);
    expect(out.get(K3_ID)!.flags).toEqual([]);
    expect(out.get(K3_ID)!.sign).toBeNull();
  });
});

describe('표지판 악보: 오선과 높은음자리표, 조표, 마디선, 음표와 임시표. 음이름은 쓰지 않는다', () => {
  const frame = bridgeBounds(K3);
  /** 악보판의 너비는 걸이의 깃발 수가 정한다(깃발 넷). 걷는 중에는 걸이의 깃발을 그리지 않으므로 악보만 남는다 */
  const drawSign = (activeId: string | null) => {
    const t = direct();
    const out = t.draw([forInst(K3, viewOf('flags', { flags: [1, 2, 3, 4].map((o) => flagMark(o, o, null)), sign: SIGN }))], activeId);
    return { t, d: out.get(K3_ID)!.sign! };
  };

  it('Q30의 악보: 조표 하나(F♯), 두 마디, 음 넷, 쉼표 없음, 임시표 하나(첫 마디의 F♮)', () => {
    expect(SIGN.keySignature).toBe(1);
    expect(SIGN.bars.map((b) => b.length)).toEqual([3, 1]);
    const { d } = drawSign(K3_ID);
    expect(d).toEqual({ board: signBoardOf(frame, 4), keySignature: 1, bars: 2, notes: 4, rests: 0, accidentals: 1, clef: true });
    expect(d.board).toEqual({ x: 2916, y: 5638, w: 372, h: 92 });
  });

  it('악보판은 걷는 중에도 풍경으로 남는다(걸이와 달리 설치물 모드에 매이지 않는다)', () => {
    const a = drawSign(K3_ID);
    const w = drawSign(null);
    expect(w.d).toEqual(a.d);
    expect(w.t.g.count('fillRoundedRect')).toBeGreaterThan(0);
  });

  it('흰 바탕 둥근 판에 먹색 테두리가 있고, 그 위에 오선 다섯 줄이 판 안쪽 가로로 그어진다(줄 간격 10 px)', () => {
    const { t, d } = drawSign(K3_ID);
    const b = d.board;
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [b.x, b.y, b.w, b.h, 10])).toEqual([WHITE, 0.97]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [b.x, b.y, b.w, b.h, 10])).toEqual([3, INK, 0.9]);
    const left = b.x + 12;
    const right = b.x + b.w - 12;
    const bottom = b.y + b.h - 22;
    for (let line = 0; line < 5; line++) expect(has(t.g, 'lineBetween', [left, bottom - line * 10, right, bottom - line * 10]), `${line + 1}번째 줄`).toBe(true);
    // 오선은 판 안에 있다
    expect(bottom - 40).toBeGreaterThan(b.y);
    expect(bottom).toBeLessThan(b.y + b.h);
  });

  it('높은음자리표 하나(줄기와 아래서 둘째 줄을 감싸는 고리)와 조표의 ♯ 하나(맨 윗줄 F5)와 임시표 ♮ 하나가 글자로 쓰인다', () => {
    const { t, d } = drawSign(K3_ID);
    const b = d.board;
    const left = b.x + 12;
    const bottom = b.y + b.h - 22;
    // 높은음자리표: 아래서 둘째 줄(G4)에 고리가 걸린다
    expect(has(t.g, 'strokeCircle', [left + 16, bottom - 10, 8])).toBe(true);
    // 조표 ♯: 조표 칸(높은음자리표 44 px 오른쪽)의 맨 윗줄(위치 8, 맨 아랫줄에서 40 px 위)
    expect(t.textAt('♯', left + 44, bottom - 40)).toBeDefined();
    expect(t.textsOf('♯')).toHaveLength(1);
    expect(t.textsOf('♮')).toHaveLength(1);
    expect(t.textsOf('♭')).toHaveLength(0);
  });

  it('음표 머리는 네 개: 한 박은 채운 머리, 두 박 이상은 비운 머리다. 한 박과 두 박은 줄기가 있고 네 박은 줄기가 없다', () => {
    const { t, d } = drawSign(K3_ID);
    const bottom = d.board.y + d.board.h - 22;
    const y = bottom - 5; // 맨 아랫줄(E4)에서 반 칸 위: F4
    const heads = t.g.calls('fillEllipse');
    expect(heads).toHaveLength(4);
    for (const h of heads) {
      expect(h[1]).toBe(y);
      expect(h[2]).toBe(13);
      expect(h[3]).toBe(10);
    }
    // 왼쪽에서 오른쪽으로 놓이고 판 안에 있다
    const xs = heads.map((h) => h[0] as number);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThan(d.board.x);
      expect(x).toBeLessThan(d.board.x + d.board.w);
    }
    // 비운 머리(두 박, 네 박)는 흰 채움과 먹색 테두리
    expect(t.g.count('strokeEllipse')).toBe(2);
    // 한 박 둘과 두 박 하나는 줄기가 있다: 머리 오른쪽에서 위로 28 px(F4는 가운데 줄 아래라 줄기가 위로 선다)
    const stems = t.g.calls('lineBetween').filter((c) => c[0] === (c[2] as number) && (c[3] as number) === (c[1] as number) - 28);
    expect(stems).toHaveLength(3);
    for (const s of stems) expect(s[1]).toBe(y);
    // 덧줄은 없다(F4는 오선 안이다)
  });

  it('마디선은 마디 수만큼(오른쪽 끝 포함) 그어진다', () => {
    const { t, d } = drawSign(K3_ID);
    const bottom = d.board.y + d.board.h - 22;
    const barLines = t.g.calls('lineBetween').filter((c) => c[0] === c[2] && c[1] === bottom - 40 && c[3] === bottom);
    expect(barLines).toHaveLength(2);
  });

  it('음이름을 글자로 쓰지 않는다(정답을 글로 알려 주지 않는다): 악보에 쓰이는 글자는 조표와 임시표 기호뿐이다', () => {
    const { t } = drawSign(null);
    const shown = t.scene.shown();
    for (const s of shown) expect(s, s).not.toMatch(/^[A-G][♯♭♮]?\d?$/);
    expect(shown.sort()).toEqual(['♮', '♯']);
  });

  it('쉼표와 덧줄과 점음표도 그린다: 손으로 만든 악보(쉼표, C4 아래 덧줄, 점 둘째 박)', () => {
    const sign = {
      keySignature: -2,
      bars: [
        [
          { position: 4, accidental: null, beats: 1, rest: true },
          { position: -2, accidental: 'sharp' as const, beats: 1.5, rest: false },
          { position: 11, accidental: 'flat' as const, beats: 2, rest: false },
        ],
      ],
    };
    const t = direct();
    const out = t.draw([forInst(K3, viewOf('flags', { sign }))], K3_ID);
    const d = out.get(K3_ID)!.sign!;
    expect(d).toMatchObject({ keySignature: -2, bars: 1, notes: 2, rests: 1, accidentals: 2 });
    // 조표 ♭ 둘, 임시표 ♯ 하나와 ♭ 하나
    expect(t.textsOf('♭')).toHaveLength(3);
    expect(t.textsOf('♯')).toHaveLength(1);
    // 쉼표는 오선 가운데 줄 높이의 짧은 막대 하나
    const bottom = d.board.y + d.board.h - 22;
    expect(t.g.calls('fillRect').filter((c) => c[1] === bottom - 20 - 3 && c[2] === 14 && c[3] === 6)).toHaveLength(1);
    // 덧줄: C4(위치 -2)에 하나, 위쪽 음(위치 11, 오선 위 A5 위)에는 위치 10(A5)에 하나
    const ledgers = t.g.calls('lineBetween').filter((c) => (c[2] as number) - (c[0] as number) === 22);
    expect(ledgers.map((c) => c[1]).sort((a, b) => (a as number) - (b as number))).toEqual([bottom - 50, bottom + 10]);
    // 점음표(1.5박): 머리 옆에 점 하나
    expect(t.g.count('fillCircle')).toBe(1);
  });
});

// ───── 설치물 컨트롤러 → 다리 → 층 ─────

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
  const r = rig({ definitions: [Q_SAME, Q27, Q28, Q29, Q30, Q31].map(quest) });
  const bridge = new WorldBridge({ x: 2300, y: 5000, facing: 'down' });
  const defs = [K1, K2, K3, K4];
  const frames = new FakeFrames();
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => {} },
    installations: defs,
    panels: new Set(['panel.clef', 'panel.scale']),
    frames,
  });
  const scene = new FakeScene();
  const layer = new InstallationLayer(scene as never, defs, bridge, fakeCull());
  const press = (inst: InstallationDef, slot: number): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot });
  const drawn = (id: string, now = 0, reduce = false) => {
    layer.update(now, reduce);
    return layer.debug().find((d) => d.installationId === id)!;
  };
  const enter = (id: string, key?: string) => {
    expect(ic.enter(STATION[id]!)).toBe(true);
    if (key) expect(ic.select(key)).toBe(true);
    return ic.keyBridge!;
  };
  return { ...r, bridge, ic, scene, layer, frames, press, drawn, enter };
}

describe('설치물 층의 건반 다리 길', () => {
  it('다리 셋은 keyBridge를 돌려주고 돌 길(반음 계단)에는 keyBridge가 없다. 다리는 널마다의 글자를 따로 만들지 않는다', () => {
    const t = pipeline();
    t.layer.update(0, false);
    const all = t.layer.debug();
    expect(all.map((d) => d.installationId)).toEqual([K1_ID, K2_ID, K3_ID, K4_ID]);
    expect(all.slice(0, 3).every((d) => d.keyBridge !== undefined && d.terrace === undefined && d.timeline === undefined && d.bell === undefined)).toBe(true);
    expect(all[3]!.keyBridge).toBeUndefined();
    expect(all.map((d) => d.slots.length)).toEqual([25, 13, 13, 13]);
    expect(all.slice(0, 3).every((d) => d.slots.every((s) => !s.numbered && !s.selected && !s.flagged && !s.playing))).toBe(true);
    // 글자: 돌 길의 칸마다 넷뿐이다. 다리의 글자는 그릴 때 만든다
    expect(t.scene.texts).toHaveLength(K4.slots.length * 4);
  });

  it('들어가기 전에는 그릴 것이 없다: 널 그림은 바닥에 있어서 겹쳐 얹을 것이 없다', () => {
    const t = pipeline();
    for (const id of [K1_ID, K2_ID, K3_ID]) {
      const d = t.drawn(id);
      expect(d.active, id).toBe(false);
      const k = d.keyBridge!;
      expect([k.names, k.cursor, k.playing, k.flashing, k.tags, k.ropes, k.flags, k.sign], id).toEqual([[], null, [], [], [], [], [], null]);
    }
    expect(t.scene.shown()).toEqual([]);
  });

  it('자유로 놀면 널 이름과 검은 널 이름이 쓰이고, 이름표 자리 열 개가 \'올림\'으로 비어 있다. 널을 옮기면 ▼ 표식이 따라온다', () => {
    const t = pipeline();
    const bench = t.enter(K1_ID);
    let d = t.drawn(K1_ID);
    expect(d.active).toBe(true);
    expect(d.keyBridge!.free).toBe(true);
    expect(d.keyBridge!.names).toEqual(K1_WHITES.map((p) => p.name));
    expect(d.keyBridge!.tags).toHaveLength(10);
    expect(d.keyBridge!.cursor).toBeNull();
    const shown = t.scene.shown();
    for (const p of planksOfInstallation(K1)) expect(shown, p.name).toContain(p.name);
    expect(shown.filter((s) => s === '올림')).toHaveLength(10);
    bench.movePlank(1);
    d = t.drawn(K1_ID);
    expect(d.keyBridge!.cursor).toBe(1);
    expect(d.slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([1]);
  });

  it('이름표 과제: 비어 있는 두 자리가 보이고, 이름표를 걸면 글자가 쓰인다. 나오면 걸린 이름표만 풍경으로 남는다', () => {
    const t = pipeline();
    const bench = t.enter(K1_ID, `${Q_SAME}/name-tags`);
    let d = t.drawn(K1_ID);
    expect(d.keyBridge!.task).toBe('names');
    expect(d.keyBridge!.free).toBe(false);
    expect(d.keyBridge!.tags.map((x) => [x.plank, x.side, x.text])).toEqual([
      [2, 'raised', null],
      [2, 'lowered', null],
    ]);
    expect(d.keyBridge!.tags.map((x) => x.box)).toEqual([
      { x: 1802, y: 5255, w: 60, h: 30 },
      { x: 1802, y: 5217, w: 60, h: 30 },
    ]);
    expect(t.scene.shown()).toEqual(expect.arrayContaining(['올림', '내림']));
    // 문제를 푸는 중에는 검은 널의 이름을 알리지 않는다
    expect(t.scene.shown()).not.toContain('C♯4');
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[0]!);
    d = t.drawn(K1_ID);
    expect(d.keyBridge!.tags.map((x) => [x.side, x.text, x.selected])).toEqual([
      ['raised', 'C♯', true],
      ['lowered', null, false],
    ]);
    expect(t.scene.shown()).toContain('C♯');
    t.ic.exit();
    d = t.drawn(K1_ID);
    expect(d.active).toBe(false);
    expect(d.keyBridge!.tags.map((x) => [x.side, x.text, x.selected])).toEqual([['raised', 'C♯', false]]);
    expect(d.keyBridge!.names).toEqual([]);
    expect(t.scene.shown()).toEqual(['C♯']);
  });

  it('음정 과제(K2): 시작 말뚝 둘이 서고, 고른 질문의 밧줄은 마지막에 그려진다. 끝 말뚝을 꽂으면 밧줄과 읽기가 생기고, 나오면 읽기가 사라진다', () => {
    const t = pipeline();
    const bench = t.enter(K2_ID, `${Q29}/basic`);
    let d = t.drawn(K2_ID);
    expect(d.keyBridge!.task).toBe('interval');
    expect(d.keyBridge!.ropes.map((r) => [r.qid, r.from, r.to, r.b])).toEqual([
      ['b1', 3, null, null],
      ['b2', 5, null, null],
    ]);
    expect(d.keyBridge!.ropes.map((r) => r.a)).toEqual([
      { x: 1020, y: 5656 },
      { x: 1092, y: 5656 },
    ]);
    const first = bench.items()[0]!;
    expect(first.kind).toBe('question');
    bench.selectItem(first.kind === 'question' ? first.parts[0]!.draft : 0);
    d = t.drawn(K2_ID);
    expect(d.keyBridge!.ropes.map((r) => [r.qid, r.selected])).toEqual([
      ['b2', false],
      ['b1', true],
    ]);
    t.press(K2, 5);
    d = t.drawn(K2_ID);
    const rope = d.keyBridge!.ropes.find((r) => r.qid === 'b1')!;
    expect([rope.from, rope.to, rope.text, rope.selected]).toEqual([3, 5, '2도 · 반음 2개', true]);
    expect(rope.b).toEqual({ x: 1092, y: 5656 });
    expect(t.scene.shown()).toContain('2도 · 반음 2개');
    t.ic.exit();
    d = t.drawn(K2_ID);
    expect(d.keyBridge!.ropes.map((r) => [r.qid, r.to, r.text, r.selected])).toEqual([['b1', 5, null, false]]);
    expect(t.scene.shown()).toEqual([]);
  });

  it('임시표 과제(K3): 깃발 넷이 걸이에 서고 표지판 악보가 보인다. 깃발을 차례로 꽂으면 같은 널의 깃발이 아래로 한 줄씩 내려 서고, 나와도 깃발과 악보가 남는다', () => {
    const t = pipeline();
    t.enter(K3_ID, `${Q30}/g-major-f`);
    let d = t.drawn(K3_ID);
    expect(d.keyBridge!.task).toBe('flags');
    expect(d.keyBridge!.flags.map((f) => [f.order, f.plank, f.x, f.y])).toEqual([
      [1, null, 3334, 5716],
      [2, null, 3378, 5716],
      [3, null, 3422, 5716],
      [4, null, 3466, 5716],
    ]);
    expect(d.keyBridge!.sign).toMatchObject({ keySignature: 1, bars: 2, notes: 4, rests: 0, accidentals: 1, clef: true });
    // 정답 모양: F♯4, F♮4, F♮4, F♯4 = 7번, 6번, 6번, 7번 널
    for (const slot of [7, 6, 6, 7]) t.press(K3, slot);
    d = t.drawn(K3_ID);
    expect(d.keyBridge!.flags.map((f) => [f.order, f.plank, f.stack, f.x, f.y])).toEqual([
      [1, 7, 0, 3200, 5800],
      [2, 6, 0, 3164, 5800],
      [3, 6, 1, 3164, 5826],
      [4, 7, 1, 3200, 5826],
    ]);
    // 네 번호가 모두 보인다
    for (const n of ['1', '2', '3', '4']) expect(t.scene.shown(), n).toContain(n);
    const cloths = d.keyBridge!.flags.map((f) => clothOf(f));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(rectsOverlap(cloths[i]!, cloths[j]!), `${i + 1}번과 ${j + 1}번 천`).toBe(false);
    t.ic.exit();
    d = t.drawn(K3_ID);
    expect(d.active).toBe(false);
    expect(d.keyBridge!.flags.map((f) => [f.order, f.plank, f.selected])).toEqual([
      [1, 7, false],
      [2, 6, false],
      [3, 6, false],
      [4, 7, false],
    ]);
    expect(d.keyBridge!.sign).not.toBeNull();
    expect(d.keyBridge!.names).toEqual([]);
    expect(t.scene.shown().sort()).toEqual(['1', '2', '3', '4', '♮', '♯']);
  });

  it('깃발을 틀리게 꽂고 확인하면 틀린 깃발에 표식이 서고, 고치면 사라진다', () => {
    const t = pipeline();
    const bench = t.enter(K3_ID, `${Q30}/g-major-f`);
    for (const slot of [7, 6, 7, 6]) t.press(K3, slot);
    bench.perform('check');
    let d = t.drawn(K3_ID);
    const flagged = d.keyBridge!.flags.filter((f) => f.flagged).map((f) => f.order);
    expect(flagged.length).toBeGreaterThan(0);
    expect(t.scene.shown().filter((s) => s === '!')).toHaveLength(flagged.length);
    expect(d.slots.filter((s) => s.flagged).length).toBeGreaterThan(0);
    // 맞게 고치면 사라진다: 셋째 깃발을 6번 널로, 넷째 깃발을 7번 널로
    bench.selectItem(3);
    t.press(K3, 6);
    bench.selectItem(4);
    t.press(K3, 7);
    d = t.drawn(K3_ID);
    expect(d.keyBridge!.flags.every((f) => !f.flagged)).toBe(true);
    expect(t.scene.shown()).not.toContain('!');
  });

  it('듣는 동안 울리는 널이 금빛으로 보이고 ♪가 함께 있다. 멈추면 돌아온다', async () => {
    const t = pipeline();
    const bench = t.enter(K3_ID, `${Q30}/g-major-f`);
    t.press(K3, 7);
    t.press(K3, 6);
    await t.controller.enableSound();
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    const quarterSec = 60 / t.controller.tempo().effective;
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    let d = t.drawn(K3_ID);
    expect(d.keyBridge!.playing).toEqual([7]);
    expect(d.slots.filter((s) => s.playing).map((s) => s.slot)).toEqual([7]);
    expect(t.scene.shown()).toContain('♪');
    t.run(1.5 * quarterSec - 0.2);
    t.frames.tick();
    d = t.drawn(K3_ID);
    expect(d.keyBridge!.playing).toEqual([6]);
    bench.perform('stop');
    t.frames.tick();
    d = t.drawn(K3_ID);
    expect(d.keyBridge!.playing).toEqual([]);
    expect(t.scene.shown()).not.toContain('♪');
  });

  it('밟은 널은 반짝이다가 0.5초 뒤에 사라지고, 움직임 줄이기에서는 반짝이지 않는다. 걷는 중에도 보인다', () => {
    const t = pipeline();
    t.layer.flash(K1_ID, 3, 10);
    expect(t.drawn(K1_ID, 10.1).keyBridge!.flashing).toEqual([3]);
    expect(t.drawn(K2_ID, 10.1).keyBridge!.flashing).toEqual([]);
    expect(t.drawn(K1_ID, 10 + STEP_FLASH_SECONDS / 2).keyBridge!.flashing).toEqual([3]);
    expect(t.drawn(K1_ID, 10 + STEP_FLASH_SECONDS + 0.01).keyBridge!.flashing).toEqual([]);
    expect(t.drawn(K1_ID, 10.1).keyBridge!.flashing).toEqual([]); // 한 번 지나가면 기억을 지운다
    t.layer.flash(K1_ID, 5, 20);
    expect(t.drawn(K1_ID, 20.1, true).keyBridge!.flashing).toEqual([]);
  });

  it('반음 계단(돌 길)은 다리 층과 상관없이 칸마다의 글자를 그린다', () => {
    const t = pipeline();
    t.ic.enter('K4');
    const d = t.drawn(K4_ID);
    expect(d.active).toBe(true);
    expect(d.keyBridge).toBeUndefined();
    expect(d.slots).toHaveLength(13);
    expect(d.slots.every((s) => s.numbered)).toBe(true);
  });
});
