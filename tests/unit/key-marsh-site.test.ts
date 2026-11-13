// 7-3 건반 늪 터: 건반 다리 셋(K1 건반 다리, K2 음정 밧줄, K3 제자리표 다리)의 널 줄과 늪 웅덩이, 반음 계단(K4)의 돌 두 줄, 정거장 넷의 표지판과 서는 자리.
// 설치물 층은 사물보다 아래에 그려지고(LAYER_DEPTH), 사물은 발 위치 순서로 그 위에 쌓이므로, 틀 안에 놓인 나무는 널과 돌을 덮는다.
// 나무 줄기는 막힌 자리라서 널 줄이나 돌 줄 위에 있으면 걸어가며 밟을 수 없다. 표지판은 정거장 곁에 서서 틀에 닿지 않는다.
// 널다리는 늪 웅덩이 위에 있다(물은 막혀 있다). 걸어 들어가는 곳은 널 위뿐이다(3.8: 그림과 막힌 칸이 같다).
// 건반 늪의 나무와 표지판은 코드가 아니라 world-src/regions/key-marsh.tmj에 놓여 있으므로, 이 시험은 지금 놓인 지도를 읽어 본다(계단밭·음계 길 터 시험과 같은 방식).
// 널과 돌 그림도 본다: 설치물 층은 구워 둔 그림 위에 글자와 표식만 올려 그리므로(4-1), 걷는 중에도 널과 돌이 보이려면 바닥에 그림이 구워져 있어야 하고
// 그 자리가 설치물 파일의 slots와 같아야 한다(world-src/keyBridge.ts, world-src/stones.ts).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_CODES, parseInstallation, slotBounds } from '../../src/domain/installation';
import type { InstallationDef, WorldRect } from '../../src/domain/installation';
import { BRIDGE_BAND_BOTTOM, BRIDGE_BAND_TOP, BRIDGE_FRAME_PAD, PLANK_WHITE_H, keyBridgeMapOf, planksOf } from '../../src/domain/keyBridge';
import { INTERACT_RANGE, regionBoundsPx } from '../../src/domain/world';
import { findPath } from '../../src/world/nav';
import type { WorldObjectData } from '../../src/world/objects';
import { loadWorldSource } from '../../tools/world-source';
import { loadRegionDefs } from '../../tools/world-files';
import { buildWorld } from '../../world-src/index';
import { KEY_BRIDGE_SITES, PLANK_ART, keyBridgeColliders, keyBridgeWalkable, keyBridgesSvg, plankRectOf, plankRow, poolOf } from '../../world-src/keyBridge';
import type { KeyBridgeSite } from '../../world-src/keyBridge';
import { SIGN_OFFSET } from '../../world-src/outer';
import { circle, rect } from '../../world-src/shapes';
import type { CircleShape } from '../../world-src/shapes';
import { TRAIL_STONE, TRAIL_STONE_ROWS, trailStoneDot, trailStoneRects, trailStonesSvg } from '../../world-src/stones';

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'content', 'installations');
const installations: InstallationDef[] = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('inst.key-marsh.') && f.endsWith('.json'))
  .map((f) => parseInstallation(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).installation!)
  .sort((a, b) => a.stationCode.localeCompare(b.stationCode));
const byCode = (code: string): InstallationDef => installations.find((i) => i.stationCode === code)!;
const bridges = installations.filter((i) => i.archetype === 'keyBridge');
const siteOf = (inst: InstallationDef): KeyBridgeSite => KEY_BRIDGE_SITES.find((s) => s.installationId === inst.installationId)!;

const regions = loadRegionDefs(root);
const region = regions.find((r) => r.regionId === 'key-marsh')!;
const build = buildWorld(regions, loadWorldSource(root));

/** 틀 둘레에 나무 줄기가 서 있지 않아야 하는 여유(월드 px). 계단밭·음계 길 터가 쓰는 카메라 여유와 같다 */
const CLEAR_PAD = 24;
/** 늪 웅덩이 둘레에 나무 덮개와 줄기가 오지 않는 여유(월드 px) */
const POOL_PAD = 48;
/** 웅덩이끼리 두는 빈틈(월드 px) */
const MIN_POOL_GAP = 64;
/** 서는 자리와 널 줄 윗변 사이(월드 px): 기슭의 땅이다 */
const BANK_DEPTH = 200;

/** 나무 그림의 덮개 원: 그림 파일 이름 'obj-…-tree-r90.svg'의 숫자가 덮개의 반지름이고, 그림 틀의 가운데가 원의 가운데다 */
function canopyOf(o: WorldObjectData): { x: number; y: number; r: number } | null {
  if (o.kind !== 'tree') return null;
  const m = /-r(\d+)\.svg$/.exec(o.file);
  if (!m) return null;
  return { x: o.x - o.ax * o.w + o.w / 2, y: o.y - o.ay * o.h + o.h / 2, r: Number(m[1]) };
}

/** 원이 사각형과 겹치는가(닿기만 해도 겹친 것으로 본다) */
const circleTouches = (c: { x: number; y: number; r: number }, r: WorldRect): boolean => {
  const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w));
  const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h));
  return Math.hypot(dx, dy) <= c.r;
};

/** 두 사각형이 겹치는가(맞닿기만 하면 겹친 것이 아니다) */
const rectsOverlap = (a: WorldRect, b: WorldRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const padded = (f: WorldRect, pad: number): WorldRect => ({ x: f.x - pad, y: f.y - pad, w: f.w + 2 * pad, h: f.h + 2 * pad });

/** 두 사각형 사이의 가장 짧은 거리(겹치면 0) */
const rectGap = (a: WorldRect, b: WorldRect): number => Math.hypot(Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0));

/** 점에서 사각형까지의 거리(안이면 0) */
const pointToRect = (p: { x: number; y: number }, r: WorldRect): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

/** 사각형 안을 16 px 간격으로 훑어 막힌 점을 모은다 */
const blockedSamples = (f: WorldRect): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = f.y + 4; y < f.y + f.h; y += 16) for (let x = f.x + 4; x < f.x + f.w; x += 16) if (build.grid.isBlockedPoint(x, y)) out.push({ x, y });
  return out;
};

/** 틀과 겹치는 나무들의 id */
const trespassers = (objects: readonly WorldObjectData[], frame: WorldRect): string[] =>
  objects.filter((o) => {
    const c = canopyOf(o);
    return c !== null && circleTouches(c, frame);
  }).map((o) => o.id);

const poolRect = (s: KeyBridgeSite): WorldRect => poolOf(s);
const rowRect = (s: KeyBridgeSite): WorldRect => plankRow(s);

/** 걸어서 닿는 길의 길이(꺾인 점을 따라 잰다)와 서게 되는 자리. 닿지 못하면 null.
 *  몸(반지름 BODY_RADIUS)이 막힌 칸에 걸치는 자리는 칸 가운데에 선다(널 줄 끝 널처럼 가장자리가 막힌 칸 옆인 때): 그 거리는 칸 안(32 px)이다. */
function walkLength(from: { x: number; y: number }, to: { x: number; y: number }): { length: number; adjusted: boolean; goal: { x: number; y: number }; goalGap: number } | null {
  const found = findPath(build.grid, from, to);
  if (!found) return null;
  let length = 0;
  let at = from;
  for (const w of found.waypoints) {
    length += Math.hypot(w.x - at.x, w.y - at.y);
    at = w;
  }
  return { length, adjusted: found.adjusted, goal: found.goal, goalGap: Math.hypot(found.goal.x - to.x, found.goal.y - to.y) };
}

/** 점이 사각형 안(가장자리 포함)에 있는가 */
const insideRect = (p: { x: number; y: number }, r: WorldRect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

describe('건반 늪의 정거장 넷', () => {
  it('건반 다리 셋(T6)과 반음 계단(T1)이다. 서는 자리는 정거장 점과 같고, 지도의 정거장과 설치물 파일이 맞는다', () => {
    expect(installations.map((i) => [i.stationCode, i.archetype, ARCHETYPE_CODES[i.archetype]])).toEqual([
      ['K1', 'keyBridge', 'T6'],
      ['K2', 'keyBridge', 'T6'],
      ['K3', 'keyBridge', 'T6'],
      ['K4', 'steppingPath', 'T1'],
    ]);
    expect(region.stations.map((s) => s.stationId)).toEqual(['K1', 'K2', 'K3', 'K4']);
    for (const inst of installations) {
      const st = region.stations.find((s) => s.stationId === inst.stationCode)!;
      expect(st.archetype, `${inst.stationCode} 정거장의 원형 기호`).toBe(ARCHETYPE_CODES[inst.archetype]);
      expect(inst.interactPoint, inst.installationId).toEqual({ x: st.x, y: st.y });
      expect(build.stands[inst.stationCode], inst.installationId).toEqual({ x: st.x, y: st.y });
      expect(Math.hypot(st.x - inst.interactPoint.x, st.y - inst.interactPoint.y), inst.installationId).toBeLessThanOrEqual(INTERACT_RANGE);
    }
    expect(installations.map((i) => i.interactPoint)).toEqual([
      { x: 2300, y: 5100 },
      { x: 1200, y: 5500 },
      { x: 3200, y: 5600 },
      { x: 800, y: 4700 },
    ]);
  });

  it('틀(slotBounds)은 지역 안에 있고, 서로 겹치지 않는다(카메라 여유를 더해도 다른 틀을 가리지 않는다)', () => {
    const bounds = regionBoundsPx(region);
    for (const inst of installations) {
      const f = slotBounds(inst);
      expect(f.x, inst.installationId).toBeGreaterThanOrEqual(bounds.x0);
      expect(f.y, inst.installationId).toBeGreaterThanOrEqual(bounds.y0);
      expect(f.x + f.w, inst.installationId).toBeLessThanOrEqual(bounds.x1);
      expect(f.y + f.h, inst.installationId).toBeLessThanOrEqual(bounds.y1);
    }
    for (let i = 0; i < installations.length; i++) {
      for (let j = i + 1; j < installations.length; j++) {
        const label = `${installations[i]!.stationCode}와 ${installations[j]!.stationCode}`;
        expect(rectsOverlap(padded(slotBounds(installations[i]!), BRIDGE_FRAME_PAD), padded(slotBounds(installations[j]!), BRIDGE_FRAME_PAD)), label).toBe(false);
      }
    }
  });
});

describe('건반 다리 셋: 널 줄', () => {
  it('널 자리는 설치물 파일의 slots와 같다: 널마다 위치와 크기가 맞고, 널의 수는 25장, 13장, 13장이다(널 번호는 낮은 소리부터)', () => {
    expect(bridges.map((i) => i.slots.length)).toEqual([25, 13, 13]);
    for (const inst of bridges) {
      const site = siteOf(inst);
      expect(site, inst.installationId).toBeDefined();
      const map = keyBridgeMapOf(inst)!;
      expect([map.lowMidi, map.whiteCount], inst.installationId).toEqual([site.lowMidi, site.whiteCount]);
      const planks = planksOf(site);
      expect(planks, inst.installationId).toHaveLength(inst.slots.length);
      for (const p of planks) {
        const s = inst.slots.find((x) => x.slot === p.slot)!;
        expect(plankRectOf(site, p), `${inst.stationCode} ${p.slot}번 널`).toEqual({ x: s.x, y: s.y, w: s.w, h: s.h });
      }
      // 가장 낮은 흰 널(1번)은 줄의 왼쪽 위 모서리에 놓인다
      expect(inst.slots[0], inst.installationId).toMatchObject({ slot: 1, x: site.x, y: site.y });
    }
  });

  it('틀은 널 줄 위에 이름표·밧줄·깃발이 놓일 띠(168 px)와 아래 여유(40 px)를 더한 것이다', () => {
    for (const inst of bridges) {
      const row = rowRect(siteOf(inst));
      expect(row.h, inst.installationId).toBe(PLANK_WHITE_H);
      expect(slotBounds(inst), inst.installationId).toEqual({ x: row.x, y: row.y - BRIDGE_BAND_TOP, w: row.w, h: BRIDGE_BAND_TOP + PLANK_WHITE_H + BRIDGE_BAND_BOTTOM });
    }
    expect(slotBounds(byCode('K1'))).toEqual({ x: 1760, y: 5132, w: 1080, h: 448 });
    expect(slotBounds(byCode('K2'))).toEqual({ x: 912, y: 5532, w: 576, h: 448 });
    expect(slotBounds(byCode('K3'))).toEqual({ x: 2912, y: 5632, w: 576, h: 448 });
  });

  it(`서는 자리는 널 줄 윗변에서 ${BANK_DEPTH} px 위의 기슭이다: 줄 위쪽 가운데 어디쯤에 있고, 카메라 틀(여유 포함)에 보인다`, () => {
    for (const inst of bridges) {
      const row = rowRect(siteOf(inst));
      const stand = inst.interactPoint;
      expect(row.y - stand.y, inst.installationId).toBe(BANK_DEPTH);
      expect(stand.x, inst.installationId).toBeGreaterThan(row.x);
      expect(stand.x, inst.installationId).toBeLessThan(row.x + row.w);
      // 모드에 들어가면 카메라가 틀을 담는다: 서 있는 사람(서는 자리)이 틀의 여유 안에 있어 화면에서 사라지지 않는다
      const f = slotBounds(inst);
      expect(stand.y, `${inst.stationCode} 서는 자리가 틀 위쪽 여유 안`).toBeGreaterThanOrEqual(f.y - BRIDGE_FRAME_PAD);
      expect(build.grid.isBlockedPoint(stand.x, stand.y), `${inst.stationCode} 서는 자리`).toBe(false);
    }
  });

  it('서는 자리에서 널 줄 윗변까지 곧게 걸어갈 수 있다(기슭에 막힌 자리가 없다)', () => {
    for (const inst of bridges) {
      const row = rowRect(siteOf(inst));
      const blocked: number[] = [];
      for (let y = inst.interactPoint.y; y <= row.y + 8; y += 8) if (build.grid.isBlockedPoint(inst.interactPoint.x, y)) blocked.push(y);
      expect(blocked, inst.installationId).toEqual([]);
    }
  });

  it('서는 자리에서 모든 널의 가운데까지 걸어갈 수 있다(검은 널도 흰 널 위에 있다, 우회는 직선의 1.35배 안)', () => {
    for (const inst of bridges) {
      for (const s of inst.slots) {
        const to = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
        const label = `${inst.stationCode} 서는 자리에서 ${s.slot}번 널`;
        expect(build.grid.isBlockedPoint(to.x, to.y), `${label} 가운데`).toBe(false);
        const walk = walkLength(inst.interactPoint, to);
        expect(walk, label).not.toBeNull();
        expect(walk!.adjusted, `${label}: 막혀서 다른 곳으로 바뀌지 않는다`).toBe(false);
        expect(insideRect(walk!.goal, s), `${label}: 걸어가 서는 자리(${walk!.goal.x}, ${walk!.goal.y})가 그 널 위다`).toBe(true);
        expect(walk!.goalGap, `${label}: 널 가운데에서 한 칸(32 px) 안`).toBeLessThan(32);
        expect(walk!.length, `${label}: 우회 길이`).toBeLessThanOrEqual(Math.hypot(to.x - inst.interactPoint.x, to.y - inst.interactPoint.y) * 1.35 + 1);
      }
    }
  });

  it('흰 널은 모두 걸을 수 있다. 널 줄 안에서 막힌 곳은 바깥 가장자리 한 칸(32 px) 띠뿐이다(칸 경계에 걸린 끝자락)', () => {
    for (const inst of bridges) {
      const row = rowRect(siteOf(inst));
      for (const p of planksOf(siteOf(inst)).filter((q) => !q.black)) {
        const r = plankRectOf(siteOf(inst), p);
        expect(build.grid.isBlockedPoint(r.x + r.w / 2, r.y + r.h / 2), `${inst.stationCode} ${p.slot}번 흰 널`).toBe(false);
      }
      for (const pt of blockedSamples(row)) {
        const inRim = pt.x < row.x + 32 || pt.x >= row.x + row.w - 32 || pt.y >= row.y + row.h - 32;
        expect(inRim, `${inst.stationCode} 널 줄 안쪽 (${pt.x}, ${pt.y})이 막혀 있어요`).toBe(true);
      }
    }
  });
});

describe('건반 다리 셋: 늪 웅덩이', () => {
  it('웅덩이는 칸(32 px) 경계에 맞춘 사각형이라 그림과 막힌 칸이 같다. 막힌 자리는 설치물 파일이 아니라 늪 웅덩이 목록과 같다', () => {
    const colliders = build.colliders.filter((c) => c.kind === 'rect' && /^K[123] 늪$/.test(c.note ?? ''));
    expect(colliders).toHaveLength(3);
    expect(colliders).toEqual(keyBridgeColliders());
    for (const site of KEY_BRIDGE_SITES) {
      const p = poolRect(site);
      for (const v of [p.x, p.y, p.w, p.h]) expect(v % 32, `${site.stationCode} 웅덩이 ${v}`).toBe(0);
      const c = colliders.find((x) => x.note === `${site.stationCode} 늪`)!;
      expect(c, site.stationCode).toMatchObject({ kind: 'rect', x: p.x, y: p.y, w: p.w, h: p.h });
    }
    expect(keyBridgeWalkable().map((w) => w.note)).toEqual(['K1 널다리', 'K2 널다리', 'K3 널다리']);
  });

  it('웅덩이는 널 줄 둘레에 옆으로 48 px, 아래로 48 px 이상 여유를 두고, 윗변은 널 윗변보다 한 칸 안에서 낮다(널이 기슭에 걸터앉는다)', () => {
    for (const site of KEY_BRIDGE_SITES) {
      const p = poolRect(site);
      const row = rowRect(site);
      expect(row.x - p.x, `${site.stationCode} 왼쪽 여유`).toBeGreaterThanOrEqual(48);
      expect(p.x + p.w - (row.x + row.w), `${site.stationCode} 오른쪽 여유`).toBeGreaterThanOrEqual(48);
      expect(p.y + p.h - (row.y + row.h), `${site.stationCode} 아래 여유`).toBeGreaterThanOrEqual(48);
      expect(p.y - row.y, `${site.stationCode} 윗변`).toBeGreaterThanOrEqual(0);
      expect(p.y - row.y, `${site.stationCode} 윗변`).toBeLessThan(32);
    }
  });

  it('웅덩이의 물은 막혀 있다: 널 줄 밖은 걸어 들어갈 수 없다', () => {
    for (const site of KEY_BRIDGE_SITES) {
      const p = poolRect(site);
      const row = rowRect(site);
      const water: Array<{ x: number; y: number }> = [];
      for (let y = p.y + 4; y < p.y + p.h; y += 16) {
        for (let x = p.x + 4; x < p.x + p.w; x += 16) {
          const onRow = x >= row.x && x < row.x + row.w && y >= row.y && y < row.y + row.h;
          if (!onRow) water.push({ x, y });
        }
      }
      expect(water.length, site.stationCode).toBeGreaterThan(100);
      expect(water.filter((w) => !build.grid.isBlockedPoint(w.x, w.y)), `${site.stationCode} 물 위에 걸을 수 있는 자리`).toEqual([]);
    }
  });

  it('웅덩이끼리 서로 떨어져 있고, 다른 틀을 가리지 않는다', () => {
    for (let i = 0; i < KEY_BRIDGE_SITES.length; i++) {
      for (let j = i + 1; j < KEY_BRIDGE_SITES.length; j++) {
        const a = KEY_BRIDGE_SITES[i]!;
        const b = KEY_BRIDGE_SITES[j]!;
        expect(rectGap(poolRect(a), poolRect(b)), `${a.stationCode}와 ${b.stationCode} 웅덩이 사이`).toBeGreaterThanOrEqual(MIN_POOL_GAP);
      }
    }
    for (const site of KEY_BRIDGE_SITES) {
      for (const inst of installations) {
        if (inst.installationId === site.installationId) continue;
        expect(rectGap(poolRect(site), slotBounds(inst)), `${site.stationCode} 웅덩이와 ${inst.stationCode} 틀 사이`).toBeGreaterThanOrEqual(BRIDGE_FRAME_PAD);
      }
    }
  });

  it('웅덩이는 지역 안에 있다. 어느 정거장의 서는 자리도 웅덩이에 들어 있지 않다', () => {
    const bounds = regionBoundsPx(region);
    for (const site of KEY_BRIDGE_SITES) {
      const p = poolRect(site);
      expect(p.x, site.stationCode).toBeGreaterThanOrEqual(bounds.x0);
      expect(p.y, site.stationCode).toBeGreaterThanOrEqual(bounds.y0);
      expect(p.x + p.w, site.stationCode).toBeLessThanOrEqual(bounds.x1);
      expect(p.y + p.h, site.stationCode).toBeLessThanOrEqual(bounds.y1);
      for (const inst of installations) expect(pointToRect(inst.interactPoint, p), `${inst.stationCode} 서는 자리와 ${site.stationCode} 웅덩이`).toBeGreaterThan(0);
    }
  });
});

describe('건반 다리 셋과 반음 계단: 나무와 줄기', () => {
  it('어떤 나무의 덮개도 틀과 웅덩이에 닿지 않는다', () => {
    for (const inst of installations) expect(trespassers(build.objects, slotBounds(inst)), `${inst.stationCode} 틀`).toEqual([]);
    for (const inst of installations) expect(trespassers(build.objects, padded(slotBounds(inst), BRIDGE_FRAME_PAD)), `${inst.stationCode} 틀(카메라 여유 포함)`).toEqual([]);
    for (const site of KEY_BRIDGE_SITES) expect(trespassers(build.objects, padded(poolRect(site), POOL_PAD)), `${site.stationCode} 웅덩이`).toEqual([]);
  });

  it(`틀 둘레 ${CLEAR_PAD} px 안과 웅덩이 둘레 ${POOL_PAD} px 안에는 나무 줄기가 서 있지 않다`, () => {
    const trunks = build.colliders.filter((c) => c.kind === 'circle' && !/표지판/.test(c.note ?? ''));
    for (const inst of installations) {
      const pad = padded(slotBounds(inst), CLEAR_PAD);
      expect(trunks.filter((c) => c.kind === 'circle' && circleTouches({ x: c.x, y: c.y, r: c.r }, pad)), `${inst.stationCode} 틀`).toEqual([]);
    }
    for (const site of KEY_BRIDGE_SITES) {
      const pad = padded(poolRect(site), POOL_PAD);
      expect(trunks.filter((c) => c.kind === 'circle' && circleTouches({ x: c.x, y: c.y, r: c.r }, pad)), `${site.stationCode} 웅덩이`).toEqual([]);
    }
  });

  it('검사가 헛돌지 않는다: 틀 한가운데에 나무를 하나 놓으면 걸리고, 닿기만 해도 걸린다', () => {
    const f = slotBounds(byCode('K1'));
    const tree: WorldObjectData = { id: 'stray', kind: 'tree', file: 'obj-key-marsh-tree-r72.svg', x: f.x + f.w / 2, y: f.y + f.h / 2, ax: 0.5, ay: 0.5, w: 152, h: 152, sortY: f.y + f.h / 2 + 36 };
    expect(trespassers([tree], f)).toEqual(['stray']);
    expect(trespassers([{ ...tree, x: f.x - 100, y: f.y + f.h / 2 }], f)).toEqual([]);
    expect(trespassers([{ ...tree, x: f.x - 72, y: f.y + f.h / 2 }], f)).toEqual(['stray']);
    // 웅덩이도 그렇다
    const pool = poolRect(KEY_BRIDGE_SITES[0]!);
    expect(trespassers([{ ...tree, x: pool.x + pool.w / 2, y: pool.y + pool.h / 2 }], pool)).toEqual(['stray']);
  });
});

describe('표지판: 정거장 곁에 서고 틀에 닿지 않는다', () => {
  const signs = build.objects.filter((o) => o.kind === 'sign' && /^K[1-4]$/.test(o.stationId ?? ''));
  const colliderOf = (code: string): CircleShape => build.colliders.find((c): c is CircleShape => c.kind === 'circle' && c.note === `${code} 표지판`)!;
  const artOf = (code: string): WorldRect => {
    const s = signs.find((x) => x.stationId === code)!;
    return { x: s.x - s.ax * s.w, y: s.y - s.ay * s.h, w: s.w, h: s.h };
  };

  it('정거장마다 표지판 하나와 막는 자리 하나가 있다', () => {
    expect(signs.map((s) => s.stationId).sort()).toEqual(['K1', 'K2', 'K3', 'K4']);
    expect(build.colliders.filter((c) => c.kind === 'circle' && /^K[1-4] 표지판$/.test(c.note ?? ''))).toHaveLength(4);
    for (const s of signs) expect(s.file, s.id).toBe('obj-key-marsh-signpost.svg');
  });

  it('건반 다리 셋(K1 K2 K3)의 표지판은 서는 자리 오른쪽 72 px, 위쪽 8 px에 선다', () => {
    for (const inst of bridges) {
      const c = colliderOf(inst.stationCode);
      expect(c.kind).toBe('circle');
      expect([c.x - inst.interactPoint.x, c.y - inst.interactPoint.y], inst.stationCode).toEqual([SIGN_OFFSET.x, SIGN_OFFSET.y]);
      const sign = signs.find((s) => s.stationId === inst.stationCode)!;
      expect([sign.x, sign.y], inst.stationCode).toEqual([c.x, c.y]);
    }
    expect(signs.filter((s) => s.stationId !== 'K4').map((s) => [s.stationId, s.x, s.y])).toEqual([
      ['K1', 2372, 5092],
      ['K2', 1272, 5492],
      ['K3', 3272, 5592],
    ]);
  });

  it('막는 자리는 틀에서 줄기 여유만큼 떨어지고, 표지판 그림은 틀과 웅덩이를 가리지 않는다', () => {
    for (const inst of installations) {
      const f = slotBounds(inst);
      const c = colliderOf(inst.stationCode);
      expect(pointToRect(c, f) - c.r, `${inst.stationCode} 막는 자리와 틀 사이`).toBeGreaterThanOrEqual(CLEAR_PAD);
      expect(rectsOverlap(artOf(inst.stationCode), f), `${inst.stationCode} 표지판 그림과 틀`).toBe(false);
    }
    for (const site of KEY_BRIDGE_SITES) for (const code of ['K1', 'K2', 'K3', 'K4']) expect(rectsOverlap(artOf(code), poolRect(site)), `${code} 표지판 그림과 ${site.stationCode} 웅덩이`).toBe(false);
  });

  it('누르는 영역(touch)은 표지판 그림 둘레이고, 서는 자리에서 너무 멀지 않다', () => {
    for (const inst of installations) {
      const sign = signs.find((s) => s.stationId === inst.stationCode)!;
      const hit = build.hits[inst.stationCode]!;
      expect(hit, inst.stationCode).toEqual({ x: sign.x - 48, y: sign.y - 104, w: 96, h: 112 });
      // 눌러서 고른 정거장까지 걸어가는 거리가 한 화면 안이다
      expect(Math.hypot(sign.x - inst.interactPoint.x, sign.y - inst.interactPoint.y), inst.stationCode).toBeLessThanOrEqual(INTERACT_RANGE + 8);
    }
  });

  it('반음 계단(K4)의 표지판은 서는 자리 북쪽에 선다: 서는 자리 오른쪽 72 px의 기본 자리는 첫 돌의 틀에 닿는다', () => {
    const k4 = byCode('K4');
    const frame = slotBounds(k4);
    const sign = signs.find((s) => s.stationId === 'K4')!;
    expect([sign.x - k4.interactPoint.x, sign.y - k4.interactPoint.y]).toEqual([0, -104]);
    // 기본 자리에 두었다면: 막는 자리는 틀에서 줄기 여유보다 가깝고, 표지판 그림은 틀을 가린다
    const def = { x: k4.interactPoint.x + SIGN_OFFSET.x, y: k4.interactPoint.y + SIGN_OFFSET.y, r: 14 };
    expect(pointToRect(def, frame) - def.r).toBeLessThan(CLEAR_PAD);
    const defArt = { x: def.x - sign.ax * sign.w, y: def.y - sign.ay * sign.h, w: sign.w, h: sign.h };
    expect(rectsOverlap(defArt, frame)).toBe(true);
    // 지금 자리는 서는 자리와 가까이 있으면서(104 px) 틀과 멀다
    expect(pointToRect(colliderOf('K4'), frame)).toBeGreaterThan(CLEAR_PAD + 14);
  });
});

/** 바닥 그림(SVG 글)에서 널 하나가 빠진 곳을 모은다. 위치와 크기는 설치물 파일에서 읽고, 모양(색과 모서리)은 그림 코드의 약속을 따른다 */
function missingPlanks(svg: string, slots: ReadonlyArray<{ slot: number; x: number; y: number; w: number; h: number }>, blacks: ReadonlySet<number>): string[] {
  const out: string[] = [];
  for (const s of slots) {
    if (blacks.has(s.slot)) {
      const shadow = rect(s.x + 3, s.y + 5, s.w, s.h, PLANK_ART.shadow, { 'fill-opacity': 0.22, rx: 6 });
      const body = rect(s.x, s.y, s.w, s.h, PLANK_ART.black, { rx: 6, stroke: PLANK_ART.blackEdge, 'stroke-width': 3 });
      const shine = rect(s.x + 8, s.y + 8, 6, s.h - 40, PLANK_ART.blackShine, { rx: 3, 'fill-opacity': 0.7 });
      if (!svg.includes(body)) out.push(`${s.slot}번 검은 널 모양`);
      if (!svg.includes(shadow)) out.push(`${s.slot}번 검은 널 그림자`);
      if (!svg.includes(shine)) out.push(`${s.slot}번 검은 널 윤`);
    } else {
      const body = rect(s.x, s.y, s.w, s.h, PLANK_ART.white, { rx: 8, stroke: PLANK_ART.whiteEdge, 'stroke-width': 3 });
      const shade = rect(s.x + 3, s.y + s.h - 24, s.w - 6, 21, PLANK_ART.whiteShade, { rx: 6 });
      const nail = circle(s.x + 14, s.y + 14, 3.5, PLANK_ART.whiteEdge, { 'fill-opacity': 0.6 });
      if (!svg.includes(body)) out.push(`${s.slot}번 흰 널 모양`);
      if (!svg.includes(shade)) out.push(`${s.slot}번 흰 널 그늘`);
      if (!svg.includes(nail)) out.push(`${s.slot}번 흰 널 못`);
    }
  }
  return out;
}

describe('널 그림: 바닥에 구워져서 걷는 중에도 보인다', () => {
  const blacksOf = (inst: InstallationDef): Set<number> => new Set(planksOf(siteOf(inst)).filter((p) => p.black).map((p) => p.slot));

  it('늪과 널 그림이 바닥 그림에 한 벌씩 들어 있다', () => {
    expect(build.svgBody.split(keyBridgesSvg()).length - 1).toBe(1);
  });

  it('널마다 모양이 있다(설치물 파일의 자리를 직접 읽어 맞대어 본다): 흰 널 모양과 그늘과 못, 검은 널 모양과 그림자와 윤', () => {
    for (const inst of bridges) expect(missingPlanks(build.svgBody, inst.slots, blacksOf(inst)), inst.installationId).toEqual([]);
    // 널은 모두 25 + 13 + 13 = 51장이다. 흰 널 15 + 8 + 8 = 31장, 검은 널 10 + 5 + 5 = 20장
    expect(bridges.reduce((n, i) => n + i.slots.length, 0)).toBe(51);
    expect(bridges.reduce((n, i) => n + blacksOf(i).size, 0)).toBe(20);
  });

  it('검은 널은 흰 널 경계 위에 걸쳐 있다: 검은 널 가운데가 두 흰 널 사이의 경계에 가깝다', () => {
    for (const inst of bridges) {
      const whites = inst.slots.filter((s) => !blacksOf(inst).has(s.slot));
      for (const b of inst.slots.filter((s) => blacksOf(inst).has(s.slot))) {
        const center = b.x + b.w / 2;
        const edges = whites.map((w) => w.x + w.w);
        const nearest = Math.min(...edges.map((e) => Math.abs(e - center)));
        expect(nearest, `${inst.stationCode} ${b.slot}번 검은 널`).toBeLessThanOrEqual(12);
        expect(b.y, `${inst.stationCode} ${b.slot}번`).toBe(siteOf(inst).y);
      }
    }
  });

  it('검사가 헛돌지 않는다: 널 하나를 1 px 옮기거나 그림에서 빼면 걸린다', () => {
    const inst = byCode('K2');
    const blacks = blacksOf(inst);
    expect(missingPlanks(build.svgBody, inst.slots, blacks)).toEqual([]);
    const moved = inst.slots.map((s) => (s.slot === 3 ? { ...s, x: s.x + 1 } : s));
    expect(missingPlanks(build.svgBody, moved, blacks)).toEqual(['3번 흰 널 모양', '3번 흰 널 그늘', '3번 흰 널 못']);
    const movedBlack = inst.slots.map((s) => (s.slot === 2 ? { ...s, y: s.y + 1 } : s));
    expect(missingPlanks(build.svgBody, movedBlack, blacks)).toEqual(['2번 검은 널 모양', '2번 검은 널 그림자', '2번 검은 널 윤']);
    expect(missingPlanks(build.svgBody.replace(keyBridgesSvg(), ''), inst.slots, blacks)).toHaveLength(inst.slots.length * 3);
  });
});

/** 바닥 그림(SVG 글)에서 돌 하나가 빠진 곳을 모은다: 돌 모양(가로·세로·모서리)과 속 점(위치와 색)이 모두 있어야 한다 */
function missingStones(svg: string, slots: ReadonlyArray<{ slot: number; x: number; y: number; w: number; h: number }>, dots: readonly string[]): string[] {
  const out: string[] = [];
  slots.forEach((s, i) => {
    const body = `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#EFE6CB" rx="12" stroke="#BDCAA9" stroke-width="3"/>`;
    const dot = `<circle cx="${s.x + s.w / 2}" cy="${s.y + 81}" r="15" fill="${dots[i]}"/>`;
    if (!svg.includes(body)) out.push(`${s.slot}번 돌 모양`);
    if (!svg.includes(dot)) out.push(`${s.slot}번 돌 점`);
  });
  return out;
}

describe('반음 계단(K4): 돌 열세 개를 일곱과 여섯 두 줄로 꺾는다', () => {
  const k4 = byCode('K4');
  const rows = TRAIL_STONE_ROWS.filter((r) => r.stationCode === 'K4');

  it('돌 줄은 둘이다: 위 줄은 오른쪽으로 일곱 칸, 아래 줄은 일곱째 칸 바로 밑에서 왼쪽으로 여섯 칸 돌아온다', () => {
    expect(rows.map((r) => [r.count, r.slotStart ?? 1, r.dir ?? 1, r.total])).toEqual([
      [7, 1, 1, 13],
      [6, 8, -1, 13],
    ]);
    expect(rows.every((r) => r.installationId === k4.installationId)).toBe(true);
    const upper = trailStoneRects(rows[0]!);
    const lower = trailStoneRects(rows[1]!);
    expect(upper.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lower.map((s) => s.slot)).toEqual([8, 9, 10, 11, 12, 13]);
    // 아래 줄의 첫 돌(8번)은 위 줄의 끝 돌(7번) 바로 밑이다
    expect(lower[0]!.x).toBe(upper[6]!.x);
    expect(lower[0]!.y - (upper[6]!.y + TRAIL_STONE.h)).toBe(30);
    // 아래 줄은 오른쪽에서 왼쪽으로 한 간격씩 돌아온다
    lower.forEach((s, i) => expect(s.x, `${s.slot}번`).toBe(lower[0]!.x - TRAIL_STONE.pitch * i));
  });

  it('돌 자리는 설치물 파일의 slots와 같다(돌 크기 81×153, 간격 99 px). 틀은 두 줄을 모두 담는다', () => {
    expect(k4.slots).toHaveLength(13);
    const all = rows.flatMap((r) => trailStoneRects(r));
    expect(all).toEqual(k4.slots.map((s) => ({ slot: s.slot, x: s.x, y: s.y, w: s.w, h: s.h })));
    expect(slotBounds(k4)).toEqual({ x: 900, y: 4560, w: 675, h: 336 });
    expect(k4.slots.every((s) => s.w === TRAIL_STONE.w && s.h === TRAIL_STONE.h)).toBe(true);
  });

  it('이어지는 돌은 가까이 있다: 같은 줄에서는 99 px, 줄을 꺾는 7번에서 8번은 한 줄 높이에 두 줄 사이(183 px)다. 돌 번호 순서로 걸어도 끊기지 않는다', () => {
    const centers = k4.slots.map((s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 }));
    const gaps = centers.slice(1).map((c, i) => Math.round(Math.hypot(c.x - centers[i]!.x, c.y - centers[i]!.y)));
    expect(gaps).toEqual([99, 99, 99, 99, 99, 99, 183, 99, 99, 99, 99, 99]);
  });

  it('돌 틀 안에는 나무 덮개와 막힌 자리가 없다(걸으며 돌을 밟는다). 돌 가운데와 네 모서리 안쪽도 걸을 수 있다', () => {
    expect(trespassers(build.objects, slotBounds(k4))).toEqual([]);
    expect(blockedSamples(slotBounds(k4))).toEqual([]);
    for (const s of k4.slots) {
      for (const [dx, dy] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]] as const) {
        const x = s.x + s.w * dx;
        const y = s.y + s.h * dy;
        expect(build.grid.isBlockedPoint(x, y), `${s.slot}번 돌 (${x}, ${y})`).toBe(false);
      }
    }
  });

  it('서는 자리는 첫 돌 왼쪽 100 px이고 걸을 수 있다. 거기서 모든 돌의 가운데까지 걸어갈 수 있다', () => {
    expect(k4.slots[0]!.x - k4.interactPoint.x).toBe(100);
    expect(build.grid.isBlockedPoint(k4.interactPoint.x, k4.interactPoint.y)).toBe(false);
    for (const s of k4.slots) {
      const to = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      const walk = walkLength(k4.interactPoint, to);
      expect(walk, `${s.slot}번 돌`).not.toBeNull();
      expect(walk!.adjusted, `${s.slot}번 돌`).toBe(false);
      expect(insideRect(walk!.goal, s), `${s.slot}번 돌: 걸어가 서는 자리가 그 돌 위다`).toBe(true);
      expect(walk!.goalGap, `${s.slot}번 돌`).toBeLessThan(32);
    }
  });

  it('바닥 그림에 돌마다 돌 모양과 속 점이 있다: 속 점의 색은 열세 개에 걸쳐 풀빛에서 볕빛으로 이어진다(두 줄이 이어진 한 길이다)', () => {
    const dots = k4.slots.map((s) => trailStoneDot(s.slot - 1, 13));
    expect(missingStones(build.svgBody, k4.slots, dots)).toEqual([]);
    expect(dots[0]).not.toBe(dots[12]);
    expect(build.svgBody.split(trailStonesSvg()).length - 1).toBe(1);
    // 둘째 줄이 첫 점 색으로 돌아가지 않는다(줄마다 처음부터 다시 칠한 것이 아니다)
    expect(trailStoneDot(7, 13)).not.toBe(trailStoneDot(0, 13));
  });

  it('검사가 헛돌지 않는다: 돌 하나를 1 px 옮기거나 점 색을 바꾸면 걸린다', () => {
    const dots = k4.slots.map((s) => trailStoneDot(s.slot - 1, 13));
    const moved = k4.slots.map((s) => (s.slot === 9 ? { ...s, y: s.y + 1 } : s));
    expect(missingStones(build.svgBody, moved, dots)).toEqual(['9번 돌 모양', '9번 돌 점']);
    const recolored = dots.map((d, i) => (i === 10 ? '#000000' : d));
    expect(missingStones(build.svgBody, k4.slots, recolored)).toEqual(['11번 돌 점']);
  });
});
