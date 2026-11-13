// 7-1d 계단밭 터: 계단밭(T5) 설치물 셋(N1 N2 N3)의 틀(slotBounds) 안에는 나무 덮개(캐노피)와 막힌 자리가 없다.
// 설치물 층은 사물보다 아래에 그려지고(LAYER_DEPTH), 사물은 발 위치 순서로 그 위에 쌓이므로, 틀 안에 놓인 나무는 등과 덧줄 돌담을 덮는다.
// 또 나무 줄기는 막힌 자리라서 열 안에 있으면 지나가며 울리는 등(stepped)을 밟을 수 없다.
// 언덕의 나무는 코드가 아니라 world-src/regions/staff-hill.tmj에 놓여 있으므로, 이 시험은 지금 놓인 지도를 읽어 본다(종나무 터 시험과 같은 방식).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInstallation, slotBounds } from '../../src/domain/installation';
import type { InstallationDef, WorldRect } from '../../src/domain/installation';
import { TERRACE_FRAME_PAD, terraceBounds } from '../../src/domain/terrace';
import type { WorldObjectData } from '../../src/world/objects';
import { loadWorldSource } from '../../tools/world-source';
import { loadRegionDefs } from '../../tools/world-files';
import { buildWorld } from '../../world-src/index';

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'content', 'installations');
const sites: InstallationDef[] = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseInstallation(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).installation!)
  .filter((i) => i.slotMap?.kind === 'staffField');

const build = buildWorld(loadRegionDefs(root), loadWorldSource(root));

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

/** 틀과 겹치는 나무들의 id */
const trespassers = (objects: readonly WorldObjectData[], frame: WorldRect): string[] =>
  objects.filter((o) => {
    const c = canopyOf(o);
    return c !== null && circleTouches(c, frame);
  }).map((o) => o.id);

describe('계단밭 터', () => {
  it('계단밭 설치물은 셋이다(N1 N2 N3). 셋은 같은 땅의 가로 범위를 쓴다', () => {
    expect(sites.map((i) => i.stationCode).sort()).toEqual(['N1', 'N2', 'N3']);
    const spans = sites.map((i) => {
      const f = terraceBounds(i);
      return [f.x, f.w];
    });
    expect(new Set(spans.map((s) => s.join(','))).size).toBe(1);
  });

  it('어떤 나무의 덮개도 계단밭의 틀(열과 이름표 띠)과 겹치지 않는다', () => {
    for (const inst of sites) expect(trespassers(build.objects, slotBounds(inst)), inst.installationId).toEqual([]);
  });

  it('줄기가 막은 자리도 없다: 틀 안을 16 px 간격으로 훑어도 막힌 점이 없다(걸으며 등을 밟고, 이름표 띠도 걸을 수 있다)', () => {
    for (const inst of sites) {
      const f = slotBounds(inst);
      const blocked: string[] = [];
      for (let y = f.y + 4; y < f.y + f.h; y += 16) for (let x = f.x + 4; x < f.x + f.w; x += 16) if (build.grid.isBlockedPoint(x, y)) blocked.push(`(${x}, ${y})`);
      expect(blocked, inst.installationId).toEqual([]);
    }
  });

  it('열 한가운데와 네 모서리 안쪽도 걸을 수 있다', () => {
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
          expect(build.grid.isBlockedPoint(x, y), `${inst.installationId} ${s.slot}번 열 (${x}, ${y})`).toBe(false);
        }
      }
    }
  });

  it(`카메라 여유(${TERRACE_FRAME_PAD} px) 안에는 나무 줄기가 서 있지 않다: 설치물 모드에서 화면 가장자리에 줄기가 걸리지 않는다`, () => {
    for (const inst of sites) {
      const f = slotBounds(inst);
      const padded = { x: f.x - TERRACE_FRAME_PAD, y: f.y - TERRACE_FRAME_PAD, w: f.w + 2 * TERRACE_FRAME_PAD, h: f.h + 2 * TERRACE_FRAME_PAD };
      const trunks = build.colliders.filter((c) => c.kind === 'circle' && circleTouches({ x: c.x, y: c.y, r: c.r }, padded) && !/표지판/.test(c.note ?? ''));
      expect(trunks, inst.installationId).toEqual([]);
    }
  });

  it('표지판(N1 N2 N3)은 틀 바깥 왼쪽에 서 있어서 이름표 띠를 가리지 않는다', () => {
    const signs = build.colliders.filter((c) => c.kind === 'circle' && /^N[123] 표지판$/.test(c.note ?? ''));
    expect(signs).toHaveLength(3);
    for (const inst of sites) {
      const f = slotBounds(inst);
      for (const s of signs) if (s.kind === 'circle') expect(s.x + s.r, `${inst.stationCode} 틀 왼쪽 ${f.x}`).toBeLessThanOrEqual(f.x);
    }
  });

  it('검사가 헛돌지 않는다: 틀 한가운데에 나무를 하나 놓으면 걸린다', () => {
    const inst = sites.find((i) => i.stationCode === 'N3')!;
    const f = slotBounds(inst);
    const tree: WorldObjectData = { id: 'stray', kind: 'tree', file: 'obj-staff-hill-tree-r72.svg', x: f.x + f.w / 2, y: f.y + f.h / 2, ax: 0.5, ay: 0.5, w: 152, h: 152, sortY: f.y + f.h / 2 + 36 };
    expect(trespassers([tree], f)).toEqual(['stray']);
    // 틀에서 덮개 반지름보다 멀리 떨어진 나무는 걸리지 않는다
    expect(trespassers([{ ...tree, x: f.x - 100, y: f.y + f.h / 2 }], f)).toEqual([]);
    // 닿기만 해도 겹친 것이다
    expect(trespassers([{ ...tree, x: f.x - 72, y: f.y + f.h / 2 }], f)).toEqual(['stray']);
  });
});
