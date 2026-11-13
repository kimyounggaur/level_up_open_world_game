// 4-8 사용 기록 저장소(platform/log): 기기 안에만 쌓는다. 모아서 쓰기, 껐다 켜기, 지우기, 읽기 실패에도 게임이 계속 되는 것, 저장과 키가 겹치지 않는 것.
import { describe, expect, it } from 'vitest';
import { LOG_FORMAT, emptyUsageLog } from '@/domain/usagelog';
import type { LogBody } from '@/domain/usagelog';
import { LOG_DEBOUNCE_MS, UsageLog, usageLogKey } from '@/platform/log';
import type { LogTimers } from '@/platform/log';
import { memoryBackend } from '@/platform/storage';
import type { KeyValueBackend } from '@/platform/storage';
import { makeStorage } from '@/app/boot';

const KEY = 'levelup-music-world:v1:usage-log';
const listen: LogBody = { type: 'listen', questId: 'scale.major', variantId: 'c-major', what: 'mine', surface: 'panel' };
const enter: LogBody = { type: 'quest-enter', questId: 'scale.major', variantId: 'c-major', route: 'walk', surface: 'world' };

/** 손으로 흘리는 시계 */
class FakeTimers implements LogTimers {
  private next = 1;
  readonly pending = new Map<number, () => void>();
  setTimeout(fn: () => void): number {
    const h = this.next++;
    this.pending.set(h, fn);
    return h;
  }
  clearTimeout(h: unknown): void {
    this.pending.delete(h as number);
  }
  /** 예약된 것을 모두 부른다 */
  fire(): void {
    const run = [...this.pending.values()];
    this.pending.clear();
    for (const fn of run) fn();
  }
}

let clock = 0;
const nowIso = (): string => new Date(Date.UTC(2026, 10, 11, 9, 0, clock++)).toISOString();

/** 쓰기 횟수를 세는 저장소 */
function countingBackend(inner: KeyValueBackend = memoryBackend()): KeyValueBackend & { sets: number; gets: number } {
  const b = {
    kind: inner.kind,
    sets: 0,
    gets: 0,
    get: (k: string) => {
      b.gets++;
      return inner.get(k);
    },
    set: (k: string, v: string) => {
      b.sets++;
      return inner.set(k, v);
    },
    remove: (k: string) => inner.remove(k),
  };
  return b;
}

async function open(backend: KeyValueBackend = memoryBackend(), extra: { maxEvents?: number } = {}) {
  const timers = new FakeTimers();
  const log = await UsageLog.open({ backend, key: KEY, nowIso, timers, ...extra });
  return { log, timers, backend };
}

const stored = async (b: KeyValueBackend): Promise<{ events: Array<{ seq: number; sid: number; type: string }>; enabled: boolean; lastSid: number; dropped: number }> =>
  JSON.parse((await b.get(KEY)) ?? 'null') as never;

describe('열기', () => {
  it('처음에는 켜져 있는 빈 기록이다', async () => {
    const { log } = await open();
    expect(log.status.get()).toEqual({ enabled: true, count: 0, dropped: 0, backend: 'memory', phase: 'idle', problem: null });
    expect(log.snapshot().events).toEqual([]);
  });

  it('저장 키는 저장(save:*)과 다르다', () => {
    expect(usageLogKey('levelup-music-world:v1:')).toBe(KEY);
    expect(KEY).not.toMatch(/save:/);
  });

  it('저장소 없이 메모리에만 쌓는 기록은 창을 닫으면 사라진다고 상태로 알린다', () => {
    const log = UsageLog.inMemory(nowIso);
    log.record(listen);
    expect(log.status.get().backend).toBe('memory');
    expect(log.status.get().count).toBe(1);
  });
});

describe('쌓고 적기', () => {
  it('사건을 쌓으면 상태의 수가 늘고, 곧바로 적지는 않는다. 모아서 한 번에 적는다', async () => {
    const backend = countingBackend();
    const { log, timers } = await open(backend);
    log.beginSession();
    for (let i = 0; i < 5; i++) log.record(listen);
    expect(log.status.get().count).toBe(5);
    expect(backend.sets).toBe(0);
    expect(timers.pending.size).toBe(1); // 타이머는 하나뿐이다
    timers.fire();
    await log.flush();
    expect(backend.sets).toBe(1);
    expect((await stored(backend)).events).toHaveLength(5);
  });

  it('모으는 시간은 1.5초다', () => {
    expect(LOG_DEBOUNCE_MS).toBe(1500);
  });

  it('쓰고 나서 다시 열면 같은 사건이 이어진다: 번호(seq)와 실행 번호(sid)도 이어진다', async () => {
    const backend = memoryBackend();
    const first = await open(backend);
    first.log.beginSession();
    first.log.record(listen);
    first.log.record(enter);
    await first.log.flush();
    const second = await open(backend);
    expect(second.log.snapshot().events.map((e) => [e.seq, e.sid, e.type])).toEqual([
      [1, 1, 'listen'],
      [2, 1, 'quest-enter'],
    ]);
    expect(second.log.beginSession()).toBe(2);
    second.log.record(listen);
    expect(second.log.snapshot().events.at(-1)).toMatchObject({ seq: 3, sid: 2, type: 'listen' });
  });

  it('쓰기가 끝나면 상태는 saved가 되고 문제는 비운다', async () => {
    const { log } = await open();
    log.record(listen);
    expect(await log.flush()).toBe(true);
    expect(log.status.get()).toMatchObject({ phase: 'saved', problem: null });
  });

  it('바뀐 것이 없으면 다시 쓰지 않는다', async () => {
    const backend = countingBackend();
    const { log } = await open(backend);
    log.record(listen);
    await log.flush();
    await log.flush();
    expect(backend.sets).toBe(1);
  });

  it('페이지가 숨겨지면 기다리지 않고 바로 적기 시작한다', async () => {
    const backend = memoryBackend();
    const { log, timers } = await open(backend);
    log.record(listen);
    log.onHide();
    expect(timers.pending.size).toBe(0);
    await log.flush();
    expect((await stored(backend)).events).toHaveLength(1);
  });

  it('한도를 넘으면 되풀이 사건부터 지우고, 지운 수가 상태와 파일에 남는다', async () => {
    const backend = memoryBackend();
    const { log } = await open(backend, { maxEvents: 3 });
    log.beginSession();
    log.record(enter);
    for (let i = 0; i < 5; i++) log.record(listen);
    expect(log.status.get()).toMatchObject({ count: 3, dropped: 3 });
    await log.flush();
    const s = await stored(backend);
    expect(s.dropped).toBe(3);
    expect(s.events.map((e) => e.type)).toEqual(['quest-enter', 'listen', 'listen']);
  });

  it('닫으면 마지막으로 한 번 적고 그 뒤의 사건은 받지 않는다', async () => {
    const backend = memoryBackend();
    const { log } = await open(backend);
    log.record(listen);
    log.dispose();
    log.record(enter);
    await log.flush();
    expect((await stored(backend)).events.map((e) => e.type)).toEqual(['listen']);
  });

  it('쓰기는 차례로 한다: 느린 쓰기 중에 온 사건도 빠지지 않는다', async () => {
    const mem = memoryBackend();
    let release: (() => void) | null = null;
    let first = true;
    const slow: KeyValueBackend = {
      kind: 'memory',
      get: (k) => mem.get(k),
      remove: (k) => mem.remove(k),
      set: (k, v) => {
        if (first) {
          first = false;
          return new Promise<void>((resolve) => {
            release = () => void mem.set(k, v).then(resolve);
          });
        }
        return mem.set(k, v);
      },
    };
    const { log } = await open(slow);
    log.record(listen);
    const p1 = log.flush();
    await Promise.resolve();
    log.record(enter);
    const p2 = log.flush();
    release!();
    await Promise.all([p1, p2]);
    expect((await stored(mem)).events.map((e) => e.type)).toEqual(['listen', 'quest-enter']);
  });
});

describe('켜고 끄기', () => {
  it('끄면 사건을 받지 않고 있던 기록은 그대로다. 끈 것도 기억한다', async () => {
    const backend = memoryBackend();
    const { log } = await open(backend);
    log.record(listen);
    log.setEnabled(false);
    log.record(enter);
    expect(log.status.get()).toMatchObject({ enabled: false, count: 1 });
    await log.flush();
    const again = await open(backend);
    expect(again.log.status.get()).toMatchObject({ enabled: false, count: 1 });
    again.log.record(enter);
    expect(again.log.status.get().count).toBe(1);
  });

  it('다시 켜면 그 뒤의 사건부터 쌓인다', async () => {
    const { log } = await open();
    log.setEnabled(false);
    log.record(listen);
    log.setEnabled(true);
    log.record(enter);
    expect(log.snapshot().events.map((e) => e.type)).toEqual(['quest-enter']);
  });

  it('같은 값으로 바꾸면 아무것도 하지 않는다', async () => {
    const { log, timers } = await open();
    log.setEnabled(true);
    expect(timers.pending.size).toBe(0);
  });
});

describe('지우기', () => {
  it('기록을 모두 지우고 저장소에도 빈 기록을 적는다. 켜고 끈 것과 실행 번호는 그대로다', async () => {
    const backend = memoryBackend();
    const { log } = await open(backend);
    log.beginSession();
    log.beginSession();
    log.record(listen);
    await log.flush();
    log.setEnabled(false);
    await log.clear();
    expect(log.status.get()).toMatchObject({ enabled: false, count: 0, dropped: 0 });
    const s = await stored(backend);
    expect(s.events).toEqual([]);
    expect(s.enabled).toBe(false);
    expect(s.lastSid).toBe(2);
  });

  it('읽을 수 없어 따로 남긴 기록도 함께 지운다', async () => {
    const backend = memoryBackend();
    await backend.set(KEY, '{망가짐');
    const { log } = await open(backend);
    expect(await backend.get(`${KEY}:unreadable`)).toBe('{망가짐');
    await log.clear();
    expect(await backend.get(`${KEY}:unreadable`)).toBeNull();
  });

  it('저장을 지워도 기록은 그대로이고, 기록을 지워도 저장은 그대로다(키가 다르다)', async () => {
    const backend = memoryBackend();
    const storage = makeStorage({ backend, sync: backend, kind: 'memory', fallback: null });
    const { log } = await open(backend);
    log.record(listen);
    await log.flush();
    await storage.save(JSON.stringify({ x: 1 })); // 형식이 틀려 저장되지 않지만 키 충돌 여부와는 무관하다
    await storage.clear();
    expect((await stored(backend)).events).toHaveLength(1);
    await backend.set('levelup-music-world:v1:save:current', 'SAVE');
    await log.clear();
    expect(await backend.get('levelup-music-world:v1:save:current')).toBe('SAVE');
  });
});

describe('읽을 수 없을 때도 게임은 계속 된다', () => {
  it('망가진 기록은 지우지 않고 따로 남기고, 새로 시작한다고 알린다', async () => {
    const backend = memoryBackend();
    await backend.set(KEY, 'not json');
    const { log } = await open(backend);
    expect(await backend.get(`${KEY}:unreadable`)).toBe('not json');
    expect(log.status.get().problem).toContain('읽을 수 없어 새로 시작했어요');
    log.record(listen);
    expect(log.status.get().count).toBe(1);
  });

  it('우리 기록이 아닌 값도 같다', async () => {
    const backend = memoryBackend();
    await backend.set(KEY, JSON.stringify({ format: 'other' }));
    const { log } = await open(backend);
    expect(await backend.get(`${KEY}:unreadable`)).not.toBeNull();
    expect(log.status.get().problem).toContain('읽을 수 없어');
  });

  it('일부 사건만 망가졌으면 나머지는 남기고 새로 시작하지는 않는다', async () => {
    const backend = memoryBackend();
    const good = { ...emptyUsageLog(), nextSeq: 2, events: [{ ...listen, seq: 1, sid: 1, at: '2026-11-11T09:00:00.000Z' }, { type: 'listen' }] };
    await backend.set(KEY, JSON.stringify(good));
    const { log } = await open(backend);
    expect(log.status.get().count).toBe(1);
    expect(log.status.get().problem).toBeNull();
    expect(await backend.get(`${KEY}:unreadable`)).toBeNull();
  });

  it('읽다가 저장소 오류가 나면 있던 기록을 덮어쓰지 않도록 이번에는 적지 않는다. 쌓고 내보내는 것은 된다', async () => {
    const mem = memoryBackend();
    await mem.set(KEY, JSON.stringify({ ...emptyUsageLog(), events: [{ ...listen, seq: 1, sid: 1, at: '2026-11-11T09:00:00.000Z' }], nextSeq: 2 }));
    let sets = 0;
    const broken: KeyValueBackend = {
      kind: 'indexeddb',
      get: () => Promise.reject(new Error('디스크 오류')),
      set: (k, v) => {
        sets++;
        return mem.set(k, v);
      },
      remove: (k) => mem.remove(k),
    };
    const { log, timers } = await open(broken);
    expect(log.status.get().problem).toContain('지난 기록을 읽지 못했어요');
    expect(log.status.get().phase).toBe('failed');
    log.beginSession();
    log.record(enter);
    expect(timers.pending.size).toBe(0);
    expect(await log.flush()).toBe(false);
    expect(sets).toBe(0);
    expect(JSON.parse(log.exportFile().text).events).toHaveLength(1);
    expect(JSON.parse((await mem.get(KEY))!).events).toHaveLength(1); // 있던 기록은 그대로
  });

  it('쓰다가 오류가 나면 상태로 알리고 사건은 메모리에 남는다. 다음에 성공하면 문제를 비운다', async () => {
    const mem = memoryBackend();
    let fail = true;
    const flaky: KeyValueBackend = {
      kind: 'localstorage',
      get: (k) => mem.get(k),
      remove: (k) => mem.remove(k),
      set: (k, v) => (fail ? Promise.reject(Object.assign(new Error('x'), { name: 'QuotaExceededError' })) : mem.set(k, v)),
    };
    const { log } = await open(flaky);
    log.record(listen);
    expect(await log.flush()).toBe(false);
    expect(log.status.get()).toMatchObject({ phase: 'failed', count: 1 });
    expect(log.status.get().problem).toContain('저장 공간이 가득 찼어요');
    fail = false;
    log.record(enter);
    expect(await log.flush()).toBe(true);
    expect(log.status.get()).toMatchObject({ phase: 'saved', problem: null });
    expect((await stored(mem)).events).toHaveLength(2);
  });
});

describe('내보내기', () => {
  it('아직 적지 못한 사건도 파일에 들어가고, 파일 이름의 날짜는 내보낸 날이다', async () => {
    const { log } = await open();
    log.beginSession();
    log.record(listen);
    const f = log.exportFile();
    expect(f.fileName).toMatch(/^levelup-music-world-usage-log-2026-11-11\.json$/);
    const doc = JSON.parse(f.text) as { format: string; events: Array<{ sid: number }>; summary: { events: number } };
    expect(doc.format).toBe(LOG_FORMAT);
    expect(doc.events).toHaveLength(1);
    expect(doc.events[0]!.sid).toBe(1);
    expect(doc.summary.events).toBe(1);
  });

  it('끈 뒤에도 쌓인 기록은 내보낼 수 있다', async () => {
    const { log } = await open();
    log.record(listen);
    log.setEnabled(false);
    expect(JSON.parse(log.exportFile().text).events).toHaveLength(1);
  });
});
