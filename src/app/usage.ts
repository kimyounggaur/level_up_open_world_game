// 사용 기록 연결(설계서 13.2, 4-8): 앱 곳곳에서 일어나는 일을 사건으로 바꿔 사용 기록(platform/log)에 적는다.
// 화면이나 월드는 기록을 모른다. 여기서 이미 있는 알림(주소 바뀜, 월드 사건, 컨트롤러, 세션, 설치물)을 구독해서 사실만 적는다.
//
// 진입 경로(13.2, H5 '걸어서 들어간 비율')
//   walk     월드에서 정거장 가까이 가서 열었다(E, Enter, 정거장 누르기). 지도의 '걸어가기'로 걸어간 것도 걷기다
//   map      지도에서 과제를 열었거나, 지도의 '바로 이동'으로 선 뒤 한 걸음도 걷지 않고 정거장을 열었다(걸은 것이 아니다)
//   list     목록에서 열었다
//   notebook 수첩에서 열었다
//   address  주소를 직접 열었거나 화면을 새로 불러왔다
//   other    그 밖(다른 도전의 패널에서 바로 옮겨 감 등)
// 정거장 안내에서 과제를 고른 것은 그 정거장에 들어온 길을 이어받는다. 월드에서 정거장을 열면(패널로 가든, 안내가 뜨든, 설치물에 들어가든)
// 연 순간에 '정거장 진입'을 적고, 이어서 열린 과제는 '과제 진입'으로 따로 적는다(정거장 id가 붙는다).
//
// 적지 않는 것: 놓은 음의 내용, 입력한 글, 소리 크기 같은 설정, 위치 좌표. 사건에는 id와 일어난 사실만 있다(domain/usagelog).
import type { ContentCatalog } from '../domain/catalog';
import { isFreeQuestId } from '../domain/content';
import type { ChallengeSession, SupportContext } from '../domain/session';
import { standOf } from '../domain/world';
import type { WorldMap } from '../domain/world';
import type { EntryRoute, LogBody, StartScreen, Surface } from '../domain/usagelog';
import type { WorldBridge } from '../platform/bridge';
import type { UsageLog } from '../platform/log';
import type { Route } from '../platform/router';
import type { Aids, ChallengeController } from '../ui/challenge/controller';
import type { InstallationController, InstallationUiState } from '../ui/installation/controller';

/** 지도의 '바로 이동'으로 선 자리에서 이만큼(px) 안이면 한 걸음도 걷지 않은 것으로 본다. 한 걸음은 이보다 크다(220 px/초) */
export const STILL_RADIUS_PX = 6;

export interface UsageTrackerDeps {
  log: UsageLog;
  catalog: ContentCatalog;
  map: WorldMap;
  session: ChallengeSession;
  controller: ChallengeController;
  installation: InstallationController;
  bridge: WorldBridge;
}

export const screenOf = (route: Route): StartScreen => {
  switch (route.kind) {
    case 'home':
      return 'world';
    case 'quest':
      return 'quest';
    case 'station':
      return 'station';
    case 'overlay':
      return 'overlay';
    default:
      return 'other';
  }
};

/**
 * 과제나 정거장 화면으로 들어온 길. 월드에서 열었다는 표지(fromWorld)가 있으면 그 길이고,
 * 없으면 앞 화면으로 가른다. 정거장 안내에서 이어진 것은 정거장에 들어온 길(stationRoute)을 이어받는다.
 */
export function entryRouteOf(prev: Route | null, fromWorld: EntryRoute | null, stationRoute: EntryRoute | null): EntryRoute {
  if (fromWorld) return fromWorld;
  if (!prev) return 'address';
  switch (prev.kind) {
    case 'overlay':
      return prev.page === 'map' || prev.page === 'list' || prev.page === 'notebook' ? prev.page : 'other';
    case 'station':
      return stationRoute ?? 'other';
    case 'quest':
      return 'other';
    default:
      return 'address'; // 월드 위에서 주소를 바꿨거나 기록으로 돌아왔다
  }
}

export class UsageTracker {
  private readonly d: UsageTrackerDeps;
  private readonly offs: Array<() => void> = [];
  private started = false;
  private disposed = false;
  private prevRoute: Route | null = null;
  /** 월드에서 정거장을 열었고 그 결과(화면 이동이나 설치물 들어가기)가 아직 오지 않았을 때의 길. 같은 일을 마치면 비운다 */
  private fromWorld: EntryRoute | null = null;
  /** 정거장 안내에 들어온 길 */
  private stationRoute: EntryRoute | null = null;
  /** 지도의 '바로 이동'으로 선 정거장과, 그 뒤 처음 알려진 자리(막힌 자리면 가까운 빈 곳이라 정거장 점과 다를 수 있다) */
  private teleported: { stationId: string; spot: { x: number; y: number } | null } | null = null;
  private aids: Aids;
  private assist: SupportContext | null;
  /** 이번 실행에서 도움 연습에 들어간 것을 적었는가. 저장에서 되살아난 연습은 앱이 알아서 닫아도 사람이 원래 도전으로 돌아온 것이 아니다 */
  private assistLogged = false;
  private sig: { key: string; text: string } | null = null;
  private installUi: InstallationUiState;
  /** 설치물 모드에 들어온 길과 그동안 마지막으로 적은 도전(패널을 다녀와도 같은 도전을 다시 적지 않는다) */
  private installRoute: EntryRoute = 'walk';
  private installKey: string | null = null;
  /** 들어가기가 끝나 자리를 잡았는가. 들어가는 호출 안에서 되돌려질 수 있어 그 뒤부터 적는다 */
  private installReady = false;

  constructor(deps: UsageTrackerDeps) {
    this.d = deps;
    this.aids = deps.controller.aids;
    this.assist = deps.session.supportContext;
    this.installUi = deps.installation.state.get();
    this.sig = this.currentSignature();
  }

  /** 구독을 걸고 이번 실행을 시작한다 */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    const d = this.d;
    d.log.beginSession();
    this.offs.push(
      d.bridge.events.subscribe((ev) => {
        if (ev.type === 'open-station') this.openedFromWorld(ev.stationId);
        else if (ev.type === 'stepped' && !d.installation.state.get().mode) this.log({ type: 'stone-step', installationId: ev.installationId, slot: ev.slot });
      }),
      d.bridge.position.subscribe((p) => {
        if (this.teleported && !this.teleported.spot) this.teleported.spot = { x: p.x, y: p.y };
      }),
      d.installation.state.subscribe((st) => this.onInstallation(st)),
      d.session.subscribe(() => this.onSession()),
      d.controller.subscribe(() => this.onControllerChange()),
      d.controller.onAttempt((a) => this.log({ type: 'check', questId: a.questId, variantId: a.variantId, result: a.resultType, assistUsed: a.assistUsed })),
      d.controller.onTouch((t) => {
        if (t.kind !== 'listen' || (t.listened !== 'mine' && t.listened !== 'target')) return; // 놓을 때 나는 한 음 미리 듣기는 '다시 듣기'가 아니다
        this.log({ type: 'listen', questId: t.questId, variantId: t.variantId, what: t.listened, surface: this.surface(), ...(t.freeInstallationId ? { free: true as const } : {}) });
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
  }

  private log(body: LogBody): void {
    if (!this.disposed) this.d.log.record(body);
  }

  private surface(): Surface {
    return this.d.installation.state.get().mode ? 'world' : 'panel';
  }

  /** 발견 요소(소리 조각이나 개념 쪽지)를 처음 찾았다(5-6). 같은 것을 다시 열 때는 부르지 않는다(app/discover.ts) */
  discoveryFound(discoveryId: string): void {
    this.log({ type: 'discovery-found', discoveryId });
  }

  /** 지도의 '바로 이동'으로 정거장 앞에 섰다. 이어서 한 걸음도 걷지 않고 정거장을 열면 걸어서 들어간 것이 아니다 */
  mapTeleported(stationId: string): void {
    this.teleported = { stationId, spot: null };
  }

  // ------------------------------------------------------------------ 주소(화면)

  /** 주소가 바뀔 때마다(처음 주소 포함) 부른다 */
  routeChanged(route: Route): void {
    if (this.disposed) return;
    const prev = this.prevRoute;
    this.prevRoute = route;
    if (prev === null) this.log({ type: 'session-start', screen: screenOf(route) });
    const fromWorld = this.fromWorld;
    const via = entryRouteOf(prev, fromWorld, this.stationRoute);
    this.fromWorld = null;
    if (route.kind === 'station') {
      if (prev?.kind === 'station' && prev.stationId === route.stationId) return;
      if (!this.d.map.station(route.stationId)) return;
      this.stationRoute = via;
      // 월드에서 연 것은 연 순간에 이미 적었다(openedFromWorld). 목록, 지도, 주소 같은 다른 길로 연 것만 여기서 적는다
      if (!fromWorld) this.log({ type: 'station-enter', stationId: route.stationId, route: via });
    } else if (route.kind === 'quest') {
      const r = this.d.catalog.resolveHash(route.hash);
      if (!r.ok) return;
      // 설치물에서 '패널로 보기'로 옮긴 것은 같은 도전을 다른 화면으로 보는 것이다(월드에서 곧바로, 표지판에서 고른 그 도전으로)
      const inst = this.d.installation.state.get();
      if (inst.mode && prev?.kind === 'home' && inst.targetKey === `${r.quest.questId}/${r.variant.variantId}`) return;
      // 같은 과제의 다른 판본으로 옮긴 것도 새로 들어온 것이 아니다
      if (prev?.kind === 'quest') {
        const before = this.d.catalog.resolveHash(prev.hash);
        if (before.ok && before.quest.questId === r.quest.questId) return;
      }
      const station = this.d.map.stationsForQuest(r.quest.questId)[0];
      this.log({ type: 'quest-enter', questId: r.quest.questId, variantId: r.variant.variantId, route: via, surface: 'panel', ...(station ? { stationId: station.stationId } : {}) });
    } else if (route.kind === 'overlay' && route.page === 'help' && !(prev?.kind === 'overlay' && prev.page === 'help')) {
      this.log({ type: 'help-open', kind: 'page', what: 'help' });
    }
  }

  // ------------------------------------------------------------------ 월드

  /** 월드에서 정거장을 열었다. 이 일의 결과(화면 이동이나 설치물 들어가기)가 같은 흐름 안에서 이어지므로, 그때까지만 길을 기억한다 */
  private openedFromWorld(stationId: string): void {
    const route = this.walkedOrTeleported(stationId);
    this.fromWorld = route;
    this.log({ type: 'station-enter', stationId, route });
    queueMicrotask(() => {
      this.fromWorld = null;
    });
  }

  private walkedOrTeleported(stationId: string): EntryRoute {
    const t = this.teleported;
    if (!t || t.stationId !== stationId) {
      this.teleported = null;
      return 'walk';
    }
    const st = this.d.map.station(stationId);
    const spot = t.spot ?? (st ? standOf(st) : null);
    const p = this.d.bridge.position.get();
    if (spot && Math.hypot(p.x - spot.x, p.y - spot.y) <= STILL_RADIUS_PX) return 'map';
    this.teleported = null; // 서 있던 자리에서 움직였다: 걸은 것이다
    return 'walk';
  }

  // ------------------------------------------------------------------ 설치물

  private onInstallation(st: InstallationUiState): void {
    const prev = this.installUi;
    this.installUi = st;
    if (st.helpOpen && !prev.helpOpen && st.mode) this.log({ type: 'help-open', kind: 'card', what: st.mode.installationId });
    const mode = st.mode;
    if (!mode) {
      this.installKey = null;
      this.installReady = false;
      return;
    }
    if (prev.mode?.installationId !== mode.installationId) {
      // 들어가기는 도전을 열 수 없으면 같은 호출 안에서 되돌려진다. 흐름이 끝난 뒤에도 들어가 있을 때만 적는다
      const fromWorld = this.fromWorld;
      const route = fromWorld ?? 'other';
      this.installRoute = route;
      this.installKey = null;
      this.installReady = false;
      queueMicrotask(() => {
        const now = this.d.installation.state.get();
        if (this.disposed || !now.mode || now.mode.installationId !== mode.installationId) return;
        this.installReady = true;
        // 월드에서 연 것은 연 순간에 이미 적었다. 그 밖의 길로 들어갔다면(시험, 점검) 여기서 적는다
        if (!fromWorld) this.log({ type: 'station-enter', stationId: mode.stationId, route });
        this.noteInstallationTarget(mode.stationId, now.targetKey);
      });
      return;
    }
    if (this.installReady) this.noteInstallationTarget(mode.stationId, st.targetKey);
  }

  /** 설치물에서 표지판의 도전이 바뀌었다. 과제를 골랐을 때만 들어간 것으로 적는다(자유로 놀기는 과제가 아니다) */
  private noteInstallationTarget(stationId: string, key: string): void {
    if (key === this.installKey) return;
    this.installKey = key;
    if (key === 'free') return;
    const [questId, variantId] = key.split('/');
    if (!questId || !variantId) return;
    this.log({ type: 'quest-enter', questId, variantId, route: this.installRoute, surface: 'world', stationId });
  }

  // ------------------------------------------------------------------ 컨트롤러와 세션

  /** 도움을 새로 켰다(느리게 듣기, 박 반복, 박 수 표시, 덧줄 보기) */
  private onControllerChange(): void {
    const now = this.d.controller.aids;
    const before = this.aids;
    this.aids = now;
    const cur = this.d.controller.current;
    for (const k of ['slow', 'repeat', 'showCount', 'ledger', 'scoped'] as const) {
      if (now[k] && !before[k]) this.log({ type: 'help-open', kind: 'aid', what: k, ...(cur ? { questId: cur.entry.questId, variantId: cur.variant.variantId } : {}) });
    }
  }

  private currentSignature(): { key: string; text: string } | null {
    const active = this.d.session.activeChallenge;
    if (!active) return null;
    return { key: `${active.questId}/${active.variantId}`, text: JSON.stringify(this.d.session.content()) };
  }

  private onSession(): void {
    // 도움 연습에 들어가고 원래 곡으로 돌아오는 것
    const sc = this.d.session.supportContext;
    const was = this.assist;
    this.assist = sc;
    if (sc && (!was || was.practiceId !== sc.practiceId || was.depth !== sc.depth)) {
      const o = sc.origin.challenge;
      this.assistLogged = true;
      this.log({ type: 'help-open', kind: 'practice', what: sc.practiceId, questId: o.questId, variantId: o.variantId });
    } else if (!sc && was) {
      const o = was.origin.challenge;
      if (this.assistLogged) this.log({ type: 'return-to-origin', questId: o.questId, variantId: o.variantId });
      this.assistLogged = false;
    }
    // 놓은 것이 바뀐 것(놓기, 옮기기, 지우기, 실행 취소와 다시 하기). 선택만 바뀌거나 같은 것을 다시 놓은 것은 아니다
    const next = this.currentSignature();
    const prev = this.sig;
    this.sig = next;
    if (next && prev && next.key === prev.key && next.text !== prev.text && !sc) {
      const [questId, variantId] = next.key.split('/') as [string, string];
      this.log({ type: 'placement-edit', questId, variantId, surface: this.surface(), ...(isFreeQuestId(questId) ? { free: true as const } : {}) });
    }
  }
}
