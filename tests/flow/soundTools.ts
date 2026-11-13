// 세계 소리 흐름 시험(실제 Chrome)이 함께 쓰는 도구: 오디오 장치를 지켜보는 훅과 출력 측정기, 소리 상태 읽기, 조용한 자리, 소리 켜기, 음색 재기.
// worldsound.flow.ts(4-5, 4-6), phase6-layers.flow.ts(6-8), phase7-regions.flow.ts(7-4), phase7-ensemble.flow.ts(7-5)가 쓴다. 제품 코드가 아니다.
import type { BrowserContext, Page } from 'playwright-core';
import { command, pos, status, waitChunks, waitReady } from './game';
import { collectErrors, skipIntro, type Harness } from './harness';

export interface RingLike {
  bar: number;
  stationId: string;
  version: 'base' | 'flower';
  gain: number;
  pan: number;
  /** 시계(세계 시계의 now와 같은 시간)로 그 울림이 시작하는 때(초) */
  time: number;
}
export interface PlazaBarLike {
  bar: number;
  chord: string;
  pulse: number;
  bed: number;
  percussion: number;
  bass: number;
  /** 7-5: 오선 언덕의 가락, 음계 길의 달리는 음, 건반 늪의 꾸밈음도 광장 합주에 더해진다. 마디 하나의 음 수다 */
  melody: number;
  runner: number;
  ornament: number;
  /** 그 마디를 예약할 때의 성부별 층(0–3). 마을은 광장 합주의 화음 깔기, 나머지는 그 성부를 맡은 지역의 층이다 */
  layers: PlazaLayersLike;
}
export interface PlazaLayersLike {
  village: number;
  melody: number;
  percussion: number;
  bass: number;
  runner: number;
  ornament: number;
}
export interface LandmarkRingLike {
  bar: number;
  regionId: string;
  gain: number;
  pan: number;
  time: number;
}
export interface RegionBarLike {
  bar: number;
  regionId: string;
  layer: number;
  chord: number;
  nature: number;
  part: number;
}
export interface SoundDebug {
  running: boolean;
  bar: number;
  nextBar: number | null;
  villageLayer: number;
  plazaAudible: boolean;
  /** 지금 소리가 열려 있는 지역(광장 합주의 마을, 바탕 소리가 있는 지역)과 최근에 예약한 마디들(6-8) */
  audibleRegions: string[];
  plazaBars: PlazaBarLike[];
  regionBars: RegionBarLike[];
  /** 최근에 울린 표지의 소리(건반 늪의 기준음 탑, 7-4) */
  landmarkRings: LandmarkRingLike[];
  barsScheduled: number;
  notesScheduled: number;
  rings: RingLike[];
}
export interface GameCtx {
  worldAudio: { debug(): SoundDebug };
  /** 세계 반응: 지역별 소리 층(0–3)과 합주의 층 합(0–18) */
  reaction: { store: { get(): { regionLayers: Readonly<Record<string, number>>; ensembleLevel: number } } };
  worldClock: { now(): number; bar(): number; barStart(n: number): number };
  mixer: {
    state: string;
    muted: boolean;
    ducked: boolean;
    settings: { worldVolume: number; muteWorldDuringQuest: boolean };
    busLevelDb(id: string): number;
    beginTaskSound(): () => void;
    setMuted(m: boolean): void;
    /** 늘 흐르는 시계(세계 소리의 시각이 이 시계 기준이다) */
    clock: { now(): number };
    registerWorldSink(bus: string, options: { timbre?: string; pan?: boolean }): { schedule(req: { id: string; midi: number; time: number; duration: number; velocity: number; pan?: number }): void; cancelAll(): void };
  };
  settings: { get(): Record<string, unknown>; update(fn: (s: Record<string, unknown>) => Record<string, unknown>): void };
  controller: { open(q: string, v: string): unknown; edit(e: unknown): void; check(): { passed: boolean } };
  world: { map: { stations: Array<{ stationId: string; name: string; regionId: string; x: number; y: number }> }; bridge: { view: { get(): { view: { x: number; y: number; width: number; height: number }; screen: { width: number; height: number } } | null } } };
}
/** 오디오 장치가 만들어진 횟수와, 출력(destination)으로 가는 소리의 크기(측정기)를 잡는다. 앱 코드보다 먼저 실행된다 */
export async function installAudioHooks(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as {
      __audioContexts: AudioContext[];
      __meter?: AnalyserNode;
      __oscStarts: number;
      AudioContext: typeof AudioContext;
    };
    w.__audioContexts = [];
    w.__oscStarts = 0;
    const Orig = w.AudioContext;
    w.AudioContext = class extends Orig {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__audioContexts.push(this);
      }
    } as typeof AudioContext;
    // 진짜 소리가 나갔는지 보려고, 출력으로 가는 모든 연결에 측정기를 하나 더 붙인다(소리는 그대로 나간다)
    const origConnect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
      const result = origConnect.call(this, dest, ...rest);
      if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
        if (!w.__meter) {
          const meter = dest.context.createAnalyser();
          meter.fftSize = 32768; // 약 0.7초치. 느린 화면에서 40 ms 간격으로 재지 못해도 지나간 소리가 빠지지 않게 한다
          w.__meter = meter;
        }
        origConnect.call(this, w.__meter);
      }
      return result;
    };
    const origStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...a: Parameters<typeof origStart>) {
      w.__oscStarts += 1;
      return origStart.apply(this, a);
    };
  });
}

/**
 * 출력(destination)으로 가는 모든 연결을 녹음 받이(MediaStreamAudioDestinationNode)에도 이어서, 사람이 귀로 확인할 수 있게 실제 소리를 녹음할 수 있게 한다(7-5).
 * installAudioHooks 다음에 부른다(그 위에 덧씌운다). 소리는 그대로 나가고, 쓰지 않을 때는 녹음 받이에 소비자가 없어 아무 일도 하지 않는다.
 */
export async function installAudioRecorder(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __rec?: MediaStreamAudioDestinationNode };
    const prev = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
      const result = prev.call(this, dest, ...rest);
      if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
        try {
          const context = dest.context as AudioContext;
          if (!w.__rec && typeof context.createMediaStreamDestination === 'function') w.__rec = context.createMediaStreamDestination();
          if (w.__rec) prev.call(this, w.__rec);
        } catch {
          // 다른 오디오 장치의 소리는 녹음 받이에 이을 수 없다. 녹음은 첫 장치만 한다
        }
      }
      return result;
    };
  });
}

export async function boot(h: Harness, opts: { w?: number; h?: number; reduced?: boolean; hash?: string; record?: boolean } = {}) {
  const ctx = await h.newContext({ viewport: { width: opts.w ?? 1280, height: opts.h ?? 720 }, ...(opts.reduced ? { reducedMotion: 'reduce' as const } : {}) });
  await installAudioHooks(ctx);
  if (opts.record) await installAudioRecorder(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url + (opts.hash ?? ''));
  await skipIntro(page);
  await waitReady(page);
  await waitChunks(page);
  return { ctx, page, errors };
}

export async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string, timeout = 40000): Promise<T> {
  const end = Date.now() + timeout;
  let last: T | undefined;
  while (Date.now() < end) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`시간 안에 ${what}: 마지막 값 ${JSON.stringify(last)}`);
}

export const sound = (page: Page): Promise<SoundDebug> => page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.worldAudio.debug());
export const contextCount = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length);
export const oscStarts = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __oscStarts: number }).__oscStarts);
export const mixerState = (page: Page): Promise<{ state: string; muted: boolean; ducked: boolean; world: number; layer: number; sig: number; bed: number }> =>
  page.evaluate(() => {
    const m = (window as unknown as { __game: GameCtx }).__game.mixer;
    return { state: m.state, muted: m.muted, ducked: m.ducked, world: m.settings.worldVolume, layer: m.busLevelDb('worldLayer'), sig: m.busLevelDb('worldSignature'), bed: m.busLevelDb('worldBed') };
  });

/** 출력(destination)으로 가는 소리의 가장 큰 값(−1~1)을 ms 동안 재서 돌려준다. 측정기가 아직 없으면 −1 */
export const peakOver = (page: Page, ms: number): Promise<number> =>
  page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        const meter = (window as unknown as { __meter?: AnalyserNode }).__meter;
        if (!meter) return resolve(-1);
        const buf = new Float32Array(meter.fftSize);
        let peak = 0;
        const t0 = performance.now();
        const step = (): void => {
          meter.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
          if (performance.now() - t0 < duration) setTimeout(step, 40);
          else resolve(peak);
        };
        step();
      }),
    ms,
  );

/**
 * 출력(destination)으로 가는 소리의 세기(RMS, −1~1)를 ms 동안 40 ms마다 재서 가장 큰 값을 돌려준다. 한 번 재는 길이는 마지막 8192 샘플(약 0.19초)이다.
 * 순간 최댓값(peakOver)보다 귀에 들리는 크기에 가깝다: 소음은 최댓값이 평균보다 몇 배 높게 튄다. 측정기가 아직 없으면 −1
 */
export const rmsOver = (page: Page, ms: number): Promise<number> =>
  page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        const meter = (window as unknown as { __meter?: AnalyserNode }).__meter;
        if (!meter) return resolve(-1);
        const buf = new Float32Array(meter.fftSize);
        const win = 8192;
        let best = 0;
        const t0 = performance.now();
        const step = (): void => {
          meter.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = buf.length - win; i < buf.length; i++) sum += buf[i]! * buf[i]!;
          best = Math.max(best, Math.sqrt(sum / win));
          if (performance.now() - t0 < duration) setTimeout(step, 40);
          else resolve(best);
        };
        step();
      }),
    ms,
  );

/**
 * 출력으로 가는 실제 소리를 ms 동안 녹음해 WebM(Opus) 파일의 바이트로 돌려준다. boot에 record: true를 준 쪽에서만 쓴다.
 * 실제 시간으로 녹음하므로 ms만큼 걸린다. 사람이 귀로 확인할 때 쓰는 자료이고, 시험의 통과 기준에는 들어가지 않는다.
 */
export async function recordOver(page: Page, ms: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    (duration) =>
      new Promise<string>((resolve, reject) => {
        const rec = (window as unknown as { __rec?: MediaStreamAudioDestinationNode }).__rec;
        if (!rec) return reject(new Error('녹음 받이가 아직 없어요(소리가 켜져 있지 않거나 boot에 record: true를 주지 않았어요)'));
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        const recorder = new MediaRecorder(rec.stream, { mimeType: mime, audioBitsPerSecond: 192000 });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = () => reject(new Error('녹음 중 오류'));
        recorder.onstop = () => {
          void new Blob(chunks, { type: mime }).arrayBuffer().then((buf) => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            resolve(btoa(binary));
          });
        };
        recorder.start(1000);
        setTimeout(() => recorder.stop(), duration);
      }),
    ms,
  );
  return Buffer.from(base64, 'base64');
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 이 지역 안에서, 서명 소리가 들리는 거리(810 px) 안에 어떤 정거장도 없는 자리에 선다.
 * 7-4부터 마을 밖 다섯 지역 모두에 바탕 소리(긴 화음과 자연음)가 깔려서 '조용한 지역'은 없다. 마을에서는 광장 합주만, 마을 밖에서는 그 지역의 바탕 소리만 들린다.
 * 소리 조각(600 px)과 기준음 탑(900 px)이 들리는 거리 밖의 자리를 골랐다(오선 언덕, 음계 길, 건반 늪. 앞의 두 지역은 걸어서 닿는 자리다).
 */
export type QuietRegion = 'village' | 'staff-hill' | 'beat-river' | 'bell-grove' | 'scale-trail' | 'key-marsh';
export const QUIET_SPOTS: Record<QuietRegion, ReadonlyArray<readonly [number, number]>> = {
  village: [[2800, 2200], [2760, 2400], [3000, 2150], [2700, 2600]],
  // 오선 언덕: 어떤 정거장(N1–N3)에서도 900 px, 어떤 소리 조각에서도 700 px 넘게 떨어진 서쪽 가장자리
  'staff-hill': [[2850, 250], [2850, 350], [2850, 1600], [2900, 250]],
  // 박자 강가: 어떤 정거장(E1–E4)에서도 830 px 넘게 떨어진 강가의 서쪽과 북동쪽
  'beat-river': [[5800, 900], [5900, 400], [7500, 900], [7700, 1500]],
  // 종나무 숲: 어떤 정거장(W1–W4)에서도 830 px 넘게 떨어진 숲의 북쪽과 남쪽 가장자리
  'bell-grove': [[2300, 600], [400, 500], [500, 3900], [2300, 3900]],
  // 음계 길: 어떤 정거장(S1–S3)에서도 900 px, 어떤 소리 조각에서도 700 px 넘게 떨어진 동쪽 끝
  'scale-trail': [[7900, 5850], [7900, 5750], [7850, 5800], [7800, 5850]],
  // 건반 늪: 어떤 정거장(K1–K4)에서도 900 px, 소리 조각에서 700 px, 기준음 탑에서 1000 px 넘게 떨어진 동쪽 가장자리와 서쪽 끝
  'key-marsh': [[3800, 4750], [250, 5850], [3750, 4750], [250, 5750]],
};
export async function standQuiet(page: Page, regionId: QuietRegion = 'village'): Promise<{ x: number; y: number }> {
  for (const [x, y] of QUIET_SPOTS[regionId]) {
    await command(page, { type: 'teleport', x, y });
    await until(() => pos(page), (p) => Math.hypot(p.x - x, p.y - y) < 200, '캐릭터가 자리에 섬', 15000);
    const spot = await pos(page);
    const near = await page.evaluate(
      (p) => {
        const g = (window as unknown as { __game: GameCtx }).__game;
        return Math.min(...g.world.map.stations.map((s) => Math.hypot(s.x - p.x, s.y - p.y)));
      },
      spot,
    );
    if ((await status(page)).regionId === regionId && near > 830) return spot;
  }
  throw new Error(`${regionId} 안의 조용한 자리를 찾지 못했어요`);
}

export const turnSoundOn = async (page: Page): Promise<void> => {
  await page.locator('.hud-menu').getByRole('button', { name: '소리 켜기' }).click();
  await page.waitForSelector('.hud .sound-status[data-sound-state="on"]', { state: 'attached', timeout: 20000 });
};

/**
 * 탭이 가려진 것처럼 문서의 보임 상태(visibilityState)를 바꾸고 알린다. 세계 소리는 멈춘다(8.2: 예약을 그치고 이미 예약한 음을 지운다).
 * 오디오 장치는 그대로 돌아서 소리 받이를 직접 신청해 음색 하나만 재고 싶을 때 바탕 소리 없이 잴 수 있다.
 * 마을 밖 모든 지역에 바탕 소리가 깔린 뒤(7-4)로는 '조용한 지역'이 없어서, 조용한 상태는 이것으로 만든다. 제품 코드는 바꾸지 않는다.
 */
export const pretendHidden = (page: Page, hidden: boolean): Promise<void> =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

export interface Probe {
  timbre: string;
  bus: 'worldBed' | 'worldLayer' | 'worldSignature';
  midi: number;
  velocity: number;
  duration: number;
  /** 좌우를 낼 수 있는 소리 받이로 신청한다(서명 버스의 음색) */
  pan?: boolean;
}

/** 소리 받이 하나에 음 하나를 직접 넣고, 그 음이 지나가는 동안 출력(destination)에 실린 가장 큰 값과 세기(RMS)를 잰다 */
export async function probe(page: Page, p: Probe): Promise<{ peak: number; rms: number }> {
  await page.evaluate((q) => {
    const g = (window as unknown as { __game: GameCtx }).__game;
    const sink = g.mixer.registerWorldSink(q.bus, { timbre: q.timbre, ...(q.pan ? { pan: true } : {}) });
    sink.schedule({ id: `probe-${q.timbre}`, midi: q.midi, time: g.mixer.clock.now() + 0.25, duration: q.duration, velocity: q.velocity });
  }, p);
  const ms = (0.25 + p.duration + 1.2) * 1000;
  const [peak, rms] = await Promise.all([peakOver(page, ms), rmsOver(page, ms)]);
  await wait(2500); // 끝 울림이 사라질 때까지
  return { peak, rms };
}
