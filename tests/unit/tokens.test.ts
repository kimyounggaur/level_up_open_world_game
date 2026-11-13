import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 0-4: 색 토큰의 대비 자동 검사 (설계서 9.2)
const css = fs.readFileSync(path.resolve(__dirname, '../../src/ui/tokens.css'), 'utf8');

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`토큰 --${name}을 찾지 못했어요`);
  return m[1]!.toLowerCase();
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('색 토큰 대비', () => {
  it('보조 글자색은 시안의 #667670이 아니라 보정한 #5B6B65다', () => {
    expect(token('muted')).toBe('#5b6b65');
    expect(contrast('#667670', token('paper'))).toBeLessThan(4.5); // 시안의 값은 기준에 못 미친다
    expect(contrast('#667670', token('teal-light'))).toBeLessThan(4.5);
  });

  it.each(['paper', 'white', 'teal-light', 'band', 'band-origin'])('보조 글자색은 %s 위에서 4.5:1 이상이다', (bg) => {
    expect(contrast(token('muted'), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('보조 글자색은 시안의 네 바탕(paper, white, tealLight, 안내 띠)에서 4.7:1 이상이다', () => {
    for (const bg of ['paper', 'white', 'teal-light', 'band']) {
      expect(contrast(token('muted'), token(bg))).toBeGreaterThanOrEqual(4.7);
    }
  });

  it('본문 글자색 ink는 paper 위에서 10.7:1 이상이다', () => {
    expect(contrast(token('ink'), token('paper'))).toBeGreaterThanOrEqual(10.7);
  });

  it('상호작용 색 teal은 white 위에서 6.6:1 이상이다', () => {
    expect(contrast(token('teal'), token('white'))).toBeGreaterThanOrEqual(6.6);
  });

  it('흰 글자는 teal 바탕 위에서 4.5:1 이상이다(버튼)', () => {
    expect(contrast(token('white'), token('teal'))).toBeGreaterThanOrEqual(4.5);
  });

  it('틀린 자리의 작은 글자는 연한 산호 바탕 위에서 4.5:1 이상이고, 산호색 글자는 그렇지 않다', () => {
    expect(contrast(token('coral-text'), token('coral-light'))).toBeGreaterThanOrEqual(5.5);
    expect(contrast(token('coral'), token('coral-light'))).toBeLessThan(4.5);
  });

  it('12색 팔레트가 모두 정의되어 있다', () => {
    for (const n of ['paper', 'ink', 'muted', 'line', 'white', 'teal', 'teal-light', 'coral', 'coral-light', 'ground', 'gold', 'purple']) {
      expect(token(n)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('지역 강조색 여섯이 설계서 9.2와 같다', () => {
    expect(token('region-village')).toBe('#17675d');
    expect(token('region-staff-hill')).toBe('#7f9a7a');
    expect(token('region-beat-river')).toBe('#5e97a6');
    expect(token('region-bell-grove')).toBe('#b18b49');
    expect(token('region-scale-trail')).toBe('#c2aa70');
    expect(token('region-key-marsh')).toBe('#8e86a8');
  });
});
