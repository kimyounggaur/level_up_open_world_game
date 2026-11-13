// 첫 화면과 목록(#/list). 월드 쪽 흐름은 world.flow.ts가 확인한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUEST_COUNT } from './content';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

describe('첫 화면은 마을이고, 전체 도전 목록은 #/list에서 열린다', () => {
  it('첫 화면에는 목록 카드가 없고 마을의 메뉴가 있다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    await page.goto(h.url);
    await page.waitForSelector('.hud');
    await skipIntro(page);
    expect(await page.title()).toContain('음악 마을');
    expect(await page.locator('.quest-card').count()).toBe(0);
    expect(await page.locator('canvas').count()).toBeLessThanOrEqual(1);
    await ctx.close();
    expect(errors).toEqual([]);
  });

  it('목록은 주소로 바로 열리고, 제목과 도전 카드가 보이며 오류가 없다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    await page.goto(h.url + '#/list');
    await page.waitForSelector('main h1');
    expect(await page.textContent('main h1')).toBe('전체 도전');
    expect(await page.locator('.quest-card').count()).toBe(QUEST_COUNT);
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1); // 목록 뒤에도 마을이 올라온다(기다리지는 않는다)
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
