// 8-5 공개 점검(13.3 G2)의 실제 Chrome 쪽. 정식 공개(release) 채널로 지은 빌드를 호스팅과 같은 머리말(tests/flow/hosting.ts, docs/hosting.md)로 열어
//  1) 공개 점검 도구(npm run check:release)와 실제 화면이 같은 수를 세는지(G2의 1과 7),
//  2) 검수 전 콘텐츠가 목록, 주소, 정거장 안내, 수첩의 발견 쪽, 개발용 화면 어디로도 열리지 않는지(G2의 7)와, 발견 요소를 공개했을 때 점검 도구가 세는 막다른 길 끝(3.4의 규칙 2)이 화면과 맞는지,
//  3) 압축, 캐시, 보안 머리말이 호스팅이 보내야 할 값으로 응답에 실려 오는지(두 번째 방문은 시간을 재야 해서 revisit.flow.ts가 따로 본다),
//  4) 내용 보안 정책이 열어 둔 네 가지가 정말 필요한지(하나씩 빼서 막히는지 본다)를 확인한다.
// 문서(docs/hosting.md)에 적힌 값이 시험 서버의 값과 같은지는 브라우저가 필요 없어서 단위 시험 hosting-doc.test.ts가 본다.
// 이 시험이 통과해도 G2가 통과한 것이 아니다. 사람이 해야 하는 일은 src/domain/release.ts의 HUMAN_RELEASE_STEPS에 있다(D-9, D-13).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContentCatalog } from '../../src/domain/catalog';
import { HUMAN_RELEASE_STEPS, evaluateReleaseGate } from '../../src/domain/release';
import { releaseFactsOf } from '../../tools/release-facts';
import { QUEST_IDS } from './content';
import { collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { CACHE_ASSETS, CACHE_REVALIDATE, CSP, SECURITY_HEADERS, startHostedServer, type HostedServer } from './hosting';

const ROOT = path.resolve(__dirname, '../..');

interface QuestFile {
  questId: string;
  variants: Record<string, unknown>;
}
const QUESTS: QuestFile[] = QUEST_IDS.map((id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/quests', `${id}.json`), 'utf-8')) as QuestFile);
const VARIANT_COUNT = QUESTS.reduce((n, q) => n + Object.keys(q.variants).length, 0);
/** 과제가 놓인 정거장(지역 파일이 정한다) */
const STATIONS: Array<{ stationId: string; questIds: string[] }> = fs
  .readdirSync(path.join(ROOT, 'content/regions'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => (JSON.parse(fs.readFileSync(path.join(ROOT, 'content/regions', f), 'utf-8')) as { stations: Array<{ stationId: string; questIds?: string[] }> }).stations)
  .map((s) => ({ stationId: s.stationId, questIds: s.questIds ?? [] }))
  .filter((s) => s.questIds.length > 0);

/** 일부를 공개 상태로 바꾼 사본: 과제 하나는 판본 모두, 다른 과제는 판본 여섯 가운데 둘만(판본에 따로 적는 공개 상태) */
const OPEN_QUEST = 'chord.major-triad';
const PARTIAL_QUEST = 'chord.inversion';
const PARTIAL_OPEN = ['c-first', 'c-second'];
/** 사본에서 공개 상태로 바꾸는 발견 요소 하나: 지금 비어 있는 막다른 길 끝 하나에서 가장 가까운 것(공개하면 그 끝이 채워진다). 비어 있는 끝이 없으면 null */
const OPEN_DISCOVERY = releaseFactsOf(ROOT).bareDeadEnds.find((b) => b.nearestId !== null) ?? null;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'levelup-release-'));
const R0 = path.join(TMP, 'r0');
const R1_ROOT = path.join(TMP, 'repo1');
const R1 = path.join(TMP, 'r1');

function viteBuildRelease(cwd: string, outDir: string): void {
  const r = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { cwd, encoding: 'utf-8', env: { ...process.env, VITE_RELEASE_CHANNEL: 'release' }, timeout: 170_000 });
  if (r.status !== 0) throw new Error(`공개 빌드가 실패했어요(${cwd}): ${String(r.stderr || r.stdout).slice(-600)}`);
}

/** 저장소의 사본(소스, 콘텐츠, 월드 파일)을 만들고 일부 과제를 공개 상태로 바꾼다. 원본은 건드리지 않는다 */
function makePublishedCopy(dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const d of ['src', 'content', 'public']) fs.cpSync(path.join(ROOT, d), path.join(dest, d), { recursive: true });
  for (const f of ['index.html', 'vite.config.ts', 'tsconfig.json', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(dest, f));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dest, 'node_modules'), 'dir');
  const edit = (id: string, change: (d: Record<string, any>) => void): void => {
    const p = path.join(dest, 'content/quests', `${id}.json`);
    const d = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, any>;
    change(d);
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  };
  edit(OPEN_QUEST, (d) => {
    d['availability'] = 'published';
  });
  edit(PARTIAL_QUEST, (d) => {
    for (const v of PARTIAL_OPEN) d['variants'][v]['availability'] = 'published';
  });
  if (OPEN_DISCOVERY) {
    const p = path.join(dest, 'content/discoveries', `${OPEN_DISCOVERY.regionId}.json`);
    const d = JSON.parse(fs.readFileSync(p, 'utf-8')) as { items: Array<Record<string, unknown>> };
    const item = d.items.find((i) => i['discoveryId'] === OPEN_DISCOVERY.nearestId);
    if (!item) throw new Error(`사본에서 발견 요소를 찾지 못했어요: ${OPEN_DISCOVERY.regionId} ${OPEN_DISCOVERY.nearestId}`);
    item['availability'] = 'published';
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  }
}

/** 보안 정책 위반(브라우저가 막은 것)을 페이지가 스스로 모으게 한다 */
async function logViolations(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __csp: Array<{ dir: string; blocked: string }> };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push({ dir: e.effectiveDirective, blocked: String(e.blockedURI) }));
  });
}
const violations = (page: Page): Promise<Array<{ dir: string; blocked: string }>> => page.evaluate(() => (window as unknown as { __csp: Array<{ dir: string; blocked: string }> }).__csp);

let h: Harness;
let r0: HostedServer;
let r1: HostedServer;

beforeAll(async () => {
  viteBuildRelease(ROOT, R0);
  makePublishedCopy(R1_ROOT);
  viteBuildRelease(R1_ROOT, R1);
  h = await startHarness();
  r0 = await startHostedServer(R0);
  r1 = await startHostedServer(R1);
}, 400_000);

afterAll(async () => {
  await r0?.close();
  await r1?.close();
  try {
    await h?.close();
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}, 60_000);

describe('공개 점검 도구(기계가 볼 수 있는 조건)', () => {
  const gate = evaluateReleaseGate(releaseFactsOf(ROOT));

  it('check:release의 종료 코드는 점검 결과와 같고, 막는 것과 사람이 해야 하는 일을 모두 내보낸다', () => {
    const r = spawnSync('npm', ['run', '--silent', 'check:release'], { cwd: ROOT, encoding: 'utf-8' });
    const text = `${r.stdout}\n${r.stderr}`;
    expect(r.status === 0).toBe(gate.ok);
    for (const b of gate.blockers) expect(text).toContain(b);
    for (const s of HUMAN_RELEASE_STEPS) expect(text).toContain(s);
  }, 90_000);

  it('점검이 막으면 build:release는 공개 빌드를 만들지 않는다', () => {
    if (gate.ok) return; // 막는 것이 없는 날에는 이 시험이 볼 것이 없다(check:release의 종료 코드를 위에서 본다)
    const dir = path.join(ROOT, 'dist-release');
    const stamp = (): string => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).sort().join('|') : '(없음)');
    const before = stamp();
    const r = spawnSync('npm', ['run', '--silent', 'build:release'], { cwd: ROOT, encoding: 'utf-8' });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toContain('공개 빌드를 멈췄어요');
    expect(stamp()).toBe(before);
  }, 120_000);
});

describe('지금 내용 그대로의 공개 빌드(공개 채널에서 열리는 과제가 없다)', () => {
  it('열어서 마을이 그려지고, 오류와 보안 정책 위반이 없고, 요청은 모두 같은 주소이고, 점검용 연결이 없다', async () => {
    const ctx = await h.newContext();
    await logViolations(ctx);
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(r0.url);
    await skipIntro(page);
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1);
    await expect.poll(() => r0.served.filter((s) => s.path.startsWith('/world/ground-')).length, { timeout: 60_000 }).toBeGreaterThan(3);
    // 소리를 켠다: 시계 작업자(blob)가 만들어지는 때다
    await page.getByRole('button', { name: /소리 켜기/ }).first().click();
    await page.waitForSelector('[data-sound-state="on"], [data-sound-state="failed"]', { state: 'attached', timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => typeof (window as unknown as { __game?: unknown }).__game)).toBe('undefined');
    const outside = requests.filter((u) => !u.startsWith(r0.url) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(outside, '같은 주소가 아닌 곳으로 간 요청').toEqual([]);
    await ctx.close();
  }, 120_000);

  it('호스팅이 보내야 할 머리말: 보안 머리말은 모든 응답에, 글 파일은 gzip, 캐시 값은 경로에 따라 다르다', async () => {
    const from = r0.served.length;
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    const heads: Array<{ url: string; status: number; headers: Record<string, string> }> = [];
    page.on('response', (r) => heads.push({ url: r.url(), status: r.status(), headers: r.headers() }));
    await page.goto(r0.url);
    await skipIntro(page);
    // 이 시험이 연 브라우저가 바닥 조각을 4개 받을 때까지 기다린다. 서버가 처음부터 낸 응답 전체(r0.served)를 세면 앞 시험이 받은 조각이 이미 4개를 넘어서 기다림이 없다.
    // 그러면 느린 때(전체 흐름 시험의 최종 점검)에는 응답이 4개일 때 아래 8개 검사를 해서 거짓으로 실패했다(앞 시험의 열린 브라우저가 남아 다음 시험도 시간 초과로 이어졌다)
    await expect.poll(() => r0.served.slice(from).filter((s) => s.path.startsWith('/world/ground-')).length, { timeout: 60_000 }).toBeGreaterThan(3);
    // 서버가 낸 응답을 브라우저의 응답 사건이 모두 따라잡을 때까지 기다린다(사건은 조금 늦게 온다. 첫 실행은 사건이 8개일 때 세어서 '10개 초과'에 걸렸다. 서버가 낸 것도 그때 8개였다: 바닥 조각이 4개 오른 시점이다)
    await expect.poll(() => heads.filter((x) => x.url.startsWith(r0.url)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(r0.served.length - from);
    const mine = heads.filter((x) => x.url.startsWith(r0.url));
    expect(mine.length, '브라우저가 본 응답: index.html 1개, assets 3개 이상, 바닥 조각 4개 이상').toBeGreaterThanOrEqual(8);
    for (const x of mine) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(x.headers[k], `${x.url}의 ${k}`).toBe(v);
    }
    const served = r0.served.slice(from);
    expect(served.some((s) => s.path === '/index.html')).toBe(true);
    for (const s of served) {
      if (s.status !== 200) continue;
      const compressible = /\.(html|js|css|json|svg|txt)$/.test(s.path);
      expect(s.encoding, `${s.path}의 content-encoding`).toBe(compressible ? 'gzip' : null);
      expect(s.cacheControl, `${s.path}의 cache-control`).toBe(s.path.startsWith('/assets/') ? CACHE_ASSETS : CACHE_REVALIDATE);
    }
    const assets = served.filter((s) => s.path.startsWith('/assets/'));
    expect(assets.length).toBeGreaterThanOrEqual(3);
    await ctx.close();
  }, 120_000);

  it('전체 도전: 카드와 판본이 모두 준비 중이고 열기 단추가 하나도 없고, 미리보기에만 있는 안내와 개발용 연결이 없다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r0.url + '#/list');
    await page.waitForSelector('main h1');
    expect(await page.locator('.quest-card').count()).toBe(QUESTS.length);
    expect(await page.locator('.variant-row').count()).toBe(VARIANT_COUNT);
    expect(await page.locator('.variant-preparing').count()).toBe(VARIANT_COUNT);
    expect(await page.locator('.quest-card a.btn-primary').count()).toBe(0);
    expect(await page.locator('.quest-card .chip-state.is-preparing').count()).toBe(QUESTS.length);
    expect(await page.locator('.review-note').count()).toBe(0);
    expect(await page.locator('a[href="#/dev/sound-check"]').count()).toBe(0);
    await ctx.close();
  }, 60_000);

  it('수첩의 발견 쪽: 공개 상태가 아닌 발견 요소는 빈칸으로도 보이지 않고 비어 있다고 알린다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r0.url + '#/notebook');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^발견$/ }).click();
    await page.waitForSelector('[data-overlay="notebook"] [data-empty]');
    expect(await page.locator('[data-overlay="notebook"] .nb-slot, [data-overlay="notebook"] .nb-found, [data-overlay="notebook"] [data-group]').count()).toBe(0);
    await ctx.close();
  }, 60_000);

  it('주소로 어떤 과제와 판본을 열어도 준비 중 안내만 뜨고 과제 패널은 열리지 않는다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r0.url + '#/list');
    await page.waitForSelector('main h1');
    for (const q of QUESTS) {
      for (const hash of [ContentCatalog.hashFor(q.questId), ...Object.keys(q.variants).map((v) => ContentCatalog.hashFor(q.questId, v))]) {
        await page.evaluate((x) => {
          location.hash = x;
        }, hash);
        await page.waitForSelector('.list-shell .problem');
        expect(await page.locator('.list-shell .problem').first().textContent(), hash).toContain('준비 중');
        expect(await page.locator('.panel-shell').count(), hash).toBe(0);
      }
    }
    await ctx.close();
  }, 120_000);

  it('모든 정거장 안내에서 과제가 준비 중으로만 보이고 고를 수 없다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r0.url);
    await skipIntro(page);
    for (const s of STATIONS) {
      await page.evaluate((id) => {
        location.hash = `#/s/${id}`;
      }, s.stationId);
      const sheet = page.locator(`[data-overlay="station-${s.stationId}"]`);
      await sheet.waitFor({ timeout: 10_000 });
      expect(await sheet.locator('.station-quest').count(), s.stationId).toBe(s.questIds.length);
      expect(await sheet.locator('.station-quest.is-preparing').count(), s.stationId).toBe(s.questIds.length);
      expect(await sheet.locator('a.btn-primary').count(), s.stationId).toBe(0);
    }
    await ctx.close();
  }, 120_000);

  it('개발용 화면의 주소는 열리지 않는다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r0.url + '#/dev/sound-check');
    await page.waitForSelector('.list-shell .problem');
    expect(await page.locator('.list-shell .problem').first().textContent()).toContain('개발용 화면은 열 수 없어요');
    await ctx.close();
  }, 60_000);

  it('고지 파일을 받을 수 있다', async () => {
    const res = await fetch(r0.url + 'THIRD-PARTY-NOTICES.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('cache-control')).toBe(CACHE_REVALIDATE);
    expect((await res.text()).length).toBeGreaterThan(1000);
  });
});

describe('일부를 공개 상태로 바꾼 사본의 공개 빌드(공개 점검 도구가 센 수와 화면의 수가 같다)', () => {
  const factsOf = () => releaseFactsOf(R1_ROOT); // 사본은 beforeAll에서 만들어지므로 시험 안에서 읽는다

  it('점검 도구는 과제 2개와 판본 5개가 열린다고 세고, 공개했다고 내용 잠금이 어긋나지 않고, 막는 것은 소리 대장 하나와 아직 비어 있는 막다른 길 끝뿐이다', () => {
    const facts = factsOf();
    expect(facts.openQuests).toBe(2);
    expect(facts.openVariants).toBe(3 + PARTIAL_OPEN.length);
    expect(facts.lockProblems).toEqual([]);
    const g = evaluateReleaseGate(facts);
    expect(g.ok).toBe(false);
    expect(g.blockers.filter((b) => b.includes('snd.music.world-parts'))).toHaveLength(1);
    expect(g.blockers.filter((b) => b.startsWith('막다른 길 끝'))).toHaveLength(facts.bareDeadEnds.length);
    expect(g.blockers).toHaveLength(1 + facts.bareDeadEnds.length); // 과제와 내용 잠금은 막지 않는다
    if (OPEN_DISCOVERY) {
      // 공개한 발견 요소 하나가 가까운 끝을 채운다(비어 있던 끝의 수가 줄고, 막는 목록에서 그 끝이 사라진다)
      expect(facts.bareDeadEnds.length).toBeLessThan(releaseFactsOf(ROOT).bareDeadEnds.length);
      expect(g.blockers.some((b) => b.includes(`${OPEN_DISCOVERY.regionId} (${OPEN_DISCOVERY.x}, ${OPEN_DISCOVERY.y})`))).toBe(false);
    }
  });

  it('수첩의 발견 쪽: 공개한 발견 요소만 빈칸으로 보이고, 점검 도구가 센 것과 같다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r1.url + '#/notebook');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^발견$/ }).click();
    await page.waitForSelector('[data-overlay="notebook"] h2:has-text("발견")');
    expect(await page.locator('[data-overlay="notebook"] .nb-slot').count()).toBe(OPEN_DISCOVERY ? 1 : 0);
    expect(await page.locator('[data-overlay="notebook"] [data-empty]').count()).toBe(OPEN_DISCOVERY ? 0 : 1);
    expect(await page.locator('[data-overlay="notebook"] .nb-found').count()).toBe(0); // 아직 찾지 않았다
    await ctx.close();
  }, 60_000);

  it('전체 도전의 열기 단추는 점검 도구가 센 판본과 같고, 같은 과제 안에서도 공개하지 않은 판본은 준비 중이다', async () => {
    const facts = factsOf();
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r1.url + '#/list');
    await page.waitForSelector('main h1');
    expect(await page.locator('.quest-card a.btn-primary').count()).toBe(facts.openVariants);
    expect(await page.locator('.quest-card .variant-preparing').count()).toBe(VARIANT_COUNT - facts.openVariants);
    const open = async (q: string): Promise<string[]> => page.locator(`.quest-card[data-quest="${q}"] .variant-row`).evaluateAll((rows) => rows.filter((r) => r.querySelector('a.btn-primary')).map((r) => r.getAttribute('data-variant') ?? ''));
    expect((await open(OPEN_QUEST)).sort()).toEqual(Object.keys(QUESTS.find((q) => q.questId === OPEN_QUEST)!.variants).sort());
    expect((await open(PARTIAL_QUEST)).sort()).toEqual([...PARTIAL_OPEN].sort());
    for (const q of QUESTS) if (q.questId !== OPEN_QUEST && q.questId !== PARTIAL_QUEST) expect(await open(q.questId), q.questId).toEqual([]);
    await ctx.close();
  }, 60_000);

  it('새 저장에서 공개한 판본은 모두 주소로 열려 패널이 뜨고(검수 전 표지 없이), 공개하지 않은 판본은 열리지 않는다', async () => {
    const facts = factsOf();
    const opened: string[] = [];
    for (const [q, vs] of [
      [OPEN_QUEST, Object.keys(QUESTS.find((x) => x.questId === OPEN_QUEST)!.variants)],
      [PARTIAL_QUEST, PARTIAL_OPEN],
    ] as const) {
      for (const v of vs) {
        const ctx = await h.newContext(); // 새 저장
        const page = await ctx.newPage();
        const errors = collectErrors(page);
        await page.goto(r1.url + ContentCatalog.hashFor(q, v));
        await page.waitForSelector('.panel-shell .panel-main', { timeout: 30_000 });
        expect(await page.locator('.review-note').count(), `${q}/${v}`).toBe(0);
        expect(errors, `${q}/${v}`).toEqual([]);
        opened.push(`${q}/${v}`);
        await ctx.close();
      }
    }
    expect(opened).toHaveLength(facts.openVariants);
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r1.url + '#/list');
    await page.waitForSelector('main h1');
    for (const v of Object.keys(QUESTS.find((x) => x.questId === PARTIAL_QUEST)!.variants).filter((x) => !PARTIAL_OPEN.includes(x))) {
      await page.evaluate((x) => {
        location.hash = x;
      }, ContentCatalog.hashFor(PARTIAL_QUEST, v));
      await page.waitForSelector('.list-shell .problem');
      expect(await page.locator('.list-shell .problem').first().textContent(), v).toContain('준비 중');
      expect(await page.locator('.panel-shell').count(), v).toBe(0);
    }
    await ctx.close();
  }, 240_000);

  it('정거장 안내: 공개한 과제가 있는 정거장은 열기를 주고, 나머지 정거장은 모두 준비 중이다', async () => {
    const ctx = await h.newContext();
    const page = await ctx.newPage();
    await page.goto(r1.url);
    await skipIntro(page);
    for (const s of STATIONS) {
      const expectOpen = s.questIds.filter((q) => q === OPEN_QUEST || q === PARTIAL_QUEST).length;
      await page.evaluate((id) => {
        location.hash = `#/s/${id}`;
      }, s.stationId);
      if (expectOpen === 1 && s.questIds.length === 1) continue; // 열 수 있는 과제가 하나뿐인 정거장은 안내 없이 바로 패널이 열린다(StationSheet 머리말)
      const sheet = page.locator(`[data-overlay="station-${s.stationId}"]`);
      await sheet.waitFor({ timeout: 10_000 });
      expect(await sheet.locator('.station-quest:not(.is-preparing)').count(), s.stationId).toBe(expectOpen);
      expect(await sheet.locator('.station-quest.is-preparing').count(), s.stationId).toBe(s.questIds.length - expectOpen);
    }
    await ctx.close();
  }, 120_000);
});

describe('내용 보안 정책: 열어 둔 네 가지는 하나씩 빼면 실제로 막힌다(대조)', () => {
  const CASES: Array<{ name: string; from: string; to: string; dir: string; blocked: string }> = [
    { name: 'img-src data:', from: "img-src 'self' data: blob:", to: "img-src 'self' blob:", dir: 'img-src', blocked: 'data' },
    { name: 'img-src blob:', from: "img-src 'self' data: blob:", to: "img-src 'self' data:", dir: 'img-src', blocked: 'blob' },
    { name: 'font-src data:', from: "font-src 'self' data:", to: "font-src 'self'", dir: 'font-src', blocked: 'data' },
    { name: 'worker-src blob:', from: "worker-src 'self' blob:", to: "worker-src 'self'", dir: 'worker-src', blocked: 'blob' },
  ];

  it.each(CASES)('$name을 빼면 브라우저가 그 종류를 막는다', async ({ from, to, dir, blocked }) => {
    expect(CSP).toContain(from);
    const server = await startHostedServer(R0, { headers: { 'content-security-policy': CSP.replace(from, to) } });
    const ctx = await h.browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' }); // 막히는 것을 보려는 것이라 harness의 위반 모으기(FLOW_HOSTED)를 거치지 않는다
    try {
      await logViolations(ctx);
      const page = await ctx.newPage();
      await page.goto(server.url);
      await skipIntro(page);
      await page.getByRole('button', { name: /소리 켜기/ }).first().click();
      await page.waitForFunction(([d, b]) => (window as unknown as { __csp: Array<{ dir: string; blocked: string }> }).__csp.some((v) => v.dir === d && v.blocked === b), [dir, blocked] as const, { timeout: 30_000 });
      expect((await violations(page)).some((v) => v.dir === dir && v.blocked === blocked)).toBe(true);
    } finally {
      await ctx.close();
      await server.close();
    }
  }, 120_000);

  it('네 가지를 모두 연 정책(docs/hosting.md의 값)에서는 같은 사용에 위반이 없다', async () => {
    const ctx = await h.newContext();
    await logViolations(ctx);
    const page = await ctx.newPage();
    await page.goto(r0.url);
    await skipIntro(page);
    await page.getByRole('button', { name: /소리 켜기/ }).first().click();
    await page.waitForSelector('[data-sound-state="on"], [data-sound-state="failed"]', { state: 'attached', timeout: 20_000 });
    await page.waitForTimeout(2000);
    expect(await violations(page)).toEqual([]);
    await ctx.close();
  }, 60_000);
});

describe('FLOW_HOSTED 하니스: 정책이 막은 요청을 정말 잡는다(대조)', () => {
  it('막힌 것이 없으면 조용히 닫히고, 정책이 막는 요청이 하나라도 있으면 닫을 때 시험을 실패시킨다', async () => {
    const quiet = await startHarness(undefined, { hosted: true });
    const qctx = await quiet.newContext();
    const qpage = await qctx.newPage();
    await qpage.goto(quiet.url);
    await skipIntro(qpage);
    await qctx.close();
    await quiet.close(); // 던지지 않는다

    const loud = await startHarness(undefined, { hosted: true });
    const lctx = await loud.newContext();
    const lpage = await lctx.newPage();
    await lpage.goto(loud.url);
    await skipIntro(lpage);
    // connect-src 'self'가 다른 주소로 가는 요청을 막는다(앱은 이런 요청을 하지 않는다. 하니스가 막힌 것을 잡는지 보려고 일으킨다)
    await lpage.evaluate(() => fetch('http://127.0.0.1:9/막힘').then(() => undefined, () => undefined));
    await lpage.waitForTimeout(300);
    await lctx.close();
    await expect(loud.close()).rejects.toThrow(/보안 머리말이 막은 것 [1-9]/);
  }, 90_000);
});
