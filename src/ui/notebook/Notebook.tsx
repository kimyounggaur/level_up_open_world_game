// 수첩(7.5의 N, 6.5): 한 일을 보여 준다. 지역 쪽 여섯 장(열어 봄과 통과, 템포와 도움), 발견, 내 곡, 관찰.
// 경험치, 별점, 순위, 전체 완주율을 보여 주지 않고, 남은 일의 개수를 앞세우지 않는다(6.7).
// 관찰은 있었던 일만 사실 문장으로 적는다(W-9). 쪽은 탭으로 넘기고, ← →, Home, End로도 넘긴다.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AttemptResult } from '../../domain/attempt';
import { ContentCatalog, isSelectable } from '../../domain/catalog';
import type { QuestEntry } from '../../domain/catalog';
import type { DiscoveryDef } from '../../domain/discovery';
import { buildRegionPages, observe } from '../../domain/notebook';
import type { PassKind, QuestRecord, VariantRecord } from '../../domain/notebook';
import type { RegionId, WorldMap } from '../../domain/world';
import type { TempoReference } from '../../domain/time';
import type { ChallengeController } from '../challenge/controller';
import type { FreeMelody } from '../challenge/melody';
import { tempoText } from '../common/format';
import { OverlayFrame } from '../overlay/OverlayFrame';
import { CreationsPage, DiscoveriesPage } from './NotebookPages';

export type NotebookPageId = `region:${RegionId}` | 'others' | 'discoveries' | 'creations' | 'observations';

export interface NotebookProps {
  catalog: ContentCatalog;
  map: WorldMap;
  /** 지금까지의 시도 기록 */
  attempts: readonly AttemptResult[];
  /** 열어 본 과제 id들 */
  opened: ReadonlySet<string>;
  /** 지금 있는 지역. 처음에 펼치는 쪽이다 */
  regionId: RegionId;
  /** 화면이 만들어진 패널 id들. 화면이 없는 판본에는 '열기'를 보이지 않는다 */
  panels?: ReadonlySet<string>;
  /** 처음에 펼칠 쪽(시험용). 없으면 지금 있는 지역의 쪽 */
  initialPage?: NotebookPageId;
  /** 발견 쪽과 내 곡 쪽을 채우는 것들(6.5): 찾은 것, 저장한 곡, 다시 듣기 */
  melody: FreeMelody;
  /** 듣기가 끝나면 단추가 다시 그려지게 한다 */
  controller: ChallengeController;
  /** 이 채널에서 보이는 발견 요소(id 순서) */
  discoveries: readonly DiscoveryDef[];
}

interface PageInfo {
  id: NotebookPageId;
  label: string;
}

/** 통과 한 줄. 템포와 도움 사용 여부를 함께 적는다. 느린 템포의 통과는 원래 템포의 통과와 다른 줄이다 */
export function passLine(kind: PassKind, reference: TempoReference = 'quarter'): string {
  const parts = ['통과'];
  if (kind.tempoBpm !== null) {
    const base = tempoText(reference, kind.tempoBpm);
    parts.push(kind.slower && kind.originalTempoBpm !== null ? `느린 템포 ${base}(원래 ${kind.originalTempoBpm})` : `원래 템포 ${base}`);
  }
  parts.push(kind.assistUsed ? '도움을 썼어요' : '도움 없이');
  if (kind.count > 1) parts.push(`${kind.count}번`);
  return parts.join(' · ');
}

function VariantRow({ quest, variant, entry, panels }: { quest: QuestRecord; variant: VariantRecord; entry: QuestEntry | undefined; panels: ReadonlySet<string> | undefined }) {
  const catalogVariant = entry?.variants.find((v) => v.variantId === variant.variantId);
  const reference = entry?.definition.variants[variant.variantId]?.score.tempoReference ?? 'quarter';
  const openable = catalogVariant !== undefined && isSelectable(catalogVariant.state) && (!panels || catalogVariant.panelIds.some((id) => panels.has(id)));
  return (
    <li class="variant-row nb-variant" data-variant={variant.variantId} data-judged={variant.judged} data-passed={variant.passes.length > 0 ? 'true' : 'false'}>
      <div class="variant-text">
        <strong>{variant.label}</strong>
        <ul class="nb-records">
          {variant.passes.map((p) => (
            <li class="nb-pass" key={`${p.tempoBpm}|${p.originalTempoBpm}|${p.assistUsed}`} data-slower={p.slower ? 'true' : 'false'} data-assist={p.assistUsed ? 'true' : 'false'}>
              <span class="nb-mark" aria-hidden="true">
                ✓
              </span>
              {passLine(p, reference)}
            </li>
          ))}
          {variant.judged > 0 ? <li class="muted small nb-tries">확인 {variant.judged}번</li> : <li class="muted small nb-none">아직 기록이 없어요</li>}
        </ul>
      </div>
      {openable ? (
        <a class="btn" href={ContentCatalog.hashFor(quest.questId, variant.variantId)} aria-label={`${quest.title} · ${variant.label} 열기`}>
          열기
        </a>
      ) : null}
    </li>
  );
}

function QuestCard({ quest, catalog, panels }: { quest: QuestRecord; catalog: ContentCatalog; panels: ReadonlySet<string> | undefined }) {
  const entry = catalog.get(quest.questId);
  return (
    <li class="quest-card nb-quest" data-quest={quest.questId} data-opened={quest.opened ? 'true' : 'false'}>
      <div class="quest-card-head">
        <h3>{quest.number ? `${quest.number} ${quest.title}` : quest.title}</h3>
        {quest.opened ? <span class="chip chip-solid nb-opened">열어 봄</span> : null}
      </div>
      {quest.places.length > 0 ? <p class="muted small nb-places">놓인 곳: {quest.places.join(', ')}</p> : null}
      <ul class="variant-list">
        {quest.variants.map((v) => (
          <VariantRow key={v.variantId} quest={quest} variant={v} entry={entry} panels={panels} />
        ))}
      </ul>
    </li>
  );
}

export function Notebook({ catalog, map, attempts, opened, regionId, panels, initialPage, melody, controller, discoveries }: NotebookProps) {
  const pages = buildRegionPages({ catalog, map, attempts, opened });
  const observations = observe(attempts, (id) => catalog.get(id)?.title ?? id);
  const list: PageInfo[] = [
    ...pages.regions.map((r): PageInfo => ({ id: `region:${r.regionId}`, label: r.name })),
    // 어느 정거장에도 놓이지 않은 과제가 있을 때만 '그 밖' 쪽을 둔다
    ...(pages.unplaced.length > 0 ? [{ id: 'others', label: '그 밖' } as PageInfo] : []),
    { id: 'discoveries', label: '발견' },
    { id: 'creations', label: '내 곡' },
    { id: 'observations', label: '관찰' },
  ];
  const [current, setCurrent] = useState<NotebookPageId>(initialPage ?? `region:${regionId}`);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const index = Math.max(0, list.findIndex((p) => p.id === current));
  // 쪽을 넘기는 길이 무엇이든(탭, 이전·다음 쪽 단추, 처음 펼침) 고른 탭이 옆으로 밀리는 탭 줄 안에서 보이게 한다. 세로로는 움직이지 않는다
  useEffect(() => {
    const el = tabRefs.current[current];
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  const go = (to: number, focus: boolean): void => {
    const next = list[(to + list.length) % list.length]!;
    setCurrent(next.id);
    if (focus) tabRefs.current[next.id]?.focus();
  };
  const onTabKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let to: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = index + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = index - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = list.length - 1;
    if (to === null) return;
    e.preventDefault();
    go(to, true);
  };

  const page = list[index]!;
  let body;
  if (page.id.startsWith('region:')) {
    const region = pages.regions.find((r) => `region:${r.regionId}` === page.id)!;
    body = (
      <>
        <h2>{region.name}</h2>
        <p class="muted nb-lead">이 지역의 정거장에 놓인 도전이에요.</p>
        {region.quests.length === 0 ? (
          <p class="empty-note" data-empty>
            이 지역에서 열 수 있는 도전이 아직 없어요.
          </p>
        ) : (
          <ul class="quest-list nb-quests">
            {region.quests.map((q) => (
              <QuestCard key={q.questId} quest={q} catalog={catalog} panels={panels} />
            ))}
          </ul>
        )}
      </>
    );
  } else if (page.id === 'others') {
    body = (
      <>
        <h2>그 밖</h2>
        <p class="muted nb-lead">어느 정거장에도 놓이지 않은 도전이에요. 목록이나 주소로 열 수 있어요.</p>
        <ul class="quest-list nb-quests">
          {pages.unplaced.map((q) => (
            <QuestCard key={q.questId} quest={q} catalog={catalog} panels={panels} />
          ))}
        </ul>
      </>
    );
  } else if (page.id === 'discoveries') {
    body = <DiscoveriesPage discoveries={discoveries} melody={melody} controller={controller} catalog={catalog} panels={panels} />;
  } else if (page.id === 'creations') {
    body = <CreationsPage melody={melody} controller={controller} />;
  } else {
    body = (
      <>
        <h2>관찰</h2>
        <p class="muted nb-lead">최근에 확인한 도전에서 있었던 일을 사실로만 적어요.</p>
        {observations.length === 0 ? (
          <p class="empty-note" data-empty>
            아직 확인한 도전이 없어요. 도전을 확인하면 있었던 일이 여기에 적혀요.
          </p>
        ) : (
          <ul class="quest-list nb-observations">
            {observations.map((o) => (
              <li class="quest-card nb-observation" key={o.questId} data-quest={o.questId} data-checks={o.checks}>
                <div class="quest-card-head">
                  <h3>{o.title}</h3>
                  {o.note ? <span class="chip nb-few">{o.note}</span> : null}
                </div>
                <ul class="nb-sentences">
                  {o.sentences.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <OverlayFrame title="수첩" subtitle="한 일이 적혀 있어요. 열어 본 것, 통과한 것, 그때의 템포와 도움까지요." testId="notebook">
      <div class="nb">
        <div class="nb-tabs" role="tablist" aria-label="수첩의 쪽" onKeyDown={onTabKey}>
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`nb-tab-${p.id.replace(':', '-')}`}
              class={`chip chip-button nb-tab${i === index ? ' is-selected' : ''}`}
              aria-selected={i === index}
              aria-controls="nb-page"
              tabIndex={i === index ? 0 : -1}
              data-page={p.id}
              ref={(el) => {
                tabRefs.current[p.id] = el;
              }}
              onClick={() => setCurrent(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <section class="nb-page" id="nb-page" role="tabpanel" aria-labelledby={`nb-tab-${page.id.replace(':', '-')}`} data-page-id={page.id}>
          {body}
        </section>
        <div class="nb-pager">
          <button type="button" class="btn" data-pager="prev" onClick={() => go(index - 1, false)}>
            이전 쪽
          </button>
          <button type="button" class="btn" data-pager="next" onClick={() => go(index + 1, false)}>
            다음 쪽
          </button>
        </div>
      </div>
    </OverlayFrame>
  );
}
