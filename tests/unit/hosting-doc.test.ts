// 8-5 호스팅 문서(docs/hosting.md)가 시험 서버(tests/flow/hosting.ts)의 값과 같은지 지킨다.
// 값은 시험 도구가 한 곳에서 정하고, 실제 Chrome으로 그 값이 앱을 막지 않는지는 release.flow.ts와 `FLOW_HOSTED=1` 흐름 시험이 본다.
// 문서에 손으로 옮겨 적은 값이 낡으면 호스팅에 잘못된 머리말을 올리게 되므로 브라우저 없이 `npm run verify`에서 바로 잡는다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CACHE_ASSETS, CACHE_REVALIDATE, CSP, SECURITY_HEADERS } from '../flow/hosting';

const doc = fs.readFileSync(path.resolve(__dirname, '../../docs/hosting.md'), 'utf-8');
const titleCase = (name: string): string => name.replace(/(^|-)([a-z])/g, (_, a: string, c: string) => a + c.toUpperCase());

describe('docs/hosting.md와 시험 서버의 머리말', () => {
  it('보안 머리말 다섯 개가 문서의 "이름: 값" 모든 곳(본문, Netlify, 글 속)과 Vercel 예시에서 시험 서버와 같은 값이다', () => {
    expect(Object.keys(SECURITY_HEADERS)).toEqual(['content-security-policy', 'referrer-policy', 'x-content-type-options', 'x-frame-options', 'permissions-policy']);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      const name = titleCase(k);
      // "이름: 값"으로 적힌 곳은 하나도 빠짐없이 같은 값이어야 한다. 한 곳만 고치고 나머지를 두는 낡음을 잡는다(처음에는 "한 곳이라도 있다"만 봐서 놓쳤다).
      const found = [...doc.matchAll(new RegExp(`${name}: ([^\\n\`]+)`, 'g'))].map((m) => (m[1] ?? '').trim());
      expect(found.length, `${name}가 적힌 곳(본문과 Netlify 예시 이상)`).toBeGreaterThanOrEqual(2);
      for (const f of found) expect(f, name).toBe(v);
      // Vercel 예시는 JSON이라 꼴이 다르다
      expect(doc, `${name} (Vercel 예시)`).toContain(`{ "key": "${name}", "value": "${v}" }`);
    }
  });

  it('내용 보안 정책은 문서의 세 곳(본문, Netlify 예시, Vercel 예시)에 같은 글자로 있다', () => {
    expect(doc.split(CSP).length - 1).toBeGreaterThanOrEqual(3);
  });

  it('캐시 값 둘이 문서에 있고 예시(Netlify, Vercel, Nginx, Caddy)도 같은 글자를 쓴다', () => {
    expect(doc).toContain(CACHE_ASSETS);
    expect(doc).toContain(CACHE_REVALIDATE);
    expect(doc.split(CACHE_ASSETS).length - 1).toBeGreaterThanOrEqual(5);
  });

  it('정책에서 열어 둔 네 가지가 문서의 설명과 같다(정책을 고치면 설명도 고쳐야 한다)', () => {
    const opened = ["img-src 'self' data: blob:", "font-src 'self' data:", "worker-src 'self' blob:"];
    for (const o of opened) expect(CSP, o).toContain(o);
    for (const w of ['`img-src data:`', '`img-src blob:`', '`font-src data:`', '`worker-src blob:`']) expect(doc, w).toContain(w);
    // 열지 않은 것: 스크립트와 스타일은 default-src 'self'를 그대로 따른다
    expect(CSP.startsWith("default-src 'self';")).toBe(true);
    expect(CSP).not.toMatch(/script-src|style-src|unsafe-inline|unsafe-eval/);
  });

  it('시험 서버가 보내는 압축과 캐시 규칙이 문서와 같다(gzip 필수, assets는 오래, 나머지는 확인)', () => {
    expect(doc).toContain('gzip 필수');
    expect(doc).toMatch(/`assets\/\*`는 `public, max-age=31536000, immutable`/);
    expect(doc).toContain('`no-cache`');
  });
});
