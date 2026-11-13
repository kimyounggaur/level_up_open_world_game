// 저장소(설계서 10.1, 10.6): 서버 없이 기기 안에만 저장한다. 기본은 IndexedDB, 보조는 localStorage, 둘 다 안 되면 메모리(새로 고치면 사라진다)다.
// 저장은 두 벌이다: 현재 저장과 직전 정상 저장. 새 저장은 먼저 임시 자리에 적고 다시 읽어 확인한 뒤에야 현재로 바꾼다(검사한 뒤 바꾸기).
// 저장 키 앞에 프로젝트 id를 붙여, 같은 주소의 다른 게임이 남긴 저장을 읽거나 바꾸지 않는다.
// 저장이 안 돼도 게임은 계속 된다: 이 파일의 함수는 저장소 오류를 던지지 않고 상태(SaveStatus)로 알린다.
// 읽을 때는 전체 초기화를 자동으로 하지 않는다(10.6): 현재 → 직전 저장 → 읽을 수 있는 부분만 살리기 순으로 시도하고,
// 그래도 안 되면 새로 시작하되 망가진 원본은 지우지 않고 따로 두어 내려받을 수 있게 한다.
import { Store } from './bridge';

export type BackendKind = 'indexeddb' | 'localstorage' | 'memory';

export interface KeyValueBackend {
  readonly kind: BackendKind;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** 동기로 읽고 쓰는 저장소(localStorage, 메모리). 페이지가 닫히는 순간에도 끝까지 쓸 수 있다 */
export interface SyncKeyValue {
  getSync(key: string): string | null;
  setSync(key: string, value: string): void;
  removeSync(key: string): void;
}

export type SyncBackend = KeyValueBackend & SyncKeyValue;

// ---------------------------------------------------------------------------
// 저장소 구현

export function memoryBackend(): SyncBackend & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    kind: 'memory',
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
    getSync: (k) => data.get(k) ?? null,
    setSync: (k, v) => void data.set(k, v),
    removeSync: (k) => void data.delete(k),
  };
}

export function localStorageBackend(ls: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): SyncBackend {
  return {
    kind: 'localstorage',
    get: async (k) => ls.getItem(k),
    set: async (k, v) => ls.setItem(k, v),
    remove: async (k) => ls.removeItem(k),
    getSync: (k) => ls.getItem(k),
    setSync: (k, v) => ls.setItem(k, v),
    removeSync: (k) => ls.removeItem(k),
  };
}

const IDB_STORE = 'save';
const IDB_VERSION = 1;

function wrapIndexedDb(db: IDBDatabase): KeyValueBackend {
  const run = <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(IDB_STORE, mode);
      } catch (e) {
        reject(e);
        return;
      }
      let result: T;
      const req = work(tx.objectStore(IDB_STORE));
      req.onsuccess = () => {
        result = req.result;
      };
      // 쓰기는 트랜잭션이 끝나야 확정된다. 요청이 성공했다는 것만으로는 아직 아니다
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB 오류'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 저장이 중단됐어요'));
    });
  return {
    kind: 'indexeddb',
    get: async (k) => {
      const v = await run<unknown>('readonly', (s) => s.get(k));
      return typeof v === 'string' ? v : null;
    },
    set: async (k, v) => void (await run('readwrite', (s) => s.put(v, k))),
    remove: async (k) => void (await run('readwrite', (s) => s.delete(k))),
  };
}

/** IndexedDB를 연다. 시간 안에 열리지 않으면(사생활 보호 모드에서 멈추는 브라우저가 있다) 실패로 친다 */
export function openIndexedDb(factory: IDBFactory, opts: { dbName?: string; timeoutMs?: number } = {}): Promise<KeyValueBackend> {
  const dbName = opts.dbName ?? 'levelup-music-world';
  const timeoutMs = opts.timeoutMs ?? 2000;
  return new Promise<KeyValueBackend>((resolve, reject) => {
    let settled = false;
    const fail = (e: unknown): void => {
      if (settled) return;
      settled = true;
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    const timer = setTimeout(() => fail(new Error('IndexedDB가 시간 안에 열리지 않았어요')), timeoutMs);
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(dbName, IDB_VERSION);
    } catch (e) {
      clearTimeout(timer);
      fail(e);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onerror = () => {
      clearTimeout(timer);
      fail(req.error ?? new Error('IndexedDB를 열 수 없어요'));
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        req.result.close(); // 이미 포기한 뒤에 열렸다
        return;
      }
      settled = true;
      resolve(wrapIndexedDb(req.result));
    };
  });
}

// ---------------------------------------------------------------------------
// 쓸 수 있는 저장소 고르기

export interface StorageEnv {
  indexedDB?: IDBFactory | undefined;
  localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
}

export interface OpenedBackend {
  backend: KeyValueBackend;
  /** 페이지가 닫히는 순간에도 쓸 수 있는 동기 저장소. 없을 수 있다 */
  sync: SyncBackend | null;
  kind: BackendKind;
  /** 기본(IndexedDB)이 아닌 곳을 쓰게 된 이유. 기본을 쓰면 null */
  fallback: string | null;
}

/** 시간 안에 끝나지 않으면 실패로 친다. 끝나지 않는 저장소(사생활 보호 모드의 일부 브라우저)가 시작을 붙잡지 못하게 한다 */
export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}이(가) ${ms}ms 안에 끝나지 않았어요`)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** 저장소를 쓸 수 있는지 한 번 적고 읽어 본다 */
async function probe(b: KeyValueBackend, key: string): Promise<void> {
  await b.set(key, 'ok');
  if ((await b.get(key)) !== 'ok') throw new Error('적은 값을 다시 읽을 수 없어요');
  await b.remove(key);
}

export async function openBestBackend(env: StorageEnv, opts: { dbName?: string; timeoutMs?: number } = {}): Promise<OpenedBackend> {
  const probeKey = `${opts.dbName ?? 'levelup-music-world'}:probe`;
  let local: SyncBackend | null = null;
  let localProblem: string | null = null;
  if (env.localStorage) {
    try {
      const candidate = localStorageBackend(env.localStorage);
      await probe(candidate, probeKey);
      local = candidate;
    } catch (e) {
      localProblem = e instanceof Error ? e.message : String(e);
    }
  }
  let fallback: string | null = null;
  if (env.indexedDB) {
    try {
      const idb = await openIndexedDb(env.indexedDB, opts);
      await withTimeout(probe(idb, probeKey), opts.timeoutMs ?? 2000, 'IndexedDB 확인');
      return { backend: idb, sync: local, kind: 'indexeddb', fallback: null };
    } catch (e) {
      fallback = `IndexedDB를 쓸 수 없어요: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    fallback = 'IndexedDB가 없는 브라우저예요';
  }
  if (local) return { backend: local, sync: local, kind: 'localstorage', fallback };
  const mem = memoryBackend();
  return { backend: mem, sync: mem, kind: 'memory', fallback: `${fallback}${localProblem ? ` / localStorage도 안 돼요: ${localProblem}` : ''}` };
}

/** 브라우저 창에서 저장소 두 가지를 꺼낸다. 접근만 해도 던지는 브라우저가 있어 하나씩 감싼다 */
export function browserStorageEnv(win: { indexedDB?: IDBFactory; localStorage?: Storage }): StorageEnv {
  let idb: IDBFactory | undefined;
  let ls: Storage | undefined;
  try {
    idb = win.indexedDB ?? undefined;
  } catch {
    idb = undefined;
  }
  try {
    ls = win.localStorage ?? undefined;
  } catch {
    ls = undefined;
  }
  return { indexedDB: idb, localStorage: ls };
}

// ---------------------------------------------------------------------------
// 두 벌 저장

export interface SaveInspection {
  errors: string[];
  /** 이 저장을 만든 때(ISO). 두 저장 중 새것을 가릴 때 쓴다 */
  savedAt: string | null;
}
export type SaveInspector = (text: string) => SaveInspection;

/** 부분 복구의 결과: 엄격한 검사를 통과하는 글자와, 버린 것을 알리는 문장들 */
export interface SaveSalvage {
  text: string;
  savedAt: string;
  warnings: string[];
}
/** 읽을 수 있는 것만 살려 다시 만든다. 살릴 수 없으면 null */
export type SaveSalvager = (text: string) => SaveSalvage | null;

export type SavePhase = 'starting' | 'idle' | 'saving' | 'saved' | 'failed';

export interface SaveStatus {
  /** 어디에 적고 있는가 */
  backend: BackendKind;
  phase: SavePhase;
  /** 마지막으로 저장에 성공한 때 */
  savedAt: string | null;
  /** 마지막 실패의 이유(사람이 읽는 문장). 없으면 null */
  problem: string | null;
  /** 읽을 때 현재 저장이 망가져 있어 직전 저장으로 열었는가 */
  recoveredFromPrevious: boolean;
  /** 읽을 때 저장이 있었지만 둘 다 읽을 수 없어 새로 시작했는가 */
  unreadable: boolean;
  /** 현재와 직전 저장이 모두 일부 망가져 있어, 읽을 수 있는 것만 살려 열었는가 */
  salvaged: boolean;
  /** 읽으면서 버리거나 기본값으로 돌린 것들(사람이 읽는 문장). 없으면 빈 목록 */
  loadWarnings: readonly string[];
  /** 읽지 못해 따로 둔 저장의 원본이 남아 있는가(내려받을 수 있다) */
  keptUnread: boolean;
  /** 새로 고치면 사라지는 곳에 적고 있는가(메모리) */
  volatile: boolean;
  /** 기본(IndexedDB)이 아닌 곳을 쓰는 이유 */
  fallback: string | null;
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; text: string; source: 'current' | 'previous' | 'pending' | 'emergency' | 'salvaged' | 'older' }
  | { kind: 'unreadable'; errors: string[] };

export interface SaveStorageOptions {
  /** 저장 키 앞에 붙는 말. 예: 'levelup-music-world:v1:' */
  keyPrefix: string;
  opened: OpenedBackend;
  inspect: SaveInspector;
  /** 현재와 직전 저장이 모두 엄격한 검사를 통과하지 못할 때 마지막으로 거는 부분 복구. 없으면 새로 시작한다 */
  salvage?: SaveSalvager;
  /**
   * 옛 판의 저장 키 앞말들(가까운 판부터). 이 판의 키가 모두 비어 있을 때만 읽고, 옛 키는 읽기만 한다: 덮지도 지우지도 않는다(앱을 옛 판으로 되돌릴 때를 위해).
   * 저장 키에 판 번호가 들어 있어서(D-104), 이 길이 없으면 판을 올린 앱은 옛 저장을 보지 못하고 빈 저장으로 시작한다(8-6, docs/operations.md)
   */
  olderPrefixes?: readonly string[];
}

const describeError = (e: unknown): string => {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'QuotaExceededError') return '저장 공간이 가득 찼어요. 설정에서 저장을 내보내 두세요.';
  return e instanceof Error && e.message ? e.message : String(e);
};

export class SaveStorage {
  readonly status: Store<SaveStatus>;
  private readonly backend: KeyValueBackend;
  private readonly sync: SyncBackend | null;
  private readonly inspect: SaveInspector;
  private readonly salvage: SaveSalvager | null;
  private readonly older: readonly string[];
  private readonly keys: Record<'current' | 'previous' | 'next' | 'emergency' | 'unreadable', string>;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(o: SaveStorageOptions) {
    this.backend = o.opened.backend;
    this.sync = o.opened.sync;
    this.inspect = o.inspect;
    this.salvage = o.salvage ?? null;
    this.older = o.olderPrefixes ?? [];
    const p = o.keyPrefix;
    this.keys = { current: `${p}save:current`, previous: `${p}save:previous`, next: `${p}save:next`, emergency: `${p}save:emergency`, unreadable: `${p}save:unreadable` };
    this.status = new Store<SaveStatus>({
      backend: o.opened.kind,
      phase: 'starting',
      savedAt: null,
      problem: null,
      recoveredFromPrevious: false,
      unreadable: false,
      salvaged: false,
      loadWarnings: [],
      keptUnread: false,
      volatile: o.opened.kind === 'memory',
      fallback: o.opened.fallback,
    });
  }

  private patch(p: Partial<SaveStatus>): void {
    this.status.set({ ...this.status.get(), ...p });
  }

  /** 앞선 저장·읽기가 끝난 뒤에 차례로 한다(뒤섞이지 않게) */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private valid(text: string | null): { text: string; savedAt: string } | null {
    if (text === null) return null;
    const r = this.inspect(text);
    return r.errors.length === 0 && r.savedAt ? { text, savedAt: r.savedAt } : null;
  }

  /**
   * 저장을 읽는다. 현재·임시·긴급(페이지가 닫힐 때 적은 것) 중 유효하면서 가장 새것을 고르고,
   * 모두 못 쓰면 직전 저장으로 열고, 그것도 안 되면 읽을 수 있는 부분만 살려 열고(부분 복구), 그것도 안 되면 읽을 수 없다고 알린다.
   * 새것이 현재가 아니면 현재로 올려 둔다. 어느 경우에도 망가진 원본은 지우지 않고 따로 둔다(D-24).
   */
  load(): Promise<LoadResult> {
    return this.enqueue(async () => {
      try {
        const [cur, next, prev, emergency, kept] = await Promise.all([
          this.backend.get(this.keys.current),
          this.backend.get(this.keys.next),
          this.backend.get(this.keys.previous),
          (this.sync ?? this.backend).get(this.keys.emergency),
          this.backend.get(this.keys.unreadable),
        ]);
        // 지난번에 따로 둔 원본이 있으면 내려받을 수 있다고 알린다(이번에 새로 두면 아래에서 덮어쓴다)
        const alreadyKept = kept !== null;
        const candidates = [
          { source: 'current' as const, v: this.valid(cur) },
          { source: 'pending' as const, v: this.valid(next) },
          { source: 'emergency' as const, v: this.valid(emergency) },
        ].filter((c): c is { source: 'current' | 'pending' | 'emergency'; v: { text: string; savedAt: string } } => c.v !== null);
        // 가장 새것. 같은 때면 앞선 것(현재)이 이긴다
        let best = candidates[0] ?? null;
        for (const c of candidates) if (best && Date.parse(c.v.savedAt) > Date.parse(best.v.savedAt)) best = c;
        if (best) {
          if (best.source !== 'current') await this.writeThrough(best.v.text, true);
          this.patch({ phase: 'idle', savedAt: best.v.savedAt, problem: null, keptUnread: alreadyKept });
          return { kind: 'loaded', text: best.v.text, source: best.source } as const;
        }
        const previous = this.valid(prev);
        if (previous) {
          const keptNow = await this.keepRaw(cur); // 망가진 것은 지우지 않고 따로 둔다
          await this.writeThrough(previous.text, false);
          this.patch({ phase: 'idle', savedAt: previous.savedAt, recoveredFromPrevious: true, keptUnread: keptNow || alreadyKept });
          return { kind: 'loaded', text: previous.text, source: 'previous' } as const;
        }
        const raw = [cur, next, prev, emergency].filter((t): t is string => t !== null);
        if (raw.length === 0) {
          const older = await this.loadOlder();
          if (older) {
            // 옛 판의 글자를 그대로 돌려준다. 현재 판으로 올리는 것은 읽는 쪽(parseSave)이 하고, 이 판의 키에는 앱의 첫 저장이 새 모양으로 적는다
            this.patch({ phase: 'idle', savedAt: older.savedAt, problem: null, keptUnread: alreadyKept });
            return { kind: 'loaded', text: older.text, source: 'older' } as const;
          }
          this.patch({ phase: 'idle', keptUnread: alreadyKept });
          return { kind: 'empty' } as const;
        }
        // 마지막 길: 읽을 수 있는 부분만 살린다. 살릴 수 있는 것 중 저장한 때가 가장 새것을 고른다(같으면 현재, 임시, 긴급, 직전 순)
        const salvaged = this.salvageNewest([cur, next, emergency, prev]);
        if (salvaged) {
          const keptNow = await this.keepRaw(salvaged.raw); // 살리면서 버린 부분이 든 원본
          await this.writeThrough(salvaged.text, false);
          this.patch({ phase: 'idle', savedAt: salvaged.savedAt, salvaged: true, loadWarnings: salvaged.warnings, keptUnread: keptNow || alreadyKept });
          return { kind: 'loaded', text: salvaged.text, source: 'salvaged' } as const;
        }
        const errors = raw.flatMap((t) => this.inspect(t).errors);
        const keptNow = await this.keepRaw(raw[0] ?? null);
        this.patch({ phase: 'idle', unreadable: true, problem: '저장된 내용을 읽을 수 없어 새로 시작해요.', keptUnread: keptNow || alreadyKept });
        return { kind: 'unreadable', errors } as const;
      } catch (e) {
        this.patch({ phase: 'failed', problem: `저장을 읽지 못했어요: ${describeError(e)}` });
        return { kind: 'empty' } as const;
      }
    });
  }

  /**
   * 이 판의 키가 모두 비었을 때 옛 판의 키에서 쓸 수 있는 저장을 찾는다(가까운 판부터, 한 판 안에서는 현재·임시·긴급 중 가장 새것, 없으면 직전).
   * 엄격한 검사(inspect)를 통과하는 것만 쓰고, 못 쓰는 옛 저장은 건드리지 않는다. 읽다가 던지면 load의 오류 처리로 간다(옛 저장을 모르는 채 새로 쓰지 않도록)
   */
  private async loadOlder(): Promise<{ text: string; savedAt: string } | null> {
    type Found = { text: string; savedAt: string };
    for (const p of this.older) {
      const [cur, next, prev, emergency] = await Promise.all([
        this.backend.get(`${p}save:current`),
        this.backend.get(`${p}save:next`),
        this.backend.get(`${p}save:previous`),
        (this.sync ?? this.backend).get(`${p}save:emergency`),
      ]);
      const fresh = [this.valid(cur), this.valid(next), this.valid(emergency)].filter((v): v is Found => v !== null);
      let best: Found | null = fresh[0] ?? null;
      for (const v of fresh) if (best && Date.parse(v.savedAt) > Date.parse(best.savedAt)) best = v;
      const found = best ?? this.valid(prev);
      if (found) return found;
    }
    return null;
  }

  /** 부분 복구를 해 볼 수 있는 것 중 저장한 때가 가장 새것(같으면 앞선 것) */
  private salvageNewest(raws: ReadonlyArray<string | null>): (SaveSalvage & { raw: string }) | null {
    if (!this.salvage) return null;
    let best: (SaveSalvage & { raw: string }) | null = null;
    for (const raw of raws) {
      if (raw === null) continue;
      let r: SaveSalvage | null = null;
      try {
        r = this.salvage(raw);
      } catch {
        r = null; // 복구하다 던지는 저장은 살릴 수 없는 저장으로 친다
      }
      if (r && (best === null || Date.parse(r.savedAt) > Date.parse(best.savedAt))) best = { ...r, raw };
    }
    return best;
  }

  /** 망가진 저장의 원본을 지우지 않고 따로 둔다(D-24). 가장 최근 것 하나만 둔다. 적지 못해도 읽기는 계속한다 */
  private async keepRaw(raw: string | null): Promise<boolean> {
    if (raw === null) return false;
    try {
      await this.backend.set(this.keys.unreadable, raw);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 읽은 뒤에 앱이 알아낸 것(칸을 기본값으로 돌린 것, 못 읽어 건너뛴 저장한 곡 등)을 상태에 올린다.
   * 바로 다음 저장이 이 저장의 원본을 덮어써 버리므로, 따로 둔 원본이 아직 없으면 raw를 원본으로 둔다.
   * 이미 따로 둔 원본이 있으면(이번에 직전 저장·부분 복구로 열었거나 지난번에 둔 것) 더 무거운 일의 흔적이므로 덮어쓰지 않는다.
   */
  noteLoadWarnings(warnings: readonly string[], raw: string | null): Promise<void> {
    return this.enqueue(async () => {
      if (warnings.length === 0) return;
      const now = this.status.get();
      const merged = [...now.loadWarnings, ...warnings.filter((w) => !now.loadWarnings.includes(w))];
      const kept = now.keptUnread || (await this.keepRaw(raw));
      this.patch({ loadWarnings: merged, keptUnread: kept });
    });
  }

  /** 따로 둔 원본을 읽는다. 없거나 읽지 못하면 null */
  readUnread(): Promise<string | null> {
    return this.enqueue(async () => {
      try {
        return await this.backend.get(this.keys.unreadable);
      } catch {
        return null;
      }
    });
  }

  /** 새 저장을 임시 자리에 적고 다시 읽어 확인한 뒤 현재로 바꾼다. 현재가 유효했다면 직전 저장으로 물려 둔다 */
  private async writeThrough(text: string, keepPrevious: boolean): Promise<void> {
    await this.backend.set(this.keys.next, text);
    if ((await this.backend.get(this.keys.next)) !== text) throw new Error('방금 적은 내용을 다시 읽으니 달랐어요');
    if (keepPrevious) {
      const cur = await this.backend.get(this.keys.current);
      if (cur !== null && cur !== text && this.valid(cur)) await this.backend.set(this.keys.previous, cur);
    }
    await this.backend.set(this.keys.current, text);
    await this.backend.remove(this.keys.next);
  }

  /** 저장한다. 성공하면 true. 형식이 틀린 저장이나 저장소 오류는 상태로 알리고 false를 돌려준다(던지지 않는다) */
  save(text: string): Promise<boolean> {
    return this.enqueue(async () => {
      const check = this.inspect(text);
      if (check.errors.length > 0 || !check.savedAt) {
        this.patch({ phase: 'failed', problem: `저장할 내용이 올바르지 않아 저장하지 않았어요: ${check.errors[0] ?? 'savedAt이 없어요'}` });
        return false;
      }
      this.patch({ phase: 'saving' });
      try {
        await this.writeThrough(text, true);
        this.patch({ phase: 'saved', savedAt: check.savedAt, problem: null });
        return true;
      } catch (e) {
        this.patch({ phase: 'failed', problem: `저장하지 못했어요: ${describeError(e)}` });
        return false;
      }
    });
  }

  /**
   * 페이지가 닫히거나 숨겨지는 순간에 쓴다. 기다릴 수 없어서 동기 저장소에 '긴급' 사본만 적는다.
   * 다음에 열 때 이것이 현재 저장보다 새것이면 현재로 올라간다.
   */
  saveEmergency(text: string): boolean {
    if (!this.sync) return false;
    const check = this.inspect(text);
    if (check.errors.length > 0) return false;
    try {
      this.sync.setSync(this.keys.emergency, text);
      return true;
    } catch {
      return false;
    }
  }

  /** 가져온 파일의 내용을 현재 저장으로 올린다. 올리기 전에 내용을 확인하고, 직전 저장에는 가져오기 전의 현재가 남는다 */
  async importText(text: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    const check = this.inspect(text);
    if (check.errors.length > 0 || !check.savedAt) return { ok: false, errors: check.errors.length > 0 ? check.errors : ['savedAt이 없어요'] };
    const ok = await this.save(text);
    if (!ok) return { ok: false, errors: [this.status.get().problem ?? '저장하지 못했어요'] };
    // 긴급 사본이 가져온 것보다 새것으로 남아 있으면 다음에 열 때 되돌아가므로 지운다
    try {
      this.sync?.removeSync(this.keys.emergency);
    } catch {
      /* 지우지 못해도 가져오기는 끝났다 */
    }
    return { ok: true };
  }

  /** 이 프로젝트의 저장을 모두 지운다(시험과 '저장 지우기'용). 지운다는 말은 옛 판의 키도 지운다는 뜻이다: 남겨 두면 다음에 읽을 때 되살아난다 */
  clear(): Promise<void> {
    return this.enqueue(async () => {
      const all = [...Object.values(this.keys), ...this.older.flatMap((p) => ['current', 'previous', 'next', 'emergency', 'unreadable'].map((k) => `${p}save:${k}`))];
      for (const k of all) {
        await this.backend.remove(k).catch(() => undefined);
        try {
          this.sync?.removeSync(k);
        } catch {
          /* 무시 */
        }
      }
      this.patch({ phase: 'idle', savedAt: null, problem: null, recoveredFromPrevious: false, unreadable: false, salvaged: false, loadWarnings: [], keptUnread: false });
    });
  }
}

/** 저장 키 앞에 붙는 말(D-6): 프로젝트 id와 저장 형식 판 */
export const storageKeyPrefix = (projectId: string, schemaVersion: number): string => `${projectId}:v${schemaVersion}:`;

/** 옛 판들의 저장 키 앞말, 가까운 판부터(current-1, …, 1). 판이 하나뿐이면 비어 있다 */
export const olderKeyPrefixes = (projectId: string, current: number): string[] =>
  Array.from({ length: Math.max(0, current - 1) }, (_, i) => storageKeyPrefix(projectId, current - 1 - i));
