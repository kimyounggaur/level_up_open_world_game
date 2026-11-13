// 4-7 수첩의 순수 계산(설계서 6.5, 6.7). 시계도 저장소도 화면도 모른다: 시도 기록과 열어 본 과제에서
// 지역 쪽(열어 봄과 통과, 템포와 도움)과 관찰 문장을 만든다.
//
// 지키는 것
//  - 통과에는 템포와 도움 사용 여부를 함께 적는다. 느린 템포의 통과를 원래 템포의 통과로 바꿔 적지 않는다(6.5).
//  - 통과 기록은 판이 바뀌어도, 공개 상태가 바뀌어도 사라지지 않는다(W-6).
//  - 기술 문제와 판정하지 않은 시도는 '확인'으로 세지 않는다(W-8).
//  - 관찰 문장은 일어난 사실만 말한다. 칭찬도, 능력을 짐작하는 말도, 해야 할 일을 정하는 말도 없다(W-9).
//    시도가 적으면 '적은 시도에서 관찰'이라고 밝힌다(6.5).
//  - 경험치, 별점, 순위, 전체 완주율, 남은 일의 개수를 만들지 않는다(6.7).
import type { AttemptResult } from './attempt';
import { isSelectable } from './catalog';
import type { ContentCatalog, QuestEntry, QuestState } from './catalog';
import { fillTemplate } from './feedback';
import type { IssueCode } from './feedback';
import { PLANNED_QUESTS } from './world';
import type { RegionId, WorldMap } from './world';

// ---------------------------------------------------------------------------
// 지역 쪽

/** 통과한 방식 하나. 같은 템포와 같은 도움 사용 여부끼리 묶는다 */
export interface PassKind {
  tempoBpm: number | null;
  originalTempoBpm: number | null;
  /** 원래 템포보다 느리게 한 통과 */
  slower: boolean;
  assistUsed: boolean;
  count: number;
}

export interface VariantRecord {
  variantId: string;
  label: string;
  state: QuestState;
  /** 판정한 시도(통과와 고칠 곳이 나온 시도)의 수. 기술 문제와 판정하지 않은 시도는 세지 않는다 */
  judged: number;
  /** 통과한 방식들. 처음 통과한 차례대로. 비어 있으면 아직 통과한 적이 없다 */
  passes: PassKind[];
}

export interface QuestRecord {
  questId: string;
  /** Q01 같은 번호(부록 A.0). 계획에 없으면 null */
  number: string | null;
  title: string;
  /** 열어 봤는가. 시도 기록이 있으면 열어 본 것으로 친다 */
  opened: boolean;
  variants: VariantRecord[];
  /** 이 과제가 놓인 정거장 이름들(지역 쪽 안에서만) */
  places: string[];
}

export interface RegionPage {
  regionId: RegionId;
  name: string;
  quests: QuestRecord[];
}

export interface RegionPages {
  regions: RegionPage[];
  /** 어느 지역의 정거장에도 놓이지 않은 과제. 있으면 수첩이 '그 밖'으로 보여 준다 */
  unplaced: QuestRecord[];
}

export interface NotebookInput {
  catalog: ContentCatalog;
  map: WorldMap;
  attempts: readonly AttemptResult[];
  /** 열어 본 과제 id들 */
  opened: ReadonlySet<string>;
}

/** 확인(판정)한 시도인가. 통과나 고칠 곳이 나온 시도만이다 */
export const isJudged = (a: AttemptResult): boolean => a.resultType === 'passed' || a.resultType === 'needsRevision';

const variantKey = (questId: string, variantId: string): string => `${questId}\u0000${variantId}`;

function passKinds(passes: readonly AttemptResult[]): PassKind[] {
  const kinds = new Map<string, PassKind>();
  for (const a of passes) {
    const key = `${a.tempoBpm}|${a.originalTempoBpm}|${a.assistUsed}`;
    const found = kinds.get(key);
    if (found) found.count++;
    else kinds.set(key, { tempoBpm: a.tempoBpm, originalTempoBpm: a.originalTempoBpm, slower: a.slowerThanOriginal, assistUsed: a.assistUsed, count: 1 });
  }
  return [...kinds.values()];
}

const numberOf = (questId: string): number => {
  const n = PLANNED_QUESTS[questId]?.number;
  return n ? Number.parseInt(n.slice(1), 10) : Number.POSITIVE_INFINITY;
};

/** 지역 쪽 여섯 장과 '그 밖'. 지역 쪽에는 지금 열 수 있는 과제와 기록이 있는 과제만 올린다(만들지 않은 과제는 올리지 않는다) */
export function buildRegionPages(input: NotebookInput): RegionPages {
  const { catalog, map, attempts, opened } = input;
  const judged = new Map<string, AttemptResult[]>();
  for (const a of attempts) {
    if (!isJudged(a)) continue;
    const key = variantKey(a.questId, a.variantId);
    const list = judged.get(key);
    if (list) list.push(a);
    else judged.set(key, [a]);
  }

  const recordOf = (entry: QuestEntry, places: string[]): QuestRecord | null => {
    const variants: VariantRecord[] = [];
    for (const v of entry.variants) {
      const list = judged.get(variantKey(entry.questId, v.variantId)) ?? [];
      // 기록이 있는 판본은 공개 상태가 바뀌어도 보인다(W-6)
      if (!isSelectable(v.state) && list.length === 0) continue;
      variants.push({ variantId: v.variantId, label: v.label, state: v.state, judged: list.length, passes: passKinds(list.filter((a) => a.resultType === 'passed')) });
    }
    if (variants.length === 0) return null;
    const hasRecord = variants.some((v) => v.judged > 0);
    return { questId: entry.questId, number: PLANNED_QUESTS[entry.questId]?.number ?? null, title: entry.title, opened: opened.has(entry.questId) || hasRecord, variants, places };
  };

  const entries = [...catalog.list()].sort((a, b) => numberOf(a.questId) - numberOf(b.questId));
  const placedAnywhere = new Set<string>();
  const regions: RegionPage[] = map.regions.map((region) => {
    const quests: QuestRecord[] = [];
    for (const entry of entries) {
      const places = region.stations.filter((s) => s.questIds.includes(entry.questId)).map((s) => s.name);
      if (places.length === 0) continue;
      placedAnywhere.add(entry.questId);
      const record = recordOf(entry, places);
      if (record) quests.push(record);
    }
    return { regionId: region.regionId, name: region.name, quests };
  });

  const unplaced: QuestRecord[] = [];
  for (const entry of entries) {
    if (placedAnywhere.has(entry.questId)) continue;
    const record = recordOf(entry, []);
    if (record) unplaced.push(record);
  }
  return { regions, unplaced };
}

// ---------------------------------------------------------------------------
// 관찰(6.5)

/** 한 과제에서 살펴보는 가장 최근 확인의 수 */
export const OBSERVATION_WINDOW = 3;
/** 관찰에 올리는 과제의 수(가장 최근에 확인한 것부터) */
export const MAX_OBSERVED_QUESTS = 5;
/** 한 과제의 관찰 문장에서 같은 종류를 몇 개까지 적는가 */
const MAX_GROUP_SENTENCES = 3;
const MAX_POSITION_SENTENCES = 2;
/** 시도가 적을 때 붙이는 말(6.5) */
export const FEW_TRIES_NOTE = '적은 시도에서 관찰';

/** 판정 이유 코드를 사람이 읽는 묶음으로 */
export type IssueGroupId = 'count' | 'pitch' | 'spelling' | 'octave' | 'order' | 'rest' | 'duration' | 'measure' | 'voice' | 'chord' | 'inversion' | 'interval';

export const ISSUE_GROUP_NAME_KO: Readonly<Record<IssueGroupId, string>> = {
  count: '놓은 음의 개수',
  pitch: '음의 높이',
  spelling: '음 이름의 표기',
  octave: '옥타브',
  order: '음의 차례',
  rest: '쉼표 자리',
  duration: '음의 길이',
  measure: '마디 채우기',
  voice: '성부',
  chord: '화음의 구성음',
  inversion: '전위',
  interval: '음정',
};

/** 묶음의 차례(문장을 늘어놓을 때 같은 횟수끼리의 순서) */
const GROUP_ORDER: readonly IssueGroupId[] = ['pitch', 'spelling', 'octave', 'order', 'count', 'rest', 'duration', 'measure', 'voice', 'chord', 'inversion', 'interval'];

export const ISSUE_GROUP: Readonly<Record<IssueCode, IssueGroupId>> = {
  MISSING_PLACEMENT: 'count',
  EXTRA_PLACEMENT: 'count',
  WRONG_STAFF_PITCH: 'pitch',
  WRONG_SPELLING_SAME_PITCH: 'spelling',
  OCTAVE_MISMATCH: 'octave',
  WRONG_PITCH: 'pitch',
  WRONG_ORDER: 'order',
  SCALE_LENGTH: 'count',
  MISSING_EVENT: 'count',
  EXTRA_EVENT: 'count',
  REST_EXPECTED_NOTE_FOUND: 'rest',
  NOTE_EXPECTED_REST_FOUND: 'rest',
  DURATION_MISMATCH: 'duration',
  TUPLET_DURATION: 'duration',
  TUPLET_MISMATCH: 'duration',
  PITCH_MISMATCH: 'pitch',
  MEASURE_TICKS_REMAIN: 'measure',
  MEASURE_TICKS_OVER: 'measure',
  OVERLAP: 'measure',
  MISSING_VOICE: 'voice',
  MISSING_TONE: 'chord',
  EXTRA_NOTE: 'count',
  DUPLICATE_TONE: 'chord',
  NOTE_COUNT: 'count',
  WRONG_OCTAVE_SET: 'octave',
  INCOMPLETE_TRIAD: 'chord',
  WRONG_INVERSION: 'inversion',
  WRONG_INTERVAL: 'interval',
  WRONG_SOUND_EQUIV: 'spelling',
  WRONG_NOTATION_EQUIV: 'spelling',
};

export interface Observation {
  questId: string;
  title: string;
  /** 살펴본 확인의 수(1–3) */
  checks: number;
  /** 시도가 적으면 FEW_TRIES_NOTE, 아니면 null */
  note: string | null;
  /** 사실 문장들. 첫 문장은 확인한 횟수의 요약이다 */
  sentences: string[];
}

function summary(checks: number, passed: number): string {
  const revised = checks - passed;
  if (checks === 1) return passed === 1 ? '최근 1번 확인했어요. 통과했어요.' : '최근 1번 확인했어요. 고칠 곳이 나왔어요.';
  if (revised === 0) return `최근 ${checks}번 확인했고, 모두 통과했어요.`;
  if (passed === 0) return `최근 ${checks}번 확인했고, 모두 고칠 곳이 나왔어요.`;
  return `최근 ${checks}번 확인했어요. 통과 ${passed}번, 고칠 곳이 나온 것 ${revised}번이에요.`;
}

/**
 * 과제마다 가장 최근의 확인 최대 3번을 살펴 사실 문장을 만든다. 같은 종류의 고칠 곳이나 같은 자리가 2번 이상 나왔을 때만 따로 적는다.
 * 가장 최근에 확인한 과제부터 최대 5개를 돌려준다. 확인한 시도가 없으면 빈 목록이다.
 */
export function observe(attempts: readonly AttemptResult[], titleOf: (questId: string) => string): Observation[] {
  const byQuest = new Map<string, { last: number; list: AttemptResult[] }>();
  attempts.forEach((a, index) => {
    if (!isJudged(a)) return;
    const found = byQuest.get(a.questId);
    if (found) {
      found.last = index;
      found.list.push(a);
    } else byQuest.set(a.questId, { last: index, list: [a] });
  });

  return [...byQuest.entries()]
    .sort((a, b) => b[1].last - a[1].last)
    .slice(0, MAX_OBSERVED_QUESTS)
    .map(([questId, { list }]): Observation => {
      const recent = list.slice(-OBSERVATION_WINDOW);
      const passed = recent.filter((a) => a.resultType === 'passed').length;
      const sentences = [summary(recent.length, passed)];

      // 같은 종류의 고칠 곳이 나온 확인의 수(한 확인에서 여러 번 나와도 한 번으로 센다)
      const groupCount = new Map<IssueGroupId, number>();
      const positionCount = new Map<number, number>();
      for (const a of recent) {
        const groups = new Set<IssueGroupId>();
        const positions = new Set<number>();
        for (const issue of a.issues) {
          groups.add(ISSUE_GROUP[issue.code]);
          const p = issue.target?.position;
          if (typeof p === 'number') positions.add(p);
        }
        for (const g of groups) groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
        for (const p of positions) positionCount.set(p, (positionCount.get(p) ?? 0) + 1);
      }
      const repeatedGroups = [...groupCount.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]))
        .slice(0, MAX_GROUP_SENTENCES);
      for (const [g, n] of repeatedGroups) sentences.push(fillTemplate('{name:이가} {n}번 고칠 곳으로 나왔어요.', { name: ISSUE_GROUP_NAME_KO[g], n }));
      const repeatedPositions = [...positionCount.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, MAX_POSITION_SENTENCES);
      for (const [p, n] of repeatedPositions) sentences.push(fillTemplate('{name:이가} {n}번 고칠 곳으로 나왔어요.', { name: `${p}번째 자리`, n }));

      return { questId, title: titleOf(questId), checks: recent.length, note: recent.length < OBSERVATION_WINDOW ? FEW_TRIES_NOTE : null, sentences };
    });
}
