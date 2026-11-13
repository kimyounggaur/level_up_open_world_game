// 소리 계층이 서로 주고받는 작은 약속. 실제 오디오 장치와 가짜 시계 테스트가 같은 약속을 쓴다.
import type { NatureTimbre, SignatureTimbre } from '../domain/worldsound';

/** 오디오 시계. 단위는 초이고 앞으로만 간다. 화면 프레임이 아니라 오디오 장치의 시간이다(8.2). */
export interface AudioClock {
  now(): number;
}

/** 일정한 간격으로 부르는 장치. 돌려주는 함수를 부르면 멈춘다. */
export interface IntervalTimer {
  start(callback: () => void, intervalMs: number): () => void;
}

export interface NoteRequest {
  /** 같은 음을 두 번 예약하지 않았는지 확인하는 데 쓰는 이름 */
  id: string;
  midi: number;
  /** 오디오 시계 기준 시작 시각(초) */
  time: number;
  /** 초 */
  duration: number;
  /** 0–1 */
  velocity: number;
  /** 좌우(−1 왼쪽 끝, 1 오른쪽 끝). 좌우를 낼 수 있는 소리 받이(SinkOptions.pan)만 따른다. 없으면 가운데 */
  pan?: number;
}

/** 음을 받아 소리로 바꾸는 쪽. 예약을 취소할 수 있어야 한다. */
export interface NoteSink {
  schedule(req: NoteRequest): void;
  /** 아직 울리지 않은 예약을 모두 지우고, 울리고 있는 음은 짧게 줄여 끈다. */
  cancelAll(): void;
  /** 이 소리 받이 전체의 크기(dB)를 rampSec에 걸쳐 바꾼다. -Infinity는 무음. 지원하지 않는 받이는 아무것도 하지 않는다 */
  setLevel?(db: number, rampSec: number): void;
}

/**
 * 배음으로 만드는 음색의 이름. 'task'는 과제용 합성음이고 나머지는 세계용이다(8.5).
 * 'tick'은 타악, 'bass'는 베이스(6-8), 'lead'는 가락, 'run'은 달리는 음, 'spark'는 꾸밈음(7-4), 'fork'는 기준음 탑의 울림(7-4)
 */
export type ToneTimbreId = 'task' | 'pad' | 'thump' | 'tick' | 'bass' | 'lead' | 'run' | 'spark' | 'fork' | SignatureTimbre;
/**
 * 소음을 걸러 만드는 자연음의 이름: 강의 물소리, 숲의 바람 소리(6-8), 언덕의 바람결, 길가의 풀 소리, 늪의 안개 소리(7-4).
 * 음이 아니라 거르는 높이를 받는다
 */
export type NoiseTimbreId = NatureTimbre;
export type TimbreId = ToneTimbreId | NoiseTimbreId;

export const NOISE_TIMBRE_IDS: readonly NoiseTimbreId[] = ['river', 'wind', 'breeze', 'grass', 'mist'];
export const isNoiseTimbre = (id: TimbreId | undefined): id is NoiseTimbreId => id !== undefined && (NOISE_TIMBRE_IDS as readonly string[]).includes(id);

export interface SinkOptions {
  /** 기본은 과제용 음색 */
  timbre?: TimbreId;
  /** 음마다 좌우를 정할 수 있게 한다(서명 소리의 거리감, 8.4) */
  pan?: boolean;
}

export const SILENT_SINK: NoteSink = {
  schedule() {},
  cancelAll() {},
};

export type { PlayNote } from '../domain/playback';
