// 4-6 소리 물결의 위치 계산(설계서 8.4, W-8, 7.9의 6번). 화면 밖 900 px 안에 정거장이 있으면 그 방향의 화면 가장자리에 물결을 그린다.
// 소리를 꺼도 같은 정보를 받도록, 소리가 나는지와 상관없이 위치와 거리만으로 정한다. 그리기는 화면(ui/hud)이 한다.
import { HEAR_RADIUS, hearGain } from './worldsound';

export interface ScreenSize {
  width: number;
  height: number;
}

/** 화면에 보이는 월드의 직사각형(월드 px) */
export interface WorldView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RippleSource {
  id: string;
  name: string;
  x: number;
  y: number;
}

export type RippleEdge = 'top' | 'right' | 'bottom' | 'left';

export interface Ripple {
  id: string;
  name: string;
  /** 물결이 놓이는 화면 가장자리의 점(화면 px) */
  x: number;
  y: number;
  edge: RippleEdge;
  /** 화면 가운데에서 그 정거장을 향하는 각도(도). 0은 오른쪽, 90은 아래쪽 */
  angle: number;
  /** 0–1: 가까울수록 크다(음량과 같은 식이다) */
  strength: number;
  /** 캐릭터와의 거리(월드 px) */
  distance: number;
}

/** 화면 가장자리마다 더 들이는 거리(화면 px). 아래 탭 막대처럼 화면 한쪽을 가리는 것이 있을 때 쓴다 */
export interface RippleInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface RippleOptions {
  /** 가장자리에서 안쪽으로 들이는 거리(화면 px) */
  margin?: number;
  /** 가장자리마다 margin에 더해 들이는 거리 */
  insets?: RippleInsets;
  /** 한꺼번에 그리는 물결의 최대 수 */
  max?: number;
  /** 화면 안으로 보는 여유(월드 px). 이만큼 안쪽까지 들어와야 '보인다'고 센다 */
  visiblePad?: number;
}

export const DEFAULT_RIPPLE_MARGIN = 14;
export const DEFAULT_MAX_RIPPLES = 6;
export const DEFAULT_VISIBLE_PAD = 24;

/**
 * 지금 그려야 할 물결들. 캐릭터에게서 900 px 안이고 화면에 보이지 않는 정거장만, 가까운 것부터 최대 max개.
 * 방향은 화면 가운데에서 그 정거장이 있는 쪽이다.
 */
export function computeRipples(
  sources: readonly RippleSource[],
  player: { x: number; y: number },
  view: WorldView,
  screen: ScreenSize,
  opts: RippleOptions = {},
): Ripple[] {
  const margin = opts.margin ?? DEFAULT_RIPPLE_MARGIN;
  const max = opts.max ?? DEFAULT_MAX_RIPPLES;
  const pad = opts.visiblePad ?? DEFAULT_VISIBLE_PAD;
  if (screen.width <= 0 || screen.height <= 0 || view.width <= 0 || view.height <= 0) return [];
  const sx = screen.width / view.width;
  const sy = screen.height / view.height;
  const cx = screen.width / 2;
  const cy = screen.height / 2;
  const out: Ripple[] = [];
  for (const s of sources) {
    const distance = Math.hypot(s.x - player.x, s.y - player.y);
    if (!(distance < HEAR_RADIUS)) continue;
    const inside = s.x >= view.x + pad && s.x <= view.x + view.width - pad && s.y >= view.y + pad && s.y <= view.y + view.height - pad;
    if (inside) continue;
    // 화면 가운데에서 정거장을 향하는 반직선이 가장자리(안쪽 margin)와 만나는 곳
    const dx = (s.x - view.x) * sx - cx;
    const dy = (s.y - view.y) * sy - cy;
    if (dx === 0 && dy === 0) continue;
    const reachX = dx > 0 ? screen.width - margin - (opts.insets?.right ?? 0) - cx : cx - (margin + (opts.insets?.left ?? 0));
    const reachY = dy > 0 ? screen.height - margin - (opts.insets?.bottom ?? 0) - cy : cy - (margin + (opts.insets?.top ?? 0));
    const tx = dx === 0 ? Infinity : Math.max(0, reachX) / Math.abs(dx);
    const ty = dy === 0 ? Infinity : Math.max(0, reachY) / Math.abs(dy);
    const t = Math.min(tx, ty);
    const edge: RippleEdge = tx <= ty ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
    out.push({
      id: s.id,
      name: s.name,
      x: cx + dx * t,
      y: cy + dy * t,
      edge,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      strength: hearGain(distance),
      distance,
    });
  }
  out.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  return out.slice(0, max);
}
