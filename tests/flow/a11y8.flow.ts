// 8-3 접근성 보충(실제 Chrome): 6·7·8단계가 더한 화면을 설계서 7.9의 3·7·8번 잣대로 잰다.
// 앞 단계의 기록(7-1~7-6)이 "aria 이름, 확대 200%, 낭독기 이름은 8단계(8-3)에서 한꺼번에 점검한다"고 넘긴 일이다.
// 5-8의 시험(a11y5.flow.ts)이 5단계의 새 화면을 본 것과 같은 도구(a11yTools)와 같은 기준이다: 폭 640이 200% 확대, 누르는 대상은 48 px, 글자 대비는 4.5:1.
//   화면: 설치물 작업대 20개(content/installations에서 읽는다), 주민 카드 6개, 설정의 '정보' 구역(고지 상자를 연 채), 도움 화면.
//   잣대: 이름(보이는 글과 낭독기 이름, 브라우저가 계산한 접근성 트리), 크기(터치 48 px), 가로 넘침·글 잘림(200% 확대), 가운데 점이 닿는가, 글자 대비.
// 이 시험이 보지 못하는 것(화면 낭독기가 실제로 읽는 소리, 실제 기기, 눈으로 보는 흑백 화면)은 사람 확인 대기로 남긴다(docs/device-checklist.md).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESIDENTS } from '@/domain/residents';
import { axReport, clipReport, contrastFails, contrastReport, controlsReport, focusRing, focusedOutside, labelMismatch, overflowReport, reachReport, waitFocus } from './a11yTools';
import { status, teleport, waitChunks, waitNear, waitReady } from './game';
import { startHarness, type Harness } from './harness';
import { inputLog } from './inputTools';
import { boot as bootVillage, standBy, until } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 600_000;

interface InstDef {
  installationId: string;
  stationCode: string;
  name: string;
  archetype: string;
}
const INSTALLATIONS: InstDef[] = fs
  .readdirSync(path.resolve(__dirname, '../../content/installations'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../content/installations', f), 'utf-8')) as InstDef);

interface Surface {
  name: string;
  /** 이 화면을 이루는 상자의 선택자(검사 범위) */
  scope: string;
  open: (page: Page) => Promise<void>;
  close: (page: Page) => Promise<void>;
}

const hashTo = (page: Page, hash: string): Promise<void> =>
  page.evaluate((hh) => {
    location.hash = hh;
  }, hash);

const SURFACES: Surface[] = [
  ...INSTALLATIONS.map(
    (i): Surface => ({
      name: `설치물 ${i.stationCode} ${i.name}(${i.archetype})`,
      scope: '[data-installation-hud]',
      open: async (page) => {
        expect(await teleport(page, i.stationCode), `${i.stationCode} 정거장이 있다`).toBe(true);
        await waitNear(page, i.stationCode, 20000);
        await page.keyboard.press('KeyE');
        await page.waitForSelector(`[data-installation-hud="${i.installationId}"]`, { timeout: 20000 });
      },
      close: async (page) => {
        for (let k = 0; k < 4 && (await page.locator('[data-installation-hud]').count()) > 0; k++) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
        await page.waitForSelector('[data-installation-hud]', { state: 'detached' });
      },
    }),
  ),
  ...RESIDENTS.map(
    (r): Surface => ({
      name: `주민 카드 ${r.name}`,
      scope: '[data-resident-card]',
      open: async (page) => {
        await standBy(page, { id: r.residentId, x: r.x, y: r.y });
        await page.keyboard.press('KeyE');
        await page.waitForSelector(`[data-resident-card="${r.residentId}"]`, { timeout: 20000 });
      },
      close: async (page) => {
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-resident-card]', { state: 'detached' });
      },
    }),
  ),
  {
    name: '설정(정보 구역, 고지 상자를 연 채)',
    scope: '[data-overlay]',
    open: async (page) => {
      await hashTo(page, '#/settings');
      await page.waitForSelector('[data-testid="about-section"]', { timeout: 20000 });
      await page.locator('[data-testid="notices"] summary').click();
      await page.waitForSelector('[data-testid="notices-text"]');
    },
    close: async (page) => {
      await hashTo(page, '#/');
      await page.waitForSelector('[data-testid="about-section"]', { state: 'detached' });
    },
  },
  {
    name: '도움(소리가 나지 않을 때 안내)',
    scope: '[data-overlay]',
    open: async (page) => {
      await hashTo(page, '#/help');
      await page.waitForSelector('[data-testid="help-no-sound"]', { timeout: 20000 });
    },
    close: async (page) => {
      await hashTo(page, '#/');
      await page.waitForSelector('[data-testid="help-no-sound"]', { state: 'detached' });
    },
  },
];

interface Plan {
  label: string;
  width: number;
  height: number;
  touch: boolean;
}

/** 화면 하나를 모든 잣대로 재서 걸린 것을 글로 돌려준다. 걸리지 않으면 빈 목록 */
async function measure(ctx: BrowserContext, page: Page, s: Surface, plan: Plan): Promise<{ problems: string[]; controls: number; minContrast: number }> {
  const problems: string[] = [];
  const rows = await controlsReport(page, s.scope);
  if (rows.length === 0) problems.push('누르는 대상이 하나도 안 잡혔다(측정이 헛돈다)');
  const unnamed = rows.filter((r) => !r.name).map((r) => `${r.role} .${r.cls}`);
  if (unnamed.length) problems.push(`이름이 빈 것 ${JSON.stringify(unnamed)}`);
  if (plan.touch) {
    const small = rows.filter((r) => r.w < 48 || r.h < 48).map((r) => `${r.name} ${r.w}×${r.h} [${r.role}] .${r.cls}`);
    if (small.length) problems.push(`48 px보다 작은 것 ${JSON.stringify(small)}`);
  }
  const mismatch = await labelMismatch(page, s.scope);
  if (mismatch.length) problems.push(`낭독기 이름이 보이는 글을 품지 않는 것 ${JSON.stringify(mismatch)}`);
  const ax = await axReport(ctx, page);
  if (ax.counted === 0) problems.push('접근성 트리에서 누르는 대상이 하나도 안 잡혔다');
  if (ax.unnamed.length) problems.push(`접근성 트리에서 이름이 빈 것 ${JSON.stringify(ax.unnamed)}`);
  const over = await overflowReport(page);
  if (over.docW > over.innerW) problems.push(`문서가 화면보다 넓다 ${over.docW} > ${over.innerW}`);
  if (over.out.length) problems.push(`화면 폭 밖의 단추 ${JSON.stringify(over.out)}`);
  const clipped = await clipReport(page, s.scope);
  if (clipped.length) problems.push(`글을 자르는 상자 ${JSON.stringify(clipped)}`);
  const unreachable = await reachReport(page, s.scope);
  if (unreachable.length) problems.push(`손이 닿지 않는 것 ${JSON.stringify(unreachable)}`);
  const contrast = await contrastReport(page, s.scope);
  if (contrast.checked < 1) problems.push('잰 글자가 없다(측정이 헛돈다)');
  if (contrast.unknown.length) problems.push(`배경이 그림이라 재지 못한 글자 ${JSON.stringify(contrast.unknown)}`);
  const low = contrastFails(contrast).map((r) => `"${r.text.slice(0, 16)}" ${r.ratio} < ${r.need}`);
  if (low.length) problems.push(`글자 대비가 기준에 못 미치는 것 ${JSON.stringify(low)}`);
  const lowDisabled = contrast.rows.filter((x) => x.disabled && x.ratio < 3).map((r) => `"${r.text.slice(0, 16)}" ${r.ratio}`);
  if (lowDisabled.length) problems.push(`쓸 수 없는 단추의 글자 대비가 3:1 밑 ${JSON.stringify(lowDisabled)}`);
  return { problems, controls: rows.length, minContrast: contrast.min };
}

// ---------------------------------------------------------------------------
// 7.9의 3번(확대 200%), 7번(글자 대비), 8번(이름과 크기)를 화면 크기별로

const PLANS: Plan[] = [
  { label: '1280×720', width: 1280, height: 720, touch: false },
  { label: '412×915 터치(세로 휴대폰)', width: 412, height: 915, touch: true },
  { label: '640×360(1280×720의 200% 확대)', width: 640, height: 360, touch: false },
  { label: '844×390 터치(가로로 든 휴대폰)', width: 844, height: 390, touch: true },
];

describe('8-3 접근성 보충: 6·7·8단계 화면(설치물 작업대 20, 주민 카드 6, 설정의 정보 구역, 도움)', () => {
  it('측정할 화면이 내용에서 읽은 만큼 있다(설치물 20개, 주민 6명)', () => {
    expect(INSTALLATIONS.length, '설치물 파일').toBe(20);
    expect(RESIDENTS.length, '주민').toBe(6);
    expect(SURFACES.length).toBe(INSTALLATIONS.length + RESIDENTS.length + 2);
    // 정거장 번호가 겹치지 않는다(겹치면 한 작업대를 두 번 재게 된다)
    expect(new Set(INSTALLATIONS.map((i) => i.stationCode)).size).toBe(INSTALLATIONS.length);
  });

  for (const plan of PLANS) {
    it(
      `${plan.label}: 화면마다 이름이 있고${plan.touch ? ' 48 px 이상이며' : ''} 가로로 넘치지 않고 글이 잘리지 않고 손이 닿으며 글자 대비가 기준 이상이다`,
      async () => {
        const { ctx, page, errors } = await bootVillage(h, { width: plan.width, height: plan.height, ...(plan.touch ? { touch: true } : {}) });
        await waitReady(page);
        await waitChunks(page);
        const problems: string[] = [];
        const seen: string[] = [];
        let controls = 0;
        let min = Infinity;
        for (const s of SURFACES) {
          await s.open(page);
          // 그려지고 자리를 잡을 시간(글꼴, 카메라)을 상태가 아니라 한 프레임쯤 준다
          await page.waitForTimeout(250);
          try {
            const m = await measure(ctx, page, s, plan);
            controls += m.controls;
            min = Math.min(min, m.minContrast);
            for (const p of m.problems) problems.push(`[${s.name}] ${p}`);
            seen.push(`${s.name}: 누르는 대상 ${m.controls}개, 가장 낮은 대비 ${m.minContrast}`);
          } finally {
            await s.close(page);
          }
        }
        console.log(`[8-3 접근성 ${plan.label}] 화면 ${SURFACES.length}개, 누르는 대상 ${controls}개, 가장 낮은 글자 대비 ${min}\n${seen.join('\n')}`);
        expect(problems, '걸린 것').toEqual([]);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});

// ---------------------------------------------------------------------------
// 대조: 이 측정이 일부러 넣은 결함을 잡아낸다(위 시험이 비어서 통과한 것이 아니라는 증거)

describe('8-3 접근성 보충의 대조: 일부러 넣은 결함을 잡아낸다', () => {
  it(
    '이름 없는 단추, 작은 단추, 낭독기 이름이 보이는 글과 다른 단추, 흐린 글, 글을 자르는 상자, 화면 폭 밖의 단추, 위를 덮인 단추를 각각 걸러 낸다',
    async () => {
      const { ctx, page, errors } = await bootVillage(h, { width: 412, height: 915, touch: true });
      await waitReady(page);
      await hashTo(page, '#/help');
      await page.waitForSelector('[data-testid="help-no-sound"]', { timeout: 20000 });
      const scope = '[data-overlay]';
      // 먼저 아무것도 넣지 않은 도움 화면은 깨끗하다(대조의 바탕)
      const base = await measure(ctx, page, { name: '도움', scope, open: async () => undefined, close: async () => undefined }, { label: 'x', width: 412, height: 915, touch: true });
      expect(base.problems, '심기 전의 도움 화면').toEqual([]);
      expect(await reachReport(page, scope), '덮기 전').toEqual([]);

      await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) throw new Error('도움 화면이 없다');
        const box = document.createElement('div');
        box.setAttribute('data-plant', '');
        // 모양은 HTML 글자 안의 style 속성이 아니라 CSSOM(el.style)으로 준다. 호스팅의 내용 보안 정책(FLOW_HOSTED=1, docs/hosting.md)은
        // style 속성을 막아서, 속성으로 심으면 결함이 심어지지 않고 대조가 거짓으로 실패한다(최종 점검의 호스팅 모드 전체 실행이 잡았다).
        // CSSOM은 정책이 막지 않는다. 앱의 화면도 같은 방식으로 모양을 준다.
        const plant = (tag: string, kind: string, text: string, css: string, attrs: Record<string, string> = {}): HTMLElement => {
          const el = document.createElement(tag);
          el.setAttribute('data-plant', kind);
          for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
          if (css) el.style.cssText = css;
          el.textContent = text;
          return el;
        };
        const clip = plant('div', 'clip', '', 'width:60px;height:22px;overflow:hidden');
        const longText = document.createElement('span');
        longText.style.cssText = 'white-space:nowrap';
        longText.textContent = '자르는 상자 안에서 잘려 나가는 아주 긴 글입니다';
        clip.appendChild(longText);
        box.append(
          plant('button', 'unnamed', '', '', { type: 'button' }),
          plant('button', 'small', '작게', 'width:20px;height:20px;padding:0', { type: 'button' }),
          plant('button', 'mismatch', '보이는 글', '', { type: 'button', 'aria-label': '전혀 다른 이름' }),
          plant('p', 'faint', '아주 흐린 글자', 'margin:0;color:#c8c8c8;background:#ffffff;font-size:14px'),
          clip,
          plant('button', 'out', '밖', 'position:fixed;left:100vw;top:200px;width:60px;height:60px', { type: 'button' }),
        );
        root.appendChild(box);
      }, scope);

      const rows = await controlsReport(page, '[data-plant]');
      expect(rows.some((r) => !r.name && r.cls === ''), '이름 없는 단추').toBe(true);
      expect(rows.some((r) => r.name === '작게' && (r.w < 48 || r.h < 48)), '작은 단추').toBe(true);
      expect((await labelMismatch(page, '[data-plant]')).length, '낭독기 이름이 보이는 글과 다른 단추').toBeGreaterThan(0);
      const ax = await axReport(ctx, page);
      expect(ax.unnamed.length, '접근성 트리에서 이름 없는 단추').toBeGreaterThan(0);
      expect(contrastFails(await contrastReport(page, '[data-plant]')).some((r) => r.text.includes('흐린')), '흐린 글').toBe(true);
      expect((await clipReport(page, '[data-plant]')).length, '글을 자르는 상자').toBeGreaterThan(0);
      expect((await overflowReport(page)).out.length, '화면 폭 밖의 단추').toBeGreaterThan(0);

      // 가장 마지막에: 화면 전체를 덮는 투명한 막을 얹으면 아래의 단추가 모두 닿지 않는다
      await page.evaluate(() => {
        const cover = document.createElement('div');
        cover.setAttribute('data-plant-cover', '');
        cover.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;background:transparent';
        document.body.appendChild(cover);
      });
      expect((await reachReport(page, '[data-plant]')).length, '덮은 뒤').toBeGreaterThan(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

// ---------------------------------------------------------------------------
// 7.9 1번 키보드만으로: 주민 카드

describe('7.9 1번 키보드만으로: 주민 카드(7-6)', () => {
  it(
    'E로 말을 걸면 닫기에 초점이 가고 초점 표시가 그려지며, Tab이 카드 밖으로 나가지 않고, Esc로 닫으면 월드가 다시 움직인다. 마우스는 한 번도 쓰지 않는다',
    async () => {
      const { ctx, page, errors } = await bootVillage(h, { log: true, intro: 'key' });
      await waitReady(page);
      await waitChunks(page);
      const r = RESIDENTS[0]!;
      await standBy(page, { id: r.residentId, x: r.x, y: r.y });
      expect((await status(page)).near, '주민 곁의 안내 칩').toMatchObject({ stationId: r.residentId, spot: 'resident' });
      await page.keyboard.press('KeyE');
      await page.waitForSelector(`[data-resident-card="${r.residentId}"]`, { timeout: 20000 });
      // 열리면 닫기 단추에 초점이 있고, 초점 표시가 그려져 있다
      await waitFocus(page, '[data-resident-card] .btn-primary', '주민 카드가 떴을 때(닫기 단추)');
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('닫기');
      expect(await focusRing(page)).toMatchObject({ ok: true });
      // 카드 안에서만 돈다
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        expect(await focusedOutside(page, '[data-resident-card]'), `Tab ${i + 1}번째`).toBeNull();
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-resident-card]', { state: 'detached' });
      await until(() => status(page), (s) => !s.paused, '월드가 다시 움직인다');
      const log = await inputLog(page);
      expect(log.downs, '마우스를 누른 수').toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
