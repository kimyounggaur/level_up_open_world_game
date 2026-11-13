// 상호작용(설계서 7.4). 사물에서 96 px 안에 들어오면 이름과 안내 칩이 뜨고, 여러 사물이 범위에 있으면 가장 가까운 것 하나만 보인다.
// 키는 E 또는 Enter, 터치는 사물이나 상호작용 버튼을 누른다. 상호작용할 수 있는 사물은 모두 이름이 있다.
import { INTERACT_RANGE } from '../domain/world';
import type { SpotKind, StationKind } from '../domain/world';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Interactable {
  /** 정거장 id. 정거장이 아닌 자리(발견 요소, 광장 게시판)는 그 자리의 id */
  id: string;
  name: string;
  /** 서는 자리이자 안내 칩의 기준점(월드 px) */
  x: number;
  y: number;
  /** 누르기로 고를 수 있는 영역(월드 px) */
  hit: Rect;
  kind: StationKind | SpotKind;
}

export interface Nearest {
  item: Interactable;
  distance: number;
}

/** 범위 안에서 가장 가까운 사물 하나. 거리가 같으면 id가 앞서는 것 */
export function nearestInteractable(p: { x: number; y: number }, items: readonly Interactable[], range: number = INTERACT_RANGE): Nearest | null {
  let best: Nearest | null = null;
  for (const item of items) {
    const distance = Math.hypot(item.x - p.x, item.y - p.y);
    if (distance > range) continue;
    if (!best || distance < best.distance - 1e-9 || (Math.abs(distance - best.distance) <= 1e-9 && item.id < best.item.id)) best = { item, distance };
  }
  return best;
}

/** 누른 곳(월드 px)에 있는 사물. 영역을 slop만큼 넓혀서 본다. 여럿이면 영역 가운데가 가장 가까운 것 */
export function pickInteractableAt(p: { x: number; y: number }, items: readonly Interactable[], slop = 24): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const r = item.hit;
    if (p.x < r.x - slop || p.x > r.x + r.w + slop || p.y < r.y - slop || p.y > r.y + r.h + slop) continue;
    const d = Math.hypot(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.y);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best !== null && item.id < best.id)) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

// 안내 칩의 글은 화면(ui)도 쓰므로 domain에 있다
export { chipText } from '../domain/world';

/** 중심점 하나에서 사각형 영역을 만든다 */
export const squareAround = (x: number, y: number, size: number): Rect => ({ x: x - size / 2, y: y - size / 2, w: size, h: size });
