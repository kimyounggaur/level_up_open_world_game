// CSS 시험이 함께 쓰는 작은 도구(제품 코드가 아니다): 토큰 읽기, 색 대비, 규칙 읽개.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
export const srcPath = (...p: string[]): string => path.resolve(here, '../../src', ...p);
export const readCss = (name: string): string => fs.readFileSync(srcPath('ui', name), 'utf8');

export const tokens = new Map<string, string>();
for (const m of readCss('tokens.css').matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens.set(m[1]!, m[2]!.toLowerCase());

export function resolveColor(value: string): string | null {
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

export interface Rule {
  selector: string;
  decls: Map<string, string>;
  /** 이 규칙을 감싼 @media 줄(없으면 null) */
  media: string | null;
}

/** 작은 CSS 읽개: 주석을 지우고, 안에 다른 블록이 없는 블록(@media 안의 규칙 포함)을 규칙으로 읽는다 */
export function parseRules(css: string): Rule[] {
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
        const media = stack.map((s) => s.head).filter((h) => h.startsWith('@media'))[0] ?? null;
        rules.push({ selector: top.head, decls, media });
      }
      buffer = '';
    } else buffer += ch;
  }
  return rules;
}

/** 반투명 흰 바탕이 땅(검정부터 흰색까지) 위에 놓였을 때 합쳐진 색 */
export function over(rgba: [number, number, number, number], ground: number): string {
  const [r, g, b, a] = rgba;
  return '#' + [r, g, b].map((c) => Math.round(a * c + (1 - a) * ground).toString(16).padStart(2, '0')).join('');
}
