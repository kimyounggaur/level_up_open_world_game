// 6-4 징검다리(T2, 설계서 4.4)를 월드에 그린다: 여울에 놓인 돌, 남은 물, 쓰지 않는 구간을 덮은 물가 바위, 박 번호,
// 놓으려는 자리, 듣는 중의 물결 선. 그리는 일만 맡는다. 무엇을 그릴지는 화면(설치물 컨트롤러)이 정해 다리(WorldBridge)에
// 올려 두고(InstallationView.timeline), 여기서는 읽어서 옮겨 그린다. 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3).
// 색만으로 뜻을 전하지 않는다:
//   울림돌 = 음 이름 글자 / 이끼돌(쉼표) = 사선 무늬와 '쉼' 글자 / 점이 붙은 돌 = 오른쪽 끝의 점 /
//   남은 물 = 물결 무늬, 판정이 알리면 산호색 테두리와 '남은 물' 글자와 '!' 배지 /
//   놓으려는 자리 = 놓을 수 있으면 ▼, 놓을 수 없으면 × 표시 / 듣는 돌 = 금빛 테두리와 ♪ 글자(이끼돌은 소리가 없어 테두리만).
// 돌 한 개가 여러 격자 칸을 덮을 수 있어서 돌은 칸이 아니라 틱 구간(시작~끝)으로 그린다.
import Phaser from 'phaser';
import type { InstallationDef, WorldRect } from '../../domain/installation';
import { STONE_WATER_WORDS, WHEEL_WATER_WORDS, laneOf, laneRect } from '../../domain/timelineStones';
import type { CursorMark, StoneLane, StoneMark, TimelineView, WaterMark } from '../../domain/timelineStones';
import { isWheel } from '../../domain/waterwheel';
import type { InstallationView } from '../../platform/bridge';
import { hatchSegments } from './hatch';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, MOSS, MOSS_DARK_CSS, MOSS_LIGHT, ROCK, ROCK_DARK, TEAL, TEAL_LIGHT, WATER, WHITE, WHITE_CSS } from './palette';

/** 돌의 시간 방향 양끝을 안쪽으로 줄이는 px(이웃한 돌 사이가 띄워져 보인다) */
const STONE_GAP = 2;
/** 돌의 직각 방향 여백(물 위에 뜬 돌처럼 보이도록 줄 폭보다 조금 좁다) */
const STONE_MARGIN = 8;
/** 박 번호는 줄 위쪽(시간이 가로일 때)이나 왼쪽(세로일 때) 이만큼 밖에 단다. domain/installation의 STONES_LABEL_TOP(44) 안에 들어간다 */
const BEAT_LABEL_OFFSET = 22;
const MAX_BEATS = 8;
const MAX_RAFTS = 8;

/** 그려진 돌 하나(점검용). x, y, w, h는 월드 좌표 */
export interface DrawnStone {
  startTick: number;
  endTick: number;
  kind: 'note' | 'rest';
  /** 돌에 쓴 글자: 울림돌은 음 이름, 이끼돌은 '쉼' */
  label: string;
  dotted: boolean;
  flagged: boolean;
  playing: boolean;
  /** 셋잇단 뗏목에 속한 돌인가 */
  raft: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 그려진 남은 물 한 구간(점검용) */
export interface DrawnWater {
  from: number;
  to: number;
  flagged: boolean;
  /** '남은 물' 글자를 달았는가(강조될 때만, 구간이 글자가 들어갈 만큼 넓을 때만) */
  labelled: boolean;
  /** 강조 테두리를 그렸는가 */
  emphasised: boolean;
}

/** 징검다리 한 줄의 그려진 모습(점검용) */
export interface DrawnTimeline {
  stones: DrawnStone[];
  water: DrawnWater[];
  waterEmphasis: boolean;
  cursor: { startTick: number; endTick: number; kind: CursorMark['kind']; ok: boolean } | null;
  playTick: number | null;
  /** 쓰지 않는 구간(판본의 한 마디가 줄보다 짧을 때)을 물가 바위로 덮었는가. 덮었다면 그 구간 */
  shoreRocks: { from: number; to: number } | null;
  /** 박 번호를 단 박의 수(설치물 모드에서만) */
  beats: number;
  /** 묶은 셋잇단 뗏목의 수 */
  rafts: number;
}

type Text = Phaser.GameObjects.Text;

interface LanePool {
  lane: StoneLane;
  names: Text[];
  rests: Text[];
  bangs: Text[];
  notes: Text[];
  waters: Text[];
  beats: Text[];
  rafts: Text[];
}

const hide = (list: readonly Text[]): void => {
  for (const t of list) t.setVisible(false);
};

/** 줄의 틱 구간을 월드 사각형으로: 시간 방향은 gap만큼, 직각 방향은 margin만큼 안쪽으로 줄인다 */
export function stoneBox(lane: StoneLane, fromTick: number, toTick: number, gap: number, margin: number): WorldRect {
  const r = laneRect(lane, fromTick, toTick, gap);
  return lane.axis === 'x' ? { x: r.x, y: r.y + margin, w: r.w, h: Math.max(0, r.h - margin * 2) } : { x: r.x + margin, y: r.y, w: Math.max(0, r.w - margin * 2), h: r.h };
}

/** 시간이 흐르는 방향의 월드 좌표(틱 → px) */
const alongOf = (lane: StoneLane, tick: number): number => lane.start + tick / lane.ticksPerPx;

export class TimelineLayer {
  private readonly pools = new Map<string, LanePool>();

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
      const lane = laneOf(inst);
      if (!lane) continue;
      const cells = inst.slots.length;
      const many = (n: number, make: () => Text): Text[] => Array.from({ length: n }, make);
      this.pools.set(inst.installationId, {
        lane,
        names: many(cells, () => text('', 26, INK_CSS)),
        rests: many(cells, () => text('쉼', 22, MOSS_DARK_CSS)),
        bangs: many(cells, () => text('!', 22, WHITE_CSS)),
        notes: many(cells, () => text('♪', 24, GOLD_TEXT_CSS)),
        // 물레방아의 띠에서는 같은 자리를 '빈 구멍'이라 부른다(바퀴와 띠가 같은 낱말을 쓴다)
        waters: many(cells, () => text((isWheel(inst) ? WHEEL_WATER_WORDS : STONE_WATER_WORDS).empty, 20, '#8f4a35')),
        beats: many(MAX_BEATS, () => text('', 18, INK_CSS)),
        rafts: many(MAX_RAFTS, () => text('3', 22, INK_CSS)),
      });
    }
  }

  /** 징검다리 설치물인가(이 층이 그린다) */
  has(installationId: string): boolean {
    return this.pools.has(installationId);
  }

  /** 징검다리 한 줄을 그린다. g는 설치물 층의 그래픽(같은 깊이에 쌓는다) */
  draw(g: Phaser.GameObjects.Graphics, inst: InstallationDef, view: InstallationView | undefined, active: boolean): DrawnTimeline {
    const pool = this.pools.get(inst.installationId);
    const none: DrawnTimeline = { stones: [], water: [], waterEmphasis: false, cursor: null, playTick: null, shoreRocks: null, beats: 0, rafts: 0 };
    if (!pool) return none;
    for (const list of [pool.names, pool.rests, pool.bangs, pool.notes, pool.waters, pool.beats, pool.rafts]) hide(list);
    const tl = view?.timeline;
    if (!tl) return none;
    const lane = pool.lane;
    const out: DrawnTimeline = { ...none, waterEmphasis: tl.waterEmphasis, playTick: tl.playTick };

    // 쓰지 않는 구간: 3/4 과제는 왼쪽 360 px만 쓰고 나머지는 물가 바위로 덮는다(4.4). 걷는 중에도 덮여 있다
    if (tl.measureTicks < lane.laneTicks) {
      this.drawShoreRocks(g, lane, tl.measureTicks, lane.laneTicks);
      out.shoreRocks = { from: tl.measureTicks, to: lane.laneTicks };
    }

    if (active) {
      this.drawGrid(g, lane, tl);
      this.drawWater(g, lane, tl, pool, out);
    }

    this.drawStones(g, lane, tl, pool, out);
    this.drawRafts(g, lane, tl.stones, pool, out);

    if (active && tl.cursor) {
      this.drawCursor(g, lane, tl.cursor);
      out.cursor = { startTick: tl.cursor.startTick, endTick: tl.cursor.endTick, kind: tl.cursor.kind, ok: tl.cursor.ok };
    }
    if (active) out.beats = this.drawBeatNumbers(g, lane, tl, pool);
    if (tl.playTick !== null) this.drawPlayhead(g, lane, tl.playTick);
    return out;
  }

  // ------------------------------------------------------------------ 바닥: 물가 바위, 격자, 남은 물

  /** 쓰지 않는 구간을 덮는 물가 바위: 바위 덩어리와 사선 무늬(색만으로 '쓰지 않음'을 전하지 않는다) */
  private drawShoreRocks(g: Phaser.GameObjects.Graphics, lane: StoneLane, from: number, to: number): void {
    const r = laneRect(lane, from, to, 0);
    const x = r.x - 2;
    const y = r.y - 2;
    const w = r.w + 4;
    const h = r.h + 4;
    g.fillStyle(ROCK, 0.97).fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(3, ROCK_DARK, 1).strokeRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, ROCK_DARK, 0.45);
    for (const [x0, y0, x1, y1] of hatchSegments(x + 6, y + 6, w - 12, h - 12, 14)) g.lineBetween(x0, y0, x1, y1);
    // 바위 덩어리: 줄을 따라 둥근 바위를 몇 개 얹는다
    const along = lane.axis === 'x' ? w : h;
    const count = Math.max(1, Math.round(along / 70));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const cx = lane.axis === 'x' ? x + w * t : x + w / 2;
      const cy = lane.axis === 'x' ? y + h / 2 : y + h * t;
      const rad = Math.min(w, h, 70) * 0.32;
      g.fillStyle(ROCK_DARK, 0.28).fillCircle(cx + 3, cy + 4, rad);
      g.fillStyle(ROCK, 1).fillCircle(cx, cy, rad);
      g.lineStyle(2, ROCK_DARK, 0.9).strokeCircle(cx, cy, rad);
    }
  }

  /** 설치물 모드의 격자: 가장 잘게 나눈 칸의 경계는 옅게, 박의 경계는 굵게 */
  private drawGrid(g: Phaser.GameObjects.Graphics, lane: StoneLane, tl: TimelineView): void {
    const reach = 5;
    for (let tick = 0; tick <= tl.measureTicks; tick += tl.gridTicks) {
      const beat = tick % tl.beatTicks === 0;
      const along = alongOf(lane, tick);
      g.lineStyle(beat ? 3 : 1.5, beat ? TEAL : INK, beat ? 0.55 : 0.16);
      if (lane.axis === 'x') g.lineBetween(along, lane.cross - reach, along, lane.cross + lane.crossSize + reach);
      else g.lineBetween(lane.cross - reach, along, lane.cross + lane.crossSize + reach, along);
    }
  }

  /** 남은 물: 돌이 덮지 않은 구간에 물결 무늬를 깐다. 마디가 덜 채워졌다는 판정이 있으면 산호색 테두리와 '남은 물' 글자로 강조한다 */
  private drawWater(g: Phaser.GameObjects.Graphics, lane: StoneLane, tl: TimelineView, pool: LanePool, out: DrawnTimeline): void {
    let used = 0;
    for (const w of tl.water) {
      const emphasised = tl.waterEmphasis || w.flagged;
      const r = stoneBox(lane, w.from, w.to, STONE_GAP + 1, STONE_MARGIN - 2);
      if (r.w <= 0 || r.h <= 0) continue;
      g.fillStyle(emphasised ? CORAL : WATER, emphasised ? 0.16 : 0.2).fillRoundedRect(r.x, r.y, r.w, r.h, 12);
      this.drawWaves(g, lane, w, tl.gridTicks, emphasised);
      if (emphasised) g.lineStyle(5, CORAL, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 12);
      const along = lane.axis === 'x' ? r.w : r.h;
      // 글자는 구간이 충분히 넓을 때만 단다. 좁으면 테두리와 문장이 알린다
      const labelled = emphasised && along >= 150 && used < pool.waters.length;
      if (labelled) {
        const t = pool.waters[used++]!;
        t.setPosition(r.x + r.w / 2, r.y + r.h / 2).setVisible(true);
      }
      out.water.push({ from: w.from, to: w.to, flagged: w.flagged, labelled, emphasised });
    }
  }

  /** 물결 무늬: 칸마다 위아래로 굽이치는 짧은 선 두 줄 */
  private drawWaves(g: Phaser.GameObjects.Graphics, lane: StoneLane, w: WaterMark, grid: number, strong: boolean): void {
    g.lineStyle(2.5, strong ? CORAL : WATER, strong ? 0.75 : 0.6);
    for (let tick = w.from; tick < w.to; tick += grid) {
      // 이 칸(마지막 칸은 구간 끝까지)의 가운데
      const mid = alongOf(lane, (tick + Math.min(tick + grid, w.to)) / 2);
      for (const frac of [0.34, 0.68]) {
        const cross = lane.cross + lane.crossSize * frac;
        const cx = lane.axis === 'x' ? mid : cross;
        const cy = lane.axis === 'x' ? cross : mid;
        g.beginPath();
        for (let i = 0; i <= 6; i++) {
          const px = cx - 16 + i * 5.4;
          const py = cy + Math.sin((i / 6) * Math.PI * 2) * 4.5;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
      }
    }
  }

  // ------------------------------------------------------------------ 돌

  private drawStones(g: Phaser.GameObjects.Graphics, lane: StoneLane, tl: TimelineView, pool: LanePool, out: DrawnTimeline): void {
    let nameAt = 0;
    let restAt = 0;
    let bangAt = 0;
    let noteAt = 0;
    for (const s of tl.stones) {
      const r = stoneBox(lane, s.startTick, s.endTick, STONE_GAP, STONE_MARGIN);
      if (r.w <= 0 || r.h <= 0) continue;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      g.fillStyle(INK, 0.14).fillRoundedRect(r.x + 2, r.y + 4, r.w, r.h, 14);
      if (s.kind === 'note') {
        g.fillStyle(TEAL_LIGHT, 0.97).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
        g.lineStyle(3, TEAL, 0.95).strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
      } else {
        // 이끼돌: 이끼 바탕에 사선 무늬와 '쉼' 글자
        g.fillStyle(MOSS_LIGHT, 0.97).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
        g.lineStyle(2, MOSS, 0.45);
        for (const [x0, y0, x1, y1] of hatchSegments(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 12)) g.lineBetween(x0, y0, x1, y1);
        g.lineStyle(3, MOSS, 0.95).strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
      }
      if (s.playing) {
        g.fillStyle(GOLD, 0.38).fillRoundedRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, 15);
        g.lineStyle(6, GOLD, 1).strokeRoundedRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, 15);
      }

      const label = s.kind === 'note' ? (s.name ?? '') : '쉼';
      const pool1 = s.kind === 'note' ? pool.names : pool.rests;
      const at = s.kind === 'note' ? nameAt++ : restAt++;
      const t = pool1[at];
      if (t) {
        if (s.kind === 'note') t.setText(label);
        t.setPosition(cx - (s.dotted ? 5 : 0), cy);
        // 좁은 돌에는 글자를 줄여 넣는다
        t.setScale(Math.min(1, Math.max(0.5, (r.w - 10) / Math.max(1, t.width))));
        t.setVisible(true);
      }
      // 점이 붙은 돌: 오른쪽 끝의 점
      if (s.dotted && r.w >= 36) g.fillStyle(INK, 0.95).fillCircle(r.x + r.w - 11, cy, 4.5);

      // 판정이 가리킨 돌: 오른쪽 위의 산호색 배지와 '!' 글자
      if (s.flagged) {
        const bx = r.x + r.w - 7;
        const by = r.y + 7;
        g.fillStyle(CORAL, 1).fillCircle(bx, by, 13);
        g.lineStyle(2.5, WHITE, 1).strokeCircle(bx, by, 13);
        const b = pool.bangs[bangAt++];
        if (b) b.setPosition(bx, by + 1).setScale(0.8).setVisible(true);
      }
      // 듣는 중인 울림돌: 위쪽의 ♪ 글자(이끼돌은 소리가 없다)
      if (s.playing && s.kind === 'note') {
        const n = pool.notes[noteAt++];
        if (n) (lane.axis === 'x' ? n.setPosition(cx, r.y - 20) : n.setPosition(r.x - 20, cy)).setVisible(true);
      }
      out.stones.push({
        startTick: s.startTick,
        endTick: s.endTick,
        kind: s.kind,
        label,
        dotted: s.dotted,
        flagged: s.flagged,
        playing: s.playing,
        raft: s.groupId !== undefined,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      });
    }
  }

  /** 셋잇단 뗏목: 한 벌로 묶인 돌들 아래에 나무 널을 대고 '3'을 단다. 돌 길이로도 보통 음과 구분된다(8분 셋잇단 돌은 보통 8분보다 짧다) */
  private drawRafts(g: Phaser.GameObjects.Graphics, lane: StoneLane, stones: readonly StoneMark[], pool: LanePool, out: DrawnTimeline): void {
    const groups = new Map<string, { from: number; to: number; size: number }>();
    for (const s of stones) {
      if (!s.groupId) continue;
      const g0 = groups.get(s.groupId);
      if (g0) {
        g0.from = Math.min(g0.from, s.startTick);
        g0.to = Math.max(g0.to, s.endTick);
      } else groups.set(s.groupId, { from: s.startTick, to: s.endTick, size: s.groupSize ?? 3 });
    }
    let used = 0;
    for (const grp of groups.values()) {
      const r = laneRect(lane, grp.from, grp.to, STONE_GAP);
      const thick = 10;
      const bar: WorldRect = lane.axis === 'x' ? { x: r.x, y: lane.cross + lane.crossSize - thick - 1, w: r.w, h: thick } : { x: lane.cross + lane.crossSize - thick - 1, y: r.y, w: thick, h: r.h };
      g.fillStyle(GOLD, 0.95).fillRoundedRect(bar.x, bar.y, bar.w, bar.h, 4);
      g.lineStyle(2, INK, 0.7).strokeRoundedRect(bar.x, bar.y, bar.w, bar.h, 4);
      const t = pool.rafts[used];
      if (t) {
        t.setText(String(grp.size));
        const cx = lane.axis === 'x' ? bar.x + bar.w / 2 : bar.x + bar.w + 16;
        const cy = lane.axis === 'x' ? bar.y + bar.h + 16 : bar.y + bar.h / 2;
        g.fillStyle(WHITE, 0.95).fillCircle(cx, cy, 14);
        g.lineStyle(2, INK, 0.85).strokeCircle(cx, cy, 14);
        t.setPosition(cx, cy + 1).setVisible(true);
        used++;
      }
    }
    out.rafts = groups.size;
  }

  // ------------------------------------------------------------------ 놓으려는 자리, 박 번호, 물결 선

  /** 놓으려는 자리: 손에 든 돌이 차지할 구간의 윤곽. 놓을 수 있으면 ▼, 놓을 수 없으면 × 표시가 붙는다 */
  private drawCursor(g: Phaser.GameObjects.Graphics, lane: StoneLane, c: CursorMark): void {
    const r = stoneBox(lane, c.startTick, c.endTick, 0, STONE_MARGIN - 4);
    if (r.w <= 0 || r.h <= 0) return;
    const color = c.ok ? (c.kind === 'erase' ? INK : TEAL) : CORAL;
    g.fillStyle(color, 0.16).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
    g.lineStyle(7, color, 1).strokeRoundedRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 16);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (c.ok) {
      g.fillStyle(color, 1);
      if (lane.axis === 'x') g.fillTriangle(cx - 13, r.y - 36, cx + 13, r.y - 36, cx, r.y - 13);
      else g.fillTriangle(r.x - 36, cy - 13, r.x - 36, cy + 13, r.x - 13, cy);
    } else {
      const k = Math.min(14, r.w / 3, r.h / 3);
      g.lineStyle(6, CORAL, 1);
      g.lineBetween(cx - k, cy - k, cx + k, cy + k);
      g.lineBetween(cx - k, cy + k, cx + k, cy - k);
    }
  }

  /** 박 번호: 줄 바깥쪽 띠에 흰 원과 숫자. 박이 시작하는 선 바로 안쪽에 단다 */
  private drawBeatNumbers(g: Phaser.GameObjects.Graphics, lane: StoneLane, tl: TimelineView, pool: LanePool): number {
    let n = 0;
    for (let tick = 0; tick < tl.measureTicks && n < pool.beats.length; tick += tl.beatTicks) {
      const along = alongOf(lane, tick) + 20;
      const cx = lane.axis === 'x' ? along : lane.cross - BEAT_LABEL_OFFSET;
      const cy = lane.axis === 'x' ? lane.cross - BEAT_LABEL_OFFSET : along;
      g.fillStyle(WHITE, 1).fillCircle(cx, cy, 14);
      g.lineStyle(2, INK, 0.9).strokeCircle(cx, cy, 14);
      pool.beats[n]!.setText(String(n + 1)).setPosition(cx, cy + 1).setVisible(true);
      n++;
    }
    return n;
  }

  /** 듣는 중의 물결 선: 줄을 가로지르는 금빛 선과 끝의 동그라미. 소리를 꺼 두어도 움직인다(W-8) */
  private drawPlayhead(g: Phaser.GameObjects.Graphics, lane: StoneLane, tick: number): void {
    const along = alongOf(lane, tick);
    const reach = 10;
    g.lineStyle(5, GOLD, 1);
    if (lane.axis === 'x') {
      g.lineBetween(along, lane.cross - reach, along, lane.cross + lane.crossSize + reach);
      g.fillStyle(GOLD, 1).fillCircle(along, lane.cross - reach - 3, 8);
    } else {
      g.lineBetween(lane.cross - reach, along, lane.cross + lane.crossSize + reach, along);
      g.fillStyle(GOLD, 1).fillCircle(lane.cross - reach - 3, along, 8);
    }
  }

  destroy(): void {
    for (const p of this.pools.values()) for (const list of [p.names, p.rests, p.bangs, p.notes, p.waters, p.beats, p.rafts]) for (const t of list) t.destroy();
    this.pools.clear();
  }
}
