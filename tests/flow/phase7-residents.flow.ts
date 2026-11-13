// 7-6 주민(악사) 여섯과 한 줄 안내(설계서 1.5, 6.4, 6.6, 9.3, 12.10) 흐름 시험(실제 Chrome).
// 완료 기준: "주민(악사) 6명과 한 줄 안내 | 안내는 사실과 추천 이유만 말한다".
// 이 파일이 보는 것(진짜 월드, 진짜 화면):
//  - 주민 여섯이 지역마다 정해진 자리에 서 있고(월드 그림 층), 처음에는 아무도 연주하지 않는다. 발견 표식 층이 주민을 그리지 않는다
//  - 가까이 가면 이름 칩과 '말 걸기' 단추가 뜨고, E, 마우스로 누르기(걸어가서), 터치로 누르기로 말을 걸면 한 줄을 말하는 카드가 뜬다.
//    떠 있는 동안 월드는 멈추고, Esc나 '닫기'로 닫는다. 말을 걸어도 저장할 것이 생기지 않고, 주민은 길을 막지 않는다(W-1, W-5)
//  - 말은 한 줄이고 사실과 추천 이유뿐이다: 추천이면 과제 제목과 정거장 이름이 내용 파일(content/)의 사실과 맞고, 아니면 층의 사실이다
//  - 그 지역의 층이 1 이상이면 그 지역의 주민이 연주한다(진짜 과제를 통과하면 바로). 장이 박마다 넘어가고 음표 표지가 보인다. 움직임 줄이기에서는 장을 넘기지 않는다
//  - 사진: 서 있기와 연주 모습(눈으로 보는 점검 자료, docs/verification/screens/). 사람의 눈 점검을 대신하지 않는다
// 글이 사실과 추천 이유만 말하는지는 단위 시험(tests/unit/residents.test.ts)이 모든 주민 × 층 × 상태로 훑고, 이 파일은 진짜 화면에서 나온 줄을 같은 종류의 기준으로 한 번 더 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENSEMBLE_COMBOS } from '@/domain/ensemblecheck';
import { RESIDENTS, RESIDENT_LINE_MAX } from '@/domain/residents';
import type { ResidentDef } from '@/domain/residents';
import { command, dbg, hashOf, pos, status, toScreen, waitReady } from './game';
import type { Dbg, DrawnResident, Pos } from './game';
import { startHarness, type Harness } from './harness';
import { wait } from './soundTools';
import { boot as bootWith, seedSave, squash, standBy, until } from './villageTools';
import type { BootOptions } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 300_000;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const CONTENT = path.resolve(__dirname, '../../content');
/** 쪽을 열고 월드가 올라올 때까지 기다린다(월드가 올라오기 전에는 점검 상태가 null이다) */
const boot = async (opts: BootOptions = {}) => {
  const b = await bootWith(h, opts);
  await waitReady(b.page);
  return b;
};

const byRegion = (regionId: string): ResidentDef => RESIDENTS.find((r) => r.regionId === regionId)!;
/** 연주하는 네 장에서 악기가 있는 자리에서 벗어나는 만큼(월드 px). 그림 층의 값(PLAY_SWAY)을 손으로 옮겼다: 시험이 구현의 상수에 기대지 않는다 */
const SWAY: ReadonlyArray<readonly [number, number]> = [[-2, 0], [0, -3], [2, 0], [0, -3]];

// ───── 내용 파일에서 읽는 사실(과제 제목, 지역의 정거장) ─────
const questIdOfTitle = new Map<string, string>();
for (const f of fs.readdirSync(path.join(CONTENT, 'quests')).filter((x) => x.endsWith('.json'))) {
  const q = JSON.parse(fs.readFileSync(path.join(CONTENT, 'quests', f), 'utf-8')) as { questId: string; title: string };
  questIdOfTitle.set(q.title, q.questId);
}
const stationsOf = (regionId: string): Array<{ name: string; questIds?: string[] }> =>
  (JSON.parse(fs.readFileSync(path.join(CONTENT, 'regions', `${regionId}.json`), 'utf-8')) as { stations: Array<{ name: string; questIds?: string[] }> }).stations;

const RECOMMENDATION = /^'(.+)'(은|는) (.+)에 있어요\. (.+)$/;
const LAYER_FACT = /^(.+)에서 도전을 하나 통과하면 합주에 .+[이가] 더해져요\.$|^합주에 .+[이가] [123]층으로 더해져 있어요\.$/;
/** 평가하는 말, 시키는 말, 6.7이 넣지 않는다고 한 말(단위 시험의 기준에서 줄인 것) */
const BANNED = /잘[했하]|못[했하]|훌륭|대단|실력|틀렸|실패|해야|하세요|해 보세요|반드시|조심|경고|경험치|점수|별점|순위|남은|%|[?!？！]/;

/** 말 한 줄이 사실과 추천 이유만 말하는 모양인지 보고, 어떤 말인지 돌려준다 */
function checkLine(r: ResidentDef, line: string): 'recommendation' | 'layer' {
  const where = `${r.name}: ${line}`;
  expect(line, where).not.toMatch(/[\n\r]/);
  expect([...line].length, where).toBeLessThanOrEqual(RESIDENT_LINE_MAX);
  expect(line, where).not.toMatch(BANNED);
  expect(line.endsWith('요.'), where).toBe(true);
  const m = RECOMMENDATION.exec(line);
  if (m) {
    const [, title, , stationName, reason] = m;
    const questId = questIdOfTitle.get(title!);
    expect(questId, `${where} (과제 제목이 내용 파일에 있다)`).toBeDefined();
    const station = stationsOf(r.regionId).find((s) => s.name === stationName);
    expect(station, `${where} (그 지역의 정거장 이름)`).toBeDefined();
    expect(station!.questIds ?? [], `${where} (그 정거장에 놓인 과제)`).toContain(questId);
    expect(reason, `${where} (이유 한 줄)`).toMatch(/요\.$/);
    return 'recommendation';
  }
  expect(line, where).toMatch(LAYER_FACT);
  return 'layer';
}

// ───── 화면에서 읽는 것 ─────
interface GameLike {
  world: { bridge: { residents: { get(): readonly string[] } } };
  opened: { store: { get(): ReadonlySet<string> } };
  found: { store: { get(): ReadonlySet<string> } };
  controller: { attempts: readonly unknown[]; open(questId: string, variantId: string): unknown; edit(e: unknown): unknown; check(): { passed: boolean } };
}
/** 점검용으로 월드의 Phaser 반복을 재우고 깨우는 데 쓰는 모양(월드 호스트의 안쪽 handle을 읽는다) */
interface LoopHost {
  __game: {
    world: {
      debugState(): { residents: Array<{ residentId: string; pose: string; frame: number }> } | null;
      handle: { game: { loop: { sleep(): void; wake(): void } }; scene: { cameras: { main: { fadeEffect: { isRunning: boolean } } } } };
    };
  };
}
const playingIds = (p: Page): Promise<string[]> => p.evaluate(() => [...(window as unknown as { __game: GameLike }).__game.world.bridge.residents.get()]);
/** 저장에 들어갈 것(열어 본 과제, 찾은 것, 시도 기록 수). 말을 걸어도 달라지지 않는다 */
const footprint = (p: Page): Promise<string> =>
  p.evaluate(() => {
    const g = (window as unknown as { __game: GameLike }).__game;
    return JSON.stringify({ opened: [...g.opened.store.get()].sort(), found: [...g.found.store.get()].sort(), attempts: g.controller.attempts.length });
  });
const solveQ07 = (p: Page): Promise<{ passed: boolean }> =>
  p.evaluate(() => {
    const c = (window as unknown as { __game: GameLike }).__game.controller;
    c.open('scale.major', 'c-major');
    const notes: Array<[string, number]> = [['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5]];
    notes.forEach(([letter, octave], i) => c.edit({ type: 'setSlot', slot: i + 1, writtenPitch: { letter, accidental: null, octave } }));
    return { passed: c.check().passed };
  });

const card = (p: Page) => p.locator('[data-resident-card]');
const lineOf = async (p: Page): Promise<string> => squash(await p.locator('[data-resident-card] [data-resident-line]').innerText());
const residentsOf = async (p: Page): Promise<DrawnResident[]> => (await dbg(p)).residents;
const residentNow = async (p: Page, id: string): Promise<DrawnResident> => (await residentsOf(p)).find((r) => r.residentId === id)!;
/** 카드가 닫히고 월드가 다시 움직일 때까지 */
async function waitClosed(p: Page): Promise<void> {
  await p.waitForSelector('[data-resident-card]', { state: 'detached', timeout: 20_000 });
  await until(() => status(p), (s) => !s.paused, '월드가 다시 움직인다', 20_000);
}

/**
 * 장면 시계가 seconds초 흐르는 동안 계속 본다. 한 번 볼 때마다 each를 부르고, 시간이 다 흐른 뒤에도 done()이 참이 될 때까지 더 본다.
 * 프레임이 느린 화면에서는 장면 시계가 한 프레임에 0.1초까지만 더해서 실제 시간보다 느리게 가므로, 고정한 실제 시간 대신 장면 시계로 센다.
 */
async function watchFor(page: Page, seconds: number, each: (d: Dbg) => void, done: () => boolean = () => true, timeoutMs = 420_000): Promise<{ from: number; to: number; rounds: number }> {
  const from = (await dbg(page)).clock;
  const end = Date.now() + timeoutMs;
  let rounds = 0;
  for (;;) {
    const d = await dbg(page);
    rounds += 1;
    each(d);
    if (d.clock - from >= seconds && done()) return { from, to: d.clock, rounds };
    if (Date.now() > end) throw new Error(`시간 안에 장면 시계가 ${seconds}초 흐르지 않았거나 끝 조건이 채워지지 않았어요: 시계 ${from.toFixed(2)}→${d.clock.toFixed(2)}초, ${rounds}번 봄`);
    await wait(120);
  }
}

/** 자리 곁에서 일정 거리 떨어진 곳(걸을 수 있는 땅)에 선다. 가로 방향을 먼저 본다(화면 가운데 높이에 주민이 오게) */
const DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
async function standApart(p: Page, r: ResidentDef, dists: readonly number[], minGap: number): Promise<Pos> {
  const tried: string[] = [];
  for (const dist of dists) {
    for (const [dx, dy] of DIRS) {
      await command(p, { type: 'teleport', x: r.x + dx * dist, y: r.y + dy * dist });
      await wait(300);
      const at = await pos(p);
      if (Math.hypot(at.x - r.x, at.y - r.y) < minGap) {
        tried.push(`(${dx}, ${dy})×${dist}: ${Math.round(Math.hypot(at.x - r.x, at.y - r.y))} px`);
        continue;
      }
      await until(() => dbg(p), (d) => d.pending.length === 0, '바닥 조각이 올라온다', 30_000);
      return at;
    }
  }
  throw new Error(`${r.name}에서 ${minGap} px 넘게 떨어져 설 자리를 찾지 못했어요: ${tried.join(', ')}`);
}

/** 화면에 보이는 주민의 점(발치에서 위로 offset px 올린 곳)이 메뉴 띠와 아래 막대에 가려지지 않는 안쪽인가 */
const insideView = (s: { x: number; y: number }, d: Dbg): boolean => s.x > 80 && s.x < d.size.width - 80 && s.y > 130 && s.y < d.size.height - 150;

describe('7-6 주민 여섯: 서 있는 모습과 E로 말 걸기', () => {
  it(
    '지역마다 한 명이 정해진 자리에 서 있고 처음에는 아무도 연주하지 않는다. 가까이 가면 이름 칩과 "말 걸기"가 뜨고, E로 말을 걸면 한 줄을 말하는 카드가 뜬다(월드는 멈춘다). Esc로 닫고, 아무것도 적히지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      const d0 = await dbg(page);
      expect(d0.residents.map((r) => r.residentId), '지역의 차례').toEqual(RESIDENTS.map((r) => r.residentId));
      d0.residents.forEach((r, i) => {
        const def = RESIDENTS[i]!;
        expect(r, def.name).toMatchObject({ residentId: def.residentId, name: def.name, x: def.x, y: def.y, playing: false, pose: 'standing', noteVisible: false, toolOffset: { x: 0, y: 0 } });
        expect([0, 1], `${def.name}의 장`).toContain(r.frame);
        expect(Number.isFinite(r.depth), `${def.name}의 깊이`).toBe(true);
      });
      // 겹침 순서는 발 위치의 y를 따른다: 아래에 선 주민이 위에 그려진다
      const byY = [...d0.residents].sort((a, b) => a.y - b.y);
      for (let i = 1; i < byY.length; i++) expect(byY[i]!.depth, `${byY[i - 1]!.name}보다 ${byY[i]!.name}가 위`).toBeGreaterThan(byY[i - 1]!.depth);
      // 발견 표식 층은 주민을 그리지 않는다(주민은 따로 둔 층이 그린다)
      expect(d0.spots.some((s) => s.kind === 'resident')).toBe(false);
      expect(await playingIds(page)).toEqual([]);

      const before = await footprint(page);
      const hashBefore = await hashOf(page);
      const lines: string[] = [];
      for (const r of RESIDENTS) {
        await standBy(page, { id: r.residentId, x: r.x, y: r.y });
        const st = await status(page);
        expect(st.near, `${r.name} 앞의 칩`).toEqual({ stationId: r.residentId, name: r.name, spot: 'resident' });
        expect(squash(await page.locator('.hud-chip').innerText()), `${r.name}의 칩 글`).toBe(`${r.name} · E 또는 누르기`);
        expect(squash(await page.locator('.hud-interact').innerText())).toBe('말 걸기');
        expect(await page.locator('.hud-interact').getAttribute('aria-label')).toBe(`${r.name} 말 걸기`);

        const at = await pos(page);
        await page.keyboard.press('KeyE');
        await page.waitForSelector(`[data-resident-card="${r.residentId}"]`, { timeout: 20_000 });
        expect((await status(page)).paused, `${r.name}: 카드가 떠 있는 동안 월드는 멈춘다`).toBe(true);
        expect(squash(await card(page).locator('h1').innerText())).toBe(r.name);
        expect(await card(page).locator('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
        // 고르는 대화가 없다: 단추는 닫기 하나뿐이고, 링크가 있다면 추천한 도전 하나뿐이다
        expect(await card(page).locator('button').count()).toBe(1);
        expect(await card(page).locator('a').count()).toBeLessThanOrEqual(1);
        const line = await lineOf(page);
        const kind = checkLine(r, line);
        expect(await page.locator('[data-resident-line]').getAttribute('data-say')).toBe(kind);
        expect(await card(page).locator('a[data-related]').count(), `${r.name}: 추천이면 도전 열기가 있고 사실만이면 없다`).toBe(kind === 'recommendation' ? 1 : 0);
        lines.push(`${r.name}: ${line}`);
        // 떠 있는 동안 캐릭터는 움직이지 않는다
        await wait(400);
        const held = await pos(page);
        expect(Math.hypot(held.x - at.x, held.y - at.y), `${r.name}: 카드가 떠 있는 동안 걷지 않는다`).toBeLessThan(1);

        await page.keyboard.press('Escape');
        await waitClosed(page);
        expect(await hashOf(page), '주소는 그대로다').toBe(hashBefore);
      }
      console.log(`[phase7-residents] 처음 상태에서 여섯 주민의 말:\n  ${lines.join('\n  ')}`);
      expect(await footprint(page), '말을 걸어도 열어 본 과제, 찾은 것, 시도 기록은 그대로다').toBe(before);
      expect(await playingIds(page)).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '주민은 길을 막지 않는다(W-1): 주민의 자리를 지나 걸을 수 있고, 걷기만 해서는 말이 걸리지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      const r = byRegion('staff-hill');
      await standBy(page, { id: r.residentId, x: r.x, y: r.y });
      const start = await pos(page);
      expect(start.y).toBeGreaterThan(r.y);
      await page.keyboard.down('ArrowUp');
      try {
        await until(() => pos(page), (p) => p.y < r.y - 30, '주민의 자리를 지나 위로 걷는다', 40_000);
      } finally {
        await page.keyboard.up('ArrowUp');
      }
      expect(await card(page).count(), '걷기만 해서는 카드가 뜨지 않는다').toBe(0);
      expect((await status(page)).paused).toBe(false);
      // 지나온 자리에서 주민은 그대로 서 있다
      const still = await residentNow(page, r.residentId);
      expect({ x: still.x, y: still.y }).toEqual({ x: r.x, y: r.y });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-6 누르기로 말 걸기: 마우스와 터치', () => {
  /** 멀리서 주민을 눌러 걷기 시작하는 데까지(걸을 수 있는 자리를 골라 가며 시도한다) */
  async function tapFromAfar(page: Page, r: ResidentDef, how: 'mouse' | 'touch'): Promise<Pos> {
    const tried: string[] = [];
    for (const dist of [210, 160]) {
      for (const [dx, dy] of DIRS) {
        await command(page, { type: 'teleport', x: r.x + dx * dist, y: r.y + dy * dist });
        await wait(300);
        const from = await pos(page);
        if (Math.hypot(from.x - r.x, from.y - r.y) < 130) continue;
        await until(() => dbg(page), (d) => d.pending.length === 0, '바닥 조각이 올라온다', 30_000);
        const d = await dbg(page);
        const body = toScreen(d, r.x, r.y - 30);
        if (!insideView(body, d)) {
          tried.push(`(${dx}, ${dy})×${dist}: 화면 밖`);
          continue;
        }
        if (how === 'touch') await page.touchscreen.tap(body.x, body.y);
        else await page.mouse.click(body.x, body.y);
        const walking = await until(() => status(page), (s) => s.walking, '걷기 시작', 4_000).then(
          () => true,
          () => false,
        );
        if (walking) return from;
        tried.push(`(${dx}, ${dy})×${dist}: 걷지 않음`);
      }
    }
    throw new Error(`${r.name}을 눌러 걷기 시작하는 자리를 찾지 못했어요: ${tried.join(', ')}`);
  }

  it(
    '마우스로 멀리 있는 주민을 누르면 그 앞까지 걸어가 말을 건다. 카드가 뜨는 동안 월드는 멈추고, 닫기 단추로 닫는다',
    async () => {
      const { ctx, page, errors } = await boot();
      const r = byRegion('beat-river');
      const from = await tapFromAfar(page, r, 'mouse');
      await page.waitForSelector(`[data-resident-card="${r.residentId}"]`, { timeout: 60_000 });
      const at = await pos(page);
      expect(Math.hypot(at.x - r.x, at.y - r.y), '주민 앞(96 px 안)까지 걸어왔다').toBeLessThanOrEqual(96);
      expect(Math.hypot(at.x - from.x, at.y - from.y), '실제로 걸었다').toBeGreaterThan(30);
      expect((await status(page)).paused).toBe(true);
      expect((await status(page)).walking).toBe(false);
      checkLine(r, await lineOf(page));
      // 초점이 닫기에 가 있다: 키보드로 바로 닫을 수 있다
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('닫기');
      await card(page).locator('button', { hasText: '닫기' }).click();
      await waitClosed(page);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '터치(가로 화면)로 멀리 있는 주민을 누르면 걸어가 말을 걸고, 가까이에서는 안내 칩을 눌러 말을 건다. 닫기도 터치로 한다',
    async () => {
      const { ctx, page, errors } = await boot({ touch: true });
      const far = byRegion('scale-trail');
      await tapFromAfar(page, far, 'touch');
      await page.waitForSelector(`[data-resident-card="${far.residentId}"]`, { timeout: 60_000 });
      expect(Math.hypot((await pos(page)).x - far.x, (await pos(page)).y - far.y)).toBeLessThanOrEqual(96);
      checkLine(far, await lineOf(page));
      await card(page).locator('button', { hasText: '닫기' }).tap();
      await waitClosed(page);

      // 가로 화면에서는 안내 칩이 곧 누르는 곳이다(7.6): 64 px 열기 단추는 세로 화면에서만 보인다
      const near = byRegion('key-marsh');
      await standBy(page, { id: near.residentId, x: near.x, y: near.y });
      expect(await page.locator('.hud-interact').isVisible(), '가로 화면에서는 열기 단추가 보이지 않는다').toBe(false);
      expect(squash(await page.locator('.hud-chip').innerText()), '안내 칩은 이름과 누르기를 말한다').toMatch(new RegExp(`^${near.name} · (E 또는 )?누르기$`));
      await page.locator('.hud-chip').tap();
      await page.waitForSelector(`[data-resident-card="${near.residentId}"]`, { timeout: 20_000 });
      checkLine(near, await lineOf(page));
      await card(page).locator('button', { hasText: '닫기' }).tap();
      await waitClosed(page);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '터치(세로 화면)에서는 가까이 가면 "말 걸기" 열기 단추(44 px 넘게)가 뜨고, 눌러 말을 건다. 닫기도 터치로 한다',
    async () => {
      const { ctx, page, errors } = await boot({ touch: true, width: 390, height: 844 });
      const r = byRegion('bell-grove');
      await standBy(page, { id: r.residentId, x: r.x, y: r.y });
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      expect(squash(await page.locator('.hud-interact').innerText())).toBe('말 걸기');
      expect(await page.locator('.hud-interact').getAttribute('aria-label')).toBe(`${r.name} 말 걸기`);
      const box = (await page.locator('.hud-interact').boundingBox())!;
      expect(box.width, '열기 단추의 가로').toBeGreaterThanOrEqual(44);
      expect(box.height, '열기 단추의 세로').toBeGreaterThanOrEqual(44);
      await page.locator('.hud-interact').tap();
      await page.waitForSelector(`[data-resident-card="${r.residentId}"]`, { timeout: 20_000 });
      expect((await status(page)).paused).toBe(true);
      checkLine(r, await lineOf(page));
      // 좁은 화면에서도 카드가 화면 안에 들어온다
      const cardBox = (await card(page).locator('[role="dialog"]').boundingBox())!;
      expect(cardBox.x, '카드의 왼쪽').toBeGreaterThanOrEqual(0);
      expect(cardBox.x + cardBox.width, '카드의 오른쪽').toBeLessThanOrEqual(390 + 0.5);
      expect(cardBox.y + cardBox.height, '카드의 아래').toBeLessThanOrEqual(844 + 0.5);
      await card(page).locator('button', { hasText: '닫기' }).tap();
      await waitClosed(page);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-6 그 지역의 층이 1 이상이면 그 지역의 주민이 연주한다', () => {
  const FULL = ENSEMBLE_COMBOS.find((c) => c.id === 'c12-full')!;

  it(
    '진짜 과제(Q07, 장음계: 마을과 음계 길에 놓였다)를 통과하면 마을과 음계 길의 주민이 연주하기 시작하고, 나머지는 서 있는다. 연주하는 주민은 박마다 장이 넘어가고 음표 표지가 보인다',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await playingIds(page)).toEqual([]);
      expect((await solveQ07(page)).passed).toBe(true);
      const playing = ['resident.village', 'resident.scale-trail'];
      expect(await until(() => playingIds(page), (ids) => ids.length === 2, '연주하는 주민이 알려진다', 30_000)).toEqual(playing);

      // 장면 시계가 흐르는 동안 계속 보면서(느린 화면에서는 시계가 실제 시간보다 느리게 간다), 볼 때마다 모양을 확인하고
      // 연주하는 주민의 네 장이 모두 보일 때까지 기다린다
      const frames = new Map<string, Set<number>>();
      const clock0 = (await dbg(page)).clock;
      let rounds = 0;
      let clock1 = clock0;
      await until(
        async () => {
          const d = await dbg(page);
          rounds += 1;
          clock1 = d.clock;
          for (const r of d.residents) {
            const where = `${r.name} ${r.pose}:${r.frame} (시계 ${d.clock.toFixed(2)})`;
            const def = RESIDENTS.find((x) => x.residentId === r.residentId)!;
            expect({ x: r.x, y: r.y }, where).toEqual({ x: def.x, y: def.y });
            if (playing.includes(r.residentId)) {
              expect(r.playing, where).toBe(true);
              expect(r.pose, where).toBe('playing');
              expect(r.frame, `${where}: 한 박(0.75초)마다 한 장씩 넘어가 한 마디(3초)에 네 장이 한 바퀴 돈다`).toBe(Math.floor(d.clock / 0.75) % 4);
              expect(r.noteVisible, `${where}: 연주하는 장에는 음표 표지가 보인다`).toBe(true);
              expect([r.toolOffset.x, r.toolOffset.y], `${where}: 악기가 박마다 흔들린다`).toEqual([...SWAY[r.frame]!]);
              if (!frames.has(r.residentId)) frames.set(r.residentId, new Set());
              frames.get(r.residentId)!.add(r.frame);
            } else {
              expect(r.playing, where).toBe(false);
              expect(r.pose, where).toBe('standing');
              expect(r.frame, `${where}: 서 있기는 눈을 뜬 장이고 마디의 끝 0.3초만 눈을 감는다`).toBe(d.clock % 3 >= 3 - 0.3 ? 1 : 0);
              expect(r.noteVisible, where).toBe(false);
              expect(r.toolOffset, where).toEqual({ x: 0, y: 0 });
            }
          }
          return playing.map((id) => frames.get(id)?.size ?? 0);
        },
        (counts) => counts.every((c) => c === 4),
        '연주하는 주민의 네 장이 모두 보인다',
        300_000,
      );
      console.log(
        `[phase7-residents] Q07 통과 뒤 연주하는 주민: ${playing.join(', ')}. 본 장 ${JSON.stringify(Object.fromEntries([...frames].map(([k, v]) => [k, [...v].sort()])))}. 장면 시계 ${clock0.toFixed(2)}→${clock1.toFixed(2)}초(${rounds}번 봄)`,
      );

      // 연주하는 주민에게 말을 걸어도 연주는 멈추지 않는다: 층의 사실이거나 추천이고, 카드 뒤에서도 장이 계속 넘어간다
      const r = byRegion('village');
      await standBy(page, { id: r.residentId, x: r.x, y: r.y });
      await page.keyboard.press('KeyE');
      await page.waitForSelector(`[data-resident-card="${r.residentId}"]`, { timeout: 20_000 });
      checkLine(r, await lineOf(page));
      await page.keyboard.press('Escape');
      await waitClosed(page);
      expect((await residentNow(page, r.residentId)).playing).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '움직임 줄이기에서는 장을 넘기지 않는다: 저장에서 읽은 층(모두 3층)으로 열면 여섯 모두 연주하되, 장면 시계가 한 마디(3초) 넘게 흐르는 동안 연주 첫 장(음표 표지가 있다)에 서 있다',
    async () => {
      const { ctx, page, errors } = await boot({ reducedMotion: 'reduce' });
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      await seedSave(page, { passed: FULL.quests });
      expect(await playingIds(page), '저장의 통과 기록으로 처음부터 맞게 알린다').toEqual(RESIDENTS.map((r) => r.residentId));
      await until(() => residentsOf(page), (rs) => rs.every((r) => r.pose === 'playing'), '여섯이 연주하는 장에 선다', 30_000);
      const watched = await watchFor(page, 3.6, (d) => {
        expect(d.residents, '여섯 주민').toHaveLength(6);
        for (const r of d.residents) {
          const where = `${r.name} ${r.pose}:${r.frame} (시계 ${d.clock.toFixed(2)})`;
          expect(r.playing, where).toBe(true);
          expect(r.pose, where).toBe('playing');
          expect(r.frame, `${where}: 움직임 줄이기에서는 첫 장`).toBe(0);
          expect(r.noteVisible, where).toBe(true);
          expect([r.toolOffset.x, r.toolOffset.y], where).toEqual([...SWAY[0]!]);
        }
      });
      console.log(`[phase7-residents] 움직임 줄이기(모두 3층): 장면 시계 ${watched.from.toFixed(2)}→${watched.to.toFixed(2)}초 동안 ${watched.rounds}번 보았고 여섯 모두 연주 첫 장이었다`);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '움직임 줄이기에서 층이 모두 0이면, 장면 시계가 한 마디(3초)와 눈 깜빡임 구간(0.3초)을 넘게 흐르는 동안 서 있기는 눈을 뜬 장에만 선다',
    async () => {
      const { ctx, page, errors } = await boot({ reducedMotion: 'reduce' });
      expect(await playingIds(page)).toEqual([]);
      const watched = await watchFor(page, 3.6, (d) => {
        expect(d.residents, '여섯 주민').toHaveLength(6);
        for (const r of d.residents) {
          const where = `${r.name} ${r.pose}:${r.frame} (시계 ${d.clock.toFixed(2)})`;
          expect(r.pose, where).toBe('standing');
          expect(r.frame, `${where}: 움직임 줄이기에서는 눈을 뜬 장`).toBe(0);
          expect(r.noteVisible, where).toBe(false);
        }
      });
      console.log(`[phase7-residents] 움직임 줄이기(모두 0층): 장면 시계 ${watched.from.toFixed(2)}→${watched.to.toFixed(2)}초 동안 ${watched.rounds}번 보았고 여섯 모두 눈을 뜬 장이었다`);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '대조: 움직임 줄이기가 아니면 서 있는 주민은 마디(3초)의 끝 0.3초에 눈을 감은 장이 된다(위 시험이 눈 깜빡임을 볼 수 있는 길이로 지켜봤다는 뜻이다)',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
      const blinked = new Set<string>();
      const watched = await watchFor(
        page,
        3.6,
        (d) => {
          for (const r of d.residents) {
            const where = `${r.name} ${r.pose}:${r.frame} (시계 ${d.clock.toFixed(2)})`;
            expect(r.pose, where).toBe('standing');
            expect(r.frame, `${where}: 마디의 끝 0.3초만 눈을 감는다`).toBe(d.clock % 3 >= 3 - 0.3 ? 1 : 0);
            if (r.frame === 1) blinked.add(r.residentId);
          }
        },
        () => blinked.size === RESIDENTS.length,
      );
      console.log(`[phase7-residents] 대조(움직임 줄이기 아님): 장면 시계 ${watched.from.toFixed(2)}→${watched.to.toFixed(2)}초 동안 ${watched.rounds}번 보았고 눈 감은 장을 본 주민 ${blinked.size}명`);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-6 눈으로 보는 점검 자료(사진)', () => {
  const FULL = ENSEMBLE_COMBOS.find((c) => c.id === 'c12-full')!;
  /** 한 칸: 주민 둘레의 월드 가로 120, 세로 130 px(발치 위 100, 아래 30). 보기 좋게 3배로 키운다 */
  const WORLD_W = 120;
  const WORLD_H = 130;
  const CELL_W = 360;
  const CELL_H = 390;

  /**
   * 월드를 멈춘 채로 주민 하나가 원하는 모습(자세와 장)이 될 때까지 쪽 안에서 바로 지켜보다가, 그 순간 Phaser의 반복을 재운다.
   * 느린 화면에서는 사진 한 장을 찍는 사이에 장이 몇 번이고 넘어가므로, 찍는 동안 월드를 멈춰 두지 않으면 원하는 장을 찍을 수 없다.
   */
  const freezeWhen = (page: Page, id: string, pose: string, frames: readonly number[], timeoutMs: number): Promise<boolean> =>
    page.evaluate(
      (a) =>
        new Promise<boolean>((resolve) => {
          const host = (window as unknown as LoopHost).__game.world;
          const end = performance.now() + a.timeoutMs;
          const look = (): void => {
            const r = host.debugState()?.residents.find((x) => x.residentId === a.id);
            // 바로 이동 직후의 0.3초 화면 전환(배경색이 옅게 덮인다)이 끝난 뒤에 멈춘다
            const fading = host.handle.scene.cameras.main.fadeEffect.isRunning;
            if (r && !fading && r.pose === a.pose && a.frames.includes(r.frame)) {
              host.handle.game.loop.sleep();
              resolve(true);
            } else if (performance.now() > end) resolve(false);
            else requestAnimationFrame(look);
          };
          look();
        }),
      { id, pose, frames: [...frames], timeoutMs },
    );
  const thaw = (page: Page): Promise<void> =>
    page.evaluate(() => {
      (window as unknown as LoopHost).__game.world.handle.game.loop.wake();
    });

  /** 주민 하나를 가까이 자른 사진(월드를 멈춘 동안). 시간 안에 그 모습이 되지 않으면 null */
  async function captureFrame(page: Page, id: string, pose: 'standing' | 'playing', frames: readonly number[], timeoutMs: number): Promise<{ png: Buffer; frame: number } | null> {
    if (!(await freezeWhen(page, id, pose, frames, timeoutMs))) return null;
    try {
      const d = await dbg(page);
      const r = d.residents.find((x) => x.residentId === id)!;
      const tl = toScreen(d, r.x - WORLD_W / 2, r.y - 100);
      const clip = { x: Math.round(tl.x), y: Math.round(tl.y), width: Math.round(WORLD_W * d.zoom), height: Math.round(WORLD_H * d.zoom) };
      if (clip.x < 0 || clip.y < 0 || clip.x + clip.width > d.size.width || clip.y + clip.height > d.size.height) throw new Error(`${r.name}의 사진 영역이 화면 밖이에요: ${JSON.stringify(clip)}`);
      const png = await page.screenshot({ clip });
      const after = (await dbg(page)).residents.find((x) => x.residentId === id)!;
      expect({ pose: after.pose, frame: after.frame }, `${r.name}: 월드를 멈춘 동안 장이 바뀌지 않는다`).toEqual({ pose: r.pose, frame: r.frame });
      return { png, frame: r.frame };
    } finally {
      await thaw(page);
    }
  }
  const cellOf = (png: Buffer): Promise<Buffer> => sharp(png).resize(CELL_W, CELL_H, { kernel: 'lanczos3' }).png().toBuffer();
  const sheetOf = async (cells: Buffer[], columns: number): Promise<Buffer> => {
    const rows = Math.ceil(cells.length / columns);
    const gap = 6;
    const W = columns * CELL_W + (columns + 1) * gap;
    const H = rows * CELL_H + (rows + 1) * gap;
    return sharp({ create: { width: W, height: H, channels: 3, background: '#9aa59a' } })
      .composite(cells.map((input, i) => ({ input, left: gap + (i % columns) * (CELL_W + gap), top: gap + Math.floor(i / columns) * (CELL_H + gap) })))
      .png()
      .toBuffer();
  };
  const save = (name: string, png: Buffer): void => {
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, name), png);
  };

  it(
    '여섯 주민의 서 있는 모습(위 줄)과 연주하는 모습(아래 줄), 한 주민의 여섯 장(서 있기 2, 연주 4)을 사진으로 남긴다',
    async () => {
      const standing: Buffer[] = [];
      const playingShots: Buffer[] = [];
      const strip: Buffer[] = [];
      const note: string[] = [];

      // 서 있기: 처음 저장으로 연다. 눈을 뜬 장(0)은 바로 찍고, 눈을 감은 장(1)은 한 주민에게서만 기다려 찍는다(마디 끝의 0.3초)
      {
        const { ctx, page, errors } = await boot();
        for (const r of RESIDENTS) {
          await standApart(page, r, [150, 190], 120);
          const open = await captureFrame(page, r.residentId, 'standing', [0], 60_000);
          expect(open, `${r.name}의 서 있는 사진`).not.toBeNull();
          standing.push(await cellOf(open!.png));
          if (r.regionId === 'staff-hill') {
            strip.push(await cellOf(open!.png));
            const blink = await captureFrame(page, r.residentId, 'standing', [1], 120_000);
            note.push(blink ? '눈을 감은 장을 찍었다' : '눈을 감은 장은 시간 안에 찍지 못했다');
            if (blink) strip.push(await cellOf(blink.png));
          }
        }
        expect(errors).toEqual([]);
        await ctx.close();
      }

      // 연주: 모두 3층으로 연다. 여섯 주민이 모두 연주하는 장에 선다. 한 주민(오선 언덕)은 네 장을 모두 찍는다
      {
        const { ctx, page, errors } = await boot();
        await seedSave(page, { passed: FULL.quests });
        expect(await playingIds(page)).toEqual(RESIDENTS.map((r) => r.residentId));
        for (const r of RESIDENTS) {
          await standApart(page, r, [150, 190], 120);
          if (r.regionId === 'staff-hill') {
            const got = new Map<number, Buffer>();
            const end = Date.now() + 150_000;
            while (got.size < 4 && Date.now() < end) {
              const shot = await captureFrame(page, r.residentId, 'playing', [0, 1, 2, 3].filter((f) => !got.has(f)), 60_000);
              if (shot) got.set(shot.frame, shot.png);
            }
            expect([...got.keys()].sort(), `${r.name}의 연주 네 장`).toEqual([0, 1, 2, 3]);
            for (const f of [0, 1, 2, 3]) strip.push(await cellOf(got.get(f)!));
            playingShots.push(await cellOf(got.get(0)!));
          } else {
            const shot = await captureFrame(page, r.residentId, 'playing', [0], 60_000);
            expect(shot, `${r.name}의 연주 사진`).not.toBeNull();
            playingShots.push(await cellOf(shot!.png));
          }
        }
        expect(errors).toEqual([]);
        await ctx.close();
      }

      expect(standing).toHaveLength(6);
      expect(playingShots).toHaveLength(6);
      save('phase7-residents-six.png', await sheetOf([...standing, ...playingShots], 6));
      save('phase7-resident-frames.png', await sheetOf(strip, strip.length));
      console.log(`[phase7-residents] 사진 2장: 여섯 주민(위 줄 서 있기, 아래 줄 연주 첫 장), 오선 언덕 주민의 ${strip.length}장(서 있기 눈 뜸${strip.length === 6 ? ', 눈 감음' : ''}, 연주 0~3). ${note.join(' ')}`);
    },
    LONG * 2,
  );
});
