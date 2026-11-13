// 주소의 해시(#/…)를 화면 상태로 읽는다. 기록이나 진행을 보지 않는다(W-2, 7.7).
//   #/                          탐험(월드)
//   #/map  #/list  #/notebook  악보 지도(M), 전체 도전 목록(L), 수첩(N)
//   #/settings  #/help          설정, 조작 안내
//   #/s/<정거장 id>              정거장 안내(열 수 있는 과제가 여럿이거나 아직 준비 중일 때)
//   #/q/<과제 id>/<판본 id>      과제 패널(판본을 생략하면 첫 판본)
//   #/dev/<이름>                 개발용 화면(미리보기 채널에서만 열린다)
// 해시 안의 과제 id와 판본 id를 풀고 열 수 있는지 가리는 일은 ContentCatalog.resolveHash가 한다.
export type OverlayPage = 'map' | 'list' | 'notebook' | 'settings' | 'help';

export type Route =
  | { kind: 'home' }
  | { kind: 'overlay'; page: OverlayPage }
  | { kind: 'station'; stationId: string }
  | { kind: 'quest'; /** '#/q/…' 원문. ContentCatalog.resolveHash에 그대로 넘긴다 */ hash: string }
  | { kind: 'dev'; page: string }
  | { kind: 'unknown'; hash: string };

export const HOME_HASH = '#/';
export const overlayHash = (page: OverlayPage): string => `#/${page}`;
export const stationHash = (stationId: string): string => `#/s/${encodeURIComponent(stationId)}`;

const OVERLAYS: readonly string[] = ['map', 'list', 'notebook', 'settings', 'help'];

export function parseRoute(hash: string): Route {
  const h = hash.trim();
  if (h === '' || h === '#' || h === '#/' || h === '/') return { kind: 'home' };
  const body = h.replace(/^#/, '');
  if (/^\/?q(\/|$)/.test(body)) return { kind: 'quest', hash: h };
  const overlay = /^\/?([a-z]+)\/?$/.exec(body);
  if (overlay && OVERLAYS.includes(overlay[1]!)) return { kind: 'overlay', page: overlay[1] as OverlayPage };
  const station = /^\/?s\/([A-Za-z0-9%._-]+)\/?$/.exec(body);
  if (station) {
    try {
      return { kind: 'station', stationId: decodeURIComponent(station[1]!) };
    } catch {
      return { kind: 'unknown', hash: h };
    }
  }
  const dev = /^\/?dev\/([a-z0-9-]+)\/?$/.exec(body);
  if (dev) return { kind: 'dev', page: dev[1]! };
  return { kind: 'unknown', hash: h };
}

/** 월드가 눈앞에서 움직여야 하는 상태인가. 겹침 화면이나 패널이 열려 있으면 월드는 멈춘다(7.5) */
export const isExploring = (route: Route): boolean => route.kind === 'home';

/** 라우터가 쓰는 창의 작은 부분. 테스트에서는 가짜를 넣는다 */
export interface RouterWindow {
  location: { hash: string; /** 있으면 화면을 새로 불러온다(저장 가져오기 뒤) */ reload?(): void };
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
  /** 있으면 앱 안에서 이동한 기록을 세어 '닫기'가 이전 화면으로 돌아가게 한다. 없으면 해시만 바꾼다 */
  history?: {
    readonly state: unknown;
    pushState(data: unknown, unused: string, url?: string | null): void;
    replaceState(data: unknown, unused: string, url?: string | null): void;
    back(): void;
  };
  dispatchEvent?(event: Event): boolean;
}

/** 처음 주소를 한 번 읽고, 주소가 바뀔 때마다 알린다. 돌려주는 함수를 부르면 멈춘다 */
export function startRouter(win: RouterWindow, onRoute: (route: Route) => void): () => void {
  const read = (): void => onRoute(parseRoute(win.location.hash));
  win.addEventListener('hashchange', read);
  read();
  return () => win.removeEventListener('hashchange', read);
}

const depthOf = (win: Pick<RouterWindow, 'history'>): number => {
  const s = win.history?.state as { depth?: unknown } | null | undefined;
  return typeof s?.depth === 'number' && s.depth > 0 ? s.depth : 0;
};

/** 다른 화면으로 간다(기록에 한 칸을 더한다) */
export function navigateTo(win: RouterWindow, hash: string): void {
  if (win.location.hash === hash) return;
  const hist = win.history;
  if (hist && win.dispatchEvent) {
    hist.pushState({ depth: depthOf(win) + 1 }, '', hash);
    win.dispatchEvent(new Event('hashchange')); // pushState는 hashchange를 일으키지 않는다
  } else win.location.hash = hash;
}

/** 지금 화면을 닫는다. 앱 안에서 온 화면이면 이전 화면으로 돌아가고, 주소로 바로 열었으면 fallback(월드)로 바꾼다 */
export function closeTo(win: RouterWindow, fallback: string = HOME_HASH): void {
  const hist = win.history;
  if (hist && depthOf(win) > 0) {
    hist.back();
    return;
  }
  if (hist && win.dispatchEvent) {
    hist.replaceState({ depth: 0 }, '', fallback);
    win.dispatchEvent(new Event('hashchange'));
  } else win.location.hash = fallback;
}
