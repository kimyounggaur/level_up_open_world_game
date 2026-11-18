// 악보 지도(3.7, 7.7). 시안 B01의 구성이다: 왼쪽이 지도, 오른쪽이 과제 카드. 지도는 월드 전체를 보이고 확대·축소가 있다.
// 정거장 23곳이 처음부터 모두 표시되고, 어디든 고를 수 있다(이동 지점을 여는 절차 없음). 고른 곳에는 '걸어가기'와 '바로 이동'이 나온다.
// 끌지 않아도 모두 할 수 있다: 확대·축소는 단추와 + − 키, 정거장 고르기는 방향키나 아래 목록으로 한다(W-4).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ContentCatalog } from '../../domain/catalog';
import { isSelectable } from '../../domain/catalog';
import type { DiscoveryDef } from '../../domain/discovery';
import type { PlayInstrumentDef } from '../../domain/play';
import { stationQuests } from '../../domain/station-quests';
import type { StationQuest } from '../../domain/station-quests';
import { OVERVIEW_H, OVERVIEW_SCALE, OVERVIEW_W, regionBoundsPx } from '../../domain/world';
import type { Facing, RegionDef, Station, WorldMap } from '../../domain/world';
import { Store } from '../../platform/bridge';
import type { PlayerPosition } from '../../platform/bridge';
import { STATION_KIND_NAME_KO, descriptorText, topicName } from '../common/format';
import { useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import { OverlayFrame } from '../overlay/OverlayFrame';
import { FindLegend, FindMarks, PlayMarks } from './FindMarks';
import { centerOn, directionOfKey, ensureVisible, fullView, panBy, placeNameLabels, placeRegionLabels, scaleOf, stepStation, worldToScreen, zoomAt, zoomStep } from './view';
import type { MapView, Viewport } from './view';

export interface MapOverlayProps {
  map: WorldMap;
  catalog: ContentCatalog;
  /** 화면이 만들어진 패널 id들. 화면이 없는 판본은 '준비 중'이다 */
  panels: ReadonlySet<string>;
  /** 내 위치 */
  position: Store<PlayerPosition>;
  /** '걸어가기': 정거장 앞까지 길을 따라 걷는다 */
  onWalk: (stationId: string) => void;
  /** '바로 이동': 정거장 앞에 선다 */
  onTeleport: (stationId: string) => void;
  /** 처음 고를 정거장. 없으면 서 있는 자리에서 가장 가까운 정거장 */
  initialStationId?: string;
  /** 지도 그림 주소. 그림이 없거나 못 불러와도 지역 바탕과 표시는 그대로 보인다 */
  overviewUrl?: string;
  /** 지도에 자리를 보일 발견 요소들. 설정의 '발견 위치 표시'가 켜져 있을 때만 넘긴다(3.6 규칙 5). 없으면 아무것도 그리지 않는다 */
  finds?: readonly DiscoveryDef[];
  /** 찾은 발견 요소 id들. 찾은 것은 속이 찬 모양과 이름으로 보인다 */
  found?: Store<ReadonlySet<string>>;
  /** 지도에 자리를 보일 놀이 악기들(3.5). finds와 같이 '발견 위치 표시'가 켜져 있을 때만 넘긴다. 찾는 것이 아니라서 찾았는지가 없다 */
  plays?: readonly PlayInstrumentDef[];
}

const DEFAULT_VIEWPORT: Viewport = { width: 800, height: 560 };
/** 이 배율 이상으로 키우면 정거장 이름을 모두 보인다(작을 때는 겹치므로 고른 것만) */
const LABEL_ZOOM = 2.2;
/** 이름표 폭을 어림할 때 글자 하나의 폭(화면 px). 큰 글자(1.25배)에서도 넉넉하다 */
const NAME_CHAR_PX = 18;
const DRAG_THRESHOLD = 4;
const FACING_DEG: Readonly<Record<Facing, number>> = { up: 0, right: 90, down: 180, left: -90 };

export const DEFAULT_OVERVIEW_URL = 'world/overview.webp';

/** 찾은 것을 넘기지 않았을 때(표식을 그리지 않는다) 쓰는 빈 값 */
const NO_FOUND = new Store<ReadonlySet<string>>(new Set());

function QuestRow({ q, catalog, panels }: { q: StationQuest; catalog: ContentCatalog; panels: ReadonlySet<string> }) {
  const entry = catalog.get(q.questId);
  const variant = entry?.variants.find((v) => isSelectable(v.state) && v.panelIds.some((id) => panels.has(id)));
  return (
    <li class={`map-quest${q.openable ? '' : ' is-preparing'}`} data-quest={q.questId}>
      <div class="map-quest-head">
        <strong>
          {q.number ? `${q.number} · ` : ''}
          {q.title}
        </strong>
        {q.state === 'unreviewed' ? <span class="chip chip-state is-unreviewed">검수 전</span> : null}
      </div>
      {entry && entry.topicTags.length > 0 ? (
        <p class="quest-topics">
          {entry.topicTags.map((t) => (
            <span class="chip" key={t}>
              {topicName(t)}
            </span>
          ))}
        </p>
      ) : null}
      {variant ? (
        <p class="muted small">
          {variant.label} · {descriptorText(variant.descriptor)}
        </p>
      ) : null}
      {q.openable && q.hash ? (
        <a class="btn btn-primary" href={q.hash} aria-label={`${q.title} 시작하기`}>
          이 도전 시작하기 <Icon name="arrow-right" />
        </a>
      ) : (
        <p class="map-quest-note">
          <span class="variant-preparing" aria-label={`${q.title}: 준비 중`}>
            준비 중
          </span>
          {q.note ? <span class="muted small"> {q.note}</span> : null}
        </p>
      )}
    </li>
  );
}

export function MapOverlay({ map, catalog, panels, position, onWalk, onTeleport, initialStationId, overviewUrl = DEFAULT_OVERVIEW_URL, finds, found = NO_FOUND, plays }: MapOverlayProps) {
  const stations = useMemo(() => map.stations, [map]);
  const foundIds = useStore(found);
  // 지역 이름표 자리: 정거장 표시와 겹치지 않는 가장자리 쪽(월드 좌표라서 확대해도 같은 곳에 붙어 다닌다)
  const labelAt = useMemo(() => placeRegionLabels(map.regions.map((r: RegionDef) => ({ id: r.regionId, box: regionBoundsPx(r) })), stations), [map, stations]);
  const here = useStore(position);
  const [selectedId, setSelectedId] = useState<string>(() => (initialStationId && map.station(initialStationId) ? initialStationId : (map.nearestStation(position.get().x, position.get().y) ?? stations[0]!).stationId));
  const [vp, setVp] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [view, setView] = useState<MapView>(fullView);
  const [imageFailed, setImageFailed] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const focusAfter = useRef<string | null>(null);
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  const selected = map.station(selectedId) ?? stations[0]!;
  const selectedRegion = map.region(selected.regionId);
  const quests = useMemo(() => stationQuests(catalog, panels, selected), [catalog, panels, selected]);

  // 지도 영역의 크기를 잰다
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return; // 아직 자리가 잡히지 않았다(시험 환경 포함)
      setVp((prev) => (Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5 ? prev : { width: r.width, height: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 크기가 바뀌면 보기를 화면 안으로 다시 맞춘다
  useEffect(() => {
    setView((v) => ensureVisible(zoomAt(v, vp, v.zoom), vp, selected));
    // 고른 곳이 바뀔 때의 이동은 select()가 맡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp]);

  // 마우스 휠로 확대·축소(끌지 않아도 단추와 키로 된다)
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const anchor = { x: e.clientX - r.left, y: e.clientY - r.top };
      setView((v) => zoomAt(v, vpRef.current, v.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), anchor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 방향키로 옮긴 곳으로 초점을 보낸다
  useEffect(() => {
    if (focusAfter.current === selectedId) {
      markers.current.get(selectedId)?.focus({ preventScroll: true });
      focusAfter.current = null;
    }
  }, [selectedId]);

  const select = (id: string, opts: { focus?: boolean } = {}): void => {
    const st = map.station(id);
    if (!st) return;
    if (opts.focus) focusAfter.current = id;
    setSelectedId(id);
    setView((v) => ensureVisible(v, vpRef.current, st));
  };

  const onMarkerKey = (e: KeyboardEvent, id: string): void => {
    const dir = directionOfKey(e.key);
    if (!dir) return;
    e.preventDefault();
    const next = stepStation(stations, id, dir);
    if (next) select(next.stationId, { focus: true });
  };

  const onSurfaceKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setView((v) => zoomStep(v, vpRef.current, 1));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setView((v) => zoomStep(v, vpRef.current, -1));
    } else if (e.key === '0') {
      e.preventDefault();
      setView(fullView());
    }
  };

  // 끌어서 옮기기(선택 사항): 단추로 닿는 길이 따로 있다
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || (e.target as Element).closest('button, a')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    surface.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => panBy(v, vpRef.current, dx, dy));
  };
  const endDrag = (e: PointerEvent): void => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const at = (p: { x: number; y: number }) => worldToScreen(view, vp, p);
  const topLeft = at({ x: 0, y: 0 });
  const imageScale = scaleOf(view, vp);
  const showLabels = view.zoom >= LABEL_ZOOM;
  const me = at(here);
  const nearestToMe = map.nearestStation(here.x, here.y);
  // 고른 정거장의 이름표와 '내 위치' 글자가 서로, 그리고 표식과 점을 가리지 않는 자리를 고른다(처음 열면 합주 광장 곁에 서 있다)
  const regionBoxes = map.regions.map((r: RegionDef) => {
    const c = at(labelAt.get(r.regionId)!);
    const half = (r.name.length * NAME_CHAR_PX + 16) / 2;
    return { x0: c.x - half, y0: c.y - 14, x1: c.x + half, y1: c.y + 14 };
  });
  const otherDots = stations
    .filter((st: Station) => st.stationId !== selected.stationId)
    .map((st: Station) => {
      const p = at(st);
      return { x0: p.x - 12, y0: p.y - 12, x1: p.x + 12, y1: p.y + 12 };
    });
  const nameLayout = placeNameLabels(at(selected), me, selected.name.length * NAME_CHAR_PX + 16, { dots: otherDots, regions: regionBoxes });

  return (
    <OverlayFrame title="악보 지도" subtitle="지도에서 장소를 고르거나, 원하는 도전으로 바로 들어가세요." layout="wide" testId="map">
      <div class="map-layout">
        <div class="map-stage">
          <div
            class="map-surface"
            ref={surface}
            role="group"
            aria-label={`악보 지도. 정거장 ${stations.length}곳. 방향키로 옆 정거장을 고르고, + −로 확대와 축소를 해요.`}
            data-map-surface
            data-zoom={view.zoom.toFixed(2)}
            onKeyDown={onSurfaceKey}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {map.regions.map((r: RegionDef) => {
              const b = regionBoundsPx(r);
              const a = at({ x: b.x0, y: b.y0 });
              const z = at({ x: b.x1, y: b.y1 });
              return <div key={r.regionId} class="map-region" aria-hidden="true" style={{ left: `${a.x}px`, top: `${a.y}px`, width: `${z.x - a.x}px`, height: `${z.y - a.y}px`, background: r.accentColor }} />;
            })}
            {!imageFailed ? (
              <img
                class="map-image"
                src={overviewUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                width={OVERVIEW_W}
                height={OVERVIEW_H}
                onError={() => setImageFailed(true)}
                style={{ transform: `translate(${topLeft.x}px, ${topLeft.y}px) scale(${imageScale / OVERVIEW_SCALE})` }}
              />
            ) : null}
            {map.regions.map((r: RegionDef) => {
              const c = at(labelAt.get(r.regionId)!);
              return (
                <span key={r.regionId} class="map-region-label" aria-hidden="true" style={{ left: `${c.x}px`, top: `${c.y}px` }}>
                  {r.name}
                </span>
              );
            })}

            {finds && finds.length > 0 ? <FindMarks finds={finds} found={foundIds} at={at} /> : null}
            {plays && plays.length > 0 ? <PlayMarks plays={plays} at={at} /> : null}

            {stations.map((s: Station) => {
              const p = at(s);
              const isSel = s.stationId === selectedId;
              const region = map.region(s.regionId);
              return (
                <button
                  key={s.stationId}
                  type="button"
                  class={`map-marker${isSel ? ' is-selected' : ''}${showLabels || isSel ? ' has-label' : ''}${isSel ? ` name-${nameLayout.name}` : ''}`}
                  style={{ left: `${p.x}px`, top: `${p.y}px`, '--dot': region.accentColor }}
                  ref={(el) => {
                    if (el) markers.current.set(s.stationId, el);
                    else markers.current.delete(s.stationId);
                  }}
                  tabIndex={isSel ? 0 : -1}
                  aria-pressed={isSel}
                  aria-label={`${s.name}, ${region.name}`}
                  title={s.name}
                  data-station={s.stationId}
                  onClick={() => select(s.stationId)}
                  onKeyDown={(e) => onMarkerKey(e, s.stationId)}
                >
                  <span class="map-dot" aria-hidden="true" />
                  <span class="map-marker-name" aria-hidden="true">
                    {s.name}
                  </span>
                </button>
              );
            })}

            <div class="map-me" data-me style={{ left: `${me.x}px`, top: `${me.y}px` }} role="img" aria-label={`내 위치. 가장 가까운 정거장은 ${nearestToMe?.name ?? '없음'}`}>
              <img class="map-player-portrait" src="/assets/remaster/characters/player-portrait.webp" alt="" aria-hidden="true" width="40" height="40" />
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" style={{ transform: `rotate(${FACING_DEG[here.facing]}deg)` }}>
                <circle cx="15" cy="15" r="13" fill="#755675" stroke="#fffefa" stroke-width="2.5" />
                <path d="M15 7 21 20 15 17 9 20z" fill="#fffefa" />
              </svg>
              <span class={`map-me-label${nameLayout.meBelow ? ' is-below' : ''}`}>내 위치</span>
            </div>
          </div>
          <div class="map-toolbar">
            <div class="map-controls" role="group" aria-label="지도 확대와 축소">
              <button type="button" class="map-control" aria-label="확대" onClick={() => setView((v) => zoomStep(v, vpRef.current, 1))}>
                <Icon name="plus" />
              </button>
              <button type="button" class="map-control" aria-label="축소" onClick={() => setView((v) => zoomStep(v, vpRef.current, -1))}>
                <Icon name="minus" />
              </button>
              <button type="button" class="map-control map-control-wide" onClick={() => setView(fullView())}>
                전체 보기
              </button>
              <button type="button" class="map-control map-control-wide" onClick={() => setView((v) => centerOn(v, vpRef.current, here))}>
                내 위치로
              </button>
            </div>
            <p class="map-legend" aria-hidden="true">
              <span class="map-legend-me" /> 내 위치 <span class="map-legend-sel" /> 고른 장소
            </p>
            {(finds && finds.length > 0) || (plays && plays.length > 0) ? <FindLegend finds={!!finds && finds.length > 0} play={!!plays && plays.length > 0} /> : null}
          </div>
        </div>

        <aside class="map-side" aria-label="고른 장소">
          <section class="map-card" data-selected-station={selected.stationId} aria-labelledby="map-card-title">
            <img class="map-region-landscape" src={`/assets/remaster/frottage/backgrounds/webp/bg-${selectedRegion.regionId}.webp`} alt="" aria-hidden="true" width="1536" height="1024" loading="lazy" />
            <p class="map-card-region">
              <span class="map-card-dot" style={{ background: selectedRegion.accentColor }} aria-hidden="true" />
              {selectedRegion.name} · {STATION_KIND_NAME_KO[selected.archetype]}
            </p>
            <h2 id="map-card-title">{selected.name}</h2>
            <div class="map-go">
              <button type="button" class="btn btn-primary btn-large" data-action="walk" onClick={() => onWalk(selected.stationId)}>
                <Icon name="footsteps" /> 걸어가기
              </button>
              <button type="button" class="btn btn-large" data-action="teleport" onClick={() => onTeleport(selected.stationId)}>
                <Icon name="pin" /> 바로 이동
              </button>
            </div>
            <p class="muted small">걸어가기는 길을 따라 걸어요. 바로 이동은 그 앞으로 바로 가요.</p>
            <h3 class="map-quests-title">여기 놓인 과제</h3>
            <ul class="map-quests">
              {quests.map((q) => (
                <QuestRow key={q.questId} q={q} catalog={catalog} panels={panels} />
              ))}
            </ul>
          </section>

          <nav class="map-stations" aria-label="정거장 목록">
            <h3>다른 장소 고르기</h3>
            {map.regions.map((r: RegionDef) => (
              <section key={r.regionId} class="map-station-group" aria-label={r.name}>
                <h4>
                  <span class="map-card-dot" style={{ background: r.accentColor }} aria-hidden="true" />
                  {r.name}
                </h4>
                <ul>
                  {r.stations.map((s: Station) => (
                    <li key={s.stationId}>
                      <button type="button" class={`map-station-btn${s.stationId === selectedId ? ' is-selected' : ''}`} aria-pressed={s.stationId === selectedId} data-station-item={s.stationId} onClick={() => select(s.stationId)}>
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </aside>
      </div>
      <p class="map-band">모든 장소가 처음부터 열려 있어요. 어디서 시작해도 괜찮아요.</p>
    </OverlayFrame>
  );
}
