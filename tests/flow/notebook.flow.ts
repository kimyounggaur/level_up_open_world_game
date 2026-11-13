// 4단계 흐름 시험(실제 Chrome), 수첩 편: 수첩 화면(6.5, 7.5의 N)과 목록의 추천 이유 줄(6.6). 완료 기준 4-7을 본다.
//  - 수첩은 있었던 일을 있는 그대로 적는다: 열어 봄, 통과, 그때의 템포와 도움. 느린 통과와 원래 템포의 통과가 섞이지 않는다.
//  - 키보드(N, Esc, ← →, Home, End)와 터치로 모두 쪽을 넘길 수 있고, 새로 고쳐도 기록이 남는다.
//  - 다섯 화면 크기에서 메뉴 단추가 서로 겹치지 않고, 수첩이 화면 안에 들어온다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { status, waitChunks, waitReady } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { QUEST_COUNT, QUEST_IDS } from './content';
import { completeQ01, completeQ02, feedbackState } from './panelTools';

const Q01 = 'pitch.same-note-two-clefs';
const Q02 = 'rhythm.rest-in-a-bar';
const Q03 = 'rhythm.short-notes-and-triplets';
const Q04 = 'pitch.same-sound-different-names';
const Q07 = 'scale.major';
const Q01_HASH = `#/q/${Q01}/middle-c`;
const Q02_HASH = `#/q/${Q02}/quarter-rest`;
const SAVE_KEY = 'levelup-music-world:v1:save:current';
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
  fs.mkdirSync(SHOTS, { recursive: true });
});
afterAll(async () => {
  await h?.close();
});

interface BootOpts {
  w?: number;
  h?: number;
  touch?: boolean;
  hash?: string;
}

async function boot(opts: BootOpts = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, hasTouch: opts.touch ?? false });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  await skipIntro(page);
  return { ctx, page, errors };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const waitHash = (p: Page, hash: string) => p.waitForFunction((x) => location.hash === x, hash, { timeout: 30000 });
/** 탐험 화면(홈)이 된다. 앱 안에서 연 화면은 닫으면 history.back()으로 처음 주소(해시 없음)로 돌아가므로 '', '#', '#/'를 모두 홈으로 본다 */
const waitHome = (p: Page) => p.waitForFunction(() => /^(#\/?)?$/.test(location.hash), undefined, { timeout: 30000 });
const waitNotebook = (p: Page) => p.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]', { timeout: 30000 });
const tabs = (p: Page): Locator => p.locator('[data-overlay="notebook"] [role="tab"]');
const selectedTab = async (p: Page): Promise<string> => ((await p.locator('[data-overlay="notebook"] [role="tab"][aria-selected="true"]').innerText()) ?? '').trim();
const panelText = async (p: Page): Promise<string> => p.locator('[data-overlay="notebook"] [role="tabpanel"]').innerText();
const quest = (p: Page, questId: string): Locator => p.locator(`[data-overlay="notebook"] .nb-quest[data-quest="${questId}"]`);
const passLines = async (loc: Locator): Promise<string[]> => (await loc.locator('.nb-pass').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const activeIsSelectedTab = (p: Page): Promise<boolean> => p.evaluate(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.getAttribute('aria-selected') === 'true');
/** 쪽 이름 탭을 눌러 그 쪽을 펼친다 */
const openPage = async (p: Page, label: string): Promise<void> => {
  await p.locator('[data-overlay="notebook"] [role="tab"]', { hasText: new RegExp(`^${label}$`) }).click();
  expect(await selectedTab(p)).toBe(label);
};
/** 한 번의 왕복으로 읽는 상자들. 보이지 않는 것(display:none, 크기 0)은 뺀다 */
const boxesOf = (p: Page, selector: string): Promise<Array<Box & { name: string; text: string }>> =>
  p.evaluate((sel) => {
    return [...document.querySelectorAll(sel)]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const text = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
        const name = (el.getAttribute('aria-label') ?? text).replace(/\s+/g, ' ').trim();
        return { name, text, x: r.x, y: r.y, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' };
      })
      .filter((b) => b.shown)
      .map(({ shown: _shown, ...b }) => b);
  }, selector);
const viewportOf = (p: Page): { w: number; h: number } => ({ w: p.viewportSize()!.width, h: p.viewportSize()!.height });
const inside = (b: Box, vp: { w: number; h: number }): boolean => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vp.w + 0.5 && b.y + b.h <= vp.h + 0.5;
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const noHorizontalOverflow = (p: Page): Promise<boolean> => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// 저장소(IndexedDB)에서 저장 본문을 읽는다. 앱의 연결과 따로 연다
const readSave = (p: Page): Promise<string | null> =>
  p.evaluate(
    (k) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('levelup-music-world', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('save', 'readonly').objectStore('save').get(k);
          req.onsuccess = () => {
            db.close();
            resolve(typeof req.result === 'string' ? req.result : null);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
      }),
    SAVE_KEY,
  );

/** 저장에 시도 기록이 n개 이상 나타날 때까지 기다린다 */
async function waitSavedAttempts(p: Page, n: number, timeout = 30000): Promise<Array<{ questId: string; resultType: string }>> {
  const start = Date.now();
  for (;;) {
    const text = await readSave(p);
    if (text) {
      const attempts = (JSON.parse(text) as { attempts?: Array<{ questId: string; resultType: string }> }).attempts ?? [];
      if (attempts.length >= n) return attempts;
    }
    if (Date.now() - start > timeout) throw new Error(`저장에 시도 기록 ${n}개가 나타나지 않았어요. 지금 저장: ${text?.slice(0, 200) ?? '(없음)'}`);
    await p.waitForTimeout(150);
  }
}

/** 6.7: 경험치, 별점, 순위, 완주율, 남은 일의 개수, 칭찬이나 꾸중이 어느 글에도 없다. 판본 이름(4/4는 박자표)은 내용의 이름이라 뺀다 */
async function expectNoScoreWords(p: Page): Promise<void> {
  const texts: string[] = [];
  for (const label of await tabs(p).allInnerTexts()) {
    await openPage(p, label.trim());
    texts.push(
      await p.locator('[data-overlay="notebook"] [role="tabpanel"]').evaluate((el) => {
        const copy = el.cloneNode(true) as HTMLElement;
        for (const v of Array.from(copy.querySelectorAll('.nb-variant strong'))) v.remove();
        return copy.innerText;
      }),
    );
  }
  const all = texts.join('\n');
  expect(all).not.toMatch(/경험치|레벨|별점|별 |순위|랭킹|완주|달성|남았|남은|연속|포인트|점수|%|\d+\s*\/\s*\d+|\d+\s*개\s*중|중\s*\d+/);
  expect(all).not.toMatch(/잘했|훌륭|대단|축하|부족|실력/);
  expect(all.length).toBeGreaterThan(300);
}

describe('4-7 수첩: 열고 닫는 길', () => {
  it('N 키, 메뉴 단추, Esc로 수첩을 열고 닫는다. 월드는 멈췄다가 다시 움직인다 (1280×720)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    expect((await status(page)).paused).toBe(false);

    await page.keyboard.press('KeyN');
    await waitHash(page, '#/notebook');
    await waitNotebook(page);
    expect((await page.locator('[data-overlay="notebook"] h1').innerText()).trim()).toBe('수첩');
    expect((await status(page)).paused).toBe(true);
    // 처음 펼쳐진 쪽은 지금 서 있는 지역이다
    expect(await selectedTab(page)).toBe('음악 마을');
    expect(await tabs(page).allInnerTexts()).toEqual(['음악 마을', '오선 언덕', '박자 강가', '종나무 숲', '음계 길', '건반 늪', '발견', '내 곡', '관찰']);

    await page.keyboard.press('Escape');
    await waitHome(page);
    await page.waitForFunction(() => !document.querySelector('[data-overlay="notebook"]'));
    expect((await status(page)).paused).toBe(false);

    // N을 다시 누르면 닫힌다
    await page.keyboard.press('KeyN');
    await waitNotebook(page);
    await page.keyboard.press('KeyN');
    await waitHome(page);

    // 오른쪽 위 메뉴의 단추
    const btn = page.locator('.hud-menu .hud-btn', { hasText: '수첩' });
    expect(await btn.getAttribute('aria-keyshortcuts')).toBe('N');
    await btn.click();
    await waitHash(page, '#/notebook');
    await waitNotebook(page);
    await page.getByRole('button', { name: '돌아가기' }).click();
    await waitHome(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('주소로 바로 열어도 되고, 수첩에서 지도와 목록으로 바로 건너갈 수 있다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/notebook' });
    await waitNotebook(page);
    expect(await selectedTab(page)).toBe('음악 마을');
    await page.keyboard.press('KeyM');
    await waitHash(page, '#/map');
    await page.keyboard.press('KeyN');
    await waitHash(page, '#/notebook');
    await page.keyboard.press('KeyL');
    await waitHash(page, '#/list');
    await page.keyboard.press('KeyN');
    await waitHash(page, '#/notebook');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-7 수첩: 키보드와 터치로 쪽을 넘긴다', () => {
  it('Tab으로 쪽 탭에 한 번에 닿고, ← → Home End로 넘기며 초점이 따라간다. 가장자리에서는 반대쪽으로 이어진다', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/notebook' });
    await waitNotebook(page);
    // 탭 순서에는 고른 쪽 하나만 든다
    expect(await page.locator('[data-overlay="notebook"] [role="tab"][tabindex="0"]').count()).toBe(1);
    let reached = false;
    for (let i = 0; i < 8 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await activeIsSelectedTab(page);
    }
    expect(reached).toBe(true);

    await page.keyboard.press('ArrowRight');
    expect(await selectedTab(page)).toBe('오선 언덕');
    expect(await activeIsSelectedTab(page)).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await selectedTab(page)).toBe('관찰'); // 처음 쪽에서 왼쪽으로 가면 마지막 쪽
    await page.keyboard.press('ArrowRight');
    expect(await selectedTab(page)).toBe('음악 마을');
    await page.keyboard.press('End');
    expect(await selectedTab(page)).toBe('관찰');
    await page.keyboard.press('Home');
    expect(await selectedTab(page)).toBe('음악 마을');
    expect(await activeIsSelectedTab(page)).toBe(true);
    // 쪽 내용도 바뀐다
    expect(await page.locator('[data-overlay="notebook"] [role="tabpanel"] h2').innerText()).toBe('음악 마을');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('[data-overlay="notebook"] [role="tabpanel"] h2').innerText()).toBe('박자 강가');

    // 쪽 탭에 초점이 있어도 N과 Esc는 그대로 닫는다
    await page.keyboard.press('KeyN');
    await waitHome(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('이전 쪽·다음 쪽 단추로도 넘긴다(손가락으로 누르는 길)', async () => {
    const { ctx, page, errors } = await boot({ hash: '#/notebook', w: 430, h: 932, touch: true });
    await waitNotebook(page);
    expect(await selectedTab(page)).toBe('음악 마을');
    await page.getByRole('button', { name: '다음 쪽' }).tap();
    expect(await selectedTab(page)).toBe('오선 언덕');
    await page.getByRole('button', { name: '이전 쪽' }).tap();
    await page.getByRole('button', { name: '이전 쪽' }).tap();
    expect(await selectedTab(page)).toBe('관찰');
    // 고른 탭은 옆으로 밀리는 탭 줄 안에서 화면에 보인다
    const sel = (await boxesOf(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]'))[0]!;
    expect(inside(sel, viewportOf(page))).toBe(true);
    await page.getByRole('button', { name: '다음 쪽' }).tap();
    expect(await selectedTab(page)).toBe('음악 마을');
    const first = (await boxesOf(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]'))[0]!;
    expect(inside(first, viewportOf(page))).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-7 수첩: 한 일이 그대로 적힌다', () => {
  it('Q01을 틀렸다가 고쳐 통과하고, Q02를 원래 템포로 한 번과 느리게 듣기로 한 번 통과하면 수첩에 그대로 적힌다. 새로 고쳐도 남는다', async () => {
    const { ctx, page, errors } = await boot({ hash: Q01_HASH });
    // --- Q01: 틀렸다가 고쳐서 통과
    await completeQ01(page, 'mouse');
    await page.keyboard.press('Escape');
    await waitHome(page);
    await page.keyboard.press('KeyN');
    await waitNotebook(page);

    expect(await quest(page, Q01).locator('.nb-opened').innerText()).toBe('열어 봄');
    expect(await quest(page, Q02).locator('.nb-opened').count()).toBe(0);
    expect(await quest(page, Q07).locator('.nb-opened').count()).toBe(0);
    expect(await passLines(quest(page, Q01))).toEqual(['✓ 통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이']);
    expect(await quest(page, Q01).locator('.nb-tries').innerText()).toBe('확인 2번'); // 고칠 곳이 나온 한 번, 통과한 한 번
    expect(await quest(page, Q02).locator('.nb-none').first().innerText()).toBe('아직 기록이 없어요');

    // --- Q02: 수첩의 '열기'로 들어가 원래 템포로 통과한 뒤, 느리게 듣기를 켜고 다시 확인해 통과
    await quest(page, Q02).locator('a.btn').first().click();
    await waitHash(page, Q02_HASH);
    await page.waitForSelector('button.material');
    await completeQ02(page, 'mouse');
    const slow = page.locator('#aid-slow');
    await slow.click();
    expect(await slow.getAttribute('aria-checked')).toBe('true');
    await page.getByRole('button', { name: '배치 확인' }).click();
    expect(await feedbackState(page)).toBe('passed');
    await page.keyboard.press('Escape');
    await waitHome(page);

    await page.keyboard.press('KeyN');
    await waitNotebook(page);
    const q02 = quest(page, Q02);
    const lines = await passLines(q02);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('✓ 통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이');
    expect(lines[1]).toMatch(/^✓ 통과 · 느린 템포 4분음표 = \d+ BPM\(원래 80\) · 도움을 썼어요$/);
    expect(await q02.locator('.nb-pass').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-slower')}/${e.getAttribute('data-assist')}`))).toEqual(['false/false', 'true/true']);
    expect(await q02.locator('.nb-tries').innerText()).toBe('확인 2번');
    // 열어 보지 않은 Q07에는 아무 기록도 없다
    expect(await passLines(quest(page, Q07))).toEqual([]);

    // --- 관찰: 있었던 일만, 사실 문장으로. 적은 시도라는 것도 밝힌다
    await openPage(page, '관찰');
    const cards = page.locator('[data-overlay="notebook"] .nb-observation');
    expect(await cards.count()).toBe(2);
    const byQuest = async (id: string) => ({
      title: await page.locator(`.nb-observation[data-quest="${id}"] h3`).innerText(),
      few: await page.locator(`.nb-observation[data-quest="${id}"] .nb-few`).innerText(),
      sentences: (await page.locator(`.nb-observation[data-quest="${id}"] .nb-sentences li`).allInnerTexts()).map((t) => t.trim()),
    });
    expect(await byQuest(Q01)).toEqual({ title: '같은 음의 자리 찾기', few: '적은 시도에서 관찰', sentences: ['최근 2번 확인했어요. 통과 1번, 고칠 곳이 나온 것 1번이에요.'] });
    expect(await byQuest(Q02)).toEqual({ title: '쉼이 있는 한 마디', few: '적은 시도에서 관찰', sentences: ['최근 2번 확인했고, 모두 통과했어요.'] });

    // --- 발견: 찾기 전에는 빈칸만 있다. 이름도 다시 듣기도 없고, 어디에 있는지도 몇 개 남았는지도 말하지 않는다
    await openPage(page, '발견');
    expect(await panelText(page)).toContain('아직 찾지 못한 것은 빈칸으로만 남아요');
    const slots = await page.locator('[data-overlay="notebook"] [data-discovery-slot]').count();
    expect(slots).toBeGreaterThan(0);
    expect(await page.locator('[data-overlay="notebook"] [data-found="true"]').count()).toBe(0);
    expect(await page.locator('[data-overlay="notebook"] [data-replay]').count()).toBe(0);
    expect((await page.locator('[data-overlay="notebook"] [data-discovery-slot]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())).toEqual(Array(slots).fill('○ 비어 있어요'));
    // --- 내 곡: 저장한 곡이 없다고 솔직하게 말한다
    await openPage(page, '내 곡');
    expect(await panelText(page)).toContain('저장한 곡이 아직 없어요');
    await expectNoScoreWords(page);

    // --- 새로 고쳐도 같은 기록이 남는다(저장에 시도 기록 4개가 적힐 때까지 기다린 뒤)
    const saved = await waitSavedAttempts(page, 4);
    expect(saved.map((a) => `${a.questId}:${a.resultType}`)).toEqual([`${Q01}:needsRevision`, `${Q01}:passed`, `${Q02}:passed`, `${Q02}:passed`]);
    await page.reload();
    await skipIntro(page);
    await waitReady(page);
    // 새로 고친 주소가 #/notebook이므로 수첩이 그대로 열린다(여기서 N을 또 누르면 닫힌다). 서 있던 지역의 쪽이 처음 펼쳐진다
    await waitNotebook(page);
    expect(await selectedTab(page)).toBe('음악 마을');
    expect(await passLines(quest(page, Q01))).toEqual(['✓ 통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이']);
    expect(await passLines(quest(page, Q02))).toEqual(lines);
    expect(await quest(page, Q02).locator('.nb-opened').count()).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('목록은 아직 열어 보지 않은 과제를 앞으로 옮기고 이유를 한 줄만 붙인다. 열어 본 과제도 그대로 열 수 있다', async () => {
    const { ctx, page, errors } = await boot({ hash: Q01_HASH });
    await completeQ01(page, 'mouse');
    await page.keyboard.press('Escape');
    await waitHome(page);
    await waitReady(page);
    await page.keyboard.press('KeyL');
    await waitHash(page, '#/list');
    await page.waitForSelector('.quest-card[data-quest]:not(.nb-quest)');
    const order = await page.locator('.quest-card[data-quest]:not(.nb-quest)').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.quest}|${e.querySelector('.quest-reason')?.textContent ?? ''}`));
    // 추천 3번 규칙(6.6): 지금 있는 지역(음악 마을)에서 아직 열어 보지 않은 과제를 그 지역 정거장의 차례(H1 Q01·Q04, H2 Q02·Q03, H3 Q05·Q06, H4 Q07, H5 Q08)로
    // 규칙마다 최대 3개까지 앞으로 올린다. Q01은 방금 열었으므로 빠지고 Q04, Q02, Q03이 올라간다. 나머지는 원래 차례(과제 파일 이름 차례) 그대로 이유 없이 뒤에 온다.
    // 다른 지역의 과제(6단계에서 늘어난 Q13–Q23)도 목록에는 모두 있고 마을에 있는 동안은 이유 없이 이 뒤쪽에 온다. 과제의 수는 내용 파일에서 읽는다(content.ts)
    const HERE = '지금 있는 음악 마을에서 아직 열어 보지 않은 도전이에요.';
    const FRONT = [Q04, Q02, Q03];
    expect(order).toEqual([...FRONT.map((id) => `${id}|${HERE}`), ...QUEST_IDS.filter((id) => !FRONT.includes(id)).map((id) => `${id}|`)]);
    expect(order).toHaveLength(QUEST_COUNT);
    // 이미 연 과제도 목록에 그대로 있고, 열기 링크가 살아 있다
    expect(await page.locator(`.quest-card[data-quest="${Q01}"]:not(.nb-quest) a.btn`).first().getAttribute('href')).toBe(Q01_HASH);
    // 이유는 사실만 말한다(막거나 경고하는 말이 없다)
    const reasons = (await page.locator('.quest-reason').allInnerTexts()).join('\n');
    expect(reasons).not.toMatch(/먼저|꼭|해야|하세요|위험|주의|경고|잠겨|못 열|열 수 없/);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 여러 화면 크기: 메뉴 단추가 서로 겹치지 않고 화면 안에 있으며, 수첩이 화면 안에 들어오고 쪽을 넘길 수 있다.

const SCREENS: Array<{ name: string; w: number; h: number; touch: boolean }> = [
  { name: 'desktop-1366x768', w: 1366, h: 768, touch: false },
  { name: 'tablet-landscape-1180x820', w: 1180, h: 820, touch: true },
  { name: 'phone-portrait-430x932', w: 430, h: 932, touch: true },
  { name: 'phone-portrait-small-360x640', w: 360, h: 640, touch: true },
  { name: 'phone-landscape-844x390', w: 844, h: 390, touch: true },
];

describe('4-7 여러 화면에서 메뉴와 수첩이 들어맞는다 (7.6)', () => {
  for (const s of SCREENS) {
    it(`${s.name}: 메뉴가 겹치지 않고, 수첩이 화면 안에 들어오며, 탭과 단추가 충분히 크다`, async () => {
      const { ctx, page, errors } = await boot({ w: s.w, h: s.h, touch: s.touch, hash: Q02_HASH });
      const vp = { w: s.w, h: s.h };
      // 보이는 기록이 있도록 Q02를 한 번 통과한다
      await completeQ02(page, s.touch ? 'touch' : 'mouse');
      await page.keyboard.press('Escape');
      await waitHome(page);
      await waitReady(page);
      await waitChunks(page);

      const landscape = s.w > s.h;
      const press = (loc: Locator): Promise<void> => (s.touch ? loc.tap() : loc.click());
      const menu = await boxesOf(page, '.hud-menu button');
      const tabBar = await boxesOf(page, '.hud-tabs button');
      const region = (await boxesOf(page, '.hud-region'))[0]!;
      for (const b of [...menu, ...tabBar]) expect(inside(b, vp), `${b.name} 이(가) 화면 밖에 있어요`).toBe(true);
      // 메뉴 단추끼리, 지역 이름과는 겹치지 않는다
      for (let i = 0; i < menu.length; i++) {
        expect(overlap(menu[i]!, region), `${menu[i]!.name}이(가) 지역 이름과 겹쳐요`).toBe(false);
        for (let j = i + 1; j < menu.length; j++) expect(overlap(menu[i]!, menu[j]!), `${menu[i]!.name}과 ${menu[j]!.name}이(가) 겹쳐요`).toBe(false);
      }
      if (landscape) {
        // 가로: 오른쪽 위에 지도, 목록, 수첩, 소리, 도움, 설정. 아래 탭 막대는 없다
        const names = menu.map((b) => b.name);
        for (const want of ['지도', '목록', '수첩', '도움', '설정']) expect(names.some((n) => n.startsWith(want)), `메뉴에 ${want}이(가) 없어요: ${names.join(' / ')}`).toBe(true);
        expect(menu.length).toBeGreaterThanOrEqual(6);
        expect(tabBar).toHaveLength(0);
      } else {
        // 세로: 아래 탭 막대 네 개(지도, 도전, 최근 작업, 도움). 위에는 소리와 설정만 남는다
        expect(tabBar.map((b) => b.text)).toEqual(['지도', '도전', '최근 작업', '도움']); // 보이는 글
        expect(tabBar.map((b) => b.name)).toEqual(['지도', '도전', '수첩, 최근 작업', '도움']); // 낭독기가 읽는 이름: 보이는 글을 포함한다
        for (const b of tabBar) {
          expect(b.h).toBeGreaterThanOrEqual(63.5);
          expect(b.w).toBeGreaterThanOrEqual(44);
        }
        expect(menu.some((b) => b.name.startsWith('수첩'))).toBe(false);
      }
      if (s.touch) for (const b of [...menu, ...tabBar]) expect(Math.min(b.w, b.h), `${b.name} 단추가 작아요`).toBeGreaterThanOrEqual(44);

      // 열기: 가로는 메뉴의 수첩 단추, 세로는 '최근 작업' 탭
      await press(landscape ? page.locator('.hud-menu .hud-btn', { hasText: '수첩' }) : page.getByRole('button', { name: '수첩, 최근 작업' }));
      await waitHash(page, '#/notebook');
      await waitNotebook(page);
      expect(await noHorizontalOverflow(page)).toBe(true);
      const frame = (await boxesOf(page, '[data-overlay="notebook"]'))[0]!;
      expect(inside(frame, vp)).toBe(true);
      const tabBoxes = await boxesOf(page, '[data-overlay="notebook"] [role="tab"]');
      expect(tabBoxes).toHaveLength(9);
      for (const b of tabBoxes) expect(b.h).toBeGreaterThanOrEqual(s.touch ? 44 : 32); // 탭 줄은 옆으로 밀리므로 폭은 화면 밖으로 이어져도 된다
      expect(inside((await boxesOf(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]'))[0]!, vp)).toBe(true);
      const pager = await boxesOf(page, '[data-overlay="notebook"] .nb-pager button');
      expect(pager.map((b) => b.name)).toEqual(['이전 쪽', '다음 쪽']);

      // 맨 위(제목, 쪽 탭, 첫 도전)를 한 장 남긴다. 사람이 눈으로 볼 자료다
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        for (const el of document.querySelectorAll('.overlay-shell, [data-overlay="notebook"]')) (el as HTMLElement).scrollTop = 0;
      });
      await page.screenshot({ path: path.join(SHOTS, `phase4-notebook-${s.name}-top.png`) });

      // 기록이 보인다: 마을 쪽의 Q02 통과 줄
      const line = quest(page, Q02).locator('.nb-pass').first();
      await line.scrollIntoViewIfNeeded();
      expect((await line.innerText()).replace(/\s+/g, ' ').trim()).toBe('✓ 통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이');
      const lineBox = (await boxesOf(page, `[data-overlay="notebook"] .nb-quest[data-quest="${Q02}"] .nb-pass`))[0]!;
      expect(lineBox.x).toBeGreaterThanOrEqual(-0.5);
      expect(lineBox.x + lineBox.w).toBeLessThanOrEqual(s.w + 0.5);
      await page.screenshot({ path: path.join(SHOTS, `phase4-notebook-${s.name}-records.png`) });

      // 쪽 넘기기: 단추로 관찰 쪽까지 가면 거기서도 고른 탭이 보이고, 내용이 가로로 넘치지 않는다
      await openPage(page, '관찰');
      expect(inside((await boxesOf(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]'))[0]!, vp)).toBe(true);
      expect(await noHorizontalOverflow(page)).toBe(true);
      expect(await page.locator('[data-overlay="notebook"] .nb-observation').count()).toBe(1);
      for (const b of await boxesOf(page, '[data-overlay="notebook"] .nb-observation')) {
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.w).toBeLessThanOrEqual(s.w + 0.5);
      }
      await press(page.getByRole('button', { name: '다음 쪽' })); // 관찰 다음은 처음 쪽
      expect(await selectedTab(page)).toBe('음악 마을');
      expect(inside((await boxesOf(page, '[data-overlay="notebook"] [role="tab"][aria-selected="true"]'))[0]!, vp)).toBe(true);

      // 돌아가기: 월드가 다시 움직인다
      await press(page.getByRole('button', { name: '돌아가기' }));
      await waitHome(page);
      expect((await status(page)).paused).toBe(false);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});
