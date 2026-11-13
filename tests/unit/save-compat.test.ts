// 8-6 저장 변환 시험(12.11): 이미 나간 판의 저장을 지금 앱이 읽는다. 저장 형식을 바꾸는 날 이 시험이 변환을 빠뜨리지 못하게 한다.
// 얼린 저장 예시(tests/fixtures/saves/)는 그 판의 앱이 실제로 내보낸 모양의 저장이다. 고치지 않는다(해시로 지킨다). 새 판의 예시는 새 파일로 더한다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { passedQuestIds } from '@/domain/attempt';
import { SAVE_MIGRATIONS, SAVE_SCHEMA_VERSION, emptySave, inspectSave, migrateSaveRaw, parseSave, parseSaveText, serializeSave } from '@/domain/save/save';
import type { SaveMigration } from '@/domain/save/save';
import type { LogBody } from '@/domain/usagelog';
import { UsageLog, usageLogKey } from '@/platform/log';
import { SaveStorage, memoryBackend, olderKeyPrefixes, storageKeyPrefix } from '@/platform/storage';

const DIR = path.resolve(__dirname, '../fixtures/saves');

/** 얼린 예시: 파일 이름 → 저장 판과 sha256. 파일을 고치거나 목록에 없는 파일을 두면 시험이 실패한다 */
const FROZEN: Readonly<Record<string, { version: number; sha256: string }>> = {
  'v1-first-release.json': { version: 1, sha256: '3c1d4483f1ae898dedf4f5b8e27876934601c75a40e56c34fa2e574ad740c7d0' },
};

const textOf = (name: string): string => fs.readFileSync(path.join(DIR, name), 'utf-8');
const rawOf = (name: string): Record<string, any> => JSON.parse(textOf(name)) as Record<string, any>;

describe('얼린 저장 예시', () => {
  it('폴더의 파일과 목록이 같다(새 예시는 목록에 해시와 함께 더한다)', () => {
    expect(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()).toEqual(Object.keys(FROZEN).sort());
  });

  it.each(Object.entries(FROZEN))('%s는 얼려 둔 그대로다(이미 나간 판의 저장이라 고치지 않는다)', (name, f) => {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, name))).digest('hex');
    expect(sha, '얼린 저장 예시를 고쳤어요. 이미 나간 판의 저장이라 고치지 않아요. 새 판의 예시는 새 파일로 더해요').toBe(f.sha256);
    expect(rawOf(name)['saveSchemaVersion']).toBe(f.version);
  });

  it.each(Object.keys(FROZEN))('%s를 지금 앱이 알림 없이 읽고, 기록과 초안과 설정을 그대로 가져온다', (name) => {
    const raw = rawOf(name);
    const r = parseSaveText(textOf(name));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.save.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // 이전 기록은 새 정답 기준으로 다시 계산하지 않는다: 읽은 기록은 파일에 적힌 것과 한 글자도 다르지 않다
    expect(r.save.attempts).toEqual(raw['attempts']);
    expect(r.save.attempts.map((a) => a.contentVersion)).toEqual((raw['attempts'] as Array<{ contentVersion: string }>).map((a) => a.contentVersion));
    expect(r.save.challengeDrafts).toEqual(raw['challengeDrafts']);
    expect(r.save.activeChallenge).toEqual(raw['activeChallenge']);
    expect(r.save.explorationState.creations).toEqual(raw['explorationState'].creations);
    expect(r.save.explorationState.settings).toEqual(raw['explorationState'].settings);
    expect(r.save.contentVersions).toEqual(raw['contentVersions']);
  });

  it.each(Object.keys(FROZEN))('%s를 읽어 다시 쓰고 또 읽어도 같다(저장이 읽을 때마다 달라지지 않는다)', (name) => {
    const first = parseSaveText(textOf(name));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = parseSaveText(serializeSave(first.save));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.save).toEqual(first.save);
  });

  it('읽은 기록에서 계산하는 것(통과한 과제)은 파일에 적힌 판정만 쓴다', () => {
    const r = parseSaveText(textOf('v1-first-release.json'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fromFile = [...new Set((rawOf('v1-first-release.json')['attempts'] as Array<{ questId: string; resultType: string }>).filter((a) => a.resultType === 'passed').map((a) => a.questId))].sort();
    expect(fromFile.length).toBeGreaterThan(0);
    expect([...passedQuestIds(r.save.attempts)].sort()).toEqual(fromFile);
  });
});

describe('판이 오르는 날을 위한 걸이(8-6)', () => {
  it('현재 판 이전의 판마다 변환이 있다(변환 없이 SAVE_SCHEMA_VERSION만 올리면 실패한다)', () => {
    for (let v = 1; v < SAVE_SCHEMA_VERSION; v++) expect(typeof SAVE_MIGRATIONS[v], `${v}판 → ${v + 1}판`).toBe('function');
  });

  it('1판부터 현재 판까지 판마다 얼린 저장 예시가 하나 이상 있다', () => {
    const versions = new Set(Object.values(FROZEN).map((f) => f.version));
    for (let v = 1; v <= SAVE_SCHEMA_VERSION; v++) expect(versions.has(v), `${v}판의 저장 예시`).toBe(true);
  });

  it('더 새로운 판의 저장은 거절한다(이 앱이 읽을 수 없는 판)', () => {
    const raw = { ...rawOf('v1-first-release.json'), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 };
    const r = parseSave(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('더 새로운 판');
  });
});

describe('migrateSaveRaw: 옛 판을 한 판씩 올린다', () => {
  const add = (key: string): SaveMigration => (raw) => ({ ...raw, [key]: true });
  const table = { 1: add('m12'), 2: add('m23') };
  const v1 = { saveSchemaVersion: 1, projectId: 'p', keep: { a: 1 } };

  it('현재 판이거나 판이 올바르지 않거나 더 새로우면 바꿀 것이 없다', () => {
    expect(migrateSaveRaw({ saveSchemaVersion: 3 }, 3, table)).toEqual({ kind: 'none' });
    expect(migrateSaveRaw({ saveSchemaVersion: 4 }, 3, table)).toEqual({ kind: 'none' });
    expect(migrateSaveRaw({ saveSchemaVersion: 0 }, 3, table)).toEqual({ kind: 'none' });
    expect(migrateSaveRaw({ saveSchemaVersion: 1.5 }, 3, table)).toEqual({ kind: 'none' });
    expect(migrateSaveRaw({ saveSchemaVersion: '1' }, 3, table)).toEqual({ kind: 'none' });
    expect(migrateSaveRaw({}, 3, table)).toEqual({ kind: 'none' });
  });

  it('1판은 두 단계를 차례로 거쳐 3판이 되고, 2판은 한 단계만 거친다', () => {
    const a = migrateSaveRaw(v1, 3, table);
    expect(a).toEqual({ kind: 'ok', from: 1, raw: { saveSchemaVersion: 3, projectId: 'p', keep: { a: 1 }, m12: true, m23: true } });
    const b = migrateSaveRaw({ ...v1, saveSchemaVersion: 2 }, 3, table);
    expect(b).toEqual({ kind: 'ok', from: 2, raw: { saveSchemaVersion: 3, projectId: 'p', keep: { a: 1 }, m23: true } });
  });

  it('변환이 판 번호를 적지 않거나 틀리게 적어도 한 판씩 오른다', () => {
    const sloppy = { 1: (raw: Record<string, unknown>) => ({ ...raw, saveSchemaVersion: 99 }), 2: (raw: Record<string, unknown>) => { const { saveSchemaVersion: _v, ...rest } = raw; return rest; } };
    const r = migrateSaveRaw(v1, 3, sloppy);
    expect(r.kind === 'ok' && r.raw['saveSchemaVersion']).toBe(3);
  });

  it('받은 객체를 고치지 않는다(변환이 안쪽 값을 고쳐도)', () => {
    const before = JSON.stringify(v1);
    migrateSaveRaw(v1, 3, { 1: (raw) => { (raw['keep'] as { a: number }).a = 9; return raw; }, 2: add('x') });
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('변환이 빠진 판이 있으면 어느 판인지 알린다', () => {
    expect(migrateSaveRaw(v1, 3, { 1: add('m12') })).toEqual({ kind: 'missing', from: 1, at: 2 });
    expect(migrateSaveRaw(v1, 3, {})).toEqual({ kind: 'missing', from: 1, at: 1 });
  });
});

// ---------------------------------------------------------------------------
// 저장 키에 판 번호가 들어 있어서(D-104) 판을 올린 앱은 옛 판의 키를 읽어 와야 한다. 지금은 판이 하나뿐이라 새 판(v2) 칸을 이름으로만 흉내 낸다:
// 저장소는 키 앞말만 다르게 받고, 글자의 검사(inspect)는 같은 것을 쓴다

describe('판이 오르면 옛 판의 저장 키를 읽어 온다(8-6)', () => {
  const ID = 'levelup-music-world';
  const V1 = storageKeyPrefix(ID, 1);
  const V2 = storageKeyPrefix(ID, 2);
  const V3 = storageKeyPrefix(ID, 3);
  const T1 = '2026-11-11T01:00:00.000Z';
  const T2 = '2026-11-11T02:00:00.000Z';
  const T3 = '2026-11-11T03:00:00.000Z';
  /** 저장 글자 하나. 위치 x로 서로 구별한다 */
  const textAt = (savedAt: string, x: number): string => {
    const s = emptySave(savedAt);
    return serializeSave({ ...s, explorationState: { ...s.explorationState, position: { x, y: 200, regionId: 'village', facing: 'down' } } });
  };
  const storageOn = (mem: ReturnType<typeof memoryBackend>, prefix: string, older: readonly string[]) =>
    new SaveStorage({ keyPrefix: prefix, olderPrefixes: older, opened: { backend: mem, sync: mem, kind: mem.kind, fallback: null }, inspect: (t) => inspectSave(t) });
  const keysOf = (mem: ReturnType<typeof memoryBackend>): string[] => [...mem.data.keys()].sort();

  it('옛 판의 키 앞말은 가까운 판부터이고, 판이 하나뿐이면 비어 있다', () => {
    expect(olderKeyPrefixes(ID, 1)).toEqual([]);
    expect(olderKeyPrefixes(ID, 2)).toEqual([V1]);
    expect(olderKeyPrefixes(ID, 3)).toEqual([V2, V1]);
    expect(olderKeyPrefixes(ID, 0)).toEqual([]);
  });

  it('이 판의 키가 비어 있으면 옛 판의 저장을 열고, 옛 키는 그대로 둔다', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, textAt(T1, 111));
    const before = keysOf(mem);
    const s = storageOn(mem, V2, [V1]);
    const r = await s.load();
    expect(r).toEqual({ kind: 'loaded', text: textAt(T1, 111), source: 'older' });
    expect(keysOf(mem)).toEqual(before); // 읽기만 했다: 새 칸에 쓰지 않았고 옛 칸을 지우지 않았다
    expect(s.status.get().savedAt).toBe(T1);
    expect(s.status.get().problem).toBeNull();
  });

  it('앱의 첫 저장은 이 판의 키에 적고, 그 뒤로는 이 판의 키가 이긴다(옛 키가 더 새것이어도)', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, textAt(T1, 111));
    const s = storageOn(mem, V2, [V1]);
    await s.load();
    expect(await s.save(textAt(T2, 222))).toBe(true);
    expect(mem.data.get(`${V2}save:current`)).toBe(textAt(T2, 222));
    expect(mem.data.get(`${V1}save:current`)).toBe(textAt(T1, 111)); // 옛 판은 되돌릴 때를 위해 그대로 남는다
    mem.data.set(`${V1}save:current`, textAt(T3, 333)); // 옛 앱이 나중에 더 새 저장을 남겼다고 해도
    const again = await storageOn(mem, V2, [V1]).load();
    expect(again).toEqual({ kind: 'loaded', text: textAt(T2, 222), source: 'current' });
  });

  it('여러 옛 판이 있으면 가까운 판의 저장을 연다', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, textAt(T3, 111));
    mem.data.set(`${V2}save:current`, textAt(T1, 222));
    const r = await storageOn(mem, V3, [V2, V1]).load();
    expect(r).toEqual({ kind: 'loaded', text: textAt(T1, 222), source: 'older' });
  });

  it('한 판 안에서는 현재·임시·긴급 가운데 가장 새것을 열고, 모두 못 쓰면 직전을 연다', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, textAt(T1, 1));
    mem.data.set(`${V1}save:next`, textAt(T3, 3));
    mem.data.set(`${V1}save:emergency`, textAt(T2, 2));
    expect(await storageOn(mem, V2, [V1]).load()).toEqual({ kind: 'loaded', text: textAt(T3, 3), source: 'older' });
    const mem2 = memoryBackend();
    mem2.data.set(`${V1}save:current`, '{망가진 글자');
    mem2.data.set(`${V1}save:previous`, textAt(T1, 1));
    expect(await storageOn(mem2, V2, [V1]).load()).toEqual({ kind: 'loaded', text: textAt(T1, 1), source: 'older' });
  });

  it('옛 판의 저장을 쓸 수 없으면 새로 시작하고, 옛 키는 건드리지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, '{망가진 글자');
    const before = keysOf(mem);
    expect(await storageOn(mem, V2, [V1]).load()).toEqual({ kind: 'empty' });
    expect(keysOf(mem)).toEqual(before);
    expect(mem.data.get(`${V1}save:current`)).toBe('{망가진 글자');
  });

  it('옛 판 목록이 비어 있으면(지금) 옛 판의 키가 있어도 보지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, textAt(T1, 111));
    expect(await storageOn(mem, V2, []).load()).toEqual({ kind: 'empty' });
  });

  it('다른 게임의 키는 읽지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set('other-game:v1:save:current', textAt(T1, 111));
    expect(await storageOn(mem, V2, [V1]).load()).toEqual({ kind: 'empty' });
  });

  it('지우면 옛 판의 키도 지운다(남겨 두면 다음에 읽을 때 되살아난다)', async () => {
    const mem = memoryBackend();
    mem.data.set(`${V1}save:current`, textAt(T1, 111));
    mem.data.set(`${V1}save:previous`, textAt(T1, 110));
    mem.data.set(`${V1}save:unreadable`, '원본');
    mem.data.set(`${V2}save:current`, textAt(T2, 222));
    mem.data.set('other-game:v1:save:current', '다른 게임');
    const s = storageOn(mem, V2, [V1]);
    await s.clear();
    expect(keysOf(mem)).toEqual(['other-game:v1:save:current']);
    expect(await storageOn(mem, V2, [V1]).load()).toEqual({ kind: 'empty' });
  });
});

describe('사용 기록도 옛 판의 키를 이어 받는다(8-6)', () => {
  const ID = 'levelup-music-world';
  const K1 = usageLogKey(storageKeyPrefix(ID, 1));
  const K2 = usageLogKey(storageKeyPrefix(ID, 2));
  const listen: LogBody = { type: 'listen', questId: 'scale.major', variantId: 'c-major', what: 'mine', surface: 'panel' };
  let tick = 0;
  const nowIso = (): string => new Date(Date.UTC(2026, 10, 11, 9, 0, tick++)).toISOString();

  /** 옛 판의 앱이 남긴 기록: 사건 n개 */
  async function oldLog(mem: ReturnType<typeof memoryBackend>, n: number): Promise<void> {
    const log = await UsageLog.open({ backend: mem, key: K1, nowIso });
    for (let i = 0; i < n; i++) log.record(listen);
    expect(await log.flush()).toBe(true);
    log.dispose();
  }

  it('이 판의 키가 비어 있으면 옛 기록을 이어 받고, 새로 적는 것은 이 판의 키에 적는다(옛 키는 그대로)', async () => {
    const mem = memoryBackend();
    await oldLog(mem, 2);
    const before = mem.data.get(K1);
    const log = await UsageLog.open({ backend: mem, key: K2, olderKeys: [K1], nowIso });
    expect(log.snapshot().events.length).toBe(2);
    expect(log.status.get().problem).toBeNull();
    log.record(listen);
    expect(await log.flush()).toBe(true);
    log.dispose();
    expect(JSON.parse(mem.data.get(K2)!).events.length).toBe(3);
    expect(mem.data.get(K1)).toBe(before);
  });

  it('이 판의 키에 기록이 있으면 옛 기록은 보지 않는다', async () => {
    const mem = memoryBackend();
    await oldLog(mem, 5);
    const first = await UsageLog.open({ backend: mem, key: K2, nowIso });
    first.record(listen);
    await first.flush();
    first.dispose();
    const log = await UsageLog.open({ backend: mem, key: K2, olderKeys: [K1], nowIso });
    expect(log.snapshot().events.length).toBe(1);
    log.dispose();
  });

  it('옛 기록을 읽을 수 없으면 빈 기록으로 시작하고, 옛 키에도 이 판의 키에도 따로 남기지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(K1, '{망가진 글자');
    const log = await UsageLog.open({ backend: mem, key: K2, olderKeys: [K1], nowIso });
    expect(log.snapshot().events).toEqual([]);
    expect(log.status.get().problem).toBeNull();
    log.dispose();
    expect([...mem.data.keys()]).toEqual([K1]);
    expect(mem.data.get(K1)).toBe('{망가진 글자');
  });

  it('옛 키 목록이 비어 있으면(지금) 옛 기록이 있어도 보지 않는다', async () => {
    const mem = memoryBackend();
    await oldLog(mem, 2);
    const log = await UsageLog.open({ backend: mem, key: K2, nowIso });
    expect(log.snapshot().events).toEqual([]);
    log.dispose();
  });

  it('기록 지우기는 옛 판의 키도 지운다(남겨 두면 지웠다는 말이 거짓이 되고, 기기에는 그대로 남는다)', async () => {
    const mem = memoryBackend();
    await oldLog(mem, 3);
    mem.data.set(`${K1}:unreadable`, '{읽을 수 없어 따로 둔 옛 기록');
    const log = await UsageLog.open({ backend: mem, key: K2, olderKeys: [K1], nowIso });
    expect(log.snapshot().events.length).toBe(3); // 옛 기록을 이어 받았다
    await log.clear();
    expect(log.snapshot().events).toEqual([]);
    expect(mem.data.has(K1)).toBe(false);
    expect(mem.data.has(`${K1}:unreadable`)).toBe(false);
    log.dispose();
    // 다시 열어도 옛 기록은 돌아오지 않고, 이 판의 키에는 켜고 끈 것만 남은 빈 기록이 있다
    const again = await UsageLog.open({ backend: mem, key: K2, olderKeys: [K1], nowIso });
    expect(again.snapshot().events).toEqual([]);
    again.dispose();
    expect(JSON.parse(mem.data.get(K2)!).events).toEqual([]);
  });

  it('기록 지우기는 목록에 없는 다른 키를 건드리지 않는다(다른 게임의 키, 이 판의 저장)', async () => {
    const mem = memoryBackend();
    await oldLog(mem, 1);
    mem.data.set('다른-게임:v1:usage-log', '{"x":1}');
    mem.data.set(`${storageKeyPrefix(ID, 2)}save:current`, '저장');
    const log = await UsageLog.open({ backend: mem, key: K2, olderKeys: [K1], nowIso });
    await log.clear();
    log.dispose();
    expect(mem.data.get('다른-게임:v1:usage-log')).toBe('{"x":1}');
    expect(mem.data.get(`${storageKeyPrefix(ID, 2)}save:current`)).toBe('저장');
  });
});
