// 2단계 흐름 테스트(실제 Chrome, 새 저장). 단계 완료 기준(12.5): 키보드만으로, 그리고 터치만으로 Q01과 Q02를 끝낸다.
// 마우스로 끌지 않는다. 소리는 켜기 전까지 나지 않는다. 확대해도 잘리지 않는다. 콘솔 오류가 없다.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserContext, Page } from 'playwright-core';
import { collectErrors, startHarness, type Harness } from './harness';
import { activeName, cellButton, feedbackState, material, staffPoint, tabTo, tapStaff, valueText } from './panelTools';

const Q01_URL = '#/q/pitch.same-note-two-clefs/middle-c';
const Q02_URL = '#/q/rhythm.rest-in-a-bar/quarter-rest';
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

/** 새 브라우저 맥락 = 새 저장. 오디오 장치가 만들어진 횟수를 센다 */
async function openFresh(hash: string, opts: { touch?: boolean; width?: number; height?: number } = {}): Promise<Opened> {
  const ctx = await h.newContext({ viewport: { width: opts.width ?? (opts.touch ? 412 : 1280), height: opts.height ?? (opts.touch ? 915 : 800) }, hasTouch: opts.touch ?? false });
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
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + hash);
  await page.waitForSelector('main h1, h1');
  return { ctx, page, errors };
}

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

// ---------------------------------------------------------------------------
// 마우스로 누르는 도구(터치 도구 tapStaff는 panelTools.ts에 있다)

async function clickStaff(page: Page, slot: string, position: number): Promise<void> {
  const { x, y } = await staffPoint(page, slot, position);
  await page.mouse.click(x, y);
}

// ---------------------------------------------------------------------------

describe('Q02 쉼이 있는 한 마디: 새 저장에서 주소로 열린다 (2-8)', () => {
  it('열리면 시안 B02의 구성이 보이고, 악보 글꼴이 로드되고, 오류가 없다', async () => {
    const { ctx, page, errors } = await openFresh(Q02_URL);
    expect(await page.locator('h1').textContent()).toBe('쉼이 있는 한 마디');
    expect(await page.locator('button.cell-mine').count()).toBe(4);
    expect(await page.locator('svg.notation-svg').count()).toBe(2);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);
    // 악보 그림의 크기가 화면 폭에 맞는다(VexFlow의 고정 크기가 남아 있지 않다)
    const w = await page.locator('svg.notation-svg').first().evaluate((el) => (el as SVGSVGElement).getBoundingClientRect().width);
    const box = await page.locator('.score-figure').first().evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
    expect(w).toBeGreaterThan(box * 0.8);
    await shot(page, 'q02-initial');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q02: 키보드만으로 끝낸다', () => {
  it('Tab, Space, Enter만으로 한 마디를 놓고 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q02_URL);
    const plan: Array<[string, number]> = [
      ['C4', 0],
      ['쉼', 1],
      ['D4', 2],
      ['E4', 3],
    ];
    for (const [label, cell] of plan) {
      await tabTo(page, (n) => n.startsWith(label) && !n.includes('박,'));
      await page.keyboard.press('Space');
      expect(await material(page, label).getAttribute('aria-pressed')).toBe('true');
      await tabTo(page, (n) => n.startsWith(`${cell + 1}박,`));
      await page.keyboard.press('Enter');
      expect(await cellButton(page, cell).innerText()).toContain(label === '쉼' ? '쉼' : label);
    }
    await tabTo(page, (n) => n === '배치 확인');
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    expect(await page.locator('.feedback').innerText()).toContain('통과했어요');
    await shot(page, 'q02-passed-keyboard');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('칸에서 ← →로 옮기고 Delete로 비우고 Ctrl+Z로 되돌린다', async () => {
    const { ctx, page, errors } = await openFresh(Q02_URL);
    await tabTo(page, (n) => n.startsWith('C4') && !n.includes('박,'));
    await page.keyboard.press('Space');
    await tabTo(page, (n) => n.startsWith('1박,'));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    expect(await activeName(page)).toMatch(/^2박,/);
    await page.keyboard.press('ArrowLeft');
    expect(await activeName(page)).toMatch(/^1박, C4/);
    await page.keyboard.press('Delete');
    expect(await cellButton(page, 0).innerText()).toContain('비어 있음');
    await page.keyboard.press('Control+z');
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q02: 터치만으로 끝낸다(끌기 없음)', () => {
  it('시안의 상태(둘째 박에 D4)에서 시안과 같은 문장이 나오고, 쉼으로 고치면 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q02_URL, { touch: true });
    for (const [label, cell] of [['C4', 0], ['D4', 1], ['D4', 2], ['E4', 3]] as const) {
      const m = material(page, label);
      if ((await m.getAttribute('aria-pressed')) !== 'true') await m.tap();
      await cellButton(page, cell).tap();
    }
    await page.getByRole('button', { name: '배치 확인' }).tap();
    expect(await feedbackState(page)).toBe('needsRevision');
    const lines = await page.locator('.feedback-line').allInnerTexts();
    expect(lines.map((l) => l.replace(/\s+/g, ' ').trim())).toEqual(['두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.']);
    expect(await cellButton(page, 1).getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    await shot(page, 'q02-wrong-touch');
    await material(page, '쉼').tap();
    await cellButton(page, 1).tap();
    await page.getByRole('button', { name: '배치 확인' }).tap();
    expect(await feedbackState(page)).toBe('passed');
    await shot(page, 'q02-passed-touch');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('Q01 같은 음의 자리 찾기', () => {
  it('눌러서 높은음자리표 맨 아랫줄에 놓으면 E4로 읽고 실패한다 (2-6)', async () => {
    const { ctx, page, errors } = await openFresh(Q01_URL);
    expect(await page.locator('h1').textContent()).toBe('같은 음의 자리 찾기');
    await page.locator('#aid-ledger').click();
    await clickStaff(page, 'treble', 0);
    await clickStaff(page, 'bass', 10);
    expect(await valueText(page, 'treble')).toBe('맨 아랫줄');
    expect(await valueText(page, 'bass')).toBe('위 첫 덧줄');
    expect(await feedbackState(page)).toBe('none');
    await shot(page, 'q01-placed');
    await page.getByRole('button', { name: '배치 확인' }).click();
    expect(await feedbackState(page)).toBe('needsRevision');
    const lines = (await page.locator('.feedback-line').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim());
    expect(lines).toEqual(['지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.']);
    await shot(page, 'q01-wrong');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('키보드만으로 두 보표에 놓고 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q01_URL);
    await tabTo(page, (n) => n.startsWith('높은음자리표 보표: 음의 자리'));
    await page.keyboard.press('Enter');
    expect(await valueText(page, 'treble')).toBe('가운데 줄');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
    expect(await valueText(page, 'treble')).toBe('아래 첫 덧줄');
    await tabTo(page, (n) => n.startsWith('낮은음자리표 보표: 음의 자리'));
    await page.keyboard.press('Enter');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
    expect(await valueText(page, 'bass')).toBe('위 첫 덧줄');
    await tabTo(page, (n) => n === '배치 확인');
    await page.keyboard.press('Enter');
    expect(await feedbackState(page)).toBe('passed');
    await shot(page, 'q01-passed-keyboard');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('터치만으로: 오선을 누르고, 한 칸씩 단추로 옮겨 고치고, 통과한다', async () => {
    const { ctx, page, errors } = await openFresh(Q01_URL, { touch: true });
    await tapStaff(page, 'treble', 0);
    await tapStaff(page, 'bass', 10);
    await page.getByRole('button', { name: '배치 확인' }).tap();
    expect(await feedbackState(page)).toBe('needsRevision');
    const down = page.getByRole('button', { name: '높은음자리표 보표: 한 칸 아래로' });
    await down.tap();
    await down.tap();
    expect(await valueText(page, 'treble')).toBe('아래 첫 덧줄');
    await page.getByRole('button', { name: '배치 확인' }).tap();
    expect(await feedbackState(page)).toBe('passed');
    await shot(page, 'q01-passed-touch');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('소리는 켜기 전까지 나지 않는다 (W-11)', () => {
  it('열고, 놓고, 재생해도 오디오 장치가 만들어지지 않는다. 소리 켜기를 누르면 그때 켜진다', async () => {
    const { ctx, page, errors } = await openFresh(Q02_URL);
    const count = (): Promise<number> => page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length);
    expect(await count()).toBe(0);
    await material(page, 'C4').click();
    await cellButton(page, 0).click();
    await page.getByRole('button', { name: '내 배치 듣기' }).click();
    // 소리 없이도 재생 위치가 움직인다
    await page.waitForSelector('.cell-mine.is-playing', { timeout: 3000 });
    expect(await count()).toBe(0);
    expect(await page.locator('#sound-off-hint').innerText()).toContain('소리가 꺼져 있어요');
    await page.getByRole('button', { name: '정지' }).click();
    // 소리 켜기를 누른다
    await page.getByRole('button', { name: '소리 켜기' }).first().click();
    await page.waitForFunction(() => document.querySelector('.sound-status')?.getAttribute('data-sound-state') === 'on', null, { timeout: 8000 });
    expect(await count()).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts[0]!.state)).toBe('running');
    expect(await page.locator('.sound-status').innerText()).toBe('소리가 켜져 있어요');
    await page.getByRole('button', { name: '내 배치 듣기' }).click();
    await page.waitForSelector('.cell-mine.is-playing', { timeout: 3000 });
    expect(await page.locator('#sound-off-hint').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('확대해도 잘리지 않는다 (7.9 3번: 200% = 폭 640)', () => {
  for (const [name, url] of [
    ['Q01', Q01_URL],
    ['Q02', Q02_URL],
    ['목록', '#/list'],
  ] as const) {
    it(`${name}: 가로로 넘치지 않고 모든 단추가 화면 폭 안에 있다`, async () => {
      const { ctx, page, errors } = await openFresh(url, { width: 640, height: 900 });
      await page.waitForTimeout(300);
      const report = await page.evaluate(() => {
        const main = document.querySelector('main') as HTMLElement;
        const over: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, [role="slider"], [role="switch"], .cell, .slot-card, .quest-card')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.left < -1 || r.right > window.innerWidth + 1) over.push(`${el.className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
        return { docW: document.documentElement.scrollWidth, innerW: window.innerWidth, mainOverflow: main.scrollWidth - main.clientWidth, over };
      });
      expect(report.docW).toBeLessThanOrEqual(report.innerW);
      expect(report.mainOverflow).toBeLessThanOrEqual(1);
      expect(report.over).toEqual([]);
      if (name !== '목록') await shot(page, `${name.toLowerCase()}-zoom200`);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('누르는 대상 크기와 이름 (7.6, 7.9 8번)', () => {
  for (const [name, url] of [
    ['Q01', Q01_URL],
    ['Q02', Q02_URL],
    ['목록', '#/list'],
  ] as const) {
    it(`${name}: 단추, 스위치, 슬라이더가 48px 이상이고 이름이 있다 (폭 412)`, async () => {
      const { ctx, page, errors } = await openFresh(url, { touch: true });
      const rows = await page.evaluate(() => {
        const out: Array<{ name: string; w: number; h: number; role: string }> = [];
        for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, a.nav-link, a.brand, [role="slider"], [role="switch"], summary')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const nm = (el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? el.innerText ?? '').replace(/\s+/g, ' ').trim();
          out.push({ name: nm, w: Math.round(r.width), h: Math.round(r.height), role: el.getAttribute('role') ?? el.tagName.toLowerCase() });
        }
        return out;
      });
      expect(rows.length).toBeGreaterThan(5);
      expect(rows.filter((r) => !r.name)).toEqual([]);
      expect(rows.filter((r) => r.w < 48 || r.h < 48)).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('소리를 끈 채로 어느 음이 울리는지 보인다 (7.9 6번)', () => {
  it('Q01: 소리가 꺼져 있어도 두 음 듣기에서 칸이 차례로 \'지금 울리는 음\'이 된다', async () => {
    const { ctx, page, errors } = await openFresh(Q01_URL);
    await clickStaff(page, 'treble', -2);
    await clickStaff(page, 'bass', 10);
    await page.getByRole('button', { name: '두 음 듣기' }).click();
    await page.waitForSelector('.slot-card[data-slot="treble"].is-sounding', { timeout: 3000 });
    expect(await page.locator('.slot-card[data-slot="treble"] .slot-status.is-sounding').innerText()).toContain('지금 울리는 음');
    await shot(page, 'q01-sounding-sound-off');
    await page.waitForSelector('.slot-card[data-slot="bass"].is-sounding', { timeout: 3000 });
    await page.waitForSelector('.slot-card.is-sounding', { state: 'detached', timeout: 5000 });
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('맞고 틀림이 색 없이도 구분된다 (7.9 4번)', () => {
  async function grayscale(page: Page): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
  }

  it('Q01: 맞음과 틀림은 기호(그림)와 글자를 함께 가진다. 회색조 화면을 남긴다', async () => {
    const { ctx, page, errors } = await openFresh(Q01_URL);
    await grayscale(page);
    await clickStaff(page, 'treble', 0);
    await clickStaff(page, 'bass', 10);
    await page.getByRole('button', { name: '배치 확인' }).click();
    // 틀린 칸: 글자 + 그림 기호, 맞는 칸: 글자 + 그림 기호
    const wrong = page.locator('.slot-card[data-slot="treble"] .slot-status.is-error');
    const right = page.locator('.slot-card[data-slot="bass"] .slot-status.is-ok');
    expect((await wrong.innerText()).trim()).toBe('고칠 곳이 있어요');
    expect((await right.innerText()).trim()).toBe('맞아요');
    expect(await wrong.locator('svg').count()).toBe(1);
    expect(await right.locator('svg').count()).toBe(1);
    // 두 기호는 서로 다른 모양이다
    const shapes = await page.evaluate(() => [...document.querySelectorAll('.slot-status svg')].map((s) => s.innerHTML.replace(/\s+/g, '')));
    expect(new Set(shapes).size).toBe(2);
    // 피드백 문장 앞에도 기호가 있다
    expect(await page.locator('.feedback-line svg').count()).toBeGreaterThan(0);
    await shot(page, 'q01-wrong-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('Q02: 고칠 칸은 굵은 테두리, 그림 기호, 읽히는 이름, 문장을 함께 가진다. 통과는 글자와 기호로 나온다', async () => {
    const { ctx, page, errors } = await openFresh(Q02_URL);
    await grayscale(page);
    for (const [label, cell] of [['C4', 0], ['D4', 1], ['D4', 2], ['E4', 3]] as const) {
      const m = material(page, label);
      if ((await m.getAttribute('aria-pressed')) !== 'true') await m.click();
      await cellButton(page, cell).click();
    }
    await page.getByRole('button', { name: '배치 확인' }).click();
    const bad = cellButton(page, 1);
    expect(await bad.locator('.cell-mark svg').count()).toBe(1);
    expect(await bad.getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    expect(await cellButton(page, 0).locator('.cell-mark').count()).toBe(0);
    const borderWidth = await bad.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    const okWidth = await cellButton(page, 0).evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(borderWidth).toBeGreaterThan(okWidth);
    expect(await page.locator('.feedback-line svg').count()).toBe(1);
    await shot(page, 'q02-wrong-grayscale');
    await material(page, '쉼').click();
    await cellButton(page, 1).click();
    await page.getByRole('button', { name: '배치 확인' }).click();
    expect(await page.locator('.feedback-line').innerText()).toContain('통과했어요');
    expect(await page.locator('.feedback-line svg').count()).toBe(1);
    await shot(page, 'q02-passed-grayscale');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('움직임 줄이기 (7.9 5번)', () => {
  for (const [name, url] of [
    ['Q01', Q01_URL],
    ['Q02', Q02_URL],
  ] as const) {
    it(`${name}: 줄이기를 켜면 전환과 애니메이션이 사실상 없다(1 ms 이하). 재생 위치 표시는 그대로 나온다`, async () => {
      const { ctx, page, errors } = await openFresh(url);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const rows = await page.evaluate(() => {
        const out: Array<{ el: string; t: number; a: number }> = [];
        for (const el of document.querySelectorAll<HTMLElement>('button, .cell, .slot-card, .card, .feedback, .staff-surface')) {
          const cs = getComputedStyle(el);
          const max = (v: string): number => Math.max(...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x))));
          out.push({ el: el.className || el.tagName, t: max(cs.transitionDuration), a: max(cs.animationDuration) });
        }
        return out;
      });
      expect(rows.length).toBeGreaterThan(5);
      expect(rows.filter((r) => r.t > 0.001 || r.a > 0.001)).toEqual([]);
      // 재생 위치 표시는 연출이 아니라 정보라서 줄이기와 상관없이 나온다
      if (name === 'Q02') {
        await material(page, 'C4').click();
        await cellButton(page, 0).click();
        await page.getByRole('button', { name: '내 배치 듣기' }).click();
        await page.waitForSelector('.cell-mine.is-playing', { timeout: 3000 });
      } else {
        await clickStaff(page, 'treble', -2);
        await page.getByRole('button', { name: '두 음 듣기' }).click();
        await page.waitForSelector('.slot-card.is-sounding', { timeout: 3000 });
      }
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

describe('소리 점검(미리보기 채널)', () => {
  it('C2부터 C6까지의 음량을 오프라인으로 재서 표로 보여 준다', async () => {
    const { ctx, page, errors } = await openFresh('#/dev/sound-check');
    await page.getByRole('button', { name: '음량 재기' }).click();
    await page.waitForSelector('.loudness-table tbody tr', { timeout: 60000 });
    expect(await page.locator('.loudness-table tbody tr').count()).toBe(13);
    const spread = Number(await page.locator('[data-spread]').getAttribute('data-spread'));
    const rows = await page.locator('.loudness-table tbody tr').allInnerTexts();
    fs.writeFileSync(path.resolve(__dirname, '../../docs/verification/sound-check-measured.json'), JSON.stringify({ spreadDb: spread, rows: rows.map((r) => r.replace(/\s+/g, ' ').trim()) }, null, 2));
    // 소리가 실제로 났는가(무음이 아니다)와 한 음만 튀게 크거나 작지 않은가
    for (const r of rows) {
      const db = Number(r.split(/\s+/)[1]);
      expect(Number.isFinite(db)).toBe(true);
      expect(db).toBeGreaterThan(-50);
    }
    expect(spread).toBeLessThan(6);
    await shot(page, 'sound-check');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
