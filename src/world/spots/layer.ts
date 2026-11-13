// 발견 표식과 광장 게시판을 그리는 층(설계서 3.6, 6.1, 9.2 '색만으로 뜻을 전하지 않는다'): 자리마다 표식 하나를 서 있게 한다.
// 찾았는지(bridge.found)와 게시판에 걸린 곡(bridge.board)은 화면이 알려 주고, 여기서는 읽어서 옮겨 그리기만 한다. 바뀔 때만 다시 그린다.
// 그림말은 등불과 같다: 속이 빈 윤곽은 아직, 불빛이 차고 빛살이 있는 것은 이미. 그래서 색을 못 보아도 찾은 것을 알아볼 수 있다.
//  - 소리 조각: 받침돌 위의 음표. 못 찾았으면 속이 빈 음표, 찾았으면 채운 음표와 빛살.
//  - 개념 쪽지: 기둥에 달린 종이 쪽지. 못 찾았으면 빈 종이, 찾았으면 불빛 색 종이에 글줄 셋.
//  - 광장 게시판: 두 기둥 사이의 널빤지. 저장한 곡마다 종이 쪽지가 하나씩 걸린다(12개까지 그리고, 더 많아도 12개로 보인다).
import Phaser from 'phaser';
import type { WorldSpot } from '../../domain/discovery';
import type { SpotKind } from '../../domain/world';
import type { WorldBridge } from '../../platform/bridge';
import { footBox } from '../cull';
import type { ViewCull } from '../cull';
import { MARK_PALETTE } from '../lanterns/layer';
import { depthOfFoot } from '../objects';

const { POST, INK, PAPER, GOLD, GOLD_LIGHT } = MARK_PALETTE;
const WOOD = 0xb99b6b;
const WOOD_DARK = 0x6d5a3c;
const STONE = 0xc9cdc4;

/** 게시판에 그리는 쪽지의 최대 수. 널빤지에 두 줄로 건다 */
export const BOARD_TAG_MAX = 12;
const BOARD_TAG_COLUMNS = 6;

export interface DrawnSpot {
  id: string;
  kind: SpotKind;
  /** 발견 요소이면 어떤 것인가 */
  discovery?: 'soundPiece' | 'conceptNote';
  /** 찾은 표식인가. 게시판은 항상 false */
  found: boolean;
  /** 게시판에 걸려 보이는 쪽지 수. 게시판이 아니면 0 */
  tags: number;
  /** 발치의 월드 좌표 */
  x: number;
  y: number;
  /** 겹침 순서(발 위치 y) */
  depth: number;
}

interface Node {
  spot: WorldSpot;
  g: Phaser.GameObjects.Graphics;
  found: boolean;
  tags: number;
  /** 아직 한 번도 그리지 않았다 */
  fresh: boolean;
}

export class SpotLayer {
  private readonly nodes: Node[] = [];
  private readonly offs: Array<() => void> = [];

  constructor(
    scene: Phaser.Scene,
    spots: readonly WorldSpot[],
    bridge: Pick<WorldBridge, 'found' | 'board'>,
    private readonly cull: ViewCull,
  ) {
    for (const spot of spots) {
      // 주민(7-6)은 따로 둔 주민 층이 그린다
      if (spot.kind === 'resident') continue;
      const g = scene.add.graphics().setPosition(spot.x, spot.y).setDepth(depthOfFoot(spot.y));
      this.cull.track(g, footBox(spot.x, spot.y));
      this.nodes.push({ spot, g, found: false, tags: 0, fresh: true });
    }
    this.applyFound(bridge.found.get());
    this.applyBoard(bridge.board.get());
    this.offs.push(
      bridge.found.subscribe((f) => this.applyFound(f)),
      bridge.board.subscribe((b) => this.applyBoard(b)),
    );
  }

  private applyFound(found: ReadonlySet<string>): void {
    for (const n of this.nodes) {
      if (n.spot.kind !== 'discovery') continue;
      const next = found.has(n.spot.id);
      if (!n.fresh && n.found === next) continue;
      n.fresh = false;
      n.found = next;
      if (n.spot.discovery === 'conceptNote') drawNote(n.g, next);
      else drawPiece(n.g, next);
    }
  }

  private applyBoard(ids: readonly string[]): void {
    const tags = Math.min(ids.length, BOARD_TAG_MAX);
    for (const n of this.nodes) {
      if (n.spot.kind !== 'board') continue;
      if (!n.fresh && n.tags === tags) continue;
      n.fresh = false;
      n.tags = tags;
      drawBoard(n.g, tags);
    }
  }

  /** 지금 그린 것(점검용) */
  debug(): DrawnSpot[] {
    return this.nodes.map((n) => ({
      id: n.spot.id,
      kind: n.spot.kind,
      ...(n.spot.discovery ? { discovery: n.spot.discovery } : {}),
      found: n.found,
      tags: n.tags,
      x: n.g.x,
      y: n.g.y,
      depth: n.g.depth,
    }));
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    for (const n of this.nodes.splice(0)) {
      this.cull.untrack(n.g);
      n.g.destroy();
    }
  }
}

/** 발치가 (0, 0)인 소리 조각 하나를 그린다 */
function drawPiece(g: Phaser.GameObjects.Graphics, found: boolean): void {
  g.clear();
  g.fillStyle(INK, 0.14).fillEllipse(0, 3, 38, 12);
  g.fillStyle(STONE, 1).fillEllipse(0, -2, 32, 14);
  g.lineStyle(2, POST, 1).strokeEllipse(0, -2, 32, 14);
  const headX = -5;
  const headY = -26;
  if (found) {
    // 번지는 불빛과 빛살 넷
    g.fillStyle(GOLD, 0.22).fillCircle(0, headY - 8, 26);
    g.lineStyle(3, GOLD, 1);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      g.lineBetween(Math.cos(a) * 30, headY - 8 + Math.sin(a) * 30, Math.cos(a) * 38, headY - 8 + Math.sin(a) * 38);
    }
  }
  // 음표: 머리, 줄기, 깃발. 못 찾았으면 머리가 속이 빈 종이색, 찾았으면 채운 먹색
  g.fillStyle(found ? INK : PAPER, 1).fillCircle(headX, headY, 7);
  g.lineStyle(3, INK, 1).strokeCircle(headX, headY, 7);
  g.lineBetween(headX + 6, headY - 1, headX + 6, headY - 30);
  g.lineBetween(headX + 6, headY - 30, headX + 15, headY - 22);
}

/** 발치가 (0, 0)인 개념 쪽지 하나를 그린다 */
function drawNote(g: Phaser.GameObjects.Graphics, found: boolean): void {
  g.clear();
  g.fillStyle(INK, 0.14).fillEllipse(0, 3, 30, 10);
  g.fillStyle(POST, 1).fillRect(-2, -52, 4, 52);
  const w = 30;
  const h = 34;
  const top = -56;
  if (found) {
    g.fillStyle(GOLD, 0.22).fillCircle(0, top + h / 2, 30);
  }
  g.fillStyle(found ? GOLD_LIGHT : PAPER, 1).fillRect(-w / 2, top, w, h);
  g.lineStyle(3, INK, 1).strokeRect(-w / 2, top, w, h);
  if (found) {
    // 글줄 셋: 쪽지에 글이 적혔다는 모양
    g.lineStyle(2, INK, 1);
    for (let i = 0; i < 3; i++) g.lineBetween(-w / 2 + 6, top + 9 + i * 8, w / 2 - 6, top + 9 + i * 8);
  }
}

/** 발치가 (0, 0)인 광장 게시판을 그린다. 쪽지는 두 줄로, 위 줄부터 왼쪽에서 오른쪽으로 걸린다 */
function drawBoard(g: Phaser.GameObjects.Graphics, tags: number): void {
  g.clear();
  g.fillStyle(INK, 0.14).fillEllipse(0, 4, 150, 14);
  const w = 132;
  const h = 70;
  const top = -h - 28;
  g.fillStyle(WOOD_DARK, 1).fillRect(-w / 2 + 8, top + h, 8, 28).fillRect(w / 2 - 16, top + h, 8, 28);
  g.fillStyle(WOOD, 1).fillRoundedRect(-w / 2, top, w, h, 6);
  g.lineStyle(3, INK, 1).strokeRoundedRect(-w / 2, top, w, h, 6);
  const tagW = 14;
  const tagH = 20;
  const gap = (w - 16 - BOARD_TAG_COLUMNS * tagW) / (BOARD_TAG_COLUMNS - 1);
  for (let i = 0; i < tags; i++) {
    const col = i % BOARD_TAG_COLUMNS;
    const row = Math.floor(i / BOARD_TAG_COLUMNS);
    const x = -w / 2 + 8 + col * (tagW + gap);
    const y = top + 8 + row * (tagH + 8);
    g.fillStyle(GOLD_LIGHT, 1).fillRect(x, y, tagW, tagH);
    g.lineStyle(2, INK, 1).strokeRect(x, y, tagW, tagH);
    g.fillStyle(INK, 1).fillCircle(x + tagW / 2, y + 3, 1.5); // 압정
  }
}
