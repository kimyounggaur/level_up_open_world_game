// 6-7 종나무 숲(bell-grove)의 종나무(T4) 흐름 시험(실제 Chrome): W1 세 종 나무(Q05), W2 밝은 종 어두운 종(Q20, Q22),
// W3 종탑(Q06), W4 세 기둥 빈터(Q21, Q23). 도메인(6-7a), 작업대(6-7b), 월드의 그림과 카메라(6-7c)를 한꺼번에 이어서 본다.
// 완료 기준(설계서 12.9): 종탑에서 가로 순서만 바꾸면 전위가 그대로다. 그 밖에 이 파일이 보는 것:
//  - 키보드만으로·마우스 클릭만으로·터치만으로 끌지 않고 푼다(W-4)
//  - 카메라가 이름표 띠(열 번호)까지 메뉴 띠 아래에 담고, 칸은 화면에서 48 px 아래로 줄지 않는다. 좁은 화면에서는 고른 나무를 따라간다(7.6)
//  - 걸어서 나무에 올라서면 그 나무의 화음이 울릴 뿐 모드에도 판정에도 들어가지 않는다(W-3)
//  - 소리를 꺼도(헤드리스는 소리를 켜지 않는다) 듣는 종이 보인다(W-8), 틀린 종은 ! 표시로 보인다
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import w1 from '../../content/installations/inst.bell-grove.three-bells.json';
import w2 from '../../content/installations/inst.bell-grove.bright-dark.json';
import w3 from '../../content/installations/inst.bell-grove.bell-tower.json';
import w4 from '../../content/installations/inst.bell-grove.three-pillars.json';
import { command, dbg, drawnOf, eventsOf, insetOf, modeOf, pos, recordEvents, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, waitUnframed, type Dbg, type DrawnBells, type Game } from './game';
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

const W1 = w1.installationId;
const W2 = w2.installationId;
const W3 = w3.installationId;
const W4 = w4.installationId;
type Station = 'W1' | 'W2' | 'W3' | 'W4';
interface Cell {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
const CELLS = { [W1]: w1.slots, [W2]: w2.slots, [W3]: w3.slots, [W4]: w4.slots } as Record<string, ReadonlyArray<Cell>>;
/** 한 나무의 열 수(열 번호 띠는 열마다 하나): 종탑은 셋, 나머지는 넷 */
const COLUMNS: Record<string, number> = { [W1]: 4, [W2]: 4, [W3]: 3, [W4]: 4 };
/** 가지 4단: 맨 위가 5옥타브다 */
const OCTAVES = [5, 4, 3, 2];
/** 이름표 띠: 고리 격자의 왼쪽 52 px(옥타브), 위쪽 44 px(열 번호) */
const LABEL_LEFT = 52;
const LABEL_TOP = 44;
const MENU_BAND = 64;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const LONG = 300_000;

const Q05_C = 'chord.major-triad/c-major';
const Q20_C_MINOR = 'chord.major-and-minor/c-minor';
const Q22_C_AUG = 'chord.diminished-augmented/c-aug';
const Q06_C_FIRST = 'chord.inversion/c-first';
const Q21 = 'chord.primary-triads/c-major-pillars';
const Q23 = 'chord.progression-walk/c-major-walk';

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
    // 카메라는 목표의 반 픽셀 안에 들면 목표에 붙는다. 느린 Chrome에서는 프레임 사이가 150 ms보다 길 수 있어서 세 번(0.45초) 이어서 가만히 있어야 도착한 것이다
    const same = Math.abs(cur.center.x - prev.center.x) < 0.01 && Math.abs(cur.center.y - prev.center.y) < 0.01 && Math.abs(cur.zoom - prev.zoom) < 1e-4;
    still = same ? still + 1 : 0;
    if (still >= 3 && cur.pending.length === 0 && cur.framing && !cur.transitioning) return cur;
    prev = cur;
  }
  throw new Error('카메라가 설치물 앞에 가만히 서지 않아요');
}

const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());
const act = (page: Page, action: string, how: Pointer): Promise<void> => press(page.locator(`[data-action="${action}"]`), how);
const waitFeedback = (page: Page, state: string) => page.waitForFunction((s) => document.querySelector('.inst-feedback')?.getAttribute('data-feedback') === s, state, { timeout: 15000 });
const feedbackText = (page: Page): Promise<string> => page.locator('.inst-feedback').innerText();
const waitTarget = (page: Page, key: string) => page.waitForFunction((k) => document.querySelector('[data-installation-hud]')?.getAttribute('data-target') === k, key, { timeout: 15000 });
/** 화면 낭독기가 읽는 알림(눈에 보이지 않는 live 영역)이 이 말을 담을 때까지 */
const waitLive = (page: Page, part: string) => page.waitForFunction((p) => (document.querySelector('[data-live]')?.textContent ?? '').includes(p), part, { timeout: 15000 });

/** 정거장 앞에 서서 모드에 들어간다. 카메라가 가만히 설 때까지 기다린다. tap은 손가락으로(세로 화면은 64 px 열기 단추, 가로 화면은 안내 칩. 7.6) */
async function enter(page: Page, station: Station, id: string, how: 'key' | 'chip' | 'tap' = 'key'): Promise<Dbg> {
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

// ───── 그려진 종 읽기 ─────

const bellsOf = async (page: Page, id: string): Promise<DrawnBells> => {
  const b = (await drawnOf(page, id)).bell;
  if (!b) throw new Error(`종나무가 아니거나 아직 그리지 않았어요: ${id}`);
  return b;
};
/** 그려진 종의 이름을 나무, 열 순서로 */
const labelsOf = (b: DrawnBells): string[] => [...b.bells].sort((x, y) => x.tree - y.tree || x.column - y.column).map((m) => m.label);
/** 그려진 종이 조건을 채울 때까지 */
const waitBells = (page: Page, id: string, ok: (b: DrawnBells) => boolean, what: string): Promise<DrawnBells> => until(() => bellsOf(page, id), ok, what);

/** 고리 번호(1부터): 나무마다 4단 × 열 수, 한 단은 열 수만큼. 맨 위 단(5옥타브)이 먼저다 */
const ringSlot = (id: string, tree: number, octave: number, column: number): number => (tree * OCTAVES.length + OCTAVES.indexOf(octave)) * COLUMNS[id]! + column + 1;

/** 나무 한 그루가 차지하는 사각형: 고리 격자 둘레에 왼쪽 옥타브 띠와 위쪽 열 번호 띠까지 */
function treeFrame(id: string, tree: number): { x: number; y: number; w: number; h: number } {
  const first = CELLS[id]!.find((c) => c.slot === ringSlot(id, tree, OCTAVES[0]!, 0))!;
  return { x: first.x - LABEL_LEFT, y: first.y - LABEL_TOP, w: LABEL_LEFT + COLUMNS[id]! * first.w, h: LABEL_TOP + OCTAVES.length * first.h };
}
/** 설치물 전체의 사각형(이름표 띠까지): 나무 첫째의 왼쪽 위부터 마지막 고리의 오른쪽 아래까지 */
function wholeFrame(id: string): { x: number; y: number; w: number; h: number } {
  const cells = CELLS[id]!;
  const x0 = Math.min(...cells.map((c) => c.x)) - LABEL_LEFT;
  const y0 = Math.min(...cells.map((c) => c.y)) - LABEL_TOP;
  const x1 = Math.max(...cells.map((c) => c.x + c.w));
  const y1 = Math.max(...cells.map((c) => c.y + c.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 카메라가 설치물을 설계서 7.6대로 담았는가(가만히 설 때까지 기다린 뒤):
 *  - 고리 한 칸이 화면에서 48 px 이상이다: 어느 화면에서도 더 줄이지 않는다.
 *  - 이름표 띠까지 틀 전체가 메뉴 띠 아래, 조작 막대 위, 화면 좌우 안에 들어오면 전체를 보인다. 위쪽 열 번호 띠가 메뉴 단추 뒤로 가려지지 않는다.
 *  - 전체가 들어오지 않을 만큼 화면이 좁거나 막대가 크면 고른 나무(가로)와 고른 칸(세로)이 메뉴 띠 아래, 막대 위에 온전히 보인다.
 * whole은 전체가 보이는 경우인가다.
 */
async function expectBellsFramed(page: Page, id: string, tree = 0): Promise<{ d: Dbg; whole: boolean }> {
  const d = await settled(page);
  const vp = page.viewportSize()!;
  const inset = await insetOf(page);
  const cell = CELLS[id]![0]!;
  expect(cell.w * d.zoom, `${id} 고리 한 칸의 너비(화면 px)`).toBeGreaterThanOrEqual(48 - 1e-6);
  expect(cell.h * d.zoom, `${id} 고리 한 칸의 높이(화면 px)`).toBeGreaterThanOrEqual(48 - 1e-6);
  const room = vp.height - inset;
  const all = wholeFrame(id);
  const a = toScreen(d, all.x, all.y);
  const b = toScreen(d, all.x + all.w, all.y + all.h);
  const whole = b.x - a.x <= vp.width + 0.5 && b.y - a.y <= room - MENU_BAND + 0.5;
  if (whole) {
    expect(a.x, `${id} 틀의 왼쪽`).toBeGreaterThanOrEqual(-0.5);
    expect(vp.width - b.x, `${id} 틀의 오른쪽`).toBeGreaterThanOrEqual(-0.5);
    expect(a.y, `${id} 틀의 위쪽(열 번호 띠)이 메뉴 띠 아래`).toBeGreaterThanOrEqual(MENU_BAND - 0.5);
    expect(room - b.y, `${id} 틀의 아래쪽이 조작 막대 위`).toBeGreaterThanOrEqual(-0.5);
  } else {
    const t = treeFrame(id, tree);
    const ta = toScreen(d, t.x, t.y);
    const tb = toScreen(d, t.x + t.w, t.y + t.h);
    expect(ta.x, `${id} 고른 나무의 왼쪽`).toBeGreaterThanOrEqual(-0.5);
    expect(vp.width - tb.x, `${id} 고른 나무의 오른쪽`).toBeGreaterThanOrEqual(-0.5);
  }
  const cursor = (await bellsOf(page, id)).cursor;
  if (cursor && cursor.slot !== null) {
    const c = CELLS[id]!.find((x) => x.slot === cursor.slot)!;
    const ca = toScreen(d, c.x, c.y);
    const cb = toScreen(d, c.x + c.w, c.y + c.h);
    expect(ca.y, `${id} 고른 칸의 위쪽이 메뉴 띠 아래`).toBeGreaterThanOrEqual(MENU_BAND - 0.5);
    expect(room - cb.y, `${id} 고른 칸의 아래쪽이 조작 막대 위`).toBeGreaterThanOrEqual(-0.5);
  }
  return { d, whole };
}

/** 고리 칸의 화면 자리. 카메라가 가만히 있을 때 읽고, 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다 */
async function cellPoint(page: Page, id: string, slot: number): Promise<{ x: number; y: number }> {
  const d = await settled(page);
  const r = CELLS[id]!.find((c) => c.slot === slot)!;
  const at = toScreen(d, r.x + r.w / 2, r.y + r.h / 2);
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  if (tag !== 'CANVAS') throw new Error(`${slot}번 고리 자리(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받지 않아요: ${tag}`);
  return at;
}
const tapCell = async (page: Page, id: string, slot: number, how: Pointer): Promise<void> => {
  const p = await cellPoint(page, id, slot);
  await (how === 'touch' ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
};

// ───── 손에 든 종(음이름, 변화표) ─────

const handOf = (page: Page): Promise<string> => page.locator('.inst-hand').getAttribute('data-hand').then((t) => t ?? '');
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** 키보드로 음이름을 맞춘다: PageUp은 한 음 올리고 PageDown은 한 음 내린다. 끝에서 멈추므로 필요한 만큼만 누른다 */
async function handTo(page: Page, letter: string): Promise<void> {
  const now = (await handOf(page)).charAt(0);
  const diff = LETTERS.indexOf(letter) - LETTERS.indexOf(now);
  for (let i = 0; i < Math.abs(diff); i++) await page.keyboard.press(diff > 0 ? 'PageUp' : 'PageDown');
  await page.waitForFunction((l) => (document.querySelector('.inst-hand')?.getAttribute('data-hand') ?? '').startsWith(l), letter, { timeout: 15000 });
}

// ───── 듣는 동안 울리는 종 ─────

/** 페이지 안에서 프레임마다 울리는 종을 모은다(바뀔 때만 담는다): 느린 Chrome에서도 듣는 동안의 값이 빠짐없이 남는다 */
const startBellSampler = (page: Page, id: string): Promise<void> =>
  page.evaluate((iid) => {
    const w = window as unknown as { __game: Game; __bellSamples?: string[][] };
    const out: string[][] = [];
    w.__bellSamples = out;
    const frame = (): void => {
      const bell = w.__game.world.debugState()?.installations.find((i) => i.installationId === iid)?.bell;
      if (bell) {
        const now = bell.bells.filter((b) => b.playing).map((b) => `${b.tree}:${b.label}`);
        const last = out[out.length - 1];
        if (!last || last.join() !== now.join()) out.push(now);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, id);
/** 듣기가 시작되어 끝날 때까지 기다린다(울리는 종이 나타났다가 다시 모두 사라진다). 모은 값을 돌려준다 */
async function waitHeard(page: Page): Promise<string[][]> {
  await page.waitForFunction(() => ((window as unknown as { __bellSamples?: string[][] }).__bellSamples ?? []).some((s) => s.length > 0), undefined, { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const list = (window as unknown as { __bellSamples?: string[][] }).__bellSamples ?? [];
      return list.length > 0 && list[list.length - 1]!.length === 0 && list.some((s) => s.length > 0);
    },
    undefined,
    { timeout: 30000 },
  );
  return page.evaluate(() => (window as unknown as { __bellSamples?: string[][] }).__bellSamples ?? []);
}

describe('6-7 W1 세 종 나무(Q05): 키보드만으로', () => {
  it(
    'W1 앞에서 E로 들어가면 카메라가 열 번호 띠까지 메뉴 아래에 담는다. C E G를 걸어 통과하고, 나가도 종은 걸려 있고 이름표는 사라진다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      await enter(page, 'W1', W1, 'key');
      expect(await modeOf(page)).toMatchObject({ installationId: W1 });

      // 자유로 놀기: 종이 없고, 이름표(옥타브 4, 열 4)가 달린다. 열 번호 띠가 메뉴 단추 뒤로 가려지지 않는다
      let bell = await bellsOf(page, W1);
      expect(bell).toMatchObject({ form: 'tree', trees: 1, bells: [], hatched: [], labels: { octaves: 4, columns: 4, trees: 0 } });
      await expectBellsFramed(page, W1);

      await pickTargetByKeys(page, Q05_C);
      bell = await bellsOf(page, W1);
      // C4–B5가 음역이라 3옥타브와 2옥타브 가지는 쓰지 않는 가지(빗금)다
      expect(bell.hatched).toEqual([3, 2]);
      await expectBellsFramed(page, W1);
      await shot(page, 'phase6-bells-w1-empty-keyboard.png');

      // 방향키로 종 자리를 고르면 단추에 있던 초점이 놓여서 이어서 누르는 Enter가 '걸기'가 된다
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await waitBells(page, W1, (b) => labelsOf(b).join() === 'C4', '첫 종 C4가 걸린다');
      await page.keyboard.press('ArrowRight');
      await handTo(page, 'E');
      await page.keyboard.press('Enter');
      await waitBells(page, W1, (b) => labelsOf(b).join() === 'C4,E4', '둘째 종 E4가 걸린다');
      await page.keyboard.press('ArrowRight');
      await handTo(page, 'G');
      await page.keyboard.press('Enter');
      bell = await waitBells(page, W1, (b) => labelsOf(b).join() === 'C4,E4,G4', '셋째 종 G4가 걸린다');
      // 4옥타브 단(위에서 둘째 단)의 첫째, 둘째, 셋째 열이다
      expect(bell.bells.map((b) => b.slot)).toEqual([ringSlot(W1, 0, 4, 0), ringSlot(W1, 0, 4, 1), ringSlot(W1, 0, 4, 2)]);
      expect(bell.cursor).toMatchObject({ tree: 0, column: 2, octave: 4 });
      expect(bell.bells.every((b) => !b.flagged && !b.muted && !b.lowest)).toBe(true);
      await expectBellsFramed(page, W1);

      // C: 배치 확인
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      expect(await feedbackText(page)).toContain('통과했어요');
      await shot(page, 'phase6-bells-w1-q05-keyboard.png');

      // 듣기(P): 걸린 종이 울리는 동안 그 종들이 금빛으로 보이고, 끝나면 모두 사라진다. 소리를 켜지 않아도 보인다(W-8)
      await startBellSampler(page, W1);
      await page.keyboard.press('KeyP');
      const heard = await waitHeard(page);
      const lit = heard.filter((s) => s.length > 0);
      expect(lit.length).toBeGreaterThan(0);
      // 함께 울리기: 세 종이 한꺼번에 금빛이 되는 때가 있다
      expect(lit.some((s) => s.length === 3), '세 종이 함께 울린다').toBe(true);

      // Esc: 나간다. 종은 걸린 채로 남고(그림은 구조와 종만), 열 번호·옥타브 이름표와 고른 자리는 사라진다
      await page.keyboard.press('Escape');
      await waitUnframed(page);
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      expect(await modeOf(page)).toBeNull();
      bell = await waitBells(page, W1, (b) => b.labels.octaves === 0, '이름표가 사라진다');
      expect(labelsOf(bell)).toEqual(['C4', 'E4', 'G4']);
      expect(bell).toMatchObject({ labels: { octaves: 0, columns: 0, trees: 0 }, hatched: [], cursor: null });

      // 입력 기록: 눌러서 한 것이 하나도 없다(키보드만, W-4)
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(log.keys).toBeGreaterThan(10);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-7 W2 밝은 종 어두운 종(Q20, Q22): 마우스 클릭만으로', () => {
  it(
    '재료 선반과 가지를 눌러서 C E♭ G를 건다: 같은 열의 다른 가지를 누르면 종이 옮겨 가고, 쓰지 않는 가지는 걸리지 않는다. 틀린 종은 ! 표시로 보이고 고치면 통과한다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true });
      await enter(page, 'W2', W2, 'chip');
      await pickTarget(page, Q20_C_MINOR, 'mouse');
      let bell = await bellsOf(page, W2);
      expect(bell).toMatchObject({ form: 'tree', trees: 1, bells: [], hatched: [3, 2], labels: { octaves: 4, columns: 4, trees: 0 } });
      await expectBellsFramed(page, W2);

      // C: 음이름을 누르고 첫째 열의 4옥타브 가지(월드의 고리)를 누른다
      await press(page.locator('[data-letter="C"]'), 'mouse');
      await tapCell(page, W2, ringSlot(W2, 0, 4, 0), 'mouse');
      await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4', '첫째 열에 C4가 걸린다');
      // E: 일부러 변화표를 붙이지 않고 걸어 본다
      await press(page.locator('[data-letter="E"]'), 'mouse');
      await tapCell(page, W2, ringSlot(W2, 0, 4, 1), 'mouse');
      await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4,E4', '둘째 열에 E4가 걸린다');
      // G
      await press(page.locator('[data-letter="G"]'), 'mouse');
      await tapCell(page, W2, ringSlot(W2, 0, 4, 2), 'mouse');
      bell = await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4,E4,G4', '셋째 열에 G4가 걸린다');
      expect(bell.bells.map((b) => b.slot)).toEqual([ringSlot(W2, 0, 4, 0), ringSlot(W2, 0, 4, 1), ringSlot(W2, 0, 4, 2)]);

      // 같은 열의 다른 가지를 누르면 그 열의 종이 옮겨 간다(음이름과 변화표는 그대로): 셋째 열의 G4 → G5 → G4
      await tapCell(page, W2, ringSlot(W2, 0, 5, 2), 'mouse');
      bell = await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4,E4,G5', 'G가 5옥타브 가지로 옮겨 간다');
      expect(bell.bells.find((b) => b.column === 2)!.slot).toBe(ringSlot(W2, 0, 5, 2));
      await tapCell(page, W2, ringSlot(W2, 0, 4, 2), 'mouse');
      await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4,E4,G4', 'G가 4옥타브 가지로 돌아온다');

      // 이미 걸린 가지를 누르면 그 종을 고르고 울려 볼 뿐 바꾸지 않는다
      await tapCell(page, W2, ringSlot(W2, 0, 4, 1), 'mouse');
      bell = await waitBells(page, W2, (b) => b.cursor?.column === 1, '둘째 열을 고른다');
      expect(labelsOf(bell)).toEqual(['C4', 'E4', 'G4']);

      // 쓰지 않는 가지(3옥타브, 빗금)를 누르면 걸리지 않고 이유를 알린다(고른 열은 그 열로 옮겨 간다)
      await tapCell(page, W2, ringSlot(W2, 0, 3, 3), 'mouse');
      await waitLive(page, '3옥타브 가지는 이 도전에서 쓰지 않아요');
      await waitBells(page, W2, (b) => b.cursor?.column === 3, '고른 열이 넷째 열로 옮겨 간다');
      expect(labelsOf(await bellsOf(page, W2))).toEqual(['C4', 'E4', 'G4']);

      // 배치 확인: C E G는 단3화음 C E♭ G가 아니다. 틀린 종(E)에 ! 표시가 뜬다
      await act(page, 'check', 'mouse');
      await waitFeedback(page, 'needsRevision');
      bell = await waitBells(page, W2, (b) => b.bells.some((m) => m.flagged), '틀린 종에 ! 표시가 뜬다');
      expect(bell.bells.filter((m) => m.flagged).map((m) => m.label)).toEqual(['E4']);
      expect(await feedbackText(page)).toContain('E');
      await shot(page, 'phase6-bells-w2-q20-flagged-mouse.png');

      // 고친다: 둘째 열의 E4를 눌러 고르고(이미 걸린 가지를 누르는 것은 고르기일 뿐이다), 손에 든 종을 E♭로 바꾼 뒤 '걸기'를 누르면 그 열의 종이 E♭4로 바뀐다
      await tapCell(page, W2, ringSlot(W2, 0, 4, 1), 'mouse');
      await waitBells(page, W2, (b) => b.cursor?.column === 1, '둘째 열을 고른다');
      await press(page.locator('[data-letter="E"]'), 'mouse');
      await press(page.locator('[data-accidental="flat"]'), 'mouse');
      await act(page, 'place', 'mouse');
      bell = await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4,E♭4,G4', '둘째 열이 E♭4로 바뀐다');
      expect(bell.bells.some((m) => m.flagged), '고치면 ! 표시가 사라진다').toBe(false);
      await act(page, 'check', 'mouse');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-bells-w2-q20-mouse.png');

      // 같은 설치물의 다른 도전(Q22 증3화음 C E G♯): 초안은 도전마다 따로이고, 새 도전은 빈 나무로 시작한다
      await pickTarget(page, Q22_C_AUG, 'mouse');
      expect(labelsOf(await bellsOf(page, W2))).toEqual([]);
      await press(page.locator('[data-letter="C"]'), 'mouse');
      await press(page.locator('[data-accidental="none"]'), 'mouse');
      await tapCell(page, W2, ringSlot(W2, 0, 4, 0), 'mouse');
      await press(page.locator('[data-letter="E"]'), 'mouse');
      await tapCell(page, W2, ringSlot(W2, 0, 4, 1), 'mouse');
      await press(page.locator('[data-letter="G"]'), 'mouse');
      await press(page.locator('[data-accidental="sharp"]'), 'mouse');
      await tapCell(page, W2, ringSlot(W2, 0, 4, 2), 'mouse');
      await waitBells(page, W2, (b) => labelsOf(b).join() === 'C4,E4,G♯4', '증3화음 C E G♯가 걸린다');
      await act(page, 'check', 'mouse');
      await waitFeedback(page, 'passed');
      // 표지판을 Q20으로 되돌리면 그 도전의 초안(C E♭ G)이 그대로 있다
      await pickTarget(page, Q20_C_MINOR, 'mouse');
      expect(labelsOf(await bellsOf(page, W2))).toEqual(['C4', 'E♭4', 'G4']);

      // 입력 기록: 눌렀다 뗀 사이 끈 것이 없고(끌기 없음) 마우스만 썼다. 키보드는 쓰지 않았다(W-4)
      const log = await inputLog(page);
      expect(log.types).toEqual(['mouse']);
      expect(log.maxDrag).toBeLessThan(6);
      expect(log.keys).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-7 W4 세 기둥 빈터(Q21): 휴대폰에서 터치만으로', () => {
  it(
    '휴대폰(390×844)에서도 고리 한 칸은 48 px 이상이고 카메라가 고른 나무를 따라간다. 세 나무에 세 화음을 걸어 통과하고, 이어 듣는 동안 나무마다 차례로 금빛이 된다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 390, h: 844, touch: true, log: true });
      const entered = await enter(page, 'W4', W4, 'tap');
      expect(entered.zoom * 72, '고리 한 칸의 높이').toBeGreaterThanOrEqual(48 - 1e-6);
      let bell = await bellsOf(page, W4);
      expect(bell).toMatchObject({ form: 'glade', trees: 3, bells: [], labels: { octaves: 12, columns: 12, trees: 3 } });
      // 처음에는 첫째 나무를 비춘다. 빈터 전체(1204 px)는 좁은 화면에 들어오지 않는다
      const first = await expectBellsFramed(page, W4, 0);
      expect(first.whole).toBe(false);

      await pickTarget(page, Q21, 'touch');
      const chords = [
        ['C', 'E', 'G'],
        ['F', 'A', 'C'],
        ['G', 'B', 'D'],
      ];
      // 같은 열 번호를 지키며 나무를 건너뛴다(»): 첫째 나무는 왼쪽 열부터, 둘째 나무는 오른쪽 열에서 왼쪽으로, 셋째 나무는 다시 왼쪽 열부터 건다
      const centers: number[] = [first.d.center.x];
      for (let tree = 0; tree < 3; tree++) {
        const letters = chords[tree]!;
        const columns = tree === 1 ? [2, 1, 0] : [0, 1, 2];
        for (let i = 0; i < 3; i++) {
          await press(page.locator(`[data-letter="${letters[i]!}"]`), 'touch');
          if (tree === 2 && i === 0) {
            // 셋째 나무의 첫 종은 월드의 가지를 손가락으로 눌러서 건다: 휴대폰에서도 고른 가지(고른 칸의 단)는 막대 위로 보인다
            const octave = (await bellsOf(page, W4)).cursor!.octave!;
            await tapCell(page, W4, ringSlot(W4, 2, octave, columns[0]!), 'touch');
          } else await act(page, 'place', 'touch');
          const hungNow = i + 1;
          await waitBells(page, W4, (b) => b.bells.filter((m) => m.tree === tree).length === hungNow, `${tree + 1}번째 나무에 종 ${hungNow}개`);
          if (i < 2) await act(page, columns[i + 1]! > columns[i]! ? 'cursor-right' : 'cursor-left', 'touch');
        }
        if (tree < 2) {
          await act(page, 'tree-next', 'touch');
          await waitBells(page, W4, (b) => b.cursor?.tree === tree + 1, `${tree + 2}번째 나무를 고른다`);
          // 카메라가 고른 나무를 따라가서, 그 나무가 화면 좌우 안에 온전히 들어온다
          const { d } = await expectBellsFramed(page, W4, tree + 1);
          centers.push(d.center.x);
        }
      }
      // 나무를 건너뛸 때마다 카메라가 오른쪽으로 옮겨 갔다(배율은 그대로)
      expect(centers[1]!).toBeGreaterThan(centers[0]!);
      expect(centers[2]!).toBeGreaterThan(centers[1]!);
      bell = await bellsOf(page, W4);
      expect(labelsOf(bell)).toEqual(['C4', 'E4', 'G4', 'C4', 'A4', 'F4', 'G4', 'B4', 'D4']);

      await act(page, 'check', 'touch');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase6-bells-w4-q21-phone.png');

      // 이어 듣기: 나무를 차례로 지나며 화음이 이어진다. 울리는 종이 첫째, 둘째, 셋째 나무의 차례로 금빛이 된다(소리를 켜지 않아도 보인다)
      await startBellSampler(page, W4);
      await act(page, 'hear-mine', 'touch');
      const heard = await waitHeard(page);
      const trees: number[] = [];
      for (const s of heard.filter((x) => x.length > 0)) {
        const ts = [...new Set(s.map((x) => Number(x.split(':')[0])))];
        expect(ts.length, '한 번에 한 나무의 종만 울린다').toBe(1);
        if (trees[trees.length - 1] !== ts[0]) trees.push(ts[0]!);
      }
      expect(trees).toEqual([0, 1, 2]);

      // 입력 기록: 터치만 썼고 끌지 않았다. 키보드는 쓰지 않았다(W-4)
      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(log.maxDrag).toBeLessThan(12);
      expect(log.keys).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-7 W3 종탑(Q06): 가로 순서만 바꾸면 전위가 그대로다(12.9 완료 기준)', () => {
  it(
    '키보드만으로: 종 세 개(C3 E3 G3)가 걸린 채 시작한다. Shift+← →로 가로 자리를 바꿔도 가장 낮은 종은 C3이고 판정도 같다. C3을 한 옥타브 올려야 제1전위가 되고, 그때는 가로 순서가 아무래도 통과한다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      await enter(page, 'W3', W3, 'key');
      await pickTargetByKeys(page, Q06_C_FIRST);

      // 처음 모습: 가로로 C3 E3 G3. 가장 낮은 종은 C3이다(금빛 밑줄과 '낮음'). 종탑은 종을 새로 걸지 않는다: 이름표가 열 번호 3, 옥타브 4다
      const columnsOf = (b: DrawnBells): string[] => [...b.bells].sort((x, y) => x.column - y.column).map((m) => m.label);
      const lowestOf = (b: DrawnBells): string[] => b.bells.filter((m) => m.lowest).map((m) => m.label);
      let bell = await bellsOf(page, W3);
      expect(bell).toMatchObject({ form: 'tower', trees: 1, labels: { octaves: 4, columns: 3, trees: 0 }, hatched: [] });
      expect(columnsOf(bell)).toEqual(['C3', 'E3', 'G3']);
      expect(lowestOf(bell)).toEqual(['C3']);
      expect(bell.bells.every((b) => b.octave === 3 && b.slot === ringSlot(W3, 0, 3, b.column))).toBe(true);
      await expectBellsFramed(page, W3);
      await shot(page, 'phase6-bells-w3-tower-start.png');

      // 판정이 같다는 것을 글로 확인한다: 가장 낮은 음은 C3이라 기본 위치다(목표는 제1전위)
      const rootPosition = '현재 가장 낮은 음은 C3이에요. 그래서 기본 위치예요. 목표는 제1전위예요.';
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'needsRevision');
      expect(await feedbackText(page)).toContain(rootPosition);

      // ←·→로 종을 고른다: 아직 고른 종이 없으면 첫 종(C3)부터다. 방향키가 단추의 초점을 놓아 준다
      await page.keyboard.press('ArrowRight');
      bell = await waitBells(page, W3, (b) => b.cursor?.column === 0, '첫 종을 고른다');
      expect(bell.cursor).toMatchObject({ column: 0, octave: 3, slot: ringSlot(W3, 0, 3, 0) });

      // Shift+→: 고른 종(C3)이 옆 자리의 E3과 맞바뀐다. 고른 자리는 종을 따라간다
      const orders: string[][] = [];
      const swap = async (key: 'Shift+ArrowRight' | 'Shift+ArrowLeft', want: string[], cursorColumn: number): Promise<DrawnBells> => {
        await page.keyboard.press(key);
        const b = await waitBells(page, W3, (x) => columnsOf(x).join() === want.join() && x.cursor?.column === cursorColumn, `가로 순서가 ${want.join(' ')}이(가) 된다`);
        orders.push(columnsOf(b));
        return b;
      };
      bell = await swap('Shift+ArrowRight', ['E3', 'C3', 'G3'], 1);
      // 가장 낮은 종은 가로 자리가 바뀌어도 같은 종(C3)이다. 걸린 높이(옥타브)도 그대로다
      expect(lowestOf(bell)).toEqual(['C3']);
      expect(bell.bells.find((b) => b.label === 'C3')).toMatchObject({ column: 1, octave: 3, lowest: true });
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'needsRevision');
      expect(await feedbackText(page), '순서만 바꾸면 판정 글이 그대로다').toContain(rootPosition);
      await shot(page, 'phase6-bells-w3-tower-swapped.png');

      bell = await swap('Shift+ArrowRight', ['E3', 'G3', 'C3'], 2);
      expect(lowestOf(bell)).toEqual(['C3']);
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'needsRevision');
      expect(await feedbackText(page)).toContain(rootPosition);
      // 끝 자리에서 더 오른쪽으로 바꿀 수는 없다: 종은 그대로다
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(300);
      expect(columnsOf(await bellsOf(page, W3))).toEqual(['E3', 'G3', 'C3']);

      // 가로 순서가 세 가지로 달랐는데 걸린 음과 높이의 모임은 같았다
      const sets = orders.map((o) => [...o].sort().join());
      expect(new Set(sets).size, '순서만 바뀌고 걸린 음은 같다').toBe(1);
      expect(new Set(orders.map((o) => o.join())).size, '가로 순서는 서로 다르다').toBe(2);

      // 가로 순서가 E3 G3 C3인 채로 C3을 한 옥타브 올린다(↑): 가장 낮은 음이 E3이 되어 제1전위, 통과한다. 가로 순서는 판정에 쓰이지 않는다
      await page.keyboard.press('ArrowUp');
      bell = await waitBells(page, W3, (x) => columnsOf(x).join() === 'E3,G3,C4', 'C3이 C4로 올라간다');
      expect(lowestOf(bell)).toEqual(['E3']);
      expect(bell.bells.find((b) => b.label === 'C4')).toMatchObject({ column: 2, octave: 4, slot: ringSlot(W3, 0, 4, 2) });
      // 고른 칸은 위로 옮겨 간 종을 따라가고, 카메라는 그 칸을 막대 위에 보인다
      expect(bell.cursor).toMatchObject({ column: 2, octave: 4 });
      await expectBellsFramed(page, W3);
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      expect(await feedbackText(page)).toContain('통과했어요');
      await shot(page, 'phase6-bells-w3-tower-first-inversion.png');

      // 소리 끄기(X): 고른 종(C4)이 꺼진 모양(점선·✕)이 되고, 소리 나는 종 가운데 가장 낮은 종은 그대로 E3이다
      await page.keyboard.press('KeyX');
      bell = await waitBells(page, W3, (x) => x.bells.some((m) => m.muted), '고른 종의 소리가 꺼진다');
      expect(bell.bells.filter((m) => m.muted).map((m) => m.label)).toEqual(['C4']);
      expect(lowestOf(bell)).toEqual(['E3']);
      // 한 번 더: 소리가 켜진다
      await page.keyboard.press('KeyX');
      await waitBells(page, W3, (x) => x.bells.every((m) => !m.muted), '소리가 다시 켜진다');

      // 듣는 방식 '가장 낮은 종만'(R을 두 번): 울리는 동안 가장 낮은 종 하나만 금빛이다
      await startBellSampler(page, W3);
      await page.keyboard.press('KeyR');
      await page.keyboard.press('KeyR');
      const heard = await waitHeard(page);
      const lit = heard.filter((s) => s.length > 0);
      expect(lit.length).toBeGreaterThan(0);
      for (const s of lit) expect(s, '가장 낮은 종 하나만 울린다').toEqual(['0:E3']);

      // 입력 기록: 키보드만 썼다(W-4)
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '터치만으로(태블릿 세로 768×1024): 종을 눌러 고르고 [오른쪽과 바꾸기]·[옥타브 올리기] 단추로 같은 일을 한다. 월드의 가지를 눌러도 그 종이 그 높이로 옮겨 간다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 768, h: 1024, touch: true, log: true });
      await enter(page, 'W3', W3, 'tap');
      await pickTarget(page, Q06_C_FIRST, 'touch');
      const columnsOf = (b: DrawnBells): string[] => [...b.bells].sort((x, y) => x.column - y.column).map((m) => m.label);
      await expectBellsFramed(page, W3);

      // 종탑 선반의 첫 종(C3)을 누르고 [오른쪽과 바꾸기]를 두 번 누른다 → E3 G3 C3
      await press(page.locator('[data-bell="0"]'), 'touch');
      await waitBells(page, W3, (b) => b.cursor?.column === 0, '첫 종을 고른다');
      await act(page, 'swap-right', 'touch');
      await waitBells(page, W3, (b) => columnsOf(b).join() === 'E3,C3,G3', '한 칸 오른쪽으로 바뀐다');
      await act(page, 'swap-right', 'touch');
      let bell = await waitBells(page, W3, (b) => columnsOf(b).join() === 'E3,G3,C3', '맨 오른쪽으로 바뀐다');
      expect(bell.bells.filter((m) => m.lowest).map((m) => m.label)).toEqual(['C3']);
      await act(page, 'check', 'touch');
      await waitFeedback(page, 'needsRevision');
      expect(await feedbackText(page)).toContain('현재 가장 낮은 음은 C3이에요');

      // 월드의 가지를 눌러서도 된다: 고른 종(맨 오른쪽 C3)의 4옥타브 가지를 누르면 그 종이 C4로 옮겨 간다
      await tapCell(page, W3, ringSlot(W3, 0, 4, 2), 'touch');
      bell = await waitBells(page, W3, (b) => columnsOf(b).join() === 'E3,G3,C4', '월드의 가지를 눌러 C3이 C4로 옮겨 간다');
      expect(bell.bells.filter((m) => m.lowest).map((m) => m.label)).toEqual(['E3']);
      await act(page, 'check', 'touch');
      await waitFeedback(page, 'passed');

      // [옥타브 내리기] 단추: C4가 C3으로 돌아와 다시 기본 위치가 된다
      await act(page, 'ring-down', 'touch');
      bell = await waitBells(page, W3, (b) => columnsOf(b).join() === 'E3,G3,C3', 'C4가 C3으로 내려온다');
      expect(bell.bells.filter((m) => m.lowest).map((m) => m.label)).toEqual(['C3']);
      await shot(page, 'phase6-bells-w3-tablet-touch.png');

      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(log.maxDrag).toBeLessThan(12);
      expect(log.keys).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-7 W4 빈터는 걸어서 지나갈 수 있다(W-3)', () => {
  it(
    '나무에 걸어 올라서면 그 나무의 화음이 울릴 뿐이다: stepped 사건(entered)이 한 번 나가고, 모드에도 판정에도 들어가지 않는다. 걸린 종이 없는 나무는 조용하다',
    async () => {
      const { ctx, page, errors } = await boot();
      await enter(page, 'W4', W4, 'key');
      await pickTargetByKeys(page, Q21);
      // 둘째 나무(F A C)만 건다: 둘째 나무로 가서(Shift+→) 오른쪽 열부터 왼쪽으로
      await page.keyboard.press('Shift+ArrowRight');
      await waitBells(page, W4, (b) => b.cursor?.tree === 0, '첫째 나무가 고른 자리다');
      await page.keyboard.press('Shift+ArrowRight');
      await waitBells(page, W4, (b) => b.cursor?.tree === 1, '둘째 나무를 고른다');
      const columns = [0, 1, 2];
      const letters = ['F', 'A', 'C'];
      for (let i = 0; i < 3; i++) {
        await handTo(page, letters[i]!);
        await page.keyboard.press('Enter');
        const n = i + 1;
        await waitBells(page, W4, (b) => b.bells.length === n, `둘째 나무에 종 ${n}개`);
        if (i < 2) await page.keyboard.press('ArrowRight');
      }
      const hung = await bellsOf(page, W4);
      expect(hung.bells.map((b) => b.tree)).toEqual([1, 1, 1]);
      expect(hung.bells.map((b) => b.column).sort()).toEqual(columns);
      const midis = (b: DrawnBells): string[] => b.bells.map((m) => m.label).sort();
      expect(midis(hung)).toEqual(['A4', 'C4', 'F4']);

      // 나간다. 이제 걷는 중이다
      await page.keyboard.press('Escape');
      await waitUnframed(page);
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      expect(await modeOf(page)).toBeNull();

      // 월드의 소리 내기를 가로채서 기록한다(헤드리스는 소리 장치를 켜지 않지만 부름은 그대로 지나간다)
      await page.evaluate(() => {
        const w = window as unknown as { __game: { mixer: { playWorldNote: (midi: number, sec?: number, velocity?: number) => void } }; __worldNotes?: Array<{ midi: number; sec: number | undefined; velocity: number | undefined }> };
        const mixer = w.__game.mixer;
        const original = mixer.playWorldNote.bind(mixer);
        const out: Array<{ midi: number; sec: number | undefined; velocity: number | undefined }> = [];
        w.__worldNotes = out;
        mixer.playWorldNote = (midi, sec, velocity) => {
          out.push({ midi, sec, velocity });
          original(midi, sec, velocity);
        };
      });
      const notes = (): Promise<Array<{ midi: number; sec: number | undefined; velocity: number | undefined }>> => page.evaluate(() => (window as unknown as { __worldNotes?: Array<{ midi: number; sec: number | undefined; velocity: number | undefined }> }).__worldNotes ?? []);

      // 둘째 나무의 아래쪽(고리 격자 바로 밑)에 서서 위로 걷는다. 가장 아래 단(2옥타브 가지)에 올라서는 순간 stepped(entered)가 나간다
      const tree2 = treeFrame(W4, 1);
      const bottom = tree2.y + tree2.h;
      await command(page, { type: 'teleport', x: tree2.x + LABEL_LEFT + 2.5 * 80, y: bottom + 40 });
      await until(() => pos(page), (p) => Math.abs(p.y - (bottom + 40)) < 2, '캐릭터가 둘째 나무 아래에 선다');
      await recordEvents(page);
      expect(await notes()).toEqual([]);
      await page.keyboard.down('ArrowUp');
      await until(() => eventsOf(page, 'stepped'), (e) => e.length > 0, '나무에 올라선 사건이 나간다');
      await page.keyboard.up('ArrowUp');
      const stepped = await eventsOf(page, 'stepped');
      expect(stepped[0]).toMatchObject({ type: 'stepped', installationId: W4, entered: true });
      const cellOfFirst = CELLS[W4]!.find((c) => c.slot === stepped[0]!.slot)!;
      // 올라선 칸은 둘째 나무의 고리 격자 안이다
      expect(cellOfFirst.x).toBeGreaterThanOrEqual(tree2.x + LABEL_LEFT);
      expect(cellOfFirst.x + cellOfFirst.w).toBeLessThanOrEqual(tree2.x + tree2.w);

      // 둘째 나무에 걸린 세 종의 음 높이(F4 A4 C4)가 한 번씩 울렸다: 짧은 소리가 아니라 1초, 세기 0.5의 화음이다
      const played = await until(notes, (n) => n.length >= 3, '나무의 화음이 울린다');
      expect(played.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 65, 69]);
      for (const n of played) expect(n).toMatchObject({ sec: 1, velocity: 0.5 });
      expect(played.length, '같은 나무 안에서 옮겨 밟아도 다시 울리지 않는다').toBe(3);

      // 걷기는 판정이 아니다: 모드에 들어가지 않았고, 작업대도 열리지 않았고, 누르기 사건도 없다
      expect(await modeOf(page)).toBeNull();
      expect(await page.locator('[data-installation-hud]').count()).toBe(0);
      expect(await eventsOf(page, 'slot-pressed')).toEqual([]);
      await shot(page, 'phase6-bells-w4-walk-through.png');
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-7 W4 화음 이어 걷기(Q23): 키보드만으로', () => {
  it(
    '세 나무에 으뜸·버금딸림·딸림화음을 걸어 통과하고, 전위는 알려 주기만 한다: 첫째 나무를 제1전위로 바꿔도 통과하고 안내만 달라진다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      await enter(page, 'W4', W4, 'key');
      await pickTargetByKeys(page, Q23);
      const noteText = (): Promise<string> => page.locator('[data-shape-note]').innerText();

      /** 지금 고른 열에서 시작해 세 음을 건다(Enter). 다음 열은 방향키로 옮긴다 */
      const hangThree = async (letters: string[], step: 'ArrowRight' | 'ArrowLeft'): Promise<void> => {
        for (let i = 0; i < 3; i++) {
          await handTo(page, letters[i]!);
          await page.keyboard.press('Enter');
          if (i < 2) await page.keyboard.press(step);
        }
      };
      // 첫째 나무: C E G (왼쪽 열부터)
      await page.keyboard.press('ArrowRight');
      await waitBells(page, W4, (b) => b.cursor?.tree === 0 && b.cursor.column === 0, '첫째 나무 첫 열을 고른다');
      await hangThree(['C', 'E', 'G'], 'ArrowRight');
      await waitBells(page, W4, (b) => b.bells.filter((m) => m.tree === 0).length === 3, '첫째 나무에 종 3개');
      // 둘째 나무: 나무를 건너뛰면 같은 열 번호(셋째 열)에 서므로 오른쪽 열부터 왼쪽으로 F A C
      await page.keyboard.press('Shift+ArrowRight');
      await waitBells(page, W4, (b) => b.cursor?.tree === 1, '둘째 나무를 고른다');
      await hangThree(['F', 'A', 'C'], 'ArrowLeft');
      await waitBells(page, W4, (b) => b.bells.filter((m) => m.tree === 1).length === 3, '둘째 나무에 종 3개');
      // 셋째 나무: 둘째 나무를 왼쪽 끝 열에서 마쳤으므로 건너뛰면 셋째 나무의 첫 열이다. G B D (왼쪽 열부터)
      await page.keyboard.press('Shift+ArrowRight');
      await waitBells(page, W4, (b) => b.cursor?.tree === 2 && b.cursor.column === 0, '셋째 나무 첫 열을 고른다');
      await hangThree(['G', 'B', 'D'], 'ArrowRight');
      let bell = await waitBells(page, W4, (b) => b.bells.length === 9, '세 나무에 종 9개');
      // 같은 4옥타브 가지에 걸었다: 첫째 나무 C4 E4 G4, 둘째 나무는 왼쪽 열부터 C4 A4 F4, 셋째 나무 G4 B4 D4
      expect(labelsOf(bell)).toEqual(['C4', 'E4', 'G4', 'C4', 'A4', 'F4', 'G4', 'B4', 'D4']);
      expect(await page.locator('[data-shape-note]').count(), '확인하기 전에는 전위를 말하지 않는다').toBe(0);

      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      // 가장 낮은 종으로 읽은 전위: 첫째 나무 C4(기본 위치), 둘째 나무 C4가 가장 낮아 F 화음의 제2전위, 셋째 나무 D4가 가장 낮아 G 화음의 제2전위
      const root = '전위는 판정하지 않고 알려만 줘요. 처음 으뜸화음은 기본 위치, 버금딸림화음은 제2전위, 딸림화음은 제2전위, 마지막 으뜸화음은 기본 위치예요.';
      expect(await noteText()).toBe(root);
      await waitLive(page, `통과했어요. ${root}`);
      await shot(page, 'phase6-bells-w4-q23-keyboard.png');

      // 첫째 나무의 C4를 한 옥타브 올린다(제1전위 E4 G4 C5): 고치면 지난 결과는 사라지고, 다시 확인하면 통과한 채 안내만 달라진다
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Shift+ArrowLeft');
      await waitBells(page, W4, (b) => b.cursor?.tree === 0, '첫째 나무로 돌아온다');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await waitBells(page, W4, (b) => b.cursor?.tree === 0 && b.cursor.column === 0, '첫째 나무의 첫 종');
      await page.keyboard.press('ArrowUp');
      bell = await waitBells(page, W4, (b) => labelsOf(b).join() === 'C5,E4,G4,C4,A4,F4,G4,B4,D4', '첫 종이 C5가 된다');
      await page.waitForSelector('[data-shape-note]', { state: 'detached' });
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      expect(await noteText()).toBe('전위는 판정하지 않고 알려만 줘요. 처음 으뜸화음은 제1전위, 버금딸림화음은 제2전위, 딸림화음은 제2전위, 마지막 으뜸화음은 제1전위예요.');
      expect(bell.bells.every((b) => !b.flagged)).toBe(true);

      // 입력 기록: 눌러서 한 것이 하나도 없다(키보드만, W-4)
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
