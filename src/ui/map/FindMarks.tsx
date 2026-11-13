// 지도의 발견 위치 표시(설계서 3.6 규칙 5): 설정의 '발견 위치 표시'를 켰을 때만 그린다. 걷기가 어렵거나 찾기를 원하지 않는 사람을 위한 선택이다.
// 위치만 알려 주고 이름은 찾은 것만 알려 준다(못 찾은 것은 이름도 모른다). 찾았는지는 색이 아니라 모양으로 구별한다:
// 속이 빈 것은 못 찾은 것, 속이 찬 것은 찾은 것이다. 소리 조각은 둥근 음표 머리, 개념 쪽지는 네모난 쪽지다(월드의 표식과 같은 모양).
// 남은 개수나 진행률은 적지 않는다(6.7). 누르는 것이 아니라 보는 것이다: 그림만 있고 초점을 받지 않는다.
import { isSoundPiece } from '../../domain/discovery';
import type { DiscoveryDef } from '../../domain/discovery';
import type { PlayInstrumentDef } from '../../domain/play';

export type FindKind = 'piece' | 'note';

export const findKindOf = (d: DiscoveryDef): FindKind => (isSoundPiece(d) ? 'piece' : 'note');
export const FIND_KIND_NAME_KO: Readonly<Record<FindKind, string>> = { piece: '소리 조각', note: '개념 쪽지' };
/** 놀이 악기(3.5, 6-9c)는 찾는 것이 아니라서 찾았는지가 없고, 이름도 처음부터 보인다 */
export const PLAY_KIND_NAME_KO = '놀이 악기';
export const playLabel = (p: Pick<PlayInstrumentDef, 'name'>): string => `${PLAY_KIND_NAME_KO}: ${p.name}`;

/** 표식의 낭독 이름: 못 찾은 것은 종류만, 찾은 것은 이름도 */
export function findLabel(d: DiscoveryDef, found: boolean): string {
  const kind = FIND_KIND_NAME_KO[findKindOf(d)];
  return found ? `찾은 ${kind}: ${d.name}` : `아직 못 찾은 ${kind}`;
}

const INK = '#243c3a';
const PAPER = '#fffefa';
const GOLD = '#e0a800';
const GOLD_LIGHT = '#ffe08a';

/** 표식 하나의 모양. 월드의 표식과 같은 모양을 작게 그린 것이다 */
export function FindShape({ kind, found, size }: { kind: FindKind; found: boolean; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true" data-find-shape={`${kind}-${found ? 'found' : 'open'}`}>
      {kind === 'piece' ? (
        <g>
          {found ? <circle cx="12" cy="12" r="11" fill={GOLD} fill-opacity="0.35" /> : null}
          <circle cx="12" cy="12" r="6.5" fill={found ? INK : PAPER} stroke={INK} stroke-width="3" />
        </g>
      ) : (
        <g>
          {found ? <circle cx="12" cy="12" r="11" fill={GOLD} fill-opacity="0.35" /> : null}
          <rect x="5" y="5" width="14" height="14" rx="1.5" fill={found ? GOLD_LIGHT : PAPER} stroke={INK} stroke-width="3" />
          {found ? <path d="M8.5 10.5h7M8.5 13.5h7" stroke={INK} stroke-width="1.6" stroke-linecap="round" /> : null}
        </g>
      )}
    </svg>
  );
}

/** 놀이 악기의 표식: 돌 네 개가 둘러선 모양(찾은 것과 못 찾은 것의 구별이 없다) */
export function PlayShape({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true" data-find-shape="play">
      <circle cx="12" cy="12" r="11" fill={GOLD} fill-opacity="0.35" />
      <circle cx="7.5" cy="7.5" r="3.4" fill={PAPER} stroke={INK} stroke-width="2" />
      <circle cx="16.5" cy="7.5" r="3.4" fill={PAPER} stroke={INK} stroke-width="2" />
      <circle cx="16.5" cy="16.5" r="3.4" fill={PAPER} stroke={INK} stroke-width="2" />
      <circle cx="7.5" cy="16.5" r="3.4" fill={PAPER} stroke={INK} stroke-width="2" />
    </svg>
  );
}

export interface FindMarksProps {
  finds: readonly DiscoveryDef[];
  found: ReadonlySet<string>;
  /** 월드 좌표를 지도 화면 좌표로 */
  at: (p: { x: number; y: number }) => { x: number; y: number };
}

export function FindMarks({ finds, found, at }: FindMarksProps) {
  return (
    <>
      {finds.map((d) => {
        const p = at(d);
        const isFound = found.has(d.discoveryId);
        return (
          <span
            key={d.discoveryId}
            class={`map-find is-${findKindOf(d)}${isFound ? ' is-found' : ''}`}
            style={{ left: `${p.x}px`, top: `${p.y}px` }}
            role="img"
            aria-label={findLabel(d, isFound)}
            data-find={d.discoveryId}
            data-find-kind={findKindOf(d)}
            data-found={isFound ? '1' : '0'}
          >
            <FindShape kind={findKindOf(d)} found={isFound} size={22} />
          </span>
        );
      })}
    </>
  );
}

export interface PlayMarksProps {
  plays: readonly PlayInstrumentDef[];
  /** 월드 좌표를 지도 화면 좌표로 */
  at: (p: { x: number; y: number }) => { x: number; y: number };
}

/** 놀이 악기의 자리. 악기의 가운데(설계서의 좌표)에 둔다. 누르는 것이 아니라 보는 것이다 */
export function PlayMarks({ plays, at }: PlayMarksProps) {
  return (
    <>
      {plays.map((p) => {
        const c = at(p);
        return (
          <span key={p.playId} class="map-find is-play" style={{ left: `${c.x}px`, top: `${c.y}px` }} role="img" aria-label={playLabel(p)} data-play={p.playId} data-find-kind="play">
            <PlayShape size={22} />
          </span>
        );
      })}
    </>
  );
}

/** 지도 아래의 모양 안내(보는 사람용). 낭독기에는 표식마다 이름이 있으므로 읽지 않는다. finds가 없고 놀이 악기만 있으면 놀이 악기만 안내한다 */
export function FindLegend({ finds = true, play = false }: { finds?: boolean; play?: boolean }) {
  return (
    <p class="map-legend map-legend-finds" aria-hidden="true" data-find-legend>
      {finds ? (
        <>
          <span class="map-legend-pair">
            <FindShape kind="piece" found={false} size={16} />
            <FindShape kind="piece" found={true} size={16} /> 소리 조각
          </span>
          <span class="map-legend-pair">
            <FindShape kind="note" found={false} size={16} />
            <FindShape kind="note" found={true} size={16} /> 개념 쪽지
          </span>
        </>
      ) : null}
      {play ? (
        <span class="map-legend-pair">
          <PlayShape size={16} /> {PLAY_KIND_NAME_KO}
        </span>
      ) : null}
      {finds ? <span>속이 찬 것이 찾은 것</span> : null}
    </p>
  );
}
