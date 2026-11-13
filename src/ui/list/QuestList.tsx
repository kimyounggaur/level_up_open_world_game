// 전체 도전 목록(7.7). 목록은 걷지 않고 가장 빨리 시작하는 길이다. 선행 완료나 기록을 보지 않고 모두 연다.
// 열 수 없는 것은 자물쇠가 아니라 '준비 중'으로 말한다: 사용자의 성과 때문에 잠긴 것이 아니기 때문이다.
// 추천(6.6)은 순서를 바꾸고 이유 한 줄을 붙이는 일만 한다. 추천되지 않은 도전도 그대로 있고 무엇도 막지 않는다.
import { useState } from 'preact/hooks';
import { ContentCatalog, STATE_LABEL_KO, isSelectable } from '../../domain/catalog';
import type { QuestEntry, QuestState } from '../../domain/catalog';
import { arrange } from '../../domain/recommend';
import type { RecommendReason, Recommendation } from '../../domain/recommend';
import type { RegionId, WorldMap } from '../../domain/world';
import { descriptorText, topicName } from '../common/format';
import { Icon } from '../common/Icon';
import { useNav } from '../common/nav';
import { Brand } from '../panels/PanelFrame';

export interface QuestListProps {
  catalog: ContentCatalog;
  /** 주소를 열지 못한 이유. 있으면 목록 위에 보여 준다 */
  problem?: string | null;
  /** 화면이 만들어진 패널 id들. 화면이 없는 판본은 '준비 중'으로 보이고 누를 수 없다 */
  panels?: ReadonlySet<string>;
  /** 개발용 화면으로 가는 길을 보일지(미리보기 채널) */
  showDev?: boolean;
  /** 월드 지도. 있으면 '지역'으로 거를 수 있다 */
  map?: WorldMap;
  /** 이미 열어 본 과제 id들. 있으면 '아직 열어 보지 않은 것'으로 거를 수 있다 */
  opened?: ReadonlySet<string>;
  /** 추천(6.6). 있으면 추천된 도전을 앞에 두고 이유 한 줄을 붙인다 */
  recommendations?: readonly Recommendation[];
}

function StateBadge({ state }: { state: QuestState }) {
  const label = STATE_LABEL_KO[state];
  if (!label) return null;
  return <span class={`chip chip-state is-${state}`}>{label}</span>;
}

function QuestCard({ entry, panels, note, reason }: { entry: QuestEntry; panels?: ReadonlySet<string>; note?: string | null; reason?: RecommendReason | null }) {
  return (
    <li class="quest-card" data-quest={entry.questId} {...(reason ? { 'data-reason': reason } : {})}>
      <div class="quest-card-head">
        <h3>{entry.title}</h3>
        <StateBadge state={entry.state} />
      </div>
      {note ? <p class="quest-reason">{note}</p> : null}
      <p class="quest-topics">
        {entry.topicTags.map((t) => (
          <span class="chip" key={t}>
            {topicName(t)}
          </span>
        ))}
      </p>
      <ul class="variant-list">
        {entry.variants.map((v) => {
          const name = `${entry.title} · ${v.label}`;
          const hasPanel = !panels || v.panelIds.some((id) => panels.has(id));
          return (
            <li key={v.variantId} class="variant-row" data-variant={v.variantId}>
              <div class="variant-text">
                <strong>{v.label}</strong>
                <span class="muted small">{descriptorText(v.descriptor)}</span>
                <span class="muted small">음역 {v.descriptor.range}</span>
              </div>
              {isSelectable(v.state) && hasPanel ? (
                <a class="btn btn-primary" href={ContentCatalog.hashFor(entry.questId, v.variantId)} aria-label={`${name} 열기`}>
                  열기 <Icon name="arrow-right" />
                </a>
              ) : (
                <span class="variant-preparing" aria-label={`${name}: 준비 중`}>
                  {isSelectable(v.state) ? '화면 준비 중' : '준비 중'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export function QuestList({ catalog, problem, panels, showDev, map, opened, recommendations }: QuestListProps) {
  const nav = useNav();
  const [tag, setTag] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId | null>(null);
  const [onlyUnopened, setOnlyUnopened] = useState(false);
  const all = catalog.list();
  const tags = [...new Set(all.flatMap((e) => e.topicTags))];
  const regionActive = region !== null && map !== undefined;
  const unopenedActive = onlyUnopened && opened !== undefined;
  const shown = catalog.filter({
    ...(tag ? { tag } : {}),
    ...(regionActive ? { within: map!.questIdsInRegion(region!) } : {}),
    ...(unopenedActive ? { opened } : {}),
  });
  const arranged = arrange(shown, recommendations ?? []);
  const filtering = tag !== null || regionActive || unopenedActive;
  const clear = (): void => {
    setTag(null);
    setRegion(null);
    setOnlyUnopened(false);
  };
  const summary = [regionActive ? `지역: ${map!.region(region!).name}` : '', tag ? `주제: ${topicName(tag)}` : '', unopenedActive ? '아직 열어 보지 않은 것' : ''].filter(Boolean).join(' · ');
  return (
    <div class="list-shell">
      <header class="topbar">
        <Brand />
        <nav class="topnav" aria-label="이동">
          <button type="button" class="nav-link nav-button" onClick={() => nav.close()} aria-keyshortcuts="Escape">
            <Icon name="close" /> 돌아가기
          </button>
          {showDev ? (
            <a class="nav-link" href="#/dev/sound-check">
              소리 점검
            </a>
          ) : null}
        </nav>
      </header>
      <main class="list-main" id="list-main" tabIndex={-1}>
        <h1>전체 도전</h1>
        <p class="subtitle">걷지 않고 바로 열어요. 어느 도전이든 선행 완료나 기록 없이 열 수 있어요.</p>
        {problem ? (
          <p class="problem" role="alert">
            <Icon name="alert" /> {problem}
          </p>
        ) : null}
        {catalog.channel === 'preview' ? <p class="review-note">미리보기 채널이에요. 음악 선생님의 확인과 권리 확인이 끝나지 않은 도전은 <strong>검수 전</strong> 표지가 붙어요.</p> : null}
        {map ? (
          <div class="filter-row" role="group" aria-label="지역으로 거르기">
            <span class="filter-label">지역</span>
            <button type="button" class={`chip chip-button${region === null ? ' is-selected' : ''}`} aria-pressed={region === null} data-filter-region="all" onClick={() => setRegion(null)}>
              전체
            </button>
            {map.regions.map((r) => (
              <button type="button" key={r.regionId} class={`chip chip-button${region === r.regionId ? ' is-selected' : ''}`} aria-pressed={region === r.regionId} data-filter-region={r.regionId} onClick={() => setRegion(region === r.regionId ? null : r.regionId)}>
                {r.name}
              </button>
            ))}
          </div>
        ) : null}
        <div class="filter-row" role="group" aria-label="주제로 거르기">
          <span class="filter-label">주제</span>
          <button type="button" class={`chip chip-button${tag === null ? ' is-selected' : ''}`} aria-pressed={tag === null} data-filter-tag="all" onClick={() => setTag(null)}>
            전체
          </button>
          {tags.map((t) => (
            <button type="button" key={t} class={`chip chip-button${tag === t ? ' is-selected' : ''}`} aria-pressed={tag === t} data-filter-tag={t} onClick={() => setTag(tag === t ? null : t)}>
              {topicName(t)}
            </button>
          ))}
        </div>
        {opened ? (
          <div class="filter-row" role="group" aria-label="열어 본 것으로 거르기">
            <button type="button" class={`chip chip-button${onlyUnopened ? ' is-selected' : ''}`} aria-pressed={onlyUnopened} data-filter-unopened onClick={() => setOnlyUnopened(!onlyUnopened)}>
              아직 열어 보지 않은 것
            </button>
          </div>
        ) : null}
        <p class="muted small filter-status" role="status" data-count={shown.length}>
          {shown.length}개 도전{summary ? ` · ${summary}` : ''}
        </p>
        {filtering ? (
          <p>
            <button type="button" class="btn btn-quiet" data-filter-clear onClick={clear}>
              거르기 풀고 모두 보기
            </button>
          </p>
        ) : null}
        {shown.length === 0 ? (
          <p class="empty-note" data-empty>
            {filtering ? '이 조건에 맞는 도전이 없어요. 아직 만들지 않았거나, 모두 열어 봤을 수 있어요. 거르기를 풀면 전부 다시 보여요.' : '열 수 있는 도전이 아직 없어요.'}
          </p>
        ) : null}
        <ul class="quest-list">
          {arranged.map((a) => (
            <QuestCard key={a.entry.questId} entry={a.entry} note={a.note} reason={a.reason} {...(panels ? { panels } : {})} />
          ))}
        </ul>
      </main>
    </div>
  );
}
