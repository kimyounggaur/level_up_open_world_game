// 세계 반응 추적기(설계서 4-4, 6.1~6.3): 통과 기록과 '다녀간 정거장'에서 등불, 지역의 소리 층, 합주 층수를 계산해 두고,
// 바뀌면 월드(등불)와 화면(합주 층수, 새 소식)에 알린다. 계산은 domain/reaction이 하고 여기서는 언제 다시 계산할지만 정한다.
//  - 재료를 하나라도 놓거나 들으면 그 과제가 놓인 정거장들이 '다녀간' 곳이 된다. 걸어서 왔든 지도, 목록, 주소로 왔든 같다(W-2).
//  - 자유로 놀기에서 놓거나 들어도 그 설치물이 선 정거장이 다녀간 곳이 된다.
//  - 통과 기록이 생기면 다시 계산한다. 틀린 시도는 아무것도 줄이지 않는다(W-6: 계산이 늘기만 한다).
//  - 새로 생긴 것은 사실 문장으로 `pending`에 쌓는다(W-9). 화면이 보여 주고 나면 비운다.
// 저장하지 않는다. 다녀간 정거장만 저장에 들어가고(VisitedStations), 나머지는 시작할 때 통과 기록에서 다시 계산한다(10.6).
import type { InstallationDef } from '../domain/installation';
import { appendNews, computeReaction, describeChanges, stationsOfQuest } from '../domain/reaction';
import type { Reaction } from '../domain/reaction';
import type { WorldMap } from '../domain/world';
import { Store } from '../platform/bridge';
import type { WorldBridge } from '../platform/bridge';
import type { ChallengeController, TouchEvent } from '../ui/challenge/controller';
import type { VisitedStations } from './visited';

export interface ReactionTrackerDeps {
  map: WorldMap;
  controller: Pick<ChallengeController, 'attempts' | 'onAttempt' | 'onTouch'>;
  visited: VisitedStations;
  installations: readonly InstallationDef[];
  bridge: Pick<WorldBridge, 'lanterns'>;
}

const sameRecord = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>): boolean => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
};

/** 두 계산 결과가 같은가. 같으면 아무에게도 알리지 않는다 */
export function sameReaction(a: Reaction, b: Reaction): boolean {
  return a.ensembleLevel === b.ensembleLevel && sameRecord(a.lanterns, b.lanterns) && sameRecord(a.regionLayers, b.regionLayers) && a.passedQuestIds.length === b.passedQuestIds.length;
}

export class ReactionTracker {
  /** 지금의 세계 반응 */
  readonly store: Store<Reaction>;
  /** 화면이 아직 보여 주지 않은 새 소식(사실 문장들). 화면이 가져가 보여 주면 비운다 */
  readonly pending = new Store<readonly string[]>([]);
  private readonly d: ReactionTrackerDeps;
  private readonly offs: Array<() => void> = [];
  private disposed = false;

  constructor(d: ReactionTrackerDeps) {
    this.d = d;
    // 처음 계산은 알리지 않는다: 저장에서 읽은 기록으로 이미 있던 것은 '새로 생긴 것'이 아니다
    const first = this.compute();
    this.store = new Store<Reaction>(first);
    d.bridge.lanterns.set(first.lanterns);
    this.offs.push(
      d.controller.onTouch((t) => this.touched(t)),
      d.controller.onAttempt(() => this.refresh()),
      d.visited.store.subscribe(() => this.refresh()),
    );
  }

  private compute(): Reaction {
    return computeReaction(this.d.map, this.d.controller.attempts, this.d.visited.store.get());
  }

  /** 재료를 놓거나 들었다: 그 과제가 놓인 정거장들(자유로 놀기면 그 설치물이 선 정거장)의 등불이 켜진다 */
  private touched(t: TouchEvent): void {
    if (this.disposed) return;
    if (t.freeInstallationId) {
      const inst = this.d.installations.find((i) => i.installationId === t.freeInstallationId);
      if (inst) this.d.visited.mark([inst.stationCode]);
      return;
    }
    this.d.visited.mark(stationsOfQuest(this.d.map, t.questId));
  }

  /** 다시 계산해서 달라졌으면 알린다 */
  refresh(): void {
    if (this.disposed) return;
    const prev = this.store.get();
    const next = this.compute();
    if (sameReaction(prev, next)) return;
    this.store.set(next);
    if (!sameRecord(prev.lanterns, next.lanterns)) this.d.bridge.lanterns.set(next.lanterns);
    const lines = describeChanges(this.d.map, prev, next);
    if (lines.length > 0) this.pending.set(appendNews(this.pending.get(), lines));
  }

  /** 계산에서 나온 것이 아닌 새 소식(발견 요소를 찾았다 등)을 사실 문장으로 더한다. 같은 글이 이미 쌓여 있으면 더하지 않는다 */
  announce(lines: readonly string[]): void {
    if (this.disposed || lines.length === 0) return;
    this.pending.set(appendNews(this.pending.get(), lines));
  }

  /** 화면이 새 소식을 가져갔다 */
  takePending(): readonly string[] {
    const lines = this.pending.get();
    if (lines.length > 0) this.pending.set([]);
    return lines;
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
  }
}
