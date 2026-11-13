// 6-7c 종나무(T4, 설계서 4.6)를 월드에 그린다: 줄기와 가지, 고리, 걸린 종, 쓰지 않는 가지(빗금), 옥타브 이름표와 열 이름표, 고른 자리,
// 판정이 가리킨 종, 듣는 중인 종, 소리를 끈 종과 가장 낮은 종(종탑). 그리는 일만 맡는다. 무엇을 그릴지는 화면(설치물 컨트롤러)이 정해
// 다리(WorldBridge)에 올려 두고(InstallationView.bells), 여기서는 읽어서 옮겨 그린다. 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3).
// 색만으로 뜻을 전하지 않는다:
//   걸린 종 = 종 모양과 음이름 글자 / 쓰지 않는 가지 = 빗금과 옅은 옥타브 번호 /
//   고른 자리 = 굵은 테두리 + 채운 열 이름표와 옥타브 이름표 + 고른 열 전체의 옅은 바탕 /
//   판정이 가리킨 종 = 산호색 배지와 '!' 글자 / 듣는 종 = 금빛 테두리와 ♪ 글자 /
//   소리를 끈 종(종탑) = 점선 테두리와 ✕ 표시 / 가장 낮은 종(종탑) = 금빛 밑줄과 '낮음' 글자.
// 걷는 중에는 줄기와 가지와 걸린 종만 풍경으로 남고, 이름표와 빈 고리와 고른 자리는 설치물 모드에서만 보인다.
// 고리(칸)의 자리는 설치물의 slots가 정한다: 이 층은 고리 번호로 사각형을 찾아 그 안에 종을 그린다(코드가 좌표를 따로 계산하지 않는다).
import Phaser from 'phaser';
import { bellCellOf, bellDraftCount, bellDraftPosition, bellMapOf, bellSlotOf, bellTreeNameOf } from '../../domain/bells';
import type { BellMap, BellMark } from '../../domain/bells';
import { BELL_CELL_H, BELL_CELL_W } from '../../domain/installation';
import type { BellForm, InstallationDef, SlotRect } from '../../domain/installation';
import type { InstallationView } from '../../platform/bridge';
import { dashedRectSegments, hatchSegments } from './hatch';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, ROCK, ROCK_DARK, TEAL, TEAL_LIGHT, WHITE, WHITE_CSS, WOOD, WOOD_DARK } from './palette';

// 고리 칸(80 × 72) 안의 모양. 칸 위에서부터의 거리(px)
/** 가지(가로 막대)의 가운데 높이와 두께 */
const BRANCH_Y = 9;
const BRANCH_T = 7;
/** 고리(걸이)의 가운데 높이와 반지름 */
const HOOK_Y = 13;
const HOOK_R = 4.5;
/** 종: 둥근 몸통과 아랫단(입술), 추 */
const BODY_TOP = 17;
const BODY_W = 44;
const BODY_H = 24;
const LIP_TOP = 39;
const LIP_W = 54;
const LIP_H = 6;
const CLAPPER_Y = 49;
/** 가장 낮은 종의 밑줄과 이름표 */
const LOW_BAR_Y = 52;
const LOW_TAG_Y = 63;
/** 줄기(기둥)의 너비와, 줄기 가운데가 고리 격자의 왼쪽에서 떨어진 거리 */
const POST_W = 8;
const POST_GAP = 16;
/** 이름표 띠(domain/installation의 BELL_LABEL_LEFT 52, BELL_LABEL_TOP 44) 안의 자리 */
const OCTAVE_LABEL_DX = 34;
const COLUMN_LABEL_DY = 14;
const TREE_LABEL_DY = 36;
const LABEL_R = 12;
const COLUMN_R = 11;

/** 그려진 종 하나(점검용). x, y, w, h는 종이 걸린 고리 칸(월드 좌표) */
export interface DrawnBellMark {
  /** 고리 번호(1부터) */
  slot: number;
  tree: number;
  column: number;
  octave: number;
  /** 종에 쓴 음이름 */
  label: string;
  muted: boolean;
  lowest: boolean;
  flagged: boolean;
  playing: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 종나무 한 설치물의 그려진 모습(점검용) */
export interface DrawnBells {
  form: BellForm;
  /** 그린 나무의 수 */
  trees: number;
  /** 그린 종들 */
  bells: DrawnBellMark[];
  /** 쓰지 않는 가지로 빗금을 친 단의 옥타브(맨 위 단부터). 설치물 모드에서만 친다 */
  hatched: number[];
  /** 단 이름표(옥타브), 열 이름표, 나무 이름표(빈터)를 단 수. 설치물 모드에서만 단다 */
  labels: { octaves: number; columns: number; trees: number };
  /** 고른 자리. 종이 없는 열이면 걸 가지(옥타브)의 고리가 slot이고, 고른 것이 없으면 null */
  cursor: { slot: number | null; tree: number; column: number; octave: number | null } | null;
}

type Text = Phaser.GameObjects.Text;

/** 설치물 하나의 글자 묶음과 자리 */
interface BellPool {
  map: BellMap;
  /** 고리 번호 → 고리 칸 */
  cells: Map<number, SlotRect>;
  /** 나무마다 고리 격자의 왼쪽 위 */
  origins: Array<{ x: number; y: number }>;
  names: Text[];
  bangs: Text[];
  notes: Text[];
  lows: Text[];
  /** 나무 × 단 */
  octaves: Text[];
  /** 나무 × 열 */
  columns: Text[];
  trees: Text[];
  heads: Text[];
  /** 글자가 지금 흰색인가: 바꿀 때만 setColor를 부른다 */
  octaveWhite: boolean[];
  columnWhite: boolean[];
  treeWhite: boolean[];
}

const hide = (list: readonly Text[]): void => {
  for (const t of list) t.setVisible(false);
};

const EMPTY_OUT = (form: BellForm, trees: number): DrawnBells => ({ form, trees, bells: [], hatched: [], labels: { octaves: 0, columns: 0, trees: 0 }, cursor: null });

export class BellLayer {
  private readonly pools = new Map<string, BellPool>();

  constructor(
    scene: Phaser.Scene,
    installations: readonly InstallationDef[],
    depth: number,
  ) {
    const res = Math.min(3, Math.max(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2));
    const text = (content: string, size: number, color: string): Text =>
      scene.add
        .text(0, 0, content, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
        .setOrigin(0.5, 0.5)
        .setResolution(res)
        .setDepth(depth + 1)
        .setVisible(false);
    for (const inst of installations) {
      const map = bellMapOf(inst);
      if (!map) continue;
      const cells = new Map<number, SlotRect>(inst.slots.map((s) => [s.slot, s]));
      const origins: Array<{ x: number; y: number }> = [];
      for (let tree = 0; tree < map.trees; tree++) {
        const first = bellSlotOf(map, tree, map.octaves[0]!, 0);
        const cell = first === null ? undefined : cells.get(first);
        if (cell) origins.push({ x: cell.x, y: cell.y });
      }
      // 고리 격자가 변환표와 맞지 않는 설치물은 그리지 않는다(콘텐츠 검사가 먼저 막는다)
      if (origins.length !== map.trees) continue;
      const drafts = bellDraftCount(map);
      const many = (n: number, make: () => Text): Text[] => Array.from({ length: n }, make);
      this.pools.set(inst.installationId, {
        map,
        cells,
        origins,
        names: many(drafts, () => text('', 18, INK_CSS)),
        bangs: many(drafts, () => text('!', 20, WHITE_CSS)),
        notes: many(drafts, () => text('♪', 22, GOLD_TEXT_CSS)),
        lows: many(drafts, () => text('낮음', 11, INK_CSS)),
        octaves: many(map.trees * map.octaves.length, () => text('', 17, INK_CSS)),
        columns: many(drafts, () => text('', 15, INK_CSS)),
        trees: map.form === 'glade' ? many(map.trees, () => text('', 13, INK_CSS)) : [],
        heads: many(map.trees, () => text('옥타브', 12, INK_CSS)),
        octaveWhite: Array.from({ length: map.trees * map.octaves.length }, () => false),
        columnWhite: Array.from({ length: drafts }, () => false),
        treeWhite: Array.from({ length: map.trees }, () => false),
      });
    }
  }

  /** 종나무 설치물인가(이 층이 그린다) */
  has(installationId: string): boolean {
    return this.pools.has(installationId);
  }

  /** 종나무 하나를 그린다. g는 설치물 층의 그래픽(같은 깊이에 쌓는다). 걷는 중(active가 아님)에는 줄기와 가지와 걸린 종만 그린다 */
  draw(g: Phaser.GameObjects.Graphics, inst: InstallationDef, view: InstallationView | undefined, active: boolean): DrawnBells {
    const pool = this.pools.get(inst.installationId);
    if (!pool) return EMPTY_OUT('tree', 0);
    for (const list of [pool.names, pool.bangs, pool.notes, pool.lows, pool.octaves, pool.columns, pool.trees, pool.heads]) hide(list);
    const map = pool.map;
    const bells = view?.bells;
    const out = EMPTY_OUT(map.form, map.trees);

    // 쓰지 않는 단: 판본의 음역 밖의 옥타브. 모습이 아직 없으면 모든 단을 쓴다
    const usable = bells ? bells.usable : map.octaves;
    const unusable = map.octaves.filter((o) => !usable.includes(o));
    // 고른 자리: 초안 칸 번호와 걸(걸린) 단
    const pos = bells && bells.cursor !== null ? bellDraftPosition(map, bells.cursor) : null;
    const cursorRow = pos && bells && bells.cursorOctave !== null ? map.octaves.indexOf(bells.cursorOctave) : -1;

    this.drawGround(g, pool);
    for (let tree = 0; tree < map.trees; tree++) {
      // 이 나무에서 고른 열(고른 것이 다른 나무에 있으면 null)
      const column = pos && pos.tree === tree ? pos.column : null;
      if (active) this.drawBackdrop(g, pool, tree, unusable, column, out);
      this.drawFrame(g, pool, tree);
      this.drawHooks(g, pool, tree, active, bells?.bells ?? []);
      if (active) this.drawLabels(g, pool, tree, unusable, column, cursorRow, out);
    }
    if (bells) this.drawBells(g, pool, bells.bells, out);
    if (active && pos) this.drawCursor(g, pool, pos, bells?.cursorOctave ?? null, out);
    return out;
  }

  // ------------------------------------------------------------------ 바닥, 줄기와 가지, 고리

  /** 바닥: 나무 하나나 종탑은 뿌리 밑의 옅은 그늘, 빈터는 나무들을 잇는 길(나무 셋이 길을 따라 선다) */
  private drawGround(g: Phaser.GameObjects.Graphics, pool: BellPool): void {
    const { map, origins } = pool;
    const w = map.columns * BELL_CELL_W;
    const h = map.octaves.length * BELL_CELL_H;
    if (map.form === 'glade') {
      const first = origins[0]!;
      const last = origins[origins.length - 1]!;
      const x = first.x - POST_GAP;
      const width = last.x + w + POST_GAP - x;
      const y = first.y + h + 10;
      g.fillStyle(ROCK, 0.42).fillRoundedRect(x, y, width, 16, 8);
      g.lineStyle(2, ROCK_DARK, 0.5).strokeRoundedRect(x, y, width, 16, 8);
      return;
    }
    for (const o of origins) g.fillStyle(INK, 0.1).fillEllipse(o.x + w / 2, o.y + h + 9, w + 44, 16);
  }

  /** 줄기(종탑은 양쪽 기둥)와 가지. 단마다 가로 막대 하나다 */
  private drawFrame(g: Phaser.GameObjects.Graphics, pool: BellPool, tree: number): void {
    const { map } = pool;
    const o = pool.origins[tree]!;
    const w = map.columns * BELL_CELL_W;
    const h = map.octaves.length * BELL_CELL_H;
    const tower = map.form === 'tower';
    const post = (x: number): void => {
      g.fillStyle(WOOD, 1).fillRoundedRect(x, o.y - 2, POST_W, h + 12, 4);
      g.lineStyle(1.5, WOOD_DARK, 0.9).strokeRoundedRect(x, o.y - 2, POST_W, h + 12, 4);
    };
    const left = o.x - POST_GAP;
    const right = tower ? o.x + w + POST_GAP : o.x + w + 6;
    post(left);
    if (tower) post(right - POST_W);
    for (let row = 0; row < map.octaves.length; row++) {
      const y = o.y + row * BELL_CELL_H + BRANCH_Y - BRANCH_T / 2;
      g.fillStyle(WOOD, 1).fillRoundedRect(left, y, right - left, BRANCH_T, BRANCH_T / 2);
      g.lineStyle(1.5, WOOD_DARK, 0.9).strokeRoundedRect(left, y, right - left, BRANCH_T, BRANCH_T / 2);
    }
  }

  /** 고리: 가지에 매달린 작은 둥근 걸이. 걷는 중에는 종이 걸린 고리만, 설치물 모드에서는 모든 고리를 그린다 */
  private drawHooks(g: Phaser.GameObjects.Graphics, pool: BellPool, tree: number, active: boolean, hung: readonly BellMark[]): void {
    const { map } = pool;
    for (let row = 0; row < map.octaves.length; row++) {
      for (let column = 0; column < map.columns; column++) {
        const slot = bellSlotOf(map, tree, map.octaves[row]!, column);
        const cell = slot === null ? undefined : pool.cells.get(slot);
        if (!cell || slot === null) continue;
        if (!active && !hung.some((b) => b.slot === slot)) continue;
        const cx = cell.x + cell.w / 2;
        g.fillStyle(WHITE, 1).fillCircle(cx, cell.y + HOOK_Y, HOOK_R);
        g.lineStyle(3, WOOD_DARK, 1).strokeCircle(cx, cell.y + HOOK_Y, HOOK_R);
      }
    }
  }

  // ------------------------------------------------------------------ 설치물 모드: 빈 고리, 쓰지 않는 가지, 이름표, 고른 열

  /** 빈 고리 칸의 옅은 바탕과 테두리, 쓰지 않는 가지의 빗금, 고른 열 전체의 옅은 바탕 */
  private drawBackdrop(g: Phaser.GameObjects.Graphics, pool: BellPool, tree: number, unusable: readonly number[], selectedColumn: number | null, out: DrawnBells): void {
    const { map } = pool;
    const o = pool.origins[tree]!;
    const w = map.columns * BELL_CELL_W;
    for (let row = 0; row < map.octaves.length; row++) {
      const octave = map.octaves[row]!;
      const y = o.y + row * BELL_CELL_H;
      if (unusable.includes(octave)) {
        // 쓰지 않는 단: 칸 하나하나가 아니라 단 전체를 빗금으로 덮는다(색만으로 '쓰지 않음'을 말하지 않는다)
        g.fillStyle(INK, 0.08).fillRoundedRect(o.x + 3, y + 3, w - 6, BELL_CELL_H - 6, 10);
        g.lineStyle(2, INK, 0.3).strokeRoundedRect(o.x + 3, y + 3, w - 6, BELL_CELL_H - 6, 10);
        g.lineStyle(2, INK, 0.26);
        for (const [x0, y0, x1, y1] of hatchSegments(o.x + 9, y + 9, w - 18, BELL_CELL_H - 18, 12)) g.lineBetween(x0, y0, x1, y1);
        if (tree === 0) out.hatched.push(octave);
        continue;
      }
      for (let column = 0; column < map.columns; column++) {
        const x = o.x + column * BELL_CELL_W;
        g.fillStyle(WHITE, 0.3).fillRoundedRect(x + 5, y + 3, BELL_CELL_W - 10, BELL_CELL_H - 6, 12);
        g.lineStyle(2, TEAL, 0.32).strokeRoundedRect(x + 5, y + 3, BELL_CELL_W - 10, BELL_CELL_H - 6, 12);
      }
    }
    if (selectedColumn !== null) {
      const x = o.x + selectedColumn * BELL_CELL_W;
      const h = map.octaves.length * BELL_CELL_H;
      g.fillStyle(TEAL, 0.1).fillRoundedRect(x + 2, o.y - 2, BELL_CELL_W - 4, h + 4, 14);
      g.lineStyle(2, TEAL, 0.55).strokeRoundedRect(x + 2, o.y - 2, BELL_CELL_W - 4, h + 4, 14);
    }
  }

  /** 이름표: 왼쪽 띠에 단의 옥타브, 위쪽 띠에 열 번호(빈터는 나무 이름도). 고른 단과 열의 이름표는 채워서 함께 알린다 */
  private drawLabels(g: Phaser.GameObjects.Graphics, pool: BellPool, tree: number, unusable: readonly number[], selected: number | null, cursorRow: number, out: DrawnBells): void {
    const { map } = pool;
    const o = pool.origins[tree]!;
    const rows = map.octaves.length;
    const head = pool.heads[tree];
    if (head) head.setPosition(o.x - OCTAVE_LABEL_DX, o.y - COLUMN_LABEL_DY).setVisible(true);
    const onThisTree = selected !== null;

    for (let row = 0; row < rows; row++) {
      const octave = map.octaves[row]!;
      const idx = tree * rows + row;
      const t = pool.octaves[idx];
      if (!t) continue;
      const off = unusable.includes(octave);
      const on = onThisTree && row === cursorRow;
      const cx = o.x - OCTAVE_LABEL_DX;
      const cy = o.y + row * BELL_CELL_H + BELL_CELL_H / 2;
      if (on) g.fillStyle(TEAL, 1).fillCircle(cx, cy, LABEL_R + 1);
      else {
        g.fillStyle(off ? INK : WHITE, off ? 0.08 : 0.95).fillCircle(cx, cy, LABEL_R);
        g.lineStyle(2, off ? INK : TEAL, off ? 0.4 : 0.7).strokeCircle(cx, cy, LABEL_R);
      }
      t.setText(String(octave)).setPosition(cx, cy + 1).setAlpha(off ? 0.5 : 1).setVisible(true);
      if (pool.octaveWhite[idx] !== on) {
        t.setColor(on ? WHITE_CSS : INK_CSS);
        pool.octaveWhite[idx] = on;
      }
      out.labels.octaves++;
    }

    for (let column = 0; column < map.columns; column++) {
      const idx = tree * map.columns + column;
      const t = pool.columns[idx];
      if (!t) continue;
      const on = selected === column;
      const cx = o.x + column * BELL_CELL_W + BELL_CELL_W / 2;
      const cy = o.y - COLUMN_LABEL_DY;
      if (on) g.fillStyle(TEAL, 1).fillCircle(cx, cy, COLUMN_R + 1);
      else {
        g.fillStyle(WHITE, 0.95).fillCircle(cx, cy, COLUMN_R);
        g.lineStyle(2, INK, 0.85).strokeCircle(cx, cy, COLUMN_R);
      }
      t.setText(String(column + 1)).setPosition(cx, cy + 1).setVisible(true);
      if (pool.columnWhite[idx] !== on) {
        t.setColor(on ? WHITE_CSS : INK_CSS);
        pool.columnWhite[idx] = on;
      }
      out.labels.columns++;
    }

    // 빈터의 나무 이름: 위쪽 띠의 맨 위에 알약 모양으로. 고른 나무는 채운다
    const name = pool.trees[tree];
    if (name) {
      const w = map.columns * BELL_CELL_W;
      const cx = o.x + w / 2;
      const cy = o.y - TREE_LABEL_DY;
      name.setText(bellTreeNameOf(tree)).setPosition(cx, cy + 1).setVisible(true);
      const pw = name.width + 20;
      if (onThisTree) g.fillStyle(TEAL, 1).fillRoundedRect(cx - pw / 2, cy - 9, pw, 18, 9);
      else {
        g.fillStyle(WHITE, 0.92).fillRoundedRect(cx - pw / 2, cy - 9, pw, 18, 9);
        g.lineStyle(2, TEAL, 0.55).strokeRoundedRect(cx - pw / 2, cy - 9, pw, 18, 9);
      }
      if (pool.treeWhite[tree] !== onThisTree) {
        name.setColor(onThisTree ? WHITE_CSS : INK_CSS);
        pool.treeWhite[tree] = onThisTree;
      }
      out.labels.trees++;
    }
  }

  // ------------------------------------------------------------------ 종

  private drawBells(g: Phaser.GameObjects.Graphics, pool: BellPool, bells: readonly BellMark[], out: DrawnBells): void {
    let nameAt = 0;
    let bangAt = 0;
    let noteAt = 0;
    let lowAt = 0;
    for (const b of bells) {
      const cell = pool.cells.get(b.slot);
      const ring = bellCellOf(pool.map, b.slot);
      if (!cell || !ring) continue;
      const cx = cell.x + cell.w / 2;
      const y = cell.y;

      // 듣는 중: 금빛 테두리와 바탕(종 뒤에 깐다)
      if (b.playing) {
        g.fillStyle(GOLD, 0.38).fillRoundedRect(cx - 31, y + 13, 62, 42, 14);
        g.lineStyle(5, GOLD, 1).strokeRoundedRect(cx - 31, y + 13, 62, 42, 14);
      }
      this.drawBellShape(g, cx, y, b.muted);

      const name = pool.names[nameAt++];
      if (name) {
        name.setText(b.name).setPosition(cx, y + BODY_TOP + BODY_H / 2 + 1).setAlpha(b.muted ? 0.55 : 1);
        name.setScale(Math.min(1, Math.max(0.55, (BODY_W - 6) / Math.max(1, name.width))));
        name.setVisible(true);
      }
      // 판정이 가리킨 종: 왼쪽 위의 산호색 배지와 '!' 글자
      if (b.flagged) {
        const bx = cx - 28;
        const by = y + 17;
        g.fillStyle(CORAL, 1).fillCircle(bx, by, 10);
        g.lineStyle(2.5, WHITE, 1).strokeCircle(bx, by, 10);
        const bang = pool.bangs[bangAt++];
        if (bang) bang.setPosition(bx, by + 1).setScale(0.78).setVisible(true);
      }
      // 듣는 중인 종: 오른쪽 위의 ♪ 글자. 소리를 끈 종은 소리가 없다
      if (b.playing && !b.muted) {
        const note = pool.notes[noteAt++];
        if (note) note.setPosition(cx + 28, y + 15).setVisible(true);
      }
      // 소리를 끈 종: 오른쪽 위의 ✕ 표시(점선 테두리와 함께)
      if (b.muted) {
        const mx = cx + 28;
        const my = y + 19;
        g.fillStyle(WHITE, 0.95).fillCircle(mx, my, 9);
        g.lineStyle(2, INK, 0.9).strokeCircle(mx, my, 9);
        g.lineStyle(2.5, INK, 0.9);
        g.lineBetween(mx - 4, my - 4, mx + 4, my + 4);
        g.lineBetween(mx - 4, my + 4, mx + 4, my - 4);
      }
      // 가장 낮은 종: 금빛 밑줄과 '낮음' 이름표
      if (b.lowest) {
        g.fillStyle(GOLD, 1).fillRoundedRect(cx - LIP_W / 2, y + LOW_BAR_Y, LIP_W, 3.5, 1.75);
        g.fillStyle(WHITE, 0.95).fillRoundedRect(cx - 19, y + LOW_TAG_Y - 7, 38, 14, 7);
        g.lineStyle(1.5, GOLD, 1).strokeRoundedRect(cx - 19, y + LOW_TAG_Y - 7, 38, 14, 7);
        const low = pool.lows[lowAt++];
        if (low) low.setPosition(cx, y + LOW_TAG_Y + 1).setVisible(true);
      }
      out.bells.push({ slot: b.slot, tree: ring.tree, column: ring.column, octave: ring.octave, label: b.name, muted: b.muted, lowest: b.lowest, flagged: b.flagged, playing: b.playing, x: cell.x, y: cell.y, w: cell.w, h: cell.h });
    }
  }

  /** 종 모양: 둥근 몸통, 넓은 아랫단, 추. 소리를 끈 종은 속이 비고 점선 테두리다 */
  private drawBellShape(g: Phaser.GameObjects.Graphics, cx: number, y: number, muted: boolean): void {
    const body = { x: cx - BODY_W / 2, y: y + BODY_TOP, w: BODY_W, h: BODY_H };
    const lip = { x: cx - LIP_W / 2, y: y + LIP_TOP, w: LIP_W, h: LIP_H };
    const radius = { tl: 16, tr: 16, bl: 2, br: 2 };
    if (muted) {
      g.fillStyle(WHITE, 0.45).fillRoundedRect(body.x, body.y, body.w, body.h, radius);
      g.fillStyle(WHITE, 0.45).fillRoundedRect(lip.x, lip.y, lip.w, lip.h, 3);
      g.lineStyle(2.5, INK, 0.85);
      for (const [x0, y0, x1, y1] of dashedRectSegments(lip.x, body.y, lip.w, lip.y + lip.h - body.y, 6, 4)) g.lineBetween(x0, y0, x1, y1);
      g.fillStyle(INK, 0.5).fillCircle(cx, y + CLAPPER_Y, 3.2);
      return;
    }
    g.fillStyle(TEAL_LIGHT, 0.98).fillRoundedRect(body.x, body.y, body.w, body.h, radius);
    g.fillStyle(TEAL_LIGHT, 0.98).fillRoundedRect(lip.x, lip.y, lip.w, lip.h, 3);
    g.lineStyle(3, TEAL, 0.95).strokeRoundedRect(body.x, body.y, body.w, body.h, radius);
    g.lineStyle(3, TEAL, 0.95).strokeRoundedRect(lip.x, lip.y, lip.w, lip.h, 3);
    g.fillStyle(TEAL, 1).fillCircle(cx, y + CLAPPER_Y, 3.2);
  }

  // ------------------------------------------------------------------ 고른 자리

  /** 고른 고리: 굵은 테두리와 옅은 바탕. 종이 없는 열이면 걸 가지(옥타브)의 고리를 가리킨다 */
  private drawCursor(g: Phaser.GameObjects.Graphics, pool: BellPool, pos: { tree: number; column: number }, octave: number | null, out: DrawnBells): void {
    const slot = octave === null ? null : bellSlotOf(pool.map, pos.tree, octave, pos.column);
    const cell = slot === null ? undefined : pool.cells.get(slot);
    if (cell) {
      g.fillStyle(TEAL, 0.14).fillRoundedRect(cell.x + 2, cell.y + 2, cell.w - 4, cell.h - 4, 14);
      g.lineStyle(7, TEAL, 1).strokeRoundedRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2, 15);
    }
    out.cursor = { slot: cell ? slot : null, tree: pos.tree, column: pos.column, octave: cell ? octave : null };
  }

  destroy(): void {
    for (const p of this.pools.values()) for (const list of [p.names, p.bangs, p.notes, p.lows, p.octaves, p.columns, p.trees, p.heads]) for (const t of list) t.destroy();
    this.pools.clear();
  }
}
