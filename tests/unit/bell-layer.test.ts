// 6-7c 종나무(T4, 4.6)를 월드에 그리는 층(world/installations/bellLayer.ts, layer.ts의 위임): 다리의 bells를 읽어 줄기와 가지, 고리,
// 걸린 종, 쓰지 않는 가지, 옥타브·열 이름표, 고른 자리, 판정·듣기·소리 끔·가장 낮은 종의 표시를 옮겨 그린다.
// Phaser 없이 가짜 장면(tests/unit/fake-phaser.ts)으로 시험한다. 실제 화면의 모습은 브라우저 흐름 시험이 본다.
// 앞쪽은 손으로 만든 모습으로 그리는 규칙(색만으로 말하지 않는다, 좌표)을 확인하고, 뒤쪽은 설치물 컨트롤러 → 다리 → 층의 전체 길을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bellMapOf, bellSlotOf } from '@/domain/bells';
import type { BellMark, BellView } from '@/domain/bells';
import type { InstallationDef } from '@/domain/installation';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { BellLayer } from '@/world/installations/bellLayer';
import { dashedRectSegments, hatchSegments } from '@/world/installations/hatch';
import { InstallationLayer } from '@/world/installations/layer';
import { CORAL, GOLD, INK_CSS, TEAL, WHITE_CSS } from '@/world/installations/palette';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import { FakeGraphics, FakeScene, fakeCull } from './fake-phaser';
import type { FakeText } from './fake-phaser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q05 = 'chord.major-triad';
const Q06 = 'chord.inversion';
const Q20 = 'chord.major-and-minor';
const Q21 = 'chord.primary-triads';
const Q22 = 'chord.diminished-augmented';
const Q23 = 'chord.progression-walk';
const W1_ID = 'inst.bell-grove.three-bells';
const W2_ID = 'inst.bell-grove.bright-dark';
const W3_ID = 'inst.bell-grove.bell-tower';
const W4_ID = 'inst.bell-grove.three-pillars';
const DEPTH = -90_000;

const W1 = installation(W1_ID);
const W2 = installation(W2_ID);
const W3 = installation(W3_ID);
const W4 = installation(W4_ID);
const STONES = installation('inst.village.scale-stones');

/** 나무·옥타브·열이 가리키는 고리 번호(1부터) */
const ring = (inst: InstallationDef, tree: number, octave: number, column: number): number => bellSlotOf(bellMapOf(inst)!, tree, octave, column)!;
const cellOf = (inst: InstallationDef, slot: number) => inst.slots.find((s) => s.slot === slot)!;

const markOf = (inst: InstallationDef, tree: number, octave: number, column: number, name: string, extra: Partial<BellMark> = {}): BellMark => ({
  slot: ring(inst, tree, octave, column),
  draft: tree * bellMapOf(inst)!.columns + column,
  tree,
  name,
  midi: 60,
  muted: false,
  lowest: false,
  flagged: false,
  playing: false,
  ...extra,
});
const bellsOf = (form: BellView['form'], bells: BellMark[] = [], extra: Partial<BellView> = {}): BellView => ({ form, bells, cursor: null, cursorOctave: null, usable: [5, 4, 3, 2], ...extra });
const viewOf = (inst: InstallationDef, bells: BellView | undefined): InstallationView => ({ installationId: inst.installationId, slots: [], ...(bells ? { bells } : {}) });

/** 손으로 만든 모습을 직접 그리는 층 */
function direct(insts: InstallationDef[] = [W1, W2, W3, W4]) {
  const scene = new FakeScene();
  const layer = new BellLayer(scene as never, insts, DEPTH);
  const g = new FakeGraphics();
  const draw = (inst: InstallationDef, bells: BellView | undefined, active: boolean) => {
    g.reset();
    return layer.draw(g as never, inst, viewOf(inst, bells), active);
  };
  /** 보이는 글자 가운데 내용이 같고 자리가 가까운 것 */
  const textAt = (content: string, x: number, y: number): FakeText | undefined => scene.visibleTexts().find((t) => t.content === content && Math.abs(t.x - x) < 0.01 && Math.abs(t.y - y) < 0.01);
  return { scene, layer, g, draw, textAt };
}

/** 지름 r인 원을 그린 호출(고리 걸이는 반지름 4.5) */
const circlesOf = (g: FakeGraphics, name: 'strokeCircle' | 'fillCircle', r: number): unknown[][] => g.calls(name).filter((a) => a[2] === r);

describe('층을 만들 때', () => {
  it('종나무 설치물만 맡는다(돌 설치물과 모르는 설치물은 맡지 않는다)', () => {
    const t = direct([W1, W2, W3, W4, STONES]);
    for (const id of [W1_ID, W2_ID, W3_ID, W4_ID]) expect(t.layer.has(id), id).toBe(true);
    expect(t.layer.has(STONES.installationId)).toBe(false);
    expect(t.layer.has('inst.nowhere')).toBe(false);
  });

  it('글자는 설치물마다 미리 만들어 두고 처음에는 모두 숨긴다(프레임마다 새로 만들지 않는다)', () => {
    // 종 자리(초안 칸) 수의 다섯 묶음(종 이름·! 표·♪·낮음·열 이름표) + 나무 × 단의 옥타브 이름표 + 나무마다 '옥타브' 머리글 + 빈터의 나무 이름
    const counts: Array<[InstallationDef, number]> = [
      [W1, 5 * 4 + 4 + 1],
      [W2, 5 * 4 + 4 + 1],
      [W3, 5 * 3 + 4 + 1],
      [W4, 5 * 12 + 12 + 3 + 3],
    ];
    for (const [inst, n] of counts) {
      const t = direct([inst]);
      expect(t.scene.texts, inst.installationId).toHaveLength(n);
      expect(t.scene.texts.every((x) => !x.visible)).toBe(true);
      expect(t.scene.texts.every((x) => x.depth === DEPTH + 1)).toBe(true);
    }
    const t = direct([W1]);
    const before = t.scene.texts.length;
    t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 0, 'C4')]), true);
    t.draw(W1, bellsOf('tree'), true);
    t.draw(W1, undefined, false);
    expect(t.scene.texts).toHaveLength(before);
  });

  it('모르는 설치물에는 아무것도 그리지 않는다', () => {
    const t = direct([W1]);
    const out = t.layer.draw(t.g as never, W2, viewOf(W2, bellsOf('tree')), true);
    expect(out).toEqual({ form: 'tree', trees: 0, bells: [], hatched: [], labels: { octaves: 0, columns: 0, trees: 0 }, cursor: null });
    expect(t.g.log).toEqual([]);
  });

  it('지우면 글자를 모두 부순다', () => {
    const t = direct([W1, W4]);
    t.layer.destroy();
    expect(t.scene.texts.every((x) => x.destroyed)).toBe(true);
    expect(t.layer.has(W1_ID)).toBe(false);
  });
});

describe('줄기와 가지(걷는 중에도 풍경으로 남는다)', () => {
  it('나무: 왼쪽에 줄기 하나, 단마다 가로 가지 하나(4단), 뿌리 밑의 옅은 그늘', () => {
    const t = direct();
    const out = t.draw(W1, undefined, false);
    expect(out).toEqual({ form: 'tree', trees: 1, bells: [], hatched: [], labels: { octaves: 0, columns: 0, trees: 0 }, cursor: null });
    const rects = t.g.calls('fillRoundedRect');
    // 줄기: 격자 왼쪽에서 16 px, 너비 8, 맨 위 가지 2 px 위부터 격자보다 12 px 길게
    expect(rects).toContainEqual([1724, 2290, 8, 300, 4]);
    // 가지: 줄기에서 격자 오른쪽 끝 + 6 px까지, 두께 7, 단마다 72 px 간격
    for (let row = 0; row < 4; row++) expect(rects).toContainEqual([1724, 2297.5 + row * 72, 342, 7, 3.5]);
    expect(rects.filter((a) => a[3] === 7)).toHaveLength(4);
    expect(t.g.calls('fillEllipse')).toEqual([[1900, 2589, 364, 16]]);
    // 글자는 하나도 보이지 않는다
    expect(t.scene.shown()).toEqual([]);
  });

  it('종탑: 양쪽에 기둥이 서고 가지는 두 기둥을 잇는다', () => {
    const t = direct();
    t.draw(W3, undefined, false);
    const rects = t.g.calls('fillRoundedRect');
    expect(rects).toContainEqual([964, 2090, 8, 300, 4]);
    expect(rects).toContainEqual([1228, 2090, 8, 300, 4]);
    for (let row = 0; row < 4; row++) expect(rects).toContainEqual([964, 2097.5 + row * 72, 272, 7, 3.5]);
    expect(rects.filter((a) => a[3] === 300)).toHaveLength(2);
  });

  it('빈터: 나무마다 줄기와 가지 4단, 나무들을 잇는 길 하나(그늘 대신)', () => {
    const t = direct();
    t.draw(W4, undefined, false);
    const rects = t.g.calls('fillRoundedRect');
    expect(rects.filter((a) => a[3] === 300)).toHaveLength(3);
    expect(rects.filter((a) => a[3] === 7)).toHaveLength(12);
    // 첫 나무 줄기 16 px 왼쪽에서 마지막 나무 오른쪽 16 px까지, 나무 밑에 깐 길
    expect(rects).toContainEqual([340, 1486, 1184, 16, 8]);
    expect(t.g.count('fillEllipse')).toBe(0);
    // 나무는 위치가 다르다: 둘째 나무의 줄기는 첫째 나무에서 416 px 오른쪽
    expect(rects).toContainEqual([340 + 416, 1188 - 2, 8, 300, 4]);
  });
});

describe('설치물 모드: 고리, 이름표', () => {
  it('빈 나무: 고리 16개와 칸 테두리 16개, 옥타브 이름표 5 4 3 2, 열 이름표 1 2 3 4, 머리글 옥타브', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree'), true);
    expect(out.labels).toEqual({ octaves: 4, columns: 4, trees: 0 });
    expect(out.hatched).toEqual([]);
    expect(out.cursor).toBeNull();
    expect(t.scene.shown().sort()).toEqual(['1', '2', '2', '3', '3', '4', '4', '5', '옥타브']);
    expect(circlesOf(t.g, 'strokeCircle', 4.5)).toHaveLength(16);
    expect(t.g.calls('strokeRoundedRect').filter((a) => a[2] === 70 && a[3] === 66 && a[4] === 12)).toHaveLength(16);
  });

  it('이름표는 띠 안에 선다: 옥타브는 왼쪽 띠의 단 가운데, 열은 위쪽 띠의 열 가운데', () => {
    const t = direct();
    t.draw(W1, bellsOf('tree'), true);
    // 옥타브 이름표: 격자 왼쪽 34 px, 단의 가운데(36 px 아래)
    for (const [row, octave] of [5, 4, 3, 2].entries()) expect(t.textAt(String(octave), 1740 - 34, 2292 + row * 72 + 36 + 1), `옥타브 ${octave}`).toBeDefined();
    // 열 이름표: 열 가운데, 격자 위 14 px
    for (let c = 0; c < 4; c++) expect(t.textAt(String(c + 1), 1740 + c * 80 + 40, 2292 - 14 + 1), `열 ${c + 1}`).toBeDefined();
    expect(t.textAt('옥타브', 1740 - 34, 2292 - 14)).toBeDefined();
  });

  it('걷는 중(설치물 모드 밖)에는 이름표, 빈 고리, 칸 테두리가 없고 종이 걸린 고리만 풍경으로 남는다', () => {
    const t = direct();
    const hung = [markOf(W1, 0, 4, 0, 'C4'), markOf(W1, 0, 4, 2, 'G4')];
    const out = t.draw(W1, bellsOf('tree', hung, { cursor: 1, cursorOctave: 4, usable: [4] }), false);
    expect(out.labels).toEqual({ octaves: 0, columns: 0, trees: 0 });
    expect(out.hatched).toEqual([]);
    expect(out.cursor).toBeNull();
    expect(out.bells.map((b) => b.label)).toEqual(['C4', 'G4']);
    expect(t.scene.shown().sort()).toEqual(['C4', 'G4']);
    expect(circlesOf(t.g, 'strokeCircle', 4.5)).toHaveLength(2);
    expect(t.g.calls('strokeRoundedRect').filter((a) => a[2] === 70)).toHaveLength(0);
    expect(circlesOf(t.g, 'fillCircle', 12)).toHaveLength(0);
    // 같은 모습을 설치물 모드로 그리면 이름표, 고리, 고른 자리가 생긴다
    const active = t.draw(W1, bellsOf('tree', hung, { cursor: 1, cursorOctave: 4, usable: [4] }), true);
    expect(active.labels.octaves).toBe(4);
    expect(active.cursor).toEqual({ slot: ring(W1, 0, 4, 1), tree: 0, column: 1, octave: 4 });
    expect(circlesOf(t.g, 'strokeCircle', 4.5)).toHaveLength(16);
  });

  it('쓰지 않는 단: 판본의 음역 밖의 옥타브는 빗금이 덮고 옥타브 번호가 옅다(색만으로 말하지 않는다)', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree', [], { usable: [4] }), true);
    expect(out.hatched).toEqual([5, 3, 2]);
    // 칸 테두리는 쓰는 단(4옥타브)의 네 칸만, 빗금은 단 전체(칸 하나하나가 아니라)에 긋는다
    expect(t.g.calls('strokeRoundedRect').filter((a) => a[2] === 70 && a[3] === 66 && a[4] === 12)).toHaveLength(4);
    const per = hatchSegments(1740 + 9, 2292 + 9, 320 - 18, 72 - 18, 12).length;
    expect(per).toBeGreaterThan(10);
    expect(t.g.calls('lineBetween')).toHaveLength(3 * per);
    // 옥타브 번호: 쓰지 않는 단은 반쯤 투명, 쓰는 단은 그대로. 이름표 자체는 모두 달린다
    expect(t.textAt('5', 1740 - 34, 2292 + 37)!.alpha).toBe(0.5);
    expect(t.textAt('4', 1740 - 34, 2292 + 72 + 37)!.alpha).toBe(1);
    expect(t.textAt('3', 1740 - 34, 2292 + 144 + 37)!.alpha).toBe(0.5);
    // 다시 쓰는 판본을 그리면 옅음이 풀린다(글자를 다시 쓴다)
    t.draw(W1, bellsOf('tree'), true);
    expect(t.textAt('5', 1740 - 34, 2292 + 37)!.alpha).toBe(1);
  });

  it('모습이 아직 없으면 모든 단을 쓴다(빗금 없음)', () => {
    const t = direct();
    expect(t.draw(W2, undefined, true).hatched).toEqual([]);
  });
});

describe('걸린 종', () => {
  it('종은 걸린 고리 칸 안에 그린다: 종 이름 글자는 칸 가운데, 몸통 한가운데에 선다', () => {
    const t = direct();
    const marks = [markOf(W1, 0, 4, 0, 'C4'), markOf(W1, 0, 4, 1, 'E4'), markOf(W1, 0, 3, 2, 'G3')];
    const out = t.draw(W1, bellsOf('tree', marks), false);
    expect(out.bells.map((b) => [b.slot, b.tree, b.column, b.octave, b.label])).toEqual([
      [ring(W1, 0, 4, 0), 0, 0, 4, 'C4'],
      [ring(W1, 0, 4, 1), 0, 1, 4, 'E4'],
      [ring(W1, 0, 3, 2), 0, 2, 3, 'G3'],
    ]);
    // 고리 칸의 사각형이 그대로 나온다(좌표를 따로 계산하지 않는다)
    for (const b of out.bells) expect([b.x, b.y, b.w, b.h]).toEqual([cellOf(W1, b.slot).x, cellOf(W1, b.slot).y, 80, 72]);
    // C4는 4옥타브 단(둘째 단) 첫 열: 칸 (1740, 2364), 이름은 칸 가운데 x, 위에서 30 px
    expect(t.textAt('C4', 1780, 2364 + 30)).toBeDefined();
    expect(t.textAt('E4', 1860, 2364 + 30)).toBeDefined();
    expect(t.textAt('G3', 1940, 2436 + 30)).toBeDefined();
    // 종마다 몸통과 아랫단(입술)을 채운다: 둥근 몸통 44 × 24, 아랫단 54 × 6
    const rects = t.g.calls('fillRoundedRect');
    expect(rects).toContainEqual([1758, 2364 + 17, 44, 24, { tl: 16, tr: 16, bl: 2, br: 2 }]);
    expect(rects).toContainEqual([1753, 2364 + 39, 54, 6, 3]);
  });

  it('긴 이름은 몸통에 맞게 줄여 넣는다', () => {
    const t = direct();
    t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 0, 'C4'), markOf(W1, 0, 4, 1, 'E♭4')]), false);
    expect(t.textAt('C4', 1780, 2394)!.scaleValue).toBe(1);
    // 가짜 글자의 폭은 글자 수 × 14: 3글자는 42 px이고 몸통 안쪽은 44 − 6 = 38 px
    expect(t.textAt('E♭4', 1860, 2394)!.scaleValue).toBeCloseTo(38 / 42, 9);
  });

  it('판정이 가리킨 종은 산호색 배지와 ! 글자를 단다(색만으로 말하지 않는다). 가리키지 않은 종에는 없다', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 0, 'C4', { flagged: true }), markOf(W1, 0, 4, 1, 'E4')]), false);
    expect(out.bells.map((b) => b.flagged)).toEqual([true, false]);
    expect(t.scene.shown().filter((c) => c === '!')).toHaveLength(1);
    expect(t.g.calls('fillStyle')).toContainEqual([CORAL, 1]);
    // 배지는 종의 왼쪽 위(칸 가운데에서 왼쪽 28 px, 위 17 px)
    expect(circlesOf(t.g, 'fillCircle', 10)).toContainEqual([1780 - 28, 2364 + 17, 10]);
    const clean = t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 1, 'E4')]), false);
    expect(clean.bells[0]!.flagged).toBe(false);
    expect(t.scene.shown()).toEqual(['E4']);
    expect(t.g.calls('fillStyle')).not.toContainEqual([CORAL, 1]);
  });

  it('듣는 중인 종은 금빛 테두리와 ♪ 글자를 단다', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 0, 'C4', { playing: true }), markOf(W1, 0, 4, 1, 'E4')]), true);
    expect(out.bells.map((b) => b.playing)).toEqual([true, false]);
    expect(t.scene.shown().filter((c) => c === '♪')).toHaveLength(1);
    expect(t.g.calls('lineStyle')).toContainEqual([5, GOLD, 1]);
    expect(t.g.calls('strokeRoundedRect')).toContainEqual([1780 - 31, 2364 + 13, 62, 42, 14]);
  });

  it('소리를 끈 종(종탑)은 속이 빈 점선 테두리와 ✕ 표시를 단다. 소리가 없으니 듣는 중이라도 ♪는 없다', () => {
    const t = direct();
    const out = t.draw(W3, bellsOf('tower', [markOf(W3, 0, 3, 0, 'C3', { muted: true, playing: true }), markOf(W3, 0, 3, 1, 'E3')]), true);
    expect(out.bells.map((b) => [b.label, b.muted])).toEqual([
      ['C3', true],
      ['E3', false],
    ]);
    expect(t.scene.shown()).not.toContain('♪');
    // 점선: 종 전체를 감싼 직사각형의 네 변을 6 px 선과 4 px 틈으로 끊어 그린다
    const cell = cellOf(W3, ring(W3, 0, 3, 0));
    const cx = cell.x + 40;
    const dashes = dashedRectSegments(cx - 27, cell.y + 17, 54, 28, 6, 4);
    expect(dashes.length).toBeGreaterThan(15);
    const lines = t.g.calls('lineBetween');
    for (const d of dashes) expect(lines).toContainEqual(d);
    // ✕ 표시: 오른쪽 위에 흰 원과 가위표
    expect(circlesOf(t.g, 'fillCircle', 9)).toContainEqual([cx + 28, cell.y + 19, 9]);
    expect(lines).toContainEqual([cx + 28 - 4, cell.y + 19 - 4, cx + 28 + 4, cell.y + 19 + 4]);
    // 이름은 옅게 남아서 어떤 음의 종인지 읽을 수 있다
    expect(t.textAt('C3', cx, cell.y + 30)!.alpha).toBe(0.55);
    expect(t.textAt('E3', cell.x + 120, cell.y + 30)!.alpha).toBe(1);
  });

  it('가장 낮은 종(종탑)은 금빛 밑줄과 낮음 이름표를 단다. 한 종에만 달린다', () => {
    const t = direct();
    const out = t.draw(W3, bellsOf('tower', [markOf(W3, 0, 3, 0, 'C3', { lowest: true }), markOf(W3, 0, 4, 1, 'E4'), markOf(W3, 0, 4, 2, 'G4')]), true);
    expect(out.bells.map((b) => b.lowest)).toEqual([true, false, false]);
    expect(t.scene.shown().filter((c) => c === '낮음')).toHaveLength(1);
    const cell = cellOf(W3, ring(W3, 0, 3, 0));
    expect(t.g.calls('fillRoundedRect')).toContainEqual([cell.x + 40 - 27, cell.y + 52, 54, 3.5, 1.75]);
    expect(t.g.calls('fillStyle')).toContainEqual([GOLD, 1]);
    // 낮음 이름표 글자는 밑줄 아래, 칸 안에 든다
    const tag = t.scene.visibleTexts().find((x) => x.content === '낮음')!;
    expect(tag.x).toBe(cell.x + 40);
    expect(tag.y).toBeLessThan(cell.y + cell.h);
  });

  it('종 모양은 TEAL 테두리, 걸려 있지 않은 고리에는 종이 없다', () => {
    const t = direct();
    t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 0, 'C4')]), false);
    expect(t.g.calls('lineStyle')).toContainEqual([3, TEAL, 0.95]);
    // 종이 하나뿐이라 몸통도 하나다
    expect(t.g.calls('fillRoundedRect').filter((a) => a[2] === 44 && a[3] === 24)).toHaveLength(1);
  });

  it('모습에서 종이 없어지면 이전에 보이던 글자도 숨긴다', () => {
    const t = direct();
    t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 0, 'C4', { flagged: true, playing: true })]), false);
    expect(t.scene.shown().sort()).toEqual(['!', 'C4', '♪']);
    t.draw(W1, bellsOf('tree'), false);
    expect(t.scene.shown()).toEqual([]);
    t.draw(W1, undefined, false);
    expect(t.scene.shown()).toEqual([]);
  });

  it('고리 번호를 찾을 수 없는 종(나무에 없는 단)은 그리지 않는다', () => {
    const t = direct();
    const stray: BellMark = { ...markOf(W1, 0, 4, 0, 'C4'), slot: 999 };
    expect(t.draw(W1, bellsOf('tree', [stray]), false).bells).toEqual([]);
    expect(t.scene.shown()).toEqual([]);
  });
});

describe('고른 자리', () => {
  it('종이 걸린 열을 고르면 그 종의 고리 칸에 굵은 테두리가 서고, 고른 열의 이름표와 단의 이름표가 채워진다', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 1, 'E4')], { cursor: 1, cursorOctave: 4 }), true);
    const cell = cellOf(W1, ring(W1, 0, 4, 1));
    expect(out.cursor).toEqual({ slot: cell.slot, tree: 0, column: 1, octave: 4 });
    expect(t.g.calls('lineStyle')).toContainEqual([7, TEAL, 1]);
    expect(t.g.calls('strokeRoundedRect')).toContainEqual([cell.x + 1, cell.y + 1, 78, 70, 15]);
    // 고른 열 전체의 옅은 바탕(위 2 px부터 격자 높이 + 4 px)
    expect(t.g.calls('fillRoundedRect')).toContainEqual([1740 + 80 + 2, 2292 - 2, 76, 292, 14]);
    // 이름표: 고른 열(2)과 고른 단(4)은 흰 글자, 나머지는 먹색
    expect(t.textAt('2', 1740 + 80 + 40, 2292 - 14 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('4', 1740 - 34, 2292 + 72 + 36 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('1', 1740 + 40, 2292 - 14 + 1)!.color).toBe(INK_CSS);
    expect(t.textAt('3', 1740 - 34, 2292 + 144 + 36 + 1)!.color).toBe(INK_CSS);
    // 고르는 것이 바뀌면 이름표 색도 바뀐다
    t.draw(W1, bellsOf('tree', [markOf(W1, 0, 4, 1, 'E4')], { cursor: 3, cursorOctave: 3 }), true);
    expect(t.textAt('2', 1740 + 80 + 40, 2292 - 14 + 1)!.color).toBe(INK_CSS);
    expect(t.textAt('4', 1740 + 240 + 40, 2292 - 14 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('3', 1740 - 34, 2292 + 144 + 36 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('4', 1740 - 34, 2292 + 72 + 36 + 1)!.color).toBe(INK_CSS);
  });

  it('종이 없는 열을 고르면 종을 걸 단의 고리를 가리킨다', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree', [], { cursor: 2, cursorOctave: 3 }), true);
    expect(out.cursor).toEqual({ slot: ring(W1, 0, 3, 2), tree: 0, column: 2, octave: 3 });
  });

  it('걸 단을 알 수 없으면 열만 알린다(테두리 없이 열 이름표와 바탕만)', () => {
    const t = direct();
    const out = t.draw(W1, bellsOf('tree', [], { cursor: 2, cursorOctave: null }), true);
    expect(out.cursor).toEqual({ slot: null, tree: 0, column: 2, octave: null });
    expect(t.g.calls('lineStyle')).not.toContainEqual([7, TEAL, 1]);
    expect(t.textAt('3', 1740 + 160 + 40, 2292 - 14 + 1)!.color).toBe(WHITE_CSS);
  });

  it('고른 것이 없으면 그리지 않는다. 범위 밖의 칸 번호도 그리지 않는다', () => {
    const t = direct();
    expect(t.draw(W1, bellsOf('tree', [], { cursor: null }), true).cursor).toBeNull();
    expect(t.draw(W1, bellsOf('tree', [], { cursor: 4, cursorOctave: 4 }), true).cursor).toBeNull();
    expect(t.g.calls('lineStyle')).not.toContainEqual([7, TEAL, 1]);
  });
});

describe('빈터(W4): 나무 셋', () => {
  const glade = (extra: Partial<BellView> = {}, bells: BellMark[] = []) => bellsOf('glade', bells, { usable: [5, 4], ...extra });

  it('설치물 모드에서는 나무마다 이름표(첫째·둘째·셋째 나무), 열 이름표, 옥타브 이름표를 단다', () => {
    const t = direct();
    const out = t.draw(W4, glade(), true);
    expect(out.labels).toEqual({ octaves: 12, columns: 12, trees: 3 });
    for (const name of ['첫째 나무', '둘째 나무', '셋째 나무']) expect(t.scene.shown(), name).toContain(name);
    // 쓰지 않는 단은 나무마다 빗금을 치지만 옥타브는 한 번만 센다
    expect(out.hatched).toEqual([3, 2]);
    expect(t.g.calls('lineBetween').length).toBeGreaterThan(30);
    // 둘째 나무의 이름표는 둘째 나무 가운데(위쪽 띠의 맨 위)
    expect(t.textAt('둘째 나무', 772 + 160, 1188 - 36 + 1)).toBeDefined();
    // 설치물 모드가 아니면 이름표가 없다
    expect(t.draw(W4, glade(), false).labels).toEqual({ octaves: 0, columns: 0, trees: 0 });
    expect(t.scene.shown()).toEqual([]);
  });

  it('고른 종이 있는 나무의 이름표만 채운다', () => {
    const t = direct();
    // 초안 칸 5 = 둘째 나무의 둘째 열
    const out = t.draw(W4, glade({ cursor: 5, cursorOctave: 5 }), true);
    expect(out.cursor).toEqual({ slot: ring(W4, 1, 5, 1), tree: 1, column: 1, octave: 5 });
    expect(t.textAt('둘째 나무', 772 + 160, 1188 - 36 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('첫째 나무', 356 + 160, 1188 - 36 + 1)!.color).toBe(INK_CSS);
    expect(t.textAt('셋째 나무', 1188 + 160, 1188 - 36 + 1)!.color).toBe(INK_CSS);
    // 열 이름표도 고른 나무의 둘째 열만 흰 글자(다른 나무의 둘째 열은 먹색)
    expect(t.textAt('2', 772 + 80 + 40, 1188 - 14 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('2', 356 + 80 + 40, 1188 - 14 + 1)!.color).toBe(INK_CSS);
    expect(t.textAt('2', 1188 + 80 + 40, 1188 - 14 + 1)!.color).toBe(INK_CSS);
    // 고른 단(5)의 옥타브 이름표도 그 나무만 채운다
    expect(t.textAt('5', 772 - 34, 1188 + 36 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('5', 356 - 34, 1188 + 36 + 1)!.color).toBe(INK_CSS);
    // 나무를 건너뛰면 채운 이름표가 옮겨 간다
    t.draw(W4, glade({ cursor: 8, cursorOctave: 4 }), true);
    expect(t.textAt('셋째 나무', 1188 + 160, 1188 - 36 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('둘째 나무', 772 + 160, 1188 - 36 + 1)!.color).toBe(INK_CSS);
  });

  it('나무마다의 종이 각자의 고리 칸에 걸린다(같은 열, 같은 단이라도 나무가 다르면 다른 칸)', () => {
    const t = direct();
    const marks = [markOf(W4, 0, 4, 0, 'C4'), markOf(W4, 1, 4, 0, 'F4'), markOf(W4, 2, 4, 0, 'G4')];
    const out = t.draw(W4, glade({}, marks), false);
    expect(out.bells.map((b) => [b.tree, b.column, b.label, b.x])).toEqual([
      [0, 0, 'C4', 356],
      [1, 0, 'F4', 772],
      [2, 0, 'G4', 1188],
    ]);
    expect(new Set(out.bells.map((b) => b.slot)).size).toBe(3);
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
}

function pipeline() {
  const r = rig({ definitions: [Q05, Q06, Q20, Q22, Q21, Q23].map(quest) });
  const bridge = new WorldBridge({ x: 1900, y: 2700, facing: 'down' });
  const defs = [W1, W2, W3, W4];
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => {} },
    installations: defs,
    panels: new Set(['panel.chord']),
    frames: new FakeFrames(),
  });
  const scene = new FakeScene();
  const layer = new InstallationLayer(scene as never, [...defs, STONES], bridge, fakeCull());
  const press = (inst: InstallationDef, slot: number): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot });
  const drawn = (id: string) => {
    layer.update(0, false);
    return layer.debug().find((d) => d.installationId === id)!;
  };
  return { ...r, bridge, ic, scene, layer, press, drawn };
}

describe('설치물 층의 종나무 길', () => {
  it('종나무는 bell을 돌려주고 돌 설치물에는 bell이 없다. 종나무에는 칸마다의 글자를 따로 만들지 않는다', () => {
    const t = pipeline();
    t.layer.update(0, false);
    const all = t.layer.debug();
    expect(all.map((d) => d.installationId)).toEqual([W1_ID, W2_ID, W3_ID, W4_ID, STONES.installationId]);
    expect(all.slice(0, 4).every((d) => d.bell !== undefined)).toBe(true);
    expect(all[4]!.bell).toBeUndefined();
    expect(all.map((d) => d.slots.length)).toEqual([16, 16, 12, 48, STONES.slots.length]);
    expect(all[0]!.slots.every((s) => !s.numbered && s.label === null)).toBe(true);
    // 글자: 종나무 네 곳의 묶음(25 + 25 + 20 + 78) + 돌 설치물의 칸별 글자(칸마다 넷)
    expect(t.scene.texts).toHaveLength(25 + 25 + 20 + 78 + STONES.slots.length * 4);
  });

  it('W3 종탑은 들어가기 전에도 처음 걸린 종 셋이 풍경으로 보인다(걷는 중에도)', () => {
    const t = pipeline();
    t.ic.enter('W3');
    t.ic.select(`${Q06}/c-first`);
    t.ic.exit();
    const d = t.drawn(W3_ID);
    expect(d.active).toBe(false);
    expect(d.bell!.bells.map((b) => b.label)).toEqual(['C3', 'E3', 'G3']);
    expect(d.bell!.labels).toEqual({ octaves: 0, columns: 0, trees: 0 });
    expect(d.bell!.cursor).toBeNull();
    // 고리 요약에도 같은 이름이 올라온다
    expect(d.slots.filter((s) => s.label !== null).map((s) => s.label)).toEqual(['C3', 'E3', 'G3']);
  });

  it('들어가 종을 걸면 종이 그려지고 고리 요약에 이름이 보인다. 설치물 모드 밖의 나무는 active가 아니다', () => {
    const t = pipeline();
    t.ic.enter('W1');
    t.ic.select(`${Q05}/c-major`);
    t.press(W1, ring(W1, 0, 4, 0));
    const d = t.drawn(W1_ID);
    expect(d.active).toBe(true);
    expect(d.bell!.bells.map((b) => [b.label, b.column, b.octave])).toEqual([['C4', 0, 4]]);
    expect(d.slots.find((s) => s.slot === ring(W1, 0, 4, 0))!.label).toBe('C4');
    // 고른 자리: 방금 건 종 자리, 요약의 selected도 설치물 모드에서만 켜진다
    expect(d.bell!.cursor).toEqual({ slot: ring(W1, 0, 4, 0), tree: 0, column: 0, octave: 4 });
    expect(d.slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([ring(W1, 0, 4, 0)]);
    expect(d.bell!.labels.octaves).toBe(4);
    const other = t.drawn(W2_ID);
    expect(other.active).toBe(false);
    expect(other.bell!.labels).toEqual({ octaves: 0, columns: 0, trees: 0 });
    expect(other.slots.every((s) => !s.selected)).toBe(true);
  });

  it('판본의 음역 밖의 단은 쓰지 않는 가지로 그려지고, 음역은 판본이 정한다(자유로 놀기는 가지 전체)', () => {
    const t = pipeline();
    t.ic.enter('W1');
    const free = t.drawn(W1_ID);
    expect(free.bell!.hatched).toEqual([]);
    t.ic.select(`${Q05}/c-major`);
    const d = t.drawn(W1_ID);
    // 어느 옥타브가 쓰이는지는 판본의 음역이 정하고, 그 밖의 단이 빗금이다(위에서 아래 차례)
    const usable = t.ic.bell!.usable();
    expect(usable.length).toBeGreaterThan(0);
    expect(usable.length).toBeLessThan(4);
    expect(d.bell!.hatched).toEqual([5, 4, 3, 2].filter((o) => !usable.includes(o)));
    expect(d.bell!.hatched.length + usable.length).toBe(4);
  });

  it('틀린 배치를 확인하면 틀린 종에만 배지가 달리고, 고치면 배지가 사라진다', () => {
    const t = pipeline();
    t.ic.enter('W1');
    t.ic.select(`${Q05}/c-major`);
    const bench = t.ic.bell!;
    const hang = (letter: 'C' | 'D' | 'E' | 'G', column: number): void => {
      bench.pickLetter(letter);
      bench.selectColumn(column);
      bench.perform('place');
    };
    hang('C', 0);
    hang('E', 1);
    hang('D', 2); // 틀린 음
    expect(t.drawn(W1_ID).bell!.bells.every((b) => !b.flagged)).toBe(true);
    expect(t.scene.shown()).not.toContain('!');
    bench.perform('check');
    const wrong = t.drawn(W1_ID);
    expect(wrong.bell!.bells.filter((b) => b.flagged).map((b) => b.label)).toEqual(['D4']);
    expect(wrong.slots.filter((s) => s.flagged).map((s) => s.label)).toEqual(['D4']);
    expect(t.scene.shown().filter((c) => c === '!')).toHaveLength(1);
    hang('G', 2);
    const fixed = t.drawn(W1_ID);
    expect(fixed.bell!.bells.every((b) => !b.flagged)).toBe(true);
    expect(t.scene.shown()).not.toContain('!');
  });

  it('내 화음을 들으면 지금 울리는 빈터의 나무의 종에 ♪가 달리고, 끝나면 사라진다', () => {
    const t = pipeline();
    t.ic.enter('W4');
    t.ic.select(`${Q21}/c-major-pillars`);
    const bench = t.ic.bell!;
    const hang = (letter: 'C' | 'E' | 'G', column: number): void => {
      bench.pickLetter(letter);
      bench.selectColumn(column);
      bench.perform('place');
    };
    hang('C', 0);
    hang('E', 1);
    hang('G', 2);
    expect(t.drawn(W4_ID).bell!.bells.some((b) => b.playing)).toBe(false);
    bench.perform('hear-mine');
    t.run(0.5);
    const d = t.drawn(W4_ID);
    expect(d.bell!.bells.filter((b) => b.playing).map((b) => b.tree)).toEqual([0, 0, 0]);
    expect(d.slots.filter((s) => s.playing)).toHaveLength(3);
    expect(t.scene.shown().filter((c) => c === '♪')).toHaveLength(3);
    t.run(30);
    const after = t.drawn(W4_ID);
    expect(after.bell!.bells.every((b) => !b.playing)).toBe(true);
    expect(t.scene.shown()).not.toContain('♪');
  });

  it('매 프레임 글자를 새로 만들지 않는다(처음 만든 글자를 다시 쓴다)', () => {
    const t = pipeline();
    const before = t.scene.texts.length;
    t.ic.enter('W4');
    t.ic.select(`${Q21}/c-major-pillars`);
    t.press(W4, ring(W4, 0, 4, 0));
    for (let i = 0; i < 5; i++) t.layer.update(i / 60, false);
    expect(t.scene.texts).toHaveLength(before);
  });

  it('지우면 종나무의 글자도 모두 부순다', () => {
    const t = pipeline();
    t.layer.destroy();
    expect(t.scene.texts.every((x) => x.destroyed)).toBe(true);
    expect(t.scene.graphics.every((g) => g.destroyed)).toBe(true);
  });
});
