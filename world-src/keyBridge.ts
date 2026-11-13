// 건반 늪 건반 다리 셋(T6: K1 건반 다리, K2 음정 밧줄, K3 제자리표 다리)의 늪물과 널 그림(설계서 3.5, 4.8, 12.10의 7-3).
// 다리는 북쪽 기슭에 붙은 늪 웅덩이 위의 널다리다: 널(건반)이 기슭에서 남쪽 물 위로 뻗고, 걸어 들어가는 곳은 널 위뿐이다(물은 막혀 있다).
// 널 그림은 마을 H4의 돌처럼 바닥에 굽는다. 설치물 층(src/world/installations/keyBridgeLayer.ts)은 구워 둔 널 위에 이름·표식·이름표·밧줄·깃발만 올려 그린다(4-1).
// 널 자리는 설치물 파일(content/installations/inst.key-marsh.*.json)의 slots와 같아야 한다. 어긋나면 글자가 널 밖에 뜨므로
// tests/unit/key-marsh-site.test.ts가 이 목록과 설치물 파일을 맞대어 본다. 순수 계산이다.
import { planksOf, plankRect } from '../src/domain/keyBridge';
import type { Plank } from '../src/domain/keyBridge';
import { TILE } from '../src/domain/world';
import { COLOR } from './palette';
import { mulberry32 } from './outer';
import { circle, path, rect } from './shapes';
import type { RectShape, WalkRect } from './shapes';

/** 널 그림의 색: 흰 널은 마을 돌과 같은 밝은 나무, 검은 널은 같은 나무를 어둡게 한 것이다 */
export const PLANK_ART = { white: COLOR.stone, whiteEdge: COLOR.plankLine, whiteShade: '#E2D6B6', black: '#4A4137', blackEdge: '#2E2823', blackShine: '#6B5F52', shadow: '#243C3A' } as const;

export interface KeyBridgeSite {
  installationId: string;
  stationCode: string;
  /** 가장 낮은 흰 널(1번)의 왼쪽 위 모서리(월드 px) */
  x: number;
  y: number;
  /** 가장 낮은 널의 소리 높이(흰 건반)와 흰 널의 수. 설치물 파일의 slotMap과 같다 */
  lowMidi: number;
  whiteCount: number;
}

export const KEY_BRIDGE_SITES: readonly KeyBridgeSite[] = [
  { installationId: 'inst.key-marsh.key-bridge', stationCode: 'K1', x: 1760, y: 5300, lowMidi: 60, whiteCount: 15 },
  { installationId: 'inst.key-marsh.interval-rope', stationCode: 'K2', x: 912, y: 5700, lowMidi: 60, whiteCount: 8 },
  { installationId: 'inst.key-marsh.natural-bridge', stationCode: 'K3', x: 2912, y: 5800, lowMidi: 60, whiteCount: 8 },
];

/** 흰 널 줄의 가로세로와 늪이 널 둘레에 남기는 여유(월드 px). 여유는 칸(32 px) 경계로 바깥으로 맞춘다 */
const WHITE_H = 240;
const POOL_SIDE = 48;
const POOL_BOTTOM = 48;

/** 늪 웅덩이: 칸 경계에 맞춘 사각형이라 그림과 막힌 칸이 같다(3.8: 보이지 않는 벽을 쓰지 않는다). 윗변은 기슭이다 */
export interface Pool {
  x: number;
  y: number;
  w: number;
  h: number;
}

const floorTo = (v: number): number => Math.floor(v / TILE) * TILE;
const ceilTo = (v: number): number => Math.ceil(v / TILE) * TILE;

/** 널 줄의 바깥 사각형(흰 널들이 이어진 줄) */
export function plankRow(site: KeyBridgeSite): { x: number; y: number; w: number; h: number } {
  const planks = planksOf(site);
  const whites = planks.filter((p) => !p.black);
  const last = whites[whites.length - 1];
  const lastRect = last ? plankRect(last, site) : null;
  return { x: site.x, y: site.y, w: lastRect ? lastRect.x + lastRect.w - site.x : 0, h: WHITE_H };
}

/**
 * 웅덩이는 널 줄 둘레에 옆으로 48 px, 아래로 48 px 이상 여유를 두고, 윗변은 널의 첫 줄 칸(32 px) 경계에 맞춘다.
 * 널이 윗변 위로 조금 걸쳐 나오므로 널이 기슭에 걸터앉은 모습이 되고, 널 위의 칸은 기슭의 칸과 바로 이어진다.
 */
export function poolOf(site: KeyBridgeSite): Pool {
  const row = plankRow(site);
  const x0 = floorTo(row.x - POOL_SIDE);
  const x1 = ceilTo(row.x + row.w + POOL_SIDE);
  const y0 = ceilTo(row.y);
  const y1 = ceilTo(row.y + row.h + POOL_BOTTOM);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 막힌 칸: 늪 웅덩이. 널 위는 아래의 걸을 수 있는 칸이 다시 연다 */
export const keyBridgeColliders = (): RectShape[] =>
  KEY_BRIDGE_SITES.map((s): RectShape => {
    const p = poolOf(s);
    return { kind: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, note: `${s.stationCode} 늪` };
  });

/** 걸을 수 있는 곳: 흰 널 줄. 검은 널은 흰 널 위에 서므로 따로 열지 않는다 */
export const keyBridgeWalkable = (): WalkRect[] =>
  KEY_BRIDGE_SITES.map((s): WalkRect => {
    const r = plankRow(s);
    return { x: r.x, y: r.y, w: r.w, h: r.h, note: `${s.stationCode} 널다리` };
  });

/** 널 하나의 사각형(월드 px) */
export const plankRectOf = (site: KeyBridgeSite, p: Plank): { x: number; y: number; w: number; h: number } => {
  const r = plankRect(p, site);
  return { x: r.x, y: r.y, w: r.w, h: r.h };
};

/** 연잎: 웅덩이 둘레의 물 위에 놓는 작은 잎(고정 씨앗). 널 줄과 겹치지 않는 곳에만 놓는다 */
function lilyPads(site: KeyBridgeSite, pool: Pool): string[] {
  const rng = mulberry32(20261112 + site.x + site.y);
  const row = plankRow(site);
  const parts: string[] = [];
  const clear = (x: number, y: number, r: number): boolean => !(x + r > row.x - 12 && x - r < row.x + row.w + 12 && y + r > row.y - 12 && y - r < row.y + row.h + 12);
  let placed = 0;
  for (let tries = 0; placed < 6 && tries < 80; tries++) {
    const r = 16 + rng() * 10;
    const x = pool.x + 28 + rng() * (pool.w - 56);
    const y = pool.y + 28 + rng() * (pool.h - 56);
    if (!clear(x, y, r)) continue;
    // 연잎: 잎 한 장(원)과 갈라진 틈, 옅은 잎맥
    parts.push(circle(x, y, r, COLOR.canopy, { 'fill-opacity': 0.85 }), circle(x - r * 0.25, y - r * 0.25, r * 0.55, COLOR.canopyLight, { 'fill-opacity': 0.7 }), path(`M${x} ${y}L${x + r * 0.9} ${y - r * 0.35}`, { stroke: COLOR.water, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    placed++;
  }
  return parts;
}

/** 늪 웅덩이와 널 그림(월드 좌표). 박자 강의 물웅덩이와 같은 물빛이고, 널은 물 위에 그림자를 드리운다 */
export function keyBridgesSvg(): string {
  const parts: string[] = [];
  for (const site of KEY_BRIDGE_SITES) {
    const pool = poolOf(site);
    const { x, y, w, h } = pool;
    // 물가 띠 → 물 → 옅은 물(웅덩이마다 같다). 윗변은 기슭이라 물가 띠가 위로 번지지 않게 한다
    parts.push(rect(x - 14, y, w + 28, h + 14, COLOR.bank, { rx: 46 }), rect(x, y, w, h, COLOR.water, { rx: 34 }), rect(x + 16, y + 16, w - 32, h - 32, COLOR.waterLight, { rx: 26, 'fill-opacity': 0.55 }));
    // 물결: 널 아래의 물에 짧은 줄
    for (let k = 0; k < 4; k++) {
      const ry = y + h - 22 - (k % 2) * 14;
      const rx = x + 70 + k * Math.max(80, (w - 160) / 3.6);
      parts.push(path(`M${rx} ${ry}H${rx + 44}`, { stroke: COLOR.ripple, 'stroke-width': 5, 'stroke-linecap': 'round' }));
    }
    parts.push(...lilyPads(site, pool));

    const planks = planksOf(site);
    // 그림자 → 흰 널 → 검은 널(검은 널이 흰 널 경계 위에 걸쳐 있다)
    const row = plankRow(site);
    parts.push(rect(row.x + 8, row.y + 14, row.w, row.h, PLANK_ART.shadow, { 'fill-opacity': 0.16, rx: 8 }));
    for (const p of planks.filter((q) => !q.black)) {
      const r = plankRectOf(site, p);
      parts.push(
        rect(r.x, r.y, r.w, r.h, PLANK_ART.white, { rx: 8, stroke: PLANK_ART.whiteEdge, 'stroke-width': 3 }),
        // 아래쪽의 옅은 그늘과 위쪽의 결(널 끝의 못)
        rect(r.x + 3, r.y + r.h - 24, r.w - 6, 21, PLANK_ART.whiteShade, { rx: 6 }),
        circle(r.x + 14, r.y + 14, 3.5, PLANK_ART.whiteEdge, { 'fill-opacity': 0.6 }),
        circle(r.x + r.w - 14, r.y + 14, 3.5, PLANK_ART.whiteEdge, { 'fill-opacity': 0.6 }),
      );
    }
    for (const p of planks.filter((q) => q.black)) {
      const r = plankRectOf(site, p);
      parts.push(rect(r.x + 3, r.y + 5, r.w, r.h, PLANK_ART.shadow, { 'fill-opacity': 0.22, rx: 6 }), rect(r.x, r.y, r.w, r.h, PLANK_ART.black, { rx: 6, stroke: PLANK_ART.blackEdge, 'stroke-width': 3 }), rect(r.x + 8, r.y + 8, 6, r.h - 40, PLANK_ART.blackShine, { rx: 3, 'fill-opacity': 0.7 }));
    }
  }
  return parts.join('');
}
