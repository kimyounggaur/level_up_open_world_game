// 7-3 건반 다리(T6, 설계서 4.8)를 월드에 그린다: 널 위의 커서와 울리는 널, 흰 널의 이름(아래 띠), 검은 널 위쪽의 이름표 자리 두 줄,
// 말뚝과 밧줄과 그 읽기(도수 · 반음 수), 순서 깃발과 깃발 걸이, 표지판 악보. 널 그림 자체는 바닥에 구워져 있다(world-src/keyBridge.ts, 4-1).
// 그리는 일만 맡는다. 무엇을 그릴지는 화면(설치물 컨트롤러)이 정해 다리(WorldBridge)에 올려 두고(InstallationView.bridge), 여기서는 읽어서 옮겨 그린다.
// 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3). 좌표는 domain/keyBridge의 순수 계산(tagBoxOf, stakeTopOf, flagPoleOf, flagRackSpotOf, signBoardOf)이 정한다.
// 색만으로 뜻을 전하지 않는다:
//   고른 널 = 굵은 테두리와 ▼ 표식 / 울리는 널 = 금빛 테두리와 ♪ 글자 / 이름표 = 상자 안의 글자(빈 자리는 점선 상자와 '올림'·'내림' 글자) /
//   시작 말뚝 = 네모 머리, 끝 말뚝 = 동그란 머리, 밧줄이 지나간 읽기는 글자 / 깃발 = 깃발 천 안의 번호(같은 널의 깃발은 아래로 한 줄씩 내려 서서 번호가 가려지지 않는다) / 판정이 가리킨 자리 = 산호색 배지와 '!' 글자.
// 걷는 중에는 걸린 이름표, 꽂힌 말뚝과 밧줄, 꽂힌 깃발과 표지판 악보만 풍경으로 남고, 널 이름, 빈 이름표 자리, 시작 말뚝, 깃발 걸이, 고른 자리는 설치물 모드에서만 보인다.
import Phaser from 'phaser';
import { FLAG_CLOTH_H, FLAG_CLOTH_W, FLAG_POLE_H, bridgeBounds, flagPoleOf, flagRackSpotOf, flagStackOf, planksOfInstallation, signBoardOf, stakeTopOf, tagBoxOf } from '../../domain/keyBridge';
import type { BridgeBox, BridgeSign, BridgeTask, Plank } from '../../domain/keyBridge';
import type { InstallationDef, SlotRect } from '../../domain/installation';
import type { InstallationView } from '../../platform/bridge';
import { dashedRectSegments } from './hatch';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, TEAL, TEAL_LIGHT, WHITE, WHITE_CSS, WOOD, WOOD_DARK } from './palette';

type Text = Phaser.GameObjects.Text;

/** 그려진 이름표 자리 하나(점검용). 상자는 월드 좌표 */
export interface DrawnBridgeTag {
  draft: number;
  plank: number;
  side: 'raised' | 'lowered';
  /** 걸린 이름표의 글자. 비었으면 null */
  text: string | null;
  selected: boolean;
  flagged: boolean;
  box: BridgeBox;
}

/** 그려진 밧줄 하나(점검용). 말뚝 끝은 월드 좌표. 끝 말뚝이 없으면 to는 null */
export interface DrawnBridgeRope {
  qid: string;
  from: number;
  to: number | null;
  /** 밧줄 곁에 쓴 읽기(예: '3도 · 반음 4개'). 고른 밧줄만 쓴다 */
  text: string | null;
  selected: boolean;
  flagged: boolean;
  a: { x: number; y: number };
  b: { x: number; y: number } | null;
}

/** 그려진 깃발 하나(점검용). x, y는 기둥 아래. plank가 null이면 깃발 걸이에 서 있다. stack은 같은 널의 깃발 가운데 몇 번째인가(0부터, 아래로 한 줄씩 내려 선다) */
export interface DrawnBridgeFlag {
  draft: number;
  order: number;
  plank: number | null;
  stack: number;
  selected: boolean;
  flagged: boolean;
  x: number;
  y: number;
}

/** 그려진 표지판 악보(점검용) */
export interface DrawnBridgeSign {
  board: BridgeBox;
  keySignature: number;
  bars: number;
  notes: number;
  rests: number;
  /** 임시표 기호를 그린 수(조표는 세지 않는다) */
  accidentals: number;
  /** 높은음자리표를 그렸는가 */
  clef: boolean;
}

/** 건반 다리 한 설치물의 그려진 모습(점검용) */
export interface DrawnKeyBridge {
  task: BridgeTask | null;
  free: boolean;
  /** 이름을 쓴 흰 널의 이름들(설치물 모드에서만 쓴다) */
  names: string[];
  /** 고른 널(자리 번호). 설치물 모드에서만 그린다 */
  cursor: number | null;
  /** 울리는 널들(자리 번호) */
  playing: number[];
  /** 이번 프레임에 반짝이는 널들(밟은 널) */
  flashing: number[];
  tags: DrawnBridgeTag[];
  ropes: DrawnBridgeRope[];
  flags: DrawnBridgeFlag[];
  sign: DrawnBridgeSign | null;
}

type Kind = 'name' | 'black' | 'tag' | 'hint' | 'bang' | 'note' | 'pill' | 'num' | 'glyph' | 'small';
const STYLE: Record<Kind, { size: number; color: string }> = {
  name: { size: 17, color: INK_CSS },
  black: { size: 13, color: WHITE_CSS },
  tag: { size: 20, color: INK_CSS },
  hint: { size: 12, color: INK_CSS },
  bang: { size: 20, color: WHITE_CSS },
  note: { size: 22, color: GOLD_TEXT_CSS },
  pill: { size: 16, color: INK_CSS },
  num: { size: 16, color: WHITE_CSS },
  glyph: { size: 18, color: INK_CSS },
  small: { size: 11, color: INK_CSS },
};

/** 표지판 악보: 오선 줄 간격과 한 계단(위치 1)의 높이, 높은음자리표 칸과 조표 한 개의 너비 */
const LINE_GAP = 10;
const STEP_H = LINE_GAP / 2;
const CLEF_W = 44;
const KEY_W = 13;
/** 높은음자리표의 조표 자리(맨 아랫줄 E4가 0): 올림표는 F C G D A E B, 내림표는 B E A D G C F 차례다 */
const SHARP_POSITIONS = [8, 5, 9, 6, 3, 7, 4] as const;
const FLAT_POSITIONS = [4, 7, 3, 6, 2, 5, 1] as const;
const ACCIDENTAL_GLYPH = { sharp: '♯', flat: '♭', natural: '♮' } as const;

/** 글자를 쌓아 두었다가 프레임마다 돌려 쓴다: 종류별로 한 줄에 선 글자 목록을 두고, 쓴 만큼만 보이게 한다 */
class TextPool {
  private readonly items = new Map<Kind, Text[]>();
  private readonly used = new Map<Kind, number>();
  private readonly res: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    this.res = Math.min(3, Math.max(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2));
  }

  begin(): void {
    this.used.clear();
  }

  put(kind: Kind, content: string, x: number, y: number): Text {
    let list = this.items.get(kind);
    if (!list) {
      list = [];
      this.items.set(kind, list);
    }
    const n = this.used.get(kind) ?? 0;
    this.used.set(kind, n + 1);
    let t = list[n];
    if (!t) {
      const st = STYLE[kind];
      t = this.scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: `${st.size}px`, fontStyle: 'bold', color: st.color })
        .setOrigin(0.5, 0.5)
        .setResolution(this.res)
        .setDepth(this.depth + 1);
      list.push(t);
    }
    return t.setText(content).setPosition(x, y).setVisible(true);
  }

  end(): void {
    for (const [kind, list] of this.items) for (let i = this.used.get(kind) ?? 0; i < list.length; i++) list[i]!.setVisible(false);
  }

  destroy(): void {
    for (const list of this.items.values()) for (const t of list) t.destroy();
    this.items.clear();
    this.used.clear();
  }
}

interface Site {
  planks: Array<Plank & { rect: SlotRect }>;
  frame: BridgeBox;
}

const EMPTY_OUT = (): DrawnKeyBridge => ({ task: null, free: false, names: [], cursor: null, playing: [], flashing: [], tags: [], ropes: [], flags: [], sign: null });

export class KeyBridgeLayer {
  private readonly sites = new Map<string, Site>();
  private readonly pool: TextPool;

  constructor(
    scene: Phaser.Scene,
    installations: readonly InstallationDef[],
    depth: number,
  ) {
    this.pool = new TextPool(scene, depth);
    for (const inst of installations) {
      const planks = planksOfInstallation(inst);
      // 널 자리가 변환표와 맞지 않는 설치물은 그리지 않는다(콘텐츠 검사가 먼저 막는다)
      if (planks.length === 0 || planks.length !== inst.slots.length) continue;
      this.sites.set(inst.installationId, { planks, frame: bridgeBounds(inst) });
    }
  }

  /** 건반 다리 설치물인가(이 층이 그린다) */
  has(installationId: string): boolean {
    return this.sites.has(installationId);
  }

  /**
   * 건반 다리들을 모두 그린다. gOf는 다리에 맞는 그래픽(설치물 층의 그래픽이거나, 화면 밖이면 아무것도 그리지 않는 그래픽)을 돌려준다. flashLeft는 밟은 널의 남은 반짝임(1에서 0으로)이다.
   * 걷는 중(active가 아님)에는 걸린 이름표, 꽂힌 말뚝과 밧줄, 꽂힌 깃발, 표지판 악보만 그린다.
   */
  drawAll(gOf: (installationId: string) => Phaser.GameObjects.Graphics, views: readonly InstallationView[], activeId: string | null, flashLeft: (installationId: string, slot: number) => number): Map<string, DrawnKeyBridge> {
    const out = new Map<string, DrawnKeyBridge>();
    this.pool.begin();
    for (const [id, site] of this.sites) {
      const view = views.find((v) => v.installationId === id);
      out.set(id, this.drawOne(gOf(id), site, view, activeId === id, (slot) => flashLeft(id, slot)));
    }
    this.pool.end();
    return out;
  }

  private drawOne(g: Phaser.GameObjects.Graphics, site: Site, view: InstallationView | undefined, active: boolean, flashLeft: (slot: number) => number): DrawnKeyBridge {
    const bridge = view?.bridge;
    const out = EMPTY_OUT();
    out.task = bridge?.task ?? null;
    out.free = bridge?.free ?? false;
    const plankOf = (slot: number): (Plank & { rect: SlotRect }) | undefined => site.planks.find((p) => p.slot === slot);

    // 널 위의 표시: 흰 널을 먼저, 검은 널을 나중에(검은 널이 흰 널 위에 선다)
    for (const black of [false, true]) {
      for (const p of site.planks) {
        if (p.black !== black) continue;
        const fl = flashLeft(p.slot);
        if (fl > 0) out.flashing.push(p.slot);
        const playing = !!bridge && bridge.playing.includes(p.slot);
        if (playing) out.playing.push(p.slot);
        this.drawPlankMarks(g, p, fl, playing, active && bridge?.cursor === p.slot);
        if (active && bridge?.cursor === p.slot) out.cursor = p.slot;
        const mark = view?.slots.find((s) => s.slot === p.slot);
        if (active && !p.black) {
          this.pool.put('name', p.name, p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h + 21);
          out.names.push(p.name);
        } else if (active && p.black && out.free && mark?.name) {
          // 자유로 놀 때만 검은 널의 이름도 쓴다(문제를 푸는 중에는 밝히지 않는다, 4.8)
          this.pool.put('black', mark.name, p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h - 22);
        }
      }
    }
    if (!bridge) return out;

    // 이름표 자리
    for (const t of bridge.tags) {
      const p = plankOf(t.plank);
      if (!p) continue;
      const hung = t.text !== null;
      if (!hung && !active) continue;
      const box = tagBoxOf(p.rect, t.side);
      this.drawTag(g, box, t.text, t.side, active && t.selected, t.flagged);
      out.tags.push({ draft: t.draft, plank: t.plank, side: t.side, text: t.text, selected: active && t.selected, flagged: t.flagged, box });
    }

    // 밧줄과 말뚝: 고르지 않은 것을 먼저, 고른 것을 나중에 그린다(위에 쌓인다)
    const ropes = [...bridge.ropes].sort((a, b) => Number(a.selected) - Number(b.selected));
    for (const r of ropes) {
      const from = plankOf(r.from);
      if (!from) continue;
      const to = r.to !== null ? plankOf(r.to) : undefined;
      if (!to && !active) continue;
      const a = stakeTopOf(from.rect);
      const b = to ? stakeTopOf(to.rect) : null;
      const selected = active && r.selected;
      this.drawRope(g, from.rect, to ? to.rect : null, a, b, selected, r.flagged);
      const text = selected && b ? r.text : null;
      if (text && b) this.drawPill(g, (a.x + b.x) / 2, a.y - 30, text);
      out.ropes.push({ qid: r.qid, from: r.from, to: to ? r.to : null, text, selected, flagged: r.flagged, a, b });
    }

    // 깃발과 깃발 걸이, 표지판 악보
    if (bridge.task === 'flags') {
      const count = bridge.flags.length;
      const racked = bridge.flags.filter((f) => f.plank === null);
      if (active && racked.length > 0) this.drawRackShelf(g, site.frame, count);
      for (const f of bridge.flags) {
        const p = f.plank !== null ? plankOf(f.plank) : undefined;
        if (!p && !active) continue;
        // 같은 널에 여럿이 꽂히면 번호가 작은 것부터 널 아래쪽으로 한 줄씩 내려 서서 서로의 번호를 가리지 않는다
        const stack = p ? flagStackOf(bridge.flags, f) : 0;
        const base = p ? flagPoleOf(p.rect, stack).base : flagRackSpotOf(site.frame, count, f.order);
        const selected = active && f.selected;
        this.drawFlag(g, base, f.order, selected, f.flagged);
        out.flags.push({ draft: f.draft, order: f.order, plank: p ? f.plank : null, stack, selected, flagged: f.flagged, x: base.x, y: base.y });
      }
      if (bridge.sign) out.sign = this.drawSign(g, signBoardOf(site.frame, count), bridge.sign);
    }
    return out;
  }

  // ------------------------------------------------------------------ 널 위의 표시

  /** 밟아서 반짝이는 널, 울리는 널, 고른 널. 널 그림은 바닥에 있으므로 겹쳐 얹는 표시만 한다 */
  private drawPlankMarks(g: Phaser.GameObjects.Graphics, p: Plank & { rect: SlotRect }, flashLeft: number, playing: boolean, selected: boolean): void {
    const r = p.rect;
    const cx = r.x + r.w / 2;
    if (flashLeft > 0) {
      g.fillStyle(GOLD, 0.4 * flashLeft).fillRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 6);
      g.lineStyle(4, GOLD, flashLeft).strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 6);
    }
    if (playing) {
      g.fillStyle(GOLD, 0.38).fillRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 6);
      g.lineStyle(6, GOLD, 1).strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 6);
      this.pool.put('note', '♪', cx, r.y + r.h - 28);
    }
    if (selected) {
      g.lineStyle(8, TEAL, 1).strokeRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 8);
      g.fillStyle(TEAL, 1).fillTriangle(cx - 11, r.y + 8, cx + 11, r.y + 8, cx, r.y + 26);
    }
  }

  // ------------------------------------------------------------------ 이름표

  private drawTag(g: Phaser.GameObjects.Graphics, box: BridgeBox, text: string | null, side: 'raised' | 'lowered', selected: boolean, flagged: boolean): void {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (text !== null) {
      g.fillStyle(TEAL_LIGHT, 0.95).fillRoundedRect(box.x, box.y, box.w, box.h, 8);
      g.lineStyle(3, TEAL, 0.95).strokeRoundedRect(box.x, box.y, box.w, box.h, 8);
      this.pool.put('tag', text, cx, cy + 1);
    } else {
      g.fillStyle(WHITE, 0.72).fillRoundedRect(box.x, box.y, box.w, box.h, 8);
      g.lineStyle(2, TEAL, 0.65);
      for (const [x0, y0, x1, y1] of dashedRectSegments(box.x, box.y, box.w, box.h, 6, 4)) g.lineBetween(x0, y0, x1, y1);
      this.pool.put('hint', side === 'raised' ? '올림' : '내림', cx, cy + 1);
    }
    if (selected) g.lineStyle(6, TEAL, 1).strokeRoundedRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6, 10);
    if (flagged) this.drawBadge(g, box.x + box.w - 2, box.y + 2, 12);
  }

  /** 판정이 가리킨 자리: 산호색 배지와 '!' 글자(색만으로 전하지 않는다) */
  private drawBadge(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    g.fillStyle(CORAL, 1).fillCircle(x, y, r);
    g.lineStyle(2.5, WHITE, 1).strokeCircle(x, y, r);
    this.pool.put('bang', '!', x, y + 1).setScale(r / 14);
  }

  // ------------------------------------------------------------------ 말뚝과 밧줄

  private drawRope(g: Phaser.GameObjects.Graphics, fromRect: SlotRect, toRect: SlotRect | null, a: { x: number; y: number }, b: { x: number; y: number } | null, selected: boolean, flagged: boolean): void {
    // 밧줄: 두 말뚝 끝 사이에 늘어진 줄
    if (b) {
      g.lineStyle(selected ? 5 : 3, WOOD, selected ? 1 : 0.8);
      g.beginPath();
      const sag = 16;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t + sag * 4 * t * (1 - t);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
    // 시작 말뚝은 네모 머리, 끝 말뚝은 동그란 머리
    this.drawStake(g, fromRect, a, 'square', selected);
    if (toRect && b) this.drawStake(g, toRect, b, 'round', selected);
    if (flagged && b) this.drawBadge(g, b.x + 14, b.y - 14, 12);
  }

  private drawStake(g: Phaser.GameObjects.Graphics, rect: SlotRect, top: { x: number; y: number }, head: 'square' | 'round', selected: boolean): void {
    g.lineStyle(5, WOOD_DARK, 1).lineBetween(top.x, rect.y, top.x, top.y);
    g.fillStyle(head === 'square' ? TEAL : INK, 1);
    if (head === 'square') g.fillRect(top.x - 7, top.y - 7, 14, 14);
    else g.fillCircle(top.x, top.y, 8);
    if (selected) g.lineStyle(3, WHITE, 1).strokeCircle(top.x, top.y, head === 'square' ? 11 : 10);
    // 말뚝 아래에 작은 그림자: 널에 박힌 자리
    g.fillStyle(INK, 0.28).fillEllipse(top.x, rect.y + 2, 18, 6);
  }

  /** 밧줄이 지나간 읽기: 둥근 상자에 '3도 · 반음 4개' */
  private drawPill(g: Phaser.GameObjects.Graphics, x: number, y: number, text: string): void {
    const t = this.pool.put('pill', text, x, y + 1);
    const w = t.width + 24;
    g.fillStyle(WHITE, 0.95).fillRoundedRect(x - w / 2, y - 14, w, 28, 14);
    g.lineStyle(2.5, TEAL, 0.9).strokeRoundedRect(x - w / 2, y - 14, w, 28, 14);
  }

  // ------------------------------------------------------------------ 깃발

  private drawRackShelf(g: Phaser.GameObjects.Graphics, frame: BridgeBox, count: number): void {
    const first = flagRackSpotOf(frame, count, 1);
    const last = flagRackSpotOf(frame, count, count);
    g.fillStyle(WOOD, 1).fillRoundedRect(first.x - 24, first.y, last.x - first.x + 48, 8, 4);
    g.lineStyle(1.5, WOOD_DARK, 0.9).strokeRoundedRect(first.x - 24, first.y, last.x - first.x + 48, 8, 4);
  }

  /** 깃발 하나: 기둥과 천, 천 안의 번호. 고른 깃발은 천 둘레의 굵은 테두리가 함께 있다 */
  private drawFlag(g: Phaser.GameObjects.Graphics, base: { x: number; y: number }, order: number, selected: boolean, flagged: boolean): void {
    const topY = base.y - FLAG_POLE_H;
    g.lineStyle(4, WOOD_DARK, 1).lineBetween(base.x, base.y, base.x, topY);
    g.fillStyle(TEAL, 1).fillRoundedRect(base.x, topY, FLAG_CLOTH_W, FLAG_CLOTH_H, 4);
    g.lineStyle(2, INK, 0.9).strokeRoundedRect(base.x, topY, FLAG_CLOTH_W, FLAG_CLOTH_H, 4);
    this.pool.put('num', String(order), base.x + FLAG_CLOTH_W / 2, topY + FLAG_CLOTH_H / 2 + 1);
    if (selected) g.lineStyle(5, GOLD, 1).strokeRoundedRect(base.x - 4, topY - 4, FLAG_CLOTH_W + 8, FLAG_CLOTH_H + 8, 7);
    if (flagged) this.drawBadge(g, base.x + FLAG_CLOTH_W + 4, topY - 2, 11);
  }

  // ------------------------------------------------------------------ 표지판 악보

  /**
   * 표지판 악보: 오선과 높은음자리표, 조표, 마디선, 음표와 쉼표와 임시표. 음이름은 쓰지 않는다(정답을 글로 알려 주지 않는다, 4.8).
   * 오선 위치는 맨 아랫줄(E4)이 0이고 한 계단이 반 칸이다.
   */
  private drawSign(g: Phaser.GameObjects.Graphics, board: BridgeBox, sign: BridgeSign): DrawnBridgeSign {
    g.fillStyle(WHITE, 0.97).fillRoundedRect(board.x, board.y, board.w, board.h, 10);
    g.lineStyle(3, INK, 0.9).strokeRoundedRect(board.x, board.y, board.w, board.h, 10);
    const left = board.x + 12;
    const right = board.x + board.w - 12;
    const bottom = board.y + board.h - 22;
    const yOf = (position: number): number => bottom - position * STEP_H;
    g.lineStyle(1.8, INK, 0.9);
    for (let line = 0; line < 5; line++) g.lineBetween(left, yOf(line * 2), right, yOf(line * 2));
    // 높은음자리표: 줄기와 G 줄(아래서 둘째 줄)을 감싸는 고리
    const clefX = left + 16;
    g.lineStyle(2.5, INK, 1).lineBetween(clefX, yOf(10), clefX, yOf(-2));
    g.strokeCircle(clefX, yOf(2), 8);
    // 조표
    const n = Math.abs(sign.keySignature);
    const glyph = sign.keySignature >= 0 ? '♯' : '♭';
    const table = sign.keySignature >= 0 ? SHARP_POSITIONS : FLAT_POSITIONS;
    for (let i = 0; i < Math.min(n, 7); i++) this.pool.put('glyph', glyph, left + CLEF_W + i * KEY_W, yOf(table[i]!));
    // 마디: 조표 다음부터 오른쪽 끝까지를 마디 수로 나눈다
    const barsLeft = left + CLEF_W + n * KEY_W + 10;
    const barW = sign.bars.length > 0 ? (right - barsLeft) / sign.bars.length : 0;
    let notes = 0;
    let rests = 0;
    let accidentals = 0;
    sign.bars.forEach((bar, bi) => {
      const x0 = barsLeft + bi * barW;
      bar.forEach((note, ni) => {
        const x = x0 + ((ni + 0.5) * barW) / Math.max(1, bar.length);
        if (note.rest) {
          rests++;
          g.fillStyle(INK, 1).fillRect(x - 7, yOf(4) - 3, 14, 6);
          return;
        }
        notes++;
        const y = yOf(note.position);
        // 덧줄: 오선 아래(C4 이하)와 위(A5 이상)
        g.lineStyle(1.8, INK, 0.9);
        for (let p = -2; p >= note.position; p -= 2) g.lineBetween(x - 11, yOf(p), x + 11, yOf(p));
        for (let p = 10; p <= note.position; p += 2) g.lineBetween(x - 11, yOf(p), x + 11, yOf(p));
        // 음표 머리: 한 박 이하는 채우고 두 박 이상은 비운다. 네 박은 줄기가 없다
        if (note.beats >= 2) {
          g.fillStyle(WHITE, 1).fillEllipse(x, y, 13, 10);
          g.lineStyle(2, INK, 1).strokeEllipse(x, y, 13, 10);
        } else g.fillStyle(INK, 1).fillEllipse(x, y, 13, 10);
        if (note.beats < 4) {
          const up = note.position < 6;
          g.lineStyle(2, INK, 1).lineBetween(up ? x + 6 : x - 6, y, up ? x + 6 : x - 6, up ? y - 28 : y + 28);
        }
        if (!Number.isInteger(Math.log2(note.beats))) g.fillStyle(INK, 1).fillCircle(x + 11, y - 2, 2.2);
        if (note.accidental) {
          accidentals++;
          this.pool.put('glyph', ACCIDENTAL_GLYPH[note.accidental], x - 14, y);
        }
      });
      // 마디선
      g.lineStyle(1.8, INK, 0.9).lineBetween(x0 + barW, yOf(8), x0 + barW, yOf(0));
    });
    return { board, keySignature: sign.keySignature, bars: sign.bars.length, notes, rests, accidentals, clef: true };
  }

  destroy(): void {
    this.pool.destroy();
    this.sites.clear();
  }
}
