// 5-6 월드 실행부의 '정거장이 아닌 자리'(발견 요소, 광장 게시판): 가까이 가면 이름 칩(7.4), E와 누르기로 열기, 걸어가서 열기.
// 실제 마을 데이터(충돌 격자, 발견 요소 아홉 곳, 게시판)로 확인한다. 그림은 tests/flow가 본다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDiscoveries } from '../../src/app/discovery-data';
import { BOARD_SPOT, spotsOf } from '../../src/domain/discovery';
import { INTERACT_RANGE, PLAYER_START, WorldMap, standOf } from '../../src/domain/world';
import { WorldBridge } from '../../src/platform/bridge';
import type { WorldEvent } from '../../src/platform/bridge';
import { nearestInteractable } from '../../src/world/interact';
import { NavGrid } from '../../src/world/nav';
import { NAV_ROWS, STATION_HITS } from '../../src/world/generated/worldData';
import { WorldRuntime } from '../../src/world/runtime';
import type { WorldRuntimeInit } from '../../src/world/runtime';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(__dirname, '../..');
const map = new WorldMap(loadRegionDefs(root));
const grid = NavGrid.fromRows(NAV_ROWS);
const discoveries = loadDiscoveries('preview');
const spots = spotsOf(discoveries);
const NONE = { dx: 0, dy: 0 };
const spot = (id: string) => spots.find((s) => s.id === id)!;
const PIECE2 = spot('disc.village.piece-2');
const NOTE1 = spot('disc.village.note-1');

interface Rig {
  rt: WorldRuntime;
  bridge: WorldBridge;
  events: WorldEvent[];
}

function rig(over: Partial<WorldRuntimeInit> = {}): Rig {
  const start = over.start ?? { x: PLAYER_START.x, y: PLAYER_START.y };
  const bridge = over.bridge ?? new WorldBridge({ x: start.x, y: start.y, facing: 'down' });
  const events: WorldEvent[] = [];
  bridge.events.subscribe((e) => events.push(e));
  const rt = new WorldRuntime({ map, grid, bridge, hits: STATION_HITS, start, spots, ...over });
  return { rt, bridge, events };
}

function runUntil(r: Rig, done: () => boolean, maxSec: number, fps = 30): number {
  const dt = 1 / fps;
  let t = 0;
  while (!done() && t < maxSec) {
    r.rt.update(dt, NONE);
    t += dt;
  }
  return t;
}

describe('사물 목록', () => {
  it('정거장 23곳 가운데 이 판의 정거장 뒤에 발견 요소와 광장 게시판이 이어진다', () => {
    const { rt } = rig();
    expect(rt.interactables).toHaveLength(map.stations.length + spots.length);
    const tail = rt.interactables.slice(map.stations.length);
    expect(tail.map((i) => i.id)).toEqual(spots.map((s) => s.id));
    expect(tail.filter((i) => i.kind === 'discovery')).toHaveLength(discoveries.length);
    expect(tail.at(-1)).toMatchObject({ id: BOARD_SPOT.id, kind: 'board', name: '광장 게시판' });
  });

  it('자리를 넘기지 않으면 정거장만 있다(다른 판과 시험의 기존 동작)', () => {
    const { rt } = rig({ spots: undefined });
    expect(rt.interactables).toHaveLength(map.stations.length);
    expect(rt.interactables.every((i) => i.kind === 'panel' || i.kind === 'installation')).toBe(true);
  });

  it('누르기 영역은 자리 둘레 96 px 네모다', () => {
    const { rt } = rig();
    const it = rt.interactables.find((i) => i.id === PIECE2.id)!;
    expect(it.hit).toEqual({ x: PIECE2.x - 48, y: PIECE2.y - 48, w: 96, h: 96 });
  });
});

describe('7.4 이름 칩과 E', () => {
  it('소리 조각 앞에 서면 그 이름이 뜨고 종류가 적힌다. E로 열면 open-discovery 사건이 나간다', () => {
    const { rt, bridge, events } = rig({ start: { x: PIECE2.x, y: PIECE2.y } });
    expect(bridge.status.get().near).toEqual({ stationId: PIECE2.id, name: '바람결', spot: 'discovery' });
    expect(rt.interact()).toBe(true);
    expect(events).toEqual([{ type: 'open-discovery', discoveryId: PIECE2.id }]);
  });

  it('개념 쪽지도 같다', () => {
    const { rt, bridge, events } = rig({ start: { x: NOTE1.x, y: NOTE1.y } });
    expect(bridge.status.get().near).toMatchObject({ stationId: NOTE1.id, name: '같은 음, 다른 자리', spot: 'discovery' });
    bridge.commands.send({ type: 'interact' }); // 화면의 '열기' 단추와 같은 길
    expect(events).toEqual([{ type: 'open-discovery', discoveryId: NOTE1.id }]);
    expect(rt.interact()).toBe(true);
  });

  it('광장 게시판 앞에 서면 광장 게시판이 뜨고, E는 open-board 사건을 보낸다', () => {
    const { rt, bridge, events } = rig({ start: { x: BOARD_SPOT.x, y: BOARD_SPOT.y } });
    expect(bridge.status.get().near).toEqual({ stationId: BOARD_SPOT.id, name: '광장 게시판', spot: 'board' });
    expect(rt.interact()).toBe(true);
    expect(events).toEqual([{ type: 'open-board' }]);
  });

  it('정거장 앞에서는 칩에 spot이 없고 open-station이 나간다(기존 동작 그대로)', () => {
    const h1 = map.station('H1')!;
    const { rt, bridge, events } = rig({ start: standOf(h1) });
    expect(bridge.status.get().near).toEqual({ stationId: 'H1', name: h1.name });
    expect(rt.interact()).toBe(true);
    expect(events).toEqual([{ type: 'open-station', stationId: 'H1' }]);
  });

  it('칩이 뜨는 거리는 정확히 96 px이다(95 안, 97 밖)', () => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const near = { x: PIECE2.x + dx * 95, y: PIECE2.y + dy * 95 };
      const far = { x: PIECE2.x + dx * 97, y: PIECE2.y + dy * 97 };
      if (grid.circleHitsBlocked(near.x, near.y) || grid.circleHitsBlocked(far.x, far.y)) continue;
      expect(rig({ start: near }).bridge.status.get().near?.stationId).toBe(PIECE2.id);
      expect(rig({ start: far }).bridge.status.get().near?.stationId).not.toBe(PIECE2.id);
      return;
    }
    throw new Error('소리 조각 둘레에서 시험할 자리를 찾지 못했어요');
  });

  it('96 px 밖에서는 칩이 없고 E는 아무 일도 하지 않는다(시작 자리에서)', () => {
    const { rt, bridge, events } = rig();
    expect(nearestInteractable(rt.player, rt.interactables, INTERACT_RANGE)).toBeNull();
    expect(bridge.status.get().near).toBeNull();
    expect(rt.interact()).toBe(false);
    expect(events).toEqual([]);
  });

  it('정거장과 자리가 함께 범위에 있으면 가장 가까운 하나만 보인다', () => {
    const open = new NavGrid(256, 192);
    const st = { stationId: 'H1', name: '작업대', regionId: 'village' as const, kind: 'panel' as const, archetype: 'panel' as const, x: 3000, y: 3000, questIds: [] };
    const region = { regionId: 'village' as const, name: 'v', boundsTiles: { x0: 0, x1: 255, y0: 0, y1: 191 }, accentColor: '#17675D', ensemblePart: 'x', layerThresholds: [1, 2, 3] as [number, number, number], ambientBedId: 'x', landmark: { name: 'x', x: 0, y: 0 }, stations: [st] };
    const tiny = new WorldMap([region, ...(['staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh'] as const).map((id) => ({ ...region, regionId: id, boundsTiles: { x0: 0, x1: 0, y0: 0, y1: 0 }, stations: [] }))]);
    const bridge = new WorldBridge({ x: 3020, y: 3000, facing: 'down' });
    const rt = new WorldRuntime({ map: tiny, grid: open, bridge, hits: {}, start: { x: 3020, y: 3000 }, spots: [{ id: 'disc.x.piece-1', name: '조각', x: 3070, y: 3000, kind: 'discovery' }] });
    expect(bridge.status.get().near?.stationId).toBe('H1'); // 20 px, 50 px
    rt.teleportTo(3060, 3000);
    expect(bridge.status.get().near).toEqual({ stationId: 'disc.x.piece-1', name: '조각', spot: 'discovery' }); // 60 px, 10 px
    rt.teleportTo(3500, 3000);
    expect(bridge.status.get().near).toBeNull();
  });

  it('월드가 멈춰 있으면(패널이나 겹침 화면이 열려 있다) E로 열리지 않는다', () => {
    const { rt, bridge, events } = rig({ start: { x: PIECE2.x, y: PIECE2.y } });
    bridge.pause.set(true);
    expect(rt.interact()).toBe(false);
    expect(events).toEqual([]);
    bridge.pause.set(false);
    expect(rt.interact()).toBe(true);
  });
});

describe('7.2 누르기로 걷기: 자리를 누르면 앞까지 걸어가 연다', () => {
  it('이미 앞에 서 있으면 누르는 즉시 열린다', () => {
    const r = rig({ start: { x: PIECE2.x, y: PIECE2.y } });
    const res = r.rt.tap({ x: PIECE2.x, y: PIECE2.y });
    expect(res).toMatchObject({ kind: 'spot', spotId: PIECE2.id, immediate: true });
    expect(r.events).toEqual([{ type: 'open-discovery', discoveryId: PIECE2.id }]);
    expect(r.bridge.status.get().walking).toBe(false);
  });

  it('멀리서 누르면 걸어가서, 도착하면 도착 사건(정거장 없음)과 열기 사건이 차례로 나간다', () => {
    const r = rig();
    const res = r.rt.tap({ x: PIECE2.x, y: PIECE2.y });
    expect(res).toMatchObject({ kind: 'spot', spotId: PIECE2.id, immediate: false });
    expect(r.bridge.status.get().walking).toBe(true);
    runUntil(r, () => r.events.some((e) => e.type === 'open-discovery'), 200);
    expect(r.events).toEqual([
      { type: 'arrived', stationId: null },
      { type: 'open-discovery', discoveryId: PIECE2.id },
    ]);
    expect(Math.hypot(r.rt.player.x - PIECE2.x, r.rt.player.y - PIECE2.y)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(r.bridge.status.get().walking).toBe(false);
  });

  it('광장 게시판도 누르면 걸어가서 open-board 사건을 보낸다', () => {
    const r = rig();
    expect(r.rt.tap({ x: BOARD_SPOT.x, y: BOARD_SPOT.y })).toMatchObject({ kind: 'spot', spotId: BOARD_SPOT.id });
    runUntil(r, () => r.events.some((e) => e.type === 'open-board'), 200);
    expect(r.events.map((e) => e.type)).toEqual(['arrived', 'open-board']);
  });

  it('걷는 도중 키를 누르면 걷기가 멈추고 열리지 않는다(7.2)', () => {
    const r = rig();
    r.rt.tap({ x: PIECE2.x, y: PIECE2.y });
    runUntil(r, () => false, 1);
    r.rt.update(1 / 30, { dx: -1, dy: 0 });
    expect(r.bridge.status.get().walking).toBe(false);
    runUntil(r, () => false, 60);
    expect(r.events.filter((e) => e.type === 'open-discovery')).toEqual([]);
  });

  it('열린 사건은 걸어간 길의 끝에서 한 번만 나간다', () => {
    const r = rig();
    r.rt.tap({ x: NOTE1.x, y: NOTE1.y });
    runUntil(r, () => r.events.some((e) => e.type === 'open-discovery'), 200);
    runUntil(r, () => false, 5);
    expect(r.events.filter((e) => e.type === 'open-discovery')).toHaveLength(1);
  });

  it('지도의 걸어가기(정거장)는 여전히 도착해도 저절로 열지 않는다', () => {
    const r = rig();
    expect(r.rt.walkToStation('H1')).toBe(true);
    runUntil(r, () => r.events.some((e) => e.type === 'arrived'), 200);
    expect(r.events).toEqual([{ type: 'arrived', stationId: 'H1' }]);
  });
});

describe('3.6-1 걸어서 닿는다: 발견 요소 아홉 곳과 게시판 모두', () => {
  it.each(spots.map((s) => [s.id, s]))('%s: 시작 자리에서 눌러 걸어가면 앞에 닿아 열린다', (_id, s) => {
    const r = rig();
    expect(r.rt.tap({ x: s.x, y: s.y }).kind).toBe('spot');
    const open = s.kind === 'board' ? 'open-board' : 'open-discovery';
    const t = runUntil(r, () => r.events.some((e) => e.type === open), 400);
    expect(r.events.some((e) => e.type === open), `${Math.round(t)}초 걸어도 닿지 못했어요`).toBe(true);
    expect(Math.hypot(r.rt.player.x - s.x, r.rt.player.y - s.y)).toBeLessThanOrEqual(INTERACT_RANGE);
  });
});
