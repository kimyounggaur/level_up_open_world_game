// 찾은 발견 요소(설계서 3.6, 6.5 수첩의 '발견'): 소리 조각과 개념 쪽지를 찾으면 여기에 적힌다.
// 저장에 들어간다(explorationState.foundDiscoveries). '찾았는가'만 알고 순서나 횟수는 모른다. 한번 적히면 사라지지 않는다(W-6).
import { Store } from '../platform/bridge';

export class FoundDiscoveries {
  readonly store: Store<ReadonlySet<string>>;

  constructor(initial: Iterable<string> = []) {
    this.store = new Store<ReadonlySet<string>>(new Set(initial));
  }

  has(discoveryId: string): boolean {
    return this.store.get().has(discoveryId);
  }

  get size(): number {
    return this.store.get().size;
  }

  /** 찾았다고 적는다. 새로 적었으면 true. 이미 있으면 알리지 않는다 */
  mark(discoveryId: string): boolean {
    const cur = this.store.get();
    if (cur.has(discoveryId)) return false;
    this.store.set(new Set([...cur, discoveryId]));
    return true;
  }

  /** 저장용: 정렬한 목록 */
  toArray(): string[] {
    return [...this.store.get()].sort();
  }
}
