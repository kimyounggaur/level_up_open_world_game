// 7-1d 계단밭(T5, 설계서 3.5, 4.7)을 월드에 그린다: 줄 돌담(높은음자리표 다섯 줄, 낮은음자리표 다섯 줄, 두 밭 사이의 가운데 턱), 음자리표 조각상,
// 놓인 등, 보표 밖에 놓은 등의 짧은 덧줄 돌담, 설치물 모드의 열 이름표와 고른 열·고른 높이, 쓰지 않는 구간(빗금), 판정이 가리킨 열, 듣는 등.
// 그리는 일만 맡는다. 무엇을 그릴지는 화면(설치물 컨트롤러)이 정해 다리(WorldBridge)에 올려 두고(InstallationView.terrace), 여기서는 읽어서 옮겨 그린다.
// 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3): 등의 높이는 온음계 위치(정수)이고 세로 좌표는 y = c4Y − 48 × 위치다.
// 세 설치물(N1 N2 N3)은 한 밭을 나눠 쓴다. 풍경(돌담과 조각상)은 밭마다 한 번만 그리고, 등은 설치물 모드에서는 그 설치물의 것만, 걷는 중에는 세 설치물의 것을 모두 그린다.
// 색만으로 뜻을 전하지 않는다:
//   등 = 등 모양(지붕, 불빛 창, 받침)과 놓인 높이 / 변화표 = ♯ ♭ 글자 / 이름 = 자유로 놀 때만 등 안의 글자 /
//   보표 밖의 등 = 짧은 덧줄 돌담 / 고른 열 = 굵은 테두리 + 채운 열 번호표 + 고른 높이의 가로 띠 / 놓을 자리(아직 비었음) = 점선 고리 /
//   쓰지 않는 구간 = 빗금 / 판정이 가리킨 열 = 산호색 배지와 '!' 글자 / 듣는 등 = 금빛 테두리와 ♪ 글자 / 밟은 열 = 금빛 바탕(잠깐).
// 걷는 중에는 돌담과 조각상과 놓인 등(과 덧줄 돌담)만 풍경으로 남고, 열 이름표와 고른 자리와 빗금은 설치물 모드에서만 보인다.
// 열(칸)의 자리는 설치물의 slots가 정한다: 이 층은 열 번호로 사각형을 찾는다(코드가 좌표를 따로 계산하지 않는다).
import Phaser from 'phaser';
import type { Accidental } from '../../domain/pitch';
import { CLEF_BOTTOM_LINE, CLEF_NAME_KO } from '../../domain/staff';
import type { Clef } from '../../domain/staff';
import type { InstallationDef, SlotRect } from '../../domain/installation';
import { TERRACE_STEP_PX, terraceFieldWalls, terraceLedgerSteps, terraceMapOf, terraceStepOf, terraceYOfStep } from '../../domain/terrace';
import type { TerraceMap, TerraceMark, TerraceView } from '../../domain/terrace';
import type { InstallationView } from '../../platform/bridge';
import { hatchSegments } from './hatch';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, ROCK, ROCK_DARK, TEAL, WHITE, WHITE_CSS } from './palette';

// 돌담
/** 돌담이 첫 열의 왼쪽과 마지막 열의 오른쪽으로 더 나오는 길이 */
const WALL_PAD = 12;
const LINE_T = 8;
const MIDDLE_T = 11;
const LEDGER_T = 7;
/** 덧줄 돌담은 등 가운데에서 양쪽으로 이만큼 뻗는다(열 너비 96 안에 든다) */
const LEDGER_HALF = 46;
/** 돌 사이의 이음 간격 */
const JOINT = 34;
// 등: 지붕과 몸통과 받침. 몸통의 가운데가 놓인 높이다
const BODY_HALF_W = 22;
const BODY_HALF_H = 17;
const ROOF_H = 12;
const BASE_H = 6;
const SELECT_PAD = 6;
// 열 이름표(첫 줄 위 띠 56 px): 위에서부터 열 번호 원, 이름, 음자리표 꼬리
const HEAD_NUM_DY = 42;
const HEAD_NAME_DY = 22;
const HEAD_TAG_DY = 8;
const NUM_R = 12;
const HEAD_TEXT_W = 90;
// 조각상(왼쪽 띠 64 px 안)
const PLAQUE_DX = 32;
const PLAQUE_W = 56;
const PLAQUE_H = 50;
const MIDDLE_W = 58;
const MIDDLE_H = 26;

/** 그려진 등 하나(점검용). x, y는 등의 가운데(월드 좌표) */
export interface DrawnLamp {
  /** 열 번호(1부터) */
  column: number;
  /** 초안의 칸 번호 */
  draft: number;
  /** 온음계 위치 */
  step: number;
  x: number;
  y: number;
  /** 등 안에 쓴 이름. 문제를 푸는 중에는 null이다(자유로 놀 때만 쓴다) */
  label: string | null;
  accidental: Accidental | null;
  flagged: boolean;
  playing: boolean;
  /** 고른 열의 등인가(설치물 모드에서만 참이다) */
  selected: boolean;
}

/** 한 설치물의 그려진 밭(점검용) */
export interface DrawnTerrace {
  /** 그린 돌담: 온음계 위치와 세로 좌표와 종류(줄, 가운데 턱). 세 설치물이 같은 밭을 그리므로 같은 목록이다 */
  walls: Array<{ step: number; y: number; kind: 'line' | 'middle' }>;
  /** 조각상에 쓴 글(예: '높은음자리표', '가운데 도') */
  plaques: string[];
  /** 그린 등들. 설치물 모드에서는 그 설치물의 것만이다 */
  lamps: DrawnLamp[];
  /** 보표 밖에 놓은 등이 만든 덧줄 돌담: 열 번호와 온음계 위치와 세로 좌표 */
  ledgers: Array<{ column: number; step: number; y: number }>;
  /** 쓰지 않는 구간(빗금)이 있는 열 번호. 열 전체가 쓰이지 않으면 그 열도 들어간다. 설치물 모드에서만 친다 */
  hatched: number[];
  /** 그린 열 이름표의 수. 설치물 모드에서만 단다 */
  headers: number;
  /** 고른 열과 고른 높이. 고른 것이 없으면 null. placed는 그 열에 등이 놓여 있는가(없으면 놓을 자리를 점선 고리로 보인다) */
  cursor: { column: number; step: number; y: number; placed: boolean } | null;
  /** 지금 밟은 열의 번호(걷는 중, 잠깐) */
  flashing: number[];
}

type Text = Phaser.GameObjects.Text;
type Graphics = Phaser.GameObjects.Graphics;

/** 설치물 하나의 글자 묶음과 자리 */
interface InstPool {
  inst: InstallationDef;
  map: TerraceMap;
  /** 열 번호 → 열 사각형 */
  rects: Map<number, SlotRect>;
  /** 열 이름표: 번호, 이름, 음자리표 꼬리 */
  nums: Text[];
  names: Text[];
  tags: Text[];
  lampNames: Text[];
  accs: Text[];
  bangs: Text[];
  notes: Text[];
  /** 열 번호 글자가 지금 흰색인가: 바꿀 때만 setColor를 부른다 */
  numWhite: boolean[];
}

/** 밭 하나(같은 땅을 나눠 쓰는 설치물들) */
interface Field {
  c4Y: number;
  x0: number;
  x1: number;
  clefs: Clef[];
  pools: InstPool[];
  plaques: Array<{ x: number; y: number; w: number; h: number; texts: Text[]; label: string }>;
}

const hide = (list: readonly Text[]): void => {
  for (const t of list) t.setVisible(false);
};

const emptyDrawn = (walls: DrawnTerrace['walls'], plaques: string[]): DrawnTerrace => ({ walls, plaques, lamps: [], ledgers: [], hatched: [], headers: 0, cursor: null, flashing: [] });

/** 열 이름표의 이름과 음자리표 꼬리: 'B3 · 높은음자리표' → ['B3', '높은음'] */
export function headerParts(label: string, clef: Clef, twoClefs: boolean): { name: string; tag: string | null } {
  const at = label.indexOf(' · ');
  const name = at < 0 ? label : label.slice(0, at);
  const tag = twoClefs ? CLEF_NAME_KO[clef].slice(0, 3) : null;
  return { name, tag };
}

export class TerraceLayer {
  private readonly fields: Field[] = [];
  private readonly pools = new Map<string, InstPool>();

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
    const byKey = new Map<string, Field>();
    for (const inst of installations) {
      const map = terraceMapOf(inst);
      if (!map || inst.slots.length === 0) continue;
      const x0 = Math.min(...inst.slots.map((s) => s.x));
      const x1 = Math.max(...inst.slots.map((s) => s.x + s.w));
      const key = `${map.c4Y}|${x0}|${x1}`;
      let field = byKey.get(key);
      if (!field) {
        field = { c4Y: map.c4Y, x0, x1, clefs: [], pools: [], plaques: [] };
        byKey.set(key, field);
        this.fields.push(field);
      }
      for (const clef of map.clefs) if (!field.clefs.includes(clef)) field.clefs.push(clef);
      const n = inst.slots.length;
      const many = (size: number, color: string, content = ''): Text[] => Array.from({ length: n }, () => text(content, size, color));
      const pool: InstPool = {
        inst,
        map,
        rects: new Map(inst.slots.map((s) => [s.slot, s])),
        nums: many(15, INK_CSS),
        names: many(15, INK_CSS),
        tags: many(11, INK_CSS),
        lampNames: many(17, INK_CSS),
        accs: many(26, INK_CSS),
        bangs: many(18, WHITE_CSS, '!'),
        notes: many(22, GOLD_TEXT_CSS, '♪'),
        numWhite: Array.from({ length: n }, () => false),
      };
      field.pools.push(pool);
      this.pools.set(inst.installationId, pool);
    }
    // 조각상: 음자리표마다 그 보표의 가운데 줄 높이에, 음자리표가 둘이면 가운데 턱 높이에 하나 더. 풍경이라 늘 보인다
    for (const field of this.fields) {
      const map = field.pools[0]!.map;
      const x = field.x0 - PLAQUE_DX;
      for (const clef of field.clefs) {
        const name = CLEF_NAME_KO[clef];
        const y = terraceYOfStep(map, terraceStepOf(CLEF_BOTTOM_LINE[clef]) + 4);
        const lines = [name.slice(0, 3), name.slice(3)].map((s) => text(s, 13, INK_CSS));
        lines[0]!.setPosition(x, y - 10).setVisible(true);
        lines[1]!.setPosition(x, y + 10).setVisible(true);
        field.plaques.push({ x, y, w: PLAQUE_W, h: PLAQUE_H, texts: lines, label: name });
      }
      if (field.clefs.length > 1) {
        const y = terraceYOfStep(map, 0);
        const t = text('가운데 도', 12, INK_CSS).setPosition(x, y).setVisible(true);
        field.plaques.push({ x, y, w: MIDDLE_W, h: MIDDLE_H, texts: [t], label: '가운데 도' });
      }
    }
  }

  /** 계단밭 설치물인가(이 층이 그린다) */
  has(installationId: string): boolean {
    return this.pools.has(installationId);
  }

  /**
   * 모든 밭을 그린다. gOf는 밭의 설치물 이름들에 맞는 그래픽(설치물 층의 그래픽이거나, 화면 밖이면 아무것도 그리지 않는 그래픽)을 돌려준다. activeId는 설치물 모드의 설치물(없으면 걷는 중), flashOf는 밟은 열의 남은 반짝임(0이면 없다).
   * 같은 밭을 나눠 쓰는 설치물들이 서로를 덮지 않도록 밭 단위로 그린다: 바탕(설치물 모드) → 밟은 열 → 돌담과 조각상 → 덧줄 돌담과 등 → 고른 자리와 이름표.
   */
  drawAll(gOf: (installationIds: readonly string[]) => Graphics, views: readonly InstallationView[], activeId: string | null, flashOf: (installationId: string, slot: number) => number): Map<string, DrawnTerrace> {
    const out = new Map<string, DrawnTerrace>();
    for (const pool of this.pools.values()) for (const list of [pool.nums, pool.names, pool.tags, pool.lampNames, pool.accs, pool.bangs, pool.notes]) hide(list);
    for (const field of this.fields) {
      // 밭이 화면 밖이면 그리는 호출을 받아 버리는 그래픽을 준다(8-4). 기록과 글자 자리는 그대로 계산한다
      const g = gOf(field.pools.map((p) => p.inst.installationId));
      const walls = terraceFieldWalls(field.clefs).map((w) => ({ step: w.step, y: terraceYOfStep(field.pools[0]!.map, w.step), kind: w.kind }));
      const plaques = field.plaques.map((p) => p.label);
      const drawn = new Map<string, DrawnTerrace>(field.pools.map((p) => [p.inst.installationId, emptyDrawn(walls, plaques)]));
      const viewOf = (pool: InstPool): TerraceView | undefined => views.find((v) => v.installationId === pool.inst.installationId)?.terrace;
      const activePool = activeId === null ? undefined : field.pools.find((p) => p.inst.installationId === activeId);

      if (activePool) this.drawBackdrop(g, activePool, viewOf(activePool), drawn.get(activePool.inst.installationId)!);
      for (const pool of field.pools) this.drawFlashes(g, pool, viewOf(pool), flashOf, drawn.get(pool.inst.installationId)!);
      this.drawWalls(g, field, walls);
      for (const pool of activePool ? [activePool] : field.pools) {
        const view = viewOf(pool);
        if (view) this.drawLamps(g, pool, view, pool === activePool, drawn.get(pool.inst.installationId)!);
      }
      if (activePool) {
        const view = viewOf(activePool);
        if (view) {
          this.drawCursor(g, activePool, view, drawn.get(activePool.inst.installationId)!);
          this.drawHeaders(g, activePool, view, drawn.get(activePool.inst.installationId)!);
        }
      }
      for (const [id, d] of drawn) out.set(id, d);
    }
    return out;
  }

  // ------------------------------------------------------------------ 돌담과 조각상(풍경)

  /** 돌담 하나: 둥근 돌 띠와 이음 */
  private wall(g: Graphics, x0: number, x1: number, y: number, thick: number, alpha = 1): void {
    g.fillStyle(ROCK, 0.95 * alpha).fillRoundedRect(x0, y - thick / 2, x1 - x0, thick, thick / 2);
    g.lineStyle(1.5, ROCK_DARK, 0.9 * alpha).strokeRoundedRect(x0, y - thick / 2, x1 - x0, thick, thick / 2);
    g.lineStyle(1.5, ROCK_DARK, 0.55 * alpha);
    for (let x = x0 + JOINT * 0.75; x < x1 - 8; x += JOINT) g.lineBetween(x, y - thick / 2 + 1.5, x, y + thick / 2 - 1.5);
  }

  /** 줄 돌담과 가운데 턱(금빛 갓돌을 얹는다), 음자리표 조각상 */
  private drawWalls(g: Graphics, field: Field, walls: DrawnTerrace['walls']): void {
    const x0 = field.x0 - WALL_PAD;
    const x1 = field.x1 + WALL_PAD;
    for (const w of walls) {
      if (w.kind === 'line') this.wall(g, x0, x1, w.y, LINE_T);
      else {
        this.wall(g, x0, x1, w.y, MIDDLE_T);
        g.fillStyle(GOLD, 1).fillRoundedRect(x0 + 6, w.y - MIDDLE_T / 2 - 3, x1 - x0 - 12, 3.5, 1.75);
      }
    }
    for (const p of field.plaques) {
      g.fillStyle(WHITE, 0.95).fillRoundedRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10);
      g.lineStyle(2.5, TEAL, 0.85).strokeRoundedRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 10);
    }
  }

  // ------------------------------------------------------------------ 설치물 모드: 바탕, 쓰지 않는 구간, 고른 열

  /** 열마다 쓸 수 있는 높이의 옅은 바탕과 높이 눈금, 쓰지 않는 구간의 빗금, 고른 열의 바탕과 고른 높이의 띠 */
  private drawBackdrop(g: Graphics, pool: InstPool, view: TerraceView | undefined, out: DrawnTerrace): void {
    if (!view) return;
    const half = TERRACE_STEP_PX / 2;
    for (const rect of pool.inst.slots) {
      const mark = view.columns.find((m) => m.column === rect.slot);
      if (!mark) {
        // 이 판본이 쓰지 않는 열: 열 전체를 빗금으로 덮는다
        this.hatch(g, rect.x, rect.y, rect.w, rect.h);
        out.hatched.push(rect.slot);
        continue;
      }
      const top = Math.max(rect.y, terraceYOfStep(pool.map, mark.maxStep) - half);
      const bottom = Math.min(rect.y + rect.h, terraceYOfStep(pool.map, mark.minStep) + half);
      g.fillStyle(WHITE, 0.3).fillRoundedRect(rect.x + 3, top, rect.w - 6, bottom - top, 12);
      g.lineStyle(2, TEAL, 0.32).strokeRoundedRect(rect.x + 3, top, rect.w - 6, bottom - top, 12);
      // 높이 눈금: 온음계 한 칸(48 px)마다 짧은 선
      g.lineStyle(1.5, TEAL, 0.22);
      for (let step = mark.minStep; step <= mark.maxStep; step++) {
        const y = terraceYOfStep(pool.map, step);
        g.lineBetween(rect.x + 22, y, rect.x + rect.w - 22, y);
      }
      let cut = false;
      if (top > rect.y) {
        this.hatch(g, rect.x, rect.y, rect.w, top - rect.y);
        cut = true;
      }
      if (bottom < rect.y + rect.h) {
        this.hatch(g, rect.x, bottom, rect.w, rect.y + rect.h - bottom);
        cut = true;
      }
      if (cut) out.hatched.push(rect.slot);
      if (view.cursor === mark.draft) {
        g.fillStyle(TEAL, 0.1).fillRoundedRect(rect.x + 1, top - 2, rect.w - 2, bottom - top + 4, 14);
        g.lineStyle(2.5, TEAL, 0.6).strokeRoundedRect(rect.x + 1, top - 2, rect.w - 2, bottom - top + 4, 14);
        if (view.cursorStep !== null) {
          const y = terraceYOfStep(pool.map, view.cursorStep);
          g.fillStyle(TEAL, 0.2).fillRect(rect.x + 3, y - half, rect.w - 6, TERRACE_STEP_PX);
        }
      }
    }
  }

  /** 쓰지 않는 구간의 빗금: 옅은 먹빛 바탕과 테두리와 사선 */
  private hatch(g: Graphics, x: number, y: number, w: number, h: number): void {
    if (w <= 8 || h <= 8) return;
    g.fillStyle(INK, 0.08).fillRoundedRect(x + 3, y + 3, w - 6, h - 6, 10);
    g.lineStyle(2, INK, 0.3).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 10);
    g.lineStyle(2, INK, 0.26);
    for (const [x0, y0, x1, y1] of hatchSegments(x + 9, y + 9, w - 18, h - 18, 12)) g.lineBetween(x0, y0, x1, y1);
  }

  /** 걸어서 밟은 열: 금빛 바탕이 잠깐 비친다(소리를 꺼 두어도 밟았다는 것이 보인다, W-8) */
  private drawFlashes(g: Graphics, pool: InstPool, view: TerraceView | undefined, flashOf: (installationId: string, slot: number) => number, out: DrawnTerrace): void {
    const half = TERRACE_STEP_PX / 2;
    for (const rect of pool.inst.slots) {
      const left = flashOf(pool.inst.installationId, rect.slot);
      if (left <= 0) continue;
      const mark = view?.columns.find((m) => m.column === rect.slot);
      const top = mark ? Math.max(rect.y, terraceYOfStep(pool.map, mark.maxStep) - half) : rect.y;
      const bottom = mark ? Math.min(rect.y + rect.h, terraceYOfStep(pool.map, mark.minStep) + half) : rect.y + rect.h;
      g.fillStyle(GOLD, 0.4 * left).fillRoundedRect(rect.x + 1, top, rect.w - 2, bottom - top, 14);
      g.lineStyle(4, GOLD, left).strokeRoundedRect(rect.x + 1, top, rect.w - 2, bottom - top, 14);
      out.flashing.push(rect.slot);
    }
  }

  // ------------------------------------------------------------------ 덧줄 돌담과 등

  private drawLamps(g: Graphics, pool: InstPool, view: TerraceView, active: boolean, out: DrawnTerrace): void {
    pool.inst.slots.forEach((rect, i) => {
      const mark = view.columns.find((m) => m.column === rect.slot);
      if (!mark || mark.step === null) return;
      const cx = rect.x + rect.w / 2;
      const y = terraceYOfStep(pool.map, mark.step);
      // 보표 밖의 등은 짧은 덧줄 돌담 위에 선다
      for (const step of terraceLedgerSteps(mark.clef, mark.step)) {
        const ly = terraceYOfStep(pool.map, step);
        this.wall(g, cx - LEDGER_HALF, cx + LEDGER_HALF, ly, LEDGER_T);
        g.lineStyle(1.5, TEAL, 0.7).strokeRoundedRect(cx - LEDGER_HALF, ly - LEDGER_T / 2, LEDGER_HALF * 2, LEDGER_T, LEDGER_T / 2);
        out.ledgers.push({ column: mark.column, step, y: ly });
      }
      const selected = active && view.cursor === mark.draft;
      this.drawLamp(g, pool, i, cx, y, mark, selected);
      out.lamps.push({ column: mark.column, draft: mark.draft, step: mark.step, x: cx, y, label: mark.name, accidental: mark.accidental, flagged: mark.flagged, playing: mark.playing, selected });
    });
  }

  /** 등 하나: 지붕, 불빛 창이 난 몸통(가운데가 놓인 높이), 받침. 이름은 자유로 놀 때만 쓰고, 변화표는 왼쪽에 꼬리표로 단다 */
  private drawLamp(g: Graphics, pool: InstPool, i: number, cx: number, y: number, mark: TerraceMark, selected: boolean): void {
    // 듣는 중: 금빛 테두리와 바탕(등 뒤에 깐다)
    if (mark.playing) {
      g.fillStyle(GOLD, 0.38).fillRoundedRect(cx - 33, y - BODY_HALF_H - ROOF_H - 4, 66, BODY_HALF_H * 2 + ROOF_H + BASE_H + 8, 16);
      g.lineStyle(5, GOLD, 1).strokeRoundedRect(cx - 33, y - BODY_HALF_H - ROOF_H - 4, 66, BODY_HALF_H * 2 + ROOF_H + BASE_H + 8, 16);
    }
    g.fillStyle(TEAL, 1).fillTriangle(cx - 18, y - BODY_HALF_H, cx + 18, y - BODY_HALF_H, cx, y - BODY_HALF_H - ROOF_H);
    g.fillStyle(WHITE, 0.97).fillRoundedRect(cx - BODY_HALF_W, y - BODY_HALF_H, BODY_HALF_W * 2, BODY_HALF_H * 2, 9);
    g.lineStyle(3, TEAL, 0.95).strokeRoundedRect(cx - BODY_HALF_W, y - BODY_HALF_H, BODY_HALF_W * 2, BODY_HALF_H * 2, 9);
    g.fillStyle(TEAL, 1).fillRoundedRect(cx - 14, y + BODY_HALF_H, 28, BASE_H, 3);
    if (mark.name === null) g.fillStyle(GOLD, 0.55).fillCircle(cx, y, 9);
    // 고른 열의 등: 굵은 테두리
    if (selected) g.lineStyle(7, TEAL, 1).strokeRoundedRect(cx - BODY_HALF_W - SELECT_PAD - 2, y - BODY_HALF_H - ROOF_H - 3, (BODY_HALF_W + SELECT_PAD + 2) * 2, BODY_HALF_H * 2 + ROOF_H + BASE_H + 6, 14);

    const name = pool.lampNames[i];
    if (name) {
      name.setVisible(mark.name !== null);
      if (mark.name !== null) {
        name.setText(mark.name).setPosition(cx, y + 1);
        name.setScale(Math.min(1, (BODY_HALF_W * 2 - 4) / Math.max(1, name.width)));
      }
    }
    // 변화표 꼬리표: 이름을 쓰지 않을 때(문제를 푸는 중) 등 왼쪽에 단다
    const acc = pool.accs[i];
    if (acc) {
      const glyph = mark.accidental === 'sharp' ? '♯' : mark.accidental === 'flat' ? '♭' : '';
      acc.setVisible(glyph !== '' && mark.name === null);
      if (glyph !== '') acc.setText(glyph).setPosition(cx - BODY_HALF_W - 14, y - 2);
    }
    // 판정이 가리킨 열: 오른쪽 위의 산호색 배지와 '!' 글자
    const bang = pool.bangs[i];
    if (mark.flagged) {
      const bx = cx + BODY_HALF_W + 2;
      const by = y - BODY_HALF_H - 4;
      g.fillStyle(CORAL, 1).fillCircle(bx, by, 11);
      g.lineStyle(2.5, WHITE, 1).strokeCircle(bx, by, 11);
      bang?.setPosition(bx, by + 1).setVisible(true);
    }
    // 듣는 등: 오른쪽 위의 ♪ 글자
    if (mark.playing) pool.notes[i]?.setPosition(cx + BODY_HALF_W + 10, y - BODY_HALF_H - 14).setVisible(true);
  }

  // ------------------------------------------------------------------ 설치물 모드: 고른 자리와 이름표

  /** 고른 열에 등이 없으면 놓을 자리를 점선 고리로 보인다. 등이 있으면 등의 굵은 테두리가 고른 자리를 가리킨다 */
  private drawCursor(g: Graphics, pool: InstPool, view: TerraceView, out: DrawnTerrace): void {
    if (view.cursor === null || view.cursorStep === null) return;
    const mark = view.columns.find((m) => m.draft === view.cursor);
    const rect = mark ? pool.rects.get(mark.column) : undefined;
    if (!mark || !rect) return;
    const cx = rect.x + rect.w / 2;
    const y = terraceYOfStep(pool.map, view.cursorStep);
    const placed = mark.step !== null;
    if (!placed) {
      g.lineStyle(4, TEAL, 1);
      for (const [x0, y0, x1, y1] of dashRingSegments(cx, y, 27, 14)) g.lineBetween(x0, y0, x1, y1);
    }
    out.cursor = { column: mark.column, step: view.cursorStep, y, placed };
  }

  /** 열 이름표: 열 번호 원, 이름(문제를 풀 때는 놓을 음), 두 음자리표를 다루는 밭에서는 음자리표 꼬리. 고른 열은 번호 원을 채운다. 판정이 가리킨 열은 이름표에 배지를 단다 */
  private drawHeaders(g: Graphics, pool: InstPool, view: TerraceView, out: DrawnTerrace): void {
    const twoClefs = pool.map.clefs.length > 1;
    pool.inst.slots.forEach((rect, i) => {
      const mark = view.columns.find((m) => m.column === rect.slot);
      const num = pool.nums[i];
      if (!mark || !num) return;
      const cx = rect.x + rect.w / 2;
      const on = view.cursor === mark.draft;
      const ny = rect.y - HEAD_NUM_DY;
      if (on) g.fillStyle(TEAL, 1).fillCircle(cx, ny, NUM_R + 1);
      else {
        g.fillStyle(WHITE, 0.95).fillCircle(cx, ny, NUM_R);
        g.lineStyle(2, INK, 0.85).strokeCircle(cx, ny, NUM_R);
      }
      num.setText(String(mark.column)).setPosition(cx, ny + 1).setVisible(true);
      if (pool.numWhite[i] !== on) {
        num.setColor(on ? WHITE_CSS : INK_CSS);
        pool.numWhite[i] = on;
      }
      const parts = headerParts(mark.label, mark.clef, twoClefs);
      const name = pool.names[i];
      if (name) {
        name.setText(parts.name).setPosition(cx, rect.y - HEAD_NAME_DY);
        name.setScale(Math.min(1, HEAD_TEXT_W / Math.max(1, name.width))).setVisible(true);
      }
      const tag = pool.tags[i];
      if (tag) {
        tag.setVisible(parts.tag !== null);
        if (parts.tag !== null) tag.setText(parts.tag).setPosition(cx, rect.y - HEAD_TAG_DY);
      }
      // 판정이 가리킨 열: 이름표 오른쪽 위의 배지(등이 없는 열도 알린다)
      if (mark.flagged && mark.step === null) {
        const bx = cx + 38;
        const by = ny;
        g.fillStyle(CORAL, 1).fillCircle(bx, by, 11);
        g.lineStyle(2.5, WHITE, 1).strokeCircle(bx, by, 11);
        pool.bangs[i]?.setPosition(bx, by + 1).setVisible(true);
      }
      out.headers++;
    });
  }

  destroy(): void {
    for (const p of this.pools.values()) for (const list of [p.nums, p.names, p.tags, p.lampNames, p.accs, p.bangs, p.notes]) for (const t of list) t.destroy();
    for (const f of this.fields) for (const pl of f.plaques) for (const t of pl.texts) t.destroy();
    this.pools.clear();
    this.fields.length = 0;
  }
}

/** 점선 고리: 가운데 (cx, cy), 반지름 r, 호를 n조각으로 나눠 한 조각 걸러 긋는다 */
export function dashRingSegments(cx: number, cy: number, r: number, n: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (let k = 0; k < n; k += 2) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    out.push([cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]);
  }
  return out;
}
