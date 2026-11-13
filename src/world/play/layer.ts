// 놀이 악기를 그리는 층(설계서 3.5, 6-9c): 바닥에 놓인 돌(패드)과 돌 위의 음 이름을 그린다. 돌을 밟으면 그 돌이 잠깐 밝아지고,
// 메아리 악기라면 한 박 뒤에 같은 돌에 고리가 한 번 더 비친다(소리가 되돌아온다는 것을 귀로만 알리지 않는다).
// 색만으로 뜻을 전하지 않는다: 밟은 돌은 금빛으로 차고 겹고리가 생기며, 되돌아온 소리는 얇은 금빛 고리 하나로 보인다. 돌마다 음 이름 글자가 있다.
// 움직임 줄이기(9.7)에서는 번지는 고리 없이 그 자리에서 채워졌다가 비워지기만 한다. 판정도 기록도 없다(W-5): 그리기만 한다.
import Phaser from 'phaser';
import { ECHO_DELAY_BEATS, PAD_RADIUS, padSitesOf } from '../../domain/play';
import type { PadSite, PlayInstrumentDef } from '../../domain/play';
import { pieceNoteName } from '../../domain/discovery';
import { BEAT_SEC } from '../../domain/worldsound';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK_CSS, MOSS, MOSS_LIGHT, TEAL, WATER, WHITE, WOOD, WOOD_DARK } from '../installations/palette';
import type { Box, ViewCull } from '../cull';

/** 놀이 악기는 바닥 그림 위, 설치물 돌 층(−90000) 아래에 그린다. 캐릭터와 사물은 그 위다 */
export const PLAY_DEPTH = -92_000;
/** 밟은 돌이 밝은 채로 있는 시간(초) */
export const STRIKE_FLASH_SECONDS = 0.35;
/** 되돌아온 소리의 고리가 보이는 시간(초) */
export const ECHO_FLASH_SECONDS = 0.35;

const STONE = 0xf4f3ea;
const STONE_EDGE = 0xbdcaa9;
const STONE_SHADOW = 0xb6c3aa;
const GOLD_LIGHT = 0xfbe7a1;
/** 물방울 북 자리의 물: 연한 물빛 바닥과 물결 고리 */
const POOL = 0xcfe3e6;
const POOL_RING = 0xb3d4d9;
/** 높낮이 미끄럼길의 비탈: 연한 볏짚빛 띠와 그림자, 가장자리 선, 위를 가리키는 쐐기 */
const SLOPE = 0xece5c6;
const SLOPE_SHADOW = 0xd2cba8;
const SLOPE_EDGE = 0xbab386;
const SLOPE_MARK = 0x9c9266;
/** 연잎 합창의 연못과 연잎 */
const LILY_POND = 0xd3e7da;
const LEAF = 0xa7cf98;
/** 돌 가운데 음 이름 글자 크기(px) */
const LABEL_SIZE = 22;

export type PadState = 'idle' | 'struck' | 'echo';

export interface DrawnPad {
  pad: number;
  x: number;
  y: number;
  midi: number;
  /** 돌 위에 쓴 음 이름 */
  label: string;
  state: PadState;
}

export interface DrawnPlay {
  playId: string;
  name: string;
  x: number;
  y: number;
  pads: DrawnPad[];
  /** 돌 아래에 깐 바닥의 종류(PLAY_GROUNDS) */
  ground: PlayInstrumentDef['ground'];
}

interface PadNode {
  site: PadSite;
  label: Phaser.GameObjects.Text;
  /** 마지막으로 밟은 시각(층의 시계, 초). 밟은 적 없으면 null */
  struckAt: number | null;
}

interface InstrumentNode {
  def: PlayInstrumentDef;
  /** 돌 아래에 깐 바닥 그림(물 자리, 비탈, 밧줄, 연못). 바닥이 없는 악기는 null. 한 번만 그린다 */
  groundGfx: Phaser.GameObjects.Graphics | null;
  g: Phaser.GameObjects.Graphics;
  pads: PadNode[];
  /** 마지막으로 그린 모습. 달라졌거나 번지는 고리가 움직이는 동안에만 다시 그린다 */
  drawnKey: string;
}

export class PlayLayer {
  private readonly nodes: InstrumentNode[] = [];
  private readonly byId = new Map<string, InstrumentNode>();
  private now = 0;

  constructor(
    scene: Phaser.Scene,
    instruments: readonly PlayInstrumentDef[],
    private readonly cull: ViewCull,
  ) {
    const res = Math.min(3, Math.max(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2));
    for (const def of instruments) {
      // 바닥(물 자리, 비탈, 밧줄, 연못 같은 것)은 악기마다 한 번만 그린다
      let groundGfx: Phaser.GameObjects.Graphics | null = null;
      const reach = reachOf(def);
      if (def.ground !== 'none') {
        groundGfx = scene.add.graphics().setDepth(PLAY_DEPTH - 1);
        drawGround(groundGfx, def);
        this.cull.track(groundGfx, reach);
      }
      const g = scene.add.graphics().setDepth(PLAY_DEPTH);
      this.cull.track(g, reach);
      const pads = padSitesOf(def).map((site): PadNode => {
        const label = scene.add
          .text(site.x, site.y, pieceNoteName(site.midi), { fontFamily: FONT, fontSize: `${LABEL_SIZE}px`, fontStyle: 'bold', color: INK_CSS })
          .setOrigin(0.5, 0.5)
          .setResolution(res)
          .setDepth(PLAY_DEPTH + 1);
        return { site, label, struckAt: null };
      });
      const node: InstrumentNode = { def, groundGfx, g, pads, drawnKey: '' };
      this.nodes.push(node);
      this.byId.set(def.playId, node);
      this.draw(node, 0, false);
    }
  }

  /** 돌 하나(1부터)를 밟았다. now는 층의 시계(초)다 */
  strike(playId: string, pad: number, now: number): void {
    const node = this.byId.get(playId);
    const p = node?.pads[pad - 1];
    if (!p) return;
    p.struckAt = now;
  }

  /** 매 프레임 부른다. 모습이 달라졌을 때만 다시 그린다 */
  update(now: number, reduce: boolean): void {
    this.now = now;
    for (const node of this.nodes) this.draw(node, now, reduce);
  }

  /** 돌의 지금 모습: 밟은 직후는 struck, 메아리가 되돌아오는 때(밟고 한 박 뒤)는 echo */
  private stateOf(node: InstrumentNode, p: PadNode, now: number): PadState {
    if (p.struckAt === null) return 'idle';
    const t = now - p.struckAt;
    if (t >= 0 && t < STRIKE_FLASH_SECONDS) return 'struck';
    if (node.def.echo) {
      const e = t - ECHO_DELAY_BEATS * BEAT_SEC;
      if (e >= 0 && e < ECHO_FLASH_SECONDS) return 'echo';
    }
    return 'idle';
  }

  private draw(node: InstrumentNode, now: number, reduce: boolean): void {
    const states = node.pads.map((p) => this.stateOf(node, p, now));
    // 번지는 고리는 시간에 따라 크기가 달라지므로 움직이는 동안은 프레임마다 다시 그린다(움직임 줄이기에서는 그 자리에서 채워질 뿐이다)
    const moving = !reduce && states.some((s) => s !== 'idle');
    const key = `${states.join(',')}|${reduce ? 'r' : 'm'}`;
    if (!moving && key === node.drawnKey) return;
    node.drawnKey = key;
    const g = node.g;
    g.clear();
    node.pads.forEach((p, i) => {
      const state = states[i]!;
      const { x, y } = p.site;
      // 돌의 그림자(오른쪽 아래로 어긋난 단색 도형, 9.1)
      g.fillStyle(STONE_SHADOW, 1).fillCircle(x + 8, y + 12, PAD_RADIUS);
      if (state === 'struck') {
        g.fillStyle(GOLD_LIGHT, 1).fillCircle(x, y, PAD_RADIUS);
        g.lineStyle(5, GOLD, 1).strokeCircle(x, y, PAD_RADIUS - 3);
        g.lineStyle(3, GOLD, 1).strokeCircle(x, y, PAD_RADIUS - 13);
        if (!reduce && p.struckAt !== null) {
          const t = Math.min(1, Math.max(0, (now - p.struckAt) / STRIKE_FLASH_SECONDS));
          g.lineStyle(4, GOLD, 0.8 * (1 - t)).strokeCircle(x, y, PAD_RADIUS + 6 + 26 * t);
        }
      } else {
        g.fillStyle(STONE, 1).fillCircle(x, y, PAD_RADIUS);
        g.lineStyle(3, STONE_EDGE, 1).strokeCircle(x, y, PAD_RADIUS - 2);
        if (state === 'echo') {
          // 되돌아온 소리: 얇은 금빛 고리 하나(밟은 돌의 겹고리보다 가늘다)
          g.lineStyle(3, GOLD, 1).strokeCircle(x, y, PAD_RADIUS + 4);
        }
      }
      p.label.setColor(state === 'struck' ? INK_CSS : state === 'echo' ? GOLD_TEXT_CSS : INK_CSS);
    });
  }

  /** 지금 그린 것(점검용) */
  debug(): DrawnPlay[] {
    return this.nodes.map((n) => ({
      playId: n.def.playId,
      name: n.def.name,
      x: n.def.x,
      y: n.def.y,
      ground: n.def.ground,
      pads: n.pads.map((p, i) => ({ pad: i + 1, x: p.site.x, y: p.site.y, midi: p.site.midi, label: p.label.text, state: this.stateOf(n, p, this.now) })),
    }));
  }

  destroy(): void {
    for (const n of this.nodes.splice(0)) {
      if (n.groundGfx) this.cull.untrack(n.groundGfx);
      this.cull.untrack(n.g);
      n.groundGfx?.destroy();
      n.g.destroy();
      for (const p of n.pads) p.label.destroy();
    }
    this.byId.clear();
  }
}

/** 돌 아래에 깐 바닥을 한 번만 그린다. 길과 막힘에는 영향이 없는 그림일 뿐이다 */
function drawGround(g: Phaser.GameObjects.Graphics, def: PlayInstrumentDef): void {
  switch (def.ground) {
    case 'pool':
      drawPool(g, def);
      break;
    case 'slope':
      drawSlope(g, def);
      break;
    case 'rope':
      drawRope(g, def);
      break;
    case 'lilies':
      drawLilies(g, def);
      break;
    case 'none':
      break;
  }
}

/**
 * 놀이 악기 하나(바닥과 돌)가 그려지는 범위: 악기 가운데에서 가장 먼 돌까지의 거리 + 150 px의 정사각형.
 * 가장 넓은 그림이 연잎 연못(가장 먼 돌 + 84), 바람개비 줄(첫·마지막 돌에서 줄 쪽으로 88, 돌 위로 106), 비탈(돌 둘레 72 + 그림자)이므로 넉넉하다.
 */
function reachOf(def: PlayInstrumentDef): Box {
  const far = Math.max(0, ...def.pads.map((p) => Math.hypot(p.dx, p.dy)));
  const r = far + 150;
  return { x0: def.x - r, y0: def.y - r, x1: def.x + r, y1: def.y + r };
}

/** 돌 자리들을 둘러싼 네모(여백 포함) */
function padBounds(def: PlayInstrumentDef, margin: number): { x0: number; y0: number; x1: number; y1: number } {
  const sites = padSitesOf(def);
  return {
    x0: Math.min(...sites.map((s) => s.x)) - margin,
    y0: Math.min(...sites.map((s) => s.y)) - margin,
    x1: Math.max(...sites.map((s) => s.x)) + margin,
    y1: Math.max(...sites.map((s) => s.y)) + margin,
  };
}

/**
 * 높낮이 미끄럼길의 비탈: 돌 줄을 감싸는 긴 띠에, 이웃한 돌 사이마다 '더 높은 음' 쪽을 가리키는 쐐기(^)를 그린다.
 * 돌은 낮은 음부터 번호가 붙으므로 쐐기는 늘 번호가 커지는 쪽이다. 색이 아니라 쐐기의 방향이 오르는 쪽을 알려 준다
 */
function drawSlope(g: Phaser.GameObjects.Graphics, def: PlayInstrumentDef): void {
  const { x0, y0, x1, y1 } = padBounds(def, PAD_RADIUS + 28);
  g.fillStyle(SLOPE_SHADOW, 1).fillRoundedRect(x0 + 8, y0 + 12, x1 - x0, y1 - y0, 44);
  g.fillStyle(SLOPE, 1).fillRoundedRect(x0, y0, x1 - x0, y1 - y0, 44);
  g.lineStyle(4, SLOPE_EDGE, 1).strokeRoundedRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12, 38);
  const sites = padSitesOf(def);
  g.lineStyle(6, SLOPE_MARK, 1);
  for (let i = 0; i + 1 < sites.length; i++) {
    const a = sites[i]!;
    const b = sites[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // 쐐기의 끝은 높은 음 쪽, 두 날개는 낮은 음 쪽으로 벌어진다
    const tipX = mx + dx * 12;
    const tipY = my + dy * 12;
    g.lineBetween(tipX - dx * 14 - dy * 22, tipY - dy * 14 + dx * 22, tipX, tipY);
    g.lineBetween(tipX - dx * 14 + dy * 22, tipY - dy * 14 - dx * 22, tipX, tipY);
  }
}

/**
 * 바람개비 줄: 돌 줄을 따라 밧줄 한 가닥을 걸고 양 끝에 기둥을 세운 다음, 돌마다 위에 바람개비를 꽂는다.
 * 줄은 돌이 늘어선 쪽으로 뻗는다(첫 돌에서 마지막 돌까지). 바람개비는 장식이고 뜻을 전하지 않는다
 */
function drawRope(g: Phaser.GameObjects.Graphics, def: PlayInstrumentDef): void {
  const sites = padSitesOf(def);
  const first = sites[0]!;
  const last = sites[sites.length - 1]!;
  const len = Math.hypot(last.x - first.x, last.y - first.y) || 1;
  const dx = (last.x - first.x) / len;
  const dy = (last.y - first.y) / len;
  const reach = PAD_RADIUS + 44;
  const sx = first.x - dx * reach;
  const sy = first.y - dy * reach;
  const ex = last.x + dx * reach;
  const ey = last.y + dy * reach;
  // 밧줄과 그 그림자
  g.lineStyle(7, SLOPE_SHADOW, 1).lineBetween(sx + 6, sy + 10, ex + 6, ey + 10);
  g.lineStyle(7, WOOD, 1).lineBetween(sx, sy, ex, ey);
  // 양 끝의 기둥
  for (const [px, py] of [[sx, sy], [ex, ey]] as const) {
    g.fillStyle(SLOPE_SHADOW, 1).fillRoundedRect(px - 7 + 6, py - 44 + 10, 14, 88, 6);
    g.fillStyle(WOOD_DARK, 1).fillRoundedRect(px - 7, py - 44, 14, 88, 6);
  }
  // 돌마다 바람개비: 막대와 네 날개(두 색을 번갈아)와 가운데 축
  for (const s of sites) {
    const cx = s.x;
    const cy = s.y - PAD_RADIUS - 40;
    g.lineStyle(4, WOOD, 1).lineBetween(cx, cy, cx, s.y - PAD_RADIUS + 4);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const b = a + Math.PI / 4;
      g.fillStyle(k % 2 === 0 ? TEAL : CORAL, 1).fillTriangle(cx, cy, cx + Math.cos(a) * 22, cy + Math.sin(a) * 22, cx + Math.cos(b) * 17, cy + Math.sin(b) * 17);
    }
    g.fillStyle(WHITE, 1).fillCircle(cx, cy, 4);
  }
}

/** 연잎 합창: 돌들을 감싸는 연못과, 돌마다 한 귀퉁이가 터진 연잎 한 장. 연잎의 터진 곳은 연못 가운데를 향한다 */
function drawLilies(g: Phaser.GameObjects.Graphics, def: PlayInstrumentDef): void {
  const radius = Math.max(...def.pads.map((p) => Math.hypot(p.dx, p.dy))) + PAD_RADIUS + 40;
  g.fillStyle(LILY_POND, 1).fillCircle(def.x, def.y, radius);
  g.lineStyle(4, POOL_RING, 1).strokeCircle(def.x, def.y, radius - 14);
  g.lineStyle(3, WATER, 0.35).strokeCircle(def.x, def.y, radius - 30);
  const leaf = PAD_RADIUS + 16;
  for (const p of def.pads) {
    const cx = def.x + p.dx;
    const cy = def.y + p.dy;
    g.fillStyle(MOSS_LIGHT, 1).fillCircle(cx + 6, cy + 9, leaf);
    g.fillStyle(LEAF, 1).fillCircle(cx, cy, leaf);
    g.lineStyle(3, MOSS, 1).strokeCircle(cx, cy, leaf - 2);
    // 터진 곳: 연못 가운데를 향한 쐐기. 연못 색으로 메워 잎이 한 귀퉁이 갈라진 모습을 낸다
    const toward = Math.atan2(-p.dy, -p.dx);
    const half = Math.PI / 14;
    g.fillStyle(LILY_POND, 1).fillTriangle(cx, cy, cx + Math.cos(toward - half) * (leaf + 2), cy + Math.sin(toward - half) * (leaf + 2), cx + Math.cos(toward + half) * (leaf + 2), cy + Math.sin(toward + half) * (leaf + 2));
  }
}

/** 물방울 북 자리의 물: 연한 물빛 바닥과 겹물결. 돌들이 이 물 위에 놓인다 */
function drawPool(g: Phaser.GameObjects.Graphics, def: PlayInstrumentDef): void {
  const radius = Math.max(...def.pads.map((p) => Math.hypot(p.dx, p.dy))) + PAD_RADIUS + 28;
  g.fillStyle(POOL, 1).fillCircle(def.x, def.y, radius);
  g.lineStyle(4, POOL_RING, 1).strokeCircle(def.x, def.y, radius - 14);
  g.lineStyle(3, WATER, 0.35).strokeCircle(def.x, def.y, radius - 30);
}
