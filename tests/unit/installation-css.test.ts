// 7.9, 7.6: 설치물 화면(installation.css)의 글자 대비, 누르는 크기, 글자 크기 설정, 색만으로 말하지 않는 표지, 눌림 통과.
import { describe, expect, it } from 'vitest';
import { contrast, over, parseRules, readCss, resolveColor, tokens } from './css-rig';
import type { Rule } from './css-rig';

const css = readCss('installation.css');
const rules = parseRules(css);
const rule = (selector: string, media: string | null = null): Rule => {
  const r = rules.find((x) => x.selector === selector && (media === null ? x.media === null : (x.media ?? '').includes(media)));
  if (!r) throw new Error(`규칙이 없어요: ${selector} ${media ?? ''}`);
  return r;
};
const px = (v: string | undefined): number => parseInt(v ?? '0', 10);
const t = (name: string): string => tokens.get(name)!;

describe('installation.css의 색 대비(7.9 7번)', () => {
  it('규칙을 읽었다', () => {
    expect(rules.length).toBeGreaterThan(40);
  });

  it('글자색과 배경색을 함께 정한 규칙은 모두 4.5:1 이상이다', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const r of rules) {
      const fg = r.decls.has('color') ? resolveColor(r.decls.get('color')!) : null;
      const bgRaw = r.decls.get('background-color') ?? r.decls.get('background');
      const bg = bgRaw ? resolveColor(bgRaw) : null;
      if (!fg || !bg) continue;
      checked++;
      const ratio = contrast(fg, bg);
      if (ratio < 4.5) failures.push(`${r.selector}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    }
    expect(checked).toBeGreaterThanOrEqual(2);
    expect(failures).toEqual([]);
  });

  it('작업대(확인 결과는 그 안에 있다)의 반투명 바탕은 불투명도 0.9 이상이고, 어두운 땅이 비쳐도 그 위 글자(ink, muted, teal)가 4.5:1 이상이다', () => {
    const found = [...css.matchAll(/background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/g)].filter((m) => Number(m[1]) === 255);
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const m of found) {
      const alpha = Number(m[4]);
      expect(alpha).toBeGreaterThanOrEqual(0.9);
      for (const ground of [0, 255]) {
        const bg = over([Number(m[1]), Number(m[2]), Number(m[3]), alpha], ground);
        for (const token of ['ink', 'muted', 'teal']) expect(contrast(t(token), bg), `${token} on ${bg} (땅 ${ground})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('표지판의 부연 글(muted)은 놓일 수 있는 바탕(흰색, 안내 띠, 연한 청록) 위에서, 키 글자(muted)는 종이색 위에서 4.5:1 이상이다', () => {
    for (const surface of ['white', 'band', 'teal-light', 'paper']) expect(contrast(t('muted'), t(surface)), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
    expect(resolveColor(rule('.inst-key').decls.get('background')!)).toBe(t('paper'));
    expect(contrast(resolveColor(rule('.inst-key').decls.get('color')!)!, t('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('주 단추(청록 바탕)의 키 글자는 흰색이라 4.5:1 이상이다', () => {
    const r = rule('.inst-btn.btn-primary .inst-key');
    expect(resolveColor(r.decls.get('color')!)).toBe(t('white'));
    expect(contrast(t('white'), t('teal'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('white'), '#11534b')).toBeGreaterThanOrEqual(4.5); // 가져다 댔을 때
  });

  it('확인 결과의 틀린 글자(coral-text)는 산호색 연한 바탕 위에서 4.5:1 이상이다', () => {
    expect(contrast(t('coral-text'), t('coral-light'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('installation.css: 누르는 크기와 글자 크기(7.6, 7.8)', () => {
  it('누르는 대상은 48px 이상이다(재료, 표지판 항목, 조작 단추)', () => {
    for (const sel of ['.inst-material', '.inst-sign-item']) expect(px(rule(sel).decls.get('min-height')), sel).toBeGreaterThanOrEqual(48);
    expect(px(rule('.inst-material').decls.get('min-width'))).toBeGreaterThanOrEqual(48);
    // 좁은 화면과 낮은 가로 화면에서도 조작 단추는 48px 아래로 내려가지 않는다
    const heights = rules.filter((r) => r.selector === '.inst-btn' && r.decls.has('min-height')).map((r) => px(r.decls.get('min-height')));
    expect(heights.length).toBeGreaterThanOrEqual(2);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
    for (const r of rules.filter((x) => x.selector === '.inst-btn' && x.decls.has('min-width'))) expect(px(r.decls.get('min-width'))).toBeGreaterThanOrEqual(48);
    // 기본 단추(.btn)는 panels.css에서 48px로 이미 정해져 있다
    const grid = rule('.inst-bar', '(max-width: 760px)');
    expect(grid.decls.get('grid-template-columns')).toMatch(/minmax\((\d+)px/);
    expect(parseInt(/minmax\((\d+)px/.exec(grid.decls.get('grid-template-columns')!)![1]!, 10)).toBeGreaterThanOrEqual(56);
  });

  it('모든 글자 크기가 글자 크기 설정(--text-scale)을 따른다. 본문은 14px 이상이다', () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const raw = [...stripped.matchAll(/font-size:\s*[0-9.]+px/g), ...stripped.matchAll(/font:\s*[^;{}]*?\s[0-9.]+px\//g)];
    expect(raw.map((m) => m[0])).toEqual([]);
    const sizes = [...stripped.matchAll(/font-size:\s*calc\(([0-9.]+)px \* var\(--text-scale, 1\)\)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(8);
    // 12–13px는 짧은 키 표시와 좁은 화면의 단추 글자에만 쓴다
    const small = rules.filter((r) => /calc\((1[0-3])px/.test(r.decls.get('font-size') ?? '')).map((r) => r.selector);
    expect(small.sort()).toEqual(['.inst-btn', '.inst-key']);
  });
});

describe('installation.css: 색만으로 말하지 않는다(7.9 4번)', () => {
  it('고른 재료는 바탕과 테두리뿐 아니라 아래 막대(모양)로도 구분된다', () => {
    expect(rule('.inst-material.is-selected').decls.get('box-shadow')).toMatch(/inset 0 -4px 0/);
  });

  it('준비 중인 표지판 항목은 점선 테두리(모양)로도 다르다', () => {
    expect(rule('.inst-sign-item.is-unready').decls.get('border-style')).toBe('dashed');
  });

  it('고른 표지판 항목은 두 겹의 바탕과 테두리 색으로 구분되고, 화면에는 확인 그림이 함께 있다(컴포넌트 시험)', () => {
    const r = rule('.inst-sign-item.is-selected');
    expect(resolveColor(r.decls.get('border-color')!)).toBe(t('teal'));
    expect(resolveColor(r.decls.get('background')!)).toBe(t('teal-light'));
  });
});

describe('installation.css: 겹침의 눌림 통과와 자리', () => {
  it('바깥 틀과 떠 있는 칸은 눌림을 통과시키고, 작업대와 카드 같은 안의 것만 받는다(돌을 누를 수 있게)', () => {
    expect(rule('.inst-hud').decls.get('pointer-events')).toBe('none');
    expect(rule('.inst-hud > *').decls.get('pointer-events')).toBe('auto');
    expect(rule('.inst-float').decls.get('pointer-events')).toBe('none');
    expect(rule('.inst-float > *').decls.get('pointer-events')).toBe('auto');
  });

  it('작업대는 아래에 붙고 떠 있는 칸은 그 위에 쌓인다(떠 있는 칸이 작업대의 높이를 바꾸지 않는다)', () => {
    const hud = rule('.inst-hud');
    expect(hud.decls.get('display')).toBe('flex');
    expect(hud.decls.get('flex-direction')).toBe('column');
    expect(hud.decls.get('justify-content')).toBe('flex-end');
  });

  it('세로 화면에서는 아래 탭 막대(64px) 위에 놓는다', () => {
    const r = rule('.inst-hud', '(orientation: portrait)');
    expect(r.decls.get('padding-bottom')).toMatch(/64px/);
  });

  it('떠 있는 칸은 화면의 60% 안에서 스크롤하고, 낮은 가로 화면에서는 50%다', () => {
    expect(rule('.inst-float').decls.get('max-height')).toBe('60%');
    expect(rule('.inst-float', '(orientation: landscape)').decls.get('max-height')).toBe('50%');
    expect(rule('.inst-float').decls.get('overflow')).toBe('auto');
  });

  it('안전 영역(노치)을 피한다', () => {
    expect(rule('.inst-hud').decls.get('padding')).toMatch(/safe-area-inset-top/);
  });

  it('토큰이 아닌 색을 새로 만들지 않는다: 쓰는 색은 토큰이거나 흰 반투명, 눌림 그림자뿐이다', () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const hexes = [...stripped.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexes).toEqual([]);
  });
});
