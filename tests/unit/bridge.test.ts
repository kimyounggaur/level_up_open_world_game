// 10.2: 월드와 화면은 이벤트로만 만난다. 다리의 상태, 명령, 사건.
import { describe, expect, it, vi } from 'vitest';
import { Channel, INITIAL_STATUS, Store, WorldBridge } from '../../src/platform/bridge';

describe('Channel', () => {
  it('구독자 모두에게 차례로 전하고, 해제하면 더는 받지 않는다', () => {
    const ch = new Channel<number>();
    const a: number[] = [];
    const b: number[] = [];
    const offA = ch.subscribe((v) => a.push(v));
    ch.subscribe((v) => b.push(v * 10));
    ch.send(1);
    offA();
    ch.send(2);
    expect(a).toEqual([1]);
    expect(b).toEqual([10, 20]);
    expect(ch.size).toBe(1);
  });

  it('구독자가 던져도 나머지는 받는다', async () => {
    const ch = new Channel<number>();
    const got: number[] = [];
    ch.subscribe(() => {
      throw new Error('구독자 오류');
    });
    ch.subscribe((v) => got.push(v));
    const seen = vi.fn();
    process.once('uncaughtException', seen);
    ch.send(7);
    await new Promise((r) => setTimeout(r, 5));
    expect(got).toEqual([7]);
    process.removeListener('uncaughtException', seen);
  });
});

describe('Store', () => {
  it('바뀔 때만 알리고 같은 값이면 알리지 않는다', () => {
    const s = new Store(1);
    const seen: number[] = [];
    s.subscribe((v) => seen.push(v));
    s.set(1);
    s.set(2);
    s.update((n) => n + 1);
    expect(seen).toEqual([2, 3]);
    expect(s.get()).toBe(3);
  });
});

describe('WorldBridge', () => {
  it('처음 상태는 준비 전이고 마을에 서 있다', () => {
    const b = new WorldBridge({ x: 3984, y: 3480, facing: 'down' });
    expect(b.status.get()).toEqual(INITIAL_STATUS);
    expect(b.status.get().ready).toBe(false);
    expect(b.status.get().regionId).toBe('village');
    expect(b.position.get()).toEqual({ x: 3984, y: 3480, facing: 'down' });
  });

  it('patchStatus는 바뀐 것이 있을 때만 알린다(가까운 정거장은 id와 이름으로 비교)', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    const seen: unknown[] = [];
    b.status.subscribe((s) => seen.push(s));
    b.patchStatus({ ready: true });
    b.patchStatus({ ready: true });
    b.patchStatus({ near: { stationId: 'H1', name: '음자리 작업대' } });
    b.patchStatus({ near: { stationId: 'H1', name: '음자리 작업대' } }); // 새 객체지만 같은 정거장
    b.patchStatus({ near: null });
    b.patchStatus({ near: null });
    b.patchStatus({ regionId: 'staff-hill', paused: true });
    b.patchStatus({ error: '화면을 그릴 수 없어요' });
    b.patchStatus({ error: '화면을 그릴 수 없어요' });
    expect(seen).toHaveLength(5);
    expect(b.status.get()).toMatchObject({ ready: true, near: null, regionId: 'staff-hill', paused: true, error: '화면을 그릴 수 없어요' });
  });

  it('명령과 사건은 각자의 통로로 흐른다', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    const cmds: string[] = [];
    const evs: string[] = [];
    b.commands.subscribe((c) => cmds.push(c.type));
    b.events.subscribe((e) => evs.push(e.type));
    b.commands.send({ type: 'interact' });
    b.commands.send({ type: 'walk-to-station', stationId: 'H4' });
    b.events.send({ type: 'open-station', stationId: 'H1' });
    expect(cmds).toEqual(['interact', 'walk-to-station']);
    expect(evs).toEqual(['open-station']);
  });
});

describe('WorldBridge: 설치물 모드(4.2, 4.3)', () => {
  const mode = { installationId: 'inst.village.scale-stones', stationId: 'H4' };

  it('처음에는 설치물 모드가 아니고, 돌의 모습이 없고, 가려진 높이는 0이다', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    expect(b.installationMode.get()).toBeNull();
    expect(b.installationViews.get()).toEqual([]);
    expect(b.bottomInset.get()).toBe(0);
  });

  it('설치물 모드는 상태라서 월드가 늦게 시작해도 값을 읽는다. 바뀔 때만 알린다', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    const seen: unknown[] = [];
    b.installationMode.subscribe((m) => seen.push(m));
    b.installationMode.set(mode); // 월드가 시작하기 전에 이미 들어가 있어도 나중에 읽으면 같은 값이다
    expect(b.installationMode.get()).toEqual(mode);
    b.installationMode.set(mode);
    b.installationMode.set(null);
    b.installationMode.set(null);
    expect(seen).toEqual([mode, null]);
  });

  it('돌의 모습과 가려진 높이도 값이 바뀔 때 알린다', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    const views: number[] = [];
    const insets: number[] = [];
    b.installationViews.subscribe((v) => views.push(v.length));
    b.bottomInset.subscribe((n) => insets.push(n));
    b.installationViews.set([{ installationId: 'a', slots: [] }]);
    b.bottomInset.set(240);
    b.bottomInset.set(240);
    b.bottomInset.set(0);
    expect(views).toEqual([1]);
    expect(insets).toEqual([240, 0]);
  });

  it('밟기와 돌 누르기 사건은 사건 통로로 흐른다', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    const evs: unknown[] = [];
    b.events.subscribe((e) => evs.push(e));
    b.events.send({ type: 'stepped', installationId: 'a', slot: 2 });
    b.events.send({ type: 'slot-pressed', installationId: 'a', slot: 3 });
    expect(evs).toEqual([
      { type: 'stepped', installationId: 'a', slot: 2 },
      { type: 'slot-pressed', installationId: 'a', slot: 3 },
    ]);
  });

  it('징검다리 줄의 돌 누르기는 눌린 점의 틱(마디 처음부터)을 함께 싣는다. 틱은 없어도 된다(돌 줄은 칸 번호만 쓴다)', () => {
    const b = new WorldBridge({ x: 0, y: 0, facing: 'down' });
    const evs: unknown[] = [];
    b.events.subscribe((e) => evs.push(e));
    b.events.send({ type: 'slot-pressed', installationId: 'a', slot: 14, tick: 1620 });
    b.events.send({ type: 'slot-pressed', installationId: 'a', slot: 14, tick: 0 });
    b.events.send({ type: 'slot-pressed', installationId: 'a', slot: 14 });
    expect(evs).toEqual([
      { type: 'slot-pressed', installationId: 'a', slot: 14, tick: 1620 },
      // 0틱도 틱이다: 없는 것과 다르다
      { type: 'slot-pressed', installationId: 'a', slot: 14, tick: 0 },
      { type: 'slot-pressed', installationId: 'a', slot: 14 },
    ]);
    expect(Object.keys(evs[2] as object)).not.toContain('tick');
  });
});

