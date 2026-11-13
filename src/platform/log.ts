// 사용 기록 저장소(설계서 10.9, 13.2): 사용 관찰에 쓰는 행동 기록을 기기 안에만 쌓는다.
// 서버로 보내지 않고, 설정에서 '내보내기'를 눌렀을 때만 파일로 나간다. 저장소는 저장(platform/storage)과 같은 것을 쓰되 키가 달라서,
// 저장을 내보내거나 가져오거나 지워도 기록은 그대로이고, 기록을 지워도 진행은 그대로다.
// 기록이 안 적혀도 게임은 계속 된다: 이 파일의 함수는 저장소 오류를 던지지 않고 상태(UsageLogStatus)로 알린다.
// 사건은 메모리에 먼저 쌓고 잠깐 모아서 한 번에 적는다. 페이지가 숨겨질 때는 바로 적기 시작한다(마지막 1–2초의 사건은 닫는 순간에 못 적힐 수 있다).
import { appendEvent, emptyUsageLog, exportLogFile, normalizeUsageLog, MAX_LOG_EVENTS } from '../domain/usagelog';
import type { LogBody, UsageLogData } from '../domain/usagelog';
import { Store } from './bridge';
import { memoryBackend } from './storage';
import type { BackendKind, KeyValueBackend } from './storage';

/** 사건이 잇달아 오면 이만큼 모았다가 한 번에 적는다 */
export const LOG_DEBOUNCE_MS = 1500;

export type LogPhase = 'idle' | 'saving' | 'saved' | 'failed';

export interface UsageLogStatus {
  /** 새 사건을 적는가 */
  enabled: boolean;
  /** 들고 있는 사건의 수 */
  count: number;
  /** 한도가 차서 지운 사건의 수 */
  dropped: number;
  /** 어디에 적고 있는가. memory면 창을 닫거나 새로 고칠 때 사라진다 */
  backend: BackendKind;
  phase: LogPhase;
  /** 마지막 문제(사람이 읽는 문장). 없으면 null */
  problem: string | null;
}

export interface LogTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: LogTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface UsageLogOptions {
  backend: KeyValueBackend;
  /** 저장 키. 예: 'levelup-music-world:v1:usage-log' */
  key: string;
  /**
   * 옛 판의 기록 키들(가까운 판부터). 이 판의 키가 비어 있을 때만 읽고, 옛 키는 읽기만 한다(덮지 않는다). 지우는 것은 사용자가 기록을 지울 때(clear)뿐이다.
   * 기록의 키에도 저장 형식 판 번호가 들어 있어서, 이 길이 없으면 판을 올릴 때 쌓아 둔 관찰 기록이 새 키에서 빈 채로 시작한다(8-6)
   */
  olderKeys?: readonly string[];
  nowIso: () => string;
  maxEvents?: number;
  debounceMs?: number;
  timers?: LogTimers;
}

const describeError = (e: unknown): string => {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'QuotaExceededError') return '저장 공간이 가득 찼어요';
  return e instanceof Error && e.message ? e.message : String(e);
};

export class UsageLog {
  readonly status: Store<UsageLogStatus>;
  private data: UsageLogData;
  private readonly o: UsageLogOptions;
  private readonly timers: LogTimers;
  private readonly max: number;
  /** 읽다가 실패했으면 있던 기록을 모르는 채로 덮어쓰지 않도록 이번 실행은 적지 않는다 */
  private readonly persistable: boolean;
  private dirty = false;
  private timer: unknown = null;
  private chain: Promise<unknown> = Promise.resolve();
  private disposed = false;

  private constructor(o: UsageLogOptions, data: UsageLogData, persistable: boolean, problem: string | null) {
    this.o = o;
    this.data = data;
    this.persistable = persistable;
    this.timers = o.timers ?? realTimers;
    this.max = o.maxEvents ?? MAX_LOG_EVENTS;
    this.status = new Store<UsageLogStatus>({
      enabled: data.enabled,
      count: data.events.length,
      dropped: data.dropped,
      backend: o.backend.kind,
      phase: problem ? 'failed' : 'idle',
      problem,
    });
  }

  /** 저장소에서 지난 기록을 읽어 연다. 읽을 수 없으면(망가졌거나 저장소 오류) 이유를 상태에 남기고 이어서 쓸 수 있는 빈 기록으로 시작한다 */
  static async open(o: UsageLogOptions): Promise<UsageLog> {
    let raw: string | null;
    let fromOlder = false;
    try {
      raw = await o.backend.get(o.key);
      for (const k of raw === null ? (o.olderKeys ?? []) : []) {
        const r = await o.backend.get(k);
        if (r !== null) {
          raw = r;
          fromOlder = true;
          break;
        }
      }
    } catch (e) {
      // 읽지 못했다: 기록이 있는지 모른다. 이번 실행은 메모리에만 쌓아 있던 기록을 덮어쓰지 않는다
      return new UsageLog(o, emptyUsageLog(), false, `지난 기록을 읽지 못했어요(${describeError(e)}). 이번 기록은 이 기기에 남기지 않아요.`);
    }
    if (raw === null) return new UsageLog(o, emptyUsageLog(), true, null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const { data, issues } = normalizeUsageLog(parsed, o.maxEvents ?? MAX_LOG_EVENTS);
    let problem: string | null = null;
    // 옛 판에서 온 기록이 읽을 수 없으면 이 판의 키에는 아무것도 적지 않고 빈 기록으로 시작한다(옛 키는 그대로 둔다)
    if (fromOlder && (parsed === undefined || (issues.length > 0 && data.events.length === 0))) return new UsageLog(o, emptyUsageLog(), true, null);
    if (parsed === undefined || (issues.length > 0 && data.events.length === 0)) {
      // 읽을 수 없는 기록은 지우지 않고 따로 남긴다
      await o.backend.set(`${o.key}:unreadable`, raw).catch(() => undefined);
      problem = '지난 기록을 읽을 수 없어 새로 시작했어요. 읽을 수 없는 기록은 지우지 않고 따로 남겨 뒀어요.';
    }
    return new UsageLog(o, data, true, problem);
  }

  /** 저장소 없이 메모리에만 쌓는다(저장소를 열지 못했거나 읽다가 멈췄을 때, 시험) */
  static inMemory(nowIso: () => string, extra: Partial<Pick<UsageLogOptions, 'maxEvents' | 'debounceMs' | 'timers'>> = {}): UsageLog {
    return new UsageLog({ backend: memoryBackend(), key: 'usage-log', nowIso, ...extra }, emptyUsageLog(), true, null);
  }

  /** 지금 기록(복사본) */
  snapshot(): UsageLogData {
    return { ...this.data, events: [...this.data.events] };
  }

  get enabled(): boolean {
    return this.data.enabled;
  }

  /** 새 실행을 시작한다. 이 뒤의 사건에는 이 실행의 번호가 붙는다. 켜져 있지 않아도 번호는 센다 */
  beginSession(): number {
    this.data = { ...this.data, lastSid: this.data.lastSid + 1 };
    this.markDirty();
    return this.data.lastSid;
  }

  /** 사건 하나를 적는다. 꺼져 있으면 적지 않는다. 던지지 않는다 */
  record(body: LogBody): void {
    if (this.disposed || !this.data.enabled) return;
    this.data = appendEvent(this.data, body, this.o.nowIso(), this.data.lastSid, this.max);
    this.patch();
    this.markDirty();
  }

  /** 새 사건을 적을지 정한다. 끄면 있던 기록은 그대로 두고 더 적지 않는다 */
  setEnabled(on: boolean): void {
    if (on === this.data.enabled) return;
    this.data = { ...this.data, enabled: on };
    this.patch();
    this.markDirty();
  }

  /** 기록을 모두 지운다(읽을 수 없어 따로 남긴 것도, 옛 판의 키에 남은 것도). 켜고 끈 것은 그대로다 */
  clear(): Promise<void> {
    this.data = { ...emptyUsageLog(this.data.enabled), lastSid: this.data.lastSid };
    this.patch();
    this.dirty = true;
    return this.enqueue(async () => {
      this.cancelTimer();
      if (this.persistable) {
        await this.o.backend.remove(`${this.o.key}:unreadable`).catch(() => undefined);
        // 옛 판의 키에 남은 기록도 지운다. 남겨 두면 '지웠다'는 말이 거짓이 된다: 앱은 보지 않아도 기기에는 그대로 있다(8-6)
        for (const k of this.o.olderKeys ?? []) {
          await this.o.backend.remove(k).catch(() => undefined);
          await this.o.backend.remove(`${k}:unreadable`).catch(() => undefined);
        }
      }
      await this.write();
    }).then(() => undefined);
  }

  /** 파일로 내보낼 글자와 이름. 아직 적지 못한 사건도 들어간다 */
  exportFile(): { fileName: string; text: string } {
    return exportLogFile(this.data, this.o.nowIso());
  }

  /** 지금까지 쌓인 것을 저장소에 적는다. 적었거나 적을 것이 없으면 true */
  flush(): Promise<boolean> {
    this.cancelTimer();
    return this.enqueue(() => this.write());
  }

  /** 페이지가 숨겨지거나 닫힐 때: 기다리지 않고 바로 적기 시작한다 */
  onHide(): void {
    void this.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelTimer();
    void this.flush();
    this.disposed = true;
  }

  // ------------------------------------------------------------------ 안쪽

  private patch(extra: Partial<UsageLogStatus> = {}): void {
    this.status.set({ ...this.status.get(), enabled: this.data.enabled, count: this.data.events.length, dropped: this.data.dropped, ...extra });
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.timer !== null || this.disposed || !this.persistable) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.o.debounceMs ?? LOG_DEBOUNCE_MS);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  /** 앞선 쓰기가 끝난 뒤에 차례로 한다(뒤섞이지 않게) */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async write(): Promise<boolean> {
    if (!this.dirty) return true;
    if (!this.persistable) {
      this.dirty = false;
      return false;
    }
    const text = JSON.stringify(this.data);
    this.dirty = false;
    this.patch({ phase: 'saving' });
    try {
      await this.o.backend.set(this.o.key, text);
      this.patch({ phase: 'saved', problem: null });
      return true;
    } catch (e) {
      this.dirty = true; // 다음 사건이나 다음 시점에 다시 적는다
      this.patch({ phase: 'failed', problem: `기록을 적지 못했어요: ${describeError(e)}` });
      return false;
    }
  }
}

/** 기록 키 앞에 붙는 말은 저장과 같다(프로젝트 id와 저장 형식 판). 저장 키(save:*)와 겹치지 않는다 */
export const usageLogKey = (keyPrefix: string): string => `${keyPrefix}usage-log`;
