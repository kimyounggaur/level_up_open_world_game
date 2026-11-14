// 3단계 흐름 시험(실제 Chrome): 마을이 뜨고, 걷고, 정거장을 열어 Q01·Q02 패널로 간다.
// 완료 기준 3-1(다섯 화면의 보이는 범위), 3-2(걷기), 3-3(길 찾기), 3-4(연결), 3-5(나무 뒤로 가면 가려짐), 3-6, W-1, W-2.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NavGrid, reachableFrom } from '../../src/world/nav';
import { NAV_ROWS, STATION_HITS, WORLD_OBJECTS } from '../../src/world/generated/worldData';
import { bobOf, command, dbg, hashOf, modeOf, pos, status, teleport, toScreen, waitChunks, waitMoved, waitNear, waitReady, waitStopped, type Dbg, type Game } from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { QUEST_COUNT } from './content';
import { completeQ01, completeQ01Keyboard, completeQ02, completeQ02Keyboard, type Pointer } from './panelTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

/** 입력 기록(`window.__input`): 키 누름 수, 누른 도구의 종류(touch·mouse·pen), 누른 자리에서 뗀 자리까지 가장 멀리 간 거리 */
interface InputLog {
  keys: number;
  downs: number;
  types: string[];
  maxDrag: number;
}

async function boot(opts: { w?: number; h?: number; touch?: boolean; hash?: string; reduced?: boolean; log?: boolean; audio?: boolean; intro?: 'click' | 'tap' | 'key' } = {}) {
  const ctx = await h.newContext({
    viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 },
    hasTouch: opts.touch ?? false,
    ...(opts.reduced ? { reducedMotion: 'reduce' as const } : {}),
  });
  if (opts.audio) {
    // 오디오 장치(AudioContext)가 만들어진 횟수를 센다: 소리 켜기 전에는 0이어야 한다(W-11)
    await ctx.addInitScript(() => {
      const w = window as unknown as { __audioContexts: AudioContext[]; AudioContext: typeof AudioContext };
      w.__audioContexts = [];
      const Orig = w.AudioContext;
      w.AudioContext = class extends Orig {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args);
          w.__audioContexts.push(this);
        }
      } as typeof AudioContext;
    });
  }
  if (opts.log) {
    // 터치만으로 했다는 것을 시험이 스스로 확인한다: 키 누름 0, 누른 도구는 touch뿐, 끌기 없음.
    // 크롬은 손가락을 뗀 뒤 호환용 마우스 사건도 만들지만 그것은 PointerEvent가 아니므로 여기에 잡히지 않는다
    await ctx.addInitScript(() => {
      const log: InputLog = { keys: 0, downs: 0, types: [], maxDrag: 0 };
      (window as unknown as { __input: InputLog }).__input = log;
      let down: { x: number; y: number } | null = null;
      window.addEventListener('keydown', () => void log.keys++, true);
      window.addEventListener(
        'pointerdown',
        (e) => {
          log.downs++;
          if (!log.types.includes(e.pointerType)) log.types.push(e.pointerType);
          down = { x: e.clientX, y: e.clientY };
        },
        true,
      );
      window.addEventListener(
        'pointerup',
        (e) => {
          if (down) log.maxDrag = Math.max(log.maxDrag, Math.hypot(e.clientX - down.x, e.clientY - down.y));
          down = null;
        },
        true,
      );
    });
  }
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  // 첫 안내 카드(1.6)는 overlays.flow.ts가 따로 확인한다. 터치만, 키보드만으로 하는 시험은 카드도 그 도구로 닫는다
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

const inputLog = (page: Page): Promise<InputLog> => page.evaluate(() => (window as unknown as { __input: InputLog }).__input);

/**
 * 작업대에 놓인 과제. H1·H2·H3은 열 수 있는 과제가 둘씩이라(H1 Q01·Q04, H2 Q02·Q03, H3 Q05·Q06) 정거장을 열면 과제 패널이 아니라
 * 정거장 안내창(#/s/<정거장>)이 먼저 뜨고(설계서 7.4, 7.7), 거기서 과제의 '열기'를 눌러 패널로 간다. 5단계 앞에는 작업대마다 과제가 하나라 바로 패널이 열렸다.
 */
interface QuestRef {
  station: string;
  questId: string;
  /** 안내창의 '열기'가 가리키는 주소(첫 판본) */
  hash: string;
  title: string;
}
const Q01: QuestRef = { station: 'H1', questId: 'pitch.same-note-two-clefs', hash: '#/q/pitch.same-note-two-clefs/middle-c', title: '같은 음의 자리 찾기' };
const Q04: QuestRef = { station: 'H1', questId: 'pitch.same-sound-different-names', hash: '#/q/pitch.same-sound-different-names/name-tags', title: '같은 높이의 다른 이름' };
const Q02: QuestRef = { station: 'H2', questId: 'rhythm.rest-in-a-bar', hash: '#/q/rhythm.rest-in-a-bar/quarter-rest', title: '쉼이 있는 한 마디' };
const Q03: QuestRef = { station: 'H2', questId: 'rhythm.short-notes-and-triplets', hash: '#/q/rhythm.short-notes-and-triplets/thirty-seconds-triplet', title: '짧은 음과 셋잇단음' };

/** 정거장 안내창이 떠 있다: 주소, 겹침 화면, 월드 멈춤 */
async function expectGuide(page: Page, station: string): Promise<void> {
  await page.waitForFunction((hh) => location.hash === hh, `#/s/${station}`, { timeout: 60000 });
  await page.waitForSelector(`[data-overlay="station-${station}"]`);
  expect((await status(page)).paused).toBe(true);
}

/** 안내창에서 과제의 '열기'를 연다: 눌러서(touch·mouse), 또는 Tab으로 그 '열기'까지 가서 Enter(keyboard) */
async function openFromGuide(page: Page, q: QuestRef, how: 'touch' | 'mouse' | 'keyboard'): Promise<void> {
  await expectGuide(page, q.station);
  const open = `.station-quest[data-quest="${q.questId}"] a.btn`;
  expect(await page.locator(open).getAttribute('href')).toBe(q.hash);
  if (how === 'touch') await page.locator(open).tap();
  else if (how === 'mouse') await page.locator(open).click();
  else {
    await tabToSelector(page, open, 8);
    await page.keyboard.press('Enter');
  }
}

describe('3-1 첫 화면은 마을이다', () => {
  it('열리면 월드가 뜨고 지역 이름과 메뉴가 보이며 오류가 없다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.title()).toContain('음악 마을');
    expect((await page.locator('.hud-region-name').textContent())?.trim()).toBe('음악 마을');
    for (const name of ['지도', '목록', '소리 켜기', '도움', '설정']) expect(await page.getByRole('button', { name: new RegExp(name) }).first().isVisible()).toBe(true);
    const s = await status(page);
    expect(s).toMatchObject({ ready: true, paused: false, walking: false, error: null, regionId: 'village', near: null });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  const SCREENS: Array<[string, number, number, number, number, number]> = [
    // [이름, 너비, 높이, 배율, 보이는 너비, 보이는 높이] — 설계서 7.1 표
    ['PC 1600×1000', 1600, 1000, 1.39, 1152, 720],
    ['노트북 1366×768', 1366, 768, 1.07, 1281, 720],
    ['태블릿 1280×800', 1280, 800, 1.11, 1152, 720],
    ['태블릿 1180×820', 1180, 820, 1.14, 1036, 720],
    ['휴대폰 세로 430×932', 430, 932, 0.8, 540, 1170],
  ];
  for (const [name, w, hgt, zoom, vw, vh] of SCREENS) {
    it(`7.1 보이는 범위: ${name} → 배율 ${zoom}, ${vw}×${vh}`, async () => {
      const { ctx, page, errors } = await boot({ w, h: hgt });
      await waitReady(page);
      await waitChunks(page);
      const d = await dbg(page);
      expect(d.zoom).toBeCloseTo(zoom, 2);
      expect(Math.round(d.view.w)).toBeCloseTo(vw, -0.5);
      expect(Math.abs(d.view.w - vw)).toBeLessThan(1.5);
      expect(Math.abs(d.view.h - vh)).toBeLessThan(1.5);
      // 보이는 범위 둘레(512 px 바깥까지)의 조각이 올라와 있다. 올라온 조각은 12장 이하다(10.5)
      expect(d.chunks.length).toBeGreaterThanOrEqual(4);
      expect(d.chunks.length).toBeLessThanOrEqual(12);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('3-2 걷기: 키보드, 누르기', () => {
  it('방향키를 누르는 동안 걷고, 떼면 멈춘다. 한글 자판의 물리 키(KeyD)도 같다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    const before = await pos(page);
    await page.keyboard.down('ArrowRight');
    await waitMoved(page, before, 80);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);
    const after = await pos(page);
    expect(after.x - before.x).toBeGreaterThan(80);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    expect(after.facing).toBe('right');
    await page.waitForTimeout(500);
    const later = await pos(page);
    expect(later.x).toBeCloseTo(after.x, 0); // 뗀 뒤에는 더 가지 않는다

    // W A S D: 물리 키로 읽는다(한글 자판에서도 같은 자리)
    await page.keyboard.down('KeyA');
    await waitMoved(page, later, 60);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(500);
    const left = await pos(page);
    expect(left.x).toBeLessThan(later.x - 60);
    expect(left.facing).toBe('left');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('빈 땅을 누르면 길을 찾아 걸어가고, 도착하면 멈춘다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    const start = await pos(page);
    const d = await dbg(page);
    const target = toScreen(d, start.x + 200, start.y); // 열린 땅(동쪽 200 px)
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.world.bridge.status.get().walking, undefined, { timeout: 5000 });
    await waitStopped(page);
    await page.waitForTimeout(200);
    const end = await pos(page);
    expect(Math.hypot(end.x - (start.x + 200), end.y - start.y)).toBeLessThan(30);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('3-4 정거장 열기', () => {
  it('정거장을 누르면 걸어가서 열고, Esc로 돌아오면 월드가 다시 움직인다 (H1 → 정거장 안내)', async () => {
    // H4(음계 디딤돌)와 H5(합주 무대)는 안내창이 아니라 설치물 모드로 들어간다(installation.flow.ts, stage.flow.ts). 안내창은 작업대 H1로 본다
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await pressWalkTo(page, 'H1', 'mouse');
    await page.waitForFunction(() => location.hash.startsWith('#/s/'), undefined, { timeout: 60000 });
    expect(await hashOf(page)).toBe('#/s/H1');
    await page.waitForSelector('[data-overlay="station-H1"]');
    expect((await page.locator('.overlay-main h1').textContent())?.trim()).toBe('음자리 작업대');
    // 열 수 있는 과제 둘이 '열기' 단추와 함께 보인다
    expect(await page.locator('.station-quest').count()).toBe(2);
    expect(await page.locator('.station-quest a.btn').count()).toBe(2);
    expect((await status(page)).paused).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    expect((await status(page)).paused).toBe(false);
    expect(await page.locator('[data-overlay]').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('설치물이 있는 정거장(E4 물레방아)은 E를 누르면 안내창이 아니라 설치물 모드로 들어가고, Esc로 나온다', async () => {
    // 이 시험은 3-4에서 E4가 '아직 만들지 않은 과제만 놓인 정거장'이던 때 안내창의 '준비 중'을 보았다. 6-6에서 E4에 물레방아와 Q19가 생긴 뒤로는
    // 설치물이 있는 정거장이 안내창보다 설치물 모드를 먼저 연다(App.tsx: installation.enter가 true면 안내창을 열지 않는다). 지금 빌드(미리보기 채널)는
    // 정거장 23곳에 놓인 과제가 모두 열려서 '준비 중'과 열기 단추 없음은 이 빌드의 어느 정거장 안내창에서도 볼 수 없다.
    // 그 모양은 단위 시험(station.test.ts, installation-controller.test.ts)이 지키고, 정식 공개 채널로 지은 화면에서 실제 Chrome으로 보는 일은 8단계에서 한다
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect(await teleport(page, 'E4')).toBe(true);
    await waitNear(page, 'E4', 20000);
    expect(await modeOf(page)).toBeNull();
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.world.bridge.installationMode.get() !== null, undefined, { timeout: 20000 });
    expect(await modeOf(page)).toEqual({ installationId: 'inst.beat-river.waterwheel', stationId: 'E4' });
    // 정거장 안내창은 뜨지 않고 주소도 정거장 주소로 바뀌지 않는다
    expect(await hashOf(page)).not.toMatch(/^#\/s\//);
    expect(await page.locator('[data-overlay="station-E4"]').count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.world.bridge.installationMode.get() === null, undefined, { timeout: 20000 });
    expect(await hashOf(page)).not.toMatch(/^#\/s\//);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('작업대 앞에서 E를 누르면 안내창이 열리고, 고른 과제의 패널이 열린다: H1 → Q01·Q04, H2 → Q02·Q03 (3-6)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    for (const [id, quests] of [
      ['H1', [Q01, Q04]],
      ['H2', [Q02, Q03]],
    ] as const) {
      expect(await teleport(page, id)).toBe(true);
      await waitNear(page, id, 10000);
      const chip = await page.locator('.hud-chip').textContent();
      expect(chip?.trim()).toMatch(/ · E 또는 누르기$/);
      for (const q of quests) {
        // E를 누르면 정거장 안내창이 먼저 뜨고, 그 정거장에 놓인 과제가 차례대로 '열기'와 함께 보인다
        await page.keyboard.press('KeyE');
        await expectGuide(page, id);
        expect(await page.locator('.station-quest').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.quest))).toEqual(quests.map((x) => x.questId));
        expect(await page.locator('.station-quest a.btn').evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(quests.map((x) => x.hash));
        // 과제의 '열기'를 누르면 그 패널이 열린다
        await page.locator(`.station-quest[data-quest="${q.questId}"] a.btn`).click();
        await page.waitForFunction((hh) => location.hash === hh, q.hash, { timeout: 10000 });
        await page.waitForSelector('.panel-shell h1');
        expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe(q.title);
        expect((await status(page)).paused).toBe(true);
        // 패널을 닫으면 월드로 돌아온다(안내창은 거치지 않는다: 안내창의 '열기'는 주소 이동이라 앱 안의 기록으로 세지 않는다)
        await page.keyboard.press('Escape');
        await page.waitForSelector('.hud');
        await page.waitForFunction(() => !(window as unknown as { __game: Game }).__game.world.bridge.status.get().paused, undefined, { timeout: 10000 });
        expect(await hashOf(page)).toBe('#/');
      }
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('안내 칩을 눌러도 열린다 (H1)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await teleport(page, 'H1');
    await waitNear(page, 'H1', 10000);
    await page.locator('.hud-chip').click();
    await page.waitForFunction(() => location.hash === '#/s/H1', undefined, { timeout: 10000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('W-1 처음 열린 마을에서 걸어서 Q01과 Q02에 닿는다', () => {
  it('H1까지 걷고(안내 칩), 안내창에서 열고, 돌아와 H2까지 걷고, 연다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await command(page, { type: 'walk-to-station', stationId: 'H1' });
    await waitNear(page, 'H1');
    await page.keyboard.press('KeyE');
    await openFromGuide(page, Q01, 'mouse');
    await page.waitForFunction((hh) => location.hash === hh, Q01.hash, { timeout: 10000 });
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe(Q01.title);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    await command(page, { type: 'walk-to-station', stationId: 'H2' });
    await waitNear(page, 'H2');
    await page.keyboard.press('Enter');
    await openFromGuide(page, Q02, 'keyboard');
    await page.waitForFunction((hh) => location.hash === hh, Q02.hash, { timeout: 10000 });
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe(Q02.title);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('W-2 주소로 바로 연다', () => {
  it('#/q/…는 월드를 기다리지 않고 열리고, 돌아가면 월드가 뜬다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/q/rhythm.rest-in-a-bar/quarter-rest' });
    await page.waitForSelector('.panel-shell h1');
    expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe('쉼이 있는 한 마디');
    expect(await page.locator('canvas').count()).toBe(0); // Phaser는 아직 불러오지도 않았다
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    await waitReady(page);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('7.5 화면 상태와 단축키', () => {
  it('L은 목록, M은 지도, 다시 누르거나 Esc로 닫는다. 목록은 걷지 않고 모든 도전을 연다(W-2)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await page.keyboard.press('KeyL');
    await page.waitForFunction(() => location.hash === '#/list');
    expect(await page.locator('.quest-card').count()).toBe(QUEST_COUNT);
    expect((await status(page)).paused).toBe(true);
    await page.keyboard.press('KeyL'); // 다시 누르면 닫는다
    await page.waitForSelector('.hud');
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => location.hash === '#/map');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    expect((await status(page)).paused).toBe(false);
    // 도움은 버튼으로
    await page.getByRole('button', { name: /도움/ }).first().click();
    await page.waitForFunction(() => location.hash === '#/help');
    expect((await page.locator('.overlay-main h1').textContent())?.trim()).toBe('조작 안내');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('겹침 화면이 열려 있는 동안 방향키는 캐릭터를 움직이지 않는다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    const before = await pos(page);
    await page.keyboard.press('KeyL');
    await page.waitForFunction(() => location.hash === '#/list');
    // 주소가 바뀐 때와 월드가 멈춘 때는 같지 않다: 월드는 화면이 그려진 다음에 멈춘다(App의 useEffect). 멈춘 것을 보고 나서 방향키를 누른다.
    // 보지 않고 누르면 멈추기 전의 한 프레임(약 3.6px)이 움직여 시험이 실패한다(8-4의 흐름 시험에서 한 번 있었다)
    await until(() => status(page), (s) => s.paused, '겹침 화면이 열리고 월드가 멈춤');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    const after = await pos(page);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// 캐릭터의 보라(9.2): 캐릭터에만 쓰는 색이라서 이 색의 픽셀 수가 곧 '캐릭터가 보이는 정도'다.
// D-310부터 캐릭터는 그림이다. 보라는 베레모(#755675)와 웃옷(#8E6E91), 그 그늘과 볕에 있다. 셀 셰이딩과 구운 그림의 축소 때문에 한 색이 아니라
// 색상 285–340°, 채도 0.12 이상, 밝기 0.18–0.62인 점을 센다. 바닥의 연보라 들꽃(밝기 0.85 남짓)과 다른 지역의 연보라 강조색은 들지 않는다.
// 잰 값(1280×800, 배율 1.11, tree-village-1): 앞에 섰을 때 캐릭터 둘레에서 441점(화면 전체도 441점), 뒤에 섰을 때 0점.
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');

const isCharacterPurple = (r: number, g: number, b: number): boolean => {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return false;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = (max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60;
  return h >= 285 && h <= 340 && s >= 0.12 && l >= 0.18 && l <= 0.62;
};

/** 화면(또는 clip)에서 캐릭터의 보라인 픽셀을 센다 */
async function markerPixels(page: Page, clip?: { x: number; y: number; width: number; height: number }): Promise<number> {
  const png = await page.screenshot(clip ? { clip } : {});
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (isCharacterPurple(data[i]!, data[i + 1]!, data[i + 2]!)) n++;
  return n;
}

/** 값이 조건을 채울 때까지 읽는다. 느린 헤드리스 Chrome에서는 시간이 아니라 상태로 기다린다 */
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string, timeout = 30000): Promise<T> {
  const end = Date.now() + timeout;
  let last: T | undefined;
  while (Date.now() < end) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`시간 안에 ${what}: 마지막 값 ${JSON.stringify(last)}`);
}

describe('3-5 사물 겹침: 나무 뒤로 지나가면 가려진다', () => {
  it('캐릭터가 나무 줄기 남쪽(앞)에 서면 보이고, 북쪽(뒤)에 서면 나무가 가린다', async () => {
    const { ctx, page, errors } = await boot({ reduced: true }); // 움직임 줄이기: 바로 옮기기에 어두워지는 단계가 없다
    await waitReady(page);
    await waitChunks(page);
    const tree = WORLD_OBJECTS.find((o) => o.id === 'tree-village-1')!;
    fs.mkdirSync(SHOTS, { recursive: true });

    /** (x, y)에 서서 카메라가 따라올 때까지 기다리고, 캐릭터 그림 전체(발에서 위로 70 px, 좌우 30 px) 둘레의 clip을 돌려준다 */
    const standAt = async (x: number, y: number) => {
      await command(page, { type: 'teleport', x, y });
      await until(() => pos(page), (p) => Math.hypot(p.x - x, p.y - y) < 1, `캐릭터가 (${x}, ${y})에 선다`);
      const d = await until(() => dbg(page), (v) => Math.abs(v.center.x - x) < 2 && Math.abs(v.center.y - y) < 2, '카메라가 따라온다');
      const at = toScreen(d, x, y);
      const z = d.zoom;
      return { d, clip: { x: Math.round(at.x - 30 * z), y: Math.round(at.y - 70 * z), width: Math.round(60 * z), height: Math.round(76 * z) } };
    };
    const evidence = async (name: string, d: Dbg) => {
      const at = toScreen(d, tree.x, tree.y);
      await page.screenshot({ path: path.join(SHOTS, name), clip: { x: Math.max(0, Math.round(at.x) - 200), y: Math.max(0, Math.round(at.y) - 160), width: 400, height: 320 } });
    };

    // 앞: 줄기 남쪽 70 px. 캐릭터 전체(보라 베레모와 웃옷)가 보인다
    const front = await standAt(tree.x, tree.sortY + 70);
    const frontSeen = await until(() => markerPixels(page, front.clip), (n) => n >= 250, '캐릭터가 보인다');
    expect(front.d.playerDepth).toBeGreaterThan(tree.sortY); // 캐릭터가 나무보다 나중에 그려진다
    await evidence('phase3-tree-front.png', front.d);

    // 뒤: 줄기 북쪽 70 px(캐노피 아래). 나무가 위에 그려져 캐릭터가 거의 보이지 않는다
    const behind = await standAt(tree.x, tree.sortY - 70);
    const hidden = await until(() => markerPixels(page, behind.clip), (n) => n <= 20, '나무가 캐릭터를 가린다');
    const hiddenAnywhere = await markerPixels(page); // 다른 곳에 보이는 것이 아니라 화면 어디에도 없다
    expect(hiddenAnywhere).toBeLessThanOrEqual(20);
    expect(behind.d.playerDepth).toBeLessThan(tree.sortY); // 나무가 캐릭터보다 나중에 그려진다
    await evidence('phase3-tree-behind.png', behind.d);

    expect(frontSeen).toBeGreaterThan(hidden * 20);

    // 다시 앞으로 나오면 곧바로 다시 보인다(가려진 채로 남지 않는다)
    const again = await standAt(tree.x, tree.sortY + 70);
    await until(() => markerPixels(page, again.clip), (n) => n >= 250, '다시 나오면 캐릭터가 보인다');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('7.9 5번 움직임 줄이기: 걷는 중 위아래 흔들림이 없다', () => {
  /** 오른쪽으로 걷는 동안 흔들림(그린 y − 월드 y)을 여러 번 읽어 가장 큰 값과, 실제로 걸은 거리를 돌려준다 */
  async function walkAndSample(reduced: boolean): Promise<{ maxBob: number; walked: number; samples: number }> {
    const { ctx, page, errors } = await boot({ reduced });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    await page.keyboard.down('ArrowRight');
    let maxBob = 0;
    let samples = 0;
    let walked = 0;
    // 시간이 아니라 걸은 거리로 끝낸다. 3초로 끊으면 느리거나 바쁜 기계에서 그리는 틀이 모자라 거의 걷지 못한 채 끝난다(전체 시험이 도는 동안 40 px만 걸은 적이 있다).
    // 시작 자리 오른쪽에는 290 px쯤 가서야 막힌 곳이 있으니, 160 px를 걸을 때까지 읽는다
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && (walked < 160 || samples < 30)) {
      maxBob = Math.max(maxBob, Math.abs(await bobOf(page)));
      samples++;
      const now = await pos(page);
      walked = Math.hypot(now.x - from.x, now.y - from.y);
    }
    await page.keyboard.up('ArrowRight');
    const to = await pos(page);
    expect(errors).toEqual([]);
    await ctx.close();
    return { maxBob, walked: Math.hypot(to.x - from.x, to.y - from.y), samples };
  }

  it('보통: 걷는 동안 캐릭터가 위아래로 흔들린다(이 측정이 흔들림을 잡아낸다는 대조)', async () => {
    const r = await walkAndSample(false);
    expect(r.walked).toBeGreaterThan(80);
    expect(r.samples).toBeGreaterThan(10);
    expect(r.maxBob).toBeGreaterThan(0.5);
  });

  it('움직임 줄이기: 같은 방식으로 걸어도 그린 y와 월드 y가 같다', async () => {
    const r = await walkAndSample(true);
    expect(r.walked).toBeGreaterThan(80);
    expect(r.samples).toBeGreaterThan(10);
    expect(r.maxBob).toBeLessThan(0.01);
  });
});

describe('7.6 세로 화면: 탭 막대와 64 px 상호작용 단추 (시안 B03)', () => {
  it('아래 탭 막대가 보이고, 정거장 곁에서 상호작용 단추가 뜨며, 누르면 연다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true });
    await waitReady(page);
    expect(await page.locator('.hud-tabs').isVisible()).toBe(true);
    expect(await page.locator('.hud-tab').count()).toBe(4);
    const tab = await page.locator('.hud-tab').first().boundingBox();
    expect(tab!.height).toBeGreaterThanOrEqual(64);
    expect(await page.locator('.hud-interact').isVisible()).toBe(false); // 곁에 정거장이 없다
    await teleport(page, 'H1');
    await waitNear(page, 'H1', 10000);
    await page.waitForSelector('.hud-interact', { state: 'visible' });
    const box = await page.locator('.hud-interact').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(64);
    expect(box!.height).toBeGreaterThanOrEqual(64);
    // 터치 화면의 안내 칩에는 'E'가 없다
    expect((await page.locator('.hud-chip').textContent())?.trim()).toBe('음자리 작업대 · 누르기');
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForFunction(() => location.hash === '#/s/H1', undefined, { timeout: 10000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('W-11 마을은 소리를 켜기 전까지 조용하다', () => {
  it('열고, 걷고, 지도와 목록을 열어도 오디오 장치가 만들어지지 않는다. 메뉴의 소리 켜기를 누르면 그때 켜진다', async () => {
    const { ctx, page, errors } = await boot({ audio: true });
    await waitReady(page);
    await waitChunks(page);
    const count = (): Promise<number> => page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length);
    expect(await count()).toBe(0);
    expect(await page.locator('.hud .sound-status').getAttribute('data-sound-state')).toBe('off');
    const before = await pos(page);
    await page.keyboard.down('ArrowRight');
    await waitMoved(page, before, 60);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => location.hash === '#/map');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    await page.keyboard.press('KeyL');
    await page.waitForFunction(() => location.hash === '#/list');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    expect(await count()).toBe(0);
    await page.locator('.hud-menu').getByRole('button', { name: '소리 켜기' }).click();
    await page.waitForSelector('.hud .sound-status[data-sound-state="on"]', { state: 'attached', timeout: 15000 });
    expect(await count()).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts[0]!.state)).toBe('running');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// W-4 조작 대체(12.6의 단계 완료 기준을 Q01과 Q02로): 새 저장의 마을에서 출발해, 마우스 클릭만(끌기 없이), 키보드만, 터치만으로
// 정거장까지 걸어가 열고 끝까지 풀고 돌아온다. 입력 기록(boot의 log)이 '다른 도구를 쓰지 않았다'는 것을 시험이 스스로 확인한다.

const NAV = NavGrid.fromRows(NAV_ROWS);
/** 누르기 영역 둘레 24 px까지 그 정거장을 누른 것으로 보므로(world-interact) 땅을 누를 때는 그 둘레도 피한다 */
const HIT_AVOID = 24 + 8;

const inAnyHit = (x: number, y: number): boolean =>
  Object.values(STATION_HITS).some((r) => x >= r.x - HIT_AVOID && x <= r.x + r.w + HIT_AVOID && y >= r.y - HIT_AVOID && y <= r.y + r.h + HIT_AVOID);

/** 화면 점마다 '캔버스가 직접 받는가'(메뉴 단추나 안내 칩이 덮고 있지 않은가)를 돌려준다 */
const onCanvas = (page: Page, pts: ReadonlyArray<{ x: number; y: number }>): Promise<boolean[]> =>
  page.evaluate((list) => list.map((p) => document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS'), pts as Array<{ x: number; y: number }>);

interface TapPlan {
  kind: 'station' | 'ground';
  screen: { x: number; y: number };
}

/**
 * 한 번 누를 곳을 고른다. 정거장의 누르기 영역이 화면에 보이면 그 안의 점(가운데에 가까운 것)이고,
 * 아니면 정거장 쪽으로 충분히 다가가는 열린 땅(다른 정거장의 영역이나 막힌 곳이 아닌, 여기서 걸어 닿는 곳)이다.
 */
async function planTap(page: Page, id: string): Promise<TapPlan> {
  const hit = STATION_HITS[id]!;
  const d = await dbg(page);
  const me = await pos(page);
  const inView = (x: number, y: number): boolean => x >= d.view.x + 4 && x <= d.view.x + d.view.w - 4 && y >= d.view.y + 4 && y <= d.view.y + d.view.h - 4;
  const cx = hit.x + hit.w / 2;
  const cy = hit.y + hit.h / 2;

  const inside: Array<{ x: number; y: number }> = [];
  for (let wx = hit.x + 12; wx <= hit.x + hit.w - 12; wx += 24) for (let wy = hit.y + 12; wy <= hit.y + hit.h - 12; wy += 24) if (inView(wx, wy)) inside.push({ x: wx, y: wy });
  inside.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const stationShots = inside.slice(0, 40).map((p) => toScreen(d, p.x, p.y));
  if (stationShots.length > 0) {
    const free = await onCanvas(page, stationShots);
    const i = free.findIndex(Boolean);
    if (i >= 0) return { kind: 'station', screen: stationShots[i]! };
  }

  const reach = reachableFrom(NAV, me);
  const dist = Math.hypot(cx - me.x, cy - me.y);
  const base = Math.atan2(cy - me.y, cx - me.x);
  const reach1 = Math.min(d.view.w, d.view.h);
  const cands: Array<{ x: number; y: number; left: number }> = [];
  for (const frac of [0.5, 0.35, 0.22]) {
    for (const turn of [0, 25, -25, 50, -50, 75, -75, 100, -100]) {
      const a = base + (turn * Math.PI) / 180;
      const x = me.x + Math.cos(a) * reach1 * frac;
      const y = me.y + Math.sin(a) * reach1 * frac;
      if (!inView(x, y) || NAV.circleHitsBlocked(x, y) || inAnyHit(x, y)) continue;
      const c = NAV.cellOf(x, y);
      if (!reach[c.cy * NAV.cols + c.cx]) continue;
      const left = Math.hypot(cx - x, cy - y);
      if (dist - left < 60) continue; // 정거장에 충분히 다가가는 점만
      cands.push({ x, y, left });
    }
  }
  cands.sort((a, b) => a.left - b.left);
  const groundShots = cands.slice(0, 16).map((p) => toScreen(d, p.x, p.y));
  const free = await onCanvas(page, groundShots);
  const i = free.findIndex(Boolean);
  if (i < 0) throw new Error(`${id} 쪽으로 누를 열린 땅을 찾지 못했어요(내 자리 ${Math.round(me.x)}, ${Math.round(me.y)})`);
  return { kind: 'ground', screen: groundShots[i]! };
}

/** 정거장까지 누르기만으로 간다: 열린 땅을 짧게 눌러 걷다가, 정거장의 누르기 영역이 보이면 그곳을 누른다. 땅을 누른 횟수를 돌려준다 */
async function pressWalkTo(page: Page, id: string, how: Pointer, maxPresses = 14): Promise<{ groundPresses: number }> {
  let groundPresses = 0;
  for (let i = 0; i < maxPresses; i++) {
    const plan = await planTap(page, id);
    if (how === 'touch') await page.touchscreen.tap(plan.screen.x, plan.screen.y);
    else await page.mouse.click(plan.screen.x, plan.screen.y);
    if (plan.kind === 'station') return { groundPresses };
    groundPresses++;
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.world.bridge.status.get().walking, undefined, { timeout: 10000 });
    await waitStopped(page);
  }
  throw new Error(`${maxPresses}번 눌러도 ${id}의 누르기 영역에 닿지 못했어요`);
}

const selectedStation = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector('.map-marker.is-selected')?.getAttribute('data-station') ?? null);

/** Tab으로 CSS 선택자에 맞는 곳에 초점이 닿을 때까지 간다. 몇 번 눌렀는지 돌려준다 */
async function tabToSelector(page: Page, selector: string, max: number): Promise<number> {
  for (let i = 0; i <= max; i++) {
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector)) return i;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab ${max}번 안에 '${selector}'에 닿지 못했어요`);
}

/** 키보드만으로 정거장 앞까지 걸어간다: M → Tab → 방향키로 정거장 고르기 → Tab → Enter(걸어가기) → 도착을 기다린다 */
async function keyboardWalkTo(page: Page, id: string): Promise<void> {
  await page.keyboard.press('KeyM');
  await page.waitForSelector('.map-marker');
  await tabToSelector(page, '.map-marker[aria-pressed="true"]', 3); // 첫 Tab은 고른 정거장 표시에 닿는다(표시 23개를 모두 거치지 않는다)
  const target = STATION_HITS[id]!;
  for (let i = 0; i < 16 && (await selectedStation(page)) !== id; i++) {
    const here = STATION_HITS[(await selectedStation(page))!]!;
    const dx = target.x + target.w / 2 - (here.x + here.w / 2);
    const dy = target.y + target.h / 2 - (here.y + here.h / 2);
    await page.keyboard.press(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp');
  }
  expect(await selectedStation(page)).toBe(id);
  await tabToSelector(page, '[data-action="walk"]', 40);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#/');
  await page.waitForSelector('.hud');
  await waitNear(page, id, 90000);
}

/** 입력 기록이 말하는 것: 쓰지 않은 도구는 정말 쓰지 않았다 */
async function expectOnly(page: Page, how: 'mouse' | 'touch' | 'keyboard', min: number): Promise<void> {
  const log = await inputLog(page);
  if (how === 'keyboard') {
    expect(log.downs).toBe(0); // 마우스도 손가락도 한 번도 대지 않았다
    expect(log.types).toEqual([]);
    expect(log.keys).toBeGreaterThanOrEqual(min);
    return;
  }
  expect(log.keys).toBe(0);
  expect(log.types).toEqual([how]);
  expect(log.downs).toBeGreaterThanOrEqual(min);
  expect(log.maxDrag).toBeLessThan(12); // 끌지 않았다
}

/** 걸어가는 길 시험은 느린 헤드리스 Chrome에서 길다(먼 정거장까지 걷고 패널을 끝낸다). 기본 90초보다 넉넉히 둔다 */
const ROUTE_TIMEOUT = 150_000;

/** 패널이 열렸는지(주소, 제목, 월드 멈춤)와 시작 자리에서 충분히 걸어왔는지 */
async function expectPanelOpened(page: Page, q: QuestRef, from: { x: number; y: number }): Promise<void> {
  await page.waitForFunction((hh) => location.hash === hh, q.hash, { timeout: 60000 });
  await page.waitForSelector('.panel-shell h1');
  expect((await page.locator('.panel-shell h1').first().textContent())?.trim()).toBe(q.title);
  expect((await status(page)).paused).toBe(true);
  const now = await pos(page);
  expect(Math.hypot(now.x - from.x, now.y - from.y)).toBeGreaterThan(500); // 시작 자리에서 걸어왔다
}

/** 돌아가면 월드가 다시 움직인다 */
async function expectBackInWorld(page: Page): Promise<void> {
  await page.waitForSelector('.hud');
  await page.waitForFunction(() => !(window as unknown as { __game: Game }).__game.world.bridge.status.get().paused, undefined, { timeout: 10000 });
  expect(await page.locator('.panel-shell').count()).toBe(0);
}

describe('W-4 터치만으로: 새 저장의 마을에서 걸어가 도전을 끝낸다 (Q01, Q02)', () => {
  it('대조: 입력 기록은 키 누름, 마우스, 끌기를 잡아낸다(이 묶음의 \'터치뿐\' 확인이 비어 있지 않다는 증거)', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await waitReady(page);
    await page.keyboard.press('KeyA');
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(380, 340, { steps: 4 });
    await page.mouse.up();
    const log = await inputLog(page);
    expect(log.keys).toBeGreaterThanOrEqual(1);
    expect(log.types).toContain('mouse');
    expect(log.maxDrag).toBeGreaterThan(50);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('태블릿 가로(1180×820) · Q01: 눌러서 H1까지 걷고, 열고, 오선을 눌러 통과하고, 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ w: 1180, h: 820, touch: true, log: true });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    const { groundPresses } = await pressWalkTo(page, Q01.station, 'touch');
    expect(groundPresses).toBeGreaterThanOrEqual(1); // 시작 자리에서는 H1이 화면에 보이지 않는다(먼 곳은 땅을 눌러 걷는다)
    await openFromGuide(page, Q01, 'touch'); // 작업대마다 과제가 둘이라 안내창이 먼저 뜬다
    await expectPanelOpened(page, Q01, from);
    await completeQ01(page, 'touch');
    await page.getByRole('button', { name: /돌아가기/ }).first().tap();
    await expectBackInWorld(page);
    await expectOnly(page, 'touch', 8);
    expect(errors).toEqual([]);
    await ctx.close();
  }, ROUTE_TIMEOUT);

  it('휴대폰 세로(430×932) · Q02: 눌러서 H2까지 걷고, 열고, 칸을 눌러 통과하고, 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ w: 430, h: 932, touch: true, log: true });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    const { groundPresses } = await pressWalkTo(page, Q02.station, 'touch');
    expect(groundPresses).toBeGreaterThanOrEqual(1);
    await openFromGuide(page, Q02, 'touch'); // 작업대마다 과제가 둘이라 안내창이 먼저 뜬다
    await expectPanelOpened(page, Q02, from);
    await completeQ02(page, 'touch');
    await page.getByRole('button', { name: /돌아가기/ }).first().tap();
    await expectBackInWorld(page);
    await expectOnly(page, 'touch', 12);
    expect(errors).toEqual([]);
    await ctx.close();
  }, ROUTE_TIMEOUT);
});

describe('W-4 마우스 클릭만(끌기 없이): 새 저장의 마을에서 걸어가 도전을 끝낸다 (Q01, Q02)', () => {
  it('Q01: 클릭으로 H1까지 걷고, 열고, 오선을 눌러 통과하고, 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    const { groundPresses } = await pressWalkTo(page, Q01.station, 'mouse');
    expect(groundPresses).toBeGreaterThanOrEqual(1);
    await openFromGuide(page, Q01, 'mouse'); // 작업대마다 과제가 둘이라 안내창이 먼저 뜬다
    await expectPanelOpened(page, Q01, from);
    await completeQ01(page, 'mouse');
    await page.getByRole('button', { name: /돌아가기/ }).first().click();
    await expectBackInWorld(page);
    await expectOnly(page, 'mouse', 8);
    expect(errors).toEqual([]);
    await ctx.close();
  }, ROUTE_TIMEOUT);

  it('Q02: 클릭으로 H2까지 걷고, 열고, 칸을 눌러 통과하고, 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ log: true });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    const { groundPresses } = await pressWalkTo(page, Q02.station, 'mouse');
    expect(groundPresses).toBeGreaterThanOrEqual(1);
    await openFromGuide(page, Q02, 'mouse'); // 작업대마다 과제가 둘이라 안내창이 먼저 뜬다
    await expectPanelOpened(page, Q02, from);
    await completeQ02(page, 'mouse');
    await page.getByRole('button', { name: /돌아가기/ }).first().click();
    await expectBackInWorld(page);
    await expectOnly(page, 'mouse', 12);
    expect(errors).toEqual([]);
    await ctx.close();
  }, ROUTE_TIMEOUT);
});

describe('W-4 키보드만: 새 저장의 마을에서 걸어가 도전을 끝낸다 (Q01, Q02)', () => {
  it('Q01: 지도(M)에서 H1을 골라 걸어가고, E로 열고, Tab·Enter·방향키로 통과하고, Esc로 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    await keyboardWalkTo(page, Q01.station);
    await page.keyboard.press('KeyE');
    await openFromGuide(page, Q01, 'keyboard'); // 작업대마다 과제가 둘이라 안내창이 먼저 뜬다
    await expectPanelOpened(page, Q01, from);
    await completeQ01Keyboard(page);
    await page.keyboard.press('Escape');
    await expectBackInWorld(page);
    await expectOnly(page, 'keyboard', 20);
    expect(errors).toEqual([]);
    await ctx.close();
  }, ROUTE_TIMEOUT);

  it('Q02: 지도(M)에서 H2를 골라 걸어가고, E로 열고, Tab·Space·Enter로 통과하고, Esc로 돌아온다', async () => {
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await waitReady(page);
    await waitChunks(page);
    const from = await pos(page);
    await keyboardWalkTo(page, Q02.station);
    await page.keyboard.press('KeyE');
    await openFromGuide(page, Q02, 'keyboard'); // 작업대마다 과제가 둘이라 안내창이 먼저 뜬다
    await expectPanelOpened(page, Q02, from);
    await completeQ02Keyboard(page);
    await page.keyboard.press('Escape');
    await expectBackInWorld(page);
    await expectOnly(page, 'keyboard', 20);
    expect(errors).toEqual([]);
    await ctx.close();
  }, ROUTE_TIMEOUT);
});
