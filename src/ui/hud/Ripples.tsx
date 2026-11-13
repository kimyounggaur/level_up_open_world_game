// 4-6 소리 물결(설계서 8.4, 7.6 '화면 가장자리', W-8, 7.9의 6번). 화면 밖 900 px 안에 정거장이나 소리 조각이 있으면 그 방향의 화면 가장자리에 물결 표식을 그린다.
// 소리를 꺼도 같은 정보를 받도록 소리가 나는지와 상관없이 위치만으로 그린다. 서명 소리(정거장은 4마디에 한 번)나 소리 조각(2마디에 한 번)이 울리는 마디마다
// 표식에서 물결이 한 번 퍼진다: 소리를 켜면 들리는 때와 같고, 소리를 끄면 소리 없이 박만 보인다(같은 세계 시계를 센다).
// 움직임 줄이기에서는 퍼지는 물결 없이 멈춘 표식만 그린다. 표식은 누르는 것이 아니라 보는 것이고 화면 낭독기에는 읽히지 않는다(aria-hidden):
// 바뀔 때마다 읽으면 소란스럽고, 소리를 쓰는 사람에게는 소리가 같은 정보를 준다.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { computeRipples } from '../../domain/ripple';
import type { Ripple, RippleSource } from '../../domain/ripple';
import { lastPieceRingBar, lastRingBar, signatureOffset } from '../../domain/worldsound';
import type { WorldBridge } from '../../platform/bridge';
import { usePortrait, useStore } from '../common/hooks';

/** 물결이 퍼지는 박을 읽는 시계. app의 세계 시계가 이 모양이다 */
export interface RippleClock {
  now(): number;
  bar(t?: number): number;
  barStart(n: number): number;
}

export interface RipplesProps {
  bridge: Pick<WorldBridge, 'view' | 'position'>;
  /** 소리가 나는 정거장들. 순서가 서명 소리의 시작 마디를 정한다(소리와 같은 순서여야 같은 박에 퍼진다) */
  stations: readonly RippleSource[];
  /** 소리 조각들. 순서가 울리는 마디의 짝홀을 정한다(소리와 같은 순서여야 같은 박에 퍼진다). 조각의 이름은 싣지 않는다: 못 찾은 것은 이름도 모른다 */
  pieces?: readonly RippleSource[];
  clock: RippleClock;
  /** 움직임 줄이기: 퍼지는 물결 없이 멈춘 표식만 */
  reducedMotion: boolean;
}

const NO_PIECES: readonly RippleSource[] = [];

/** 세로 화면에서 아래 탭 막대(64 px)에 가려지지 않게 더 들이는 거리 */
export const PORTRAIT_BOTTOM_INSET = 72;

/** 표식의 크기(화면 px): 가까울수록 크다 */
export const rippleSize = (strength: number): number => Math.round(30 + 26 * Math.sqrt(Math.max(0, Math.min(1, strength))));

/**
 * 지금 몇 번째 마디인지를, 마디가 바뀌는 순간에 맞춰 알린다. 물결은 마디의 시작에 퍼져야 소리와 맞는다.
 * 움직임이 없으면(active가 false) 깨우지 않는다.
 */
function useBar(clock: RippleClock, active: boolean): number {
  const [bar, setBar] = useState<number>(() => clock.bar());
  useEffect(() => {
    if (!active) return;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      const n = clock.bar();
      setBar(n);
      handle = setTimeout(arm, Math.max(20, (clock.barStart(n + 1) - clock.now()) * 1000 + 5));
    };
    arm();
    return () => clearTimeout(handle);
  }, [clock, active]);
  return bar;
}

function RippleMark({ ripple, kind, pulseKey, animate }: { ripple: Ripple; kind: 'station' | 'piece'; pulseKey: number; animate: boolean }) {
  const size = rippleSize(ripple.strength);
  return (
    <span
      class="ripple"
      data-ripple={ripple.id}
      data-source={kind}
      data-edge={ripple.edge}
      data-strength={ripple.strength.toFixed(3)}
      style={{ left: `${ripple.x.toFixed(1)}px`, top: `${ripple.y.toFixed(1)}px`, width: `${size}px`, height: `${size}px` }}
    >
      {animate ? <span class="ripple-wave" key={pulseKey} /> : null}
      <svg viewBox="0 0 48 48" width={size} height={size} focusable="false">
        {/* 어느 바닥 위에서도 보이게: 어두운 바탕 선 위에 밝은 선을 겹친다 */}
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="24" cy="24" r="13" stroke="#243c3a" stroke-opacity="0.6" stroke-width="6" />
          <circle cx="24" cy="24" r="13" stroke="#fffefa" stroke-width="2.5" />
          <circle cx="24" cy="24" r="6" stroke="#243c3a" stroke-opacity="0.6" stroke-width="5" />
          <circle cx="24" cy="24" r="6" stroke="#fffefa" stroke-width="2" />
          <g transform={`rotate(${ripple.angle.toFixed(1)} 24 24)`}>
            <path d="M 37 18 L 44 24 L 37 30" stroke="#243c3a" stroke-opacity="0.6" stroke-width="6" />
            <path d="M 37 18 L 44 24 L 37 30" stroke="#fffefa" stroke-width="2.5" />
          </g>
        </g>
      </svg>
    </span>
  );
}

export function Ripples({ bridge, stations, pieces = NO_PIECES, clock, reducedMotion }: RipplesProps) {
  const report = useStore(bridge.view);
  const player = useStore(bridge.position);
  const portrait = usePortrait();
  const bar = useBar(clock, !reducedMotion);
  const offsets = useMemo(() => new Map(stations.map((s, i) => [s.id, signatureOffset(i)])), [stations]);
  const pieceIndex = useMemo(() => new Map(pieces.map((p, i) => [p.id, i])), [pieces]);
  const sources = useMemo(() => [...stations, ...pieces], [stations, pieces]);
  const ripples = report
    ? computeRipples(sources, player, report.view, report.screen, portrait ? { insets: { bottom: PORTRAIT_BOTTOM_INSET } } : {})
    : [];
  return (
    <div class="hud-ripples" aria-hidden="true" data-ripples={ripples.length}>
      {ripples.map((r) => {
        const index = pieceIndex.get(r.id);
        const pulseKey = index === undefined ? lastRingBar(bar, offsets.get(r.id) ?? 0) : lastPieceRingBar(bar, index);
        return <RippleMark key={r.id} ripple={r} kind={index === undefined ? 'station' : 'piece'} pulseKey={pulseKey} animate={!reducedMotion} />;
      })}
    </div>
  );
}
