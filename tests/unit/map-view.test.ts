// 악보 지도의 보기 계산(순수 함수): 전체 보기, 좌표 변환, 확대·축소, 끌어 옮기기, 화면 안으로 가져오기, 방향키로 다음 정거장.
import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W, regionBoundsPx } from '@/domain/world';
import { loadWorldMap } from '@/app/world-data';
import { ZOOM_MAX, ZOOM_MIN, centerOn, clampView, directionOfKey, ensureVisible, fitScale, fullView, panBy, placeNameLabels, placeRegionLabels, scaleOf, screenToWorld, stepStation, worldToScreen, zoomAt, zoomStep } from '@/ui/map/view';
import type { MapView, Viewport } from '@/ui/map/view';

const VP: Viewport = { width: 800, height: 560 };

describe('전체 보기', () => {
  it('월드 전체가 화면에 딱 들어온다: 가로와 세로 중 빡빡한 쪽에 맞춘다', () => {
    const s = fitScale(VP);
    expect(s).toBeCloseTo(Math.min(800 / WORLD_W, 560 / WORLD_H), 10);
    const v = fullView();
    const a = worldToScreen(v, VP, { x: 0, y: 0 });
    const b = worldToScreen(v, VP, { x: WORLD_W, y: WORLD_H });
    expect(b.x - a.x).toBeLessThanOrEqual(VP.width + 1e-6);
    expect(b.y - a.y).toBeLessThanOrEqual(VP.height + 1e-6);
    expect(Math.max((b.x - a.x) / VP.width, (b.y - a.y) / VP.height)).toBeCloseTo(1, 6);
  });

  it('월드가 화면보다 작은 쪽은 가운데에 놓인다', () => {
    const wide: Viewport = { width: 2000, height: 560 };
    const v = clampView({ cx: 100, cy: 100, zoom: 1 }, wide);
    expect(v.cx).toBe(WORLD_W / 2);
    expect(v.cy).toBe(WORLD_H / 2);
  });
});

describe('좌표 변환', () => {
  it('월드 → 화면 → 월드가 제자리로 돌아온다. 화면 가운데는 보기의 중심이다', () => {
    const v: MapView = { cx: 3000, cy: 2500, zoom: 2.5 };
    const p = { x: 3984, y: 3480 };
    const back = screenToWorld(v, VP, worldToScreen(v, VP, p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
    const mid = worldToScreen(v, VP, { x: v.cx, y: v.cy });
    expect(mid).toEqual({ x: VP.width / 2, y: VP.height / 2 });
  });

  it('배율은 전체 보기 배율의 zoom배다', () => {
    expect(scaleOf({ cx: 0, cy: 0, zoom: 3 }, VP)).toBeCloseTo(fitScale(VP) * 3, 10);
  });
});

describe('확대와 축소', () => {
  it('배율은 1과 4 사이다. 넘기려 해도 한계에 멈춘다', () => {
    let v = fullView();
    for (let i = 0; i < 12; i++) v = zoomStep(v, VP, 1);
    expect(v.zoom).toBe(ZOOM_MAX);
    for (let i = 0; i < 12; i++) v = zoomStep(v, VP, -1);
    expect(v.zoom).toBe(ZOOM_MIN);
    expect(zoomAt(fullView(), VP, Number.NaN).zoom).toBe(ZOOM_MIN);
  });

  it('기준점(화면 좌표) 아래의 월드 점은 확대해도 그 자리에 남는다', () => {
    const start: MapView = { cx: 4096, cy: 3072, zoom: 2 };
    const anchor = { x: 600, y: 200 };
    const under = screenToWorld(start, VP, anchor);
    const next = zoomAt(start, VP, 3.2, anchor);
    const now = worldToScreen(next, VP, under);
    expect(now.x).toBeCloseTo(anchor.x, 4);
    expect(now.y).toBeCloseTo(anchor.y, 4);
  });

  it('기준점이 없으면 화면 가운데가 기준이다', () => {
    const start: MapView = { cx: 3000, cy: 2000, zoom: 2 };
    const next = zoomAt(start, VP, 3);
    expect(next.cx).toBeCloseTo(3000, 4);
    expect(next.cy).toBeCloseTo(2000, 4);
  });

  it('줄이면 월드 밖이 보이지 않도록 가운데로 모인다', () => {
    const v = zoomAt({ cx: 7800, cy: 5900, zoom: 4 }, VP, 1);
    expect(v).toEqual(fullView());
  });
});

describe('끌어 옮기기와 화면 안으로 가져오기', () => {
  it('오른쪽으로 끌면 보기의 중심은 왼쪽으로 간다. 월드 밖으로는 못 간다', () => {
    const start: MapView = { cx: 4096, cy: 3072, zoom: 4 };
    const moved = panBy(start, VP, 100, 0);
    expect(moved.cx).toBeLessThan(start.cx);
    expect(moved.cy).toBe(start.cy);
    const far = panBy(start, VP, 1e9, 1e9);
    const half = VP.width / 2 / scaleOf(start, VP);
    expect(far.cx).toBeCloseTo(half, 4);
    expect(far.cy).toBeGreaterThan(0);
  });

  it('화면 안에 보이는 점은 그대로 두고, 밖이면 가운데로 옮긴다', () => {
    const v: MapView = { cx: 1000, cy: 1000, zoom: 3 };
    const inside = { x: 1100, y: 1050 };
    expect(ensureVisible(v, VP, inside)).toBe(v);
    const outside = { x: 6000, y: 4500 };
    const moved = ensureVisible(v, VP, outside);
    const at = worldToScreen(moved, VP, outside);
    expect(at.x).toBeGreaterThan(0);
    expect(at.x).toBeLessThan(VP.width);
    expect(moved.zoom).toBe(3);
  });

  it('centerOn은 배율도 바꿀 수 있다', () => {
    const v = centerOn(fullView(), VP, { x: 3984, y: 3480 }, 3);
    expect(v.zoom).toBe(3);
    expect(v.cx).toBeCloseTo(3984, 4);
    expect(v.cy).toBeCloseTo(3480, 4);
  });
});

describe('방향키로 다음 정거장', () => {
  const map = loadWorldMap();
  const items = map.stations;

  it('방향키 이름만 방향이 된다', () => {
    expect(directionOfKey('ArrowUp')).toBe('up');
    expect(directionOfKey('ArrowLeft')).toBe('left');
    expect(directionOfKey('a')).toBeNull();
    expect(directionOfKey('Enter')).toBeNull();
  });

  it('고른 정거장은 자기 자신으로 가지 않고, 그 방향 쪽의 정거장만 고른다', () => {
    for (const from of items) {
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = stepStation(items, from.stationId, dir);
        if (!next) continue;
        expect(next.stationId).not.toBe(from.stationId);
        if (dir === 'right') expect(next.x).toBeGreaterThan(from.x);
        if (dir === 'left') expect(next.x).toBeLessThan(from.x);
        if (dir === 'down') expect(next.y).toBeGreaterThan(from.y);
        if (dir === 'up') expect(next.y).toBeLessThan(from.y);
      }
    }
  });

  it('그 방향에 아무것도 없으면 null이다. 모르는 id도 null이다', () => {
    const rightmost = [...items].sort((a, b) => b.x - a.x)[0]!;
    expect(stepStation(items, rightmost.stationId, 'right')).toBeNull();
    expect(stepStation(items, 'ZZ', 'up')).toBeNull();
  });

  it('곧게 가까운 것이 비스듬한 것보다 먼저다', () => {
    const pts = [
      { stationId: 'a', x: 0, y: 0 },
      { stationId: 'b', x: 100, y: 90 },
      { stationId: 'c', x: 140, y: 0 },
    ];
    expect(stepStation(pts, 'a', 'right')!.stationId).toBe('c');
  });

  it('방향키만으로 모든 정거장에 닿을 수 있는가를 알린다(닿지 않는 곳은 목록으로 고른다)', () => {
    // 한 곳에서 시작해 네 방향으로 퍼져 닿는 정거장의 수를 센다. 모두 닿으면 방향키만으로도 충분하다는 뜻이다
    const seen = new Set<string>([items[0]!.stationId]);
    const queue = [items[0]!.stationId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = stepStation(items, id, dir);
        if (next && !seen.has(next.stationId)) {
          seen.add(next.stationId);
          queue.push(next.stationId);
        }
      }
    }
    expect(seen.size).toBe(items.length);
  });
});

describe('지역 이름표 자리', () => {
  const map = loadWorldMap();
  const boxes = map.regions.map((r) => ({ id: r.regionId, box: regionBoundsPx(r) }));

  it('후보 가운데 정거장에서 가장 먼 곳을 고른다', () => {
    const box = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    // 위쪽 후보 셋 중 왼쪽·가운데에 정거장을 두고, 아래쪽 후보 근처에도 정거장을 두면 오른쪽 위가 남는다
    const placed = placeRegionLabels(
      [{ id: 'r', box }],
      [
        { x: 250, y: 80 },
        { x: 500, y: 80 },
        { x: 250, y: 920 },
        { x: 500, y: 920 },
        { x: 750, y: 920 },
        { x: 250, y: 200 },
        { x: 500, y: 200 },
        { x: 250, y: 800 },
        { x: 500, y: 800 },
        { x: 750, y: 800 },
        { x: 750, y: 200 + 1 },
      ],
    );
    expect(placed.get('r')).toEqual({ x: 750, y: 80 });
  });

  it('이미 놓은 이름표도 피해서 놓는다(두 이름표가 겹치지 않는다)', () => {
    const box = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    const placed = placeRegionLabels(
      [
        { id: 'a', box },
        { id: 'b', box },
      ],
      [],
    );
    expect(placed.get('a')).not.toEqual(placed.get('b'));
  });

  it('정거장이 없어도 지역 안쪽 한 점을 돌려준다', () => {
    const box = { x0: 100, y0: 200, x1: 500, y1: 600 };
    const a = placeRegionLabels([{ id: 'r', box }], []).get('r')!;
    expect(a.x).toBeGreaterThanOrEqual(box.x0);
    expect(a.x).toBeLessThanOrEqual(box.x1);
    expect(a.y).toBeGreaterThanOrEqual(box.y0);
    expect(a.y).toBeLessThanOrEqual(box.y1);
  });

  it('여섯 지역 모두 이름표가 자기 지역 안에 놓이고, 정거장·다른 이름표와 8타일 넘게 떨어진다(가로는 1/3로 센다)', () => {
    const placed = placeRegionLabels(boxes, map.stations);
    expect(placed.size).toBe(6);
    const all = [...placed.entries()];
    for (const [id, a] of all) {
      const b = boxes.find((x) => x.id === id)!.box;
      expect(a.x, id).toBeGreaterThanOrEqual(b.x0);
      expect(a.x, id).toBeLessThanOrEqual(b.x1);
      expect(a.y, id).toBeGreaterThanOrEqual(b.y0);
      expect(a.y, id).toBeLessThanOrEqual(b.y1);
      const others = [...map.stations, ...all.filter(([k]) => k !== id).map(([, p]) => p)];
      const gap = Math.min(...others.map((p) => Math.hypot((p.x - a.x) / 3, p.y - a.y)));
      expect(gap, id).toBeGreaterThan(8 * 32);
    }
  });
});

describe('고른 정거장의 이름표와 내 위치 글자의 자리', () => {
  const STATION = { x: 400, y: 300 };
  const W = 88; // 네 글자 이름표를 넉넉하게 어림한 폭

  /** 고른 자리의 상자들이 서로 겹치는지 다시 계산한다(구현과 같은 상자 크기) */
  const boxes = (me: { x: number; y: number }, layout: ReturnType<typeof placeNameLabels>, w = W) => {
    const rel = (x0: number, y0: number, x1: number, y1: number) => ({ x0: STATION.x + x0, y0: STATION.y + y0, x1: STATION.x + x1, y1: STATION.y + y1 });
    const sides = {
      below: rel(-w / 2, 24, w / 2, 54),
      'below-left': rel(-w + 14, 24, 14, 54),
      'below-right': rel(-14, 24, w - 14, 54),
      above: rel(-w / 2, -54, w / 2, -24),
      'above-left': rel(-w + 14, -54, 14, -24),
      'above-right': rel(-14, -54, w - 14, -24),
      left: rel(-20 - w, -15, -20, 15),
      right: rel(20, -15, 20 + w, 15),
    } as const;
    const name = sides[layout.name];
    const marker = { x0: me.x - 15, y0: me.y - 15, x1: me.x + 15, y1: me.y + 15 };
    const label = layout.meBelow ? { x0: me.x - 31, y0: me.y + 15, x1: me.x + 31, y1: me.y + 41 } : { x0: me.x - 31, y0: me.y - 41, x1: me.x + 31, y1: me.y - 15 };
    const dot = rel(-14, -14, 14, 14);
    return { name, marker, label, dot };
  };
  const hit = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1;

  it('내 위치가 멀면 기본 자리다: 이름은 점 아래, 내 위치 글자는 표식 위', () => {
    expect(placeNameLabels(STATION, { x: 700, y: 500 }, W)).toEqual({ name: 'below', meBelow: false });
    expect(placeNameLabels(STATION, { x: 100, y: 100 }, W)).toEqual({ name: 'below', meBelow: false });
  });

  it('내 위치가 점 바로 아래(처음 열었을 때)면 이름은 위로, 내 위치 글자는 표식 아래로 간다', () => {
    expect(placeNameLabels(STATION, { x: 395, y: 330 }, W)).toEqual({ name: 'above', meBelow: true });
  });

  it('내 위치가 점의 아래 오른쪽이면 이름표를 왼쪽으로 비켜 아래에 둔다', () => {
    const layout = placeNameLabels(STATION, { x: 460, y: 340 }, 130);
    expect(layout).toEqual({ name: 'below-left', meBelow: false });
  });

  it('내 위치가 점의 아래 왼쪽이면 이름표를 오른쪽으로 비켜 아래에 둔다', () => {
    expect(placeNameLabels(STATION, { x: 340, y: 340 }, 130)).toEqual({ name: 'below-right', meBelow: false });
  });

  it('내 위치가 점 위에 있으면 기본 자리다(이름표는 아래라서 이미 비켜 있다)', () => {
    expect(placeNameLabels(STATION, { x: 400, y: 240 }, W).name).toBe('below');
  });

  it('점 둘레를 훑어도, 자리가 있으면 고른 자리의 이름표·내 위치 글자·표식·점이 서로 겹치지 않는다', () => {
    let solved = 0;
    for (let dx = -160; dx <= 160; dx += 8) {
      for (let dy = -120; dy <= 120; dy += 8) {
        const me = { x: STATION.x + dx, y: STATION.y + dy };
        // 표식과 점이 서로 닿을 만큼 가까운 자리는 건너뛴다(정거장 곁에 서 있을 때의 정상 모습)
        if (Math.abs(dx) < 30 && Math.abs(dy) < 30) continue;
        const layout = placeNameLabels(STATION, me, W);
        const b = boxes(me, layout);
        expect(hit(b.name, b.marker), `이름표×표식 (${dx}, ${dy}) ${layout.name}`).toBe(false);
        expect(hit(b.name, b.label), `이름표×내 위치 글자 (${dx}, ${dy}) ${layout.name}`).toBe(false);
        expect(hit(b.label, b.dot), `내 위치 글자×점 (${dx}, ${dy})`).toBe(false);
        solved++;
      }
    }
    expect(solved).toBeGreaterThan(500);
  });

  it('지역 이름표가 아래를 막고 있으면 그것을 피해 다른 자리를 고른다', () => {
    const region = { x0: 340, y0: 320, x1: 460, y1: 380 }; // 점 바로 아래(이름표 기본 자리)를 덮는다
    const layout = placeNameLabels(STATION, { x: 700, y: 500 }, W, { regions: [region] });
    expect(layout).toEqual({ name: 'above', meBelow: false });
    const b = boxes({ x: 700, y: 500 }, layout);
    expect(hit(b.name, region)).toBe(false);
  });

  it('지역 이름표를 피하는 자리가 아예 없으면 그것은 무시하고 내 위치 표식만 피한다', () => {
    const wall = { x0: 0, y0: 0, x1: 2000, y1: 2000 };
    expect(placeNameLabels(STATION, { x: 700, y: 500 }, W, { regions: [wall] })).toEqual({ name: 'below', meBelow: false });
    expect(placeNameLabels(STATION, { x: 395, y: 330 }, W, { regions: [wall] })).toEqual({ name: 'above', meBelow: true });
  });

  it('다른 정거장의 점이 막고 있으면 그것을 피해 다른 자리를 고른다. 점이 지역 이름표보다 먼저 지켜진다', () => {
    const farMe = { x: 700, y: 500 };
    const dotBelow = { x0: 380, y0: 330, x1: 408, y1: 358 }; // 아래 기본 자리에 걸린다
    const layout = placeNameLabels(STATION, farMe, W, { dots: [dotBelow] });
    expect(layout.name).not.toBe('below');
    expect(hit(boxes(farMe, layout).name, dotBelow)).toBe(false);
    // 점을 피하는 자리는 있지만 지역 이름표까지 피하는 자리는 없다: 점을 피하는 쪽을 고른다
    const regionEverywhere = { x0: 0, y0: 0, x1: 2000, y1: 2000 };
    const second = placeNameLabels(STATION, farMe, W, { dots: [dotBelow], regions: [regionEverywhere] });
    expect(hit(boxes(farMe, second).name, dotBelow)).toBe(false);
  });

  it('이름표가 아주 넓어도 위나 아래 한쪽은 비어 있어서 겹치지 않는 자리를 찾는다', () => {
    for (const me of [{ x: 400, y: 340 }, { x: 400, y: 260 }, { x: 410, y: 345 }]) {
      const layout = placeNameLabels(STATION, me, 4000);
      const b = boxes(me, layout, 4000);
      expect(hit(b.name, b.marker), `${me.x},${me.y}`).toBe(false);
      expect(hit(b.name, b.label), `${me.x},${me.y}`).toBe(false);
    }
  });

  it('위치를 알 수 없는 값(NaN)이 들어와도 던지지 않고 기본 자리를 돌려준다', () => {
    expect(placeNameLabels(STATION, { x: Number.NaN, y: Number.NaN }, W)).toEqual({ name: 'below', meBelow: false });
  });
});
