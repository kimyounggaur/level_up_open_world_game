// 4단계 흐름 시험(실제 Chrome): 음계 디딤돌(H4)의 설치물 모드.
// 완료 기준 4-1(걸어 들어가면 카메라가 설치물을 담고 돌 위에 이름·번호·표식이 보인다), W-3(걷기와 판정이 섞이지 않는다),
// W-4(키보드만, 마우스 클릭만, 터치만으로 끌지 않고 푼다), W-8(소리를 꺼도 밟은 것과 듣는 자리가 보인다),
// W-11(소리를 켜기 전에는 조용하다), W-2(패널과 같은 초안, 주소로 바로 열기).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import installation from '../../content/installations/inst.village.scale-stones.json';
import { STATION_HITS } from '../../src/world/generated/worldData';
import {
  dbg,
  drawnOf,
  eventsOf,
  hashOf,
  insetOf,
  modeOf,
  pos,
  recordEvents,
  status,
  teleport,
  toScreen,
  visiblePointIn,
  waitChunks,
  waitFramed,
  waitMoved,
  waitNear,
  waitReady,
  waitUnframed,
  type Dbg,
  type DrawnInstallation,
} from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { audioContextCount, inputLog, installAudioCounter, installInputLog } from './inputTools';
import { tabTo, type Pointer } from './panelTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const INST_ID = installation.installationId;
const STONES = installation.slots;
const NAMES_C_MAJOR = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');

async function boot(opts: { w?: number; h?: number; touch?: boolean; hash?: string; reduced?: boolean; log?: boolean; audio?: boolean; intro?: 'click' | 'tap' | 'key' } = {}) {
  const ctx = await h.newContext({
    viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 },
    hasTouch: opts.touch ?? false,
    ...(opts.reduced ? { reducedMotion: 'reduce' as const } : {}),
  });
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
const labelsOf = (i: DrawnInstallation): Array<string | null> => i.slots.map((s) => s.label);

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

/**
 * 카메라가 설치물을 담고 가만히 있을 때까지: 조작 막대 높이가 알려지고, 전환이 끝나고, 중심이 더 움직이지 않고, 바닥 조각이 올라왔다.
 * 마지막 상태를 돌려준다.
 */
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
 * 정거장 H4 앞에 서서 모드에 들어간다. 들어온 뒤 카메라가 자리를 잡을 때까지 기다린다.
 * key는 E, chip은 안내 칩을 마우스로 누르기, tap은 손가락으로 누르기(세로 화면은 64 px 열기 단추, 가로 화면은 안내 칩. 7.6)
 */
async function enter(page: Page, how: 'key' | 'tap' | 'chip' = 'key'): Promise<Dbg> {
  expect(await teleport(page, 'H4')).toBe(true);
  await waitNear(page, 'H4', 20000);
  if (how === 'key') await page.keyboard.press('KeyE');
  else if (how === 'tap') {
    const v = page.viewportSize()!;
    if (v.height > v.width) {
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
    } else await page.locator('.hud-chip').tap();
  } else await page.locator('.hud-chip').click();
  await page.waitForSelector('[data-installation-hud]', { timeout: 20000 });
  return settled(page);
}

const stoneCenter = (slot: number): { x: number; y: number } => {
  const r = STONES[slot - 1]!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

/**
 * 돌의 화면 자리. 한 번의 왕복으로 카메라가 가만히 있는 것을 두 번 읽어 확인하고,
 * 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다
 */
async function stonePoint(page: Page, slot: number): Promise<{ x: number; y: number }> {
  const c = stoneCenter(slot);
  for (let tries = 0; tries < 20; tries++) {
    const r = await page.evaluate(async (center) => {
      const world = (window as unknown as { __game: { world: { debugState(): { center: { x: number; y: number }; zoom: number; view: { x: number; y: number } } | null } } }).__game.world;
      const read = () => {
        const d = world.debugState();
        return d ? { x: d.center.x, y: d.center.y, z: d.zoom, vx: d.view.x, vy: d.view.y } : null;
      };
      const a = read();
      await new Promise((done) => setTimeout(done, 80));
      const b = read();
      if (!a || !b || Math.abs(a.x - b.x) > 0.3 || Math.abs(a.y - b.y) > 0.3 || Math.abs(a.z - b.z) > 0.001) return null;
      const x = (center.x - b.vx) * b.z;
      const y = (center.y - b.vy) * b.z;
      return { x, y, tag: document.elementFromPoint(x, y)?.tagName ?? 'none' };
    }, c);
    if (!r) continue;
    if (r.tag !== 'CANVAS') throw new Error(`${slot}번 돌 자리(${Math.round(r.x)}, ${Math.round(r.y)})를 캔버스가 받지 않아요: ${r.tag}`);
    return { x: r.x, y: r.y };
  }
  throw new Error('카메라가 가만히 서지 않아요');
}

const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());
const tapPoint = (page: Page, how: Pointer, p: { x: number; y: number }): Promise<void> => (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));

const feedbackOf = (page: Page): Promise<string | null> => page.locator('.inst-feedback').getAttribute('data-feedback');
const waitCursor = (page: Page, text: string) => page.waitForFunction((t) => (document.querySelector('.inst-cursor')?.textContent ?? '').includes(t), text, { timeout: 15000 });
const waitHand = (page: Page, name: string) => page.waitForFunction((n) => document.querySelector('.inst-hand')?.getAttribute('data-hand') === n, name, { timeout: 15000 });
const waitFeedback = (page: Page, state: string) => page.waitForFunction((s) => document.querySelector('.inst-feedback')?.getAttribute('data-feedback') === s, state, { timeout: 15000 });

// ---------------------------------------------------------------------------

describe('4-1 걸어 들어가면 카메라가 설치물을 담고 작업대가 열린다', () => {
  it('H4 앞에서 E: 모드에 들어간다. 주소는 그대로, 안내 칩은 숨고, 카메라가 돌 여덟 개를 모두 담는다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect(await modeOf(page)).toBeNull();
    await teleport(page, 'H4');
    await waitNear(page, 'H4', 20000);
    expect((await page.locator('.hud-chip').textContent())?.trim()).toBe('음계 디딤돌 · E 또는 누르기');
    // 들어가기 전의 돌: 이름도 번호도 없다(빈 돌은 그냥 길이다)
    const before = await waitDrawn(page, (i) => i.slots.length === 8, '돌 여덟 개가 그려진다');
    expect(before.active).toBe(false);
    expect(before.slots.every((s) => s.label === null && !s.numbered && !s.selected && !s.flagged)).toBe(true);

    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-installation-hud]');
    expect(await page.locator('[data-installation-hud]').getAttribute('data-installation-hud')).toBe(INST_ID);
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H4' });
    const hash = await hashOf(page);
    expect(hash.startsWith('#/s/') || hash.startsWith('#/q/')).toBe(false); // 화면을 옮기지 않는다
    expect(await page.locator('.hud-chip').count()).toBe(0); // 이미 들어와 있어서 안내 칩이 없다
    expect(await page.locator('.hud-region-name').isVisible()).toBe(true);
    expect((await status(page)).paused).toBe(false); // 월드는 멈추지 않는다

    const d = await settled(page);
    const inset = await insetOf(page);
    const view = page.viewportSize()!;
    const first = STONES[0]!;
    const last = STONES[STONES.length - 1]!;
    const a = toScreen(d, first.x, first.y);
    const b = toScreen(d, last.x + last.w, last.y + last.h);
    // 돌 여덟 개가 모두 보이고, 조작 막대에 가려지지 않는다
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(view.width);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);
    expect(inset).toBeGreaterThan(100);
    expect(d.zoom).toBeGreaterThan(0.5);

    // 설치물 층: 자리 번호 1~8이 모두 그려지고, 아직 아무 자리도 고르지 않았다
    const inMode = await waitDrawn(page, (i) => i.active && i.slots.every((s) => s.numbered), '자리 번호가 그려진다');
    expect(inMode.slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(inMode.slots.every((s) => s.label === null && !s.selected && !s.flagged && !s.playing)).toBe(true);
    // 작업대: 재료 선반, 조작 막대의 단추 열세 개
    expect(await page.locator('[data-shelf]').count()).toBeGreaterThanOrEqual(8);
    expect(await page.locator('.inst-bar [data-action]').count()).toBe(13);
    await shot(page, 'phase4-installation-desktop.png');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('모드에 있는 동안 방향키는 캐릭터가 아니라 자리를 옮긴다. Esc로 나오면 카메라가 돌아오고 다시 걷는다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page);
    const at = await pos(page);

    await page.keyboard.press('ArrowRight');
    await waitCursor(page, '1번째 자리');
    await waitDrawn(page, (i) => i.slots[0]!.selected, '1번 돌에 고른 표시가 생긴다');
    await page.keyboard.press('ArrowRight');
    await waitCursor(page, '2번째 자리');
    await waitDrawn(page, (i) => i.slots[1]!.selected && !i.slots[0]!.selected, '고른 표시가 2번 돌로 옮겨 간다');
    // 방향키를 누르고 있어도 캐릭터는 가지 않는다(W-3: 움직임이 판정에 섞이지 않는다)
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowRight');
    const still = await pos(page);
    expect(Math.hypot(still.x - at.x, still.y - at.y)).toBeLessThan(1);
    expect((await status(page)).walking).toBe(false);

    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
    expect(await modeOf(page)).toBeNull();
    expect(await insetOf(page)).toBe(0);
    await waitUnframed(page);
    const back = await until(() => dbg(page), (v) => Math.abs(v.center.x - still.x) < 2 && Math.abs(v.center.y - still.y) < 2, '카메라가 캐릭터를 다시 따라간다');
    expect(back.framing).toBe(false);
    // 나온 뒤 돌에는 번호가 없고, 다시 걸을 수 있다
    await waitDrawn(page, (i) => !i.active && i.slots.every((s) => !s.numbered && !s.selected), '돌의 번호가 사라진다');
    expect(await page.locator('.hud-chip').isVisible()).toBe(true); // 안내 칩이 돌아온다
    await page.keyboard.down('ArrowLeft');
    await waitMoved(page, still, 60);
    await page.keyboard.up('ArrowLeft');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('안내 칩을 눌러도 모드에 들어간다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await enter(page, 'chip');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H4' });
    expect(await hashOf(page)).not.toMatch(/^#\/s\//);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('돌 줄을 눌러 걸어가면 도착해서 모드에 들어간다(정거장 안내창이 아니다)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    const d = await dbg(page);
    const hit = STATION_HITS.H4!;
    const target = visiblePointIn(d, hit, 24); // 돌 줄의 첫머리가 화면 오른쪽 끝에 걸쳐 있다
    const at = toScreen(d, target.x, target.y);
    expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, at)).toBe('CANVAS');
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector('[data-installation-hud]', { timeout: 60000 });
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H4' });
    expect(await hashOf(page)).not.toMatch(/^#\/s\//);
    await settled(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4.3 돌을 밟으며 지나간다', () => {
  it('모드 밖에서 돌 위를 걸어 지나가면 돌마다 한 번씩, 1번부터 8번까지 차례로 밟은 사건이 온다(소리를 꺼도 보인다, W-8)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await teleport(page, 'H4');
    await waitNear(page, 'H4', 20000);
    await recordEvents(page);
    const last = STONES[STONES.length - 1]!;
    const goalX = last.x + last.w + 20;
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction((gx) => (window as unknown as { __game: { world: { bridge: { position: { get(): { x: number } } } } } }).__game.world.bridge.position.get().x >= gx, goalX, { timeout: 90000 });
    await page.keyboard.up('ArrowRight');
    const steps = await eventsOf(page, 'stepped');
    expect(steps.map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(steps.every((e) => e.installationId === INST_ID)).toBe(true);
    // 모드에 들어가 있지 않았으므로 '돌을 눌렀다'는 사건은 없다
    expect(await eventsOf(page, 'slot-pressed')).toEqual([]);
    expect(await modeOf(page)).toBeNull();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('모드 안에서는 걸어서 지나가지 않는다: 밟은 사건이 없다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page);
    await recordEvents(page);
    const at = await pos(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    const now = await pos(page);
    expect(Math.hypot(now.x - at.x, now.y - at.y)).toBeLessThan(1);
    expect(await eventsOf(page, 'stepped')).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 4.2 키 표: 키보드만으로 끝까지 푼다(W-4). 마우스를 한 번도 쓰지 않았다는 것을 입력 기록이 확인한다.

/** 손에 든 음을 shelfIndex(0 = 가장 낮은 음)로 옮긴다. 지금 위치(from)에서 ↑↓를 필요한 만큼 누른다 */
async function setHandByKeys(page: Page, from: number, to: number): Promise<number> {
  const key = to > from ? 'ArrowUp' : 'ArrowDown';
  for (let i = 0; i < Math.abs(to - from); i++) await page.keyboard.press(key);
  return to;
}

describe('W-4 키보드만으로 푼다', () => {
  it('Tab과 키만으로: 표지판에서 C장조를 고르고, 틀리게 놓아 확인하고, 고쳐서 통과한다', async () => {
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'key');
    expect(await page.locator('.inst-hand').getAttribute('data-hand')).toBe('C4');

    // 자유로 놀기에서는 판정이 없다: C를 눌러도 알려 주기만 한다
    await page.keyboard.press('KeyC');
    await page.waitForSelector('[data-notice]');
    expect(await feedbackOf(page)).toBe('none');

    // 도움 카드: H로 열고, Esc가 도움 카드를 먼저 닫는다(모드에서는 나가지 않는다)
    await page.keyboard.press('KeyH');
    await page.waitForSelector('#inst-help');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#inst-help', { state: 'detached' });
    expect(await modeOf(page)).not.toBeNull();

    // 표지판: Tab으로 단추에 가서 Enter로 열고, 목록의 C장조에 가서 Enter로 고른다
    await tabTo(page, (n) => n.startsWith('표지판'));
    await page.keyboard.press('Enter');
    await page.waitForSelector('#inst-sign-list');
    await tabTo(page, (n) => n.includes('C장조'));
    await page.keyboard.press('Enter');
    await page.waitForSelector('#inst-sign-list', { state: 'detached' });
    expect(await page.locator('[data-installation-hud]').getAttribute('data-target')).toBe('scale.major/c-major');
    await settled(page);

    // 여덟 자리를 놓는다. 4번째만 F4가 아니라 G4를 놓는다(틀린 자리)
    const idx = [1, 2, 3, 5, 5, 6, 7, 8];
    let hand = 1;
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
      await waitCursor(page, `${i + 1}번째 자리`);
      hand = await setHandByKeys(page, hand, idx[i]!);
      await page.keyboard.press('Enter');
      await waitDrawn(page, (d) => d.slots[i]!.label !== null, `${i + 1}번 돌에 음 이름이 쓰인다`);
    }
    const wrong = await waitDrawn(page, (d) => d.slots.every((s) => s.label !== null), '여덟 돌이 모두 채워진다');
    expect(labelsOf(wrong)).toEqual(['C4', 'D4', 'E4', 'G4', 'G4', 'A4', 'B4', 'C5']);

    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitDrawn(page, (d) => d.slots.some((s) => s.flagged), '틀린 자리에 ! 표시가 뜬다');
    expect(flagged.slots[3]!.flagged).toBe(true); // 4번째
    expect(flagged.slots.slice(0, 3).some((s) => s.flagged)).toBe(false);
    expect(await page.locator('.inst-feedback .feedback-line').count()).toBeGreaterThanOrEqual(1);
    await shot(page, 'phase4-installation-keyboard-flagged.png');

    // 4번째 자리로 가서 F4를 놓아 고친다. 놓은 것이 바뀌면 ! 표시가 사라진다
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await waitCursor(page, '4번째 자리');
    hand = await setHandByKeys(page, hand, 4);
    await waitHand(page, 'F4');
    await page.keyboard.press('Enter');
    await waitDrawn(page, (d) => d.slots[3]!.label === 'F4' && !d.slots.some((s) => s.flagged), '고치면 ! 표시가 사라진다');
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'passed');
    const done = await drawnOf(page, INST_ID);
    expect(labelsOf(done)).toEqual(NAMES_C_MAJOR);
    expect(done.slots.some((s) => s.flagged)).toBe(false);
    expect(await page.locator('.inst-feedback').textContent()).toContain('통과했어요');
    await shot(page, 'phase4-installation-keyboard-passed.png');

    // 이 모든 것을 마우스 없이 했다
    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.keys).toBeGreaterThan(30);

    // Esc로 나온다: 놓은 것은 돌 위에 그대로 남고 번호만 사라진다
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
    await waitUnframed(page);
    const after = await waitDrawn(page, (d) => !d.active, '모드에서 나온 돌이 그려진다');
    expect(labelsOf(after)).toEqual(NAMES_C_MAJOR);
    expect(after.slots.every((s) => !s.numbered)).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('Backspace로 빼고, Z로 되돌리고 Y로 다시 하며, P와 S로 듣고 멈춘다(소리를 꺼 두어도 듣는 자리가 보인다)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page);
    // 두 자리를 놓는다: C4, D4
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await waitDrawn(page, (d) => d.slots[0]!.label === 'C4', '1번 돌에 C4');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await waitDrawn(page, (d) => d.slots[1]!.label === 'D4', '2번 돌에 D4');
    // 빼기
    await page.keyboard.press('Backspace');
    await waitDrawn(page, (d) => d.slots[1]!.label === null && d.slots[0]!.label === 'C4', 'Backspace로 2번 돌이 비는다');
    // 되돌리기와 다시 하기
    await page.keyboard.press('KeyZ');
    await waitDrawn(page, (d) => d.slots[1]!.label === 'D4', 'Z로 되돌리면 D4가 다시 놓인다');
    await page.keyboard.press('KeyY');
    await waitDrawn(page, (d) => d.slots[1]!.label === null, 'Y로 다시 하면 2번 돌이 빈다');
    await page.keyboard.press('KeyZ');
    await waitDrawn(page, (d) => d.slots[1]!.label === 'D4', '다시 되돌린다');
    // 내 배치 듣기: 소리가 꺼져 있어도 듣는 중이라는 글과 돌 위의 ♪ 표시가 보인다
    await page.keyboard.press('KeyP');
    await page.waitForSelector('[data-listening="mine"]');
    const heard = await waitDrawn(page, (d) => d.slots.some((s) => s.playing), '듣는 자리에 표시가 생긴다');
    expect(heard.slots.filter((s) => s.playing).length).toBe(1);
    await page.keyboard.press('KeyS');
    await page.waitForSelector('[data-listening]', { state: 'detached' });
    await waitDrawn(page, (d) => !d.slots.some((s) => s.playing), '멈추면 듣는 자리 표시가 사라진다');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 마우스 클릭만(끌기 없이)과 터치만으로 푼다: 돌을 눌러 놓는다(눌러 놓기), 놓인 돌을 누르면 그 자리를 고르고, 놓기 단추로 바꿔 놓는다.

/** 표지판에서 C장조를 고르고, 4번째 자리만 틀리게 놓아 확인하고, 고쳐서 통과한다. 누르는 도구 하나로만 한다 */
async function solveByPointer(page: Page, how: Pointer, shotName: string): Promise<void> {
  await press(page.locator('[data-sign-toggle]'), how);
  await page.waitForSelector('#inst-sign-list');
  await press(page.locator('[data-sign="scale.major/c-major"]'), how);
  await page.waitForSelector('#inst-sign-list', { state: 'detached' });
  await settled(page);

  const idx = [1, 2, 3, 5, 5, 6, 7, 8]; // 4번째만 G4(틀린 자리)
  for (let i = 0; i < 8; i++) {
    await press(page.locator(`[data-shelf="${idx[i]}"]`), how);
    await tapPoint(page, how, await stonePoint(page, i + 1));
    await waitDrawn(page, (d) => d.slots[i]!.label !== null, `${i + 1}번 돌에 음 이름이 쓰인다`);
  }
  const wrong = await drawnOf(page, INST_ID);
  expect(labelsOf(wrong)).toEqual(['C4', 'D4', 'E4', 'G4', 'G4', 'A4', 'B4', 'C5']);

  await press(page.locator('[data-action="check"]'), how);
  await waitFeedback(page, 'needsRevision');
  const flagged = await waitDrawn(page, (d) => d.slots.some((s) => s.flagged), '틀린 자리에 ! 표시가 뜬다');
  expect(flagged.slots[3]!.flagged).toBe(true);
  await shot(page, shotName.replace('.png', '-flagged.png'));

  // 놓인 돌을 누르면 그 자리를 고르기만 한다(덮어쓰지 않는다)
  await tapPoint(page, how, await stonePoint(page, 4));
  await waitCursor(page, '4번째 자리');
  expect((await drawnOf(page, INST_ID)).slots[3]!.label).toBe('G4');
  await press(page.locator('[data-shelf="4"]'), how);
  await waitHand(page, 'F4');
  await press(page.locator('[data-action="place"]'), how); // 고른 자리에 손에 든 음을 놓는다
  await waitDrawn(page, (d) => d.slots[3]!.label === 'F4' && !d.slots.some((s) => s.flagged), '고쳐 놓으면 ! 표시가 사라진다');

  await press(page.locator('[data-action="check"]'), how);
  await waitFeedback(page, 'passed');
  expect(labelsOf(await drawnOf(page, INST_ID))).toEqual(NAMES_C_MAJOR);
  await shot(page, shotName);
}

describe('W-4 마우스 클릭만, 터치만으로 푼다', () => {
  it('마우스 클릭만(끌지 않는다): 돌을 눌러 놓고, 단추로 확인해서 통과한다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'chip'); // E를 누르지 않고 안내 칩을 눌러 들어간다
    await solveByPointer(page, 'mouse', 'phase4-installation-mouse-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('터치만(세로 휴대폰): 돌과 단추를 손가락으로 눌러 통과한다. 키도 끌기도 없다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, log: true });
    await waitReady(page);
    await waitChunks(page);
    await enter(page, 'tap');
    await solveByPointer(page, 'touch', 'phase4-installation-touch-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['touch']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 여러 화면 크기: 돌이 캔버스에 직접 닿고(HUD가 덮지 않고), 작업 막대가 화면 안에 들어오며, 터치 단추가 충분히 크다.

const SCREENS: Array<{ name: string; w: number; h: number; touch: boolean }> = [
  { name: 'desktop-1366x768', w: 1366, h: 768, touch: false },
  { name: 'tablet-landscape-1180x820', w: 1180, h: 820, touch: true },
  { name: 'phone-portrait-430x932', w: 430, h: 932, touch: true },
  { name: 'phone-portrait-small-360x640', w: 360, h: 640, touch: true },
  { name: 'phone-landscape-844x390', w: 844, h: 390, touch: true },
];

/** 한 번의 왕복으로 읽는 화면 배치: 막대와 선반 단추의 상자, 돌 여덟 개의 화면 자리와 그 자리를 받는 요소 */
interface Layout {
  zoom: number;
  inset: number;
  w: number;
  h: number;
  main: Box | null;
  bar: Box[];
  shelf: Box[];
  stones: Array<{ x: number; y: number; tag: string }>;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const layoutOf = (page: Page): Promise<Layout> =>
  page.evaluate((centers) => {
    const world = (window as unknown as { __game: { world: { debugState(): { zoom: number; view: { x: number; y: number } }; bridge: { bottomInset: { get(): number } } } } }).__game.world;
    const d = world.debugState();
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const boxes = (sel: string): Box[] => [...document.querySelectorAll(sel)].map(box);
    const main = document.querySelector('.inst-main');
    return {
      zoom: d.zoom,
      inset: world.bridge.bottomInset.get(),
      w: window.innerWidth,
      h: window.innerHeight,
      main: main ? box(main) : null,
      bar: boxes('.inst-bar [data-action]'),
      shelf: boxes('[data-shelf]'),
      stones: centers.map((c) => {
        const x = (c.x - d.view.x) * d.zoom;
        const y = (c.y - d.view.y) * d.zoom;
        return { x, y, tag: document.elementFromPoint(x, y)?.tagName ?? 'none' };
      }),
    };
  }, STONES.map((_, i) => stoneCenter(i + 1)));

describe('4.2 여러 화면에서 작업대가 들어맞는다', () => {
  for (const s of SCREENS) {
    it(`${s.name}: 돌 여덟 개가 보이고 눌리며, 작업 막대가 화면 안에 있고, 단추가 충분히 크다`, async () => {
      const { ctx, page, errors } = await boot({ w: s.w, h: s.h, touch: s.touch });
      await waitReady(page);
      await waitChunks(page);
      const d = await enter(page, s.touch ? 'tap' : 'key');
      const L = await layoutOf(page);

      // 설치물이 막대 위쪽에 모두 담긴다
      const first = STONES[0]!;
      const last = STONES[STONES.length - 1]!;
      const a = toScreen(d, first.x, first.y);
      const b = toScreen(d, last.x + last.w, last.y + last.h);
      expect(a.x).toBeGreaterThanOrEqual(-1);
      expect(b.x).toBeLessThanOrEqual(L.w + 1);
      expect(a.y).toBeGreaterThanOrEqual(-1);
      expect(b.y).toBeLessThanOrEqual(L.h - L.inset + 1);

      // 작업 막대와 모든 단추가 화면 안에 있고, 월드가 아는 막대 높이가 실제와 같다
      const main = L.main!;
      expect(main.x).toBeGreaterThanOrEqual(-1);
      expect(main.x + main.w).toBeLessThanOrEqual(L.w + 1);
      expect(main.y + main.h).toBeLessThanOrEqual(L.h + 1);
      expect(Math.abs(L.h - main.y - L.inset)).toBeLessThanOrEqual(2);
      expect(L.bar.length).toBe(13);
      for (const box of [...L.bar, ...L.shelf]) {
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.y).toBeGreaterThanOrEqual(-1);
        expect(box.y + box.h).toBeLessThanOrEqual(L.h + 1);
      }
      for (const box of L.bar) expect(box.x + box.w).toBeLessThanOrEqual(L.w + 1);
      if (s.touch) {
        for (const box of L.bar) {
          expect(box.h).toBeGreaterThanOrEqual(47.5);
          expect(box.w).toBeGreaterThanOrEqual(44);
        }
        // 재료 선반은 옆으로 넘기는 줄이라 화면 밖으로 이어져도 된다. 단추 하나하나는 누를 만큼 크다
        for (const box of L.shelf) {
          expect(box.h).toBeGreaterThanOrEqual(44);
          expect(box.w).toBeGreaterThanOrEqual(44);
        }
      }

      // 돌 여덟 개의 한가운데를 캔버스가 직접 받는다(HUD가 덮지 않는다)
      expect(L.stones.map((p) => p.tag)).toEqual(Array(8).fill('CANVAS'));
      const pitch = (STONES[1]!.x - first.x) * L.zoom;
      expect(pitch).toBeGreaterThanOrEqual(38); // 가장 좁은 화면에서도 돌 한 칸(간격 포함)이 38 px 이상이라 눌림 띠가 닿는다
      await shot(page, `phase4-installation-${s.name}.png`);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

// ---------------------------------------------------------------------------
// W-11: 소리를 켜기 전에는 조용하다. 설치물에 들어가고, 밟고, 놓고, 확인하고, 들어도 오디오 장치가 만들어지지 않는다.

describe('W-11 설치물도 소리를 켜기 전까지 조용하다', () => {
  it('들어가고, 놓고, 확인하고, 듣고, 나와도 오디오 장치가 만들어지지 않는다', async () => {
    const { ctx, page, errors } = await boot({ audio: true });
    await waitReady(page);
    await waitChunks(page);
    const count = (): Promise<number> => audioContextCount(page);
    expect(await count()).toBe(0);
    await enter(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await waitDrawn(page, (d) => d.slots[0]!.label === 'C4', '1번 돌에 C4');
    await page.keyboard.press('KeyP');
    await page.waitForSelector('[data-listening="mine"]');
    await page.keyboard.press('KeyS');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
    expect(await count()).toBe(0);
    expect(await page.locator('.hud .sound-status').getAttribute('data-sound-state')).toBe('off');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// W-2: 패널과 같은 초안. 월드에서 놓은 것이 패널에 있고, 패널에서 고친 것이 월드에 있다. 주소로 바로도 열린다.

describe('W-2 같은 초안을 월드와 패널이 나눠 본다', () => {
  it('월드에서 놓고 V로 패널을 보면 같은 배치가 있고, 패널에서 놓은 것이 돌아오면 돌 위에 있다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await enter(page);
    await page.locator('[data-sign-toggle]').click();
    await page.locator('[data-sign="scale.major/c-major"]').click();
    await page.waitForSelector('#inst-sign-list', { state: 'detached' });
    // 월드에서 C4, D4를 놓는다
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await waitDrawn(page, (d) => d.slots[1]!.label === 'D4', '2번 돌에 D4');

    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => location.hash === '#/q/scale.major/c-major', undefined, { timeout: 15000 });
    await page.waitForSelector('.panel-shell h1');
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe('장음계 배열하기');
    await page.waitForSelector('button.cell-mine[data-slot="1"]');
    expect(await page.locator('button.cell-mine[data-slot="1"]').getAttribute('data-name')).toBe('C4');
    expect(await page.locator('button.cell-mine[data-slot="2"]').getAttribute('data-name')).toBe('D4');
    expect(await page.locator('button.cell-mine[data-slot="3"]').getAttribute('data-name')).toBe('');
    // 패널에서 3번째 자리에 E4를 놓는다
    await page.locator('button.material[data-shelf="3"]').click();
    await page.locator('button.cell-mine[data-slot="3"]').click();
    expect(await page.locator('button.cell-mine[data-slot="3"]').getAttribute('data-name')).toBe('E4');

    // 돌아오면(Esc) 월드는 모드가 켜진 채이고, 패널에서 놓은 것이 돌 위에 있다
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-installation-hud]');
    expect(await modeOf(page)).toEqual({ installationId: INST_ID, stationId: 'H4' });
    expect(await hashOf(page)).not.toMatch(/^#\/q\//);
    const back = await waitDrawn(page, (d) => d.active && d.slots[2]!.label === 'E4', '패널에서 놓은 E4가 돌 위에 있다');
    expect(labelsOf(back).slice(0, 4)).toEqual(['C4', 'D4', 'E4', null]);
    await settled(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('주소 #/q/scale.major/c-major로 패널을 열어 놓은 것이, 마을에서 표지판으로 같은 과제를 고르면 돌 위에 있다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/q/scale.major/c-major' });
    await page.waitForSelector('.panel-shell h1');
    expect(await page.locator('canvas').count()).toBe(0); // 월드를 기다리지 않는다
    await page.locator('button.material[data-shelf="1"]').click();
    await page.locator('button.cell-mine[data-slot="1"]').click();
    await page.locator('button.material[data-shelf="2"]').click();
    await page.locator('button.cell-mine[data-slot="2"]').click();
    expect(await page.locator('button.cell-mine[data-slot="2"]').getAttribute('data-name')).toBe('D4');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    await waitReady(page);
    await waitChunks(page);
    await enter(page);
    // 처음 들어오면 자유로 놀기라서 비어 있다. 표지판에서 같은 과제를 고르면 패널에서 놓은 것이 보인다
    expect(labelsOf(await drawnOf(page, INST_ID)).every((l) => l === null)).toBe(true);
    await page.locator('[data-sign-toggle]').click();
    await page.locator('[data-sign="scale.major/c-major"]').click();
    const seen = await waitDrawn(page, (d) => d.slots[0]!.label !== null, '패널에서 놓은 음이 돌 위에 나타난다');
    expect(labelsOf(seen).slice(0, 3)).toEqual(['C4', 'D4', null]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('정거장 안내창 #/s/H4는 그대로 열리고, 거기서 과제를 열 수 있다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/s/H4' });
    await page.waitForSelector('[data-overlay="station-H4"]');
    expect((await page.locator('.overlay-main h1').textContent())?.trim()).toBe('음계 디딤돌');
    const open = page.locator('.station-quest[data-quest="scale.major"] a.btn');
    expect(await open.count()).toBe(1);
    await open.click();
    await page.waitForFunction(() => location.hash.startsWith('#/q/scale.major/'), undefined, { timeout: 15000 });
    await page.waitForSelector('.panel-shell h1');
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe('장음계 배열하기');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
