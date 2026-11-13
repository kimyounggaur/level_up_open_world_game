// 6-5 징검다리가 놓이는 물웅덩이(여울목 E1, E2와 세로로 긴 잔물결 수로 E3)의 바닥: 막힌 칸과 구운 그림이 같은 자리인지, 정거장의 줄이 물 안에 드는지, 서는 자리가 걸어서 닿는지.
// 3.8: 보이지 않는 벽을 쓰지 않는다. 막힌 칸은 모두 물(또는 물가) 그림이고, 걸을 수 있는 칸은 물 그림이 아니다.
import path from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { STONES_RAFT_BAND } from '../../src/domain/installation';
import { laneOf, laneRect } from '../../src/domain/timelineStones';
import { BODY_RADIUS, CHUNK_PAD, CHUNK_SIZE, PLAYER_START, TILE, WorldMap, standOf } from '../../src/domain/world';
import { NAV_ROWS } from '../../src/world/generated/worldData';
import { NavGrid, findPath, moveCircle, reachableFrom } from '../../src/world/nav';
import { WORLD_PUBLIC_DIR, loadRegionDefs } from '../../tools/world-files';
import { FORDS, fordColliders, fordSvg } from '../../world-src/outer';
import { COLOR } from '../../world-src/palette';
import { installation } from './controller-rig';

const root = path.resolve(__dirname, '../..');
const map = new WorldMap(loadRegionDefs(root));
const grid = NavGrid.fromRows(NAV_ROWS);

const INSTALLATION_OF: Record<string, string> = {
  E1: 'inst.beat-river.first-ford',
  E2: 'inst.beat-river.long-short',
  E3: 'inst.beat-river.ripple-channel',
};
const ford = (id: string) => FORDS.find((f) => f.stationId === id)!;
const E3 = ford('E3');

describe('물웅덩이의 자리와 크기', () => {
  it('여울목 셋: E1, E2, 그리고 세로로 긴 E3(잔물결 수로)', () => {
    expect(FORDS.map((f) => f.stationId)).toEqual(['E1', 'E2', 'E3']);
    expect(FORDS.map((f) => f.axis ?? 'x')).toEqual(['x', 'x', 'y']);
  });

  it('물웅덩이와 제방은 칸(32 px)의 경계에 맞는다: 그림과 막힌 칸이 같다', () => {
    for (const f of FORDS) {
      for (const v of [f.x, f.y, f.w, f.h]) expect(v % TILE, `${f.stationId} 물웅덩이`).toBe(0);
      for (const l of f.levees ?? []) for (const v of [l.x, l.y, l.w, l.h]) expect(v % TILE, `${f.stationId} 제방`).toBe(0);
    }
  });

  it('정거장의 줄 전체가 물웅덩이 안에 들고, 뗏목 표지 띠(32 px)도 같은 물 안에 든다', () => {
    for (const f of FORDS) {
      const inst = installation(INSTALLATION_OF[f.stationId]!);
      const lane = laneOf(inst)!;
      const r = laneRect(lane, 0, lane.laneTicks);
      expect(r.x, f.stationId).toBeGreaterThanOrEqual(f.x);
      expect(r.y, f.stationId).toBeGreaterThanOrEqual(f.y);
      expect(r.x + r.w, f.stationId).toBeLessThanOrEqual(f.x + f.w);
      expect(r.y + r.h, f.stationId).toBeLessThanOrEqual(f.y + f.h);
      // 띠: 줄의 직각 방향 한쪽 끝에서 32 px 더
      const far = lane.axis === 'x' ? f.y + f.h : f.x + f.w;
      expect(lane.cross + lane.crossSize + STONES_RAFT_BAND, f.stationId).toBeLessThanOrEqual(far);
    }
  });

  it('박 말뚝은 줄의 박 경계와 같은 간격이다: 한 박(4/4는 960틱)이 몇 px인지가 줄과 같고 첫 칸이 줄과 같은 자리에서 시작한다', () => {
    for (const f of FORDS) {
      const lane = laneOf(installation(INSTALLATION_OF[f.stationId]!))!;
      expect(f.laneStart, f.stationId).toBe(lane.start);
      expect(f.beatPx, f.stationId).toBe(960 / lane.ticksPerPx);
      expect(f.axis ?? 'x', f.stationId).toBe(lane.axis);
    }
  });

  it('E3: 줄은 위에서 아래로 700–2620, 물웅덩이는 x 6624–6784, y 672–2656이다', () => {
    expect(E3).toMatchObject({ x: 6624, y: 672, w: 160, h: 1984, laneStart: 700, beatPx: 480 });
    expect(E3.levees).toEqual([
      { x: 6784, y: 864, w: 32, h: 352 },
      { x: 6784, y: 2624, w: 32, h: 32 },
    ]);
  });

  it('제방은 물웅덩이의 동쪽 가장자리에 닿아 있다(물웅덩이와 강 둑 사이의 한 칸 틈을 메운다)', () => {
    for (const l of E3.levees!) {
      expect(l.x).toBe(E3.x + E3.w);
      expect(l.y).toBeGreaterThanOrEqual(E3.y);
      expect(l.y + l.h).toBeLessThanOrEqual(E3.y + E3.h);
    }
  });
});

describe('충돌 사각형', () => {
  it('물웅덩이마다 막는 사각형이 있고, 제방은 따로 있다', () => {
    const colliders = fordColliders();
    expect(colliders.map((c) => c.note)).toEqual(['E1 여울목', 'E2 여울목', 'E3 수로', 'E3 제방', 'E3 제방']);
    expect(colliders.filter((c) => c.kind === 'rect')).toHaveLength(5);
    expect(colliders[2]).toEqual({ kind: 'rect', x: 6624, y: 672, w: 160, h: 1984, note: 'E3 수로' });
  });

  it('그림에는 물웅덩이마다 물이 있고, E3의 제방과 박 말뚝 다섯 쌍이 있다', () => {
    const svg = fordSvg();
    expect(svg.split(`fill="${COLOR.water}"`).length - 1).toBe(FORDS.length);
    // 물가 색 제방 둘(물가 띠는 물웅덩이마다 하나라 따로 센다)
    expect(svg).toContain(`<rect x="6780" y="864" width="40" height="352"`);
    expect(svg).toContain(`<rect x="6780" y="2624" width="40" height="32"`);
  });
});

describe('굽힌 충돌 격자', () => {
  const cellsOf = (r: { x: number; y: number; w: number; h: number }): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let cy = r.y / TILE; cy < (r.y + r.h) / TILE; cy++) for (let cx = r.x / TILE; cx < (r.x + r.w) / TILE; cx++) out.push([cx, cy]);
    return out;
  };

  it('물웅덩이와 제방의 모든 칸이 막혀 있다(줄 위로는 걸어 들어갈 수 없다: 돌은 건너는 수단이 아니라 악기다)', () => {
    for (const f of FORDS) {
      for (const [cx, cy] of cellsOf(f)) expect(grid.isBlockedCell(cx, cy), `${f.stationId} 칸 ${cx},${cy}`).toBe(true);
      for (const l of f.levees ?? []) for (const [cx, cy] of cellsOf(l)) expect(grid.isBlockedCell(cx, cy), `${f.stationId} 제방 ${cx},${cy}`).toBe(true);
    }
  });

  it('E3의 서는 자리는 물웅덩이 서쪽 둑에서 64 px 떨어진 마른 땅이고 시작 위치에서 걸어 닿는다', () => {
    const e3 = map.stations.find((s) => s.stationId === 'E3')!;
    const st = standOf(e3);
    expect(st).toEqual({ x: 6560, y: 1660 });
    expect(grid.circleHitsBlocked(st.x, st.y)).toBe(false);
    const reach = reachableFrom(grid, PLAYER_START);
    const c = grid.cellOf(st.x, st.y);
    expect(reach[c.cy * grid.cols + c.cx]).toBe(1);
    expect(findPath(grid, PLAYER_START, st)).not.toBeNull();
  });

  it('서는 자리에서 동쪽으로 걸으면 물웅덩이 앞에서 멈춘다. 물 위로는 들어갈 수 없다', () => {
    const start = { x: 6560, y: 1660 };
    const end = moveCircle(grid, start, 400, 0);
    expect(end.x).toBeGreaterThan(start.x);
    expect(end.x + BODY_RADIUS).toBeLessThanOrEqual(E3.x + 1);
    // 줄 한가운데를 눌러도 물 위로는 가지 못하고, 가장 가까운 갈 수 있는 곳(서쪽 둑)으로 바뀐다
    expect(grid.circleHitsBlocked(6704, 1660)).toBe(true);
    const tap = findPath(grid, start, { x: 6704, y: 1660 })!;
    expect(tap.adjusted).toBe(true);
    expect(tap.goal.x).toBeLessThan(E3.x);
  });

  it('수로와 강 사이에는 지나갈 수 있는 한 칸 틈이 없다: 제방이 메운다', () => {
    // 물웅덩이 동쪽 가장자리의 바깥 한 칸: 제방이 아니면 강 둑이거나 이미 막힌 칸이다. 걸을 수 있는 한 칸 폭 통로(양옆이 막힌 칸)가 없다
    let narrow = 0;
    for (let cy = (E3.y - TILE) / TILE; cy <= (E3.y + E3.h) / TILE; cy++) {
      for (let cx = (E3.x - TILE * 2) / TILE; cx <= (E3.x + E3.w + TILE * 4) / TILE; cx++) {
        if (grid.isBlockedCell(cx, cy)) continue;
        const left = grid.isBlockedCell(cx - 1, cy);
        const right = grid.isBlockedCell(cx + 1, cy);
        if (left && right) narrow++;
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
  /** 물은 파랗다: 파랑이 빨강보다 30 이상 크다(물 색 #9DC3CB는 46, 옅은 물은 38, 풀밭은 7, 물가는 −28) */
  const isWater = ([r, , b]: [number, number, number]): boolean => b - r >= 30;
  const near = (c: [number, number, number], hex: string, tol = 8): boolean => {
    const h = hex.replace('#', '');
    const want = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return c.every((v, i) => Math.abs(v - want[i]!) <= tol);
  };

  beforeAll(async () => {
    await Promise.all([6].flatMap((col) => [0, 1, 2].map((row) => load(col, row))));
  });

  it('E3 물웅덩이의 모든 칸이 물 그림이다(물결 줄과 말뚝을 피한 점에서)', async () => {
    for (let cy = E3.y / TILE; cy < (E3.y + E3.h) / TILE; cy++) {
      for (let cx = E3.x / TILE; cx < (E3.x + E3.w) / TILE; cx++) {
        const p = await pixel(cx * TILE + 24, cy * TILE + 16);
        expect(isWater(p), `칸 ${cx},${cy} (${p.join(',')})`).toBe(true);
      }
    }
  });

  it('E3 제방의 칸은 물가 색이다: 물웅덩이의 물가가 강 둑까지 이어져 보인다', async () => {
    for (const l of E3.levees!) {
      for (let cy = l.y / TILE; cy < (l.y + l.h) / TILE; cy++) {
        const p = await pixel(l.x + 16, cy * TILE + 16);
        expect(near(p, COLOR.bank), `제방 ${l.x},${cy * TILE} (${p.join(',')})`).toBe(true);
      }
    }
  });

  it('E3 둘레에서 걸을 수 있는 칸은 물 그림이 아니다(걸을 수 있는 물이 없다)', async () => {
    const water: string[] = [];
    for (let cy = Math.floor(600 / TILE); cy < Math.floor(2720 / TILE); cy++) {
      for (let cx = Math.floor(6400 / TILE); cx < Math.floor(6900 / TILE); cx++) {
        if (grid.isBlockedCell(cx, cy)) continue;
        if (isWater(await pixel(cx * TILE + 24, cy * TILE + 16))) water.push(`${cx},${cy}`);
      }
    }
    expect(water).toEqual([]);
  });

  it('서는 자리는 풀밭이고, 물웅덩이 서쪽 둑은 물가 색이다', async () => {
    expect(isWater(await pixel(6560, 1660))).toBe(false);
    expect(near(await pixel(6618, 1500), COLOR.bank)).toBe(true);
  });

  it('E1의 물웅덩이도 같은 물 색이다(세 여울목이 같은 그림 규칙을 쓴다)', async () => {
    const e1 = ford('E1');
    const p1 = await pixel(e1.x + 256, e1.y + 80);
    const p3 = await pixel(E3.x + 80, E3.y + 400);
    expect(isWater(p1)).toBe(true);
    expect(p1).toEqual(p3);
  });
});
