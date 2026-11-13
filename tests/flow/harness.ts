// 흐름 테스트 도구: dist를 정적으로 띄우고 시스템 Chrome으로 연다(Playwright 코어).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { SECURITY_HEADERS } from './hosting';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

export interface Harness {
  url: string;
  /** 같은 dist를 글 파일(html, js, css, json, svg)만 gzip(수준 9)으로 보내는 두 번째 주소. 배포하는 서버가 압축을 켠 모습을 잴 때 쓴다(8-4). 나머지 시험은 쓰지 않는다 */
  zipUrl: string;
  browser: Browser;
  newContext(opts?: { viewport?: { width: number; height: number }; hasTouch?: boolean; reducedMotion?: 'reduce' | 'no-preference' }): Promise<BrowserContext>;
  close(): Promise<void>;
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);

export async function startHarness(distDir = path.resolve(__dirname, '../../dist'), opts: { hosted?: boolean } = {}): Promise<Harness> {
  /** FLOW_HOSTED=1(시험이 직접 정하려면 opts.hosted)이면 호스팅이 보내야 할 보안 머리말(docs/hosting.md)을 붙여 연다. 머리말이 막은 것은 닫을 때 한꺼번에 알려 시험을 실패시킨다(8-5) */
  const hosted = opts.hosted ?? process.env.FLOW_HOSTED === '1';
  const blocked: string[] = [];
  /** gzip으로 보내는 서버의 압축 결과. 한 번 압축해 두고 쓴다(큰 자바스크립트를 요청마다 다시 압축하면 시험이 느려진다) */
  const zipped = new Map<string, Buffer>();
  const handler =
    (compress: boolean): http.RequestListener =>
    (req, res) => {
      const u = new URL(req.url ?? '/', 'http://localhost');
      let p = path.join(distDir, decodeURIComponent(u.pathname));
      if (!p.startsWith(distDir)) {
        res.writeHead(403).end();
        return;
      }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) {
        res.writeHead(404).end('not found');
        return;
      }
      const type = MIME[path.extname(p)] ?? 'application/octet-stream';
      if (compress && COMPRESSIBLE.has(path.extname(p))) {
        let body = zipped.get(p);
        if (!body) {
          body = gzipSync(fs.readFileSync(p), { level: 9 });
          zipped.set(p, body);
        }
        res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', 'content-length': body.length, vary: 'Accept-Encoding', ...(hosted ? SECURITY_HEADERS : {}) });
        res.end(body);
        return;
      }
      res.writeHead(200, { 'content-type': type, ...(hosted ? SECURITY_HEADERS : {}) });
      fs.createReadStream(p).pipe(res);
    };
  const server = http.createServer(handler(false));
  const zipServer = http.createServer(handler(true));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => zipServer.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const zipPort = (zipServer.address() as AddressInfo).port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    zipUrl: `http://127.0.0.1:${zipPort}/`,
    browser,
    newContext: async (opts) => {
      const ctx = await browser.newContext({ viewport: opts?.viewport ?? { width: 1280, height: 800 }, hasTouch: opts?.hasTouch ?? false, locale: 'ko-KR', reducedMotion: opts?.reducedMotion ?? 'no-preference' });
      if (hosted) ctx.on('page', (page) => page.on('console', (m) => void (/Content Security Policy|Refused to /.test(m.text()) && blocked.push(m.text().slice(0, 240)))));
      return ctx;
    },
    close: async () => {
      await browser.close();
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise<void>((r) => zipServer.close(() => r()));
      if (blocked.length > 0) throw new Error(`보안 머리말이 막은 것 ${blocked.length}건: ${[...new Set(blocked)].slice(0, 5).join(' | ')}`);
    },
  };
}

/** 콘솔 오류와 페이지 오류를 모은다. 흐름 테스트는 끝에서 비어 있는지 확인한다. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  return errors;
}

/**
 * 앱이 첫 화면을 그릴 때까지 기다린다. 앱은 저장을 읽은 뒤에 그리므로(10.6) 페이지가 불러와진 직후에는 아직 비어 있을 수 있다.
 * 무언가가 '없다'고 확인하는 시험은 먼저 이것을 기다려야 한다(그렇지 않으면 아직 안 그려서 없는 것을 '없다'로 본다).
 */
export const appDrawn = (page: Page) => page.waitForSelector('#ui-root > *', { state: 'attached', timeout: 30000 });

/**
 * 첫 안내 카드가 떠 있으면 '시작'을 눌러 닫는다. 떠 있지 않으면 아무 일도 하지 않는다. 월드는 카드가 닫혀야 움직인다.
 * `tap`이 참이면 마우스가 아니라 손가락으로 누른다(터치만으로 하는 시험, 맥락에 hasTouch가 있어야 한다)
 */
export async function skipIntro(page: Page, opts: { tap?: boolean } = {}): Promise<void> {
  await appDrawn(page);
  const start = page.locator('[data-intro] button', { hasText: '시작' }).first();
  if ((await page.locator('[data-intro]').count()) === 0) return;
  if (opts.tap) await start.tap();
  else await start.click();
  await page.waitForSelector('[data-intro]', { state: 'detached' });
}
