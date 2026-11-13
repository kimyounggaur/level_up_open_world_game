// 4-8 흐름 시험(실제 Chrome): 관찰용 행동 기록(설계서 13.2, 10.9). 실제 월드에서 걷고 열고 눌러서 사건을 쌓고,
// 설정의 '기록 내보내기'로 받은 파일을 읽어 13.2의 사건이 나오는지, 개인 정보가 없는지, 새로 고쳐도 남는지, 서버로 나가는 요청이 없는지 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다. 진짜 IndexedDB를 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import installation from '../../content/installations/inst.village.scale-stones.json';
import type { LogEvent, UsageLogData } from '../../src/domain/usagelog';
import { pos, teleport, waitChunks, waitNear, waitReady } from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';

let h: Harness;
let tmp: string;
beforeAll(async () => {
  h = await startHarness();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-usage-'));
});
afterAll(async () => {
  await h?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const Q01_HASH = '#/q/pitch.same-note-two-clefs/middle-c';
const Q02_HASH = '#/q/rhythm.rest-in-a-bar/quarter-rest';
const Q01 = 'pitch.same-note-two-clefs';
const Q02 = 'rhythm.rest-in-a-bar';
const USAGE_KEY = 'levelup-music-world:v1:usage-log';
const INST_ID = installation.installationId;
const STONES = installation.slots;

interface Booted {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
  /** 이 쪽이 보낸 요청들(주소와 방식). 서버로 나가는 것이 없는지 본다 */
  requests: Array<{ method: string; url: string }>;
}

/** 새 브라우저 맥락(= 새 저장소)에서 연다. 첫 안내 카드는 닫는다 */
async function boot(opts: { hash?: string; skip?: boolean } = {}): Promise<Booted> {
  const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const requests: Booted['requests'] = [];
  page.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.goto(h.url + (opts.hash ?? ''));
  if (opts.skip !== false) await skipIntro(page);
  return { ctx, page, errors, requests };
}

const setHash = (p: Page, hash: string): Promise<void> => p.evaluate((x) => void (location.hash = x), hash);
const waitHash = (p: Page, hash: string): Promise<unknown> => p.waitForFunction((want) => location.hash === want, hash, { timeout: 30000 });

/**
 * 작업대(H1·H2)는 과제가 둘씩이라 월드에서 E로 열면 과제 패널이 아니라 정거장 안내창이 먼저 뜬다(5단계). 안내창에서 그 과제의 '열기'를 눌러 연다.
 * 사용 기록은 안내창을 거쳐도 정거장에 들어온 길(걷기, 지도)을 그 과제가 이어받는다고 적는다(D-52)
 */
async function openFromGuide(p: Page, stationId: string, questId: string, hash: string): Promise<void> {
  await waitHash(p, `#/s/${stationId}`);
  await p.locator(`.station-quest[data-quest="${questId}"] a.btn`).click();
  await waitHash(p, hash);
}

const idbRead = (p: Page, key: string): Promise<string | null> =>
  p.evaluate(
    (k) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('levelup-music-world', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('save')) {
            db.close();
            resolve(null);
            return;
          }
          const req = db.transaction('save', 'readonly').objectStore('save').get(k);
          req.onsuccess = () => {
            db.close();
            resolve(typeof req.result === 'string' ? req.result : null);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
      }),
    key,
  );

/** 저장소의 사용 기록이 조건에 맞을 때까지 기다린다(사건은 잠깐 모았다가 한꺼번에 적힌다) */
async function waitStored(p: Page, ok: (d: UsageLogData) => boolean, timeout = 30000): Promise<UsageLogData> {
  const start = Date.now();
  for (;;) {
    const text = await idbRead(p, USAGE_KEY);
    if (text) {
      const d = JSON.parse(text) as UsageLogData;
      if (ok(d)) return d;
    }
    if (Date.now() - start > timeout) throw new Error(`저장소의 사용 기록에 기대한 내용이 나타나지 않았어요. 지금: ${text?.slice(0, 400) ?? '(없음)'}`);
    await p.waitForTimeout(150);
  }
}

interface ExportedLog {
  format: string;
  formatVersion: number;
  projectId: string;
  exportedAt: string;
  note: string;
  dropped: number;
  summary: { events: number; sessions: number; byType: Record<string, number>; questEntriesByRoute: Record<string, number>; walkShare: number | null };
  events: LogEvent[];
}

/** 설정의 '사용 기록' 구역. 같은 화면에 '저장' 구역도 있어서 같은 모양의 글자 영역(.save-note 등)은 구역 안에서 찾는다 */
const usageSection = (p: Page) => p.locator('section[aria-labelledby="set-usage"]');

/** 설정을 열고 '기록 내보내기'를 눌러 받은 파일을 읽는다 */
async function exportFromSettings(p: Page, name: string): Promise<{ file: string; text: string; doc: ExportedLog }> {
  await setHash(p, '#/settings');
  await p.waitForSelector('#set-usage');
  const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: '기록 내보내기' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^levelup-music-world-usage-log-\d{4}-\d{2}-\d{2}\.json$/);
  const file = path.join(tmp, `${name}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  expect(await usageSection(p).locator('.save-note').innerText()).toContain('파일로 내보냈어요');
  const text = fs.readFileSync(file, 'utf-8');
  return { file, text, doc: JSON.parse(text) as ExportedLog };
}

const ofType = <T extends LogEvent['type']>(doc: ExportedLog, type: T): Array<Extract<LogEvent, { type: T }>> => doc.events.filter((e): e is Extract<LogEvent, { type: T }> => e.type === type);
const usageStatus = (p: Page): Promise<string> => p.locator('[data-testid="usage-status"]').innerText();

const material = (page: Page, label: string) => page.locator('button.material', { hasText: label });
const cellButton = (page: Page, index: number) => page.locator('button.cell-mine').nth(index);

describe('4-8 한쪽: 정거장과 도전에 들어간 길(걷기, 지도, 목록, 주소)', () => {
  it('걸어가 E로 연 것, 목록과 지도에서 시작한 것, 지도로 바로 이동해 연 것, 주소로 연 것이 길마다 다르게 파일에 나온다', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);

    // 걷기: H2 앞에 서서 E
    expect(await teleport(page, 'H2')).toBe(true);
    await waitNear(page, 'H2', 20000);
    await page.keyboard.press('KeyE');
    await openFromGuide(page, 'H2', Q02, Q02_HASH);
    await page.waitForSelector('button.cell-mine');

    // 목록: 목록에서 '열기'
    await setHash(page, '#/list');
    await page.locator(`.quest-card[data-quest="${Q01}"] .variant-row[data-variant="middle-c"] a.btn`).click();
    await waitHash(page, Q01_HASH);
    await page.waitForSelector('.panel-shell h1');

    // 지도: 정거장을 고르고 시작 링크
    await setHash(page, '#/map');
    await page.waitForSelector('.map-marker');
    await page.locator('[data-station="H2"]').click();
    await page.locator(`.map-quest[data-quest="${Q02}"] a.btn`).click();
    await waitHash(page, Q02_HASH);
    await page.waitForSelector('button.cell-mine');

    // 지도의 '바로 이동'으로 H1 앞에 서서 E
    await setHash(page, '#/map');
    await page.waitForSelector('.map-marker');
    await page.locator('[data-station="H1"]').click();
    await page.locator('[data-action="teleport"]').click();
    await waitHash(page, '#/');
    await waitNear(page, 'H1', 30000);
    await page.keyboard.press('KeyE');
    await openFromGuide(page, 'H1', Q01, Q01_HASH);
    await page.waitForSelector('.panel-shell h1');

    // 사건이 저장소까지 갔는지 기다린 뒤, 화면을 완전히 새로 열어 주소로 연다
    await waitStored(page, (d) => d.events.filter((e) => e.type === 'quest-enter').length >= 4);
    await page.goto('about:blank');
    await page.goto(h.url + Q02_HASH);
    await appDrawn(page);
    await page.waitForSelector('button.cell-mine');

    const { doc } = await exportFromSettings(page, 'routes');
    expect(doc.format).toBe('levelup-music-world.usage-log');
    expect(doc.formatVersion).toBe(1);
    expect(doc.projectId).toBe('levelup-music-world');

    // 첫 실행(sid 1): 시작은 월드, 그 뒤 정거장과 도전에 들어간 길
    const first = doc.events.filter((e) => e.sid === 1);
    expect(first[0]).toMatchObject({ type: 'session-start', screen: 'world' });
    const stations = first.filter((e): e is Extract<LogEvent, { type: 'station-enter' }> => e.type === 'station-enter').map((e) => [e.stationId, e.route]);
    expect(stations).toEqual([
      ['H2', 'walk'],
      ['H1', 'map'],
    ]);
    const quests = first.filter((e): e is Extract<LogEvent, { type: 'quest-enter' }> => e.type === 'quest-enter').map((e) => [e.questId, e.route, e.surface]);
    expect(quests).toEqual([
      [Q02, 'walk', 'panel'], // 걸어가서 E
      [Q01, 'list', 'panel'], // 목록
      [Q02, 'map', 'panel'], // 지도의 시작 링크
      [Q01, 'map', 'panel'], // 지도로 바로 이동한 뒤 E
    ]);
    // 어느 정거장에서 시작한 과제인지가 붙는다
    expect(ofType(doc, 'quest-enter')[0]).toMatchObject({ stationId: 'H2' });
    expect(ofType(doc, 'quest-enter')[2]).toMatchObject({ stationId: 'H2' });

    // 둘째 실행(sid 2): 주소로 연 과제
    const second = doc.events.filter((e) => e.sid === 2);
    expect(second.map((e) => e.type)).toEqual(['session-start', 'quest-enter']);
    expect(second[0]).toMatchObject({ screen: 'quest' });
    expect(second[1]).toMatchObject({ type: 'quest-enter', questId: Q02, variantId: 'quarter-rest', route: 'address', surface: 'panel' });

    // 번호는 처음부터 끝까지 1씩 늘고, 요약이 파일의 사건과 맞는다
    expect(doc.events.map((e) => e.seq)).toEqual(doc.events.map((_, i) => i + 1));
    expect(doc.summary.sessions).toBe(2);
    expect(doc.summary.events).toBe(doc.events.length);
    expect(doc.summary.questEntriesByRoute).toMatchObject({ walk: 1, map: 2, list: 1, address: 1 });
    expect(doc.summary.walkShare).toBeCloseTo(1 / 5, 5);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-8 다른쪽: 도움, 놓은 것을 고친 것, 다시 들은 것, 확인, 돌 밟기', () => {
  it('Q02에서 도움을 켜고 놓고 듣고 확인하고, 모드 밖에서 돌을 밟으면 파일에 나온다. 개인 정보나 놓은 음의 내용은 없다', async () => {
    const { ctx, page, errors } = await boot({ hash: Q02_HASH });
    await page.waitForSelector('button.cell-mine');

    // 도움 열기: 느리게 듣기
    await page.locator('#aid-slow').click();
    // 놓은 것 고치기: C4를 첫 칸에, D4를 둘째 칸에
    await material(page, 'C4').click();
    await cellButton(page, 0).click();
    await material(page, 'D4').click();
    await cellButton(page, 1).click();
    expect(await cellButton(page, 0).innerText()).toContain('C4');
    // 다시 듣기: 내 배치와 목표
    await page.getByRole('button', { name: '내 배치 듣기' }).click();
    await page.getByRole('button', { name: '목표 듣기' }).click();
    await page.getByRole('button', { name: '정지' }).click();
    // 확인
    await page.getByRole('button', { name: '배치 확인' }).click();
    await page.waitForSelector('.feedback:not([data-feedback="none"])', { timeout: 15000 });

    // 월드로 나가 모드 밖에서 돌을 밟고 지나간다(밟은 두 돌까지)
    await setHash(page, '#/');
    await waitReady(page);
    await waitChunks(page);
    expect(await teleport(page, 'H4')).toBe(true);
    await waitNear(page, 'H4', 20000);
    const second = STONES[1]!;
    const goalX = second.x + second.w + 20;
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction((gx) => (window as unknown as { __game: { world: { bridge: { position: { get(): { x: number } } } } } }).__game.world.bridge.position.get().x >= gx, goalX, { timeout: 90000 });
    await page.keyboard.up('ArrowRight');
    expect((await pos(page)).x).toBeGreaterThanOrEqual(goalX);

    const { doc, text } = await exportFromSettings(page, 'actions');
    const kinds = new Set(doc.events.map((e) => e.type));
    for (const t of ['session-start', 'quest-enter', 'help-open', 'placement-edit', 'listen', 'check', 'stone-step']) expect(kinds.has(t as LogEvent['type']), t).toBe(true);

    expect(ofType(doc, 'help-open')).toMatchObject([{ kind: 'aid', what: 'slow', questId: Q02, variantId: 'quarter-rest' }]);
    // 놓은 것을 고친 것: 두 번(음을 놓을 때 나는 한 음 미리 듣기는 '다시 듣기'가 아니다)
    expect(ofType(doc, 'placement-edit')).toMatchObject([
      { questId: Q02, variantId: 'quarter-rest', surface: 'panel' },
      { questId: Q02, variantId: 'quarter-rest', surface: 'panel' },
    ]);
    expect(ofType(doc, 'listen').map((e) => [e.what, e.surface, e.questId])).toEqual([
      ['mine', 'panel', Q02],
      ['target', 'panel', Q02],
    ]);
    const checks = ofType(doc, 'check');
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ questId: Q02, variantId: 'quarter-rest', assistUsed: true });
    expect(['passed', 'needsRevision', 'unscored', 'technicalError']).toContain(checks[0]!.result);
    // 돌 밟기: 설치물 모드 밖에서 1번 돌부터 차례로 밟았다(두 번째 돌을 지나 설 때 돌이 붙어 있어 다음 돌에 닿을 수도 있다)
    const steps = ofType(doc, 'stone-step');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.every((e) => e.installationId === INST_ID)).toBe(true);
    expect(steps.map((e) => e.slot)).toEqual(steps.map((_, i) => i + 1));
    // 지금 도전을 연 길은 주소(시작할 때 주소로 열었다)이고, 월드로 나가 정거장을 연 적은 없다
    expect(ofType(doc, 'quest-enter')).toMatchObject([{ route: 'address' }]);
    expect(ofType(doc, 'station-enter')).toHaveLength(0);

    // 개인 정보와 놓은 음의 내용이 없다: 사건의 키는 허용된 것뿐이고, 음 이름이 없다
    const allowed = new Set(['seq', 'sid', 'at', 'type', 'screen', 'stationId', 'route', 'questId', 'variantId', 'surface', 'kind', 'what', 'free', 'result', 'assistUsed', 'installationId', 'slot', 'discoveryId']);
    for (const e of doc.events) for (const k of Object.keys(e)) expect(allowed.has(k), `${e.type}.${k}`).toBe(true);
    expect(JSON.stringify(doc.events)).not.toMatch(/[A-G][#b♯♭]?[0-9]/);
    expect(text).not.toMatch(/@|https?:|[0-9]{6}-[0-9]{7}/); // 이메일, 주소, 주민등록번호 모양
    expect(doc.note).toContain('이름, 연락처, 생년월일, 녹음, 놓은 음의 내용은 들어 있지 않아요');
    // 한 줄에 사건 하나: 사람이 편집기에서도 읽을 수 있다
    const lines = text.split('\n');
    const from = lines.findIndex((l) => l.startsWith('  "events": ['));
    const body = lines.slice(from + 1, lines.findIndex((l, i) => i > from && l === '  ]'));
    expect(body.map((l) => JSON.parse(l.trim().replace(/,$/, '')) as LogEvent)).toEqual(doc.events);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-8 남기기, 끄기, 지우기, 정적 파일만', () => {
  it('새로 고쳐도 남고 번호가 이어진다. 끄면 쌓지 않고(새로 고쳐도 꺼져 있다), 지우면 비우되 진행은 그대로다. 서버로 나가는 요청이 없다', async () => {
    const { ctx, page, errors, requests } = await boot();
    await waitReady(page);
    await waitChunks(page);
    await setHash(page, '#/list');
    await page.locator(`.quest-card[data-quest="${Q02}"] .variant-row[data-variant="quarter-rest"] a.btn`).click();
    await waitHash(page, Q02_HASH);
    await page.waitForSelector('button.cell-mine');
    await material(page, 'C4').click();
    await cellButton(page, 0).click(); // 놓은 것은 진행(저장)에도 남는다
    const before = await waitStored(page, (d) => d.events.some((e) => e.type === 'placement-edit'));
    const beforeCount = before.events.length;
    expect(before.enabled).toBe(true);
    expect(before.lastSid).toBe(1);

    // 새로 고침: 앞의 기록이 그대로 있고 둘째 실행이 이어진다
    await page.reload();
    await appDrawn(page);
    await setHash(page, '#/settings');
    await page.waitForSelector('#set-usage');
    await page.waitForFunction((n) => /기록 \d+건/.test(document.querySelector('[data-testid="usage-status"]')?.textContent ?? '') && Number(/기록 (\d+)건/.exec(document.querySelector('[data-testid="usage-status"]')!.textContent!)![1]) > n, beforeCount);
    const resumed = await waitStored(page, (d) => d.lastSid === 2);
    expect(resumed.events.slice(0, beforeCount)).toEqual(before.events); // 앞의 사건은 그대로
    expect(resumed.events[beforeCount]).toMatchObject({ type: 'session-start', sid: 2, seq: before.nextSeq });
    expect(resumed.nextSeq).toBe(resumed.events.at(-1)!.seq + 1);
    expect(await usageStatus(page)).toMatch(/^기록 \d+건이 쌓여 있어요\.$/);

    // 끄기: 새 사건이 쌓이지 않는다. 쌓인 것은 그대로다
    await page.locator('#set-usage-on').click();
    await page.waitForSelector('#set-usage-on[aria-checked="false"]');
    const off = await waitStored(page, (d) => !d.enabled);
    await setHash(page, '#/list');
    await page.locator(`.quest-card[data-quest="${Q01}"] .variant-row[data-variant="middle-c"] a.btn`).click();
    await waitHash(page, Q01_HASH);
    await page.waitForTimeout(2200); // 기록이 적히는 시간(1.5초)보다 길게 기다려도 늘지 않는다
    const stillOff = JSON.parse((await idbRead(page, USAGE_KEY))!) as UsageLogData;
    expect(stillOff.events).toEqual(off.events);

    // 새로 고쳐도 꺼져 있다
    await page.reload();
    await appDrawn(page);
    await setHash(page, '#/settings');
    await page.waitForSelector('#set-usage-on');
    expect(await page.locator('#set-usage-on').getAttribute('aria-checked')).toBe('false');
    expect(await usageStatus(page)).toContain('지금은 더 쌓지 않아요');
    await page.waitForTimeout(300);
    const afterReload = JSON.parse((await idbRead(page, USAGE_KEY))!) as UsageLogData;
    expect(afterReload.events).toEqual(off.events);
    expect(afterReload.enabled).toBe(false);

    // 켜고 지운다: 한 번 더 묻고, 진행(저장)은 그대로다
    await page.locator('#set-usage-on').click();
    await page.waitForSelector('#set-usage-on[aria-checked="true"]');
    await page.getByRole('button', { name: '기록 지우기' }).click();
    await usageSection(page).locator('.save-confirm').waitFor();
    expect(await usageSection(page).locator('.save-confirm').innerText()).toContain('쌓인 기록을 모두 지울까요?');
    await page.getByRole('button', { name: '모두 지우기' }).click();
    await usageSection(page).locator('.save-note[data-kind="ok"]').filter({ hasText: '기록을 모두 지웠어요' }).waitFor();
    expect(await usageStatus(page)).toBe('아직 쌓인 기록이 없어요.');
    expect(await page.getByRole('button', { name: '기록 내보내기' }).isDisabled()).toBe(true);
    const cleared = await waitStored(page, (d) => d.events.length === 0 && d.enabled);
    expect(cleared.lastSid).toBe(3); // 번호는 이어진다: 꺼 둔 채 연 셋째 실행도 번호를 썼고, 지워도 되돌아가지 않는다
    const save = await idbRead(page, 'levelup-music-world:v1:save:current');
    expect(save).not.toBeNull();
    expect(JSON.parse(save!).challengeDrafts[`${Q02}/quarter-rest`]).toBeTruthy(); // 진행은 그대로

    // 서버가 없다: 이 쪽이 낸 모든 요청은 같은 곳(정적 파일)으로 가는 읽기뿐이다
    const origin = new URL(h.url).origin;
    const external = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:') && !r.url.startsWith('about:'));
    expect(external).toEqual([]);
    expect(requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
