// 7-1d 계단밭(T5, 4.7)을 월드에 그리는 층(world/installations/terraceLayer.ts, layer.ts의 위임): 다리의 terrace를 읽어 줄 돌담과 가운데 턱, 음자리표 조각상,
// 놓인 등(이름·변화표·판정·듣기), 보표 밖 등의 덧줄 돌담, 설치물 모드의 열 이름표·쓰지 않는 구간(빗금)·고른 열과 높이, 밟은 열의 반짝임을 옮겨 그린다.
// Phaser 없이 가짜 장면(tests/unit/fake-phaser.ts)으로 시험한다. 실제 화면의 모습은 브라우저 흐름 시험이 본다.
// 앞쪽은 손으로 만든 모습으로 그리는 규칙(색만으로 말하지 않는다, 좌표, 그리는 차례)을 확인하고, 뒤쪽은 설치물 컨트롤러 → 다리 → 층의 전체 길을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InstallationDef } from '@/domain/installation';
import { terraceFieldWalls, terraceMapOf, terraceYOfStep } from '@/domain/terrace';
import type { TerraceMark, TerraceView } from '@/domain/terrace';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { hatchSegments } from '@/world/installations/hatch';
import { InstallationLayer, STEP_FLASH_SECONDS } from '@/world/installations/layer';
import { CORAL, GOLD, INK, INK_CSS, ROCK, TEAL, WHITE, WHITE_CSS } from '@/world/installations/palette';
import { TerraceLayer, dashRingSegments, headerParts } from '@/world/installations/terraceLayer';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import { FakeGraphics, FakeScene, fakeCull } from './fake-phaser';
import type { FakeText } from './fake-phaser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q01 = 'pitch.same-note-two-clefs';
const Q09 = 'staff.lines-and-spaces';
const Q10 = 'staff.ledger-lines';
const Q11 = 'staff.middle-c-neighbors';
const Q12 = 'staff.range-ladder';
const N1_ID = 'inst.staff-hill.treble-terrace';
const N2_ID = 'inst.staff-hill.bass-terrace';
const N3_ID = 'inst.staff-hill.middle-ledge';
const DEPTH = -90_000;

const N1 = installation(N1_ID);
const N2 = installation(N2_ID);
const N3 = installation(N3_ID);
const STONES = installation('inst.village.scale-stones');

/** 열(1부터)의 사각형과 가운데 x */
const rectOf = (inst: InstallationDef, column: number) => inst.slots.find((s) => s.slot === column)!;
const colX = (inst: InstallationDef, column: number): number => rectOf(inst, column).x + rectOf(inst, column).w / 2;
/** 가온 도(C4)가 1000이고 온음계 한 칸이 48 px이다(4.7) */
const yOf = (step: number): number => 1000 - 48 * step;

const TREBLE: [number, number] = [-2, 14];
const BASS: [number, number] = [-14, 2];

/** 손으로 만든 열. 층이 읽지 않는 midi는 비워 둔다. draft는 음이름 판본처럼 열 번호보다 하나 작다 */
function markOf(inst: InstallationDef, column: number, step: number | null, extra: Partial<TerraceMark> = {}): TerraceMark {
  const clef = extra.clef ?? (inst === N2 ? 'bass' : inst === N3 && column % 2 === 0 ? 'bass' : 'treble');
  const [minStep, maxStep] = clef === 'treble' ? TREBLE : BASS;
  return { column, draft: column - 1, label: 'E4', clef, step, accidental: null, minStep, maxStep, name: null, midi: null, flagged: false, playing: false, ...extra };
}
const viewOf = (columns: TerraceMark[], extra: Partial<TerraceView> = {}): TerraceView => ({ columns, cursor: null, cursorStep: null, free: false, ...extra });
const forInst = (inst: InstallationDef, terrace?: TerraceView): InstallationView => ({ installationId: inst.installationId, slots: [], ...(terrace ? { terrace } : {}) });

/** 손으로 만든 모습을 직접 그리는 층 */
function direct(insts: InstallationDef[] = [N1, N2, N3]) {
  const scene = new FakeScene();
  const layer = new TerraceLayer(scene as never, insts, DEPTH);
  const g = new FakeGraphics();
  const draw = (views: InstallationView[] = [], activeId: string | null = null, flashOf: (id: string, slot: number) => number = () => 0) => {
    g.reset();
    return layer.drawAll(() => g as never, views, activeId, flashOf);
  };
  /** 보이는 글자 가운데 내용이 같고 자리가 같은 것 */
  const textAt = (content: string, x: number, y: number): FakeText | undefined => scene.visibleTexts().find((t) => t.content === content && Math.abs(t.x - x) < 0.01 && Math.abs(t.y - y) < 0.01);
  return { scene, layer, g, draw, textAt };
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

// ───── 처음 만들 때 ─────

describe('층을 만들 때', () => {
  it('계단밭 설치물만 맡는다(돌 설치물과 모르는 설치물은 맡지 않는다)', () => {
    const t = direct([N1, N2, N3, STONES]);
    for (const id of [N1_ID, N2_ID, N3_ID]) expect(t.layer.has(id), id).toBe(true);
    expect(t.layer.has(STONES.installationId)).toBe(false);
    expect(t.layer.has('inst.nowhere')).toBe(false);
    expect(direct([STONES]).draw().size).toBe(0);
  });

  it('글자는 설치물마다 미리 만들어 두고, 풍경인 조각상 글자만 처음부터 보인다(프레임마다 새로 만들지 않는다)', () => {
    // 설치물마다 일곱 묶음(열 번호·이름·음자리표 꼬리·등 이름·변화표·'!'·♪) × 열 여덟 + 조각상 글자(음자리표마다 두 줄, 가운데 턱 한 줄)
    const counts: Array<[InstallationDef[], number]> = [
      [[N1], 56 + 2],
      [[N2], 56 + 2],
      [[N3], 56 + 5],
      [[N1, N2, N3], 168 + 5],
    ];
    for (const [insts, n] of counts) {
      const t = direct(insts);
      expect(t.scene.texts, insts.map((i) => i.stationCode).join()).toHaveLength(n);
      expect(t.scene.texts.every((x) => x.depth === DEPTH + 1)).toBe(true);
      expect(t.scene.visibleTexts()).toHaveLength(n - 56 * insts.length);
    }
    const t = direct();
    const before = t.scene.texts.length;
    t.draw([forInst(N1, viewOf([markOf(N1, 1, 4)]))], N1_ID);
    t.draw([], null);
    t.draw([forInst(N3)], N3_ID);
    expect(t.scene.texts).toHaveLength(before);
  });

  it('지우면 글자를 모두 부수고 더는 맡지 않는다', () => {
    const t = direct();
    t.layer.destroy();
    expect(t.scene.texts.every((x) => x.destroyed)).toBe(true);
    expect(t.layer.has(N1_ID)).toBe(false);
    expect(t.draw().size).toBe(0);
  });
});

// ───── 풍경 ─────

describe('풍경: 줄 돌담, 가운데 턱, 음자리표 조각상(걷는 중에도 남는다)', () => {
  it('세 설치물은 한 밭을 나눠 쓴다: 같은 열한 개의 돌담과 세 조각상을 모두 돌려준다', () => {
    const t = direct();
    const out = t.draw();
    expect([...out.keys()]).toEqual([N1_ID, N2_ID, N3_ID]);
    // 높은음자리표 다섯 줄(E4 G4 B4 D5 F5), 낮은음자리표 다섯 줄(G2 B2 D3 F3 A3), 두 보표 사이의 가운데 턱(C4)
    const steps = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];
    const ys = [1480, 1384, 1288, 1192, 1096, 1000, 904, 808, 712, 616, 520];
    for (const d of out.values()) {
      expect(d.walls.map((w) => w.step)).toEqual(steps);
      expect(d.walls.map((w) => w.y)).toEqual(ys);
      expect(d.walls.map((w) => w.kind)).toEqual(steps.map((s) => (s === 0 ? 'middle' : 'line')));
      expect(d.plaques).toEqual(['높은음자리표', '낮은음자리표', '가운데 도']);
    }
    // 그린 높이는 도메인이 정한 목록과 같다
    expect(out.get(N1_ID)!.walls.map((w) => ({ step: w.step, kind: w.kind }))).toEqual(terraceFieldWalls(['treble', 'bass']));
    expect(out.get(N1_ID)!.walls.map((w) => w.y)).toEqual(steps.map((s) => terraceYOfStep(terraceMapOf(N1)!, s)));
  });

  it('돌담은 첫 열 왼쪽 12 px부터 마지막 열 오른쪽 12 px까지 둥근 돌 띠로 그리고 이음을 긋는다. 가운데 턱은 더 굵고 금빛 갓돌을 얹는다', () => {
    const t = direct();
    t.draw();
    // 줄: 열들 4352~5428을 12 px씩 넓힌 4340~5440, 두께 8
    for (const y of [1480, 1384, 1288, 1192, 1096, 904, 808, 712, 616, 520]) {
      expect(has(t.g, 'fillRoundedRect', [4340, y - 4, 1100, 8, 4]), `줄 ${y}`).toBe(true);
      expect(has(t.g, 'strokeRoundedRect', [4340, y - 4, 1100, 8, 4]), `줄 ${y} 테두리`).toBe(true);
      expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [4340, y - 4, 1100, 8, 4])).toEqual([ROCK, 0.95]);
      // 돌 사이의 이음: 34 px 간격으로 32개
      expect(t.g.calls('lineBetween').filter((a) => a[1] === y - 2.5 && a[3] === y + 2.5), `줄 ${y} 이음`).toHaveLength(32);
    }
    // 가운데 턱: 두께 11, 금빛 갓돌
    expect(has(t.g, 'fillRoundedRect', [4340, 1000 - 5.5, 1100, 11, 5.5])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [4346, 1000 - 5.5 - 3, 1088, 3.5, 1.75])).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [4346, 1000 - 5.5 - 3, 1088, 3.5, 1.75])).toEqual([GOLD, 1]);
    // 줄 돌담 열 개와 가운데 턱 하나 말고는 이 폭의 돌담이 없다
    expect(t.g.calls('fillRoundedRect').filter((a) => a[2] === 1100)).toHaveLength(11);
  });

  it('조각상: 음자리표마다 그 보표의 가운데 줄 높이에, 가운데 턱 높이(C4)에 하나 더, 왼쪽 띠 안(첫 열 왼쪽 32 px)에 선다', () => {
    const t = direct();
    t.draw();
    // 높은음자리표의 가운데 줄은 B4(712), 낮은음자리표는 D3(1288), 가운데 턱은 가온 도(1000)
    expect(has(t.g, 'fillRoundedRect', [4320 - 28, 712 - 25, 56, 50, 10])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [4320 - 28, 1288 - 25, 56, 50, 10])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [4320 - 29, 1000 - 13, 58, 26, 10])).toBe(true);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [4320 - 28, 712 - 25, 56, 50, 10])).toEqual([2.5, TEAL, 0.85]);
    // 글자는 설치물 모드가 아니어도 보인다
    expect(t.scene.visibleTexts().map((x) => [x.content, x.x, x.y])).toEqual([
      ['높은음', 4320, 702],
      ['자리표', 4320, 722],
      ['낮은음', 4320, 1278],
      ['자리표', 4320, 1298],
      ['가운데 도', 4320, 1000],
    ]);
  });

  it('음자리표가 하나뿐인 밭은 가운데 턱과 그 조각상을 두지 않는다', () => {
    const treble = direct([N1]);
    const out = treble.draw().get(N1_ID)!;
    expect(out.walls.map((w) => w.step)).toEqual([2, 4, 6, 8, 10]);
    expect(out.walls.every((w) => w.kind === 'line')).toBe(true);
    expect(out.plaques).toEqual(['높은음자리표']);
    expect(treble.g.calls('fillRoundedRect').filter((a) => a[2] === 1100)).toHaveLength(5);
    expect(treble.scene.shown()).toEqual(['높은음', '자리표']);
    const bass = direct([N2]).draw().get(N2_ID)!;
    expect(bass.walls.map((w) => w.step)).toEqual([-10, -8, -6, -4, -2]);
    expect(bass.plaques).toEqual(['낮은음자리표']);
  });

  it('걷는 중에는 풍경뿐이다: 열 이름표, 빗금, 고른 자리가 없고 등이 없으면 글자도 조각상 말고는 없다', () => {
    const t = direct();
    const out = t.draw([forInst(N1, viewOf([markOf(N1, 1, null), markOf(N1, 2, null)], { cursor: 0, cursorStep: 6 }))], null);
    for (const d of out.values()) {
      expect(d.headers).toBe(0);
      expect(d.hatched).toEqual([]);
      expect(d.cursor).toBeNull();
      expect(d.lamps).toEqual([]);
      expect(d.flashing).toEqual([]);
    }
    expect(t.scene.shown()).toEqual(['높은음', '자리표', '낮은음', '자리표', '가운데 도']);
    expect(t.g.calls('fillRect')).toEqual([]);
  });
});

// ───── 등 ─────

describe('등(걷는 중에도 풍경으로 남는다)', () => {
  it('높이가 곧 놓인 자리다: 셋째 열 G4(둘째 줄, 808)에 지붕, 불빛 창이 난 몸통, 받침이 선다. 이름을 쓰지 않으면 등 안에 금빛 불꽃 점이 있다', () => {
    const t = direct();
    const cx = 4680;
    const y = 808;
    const out = t.draw([forInst(N1, viewOf([markOf(N1, 3, 4)]))], null).get(N1_ID)!;
    expect(out.lamps).toEqual([{ column: 3, draft: 2, step: 4, x: cx, y, label: null, accidental: null, flagged: false, playing: false, selected: false }]);
    expect(has(t.g, 'fillTriangle', [cx - 18, y - 17, cx + 18, y - 17, cx, y - 29])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [cx - 22, y - 17, 44, 34, 9])).toBe(true);
    expect(has(t.g, 'strokeRoundedRect', [cx - 22, y - 17, 44, 34, 9])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [cx - 14, y + 17, 28, 6, 3])).toBe(true);
    expect(has(t.g, 'fillCircle', [cx, y, 9])).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [cx, y, 9])).toEqual([GOLD, 0.55]);
    // 보표 안의 등에는 덧줄 돌담이 없다
    expect(out.ledgers).toEqual([]);
  });

  it('문제를 푸는 중에는 등 안에 이름을 쓰지 않는다(높이를 찾는 일이 문제이므로): 이름은 설치물 모드의 열 이름표에만 있고 걷는 중에는 어디에도 없다', () => {
    const t = direct();
    const cx = colX(N1, 3);
    const view = forInst(N1, viewOf([markOf(N1, 3, 4, { name: null, label: 'G4' })]));
    t.draw([view], N1_ID);
    expect(t.textAt('G4', cx, 304 - 22)).toBeDefined();
    expect(t.textAt('G4', cx, yOf(4) + 1)).toBeUndefined();
    t.draw([view], null);
    expect(t.scene.shown()).not.toContain('G4');
  });

  it('자유로 놀 때는 등 안에 이름을 쓰고(불꽃 점은 없다) 이름이 길면 몸통에 맞게 줄인다', () => {
    const t = direct();
    const cx = colX(N1, 2);
    const out = t.draw([forInst(N1, viewOf([markOf(N1, 2, 4, { name: 'G4' }), markOf(N1, 3, 8, { name: 'D♯5', accidental: 'sharp' })], { free: true }))], null).get(N1_ID)!;
    expect(out.lamps.map((l) => [l.column, l.label])).toEqual([
      [2, 'G4'],
      [3, 'D♯5'],
    ]);
    const short = t.textAt('G4', cx, yOf(4) + 1)!;
    expect(short.scaleValue).toBe(1);
    // 'D♯5'는 세 글자라 42 px로 잰다: 몸통 폭 44 − 4 = 40에 맞게 줄인다
    const long = t.textAt('D♯5', colX(N1, 3), yOf(8) + 1)!;
    expect(long.scaleValue).toBeCloseTo(40 / 42, 6);
    expect(t.g.calls('fillCircle').filter((a) => a[2] === 9)).toEqual([]);
    // 이름이 변화표를 담고 있으므로 꼬리표는 따로 달지 않는다
    expect(t.scene.shown()).not.toContain('♯');
  });

  it('문제를 푸는 중의 변화표는 등 왼쪽 꼬리표(♯ ♭ 글자)로 단다. 변화표가 없으면 꼬리표가 없다', () => {
    const t = direct();
    const marks = [markOf(N1, 1, 2, { accidental: 'sharp' }), markOf(N1, 2, 4, { accidental: 'flat' }), markOf(N1, 3, 6)];
    t.draw([forInst(N1, viewOf(marks))], null);
    expect(t.textAt('♯', colX(N1, 1) - 36, yOf(2) - 2)).toBeDefined();
    expect(t.textAt('♭', colX(N1, 2) - 36, yOf(4) - 2)).toBeDefined();
    expect(t.scene.shown().filter((s) => s === '♯' || s === '♭')).toHaveLength(2);
    // 다시 그리면 앞에서 보인 글자는 숨는다
    t.draw([forInst(N1, viewOf([markOf(N1, 3, 6)]))], null);
    expect(t.scene.shown().filter((s) => s === '♯' || s === '♭')).toHaveLength(0);
  });

  it('보표 밖의 등은 짧은 덧줄 돌담 위에 선다: 아래쪽은 가온 도(C4)까지, 위쪽은 보표 위 첫 줄(A5)부터, 보표 바로 옆 칸은 덧줄이 없다', () => {
    const t = direct([N1, N3]);
    // 높은음자리표(맨 아랫줄 E4 = 2): 아래쪽은 A3이 C4와 A3, B3과 C4가 C4 하나, 보표 바로 아래 칸(D4)은 없다. 위쪽은 보표 바로 위 칸(G5, 11)까지 없고 A5(12)부터 생긴다
    const cases: Array<[number, number[]]> = [
      [-2, [0, -2]],
      [-1, [0]],
      [0, [0]],
      [1, []],
      [2, []],
      [10, []],
      [11, []],
      [12, [12]],
      [13, [12]],
      [14, [12, 14]],
    ];
    for (const [step, ledgers] of cases) {
      const out = t.draw([forInst(N1, viewOf([markOf(N1, 4, step)]))], null).get(N1_ID)!;
      expect(out.ledgers, `높은음 ${step}`).toEqual(ledgers.map((s) => ({ column: 4, step: s, y: yOf(s) })));
    }
    // 낮은음자리표(맨 아랫줄 G2 = −10)
    const low: Array<[number, number[]]> = [
      [-14, [-12, -14]],
      [-13, [-12]],
      [-12, [-12]],
      [-11, []],
      [0, [0]],
      [1, [0]],
      [2, [0, 2]],
    ];
    for (const [step, ledgers] of low) {
      const out = t.draw([forInst(N3, viewOf([markOf(N3, 2, step)]))], null).get(N3_ID)!;
      expect(out.ledgers, `낮은음 ${step}`).toEqual(ledgers.map((s) => ({ column: 2, step: s, y: yOf(s) })));
    }
  });

  it('덧줄 돌담은 등 가운데에서 양쪽으로 46 px(열 너비 96 안), 두께 7로 그린다', () => {
    const t = direct();
    t.draw([forInst(N1, viewOf([markOf(N1, 4, -2)]))], null);
    const cx = colX(N1, 4);
    for (const s of [0, -2]) {
      expect(has(t.g, 'fillRoundedRect', [cx - 46, yOf(s) - 3.5, 92, 7, 3.5]), `덧줄 ${s}`).toBe(true);
      expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [cx - 46, yOf(s) - 3.5, 92, 7, 3.5])).toBeDefined();
    }
    expect(rectOf(N1, 4).w).toBe(96);
  });

  it('가운데 턱(7-1 완료 조건): 높은음자리표와 낮은음자리표의 가온 도(C4)는 같은 세로 자리(1000)에 서고 가운데 턱 돌담과도 같은 자리다', () => {
    const t = direct();
    const out = t.draw([forInst(N3, viewOf([markOf(N3, 1, 0), markOf(N3, 2, 0)]))], null).get(N3_ID)!;
    expect(out.lamps.map((l) => [l.column, l.y])).toEqual([
      [1, 1000],
      [2, 1000],
    ]);
    // 두 등 모두 덧줄이 하나이고 그 덧줄이 가운데 턱의 자리다
    expect(out.ledgers).toEqual([
      { column: 1, step: 0, y: 1000 },
      { column: 2, step: 0, y: 1000 },
    ]);
    expect(out.walls.find((w) => w.kind === 'middle')).toEqual({ step: 0, y: 1000, kind: 'middle' });
    expect(out.lamps[0]!.x).not.toBe(out.lamps[1]!.x);
  });

  it('판정이 가리킨 등: 오른쪽 위에 산호색 배지와 흰 둘레, 글자 !', () => {
    const t = direct();
    const cx = colX(N1, 3);
    const y = yOf(4);
    const out = t.draw([forInst(N1, viewOf([markOf(N1, 3, 4, { flagged: true })]))], null).get(N1_ID)!;
    expect(out.lamps[0]!.flagged).toBe(true);
    expect(has(t.g, 'fillCircle', [cx + 24, y - 21, 11])).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [cx + 24, y - 21, 11])).toEqual([CORAL, 1]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeCircle', [cx + 24, y - 21, 11])).toEqual([2.5, WHITE, 1]);
    const bang = t.textAt('!', cx + 24, y - 20)!;
    expect(bang.visible).toBe(true);
    // 표식이 없는 등에는 !가 없다
    t.draw([forInst(N1, viewOf([markOf(N1, 3, 4)]))], null);
    expect(t.scene.shown()).not.toContain('!');
  });

  it('듣는 등: 금빛 바탕과 굵은 금빛 테두리, 오른쪽 위의 ♪ 글자', () => {
    const t = direct();
    const cx = colX(N1, 3);
    const y = yOf(4);
    const out = t.draw([forInst(N1, viewOf([markOf(N1, 3, 4, { playing: true })]))], null).get(N1_ID)!;
    expect(out.lamps[0]!.playing).toBe(true);
    const frame = [cx - 33, y - 33, 66, 60, 16];
    expect(has(t.g, 'fillRoundedRect', frame)).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', frame)).toEqual([GOLD, 0.38]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', frame)).toEqual([5, GOLD, 1]);
    expect(t.textAt('♪', cx + 32, y - 31)).toBeDefined();
    t.draw([forInst(N1, viewOf([markOf(N1, 3, 4)]))], null);
    expect(t.scene.shown()).not.toContain('♪');
  });

  it('걷는 중에는 세 설치물의 등을 모두 그리고, 설치물 모드에서는 그 설치물의 등만 그린다', () => {
    const t = direct();
    const views = [forInst(N1, viewOf([markOf(N1, 1, 4)])), forInst(N2, viewOf([markOf(N2, 2, -6)])), forInst(N3, viewOf([markOf(N3, 3, 0)]))];
    const walking = t.draw(views, null);
    expect(walking.get(N1_ID)!.lamps.map((l) => [l.column, l.y])).toEqual([[1, 808]]);
    expect(walking.get(N2_ID)!.lamps.map((l) => [l.column, l.y])).toEqual([[2, 1288]]);
    expect(walking.get(N3_ID)!.lamps.map((l) => [l.column, l.y])).toEqual([[3, 1000]]);
    expect(t.g.calls('fillTriangle')).toHaveLength(3);
    const inside = t.draw(views, N2_ID);
    expect(inside.get(N1_ID)!.lamps).toEqual([]);
    expect(inside.get(N2_ID)!.lamps.map((l) => [l.column, l.y])).toEqual([[2, 1288]]);
    expect(inside.get(N3_ID)!.lamps).toEqual([]);
    expect(t.g.calls('fillTriangle')).toHaveLength(1);
  });

  it('고른 열의 등은 설치물 모드에서만 굵은 테두리가 선다(걷는 중에는 고른 열이 풍경이 아니다)', () => {
    const t = direct();
    const cx = colX(N1, 2);
    const y = yOf(4);
    const view = forInst(N1, viewOf([markOf(N1, 1, 2), markOf(N1, 2, 4)], { cursor: 1, cursorStep: 4 }));
    const frame = [cx - 30, y - 32, 60, 58, 14];
    const inside = t.draw([view], N1_ID).get(N1_ID)!;
    expect(inside.lamps.map((l) => l.selected)).toEqual([false, true]);
    expect(has(t.g, 'strokeRoundedRect', frame)).toBe(true);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', frame)).toEqual([7, TEAL, 1]);
    const walking = t.draw([view], null).get(N1_ID)!;
    expect(walking.lamps.map((l) => l.selected)).toEqual([false, false]);
    expect(has(t.g, 'strokeRoundedRect', frame)).toBe(false);
  });

  it('밟은 열은 금빛 바탕이 잠깐 비친다: 걷는 중에도 설치물 모드에서도, 이 열이 쓰는 높이 안에 그린다', () => {
    const t = direct();
    const flash = (id: string, slot: number): number => (id === N1_ID && slot === 2 ? 0.5 : 0);
    // 등이 없는 열은 열 전체(304~1120)를 비춘다
    const bare = t.draw([], null, flash);
    expect(bare.get(N1_ID)!.flashing).toEqual([2]);
    expect(bare.get(N2_ID)!.flashing).toEqual([]);
    const r = rectOf(N1, 2);
    expect(has(t.g, 'fillRoundedRect', [r.x + 1, 304, r.w - 2, 816, 14])).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [r.x + 1, 304, r.w - 2, 816, 14])).toEqual([GOLD, 0.2]);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [r.x + 1, 304, r.w - 2, 816, 14])).toEqual([4, GOLD, 0.5]);
    // 설치물 모드에서도 같다. 이 열이 쓰는 높이(N3의 낮은음자리표 열은 E4 위쪽 880부터)만 비춘다
    const inN3 = t.draw([forInst(N3, viewOf([markOf(N3, 1, null), markOf(N3, 2, null)]))], N3_ID, (id, slot) => (id === N3_ID && slot === 2 ? 1 : 0));
    expect(inN3.get(N3_ID)!.flashing).toEqual([2]);
    const r2 = rectOf(N3, 2);
    expect(has(t.g, 'fillRoundedRect', [r2.x + 1, 880, r2.w - 2, 816, 14])).toBe(true);
  });
});

// ───── 설치물 모드 ─────

describe('설치물 모드: 쓰지 않는 구간(빗금), 높이 눈금, 고른 열과 높이', () => {
  /** N1에서 다섯 열(1~5)만 쓰는 판본 */
  const five = (extra: Partial<TerraceView> = {}) => viewOf([1, 2, 3, 4, 5].map((c) => markOf(N1, c, null)), extra);

  it('이 판본이 쓰지 않는 열은 열 전체를 빗금으로 덮고, 쓰는 열은 쓸 수 있는 높이의 옅은 바탕과 한 칸마다 높이 눈금을 둔다', () => {
    const t = direct();
    const out = t.draw([forInst(N1, five())], N1_ID).get(N1_ID)!;
    expect(out.hatched).toEqual([6, 7, 8]);
    expect(out.headers).toBe(5);
    for (const c of [6, 7, 8]) {
      const r = rectOf(N1, c);
      expect(has(t.g, 'fillRoundedRect', [r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10]), `열 ${c} 바탕`).toBe(true);
      expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10])).toEqual([INK, 0.08]);
      for (const seg of hatchSegments(r.x + 9, r.y + 9, r.w - 18, r.h - 18, 12)) expect(has(t.g, 'lineBetween', seg), `열 ${c} 사선`).toBe(true);
    }
    // 쓰는 열: 높이 −2~14 전체(304~1120)의 바탕과 17개의 눈금
    const r = rectOf(N1, 1);
    expect(has(t.g, 'fillRoundedRect', [r.x + 3, 304, r.w - 6, 816, 12])).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillRoundedRect', [r.x + 3, 304, r.w - 6, 816, 12])).toEqual([WHITE, 0.3]);
    const ticks = t.g.calls('lineBetween').filter((a) => a[0] === r.x + 22 && a[2] === r.x + r.w - 22);
    expect(ticks.map((a) => a[1])).toEqual(Array.from({ length: 17 }, (_, i) => yOf(-2 + i)));
    // 한 열 안에서 쓸 수 있는 높이가 보표 전체를 덮으면 빗금으로 가리는 곳이 없다
    expect(out.hatched).not.toContain(1);
  });

  it('두 음자리표 밭(N3)의 열은 그 음자리표가 쓰는 높이만 바탕이 되고 나머지는 빗금이다: 높은음 열은 아래쪽을, 낮은음 열은 위쪽을 가린다', () => {
    const t = direct();
    const out = t.draw([forInst(N3, viewOf([markOf(N3, 1, null), markOf(N3, 2, null)]))], N3_ID).get(N3_ID)!;
    expect(out.hatched).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const treble = rectOf(N3, 1);
    // 높은음 열: 바탕은 304~1120, 1120~1696이 빗금
    expect(has(t.g, 'fillRoundedRect', [treble.x + 3, 304, treble.w - 6, 816, 12])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [treble.x + 3, 1120 + 3, treble.w - 6, 576 - 6, 10])).toBe(true);
    const bass = rectOf(N3, 2);
    // 낮은음 열: 바탕은 880~1696, 304~880이 빗금
    expect(has(t.g, 'fillRoundedRect', [bass.x + 3, 880, bass.w - 6, 816, 12])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [bass.x + 3, 304 + 3, bass.w - 6, 576 - 6, 10])).toBe(true);
    for (const seg of hatchSegments(bass.x + 9, 304 + 9, bass.w - 18, 576 - 18, 12)) expect(has(t.g, 'lineBetween', seg)).toBe(true);
  });

  it('고른 열에 등이 없으면 놓을 자리를 점선 고리로 보이고, 고른 높이는 가로 띠로 보인다', () => {
    const t = direct();
    const r = rectOf(N1, 3);
    const cx = colX(N1, 3);
    const out = t.draw([forInst(N1, five({ cursor: 2, cursorStep: 4 }))], N1_ID).get(N1_ID)!;
    expect(out.cursor).toEqual({ column: 3, step: 4, y: 808, placed: false });
    // 점선 고리: 반지름 27, 열네 조각 가운데 한 조각 걸러 일곱 개
    const ring = dashRingSegments(cx, 808, 27, 14);
    expect(ring).toHaveLength(7);
    for (const seg of ring) expect(has(t.g, 'lineBetween', seg), '점선').toBe(true);
    expect(styleBefore(t.g, 'lineStyle', 'lineBetween', ring[0]!)).toEqual([4, TEAL, 1]);
    // 고른 높이의 가로 띠(온음계 한 칸 48 px)와 고른 열의 바탕
    expect(has(t.g, 'fillRect', [r.x + 3, 808 - 24, r.w - 6, 48])).toBe(true);
    expect(has(t.g, 'fillRoundedRect', [r.x + 1, 302, r.w - 2, 820, 14])).toBe(true);
    expect(styleBefore(t.g, 'lineStyle', 'strokeRoundedRect', [r.x + 1, 302, r.w - 2, 820, 14])).toEqual([2.5, TEAL, 0.6]);
  });

  it('고른 열에 등이 있으면 점선 고리 대신 등의 굵은 테두리가 고른 자리를 가리킨다', () => {
    const t = direct();
    const marks = [markOf(N1, 1, null), markOf(N1, 2, 4), markOf(N1, 3, null)];
    const out = t.draw([forInst(N1, viewOf(marks, { cursor: 1, cursorStep: 4 }))], N1_ID).get(N1_ID)!;
    expect(out.cursor).toEqual({ column: 2, step: 4, y: 808, placed: true });
    for (const seg of dashRingSegments(colX(N1, 2), 808, 27, 14)) expect(has(t.g, 'lineBetween', seg)).toBe(false);
  });

  it('고른 열이 없으면 고른 자리가 없다(높이만 있어도 열을 모르면 그리지 않는다)', () => {
    const t = direct();
    expect(t.draw([forInst(N1, five())], N1_ID).get(N1_ID)!.cursor).toBeNull();
    expect(t.draw([forInst(N1, five({ cursor: null, cursorStep: 4 }))], N1_ID).get(N1_ID)!.cursor).toBeNull();
    expect(t.g.calls('fillRect')).toEqual([]);
    // 열은 골랐으나 높이를 모르는 경우도 같다
    expect(t.draw([forInst(N1, five({ cursor: 1, cursorStep: null }))], N1_ID).get(N1_ID)!.cursor).toBeNull();
  });

  it('설치물 모드인데 다리에 그 설치물의 모습이 없으면 풍경만 그린다', () => {
    const t = direct();
    const out = t.draw([forInst(N1)], N1_ID).get(N1_ID)!;
    expect(out.headers).toBe(0);
    expect(out.hatched).toEqual([]);
    expect(out.lamps).toEqual([]);
    expect(out.cursor).toBeNull();
    expect(out.walls).toHaveLength(11);
  });

  it('열 이름표(첫 줄 위 띠): 열 번호 원, 이름, 두 음자리표 밭에서는 음자리표 꼬리. 고른 열은 번호 원을 채우고 글자를 흰색으로 한다', () => {
    const t = direct();
    const marks = [markOf(N3, 1, null, { label: 'B3 · 높은음자리표' }), markOf(N3, 2, null, { label: 'D2 · 낮은음자리표' }), markOf(N3, 3, null, { label: 'B3 · 높은음자리표' })];
    const out = t.draw([forInst(N3, viewOf(marks, { cursor: 1, cursorStep: -12 }))], N3_ID).get(N3_ID)!;
    expect(out.headers).toBe(3);
    for (const c of [1, 2, 3]) {
      const cx = colX(N3, c);
      expect(t.textAt(String(c), cx, 304 - 42 + 1), `번호 ${c}`).toBeDefined();
      expect(t.textAt(marks[c - 1]!.label.split(' · ')[0]!, cx, 304 - 22), `이름 ${c}`).toBeDefined();
    }
    // 음자리표 꼬리는 이름표 아래쪽에 세 글자만 쓴다
    expect(t.textAt('높은음', colX(N3, 1), 304 - 8)).toBeDefined();
    expect(t.textAt('낮은음', colX(N3, 2), 304 - 8)).toBeDefined();
    // 번호 원: 고른 열(2)은 청록색으로 채운 큰 원, 나머지는 흰 원과 먹빛 테두리
    expect(has(t.g, 'fillCircle', [colX(N3, 2), 304 - 42, 13])).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', [colX(N3, 2), 304 - 42, 13])).toEqual([TEAL, 1]);
    expect(has(t.g, 'fillCircle', [colX(N3, 1), 304 - 42, 12])).toBe(true);
    expect(styleBefore(t.g, 'lineStyle', 'strokeCircle', [colX(N3, 1), 304 - 42, 12])).toEqual([2, INK, 0.85]);
    expect(t.textAt('2', colX(N3, 2), 304 - 42 + 1)!.color).toBe(WHITE_CSS);
    expect(t.textAt('1', colX(N3, 1), 304 - 42 + 1)!.color).toBe(INK_CSS);
  });

  it('음자리표가 하나뿐인 밭의 이름표에는 음자리표 꼬리가 없다. 고른 열이 바뀌면 번호 글자의 색도 따라 바뀐다', () => {
    const t = direct();
    t.draw([forInst(N1, five({ cursor: 0, cursorStep: 6 }))], N1_ID);
    expect(t.textAt('높은음', colX(N1, 1), 304 - 8)).toBeUndefined();
    expect(t.scene.visibleTexts().filter((x) => x.content === '높은음')).toHaveLength(1); // 조각상의 글자뿐이다
    expect(t.textAt('1', colX(N1, 1), 304 - 41)!.color).toBe(WHITE_CSS);
    t.draw([forInst(N1, five({ cursor: 1, cursorStep: 6 }))], N1_ID);
    expect(t.textAt('1', colX(N1, 1), 304 - 41)!.color).toBe(INK_CSS);
    expect(t.textAt('2', colX(N1, 2), 304 - 41)!.color).toBe(WHITE_CSS);
  });

  it('판정이 가리킨 열: 등이 있으면 등 옆에, 등이 없는 열은 이름표 옆에 배지를 단다(둘 다 !)', () => {
    const t = direct();
    const marks = [markOf(N1, 1, 4, { flagged: true }), markOf(N1, 2, null, { flagged: true }), markOf(N1, 3, null)];
    const out = t.draw([forInst(N1, viewOf(marks))], N1_ID).get(N1_ID)!;
    expect(out.lamps.map((l) => [l.column, l.flagged])).toEqual([[1, true]]);
    const lampBadge = [colX(N1, 1) + 24, yOf(4) - 21, 11];
    const headBadge = [colX(N1, 2) + 38, 304 - 42, 11];
    expect(has(t.g, 'fillCircle', lampBadge)).toBe(true);
    expect(has(t.g, 'fillCircle', headBadge)).toBe(true);
    expect(styleBefore(t.g, 'fillStyle', 'fillCircle', headBadge)).toEqual([CORAL, 1]);
    expect(t.scene.visibleTexts().filter((x) => x.content === '!')).toHaveLength(2);
    // 등이 있는 열의 이름표에는 배지를 달지 않는다(등이 알린다)
    expect(has(t.g, 'fillCircle', [colX(N1, 1) + 38, 304 - 42, 11])).toBe(false);
  });

  it('그리는 차례: 바탕 → 밟은 열 → 돌담과 조각상 → 덧줄 돌담과 등 → 고른 자리와 이름표(앞의 것이 뒤의 것에 가려진다)', () => {
    const t = direct();
    const marks = [markOf(N1, 1, null), markOf(N1, 2, -2)];
    t.draw([forInst(N1, viewOf(marks, { cursor: 0, cursorStep: 4 }))], N1_ID, (id, slot) => (id === N1_ID && slot === 2 ? 1 : 0));
    const r2 = rectOf(N1, 2);
    const order = [
      indexOf(t.g, 'fillRoundedRect', [r2.x + 3, 304, r2.w - 6, 816, 12]), // 쓸 수 있는 높이의 바탕
      indexOf(t.g, 'fillRoundedRect', [r2.x + 1, 304, r2.w - 2, 816, 14]), // 밟은 열
      indexOf(t.g, 'fillRoundedRect', [4340, 904 - 4, 1100, 8, 4]), // 줄 돌담
      indexOf(t.g, 'fillRoundedRect', [colX(N1, 2) - 46, yOf(-2) - 3.5, 92, 7, 3.5]), // 덧줄 돌담
      indexOf(t.g, 'fillTriangle', [colX(N1, 2) - 18, yOf(-2) - 17, colX(N1, 2) + 18, yOf(-2) - 17, colX(N1, 2), yOf(-2) - 29]), // 등
      indexOf(t.g, 'lineBetween', dashRingSegments(colX(N1, 1), 808, 27, 14)[0]!), // 놓을 자리
      indexOf(t.g, 'fillCircle', [colX(N1, 1), 304 - 42, 13]), // 이름표 번호 원
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('다시 그릴 때 앞에서 보인 글자는 모두 숨고 새 모습의 글자만 보인다', () => {
    const t = direct();
    t.draw([forInst(N1, five({ cursor: 0, cursorStep: 6 }))], N1_ID);
    expect(t.scene.visibleTexts()).toHaveLength(5 + 10); // 조각상 글자 다섯 + 열 번호와 이름 다섯 쌍
    t.draw([], null);
    expect(t.scene.shown()).toEqual(['높은음', '자리표', '낮은음', '자리표', '가운데 도']);
  });
});

describe('작은 계산', () => {
  it('headerParts: 이름은 가운데 점 앞까지, 음자리표 꼬리는 음자리표 이름의 앞 세 글자(음자리표가 둘일 때만)', () => {
    expect(headerParts('B3 · 높은음자리표', 'treble', true)).toEqual({ name: 'B3', tag: '높은음' });
    expect(headerParts('D2 · 낮은음자리표', 'bass', true)).toEqual({ name: 'D2', tag: '낮은음' });
    expect(headerParts('E4', 'treble', false)).toEqual({ name: 'E4', tag: null });
    expect(headerParts('E4', 'bass', true)).toEqual({ name: 'E4', tag: '낮은음' });
    expect(headerParts('B3 · 높은음자리표', 'treble', false)).toEqual({ name: 'B3', tag: null });
  });

  it('dashRingSegments: 반지름 위의 호를 n조각으로 나눠 한 조각 걸러 일곱 개를 긋는다(n이 14일 때)', () => {
    const ring = dashRingSegments(100, 200, 27, 14);
    expect(ring).toHaveLength(7);
    for (const [x0, y0, x1, y1] of ring) {
      expect(Math.hypot(x0 - 100, y0 - 200)).toBeCloseTo(27, 9);
      expect(Math.hypot(x1 - 100, y1 - 200)).toBeCloseTo(27, 9);
    }
    // 첫 조각은 오른쪽 끝(각도 0)에서 시작하고 조각은 서로 겹치지 않는다
    expect(ring[0]![0]).toBeCloseTo(127, 9);
    expect(ring[0]![1]).toBeCloseTo(200, 9);
    const starts = ring.map(([x0, y0]) => Math.atan2(y0 - 200, x0 - 100));
    expect(new Set(starts.map((a) => a.toFixed(6))).size).toBe(7);
    expect(dashRingSegments(0, 0, 10, 2)).toHaveLength(1);
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
  const r = rig({ definitions: [Q01, Q09, Q10, Q11, Q12].map(quest) });
  const bridge = new WorldBridge({ x: 4200, y: 1000, facing: 'down' });
  const defs = [N1, N2, N3];
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
    panels: new Set(['panel.clef']),
    frames,
  });
  const scene = new FakeScene();
  const layer = new InstallationLayer(scene as never, [...defs, STONES], bridge, fakeCull());
  const press = (inst: InstallationDef, column: number, step?: number): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot: column, ...(step === undefined ? {} : { step }) });
  const drawn = (id: string, now = 0, reduce = false) => {
    layer.update(now, reduce);
    return layer.debug().find((d) => d.installationId === id)!;
  };
  return { ...r, bridge, ic, scene, layer, frames, press, drawn };
}

describe('설치물 층의 계단밭 길', () => {
  it('계단밭은 terrace를 돌려주고 돌 설치물에는 terrace가 없다. 계단밭에는 칸마다의 글자를 따로 만들지 않는다', () => {
    const t = pipeline();
    t.layer.update(0, false);
    const all = t.layer.debug();
    expect(all.map((d) => d.installationId)).toEqual([N1_ID, N2_ID, N3_ID, STONES.installationId]);
    expect(all.slice(0, 3).every((d) => d.terrace !== undefined && d.timeline === undefined && d.bell === undefined)).toBe(true);
    expect(all[3]!.terrace).toBeUndefined();
    expect(all.map((d) => d.slots.length)).toEqual([8, 8, 8, STONES.slots.length]);
    expect(all[0]!.slots.every((s) => !s.numbered && s.label === null && !s.selected)).toBe(true);
    // 글자: 세 설치물의 묶음(56 × 3)과 조각상(5) + 돌 설치물의 칸별 글자(칸마다 넷)
    expect(t.scene.texts).toHaveLength(168 + 5 + STONES.slots.length * 4);
  });

  it('들어가기 전에도 돌담과 조각상은 풍경으로 보이고, 자유로 놀기 틀의 열 여덟 개가 있어도 등이 없으니 그릴 것이 없다', () => {
    const t = pipeline();
    const d = t.drawn(N1_ID);
    expect(d.active).toBe(false);
    expect(d.terrace!.walls).toHaveLength(11);
    expect(d.terrace!.plaques).toEqual(['높은음자리표', '낮은음자리표', '가운데 도']);
    expect(d.terrace!.lamps).toEqual([]);
    expect(d.terrace!.headers).toBe(0);
    expect(d.terrace!.hatched).toEqual([]);
    expect(d.terrace!.cursor).toBeNull();
    expect(t.scene.shown()).toEqual(['높은음', '자리표', '낮은음', '자리표', '가운데 도']);
  });

  it('높은음 밭에서 줄 음 과제를 열면 이름표 다섯 개와 쓰지 않는 열 셋(빗금)이 보이고, 이름표에 열이 가리키는 음 이름이 쓰인다', () => {
    const t = pipeline();
    expect(t.ic.enter('N1')).toBe(true);
    expect(t.ic.select(`${Q09}/treble-lines`)).toBe(true);
    const d = t.drawn(N1_ID);
    expect(d.active).toBe(true);
    expect(d.terrace!.headers).toBe(5);
    expect(d.terrace!.hatched).toEqual([6, 7, 8]);
    expect(d.terrace!.lamps).toEqual([]);
    for (const [i, name] of ['E4', 'G4', 'B4', 'D5', 'F5'].entries()) expect(t.scene.visibleTexts().some((x) => x.content === name && x.x === colX(N1, i + 1) && x.y === 304 - 22), name).toBe(true);
    // 다른 밭은 풍경만 보인다
    expect(t.drawn(N2_ID).terrace!.headers).toBe(0);
    expect(t.drawn(N3_ID).terrace!.hatched).toEqual([]);
  });

  it('높이를 눌러 놓으면 그 높이에 등이 서고 고른 자리가 된다. 문제를 푸는 중에는 이름이 없고, 보표 밖으로 옮기면 덧줄 돌담이 선다', () => {
    const t = pipeline();
    t.ic.enter('N1');
    t.ic.select(`${Q09}/treble-lines`);
    t.press(N1, 2, 4);
    let d = t.drawn(N1_ID);
    expect(d.terrace!.lamps).toEqual([{ column: 2, draft: 1, step: 4, x: colX(N1, 2), y: 808, label: null, accidental: null, flagged: false, playing: false, selected: true }]);
    expect(d.terrace!.cursor).toEqual({ column: 2, step: 4, y: 808, placed: true });
    expect(d.slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([2]);
    expect(d.slots.every((s) => s.label === null)).toBe(true);
    t.press(N1, 2, 9); // 같은 열의 다른 높이를 누르면 등이 옮겨 간다
    d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.map((l) => l.y)).toEqual([yOf(9)]);
    expect(d.terrace!.ledgers).toEqual([]);
    t.press(N1, 2, -2);
    d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.map((l) => l.y)).toEqual([yOf(-2)]);
    expect(d.terrace!.ledgers).toEqual([
      { column: 2, step: 0, y: 1000 },
      { column: 2, step: -2, y: 1096 },
    ]);
    // 열만 누르면(높이 없음) 그 열을 고를 뿐 등을 놓지 않는다
    t.press(N1, 4);
    d = t.drawn(N1_ID);
    expect(d.terrace!.cursor).toMatchObject({ column: 4, placed: false });
    expect(d.terrace!.lamps).toHaveLength(1);
  });

  it('나오면 놓은 등이 풍경으로 남고(이름표, 빗금, 고른 자리는 사라진다) 세 설치물의 등이 함께 보인다', () => {
    const t = pipeline();
    t.ic.enter('N1');
    t.ic.select(`${Q09}/treble-lines`);
    t.press(N1, 2, 4);
    t.ic.exit();
    t.ic.enter('N2');
    t.ic.select(`${Q09}/bass-lines`);
    t.press(N2, 1, -6);
    t.ic.exit();
    const n1 = t.drawn(N1_ID);
    const n2 = t.drawn(N2_ID);
    expect(n1.active).toBe(false);
    expect(n1.terrace!.lamps.map((l) => [l.column, l.y, l.selected])).toEqual([[2, 808, false]]);
    expect(n2.terrace!.lamps.map((l) => [l.column, l.y, l.selected])).toEqual([[1, 1288, false]]);
    for (const d of [n1, n2]) {
      expect(d.terrace!.headers).toBe(0);
      expect(d.terrace!.hatched).toEqual([]);
      expect(d.terrace!.cursor).toBeNull();
    }
    expect(t.scene.shown()).toEqual(['높은음', '자리표', '낮은음', '자리표', '가운데 도']);
  });

  it('가운데 턱의 두 음자리표 열에 가온 도를 놓으면 두 등이 같은 세로 자리(가운데 턱)에 선다(7-1 완료 조건)', () => {
    const t = pipeline();
    t.ic.enter('N3');
    expect(t.ic.select(`${Q01}/middle-c`)).toBe(true);
    const d0 = t.drawn(N3_ID);
    expect(d0.terrace!.headers).toBe(2);
    // 높은음자리표 열의 가온 도(1000)와 낮은음자리표 열의 가온 도(1000)
    t.press(N3, 1, 0);
    t.press(N3, 2, 0);
    const d = t.drawn(N3_ID);
    expect(d.terrace!.lamps.map((l) => [l.column, l.step, l.y])).toEqual([
      [1, 0, 1000],
      [2, 0, 1000],
    ]);
    expect(d.terrace!.ledgers.map((l) => [l.column, l.y])).toEqual([
      [1, 1000],
      [2, 1000],
    ]);
    expect(d.terrace!.walls.find((w) => w.kind === 'middle')!.y).toBe(1000);
  });

  it('자유로 놀면 등 안에 이름이 쓰이고 변화표를 단 이름도 그대로 보인다', () => {
    const t = pipeline();
    t.ic.enter('N1');
    const bench = t.ic.terrace!;
    bench.perform('cursor-right');
    bench.perform('step-up'); // 높은음자리표의 가운데 줄 B4
    let d = t.drawn(N1_ID);
    expect(d.terrace!.lamps).toMatchObject([{ column: 1, step: 6, label: 'B4', accidental: null }]);
    expect(t.scene.visibleTexts().some((x) => x.content === 'B4' && x.x === colX(N1, 1) && x.y === yOf(6) + 1)).toBe(true);
    bench.perform('accidental-up');
    d = t.drawn(N1_ID);
    expect(d.terrace!.lamps).toMatchObject([{ column: 1, step: 6, label: 'B♯4', accidental: 'sharp' }]);
    expect(t.scene.visibleTexts().some((x) => x.content === 'B♯4')).toBe(true);
  });

  it('확인하면 틀린 열의 등에 표식이 서고, 고치면 사라진다. 빠진 열은 이름표에 표식이 선다', () => {
    const t = pipeline();
    t.ic.enter('N1');
    t.ic.select(`${Q09}/treble-lines`);
    const bench = t.ic.terrace!;
    // E4 G4 B4 D5 F5 가운데 둘째 열을 A4(5)에 놓고, 다섯째 열은 비워 둔다
    for (const [column, step] of [[1, 2], [2, 5], [3, 6], [4, 8]] as const) t.press(N1, column, step);
    bench.perform('check');
    let d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.filter((l) => l.flagged).map((l) => l.column)).toEqual([2]);
    expect(d.slots.filter((s) => s.flagged).map((s) => s.slot).sort((a, b) => a - b)).toEqual([2, 5]);
    expect(t.scene.visibleTexts().filter((x) => x.content === '!')).toHaveLength(2); // 등 옆 하나, 비어 있는 다섯째 열 이름표 옆 하나
    t.press(N1, 2, 4);
    d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.every((l) => !l.flagged)).toBe(true);
    expect(t.scene.shown()).not.toContain('!');
  });

  it('듣는 동안 울리는 등이 금빛으로 보이고, 멈추면 돌아온다', () => {
    const t = pipeline();
    t.ic.enter('N1');
    t.ic.select(`${Q09}/treble-lines`);
    const bench = t.ic.terrace!;
    t.press(N1, 3, 6);
    t.press(N1, 1, 2);
    bench.perform('hear-mine');
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    let d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.filter((l) => l.playing).map((l) => l.column)).toEqual([1]);
    expect(t.scene.shown()).toContain('♪');
    t.run(0.75);
    t.frames.tick();
    d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.filter((l) => l.playing).map((l) => l.column)).toEqual([3]);
    bench.perform('stop');
    t.frames.tick();
    d = t.drawn(N1_ID);
    expect(d.terrace!.lamps.every((l) => !l.playing)).toBe(true);
    expect(t.scene.shown()).not.toContain('♪');
  });

  it('밟은 열은 반짝이다가 0.5초 뒤에 사라지고, 움직임 줄이기에서는 반짝이지 않는다', () => {
    const t = pipeline();
    t.layer.flash(N1_ID, 3, 10);
    expect(t.drawn(N1_ID, 10.1).terrace!.flashing).toEqual([3]);
    expect(t.drawn(N2_ID, 10.1).terrace!.flashing).toEqual([]);
    expect(t.drawn(N1_ID, 10 + STEP_FLASH_SECONDS / 2).terrace!.flashing).toEqual([3]);
    expect(t.drawn(N1_ID, 10 + STEP_FLASH_SECONDS + 0.01).terrace!.flashing).toEqual([]);
    expect(t.drawn(N1_ID, 10.1).terrace!.flashing).toEqual([]); // 한 번 지나가면 기억을 지운다
    t.layer.flash(N1_ID, 5, 20);
    expect(t.drawn(N1_ID, 20.1, true).terrace!.flashing).toEqual([]);
  });
});
