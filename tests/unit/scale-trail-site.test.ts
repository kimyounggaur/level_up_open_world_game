// 7-2c 음계 길 터: 디딤돌 길 셋(S1 장음계 길, S2 단음계 길, S3 다섯 음 길)의 돌 틀(slotBounds) 안에는 나무 덮개(캐노피)와 막힌 자리가 없다.
// 설치물 층은 사물보다 아래에 그려지고(LAYER_DEPTH), 사물은 발 위치 순서로 그 위에 쌓이므로, 틀 안에 놓인 나무는 돌을 덮는다.
// 또 나무 줄기는 막힌 자리라서 돌 줄 위에 있으면 걸어가며 돌을 밟을 수 없다. 표지판은 정거장 곁에 서서 돌 틀에 닿지 않는다.
// S3(다섯 음 길)는 서는 자리 오른쪽에 박자 강 서쪽 기슭이 바짝 다가와(돌 다섯째 칸부터 물 위) 돌 줄을 서는 자리 왼쪽에 놓는다.
// 음계 길의 나무는 코드가 아니라 world-src/regions/scale-trail.tmj에 놓여 있으므로, 이 시험은 지금 놓인 지도를 읽어 본다(계단밭·종나무 터 시험과 같은 방식).
// 돌 그림도 본다: 설치물 층은 구워 둔 돌 위에 글자와 표식만 올려 그리므로(4-1), 걷는 중에도 돌이 보이려면 바닥에 돌 그림이 구워져 있어야 하고
// 그 자리가 설치물 파일의 slots와 같아야 한다(world-src/stones.ts의 TRAIL_STONE_ROWS).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInstallation, slotBounds } from '../../src/domain/installation';
import type { InstallationDef, WorldRect } from '../../src/domain/installation';
import { regionBoundsPx } from '../../src/domain/world';
import { findPath } from '../../src/world/nav';
import type { WorldObjectData } from '../../src/world/objects';
import { loadWorldSource } from '../../tools/world-source';
import { loadRegionDefs } from '../../tools/world-files';
import { buildWorld } from '../../world-src/index';
import { RIVER_HALF_WIDTH, riverCenter } from '../../world-src/outer';
import { TRAIL_STONE, TRAIL_STONE_ROWS, trailStoneDot, trailStoneRects, trailStonesSvg } from '../../world-src/stones';
import { STONE_DOTS } from '../../world-src/village';

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'content', 'installations');
const sites: InstallationDef[] = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('inst.scale-trail.') && f.endsWith('.json'))
  .map((f) => parseInstallation(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).installation!)
  .sort((a, b) => a.stationCode.localeCompare(b.stationCode));

const regions = loadRegionDefs(root);
const build = buildWorld(regions, loadWorldSource(root));

/** 돌 틀 둘레에 나무 줄기가 서 있지 않아야 하는 여유(월드 px). 종나무 터와 계단밭 터가 쓰는 카메라 여유와 같다 */
const CLEAR_PAD = 24;

/** 서로 다른 돌 줄 사이에 두는 빈틈(월드 px). 한 줄의 돌 높이(153 px)의 절반보다 넉넉하다 */
const MIN_ROW_GAP = 64;

/** 박자 강 물가에서 돌 틀까지 두는 거리(월드 px). 강 충돌선(중심선에서 RIVER_HALF_WIDTH)이 물가다 */
const MIN_BANK_CLEARANCE = 128;

/**
 * 설계서 4.2·5.6: 틀의 월드 좌표. 돌은 99 px 간격이고(돌 81×153), 서는 자리와 가장 가까운 돌 사이는 150 px이다.
 * S1·S2는 서는 자리 오른쪽(side 'right')에서 돌이 시작한다.
 * S3는 오른쪽에 박자 강 물가가 다가와서 서는 자리 왼쪽(side 'left')에서 돌이 끝난다. 돌 번호는 어느 쪽이든 왼쪽에서 오른쪽으로 높아진다.
 */
const FRAMES: Record<string, { stand: { x: number; y: number }; frame: WorldRect; count: number; side: 'right' | 'left' }> = {
  S1: { stand: { x: 5400, y: 4800 }, frame: { x: 5550, y: 4724, w: 774, h: 153 }, count: 8, side: 'right' },
  S2: { stand: { x: 6100, y: 5300 }, frame: { x: 6250, y: 5224, w: 774, h: 153 }, count: 8, side: 'right' },
  S3: { stand: { x: 6800, y: 5000 }, frame: { x: 6074, y: 4974, w: 576, h: 153 }, count: 6, side: 'left' },
};

/** 나무 그림의 덮개 원: 그림 파일 이름 'obj-…-tree-r90.svg'의 숫자가 덮개의 반지름이고, 그림 틀의 가운데가 원의 가운데다 */
function canopyOf(o: WorldObjectData): { x: number; y: number; r: number } | null {
  if (o.kind !== 'tree') return null;
  const m = /-r(\d+)\.svg$/.exec(o.file);
  if (!m) return null;
  return { x: o.x - o.ax * o.w + o.w / 2, y: o.y - o.ay * o.h + o.h / 2, r: Number(m[1]) };
}

/** 원이 사각형과 겹치는가(닿기만 해도 겹친 것으로 본다) */
const circleTouches = (c: { x: number; y: number; r: number }, rect: WorldRect): boolean => {
  const dx = Math.max(rect.x - c.x, 0, c.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - c.y, 0, c.y - (rect.y + rect.h));
  return Math.hypot(dx, dy) <= c.r;
};

/** 두 사각형이 겹치는가(맞닿기만 하면 겹친 것이 아니다) */
const rectsOverlap = (a: WorldRect, b: WorldRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const padded = (f: WorldRect, pad: number): WorldRect => ({ x: f.x - pad, y: f.y - pad, w: f.w + 2 * pad, h: f.h + 2 * pad });

/** 두 사각형 사이의 가장 짧은 거리(겹치면 0) */
const rectGap = (a: WorldRect, b: WorldRect): number => Math.hypot(Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0));

/** 점에서 사각형까지의 거리(안이면 0) */
const pointToRect = (p: { x: number; y: number }, r: WorldRect): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

/** 박자 강의 물가에서 사각형까지의 거리: 중심선 점(16 px 간격)에서 사각형까지의 가장 짧은 거리에서 강 반폭을 뺀다. 물 위에 있으면 음수 */
const bankClearance = (r: WorldRect): number => Math.min(...riverCenter().map((p) => pointToRect(p, r))) - RIVER_HALF_WIDTH;

/** 틀 안을 16 px 간격으로 훑어 막힌 점을 모은다 */
const blockedSamples = (f: WorldRect): string[] => {
  const out: string[] = [];
  for (let y = f.y + 4; y < f.y + f.h; y += 16) for (let x = f.x + 4; x < f.x + f.w; x += 16) if (build.grid.isBlockedPoint(x, y)) out.push(`(${x}, ${y})`);
  return out;
};

/** 틀과 겹치는 나무들의 id */
const trespassers = (objects: readonly WorldObjectData[], frame: WorldRect): string[] =>
  objects.filter((o) => {
    const c = canopyOf(o);
    return c !== null && circleTouches(c, frame);
  }).map((o) => o.id);

describe('음계 길 터', () => {
  it('디딤돌 길은 셋이다(S1 S2 S3). 서는 자리와 가장 가까운 돌 사이는 150 px이다', () => {
    expect(sites.map((i) => i.stationCode)).toEqual(['S1', 'S2', 'S3']);
    for (const inst of sites) {
      const want = FRAMES[inst.stationCode]!;
      const f = slotBounds(inst);
      expect(f, inst.installationId).toEqual(want.frame);
      expect(inst.slots, inst.installationId).toHaveLength(want.count);
      expect(inst.interactPoint, inst.installationId).toEqual(want.stand);
      expect(want.side === 'right' ? f.x - inst.interactPoint.x : inst.interactPoint.x - (f.x + f.w), inst.installationId).toBe(150);
    }
  });

  it('돌은 한 줄로 같은 간격이다: 낮은 소리의 돌이 왼쪽이다(99 px 간격, 돌 번호 순서)', () => {
    for (const inst of sites) {
      const first = inst.slots[0]!;
      inst.slots.forEach((s, i) => {
        expect(s.slot, `${inst.installationId} ${i + 1}번`).toBe(i + 1);
        expect(s.x, `${inst.installationId} ${s.slot}번 x`).toBe(first.x + 99 * i);
        expect(s.y, `${inst.installationId} ${s.slot}번 y`).toBe(first.y);
        expect([s.w, s.h], `${inst.installationId} ${s.slot}번 크기`).toEqual([81, 153]);
      });
    }
  });

  it('틀은 음계 길 안에 있고, 서로 겹치지 않는다(카메라 여유를 더해도 줄끼리 가리지 않는다)', () => {
    const bounds = regionBoundsPx(regions.find((r) => r.regionId === 'scale-trail')!);
    for (const inst of sites) {
      const f = slotBounds(inst);
      expect(f.x, inst.installationId).toBeGreaterThanOrEqual(bounds.x0);
      expect(f.y, inst.installationId).toBeGreaterThanOrEqual(bounds.y0);
      expect(f.x + f.w, inst.installationId).toBeLessThanOrEqual(bounds.x1);
      expect(f.y + f.h, inst.installationId).toBeLessThanOrEqual(bounds.y1);
    }
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const label = `${sites[i]!.stationCode}와 ${sites[j]!.stationCode}`;
        expect(rectsOverlap(padded(slotBounds(sites[i]!), CLEAR_PAD), padded(slotBounds(sites[j]!), CLEAR_PAD)), label).toBe(false);
        expect(rectGap(slotBounds(sites[i]!), slotBounds(sites[j]!)), `${label} 돌 줄 사이`).toBeGreaterThanOrEqual(MIN_ROW_GAP);
      }
    }
  });

  it(`박자 강 물가에서 ${MIN_BANK_CLEARANCE} px 이상 떨어져 있다: 돌이 물 위나 물가에 걸리지 않는다`, () => {
    for (const inst of sites) expect(bankClearance(slotBounds(inst)), inst.installationId).toBeGreaterThanOrEqual(MIN_BANK_CLEARANCE);
  });

  it('어떤 나무의 덮개도 돌 틀과 겹치지 않는다', () => {
    for (const inst of sites) expect(trespassers(build.objects, slotBounds(inst)), inst.installationId).toEqual([]);
  });

  it('줄기가 막은 자리도 없다: 틀 안을 16 px 간격으로 훑어도 막힌 점이 없다(걸으며 돌을 밟는다)', () => {
    for (const inst of sites) expect(blockedSamples(slotBounds(inst)), inst.installationId).toEqual([]);
  });

  it('돌마다 가운데와 네 모서리 안쪽도 걸을 수 있다', () => {
    for (const inst of sites) {
      for (const s of inst.slots) {
        for (const [dx, dy] of [
          [0.5, 0.5],
          [0.1, 0.1],
          [0.9, 0.1],
          [0.1, 0.9],
          [0.9, 0.9],
        ] as const) {
          const x = s.x + s.w * dx;
          const y = s.y + s.h * dy;
          expect(build.grid.isBlockedPoint(x, y), `${inst.installationId} ${s.slot}번 돌 (${x}, ${y})`).toBe(false);
        }
      }
    }
  });

  it(`틀 둘레 ${CLEAR_PAD} px 안에는 나무 줄기가 서 있지 않다: 설치물 모드에서 돌 줄 가장자리에 줄기가 걸리지 않는다`, () => {
    for (const inst of sites) {
      const pad = padded(slotBounds(inst), CLEAR_PAD);
      const trunks = build.colliders.filter((c) => c.kind === 'circle' && circleTouches({ x: c.x, y: c.y, r: c.r }, pad) && !/표지판/.test(c.note ?? ''));
      expect(trunks, inst.installationId).toEqual([]);
    }
  });

  it('서는 자리는 걸을 수 있는 땅이고, 거기서 모든 돌의 가운데까지 걸어갈 수 있다(표지판은 돌아간다, 우회는 직선의 1.35배 안)', () => {
    for (const inst of sites) {
      const from = inst.interactPoint;
      expect(build.grid.isBlockedPoint(from.x, from.y), `${inst.stationCode} 서는 자리`).toBe(false);
      for (const s of inst.slots) {
        const to = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
        const label = `${inst.stationCode} 서는 자리에서 ${s.slot}번 돌`;
        const path = findPath(build.grid, from, to);
        expect(path, label).not.toBeNull();
        expect(path!.adjusted, `${label}: 막혀서 다른 곳으로 바뀌지 않는다`).toBe(false);
        expect(Math.hypot(path!.goal.x - to.x, path!.goal.y - to.y), `${label}: 돌 가운데에 닿는다`).toBeLessThan(1);
        let length = 0;
        let at = from;
        for (const w of path!.waypoints) {
          length += Math.hypot(w.x - at.x, w.y - at.y);
          at = w;
        }
        expect(length, `${label}: 우회 길이`).toBeLessThanOrEqual(Math.hypot(to.x - from.x, to.y - from.y) * 1.35 + 1);
      }
    }
  });

  it('표지판은 서는 자리 곁에 서고 돌 틀에 닿지 않는다: 막는 자리는 틀에서 줄기 여유만큼 떨어지고, 그림은 틀을 가리지 않는다', () => {
    const colliders = build.colliders.filter((c) => c.kind === 'circle' && /^S[123] 표지판$/.test(c.note ?? ''));
    expect(colliders).toHaveLength(3);
    const signs = build.objects.filter((o) => o.kind === 'sign' && /^S[123]$/.test(o.stationId ?? ''));
    expect(signs).toHaveLength(3);
    for (const inst of sites) {
      const f = slotBounds(inst);
      const c = colliders.find((x) => x.kind === 'circle' && x.note === `${inst.stationCode} 표지판`)!;
      if (c.kind === 'circle') {
        expect(pointToRect(c, f) - c.r, `${inst.stationCode} 막는 자리와 돌 틀 사이`).toBeGreaterThanOrEqual(CLEAR_PAD);
        expect([c.x - inst.interactPoint.x, c.y - inst.interactPoint.y], `${inst.stationCode} 표지판은 서는 자리 오른쪽 72 px, 위쪽 8 px`).toEqual([72, -8]);
      }
      const sign = signs.find((s) => s.stationId === inst.stationCode)!;
      const rect = { x: sign.x - sign.ax * sign.w, y: sign.y - sign.ay * sign.h, w: sign.w, h: sign.h };
      expect(rectsOverlap(rect, f), `${inst.stationCode} 표지판 그림과 돌 틀`).toBe(false);
    }
  });

  it('검사가 헛돌지 않는다: 틀 한가운데에 나무를 하나 놓으면 걸린다', () => {
    const inst = sites.find((i) => i.stationCode === 'S2')!;
    const f = slotBounds(inst);
    const tree: WorldObjectData = { id: 'stray', kind: 'tree', file: 'obj-scale-trail-tree-r72.svg', x: f.x + f.w / 2, y: f.y + f.h / 2, ax: 0.5, ay: 0.5, w: 152, h: 152, sortY: f.y + f.h / 2 + 36 };
    expect(trespassers([tree], f)).toEqual(['stray']);
    // 틀에서 덮개 반지름보다 멀리 떨어진 나무는 걸리지 않는다
    expect(trespassers([{ ...tree, x: f.x - 100, y: f.y + f.h / 2 }], f)).toEqual([]);
    // 닿기만 해도 겹친 것이다
    expect(trespassers([{ ...tree, x: f.x - 72, y: f.y + f.h / 2 }], f)).toEqual(['stray']);
  });

  it('검사가 헛돌지 않는다: 다섯 음 길 돌을 처음 자리(서는 자리 오른쪽 150 px)에 두면 물에 걸리고 물가 여유도 모자란다', () => {
    const s3 = FRAMES['S3']!;
    const first: WorldRect = { x: s3.stand.x + 150, y: 4924, w: 576, h: 153 };
    expect(blockedSamples(first).length).toBeGreaterThan(0);
    expect(bankClearance(first)).toBeLessThan(0);
    // 지금 자리는 물가에서 충분히 멀다
    expect(bankClearance(s3.frame)).toBeGreaterThanOrEqual(MIN_BANK_CLEARANCE);
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

describe('음계 길 돌 그림: 바닥에 구워져서 걷는 중에도 보인다(마을 H4의 돌과 같은 모양)', () => {
  const rowOf = (id: string) => TRAIL_STONE_ROWS.find((r) => r.installationId === id)!;

  it('구운 돌 줄은 세 설치물과 하나씩 짝이고, 돌 크기와 간격은 설치물 파일과 같다', () => {
    // 같은 목록에 건반 늪 K4(반음 계단)의 줄 둘도 있다: 그쪽은 key-marsh-site.test.ts가 본다(7-3)
    expect(TRAIL_STONE_ROWS.filter((r) => /^S[123]$/.test(r.stationCode)).map((r) => r.stationCode).sort()).toEqual(['S1', 'S2', 'S3']);
    expect(TRAIL_STONE).toEqual({ w: 81, h: 153, pitch: 99 });
    for (const inst of sites) {
      const row = rowOf(inst.installationId);
      expect(row, inst.installationId).toBeDefined();
      expect(row.stationCode, inst.installationId).toBe(inst.stationCode);
      expect(trailStoneRects(row), `${inst.installationId} 돌 자리`).toEqual(inst.slots.map((s) => ({ slot: s.slot, x: s.x, y: s.y, w: s.w, h: s.h })));
    }
  });

  it('바닥 그림에 돌마다 돌 모양과 속 점이 있다(설치물 파일의 자리를 직접 읽어 맞대어 본다)', () => {
    for (const inst of sites) {
      const dots = inst.slots.map((_, i) => trailStoneDot(i, inst.slots.length));
      expect(missingStones(build.svgBody, inst.slots, dots), inst.installationId).toEqual([]);
    }
    // 돌은 22개(8 + 8 + 6)이고 바닥 그림에 그 모양이 그대로 한 벌씩 들어 있다
    expect(sites.reduce((n, i) => n + i.slots.length, 0)).toBe(22);
    expect(build.svgBody.split(trailStonesSvg()).length - 1).toBe(1);
  });

  it('돌 속 점의 색은 마을 H4의 풀빛에서 볕빛으로 이어진다: 돌 8개는 H4와 같고, 6개는 같은 범위에서 고르게 건너뛴다', () => {
    for (const code of ['S1', 'S2']) {
      const row = rowOf(sites.find((i) => i.stationCode === code)!.installationId);
      expect(Array.from({ length: row.count }, (_, i) => trailStoneDot(i, row.count)), code).toEqual([...STONE_DOTS]);
    }
    const five = rowOf(sites.find((i) => i.stationCode === 'S3')!.installationId);
    const dots = Array.from({ length: five.count }, (_, i) => trailStoneDot(i, five.count));
    expect(dots[0]).toBe(STONE_DOTS[0]);
    expect(dots[dots.length - 1]).toBe(STONE_DOTS[STONE_DOTS.length - 1]);
    const at = dots.map((d) => (STONE_DOTS as readonly string[]).indexOf(d));
    expect(at.every((k) => k >= 0)).toBe(true);
    for (let i = 1; i < at.length; i++) expect(at[i]!).toBeGreaterThan(at[i - 1]!);
  });

  it('구운 돌이 걸을 수 있는 땅 위에 놓인다: 돌 가운데는 막힌 자리가 아니다(돌 그림만 있고 걸을 수 없는 일이 없다)', () => {
    for (const row of TRAIL_STONE_ROWS) for (const s of trailStoneRects(row)) expect(build.grid.isBlockedPoint(s.x + s.w / 2, s.y + s.h / 2), `${row.stationCode} ${s.slot}번`).toBe(false);
  });

  it('검사가 헛돌지 않는다: 돌 하나를 1 px 옮기거나 그림에서 빼거나 점 색을 바꾸면 걸린다', () => {
    const inst = sites.find((i) => i.stationCode === 'S2')!;
    const dots = inst.slots.map((_, i) => trailStoneDot(i, inst.slots.length));
    expect(missingStones(build.svgBody, inst.slots, dots)).toEqual([]);
    const moved = inst.slots.map((s) => (s.slot === 3 ? { ...s, x: s.x + 1 } : s));
    expect(missingStones(build.svgBody, moved, dots)).toEqual(['3번 돌 모양', '3번 돌 점']);
    expect(missingStones(build.svgBody.replace(trailStonesSvg(), ''), inst.slots, dots)).toHaveLength(inst.slots.length * 2);
    const recolored = dots.map((d, i) => (i === 5 ? '#000000' : d));
    expect(missingStones(build.svgBody, inst.slots, recolored)).toEqual(['6번 돌 점']);
  });
});
