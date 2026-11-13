// @vitest-environment jsdom
// 시작할 때 저장 읽기(3-8): 저장소를 고르고, 읽고, 앱 조립에 넘길 값으로 바꾼다. 멈추는 저장소가 시작을 붙잡지 않는다.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { makeStorage, openSave, optionsFromSave } from '@/app/boot';
import { buildSave, emptySave, serializeSave } from '@/domain/save/save';
import { DEFAULT_SETTINGS } from '@/domain/save/settings';
import { browserStorageEnv, memoryBackend, openIndexedDb } from '@/platform/storage';
import type { KeyValueBackend, OpenedBackend } from '@/platform/storage';

const T1 = '2026-11-11T01:00:00.000Z';
const KEY = (k: string): string => `levelup-music-world:v1:save:${k}`;

const withPosition = (savedAt: string, x: number): string => {
  const e = emptySave(savedAt);
  return serializeSave({ ...e, explorationState: { ...e.explorationState, position: { x, y: 1000, regionId: 'village', facing: 'right' }, openedQuests: ['a.b'] } });
};

describe('openSave', () => {
  it('저장소가 하나도 없으면 메모리로 시작하고, 새로 고치면 사라진다는 것을 상태로 알린다', async () => {
    const r = await openSave({});
    expect(r.save).toBeNull();
    expect(r.storage.status.get()).toMatchObject({ backend: 'memory', volatile: true });
    expect(r.storage.status.get().fallback).toBeTruthy();
  });

  it('IndexedDB에 저장한 것을 다시 열면 읽힌다', async () => {
    const factory = new IDBFactory();
    const first = await openSave(browserStorageEnv({ indexedDB: factory }));
    expect(first.save).toBeNull();
    expect(first.storage.status.get().backend).toBe('indexeddb');
    expect(await first.storage.save(withPosition(T1, 1234))).toBe(true);
    const again = await openSave(browserStorageEnv({ indexedDB: factory }));
    expect(again.save?.explorationState.position).toEqual({ x: 1234, y: 1000, regionId: 'village', facing: 'right' });
    expect(again.save?.explorationState.openedQuests).toEqual(['a.b']);
    expect(again.warnings).toEqual([]);
  });

  it('현재 저장이 망가졌으면 직전 저장으로 열고 상태로 알린다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), '{깨짐');
    mem.data.set(KEY('previous'), withPosition(T1, 77));
    const r = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    expect(r.save?.explorationState.position?.x).toBe(77);
    expect(r.storage.status.get().recoveredFromPrevious).toBe(true);
  });

  it('둘 다 망가졌으면 새로 시작하고 상태로 알린다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), '{깨짐');
    const r = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    expect(r.save).toBeNull();
    expect(r.storage.status.get().unreadable).toBe(true);
  });

  it('덜 중요한 칸이 잘못됐으면 그 칸만 기본값으로 돌리고, 알림 문장이 남는다', async () => {
    const mem = memoryBackend();
    const e = emptySave(T1);
    mem.data.set(KEY('current'), JSON.stringify({ ...e, explorationState: { ...e.explorationState, position: { x: -1, y: 5, regionId: 'village', facing: 'down' }, settings: { ...DEFAULT_SETTINGS, textSize: 'huge' } } }));
    const r = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    expect(r.save?.explorationState.position).toBeNull();
    expect(r.save?.explorationState.settings.textSize).toBe('normal');
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('읽다가 멈추면 시간이 지난 뒤 메모리로 시작한다. 있던 저장을 모르는 채 덮어쓰지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), withPosition(T1, 5));
    const hung: KeyValueBackend = { ...mem, get: () => new Promise<string | null>(() => undefined) };
    const r = await openSave({}, { opened: { kind: 'indexeddb', fallback: null, sync: null, backend: hung }, readTimeoutMs: 30 });
    expect(r.save).toBeNull();
    expect(r.storage.status.get()).toMatchObject({ backend: 'memory', volatile: true });
    expect(r.storage.status.get().fallback).toContain('저장하지 않아요');
    // 이번 실행의 저장은 멈춘 저장소에 닿지 않는다
    expect(await r.storage.save(withPosition('2026-11-11T02:00:00.000Z', 9))).toBe(true);
    expect(mem.data.get(KEY('current'))).toBe(withPosition(T1, 5));
  });

  it('다른 프로젝트의 저장은 읽지도 바꾸지도 않는다(저장 키 앞의 프로젝트 id)', async () => {
    const factory = new IDBFactory();
    const idb = await openIndexedDb(factory);
    await idb.set('other-game:v1:save:current', withPosition(T1, 42).replace('levelup-music-world', 'other-game'));
    const r = await openSave(browserStorageEnv({ indexedDB: factory }));
    expect(r.save).toBeNull();
    expect(await idb.get('other-game:v1:save:current')).toContain('other-game');
  });

  it('프로젝트 id를 바꾸면 그 프로젝트의 저장만 읽는다', async () => {
    const mem = memoryBackend();
    const other = makeStorage({ kind: 'memory', fallback: null, sync: mem, backend: mem }, 'other-game');
    await other.save(serializeSave({ ...emptySave(T1, 'other-game') }));
    const mine = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    expect(mine.save).toBeNull();
    const theirs = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem }, projectId: 'other-game' });
    expect(theirs.save?.projectId).toBe('other-game');
  });
});

describe('optionsFromSave', () => {
  it('저장이 없으면 빈 값이다(모두 기본값)', () => {
    expect(optionsFromSave(null)).toEqual({});
  });

  it('저장의 칸들을 앱 조립 값으로 옮긴다', () => {
    const save = buildSave({
      savedAt: T1,
      contentVersions: {},
      position: { x: 3984, y: 3480, regionId: 'village', facing: 'up' },
      openedQuests: ['rhythm.rest-in-a-bar'],
      settings: { ...DEFAULT_SETTINGS, textSize: 'large' },
      session: { activeChallenge: null, challengeDrafts: {}, supportContext: null },
      attempts: [],
      preferences: { language: 'ko', introSeen: true },
    });
    const o = optionsFromSave(save);
    expect(o.world).toEqual({ start: { x: 3984, y: 3480, facing: 'up' } });
    expect(o.settings?.textSize).toBe('large');
    expect(o.preferences).toEqual({ language: 'ko', introSeen: true });
    expect(o.opened).toEqual(['rhythm.rest-in-a-bar']);
    expect(o.session).toEqual({ activeChallenge: null, challengeDrafts: {}, supportContext: null });
    expect(o.attempts).toEqual([]);
  });

  it('위치가 없는 저장은 월드 시작 자리를 정하지 않는다', () => {
    expect(optionsFromSave(emptySave(T1)).world).toBeUndefined();
  });
});

describe('OpenedBackend 타입', () => {
  it('시험용 저장소 묶음은 OpenedBackend와 맞는다', () => {
    const mem = memoryBackend();
    const o: OpenedBackend = { kind: 'memory', fallback: null, sync: mem, backend: mem };
    expect(o.kind).toBe('memory');
  });
});
