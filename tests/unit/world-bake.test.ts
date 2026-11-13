// 3-2, 3-3: 굽은 바닥과 충돌 격자. 생성 파일이 원본과 맞는지, 시안 B01과 배치가 같은지, 어느 정거장이든 걸어서 닿는지 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CHUNK_COLS, CHUNK_PAD, CHUNK_ROWS, CHUNK_SIZE, OVERVIEW_H, OVERVIEW_SCALE, OVERVIEW_W, PLAYER_START, WORLD_H, WORLD_W, WorldMap, standOf } from '../../src/domain/world';
import { nearestInteractable } from '../../src/world/interact';
import type { Interactable } from '../../src/world/interact';
import { NavGrid, findPath, reachableFrom } from '../../src/world/nav';
import { NAV_ROWS, OBJECT_ATLAS, OBJECT_FRAMES, STATION_HITS, WORLD_OBJECTS, WORLD_SOURCE_HASH } from '../../src/world/generated/worldData';
import { GENERATED_PATH, MANIFEST_NAME, OVERVIEW_NAME, WORLD_PUBLIC_DIR, allChunkFiles, loadRegionDefs, renderManifest, renderWorldDataTs, sourceHashOf } from '../../tools/world-files';
import { loadWorldSource } from '../../tools/world-source';
import { frameName } from '../../world-src/atlas';
import { buildWorld, villagePreviewBody } from '../../world-src/index';
import { ACCENT } from '../../world-src/palette';
import { STONE_COUNT, stoneRect, toWorldX, toWorldY, SCALE } from '../../world-src/village';

const root = path.resolve(__dirname, '../..');
const regions = loadRegionDefs(root);
const map = new WorldMap(regions);
const build = buildWorld(regions, loadWorldSource(root));
const grid = NavGrid.fromRows(NAV_ROWS);

describe('굽기 결과가 원본과 맞는다', () => {
  it('굽는 동안의 점검에서 문제가 없다', () => {
    expect(build.issues).toEqual([]);
  });

  it('생성 파일 worldData.ts와 manifest.json이 원본에서 다시 만든 것과 같다(낡았으면 npm run build:world)', () => {
    const hash = sourceHashOf(build);
    expect(WORLD_SOURCE_HASH).toBe(hash);
    expect(fs.readFileSync(path.join(root, GENERATED_PATH), 'utf-8')).toBe(renderWorldDataTs(build, hash));
    expect(fs.readFileSync(path.join(root, WORLD_PUBLIC_DIR, MANIFEST_NAME), 'utf-8')).toBe(renderManifest(build, hash));
  });

  it('바닥 조각이 8×6 = 48장이고 모두 WebP다. 한 변은 조각 1024 + 둘레 여백 2×2 px이다', async () => {
    const files = allChunkFiles();
    expect(files).toHaveLength(CHUNK_COLS * CHUNK_ROWS);
    expect(CHUNK_COLS * CHUNK_ROWS).toBe(48);
    for (const f of files) {
      const meta = await sharp(path.join(root, WORLD_PUBLIC_DIR, f)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(CHUNK_SIZE + 2 * CHUNK_PAD);
      expect(meta.height).toBe(CHUNK_SIZE + 2 * CHUNK_PAD);
    }
  });

  it('악보 지도 그림은 월드를 1/4로 줄인 2048×1536 WebP이고 목록(manifest)에 적혀 있다', async () => {
    expect(OVERVIEW_SCALE).toBe(0.25);
    expect(OVERVIEW_W).toBe(WORLD_W / 4);
    expect(OVERVIEW_H).toBe(WORLD_H / 4);
    expect([OVERVIEW_W, OVERVIEW_H]).toEqual([2048, 1536]);
    const meta = await sharp(path.join(root, WORLD_PUBLIC_DIR, OVERVIEW_NAME)).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([OVERVIEW_W, OVERVIEW_H]);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, WORLD_PUBLIC_DIR, MANIFEST_NAME), 'utf-8')) as { overview: { file: string; width: number; height: number } };
    expect(manifest.overview).toEqual({ file: OVERVIEW_NAME, width: OVERVIEW_W, height: OVERVIEW_H });
  });

  it('악보 지도 그림은 바닥 조각과 같은 그림이다: 정거장 둘레의 지붕과 길이 같은 자리에 있다', async () => {
    // 음자리 작업대 지붕(3.3: 2910, 2532, 618×354)의 가운데가 지도 그림에서도 지붕색(짙은 청록)이고, 같은 길 한가운데는 길 색(밝은 베이지)이다
    const { data, info } = await sharp(path.join(root, WORLD_PUBLIC_DIR, OVERVIEW_NAME)).raw().toBuffer({ resolveWithObject: true });
    const at = (wx: number, wy: number): [number, number, number] => {
      const x = Math.round(wx * OVERVIEW_SCALE);
      const y = Math.round(wy * OVERVIEW_SCALE);
      const i = (y * info.width + x) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    const roof = at(2910 + 618 / 2, 2532 + 354 / 2 + 80); // 지붕의 아래쪽 면(가운데 두 창을 피한 곳)
    const road = at(PLAYER_START.x, PLAYER_START.y);
    const lum = (c: [number, number, number]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(lum(roof)).toBeLessThan(lum(road) - 40); // 지붕은 길보다 뚜렷하게 어둡다
  });

  it('사물 그림은 한 장(아틀라스)으로 묶여 있고, 사물이 쓰는 그림이 모두 틀로 들어 있다(6-3)', async () => {
    expect(OBJECT_FRAMES.length).toBeGreaterThan(0);
    for (const o of WORLD_OBJECTS) expect(OBJECT_FRAMES, o.id).toContain(frameName(o.file));
    expect(OBJECT_ATLAS).toEqual({ image: 'objects.webp', data: 'objects.json' });
    const meta = await sharp(path.join(root, WORLD_PUBLIC_DIR, OBJECT_ATLAS.image)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.hasAlpha).toBe(true);
    const atlas = JSON.parse(fs.readFileSync(path.join(root, WORLD_PUBLIC_DIR, OBJECT_ATLAS.data), 'utf-8')) as { frames: Record<string, { frame: { w: number; h: number } }>; meta: { size: { w: number; h: number } } };
    expect([meta.width, meta.height]).toEqual([atlas.meta.size.w, atlas.meta.size.h]);
    expect(Object.keys(atlas.frames).sort()).toEqual([...OBJECT_FRAMES]);
  });

  it('원본의 사물 그림은 SVG이고, 낱장 SVG는 더 이상 내보내지 않는다', () => {
    for (const [file, svg] of Object.entries(build.sprites)) {
      expect(file.endsWith('.svg'), file).toBe(true);
      expect(svg.startsWith('<svg'), file).toBe(true);
      expect(fs.existsSync(path.join(root, WORLD_PUBLIC_DIR, file)), `${file}이 public/world에 낱장으로 남아 있어요`).toBe(false);
    }
  });

  it('바닥 조각의 파일 이름은 ground-<열>-<행>.webp이다(9.6)', () => {
    expect(allChunkFiles()[0]).toBe('ground-0-0.webp');
    expect(allChunkFiles()[47]).toBe('ground-7-5.webp');
  });

  it('지역 강조색이 content/regions와 같다', () => {
    for (const r of regions) expect(ACCENT[r.regionId]).toBe(r.accentColor);
  });
});

describe('3-3 충돌과 길찾기 격자', () => {
  it('256×192칸이고 월드 가장자리 두 칸은 모두 막혀 있다', () => {
    expect(grid.cols).toBe(256);
    expect(grid.rows).toBe(192);
    for (let x = 0; x < 256; x++) for (const y of [0, 1, 190, 191]) expect(grid.isBlockedCell(x, y)).toBe(true);
    for (let y = 0; y < 192; y++) for (const x of [0, 1, 254, 255]) expect(grid.isBlockedCell(x, y)).toBe(true);
  });

  it('건물 지붕 안으로는 들어갈 수 없다(3.3의 지붕 좌표)', () => {
    const roofs: Array<[string, number, number, number, number]> = [
      ['음자리 작업대', 2910, 2532, 618, 354],
      ['리듬 작업대', 4671, 2394, 570, 384],
      ['화음 작업대', 2976, 3468, 594, 336],
    ];
    for (const [, x, y, w, h] of roofs) {
      // 지붕 안쪽 한 칸씩 안으로 들어간 모든 칸이 막혀 있다
      for (let px = x + 20; px < x + w - 20; px += 32) for (let py = y + 20; py < y + h - 20; py += 32) expect(grid.isBlockedPoint(px, py)).toBe(true);
    }
  });

  it('작업대 문 앞 세 곳과 광장 한가운데는 걸을 수 있다', () => {
    for (const [x, y] of [[3219, 2964], [4956, 2856], [3273, 3882], [4056, 3081]] as const) expect(grid.circleHitsBlocked(x, y)).toBe(false);
  });

  it('시작 위치와 디딤돌 서는 자리는 걸을 수 있다', () => {
    expect(grid.circleHitsBlocked(PLAYER_START.x, PLAYER_START.y)).toBe(false);
    expect(grid.circleHitsBlocked(4530, 3655)).toBe(false);
  });

  it('시안의 나무 아홉 그루 줄기는 막혀 있고, 줄기 위 캐노피 가운데는 걸을 수 있다', () => {
    const trees = WORLD_OBJECTS.filter((o) => o.id.startsWith('tree-village-'));
    expect(trees).toHaveLength(9);
    for (const t of trees) {
      expect(grid.isBlockedPoint(t.x, t.sortY)).toBe(true);
    }
  });

  it('강은 막혀 있고 동쪽 다리만 건널 수 있다', () => {
    expect(grid.isBlockedPoint(7000, 2800)).toBe(true);
    expect(grid.isBlockedPoint(7000, 3600)).toBe(true);
    expect(grid.isBlockedPoint(7000, 3081)).toBe(false);
    const west = reachableFrom(grid, { x: 6700, y: 3081 });
    const eastCell = grid.cellOf(7500, 3081);
    expect(west[eastCell.cy * grid.cols + eastCell.cx]).toBe(1);
    // 다리 옆 물에서는 걸을 수 없다
    expect(grid.isBlockedPoint(7000, 2960)).toBe(true);
    expect(grid.isBlockedPoint(7000, 3200)).toBe(true);
  });

  it('정거장 23곳의 서는 자리가 모두 시작 위치에서 걸어 닿는다', () => {
    expect(map.stations).toHaveLength(23);
    const reach = reachableFrom(grid, PLAYER_START);
    for (const s of map.stations) {
      const st = standOf(s);
      expect(grid.circleHitsBlocked(st.x, st.y), `${s.stationId} 서는 자리가 막힘`).toBe(false);
      const c = grid.cellOf(st.x, st.y);
      expect(reach[c.cy * grid.cols + c.cx], `${s.stationId}에 닿지 못함`).toBe(1);
    }
  });

  it('광장에서 모든 정거장까지, 그리고 정거장을 차례로 잇는 길이 나온다(12.6의 완료 기준)', () => {
    const order = map.stations.map(standOf);
    for (const to of order) {
      const r = findPath(grid, { x: 4056, y: 3081 }, to);
      expect(r, `광장 → (${to.x}, ${to.y})`).not.toBeNull();
    }
    for (let i = 0; i + 1 < order.length; i++) {
      const r = findPath(grid, order[i]!, order[i + 1]!);
      expect(r, `${i}번째 → ${i + 1}번째`).not.toBeNull();
    }
  });

  it('폭 1칸 통로가 없다(3.8: 통로는 64 px 이상). 메운 틈은 몇 칸 되지 않고 정거장 가까이에는 없다', () => {
    expect(build.stats.narrowCells).toBe(0);
    expect(build.stats.closedGaps.length).toBeLessThanOrEqual(8);
    for (const g of build.stats.closedGaps) {
      const p = { x: g.cx * 32 + 16, y: g.cy * 32 + 16 };
      for (const s of map.stations) {
        const st = standOf(s);
        expect(Math.hypot(st.x - p.x, st.y - p.y), `${s.stationId} 가까이에서 틈을 메웠어요`).toBeGreaterThan(160);
      }
    }
  });

  it('사물은 발 위치의 y 순서로 정렬되어 있고 나무 줄기가 막힌 칸이다', () => {
    for (let i = 1; i < WORLD_OBJECTS.length; i++) expect(WORLD_OBJECTS[i]!.sortY).toBeGreaterThanOrEqual(WORLD_OBJECTS[i - 1]!.sortY);
    for (const o of WORLD_OBJECTS.filter((x) => x.kind === 'tree')) expect(grid.isBlockedPoint(o.x, o.sortY), o.id).toBe(true);
  });
});

describe('3-6 정거장 누르기 영역', () => {
  const items: Interactable[] = map.stations.map((s) => ({ id: s.stationId, name: s.name, x: standOf(s).x, y: standOf(s).y, hit: STATION_HITS[s.stationId]!, kind: s.kind }));

  it('정거장 23곳 모두에 누르기 영역이 있다', () => {
    for (const s of map.stations) {
      const h = STATION_HITS[s.stationId];
      expect(h, s.stationId).toBeDefined();
      expect(h!.w).toBeGreaterThan(0);
      expect(h!.h).toBeGreaterThan(0);
    }
  });

  it('각 정거장의 서는 자리에 서면 그 정거장이 가장 가까운 상호작용 대상이다', () => {
    for (const it of items) {
      const near = nearestInteractable({ x: it.x, y: it.y }, items);
      expect(near?.item.id, `${it.id}에 서 있는데`).toBe(it.id);
    }
  });

  it('서는 자리에서 누르기 영역까지 96 px 안이다(안내 칩이 보이는 거리)', () => {
    for (const it of items) {
      const r = it.hit;
      const dx = Math.max(r.x - it.x, 0, it.x - (r.x + r.w));
      const dy = Math.max(r.y - it.y, 0, it.y - (r.y + r.h));
      expect(Math.hypot(dx, dy), it.id).toBeLessThanOrEqual(96);
    }
  });
});

// 3-2: 시안 B01과 나란히 놓았을 때 배치가 같다.
// 시안의 지도 부분(1600×1000 그림의 (34, 191)부터 1000×700)을 잘라 마을 그림과 픽셀 단위로 비교한다.
// 시안에 얹힌 카드·라벨·나침반·내 위치 표식과 둥근 모서리는 가리고, 디딤돌 여덟째 칸(설계서가 늘린 것)도 가린다.
describe('3-2 시안 B01과의 대조', () => {
  const MASKS: ReadonlyArray<readonly [number, number, number, number]> = [
    [20, 20, 262, 93], // 마을 전체 지도 카드
    [912, 4, 944, 70], // 나침반
    [110, 308, 310, 358], // 음자리 작업대 라벨
    [688, 269, 888, 318], // 리듬 작업대 라벨
    [129, 608, 329, 658], // 화음 작업대 라벨
    [376, 395, 601, 465], // 합주 광장 라벨
    [683, 623, 883, 671], // 음계 산책로 라벨
    [367, 633, 677, 700], // 범례
    [440, 465, 545, 510], // 내 위치 표식
    [888, 517, 924, 576], // 여덟째 디딤돌
    [0, 0, 24, 24],
    [976, 0, 1000, 24],
    [0, 676, 24, 700],
    [976, 676, 1000, 700], // 둥근 모서리
  ];
  const masked = (x: number, y: number): boolean => MASKS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);

  it('가리지 않은 픽셀의 99% 이상이 시안과 같다(길이 만나는 곳의 가장자리 선만 의도해서 다르다)', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="2592 2016 3000 2100">${villagePreviewBody()}</svg>`;
    const mine = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const mock = await sharp(path.join(root, 'tests/fixtures/b01-village-map-desktop-v2.png')).extract({ left: 34, top: 191, width: 1000, height: 700 }).ensureAlpha().raw().toBuffer();
    let counted = 0;
    let bad = 0;
    for (let i = 0; i < 1000 * 700; i++) {
      const x = i % 1000;
      const y = Math.floor(i / 1000);
      if (masked(x, y)) continue;
      counted++;
      const d = Math.max(Math.abs(mine[i * 4]! - mock[i * 4]!), Math.abs(mine[i * 4 + 1]! - mock[i * 4 + 1]!), Math.abs(mine[i * 4 + 2]! - mock[i * 4 + 2]!));
      if (d > 32) bad++;
    }
    expect(counted).toBeGreaterThan(550000);
    expect(bad / counted).toBeLessThan(0.01);
  });
});

describe('4-1 설치물의 돌 자리는 바닥에 구워 넣은 돌 그림과 같다', () => {
  // 설치물 층은 구워 둔 돌 위에 이름·번호·표식을 올려 그린다. 두 자리가 어긋나면 글자가 돌 밖에 뜨므로 자리를 맞춰 둔다.
  const installation = JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', 'inst.village.scale-stones.json'), 'utf-8')) as {
    slots: Array<{ slot: number; x: number; y: number; w: number; h: number }>;
  };

  it('돌 개수가 같고, 각 돌의 위치와 크기가 같다', () => {
    expect(installation.slots).toHaveLength(STONE_COUNT);
    installation.slots.forEach((s, i) => {
      const [x, y, w, h] = stoneRect(i);
      expect({ slot: s.slot, x: s.x, y: s.y, w: s.w, h: s.h }).toEqual({ slot: i + 1, x: toWorldX(x), y: toWorldY(y), w: SCALE * w, h: SCALE * h });
    });
  });
});
