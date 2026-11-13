// 8-2 흐름 시험(실제 Chrome): 개인정보 흐름(설계서 10.9, D-6, docs/privacy-flow.md).
// 세계를 열고, 지도·목록·과제를 지나, 설정에서 글자 크기를 바꾸고, 고지 원문을 열고, 저장과 사용 기록을 내보내는 한 번의 사용을 하면서
//   나간 요청이 모두 같은 주소의 읽기뿐인지, 쿠키·서비스 워커·웹소켓·캐시가 없는지, 저장소에 남은 키가 정해진 이름뿐인지,
//   내려받은 두 파일에 정해진 필드만 있는지를 본다. 단위 시험(tests/unit/privacy.test.ts)이 코드를 읽어 보증하는 것을 실제 브라우저에서 다시 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다. 진짜 IndexedDB를 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOG_EVENT_TYPES } from '../../src/domain/usagelog';
import type { LogEventType } from '../../src/domain/usagelog';
import { COMMON_FIELDS, EVENT_FIELDS, ID_VALUE, SAVE_EXPLORATION_FIELDS, SAVE_PREFERENCES_FIELDS, SAVE_SETTINGS_FIELDS, SAVE_TOP_FIELDS, STORAGE_KEY_SUFFIXES, TOP_FIELDS } from '../privacy-fields';
import { waitReady } from './game';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';

const PREFIX = 'levelup-music-world:v1:';
const Q02_HASH = '#/q/rhythm.rest-in-a-bar/quarter-rest';

let h: Harness;
let tmp: string;

interface Seen {
  origin: string;
  requests: Array<{ method: string; url: string; resourceType: string }>;
  websockets: number;
  serviceWorkers: number;
  errors: string[];
  cookies: unknown[];
  documentCookie: string;
  localStorageLength: number;
  sessionStorageLength: number;
  cacheNames: string[];
  idb: { dbs: string[]; stores: string[]; keys: string[] };
  saveFile: { name: string; doc: Record<string, unknown> };
  logFile: { name: string; text: string; doc: { events: Array<Record<string, unknown>> } & Record<string, unknown> };
  noticesText: string;
  noticesFocusable: boolean;
  requestsAfterOffline: number;
  settingsAfter: { textSize: string };
  /** 페이지가 숨겨진 뒤 localStorage에 남은 키(응급 사본)와 그 내용 */
  localKeysAfterHide: string[];
  emergencyText: string | null;
}
let seen: Seen;

const setHash = (p: Page, hash: string): Promise<void> => p.evaluate((x) => void (location.hash = x), hash);
const waitHash = (p: Page, hash: string): Promise<unknown> => p.waitForFunction((want) => location.hash === want, hash, { timeout: 30000 });

/** 저장소에 남은 모든 데이터베이스와 저장 칸과 키 */
const readIdb = (p: Page): Promise<Seen['idb']> =>
  p.evaluate(async () => {
    const dbs = (await indexedDB.databases()).map((d) => d.name ?? '');
    const out = { dbs, stores: [] as string[], keys: [] as string[] };
    for (const name of dbs) {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const names = Array.from(db.objectStoreNames);
          out.stores.push(...names.map((s) => `${name}/${s}`));
          let pending = names.length;
          if (pending === 0) {
            db.close();
            resolve();
            return;
          }
          for (const s of names) {
            const req = db.transaction(s, 'readonly').objectStore(s).getAllKeys();
            req.onsuccess = () => {
              out.keys.push(...req.result.map(String));
              if (--pending === 0) {
                db.close();
                resolve();
              }
            };
            req.onerror = () => reject(req.error);
          }
        };
      });
    }
    return out;
  });

async function download(page: Page, label: string, name: string): Promise<{ name: string; text: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
  const file = path.join(tmp, `${name}-${d.suggestedFilename()}`);
  await d.saveAs(file);
  return { name: d.suggestedFilename(), text: fs.readFileSync(file, 'utf-8') };
}

beforeAll(async () => {
  h = await startHarness();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-privacy-'));
  const ctx: BrowserContext = await h.newContext({ viewport: { width: 1280, height: 720 } });
  const requests: Seen['requests'] = [];
  let websockets = 0;
  let serviceWorkers = 0;
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url(), resourceType: r.resourceType() }));
  ctx.on('serviceworker', () => (serviceWorkers += 1));
  const page = await ctx.newPage();
  page.on('websocket', () => (websockets += 1));
  const errors = collectErrors(page);

  await page.goto(h.url);
  await skipIntro(page);
  await waitReady(page);

  // 지도, 목록, 과제를 지난다(사용 기록에 쌓인다)
  await setHash(page, '#/map');
  await page.waitForSelector('.map-marker');
  await setHash(page, '#/list');
  await page.waitForSelector('.quest-card');
  await setHash(page, Q02_HASH);
  await waitHash(page, Q02_HASH);
  await page.waitForTimeout(800);

  // 설정: 글자 크기를 바꾼다(저장에 들어간다)
  await setHash(page, '#/settings');
  await page.waitForSelector('#set-usage');
  await page.locator('button[data-text-size="large"]').click();
  await page.waitForTimeout(500);

  // 고지 원문: 연결을 끊은 채로 연다(원문은 앱 안에 들어 있어서 네트워크가 필요 없다)
  const before = requests.length;
  await ctx.setOffline(true);
  await page.locator('section[aria-labelledby="set-about"] summary').click();
  const pre = page.locator('[data-testid="notices-text"]');
  await pre.waitFor({ state: 'visible' });
  const noticesText = (await pre.textContent()) ?? '';
  await pre.focus();
  const noticesFocusable = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'notices-text');
  const requestsAfterOffline = requests.length - before;
  await ctx.setOffline(false);

  // 사용자가 눌러서 나가는 것: 저장 내보내기와 기록 내보내기
  const saveDl = await download(page, '저장 내보내기', 'save');
  const logDl = await download(page, '기록 내보내기', 'log');

  seen = {
    origin: new URL(h.url).origin,
    requests,
    websockets,
    serviceWorkers: serviceWorkers + ctx.serviceWorkers().length,
    errors,
    cookies: await ctx.cookies(),
    documentCookie: await page.evaluate(() => document.cookie),
    localStorageLength: await page.evaluate(() => localStorage.length),
    sessionStorageLength: await page.evaluate(() => sessionStorage.length),
    cacheNames: await page.evaluate(() => caches.keys()),
    idb: await readIdb(page),
    saveFile: { name: saveDl.name, doc: JSON.parse(saveDl.text) as Record<string, unknown> },
    logFile: { name: logDl.name, text: logDl.text, doc: JSON.parse(logDl.text) as Seen['logFile']['doc'] },
    noticesText,
    noticesFocusable,
    requestsAfterOffline,
    settingsAfter: { textSize: await page.evaluate(() => document.documentElement.dataset['textSize'] ?? '') },
    localKeysAfterHide: [],
    emergencyText: null,
  };
  // 페이지가 숨겨지는 순간(닫기, 앱 전환)에 아직 저장하지 못한 바뀐 것이 있으면, 기다릴 수 없어서 localStorage에 응급 사본을 적는다.
  // 바꾼 직후 바로 숨겨서(저장이 끝나기 전에) 그때 무엇이 남는지 본다
  await page.evaluate(() => {
    (document.querySelector('button[data-text-size="normal"]') as HTMLElement).click();
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.waitForTimeout(300);
  seen.localKeysAfterHide = await page.evaluate(() => Object.keys(localStorage));
  seen.emergencyText = await page.evaluate((k) => localStorage.getItem(k), `${PREFIX}save:emergency`);
  await ctx.close();
});

afterAll(async () => {
  await h?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('8-2 개인정보 흐름: 받는 곳과 보내는 곳이 없다', () => {
  it('나간 요청이 모두 같은 주소의 읽기(GET)이고, 글꼴 파일을 받지 않는다', () => {
    expect(seen.requests.length).toBeGreaterThan(10);
    const outside = seen.requests.filter((r) => !/^(?:data|blob):/.test(r.url) && new URL(r.url).origin !== seen.origin);
    expect(outside).toEqual([]);
    expect([...new Set(seen.requests.map((r) => r.method))]).toEqual(['GET']);
    expect(seen.requests.filter((r) => /\.(?:woff2?|ttf|otf)(?:\?|$)/i.test(r.url) || r.resourceType === 'font')).toEqual([]);
    // 월드 그림 파일은 같은 주소의 world/ 아래에서 읽었다
    expect(seen.requests.some((r) => /\/world\//.test(r.url))).toBe(true);
  });

  it('웹소켓, 서비스 워커, 쿠키, 캐시 저장소가 없다', () => {
    expect(seen.websockets).toBe(0);
    expect(seen.serviceWorkers).toBe(0);
    expect(seen.cookies).toEqual([]);
    expect(seen.documentCookie).toBe('');
    expect(seen.cacheNames).toEqual([]);
  });

  it('고지 원문은 연결이 끊겨도 열리고(요청 0개), 오픈소스와 악보 글꼴의 라이선스가 들어 있고, 키보드로 넘겨 볼 수 있다', () => {
    expect(seen.requestsAfterOffline).toBe(0);
    expect(seen.noticesText).toContain('Bravura');
    expect(seen.noticesText).toContain('MIT License');
    expect(seen.noticesText.length).toBeGreaterThan(10000);
    expect(seen.noticesFocusable).toBe(true);
  });

  it('화면에 오류가 없었다', () => {
    expect(seen.errors).toEqual([]);
  });
});

describe('8-2 개인정보 흐름: 저장하는 곳은 이 기기의 IndexedDB 하나이고 키 이름이 정해져 있다', () => {
  it('데이터베이스는 levelup-music-world 하나, 저장 칸은 save 하나, localStorage와 sessionStorage는 비어 있다', () => {
    expect(seen.idb.dbs).toEqual(['levelup-music-world']);
    expect(seen.idb.stores).toEqual(['levelup-music-world/save']);
    expect(seen.localStorageLength).toBe(0);
    expect(seen.sessionStorageLength).toBe(0);
  });

  it('남은 키는 모두 프로젝트 id와 저장 형식 판이 앞에 붙은 정해진 이름이고, 저장과 사용 기록이 있다', () => {
    expect(seen.idb.keys.length).toBeGreaterThanOrEqual(2);
    for (const k of seen.idb.keys) {
      expect(k.startsWith(PREFIX), k).toBe(true);
      expect(STORAGE_KEY_SUFFIXES, k).toContain(k.slice(PREFIX.length));
    }
    expect(seen.idb.keys).toContain(`${PREFIX}save:current`);
    expect(seen.idb.keys).toContain(`${PREFIX}usage-log`);
  });
});

describe('8-2 개인정보 흐름: 응급 사본', () => {
  it('세션 중에는 localStorage가 비어 있고, 저장이 끝나기 전에 페이지가 숨겨질 때만 응급 사본 하나가 적히며 저장 파일과 같은 필드다', () => {
    expect(seen.localStorageLength).toBe(0);
    expect(seen.localKeysAfterHide).toEqual([`${PREFIX}save:emergency`]);
    const doc = JSON.parse(seen.emergencyText ?? 'null') as Record<string, unknown> & { explorationState: { settings: Record<string, unknown> } };
    expect(Object.keys(doc).sort()).toEqual([...SAVE_TOP_FIELDS]);
    expect(doc.explorationState.settings['textSize']).toBe('normal'); // 저장이 끝나기 전에 바꾼 것이 응급 사본에 있다
  });
});

describe('8-2 개인정보 흐름: 사용자가 눌러서 나가는 파일은 두 개이고 정해진 필드만 있다', () => {
  it('저장 파일: 맨 위, 탐험 상태, 설정, 선호의 필드가 정해진 것과 같고, 바꾼 설정이 들어 있다', () => {
    expect(seen.saveFile.name).toMatch(/^levelup-music-world-save-\d{4}-\d{2}-\d{2}\.json$/);
    const doc = seen.saveFile.doc as Record<string, unknown> & { explorationState: Record<string, unknown> & { settings: Record<string, unknown> }; preferences: Record<string, unknown> };
    expect(Object.keys(doc).sort()).toEqual([...SAVE_TOP_FIELDS]);
    expect(Object.keys(doc.explorationState).sort()).toEqual([...SAVE_EXPLORATION_FIELDS]);
    expect(Object.keys(doc.explorationState.settings).sort()).toEqual([...SAVE_SETTINGS_FIELDS]);
    expect(Object.keys(doc.preferences).sort()).toEqual([...SAVE_PREFERENCES_FIELDS]);
    expect(doc['projectId']).toBe('levelup-music-world');
    expect(doc.explorationState.settings['textSize']).toBe('large');
    expect(seen.settingsAfter.textSize).toBe('large');
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // 메일 주소 모양
    expect(text).not.toMatch(/https?:\/\//);
  });

  it('사용 기록 파일: 맨 위 필드와 사건 필드가 정해진 표 안에 있고, 값은 이름(id)·고르는 값·숫자뿐이다', () => {
    expect(seen.logFile.name).toMatch(/^levelup-music-world-usage-log-\d{4}-\d{2}-\d{2}\.json$/);
    const doc = seen.logFile.doc;
    expect(Object.keys(doc).sort()).toEqual([...TOP_FIELDS]);
    expect(doc.events.length).toBeGreaterThanOrEqual(2); // 시작과 주소로 연 과제(지도와 목록을 지나간 것은 사건이 아니다)
    const types = new Set<string>(doc.events.map((e) => String(e['type'])));
    expect(types.has('session-start')).toBe(true);
    expect(types.has('quest-enter')).toBe(true);
    for (const e of doc.events) {
      const type = e['type'] as LogEventType;
      expect(LOG_EVENT_TYPES).toContain(type);
      for (const [k, v] of Object.entries(e)) {
        expect([...EVENT_FIELDS[type], ...COMMON_FIELDS], `${type}.${k}`).toContain(k);
        if (k === 'at') expect(Number.isNaN(Date.parse(String(v)))).toBe(false);
        else if (typeof v === 'string') expect(v, `${type}.${k}`).toMatch(ID_VALUE);
        else expect(['number', 'boolean'], `${type}.${k}`).toContain(typeof v);
      }
    }
    // 머리말은 받지 않는 것을 말한다
    expect(String(doc['note'])).toContain('이름, 연락처, 생년월일, 녹음');
  });
});
