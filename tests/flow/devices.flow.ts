// 8-3 기준 기기 점검의 자동 부분(설계서 10.8, 8.6, 7.1, 7.6): 실제 기기를 흉내 내는 Chrome(화면 크기, 화소 비율, 터치, 모바일 화면, 화면 가장자리 여백)으로
//  1) 소리 장치가 멈춘 뒤 다시 깨어나는지(8.6),
//  2) 화면 크기마다 보이는 범위와 화면 구성이 설계대로인지, 가로로 넘치거나 손이 안 닿는 곳이 없는지(7.1, 7.6),
//  3) 세로·가로를 돌려도 하던 일이 그대로인지(10.8),
//  4) 노치와 홈 막대가 있는 폰에서 눌러야 할 것이 그 영역에 들어가지 않는지,
//  5) 고해상도 화면에서 캔버스를 어떤 크기로 그리는지(사실을 남긴다)를 본다.
//  6) 작업대 조작 막대가 월드를 덮는 정도를 설치물 20개와 아홉 화면에서 재서 남긴다(막대는 바꾸지 않았다, D-288).
// 이 시험이 하지 않는 것(실제 기기의 소리, 손가락, 무음 스위치, 주소창·홈 막대의 실제 높이, 프레임 속도)은 docs/device-checklist.md의 손 점검표에 있다.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserContext, CDPSession, Page } from 'playwright-core';
import { controlsReport, overflowReport, reachReport } from './a11yTools';
import { dbg, insetOf, modeOf, pos, status, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, type Dbg, type Game } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { installAudioCounter } from './inputTools';
import { cellButton, feedbackState, material } from './panelTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

interface Device {
  name: string;
  w: number;
  h: number;
  /** 화소 비율(고해상도 화면은 2나 3) */
  dpr: number;
  touch: boolean;
}

/** 화면 가장자리 여백(노치, 상태 막대, 홈 막대). 화면 px */
interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** 노치가 있는 폰(아이폰 14 Pro급)의 여백: 세로는 위 59·아래 34, 가로는 좌우 59·아래 21 */
const NOTCH_PORTRAIT: Insets = { top: 59, right: 0, bottom: 34, left: 0 };
const NOTCH_LANDSCAPE: Insets = { top: 0, right: 59, bottom: 21, left: 59 };

interface Booted {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
  cdp: CDPSession;
}

/** 기기를 흉내 낸 화면으로 앱을 연다. 터치 기기는 모바일 화면(주소창 없는 레이아웃 폭)으로 연다 */
async function boot(
  d: Pick<Device, 'w' | 'h'> & Partial<Pick<Device, 'dpr' | 'touch'>>,
  opts: { hash?: string; audio?: boolean; insets?: Insets; keepIntro?: boolean } = {},
): Promise<Booted> {
  const touch = d.touch ?? false;
  const ctx = await h.browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr ?? 1,
    hasTouch: touch,
    isMobile: touch,
    locale: 'ko-KR',
    reducedMotion: 'no-preference',
  });
  if (opts.audio) await installAudioCounter(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const cdp = await ctx.newCDPSession(page);
  const b: Booted = { ctx, page, errors, cdp };
  if (opts.insets) await setInsets(b, opts.insets);
  await page.goto(h.url + (opts.hash ?? ''));
  if (opts.keepIntro) await page.waitForSelector('[data-intro]', { timeout: 30000 });
  else await skipIntro(page, { tap: touch });
  return b;
}

/** 화면 가장자리 여백을 흉내 낸다(CSS의 env(safe-area-inset-*)가 이 값을 읽는다) */
async function setInsets(b: Booted, insets: Insets): Promise<void> {
  await b.cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
}

const audioStates = (p: Page): Promise<string[]> => p.evaluate(() => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.map((c) => c.state));

/** 7.1: 가로 화면은 세로 720 월드 px가, 세로 화면은 가로 540 월드 px가 보이도록 배율을 정한다 */
const expectedZoom = (w: number, hh: number): number => (w >= hh ? hh / 720 : w / 540);

/** 카메라가 가만히 설 때까지(느린 헤드리스 Chrome에서는 시간이 아니라 상태로 기다린다) */
async function settledCamera(page: Page): Promise<Dbg> {
  let prev = await dbg(page);
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(150);
    const cur = await dbg(page);
    const still = Math.abs(cur.center.x - prev.center.x) < 0.5 && Math.abs(cur.center.y - prev.center.y) < 0.5 && Math.abs(cur.zoom - prev.zoom) < 0.001 && cur.pending.length === 0 && !cur.transitioning;
    if (still) return cur;
    prev = cur;
  }
  throw new Error('카메라가 가만히 서지 않아요');
}

/** 화면을 돌린다: 새 크기로 바꾸고(노치 폰이면 가장자리 여백도 바꾼다), 브라우저가 새 크기를 알고 두 프레임이 그려질 때까지 기다린다 */
async function rotate(b: Booted, w: number, hh: number, insets?: Insets): Promise<void> {
  await b.page.setViewportSize({ width: w, height: hh });
  if (insets) await setInsets(b, insets);
  await b.page.waitForFunction(([ww, hg]) => window.innerWidth === ww && window.innerHeight === hg, [w, hh] as const, { timeout: 15000 });
  await b.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** 월드의 카메라가 새 방향의 배율에 닿을 때까지 */
const waitZoom = (p: Page, zoom: number) =>
  p.waitForFunction(
    (z) => {
      const d = (window as unknown as { __game?: Game }).__game?.world.debugState();
      return !!d && Math.abs(d.zoom - z) < 0.005;
    },
    zoom,
    { timeout: 20000 },
  );

interface Box {
  name: string;
  l: number;
  t: number;
  r: number;
  b: number;
}
/** 탐험 화면의 덩어리(지역 이름, 합주 층수, 메뉴, 탭 막대, 안내 칩, 열기 단추) 가운데 지금 보이는 것의 사각형 */
const hudBoxes = (p: Page): Promise<Box[]> =>
  p.evaluate(() => {
    const out: Array<{ name: string; l: number; t: number; r: number; b: number }> = [];
    for (const [name, sel] of [
      ['지역 이름', '.hud-region'],
      ['합주 층수', '.hud-ensemble'],
      ['메뉴', '.hud-menu'],
      ['탭 막대', '.hud-tabs'],
      ['안내 칩', '.hud-chip'],
      ['열기 단추', '.hud-interact'],
    ] as const) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      out.push({ name, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    return out;
  });

const overlaps = (a: Box, b: Box): boolean => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

/** 탐험 화면의 덩어리가 서로 겹치지 않고 모두 화면 안에 있는지. 문제가 있으면 사람이 읽을 문장 목록을 돌려준다 */
async function hudProblems(page: Page): Promise<string[]> {
  const boxes = await hudBoxes(page);
  const v = page.viewportSize()!;
  const out: string[] = [];
  for (const x of boxes) if (x.l < -0.5 || x.t < -0.5 || x.r > v.width + 0.5 || x.b > v.height + 0.5) out.push(`${x.name}이(가) 화면 밖으로 나간다`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i]!, boxes[j]!)) out.push(`${boxes[i]!.name}과(와) ${boxes[j]!.name}이(가) 겹친다`);
  return out;
}

/**
 * 가장자리 여백 안에 들어간 누르는 대상. 좌우는 세로로 화면에 보이는 모든 것을, 위와 아래는 밀어서 닿는 줄 밖의 것을 본다.
 * (옆이나 위아래로 미는 영역 안의 것은 그 영역 자체가 여백 안쪽에 있으면 손이 닿는다)
 */
const intrusions = (p: Page, ins: Insets): Promise<string[]> =>
  p.evaluate(
    ({ ins, controls }) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const scrolls = (el: HTMLElement, axis: 'x' | 'y'): boolean => {
        for (let q = el.parentElement; q; q = q.parentElement) {
          const cs = getComputedStyle(q);
          const o = axis === 'x' ? cs.overflowX : cs.overflowY;
          const more = axis === 'x' ? q.scrollWidth > q.clientWidth + 1 : q.scrollHeight > q.clientHeight + 1;
          if ((o === 'auto' || o === 'scroll') && more) return true;
        }
        return false;
      };
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(controls)) {
        if (el.closest('[inert]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        const name = (el.getAttribute('aria-label') ?? el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
        const where = `${name || el.tagName}[${String(el.className).slice(0, 22)}] ${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)}`;
        const seenY = r.bottom > 0 && r.top < H;
        if (seenY && !scrolls(el, 'x') && (r.left < ins.left - 1 || r.right > W - ins.right + 1)) out.push(`옆: ${where}`);
        if (!scrolls(el, 'y') && r.bottom > 0 && r.top < ins.top - 1) out.push(`위: ${where}`);
        if (!scrolls(el, 'y') && r.top < H && r.bottom > H - ins.bottom + 1) out.push(`아래: ${where}`);
      }
      return out;
    },
    { ins, controls: 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="slider"], [role="switch"], [role="tab"], [role="button"]' },
  );

// ───────────────────────────────────────────────────────────────────────────

describe('8.6 소리 장치가 멈추면(전화, 화면 잠금, 앱 전환) 다음 누르기에서 다시 깨어난다', () => {
  it('휴대폰(430×932, 터치): 소리를 켠 뒤 장치를 멈추면 조용해지고, 화면을 한 번 누르면 다시 소리가 나갈 수 있는 상태가 된다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, dpr: 3, touch: true }, { audio: true });
    await waitReady(page);
    expect(await audioStates(page), '소리를 켜기 전에는 장치가 없다(W-11)').toEqual([]);
    await page.getByRole('button', { name: /소리 켜기/ }).first().tap();
    await page.waitForFunction(() => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.some((c) => c.state === 'running'), undefined, { timeout: 20000 });
    // 휴대폰이 전화나 화면 잠금으로 장치를 멈춘 것처럼 멈춘다. 브라우저는 저절로 되살리지 않는다
    await page.evaluate(() => Promise.all((window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.map((c) => c.suspend())));
    expect(await audioStates(page)).not.toContain('running');
    await page.waitForTimeout(600);
    expect(await audioStates(page), '누르기 전에는 멈춘 채다').not.toContain('running');
    // 월드의 빈 곳을 한 번 누른다: 걷기 명령이기도 하지만, 소리 장치도 깨어나야 한다
    await page.touchscreen.tap(215, 300);
    await page.waitForFunction(() => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts.some((c) => c.state === 'running'), undefined, { timeout: 15000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────

const DEVICES: Device[] = [
  { name: 'PC 1600×1000', w: 1600, h: 1000, dpr: 1, touch: false },
  { name: '노트북 1366×768', w: 1366, h: 768, dpr: 1, touch: false },
  { name: '태블릿 가로 1280×800', w: 1280, h: 800, dpr: 2, touch: true },
  { name: '태블릿 가로 1180×820', w: 1180, h: 820, dpr: 2, touch: true },
  { name: '태블릿 세로 820×1180', w: 820, h: 1180, dpr: 2, touch: true },
  { name: '휴대폰 세로 430×932', w: 430, h: 932, dpr: 3, touch: true },
  { name: '휴대폰 가로 932×430', w: 932, h: 430, dpr: 3, touch: true },
  { name: '작은 휴대폰 세로 360×640', w: 360, h: 640, dpr: 2, touch: true },
  { name: '작은 휴대폰 가로 640×360', w: 640, h: 360, dpr: 2, touch: true },
];

interface Row {
  device: string;
  dpr: number;
  zoom: number;
  view: string;
  chunks: number;
  canvas: string;
  hud: string;
}
const rows: Row[] = [];

describe('7.1, 7.6 기기 화면 크기별 훑기: 보이는 범위, 화면 구성, 누르는 대상', () => {
  for (const d of DEVICES) {
    it(`${d.name}(화소 비율 ${d.dpr}${d.touch ? ', 터치' : ''})`, async () => {
      const { ctx, page, errors } = await boot(d);
      await waitReady(page);
      await waitChunks(page);
      const portrait = d.h > d.w;
      const zoom = expectedZoom(d.w, d.h);

      // 7.1 보이는 범위: 가로는 세로 720, 세로는 가로 540. 올라온 바닥 조각은 12장 이하(10.7)
      const info = await dbg(page);
      expect(info.zoom).toBeCloseTo(zoom, 2);
      expect(Math.abs(info.view.w - d.w / zoom)).toBeLessThan(1.5);
      expect(Math.abs(info.view.h - d.h / zoom)).toBeLessThan(1.5);
      if (portrait) expect(Math.abs(info.view.w - 540)).toBeLessThan(1.5);
      else expect(Math.abs(info.view.h - 720)).toBeLessThan(1.5);
      expect(info.chunks.length).toBeGreaterThanOrEqual(4);
      expect(info.chunks.length).toBeLessThanOrEqual(12);

      // 캔버스는 화면을 가득 채우고, 화소 비율은 기기가 말하는 값이다. 안쪽 크기는 사실로 남긴다
      const canvas = await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        return { cw: c.width, ch: c.height, w: c.clientWidth, h: c.clientHeight, dpr: window.devicePixelRatio };
      });
      expect(canvas.dpr).toBe(d.dpr);
      expect(canvas.w).toBe(d.w);
      expect(canvas.h).toBe(d.h);
      // 끝까지 당겨도 브라우저가 새로 고치지 않는다(속성이 걸렸는지만 본다. 실제 당기기는 실기기에서 본다)
      expect(await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY])).toEqual(['none', 'none']);

      // 7.6 화면 구성: 세로 화면에만 아래 탭 막대가 있다
      expect(await page.locator('.hud-tabs').isVisible()).toBe(portrait);
      expect(await page.locator('.hud-interact').isVisible()).toBe(false); // 곁에 정거장이 없다

      // 가로로 넘치지 않고, 눌러야 할 것이 모두 화면 안에 있고, 48 px 이상이다(탭 막대는 64 px)
      const over = await overflowReport(page, '.hud');
      expect(over.out, '화면 밖으로 나간 단추').toEqual([]);
      expect(over.docW).toBeLessThanOrEqual(over.innerW);
      const small = (await controlsReport(page, '.hud')).filter((c) => c.w < 48 || c.h < 48);
      expect(small.map((c) => `${c.name} ${c.w}×${c.h}`), '48 px보다 작은 단추').toEqual([]);
      if (portrait) for (const t of await page.locator('.hud-tab').all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(64);
      expect(await hudProblems(page)).toEqual([]);

      // 정거장 곁에 서면: 가로는 안내 칩, 세로는 칩과 64 px 열기 단추가 뜬다. 서로, 그리고 메뉴나 탭 막대와 겹치지 않는다
      expect(await teleport(page, 'H1')).toBe(true);
      await waitNear(page, 'H1', 20000);
      if (portrait) {
        await page.waitForSelector('.hud-interact', { state: 'visible' });
        const box = (await page.locator('.hud-interact').boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(64);
        expect(box.height).toBeGreaterThanOrEqual(64);
      } else {
        await page.waitForSelector('.hud-chip', { state: 'visible' });
        expect(await page.locator('.hud-interact').isVisible()).toBe(false);
      }
      const chip = (await page.locator('.hud-chip').boundingBox())!;
      expect(chip.height).toBeGreaterThanOrEqual(48);
      expect(await hudProblems(page)).toEqual([]);
      expect((await overflowReport(page, '.hud')).out).toEqual([]);

      rows.push({
        device: d.name,
        dpr: d.dpr,
        zoom: Math.round(info.zoom * 1000) / 1000,
        view: `${Math.round(info.view.w)}×${Math.round(info.view.h)}`,
        chunks: info.chunks.length,
        canvas: `${canvas.cw}×${canvas.ch}`,
        hud: portrait ? '탭 막대 + 열기 단추' : '메뉴 + 안내 칩',
      });
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  it('측정한 표(문서에 옮긴다)', () => {
    console.log('[기기 표]\n' + rows.map((r) => `${r.device} | 화소 ${r.dpr} | 배율 ${r.zoom} | 보이는 범위 ${r.view} | 조각 ${r.chunks} | 캔버스 안쪽 ${r.canvas} | ${r.hud}`).join('\n'));
    expect(rows.length).toBe(DEVICES.length);
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('10.8 화면 회전: 세로↔가로로 돌려도 하던 일이 그대로다', () => {
  it('휴대폰(430×932 ↔ 932×430): 정거장 곁에 선 채로 돌려도 자리와 곁의 정거장이 그대로이고, 배율과 화면 구성이 새 방향에 맞게 바뀐다. 연달아 돌려도 같다', async () => {
    const b = await boot({ w: 430, h: 932, dpr: 3, touch: true }, { insets: NOTCH_PORTRAIT });
    const { page, errors } = b;
    await waitReady(page);
    await waitChunks(page);
    expect(await teleport(page, 'H1')).toBe(true);
    await waitNear(page, 'H1', 20000);
    await page.waitForSelector('.hud-interact', { state: 'visible' });
    const start = await pos(page);

    // 가로로
    await rotate(b, 932, 430, NOTCH_LANDSCAPE);
    await waitZoom(page, expectedZoom(932, 430));
    const land = await settledCamera(page);
    expect(Math.abs(land.view.h - 720)).toBeLessThan(1.5);
    expect(await page.locator('.hud-tabs').isVisible()).toBe(false);
    expect(await page.locator('.hud-interact').isVisible()).toBe(false);
    await page.waitForSelector('.hud-chip', { state: 'visible' });
    const mid = await pos(page);
    expect(Math.hypot(mid.x - start.x, mid.y - start.y), '돌렸다고 캐릭터가 움직이지 않는다').toBeLessThan(1);
    expect((await status(page)).near?.stationId).toBe('H1');
    const sc = toScreen(land, mid.x, mid.y);
    expect(sc.x).toBeGreaterThan(0);
    expect(sc.x).toBeLessThan(932);
    expect(sc.y).toBeGreaterThan(0);
    expect(sc.y).toBeLessThan(430);
    expect((await overflowReport(page, '.hud')).out).toEqual([]);
    expect(await hudProblems(page)).toEqual([]);
    expect(await intrusions(page, NOTCH_LANDSCAPE)).toEqual([]);

    // 다시 세로로
    await rotate(b, 430, 932, NOTCH_PORTRAIT);
    await waitZoom(page, expectedZoom(430, 932));
    const back = await settledCamera(page);
    expect(Math.abs(back.view.w - 540)).toBeLessThan(1.5);
    expect(await page.locator('.hud-tabs').isVisible()).toBe(true);
    await page.waitForSelector('.hud-interact', { state: 'visible' });
    const end = await pos(page);
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1);
    expect((await status(page)).near?.stationId).toBe('H1');
    expect((await overflowReport(page, '.hud')).out).toEqual([]);
    expect(await hudProblems(page)).toEqual([]);
    expect(await intrusions(page, NOTCH_PORTRAIT)).toEqual([]);

    // 기다리지 않고 연달아 돌려도(네 번) 오류가 없고, 마지막 방향에 맞게 서고, 캐릭터는 그대로다
    for (const [w, hh, ins] of [
      [932, 430, NOTCH_LANDSCAPE],
      [430, 932, NOTCH_PORTRAIT],
      [932, 430, NOTCH_LANDSCAPE],
      [430, 932, NOTCH_PORTRAIT],
    ] as const) {
      await page.setViewportSize({ width: w, height: hh });
      await setInsets(b, ins);
    }
    await rotate(b, 430, 932, NOTCH_PORTRAIT);
    await waitZoom(page, expectedZoom(430, 932));
    const quick = await settledCamera(page);
    expect(Math.abs(quick.view.w - 540)).toBeLessThan(1.5);
    const last = await pos(page);
    expect(Math.hypot(last.x - start.x, last.y - start.y)).toBeLessThan(1);
    expect(await page.locator('.hud-tabs').isVisible()).toBe(true);
    expect((await overflowReport(page, '.hud')).out).toEqual([]);
    expect(await hudProblems(page)).toEqual([]);
    expect(await intrusions(page, NOTCH_PORTRAIT)).toEqual([]);
    expect(errors).toEqual([]);
    await b.ctx.close();
  });

  it('태블릿(1180×820 ↔ 820×1180): 패널에서 한 칸을 채운 채로 돌려도 풀던 상태가 그대로이고, 돌아온 뒤 끝까지 풀어 통과한다', async () => {
    const b = await boot({ w: 1180, h: 820, dpr: 2, touch: true }, { hash: '#/q/rhythm.rest-in-a-bar/quarter-rest' });
    const { page, errors } = b;
    const HASH = '#/q/rhythm.rest-in-a-bar/quarter-rest';
    await page.waitForSelector('button.cell-mine', { timeout: 30000 });
    expect(await page.locator('button.cell-mine').count()).toBe(4);
    const empty = await cellButton(page, 0).getAttribute('aria-label');
    expect(empty).toContain('비어 있음');
    await material(page, 'C4').tap();
    await cellButton(page, 0).tap();
    const placed = await cellButton(page, 0).getAttribute('aria-label');
    expect(placed, '첫 칸이 채워졌다').not.toContain('비어 있음');

    // 세로로 돌린다: 같은 패널, 같은 칸, 가로로 넘치지 않고 누를 곳이 48 px 이상이다
    await rotate(b, 820, 1180);
    expect(await page.evaluate(() => location.hash)).toBe(HASH);
    expect(await cellButton(page, 0).getAttribute('aria-label'), '돌려도 채운 칸이 그대로다').toBe(placed);
    const over = await overflowReport(page, '.panel-shell');
    expect(over.out, '화면 밖으로 나간 단추').toEqual([]);
    expect(over.docW).toBeLessThanOrEqual(over.innerW);
    const small = (await controlsReport(page, '.panel-shell')).filter((c) => c.w < 48 || c.h < 48);
    expect(small.map((c) => `${c.name} ${c.w}×${c.h}`), '48 px보다 작은 단추').toEqual([]);

    // 다시 가로로: 나머지 칸을 손가락으로 채워 통과한다
    await rotate(b, 1180, 820);
    expect(await page.evaluate(() => location.hash)).toBe(HASH);
    expect(await cellButton(page, 0).getAttribute('aria-label')).toBe(placed);
    for (const [label, cell] of [['쉼', 1], ['D4', 2], ['E4', 3]] as const) {
      await material(page, label).tap();
      await cellButton(page, cell).tap();
    }
    await page.getByRole('button', { name: '배치 확인' }).tap();
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await b.ctx.close();
  });

  it('휴대폰: 설치물 모드에서 돌려도 모드가 그대로이고, 조작 막대 높이가 월드에 다시 알려지고, 카메라가 새 화면에서 다시 자리를 잡는다', async () => {
    const b = await boot({ w: 430, h: 932, dpr: 3, touch: true }, { insets: NOTCH_PORTRAIT });
    const { page, errors } = b;
    await waitReady(page);
    await waitChunks(page);
    expect(await teleport(page, 'H4')).toBe(true);
    await waitNear(page, 'H4', 20000);
    await page.waitForSelector('.hud-interact', { state: 'visible' });
    await page.locator('.hud-interact').tap();
    await page.waitForSelector('[data-installation-hud]', { timeout: 20000 });
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.world.bridge.bottomInset.get() > 0, undefined, { timeout: 20000 });
    await waitFramed(page);
    const mode = await modeOf(page);
    expect(mode?.stationId).toBe('H4');
    const inset0 = await insetOf(page);
    const bar0 = await page.evaluate(() => window.innerHeight - document.querySelector('.inst-main')!.getBoundingClientRect().top);
    expect(Math.abs(inset0 - bar0)).toBeLessThanOrEqual(1);

    for (const [w, hh, ins] of [
      [932, 430, NOTCH_LANDSCAPE],
      [430, 932, NOTCH_PORTRAIT],
    ] as const) {
      await rotate(b, w, hh, ins);
      await waitFramed(page);
      const d = await settledCamera(page);
      expect(d.framing, '돌린 뒤에도 카메라가 설치물을 담는다').toBe(true);
      expect(await modeOf(page), '모드가 그대로다').toEqual(mode);
      expect(await page.locator('[data-installation-hud]').count()).toBe(1);
      const inset = await insetOf(page);
      const bar = await page.evaluate(() => window.innerHeight - document.querySelector('.inst-main')!.getBoundingClientRect().top);
      expect(Math.abs(inset - bar), '월드가 아는 막대 높이가 실제 막대와 같다').toBeLessThanOrEqual(1);
      expect(inset).toBeGreaterThan(0);
      expect((await overflowReport(page, '[data-installation-hud]')).out).toEqual([]);
      expect(await intrusions(page, ins)).toEqual([]);
    }
    expect(errors).toEqual([]);
    await b.ctx.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────

describe('노치와 홈 막대: 눌러야 할 것이 화면 가장자리 여백에 들어가지 않는다', () => {
  const SCREENS: Array<[string, number, number, number, Insets]> = [
    ['휴대폰 가로(좌우 59, 아래 21)', 932, 430, 3, NOTCH_LANDSCAPE],
    ['휴대폰 세로(위 59, 아래 34)', 430, 932, 3, NOTCH_PORTRAIT],
  ];
  const HASHES: Array<[string, string]> = [
    ['월드(정거장 곁)', ''],
    ['도움', '#/help'],
    ['설정', '#/settings'],
    ['지도', '#/map'],
    ['목록', '#/list'],
    ['수첩', '#/notebook'],
    ['정거장 안내', '#/s/H1'],
    ['패널(Q02)', '#/q/rhythm.rest-in-a-bar/quarter-rest'],
  ];
  for (const [screen, w, hh, dpr, ins] of SCREENS) {
    it(`${screen}: 월드, 도움, 설정, 지도, 목록, 수첩, 정거장 안내, 패널, 설치물 모드, 첫 안내 카드`, async () => {
      const b = await boot({ w, h: hh, dpr, touch: true }, { insets: ins });
      const { page, errors } = b;
      await waitReady(page);
      await waitChunks(page);
      const env = await page.evaluate(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.appendChild(d);
        const cs = getComputedStyle(d);
        const r = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
        d.remove();
        return r;
      });
      expect(env, '이 Chrome이 가장자리 여백을 흉내 낸다').toEqual(ins);

      for (const [label, hash] of HASHES) {
        if (hash === '') {
          expect(await teleport(page, 'H1')).toBe(true);
          await waitNear(page, 'H1', 20000);
        } else {
          await page.evaluate((x) => (location.hash = x), hash);
          await page.waitForSelector(hash === '#/q/rhythm.rest-in-a-bar/quarter-rest' ? 'button.cell-mine' : '[data-overlay], .list-shell, .panel-shell', { timeout: 20000 });
        }
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        expect(await intrusions(page, ins), `${label}: 가장자리 여백에 들어간 누르는 대상`).toEqual([]);
        if (hash !== '') {
          await page.evaluate(() => (location.hash = '#/'));
          await page.waitForSelector('.hud', { timeout: 20000 });
        }
      }

      // 설치물 모드의 조작 막대와 표지판
      expect(await teleport(page, 'H4')).toBe(true);
      await waitNear(page, 'H4', 20000);
      if (hh > w) {
        await page.waitForSelector('.hud-interact', { state: 'visible' });
        await page.locator('.hud-interact').tap();
      } else await page.locator('.hud-chip').tap();
      await page.waitForSelector('[data-installation-hud]', { timeout: 20000 });
      await waitFramed(page);
      expect(await intrusions(page, ins), '설치물 모드: 가장자리 여백에 들어간 누르는 대상').toEqual([]);
      expect(errors).toEqual([]);
      await b.ctx.close();
    });

    it(`${screen}: 첫 안내 카드의 단추가 가장자리 여백 안쪽에 있다`, async () => {
      const b = await boot({ w, h: hh, dpr, touch: true }, { insets: ins, keepIntro: true });
      expect(await intrusions(b.page, ins)).toEqual([]);
      expect(b.errors).toEqual([]);
      await b.ctx.close();
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 작업대 조작 막대가 월드를 덮는 정도(앞 단계가 8-3으로 넘긴 D-151, D-163, D-205, D-213, D-230)
//  막대의 크기와 틀은 바꾸지 않는다(D-288). 처음 열었을 때(문제를 고르기 전)의 막대 높이를 설치물 20개와 아홉 화면에서 재서 남기고,
//  카메라가 믿는 값(월드가 아는 막대 높이)이 실제 막대와 같은지, 가로로 넘치지 않는지, 터치 기기에서 누르는 대상이 48 px 이상인지만 지킨다.
//  월드가 이만큼 보이면 쓸 만한지는 사람이 판단한다(손 점검표 T5). 세로 화면의 막대 높이는 아래 탭 막대 64 px를 포함한다(월드가 아는 값과 같다).
//  막대가 화면보다 높아 위쪽(확인 결과 줄)이 화면 위로 잘리는 설치물이 작은 휴대폰에 있다. 이것은 결함으로 세지 않고 표에 남긴다(D-288).

interface InstDef {
  installationId: string;
  stationCode: string;
  name: string;
  archetype: string;
}
const INSTALLATIONS: InstDef[] = fs
  .readdirSync(path.resolve(__dirname, '../../content/installations'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../content/installations', f), 'utf-8')) as InstDef);

/** 월드 위쪽에서 메뉴가 차지하는 띠(`MENU_BAND`, src/world/camera.ts)와 한 칸의 크기(터치 대상의 최소 크기) */
const MENU_BAND = 64;
const CELL = 48;
const LONG = 600_000;

interface BarRow {
  screen: string;
  code: string;
  archetype: string;
  bar: number;
}
const barRows: BarRow[] = [];

/** 기본은 대표 네 화면이다(주 기기인 태블릿 가로, 설계서의 휴대폰 세로, 휴대폰 가로, 가장 작은 세로). 아홉 화면 전부는 `BARS_ALL=1`로 돈다(약 9분) */
const BAR_SCREENS: Device[] = process.env.BARS_ALL === '1' ? DEVICES : DEVICES.filter((d) => ['태블릿 가로 1280×800', '휴대폰 세로 430×932', '휴대폰 가로 932×430', '작은 휴대폰 세로 360×640'].includes(d.name));

describe('작업대 조작 막대가 월드를 덮는 정도: 설치물 20개 × 화면(처음 열었을 때, 기록. 아홉 화면 전부는 BARS_ALL=1)', () => {
  it('설치물이 내용 파일에서 읽은 만큼 있다', () => {
    expect(INSTALLATIONS.length).toBe(20);
    expect(new Set(INSTALLATIONS.map((i) => i.stationCode)).size).toBe(INSTALLATIONS.length);
  });

  for (const d of BAR_SCREENS) {
    it(
      `${d.name}(화소 비율 ${d.dpr}${d.touch ? ', 터치' : ''})`,
      async () => {
        const { ctx, page, errors } = await boot(d);
        await waitReady(page);
        await waitChunks(page);
        for (const i of INSTALLATIONS) {
          const who = `${i.stationCode} ${i.name}(${i.archetype})`;
          expect(await teleport(page, i.stationCode), `${who} 정거장이 있다`).toBe(true);
          await waitNear(page, i.stationCode, 20000);
          await page.keyboard.press('KeyE');
          await page.waitForSelector(`[data-installation-hud="${i.installationId}"]`, { timeout: 20000 });
          // 월드가 아는 막대 높이가 실제 막대(화면 맨 아래에서 막대 윗변까지)와 같아질 때까지 기다린다: 카메라가 믿는 값이다
          const agreed = await page
            .waitForFunction(
              () => {
                const el = document.querySelector('[data-installation-hud] .inst-main');
                const known = (window as unknown as { __game: Game }).__game.world.bridge.bottomInset.get();
                if (!el || known <= 0) return false;
                return Math.abs(Math.round(window.innerHeight - el.getBoundingClientRect().top) - known) <= 1;
              },
              undefined,
              { timeout: 10000 },
            )
            .then(
              () => true,
              () => false,
            );
          const known = await insetOf(page);
          const actual = await page.evaluate(() => Math.round(window.innerHeight - document.querySelector('[data-installation-hud] .inst-main')!.getBoundingClientRect().top));
          expect(agreed, `${who}: 월드가 아는 막대 높이 ${known}와 실제 막대 높이 ${actual}가 다르다`).toBe(true);
          // 막대가 화면보다 높을 수 있다(작은 휴대폰 세로). 그때도 누르는 대상은 모두 화면 안에서 닿아야 한다
          expect(await reachReport(page, '[data-installation-hud]'), `${who}: 손이 닿지 않는 것(막대 ${actual} px, 화면 ${d.h} px)`).toEqual([]);
          expect((await overflowReport(page, '[data-installation-hud]')).out, `${who}: 화면 밖으로 나간 단추`).toEqual([]);
          if (d.touch) {
            const small = (await controlsReport(page, '[data-installation-hud]')).filter((c) => c.w < 48 || c.h < 48);
            expect(
              small.map((c) => `${c.name} ${c.w}×${c.h}`),
              `${who}: 48 px보다 작은 단추`,
            ).toEqual([]);
          }
          barRows.push({ screen: d.name, code: i.stationCode, archetype: i.archetype, bar: actual });
          for (let k = 0; k < 4 && (await page.locator('[data-installation-hud]').count()) > 0; k++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
          }
          await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
        }
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }

  it('조작 막대 표(문서에 옮긴다)', () => {
    const lines: string[] = [];
    for (const d of BAR_SCREENS) {
      const rs = barRows.filter((r) => r.screen === d.name);
      expect(rs.length, `${d.name}에서 잰 설치물`).toBe(INSTALLATIONS.length);
      const hi = rs.reduce((a, b) => (b.bar > a.bar ? b : a));
      const lo = rs.reduce((a, b) => (b.bar < a.bar ? b : a));
      const room = (bar: number): number => Math.max(0, d.h - MENU_BAND - bar);
      const covered = rs.filter((r) => room(r.bar) < CELL).length;
      const taller = rs.filter((r) => r.bar > d.h).length;
      const pct = (bar: number): number => Math.round((bar / d.h) * 100);
      lines.push(
        `${d.name} | 막대 ${lo.bar}(${lo.code})–${hi.bar}(${hi.code}) px | 화면의 ${pct(lo.bar)}–${pct(hi.bar)}% | 가장 큰 막대에서 메뉴 띠를 뺀 월드 ${room(hi.bar)} px(${(room(hi.bar) / CELL).toFixed(1)}칸) | 한 칸(${CELL} px)도 안 남는 설치물 ${covered}개 | 막대가 화면보다 높은 설치물 ${taller}개`,
      );
    }
    const detail = BAR_SCREENS.map((d) => `${d.name}: ${barRows.filter((r) => r.screen === d.name).map((r) => `${r.code}=${r.bar}`).join(' ')}`);
    console.log('[막대 표]\n' + lines.join('\n') + '\n[설치물별 막대 높이(px)]\n' + detail.join('\n'));
  });
});
