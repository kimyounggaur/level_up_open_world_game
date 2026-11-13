// 열어 본 과제(설계서 7.7의 '아직 열어 보지 않은 것'). 패널을 연 과제의 id를 기억한다. 목록과 지도가 이것으로 거른다.
// 저장에 들어간다(explorationState.openedQuests). 점수나 순서가 아니라 '열어 봤는가'만 안다.
import { Store } from '../platform/bridge';

export class OpenedQuests {
  readonly store: Store<ReadonlySet<string>>;

  constructor(initial: Iterable<string> = []) {
    this.store = new Store<ReadonlySet<string>>(new Set(initial));
  }

  has(questId: string): boolean {
    return this.store.get().has(questId);
  }

  /** 열었다고 기록한다. 이미 있으면 알리지 않는다 */
  mark(questId: string): void {
    const cur = this.store.get();
    if (cur.has(questId)) return;
    this.store.set(new Set([...cur, questId]));
  }

  /** 저장용: 정렬한 목록 */
  toArray(): string[] {
    return [...this.store.get()].sort();
  }
}
