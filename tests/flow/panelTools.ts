// 패널 흐름 시험의 공용 도구(실제 Chrome). phase2.flow.ts(주소로 열기)와 world.flow.ts(월드에서 걸어가 열기)가 함께 쓴다.
// 보표 위치를 화면 좌표로 바꿔 누르는 도구는 그려진 그림(SVG)에서 줄의 위치를 읽는다. 도메인의 계산을 베끼지 않는다.
import { expect } from 'vitest';
import type { Locator, Page } from 'playwright-core';

/** 판정 영역의 상태: none, passed, needsRevision … */
/**
 * 화면 전체를 한 장으로 찍는다. 패널은 높이가 화면에 고정된 틀 안의 스크롤 영역(.panel-main)이라 fullPage만으로는
 * 보이는 부분만 찍힌다. 스크롤 영역이 넘치는 만큼 뷰포트를 잠깐 키워서 찍고 원래 크기로 되돌린다.
 */
export async function fullShot(page: Page, file: string): Promise<void> {
  const vp = page.viewportSize();
  const extra = await page.evaluate(() => {
    let most = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2) most = Math.max(most, el.scrollHeight - el.clientHeight);
    }
    return most;
  });
  if (vp && extra > 0) await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + extra, 6000) });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.panel-main, .list-main')) el.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, fullPage: true });
  if (vp) await page.setViewportSize(vp);
}

export const feedbackState = (page: Page): Promise<string | null> => page.locator('.feedback').getAttribute('data-feedback');

/**
 * 화면에 보이는 오선 줄 간격(px): 악보 그림마다 하나씩. 그림은 폭과 높이 중 빡빡한 쪽에 맞춰 줄어드니
 * viewBox와 실제 상자 크기로 계산한다. 이 값이 작으면 음 머리가 뭉개져서 읽을 수 없다.
 */
export async function staffSpacings(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<SVGSVGElement>('svg.notation-svg')].map((svg) => {
      const first = svg.querySelector('.vf-stave');
      const ys = [...(first?.querySelectorAll('path') ?? [])].map((p) => Number(/M[\d.]+ ([\d.]+)L/.exec(p.getAttribute('d') ?? '')?.[1])).filter((n) => Number.isFinite(n));
      if (ys.length < 5) return 0;
      const vb = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
      const r = svg.getBoundingClientRect();
      const scale = Math.min(r.width / vb[2]!, r.height / vb[3]!);
      return ((Math.max(...ys) - Math.min(...ys)) / 4) * scale;
    }),
  );
}

/** 보표 위치(0 = 맨 아랫줄, 2씩이 한 줄 간격)의 화면 좌표. 보표 그림의 줄 위치에서 읽는다 */
export async function staffPoint(page: Page, slot: string, position: number): Promise<{ x: number; y: number }> {
  const surface = page.locator(`.staff-surface[data-slot-id="${slot}"]`);
  await surface.scrollIntoViewIfNeeded();
  return surface.evaluate((el, pos) => {
    const svg = el.querySelector('svg') as SVGSVGElement;
    const ys = [...svg.querySelectorAll('.vf-stave path')]
      .map((p) => Number(/M[\d.]+ ([\d.]+)L/.exec(p.getAttribute('d') ?? '')?.[1]))
      .filter((n) => Number.isFinite(n));
    const bottom = Math.max(...ys);
    const spacing = (bottom - Math.min(...ys)) / 4;
    const vb = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    const r = svg.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + (bottom - (pos * spacing) / 2 - vb[1]!) * (r.height / vb[3]!) };
  }, position);
}

/** 손가락으로 한 번 누른다(끌지 않는다) */
export async function tapStaff(page: Page, slot: string, position: number): Promise<void> {
  const { x, y } = await staffPoint(page, slot, position);
  await page.touchscreen.tap(x, y);
}

/** 보표 칸의 읽어 주는 값(예: '맨 아랫줄', '아래 첫 덧줄') */
export const valueText = (page: Page, slot: string): Promise<string | null> => page.locator(`.staff-surface[data-slot-id="${slot}"]`).getAttribute('aria-valuetext');

export const material = (page: Page, label: string) => page.locator('button.material', { hasText: label });
export const cellButton = (page: Page, index: number) => page.locator('button.cell-mine').nth(index);

// ---------------------------------------------------------------------------
// 키보드 도구: Tab으로 이름이 맞는 곳까지 간다

export async function activeName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    // 초점이 문서 끝을 지나 몸통(body)으로 돌아왔을 때 몸통의 글 전체를 이름으로 읽지 않는다
    if (!el || el === document.body) return '';
    return (el.getAttribute('aria-label') ?? el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
}

export async function tabTo(page: Page, matches: (name: string) => boolean, max = 90): Promise<string> {
  for (let i = 0; i < max; i++) {
    const name = await activeName(page);
    if (name && matches(name)) return name;
    await page.keyboard.press('Tab');
  }
  throw new Error(`키보드로 찾지 못했어요. 마지막 이름: '${await activeName(page)}'`);
}

// ---------------------------------------------------------------------------
// 두 과제를 끝까지 푸는 도구. 월드에서 패널이 열린 직후부터 쓴다(W-4: 마우스 클릭만, 터치만, 키보드만)

/** 누르는 도구: 마우스는 클릭(끌지 않는다), 터치는 손가락으로 한 번 누른다 */
export type Pointer = 'mouse' | 'touch';

const press = (loc: Locator, how: Pointer): Promise<void> => (how === 'touch' ? loc.tap() : loc.click());

/** 같은 음의 자리 찾기(Q01): 두 보표를 눌러 놓으면 틀리고, 단추로 한 칸씩 고치면 통과한다. 끌지 않는다 */
export async function completeQ01(page: Page, how: Pointer): Promise<void> {
  for (const [slot, position] of [['treble', 0], ['bass', 10]] as const) {
    const { x, y } = await staffPoint(page, slot, position);
    if (how === 'touch') await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  }
  await press(page.getByRole('button', { name: '배치 확인' }), how);
  expect(await feedbackState(page)).toBe('needsRevision');
  const down = page.getByRole('button', { name: '높은음자리표 보표: 한 칸 아래로' });
  await press(down, how);
  await press(down, how);
  expect(await valueText(page, 'treble')).toBe('아래 첫 덧줄');
  await press(page.getByRole('button', { name: '배치 확인' }), how);
  expect(await feedbackState(page)).toBe('passed');
}

/** 쉼이 있는 한 마디(Q02): 재료를 고르고 칸을 눌러 4박을 채운다. 끌지 않는다 */
export async function completeQ02(page: Page, how: Pointer): Promise<void> {
  for (const [label, cell] of [['C4', 0], ['쉼', 1], ['D4', 2], ['E4', 3]] as const) {
    const m = material(page, label);
    if ((await m.getAttribute('aria-pressed')) !== 'true') await press(m, how);
    await press(cellButton(page, cell), how);
  }
  await press(page.getByRole('button', { name: '배치 확인' }), how);
  expect(await feedbackState(page)).toBe('passed');
}

/** Q01을 키보드만으로: Tab으로 보표에 가서 Enter로 놓고 방향키로 옮긴다 */
export async function completeQ01Keyboard(page: Page): Promise<void> {
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
}

/** Q02를 키보드만으로: Tab으로 재료에 가서 Space로 고르고, 칸에 가서 Enter로 놓는다 */
export async function completeQ02Keyboard(page: Page): Promise<void> {
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
}
