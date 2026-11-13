// 6-9c 놀이 악기 흐름 시험(실제 Chrome): 박자 강가의 물방울 북과 종나무 숲의 메아리 벽. 목표도 판정도 기록도 없이 걸어서 돌을 밟으면 소리가 난다(설계서 3.5, W-5).
// 이 파일이 보는 것:
//  - 걸어서 돌에 올라서면 밟은 돌의 번호가 한 번씩 알려지고, 같은 돌 위에 서 있는 동안은 다시 알려지지 않고, 내려갔다 올라서면 다시 알려진다
//  - 소리를 켜기 전에는 돌을 밟아도 오디오 장치가 만들어지지 않는다(W-11). 소리를 켜면 진짜 오디오 출력에 소리가 실린다
//  - 메아리 벽은 한 박(0.75초) 뒤에 같은 음이 절반 세기로 한 번 더 나고, 그 한 박 뒤에 같은 돌에 고리가 한 번 더 비친다(소리를 못 듣는 사람도 본다)
//  - 움직임 줄이기에서도 같다. 지도(발견 위치 표시를 켠 때)에는 두 악기가 이름과 함께 보이고, 찾은 것 개수에는 들지 않는다
//  - 오류가 없다. 돌을 밟은 일은 사용 기록, 찾은 목록, 세계 반응에 남지 않는다
// 먼저 `npm run build`가 필요하다(dist를 연다). 상태는 미리보기 채널의 window.__game으로 읽는다.
// 소리가 듣기 좋은지, 메아리의 어울림, 그림의 모습(물 바닥, 벽, 돌의 크기와 글자)은 사람의 귀와 눈으로 확인한다(docs/approvals.md의 '사람 확인 대기').
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { command, dbg, eventsOf, pos, recordEvents, status, toScreen, type Game } from './game';
import { startHarness, type Harness } from './harness';
import { boot as bootWith, contextCount, mixerState, oscStarts, sound, turnSoundOn, until, wait } from './soundTools';
import { ITEMS } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 240_000;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const SLIDE = 'play.staff-hill.pitch-slide';
const DRUM = 'play.beat-river.drum';
const WALL = 'play.bell-grove.echo-wall';
const PINWHEELS = 'play.scale-trail.pinwheels';
const LILIES = 'play.key-marsh.lily-chorus';
const boot = (opts: { reduced?: boolean; hash?: string } = {}) => bootWith(h, opts);

/** 물방울 북: 위쪽 줄(y 2128)에 1번, 2번 돌이 있다. 돌 가운데 x는 7628, 7772(반지름 44) */
const DRUM_ROW = { y: 2128, startX: 7500, pad1: 7628, pad2: 7772 };
/** 메아리 벽: 돌 다섯이 y 710 한 줄에 104 px 간격(x 392, 496, 600, 704, 808) */
const WALL_ROW = { y: 710, startX: 300, pads: [392, 496, 600, 704, 808] };

interface PadEvent {
  type: string;
  playId?: string;
  pad?: number;
}
const padEvents = async (page: Page, playId?: string): Promise<Array<{ playId: string; pad: number }>> => {
  const all = (await eventsOf(page, 'pad-struck')) as PadEvent[];
  return all.filter((e) => playId === undefined || e.playId === playId).map((e) => ({ playId: e.playId!, pad: e.pad! }));
};

/** 월드 상태를 일정하게 훑어서, 지금까지 본 돌의 모습(상태가 idle이 아닌 것)을 모은다. 밝은 돌이 0.35초만 보여서 시험이 놓치지 않게 한다 */
async function startSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __game: Game; __padSeen?: string[] };
    const seen = new Set<string>();
    w.__padSeen = [];
    setInterval(() => {
      const d = w.__game.world.debugState();
      if (!d) return;
      for (const p of d.play)
        for (const pad of p.pads) {
          if (pad.state === 'idle') continue;
          const key = `${p.playId}:${pad.pad}:${pad.state}`;
          if (!seen.has(key)) {
            seen.add(key);
            w.__padSeen!.push(key);
          }
        }
    }, 25);
  });
}
const padSeen = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __padSeen?: string[] }).__padSeen ?? []);

/** 놀이 악기가 낸 소리의 기록(소리를 켜지 않았어도 부름은 기록된다) */
interface PadNote {
  playId: string;
  pad: number;
  midi: number;
  time: number;
  velocity: number;
}
const playNotes = (page: Page): Promise<PadNote[]> => page.evaluate(() => [...(window as unknown as { __game: { playAudio: { recent(): readonly PadNote[] } } }).__game.playAudio.recent()]);

async function teleportTo(page: Page, x: number, y: number, region: string): Promise<void> {
  await command(page, { type: 'teleport', x, y });
  await until(() => pos(page), (p) => Math.hypot(p.x - x, p.y - y) < 60, `캐릭터가 (${x}, ${y})에 선다`, 20000);
  await until(() => status(page), (s) => s.regionId === region && s.ready, `${region}에 들어선다`, 20000);
  await until(() => dbg(page), (d) => d.pending.length === 0, '바닥 조각이 올라온다', 30000);
}

/** 키를 누른 채 조건이 될 때까지 걷는다 */
async function walkWhile<T>(page: Page, key: string, read: () => Promise<T>, ok: (v: T) => boolean, what: string): Promise<T> {
  await page.keyboard.down(key);
  try {
    return await until(read, ok, what, 60000);
  } finally {
    await page.keyboard.up(key);
  }
}

/**
 * 두 지역에는 지역 바탕 소리(긴 화음과 자연음)가 늘 깔려 있다: 이 환경에서 출력은 쉬지 않고 최댓값 0.03쯤, 실효값 0.01쯤이다.
 * 그래서 '조용하다가 소리가 난다'로는 잴 수 없고, 돌을 밟은 순간의 출력이 밟기 직전의 바탕 위로 솟는지를 견준다.
 * 이 기록기는 출력의 최댓값을 25 ms마다 적고, 돌 밟기 사건이 온 시각을 같은 시계(performance.now)로 적는다. 페이지마다 한 번만 건다.
 */
async function startMeterLog(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const w = window as unknown as {
      __meter?: AnalyserNode;
      __lvl?: { samples: Array<[number, number]>; strikes: number[] };
      __game: { world: { bridge: { events: { subscribe(f: (e: { type: string }) => void): void } } } };
    };
    if (w.__lvl) return true;
    const meter = w.__meter;
    if (!meter) return false;
    const lvl = { samples: [] as Array<[number, number]>, strikes: [] as number[] };
    w.__lvl = lvl;
    // 화면을 그리느라 재는 일이 드문드문(0.2초쯤에 한 번)해서, 한 번 잴 때 마지막 8192 샘플(0.17초 남짓)을 한꺼번에 보아 사이의 소리를 놓치지 않는다
    if (meter.fftSize < 8192) meter.fftSize = 8192;
    const buf = new Float32Array(meter.fftSize);
    setInterval(() => {
      meter.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]!));
      lvl.samples.push([performance.now(), p]);
    }, 25);
    w.__game.world.bridge.events.subscribe((e) => {
      if (e.type === 'pad-struck') lvl.strikes.push(performance.now());
    });
    return true;
  });
  expect(ok, '출력 측정기가 있다(소리를 켠 뒤에 생긴다)').toBe(true);
}

const strikeCount = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __lvl: { strikes: number[] } }).__lvl.strikes.length);

/**
 * 돌을 밟기 직전 5초 동안의 바탕 최댓값(bed)과 밟은 뒤 0.7초의 최댓값(strike).
 * 헤드리스 오디오는 가끔 1초쯤 끊기는데, 끊김은 strike를 낮출 수는 있어도 높이지는 못한다(bed는 5초의 최댓값이라 끊김에 영향받지 않는다).
 * 그래서 솟음을 못 본 시도는 되풀이하고, 솟음을 본 시도만 믿는다.
 */
interface Lift {
  bed: number;
  strike: number;
  /** 재어 본 횟수(밟기 전 5초 + 뒤 0.7초). 화면을 그리느라 드문드문하다 */
  samples: number;
}
const liftOf = (page: Page, index: number): Promise<Lift> =>
  page.evaluate((i) => {
    const lvl = (window as unknown as { __lvl: { samples: Array<[number, number]>; strikes: number[] } }).__lvl;
    const t0 = lvl.strikes[i]!;
    const rel = lvl.samples.filter(([t]) => t >= t0 - 5200 && t < t0 + 900).map(([t, p]) => [t - t0, p] as const);
    const max = (lo: number, hi: number): number => rel.reduce((m, [t, p]) => (t >= lo && t < hi ? Math.max(m, p) : m), 0);
    return { bed: max(-5000, -150), strike: max(0, 700), samples: rel.length };
  }, index);

/**
 * 바탕이 들리고(0.02 넘게) 밟은 순간의 출력이 바탕의 최댓값보다 1.25배 넘게 높다. 재어 본 값: 바탕만 있을 때 1초 창의 최댓값은 두 지역 모두 0.030~0.035였고(각 15번, 가장 큰 오르내림 1.17배),
 * 시험 안에서 잰 바탕은 0.030~0.039, 밟은 순간은 0.047~0.070(바탕의 1.4~2.0배)였다. 문턱은 그 사이에 둔다
 */
const isLifted = (l: Lift): boolean => l.bed > 0.02 && l.strike > l.bed * 1.25;

/** 돌 밖의 시작 자리에서 출발해 첫 돌을 밟아 본다. 솟음이 확인되거나 다섯 번을 다 할 때까지, 시도마다 시작 자리로 되돌아온다(옮기는 일은 소리를 내지 않는다) */
async function strikeLift(page: Page, startX: number, y: number, region: string, key = 'ArrowRight'): Promise<Lift[]> {
  await startMeterLog(page);
  const tries: Lift[] = [];
  for (let k = 0; k < 5; k++) {
    await teleportTo(page, startX, y, region);
    await wait(5500);
    const n0 = await strikeCount(page);
    await walkWhile(page, key, () => strikeCount(page), (n) => n > n0, '첫 돌을 밟는다');
    await wait(1200);
    const lift = await liftOf(page, n0);
    tries.push(lift);
    if (isLifted(lift)) break;
  }
  console.info(`[밟은 순간의 솟음 ${region}] 시도 ${tries.length}번: ${JSON.stringify(tries.map((t) => ({ bed: +t.bed.toFixed(4), strike: +t.strike.toFixed(4), samples: t.samples })))}`);
  return tries;
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

// ───── 눈으로 보는 점검 자료(스크린샷)와 그림 점 확인 ─────
// 밝은 돌은 0.35초(층의 시계)만 보인다. 걷기를 끝낸 뒤에 찍으면 이미 쉬는 모습이라서(6-9c의 첫 사진이 그랬다) 눈으로 볼 자료가 되지 않는다.
// 그래서 밟은 돌이 밝아진 프레임을 기다려 바로 찍고, 찍힌 그림의 돌 자리 색이 정말 밝은 돌인지(곁의 쉬는 돌과 다른지) 그림 점으로 확인한 뒤에야 파일로 남긴다.
// 쉬는 모습의 사진도 같다: 돌 하나하나가 쉬는 돌 색으로 보이는지 확인한다(나무 가지나 사물에 가린 돌이 있으면 여기서 걸린다).
// 캐릭터가 서 있는 쪽(왼쪽)은 캐릭터 그림이 돌을 가리므로, 돌 가운데에서 오른쪽으로 ±70도 부채꼴의 점만 본다(음 이름 글자도 피하려고 반지름 20~26 px).

type Rgb = [number, number, number];
type PixelAt = (x: number, y: number) => Rgb;
/** 스크린샷(PNG)의 한 점 색을 읽는 함수 */
async function pixelReader(png: Buffer): Promise<PixelAt> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x, y) => {
    const cx = Math.min(Math.max(Math.round(x), 0), info.width - 1);
    const cy = Math.min(Math.max(Math.round(y), 0), info.height - 1);
    const i = (cy * info.width + cx) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
}
const luma = ([r, g, b]: Rgb): number => 0.299 * r + 0.587 * g + 0.114 * b;
/** 밟은 돌의 채움색(0xfbe7a1 = 251, 231, 161)은 푸른 기가 적다. 쉬는 돌(0xf4f3ea = 244, 243, 234)은 푸른 기가 많다 */
const isGoldFill = ([r, , b]: Rgb): boolean => r >= 235 && b >= 120 && b <= 200;
const isRestFill = ([r, , b]: Rgb): boolean => r >= 225 && b >= 215;
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const ARC_DEG = Array.from({ length: 15 }, (_, i) => -70 + i * 10);
/** 돌 가운데에서 오른쪽 부채꼴의 점들(반지름은 월드 px, 화면 배율을 곱해서 읽는다) */
const arcPoints = (c: { x: number; y: number }, zoom: number, radii: number[]): Array<{ x: number; y: number }> =>
  ARC_DEG.flatMap((deg) => radii.map((r) => ({ x: c.x + Math.cos((deg * Math.PI) / 180) * r * zoom, y: c.y + Math.sin((deg * Math.PI) / 180) * r * zoom })));

/** 돌 안쪽 채움을 읽은 값: 채움색에 맞는 점의 비율과 가운데 값(기록에 남긴다) */
function fillOf(at: PixelAt, c: { x: number; y: number }, zoom: number): { gold: number; rest: number; mid: Rgb } {
  const px = arcPoints(c, zoom, [20, 23, 26]).map((p) => at(p.x, p.y));
  return {
    gold: px.filter(isGoldFill).length / px.length,
    rest: px.filter(isRestFill).length / px.length,
    mid: [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))],
  };
}
/** 안쪽 금빛 고리(반지름 31, 두께 3)의 어두움: 각 방향에서 반지름 28~34의 가장 어두운 점의 밝기를 모아 가운데 값을 낸다. 무채색에서도 보이는 단서다 */
function ringLumaOf(at: PixelAt, c: { x: number; y: number }, zoom: number): number {
  return median(
    ARC_DEG.map((deg) => {
      const a = (deg * Math.PI) / 180;
      let lo = 255;
      for (let r = 28; r <= 34; r++) lo = Math.min(lo, luma(at(c.x + Math.cos(a) * r * zoom, c.y + Math.sin(a) * r * zoom)));
      return lo;
    }),
  );
}

const rgbText = (c: Rgb): string => `(${c.join(', ')})`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const GOLD_FRAC = 0.85;

interface PadSpot {
  pad: number;
  x: number;
  y: number;
}
async function padsOf(page: Page, playId: string): Promise<{ d: Awaited<ReturnType<typeof dbg>>; pads: PadSpot[] }> {
  const d = await dbg(page);
  const play = d.play.find((p) => p.playId === playId);
  if (!play) throw new Error(`${playId}가 화면 상태에 없어요`);
  return { d, pads: play.pads.map((p) => ({ pad: p.pad, x: p.x, y: p.y })) };
}

/**
 * 쉬는 모습의 사진: 이미 서 있는 자리에서 찍고, 돌이 모두 쉬는 돌로 보이는지 확인한 뒤에 남긴다.
 * 색 사진은 쉬는 돌의 채움색, 무채색 사진은 안쪽 금빛 고리가 없는 것(고리 자리가 채움만큼 밝다)을 본다.
 */
async function shotRest(page: Page, playId: string, name: string, gray = false): Promise<void> {
  const png = await page.screenshot();
  const { d, pads } = await padsOf(page, playId);
  const at = await pixelReader(png);
  const seen: string[] = [];
  const bad: string[] = [];
  for (const p of pads) {
    const c = toScreen(d, p.x, p.y);
    if (gray) {
      const ring = ringLumaOf(at, c, d.zoom);
      seen.push(`${p.pad}번 고리 자리 ${ring.toFixed(0)}`);
      if (ring < 225) bad.push(`${p.pad}번 돌에 고리 자리가 어둡다(${ring.toFixed(0)}): 쉬는 돌이 아니거나 무언가에 가렸다`);
    } else {
      const f = fillOf(at, c, d.zoom);
      seen.push(`${p.pad}번 쉬는 색 ${pct(f.rest)} ${rgbText(f.mid)}`);
      if (f.rest < GOLD_FRAC) bad.push(`${p.pad}번 돌이 쉬는 돌 색으로 보이지 않는다(${pct(f.rest)}, 가운데 값 ${rgbText(f.mid)}): 가려졌거나 밝은 상태다`);
    }
  }
  console.info(`[쉬는 모습의 사진 ${name}] ${seen.join(', ')}`);
  expect(bad, `${name}: 모든 돌이 쉬는 돌로 보인다`).toEqual([]);
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name), png);
}

interface StruckShot {
  playId: string;
  /** 출발 자리: 첫 돌의 가장자리 앞 40 px쯤. 카메라가 가운데 칸(좌우 80 px) 안에서는 멈춰 있어서 돌의 화면 자리가 변하지 않는다 */
  start: { x: number; y: number; region: string };
  /** 같은 사진에서 쉬고 있어야 하는 돌(아직 밟지 않은 돌) */
  idlePad: number;
  name: string;
  /** 색각 이상 에뮬레이션(무채색)에서는 색 대신 안쪽 금빛 고리의 어두움으로 본다 */
  gray?: boolean;
}

/** 첫 돌(1번)을 걸어서 밟는 순간, 밝아진 프레임에서 바로 찍는다. 밝은 돌이 찍히지 않으면 처음 자리로 돌아가 다시 밟는다(여섯 번까지) */
async function shotStruck(page: Page, o: StruckShot): Promise<void> {
  const tries: string[] = [];
  for (let attempt = 1; attempt <= 6; attempt++) {
    await teleportTo(page, o.start.x, o.start.y, o.start.region);
    await wait(700);
    await page.keyboard.down('ArrowRight');
    try {
      await page.waitForFunction(
        (id) => {
          const w = window as unknown as { __game: Game; __struckAt?: number };
          const d = w.__game.world.debugState();
          const hit = d?.play.find((p) => p.playId === id)?.pads.find((x) => x.pad === 1)?.state === 'struck';
          if (hit) w.__struckAt = performance.now();
          return hit;
        },
        o.playId,
        { polling: 'raf', timeout: 60000 },
      );
    } finally {
      await page.keyboard.up('ArrowRight');
    }
    const png = await page.screenshot();
    const lag = await page.evaluate(() => performance.now() - ((window as unknown as { __struckAt?: number }).__struckAt ?? 0));
    const { d, pads } = await padsOf(page, o.playId);
    const at = await pixelReader(png);
    const first = pads.find((p) => p.pad === 1)!;
    const idle = pads.find((p) => p.pad === o.idlePad)!;
    const c1 = toScreen(d, first.x, first.y);
    const c2 = toScreen(d, idle.x, idle.y);
    let ok: boolean;
    let seen: string;
    if (o.gray) {
      const a = ringLumaOf(at, c1, d.zoom);
      const b = ringLumaOf(at, c2, d.zoom);
      ok = a <= 190 && b >= 225;
      seen = `밝은 돌의 고리 자리 ${a.toFixed(0)}, 쉬는 돌 ${b.toFixed(0)}`;
    } else {
      const a = fillOf(at, c1, d.zoom);
      const b = fillOf(at, c2, d.zoom);
      ok = a.gold >= GOLD_FRAC && b.rest >= GOLD_FRAC;
      seen = `밝은 돌 금빛 ${pct(a.gold)} ${rgbText(a.mid)}, 쉬는 돌 쉬는 색 ${pct(b.rest)} ${rgbText(b.mid)}`;
    }
    tries.push(`${attempt}번째(밝아진 뒤 ${lag.toFixed(0)} ms): ${seen}`);
    if (ok) {
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, o.name), png);
      console.info(`[밟은 순간의 사진 ${o.name}] ${tries.join(' / ')}`);
      return;
    }
  }
  throw new Error(`밟은 순간의 사진에 밝은 돌이 찍히지 않았어요(${o.name}): ${tries.join(' / ')}`);
}

describe('6-9c 물방울 북(박자 강가): 걸어서 돌을 밟는다', () => {
  it(
    '위쪽 줄을 오른쪽으로 걸으면 1번, 2번 돌이 한 번씩 알려지고, 돌 위에 서 있는 동안은 다시 알려지지 않고, 내려갔다 올라서면 다시 알려진다. 소리를 켜기 전이라 오디오 장치는 없다',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await contextCount(page)).toBe(0);
      await teleportTo(page, DRUM_ROW.startX, DRUM_ROW.y, 'beat-river');
      await recordEvents(page);
      await startSampler(page);

      // 그려진 악기: 이름, 돌 네 개, 돌 위의 음 이름, 처음에는 모두 쉬는 모습
      const drawn = (await dbg(page)).play.find((p) => p.playId === DRUM)!;
      expect(drawn.name).toBe('물방울 북');
      expect(drawn.pads.map((p) => p.label)).toEqual(['C3', 'G3', 'C4', 'E4']);
      expect(drawn.pads.every((p) => p.state === 'idle')).toBe(true);
      expect(drawn.pads.map((p) => [p.x, p.y])).toEqual([[7628, 2128], [7772, 2128], [7772, 2272], [7628, 2272]]);
      const wallDrawn = (await dbg(page)).play.find((p) => p.playId === WALL)!;
      expect(wallDrawn.pads.map((p) => p.label)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4']);
      expect(await padEvents(page)).toEqual([]);

      // 오른쪽으로 걸어 1번, 2번 돌을 지난다
      await walkWhile(page, 'ArrowRight', () => padEvents(page, DRUM), (e) => e.length >= 2, '두 돌을 밟은 사건이 나간다');
      expect(await padEvents(page, DRUM)).toEqual([{ playId: DRUM, pad: 1 }, { playId: DRUM, pad: 2 }]);
      // 밟은 돌이 밝아졌다
      const seen = await until(() => padSeen(page), (s) => s.includes(`${DRUM}:1:struck`) && s.includes(`${DRUM}:2:struck`), '밟은 돌이 밝아진다', 20000);
      expect(seen.filter((k) => k.endsWith(':echo'))).toEqual([]); // 물방울 북은 메아리가 없다
      // 소리 기록: 돌의 음 하나씩(C3 = 48, G3 = 55), 메아리 없음
      const notes = (await playNotes(page)).filter((n) => n.playId === DRUM);
      expect(notes.map((n) => [n.pad, n.midi, n.velocity])).toEqual([[1, 48, 0.75], [2, 55, 0.75]]);

      // 돌 위에 서 있는 동안: 2번 돌에서 2초 서성여도 사건이 더 나가지 않는다
      const p0 = await pos(page);
      await wait(2000);
      expect((await padEvents(page, DRUM)).length).toBe(2);
      expect(Math.hypot((await pos(page)).x - p0.x, (await pos(page)).y - p0.y)).toBeLessThan(120);

      // 돌 밖으로 걸어 나갔다가 다시 올라서면 다시 알려진다
      await walkWhile(page, 'ArrowLeft', () => pos(page), (p) => p.x < DRUM_ROW.pad1 - 60, '1번 돌의 왼쪽으로 내려온다');
      const before = (await padEvents(page, DRUM)).length; // 왼쪽으로 걸으며 2번, 1번 돌을 다시 지나므로 2보다 늘 수 있다
      expect(before).toBeGreaterThanOrEqual(2);
      await wait(500);
      expect((await padEvents(page, DRUM)).length, '돌 밖에 서 있는 동안은 사건이 없다').toBe(before);
      await walkWhile(page, 'ArrowRight', () => padEvents(page, DRUM), (e) => e.length > before, '다시 올라서면 다시 알려진다');
      expect((await padEvents(page, DRUM)).at(-1)!.pad, '왼쪽에서 걸어 들어오면 처음 만나는 돌은 1번이다').toBe(1);

      // 소리를 켜기 전에는 오디오 장치가 만들어지지 않았다(W-11), 사용 기록·찾은 목록에는 남지 않았다
      expect(await contextCount(page)).toBe(0);
      expect((await mixerState(page)).state).toBe('off');
      const side = await page.evaluate(() => {
        const g = (window as unknown as { __game: { found: { store: { get(): ReadonlySet<string> } }; usageLog: { snapshot(): { events: Array<{ type?: string; kind?: string }> } } } }).__game;
        return { found: g.found.store.get().size, log: JSON.stringify(g.usageLog.snapshot().events) };
      });
      expect(side.found).toBe(0);
      expect(side.log).not.toMatch(/pad|play\./);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '아래쪽 줄(4번, 3번 돌)과 돌 사이의 줄은 번호가 파일의 차례를 따르고, 돌 사이를 걸으면 아무것도 알려지지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      await teleportTo(page, DRUM_ROW.startX, 2272, 'beat-river');
      await recordEvents(page);
      await walkWhile(page, 'ArrowRight', () => padEvents(page, DRUM), (e) => e.length >= 2, '아래쪽 줄의 두 돌을 밟는다');
      expect((await padEvents(page, DRUM)).map((e) => e.pad)).toEqual([4, 3]);
      // 가운데 줄(y 2200)은 두 줄의 돌 모두에서 72 px 떨어져 있어 어느 돌도 밟지 않는다
      await teleportTo(page, DRUM_ROW.startX, 2200, 'beat-river');
      await recordEvents(page);
      const x0 = (await pos(page)).x;
      await walkWhile(page, 'ArrowRight', () => pos(page), (p) => p.x > x0 + 380, '돌 사이로 걸어 지나간다');
      expect(await padEvents(page)).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-9c 소리를 켠 뒤: 돌을 밟으면 진짜 오디오 출력에 소리가 실린다', () => {
  it(
    '물방울 북: 소리를 켜기 전에는 오디오 장치가 없고, 켜면 생기며, 돌을 밟은 순간 출력이 지역 바탕 소리 위로 솟는다',
    async () => {
      const { ctx, page, errors } = await boot();
      expect(await contextCount(page)).toBe(0);
      await turnSoundOn(page);
      expect((await mixerState(page)).state).toBe('on');
      expect(await contextCount(page)).toBeGreaterThan(0);
      await recordEvents(page);
      const tries = await strikeLift(page, DRUM_ROW.startX, DRUM_ROW.y, 'beat-river');
      const good = tries.find(isLifted);
      expect(good, `끊기지 않은 시도에서 밟은 순간의 출력이 바탕 위로 솟는다: ${JSON.stringify(tries)}`).toBeDefined();
      expect(good!.strike, '귀가 아플 만큼 크지 않다(기준 기기의 값은 손 점검의 몫)').toBeLessThan(1);
      const notes = (await playNotes(page)).filter((n) => n.playId === DRUM);
      expect(notes[0]).toMatchObject({ pad: 1, midi: 48, velocity: 0.75 });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '소리를 켠 채 음소거하면 돌을 밟아도 새 소리가 시작되지 않고, 풀면 다시 난다',
    async () => {
      const { ctx, page, errors } = await boot();
      await turnSoundOn(page);
      await teleportTo(page, DRUM_ROW.startX, DRUM_ROW.y, 'beat-river');
      await recordEvents(page);
      await page.evaluate(() => (window as unknown as { __game: { mixer: { setMuted(m: boolean): void } } }).__game.mixer.setMuted(true));
      expect((await mixerState(page)).muted).toBe(true);
      await until(
        async () => {
          const a = await oscStarts(page);
          await wait(1500);
          return (await oscStarts(page)) - a;
        },
        (d) => d === 0,
        '음소거 뒤 소리가 가라앉는다',
        90000,
      );
      const starts = await oscStarts(page);
      await walkWhile(page, 'ArrowRight', () => padEvents(page, DRUM), (e) => e.length >= 2, '두 돌을 밟는다');
      await wait(800);
      expect(await oscStarts(page), '음소거 중에는 새 소리가 시작되지 않는다').toBe(starts);
      expect((await padEvents(page, DRUM)).length).toBeGreaterThanOrEqual(2);
      // 풀면 다시 난다: 바탕이 돌아온 뒤(다음 마디 시작에 예약이 다시 선다) 돌을 밟으면 출력이 바탕 위로 솟는다
      await page.evaluate(() => (window as unknown as { __game: { mixer: { setMuted(m: boolean): void } } }).__game.mixer.setMuted(false));
      expect((await mixerState(page)).muted).toBe(false);
      await wait(4000);
      const tries = await strikeLift(page, DRUM_ROW.startX, DRUM_ROW.y, 'beat-river');
      expect(tries.find(isLifted), `풀고 나서 밟으면 소리가 다시 난다: ${JSON.stringify(tries)}`).toBeDefined();
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-9c 메아리 벽(종나무 숲): 다섯 돌과 한 박 뒤의 메아리', () => {
  it(
    '벽 아래 줄을 오른쪽으로 걸으면 1~5번 돌을 차례로 밟는다. 돌마다 소리 둘(바로, 한 박 뒤 절반 세기)이 기록되고, 같은 돌에 한 박 뒤에 고리가 비친다. 소리를 켜기 전이라 오디오 장치는 없다',
    async () => {
      const { ctx, page, errors } = await boot();
      await teleportTo(page, WALL_ROW.startX, WALL_ROW.y, 'bell-grove');
      await recordEvents(page);
      await startSampler(page);
      const drawn = (await dbg(page)).play.find((p) => p.playId === WALL)!;
      expect(drawn.name).toBe('메아리 벽');
      expect(drawn.pads.map((p) => [p.x, p.y])).toEqual(WALL_ROW.pads.map((x) => [x, 710]));

      await walkWhile(page, 'ArrowRight', () => padEvents(page, WALL), (e) => e.length >= 5, '다섯 돌을 모두 밟는다');
      expect((await padEvents(page, WALL)).map((e) => e.pad)).toEqual([1, 2, 3, 4, 5]);
      // 소리 기록: 돌마다 둘. 첫째는 바로(0.75 세기), 둘째는 한 박(0.75초) 뒤에 절반 세기(0.375)
      const notes = (await playNotes(page)).filter((n) => n.playId === WALL);
      expect(notes.map((n) => n.pad).sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
      for (const pad of [1, 2, 3, 4, 5]) {
        const pair = notes.filter((n) => n.pad === pad).sort((a, b) => a.time - b.time);
        expect(pair[0]).toMatchObject({ velocity: 0.75 });
        expect(pair[1]).toMatchObject({ velocity: 0.375, midi: pair[0]!.midi });
        expect(pair[1]!.time - pair[0]!.time).toBeCloseTo(0.75, 6);
      }
      expect([...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b)).toEqual([60, 62, 64, 67, 69]);
      // 밟은 돌이 밝아졌고, 한 박 뒤에 같은 돌에 메아리 고리가 비쳤다(소리를 못 듣는 사람도 본다)
      const seen = await until(() => padSeen(page), (s) => s.some((k) => k.startsWith(`${WALL}:`) && k.endsWith(':echo')), '메아리 고리가 비친다', 30000);
      for (const pad of [1, 2, 3, 4, 5]) expect(seen, `${pad}번 돌이 밝아졌다`).toContain(`${WALL}:${pad}:struck`);
      expect(await contextCount(page)).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '소리를 켜면 메아리 벽의 첫 돌을 밟은 순간 출력이 지역 바탕 소리 위로 솟고, 소리 기록에는 바로 낸 소리와 한 박 뒤의 절반 세기 소리가 있다. 오류가 없다',
    async () => {
      const { ctx, page, errors } = await boot();
      await turnSoundOn(page);
      await recordEvents(page);
      const tries = await strikeLift(page, WALL_ROW.startX, WALL_ROW.y, 'bell-grove');
      const good = tries.find(isLifted);
      expect(good, `끊기지 않은 시도에서 밟은 순간의 출력이 바탕 위로 솟는다: ${JSON.stringify(tries)}`).toBeDefined();
      expect(good!.strike).toBeLessThan(1);
      // 소리 기록: 첫 돌에서 바로(0.75), 한 박 뒤(0.375). 시도마다 첫 돌을 한 번씩 밟았다
      const first = (await playNotes(page)).filter((n) => n.playId === WALL && n.pad === 1).sort((a, b) => a.time - b.time);
      expect(first.length).toBeGreaterThanOrEqual(2);
      expect(first[0]).toMatchObject({ velocity: 0.75, midi: 60 });
      expect(first[1]).toMatchObject({ velocity: 0.375, midi: 60 });
      expect(first[1]!.time - first[0]!.time).toBeCloseTo(0.75, 6);
      expect((await sound(page)).running).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-9c 움직임 줄이기(9.7)', () => {
  it(
    '움직임 줄이기에서도 밟은 돌이 밝아지고 메아리 고리가 비친다(번지는 고리만 빠진다)',
    async () => {
      const { ctx, page, errors } = await boot({ reduced: true });
      await teleportTo(page, WALL_ROW.startX, WALL_ROW.y, 'bell-grove');
      await recordEvents(page);
      await startSampler(page);
      await walkWhile(page, 'ArrowRight', () => padEvents(page, WALL), (e) => e.length >= 5, '다섯 돌을 밟는다');
      const seen = await until(() => padSeen(page), (s) => s.some((k) => k.endsWith(':echo')) && s.some((k) => k.endsWith(':struck')), '밝아지고 메아리 고리가 비친다', 30000);
      expect(seen.some((k) => k.startsWith(`${WALL}:`) && k.endsWith(':struck'))).toBe(true);
      expect(seen.some((k) => k.startsWith(`${WALL}:`) && k.endsWith(':echo'))).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

/** 첫 돌의 가장자리 앞 40 px쯤에서 출발한다(그림 사진을 찍는 자리). 첫 돌: 메아리 벽 (392, 710)·물방울 북 (7628, 2128), 반지름 44 */
const WALL_SHOT_START = { x: WALL_ROW.startX, y: WALL_ROW.y, region: 'bell-grove' };
const DRUM_SHOT_START = { x: 7545, y: DRUM_ROW.y, region: 'beat-river' };

describe('6-9c 눈으로 보는 점검 자료: 쉬는 모습과 밟은 순간의 사진', () => {
  it(
    '색 사진: 두 악기의 쉬는 모습과 밟은 순간을 남긴다(그림 점으로 돌이 보이는지 확인한 뒤에 남긴다)',
    async () => {
      const { ctx, page, errors } = await boot();
      await teleportTo(page, WALL_SHOT_START.x, WALL_SHOT_START.y, WALL_SHOT_START.region);
      await wait(600);
      await shotRest(page, WALL, 'phase6-play-wall-rest.png');
      await shotStruck(page, { playId: WALL, start: WALL_SHOT_START, idlePad: 5, name: 'phase6-play-wall-struck.png' });
      // 물방울 북은 아래쪽(돌 셋째·넷째 쪽)에서 바라본 모습: 네 돌이 모두 보여야 한다
      await teleportTo(page, 7700, 2330, 'beat-river');
      await wait(600);
      await shotRest(page, DRUM, 'phase6-play-drum-rest.png');
      await shotStruck(page, { playId: DRUM, start: DRUM_SHOT_START, idlePad: 4, name: 'phase6-play-drum-struck.png' });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '색을 구별하지 못해도 돌이 보인다: 색각 이상 에뮬레이션(achromatopsia)에서 두 악기의 쉬는 모습과 밟은 순간을 남긴다(안쪽 금빛 고리가 단서)',
    async () => {
      const { ctx, page, errors } = await boot();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
      await teleportTo(page, WALL_SHOT_START.x, WALL_SHOT_START.y, WALL_SHOT_START.region);
      await wait(600);
      await shotRest(page, WALL, 'phase6-play-wall-gray-rest.png', true);
      await shotStruck(page, { playId: WALL, start: WALL_SHOT_START, idlePad: 5, name: 'phase6-play-wall-gray-struck.png', gray: true });
      await teleportTo(page, 7700, 2330, 'beat-river');
      await wait(600);
      await shotRest(page, DRUM, 'phase6-play-drum-gray-rest.png', true);
      await shotStruck(page, { playId: DRUM, start: DRUM_SHOT_START, idlePad: 4, name: 'phase6-play-drum-gray-struck.png', gray: true });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

/** 7-4의 새 놀이 악기 셋. 돌 줄에 닿는 길을 걸어서 첫 돌을 밟는다: 미끄럼길은 아래에서 위로, 바람개비 줄과 연잎 합창은 왼쪽에서 오른쪽으로 */
interface NewPlay {
  playId: string;
  name: string;
  region: string;
  ground: 'slope' | 'rope' | 'lilies';
  /** 첫 돌에서 120 px쯤 떨어진 출발 자리와 걷는 방향 */
  start: { x: number; y: number };
  key: 'ArrowRight' | 'ArrowUp';
}
const NEW_PLAYS: NewPlay[] = [
  { playId: SLIDE, name: '높낮이 미끄럼길', region: 'staff-hill', ground: 'slope', start: { x: 3300, y: 840 }, key: 'ArrowUp' },
  { playId: PINWHEELS, name: '바람개비 줄', region: 'scale-trail', ground: 'rope', start: { x: 6200, y: 4540 }, key: 'ArrowRight' },
  { playId: LILIES, name: '연잎 합창', region: 'key-marsh', ground: 'lilies', start: { x: 3590, y: 5060 }, key: 'ArrowRight' },
];

describe('7-4 새 놀이 악기 셋: 걸어서 돌을 밟으면 번호가 알려지고 그 돌의 음이 난다(목표도 판정도 기록도 없다)', () => {
  it(
    '높낮이 미끄럼길(오선 언덕): 비탈을 따라 위로 걸으면 1~5번 돌을 차례로 밟는다. 바닥은 비탈이고, 소리 기록은 아래에서 위로 C4 D4 E4 G4 A4이다. 소리를 켜기 전이라 오디오 장치는 없다',
    async () => {
      const { ctx, page, errors } = await boot();
      await teleportTo(page, 3300, 840, 'staff-hill');
      await recordEvents(page);
      const drawn = (await dbg(page)).play.find((p) => p.playId === SLIDE)!;
      expect(drawn.name).toBe('높낮이 미끄럼길');
      expect(drawn.ground).toBe('slope');
      expect(drawn.pads.map((p) => [p.x, p.y, p.midi, p.label])).toEqual([
        [3300, 720, 60, 'C4'],
        [3300, 610, 62, 'D4'],
        [3300, 500, 64, 'E4'],
        [3300, 390, 67, 'G4'],
        [3300, 280, 69, 'A4'],
      ]);
      await walkWhile(page, 'ArrowUp', () => padEvents(page, SLIDE), (e) => e.length >= 5, '다섯 돌을 모두 밟는다');
      expect((await padEvents(page, SLIDE)).map((e) => e.pad)).toEqual([1, 2, 3, 4, 5]);
      const notes = (await playNotes(page)).filter((n) => n.playId === SLIDE);
      expect(notes.map((n) => [n.pad, n.midi, n.velocity])).toEqual([[1, 60, 0.75], [2, 62, 0.75], [3, 64, 0.75], [4, 67, 0.75], [5, 69, 0.75]]);
      expect(await contextCount(page)).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '바람개비 줄(음계 길): 줄을 따라 오른쪽으로 걸으면 1~5번 돌을 차례로 밟는다. 바닥은 밧줄이고, 소리 기록은 C4 D4 E4 G4 A4이다',
    async () => {
      const { ctx, page, errors } = await boot();
      await teleportTo(page, 6200, 4540, 'scale-trail');
      await recordEvents(page);
      const drawn = (await dbg(page)).play.find((p) => p.playId === PINWHEELS)!;
      expect(drawn.name).toBe('바람개비 줄');
      expect(drawn.ground).toBe('rope');
      expect(drawn.pads.map((p) => [p.x, p.y, p.midi])).toEqual([[6330, 4540, 60], [6440, 4540, 62], [6550, 4540, 64], [6660, 4540, 67], [6770, 4540, 69]]);
      await walkWhile(page, 'ArrowRight', () => padEvents(page, PINWHEELS), (e) => e.length >= 5, '다섯 돌을 모두 밟는다');
      expect((await padEvents(page, PINWHEELS)).map((e) => e.pad)).toEqual([1, 2, 3, 4, 5]);
      const notes = (await playNotes(page)).filter((n) => n.playId === PINWHEELS);
      expect(notes.map((n) => [n.pad, n.midi, n.velocity])).toEqual([[1, 60, 0.75], [2, 62, 0.75], [3, 64, 0.75], [4, 67, 0.75], [5, 69, 0.75]]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );

  it(
    '연잎 합창(건반 늪): 돌 다섯이 연못에 오각형으로 놓여 있다. 위쪽 돌(1번), 가운데 줄(5번, 2번), 아래 줄(4번, 3번)을 오른쪽으로 걸어 모두 밟는다. 바닥은 연못이다',
    async () => {
      const { ctx, page, errors } = await boot();
      await teleportTo(page, 3590, 5060, 'key-marsh');
      await recordEvents(page);
      const drawn = (await dbg(page)).play.find((p) => p.playId === LILIES)!;
      expect(drawn.name).toBe('연잎 합창');
      expect(drawn.ground).toBe('lilies');
      expect(drawn.pads.map((p) => [p.x, p.y, p.midi])).toEqual([[3720, 5060, 60], [3834, 5143, 62], [3791, 5277, 64], [3649, 5277, 67], [3606, 5143, 69]]);
      // 세 줄을 차례로 걷는다: y 5060에는 1번 돌만, y 5143에는 5번과 2번 돌이, y 5277에는 4번과 3번 돌이 놓여 있다
      for (const [y, count] of [[5060, 1], [5143, 3], [5277, 5]] as const) {
        await teleportTo(page, 3476, y, 'key-marsh');
        await walkWhile(page, 'ArrowRight', () => padEvents(page, LILIES), (e) => e.length >= count, `y ${y}의 돌을 밟는다`);
      }
      expect((await padEvents(page, LILIES)).map((e) => e.pad)).toEqual([1, 5, 2, 4, 3]);
      const notes = (await playNotes(page)).filter((n) => n.playId === LILIES);
      expect(notes.map((n) => [n.pad, n.midi])).toEqual([[1, 60], [5, 69], [2, 62], [4, 67], [3, 64]]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-4 새 놀이 악기 셋: 소리를 켜면 돌을 밟은 순간 출력이 지역 바탕 소리 위로 솟는다', () => {
  for (const inst of NEW_PLAYS) {
    it(
      `${inst.name}(${inst.region}): 첫 돌을 밟은 순간의 출력이 지역 바탕 소리 위로 솟는다. 오류가 없다`,
      async () => {
        const { ctx, page, errors } = await boot();
        await turnSoundOn(page);
        await recordEvents(page);
        const tries = await strikeLift(page, inst.start.x, inst.start.y, inst.region, inst.key);
        const good = tries.find(isLifted);
        expect(good, `끊기지 않은 시도에서 밟은 순간의 출력이 바탕 위로 솟는다: ${JSON.stringify(tries)}`).toBeDefined();
        expect(good!.strike, '귀가 아플 만큼 크지 않다(기준 기기의 값은 손 점검의 몫)').toBeLessThan(1);
        const notes = (await playNotes(page)).filter((n) => n.playId === inst.playId);
        expect(notes[0]).toMatchObject({ pad: 1, midi: 60, velocity: 0.75 });
        expect((await sound(page)).running).toBe(true);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});

describe('6-9c, 7-4 지도: 발견 위치 표시를 켜면 다섯 악기가 이름과 함께 보인다', () => {
  it(
    '꺼져 있으면 악기 표식이 없고, 켜면 다섯 악기(지역 차례)가 나타난다. 이름은 처음부터 읽히고, 표식은 지도 안에 있고, 소리 조각·쪽지 표식(54)에 세지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      await page.evaluate(() => {
        (window as unknown as { location: Location }).location.hash = '#/map';
      });
      await page.waitForSelector('[data-map-surface]', { state: 'visible' });
      expect(await page.locator('[data-play]').count()).toBe(0);
      await page.evaluate(() => (window as unknown as { __game: { settings: { update(fn: (s: Record<string, unknown>) => Record<string, unknown>): void } } }).__game.settings.update((s) => ({ ...s, showDiscoveries: true })));
      await page.waitForSelector('[data-play]', { state: 'attached' });
      const marks = await page.evaluate(() => {
        const surface = document.querySelector('[data-map-surface]')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('[data-play]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.getAttribute('data-play'), label: el.getAttribute('aria-label'), inside: r.left >= surface.left - 1 && r.right <= surface.right + 1 && r.top >= surface.top - 1 && r.bottom <= surface.bottom + 1, width: r.width };
        });
      });
      expect(marks.map((m) => [m.id, m.label])).toEqual([
        [SLIDE, '놀이 악기: 높낮이 미끄럼길'],
        [DRUM, '놀이 악기: 물방울 북'],
        [WALL, '놀이 악기: 메아리 벽'],
        [PINWHEELS, '놀이 악기: 바람개비 줄'],
        [LILIES, '놀이 악기: 연잎 합창'],
      ]);
      for (const m of marks) {
        expect(m.inside, `${m.id}가 지도 안에 있다`).toBe(true);
        expect(m.width).toBeGreaterThanOrEqual(18);
      }
      expect(await page.locator('[data-find]').count()).toBe(ITEMS.length);
      expect(await page.locator('[data-find-legend]').innerText()).toContain('놀이 악기');
      await shot(page, 'phase6-play-map.png');
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
