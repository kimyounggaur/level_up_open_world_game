// 7-6 월드 실행부의 주민(악사): 가까이 가면 이름 칩(7.4), E와 누르기로 말 걸기, 걸어가서 말 걸기.
// 실제 월드 데이터(충돌 격자, 정거장, 발견 요소, 게시판)에 주민 여섯을 더해 확인한다. 그림은 resident-layer.test.ts와 tests/flow가 본다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDiscoveries } from '../../src/app/discovery-data';
import { spotsOf } from '../../src/domain/discovery';
import { RESIDENTS, residentSpots } from '../../src/domain/residents';
import { INTERACT_RANGE, PLAYER_START, WorldMap, standOf } from '../../src/domain/world';
import { WorldBridge } from '../../src/platform/bridge';
import type { WorldEvent } from '../../src/platform/bridge';
import { NavGrid } from '../../src/world/nav';
import { NAV_ROWS, STATION_HITS } from '../../src/world/generated/worldData';
import { WorldRuntime } from '../../src/world/runtime';
import type { WorldRuntimeInit } from '../../src/world/runtime';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(__dirname, '../..');
const map = new WorldMap(loadRegionDefs(root));
const grid = NavGrid.fromRows(NAV_ROWS);
const discoveries = loadDiscoveries('preview');
const spots = [...spotsOf(discoveries), ...residentSpots()];
const NONE = { dx: 0, dy: 0 };
const resident = (regionId: string) => RESIDENTS.find((r) => r.regionId === regionId)!;
const HILL = resident('staff-hill');
const MARSH = resident('key-marsh');

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
  it('정거장 뒤에 발견 요소와 광장 게시판이 이어지고, 그 뒤에 주민 여섯이 지역의 차례로 이어진다', () => {
    const { rt } = rig();
    expect(rt.interactables).toHaveLength(map.stations.length + spots.length);
    const tail = rt.interactables.slice(-6);
    expect(tail.map((i) => i.id)).toEqual(RESIDENTS.map((r) => r.residentId));
    expect(tail.every((i) => i.kind === 'resident')).toBe(true);
    expect(tail.map((i) => i.name)).toEqual(RESIDENTS.map((r) => r.name));
  });

  it('누르기 영역은 자리 둘레 96 px 네모다(서 있는 자리가 가운데)', () => {
    const { rt } = rig();
    const it = rt.interactables.find((i) => i.id === HILL.residentId)!;
    expect(it.hit).toEqual({ x: HILL.x - 48, y: HILL.y - 48, w: 96, h: 96 });
  });
});

describe('7.4 이름 칩과 E', () => {
  it('주민 앞에 서면 그 이름이 뜨고 종류가 적힌다. E로 열면 open-resident 사건이 나간다', () => {
    const { rt, bridge, events } = rig({ start: { x: HILL.x, y: HILL.y } });
    expect(bridge.status.get().near).toEqual({ stationId: HILL.residentId, name: '오선 언덕의 가락 악사', spot: 'resident' });
    expect(rt.interact()).toBe(true);
    expect(events).toEqual([{ type: 'open-resident', residentId: HILL.residentId }]);
  });

  it('화면의 상호작용 버튼(명령 interact)도 같은 길로 열린다', () => {
    const { bridge, events } = rig({ start: { x: MARSH.x, y: MARSH.y } });
    bridge.commands.send({ type: 'interact' });
    expect(events).toEqual([{ type: 'open-resident', residentId: MARSH.residentId }]);
  });

  it('여섯 주민 모두 앞에서 자기 이름의 칩이 뜬다(가장 가까운 사물이 그 주민이다)', () => {
    for (const r of RESIDENTS) {
      const { bridge } = rig({ start: { x: r.x, y: r.y } });
      expect(bridge.status.get().near, r.name).toEqual({ stationId: r.residentId, name: r.name, spot: 'resident' });
    }
  });

  it('칩이 뜨는 거리는 정확히 96 px이다(95 안, 97 밖)', () => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const near = { x: HILL.x + dx * 95, y: HILL.y + dy * 95 };
      const far = { x: HILL.x + dx * 97, y: HILL.y + dy * 97 };
      if (grid.circleHitsBlocked(near.x, near.y) || grid.circleHitsBlocked(far.x, far.y)) continue;
      expect(rig({ start: near }).bridge.status.get().near?.stationId).toBe(HILL.residentId);
      expect(rig({ start: far }).bridge.status.get().near?.stationId).not.toBe(HILL.residentId);
      return;
    }
    throw new Error('주민 둘레에서 시험할 자리를 찾지 못했어요');
  });

  it('시작 자리에서는 칩이 없고 E는 아무 일도 하지 않는다', () => {
    const { rt, bridge, events } = rig();
    expect(bridge.status.get().near).toBeNull();
    expect(rt.interact()).toBe(false);
    expect(events).toEqual([]);
  });

  it('월드가 멈춰 있으면(말 건 카드나 겹침 화면이 열려 있다) E로 다시 열리지 않는다', () => {
    const { rt, bridge, events } = rig({ start: { x: HILL.x, y: HILL.y } });
    bridge.pause.set(true);
    expect(rt.interact()).toBe(false);
    expect(events).toEqual([]);
    bridge.pause.set(false);
    expect(rt.interact()).toBe(true);
    expect(events).toEqual([{ type: 'open-resident', residentId: HILL.residentId }]);
  });

  it('정거장 앞에서는 칩에 spot이 없고 open-station이 나간다(기존 동작 그대로)', () => {
    const h1 = map.station('H1')!;
    const { rt, bridge, events } = rig({ start: standOf(h1) });
    expect(bridge.status.get().near).toEqual({ stationId: 'H1', name: h1.name });
    expect(rt.interact()).toBe(true);
    expect(events).toEqual([{ type: 'open-station', stationId: 'H1' }]);
  });
});

describe('7.2 누르기로 걷기: 주민을 누르면 앞까지 걸어가 말을 건다', () => {
  it('이미 앞에 서 있으면 누르는 즉시 열린다', () => {
    const r = rig({ start: { x: HILL.x, y: HILL.y } });
    const res = r.rt.tap({ x: HILL.x, y: HILL.y });
    expect(res).toMatchObject({ kind: 'spot', spotId: HILL.residentId, immediate: true });
    expect(r.events).toEqual([{ type: 'open-resident', residentId: HILL.residentId }]);
    expect(r.bridge.status.get().walking).toBe(false);
  });

  it('주민의 머리 쪽(발치 위 54 px)을 눌러도 그 주민을 누른 것이다: 그림 칸 48×72 전체가 눌린다', () => {
    const r = rig({ start: { x: HILL.x, y: HILL.y } });
    for (const [dx, dy] of [[0, -54], [-20, -36], [20, -36], [0, -10]] as const) {
      expect(r.rt.tap({ x: HILL.x + dx, y: HILL.y + dy }), `${dx},${dy}`).toMatchObject({ kind: 'spot', spotId: HILL.residentId });
    }
  });

  it('멀리서 누르면 걸어가서, 도착하면 도착 사건(정거장 없음)과 열기 사건이 차례로 나간다', () => {
    const r = rig();
    const res = r.rt.tap({ x: HILL.x, y: HILL.y });
    expect(res).toMatchObject({ kind: 'spot', spotId: HILL.residentId, immediate: false });
    expect(r.bridge.status.get().walking).toBe(true);
    runUntil(r, () => r.events.some((e) => e.type === 'open-resident'), 300);
    expect(r.events).toEqual([
      { type: 'arrived', stationId: null },
      { type: 'open-resident', residentId: HILL.residentId },
    ]);
    expect(Math.hypot(r.rt.player.x - HILL.x, r.rt.player.y - HILL.y)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(r.bridge.status.get().walking).toBe(false);
  });

  it('여섯 주민 모두 시작 자리에서 걸어가 말을 걸 수 있다(W-1: 어디나 걸어서 닿는다)', () => {
    for (const p of RESIDENTS) {
      const r = rig();
      r.rt.tap({ x: p.x, y: p.y });
      runUntil(r, () => r.events.some((e) => e.type === 'open-resident'), 400);
      expect(r.events.filter((e) => e.type === 'open-resident'), p.name).toEqual([{ type: 'open-resident', residentId: p.residentId }]);
    }
  });

  it('걷는 도중 키를 누르면 걷기가 멈추고 열리지 않는다(7.2)', () => {
    const r = rig();
    r.rt.tap({ x: HILL.x, y: HILL.y });
    runUntil(r, () => false, 1);
    r.rt.update(1 / 30, { dx: -1, dy: 0 });
    expect(r.bridge.status.get().walking).toBe(false);
    runUntil(r, () => false, 60);
    expect(r.events.filter((e) => e.type === 'open-resident')).toEqual([]);
  });

  it('열린 사건은 걸어간 길의 끝에서 한 번만 나간다', () => {
    const r = rig();
    r.rt.tap({ x: MARSH.x, y: MARSH.y });
    runUntil(r, () => r.events.some((e) => e.type === 'open-resident'), 400);
    runUntil(r, () => false, 5);
    expect(r.events.filter((e) => e.type === 'open-resident')).toHaveLength(1);
  });
});

describe('주민은 길을 막지 않는다(W-1)', () => {
  it('주민의 자리를 지나 걸을 수 있다: 주민 앞에 서서 걷기를 시작해도 길이 막히지 않는다', () => {
    const r = rig({ start: { x: HILL.x, y: HILL.y } });
    r.rt.update(1 / 30, { dx: 1, dy: 0 });
    r.rt.update(1 / 30, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBeGreaterThan(HILL.x);
  });

  it('주민이 없는 판(자리를 넘기지 않음)에서도 월드는 그대로 돈다', () => {
    const { rt } = rig({ spots: spotsOf(discoveries) });
    expect(rt.interactables.some((i) => i.kind === 'resident')).toBe(false);
  });
});
