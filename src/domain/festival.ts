// 잔치 열기(설계서 6.4, 7.5 '잔치' 상태)의 순수 계산. 광장 무대에서 언제든 열고, 현재 층 그대로 8마디 합주를 두 번(16마디, 48초) 연주하고,
// 악사들이 무대에 선다. 층이 0이어도 맥박과 함께 열린다. 끝나면 내 곡을 이어서 들을지 묻는다. 잔치는 결말이 아니다: 몇 번이든 열 수 있다.
// 이 파일은 시계도 소리도 모른다: 마디 번호와 층만으로 '언제 시작해서 언제 끝나고 누가 서는가'를 정한다.
import { STAGE_LABEL_TOP } from './installation';
import type { InstallationDef } from './installation';
import { BAR_SEC, LOOP_BARS } from './worldsound';
import type { EnsembleLayers, RegionPart } from './worldsound';

/** 합주를 몇 번 되풀이하는가 */
export const FESTIVAL_LOOPS = 2;
/** 잔치가 이어지는 마디 수(8마디 × 2) */
export const FESTIVAL_BARS = LOOP_BARS * FESTIVAL_LOOPS;
/** 잔치가 이어지는 시간(초). 4분음표 80에서 48초다 */
export const FESTIVAL_SECONDS = FESTIVAL_BARS * BAR_SEC;
/**
 * 누른 때부터 첫 마디까지 이만큼(초)은 있어야 한다. 소리 예약기는 마디가 시작하기 약 500 ms 전에 그 마디를 예약하므로(WORLD_LOOKAHEAD_SEC),
 * 그보다 넉넉히(0.25초) 앞서 정해 두어야 첫 마디가 처음부터 잔치의 첫 마디로 울린다. 예약기가 150 ms 앞일 때는 0.4였다(8-4).
 */
export const FESTIVAL_MIN_LEAD_SEC = 0.75;

/** 잔치가 차지하는 마디 구간. endBar는 포함하지 않는다 */
export interface FestivalRun {
  startBar: number;
  endBar: number;
}

/**
 * 잔치의 첫 마디를 정한다: 지금 시계가 어느 마디이고(bar), 다음 마디가 몇 초 뒤에 시작하는가(secToNext)를 받아
 * 다음 마디가 충분히 멀면 그 마디, 너무 가까우면 그다음 마디에서 시작한다.
 */
export function festivalRunAt(bar: number, secToNext: number): FestivalRun {
  const startBar = secToNext >= FESTIVAL_MIN_LEAD_SEC ? bar + 1 : bar + 2;
  return { startBar, endBar: startBar + FESTIVAL_BARS };
}

/** 이 마디가 잔치 구간 안인가 */
export const inFestival = (run: FestivalRun | null, absBar: number): boolean => run !== null && absBar >= run.startBar && absBar < run.endBar;

/** 잔치 안에서 이 마디가 8마디 합주의 몇 번째 마디(0–7)인가. 잔치 밖이면 null. 잔치는 합주의 첫 마디부터 시작한다 */
export function festivalLoopBar(run: FestivalRun | null, absBar: number): number | null {
  if (!run || !inFestival(run, absBar)) return null;
  return (absBar - run.startBar) % LOOP_BARS;
}

/** 잔치 안에서 이 마디가 합주를 몇 번째로 듣는 중(1부터)인가. 잔치 밖이면 null */
export function festivalRound(run: FestivalRun | null, absBar: number): number | null {
  if (!run || !inFestival(run, absBar)) return null;
  return Math.floor((absBar - run.startBar) / LOOP_BARS) + 1;
}

/**
 * 무대에 서는 악사가 맡은 성부. 모양으로 구별한다(북 악사는 둥근 북, 화음 악사는 종, 타악 악사는 방울 달린 둥근 틀, 베이스 악사는 큰 현악기,
 * 가락 악사는 피리, 달리는 음 악사는 계단 모양의 실로폰, 꾸밈음 악사는 삼각 방울).
 */
export type MusicianPart = 'pulse' | 'bed' | RegionPart;

/** 무대에서 서는 차례(왼쪽부터): 박을 맡은 악사(맥박, 타악, 베이스), 화음, 가락을 맡은 악사(가락, 달리는 음, 꾸밈음) */
export const MUSICIAN_ORDER: readonly MusicianPart[] = ['pulse', 'percussion', 'bass', 'bed', 'melody', 'runner', 'ornament'];

/**
 * 지금 합주에 실제로 울리는 성부 가운데 무대에 서는 악사들(7-5). 맥박은 층이 0이어도 늘 있고(6.4), 마을의 화음 깔기와 마을 밖 지역의 성부
 * (타악, 베이스, 가락, 달리는 음, 꾸밈음)는 그 지역의 층 1부터다(6.2). 합주가 울리지 않는 성부의 악사는 서지 않는다.
 */
export function festivalParts(layers: EnsembleLayers): MusicianPart[] {
  const sounding = (part: MusicianPart): boolean => (part === 'pulse' ? true : (part === 'bed' ? layers.village : layers[part]) >= 1);
  return MUSICIAN_ORDER.filter(sounding);
}

/** 악사의 이름(화면 낭독기와 점검용). 설계서 6.2 표의 성부 이름을 쓴다 */
export const MUSICIAN_NAME_KO: Readonly<Record<MusicianPart, string>> = {
  pulse: '북 악사',
  bed: '화음 악사',
  percussion: '타악 악사',
  bass: '베이스 악사',
  melody: '가락 악사',
  runner: '달리는 음 악사',
  ornament: '꾸밈음 악사',
};

// ───── 악사가 서는 자리(월드 px) ─────

/** 합주 무대 바닥의 가장자리: 칸들이 차지하는 가로 범위(x0 이상 x1 이하)와 칸들의 윗변(y0) */
export interface StageFloor {
  x0: number;
  x1: number;
  y0: number;
}

/** 설치물들 가운데 무대 바닥(stageCells)의 가장자리. 무대가 없으면 null */
export function stageFloorOf(installations: readonly Pick<InstallationDef, 'slots' | 'slotMap'>[]): StageFloor | null {
  const inst = installations.find((i) => i.slotMap?.kind === 'stageCells' && i.slots.length > 0);
  if (!inst) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  for (const s of inst.slots) {
    x0 = Math.min(x0, s.x);
    x1 = Math.max(x1, s.x + s.w);
    y0 = Math.min(y0, s.y);
  }
  return { x0, x1, y0 };
}

/** 악사의 발이 마디 이름 띠(칸 윗변 위 STAGE_LABEL_TOP)보다 이만큼 위에 선다 */
export const MUSICIAN_FEET_GAP = 10;
/**
 * 악사 사이의 가로 간격의 위아래 한도. 악사 한 명의 몸(옷 28 px, 그림자 44 px)이 서로 겹치지 않고 무대 폭(316 px) 안에 든다.
 * 악사가 일곱이면 간격 46 px의 가운데끼리 276 px이고 몸까지 합쳐도 무대 폭 가까이에 든다(7-5 전의 56 px은 악사 여섯부터 무대 폭을 넘는다).
 */
export const MUSICIAN_GAP_MAX = 96;
export const MUSICIAN_GAP_MIN = 46;

/**
 * 악사 n명이 서는 자리(발 위치). 무대 바닥 가운데를 기준으로 가로 한 줄이고, 마디 이름 띠 바로 위다
 * (카메라가 설치물을 담을 때 띠까지 담기므로 악사도 화면에 들어온다). 악사가 늘면 간격이 좁아지되 MUSICIAN_GAP_MIN 아래로는 줄지 않는다.
 */
export function musicianSpots(floor: StageFloor, count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const cx = (floor.x0 + floor.x1) / 2;
  const gap = Math.min(MUSICIAN_GAP_MAX, Math.max(MUSICIAN_GAP_MIN, (floor.x1 - floor.x0) / count));
  const y = floor.y0 - STAGE_LABEL_TOP - MUSICIAN_FEET_GAP;
  return Array.from({ length: count }, (_, i) => ({ x: Math.round(cx + (i - (count - 1) / 2) * gap), y }));
}

/** 무대에 선 악사를 말로 적는다(모양으로만 구별하지 않도록 글로도 알린다). 예: "북 악사와 화음 악사가 무대에 서 있어요." */
export function musiciansText(parts: readonly MusicianPart[]): string {
  const names = parts.map((p) => MUSICIAN_NAME_KO[p]);
  if (names.length === 0) return '';
  // 이름이 모두 '악사'로 끝나 받침이 없다: 이/가는 '가', 와/과는 '와'
  const who = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')}와 ${names[names.length - 1]!}`;
  return `${who}가 무대에 서 있어요.`;
}

// ───── 문장(사실만 말하고 평가하지 않는다) ─────

export const FESTIVAL_TITLE = '합주 잔치';
export const FESTIVAL_START_TEXT = '악사들이 무대에 섰어요. 마을의 합주를 두 번 들어요.';
export const FESTIVAL_SILENT_TEXT = '소리가 꺼져 있어서 조용히 흘러가요. 소리를 켜면 합주가 들려요.';
export const FESTIVAL_END_TEXT = '잔치가 끝났어요.';
export const FESTIVAL_ASK_TEXT = '내 곡을 이어서 들을까요?';
export const FESTIVAL_SONGS_TEXT = '내 곡을 차례로 들려 줘요.';

/** 끝난 뒤 묻는 말: 저장한 곡 수를 함께 적는다 */
export const festivalAskText = (songs: number): string => `${FESTIVAL_END_TEXT} 저장한 곡이 ${songs}개 있어요. ${FESTIVAL_ASK_TEXT}`;
