// 주민(악사) 층(설계서 6.4, 9.3, 12.10 7-6): 지역마다 악사 한 명이 서 있다. 그림은 48×72 칸에 서 있기 2장, 연주 4장이다.
// 누가 연주하는지(그 지역의 층이 1 이상이라 그 성부가 합주에 더해져 있다)는 화면이 정해 다리(WorldBridge.residents)에 올려 두고, 여기서는 읽어서 그리기만 한다.
// 악사는 모양으로 구별한다(색만으로 뜻을 전하지 않는다): 성부마다 악기가 다르고(잔치 무대의 악사와 같은 악기), 연주하는 장에는 머리 위에 음표 표지가 있다.
// 옷 색은 그 지역의 표식 색이다. 잔치 무대의 악사와 달리 눈이 있다: 서 있기는 눈을 뜬 장과 마디 끝에 잠깐 눈을 감은 장, 연주는 박마다 악기가 흔들리는 네 장이다.
// 움직임 줄이기에서는 장을 넘기지 않는다: 서 있기는 눈을 뜬 장, 연주는 연주 첫 장(음표 표지가 있다)에 선다.
// 주민은 길을 막지 않는다(W-1): 걷는 길에 놓인 지형이 아니라 서 있는 그림이다.
import Phaser from 'phaser';
import { residentPose } from '../../domain/residents';
import type { ResidentDef } from '../../domain/residents';
import type { WorldBridge } from '../../platform/bridge';
import { footBox } from '../cull';
import type { ViewCull } from '../cull';
import { INSTRUMENT, drawMusicianBody } from '../festival/layer';
import { MARK_PALETTE } from '../lanterns/layer';
import { depthOfFoot } from '../objects';
import { musicianImage } from '../characterArt';

const { INK, PAPER } = MARK_PALETTE;

/** 연주하는 네 장에서 악기가 있는 자리에서 벗어나는 만큼(월드 px)과 기울기(라디안). 박마다 한 장씩 넘어간다 */
export const PLAY_SWAY: ReadonlyArray<{ dx: number; dy: number; rot: number }> = [
  { dx: -2, dy: 0, rot: -0.06 },
  { dx: 0, dy: -3, rot: 0 },
  { dx: 2, dy: 0, rot: 0.06 },
  { dx: 0, dy: -3, rot: 0 },
];

/** 연주하는 장의 음표 표지가 서는 자리(발치 기준). 악기와 머리 위쪽 가장자리(−54)보다 위, 그림 칸의 위쪽 끝(−72) 안이다 */
export const NOTE_MARK = { x: -12, y: -63 } as const;

export interface DrawnResident {
  residentId: string;
  /** 낭독기와 점검용 이름 */
  name: string;
  /** 발치의 월드 좌표 */
  x: number;
  y: number;
  depth: number;
  /** 지금 연주하는가(그 지역의 층이 1 이상) */
  playing: boolean;
  /** 지금 그린 장: 자세와 그 안의 번호 */
  pose: 'standing' | 'playing';
  frame: number;
  /** 악기가 놓인 자리에서 벗어난 만큼(월드 px, 연주 장에서만 0이 아니다) */
  toolOffset: { x: number; y: number };
  /** 음표 표지가 보이는가 */
  noteVisible: boolean;
}

interface Node {
  def: ResidentDef;
  body: Phaser.GameObjects.Graphics;
  /** Original-sheet figure, when the remaster atlas is available. */
  art: Phaser.GameObjects.Image | null;
  tool: Phaser.GameObjects.Graphics;
  note: Phaser.GameObjects.Graphics;
  /** 지금 그린 자세와 장. 아직 그리지 않았으면 null */
  shown: { pose: 'standing' | 'playing'; frame: number } | null;
  /** 몸에 그린 눈이 감겼는가(바뀔 때만 몸을 다시 그린다) */
  closed: boolean | null;
  playing: boolean;
}

export class ResidentLayer {
  private readonly nodes: Node[] = [];
  private readonly off: () => void;

  constructor(
    scene: Phaser.Scene,
    residents: readonly ResidentDef[],
    bridge: Pick<WorldBridge, 'residents'>,
    private readonly cull: ViewCull,
  ) {
    for (const def of residents) {
      const depth = depthOfFoot(def.y);
      const body = scene.add.graphics().setPosition(def.x, def.y).setDepth(depth);
      const tool = scene.add.graphics().setPosition(def.x, def.y).setDepth(depth);
      INSTRUMENT[def.part](tool);
      const note = scene.add.graphics().setPosition(def.x, def.y).setDepth(depth);
      drawNoteMark(note);
      note.setVisible(false);
      const art = musicianImage(scene, def.part, def.x, def.y)?.setDepth(depth) ?? null;
      if (art) { body.setVisible(false); tool.setVisible(false); note.setDepth(depth + 0.1); }
      const box = footBox(def.x, def.y);
      for (const g of [body, tool, note]) this.cull.track(g, box);
      if (art) this.cull.track(art, box);
      this.nodes.push({ def, body, art, tool, note, shown: null, closed: null, playing: false });
    }
    this.apply(bridge.residents.get());
    this.off = bridge.residents.subscribe((ids) => this.apply(ids));
    // 처음 모습은 서 있기 첫 장이다(update가 시계를 받으면 맞춘다)
    for (const n of this.nodes) this.draw(n, 'standing', 0);
  }

  private apply(ids: readonly string[]): void {
    const playing = new Set(ids);
    for (const n of this.nodes) n.playing = playing.has(n.def.residentId);
  }

  /** 매 프레임: 장을 고른다. 바뀐 장만 다시 그린다 */
  update(clock: number, reduceMotion: boolean): void {
    for (const n of this.nodes) {
      const { pose, frame } = residentPose(n.playing, clock, reduceMotion);
      if (n.shown && n.shown.pose === pose && n.shown.frame === frame) continue;
      this.draw(n, pose, frame);
    }
  }

  private draw(n: Node, pose: 'standing' | 'playing', frame: number): void {
    n.shown = { pose, frame };
    // 몸: 눈을 감은 장(서 있기 둘째 장)만 눈이 감긴다. 눈이 바뀔 때만 다시 그린다
    const closed = pose === 'standing' && frame === 1;
    if (!n.art && n.closed !== closed) {
      n.closed = closed;
      n.body.clear();
      drawMusicianBody(n.body, n.def.part);
      drawEyes(n.body, closed);
    }
    const sway = pose === 'playing' ? PLAY_SWAY[frame % PLAY_SWAY.length]! : { dx: 0, dy: 0, rot: 0 };
    n.tool.setPosition(n.def.x + sway.dx, n.def.y + sway.dy).setRotation(sway.rot);
    // The sheets contain still views, so the original figure moves gently as one piece.
    // Do not invent articulated or blinking frames by painting over the supplied artwork.
    n.art?.setPosition(n.def.x + sway.dx * 0.35, n.def.y + sway.dy * 0.35).setRotation(sway.rot * 0.25);
    n.note.setVisible(pose === 'playing');
  }

  /** 지금 서 있는 주민들(점검용) */
  debug(): DrawnResident[] {
    return this.nodes.map((n) => ({
      residentId: n.def.residentId,
      name: n.def.name,
      x: n.def.x,
      y: n.def.y,
      depth: n.body.depth,
      playing: n.playing,
      pose: n.shown?.pose ?? 'standing',
      frame: n.shown?.frame ?? 0,
      toolOffset: { x: n.tool.x - n.def.x, y: n.tool.y - n.def.y },
      noteVisible: n.note.visible,
    }));
  }

  destroy(): void {
    this.off();
    for (const n of this.nodes.splice(0)) {
      for (const g of [n.body, n.tool, n.note, ...(n.art ? [n.art] : [])]) {
        this.cull.untrack(g);
        g.destroy();
      }
    }
  }
}

/** 눈 둘. 눈을 뜬 장은 점, 감은 장은 짧은 가로선이다 */
function drawEyes(g: Phaser.GameObjects.Graphics, closed: boolean): void {
  if (closed) {
    g.lineStyle(2, INK, 1);
    g.lineBetween(-5.5, -46, -1.5, -46);
    g.lineBetween(1.5, -46, 5.5, -46);
    return;
  }
  g.fillStyle(INK, 1).fillCircle(-3.5, -46, 1.7).fillCircle(3.5, -46, 1.7);
}

/** 연주하는 장의 음표 표지: 채운 음표 머리와 줄기와 깃발. 발치가 (0, 0)이다 */
function drawNoteMark(g: Phaser.GameObjects.Graphics): void {
  const { x, y } = NOTE_MARK;
  g.fillStyle(PAPER, 1).fillEllipse(x, y + 5, 10, 7.5);
  g.lineStyle(2, INK, 1).strokeEllipse(x, y + 5, 10, 7.5);
  g.fillStyle(INK, 1).fillEllipse(x, y + 5, 7, 5);
  g.lineStyle(2.5, INK, 1).lineBetween(x + 4.2, y + 4, x + 4.2, y - 9);
  g.lineBetween(x + 4.2, y - 9, x + 10, y - 5);
}
