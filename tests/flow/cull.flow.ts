// 8-4 화면 밖 그림 건너뛰기(world/cull.ts)가 보이는 그림을 지우지 않는지 실제 Chrome에서 화소로 견준다.
// 같은 자리에서 '건너뛰기 켬 → 끔 → 다시 켬' 세 장을 찍는다. 켠 두 장이 서로 같아야(그 자리가 가만히 있어야) 견줄 수 있고,
// 끈 장(아무것도 거르지 않은 화면)은 켠 장과 한 화소도 달라서는 안 된다.
// 움직임 줄이기로 연다: 주민의 눈 깜빡임, 악사의 뜀, 밟은 돌의 번지는 고리처럼 시계로 바뀌는 그림이 멈춰서 화소 비교가 가능하다.
// 먼저 `npm run build`가 필요하다(dist를 연다).
import type { Page } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbg, teleport, waitChunks, waitNear, waitReady } from './game';
import type { Dbg } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 600_000;
const STATIONS = ['H1', 'H2', 'H3', 'H4', 'H5', 'N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'E4', 'W1', 'W2', 'W3', 'W4', 'K1', 'K2', 'K3', 'K4', 'S1', 'S2', 'S3'];

async function boot(width: number, height: number) {
  const ctx = await h.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url);
  await skipIntro(page);
  await waitReady(page);
  await waitChunks(page);
  return { ctx, page, errors };
}

/** 건너뛰기를 켜고 끈다(점검용 knob: WorldScene.cull.enabled) */
const setCull = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((v) => {
    (window as unknown as { __game: { world: { handle: { scene: { cull: { enabled: boolean } } } } } }).__game.world.handle.scene.cull.enabled = v;
  }, on);

/** 바꾼 값이 그려진 프레임이 둘 지날 때까지 기다린다 */
const frames = (page: Page, n = 3): Promise<void> =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => {
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    n,
  );

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}
async function shoot(page: Page): Promise<Raw> {
  const png = await page.screenshot({ type: 'png' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** 다른 화소의 수와 처음 다른 자리 */
function diff(a: Raw, b: Raw): { count: number; first: { x: number; y: number } | null } {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let count = 0;
  let first: { x: number; y: number } | null = null;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      count += 1;
      if (!first) first = { x: (i / 4) % a.width, y: Math.floor(i / 4 / a.width) };
    }
  }
  return { count, first };
}

interface Compared {
  /** 건너뛰기를 켠 두 장 사이의 다른 화소 수(0이어야 견줄 수 있다) */
  noise: number;
  /** 끈 장과 켠 첫 장 사이의 다른 화소 수 */
  off: number;
  first: { x: number; y: number } | null;
  stats: Dbg['cull'];
}

/** 지금 자리에서 켬·끔·켬 세 장을 찍어 견준다 */
async function compare(page: Page): Promise<Compared> {
  await setCull(page, true);
  await frames(page);
  const on1 = await shoot(page);
  const stats = (await dbg(page)).cull;
  await setCull(page, false);
  await frames(page);
  const off = await shoot(page);
  await setCull(page, true);
  await frames(page);
  const on2 = await shoot(page);
  const noise = diff(on1, on2).count;
  const d = diff(on1, off);
  return { noise, off: d.count, first: d.first, stats };
}

const fmt = (id: string, c: Compared): string => `${id}: 켠 두 장 ${c.noise}화소 차이, 끈 장과 ${c.off}화소 차이${c.first ? `(처음 ${c.first.x},${c.first.y})` : ''}, 거른 그래픽 ${c.stats.hidden}/${c.stats.tracked}, 건너뛴 설치물 ${c.stats.installationsSkipped}`;

describe('8-4 화면 밖 그림 건너뛰기: 걸러 낸 화면과 거르지 않은 화면이 화소까지 같다', () => {
  it('정거장 23곳(1280×720): 서 있는 화면이 같고, 건너뛰기는 실제로 일한다', async () => {
    const { ctx, page, errors } = await boot(1280, 720);
    const lines: string[] = [];
    let hiddenMin = Infinity;
    let skippedMax = 0;
    for (const id of STATIONS) {
      expect(await teleport(page, id), `${id}로 이동`).toBe(true);
      await waitChunks(page);
      await page.waitForTimeout(500);
      const c = await compare(page);
      lines.push(fmt(id, c));
      expect(c.noise, `${id}: 켠 두 장이 같아야 견줄 수 있다`).toBe(0);
      expect(c.off, `${id}: 끈 장과 켠 장`).toBe(0);
      hiddenMin = Math.min(hiddenMin, c.stats.hidden);
      skippedMax = Math.max(skippedMax, c.stats.installationsSkipped);
    }
    console.log(`[건너뛰기 화소 비교 1280×720]\n${lines.join('\n')}`);
    // 모든 정거장에서 월드 대부분이 화면 밖이다: 거른 그래픽이 있다
    expect(hiddenMin, '모든 정거장에서 거른 그래픽이 있다').toBeGreaterThan(0);
    expect(skippedMax, '그리는 호출을 건너뛴 설치물이 있다').toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('정거장 23곳(640×360, 가장 작은 화면): 같다', async () => {
    const { ctx, page, errors } = await boot(640, 360);
    const lines: string[] = [];
    for (const id of STATIONS) {
      expect(await teleport(page, id), `${id}로 이동`).toBe(true);
      await waitChunks(page);
      await page.waitForTimeout(400);
      const c = await compare(page);
      lines.push(fmt(id, c));
      expect(c.noise, `${id}: 켠 두 장이 같아야 견줄 수 있다`).toBe(0);
      expect(c.off, `${id}: 끈 장과 켠 장`).toBe(0);
    }
    console.log(`[건너뛰기 화소 비교 640×360]\n${lines.join('\n')}`);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('정거장 23곳(1600×1000, 가장 큰 화면): 같다', async () => {
    const { ctx, page, errors } = await boot(1600, 1000);
    const lines: string[] = [];
    for (const id of STATIONS) {
      expect(await teleport(page, id), `${id}로 이동`).toBe(true);
      await waitChunks(page);
      await page.waitForTimeout(400);
      const c = await compare(page);
      lines.push(fmt(id, c));
      expect(c.noise, `${id}: 켠 두 장이 같아야 견줄 수 있다`).toBe(0);
      expect(c.off, `${id}: 끈 장과 켠 장`).toBe(0);
    }
    console.log(`[건너뛰기 화소 비교 1600×1000]\n${lines.join('\n')}`);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('설치물 모드(설치물이 있는 정거장마다): 카메라가 설치물을 담은 화면이 같다', async () => {
    const { ctx, page, errors } = await boot(1280, 720);
    const lines: string[] = [];
    let entered = 0;
    for (const id of STATIONS) {
      expect(await teleport(page, id), `${id}로 이동`).toBe(true);
      await waitNear(page, id, 20000);
      await page.keyboard.press('KeyE');
      const opened = await page
        .waitForSelector('[data-installation-hud]', { timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      if (!opened) {
        // 낱말·악보 패널이 열린 정거장이다: 닫고 다음으로 간다
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        lines.push(`${id}: 설치물 모드가 없는 정거장`);
        continue;
      }
      entered += 1;
      // 카메라가 설치물 앞에 가만히 설 때까지
      let prev = await dbg(page);
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(150);
        const cur = await dbg(page);
        const still = Math.abs(cur.center.x - prev.center.x) < 0.5 && Math.abs(cur.center.y - prev.center.y) < 0.5 && Math.abs(cur.zoom - prev.zoom) < 0.001;
        if (still && cur.pending.length === 0 && cur.framing && !cur.transitioning) break;
        prev = cur;
      }
      await waitChunks(page);
      const c = await compare(page);
      lines.push(fmt(id, c));
      expect(c.noise, `${id} 설치물 모드: 켠 두 장이 같아야 견줄 수 있다`).toBe(0);
      expect(c.off, `${id} 설치물 모드: 끈 장과 켠 장`).toBe(0);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      await page.waitForTimeout(400);
    }
    console.log(`[건너뛰기 화소 비교, 설치물 모드]\n${lines.join('\n')}`);
    expect(entered, '설치물 모드에 들어가 본 정거장이 여럿이다').toBeGreaterThanOrEqual(15);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('대조: 화면을 엉뚱한 곳으로 알려 주면 화소 비교가 걸린다(비교가 헛돌지 않는다)', async () => {
    const { ctx, page, errors } = await boot(1280, 720);
    // 정거장 H4 곁에는 등불, 설치물(돌), 발견 표식이 있다. 건너뛰기에 화면을 10만 px 옆으로 알려 주면 이것들이 모두 거른다
    expect(await teleport(page, 'H4')).toBe(true);
    await waitChunks(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cull = (window as unknown as { __game: { world: { handle: { scene: { cull: { update(v: { x: number; y: number; w: number; h: number }): void } } } } } }).__game.world.handle.scene.cull;
      const real = cull.update.bind(cull);
      cull.update = (v) => real({ ...v, x: v.x + 100_000 });
    });
    await frames(page);
    const wrong = await shoot(page);
    const stats = (await dbg(page)).cull;
    // 거르지 않은 화면: 알려 주는 화면이 엉뚱해도 enabled를 끄면 모두 보인다
    await setCull(page, false);
    await frames(page);
    const all = await shoot(page);
    const d = diff(wrong, all);
    console.log(`[대조] 엉뚱한 화면을 알려 준 화면과 거르지 않은 화면: ${d.count}화소 차이, 거른 그래픽 ${stats.hidden}/${stats.tracked}, 건너뛴 설치물 ${stats.installationsSkipped}`);
    expect(stats.hidden).toBe(stats.tracked);
    expect(stats.installationsSkipped).toBe(20);
    expect(d.count, '걸러 낸 것이 화소로 드러난다').toBeGreaterThan(1000);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('바로 이동한 첫 프레임부터 새 자리가 그려진다(한 프레임 늦게 나타나지 않는다)', async () => {
    const { ctx, page, errors } = await boot(1280, 720);
    // 먼 두 정거장을 오가며, 이동 직후 곧바로 찍은 화면이 안정된 뒤의 화면과 같은지 본다
    for (const [from, to] of [['H1', 'K4'], ['K4', 'N2'], ['N2', 'S3'], ['S3', 'E1']] as const) {
      expect(await teleport(page, from)).toBe(true);
      await waitChunks(page);
      await page.waitForTimeout(500);
      expect(await teleport(page, to)).toBe(true);
      await waitChunks(page);
      // 이동 직후의 화면 한 프레임이 지난 뒤
      await frames(page, 2);
      const early = await shoot(page);
      await page.waitForTimeout(800);
      const late = await shoot(page);
      const d = diff(early, late);
      expect(d.count, `${from}→${to}: 이동 직후와 안정된 뒤의 화면`).toBe(0);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});
