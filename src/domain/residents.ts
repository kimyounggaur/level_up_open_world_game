// 7-6 주민(악사) 여섯 명과 한 줄 안내(설계서 1.5, 6.6, 9.3, 12.10, 결정 D-7).
// 지역마다 악사 한 명이 선다. 다가가 E나 누르기로 말을 걸면 한 줄만 말한다. 끝내야 하는 줄거리도, 고르는 대화도 없다(1.5).
// 안내는 사실과 추천 이유만 말한다(W-9). 능력이나 나이를 추정하지 않고, 잘했다 못했다, 해야 한다고도 말하지 않는다.
//  1. 그 지역에 추천(6.6)이 있으면 그 과제가 어디 있는지와 추천의 이유 한 줄(recommend.ts가 붙이는 이유 그대로).
//  2. 없으면 그 지역의 층에 대한 사실 한 줄(합주에 더해진 성부와 층).
// 추천은 목록의 순서를 바꾸고 이유를 붙이는 일만 한다: 주민도 아무것도 막거나 경고하지 않는다. 말을 걸어도 저장에 적지 않고 열리거나 닫히는 것이 없다(W-1, W-5).
// 그림은 서 있기 2장, 연주 4장이고(9.3) 연주는 그 지역의 층이 1 이상일 때, 곧 그 성부가 합주에 더해져 있을 때다.
import { hasBatchim } from './feedback';
import { MUSICIAN_NAME_KO } from './festival';
import type { MusicianPart } from './festival';
import { recommend } from './recommend';
import type { RecommendInput } from './recommend';
import { clampLayer } from './reaction';
import { REGION_IDS } from './world';
import type { RegionId, SpotKind } from './world';
import { BAR_SEC } from './worldsound';

/** 주민 한 장의 그림 크기(월드 px, 9.3). 발치가 아래 가운데에 온다 */
export const RESIDENT_FRAME = { w: 48, h: 72 } as const;
/** 서 있기 2장(눈을 뜬 모습, 눈을 감은 모습), 연주 4장(한 마디의 네 박) */
export const RESIDENT_STANDING_FRAMES = 2;
export const RESIDENT_PLAYING_FRAMES = 4;
/** 서 있는 동안 눈을 감는 시간(초). 마디(3초)의 끝에서 이만큼이다 */
export const RESIDENT_BLINK_SEC = 0.3;
/** 한 줄이 넘지 않게 하는 글자 수(공백 포함). 추천의 이유가 둘로 나뉘는 가장 긴 경우까지 담는다 */
export const RESIDENT_LINE_MAX = 110;

export interface ResidentDef {
  /** 'resident.<지역 id>'. 월드의 다른 자리 id와 겹치지 않는다 */
  residentId: string;
  regionId: RegionId;
  /** 맡은 성부(그림과 옷 색, 이름). 마을은 화음 깔기(bed)다 */
  part: MusicianPart;
  /** 안내 칩과 낭독기의 이름. 예: "오선 언덕의 가락 악사" */
  name: string;
  /** 서는 자리(발치, 월드 px) */
  x: number;
  y: number;
}

/** 지역마다 맡은 성부(6.2 표). 마을이 화음 깔기이고 나머지는 지역 이름대로다 */
export const RESIDENT_PART: Readonly<Record<RegionId, MusicianPart>> = {
  village: 'bed',
  'staff-hill': 'melody',
  'beat-river': 'percussion',
  'bell-grove': 'bass',
  'scale-trail': 'runner',
  'key-marsh': 'ornament',
};

/** 지역 이름(content/regions의 name). 주민의 이름에 쓴다. 시험이 지역 파일과 같은지 맞춘다 */
const REGION_NAME_KO: Readonly<Record<RegionId, string>> = {
  village: '음악 마을',
  'staff-hill': '오선 언덕',
  'beat-river': '박자 강가',
  'bell-grove': '종나무 숲',
  'scale-trail': '음계 길',
  'key-marsh': '건반 늪',
};

/**
 * 주민이 서는 자리(월드 px, 발치). 지역의 표지(landmark) 곁에서 걸을 수 있는 땅을 골랐고,
 * 시험이 월드 격자로 다시 확인한다: 둘레 100 px 안이 걸을 수 있는 땅, 사물 그림과 겹치지 않음, 다른 자리와 192 px(칩 범위의 두 배) 넘게 떨어짐, 지역 안쪽,
 * 설치물이 놓인 자리(돌과 이름표 띠를 감싼 사각형)와 칸(48×72)이 한 몸 폭(24 px) 넘게 떨어짐.
 * 종나무 숲은 처음에 종탑 기둥과 겹쳐서(사진으로 확인) 종탑에서 동쪽으로 옮겼다.
 */
const STAND: Readonly<Record<RegionId, { x: number; y: number }>> = {
  village: { x: 4522, y: 3258 },
  'staff-hill': { x: 4234, y: 410 },
  'beat-river': { x: 6506, y: 2042 },
  'bell-grove': { x: 1370, y: 2426 },
  'scale-trail': { x: 7130, y: 5850 },
  'key-marsh': { x: 2554, y: 5722 },
};

export const residentIdOf = (regionId: RegionId): string => `resident.${regionId}`;

/** 여섯 주민. 지역의 차례(마을, 오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪)다 */
export const RESIDENTS: readonly ResidentDef[] = REGION_IDS.map((regionId): ResidentDef => {
  const part = RESIDENT_PART[regionId];
  return { residentId: residentIdOf(regionId), regionId, part, name: `${REGION_NAME_KO[regionId]}의 ${MUSICIAN_NAME_KO[part]}`, x: STAND[regionId].x, y: STAND[regionId].y };
});

export const residentOf = (residentId: string): ResidentDef | undefined => RESIDENTS.find((r) => r.residentId === residentId);

/** 월드가 안내 칩과 누르기로 여는 자리로 쓰는 모양(world.ts의 SpotKind 'resident') */
export interface ResidentSpot {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: SpotKind;
}

export function residentSpots(residents: readonly ResidentDef[] = RESIDENTS): ResidentSpot[] {
  return residents.map((r) => ({ id: r.residentId, name: r.name, x: r.x, y: r.y, kind: 'resident' }));
}

/** 지금 연주하는 주민들: 그 지역의 층이 1 이상이라서 그 성부가 합주에 더해져 있다. 지역의 차례대로 */
export function playingResidents(layerOf: (regionId: RegionId) => number | undefined, residents: readonly ResidentDef[] = RESIDENTS): string[] {
  return residents.filter((r) => clampLayer(layerOf(r.regionId) ?? 0) >= 1).map((r) => r.residentId);
}

// ───── 그림의 틀(서 있기 2장, 연주 4장) ─────

export interface ResidentPose {
  pose: 'standing' | 'playing';
  /** 그 자세 안의 몇 번째 장(0부터) */
  frame: number;
}

const BEAT_SEC = BAR_SEC / 4;

/**
 * 지금 어느 장을 그릴까. 연주는 박마다 한 장씩 넘어가 한 마디에 네 장이 한 바퀴 돈다. 서 있기는 눈을 뜬 장이 길고
 * 마디의 끝 0.3초만 눈을 감은 장이다. 움직임 줄이기(9.7)에서는 넘어가지 않고 첫 장에 선다: 연주는 연주 첫 장(음표 표지가 있다), 서 있기는 눈을 뜬 장이다.
 */
export function residentPose(playing: boolean, clockSec: number, reduceMotion: boolean): ResidentPose {
  if (reduceMotion || !Number.isFinite(clockSec) || clockSec < 0) return { pose: playing ? 'playing' : 'standing', frame: 0 };
  if (playing) return { pose: 'playing', frame: Math.floor(clockSec / BEAT_SEC) % RESIDENT_PLAYING_FRAMES };
  const inBar = clockSec % BAR_SEC;
  return { pose: 'standing', frame: inBar >= BAR_SEC - RESIDENT_BLINK_SEC ? 1 : 0 };
}

// ───── 한 줄 안내(사실과 추천 이유만) ─────

export interface ResidentSay {
  /** 한 줄. 사실과 추천 이유만 말한다 */
  text: string;
  /** 추천이면 그 과제 id(카드가 '도전 열기'를 붙일 수 있다). 사실만 말하면 null */
  questId: string | null;
  /** 어떤 말인가: 추천의 이유, 층에 대한 사실 */
  kind: 'recommendation' | 'layer';
}

export interface ResidentSayInput extends Omit<RecommendInput, 'regionId'> {
  /** 그 주민의 지역의 층(0–3) */
  layer: number;
}

/** 성부의 이름(악사 이름에서 '악사'를 뗀 것): 화음, 가락, 타악, 베이스, 달리는 음, 꾸밈음 */
export const partNoun = (part: MusicianPart): string => MUSICIAN_NAME_KO[part].replace(/ 악사$/, '');

const iGa = (text: string): string => `${text}${hasBatchim(text) ? '이' : '가'}`;

/** 층에 대한 사실 한 줄. 층 0이면 어떻게 더해지는지(규칙), 1 이상이면 지금 몇 층인지를 말한다 */
export function layerFact(resident: Pick<ResidentDef, 'regionId' | 'part'>, regionName: string, layer: number): string {
  const noun = partNoun(resident.part);
  const l = clampLayer(layer);
  if (l === 0) return `${regionName}에서 도전을 하나 통과하면 합주에 ${iGa(noun)} 더해져요.`;
  return `합주에 ${iGa(noun)} ${l}층으로 더해져 있어요.`;
}

/**
 * 주민이 하는 말 한 줄. 그 지역에 추천(6.6)이 있으면 그 과제가 어디 있는지와 추천의 이유(recommend.ts가 붙이는 한 줄 그대로)이고,
 * 없으면 층에 대한 사실이다. 추천은 그 지역의 정거장에 놓인 과제만 뽑는다(다른 지역의 과제는 그 지역의 주민이 말한다).
 */
export function residentSay(resident: ResidentDef, input: ResidentSayInput): ResidentSay {
  const { catalog, map } = input;
  const region = map.region(resident.regionId);
  const recommendations = recommend({ ...input, regionId: resident.regionId });
  for (const r of recommendations) {
    const station = region.stations.find((s) => s.questIds.includes(r.questId));
    const entry = catalog.get(r.questId);
    if (!station || !entry) continue;
    const title = `'${entry.title}'${hasBatchim(entry.title) ? '은' : '는'}`;
    return { text: `${title} ${station.name}에 있어요. ${r.text}`, questId: r.questId, kind: 'recommendation' };
  }
  return { text: layerFact(resident, region.name, input.layer), questId: null, kind: 'layer' };
}
