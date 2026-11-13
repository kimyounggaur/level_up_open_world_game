// 3단계 흐름 시험(실제 Chrome), 저장 편: 3-8 '새로 고친 뒤 같은 자리, 같은 초안'과 5-7 '저장 복구'(망가진 저장을 지우지 않고, 살릴 수 있는 것은 살린다). 진짜 IndexedDB를 쓴다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserContext, Page } from 'playwright-core';
import { hashOf, pos, status, teleport, waitChunks, waitReady } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

const Q02_HASH = '#/q/rhythm.rest-in-a-bar/quarter-rest';
const KEY = (k: string): string => `levelup-music-world:v1:save:${k}`;

let h: Harness;
let tmp: string;
beforeAll(async () => {
  h = await startHarness();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-save-'));
});
afterAll(async () => {
  await h?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

interface Booted {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
}

/** 새 브라우저 맥락(= 새 저장소)에서 마을을 연다. init은 첫 화면을 열기 전에 맥락에 한 번 부른다(저장소 공간 부족 흉내 같은 것) */
async function bootFresh(opts: { hash?: string; skip?: boolean; init?: (ctx: BrowserContext) => Promise<void> } = {}): Promise<Booted> {
  const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
  await opts.init?.(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  if (opts.skip !== false) await skipIntro(page);
  return { ctx, page, errors };
}

/** 저장소(IndexedDB)에서 키 하나를 읽는다. 앱의 연결과 따로 연다 */
const idbRead = (p: Page, key: string): Promise<string | null> =>
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
    key,
  );

const idbWrite = (p: Page, key: string, value: string): Promise<void> =>
  p.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('levelup-music-world', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('save', 'readwrite');
          tx.objectStore('save').put(v as string, k as string);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as const,
  );

interface SavedShape {
  savedAt: string;
  explorationState: { position: { x: number; y: number; regionId: string; facing: string } | null; settings: { textSize: string }; openedQuests: string[] };
  preferences: { introSeen: boolean };
  challengeDrafts: Record<string, { slots: unknown[]; events: Array<{ eventId: string; kind?: string; pitch?: unknown }> }>;
  activeChallenge: { questId: string } | null;
  attempts: Array<{ attemptId: string }>;
}

/** 저장에 조건이 맞는 내용이 나타날 때까지 기다린다 */
async function waitForSave(p: Page, ok: (s: SavedShape) => boolean, timeout = 30000): Promise<SavedShape> {
  const start = Date.now();
  for (;;) {
    const text = await idbRead(p, KEY('current'));
    if (text) {
      const s = JSON.parse(text) as SavedShape;
      if (ok(s)) return s;
    }
    if (Date.now() - start > timeout) throw new Error(`저장에 기대한 내용이 나타나지 않았어요. 지금 저장: ${text?.slice(0, 300) ?? '(없음)'}`);
    await p.waitForTimeout(150);
  }
}

/** 지역이 바뀔 때까지 기다린다. 화면 갱신(rAF)에 기대지 않고 상태를 읽어 본다 */
async function waitRegion(p: Page, regionId: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const s = await status(p);
    if (s.regionId === regionId) return;
    if (Date.now() - start > timeout) throw new Error(`지역이 ${regionId}가 되지 않았어요: ${JSON.stringify(s)} ${JSON.stringify(await pos(p))}`);
    await p.waitForTimeout(100);
  }
}

/** 설정의 '저장' 구역. 같은 화면에 '사용 기록' 구역도 있어서 같은 모양의 글자 영역(.save-note 등)은 구역 안에서 찾는다 */
const saveSection = (p: Page) => p.locator('section[aria-labelledby="set-save"]');
const material = (page: Page, label: string) => page.locator('button.material', { hasText: label });
const cellButton = (page: Page, index: number) => page.locator('button.cell-mine').nth(index);
const goto = (p: Page, hash: string): Promise<void> => p.evaluate((x) => void (location.hash = x), hash);

/** Q02 초안에 C4와 D4를 놓는다(사람이 하는 대로 누른다) */
async function placeTwoNotes(page: Page): Promise<void> {
  await goto(page, Q02_HASH);
  await page.waitForSelector('button.cell-mine');
  await material(page, 'C4').click();
  await cellButton(page, 0).click();
  await material(page, 'D4').click();
  await cellButton(page, 1).click();
  expect(await cellButton(page, 0).innerText()).toContain('C4');
  expect(await cellButton(page, 1).innerText()).toContain('D4');
}

const isLarge = (p: Page): Promise<boolean> => p.evaluate(() => document.documentElement.getAttribute('data-text-size') === 'large');

describe('3-8 새로 고친 뒤 같은 자리, 같은 초안', () => {
  it('건반 늪(K3)에 서서, 글자를 크게 하고, Q02에 두 음을 놓은 뒤 새로 고치면 모두 그대로다', async () => {
    const { ctx, page, errors } = await bootFresh();
    await waitReady(page);
    await waitChunks(page);
    // 자리: 건반 늪 K3 앞으로
    expect(await teleport(page, 'K3')).toBe(true);
    await waitRegion(page, 'key-marsh');
    const spot = await pos(page);
    // 설정: 글자 크게
    await goto(page, '#/settings');
    await page.locator('button[data-text-size="large"]').click();
    expect(await isLarge(page)).toBe(true);
    // 초안: Q02에 두 음
    await placeTwoNotes(page);
    // 마을로 돌아간다(화면이 바뀌면 바로 저장한다)
    await page.keyboard.press('Escape');
    expect(await hashOf(page)).toBe('#/');
    const saved = await waitForSave(page, (s) => (s.challengeDrafts['rhythm.rest-in-a-bar/quarter-rest']?.events.length ?? 0) >= 2 && s.explorationState.settings.textSize === 'large' && s.explorationState.position?.regionId === 'key-marsh');
    expect(saved.preferences.introSeen).toBe(true);
    expect(saved.explorationState.position!.x).toBeCloseTo(spot.x, 0);
    expect(saved.explorationState.position!.y).toBeCloseTo(spot.y, 0);
    expect(saved.explorationState.openedQuests).toContain('rhythm.rest-in-a-bar');

    // 새로 고침
    await page.reload();
    await waitReady(page);
    expect(await page.locator('[data-intro]').count()).toBe(0); // 안내를 본 것을 기억한다
    expect(await isLarge(page)).toBe(true);
    const back = await pos(page);
    expect(Math.abs(back.x - spot.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.y - spot.y)).toBeLessThanOrEqual(1);
    expect((await status(page)).regionId).toBe('key-marsh');
    await page.waitForFunction(() => document.querySelector('.hud-region-name')?.textContent?.includes('건반 늪'), undefined, { timeout: 30000 });
    // 같은 초안
    await goto(page, Q02_HASH);
    await page.waitForSelector('button.cell-mine');
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(await cellButton(page, 1).innerText()).toContain('D4');
    expect(await cellButton(page, 2).innerText()).toContain('비어 있음');
    // 되돌리기 기록도 이어진다: 실행 취소가 켜져 있고, 누르면 D4가 사라진다
    const undo = page.getByRole('button', { name: '실행 취소' });
    expect(await undo.isEnabled()).toBe(true);
    await undo.click();
    expect(await cellButton(page, 1).innerText()).toContain('비어 있음');
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('고치자마자 새로 고쳐도 잃지 않는다: 닫히는 순간 동기 사본을 적는다', async () => {
    const { ctx, page, errors } = await bootFresh({ hash: Q02_HASH, skip: false });
    await page.waitForSelector('button.cell-mine');
    // 먼저 한 번 저장해 둔다(현재 저장이 있는 상태에서 더 새로운 사본이 이기는지 본다)
    await waitForSave(page, (s) => s.activeChallenge?.questId === 'rhythm.rest-in-a-bar');
    await material(page, 'C4').click();
    await cellButton(page, 0).click();
    // 모으는 시간(0.4초)을 기다리지 않고 페이지가 숨겨지는 순간을 일으킨다: 동기 사본은 바로 적혀 있어야 한다
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const emergency = await page.evaluate((k) => localStorage.getItem(k), KEY('emergency'));
    expect(emergency).not.toBeNull();
    const draft = (JSON.parse(emergency!) as SavedShape).challengeDrafts['rhythm.rest-in-a-bar/quarter-rest'];
    expect(draft?.events.length).toBe(1);
    // 새로 고쳐도 남는다
    await page.reload();
    await page.waitForSelector('button.cell-mine');
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    await ctx.close();
    expect(errors).toEqual([]);
  });

  it('현재 저장이 망가져도 직전 저장으로 열리고, 알림이 뜬다. 망가진 것은 지우지 않는다', async () => {
    const { ctx, page, errors } = await bootFresh({ hash: Q02_HASH, skip: false });
    await page.waitForSelector('button.cell-mine');
    const events = (s: SavedShape): number => s.challengeDrafts['rhythm.rest-in-a-bar/quarter-rest']?.events.length ?? 0;
    // 저장을 세 번 만든다: 빈 초안, C4, C4와 D4. 마지막이 현재가 되고, 그 앞(C4)이 직전 저장이 된다
    await waitForSave(page, (s) => s.activeChallenge?.questId === 'rhythm.rest-in-a-bar');
    await material(page, 'C4').click();
    await cellButton(page, 0).click();
    await waitForSave(page, (s) => events(s) === 1);
    await material(page, 'D4').click();
    await cellButton(page, 1).click();
    await waitForSave(page, (s) => events(s) === 2);
    expect(events(JSON.parse((await idbRead(page, KEY('previous')))!) as SavedShape)).toBe(1);
    // 현재 저장을 망가뜨리고 새로 고친다(바뀐 것이 없으니 닫히는 순간에 앱이 덮어쓰지 않는다)
    await idbWrite(page, KEY('current'), '{"망가진": ');
    await page.evaluate((k) => localStorage.removeItem(k), KEY('emergency'));
    await page.reload();
    await page.waitForSelector('button.cell-mine');
    const notice = page.locator('[data-save-notice]');
    await notice.waitFor();
    expect(await notice.innerText()).toContain('직전 저장으로 열었어요');
    // 직전 저장의 초안(C4)으로 열렸다. 가장 최근(D4)은 빠졌다
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(await cellButton(page, 1).innerText()).toContain('비어 있음');
    // 망가진 것은 지우지 않고 따로 남겼다
    expect(await idbRead(page, KEY('unreadable'))).toBe('{"망가진": ');
    // 되살린 저장이 현재가 되어, 다음 새로 고침은 평소처럼 열린다
    await page.reload();
    await page.waitForSelector('button.cell-mine');
    expect(await page.locator('[data-save-notice]').count()).toBe(0);
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('저장을 파일로 내보내고, 새 저장소(다른 기기)에서 가져오면 같은 자리, 같은 설정, 같은 초안이 된다', async () => {
    const a = await bootFresh();
    await waitReady(a.page);
    await waitChunks(a.page);
    expect(await teleport(a.page, 'K3')).toBe(true);
    await waitRegion(a.page, 'key-marsh');
    const spot = await pos(a.page);
    await goto(a.page, '#/settings');
    await a.page.locator('button[data-text-size="large"]').click();
    await placeTwoNotes(a.page);
    await goto(a.page, '#/settings');
    await waitForSave(a.page, (s) => (s.challengeDrafts['rhythm.rest-in-a-bar/quarter-rest']?.events.length ?? 0) >= 2 && s.explorationState.settings.textSize === 'large' && s.explorationState.position?.regionId === 'key-marsh');
    // 내보내기
    const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: '저장 내보내기' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^levelup-music-world-save-\d{4}-\d{2}-\d{2}\.json$/);
    const file = path.join(tmp, download.suggestedFilename());
    await download.saveAs(file);
    const exported = JSON.parse(fs.readFileSync(file, 'utf-8')) as SavedShape & { projectId: string };
    expect(exported.projectId).toBe('levelup-music-world');
    expect(exported.challengeDrafts['rhythm.rest-in-a-bar/quarter-rest']!.events).toHaveLength(2);
    expect(await saveSection(a.page).locator('.save-note').innerText()).toContain('파일로 내보냈어요');
    expect(a.errors).toEqual([]);
    await a.ctx.close();

    // 다른 기기: 새 저장소. 아무것도 없다
    const b = await bootFresh({ hash: '#/settings', skip: false });
    expect(await isLarge(b.page)).toBe(false);
    expect(await b.page.locator('[data-testid="save-status"]').innerText()).toMatch(/저장/);
    await b.page.setInputFiles('input[data-testid="save-file"]', file);
    const confirmBox = saveSection(b.page).locator('.save-confirm');
    await confirmBox.waitFor();
    expect(await confirmBox.innerText()).toContain('열어 본 도전 1개');
    // 가져와서 바꾸면 화면이 새로 불러와진다
    await Promise.all([b.page.waitForEvent('load'), b.page.getByRole('button', { name: '가져와서 바꾸기' }).click()]);
    await waitReady(b.page);
    expect(await b.page.locator('[data-intro]').count()).toBe(0);
    expect(await isLarge(b.page)).toBe(true);
    const back = await pos(b.page);
    expect(Math.abs(back.x - spot.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.y - spot.y)).toBeLessThanOrEqual(1);
    expect((await status(b.page)).regionId).toBe('key-marsh');
    await goto(b.page, Q02_HASH);
    await b.page.waitForSelector('button.cell-mine');
    expect(await cellButton(b.page, 0).innerText()).toContain('C4');
    expect(await cellButton(b.page, 1).innerText()).toContain('D4');
    // 옛 화면의 상태가 가져온 저장을 덮어쓰지 않았다: 가져온 파일의 내용이 그대로 현재 저장이다
    const current = JSON.parse((await idbRead(b.page, KEY('current')))!) as SavedShape;
    expect(current.explorationState.position!.regionId).toBe('key-marsh');
    expect(current.explorationState.settings.textSize).toBe('large');
    expect(b.errors).toEqual([]);
    await b.ctx.close();
  });

  it('틀린 파일은 묻기 전에 거르고, 진행은 그대로다', async () => {
    const { ctx, page, errors } = await bootFresh({ hash: '#/settings', skip: false });
    const bad = path.join(tmp, 'not-a-save.json');
    fs.writeFileSync(bad, '이건 저장 파일이 아니에요');
    await page.setInputFiles('input[data-testid="save-file"]', bad);
    await saveSection(page).locator('.save-note[data-kind="error"]').waitFor();
    expect(await saveSection(page).locator('.save-note').innerText()).toContain('가져올 수 없어요');
    expect(await saveSection(page).locator('.save-confirm').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 5-7 저장 복구(10.6, D-24): 망가진 저장은 지우지 않고, 읽을 수 있는 것은 살려서 열고, 더 새로운 판의 저장은 건드리지 않는다
// ---------------------------------------------------------------------------

const Q02_ID = 'rhythm.rest-in-a-bar';
const Q02_KEY = `${Q02_ID}/quarter-rest`;
const V2 = (k: string): string => `levelup-music-world:v2:save:${k}`;
const UNREAD_FILE = /^levelup-music-world-unread-\d{4}-\d{2}-\d{2}\.json$/;
const PASS_LINE = '✓ 통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이';

/** 읽을 수 있는(검사를 통과하는) Q02 통과 기록 하나 */
const passedAttempt = (attemptId: string): Record<string, unknown> => ({
  attemptId,
  questId: Q02_ID,
  variantId: 'quarter-rest',
  contentVersion: '0.1.0',
  recordedAt: '2026-11-11T09:00:00.000Z',
  resultType: 'passed',
  evaluator: 'flow',
  evaluatorVersion: '1',
  issues: [],
  hearing: 'confirmed',
  notMeasured: [],
  tempoBpm: 80,
  originalTempoBpm: 80,
  slowerThanOriginal: false,
  assistUsed: false,
  technical: null,
});

/** 닫히는 순간의 동기 사본(긴급)을 지운다: 저장소 칸을 일부러 망가뜨린 시험에서 그 사본이 되살려 버리지 않게 한다 */
const dropEmergency = (p: Page): Promise<void> => p.evaluate((k) => localStorage.removeItem(k), KEY('emergency'));

/** 설정 화면의 저장 구역이 그려질 때까지 연다 */
async function openSettings(p: Page): Promise<void> {
  await goto(p, '#/settings');
  await saveSection(p).waitFor();
}

/** 지금 저장(현재)을 읽어 모양을 돌려준다 */
async function currentSave<T = SavedShape>(p: Page): Promise<T> {
  const text = await idbRead(p, KEY('current'));
  if (text === null) throw new Error('현재 저장이 없어요');
  return JSON.parse(text) as T;
}

describe('5-7 저장 복구: 지우지 않고, 살릴 수 있는 것은 살린다', () => {
  it('현재와 직전 저장이 모두 일부 망가졌으면 읽을 수 있는 것(통과 기록, 초안, 설정)만 살려 열고, 원본은 따로 남겨 파일로 내려받을 수 있다', async () => {
    const { ctx, page, errors } = await bootFresh({ hash: Q02_HASH, skip: false });
    await page.waitForSelector('button.cell-mine');
    await placeTwoNotes(page);
    const base = await waitForSave(page, (s) => (s.challengeDrafts[Q02_KEY]?.events.length ?? 0) === 2);

    // 현재 저장: 통과 기록 셋(가운데 하나가 망가짐), 초안 둘(하나가 망가짐), 글자 크게. 직전 저장은 아예 읽을 수 없다
    const damaged = JSON.parse(JSON.stringify(base)) as Omit<SavedShape, 'attempts'> & { attempts: unknown[] };
    damaged.attempts = [passedAttempt('flow-a1'), { junk: true }, passedAttempt('flow-a3')];
    damaged.challengeDrafts['pitch.ghost/none'] = { slots: 'oops' } as never;
    damaged.explorationState.settings.textSize = 'large';
    const raw = JSON.stringify(damaged);
    await idbWrite(page, KEY('current'), raw);
    await idbWrite(page, KEY('previous'), '이건 직전 저장이 아니에요');
    await dropEmergency(page);
    await page.reload();
    await page.waitForSelector('button.cell-mine');

    // 알림: 일부만 살려서 열었다고 솔직하게 말한다
    const notice = page.locator('[data-save-notice]');
    await notice.waitFor();
    expect(await notice.innerText()).toContain('읽을 수 있는 것만 살려서 열었어요');
    // 살린 것: 초안(C4, D4)과 설정(글자 크게)
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(await cellButton(page, 1).innerText()).toContain('D4');
    expect(await isLarge(page)).toBe(true);
    // 원본은 한 글자도 바꾸지 않고 따로 남았고, 살린 것이 새 현재 저장이 됐다
    expect(await idbRead(page, KEY('unreadable'))).toBe(raw);
    const now = await currentSave(page);
    expect(now.attempts.map((a) => a.attemptId)).toEqual(['flow-a1', 'flow-a3']);
    expect(Object.keys(now.challengeDrafts)).toEqual([Q02_KEY]);
    expect(now.challengeDrafts[Q02_KEY]!.events).toHaveLength(2);
    expect(now.explorationState.settings.textSize).toBe('large');

    // 수첩에는 살린 통과 기록 둘이 그대로 적힌다(같은 조건의 통과는 한 줄에 '2번'으로 묶여 보인다)
    await goto(page, '#/notebook');
    const q02 = page.locator(`[data-overlay="notebook"] .nb-quest[data-quest="${Q02_ID}"]`);
    await q02.waitFor();
    expect((await q02.locator('.nb-pass').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())).toEqual([`${PASS_LINE} · 2번`]);

    // 설정의 저장 구역: 있었던 일을 하나씩 밝히고, 읽지 못한 원본을 내려받는 단추가 있다
    await openSettings(page);
    const sec = saveSection(page);
    expect(await sec.locator('.save-problem').innerText()).toContain('읽을 수 있는 것만 살려서 열었어요');
    const warnings = (await sec.locator('.save-warnings li').allInnerTexts()).map((t) => t.trim());
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.startsWith('통과 기록 1개를 읽을 수 없어 건너뛰었어요'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('초안 pitch.ghost/none: 읽을 수 없어 버렸어요'))).toBe(true);
    const [download] = await Promise.all([page.waitForEvent('download'), sec.getByTestId('save-unread-download').click()]);
    expect(download.suggestedFilename()).toMatch(UNREAD_FILE);
    const file = path.join(tmp, 'unread-a.json');
    await download.saveAs(file);
    expect(fs.readFileSync(file, 'utf-8')).toBe(raw);
    expect(await sec.locator('.save-note').innerText()).toContain('읽지 못한 저장을 파일로 내려받았어요');

    // 새로 고치면 평소처럼 열린다: 알림도 읽기 알림도 없다. 따로 남긴 원본은 그대로 있고 내려받는 길도 열려 있다
    await page.reload();
    await saveSection(page).waitFor();
    expect(await saveSection(page).locator('.save-problem').count()).toBe(0);
    expect(await saveSection(page).locator('.save-warnings').count()).toBe(0);
    expect(await saveSection(page).getByTestId('save-unread-download').count()).toBe(1);
    expect(await idbRead(page, KEY('unreadable'))).toBe(raw);
    await goto(page, Q02_HASH);
    await page.waitForSelector('button.cell-mine');
    expect(await page.locator('[data-save-notice]').count()).toBe(0);
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(await cellButton(page, 1).innerText()).toContain('D4');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('하나도 읽을 수 없으면 새로 시작하지만, 읽지 못한 저장을 지우지 않고 남기며, 그 뒤의 저장은 평소처럼 된다', async () => {
    const { ctx, page, errors } = await bootFresh();
    await waitForSave(page, (s) => s.preferences.introSeen);
    const garbage = '이건 저장이 아니에요 {{{ \u0000 ]]';
    await idbWrite(page, KEY('current'), garbage);
    await idbWrite(page, KEY('previous'), '{"half":');
    await dropEmergency(page);
    await page.reload();

    // 새로 시작했다(처음 안내 카드가 다시 뜬다). 알림은 읽지 못한 저장을 따로 남겼다고 말한다
    await page.waitForSelector('[data-intro]');
    const notice = page.locator('[data-save-notice]');
    await notice.waitFor();
    expect(await notice.innerText()).toContain('저장된 내용을 읽을 수 없어 새로 시작했어요. 망가진 저장은 지우지 않고 따로 남겨 뒀어요.');
    expect(await idbRead(page, KEY('unreadable'))).toBe(garbage);

    // 이어서 하면 새 저장이 평소처럼 적힌다. 따로 남긴 원본은 그대로다
    await skipIntro(page);
    const fresh = await waitForSave(page, (s) => s.preferences.introSeen);
    expect(fresh.attempts).toEqual([]);
    expect(await idbRead(page, KEY('unreadable'))).toBe(garbage);
    await openSettings(page);
    const [download] = await Promise.all([page.waitForEvent('download'), saveSection(page).getByTestId('save-unread-download').click()]);
    const file = path.join(tmp, 'unread-b.json');
    await download.saveAs(file);
    expect(fs.readFileSync(file, 'utf-8')).toBe(garbage);

    // 다시 열면 새 저장으로 열리고, 알림은 없다
    await page.reload();
    await saveSection(page).waitFor();
    expect(await saveSection(page).locator('.save-problem').count()).toBe(0);
    expect(await page.locator('[data-intro]').count()).toBe(0);
    expect(await idbRead(page, KEY('unreadable'))).toBe(garbage);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('더 새로운 판의 저장은 읽지도 덮어쓰지도 않는다: 새 판 키는 건드리지 않고, 같은 칸에 든 새 판 저장은 지우지 않고 남기며, 새 판 파일은 가져오지 않는다', async () => {
    const { ctx, page, errors } = await bootFresh({ hash: Q02_HASH, skip: false });
    await page.waitForSelector('button.cell-mine');
    await waitForSave(page, (s) => s.activeChallenge?.questId === Q02_ID);

    // (1) 같은 브라우저에 더 새로운 판(v2)의 저장이 있다. 이 판은 v1 키만 읽고 쓴다
    const v2cur = JSON.stringify({ projectId: 'levelup-music-world', saveSchemaVersion: 2, savedAt: '2030-01-01T00:00:00.000Z', 새로운: { 필드: [1, 2, 3] } });
    const v2prev = JSON.stringify({ projectId: 'levelup-music-world', saveSchemaVersion: 2, savedAt: '2029-12-31T00:00:00.000Z' });
    await idbWrite(page, V2('current'), v2cur);
    await idbWrite(page, V2('previous'), v2prev);
    await placeTwoNotes(page);
    await waitForSave(page, (s) => (s.challengeDrafts[Q02_KEY]?.events.length ?? 0) === 2);
    await page.reload();
    await page.waitForSelector('button.cell-mine');
    expect(await page.locator('[data-save-notice]').count()).toBe(0);
    expect(await cellButton(page, 1).innerText()).toContain('D4');
    expect(await idbRead(page, V2('current'))).toBe(v2cur);
    expect(await idbRead(page, V2('previous'))).toBe(v2prev);
    expect(await idbRead(page, V2('unreadable'))).toBeNull();
    expect(await idbRead(page, KEY('unreadable'))).toBeNull();

    // (2) 같은 v1 칸에 더 새로운 판의 저장이 들어 있다(파일을 손으로 옮긴 경우): 읽지 못하니 새로 시작하되, 그 저장은 지우지 않는다
    const newer = JSON.stringify({ ...(await currentSave<Record<string, unknown>>(page)), saveSchemaVersion: 2 });
    await idbWrite(page, KEY('current'), newer);
    await idbWrite(page, KEY('previous'), newer);
    await dropEmergency(page);
    await page.reload();
    await page.waitForSelector('button.cell-mine');
    const notice = page.locator('[data-save-notice]');
    await notice.waitFor();
    expect(await notice.innerText()).toContain('저장된 내용을 읽을 수 없어 새로 시작했어요');
    // 새로 시작했다: 앞서 놓았던 두 음이 없다
    expect(await cellButton(page, 0).innerText()).toContain('비어 있음');
    expect(await idbRead(page, KEY('unreadable'))).toBe(newer);
    expect(await idbRead(page, V2('current'))).toBe(v2cur);

    // (3) 더 새로운 판이 내보낸 파일은 가져오지 않는다. 지금 진행은 그대로다
    await skipIntro(page);
    await openSettings(page);
    const file = path.join(tmp, 'newer-version.json');
    fs.writeFileSync(file, newer);
    await page.setInputFiles('input[data-testid="save-file"]', file);
    const note = saveSection(page).locator('.save-note[data-kind="error"]');
    await note.waitFor();
    expect(await note.innerText()).toContain('가져올 수 없어요');
    expect(await note.innerText()).toContain('더 새로운 판의 저장이에요');
    expect(await saveSection(page).locator('.save-confirm').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('저장소가 가득 차도 계속 할 수 있다: 알리고, 파일로 내보내면 지금 진행이 담기고, 공간이 나면 다시 저장된다', async () => {
    const { ctx, page, errors } = await bootFresh({
      hash: Q02_HASH,
      skip: false,
      // 저장소가 가득 찬 것을 흉내 낸다: 켜 두면 IndexedDB에 긴 글자를 쓰려는 순간 QuotaExceededError가 난다
      init: async (c) => {
        await c.addInitScript(() => {
          const quota = { full: false, hits: 0 };
          (window as unknown as { __quota: typeof quota }).__quota = quota;
          const put = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey> {
            if (quota.full && typeof value === 'string' && value.length > 100) {
              quota.hits += 1;
              throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            }
            return put.call(this, value, key);
          };
        });
      },
    });
    await page.waitForSelector('button.cell-mine');
    await waitForSave(page, (s) => s.activeChallenge?.questId === Q02_ID);
    const setFull = (full: boolean): Promise<void> =>
      page.evaluate((f) => {
        (window as unknown as { __quota: { full: boolean } }).__quota.full = f;
      }, full);
    const hits = (): Promise<number> => page.evaluate(() => (window as unknown as { __quota: { hits: number } }).__quota.hits);

    // 가득 찼다. 두 음을 놓는다
    await setFull(true);
    await placeTwoNotes(page);
    const notice = page.locator('[data-save-notice]');
    await notice.waitFor();
    expect(await notice.innerText()).toContain('저장 공간이 가득 찼어요');
    expect(await hits()).toBeGreaterThan(0);
    // 하던 일은 계속 된다
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(await cellButton(page, 1).innerText()).toContain('D4');
    // 저장소에는 마지막으로 성공한 저장이 그대로 있다(반쯤 쓴 것이 남지 않았다)
    expect((await currentSave(page)).challengeDrafts[Q02_KEY]?.events.length ?? 0).toBe(0);
    expect(await idbRead(page, KEY('next'))).toBeNull();

    // 가득 찬 동안에도 파일로 내보낼 수 있고, 파일에는 지금 진행(두 음)이 담겨 있다
    await openSettings(page);
    expect(await saveSection(page).locator('.save-problem').innerText()).toContain('저장 공간이 가득 찼어요');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '저장 내보내기' }).click()]);
    const file = path.join(tmp, 'quota-full.json');
    await download.saveAs(file);
    const exported = JSON.parse(fs.readFileSync(file, 'utf-8')) as SavedShape;
    expect(exported.challengeDrafts[Q02_KEY]?.events).toHaveLength(2);

    // 공간이 나면 다음 고침부터 다시 저장되고, 알림이 사라진다
    await setFull(false);
    await goto(page, Q02_HASH);
    await page.waitForSelector('button.cell-mine');
    await material(page, 'D4').click();
    await cellButton(page, 2).click();
    const saved = await waitForSave(page, (s) => (s.challengeDrafts[Q02_KEY]?.events.length ?? 0) === 3);
    expect(saved.challengeDrafts[Q02_KEY]!.events).toHaveLength(3);
    await page.locator('[data-save-notice]').waitFor({ state: 'detached' });
    // 새로 고쳐도 세 음이 그대로다
    await page.reload();
    await page.waitForSelector('button.cell-mine');
    expect(await cellButton(page, 2).innerText()).toContain('D4');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
