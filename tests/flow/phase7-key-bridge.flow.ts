// 7-3 건반 늪의 건반 다리(K1 건반 다리 · K2 음정 밧줄 · K3 제자리표 다리)와 반음 계단(K4) 흐름 시험(실제 Chrome).
// 도메인·작업대·화면(7-3a, 7-3b)과 월드의 널 자리(7-3c)를 한꺼번에 이어서 본다. 완료 기준(설계서 12.10)의 "Q30이 66, 65, 65, 66이다"는
// 단위 시험(key-marsh-quests, key-marsh-panels)이 판정기와 패널로 보고, 이 파일은 그 과제가 월드에서 걸어 들어가 널을 눌러 실제로 풀리는지 본다.
//  - K3로 E를 눌러 들어가면 카메라가 다리를 담고 흰 널이 화면에서 48 px 이상이며, 널 한가운데를 캔버스가 직접 받는다
//  - Q30을 마우스 클릭만으로(널 7, 6, 6, 7을 차례로 눌러 깃발이 66, 65, 65, 66에 꽂힌다), 키보드만으로, 터치만으로(세로 휴대폰) 푼다(W-4)
//  - 틀리게 꽂으면 틀린 깃발에만 ! 표시가 뜨고, 깃발을 골라 옮겨 꽂으면 통과한다. 안내 문장은 검은 널의 이름(♯, ♭)을 말하지 않는다
//  - 패널로 보기(V)로 건너가면 월드에서 꽂은 깃발이 패널의 같은 널에 있고, 돌아오면 그대로다
//  - 폭이 다른 여러 화면에서 흰 널은 48 px 아래로 줄지 않고, 고른 널은 늘 눈에 보이며 캔버스가 직접 받는다(좁은 화면에서는 카메라가 고른 널을 따라간다. 7.3)
//  - K1의 검은 널 이름표(Q27): 널을 눌러 이름표 자리를 고르고 이름표를 걸어 통과한다
//  - 걸어서 다리를 건너면 밟은 널의 사건이 널 번호 순서로 온다(W-3: 판정에는 들어가지 않는다)
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import k1 from '../../content/installations/inst.key-marsh.key-bridge.json';
import k2 from '../../content/installations/inst.key-marsh.interval-rope.json';
import k3 from '../../content/installations/inst.key-marsh.natural-bridge.json';
import k4 from '../../content/installations/inst.key-marsh.chromatic-path.json';
import { PLANK_WHITE_W, bridgeBounds } from '../../src/domain/keyBridge';
import { command, dbg, drawnOf, eventsOf, insetOf, modeOf, pos, recordEvents, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, waitUnframed, type Dbg, type DrawnInstallation } from './game';
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

interface Cell {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Site {
  code: 'K1' | 'K2' | 'K3' | 'K4';
  id: string;
  name: string;
  slots: Cell[];
}
const K1: Site = { code: 'K1', id: k1.installationId, name: k1.name, slots: [...k1.slots] };
const K2: Site = { code: 'K2', id: k2.installationId, name: k2.name, slots: [...k2.slots] };
const K3: Site = { code: 'K3', id: k3.installationId, name: k3.name, slots: [...k3.slots] };
const K4: Site = { code: 'K4', id: k4.installationId, name: k4.name, slots: [...k4.slots] };
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
const waitTarget = (page: Page, key: string) => page.waitForFunction((k) => document.querySelector('[data-installation-hud]')?.getAttribute('data-target') === k, key, { timeout: 15000 });
const liveText = async (page: Page): Promise<string> => ((await page.locator('[data-live]').first().textContent()) ?? '').trim();

/** 정거장 앞에 서서 모드에 들어간다. 카메라가 가만히 설 때까지 기다린다. chip은 안내 칩을 눌러서(키 없이), tap은 손가락으로(세로 화면은 64 px 열기 단추, 가로 화면은 안내 칩. 7.6) */
async function enter(page: Page, site: Site, how: 'key' | 'chip' | 'tap' = 'key'): Promise<Dbg> {
  expect(await teleport(page, site.code)).toBe(true);
  await waitNear(page, site.code, 20000);
  if (how === 'key') await page.keyboard.press('KeyE');
  else if (how === 'chip') await page.locator('.hud-chip').click();
  else {
    const v = page.viewportSize()!;
    if (v.height > v.width) {
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
    } else await page.locator('.hud-chip').tap();
  }
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
const bridgeOf = async (page: Page, site: Site) => {
  const b = (await drawn(page, site)).keyBridge;
  if (!b) throw new Error(`${site.code}: 건반 다리 그림이 없어요`);
  return b;
};
const waitBridge = async (page: Page, site: Site, ok: (b: NonNullable<DrawnInstallation['keyBridge']>) => boolean, what: string) => until(() => bridgeOf(page, site), ok, what);
const planksOf = (b: NonNullable<DrawnInstallation['keyBridge']>): Array<number | null> => b.flags.map((f) => f.plank);

/** 널 한가운데(월드 좌표): 흰 널의 가운데는 검은 널이 걸치지 않는 자리다 */
const plankCenter = (site: Site, slot: number): { x: number; y: number } => {
  const r = site.slots[slot - 1]!;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

/**
 * 널의 화면 자리. 카메라가 가만히 있는 것을 한 번의 왕복으로 두 번 읽어 확인하고,
 * 널 안에서 가운데부터 위아래로 훑어 가며 캔버스가 직접 받고(HUD와 메뉴 단추가 덮지 않았고) 조작 막대 위에 있는 첫 자리를 돌려준다.
 * 조작 막대 위에 남는 띠가 얇은 화면(휴대폰 가로)에서는 널 가운데가 아니라 띠 안의 자리가 눌린다. 어느 자리도 받지 못하면 틀린 것이다
 */
async function plankPoint(page: Page, site: Site, slot: number): Promise<{ x: number; y: number }> {
  const r0 = site.slots[slot - 1]!;
  const cands = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4].map((o) => ({ x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 + o * r0.h }));
  for (let tries = 0; tries < 20; tries++) {
    const r = await page.evaluate(async (list) => {
      const world = (window as unknown as { __game: { world: { debugState(): { center: { x: number; y: number }; zoom: number; view: { x: number; y: number } } | null; bridge: { bottomInset: { get(): number } } } } }).__game.world;
      const read = () => {
        const d = world.debugState();
        return d ? { x: d.center.x, y: d.center.y, z: d.zoom, vx: d.view.x, vy: d.view.y } : null;
      };
      const a = read();
      await new Promise((done) => setTimeout(done, 80));
      const b = read();
      if (!a || !b || Math.abs(a.x - b.x) > 0.3 || Math.abs(a.y - b.y) > 0.3 || Math.abs(a.z - b.z) > 0.001) return null;
      const barTop = window.innerHeight - world.bridge.bottomInset.get();
      const seen: string[] = [];
      for (const c of list) {
        const x = (c.x - b.vx) * b.z;
        const y = (c.y - b.vy) * b.z;
        const inside = x > 0 && x < window.innerWidth && y > 0 && y < barTop;
        const tag = inside ? (document.elementFromPoint(x, y)?.tagName ?? 'none') : 'outside';
        if (tag === 'CANVAS') return { ok: true as const, x, y };
        seen.push(`(${Math.round(x)}, ${Math.round(y)}) ${tag}`);
      }
      return { ok: false as const, seen, barTop };
    }, cands);
    if (!r) continue;
    if (!r.ok) throw new Error(`${site.code} ${slot}번 널의 어느 자리도 캔버스가 받지 않아요(조작 막대 윗선 ${Math.round(r.barTop)}): ${r.seen.join(', ')}`);
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

const Q30 = 'key.accidentals-in-a-bar/g-major-f';
/** Q30의 답: 깃발 1, 2, 3, 4번을 꽂을 널 번호(F♯4=7, F4=6, F4=6, F♯4=7 → MIDI 66, 65, 65, 66) */
const Q30_PLANKS = [7, 6, 6, 7];

/** 널을 눌러 깃발을 차례로 꽂는다(빈 깃발이 다음 깃발로 자동으로 골라진다) */
async function plantByPointer(page: Page, site: Site, how: Pointer, planks: number[]): Promise<void> {
  for (let i = 0; i < planks.length; i++) {
    await tapPoint(page, how, await plankPoint(page, site, planks[i]!));
    await waitBridge(page, site, (b) => b.flags[i]!.plank === planks[i], `${i + 1}번 깃발이 ${planks[i]}번 널에 꽂힌다`);
  }
}

// ---------------------------------------------------------------------------

describe('7-3 걸어 들어가면 카메라가 다리를 담는다(K3 제자리표 다리)', () => {
  it('K3: E로 들어가면 다리가 막대 위에 모두 보이고, 흰 널이 48 px 이상이며, 널 한가운데를 캔버스가 받는다. 자유로 놀기의 깃발은 걸이에 서 있다', async () => {
    const { ctx, page, errors } = await boot();
    expect(await modeOf(page)).toBeNull();
    await teleport(page, K3.code);
    await waitNear(page, K3.code, 20000);
    // 들어가기 전: 널 이름도 고른 널도 없고, 아직 꽂힌 깃발도 없다(걷는 중에는 걸린 것만 풍경으로 남는다)
    const before = await until(() => drawn(page, K3), (i) => i.slots.length === K3.slots.length, `널 ${K3.slots.length}장이 그려진다`);
    expect(before.active).toBe(false);
    expect(before.keyBridge).toMatchObject({ names: [], cursor: null, flags: [], tags: [], ropes: [], sign: null });

    await page.keyboard.press('KeyE');
    await page.waitForSelector(`[data-installation-hud="${K3.id}"]`);
    expect(await modeOf(page)).toEqual({ installationId: K3.id, stationId: K3.code });
    expect(await page.locator('[data-installation-hud]').getAttribute('aria-label')).toBe(`${K3.name} 작업대`);
    const d = await settled(page);
    const inset = await insetOf(page);
    const view = page.viewportSize()!;
    // 다리 전체(위쪽 띠와 아래쪽 이름 띠까지)가 보이고, 조작 막대에 가려지지 않는다
    const bounds = bridgeBounds({ slots: K3.slots });
    const a = toScreen(d, bounds.x, bounds.y);
    const b = toScreen(d, bounds.x + bounds.w, bounds.y + bounds.h);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(view.width);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);
    expect(d.zoom * PLANK_WHITE_W, '흰 널이 화면에서 48 px 이상').toBeGreaterThanOrEqual(48 - 1e-6);

    // 설치물 층: 흰 널 8장의 이름이 쓰이고, 자유로 놀기라 깃발 8개가 걸이에 서 있다
    const inMode = await waitBridge(page, K3, (x) => x.names.length > 0, '흰 널의 이름이 쓰인다');
    expect(inMode).toMatchObject({ free: true, task: 'flags', names: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], cursor: null, sign: null });
    expect(planksOf(inMode)).toEqual([null, null, null, null, null, null, null, null]);
    expect(await page.locator('[data-installation-hud]').getAttribute('data-bridge-task')).toBe('flags');
    expect(await page.locator('[data-installation-hud]').getAttribute('data-bridge-items')).toBe('8');
    expect(await page.locator('.inst-bar [data-action]').evaluateAll((els) => els.map((e) => e.getAttribute('data-action')))).toEqual([
      'cursor-left',
      'cursor-right',
      'hand-up',
      'hand-down',
      'place',
      'remove',
      'undo',
      'redo',
      'hear-mine',
      'hear-target',
      'stop',
      'check',
      'view-panel',
      'help',
      'exit',
    ]);
    // 13장 모두 캔버스가 직접 받는다(검은 널은 가운데, 흰 널은 가운데)
    for (const s of K3.slots) await plankPoint(page, K3, s.slot);
    expect(await liveText(page)).toContain('제자리표 다리에 들어왔어요');
    await shot(page, 'phase7-key-bridge-K3-free.png');
    await leave(page);
    expect(await modeOf(page)).toBeNull();
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('7-3 Q30 한 마디 안의 임시표를 널을 눌러 푼다(K3)', () => {
  it('마우스 클릭만: 틀리게 꽂으면 틀린 깃발에만 !가 뜨고, 깃발을 골라 옮겨 꽂으면 통과한다. 패널로 보면 같은 널이고, 키도 끌기도 없다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await enter(page, K3, 'chip'); // E를 누르지 않고 안내 칩을 눌러 들어간다
    await pickTarget(page, Q30, 'mouse');
    const start = await bridgeOf(page, K3);
    expect(start).toMatchObject({ free: false, task: 'flags', cursor: null });
    expect(planksOf(start)).toEqual([null, null, null, null]);
    expect(start.sign).toMatchObject({ keySignature: 1, bars: 2, notes: 4, rests: 0, accidentals: 1, clef: true });
    expect(await page.locator('[data-installation-hud]').getAttribute('data-bridge-items')).toBe('4');
    expect(await page.locator('[data-item]').allInnerTexts()).toEqual(['1번 —', '2번 —', '3번 —', '4번 —']);
    await shot(page, 'phase7-key-bridge-K3-Q30-start.png');

    // 틀리게: 네 깃발 모두 F♯4(7번 널)에 꽂는다. 2번과 3번 깃발은 제자리표(F♮)여야 한다
    await plantByPointer(page, K3, 'mouse', [7, 7, 7, 7]);
    const live = await liveText(page);
    expect(live).toBe('4번 깃발을 F4와 G4 사이의 검은 널에 꽂았어요.');
    expect(live).not.toMatch(/[♯♭]/);
    expect((await bridgeOf(page, K3)).flags.map((f) => f.stack)).toEqual([0, 1, 2, 3]);
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitBridge(page, K3, (b) => b.flags.some((f) => f.flagged), '틀린 깃발에 ! 표시가 뜬다');
    expect(flagged.flags.map((f) => f.flagged), 'Q30: 틀린 깃발만 ! 표시').toEqual([false, true, true, false]);
    expect(await page.locator('.inst-feedback').textContent()).not.toContain('통과했어요');
    await shot(page, 'phase7-key-bridge-K3-Q30-flagged.png');

    // 2번 깃발을 골라(칩) F4 널(6번)을 눌러 옮겨 꽂고, 3번 깃발도 그렇게 한다
    for (const draft of [2, 3]) {
      await page.locator(`[data-item="${draft}"]`).click();
      await waitBridge(page, K3, (b) => b.flags.find((f) => f.draft === draft)!.selected, `${draft}번 깃발이 골라진다`);
      await tapPoint(page, 'mouse', await plankPoint(page, K3, 6));
      await waitBridge(page, K3, (b) => b.flags.find((f) => f.draft === draft)!.plank === 6, `${draft}번 깃발이 6번 널로 옮겨진다`);
    }
    expect(await liveText(page)).toBe('3번 깃발을 F4 널에 옮겨 꽂았어요.');
    const fixed = await waitBridge(page, K3, (b) => !b.flags.some((f) => f.flagged), '고쳐 꽂으면 ! 표시가 사라진다');
    expect(planksOf(fixed), 'Q30: 깃발이 꽂힌 널 번호').toEqual(Q30_PLANKS);
    // 같은 널의 깃발은 아래로 한 줄씩 내려 서서 번호가 가려지지 않는다: 널 7에 1번(0), 4번(1), 널 6에 2번(0), 3번(1)
    expect(fixed.flags.map((f) => f.stack)).toEqual([0, 0, 1, 1]);

    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'passed');
    expect(await page.locator('.inst-feedback').textContent()).toContain('통과했어요');
    await shot(page, 'phase7-key-bridge-K3-Q30-passed.png');

    // 패널로 보기(V): 월드에서 꽂은 깃발이 패널의 같은 널에 있다. 널의 이름은 흰 널만 말한다
    await page.locator('[data-action="view-panel"]').click();
    await page.waitForFunction((hash) => location.hash === hash, `#/q/${Q30}`, { timeout: 15000 });
    await page.waitForSelector('.panel-shell h1');
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe('한 마디 안의 임시표');
    expect(await page.locator('.flag-card .tag-name').allTextContents()).toEqual(['꽂은 널: F4와 G4 사이의 검은 널', '꽂은 널: F4 널', '꽂은 널: F4 널', '꽂은 널: F4와 G4 사이의 검은 널']);
    await shot(page, 'phase7-key-bridge-K3-Q30-panel.png');
    await page.locator('.panel-shell .nav-button').click();
    await page.waitForSelector(`[data-installation-hud="${K3.id}"]`);
    expect(await modeOf(page)).toEqual({ installationId: K3.id, stationId: K3.code });
    expect(planksOf(await bridgeOf(page, K3))).toEqual(Q30_PLANKS);

    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    await leave(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만: ← →로 널을 옮기고 Enter로 꽂는다(↑ ↓ 없이 1번 깃발부터 차례로). 마우스를 한 번도 쓰지 않는다', async () => {
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await enter(page, K3, 'key');
    await pickTargetByKeys(page, Q30);
    const cursorAt = (n: number) => waitBridge(page, K3, (b) => b.cursor === n, `커서가 ${n}번 널에 선다`);
    // 1번 깃발: 7번 널(F♯4). 처음 →는 가장 낮은 널(1번)에서 시작한다
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await cursorAt(7);
    await page.keyboard.press('Enter');
    await waitBridge(page, K3, (b) => b.flags[0]!.plank === 7, '1번 깃발이 7번 널에 꽂힌다');
    // 2번 깃발: 6번 널(F4), 3번 깃발: 같은 널
    await page.keyboard.press('ArrowLeft');
    await cursorAt(6);
    await page.keyboard.press('Enter');
    await waitBridge(page, K3, (b) => b.flags[1]!.plank === 6, '2번 깃발이 6번 널에 꽂힌다');
    await page.keyboard.press('Enter');
    await waitBridge(page, K3, (b) => b.flags[2]!.plank === 6, '3번 깃발도 6번 널에 꽂힌다');
    // 4번 깃발: 7번 널
    await page.keyboard.press('ArrowRight');
    await cursorAt(7);
    await page.keyboard.press('Enter');
    const done = await waitBridge(page, K3, (b) => b.flags[3]!.plank === 7, '4번 깃발이 7번 널에 꽂힌다');
    expect(planksOf(done)).toEqual(Q30_PLANKS);
    expect(await liveText(page)).toBe('4번 깃발을 F4와 G4 사이의 검은 널에 꽂았어요.');
    await page.keyboard.press('KeyC');
    await waitFeedback(page, 'passed');
    await shot(page, 'phase7-key-bridge-K3-Q30-keyboard-passed.png');
    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.keys).toBeGreaterThan(14);
    await leave(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('터치만(세로 휴대폰 390×844): 널을 손가락으로 눌러 꽂고 확인 단추를 눌러 통과한다. 흰 널은 48 px 이상이고 키도 끌기도 없다', async () => {
    const { ctx, page, errors } = await boot({ w: 390, h: 844, touch: true, log: true });
    const d = await enter(page, K3, 'tap');
    expect(d.zoom * PLANK_WHITE_W, '휴대폰에서도 흰 널이 48 px 이상').toBeGreaterThanOrEqual(48 - 1e-6);
    await pickTarget(page, Q30, 'touch');
    await plantByPointer(page, K3, 'touch', Q30_PLANKS);
    expect(planksOf(await bridgeOf(page, K3))).toEqual(Q30_PLANKS);
    await press(page.locator('[data-action="check"]'), 'touch');
    await waitFeedback(page, 'passed');
    await shot(page, 'phase7-key-bridge-K3-Q30-touch-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['touch']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 여러 화면 크기: 흰 널은 48 px 아래로 줄지 않고, 고른 널은 늘 보이며 캔버스가 직접 받는다. 좁은 화면(K1이 너비에 다 안 들어오는 폭 763 px 아래)에서는 카메라가 고른 널을 따라간다.
describe('7-3 여러 화면 크기(K1 건반 다리, 25장)', () => {
  // tappable: 널을 눌러 볼 수 있는가. 작은 휴대폰(360×640)은 조작 막대(약 614 px)가 메뉴 띠를 뺀 화면보다 커서 월드가 막대 뒤로 가려진다(알려진 한계).
  // 거기서는 카메라가 배율과 가로 위치를 지키는 것만 보고, 널은 막대의 ◀ ▶ 단추로 고른다(아래 '작은 휴대폰' 시험).
  // 휴대폰 가로(844×390)는 메뉴 띠 아래, 막대 위의 얇은 띠에서 널 줄이 눌린다
  const SIZES = [
    { w: 1280, h: 720, touch: false, narrow: false, tappable: true },
    { w: 1920, h: 1080, touch: false, narrow: false, tappable: true },
    { w: 390, h: 844, touch: true, narrow: true, tappable: true },
    { w: 360, h: 640, touch: true, narrow: true, tappable: false },
    { w: 844, h: 390, touch: true, narrow: false, tappable: true },
  ];
  for (const s of SIZES) {
    it(`${s.w}×${s.h}: 흰 널이 48 px 이상이고, 가장 낮은 널과 가장 높은 널을 고르면 그 널이 보이며${s.tappable ? ' 캔버스가 받는다' : ' 카메라가 가로 위치를 지킨다(막대가 월드를 가려 누르지는 못한다)'}${s.narrow ? '(카메라가 따라간다)' : ''}`, async () => {
      const { ctx, page, errors } = await boot({ w: s.w, h: s.h, touch: s.touch });
      const d = await enter(page, K1, s.touch ? 'tap' : 'key');
      expect(d.zoom * PLANK_WHITE_W, '흰 널 한 장의 화면 너비').toBeGreaterThanOrEqual(48 - 1e-6);
      const view = page.viewportSize()!;
      const inset = await insetOf(page);
      const bounds = bridgeBounds({ slots: K1.slots });
      if (!s.narrow) {
        // 다리가 너비에 다 들어오는 화면: 전체가 한 화면에 담긴다(세로는 막대 위의 자리가 모자랄 수 있어 널의 가운데 줄만 본다)
        const a = toScreen(d, bounds.x, bounds.y);
        const b = toScreen(d, bounds.x + bounds.w, bounds.y + bounds.h);
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(view.width);
        if (s.h >= 720) {
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);
        }
      } else {
        // 좁은 화면: 다리 전체가 아니라 일부만 보인다. 널 1을 고르면 왼쪽 끝이, 널 25를 고르면 오른쪽 끝이 보인다
        expect(d.view.w).toBeLessThan(bounds.w + 64);
      }
      // 눌러 볼 수 있는 화면이면 캔버스가 받는 자리의 x를, 아니면 카메라가 비추는 널 가운데의 x를 읽는다
      const xOf = async (slot: number): Promise<number> => {
        if (s.tappable) return (await plankPoint(page, K1, slot)).x;
        return toScreen(await settled(page), plankCenter(K1, slot).x, plankCenter(K1, slot).y).x;
      };
      // 널 25: 오른쪽 끝까지 →로 옮긴다
      for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
      await waitBridge(page, K1, (b) => b.cursor === 25, '커서가 25번 널에 선다');
      await settled(page);
      const rightX = await xOf(25);
      expect(rightX).toBeGreaterThan(0);
      expect(rightX).toBeLessThan(view.width);
      // 널 1: 다시 왼쪽 끝까지
      for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowLeft');
      await waitBridge(page, K1, (b) => b.cursor === 1, '커서가 1번 널에 선다');
      const back = await settled(page);
      const leftX = await xOf(1);
      expect(leftX).toBeGreaterThan(0);
      expect(leftX).toBeLessThan(view.width);
      // 반대쪽 끝 널(25번)은 좁은 화면에서는 화면 밖, 넓은 화면에서는 화면 안이다
      const far = toScreen(back, plankCenter(K1, 25).x, plankCenter(K1, 25).y);
      if (s.narrow) expect(far.x, '좁은 화면: 커서가 1번 널일 때 25번 널은 화면 오른쪽 밖이다').toBeGreaterThan(view.width);
      else expect(far.x, '넓은 화면: 다리 전체가 한 화면이라 25번 널도 보인다').toBeLessThan(view.width);
      if (s.w === 390) await shot(page, 'phase7-key-bridge-K1-390x844.png');
      if (s.w === 1280) await shot(page, 'phase7-key-bridge-K1-1280x720.png');
      expect(errors).toEqual([]);
      await ctx.close();
    }, 120000);
  }
});

// ---------------------------------------------------------------------------
// 작은 휴대폰(360×640): 조작 막대가 화면을 거의 다 덮어서 널을 눌러 볼 수 없다(알려진 한계). 널은 막대의 ◀ ▶ 단추로 고르고 놓기 단추로 꽂는다(터치만, 끌기 없이: 7.9의 2).
describe('7-3 작은 휴대폰(360×640): 막대의 단추만으로 Q30을 푼다(K3)', () => {
  it('◀ ▶ 단추로 널을 고르고 놓기 단추로 꽂아 통과한다. 누르는 단추와 칩은 48 px 이상이고 화면 안에 있으며, 카메라가 고른 널을 따라가고, 키도 끌기도 없다', async () => {
    const { ctx, page, errors } = await boot({ w: 360, h: 640, touch: true, log: true });
    const d = await enter(page, K3, 'tap');
    expect(d.zoom * PLANK_WHITE_W, '작은 휴대폰에서도 흰 널이 48 px 이상').toBeGreaterThanOrEqual(48 - 1e-6);
    await pickTarget(page, Q30, 'touch');
    // 누르는 대상의 크기와 자리(설계서 7.6: 48×48 px 이상). 화면 안에 있어야 눌린다
    const boxes = await page.locator('.inst-bar [data-action], [data-item], [data-sign-toggle]').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { name: e.getAttribute('data-action') ?? e.getAttribute('data-item') ?? 'sign-toggle', w: r.width, h: r.height, inView: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight };
      }),
    );
    expect(boxes.length, '조작 막대 단추 15 + 깃발 칩 4 + 표지판 단추 1').toBe(20);
    for (const b of boxes) {
      expect(b.w, `${b.name} 너비`).toBeGreaterThanOrEqual(47.5);
      expect(b.h, `${b.name} 높이`).toBeGreaterThanOrEqual(47.5);
      expect(b.inView, `${b.name}가 화면 안에 있다`).toBe(true);
    }
    const tap = (action: string) => page.locator(`[data-action="${action}"]`).tap();
    const cursorAt = (n: number) => waitBridge(page, K3, (b) => b.cursor === n, `커서가 ${n}번 널에 선다`);
    for (let i = 0; i < 7; i++) await tap('cursor-right');
    await cursorAt(7);
    await tap('place');
    await waitBridge(page, K3, (b) => b.flags[0]!.plank === 7, '1번 깃발이 7번 널에 꽂힌다');
    await tap('cursor-left');
    await cursorAt(6);
    await tap('place');
    await waitBridge(page, K3, (b) => b.flags[1]!.plank === 6, '2번 깃발이 6번 널에 꽂힌다');
    await tap('place');
    await waitBridge(page, K3, (b) => b.flags[2]!.plank === 6, '3번 깃발도 6번 널에 꽂힌다');
    await tap('cursor-right');
    await cursorAt(7);
    await tap('place');
    const done = await waitBridge(page, K3, (b) => b.flags[3]!.plank === 7, '4번 깃발이 7번 널에 꽂힌다');
    expect(planksOf(done), 'Q30: 깃발이 꽂힌 널 번호').toEqual(Q30_PLANKS);
    await tap('check');
    await waitFeedback(page, 'passed');
    await shot(page, 'phase7-key-bridge-K3-Q30-360x640-passed.png');

    // 카메라가 고른 널을 따라간다: 커서가 오른쪽 끝 널(13번)에 서면 13번 널이 화면 안에, 1번 널은 화면 왼쪽 밖에 있다(다리 427 px > 화면 360 px)
    for (let i = 0; i < 6; i++) await tap('cursor-right');
    await cursorAt(13);
    const end = await settled(page);
    const at13 = toScreen(end, plankCenter(K3, 13).x, plankCenter(K3, 13).y).x;
    const at1 = toScreen(end, plankCenter(K3, 1).x, plankCenter(K3, 1).y).x;
    expect(at13, '13번 널이 화면 안').toBeGreaterThan(0);
    expect(at13).toBeLessThan(360);
    expect(at1, '1번 널은 화면 왼쪽 밖').toBeLessThan(0);
    expect(end.zoom * PLANK_WHITE_W).toBeGreaterThanOrEqual(48 - 1e-6);

    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['touch']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120000);
});

// ---------------------------------------------------------------------------
describe('7-3 Q27 검은 건반의 이름(K1): 검은 널을 눌러 이름표 자리를 고르고 이름표를 건다', () => {
  const Q27 = 'key.black-key-names/black-key-names';
  /** 검은 널 번호와 그 널의 이름표(올려 부른 이름, 내려 부른 이름) */
  const BLACKS: Array<{ slot: number; up: string; down: string }> = [
    { slot: 2, up: 'C♯', down: 'D♭' },
    { slot: 4, up: 'D♯', down: 'E♭' },
    { slot: 7, up: 'F♯', down: 'G♭' },
    { slot: 9, up: 'G♯', down: 'A♭' },
    { slot: 11, up: 'A♯', down: 'B♭' },
  ];

  it('마우스 클릭만: 첫 이름표를 일부러 틀리게 걸면 그 자리에만 !가 뜨고, 널을 다시 눌러 고쳐 걸면 통과한다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await enter(page, K1, 'chip');
    await pickTarget(page, Q27, 'mouse');
    const start = await bridgeOf(page, K1);
    expect(start).toMatchObject({ free: false, task: 'names', cursor: null });
    expect(start.tags.map((t) => [t.plank, t.side, t.text])).toEqual(BLACKS.flatMap((b) => [[b.slot, 'raised', null], [b.slot, 'lowered', null]]));
    expect(await page.locator('[data-tag]').allInnerTexts()).toEqual(['C♯', 'D♭', 'D♯', 'E♭', 'F♯', 'G♭', 'G♯', 'A♭', 'A♯', 'B♭']);
    await shot(page, 'phase7-key-bridge-K1-Q27-start.png');

    for (const b of BLACKS) {
      // 널을 한 번 누르면 올려 부른 이름표 자리, 한 번 더 누르면 내려 부른 이름표 자리가 골라진다
      const at = await plankPoint(page, K1, b.slot);
      const wrongFirst = b.slot === 2;
      await page.mouse.click(at.x, at.y);
      await waitBridge(page, K1, (x) => x.tags.some((t) => t.plank === b.slot && t.side === 'raised' && t.selected), `${b.slot}번 널의 올려 부른 이름표 자리가 골라진다`);
      await page.locator(`[data-tag="${wrongFirst ? 'D♯' : b.up}"]`).click();
      await page.mouse.click(at.x, at.y);
      await waitBridge(page, K1, (x) => x.tags.some((t) => t.plank === b.slot && t.side === 'lowered' && t.selected), `${b.slot}번 널의 내려 부른 이름표 자리가 골라진다`);
      await page.locator(`[data-tag="${b.down}"]`).click();
      await waitBridge(page, K1, (x) => x.tags.filter((t) => t.plank === b.slot).every((t) => t.text !== null), `${b.slot}번 널의 이름표 둘이 걸린다`);
    }
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitBridge(page, K1, (x) => x.tags.some((t) => t.flagged), '틀린 이름표에 ! 표시가 뜬다');
    expect(flagged.tags.filter((t) => t.flagged).map((t) => [t.plank, t.side, t.text]), 'Q27: 틀린 이름표').toEqual([[2, 'raised', 'D♯']]);

    // 첫째 검은 널을 다시 눌러 올려 부른 이름표 자리를 고르고 C♯으로 고쳐 건다
    const first = await plankPoint(page, K1, 2);
    await page.mouse.click(first.x, first.y);
    await waitBridge(page, K1, (x) => x.tags.some((t) => t.plank === 2 && t.side === 'raised' && t.selected), '다시 눌러 올려 부른 자리를 고른다');
    await page.locator('[data-tag="C♯"]').click();
    await waitBridge(page, K1, (x) => !x.tags.some((t) => t.flagged) && x.tags[0]!.text === 'C♯', '고쳐 걸면 ! 표시가 사라진다');
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'passed');
    expect((await bridgeOf(page, K1)).tags.map((t) => t.text)).toEqual(BLACKS.flatMap((b) => [b.up, b.down]));
    await shot(page, 'phase7-key-bridge-K1-Q27-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
describe('7-3 K2 음정 밧줄: Q29 음정 쌓기와 Q04 음정 이름', () => {
  const Q29 = 'key.build-intervals/challenge';
  const Q04 = 'pitch.same-sound-different-names/interval-names';

  it('Q29 높은 도전, 마우스 클릭만: 끝 말뚝을 널에 꽂고 이름을 고른다. A♯4 그대로 두면 그 질문에만 !가 뜨고 B♭4를 고르면 통과한다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await enter(page, K2, 'chip');
    await pickTarget(page, Q29, 'mouse');
    const start = await bridgeOf(page, K2);
    expect(start).toMatchObject({ free: false, task: 'interval', cursor: null });
    expect(await page.locator('[data-installation-hud]').getAttribute('data-bridge-items')).toBe('2');
    expect(await page.locator('[data-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-item')))).toEqual(['b1', 'b2']);
    await shot(page, 'phase7-key-bridge-K2-Q29-start.png');

    // 질문 1(F4 위 완전4도 → B♭4): 널 11(A♯4와 B♭4가 같은 검은 널)에 끝 말뚝을 꽂는다. 처음 이름은 올림 이름(A♯4)이라 아직 틀리다
    await page.locator('[data-item="b1"]').click();
    await tapPoint(page, 'mouse', await plankPoint(page, K2, 11));
    await page.waitForSelector('[data-bridge-pick="build"] [data-stake="B♭4"]');
    const live = await liveText(page);
    expect(live).toBe('끝 말뚝을 A4와 B4 사이의 검은 널에 꽂았어요. 이름을 골라 주세요.');
    expect(live).not.toMatch(/[♯♭]/);
    // 질문 2(E4 위 장3도 → G♯4): 널 9(G♯4와 A♭4)에 꽂는다. 올림 이름 G♯4가 정답이다
    await page.locator('[data-item="b2"]').click();
    await tapPoint(page, 'mouse', await plankPoint(page, K2, 9));
    await page.waitForSelector('[data-bridge-pick="build"] [data-stake="G♯4"]');
    const ropes = (await bridgeOf(page, K2)).ropes;
    expect(ropes.map((r) => [r.qid, r.from, r.to]).sort(), '밧줄: 질문마다 시작 말뚝에서 끝 말뚝까지').toEqual([['b1', 6, 11], ['b2', 5, 9]]);

    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitBridge(page, K2, (b) => b.ropes.some((r) => r.flagged), '틀린 질문의 밧줄에 ! 표시가 뜬다');
    expect(flagged.ropes.filter((r) => r.flagged).map((r) => r.qid), 'Q29: 틀린 질문만').toEqual(['b1']);
    await shot(page, 'phase7-key-bridge-K2-Q29-flagged.png');

    // 질문 1을 다시 골라 끝 말뚝의 이름을 B♭4로 바꾼다(말뚝은 그대로 널 11에 있다)
    await page.locator('[data-item="b1"]').click();
    await page.locator('[data-stake="B♭4"]').click();
    await waitBridge(page, K2, (b) => !b.ropes.some((r) => r.flagged), '이름을 고치면 ! 표시가 사라진다');
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'passed');
    expect(await page.locator('.inst-feedback').textContent()).toContain('통과했어요');
    await shot(page, 'phase7-key-bridge-K2-Q29-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120000);

  it('Q04 음정 이름, 마우스 클릭만: 소리는 같고 표기는 다르다고 답하고, C4에서 D♯4까지는 늘2도, E♭4까지는 단3도라고 답한다. 같은 소리라서 단3도로 답하면 그 질문에만 !가 뜬다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await enter(page, K2, 'chip');
    await pickTarget(page, Q04, 'mouse');
    expect(await page.locator('[data-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-item')))).toEqual(['c1', 'i1', 'i2']);
    // 밧줄은 질문마다 하나다. C♯4와 D♭4(c1)는 같은 널 2에서 시작해 끝나고, C4에서 D♯4까지(i1)도 C4에서 E♭4까지(i2)도 널 4에서 끝난다(같은 소리, 다른 이름)
    const ropes = (await bridgeOf(page, K2)).ropes;
    expect(ropes.map((r) => [r.qid, r.from, r.to]).sort(), 'Q04: 밧줄').toEqual([['c1', 2, 2], ['i1', 1, 4], ['i2', 1, 4]]);
    await shot(page, 'phase7-key-bridge-K2-Q04-start.png');

    await page.locator('[data-item="c1"]').click();
    await page.locator('[data-part="sound"][data-answer="same"]').click();
    await page.locator('[data-part="notation"][data-answer="different"]').click();
    // i1을 일부러 단3도로 답한다(소리가 같아서 이름도 같다고 생각한 경우)
    await page.locator('[data-item="i1"]').click();
    await page.locator('[data-quality="minor"]').click();
    await page.locator('[data-number="3"]').click();
    await page.locator('[data-item="i2"]').click();
    await page.locator('[data-quality="minor"]').click();
    await page.locator('[data-number="3"]').click();
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'needsRevision');
    const flagged = await waitBridge(page, K2, (b) => b.ropes.some((r) => r.flagged), '틀린 질문의 밧줄에 ! 표시가 뜬다');
    expect(flagged.ropes.filter((r) => r.flagged).map((r) => r.qid), 'Q04: 틀린 질문만').toEqual(['i1']);
    await shot(page, 'phase7-key-bridge-K2-Q04-flagged.png');

    await page.locator('[data-item="i1"]').click();
    await page.locator('[data-quality="augmented"]').click();
    await page.locator('[data-number="2"]').click();
    await waitBridge(page, K2, (b) => !b.ropes.some((r) => r.flagged), '고치면 ! 표시가 사라진다');
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'passed');
    await shot(page, 'phase7-key-bridge-K2-Q04-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120000);
});

// ---------------------------------------------------------------------------
// K4 반음 계단(Q31 반음계)은 징검 길(steppingPath)이라 돌 위에 놓는 조작은 7-2의 음계 길과 같다. 여기서는 열세 돌이 두 줄(7 + 6)로 놓인 이 터에서 월드가 실제로 풀리는지를 본다.
describe('7-3 K4 반음 계단: Q31 반음계(열세 돌)', () => {
  const Q31 = 'scale.chromatic/descending';
  /** 내림 반음계 C5에서 C4까지: 선반 번호(0 = B3, 1 = C4 … 8 = C5)와 변화표, 돌에 쓰이는 이름 */
  const DESC: Array<{ shelf: number; acc: 'none' | 'flat'; label: string }> = [
    { shelf: 8, acc: 'none', label: 'C5' },
    { shelf: 7, acc: 'none', label: 'B4' },
    { shelf: 7, acc: 'flat', label: 'B♭4' },
    { shelf: 6, acc: 'none', label: 'A4' },
    { shelf: 6, acc: 'flat', label: 'A♭4' },
    { shelf: 5, acc: 'none', label: 'G4' },
    { shelf: 5, acc: 'flat', label: 'G♭4' },
    { shelf: 4, acc: 'none', label: 'F4' },
    { shelf: 3, acc: 'none', label: 'E4' },
    { shelf: 3, acc: 'flat', label: 'E♭4' },
    { shelf: 2, acc: 'none', label: 'D4' },
    { shelf: 2, acc: 'flat', label: 'D♭4' },
    { shelf: 1, acc: 'none', label: 'C4' },
  ];

  it('돌 13개가 두 줄(7 + 6)로 서고, E로 들어가면 모두 막대 위에 보이며 캔버스가 받는다', async () => {
    const { ctx, page, errors } = await boot();
    const d = await enter(page, K4, 'key');
    expect(K4.slots.length).toBe(13);
    // 두 줄: 위 줄 돌 7개의 y가 같고 아래 줄 돌 6개의 y가 같다
    const ys = [...new Set(K4.slots.map((c) => c.y))].sort((a, b) => a - b);
    expect(ys.length, '돌 줄의 수').toBe(2);
    expect(K4.slots.filter((c) => c.y === ys[0]).length).toBe(7);
    expect(K4.slots.filter((c) => c.y === ys[1]).length).toBe(6);
    const inset = await insetOf(page);
    const view = page.viewportSize()!;
    const x0 = Math.min(...K4.slots.map((c) => c.x));
    const x1 = Math.max(...K4.slots.map((c) => c.x + c.w));
    const y1 = Math.max(...K4.slots.map((c) => c.y + c.h));
    const a = toScreen(d, x0, ys[0]!);
    const b = toScreen(d, x1, y1);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(view.width);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(view.height - inset + 1);
    for (const c of K4.slots) await plankPoint(page, K4, c.slot);
    await shot(page, 'phase7-key-bridge-K4-free.png');
    await leave(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('Q31 내림, 마우스 클릭만: 열세 돌을 눌러 놓는다. 셋째 돌을 B♭4 대신 B4로 놓으면 그 돌에만 !가 뜨고, 고쳐 놓으면 통과한다. 키도 끌기도 없다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await enter(page, K4, 'chip');
    await pickTarget(page, Q31, 'mouse');
    const labels = async () => (await drawn(page, K4)).slots.map((s) => s.label);
    expect((await labels()).every((l) => l === null)).toBe(true);
    for (let i = 0; i < DESC.length; i++) {
      const step = DESC[i]!;
      // 셋째 돌: 일부러 B4(내림표 없이)로 놓는다
      const shelf = i === 2 ? 7 : step.shelf;
      const acc = i === 2 ? 'none' : step.acc;
      await page.locator(`[data-shelf="${shelf}"]`).click();
      await page.locator(`[data-accidental="${acc}"]`).click();
      await tapPoint(page, 'mouse', await plankPoint(page, K4, i + 1));
      await until(() => drawn(page, K4), (x) => x.slots[i]!.label !== null, `${i + 1}번 돌에 음 이름이 쓰인다`);
    }
    expect(await labels()).toEqual(DESC.map((x, i) => (i === 2 ? 'B4' : x.label)));
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'needsRevision');
    const flagged = await until(() => drawn(page, K4), (x) => x.slots.some((s) => s.flagged), '틀린 돌에 ! 표시가 뜬다');
    expect(flagged.slots.map((s) => s.flagged), 'Q31: 틀린 돌만 ! 표시').toEqual(DESC.map((_, i) => i === 2));
    await shot(page, 'phase7-key-bridge-K4-Q31-flagged.png');

    // 셋째 돌을 눌러 고르고(덮어쓰지 않는다), 손의 음을 B♭로 바꿔 놓기 단추로 바꿔 놓는다
    await tapPoint(page, 'mouse', await plankPoint(page, K4, 3));
    await page.waitForFunction(() => (document.querySelector('.inst-cursor')?.textContent ?? '').includes('3번째 자리'), undefined, { timeout: 15000 });
    expect((await labels())[2]).toBe('B4');
    await page.locator('[data-shelf="7"]').click();
    await page.locator('[data-accidental="flat"]').click();
    await page.locator('[data-action="place"]').click();
    await until(() => drawn(page, K4), (x) => x.slots[2]!.label === 'B♭4' && !x.slots.some((s) => s.flagged), '고쳐 놓으면 ! 표시가 사라진다');
    await page.locator('[data-action="check"]').click();
    await waitFeedback(page, 'passed');
    expect(await labels()).toEqual(DESC.map((x) => x.label));
    expect(await page.locator('.inst-feedback').textContent()).toContain('통과했어요');
    await shot(page, 'phase7-key-bridge-K4-Q31-passed.png');
    const log = await inputLog(page);
    expect(log.keys).toBe(0);
    expect(log.types).toEqual(['mouse']);
    expect(log.maxDrag).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120000);
});

// ---------------------------------------------------------------------------
describe('7-3 걸어서 다리를 건넌다(K3)', () => {
  it('기슭에서 내려와 흰 널 줄을 따라 오른쪽으로 걸으면 밟은 흰 널의 사건이 번호 순서로 오고, 모드에도 판정에도 들어가지 않는다(W-3)', async () => {
    const { ctx, page, errors } = await boot();
    // 널 줄의 위쪽 기슭(널 1의 바로 위)에서 아래로 내려선다
    await command(page, { type: 'teleport', x: 2950, y: 5740 });
    await page.waitForTimeout(400);
    await recordEvents(page);
    await page.keyboard.down('ArrowDown');
    await until(() => pos(page), (v) => v.y > 5990, '기슭에서 널 위로 내려선다', 30000);
    await page.keyboard.up('ArrowDown');
    await page.keyboard.down('ArrowRight');
    const p = await until(() => pos(page), (v) => v.x > 3440, '흰 널 줄을 따라 오른쪽 끝까지 걷는다', 60000);
    await page.keyboard.up('ArrowRight');
    expect(p.y).toBeGreaterThan(5950);
    const steps = (await eventsOf(page, 'stepped')).filter((e) => e.installationId === K3.id);
    const seq = steps.map((e) => e.slot!).filter((slot, i, all) => i === 0 || slot !== all[i - 1]);
    // 검은 널(높이 150)보다 아래 줄을 걸으면 흰 널만 밟는다: C4 E4 F4 A4... 가 아니라 흰 널의 번호 1, 3, 5, 6, 8, 10, 12, 13이다
    expect(seq, '밟은 널 번호(연속 중복 제거)').toEqual([1, 3, 5, 6, 8, 10, 12, 13]);
    expect(await modeOf(page)).toBeNull();
    expect(await eventsOf(page, 'slot-pressed')).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120000);
});
