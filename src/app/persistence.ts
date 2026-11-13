// 저장 주도자(설계서 10.6): 지금 상태에서 저장 값을 만들고, 언제 저장할지 정해 저장소(platform/storage)에 맡긴다.
//
// 저장 시점: 편집 확정, 도전 전환, 도움 진입과 복귀(모두 세션이 바뀔 때), 정거장에서 나갈 때(화면이 바뀔 때),
// 걷는 중에는 30초마다. 통과 기록이 생기면 바로. 설정, 환경설정, 열어 본 과제, 찾은 발견 요소, 저장한 곡이 바뀔 때도 저장한다.
// 편집은 잇달아 오므로 잠깐 모아서 한 번에 쓴다. 바뀐 것이 없으면(내용 지문이 같으면) 쓰지 않는다.
// 페이지가 숨겨지거나 닫히는 순간에는 IndexedDB를 기다릴 수 없어, 동기 저장소에 긴급 사본을 먼저 적는다.
// 저장이 실패해도 게임은 계속 되고, 실패는 상태(SaveStatus)로만 알린다. 다음 시점에 다시 시도한다.
import type { ContentCatalog } from '../domain/catalog';
import { buildSave, serializeSave } from '../domain/save/save';
import type { SaveData, SavedPosition } from '../domain/save/save';
import type { Preferences, Settings } from '../domain/save/settings';
import type { ChallengeSession, SessionSnapshot } from '../domain/session';
import type { AttemptResult } from '../domain/attempt';
import { Store } from '../platform/bridge';
import type { SaveStatus, SaveStorage } from '../platform/storage';
import type { ChallengeController } from '../ui/challenge/controller';
import type { Creations } from './creations';
import type { FoundDiscoveries } from './found';
import type { OpenedQuests } from './opened';
import type { VisitedStations } from './visited';
import type { WorldHost } from './world-host';

/** 편집이 잇달아 오면 이만큼 모았다가 한 번에 저장한다 */
export const SAVE_DEBOUNCE_MS = 400;
/** 걷는 중에는 이 간격으로 저장한다(10.6) */
export const WALKING_SAVE_INTERVAL_MS = 30_000;

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** 페이지가 숨겨지거나 닫히는 순간을 알린다. 시험에서는 가짜를 넣는다 */
export interface PageEvents {
  onHide(listener: () => void): () => void;
}

/** 브라우저 창에서: pagehide(닫기, 이동)와 visibilitychange(숨김; 휴대폰에서 앱 전환은 이것만 온다) */
export function browserPageEvents(win: Window): PageEvents {
  return {
    onHide(listener) {
      const onVisibility = (): void => {
        if (win.document.visibilityState === 'hidden') listener();
      };
      win.addEventListener('pagehide', listener);
      win.document.addEventListener('visibilitychange', onVisibility);
      return () => {
        win.removeEventListener('pagehide', listener);
        win.document.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };
}

export interface PersistenceDeps {
  storage: SaveStorage;
  catalog: ContentCatalog;
  session: ChallengeSession;
  controller: ChallengeController;
  settings: Store<Settings>;
  preferences: Store<Preferences>;
  opened: OpenedQuests;
  visited: VisitedStations;
  /** 찾은 발견 요소(6단계) */
  found: FoundDiscoveries;
  /** 저장한 곡, 내 곡(6단계) */
  creations: Creations;
  world: WorldHost;
  /** 저장에서 읽은 것. 처음 저장과 같은 내용이면 다시 쓰지 않으려고(지문 비교) 받는다 */
  restored: SaveData | null;
  nowIso?: () => string;
  debounceMs?: number;
  walkingIntervalMs?: number;
  timers?: Timers;
  pageEvents?: PageEvents | null;
}

export type ImportOutcome = { ok: true } | { ok: false; errors: string[] };

/** 키 순서와 무관하게 같은 값이면 같은 글자가 되게 한다 */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** 저장 내용의 지문. 저장한 때(savedAt)는 빼고 비교한다 */
export const fingerprintOf = (save: SaveData): string => stableStringify({ ...save, savedAt: '' });

export class Persistence {
  readonly status: Store<SaveStatus>;
  private readonly d: PersistenceDeps;
  private readonly timers: Timers;
  private readonly nowIso: () => string;
  private lastFp: string | null;
  private inFlightFp: string | null = null;
  private timer: unknown = null;
  private interval: unknown = null;
  private moved = false;
  private frozen = false;
  private disposed = false;
  private readonly offs: Array<() => void> = [];

  constructor(d: PersistenceDeps) {
    this.d = d;
    this.status = d.storage.status;
    this.timers = d.timers ?? realTimers;
    this.nowIso = d.nowIso ?? (() => new Date().toISOString());
    this.lastFp = d.restored ? fingerprintOf(d.restored) : null;
  }

  /** 저장 시점의 구독을 건다 */
  start(): void {
    if (this.offs.length > 0 || this.disposed) return;
    const d = this.d;
    const soon = (): void => this.request();
    this.offs.push(
      d.session.subscribe(soon),
      d.settings.subscribe(soon),
      d.preferences.subscribe(soon),
      d.opened.store.subscribe(soon),
      d.visited.store.subscribe(soon),
      d.found.store.subscribe(soon),
      d.creations.store.subscribe(soon),
      d.world.bridge.events.subscribe(soon),
      // 한 번이라도 움직였으면 위치를 저장에 적는다. 걷지 않은 채 주소로 패널만 연 사람의 저장에는 위치를 적지 않는다
      d.world.bridge.position.subscribe(() => {
        this.moved = true;
      }),
      // 통과 기록은 합주 층수의 원본이라 기다리지 않고 저장한다
      d.controller.onAttempt(() => void this.flush()),
    );
    this.interval = this.timers.setInterval(() => void this.flush(), d.walkingIntervalMs ?? WALKING_SAVE_INTERVAL_MS);
    const page = d.pageEvents;
    if (page) this.offs.push(page.onHide(() => this.onHide()));
  }

  /** 화면이 바뀔 때(정거장에서 나가기, 도전 전환 등) 부른다. 모아 두지 않고 바로 저장한다 */
  touch(): void {
    void this.flush();
  }

  /** 곧 저장한다(잇달아 부르면 한 번으로 모은다) */
  request(): void {
    if (this.frozen || this.disposed || this.timer !== null) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.d.debounceMs ?? SAVE_DEBOUNCE_MS);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  /** 지금 상태로 저장 값을 만든다 */
  build(): SaveData {
    const d = this.d;
    const pos = d.world.bridge.position.get();
    const position: SavedPosition | null =
      this.moved || d.restored?.explorationState.position
        ? { x: Math.round(pos.x), y: Math.round(pos.y), regionId: d.world.map.regionAt(pos.x, pos.y).regionId, facing: pos.facing }
        : null;
    const session = d.session.serialize();
    const attempts = d.controller.attempts;
    return buildSave({
      savedAt: this.nowIso(),
      contentVersions: this.versions(session, attempts, d.opened.toArray()),
      position,
      openedQuests: d.opened.toArray(),
      settings: d.settings.get(),
      session,
      attempts,
      preferences: d.preferences.get(),
      visitedStations: d.visited.toArray(),
      foundDiscoveries: d.found.toArray(),
      creations: d.creations.toJSON(),
    });
  }

  /** 저장에 이름이 오르는 과제들의 콘텐츠 판(열어 본 것, 초안이 있는 것, 기록이 있는 것) */
  private versions(session: SessionSnapshot, attempts: readonly AttemptResult[], opened: readonly string[]): Record<string, string> {
    const ids = new Set<string>(opened);
    for (const key of Object.keys(session.challengeDrafts)) ids.add(key.split('/')[0]!);
    if (session.activeChallenge) ids.add(session.activeChallenge.questId);
    for (const a of attempts) ids.add(a.questId);
    const out: Record<string, string> = {};
    for (const id of [...ids].sort()) {
      const entry = this.d.catalog.get(id);
      if (entry) out[id] = entry.definition.contentVersion;
    }
    return out;
  }

  /** 파일로 내보낼 글자와 파일 이름 */
  exportFile(): { fileName: string; text: string } {
    const save = this.build();
    return { fileName: `levelup-music-world-save-${save.savedAt.slice(0, 10)}.json`, text: serializeSave(save) };
  }

  /** 읽지 못해 따로 둔 저장의 원본(없으면 null). 파일로 내려받아 살펴보거나 도움을 받을 때 쓴다 */
  async exportUnread(): Promise<{ fileName: string; text: string } | null> {
    const text = await this.d.storage.readUnread();
    return text === null ? null : { fileName: `levelup-music-world-unread-${this.nowIso().slice(0, 10)}.json`, text };
  }

  /** 바뀐 것이 있으면 지금 저장한다. 저장했거나 이미 같은 내용이 저장돼 있으면 true */
  async flush(): Promise<boolean> {
    if (this.frozen || this.disposed) return false;
    this.cancelTimer();
    const save = this.build();
    const fp = fingerprintOf(save);
    if (fp === this.lastFp) return true;
    if (fp === this.inFlightFp) return true; // 같은 내용을 이미 쓰는 중이다
    this.inFlightFp = fp;
    const ok = await this.d.storage.save(serializeSave(save));
    if (this.inFlightFp === fp) this.inFlightFp = null;
    if (ok) this.lastFp = fp;
    return ok;
  }

  /** 페이지가 숨겨지거나 닫힐 때: 기다릴 수 없는 동기 사본을 먼저 적고, 이어서 평소처럼 저장을 시작한다 */
  private onHide(): void {
    if (this.frozen || this.disposed) return;
    const save = this.build();
    if (fingerprintOf(save) !== this.lastFp) this.d.storage.saveEmergency(serializeSave(save));
    void this.flush();
  }

  /**
   * 파일에서 가져온다. 확인(저장소가 한다)을 통과하면 현재 저장이 되고, 이 앱은 더 이상 저장하지 않는다
   * (지금 화면의 옛 상태가 가져온 저장을 덮어쓰지 않도록). 호출한 쪽이 이어서 화면을 새로 불러와야 한다.
   * 가져오는 동안 일어나는 저장이 끼어들지 않게 먼저 얼리고, 실패하면 다시 푼다.
   */
  async importText(text: string): Promise<ImportOutcome> {
    this.cancelTimer();
    const wasFrozen = this.frozen;
    this.frozen = true;
    const r = await this.d.storage.importText(text);
    if (!r.ok) {
      this.frozen = wasFrozen;
      this.request(); // 얼려 있는 동안 흘려보낸 저장 요청을 되살린다
      return r;
    }
    return { ok: true };
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelTimer();
    // 마지막 상태를 한 번 저장해 두고 끝낸다(저장 값은 여기서 동기로 만들어 넘기므로 이어서 닫아도 된다)
    if (!this.frozen) void this.flush();
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    if (this.interval !== null) this.timers.clearInterval(this.interval);
    this.interval = null;
  }
}
