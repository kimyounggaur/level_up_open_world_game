// 3단계 흐름 시험(실제 Chrome), 겹침 화면 편: 첫 안내 카드(1.6), 악보 지도(3.7, 7.7), 설정(7.8), 목록 걸러내기(7.7).
// 완료 기준 W-4(끌지 않아도 된다: 키보드만으로 지도를 쓴다)와 3-7(지도에서 모든 과제를 시작할 수 있다)을 함께 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { loadWorldMap } from '../../src/app/world-data';
import { standOf } from '../../src/domain/world';
import { QUEST_COUNT, builtQuestsIn } from './content';
import { dbg, hashOf, pos, status, waitChunks, waitMoved, waitNear, waitReady, waitStopped } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const map = loadWorldMap();

interface BootOpts {
  w?: number;
  h?: number;
  touch?: boolean;
  hash?: string;
  /** 첫 안내 카드를 그대로 둔다(기본은 '시작'을 눌러 닫는다) */
  intro?: boolean;
  reducedMotion?: 'reduce' | 'no-preference';
}

async function boot(opts: BootOpts = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, hasTouch: opts.touch ?? false, reducedMotion: opts.reducedMotion });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  if (!opts.intro) await skipIntro(page);
  return { ctx, page, errors };
}

type Rect = { x: number; y: number; width: number; height: number };
const rect = async (p: Page, selector: string): Promise<Rect> => {
  const box = await p.locator(selector).first().boundingBox();
  if (!box) throw new Error(`화면에 없어요: ${selector}`);
  return box;
};
/** 한 줄로 흐르는 화면이 가로로 넘치지 않는가(보이는 폭보다 내용이 넓지 않다) */
const noHorizontalOverflow = (p: Page): Promise<boolean> => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const insideViewport = async (p: Page, r: Rect): Promise<boolean> => {
  const vp = p.viewportSize()!;
  return r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= vp.width + 0.5 && r.y + r.height <= vp.height + 0.5;
};
const selectedStation = (p: Page): Promise<string | null> => p.locator('[data-selected-station]').first().getAttribute('data-selected-station');
const zoomOf = async (p: Page): Promise<number> => Number(await p.locator('[data-map-surface]').getAttribute('data-zoom'));
/** Tab을 눌러 가며 selector에 닿을 때까지(키보드만으로 닿는지 본다) */
async function tabTo(p: Page, selector: string, max = 24): Promise<number> {
  for (let i = 1; i <= max; i++) {
    await p.keyboard.press('Tab');
    if (await p.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector)) return i;
  }
  throw new Error(`Tab ${max}번 안에 닿지 않았어요: ${selector}`);
}
const fadesOf = async (p: Page): Promise<number> => (await dbg(p)).fades;

describe('1.6 첫 안내 카드', () => {
  it('처음 열면 카드가 뜨고 월드는 멈춰 있다. 카드는 화면 안에 들어오고, 시작을 누르면 걸을 수 있다 (1280×720)', async () => {
    const { ctx, page, errors } = await boot({ intro: true });
    await page.waitForSelector('[data-intro] .intro-card');
    const card = await rect(page, '.intro-card');
    expect(await insideViewport(page, card)).toBe(true);
    // 세 줄 안내와 세 가지 할 일
    expect(await page.locator('.intro-steps li').count()).toBe(3);
    const heads = await page.locator('.intro-head').allTextContents();
    expect(heads.map((t) => t.trim())).toEqual(['걷기', '열기', '지도']);
    expect(await page.getByRole('button', { name: /^시작/ }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: /전체 도전 보기/ }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: /소리 켜기/ }).first().isVisible()).toBe(true);
    // '시작'에 초점이 가 있다(Enter만 눌러도 시작할 수 있다)
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim().startsWith('시작'))).toBe(true);

    await waitReady(page);
    expect((await status(page)).paused).toBe(true); // 카드가 떠 있는 동안 월드는 멈춘다
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-intro]', { state: 'detached' });
    await waitChunks(page);
    expect((await status(page)).paused).toBe(false);
    const before = await pos(page);
    await page.keyboard.down('ArrowRight');
    await waitMoved(page, before, 60);
    await page.keyboard.up('ArrowRight');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('Esc로도 건너뛴다. 건너뛴 뒤 다시 열어도 카드가 또 뜨지 않는다', async () => {
    const { ctx, page, errors } = await boot({ intro: true });
    await page.waitForSelector('[data-intro]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-intro]', { state: 'detached' });
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => location.hash === '#/map');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    expect(await page.locator('[data-intro]').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('휴대폰 세로(430×932): 카드가 화면에 들어오고, 키 이름 대신 누르기로 말한다. 큰 글자에서도 들어온다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, intro: true });
    await page.waitForSelector('[data-intro] .intro-card');
    expect(await insideViewport(page, await rect(page, '.intro-card'))).toBe(true);
    const text = (await page.locator('.intro-steps').textContent()) ?? '';
    expect(text).not.toMatch(/\bE를|W A S D|M을/); // 키보드가 없는 화면에서는 키 이름을 말하지 않는다
    expect(text).toContain('누르면');
    expect(await noHorizontalOverflow(page)).toBe(true);

    // 큰 글자: 설정에서 키우고 '조작 안내 다시 보기'로 카드를 다시 연다
    await page.getByRole('button', { name: /^시작/ }).click();
    await page.waitForSelector('[data-intro]', { state: 'detached' });
    // 세로 화면에는 탭 막대에 설정이 없다: 위쪽의 톱니 단추로 닿고, 누를 수 있는 크기다
    const gear = await rect(page, '.hud-btn-settings');
    expect(Math.min(gear.width, gear.height)).toBeGreaterThanOrEqual(47.5);
    expect(await insideViewport(page, gear)).toBe(true);
    await page.getByRole('button', { name: '설정' }).click();
    await page.waitForFunction(() => location.hash === '#/settings');
    await page.locator('button[data-text-size="large"]').click();
    await page.getByRole('button', { name: /조작 안내 다시 보기/ }).click();
    await page.waitForSelector('[data-intro] .intro-card');
    const big = await rect(page, '.intro-card');
    expect(await insideViewport(page, big)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('20px');
    const start = await rect(page, '[data-intro] .btn-primary');
    expect(await insideViewport(page, start)).toBe(true); // 시작 단추가 카드 안에서 잘려 나가지 않는다
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("'전체 도전 보기'를 누르면 카드를 닫고 목록으로 간다(걷지 않고 모든 도전에 닿는다)", async () => {
    const { ctx, page, errors } = await boot({ intro: true });
    await page.waitForSelector('[data-intro]');
    await page.getByRole('button', { name: /전체 도전 보기/ }).click();
    await page.waitForFunction(() => location.hash === '#/list');
    expect(await page.locator('.quest-card').count()).toBe(QUEST_COUNT);
    expect(await page.locator('[data-intro]').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('3.7 악보 지도 (1280×720)', () => {
  it('M으로 열면 왼쪽에 지도, 오른쪽에 카드가 있고, 정거장 23곳이 모두 지도 안에 있다. 그림도 떠 있다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => location.hash === '#/map');
    await page.waitForSelector('[data-overlay="map"] .map-marker');
    const surface = await rect(page, '[data-map-surface]');
    const card = await rect(page, '.map-card');
    expect(surface.x + surface.width).toBeLessThanOrEqual(card.x + 1); // 왼쪽 지도, 오른쪽 카드(B01)
    const markers = await page.locator('.map-marker').count();
    expect(markers).toBe(23);
    expect(markers).toBe(map.stations.length);
    for (const s of map.stations) {
      const m = await rect(page, `[data-station="${s.stationId}"]`);
      const cx = m.x + m.width / 2;
      const cy = m.y + m.height / 2;
      expect(cx, s.stationId).toBeGreaterThan(surface.x);
      expect(cx, s.stationId).toBeLessThan(surface.x + surface.width);
      expect(cy, s.stationId).toBeGreaterThan(surface.y);
      expect(cy, s.stationId).toBeLessThan(surface.y + surface.height);
    }
    // 지도 그림(2048×1536)이 실제로 불러와졌다
    await page.waitForFunction(() => {
      const img = document.querySelector('img.map-image') as HTMLImageElement | null;
      return !!img && img.complete && img.naturalWidth === 2048 && img.naturalHeight === 1536;
    });
    // 어디든 처음부터 고를 수 있다: 잠긴 곳이 없다
    expect(await page.locator('.map-marker[disabled], .map-marker[aria-disabled="true"]').count()).toBe(0);
    expect(await zoomOf(page)).toBeCloseTo(1, 2);
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('내 위치 곁의 정거장을 하나씩 골라도 이름표와 표식이 서로 겹치지 않는다(처음 열면 합주 광장 곁에 서 있다)', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/map' });
    await page.waitForSelector('.map-marker');
    await page.waitForTimeout(500);
    /** 겹치는 쌍의 이름들. 1 px 안쪽으로 맞닿는 것은 겹침으로 세지 않는다 */
    const overlaps = (): Promise<string[]> =>
      page.evaluate(() => {
        const rect = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
        const sel = document.querySelector('.map-marker.is-selected');
        // 내 위치 표식과 정거장 점은 서로 맞닿아도 된다(정거장 곁에 서 있으면 당연히 가깝다). 이름표가 무엇을 가리는지를 본다
        const parts: Array<[string, DOMRect | null]> = [
          ['내 위치 이름표', rect(document.querySelector('.map-me-label'))],
          ['내 위치 표식', rect(document.querySelector('.map-me svg'))],
          ['고른 정거장 이름표', rect(sel?.querySelector('.map-marker-name') ?? null)],
          ['고른 정거장 점', rect(sel?.querySelector('.map-dot') ?? null)],
          ...Array.from(document.querySelectorAll('.map-region-label')).map((e): [string, DOMRect | null] => [`지역 ${e.textContent}`, e.getBoundingClientRect()]),
        ];
        const out: string[] = [];
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i]![1];
            const b = parts[j]![1];
            if (!a || !b) continue;
            if (parts[i]![0] === '내 위치 표식' && parts[j]![0] === '고른 정거장 점') continue;
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const hh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 1 && hh > 1) out.push(`${parts[i]![0]} × ${parts[j]![0]}`);
          }
        }
        return out;
      });
    expect(await overlaps()).toEqual([]); // 처음 상태
    const near = await page.evaluate(() => {
      const me = document.querySelector('.map-me svg')!.getBoundingClientRect();
      const mx = me.left + me.width / 2;
      const my = me.top + me.height / 2;
      return Array.from(document.querySelectorAll<HTMLElement>('.map-marker'))
        .map((el) => {
          const d = el.querySelector('.map-dot')!.getBoundingClientRect();
          return { id: el.getAttribute('data-station')!, dist: Math.hypot(d.left + d.width / 2 - mx, d.top + d.height / 2 - my) };
        })
        .filter((m) => m.dist < 220)
        .map((m) => m.id);
    });
    expect(near.length).toBeGreaterThanOrEqual(2);
    for (const id of near) {
      // 전체 보기에서는 가까운 정거장의 점이 서로 겹칠 수 있어서(N1·N2·N3) 가운데를 누르면 위의 점이 받는다.
      // 어느 점이 눌렸는지가 아니라 '고른 뒤의 이름표 자리'를 보는 시험이라 눌림을 그 점에 곧장 보낸다
      await page.locator(`[data-station="${id}"]`).dispatchEvent('click');
      await page.waitForSelector(`.map-marker.is-selected[data-station="${id}"]`);
      expect(await overlaps(), `정거장 ${id}을 골랐을 때`).toEqual([]);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('확대·축소 단추와 + − 0 키로 지도를 키우고 줄인다(끌지 않아도 된다)', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/map' });
    await page.waitForSelector('.map-marker');
    await page.getByRole('button', { name: '확대' }).click();
    const z1 = await zoomOf(page);
    expect(z1).toBeGreaterThan(1.5);
    await page.getByRole('button', { name: '확대' }).click();
    expect(await zoomOf(page)).toBeGreaterThan(z1);
    await page.getByRole('button', { name: '전체 보기' }).click();
    expect(await zoomOf(page)).toBeCloseTo(1, 2);
    // 키: 표시에 초점이 있을 때 +, −, 0
    await page.locator('.map-marker[tabindex="0"]').focus();
    await page.keyboard.press('+');
    expect(await zoomOf(page)).toBeGreaterThan(1.5);
    await page.keyboard.press('-');
    expect(await zoomOf(page)).toBeCloseTo(1, 1);
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('0');
    expect(await zoomOf(page)).toBeCloseTo(1, 2);
    // 많이 키우면 정거장 이름이 모두 나온다
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '확대' }).click();
    expect(await page.locator('.map-marker.has-label').count()).toBeGreaterThan(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("'걸어가기': 지도를 닫고 길을 따라 걸어가서 그 앞에서 멈춘다. 저절로 열지는 않는다 (H3)", async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await page.keyboard.press('KeyM');
    await page.waitForSelector('.map-marker');
    await page.locator('[data-station="H3"]').click();
    expect(await selectedStation(page)).toBe('H3');
    await page.locator('[data-action="walk"]').click();
    await page.waitForFunction(() => location.hash === '#/');
    await page.waitForSelector('.hud');
    await waitNear(page, 'H3', 90000);
    await waitStopped(page);
    const here = await pos(page);
    const stand = standOf(map.station('H3')!);
    expect(Math.hypot(here.x - stand.x, here.y - stand.y)).toBeLessThan(80);
    expect(await hashOf(page)).toBe('#/'); // 도착해도 열지 않는다
    expect(await page.locator('[data-overlay]').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("'바로 이동': 0.3초 어두워졌다 밝아지며 그 앞에 선다(K3 → 건반 늪). 움직임 줄이기에서는 어두워지지 않는다", async () => {
    const run = async (reducedMotion: 'reduce' | 'no-preference') => {
      const { ctx, page, errors } = await boot({ reducedMotion });
      await waitReady(page);
      await waitChunks(page);
      await page.waitForTimeout(600); // 처음 자리에 서는 연출이 끝난 뒤의 값을 기준으로 삼는다
      const before = await fadesOf(page);
      await page.keyboard.press('KeyM');
      await page.waitForSelector('.map-marker');
      await page.locator('[data-station="K3"]').click();
      expect(await selectedStation(page)).toBe('K3');
      await page.locator('[data-action="teleport"]').click();
      await page.waitForFunction(() => location.hash === '#/');
      await waitNear(page, 'K3', 30000);
      const s = await status(page);
      expect(s.regionId).toBe('key-marsh');
      await page.waitForFunction(() => document.querySelector('.hud-region-name')?.textContent?.trim() === '건반 늪', undefined, { timeout: 10000 });
      const here = await pos(page);
      const stand = standOf(map.station('K3')!);
      expect(Math.hypot(here.x - stand.x, here.y - stand.y)).toBeLessThan(40);
      expect(await hashOf(page)).toBe('#/');
      const after = await fadesOf(page);
      expect(errors).toEqual([]);
      await ctx.close();
      return after - before;
    };
    expect(await run('no-preference')).toBeGreaterThanOrEqual(1);
    expect(await run('reduce')).toBe(0);
  });

  it('키보드만으로 쓴다(W-4): M → Tab → 방향키로 정거장 고르기 → Tab → Enter(걸어가기)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await page.keyboard.press('KeyM');
    await page.waitForSelector('.map-marker');
    const first = await selectedStation(page); // 서 있는 자리에서 가장 가까운 정거장
    expect(first).not.toBeNull();
    // 첫 Tab은 고른 정거장 표시에 닿는다(표시 23개를 모두 거치지 않는다)
    expect(await tabTo(page, '.map-marker[aria-pressed="true"]', 3)).toBe(1);
    let moved: string | null = null;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      const now = await selectedStation(page);
      if (now !== first) {
        moved = now;
        break;
      }
    }
    expect(moved).not.toBeNull();
    // 방향키로 옮긴 곳으로 초점도 따라간다
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.station)).toBe(moved);
    // 아래 '걸어가기'까지 Tab으로 닿는다
    await tabTo(page, '[data-action="walk"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#/');
    await page.waitForSelector('.hud');
    await page.waitForFunction(() => (window as unknown as { __game: { world: { bridge: { status: { get(): { walking: boolean; near: unknown } } } } } }).__game.world.bridge.status.get().walking, undefined, { timeout: 30000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('지도에서 과제를 바로 시작할 수 있다(3-7): H2에서 Q02의 시작 링크를 누르면 패널이 열린다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/map' });
    await page.waitForSelector('.map-marker');
    await page.locator('[data-station="H2"]').click();
    const start = page.locator('.map-quest[data-quest="rhythm.rest-in-a-bar"] a.btn');
    await start.waitFor();
    await start.click();
    await page.waitForFunction(() => location.hash === '#/q/rhythm.rest-in-a-bar/quarter-rest');
    await page.waitForSelector('.panel-shell h1');
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe('쉼이 있는 한 마디');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('W-2 삼중 진입: 지도, 목록, 직접 주소로도 같은 패널이 열린다 (Q01, Q02)', () => {
  // 걸어가서 여는 길은 world.flow.ts의 W-1 시험이 H1과 H2로 확인한다. 여기서는 나머지 세 길을 본다
  const QUESTS = [
    { quest: 'pitch.same-note-two-clefs', variant: 'middle-c', station: 'H1', title: '같은 음의 자리 찾기' },
    { quest: 'rhythm.rest-in-a-bar', variant: 'quarter-rest', station: 'H2', title: '쉼이 있는 한 마디' },
  ] as const;
  const panelTitle = async (page: Page): Promise<string> => {
    await page.waitForSelector('.panel-shell h1');
    return ((await page.locator('.panel-shell h1').first().textContent()) ?? '').trim();
  };

  for (const t of QUESTS) {
    const hash = `#/q/${t.quest}/${t.variant}`;

    it(`${t.station} ${t.quest}: 지도에서 정거장을 골라 시작 링크로 연다`, async () => {
      const { ctx, page, errors } = await boot({ hash: '#/map' });
      await page.waitForSelector('.map-marker');
      await page.locator(`[data-station="${t.station}"]`).click();
      const start = page.locator(`.map-quest[data-quest="${t.quest}"] a.btn`);
      await start.waitFor();
      await start.click();
      await page.waitForFunction((want) => location.hash === want, hash);
      expect(await panelTitle(page)).toBe(t.title);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    it(`${t.station} ${t.quest}: 목록에서 '열기'를 눌러 연다`, async () => {
      const { ctx, page, errors } = await boot({ hash: '#/list' });
      await page.waitForSelector(`.quest-card[data-quest="${t.quest}"]`);
      const open = page.locator(`.quest-card[data-quest="${t.quest}"] .variant-row[data-variant="${t.variant}"] a.btn`);
      await open.click();
      await page.waitForFunction((want) => location.hash === want, hash);
      expect(await panelTitle(page)).toBe(t.title);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    it(`${t.station} ${t.quest}: 직접 주소로 새 저장에서 바로 열린다`, async () => {
      const { ctx, page, errors } = await boot({ hash });
      expect(await panelTitle(page)).toBe(t.title);
      expect(await hashOf(page)).toBe(hash);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('7.9 3번 200% 확대: 폭 640에서 세계 화면과 겹침 화면이 잘리지 않는다', () => {
  const SCREENS = [
    ['640×360 (1280×720의 200%)', 640, 360],
    ['640×400 (1280×800의 200%)', 640, 400],
  ] as const;
  const ROUTES = [
    ['걷는 화면', '#/'],
    ['지도', '#/map'],
    ['목록', '#/list'],
    ['설정', '#/settings'],
    ['도움', '#/help'],
  ] as const;
  const CONTROLS = 'button, a[href], input, select, textarea, [role="slider"], [role="switch"], summary';

  for (const [screen, w, hgt] of SCREENS) {
    for (const [name, hash] of ROUTES) {
      it(`${screen} · ${name}: 가로로 넘치지 않고, 보이는 단추가 모두 화면 폭 안에 있다`, async () => {
        const { ctx, page, errors } = await boot({ w, h: hgt, hash });
        if (hash === '#/') await waitReady(page);
        await page.waitForTimeout(400);
        const report = await page.evaluate((sel) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < -1 || r.right > window.innerWidth + 1) out.push(`${el.className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
          }
          // 걷는 화면의 겹쳐 올린 막대(HUD)는 세로로도 화면 안에 있어야 한다. 다른 화면은 아래로 스크롤해도 된다
          const hud = document.querySelector('[data-hud]');
          const hudOut: string[] = [];
          if (hud && getComputedStyle(hud).display !== 'none') {
            for (const el of hud.querySelectorAll<HTMLElement>('button, a[href]')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              if (r.top < -1 || r.bottom > window.innerHeight + 1) hudOut.push(`${el.className || el.tagName} ${Math.round(r.top)}..${Math.round(r.bottom)}`);
            }
          }
          return { docW: document.documentElement.scrollWidth, innerW: window.innerWidth, out, hudOut };
        }, CONTROLS);
        expect(report.docW).toBeLessThanOrEqual(report.innerW);
        expect(report.out).toEqual([]);
        expect(report.hudOut).toEqual([]);
        expect(errors).toEqual([]);
        await ctx.close();
      });
    }
  }
});

describe('7.9 3번 200% 확대: 첫 안내 카드', () => {
  for (const [screen, w, hgt] of [
    ['640×360', 640, 360],
    ['640×400', 640, 400],
  ] as const) {
    it(`${screen}: 카드가 가로로 넘치지 않고, '시작'까지 닿아 누를 수 있다`, async () => {
      const { ctx, page, errors } = await boot({ w, h: hgt, intro: true });
      await page.waitForSelector('[data-intro]');
      await page.waitForTimeout(300);
      expect(await noHorizontalOverflow(page)).toBe(true);
      const start = page.locator('[data-intro] button', { hasText: '시작' }).first();
      await start.scrollIntoViewIfNeeded();
      const box = await start.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(w + 0.5);
      expect(box!.y).toBeGreaterThanOrEqual(-0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(hgt + 0.5);
      await start.click();
      await page.waitForSelector('[data-intro]', { state: 'detached' });
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('7.9 4번 색 없이 구분: 세계 화면, 지도, 목록, 설정', () => {
  it('정거장 표지는 이름을 글자로 가지고, 회색조(색 없는 시야) 화면을 증거로 남긴다', async () => {
    const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
    fs.mkdirSync(SHOTS, { recursive: true });
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    const go = async (hash: string, ready: string) => {
      await page.evaluate((hh) => { location.hash = hh; }, hash);
      await page.waitForSelector(ready, { state: 'visible' });
      await page.waitForTimeout(500);
    };
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'phase3-village-grayscale.png') });
    await go('#/map', '.map-marker');
    // 색이 아니라 글자로 전해진다: 정거장 23곳 모두 이름이 있고, 지역 이름도 글자다
    const names = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-station]')).map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()));
    expect(names.length).toBeGreaterThanOrEqual(23);
    expect(names.filter((n) => n.length === 0)).toEqual([]);
    await page.screenshot({ path: path.join(SHOTS, 'phase3-map-grayscale.png') });
    await go('#/list', '.quest-card');
    await page.screenshot({ path: path.join(SHOTS, 'phase3-list-grayscale.png') });
    await go('#/settings', '#set-save');
    await page.screenshot({ path: path.join(SHOTS, 'phase3-settings-grayscale.png') });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('7.6, 7.9 8번 누르는 대상의 크기와 이름: 세계 화면과 겹침 화면 (폭 412, 터치)', () => {
  const ROUTES = [
    ['첫 안내 카드', '#/', true],
    ['걷는 화면', '#/', false],
    ['지도', '#/map', false],
    ['목록', '#/list', false],
    ['설정', '#/settings', false],
    ['도움', '#/help', false],
  ] as const;
  for (const [name, hash, intro] of ROUTES) {
    it(`${name}: 단추, 스위치, 슬라이더가 48px 이상이고 이름이 있다`, async () => {
      const { ctx, page, errors } = await boot({ w: 412, h: 915, touch: true, hash, intro });
      if (intro) await page.waitForSelector('[data-intro]');
      else if (hash === '#/') await waitReady(page);
      await page.waitForTimeout(400);
      const rows = await page.evaluate(() => {
        const out: Array<{ name: string; w: number; h: number; role: string; cls: string }> = [];
        for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, a.nav-link, a.brand, [role="slider"], [role="switch"], summary, input[type="range"]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const labelledBy = el.getAttribute('aria-labelledby');
          const byId = labelledBy ? (labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ')) : '';
          const labels = (el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels ?? []).map((l) => l.textContent ?? '').join(' ') : '';
          const nm = (el.getAttribute('aria-label') ?? (byId || labels || el.innerText) ?? '').replace(/\s+/g, ' ').trim();
          out.push({ name: nm, w: Math.round(r.width), h: Math.round(r.height), role: el.getAttribute('role') ?? el.tagName.toLowerCase(), cls: String(el.className) });
        }
        return out;
      });
      expect(rows.length).toBeGreaterThan(2);
      expect(rows.filter((r) => !r.name)).toEqual([]);
      expect(rows.filter((r) => r.w < 48 || r.h < 48)).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('3.7 악보 지도: 휴대폰 세로 (430×932)', () => {
  it('지도 아래에 카드가 이어지고, 가로로 넘치지 않으며, 표시와 단추를 누를 수 있는 크기다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, hash: '#/map' });
    await page.waitForSelector('.map-marker');
    const surface = await rect(page, '[data-map-surface]');
    const card = await rect(page, '.map-card');
    expect(surface.y + surface.height).toBeLessThanOrEqual(card.y + 1); // 위 지도, 아래 카드
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(surface.x).toBeGreaterThanOrEqual(0);
    expect(surface.x + surface.width).toBeLessThanOrEqual(430.5);
    for (const sel of ['.map-marker', '.map-control', '[data-action="walk"]', '[data-action="teleport"]']) {
      for (const el of await page.locator(sel).all()) {
        const b = await el.boundingBox();
        expect(b, sel).not.toBeNull();
        expect(Math.min(b!.width, b!.height), sel).toBeGreaterThanOrEqual(47.5); // 48px 이상(7.6)
      }
    }
    // 눌러서 고르고 '바로 이동'까지 닿는다
    await page.locator('[data-station="S2"]').click();
    expect(await selectedStation(page)).toBe('S2');
    expect(await page.locator('[data-action="teleport"]').isVisible()).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('7.8 설정 화면', () => {
  it('큰 글자(본문 16→20px)와 움직임 줄이기가 바로 적용되고, 가로로 넘치지 않는다 (1280 / 430)', async () => {
    for (const [w, hgt, touch] of [
      [1280, 720, false],
      [430, 932, true],
    ] as const) {
      const { ctx, page, errors } = await boot({ w, h: hgt, touch, hash: '#/settings' });
      await page.waitForSelector('.settings-section');
      expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px');
      await page.locator('button[data-text-size="large"]').click();
      expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('20px');
      expect(await page.evaluate(() => document.documentElement.dataset.textSize)).toBe('large');
      expect(await page.locator('button[data-text-size="large"]').getAttribute('aria-pressed')).toBe('true');
      expect(await noHorizontalOverflow(page)).toBe(true);

      const sw = page.locator('#set-reduce');
      expect(await sw.getAttribute('aria-checked')).toBe('false');
      await sw.click();
      expect(await sw.getAttribute('aria-checked')).toBe('true');
      expect(await page.evaluate(() => document.documentElement.dataset.reducedMotion)).toBe('true');
      await page.locator('button[data-text-size="normal"]').click();
      expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px');
      expect(errors, `${w}×${hgt}`).toEqual([]);
      await ctx.close();
    }
  });

  it('소리 크기 슬라이더는 방향키로 5%씩 바뀌고, 줄이기·키우기 단추도 된다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/settings' });
    await page.waitForSelector('#set-master');
    const input = page.locator('#set-master');
    const v0 = Number(await input.inputValue());
    await input.focus();
    await page.keyboard.press('ArrowLeft');
    expect(Number(await input.inputValue())).toBe(v0 - 5);
    expect(await input.getAttribute('aria-valuetext')).toBe(`${v0 - 5}퍼센트`);
    await page.getByRole('button', { name: '전체 소리 크기 키우기' }).click();
    expect(Number(await input.inputValue())).toBeGreaterThan(v0 - 5);
    for (const btn of await page.locator('.slider-row button').all()) {
      const b = (await btn.boundingBox())!;
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(47.5);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('7.7 목록 걸러내기 (430×932)', () => {
  it('지역·주제·아직 열어 보지 않은 것으로 거르고, 거르기를 풀면 전부 다시 보인다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, hash: '#/list' });
    await page.waitForSelector('.quest-card');
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(await page.locator('.quest-card').count()).toBe(QUEST_COUNT);
    // 지역으로 거르면 그 지역 정거장에 놓인 과제 가운데 만들어진 것만 남는다(박자 강가: Q02와 Q03). 배치는 지역 파일에서 읽는다
    const river = builtQuestsIn('beat-river');
    expect(river.length).toBeGreaterThan(1);
    expect(river.length).toBeLessThan(QUEST_COUNT);
    await page.locator('[data-filter-region="beat-river"]').click();
    expect(await page.locator('.quest-card').count()).toBe(river.length);
    expect(await page.locator('.filter-status').getAttribute('data-count')).toBe(String(river.length));
    expect((await page.locator('.quest-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.quest))).sort()).toEqual([...river]);
    const riverText = await page.locator('.quest-list').textContent();
    expect(riverText ?? '').toContain('쉼이 있는 한 마디');
    expect(riverText ?? '').toContain('짧은 음과 셋잇단음');
    // 조건을 겹쳐 맞는 도전이 없으면 비었다고 말하고(음계 길에는 음계 과제뿐이라 '리듬'과 겹치면 없다), 거르기를 풀면 모두 돌아온다.
    // 5단계 앞에는 아직 만들지 않은 지역(종나무 숲)을 눌러 이것을 봤지만, 지금은 모든 지역에 만들어진 과제가 하나 이상 있다
    // 음계 길에 놓인 과제는 손으로 적지 않고 내용 파일에서 읽는다(7단계에서 음계 과제가 늘자 ['scale.major']로 적어 둔 줄이 어긋났다)
    const trail = builtQuestsIn('scale-trail');
    expect(trail.length).toBeGreaterThan(0);
    expect(trail.every((id) => id.startsWith('scale.'))).toBe(true);
    await page.locator('[data-filter-region="scale-trail"]').click();
    expect(await page.locator('.quest-card').count()).toBe(trail.length);
    await page.locator('[data-filter-tag="rhythm"]').click();
    expect(await page.locator('[data-empty]').count()).toBe(1);
    expect(await page.locator('.quest-card').count()).toBe(0);
    expect(await page.locator('.filter-status').getAttribute('data-count')).toBe('0');
    await page.locator('[data-filter-clear]').click();
    expect(await page.locator('.quest-card').count()).toBe(QUEST_COUNT);
    expect(await page.locator('[data-empty]').count()).toBe(0);
    // 아직 열어 보지 않은 것: 처음에는 모두, 하나를 열고 돌아오면 그 과제가 빠진다
    await page.locator('[data-filter-unopened]').click();
    expect(await page.locator('.quest-card').count()).toBe(QUEST_COUNT);
    await page.locator('[data-filter-unopened]').click();
    for (const el of await page.locator('.chip-button').all()) {
      const b = (await el.boundingBox())!;
      expect(b.height, 'chip').toBeGreaterThanOrEqual(47.5);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
