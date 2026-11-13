// 6-9 발견 요소, 놀이 악기의 돌, 광장 둘레의 등이 나무 덮개(캐노피)에 가려지지 않는다.
// 나무 그림의 잎은 사물 층에서 발 위치(sortY) 순서로 쌓이고, 발견 표식과 등도 발 위치 순서로 쌓인다. 놀이 악기의 돌은 바닥 바로 위(PlayLayer, 깊이 −92000)에
// 그려져서 사물보다 늘 아래이므로 어떤 나무의 잎에든 덮인다. 6-9c의 사진 점검에서 물방울 북의 돌 하나(E4)가 나무 잎에 반쯤 가려져 음 이름이 안 보이는 것을 찾았고
// (자동 시험은 돌이 걸어서 닿는지만 보았다), 이 시험이 같은 일을 잡는다.
// 숲의 나무는 코드가 아니라 world-src/regions/*.tmj에 놓여 있으므로, 이 시험은 지금 놓인 지도를 읽어 본다(bell-site.test.ts와 같은 방법).
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDiscoveries, loadPlayInstruments } from '@/app/discovery-data';
import { plazaLampSite } from '@/domain/discovery';
import { PAD_RADIUS, padSitesOf } from '@/domain/play';
import type { WorldObjectData } from '@/world/objects';
import { loadWorldSource } from '../../tools/world-source';
import { loadRegionDefs } from '../../tools/world-files';
import { buildWorld } from '../../world-src/index';

const root = path.resolve(__dirname, '../..');
const build = buildWorld(loadRegionDefs(root), loadWorldSource(root));

interface Circle {
  x: number;
  y: number;
  r: number;
}
interface Canopy extends Circle {
  id: string;
  /** 나무의 발 위치(겹침 순서). 이보다 발치가 위에 있는 표식은 잎에 덮인다 */
  sortY: number;
}

/** 나무 그림의 덮개 원: 그림 파일 이름 'obj-…-tree-r90.svg'의 숫자가 덮개의 반지름이고, 그림 틀의 가운데가 원의 가운데다 */
function canopyOf(o: WorldObjectData): Canopy | null {
  if (o.kind !== 'tree') return null;
  const m = /-r(\d+)\.svg$/.exec(o.file);
  if (!m) return null;
  return { id: o.id, x: o.x - o.ax * o.w + o.w / 2, y: o.y - o.ay * o.h + o.h / 2, r: Number(m[1]), sortY: o.sortY };
}

/**
 * 발치 (x, y)에 선 표식(소리 조각, 쪽지, 등)이 그려지는 몸체: 발치에서 위로 72 px, 아래로 6 px, 좌우 30 px.
 * 찾은 뒤에 번지는 불빛과 빛살까지 덮는 넉넉한 값이다(spots/layer.ts의 drawPiece, drawNote, lanterns/layer.ts의 draw).
 */
const BODY = { halfW: 30, up: 72, down: 6 } as const;

/** 원과 사각형이 겹치는가(닿기만 해도 겹친 것) */
function circleTouchesRect(c: Circle, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.max(x0 - c.x, 0, c.x - x1);
  const dy = Math.max(y0 - c.y, 0, c.y - y1);
  return Math.hypot(dx, dy) <= c.r;
}

/** 이 표식 몸체를 덮는 나무들의 id: 잎이 몸체와 겹치고, 나무가 표식보다 나중에(발 위치가 더 아래) 그려지는 것 */
function coveredBy(canopies: readonly Canopy[], x: number, y: number): string[] {
  return canopies.filter((c) => c.sortY > y && circleTouchesRect(c, x - BODY.halfW, y - BODY.up, x + BODY.halfW, y + BODY.down)).map((c) => c.id);
}

/** 이 돌(원)과 겹치는 나무 잎의 id: 돌은 어떤 나무보다 아래에 그려지므로 발 위치와 상관없이 덮인다 */
function padCoveredBy(canopies: readonly Canopy[], x: number, y: number): string[] {
  return canopies.filter((c) => Math.hypot(c.x - x, c.y - y) < c.r + PAD_RADIUS).map((c) => c.id);
}

const CANOPIES = build.objects.map(canopyOf).filter((c): c is Canopy => c !== null);

describe('발견 요소와 놀이 악기의 돌, 광장의 등은 나무 잎에 가려지지 않는다(3.6, 3.5)', () => {
  it('지금 놓인 지도에서 나무 덮개를 읽는다(100그루가 넘는다)', () => {
    expect(CANOPIES.length).toBeGreaterThan(100);
    for (const c of CANOPIES) expect(c.r).toBeGreaterThan(0);
  });

  it('소리 조각과 쪽지 54개는 어떤 나무 잎에도 덮이지 않는다', () => {
    const marks = loadDiscoveries('preview');
    expect(marks).toHaveLength(54);
    for (const d of marks) expect(coveredBy(CANOPIES, d.x, d.y), `${d.discoveryId} (${d.x}, ${d.y})`).toEqual([]);
  });

  it('놀이 악기의 돌 스물네 개(물방울 북 4, 나머지 네 악기 5씩)는 어떤 나무 잎에도 덮이지 않는다', () => {
    const plays = loadPlayInstruments('preview');
    const pads = plays.flatMap((p) => padSitesOf(p).map((s) => ({ id: `${p.playId}의 ${s.pad}번 돌`, x: s.x, y: s.y })));
    expect(pads).toHaveLength(24);
    for (const p of pads) expect(padCoveredBy(CANOPIES, p.x, p.y), `${p.id} (${p.x}, ${p.y})`).toEqual([]);
  });

  it('광장 둘레의 등은 7-4 전의 18개에서도 지금의 36개에서도 나무 잎에 덮이지 않는다', () => {
    for (const count of [18, 36]) {
      for (let i = 0; i < count; i++) {
        const p = plazaLampSite(i, count);
        expect(coveredBy(CANOPIES, p.x, p.y), `등 ${count}개 중 ${i + 1}번 (${p.x}, ${p.y})`).toEqual([]);
      }
    }
  });

  it('검사가 헛돌지 않는다: 표식 위에 나무를 놓으면 걸리고, 멀리 두거나 표식이 나무보다 앞(발 위치가 더 아래)이면 걸리지 않는다', () => {
    const tree: Canopy = { id: 'stray', x: 1000, y: 1000, r: 90, sortY: 1045 };
    // 표식의 발치가 나무 가운데 위쪽(잎 안): 나무의 발이 더 아래라 잎이 표식을 덮는다
    expect(coveredBy([tree], 1000, 1000)).toEqual(['stray']);
    // 표식이 나무의 발보다 아래에 서면 표식이 나무 앞에 그려져 가려지지 않는다
    expect(coveredBy([tree], 1000, 1080)).toEqual([]);
    // 잎에서 멀리 떨어진 표식
    expect(coveredBy([tree], 1400, 1000)).toEqual([]);
    // 몸체의 위쪽 끝만 잎에 닿아도 덮인 것이다(발치 y 1160, 몸체 위 끝 1088, 잎의 아래 끝 1090)
    expect(coveredBy([{ ...tree, sortY: 1300 }], 1000, 1160)).toEqual(['stray']);
    // 돌은 나무 발 위치와 상관없이 잎과 겹치기만 해도 덮인다
    expect(padCoveredBy([tree], 1000, 1000 + 90 + PAD_RADIUS - 1)).toEqual(['stray']);
    expect(padCoveredBy([tree], 1000, 1000 + 90 + PAD_RADIUS)).toEqual([]);
    expect(padCoveredBy([{ ...tree, sortY: 0 }], 1000, 1100)).toEqual(['stray']);
  });
});
