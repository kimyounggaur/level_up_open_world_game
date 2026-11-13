// 정거장 안내(7.4, 7.7): 열 수 있는 과제가 여럿이거나 아직 준비 중인 정거장에서 무엇이 놓여 있는지 보여 주고 고르게 한다.
// 열 수 없는 것은 자물쇠가 아니라 '준비 중'으로 말한다: 사용자의 성과 때문에 막힌 것이 아니기 때문이다(W-1, W-10).
import type { Station } from '../../domain/world';
import type { RegionDef } from '../../domain/world';
import type { StationQuest } from '../../domain/station-quests';
import { STATION_KIND_NAME_KO } from '../common/format';
import { Icon } from '../common/Icon';
import { OverlayFrame } from './OverlayFrame';

export interface StationSheetProps {
  station: Station | undefined;
  stationId: string;
  region: RegionDef | undefined;
  quests: StationQuest[];
}

export function StationSheet({ station, stationId, region, quests }: StationSheetProps) {
  if (!station) {
    return (
      <OverlayFrame title="정거장을 찾지 못했어요" problem={`'${stationId}'라는 정거장은 없어요. 지도에서 골라 주세요.`} testId="station-missing">
        <a class="btn btn-primary" href="#/map">
          지도 열기 <Icon name="arrow-right" />
        </a>
      </OverlayFrame>
    );
  }
  const anyOpenable = quests.some((q) => q.openable);
  return (
    <OverlayFrame title={station.name} subtitle={`${region?.name ?? ''} · ${STATION_KIND_NAME_KO[station.archetype]}`} testId={`station-${station.stationId}`}>
      <p class="station-lead">
        {anyOpenable ? '여기에는 이런 과제가 놓여 있어요. 하나를 골라 주세요.' : '여기에 놓일 과제들이에요. 아직 열 수 없는 것은 준비 중이에요.'}
      </p>
      <ul class="station-quests">
        {quests.map((q) => (
          <li key={q.questId} class={`station-quest${q.openable ? '' : ' is-preparing'}`} data-quest={q.questId}>
            <div class="station-quest-text">
              <strong>
                {q.number ? `${q.number} · ` : ''}
                {q.title}
              </strong>
              {q.note ? <span class="muted small">{q.note}</span> : null}
            </div>
            {q.openable && q.hash ? (
              <a class="btn btn-primary" href={q.hash} aria-label={`${q.title} 열기`}>
                열기 <Icon name="arrow-right" />
              </a>
            ) : (
              <span class="variant-preparing" aria-label={`${q.title}: 준비 중`}>
                준비 중
              </span>
            )}
          </li>
        ))}
      </ul>
      <p class="muted small station-foot">
        다른 정거장은 <a href="#/map">지도</a>에서, 모든 과제는 <a href="#/list">목록</a>에서 볼 수 있어요.
      </p>
    </OverlayFrame>
  );
}
