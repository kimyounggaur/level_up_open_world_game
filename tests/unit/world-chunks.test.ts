// 10.5, 6-1: 바닥 조각은 화면 + 512 px까지만 불러오고, 두 조각 넘게 멀어지면 내리며, 12장 이하로 둔다.
import { describe, expect, it } from 'vitest';
import { CHUNK_COLS, CHUNK_ROWS, CHUNK_SIZE, WORLD_H, WORLD_W } from '../../src/domain/world';
import { CHUNK_KEEP_DISTANCE, CHUNK_LOAD_MARGIN, CHUNK_MAX_LOADED, chunkDistance, chunkName, chunkOrigin, chunkRange, chunkUrl, parseChunkName, planChunks } from '../../src/world/chunks';
import type { ViewRect } from '../../src/world/chunks';
import { clampCenter, visibleWorld } from '../../src/world/camera';

describe('조각 이름', () => {
  it('ground-<열>-<행>이고 파일은 world/ 아래 webp다', () => {
    expect(chunkName(3, 2)).toBe('ground-3-2');
    expect(chunkUrl(3, 2)).toBe('world/ground-3-2.webp');
    expect(chunkOrigin(3, 2)).toEqual({ x: 3072, y: 2048 });
  });
  it('이름을 되읽고 범위 밖이나 엉뚱한 이름은 거절한다', () => {
    expect(parseChunkName('ground-7-5')).toEqual({ c: 7, r: 5 });
    expect(parseChunkName('ground-8-0')).toBeNull();
    expect(parseChunkName('ground-0-6')).toBeNull();
    expect(parseChunkName('tree-1')).toBeNull();
  });
  it('8×6 = 48장이고 규칙 수치는 설계서와 같다', () => {
    expect(CHUNK_COLS * CHUNK_ROWS).toBe(48);
    expect(CHUNK_LOAD_MARGIN).toBe(512);
    expect(CHUNK_KEEP_DISTANCE).toBe(2);
    expect(CHUNK_MAX_LOADED).toBe(12);
  });
});

const viewAt = (cx: number, cy: number, w: number, h: number): ViewRect => ({ x: cx - w / 2, y: cy - h / 2, w, h });

describe('필요한 조각', () => {
  it('월드 한가운데: 1152×720 화면 + 사방 512 px는 4열 2행 = 8장이다', () => {
    const v = viewAt(4096, 3072, 1152, 720); // x 3520–4672, y 2712–3432 → +512: x 3008–5184, y 2200–3944
    expect(chunkRange(v)).toEqual({ c0: 2, c1: 5, r0: 2, r1: 3 });
    const plan = planChunks(v, []);
    expect(plan.wanted).toHaveLength(8);
    expect(plan.load).toHaveLength(8);
    expect(plan.unload).toEqual([]);
  });

  it('월드 모서리에서는 밖을 자르고 4장이다', () => {
    const v = viewAt(576, 360, 1152, 720);
    expect(chunkRange(v)).toEqual({ c0: 0, c1: 1, r0: 0, r1: 1 });
    expect(planChunks(v, []).wanted).toHaveLength(4);
    const far = viewAt(WORLD_W - 576, WORLD_H - 360, 1152, 720);
    expect(chunkRange(far)).toEqual({ c0: 6, c1: 7, r0: 4, r1: 5 });
  });

  it('경계에 정확히 걸치면 이웃 조각을 불필요하게 부르지 않는다', () => {
    // 화면 오른쪽 + 512가 정확히 2048 → 조각 열 1까지만
    const v: ViewRect = { x: 512, y: 512, w: 1024, h: 1024 }; // → x -0..2048, y 0..2048
    const r = chunkRange(v);
    expect(r).toEqual({ c0: 0, c1: 1, r0: 0, r1: 1 });
  });

  it('화면 크기가 달라도(가로, 노트북, 태블릿, 세로 휴대폰) 월드 어디서든 12장 이하다', () => {
    const screens: Array<[string, number, number]> = [
      ['PC 1600×1000', 1600, 1000],
      ['노트북 1366×768', 1366, 768],
      ['태블릿 1280×800', 1280, 800],
      ['태블릿 1180×820', 1180, 820],
      ['휴대폰 세로 430×932', 430, 932],
      ['21:9 모니터 2560×1080', 2560, 1080],
    ];
    for (const [name, w, h] of screens) {
      const vis = visibleWorld({ width: w, height: h });
      let worst = 0;
      for (let cy = 0; cy <= WORLD_H; cy += 128) {
        for (let cx = 0; cx <= WORLD_W; cx += 128) {
          const c = clampCenter({ x: cx, y: cy }, { width: w, height: h });
          const n = planChunks({ x: c.x - vis.width / 2, y: c.y - vis.height / 2, w: vis.width, h: vis.height }, []).wanted.length;
          worst = Math.max(worst, n);
        }
      }
      expect(worst, name).toBeLessThanOrEqual(CHUNK_MAX_LOADED);
    }
  });

  it('화면 가운데에 가까운 조각부터 부른다', () => {
    const v = viewAt(4096 + 300, 3072, 1152, 720);
    const plan = planChunks(v, []);
    const cx = (v.x + v.w / 2) / CHUNK_SIZE - 0.5;
    const cy = (v.y + v.h / 2) / CHUNK_SIZE - 0.5;
    const dist = plan.load.map((id) => Math.hypot(id.c - cx, id.r - cy));
    for (let i = 1; i < dist.length; i++) expect(dist[i]!).toBeGreaterThanOrEqual(dist[i - 1]! - 1e-9);
  });

  it('이미 불러온 조각은 다시 부르지 않는다', () => {
    const v = viewAt(4096, 3072, 1152, 720);
    const first = planChunks(v, []);
    const loaded = first.load.map((id) => chunkName(id.c, id.r));
    const again = planChunks(v, loaded);
    expect(again.load).toEqual([]);
    expect(again.unload).toEqual([]);
  });
});

describe('내리기', () => {
  it('필요한 범위에서 두 조각까지는 남기고 세 조각 멀어지면 내린다', () => {
    // 모서리 화면: 필요한 범위 열 0–1, 행 0–1
    const v = viewAt(576, 360, 1152, 720);
    const loaded = [chunkName(3, 0), chunkName(4, 0), chunkName(0, 3), chunkName(0, 4)];
    const plan = planChunks(v, loaded);
    // 열 3은 열 1에서 2 떨어져 남고, 열 4는 3 떨어져 내린다. 행도 같다
    const names = plan.unload.map((id) => chunkName(id.c, id.r)).sort();
    expect(names).toEqual([chunkName(0, 4), chunkName(4, 0)].sort());
    expect(chunkDistance({ c: 3, r: 0 }, chunkRange(v))).toBe(2);
    expect(chunkDistance({ c: 4, r: 0 }, chunkRange(v))).toBe(3);
  });

  it('필요한 조각은 절대 내리지 않는다', () => {
    const v = viewAt(4096, 3072, 1152, 720);
    const wanted = planChunks(v, []).wanted.map((id) => chunkName(id.c, id.r));
    const plan = planChunks(v, wanted);
    expect(plan.unload).toEqual([]);
  });

  it('12장을 넘으면 필요하지 않은 조각 중 먼 것부터 내린다', () => {
    const v = viewAt(576, 360, 1152, 720); // 필요한 4장(열 0–1, 행 0–1)
    // 필요한 4장 + 거리 1–2에 있는 10장 = 14장을 올려 둔 상태
    const loaded: string[] = [];
    for (let r = 0; r <= 3; r++) for (let c = 0; c <= 3; c++) if (loaded.length < 14) loaded.push(chunkName(c, r));
    expect(loaded).toHaveLength(14);
    const plan = planChunks(v, loaded);
    const after = new Set(loaded);
    for (const id of plan.unload) after.delete(chunkName(id.c, id.r));
    for (const id of plan.load) after.add(chunkName(id.c, id.r));
    expect(after.size).toBeLessThanOrEqual(CHUNK_MAX_LOADED);
    // 필요한 4장은 남아 있다
    for (const id of plan.wanted) expect(after.has(chunkName(id.c, id.r))).toBe(true);
    // 내려간 것은 모두 거리 2(가장 먼 쪽)였다
    for (const id of plan.unload) expect(chunkDistance(id, chunkRange(v))).toBeGreaterThanOrEqual(1);
  });
});

// 월드를 끝에서 끝까지 걸어도 불러온 조각이 12장 이하다(6-1의 완료 기준)
function walk(from: [number, number], to: [number, number], screen: [number, number]): { maxLoaded: number; gaps: number } {
  const vis = visibleWorld({ width: screen[0], height: screen[1] });
  const loaded = new Set<string>();
  let maxLoaded = 0;
  let gaps = 0;
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 60); // 한 걸음 60 px (약 1/4초)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = clampCenter({ x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t }, { width: screen[0], height: screen[1] });
    const plan = planChunks({ x: c.x - vis.width / 2, y: c.y - vis.height / 2, w: vis.width, h: vis.height }, loaded);
    for (const id of plan.unload) loaded.delete(chunkName(id.c, id.r));
    for (const id of plan.load) loaded.add(chunkName(id.c, id.r));
    maxLoaded = Math.max(maxLoaded, loaded.size);
    // 화면에 실제로 보이는 조각이 모두 올라 있어야 한다
    const range = chunkRange({ x: c.x - vis.width / 2, y: c.y - vis.height / 2, w: vis.width, h: vis.height }, 0);
    for (let r = range.r0; r <= range.r1; r++) for (let cc = range.c0; cc <= range.c1; cc++) if (!loaded.has(chunkName(cc, r))) gaps++;
  }
  return { maxLoaded, gaps };
}

describe('6-1 월드를 끝에서 끝까지 걸어도 불러온 조각이 12장 이하다', () => {
  const screens: Array<[number, number]> = [
    [1600, 1000],
    [1366, 768],
    [430, 932],
  ];
  it('서쪽 끝에서 동쪽 끝까지, 북쪽 끝에서 남쪽 끝까지, 대각선', () => {
    for (const s of screens) {
      for (const [a, b] of [
        [[100, 3081], [8092, 3081]],
        [[4056, 100], [4056, 6044]],
        [[100, 100], [8092, 6044]],
        [[8092, 100], [100, 6044]],
      ] as Array<[[number, number], [number, number]]>) {
        const r = walk(a, b, s);
        expect(r.maxLoaded, `${s.join('×')} ${a}→${b}`).toBeLessThanOrEqual(CHUNK_MAX_LOADED);
        expect(r.gaps, `${s.join('×')} ${a}→${b}에서 화면에 보이는 조각이 비었어요`).toBe(0);
      }
    }
  });
});
