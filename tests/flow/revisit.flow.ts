// 8-5 두 번째 방문(8-4가 넘긴 것): docs/hosting.md의 캐시 머리말이 있을 때 다시 열면 무엇을 다시 받는지와, 느린 회선(3G Fast, CPU 4배 느리게)에서의 시간.
// 점검용 연결(window.__game)이 있는 미리보기 빌드(dist)로 잰다. 파일 이름, 머리말, 캐시 동작은 공개 빌드와 같다.
// 새 브라우저에서 이 파일만 돈다: 같은 시험을 release.flow.ts 안에서 다른 시험 뒤에 돌렸을 때는 첫 방문이 15~16초로 나왔고(새 브라우저에서는 약 10초,
// 8-4의 표와 같다) 그 까닭은 가리지 못했다. 그래서 시간을 재는 이 시험은 따로 둔다(docs/hosting.md).
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness';
import { startHostedServer } from './hosting';

const DIST = path.resolve(__dirname, '../../dist');
const THREEG = { latency: 150, down: 1_600_000 / 8, up: 768_000 / 8 } as const;
type GameProbe = { __game?: { world: { bridge: { status: { get(): { ready: boolean } } }; debugState(): { chunks: string[]; pending: string[] } | null } } };

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
}, 60_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

describe('두 번째 방문: 캐시 머리말이 있을 때 다시 받는 것과 시간', () => {
  it('assets/*는 다시 받지 않고 index.html과 world/*는 확인만 하고(304) 본문은 한 바이트도 오지 않는다. 시간은 첫 방문보다 짧다', async () => {
    const server = await startHostedServer(DIST);
    const ctx = await h.newContext({ viewport: { width: 1280, height: 720 } });
    const visit = async (): Promise<{ ui: number; ready: number; settled: number; served: typeof server.served }> => {
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: THREEG.latency, downloadThroughput: THREEG.down, uploadThroughput: THREEG.up });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const from = server.served.length;
      const t0 = Date.now();
      await page.goto(server.url, { waitUntil: 'commit', timeout: 240_000 });
      await page.waitForSelector('#ui-root > *', { state: 'attached', timeout: 240_000 });
      const ui = Date.now() - t0;
      await page.waitForFunction(() => !!(window as unknown as GameProbe).__game?.world.bridge.status.get().ready, undefined, { timeout: 240_000, polling: 100 });
      const ready = Date.now() - t0;
      await page.waitForFunction(
        () => {
          const d = (window as unknown as GameProbe).__game?.world.debugState();
          return !!d && d.chunks.length > 0 && d.pending.length === 0;
        },
        undefined,
        { timeout: 240_000, polling: 100 },
      );
      const settled = Date.now() - t0;
      const served = server.served.slice(from);
      await page.close();
      return { ui, ready, settled, served };
    };
    try {
      const cold = await visit();
      const warm = await visit();
      const sum = (v: { served: Array<{ bytes: number }> }): number => v.served.reduce((n, x) => n + x.bytes, 0);
      const by = (v: { served: Array<{ status: number }> }, st: number): number => v.served.filter((x) => x.status === st).length;
      console.log(
        'SECOND_VISIT ' +
          JSON.stringify({
            cold: { ui: cold.ui, ready: cold.ready, settled: cold.settled, requests: cold.served.length, bytes: sum(cold) },
            warm: { ui: warm.ui, ready: warm.ready, settled: warm.settled, requests: warm.served.length, bytes: sum(warm), s200: by(warm, 200), s304: by(warm, 304), assets: warm.served.filter((x) => x.path.startsWith('/assets/')).length, world: warm.served.filter((x) => x.path.startsWith('/world/')).length },
          }),
      );
      expect(warm.served.filter((x) => x.path.startsWith('/assets/')), 'assets/*는 캐시에서 쓴다').toEqual([]);
      expect(warm.served.some((x) => x.path === '/index.html' && x.status === 304)).toBe(true);
      expect(warm.served.filter((x) => x.status !== 304), '두 번째 방문에서 본문이 온 응답').toEqual([]);
      expect(sum(warm)).toBe(0);
      expect(warm.served.length).toBe(cold.served.filter((x) => !x.path.startsWith('/assets/')).length);
      expect(warm.settled).toBeLessThan(cold.settled);
    } finally {
      await ctx.close();
      await server.close();
    }
  }, 300_000);
});
