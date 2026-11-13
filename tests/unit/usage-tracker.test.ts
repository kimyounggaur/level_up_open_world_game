// @vitest-environment jsdom
// 4-8 사용 기록의 앱 연결(설계서 13.2): 앱을 실제로 올려 조작하면 13.2의 사건이 각각 사용 기록에 나오는지 확인한다.
// 월드는 가짜로 대신한다(진짜 월드로 걷는 길과 파일로 내보내는 길은 tests/flow/usagelog.flow.ts가 확인한다).
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { entryRouteOf, screenOf } from '@/app/usage';
import { placeInCellEdit } from '@/domain/challenge';
import type { Material } from '@/domain/challenge';
import type { LogEvent } from '@/domain/usagelog';
import { standOf } from '@/domain/world';
import type { Route } from '@/platform/router';
import { bootApp, cleanupApps, flush } from './app-rig';
import { p } from './helpers';
import { setupDom } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

const Q01_HASH = '#/q/pitch.same-note-two-clefs/middle-c';
const Q02_HASH = '#/q/rhythm.rest-in-a-bar/quarter-rest';
const Q07_C = '#/q/scale.major/c-major';
const Q07_F = '#/q/scale.major/f-major';
const STONES = 'inst.village.scale-stones';
const note = (name: string): Material => ({ kind: 'note', pitch: p(name), value: 'quarter' });

type Booted = Awaited<ReturnType<typeof bootApp>>;
const events = (t: Booted): LogEvent[] => t.ctx.usageLog.snapshot().events;
const types = (t: Booted): string[] => events(t).map((e) => e.type);
const of = <T extends LogEvent['type']>(t: Booted, type: T): Array<Extract<LogEvent, { type: T }>> => events(t).filter((e): e is Extract<LogEvent, { type: T }> => e.type === type);
/** 주소를 바꾼다(가짜 창은 해시를 바꾸면 듣는 쪽에 알린다) */
const go = (t: Booted, hash: string): void => {
  act(() => {
    t.win.location.hash = hash;
  });
};
const posAt = (t: Booted, x: number, y: number): void => {
  act(() => {
    t.ctx.world.bridge.position.set({ x, y, facing: 'down' });
  });
};
const rangeOf = (a: Booted, id: string) => a.ctx.world.map.station(id)!;

describe('진입 경로를 가르는 규칙(entryRouteOf)', () => {
  const overlay = (page: 'map' | 'list' | 'notebook' | 'settings' | 'help'): Route => ({ kind: 'overlay', page });
  it('월드에서 열었다는 표지가 있으면 그 길이다', () => {
    expect(entryRouteOf({ kind: 'home' }, 'walk', null)).toBe('walk');
    expect(entryRouteOf(overlay('list'), 'map', null)).toBe('map');
  });
  it('앞 화면이 지도, 목록, 수첩이면 그 길이다. 설정과 도움말은 그 밖이다', () => {
    expect(entryRouteOf(overlay('map'), null, null)).toBe('map');
    expect(entryRouteOf(overlay('list'), null, null)).toBe('list');
    expect(entryRouteOf(overlay('notebook'), null, null)).toBe('notebook');
    expect(entryRouteOf(overlay('settings'), null, null)).toBe('other');
    expect(entryRouteOf(overlay('help'), null, null)).toBe('other');
  });
  it('정거장 안내에서 이어진 것은 정거장에 들어온 길을 이어받는다. 모르면 그 밖이다', () => {
    expect(entryRouteOf({ kind: 'station', stationId: 'H3' }, null, 'walk')).toBe('walk');
    expect(entryRouteOf({ kind: 'station', stationId: 'H3' }, null, 'address')).toBe('address');
    expect(entryRouteOf({ kind: 'station', stationId: 'H3' }, null, null)).toBe('other');
  });
  it('처음 주소, 월드 위에서 바꾼 주소, 개발 화면과 알 수 없는 주소는 주소다. 다른 과제에서 바로 옮겨 가면 그 밖이다', () => {
    expect(entryRouteOf(null, null, null)).toBe('address');
    expect(entryRouteOf({ kind: 'home' }, null, null)).toBe('address');
    expect(entryRouteOf({ kind: 'dev', page: 'sound-check' }, null, null)).toBe('address');
    expect(entryRouteOf({ kind: 'unknown', hash: '#/zz' }, null, null)).toBe('address');
    expect(entryRouteOf({ kind: 'quest', hash: Q01_HASH }, null, null)).toBe('other');
  });
  it('시작 화면 이름', () => {
    expect(screenOf({ kind: 'home' })).toBe('world');
    expect(screenOf({ kind: 'quest', hash: Q01_HASH })).toBe('quest');
    expect(screenOf({ kind: 'station', stationId: 'H1' })).toBe('station');
    expect(screenOf(overlay('map'))).toBe('overlay');
    expect(screenOf({ kind: 'dev', page: 'x' })).toBe('other');
    expect(screenOf({ kind: 'unknown', hash: 'x' })).toBe('other');
  });
});

describe('시작', () => {
  it('월드로 시작하면 시작 사건 하나가 실행 번호 1로 적힌다', async () => {
    const t = await bootApp('');
    expect(events(t)).toMatchObject([{ type: 'session-start', screen: 'world', sid: 1, seq: 1 }]);
  });

  it('주소로 과제를 열고 시작하면 시작(과제 화면)과 함께 주소로 들어간 과제 진입이 적힌다', async () => {
    const t = await bootApp(Q01_HASH);
    expect(types(t)).toEqual(['session-start', 'quest-enter']);
    expect(events(t)[0]).toMatchObject({ screen: 'quest' });
    const e = of(t, 'quest-enter')[0]!;
    expect(e).toMatchObject({ questId: 'pitch.same-note-two-clefs', variantId: 'middle-c', route: 'address', surface: 'panel' });
    expect(['H1', 'N3']).toContain(e.stationId); // 이 과제가 놓인 정거장
  });

  it('시작 사건은 앱을 올리는 한 번만 적힌다(주소가 바뀌어도 다시 적지 않는다)', async () => {
    const t = await bootApp('');
    go(t, '#/list');
    go(t, '#/');
    expect(of(t, 'session-start')).toHaveLength(1);
  });

  it('없는 과제 주소나 열 수 없는 주소는 진입으로 적지 않는다', async () => {
    const t = await bootApp('#/q/no.such.quest/x');
    expect(types(t)).toEqual(['session-start']);
    go(t, '#/zz');
    expect(types(t)).toEqual(['session-start']);
  });
});

describe('과제에 들어온 길: 목록, 지도, 수첩, 주소, 그 밖', () => {
  it.each([
    ['#/list', 'list'],
    ['#/map', 'map'],
    ['#/notebook', 'notebook'],
    ['#/settings', 'other'],
  ] as const)('%s에서 과제를 열면 %s다', async (from, route) => {
    const t = await bootApp(from);
    go(t, Q02_HASH);
    expect(of(t, 'quest-enter')).toMatchObject([{ questId: 'rhythm.rest-in-a-bar', route, surface: 'panel' }]);
  });

  it('월드(#/)에서 주소를 바꿔 연 것은 주소다', async () => {
    const t = await bootApp('');
    go(t, Q02_HASH);
    expect(of(t, 'quest-enter')).toMatchObject([{ route: 'address' }]);
  });

  it('다른 과제의 패널에서 바로 옮겨 간 것은 그 밖이다. 같은 과제의 다른 판본으로 옮긴 것은 새로 들어간 것이 아니다', async () => {
    const t = await bootApp(Q07_C);
    go(t, Q07_F);
    expect(of(t, 'quest-enter')).toHaveLength(1); // 같은 과제의 다른 판본
    go(t, Q02_HASH);
    expect(of(t, 'quest-enter').map((e) => [e.questId, e.route])).toEqual([
      ['scale.major', 'address'],
      ['rhythm.rest-in-a-bar', 'other'],
    ]);
  });

  it('닫았다가 다시 열면 다시 들어간 것으로 적는다', async () => {
    const t = await bootApp('#/list');
    go(t, Q02_HASH);
    go(t, '#/list');
    go(t, Q02_HASH);
    expect(of(t, 'quest-enter').map((e) => e.route)).toEqual(['list', 'list']);
  });
});

describe('걷기: 월드에서 정거장을 열었다(13.2 H5)', () => {
  it('과제가 하나뿐인 작업대(H1)를 열면 정거장 진입과 과제 진입이 모두 걷기로 적힌다', async () => {
    const t = await bootApp('');
    t.send('H1');
    expect(t.win.location.hash).toBe(Q01_HASH);
    expect(of(t, 'station-enter')).toMatchObject([{ stationId: 'H1', route: 'walk' }]);
    expect(of(t, 'quest-enter')).toMatchObject([{ questId: 'pitch.same-note-two-clefs', route: 'walk', stationId: 'H1', surface: 'panel' }]);
  });

  it('정거장 안내(#/s/H3)가 뜨는 곳은 정거장 진입만 걷기로 적고, 안내에서 과제를 고르면 걷기를 이어받는다', async () => {
    const t = await bootApp('');
    t.send('H3');
    expect(t.win.location.hash).toBe('#/s/H3');
    expect(of(t, 'station-enter')).toMatchObject([{ stationId: 'H3', route: 'walk' }]);
    expect(of(t, 'quest-enter')).toHaveLength(0);
    go(t, Q01_HASH);
    expect(of(t, 'quest-enter')).toMatchObject([{ questId: 'pitch.same-note-two-clefs', route: 'walk' }]);
  });

  it('정거장 안내를 주소로 열고 과제를 고르면 주소로 들어간 것이다', async () => {
    const t = await bootApp('#/s/H3');
    expect(of(t, 'station-enter')).toMatchObject([{ stationId: 'H3', route: 'address' }]);
    go(t, Q01_HASH);
    expect(of(t, 'quest-enter')).toMatchObject([{ route: 'address' }]);
  });

  it('목록에서 연 정거장 안내와 그 안의 과제는 목록이다', async () => {
    const t = await bootApp('#/list');
    go(t, '#/s/H3');
    go(t, Q01_HASH);
    expect(of(t, 'station-enter')).toMatchObject([{ stationId: 'H3', route: 'list' }]);
    expect(of(t, 'quest-enter')).toMatchObject([{ route: 'list' }]);
  });

  it('없는 정거장 안내는 진입으로 적지 않는다', async () => {
    const t = await bootApp('#/s/ZZ');
    expect(of(t, 'station-enter')).toHaveLength(0);
  });

  it('주소를 바꾸지 않은 채 남은 걷기 표지는 흐름이 끝나면 지워진다: 뒤에 주소로 연 과제를 걷기로 세지 않는다', async () => {
    const t = await bootApp('');
    t.send('H4'); // 설치물에 들어간다: 주소가 바뀌지 않는다
    await flush();
    go(t, Q02_HASH);
    expect(of(t, 'quest-enter').map((e) => [e.questId, e.route])).toEqual([['rhythm.rest-in-a-bar', 'address']]);
  });
});

describe('지도의 바로 이동은 걸은 것이 아니다', () => {
  it('바로 이동해 서 있던 자리에서 열면 지도, 한 걸음이라도 걸은 뒤에 열면 걷기다', async () => {
    const t = await bootApp('');
    const h1 = rangeOf(t, 'H1');
    const stand = standOf(h1);
    t.ctx.usage.mapTeleported('H1');
    posAt(t, stand.x, stand.y); // 월드가 서 있는 자리를 알린다
    t.send('H1');
    expect(of(t, 'station-enter').at(-1)).toMatchObject({ stationId: 'H1', route: 'map' });
    expect(of(t, 'quest-enter').at(-1)).toMatchObject({ route: 'map' });
    go(t, '#/');
    posAt(t, stand.x + 3, stand.y); // 아직 한 걸음이 되지 않는다
    t.send('H1');
    expect(of(t, 'station-enter').at(-1)).toMatchObject({ route: 'map' });
    go(t, '#/');
    posAt(t, stand.x + 40, stand.y);
    t.send('H1');
    expect(of(t, 'station-enter').at(-1)).toMatchObject({ route: 'walk' });
    go(t, '#/');
    posAt(t, stand.x, stand.y); // 돌아와 서도, 걸은 뒤에는 지도로 치지 않는다
    t.send('H1');
    expect(of(t, 'station-enter').at(-1)).toMatchObject({ route: 'walk' });
  });

  it('바로 이동한 정거장이 아닌 다른 정거장을 열면 걷기다', async () => {
    const t = await bootApp('');
    t.ctx.usage.mapTeleported('H2');
    const st = standOf(rangeOf(t, 'H1'));
    posAt(t, st.x, st.y);
    t.send('H1');
    expect(of(t, 'station-enter')).toMatchObject([{ stationId: 'H1', route: 'walk' }]);
  });
});

describe('설치물(4.2)', () => {
  it('H4를 열면 설치물 모드로 들어가고 정거장 진입이 걷기로 적힌다. 자유로 놀기는 과제가 아니라서 과제 진입은 없다', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    expect(t.ctx.installation.state.get().mode).not.toBeNull();
    expect(of(t, 'station-enter')).toMatchObject([{ stationId: 'H4', route: 'walk' }]);
    expect(of(t, 'quest-enter')).toHaveLength(0);
  });

  it('표지판에서 과제를 고르면 월드에서 한 과제 진입으로 적고, 같은 것을 다시 고르거나 패널을 다녀와도 다시 적지 않는다', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    act(() => void t.ctx.installation.select('scale.major/c-major'));
    expect(of(t, 'quest-enter')).toMatchObject([{ questId: 'scale.major', variantId: 'c-major', route: 'walk', surface: 'world', stationId: 'H4' }]);
    act(() => void t.ctx.installation.select('scale.major/c-major'));
    // 패널로 보기: 같은 도전을 다른 화면으로 본다
    go(t, Q07_C);
    go(t, '#/');
    await flush();
    expect(of(t, 'quest-enter')).toHaveLength(1);
    // 다른 도전을 골랐다가 돌아오면 다시 들어간 것이다
    act(() => void t.ctx.installation.select('scale.major/f-major'));
    act(() => void t.ctx.installation.select('free'));
    act(() => void t.ctx.installation.select('scale.major/f-major'));
    expect(of(t, 'quest-enter').map((e) => e.variantId)).toEqual(['c-major', 'f-major', 'f-major']);
  });

  it('나갔다가 다시 들어가면 기억해 둔 과제가 다시 열리므로 다시 들어간 것으로 적는다', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    act(() => void t.ctx.installation.select('scale.major/c-major'));
    act(() => t.ctx.installation.exit());
    t.send('H4');
    await flush();
    expect(of(t, 'station-enter')).toHaveLength(2);
    expect(of(t, 'quest-enter').map((e) => [e.variantId, e.surface])).toEqual([
      ['c-major', 'world'],
      ['c-major', 'world'],
    ]);
  });

  it('지도로 바로 이동해 설치물에 들어가면 그 안의 과제 진입도 지도로 적힌다', async () => {
    const t = await bootApp('');
    const stand = standOf(rangeOf(t, 'H4'));
    t.ctx.usage.mapTeleported('H4');
    posAt(t, stand.x, stand.y);
    t.send('H4');
    await flush();
    act(() => void t.ctx.installation.select('scale.major/c-major'));
    expect(of(t, 'station-enter')).toMatchObject([{ route: 'map' }]);
    expect(of(t, 'quest-enter')).toMatchObject([{ route: 'map', surface: 'world' }]);
  });

  it('설치물에서 지도를 열어 다른 과제를 시작하면 지도로 들어간 것이다(패널로 보기와 다르다)', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    act(() => void t.ctx.installation.select('scale.major/c-major'));
    go(t, '#/map');
    go(t, Q02_HASH);
    expect(of(t, 'quest-enter').at(-1)).toMatchObject({ questId: 'rhythm.rest-in-a-bar', route: 'map', surface: 'panel' });
  });

  it('설치물의 도움 카드(H)를 열면 도움 열기로 적고, 이미 열려 있을 때 다시 적지 않는다', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    act(() => t.ctx.installation.toggleHelp());
    act(() => t.ctx.installation.toggleHelp());
    act(() => t.ctx.installation.toggleHelp());
    expect(of(t, 'help-open').map((e) => [e.kind, e.what])).toEqual([
      ['card', STONES],
      ['card', STONES],
    ]);
  });
});

describe('도움 열기와 원래 도전으로 복귀', () => {
  it('도움 화면(#/help)을 열면 한 번 적는다', async () => {
    const t = await bootApp('');
    go(t, '#/help');
    expect(of(t, 'help-open')).toMatchObject([{ kind: 'page', what: 'help' }]);
    go(t, '#/help'); // 같은 주소
    expect(of(t, 'help-open')).toHaveLength(1);
    go(t, '#/');
    go(t, '#/help');
    expect(of(t, 'help-open')).toHaveLength(2);
  });

  it('듣기 도움(느리게 듣기, 박 수 표시)을 새로 켤 때마다 적는다. 이미 켜져 있으면 적지 않고, 껐다 다시 켜면 적는다', async () => {
    const t = await bootApp(Q02_HASH);
    const { controller } = t.ctx;
    act(() => controller.setSlow(true));
    act(() => controller.setSlow(true));
    act(() => controller.setShowCount(true));
    act(() => controller.setSlow(false));
    expect(of(t, 'help-open')).toHaveLength(2);
    act(() => controller.setSlow(true));
    expect(of(t, 'help-open').map((e) => [e.kind, e.what, e.questId, e.variantId])).toEqual([
      ['aid', 'slow', 'rhythm.rest-in-a-bar', 'quarter-rest'],
      ['aid', 'showCount', 'rhythm.rest-in-a-bar', 'quarter-rest'],
      ['aid', 'slow', 'rhythm.rest-in-a-bar', 'quarter-rest'],
    ]);
  });

  it('고른 박 반복을 켜면 적는다(박 칸을 고르지 않으면 켜지지 않아 적지 않는다)', async () => {
    const t = await bootApp(Q02_HASH);
    const { controller } = t.ctx;
    act(() => controller.setRepeat(true));
    expect(of(t, 'help-open')).toHaveLength(0);
    act(() => controller.selectCell(controller.cells()[0]!));
    act(() => controller.setRepeat(true));
    expect(of(t, 'help-open')).toMatchObject([{ kind: 'aid', what: 'repeat' }]);
  });

  it('과제를 바꾸면 도움은 꺼진 채로 시작해서 켜져 있던 것이 새 과제에서 다시 적히지 않는다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => t.ctx.controller.setSlow(true));
    go(t, Q07_C);
    expect(of(t, 'help-open')).toHaveLength(1);
  });

  it('도움 연습에 들어가면 도움 열기, 원래 곡으로 돌아오면 복귀로 적고 원래 도전의 id가 붙는다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => void t.ctx.session.enterAssist('basicPractice', 'practice.rest-basics'));
    expect(of(t, 'help-open')).toMatchObject([{ kind: 'practice', what: 'practice.rest-basics', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' }]);
    act(() => t.ctx.controller.returnToOrigin());
    expect(of(t, 'return-to-origin')).toMatchObject([{ questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' }]);
    act(() => t.ctx.controller.returnToOrigin()); // 여러 번 눌러도 같다
    expect(of(t, 'return-to-origin')).toHaveLength(1);
  });

  it('연습 안에서 또 도움을 열어도 원래 도전으로 돌아오는 것은 한 번이다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => void t.ctx.session.enterAssist('basicPractice', 'practice.a'));
    act(() => void t.ctx.session.enterAssist('basicPractice', 'practice.b'));
    expect(of(t, 'help-open').map((e) => e.what)).toEqual(['practice.a', 'practice.b']);
    act(() => t.ctx.controller.returnToOrigin());
    expect(of(t, 'return-to-origin')).toHaveLength(1);
  });

  it('연습 중에 주소로 다른 과제를 열어 원래 곡으로 돌아온 것도 복귀로 적는다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => void t.ctx.session.enterAssist('basicPractice', 'practice.a'));
    go(t, Q07_C);
    expect(of(t, 'return-to-origin')).toMatchObject([{ questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' }]);
  });

  it('저장에서 도움 연습 중이던 상태로 시작하면 앱이 알아서 원래 도전으로 되돌려도 도움 열기나 복귀로 적지 않는다', async () => {
    const first = await bootApp(Q02_HASH);
    act(() => void first.ctx.session.enterAssist('basicPractice', 'practice.a'));
    const snap = first.ctx.session.serialize();
    expect(snap.supportContext).not.toBeNull();
    cleanupApps();
    const world = await bootApp('', { session: snap });
    expect(world.ctx.session.inAssist).toBe(false); // 월드로 열면 앱이 원래 도전으로 되돌려 둔다
    expect(types(world)).toEqual(['session-start']);
    cleanupApps();
    const quest = await bootApp(Q02_HASH, { session: snap });
    expect(quest.ctx.session.inAssist).toBe(false);
    expect(types(quest)).toEqual(['session-start', 'quest-enter']);
  });

  it('되살아난 연습이 있던 실행에서도 새로 들어간 연습의 복귀는 적는다', async () => {
    const first = await bootApp(Q02_HASH);
    act(() => void first.ctx.session.enterAssist('basicPractice', 'practice.a'));
    const snap = first.ctx.session.serialize();
    cleanupApps();
    const again = await bootApp('', { session: snap });
    go(again, Q02_HASH);
    act(() => void again.ctx.session.enterAssist('basicPractice', 'practice.b'));
    act(() => again.ctx.controller.returnToOrigin());
    expect(of(again, 'help-open').map((e) => e.what)).toEqual(['practice.b']);
    expect(of(again, 'return-to-origin')).toHaveLength(1);
  });
});

describe('배치 수정, 다시 듣기, 확인', () => {
  const place = (t: Booted, slotIndex: number, position: number): void => {
    const slot = t.ctx.controller.staffSlots()[slotIndex]!;
    act(() => t.ctx.controller.placeOnStaff(slot, position));
  };

  it('놓은 것이 실제로 바뀔 때만 배치 수정으로 적는다: 놓기, 옮기기, 지우기, 실행 취소, 다시 하기', async () => {
    const t = await bootApp(Q01_HASH);
    const { controller } = t.ctx;
    place(t, 0, 4);
    expect(of(t, 'placement-edit')).toMatchObject([{ questId: 'pitch.same-note-two-clefs', variantId: 'middle-c', surface: 'panel' }]);
    place(t, 0, 4); // 같은 자리에 같은 음: 바뀐 것이 없다
    expect(of(t, 'placement-edit')).toHaveLength(1);
    act(() => controller.moveOnStaff(controller.staffSlots()[0]!, 1));
    expect(of(t, 'placement-edit')).toHaveLength(2);
    act(() => controller.undo());
    act(() => controller.redo());
    expect(of(t, 'placement-edit')).toHaveLength(4);
    act(() => controller.clearAll());
    expect(of(t, 'placement-edit')).toHaveLength(5);
    act(() => controller.clearAll()); // 이미 비어 있다
    expect(of(t, 'placement-edit')).toHaveLength(5);
  });

  it('고른 자리만 바꾸는 것은 배치 수정이 아니다', async () => {
    const t = await bootApp(Q01_HASH);
    act(() => t.ctx.controller.selectSlot(t.ctx.controller.staffSlots()[0]!));
    expect(of(t, 'placement-edit')).toHaveLength(0);
  });

  it('과제를 바꾸거나 열 때는 배치 수정으로 적지 않는다(남아 있던 초안으로 바뀐 것이다)', async () => {
    const t = await bootApp(Q01_HASH);
    place(t, 0, 4);
    go(t, Q02_HASH);
    go(t, Q01_HASH); // 남아 있던 초안이 다시 열린다
    expect(of(t, 'placement-edit')).toHaveLength(1);
  });

  it('도움 연습 중의 세션 변화는 배치 수정으로 적지 않는다', async () => {
    const t = await bootApp(Q01_HASH);
    place(t, 0, 4);
    act(() => void t.ctx.session.enterAssist('basicPractice', 'practice.a'));
    act(() => t.ctx.controller.returnToOrigin());
    expect(of(t, 'placement-edit')).toHaveLength(1);
  });

  it('설치물의 자유로 놀기에서 놓은 것도 적고 free 표시와 월드 표시가 붙는다', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    act(() => {
      t.ctx.bench.pickShelf(0);
      t.ctx.bench.place(1);
    });
    expect(of(t, 'placement-edit')).toMatchObject([{ surface: 'world', free: true, questId: `free.${STONES}` }]);
  });

  it('오선 과제(Q01)의 두 음 듣기와 목표 듣기는 다시 듣기로 적는다. 음을 놓을 때 나는 한 음 미리 듣기는 적지 않는다', async () => {
    const t = await bootApp(Q01_HASH);
    const { controller } = t.ctx;
    place(t, 0, 4); // 놓으면 그 음을 한 번 들려 준다(미리 듣기)
    expect(of(t, 'listen')).toHaveLength(0);
    act(() => void controller.playTarget());
    act(() => controller.stopPlayback());
    act(() => void controller.playPlacedNotes());
    act(() => controller.stopPlayback());
    expect(of(t, 'listen').map((e) => [e.what, e.surface, e.questId])).toEqual([
      ['target', 'panel', 'pitch.same-note-two-clefs'],
      ['mine', 'panel', 'pitch.same-note-two-clefs'],
    ]);
  });

  it('박 격자 과제(Q02)의 내 배치 듣기도 다시 듣기로 적는다', async () => {
    const t = await bootApp(Q02_HASH);
    const { controller } = t.ctx;
    const def = controller.current!.def;
    const cells = controller.cells();
    act(() => controller.edit(placeInCellEdit(def, controller.content(), cells[0]!, note('C4'))));
    act(() => void controller.playMine());
    act(() => controller.stopPlayback());
    expect(of(t, 'listen')).toMatchObject([{ what: 'mine', surface: 'panel', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' }]);
  });

  it('듣고 있는 중에 같은 단추를 다시 눌러도 눌린 만큼 적는다', async () => {
    const t = await bootApp(Q01_HASH);
    act(() => void t.ctx.controller.playTarget());
    act(() => void t.ctx.controller.playTarget());
    act(() => t.ctx.controller.stopPlayback());
    expect(of(t, 'listen')).toHaveLength(2);
  });

  it('들을 것이 없어 재생하지 못하면 적지 않는다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => void t.ctx.controller.playMine()); // 놓은 음이 없다
    expect(of(t, 'listen')).toHaveLength(0);
  });

  it('설치물에서 듣는 것은 월드로 적는다. 자유로 놀기의 내 배치 듣기는 free가 붙는다', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    act(() => {
      t.ctx.bench.pickShelf(0);
      t.ctx.bench.place(1);
    });
    act(() => void t.ctx.controller.playMine());
    act(() => t.ctx.controller.stopPlayback());
    expect(of(t, 'listen')).toMatchObject([{ what: 'mine', surface: 'world', free: true }]);
  });

  it('확인하면 결과와 도움 사용 여부를 적는다. 점수나 평가는 적지 않는다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => t.ctx.controller.setSlow(true));
    act(() => void t.ctx.controller.check());
    const attempt = t.ctx.controller.attempts.at(-1)!;
    expect(of(t, 'check')).toEqual([expect.objectContaining({ questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest', result: attempt.resultType, assistUsed: true })]);
    expect(Object.keys(of(t, 'check')[0]!).sort()).toEqual(['assistUsed', 'at', 'questId', 'result', 'seq', 'sid', 'type', 'variantId']);
  });

  it('통과한 뒤에 같은 과제를 또 확인하면 확인이 또 적힌다', async () => {
    const t = await bootApp(Q02_HASH);
    act(() => void t.ctx.controller.check());
    act(() => void t.ctx.controller.check());
    expect(of(t, 'check')).toHaveLength(2);
  });
});

describe('설치물 모드 밖에서 돌 밟기와 소리 조각', () => {
  const step = (t: Booted, slot: number): void => {
    act(() => {
      t.ctx.world.bridge.events.send({ type: 'stepped', installationId: STONES, slot });
    });
  };

  it('지나가며 돌을 밟으면 한 번씩 적는다', async () => {
    const t = await bootApp('');
    step(t, 2);
    step(t, 3);
    expect(of(t, 'stone-step').map((e) => [e.installationId, e.slot])).toEqual([
      [STONES, 2],
      [STONES, 3],
    ]);
  });

  it('설치물 모드에서는 적지 않는다(눌러 놓기는 배치 수정이다)', async () => {
    const t = await bootApp('');
    t.send('H4');
    await flush();
    step(t, 2);
    expect(of(t, 'stone-step')).toHaveLength(0);
  });

  it('소리 조각 발견은 사건 형식과 기록 경로가 있다(월드에 소리 조각이 생기는 5-6에서 부른다)', async () => {
    const t = await bootApp('');
    t.ctx.usage.discoveryFound('disc.village.bell');
    expect(of(t, 'discovery-found')).toMatchObject([{ discoveryId: 'disc.village.bell' }]);
    expect(t.ctx.world.map).toBeTruthy();
  });
});

describe('끄기와 정리', () => {
  it('기록 남기기를 끄면 아무 사건도 적지 않는다', async () => {
    const t = await bootApp('');
    t.ctx.usageLog.setEnabled(false);
    t.send('H1');
    act(() => void t.ctx.controller.playTarget());
    act(() => t.ctx.controller.stopPlayback());
    expect(types(t)).toEqual(['session-start']);
  });

  it('앱을 내리면 더는 적지 않는다', async () => {
    const t = await bootApp('');
    t.ctx.usage.dispose();
    t.ctx.world.bridge.events.send({ type: 'stepped', installationId: STONES, slot: 1 });
    expect(of(t, 'stone-step')).toHaveLength(0);
  });

  it('13.2의 사건 종류가 한 번의 사용에서 모두 나온다(소리 조각은 5-6 전이라 호출로 확인)', async () => {
    const t = await bootApp('');
    t.send('H1'); // 정거장 진입, 과제 진입
    const slot = t.ctx.controller.staffSlots()[0]!;
    act(() => t.ctx.controller.placeOnStaff(slot, 4)); // 배치 수정
    act(() => void t.ctx.controller.playTarget()); // 다시 듣기
    act(() => t.ctx.controller.stopPlayback());
    act(() => void t.ctx.controller.check()); // 확인
    act(() => t.ctx.controller.setSlow(true)); // 도움 열기
    act(() => void t.ctx.session.enterAssist('basicPractice', 'practice.a'));
    act(() => t.ctx.controller.returnToOrigin()); // 복귀
    act(() => t.ctx.world.bridge.events.send({ type: 'stepped', installationId: STONES, slot: 1 })); // 돌 밟기
    t.ctx.usage.discoveryFound('disc.village.bell'); // 소리 조각
    expect(new Set(types(t))).toEqual(new Set(['session-start', 'station-enter', 'quest-enter', 'placement-edit', 'listen', 'check', 'help-open', 'return-to-origin', 'stone-step', 'discovery-found']));
    // 내보낸 파일에도 같은 사건이 그대로 들어 있고, 걷기로 시작한 과제 진입이 요약에 센다
    const doc = JSON.parse(t.ctx.usageLog.exportFile().text) as { events: unknown[]; summary: { questEntriesByRoute: { walk: number }; walkShare: number } };
    expect(doc.events).toHaveLength(events(t).length);
    expect(doc.summary.questEntriesByRoute.walk).toBe(1);
    expect(doc.summary.walkShare).toBe(1);
  });
});
