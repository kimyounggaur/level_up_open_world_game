// 정거장에 놓인 과제가 지금 열리는지 가린다(설계서 3.3, 7.4, 7.7). 기록이나 진행은 보지 않는다(W-1, W-2).
// 열 수 없는 것은 자물쇠가 아니라 '준비 중'으로 말한다: 사용자의 성과 때문에 막힌 것이 아니다(W-10).
import { ContentCatalog, STATE_LABEL_KO, isSelectable } from './catalog';
import type { QuestState } from './catalog';
import { PLANNED_QUESTS } from './world';
import type { Station } from './world';

export interface StationQuest {
  questId: string;
  /** Q01 같은 번호(부록 A.0). 계획에 없는 id면 null */
  number: string | null;
  title: string;
  /** 카탈로그에 있고 패널 화면까지 만들어져 지금 열 수 있는가 */
  openable: boolean;
  /** 열 수 있으면 과제 주소(첫 열 수 있는 판본) */
  hash: string | null;
  /** 열 수 없을 때 이유를 한 문장으로 */
  note: string | null;
  /** 카탈로그에 없으면 'planned'(제작 계획에만 있는 과제) */
  state: QuestState | 'planned';
}

export function stationQuests(catalog: ContentCatalog, panels: ReadonlySet<string>, station: Pick<Station, 'questIds'>): StationQuest[] {
  return station.questIds.map((questId): StationQuest => {
    const entry = catalog.get(questId);
    const planned = PLANNED_QUESTS[questId];
    const number = planned?.number ?? null;
    if (!entry) return { questId, number, title: planned?.title ?? questId, openable: false, hash: null, note: '준비 중이에요. 아직 만들지 않은 과제예요.', state: 'planned' };
    const variant = entry.variants.find((v) => isSelectable(v.state) && v.panelIds.some((id) => panels.has(id)));
    if (variant) return { questId, number, title: entry.title, openable: true, hash: ContentCatalog.hashFor(questId, variant.variantId), note: null, state: entry.state };
    const selectable = entry.variants.some((v) => isSelectable(v.state));
    return { questId, number, title: entry.title, openable: false, hash: null, note: selectable ? '화면을 만드는 중이에요.' : `${STATE_LABEL_KO.preparing}이에요. 검수가 끝나면 열려요.`, state: entry.state };
  });
}
