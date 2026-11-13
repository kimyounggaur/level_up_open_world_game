// 악보 지도의 보기 계산(설계서 3.7, 7.7). 화면을 모르는 순수 함수만 둔다: 월드 좌표 ↔ 지도 화면 좌표, 확대·축소, 끌어 옮기기, 방향키로 다음 정거장.
// 보기(MapView)는 '화면 가운데에 놓이는 월드 점'과 '전체 보기의 몇 배인가'(zoom) 둘이다. 전체 보기(zoom 1)는 월드 전체가 화면에 들어온다.
import { WORLD_H, WORLD_W } from '../../domain/world';

export interface Viewport {
  width: number;
  height: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface MapView {
  /** 화면 가운데에 놓이는 월드 점 */
  cx: number;
  cy: number;
  /** 전체 보기(1)의 몇 배인가 */
  zoom: number;
}

export const ZOOM_MIN = 1;
/** 지도 그림(2048×1536)이 월드 px당 0.25 화면 px라서, 이 이상 키우면 그림이 눈에 띄게 흐려진다 */
export const ZOOM_MAX = 4;
/** 확대·축소 단추를 한 번 누를 때 곱하는 배율 */
export const ZOOM_STEP = 1.6;

/** 월드 전체가 화면에 들어오는 배율(월드 px → 화면 px) */
export const fitScale = (vp: Viewport): number => Math.max(1e-6, Math.min(vp.width / WORLD_W, vp.height / WORLD_H));

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : ZOOM_MIN));

/** 월드 px → 화면 px 배율 */
export const scaleOf = (view: MapView, vp: Viewport): number => fitScale(vp) * view.zoom;

export const fullView = (): MapView => ({ cx: WORLD_W / 2, cy: WORLD_H / 2, zoom: ZOOM_MIN });

/** 월드가 화면보다 작은 쪽은 가운데에 두고, 큰 쪽은 월드 밖이 보이지 않게 자른다 */
export function clampView(view: MapView, vp: Viewport): MapView {
  const zoom = clampZoom(view.zoom);
  const s = fitScale(vp) * zoom;
  const halfW = vp.width / 2 / s;
  const halfH = vp.height / 2 / s;
  const inRange = (v: number, half: number, size: number): number => (half * 2 >= size ? size / 2 : Math.min(size - half, Math.max(half, v)));
  return { cx: inRange(view.cx, halfW, WORLD_W), cy: inRange(view.cy, halfH, WORLD_H), zoom };
}

export function worldToScreen(view: MapView, vp: Viewport, p: Pt): Pt {
  const s = scaleOf(view, vp);
  return { x: (p.x - view.cx) * s + vp.width / 2, y: (p.y - view.cy) * s + vp.height / 2 };
}

export function screenToWorld(view: MapView, vp: Viewport, p: Pt): Pt {
  const s = scaleOf(view, vp);
  return { x: (p.x - vp.width / 2) / s + view.cx, y: (p.y - vp.height / 2) / s + view.cy };
}

/** 배율만 바꾼다. anchor(화면 좌표)가 가리키던 월드 점은 그 자리에 그대로 남는다. 없으면 화면 가운데를 기준으로 한다 */
export function zoomAt(view: MapView, vp: Viewport, nextZoom: number, anchor?: Pt): MapView {
  const zoom = clampZoom(nextZoom);
  const a = anchor ?? { x: vp.width / 2, y: vp.height / 2 };
  const under = screenToWorld(view, vp, a);
  const s = fitScale(vp) * zoom;
  return clampView({ cx: under.x - (a.x - vp.width / 2) / s, cy: under.y - (a.y - vp.height / 2) / s, zoom }, vp);
}

/** 한 칸 키우거나(+) 줄인다(−) */
export const zoomStep = (view: MapView, vp: Viewport, direction: 1 | -1, anchor?: Pt): MapView => zoomAt(view, vp, direction > 0 ? view.zoom * ZOOM_STEP : view.zoom / ZOOM_STEP, anchor);

/** 점을 화면 가운데로 가져온다. zoom을 주면 배율도 바꾼다 */
export const centerOn = (view: MapView, vp: Viewport, p: Pt, zoom?: number): MapView => clampView({ cx: p.x, cy: p.y, zoom: zoom ?? view.zoom }, vp);

/** 화면에서 (dx, dy)만큼 끌어 옮긴다. 손가락이나 마우스를 오른쪽으로 끌면 지도가 오른쪽으로 따라온다 */
export function panBy(view: MapView, vp: Viewport, dx: number, dy: number): MapView {
  const s = scaleOf(view, vp);
  return clampView({ ...view, cx: view.cx - dx / s, cy: view.cy - dy / s }, vp);
}

/** 점이 화면 안(가장자리에서 margin 안쪽)에 보이면 그대로, 아니면 가운데로 옮긴다 */
export function ensureVisible(view: MapView, vp: Viewport, p: Pt, margin = 56): MapView {
  const at = worldToScreen(view, vp, p);
  const inside = at.x >= margin && at.x <= vp.width - margin && at.y >= margin && at.y <= vp.height - margin;
  return inside ? view : centerOn(view, vp, p);
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_OF_KEY: Readonly<Record<string, Direction>> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** 방향키 이름을 방향으로. 방향키가 아니면 null */
export const directionOfKey = (key: string): Direction | null => DIRECTION_OF_KEY[key] ?? null;

/**
 * 방향키로 옮길 다음 정거장. 그 방향 쪽에 있는 것 가운데 가깝고 비스듬하지 않은 것(곧게 간 거리 + 비스듬한 거리의 2배가 가장 작은 것)이다.
 * 그 방향에 아무것도 없으면 null이다(자리를 지킨다). 모든 정거장은 목록으로도 고를 수 있어서, 방향키만으로 닿지 않는 곳이 있어도 막히지 않는다.
 */
export function stepStation<T extends Pt & { stationId: string }>(items: readonly T[], fromId: string, dir: Direction): T | null {
  const from = items.find((i) => i.stationId === fromId);
  if (!from) return null;
  let best: T | null = null;
  let bestScore = Infinity;
  for (const it of items) {
    if (it.stationId === fromId) continue;
    const dx = it.x - from.x;
    const dy = it.y - from.y;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (along <= 0) continue;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 이름표(가로로 긴 모양)와 다른 점 사이의 거리. 가로 거리는 3분의 1만 센다 */
const labelGap = (c: Pt, p: Pt): number => Math.hypot((p.x - c.x) / 3, p.y - c.y);

/**
 * 지역 이름표를 놓을 월드 좌표들. 지역마다 위·아래 가장자리 쪽 후보 가운데, 정거장과 이미 놓은 다른 이름표에서
 * 가장 먼 곳을 고른다. 월드 좌표라서 확대·이동해도 이름표가 같은 곳에 붙어 다닌다.
 */
export function placeRegionLabels(items: readonly { id: string; box: Box }[], points: readonly Pt[]): Map<string, Pt> {
  const placed = new Map<string, Pt>();
  const obstacles: Pt[] = [...points];
  for (const { id, box } of items) {
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    let best: Pt = { x: box.x0 + w / 2, y: box.y0 + h * 0.08 };
    let bestGap = -1;
    for (const fy of [0.08, 0.2, 0.8, 0.92]) {
      for (const fx of [0.25, 0.5, 0.75]) {
        const c = { x: box.x0 + w * fx, y: box.y0 + h * fy };
        let gap = Infinity;
        for (const o of obstacles) gap = Math.min(gap, labelGap(c, o));
        if (gap > bestGap) {
          bestGap = gap;
          best = c;
        }
      }
    }
    placed.set(id, best);
    obstacles.push(best);
  }
  return placed;
}

// ───── 고른 정거장의 이름표와 '내 위치' 글자 ─────

/** 고른 정거장의 이름표가 점에 대해 놓이는 자리 */
export type NameSide = 'below' | 'below-left' | 'below-right' | 'above' | 'above-left' | 'above-right' | 'left' | 'right';

export interface NameLayout {
  name: NameSide;
  /** true면 '내 위치' 글자를 표식 아래에 둔다(기본은 위) */
  meBelow: boolean;
}

/** 정거장 점의 반지름, 내 위치 표식의 반지름, 점에서 이름표 가장자리까지의 거리, 이름표 높이(보통 글자 28 px보다 조금 크게), '내 위치' 글자의 크기(화면 px) */
const DOT_R = 14;
const ME_R = 15;
const NAME_GAP = 24;
/** 이름표를 점 옆에 둘 때 점 가장자리와의 간격 */
const SIDE_GAP = 6;
const NAME_H = 30;
const ME_LABEL_W = 62;
const ME_LABEL_H = 26;

const overlaps = (a: Box, b: Box): boolean => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1;

/** 이름표가 가리지 말아야 할 것들(화면 px의 상자). 다른 정거장의 점이 지역 이름표보다 중요하다: 점은 누르는 대상이다 */
export interface LabelObstacles {
  /** 고르지 않은 다른 정거장의 점 */
  dots?: readonly Box[];
  /** 지역 이름표 */
  regions?: readonly Box[];
}

/**
 * 고른 정거장의 이름표와 '내 위치' 글자가 서로, 그리고 내 위치 표식과 정거장 점과 다른 정거장의 점, 지역 이름표를 가리지 않는
 * 자리를 고른다(화면 px). 이름표는 점 아래가 기본이고 겹치면 아래-왼쪽, 아래-오른쪽, 위, 왼쪽, 오른쪽, 위-왼쪽, 위-오른쪽 순으로
 * 옮긴다. '내 위치' 글자는 표식 위가 기본이고 정거장 점이나 이름표와 겹치면 표식 아래로 내린다. 모두 피하는 자리가 없으면
 * 지역 이름표를 피하는 것부터 포기하고(점 → 지역 이름표 순으로 중요하다), 그래도 없으면 기본 자리를 돌려준다.
 * nameWidth는 이름표의 폭을 넉넉하게 어림한 값이다(글자 크기 설정을 모른다).
 */
export function placeNameLabels(station: Pt, me: Pt, nameWidth: number, obstacles: LabelObstacles = {}): NameLayout {
  const w = Math.max(40, nameWidth);
  const at = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: station.x + x0, y0: station.y + y0, x1: station.x + x1, y1: station.y + y1 });
  const names: Array<[NameSide, Box]> = [
    ['below', at(-w / 2, NAME_GAP, w / 2, NAME_GAP + NAME_H)],
    ['below-left', at(-w + DOT_R, NAME_GAP, DOT_R, NAME_GAP + NAME_H)],
    ['below-right', at(-DOT_R, NAME_GAP, w - DOT_R, NAME_GAP + NAME_H)],
    ['above', at(-w / 2, -NAME_GAP - NAME_H, w / 2, -NAME_GAP)],
    ['left', at(-DOT_R - SIDE_GAP - w, -NAME_H / 2, -DOT_R - SIDE_GAP, NAME_H / 2)],
    ['right', at(DOT_R + SIDE_GAP, -NAME_H / 2, DOT_R + SIDE_GAP + w, NAME_H / 2)],
    ['above-left', at(-w + DOT_R, -NAME_GAP - NAME_H, DOT_R, -NAME_GAP)],
    ['above-right', at(-DOT_R, -NAME_GAP - NAME_H, w - DOT_R, -NAME_GAP)],
  ];
  const marker: Box = { x0: me.x - ME_R, y0: me.y - ME_R, x1: me.x + ME_R, y1: me.y + ME_R };
  const dot = at(-DOT_R, -DOT_R, DOT_R, DOT_R);
  const meLabel = (below: boolean): Box =>
    below
      ? { x0: me.x - ME_LABEL_W / 2, y0: me.y + ME_R, x1: me.x + ME_LABEL_W / 2, y1: me.y + ME_R + ME_LABEL_H }
      : { x0: me.x - ME_LABEL_W / 2, y0: me.y - ME_R - ME_LABEL_H, x1: me.x + ME_LABEL_W / 2, y1: me.y - ME_R };
  const dots = obstacles.dots ?? [];
  const regions = obstacles.regions ?? [];
  // 피할 것을 점점 줄여 가며 첫 자리를 찾는다
  for (const avoid of [[...dots, ...regions], dots, regions, []] as const) {
    for (const [name, box] of names) {
      if (overlaps(box, marker) || avoid.some((o) => overlaps(box, o))) continue;
      for (const meBelow of [false, true]) {
        const label = meLabel(meBelow);
        if (overlaps(label, dot) || overlaps(label, box) || avoid.some((o) => overlaps(label, o))) continue;
        return { name, meBelow };
      }
    }
  }
  return { name: 'below', meBelow: false };
}
