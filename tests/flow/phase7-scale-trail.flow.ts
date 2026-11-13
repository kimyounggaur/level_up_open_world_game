// 7-2 음계 길의 디딤돌 길 셋(S1 장음계 길 · S2 단음계 길 · S3 다섯 음 길) 흐름 시험(실제 Chrome).
// 도메인·작업대·화면(7-2a, 7-2b)과 월드의 돌 자리(7-2c)를 한꺼번에 이어서 본다. 완료 기준(설계서 12.10)의 "5.8의 MIDI 표와 일치한다"는
// 단위 시험(scale-trail-bench: 듣기 목표의 MIDI가 표와 같다)이 맡고, 이 파일은 그 판본들이 월드에서 걸어 들어가 실제로 풀리는지 본다.
//  - 세 길 모두 E로 들어가면 카메라가 돌 줄을 모두 담고, 돌 한가운데를 캔버스가 직접 받으며, 재료 선반이 판본의 음역대로 나온다
//    (S3의 돌 줄은 서는 자리 왼쪽이다: 오른쪽은 박자 강 물가라서 돌이 물 위에 놓였다. 7-2c)
//  - 돌 위를 걸어 지나가면 밟은 사건이 돌 번호 순서로 온다: S1·S2는 오른쪽으로 걸으면 1→N, S3는 왼쪽으로 걸으면 6→1(번호는 왼쪽에서 오른쪽으로 높아진다)
//  - 키보드만(S2 D단조와 화성단음계의 ♯), 마우스 클릭만(S1 G장조), 터치만(S3 다섯 음 음계)으로 끌지 않고 푼다(W-4)
//  - 여러 화면 크기에서 돌 줄이 막대 위에 담기고, 돌 한가운데를 눌린다
//  - 걷는 중(설치물 모드 밖)에도 바닥에 구운 돌이 보인다: 찍은 화면에서 돌마다 속 점의 색을 읽는다(설치물 층은 구운 돌 위에 글자와 표식만 올린다)
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import s1 from '../../content/installations/inst.scale-trail.major-path.json';
import s2 from '../../content/installations/inst.scale-trail.minor-path.json';
import s3 from '../../content/installations/inst.scale-trail.pentatonic-path.json';
import { command, dbg, drawnOf, eventsOf, insetOf, modeOf, pos, recordEvents, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, waitUnframed, type Dbg, type DrawnInstallation } from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { inputLog, installInputLog } from './inputTools';
import { COLOR } from '../../world-src/palette';
import { TRAIL_STONE_ROWS, trailStoneDot, trailStoneRects } from '../../world-src/stones';
import type { Pointer } from './panelTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

interface Cell {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Site {
  code: 'S1' | 'S2' | 'S3';
  id: string;
  name: string;
  slots: ReadonlyArray<Cell>;
  /** 처음 열려 있는 '자유로 놀기'의 재료 선반(조표를 적용한 이름) */
  free: string[];
  /** 돌 줄이 서는 자리의 어느 쪽에 있는가 */
  side: 'right' | 'left';
}
const SITES: Site[] = [
  { code: 'S1', id: s1.installationId, name: s1.name, slots: s1.slots, free: ['F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5', 'A5'], side: 'right' },
  { code: 'S2', id: s2.installationId, name: s2.name, slots: s2.slots, free: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'], side: 'right' },
  { code: 'S3', id: s3.installationId, name: s3.name, slots: s3.slots, free: ['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'], side: 'left' },
];
const siteOf = (code: Site['code']): Site => SITES.find((s) => s.code === code)!;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');

async function boot(opts: { w?: number; h?: number; touch?: boolean; log?: boolean; intro?: 'click' | 'tap' | 'key' } = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, hasTouch: opts.touch ?? false });
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
    // 느린 Chrome에서는 프레임 사이가 150 ms보다 길 수 있어서 세 번(0.45초) 이어서 가만히 있어야 도착한 것이다
    const same = Math.abs(cur.center.x - prev.center.x) < 0.01 && Math.abs(cur.center.y - prev.center.y) < 0.01 && Math.abs(cur.zoom - prev.zoom) < 1e-4;
    still = same ? still + 1 : 0;
    if (still >= 3 && cur.pending.length === 0 && cur.framing && !cur.transitioning) return cur;
    prev = cur;
  }
  throw new Error('카메라가 설치물 앞에 가만히 서지 않아요');
}

const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());
const tapPoint = (page: Page, how: Pointer, p: { x: number; y: number }): Promise<void> => (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
const waitFeedback = (page: Page, state: string) => page.waitForFunction((s) => document.querySelector('.inst-feedback')?.getAttribute('data-feedback') === s, state, { timeout: 15000 });
const waitCursor = (page: Page, text: string) => page.waitForFunction((t) => (document.querySelector('.inst-cursor')?.textContent ?? '').includes(t), text, { timeout: 15000 });
const waitHand = (page: Page, name: string) => page.waitForFunction((n) => document.querySelector('.inst-hand')?.getAttribute('data-hand') === n, name, { timeout: 15000 });
const waitTarget = (page: Page, key: string) => page.waitForFunction((k) => document.querySelector('[data-installation-hud]')?.getAttribute('data-target') === k, key, { timeout: 15000 });

/** 정거장 앞에 서서 모드에 들어간다. 카메라가 가만히 설 때까지 기다린다. tap은 손가락으로(세로 화면은 64 px 열기 단추, 가로 화면은 안내 칩. 7.6) */
async function enter(page: Page, site: Site, how: 'key' | 'chip' | 'tap' = 'key'): Promise<Dbg> {
  expect(await teleport(page, site.code)).toBe(true);
  await waitNear(page, site.code, 20000);
  if (how === 'key') await page.keyboard.press('KeyE');
  else if (how === 'tap') {
    const v = page.viewportSize()!;
    if (v.height > v.width) {
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
    } else await page.locator('.hud-chip').tap();
  } else await page.locator('.hud-chip').click();
  await page.waitForSelector(`[data-installation-hud="${site.id}"]`, { timeout: 20000 });
  return settled(page);
}

/** 모드에서 Esc로 나와 카메라가 캐릭터로 돌아올 때까지 */
async function leave(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
  await waitUnframed(page);
}

const drawn = (page: Page, site: Site): Promise<DrawnInstallation> => drawnOf(page, site.id);
const waitDrawn = (page: Page, site: Site, ok: (i: DrawnInstallation) => boolean, what: string): Promise<DrawnInstallation> => until(() => drawn(page, site), ok, what);
const labelsOf = (i: DrawnInstallation): Array<string | null> => i.slots.map((s) => s.label);

/** 돌 줄 전체를 감싸는 사각형(월드 좌표) */
const frameOf = (site: Site): { x: number; y: number; w: number; h: number } => {
  const x0 = Math.min(...site.slots.map((s) => s.x));
  const y0 = Math.min(...site.slots.map((s) => s.y));
  const x1 = Math.max(...site.slots.map((s) => s.x + s.w));
  const y1 = Math.max(...site.slots.map((s) => s.y + s.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const stoneCenter = (site: Site, slot: number): { x: number; y: number } => {
  const r = site.slots[slot - 1]!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

/**
 * 돌의 화면 자리. 한 번의 왕복으로 카메라가 가만히 있는 것을 두 번 읽어 확인하고,
 * 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다
 */
async function stonePoint(page: Page, site: Site, slot: number): Promise<{ x: number; y: number }> {
  const c = stoneCenter(site, slot);
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
    if (r.tag !== 'CANVAS') throw new Error(`${site.code} ${slot}번 돌 자리(${Math.round(r.x)}, ${Math.round(r.y)})를 캔버스가 받지 않아요: ${r.tag}`);
    return { x: r.x, y: r.y };
  }
  throw new Error('카메라가 가만히 서지 않아요');
}

/** 표지판을 열어 항목 하나를 고르고, 그 목표가 열려 카메라가 가만히 설 때까지 기다린다 */
async function pickTarget(page: Page, key: string, how: Pointer): Promise<Dbg> {
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

/** 손에 든 음을 shelfIndex(0 = 가장 낮은 음)로 옮긴다. 지금 위치(from)에서 ↑↓를 필요한 만큼 누른다 */
async function setHandByKeys(page: Page, from: number, to: number): Promise<number> {
  const key = to > from ? 'ArrowUp' : 'ArrowDown';
  for (let i = 0; i < Math.abs(to - from); i++) await page.keyboard.press(key);
  return to;
}

/** 자리를 하나씩 키보드로 채운다: 각 자리에서 →로 옮기고 손의 음을 맞춰 Enter로 놓는다. 마지막 손 위치를 돌려준다 */
async function typeByKeys(page: Page, site: Site, shelf: number[], startHand: number): Promise<number> {
  let hand = startHand;
  for (let i = 0; i < shelf.length; i++) {
    await page.keyboard.press('ArrowRight');
    await waitCursor(page, `${i + 1}번째 자리`);
    hand = await setHandByKeys(page, hand, shelf[i]!);
    await page.keyboard.press('Enter');
    await waitDrawn(page, site, (d) => d.slots[i]!.label !== null, `${i + 1}번 돌에 음 이름이 쓰인다`);
  }
  return hand;
}

/** 눌러서 풀기(마우스 클릭만 또는 터치만): 틀린 4번째를 놓고 확인해 ! 표시를 보고, 4번째 돌을 눌러 고르고 고쳐 놓아 통과한다 */
async function solveByPointer(page: Page, site: Site, how: Pointer, key: string, shelf: number[], wrong: { slot: number; shelf: number; fix: number }, expected: string[], shotName: string): Promise<void> {
  await pickTarget(page, key, how);
  for (let i = 0; i < shelf.length; i++) {
    const idx = i + 1 === wrong.slot ? wrong.shelf : shelf[i]!;
    await press(page.locator(`[data-shelf="${idx}"]`), how);
    await tapPoint(page, how, await stonePoint(page, site, i + 1));
    await waitDrawn(page, site, (d) => d.slots[i]!.label !== null, `${i + 1}번 돌에 음 이름이 쓰인다`);
  }
  await press(page.locator('[data-action="check"]'), how);
  await waitFeedback(page, 'needsRevision');
  const flagged = await waitDrawn(page, site, (d) => d.slots.some((s) => s.flagged), '틀린 자리에 ! 표시가 뜬다');
  expect(flagged.slots.map((s) => s.flagged), `${site.code}: 틀린 자리만 ! 표시`).toEqual(shelf.map((_, i) => i + 1 === wrong.slot));
  await shot(page, shotName.replace('.png', '-flagged.png'));

  // 놓인 돌을 누르면 그 자리를 고르기만 한다(덮어쓰지 않는다). 손의 음을 바꾸고 놓기 단추로 바꿔 놓는다
  const before = (await drawn(page, site)).slots[wrong.slot - 1]!.label;
  await tapPoint(page, how, await stonePoint(page, site, wrong.slot));
  await waitCursor(page, `${wrong.slot}번째 자리`);
  expect((await drawn(page, site)).slots[wrong.slot - 1]!.label).toBe(before);
  await press(page.locator(`[data-shelf="${wrong.fix}"]`), how);
  await press(page.locator('[data-action="place"]'), how);
  await waitDrawn(page, site, (d) => d.slots[wrong.slot - 1]!.label === expected[wrong.slot - 1] && !d.slots.some((s) => s.flagged), '고쳐 놓으면 ! 표시가 사라진다');

  await press(page.locator('[data-action="check"]'), how);
  await waitFeedback(page, 'passed');
  expect(labelsOf(await drawn(page, site))).toEqual(expected);
  expect(await page.locator('.inst-feedback').textContent()).toContain('통과했어요');
  await shot(page, shotName);
}

/** 한 번의 왕복으로 읽는 화면 배치: 막대와 선반 단추의 상자, 돌의 화면 자리와 그 자리를 받는 요소 */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
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
const layoutOf = (page: Page, centers: Array<{ x: number; y: number }>): Promise<Layout> =>
  page.evaluate((cs) => {
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
      stones: cs.map((c) => {
        const x = (c.x - d.view.x) * d.zoom;
        const y = (c.y - d.view.y) * d.zoom;
        return { x, y, tag: document.elementFromPoint(x, y)?.tagName ?? 'none' };
      }),
    };
  }, centers);

// ---------------------------------------------------------------------------

describe('7-2 걸어 들어가면 카메라가 돌 줄을 모두 담는다(세 길)', () => {
  for (const site of SITES) {
    it(`${site.code} ${site.name}: E로 들어가면 돌 ${site.slots.length}개가 막대 위에 모두 보이고, 재료 선반이 자유로 놀기의 음역대다`, async () => {
      const { ctx, page, errors } = await boot();
      expect(await modeOf(page)).toBeNull();
      await teleport(page, site.code);
      await waitNear(page, site.code, 20000);
      // 들어가기 전의 돌: 이름도 번호도 없다(빈 돌은 그냥 길이다)
      const before = await waitDrawn(page, site, (i) => i.slots.length === site.slots.length, `돌 ${site.slots.length}개가 그려진다`);
      expect(before.active).toBe(false);
      expect(before.slots.every((s) => s.label === null && !s.numbered && !s.selected && !s.flagged)).toBe(true);

      await page.keyboard.press('KeyE');
      await page.waitForSelector(`[data-installation-hud="${site.id}"]`);
      expect(await modeOf(page)).toEqual({ installationId: site.id, stationId: site.code });
      expect(await page.locator('[data-installation-hud]').getAttribute('aria-label')).toBe(`${site.name} 작업대`);
      const d = await settled(page);
      const inset = await insetOf(page);
      const view = page.viewportSize()!;
      const f = frameOf(site);
      const a = toScreen(d, f.x, f.y);
      const b = toScreen(d, f.x + f.w, f.y + f.h);
      // 돌이 모두 보이고, 조작 막대에 가려지지 않는다
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(view.width);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);
      expect(d.zoom).toBeGreaterThan(0.5);

      // 설치물 층: 자리 번호가 모두 그려지고, 아직 아무 자리도 고르지 않았다
      const inMode = await waitDrawn(page, site, (i) => i.active && i.slots.every((s) => s.numbered), '자리 번호가 그려진다');
      expect(inMode.slots.map((s) => s.slot)).toEqual(site.slots.map((s) => s.slot));
      expect(inMode.slots.every((s) => s.label === null && !s.selected && !s.flagged && !s.playing)).toBe(true);
      // 작업대: 재료 선반은 자유로 놀기의 판본(조표를 적용한 이름), 손은 으뜸음 자리
      expect(await page.locator('[data-shelf] .material-name').allInnerTexts()).toEqual(site.free);
      expect(await page.locator('.inst-bar [data-action]').count()).toBe(13);
      // 돌 한가운데를 캔버스가 직접 받는다(표지판·HUD가 덮지 않는다)
      const L = await layoutOf(page, site.slots.map((s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 })));
      expect(L.stones.map((p) => p.tag)).toEqual(Array(site.slots.length).fill('CANVAS'));
      await shot(page, `phase7-scale-trail-${site.code}-desktop.png`);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('7-2 돌 위를 걸어 지나간다(밟은 사건이 돌 번호 순서로 온다)', () => {
  /** (x, y)로 바로 서서, 방향키를 누른 채 목표 x에 닿을 때까지 걷는다. 밟은 사건을 돌려준다 */
  async function walk(page: Page, from: { x: number; y: number }, key: 'ArrowRight' | 'ArrowLeft', goalX: number) {
    await command(page, { type: 'teleport', x: from.x, y: from.y });
    await waitChunks(page);
    await until(() => pos(page), (p) => Math.hypot(p.x - from.x, p.y - from.y) < 2, '지정한 자리에 선다');
    await recordEvents(page);
    await page.keyboard.down(key);
    await page.waitForFunction(
      (a) => {
        const p = (window as unknown as { __game: { world: { bridge: { position: { get(): { x: number } } } } } }).__game.world.bridge.position.get();
        return a.key === 'ArrowRight' ? p.x >= a.goalX : p.x <= a.goalX;
      },
      { key, goalX },
      { timeout: 90000 },
    );
    await page.keyboard.up(key);
    return eventsOf(page, 'stepped');
  }

  it('S1 장음계 길: 첫 돌 왼쪽에서 오른쪽으로 걸으면 1번부터 8번까지 한 번씩 밟는다. 모드는 열리지 않는다', async () => {
    const site = siteOf('S1');
    const { ctx, page, errors } = await boot();
    const first = site.slots[0]!;
    const last = site.slots[site.slots.length - 1]!;
    const steps = await walk(page, { x: first.x - 28, y: first.y + first.h / 2 + 30 }, 'ArrowRight', last.x + last.w + 20);
    expect(steps.map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(steps.every((e) => e.installationId === site.id)).toBe(true);
    expect(await eventsOf(page, 'slot-pressed')).toEqual([]);
    expect(await modeOf(page)).toBeNull();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('S2 단음계 길: 오른쪽으로 걸으면 1번부터 8번까지 한 번씩 밟는다', async () => {
    const site = siteOf('S2');
    const { ctx, page, errors } = await boot();
    const first = site.slots[0]!;
    const last = site.slots[site.slots.length - 1]!;
    const steps = await walk(page, { x: first.x - 28, y: first.y + first.h / 2 + 30 }, 'ArrowRight', last.x + last.w + 20);
    expect(steps.map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(steps.every((e) => e.installationId === site.id)).toBe(true);
    expect(await modeOf(page)).toBeNull();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('S3 다섯 음 길: 돌 줄이 서는 자리 왼쪽에 있다. 서는 자리 쪽(오른쪽 끝)에서 왼쪽으로 걸으면 6번부터 1번까지 밟는다', async () => {
    const site = siteOf('S3');
    const stand = s3.interactPoint;
    const first = site.slots[0]!;
    const last = site.slots[site.slots.length - 1]!;
    // 돌 줄이 서는 자리 왼쪽 150 px에서 끝난다(박자 강 쪽이 아니다)
    expect(stand.x - (last.x + last.w)).toBe(150);
    const { ctx, page, errors } = await boot();
    const steps = await walk(page, { x: last.x + last.w + 50, y: last.y + last.h / 2 }, 'ArrowLeft', first.x - 20);
    expect(steps.map((e) => e.slot)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(steps.every((e) => e.installationId === site.id)).toBe(true);
    expect(await modeOf(page)).toBeNull();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('S3: 서는 자리에서 첫 돌 쪽(왼쪽)으로 걸어도 막히지 않고 돌에 닿는다(표지판은 서는 자리 오른쪽이다)', async () => {
    const site = siteOf('S3');
    const stand = s3.interactPoint;
    const last = site.slots[site.slots.length - 1]!;
    const { ctx, page, errors } = await boot();
    expect(await teleport(page, 'S3')).toBe(true);
    await waitNear(page, 'S3', 20000);
    await recordEvents(page);
    const at = await pos(page);
    expect(Math.hypot(at.x - stand.x, at.y - stand.y)).toBeLessThan(60);
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction((gx) => (window as unknown as { __game: { world: { bridge: { position: { get(): { x: number } } } } } }).__game.world.bridge.position.get().x <= gx, last.x + last.w - 40, { timeout: 90000 });
    await page.keyboard.up('ArrowLeft');
    const steps = await eventsOf(page, 'stepped');
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(steps[0]!.slot).toBe(6);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('W-4 끌지 않고 푼다(키보드만, 마우스 클릭만, 터치만)', () => {
  it('키보드만(S2 D단조, 조표 B♭): 표지판에서 고르고, 4번째를 틀리게 놓아 확인하고, 고쳐서 통과한다. 마우스 입력이 없다', async () => {
    const site = siteOf('S2');
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await enter(page, site, 'key');
    await pickTargetByKeys(page, 'scale.natural-minor/d-minor');
    // 선반은 D단조의 음역(조표 B♭이 적용된 이름)이고, 손은 으뜸음 D4에서 시작한다
    expect(await page.locator('[data-shelf] .material-name').allInnerTexts()).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5']);
    await waitHand(page, 'D4');

    // 4번째만 G4가 아니라 A4를 놓는다(틀린 자리). 선반 번호: D4=1 E4=2 F4=3 G4=4 A4=5 B♭4=6 C5=7 D5=8
    await typeByKeys(page, site, [1, 2, 3, 5, 5, 6, 7, 8], 1);
    const wrong = await waitDrawn(page, site, (d) => d.slots.every((s) => s.label !== null), '여덟 돌이 모두 채워진다');
    expect(labelsOf(wrong)).toEqual(['D4', 'E4', 'F4', 'A4', 'A4', 'B♭4', 'C5', 'D5']);
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitDrawn(page, site, (d) => d.slots.some((s) => s.flagged), '틀린 자리에 ! 표시가 뜬다');
    expect(flagged.slots.map((s) => s.flagged)).toEqual([false, false, false, true, false, false, false, false]);
    expect(await page.locator('.inst-feedback .feedback-line').count()).toBeGreaterThanOrEqual(1);
    await shot(page, 'phase7-scale-trail-S2-keyboard-flagged.png');

    // 4번째 자리로 가서 G4를 놓아 고친다
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await waitCursor(page, '4번째 자리');
    await setHandByKeys(page, 8, 4);
    await waitHand(page, 'G4');
    await page.keyboard.press('Enter');
    await waitDrawn(page, site, (d) => d.slots[3]!.label === 'G4' && !d.slots.some((s) => s.flagged), '고치면 ! 표시가 사라진다');
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'passed');
    expect(labelsOf(await drawn(page, site))).toEqual(['D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5']);
    expect(await page.locator('.inst-feedback').textContent()).toContain('D단조');
    await shot(page, 'phase7-scale-trail-S2-keyboard-passed.png');

    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.keys).toBeGreaterThan(30);
    await leave(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만(S2 화성단음계): 조표가 같아 일곱째를 G4로 쓰면 틀리다. Shift+↑로 올림표를 써야 통과한다', async () => {
    const site = siteOf('S2');
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await enter(page, site, 'key');
    await pickTargetByKeys(page, 'scale.harmonic-minor/a-harmonic-minor');
    await waitHand(page, 'A3');
    // 으뜸음에서 한 음씩 올라가며 여덟 자리를 놓는다: 일곱째가 G4(올림표 없음)다
    const hand = await typeByKeys(page, site, [1, 2, 3, 4, 5, 6, 7, 8], 1);
    expect(hand).toBe(8);
    expect(labelsOf(await drawn(page, site))).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitDrawn(page, site, (d) => d.slots.some((s) => s.flagged), '일곱째에 ! 표시가 뜬다');
    expect(flagged.slots.map((s) => s.flagged)).toEqual([false, false, false, false, false, false, true, false]);
    expect(await page.locator('.inst-feedback').textContent()).toContain('G♯4');
    await shot(page, 'phase7-scale-trail-S2-harmonic-flagged.png');

    // 일곱째 자리로 돌아가 G4(선반 7)에서 Shift+↑로 올림표를 올려 놓는다
    await page.keyboard.press('ArrowLeft');
    await waitCursor(page, '7번째 자리');
    await setHandByKeys(page, 8, 7);
    await waitHand(page, 'G4');
    await page.keyboard.press('Shift+ArrowUp');
    await waitHand(page, 'G♯4');
    await page.keyboard.press('Enter');
    await waitDrawn(page, site, (d) => d.slots[6]!.label === 'G♯4' && !d.slots.some((s) => s.flagged), '올림표를 쓰면 ! 표시가 사라진다');
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'passed');
    expect(labelsOf(await drawn(page, site))).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G♯4', 'A4']);
    await shot(page, 'phase7-scale-trail-S2-harmonic-passed.png');
    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('마우스 클릭만(S1 G장조, 일곱째 F♯): 돌을 눌러 놓고, 놓인 돌을 눌러 고르고, 단추로 확인해서 통과한다. 키도 끌기도 없다', async () => {
    const site = siteOf('S1');
    const { ctx, page, errors } = await boot({ log: true });
    await enter(page, site, 'chip'); // E를 누르지 않고 안내 칩을 눌러 들어간다
    await solveByPointer(
      page,
      site,
      'mouse',
      'scale.major/g-major',
      [1, 2, 3, 4, 5, 6, 7, 8],
      { slot: 4, shelf: 5, fix: 4 },
      ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5'],
      'phase7-scale-trail-S1-mouse-passed.png',
    );
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('터치만(S3 다섯 음 음계, 세로 휴대폰): 여섯 돌을 손가락으로 눌러 통과한다. 키도 끌기도 없다', async () => {
    const site = siteOf('S3');
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, log: true });
    await enter(page, site, 'tap');
    // 다섯 음 음계: C D E G A C. 선반 번호: B3=0 C4=1 D4=2 E4=3 F4=4 G4=5 A4=6 B4=7 C5=8. 4번째만 F4(틀린 자리)
    await solveByPointer(page, site, 'touch', 'scale.pentatonic/c-pentatonic', [1, 2, 3, 5, 6, 8], { slot: 4, shelf: 4, fix: 5 }, ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'], 'phase7-scale-trail-S3-touch-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['touch']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 여러 화면 크기: 돌 줄이 막대 위에 모두 담기고, 돌 한가운데를 캔버스가 직접 받으며, 터치 단추가 충분히 크다.

const SCREENS: Array<{ name: string; w: number; h: number; touch: boolean }> = [
  { name: 'desktop-1366x768', w: 1366, h: 768, touch: false },
  { name: 'phone-portrait-430x932', w: 430, h: 932, touch: true },
  { name: 'phone-portrait-small-360x640', w: 360, h: 640, touch: true },
  { name: 'phone-landscape-844x390', w: 844, h: 390, touch: true },
];

describe('7-2 여러 화면에서 세 길이 들어맞는다', () => {
  for (const s of SCREENS) {
    it(`${s.name}: S1·S2·S3의 돌이 모두 보이고 눌리며, 작업 막대가 화면 안에 있다`, async () => {
      const { ctx, page, errors } = await boot({ w: s.w, h: s.h, touch: s.touch });
      for (const site of SITES) {
        const d = await enter(page, site, s.touch ? 'tap' : 'key');
        const f = frameOf(site);
        const L = await layoutOf(page, site.slots.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })));
        const a = toScreen(d, f.x, f.y);
        const b = toScreen(d, f.x + f.w, f.y + f.h);
        const label = `${s.name} ${site.code}`;
        expect(a.x, `${label} 왼쪽`).toBeGreaterThanOrEqual(-1);
        expect(b.x, `${label} 오른쪽`).toBeLessThanOrEqual(L.w + 1);
        expect(a.y, `${label} 위`).toBeGreaterThanOrEqual(-1);
        // 카메라(framePose)는 막대 높이를 화면의 70%까지만 믿는다. 그 안이면 틀 전체가 막대 위에 담기고,
        // 넘는 극단(360×640의 막대는 화면의 80%)이면 틀이 막대 위로 10% 넘게 가려지지 않고 돌 가운데는 막대 위에 있다.
        // 월드 남쪽 끝 가까운 틀(S2 y 5224–5377)도 마찬가지여야 한다: 월드 아래 끝을 넘어 비추므로(clampFrameCenter) 가두어져 내려오지 않는다
        const barTop = L.h - L.inset;
        const extreme = L.inset > L.h * 0.7;
        expect(b.y, `${label} 아래`).toBeLessThanOrEqual(barTop + (extreme ? 0.1 * (b.y - a.y) : 1));
        expect((a.y + b.y) / 2, `${label} 돌 가운데`).toBeLessThanOrEqual(barTop - 24);
        const main = L.main!;
        expect(main.x, `${label} 막대 왼쪽`).toBeGreaterThanOrEqual(-1);
        expect(main.x + main.w, `${label} 막대 오른쪽`).toBeLessThanOrEqual(L.w + 1);
        expect(main.y + main.h, `${label} 막대 아래`).toBeLessThanOrEqual(L.h + 1);
        expect(Math.abs(L.h - main.y - L.inset), `${label} 막대 높이`).toBeLessThanOrEqual(2);
        expect(L.bar.length, `${label} 단추 수`).toBe(13);
        if (s.touch) {
          for (const box of L.bar) {
            expect(box.h, `${label} 터치 단추 높이`).toBeGreaterThanOrEqual(47.5);
            expect(box.w, `${label} 터치 단추 너비`).toBeGreaterThanOrEqual(44);
          }
          for (const box of L.shelf) {
            expect(box.h, `${label} 선반 단추 높이`).toBeGreaterThanOrEqual(44);
            expect(box.w, `${label} 선반 단추 너비`).toBeGreaterThanOrEqual(44);
          }
        }
        expect(L.stones.map((p) => p.tag), `${label} 돌 한가운데`).toEqual(Array(site.slots.length).fill('CANVAS'));
        // 돌 한 칸(간격 포함)이 38 px 이상이라 눌림 띠가 닿는다
        expect((site.slots[1]!.x - site.slots[0]!.x) * L.zoom, `${label} 돌 간격`).toBeGreaterThanOrEqual(38);
        await shot(page, `phase7-scale-trail-${site.code}-${s.name}.png`);
        await leave(page);
      }
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

// ---------------------------------------------------------------------------

describe('7-2 걷는 중에도 돌이 보인다(바닥에 구운 돌 그림, 마을 H4의 돌과 같은 모양)', () => {
  type Rgb = [number, number, number];
  const hexRgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  /**
   * 돌 속 점이 보이는가: 같은 돌의 속(점 위쪽 41 px)과 점의 색 차이(파란 성분)가 구운 그림의 차이의 절반 이상이면 점이 있는 것이다.
   * 소리 물결과 도착 물결이 바닥 위에 옅은 흰 막을 씌워 색이 조금 밝아져도 속과 점의 차이는 남으므로, 막의 세기에 흔들리지 않는다.
   * 점이 없으면(돌을 굽기 전 길에서 읽어 보니 길 가장자리 선에 걸려도 0.34) 이 값에 못 미쳐 걸린다. 구운 뒤에 읽은 비율은 서는 자리에서 0.78–1.01, 줄 한가운데에서 0.74–0.81이었다.
   */
  const MIN_CONTRAST = 0.5;
  /** 스크린샷(PNG)의 한 점 색을 읽는 함수(화면 배율이 1이 아니어도 좌표를 맞춘다) */
  async function pixelReader(png: Buffer, cssWidth: number): Promise<(x: number, y: number) => Rgb> {
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const k = info.width / cssWidth;
    return (x, y) => {
      const px = Math.min(Math.max(Math.round(x * k), 0), info.width - 1);
      const py = Math.min(Math.max(Math.round(y * k), 0), info.height - 1);
      const i = (py * info.width + px) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
  }

  /** 카메라가 가만히 서고 바닥 조각이 모두 온 뒤의 모습 */
  async function calm(page: Page): Promise<Dbg> {
    let prev = await dbg(page);
    let still = 0;
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(150);
      const cur = await dbg(page);
      const same = Math.abs(cur.view.x - prev.view.x) < 0.01 && Math.abs(cur.view.y - prev.view.y) < 0.01 && Math.abs(cur.zoom - prev.zoom) < 1e-4;
      still = same ? still + 1 : 0;
      if (still >= 3 && cur.pending.length === 0 && !cur.framing && !cur.transitioning) return cur;
      prev = cur;
    }
    throw new Error('카메라가 가만히 서지 않아요');
  }

  /** (x, y)에 바로 서서 화면이 가만해질 때까지 기다린다 */
  async function standAt(page: Page, x: number, y: number): Promise<Dbg> {
    await command(page, { type: 'teleport', x, y });
    await waitChunks(page);
    await until(() => pos(page), (p) => Math.hypot(p.x - x, p.y - y) < 4, '지정한 자리에 선다');
    return calm(page);
  }

  /** 돌 속 점이 읽히는가. 화면 밖이거나 위쪽 메뉴 띠 · 아래쪽 안내 칩 자리면 건너뛴다. ratio는 읽은 차이 ÷ 구운 차이(1이면 구운 그대로) */
  function readDots(at: (x: number, y: number) => Rgb, d: Dbg, view: { width: number; height: number }, row: (typeof TRAIL_STONE_ROWS)[number]) {
    const fillB = hexRgb(COLOR.stone)[2];
    const seen: number[] = [];
    const wrong: string[] = [];
    const ratios: number[] = [];
    trailStoneRects(row).forEach((s, i) => {
      const p = toScreen(d, s.x + s.w / 2, s.y + 81);
      // 점(반지름 15 × 배율) 전체가 화면 안, 위쪽 메뉴 띠(64 px) 아래, 아래쪽 안내 칩(화면 아래 120 px) 위에 있어야 읽는다
      const r = 15 * d.zoom;
      if (p.x - r < 0 || p.x + r > view.width || p.y - r < 70 || p.y + r > view.height - 120) return;
      seen.push(s.slot);
      const dotB = hexRgb(trailStoneDot(i, row.count))[2];
      const gotDot = at(p.x, p.y);
      const gotFill = at(p.x, p.y - 41 * d.zoom);
      const ratio = (gotFill[2] - gotDot[2]) / (fillB - dotB);
      ratios.push(Math.round(ratio * 100) / 100);
      if (!(ratio >= MIN_CONTRAST)) wrong.push(`${s.slot}번 돌 (${Math.round(p.x)}, ${Math.round(p.y)}): 점 ${gotDot.join(',')}, 돌 속 ${gotFill.join(',')}, 차이 비율 ${ratio.toFixed(2)}`);
    });
    return { seen, wrong, ratios };
  }

  for (const site of SITES) {
    it(`${site.code} ${site.name}: 설치물 모드 밖에서도 돌 ${site.slots.length}개가 바닥에 보인다(돌 줄 한가운데에서 모두, 서는 자리에서 보이는 만큼)`, async () => {
      const { ctx, page, errors } = await boot();
      const view = page.viewportSize()!;
      const row = TRAIL_STONE_ROWS.find((r) => r.installationId === site.id)!;
      expect(await modeOf(page)).toBeNull();

      // 서는 자리에서 처음 보이는 모습: 이 화면이 사람이 눈으로 볼 사진이다
      const first = site.slots[0]!;
      const last = site.slots[site.slots.length - 1]!;
      const stand = { x: site.code === 'S3' ? last.x + last.w + 150 : first.x - 150, y: first.y + first.h / 2 };
      const ds = await standAt(page, stand.x, stand.y);
      expect(await modeOf(page)).toBeNull();
      const atStand = await pixelReader(await page.screenshot({ type: 'png' }), view.width);
      const fromStand = readDots(atStand, ds, view, row);
      expect(fromStand.wrong, `${site.code} 서는 자리에서 읽은 돌 점`).toEqual([]);
      // 서는 자리에서 돌이 적어도 네 개는 보인다(걸어서 닿을 길이 눈에 들어온다)
      expect(fromStand.seen.length, `${site.code} 서는 자리에서 보이는 돌`).toBeGreaterThanOrEqual(4);
      await shot(page, `phase7-scale-trail-${site.code}-free-walk-stand.png`);

      // 돌 줄 한가운데(가운데 두 돌의 사이 빈틈)에 서면 돌이 모두 한 화면에 든다
      const mid = { x: first.x + (last.x + last.w - first.x) / 2, y: first.y + first.h / 2 };
      const dm = await standAt(page, mid.x, mid.y);
      const atMid = await pixelReader(await page.screenshot({ type: 'png' }), view.width);
      const fromMid = readDots(atMid, dm, view, row);
      expect(fromMid.wrong, `${site.code} 줄 한가운데에서 읽은 돌 점`).toEqual([]);
      expect(fromMid.seen, `${site.code} 줄 한가운데에서 보이는 돌`).toEqual(site.slots.map((s) => s.slot));
      await shot(page, `phase7-scale-trail-${site.code}-free-walk-row.png`);
      expect(await modeOf(page)).toBeNull();
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});
