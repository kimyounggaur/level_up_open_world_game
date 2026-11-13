// 4-7 추천 첫 판의 순수 계산(설계서 6.6). 추천은 목록의 순서를 바꾸고 이유 한 줄을 붙이는 일만 한다.
// 막거나 경고하지 않는다: 추천되지 않은 도전도 목록에 그대로 있고, 어느 것이든 바로 열 수 있다(7.7, W-1, W-2).
//
// 규칙은 위에서부터 이 차례로 적용한다.
//  1. 지금 하는 과제에 연결된 기본 연습
//  2. 최근에 여러 번 고친 항목과 주제가 같은 과제
//  3. 지금 있는 지역에서 아직 열어 보지 않은 과제
// 앞 규칙이 이미 올린 과제는 뒤 규칙이 다시 올리지 않는다. 규칙마다 최대 3개까지만 올린다.
// 이유는 일어난 일이나 놓인 자리만 말한다(W-9). 잘한다 못한다, 해야 한다는 말을 쓰지 않는다.
import type { AttemptResult } from './attempt';
import { isSelectable } from './catalog';
import { practiceLinksOf } from './content';
import type { ContentCatalog, QuestEntry } from './catalog';
import { isJudged, OBSERVATION_WINDOW } from './notebook';
import type { RegionId, WorldMap } from './world';

export type RecommendReason = 'practice' | 'sameTopic' | 'unopenedHere';

export interface Recommendation {
  questId: string;
  reason: RecommendReason;
  /** 목록에 붙이는 이유 한 줄 */
  text: string;
}

/** 규칙마다 올리는 과제의 수 */
export const MAX_PER_RULE = 3;
/** 이 횟수 이상 '고칠 곳이 나온' 확인이 최근에 있으면 '여러 번 고친' 과제로 본다(최근 3번의 확인 안에서) */
export const REPEATED_REVISIONS = 2;

/**
 * 과제에 이어 둔 기본 연습(5-5): 과제 id → 이어진 과제 id들. 연결은 과제 콘텐츠(assistanceLinks, type 'practice')에 적혀 있고
 * 적힌 차례대로 센다. 설계서가 정한 연결은 Q08(선택한 짧은 곡)에서 Q02, Q03, Q05로다.
 */
export function practiceLinksFrom(catalog: ContentCatalog): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const entry of catalog.list()) {
    const ids = practiceLinksOf(entry.definition).map((l) => l.questId!);
    if (ids.length > 0) out[entry.questId] = ids;
  }
  return out;
}

export interface RecommendInput {
  catalog: ContentCatalog;
  map: WorldMap;
  attempts: readonly AttemptResult[];
  /** 열어 본 과제 id들 */
  opened: ReadonlySet<string>;
  /** 지금 하는 과제(가장 최근에 연 과제). 없으면 null */
  currentQuestId: string | null;
  /** 지금 있는 지역. 모르면 null */
  regionId: RegionId | null;
  /** 지금 열 수 있는 과제인가(공개 상태와 화면). 없으면 공개 상태만 본다 */
  openable?: (entry: QuestEntry) => boolean;
  /** 기본 연습 연결. 기본은 과제 콘텐츠에 적힌 연결(practiceLinksFrom) */
  practiceLinks?: Readonly<Record<string, readonly string[]>>;
  /** 주제 태그의 화면 이름. 없으면 태그 그대로 */
  topicName?: (tag: string) => string;
}

/** 최근에 여러 번 고친 과제들(가장 최근에 확인한 것부터) */
function recentlyRevised(attempts: readonly AttemptResult[]): string[] {
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
    .filter(([, { list }]) => list.slice(-OBSERVATION_WINDOW).filter((a) => a.resultType === 'needsRevision').length >= REPEATED_REVISIONS)
    .sort((a, b) => b[1].last - a[1].last)
    .map(([questId]) => questId);
}

export function recommend(input: RecommendInput): Recommendation[] {
  const { catalog, map, attempts, opened, currentQuestId, regionId } = input;
  const openable = input.openable ?? ((e: QuestEntry) => isSelectable(e.state));
  const links = input.practiceLinks ?? practiceLinksFrom(catalog);
  const nameOf = input.topicName ?? ((tag: string) => tag);
  const out: Recommendation[] = [];
  const taken = new Set<string>();
  const add = (rule: RecommendReason, entries: readonly QuestEntry[], text: (e: QuestEntry) => string): void => {
    let n = 0;
    for (const e of entries) {
      if (n >= MAX_PER_RULE) break;
      if (taken.has(e.questId) || !openable(e)) continue;
      taken.add(e.questId);
      out.push({ questId: e.questId, reason: rule, text: text(e) });
      n++;
    }
  };
  const entryOf = (id: string): QuestEntry | undefined => catalog.get(id);

  // 1. 지금 하는 과제의 기본 연습
  if (currentQuestId) {
    const current = entryOf(currentQuestId);
    const practice = (links[currentQuestId] ?? []).map(entryOf).filter((e): e is QuestEntry => e !== undefined);
    if (current) add('practice', practice, () => `지금 하는 '${current.title}'에 이어진 기본 연습이에요.`);
  }

  // 2. 최근에 여러 번 고친 과제와 주제가 같은 과제
  for (const questId of recentlyRevised(attempts)) {
    const source = entryOf(questId);
    if (!source) continue;
    const same = catalog.list().filter((e) => e.questId !== questId && e.topicTags.some((t) => source.topicTags.includes(t)));
    add('sameTopic', same, (e) => {
      const shared = e.topicTags.filter((t) => source.topicTags.includes(t)).map(nameOf).join(', ');
      return `'${source.title}'에서 고칠 곳이 여러 번 나왔어요. 같은 주제(${shared})의 도전이에요.`;
    });
  }

  // 3. 지금 있는 지역에서 아직 열어 보지 않은 과제(그 지역 정거장의 차례대로)
  if (regionId) {
    const region = map.region(regionId);
    const ids = [...new Set(region.stations.flatMap((s) => s.questIds))].filter((id) => !opened.has(id));
    add('unopenedHere', ids.map(entryOf).filter((e): e is QuestEntry => e !== undefined), () => `지금 있는 ${region.name}에서 아직 열어 보지 않은 도전이에요.`);
  }
  return out;
}

export interface ArrangedEntry {
  entry: QuestEntry;
  /** 이유 한 줄. 추천되지 않았으면 null */
  note: string | null;
  reason: RecommendReason | null;
}

/**
 * 목록의 순서를 바꾼다: 추천된 것을 추천의 차례대로 앞에, 나머지는 원래 차례대로 뒤에 둔다.
 * 거르기로 줄어든 목록에도 쓴다(그 안에 있는 것만 다룬다). 무엇도 빼거나 막지 않는다.
 */
export function arrange(entries: readonly QuestEntry[], recommendations: readonly Recommendation[]): ArrangedEntry[] {
  const byId = new Map(entries.map((e) => [e.questId, e] as const));
  const first: ArrangedEntry[] = [];
  const used = new Set<string>();
  for (const r of recommendations) {
    const entry = byId.get(r.questId);
    if (!entry || used.has(r.questId)) continue;
    used.add(r.questId);
    first.push({ entry, note: r.text, reason: r.reason });
  }
  const rest = entries.filter((e) => !used.has(e.questId)).map((entry): ArrangedEntry => ({ entry, note: null, reason: null }));
  return [...first, ...rest];
}
