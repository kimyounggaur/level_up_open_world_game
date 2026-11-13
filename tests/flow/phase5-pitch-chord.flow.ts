// 5단계 흐름 테스트(실제 Chrome, 새 저장): 5-2 Q04 이름표·음정, 5-3 Q05·Q06 화음 패널.
// 마우스로 끌지 않고, 손가락으로 누르기만 하고, 키보드만으로 끝낸다. 확대해도 잘리지 않고(7.9 3번), 누르는 곳이 48px 이상이며(7.6),
// 맞고 틀림이 색 없이도 구분되고(7.9 4번), 소리를 끈 채로 어느 칸이 울리는지 보이고(7.9 6번), 콘솔 오류가 없다.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserContext, Page } from 'playwright-core';
import { collectErrors, startHarness, type Harness } from './harness';
import { activeName, feedbackState, fullShot, staffSpacings, tabTo } from './panelTools';
import type { Pointer } from './panelTools';

const Q04_TAGS = '#/q/pitch.same-sound-different-names/name-tags';
const Q04_INTERVALS = '#/q/pitch.same-sound-different-names/interval-names';
const Q05_C = '#/q/chord.major-triad/c-major';
const Q06_FIRST = '#/q/chord.inversion/c-first';
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

const press = (page: Page, selector: string, how: Pointer): Promise<void> => (how === 'touch' ? page.locator(selector).tap() : page.locator(selector).click());
const check = (page: Page, how: Pointer): Promise<void> => (how === 'touch' ? page.getByRole('button', { name: '배치 확인' }).tap() : page.getByRole('button', { name: '배치 확인' }).click());

/** 눌러서 고르는 단추가 모두 48px 이상인가 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, a.nav-link, a.brand, [role="switch"], summary')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 48 || r.height < 48) out.push(`${el.getAttribute('aria-label') ?? el.innerText}: ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

/** 가로로 넘치지 않고 모든 상자가 화면 폭 안에 있는가(확대 200% = 폭 640) */
async function overflowReport(page: Page): Promise<{ docW: number; innerW: number; mainOverflow: number; over: string[] }> {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement;
    const over: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, [role="slider"], [role="switch"], .slot-card, .card, svg.bell-tree, svg.key-picture')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < -1 || r.right > window.innerWidth + 1) over.push(`${el.getAttribute('class') ?? el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return { docW: document.documentElement.scrollWidth, innerW: window.innerWidth, mainOverflow: main.scrollWidth - main.clientWidth, over };
  });
}

/** 전환과 애니메이션이 사실상 없는가(7.9 5번) */
async function slowMotions(page: Page): Promise<Array<{ el: string; t: number; a: number }>> {
  const rows = await page.evaluate(() => {
    const out: Array<{ el: string; t: number; a: number }> = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, .choice, .card, .feedback, .slot-card')) {
      const cs = getComputedStyle(el);
      const max = (v: string): number => Math.max(...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x))));
      out.push({ el: el.className || el.tagName, t: max(cs.transitionDuration), a: max(cs.animationDuration) });
    }
    return out;
  });
  expect(rows.length).toBeGreaterThan(10);
  return rows.filter((r) => r.t > 0.001 || r.a > 0.001);
}

/** 악보 그림이 count개이고 모두 읽을 만한 크기다: 화면에서 오선 줄 간격이 10px 이상 */
async function expectReadableStaves(page: Page, count: number): Promise<void> {
  const spacings = await staffSpacings(page);
  expect(spacings.length, '악보 그림 수').toBe(count);
  for (const s of spacings) expect(s, `오선 줄 간격 ${s.toFixed(1)}px`).toBeGreaterThanOrEqual(10);
}

const audioContexts = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __audioContexts?: unknown[] }).__audioContexts?.length ?? 0);

// ---------------------------------------------------------------------------
// 키보드 도구: 눌러서 고르는 모음(roving tabindex)은 모음 전체가 Tab 정지 하나이고, 화살표로 옮겨 Enter로 고른다

/** Tab으로 selector 안의 요소에 초점이 올 때까지 간다 */
async function tabToIn(page: Page, selector: string, max = 200): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((sel) => !!document.activeElement?.closest(sel), selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`키보드로 '${selector}'에 닿지 못했어요. 마지막 이름: '${await activeName(page)}'`);
}

/** 모음(group)에 Tab으로 가서, 화살표로 target 단추(group 안의 선택자)까지 옮기고 Enter로 고른다 */
async function keyChoose(page: Page, group: string, target: string): Promise<void> {
  await tabToIn(page, group);
  const [from, to] = await page.evaluate(
    ([g, t]) => {
      const buttons = [...document.querySelectorAll(`${g} button`)];
      return [buttons.indexOf(document.activeElement as Element), buttons.indexOf(document.querySelector(`${g} button${t}`) as Element)];
    },
    [group, target],
  );
  expect(from, `${group}의 초점`).toBeGreaterThanOrEqual(0);
  expect(to, `${group} ${target}`).toBeGreaterThanOrEqual(0);
  for (let i = from!; i < to!; i++) await page.keyboard.press('ArrowRight');
  for (let i = from!; i > to!; i--) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
}

// ---------------------------------------------------------------------------
// 5-2 Q04 이름표

const tagGroup = (slot: 'up' | 'down', kind: 'letters' | 'accidentals'): string => `li.tag-card[data-slot="${slot}"] .pick-${kind}`;

async function solveTags(page: Page, how: Pointer): Promise<void> {
  await press(page, `${tagGroup('up', 'letters')} button[data-letter="C"]`, how);
  await press(page, `${tagGroup('up', 'accidentals')} button[data-accidental="sharp"]`, how);
  await press(page, `${tagGroup('down', 'letters')} button[data-letter="D"]`, how);
  await press(page, `${tagGroup('down', 'accidentals')} button[data-accidental="flat"]`, how);
}

describe('Q04 이름표 두 개: 새 저장에서 주소로 열린다 (5-2)', () => {
  it('열리면 건반 그림, 이름표 두 개, 음이름·변화표 고르개가 보이고, 악보 글꼴이 아닌 건반 그림이 정답을 말하지 않고, 오류가 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    expect(await page.locator('h1').textContent()).toBe('같은 높이의 다른 이름');
    expect(await page.locator('svg.key-picture').getAttribute('aria-label')).toBe('건반 그림: 흰 건반 C4와 D4 사이에 검은 건반이 하나 있어요');
    expect(await page.locator('li.tag-card').count()).toBe(2);
    expect(await page.locator('li.tag-card .pick-letters button').count()).toBe(14);
    expect(await page.locator('li.tag-card .pick-accidentals button').count()).toBe(6);
    expect(await page.locator('main').innerText()).not.toContain('C♯4');
    await shot(page, 'q04-tags-initial');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('고르개는 화면 낭독기가 읽는 이름을 가진다: 모음의 이름은 칸과 종류(예: 올려 부른 이름표: 음이름)다 (7.9 8번)', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    const group = page.getByRole('group', { name: '올려 부른 이름표: 음이름' });
    expect(await group.count()).toBe(1);
    expect(await group.getByRole('button').count()).toBe(7);
    // 변화표 모양(♯ ♭)은 장식이라 낭독기에서 숨기고, 단추의 이름은 글자로만 읽는다
    const accidentals = page.getByRole('group', { name: '내려 부른 이름표: 변화표' });
    expect(await accidentals.count()).toBe(1);
    expect(await accidentals.getByRole('button').count()).toBe(3);
    for (const name of ['샵', '플랫', '변화 없음']) expect(await accidentals.getByRole('button', { name }).count(), name).toBe(1);
    expect(await accidentals.getByRole('button', { name: '플랫' }).evaluate((el) => el.querySelector('.glyph')?.getAttribute('aria-hidden'))).toBe('true');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 이름표: 마우스 클릭만으로 끝낸다(끌기 없음)', () => {
  it('C♯4와 D♭4를 걸고 통과한다: 이름은 달라도 같은 소리', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    await solveTags(page, 'mouse');
    expect(await page.locator('li.tag-card[data-slot="up"] .tag-name').getAttribute('data-name')).toBe('C♯4');
    expect(await page.locator('li.tag-card[data-slot="down"] .tag-name').getAttribute('data-name')).toBe('D♭4');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('passed');
    expect(await page.locator('.feedback').innerText()).toContain('이름은 다르지만 같은 소리예요');
    await shot(page, 'q04-tags-passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 이름표: 터치만으로 끝낸다(끌기 없음)', () => {
  it('손가락으로 누르기만 해서 통과한다. 누르는 곳은 모두 48px 이상이다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS, { touch: true });
    expect(await smallTargets(page)).toEqual([]);
    await solveTags(page, 'touch');
    await check(page, 'touch');
    expect(await feedbackState(page)).toBe('passed');
    expect(await smallTargets(page)).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 이름표: 키보드만으로 끝낸다 (7.9 1번)', () => {
  it('Tab으로 모음에 가서 화살표로 옮기고 Enter로 골라 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    await keyChoose(page, tagGroup('up', 'letters'), '[data-letter="C"]');
    await keyChoose(page, tagGroup('up', 'accidentals'), '[data-accidental="sharp"]');
    await keyChoose(page, tagGroup('down', 'letters'), '[data-letter="D"]');
    await keyChoose(page, tagGroup('down', 'accidentals'), '[data-accidental="flat"]');
    expect(await page.locator('li.tag-card[data-slot="up"] .tag-name').getAttribute('data-name')).toBe('C♯4');
    expect(await page.locator('li.tag-card[data-slot="down"] .tag-name').getAttribute('data-name')).toBe('D♭4');
    await tabTo(page, (n) => n === '배치 확인', 160);
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    await shot(page, 'q04-tags-passed-keyboard');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('고르개 안에서 화살표는 초점만 옮기고 고르지 않는다. Tab 정지는 모음마다 하나다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    const stops = await page.locator(`${tagGroup('up', 'letters')} button[tabindex="0"]`).count();
    expect(stops).toBe(1);
    await tabToIn(page, tagGroup('up', 'letters'));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await activeName(page)).toBe('E');
    expect(await page.locator('li.tag-card[data-slot="up"] .tag-name').getAttribute('data-name')).toBe('');
    await page.keyboard.press('Space');
    expect(await page.locator('li.tag-card[data-slot="up"] .tag-name').getAttribute('data-name')).toBe('E4');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 이름표: 틀린 이름표는 색 없이도 구분된다 (7.9 4번)', () => {
  it('같은 이름 두 개: 고칠 이름표는 굵은 테두리, 그림 기호, 문장을 함께 가진다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    await press(page, `${tagGroup('up', 'letters')} button[data-letter="D"]`, 'mouse');
    await press(page, `${tagGroup('up', 'accidentals')} button[data-accidental="flat"]`, 'mouse');
    await press(page, `${tagGroup('down', 'letters')} button[data-letter="D"]`, 'mouse');
    await press(page, `${tagGroup('down', 'accidentals')} button[data-accidental="flat"]`, 'mouse');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    const bad = page.locator('li.tag-card[data-slot="up"]');
    const ok = page.locator('li.tag-card[data-slot="down"]');
    expect(await bad.locator('.slot-status.is-error svg').count()).toBe(1);
    expect(await bad.locator('.slot-status.is-error').innerText()).toContain('고칠 곳이 있어요');
    expect(await bad.locator('.slot-message').innerText()).toContain('소리 높이는 같지만 이름이 달라요');
    expect(await ok.locator('.slot-status.is-ok svg').count()).toBe(1);
    const badWidth = await bad.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    const okWidth = await ok.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(badWidth).toBeGreaterThan(okWidth);
    // 고른 단추는 색이 아니라 ✓ 표시와 aria-pressed로도 알린다
    expect(await page.locator(`${tagGroup('up', 'letters')} button[aria-pressed="true"] .choice-mark`).count()).toBe(1);
    await shot(page, 'q04-tags-wrong-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 이름표: 확대해도 잘리지 않고, 움직임 줄이기를 따르고, 소리를 끈 채 울리는 칸이 보인다', () => {
  it('폭 640(확대 200%)에서 가로로 넘치지 않는다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS, { width: 640, height: 900 });
    await solveTags(page, 'mouse');
    await check(page, 'mouse');
    await page.waitForTimeout(300);
    const report = await overflowReport(page);
    expect(report.docW).toBeLessThanOrEqual(report.innerW);
    expect(report.mainOverflow).toBeLessThanOrEqual(1);
    expect(report.over).toEqual([]);
    await shot(page, 'q04-tags-zoom200');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('줄이기를 켜면 전환과 애니메이션이 사실상 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await slowMotions(page)).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('소리가 꺼져 있어도 내 이름표를 듣는 동안 울리는 이름표 카드에 표시가 붙고 건반이 표시된다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_TAGS);
    await solveTags(page, 'mouse');
    await page.getByRole('button', { name: '내 이름표 듣기' }).click();
    await page.waitForSelector('li.tag-card.is-sounding[data-slot="up"]', { timeout: 3000 });
    expect(await page.locator('li.tag-card.is-sounding .slot-status.is-sounding').innerText()).toContain('지금 울리는 음');
    expect(await page.locator('svg.key-picture .key-black.is-sounding').count()).toBe(1);
    await page.waitForSelector('li.tag-card.is-sounding[data-slot="down"]', { timeout: 4000 });
    expect(await audioContexts(page)).toBe(0);
    await page.waitForSelector('li.tag-card.is-sounding', { state: 'detached', timeout: 5000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 5-2 Q04 음정 이름

const answerGroup = (qid: string, part: 'sound' | 'notation' | 'quality' | 'number'): string => `li.question-card[data-qid="${qid}"] .answer-${part}`;

async function solveIntervals(page: Page, how: Pointer): Promise<void> {
  await press(page, `${answerGroup('c1', 'sound')} button[data-answer="same"]`, how);
  await press(page, `${answerGroup('c1', 'notation')} button[data-answer="different"]`, how);
  await press(page, `${answerGroup('i1', 'quality')} button[data-quality="augmented"]`, how);
  await press(page, `${answerGroup('i1', 'number')} button[data-number="2"]`, how);
  await press(page, `${answerGroup('i2', 'quality')} button[data-quality="minor"]`, how);
  await press(page, `${answerGroup('i2', 'number')} button[data-number="3"]`, how);
}

describe('Q04 음정 이름: 새 저장에서 주소로 열린다 (5-2)', () => {
  it('질문 세 개와 각 질문의 두 음 악보가 보이고, 악보 글꼴이 로드되고, 정답이 보이지 않는다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_INTERVALS);
    expect(await page.locator('li.question-card').count()).toBe(3);
    expect(await page.locator('li.question-card svg.notation-svg').count()).toBe(3);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);
    const body = await page.locator('main').innerText();
    expect(body).not.toContain('증2도');
    expect(body).not.toContain('단3도');
    // 고르개는 질문과 부분을 이름으로 읽는다
    expect(await page.getByRole('group', { name: 'C♯4와 D♭4: 표기(음이름)는' }).getByRole('button').count()).toBe(2);
    expect(await page.getByRole('group', { name: 'C4에서 D♯4까지: 도수' }).getByRole('button').count()).toBe(8);
    await expectReadableStaves(page, 3);
    await shot(page, 'q04-intervals-initial');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 음정 이름: 마우스, 터치, 키보드로 끝낸다', () => {
  it('마우스 클릭만으로: 소리는 같고 표기는 다르다, 증2도, 단3도', async () => {
    const { ctx, page, errors } = await openFresh(Q04_INTERVALS);
    await solveIntervals(page, 'mouse');
    expect(await page.locator('li.question-card[data-qid="i1"] .tag-name').getAttribute('data-name')).toBe('증2도');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('passed');
    expect(await page.locator('.slot-status.is-ok').count()).toBe(3);
    await shot(page, 'q04-intervals-passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('손가락으로 누르기만 해서 통과한다. 누르는 곳은 모두 48px 이상이다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_INTERVALS, { touch: true });
    await expectReadableStaves(page, 3);
    expect(await smallTargets(page)).toEqual([]);
    await solveIntervals(page, 'touch');
    await check(page, 'touch');
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만으로 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_INTERVALS);
    await keyChoose(page, answerGroup('c1', 'sound'), '[data-answer="same"]');
    await keyChoose(page, answerGroup('c1', 'notation'), '[data-answer="different"]');
    await keyChoose(page, answerGroup('i1', 'quality'), '[data-quality="augmented"]');
    await keyChoose(page, answerGroup('i1', 'number'), '[data-number="2"]');
    await keyChoose(page, answerGroup('i2', 'quality'), '[data-quality="minor"]');
    await keyChoose(page, answerGroup('i2', 'number'), '[data-number="3"]');
    await tabTo(page, (n) => n === '배치 확인', 160);
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q04 음정 이름: 틀리면 고칠 질문과 부분이 색 없이도 구분된다 (7.9 4번)', () => {
  it('표기를 같다고 하면 그 질문의 표기 부분만 굵은 테두리와 기호와 문장으로 알린다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_INTERVALS);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    await press(page, `${answerGroup('c1', 'sound')} button[data-answer="same"]`, 'mouse');
    await press(page, `${answerGroup('c1', 'notation')} button[data-answer="same"]`, 'mouse');
    await press(page, `${answerGroup('i1', 'quality')} button[data-quality="minor"]`, 'mouse');
    await press(page, `${answerGroup('i1', 'number')} button[data-number="3"]`, 'mouse');
    await press(page, `${answerGroup('i2', 'quality')} button[data-quality="minor"]`, 'mouse');
    await press(page, `${answerGroup('i2', 'number')} button[data-number="3"]`, 'mouse');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    const lines = (await page.locator('.feedback-line').allInnerTexts()).join(' ');
    expect(lines).toContain('표기(음이름)가 달라요');
    expect(lines).toContain('목표는 증2도');
    const badGroup = page.locator(answerGroup('c1', 'notation'));
    const okGroup = page.locator(answerGroup('c1', 'sound'));
    expect(await badGroup.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(await okGroup.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth)));
    expect(await page.locator('li.question-card[data-qid="c1"] .slot-status.is-error svg').count()).toBe(1);
    expect(await page.locator('li.question-card[data-qid="i2"] .slot-status.is-ok svg').count()).toBe(1);
    await shot(page, 'q04-intervals-wrong-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('폭 640(확대 200%)에서 가로로 넘치지 않는다', async () => {
    const { ctx, page, errors } = await openFresh(Q04_INTERVALS, { width: 640, height: 900 });
    await solveIntervals(page, 'mouse');
    await check(page, 'mouse');
    await page.waitForTimeout(300);
    const report = await overflowReport(page);
    expect(report.docW).toBeLessThanOrEqual(report.innerW);
    expect(report.mainOverflow).toBeLessThanOrEqual(1);
    expect(report.over).toEqual([]);
    await expectReadableStaves(page, 3);
    await shot(page, 'q04-intervals-zoom200');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 5-3 Q05 장3화음 조립

const bellGroup = (n: number, kind: 'letters' | 'accidentals' | 'octaves'): string => `li.bell-card[data-slot="tone-${n - 1}"] .pick-${kind}`;
const bellName = (page: Page, n: number): Promise<string | null> => page.locator(`li.bell-card[data-slot="tone-${n - 1}"] .tag-name`).getAttribute('data-name');

async function hangBell(page: Page, how: Pointer, n: number, letter: string): Promise<void> {
  await press(page, `${bellGroup(n, 'letters')} button[data-letter="${letter}"]`, how);
}

describe('Q05 장3화음 조립: 새 저장에서 주소로 열린다 (5-3)', () => {
  it('열리면 종나무, 종 네 칸, 내 종의 악보가 보이고, 악보 글꼴이 로드되고, 정답 구성음이 보이지 않는다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    expect(await page.locator('h1').textContent()).toBe('장3화음 조립하기');
    expect(await page.locator('li.bell-card').count()).toBe(4);
    expect(await page.locator('svg.bell-tree .tree-row').count()).toBe(2);
    expect(await page.locator('.score-view svg.notation-svg').count()).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);
    expect(await page.locator('main').innerText()).not.toContain('C E G');
    await expectReadableStaves(page, 1);
    await shot(page, 'q05-initial');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q05: 마우스, 터치, 키보드로 끝낸다 (끌기 없음)', () => {
  it('마우스 클릭만으로 C E G를 걸고 통과한다. 종나무와 악보가 따라 바뀐다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    for (const [n, l] of [[1, 'C'], [2, 'E'], [3, 'G']] as const) await hangBell(page, 'mouse', n, l);
    expect(await page.locator('svg.bell-tree .tree-bell').count()).toBe(3);
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('passed');
    expect(await page.locator('.feedback').innerText()).toContain('C장3화음의 구성음이 모두 걸렸어요');
    expect(await page.locator('.slot-status.is-ok').count()).toBe(3);
    await shot(page, 'q05-passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('손가락으로 누르기만 해서 통과한다. 누르는 곳은 모두 48px 이상이다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C, { touch: true });
    await expectReadableStaves(page, 1);
    expect(await smallTargets(page)).toEqual([]);
    for (const [n, l] of [[1, 'C'], [2, 'E'], [3, 'G']] as const) await hangBell(page, 'touch', n, l);
    await check(page, 'touch');
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만으로 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    await keyChoose(page, bellGroup(1, 'letters'), '[data-letter="C"]');
    await keyChoose(page, bellGroup(2, 'letters'), '[data-letter="E"]');
    await keyChoose(page, bellGroup(3, 'letters'), '[data-letter="G"]');
    expect([await bellName(page, 1), await bellName(page, 2), await bellName(page, 3)]).toEqual(['C4', 'E4', 'G4']);
    await tabTo(page, (n) => n === '배치 확인', 160);
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q05: C E G D는 실패한다 (5-3 완료 기준)', () => {
  it('넘치는 D 종만 고칠 곳으로 알리고, 맞게 건 종은 맞다고 한다. 색 없이도 구분된다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    for (const [n, l] of [[1, 'C'], [2, 'E'], [3, 'G'], [4, 'D']] as const) await hangBell(page, 'mouse', n, l);
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    expect(await page.locator('.feedback').innerText()).toContain('D가 더해져 있어요');
    const bad = page.locator('li.bell-card[data-slot="tone-3"]');
    const ok = page.locator('li.bell-card[data-slot="tone-0"]');
    expect(await bad.locator('.slot-status.is-error svg').count()).toBe(1);
    expect(await bad.locator('.slot-message').innerText()).toContain('D가 더해져 있어요');
    expect(await ok.locator('.slot-status.is-ok svg').count()).toBe(1);
    expect(await bad.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(await ok.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth)));
    await shot(page, 'q05-cegd-fail-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('G가 빠지면 문장으로 알린다. 종마다의 고칠 곳 표시는 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    await hangBell(page, 'mouse', 1, 'C');
    await hangBell(page, 'mouse', 2, 'E');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    expect(await page.locator('.feedback').innerText()).toContain('G가 빠졌어요');
    expect(await page.locator('li.bell-card.has-error').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q05: 확대해도 잘리지 않고, 움직임 줄이기를 따르고, 소리를 끈 채 울리는 종이 보인다', () => {
  it('폭 640(확대 200%)에서 가로로 넘치지 않는다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C, { width: 640, height: 900 });
    for (const [n, l] of [[1, 'C'], [2, 'E'], [3, 'G'], [4, 'D']] as const) await hangBell(page, 'mouse', n, l);
    await check(page, 'mouse');
    await page.waitForTimeout(300);
    const report = await overflowReport(page);
    expect(report.docW).toBeLessThanOrEqual(report.innerW);
    expect(report.mainOverflow).toBeLessThanOrEqual(1);
    expect(report.over).toEqual([]);
    await expectReadableStaves(page, 1);
    await shot(page, 'q05-zoom200');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('줄이기를 켜면 전환과 애니메이션이 사실상 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await slowMotions(page)).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('함께 울리기: 소리가 꺼져 있어도 걸린 종 모두에 울림 표시가 붙었다가 끝나면 사라진다', async () => {
    const { ctx, page, errors } = await openFresh(Q05_C);
    for (const [n, l] of [[1, 'C'], [2, 'E'], [3, 'G']] as const) await hangBell(page, 'mouse', n, l);
    await page.getByRole('button', { name: '함께 울리기' }).click();
    await page.waitForSelector('li.bell-card.is-sounding', { timeout: 3000 });
    expect(await page.locator('li.bell-card.is-sounding').count()).toBe(3);
    expect(await page.locator('svg.bell-tree .tree-bell.is-sounding').count()).toBe(3);
    expect(await audioContexts(page)).toBe(0);
    await page.waitForSelector('li.bell-card.is-sounding', { state: 'detached', timeout: 6000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 5-3 Q06 전위

const bellBtn = (page: Page, n: number, name: string) => page.locator(`li.bell-card[data-slot="tone-${n - 1}"]`).getByRole('button', { name: `종 ${n}: ${name}` });
const bellNames = (page: Page): Promise<string[]> => page.locator('li.bell-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-name') ?? ''));
const bassNow = (page: Page): Promise<string | null> => page.locator('.bass-readout').getAttribute('data-bass');

describe('Q06 전위: 새 저장에서 주소로 열린다 (5-3)', () => {
  it('열리면 종탑, 기본 위치로 걸린 종 세 개, 가장 낮은 종 표시, 내 종의 악보가 보인다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    expect(await page.locator('h1').textContent()).toBe('베이스를 바꾸어 전위 만들기');
    expect(await bellNames(page)).toEqual(['C3', 'E3', 'G3']);
    expect(await bassNow(page)).toBe('C3');
    expect(await page.locator('li.bell-card.is-lowest').count()).toBe(1);
    expect(await page.locator('svg.bell-tree .tree-row').count()).toBe(4);
    expect(await page.locator('.score-view svg.notation-svg').count()).toBe(1);
    // 보표 둘: 높은음자리표와 낮은음자리표
    expect(await page.locator('.score-view .vf-stave').count()).toBe(2);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);
    await expectReadableStaves(page, 1);
    await shot(page, 'q06-initial');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q06: 마우스, 터치, 키보드로 끝낸다 (끌기 없음)', () => {
  it('마우스 클릭만으로 C를 한 옥타브 올려 제1전위를 만들고 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    expect(await page.locator('.feedback').innerText()).toContain('현재 가장 낮은 음은 C3이에요. 그래서 기본 위치예요. 목표는 제1전위예요.');
    await bellBtn(page, 1, '옥타브 올리기').click();
    expect(await feedbackState(page)).toBe('none');
    expect(await bellNames(page)).toEqual(['C4', 'E3', 'G3']);
    expect(await bassNow(page)).toBe('E3');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('passed');
    await shot(page, 'q06-passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('손가락으로 누르기만 해서 통과한다. 누르는 곳은 모두 48px 이상이다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST, { touch: true });
    await expectReadableStaves(page, 1);
    expect(await smallTargets(page)).toEqual([]);
    await bellBtn(page, 1, '옥타브 올리기').tap();
    await check(page, 'touch');
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만으로 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    await tabTo(page, (n) => n === '종 1: 옥타브 올리기', 200);
    await page.keyboard.press('Enter');
    expect(await bellNames(page)).toEqual(['C4', 'E3', 'G3']);
    await tabTo(page, (n) => n === '배치 확인', 200);
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q06: 화면의 가로 순서를 바꿔도 전위는 그대로다 (5-3 완료 기준)', () => {
  it('통과한 배치에서 종의 자리를 여러 번 바꿔도 가장 낮은 음과 판정이 그대로다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    await bellBtn(page, 1, '옥타브 올리기').click();
    const orders: string[] = [];
    for (const [n, dir] of [[1, '오른쪽으로 자리 바꾸기'], [2, '오른쪽으로 자리 바꾸기'], [3, '왼쪽으로 자리 바꾸기'], [2, '왼쪽으로 자리 바꾸기']] as const) {
      await bellBtn(page, n, dir).click();
      orders.push((await bellNames(page)).join(' '));
      expect(await bassNow(page)).toBe('E3');
      await check(page, 'mouse');
      expect(await feedbackState(page)).toBe('passed');
    }
    // 실제로 가로 순서가 바뀌었다
    expect(new Set(orders).size).toBeGreaterThan(2);
    await shot(page, 'q06-reordered-passed');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('기본 위치에서 순서만 바꾸면 여전히 기본 위치라서 실패한다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    await bellBtn(page, 1, '오른쪽으로 자리 바꾸기').click();
    await bellBtn(page, 2, '오른쪽으로 자리 바꾸기').click();
    expect(await bellNames(page)).toEqual(['E3', 'G3', 'C3']);
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    expect(await page.locator('.feedback').innerText()).toContain('그래서 기본 위치예요');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q06: 소리 끄기와 듣기, 접근성', () => {
  it('종의 소리를 끄면 점선과 글자와 ✕ 표시로 알리고, 가장 낮은 음에서 빠진다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    await bellBtn(page, 1, '소리 끄기').click();
    expect(await bassNow(page)).toBe('E3');
    const card = page.locator('li.bell-card[data-slot="tone-0"]');
    expect(await card.locator('.slot-status.is-muted').innerText()).toContain('소리 꺼짐');
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
    expect(await page.locator('svg.bell-tree .tree-bell.is-muted .tree-x').count()).toBe(1);
    expect(await page.locator('li.bell-card.is-lowest .slot-status.is-lowest').innerText()).toContain('가장 낮은 종');
    await check(page, 'mouse');
    expect(await feedbackState(page)).toBe('needsRevision');
    expect(await page.locator('.feedback').innerText()).toContain('C가 없어 완전한 3화음 조건을 먼저 확인해야 해요');
    await shot(page, 'q06-muted-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('가장 낮은 종만 듣기: 소리가 꺼져 있어도 그 종 카드에만 울림 표시가 붙는다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    await bellBtn(page, 1, '오른쪽으로 자리 바꾸기').click();
    await page.getByRole('button', { name: '가장 낮은 종만' }).click();
    await page.waitForSelector('li.bell-card.is-sounding', { timeout: 3000 });
    expect(await page.locator('li.bell-card.is-sounding').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')))).toEqual(['C3']);
    expect(await audioContexts(page)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('음역 밖으로 옮기면 이유가 안내 문장으로 나온다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST);
    await bellBtn(page, 1, '옥타브 내리기').click();
    await bellBtn(page, 1, '옥타브 내리기').click();
    expect(await page.locator('.sr-only[role="status"]').innerText()).toBe('종 1: 더 낮게 내릴 수 없어요. 이 도전의 음역은 C2부터 B5까지예요.');
    expect(await bellNames(page)).toEqual(['C2', 'E3', 'G3']);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('폭 640(확대 200%)에서 가로로 넘치지 않는다. 줄이기를 켜면 전환이 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q06_FIRST, { width: 640, height: 900 });
    await bellBtn(page, 1, '옥타브 올리기').click();
    await check(page, 'mouse');
    await page.waitForTimeout(300);
    const report = await overflowReport(page);
    expect(report.docW).toBeLessThanOrEqual(report.innerW);
    expect(report.mainOverflow).toBeLessThanOrEqual(1);
    expect(report.over).toEqual([]);
    await expectReadableStaves(page, 1);
    await shot(page, 'q06-zoom200');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await slowMotions(page)).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 설정의 글자 크기 '크게'(1.25배, 7.8): 그림 속 글자도 배율을 따라가므로 넘치거나 겹치는지 잰다

/**
 * 그림(종나무·종탑·건반) 안에서 글자끼리, 또 글자와 가지 선이 겹치는 쌍.
 * 가로세로 1px보다 크게 겹치면 겹친 것이다. 가지 선은 굵기(4)의 절반만큼 상자를 넓혀서 잰다.
 */
async function overlappingTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const overlap = (a: DOMRect, b: DOMRect): boolean => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    for (const svg of document.querySelectorAll<SVGSVGElement>('svg.bell-tree, svg.key-picture')) {
      const scale = svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 1);
      const texts = [...svg.querySelectorAll<SVGTextElement>('text')].map((t) => ({ t: t.textContent ?? '', r: t.getBoundingClientRect(), cross: t.classList.contains('tree-x') }));
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) if (overlap(texts[i]!.r, texts[j]!.r)) out.push(`${texts[i]!.t} × ${texts[j]!.t}`);
      }
      for (const line of svg.querySelectorAll<SVGLineElement>('line.tree-branch')) {
        const r = line.getBoundingClientRect();
        const pad = 2 * scale;
        const box = new DOMRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2);
        // ✕는 종 몸통 안에 그려지고 글자 상자(줄 높이)만 몸통보다 넉넉하다. 가지 선과의 겹침은 따지지 않는다
        for (const t of texts) if (!t.cross && overlap(t.r, box)) out.push(`${t.t} × 가지 선`);
      }
    }
    return out;
  });
}

describe('큰 글자(글자 크기 설정 = 크게, 1.25배): 넘치거나 겹치지 않는다', () => {
  const CASES: ReadonlyArray<readonly [string, string]> = [
    ['Q04 이름표', Q04_TAGS],
    ['Q04 음정 이름', Q04_INTERVALS],
    ['Q05 장3화음', Q05_C],
    ['Q06 전위', Q06_FIRST],
  ];
  for (const [name, hash] of CASES) {
    for (const width of [1280, 412]) {
      it(`${name}, 폭 ${width}: 가로로 넘치지 않고 그림 속 글자가 겹치지 않는다`, async () => {
        const { ctx, page, errors } = await openFresh(hash, { width, height: width === 412 ? 915 : 800, touch: width === 412 });
        await page.evaluate(() => {
          document.documentElement.dataset.textSize = 'large';
        });
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim())).toBe('1.25');
        // 종을 더해 그림에 글자가 여럿 나오게 하고, 판정 문장도 나오게 한다
        if (hash === Q05_C) for (const [n, l] of [[1, 'C'], [2, 'E'], [3, 'G'], [4, 'D']] as const) await hangBell(page, width === 412 ? 'touch' : 'mouse', n, l);
        if (hash === Q06_FIRST) await bellBtn(page, 1, '소리 끄기').click();
        await check(page, width === 412 ? 'touch' : 'mouse');
        await page.waitForTimeout(250);
        const report = await overflowReport(page);
        expect(report.docW, '문서 폭').toBeLessThanOrEqual(report.innerW);
        expect(report.mainOverflow, '본문 넘침').toBeLessThanOrEqual(1);
        expect(report.over, '화면 밖으로 나간 상자').toEqual([]);
        expect(await overlappingTexts(page), '겹친 글자').toEqual([]);
        await shot(page, `large-text-${hash.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${width}`);
        expect(errors).toEqual([]);
        await ctx.close();
      });
    }
  }
});
