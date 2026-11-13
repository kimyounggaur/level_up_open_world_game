// 나무: 바닥에는 그림자만 굽고, 캐노피(잎)는 사물 그림으로 따로 올린다. 캐릭터가 줄기 뒤로 지나가면 캐노피에 가려진다(설계서 3-5).
import type { RegionId } from '../src/domain/world';
import { COLOR, treeStyle } from './palette';
import type { TreeStyle } from './palette';
import { circle, num, path } from './shapes';
import type { CircleShape } from './shapes';

export interface TreeSpec {
  id: string;
  regionId: RegionId;
  /** 캐노피 가운데(월드 px) */
  cx: number;
  cy: number;
  /** 캐노피 반지름(월드 px). 지름은 설계서 9.3의 96–192 */
  r: number;
}

/** 줄기는 캐노피 가운데보다 반지름의 절반만큼 아래에 서고, 반지름의 0.28배 원으로 막는다 */
export const TRUNK_DROP = 0.5;
export const TRUNK_RADIUS = 0.28;
/** 그림자는 오른쪽 아래로 (5, 8)×3만큼 어긋난다(9.1) */
export const SHADOW_DX = 15;
export const SHADOW_DY = 24;

export const treeFoot = (t: TreeSpec): { x: number; y: number } => ({ x: t.cx, y: t.cy + t.r * TRUNK_DROP });

export const treeCollider = (t: TreeSpec): CircleShape => {
  const f = treeFoot(t);
  return { kind: 'circle', x: f.x, y: f.y, r: Math.round(t.r * TRUNK_RADIUS * 100) / 100, note: `${t.id} 줄기` };
};

export const treeShadowSvg = (t: TreeSpec): string => circle(t.cx + SHADOW_DX, t.cy + SHADOW_DY, t.r, COLOR.treeShadow);

export const treeSpriteFile = (t: Pick<TreeSpec, 'regionId' | 'r'>): string => `obj-${t.regionId}-tree-r${t.r}.svg`;

/** 그림 한 장의 한 변(월드 px). 캐노피가 가운데에 온다 */
export const treeSpriteSize = (r: number): number => Math.ceil(r * 2 + 8);

/** 캐노피 조각. 하이라이트와 잎맥은 시안(r 22–32)의 거리 그대로 3배다 */
function canopyParts(cx: number, cy: number, r: number, style: TreeStyle): string {
  const hl = circle(cx - 18, cy - 21, r * 0.65, style.light);
  const vein = path(`M${num(cx - 18)} ${num(cy + 6)}l18 21 27-45`, { fill: 'none', stroke: style.vein, 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  return `${circle(cx, cy, r, style.canopy)}${hl}${vein}`;
}

/** 사물 그림(SVG 낱장) */
export function treeSpriteSvg(regionId: RegionId, r: number): string {
  const size = treeSpriteSize(r);
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${canopyParts(c, c, r, treeStyle(regionId))}</svg>\n`;
}

/** 시안과 나란히 놓아 볼 때만 쓰는, 바닥 위에 직접 얹는 캐노피 */
export const treeCanopyInlineSvg = (t: TreeSpec): string => canopyParts(t.cx, t.cy, t.r, treeStyle(t.regionId));
