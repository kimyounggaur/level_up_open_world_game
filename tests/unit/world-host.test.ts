// 월드 호스트: Phaser를 늦게 켜고, 준비 전 명령을 모았다가 보내고, 실패하면 다시 시도할 수 있다. 가짜 월드로 확인한다.
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WorldHost } from '../../src/app/world-host';
import type { StartWorld } from '../../src/app/world-host';
import { PLAYER_START, WorldMap, standOf } from '../../src/domain/world';
import type { WorldCommand } from '../../src/platform/bridge';
import type { StartWorldOptions, WorldHandle } from '../../src/world/start';
import { loadRegionDefs } from '../../tools/world-files';

const map = new WorldMap(loadRegionDefs(path.resolve(__dirname, '../..')));
const parent = {} as HTMLElement;

interface Fake {
  start: StartWorld;
  calls: StartWorldOptions[];
  destroyed: () => number;
  /** 월드가 준비됐다고 알린다 */
  ready: () => void;
}

function fakeStart(): Fake {
  const calls: StartWorldOptions[] = [];
  let destroyed = 0;
  const start: StartWorld = (o) => {
    calls.push(o);
    return { runtime: {} as WorldHandle['runtime'], scene: {} as WorldHandle['scene'], game: {} as WorldHandle['game'], destroy: () => void destroyed++ };
  };
  return { start, calls, destroyed: () => destroyed, ready: () => calls.at(-1)!.bridge.patchStatus({ ready: true }) };
}

describe('mount', () => {
  it('여러 번 불러도 한 번만 켜고, 켜기 전에는 Phaser 쪽 코드를 부르지 않는다', async () => {
    const f = fakeStart();
    const load = vi.fn(async () => f.start);
    const host = new WorldHost({ map, load });
    expect(load).not.toHaveBeenCalled();
    expect(host.running).toBe(false);
    await Promise.all([host.mount(parent), host.mount(parent), host.mount(parent)]);
    await host.mount(parent);
    expect(load).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ parent, map, start: { x: PLAYER_START.x, y: PLAYER_START.y, facing: 'down' } });
    expect(f.calls[0]!.bridge).toBe(host.bridge);
    expect(host.running).toBe(true);
  });

  it('놀이 악기를 월드에 그대로 넘긴다. 넘기지 않으면 빈 목록이다(6-9c)', async () => {
    const f = fakeStart();
    const drum = { playId: 'play.beat-river.drum', regionId: 'beat-river' as const, name: '물방울 북', x: 7700, y: 2200, timbre: 'thump' as const, pads: [{ dx: 0, dy: 0, midi: 48 }], echo: false, ground: 'pool' as const, availability: 'draft' as const, reviewStatus: 'unreviewed' as const, rightsStatus: 'unconfirmed' as const };
    const host = new WorldHost({ map, load: async () => f.start, play: [drum] });
    await host.mount(parent);
    expect(f.calls[0]!.play).toEqual([drum]);
    const g = fakeStart();
    const plain = new WorldHost({ map, load: async () => g.start });
    await plain.mount(parent);
    expect(g.calls[0]!.play).toEqual([]);
  });

  it('불러오기가 실패하면 오류 상태가 되고, 다시 부르면 다시 시도해 오류를 지운다', async () => {
    const f = fakeStart();
    let fail = true;
    const host = new WorldHost({
      map,
      load: async () => {
        if (fail) throw new Error('덩어리를 불러오지 못했어요');
        return f.start;
      },
    });
    await host.mount(parent);
    expect(host.running).toBe(false);
    expect(host.bridge.status.get().error).toBe('덩어리를 불러오지 못했어요');
    fail = false;
    await host.mount(parent);
    expect(host.running).toBe(true);
    expect(host.bridge.status.get().error).toBeNull();
  });

  it('월드 시작 함수가 던져도 오류 상태로 두고 앱은 계속된다', async () => {
    const host = new WorldHost({
      map,
      load: async () => () => {
        throw new Error('WebGL을 쓸 수 없어요');
      },
    });
    await expect(host.mount(parent)).resolves.toBeUndefined();
    expect(host.bridge.status.get().error).toBe('WebGL을 쓸 수 없어요');
    expect(host.running).toBe(false);
  });

  it('dispose 뒤에는 켜지 않고, 켜져 있던 월드는 정리한다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    await host.mount(parent);
    host.dispose();
    expect(f.destroyed()).toBe(1);
    await host.mount(parent);
    expect(f.calls).toHaveLength(1);
    // 켜는 도중에 dispose
    const g = fakeStart();
    const h2 = new WorldHost({ map, load: async () => g.start });
    const p = h2.mount(parent);
    h2.dispose();
    await p;
    expect(g.calls).toHaveLength(0);
  });
});

describe('command', () => {
  it('월드가 준비되기 전에 받은 걷기·이동 명령은 모았다가 준비되면 차례로 보낸다. 상호작용과 걷기 취소는 지금 눌렀을 때만 뜻이 있어 버린다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    const got: WorldCommand[] = [];
    host.bridge.commands.subscribe((c) => got.push(c));
    host.command({ type: 'teleport-to-station', stationId: 'H1' }); // 월드가 아직 없다
    await host.mount(parent);
    host.command({ type: 'walk-to-station', stationId: 'H2' }); // 켜졌지만 준비 전
    host.command({ type: 'interact' });
    host.command({ type: 'cancel-walk' });
    expect(got).toEqual([]);
    f.ready();
    expect(got).toEqual([
      { type: 'teleport-to-station', stationId: 'H1' },
      { type: 'walk-to-station', stationId: 'H2' },
    ]);
    host.command({ type: 'cancel-walk' }); // 준비된 뒤에는 바로 보낸다
    expect(got.at(-1)).toEqual({ type: 'cancel-walk' });
  });

  it('겹침 화면 때문에 월드가 멈춰 있는 동안의 걷기·이동 명령은 월드가 다시 움직일 때 보낸다(지도의 걸어가기, 바로 이동)', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    await host.mount(parent);
    f.ready();
    const got: WorldCommand[] = [];
    host.bridge.commands.subscribe((c) => got.push(c));
    host.bridge.pause.set(true); // 지도가 열려 있다
    host.command({ type: 'walk-to-station', stationId: 'H1' });
    host.command({ type: 'interact' }); // 멈춘 동안의 상호작용은 버린다
    host.teleportToStation('H2');
    expect(got).toEqual([]);
    host.bridge.pause.set(false); // 지도를 닫았다
    expect(got).toEqual([
      { type: 'walk-to-station', stationId: 'H1' },
      { type: 'teleport-to-station', stationId: 'H2' },
    ]);
    // 한 번 보낸 명령은 다시 보내지 않는다
    host.bridge.pause.set(true);
    host.bridge.pause.set(false);
    expect(got).toHaveLength(2);
  });

  it('이미 준비된 월드에는 바로 보낸다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    await host.mount(parent);
    f.ready();
    const got: WorldCommand[] = [];
    host.bridge.commands.subscribe((c) => got.push(c));
    host.command({ type: 'walk-to-station', stationId: 'H2' });
    expect(got).toEqual([{ type: 'walk-to-station', stationId: 'H2' }]);
  });

  it('모은 명령은 8개까지만 둔다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    for (let i = 0; i < 20; i++) host.command({ type: 'walk-to-station', stationId: 'H1' });
    await host.mount(parent);
    const got: WorldCommand[] = [];
    host.bridge.commands.subscribe((c) => got.push(c));
    f.ready();
    expect(got).toHaveLength(8);
  });
});

describe('teleportToStation', () => {
  it('월드가 없을 때는 시작 자리를 정거장 앞으로 바꿔 둔다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    expect(host.teleportToStation('H2')).toBe(true);
    await host.mount(parent);
    const stand = standOf(map.station('H2')!);
    expect(f.calls[0]!.start).toMatchObject({ x: stand.x, y: stand.y });
  });

  it('모르는 정거장은 거절한다', () => {
    const host = new WorldHost({ map, load: async () => fakeStart().start });
    expect(host.teleportToStation('Z9')).toBe(false);
  });

  it('월드가 켜져 있으면 월드에 명령한다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start });
    await host.mount(parent);
    f.ready();
    const got: WorldCommand[] = [];
    host.bridge.commands.subscribe((c) => got.push(c));
    expect(host.teleportToStation('E1')).toBe(true);
    expect(got).toEqual([{ type: 'teleport-to-station', stationId: 'E1' }]);
  });
});

describe('저장에서 복원한 시작 자리', () => {
  it('start 옵션이 월드 시작 자리가 된다', async () => {
    const f = fakeStart();
    const host = new WorldHost({ map, load: async () => f.start, start: { x: 5000, y: 3000, facing: 'left' } });
    expect(host.bridge.position.get()).toEqual({ x: 5000, y: 3000, facing: 'left' });
    await host.mount(parent);
    expect(f.calls[0]!.start).toEqual({ x: 5000, y: 3000, facing: 'left' });
  });
});
