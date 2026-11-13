// 7-7 길목 표지판 여섯(설계서 3.4 길을 놓는 규칙 1, 12.10)의 흐름 시험(실제 Chrome).
// 완료 기준: "걷는 시간과 볼거리 간격 점검 | 3.4의 규칙 1과 2". 규칙 1은 단위 시험(tests/unit/world-sight.test.ts)이 월드 데이터로 계산하고,
// 이 파일은 그 계산이 믿는 것이 진짜 화면에도 있는지 본다.
//  - 월드가 사물을 모두 그린다(WORLD_OBJECTS 전부). 표지판 그림이 아틀라스에 있고 장면이 놓았다
//  - 길목 표지판마다 길 위에 서서 화면을 찍으면, 표지판이 있어야 할 자리의 그림 점이 표지판 그림의 색(판의 바탕색, 윗띠 색)이다.
//    다른 사물이나 나뭇잎에 가려지지 않았고 길 위에 선 캐릭터에게 보인다. 표지판 곁에서 걷다가 부딪혀도 캐릭터가 갇히지 않는다(막힘 반지름 14 px)
//  - 사진: 표지판마다 한 장(눈으로 보는 점검 자료, docs/verification/screens/). 사람의 눈 점검을 대신하지 않는다
// 먼저 `npm run build`가 필요하다(dist를 연다).
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORLD_OBJECTS } from '../../src/world/generated/worldData';
import { command, dbg, pos, status, toScreen } from './game';
import type { Dbg } from './game';
import { startHarness, type Harness } from './harness';
import { pixelReader } from './shotTools';
import type { Rgb } from './shotTools';
import { boot as bootWith, until, wait } from './soundTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 600_000;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const save = (name: string, png: Buffer): void => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name), png);
};

/** 표지판 그림(world-src/sprites/obj-<지역>-signpost.svg, 120×120)에서 발 자리(60, 112)를 기준으로 본 점들. 판의 바탕색은 모든 지역이 같고, 윗띠 색은 지역마다 달라 그림 파일에서 읽는다 */
const BOARD = { r: 233, g: 221, b: 184 };
const headerOf = (file: string): { r: number; g: number; b: number } => {
  const svg = fs.readFileSync(path.resolve(__dirname, '../../world-src/sprites', file), 'utf-8');
  const m = /<path d="M14 19[^"]*" fill="#([0-9A-Fa-f]{6})"/.exec(svg);
  if (!m) throw new Error(`${file}: 윗띠 색을 읽지 못했어요`);
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};
/** 발에서 판의 가운데 아래쪽 네 점과 윗띠 두 점(그림 점 − 발 자리). 판은 x 14–106, y 10–62이고 윗띠는 y 10–25, 점 셋(y 39–49)은 피한다 */
const BOARD_POINTS: ReadonlyArray<readonly [number, number]> = [[-34, -58], [-15, -56], [15, -56], [34, -58]];
const HEADER_POINTS: ReadonlyArray<readonly [number, number]> = [[-30, -95], [30, -95]];
const near = (c: Rgb, t: { r: number; g: number; b: number }, tol = 36): boolean => Math.hypot(c[0] - t.r, c[1] - t.g, c[2] - t.b) <= tol;

const waysigns = WORLD_OBJECTS.filter((o) => o.id.startsWith('waysign-'));

/** 길 위에서 표지판이 가장 잘 보이는 자리: 표지판에서 가장 가까운 길의 한 점(가운데 줄) */
async function roadPointNear(o: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const { outerRoads } = await import('../../world-src/outer');
  let best = { x: 0, y: 0, d: Infinity };
  for (const r of outerRoads()) for (const p of r.points) {
    const d = Math.hypot(p.x - o.x, p.y - o.y);
    if (d < best.d) best = { x: p.x, y: p.y, d };
  }
  return best;
}

describe('7-7 길목 표지판', () => {
  it(
    `월드가 사물 ${WORLD_OBJECTS.length}개를 모두 그리고, 길목 표지판 ${waysigns.length}개마다 길 위에서 보면 표지판 그림의 색이 그 자리에 보인다. 그 사진을 남긴다`,
    async () => {
      expect(waysigns).toHaveLength(6);
      const { ctx, page, errors } = await bootWith(h);
      const first = (await dbg(page)) as Dbg & { objects: number };
      expect(first.objects, '장면이 그린 사물 수').toBe(WORLD_OBJECTS.length);

      const report: string[] = [];
      for (const o of waysigns) {
        const stand = await roadPointNear(o);
        await command(page, { type: 'teleport', x: stand.x, y: stand.y });
        await wait(500);
        const p = await pos(page);
        expect(Math.hypot(p.x - stand.x, p.y - stand.y), `${o.id}: 길 위(${Math.round(stand.x)}, ${Math.round(stand.y)})에 선다`).toBeLessThan(60);
        const region = o.id.split('-').slice(1, -1).join('-');
        await until(() => status(page), (s) => s.regionId === region && s.ready, `${region}에 들어선다`, 30000);
        await until(() => dbg(page), (d) => d.pending.length === 0, '바닥 조각이 올라온다', 60000);
        await wait(800);
        const png = await page.screenshot();
        const d = await dbg(page);
        const at = await pixelReader(png);
        const mark = (pts: ReadonlyArray<readonly [number, number]>, target: { r: number; g: number; b: number }): { hit: number; seen: string } => {
          let hit = 0;
          const seen: string[] = [];
          for (const [dx, dy] of pts) {
            const c = toScreen(d, o.x + dx, o.y + dy);
            const inView = c.x > 4 && c.x < d.size.width - 4 && c.y > 4 && c.y < d.size.height - 4;
            if (!inView) {
              seen.push('화면 밖');
              continue;
            }
            const rgb = at(Math.round(c.x), Math.round(c.y));
            if (near(rgb, target)) hit++;
            seen.push(`(${rgb.join(', ')})`);
          }
          return { hit, seen: seen.join(' ') };
        };
        const board = mark(BOARD_POINTS, BOARD);
        const header = mark(HEADER_POINTS, headerOf(o.file));
        report.push(`${o.id} (${o.x}, ${o.y}) 판 ${board.hit}/4 ${board.seen} | 윗띠 ${header.hit}/2 ${header.seen}`);
        expect(board.hit, `${o.id}: 판의 바탕색이 보인다 — ${board.seen}`).toBeGreaterThanOrEqual(3);
        expect(header.hit, `${o.id}: 윗띠 색이 보인다 — ${header.seen}`).toBeGreaterThanOrEqual(1);
        save(`phase7-${o.id}.png`, png);
      }
      console.info(`[7-7 길목 표지판] 사물 ${first.objects}개\n${report.join('\n')}`);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
