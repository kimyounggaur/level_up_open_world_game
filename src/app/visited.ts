// 다녀간 정거장(설계서 6.1 '다녀감'): 정거장의 과제에 재료를 하나라도 놓거나 들어 본 곳이다. 그 정거장의 등불이 켜진다.
// 저장에 들어간다(explorationState.visitedStations). '다녀갔는가'만 알고 횟수나 점수는 모른다. 한번 생기면 사라지지 않는다(W-6).
import { Store } from '../platform/bridge';

export class VisitedStations {
  readonly store: Store<ReadonlySet<string>>;

  constructor(initial: Iterable<string> = []) {
    this.store = new Store<ReadonlySet<string>>(new Set(initial));
  }

  has(stationId: string): boolean {
    return this.store.get().has(stationId);
  }

  /** 다녀간 것으로 적는다. 이미 있는 것은 그대로 두고, 새로 적힌 것만 돌려준다. 새것이 없으면 알리지 않는다 */
  mark(stationIds: Iterable<string>): string[] {
    const cur = this.store.get();
    const added = [...new Set(stationIds)].filter((id) => !cur.has(id));
    if (added.length === 0) return [];
    this.store.set(new Set([...cur, ...added]));
    return added;
  }

  /** 저장용: 정렬한 목록 */
  toArray(): string[] {
    return [...this.store.get()].sort();
  }
}
