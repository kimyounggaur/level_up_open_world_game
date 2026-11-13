// 5-9 성능 점검(실제 Chrome): 설계서 10.7의 성능 목표 가운데 헤드리스 Chrome으로 잴 수 있는 것을 잰다.
//   내려받는 양(첫 화면까지, dist 전체) · 메모리(바닥 조각 12장 이하) · 프레임 · 판정은 프레임이 떨어져도 같은 결과
// 목표값은 기준 기기를 정한 뒤 다시 재서 조정한다(10.7). 여기서 잰 값은 기준 기기의 값이 아니다:
//   화면 그리기는 소프트웨어(SwiftShader)로 이 컨테이너의 CPU에서 돈다. 프레임 값은 이 환경에서의 값일 뿐이고,
//   기준 태블릿의 30fps와 PC의 60fps는 실제 기기에서 사람이 잰다(docs/approvals.md의 사람 확인 대기).
// 8-4가 더한 것: 그림 메모리 합계(사물 그림판과 글자 그림까지), 정거장마다 프레임 하나의 스크립트 시간, 불러오기 시간(서버 압축과 회선·CPU 제한), 마디 예약기의 건너뜀(D-251).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Page } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHUNK_PAD, CHUNK_SIZE } from '../../src/domain/world';
import { ENSEMBLE_COMBOS } from '@/domain/ensemblecheck';
import { dbg, teleport, waitChunks, waitReady } from './game';
import { appDrawn, collectErrors, skipIntro, startHarness, type Harness } from './harness';
import { completeQ01, completeQ02 } from './panelTools';
import { boot as bootWith, standQuiet, turnSoundOn } from './soundTools';
import { seedSave } from './villageTools';

let h: Harness;
beforeAll(async () => {
  // PERF_DIST로 다른 dist 폴더를 열 수 있다(고치기 전의 빌드와 견줄 때 쓴다). 없으면 이 저장소의 dist다
  h = await startHarness(process.env['PERF_DIST']);
});
afterAll(async () => {
  await h?.close();
});

const LONG = 300_000;
const MB = 1024 * 1024;
const DIST = path.resolve(__dirname, '../../dist');

/** 10.7의 목표값 */
const FIRST_SCREEN_MAX = 5 * MB; // A는 첫 화면까지 5MB 이하
const TOTAL_MAX = 25 * MB; // B는 전체 25MB 이하
const CHUNKS_MAX = 12; // 바닥 조각 12장 이하(약 50MB)

const STATIONS = ['H1', 'H2', 'H3', 'H4', 'H5', 'N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'E4', 'W1', 'W2', 'W3', 'W4', 'K1', 'K2', 'K3', 'K4', 'S1', 'S2', 'S3'];
const TEXT_TYPE = /text|javascript|json|svg|xml/;
const fmt = (n: number): string => `${n.toLocaleString('en-US')} 바이트(${(n / MB).toFixed(2)} MiB)`;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 내려받는 양

describe('10.7 내려받는 양: A는 첫 화면까지 5MB 이하, B는 전체 25MB 이하', () => {
  it('처음 열어 마을이 그려질 때까지 내려받은 것과 dist 전체가 목표 안이다', async () => {
    const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    const got: Array<{ url: string; bytes: number; type: string }> = [];
    const pending: Array<Promise<void>> = [];
    page.on('response', (r) => {
      if (r.url().startsWith('blob:')) return; // 바닥 조각을 내려받은 뒤 그림으로 푸는 길의 사본이다. 네트워크가 아니다
      pending.push(
        r
          .body()
          .then((b) => {
            got.push({ url: r.url().replace(h.url, '/'), bytes: b.length, type: r.headers()['content-type'] ?? '' });
          })
          .catch(() => undefined),
      );
    });
    await page.goto(h.url);
    await appDrawn(page);
    await waitReady(page);
    await waitChunks(page);
    await Promise.all(pending);
    const raw = got.reduce((s, x) => s + x.bytes, 0);
    // 이 시험의 서버는 압축하지 않는다. 배포하는 정적 서버가 글 파일을 gzip으로 보낼 때의 크기를 같이 적는다
    let compressed = 0;
    for (const x of got) {
      if (TEXT_TYPE.test(x.type)) {
        const file = path.join(DIST, decodeURIComponent(new URL(x.url, 'http://x/').pathname));
        compressed += fs.existsSync(file) && fs.statSync(file).isFile() ? gzipSync(fs.readFileSync(file), { level: 9 }).length : x.bytes;
      } else compressed += x.bytes;
    }
    const files = listFiles(DIST);
    const total = files.reduce((s, f) => s + fs.statSync(f).size, 0);
    const top = [...got].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    console.log(
      [
        `[내려받는 양] 첫 화면까지 요청 ${got.length}개, ${fmt(raw)} (글 파일을 gzip하면 약 ${fmt(compressed)})`,
        `  큰 것: ${top.map((x) => `${x.url} ${x.bytes.toLocaleString('en-US')}`).join(', ')}`,
        `  dist 전체: 파일 ${files.length}개, ${fmt(total)} (목표: 첫 화면 ${fmt(FIRST_SCREEN_MAX)} 이하, 전체 ${fmt(TOTAL_MAX)} 이하)`,
      ].join('\n'),
    );
    expect(got.length, '요청').toBeGreaterThan(3);
    expect(raw, '첫 화면까지 내려받은 양').toBeLessThanOrEqual(FIRST_SCREEN_MAX);
    expect(total, 'dist 전체').toBeLessThanOrEqual(TOTAL_MAX);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('바닥 조각 한 장의 그림 크기와, 가득 올라왔을 때(12장)의 그림 메모리 계산이 약 50MB 안이다', async () => {
    const files = listFiles(path.join(DIST, 'world')).filter((f) => /ground-\d+-\d+\.webp$/.test(f));
    expect(files.length, '바닥 조각 파일').toBe(48);
    const side = CHUNK_SIZE + 2 * CHUNK_PAD; // 1024 + 둘레 2 px 여백(이음매 번짐을 막는다, tools/build-world.ts)
    const sizes = new Set<string>();
    for (const f of files) {
      const m = await sharp(f).metadata();
      sizes.add(`${m.width}×${m.height}`);
    }
    expect([...sizes], '바닥 조각의 그림 크기').toEqual([`${side}×${side}`]);
    const one = side * side * 4;
    console.log(`[메모리] 바닥 조각 한 장 = ${side}×${side}×4 = ${fmt(one)}, ${CHUNKS_MAX}장 = ${fmt(one * CHUNKS_MAX)} (설계서의 '약 50MB'와 맞는 계산값이다. 실제 기기의 그림 메모리는 사람이 잰다)`);
    expect(one * CHUNKS_MAX).toBeLessThanOrEqual(50 * MB);
  });
});

// ---------------------------------------------------------------------------
// 메모리: 바닥 조각은 어디서든 12장 이하

interface ChunkSample {
  max: number;
  min: number;
  frames: number;
  pendingMax: number;
}
const chunkStart = (): void => {
  const w = window as unknown as { __game: { world: { debugState(): { chunks: string[]; pending: string[] } | null } }; __chunkSample?: { max: number; min: number; frames: number; pendingMax: number; raf: number } };
  const s = { max: 0, min: 999, frames: 0, pendingMax: 0, raf: 0 };
  w.__chunkSample = s;
  const tick = (): void => {
    const d = w.__game.world.debugState();
    if (d) {
      s.frames++;
      s.max = Math.max(s.max, d.chunks.length);
      s.min = Math.min(s.min, d.chunks.length);
      s.pendingMax = Math.max(s.pendingMax, d.pending.length);
    }
    s.raf = requestAnimationFrame(tick);
  };
  s.raf = requestAnimationFrame(tick);
};
const chunkStop = (): ChunkSample => {
  const s = (window as unknown as { __chunkSample: { max: number; min: number; frames: number; pendingMax: number; raf: number } }).__chunkSample;
  cancelAnimationFrame(s.raf);
  return { max: s.max, min: s.min, frames: s.frames, pendingMax: s.pendingMax };
};

describe('10.7 메모리: 바닥 조각은 화면 크기가 달라도, 월드 어디서든, 걷는 동안에도 12장 이하다', () => {
  const SCREENS: Array<[string, number, number, boolean]> = [
    ['PC 1600×1000', 1600, 1000, false],
    ['태블릿 1280×800', 1280, 800, true],
    ['휴대폰 세로 430×932', 430, 932, true],
  ];
  for (const [name, w, hgt, touch] of SCREENS) {
    it(`${name}: 정거장 23곳(여섯 지역)을 바로 이동으로 돌고 걸어도 올라온 조각이 ${CHUNKS_MAX}장 이하다`, async () => {
      const ctx = await h.newContext({ viewport: { width: w, height: hgt }, hasTouch: touch });
      const page = await ctx.newPage();
      const errors = collectErrors(page);
      await page.goto(h.url);
      await skipIntro(page, { tap: touch });
      await waitReady(page);
      await waitChunks(page);
      await page.evaluate(chunkStart);
      const seen: number[] = [];
      for (const id of STATIONS) {
        expect(await teleport(page, id), `${id}로 이동`).toBe(true);
        await page.waitForFunction(() => {
          const d = (window as unknown as { __game: { world: { debugState(): { pending: string[] } | null } } }).__game.world.debugState();
          return !!d && d.pending.length === 0;
        });
        seen.push((await dbg(page)).chunks.length);
      }
      // 큰길을 따라 걷는다: 걷는 동안에도 한 번에 올라온 조각이 12장을 넘지 않는다
      await teleport(page, 'H1');
      await waitChunks(page);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(2500);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(2500);
      await page.keyboard.up('ArrowDown');
      const s = await page.evaluate(chunkStop);
      console.log(`[바닥 조각 ${name}] 정거장마다 올라온 조각 ${Math.min(...seen)}~${Math.max(...seen)}장, 프레임마다 읽은 값 ${s.min}~${s.max}장(프레임 ${s.frames}개), 한꺼번에 기다리던 조각 최대 ${s.pendingMax}장`);
      expect(s.frames, '읽은 프레임').toBeGreaterThan(20);
      expect(s.max, '한 번에 올라온 조각의 최대').toBeLessThanOrEqual(CHUNKS_MAX);
      expect(Math.max(...seen), '정거장 앞에서 올라온 조각의 최대').toBeLessThanOrEqual(CHUNKS_MAX);
      expect(Math.min(...seen), '정거장 앞에서 올라온 조각의 최소').toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
      await ctx.close();
    }, LONG);
  }
});

// ---------------------------------------------------------------------------
// 프레임

interface FrameStats {
  frames: number;
  fps: number;
  medianMs: number;
  p95Ms: number;
  worstMs: number;
}
const frameStart = (): void => {
  const w = window as unknown as { __frames?: { t: number[]; raf: number } };
  const s = { t: [] as number[], raf: 0 };
  w.__frames = s;
  const tick = (now: number): void => {
    s.t.push(now);
    s.raf = requestAnimationFrame(tick);
  };
  s.raf = requestAnimationFrame(tick);
};
const frameStop = (): number[] => {
  const s = (window as unknown as { __frames: { t: number[]; raf: number } }).__frames;
  cancelAnimationFrame(s.raf);
  return s.t;
};
const statsOf = (t: number[]): FrameStats => {
  const gaps = t.slice(1).map((x, i) => x - t[i]!);
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const span = (t[t.length - 1] ?? 0) - (t[0] ?? 0);
  return { frames: t.length, fps: span > 0 ? (gaps.length * 1000) / span : 0, medianMs: at(0.5), p95Ms: at(0.95), worstMs: sorted[sorted.length - 1] ?? 0 };
};
const showStats = (s: FrameStats): string => `프레임 ${s.frames}개, ${s.fps.toFixed(1)} fps, 간격 가운데 ${s.medianMs.toFixed(1)} ms, 95% ${s.p95Ms.toFixed(1)} ms, 가장 긴 ${s.worstMs.toFixed(1)} ms`;

interface Busy {
  /** 메인 스레드가 일한 비율(작업 전체, 스크립트, 배치·스타일 계산) */
  taskPct: number;
  scriptPct: number;
  layoutPct: number;
}
type Cdp = { send(method: 'Performance.getMetrics'): Promise<{ metrics: Array<{ name: string; value: number }> }> };
const metricsOf = async (cdp: Cdp): Promise<Record<string, number>> => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const busyBetween = (a: Record<string, number>, b: Record<string, number>): Busy => {
  const wall = (b['Timestamp'] ?? 0) - (a['Timestamp'] ?? 0);
  const pct = (k: string): number => (wall > 0 ? (100 * ((b[k] ?? 0) - (a[k] ?? 0))) / wall : 0);
  return { taskPct: pct('TaskDuration'), scriptPct: pct('ScriptDuration'), layoutPct: pct('LayoutDuration') + pct('RecalcStyleDuration') };
};

describe('10.7 프레임: 이 환경(소프트웨어 그리기)에서 서 있을 때와 걸을 때를 잰다. 기준 기기의 값이 아니다', () => {
  it('마을에서 3초 서 있을 때와 3초 걸을 때의 프레임 간격과 메인 스레드가 일한 비율을 적는다. 멈추지 않고 돈다', async () => {
    const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(h.url);
    await skipIntro(page);
    await waitReady(page);
    await waitChunks(page);
    const env = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { renderer: gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '알 수 없음', cores: navigator.hardwareConcurrency };
    });
    await page.waitForTimeout(500);
    await page.evaluate(frameStart);
    const m0 = await metricsOf(cdp);
    await page.waitForTimeout(3000);
    const m1 = await metricsOf(cdp);
    const idle = statsOf(await page.evaluate(frameStop));
    await page.evaluate(frameStart);
    await page.keyboard.down('ArrowRight');
    const m2 = await metricsOf(cdp);
    await page.waitForTimeout(3000);
    const m3 = await metricsOf(cdp);
    await page.keyboard.up('ArrowRight');
    const walk = statsOf(await page.evaluate(frameStop));
    const busyIdle = busyBetween(m0, m1);
    const busyWalk = busyBetween(m2, m3);
    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    const pctText = (b: Busy, frames: number, a: Record<string, number>, z: Record<string, number>): string =>
      `메인 스레드 일한 비율 ${b.taskPct.toFixed(0)}%(스크립트 ${b.scriptPct.toFixed(0)}%, 배치·스타일 ${b.layoutPct.toFixed(0)}%), 프레임 하나에 스크립트 ${((1000 * ((z['ScriptDuration'] ?? 0) - (a['ScriptDuration'] ?? 0))) / frames).toFixed(1)} ms`;
    console.log(
      [
        `[프레임] 환경: 그리기 ${env.renderer}, CPU 코어 ${env.cores}개 (실제 기기가 아니다)`,
        `  서 있을 때: ${showStats(idle)}, ${pctText(busyIdle, idle.frames, m0, m1)}`,
        `  걸을 때: ${showStats(walk)}, ${pctText(busyWalk, walk.frames, m2, m3)}`,
        `  자바스크립트 힙 ${fmt(heap)} (Chrome만 알려 주는 값, 대략)`,
      ].join('\n'),
    );
    // 멈추지 않고 도는지만 본다. 30fps나 60fps를 기준으로 삼지 않는다(기준 기기에서 사람이 잰다)
    expect(idle.frames, '서 있는 3초 동안의 프레임').toBeGreaterThan(15);
    expect(walk.frames, '걷는 3초 동안의 프레임').toBeGreaterThan(15);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);

  it('화면 그림 수가 줄면 프레임이 늘어난다: 그리는 비용이 점의 수에 따라 가는지(소프트웨어 그리기가 한계인지) 본다', async () => {
    const rows: Array<{ name: string; w: number; h: number; s: FrameStats }> = [];
    for (const [name, w, hgt] of [['1280×720', 1280, 720], ['640×360', 640, 360], ['320×180', 320, 180]] as const) {
      const ctx = await h.newContext({ viewport: { width: w, height: hgt } });
      const page = await ctx.newPage();
      const errors = collectErrors(page);
      await page.goto(h.url);
      await skipIntro(page);
      await waitReady(page);
      await waitChunks(page);
      await page.waitForTimeout(500);
      await page.evaluate(frameStart);
      await page.waitForTimeout(3000);
      rows.push({ name, w, h: hgt, s: statsOf(await page.evaluate(frameStop)) });
      expect(errors).toEqual([]);
      await ctx.close();
    }
    console.log(`[프레임 화면 크기별] ${rows.map((r) => `${r.name} ${r.s.fps.toFixed(1)} fps(가운데 ${r.s.medianMs.toFixed(0)} ms)`).join(', ')}`);
    expect(rows.every((r) => r.s.frames > 10), '모든 크기에서 돈다').toBe(true);
  }, LONG);
});

// ---------------------------------------------------------------------------
// 판정은 프레임이 떨어져도 같은 결과

const resultOf = async (page: Page): Promise<string> => (await page.locator('.feedback').innerText()).replace(/\s+/g, ' ').trim();

describe('10.7 판정: 계산이 여섯 배 느려져도(프레임이 떨어져도) 같은 결과가 나온다', () => {
  const PANELS: Array<[string, string, (p: Page) => Promise<void>]> = [
    ['Q01 같은 음의 자리 찾기', '#/q/pitch.same-note-two-clefs/middle-c', (p) => completeQ01(p, 'mouse')],
    ['Q02 쉼이 있는 한 마디', '#/q/rhythm.rest-in-a-bar/quarter-rest', (p) => completeQ02(p, 'mouse')],
  ];
  for (const [name, hash, complete] of PANELS) {
    it(`${name}: 같은 조작이 CPU를 6배 늦춰도 같은 판정 문장을 낸다`, async () => {
      const run = async (rate: number): Promise<string> => {
        const ctx = await h.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        const errors = collectErrors(page);
        if (rate > 1) {
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        }
        await page.goto(h.url + hash);
        await page.waitForSelector('.panel-shell h1', { timeout: 60000 });
        await complete(page); // 틀리게 놓고 확인한 뒤 고쳐서 통과하는 흐름 (안에서 판정 상태를 확인한다)
        const text = await resultOf(page);
        expect(errors).toEqual([]);
        await ctx.close();
        return text;
      };
      const normal = await run(1);
      const slow = await run(6);
      console.log(`[판정 ${name}] 보통: "${normal}" / 6배 느리게: "${slow}"`);
      expect(normal.length, '판정 문장').toBeGreaterThan(0);
      expect(slow).toBe(normal);
    }, LONG);
  }
});

// ---------------------------------------------------------------------------
// 8-4 그림 메모리 합계: 바닥 조각만이 아니라 올라온 모든 그림(사물 그림판, 글자 그림)을 합쳐 센다
//   10.7의 '바닥 조각 12장 이하(약 50MB)'는 바닥 조각만 센 값이다. 8-4에서 사물 그림판(objects.webp)과 글자 그림이 얼마를 더 쓰는지 재서 적는다.

interface TextureRow {
  key: string;
  w: number;
  h: number;
}
const textureRows = (): TextureRow[] => {
  const w = window as unknown as { __game: { world: { handle: { scene: { textures: { list: Record<string, { source: Array<{ width: number; height: number }> }> } } } | null } } };
  const list = w.__game.world.handle?.scene.textures.list ?? {};
  return Object.entries(list).map(([key, t]) => ({ key, w: t.source.reduce((s, x) => s + x.width, 0) / Math.max(1, t.source.length), h: t.source.reduce((s, x) => s + x.height, 0) / Math.max(1, t.source.length) }));
};
interface TextureSum {
  ground: { count: number; bytes: number };
  atlas: { count: number; bytes: number };
  other: { count: number; bytes: number };
}
const sumTextures = (rows: TextureRow[]): TextureSum => {
  const sum: TextureSum = { ground: { count: 0, bytes: 0 }, atlas: { count: 0, bytes: 0 }, other: { count: 0, bytes: 0 } };
  for (const r of rows) {
    const bytes = r.w * r.h * 4;
    const g = r.key.startsWith('ground-') ? sum.ground : r.key === 'world-objects' ? sum.atlas : sum.other;
    g.count += 1;
    g.bytes += bytes;
  }
  return sum;
};
/** 글자 그림 등 작은 그림 전체의 점검용 상한(8-4에서 잰 값의 두 배 남짓). 이 값은 설계서의 목표가 아니다 */
const OTHER_TEXTURES_MAX = 8 * MB;

describe('8-4 그림 메모리 합계: 바닥 조각 12장 + 사물 그림판 + 글자 그림. 정거장 23곳을 돌고 걸어도 불어나지 않는다', () => {
  it('1280×800: 시작할 때와 정거장 23곳을 돌고 걸은 뒤의 올라온 그림을 종류별로 센다', async () => {
    const ctx = await h.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    await page.goto(h.url);
    await skipIntro(page);
    await waitReady(page);
    await waitChunks(page);
    const atFirst = sumTextures(await page.evaluate(textureRows));
    let worst = sumTextures(await page.evaluate(textureRows));
    let worstTotal = 0;
    for (const id of STATIONS) {
      expect(await teleport(page, id), `${id}로 이동`).toBe(true);
      await waitChunks(page);
      const s = sumTextures(await page.evaluate(textureRows));
      const total = s.ground.bytes + s.atlas.bytes + s.other.bytes;
      if (total > worstTotal) {
        worstTotal = total;
        worst = s;
      }
    }
    await teleport(page, 'H1');
    await waitChunks(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2500);
    await page.keyboard.up('ArrowRight');
    await waitChunks(page);
    const atEnd = sumTextures(await page.evaluate(textureRows));
    const mib = (n: number): string => `${(n / MB).toFixed(2)} MiB`;
    const line = (name: string, s: TextureSum): string =>
      `  ${name}: 바닥 조각 ${s.ground.count}장 ${mib(s.ground.bytes)} + 사물 그림판 ${s.atlas.count}장 ${mib(s.atlas.bytes)} + 그 밖의 그림 ${s.other.count}개 ${mib(s.other.bytes)} = ${mib(s.ground.bytes + s.atlas.bytes + s.other.bytes)}`;
    console.log(['[그림 메모리 합계 1280×800]', line('시작', atFirst), line('정거장을 도는 동안 가장 컸던 때', worst), line('다 돌고 걸은 뒤', atEnd)].join('\n'));
    expect(worst.ground.count, '바닥 조각').toBeLessThanOrEqual(CHUNKS_MAX);
    expect(worst.atlas.count, '사물 그림판은 한 장').toBe(1);
    expect(worst.other.bytes, '그 밖의 그림 합').toBeLessThanOrEqual(OTHER_TEXTURES_MAX);
    // 걷고 돌아다닌다고 그 밖의 그림이 불어나지 않는다(글자 그림은 장면을 만들 때 한 번 만들고 되풀이해 쓴다)
    expect(atEnd.other.count, '그 밖의 그림 수').toBe(atFirst.other.count);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});

// ---------------------------------------------------------------------------
// 8-4 프레임 비용: 정거장마다 프레임 하나에 자바스크립트가 쓴 시간. 그리기(소프트웨어)가 아니라 우리 코드가 쓰는 시간을 본다

/** 화면 밖 그림 건너뛰기(WorldScene.cull)를 켜고 끈다. 같은 번들에서 건너뛰기만 달리해 견주려는 점검용이다 */
const setCull = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((v) => {
    (window as unknown as { __game: { world: { handle: { scene: { cull: { enabled: boolean } } } } } }).__game.world.handle.scene.cull.enabled = v;
  }, on);

describe('8-4 프레임 비용: 정거장 23곳에서 프레임 하나에 스크립트가 쓴 시간(이 환경의 값, 기준 기기의 값이 아니다)', () => {
  it('1280×720: 정거장마다 1.5초 서 있는 동안의 프레임 하나당 스크립트 시간(건너뛰기 켬·끔), 그리고 CPU를 4배 늦춘 같은 자리', async () => {
    const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(h.url);
    await skipIntro(page);
    await waitReady(page);
    await waitChunks(page);
    type Row = { id: string; ms: number; fps: number; pct: number };
    const sweep = async (): Promise<Row[]> => {
      const out: Row[] = [];
      for (const id of STATIONS) {
        expect(await teleport(page, id), `${id}로 이동`).toBe(true);
        await waitChunks(page);
        await page.waitForTimeout(400);
        await page.evaluate(frameStart);
        const m0 = await metricsOf(cdp);
        await page.waitForTimeout(1500);
        const m1 = await metricsOf(cdp);
        const st = statsOf(await page.evaluate(frameStop));
        const script = 1000 * ((m1['ScriptDuration'] ?? 0) - (m0['ScriptDuration'] ?? 0));
        out.push({ id, ms: script / Math.max(1, st.frames), fps: st.fps, pct: busyBetween(m0, m1).taskPct });
      }
      return out;
    };
    const rows = await sweep(); // 건너뛰기 켬(앱의 기본)
    const worst = [...rows].sort((a, b) => b.ms - a.ms)[0]!;
    const mean = rows.reduce((s, r) => s + r.ms, 0) / rows.length;
    // CPU를 4배 늦춘 같은 자리(가장 비싼 정거장과 마을 광장): 스크립트가 쓰는 시간이 얼마나 늘어나는지
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow: Array<{ id: string; ms: number; fps: number }> = [];
    for (const id of [...new Set([worst.id, 'H1'])]) {
      expect(await teleport(page, id), `${id}로 이동`).toBe(true);
      await waitChunks(page);
      await page.waitForTimeout(400);
      await page.evaluate(frameStart);
      const m0 = await metricsOf(cdp);
      await page.waitForTimeout(2500);
      const m1 = await metricsOf(cdp);
      const st = statsOf(await page.evaluate(frameStop));
      slow.push({ id, ms: (1000 * ((m1['ScriptDuration'] ?? 0) - (m0['ScriptDuration'] ?? 0))) / Math.max(1, st.frames), fps: st.fps });
    }
    // 같은 번들에서 건너뛰기만 끈 값(8-4가 더한 건너뛰기가 일하는지, 같은 쓰기 조건에서 견준다)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await setCull(page, false);
    const rowsOff = await sweep();
    const meanOff = rowsOff.reduce((s, r) => s + r.ms, 0) / rowsOff.length;
    const worstOff = [...rowsOff].sort((a, b) => b.ms - a.ms)[0]!;
    const lowest = [...rows].sort((a, b) => a.ms - b.ms)[0]!;
    const lowestOff = [...rowsOff].sort((a, b) => a.ms - b.ms)[0]!;
    console.log(
      [
        `[프레임 비용 1280×720] 정거장 ${rows.length}곳, 프레임 하나에 스크립트 평균 ${mean.toFixed(1)} ms, 가장 큰 곳 ${worst.id} ${worst.ms.toFixed(1)} ms, 가장 작은 곳 ${lowest.id} ${lowest.ms.toFixed(1)} ms (건너뛰기 켬)`,
        `  정거장별(켬): ${rows.map((r) => `${r.id} ${r.ms.toFixed(1)}`).join(', ')}`,
        `  같은 번들에서 건너뛰기만 끔: 평균 ${meanOff.toFixed(1)} ms, 가장 큰 곳 ${worstOff.id} ${worstOff.ms.toFixed(1)} ms, 가장 작은 곳 ${lowestOff.id} ${lowestOff.ms.toFixed(1)} ms (켠 쪽 평균의 ${(meanOff / mean).toFixed(1)}배)`,
        `  정거장별(끔): ${rowsOff.map((r) => `${r.id} ${r.ms.toFixed(1)}`).join(', ')}`,
        `  CPU 4배 늦춤(켬): ${slow.map((r) => `${r.id} 프레임 하나에 스크립트 ${r.ms.toFixed(1)} ms, ${r.fps.toFixed(1)} fps`).join(' / ')}`,
      ].join('\n'),
    );
    // 값은 적기만 한다. 다만 멈춘 화면(프레임이 거의 없는 정거장)이 없어야 하고, 건너뛰기가 일하는지는 견준 값으로 지킨다:
    // 켠 쪽의 평균이 끈 쪽의 0.7배보다 작아야 한다(이 환경에서 잰 비는 그보다 훨씬 작다. 건너뛰기가 일을 못 하면 걸린다)
    expect(rows.every((r) => r.fps > 1), '모든 정거장에서 프레임이 돈다(켬)').toBe(true);
    expect(rowsOff.every((r) => r.fps > 1), '모든 정거장에서 프레임이 돈다(끔)').toBe(true);
    expect(mean, `건너뛰기 켠 평균 ${mean.toFixed(1)} ms, 끈 평균 ${meanOff.toFixed(1)} ms`).toBeLessThan(meanOff * 0.7);
    expect(errors).toEqual([]);
    await ctx.close();
  }, LONG);
});

// ---------------------------------------------------------------------------
// 8-4 불러오기 시간: 첫 화면이 뜨고 월드가 준비될 때까지 걸린 시간을, 서버의 압축과 회선·CPU 제한을 바꿔 가며 잰다.
//   설계서 10.7에는 시간 목표가 없다(내려받는 양의 목표만 있다). 그래서 시간은 판정하지 않고 적는다. 판정은 받은 양이다.
//   회선은 WebPageTest의 '4G'(9 Mbps, 왕복 170 ms)와 '3G Fast'(1.6 Mbps, 왕복 150 ms)를 따랐고, CPU 4배 느리게는 Lighthouse의 휴대폰 설정이다.
//   크롬의 네트워크 제한이 localhost에도 걸리는 것을 쓴다. 이 컨테이너의 CPU가 기준이라 실제 휴대폰의 시간이 아니다.

interface LoadProfile {
  name: string;
  zip: boolean;
  /** 초당 바이트와 왕복 지연(ms). null이면 제한 없음 */
  net: { latency: number; down: number; up: number } | null;
  cpu: number;
}
const FOURG = { latency: 170, down: 9_000_000 / 8, up: 9_000_000 / 8 } as const;
const THREEG = { latency: 150, down: 1_600_000 / 8, up: 768_000 / 8 } as const;
const LOAD_PROFILES: readonly LoadProfile[] = [
  { name: '압축 없음, 제한 없음', zip: false, net: null, cpu: 1 },
  { name: 'gzip, 제한 없음', zip: true, net: null, cpu: 1 },
  { name: 'gzip, 4G(9 Mbps, 170 ms)', zip: true, net: FOURG, cpu: 1 },
  { name: 'gzip, 3G Fast(1.6 Mbps, 150 ms), CPU 4배 느리게', zip: true, net: THREEG, cpu: 4 },
  { name: '압축 없음, 3G Fast(1.6 Mbps, 150 ms), CPU 4배 느리게', zip: false, net: THREEG, cpu: 4 },
];
interface LoadRun {
  ui: number;
  ready: number;
  chunks: number;
  fcp: number;
  requests: number;
  encoded: number;
  decoded: number;
}

describe('8-4 불러오기 시간: 서버 압축과 회선에 따라 첫 화면(안내 카드)과 월드 준비까지 걸린 시간을 적는다', () => {
  const run = async (p: LoadProfile): Promise<LoadRun> => {
    const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    const cdp = await ctx.newCDPSession(page);
    if (p.net) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: p.net.latency, downloadThroughput: p.net.down, uploadThroughput: p.net.up });
    }
    if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    const t0 = Date.now();
    await page.goto(p.zip ? h.zipUrl : h.url, { waitUntil: 'commit', timeout: 240_000 });
    await page.waitForSelector('#ui-root > *', { state: 'attached', timeout: 240_000 });
    const ui = Date.now() - t0;
    await page.waitForFunction(() => !!(window as unknown as { __game?: { world: { bridge: { status: { get(): { ready: boolean } } } } } }).__game?.world.bridge.status.get().ready, undefined, { timeout: 240_000, polling: 100 });
    const ready = Date.now() - t0;
    await page.waitForFunction(
      () => {
        const d = (window as unknown as { __game?: { world: { debugState(): { chunks: string[]; pending: string[] } | null } } }).__game?.world.debugState();
        return !!d && d.chunks.length > 0 && d.pending.length === 0;
      },
      undefined,
      { timeout: 240_000, polling: 100 },
    );
    const chunks = Date.now() - t0;
    const stats = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
      return {
        fcp,
        requests: res.length + 1,
        encoded: res.reduce((s, r) => s + r.encodedBodySize, 0) + (nav?.encodedBodySize ?? 0),
        decoded: res.reduce((s, r) => s + r.decodedBodySize, 0) + (nav?.decodedBodySize ?? 0),
      };
    });
    expect(errors).toEqual([]);
    await ctx.close();
    return { ui, ready, chunks, ...stats };
  };

  it('다섯 조건에서 첫 화면까지의 시간과 받은 양을 적는다(판정은 받은 양의 목표뿐이다)', async () => {
    const rows: Array<{ p: LoadProfile; r: LoadRun }> = [];
    for (const p of LOAD_PROFILES) rows.push({ p, r: await run(p) });
    const sec = (ms: number): string => `${(ms / 1000).toFixed(2)}초`;
    console.log(
      [
        '[불러오기 시간 1280×720, 캐시 없이 처음 연 때]',
        ...rows.map(({ p, r }) => `  ${p.name}: 안내 카드 ${sec(r.ui)}, 월드 준비 ${sec(r.ready)}, 바닥 조각까지 ${sec(r.chunks)} (첫 그리기 ${sec(r.fcp)}) · 요청 ${r.requests}개, 받은 양 ${fmt(r.encoded)}, 풀어낸 양 ${fmt(r.decoded)}`),
      ].join('\n'),
    );
    // 받은 양의 목표(10.7): 압축 없이 풀어낸 양이 5 MB 안, gzip으로 받은 양은 훨씬 작다
    for (const { p, r } of rows) {
      expect(r.decoded, `${p.name}: 풀어낸 양`).toBeLessThanOrEqual(FIRST_SCREEN_MAX);
      if (p.zip) expect(r.encoded, `${p.name}: gzip으로 받은 양`).toBeLessThan(r.decoded);
    }
  }, 900_000);

  it('패널 주소로 바로 열면 월드(Phaser)를 기다리지 않는다: 3G Fast에서 패널이 보일 때까지의 시간과 받은 양', async () => {
    const ctx = await h.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: THREEG.latency, downloadThroughput: THREEG.down, uploadThroughput: THREEG.up });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.goto(`${h.zipUrl}#/q/pitch.same-note-two-clefs/middle-c`, { waitUntil: 'commit', timeout: 240_000 });
    await page.waitForSelector('.panel-shell h1', { timeout: 240_000 });
    const t = Date.now() - t0;
    const stats = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return { names: res.map((r) => r.name.split('/').pop() ?? ''), encoded: res.reduce((s, r) => s + r.encodedBodySize, 0) };
    });
    console.log(`[불러오기 시간 패널 주소 3G Fast + CPU 4배 + gzip] 패널이 보일 때까지 ${(t / 1000).toFixed(2)}초, 요청 ${stats.names.length}개(${stats.names.join(', ')}), 받은 양 ${fmt(stats.encoded)}`);
    expect(stats.names.some((n) => n.startsWith('start-')), '월드(Phaser) 덩어리를 받지 않았다').toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 300_000);
});

// ---------------------------------------------------------------------------
// 8-4 마디 예약기(D-251, #89): 합주 마디를 건너뛰는가. 소프트웨어로 그리는 이 환경에서 화면 크기별로, 모든 층(c12)의 합주를 들으며 잰다.
//   예약기(BarScheduler)의 깨어남 간격, 마디마다 시작보다 얼마나 앞서(여유, 음수면 늦게) 예약했는가, 건너뛴 마디를 적는다.
//   제품 코드는 바꾸지 않는다: 쪽 안에서 예약기가 들고 있는 onBar와 onTick을 감싸 시각만 적는다(비공개 필드 `scheduler.d`를 시험이 읽는다).

interface BarLog {
  bars: Array<{ bar: number; lead: number; cost: number }>;
  ticks: number[];
}
const hookScheduler = (): void => {
  const w = window as unknown as { __game: { worldAudio: { scheduler: { d: { onBar: (bar: number, start: number) => void; onTick?: () => void; clock: { now(): number } } } } } };
  const bag = window as unknown as { __barLog: BarLog };
  const d = w.__game.worldAudio.scheduler.d;
  const origBar = d.onBar;
  const origTick = d.onTick;
  bag.__barLog = { bars: [], ticks: [] };
  d.onBar = (bar, start) => {
    const lead = start - d.clock.now();
    const t0 = performance.now();
    origBar(bar, start);
    bag.__barLog.bars.push({ bar, lead, cost: performance.now() - t0 });
  };
  d.onTick = () => {
    bag.__barLog.ticks.push(performance.now());
    origTick?.();
  };
};
const readBarLog = (): BarLog => (window as unknown as { __barLog: BarLog }).__barLog;

const quantile = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

describe('8-4 마디 예약기: 모든 층(c12) 합주가 화면 크기가 달라도 마디를 건너뛰지 않고 제때 예약된다', () => {
  const combo = ENSEMBLE_COMBOS.find((c) => c.id.startsWith('c12'))!;
  const LISTEN_BARS_MS = 45_000;
  for (const [name, w, hgt] of [['640×360', 640, 360], ['1280×720', 1280, 720], ['1600×1000', 1600, 1000]] as const) {
    it(`${name}: 한 번 듣는 45초 동안 건너뛴 마디와 늦게 예약한 마디를 센다`, async () => {
      const { ctx, page, errors } = await bootWith(h, { w, h: hgt });
      await seedSave(page, { passed: combo.quests });
      await standQuiet(page, 'village');
      await turnSoundOn(page);
      await page.evaluate(hookScheduler);
      await page.waitForTimeout(LISTEN_BARS_MS);
      const log = await page.evaluate(readBarLog);
      const gaps = log.ticks.slice(1).map((t, i) => t - log.ticks[i]!).sort((a, b) => a - b);
      const first = log.bars[0]?.bar ?? 0;
      const last = log.bars[log.bars.length - 1]?.bar ?? 0;
      const called = new Set(log.bars.map((b) => b.bar));
      const skipped: number[] = [];
      for (let b = first; b <= last; b++) if (!called.has(b)) skipped.push(b);
      const leads = log.bars.map((b) => b.lead * 1000).sort((a, b) => a - b);
      const costs = log.bars.map((b) => b.cost).sort((a, b) => a - b);
      const late = log.bars.filter((b) => b.lead < 0).length;
      console.log(
        `[마디 예약기 ${name}] 깨어남 ${log.ticks.length}번, 간격 가운데 ${quantile(gaps, 0.5).toFixed(0)} ms, 95% ${quantile(gaps, 0.95).toFixed(0)} ms, 가장 긴 ${(gaps[gaps.length - 1] ?? 0).toFixed(0)} ms / 부른 마디 ${log.bars.length}개(마디 ${first}~${last}), 건너뜀 ${skipped.length}개 ${JSON.stringify(skipped)}, 시작이 지난 뒤에 부른 마디 ${late}개 / 예약 여유 가장 작은 ${(leads[0] ?? 0).toFixed(0)} ms, 가운데 ${quantile(leads, 0.5).toFixed(0)} ms / 마디 하나를 부르는 데 가운데 ${quantile(costs, 0.5).toFixed(1)} ms, 가장 긴 ${(costs[costs.length - 1] ?? 0).toFixed(1)} ms`,
      );
      expect(log.bars.length, '부른 마디').toBeGreaterThan(8);
      expect(skipped, '건너뛴 마디').toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    }, 240_000);
  }
});
