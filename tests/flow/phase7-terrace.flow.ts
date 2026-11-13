// 7-1 오선 언덕의 계단밭(T5): N1 높은음 계단밭(Q09, Q10), N2 낮은음 계단밭(Q09, Q10), N3 가운데 턱(Q01, Q11, Q12) 흐름 시험(실제 Chrome).
// 도메인(7-1a), 작업대(7-1b), 화면(7-1c), 월드의 그림과 카메라(7-1d)를 한꺼번에 이어서 본다.
// 완료 기준(설계서 12.10): 가운데 턱의 C4가 두 음자리표에서 같은 자리다. 그 밖에 이 파일이 보는 것:
//  - 키보드만으로·마우스 클릭만으로·터치만으로 끌지 않고 푼다(W-4): 밭의 높이를 눌러 등을 놓고, 다른 높이를 누르면 등이 옮겨 간다
//  - 소리를 꺼도(헤드리스는 소리를 켜지 않는다) 듣는 등이 보이고(W-8) 틀린 등은 ! 표시로 보인다
//  - 걸어서 밭을 지나가면 세 설치물이 겹친 자리에서도 서 있는 자리에서 가장 가까운 설치물만 밟았다고 알리고, 놓은 등의 소리가 난다. 모드에도 판정에도 들어가지 않는다(W-3)
//  - 카메라는 한 칸(온음계 한 계단)을 화면에서 48 px 아래로 줄이지 않고, 고른 높이를 메뉴 띠 아래 조작 막대 위에 담는다(7.6)
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import n1 from '../../content/installations/inst.staff-hill.treble-terrace.json';
import n2 from '../../content/installations/inst.staff-hill.bass-terrace.json';
import n3 from '../../content/installations/inst.staff-hill.middle-ledge.json';
import { command, dbg, drawnOf, eventsOf, insetOf, modeOf, pos, recordEvents, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady, waitUnframed, type Dbg, type DrawnTerraceField, type Game } from './game';
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

const N1 = n1.installationId;
const N2 = n2.installationId;
const N3 = n3.installationId;
type Station = 'N1' | 'N2' | 'N3';
interface Cell {
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
const CELLS = { [N1]: n1.slots, [N2]: n2.slots, [N3]: n3.slots } as Record<string, ReadonlyArray<Cell>>;
/** 가온 도(C4)가 1000이고 온음계 한 칸이 48 px이다(4.7) */
const yOf = (step: number): number => 1000 - 48 * step;
const MENU_BAND = 64;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const LONG = 300_000;

const Q01_MIDDLE_C = 'pitch.same-note-two-clefs/middle-c';
const Q09_TREBLE_LINES = 'staff.lines-and-spaces/treble-lines';
const Q09_BASS_LINES = 'staff.lines-and-spaces/bass-lines';

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

// ───── 그려진 밭 읽기 ─────

const terraceOf = async (page: Page, id: string): Promise<DrawnTerraceField> => {
  const t = (await drawnOf(page, id)).terrace;
  if (!t) throw new Error(`계단밭이 아니거나 아직 그리지 않았어요: ${id}`);
  return t;
};
/** 그려진 밭이 조건을 채울 때까지 */
const waitTerrace = (page: Page, id: string, ok: (t: DrawnTerraceField) => boolean, what: string): Promise<DrawnTerraceField> => until(() => terraceOf(page, id), ok, what);
/** 놓인 등을 열 번호 순서의 '열:칸' 글자로 */
const lampsText = (t: DrawnTerraceField): string[] => [...t.lamps].sort((a, b) => a.column - b.column).map((l) => `${l.column}:${l.step}`);

/** 열의 높이에 해당하는 화면 자리. 카메라가 가만히 있을 때 읽고, 그 자리를 캔버스가 직접 받는지(HUD가 덮지 않았는지)도 본다 */
async function pointAt(page: Page, id: string, column: number, step: number): Promise<{ x: number; y: number }> {
  const d = await settled(page);
  const r = CELLS[id]!.find((c) => c.slot === column)!;
  const at = toScreen(d, r.x + r.w / 2, yOf(step));
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName ?? 'none', at);
  if (tag !== 'CANVAS') throw new Error(`${column}열 ${step}칸 자리(${Math.round(at.x)}, ${Math.round(at.y)})를 캔버스가 받지 않아요: ${tag}`);
  return at;
}
/** 밭의 높이를 눌러 등을 놓거나 옮긴다(끌지 않는다). 놓인 것이 월드의 그림에 나타날 때까지 기다린다 */
async function putLamp(page: Page, id: string, column: number, step: number, how: Pointer): Promise<DrawnTerraceField> {
  const at = await pointAt(page, id, column, step);
  await (how === 'touch' ? page.touchscreen.tap(at.x, at.y) : page.mouse.click(at.x, at.y));
  return waitTerrace(page, id, (t) => t.lamps.some((l) => l.column === column && l.step === step), `${column}열의 등이 ${step}칸에 놓인다`);
}

/** 페이지 안에서 프레임마다 울리는 등을 모은다(바뀔 때만 담는다): 느린 Chrome에서도 듣는 동안의 값이 빠짐없이 남는다 */
const startLampSampler = (page: Page, id: string): Promise<void> =>
  page.evaluate((iid) => {
    const w = window as unknown as { __game: Game; __lampSamples?: number[][] };
    const out: number[][] = [];
    w.__lampSamples = out;
    const frame = (): void => {
      const terrace = w.__game.world.debugState()?.installations.find((i) => i.installationId === iid)?.terrace;
      if (terrace) {
        const now = terrace.lamps.filter((l) => l.playing).map((l) => l.column);
        const last = out[out.length - 1];
        if (!last || last.join() !== now.join()) out.push(now);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, id);
/** 듣기가 시작되어 끝날 때까지 기다린다(울리는 등이 나타났다가 다시 모두 사라진다). 모은 값을 돌려준다 */
async function waitHeard(page: Page): Promise<number[][]> {
  await page.waitForFunction(() => ((window as unknown as { __lampSamples?: number[][] }).__lampSamples ?? []).some((s) => s.length > 0), undefined, { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const list = (window as unknown as { __lampSamples?: number[][] }).__lampSamples ?? [];
      return list.length > 0 && list[list.length - 1]!.length === 0 && list.some((s) => s.length > 0);
    },
    undefined,
    { timeout: 30000 },
  );
  return page.evaluate(() => (window as unknown as { __lampSamples?: number[][] }).__lampSamples ?? []);
}

/** 월드의 소리 내기를 가로채서 기록한다(헤드리스는 소리 장치를 켜지 않지만 부름은 그대로 지나간다) */
async function recordWorldNotes(page: Page): Promise<() => Promise<Array<{ midi: number; sec: number | undefined; velocity: number | undefined }>>> {
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
  return () => page.evaluate(() => (window as unknown as { __worldNotes?: Array<{ midi: number; sec: number | undefined; velocity: number | undefined }> }).__worldNotes ?? []);
}

describe('7-1 N3 가운데 턱(Q01): 키보드만으로', () => {
  it(
    '두 음자리표의 열에 가온 도(C4)를 놓으면 두 등이 같은 세로 자리(가운데 턱)에 선다. 통과하고, 듣는 등이 보이고, 나가도 등은 풍경으로 남는다',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
      const d0 = await enter(page, 'N3', N3, 'key');
      expect(await modeOf(page)).toMatchObject({ installationId: N3 });
      // 한 칸(온음계 한 계단 48 px)은 화면에서 48 px 아래로 줄지 않는다
      expect(48 * d0.zoom).toBeGreaterThanOrEqual(48 - 1e-6);

      // 자유로 놀기: 열 여덟 개(높은음자리표와 낮은음자리표가 번갈아)의 이름표가 달리고, 풍경인 돌담 열한 줄과 조각상 셋이 있다
      let t = await terraceOf(page, N3);
      expect(t.headers).toBe(8);
      expect(t.lamps).toEqual([]);
      expect(t.walls.map((w) => w.y)).toEqual([1480, 1384, 1288, 1192, 1096, 1000, 904, 808, 712, 616, 520]);
      expect(t.walls.filter((w) => w.kind === 'middle')).toEqual([{ step: 0, y: 1000, kind: 'middle' }]);
      // 조각상은 음자리표마다 하나와 가운데 도 하나(그리는 순서는 설치물이 등록된 순서라 정하지 않는다)
      expect([...t.plaques].sort()).toEqual(['가운데 도', '낮은음자리표', '높은음자리표']);

      await pickTargetByKeys(page, Q01_MIDDLE_C);
      t = await terraceOf(page, N3);
      expect(t.headers).toBe(2);
      // 쓰는 열은 둘이고, 나머지 여섯 열은 열 전체가 빗금이다. 쓰는 열도 그 음자리표가 쓰지 않는 높이는 빗금이다
      expect(t.hatched).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      // 첫 열(높은음자리표)을 고르고 ↑로 놓으면 가운데 줄(B4, 712)에 선다. ↓ 여섯 번으로 가온 도(C4, 1000)까지 내린다
      await page.keyboard.press('ArrowRight');
      await waitTerrace(page, N3, (x) => x.cursor?.column === 1, '첫 열을 고른다');
      await page.keyboard.press('ArrowUp');
      t = await waitTerrace(page, N3, (x) => lampsText(x).join() === '1:6', '높은음자리표 열에 등이 가운데 줄(B4)에 놓인다');
      expect(t.lamps[0]).toMatchObject({ y: 712, label: null, selected: true });
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
      t = await waitTerrace(page, N3, (x) => lampsText(x).join() === '1:0', '등이 가온 도까지 내려온다');
      // 보표 밖(아래 첫 덧줄)이라 짧은 덧줄 돌담이 선다
      expect(t.ledgers).toEqual([{ column: 1, step: 0, y: 1000 }]);

      // 둘째 열(낮은음자리표)도 같다: 가운데 줄(D3, 1288)에 놓고 ↑ 여섯 번으로 가온 도까지 올린다
      await page.keyboard.press('ArrowRight');
      await waitTerrace(page, N3, (x) => x.cursor?.column === 2, '둘째 열을 고른다');
      await page.keyboard.press('ArrowUp');
      t = await waitTerrace(page, N3, (x) => lampsText(x).join() === '1:0,2:-6', '낮은음자리표 열에 등이 가운데 줄(D3)에 놓인다');
      expect(t.lamps.find((l) => l.column === 2)).toMatchObject({ y: 1288 });
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
      t = await waitTerrace(page, N3, (x) => lampsText(x).join() === '1:0,2:0', '둘째 등도 가온 도까지 올라온다');
      expect(t.ledgers).toEqual([
        { column: 1, step: 0, y: 1000 },
        { column: 2, step: 0, y: 1000 },
      ]);

      // 완료 기준: 두 등이 같은 자리다. 월드 좌표만이 아니라 화면에서도 두 등과 가운데 턱 돌담이 같은 세로 자리(같은 y)에 서 있다
      const d = await settled(page);
      const lampY = t.lamps.map((l) => toScreen(d, l.x, l.y).y);
      const wallY = toScreen(d, 0, t.walls.find((w) => w.kind === 'middle')!.y).y;
      expect(t.lamps.map((l) => l.y)).toEqual([1000, 1000]);
      expect(Math.abs(lampY[0]! - lampY[1]!)).toBeLessThan(0.01);
      expect(Math.abs(lampY[0]! - wallY)).toBeLessThan(0.01);
      // 두 등은 서로 다른 열(가로 자리가 다르다)이고 둘 다 화면 안, 조작 막대 위에 보인다
      expect(t.lamps[0]!.x).not.toBe(t.lamps[1]!.x);
      const inset = await insetOf(page);
      expect(lampY[0]! - 40).toBeGreaterThanOrEqual(MENU_BAND - 0.5);
      expect(lampY[0]! + 40).toBeLessThanOrEqual(720 - inset + 0.5);
      await shot(page, 'phase7-terrace-n3-c4-keyboard.png');

      // 확인(C): 같은 높이를 두 보표에 놓았으므로 통과한다
      await page.keyboard.press('KeyC');
      await waitFeedback(page, 'passed');
      expect(await feedbackText(page)).toContain('통과했어요.');
      expect((await terraceOf(page, N3)).lamps.every((l) => !l.flagged)).toBe(true);

      // 내 등 듣기(P): 소리를 켜지 않아도 열 차례(왼쪽부터)대로 등이 금빛으로 울린다(W-8)
      await startLampSampler(page, N3);
      await page.keyboard.press('KeyP');
      const heard = await waitHeard(page);
      const order: number[] = [];
      for (const s of heard) for (const c of s) if (order[order.length - 1] !== c) order.push(c);
      expect(order).toEqual([1, 2]);
      expect(heard.every((s) => s.length <= 1), '한 번에 한 등만 울린다').toBe(true);

      // 나간다: 이름표와 빗금과 고른 자리는 사라지고 놓은 등은 밭의 풍경으로 남는다
      await page.keyboard.press('Escape');
      await waitUnframed(page);
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      expect(await modeOf(page)).toBeNull();
      t = await waitTerrace(page, N3, (x) => x.headers === 0, '이름표가 사라진다');
      expect(t).toMatchObject({ hatched: [], cursor: null });
      expect(lampsText(t)).toEqual(['1:0', '2:0']);

      // 입력 기록: 눌러서 한 것이 하나도 없다(키보드만, W-4)
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(log.keys).toBeGreaterThan(20);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-1 N1 높은음 계단밭(Q09): 마우스 클릭만으로', () => {
  it(
    '밭의 높이를 눌러 등을 놓는다(E4 G4 B4 D5 F5). 틀린 등은 ! 표시가 서고, 다른 높이를 눌러 옮기면 통과한다. 끌지 않는다',
    async () => {
      const { ctx, page, errors } = await boot({ h: 800, log: true });
      await enter(page, 'N1', N1, 'chip');
      await pickTarget(page, Q09_TREBLE_LINES, 'mouse');
      let t = await terraceOf(page, N1);
      expect(t.headers).toBe(5);
      expect(t.hatched).toEqual([6, 7, 8]);
      await recordEvents(page);

      // 첫 열을 고르면 카메라가 그 높이를 따라가 다섯 줄 높이가 모두 화면 안에 들어온다(1280×800)
      await act(page, 'cursor-right', 'mouse');
      await waitTerrace(page, N1, (x) => x.cursor?.column === 1, '첫 열을 고른다');
      // E4 G4 B4 D5 F5를 높이를 눌러 놓는다. 둘째 열은 일부러 한 칸 틀리게(A4) 놓는다
      for (const [column, step] of [[1, 2], [2, 5], [3, 6], [4, 8], [5, 10]] as const) t = await putLamp(page, N1, column, step, 'mouse');
      expect(lampsText(t)).toEqual(['1:2', '2:5', '3:6', '4:8', '5:10']);
      expect(t.lamps.every((l) => l.label === null), '문제를 푸는 중에는 등 안에 이름이 없다').toBe(true);
      // 누른 높이가 월드의 사건에 정수 칸 수로 실려 갔다(열과 높이만, 시간이 아니라)
      const pressed = await eventsOf(page, 'slot-pressed');
      expect(pressed.map((e) => [e.slot, e.step])).toEqual([[1, 2], [2, 5], [3, 6], [4, 8], [5, 10]]);
      expect(pressed.every((e) => Number.isInteger(e.step) && !('tick' in e))).toBe(true);

      await act(page, 'check', 'mouse');
      await waitFeedback(page, 'needsRevision');
      t = await terraceOf(page, N1);
      expect(t.lamps.filter((l) => l.flagged).map((l) => l.column), '틀린 둘째 열의 등에 ! 표시가 선다').toEqual([2]);
      await shot(page, 'phase7-terrace-n1-mouse-flagged.png');

      // 고친다: 둘째 열로 돌아가(← 단추) G4 높이를 누르면 등이 옮겨 가고 표식이 사라진다
      for (let i = 0; i < 3; i++) await act(page, 'cursor-left', 'mouse');
      await waitTerrace(page, N1, (x) => x.cursor?.column === 2, '둘째 열을 고른다');
      t = await putLamp(page, N1, 2, 4, 'mouse');
      expect(lampsText(t)).toEqual(['1:2', '2:4', '3:6', '4:8', '5:10']);
      expect(t.lamps.every((l) => !l.flagged)).toBe(true);
      await act(page, 'check', 'mouse');
      await waitFeedback(page, 'passed');
      expect(await feedbackText(page)).toContain('통과했어요.');
      await shot(page, 'phase7-terrace-n1-mouse-passed.png');

      // 입력 기록: 눌러서만 했다. 끌지 않았다(W-4)
      const log = await inputLog(page);
      expect(log.types).toEqual(['mouse']);
      expect(log.maxDrag).toBeLessThan(12);
      expect(log.keys).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-1 N2 낮은음 계단밭(Q09): 터치만으로(태블릿)', () => {
  it(
    '밭의 높이를 손가락으로 눌러 낮은음자리표의 다섯 줄(G2 B2 D3 F3 A3)을 놓고 통과한다. 키보드도 끌기도 쓰지 않는다',
    async () => {
      const { ctx, page, errors } = await boot({ w: 1024, h: 768, touch: true, log: true });
      await enter(page, 'N2', N2, 'tap');
      await pickTarget(page, Q09_BASS_LINES, 'touch');
      let t = await terraceOf(page, N2);
      expect(t.headers).toBe(5);
      expect(t.hatched).toEqual([6, 7, 8]);
      await act(page, 'cursor-right', 'touch');
      await waitTerrace(page, N2, (x) => x.cursor?.column === 1, '첫 열을 고른다');
      // G2 B2 D3 F3 A3 = 온음계 −10 −8 −6 −4 −2: 가온 도 아래라 세로 좌표는 1480 1384 1288 1192 1096이다
      for (const [column, step] of [[1, -10], [2, -8], [3, -6], [4, -4], [5, -2]] as const) t = await putLamp(page, N2, column, step, 'touch');
      expect(lampsText(t)).toEqual(['1:-10', '2:-8', '3:-6', '4:-4', '5:-2']);
      expect(t.lamps.map((l) => l.y)).toEqual([1480, 1384, 1288, 1192, 1096]);
      // 보표 안의 등이라 덧줄 돌담이 없다
      expect(t.ledgers).toEqual([]);
      await act(page, 'check', 'touch');
      await waitFeedback(page, 'passed');
      await shot(page, 'phase7-terrace-n2-touch.png');

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

describe('7-1 걸어서 밭을 지나간다(W-3)', () => {
  it(
    '겹친 밭에서는 서 있는 자리와 가장 가까운 설치물만 밟았다고 알린다(N1 위쪽, N3 가운데, N2 아래쪽). 놓은 등의 소리가 나고 모드에도 판정에도 들어가지 않는다',
    async () => {
      const { ctx, page, errors } = await boot({ intro: 'key' });
      // 가운데 턱의 두 열에 가온 도를 놓아 둔다(키보드로 빠르게)
      await enter(page, 'N3', N3, 'key');
      await pickTargetByKeys(page, Q01_MIDDLE_C);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowUp');
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
      await waitTerrace(page, N3, (x) => lampsText(x).join() === '1:0', '첫 등이 가온 도에 놓인다');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowUp');
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
      await waitTerrace(page, N3, (x) => lampsText(x).join() === '1:0,2:0', '둘째 등이 가온 도에 놓인다');
      await page.keyboard.press('Escape');
      await waitUnframed(page);
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      expect(await modeOf(page)).toBeNull();

      const notes = await recordWorldNotes(page);
      expect(await notes()).toEqual([]);

      /** 한 줄(y)의 첫 열 왼쪽에 서서 오른쪽으로 걷는다. 두 열을 밟을 때까지 걷고 멈춘다. 밟았다고 알린 사건을 돌려준다 */
      const walkRow = async (y: number): Promise<Array<{ installationId?: string; slot?: number; entered?: boolean }>> => {
        await command(page, { type: 'teleport', x: 4310, y });
        await until(() => pos(page), (p) => Math.abs(p.x - 4310) < 2 && Math.abs(p.y - y) < 2, `캐릭터가 (4310, ${y})에 선다`);
        await recordEvents(page);
        await page.keyboard.down('ArrowRight');
        const got = await until(() => eventsOf(page, 'stepped'), (e) => e.length >= 2, '두 열을 밟았다는 사건이 나간다', 40000);
        await page.keyboard.up('ArrowRight');
        return got;
      };

      // 가운데 턱의 높이(y=1000): 사건은 N3의 것뿐이고 바깥에서 올라설 때마다 entered가 붙는다. 두 열의 등(C4 = 60)이 울린다
      const mid = await walkRow(1000);
      expect(mid.every((e) => e.installationId === N3)).toBe(true);
      expect(mid.slice(0, 2).map((e) => [e.slot, e.entered])).toEqual([[1, true], [2, true]]);
      const played = await until(notes, (n) => n.length >= 2, '밟은 열의 등 소리가 난다');
      expect(played.slice(0, 2).map((n) => n.midi)).toEqual([60, 60]);
      for (const n of played) expect(n.sec).toBe(0.5);
      // 걷는 동안 밭은 풍경이다: 이름표와 빗금이 없고 놓은 등만 보인다
      const t = await terraceOf(page, N3);
      expect(t).toMatchObject({ headers: 0, hatched: [], cursor: null });
      expect(lampsText(t)).toEqual(['1:0', '2:0']);
      await shot(page, 'phase7-terrace-walk-n3.png');

      // 높은음 밭의 높이(y=700)는 N1의 사건만, 낮은음 밭의 높이(y=1300)는 N2의 사건만 나간다(같은 밭을 세 설치물이 나눠 쓰지만 소리가 겹치지 않는다)
      const upper = await walkRow(700);
      expect(upper.every((e) => e.installationId === N1)).toBe(true);
      const lower = await walkRow(1300);
      expect(lower.every((e) => e.installationId === N2)).toBe(true);

      // 걷기는 판정이 아니다: 모드에 들어가지 않았고 작업대도 열리지 않았고 누르기 사건도 없다
      expect(await modeOf(page)).toBeNull();
      expect(await page.locator('[data-installation-hud]').count()).toBe(0);
      expect(await eventsOf(page, 'slot-pressed')).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-1 관찰 O1 허수아비 밭(설계서 5.3)', () => {
  it(
    '판정 없이 걸어서 본다: 밭 한가운데(3500, 900)를 지나 오른쪽으로 걸을 수 있고, 모드에도 사건에도 들어가지 않는다',
    async () => {
      const { ctx, page, errors } = await boot({ intro: 'key' });
      // 밭의 왼쪽 가장자리, 밧줄의 높이에 선다(걸어서 지나가며 본다)
      await command(page, { type: 'teleport', x: 3200, y: 900 });
      await until(() => pos(page), (p) => Math.abs(p.x - 3200) < 2 && Math.abs(p.y - 900) < 2, '캐릭터가 (3200, 900)에 선다');
      await waitChunks(page);
      await recordEvents(page);
      await shot(page, 'phase7-scarecrow-field-before.png');
      await page.keyboard.down('ArrowRight');
      // 허수아비 밭의 가운데(3500)를 지나 오른쪽 끝(3800)을 넘어선다. 허수아비는 막지 않는다
      const p = await until(() => pos(page), (v) => v.x > 3800, '밭을 지나 오른쪽으로 걸어간다', 60000);
      await page.keyboard.up('ArrowRight');
      expect(p.x).toBeGreaterThan(3800);
      expect(Math.abs(p.y - 900)).toBeLessThan(24);
      // 판정이 없다: 모드에 들어가지 않았고, 설치물 사건이 하나도 없다
      expect(await modeOf(page)).toBeNull();
      expect(await page.locator('[data-installation-hud]').count()).toBe(0);
      expect(await eventsOf(page, 'slot-pressed')).toEqual([]);
      expect(await eventsOf(page, 'stepped')).toEqual([]);
      // 밭 한가운데에서 한 장 찍는다: 팔이 위로 향한 셋(가운데 줄 아래)과 아래로 향한 넷(가운데 줄과 그 위)이 보인다
      await command(page, { type: 'teleport', x: 3500, y: 1000 });
      await until(() => pos(page), (v) => Math.abs(v.x - 3500) < 2 && Math.abs(v.y - 1000) < 2, '캐릭터가 (3500, 1000)에 선다');
      await waitChunks(page);
      await page.waitForTimeout(600);
      await shot(page, 'phase7-scarecrow-field.png');
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-1 카메라(7.6): 한 칸을 48 px 아래로 줄이지 않고 고른 높이를 담는다', () => {
  // 조작 막대가 화면 아래를 가려도(1280×720에서 317 px) 고른 높이가 메뉴 띠 아래 막대 위에 온전히 보인다. 좁은 화면에서는 고른 열을 따라간다
  const sizes: Array<[number, number, boolean]> = [
    [1280, 720, false],
    [390, 844, true],
    [844, 390, true],
  ];
  for (const [w, hh, touch] of sizes) {
    it(
      `${w}×${hh}: N1에서 첫 열을 고르고 가운데 줄에 등을 놓으면 그 열과 높이가 화면에 온전히 보이고 한 칸은 48 px 이상이다`,
      async () => {
        const { ctx, page, errors } = await boot({ w, h: hh, touch, intro: touch ? 'tap' : 'click' });
        await enter(page, 'N1', N1, 'key');
        await pickTarget(page, Q09_TREBLE_LINES, touch ? 'touch' : 'mouse');
        await page.keyboard.press('ArrowRight');
        await waitTerrace(page, N1, (x) => x.cursor?.column === 1, '첫 열을 고른다');
        await page.keyboard.press('ArrowUp');
        const t = await waitTerrace(page, N1, (x) => lampsText(x).join() === '1:6', '등이 가운데 줄에 놓인다');
        const d = await settled(page);
        const inset = await insetOf(page);
        // 한 칸의 높이가 화면에서 48 px 이상이다: 어느 화면에서도 더 줄이지 않는다
        expect(48 * d.zoom, `${w}×${hh} 한 칸의 높이(화면 px)`).toBeGreaterThanOrEqual(48 - 1e-6);
        // 고른 높이(등의 가운데 ±한 칸 반)가 메뉴 띠 아래, 조작 막대 위에 온전히 보인다
        const lamp = t.lamps[0]!;
        const c = toScreen(d, lamp.x, lamp.y);
        expect(c.y - 24, `${w}×${hh} 등의 위쪽이 메뉴 띠 아래`).toBeGreaterThanOrEqual(MENU_BAND - 0.5);
        expect(hh - inset - (c.y + 24), `${w}×${hh} 등의 아래쪽이 조작 막대 위`).toBeGreaterThanOrEqual(-0.5);
        // 고른 열의 사각형(열 너비 96)이 화면 좌우 안에 있다
        const col = CELLS[N1]!.find((x) => x.slot === 1)!;
        const a = toScreen(d, col.x, col.y);
        const b = toScreen(d, col.x + col.w, col.y + col.h);
        expect(a.x, `${w}×${hh} 열의 왼쪽`).toBeGreaterThanOrEqual(-0.5);
        expect(w - b.x, `${w}×${hh} 열의 오른쪽`).toBeGreaterThanOrEqual(-0.5);
        // 넓은 화면(1280)에서는 밭 전체의 너비(조각상 띠 64 px 포함)가 한 번에 보인다
        if (w >= 1280) {
          const left = toScreen(d, 4352 - 64, 0).x;
          const right = toScreen(d, 5428, 0).x;
          expect(left).toBeGreaterThanOrEqual(-0.5);
          expect(w - right).toBeGreaterThanOrEqual(-0.5);
        }
        await shot(page, `phase7-terrace-camera-${w}x${hh}.png`);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});
