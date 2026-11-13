// 5-8 접근성 시험의 공용 도구(실제 Chrome): 가로 넘침, 누르는 대상의 이름과 크기, 브라우저가 계산한 접근성 트리의 이름,
// 실제로 그려진 색의 대비, 움직임. 설계서 7.9의 여덟 항목을 5단계의 새 화면에서 같은 잣대로 잰다.
// 이전 단계의 시험(overlays.flow, phase5-pitch-chord.flow)과 같은 기준이다: 폭 640이 200% 확대, 누르는 대상은 48 px, 글자 대비는 4.5:1이다.
import type { BrowserContext, Page } from 'playwright-core';

/** 누를 수 있는 것들(이름과 크기를 보는 대상) */
export const CONTROLS =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="slider"], [role="switch"], [role="tab"], [role="button"]';

// ---------------------------------------------------------------------------
// 3번: 확대(200% = 폭 640)에서 잘리지 않는다

export interface OverflowReport {
  docW: number;
  innerW: number;
  /** 화면 폭 밖으로 나간 누르는 대상 */
  out: string[];
}

/** 가로로 넘치지 않고, 범위 안의 보이는 누르는 대상이 모두 화면 폭 안에 있는가(옆으로 미는 줄 안의 것은 밀어서 닿으니 빼고). 뒤가 inert인 것(카드 뒤의 막대)은 세지 않는다 */
export function overflowReport(page: Page, scope = 'body'): Promise<OverflowReport> {
  return page.evaluate(
    ({ scope, controls }) => {
      const root = document.querySelector(scope) ?? document.body;
      const out: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(controls)) {
        if (el.closest('[inert]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.left >= -1 && r.right <= window.innerWidth + 1) continue;
        // 옆으로 미는 줄(수첩의 쪽 탭 줄 같은 것) 안에 있으면 손으로 밀어 닿는다: 넘침이 아니다
        let sideways = false;
        for (let p = el.parentElement; p && !sideways; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          sideways = (ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1;
        }
        if (!sideways) out.push(`${el.className || el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return { docW: document.documentElement.scrollWidth, innerW: window.innerWidth, out };
    },
    { scope, controls: CONTROLS },
  );
}

// ---------------------------------------------------------------------------
// 2번, 8번: 누르는 대상의 크기와 이름

export interface ControlRow {
  name: string;
  w: number;
  h: number;
  role: string;
  cls: string;
}

/** 범위 안에서 보이는 누르는 대상의 이름(글, aria-label, 연결된 이름표)과 크기. 뒤가 inert인 것과 화면 낭독기용으로만 숨긴 1 px 조각은 세지 않는다 */
export function controlsReport(page: Page, scope = 'body'): Promise<ControlRow[]> {
  return page.evaluate(
    ({ scope, controls }) => {
      const root = document.querySelector(scope) ?? document.body;
      const out: ControlRow[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(controls)) {
        if (el.closest('[inert]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') continue;
        const labelledBy = el.getAttribute('aria-labelledby');
        const byId = labelledBy ? labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
        const labels = (el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels ?? []).map((l) => l.textContent ?? '').join(' ') : '';
        const name = (el.getAttribute('aria-label') ?? (byId || labels || el.innerText || el.getAttribute('title') || '')).replace(/\s+/g, ' ').trim();
        out.push({ name, w: Math.round(r.width), h: Math.round(r.height), role: el.getAttribute('role') ?? el.tagName.toLowerCase(), cls: String(el.className) });
      }
      return out;
    },
    { scope, controls: CONTROLS },
  );
}

const INTERACTIVE = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton', 'switch', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'treeitem']);

/**
 * 브라우저가 계산한 접근성 트리에서, 무시되지 않은 누르는 대상 가운데 이름이 빈 것(8번).
 * 화면 낭독기가 읽는 것과 같은 계산이라 aria-label, 연결된 이름표, 글을 직접 합치는 것보다 믿을 만하다. 뒤가 inert이면 트리에서 빠진다.
 * 못 찾은 것이 없는지 보려고 센 수도 함께 돌려준다.
 */
export async function axReport(ctx: BrowserContext, page: Page): Promise<{ counted: number; unnamed: string[] }> {
  const cdp = await ctx.newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    await cdp.send('DOM.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const unnamed: string[] = [];
    let counted = 0;
    for (const n of nodes) {
      const role = String(n.role?.value ?? '');
      if (n.ignored || !INTERACTIVE.has(role)) continue;
      counted++;
      if (String(n.name?.value ?? '').trim()) continue;
      let what = role;
      if (n.backendDOMNodeId) {
        try {
          const d = await cdp.send('DOM.describeNode', { backendNodeId: n.backendDOMNodeId });
          const attrs = d.node.attributes ?? [];
          const cls = attrs[attrs.indexOf('class') + 1];
          what = `${role} <${d.node.localName}${cls ? ` class="${cls}"` : ''}>`;
        } catch {
          /* 설명을 못 읽어도 역할은 남긴다 */
        }
      }
      unnamed.push(what);
    }
    return { counted, unnamed };
  } finally {
    await cdp.detach();
  }
}

// ---------------------------------------------------------------------------
// 7번: 글자 대비. 그려진 글자마다 계산된 글자색과 배경색(겹친 반투명 층 포함)으로 잰다

export interface ContrastRow {
  text: string;
  cls: string;
  fg: string;
  bg: string;
  ratio: number;
  need: number;
  size: number;
  disabled: boolean;
}
export interface ContrastReport {
  /** 잰 글자 덩어리 수 */
  checked: number;
  /** 가장 낮은 대비 */
  min: number;
  /** 배경이 그림(그라데이션, 이미지)이라 계산하지 못한 것 */
  unknown: string[];
  /** 7:1 미만인 것들(낮은 순). 기준에 못 미치는 것은 ratio < need */
  rows: ContrastRow[];
}

export function contrastReport(page: Page, scope = 'body'): Promise<ContrastReport> {
  return page.evaluate((scope) => {
    type RGB = [number, number, number];
    type RGBA = [number, number, number, number];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    const parse = (css: string): RGBA => {
      const m = /^rgba?\(([^)]+)\)$/.exec(css) ?? /^color\(srgb ([^)]+)\)$/.exec(css);
      if (m) {
        const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
        const scale = css.startsWith('color(') ? 255 : 1;
        return [p[0]! * scale, p[1]! * scale, p[2]! * scale, p.length > 3 ? p[3]! : 1];
      }
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = '#000';
      g.fillStyle = css;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const over = (top: RGBA, base: RGB): RGB => [0, 1, 2].map((i) => top[i]! * top[3] + base[i]! * (1 - top[3])) as RGB;
    const lum = (c: RGB): number => {
      const [r, gg, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      }) as RGB;
      return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    };
    const ratio = (a: RGB, b: RGB): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const hex = (c: RGB): string => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

    const root = document.querySelector(scope) ?? document.body;
    const rows: ContrastRow[] = [];
    const unknown: string[] = [];
    let checked = 0;
    let min = Infinity;
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      if (!(el instanceof HTMLElement)) continue;
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
      if (own.length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const chain: HTMLElement[] = [];
      for (let e: HTMLElement | null = el; e; e = e.parentElement) chain.unshift(e);
      // 요소와 그 위 조상의 불투명도를 곱한다(조상의 불투명도는 그 아래 모든 것에 걸린다)
      let op = 1;
      const opAbove = chain.map((e) => (op *= parseFloat(getComputedStyle(e).opacity)));
      if (opAbove[opAbove.length - 1]! < 0.05) continue;
      const layers = chain.map((e, i) => {
        const s = getComputedStyle(e);
        const col = parse(s.backgroundColor);
        col[3] *= opAbove[i]!;
        return { col, image: s.backgroundImage !== 'none' };
      });
      // 위(요소)에서 아래(뿌리)로 내려가며 처음 불투명한 층까지만 쌓는다. 그림 층을 먼저 만나면 계산하지 못한다
      let start = 0;
      let opaque = false;
      let image = false;
      for (let i = chain.length - 1; i >= 0; i--) {
        const L = layers[i]!;
        if (L.image) {
          image = true;
          break;
        }
        start = i;
        if (L.col[3] >= 0.999) {
          opaque = true;
          break;
        }
      }
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
      if (image) {
        unknown.push(`${String(el.className)} "${text}"`);
        continue;
      }
      const fgCss = parse(cs.color);
      fgCss[3] *= opAbove[opAbove.length - 1]!;
      // 아래가 비쳐 보이면(불투명한 층이 없으면) 땅이 흰색일 때와 검은색일 때 중 나쁜 쪽으로 잰다
      let worst = Infinity;
      let worstFg: RGB = [0, 0, 0];
      let worstBg: RGB = [0, 0, 0];
      for (const base of opaque ? ([[0, 0, 0]] as RGB[]) : ([[255, 255, 255], [0, 0, 0]] as RGB[])) {
        let bg: RGB = base;
        for (let i = start; i < chain.length; i++) bg = over(layers[i]!.col, bg);
        const fg = over(fgCss, bg);
        const q = ratio(fg, bg);
        if (q < worst) [worst, worstFg, worstBg] = [q, fg, bg];
      }
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      checked++;
      min = Math.min(min, worst);
      if (worst < 7) {
        rows.push({
          text,
          cls: String(el.className),
          fg: hex(worstFg),
          bg: hex(worstBg),
          ratio: Math.round(worst * 100) / 100,
          need,
          size,
          disabled: el.closest('[disabled], [aria-disabled="true"]') !== null,
        });
      }
    }
    rows.sort((a, b) => a.ratio - b.ratio);
    return { checked, min: Math.round(min * 100) / 100, unknown, rows };
  }, scope);
}

/** 기준에 못 미치는 글자(쓸 수 없는 단추의 글자는 따로 센다) */
export const contrastFails = (r: ContrastReport, includeDisabled = false): ContrastRow[] => r.rows.filter((x) => x.ratio < x.need && (includeDisabled || !x.disabled));

// ---------------------------------------------------------------------------
// 5번: 움직임 줄이기

export interface MotionRow {
  el: string;
  /** 가장 긴 전환(초) */
  t: number;
  /** 가장 긴 애니메이션(초) */
  a: number;
}

/** 범위 안에서 1 ms보다 긴 전환이나 애니메이션을 가진 것과, 부드러운 스크롤을 켠 것의 수 */
export function motionReport(page: Page, scope = 'body'): Promise<{ checked: number; slow: MotionRow[]; smooth: number }> {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) ?? document.body;
    const max = (v: string): number => Math.max(...v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x))));
    const slow: Array<{ el: string; t: number; a: number }> = [];
    let checked = 0;
    let smooth = 0;
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
      const cs = getComputedStyle(el);
      checked++;
      if (cs.scrollBehavior === 'smooth') smooth++;
      const t = max(cs.transitionDuration);
      const a = max(cs.animationDuration);
      if (t > 0.001 || a > 0.001) slow.push({ el: String((el as HTMLElement).className || el.tagName), t, a });
    }
    return { checked, slow, smooth };
  }, scope);
}

// ---------------------------------------------------------------------------
// 1번: 키보드 도구

/** 지금 초점이 있는 것의 짧은 설명(실패했을 때 어디에 있었는지 알리려고) */
export const activeDesc = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return '(몸통)';
    return `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className)} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  });

/** Tab(back이면 Shift+Tab)으로 선택자에 맞는 곳까지 간다. 못 찾으면 마지막 초점을 알린다 */
export async function tabToSel(page: Page, sel: string, opts: { max?: number; back?: boolean } = {}): Promise<number> {
  const max = opts.max ?? 160;
  for (let i = 0; i <= max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, sel)) return i;
    await page.keyboard.press(opts.back ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`키보드(Tab ${max}번)로 ${sel}에 닿지 못했어요. 마지막 초점: ${await activeDesc(page)}`);
}

/** 초점이 선택자 안에 있는가(몸통에 있으면 아니다) */
export const focusedWithin = (page: Page, sel: string): Promise<boolean> =>
  page.evaluate((s) => {
    const e = document.activeElement;
    return !!e && e !== document.body && e.closest(s) !== null;
  }, sel);

/** 초점이 선택자 밖의 어딘가에 있으면 그 설명. 안이거나 몸통이면 null(문서 끝을 지나면 몸통으로 돌아온다) */
export const focusedOutside = (page: Page, sel: string): Promise<string | null> =>
  page.evaluate((s) => {
    const e = document.activeElement;
    if (!e || e === document.body || e.closest(s) !== null) return null;
    return `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className)}`;
  }, sel);

/**
 * 초점이 선택자에 올 때까지 기다린다. 화면이 다시 그려진 뒤 초점을 옮기는 일은 한 프레임 뒤에 일어나므로(Preact의 효과),
 * 누른 바로 다음에 읽으면 아직 옛 자리다. 끝내 안 오면 어디에 있었는지를 알린다.
 */
export async function waitFocus(page: Page, sel: string, what: string, timeout = 5000): Promise<void> {
  try {
    await page.waitForFunction((s) => document.activeElement?.matches(s) ?? false, sel, { timeout });
  } catch {
    throw new Error(`${what}: 초점이 ${sel}에 오지 않았어요. 지금 초점: ${await activeDesc(page)}`);
  }
}

/** 초점이 선택자 안으로 올 때까지 기다린다(몸통에 있으면 아직이다) */
export async function waitFocusWithin(page: Page, sel: string, what: string, timeout = 5000): Promise<void> {
  try {
    await page.waitForFunction(
      (s) => {
        const e = document.activeElement;
        return !!e && e !== document.body && e.closest(s) !== null;
      },
      sel,
      { timeout },
    );
  } catch {
    throw new Error(`${what}: 초점이 ${sel} 안으로 오지 않았어요. 지금 초점: ${await activeDesc(page)}`);
  }
}

/** 지금 초점이 있는 것에 초점 표시(윤곽선)가 그려져 있는가(7.5). 너비 2 px 이상의 실선이다 */
export function focusRing(page: Page): Promise<{ ok: boolean; what: string }> {
  return page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return { ok: false, what: '(몸통)' };
    const cs = getComputedStyle(e);
    return { ok: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, what: `${e.tagName.toLowerCase()}.${String(e.className)} outline=${cs.outlineStyle} ${cs.outlineWidth}` };
  });
}

// ---------------------------------------------------------------------------
// 8번: 화면에 보이는 글자가 낭독기 이름에 들어 있다(라벨 내 이름). 음성 조작이 보이는 글자로 누를 수 있게

export interface LabelRow {
  label: string;
  text: string;
  cls: string;
}

/** aria-label이 있는 누르는 대상 가운데, 화면에 보이는 글(아이콘, 단축키 표시, 낭독기 전용 글은 뺀다)이 그 이름에 들어 있지 않은 것 */
export function labelMismatch(page: Page, scope = 'body'): Promise<LabelRow[]> {
  return page.evaluate(
    ({ scope, controls }) => {
      // 보이는 글자가 이름에 들어 있는지 본다(WCAG 2.5.3). 띄어쓰기는 낭독기가 따로 다루므로 공백을 모두 지우고 견준다
      const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();
      const root = document.querySelector(scope) ?? document.body;
      const out: Array<{ label: string; text: string; cls: string }> = [];
      for (const el of root.querySelectorAll<HTMLElement>(controls)) {
        if (el.closest('[inert]')) continue;
        const label = el.getAttribute('aria-label');
        if (!label) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const clone = el.cloneNode(true) as HTMLElement;
        for (const x of Array.from(clone.querySelectorAll('[aria-hidden="true"], svg, kbd, .sr-only'))) x.remove();
        const text = norm(clone.textContent ?? '');
        if (text && !norm(label).includes(text)) out.push({ label, text, cls: String(el.className) });
      }
      return out;
    },
    { scope, controls: CONTROLS },
  );
}

// ---------------------------------------------------------------------------
// 3번: 겹침 안에서 글이 잘려 나가지 않는다

/**
 * 가려서 자르는(overflow hidden, clip) 상자 가운데, 보이는 글을 품은 자손이 상자 밖으로 삐져나가 잘리는 것.
 * 스크롤이 되는 상자(auto, scroll)는 잘리지 않으니 뺀다. 글줄임(text-overflow: ellipsis)을 일부러 쓴 상자도 뺀다.
 * 낭독기 전용 글(.sr-only, 자리를 잡지 않는 절대 위치 조각)이 만드는 스크롤 높이는 눈에 보이는 잘림이 아니라서 세지 않는다.
 * 자손 사이에 또 다른 가리거나 스크롤하는 상자가 끼어 있으면 그 상자가 맡으니(그 상자를 따로 본다) 그 아래는 세지 않는다.
 */
export function clipReport(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) ?? document.body;
    const out: string[] = [];
    const clips = (cs: CSSStyleDeclaration): boolean => ['hidden', 'clip', 'auto', 'scroll'].some((v) => cs.overflowX === v || cs.overflowY === v);
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
      if (!(el instanceof HTMLElement)) continue;
      const cs = getComputedStyle(el);
      const hides = (v: string): boolean => v === 'hidden' || v === 'clip';
      if (!hides(cs.overflowX) && !hides(cs.overflowY)) continue;
      if (cs.textOverflow === 'ellipsis') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const wide = hides(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const tall = hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      if (!wide && !tall) continue;
      if (!(el.textContent ?? '').trim()) continue;
      // 보이는 글을 직접 품은 자손이 상자의 안쪽 가장자리를 넘는가
      let cut = '';
      for (const d of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
        if (d.closest('.sr-only')) continue;
        const own = Array.from(d.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
        if (!own) continue;
        const dr = d.getBoundingClientRect();
        if (dr.width < 1 || dr.height < 1) continue;
        const dcs = getComputedStyle(d);
        if (dcs.visibility === 'hidden' || dcs.display === 'none') continue;
        // 이 자손과 상자 사이에 다른 가리거나 스크롤하는 상자가 있으면 그 상자가 맡는다
        let held = false;
        for (let p = d.parentElement; p && p !== el && !held; p = p.parentElement) held = clips(getComputedStyle(p));
        if (held) continue;
        const bottom = r.top + el.clientHeight;
        const right = r.left + el.clientWidth;
        if ((tall && dr.bottom > bottom + 1) || (wide && dr.right > right + 1)) {
          cut = `${d.className || d.tagName} ${tall && dr.bottom > bottom + 1 ? `아래로 ${Math.round(dr.bottom - bottom)}px` : ''}${wide && dr.right > right + 1 ? ` 오른쪽으로 ${Math.round(dr.right - right)}px` : ''}`.trim();
          break;
        }
      }
      if (cut) out.push(`${el.className || el.tagName} 안의 ${cut}`);
    }
    return out;
  }, scope);
}

// ---------------------------------------------------------------------------
// 3번, 8번: 손이 닿는가

/**
 * 범위 안에서 보이는 누르는 대상마다 가운데 점이 그 대상(이나 그 안쪽)에 닿는지 본다. 다른 것이 위를 덮거나 화면 밖에 있으면 실패다.
 * 미는 칸(스크롤 상자) 안에 있어 지금은 그 칸의 보이는 영역 밖에 있는 것은 밀어서 닿으니 세지 않는다.
 * 하나씩 눌러 보는(trial click) 방법은 대상이 수십 개인 작업대에서 몇 분이 걸려서, 한 번에 모두 재는 이 방법을 쓴다.
 */
export function reachReport(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate(
    ({ scope, controls }) => {
      const root = document.querySelector(scope) ?? document.body;
      const bad: string[] = [];
      const label = (el: HTMLElement): string => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${(el.getAttribute('aria-label') ?? el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)}"`;
      for (const el of root.querySelectorAll<HTMLElement>(controls)) {
        if (el.closest('[inert]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // 미는 칸의 보이는 영역 밖에 있으면 밀어서 닿는다
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          const sy = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1;
          const sx = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1;
          if (!sx && !sy) continue;
          const pr = p.getBoundingClientRect();
          if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) clipped = true;
        }
        if (clipped) continue;
        if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) {
          bad.push(`화면 밖 ${label(el)} (${Math.round(cx)}, ${Math.round(cy)})`);
          continue;
        }
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) {
          bad.push(`가려짐 ${label(el)} 위에 ${hit ? `${hit.tagName.toLowerCase()}.${String((hit as HTMLElement).className).split(' ').join('.')}` : '아무것도 없음'}`);
        }
      }
      return bad;
    },
    { scope, controls: CONTROLS },
  );
}
