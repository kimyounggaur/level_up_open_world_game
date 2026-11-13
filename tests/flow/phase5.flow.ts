// 5단계 흐름 테스트(실제 Chrome, 새 저장): 5-1 Q03 시간선 패널부터. 마우스로 끌지 않고, 키보드만으로, 터치만으로 끝낸다.
// 확대해도 잘리지 않고(7.9 3번), 누르는 곳이 48px 이상이며(7.6), 맞고 틀림이 색 없이도 구분되고(7.9 4번), 콘솔 오류가 없다.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserContext, Locator, Page } from 'playwright-core';
import { collectErrors, startHarness, type Harness } from './harness';
import { activeName, feedbackState, fullShot, tabTo } from './panelTools';

const Q03_URL = '#/q/rhythm.short-notes-and-triplets/thirty-seconds-triplet';
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');

let h: Harness;
beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

interface Opened {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
}

/** 새 브라우저 맥락 = 새 저장 */
async function openFresh(hash: string, opts: { touch?: boolean; width?: number; height?: number } = {}): Promise<Opened> {
  const ctx = await h.newContext({ viewport: { width: opts.width ?? (opts.touch ? 412 : 1280), height: opts.height ?? (opts.touch ? 915 : 800) }, hasTouch: opts.touch ?? false });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + hash);
  await page.waitForSelector('main h1, h1');
  return { ctx, page, errors };
}

const shot = async (page: Page, name: string): Promise<void> => {
  await fullShot(page, path.join(SHOTS, `${name}.png`));
};

type Pointer = 'mouse' | 'touch';
const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());

// ---------------------------------------------------------------------------
// 5-1 Q03

const kindBtn = (page: Page, kind: string) => page.locator(`button.material[data-kind="${kind}"]`);
const valueBtn = (page: Page, value: string) => page.locator(`button.material[data-value="${value}"]`);
const pitchBtn = (page: Page, pitch: string) => page.locator(`button.material[data-pitch="${pitch}"]`);
const beatBtn = (page: Page, beat: number) => page.locator(`.beat-button[data-beat="${beat - 1}"]`);
const zoomBtn = (page: Page, index: number) => page.locator('.trow-zoom.trow-mine button.tblock-face').nth(index);

async function pick(page: Page, how: Pointer, kind: string, opts: { value?: string; pitch?: string } = {}): Promise<void> {
  if ((await kindBtn(page, kind).getAttribute('aria-pressed')) !== 'true') await press(kindBtn(page, kind), how);
  if (opts.value) await press(valueBtn(page, opts.value), how);
  if (opts.pitch) await press(pitchBtn(page, opts.pitch), how);
}

/** 목표와 같은 배치를 눌러서 만든다: 1박 C4 32분 8개, 2박 D4 E4 F4 8분 셋잇단, 3박부터 2분쉼표 */
async function solveQ03(page: Page, how: Pointer): Promise<void> {
  await pick(page, how, 'note', { value: 'thirtySecond', pitch: 'C4' });
  for (let i = 0; i < 8; i++) await press(zoomBtn(page, i), how);
  await press(beatBtn(page, 2), how);
  await pick(page, how, 'raft', { pitch: 'D4' });
  await press(zoomBtn(page, 0), how);
  await pick(page, how, 'note', { pitch: 'E4' });
  await press(zoomBtn(page, 1), how);
  await pick(page, how, 'note', { pitch: 'F4' });
  await press(zoomBtn(page, 2), how);
  await press(beatBtn(page, 3), how);
  await pick(page, how, 'rest', { value: 'half' });
  await press(zoomBtn(page, 0), how);
}

describe('Q03 짧은 음과 셋잇단음: 새 저장에서 주소로 열린다 (5-1)', () => {
  it('열리면 박 고르기, 확대 창, 재료 세 단계, 악보 두 장이 보이고, 악보 글꼴이 로드되고, 오류가 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    expect(await page.locator('h1').textContent()).toBe('짧은 음과 셋잇단음');
    expect(await page.locator('.beat-button').count()).toBe(4);
    expect(await page.locator('.trow-zoom.trow-mine button.tblock-face').count()).toBe(8);
    expect(await page.locator('.trow-zoom.trow-target .tblock').count()).toBe(8);
    expect(await page.locator('.tray-step').count()).toBe(3);
    expect(await page.locator('svg.notation-svg').count()).toBe(2);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);
    // 조각의 너비는 틱에 비례한다: 1박 창의 칸 여덟 개는 같은 너비다
    const widths = await page.locator('.trow-zoom.trow-mine .tblock').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    await shot(page, 'q03-initial');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 마우스 클릭만으로 끝낸다(끌기 없음)', () => {
  it('32분음표 여덟 개, 셋잇단 묶음, 쉼을 놓고 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    await solveQ03(page, 'mouse');
    await page.getByRole('button', { name: '배치 확인' }).click();
    expect(await feedbackState(page)).toBe('passed');
    expect(await page.locator('.feedback').innerText()).toContain('통과했어요');
    expect(await page.locator('.tblock.has-error').count()).toBe(0);
    await shot(page, 'q03-passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 터치만으로 끝낸다(끌기 없음)', () => {
  it('손가락으로 누르기만 해서 통과한다. 누르는 곳은 모두 48px 이상이다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL, { touch: true });
    // 폭 412에서도 확대 창의 칸이 48px 이상이다(좁으면 확대 창이 가로로 밀린다)
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, a.nav-link, a.brand, [role="switch"], summary')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 48 || r.height < 48) out.push(`${el.getAttribute('aria-label') ?? el.innerText}: ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
    await solveQ03(page, 'touch');
    await page.getByRole('button', { name: '배치 확인' }).tap();
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 키보드만으로 끝낸다 (7.9 1번)', () => {
  it('Tab, Space, Enter, 화살표만으로 32분음표 여덟 개, 셋잇단 묶음, 쉼을 놓고 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    const pickKey = async (matches: (n: string) => boolean): Promise<void> => {
      await tabTo(page, matches, 160);
      await page.keyboard.press('Space');
    };
    // 1박: 32분음표 C4를 놓고, → 로 옆 칸으로 가며 Enter
    await pickKey((n) => n.startsWith('음 '));
    await pickKey((n) => n.startsWith('32분음표'));
    await pickKey((n) => n === 'C4');
    await tabTo(page, (n) => n.startsWith('1박, 비어'), 160);
    await page.keyboard.press('Enter');
    for (let i = 1; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
    }
    expect(await page.locator('.trow-zoom.trow-mine .tblock.kind-note').count()).toBe(8);
    // 창의 끝에서 →: 2박 창으로 넘어가고 초점은 첫 조각
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('#zoom-title').textContent()).toBe('2박 확대');
    expect(await activeName(page)).toMatch(/^2박, 비어 있음/);
    // 2박: 셋잇단 묶음(D4)
    await pickKey((n) => n.includes('셋잇단 묶음'));
    await pickKey((n) => n === 'D4');
    await tabTo(page, (n) => n.startsWith('2박, 비어'), 160);
    await page.keyboard.press('Enter');
    expect(await page.locator('.trow-zoom.trow-mine .tblock.in-raft').count()).toBe(3);
    // 돌 하나씩 바꾸기: E4, F4
    await pickKey((n) => n.startsWith('음 '));
    await pickKey((n) => n === 'E4');
    await tabTo(page, (n) => n.startsWith('2박 둘째 돌'), 160);
    await page.keyboard.press('Enter');
    await pickKey((n) => n === 'F4');
    await tabTo(page, (n) => n.startsWith('2박 셋째 돌'), 160);
    await page.keyboard.press('Enter');
    // 3박: PageDown으로 넘어가 2분쉼표
    await page.keyboard.press('PageDown');
    expect(await page.locator('#zoom-title').textContent()).toBe('3박 확대');
    await pickKey((n) => n.startsWith('쉼 '));
    await pickKey((n) => n.startsWith('2분쉼표'));
    await tabTo(page, (n) => n.startsWith('3박, 비어'), 160);
    await page.keyboard.press('Enter');
    await tabTo(page, (n) => n === '배치 확인', 160);
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    await shot(page, 'q03-passed-keyboard');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 표시만 셋잇단인 480틱 음 세 개는 실패한다 (5-1 완료 기준)', () => {
  it('보통 8분음표 셋을 놓으면 셋잇단 묶음이 아니라는 문장과 표시가 나온다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    await pick(page, 'mouse', 'note', { value: 'thirtySecond', pitch: 'C4' });
    for (let i = 0; i < 8; i++) await zoomBtn(page, i).click();
    // 2박에 보통 8분음표 D4 E4 (480틱씩)
    await beatBtn(page, 2).click();
    await pick(page, 'mouse', 'note', { value: 'eighth', pitch: 'D4' });
    await zoomBtn(page, 0).click();
    // 8분음표를 놓은 뒤 창은 [D4(12칸), 빈 칸들]이다
    await pick(page, 'mouse', 'note', { pitch: 'E4' });
    await page.locator('.trow-zoom.trow-mine button.tblock-face[data-kind="empty"]').first().click();
    await beatBtn(page, 3).click();
    await pick(page, 'mouse', 'rest', { value: 'half' });
    await zoomBtn(page, 0).click();
    await page.getByRole('button', { name: '배치 확인' }).click();
    expect(await feedbackState(page)).toBe('needsRevision');
    const lines = await page.locator('.feedback-line').allInnerTexts();
    expect(lines.join(' ')).toMatch(/묶음|셋잇단/);
    await beatBtn(page, 2).click();
    expect(await page.locator('.trow-zoom.trow-mine .tblock.has-error').count()).toBeGreaterThan(0);
    expect(await beatBtn(page, 2).getAttribute('aria-label')).toBe('2박 확대, 고칠 곳이 있어요');
    await shot(page, 'q03-plain-eighths-fail');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 놓을 수 없는 자리는 문장으로 알려 준다', () => {
  it('겹치는 자리에 놓으려 하면 이유가 보이고 아무것도 바뀌지 않는다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    await pick(page, 'mouse', 'note', { value: 'thirtySecond', pitch: 'C4' });
    await zoomBtn(page, 0).click();
    await zoomBtn(page, 1).click();
    await pick(page, 'mouse', 'note', { value: 'quarter', pitch: 'C4' });
    await zoomBtn(page, 0).click();
    const text = await page.locator('.tray-reject').innerText();
    expect(text).toContain('1박에 C4 4분음표를 놓으면');
    expect(text).toContain('겹친 것을 먼저 비워 주세요');
    expect(await page.locator('.trow-zoom.trow-mine .tblock.kind-note').count()).toBe(2);
    await shot(page, 'q03-overlap-rejected');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 확대해도 잘리지 않는다 (7.9 3번: 200% = 폭 640)', () => {
  it('가로로 넘치지 않고 모든 단추가 화면 폭 안에 있다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL, { width: 640, height: 900 });
    await solveQ03(page, 'mouse');
    await page.getByRole('button', { name: '배치 확인' }).click();
    await page.waitForTimeout(300);
    const report = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      const over: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, [role="slider"], [role="switch"], .beat-button, .slot-card, .card')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.left < -1 || r.right > window.innerWidth + 1) over.push(`${el.className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return { docW: document.documentElement.scrollWidth, innerW: window.innerWidth, mainOverflow: main.scrollWidth - main.clientWidth, over };
    });
    expect(report.docW).toBeLessThanOrEqual(report.innerW);
    expect(report.mainOverflow).toBeLessThanOrEqual(1);
    expect(report.over).toEqual([]);
    await shot(page, 'q03-zoom200');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 맞고 틀림이 색 없이도 구분된다 (7.9 4번)', () => {
  it('고칠 조각은 굵은 테두리, 그림 기호, 읽히는 이름, 문장을 함께 가진다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    await solveQ03(page, 'mouse');
    // 2박의 두 번째 돌을 쉼으로 바꿔 틀리게 한다
    await beatBtn(page, 2).click();
    await pick(page, 'mouse', 'rest');
    await zoomBtn(page, 1).click();
    await page.getByRole('button', { name: '배치 확인' }).click();
    expect(await feedbackState(page)).toBe('needsRevision');
    const bad = zoomBtn(page, 1);
    expect(await bad.locator('.tblock-mark svg').count()).toBe(1);
    expect(await bad.getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    const okFace = zoomBtn(page, 0);
    expect(await okFace.locator('.tblock-mark').count()).toBe(0);
    const badWidth = await bad.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    const okWidth = await okFace.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(badWidth).toBeGreaterThan(okWidth);
    expect(await beatBtn(page, 2).locator('.beat-mark svg').count()).toBe(1);
    expect(await page.locator('.feedback-line svg').count()).toBeGreaterThan(0);
    await shot(page, 'q03-wrong-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 소리를 끈 채로 어느 조각이 울리는지 보인다 (7.9 6번)', () => {
  it('소리가 꺼져 있어도 재생선이 개요와 확대 창에서 움직인다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    await solveQ03(page, 'mouse');
    await beatBtn(page, 1).click();
    await page.getByRole('button', { name: '내 배치 듣기' }).click();
    await page.waitForSelector('.trow-zoom.trow-mine .trow-playhead', { timeout: 3000 });
    await page.waitForSelector('.trow-zoom.trow-mine .tblock.is-playing', { timeout: 3000 });
    const first = await page.locator('.trow-overview.trow-mine .trow-playhead').evaluate((el) => parseFloat((el as HTMLElement).style.left));
    await page.waitForTimeout(600);
    const second = await page.locator('.trow-overview.trow-mine .trow-playhead').evaluate((el) => parseFloat((el as HTMLElement).style.left));
    expect(second).toBeGreaterThan(first);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts?: unknown[] }).__audioContexts?.length ?? 0)).toBe(0);
    await page.getByRole('button', { name: '정지' }).click();
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q03: 움직임 줄이기 (7.9 5번)', () => {
  it('줄이기를 켜면 전환과 애니메이션이 사실상 없다(1 ms 이하). 재생선은 그대로 나온다', async () => {
    const { ctx, page, errors } = await openFresh(Q03_URL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const rows = await page.evaluate(() => {
      const out: Array<{ el: string; t: number; a: number }> = [];
      for (const el of document.querySelectorAll<HTMLElement>('button, .tblock-face, .beat-button, .card, .feedback, .trow-playhead')) {
        const cs = getComputedStyle(el);
        const max = (v: string): number => Math.max(...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x))));
        out.push({ el: el.className || el.tagName, t: max(cs.transitionDuration), a: max(cs.animationDuration) });
      }
      return out;
    });
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => r.t > 0.001 || r.a > 0.001)).toEqual([]);
    await pick(page, 'mouse', 'note', { value: 'thirtySecond', pitch: 'C4' });
    await zoomBtn(page, 0).click();
    await page.getByRole('button', { name: '내 배치 듣기' }).click();
    await page.waitForSelector('.trow-playhead', { timeout: 3000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
