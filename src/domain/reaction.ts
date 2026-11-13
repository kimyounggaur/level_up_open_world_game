// 4-4 세계 반응: 등불, 지역의 소리 층, 합주 층수. 설계서 6.1~6.3, W-6.
// 저장하지 않는다. 통과 기록(AttemptResult)과 '다녀간 정거장'에서 매번 계산한다(10.6). 그래서 저장된 값과 화면의 값이 어긋날 일이 없다.
// 계산은 늘어나기만 한다: 틀린 시도, 도움, 느린 템포는 아무것도 줄이거나 구분하지 않는다(W-6, 6.1).
import { isPass, passedQuestIds } from './attempt';
import type { AttemptResult } from './attempt';
import { REGION_IDS } from './world';
import type { RegionId, Station, WorldMap } from './world';

/** 꺼짐(와 본 적 없음), 켜짐(재료를 놓거나 들어 본 적 있음), 꽃등(이 정거장의 과제를 하나 이상 통과). 한번 켜지면 꺼지지 않는다 */
export type LanternState = 'off' | 'on' | 'flower';

export const MAX_REGION_LAYER = 3;
export const MAX_ENSEMBLE_LEVEL = REGION_IDS.length * MAX_REGION_LAYER;

export interface Reaction {
  /** 정거장 id → 등불 */
  lanterns: Readonly<Record<string, LanternState>>;
  /** 지역 → 소리 층(0–3) */
  regionLayers: Readonly<Record<RegionId, number>>;
  /** 여섯 지역의 층을 더한 수(0–18). 화면 왼쪽 위의 "합주 ○층". 어떤 장소나 과제도 열거나 닫지 않는다(6.3) */
  ensembleLevel: number;
  /** 통과한 서로 다른 과제(어느 판본이든, 도움을 썼든 아니든) */
  passedQuestIds: readonly string[];
}

/** 정거장이 꽃등인가: 이 정거장에 놓인 과제 가운데 하나라도 통과했다 */
export function stationPassed(station: Pick<Station, 'questIds'>, passed: ReadonlySet<string>): boolean {
  return station.questIds.some((q) => passed.has(q));
}

/** 정거장의 등불. 꽃등은 켜진 것의 다음 단계이므로 다녀간 기록이 없어도 꽃등이면 꽃등이다 */
export function lanternOf(station: Pick<Station, 'stationId' | 'questIds'>, visited: ReadonlySet<string>, passed: ReadonlySet<string>): LanternState {
  if (stationPassed(station, passed)) return 'flower';
  return visited.has(station.stationId) ? 'on' : 'off';
}

/** 지역의 소리 층: 그 지역에 놓인 과제 중 통과한 서로 다른 과제가 1개, 2개, 3개 이상일 때 한 층씩 오른다(6.2) */
export function layersOf(thresholds: readonly number[], passedHere: number): number {
  return Math.min(MAX_REGION_LAYER, thresholds.filter((t) => passedHere >= t).length);
}

/** 지금 상태에서 세계 반응을 계산한다 */
export function computeReaction(map: WorldMap, attempts: readonly AttemptResult[], visitedStations: Iterable<string> = []): Reaction {
  const passedIds = passedQuestIds(attempts);
  const passed = new Set(passedIds);
  const visited = new Set(visitedStations);
  const lanterns: Record<string, LanternState> = {};
  for (const s of map.stations) lanterns[s.stationId] = lanternOf(s, visited, passed);
  const regionLayers = {} as Record<RegionId, number>;
  let level = 0;
  for (const id of REGION_IDS) {
    const region = map.region(id);
    // Q01–Q07처럼 두 지역에 놓인 과제는 두 지역 모두에 센다
    const here = map.questIdsInRegion(id);
    const n = passedIds.filter((q) => here.has(q)).length;
    regionLayers[id] = layersOf(region.layerThresholds, n);
    level += regionLayers[id];
  }
  return { lanterns, regionLayers, ensembleLevel: level, passedQuestIds: passedIds };
}

/** 과제를 만지면(재료를 놓거나 들으면) 불이 켜지는 정거장들. 어떻게 들어왔든(걷기, 지도, 목록, 주소) 같다(W-2) */
export function stationsOfQuest(map: WorldMap, questId: string): string[] {
  return map.stationsForQuest(questId).map((s) => s.stationId);
}

/** 층을 0–3의 정수로 맞춘다: 3을 넘으면 3, 음수와 수가 아닌 것은 0 */
export const clampLayer = (layer: number): number => (Number.isFinite(layer) ? Math.max(0, Math.min(MAX_REGION_LAYER, Math.floor(layer))) : 0);

/** 마을의 화음 깔기 단계(6.2 표): 1층 온음표 화음, 2층 2분음표 화음, 3층 4분음표로 펼친 화음 */
export type ChordStage = 'none' | 'whole' | 'half' | 'quarter';
export const CHORD_STAGES: readonly ChordStage[] = ['none', 'whole', 'half', 'quarter'];
export const chordStageOf = (villageLayer: number): ChordStage => CHORD_STAGES[clampLayer(villageLayer)]!;

/** 박자 강가의 타악 단계(6.2 표): 1층 첫 박, 2층 4분음표, 3층 8분음표 채움 */
export type PercussionStage = 'none' | 'first' | 'quarter' | 'eighth';
export const PERCUSSION_STAGES: readonly PercussionStage[] = ['none', 'first', 'quarter', 'eighth'];
export const percussionStageOf = (beatRiverLayer: number): PercussionStage => PERCUSSION_STAGES[clampLayer(beatRiverLayer)]!;

/** 종나무 숲의 베이스 단계(6.2 표): 1층 온음표 근음, 2층 근음과 5음, 3층 걷는 베이스 */
export type BassStage = 'none' | 'whole' | 'fifth' | 'walking';
export const BASS_STAGES: readonly BassStage[] = ['none', 'whole', 'fifth', 'walking'];
export const bassStageOf = (bellGroveLayer: number): BassStage => BASS_STAGES[clampLayer(bellGroveLayer)]!;

/** 오선 언덕의 가락 단계(6.2 표, 7-4): 1층 뼈대 음만, 2층 가락 전체, 3층 옥타브 위 겹침 */
export type MelodyStage = 'none' | 'skeleton' | 'full' | 'octave';
export const MELODY_STAGES: readonly MelodyStage[] = ['none', 'skeleton', 'full', 'octave'];
export const melodyStageOf = (staffHillLayer: number): MelodyStage => MELODY_STAGES[clampLayer(staffHillLayer)]!;

/** 음계 길의 달리는 음 단계(6.2 표, 7-4): 1층 4마디와 8마디 끝의 오름 음계, 2층 내림 음계 추가, 3층 2마디마다 */
export type RunnerStage = 'none' | 'rise' | 'rise-fall' | 'every-two';
export const RUNNER_STAGES: readonly RunnerStage[] = ['none', 'rise', 'rise-fall', 'every-two'];
export const runnerStageOf = (scaleTrailLayer: number): RunnerStage => RUNNER_STAGES[clampLayer(scaleTrailLayer)]!;

/** 건반 늪의 꾸밈음 단계(6.2 표, 7-4): 1층 8마디에 반음 꾸밈 하나, 2층 4마디마다, 3층 2마디마다 */
export type OrnamentStage = 'none' | 'last' | 'every-four' | 'every-two';
export const ORNAMENT_STAGES: readonly OrnamentStage[] = ['none', 'last', 'every-four', 'every-two'];
export const ornamentStageOf = (keyMarshLayer: number): OrnamentStage => ORNAMENT_STAGES[clampLayer(keyMarshLayer)]!;

export const ensembleLabel = (level: number): string => `합주 ${level}층`;

// 새 소식 문장의 꼬리. 만드는 쪽(describeChanges)과 잇는 쪽(appendNews)이 같은 글을 쓰도록 한 곳에 둔다
const LIT_TAIL = '의 등불이 켜졌어요.';
const FLOWER_TAIL = '의 등불이 꽃등이 되었어요.';

/** 두 반응 사이에서 새로 생긴 것을 사실 문장으로(W-9). 줄어든 것은 없으므로 보고하지 않는다 */
export function describeChanges(map: WorldMap, before: Reaction, after: Reaction): string[] {
  const out: string[] = [];
  for (const s of map.stations) {
    const b = before.lanterns[s.stationId] ?? 'off';
    const a = after.lanterns[s.stationId] ?? 'off';
    if (b === a) continue;
    if (a === 'flower') out.push(`${s.name}${FLOWER_TAIL}`);
    else if (a === 'on' && b === 'off') out.push(`${s.name}${LIT_TAIL}`);
  }
  for (const id of REGION_IDS) {
    const b = before.regionLayers[id];
    const a = after.regionLayers[id];
    if (a > b) out.push(`${map.region(id).name}의 소리가 ${a}층이 되었어요.`);
  }
  if (after.ensembleLevel > before.ensembleLevel) out.push(`${ensembleLabel(after.ensembleLevel)}이 되었어요.`);
  return out;
}

/** 화면에 한꺼번에 띄우는 새 소식의 가짓수. 넘치면 오래된 것부터 밀려난다(합주 층수는 늘 왼쪽 위에 보이므로 사실이 사라지지는 않는다) */
export const MAX_NEWS_LINES = 5;

/**
 * 소식 목록에 새 소식을 잇는다.
 * - 같은 문장은 한 번만 둔다.
 * - 꽃등이 된 정거장의 '켜졌어요'는 거둔다. 더 앞선 소식이라 꽃등 문장이 이미 그 뜻을 품고 있다.
 * - 가짓수가 넘치면 오래된 것부터 뺀다.
 * 문장은 describeChanges가 만든 것만 온다(사실만 말한다, W-9). 이 함수는 문장을 바꾸거나 새로 쓰지 않는다.
 */
export function appendNews(current: readonly string[], added: readonly string[], max = MAX_NEWS_LINES): string[] {
  const out = [...current];
  for (const line of added) {
    if (out.includes(line)) continue;
    if (line.endsWith(FLOWER_TAIL)) {
      const lit = `${line.slice(0, -FLOWER_TAIL.length)}${LIT_TAIL}`;
      const at = out.indexOf(lit);
      if (at >= 0) out.splice(at, 1);
    }
    out.push(line);
  }
  return out.slice(-max);
}

/** 통과 기록이 하나라도 있는가(합주 층수가 0인 처음과 구분할 때) */
export const hasAnyPass = (attempts: readonly AttemptResult[]): boolean => attempts.some(isPass);
