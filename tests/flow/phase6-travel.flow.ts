// 6-10 전체 지도와 바로 이동(설계서 3.7, 12.9)의 실제 Chrome 흐름 시험.
// 완료 기준: 새 저장에서 두 지역(박자 강가 E1–E4, 종나무 숲 W1–W4)의 모든 정거장으로 바로 간다.
// '새 저장'은 새 브라우저 상자(저장소가 비어 있다)로 연 화면이다. 지도에서 정거장을 눌러 고르고 '바로 이동'을 눌러 실제 월드에서 그 앞에 서는 것을 본다.
// 단위 시험(`map-fast-travel.test.tsx`)은 23곳 모두의 명령을, 월드의 시험(`world-runtime.test.ts`)은 실제 격자에서 23곳 모두의 도착을 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다).
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { loadWorldMap } from '../../src/app/world-data';
import { standOf } from '../../src/domain/world';
import { dbg, hashOf, pos, status, waitChunks, waitNear, waitReady, waitStopped } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const map = loadWorldMap();
const NEW_REGION_IDS = ['beat-river', 'bell-grove'] as const;
const NEW_STATIONS = NEW_REGION_IDS.flatMap((id) => map.region(id).stations.map((s) => s.stationId));

async function boot(reducedMotion: 'reduce' | 'no-preference') {
  const ctx = await h.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url);
  await skipIntro(page);
  await waitReady(page);
  await waitChunks(page);
  await page.waitForTimeout(600); // 처음 자리에 서는 연출이 끝난 뒤의 값을 기준으로 삼는다
  return { ctx, page, errors };
}

const selectedStation = (p: Page): Promise<string | null> => p.locator('[data-selected-station]').first().getAttribute('data-selected-station');
const fadesOf = async (p: Page): Promise<number> => (await dbg(p)).fades;

/** 지도를 연다(이미 열려 있으면 그대로 둔다) */
async function openMap(page: Page): Promise<void> {
  if ((await hashOf(page)) !== '#/map') await page.keyboard.press('KeyM');
  await page.waitForFunction(() => location.hash === '#/map');
  await page.waitForSelector('.map-marker');
}

/** 지도에서 정거장을 눌러 고른다 */
async function pick(page: Page, id: string): Promise<void> {
  await page.locator(`[data-station="${id}"]`).click();
  expect(await selectedStation(page)).toBe(id);
}

/** 새 저장에서 여덟 정거장 모두에 지도로 바로 이동해 선다. 갈 때마다 어두워진 횟수를 돌려준다 */
async function teleportAllNew(page: Page): Promise<number[]> {
  const fades: number[] = [];
  for (const id of NEW_STATIONS) {
    const st = map.station(id)!;
    const region = map.region(st.regionId);
    const before = await fadesOf(page);
    await openMap(page);
    await pick(page, id);
    expect(await page.locator('#map-card-title').textContent(), id).toBe(st.name);
    await page.locator('[data-action="teleport"]').click();
    await page.waitForFunction(() => location.hash === '#/');
    await waitNear(page, id, 30000);
    expect((await status(page)).regionId, `${id}의 지역`).toBe(st.regionId);
    await page.waitForFunction((name) => document.querySelector('.hud-region-name')?.textContent?.trim() === name, region.name, { timeout: 10000 });
    const here = await pos(page);
    const stand = standOf(st);
    expect(Math.hypot(here.x - stand.x, here.y - stand.y), `${id} 앞에 선 거리`).toBeLessThan(40);
    expect(await page.locator('[data-overlay]').count(), `${id}: 도착해도 열지 않는다`).toBe(0);
    fades.push((await fadesOf(page)) - before);
  }
  return fades;
}

describe('6-10 새 저장의 지도: 정거장 23곳이 처음부터 모두 있다', () => {
  it('점 23개와 목록 23개가 모두 있고, 두 새 지역의 8곳이 지역 이름 아래에 있다', async () => {
    const { ctx, page, errors } = await boot('no-preference');
    await openMap(page);
    const want = map.stations.map((s) => s.stationId).sort();
    const dots = await page.$$eval('.map-marker', (els) => els.map((e) => e.getAttribute('data-station')));
    const items = await page.$$eval('[data-station-item]', (els) => els.map((e) => e.getAttribute('data-station-item')));
    expect([...dots].sort()).toEqual(want);
    expect([...items].sort()).toEqual(want);
    expect(want).toHaveLength(23);
    for (const regionId of NEW_REGION_IDS) {
      const region = map.region(regionId);
      const listed = await page.$$eval(`.map-station-group[aria-label="${region.name}"] [data-station-item]`, (els) => els.map((e) => e.getAttribute('data-station-item')));
      expect(listed, region.name).toEqual(region.stations.map((s) => s.stationId));
    }
    // 잠긴 곳이 없다: 점은 모두 눌린다
    expect(await page.locator('.map-marker:disabled').count()).toBe(0);
    expect(await page.locator('.map-band').textContent()).toContain('모든 장소가 처음부터 열려 있어요');
    await page.screenshot({ path: path.join(SHOTS, 'phase6-travel-map.png') }); // 사람이 눈으로 볼 자료: 새 저장의 전체 지도
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120000);
});

describe('6-10 새 저장에서 두 지역의 모든 정거장으로 바로 이동한다', () => {
  it('박자 강가 E1–E4와 종나무 숲 W1–W4: 지도에서 고르고 바로 이동하면 그 앞에 서고 지역 이름이 바뀐다. 갈 때마다 화면이 어두워졌다 밝아진다', async () => {
    const { ctx, page, errors } = await boot('no-preference');
    const fades = await teleportAllNew(page);
    expect(fades).toHaveLength(8);
    for (const [i, n] of fades.entries()) expect(n, `${NEW_STATIONS[i]}의 전환 횟수`).toBeGreaterThanOrEqual(1);
    console.info(`[6-10 바로 이동] 여덟 곳 모두 도착, 전환 횟수: ${fades.join(', ')}`);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 240000);

  it('움직임 줄이기를 켜면 같은 여덟 곳 모두 화면이 어두워지지 않고 바로 바뀐다', async () => {
    const { ctx, page, errors } = await boot('reduce');
    const fades = await teleportAllNew(page);
    expect(fades).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 240000);
});

describe('6-10 지도의 걸어가기로 두 새 지역에 걸어서 닿는다', () => {
  for (const id of ['W1', 'E4'] as const) {
    const st = map.station(id)!;
    const region = map.region(st.regionId);
    it(`${id} ${st.name}(${region.name}): 마을 광장에서 걸어가기를 누르면 길을 따라 걸어가 그 정거장 앞에 선다`, async () => {
      const { ctx, page, errors } = await boot('no-preference');
      await openMap(page);
      await pick(page, id);
      await page.locator('[data-action="walk"]').click();
      await page.waitForFunction(() => location.hash === '#/');
      await waitNear(page, id, 150000);
      await waitStopped(page);
      expect((await status(page)).regionId).toBe(st.regionId);
      const here = await pos(page);
      const stand = standOf(st);
      expect(Math.hypot(here.x - stand.x, here.y - stand.y)).toBeLessThan(90);
      expect(await page.locator('[data-overlay]').count()).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    }, 240000);
  }
});
