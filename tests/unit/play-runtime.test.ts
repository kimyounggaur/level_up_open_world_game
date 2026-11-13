// 6-9c 놀이 악기의 월드 쪽(WorldRuntime): 걸어서 돌에 올라서면 'pad-struck' 사건이 한 번 나가고(밟은 돌의 번호),
// 같은 돌 위에 서 있는 동안은 다시 나가지 않고, 내려갔다 다시 올라서면 다시 나간다. 바로 이동·시작 자리·멈춤·설치물 모드에서는 조용하다.
// 실제 박자 강가·종나무 숲의 두 악기와 실제 충돌 격자로 확인한다. 소리와 그림은 다른 시험의 몫이다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPlayInstruments } from '../../src/app/discovery-data';
import { padSitesOf } from '../../src/domain/play';
import type { PlaySource } from '../../src/domain/play';
import { PLAYER_START, WALK_SPEED, WorldMap } from '../../src/domain/world';
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
const NONE = { dx: 0, dy: 0 };
const RIGHT = { dx: 1, dy: 0 };
const LEFT = { dx: -1, dy: 0 };

const PLAY = loadPlayInstruments('preview');
const DRUM = PLAY.find((p) => p.playId === 'play.beat-river.drum')!;
const WALL = PLAY.find((p) => p.playId === 'play.bell-grove.echo-wall')!;
const DRUM_ID = DRUM.playId;
const WALL_ID = WALL.playId;

interface Rig {
  rt: WorldRuntime;
  bridge: WorldBridge;
  events: WorldEvent[];
}

function rig(start: { x: number; y: number }, over: Partial<WorldRuntimeInit> = {}): Rig {
  const bridge = over.bridge ?? new WorldBridge({ x: start.x, y: start.y, facing: 'down' });
  const events: WorldEvent[] = [];
  bridge.events.subscribe((e) => events.push(e));
  const rt = new WorldRuntime({ map, grid, bridge, hits: STATION_HITS, start, play: PLAY, ...over });
  return { rt, bridge, events };
}

/** 조건이 맞거나 maxSec이 지날 때까지 프레임을 돌린다 */
function runUntil(r: Rig, done: () => boolean, maxSec: number, input = NONE, fps = 60): void {
  const dt = 1 / fps;
  let t = 0;
  while (!done() && t < maxSec) {
    r.rt.update(dt, input);
    t += dt;
  }
}
const run = (r: Rig, sec: number, input = NONE): void => runUntil(r, () => false, sec, input);

const pads = (events: WorldEvent[], playId?: string): number[] => events.filter((e): e is Extract<WorldEvent, { type: 'pad-struck' }> => e.type === 'pad-struck' && (playId === undefined || e.playId === playId)).map((e) => e.pad);
const site = (inst: PlaySource, pad: number) => padSitesOf(inst)[pad - 1]!;

describe('실제 데이터 확인', () => {
  it('물방울 북의 네 돌과 메아리 벽의 다섯 돌은 모두 걸어서 닿는 곳이고, 가로지르는 줄이 막히지 않았다', () => {
    for (const inst of [DRUM, WALL]) for (const s of padSitesOf(inst)) expect(grid.circleHitsBlocked(s.x, s.y), `${inst.playId} 돌 ${s.pad}`).toBe(false);
    // 아래 시험이 걷는 줄: 물방울 북 위쪽 줄(y 2128), 아래쪽 줄(y 2272), 메아리 벽 아래 줄(y 710)
    for (const [y, x0, x1] of [[2128, 7500, 7860], [2272, 7500, 7860], [710, 300, 900]] as const) {
      for (let x = x0; x <= x1; x += 8) expect(grid.circleHitsBlocked(x, y), `(${x}, ${y})`).toBe(false);
    }
  });
});

describe('물방울 북: 걸어서 돌에 올라서면 한 번씩 알린다', () => {
  it('위쪽 줄을 오른쪽으로 걸으면 1번, 2번 돌을 차례로 한 번씩 밟는다. 사건에는 악기 id와 돌 번호만 있다', () => {
    const r = rig({ x: 7500, y: 2128 });
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(r.rt.player.x).toBeGreaterThan(7860);
    expect(r.events.filter((e) => e.type === 'pad-struck')).toEqual([
      { type: 'pad-struck', playId: DRUM_ID, pad: 1 },
      { type: 'pad-struck', playId: DRUM_ID, pad: 2 },
    ]);
  });

  it('아래쪽 줄을 걸으면 4번, 3번 돌이다(번호는 파일의 돌 차례다)', () => {
    const r = rig({ x: 7500, y: 2272 });
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(pads(r.events)).toEqual([4, 3]);
  });

  it('돌과 돌 사이, 악기의 한가운데를 지나가는 줄에서는 아무 돌도 밟지 않는다(돌 가운데에서 72 px 떨어진 줄)', () => {
    const r = rig({ x: 7500, y: 2200 });
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(r.rt.player.x).toBeGreaterThan(7860);
    expect(pads(r.events)).toEqual([]);
  });

  it('같은 돌 위에 서 있는 동안은 다시 울리지 않는다', () => {
    const r = rig({ x: 7500, y: 2128 });
    runUntil(r, () => r.rt.player.x >= 7600, 3, RIGHT);
    expect(site(DRUM, 1).x - r.rt.player.x).toBeLessThan(44);
    run(r, 2); // 서 있는다
    // 돌 안에서 좌우로 조금씩 서성인다(6프레임 오른쪽, 6프레임 왼쪽: 한 번에 약 22 px)
    for (let i = 0; i < 6; i++) {
      for (let f = 0; f < 6; f++) r.rt.update(1 / 60, RIGHT);
      for (let f = 0; f < 6; f++) r.rt.update(1 / 60, LEFT);
    }
    expect(Math.abs(r.rt.player.x - site(DRUM, 1).x)).toBeLessThan(44); // 아직 1번 돌 위
    expect(pads(r.events)).toEqual([1]);
  });

  it('돌에서 내려오는 것은 조용하고, 내려갔다가 다시 올라서면 다시 알린다', () => {
    const r = rig({ x: 7500, y: 2128 });
    runUntil(r, () => r.rt.player.x >= 7600, 3, RIGHT);
    expect(pads(r.events)).toEqual([1]);
    runUntil(r, () => r.rt.player.x <= 7540, 3, LEFT); // 돌 밖(1번 돌 왼쪽 가장자리 7584보다 왼쪽)으로
    expect(pads(r.events)).toEqual([1]); // 내려오는 것은 사건이 없다
    runUntil(r, () => r.rt.player.x >= 7600, 3, RIGHT);
    expect(pads(r.events)).toEqual([1, 1]);
  });

  it('길을 눌러 걸어가도(길 찾기) 지나가는 돌마다 알린다', () => {
    const r = rig({ x: 7500, y: 2128 });
    const res = r.rt.tap({ x: 7860, y: 2128 });
    expect(res.kind).toBe('walk');
    runUntil(r, () => r.rt.consumeArrival() !== null, 5);
    expect(pads(r.events)).toEqual([1, 2]);
  });

  it('돌은 열 수 있는 자리가 아니다: 정거장 목록에도 없고 가까운 자리 안내도 뜨지 않는다(안내 칩과 E가 없는 설계)', () => {
    const r = rig({ x: 7628, y: 2128 });
    run(r, 0.5);
    expect(r.rt.interactables.some((i) => i.id.startsWith('play.'))).toBe(false);
    expect(r.bridge.status.get().near).toBeNull();
    expect(r.rt.interact()).toBe(false);
    expect(r.events.filter((e) => e.type !== 'pad-struck')).toEqual([]);
  });
});

describe('메아리 벽: 아래 줄을 걸으면 다섯 돌을 차례로 밟는다', () => {
  it('왼쪽에서 오른쪽으로 걸으면 1, 2, 3, 4, 5번 돌이다', () => {
    const r = rig({ x: 300, y: 710 });
    runUntil(r, () => r.rt.player.x > 900, 8, RIGHT);
    expect(r.rt.player.x).toBeGreaterThan(900);
    expect(r.events.filter((e) => e.type === 'pad-struck')).toEqual([1, 2, 3, 4, 5].map((pad) => ({ type: 'pad-struck', playId: WALL_ID, pad })));
  });

  it('오른쪽에서 왼쪽으로 걸으면 5, 4, 3, 2, 1번이다', () => {
    const r = rig({ x: 900, y: 710 });
    runUntil(r, () => r.rt.player.x < 300, 8, LEFT);
    expect(pads(r.events)).toEqual([5, 4, 3, 2, 1]);
  });

  it('돌 줄에서 조금 떨어진 줄(y 800)을 걸으면 아무 돌도 밟지 않는다', () => {
    const r = rig({ x: 300, y: 800 });
    runUntil(r, () => r.rt.player.x > 900, 8, RIGHT);
    expect(r.rt.player.x).toBeGreaterThan(900);
    expect(pads(r.events)).toEqual([]);
  });

  it('걷는 빠르기에서도 돌 사이의 틈(16 px)을 건너뛰어 돌을 놓치지 않는다: 천천히와 가장 빠르게 모두 다섯 번', () => {
    expect(WALK_SPEED * (1 / 60)).toBeLessThan(16); // 한 프레임에 틈보다 적게 간다
    for (const fps of [20, 30, 60, 120]) {
      const r = rig({ x: 300, y: 710 });
      runUntil(r, () => r.rt.player.x > 900, 8, RIGHT, fps);
      expect(pads(r.events), `${fps}fps`).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

describe('조용해야 할 때', () => {
  it('시작 자리가 돌 위여도 사건은 없고, 서 있어도 없다. 다음 돌로 걸어가면 그 돌만 알린다', () => {
    const s = site(DRUM, 1);
    const r = rig({ x: s.x, y: s.y });
    run(r, 1);
    expect(pads(r.events)).toEqual([]);
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(pads(r.events)).toEqual([2]); // 1번은 처음부터 서 있던 돌이다
  });

  it('바로 이동으로 돌 위에 서도 소리는 나지 않는다. 내려갔다 다시 걸어 올라서면 난다', () => {
    const r = rig({ x: 7500, y: 2128 });
    const s2 = site(DRUM, 2);
    r.bridge.commands.send({ type: 'teleport', x: s2.x, y: s2.y });
    r.rt.update(1 / 60, NONE);
    run(r, 0.5);
    expect(pads(r.events)).toEqual([]);
    runUntil(r, () => r.rt.player.x > 7860, 3, RIGHT); // 2번 돌에서 나간다(같은 돌 위라 사건 없음)
    expect(pads(r.events)).toEqual([]);
    runUntil(r, () => r.rt.player.x <= 7700, 3, LEFT); // 2번 돌로 걸어서 돌아온다
    expect(pads(r.events)).toEqual([2]);
  });

  it('멈춘 동안에는 걷지도 알리지도 않고, 멈춤을 풀면 다시 걷고 알린다', () => {
    const r = rig({ x: 7500, y: 2128 });
    r.bridge.pause.set(true);
    const x0 = r.rt.player.x;
    run(r, 1, RIGHT);
    expect(r.rt.player.x).toBe(x0);
    expect(pads(r.events)).toEqual([]);
    r.bridge.pause.set(false);
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(pads(r.events)).toEqual([1, 2]);
  });

  it('설치물 모드에서는 캐릭터가 서 있어서 돌을 밟지 않는다. 걷던 길도 접는다', () => {
    const r = rig({ x: 7500, y: 2128 });
    const res = r.rt.tap({ x: 7860, y: 2128 });
    expect(res.kind).toBe('walk');
    run(r, 0.1);
    r.bridge.installationMode.set({ installationId: 'inst.village.scale-stones', stationId: 'H4' });
    run(r, 3, RIGHT);
    expect(r.rt.player.x).toBeLessThan(7584); // 1번 돌의 왼쪽 가장자리에도 닿지 못했다
    expect(pads(r.events)).toEqual([]);
    r.bridge.installationMode.set(null);
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(pads(r.events)).toEqual([1, 2]);
  });

  it('놀이 악기를 넘기지 않으면 돌 밟기를 보지 않는다', () => {
    const r = rig({ x: 7500, y: 2128 }, { play: undefined });
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(r.rt.player.x).toBeGreaterThan(7860);
    expect(pads(r.events)).toEqual([]);
    const r2 = rig({ x: 7500, y: 2128 }, { play: [] });
    runUntil(r2, () => r2.rt.player.x > 7860, 5, RIGHT);
    expect(pads(r2.events)).toEqual([]);
  });

  it('마을(시작 자리)을 걸어 다니는 동안에는 돌 사건이 없다', () => {
    const r = rig({ x: PLAYER_START.x, y: PLAYER_START.y });
    run(r, 2, RIGHT);
    run(r, 2, { dx: 0, dy: -1 });
    expect(pads(r.events)).toEqual([]);
  });
});

describe('두 악기를 함께 넘겨도 악기마다 따로 센다', () => {
  it('메아리 벽의 돌 위에 서 있다가 바로 이동한 물방울 북에서 걸으면 물방울 북의 돌만 알린다', () => {
    const w = site(WALL, 3);
    const r = rig({ x: w.x, y: w.y });
    run(r, 0.3);
    r.bridge.commands.send({ type: 'teleport', x: 7500, y: 2128 });
    r.rt.update(1 / 60, NONE);
    runUntil(r, () => r.rt.player.x > 7860, 5, RIGHT);
    expect(pads(r.events, WALL_ID)).toEqual([]);
    expect(pads(r.events, DRUM_ID)).toEqual([1, 2]);
  });

  it('두 악기가 따로 서 있는 돌을 기억한다: 같은 번호의 돌이어도 악기가 다르면 새로 밟은 것이다', () => {
    // 가운데가 같은 점에 겹쳐 놓은 시험용 악기 둘: 한 돌에서 두 악기가 함께 울린다
    const a: PlaySource = { playId: 'play.test.a', x: 7628, y: 2128, pads: [{ dx: 0, dy: 0, midi: 60 }] };
    const b: PlaySource = { playId: 'play.test.b', x: 7628, y: 2128, pads: [{ dx: 0, dy: 0, midi: 64 }] };
    const r = rig({ x: 7500, y: 2128 }, { play: [a, b] });
    runUntil(r, () => r.rt.player.x >= 7600, 3, RIGHT);
    expect(r.events.filter((e) => e.type === 'pad-struck')).toEqual([
      { type: 'pad-struck', playId: 'play.test.a', pad: 1 },
      { type: 'pad-struck', playId: 'play.test.b', pad: 1 },
    ]);
  });
});
