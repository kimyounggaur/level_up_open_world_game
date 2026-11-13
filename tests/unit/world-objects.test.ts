// 3-5 사물 놓기와 겹침 정렬: 발 위치의 y로 순서를 정하고, 나무 줄기보다 북쪽에 선 캐릭터는 나무에 가려진다.
// 실제 화면에서 가려지는지는 tests/flow/world.flow.ts가 픽셀로 확인한다. 여기서는 순서 규칙과 데이터를 확인한다.
import { describe, expect, it } from 'vitest';
import { depthOfFoot, hidesPlayer } from '../../src/world/objects';
import { NavGrid } from '../../src/world/nav';
import { NAV_ROWS, WORLD_OBJECTS } from '../../src/world/generated/worldData';

const grid = NavGrid.fromRows(NAV_ROWS);
const trees = WORLD_OBJECTS.filter((o) => o.kind === 'tree');

describe('3-5 그리는 순서', () => {
  it('캐릭터의 순서값은 발 위치의 y 그대로다', () => {
    expect(depthOfFoot(0)).toBe(0);
    expect(depthOfFoot(1234.5)).toBe(1234.5);
  });

  it('발이 사물의 정렬 y보다 북쪽(작음)이면 사물이 가리고, 같거나 남쪽이면 가리지 않는다', () => {
    const tree = { sortY: 2000 };
    expect(hidesPlayer(tree, 1999.9)).toBe(true);
    expect(hidesPlayer(tree, 1500)).toBe(true);
    expect(hidesPlayer(tree, 2000)).toBe(false);
    expect(hidesPlayer(tree, 2300)).toBe(false);
  });

  it('사물 목록은 정렬 y가 작은 것부터이고, 사물마다 크기와 정렬 y가 있다', () => {
    expect(WORLD_OBJECTS.length).toBeGreaterThan(0);
    for (let i = 1; i < WORLD_OBJECTS.length; i++) expect(WORLD_OBJECTS[i]!.sortY).toBeGreaterThanOrEqual(WORLD_OBJECTS[i - 1]!.sortY);
    for (const o of WORLD_OBJECTS) {
      expect(o.w).toBeGreaterThan(0);
      expect(o.h).toBeGreaterThan(0);
      expect(Number.isFinite(o.sortY)).toBe(true);
    }
  });

  it('나무의 정렬 y는 그림 가운데보다 남쪽(줄기 발치)이다', () => {
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) expect(t.sortY).toBeGreaterThan(t.y);
  });
});

describe('3-5 시안의 나무 아홉 그루 뒤로 지나가기', () => {
  const village = trees.filter((t) => t.id.startsWith('tree-village-'));

  it('아홉 그루 모두, 줄기 북쪽에 걸어서 설 수 있는 자리가 있고 거기서는 나무가 캐릭터를 가린다', () => {
    expect(village).toHaveLength(9);
    for (const t of village) {
      const behind = [50, 60, 70, 80].map((d) => ({ x: t.x, y: t.sortY - d })).filter((p) => !grid.circleHitsBlocked(p.x, p.y));
      expect(behind.length, t.id).toBeGreaterThan(0);
      for (const p of behind) expect(hidesPlayer(t, p.y), t.id).toBe(true);
    }
  });

  it('아홉 그루 모두, 줄기 남쪽에 걸어서 설 수 있는 자리가 있고 거기서는 캐릭터가 나무 앞에 그려진다', () => {
    for (const t of village) {
      const front = [50, 70, 90].map((d) => ({ x: t.x, y: t.sortY + d })).filter((p) => !grid.circleHitsBlocked(p.x, p.y));
      expect(front.length, t.id).toBeGreaterThan(0);
      for (const p of front) expect(hidesPlayer(t, p.y), t.id).toBe(false);
    }
  });

  it('줄기 발치는 막혀 있어서, 앞에서 뒤로는 줄기를 뚫지 못하고 돌아가야 한다', () => {
    for (const t of village) expect(grid.isBlockedPoint(t.x, t.sortY), t.id).toBe(true);
  });
});
