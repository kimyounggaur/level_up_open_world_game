// 6-9c 놀이 악기(설계서 3.5, 3.6): 목표 없이 소리를 내는 큰 악기다. 마을에는 없고 바깥 지역마다 하나씩 있다
// (6단계는 박자 강가의 물방울 북과 종나무 숲의 메아리 벽, 7-4는 오선 언덕의 높낮이 미끄럼길, 음계 길의 바람개비 줄, 건반 늪의 연잎 합창).
// 바닥에는 올라서면 울리는 돌(패드)이 놓여 있다.
// 판정도 기록도 없다(W-5, '기록 없음. 그냥 논다'): 올라서면 소리가 나고, 찾았다고 적지 않고, 길 가까이 60%를 세는 발견 요소(소리 조각 6, 쪽지 3)에도 들지 않는다.
// 이 파일은 좌표, 음, 시간 계산만 한다(domain은 월드 파일을 모른다). 읽기와 검사는 발견 요소 파일과 함께 discovery.ts가 한다.
import type { Availability, ReviewStatus, RightsStatus } from './content';
import type { RegionId } from './world';
import { BEAT_SEC } from './worldsound';

/** 바깥 지역마다 놀이 악기 하나(3.5). 마을에는 없다 */
export const PLAY_INSTRUMENTS_PER_OUTER_REGION = 1;

// ───── 돌(패드)의 모양 ─────
/** 돌 하나의 반지름(px): 캐릭터의 가운데 점이 이 안에 들면 올라선 것이다 */
export const PAD_RADIUS = 44;
/** 이웃한 돌의 가장자리 사이에 남기는 틈(px). 돌 가운데끼리는 2 × 반지름 + 틈 이상 떨어진다 */
export const PAD_GAP = 16;
export const PAD_COUNT_MIN = 2;
export const PAD_COUNT_MAX = 8;
/** 악기의 가운데에서 돌까지의 가장 먼 거리(px). 한 악기는 한눈에 들어오는 크기다 */
export const PAD_SPREAD_MAX = 300;
/** 돌이 낼 수 있는 음의 범위: C2부터 C6 */
export const PAD_MIDI_MIN = 36;
export const PAD_MIDI_MAX = 84;

// ───── 소리 ─────
export const PAD_VELOCITY = 0.75;
/** 돌 하나가 한 번 울리는 길이(초) */
export const PAD_NOTE_SEC = 0.6;
/** 메아리: 낸 소리를 한 박 뒤에(세계 시계의 박, 80 BPM이면 0.75초) 절반 세기로 되돌려준다 */
export const ECHO_DELAY_BEATS = 1;
export const ECHO_VELOCITY_RATIO = 0.5;
/** 놀이 악기가 쓸 수 있는 음색(세계 음색 가운데 음높이가 있는 것) */
export const PLAY_TIMBRES = ['thump', 'tick', 'wood', 'bell', 'chime', 'handbell', 'kalimba', 'pluck'] as const;
export type PlayTimbre = (typeof PLAY_TIMBRES)[number];

/**
 * 악기 둘레의 바닥: 아무것도 깔지 않는다(none), 물 자리를 깐다(pool, 물방울 북), 오를수록 높아지는 비탈 띠를 깐다(slope, 높낮이 미끄럼길),
 * 돌 줄 위에 밧줄과 바람개비를 건다(rope, 바람개비 줄), 연못에 연잎을 띄운다(lilies, 연잎 합창).
 * 돌 아래에 그려지는 것이라 길과 막힘에는 영향이 없다
 */
export const PLAY_GROUNDS = ['none', 'pool', 'slope', 'rope', 'lilies'] as const;
export type PlayGround = (typeof PLAY_GROUNDS)[number];

export const PLAY_ID_RE = /^play\.([a-z0-9-]+)\.([a-z0-9-]+)$/;

/** 악기의 가운데에서 잰 돌 하나의 자리와 음 */
export interface PadDef {
  dx: number;
  dy: number;
  midi: number;
}

export interface PlayInstrumentDef {
  /** play.beat-river.drum 같은 이름 */
  playId: string;
  regionId: RegionId;
  /** 지도의 표식과 월드에서 읽어 주는 이름 */
  name: string;
  /** 악기의 가운데(월드 px). 설계서의 좌표다 */
  x: number;
  y: number;
  timbre: PlayTimbre;
  /** 돌들. 차례가 돌의 번호(1부터)다 */
  pads: PadDef[];
  /** 낸 소리를 한 박 뒤에 되돌려주는가(메아리 벽) */
  echo: boolean;
  /** 돌 아래에 까는 바닥. 파일에 적지 않으면 none */
  ground: PlayGround;
  /** 과제와 같은 공개 규칙: draft는 미리보기에서만 보인다(11.1) */
  availability: Availability;
  reviewStatus: ReviewStatus;
  rightsStatus: RightsStatus;
}

/** 읽는 쪽이 필요한 만큼만(월드와 소리는 검수 상태를 몰라도 된다) */
export type PlaySource = Pick<PlayInstrumentDef, 'playId' | 'x' | 'y' | 'pads'>;

/** 돌 하나의 월드 자리 */
export interface PadSite {
  /** 1부터 */
  pad: number;
  x: number;
  y: number;
  midi: number;
}

export const padSitesOf = (inst: Pick<PlayInstrumentDef, 'x' | 'y' | 'pads'>): PadSite[] => inst.pads.map((p, i) => ({ pad: i + 1, x: inst.x + p.dx, y: inst.y + p.dy, midi: p.midi }));

/** 월드의 점이 올라선 돌의 번호(1부터). 돌 밖이면 null. 돌은 겹치지 않지만(PAD_GAP) 겹쳐 있어도 더 가까운 돌이 이긴다 */
export function padAtPoint(inst: Pick<PlayInstrumentDef, 'x' | 'y' | 'pads'>, x: number, y: number): number | null {
  let bestPad: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < inst.pads.length; i++) {
    const p = inst.pads[i]!;
    const d = Math.hypot(x - (inst.x + p.dx), y - (inst.y + p.dy));
    if (d <= PAD_RADIUS && d < bestDistance) {
      bestPad = i + 1;
      bestDistance = d;
    }
  }
  return bestPad;
}

/** 돌을 밟았을 때 낼 음 하나: 밟은 순간부터 몇 초 뒤에, 어떤 높이로, 얼마나 세게 */
export interface PadNote {
  midi: number;
  delaySec: number;
  velocity: number;
}

/**
 * 돌 하나(1부터)를 밟았을 때 내는 소리. 바로 한 번, 메아리 악기라면 한 박 뒤에 같은 음이 절반 세기로 한 번 더.
 * 없는 돌이면 빈 목록이다.
 */
export function strikePlan(inst: Pick<PlayInstrumentDef, 'pads' | 'echo'>, pad: number): PadNote[] {
  const p = inst.pads[pad - 1];
  if (!p) return [];
  const out: PadNote[] = [{ midi: p.midi, delaySec: 0, velocity: PAD_VELOCITY }];
  if (inst.echo) out.push({ midi: p.midi, delaySec: ECHO_DELAY_BEATS * BEAT_SEC, velocity: PAD_VELOCITY * ECHO_VELOCITY_RATIO });
  return out;
}
