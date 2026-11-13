// 4-4 세계 반응 흐름 시험(실제 Chrome): 정거장 곁의 등불이 그려지고, 재료를 놓으면 켜지고, 통과하면 꽃등이 되며,
// 합주 층수가 왼쪽 위에 보이고, 틀려도 줄지 않으며, 새로 고쳐도 그대로다(6.1~6.3, W-2, W-6, W-9).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbg, teleport, toScreen, waitChunks, waitNear, waitReady, type Dbg, type DrawnLantern } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const STATIONS = 23;

async function boot(opts: { w?: number; h?: number; touch?: boolean; hash?: string } = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, hasTouch: opts.touch ?? false });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  await skipIntro(page, { tap: opts.touch ?? false });
  return { ctx, page, errors };
}

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string, timeout = 30000): Promise<T> {
  const end = Date.now() + timeout;
  let last: T | undefined;
  while (Date.now() < end) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`시간 안에 ${what}: 마지막 값 ${JSON.stringify(last)}`);
}

const lanternsOf = async (page: Page): Promise<Record<string, DrawnLantern>> => Object.fromEntries((await dbg(page)).lanterns.map((l) => [l.stationId, l]));
const stateOf = async (page: Page, id: string): Promise<string | undefined> => (await lanternsOf(page))[id]?.state;
const ensembleText = (page: Page): Promise<string> => page.locator('.hud-ensemble').innerText();
const newsOf = (page: Page): Promise<string[]> => page.locator('[data-news] p').allInnerTexts();

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

/** 컨트롤러로 Q07(C장조)을 직접 푼다: 화면을 거치는 풀이는 installation.flow.ts가 이미 본다 */
const solveQ07 = (page: Page, wrongFourth = false): Promise<{ passed: boolean }> =>
  page.evaluate((wrong) => {
    const c = (window as unknown as { __game: { controller: { open(q: string, v: string): unknown; edit(e: unknown): void; check(): { passed: boolean } } } }).__game.controller;
    c.open('scale.major', 'c-major');
    const notes: Array<[string, number]> = [['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5]];
    notes.forEach(([letter, octave], i) => {
      const [l, o] = wrong && i === 3 ? (['G', 4] as [string, number]) : [letter, octave];
      c.edit({ type: 'setSlot', slot: i + 1, writtenPitch: { letter: l, accidental: null, octave: o } });
    });
    return { passed: c.check().passed };
  }, wrongFourth);

describe('4-4 등불이 정거장 곁에 서 있다', () => {
  it('처음에는 정거장 스물세 곳의 등불이 모두 꺼져 있고 합주 0층이다. 새 소식도 없다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    const lanterns = (await dbg(page)).lanterns;
    expect(lanterns).toHaveLength(STATIONS);
    expect(new Set(lanterns.map((l) => l.state))).toEqual(new Set(['off']));
    expect(await ensembleText(page)).toBe('합주 0층');
    expect(await newsOf(page)).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('마을의 정거장 다섯 곳에서 등불이 화면 안에 보이고, 위쪽 메뉴나 안내 칩에 가려지지 않는다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    for (const id of ['H1', 'H2', 'H3', 'H4', 'H5']) {
      expect(await teleport(page, id)).toBe(true);
      await waitNear(page, id, 20000);
      const d: Dbg = await until(() => dbg(page), (x) => x.pending.length === 0, '바닥 조각이 올라옴');
      const lantern = d.lanterns.find((l) => l.stationId === id)!;
      // 등 머리(발치에서 위로 약 40 px)와 발치가 모두 화면 안에서 위쪽 메뉴 줄(약 72 px) 아래, 아래쪽 안내 칩 줄 위에 있다
      const head = toScreen(d, lantern.x, lantern.y - 40);
      const foot = toScreen(d, lantern.x, lantern.y);
      const size = { w: 1280, h: 720 };
      expect(head.x, `${id} 등 머리 x`).toBeGreaterThan(24);
      expect(foot.x, `${id} 발치 x`).toBeLessThan(size.w - 24);
      expect(head.y, `${id} 등 머리 y`).toBeGreaterThan(90);
      expect(foot.y, `${id} 발치 y`).toBeLessThan(size.h - 110);
      await shot(page, `phase4-lantern-${id}-off.png`);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-4 재료를 놓으면 켜지고, 통과하면 꽃등이 된다', () => {
  it('설치물에서 자유로 놓으면 그 정거장의 등불만 켜지고 소식이 뜬다. 등불은 모양이 바뀐다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect(await teleport(page, 'H4')).toBe(true);
    await waitNear(page, 'H4', 20000);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-installation-hud]', { timeout: 20000 });
    expect(await stateOf(page, 'H4')).toBe('off'); // 들어가기만 해서는 켜지지 않는다
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter'); // 1번 돌에 C4(자유로 놀기)
    await until(() => stateOf(page, 'H4'), (s) => s === 'on', 'H4 등불이 켜짐');
    expect(await stateOf(page, 'S1')).toBe('off'); // 자유로 놀기는 이 설치물의 정거장만 켠다
    expect(await newsOf(page)).toContain('음계 디딤돌의 등불이 켜졌어요.');
    expect((await page.locator('[data-news]').getAttribute('role'))).toBe('status');
    expect(await ensembleText(page)).toBe('합주 0층'); // 켜는 것만으로 층이 오르지 않는다
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
    await shot(page, 'phase4-lantern-H4-on.png');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('통과하면 꽃등이 되고 합주 2층이 된다(마을과 음계 길). 이어서 틀려도 그대로이고, 새로 고쳐도 같다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect(await teleport(page, 'H4')).toBe(true);
    await waitNear(page, 'H4', 20000);
    const wrong = await solveQ07(page, true);
    expect(wrong.passed).toBe(false);
    await until(() => stateOf(page, 'H4'), (s) => s === 'on', '틀린 시도로도 재료를 놓았으니 켜짐');
    expect(await stateOf(page, 'S1')).toBe('on'); // 과제가 놓인 두 정거장 모두(어느 길로 열었든 같다, W-2)
    expect(await ensembleText(page)).toBe('합주 0층'); // 틀리면 층이 오르지 않는다

    const solved = await solveQ07(page);
    expect(solved.passed).toBe(true);
    await until(() => stateOf(page, 'H4'), (s) => s === 'flower', 'H4가 꽃등이 됨');
    expect(await stateOf(page, 'S1')).toBe('flower');
    expect(await stateOf(page, 'H1')).toBe('off'); // 다른 정거장은 그대로
    // 마을 1층 + 음계 길 1층 = 합주 2층(두 지역의 문턱은 모두 1, 2, 3)
    await until(() => ensembleText(page), (t) => t === '합주 2층', '합주 2층');
    const news = await newsOf(page);
    expect(news).toContain('음계 디딤돌의 등불이 꽃등이 되었어요.');
    expect(news).toContain('음악 마을의 소리가 1층이 되었어요.');
    expect(news).toContain('음계 길의 소리가 1층이 되었어요.');
    expect(news.at(-1)).toBe('합주 2층이 되었어요.');
    // 꽃등이 된 정거장의 '켜졌어요'는 거두고, 한 화면에 쌓이는 줄은 다섯을 넘지 않는다
    expect(news.some((l) => l.endsWith('의 등불이 켜졌어요.'))).toBe(false);
    expect(news.length).toBeLessThanOrEqual(5);
    await shot(page, 'phase4-lantern-H4-flower.png');

    // 통과한 뒤에 틀려도 아무것도 줄지 않는다(W-6)
    const again = await solveQ07(page, true);
    expect(again.passed).toBe(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(await stateOf(page, 'H4')).toBe('flower');
    expect(await ensembleText(page)).toBe('합주 2층');

    // 새로 고쳐도 같다. 이미 있던 것은 새 소식이 아니다
    expect(await page.evaluate(() => (window as unknown as { __game: { persistence: { flush(): Promise<boolean> } } }).__game.persistence.flush())).toBe(true);
    await page.reload();
    await waitReady(page);
    await waitChunks(page);
    expect(await stateOf(page, 'H4')).toBe('flower');
    expect(await stateOf(page, 'S1')).toBe('flower');
    expect(await ensembleText(page)).toBe('합주 2층');
    expect(await newsOf(page)).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('주소로 연 과제에서 재료를 놓아도 같다: 과제가 놓인 두 정거장이 켜지고, 마을로 돌아오면 소식이 보인다(W-2)', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/q/scale.major/c-major' });
    await page.waitForSelector('.panel', { timeout: 20000 }).catch(() => undefined);
    await page.evaluate(() => {
      const c = (window as unknown as { __game: { controller: { edit(e: unknown): void } } }).__game.controller;
      c.edit({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'C', accidental: null, octave: 4 } });
    });
    await page.evaluate(() => void (location.hash = '#/'));
    await waitReady(page);
    await waitChunks(page);
    await until(() => stateOf(page, 'H4'), (s) => s === 'on', 'H4 등불이 켜짐');
    expect(await stateOf(page, 'S1')).toBe('on');
    expect((await newsOf(page)).filter((l) => l.endsWith('의 등불이 켜졌어요.')).length).toBe(2);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-4 왼쪽 위 칩이 다른 것과 겹치지 않는다', () => {
  const SCREENS: Array<{ name: string; w: number; h: number; touch: boolean }> = [
    { name: '1366x768', w: 1366, h: 768, touch: false },
    { name: '430x932', w: 430, h: 932, touch: true },
    { name: '360x640', w: 360, h: 640, touch: true },
    { name: '844x390', w: 844, h: 390, touch: true },
  ];
  for (const s of SCREENS) {
    it(`${s.name}: 지역 이름, 합주 층수, 새 소식이 위쪽 오른쪽 메뉴와 겹치지 않고 화면 안에 있다`, async () => {
      const { ctx, page, errors } = await boot({ w: s.w, h: s.h, touch: s.touch });
      await waitReady(page);
      await waitChunks(page);
      // 소식이 두 줄 떠 있는 때의 모습으로 잰다
      await page.evaluate(() => {
        const g = (window as unknown as { __game: { visited: { mark(ids: string[]): void } } }).__game;
        g.visited.mark(['H1', 'H2']);
      });
      await until(() => newsOf(page), (n) => n.length === 2, '소식 두 줄');
      const boxes = await page.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const corner = document.querySelector('.hud-corner')!;
        return {
          vw: window.innerWidth,
          vh: window.innerHeight,
          corner: box(corner),
          region: box(document.querySelector('.hud-region')!),
          ensemble: box(document.querySelector('.hud-ensemble')!),
          news: [...document.querySelectorAll('[data-news] p')].map(box),
          menu: [...document.querySelectorAll('.hud-menu button')].filter((b) => (b as HTMLElement).offsetParent !== null).map(box),
        };
      });
      const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      for (const piece of [boxes.region, boxes.ensemble, ...boxes.news]) {
        expect(piece.x).toBeGreaterThanOrEqual(0);
        expect(piece.x + piece.w).toBeLessThanOrEqual(boxes.vw + 0.5);
        for (const m of boxes.menu) expect(hit(piece, m), `칩과 메뉴 단추가 겹침 ${JSON.stringify(piece)} ${JSON.stringify(m)}`).toBe(false);
      }
      // 한글 소식은 낱말 가운데에서 끊기지 않는다(띄어쓰기에서만 줄을 바꾼다)
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-news] p')!).wordBreak)).toBe('keep-all');
      // 지역 이름 아래에 합주 층수가, 그 아래에 소식이 쌓인다
      expect(boxes.ensemble.y).toBeGreaterThanOrEqual(boxes.region.y + boxes.region.h - 1);
      expect(boxes.news[0]!.y).toBeGreaterThanOrEqual(boxes.ensemble.y + boxes.ensemble.h - 1);
      await shot(page, `phase4-hud-reaction-${s.name}.png`);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});
