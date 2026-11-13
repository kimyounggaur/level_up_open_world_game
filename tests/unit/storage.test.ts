// 저장소(10.1, 10.6): IndexedDB가 기본, localStorage가 보조, 둘 다 안 되면 메모리. 새 저장은 검사한 뒤에 현재로 바꾼다.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { buildSave, emptySave, inspectSave, serializeSave } from '@/domain/save/save';
import { DEFAULT_SETTINGS } from '@/domain/save/settings';
import {
  SaveStorage,
  browserStorageEnv,
  localStorageBackend,
  memoryBackend,
  openBestBackend,
  openIndexedDb,
  storageKeyPrefix,
} from '@/platform/storage';
import type { KeyValueBackend, OpenedBackend, SyncBackend } from '@/platform/storage';

const PREFIX = storageKeyPrefix('levelup-music-world', 1);
const T1 = '2026-11-11T01:00:00.000Z';
const T2 = '2026-11-11T02:00:00.000Z';
const T3 = '2026-11-11T03:00:00.000Z';

/** 저장 글자 하나. 위치 x로 서로 구별한다 */
const saveText = (savedAt: string, x = 100): string =>
  serializeSave({ ...emptySave(savedAt), explorationState: { ...emptySave(savedAt).explorationState, position: { x, y: 200, regionId: 'village', facing: 'down' } } });

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const opened = (backend: KeyValueBackend, sync: SyncBackend | null = null): OpenedBackend => ({ backend, sync, kind: backend.kind, fallback: null });
const storageOf = (o: OpenedBackend) => new SaveStorage({ keyPrefix: PREFIX, opened: o, inspect: (t) => inspectSave(t) });

/** 시험에서 키 이름으로 직접 들여다본다 */
const KEY = {
  current: `${PREFIX}save:current`,
  previous: `${PREFIX}save:previous`,
  next: `${PREFIX}save:next`,
  emergency: `${PREFIX}save:emergency`,
  unreadable: `${PREFIX}save:unreadable`,
};

describe('저장 키', () => {
  it('프로젝트 id와 저장 형식 판이 앞에 붙는다(D-6)', () => {
    expect(PREFIX).toBe('levelup-music-world:v1:');
  });
});

describe('메모리·localStorage 저장소', () => {
  it('메모리: 쓰고 읽고 지운다. 동기로도 된다', async () => {
    const m = memoryBackend();
    expect(await m.get('a')).toBeNull();
    await m.set('a', '1');
    expect(await m.get('a')).toBe('1');
    expect(m.getSync('a')).toBe('1');
    m.setSync('b', '2');
    expect(await m.get('b')).toBe('2');
    await m.remove('a');
    m.removeSync('b');
    expect(m.data.size).toBe(0);
    expect(m.kind).toBe('memory');
  });

  it('localStorage: 넘겨받은 저장소에 쓴다', async () => {
    const ls = fakeStorage();
    const b = localStorageBackend(ls);
    await b.set('k', 'v');
    expect(ls.data.get('k')).toBe('v');
    expect(await b.get('k')).toBe('v');
    expect(b.getSync('k')).toBe('v');
    await b.remove('k');
    expect(ls.data.size).toBe(0);
    expect(b.kind).toBe('localstorage');
  });
});

describe('IndexedDB 저장소', () => {
  it('쓴 것을 읽고, 지우고, 문자열이 아닌 값은 없는 것으로 본다', async () => {
    const factory = new IDBFactory();
    const idb = await openIndexedDb(factory);
    expect(idb.kind).toBe('indexeddb');
    expect(await idb.get('x')).toBeNull();
    await idb.set('x', '안녕');
    expect(await idb.get('x')).toBe('안녕');
    await idb.set('x', '덮어씀');
    expect(await idb.get('x')).toBe('덮어씀');
    await idb.remove('x');
    expect(await idb.get('x')).toBeNull();
  });

  it('다시 열어도 남아 있다(새로 고침)', async () => {
    const factory = new IDBFactory();
    const first = await openIndexedDb(factory);
    await first.set('k', 'v');
    const second = await openIndexedDb(factory);
    expect(await second.get('k')).toBe('v');
  });

  it('db 이름이 다르면 서로 보이지 않는다', async () => {
    const factory = new IDBFactory();
    const a = await openIndexedDb(factory, { dbName: 'a' });
    const b = await openIndexedDb(factory, { dbName: 'b' });
    await a.set('k', 'v');
    expect(await b.get('k')).toBeNull();
  });

  it('열기가 시간 안에 끝나지 않으면 실패로 친다', async () => {
    const never = { open: () => ({}) } as unknown as IDBFactory;
    await expect(openIndexedDb(never, { timeoutMs: 20 })).rejects.toThrow('시간 안에');
  });

  it('열다가 던지는 브라우저도 실패로 친다', async () => {
    const throwing = {
      open: () => {
        throw new Error('SecurityError');
      },
    } as unknown as IDBFactory;
    await expect(openIndexedDb(throwing)).rejects.toThrow('SecurityError');
  });

  it('열기 요청이 오류로 끝나면 실패로 친다', async () => {
    const failing = {
      open: () => {
        const req = {} as { onerror?: () => void; error?: Error };
        queueMicrotask(() => {
          req.error = new Error('열 수 없음');
          req.onerror?.();
        });
        return req;
      },
    } as unknown as IDBFactory;
    await expect(openIndexedDb(failing)).rejects.toThrow('열 수 없음');
  });
});

describe('쓸 수 있는 저장소 고르기', () => {
  it('IndexedDB가 되면 그것을 쓰고, localStorage는 긴급 사본용으로 곁에 둔다', async () => {
    const r = await openBestBackend({ indexedDB: new IDBFactory(), localStorage: fakeStorage() });
    expect(r.kind).toBe('indexeddb');
    expect(r.fallback).toBeNull();
    expect(r.sync?.kind).toBe('localstorage');
  });

  it('확인용으로 적은 값을 남기지 않는다', async () => {
    const ls = fakeStorage();
    const factory = new IDBFactory();
    await openBestBackend({ indexedDB: factory, localStorage: ls });
    expect(ls.data.size).toBe(0);
    const idb = await openIndexedDb(factory);
    expect(await idb.get('levelup-music-world:probe')).toBeNull();
  });

  it('IndexedDB가 없으면 localStorage로 간다. 이유를 남긴다', async () => {
    const r = await openBestBackend({ localStorage: fakeStorage() });
    expect(r.kind).toBe('localstorage');
    expect(r.fallback).toContain('IndexedDB');
  });

  it('IndexedDB가 고장 났으면 localStorage로 간다', async () => {
    const broken = {
      open: () => {
        throw new Error('막힘');
      },
    } as unknown as IDBFactory;
    const r = await openBestBackend({ indexedDB: broken, localStorage: fakeStorage() });
    expect(r.kind).toBe('localstorage');
    expect(r.fallback).toContain('막힘');
  });

  it('둘 다 안 되면 메모리로 간다. 새로 고치면 사라진다는 것을 알 수 있다', async () => {
    const r = await openBestBackend({});
    expect(r.kind).toBe('memory');
    expect(r.fallback).toBeTruthy();
    const full: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const r2 = await openBestBackend({ localStorage: full });
    expect(r2.kind).toBe('memory');
    expect(r2.fallback).toContain('localStorage도 안 돼요');
  });

  it('localStorage만 막혀 있으면 IndexedDB를 쓰되 동기 저장소는 없다', async () => {
    const full: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new Error('막힘');
      },
      removeItem: () => undefined,
    };
    const r = await openBestBackend({ indexedDB: new IDBFactory(), localStorage: full });
    expect(r.kind).toBe('indexeddb');
    expect(r.sync).toBeNull();
  });

  it('창의 저장소에 접근만 해도 던지는 브라우저를 견딘다', () => {
    const win = {
      get indexedDB(): IDBFactory {
        throw new Error('denied');
      },
      get localStorage(): Storage {
        throw new Error('denied');
      },
    };
    expect(browserStorageEnv(win)).toEqual({ indexedDB: undefined, localStorage: undefined });
  });
});

describe('SaveStorage: 저장과 읽기', () => {
  it('아무것도 없으면 empty다', async () => {
    const s = storageOf(opened(memoryBackend()));
    expect(await s.load()).toEqual({ kind: 'empty' });
    expect(s.status.get().phase).toBe('idle');
  });

  it('저장한 것을 읽는다. 상태는 saved가 되고 마지막 저장 시각이 남는다', async () => {
    const mem = memoryBackend();
    const s = storageOf(opened(mem));
    expect(await s.save(saveText(T1))).toBe(true);
    expect(s.status.get()).toMatchObject({ phase: 'saved', savedAt: T1, problem: null });
    expect(mem.data.get(KEY.current)).toBe(saveText(T1));
    expect(mem.data.has(KEY.next)).toBe(false); // 임시 자리는 비운다
    const again = storageOf(opened(mem));
    expect(await again.load()).toEqual({ kind: 'loaded', text: saveText(T1), source: 'current' });
  });

  it('IndexedDB에 저장하고 다시 열어 읽는다(새로 고침)', async () => {
    const factory = new IDBFactory();
    const s1 = storageOf(opened(await openIndexedDb(factory)));
    expect(await s1.save(saveText(T1, 111))).toBe(true);
    const s2 = storageOf(opened(await openIndexedDb(factory)));
    const r = await s2.load();
    expect(r.kind === 'loaded' && r.text).toBe(saveText(T1, 111));
  });

  it('두 번째 저장부터 직전 저장이 따로 남는다', async () => {
    const mem = memoryBackend();
    const s = storageOf(opened(mem));
    await s.save(saveText(T1, 1));
    expect(mem.data.has(KEY.previous)).toBe(false);
    await s.save(saveText(T2, 2));
    await s.save(saveText(T3, 3));
    expect(mem.data.get(KEY.current)).toBe(saveText(T3, 3));
    expect(mem.data.get(KEY.previous)).toBe(saveText(T2, 2));
  });

  it('형식이 틀린 저장은 현재를 바꾸지 않는다(검사한 뒤 바꾸기)', async () => {
    const mem = memoryBackend();
    const s = storageOf(opened(mem));
    await s.save(saveText(T1, 1));
    expect(await s.save('{깨짐')).toBe(false);
    expect(s.status.get().phase).toBe('failed');
    expect(s.status.get().problem).toContain('올바르지 않아');
    expect(mem.data.get(KEY.current)).toBe(saveText(T1, 1));
    expect(await s.save(JSON.stringify({ ...JSON.parse(saveText(T2)), projectId: 'other' }))).toBe(false);
    expect(mem.data.get(KEY.current)).toBe(saveText(T1, 1));
    // 실패한 뒤에도 다음 저장은 된다
    expect(await s.save(saveText(T3, 3))).toBe(true);
  });

  it('다시 읽어 보니 다르면 현재를 바꾸지 않는다', async () => {
    const mem = memoryBackend();
    const lying: KeyValueBackend = { ...mem, kind: 'memory', get: async (k) => (k === KEY.next ? 'x' : mem.data.get(k) ?? null) };
    const s = storageOf(opened(lying));
    expect(await s.save(saveText(T1))).toBe(false);
    expect(s.status.get().problem).toContain('다시 읽으니');
    expect(mem.data.has(KEY.current)).toBe(false);
  });

  it('저장소 오류는 던지지 않고 상태로 알린다. 공간이 가득 찬 경우는 내보내라고 안내한다', async () => {
    const mem = memoryBackend();
    const quota: KeyValueBackend = {
      ...mem,
      set: async () => {
        const e = new Error('full');
        e.name = 'QuotaExceededError';
        throw e;
      },
    };
    const s = storageOf(opened(quota));
    expect(await s.save(saveText(T1))).toBe(false);
    expect(s.status.get()).toMatchObject({ phase: 'failed' });
    expect(s.status.get().problem).toContain('내보내');
    const other: KeyValueBackend = {
      ...mem,
      set: async () => {
        throw new Error('디스크 오류');
      },
    };
    const s2 = storageOf(opened(other));
    expect(await s2.save(saveText(T1))).toBe(false);
    expect(s2.status.get().problem).toContain('디스크 오류');
  });

  it('저장이 겹쳐도 차례대로 끝난다: 마지막으로 요청한 것이 남는다', async () => {
    const mem = memoryBackend();
    const slow: KeyValueBackend = {
      ...mem,
      set: async (k, v) => {
        await new Promise((r) => setTimeout(r, k === KEY.current ? 15 : 1));
        mem.data.set(k, v);
      },
    };
    const s = storageOf(opened(slow));
    const results = await Promise.all([s.save(saveText(T1, 1)), s.save(saveText(T2, 2)), s.save(saveText(T3, 3))]);
    expect(results).toEqual([true, true, true]);
    expect(mem.data.get(KEY.current)).toBe(saveText(T3, 3));
    expect(mem.data.get(KEY.previous)).toBe(saveText(T2, 2));
  });
});

describe('SaveStorage: 망가진 저장에서 일어서기', () => {
  it('현재 저장이 망가졌으면 직전 저장으로 열고, 망가진 것은 지우지 않고 따로 둔다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    mem.data.set(KEY.previous, saveText(T1, 7));
    const s = storageOf(opened(mem));
    const r = await s.load();
    expect(r).toEqual({ kind: 'loaded', text: saveText(T1, 7), source: 'previous' });
    expect(s.status.get().recoveredFromPrevious).toBe(true);
    expect(mem.data.get(KEY.unreadable)).toBe('{깨짐');
    expect(mem.data.get(KEY.current)).toBe(saveText(T1, 7)); // 되살린 것이 현재가 된다
    // 다시 열면 평범하게 현재로 열린다
    const s2 = storageOf(opened(mem));
    expect(await s2.load()).toEqual({ kind: 'loaded', text: saveText(T1, 7), source: 'current' });
  });

  it('둘 다 못 읽으면 읽을 수 없다고 알리고, 새로 시작하되 망가진 것을 남겨 둔다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    mem.data.set(KEY.previous, '또 깨짐');
    const s = storageOf(opened(mem));
    const r = await s.load();
    expect(r.kind).toBe('unreadable');
    expect(s.status.get()).toMatchObject({ unreadable: true });
    expect(s.status.get().problem).toContain('새로 시작');
    expect(mem.data.get(KEY.unreadable)).toBe('{깨짐');
    // 새로 시작해서 저장하면 정상으로 돌아온다
    expect(await s.save(saveText(T2))).toBe(true);
    expect(mem.data.get(KEY.current)).toBe(saveText(T2));
  });

  it('저장 도중 멈춘 흔적(임시 자리)이 현재보다 새것이고 유효하면 그것으로 연다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, saveText(T1, 1));
    mem.data.set(KEY.next, saveText(T2, 2));
    const s = storageOf(opened(mem));
    expect(await s.load()).toEqual({ kind: 'loaded', text: saveText(T2, 2), source: 'pending' });
    expect(mem.data.get(KEY.current)).toBe(saveText(T2, 2));
    expect(mem.data.get(KEY.previous)).toBe(saveText(T1, 1));
    expect(mem.data.has(KEY.next)).toBe(false);
  });

  it('임시 자리가 반쯤 쓰다 만 것이면 무시하고 현재로 연다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, saveText(T1, 1));
    mem.data.set(KEY.next, saveText(T2, 2).slice(0, 40));
    const s = storageOf(opened(mem));
    expect(await s.load()).toEqual({ kind: 'loaded', text: saveText(T1, 1), source: 'current' });
  });

  it('저장소를 읽다가 던져도 새로 시작하고 상태로 알린다', async () => {
    const mem = memoryBackend();
    const broken: KeyValueBackend = {
      ...mem,
      get: async () => {
        throw new Error('읽기 오류');
      },
    };
    const s = storageOf(opened(broken));
    expect(await s.load()).toEqual({ kind: 'empty' });
    expect(s.status.get()).toMatchObject({ phase: 'failed' });
    expect(s.status.get().problem).toContain('읽기 오류');
  });
});

describe('SaveStorage: 페이지가 닫힐 때(긴급 사본)', () => {
  it('동기 저장소에 사본을 적고, 다음에 열 때 현재보다 새것이면 그것으로 연다', async () => {
    const mem = memoryBackend();
    const ls = memoryBackend();
    const s = storageOf(opened(mem, ls));
    await s.save(saveText(T1, 1));
    expect(s.saveEmergency(saveText(T2, 2))).toBe(true);
    expect(ls.data.get(KEY.emergency)).toBe(saveText(T2, 2));
    const again = storageOf(opened(mem, ls));
    expect(await again.load()).toEqual({ kind: 'loaded', text: saveText(T2, 2), source: 'emergency' });
    expect(mem.data.get(KEY.current)).toBe(saveText(T2, 2));
  });

  it('긴급 사본이 현재보다 오래됐으면 현재로 연다', async () => {
    const mem = memoryBackend();
    const ls = memoryBackend();
    const s = storageOf(opened(mem, ls));
    s.saveEmergency(saveText(T1, 1));
    await s.save(saveText(T2, 2));
    const again = storageOf(opened(mem, ls));
    expect(await again.load()).toEqual({ kind: 'loaded', text: saveText(T2, 2), source: 'current' });
  });

  it('동기 저장소가 없거나, 형식이 틀렸거나, 던지면 false다(던지지 않는다)', () => {
    expect(storageOf(opened(memoryBackend(), null)).saveEmergency(saveText(T1))).toBe(false);
    const ls = memoryBackend();
    expect(storageOf(opened(memoryBackend(), ls)).saveEmergency('{깨짐')).toBe(false);
    const throwing: SyncBackend = {
      ...memoryBackend(),
      setSync: () => {
        throw new Error('막힘');
      },
    };
    expect(storageOf(opened(memoryBackend(), throwing)).saveEmergency(saveText(T1))).toBe(false);
  });
});

describe('SaveStorage: 가져오기와 지우기', () => {
  it('가져온 파일은 확인한 뒤 현재가 되고, 이전 현재는 직전 저장으로 남는다. 더 새로운 긴급 사본은 지운다', async () => {
    const mem = memoryBackend();
    const ls = memoryBackend();
    const s = storageOf(opened(mem, ls));
    await s.save(saveText(T2, 2));
    s.saveEmergency(saveText(T3, 3));
    const r = await s.importText(saveText(T1, 1));
    expect(r).toEqual({ ok: true });
    expect(mem.data.get(KEY.current)).toBe(saveText(T1, 1));
    expect(mem.data.get(KEY.previous)).toBe(saveText(T2, 2));
    expect(ls.data.has(KEY.emergency)).toBe(false);
    const again = storageOf(opened(mem, ls));
    expect(await again.load()).toEqual({ kind: 'loaded', text: saveText(T1, 1), source: 'current' });
  });

  it('틀린 파일은 거르고 이유를 돌려주며, 있던 저장을 건드리지 않는다', async () => {
    const mem = memoryBackend();
    const s = storageOf(opened(mem));
    await s.save(saveText(T1, 1));
    const bad = await s.importText('이건 저장 파일이 아니에요');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toContain('JSON');
    const other = await s.importText(JSON.stringify({ ...JSON.parse(saveText(T2)), projectId: 'someone-else' }));
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.errors.join()).toContain('다른 게임');
    expect(mem.data.get(KEY.current)).toBe(saveText(T1, 1));
  });

  it('clear는 이 프로젝트의 저장을 모두 지운다. 다른 키는 건드리지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set('다른 게임:v1:save:current', 'keep');
    const s = storageOf(opened(mem, mem));
    await s.save(saveText(T1));
    await s.save(saveText(T2));
    s.saveEmergency(saveText(T3));
    await s.clear();
    expect([...mem.data.keys()]).toEqual(['다른 게임:v1:save:current']);
    expect(await s.load()).toEqual({ kind: 'empty' });
  });
});

describe('실제 저장 내용으로', () => {
  it('buildSave로 만든 저장을 IndexedDB에 넣었다 꺼내면 같다', async () => {
    const save = buildSave({
      savedAt: T1,
      contentVersions: {},
      position: { x: 3984, y: 3480, regionId: 'village', facing: 'down' },
      openedQuests: [],
      settings: { ...DEFAULT_SETTINGS },
      session: { activeChallenge: null, challengeDrafts: {}, supportContext: null },
      attempts: [],
      preferences: { language: 'ko', introSeen: true },
    });
    const text = serializeSave(save);
    const factory = new IDBFactory();
    const s = storageOf(opened(await openIndexedDb(factory)));
    expect(await s.save(text)).toBe(true);
    const r = await storageOf(opened(await openIndexedDb(factory))).load();
    expect(r).toEqual({ kind: 'loaded', text, source: 'current' });
  });
});
