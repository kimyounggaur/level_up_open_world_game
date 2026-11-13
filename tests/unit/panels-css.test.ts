// 7.9 7번: 글자와 배경의 대비 4.5:1 이상. panels.css의 규칙 가운데 글자색과 배경색을 함께 정한 곳, 그리고 부모 바탕 위에 놓이는 글자색을 검사한다.
// 맞고 틀림이 색만으로 전해지지 않는 것(7.9 4번)은 컴포넌트 테스트가 기호와 문장으로 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = path.dirname(new URL(import.meta.url).pathname);
const tokensCss = fs.readFileSync(path.resolve(here, '../../src/ui/tokens.css'), 'utf8');
const panelsCss = fs.readFileSync(path.resolve(here, '../../src/ui/panels.css'), 'utf8');
const mapCss = fs.readFileSync(path.resolve(here, '../../src/ui/map.css'), 'utf8');

const tokens = new Map<string, string>();
for (const m of tokensCss.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens.set(m[1]!, m[2]!.toLowerCase());

function resolveColor(value: string): string | null {
  const v = value.trim().replace(/\s*!important$/, '');
  const hex = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hex) return `#${hex[1]!.toLowerCase()}`;
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(v);
  if (ref) return tokens.get(ref[1]!) ?? null;
  return null;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

interface Rule {
  selector: string;
  decls: Map<string, string>;
}

/** 작은 CSS 읽개: 주석을 지우고, 안에 다른 블록이 없는 블록(@media 안의 규칙 포함)만 규칙으로 읽는다 */
function parseRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const stack: Array<{ head: string; body: string; hasChild: boolean }> = [];
  let buffer = '';
  for (const ch of text) {
    if (ch === '{') {
      if (stack.length) stack[stack.length - 1]!.hasChild = true;
      stack.push({ head: buffer.trim(), body: '', hasChild: false });
      buffer = '';
    } else if (ch === '}') {
      const top = stack.pop()!;
      const body = top.body + buffer;
      if (!top.hasChild) {
        const decls = new Map<string, string>();
        for (const part of body.split(';')) {
          const i = part.indexOf(':');
          if (i > 0) decls.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
        }
        rules.push({ selector: top.head, decls });
      }
      buffer = '';
    } else buffer += ch;
  }
  return rules;
}

const rules = [...parseRules(panelsCss), ...parseRules(mapCss)];
const bgOf = (r: Rule): string | null => {
  const v = r.decls.get('background-color') ?? r.decls.get('background');
  return v ? resolveColor(v) : null;
};

describe('panels.css의 색 대비', () => {
  it('규칙을 읽었다', () => {
    expect(rules.length).toBeGreaterThan(100);
    expect(tokens.size).toBeGreaterThanOrEqual(18);
  });

  it('글자색과 배경색을 함께 정한 규칙은 모두 4.5:1 이상이다', () => {
    const checked: string[] = [];
    const failures: string[] = [];
    for (const r of rules) {
      const fg = r.decls.has('color') ? resolveColor(r.decls.get('color')!) : null;
      const bg = bgOf(r);
      if (!fg || !bg) continue;
      checked.push(r.selector);
      const ratio = contrast(fg, bg);
      if (ratio < 4.5) failures.push(`${r.selector}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    }
    expect(checked.length).toBeGreaterThan(8);
    expect(failures).toEqual([]);
  });

  // 글자색만 정한 규칙은 부모의 바탕 위에 놓인다. 놓일 수 있는 바탕마다 확인한다.
  const t = (name: string): string => tokens.get(name)!;
  const surfaces = {
    paper: t('paper'),
    white: t('white'),
    band: t('band'),
    bandOrigin: t('band-origin'),
    tealLight: t('teal-light'),
    coralLight: t('coral-light'),
  };

  it.each([
    ['muted(보조 글자)', 'muted', ['paper', 'white', 'band', 'bandOrigin', 'tealLight', 'coralLight']],
    ['ink(본문)', 'ink', ['paper', 'white', 'band', 'bandOrigin', 'tealLight', 'coralLight']],
    ['coral-text(틀린 자리 글자)', 'coral-text', ['white', 'coralLight', 'paper']],
    ['teal(링크)', 'teal', ['paper', 'white']],
  ] as Array<[string, string, Array<keyof typeof surfaces>]>)('%s는 놓일 수 있는 바탕 위에서 4.5:1 이상이다', (_name, token, on) => {
    for (const s of on) expect(contrast(t(token), surfaces[s]), `${token} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  // 걷는 화면의 막대(HUD)는 월드 위에 반투명 흰 바탕으로 뜬다. 바탕이 가장 어두운 땅(검정까지 쳐서) 위에 놓여도 글자가 읽혀야 한다.
  it('HUD의 반투명 바탕은 불투명도 0.9 이상이고, 검은 땅이 비쳐도 그 위 글자(ink, muted, teal)가 4.5:1 이상이다', () => {
    const hudCss = fs.readFileSync(path.resolve(here, '../../src/ui/hud.css'), 'utf8');
    const found = [...hudCss.matchAll(/background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/g)];
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const m of found) {
      const alpha = Number(m[4]);
      expect(alpha).toBeGreaterThanOrEqual(0.9);
      const over = (ground: number): string =>
        '#' + [m[1]!, m[2]!, m[3]!].map((c) => Math.round(alpha * Number(c) + (1 - alpha) * ground).toString(16).padStart(2, '0')).join('');
      for (const ground of [0, 255]) {
        const bg = over(ground);
        for (const token of ['ink', 'muted', 'teal']) expect(contrast(tokens.get(token)!, bg), `${token} on ${bg} (땅 ${ground})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('검수 전 표지(금색 바탕의 짙은 글자)와 흰 글자 단추는 4.5:1 이상이다', () => {
    expect(contrast('#1d1808', t('gold'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('white'), '#11534b')).toBeGreaterThanOrEqual(4.5); // 누르려고 가져다 댄 주 단추
    expect(contrast(t('white'), '#17292a')).toBeGreaterThanOrEqual(4.5); // 가져다 댄 확인 단추
  });

  it('초점 표시(teal)는 paper와 white 위에서 3:1 이상이다(비글자 대비)', () => {
    expect(contrast(t('teal'), t('paper'))).toBeGreaterThanOrEqual(3);
    expect(contrast(t('teal'), t('white'))).toBeGreaterThanOrEqual(3);
  });

  it('스위치의 켜짐과 꺼짐 바탕은 흰 손잡이와 3:1 이상으로 구분된다', () => {
    expect(contrast(t('teal'), t('white'))).toBeGreaterThanOrEqual(3);
    expect(contrast('#9aa8a1', t('white'))).toBeGreaterThanOrEqual(2.2); // 꺼짐은 '꺼짐' 글자도 함께 보인다
  });

  it('누르는 대상은 48px 이상으로 정해져 있다', () => {
    const must = ['.btn', '.nav-link', '.chip-button', '.switch', '.brand'];
    for (const sel of must) {
      const r = rules.find((x) => x.selector === sel);
      expect(r, sel).toBeTruthy();
      expect(parseInt(r!.decls.get('min-height') ?? '0', 10), sel).toBeGreaterThanOrEqual(48);
    }
    const big = rules.find((x) => x.selector === '.btn-wide');
    expect(parseInt(big!.decls.get('min-height')!, 10)).toBeGreaterThanOrEqual(56);
  });

  it('본문 글자는 16px 이상이다(글자 크기 배율을 곱하기 전의 기준값)', () => {
    const body = rules.find((x) => x.selector === 'body');
    expect(parseInt(body!.decls.get('font-size')!.replace(/^calc\(/, ''), 10)).toBeGreaterThanOrEqual(16);
  });

  it('모든 글자 크기가 글자 크기 설정(--text-scale)을 따른다. 크게는 1.25배, 보통은 1배다(7.8)', () => {
    const files: Array<[string, string]> = [
      ['panels.css', panelsCss],
      ['map.css', mapCss],
      ['hud.css', fs.readFileSync(path.resolve(here, '../../src/ui/hud.css'), 'utf8')],
    ];
    for (const [name, css] of files) {
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const raw = [...stripped.matchAll(/font-size:\s*[0-9.]+px/g), ...stripped.matchAll(/font:\s*[^;{}]*?\s[0-9.]+px\//g)];
      expect(raw.map((m) => m[0]), name).toEqual([]);
      expect(/font-size:\s*calc\([0-9.]+px \* var\(--text-scale, 1\)\)/.test(stripped), name).toBe(true);
    }
    expect(/--text-scale:\s*1;/.test(tokensCss)).toBe(true);
    expect(/html\[data-text-size='large'\]\s*\{\s*--text-scale:\s*1\.25;/.test(tokensCss)).toBe(true);
  });

  it('움직임 줄이기 설정이 켜지면 브라우저 설정과 같은 규칙이 적용된다(7.9 5번)', () => {
    expect(tokensCss).toMatch(/html\[data-reduced-motion='true'\] \*/);
    const pref = /@media \(prefers-reduced-motion: reduce\) \{[^}]*animation-duration: 0\.001ms !important/.test(tokensCss.replace(/\n\s*/g, ' '));
    expect(pref).toBe(true);
  });
});

describe('자유 가락 화면 조각의 모양(4.9)', () => {
  const t = (name: string): string => tokens.get(name)!;
  const has = (selector: string) => rules.find((x) => x.selector === selector);

  it('저장 칸과 재료함이 쓰는 클래스가 모두 정해져 있다', () => {
    for (const sel of ['.melody-name', '.melody-name-label', '.melody-name-input', '.piece-list', '.piece-item', '.piece-name', '.piece-actions']) expect(has(sel), sel).toBeTruthy();
  });

  it('이름을 쓰는 칸은 48px 이상이고, 테두리가 흰 바탕과 3:1 이상이라 칸이 보인다', () => {
    const r = has('.melody-name-input')!;
    expect(parseInt(r.decls.get('min-height')!, 10)).toBeGreaterThanOrEqual(48);
    const border = resolveColor(r.decls.get('border')!.split(/\s+/).pop()!);
    expect(border).not.toBeNull();
    expect(contrast(border!, t('white'))).toBeGreaterThanOrEqual(3);
  });

  it('입력 칸의 글자는 16px 이상이고 글자 크기 설정을 따른다', () => {
    const size = has('.melody-name-input')!.decls.get('font-size')!;
    expect(size).toMatch(/^calc\(\d+px \* var\(--text-scale, 1\)\)$/);
    expect(parseInt(size.replace(/^calc\(/, ''), 10)).toBeGreaterThanOrEqual(16);
  });
});

describe('잔치 카드의 모양(6.4, 7.5)', () => {
  const t = (name: string): string => tokens.get(name)!;
  const has = (selector: string) => rules.find((x) => x.selector === selector);

  it('쓰는 클래스가 모두 정해져 있다', () => {
    for (const sel of ['.festival-shell', '.festival-card', '.festival-title', '.festival-text', '.festival-sound', '.festival-actions']) expect(has(sel), sel).toBeTruthy();
  });

  it('겉틀은 뒤를 어둡게 하지 않고 눌림도 막지 않는다. 카드만 눌림을 받는다(악사가 선 무대가 보여야 한다)', () => {
    const shell = has('.festival-shell')!;
    expect(shell.decls.get('pointer-events')).toBe('none');
    expect(shell.decls.has('background')).toBe(false);
    expect(has('.festival-card')!.decls.get('pointer-events')).toBe('auto');
  });

  it('카드는 화면 아래에 붙는다(무대 작업대 위가 아니라 월드 아래쪽에 작게 뜬다)', () => {
    expect(has('.festival-shell')!.decls.get('align-items')).toBe('flex-end');
  });

  it('카드의 바탕은 흰색이고 글자(ink)와 제목(teal)이 4.5:1 이상이다', () => {
    const card = has('.festival-card')!;
    expect(resolveColor(card.decls.get('background')!)).toBe(t('white'));
    expect(resolveColor(card.decls.get('color')!)).toBe(t('ink'));
    expect(contrast(t('ink'), t('white'))).toBeGreaterThanOrEqual(4.5);
    expect(resolveColor(has('.festival-title')!.decls.get('color')!)).toBe(t('teal'));
    expect(contrast(t('teal'), t('white'))).toBeGreaterThanOrEqual(4.5);
    // 소리 안내 칸의 바탕(paper) 위 보조 글자
    expect(contrast(t('muted'), t('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('글자는 모두 글자 크기 배율을 따르고 본문은 16px 이상이다', () => {
    for (const sel of ['.festival-title', '.festival-text']) {
      const size = has(sel)!.decls.get('font-size')!;
      expect(size, sel).toMatch(/^calc\(\d+px \* var\(--text-scale, 1\)\)$/);
      expect(parseInt(size.replace(/^calc\(/, ''), 10), sel).toBeGreaterThanOrEqual(16);
    }
  });

  it('단추 줄은 줄바꿈이 되어 좁은 화면에서도 단추가 48px 높이를 지킨다', () => {
    expect(has('.festival-actions')!.decls.get('flex-wrap')).toBe('wrap');
    expect(has('.btn-large')!.decls.get('min-height')).toBe('56px');
  });
});
