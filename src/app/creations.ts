// 저장한 곡(내 곡, 설계서 6.1 '만듦', 6.5). 무대의 자유 가락을 저장하면 여기에 쌓이고, 수첩과 광장 게시판과 무대가 같은 목록을 본다.
// 저장에 들어간다(explorationState.creations). 목록을 바꾸는 계산은 domain/creation이 하고, 이 클래스는 현재 목록을 쥐고 바뀌면 알린다.
import { addCreation, removeCreation, renameCreation } from '../domain/creation';
import type { AddResult, Creation, RenameResult } from '../domain/creation';
import type { ScoreEvent } from '../domain/score';
import { Store } from '../platform/bridge';

export class Creations {
  readonly store: Store<readonly Creation[]>;

  constructor(initial: readonly Creation[] = []) {
    this.store = new Store<readonly Creation[]>([...initial]);
  }

  list(): readonly Creation[] {
    return this.store.get();
  }

  get(creationId: string): Creation | undefined {
    return this.store.get().find((c) => c.creationId === creationId);
  }

  /** 자유 가락을 새 곡으로 저장한다. 같은 가락이 이미 있으면 새로 만들지 않는다(그 곡이 duplicate와 함께 돌아온다) */
  save(input: { name?: string; installationId: string; events: readonly ScoreEvent[]; createdAt: string }): AddResult {
    const r = addCreation(this.store.get(), input);
    if (r.ok && !r.duplicate) this.store.set(r.creations);
    return r;
  }

  rename(creationId: string, name: string): RenameResult {
    const r = renameCreation(this.store.get(), creationId, name);
    if (r.ok) this.store.set(r.creations);
    return r;
  }

  /** 지운다. 지웠으면 true. 지우는 것은 사람이 수첩에서 하는 일이다(6.5) */
  remove(creationId: string): boolean {
    const cur = this.store.get();
    const next = removeCreation(cur, creationId);
    if (next.length === cur.length) return false;
    this.store.set(next);
    return true;
  }

  /** 저장용: 복사한 목록 */
  toJSON(): Creation[] {
    return JSON.parse(JSON.stringify(this.store.get())) as Creation[];
  }
}
