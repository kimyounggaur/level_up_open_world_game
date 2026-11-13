// 6단계 흐름 시험(실제 Chrome): 박자 강(beat-river)의 설치물. 지금은 6-4 징검다리(E1 첫 징검다리, E2 긴 돌 짧은 돌), 6-5 잔물결 수로(E3, 확대형)와
// 6-6 물레방아(E4, 바퀴와 펼친 띠는 같은 초안이다, 12.9).
// 완료 기준: 걸어 들어가면 카메라가 줄을 담고 징검다리 작업대가 열린다(4.4), 키보드만으로·마우스 클릭만으로·터치만으로 끌지 않고 푼다(W-4),
// 걷기와 판정이 섞이지 않는다(W-3: 여울은 걸어 들어갈 수 없다), 소리를 꺼도 듣는 돌이 보인다(W-8), 겹침은 이유를 알린다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import e1 from '../../content/installations/inst.beat-river.first-ford.json';
import e2 from '../../content/installations/inst.beat-river.long-short.json';
import e3 from '../../content/installations/inst.beat-river.ripple-channel.json';
import e4 from '../../content/installations/inst.beat-river.waterwheel.json';
import { dbg, drawnOf, eventsOf, hashOf, insetOf, modeOf, pos, recordEvents, status, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, waitUnframed, type Dbg, type DrawnInstallation, type DrawnStone, type DrawnTimeline, type DrawnWheel, type Game } from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { inputLog, installInputLog } from './inputTools';
import type { Pointer } from './panelTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const FORD1 = e1.installationId;
const FORD2 = e2.installationId;
const CHANNEL = e3.installationId;
const WHEEL = e4.installationId;
const CELLS = { [FORD1]: e1.slots, [FORD2]: e2.slots, [CHANNEL]: e3.slots, [WHEEL]: e4.slots } as Record<string, ReadonlyArray<{ slot: number; x: number; y: number; w: number; h: number }>>;
const Q02 = 'rhythm.rest-in-a-bar/quarter-rest';
const Q13 = 'rhythm.three-four/three-quarters';
const Q15 = 'rhythm.dotted/dotted-half';
const Q03 = 'rhythm.short-notes-and-triplets/thirty-seconds-triplet';
const Q17 = 'rhythm.sixteenths/sixteenths-and-eighths';
const Q18 = 'rhythm.triplets/triplet-eighths-and-quarters';
const Q19A = 'rhythm.six-eight/dotted-quarter-and-eighths';
const Q19B = 'rhythm.six-eight/quarters-and-eighths';
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
/** 칸을 여러 번 누르고 확인하는 시험은 소프트웨어 렌더링 Chrome에서 오래 걸린다 */
const LONG = 300_000;

async function boot(opts: { w?: number; h?: number; touch?: boolean; log?: boolean; intro?: 'click' | 'tap' | 'key'; reduced?: boolean } = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, hasTouch: opts.touch ?? false, ...(opts.reduced ? { reducedMotion: 'reduce' as const } : {}) });
  if (opts.log) await installInputLog(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url);
  const intro = opts.intro ?? (opts.touch ? 'tap' : 'click');
  if (intro === 'key') {
    // 키보드만으로 하는 시험은 시작 카드도 Esc로 닫는다(마우스를 한 번도 쓰지 않는다)
    await appDrawn(page);
    if ((await page.locator('[data-intro]').count()) > 0) {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-intro]', { state: 'detached' });
    }
  } else await skipIntro(page, { tap: intro === 'tap' });
  await waitReady(page);
  await waitChunks(page);
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

/** 징검다리 한 줄의 그려진 모습이 조건을 채울 때까지 */
async function waitTimeline(page: Page, id: string, ok: (t: DrawnTimeline, d: DrawnInstallation) => boolean, what: string): Promise<DrawnTimeline> {
  const d = await until(() => drawnOf(page, id), (i) => !!i.timeline && ok(i.timeline, i), what);
  return d.timeline!;
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

/** 카메라가 설치물을 담고 가만히 있을 때까지 */
async function settled(page: Page): Promise<Dbg> {
  await until(() => insetOf(page), (v) => v > 0, '조작 막대의 높이가 월드에 알려진다');
  await waitFramed(page);
  let prev = await dbg(page);
  let still = 0;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(150);
    const cur = await dbg(page);
    // 카메라는 목표의 반 픽셀 안에 들면 목표에 붙는다. 그전까지는 조금씩이라도 움직이므로 움직임이 없어야(0.01 px 아래) 도착한 것이다.
    // 느린 Chrome에서는 프레임 사이가 150 ms보다 길 수 있어서 한 번 가만히 보였다고 도착한 것은 아니니 세 번(0.45초) 이어서 가만히 있어야 한다
    const same = Math.abs(cur.center.x - prev.center.x) < 0.01 && Math.abs(cur.center.y - prev.center.y) < 0.01 && Math.abs(cur.zoom - prev.zoom) < 1e-4;
    still = same ? still + 1 : 0;
    if (still >= 3 && cur.pending.length === 0 && cur.framing && !cur.transitioning) return cur;
    prev = cur;
  }
  throw new Error('카메라가 설치물 앞에 가만히 서지 않아요');
}

const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());
const hudOf = (page: Page, id: string): Locator => page.locator(`[data-installation-hud="${id}"]`);
const liveOf = (page: Page): Promise<string> => page.locator('[data-live]').first().textContent().then((t) => t ?? '');
const waitLive = (page: Page, part: string) => page.waitForFunction((p) => (document.querySelector('[data-live]')?.textContent ?? '').includes(p), part, { timeout: 15000 });
const feedbackOf = (page: Page): Promise<string | null> => page.locator('.inst-feedback').getAttribute('data-feedback');
const waitFeedback = (page: Page, state: string) => page.waitForFunction((s) => document.querySelector('.inst-feedback')?.getAttribute('data-feedback') === s, state, { timeout: 15000 });
const waitTarget = (page: Page, key: string) => page.waitForFunction((k) => document.querySelector('[data-installation-hud]')?.getAttribute('data-target') === k, key, { timeout: 15000 });

/**
 * 정거장 앞에 서서 모드에 들어간다. 카메라가 줄을 담고 가만히 설 때까지 기다린다.
 * key는 E, chip은 안내 칩을 마우스로 누르기, tap은 손가락으로 누르기(세로 화면은 64 px 열기 단추, 가로 화면은 안내 칩. 7.6)
 */
async function enter(page: Page, station: 'E1' | 'E2' | 'E3' | 'E4', id: string, how: 'key' | 'chip' | 'tap' = 'key'): Promise<Dbg> {
  expect(await teleport(page, station)).toBe(true);
  await waitNear(page, station, 20000);
  if (how === 'key') await page.keyboard.press('KeyE');
  else if (how === 'tap') {
    const v = page.viewportSize()!;
    if (v.height > v.width) {
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
    } else await page.locator('.hud-chip').tap();
  } else await page.locator('.hud-chip').click();
  await page.waitForSelector(`[data-installation-hud="${id}"]`, { timeout: 20000 });
  return settled(page);
}

/** 표지판을 열어 항목 하나를 고르고, 그 목표가 열려 카메라가 가만히 설 때까지 기다린다 */
async function pickTarget(page: Page, key: string, how: Pointer = 'mouse'): Promise<Dbg> {
  await press(page.locator('[data-sign-toggle]'), how);
  await page.waitForSelector('#inst-sign-list');
  await press(page.locator(`[data-sign="${key}"]`), how);
  await page.waitForSelector('#inst-sign-list', { state: 'detached' });
  await waitTarget(page, key);
  return settled(page);
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
  await waitTarget(page, key);
  return settled(page);
}

/** 칸의 화면 자리. 카메라가 가만히 있을 때 읽고, 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다 */
async function cellPoint(page: Page, id: string, slot: number): Promise<{ x: number; y: number }> {
  const d = await settled(page);
  const r = CELLS[id]![slot - 1]!;
  const at = toScreen(d, r.x + r.w / 2, r.y + r.h / 2);
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  if (tag !== 'CANVAS') throw new Error(`${slot}번 칸 자리(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받지 않아요: ${tag}`);
  return at;
}
const tapCell = async (page: Page, id: string, slot: number, how: Pointer): Promise<void> => {
  const p = await cellPoint(page, id, slot);
  await (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
};

/** 줄과 박 번호 띠가 화면 안에, 조작 막대 위에 모두 보이고 칸 하나가 화면에서 48 px 이상인가 */
async function laneVisible(page: Page, id: string, d: Dbg): Promise<{ left: number; right: number; top: number; bottom: number; cell: number; room: number }> {
  const cells = CELLS[id]!;
  const first = cells[0]!;
  const last = cells[cells.length - 1]!;
  const a = toScreen(d, first.x, first.y - 44);
  const b = toScreen(d, last.x + last.w, last.y + last.h);
  const vp = page.viewportSize()!;
  const inset = await insetOf(page);
  return { left: a.x, right: vp.width - b.x, top: a.y, bottom: vp.height - inset - b.y, cell: first.w * d.zoom, room: inset };
}

// ───── 6-5 잔물결 수로(E3): 세로로 긴 확대형 줄. 카메라는 줄 전체가 아니라 고른 칸이 있는 박 하나를 담는다 ─────

/** E3의 줄: 시간이 위에서 아래로 흐르고 한 박이 480 px이다. 박 번호 띠(왼쪽 44 px)와 뗏목 표지 띠(오른쪽 32 px)가 한 박의 폭에 든다 */
const LANE3 = { x: e3.slots[0]!.x, w: e3.slots[0]!.w, top: e3.slots[0]!.y, beatPx: 480, labelBand: 44, raftBand: 32 };

/** 확대형 줄의 틱 단위: 한 박 960틱, 칸 하나 120틱. 카메라가 박 둘레에 남기는 여유(월드 px)는 frameTuningOf(E3).pad이고, 위쪽 메뉴 띠(화면 px)는 camera.MENU_BAND다 */
const BEAT_TICKS = 960;
const CELL_TICKS = 120;
const FOLLOW_PAD = 24;
const MENU_BAND = 64;

/**
 * 카메라가 이 박을 따라가고 있는가(가만히 설 때까지 기다린 뒤, 설계서 7.3):
 *  - 칸 하나(60 px)가 화면에서 48 px 이상이다: 줄이 길어도 더 줄이지 않는다.
 *  - 고른 칸(tick, 기본은 박의 첫 칸)이 박 번호 띠와 뗏목 표지 띠까지 화면 안에, 위쪽 메뉴 띠 아래 조작 막대 위로 모두 보이고,
 *    그 칸의 가운데를 눌러 캔버스가 받는다(HUD의 단추가 덮지 않는다). 막대가 높은 작은 화면에서도 고른 칸은 가려지지 않는다.
 *  - 메뉴 띠 아래부터 조작 막대 위까지 보이는 세로 구간은 이 박과 여유(24 px) 안에 든다: 이웃한 박이 아니라 이 박을 비춘다.
 *    박과 여유가 그 자리에 다 들어오는 큰 화면에서는 박 전체가 보인다.
 */
async function expectFollowing(page: Page, beat: number, tick: number = beat * BEAT_TICKS): Promise<Dbg> {
  const d = await settled(page);
  const vp = page.viewportSize()!;
  const room = vp.height - (await insetOf(page));
  const slot = e3.slots[0]!;
  expect(slot.h * d.zoom, '칸 하나의 화면 크기').toBeGreaterThanOrEqual(48 - 1e-6);
  const cellTop = LANE3.top + Math.floor(tick / CELL_TICKS) * slot.h;
  const a = toScreen(d, LANE3.x - LANE3.labelBand, cellTop);
  const b = toScreen(d, LANE3.x + LANE3.w + LANE3.raftBand, cellTop + slot.h);
  const where = `${beat + 1}박의 ${tick}틱 칸`;
  expect(a.x, `${where} 왼쪽`).toBeGreaterThanOrEqual(-0.5);
  expect(vp.width - b.x, `${where} 오른쪽`).toBeGreaterThanOrEqual(-0.5);
  expect(a.y, `${where} 위쪽(메뉴 띠 아래)`).toBeGreaterThanOrEqual(MENU_BAND - 0.5);
  expect(room - b.y, `${where} 아래쪽(조작 막대 위)`).toBeGreaterThanOrEqual(-0.5);
  const at = toScreen(d, LANE3.x + LANE3.w / 2, cellTop + slot.h / 2);
  const hit = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  expect(hit, `${where}의 가운데(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받는다`).toBe('CANVAS');
  const seen = { top: d.view.y + MENU_BAND / d.zoom, bottom: d.view.y + room / d.zoom };
  const beatTop = LANE3.top + beat * LANE3.beatPx;
  const lo = beatTop - FOLLOW_PAD;
  const hi = beatTop + LANE3.beatPx + FOLLOW_PAD;
  if (seen.bottom - seen.top <= hi - lo + 1) {
    expect(seen.top, `${beat + 1}박 위쪽 여유 밖은 보이지 않아요`).toBeGreaterThanOrEqual(lo - 1);
    expect(seen.bottom, `${beat + 1}박 아래쪽 여유 밖은 보이지 않아요`).toBeLessThanOrEqual(hi + 1);
  } else {
    expect(seen.top, `${beat + 1}박 전체(위)`).toBeLessThanOrEqual(beatTop + 1);
    expect(seen.bottom, `${beat + 1}박 전체(아래)`).toBeGreaterThanOrEqual(beatTop + LANE3.beatPx - 1);
  }
  return d;
}

/** 시간(틱)에 맞는 줄 위의 점의 화면 자리: 눌러서 뗏목의 돌 하나를 고를 때 쓴다. 그 자리를 캔버스가 직접 받는지도 본다 */
async function tickPoint(page: Page, tick: number): Promise<{ x: number; y: number }> {
  const d = await settled(page);
  const at = toScreen(d, LANE3.x + LANE3.w / 2, LANE3.top + tick / 2);
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  if (tag !== 'CANVAS') throw new Error(`${tick}틱 자리(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받지 않아요: ${tag}`);
  return at;
}
const tapTick = async (page: Page, tick: number, how: Pointer): Promise<void> => {
  const p = await tickPoint(page, tick);
  await (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
};

const handOf = (page: Page): Promise<string | null> => page.locator('.inst-hand').getAttribute('data-hand');
const cursorTextOf = (page: Page): Promise<string> => page.locator('.inst-cursor').textContent().then((t) => t ?? '');
/** 고른 칸을 말하는 막대의 글이 이 말을 담을 때까지(놓은 뒤에는 말로 알리는 내용이 칸 이름이 아니라서 이 글을 본다) */
const waitCursor = (page: Page, part: string) => page.waitForFunction((p) => (document.querySelector('.inst-cursor')?.textContent ?? '').includes(p), part, { timeout: 15000 });

/** 키를 눌러 손에 든 것이 조건을 채울 때까지 바꾼다(키를 몇 번 눌러야 하는지에 묶이지 않게 한다) */
async function handUntil(page: Page, key: string, ok: (hand: string) => boolean, what: string, max = 10): Promise<string> {
  for (let i = 0; i <= max; i++) {
    const hand = (await handOf(page)) ?? '';
    if (ok(hand)) return hand;
    if (i === max) break;
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
  throw new Error(`손에 든 것이 ${what}이(가) 되지 않아요: ${await handOf(page)}`);
}

describe('6-4 걸어 들어가면 카메라가 줄을 담고 징검다리 작업대가 열린다', () => {
  it(
    '키보드만으로: E1 앞에서 E, 표지판으로 Q02를 고르고, 칸을 옮기며 돌과 이끼돌을 놓고, 확인하면 통과한다. 듣는 돌에는 ♪가 보인다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      expect(await modeOf(page)).toBeNull();
      await teleport(page, 'E1');
      await waitNear(page, 'E1', 20000);
      // 들어가기 전의 여울: 돌도 격자도 박 번호도 없다
      const before = await drawnOf(page, FORD1);
      expect(before.active).toBe(false);
      expect(before.slots).toHaveLength(8);
      expect(before.timeline).toMatchObject({ stones: [], water: [], waterEmphasis: false, cursor: null, playTick: null, shoreRocks: null, beats: 0, rafts: 0 });

      await page.keyboard.press('KeyE');
      await page.waitForSelector(`[data-installation-hud="${FORD1}"]`);
      expect(await modeOf(page)).toEqual({ installationId: FORD1, stationId: 'E1' });
      expect(await hashOf(page)).not.toMatch(/^#\/[sq]\//); // 화면을 옮기지 않는다
      expect((await status(page)).paused).toBe(false);
      const d = await settled(page);

      // 카메라가 줄과 박 번호 띠를 모두 담는다. 칸 하나가 화면에서 48 px 이상이라 손가락으로도 누를 수 있다
      const seen = await laneVisible(page, FORD1, d);
      expect(seen.left).toBeGreaterThanOrEqual(0);
      expect(seen.right).toBeGreaterThanOrEqual(0);
      expect(seen.top).toBeGreaterThanOrEqual(0);
      expect(seen.bottom).toBeGreaterThanOrEqual(0);
      expect(seen.cell).toBeGreaterThanOrEqual(48);

      // 처음에는 자유로 놀기: 판정이 없어 목표 듣기와 확인 단추가 막대에 있어도 쓸 수 없다고 알린다
      const hud = hudOf(page, FORD1);
      expect(await hud.getAttribute('data-target')).toBe('free');
      expect(await page.locator('.inst-hand').getAttribute('data-hand')).toBe('울림돌 C4 8분음표');
      const free = await waitTimeline(page, FORD1, (t, i) => i.active && t.beats === 4, '설치물 모드의 격자와 박 번호 1~4가 그려진다');
      expect(free.shoreRocks).toBeNull();
      expect(free.water).toEqual([{ from: 0, to: 3840, flagged: false, labelled: false, emphasised: false }]);
      expect(free.stones).toEqual([]);

      // 표지판도 키보드로 고른다: 마우스를 한 번도 쓰지 않는다
      await pickTargetByKeys(page, Q02);
      expect(await page.locator('.inst-hand').getAttribute('data-hand')).toBe('울림돌 C4 4분음표');

      // → : 첫 칸(1박)부터 시작한다. 놓을 자리가 ▼와 함께 윤곽으로 그려진다
      await page.keyboard.press('ArrowRight');
      let t = await waitTimeline(page, FORD1, (x) => x.cursor !== null, '고른 칸이 놓을 자리로 그려진다');
      expect(t.cursor).toEqual({ startTick: 0, endTick: 960, kind: 'note', ok: true });

      // Enter: C4 4분음표를 1박에 놓는다. 고른 칸은 놓은 돌의 끝(2박)으로 간다
      await page.keyboard.press('Enter');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 1, '1박에 돌이 놓인다');
      expect(t.stones[0]).toMatchObject({ startTick: 0, endTick: 960, kind: 'note', label: 'C4', dotted: false, flagged: false });
      expect(t.cursor).toEqual({ startTick: 960, endTick: 1920, kind: 'note', ok: true });
      await waitLive(page, '남은 물은 2박부터 마디 끝까지 2880틱');
      expect(await page.locator('.inst-water').textContent()).toContain('2880틱');

      // R: 이끼돌로 바꿔 2박에 쉼표를 놓는다. 이끼돌은 '쉼' 글자와 사선 무늬다
      await page.keyboard.press('KeyR');
      await page.waitForFunction(() => document.querySelector('.inst-hand')?.getAttribute('data-hand')?.startsWith('이끼돌') ?? false, undefined, { timeout: 15000 });
      await page.keyboard.press('Enter');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 2, '2박에 이끼돌이 놓인다');
      expect(t.stones[1]).toMatchObject({ startTick: 960, endTick: 1920, kind: 'rest', label: '쉼' });

      // R로 울림돌로 돌아와 ↑로 D4, Enter로 3박, ↑로 E4, Enter로 4박
      await page.keyboard.press('KeyR');
      await page.waitForFunction(() => document.querySelector('.inst-hand')?.getAttribute('data-hand')?.startsWith('울림돌') ?? false, undefined, { timeout: 15000 });
      await page.keyboard.press('ArrowUp');
      await page.waitForFunction(() => document.querySelector('.inst-hand')?.getAttribute('data-hand') === '울림돌 D4 4분음표', undefined, { timeout: 15000 });
      await page.keyboard.press('Enter');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 3, '3박에 D4가 놓인다');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 4 && x.water.length === 0, '4박에 E4가 놓이고 남은 물이 없다');
      expect(t.stones.map((s) => `${s.label}@${s.startTick}`)).toEqual(['C4@0', '쉼@960', 'D4@1920', 'E4@2880']);
      expect(await page.locator('.inst-water').textContent()).toContain('남은 물이 없어요');
      // 확인하기 전에는 맞고 틀림을 알리지 않는다
      expect(await feedbackOf(page)).toBe('none');
      expect(t.waterEmphasis).toBe(false);

      // C: 확인 → 통과
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      t = (await drawnOf(page, FORD1)).timeline!;
      expect(t.waterEmphasis).toBe(false);
      expect(t.stones.every((s) => !s.flagged)).toBe(true);
      await shot(page, 'phase6-ford-q02-passed-keyboard.png');

      // V: 같은 판본이 패널에서 열린다(쌍둥이, W-2). Esc로 돌아오면 모드와 놓은 돌이 그대로다
      await page.keyboard.press('KeyV');
      await page.waitForFunction((k) => location.hash === `#/q/${k}`, Q02, { timeout: 15000 });
      await page.waitForSelector('.panel-shell h1');
      await page.keyboard.press('Escape');
      await page.waitForSelector(`[data-installation-hud="${FORD1}"]`);
      expect(await modeOf(page)).toEqual({ installationId: FORD1, stationId: 'E1' });
      expect((await waitTimeline(page, FORD1, (x) => x.stones.length === 4, '패널에서 돌아와도 돌 네 개가 그대로다')).stones.map((x) => x.label)).toEqual(['C4', '쉼', 'D4', 'E4']);

      // P: 내 배치 듣기 — 소리를 꺼 두어도 물결 선이 돌 위를 따라가고 듣는 돌에 ♪가 보인다(W-8). S로 멈추면 사라진다
      await page.keyboard.press('KeyP');
      t = await waitTimeline(page, FORD1, (x) => x.playTick !== null && x.stones.some((s) => s.playing), '듣는 돌이 표시된다');
      expect(t.stones.filter((s) => s.playing).length).toBeGreaterThan(0);
      await page.keyboard.press('KeyS');
      await waitTimeline(page, FORD1, (x) => x.playTick === null && x.stones.every((s) => !s.playing), '멈추면 물결 선과 ♪가 사라진다');

      // H: 도움 카드에 징검다리의 키 표가 있다. Esc는 도움 카드를 먼저 닫고, 모드에서는 나가지 않는다
      await page.keyboard.press('KeyH');
      await page.waitForSelector('#inst-help');
      const help = (await page.locator('#inst-help').textContent()) ?? '';
      expect(help).toContain('돌 길이 바꾸기');
      expect(help).toContain('울림돌과 이끼돌 바꾸기');
      await page.keyboard.press('Escape');
      await page.waitForSelector('#inst-help', { state: 'detached' });
      expect(await modeOf(page)).not.toBeNull();

      // 방향키는 칸을 옮기는 키다: 모드에서는 캐릭터가 걷지 않는다(W-3)
      const standing = await pos(page);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      const still = await pos(page);
      expect(Math.hypot(still.x - standing.x, still.y - standing.y)).toBeLessThan(1);

      // Esc: 나간다. 박 번호와 격자는 사라지고 놓은 돌은 풍경으로 남는다. 카메라는 걷는 자리로 돌아간다
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      await waitUnframed(page);
      expect(await modeOf(page)).toBeNull();
      const out = await waitTimeline(page, FORD1, (x, i) => !i.active && x.beats === 0, '모드에서 나온 징검다리가 그려진다');
      expect(out.stones.map((s) => s.label)).toEqual(['C4', '쉼', 'D4', 'E4']);
      expect(out.cursor).toBeNull();
      expect(out.water).toEqual([]);

      // 이 모든 것을 마우스 없이 했다
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(log.maxDrag).toBe(0);
      expect(log.keys).toBeGreaterThan(20);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '마우스 클릭만으로: 3/4박자 과제는 쓰지 않는 구간을 물가 바위가 덮는다. 틀리게 놓아 확인하면 남은 물이 강조되고 돌에 ! 가 선다',
    async () => {
      const { ctx, page, errors } = await boot();
      await enter(page, 'E1', FORD1, 'chip');
      let d = await pickTarget(page, Q13);
      // 3/4박자: 한 마디가 2880틱이라 줄의 오른쪽 4번째 박(960틱 = 120 px)이 물가 바위로 덮인다. 박 번호는 1~3
      let t = await waitTimeline(page, FORD1, (x, i) => i.active && x.shoreRocks !== null, '쓰지 않는 구간이 물가 바위로 덮인다');
      expect(t.shoreRocks).toEqual({ from: 2880, to: 3840 });
      expect(t.beats).toBe(3);
      expect(t.water).toEqual([{ from: 0, to: 2880, flagged: false, labelled: false, emphasised: false }]);
      await shot(page, 'phase6-ford-three-four-shore-rocks.png');

      // 바위가 덮은 칸(7번, 8번)을 눌러도 돌이 놓이지 않고 이유를 알린다
      await tapCell(page, FORD1, 7, 'mouse');
      await waitLive(page, '물가 바위가 덮은 칸이에요');
      expect((await waitTimeline(page, FORD1, () => true, '')).stones).toEqual([]);

      // 목표는 1박 C4, 2박 쉼표, 3박 음이다: 2박에 쉼표 대신 음을 놓고 3박은 비워 둔 틀린 배치로 만든다
      await tapCell(page, FORD1, 1, 'mouse');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 1, '1박에 돌이 놓인다');
      await tapCell(page, FORD1, 3, 'mouse');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 2, '2박에 돌이 놓인다');
      expect(t.stones.map((s) => [s.startTick, s.endTick, s.label])).toEqual([
        [0, 960, 'C4'],
        [960, 1920, 'C4'],
      ]);
      expect(t.water).toEqual([{ from: 1920, to: 2880, flagged: false, labelled: false, emphasised: false }]);

      // 이미 놓인 칸을 누르면 그 돌만 고른다(바꾸려면 놓기)
      await tapCell(page, FORD1, 1, 'mouse');
      await waitLive(page, '바꾸려면 놓기를 누르세요');
      expect((await waitTimeline(page, FORD1, () => true, '')).stones).toHaveLength(2);

      // 확인 단추: 틀렸다. 남은 물은 산호색 테두리로 강조되고 틀린 돌에 ! 배지가 선다(색만으로 알리지 않는다)
      await press(page.locator('[data-action="check"]'), 'mouse');
      await waitFeedback(page, 'needsRevision');
      t = await waitTimeline(page, FORD1, (x) => x.waterEmphasis, '남은 물이 강조된다');
      expect(t.water).toEqual([{ from: 1920, to: 2880, flagged: true, labelled: false, emphasised: true }]);
      expect(t.stones.map((s) => s.flagged)).toEqual([false, true]);
      expect(await page.locator('.inst-water').getAttribute('data-emphasis')).toBe('true');
      await shot(page, 'phase6-ford-three-four-flagged.png');

      // 고치기: 2박의 돌을 골라 이끼돌로 바꾸고(놓기 단추), 3박에 E4를 놓는다. 고치면 표시가 사라지고, 다시 확인하면 통과한다
      await tapCell(page, FORD1, 3, 'mouse');
      await waitLive(page, '바꾸려면 놓기를 누르세요');
      await press(page.locator('[data-kind="rest"]'), 'mouse');
      await press(page.locator('[data-action="place"]'), 'mouse');
      t = await waitTimeline(page, FORD1, (x) => x.stones[1]?.kind === 'rest' && !x.waterEmphasis, '2박이 이끼돌로 바뀌고 강조가 사라진다');
      expect(t.stones.every((s) => !s.flagged)).toBe(true);
      await press(page.locator('[data-kind="note"]'), 'mouse');
      await press(page.locator('[data-pitch="E4"]'), 'mouse');
      await tapCell(page, FORD1, 5, 'mouse');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 3 && x.water.length === 0, '3박에 E4가 놓여 마디가 찬다');
      expect(t.stones.map((s) => `${s.label}@${s.startTick}`)).toEqual(['C4@0', '쉼@960', 'E4@1920']);
      await press(page.locator('[data-action="check"]'), 'mouse');
      await waitFeedback(page, 'passed');
      d = await settled(page);
      expect(d.framing).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '자유로 놀기: 겹치면 놓이지 않고 이유를 알린다. 돌 길이를 바꿔 놓고, 놓기 단추와 빼기 단추로도 된다(끌지 않는다)',
    async () => {
      const { ctx, page, errors } = await boot({ log: true });
      await enter(page, 'E1', FORD1, 'chip');
      // 8분음표를 2박(960틱)에 놓는다
      await tapCell(page, FORD1, 3, 'mouse');
      let t = await waitTimeline(page, FORD1, (x) => x.stones.length === 1, '2박에 8분음표가 놓인다');
      expect(t.stones[0]).toMatchObject({ startTick: 960, endTick: 1440, label: 'C4' });
      // 자유로 놀 때 칸은 가장 잘게 나눈 칸(8분음표, 480틱)이다: 두 번째 칸에도 놓을 수 있다
      await tapCell(page, FORD1, 4, 'mouse');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 2, '2박 2번째 칸에도 놓인다');
      // 길이를 2분음표로 바꿔 1박에 놓으면 2박의 돌과 겹친다: 놓이지 않고 이유를 알린다. 놓은 것은 그대로다
      await press(page.locator('[data-value="half"]:not([data-dotted])'), 'mouse');
      await tapCell(page, FORD1, 1, 'mouse');
      await waitLive(page, '겹쳐요. 겹친 것을 먼저 비워 주세요.');
      // 2분음표(1920틱)는 2박의 8분음표 두 개(960~1920틱)와 겹친다: 첫 돌을 말하고 '외 1개'로 나머지를 센다
      expect(await liveOf(page)).toBe('1박에 C4 2분음표를 놓으면 2박의 C4 8분음표 외 1개와 겹쳐요. 겹친 것을 먼저 비워 주세요.');
      t = (await drawnOf(page, FORD1)).timeline!;
      expect(t.stones).toHaveLength(2);
      // 놓을 수 없는 자리는 × 표시로 그려진다(ok: false)
      expect(t.cursor).toEqual({ startTick: 0, endTick: 1920, kind: 'note', ok: false });
      // 4박(2880틱)에 2분음표를 놓으면 마디 선을 넘는다: 몇 틱 넘는지 알리고 놓지 않는다
      await tapCell(page, FORD1, 7, 'mouse');
      await waitLive(page, '마디 선을 960틱 넘어요');
      expect(await liveOf(page)).toBe('4박에 C4 2분음표를 놓으면 마디 선을 960틱 넘어요. 마디는 3840틱이에요.');
      expect((await drawnOf(page, FORD1)).timeline!.stones).toHaveLength(2);
      // 3박(1920틱)은 비어 있으니 2분음표가 마디 끝까지 정확히 들어간다. 남은 물은 1박 앞의 한 구간뿐이다
      await tapCell(page, FORD1, 5, 'mouse');
      t = await waitTimeline(page, FORD1, (x) => x.stones.length === 3, '3박에 2분음표가 놓인다');
      expect(t.stones[2]).toMatchObject({ startTick: 1920, endTick: 3840, label: 'C4' });
      expect(t.water).toEqual([{ from: 0, to: 960, flagged: false, labelled: false, emphasised: false }]);
      // 빼기: 칸을 골라 빼기 단추
      await tapCell(page, FORD1, 5, 'mouse');
      await press(page.locator('[data-action="remove"]'), 'mouse');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 2, '빼면 돌이 사라진다');
      // 실행 취소와 다시 실행 단추
      await press(page.locator('[data-action="undo"]'), 'mouse');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 3, '실행 취소하면 돌이 돌아온다');
      await press(page.locator('[data-action="redo"]'), 'mouse');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 2, '다시 실행하면 다시 빠진다');
      // 마우스로 눌렀지만 끌지는 않았다
      const log = await inputLog(page);
      expect(log.maxDrag).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '터치만으로(세로 화면 430×932): 열기 단추를 눌러 들어가 Q02를 끌지 않고 푼다. 칸 하나가 화면에서 48 px 이상이다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, log: true });
      const d = await enter(page, 'E1', FORD1, 'tap');
      const seen = await laneVisible(page, FORD1, d);
      // 세로 430 px 화면에서 줄(480 px) 폭이 꽉 차면 배율은 하한 0.8이고 칸은 정확히 48 px다(실측 cell 48, zoom 0.8)
      expect(seen.cell).toBeGreaterThanOrEqual(48 - 1e-6);
      expect(seen.left).toBeGreaterThanOrEqual(-0.5);
      expect(seen.right).toBeGreaterThanOrEqual(-0.5);
      expect(seen.top).toBeGreaterThanOrEqual(0);
      expect(seen.bottom).toBeGreaterThanOrEqual(0);
      await pickTarget(page, Q02, 'touch');
      // Q02: C4, 쉼, D4, E4 — 재료 단추와 칸을 손가락으로 누른다
      await tapCell(page, FORD1, 1, 'touch');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 1, '1박에 돌이 놓인다');
      await press(page.locator('[data-kind="rest"]'), 'touch');
      await tapCell(page, FORD1, 3, 'touch');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 2, '2박에 이끼돌이 놓인다');
      await press(page.locator('[data-kind="note"]'), 'touch');
      await press(page.locator('[data-pitch="D4"]'), 'touch');
      await tapCell(page, FORD1, 5, 'touch');
      await waitTimeline(page, FORD1, (x) => x.stones.length === 3, '3박에 D4가 놓인다');
      await press(page.locator('[data-pitch="E4"]'), 'touch');
      await tapCell(page, FORD1, 7, 'touch');
      const t = await waitTimeline(page, FORD1, (x) => x.stones.length === 4 && x.water.length === 0, '4박에 E4가 놓인다');
      expect(t.stones.map((s) => `${s.label}@${s.startTick}`)).toEqual(['C4@0', '쉼@960', 'D4@1920', 'E4@2880']);
      await press(page.locator('[data-action="check"]'), 'touch');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-ford-q02-passed-touch-portrait-430x932.png');
      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(log.maxDrag).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-4 E2 긴 돌 짧은 돌: 점이 붙은 돌', () => {
  it(
    'E2에 들어가 점2분음표(Q15)를 놓는다: 돌 끝에 점이 달리고, 점2분음표와 4분음표로 마디를 채워 통과한다',
    async () => {
      const { ctx, page, errors } = await boot();
      await enter(page, 'E2', FORD2, 'chip');
      // E2의 줄은 E1과 따로다
      expect((await drawnOf(page, FORD1)).active).toBe(false);
      expect((await drawnOf(page, FORD2)).active).toBe(true);
      await pickTarget(page, Q15);
      await press(page.locator('[data-value="half"][data-dotted="true"]'), 'mouse');
      expect(await page.locator('.inst-hand').getAttribute('data-hand')).toBe('울림돌 C4 점2분음표');
      await tapCell(page, FORD2, 1, 'mouse');
      let t = await waitTimeline(page, FORD2, (x) => x.stones.length === 1, '점2분음표가 놓인다');
      expect(t.stones[0]).toMatchObject({ startTick: 0, endTick: 2880, label: 'C4', dotted: true });
      // 점2분음표는 2880틱(360 px)이다: 칸 여섯 개를 덮는다
      expect(t.stones[0]!.w).toBe(2880 / 8 - 4);
      expect(t.water).toEqual([{ from: 2880, to: 3840, flagged: false, labelled: false, emphasised: false }]);
      await waitLive(page, '남은 물은 4박부터 마디 끝까지 960틱(4분음표 하나 길이)이에요');
      await press(page.locator('[data-value="quarter"]:not([data-dotted])'), 'mouse');
      await press(page.locator('[data-pitch="D4"]'), 'mouse');
      await tapCell(page, FORD2, 7, 'mouse');
      t = await waitTimeline(page, FORD2, (x) => x.stones.length === 2 && x.water.length === 0, '4박에 D4가 놓여 마디가 찬다');
      await press(page.locator('[data-action="check"]'), 'mouse');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-ford-q15-dotted-half-passed.png');
      expect((await drawnOf(page, FORD2)).timeline!.stones.map((s) => s.dotted)).toEqual([true, false]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-4 여울은 걸어 들어갈 수 없다(W-3)', () => {
  it(
    'E1 앞에서 오른쪽으로 걸어도 여울 가장자리에서 멈추고, 돌을 밟은 사건(stepped)이 없다. 징검다리는 밟는 돌이 아니다',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await teleport(page, 'E1')).toBe(true);
      await waitNear(page, 'E1', 20000);
      await recordEvents(page);
      const from = await pos(page);
      await page.keyboard.down('ArrowRight');
      await until(() => pos(page), (p) => p.x > from.x + 20, '오른쪽으로 걷기 시작한다');
      // 걸을 수 있는 만큼 걸을 시간을 준다(220 px/s, 이 자리에서 여울 가장자리까지 50 px쯤)
      await page.waitForTimeout(3000);
      const end = await pos(page);
      await page.keyboard.up('ArrowRight');
      expect(end.x).toBeGreaterThan(from.x + 10);
      // 여울(x 6752~)을 넘지 못한다
      expect(end.x).toBeLessThan(6752);
      expect(Math.abs(end.y - from.y)).toBeLessThan(40);
      expect(await eventsOf(page, 'stepped')).toEqual([]);
      expect(await modeOf(page)).toBeNull();
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

// ───── 6-5 잔물결 수로(E3, 확대형 징검다리, 설계서 4.4) ─────

const waitHand = (page: Page, part: string) => page.waitForFunction((p) => (document.querySelector('.inst-hand')?.getAttribute('data-hand') ?? '').includes(p), part, { timeout: 15000 });
/** 뗏목에 속한 돌의 이름들(시작 순서) */
const raftLabels = (t: DrawnTimeline): string[] => t.stones.filter((s) => s.raft).map((s) => s.label);

describe('6-5 잔물결 수로(E3): 줄은 세로로 길고, 카메라는 고른 칸이 있는 박을 따라간다', () => {
  it(
    '키보드만으로: E3 앞에서 E, 카메라가 첫 박을 담고 PageDown·PageUp으로 박을 따라간다. Q03: 8분 셋잇단 뗏목의 돌마다 다른 음을 정하고 통과한다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      expect(await teleport(page, 'E3')).toBe(true);
      await waitNear(page, 'E3', 20000);
      // 들어가기 전의 수로: 돌도 격자도 박 번호도 없다. 칸은 32개(1박에 8칸)다
      const before = await drawnOf(page, CHANNEL);
      expect(before.active).toBe(false);
      expect(before.slots).toHaveLength(32);
      expect(before.timeline).toMatchObject({ stones: [], water: [], waterEmphasis: false, cursor: null, playTick: null, shoreRocks: null, beats: 0, rafts: 0 });

      await page.keyboard.press('KeyE');
      await page.waitForSelector(`[data-installation-hud="${CHANNEL}"]`);
      expect(await modeOf(page)).toEqual({ installationId: CHANNEL, stationId: 'E3' });
      expect(await hashOf(page)).not.toMatch(/^#\/[sq]\//); // 화면을 옮기지 않는다
      expect((await status(page)).paused).toBe(false);
      // 줄 전체(1920 px)가 아니라 첫 박(480 px)만 화면에 담긴다. 칸 하나는 화면에서 48 px 이상이다
      await expectFollowing(page, 0);
      expect(await liveOf(page)).toContain('PageUp');
      // 줄 전체는 그려져 있고(박 번호 1~4, 격자), 카메라만 박 하나를 담는다
      await waitTimeline(page, CHANNEL, (t, i) => i.active && t.beats === 4, '설치물 모드의 격자와 박 번호 1~4가 그려진다');

      await pickTargetByKeys(page, Q03);
      expect(await handOf(page)).toContain('울림돌 C4');
      const base = await settled(page);

      // PageDown: 2박의 처음 칸. 카메라가 그 박으로 한 박(480 px)만큼 따라간다
      await page.keyboard.press('PageDown');
      await waitLive(page, '2박');
      const second = await expectFollowing(page, 1);
      expect(Math.abs(second.center.y - base.center.y - 480)).toBeLessThan(12);
      expect(Math.abs(second.center.x - base.center.x)).toBeLessThan(1);

      // R: 울림돌 → 이끼돌 → 뗏목. Enter로 2박에 8분 셋잇단 뗏목을 놓는다: 돌 셋(960, 1280, 1600틱)이 한 박(480 px)을 나눈다
      await handUntil(page, 'KeyR', (h) => h.includes('뗏목'), '뗏목');
      expect(await handOf(page)).toBe('8분 셋잇단음표 뗏목(C4)');
      await page.keyboard.press('Enter');
      let t = await waitTimeline(page, CHANNEL, (x) => x.rafts === 1 && x.stones.length === 3, '2박에 뗏목이 놓인다');
      expect(t.stones.map((s) => [s.startTick, s.endTick, s.raft, s.h])).toEqual([
        [960, 1280, true, 156],
        [1280, 1600, true, 156],
        [1600, 1920, true, 156],
      ]);
      // 놓은 뒤에도 고른 칸은 뗏목의 첫 돌이고, 놓으려는 자리의 윤곽은 뗏목 전체다. 카메라는 2박에 머문다
      expect(t.cursor).toEqual({ startTick: 960, endTick: 1920, kind: 'raft', ok: true });
      expect(await cursorTextOf(page)).toContain('2박');
      await expectFollowing(page, 1);

      // 돌마다 다른 음을 정한다: 울림돌을 들고 ↑로 D4, Enter. 첫 돌만 D4가 되고 고른 칸은 둘째 돌로 간다
      await handUntil(page, 'KeyR', (h) => h.startsWith('울림돌'), '울림돌');
      await page.keyboard.press('ArrowUp');
      await waitHand(page, 'D4');
      await page.keyboard.press('Enter');
      t = await waitTimeline(page, CHANNEL, (x) => raftLabels(x).join() === 'D4,C4,C4', '첫 돌만 D4가 된다');
      expect(t.stones.filter((s) => s.raft)).toHaveLength(3);
      await waitCursor(page, '2박 둘째 돌');
      await page.keyboard.press('ArrowUp');
      await waitHand(page, 'E4');
      await page.keyboard.press('Enter');
      await waitTimeline(page, CHANNEL, (x) => raftLabels(x).join() === 'D4,E4,C4', '둘째 돌만 E4가 된다');
      await waitCursor(page, '2박 셋째 돌');
      await page.keyboard.press('ArrowUp');
      await waitHand(page, 'F4');
      await page.keyboard.press('Enter');
      t = await waitTimeline(page, CHANNEL, (x) => raftLabels(x).join() === 'D4,E4,F4', '셋째 돌이 F4가 된다');
      expect(t.rafts).toBe(1);
      // 뗏목 다음 칸(3박)으로 가서 카메라도 3박이다. PageUp: 뗏목이 있는 2박으로 돌아온다
      await expectFollowing(page, 2);
      await page.keyboard.press('PageUp');
      await expectFollowing(page, 1);
      await shot(page, 'phase6-channel-q03-raft-pitches-keyboard.png');

      // PageUp: 1박의 처음. 32분음표(C4) 여덟 개로 1박을 채운다: 한 칸(120틱)이 60 px이다
      await page.keyboard.press('PageUp');
      await waitLive(page, '1박');
      await expectFollowing(page, 0);
      await handUntil(page, 'ArrowDown', (h) => h.startsWith('울림돌 C4'), 'C4');
      await handUntil(page, 'Shift+ArrowDown', (h) => h.endsWith('32분음표'), '32분음표');
      for (let n = 1; n <= 8; n++) {
        await page.keyboard.press('Enter');
        await waitTimeline(page, CHANNEL, (x) => x.stones.length === 3 + n, `${n}번째 32분음표가 놓인다`);
        // 고른 칸은 한 칸씩 내려가고, 카메라는 박 안에서도 고른 칸을 가리지 않게 따라간다. 여덟째 뒤에는 2박의 뗏목 처음이다
        await expectFollowing(page, n < 8 ? 0 : 1, n * CELL_TICKS);
      }
      t = (await drawnOf(page, CHANNEL)).timeline!;
      expect(t.stones.filter((s) => !s.raft).map((s) => `${s.label}@${s.startTick}`)).toEqual(Array.from({ length: 8 }, (_, i) => `C4@${i * 120}`));
      expect(t.stones.filter((s) => !s.raft).every((s) => s.endTick - s.startTick === 120 && s.h === 56)).toBe(true);

      // PageDown: 3박의 처음(1920틱). 이끼돌을 들고 Shift+↑로 2분쉼표까지 늘여 놓는다: 3박과 4박(960 px)을 한 돌이 덮는다
      await page.keyboard.press('PageDown');
      await waitLive(page, '3박');
      await expectFollowing(page, 2);
      await handUntil(page, 'KeyR', (h) => h.startsWith('이끼돌'), '이끼돌');
      await handUntil(page, 'Shift+ArrowUp', (h) => /\s2분쉼표/.test(h), '2분쉼표'); // '32분쉼표'에도 '2분쉼표'가 들어 있어서 앞의 공백까지 본다
      await page.keyboard.press('Enter');
      t = await waitTimeline(page, CHANNEL, (x) => x.stones.length === 12 && x.water.length === 0, '3박에 2분쉼표가 놓여 마디가 찬다');
      expect(t.stones[11]).toMatchObject({ startTick: 1920, endTick: 3840, kind: 'rest', label: '쉼', h: 956 });
      // 확인하기 전에는 맞고 틀림을 알리지 않는다
      expect(await feedbackOf(page)).toBe('none');
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-channel-q03-passed-keyboard.png');

      // P: 내 배치 듣기. 물결 선이 줄을 따라 내려가고(소리를 꺼 두어도 보인다, W-8) 카메라가 물결 선이 있는 박을 따라간다
      await page.keyboard.press('KeyP');
      const samples: Array<{ tick: number; y: number }> = [];
      const end = Date.now() + 20000;
      let seen = false;
      while (Date.now() < end) {
        const tl = (await drawnOf(page, CHANNEL)).timeline!;
        if (tl.playTick !== null) {
          seen = true;
          samples.push({ tick: tl.playTick, y: (await dbg(page)).center.y });
        } else if (seen) break;
        await page.waitForTimeout(100);
      }
      expect(seen).toBe(true);
      expect(samples.length).toBeGreaterThan(6);
      // 처음에는 1박 가까이에 있다가 마지막에는 아래쪽 박(3~4박)까지 내려간다: 카메라가 물결 선을 따라 두 박 넘게 움직였다
      const ys = samples.map((s) => s.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2 * 480 - 60);
      expect(Math.max(...samples.map((s) => s.tick))).toBeGreaterThan(2880);

      // H: 도움 카드에 박 옮기기 키가 있다
      await page.keyboard.press('KeyH');
      await page.waitForSelector('#inst-help');
      const help = (await page.locator('#inst-help').textContent()) ?? '';
      expect(help).toContain('PageUp PageDown');
      expect(help).toContain('박 옮기기');
      await page.keyboard.press('Escape');
      await page.waitForSelector('#inst-help', { state: 'detached' });

      // 방향키는 칸을 옮기는 키다: 모드에서는 캐릭터가 걷지 않는다(W-3)
      const standing = await pos(page);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('PageDown');
      expect(Math.hypot((await pos(page)).x - standing.x, (await pos(page)).y - standing.y)).toBeLessThan(1);

      // Esc: 나간다. 박 번호와 격자는 사라지고 놓은 돌은 풍경으로 남는다
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      await waitUnframed(page);
      expect(await modeOf(page)).toBeNull();
      const out = await waitTimeline(page, CHANNEL, (x, i) => !i.active && x.beats === 0, '모드에서 나온 수로가 그려진다');
      expect(out.stones).toHaveLength(12);
      expect(out.rafts).toBe(1);
      expect(out.cursor).toBeNull();

      // 이 모든 것을 마우스 없이 했다
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(log.maxDrag).toBe(0);
      expect(log.keys).toBeGreaterThan(40);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '마우스 클릭만으로: Q18의 뗏목 두 종류(8분 셋잇단 한 박, 4분 셋잇단 두 박)를 놓고, 뗏목의 돌 하나를 눌러 그 돌의 음만 바꾼다. 확인하면 통과한다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true });
      await enter(page, 'E3', CHANNEL, 'chip');
      await pickTarget(page, Q18);
      await expectFollowing(page, 0);

      // 4분음표 C4를 1박에 놓는다. 고른 칸이 2박으로 가면 박 단추를 누르지 않아도 카메라가 따라간다
      await press(page.locator('[data-value="quarter"]:not([data-dotted])'), 'mouse');
      await tapCell(page, CHANNEL, 1, 'mouse');
      await waitTimeline(page, CHANNEL, (x) => x.stones.length === 1, '1박에 4분음표가 놓인다');
      await expectFollowing(page, 1);

      // 뗏목을 든다: 길이 단추 자리에 뗏목 종류 단추 둘이 온다(짧은 것부터). 처음에는 8분 셋잇단을 들고 있다
      await press(page.locator('[data-kind="raft"]'), 'mouse');
      await page.waitForSelector('[data-tuplet]');
      expect(await page.locator('[data-tuplet]').count()).toBe(2);
      expect(await page.locator('[data-tuplet]').nth(0).getAttribute('aria-pressed')).toBe('true');
      expect(await page.locator('[data-value]').count()).toBe(0);
      await press(page.locator('[data-pitch="D4"]'), 'mouse');
      // 2박의 첫 칸(960–1079틱)을 누르면 2박의 처음에 뗏목이 놓인다
      await tapCell(page, CHANNEL, 9, 'mouse');
      let t = await waitTimeline(page, CHANNEL, (x) => x.rafts === 1, '2박에 8분 셋잇단 뗏목이 놓인다');
      expect(t.stones.filter((s) => s.raft).map((s) => `${s.label}@${s.startTick}+${s.endTick - s.startTick}`)).toEqual(['D4@960+320', 'D4@1280+320', 'D4@1600+320']);

      // 뗏목의 둘째 돌(1280–1599틱)의 한가운데를 누른다: 덮어쓰지 않고 그 돌만 골라진다
      await press(page.locator('[data-kind="note"]'), 'mouse');
      await tapTick(page, 1440, 'mouse');
      await waitCursor(page, '2박 둘째 돌');
      expect(raftLabels((await drawnOf(page, CHANNEL)).timeline!)).toEqual(['D4', 'D4', 'D4']);
      await press(page.locator('[data-pitch="E4"]'), 'mouse');
      await press(page.locator('[data-action="place"]'), 'mouse');
      await waitTimeline(page, CHANNEL, (x) => raftLabels(x).join() === 'D4,E4,D4', '둘째 돌만 E4가 된다');
      // 고른 칸은 셋째 돌로 갔다
      await press(page.locator('[data-pitch="F4"]'), 'mouse');
      await press(page.locator('[data-action="place"]'), 'mouse');
      await waitTimeline(page, CHANNEL, (x) => raftLabels(x).join() === 'D4,E4,F4', '셋째 돌이 F4가 된다');

      // 4분 셋잇단 뗏목: 두 박(960 px)이다. 3박에서 시작해 4박까지 걸친다
      await press(page.locator('[data-kind="raft"]'), 'mouse');
      await press(page.locator('[data-tuplet]').nth(1), 'mouse');
      expect(await handOf(page)).toContain('4분 셋잇단음표 뗏목');
      await press(page.locator('[data-pitch="G4"]'), 'mouse');
      await expectFollowing(page, 2);
      await tapCell(page, CHANNEL, 17, 'mouse');
      t = await waitTimeline(page, CHANNEL, (x) => x.rafts === 2, '3박에 4분 셋잇단 뗏목이 놓인다');
      expect(t.stones.filter((s) => s.raft && s.startTick >= 1920).map((s) => `${s.label}@${s.startTick}+${s.endTick - s.startTick}`)).toEqual(['G4@1920+640', 'G4@2560+640', 'G4@3200+640']);
      // 둘째 돌(2560–3199틱)은 3박과 4박의 경계에 걸친다
      expect(t.stones.filter((s) => s.raft && s.startTick >= 1920).map((s) => s.h)).toEqual([316, 316, 316]);

      // 둘째 돌: 작은 화면에서는 조작 막대가 돌의 아랫부분을 가리므로 다음 칸 단추로 옮긴다. 카메라가 고른 돌을 따라간다
      await press(page.locator('[data-kind="note"]'), 'mouse');
      await press(page.locator('[data-action="cursor-right"]'), 'mouse');
      await waitCursor(page, '3박 둘째 돌');
      await expectFollowing(page, 2, 2560);
      await press(page.locator('[data-pitch="A4"]'), 'mouse');
      await press(page.locator('[data-action="place"]'), 'mouse');
      await waitTimeline(page, CHANNEL, (x) => raftLabels(x).slice(3).join() === 'G4,A4,G4', '둘째 돌만 A4가 된다');
      // 고른 칸이 셋째 돌(3200틱, 4박 칸)로 가서 카메라가 4박으로 따라간다. 4박에 보이는 셋째 돌을 눌러도 그 돌만 골라진다
      await expectFollowing(page, 3, 3200);
      await tapTick(page, 3500, 'mouse');
      await waitCursor(page, '3박 셋째 돌');
      await press(page.locator('[data-pitch="G4"]'), 'mouse');
      await press(page.locator('[data-action="place"]'), 'mouse');
      t = await waitTimeline(page, CHANNEL, (x) => x.water.length === 0 && raftLabels(x).join() === 'D4,E4,F4,G4,A4,G4', '마디가 찬다');
      expect(t.stones).toHaveLength(7);

      await press(page.locator('[data-action="check"]'), 'mouse');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-channel-q18-passed-mouse.png');
      // 마우스로 눌렀지만 끌지는 않았다
      const log = await inputLog(page);
      expect(log.maxDrag).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '터치만으로(세로 화면 430×932): 열기 단추를 눌러 들어가 Q17(16분음표)을 끌지 않고 푼다. 칸 하나가 화면에서 48 px 이상이고 카메라가 박을 따라간다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, log: true });
      await enter(page, 'E3', CHANNEL, 'tap');
      const first = await expectFollowing(page, 0);
      await pickTarget(page, Q17, 'touch');
      await expectFollowing(page, 0);
      // 박 단추도 있다(이전 박, 다음 박): 손가락으로 박을 옮긴다
      await press(page.locator('[data-action="beat-next"]'), 'touch');
      const second = await expectFollowing(page, 1);
      expect(Math.abs(second.center.y - first.center.y - 480)).toBeLessThan(12);
      await press(page.locator('[data-action="beat-prev"]'), 'touch');
      await expectFollowing(page, 0);

      // Q17: C4 D4 E4 F4(16분음표), G4 G4(8분음표), E4(2분음표)
      await press(page.locator('[data-value="sixteenth"]'), 'touch');
      await press(page.locator('[data-pitch="C4"]'), 'touch');
      await tapCell(page, CHANNEL, 1, 'touch');
      await waitTimeline(page, CHANNEL, (x) => x.stones.length === 1, '16분음표 C4가 놓인다');
      for (const [pitch, slot, n] of [['D4', 3, 2], ['E4', 5, 3], ['F4', 7, 4]] as const) {
        await press(page.locator(`[data-pitch="${pitch}"]`), 'touch');
        await tapCell(page, CHANNEL, slot, 'touch');
        await waitTimeline(page, CHANNEL, (x) => x.stones.length === n, `16분음표 ${pitch}가 놓인다`);
      }
      // 1박이 차서 고른 칸이 2박으로 갔다: 카메라도 2박이다
      await expectFollowing(page, 1);
      await press(page.locator('[data-value="eighth"]:not([data-dotted])'), 'touch');
      await press(page.locator('[data-pitch="G4"]'), 'touch');
      await tapCell(page, CHANNEL, 9, 'touch');
      await waitTimeline(page, CHANNEL, (x) => x.stones.length === 5, '8분음표 G4가 놓인다');
      await tapCell(page, CHANNEL, 13, 'touch');
      await waitTimeline(page, CHANNEL, (x) => x.stones.length === 6, '8분음표 G4가 하나 더 놓인다');
      await press(page.locator('[data-value="half"]:not([data-dotted])'), 'touch');
      await press(page.locator('[data-pitch="E4"]'), 'touch');
      await expectFollowing(page, 2);
      await tapCell(page, CHANNEL, 17, 'touch');
      const t = await waitTimeline(page, CHANNEL, (x) => x.stones.length === 7 && x.water.length === 0, '3박에 2분음표 E4가 놓여 마디가 찬다');
      expect(t.stones.map((s) => `${s.label}@${s.startTick}+${s.endTick - s.startTick}`)).toEqual(['C4@0+240', 'D4@240+240', 'E4@480+240', 'F4@720+240', 'G4@960+480', 'G4@1440+480', 'E4@1920+1920']);
      await press(page.locator('[data-action="check"]'), 'touch');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-channel-q17-passed-touch-portrait-430x932.png');
      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(log.maxDrag).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-5 수로는 걸어 들어갈 수 없다(W-3)', () => {
  it(
    'E3 앞에서 오른쪽으로 걸어도 수로 가장자리에서 멈추고, 돌을 밟은 사건(stepped)이 없다',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await teleport(page, 'E3')).toBe(true);
      await waitNear(page, 'E3', 20000);
      await recordEvents(page);
      const from = await pos(page);
      await page.keyboard.down('ArrowRight');
      await until(() => pos(page), (p) => p.x > from.x + 20, '오른쪽으로 걷기 시작한다');
      // 서는 자리에서 수로 서쪽 가장자리(x 6624)까지 64 px이다: 220 px/s로 충분히 걸을 시간을 준다
      await page.waitForTimeout(3000);
      const end = await pos(page);
      await page.keyboard.up('ArrowRight');
      expect(end.x).toBeGreaterThan(from.x + 10);
      expect(end.x).toBeLessThan(6624);
      expect(Math.abs(end.y - from.y)).toBeLessThan(40);
      expect(await eventsOf(page, 'stepped')).toEqual([]);
      expect(await modeOf(page)).toBeNull();
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

// ───── 6-6 물레방아(E4, 설계서 4.5): 바퀴와 펼친 띠는 같은 초안이다(12.9) ─────

/**
 * E4의 바퀴. 중심과 반지름은 설치물 파일(slotMap.wheel)이 정하고, 칸은 띠의 칸(6개, 한 칸 480틱)과 같다.
 * 칸은 12시에서 시계 방향으로 나뉘고 못이 놓이는 고리는 반지름의 0.52~0.88 구간이다(바퀴가 돌지 않을 때의 자리)
 */
const WH = {
  cx: e4.slotMap.wheel.cx,
  cy: e4.slotMap.wheel.cy,
  r: e4.slotMap.wheel.r,
  cells: e4.slots.length,
  cellTicks: e4.slotMap.cellTicks,
  turnTicks: e4.slots.length * e4.slotMap.cellTicks,
  ringIn: 0.52,
  ringOut: 0.88,
  /** 띠 왼쪽에 붙는 박 번호 띠의 폭(월드 px) */
  labelBand: 44,
};
/** 카메라가 바퀴와 띠 둘레에 남기는 여유(월드 px). frameTuningOf(E4).pad */
const WHEEL_PAD = 24;
/** 카메라가 담아야 하는 자리: 박 번호 띠를 포함한 띠와 바퀴 전체(월드 px) */
const WHEEL_FRAME = {
  left: e4.slots[0]!.x - WH.labelBand,
  right: WH.cx + WH.r,
  top: Math.min(e4.slots[0]!.y, WH.cy - WH.r),
  bottom: Math.max(e4.slots[e4.slots.length - 1]!.y + e4.slots[e4.slots.length - 1]!.h, WH.cy + WH.r),
};
const tickAngle = (tick: number): number => (tick * 360) / WH.turnTicks;

/** 바퀴의 n번 칸(1부터)의 가운데 점(월드 px): 고리의 한가운데 */
function wheelCellWorld(n: number): { x: number; y: number } {
  const rad = (((n - 0.5) * 360) / WH.cells) * (Math.PI / 180);
  const radius = ((WH.ringIn + WH.ringOut) / 2) * WH.r;
  return { x: WH.cx + radius * Math.sin(rad), y: WH.cy - radius * Math.cos(rad) };
}

/** 바퀴 칸의 화면 자리. 카메라가 가만히 있을 때 읽고, 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다 */
async function wheelPoint(page: Page, world: { x: number; y: number }, what: string): Promise<{ x: number; y: number }> {
  const d = await settled(page);
  const at = toScreen(d, world.x, world.y);
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  if (tag !== 'CANVAS') throw new Error(`${what}(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받지 않아요: ${tag}`);
  return at;
}
const tapWheel = async (page: Page, n: number, how: Pointer): Promise<void> => {
  const p = await wheelPoint(page, wheelCellWorld(n), `바퀴 ${n}번 칸 자리`);
  await (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
};

/**
 * 카메라가 바퀴와 띠를 설계서 7.3대로 담고 있는가(가만히 설 때까지 기다린 뒤):
 *  - 칸이 화면에서 48 px 아래로 줄지 않는다: 띠의 칸(80 px)도, 바퀴 고리의 두께(반지름의 0.36)도.
 *  - 바퀴와 띠 전체(여유 24 px 포함)가 메뉴 띠 아래, 조작 막대 위에 들어오는 큰 화면에서는 전체가 보인다.
 *  - 그만큼 들어오지 않는 작은 화면에서는 고른 칸(cell, 1부터. 없으면 바퀴의 가운데)을 비춘다: 그 칸의 바퀴 쪽 가운데가 메뉴 띠 아래,
 *    조작 막대 위에 있고, 그 자리를 캔버스가 직접 받는다(HUD나 메뉴 단추가 덮지 않는다).
 */
async function expectWheelFramed(page: Page, cell?: number): Promise<Dbg> {
  const d = await settled(page);
  const vp = page.viewportSize()!;
  const room = vp.height - (await insetOf(page));
  expect(e4.slots[0]!.h * d.zoom, '띠의 칸 하나의 화면 크기').toBeGreaterThanOrEqual(48 - 1e-6);
  expect((WH.ringOut - WH.ringIn) * WH.r * d.zoom, '바퀴 고리의 두께').toBeGreaterThanOrEqual(48 - 1e-6);
  const a = toScreen(d, WHEEL_FRAME.left, WHEEL_FRAME.top);
  const b = toScreen(d, WHEEL_FRAME.right, WHEEL_FRAME.bottom);
  const seenH = (room - MENU_BAND) / d.zoom; // 메뉴 띠 아래부터 조작 막대 위까지 보이는 월드 높이
  if (seenH >= WHEEL_FRAME.bottom - WHEEL_FRAME.top + 2 * WHEEL_PAD - 1e-6) {
    expect(a.x, '띠와 박 번호 띠의 왼쪽').toBeGreaterThanOrEqual(-0.5);
    expect(vp.width - b.x, '바퀴의 오른쪽').toBeGreaterThanOrEqual(-0.5);
    expect(a.y, '바퀴와 띠의 위쪽(메뉴 띠 아래)').toBeGreaterThanOrEqual(MENU_BAND - 0.5);
    expect(room - b.y, '바퀴와 띠의 아래쪽(조작 막대 위)').toBeGreaterThanOrEqual(-0.5);
  } else {
    const at = toScreen(d, ...(cell === undefined ? ([WH.cx, WH.cy] as const) : (Object.values(wheelCellWorld(cell)) as [number, number])));
    const where = cell === undefined ? '바퀴의 가운데' : `바퀴 ${cell}번 칸`;
    expect(at.x, `${where} 왼쪽`).toBeGreaterThanOrEqual(-0.5);
    expect(vp.width - at.x, `${where} 오른쪽`).toBeGreaterThanOrEqual(-0.5);
    expect(at.y, `${where} 위쪽(메뉴 띠 아래)`).toBeGreaterThanOrEqual(MENU_BAND - 0.5);
    expect(room - at.y, `${where} 아래쪽(조작 막대 위)`).toBeGreaterThanOrEqual(-0.5);
    const hit = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
    expect(hit, `${where}(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받는다`).toBe('CANVAS');
  }
  return d;
}

/**
 * 바퀴의 못과 띠의 돌이 같은 초안인가(12.9): 같은 수, 같은 시작과 끝, 같은 종류와 이름과 점과 표시, 같은 놓으려는 자리와 듣는 위치.
 * 못이 덮지 않은 칸(빈 구멍)은 띠의 돌이 덮지 않은 칸이고, 판정이 알린 빈 구멍은 띠가 강조한 물과 같은 칸이다. 못의 각도는 틱에 비례한다.
 */
function expectSameDraft(d: DrawnInstallation): void {
  const t = d.timeline!;
  const w = d.wheel!;
  expect(w.nails.map((n) => [n.startTick, n.endTick, n.kind, n.label, n.dotted, n.flagged, n.playing])).toEqual(t.stones.map((s) => [s.startTick, s.endTick, s.kind, s.label, s.dotted, s.flagged, s.playing]));
  expect(w.cursor).toEqual(t.cursor);
  expect(w.playTick).toBe(t.playTick);
  const covered = (s: DrawnStone, c: number): boolean => s.startTick < c * WH.cellTicks && s.endTick > (c - 1) * WH.cellTicks;
  const holes = Array.from({ length: WH.cells }, (_, i) => i + 1).filter((c) => !t.stones.some((s) => covered(s, c)));
  expect(w.holes, '못이 덮지 않은 칸').toEqual(holes);
  expect(w.flaggedHoles, '판정이 알린 빈 구멍').toEqual(holes.filter((c) => t.waterEmphasis || t.water.some((m) => m.flagged && m.from < c * WH.cellTicks && m.to > (c - 1) * WH.cellTicks)));
  for (const n of w.nails) {
    expect(n.startDeg).toBeCloseTo(tickAngle(n.startTick), 6);
    expect(n.endDeg).toBeCloseTo(tickAngle(n.endTick), 6);
  }
  // 바퀴가 도는 각도는 듣는 위치(틱)에 비례한다: 한 마디에 한 바퀴. 듣지 않으면 0이다
  expect(w.turnDeg).toBeCloseTo(w.playTick === null ? 0 : tickAngle(Math.min(Math.max(0, w.playTick), WH.turnTicks)), 6);
}

/** 바퀴의 그려진 모습이 조건을 채울 때까지(띠도 함께 그려져 있어야 한다). 읽은 설치물 하나를 돌려준다 */
async function waitWheel(page: Page, ok: (w: DrawnWheel, d: DrawnInstallation) => boolean, what: string): Promise<DrawnInstallation> {
  return until(() => drawnOf(page, WHEEL), (i) => !!i.wheel && !!i.timeline && ok(i.wheel, i), what);
}

interface WheelSample {
  playTick: number | null;
  turnDeg: number;
  clapper: boolean;
  /** 듣는 못의 시작 틱들 */
  playing: number[];
}
/** 페이지 안에서 프레임마다 바퀴의 도는 각도를 모은다: 느린 Chrome에서도 듣는 동안의 값이 빠짐없이 남는다(값이 바뀔 때만 담는다) */
const startWheelSampler = (page: Page): Promise<void> =>
  page.evaluate((id) => {
    const w = window as unknown as { __game: Game; __wheelSamples?: WheelSample[] };
    const out: WheelSample[] = [];
    w.__wheelSamples = out;
    const frame = (): void => {
      const wheel = w.__game.world.debugState()?.installations.find((i) => i.installationId === id)?.wheel;
      if (wheel) {
        const next: WheelSample = { playTick: wheel.playTick, turnDeg: wheel.turnDeg, clapper: wheel.clapper, playing: wheel.nails.filter((n) => n.playing).map((n) => n.startTick) };
        const last = out[out.length - 1];
        if (!last || last.playTick !== next.playTick || last.turnDeg !== next.turnDeg || last.clapper !== next.clapper || last.playing.join() !== next.playing.join()) out.push(next);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, WHEEL);
const wheelSamples = (page: Page): Promise<WheelSample[]> => page.evaluate(() => (window as unknown as { __wheelSamples?: WheelSample[] }).__wheelSamples ?? []);
/** 듣기가 시작되어 끝날 때까지 기다린다(듣는 위치가 나타났다가 다시 사라진다) */
async function waitHeard(page: Page): Promise<WheelSample[]> {
  await page.waitForFunction(() => ((window as unknown as { __wheelSamples?: WheelSample[] }).__wheelSamples ?? []).some((s) => s.playTick !== null), undefined, { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const list = (window as unknown as { __wheelSamples?: WheelSample[] }).__wheelSamples ?? [];
      return list.length > 0 && list[list.length - 1]!.playTick === null && list.some((s) => s.playTick !== null);
    },
    undefined,
    { timeout: 30000 },
  );
  return wheelSamples(page);
}

describe('6-6 물레방아(E4): 바퀴와 펼친 띠는 같은 초안이다', () => {
  it(
    '키보드만으로: E4 앞에서 E, 카메라가 띠와 바퀴를 함께 담는다. Q19(점4분 + 8분 셋)를 못으로 채워 통과하고, 듣는 동안 바퀴가 한 마디에 한 바퀴 돈다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      expect(await teleport(page, 'E4')).toBe(true);
      await waitNear(page, 'E4', 20000);
      // 들어가기 전: 바퀴는 풍경으로 서 있다. 못도 번호도 방망이도 없고, 띠는 칸 6개에 돌이 없다
      const before = await drawnOf(page, WHEEL);
      expect(before.active).toBe(false);
      expect(before.slots).toHaveLength(6);
      expect(before.timeline).toMatchObject({ stones: [], water: [], cursor: null, playTick: null, beats: 0 });
      expect(before.wheel).toMatchObject({ cx: 6144, cy: 2336, r: 240, cells: 6, turnDeg: 0, nails: [], holes: [1, 2, 3, 4, 5, 6], flaggedHoles: [], cursor: null, playTick: null, numbered: false, clapper: false });

      await page.keyboard.press('KeyE');
      await page.waitForSelector(`[data-installation-hud="${WHEEL}"]`);
      expect(await modeOf(page)).toEqual({ installationId: WHEEL, stationId: 'E4' });
      expect(await hashOf(page)).not.toMatch(/^#\/[sq]\//); // 화면을 옮기지 않는다
      expect((await status(page)).paused).toBe(false);
      // 카메라는 띠와 바퀴를 담는다: 큰 화면에서는 전체를, 작은 화면에서는 칸을 48 px 아래로 줄이지 않고 고른 칸을 비춘다(7.3)
      await expectWheelFramed(page);
      const hud = hudOf(page, WHEEL);
      expect(await hud.getAttribute('aria-label')).toBe('물레방아 작업대');
      expect(await hud.getAttribute('data-target')).toBe('free');
      const live = await liveOf(page);
      expect(live).toContain('물레방아에 들어왔어요');
      expect(live).toContain('못을 놓아요');
      expect(live).not.toContain('PageUp'); // 바퀴는 박을 따라 옮기지 않는다
      // 말은 못과 빈 구멍이다: 재료 선반, 손에 든 것, 길이 단추(세 칸까지: 8분, 4분, 점4분)
      expect(await page.locator('[aria-label="재료 선반: 못의 종류와 길이"]').count()).toBe(1);
      expect(await handOf(page)).toBe('울림 못 C4 8분음표');
      expect(await page.locator('[data-value]').allTextContents()).toEqual(['8분음표', '4분음표', '점4분음표']);
      expect(await page.locator('.inst-water').textContent()).toContain('빈 구멍은 1박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
      // 설치물 모드의 바퀴: 칸 번호와 큰 박 번호, 12시의 방망이. 6/8의 큰 박은 둘(줄무늬, 점무늬)이다
      let d = await waitWheel(page, (w, i) => i.active && w.numbered && w.clapper, '설치물 모드의 바퀴에 번호와 방망이가 그려진다');
      expect(d.wheel).toMatchObject({ nails: [], holes: [1, 2, 3, 4, 5, 6], turnDeg: 0, playTick: null });
      expect(d.wheel!.beats).toEqual([
        { beat: 1, fromTick: 0, toTick: 1440, pattern: 'stripes' },
        { beat: 2, fromTick: 1440, toTick: 2880, pattern: 'dots' },
      ]);
      expect(d.timeline!.beats).toBe(2);
      expectSameDraft(d);
      await shot(page, 'phase6-wheel-free-keyboard-1280x720.png');

      await pickTargetByKeys(page, Q19A);
      await expectWheelFramed(page);

      // → : 첫 칸부터. PageDown, PageUp은 큰 박 단위로 옮긴다: 6/8의 2박은 1440틱(바퀴의 6시, 4번 칸)이다. 카메라는 고른 칸을 비춘다
      await page.keyboard.press('ArrowRight');
      d = await waitWheel(page, (w) => w.cursor !== null && w.cursor.startTick === 0, '고른 칸이 1번 칸이다');
      await expectWheelFramed(page, 1);
      await page.keyboard.press('PageDown');
      d = await waitWheel(page, (w) => w.cursor !== null && w.cursor.startTick === 1440, '고른 칸이 2박으로 옮겨 간다');
      await waitLive(page, '2박');
      expectSameDraft(d);
      await expectWheelFramed(page, 4);
      await page.keyboard.press('PageUp');
      await waitWheel(page, (w) => w.cursor !== null && w.cursor.startTick === 0, '고른 칸이 1박으로 돌아온다');
      await expectWheelFramed(page, 1);
      // 점4분 못을 들면(Shift+↑) 놓을 자리가 세 칸(1박 전체)으로 그려지고, 바퀴의 윤곽도 같다
      await handUntil(page, 'Shift+ArrowUp', (hand) => hand.endsWith('점4분음표'), '점4분음표');
      expect(await handOf(page)).toBe('울림 못 C4 점4분음표');
      d = await waitWheel(page, (w) => w.cursor !== null && w.cursor.endTick === 1440, '고른 칸이 놓을 자리로 그려진다');
      expect(d.wheel!.cursor).toEqual({ startTick: 0, endTick: 1440, kind: 'note', ok: true });
      expectSameDraft(d);

      // Enter: 1박에 점4분 못. 바퀴의 못은 12시에서 6시까지(0°–180°), 남은 세 칸은 빈 구멍이다
      await page.keyboard.press('Enter');
      d = await waitWheel(page, (w) => w.nails.length === 1, '1박에 못이 놓인다');
      expect(d.wheel!.nails[0]).toMatchObject({ startTick: 0, endTick: 1440, kind: 'note', label: 'C4', dotted: true, flagged: false, playing: false, startDeg: 0, endDeg: 180 });
      expect(d.wheel!.holes).toEqual([4, 5, 6]);
      expect(d.timeline!.stones).toHaveLength(1);
      expectSameDraft(d);
      await waitLive(page, '1박에 C4 점4분음표를 놓았어요.');
      expect(await page.locator('.inst-water').textContent()).toContain('빈 구멍은 2박부터 마디 끝까지 1440틱(점4분음표 하나 길이)이에요.');
      // 고른 칸은 놓은 못의 다음 칸(2박, 4번 칸)으로 갔고 카메라가 따라간다
      await expectWheelFramed(page, 4);

      // 덜 채우고 확인하면 통과하지 못한다: 빈 구멍(4~6번)이 산호색 테두리로 강조되고 띠의 남은 물도 같이 강조된다
      await page.keyboard.press('KeyC');
      await page.waitForFunction(() => ['needsRevision', 'technical'].includes(document.querySelector('.inst-feedback')?.getAttribute('data-feedback') ?? ''), undefined, { timeout: 15000 });
      expect(await feedbackOf(page)).not.toBe('passed');
      d = await waitWheel(page, (w) => w.flaggedHoles.length > 0, '판정이 알린 빈 구멍이 강조된다');
      expect(d.wheel!.flaggedHoles).toEqual([4, 5, 6]);
      expect(d.timeline!.waterEmphasis).toBe(true);
      expectSameDraft(d);
      await shot(page, 'phase6-wheel-q19-needs-revision-keyboard.png');

      // Shift+↓로 8분 못까지 줄여 2박의 세 칸(4, 5, 6번)을 차례로 놓는다: 목표는 D4 E4 F4다(↑로 한 음씩 올린다). 놓을 때마다 고른 칸이 다음 칸으로 간다
      await handUntil(page, 'Shift+ArrowDown', (hand) => hand.endsWith(' 8분음표'), '8분음표');
      for (const [n, pitch] of [[2, 'D4'], [3, 'E4'], [4, 'F4']] as const) {
        await page.keyboard.press('ArrowUp');
        await waitHand(page, pitch);
        await page.keyboard.press('Enter');
        d = await waitWheel(page, (w) => w.nails.length === n, `${n}번째 못(${pitch})이 놓인다`);
        expectSameDraft(d);
      }
      expect(d.wheel!.nails.map((n) => `${n.label}@${n.startTick}+${n.endTick - n.startTick}`)).toEqual(['C4@0+1440', 'D4@1440+480', 'E4@1920+480', 'F4@2400+480']);
      expect(d.wheel!.holes).toEqual([]);
      expect(d.wheel!.flaggedHoles).toEqual([]);
      expect(await page.locator('.inst-water').textContent()).toContain('빈 구멍이 없어요. 못이 한 마디를 빈틈없이 채웠어요.');
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      expect(await page.locator('.inst-feedback').textContent()).toContain('못이 한 마디를 빈틈없이 채웠고 목표와 같아요.');
      d = await drawnOf(page, WHEEL);
      expect(d.wheel!.flaggedHoles).toEqual([]);
      expect(d.wheel!.nails.every((n) => !n.flagged)).toBe(true);
      await shot(page, 'phase6-wheel-q19-passed-keyboard.png');

      // P: 내 배치 듣기. 바퀴가 한 마디(2880틱)에 한 바퀴 돈다. 소리를 꺼 두어도 보인다(W-8): 방망이 아래로 오는 못이 금빛이 된다
      await startWheelSampler(page);
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => ((window as unknown as { __wheelSamples?: WheelSample[] }).__wheelSamples ?? []).some((s) => s.turnDeg > 100), undefined, { timeout: 20000 }).catch(() => undefined);
      await shot(page, 'phase6-wheel-q19-playing-keyboard.png');
      const heard = await waitHeard(page);
      const playing = heard.filter((s) => s.playTick !== null);
      expect(playing.length).toBeGreaterThan(3);
      for (const s of playing) {
        expect(s.clapper).toBe(true);
        expect(s.turnDeg, `듣는 위치 ${s.playTick}틱에서 돈 각도`).toBeCloseTo(tickAngle(Math.min(s.playTick!, WH.turnTicks)), 6);
      }
      const turns = playing.map((s) => s.turnDeg);
      expect([...turns].sort((a, b) => a - b), '바퀴는 거꾸로 돌지 않는다').toEqual(turns);
      expect(Math.max(...turns), '한 마디에 한 바퀴: 끝 가까이에서는 거의 한 바퀴를 돌았다').toBeGreaterThan(270);
      expect(Math.min(...turns), '처음에는 12시 가까이에서 시작한다').toBeLessThan(90);
      expect(playing.some((s) => s.playing.length > 0), '듣는 못이 금빛으로 표시된다').toBe(true);
      // 듣기가 끝나면 바퀴는 처음 자리로 돌아오고(돌지 않는 바퀴) 못은 그대로다
      d = await waitWheel(page, (w) => w.playTick === null && w.turnDeg === 0 && w.nails.every((n) => !n.playing), '듣기가 끝나 바퀴가 제자리로 돌아온다');
      expect(d.wheel!.nails).toHaveLength(4);
      expect(d.wheel!.clapper).toBe(true); // 설치물 모드에서는 방망이가 늘 보인다
      expectSameDraft(d);

      // H: 도움 카드는 못의 말로 쓰여 있다(돌이라는 말이 없다). 박 옮기기 키(PageUp PageDown)는 징검다리와 같다
      await page.keyboard.press('KeyH');
      await page.waitForSelector('#inst-help');
      const help = (await page.locator('#inst-help').textContent()) ?? '';
      expect(help).toContain('칸을 눌러도 손에 든 못이 놓여요');
      expect(help).toContain('PageUp PageDown');
      expect(help).toContain('박 옮기기');
      expect(help).not.toContain('돌');
      await page.keyboard.press('Escape');
      await page.waitForSelector('#inst-help', { state: 'detached' });

      // 방향키는 칸을 옮기는 키다: 모드에서는 캐릭터가 걷지 않는다(W-3)
      const standing = await pos(page);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowDown');
      expect(Math.hypot((await pos(page)).x - standing.x, (await pos(page)).y - standing.y)).toBeLessThan(1);

      // Esc: 나간다. 칸 번호와 방망이는 사라지고 놓은 못은 풍경으로 남는다
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      await waitUnframed(page);
      expect(await modeOf(page)).toBeNull();
      d = await waitWheel(page, (w, i) => !i.active && !w.numbered && !w.clapper, '모드에서 나온 바퀴가 그려진다');
      expect(d.wheel!.nails).toHaveLength(4);
      expect(d.wheel!.cursor).toBeNull();
      expect(d.timeline!.stones).toHaveLength(4);

      // 이 모든 것을 마우스 없이 했다
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(log.maxDrag).toBe(0);
      expect(log.keys).toBeGreaterThan(20);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '마우스 클릭만으로(1920×1080): 바퀴의 칸을 눌러 Q19(4분·8분·4분·8분)를 푼다. 못이 있는 칸은 고르기만 하고, 바퀴 밖과 허브는 아무 일도 없고, 겹치면 이유를 알리고, 띠의 칸을 눌러도 같다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 1920, h: 1080, log: true });
      await enter(page, 'E4', WHEEL, 'chip');
      await expectWheelFramed(page);
      await pickTarget(page, Q19B);
      await expectWheelFramed(page);

      // 4분 못(C4)을 들고 바퀴의 1번 칸을 누른다: 그 칸(0틱)에 4분 못이 놓인다(두 칸). 띠에도 같은 돌이 놓인다
      await press(page.locator('[data-value="quarter"]:not([data-dotted])'), 'mouse');
      await tapWheel(page, 1, 'mouse');
      let d = await waitWheel(page, (w) => w.nails.length === 1, '바퀴 1번 칸에 4분 못이 놓인다');
      expect(d.wheel!.nails[0]).toMatchObject({ startTick: 0, endTick: 960, kind: 'note', label: 'C4', dotted: false });
      expect(d.timeline!.stones.map((s) => [s.startTick, s.endTick])).toEqual([[0, 960]]);
      expect(d.wheel!.holes).toEqual([3, 4, 5, 6]);
      expectSameDraft(d);

      // 2번 칸(480틱)은 4분 못이 덮고 있다: 눌러도 덮어쓰지 않고 그 못만 고른다(바꾸려면 놓기). 못은 그대로다
      await tapWheel(page, 2, 'mouse');
      await waitLive(page, '바꾸려면 놓기를 누르세요.');
      d = await waitWheel(page, (w) => w.cursor !== null && w.cursor.startTick === 0, '못이 덮은 칸을 누르면 그 못의 처음이 골라진다');
      expect(d.wheel!.nails).toHaveLength(1);
      expectSameDraft(d);

      // 8분 못(D4)을 바퀴의 6번 칸(2400틱)에 놓는다. 4분 못(E4)을 5번 칸(1920틱)에 놓으면 2400틱의 8분 못과 겹친다: 놓이지 않고 이유를 알린다
      await press(page.locator('[data-value="eighth"]:not([data-dotted])'), 'mouse');
      await press(page.locator('[data-pitch="D4"]'), 'mouse');
      await tapWheel(page, 6, 'mouse');
      d = await waitWheel(page, (w) => w.nails.length === 2, '바퀴 6번 칸에 8분 못이 놓인다');
      expect(d.wheel!.nails.map((n) => `${n.label}@${n.startTick}-${n.endTick}`)).toEqual(['C4@0-960', 'D4@2400-2880']);
      expect(d.wheel!.holes).toEqual([3, 4, 5]);
      await press(page.locator('[data-value="quarter"]:not([data-dotted])'), 'mouse');
      await press(page.locator('[data-pitch="E4"]'), 'mouse');
      await tapWheel(page, 5, 'mouse');
      await waitLive(page, '겹쳐요');
      expect((await drawnOf(page, WHEEL)).wheel!.nails).toHaveLength(2);

      // 4분 못(E4)을 바퀴의 4번 칸(1440틱)에: 두 칸(1440–2400)이 정확히 채워진다
      await tapWheel(page, 4, 'mouse');
      d = await waitWheel(page, (w) => w.nails.length === 3, '바퀴 4번 칸에 4분 못이 놓인다');
      expect(d.wheel!.nails.map((n) => `${n.label}@${n.startTick}-${n.endTick}`)).toEqual(['C4@0-960', 'E4@1440-2400', 'D4@2400-2880']);
      expect(d.wheel!.holes).toEqual([3]);
      expectSameDraft(d);

      // 허브와 바퀴 밖(물)을 눌러도 아무 일도 없다. 못이 놓이지 않고 알림도 바뀌지 않는다
      const said = await liveOf(page);
      const hub = await wheelPoint(page, { x: WH.cx, y: WH.cy }, '바퀴의 허브');
      await page.mouse.click(hub.x, hub.y);
      const water = await wheelPoint(page, { x: WH.cx - WH.r + 10, y: WH.cy - WH.r + 10 }, '바퀴 둘레의 물'); // 바퀴의 네모 모서리: 원 밖이고 띠에서도 떨어져 있다
      await page.mouse.click(water.x, water.y);
      await page.waitForTimeout(400);
      expect((await drawnOf(page, WHEEL)).wheel!.nails).toHaveLength(3);
      expect(await liveOf(page)).toBe(said);

      // 띠의 3번 칸을 눌러도 같은 칸이다: 8분 못(D4)이 960틱에 놓여 바퀴의 3번 칸도 찬다
      await press(page.locator('[data-value="eighth"]:not([data-dotted])'), 'mouse');
      await press(page.locator('[data-pitch="D4"]'), 'mouse');
      await tapCell(page, WHEEL, 3, 'mouse');
      d = await waitWheel(page, (w) => w.nails.length === 4 && w.holes.length === 0, '띠의 3번 칸을 눌러 바퀴가 찬다');
      expect(d.wheel!.nails.map((n) => `${n.label}@${n.startTick}-${n.endTick}`)).toEqual(['C4@0-960', 'D4@960-1440', 'E4@1440-2400', 'D4@2400-2880']);
      expectSameDraft(d);

      await press(page.locator('[data-action="check"]'), 'mouse');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-wheel-q19-passed-mouse-1920x1080.png');
      // 마우스로 눌렀지만 끌지는 않았다
      const log = await inputLog(page);
      expect(log.maxDrag).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '터치만으로(세로 화면 430×932): 열기 단추를 눌러 들어가 바퀴의 칸을 손가락으로 눌러 Q19(점4분 + 8분 셋)를 푼다. 칸이 48 px 이상이고 고른 칸이 메뉴 띠 아래, 조작 막대 위에 보인다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, log: true });
      await enter(page, 'E4', WHEEL, 'tap');
      const framed = await expectWheelFramed(page);
      // 작은 화면에서도 확대가 0.6 아래로 내려가지 않는다(칸이 48 px 아래로 줄지 않는다)
      expect(framed.zoom).toBeGreaterThanOrEqual(0.6 - 1e-6);
      await pickTarget(page, Q19A, 'touch');
      await expectWheelFramed(page);

      // 점4분 못(C4)을 들고 바퀴의 1번 칸을 누른다 → 세 칸. 8분 못으로 바꿔 D4 E4 F4를 4, 5, 6번 칸에 차례로 누른다. 카메라는 고른 칸을 비춘다
      await press(page.locator('[data-value="quarter"][data-dotted="true"]'), 'touch');
      await tapWheel(page, 1, 'touch');
      let d = await waitWheel(page, (w) => w.nails.length === 1, '바퀴 1번 칸에 점4분 못이 놓인다');
      expect(d.wheel!.nails[0]).toMatchObject({ startTick: 0, endTick: 1440, label: 'C4', dotted: true });
      await expectWheelFramed(page, 4);
      await press(page.locator('[data-value="eighth"]:not([data-dotted])'), 'touch');
      for (const [slot, n, pitch] of [[4, 2, 'D4'], [5, 3, 'E4'], [6, 4, 'F4']] as const) {
        await press(page.locator(`[data-pitch="${pitch}"]`), 'touch');
        await tapWheel(page, slot, 'touch');
        d = await waitWheel(page, (w) => w.nails.length === n, `바퀴 ${slot}번 칸에 8분 못(${pitch})이 놓인다`);
        expectSameDraft(d);
      }
      expect(d.wheel!.nails.map((n) => `${n.label}@${n.startTick}+${n.endTick - n.startTick}`)).toEqual(['C4@0+1440', 'D4@1440+480', 'E4@1920+480', 'F4@2400+480']);
      expect(d.wheel!.holes).toEqual([]);
      await press(page.locator('[data-action="check"]'), 'touch');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-wheel-q19-passed-touch-portrait-430x932.png');
      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(log.maxDrag).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '폭 390 px의 휴대폰(세로): 배율은 0.6이라 칸이 48 px 이상이고, 폭에 다 안 들어오는 만큼은 고른 칸을 따라 가로로도 움직인다',
    async () => {
      // 막대(646 px)가 화면을 많이 가리므로 높이는 900으로 둔다. 확인할 것은 가로다: 668 px 폭의 바퀴와 띠가 390 px 폭에 들어오지 않는다
      const { ctx, page, errors } = await boot({ w: 390, h: 900, touch: true, log: true });
      await enter(page, 'E4', WHEEL, 'tap');
      const first = await expectWheelFramed(page);
      expect(first.zoom).toBeGreaterThanOrEqual(0.6 - 1e-6);
      expect(first.zoom).toBeLessThanOrEqual(0.6 + 1e-6);
      await pickTarget(page, Q19A, 'touch');
      // 8분 못(C4)을 바퀴의 2번 칸에 놓으면 고른 칸이 3번이 된다: 바퀴의 칸과 띠의 칸이 함께 보인다
      await press(page.locator('[data-value="eighth"]:not([data-dotted])'), 'touch');
      await tapWheel(page, 2, 'touch');
      await waitWheel(page, (w) => w.nails.length === 1, '바퀴 2번 칸에 못이 놓인다');
      const east = await expectWheelFramed(page, 3);
      const eastX = toScreen(east, WH.cx, WH.cy).x;
      // 5번 칸(바퀴의 왼쪽)에 놓으면 고른 칸이 6번이 되고 카메라가 가로로도 옮겨 간다
      await tapWheel(page, 5, 'touch');
      await waitWheel(page, (w) => w.nails.length === 2, '바퀴 5번 칸에 못이 놓인다');
      const west = await expectWheelFramed(page, 6);
      const westX = toScreen(west, WH.cx, WH.cy).x;
      expect(west.zoom).toBeCloseTo(east.zoom, 9);
      expect(Math.abs(westX - eastX), '고른 칸이 바퀴의 오른쪽에서 왼쪽으로 가면 카메라도 가로로 움직인다').toBeGreaterThan(5);
      await shot(page, 'phase6-wheel-narrow-phone-390x900.png');
      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '움직임 줄이기: 듣는 동안 바퀴가 돌지 않고, 듣는 못만 금빛이 되어 위치를 알린다(W-8)',
    async () => {
      const { ctx, page, errors } = await boot({ reduced: true });
      await enter(page, 'E4', WHEEL, 'key');
      // 자유로 놀기: 점4분 못(1박)과 8분 못(2박의 첫 칸)을 놓는다
      await page.keyboard.press('ArrowRight');
      await handUntil(page, 'Shift+ArrowUp', (hand) => hand.endsWith('점4분음표'), '점4분음표');
      await page.keyboard.press('Enter');
      await waitWheel(page, (w) => w.nails.length === 1, '점4분 못이 놓인다');
      await handUntil(page, 'Shift+ArrowDown', (hand) => hand.endsWith(' 8분음표'), '8분음표');
      await page.keyboard.press('Enter');
      await waitWheel(page, (w) => w.nails.length === 2, '8분 못이 놓인다');

      await startWheelSampler(page);
      await page.keyboard.press('KeyP');
      const heard = await waitHeard(page);
      await shot(page, 'phase6-wheel-reduced-motion-after-playing.png');
      const playing = heard.filter((s) => s.playTick !== null);
      expect(playing.length).toBeGreaterThan(1);
      // 바퀴는 한 번도 돌지 않았다. 듣는 못은 표시된다
      expect(heard.every((s) => s.turnDeg === 0)).toBe(true);
      expect(playing.some((s) => s.playing.length > 0)).toBe(true);
      expect(playing.every((s) => s.clapper)).toBe(true);
      const d = await waitWheel(page, (w) => w.playTick === null && w.nails.every((n) => !n.playing), '듣기가 끝나 표시가 지워진다');
      expect(d.wheel!.turnDeg).toBe(0);
      expectSameDraft(d);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-6 방앗간 웅덩이는 걸어 들어갈 수 없다(W-3)', () => {
  it(
    'E4 앞에서 왼쪽으로 걸어도 웅덩이 가장자리에서 멈추고, 돌을 밟은 사건(stepped)이 없다. 모드에는 들어가지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await teleport(page, 'E4')).toBe(true);
      await waitNear(page, 'E4', 20000);
      await recordEvents(page);
      const from = await pos(page);
      await page.keyboard.down('ArrowLeft');
      await until(() => pos(page), (p) => p.x < from.x - 5, '왼쪽으로 걷기 시작한다');
      // 서는 자리에서 웅덩이 동쪽 가장자리(x 6400)까지 50 px이다: 220 px/s로 충분히 걸을 시간을 준다
      await page.waitForTimeout(3000);
      const end = await pos(page);
      await page.keyboard.up('ArrowLeft');
      expect(end.x).toBeLessThan(from.x - 5);
      expect(end.x).toBeGreaterThan(6400);
      expect(Math.abs(end.y - from.y)).toBeLessThan(40);
      expect(await eventsOf(page, 'stepped')).toEqual([]);
      expect(await modeOf(page)).toBeNull();
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
