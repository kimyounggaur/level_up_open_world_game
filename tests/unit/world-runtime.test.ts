// 3-6 상호작용과 W-1: 월드 실행 로직. 걷기, 가까운 정거장 하나만 보이기, E로 열기, 정거장 누르기, 멈춤, 바로 이동, 저장 자리 복원.
// 실제 마을 데이터(충돌 격자 + 정거장 23곳)로 확인하고, 막힌 길 다시 찾기는 작은 격자로 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInstallation } from '../../src/domain/installation';
import type { InstallationDef } from '../../src/domain/installation';
import { INTERACT_RANGE, PLAYER_START, WALK_SPEED, WorldMap, standOf } from '../../src/domain/world';
import type { RegionDef } from '../../src/domain/world';
import { WorldBridge } from '../../src/platform/bridge';
import type { WorldEvent } from '../../src/platform/bridge';
import { nearestInteractable, pickInteractableAt } from '../../src/world/interact';
import { NavGrid } from '../../src/world/nav';
import { NAV_ROWS, STATION_HITS } from '../../src/world/generated/worldData';
import { MAX_REPLANS, POSITION_PUBLISH_INTERVAL, WorldRuntime } from '../../src/world/runtime';
import type { WorldRuntimeInit } from '../../src/world/runtime';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(__dirname, '../..');
const regions = loadRegionDefs(root);
const map = new WorldMap(regions);
const grid = NavGrid.fromRows(NAV_ROWS);
const NONE = { dx: 0, dy: 0 };

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
  const rt = new WorldRuntime({ map, grid, bridge, hits: STATION_HITS, start, ...over });
  return { rt, bridge, events };
}

/** 이벤트가 나오거나 maxSec이 지날 때까지 프레임을 돌린다. 걸린 시간(초)을 돌려준다 */
function runUntil(r: Rig, done: () => boolean, maxSec: number, fps = 30, input = NONE): number {
  const dt = 1 / fps;
  let t = 0;
  while (!done() && t < maxSec) {
    r.rt.update(dt, input);
    t += dt;
  }
  return t;
}

const hitCenter = (id: string): { x: number; y: number } => {
  const h = STATION_HITS[id]!;
  return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
};

describe('시작', () => {
  it('시작 자리에 서서 마을 이름이 보이고, 장면이 준비되기 전이다', () => {
    const { rt, bridge } = rig();
    expect(rt.player.x).toBe(PLAYER_START.x);
    expect(rt.player.y).toBe(PLAYER_START.y);
    expect(bridge.status.get().regionId).toBe('village');
    expect(bridge.status.get().ready).toBe(false); // 준비는 장면이 바닥 조각을 올린 뒤에 알린다
    expect(bridge.position.get()).toMatchObject({ x: PLAYER_START.x, y: PLAYER_START.y });
  });

  it('막힌 곳에서 시작하면 가장 가까운 걸을 수 있는 곳에 선다', () => {
    const c = hitCenter('H1'); // 건물 안
    expect(grid.circleHitsBlocked(c.x, c.y)).toBe(true);
    const { rt } = rig({ start: c });
    expect(grid.circleHitsBlocked(rt.player.x, rt.player.y)).toBe(false);
    expect(Math.hypot(rt.player.x - c.x, rt.player.y - c.y)).toBeLessThan(200);
  });

  it('바로 이동·시작 직후에는 카메라를 보간 없이 옮기라고 한 번만 알린다', () => {
    const { rt } = rig();
    expect(rt.consumeSnap()).toBe(true);
    expect(rt.consumeSnap()).toBe(false);
  });
});

describe('7.2 키보드로 걷기', () => {
  it('오른쪽 키를 1초 누르면 220 px 가고, 위치가 화면에 알려진다', () => {
    const { rt, bridge } = rig();
    const x0 = rt.player.x;
    for (let i = 0; i < 60; i++) rt.update(1 / 60, { dx: 1, dy: 0 });
    expect(rt.player.x - x0).toBeCloseTo(WALK_SPEED, 5);
    rt.update(1 / 60, NONE); // 멈추는 순간에는 바로 알린다
    expect(bridge.position.get().x).toBeCloseTo(rt.player.x, 6);
    expect(bridge.position.get().facing).toBe('right');
  });

  it(`위치 알림은 ${POSITION_PUBLISH_INTERVAL}초보다 자주 나가지 않는다`, () => {
    const { rt, bridge } = rig();
    let n = 0;
    bridge.position.subscribe(() => n++);
    for (let i = 0; i < 60; i++) rt.update(1 / 60, { dx: 1, dy: 0 });
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(11);
  });

  it('제자리에서는 알리지 않는다', () => {
    const { rt, bridge } = rig();
    let n = 0;
    bridge.position.subscribe(() => n++);
    for (let i = 0; i < 120; i++) rt.update(1 / 60, NONE);
    expect(n).toBe(0);
  });
});

describe('7.4 안내 칩과 E', () => {
  it('H1 앞에 서면 H1의 이름이 뜨고, E로 열면 open-station 사건이 나간다', () => {
    const h1 = map.station('H1')!;
    const stand = standOf(h1);
    const { rt, bridge, events } = rig({ start: stand });
    expect(bridge.status.get().near).toEqual({ stationId: 'H1', name: h1.name });
    bridge.commands.send({ type: 'interact' });
    expect(events).toEqual([{ type: 'open-station', stationId: 'H1' }]);
    expect(rt.interact()).toBe(true);
  });

  it('96 px 밖에서는 칩이 없고 E는 아무 일도 하지 않는다', () => {
    // 마을 가운데 시작 자리는 어느 정거장에서도 96 px 밖이다(아니면 이 시험의 전제가 틀린 것이다)
    const { rt, bridge, events } = rig();
    expect(nearestInteractable(rt.player, rt.interactables, INTERACT_RANGE)).toBeNull();
    expect(bridge.status.get().near).toBeNull();
    expect(rt.interact()).toBe(false);
    expect(events).toEqual([]);
  });

  it('칩이 뜨는 거리는 정확히 96 px이다(96 안, 97 밖)', () => {
    const stand = standOf(map.station('H1')!);
    // 서는 자리에서 북쪽으로 한 칸씩 떨어진 점 중 걸을 수 있고 다른 정거장이 가깝지 않은 곳을 찾는다
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const near = { x: stand.x + dx * 95, y: stand.y + dy * 95 };
      const far = { x: stand.x + dx * 97, y: stand.y + dy * 97 };
      if (grid.circleHitsBlocked(near.x, near.y) || grid.circleHitsBlocked(far.x, far.y)) continue;
      expect(rig({ start: near }).bridge.status.get().near?.stationId).toBe('H1');
      expect(rig({ start: far }).bridge.status.get().near?.stationId).not.toBe('H1');
      return;
    }
    throw new Error('H1 둘레에서 시험할 자리를 찾지 못했어요');
  });

  it('여러 정거장이 범위에 있으면 가장 가까운 하나만 보인다', () => {
    const region = (id: RegionDef['regionId'], stations: RegionDef['stations']): RegionDef => ({
      regionId: id,
      name: id,
      boundsTiles: id === 'village' ? { x0: 0, x1: 255, y0: 0, y1: 191 } : { x0: 0, x1: 0, y0: 0, y1: 0 },
      accentColor: '#17675D',
      ensemblePart: 'x',
      layerThresholds: [1, 2, 3],
      ambientBedId: 'x',
      landmark: { name: 'x', x: 0, y: 0 },
      stations,
    });
    const st = (stationId: string, x: number): RegionDef['stations'][number] => ({ stationId, name: `정거장 ${stationId}`, regionId: 'village', kind: 'panel', archetype: 'panel', x, y: 3000, questIds: [] });
    const tiny = new WorldMap([region('village', [st('H1', 3000), st('H2', 3060)])]);
    const open = new NavGrid(256, 192);
    const bridge = new WorldBridge({ x: 3020, y: 3000, facing: 'down' });
    const rt = new WorldRuntime({ map: tiny, grid: open, bridge, hits: {}, start: { x: 3020, y: 3000 } });
    expect(bridge.status.get().near?.stationId).toBe('H1'); // 20 px, 40 px
    rt.teleportTo(3045, 3000);
    expect(bridge.status.get().near?.stationId).toBe('H2'); // 45 px, 15 px
    rt.teleportTo(3500, 3000);
    expect(bridge.status.get().near).toBeNull();
  });
});

describe('7.2 누르기로 걷기', () => {
  it.each([
    ['H1', 'Q01'],
    ['H2', 'Q02'],
  ])('%s를 누르면 앞까지 걸어가 열린다(%s가 놓인 작업대)', (id) => {
    const r = rig();
    const res = r.rt.tap(hitCenter(id));
    expect(res.kind).toBe('station');
    expect(r.bridge.status.get().walking).toBe(true);
    const t = runUntil(r, () => r.events.some((e) => e.type === 'open-station'), 120);
    expect(r.events).toEqual([
      { type: 'arrived', stationId: id },
      { type: 'open-station', stationId: id },
    ]);
    const stand = standOf(map.station(id)!);
    expect(Math.hypot(r.rt.player.x - stand.x, r.rt.player.y - stand.y)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(r.bridge.status.get().walking).toBe(false);
    // 걸린 시간은 직선 거리/속도 이상이고, 너무 돌아가지 않았다
    const direct = Math.hypot(stand.x - PLAYER_START.x, stand.y - PLAYER_START.y) / WALK_SPEED;
    expect(t).toBeGreaterThanOrEqual(direct - 0.1);
    expect(t).toBeLessThan(direct * 2 + 1);
  });

  it('이미 앞에 서 있으면 정거장을 누르는 즉시 열린다', () => {
    const h1 = map.station('H1')!;
    const r = rig({ start: standOf(h1) });
    const res = r.rt.tap(hitCenter('H1'));
    expect(res).toMatchObject({ kind: 'station', stationId: 'H1', immediate: true });
    expect(r.events).toEqual([{ type: 'open-station', stationId: 'H1' }]);
    expect(r.bridge.status.get().walking).toBe(false);
  });

  it('빈 땅을 누르면 그 자리까지 걷고, 도착 자리를 한 번 알려 준다', () => {
    const r = rig();
    const goal = { x: 4184, y: 3480 }; // 시작 자리 동쪽의 탁 트인 길 위(몸이 어디에도 겹치지 않고 정거장 영역도 아니다)
    expect(grid.circleHitsBlocked(goal.x, goal.y)).toBe(false);
    expect(pickInteractableAt(goal, r.rt.interactables)).toBeNull();
    const res = r.rt.tap(goal);
    expect(res).toMatchObject({ kind: 'walk', adjusted: false });
    runUntil(r, () => !r.bridge.status.get().walking, 20);
    expect(Math.hypot(r.rt.player.x - goal.x, r.rt.player.y - goal.y)).toBeLessThan(1);
    expect(r.events).toEqual([{ type: 'arrived', stationId: null }]);
    const a = r.rt.consumeArrival()!;
    expect(a.x).toBeCloseTo(goal.x, 3);
    expect(r.rt.consumeArrival()).toBeNull();
  });

  it('갈 수 없는 곳(건물 안, 월드 밖)을 누르면 가장 가까운 갈 수 있는 곳으로 간다', () => {
    const wall = hitCenter('H3'); // 건물 안이지만 정거장 누르기 영역과 겹칠 수 있어 건물 한가운데를 쓴다
    for (const p of [{ x: -200, y: 3000 }, { x: 9000, y: 3000 }, { x: 4000, y: 9000 }, wall]) {
      const r = rig();
      const res = r.rt.tap(p);
      if (res.kind === 'station') {
        // 정거장 영역을 눌렀다면 정거장 규칙을 따른다(별도 시험)
        continue;
      }
      expect(res.kind).toBe('walk');
      if (res.kind === 'walk') {
        expect(res.adjusted).toBe(true);
        expect(grid.circleHitsBlocked(res.goal.x, res.goal.y)).toBe(false);
      }
      runUntil(r, () => !r.bridge.status.get().walking, 90);
      expect(r.bridge.status.get().walking).toBe(false);
    }
  });

  it('걷는 도중 키를 누르면 길은 접히고, 지나는 길의 정거장은 저절로 열리지 않는다', () => {
    const r = rig();
    r.rt.tap(hitCenter('H1'));
    runUntil(r, () => false, 0.5);
    expect(r.bridge.status.get().walking).toBe(true);
    r.rt.update(1 / 60, { dx: 0, dy: -1 }); // 키 입력
    expect(r.rt.player.path).toBeNull();
    expect(r.bridge.status.get().walking).toBe(false);
    runUntil(r, () => false, 60, 30, NONE);
    expect(r.events.filter((e) => e.type === 'open-station')).toEqual([]);
    expect(r.rt.walkGoal).toBeNull();
  });
});

describe('멈춤(패널이 열려 있는 동안)', () => {
  it('멈추면 움직이지 않고, 누르기와 E는 받지 않으며, 걷던 길도 접는다', () => {
    const r = rig();
    r.rt.tap({ x: PLAYER_START.x + 400, y: PLAYER_START.y });
    runUntil(r, () => false, 0.3);
    r.bridge.pause.set(true);
    expect(r.bridge.status.get()).toMatchObject({ paused: true, walking: false });
    const at = { x: r.rt.player.x, y: r.rt.player.y };
    runUntil(r, () => false, 1, 30, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBe(at.x);
    expect(r.rt.tap({ x: 0, y: 0 })).toEqual({ kind: 'none' });
    expect(r.rt.interact()).toBe(false);
    r.bridge.pause.set(false);
    expect(r.bridge.status.get().paused).toBe(false);
    r.rt.update(1 / 60, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBeGreaterThan(at.x);
  });

  it('멈춤은 상태라서, 월드가 시작하기 전에 이미 멈춰 있었어도 멈춘 채로 시작한다', () => {
    const bridge = new WorldBridge({ x: PLAYER_START.x, y: PLAYER_START.y, facing: 'down' });
    bridge.pause.set(true); // 패널을 주소로 먼저 열었다
    const r = rig({ bridge });
    expect(r.rt.paused).toBe(true);
    expect(bridge.status.get().paused).toBe(true);
    runUntil(r, () => false, 0.5, 30, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBe(PLAYER_START.x);
    bridge.pause.set(false);
    runUntil(r, () => false, 0.5, 30, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBeGreaterThan(PLAYER_START.x);
  });

  it('정거장으로 걷던 중 멈추면 다시 움직여도 저절로 열리지 않는다', () => {
    const r = rig();
    r.rt.tap(hitCenter('H2'));
    runUntil(r, () => false, 0.5);
    r.rt.setPaused(true);
    r.rt.setPaused(false);
    runUntil(r, () => false, 40);
    expect(r.events).toEqual([]);
  });
});

describe('3.7 지도: 걸어가기와 바로 이동', () => {
  it('바로 이동은 모든 정거장 앞에 세우고, 그 정거장이 가까운 정거장으로 뜬다(23곳)', () => {
    expect(map.stations).toHaveLength(23);
    for (const s of map.stations) {
      const r = rig();
      r.rt.consumeSnap();
      r.bridge.commands.send({ type: 'teleport-to-station', stationId: s.stationId });
      expect(r.rt.consumeSnap(), `${s.stationId} 바로 이동 뒤 카메라`).toBe(true);
      expect(grid.circleHitsBlocked(r.rt.player.x, r.rt.player.y), s.stationId).toBe(false);
      expect(r.bridge.status.get().near?.stationId, s.stationId).toBe(s.stationId);
      expect(r.bridge.status.get().regionId, s.stationId).toBe(s.regionId);
      expect(r.bridge.position.get().x).toBe(r.rt.player.x);
    }
  });

  it('걸어가기: 시작 자리에서 출발해 23곳을 차례로 걸어서 모두 도착한다(W-1)', () => {
    const r = rig();
    let worst = 0;
    for (const s of map.stations) {
      r.events.length = 0;
      expect(r.rt.walkToStation(s.stationId), s.stationId).toBe(true);
      const t = runUntil(r, () => r.events.some((e) => e.type === 'arrived'), 180);
      expect(r.events, `${s.stationId}에 도착하지 못했어요(${t.toFixed(0)}초)`).toEqual([{ type: 'arrived', stationId: s.stationId }]);
      const stand = standOf(s);
      expect(Math.hypot(r.rt.player.x - stand.x, r.rt.player.y - stand.y), s.stationId).toBeLessThanOrEqual(INTERACT_RANGE);
      expect(r.bridge.status.get().near?.stationId, `${s.stationId} 앞에서 칩`).toBe(s.stationId);
      worst = Math.max(worst, t);
    }
    // 월드 끝에서 끝까지도 1분 안쪽이다(8192 px ÷ 220 px/초 ≈ 37초, 돌아가는 길 포함)
    expect(worst).toBeLessThan(90);
  });

  it('바로 이동은 0.3초 화면 전환을 한 번 알린다. 걷기나 처음 시작에는 없다(3.7)', () => {
    const r = rig();
    expect(r.rt.consumeFade()).toBe(false); // 처음 시작
    r.bridge.commands.send({ type: 'teleport-to-station', stationId: 'K3' });
    expect(r.rt.consumeFade()).toBe(true);
    expect(r.rt.consumeFade()).toBe(false); // 한 번만
    r.rt.walkToStation('K1');
    runUntil(r, () => r.events.length > 0, 60);
    expect(r.rt.consumeFade()).toBe(false); // 걸어서 도착해도 전환은 없다
    r.bridge.commands.send({ type: 'teleport', x: 3500, y: 3000 });
    expect(r.rt.consumeFade()).toBe(true);
  });

  it('걸어가기는 도착해도 저절로 열지 않는다', () => {
    const r = rig();
    r.rt.walkToStation('H1');
    runUntil(r, () => r.events.length > 0, 60);
    expect(r.events.map((e) => e.type)).toEqual(['arrived']);
  });

  it('모르는 정거장 id는 아무 일도 하지 않는다', () => {
    const r = rig();
    expect(r.rt.walkToStation('Z9')).toBe(false);
    expect(r.rt.teleportToStation('Z9')).toBe(false);
    expect(r.rt.player.x).toBe(PLAYER_START.x);
  });
});

describe('저장한 자리로 서기', () => {
  it('막힌 곳이 저장돼 있으면 가장 가까운 갈 수 있는 곳에 서고, 위치가 알려진다', () => {
    const r = rig();
    const c = hitCenter('H3');
    r.bridge.commands.send({ type: 'teleport', x: c.x, y: c.y });
    expect(grid.circleHitsBlocked(r.rt.player.x, r.rt.player.y)).toBe(false);
    expect(r.bridge.position.get().x).toBe(r.rt.player.x);
    expect(r.rt.consumeSnap()).toBe(true);
  });

  it('숫자가 아닌 값은 무시한다', () => {
    const r = rig();
    expect(r.rt.teleportTo(Number.NaN, 5)).toBe(false);
    expect(r.rt.teleportTo(5, Number.POSITIVE_INFINITY)).toBe(false);
    expect(r.rt.player.x).toBe(PLAYER_START.x);
  });
});

describe('길이 닫혔을 때', () => {
  it(`걷다가 막히면 길을 다시 찾아 돌아간다(최대 ${MAX_REPLANS}번)`, () => {
    // 폭 20칸 × 높이 12칸. 가운데 세로 벽은 아직 없다.
    const g = new NavGrid(20, 12);
    const bridge = new WorldBridge({ x: 80, y: 160, facing: 'down' });
    const region: RegionDef = {
      regionId: 'village',
      name: 'v',
      boundsTiles: { x0: 0, x1: 19, y0: 0, y1: 11 },
      accentColor: '#17675D',
      ensemblePart: 'x',
      layerThresholds: [1, 2, 3],
      ambientBedId: 'x',
      landmark: { name: 'x', x: 0, y: 0 },
      stations: [],
    };
    const rt = new WorldRuntime({ map: new WorldMap([region]), grid: g, bridge, hits: {}, start: { x: 80, y: 176 } });
    const events: WorldEvent[] = [];
    bridge.events.subscribe((e) => events.push(e));
    const res = rt.tap({ x: 560, y: 176 });
    expect(res).toMatchObject({ kind: 'walk', adjusted: false });
    // 길이 정해진 뒤에 세로 벽이 생겼다(맨 아래 한 줄만 열어 둔다)
    for (let cy = 0; cy < 11; cy++) g.setBlocked(10, cy, true);
    for (let i = 0; i < 30 * 40 && events.length === 0; i++) rt.update(1 / 30, NONE);
    expect(events).toEqual([{ type: 'arrived', stationId: null }]);
    expect(Math.abs(rt.player.x - 560)).toBeLessThan(1); // 벽을 돌아서 누른 곳에 도착했다
    expect(Math.abs(rt.player.y - 176)).toBeLessThan(1);
  });
});

describe('끝내기', () => {
  it('dispose 뒤에는 명령을 받지 않는다', () => {
    const r = rig({ start: standOf(map.station('H1')!) });
    r.rt.dispose();
    r.bridge.commands.send({ type: 'interact' });
    r.bridge.pause.set(true);
    expect(r.events).toEqual([]);
    expect(r.bridge.commands.size).toBe(0);
    expect(r.rt.paused).toBe(false); // 멈춤 알림도 더는 받지 않는다
  });
});

// ───── 4.2 설치물 모드와 4.3 돌 밟기 ─────
describe('4.3 지나가며 돌 밟기', () => {
  const inst: InstallationDef = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', 'inst.village.scale-stones.json'), 'utf-8')), 'x.json').installation!;
  const id = inst.installationId;
  const stepped = (events: WorldEvent[]): number[] => events.filter((e): e is Extract<WorldEvent, { type: 'stepped' }> => e.type === 'stepped').map((e) => e.slot);
  const startAtH4 = (): { x: number; y: number } => standOf(map.station('H4')!);
  const right = { dx: 1, dy: 0 };

  it('정거장 앞에서 오른쪽으로 걸어가면 밟은 돌마다 한 번씩 사건이 나간다(1번, 2번 …)', () => {
    const r = rig({ start: startAtH4(), installations: [inst] });
    runUntil(r, () => false, 1, 60, right);
    expect(stepped(r.events)).toEqual([1, 2]);
    // 바깥에서 처음 올라선 돌에는 entered가 붙는다(돌 사이에는 틈이 있어 다음 돌도 틈을 지나 올라선 것이다)
    const events = r.events.filter((e) => e.type === 'stepped');
    expect(events[0]).toEqual({ type: 'stepped', installationId: id, slot: 1, entered: true });
  });

  it('칸이 이어진 종나무에서는 바깥에서 올라설 때만 entered가 붙고, 칸을 옮겨 밟을 때는 붙지 않는다(올라선 나무의 화음을 한 번만 울리는 근거, 4.6)', () => {
    const bell: InstallationDef = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', 'inst.bell-grove.three-bells.json'), 'utf-8')), 'x.json').installation!;
    // 시험용으로 열린 마을 땅(징검돌 곁)에 옮겨 놓는다: 첫 줄(고리 1)이 y 3619~3691, x 4560부터 네 칸이다
    const ox = 4560 - bell.slots[0]!.x;
    const oy = 3655 - (bell.slots[0]!.y + bell.slots[0]!.h / 2);
    const moved = { installationId: bell.installationId, slots: bell.slots.map((sl) => ({ ...sl, x: sl.x + ox, y: sl.y + oy })) };
    const r = rig({ start: { x: 4530, y: 3655 }, installations: [moved] });
    runUntil(r, () => false, 1.5, 60, right);
    const events = r.events.filter((e): e is Extract<WorldEvent, { type: 'stepped' }> => e.type === 'stepped');
    expect(events.map((e) => e.slot)).toEqual([1, 2, 3, 4]);
    expect(events[0]).toEqual({ type: 'stepped', installationId: bell.installationId, slot: 1, entered: true });
    for (const e of events.slice(1)) expect(e).toEqual({ type: 'stepped', installationId: bell.installationId, slot: e.slot });
    // 왼쪽으로 돌아 걷는 동안 나무 안의 칸 옮김(3, 2, 1번)에는 entered가 없다
    const stepsOf = (): Extract<WorldEvent, { type: 'stepped' }>[] => r.events.filter((e): e is Extract<WorldEvent, { type: 'stepped' }> => e.type === 'stepped');
    runUntil(r, () => false, 3, 60, { dx: -1, dy: 0 });
    const back = stepsOf().slice(events.length);
    expect(back.map((e) => e.slot)).toEqual([3, 2, 1]);
    for (const e of back) expect('entered' in e).toBe(false);
    // 나무를 벗어난 채로 다시 올라서면 다시 entered가 붙는다
    const seen = stepsOf().length;
    runUntil(r, () => false, 3, 60, right);
    const again = stepsOf().slice(seen);
    expect(again.map((e) => e.slot)).toEqual([1, 2, 3, 4]);
    expect(again[0]).toEqual({ type: 'stepped', installationId: bell.installationId, slot: 1, entered: true });
  });

  it('돌 줄을 벗어났다가 다시 올라서면 entered가 다시 붙는다', () => {
    const r = rig({ start: { x: 4600, y: 3655 }, installations: [inst] });
    runUntil(r, () => false, 0.5, 60, { dx: -1, dy: 0 }); // 1번 돌 왼쪽 바깥으로 내려온다
    runUntil(r, () => false, 0.5, 60, right); // 다시 1번 돌에 올라선다
    const events = r.events.filter((e): e is Extract<WorldEvent, { type: 'stepped' }> => e.type === 'stepped');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toEqual({ type: 'stepped', installationId: id, slot: 1, entered: true });
  });

  it('끝까지 걸으면 여덟 돌을 차례로 모두 밟는다', () => {
    const r = rig({ start: startAtH4(), installations: [inst] });
    runUntil(r, () => false, 4.4, 60, right);
    expect(stepped(r.events)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('같은 돌 위에서 서성이면 다시 울리지 않는다. 내려갔다가 다시 올라서면 다시 알린다', () => {
    const r = rig({ start: { x: 4600, y: 3655 }, installations: [inst] });
    runUntil(r, () => false, 0.1, 60, right); // 같은 1번 돌 안
    expect(stepped(r.events)).toEqual([]); // 처음부터 서 있던 돌은 밟은 것이 아니다
    runUntil(r, () => false, 0.5, 60, { dx: -1, dy: 0 }); // 왼쪽으로 돌 밖(4575 아래로)
    expect(stepped(r.events)).toEqual([]); // 내려오는 것은 조용하다
    runUntil(r, () => false, 0.5, 60, right); // 다시 올라선다
    expect(stepped(r.events)).toEqual([1]);
  });

  it('돌 줄 둘레를 걸어도(위쪽, 틈) 사건은 없다', () => {
    const r = rig({ start: { x: 4600, y: 3560 }, installations: [inst] }); // 돌 줄의 위쪽 바깥
    runUntil(r, () => false, 1, 60, right);
    expect(stepped(r.events)).toEqual([]);
  });

  it('바로 이동이나 저장 복원으로 돌 위에 서도 소리는 나지 않는다. 걸어 들어갈 때만 울린다', () => {
    const r = rig({ start: startAtH4(), installations: [inst] });
    r.bridge.commands.send({ type: 'teleport', x: 4700, y: 3655 });
    r.rt.update(1 / 60, NONE);
    expect(stepped(r.events)).toEqual([]);
    runUntil(r, () => false, 0.5, 60, right);
    expect(stepped(r.events)).not.toContain(2); // 2번 돌 위에서 시작했으니 같은 돌이다
  });

  it('시작 자리가 돌 위여도 사건은 없다', () => {
    const r = rig({ start: { x: 4700, y: 3655 }, installations: [inst] });
    r.rt.update(1 / 60, NONE);
    expect(stepped(r.events)).toEqual([]);
  });

  it('설치물을 넘기지 않으면 돌 밟기를 보지 않는다', () => {
    const r = rig({ start: startAtH4() });
    runUntil(r, () => false, 1, 60, right);
    expect(stepped(r.events)).toEqual([]);
  });
});

describe('4.2 설치물 모드: 캐릭터는 서 있고, 걷기 입력과 열기를 받지 않는다', () => {
  const mode = { installationId: 'inst.village.scale-stones', stationId: 'H4' };
  const inst: InstallationDef = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', 'inst.village.scale-stones.json'), 'utf-8')), 'x.json').installation!;

  it('이동 키가 와도 캐릭터는 움직이지 않는다. 모드를 나오면 다시 걷는다', () => {
    const r = rig({ start: standOf(map.station('H4')!), installations: [inst] });
    const x0 = r.rt.player.x;
    r.bridge.installationMode.set(mode);
    runUntil(r, () => false, 1, 60, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBe(x0);
    r.bridge.installationMode.set(null);
    runUntil(r, () => false, 0.5, 60, { dx: 1, dy: 0 });
    expect(r.rt.player.x).toBeGreaterThan(x0 + 50);
  });

  it('누르기는 걷지도 열지도 않고, E와 Enter도 정거장을 다시 열지 않는다', () => {
    const r = rig({ start: standOf(map.station('H4')!), installations: [inst] });
    r.bridge.installationMode.set(mode);
    expect(r.rt.tap({ x: 3000, y: 3000 })).toEqual({ kind: 'none' });
    expect(r.rt.tap(hitCenter('H4'))).toEqual({ kind: 'none' });
    expect(r.rt.interact()).toBe(false);
    r.bridge.commands.send({ type: 'interact' });
    expect(r.events.filter((e) => e.type === 'open-station')).toEqual([]);
    // 나오면 다시 열린다
    r.bridge.installationMode.set(null);
    expect(r.rt.interact()).toBe(true);
    expect(r.events.filter((e) => e.type === 'open-station')).toEqual([{ type: 'open-station', stationId: 'H4' }]);
  });

  it('걷던 길이 있던 채로 들어가도 길을 따라 걷지 않는다', () => {
    const r = rig({ start: { x: 3984, y: 3480 }, installations: [inst] });
    r.rt.tap({ x: 3984, y: 3900 });
    r.bridge.installationMode.set(mode);
    const y0 = r.rt.player.y;
    runUntil(r, () => false, 1, 60, NONE);
    expect(r.rt.player.y).toBeGreaterThanOrEqual(y0 - 0.001);
    expect(r.rt.player.y).toBeLessThan(y0 + 5);
  });
});

// ───── 7-1d 같은 땅을 나눠 쓰는 설치물: 계단밭 N1 N2 N3 ─────
describe('7-1d 겹친 밭을 걸을 때는 서는 자리가 가장 가까운 설치물만 밟았다고 알린다', () => {
  const load = (file: string): InstallationDef => parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', file), 'utf-8')), file).installation!;
  const n1 = load('inst.staff-hill.treble-terrace.json');
  const n2 = load('inst.staff-hill.bass-terrace.json');
  const n3 = load('inst.staff-hill.middle-ledge.json');
  const all = [n1, n2, n3];
  const steps = (events: WorldEvent[]): Array<Extract<WorldEvent, { type: 'stepped' }>> => events.filter((e): e is Extract<WorldEvent, { type: 'stepped' }> => e.type === 'stepped');
  const right = { dx: 1, dy: 0 };
  const FIELD_RUN_SEC = 5.6; // 이름표 띠(x 4320)에서 8번 열 끝(5428)을 지나 조금 더

  it('세 밭의 가로 범위는 같고, 세로로는 겹친다(N3는 N1과 N2의 땅을 모두 품는다)', () => {
    expect(n1.slots.map((s) => [s.x, s.w])).toEqual(n3.slots.map((s) => [s.x, s.w]));
    expect(n2.slots.map((s) => [s.x, s.w])).toEqual(n3.slots.map((s) => [s.x, s.w]));
    const spanOf = (i: InstallationDef): [number, number] => [Math.min(...i.slots.map((s) => s.y)), Math.max(...i.slots.map((s) => s.y + s.h))];
    expect(spanOf(n3)).toEqual([304, 1696]);
    expect(spanOf(n1)[1]).toBeGreaterThan(spanOf(n2)[0]); // N1과 N2도 가운데에서 겹친다
  });

  it('가운데(y 1000)에서 오른쪽으로 걸으면 열 여덟 개를 차례로 밟고, 알리는 것은 N3 하나뿐이다', () => {
    const r = rig({ start: { x: 4320, y: 1000 }, installations: all });
    runUntil(r, () => false, FIELD_RUN_SEC, 60, right);
    const seen = steps(r.events);
    expect(seen.map((e) => e.installationId)).toEqual(Array(8).fill(n3.installationId));
    expect(seen.map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 열 사이에는 44 px 틈이 있어서 열마다 바깥에서 올라선 것이다(entered)
    for (const e of seen) expect(e).toEqual({ type: 'stepped', installationId: n3.installationId, slot: e.slot, entered: true });
  });

  it('위쪽(y 700)에서는 N1만, 아래쪽(y 1300)에서는 N2만 알린다', () => {
    const top = rig({ start: { x: 4320, y: 700 }, installations: all });
    runUntil(top, () => false, FIELD_RUN_SEC, 60, right);
    expect(new Set(steps(top.events).map((e) => e.installationId))).toEqual(new Set([n1.installationId]));
    expect(steps(top.events).map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const low = rig({ start: { x: 4320, y: 1300 }, installations: all });
    runUntil(low, () => false, FIELD_RUN_SEC, 60, right);
    expect(new Set(steps(low.events).map((e) => e.installationId))).toEqual(new Set([n2.installationId]));
    expect(steps(low.events).map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('같은 열 안에서 위아래로 걸어 다른 밭의 땅으로 넘어가도 다시 울리지 않는다(칸이 바뀌지 않았다)', () => {
    const r = rig({ start: { x: 4400, y: 560 }, installations: all });
    runUntil(r, () => false, 4.5, 60, { dx: 0, dy: 1 }); // 220 px/s로 약 990 px 내려간다: N1 → N3 → N2의 땅
    expect(r.rt.player.y).toBeGreaterThan(1450);
    expect(steps(r.events)).toEqual([]);
  });

  it('위아래로 지나다가 옆 열로 옮기면 그때 서 있는 곳의 주인 하나만 알린다', () => {
    const r = rig({ start: { x: 4400, y: 560 }, installations: all });
    runUntil(r, () => false, 4.5, 60, { dx: 0, dy: 1 }); // 아래쪽(N2의 땅)까지 내려온다
    runUntil(r, () => false, 0.5, 60, right); // 첫 열(4352~4448)을 벗어나 두 번째 열(4492~4588)로 들어선다
    const seen = steps(r.events);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ installationId: n2.installationId, slot: 2 });
  });

  it('서는 자리를 모르는 설치물은 겨루지 않고 제 몫을 그대로 알린다(겹치지 않는 설치물은 영향이 없다)', () => {
    const rect = n3.slots[0]!;
    const a = { installationId: 'a', slots: [rect] };
    const b = { installationId: 'b', slots: [rect] };
    const r = rig({ start: { x: 4320, y: 1000 }, installations: [a, b] });
    runUntil(r, () => false, 0.5, 60, right);
    expect(steps(r.events).map((e) => e.installationId)).toEqual(['a', 'b']);
  });

  it('거리가 같으면 목록의 앞쪽 설치물이 주인이다', () => {
    const rect = n3.slots[0]!;
    // 발이 4360에 들어서는 순간 두 서는 자리까지의 거리가 같도록 위아래로 같은 만큼 벌려 놓는다
    const a = { installationId: 'a', slots: [rect], interactPoint: { x: 4200, y: 800 } };
    const b = { installationId: 'b', slots: [rect], interactPoint: { x: 4200, y: 1200 } };
    const r = rig({ start: { x: 4320, y: 1000 }, installations: [b, a] });
    runUntil(r, () => false, 0.4, 60, right);
    const seen = steps(r.events);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.installationId).toBe('b'); // 목록에서 앞선 쪽
  });
});
