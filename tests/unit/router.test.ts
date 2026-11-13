// 2-8 직접 주소: 주소 읽기와 주소 바뀜 알림.
import { describe, expect, it } from 'vitest';
import { HOME_HASH, closeTo, isExploring, navigateTo, overlayHash, parseRoute, startRouter, stationHash } from '@/platform/router';
import type { Route, RouterWindow } from '@/platform/router';

describe('parseRoute', () => {
  it.each([
    ['', { kind: 'home' }],
    ['#', { kind: 'home' }],
    ['#/', { kind: 'home' }],
    ['/', { kind: 'home' }],
    ['  #/  ', { kind: 'home' }],
    ['#/q/rhythm.rest-in-a-bar/quarter-rest', { kind: 'quest', hash: '#/q/rhythm.rest-in-a-bar/quarter-rest' }],
    ['#/q/rhythm.rest-in-a-bar', { kind: 'quest', hash: '#/q/rhythm.rest-in-a-bar' }],
    ['#/q', { kind: 'quest', hash: '#/q' }],
    ['#/q/', { kind: 'quest', hash: '#/q/' }],
    ['/q/pitch.same-note-two-clefs/middle-c', { kind: 'quest', hash: '/q/pitch.same-note-two-clefs/middle-c' }],
    ['#/map', { kind: 'overlay', page: 'map' }],
    ['#/list', { kind: 'overlay', page: 'list' }],
    ['#/notebook', { kind: 'overlay', page: 'notebook' }],
    ['/notebook/', { kind: 'overlay', page: 'notebook' }],
    ['#/settings/', { kind: 'overlay', page: 'settings' }],
    ['/help', { kind: 'overlay', page: 'help' }],
    ['#/s/H1', { kind: 'station', stationId: 'H1' }],
    ['#/s/E3/', { kind: 'station', stationId: 'E3' }],
    ['#/s/%ED%95%9C', { kind: 'station', stationId: '한' }],
    ['#/s/', { kind: 'unknown', hash: '#/s/' }],
    ['#/s/%E0%A4%A', { kind: 'unknown', hash: '#/s/%E0%A4%A' }],
    ['#/maps', { kind: 'unknown', hash: '#/maps' }],
    ['#/notebooks', { kind: 'unknown', hash: '#/notebooks' }],
    ['#/dev/sound-check', { kind: 'dev', page: 'sound-check' }],
    ['#/dev/sound-check/', { kind: 'dev', page: 'sound-check' }],
    ['#/dev/', { kind: 'unknown', hash: '#/dev/' }],
    ['#/quiz/1', { kind: 'unknown', hash: '#/quiz/1' }],
    ['#questions', { kind: 'unknown', hash: '#questions' }],
  ] as Array<[string, Route]>)('%j → %j', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it('주소는 기록을 읽지 않는다: 결과가 주소 글자만으로 정해진다', () => {
    expect(parseRoute('#/q/a/b')).toEqual(parseRoute('#/q/a/b'));
    expect(parseRoute.length).toBe(1);
  });
});

function fakeWindow(hash: string) {
  const listeners = new Set<() => void>();
  const win: RouterWindow & { go: (next: string) => void; count: () => number } = {
    location: { hash },
    addEventListener: (_type, l) => void listeners.add(l),
    removeEventListener: (_type, l) => void listeners.delete(l),
    go(next) {
      win.location.hash = next;
      for (const l of [...listeners]) l();
    },
    count: () => listeners.size,
  };
  return win;
}

describe('startRouter', () => {
  it('시작하자마자 지금 주소를 알리고, 바뀔 때마다 알린다', () => {
    const win = fakeWindow('#/q/rhythm.rest-in-a-bar/quarter-rest');
    const seen: Route[] = [];
    const stop = startRouter(win, (r) => seen.push(r));
    expect(seen).toEqual([{ kind: 'quest', hash: '#/q/rhythm.rest-in-a-bar/quarter-rest' }]);
    win.go('#/');
    win.go('#/dev/sound-check');
    expect(seen.map((r) => r.kind)).toEqual(['quest', 'home', 'dev']);
    stop();
    expect(win.count()).toBe(0);
    win.go('#/q/x');
    expect(seen).toHaveLength(3);
  });

  it('주소 바꾸기는 해시만 쓴다', () => {
    const win = fakeWindow('');
    navigateTo(win, '#/q/a/b');
    expect(win.location.hash).toBe('#/q/a/b');
  });
});

describe('화면 상태', () => {
  it('월드가 움직이는 때는 탐험(홈)뿐이다: 겹침 화면, 정거장 안내, 패널, 개발 화면에서는 멈춘다', () => {
    expect(isExploring(parseRoute('#/'))).toBe(true);
    for (const h of ['#/map', '#/list', '#/notebook', '#/settings', '#/help', '#/s/H1', '#/q/a/b', '#/dev/sound-check', '#/nope']) expect(isExploring(parseRoute(h)), h).toBe(false);
  });

  it('주소를 만드는 도구가 읽는 쪽과 맞는다', () => {
    expect(parseRoute(HOME_HASH)).toEqual({ kind: 'home' });
    for (const p of ['map', 'list', 'notebook', 'settings', 'help'] as const) expect(parseRoute(overlayHash(p))).toEqual({ kind: 'overlay', page: p });
    expect(parseRoute(stationHash('H1'))).toEqual({ kind: 'station', stationId: 'H1' });
    expect(parseRoute(stationHash('한 글'))).toEqual({ kind: 'station', stationId: '한 글' });
  });
});

/** history가 있는 가짜 창: 앱 안에서 이동한 기록을 센다 */
function historyWindow(initial: string) {
  const entries: Array<{ hash: string; state: unknown }> = [{ hash: initial, state: null }];
  let at = 0;
  const listeners = new Set<() => void>();
  const fire = (): void => {
    for (const l of [...listeners]) l();
  };
  const win = {
    location: {
      get hash() {
        return entries[at]!.hash;
      },
      set hash(v: string) {
        entries.splice(at + 1, entries.length, { hash: v, state: null });
        at++;
        fire();
      },
    },
    addEventListener: (_t: 'hashchange', l: () => void) => void listeners.add(l),
    removeEventListener: (_t: 'hashchange', l: () => void) => void listeners.delete(l),
    dispatchEvent: (_e: Event) => {
      fire();
      return true;
    },
    history: {
      get state() {
        return entries[at]!.state;
      },
      pushState: (data: unknown, _u: string, url?: string | null) => {
        entries.splice(at + 1, entries.length, { hash: url ?? '', state: data });
        at++;
      },
      replaceState: (data: unknown, _u: string, url?: string | null) => {
        entries[at] = { hash: url ?? entries[at]!.hash, state: data };
      },
      back: () => {
        if (at > 0) {
          at--;
          fire();
        }
      },
    },
    stack: () => entries.map((e) => e.hash),
    at: () => at,
  };
  return win;
}

describe('navigateTo / closeTo (기록 세기)', () => {
  it('월드에서 지도를 열고 닫으면 이전 화면(월드)으로 돌아가며 기록이 쌓이지 않는다', () => {
    const win = historyWindow('#/');
    const seen: string[] = [];
    startRouter(win, (r) => seen.push(r.kind === 'overlay' ? r.page : r.kind));
    navigateTo(win, overlayHash('map'));
    expect(win.location.hash).toBe('#/map');
    closeTo(win);
    expect(win.location.hash).toBe('#/');
    expect(seen).toEqual(['home', 'map', 'home']);
    expect(win.at()).toBe(0);
  });

  it('목록에서 과제를 열고 닫으면 목록으로 돌아간다(온 길 그대로)', () => {
    const win = historyWindow('#/');
    navigateTo(win, overlayHash('list'));
    navigateTo(win, '#/q/rhythm.rest-in-a-bar/quarter-rest');
    closeTo(win);
    expect(win.location.hash).toBe('#/list');
    closeTo(win);
    expect(win.location.hash).toBe('#/');
  });

  it('주소로 바로 연 화면(앱 안 이동 없음)은 닫으면 월드로 바뀐다(기록을 더하지 않는다)', () => {
    const win = historyWindow('#/q/rhythm.rest-in-a-bar/quarter-rest');
    const seen: string[] = [];
    startRouter(win, (r) => seen.push(r.kind));
    closeTo(win);
    expect(win.location.hash).toBe('#/');
    expect(seen).toEqual(['quest', 'home']);
    expect(win.stack()).toEqual(['#/']);
  });

  it('같은 주소로는 이동하지 않는다', () => {
    const win = historyWindow('#/map');
    navigateTo(win, '#/map');
    expect(win.stack()).toEqual(['#/map']);
  });

  it('history가 없는 창에서는 해시만 바꾼다', () => {
    const win = fakeWindow('#/map');
    closeTo(win);
    expect(win.location.hash).toBe('#/');
    navigateTo(win, '#/list');
    expect(win.location.hash).toBe('#/list');
  });
});
