// 6-6 물레방아(T3, 설계서 4.5)의 바퀴를 월드에 그린다. 바퀴는 펼친 띠(징검다리 줄, timelineLayer.ts)와 같은 초안을 다른 모양으로 보여 준다:
// 화면(설치물 컨트롤러)이 다리(WorldBridge)에 올린 같은 TimelineView를 읽어 못, 빈 구멍, 놓으려는 자리, 듣는 중의 위치를 옮겨 그린다.
// 그래서 바퀴와 띠는 같은 초안이다(12.9). 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3).
// 색만으로 뜻을 전하지 않는다:
//   울림 못 = 음 이름 글자 / 이끼 못(쉼표) = 방사 무늬와 '쉼' 글자 / 점이 붙은 못 = 끝의 점 /
//   큰 박 = 테두리의 무늬(첫째 줄무늬, 둘째 점무늬)와 큰 박 번호, 큰 박의 경계는 굵은 살 /
//   빈 구멍 = 어두운 구멍, 판정이 알리면 산호색 테두리와 '!' 배지 /
//   놓으려는 자리 = 놓을 수 있으면 ▼, 놓을 수 없으면 × 표시 / 듣는 못 = 금빛 테두리와 ♪ 글자(이끼 못은 소리가 없어 테두리만).
// 듣는 동안 바퀴는 반시계 방향으로 한 마디에 한 바퀴를 돈다. 12시에 선 방망이 아래로 칸이 차례로 온다. 움직임 줄이기에서는 돌지 않고 듣는 못만 금빛이 된다(W-8).
// 글자는 바퀴와 함께 자리만 돌고 늘 바로 선다.
import Phaser from 'phaser';
import type { InstallationDef } from '../../domain/installation';
import type { CursorMark, TimelineView } from '../../domain/timelineStones';
import { tickToDeg, wheelBeats, wheelOf, wheelPoint, wheelTurnDeg } from '../../domain/waterwheel';
import type { WheelBeat, WheelGeometry } from '../../domain/waterwheel';
import type { InstallationView } from '../../platform/bridge';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, MOSS, MOSS_DARK_CSS, MOSS_LIGHT, TEAL, TEAL_LIGHT, WHITE, WHITE_CSS } from './palette';

/** 바퀴의 나무빛: 테두리와 살(짙게), 못이 놓이는 고리(옅게) */
const WOOD_DARK = 0x8a6a3b;
const WOOD = 0xd9c08a;
const WOOD_LIGHT = 0xeddcb8;
/** 못의 양끝을 안쪽으로 줄이는 각도(도): 이웃한 못 사이가 띄워져 보인다 */
const NAIL_GAP_DEG = 2;
/** 못이 고리 안쪽과 바깥쪽에서 남기는 여백(px) */
const NAIL_MARGIN = 10;
const MAX_BEATS = 4;

/** 그려진 못 하나(점검용). startDeg, endDeg는 바퀴가 돌지 않았을 때의 자리(12시에서 시계 방향) */
export interface DrawnNail {
  startTick: number;
  endTick: number;
  kind: 'note' | 'rest';
  /** 못에 쓴 글자: 울림 못은 음 이름, 이끼 못은 '쉼' */
  label: string;
  dotted: boolean;
  flagged: boolean;
  playing: boolean;
  startDeg: number;
  endDeg: number;
}

/** 바퀴의 그려진 모습(점검용) */
export interface DrawnWheel {
  cx: number;
  cy: number;
  r: number;
  /** 칸(못 구멍)의 수 */
  cells: number;
  /** 듣는 중 바퀴가 돈 각도(도). 듣지 않거나 움직임 줄이기에서는 0이다 */
  turnDeg: number;
  nails: DrawnNail[];
  /** 못이 덮지 않은 칸의 번호(1부터) */
  holes: number[];
  /** 판정이 알린 빈 구멍(산호색 테두리와 '!')의 칸 번호 */
  flaggedHoles: number[];
  /** 큰 박의 구간과 무늬 */
  beats: Array<Pick<WheelBeat, 'beat' | 'fromTick' | 'toTick' | 'pattern'>>;
  cursor: { startTick: number; endTick: number; kind: CursorMark['kind']; ok: boolean } | null;
  playTick: number | null;
  /** 칸 번호와 큰 박 번호를 달았는가(설치물 모드에서만) */
  numbered: boolean;
  /** 12시의 방망이를 그렸는가(설치물 모드이거나 듣는 중) */
  clapper: boolean;
}

type Text = Phaser.GameObjects.Text;

interface WheelPool {
  wheel: WheelGeometry;
  names: Text[];
  rests: Text[];
  bangs: Text[];
  notes: Text[];
  cellNums: Text[];
  beatNums: Text[];
}

const hide = (list: readonly Text[]): void => {
  for (const t of list) t.setVisible(false);
};

export class WheelLayer {
  private readonly pools = new Map<string, WheelPool>();

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
      const wheel = wheelOf(inst);
      if (!wheel) continue;
      const many = (n: number, make: (i: number) => Text): Text[] => Array.from({ length: n }, (_, i) => make(i));
      this.pools.set(inst.installationId, {
        wheel,
        names: many(wheel.cells, () => text('', 26, INK_CSS)),
        rests: many(wheel.cells, () => text('쉼', 22, MOSS_DARK_CSS)),
        bangs: many(wheel.cells * 2, () => text('!', 22, WHITE_CSS)),
        notes: many(wheel.cells, () => text('♪', 24, GOLD_TEXT_CSS)),
        cellNums: many(wheel.cells, (i) => text(String(i + 1), 17, INK_CSS)),
        beatNums: many(MAX_BEATS, () => text('', 18, INK_CSS)),
      });
    }
  }

  /** 물레방아(바퀴가 있는 설치물)인가(이 층이 그린다) */
  has(installationId: string): boolean {
    return this.pools.has(installationId);
  }

  /**
   * 바퀴를 그린다. g는 설치물 층의 그래픽(같은 깊이에 쌓는다). view가 아직 없으면 빈 바퀴를 그린다.
   * active는 설치물 모드(칸 번호, 큰 박 번호, 놓으려는 자리, 방망이가 보인다), reduce는 움직임 줄이기다.
   */
  draw(g: Phaser.GameObjects.Graphics, inst: InstallationDef, view: InstallationView | undefined, active: boolean, reduce: boolean): DrawnWheel | null {
    const pool = this.pools.get(inst.installationId);
    if (!pool) return null;
    for (const list of [pool.names, pool.rests, pool.bangs, pool.notes, pool.cellNums, pool.beatNums]) hide(list);
    const w = pool.wheel;
    const tl: TimelineView | undefined = view?.timeline;
    const measureTicks = tl?.measureTicks ?? w.turnTicks;
    const beatTicks = tl?.beatTicks ?? w.turnTicks / 2;
    const playTick = tl?.playTick ?? null;
    // 듣는 중에만 돌고, 움직임 줄이기에서는 돌지 않는다(듣는 못은 그대로 금빛이다)
    const turn = reduce ? 0 : wheelTurnDeg(w, playTick);
    const beats = wheelBeats(w, beatTicks, measureTicks).slice(0, MAX_BEATS);
    const out: DrawnWheel = {
      cx: w.cx,
      cy: w.cy,
      r: w.r,
      cells: w.cells,
      turnDeg: turn,
      nails: [],
      holes: [],
      flaggedHoles: [],
      beats: beats.map((b) => ({ beat: b.beat, fromTick: b.fromTick, toTick: b.toTick, pattern: b.pattern })),
      cursor: null,
      playTick,
      numbered: false,
      clapper: false,
    };
    const at = (deg: number, radius: number): { x: number; y: number } => wheelPoint(w, deg - turn, radius);

    this.drawBody(g, w, beats, at);
    this.drawSpokes(g, w, beatTicks, at);
    this.drawHub(g, w);
    this.drawHoles(g, w, tl, pool, out, at);
    if (tl) this.drawNails(g, w, tl, pool, out, at);
    if (active && tl?.cursor) {
      this.drawCursor(g, w, tl.cursor, at);
      out.cursor = { startTick: tl.cursor.startTick, endTick: tl.cursor.endTick, kind: tl.cursor.kind, ok: tl.cursor.ok };
    }
    if (active) {
      this.drawNumbers(g, w, beats, pool, at);
      out.numbered = true;
    }
    if (active || playTick !== null) {
      this.drawClapper(g, w);
      out.clapper = true;
    }
    return out;
  }

  // ------------------------------------------------------------------ 바닥: 몸통, 큰 박의 무늬, 살, 허브

  /** 부채꼴 고리(안쪽 반지름 rIn, 바깥쪽 rOut, 각도 a0–a1)를 길로 만든다. dx, dy는 그림자를 위한 옮김 */
  private sector(g: Phaser.GameObjects.Graphics, at: (deg: number, radius: number) => { x: number; y: number }, a0: number, a1: number, rIn: number, rOut: number, dx = 0, dy = 0): void {
    const steps = Math.max(2, Math.ceil((a1 - a0) / 4));
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = at(a0 + ((a1 - a0) * i) / steps, rOut);
      if (i === 0) g.moveTo(p.x + dx, p.y + dy);
      else g.lineTo(p.x + dx, p.y + dy);
    }
    for (let i = steps; i >= 0; i--) {
      const p = at(a0 + ((a1 - a0) * i) / steps, rIn);
      g.lineTo(p.x + dx, p.y + dy);
    }
    g.closePath();
  }

  /** 몸통(테두리와 고리 바닥)과 테두리의 큰 박 무늬: 첫째 큰 박은 줄무늬, 둘째는 점무늬. 색이 아니라 무늬로 구분한다 */
  private drawBody(g: Phaser.GameObjects.Graphics, w: WheelGeometry, beats: readonly WheelBeat[], at: (deg: number, radius: number) => { x: number; y: number }): void {
    g.fillStyle(INK, 0.16).fillCircle(w.cx + 7, w.cy + 9, w.r);
    g.fillStyle(WOOD_DARK, 1).fillCircle(w.cx, w.cy, w.r);
    g.fillStyle(WOOD_LIGHT, 1).fillCircle(w.cx, w.cy, w.rimIn);
    for (const b of beats) {
      // 고리 바닥: 큰 박마다 옅음과 보통으로 번갈아 칠한다(무늬와 번호가 함께 구분한다)
      g.fillStyle(b.pattern === 'stripes' ? WOOD_LIGHT : WOOD, 1);
      this.sector(g, at, b.fromDeg, b.toDeg, w.hubR, w.rimIn);
      g.fillPath();
      // 테두리 무늬
      const rimMid = (w.rimIn + w.r) / 2;
      if (b.pattern === 'stripes') {
        g.lineStyle(2.5, INK, 0.6);
        for (let a = b.fromDeg + 3; a < b.toDeg; a += 6) {
          const p0 = at(a, w.rimIn + 2);
          const p1 = at(a, w.r - 2);
          g.lineBetween(p0.x, p0.y, p1.x, p1.y);
        }
      } else {
        g.fillStyle(INK, 0.65);
        for (let a = b.fromDeg + 4.5; a < b.toDeg; a += 9) {
          const p = at(a, rimMid);
          g.fillCircle(p.x, p.y, 3.4);
        }
      }
    }
    g.lineStyle(4, INK, 0.9).strokeCircle(w.cx, w.cy, w.r);
    g.lineStyle(2, INK, 0.5).strokeCircle(w.cx, w.cy, w.rimIn);
  }

  /** 살: 칸의 경계마다 허브에서 테두리까지. 큰 박의 경계는 굵다 */
  private drawSpokes(g: Phaser.GameObjects.Graphics, w: WheelGeometry, beatTicks: number, at: (deg: number, radius: number) => { x: number; y: number }): void {
    for (let i = 0; i < w.cells; i++) {
      const tick = i * w.cellTicks;
      const big = tick % beatTicks === 0;
      g.lineStyle(big ? 6 : 2.5, big ? WOOD_DARK : INK, big ? 0.95 : 0.35);
      const p0 = at(tickToDeg(w, tick), w.hubR);
      const p1 = at(tickToDeg(w, tick), w.rimIn);
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  }

  private drawHub(g: Phaser.GameObjects.Graphics, w: WheelGeometry): void {
    g.fillStyle(WOOD_DARK, 1).fillCircle(w.cx, w.cy, w.hubR);
    g.lineStyle(3, INK, 0.9).strokeCircle(w.cx, w.cy, w.hubR);
    g.fillStyle(WOOD_LIGHT, 1).fillCircle(w.cx, w.cy, w.hubR * 0.38);
    g.lineStyle(2, INK, 0.7).strokeCircle(w.cx, w.cy, w.hubR * 0.38);
  }

  // ------------------------------------------------------------------ 빈 구멍

  /** 못이 덮지 않은 칸마다 어두운 구멍. 마디가 덜 채워졌다고 판정이 알렸으면 산호색 테두리와 '!' 배지가 붙는다 */
  private drawHoles(g: Phaser.GameObjects.Graphics, w: WheelGeometry, tl: TimelineView | undefined, pool: WheelPool, out: DrawnWheel, at: (deg: number, radius: number) => { x: number; y: number }): void {
    const stones = tl?.stones ?? [];
    let bangAt = 0;
    for (let k = 1; k <= w.cells; k++) {
      const from = (k - 1) * w.cellTicks;
      const to = k * w.cellTicks;
      if (stones.some((s) => s.startTick < to && s.endTick > from)) continue;
      out.holes.push(k);
      const mid = tickToDeg(w, (from + to) / 2);
      const p = at(mid, (w.ringIn + w.ringOut) / 2);
      const emphasised = !!tl && (tl.waterEmphasis || tl.water.some((m) => m.flagged && m.from < to && m.to > from));
      g.fillStyle(INK, 0.5).fillCircle(p.x, p.y, 17);
      g.lineStyle(3, WOOD_DARK, 1).strokeCircle(p.x, p.y, 17);
      if (emphasised) {
        out.flaggedHoles.push(k);
        g.lineStyle(5, CORAL, 1).strokeCircle(p.x, p.y, 24);
        const bx = p.x + 17;
        const by = p.y - 17;
        g.fillStyle(CORAL, 1).fillCircle(bx, by, 11);
        g.lineStyle(2, WHITE, 1).strokeCircle(bx, by, 11);
        const t = pool.bangs[pool.wheel.cells + bangAt++];
        if (t) t.setPosition(bx, by + 1).setScale(0.7).setVisible(true);
      }
    }
  }

  // ------------------------------------------------------------------ 못

  private drawNails(g: Phaser.GameObjects.Graphics, w: WheelGeometry, tl: TimelineView, pool: WheelPool, out: DrawnWheel, at: (deg: number, radius: number) => { x: number; y: number }): void {
    const rIn = w.ringIn + NAIL_MARGIN;
    const rOut = w.ringOut - NAIL_MARGIN;
    const rMid = (rIn + rOut) / 2;
    let nameAt = 0;
    let restAt = 0;
    let bangAt = 0;
    let noteAt = 0;
    for (const s of tl.stones) {
      const startDeg = tickToDeg(w, s.startTick);
      const endDeg = tickToDeg(w, s.endTick);
      const a0 = startDeg + NAIL_GAP_DEG;
      const a1 = endDeg - NAIL_GAP_DEG;
      if (a1 <= a0) continue;
      const mid = (startDeg + endDeg) / 2;
      this.sector(g, at, a0, a1, rIn, rOut, 2, 4);
      g.fillStyle(INK, 0.14).fillPath();
      if (s.kind === 'note') {
        g.fillStyle(TEAL_LIGHT, 0.97);
        this.sector(g, at, a0, a1, rIn, rOut);
        g.fillPath();
        g.lineStyle(3, TEAL, 0.95).strokePath();
      } else {
        // 이끼 못: 이끼 바탕에 방사 무늬와 '쉼' 글자
        g.fillStyle(MOSS_LIGHT, 0.97);
        this.sector(g, at, a0, a1, rIn, rOut);
        g.fillPath();
        g.lineStyle(2, MOSS, 0.45);
        for (let a = a0 + 3.5; a < a1 - 1; a += 7) {
          const p0 = at(a, rIn + 4);
          const p1 = at(a, rOut - 4);
          g.lineBetween(p0.x, p0.y, p1.x, p1.y);
        }
        this.sector(g, at, a0, a1, rIn, rOut);
        g.lineStyle(3, MOSS, 0.95).strokePath();
      }
      if (s.playing) {
        this.sector(g, at, a0, a1, rIn - 2, rOut + 2);
        g.fillStyle(GOLD, 0.38).fillPath();
        g.lineStyle(6, GOLD, 1).strokePath();
      }
      const label = s.kind === 'note' ? (s.name ?? '') : '쉼';
      const c = at(mid, rMid);
      const t = s.kind === 'note' ? pool.names[nameAt++] : pool.rests[restAt++];
      if (t) {
        if (s.kind === 'note') t.setText(label);
        t.setPosition(c.x, c.y);
        // 좁은 못에는 글자를 줄여 넣는다: 못의 호 길이(중간 반지름 기준)에 맞춘다
        const arc = ((a1 - a0) * Math.PI * rMid) / 180;
        t.setScale(Math.min(1, Math.max(0.5, (arc - 12) / Math.max(1, t.width))));
        t.setVisible(true);
      }
      // 점이 붙은 못: 끝쪽의 점
      if (s.dotted && a1 - a0 >= 30) {
        const d = at(a1 - 6, rMid);
        g.fillStyle(INK, 0.95).fillCircle(d.x, d.y, 4.5);
      }
      // 판정이 가리킨 못: 시작쪽의 산호색 배지와 '!' 글자
      if (s.flagged) {
        const b = at(a0 + 7, rOut - 4);
        g.fillStyle(CORAL, 1).fillCircle(b.x, b.y, 13);
        g.lineStyle(2.5, WHITE, 1).strokeCircle(b.x, b.y, 13);
        const bang = pool.bangs[bangAt++];
        if (bang) bang.setPosition(b.x, b.y + 1).setScale(0.8).setVisible(true);
      }
      // 듣는 중인 울림 못: 테두리 쪽의 ♪ 글자(이끼 못은 소리가 없다)
      if (s.playing && s.kind === 'note') {
        const n = pool.notes[noteAt++];
        if (n) {
          const p = at(mid, (w.rimIn + w.r) / 2);
          g.fillStyle(WHITE, 1).fillCircle(p.x, p.y, 15);
          g.lineStyle(3, GOLD, 1).strokeCircle(p.x, p.y, 15);
          n.setPosition(p.x, p.y + 1).setScale(0.75).setVisible(true);
        }
      }
      out.nails.push({ startTick: s.startTick, endTick: s.endTick, kind: s.kind, label, dotted: s.dotted, flagged: s.flagged, playing: s.playing, startDeg, endDeg });
    }
  }

  // ------------------------------------------------------------------ 놓으려는 자리, 번호, 방망이

  /** 놓으려는 자리: 손에 든 것이 차지할 칸들의 윤곽. 놓을 수 있으면 테두리 위의 ▼, 놓을 수 없으면 × 표시가 붙는다 */
  private drawCursor(g: Phaser.GameObjects.Graphics, w: WheelGeometry, c: CursorMark, at: (deg: number, radius: number) => { x: number; y: number }): void {
    const a0 = tickToDeg(w, c.startTick);
    const a1 = tickToDeg(w, c.endTick);
    if (a1 <= a0) return;
    const color = c.ok ? (c.kind === 'erase' ? INK : TEAL) : CORAL;
    this.sector(g, at, a0, a1, w.ringIn - 4, w.ringOut + 4);
    g.fillStyle(color, 0.16).fillPath();
    g.lineStyle(7, color, 1).strokePath();
    const mid = (a0 + a1) / 2;
    if (c.ok) {
      const tip = at(mid, w.rimIn - 6);
      const left = at(mid - 4, w.r + 12);
      const right = at(mid + 4, w.r + 12);
      g.fillStyle(color, 1).fillTriangle(left.x, left.y, right.x, right.y, tip.x, tip.y);
      g.lineStyle(2, WHITE, 1).strokeTriangle(left.x, left.y, right.x, right.y, tip.x, tip.y);
    } else {
      const p = at(mid, (w.ringIn + w.ringOut) / 2);
      g.lineStyle(6, CORAL, 1);
      g.lineBetween(p.x - 14, p.y - 14, p.x + 14, p.y + 14);
      g.lineBetween(p.x - 14, p.y + 14, p.x + 14, p.y - 14);
    }
  }

  /** 칸 번호(허브 가까이)와 큰 박 번호(테두리 위, 큰 박이 시작하는 살 바로 뒤) */
  private drawNumbers(g: Phaser.GameObjects.Graphics, w: WheelGeometry, beats: readonly WheelBeat[], pool: WheelPool, at: (deg: number, radius: number) => { x: number; y: number }): void {
    for (let k = 1; k <= w.cells; k++) {
      const p = at(tickToDeg(w, ((k - 1) + 0.5) * w.cellTicks), (w.hubR + w.ringIn) / 2);
      g.fillStyle(WHITE, 1).fillCircle(p.x, p.y, 12);
      g.lineStyle(2, INK, 0.8).strokeCircle(p.x, p.y, 12);
      pool.cellNums[k - 1]!.setPosition(p.x, p.y + 1).setVisible(true);
    }
    beats.forEach((b, i) => {
      const p = at(b.fromDeg + 10, (w.rimIn + w.r) / 2);
      g.fillStyle(WHITE, 1).fillCircle(p.x, p.y, 14);
      g.lineStyle(2.5, INK, 0.95).strokeCircle(p.x, p.y, 14);
      pool.beatNums[i]!.setText(String(b.beat)).setPosition(p.x, p.y + 1).setVisible(true);
    });
  }

  /** 12시에 선 방망이(고정): 바퀴가 돌아 칸이 이 아래로 올 때마다 소리가 난다는 뜻이다 */
  private drawClapper(g: Phaser.GameObjects.Graphics, w: WheelGeometry): void {
    const top = w.cy - w.r;
    g.fillStyle(GOLD, 1).fillTriangle(w.cx - 14, top - 14, w.cx + 14, top - 14, w.cx, top + 14);
    g.lineStyle(2.5, INK, 0.9).strokeTriangle(w.cx - 14, top - 14, w.cx + 14, top - 14, w.cx, top + 14);
    g.fillStyle(GOLD, 1).fillRoundedRect(w.cx - 18, top - 24, 36, 12, 4);
    g.lineStyle(2.5, INK, 0.9).strokeRoundedRect(w.cx - 18, top - 24, 36, 12, 4);
  }

  destroy(): void {
    for (const p of this.pools.values()) for (const list of [p.names, p.rests, p.bangs, p.notes, p.cellNums, p.beatNums]) for (const t of list) t.destroy();
    this.pools.clear();
  }
}
