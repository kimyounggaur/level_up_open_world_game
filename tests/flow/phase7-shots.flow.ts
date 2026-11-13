// 7-4 눈으로 보는 점검 자료(실제 Chrome의 사진): 새 놀이 악기 셋(높낮이 미끄럼길, 바람개비 줄, 연잎 합창)의 쉬는 모습과 세 지역의 표지(음자리표 풍향계, 정자, 기준음 탑).
// 사진을 파일로 남기기 전에 그림 점으로 확인한다: 새 악기의 돌이 하나하나 쉬는 돌 색으로 보이는지(나무 잎이나 사물에 가려지지 않았는지),
// 악기의 바닥 그림(비탈, 밧줄과 바람개비, 연못과 연잎)이 돌 둘레에 칠해져 있는지, 세 표지가 그 자리의 화면에 들어오는지.
// 이것은 사람의 눈 점검을 대신하지 않는다(docs/approvals.md의 '사람 확인 대기'). 사진은 docs/verification/screens/에 남는다.
// 먼저 `npm run build`가 필요하다(dist를 연다).
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { command, dbg, pos, status, toScreen } from './game';
import type { DrawnPlay } from './game';
import { startHarness, type Harness } from './harness';
import { fillOf, pct, pixelReader, rgbText } from './shotTools';
import { boot as bootWith, until, wait } from './soundTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 240_000;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const boot = () => bootWith(h);
/** 쉬는 돌의 채움색으로 보이는 점의 비율이 이 값 아래면 그 돌은 가려졌다고 본다(6-9c와 같은 기준) */
const REST_FRACTION = 0.85;
/** 화면 위쪽의 메뉴 띠(지도, 목록, 수첩, 소리 켜기, 도움, 설정과 지역 이름)가 덮는 높이와 여유. 이 아래에 있어야 돌이 사진에서 보인다 */
const TOP_STRIP = 90;

const save = (name: string, png: Buffer): void => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name), png);
};

/**
 * around에서 offsets만큼 떨어진 자리에 차례로 서 본다. 걸을 수 없는 자리면 캐릭터가 그 자리에 서지 않으니 다음 후보로 간다.
 * keepAway가 주어지면 그 점들(돌의 가운데)에서 minGap 안인 자리는 고르지 않는다(캐릭터가 돌 위에 서서 돌을 밟거나 가리지 않게).
 */
async function standNear(page: Page, around: { x: number; y: number }, region: string, keepAway: () => Promise<Array<{ x: number; y: number }>>, minGap: number): Promise<{ x: number; y: number }> {
  const OFFSETS: ReadonlyArray<readonly [number, number]> = [
    [0, 0], [-190, 0], [190, 0], [0, 190], [0, -190], [-190, 190], [190, 190], [-190, -190], [190, -190],
    [-280, 0], [280, 0], [0, 280], [0, -280], [-280, 280], [280, 280], [-280, -280], [280, -280],
  ];
  const tried: string[] = [];
  for (const [dx, dy] of OFFSETS) {
    const x = around.x + dx;
    const y = around.y + dy;
    await command(page, { type: 'teleport', x, y });
    await wait(500);
    const p = await pos(page);
    if (Math.hypot(p.x - x, p.y - y) > 60) {
      tried.push(`(${x}, ${y}) 걸을 수 없음`);
      continue;
    }
    await until(() => status(page), (s) => s.regionId === region && s.ready, `${region}에 들어선다`, 20000);
    await until(() => dbg(page), (d) => d.pending.length === 0, '바닥 조각이 올라온다', 30000);
    const near = (await keepAway()).filter((k) => Math.hypot(k.x - p.x, k.y - p.y) < minGap);
    if (near.length > 0) {
      tried.push(`(${x}, ${y}) 돌 곁`);
      continue;
    }
    return { x: p.x, y: p.y };
  }
  throw new Error(`${around.x}, ${around.y} 둘레에 설 자리를 찾지 못했어요: ${tried.join(', ')}`);
}

const padsOfPlay = async (page: Page, playId: string): Promise<DrawnPlay | undefined> => (await dbg(page)).play.find((p) => p.playId === playId);

interface PlayShot {
  playId: string;
  region: string;
  /** 설계서 3.5를 따라 정한 악기의 가운데(content/discoveries/<지역>.json의 playInstruments) */
  center: { x: number; y: number };
  ground: DrawnPlay['ground'];
  pads: number;
  name: string;
}
const PLAY_SHOTS: PlayShot[] = [
  { playId: 'play.staff-hill.pitch-slide', region: 'staff-hill', center: { x: 3300, y: 500 }, ground: 'slope', pads: 5, name: 'phase7-play-slide-rest.png' },
  { playId: 'play.scale-trail.pinwheels', region: 'scale-trail', center: { x: 6550, y: 4540 }, ground: 'rope', pads: 5, name: 'phase7-play-pinwheels-rest.png' },
  { playId: 'play.key-marsh.lily-chorus', region: 'key-marsh', center: { x: 3720, y: 5180 }, ground: 'lilies', pads: 5, name: 'phase7-play-lilies-rest.png' },
];

describe('7-4 새 놀이 악기 셋의 쉬는 모습(사진)', () => {
  for (const s of PLAY_SHOTS) {
    it(
      `${s.playId}: 돌 ${s.pads}개가 모두 쉬는 돌 색으로 보이고 바닥(${s.ground})이 그려져 있다. 그 사진을 남긴다`,
      async () => {
        const { ctx, page, errors } = await boot();
        await standNear(page, s.center, s.region, async () => (await padsOfPlay(page, s.playId))?.pads ?? [], 90);
        await wait(800);
        const png = await page.screenshot();
        const d = await dbg(page);
        const play = d.play.find((p) => p.playId === s.playId);
        expect(play, `${s.playId}가 화면 상태에 있다`).toBeDefined();
        expect(play!.ground).toBe(s.ground);
        expect(play!.pads).toHaveLength(s.pads);
        const at = await pixelReader(png);
        const seen: string[] = [];
        const bad: string[] = [];
        for (const p of play!.pads) {
          const c = toScreen(d, p.x, p.y);
          const inView = c.x > 30 && c.x < d.size.width - 30 && c.y > TOP_STRIP && c.y < d.size.height - 30;
          const f = fillOf(at, c, d.zoom);
          seen.push(`${p.pad}번 ${p.label} 쉬는 색 ${pct(f.rest)} ${rgbText(f.mid)}${inView ? '' : ' (화면 밖)'}`);
          if (!inView) bad.push(`${p.pad}번 돌이 화면 안에 들어오지 않는다`);
          else if (f.rest < REST_FRACTION) bad.push(`${p.pad}번 돌이 쉬는 돌 색으로 보이지 않는다(${pct(f.rest)}, 가운데 값 ${rgbText(f.mid)}): 가려졌거나 밝은 상태다`);
        }
        console.info(`[7-4 사진 ${s.name}] 화면 배율 ${d.zoom}, ${seen.join(', ')}`);
        expect(bad, `${s.name}: 모든 돌이 보인다`).toEqual([]);
        save(s.name, png);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});

interface LandmarkShot {
  what: string;
  region: string;
  /** 설계서 3.5의 표지 자리(content/regions/<지역>.json의 landmark) */
  at: { x: number; y: number };
  name: string;
}
const LANDMARK_SHOTS: LandmarkShot[] = [
  { what: '음자리표 풍향계', region: 'staff-hill', at: { x: 4056, y: 220 }, name: 'phase7-landmark-weathervane.png' },
  { what: '정자', region: 'scale-trail', at: { x: 7200, y: 5600 }, name: 'phase7-landmark-gazebo.png' },
  { what: '기준음 탑', region: 'key-marsh', at: { x: 2300, y: 5750 }, name: 'phase7-landmark-tower.png' },
];

describe('7-4 세 지역의 표지(사진)', () => {
  for (const s of LANDMARK_SHOTS) {
    it(
      `${s.what}: 표지 둘레에 서면 표지가 화면 안에 들어온다. 그 사진을 남긴다`,
      async () => {
        const { ctx, page, errors } = await boot();
        await standNear(page, s.at, s.region, async () => [], 0);
        await wait(800);
        const png = await page.screenshot();
        const d = await dbg(page);
        const c = toScreen(d, s.at.x, s.at.y);
        console.info(`[7-4 사진 ${s.name}] 표지의 화면 자리 (${c.x.toFixed(0)}, ${c.y.toFixed(0)}), 화면 배율 ${d.zoom}, 화면 ${d.size.width}×${d.size.height}`);
        expect(c.x, '표지가 화면 가로 안에 있다').toBeGreaterThan(0);
        expect(c.x).toBeLessThan(d.size.width);
        expect(c.y, '표지가 화면 세로 안에 있다').toBeGreaterThan(0);
        expect(c.y).toBeLessThan(d.size.height);
        save(s.name, png);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});
