// 지도(Tiled)에 놓인 사물을 월드의 사물, 막힌 자리, 바닥 그림자, 누르기 영역으로 바꾼다(설계서 6-3).
// 사물을 더할 때 이 파일을 고치지 않는다: 지도에 점을 하나 찍고(class와 속성), 그림이 새것이면 world-src/sprites/에 SVG를 넣는다.
import type { Rect } from '../src/world/interact';
import type { WorldObjectData } from '../src/world/objects';
import { COLOR } from './palette';
import { circle } from './shapes';
import type { Collider } from './shapes';
import { propReader } from './tiled';
import type { TiledMap, TiledObject } from './tiled';
import { SHADOW_DX, SHADOW_DY } from './trees';

/** 그림 속성: 그림 사물(tree, sign, prop)이 가질 수 있는 속성 */
export const SPRITE_PROPS = ['sprite', 'w', 'h', 'ax', 'ay', 'footDy', 'blockR', 'shadowR', 'station', 'hitDx', 'hitDy', 'hitW', 'hitH'] as const;
/** 사각형 사물(hit, block)이 가질 수 있는 속성 */
export const AREA_PROPS = ['station'] as const;

export interface SpriteSize {
  width: number;
  height: number;
}

/** SVG 글에서 그림 크기(월드 px)를 읽는다. 최상위 <svg>의 width와 height 속성이다 */
export function svgSize(svg: string): SpriteSize | null {
  const head = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!head) return null;
  const w = /\swidth="([0-9.]+)"/.exec(head)?.[1];
  const h = /\sheight="([0-9.]+)"/.exec(head)?.[1];
  if (!w || !h) return null;
  const width = Number(w);
  const height = Number(h);
  return width > 0 && height > 0 ? { width, height } : null;
}

export interface Shadow {
  /** 사물을 놓은 점 */
  x: number;
  y: number;
  r: number;
}

export interface Placed {
  objects: WorldObjectData[];
  colliders: Collider[];
  shadows: Shadow[];
  /** 정거장 id → 누르기 영역 */
  hits: Record<string, Rect>;
  issues: string[];
}

/** 바닥에 굽는 그림자: 오른쪽 아래로 (15, 24)만큼 어긋난 원(9.1) */
export const shadowsSvg = (shadows: readonly Shadow[]): string => shadows.map((s) => circle(s.x + SHADOW_DX, s.y + SHADOW_DY, s.r, COLOR.treeShadow)).join('');

const spriteName = (raw: string): string => raw.replace(/\.svg$/, '');

/** 지도 파일들(차례대로)에 놓인 사물을 모두 바꾼다. 같은 입력이면 같은 결과가 나온다 */
export function placeAll(maps: readonly TiledMap[], sprites: Readonly<Record<string, string>>): Placed {
  const out: Placed = { objects: [], colliders: [], shadows: [], hits: {}, issues: [] };
  const sizes = new Map<string, SpriteSize>();
  for (const [file, svg] of Object.entries(sprites)) {
    const size = svgSize(svg);
    if (size) sizes.set(file, size);
    else out.issues.push(`world-src/sprites/${file}: <svg>에 width와 height가 없어요`);
  }
  const ids = new Set<string>();
  const hitOwner = new Map<string, string>();

  for (const map of maps) {
    for (const o of map.objects) {
      if (ids.has(o.name)) {
        out.issues.push(`${o.file}: 사물 이름 ${o.name}이 다른 사물과 겹쳐요(이름이 id예요)`);
        continue;
      }
      ids.add(o.name);
      if (o.kind === 'hit') placeHit(o, out, hitOwner);
      else if (o.kind === 'block') placeBlock(o, out);
      else placeSprite(o, sizes, out, hitOwner);
    }
  }
  // 사물은 발 위치의 y 순서로 정렬한다(값이 같으면 id 순서). 큰 쪽이 앞에 그려진다
  out.objects.sort((a, b) => a.sortY - b.sortY || (a.id < b.id ? -1 : 1));
  return out;
}

function placeSprite(o: TiledObject, sizes: ReadonlyMap<string, SpriteSize>, out: Placed, hitOwner: Map<string, string>): void {
  const bad = (msg: string): void => {
    out.issues.push(`${o.file}: ${o.name}: ${msg}`);
  };
  if (!o.point) {
    bad(`${o.kind}은 점 사물이어야 해요(Tiled에서 "삽입 > 점"으로 찍어요)`);
    return;
  }
  const p = propReader(o, out.issues);
  for (const k of p.unknown(SPRITE_PROPS)) bad(`알 수 없는 속성 ${k}이 있어요(${SPRITE_PROPS.join(', ')} 중에서 써요)`);
  const spriteRaw = p.str('sprite');
  if (!spriteRaw) {
    bad('sprite 속성(그림 이름)이 없어요');
    return;
  }
  const file = `${spriteName(spriteRaw)}.svg`;
  const size = sizes.get(file);
  if (!size) {
    bad(`그림 ${file}이 world-src/sprites/에 없어요`);
    return;
  }
  const w = p.num('w') ?? size.width;
  const h = p.num('h') ?? size.height;
  const ax = p.num('ax') ?? 0.5;
  const ay = p.num('ay') ?? 1;
  const footDy = p.num('footDy') ?? 0;
  const blockR = p.num('blockR') ?? 0;
  const shadowR = p.num('shadowR') ?? 0;
  const station = p.str('station');
  if (!(w > 0 && h > 0)) bad('w와 h는 0보다 커야 해요');
  if (ax < 0 || ax > 1 || ay < 0 || ay > 1) bad('ax와 ay는 0과 1 사이여야 해요(그림 안의 기준점 비율)');
  if (blockR < 0 || shadowR < 0) bad('blockR과 shadowR은 0 이상이어야 해요');
  if (o.kind === 'sign' && !station) bad('표지판(sign)에는 station 속성(가리키는 정거장 id)이 있어야 해요');

  const sortY = o.y + footDy;
  const obj: WorldObjectData = { id: o.name, kind: o.kind as WorldObjectData['kind'], file, x: o.x, y: o.y, ax, ay, w, h, sortY };
  if (station) obj.stationId = station;
  out.objects.push(obj);

  if (blockR > 0) out.colliders.push({ kind: 'circle', x: o.x, y: sortY, r: blockR, note: o.kind === 'tree' ? `${o.name} 줄기` : o.kind === 'sign' && station ? `${station} 표지판` : `${o.name} 막힘` });
  if (shadowR > 0) out.shadows.push({ x: o.x, y: o.y, r: shadowR });

  const hit = [p.num('hitDx'), p.num('hitDy'), p.num('hitW'), p.num('hitH')];
  const given = hit.filter((v) => v !== undefined).length;
  if (given > 0 && given < 4) bad('누르기 영역은 hitDx, hitDy, hitW, hitH를 모두 적어야 해요');
  else if (given === 4) {
    if (!station) bad('누르기 영역(hitDx…)에는 station 속성이 있어야 해요');
    else addHit(out, hitOwner, station, { x: o.x + hit[0]!, y: o.y + hit[1]!, w: hit[2]!, h: hit[3]! }, o);
  }
}

function placeHit(o: TiledObject, out: Placed, hitOwner: Map<string, string>): void {
  const bad = (msg: string): void => {
    out.issues.push(`${o.file}: ${o.name}: ${msg}`);
  };
  if (o.point || !(o.width > 0 && o.height > 0)) {
    bad('hit은 크기가 있는 사각형이어야 해요(Tiled에서 "삽입 > 사각형")');
    return;
  }
  const p = propReader(o, out.issues);
  for (const k of p.unknown(AREA_PROPS)) bad(`알 수 없는 속성 ${k}이 있어요(station만 써요)`);
  const station = p.str('station');
  if (!station) {
    bad('station 속성(정거장 id)이 없어요');
    return;
  }
  addHit(out, hitOwner, station, { x: o.x, y: o.y, w: o.width, h: o.height }, o);
}

function addHit(out: Placed, hitOwner: Map<string, string>, station: string, rect: Rect, o: TiledObject): void {
  const prev = hitOwner.get(station);
  if (prev) {
    out.issues.push(`${o.file}: ${o.name}: 정거장 ${station}의 누르기 영역이 ${prev}에도 있어요(하나만 둬요)`);
    return;
  }
  hitOwner.set(station, o.name);
  out.hits[station] = rect;
}

function placeBlock(o: TiledObject, out: Placed): void {
  const bad = (msg: string): void => {
    out.issues.push(`${o.file}: ${o.name}: ${msg}`);
  };
  if (o.point || !(o.width > 0 && o.height > 0)) {
    bad('block은 크기가 있는 사각형이나 원이어야 해요');
    return;
  }
  const p = propReader(o, out.issues);
  for (const k of p.unknown([])) bad(`알 수 없는 속성 ${k}이 있어요(block에는 속성을 쓰지 않아요)`);
  if (o.ellipse) {
    if (o.width !== o.height) {
      bad('막힌 타원은 가로와 세로가 같은 원이어야 해요');
      return;
    }
    out.colliders.push({ kind: 'circle', x: o.x + o.width / 2, y: o.y + o.height / 2, r: o.width / 2, note: `${o.name} 막힘` });
    return;
  }
  out.colliders.push({ kind: 'rect', x: o.x, y: o.y, w: o.width, h: o.height, note: `${o.name} 막힘` });
}
