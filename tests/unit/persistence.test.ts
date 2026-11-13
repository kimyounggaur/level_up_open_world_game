// @vitest-environment jsdom
// 저장 주도자(10.6)와 시작 복원(3-8): 언제 저장하는가, 바뀐 것이 없으면 쓰지 않는가, 페이지가 닫힐 때 동기 사본을 적는가,
// 저장에서 같은 자리·같은 초안·같은 설정·같은 통과 기록으로 되살아나는가, 가져오기가 옛 상태에 덮어쓰이지 않는가.
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeStorage, openSave, optionsFromSave } from '@/app/boot';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import { fingerprintOf, stableStringify } from '@/app/persistence';
import type { PageEvents, Timers } from '@/app/persistence';
import { makeAttemptResult } from '@/domain/attempt';
import { addCreation } from '@/domain/creation';
import type { Creation } from '@/domain/creation';
import { emptySave, parseSaveText, serializeSave } from '@/domain/save/save';
import type { SaveData } from '@/domain/save/save';
import { DEFAULT_SETTINGS } from '@/domain/save/settings';
import { PLAYER_START } from '@/domain/world';
import { browserStorageEnv, memoryBackend, openIndexedDb } from '@/platform/storage';
import type { OpenedBackend, SyncBackend } from '@/platform/storage';
import { FakeEngine } from './audio-fakes';
import { note, rest } from './helpers';
import { Q01, Q02, Q07, quest, setupDom } from './ui-rig';

beforeAll(() => setupDom());

/** 만든 앱을 시험이 끝나면 내린다 */
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

class FakeTimers implements Timers {
  now = 0;
  private seq = 0;
  private readonly timeouts = new Map<number, { at: number; fn: () => void }>();
  private readonly intervals = new Map<number, { every: number; next: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timeouts.set(id, { at: this.now + ms, fn });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timeouts.delete(h as number);
  }
  setInterval(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.intervals.set(id, { every: ms, next: this.now + ms, fn });
    return id;
  }
  clearInterval(h: unknown): void {
    this.intervals.delete(h as number);
  }
  /** 시간을 흘려보내며 때가 된 것을 부른다 */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due: Array<{ at: number; run: () => void }> = [];
      for (const [id, t] of this.timeouts) if (t.at <= end) due.push({ at: t.at, run: () => (this.timeouts.delete(id), t.fn()) });
      for (const t of this.intervals.values()) if (t.next <= end) due.push({ at: t.next, run: () => ((t.next += t.every), t.fn()) });
      if (due.length === 0) break;
      due.sort((a, b) => a.at - b.at);
      const first = due[0]!;
      this.now = Math.max(this.now, first.at);
      first.run();
    }
    this.now = end;
  }
  get pendingTimeouts(): number {
    return this.timeouts.size;
  }
}

class FakePage implements PageEvents {
  private readonly listeners = new Set<() => void>();
  onHide(l: () => void): () => void {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  hide(): void {
    for (const l of [...this.listeners]) l();
  }
  get size(): number {
    return this.listeners.size;
  }
}

const KEY_CURRENT = 'levelup-music-world:v1:save:current';
const KEY_EMERGENCY = 'levelup-music-world:v1:save:emergency';

interface Rig {
  ctx: AppContext;
  timers: FakeTimers;
  page: FakePage;
  /** 현재 저장 자리에 적힌 횟수 */
  writes: () => number;
  mem: SyncBackend & { data: Map<string, string> };
  /** 현재 저장에 적힌 글자 */
  current: () => string | null;
}

let clock = 0;
const tick = (): string => new Date(Date.UTC(2026, 10, 11, 3, 0, ++clock)).toISOString();

/** 같은 저장소(mem)를 쓰는 앱을 만든다. restored를 넘기면 그 저장에서 시작한 것처럼 한다 */
function boot(mem = memoryBackend(), restored: SaveData | null = null, extra: Partial<Parameters<typeof createAppContext>[0]> = {}): Rig {
  const timers = new FakeTimers();
  const page = new FakePage();
  let writes = 0;
  const counting: OpenedBackend = {
    kind: 'memory',
    fallback: null,
    sync: mem,
    backend: { ...mem, set: async (k, v) => (k === KEY_CURRENT && writes++, mem.set(k, v)) },
  };
  const storage = makeStorage(counting);
  const ctx = createAppContext({
    channel: 'preview',
    definitions: [quest(Q01), quest(Q02), quest(Q07)],
    createEngine: () => new FakeEngine(),
    makeId: (() => {
      let n = 0;
      return () => `att-${++n}`;
    })(),
    nowIso: tick,
    root: null,
    persistence: { storage, restored, pageEvents: page, timers, debounceMs: 400, walkingIntervalMs: 30_000 },
    ...(restored ? optionsFromSave(restored) : {}),
    ...extra,
  });
  cleanups.push(() => ctx.dispose());
  return { ctx, timers, page, writes: () => writes, mem, current: () => mem.data.get(KEY_CURRENT) ?? null };
}

const settle = (): Promise<void> => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

const place = (r: Rig, slot: number, letter: 'C' | 'D' | 'E', octave = 4): void => {
  act(() => r.ctx.controller.edit({ type: 'setSlot', slot, writtenPitch: { letter, accidental: null, octave } }));
};

const openQ01 = (r: Rig): void => {
  act(() => void r.ctx.controller.open(Q01, 'middle-c'));
};

const STAGE = 'inst.village.ensemble-stage';
/** 저장에 들어 있는 곡 하나(읽기를 거친 모양) */
const oneSong = (): Creation => {
  const r = addCreation([], { installationId: STAGE, events: [note('a', 0, 0, 960, 'C4'), note('b', 0, 960, 960, 'E4'), rest('r', 1, 0, 3840)], createdAt: '2026-11-11T00:00:00.000Z' });
  if (!r.ok) throw new Error(r.message);
  return r.creation;
};

const parsed = (text: string | null): SaveData => {
  const r = parseSaveText(text ?? '');
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.save;
};

describe('저장 시점', () => {
  it('아무것도 하지 않았으면 아무것도 쓰지 않는다', async () => {
    const r = boot();
    r.timers.advance(10_000);
    await settle();
    expect(r.writes()).toBe(0);
    expect(r.current()).toBeNull();
  });

  it('초안을 고치면 잠깐 모았다가 한 번 저장한다. 잇달아 고쳐도 한 번이다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    r.timers.advance(200);
    place(r, 2, 'E');
    r.timers.advance(199);
    await settle();
    expect(r.writes()).toBe(0); // 아직 모으는 중
    r.timers.advance(2);
    await settle();
    expect(r.writes()).toBe(1);
    const save = parsed(r.current());
    expect(save.challengeDrafts[`${Q01}/middle-c`]!.slots.map((s) => s.slot)).toEqual([1, 2]);
    expect(save.activeChallenge).toMatchObject({ questId: Q01, variantId: 'middle-c' });
  });

  it('바뀐 것이 없으면 다시 쓰지 않는다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    expect(await r.ctx.persistence!.flush()).toBe(true);
    expect(await r.ctx.persistence!.flush()).toBe(true);
    r.timers.advance(60_000);
    await settle();
    expect(r.writes()).toBe(1);
  });

  it('설정, 환경설정, 열어 본 과제가 바뀌어도 저장한다', async () => {
    const r = boot();
    act(() => r.ctx.settings.update((s) => ({ ...s, textSize: 'large' })));
    r.timers.advance(400);
    await settle();
    expect(parsed(r.current()).explorationState.settings.textSize).toBe('large');
    act(() => r.ctx.preferences.update((p) => ({ ...p, introSeen: true })));
    r.timers.advance(400);
    await settle();
    expect(parsed(r.current()).preferences.introSeen).toBe(true);
    act(() => r.ctx.opened.mark(Q02));
    r.timers.advance(400);
    await settle();
    expect(parsed(r.current()).explorationState.openedQuests).toEqual([Q02]);
    expect(parsed(r.current()).contentVersions[Q02]).toBeTruthy();
  });

  it('통과 기록이 생기면 기다리지 않고 저장한다(합주 층수의 원본, W-6)', async () => {
    const r = boot();
    act(() => void r.ctx.controller.open(Q02, 'quarter-rest'));
    const before = r.writes();
    act(() => void r.ctx.controller.check());
    await settle();
    expect(r.writes()).toBe(before + 1);
    expect(parsed(r.current()).attempts).toHaveLength(1);
  });

  it('걷는 중에는 30초마다 저장한다. 위치가 바뀌는 것만으로는 저장하지 않는다', async () => {
    const r = boot();
    act(() => r.ctx.world.bridge.position.set({ x: 3000, y: 2500, facing: 'left' }));
    r.timers.advance(29_999);
    await settle();
    expect(r.writes()).toBe(0);
    r.timers.advance(1);
    await settle();
    expect(r.writes()).toBe(1);
    expect(parsed(r.current()).explorationState.position).toMatchObject({ x: 3000, y: 2500, facing: 'left' });
    // 더 걷지 않으면 다음 30초에는 쓰지 않는다
    r.timers.advance(30_000);
    await settle();
    expect(r.writes()).toBe(1);
    act(() => r.ctx.world.bridge.position.set({ x: 3100, y: 2500, facing: 'right' }));
    r.timers.advance(30_000);
    await settle();
    expect(r.writes()).toBe(2);
  });

  it('위치는 걸은 뒤에만 적는다. 지역은 위치에서 계산한다', async () => {
    const r = boot();
    openQ01(r); // 걷지 않고 패널만 연다
    expect(r.ctx.persistence!.build().explorationState.position).toBeNull();
    act(() => r.ctx.world.bridge.position.set({ x: 7000, y: 5000, facing: 'down' }));
    const pos = r.ctx.persistence!.build().explorationState.position!;
    expect(pos).toMatchObject({ x: 7000, y: 5000, facing: 'down' });
    expect(pos.regionId).toBe(r.ctx.world.map.regionAt(7000, 5000).regionId);
  });

  it('화면이 바뀌어 touch()를 부르면 모으지 않고 바로 저장한다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    r.ctx.persistence!.touch();
    await settle();
    expect(r.writes()).toBe(1);
    expect(r.timers.pendingTimeouts).toBe(0); // 모으던 것은 취소했다
  });

  it('읽은 저장의 등불·발견·저장한 곡은 지우지 않고 이어 쓴다', async () => {
    const base = emptySave('2026-11-11T00:00:00.000Z');
    const song = oneSong();
    const restored: SaveData = { ...base, explorationState: { ...base.explorationState, visitedStations: ['H2', 'H4'], foundDiscoveries: ['disc.village.piece-3'], creations: [song] } };
    const r = boot(memoryBackend(), restored);
    act(() => r.ctx.opened.mark(Q01));
    r.timers.advance(400);
    await settle();
    const save = parsed(r.current());
    expect(save.explorationState.visitedStations).toEqual(['H2', 'H4']);
    expect(save.explorationState.foundDiscoveries).toEqual(['disc.village.piece-3']);
    expect(save.explorationState.creations).toEqual([song]);
  });

  it('찾은 발견 요소가 생기면 잠깐 뒤에 저장한다', async () => {
    const r = boot();
    act(() => void r.ctx.found.mark('disc.village.piece-1'));
    expect(r.writes()).toBe(0);
    r.timers.advance(400);
    await settle();
    expect(r.writes()).toBe(1);
    expect(parsed(r.current()).explorationState.foundDiscoveries).toEqual(['disc.village.piece-1']);
    // 이미 찾은 것을 또 찾아도 쓰지 않는다
    act(() => void r.ctx.found.mark('disc.village.piece-1'));
    r.timers.advance(400);
    await settle();
    expect(r.writes()).toBe(1);
  });

  it('곡을 저장하고, 이름을 바꾸고, 지우면 그때마다 저장에 반영된다', async () => {
    const r = boot();
    const saved = r.ctx.creations.save({ installationId: STAGE, events: oneSong().events, createdAt: tick() });
    expect(saved.ok).toBe(true);
    r.timers.advance(400);
    await settle();
    expect(parsed(r.current()).explorationState.creations).toHaveLength(1);
    act(() => void r.ctx.creations.rename('creation-1', '저녁 노래'));
    r.timers.advance(400);
    await settle();
    expect((parsed(r.current()).explorationState.creations[0] as { name: string }).name).toBe('저녁 노래');
    act(() => void r.ctx.creations.remove('creation-1'));
    r.timers.advance(400);
    await settle();
    expect(parsed(r.current()).explorationState.creations).toEqual([]);
  });

  it('새로 고쳐도 저장한 곡과 찾은 발견이 그대로 되살아난다', async () => {
    const mem = memoryBackend();
    const first = boot(mem);
    act(() => {
      first.ctx.found.mark('disc.village.note-2');
      first.ctx.found.mark('disc.village.piece-5');
      first.ctx.creations.save({ name: '아침 노래', installationId: STAGE, events: oneSong().events, createdAt: tick() });
    });
    first.timers.advance(400);
    await settle();
    const saved = parsed(first.current());
    first.ctx.dispose();
    const second = boot(mem, saved);
    expect(second.ctx.found.toArray()).toEqual(['disc.village.note-2', 'disc.village.piece-5']);
    expect(second.ctx.creations.list().map((c) => c.name)).toEqual(['아침 노래']);
    expect(second.ctx.creations.toJSON()).toEqual(saved.explorationState.creations);
    // 아무것도 만지지 않았으니 같은 내용을 또 쓰지 않는다
    second.timers.advance(60_000);
    await settle();
    expect(second.writes()).toBe(0);
  });

  it('읽을 수 없는 저장한 곡은 건너뛰고(알림을 남기고) 나머지는 산다', async () => {
    const mem = memoryBackend();
    const base = emptySave('2026-11-11T00:00:00.000Z');
    const bad = { creationId: 'creation-9', name: '깨진 곡', installationId: STAGE, createdAt: '', events: 'x' };
    const withBad: SaveData = { ...base, explorationState: { ...base.explorationState, creations: [oneSong(), bad] } };
    const opened: OpenedBackend = { kind: 'memory', fallback: null, sync: mem, backend: mem };
    await mem.set(KEY_CURRENT, serializeSave(withBad));
    const loaded = await openSave(browserStorageEnv(window), { opened });
    expect(loaded.warnings.some((w) => w.includes('creations[1]'))).toBe(true);
    const ctx = createAppContext({ channel: 'preview', definitions: [quest(Q01)], createEngine: () => new FakeEngine(), root: null, ...optionsFromSave(loaded.save) });
    cleanups.push(() => ctx.dispose());
    expect(ctx.creations.list().map((c) => c.creationId)).toEqual(['creation-1']);
  });
});

describe('페이지가 숨겨지거나 닫힐 때', () => {
  it('기다릴 수 없는 IndexedDB 대신 동기 사본을 바로 적고, 이어서 평소 저장을 시작한다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'D');
    r.page.hide();
    // 아직 아무것도 await하지 않았다: 동기 사본은 이미 적혀 있어야 한다
    const emergency = parsed(r.mem.data.get(KEY_EMERGENCY) ?? null);
    expect(emergency.challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(1);
    await settle();
    expect(parsed(r.current()).challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(1);
  });

  it('바뀐 것이 없으면 사본을 적지 않는다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'D');
    await r.ctx.persistence!.flush();
    r.mem.data.delete(KEY_EMERGENCY);
    r.page.hide();
    expect(r.mem.data.has(KEY_EMERGENCY)).toBe(false);
  });

  it('IndexedDB 쓰기가 끝나기 전에 닫혀도 다음에 열면 동기 사본으로 되살아난다', async () => {
    // 저장소의 쓰기가 영영 끝나지 않는 경우를 흉내 낸다
    const mem = memoryBackend();
    const hung: OpenedBackend = { kind: 'memory', fallback: null, sync: mem, backend: { ...mem, set: () => new Promise<void>(() => undefined) } };
    const timers = new FakeTimers();
    const page = new FakePage();
    const ctx = createAppContext({
      channel: 'preview',
      definitions: [quest(Q01), quest(Q02), quest(Q07)],
      createEngine: () => new FakeEngine(),
      nowIso: tick,
      root: null,
      persistence: { storage: makeStorage(hung), restored: null, pageEvents: page, timers },
    });
    cleanups.push(() => ctx.dispose());
    act(() => void ctx.controller.open(Q01, 'middle-c'));
    act(() => ctx.controller.edit({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'E', accidental: null, octave: 4 } }));
    page.hide();
    expect(mem.data.has(KEY_EMERGENCY)).toBe(true);
    // 다음 실행: 정상 저장소로 읽는다. 현재 저장은 없고 긴급 사본만 있다
    const loaded = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    expect(loaded.save?.challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(1);
  });
});

describe('새로 고친 뒤 같은 자리, 같은 초안(3-8)', () => {
  it('초안, 위치와 방향, 설정, 환경설정, 열어 본 과제, 통과 기록이 모두 되살아난다', async () => {
    const mem = memoryBackend();
    const a = boot(mem);
    // 사람이 한 일
    act(() => a.ctx.settings.update((s) => ({ ...s, textSize: 'large', reducedMotion: true, masterVolume: 0.4 })));
    act(() => a.ctx.preferences.update((p) => ({ ...p, introSeen: true })));
    act(() => a.ctx.world.bridge.position.set({ x: 6300, y: 4100, facing: 'up' }));
    act(() => void a.ctx.controller.open(Q02, 'quarter-rest'));
    a.ctx.opened.mark(Q02);
    act(() => a.ctx.controller.edit({ type: 'clear' }));
    act(() => void a.ctx.controller.check()); // 틀린 기록도 하나
    openQ01(a);
    place(a, 1, 'C');
    place(a, 2, 'E');
    act(() => a.ctx.controller.close());
    expect(await a.ctx.persistence!.flush()).toBe(true);
    const draftBefore = a.ctx.session.serialize();
    const attemptsBefore = a.ctx.controller.attempts.map((x) => x.attemptId);
    a.ctx.dispose();

    // 새로 고침: 같은 저장소에서 읽어 앱을 다시 만든다
    const loaded = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    expect(loaded.save).not.toBeNull();
    expect(loaded.warnings).toEqual([]);
    const b = boot(mem, loaded.save);
    expect(b.ctx.settings.get()).toMatchObject({ textSize: 'large', reducedMotion: true, masterVolume: 0.4 });
    expect(b.ctx.preferences.get().introSeen).toBe(true);
    expect([...b.ctx.opened.store.get()]).toEqual([Q02]);
    expect(b.ctx.world.bridge.position.get()).toEqual({ x: 6300, y: 4100, facing: 'up' });
    expect(b.ctx.session.serialize()).toEqual(draftBefore);
    expect(b.ctx.controller.attempts.map((x) => x.attemptId)).toEqual(attemptsBefore);
    // 되살린 직후에는 바뀐 것이 없으니 아무것도 다시 쓰지 않는다
    b.ctx.persistence!.touch();
    b.timers.advance(60_000);
    await settle();
    expect(b.writes()).toBe(0);
    // 같은 초안: 다시 열면 놓았던 음이 그대로다
    act(() => void b.ctx.controller.open(Q01, 'middle-c'));
    expect(b.ctx.controller.content().slots.map((s) => s.slot)).toEqual([1, 2]);
  });

  it('저장 없이 처음 열면 시작 자리와 기본 설정이다', () => {
    const r = boot();
    expect(r.ctx.world.bridge.position.get()).toEqual({ x: PLAYER_START.x, y: PLAYER_START.y, facing: 'down' });
    expect(r.ctx.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(r.ctx.controller.attempts).toEqual([]);
  });

  it('저장된 자리의 지역이 처음부터 화면에 맞게 보인다', () => {
    const base = emptySave('2026-11-11T00:00:00.000Z');
    const regionId = boot().ctx.world.map.regionAt(7000, 5000).regionId;
    const restored: SaveData = { ...base, explorationState: { ...base.explorationState, position: { x: 7000, y: 5000, regionId, facing: 'down' } } };
    const r = boot(memoryBackend(), restored);
    expect(r.ctx.world.bridge.status.get().regionId).toBe(regionId);
  });

  it('IndexedDB(가짜)를 거쳐도 같다', async () => {
    const factory = new IDBFactory();
    const idb = await openIndexedDb(factory);
    const sync = memoryBackend();
    const opened: OpenedBackend = { kind: 'indexeddb', fallback: null, sync, backend: idb };
    const timers = new FakeTimers();
    const ctx = createAppContext({
      channel: 'preview',
      definitions: [quest(Q01), quest(Q02), quest(Q07)],
      createEngine: () => new FakeEngine(),
      nowIso: tick,
      root: null,
      persistence: { storage: makeStorage(opened), restored: null, pageEvents: null, timers },
    });
    act(() => void ctx.controller.open(Q01, 'middle-c'));
    act(() => ctx.controller.edit({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'C', accidental: null, octave: 4 } }));
    expect(await ctx.persistence!.flush()).toBe(true);
    ctx.dispose();
    const loaded = await openSave(browserStorageEnv({ indexedDB: factory }));
    expect(loaded.save?.challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(1);
  });
});

describe('저장 가져오기', () => {
  const imported = (): string => {
    const base = emptySave('2026-11-12T00:00:00.000Z');
    return serializeSave({ ...base, explorationState: { ...base.explorationState, openedQuests: [Q07], position: { x: 1200, y: 1300, regionId: 'village', facing: 'left' } } });
  };

  it('가져온 저장이 현재가 되고, 이전 현재는 직전 저장으로 남는다', async () => {
    const r = boot();
    act(() => r.ctx.opened.mark(Q01));
    await r.ctx.persistence!.flush();
    const before = r.current();
    expect(await r.ctx.persistence!.importText(imported())).toEqual({ ok: true });
    expect(r.current()).toBe(imported());
    expect(r.mem.data.get('levelup-music-world:v1:save:previous')).toBe(before);
  });

  it('가져온 뒤에는 이 화면의 옛 상태가 가져온 저장을 덮어쓰지 못한다(타이머, 닫기, 설정 변경 모두)', async () => {
    const r = boot();
    act(() => r.ctx.opened.mark(Q01));
    await r.ctx.persistence!.flush();
    await r.ctx.persistence!.importText(imported());
    const writes = r.writes();
    act(() => r.ctx.settings.update((s) => ({ ...s, textSize: 'large' })));
    r.timers.advance(120_000);
    r.page.hide();
    await settle();
    expect(r.writes()).toBe(writes);
    expect(r.current()).toBe(imported());
    expect(r.mem.data.has(KEY_EMERGENCY)).toBe(false);
    // 다음 실행은 가져온 저장으로 열린다
    const loaded = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: r.mem, backend: r.mem } });
    expect(loaded.save?.explorationState.openedQuests).toEqual([Q07]);
  });

  it('긴급 사본이 가져온 것보다 새것이어도 가져온 저장이 이긴다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    r.page.hide(); // 이 앱의 새로운 긴급 사본이 생긴다
    await settle();
    await r.ctx.persistence!.importText(imported());
    const loaded = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: r.mem, backend: r.mem } });
    expect(loaded.save?.explorationState.openedQuests).toEqual([Q07]);
  });

  it('틀린 파일은 거르고 이유를 돌려주며, 저장을 얼리지 않는다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    await r.ctx.persistence!.flush();
    const bad = await r.ctx.persistence!.importText('이건 저장이 아니에요');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
    // 계속 저장된다
    place(r, 2, 'E');
    r.timers.advance(400);
    await settle();
    expect(parsed(r.current()).challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(2);
  });

  it('내보내기: 파일 이름에 날짜가 있고, 글자는 그대로 다시 읽힌다', () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    const f = r.ctx.persistence!.exportFile();
    expect(f.fileName).toMatch(/^levelup-music-world-save-2026-11-11\.json$/);
    const back = parsed(f.text);
    expect(back.challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(1);
    expect(fingerprintOf(back)).toBe(fingerprintOf(r.ctx.persistence!.build()));
  });
});

describe('끝내기', () => {
  it('내리면 마지막 상태를 저장하고, 그 뒤의 사건은 듣지 않는다', async () => {
    const r = boot();
    openQ01(r);
    place(r, 1, 'C');
    r.ctx.dispose();
    await settle();
    expect(parsed(r.current()).challengeDrafts[`${Q01}/middle-c`]!.slots).toHaveLength(1);
    const writes = r.writes();
    expect(r.page.size).toBe(0);
    r.timers.advance(120_000);
    await settle();
    expect(r.writes()).toBe(writes);
  });
});

describe('지문', () => {
  it('키 순서가 달라도 같은 내용이면 같고, 내용이 다르면 다르며, savedAt은 보지 않는다', () => {
    expect(stableStringify({ a: 1, b: [1, { y: 2, x: 1 }] })).toBe(stableStringify({ b: [1, { x: 1, y: 2 }], a: 1 }));
    expect(stableStringify({ a: undefined, b: 1 })).toBe(stableStringify({ b: 1 }));
    const a = emptySave('2026-11-11T00:00:00.000Z');
    expect(fingerprintOf(a)).toBe(fingerprintOf({ ...a, savedAt: '2030-01-01T00:00:00.000Z' }));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf({ ...a, explorationState: { ...a.explorationState, openedQuests: ['x'] } }));
  });
});

describe('4-4 다녀간 정거장과 세계 반응', () => {
  it('재료를 놓으면 그 과제가 놓인 정거장이 저장에 들어간다', async () => {
    const r = boot();
    openQ01(r);
    expect(r.ctx.visited.toArray()).toEqual([]); // 열기만 해서는 불이 켜지지 않는다
    place(r, 1, 'C');
    r.timers.advance(500);
    await settle();
    const saved = parsed(r.current()).explorationState.visitedStations;
    expect(saved).toContain('H1');
    expect(saved).toEqual(r.ctx.visited.toArray());
  });

  it('새로 고친 뒤에도 같은 등불이다(켜진 것과 꽃등 모두)', async () => {
    const mem = memoryBackend();
    const a = boot(mem);
    openQ01(a);
    place(a, 1, 'C');
    expect(await a.ctx.persistence!.flush()).toBe(true);
    const before = a.ctx.reaction.store.get();
    a.ctx.dispose();

    const loaded = await openSave({}, { opened: { kind: 'memory', fallback: null, sync: mem, backend: mem } });
    const b = boot(mem, loaded.save);
    const after = b.ctx.reaction.store.get();
    expect(after.lanterns).toEqual(before.lanterns);
    expect(after.lanterns.H1).toBe('on');
    expect(b.ctx.world.bridge.lanterns.get()).toEqual(before.lanterns); // 월드가 그릴 값도 처음부터 같다
    expect(b.ctx.reaction.pending.get()).toEqual([]); // 이미 있던 것은 새 소식이 아니다
    // 되살린 직후에는 바뀐 것이 없으니 아무것도 다시 쓰지 않는다
    b.timers.advance(60_000);
    await settle();
    expect(b.writes()).toBe(0);
  });

  it('합주 층수는 통과 기록에서 다시 계산하고 저장에는 적지 않는다', async () => {
    const base = emptySave('2026-11-11T00:00:00.000Z');
    const pass = makeAttemptResult({
      attemptId: 'a1',
      questId: Q01,
      variantId: 'middle-c',
      contentVersion: '0.1.0',
      evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} },
      context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
    } as never);
    const text = serializeSave({ ...base, attempts: [pass] });
    expect(text).not.toMatch(/ensembleLevel|regionLayers|lanterns/);
    const r = boot(memoryBackend(), parsed(text));
    expect(r.ctx.reaction.store.get().ensembleLevel).toBeGreaterThan(0);
    expect(r.ctx.reaction.store.get().lanterns.H1).toBe('flower');
    expect(r.ctx.reaction.pending.get()).toEqual([]);
  });

  it('저장에서 읽은 다녀간 곳은 이번에 아무것도 만지지 않아도 지워지지 않는다', async () => {
    const base = emptySave('2026-11-11T00:00:00.000Z');
    const restored: SaveData = { ...base, explorationState: { ...base.explorationState, visitedStations: ['E2', 'K3'] } };
    const r = boot(memoryBackend(), restored);
    act(() => r.ctx.settings.update((s) => ({ ...s, textSize: 'large' }))); // 다른 것이 바뀌어 저장이 일어난다
    r.timers.advance(500);
    await settle();
    expect(parsed(r.current()).explorationState.visitedStations).toEqual(['E2', 'K3']);
  });

  it('다녀간 곳이 달라지면 잠깐 뒤에 저장한다', async () => {
    const r = boot();
    act(() => void r.ctx.visited.mark(['S1']));
    expect(r.writes()).toBe(0);
    r.timers.advance(500);
    await settle();
    expect(r.writes()).toBe(1);
    expect(parsed(r.current()).explorationState.visitedStations).toEqual(['S1']);
  });
});
