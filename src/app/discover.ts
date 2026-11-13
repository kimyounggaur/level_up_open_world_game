// 월드에서 발견 요소를 열었을 때와 광장 게시판의 일(설계서 3.6, 6.1, 7.4). 앱이 하는 일만 모았다:
//  - 열면 찾았다고 적는다(수첩 '발견', 광장 둘레의 등, 자유 가락의 재료가 이 한 줄에서 생긴다). 한번 적으면 사라지지 않는다(W-6).
//  - 처음 찾았을 때만 사용 기록(소리 조각 발견, 13.2)과 마을 위쪽의 알림(사실 문장, W-9)을 남긴다. 다시 열면 아무것도 새로 적지 않는다.
//  - 소리 조각은 열 때마다 한 번 들려 준다. 개념 쪽지는 글을 읽을 수 있게 호출한 쪽에 돌려준다(카드는 화면이 띄운다).
//  - 월드가 그릴 것(찾은 것, 게시판에 걸린 곡)을 다리(WorldBridge)에 알린다. 월드는 찾은 것의 모습만 그린다.
// 발견 요소는 판정이 없고 과제 접근과 무관하다(W-5): 찾아도 아무것도 열리거나 닫히지 않는다.
import { foundNews, isConceptNote, isSoundPiece } from '../domain/discovery';
import type { ConceptNoteDef, DiscoveryDef } from '../domain/discovery';
import type { WorldBridge } from '../platform/bridge';
import type { Creations } from './creations';
import type { FoundDiscoveries } from './found';

export interface DiscovererDeps {
  /** 이 채널에서 보이는 발견 요소들 */
  discoveries: readonly DiscoveryDef[];
  found: FoundDiscoveries;
  creations: Creations;
  /** 찾은 소리 조각을 들려 준다(자유 가락의 service와 같은 길) */
  melody: { previewPiece(discoveryId: string): boolean };
  bridge: Pick<WorldBridge, 'found' | 'board'>;
  /** 처음 찾았을 때의 알림(마을 위쪽에 잠깐 뜬다) */
  announce: (lines: readonly string[]) => void;
  /** 처음 찾았을 때 사용 기록에 적는다 */
  onFound: (discoveryId: string) => void;
}

/** 발견 요소를 열었을 때 호출한 쪽이 알아야 하는 것 */
export type OpenOutcome =
  /** 소리 조각: 이미 들려 주었다. 소리가 꺼져 있으면 소리 없이 적기만 했다 */
  | { kind: 'piece'; discoveryId: string; first: boolean }
  /** 개념 쪽지: 글을 읽을 수 있게 돌려준다 */
  | { kind: 'note'; note: ConceptNoteDef; first: boolean };

export class Discoverer {
  private readonly d: DiscovererDeps;
  private readonly offs: Array<() => void> = [];
  private disposed = false;

  constructor(d: DiscovererDeps) {
    this.d = d;
    // 월드가 늦게 켜져도 처음부터 읽을 수 있게 지금 값을 먼저 올린다
    d.bridge.found.set(d.found.store.get());
    d.bridge.board.set(this.boardIds());
    this.offs.push(
      d.found.store.subscribe((s) => d.bridge.found.set(s)),
      d.creations.store.subscribe(() => d.bridge.board.set(this.boardIds())),
    );
  }

  private boardIds(): readonly string[] {
    return this.d.creations.list().map((c) => c.creationId);
  }

  /** 월드에서 발견 요소를 열었다. 이 판에 없는 것이면(저장에만 남은 옛 id 등) null */
  open(discoveryId: string): OpenOutcome | null {
    if (this.disposed) return null;
    const def = this.d.discoveries.find((x) => x.discoveryId === discoveryId);
    if (!def) return null;
    const first = this.d.found.mark(discoveryId);
    if (first) {
      this.d.onFound(discoveryId);
      this.d.announce(foundNews(def));
    }
    if (isSoundPiece(def)) {
      this.d.melody.previewPiece(discoveryId);
      return { kind: 'piece', discoveryId, first };
    }
    if (isConceptNote(def)) return { kind: 'note', note: def, first };
    return null;
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
  }
}
