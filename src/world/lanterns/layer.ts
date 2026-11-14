// 등불 층(설계서 4.2, 6.1): 정거장마다 곁에 서 있는 등불을 그린다. 어떤 등불이 어떤 모습인지는 화면이 통과 기록과
// 다녀간 정거장에서 계산해 다리(WorldBridge.lanterns)에 올려 두고, 여기서는 읽어서 옮겨 그리기만 한다. 바뀔 때만 다시 그린다.
// 색만으로 뜻을 전하지 않는다: 꺼짐은 속이 빈 종이색 고리, 켜짐은 불빛이 찬 등과 빛살, 꽃등은 켜진 등에 꽃잎이 둘려 있다.
import Phaser from 'phaser';
import type { LanternState } from '../../domain/reaction';
import type { WorldBridge } from '../../platform/bridge';
import { footBox } from '../cull';
import type { ViewCull } from '../cull';
import { depthOfFoot } from '../objects';

/** 등불이 서는 자리를 정하는 데 필요한 정거장의 값 */
export interface LanternSite {
  stationId: string;
  x: number;
  y: number;
}

/** 정거장 점에서 등불 발치까지. 서는 자리(정거장 점)를 비켜 선다 */
export const LANTERN_OFFSET = { x: -44, y: -30 } as const;

const POST = 0x6b7a77;
const INK = 0x243c3a;
const PAPER = 0xf4f3ea;
const GOLD = 0xe6b94c;
const GOLD_LIGHT = 0xfbe7a1;
const CORAL = 0xb8644a;
const CORAL_LIGHT = 0xf3c9b8;

/** 등과 발견 표식이 함께 쓰는 색(같은 그림말: 속이 빈 것은 아직, 불빛이 찬 것은 이미) */
export const MARK_PALETTE = { POST, INK, PAPER, GOLD, GOLD_LIGHT, CORAL, CORAL_LIGHT } as const;

/** 등 머리 가운데의 높이(발치에서 위로)와 반지름 */
const HEAD_Y = -40;
const HEAD_R = 11;

export interface DrawnLantern {
  stationId: string;
  state: LanternState;
  /** 발치의 월드 좌표 */
  x: number;
  y: number;
  /** 겹침 순서(발 위치 y) */
  depth: number;
}

interface Node {
  site: LanternSite;
  g: Phaser.GameObjects.Graphics;
  state: LanternState | null;
}

export class LanternLayer {
  private readonly nodes: Node[] = [];
  private readonly off: () => void;

  /** offset은 정거장 점에서 등 발치까지. 정거장 곁의 등은 기본값(서는 자리를 비켜 선다), 광장 둘레의 등은 {0, 0}(자리가 곧 발치) */
  constructor(
    scene: Phaser.Scene,
    sites: readonly LanternSite[],
    bridge: Pick<WorldBridge, 'lanterns'>,
    private readonly cull: ViewCull,
    offset: { readonly x: number; readonly y: number } = LANTERN_OFFSET,
  ) {
    for (const site of sites) {
      const x = site.x + offset.x;
      const y = site.y + offset.y;
      const g = scene.add.graphics().setPosition(x, y).setDepth(depthOfFoot(y));
      this.cull.track(g, footBox(x, y));
      this.nodes.push({ site, g, state: null });
    }
    this.apply(bridge.lanterns.get());
    this.off = bridge.lanterns.subscribe((l) => this.apply(l));
  }

  private apply(states: Readonly<Record<string, LanternState>>): void {
    for (const n of this.nodes) {
      const next: LanternState = states[n.site.stationId] ?? 'off';
      if (n.state === next) continue;
      n.state = next;
      draw(n.g, next);
    }
  }

  /** 지금 그린 것(점검용) */
  debug(): DrawnLantern[] {
    return this.nodes.map((n) => ({ stationId: n.site.stationId, state: n.state ?? 'off', x: n.g.x, y: n.g.y, depth: n.g.depth }));
  }

  destroy(): void {
    this.off();
    for (const n of this.nodes.splice(0)) {
      this.cull.untrack(n.g);
      n.g.destroy();
    }
  }
}

/** 햇살 과슈 화풍(D-308)의 그늘색과 쇠 기둥, 놋쇠 갓, 받침 돌. 모양의 뜻(빈 고리 · 찬 등 · 꽃잎)은 그대로다 */
const SHADE = 0x3e5a5c;
const IRON = 0x55525c;
const IRON_LIGHT = 0x8a8692;
const BRASS = 0xc9a24e;
const BRASS_LIGHT = 0xf0d58c;
const FOOT_STONE = 0xe4d9bd;
const FOOT_STONE_DARK = 0xc9bb98;

/** 발치가 (0, 0)인 등 하나를 그린다 */
function draw(g: Phaser.GameObjects.Graphics, state: LanternState): void {
  g.clear();
  // 그림자(해가 왼쪽 위라 오른쪽 아래로), 받침 돌, 쇠 기둥(왼쪽 볕)
  g.fillStyle(SHADE, 0.14).fillEllipse(5, 3, 32, 10);
  g.fillStyle(SHADE, 0.12).fillEllipse(3, 2, 20, 6);
  g.fillStyle(FOOT_STONE, 1).fillRoundedRect(-6, -4, 12, 6, 2);
  g.fillStyle(FOOT_STONE_DARK, 1).fillRoundedRect(0, -4, 6, 6, { tl: 0, tr: 2, bl: 0, br: 2 });
  g.fillStyle(IRON, 1).fillRect(-2, HEAD_Y + HEAD_R, 4, -HEAD_Y - HEAD_R - 3);
  g.fillStyle(IRON_LIGHT, 1).fillRect(-2, HEAD_Y + HEAD_R, 1.4, -HEAD_Y - HEAD_R - 3);
  if (state === 'flower') {
    // 꽃잎 여섯 장: 켜진 등을 둘러싸고, 가운데 등은 그 위에 다시 그린다
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * (HEAD_R + 9);
      const py = HEAD_Y + Math.sin(a) * (HEAD_R + 9);
      g.fillStyle(CORAL_LIGHT, 1).fillCircle(px, py, 8);
      g.lineStyle(2, CORAL, 1).strokeCircle(px, py, 8);
    }
  }
  if (state === 'off') {
    g.fillStyle(PAPER, 1).fillCircle(0, HEAD_Y, HEAD_R);
    g.fillStyle(SHADE, 0.08).fillCircle(2.5, HEAD_Y + 2.5, HEAD_R - 3);
    g.lineStyle(3, IRON, 1).strokeCircle(0, HEAD_Y, HEAD_R);
    cap(g);
    g.fillStyle(0xffffff, 0.9).fillCircle(-4, HEAD_Y - 4, 2);
    return;
  }
  // 켜진 등: 번지는 불빛, 빛살 넷, 불빛이 찬 등
  if (state === 'on') {
    g.fillStyle(GOLD, 0.22).fillCircle(0, HEAD_Y, HEAD_R + 12);
    g.lineStyle(3, GOLD, 1);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      g.lineBetween(Math.cos(a) * (HEAD_R + 5), HEAD_Y + Math.sin(a) * (HEAD_R + 5), Math.cos(a) * (HEAD_R + 12), HEAD_Y + Math.sin(a) * (HEAD_R + 12));
    }
  }
  g.fillStyle(GOLD_LIGHT, 1).fillCircle(0, HEAD_Y, HEAD_R);
  g.fillStyle(0xfff6d8, 1).fillCircle(-1.5, HEAD_Y - 1.5, HEAD_R - 4);
  g.lineStyle(3, INK, 1).strokeCircle(0, HEAD_Y, HEAD_R);
  g.fillStyle(GOLD, 1).fillCircle(0, HEAD_Y, 4);
  cap(g);
  g.fillStyle(0xffffff, 0.95).fillCircle(-4, HEAD_Y - 4, 2);
}

/** 등 머리 위의 놋쇠 갓과 꼭지 */
function cap(g: Phaser.GameObjects.Graphics): void {
  const top = HEAD_Y - HEAD_R - 3;
  g.fillStyle(BRASS, 1).fillRoundedRect(-7, top - 2, 14, 5, 2.5);
  g.fillStyle(BRASS_LIGHT, 1).fillRoundedRect(-7, top - 2, 7, 2, 1);
  g.fillStyle(BRASS, 1).fillCircle(0, top - 4, 2.2);
}
