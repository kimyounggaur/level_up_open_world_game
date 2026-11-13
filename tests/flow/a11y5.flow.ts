// 5단계 접근성 시험(실제 Chrome, 5-8): 5-6과 5-7이 더한 화면을 설계서 7.9의 여덟 항목으로 본다.
//   새 화면: 소리 조각과 쪽지(표식, 알림, 쪽지 카드), 합주 무대의 자유 가락(표지판, 패널의 곡 저장과 소리 조각 재료함), 수첩의 발견·내 곡 쪽, 잔치 카드.
//   1 키보드만 · 2 손가락만(끌지 않기) · 3 확대 200%(폭 640) · 4 색 없이 구분 · 5 움직임 줄이기 · 6 소리 없이 · 7 글자 대비 4.5:1 · 8 이름과 48 px
// 사람만 볼 수 있는 것(화면 낭독기가 실제로 읽는 소리, 실제 기기, 눈으로 보는 회색조 화면)은 사람 확인 대기로 남긴다(docs/approvals.md).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freeHashFor } from '../../src/domain/content';
import { BOARD_SPOT, foundNews } from '../../src/domain/discovery';
import { FESTIVAL_SILENT_TEXT } from '../../src/domain/festival';
import { axReport, clipReport, contrastFails, contrastReport, controlsReport, focusRing, focusedOutside, labelMismatch, motionReport, overflowReport, tabToSel, waitFocus, waitFocusWithin } from './a11yTools';
import { command, dbg, drawnOf, status, teleport, toScreen, waitChunks, waitFramed, waitNear, waitReady } from './game';
import { collectErrors, startHarness, type Harness } from './harness';
import { audioContextCount, inputLog } from './inputTools';
import { INST_ID, ITEMS, KEY_CURRENT, KEY_EMERGENCY, NOTES, PIECES, SONG, boot as bootVillage, idbRead, idbWrite, notebookTab, openFestival, saved, seedSave, seedSong, spotOf, squash, standBy, until, type BootOptions, type Item } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const boot = (opts: BootOptions = {}) => bootVillage(h, opts);
const LONG = 300_000;
const P1 = PIECES[0]!;
const N1 = NOTES[0]!;
const at = (i: Item): { id: string; x: number; y: number } => ({ id: i.discoveryId, x: i.x, y: i.y });

// ---------------------------------------------------------------------------
// 1번 키보드만으로

describe('7.9 1번 키보드만으로', () => {
  it('쪽지 카드: E로 열면 닫기에 초점이 가고 Tab이 카드 밖으로 나가지 않으며, Esc로 닫는다. 수첩의 발견 쪽에서 이어진 도전에도 키보드로 닿는다', async () => {
    const { ctx, page, errors } = await boot({ log: true, audio: true, intro: 'key' });
    await waitReady(page);
    await waitChunks(page);
    await standBy(page, at(N1));
    expect((await status(page)).near).toMatchObject({ stationId: N1.discoveryId, spot: 'discovery' });
    await page.keyboard.press('KeyE');
    const card = page.locator(`[data-note-card="${N1.discoveryId}"]`);
    await card.waitFor();
    // 열리면 닫기 단추에 초점이 있고, 초점 표시가 그려져 있다
    await waitFocus(page, '[data-note-card] .btn-primary', '쪽지 카드가 떴을 때(닫기 단추)');
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('닫기');
    expect(await focusRing(page)).toMatchObject({ ok: true });
    // 뒤의 막대는 inert라서 Tab은 카드 안에서만 돈다
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await focusedOutside(page, '[data-note-card]'), `Tab ${i + 1}번째`).toBeNull();
    }
    await page.keyboard.press('Escape');
    await card.waitFor({ state: 'detached' });
    await until(() => status(page), (s) => !s.paused, '월드가 다시 움직인다');

    // 수첩의 발견 쪽: 쪽 탭에 Tab으로 닿고 → 로 넘긴다
    await page.keyboard.press('KeyN');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await tabToSel(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]', { max: 14 });
    for (let i = 0; i < 14 && (await notebookTab(page)) !== '발견'; i++) await page.keyboard.press('ArrowRight');
    expect(await notebookTab(page)).toBe('발견');
    // 찾은 쪽지의 '이어진 도전 열기'에 Tab으로 닿아 Enter로 연다
    await tabToSel(page, `[data-discovery="${N1.discoveryId}"] [data-related]`, { max: 14 });
    expect(await focusRing(page)).toMatchObject({ ok: true });
    await page.keyboard.press('Enter');
    await page.waitForFunction((q) => location.hash.startsWith(`#/q/${q}/`), N1.questId!, { timeout: 15000 });

    // 이 모든 것을 마우스 없이 했고, 소리는 한 번도 켜지 않았다
    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(log.maxDrag).toBe(0);
    expect(log.keys).toBeGreaterThan(14);
    expect(await audioContextCount(page)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it(
    '소리 조각을 찾고, 합주 무대에서 자유 가락에 놓아 곡으로 저장하고, 수첩에서 이름을 바꾸고, 표지판으로 내 곡과 잔치를 연다 (마우스와 소리 없이)',
    async () => {
      const { ctx, page, errors } = await boot({ log: true, audio: true, intro: 'key' });
      await waitReady(page);
      await waitChunks(page);

      // 소리 조각: 가까이 서서 E. 알림은 사실만 말한다
      await standBy(page, at(P1));
      expect((await status(page)).near).toMatchObject({ stationId: P1.discoveryId, spot: 'discovery' });
      await page.keyboard.press('KeyE');
      await until(() => spotOf(page, P1.discoveryId), (s) => s?.found === true, '소리 조각을 찾은 표식이 된다');
      expect((await page.locator('[data-news] p').allInnerTexts()).map(squash)).toEqual(foundNews(P1));

      // 합주 무대: H5 앞에서 E. 처음에는 자유 가락이 골라져 있다
      expect(await teleport(page, 'H5')).toBe(true);
      await waitNear(page, 'H5', 20000);
      await page.keyboard.press('KeyE');
      await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
      expect(squash(await page.locator('[data-sign-toggle]').innerText())).toContain('자유 가락');
      // → 로 1마디를 고르고 Enter로 패널에서 연다
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.inst-hand')?.getAttribute('data-selected-measure') === '0', undefined, { timeout: 15000 });
      await page.keyboard.press('Enter');
      await page.waitForFunction((hash) => location.hash === hash, freeHashFor(INST_ID), { timeout: 15000 });
      await page.waitForSelector('[data-melody-save]');

      // 찾은 소리 조각을 1마디에 놓는다: Tab으로 닿아 Enter
      await tabToSel(page, `[data-piece-place="${P1.discoveryId}"]`, { max: 260 });
      expect(await focusRing(page)).toMatchObject({ ok: true });
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-piece-note]');
      expect(squash(await page.locator('[data-piece-note]').innerText())).toContain('1마디에 놓았어요');
      // 이름 칸으로 거꾸로(Shift+Tab) 돌아가 이름을 쓰고 Enter로 저장한다
      await tabToSel(page, '.melody-name-input', { max: 60, back: true });
      expect(await focusRing(page)).toMatchObject({ ok: true });
      await page.keyboard.type('키보드 곡');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-melody-status="ok"]');
      const mine = await until(async () => (await saved(page))?.explorationState.creations ?? [], (v) => v.length === 1, '곡이 저장에 적힌다');
      expect(mine[0]!.name).toBe('키보드 곡');
      const cid = mine[0]!.creationId;

      // Esc: 글을 쓰던 칸에서도 무대로 돌아온다
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });

      // 수첩의 내 곡 쪽: 이름 바꾸기 칸에 초점이 가고, 저장하면 결과 글로 초점이 간다
      await page.keyboard.press('KeyN');
      await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
      await tabToSel(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]', { max: 14 });
      for (let i = 0; i < 14 && (await notebookTab(page)) !== '내 곡'; i++) await page.keyboard.press('ArrowRight');
      expect(await notebookTab(page)).toBe('내 곡');
      await tabToSel(page, `[data-creation="${cid}"] [data-rename]`, { max: 14 });
      await page.keyboard.press('Enter');
      await waitFocus(page, '.melody-name-input', '이름 바꾸기를 열었을 때');
      await page.keyboard.type('다시 이름');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-creation-status="ok"]');
      await waitFocus(page, '[data-creation-status]', '이름을 바꾼 뒤(결과 글)');
      await until(async () => (await saved(page))?.explorationState.creations[0]?.name, (n) => n === '다시 이름', '바꾼 이름이 저장에 적힌다');

      // 수첩을 닫고 무대의 표지판으로: 내 곡 다시 듣기, 잔치 열기
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-overlay="notebook"]', { state: 'detached' });
      await page.waitForSelector('[data-installation-hud][data-stage="true"]');
      const pickSign = async (key: string): Promise<void> => {
        await tabToSel(page, '[data-sign-toggle]', { max: 90 });
        await page.keyboard.press('Enter');
        await page.waitForSelector('#inst-sign-list');
        for (let i = 0; i < 14; i++) {
          if ((await page.evaluate(() => document.activeElement?.getAttribute('data-sign') ?? null)) === key) break;
          await page.keyboard.press('ArrowDown');
        }
        expect(await page.evaluate(() => document.activeElement?.getAttribute('data-sign') ?? null)).toBe(key);
        await page.keyboard.press('Enter');
        await page.waitForSelector('#inst-sign-list', { state: 'detached' });
      };
      await pickSign(`song:${cid}`);
      await page.waitForFunction(() => (document.querySelector('[data-live]')?.textContent ?? '').includes('들려 줘요'), undefined, { timeout: 15000 });

      await pickSign('festival');
      await page.waitForSelector('[data-festival="playing"]', { timeout: 20000 });
      // 카드가 뜨면 건너뛰기에 초점이 가고, Tab은 카드 밖으로 나가지 않는다
      await waitFocus(page, '[data-festival-skip]', '잔치 카드가 떴을 때');
      expect(await focusRing(page)).toMatchObject({ ok: true });
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        expect(await focusedOutside(page, '[data-festival-shell]'), `Tab ${i + 1}번째`).toBeNull();
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-festival-shell]', { state: 'detached' });

      // 이 모든 것을 마우스 없이 했고, 소리는 한 번도 켜지 않았다
      const log = await inputLog(page);
      expect(log.downs).toBe(0);
      expect(log.maxDrag).toBe(0);
      expect(log.keys).toBeGreaterThan(60);
      expect(await audioContextCount(page)).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it('수첩 내 곡: 지우기와 이름 바꾸기를 키보드로 하면 초점이 사라진 단추 대신 알맞은 곳으로 간다 (확인 상자, 이름 칸, 결과 글)', async () => {
    const { ctx, page, errors } = await boot({ log: true, intro: 'key' });
    await seedSong(page);
    await page.keyboard.press('KeyN');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await tabToSel(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]', { max: 14 });
    for (let i = 0; i < 14 && (await notebookTab(page)) !== '내 곡'; i++) await page.keyboard.press('ArrowRight');
    expect(await notebookTab(page)).toBe('내 곡');

    // 이름 바꾸기를 그만두면(Esc) 초점이 이름 바꾸기 단추로 돌아온다
    await tabToSel(page, '[data-rename]', { max: 14 });
    await page.keyboard.press('Enter');
    await waitFocus(page, '.melody-name-input', '이름 바꾸기를 열었을 때');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.melody-name-input', { state: 'detached' });
    await waitFocus(page, '[data-rename]', '이름 바꾸기를 그만둔 뒤');

    // 지우기: 확인 상자로 초점이 가고, 그만두면 지우기 단추로 돌아온다
    await tabToSel(page, '[data-delete]', { max: 14 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nb-confirm');
    await waitFocusWithin(page, '.nb-confirm', '지우기 확인 상자가 열렸을 때');
    expect(await focusRing(page)).toMatchObject({ ok: true });
    await waitFocus(page, '[data-confirm-cancel]', '지우기 확인 상자가 열렸을 때(처음 초점은 그만두기: 되돌릴 수 없는 일의 기본은 안전한 쪽)');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nb-confirm', { state: 'detached' });
    await waitFocus(page, '[data-delete]', '지우기를 그만둔 뒤');
    expect((await saved(page))?.explorationState.creations).toHaveLength(1);

    // 확인해서 지우면 결과 글로 초점이 가고, 빈 쪽 안내가 보인다
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nb-confirm');
    await tabToSel(page, '[data-confirm-delete]', { max: 3, back: true }); // 처음 초점은 그만두기: Shift+Tab으로 앞의 '지우기'에 닿는다
    await page.keyboard.press('Enter');
    await page.locator('[data-empty]').waitFor();
    await waitFocus(page, '[data-creation-status]', '곡을 지운 뒤(결과 글)');
    await until(async () => (await saved(page))?.explorationState.creations.length, (n) => n === 0, '지운 곡이 저장에서도 사라진다');
    const log = await inputLog(page);
    expect(log.downs).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 새 화면을 차례로 여는 도구: 3번(확대), 5번(움직임), 7번(대비), 8번(이름과 크기)이 같은 화면들을 같은 모양으로 본다

/** 찾은 소리 조각과 쪽지, 저장한 곡이 있는 저장 */
const SEED = { found: [P1.discoveryId, N1.discoveryId], creations: [SONG] };
const P2 = PIECES[1]!;

interface Surface {
  name: string;
  /** 이 화면을 이루는 상자의 선택자(검사 범위) */
  scope: string;
  /** 손이 닿아야 하는 단추들 */
  keys: string[];
  open: (page: Page) => Promise<void>;
  close: (page: Page) => Promise<void>;
}

async function stageUp(page: Page): Promise<void> {
  if ((await page.locator('[data-installation-hud][data-stage="true"]').count()) > 0) return;
  expect(await teleport(page, 'H5')).toBe(true);
  await waitNear(page, 'H5', 20000);
  await page.keyboard.press('KeyE');
  await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
}
async function stageDown(page: Page): Promise<void> {
  for (let i = 0; i < 4 && (await page.locator('[data-installation-hud]').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
}

const notebookSurface = (tab: string, keys: string[]): Surface => ({
  name: `수첩 ${tab} 쪽`,
  scope: '[data-overlay="notebook"]',
  keys,
  open: async (p) => {
    await p.keyboard.press('KeyN');
    await p.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await p.locator('[data-overlay="notebook"] [role="tab"]', { hasText: new RegExp(`^${tab}$`) }).click();
    expect(await notebookTab(p)).toBe(tab);
  },
  close: async (p) => {
    await p.keyboard.press('Escape');
    await p.waitForSelector('[data-overlay="notebook"]', { state: 'detached' });
  },
});

const SURFACES: Surface[] = [
  {
    name: '표식 곁(안내 칩과 열기 단추)',
    scope: '[data-hud]',
    keys: ['.hud-chip'],
    open: async (p) => {
      await standBy(p, at(P2));
      await p.waitForSelector('.hud-chip');
    },
    close: async () => undefined,
  },
  {
    name: '쪽지 카드',
    scope: '[data-note-card]',
    keys: ['[data-note-card] .btn-primary', '[data-note-card] [data-related]'],
    open: async (p) => {
      await standBy(p, at(N1));
      await p.keyboard.press('KeyE');
      await p.waitForSelector(`[data-note-card="${N1.discoveryId}"]`);
    },
    close: async (p) => {
      await p.keyboard.press('Escape');
      await p.waitForSelector('[data-note-card]', { state: 'detached' });
      await until(() => status(p), (s) => !s.paused, '월드가 다시 움직인다');
    },
  },
  notebookSurface('발견', ['[data-replay]', '[data-related]']),
  notebookSurface('내 곡', ['[data-replay]', '[data-rename]', '[data-delete]']),
  {
    name: '자유 가락 패널(곡 저장, 소리 조각 재료함)',
    scope: '.panel-shell',
    keys: ['[data-melody-save-button]', '.melody-name-input', '[data-piece-place]', '.panel-shell .nav-button'],
    open: async (p) => {
      await p.evaluate((hash) => {
        location.hash = hash;
      }, freeHashFor(INST_ID));
      await p.waitForSelector('[data-melody-save]', { timeout: 20000 });
    },
    close: async (p) => {
      await p.keyboard.press('Escape');
      await p.waitForSelector('[data-melody-save]', { state: 'detached' });
    },
  },
  {
    name: '무대 표지판(내 곡 다시 듣기, 잔치 열기)',
    scope: '[data-installation-hud]',
    keys: ['[data-sign="festival"]'],
    open: async (p) => {
      await stageUp(p);
      await p.locator('[data-sign-toggle]').click();
      await p.waitForSelector('#inst-sign-list');
    },
    close: async (p) => {
      await p.locator('[data-sign-toggle]').click();
      await p.waitForSelector('#inst-sign-list', { state: 'detached' });
    },
  },
  {
    name: '잔치 카드',
    scope: '[data-festival-shell]',
    keys: ['[data-festival-skip]'],
    open: async (p) => {
      await openFestival(p);
    },
    close: async (p) => {
      await p.locator('[data-festival-skip]').click();
      await p.waitForSelector('[data-festival-shell]', { state: 'detached' });
      await stageDown(p);
    },
  },
];

/** 새 화면을 하나씩 열어 보고 닫는다. 열려 있는 동안 fn이 잰다 */
async function eachSurface(page: Page, fn: (s: Surface) => Promise<void>): Promise<void> {
  for (const s of SURFACES) {
    await s.open(page);
    // 그려지고 자리를 잡을 시간(글꼴, 카메라)을 상태가 아니라 한 프레임쯤 준다
    await page.waitForTimeout(250);
    try {
      await fn(s);
    } catch (e) {
      throw new Error(`[${s.name}] ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    await s.close(page);
  }
}

// ---------------------------------------------------------------------------
// 3번 확대 200%(폭 640)

describe('7.9 3번 확대 200%: 새 화면이 잘리지 않는다', () => {
  const SCREENS = [
    ['640×360 (1280×720의 200%)', 640, 360, false],
    ['640×400 (1280×800의 200%)', 640, 400, false],
    ['844×390 (가로로 든 휴대폰)', 844, 390, true],
  ] as const;
  for (const [label, w, hgt, touch] of SCREENS) {
    it(
      `${label}: 가로로 넘치지 않고, 눌러야 하는 단추에 손이 닿으며, 상자가 글을 자르지 않는다`,
      async () => {
        const { ctx, page, errors } = await boot({ width: w, height: hgt, ...(touch ? { touch: true } : {}) });
        await seedSave(page, SEED);
        await eachSurface(page, async (s) => {
          const over = await overflowReport(page);
          expect(over.docW, '문서 폭').toBeLessThanOrEqual(over.innerW);
          expect(over.out, '화면 폭 밖의 단추').toEqual([]);
          expect(await clipReport(page, s.scope), '글을 자르는 상자').toEqual([]);
          for (const sel of s.keys) {
            const loc = page.locator(sel).first();
            expect(await loc.count(), `${sel}가 있다`).toBeGreaterThan(0);
            // 보이고, 가려지지 않고, 필요하면 스크롤해서 손이 닿는다(누르지는 않는다)
            await loc.click({ trial: true, timeout: 8000 });
          }
        });
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});

// ---------------------------------------------------------------------------
// 8번 이름과 48 px (폭 412, 터치)

describe('7.9 8번, 7.6 이름과 크기: 새 화면의 단추, 입력 칸, 탭이 이름이 있고 48 px 이상이다 (폭 412, 터치)', () => {
  it(
    '화면마다: 이름이 빈 것이 없고(브라우저의 접근성 트리로도), 낭독기 이름이 보이는 글을 품고, 모두 48 px 이상이다',
    async () => {
      const { ctx, page, errors } = await boot({ width: 412, height: 915, touch: true });
      await seedSave(page, SEED);
      await eachSurface(page, async (s) => {
        const rows = await controlsReport(page, s.scope);
        expect(rows.length, '누르는 대상').toBeGreaterThan(0);
        expect(rows.filter((r) => !r.name).map((r) => `${r.role} .${r.cls}`), '이름이 빈 것').toEqual([]);
        expect(
          rows.filter((r) => r.w < 48 || r.h < 48).map((r) => `${r.name} ${Math.round(r.w)}×${Math.round(r.h)} [${r.role}] .${r.cls}`),
          '48 px보다 작은 것',
        ).toEqual([]);
        expect(await labelMismatch(page, s.scope), '낭독기 이름이 보이는 글을 품지 않는 것').toEqual([]);
        // 브라우저가 계산한 이름(낭독기가 읽는 것): 무시되지 않은 누르는 대상 중 이름이 빈 것이 없다
        const ax = await axReport(ctx, page);
        expect(ax.counted, '접근성 트리의 누르는 대상').toBeGreaterThan(0);
        expect(ax.unnamed, '접근성 트리에서 이름이 빈 것').toEqual([]);
      });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

// ---------------------------------------------------------------------------
// 7번 글자 대비 (그려진 색으로 잰다)

describe('7.9 7번 글자 대비 4.5:1: 새 화면의 그려진 글자 (큰 글자는 3:1)', () => {
  for (const [label, w, hgt, touch] of [
    ['1280×720', 1280, 720, false],
    ['412×915 터치', 412, 915, true],
  ] as const) {
    it(
      `${label}: 화면마다 글자색과 배경색(겹친 반투명 층 포함)으로 잰 대비가 기준 이상이다`,
      async () => {
        const { ctx, page, errors } = await boot({ width: w, height: hgt, ...(touch ? { touch: true } : {}) });
        await seedSave(page, SEED);
        const seen: string[] = [];
        await eachSurface(page, async (s) => {
          const r = await contrastReport(page, s.scope);
          expect(r.checked, '잰 글자').toBeGreaterThan(2);
          expect(r.unknown, '배경이 그림이라 재지 못한 것').toEqual([]);
          expect(contrastFails(r), '기준에 못 미치는 글자').toEqual([]);
          // 쓸 수 없는 단추의 글자도 읽을 수 있게 3:1 밑으로는 내려가지 않는다
          expect(r.rows.filter((x) => x.disabled && x.ratio < 3), '쓸 수 없는 단추의 글자').toEqual([]);
          seen.push(`${s.name}: 글자 ${r.checked}덩어리, 가장 낮은 대비 ${r.min}`);
        });
        console.log(`[7번 대비 ${label}]\n${seen.join('\n')}`);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});

// ---------------------------------------------------------------------------
// 2번 손가락만으로, 끌기 없이 (세로 휴대폰 430×932)

describe('7.9 2번 손가락만으로, 끌기 없이', () => {
  const tapSign = async (page: Page, key: string): Promise<void> => {
    await page.locator('[data-sign-toggle]').tap();
    await page.waitForSelector('#inst-sign-list');
    await page.locator(`[data-sign="${key}"]`).tap();
    await page.waitForSelector('#inst-sign-list', { state: 'detached' });
  };

  it(
    '소리 조각과 쪽지 찾기, 무대의 자유 가락에 조각 놓아 저장하기, 표지판으로 듣기·잔치 열기, 게시판에서 수첩의 내 곡 이름 바꾸고 지우기까지 눌러서만 한다',
    async () => {
      const { ctx, page, errors } = await boot({ width: 430, height: 932, touch: true, log: true });
      await waitReady(page);
      await waitChunks(page);

      // 소리 조각: 가까이 서면 아래 오른쪽에 열기 단추(64 px)가 뜬다
      await standBy(page, at(P1));
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
      await until(() => spotOf(page, P1.discoveryId), (s) => s?.found === true, '소리 조각을 찾은 표식이 된다');
      expect((await page.locator('[data-news] p').allInnerTexts()).map(squash)).toEqual(foundNews(P1));

      // 쪽지: 카드가 뜨고 닫기 단추를 누르면 월드가 다시 움직인다
      await standBy(page, at(N1));
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
      const card = page.locator(`[data-note-card="${N1.discoveryId}"]`);
      await card.waitFor();
      await card.locator('.btn-primary').tap();
      await card.waitFor({ state: 'detached' });
      await until(() => status(page), (s) => !s.paused, '월드가 다시 움직인다');

      // 합주 무대: 열기 단추 → 1마디 단추 → '패널로 보기'
      expect(await teleport(page, 'H5')).toBe(true);
      await waitNear(page, 'H5', 20000);
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
      await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
      await page.locator('.inst-picks-measures [data-measure="0"]').tap();
      await page.locator('.inst-bar [data-action="view-panel"]').tap();
      await page.waitForFunction((hash) => location.hash === hash, freeHashFor(INST_ID), { timeout: 15000 });
      await page.waitForSelector('[data-melody-save]');

      // 조각을 1마디에 놓고, 이름 칸을 눌러 이름을 쓰고(화면 자판), 저장 단추를 누른다
      await page.locator(`[data-piece-place="${P1.discoveryId}"]`).tap();
      await page.waitForSelector('[data-piece-note]');
      expect(squash(await page.locator('[data-piece-note]').innerText())).toContain('1마디에 놓았어요');
      await page.locator('.melody-name-input').tap();
      await page.locator('.melody-name-input').fill('손가락 곡');
      await page.locator('[data-melody-save-button]').tap();
      await page.waitForSelector('[data-melody-status="ok"]');
      expect(await page.locator('[data-melody-status="ok"] svg.icon').count()).toBe(1);
      const mine = await until(async () => (await saved(page))?.explorationState.creations ?? [], (v) => v.length === 1, '곡이 저장에 적힌다');
      expect(mine[0]!.name).toBe('손가락 곡');
      const cid = mine[0]!.creationId;

      // 돌아와 표지판으로 내 곡을 듣고, 잔치를 연다
      await page.locator('.panel-shell .nav-button').tap();
      await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
      await tapSign(page, `song:${cid}`);
      await page.waitForFunction(() => (document.querySelector('[data-live]')?.textContent ?? '').includes('들려 줘요'), undefined, { timeout: 15000 });
      await tapSign(page, 'festival');
      await page.waitForSelector('[data-festival="playing"]', { timeout: 20000 });
      await page.locator('[data-festival-skip]').tap();
      await page.waitForSelector('[data-festival-shell]', { state: 'detached' });
      await page.locator('.inst-bar [data-action="exit"]').tap();
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });

      // 광장 게시판 앞에서 열기 단추: 수첩의 내 곡이 열린다. 이름 바꾸기, 지우기(한 번 더 묻는다)
      await standBy(page, BOARD_SPOT);
      await page.waitForSelector('.hud-interact', { state: 'visible' });
      await page.locator('.hud-interact').tap();
      await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
      expect(await notebookTab(page)).toBe('내 곡');
      await page.locator(`[data-creation="${cid}"] [data-rename]`).tap();
      await page.locator('.melody-name-input').fill('고친 이름');
      await page.locator('[data-rename-save]').tap();
      await page.waitForSelector('[data-creation-status="ok"]');
      await until(async () => (await saved(page))?.explorationState.creations[0]?.name, (n) => n === '고친 이름', '바꾼 이름이 저장에 적힌다');
      await page.locator(`[data-creation="${cid}"] [data-replay]`).tap();
      await page.waitForSelector(`[data-replay="${cid}"][data-playing="true"]`);
      await page.locator(`[data-creation="${cid}"] [data-replay]`).tap();
      await page.waitForSelector(`[data-replay="${cid}"][data-playing="false"]`);
      await page.locator(`[data-creation="${cid}"] [data-delete]`).tap();
      await page.locator('[data-confirm-delete]').tap();
      await page.locator('[data-empty]').waitFor();
      await until(async () => (await saved(page))?.explorationState.creations.length, (n) => n === 0, '지운 곡이 저장에서도 사라진다');

      // 수첩의 발견 쪽에서 이어진 도전으로
      await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^발견$/ }).tap();
      await page.locator(`[data-discovery="${N1.discoveryId}"] [data-related]`).tap();
      await page.waitForFunction((q) => location.hash.startsWith(`#/q/${q}/`), N1.questId!, { timeout: 15000 });

      // 이 모든 것을 손가락으로만 했다: 눌렀다 뗀 거리는 0, 키는 한 번도 누르지 않았고, 마우스도 없었다
      const log = await inputLog(page);
      expect(log.types).toEqual(['touch']);
      expect(log.keys).toBe(0);
      expect(log.maxDrag).toBe(0);
      expect(log.downs, '누른 횟수').toBeGreaterThanOrEqual(24);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

// ---------------------------------------------------------------------------
// 5번 움직임 줄이기

describe('7.9 5번 움직임 줄이기: 새 화면에 화면 이동, 확대, 흔들림 연출이 없다', () => {
  const camStart = (): void => {
    const w = window as unknown as { __game: { world: { debugState(): { transitioning: boolean; zoom: number; center: { x: number; y: number } } | null } }; __cam?: unknown };
    const cam = { frames: 0, trans: 0, zooms: [] as number[], centers: [] as string[], raf: 0 };
    w.__cam = cam;
    const tick = (): void => {
      const d = w.__game.world.debugState();
      if (d) {
        cam.frames++;
        if (d.transitioning) cam.trans++;
        const z = Math.round(d.zoom * 1000) / 1000;
        if (!cam.zooms.includes(z)) cam.zooms.push(z);
        const c = `${Math.round(d.center.x)},${Math.round(d.center.y)}`;
        if (!cam.centers.includes(c)) cam.centers.push(c);
      }
      cam.raf = requestAnimationFrame(tick);
    };
    cam.raf = requestAnimationFrame(tick);
  };
  const camStop = (): { frames: number; trans: number; zooms: number[]; centers: number } => {
    const cam = (window as unknown as { __cam: { frames: number; trans: number; zooms: number[]; centers: string[]; raf: number } }).__cam;
    cancelAnimationFrame(cam.raf);
    return { frames: cam.frames, trans: cam.trans, zooms: cam.zooms, centers: cam.centers.length };
  };

  async function motionRun(mode: 'reduce' | 'no-preference') {
    const { ctx, page, errors } = await boot({ reducedMotion: mode });
    await seedSave(page, SEED);

    // 소리 조각의 물결 표식: 표식은 그대로 있고 퍼지는 물결만 없어진다
    await standBy(page, at(P2));
    await until(() => page.locator('.hud-ripples .ripple[data-source="piece"]').count(), (n) => n >= 1, '소리 조각의 물결 표식이 나타난다');
    const marks = await page.locator('.hud-ripples .ripple[data-source="piece"]').count();
    const waves = await page.locator('.hud-ripples .ripple[data-source="piece"] .ripple-wave').count();

    // 무대로 들어갈 때의 카메라: 0.3초 동안 옮기며 확대하는가
    expect(await teleport(page, 'H5')).toBe(true);
    await waitNear(page, 'H5', 20000);
    await page.waitForTimeout(800); // 이동한 직후의 연출이 끝난 뒤
    await page.evaluate(camStart);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
    await waitFramed(page);
    const cam = await page.evaluate(camStop);
    await stageDown(page);

    // 새 화면의 CSS 전환과 애니메이션, 부드러운 스크롤
    const slow: string[] = [];
    let smooth = 0;
    let checked = 0;
    await eachSurface(page, async (s) => {
      const r = await motionReport(page, s.scope);
      checked += r.checked;
      smooth += r.smooth;
      slow.push(...r.slow.map((x) => `${s.name}: ${x.el} 전환 ${x.t}초 · 애니메이션 ${x.a}초`));
    });

    // 잔치의 악사: 박에 맞춰 뛰는가
    await openFestival(page);
    let maxLift = 0;
    let seen = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 2600) {
      const d = await dbg(page);
      seen = Math.max(seen, d.musicians.length);
      for (const m of d.musicians) maxLift = Math.max(maxLift, m.lift);
      await page.waitForTimeout(80);
    }
    await page.locator('[data-festival-skip]').click();
    await page.waitForSelector('[data-festival-shell]', { state: 'detached' });
    expect(errors).toEqual([]);
    await ctx.close();
    return { marks, waves, cam, slow, smooth, checked, maxLift, seen };
  }

  it(
    '움직임 줄이기를 켜면: 물결은 표식만 있고 퍼지지 않으며, 무대 카메라는 바로 바뀌고, 악사는 뛰지 않고, 새 화면에 전환·애니메이션·부드러운 스크롤이 없다. 끄면 이것들이 실제로 움직인다',
    async () => {
      const off = await motionRun('reduce');
      const on = await motionRun('no-preference');
      console.log(`[5번 움직임] 줄임 ${JSON.stringify({ ...off, slow: off.slow.length })}\n끔 ${JSON.stringify({ ...on, slow: on.slow.length })}`);

      // 켰을 때
      expect(off.marks, '물결 표식').toBeGreaterThanOrEqual(1);
      expect(off.waves, '퍼지는 물결').toBe(0);
      expect(off.cam.frames, '카메라를 본 프레임').toBeGreaterThan(5);
      expect(off.cam.trans, '카메라가 옮기는 중이던 프레임').toBe(0);
      expect(off.slow, '전환이나 애니메이션이 남은 곳').toEqual([]);
      expect(off.smooth, '부드러운 스크롤').toBe(0);
      expect(off.cam.centers, '카메라 중심이 거친 자리의 수(바로 바뀌면 처음과 끝뿐)').toBeLessThanOrEqual(3);
      expect(off.seen, '무대의 악사').toBeGreaterThanOrEqual(1);
      expect(off.maxLift, '악사가 뜬 높이').toBe(0);

      // 껐을 때는 같은 것이 실제로 움직인다(위가 비어 있어서 통과한 것이 아님을 보인다)
      expect(on.marks).toBe(off.marks);
      expect(on.waves, '퍼지는 물결').toBe(on.marks);
      expect(on.cam.trans, '카메라가 옮기는 중이던 프레임').toBeGreaterThan(0);
      expect(on.cam.centers, '카메라 중심이 거친 자리의 수(옮겨 가면 사이 자리를 지난다)').toBeGreaterThan(off.cam.centers);
      expect(on.seen).toBe(off.seen);
      expect(on.maxLift, '악사가 뜬 높이').toBeGreaterThan(0);
    },
    LONG,
  );
});

// ---------------------------------------------------------------------------
// 6번 소리 없이

describe('7.9 6번 소리 없이: 탐험과 배치를 소리를 켜지 않고 다 할 수 있고, 소리 정보는 보이는 것으로 받는다', () => {
  it(
    '소리 장치를 한 번도 만들지 않은 채 소리 조각 찾기, 곡 만들어 저장하기, 다시 듣기, 잔치까지 한다. 물결 표식, 소리가 꺼져 있다는 글, 켜지는 칸과 단추, 잔치의 글이 소리를 대신한다',
    async () => {
      const { ctx, page, errors } = await boot({ audio: true });
      await waitReady(page);
      await waitChunks(page);

      // 소리 대신 보는 정보 ①: 화면 밖 가까이의 소리 조각은 그 방향의 가장자리에 물결 표식으로 알린다
      await standBy(page, at(P2));
      const ids = await until(
        () => page.locator('.hud-ripples .ripple[data-source="piece"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ripple')!)),
        (v) => v.length >= 1,
        '소리 조각의 물결 표식이 나타난다',
      );
      expect(ids).not.toContain(P2.discoveryId);
      expect(await page.locator('.hud-ripples').getAttribute('aria-hidden')).toBe('true');

      // 찾기: 알림이 글로 사실을 말하고, 광장의 등이 하나 켜진다(모양으로 안다)
      await standBy(page, at(P1));
      await page.keyboard.press('KeyE');
      await until(() => spotOf(page, P1.discoveryId), (s) => s?.found === true, '소리 조각을 찾은 표식이 된다');
      expect((await page.locator('[data-news] p').allInnerTexts()).map(squash)).toEqual(foundNews(P1));
      expect((await dbg(page)).plazaLamps.map((l) => l.state)).toEqual(PIECES.map((_, i) => (i === 0 ? 'on' : 'off')));

      // 자유 가락 패널: 조각 듣기는 소리 없이 되고, 소리가 꺼져 있다는 글이 보인다
      await page.evaluate((hash) => {
        location.hash = hash;
      }, freeHashFor(INST_ID));
      await page.waitForSelector('[data-melody-save]', { timeout: 20000 });
      await page.locator(`[data-piece-hear="${P1.discoveryId}"]`).click();
      await page.waitForSelector('#sound-off-hint');
      expect(squash(await page.locator('#sound-off-hint').innerText())).toContain('소리가 꺼져 있어요');
      // 배치: 놓고, 이름을 쓰고, 저장한다
      await page.locator(`[data-piece-place="${P1.discoveryId}"]`).click();
      await page.waitForSelector('[data-piece-note]');
      await page.locator('.melody-name-input').fill('소리 없는 곡');
      await page.locator('[data-melody-save-button]').click();
      await page.waitForSelector('[data-melody-status="ok"]');
      const mine = await until(async () => (await saved(page))?.explorationState.creations ?? [], (v) => v.length === 1, '곡이 저장에 적힌다');
      const cid = mine[0]!.creationId;
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-melody-save]', { state: 'detached' });

      // 수첩에서 다시 듣기: 소리가 없어도 '정지'로 바뀌고 재생이 흐른다
      await page.keyboard.press('KeyN');
      await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
      await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^내 곡$/ }).click();
      const replay = page.locator(`[data-replay="${cid}"]`);
      await replay.click();
      await page.waitForSelector(`[data-replay="${cid}"][data-playing="true"]`);
      expect(await replay.getAttribute('aria-label')).toMatch(/정지$/);
      await replay.click();
      await page.waitForSelector(`[data-replay="${cid}"][data-playing="false"]`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-overlay="notebook"]', { state: 'detached' });

      // 무대의 표지판으로 내 곡 듣기: 소리 대신 지금 울리는 칸이 켜진다
      await stageUp(page);
      await page.locator('[data-sign-toggle]').click();
      await page.waitForSelector('#inst-sign-list');
      await page.locator(`[data-sign="song:${cid}"]`).click();
      await until(async () => (await drawnOf(page, INST_ID)).slots.some((x) => x.playing), (v) => v, '지금 울리는 칸이 켜진다', 20000);
      await page.waitForFunction(() => (document.querySelector('[data-live]')?.textContent ?? '').includes('들려 줘요'), undefined, { timeout: 15000 });

      // 잔치: 소리가 꺼져 있어 조용히 흐른다는 글과 무대의 악사가 글로 읽힌다
      await openFestival(page);
      await page.waitForSelector('[data-festival-silent]');
      expect(squash(await page.locator('[data-festival-silent] .festival-silent').innerText())).toBe(FESTIVAL_SILENT_TEXT);
      expect(squash(await page.locator('[data-festival-musicians]').innerText()).length).toBeGreaterThan(5);
      expect((await dbg(page)).musicians.length).toBeGreaterThanOrEqual(1);
      await page.locator('[data-festival-skip]').click();
      await page.waitForSelector('[data-festival-shell]', { state: 'detached' });

      // 처음부터 끝까지 소리 장치는 한 번도 만들어지지 않았다
      expect(await audioContextCount(page)).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

// ---------------------------------------------------------------------------
// 4번 색 없이 구분

describe('7.9 4번 색 없이 구분: 찾은 것과 못 찾은 것, 저장 결과가 색 없이도 다르다', () => {
  const SHOTS = path.resolve('docs/verification/screens');
  type Clip = { x: number; y: number; width: number; height: number };
  const grayCrop = async (page: Page, clip: Clip): Promise<Buffer> => sharp(await page.screenshot({ type: 'png', clip })).greyscale().raw().toBuffer();
  /** 밝기가 min 이상 달라진 점의 수 */
  const changed = (a: Buffer, b: Buffer, min: number): number => {
    let n = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i]! - b[i]!) >= min) n++;
    return n;
  };
  /**
   * 화면이 가라앉을 때까지(연이은 세 장이 거의 같아질 때까지) 기다렸다가 찍는다. 바로 이동한 직후의 0.3초 밝아지는 연출이
   * 느린 화면에서 아직 끝나지 않았을 때 찍으면 앞뒤 그림이 모두 흐려져 달라진 점이 사라진다(D-114). 고정 시간으로 기다리지 않는다
   */
  const settledCrop = async (page: Page, clip: Clip): Promise<Buffer> => {
    let prev = await grayCrop(page, clip);
    let calm = 0;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(350);
      const cur = await grayCrop(page, clip);
      calm = changed(prev, cur, 8) <= 4 ? calm + 1 : 0;
      prev = cur;
      if (calm >= 2) return cur;
    }
    throw new Error('화면이 7초가 넘도록 가라앉지 않았다');
  };
  /**
   * 바로 이동한 직후에는 화면 범위(debugState의 view)가 아직 이전 자리일 수 있다. 이동은 다음 프레임에 카메라를 옮기고 화면 전환
   * 횟수(fades)를 하나 늘리므로, 그 횟수가 늘 때까지 기다리면 이어서 읽는 화면 범위는 옮겨 온 자리다(D-114)
   */
  const moved = async (page: Page, move: () => Promise<void>): Promise<void> => {
    const before = (await dbg(page)).fades;
    await move();
    await until(async () => (await dbg(page)).fades, (n) => n > before, '바로 이동한 자리로 화면이 옮겨진다');
  };
  /** 월드 좌표의 발치를 기준으로 한 화면 상자(화면 안으로 맞춘다) */
  const clipAround = async (page: Page, foot: { x: number; y: number }, box: { left: number; right: number; up: number; down: number }): Promise<Clip> => {
    const d = await dbg(page);
    const at0 = toScreen(d, foot.x, foot.y);
    const x = Math.max(0, Math.round(at0.x - box.left));
    const y = Math.max(0, Math.round(at0.y - box.up));
    const width = Math.min(d.size.width - x, Math.round(box.left + box.right));
    const height = Math.min(d.size.height - y, Math.round(box.up + box.down));
    return { x, y, width, height };
  };
  /** 찾기 전과 후의 그림을 한 장에 나란히(왼쪽 전, 오른쪽 후, 3배) 남긴다: 사람이 눈으로 볼 자료 */
  const savePair = async (name: string, a: Buffer, b: Buffer, w: number, h: number): Promise<void> => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const gray = (buf: Buffer) => sharp(buf, { raw: { width: w, height: h, channels: 1 } }).resize(w * 3, h * 3, { kernel: 'nearest' }).png().toBuffer();
    const [ia, ib] = await Promise.all([gray(a), gray(b)]);
    await sharp({ create: { width: w * 6 + 12, height: h * 3, channels: 3, background: '#ff00ff' } })
      .composite([
        { input: ia, left: 0, top: 0 },
        { input: ib, left: w * 3 + 12, top: 0 },
      ])
      .png()
      .toFile(path.join(SHOTS, name));
  };

  it('월드의 소리 조각, 개념 쪽지, 광장의 등: 무채색으로 보아도 찾기 전과 후의 모양이 다르다(밝기가 달라진 점이 충분하다). 비교 화면을 남긴다', async () => {
    const { ctx, page, errors } = await boot({ width: 1280, height: 720 });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    await waitReady(page);
    await waitChunks(page);
    const MIN_STEP = 24; // 밝기(0–255)가 이만큼 달라지면 달라진 점으로 센다
    const MIN_DOTS = 80;

    // 광장의 등(첫 소리 조각을 찾으면 켜진다): 찾기 전
    const lamp0 = (await dbg(page)).plazaLamps[0]!;
    await moved(page, () => command(page, { type: 'teleport', x: lamp0.x, y: lamp0.y + 60 }));
    const lampClip = await clipAround(page, lamp0, { left: 44, right: 44, up: 70, down: 14 });
    const lampBefore = await settledCrop(page, lampClip);
    expect((await dbg(page)).plazaLamps[0]!.state).toBe('off');

    // 소리 조각: 찾기 전 → 찾은 뒤
    await moved(page, () => standBy(page, at(P1)));
    const pieceClip = await clipAround(page, P1, { left: 48, right: 48, up: 90, down: 14 });
    const pieceBefore = await settledCrop(page, pieceClip); // 이동한 직후의 밝아지는 연출(0.3초)이 끝난 뒤에 찍는다
    await page.keyboard.press('KeyE');
    await until(() => spotOf(page, P1.discoveryId), (s) => s?.found === true, '소리 조각을 찾은 표식이 된다');
    const pieceAfter = await settledCrop(page, pieceClip);
    const pieceDots = changed(pieceBefore, pieceAfter, MIN_STEP);
    await savePair('phase5-gray-spot-piece-before-after.png', pieceBefore, pieceAfter, pieceClip.width, pieceClip.height);

    // 개념 쪽지: 찾기 전 → (카드를 닫은) 찾은 뒤
    await moved(page, () => standBy(page, at(N1)));
    const noteClip = await clipAround(page, N1, { left: 48, right: 48, up: 100, down: 14 });
    const noteBefore = await settledCrop(page, noteClip);
    await page.keyboard.press('KeyE');
    await page.locator(`[data-note-card="${N1.discoveryId}"]`).waitFor();
    await waitFocus(page, '[data-note-card] .btn-primary', '쪽지 카드가 떴을 때(Esc를 받을 준비가 된 뒤)');
    await page.keyboard.press('Escape');
    await page.locator('[data-note-card]').waitFor({ state: 'detached' });
    await until(() => status(page), (s) => !s.paused, '월드가 다시 움직인다');
    const noteAfter = await settledCrop(page, noteClip);
    const noteDots = changed(noteBefore, noteAfter, MIN_STEP);
    await savePair('phase5-gray-spot-note-before-after.png', noteBefore, noteAfter, noteClip.width, noteClip.height);

    // 광장의 등: 찾은 뒤(켜졌다)
    await moved(page, () => command(page, { type: 'teleport', x: lamp0.x, y: lamp0.y + 60 }));
    const lampAfter = await settledCrop(page, lampClip);
    expect((await dbg(page)).plazaLamps[0]!.state).toBe('on');
    const lampDots = changed(lampBefore, lampAfter, MIN_STEP);
    await savePair('phase5-gray-plaza-lamp-before-after.png', lampBefore, lampAfter, lampClip.width, lampClip.height);

    console.log(`[4번 색 없이] 밝기가 ${MIN_STEP} 이상 달라진 점: 소리 조각 ${pieceDots}, 쪽지 ${noteDots}, 광장 등 ${lampDots} (기준 ${MIN_DOTS})`);
    expect(pieceDots, '소리 조각').toBeGreaterThanOrEqual(MIN_DOTS);
    expect(noteDots, '개념 쪽지').toBeGreaterThanOrEqual(MIN_DOTS);
    expect(lampDots, '광장의 등').toBeGreaterThanOrEqual(MIN_DOTS);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('곡 저장의 결과는 글과 서로 다른 기호로 알린다(비었을 때와 저장했을 때). 수첩의 못 찾은 자리는 ○와 글이다. 무채색 화면을 남긴다', async () => {
    const { ctx, page, errors } = await boot({ width: 1280, height: 720 });
    await seedSave(page, { found: [P1.discoveryId, N1.discoveryId] });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    fs.mkdirSync(SHOTS, { recursive: true });

    // 자유 가락 패널: 비워 둔 채 저장 → 실패(⚠), 조각을 놓고 저장 → 성공(✓)
    await page.evaluate((hash) => {
      location.hash = hash;
    }, freeHashFor(INST_ID));
    await page.waitForSelector('[data-melody-save]', { timeout: 20000 });
    await page.locator('[data-melody-save-button]').click();
    const bad = page.locator('[data-melody-status="error"]');
    await bad.waitFor();
    expect(await bad.locator('svg.icon').count()).toBe(1);
    expect(squash(await bad.innerText()).length).toBeGreaterThan(5);
    const badShape = await bad.locator('svg.icon path').getAttribute('d');
    await page.screenshot({ path: path.join(SHOTS, 'phase5-gray-melody-save-error.png') });
    await page.locator(`[data-piece-place="${P1.discoveryId}"]`).click();
    await page.locator('[data-melody-save-button]').click();
    const ok = page.locator('[data-melody-status="ok"]');
    await ok.waitFor();
    expect(await ok.locator('svg.icon').count()).toBe(1);
    expect(await ok.locator('svg.icon path').getAttribute('d')).not.toBe(badShape);
    expect(squash(await ok.innerText())).toContain('저장했어요');
    await page.screenshot({ path: path.join(SHOTS, 'phase5-gray-melody-save-ok.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-melody-save]', { state: 'detached' });

    // 수첩의 발견 쪽: 찾은 것은 이름과 글이 있고, 못 찾은 자리는 ○와 '비어 있어요'
    await page.keyboard.press('KeyN');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^발견$/ }).click();
    const slots = page.locator('[data-overlay="notebook"] [data-discovery-slot]');
    expect(await slots.count()).toBe(ITEMS.length - 2);
    for (const t of await slots.allInnerTexts()) {
      expect(squash(t)).toContain('○');
      expect(squash(t)).toContain('비어 있어요');
    }
    await page.screenshot({ path: path.join(SHOTS, 'phase5-gray-notebook-discoveries.png') });
    await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^내 곡$/ }).click();
    await page.screenshot({ path: path.join(SHOTS, 'phase5-gray-notebook-songs.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-overlay="notebook"]', { state: 'detached' });

    // 잔치 카드(소리가 꺼져 있다는 글과 악사의 글)
    await openFestival(page);
    await page.waitForSelector('[data-festival-silent]');
    await page.screenshot({ path: path.join(SHOTS, 'phase5-gray-festival-card.png') });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 모든 과제의 모든 판본 패널을 같은 잣대로 훑는다(5-8). 3번 폭 640, 7번 글자 대비, 8번 이름과 48 px.
// 판본 목록은 콘텐츠 파일에서 읽는다. 시험이 과제 목록을 따로 적어 두지 않으므로 과제가 늘면 저절로 따라온다.

const QUEST_FILES = fs.readdirSync(path.resolve(__dirname, '../../content/quests')).filter((n) => n.endsWith('.json')).sort();
const PANELS: Array<{ id: string; hash: string }> = (() => {
  const dir = path.resolve(__dirname, '../../content/quests');
  const out: Array<{ id: string; hash: string }> = [];
  for (const f of QUEST_FILES) {
    const q = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as { questId: string; variantIds: string[] };
    for (const v of q.variantIds) out.push({ id: `${q.questId}/${v}`, hash: `#/q/${q.questId}/${v}` });
  }
  return out;
})();

describe('7.9 3·7·8번: 모든 과제의 모든 판본 패널 (5-8)', () => {
  it('콘텐츠에 있는 모든 과제가 판본을 하나 이상 가져, 모든 판본이 잡힌다', () => {
    // 과제 수를 시험에 적어 두지 않는다(8개로 적어 두었다가 6단계에서 과제가 19개가 되어 낡았다). 과제 파일 수와 같아야 한다
    expect(new Set(PANELS.map((p) => p.id.split('/')[0])).size).toBe(QUEST_FILES.length);
    expect(PANELS.length).toBeGreaterThanOrEqual(QUEST_FILES.length);
  });

  const open = async (hash: string, opts: { touch?: boolean; width: number; height: number }) => {
    const ctx = await h.newContext({ viewport: { width: opts.width, height: opts.height }, hasTouch: opts.touch ?? false });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    await page.goto(`${h.url}${hash}`);
    await page.waitForSelector('.panel-shell h1', { timeout: 20000 });
    // 확인하면 맞고 틀림 문장과 기호가 그려진다. 확인 단추가 없는 패널은 그대로 둔다
    const check = page.getByRole('button', { name: '배치 확인' });
    if ((await check.count()) > 0) {
      await check.first().click();
      await page.waitForTimeout(300);
    }
    return { ctx, page, errors };
  };

  it.each(PANELS)('$id · 7번 글자 대비와 3번 폭 640', async ({ hash, id }) => {
    const { ctx, page, errors } = await open(hash, { width: 1280, height: 800 });
    const r = await contrastReport(page, '.panel-shell');
    console.log(`[패널 대비 ${id}] 글자 ${r.checked}덩어리, 가장 낮은 대비 ${r.min}`);
    expect(r.checked, '잰 글자').toBeGreaterThan(10);
    expect(r.unknown, '배경이 그림이라 재지 못한 것').toEqual([]);
    expect(contrastFails(r), '기준에 못 미치는 글자').toEqual([]);
    expect(r.rows.filter((x) => x.disabled && x.ratio < 3), '쓸 수 없는 단추의 글자').toEqual([]);
    // 폭 640: 확대 200%
    await page.setViewportSize({ width: 640, height: 900 });
    await page.waitForTimeout(250);
    const over = await overflowReport(page);
    expect(over.docW, '문서 폭').toBeLessThanOrEqual(over.innerW);
    expect(over.out, '화면 폭 밖의 단추').toEqual([]);
    expect(await clipReport(page, '.panel-shell'), '글을 자르는 상자').toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it.each(PANELS)('$id · 8번 이름과 48 px (폭 412, 터치)', async ({ hash }) => {
    const { ctx, page, errors } = await open(hash, { width: 412, height: 915, touch: true });
    const rows = await controlsReport(page, '.panel-shell');
    expect(rows.length, '누르는 대상').toBeGreaterThan(5);
    expect(rows.filter((r) => !r.name).map((r) => `${r.role} ${r.cls}`), '이름이 빈 것').toEqual([]);
    expect(rows.filter((r) => r.w < 47.9 || r.h < 47.9).map((r) => `${r.name} ${r.w}×${r.h}`), '48 px보다 작은 것').toEqual([]);
    const ax = await axReport(ctx, page);
    expect(ax.counted, '브라우저가 센 누르는 대상').toBeGreaterThan(5);
    expect(ax.unnamed, '접근성 트리에서 이름이 빈 것').toEqual([]);
    expect(await labelMismatch(page, '.panel-shell'), '보이는 글이 이름에 들어 있지 않은 것').toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});

// ---------------------------------------------------------------------------
// 5-7의 저장 알림(화면 위의 띠)과 설정의 저장 구역: 망가진 저장으로 열었을 때만 나타나는 화면

describe('7.9 5-7의 저장 알림과 설정의 저장 구역: 망가진 저장으로 열었을 때', () => {
  const SAVE_SECTION = 'section[aria-labelledby="set-save"]';
  const NOTICE = '[data-save-notice]';
  const KEY_PREVIOUS = 'levelup-music-world:v1:save:previous';

  /** 현재 저장은 일부만 읽히고(통과 기록 하나가 망가짐) 직전 저장은 읽을 수 없는 상태로 다시 연다: 알림 띠가 뜬다 */
  const damagedBoot = async (opts: BootOptions) => {
    const b = await boot(opts);
    const { page } = b;
    await until(async () => (await saved(page))?.preferences.introSeen ?? false, (v) => v, '첫 저장이 적힌다');
    const base = JSON.parse((await idbRead(page, KEY_CURRENT))!) as { attempts: unknown[] };
    base.attempts = [{ junk: true }];
    await idbWrite(page, KEY_CURRENT, JSON.stringify(base));
    await idbWrite(page, KEY_PREVIOUS, '이건 직전 저장이 아니에요');
    await page.evaluate((k) => localStorage.removeItem(k), KEY_EMERGENCY);
    await page.reload();
    await page.waitForSelector(NOTICE, { timeout: 30000 });
    return b;
  };

  /** 띠에서 '설정에서 보기'로 저장 구역을 연다 */
  const openFromNotice = async (page: Page, touch: boolean): Promise<void> => {
    const open = page.locator(`${NOTICE} button`, { hasText: '설정에서 보기' });
    if (touch) await open.tap();
    else await open.click();
    await page.waitForSelector(SAVE_SECTION, { timeout: 20000 });
  };

  /** 알림 띠와 저장 구역을 차례로 열어 보며 잰다 */
  const eachSaveSurface = async (page: Page, touch: boolean, fn: (name: string, scope: string) => Promise<void>): Promise<void> => {
    await fn('알림 띠', NOTICE);
    await openFromNotice(page, touch);
    await page.locator(`${SAVE_SECTION} .save-problem`).waitFor();
    await fn('설정의 저장 구역', SAVE_SECTION);
  };

  it(
    '1280×720: 글자 대비가 기준 이상이고, 알림에 기호가 붙고, 키보드만으로 띠에서 설정을 열어 읽지 못한 저장을 내려받고 Esc로 닫는다',
    async () => {
      const { ctx, page, errors } = await damagedBoot({ intro: 'key' });
      const seen: string[] = [];
      expect(await page.locator(`${NOTICE} svg`).count(), '알림 기호(색 말고도 알린다)').toBeGreaterThan(0);
      expect(await page.locator(NOTICE).innerText()).toContain('읽을 수 있는 것만 살려서 열었어요');
      await eachSaveSurface(page, false, async (name, scope) => {
        const r = await contrastReport(page, scope);
        expect(r.checked, `${name}: 잰 글자`).toBeGreaterThan(2);
        expect(r.unknown, `${name}: 배경이 그림이라 재지 못한 것`).toEqual([]);
        expect(contrastFails(r), `${name}: 기준에 못 미치는 글자`).toEqual([]);
        seen.push(`${name}: 글자 ${r.checked}덩어리, 가장 낮은 대비 ${r.min}`);
      });
      console.log(`[5-7 알림 대비]\n${seen.join('\n')}`);
      await ctx.close();

      // 키보드만: 새로 연 맥락에서 Tab으로 '설정에서 보기'에 닿아 Enter로 연다
      const k = await damagedBoot({ intro: 'key' });
      await tabToSel(k.page, `${NOTICE} button:first-of-type`, { max: 60 });
      expect(await k.page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('설정에서 보기');
      await k.page.keyboard.press('Enter');
      await k.page.waitForSelector(SAVE_SECTION, { timeout: 20000 });
      await k.page.locator(`${SAVE_SECTION} .save-problem`).waitFor();
      await tabToSel(k.page, '[data-testid="save-unread-download"]', { max: 80 });
      const [download] = await Promise.all([k.page.waitForEvent('download'), k.page.keyboard.press('Enter')]);
      expect(download.suggestedFilename(), '내려받은 파일 이름').toMatch(/\.json$/);
      expect(await k.page.locator(`${SAVE_SECTION} .save-note`).innerText()).toContain('읽지 못한 저장을 파일로 내려받았어요');
      await k.page.keyboard.press('Escape');
      await k.page.waitForSelector(SAVE_SECTION, { state: 'detached' });
      expect(errors).toEqual([]);
      expect(k.errors).toEqual([]);
      await k.ctx.close();
    },
    LONG,
  );

  it(
    '폭 412 터치: 알림 띠와 저장 구역의 단추가 이름이 있고(접근성 트리로도), 보이는 글을 품고, 모두 48 px 이상이며, 손가락으로 열린다',
    async () => {
      const { ctx, page, errors } = await damagedBoot({ width: 412, height: 915, touch: true });
      await eachSaveSurface(page, true, async (name, scope) => {
        const rows = await controlsReport(page, scope);
        expect(rows.length, `${name}: 누르는 대상`).toBeGreaterThan(0);
        expect(rows.filter((r) => !r.name).map((r) => `${r.role} .${r.cls}`), `${name}: 이름이 빈 것`).toEqual([]);
        expect(
          rows.filter((r) => r.w < 48 || r.h < 48).map((r) => `${r.name} ${Math.round(r.w)}×${Math.round(r.h)} [${r.role}] .${r.cls}`),
          `${name}: 48 px보다 작은 것`,
        ).toEqual([]);
        expect(await labelMismatch(page, scope), `${name}: 낭독기 이름이 보이는 글을 품지 않는 것`).toEqual([]);
        const ax = await axReport(ctx, page);
        expect(ax.unnamed, `${name}: 접근성 트리에서 이름이 빈 것`).toEqual([]);
      });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '폭 640(200% 확대): 알림 띠와 저장 구역이 가로로 넘치지 않고, 눌러야 하는 단추에 손이 닿으며, 상자가 글을 자르지 않는다',
    async () => {
      const { ctx, page, errors } = await damagedBoot({ width: 640, height: 360 });
      await eachSaveSurface(page, false, async (name, scope) => {
        const over = await overflowReport(page);
        expect(over.docW, `${name}: 문서 폭`).toBeLessThanOrEqual(over.innerW);
        expect(over.out, `${name}: 화면 폭 밖의 단추`).toEqual([]);
        expect(await clipReport(page, scope), `${name}: 글을 자르는 상자`).toEqual([]);
        for (const loc of await page.locator(`${scope} button`).all()) await loc.click({ trial: true, timeout: 8000 });
      });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
