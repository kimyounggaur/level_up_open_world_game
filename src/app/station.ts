// 정거장을 열 때 어디로 가는가(설계서 3.3, 7.4, 7.7): 열 수 있는 과제가 하나뿐인 작업대는 바로 패널로 열고,
// 그 밖에는(과제가 여럿이거나 아직 준비 중이면) 정거장 안내로 열어 무엇이 있는지 보여 준다. 기록이나 진행은 보지 않는다(W-1, W-2).
import { ContentCatalog } from '../domain/catalog';
import { stationQuests } from '../domain/station-quests';
import type { Station } from '../domain/world';
import { stationHash } from '../platform/router';

/** 정거장을 열 때 가는 주소: 열 수 있는 과제가 하나뿐인 작업대는 그 패널, 그 밖에는 정거장 안내 */
export function stationTarget(catalog: ContentCatalog, panels: ReadonlySet<string>, station: Pick<Station, 'stationId' | 'kind' | 'questIds'>): string {
  const openable = stationQuests(catalog, panels, station).filter((q) => q.openable);
  if (station.kind === 'panel' && openable.length === 1) return openable[0]!.hash!;
  return stationHash(station.stationId);
}
