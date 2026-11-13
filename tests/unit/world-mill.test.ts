// 6-6 물레방아(E4)가 서는 방앗간 웅덩이의 바닥: 막힌 칸과 구운 그림이 같은 자리인지, 바퀴와 띠가 물 안에 드는지,
// 서는 자리(정거장 E4)가 걸어서 닿는지, 둘레길이 막히지 않는지. 3.8: 보이지 않는 벽을 쓰지 않는다 — 막힌 칸은 모두 물(또는 물가) 그림이다.
import path from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { laneOf, laneRect } from '../../src/domain/timelineStones';
import { slotBounds } from '../../src/domain/installation';
import { wheelOf } from '../../src/domain/waterwheel';
import { BODY_RADIUS, CHUNK_PAD, CHUNK_SIZE, PLAYER_START, TILE, WorldMap, standOf } from '../../src/domain/world';
import { NAV_ROWS } from '../../src/world/generated/worldData';
import { NavGrid, findPath, moveCircle, reachableFrom } from '../../src/world/nav';
import { WORLD_PUBLIC_DIR, loadRegionDefs } from '../../tools/world-files';
import { MILL_PONDS, millPondColliders, millPondSvg, outerRoads } from '../../world-src/outer';
import { COLOR } from '../../world-src/palette';
import { installation } from './controller-rig';

const root = path.resolve(__dirname, '../..');
const map = new WorldMap(loadRegionDefs(root));
const grid = NavGrid.fromRows(NAV_ROWS);
const E4 = MILL_PONDS.find((p) => p.stationId === 'E4')!;
const inst = installation('inst.beat-river.waterwheel');
const wheel = wheelOf(inst)!;
const lane = laneOf(inst)!;

const cellsOf = (r: { x: number; y: number; w: number; h: number }): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let cy = r.y / TILE; cy < (r.y + r.h) / TILE; cy++) for (let cx = r.x / TILE; cx < (r.x + r.w) / TILE; cx++) out.push([cx, cy]);
  return out;
};

describe('방앗간 웅덩이의 자리와 크기', () => {
  it('웅덩이는 하나: E4, x 5696–6400, y 2080–2592(704 × 512 px)', () => {
    expect(MILL_PONDS.map((p) => p.stationId)).toEqual(['E4']);
    expect(E4).toMatchObject({ x: 5696, y: 2080, w: 704, h: 512 });
  });

  it('칸(32 px)의 경계에 맞는다: 그림과 막힌 칸이 같다', () => {
    for (const v of [E4.x, E4.y, E4.w, E4.h]) expect(v % TILE).toBe(0);
  });

  it('바퀴 전체가 웅덩이 안에 든다(지름 480 px, 가장자리에 16 px씩 물이 남는다)', () => {
    expect(E4.wheel).toEqual({ cx: wheel.cx, cy: wheel.cy, r: wheel.r });
    expect(wheel.cx - wheel.r).toBeGreaterThanOrEqual(E4.x);
    expect(wheel.cx + wheel.r).toBeLessThanOrEqual(E4.x + E4.w);
    expect(wheel.cy - wheel.r).toBeGreaterThanOrEqual(E4.y);
    expect(wheel.cy + wheel.r).toBeLessThanOrEqual(E4.y + E4.h);
    expect(E4.x + E4.w - (wheel.cx + wheel.r)).toBe(16);
    expect(wheel.cy - wheel.r - E4.y).toBe(16);
    expect(E4.y + E4.h - (wheel.cy + wheel.r)).toBe(16);
  });

  it('펼친 띠와 박 번호가 놓이는 자리(slotBounds)가 모두 물 안에 든다', () => {
    const b = slotBounds(inst);
    expect(b.x).toBeGreaterThanOrEqual(E4.x);
    expect(b.y).toBeGreaterThanOrEqual(E4.y);
    expect(b.x + b.w).toBeLessThanOrEqual(E4.x + E4.w);
    expect(b.y + b.h).toBeLessThanOrEqual(E4.y + E4.h);
  });

  it('박 말뚝은 띠의 박 경계와 같은 간격이다: 큰 박 하나가 240 px이고 첫 칸이 띠와 같은 자리에서 시작한다', () => {
    expect(E4.laneStart).toBe(lane.start);
    expect(E4.laneX).toBe(lane.cross);
    expect(E4.laneW).toBe(lane.crossSize);
    expect(E4.beatPx).toBe(1440 / lane.ticksPerPx);
    expect(E4.beats * E4.beatPx).toBe(lane.laneTicks / lane.ticksPerPx);
    const r = laneRect(lane, 0, lane.laneTicks);
    expect([r.x, r.y, r.w, r.h]).toEqual([E4.laneX, E4.laneStart, E4.laneW, E4.beats * E4.beatPx]);
  });

  it('동쪽 가장자리는 정거장(6450, 2300)과 둘레길(x 6408 이후) 앞에서 멈춘다', () => {
    const st = map.stations.find((s) => s.stationId === 'E4')!;
    expect([st.x, st.y]).toEqual([6450, 2300]);
    expect(st.x - (E4.x + E4.w)).toBe(50);
  });
});

describe('충돌 사각형', () => {
  it('웅덩이는 사각형 하나로 막는다', () => {
    expect(millPondColliders()).toEqual([{ kind: 'rect', x: 5696, y: 2080, w: 704, h: 512, note: 'E4 방앗간 웅덩이' }]);
  });

  it('그림에는 웅덩이의 물과 박 말뚝 세 쌍(= 12개 조각)이 있다', () => {
    const svg = millPondSvg();
    expect(svg.split(`fill="${COLOR.water}"`).length - 1).toBe(1);
    expect(svg.split(`fill="${COLOR.plankLine}"`).length - 1).toBe((E4.beats + 1) * 2);
    expect(svg.split(`fill="${COLOR.plank}"`).length - 1).toBe((E4.beats + 1) * 2);
    // 말뚝은 띠 양옆에 선다: 서쪽은 띠 왼쪽 30 px, 동쪽은 띠 오른쪽 끝에서 30 px
    expect(svg).toContain(`<rect x="${E4.laneX - 30}" y="${E4.laneStart - 6}" width="30" height="12"`);
    expect(svg).toContain(`<rect x="${E4.laneX + E4.laneW}" y="${E4.laneStart + E4.beatPx - 6}" width="30" height="12"`);
  });
});

describe('굽힌 충돌 격자', () => {
  it('웅덩이의 모든 칸이 막혀 있다(바퀴와 띠 위로는 걸어 들어갈 수 없다: 악기다)', () => {
    for (const [cx, cy] of cellsOf(E4)) expect(grid.isBlockedCell(cx, cy), `칸 ${cx},${cy}`).toBe(true);
  });

  it('웅덩이 둘레의 한 칸은 막히지 않았다: 가장자리에서 바로 걸을 수 있다(동쪽과 북쪽과 남쪽)', () => {
    const east = E4.x + E4.w;
    for (let y = E4.y + 16; y < E4.y + E4.h; y += TILE) expect(grid.isBlockedPoint(east + 16, y), `동쪽 ${y}`).toBe(false);
    for (let x = E4.x + 64; x < E4.x + E4.w - 64; x += TILE) {
      expect(grid.isBlockedPoint(x, E4.y - 16), `북쪽 ${x}`).toBe(false);
      expect(grid.isBlockedPoint(x, E4.y + E4.h + 16), `남쪽 ${x}`).toBe(false);
    }
  });

  it('정거장 E4의 서는 자리는 마른 땅이고 시작 위치에서 걸어 닿는다', () => {
    const e4 = map.stations.find((s) => s.stationId === 'E4')!;
    const st = standOf(e4);
    expect(st).toEqual({ x: 6450, y: 2300 });
    expect(grid.circleHitsBlocked(st.x, st.y)).toBe(false);
    const reach = reachableFrom(grid, PLAYER_START);
    const c = grid.cellOf(st.x, st.y);
    expect(reach[c.cy * grid.cols + c.cx]).toBe(1);
    expect(findPath(grid, PLAYER_START, st)).not.toBeNull();
  });

  it('서는 자리에서 서쪽으로 걸으면 웅덩이 앞에서 멈춘다. 물 위로는 들어갈 수 없다', () => {
    const start = { x: 6450, y: 2300 };
    const end = moveCircle(grid, start, -400, 0);
    expect(end.x).toBeLessThan(start.x);
    expect(end.x - BODY_RADIUS).toBeGreaterThanOrEqual(E4.x + E4.w - 1);
    // 바퀴 한가운데를 눌러도 물 위로는 가지 못하고, 가장 가까운 갈 수 있는 곳(웅덩이 둑)으로 바뀐다
    expect(grid.circleHitsBlocked(wheel.cx, wheel.cy)).toBe(true);
    const tap = findPath(grid, start, { x: wheel.cx, y: wheel.cy })!;
    expect(tap.adjusted).toBe(true);
    expect(grid.circleHitsBlocked(tap.goal.x, tap.goal.y)).toBe(false);
  });

  it('둘레길(웅덩이 옆을 지난다)은 막히지 않는다: 둘레길의 점들이 모두 걸을 수 있는 자리다', () => {
    const loop = outerRoads().find((r) => r.id === 'loop')!;
    const near = loop.points.filter((p) => p.x > 6200 && p.x < 6700 && p.y > E4.y - 200 && p.y < E4.y + E4.h + 200);
    expect(near.length).toBeGreaterThan(10);
    for (const p of near) expect(grid.circleHitsBlocked(p.x, p.y), `둘레길 ${Math.round(p.x)},${Math.round(p.y)}`).toBe(false);
  });

  it('웅덩이와 둘레의 나무·수로 사이에 한 칸 폭의 통로가 없다', () => {
    let narrow = 0;
    for (let cy = (E4.y - TILE * 4) / TILE; cy <= (E4.y + E4.h + TILE * 4) / TILE; cy++) {
      for (let cx = (E4.x - TILE * 3) / TILE; cx <= (E4.x + E4.w + TILE * 8) / TILE; cx++) {
        if (grid.isBlockedCell(cx, cy)) continue;
        if (grid.isBlockedCell(cx - 1, cy) && grid.isBlockedCell(cx + 1, cy)) narrow++;
      }
    }
    expect(narrow).toBe(0);
  });
});

describe('바닥 그림은 막힌 칸과 같다(3.8: 보이지 않는 벽이 없다)', () => {
  const buffers = new Map<string, { data: Buffer; width: number; channels: number }>();
  const load = async (col: number, row: number) => {
    const key = `${col}-${row}`;
    if (!buffers.has(key)) {
      const { data, info } = await sharp(path.join(root, WORLD_PUBLIC_DIR, `ground-${col}-${row}.webp`)).raw().toBuffer({ resolveWithObject: true });
      buffers.set(key, { data, width: info.width, channels: info.channels });
    }
    return buffers.get(key)!;
  };
  const pixel = async (x: number, y: number): Promise<[number, number, number]> => {
    const col = Math.floor(x / CHUNK_SIZE);
    const row = Math.floor(y / CHUNK_SIZE);
    const b = await load(col, row);
    const i = ((y - row * CHUNK_SIZE + CHUNK_PAD) * b.width + (x - col * CHUNK_SIZE + CHUNK_PAD)) * b.channels;
    return [b.data[i]!, b.data[i + 1]!, b.data[i + 2]!];
  };
  /** 물은 파랗다: 파랑이 빨강보다 30 이상 크다(물 색은 46, 옅은 물은 38, 풀밭은 7, 물가는 −28) */
  const isWater = ([r, , b]: [number, number, number]): boolean => b - r >= 30;

  beforeAll(async () => {
    await Promise.all([5, 6].flatMap((col) => [1, 2, 3].map((row) => load(col, row))));
  });

  it('웅덩이의 모든 칸이 물 그림이다(물결 줄과 말뚝을 피해서, 칸마다 네 점 가운데 둘 이상이 물)', async () => {
    for (const [cx, cy] of cellsOf(E4)) {
      let water = 0;
      for (const [dx, dy] of [[6, 6], [26, 6], [6, 26], [26, 26]] as const) if (isWater(await pixel(cx * TILE + dx, cy * TILE + dy))) water++;
      expect(water, `칸 ${cx},${cy}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('웅덩이 둘레에서 걸을 수 있는 칸은 물 그림이 아니다(걸을 수 있는 물이 없다)', async () => {
    const water: string[] = [];
    for (let cy = Math.floor(1950 / TILE); cy < Math.floor(2750 / TILE); cy++) {
      for (let cx = Math.floor(5560 / TILE); cx < Math.floor(6560 / TILE); cx++) {
        if (grid.isBlockedCell(cx, cy)) continue;
        if (isWater(await pixel(cx * TILE + 24, cy * TILE + 16))) water.push(`${cx},${cy}`);
      }
    }
    expect(water).toEqual([]);
  });

  it('서는 자리는 풀밭 또는 길이고 물이 아니다', async () => {
    expect(isWater(await pixel(6450, 2300))).toBe(false);
  });

  it('E1 웅덩이와 같은 물 색이다(그림 규칙이 같다)', async () => {
    // 가장자리 가까이(안쪽 옅은 물이 시작하기 전 16 px 띠)의 물 색은 웅덩이마다 같다
    const mill = await pixel(E4.x + 340, E4.y + 8);
    const ford = await pixel(6752 + 256, 2720 + 8);
    expect(isWater(mill)).toBe(true);
    expect(isWater(ford)).toBe(true);
    // 그림은 WebP(손실 압축)라서 한 점의 값이 몇 단계 흔들린다: 채널마다 10 안이면 같은 색이다
    mill.forEach((v, i) => expect(Math.abs(v - ford[i]!)).toBeLessThanOrEqual(10));
  });
});
