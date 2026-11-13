// 5단계 흐름 시험(실제 Chrome): 합주 무대(H5, T7)의 설치물 모드.
// 완료 기준 5-4(바닥 칸에서 마디를 고르면 패널에서 열리고, 듣기 범위로 성부와 마디를 나눠 들을 수 있다),
// W-3(걷기와 판정이 섞이지 않는다), W-4(키보드만, 마우스 클릭만, 터치만으로 끌지 않고 한다), W-8(소리를 꺼도 듣는 칸이 보인다).
// 마지막 묶음은 7.9가 '모든 과제'를 말하므로 Q08의 곡 패널(세 판본)을 키보드만으로와 터치만으로 끝까지 풀고 나머지 항목도 점검한다(5-8).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import installation from '../../content/installations/inst.village.ensemble-stage.json';
import song from '../../content/quests/song.short-piece.json';
import { dbg, drawnOf, hashOf, insetOf, modeOf, pos, status, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, waitUnframed, type Dbg, type DrawnInstallation } from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { audioContextCount, inputLog, installAudioCounter, installInputLog } from './inputTools';
import { axReport, clipReport, contrastFails, contrastReport, controlsReport, labelMismatch, motionReport, overflowReport, tabToSel } from './a11yTools';
import { tabTo, type Pointer } from './panelTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const INST_ID = installation.installationId;
const CELLS = installation.slots;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const Q08 = 'song.short-piece';
/** 패널을 여러 번 열고 음을 수십 번 놓는 시험은 소프트웨어 렌더링 Chrome에서 오래 걸린다 */
const LONG = 300_000;

async function boot(opts: { w?: number; h?: number; touch?: boolean; hash?: string; log?: boolean; audio?: boolean; intro?: 'click' | 'tap' | 'key' } = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, hasTouch: opts.touch ?? false });
  if (opts.audio) await installAudioCounter(ctx);
  if (opts.log) await installInputLog(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  const intro = opts.intro ?? (opts.touch ? 'tap' : 'click');
  if (intro === 'key') {
    await appDrawn(page);
    if ((await page.locator('[data-intro]').count()) > 0) {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-intro]', { state: 'detached' });
    }
  } else {
    await skipIntro(page, { tap: intro === 'tap' });
  }
  return { ctx, page, errors };
}

/** 값이 조건을 채울 때까지 읽는다. 느린 헤드리스 Chrome에서는 시간이 아니라 상태로 기다린다 */
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

const waitDrawn = (page: Page, ok: (i: DrawnInstallation) => boolean, what: string): Promise<DrawnInstallation> => until(() => drawnOf(page, INST_ID), ok, what);

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

/** 카메라가 설치물을 담고 가만히 있을 때까지 */
async function settled(page: Page): Promise<Dbg> {
  await until(() => insetOf(page), (v) => v > 0, '조작 막대의 높이가 월드에 알려진다');
  await waitFramed(page);
  let prev = await dbg(page);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(150);
    const cur = await dbg(page);
    const still = Math.abs(cur.center.x - prev.center.x) < 0.5 && Math.abs(cur.center.y - prev.center.y) < 0.5 && Math.abs(cur.zoom - prev.zoom) < 0.001;
    if (still && cur.pending.length === 0 && cur.framing && !cur.transitioning) return cur;
    prev = cur;
  }
  throw new Error('카메라가 설치물 앞에 가만히 서지 않아요');
}

/**
 * 정거장 H5 앞에 서서 모드에 들어간다. 카메라가 자리를 잡을 때까지 기다린다.
 * key는 E, chip은 안내 칩을 마우스로 누르기, tap은 손가락으로 누르기(세로 화면은 64 px 열기 단추, 가로 화면은 안내 칩. 7.6)
 */
async function enter(page: Page, how: 'key' | 'chip' | 'tap' = 'key', target: string | null = `${Q08}/one-voice`): Promise<Dbg> {
  expect(await teleport(page, 'H5')).toBe(true);
  await waitNear(page, 'H5', 20000);
  if (how === 'key') await page.keyboard.press('KeyE');
  else if (how === 'tap') {
    const v = page.viewportSize()!;
    if (v.height > v.width) {
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
    } else await page.locator('.hud-chip').tap();
  } else await page.locator('.hud-chip').click();
  await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
  const d = await settled(page);
  // 무대에 들어가면 처음에는 자유 가락이 골라져 있다(5-6). 5-4의 시험들은 Q08 한 성부를 표지판으로 고른 데서 시작한다. null이면 처음 그대로 둔다
  return target === null ? d : pickTarget(page, target, how === 'tap' ? 'touch' : 'mouse');
}

/** 키보드만으로 고른다: 표지판 단추에 초점을 두고 Enter로 열고, ↓로 항목을 찾아 Enter로 고른다(W-4). 마우스를 쓰지 않는다 */
async function pickTargetByKeys(page: Page, key: string): Promise<Dbg> {
  await page.locator('[data-sign-toggle]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#inst-sign-list');
  for (let i = 0; i < 12; i++) {
    const on = await page.evaluate(() => document.activeElement?.getAttribute('data-sign') ?? null);
    if (on === key) break;
    await page.keyboard.press('ArrowDown');
  }
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-sign') ?? null)).toBe(key);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#inst-sign-list', { state: 'detached' });
  await page.waitForFunction((k) => document.querySelector('[data-installation-hud]')?.getAttribute('data-target') === k, key, { timeout: 15000 });
  return settled(page);
}

/** 표지판을 열어 항목 하나를 고르고, 그 목표가 열려 카메라가 가만히 설 때까지 기다린다 */
async function pickTarget(page: Page, key: string, how: Pointer = 'mouse'): Promise<Dbg> {
  await press(page.locator('[data-sign-toggle]'), how);
  await page.waitForSelector('#inst-sign-list');
  await press(page.locator(`[data-sign="${key}"]`), how);
  await page.waitForSelector('#inst-sign-list', { state: 'detached' });
  await page.waitForFunction((k) => document.querySelector('[data-installation-hud]')?.getAttribute('data-target') === k, key, { timeout: 15000 });
  return settled(page);
}

const cellCenter = (slot: number): { x: number; y: number } => {
  const r = CELLS[slot - 1]!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

/** 칸의 화면 자리. 카메라가 가만히 있을 때 읽고, 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다 */
async function cellPoint(page: Page, slot: number): Promise<{ x: number; y: number }> {
  const d = await settled(page);
  const c = cellCenter(slot);
  const at = toScreen(d, c.x, c.y);
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  if (tag !== 'CANVAS') throw new Error(`${slot}번 칸 자리(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받지 않아요: ${tag}`);
  return at;
}

const tapPoint = (page: Page, how: Pointer, p: { x: number; y: number }): Promise<void> => (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());

// ───── 곡 패널(주소 #/q/song.short-piece/…) ─────

/** 곡 패널이 열릴 때까지(주소와 제목) */
async function waitSongPanel(page: Page, variant = 'one-voice'): Promise<void> {
  await page.waitForFunction(([q, v]) => location.hash === `#/q/${q}/${v}`, [Q08, variant] as const, { timeout: 15000 });
  await page.waitForSelector('.panel-shell h1');
  expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe('선택한 짧은 곡 완성하기');
}

const measureButton = (page: Page, m: number): Locator => page.locator(`.measure-button[data-measure="${m}"]`);
const mineBlock = (page: Page, voice: string, tick: number): Locator => page.locator(`.song-voice[data-voice="${voice}"] .trow-mine button.tblock-face[data-start="${tick}"]`);

/** 재료 단추: 이미 눌려 있으면 다시 누르지 않는다 */
async function choose(loc: Locator, how: Pointer): Promise<void> {
  if ((await loc.getAttribute('aria-pressed')) !== 'true') await press(loc, how);
}

/** 패널에서 열린 마디의 한 성부 줄에 음을 놓는다: 재료(음, 길이, 음높이)를 고르고 그 자리의 칸을 누른다 */
async function placeNote(page: Page, how: Pointer, voice: string, tick: number, value: string, pitch: string): Promise<void> {
  await choose(page.locator('button.material[data-kind="note"]'), how);
  await choose(page.locator(`button.material[data-value="${value}"]`), how);
  await choose(page.locator(`button.material[data-pitch="${pitch}"]`), how);
  await press(mineBlock(page, voice, tick), how);
}

/** 한 성부 판본의 목표 곡(4마디): [마디, 시작 tick, 길이, 음높이] */
const ONE_VOICE_SONG: ReadonlyArray<readonly [number, number, string, string]> = [
  [0, 0, 'quarter', 'C4'], [0, 960, 'quarter', 'D4'], [0, 1920, 'quarter', 'E4'], [0, 2880, 'quarter', 'G4'],
  [1, 0, 'quarter', 'A4'], [1, 960, 'quarter', 'G4'], [1, 1920, 'quarter', 'F4'], [1, 2880, 'quarter', 'E4'],
  [2, 0, 'quarter', 'D4'], [2, 960, 'quarter', 'F4'], [2, 1920, 'quarter', 'A4'], [2, 2880, 'quarter', 'G4'],
  [3, 0, 'quarter', 'E4'], [3, 960, 'quarter', 'D4'], [3, 1920, 'half', 'C4'],
];

const handOf = (page: Page): Promise<string | null> => page.locator('.inst-hand').getAttribute('data-selected-measure');
const waitHand = (page: Page, measure: number | '') => page.waitForFunction((m) => document.querySelector('.inst-hand')?.getAttribute('data-selected-measure') === String(m), measure, { timeout: 15000 });
const feedbackOf = (page: Page): Promise<string | null> => page.locator('.inst-feedback').getAttribute('data-feedback');
const waitFeedback = (page: Page, state: string) => page.waitForFunction((s) => document.querySelector('.inst-feedback')?.getAttribute('data-feedback') === s, state, { timeout: 15000 });

describe('5-4 걸어 들어가면 카메라가 바닥을 담고 무대 작업대가 열린다', () => {
  it('H5 앞에서 E: 무대 모드에 들어간다. 카메라가 칸 여덟 개와 마디·성부 이름 띠를 모두 담는다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect(await modeOf(page)).toBeNull();
    await teleport(page, 'H5');
    await waitNear(page, 'H5', 20000);
    // 들어가기 전의 바닥: 칸은 보이지만 글자 띠는 없다
    const before = await waitDrawn(page, (i) => i.slots.length === 8, '칸 여덟 개가 그려진다');
    expect(before.active).toBe(false);
    expect(before.labelled).toBe(false);

    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H5' });
    expect(await hashOf(page)).not.toMatch(/^#\/[sq]\//); // 화면을 옮기지 않는다
    expect((await status(page)).paused).toBe(false);

    let d = await settled(page);
    // 처음에는 자유 가락이 골라져 있다(5-6): 판정하지 않으니 '목표 듣기'와 '배치 확인'이 없어 조작 막대는 일곱 개다
    const hud = page.locator('[data-installation-hud]');
    expect(await hud.getAttribute('data-target')).toBe('free');
    expect(await hud.getAttribute('data-free')).toBe('true');
    expect(await page.locator('.inst-bar [data-action]').evaluateAll((els) => els.map((e) => e.getAttribute('data-action')))).toEqual(['cell-left', 'cell-right', 'view-panel', 'hear-mine', 'stop', 'help', 'exit']);
    // 표지판에서 Q08 한 성부를 고르면 판정하는 도전이 열린다
    d = await pickTarget(page, `${Q08}/one-voice`);
    expect(await hud.getAttribute('data-free')).toBeNull();
    const inset = await insetOf(page);
    const view = page.viewportSize()!;
    // 이름 띠까지 화면 안에 있고 조작 막대에 가려지지 않는다
    const first = CELLS[0]!;
    const last = CELLS[CELLS.length - 1]!;
    const a = toScreen(d, first.x - 100, first.y - 48);
    const b = toScreen(d, last.x + last.w, last.y + last.h);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(view.width);
    expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);

    const drawn = await waitDrawn(page, (i) => i.active && i.labelled === true, '마디와 성부 이름이 그려진다');
    expect(drawn.slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(drawn.slots.map((s) => s.fill)).toEqual(['empty', 'empty', 'empty', 'empty', 'unused', 'unused', 'unused', 'unused']);
    expect(drawn.selectedMeasure).toBeNull();
    expect(drawn.slots.every((s) => !s.numbered && !s.selected && !s.flagged && !s.playing)).toBe(true);
    // 작업대: 마디 단추 넷, 듣기 범위 둘, 조작 막대 아홉
    expect(await page.locator('.inst-stage [data-measure]').count()).toBe(4);
    expect(await page.locator('.inst-stage [data-scope]').count()).toBe(2);
    expect(await page.locator('.inst-bar [data-action]').count()).toBe(9);
    await shot(page, 'phase5-stage-desktop.png');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  for (const [w, hgt] of [
    [390, 844],
    [360, 640],
  ] as const) {
    it(`세로 휴대폰 화면(${w}×${hgt}, 터치): 손가락으로 열기 단추를 눌러 들어오면 바닥 전체와 이름 띠가 막대 위에 보이고, 칸과 단추는 48px 이상이다`, async () => {
      const { ctx, page, errors } = await boot({ w, h: hgt, touch: true });
      await waitReady(page);
      await waitChunks(page);
      expect(await teleport(page, 'H5')).toBe(true);
      await waitNear(page, 'H5', 20000);
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
      await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
      const d = await settled(page);
      const inset = await insetOf(page);
      const view = page.viewportSize()!;
      const first = CELLS[0]!;
      const last = CELLS[CELLS.length - 1]!;
      const a = toScreen(d, first.x - 100, first.y - 48);
      const b = toScreen(d, last.x + last.w, last.y + last.h);
      expect(a.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.x).toBeLessThanOrEqual(view.width + 0.5);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);
      // 칸 하나의 화면 크기(7.6: 누르는 곳 48 px 이상). 카메라 줌 하한 0.75 × 칸 높이 64 = 48 px
      const cellW = first.w * d.zoom;
      const cellH = first.h * d.zoom;
      expect(Math.min(cellW, cellH), `칸 ${cellW.toFixed(1)}×${cellH.toFixed(1)}`).toBeGreaterThanOrEqual(47.9);
      // 낮은 세로 화면(높이 700 이하)에서는 작업대를 줄여 바닥을 가리지 않는다: 마디 단추 줄은 숨고(바닥 칸과 이전·다음 마디 단추가 같은 일을 한다),
      // 확인 전 안내는 한 줄만 보이며 긴 안내는 화면에서만 사라진다(화면 낭독기가 읽는다)
      const compact = hgt <= 700;
      const controls = compact ? ['[data-scope]', '.inst-bar [data-action]'] : ['[data-measure]', '[data-scope]', '.inst-bar [data-action]'];
      for (const sel of controls) {
        for (const box of await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height, bottom: r.bottom })))) {
          expect(box.w, sel).toBeGreaterThanOrEqual(44);
          expect(box.h, sel).toBeGreaterThanOrEqual(44);
          expect(box.bottom, sel).toBeLessThanOrEqual(view.height + 0.5);
        }
      }
      const measureRowDisplay = await page.locator('.inst-picks-measures').evaluate((e) => getComputedStyle(e).display);
      const shortIdle = await page.locator('.feedback-idle-short').boundingBox();
      const fullIdle = await page.locator('.feedback-idle').boundingBox();
      if (compact) {
        expect(measureRowDisplay).toBe('none');
        expect(await page.locator('.inst-bar [data-action="cell-left"]').isVisible()).toBe(true);
        expect(await page.locator('.inst-bar [data-action="cell-right"]').isVisible()).toBe(true);
        expect(shortIdle?.height ?? 999).toBeLessThan(40); // 한 줄
        expect(fullIdle?.width ?? 999).toBeLessThanOrEqual(2); // 긴 안내는 화면에서 사라진다
      } else {
        expect(measureRowDisplay).not.toBe('none');
        expect(await page.locator('[data-measure]').count()).toBe(4);
        expect(shortIdle).toBeNull(); // display: none
        expect(fullIdle?.width ?? 0).toBeGreaterThan(100);
      }
      if (w === 390) await shot(page, 'phase5-stage-phone.png');
      else await shot(page, 'phase5-stage-phone-small.png');
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

// ---------------------------------------------------------------------------
// 4.9 바닥 칸을 누르면 그 마디가 패널에서 열린다. 마우스만, 손가락만, 키보드만으로 끌지 않고 한다(W-4).

describe('5-4 바닥 칸을 누르면 그 마디가 패널에서 열리고, 돌아오면 무대가 그대로다', () => {
  it('마우스 클릭만으로: 안내 칩으로 들어와 3마디 칸을 누르면 패널이 3마디를 열고, 패널에서 놓고 돌아오면 바닥 칸이 채워진다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'chip');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H5' });

    const at = await cellPoint(page, 3);
    await page.mouse.click(at.x, at.y);
    await waitSongPanel(page);
    expect(await measureButton(page, 2).getAttribute('aria-pressed')).toBe('true');
    expect((await page.locator('#song-title').textContent())?.trim()).toBe('3마디 시간선');

    // 패널에서 3마디의 첫 칸에 D4(4분음표)를 놓는다
    await placeNote(page, 'mouse', 'v1', 0, 'quarter', 'D4');
    expect(await mineBlock(page, 'v1', 0).getAttribute('aria-label')).toContain('D4');
    await page.locator('.panel-shell .nav-button').click();

    // 돌아오면 모드가 켜진 채이고, 고른 마디도 놓은 음도 바닥 칸에 보인다
    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H5' });
    expect(await hashOf(page)).not.toMatch(/^#\/q\//);
    const back = await waitDrawn(page, (d) => d.active && d.slots[2]!.fill === 'partial', '패널에서 놓은 음이 3마디 칸의 채움으로 보인다');
    expect(back.slots.map((s) => s.fill)).toEqual(['empty', 'empty', 'partial', 'empty', 'unused', 'unused', 'unused', 'unused']);
    expect(back.slots[2]!.label).toBe('1/4');
    expect(back.selectedMeasure).toBe(2);
    expect(back.slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([3]);
    expect(await handOf(page)).toBe('2');
    await settled(page);

    // 마우스 말고 다른 도구는 쓰지 않았고, 끌지도 않았다
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.downs).toBeGreaterThan(6);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('손가락만으로(390×844): 쓰지 않는 칸을 누르면 이유가 보이고, 2마디 칸을 누르면 패널이 열리며, 눌러서 놓고 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ w: 390, h: 844, touch: true, log: true });
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'tap');

    // 이 판본에서 쓰지 않는 칸(아래 성부 2마디): 아무것도 바뀌지 않고 이유가 글로 보인다
    await tapPoint(page, 'touch', await cellPoint(page, 6));
    await page.waitForSelector('[data-notice]');
    expect((await page.locator('[data-notice]').textContent())?.trim()).toBe('아래 성부 2마디 칸은 이 판본에서 쓰지 않아요.');
    expect(await hashOf(page)).not.toMatch(/^#\/q\//);
    expect((await drawnOf(page, INST_ID)).selectedMeasure).toBeNull();

    // 쓰는 칸(위 성부 2마디): 패널이 2마디를 열고, 그 마디를 고르면 안내 글은 사라진다
    await tapPoint(page, 'touch', await cellPoint(page, 2));
    await waitSongPanel(page);
    expect(await measureButton(page, 1).getAttribute('aria-pressed')).toBe('true');
    await placeNote(page, 'touch', 'v1', 0, 'quarter', 'A4');
    expect(await mineBlock(page, 'v1', 0).getAttribute('aria-label')).toContain('A4');
    await press(page.locator('.panel-shell .nav-button'), 'touch');

    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H5' });
    const back = await waitDrawn(page, (d) => d.active && d.slots[1]!.fill === 'partial', '패널에서 놓은 음이 2마디 칸의 채움으로 보인다');
    expect(back.selectedMeasure).toBe(1);
    expect(await page.locator('[data-notice]').count()).toBe(0);
    await settled(page);

    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.types).toEqual(['touch']);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만으로: ← →로 마디를 고르고 Enter로 패널을 열고 Esc로 돌아오며, H 도움은 Esc로 먼저 닫히고 그다음 Esc로 나간다', async () => {
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'key', null);
    await pickTargetByKeys(page, `${Q08}/one-voice`); // 표지판도 키보드로 고른다: 마우스를 한 번도 쓰지 않는다
    expect(await handOf(page)).toBe('');

    // → 를 처음 누르면 1마디부터 시작한다. 끝에서는 더 가지 않고 알려 준다
    const standing = await pos(page);
    await page.keyboard.press('ArrowRight');
    await waitHand(page, 0);
    expect((await waitDrawn(page, (d) => d.selectedMeasure === 0, '1마디가 고른 마디로 그려진다')).slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([1]);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await waitHand(page, 3);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (document.querySelector('[data-live]')?.textContent ?? '').includes('마지막 마디예요'), undefined, { timeout: 15000 });
    expect(await handOf(page)).toBe('3');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await waitHand(page, 1);
    // 방향키는 마디를 고르는 키다: 모드에서는 캐릭터가 걷지 않는다(W-3)
    const still = await pos(page);
    expect(Math.hypot(still.x - standing.x, still.y - standing.y)).toBeLessThan(1);

    // Enter: 고른 마디(2마디)가 패널에서 열린다. Esc로 돌아오면 같은 마디가 고른 채로 있다
    await page.keyboard.press('Enter');
    await waitSongPanel(page);
    expect(await measureButton(page, 1).getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H5' });
    await waitHand(page, 1);

    // H: 도움 카드에 무대의 키 표가 있다. Esc는 도움 카드를 먼저 닫고, 모드에서는 나가지 않는다
    await page.keyboard.press('KeyH');
    await page.waitForSelector('#inst-help');
    expect(await page.locator('#inst-help kbd').allTextContents()).toContain('R');
    expect(await page.locator('#inst-help').textContent()).toContain('고른 마디를 패널에서 열기');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#inst-help', { state: 'detached' });
    expect(await modeOf(page)).not.toBeNull();

    // R: 듣기 범위를 돌린다(전체 → 고른 마디 → 전체). 고른 마디가 2마디이므로 '2마디만'이다
    expect(await page.locator('.inst-cursor').textContent()).toContain('전체');
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => (document.querySelector('.inst-cursor')?.textContent ?? '').includes('2마디만'), undefined, { timeout: 15000 });
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => (document.querySelector('.inst-cursor')?.textContent ?? '').includes('전체'), undefined, { timeout: 15000 });

    // Esc: 나간다. 고른 마디 표시와 이름 띠는 사라지고, 카메라는 걷는 자리로 돌아간다
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
    await waitUnframed(page);
    expect(await modeOf(page)).toBeNull();
    const out = await waitDrawn(page, (d) => !d.active, '모드에서 나온 무대가 그려진다');
    expect(out.labelled).toBe(false);

    // 이 모든 것을 마우스 없이 했다
    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.keys).toBeGreaterThan(14);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 4.9 확인과 통과: 판정은 패널과 같은 규칙이다. 틀린 마디의 칸에 ! 가 뜨고, 고치면 사라지고, 다 맞으면 통과한다.

describe('5-4 확인: 틀린 칸에 ! 표시, 고치면 사라지고, 다 맞으면 통과한다', () => {
  it('첫 마디를 틀리게 놓아 C로 확인하고, 패널에서 곡 전체를 목표대로 놓고 돌아와 확인하면 통과한다(눌러서만)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'chip');

    // 1마디를 틀리게 놓는다: 목표는 C4 D4 E4 G4인데 첫 음을 D4로
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'needsRevision'); // 아무것도 놓지 않았어도 판정은 통과하지 못한다
    await tapPoint(page, 'mouse', await cellPoint(page, 1));
    await waitSongPanel(page);
    await placeNote(page, 'mouse', 'v1', 0, 'quarter', 'D4');
    await placeNote(page, 'mouse', 'v1', 960, 'quarter', 'D4');
    await placeNote(page, 'mouse', 'v1', 1920, 'quarter', 'E4');
    await placeNote(page, 'mouse', 'v1', 2880, 'quarter', 'G4');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    // 고치면(놓은 것이 바뀌면) 이전 판정은 지워진다
    expect(await feedbackOf(page)).toBe('none');

    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitDrawn(page, (d) => d.slots.some((s) => s.flagged), '틀린 칸에 ! 표시가 뜬다');
    expect(flagged.slots[0]!.flagged).toBe(true);
    expect(flagged.slots[0]!.fill).toBe('full'); // 가득 채웠어도 틀렸다: 채움('4/4')과 맞고 틀림('!')은 따로 말한다
    expect(flagged.slots[0]!.label).toBe('4/4');
    expect(flagged.slots.slice(4).some((s) => s.flagged)).toBe(false); // 쓰지 않는 칸은 가리키지 않는다
    expect(await page.locator('.inst-feedback .feedback-line').count()).toBeGreaterThanOrEqual(1);
    await shot(page, 'phase5-stage-flagged.png');

    // 패널에서 곡 전체를 목표대로 놓는다(1마디의 첫 음도 C4로 바꾼다)
    await tapPoint(page, 'mouse', await cellPoint(page, 1));
    await waitSongPanel(page);
    let open = 0; // 패널은 1마디를 열고 시작한다(바닥 칸 1을 눌렀다)
    for (const [m, tick, value, pitch] of ONE_VOICE_SONG) {
      if (m !== open) {
        await press(measureButton(page, m), 'mouse');
        open = m;
      }
      await placeNote(page, 'mouse', 'v1', tick, value, pitch);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    const filled = await waitDrawn(page, (d) => d.active && d.slots.slice(0, 4).every((s) => s.fill === 'full'), '네 마디가 모두 가득 채워진다');
    expect(filled.slots.slice(4).every((s) => s.fill === 'unused')).toBe(true);
    expect(filled.slots.some((s) => s.flagged)).toBe(false);
    // 채운 정도는 'N/N' 글자다. ✓처럼 맞다고 읽히는 기호는 쓰지 않는다(확인 전에는 맞고 틀림이 보이지 않는다)
    expect(filled.slots.slice(0, 4).map((s) => s.label)).toEqual(['4/4', '4/4', '4/4', '4/4']);

    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'passed');
    expect(await page.locator('.inst-feedback').textContent()).toContain('통과했어요');
    expect((await drawnOf(page, INST_ID)).slots.some((s) => s.flagged)).toBe(false);
    await shot(page, 'phase5-stage-passed.png');

    // 나가면 걷는 자리의 바닥에는 채워진 칸이 남는다
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
    await waitUnframed(page);
    const out = await waitDrawn(page, (d) => !d.active, '모드에서 나온 무대가 그려진다');
    expect(out.slots.slice(0, 4).every((s) => s.fill === 'full')).toBe(true);
    expect(out.labelled).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});

// ---------------------------------------------------------------------------
// 4.9 듣기 범위: 전체, 성부 하나만, 고른 마디만. 소리를 꺼 두어도 듣는 칸에 ♪ 가 보이고(W-8), 소리를 켜기 전에는 조용하다(W-11).

/** 듣는 동안 ♪ 가 보인 칸 번호를 ms 동안 모은다 */
async function notesSeen(page: Page, ms: number): Promise<number[]> {
  const seen = new Set<number>();
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const s of (await drawnOf(page, INST_ID)).slots) if (s.playing) seen.add(s.slot);
    await page.waitForTimeout(100);
  }
  return [...seen].sort((a, b) => a - b);
}

describe('5-4 듣기 범위로 마디와 성부를 나눠 듣는다', () => {
  it('고른 마디만 듣기와 성부 하나만 듣기: 그 칸에만 ♪ 가 보이고, 소리를 켜기 전에는 오디오 장치가 만들어지지 않는다', async () => {
    const { ctx, page, errors } = await boot({ audio: true });
    await waitReady(page);
    await waitChunks(page);
    expect(await audioContextCount(page)).toBe(0);
    await enter(page, 'key');

    // 3마디를 고르고 범위를 '고른 마디'로: 목표 듣기는 그 마디만 울리고 스스로 끝난다
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await waitHand(page, 2);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => (document.querySelector('.inst-cursor')?.textContent ?? '').includes('3마디만'), undefined, { timeout: 15000 });
    await page.keyboard.press('KeyT');
    await page.waitForSelector('[data-listening="target"]');
    await waitDrawn(page, (d) => d.slots.some((s) => s.playing), '듣는 칸에 ♪ 가 보인다');
    expect(await notesSeen(page, 1200)).toEqual([3]);
    await page.waitForSelector('[data-listening]', { state: 'detached', timeout: 20000 });
    await waitDrawn(page, (d) => !d.slots.some((s) => s.playing), '끝나면 ♪ 가 사라진다');

    // 두 성부 판본: 범위를 '위 성부 하나만'으로 하면 위 줄 칸에만 ♪ 가 보인다
    await page.locator('[data-sign-toggle]').click();
    await page.locator(`[data-sign="${Q08}/two-voices"]`).click();
    await page.waitForSelector('#inst-sign-list', { state: 'detached' });
    await waitDrawn(page, (d) => d.slots.every((s) => s.fill === 'empty'), '두 성부 칸 여덟 개가 모두 쓰인다');
    await settled(page);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => (document.querySelector('.inst-cursor')?.textContent ?? '').includes('위 성부만'), undefined, { timeout: 15000 });
    await page.keyboard.press('KeyT');
    await page.waitForSelector('[data-listening="target"]');
    await waitDrawn(page, (d) => d.slots.some((s) => s.playing), '위 성부 칸에 ♪ 가 보인다');
    const upper = await notesSeen(page, 1500);
    expect(upper.length).toBeGreaterThan(0);
    expect(upper.every((n) => n >= 1 && n <= 4)).toBe(true);
    await page.keyboard.press('KeyS');
    await page.waitForSelector('[data-listening]', { state: 'detached' });
    await waitDrawn(page, (d) => !d.slots.some((s) => s.playing), '멈추면 ♪ 가 사라진다');

    // 듣기 범위를 좁히면 도움을 쓴 것이다: 소리를 켜지 않았으므로 장치는 끝까지 만들어지지 않았다
    expect(await audioContextCount(page)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});

// ---------------------------------------------------------------------------
// 4.9 표지판: 첫 칸은 '자유 가락'이고 들어오면 그것이 골라져 있다(5-6). 판본을 고르면 바닥 칸의 수가 바뀐다.

describe('5-4 표지판으로 판본을 고른다', () => {
  it('표지판 목록은 자유 가락, 한 성부, 두 성부, 높은 도전, 내 곡 다시 듣기(곡이 없으면 고를 수 없다), 잔치 열기 순이다. 들어가면 자유 가락이 골라져 있고, 판본을 고르면 쓰는 칸이 바뀐다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'key', null); // 표지판을 건드리지 않은 처음 그대로
    const hud = page.locator('[data-installation-hud]');
    expect(await hud.getAttribute('data-target')).toBe('free');

    await page.locator('[data-sign-toggle]').click();
    await page.waitForSelector('#inst-sign-list');
    expect(await page.locator('#inst-sign-list [data-sign]').evaluateAll((els) => els.map((e) => e.getAttribute('data-sign')))).toEqual(['free', `${Q08}/one-voice`, `${Q08}/two-voices`, `${Q08}/challenge`, 'songs', 'festival']);
    const free = page.locator('[data-sign="free"]');
    expect(await free.getAttribute('aria-disabled')).toBeNull(); // 5-6부터 고를 수 있다(D-92를 대신한다)
    expect(await free.getAttribute('aria-pressed')).toBe('true');
    expect(await free.textContent()).toContain('자유 가락');
    expect(await free.textContent()).not.toContain('준비 중');
    // 저장한 곡이 없으면 '내 곡 다시 듣기'는 고를 수 없고 이유가 적혀 있다. 잔치 열기는 언제든 고를 수 있다
    const songs = page.locator('[data-sign="songs"]');
    expect(await songs.getAttribute('aria-disabled')).toBe('true');
    expect(await songs.textContent()).toContain('내 곡 다시 듣기');
    expect(await songs.textContent()).toContain('아직 저장한 곡이 없어요');
    await songs.click({ force: true }); // aria-disabled라 Playwright가 기다리지 않게 강제로 눌러도 아무 일도 없어야 한다
    expect(await hud.getAttribute('data-target')).toBe('free');
    expect(await page.locator('[data-sign="festival"]').getAttribute('aria-disabled')).toBeNull();
    expect(await page.locator('[data-sign="festival"]').textContent()).toContain('잔치 열기');

    await page.locator(`[data-sign="${Q08}/challenge"]`).click();
    await page.waitForSelector('#inst-sign-list', { state: 'detached' });
    expect(await hud.getAttribute('data-target')).toBe(`${Q08}/challenge`);
    expect(await page.locator('.inst-sign-btn').textContent()).toContain('높은 도전');
    const hard = await waitDrawn(page, (d) => d.slots.every((s) => s.fill === 'empty'), '높은 도전은 두 성부 여덟 칸을 모두 쓴다');
    expect(hard.slots).toHaveLength(8);

    // 자유 가락으로 되돌아올 수 있다
    await pickTarget(page, 'free');
    expect(await hud.getAttribute('data-free')).toBe('true');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 5-5 기본 연습: 연습을 끝내지 않고 돌아와도 곡이 그대로다.

describe('5-5 기본 연습을 열었다 돌아와도 지금 곡이 그대로다', () => {
  it('연습 띠의 "원래 곡으로 돌아가기"와 브라우저 뒤로 가기 둘 다 원래 곡의 주소와 놓은 음으로 돌아오고, Esc로 무대에 돌아오면 칸이 그대로다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'chip');
    await tapPoint(page, 'mouse', await cellPoint(page, 1));
    await waitSongPanel(page);
    await placeNote(page, 'mouse', 'v1', 0, 'quarter', 'C4');
    expect(await mineBlock(page, 'v1', 0).getAttribute('aria-label')).toContain('C4');
    const practice = page.locator('button[data-practice="rhythm.rest-in-a-bar"]');
    expect(await practice.count()).toBe(1);

    // 연습을 연다: 다른 과제의 패널이 열리고, 띠에 원래 도전이 적혀 있다
    await practice.click();
    await page.waitForFunction(() => location.hash.startsWith('#/q/rhythm.rest-in-a-bar/'), undefined, { timeout: 15000 });
    await page.waitForSelector('.assist-banner');
    expect(await page.locator('.assist-banner').textContent()).toContain('원래 도전: 선택한 짧은 곡 완성하기 · 한 성부');
    expect(await page.locator('.song-voice').count()).toBe(0);

    // 띠의 단추: 원래 곡의 주소로 돌아오고, 놓은 음이 그대로다
    await page.locator('.assist-banner button').click();
    await waitSongPanel(page);
    expect(await page.locator('.assist-banner').count()).toBe(0);
    expect(await mineBlock(page, 'v1', 0).getAttribute('aria-label')).toContain('C4');
    expect(await measureButton(page, 0).getAttribute('aria-pressed')).toBe('true');

    // 한 번 더 연습을 열고 브라우저 뒤로 가기로 돌아온다: 같은 곡, 같은 음
    await page.locator('button[data-practice="rhythm.rest-in-a-bar"]').click();
    await page.waitForSelector('.assist-banner');
    await page.goBack();
    await waitSongPanel(page);
    expect(await page.locator('.assist-banner').count()).toBe(0);
    expect(await mineBlock(page, 'v1', 0).getAttribute('aria-label')).toContain('C4');

    // Esc: 무대로 돌아온다. 모드가 켜진 채이고, 1마디 칸에 놓은 음이 채움으로 보인다
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H5' });
    expect(await hashOf(page)).not.toMatch(/^#\/q\//);
    const back = await waitDrawn(page, (d) => d.active && d.slots[0]!.fill === 'partial', '1마디 칸이 일부 채워져 있다');
    expect(back.slots[0]!.label).toBe('1/4');
    expect(back.selectedMeasure).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});

// ---------------------------------------------------------------------------
// 5-8: Q08의 곡 패널을 세 판본 모두 7.9의 항목으로 점검한다. 1번(키보드만)과 2번(터치만, 끌기 없이)은 목표 곡을 끝까지 푼다(W-4).
// 무대에서 열어도 같은 패널이다. 여기서는 주소로 바로 열어(W-2) 패널 하나를 본다. 입력 기록으로 쓰지 않은 입력이 없었음을 확인한다.

type SongVariant = 'one-voice' | 'two-voices' | 'challenge';
const SONG_VARIANTS: readonly SongVariant[] = ['one-voice', 'two-voices', 'challenge'];

interface SongEvent {
  voice: string;
  measure: number;
  tick: number;
  kind: 'note' | 'rest';
  value: string;
  pitch: string | null;
}

/** 콘텐츠 파일의 목표 곡을 놓는 순서(마디, 성부, 시작 tick)로 읽는다. 시험이 정답을 따로 적어 두지 않는다 */
function songPlan(variant: SongVariant): SongEvent[] {
  const valueOf: Record<number, string> = { 3840: 'whole', 1920: 'half', 960: 'quarter', 480: 'eighth' };
  const events = song.variants[variant].score.events as unknown as Array<{ type: string; voiceId: string; measureIndex: number; onsetTicks: number; durationTicks: number; writtenPitch?: { letter: string; octave: number } }>;
  return events
    .map((e): SongEvent => {
      const value = valueOf[e.durationTicks];
      if (!value) throw new Error(`시험이 모르는 길이: ${e.durationTicks}틱`);
      return {
        voice: e.voiceId,
        measure: e.measureIndex,
        tick: e.onsetTicks,
        kind: e.type === 'rest' ? 'rest' : 'note',
        value,
        pitch: e.type === 'rest' ? null : `${e.writtenPitch!.letter}${e.writtenPitch!.octave}`,
      };
    })
    .sort((a, b) => a.measure - b.measure || a.voice.localeCompare(b.voice) || a.tick - b.tick);
}

const songCell = (voice: string, tick: number): string => `.song-voice[data-voice="${voice}"] .trow-mine button.tblock-face[data-start="${tick}"]`;

/** 손가락이나 마우스로: 재료(종류, 길이, 음높이)를 고르고 그 칸을 누른다 */
async function placeEvent(page: Page, how: Pointer, e: SongEvent): Promise<void> {
  await choose(page.locator(`button.material[data-kind="${e.kind}"]`), how);
  await choose(page.locator(`button.material[data-value="${e.value}"]`), how);
  if (e.pitch) await choose(page.locator(`button.material[data-pitch="${e.pitch}"]`), how);
  await press(page.locator(songCell(e.voice, e.tick)), how);
}

/** 키보드만으로: Tab과 Space로 재료를 고르고, Shift+Tab으로 칸에 돌아가 Enter로 놓는다. 마디는 마디 단추에서 Enter로 연다 */
async function placeByKeys(page: Page, plan: readonly SongEvent[]): Promise<void> {
  const pick = async (sel: string): Promise<void> => {
    await tabToSel(page, sel, { max: 250 });
    await page.keyboard.press('Space');
  };
  let kind: string | null = null;
  let value: string | null = null;
  let pitch: string | null = null;
  let open = 0;
  for (const e of plan) {
    if (e.measure !== open) {
      await tabToSel(page, `.measure-button[data-measure="${e.measure}"]`, { max: 250, back: true });
      await page.keyboard.press('Enter');
      await page.waitForFunction((n) => document.querySelector(`.measure-button[data-measure="${n}"]`)?.getAttribute('aria-pressed') === 'true', e.measure, { timeout: 15000 });
      open = e.measure;
    }
    if (e.kind !== kind) {
      await pick(`button.material[data-kind="${e.kind}"]`);
      kind = e.kind;
    }
    if (e.value !== value) {
      await pick(`button.material-value[data-value="${e.value}"]`);
      value = e.value;
    }
    if (e.pitch && e.pitch !== pitch) {
      await pick(`button.material-pitch[data-pitch="${e.pitch}"]`);
      pitch = e.pitch;
    }
    await tabToSel(page, songCell(e.voice, e.tick), { max: 250, back: true });
    await page.keyboard.press('Enter');
    // 놓은 자리에 초점이 남고, 칸의 이름이 더 이상 비어 있다고 하지 않는다
    await page.waitForFunction(() => !(document.activeElement?.getAttribute('aria-label') ?? '비어 있음').includes('비어 있음'), undefined, { timeout: 15000 });
  }
}

describe('Q08 곡 패널(세 판본): 7.9의 점검을 실제 Chrome에서 한다 (5-8)', () => {
  const openSong = async (variant: SongVariant, opts: { touch?: boolean; width?: number; height?: number; reduced?: 'reduce' | 'no-preference'; audio?: boolean; log?: boolean } = {}) => {
    const ctx = await h.newContext({
      viewport: { width: opts.width ?? (opts.touch ? 430 : 1280), height: opts.height ?? (opts.touch ? 932 : 800) },
      hasTouch: opts.touch ?? false,
      ...(opts.reduced ? { reducedMotion: opts.reduced } : {}),
    });
    if (opts.log) await installInputLog(ctx);
    if (opts.audio) await installAudioCounter(ctx);
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    await page.goto(`${h.url}#/q/${Q08}/${variant}`);
    await waitSongPanel(page, variant);
    return { ctx, page, errors };
  };
  const waitFeedbackIs = (page: Page, state: string) => page.waitForFunction((s) => document.querySelector('.feedback')?.getAttribute('data-feedback') === s, state, { timeout: 15000 });
  const noEmptyMeasure = async (page: Page, measures: number): Promise<void> => {
    for (let m = 0; m < measures; m++) expect(await measureButton(page, m).getAttribute('aria-label')).not.toContain('비어 있어요');
  };

  it.each(SONG_VARIANTS)('%s · 1번 키보드만으로: Tab과 Space로 재료를 고르고 Enter로 놓아 목표 곡을 채우고, 확인해서 통과한다. 마우스는 쓰지 않는다', async (variant) => {
    const { ctx, page, errors } = await openSong(variant, { log: true });
    const plan = songPlan(variant);
    expect(await measureButton(page, 0).getAttribute('aria-pressed')).toBe('true');
    await placeByKeys(page, plan);
    await tabTo(page, (n) => n === '배치 확인', 250);
    await page.keyboard.press('Enter');
    await waitFeedbackIs(page, 'passed');
    await noEmptyMeasure(page, 4);
    const log = await inputLog(page);
    console.log(`[Q08 ${variant} 키보드만] 놓은 것 ${plan.length}개, 입력 기록 ${JSON.stringify(log)}`);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.keys).toBeGreaterThan(plan.length * 4);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it.each(SONG_VARIANTS)('%s · 2번 손가락만으로(430×932): 눌러서만 목표 곡을 채우고 확인해서 통과한다. 끌기도 키도 쓰지 않는다', async (variant) => {
    const { ctx, page, errors } = await openSong(variant, { touch: true, log: true });
    const plan = songPlan(variant);
    let open = 0;
    for (const e of plan) {
      if (e.measure !== open) {
        await press(measureButton(page, e.measure), 'touch');
        open = e.measure;
      }
      await placeEvent(page, 'touch', e);
    }
    await press(page.getByRole('button', { name: '배치 확인' }), 'touch');
    await waitFeedbackIs(page, 'passed');
    await noEmptyMeasure(page, 4);
    const log = await inputLog(page);
    console.log(`[Q08 ${variant} 손가락만] 놓은 것 ${plan.length}개, 입력 기록 ${JSON.stringify(log)}`);
    expect(log.types).toEqual(['touch']);
    expect(log.keys).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.downs).toBeGreaterThanOrEqual(plan.length * 2);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it.each(SONG_VARIANTS)('%s · 8번과 7.6: 폭 430 터치에서 보이는 단추와 입력은 모두 이름이 있고 48 px 이상이다', async (variant) => {
    const { ctx, page, errors } = await openSong(variant, { touch: true });
    // 한 번 틀리게 확인해서, 틀린 곳 표시와 안내 문장이 있는 모습도 함께 잰다
    await press(page.getByRole('button', { name: '배치 확인' }), 'touch');
    await waitFeedbackIs(page, 'needsRevision');
    const rows = await controlsReport(page, '.panel-shell');
    expect(rows.length, '누르는 대상').toBeGreaterThan(20);
    expect(rows.filter((r) => !r.name).map((r) => `${r.role} ${r.cls}`), '이름이 빈 것').toEqual([]);
    expect(rows.filter((r) => r.w < 47.9 || r.h < 47.9).map((r) => `${r.name} ${r.w}×${r.h}`), '48 px보다 작은 것').toEqual([]);
    const ax = await axReport(ctx, page);
    expect(ax.counted, '브라우저가 센 누르는 대상').toBeGreaterThan(20);
    expect(ax.unnamed, '접근성 트리에서 이름이 빈 것').toEqual([]);
    expect(await labelMismatch(page, '.panel-shell'), '보이는 글이 이름에 들어 있지 않은 것').toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it.each(SONG_VARIANTS)('%s · 3번 확대 200%%: 폭 640과 가로로 든 휴대폰에서 가로로 넘치지 않고, 눌러야 하는 단추에 손이 닿고, 상자가 글을 자르지 않는다', async (variant) => {
    for (const [w, hgt, touch] of [[640, 360, false], [844, 390, true]] as const) {
      const { ctx, page, errors } = await openSong(variant, { width: w, height: hgt, touch });
      const over = await overflowReport(page);
      expect(over.docW, `${w}×${hgt} 문서 폭`).toBeLessThanOrEqual(over.innerW);
      expect(over.out, `${w}×${hgt} 화면 폭 밖의 단추`).toEqual([]);
      expect(await clipReport(page, '.panel-shell'), `${w}×${hgt} 글을 자르는 상자`).toEqual([]);
      // 보이고, 가려지지 않고, 필요하면 스크롤해서 손이 닿는다(누르지는 않는다)
      for (const sel of ['button.material[data-kind="note"]', songCell('v1', 0), `.measure-button[data-measure="3"]`, 'button:has-text("배치 확인")', 'button:has-text("내 배치 듣기")']) {
        const loc = page.locator(sel).first();
        expect(await loc.count(), `${sel}가 있다`).toBeGreaterThan(0);
        await loc.click({ trial: true, timeout: 8000 });
      }
      expect(errors).toEqual([]);
      await ctx.close();
    }
  }, LONG);

  it('4번 색 없이 구분: 두 성부 판본에서 틀리면 고칠 마디·성부·조각이 기호와 문장과 굵은 테두리로 구분된다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openSong('two-voices');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    // 위 성부 1마디의 4분음표 넷 가운데 셋째만 틀리게(목표 E4인데 D4) 놓는다. 아래 성부는 비워 둔다
    for (const [tick, pitch] of [[0, 'C4'], [960, 'D4'], [1920, 'D4'], [2880, 'G4']] as const) {
      await placeEvent(page, 'mouse', { voice: 'v1', measure: 0, tick, kind: 'note', value: 'quarter', pitch });
    }
    await page.getByRole('button', { name: '배치 확인' }).click();
    await waitFeedbackIs(page, 'needsRevision');
    const bad = page.locator(songCell('v1', 1920));
    expect(await bad.getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    expect(await bad.locator('.tblock-mark svg').count(), '틀린 조각의 기호').toBe(1);
    const ok = page.locator(songCell('v1', 0));
    expect(await ok.getAttribute('aria-label')).not.toContain('고칠 곳이 있어요');
    expect(await ok.locator('.tblock-mark').count(), '맞게 놓은 조각에는 기호가 없다').toBe(0);
    const widthOf = (loc: Locator): Promise<number> => loc.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(await widthOf(bad), '틀린 조각은 굵은 테두리').toBeGreaterThan(await widthOf(ok));
    // 마디 단추와 성부 줄: 기호와 문장
    expect(await measureButton(page, 0).locator('.beat-mark svg').count(), '1마디 단추의 기호').toBe(1);
    expect(await measureButton(page, 0).getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    for (const v of ['v1', 'v2']) {
      const flag = page.locator(`.song-voice[data-voice="${v}"] .song-voice-flag`);
      expect(await flag.count(), `${v} 줄의 안내`).toBe(1);
      expect(await flag.locator('svg').count(), `${v} 줄의 기호`).toBe(1);
      expect(await flag.textContent()).toContain('고칠 곳이 있어요');
    }
    expect(await page.locator('.feedback-line svg').count(), '안내 문장 앞의 기호').toBeGreaterThan(0);
    await shot(page, 'phase5-gray-song-panel-wrong.png');
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('5번 움직임 줄이기: 줄이기를 켜면 패널에 전환과 애니메이션과 부드러운 스크롤이 없다. 켜지 않으면 있다(대조)', async () => {
    const run = async (reduced: 'reduce' | 'no-preference') => {
      const { ctx, page, errors } = await openSong('two-voices', { reduced });
      await placeEvent(page, 'mouse', { voice: 'v1', measure: 0, tick: 0, kind: 'note', value: 'quarter', pitch: 'C4' });
      await page.getByRole('button', { name: '배치 확인' }).click();
      await waitFeedbackIs(page, 'needsRevision');
      const r = await motionReport(page, '.panel-shell');
      expect(errors).toEqual([]);
      await ctx.close();
      return r;
    };
    const off = await run('reduce');
    const on = await run('no-preference');
    console.log(`[Q08 5번 움직임] 줄임 ${JSON.stringify({ checked: off.checked, slow: off.slow.length, smooth: off.smooth })} 끔 ${JSON.stringify({ checked: on.checked, slow: on.slow.length, smooth: on.smooth })}`);
    expect(off.checked).toBeGreaterThan(100);
    expect(off.slow, '줄이기를 켠 패널').toEqual([]);
    expect(off.smooth).toBe(0);
    // 대조: 켜지 않으면 이 측정이 전환을 잡아낸다(측정이 비어 있지 않다는 증거)
    expect(on.slow.length, '줄이기를 켜지 않은 패널의 전환').toBeGreaterThan(0);
  }, LONG);

  it('6번 소리 없이: 소리를 켜지 않고도 내 배치를 들으면 재생선과 마디 표시가 움직이고, 소리가 꺼져 있다는 글이 있으며, 오디오 장치는 만들어지지 않는다', async () => {
    const { ctx, page, errors } = await openSong('one-voice', { audio: true });
    await placeEvent(page, 'mouse', { voice: 'v1', measure: 0, tick: 0, kind: 'note', value: 'quarter', pitch: 'C4' });
    await placeEvent(page, 'mouse', { voice: 'v1', measure: 0, tick: 960, kind: 'note', value: 'quarter', pitch: 'D4' });
    expect(await page.locator('#sound-off-hint').count(), '소리가 꺼져 있다는 글').toBe(1);
    await page.getByRole('button', { name: '내 배치 듣기' }).click();
    const head = page.locator('.trow-mine .trow-playhead').first();
    await head.waitFor({ state: 'attached', timeout: 15000 });
    const lefts = new Set<string>();
    const end = Date.now() + 2500;
    while (Date.now() < end) {
      lefts.add((await head.getAttribute('style').catch(() => null)) ?? '');
      await page.waitForTimeout(120);
    }
    lefts.delete('');
    expect(lefts.size, '재생선이 움직인 자리 수').toBeGreaterThan(2);
    expect(await measureButton(page, 0).locator('.measure-now svg').count(), '지금 울리는 마디 표시').toBe(1);
    expect(await audioContextCount(page), '오디오 장치').toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('7번 글자 대비: 세 판본의 패널에서 그려진 글자가 4.5:1(큰 글자는 3:1) 이상이다', async () => {
    for (const variant of SONG_VARIANTS) {
      const { ctx, page, errors } = await openSong(variant);
      await page.getByRole('button', { name: '배치 확인' }).click();
      await waitFeedbackIs(page, 'needsRevision');
      const r = await contrastReport(page, '.panel-shell');
      console.log(`[Q08 7번 대비 ${variant}] 글자 ${r.rows.length}덩어리, 가장 낮은 대비 ${Math.min(...r.rows.map((x) => x.ratio)).toFixed(2)}`);
      expect(r.rows.length, `${variant} 글자 덩어리`).toBeGreaterThan(30);
      expect(contrastFails(r).map((x) => `${x.text} ${x.ratio.toFixed(2)}<${x.need}`), `${variant} 기준에 못 미친 글자`).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    }
  }, LONG);
});
