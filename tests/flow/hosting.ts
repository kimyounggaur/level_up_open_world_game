// 8-5 호스팅 시험 도구: docs/hosting.md가 권하는 머리말(압축, 캐시, 보안)을 그대로 보내는 정적 서버.
// 배포하는 호스팅이 이 머리말을 보내도록 설정하면 앱이 같은 모습으로 도는지 실제 Chrome으로 보기 위한 것이다.
// 머리말의 값은 이 파일이 한 곳에서 정하고, 문서(docs/hosting.md)에 적힌 값이 같은지는 release.flow.ts가 지킨다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

/**
 * 내용 보안 정책(CSP). `default-src 'self'`에서 시작해 실제 Chrome으로 막힌 것을 하나씩 열었다(8-5, docs/hosting.md).
 * - `img-src data:`: Phaser의 기본 그림(`__DEFAULT`, `__MISSING`)이 data 주소다. 막으면 월드가 `glTexture` 오류로 그려지지 않는다.
 * - `img-src blob:`: Phaser가 그림 파일을 받아 blob 주소로 올린다.
 * - `font-src data:`: VexFlow가 악보 글꼴 세 개를 data 주소로 자기 코드 안에 담고 있다가 올린다(CSS가 아니다).
 * - `worker-src blob:`: Tone.js의 시계가 blob 주소의 작업자를 만든다.
 * 스크립트와 스타일은 `default-src 'self'`를 그대로 쓴다(인라인 스크립트와 eval을 허용하지 않는다).
 */
export const CSP =
  "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/** 모든 응답에 붙이는 보안 머리말(이름은 소문자) */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CSP,
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** 캐시 머리말: 이름에 해시가 든 `assets/*`는 바뀌면 이름이 바뀌므로 오래 두고, 나머지(index.html, world/*, 고지 파일)는 쓸 때마다 확인한다 */
export const CACHE_ASSETS = 'public, max-age=31536000, immutable';
export const CACHE_REVALIDATE = 'no-cache';
export const cacheControlFor = (pathname: string): string => (pathname.startsWith('/assets/') ? CACHE_ASSETS : CACHE_REVALIDATE);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

export interface Served {
  path: string;
  status: number;
  /** 몸통으로 나간 바이트(304는 0) */
  bytes: number;
  encoding: string | null;
  cacheControl: string | null;
}

export interface HostedServer {
  url: string;
  served: Served[];
  close(): Promise<void>;
}

export interface HostedOptions {
  /** 보안 머리말을 붙일지(기본 참) */
  security?: boolean;
  /** 보안 머리말을 이 값들로 바꾼다(정책 실험용) */
  headers?: Record<string, string>;
}

/** 호스팅을 흉내 낸 서버: gzip(글 파일), ETag와 If-None-Match(304), 캐시 머리말, 보안 머리말 */
export async function startHostedServer(distDir: string, opts: HostedOptions = {}): Promise<HostedServer> {
  const served: Served[] = [];
  const cache = new Map<string, { raw: Buffer; gz: Buffer; etag: string }>();
  const load = (file: string) => {
    let hit = cache.get(file);
    if (!hit) {
      const raw = fs.readFileSync(file);
      hit = { raw, gz: gzipSync(raw, { level: 9 }), etag: `"${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20)}"` };
      cache.set(file, hit);
    }
    return hit;
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    let p = path.join(distDir, decodeURIComponent(u.pathname));
    if (!p.startsWith(distDir)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) {
      served.push({ path: u.pathname, status: 404, bytes: 0, encoding: null, cacheControl: null });
      res.writeHead(404).end('not found');
      return;
    }
    const ext = path.extname(p);
    const { raw, gz, etag } = load(p);
    const rel = '/' + path.relative(distDir, p).split(path.sep).join('/');
    const cacheControl = cacheControlFor(rel);
    const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cacheControl, etag };
    if (opts.security !== false) Object.assign(headers, SECURITY_HEADERS, opts.headers ?? {});
    if (req.headers['if-none-match'] === etag) {
      served.push({ path: rel, status: 304, bytes: 0, encoding: null, cacheControl });
      res.writeHead(304, headers).end();
      return;
    }
    const zip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    const body = zip ? gz : raw;
    if (COMPRESSIBLE.has(ext)) headers['vary'] = 'Accept-Encoding';
    if (zip) headers['content-encoding'] = 'gzip';
    headers['content-length'] = String(body.length);
    served.push({ path: rel, status: 200, bytes: body.length, encoding: zip ? 'gzip' : null, cacheControl });
    res.writeHead(200, headers);
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/`, served, close: () => new Promise<void>((r) => server.close(() => r())) };
}
