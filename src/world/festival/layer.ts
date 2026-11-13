// 잔치 층(설계서 6.4): 합주 잔치가 열려 있는 동안 악사들이 합주 무대 위에 선다. 누가 서는지(지금 실제로 울리는 성부)는 화면이 정해
// 다리(WorldBridge.festival)에 올려 두고, 여기서는 읽어서 세우고 내리기만 한다. 잔치가 끝나면 모두 내려온다.
// 악사는 모양으로 구별한다(색만으로 뜻을 전하지 않는다): 북 악사는 둥근 북과 북채, 화음 악사는 손잡이가 달린 종, 타악 악사는 방울이 달린 둥근 틀,
// 베이스 악사는 곁에 세운 큰 현악기, 가락 악사는 입에 문 가로 피리, 달리는 음 악사는 계단 모양의 실로폰, 꾸밈음 악사는 삼각 방울(7-5).
// 옷 색은 그 성부를 맡은 지역의 표식 색이다. 이름은 화면의 잔치 카드가 글로도 알린다.
// 박(4분음표 80 = 0.75초)마다 살짝 뛴다. 움직임 줄이기에서는 뛰지 않고 서 있기만 한다.
import Phaser from 'phaser';
import { MUSICIAN_NAME_KO, musicianSpots } from '../../domain/festival';
import type { MusicianPart, StageFloor } from '../../domain/festival';
import { BAR_SEC } from '../../domain/worldsound';
import type { FestivalWorld, WorldBridge } from '../../platform/bridge';
import { MARK_PALETTE } from '../lanterns/layer';
import { depthOfFoot } from '../objects';

const { INK, PAPER, GOLD, GOLD_LIGHT, CORAL, CORAL_LIGHT } = MARK_PALETTE;
const TEAL = 0x17675d;
const TEAL_LIGHT = 0xe1efe6;
const WOOD = 0x9a6b45;
const SILVER = 0xdfe7e4;
/** 악사의 옷: 성부를 맡은 지역의 표식 색(content/regions의 accentColor). 북 악사와 화음 악사는 5-6에서 정한 색 그대로다 */
const ROBE: Readonly<Record<MusicianPart, number>> = {
  pulse: TEAL,
  bed: GOLD,
  percussion: 0x5e97a6,
  bass: 0xb18b49,
  melody: 0x7f9a7a,
  runner: 0xc2aa70,
  ornament: 0x8e86a8,
};

/** 한 박(초): 마디가 4박이다 */
const BEAT_SEC = BAR_SEC / 4;
/** 박마다 뛰는 높이(월드 px) */
export const MUSICIAN_HOP = 4;

export interface DrawnMusician {
  part: MusicianPart;
  /** 낭독기와 점검용 이름 */
  name: string;
  /** 발치의 월드 좌표(뛰는 높이는 lift로 따로 적는다) */
  x: number;
  y: number;
  depth: number;
  /** 지금 발이 땅에서 떠 있는 높이(월드 px). 움직임 줄이기에서는 늘 0 */
  lift: number;
}

interface Node {
  part: MusicianPart;
  g: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  lift: number;
}

export class FestivalLayer {
  private nodes: Node[] = [];
  private shown: FestivalWorld | null = null;
  private readonly off: () => void;

  /** floor가 null이면(무대가 없는 채널) 아무것도 세우지 않는다 */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly floor: StageFloor | null,
    bridge: Pick<WorldBridge, 'festival'>,
  ) {
    this.apply(bridge.festival.get());
    this.off = bridge.festival.subscribe((f) => this.apply(f));
  }

  private apply(f: FestivalWorld): void {
    // 같은 악사들이 서 있으면 다시 그리지 않는다
    if (this.shown && this.shown.active === f.active && sameParts(this.shown.musicians, f.musicians)) return;
    this.shown = f;
    this.clear();
    if (!f.active || !this.floor) return;
    const spots = musicianSpots(this.floor, f.musicians.length);
    f.musicians.forEach((part, i) => {
      const spot = spots[i]!;
      const g = this.scene.add.graphics().setPosition(spot.x, spot.y).setDepth(depthOfFoot(spot.y));
      drawMusician(g, part);
      this.nodes.push({ part, g, x: spot.x, y: spot.y, lift: 0 });
    });
  }

  /** 매 프레임: 박마다 뛴다. 이웃한 악사는 반 박씩 어긋나게 뛴다 */
  update(clock: number, reduceMotion: boolean): void {
    this.nodes.forEach((n, i) => {
      const lift = reduceMotion ? 0 : Math.abs(Math.sin(Math.PI * (clock / BEAT_SEC + i * 0.5))) * MUSICIAN_HOP;
      if (lift === n.lift) return;
      n.lift = lift;
      n.g.setY(n.y - lift);
    });
  }

  /** 지금 서 있는 악사들(점검용) */
  debug(): DrawnMusician[] {
    return this.nodes.map((n) => ({ part: n.part, name: MUSICIAN_NAME_KO[n.part], x: n.x, y: n.y, depth: n.g.depth, lift: n.lift }));
  }

  private clear(): void {
    for (const n of this.nodes.splice(0)) n.g.destroy();
  }

  destroy(): void {
    this.off();
    this.clear();
  }
}

function sameParts(a: readonly MusicianPart[], b: readonly MusicianPart[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

/** 발치가 (0, 0)인 악사의 몸: 그림자, 둥근 옷, 머리. 악기는 그리지 않는다(주민 층도 같은 몸에 눈을 더해 쓴다, 7-6) */
export function drawMusicianBody(g: Phaser.GameObjects.Graphics, part: MusicianPart): void {
  g.fillStyle(INK, 0.14).fillEllipse(0, 3, 44, 12);
  // 몸: 둥근 옷
  g.fillStyle(ROBE[part], 1).fillRoundedRect(-14, -36, 28, 32, 9);
  g.lineStyle(3, INK, 1).strokeRoundedRect(-14, -36, 28, 32, 9);
  // 머리
  g.fillStyle(PAPER, 1).fillCircle(0, -45, 9);
  g.lineStyle(3, INK, 1).strokeCircle(0, -45, 9);
}

/** 발치가 (0, 0)인 악사 하나: 몸과 성부를 가리키는 악기 */
function drawMusician(g: Phaser.GameObjects.Graphics, part: MusicianPart): void {
  drawMusicianBody(g, part);
  INSTRUMENT[part](g);
}

/**
 * 성부마다 다른 악기(모양으로 구별한다). 발치가 (0, 0)이고 몸 앞에 그린다. 그림 전체가 가운데에서 왼쪽 23 px(북채)부터 오른쪽 29.5 px(피리)까지다.
 * 악사 일곱이 간격 46 px로 서도 이웃한 악사의 그림끼리 겹치지 않는다(`festival-layer.test.ts`가 악사의 모든 부분 집합 64가지에서 모양마다의 겉 상자로 본다).
 */
export const INSTRUMENT: Readonly<Record<MusicianPart, (g: Phaser.GameObjects.Graphics) => void>> = {
  pulse: drawDrum,
  bed: drawBell,
  percussion: drawTambourine,
  bass: drawBass,
  melody: drawFlute,
  runner: drawXylophone,
  ornament: drawTriangle,
};

/** 북 악사: 몸 앞의 둥근 북(옆면과 윗면의 타원)과 북채 둘 */
function drawDrum(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(CORAL, 1).fillRect(-15, -22, 30, 14);
  g.lineStyle(3, INK, 1).strokeRect(-15, -22, 30, 14);
  g.fillStyle(CORAL_LIGHT, 1).fillEllipse(0, -22, 30, 10);
  g.lineStyle(3, INK, 1).strokeEllipse(0, -22, 30, 10);
  // 북채
  g.lineStyle(3, INK, 1);
  g.lineBetween(-20, -38, -8, -24);
  g.lineBetween(20, -38, 8, -24);
  g.fillStyle(INK, 1).fillCircle(-20, -38, 3).fillCircle(20, -38, 3);
}

/** 화음 악사: 몸 앞에 든 종(꼭대기 손잡이, 둥근 머리, 넓은 가장자리, 추) */
function drawBell(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(GOLD_LIGHT, 1);
  g.beginPath();
  g.moveTo(-14, -9);
  g.lineTo(-10, -22);
  g.lineTo(-5, -29);
  g.lineTo(0, -31);
  g.lineTo(5, -29);
  g.lineTo(10, -22);
  g.lineTo(14, -9);
  g.closePath();
  g.fillPath();
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.moveTo(-14, -9);
  g.lineTo(-10, -22);
  g.lineTo(-5, -29);
  g.lineTo(0, -31);
  g.lineTo(5, -29);
  g.lineTo(10, -22);
  g.lineTo(14, -9);
  g.closePath();
  g.strokePath();
  g.fillStyle(TEAL_LIGHT, 1).fillRect(-3, -35, 6, 5);
  g.lineStyle(3, INK, 1).strokeRect(-3, -35, 6, 5);
  g.fillStyle(INK, 1).fillCircle(0, -7, 3);
}

/** 타악 악사: 몸 앞의 둥근 틀과 가장자리의 방울 넷 */
function drawTambourine(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(PAPER, 1).fillCircle(0, -21, 12);
  g.lineStyle(3, INK, 1).strokeCircle(0, -21, 12);
  g.fillStyle(CORAL_LIGHT, 1).fillCircle(0, -21, 6);
  g.lineStyle(2, INK, 1).strokeCircle(0, -21, 6);
  for (const [dx, dy] of [[-12, 0], [12, 0], [0, -12], [0, 12]] as const) {
    g.fillStyle(GOLD, 1).fillCircle(dx, -21 + dy, 3.2);
    g.lineStyle(2, INK, 1).strokeCircle(dx, -21 + dy, 3.2);
  }
}

/** 베이스 악사: 몸 오른쪽에 세운 큰 현악기(아래가 넓은 두 겹의 몸통, 위로 곧게 뻗은 목, 꼭대기의 감는 틀) */
function drawBass(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WOOD, 1).fillEllipse(14, -13, 19, 20).fillEllipse(14, -27, 13, 14);
  g.lineStyle(3, INK, 1).strokeEllipse(14, -13, 19, 20).strokeEllipse(14, -27, 13, 14);
  // 몸통 가운데를 덮어 두 겹이 한 몸으로 보이게 한다
  g.fillStyle(WOOD, 1).fillRect(8, -25, 12, 9);
  // 목과 감는 틀
  g.fillStyle(INK, 1).fillRect(12.5, -52, 3, 26);
  g.fillStyle(INK, 1).fillCircle(14, -54, 3.5);
  // 현과 줄받이
  g.lineStyle(2, PAPER, 1).lineBetween(14, -34, 14, -10);
  g.lineStyle(2, INK, 1).lineBetween(9, -9, 19, -9);
}

/** 가락 악사: 입에 문 가로 피리(길쭉한 대롱과 구멍 셋) */
function drawFlute(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(SILVER, 1).fillRoundedRect(-3, -48, 31, 6, 3);
  g.lineStyle(3, INK, 1).strokeRoundedRect(-3, -48, 31, 6, 3);
  g.fillStyle(INK, 1).fillCircle(10, -45, 1.6).fillCircle(15, -45, 1.6).fillCircle(20, -45, 1.6);
}

/** 달리는 음 악사: 몸 앞의 계단 모양 실로폰(키가 점점 큰 건반 다섯 개)과 채 하나 */
function drawXylophone(g: Phaser.GameObjects.Graphics): void {
  for (let i = 0; i < 5; i++) {
    const h = 8 + i * 4;
    const x = -17 + i * 7;
    g.fillStyle(i % 2 === 0 ? TEAL_LIGHT : GOLD_LIGHT, 1).fillRect(x, -8 - h, 6, h);
    g.lineStyle(2, INK, 1).strokeRect(x, -8 - h, 6, h);
  }
  g.lineStyle(3, INK, 1).lineBetween(-18, -8, 18, -8);
  // 채: 오른쪽 위에서 건반으로 내려오는 막대
  g.lineStyle(3, INK, 1).lineBetween(24, -40, 14, -28);
  g.fillStyle(INK, 1).fillCircle(24, -40, 3);
}

/** 꾸밈음 악사: 몸 앞의 삼각 방울(속이 빈 세모)과 두드리는 채 */
function drawTriangle(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(5, INK, 1).strokeTriangle(0, -33, -14, -9, 14, -9);
  g.lineStyle(2, GOLD_LIGHT, 1).strokeTriangle(0, -33, -14, -9, 14, -9);
  g.lineStyle(3, INK, 1).lineBetween(26, -30, 12, -16);
  g.fillStyle(INK, 1).fillCircle(26, -30, 3);
}

