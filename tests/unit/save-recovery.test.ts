// 저장 복구(5-7, 10.6): 손상, 판 변경, 저장 공간 부족. 손상된 현재 저장은 직전 저장으로 복구하고, 전체 초기화를 자동으로 하지 않는다.
// 이 파일은 5-7에서 더한 것을 고정한다: ①일부만 망가진 저장에서 읽을 수 있는 것만 살리기(부분 복구) ②망가진 원본 보관과 내려받기
// ③읽기 알림 ④중간에 끊겨도 쓸 수 있는 저장이 남는다 ⑤저장 공간 부족에도 계속 한다 ⑥판이 다른 저장을 건드리지 않는다 ⑦저장을 지우는 길이 없다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { EVALUATOR_TYPES } from '@/domain/evaluators';
import { PROJECT_ID, SAVE_SCHEMA_VERSION, buildSave, inspectSave, parseSave, parseSaveText, salvageSaveText, serializeSave } from '@/domain/save/save';
import type { SaveData, SaveParts } from '@/domain/save/save';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS } from '@/domain/save/settings';
import { ChallengeSession } from '@/domain/session';
import { makeStorage, openSave } from '@/app/boot';
import { SaveStorage, memoryBackend, storageKeyPrefix } from '@/platform/storage';
import type { KeyValueBackend, OpenedBackend, SyncBackend } from '@/platform/storage';

const NOW = '2026-11-11T03:00:00.000Z';
const T1 = '2026-11-11T01:00:00.000Z';
const T2 = '2026-11-11T02:00:00.000Z';
const T3 = '2026-11-11T03:00:00.000Z';
const Q = 'pitch.same-note-two-clefs';
const KEY_Q = `${Q}/middle-c`;
const ctx = { tempoBpm: 60, originalTempoBpm: 60, assistUsed: false, soundState: 'on', soundPlayed: true } as const;

const attempt = (id: string): AttemptResult =>
  makeAttemptResult({
    attemptId: id,
    questId: Q,
    variantId: 'middle-c',
    contentVersion: '0.1.0',
    recordedAt: NOW,
    evaluation: { evaluator: EVALUATOR_TYPES[0]!, evaluatorVersion: '1', passed: true, issues: [] },
    context: ctx,
  });

function sessionWithDraft(): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(Q, 'middle-c', { tempoBpm: 60 });
  s.apply({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'C', accidental: null, octave: 4 } });
  return s;
}

function parts(over: Partial<SaveParts> = {}): SaveParts {
  return {
    savedAt: NOW,
    contentVersions: { [Q]: '0.1.0' },
    position: { x: 3984, y: 3480, regionId: 'village', facing: 'down' },
    openedQuests: [Q],
    settings: { ...DEFAULT_SETTINGS, textSize: 'large' },
    session: sessionWithDraft().serialize(),
    attempts: [attempt('a1'), attempt('a2'), attempt('a3')],
    preferences: { ...DEFAULT_PREFERENCES, introSeen: true },
    visitedStations: ['station.rhythm'],
    foundDiscoveries: ['discovery.piece-1'],
    ...over,
  };
}

/** 저장 값을 JSON 객체로(시험에서 일부러 망가뜨리려고) */
const rawOf = (save: SaveData): Record<string, any> => JSON.parse(serializeSave(save)) as Record<string, any>;
const goodRaw = (over: Partial<SaveParts> = {}): Record<string, any> => rawOf(buildSave(parts(over)));
const text = (raw: unknown): string => JSON.stringify(raw);

/** 통과 기록 하나를 망가뜨린 저장(나머지는 멀쩡하다) */
function withBrokenAttempt(over: Partial<SaveParts> = {}): Record<string, any> {
  const raw = goodRaw(over);
  raw.attempts[1] = { attemptId: 'a2', resultType: 'passed' }; // 칸이 모자란 기록
  return raw;
}

// ---------------------------------------------------------------------------
// ① 부분 복구 읽기(도메인)

describe('parseSave: 기본은 엄격하고, 부분 복구를 켜면 읽을 수 있는 것만 살린다', () => {
  it('기본(엄격)은 그대로다: 통과 기록 하나가 망가지면 못 읽는 저장이다', () => {
    const r = parseSave(withBrokenAttempt());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('기록 2');
    expect(parseSaveText(text(withBrokenAttempt())).ok).toBe(false);
  });

  it('부분 복구: 망가진 통과 기록만 버리고 나머지(기록, 위치, 초안, 설정, 찾은 것)를 살린다', () => {
    const r = parseSave(withBrokenAttempt(), PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
    expect(r.save.explorationState.position).toEqual({ x: 3984, y: 3480, regionId: 'village', facing: 'down' });
    expect(r.save.explorationState.visitedStations).toEqual(['station.rhythm']);
    expect(r.save.explorationState.foundDiscoveries).toEqual(['discovery.piece-1']);
    expect(r.save.explorationState.settings.textSize).toBe('large');
    expect(Object.keys(r.save.challengeDrafts)).toEqual([KEY_Q]);
    expect(r.save.activeChallenge).toMatchObject({ questId: Q });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('통과 기록 1개를 읽을 수 없어 건너뛰었어요');
    expect(r.warnings[0]).toContain('기록 2');
  });

  it('살린 기록은 고치지 않는다: 값이 원래 그대로다', () => {
    const original = goodRaw();
    const raw = withBrokenAttempt();
    const r = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.attempts[0]).toEqual(original.attempts[0]);
    expect(r.save.attempts[1]).toEqual(original.attempts[2]);
  });

  it('여러 개를 버려도 알림은 한 문장으로 줄여 개수를 알린다', () => {
    const raw = goodRaw({ attempts: [attempt('a1'), attempt('a2'), attempt('a3'), attempt('a4')] });
    raw.attempts[1] = 7;
    raw.attempts[2] = { attemptId: 'a3' };
    raw.attempts[3] = null;
    const r = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.attempts.map((a) => a.attemptId)).toEqual(['a1']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('통과 기록 3개');
  });

  it('attemptId가 겹치면 먼저 나온 기록을 두고 뒤의 것을 버린다', () => {
    const raw = goodRaw({ attempts: [attempt('same'), attempt('same'), attempt('b')] });
    const r = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.attempts.map((a) => a.attemptId)).toEqual(['same', 'b']);
    expect(r.warnings.join()).toContain('겹쳐요');
  });

  it('통과 기록 목록 전체가 목록이 아니면 비운다(알린다)', () => {
    const raw = goodRaw();
    raw.attempts = 'x';
    const r = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.attempts).toEqual([]);
    expect(r.warnings.join()).toContain('통과 기록 목록을 읽을 수 없어');
  });

  it('망가진 초안은 그 초안만 버리고 다른 초안은 살린다', () => {
    const raw = goodRaw();
    const other = 'rhythm.rest-in-a-bar/rest-two';
    raw.challengeDrafts[other] = { ...raw.challengeDrafts[KEY_Q] };
    raw.challengeDrafts[KEY_Q] = { ...raw.challengeDrafts[KEY_Q], undoDepth: 99 };
    const r = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.save.challengeDrafts)).toEqual([other]);
    expect(r.warnings.join()).toContain(`초안 ${KEY_Q}`);
    expect(r.warnings.join()).toContain('undoDepth');
  });

  it('초안 목록이 객체가 아니면 모두 비운다. 진행 중 도전이 망가졌으면 처음 상태로 돌린다(초안은 살린다)', () => {
    const a = goodRaw();
    a.challengeDrafts = 'x';
    const ra = parseSave(a, PROJECT_ID, { salvage: true });
    expect(ra.ok && ra.save.challengeDrafts).toEqual({});
    expect(ra.ok && ra.warnings.join()).toContain('초안 목록을 읽을 수 없어');

    const b = goodRaw();
    b.activeChallenge = { questId: '' };
    const rb = parseSave(b, PROJECT_ID, { salvage: true });
    expect(rb.ok).toBe(true);
    if (!rb.ok) return;
    expect(rb.save.activeChallenge).toBeNull();
    expect(Object.keys(rb.save.challengeDrafts)).toEqual([KEY_Q]);
    expect(rb.warnings.join()).toContain('진행 중이던 도전');
  });

  it('멀쩡한 도움 연습 상태는 살린다. 망가졌으면 비우고 진행 중 도전도 처음 상태로 돌린다(반쯤만 남지 않게)', () => {
    const s = sessionWithDraft();
    s.enterAssist('basicPractice', 'practice.scale-step');
    const raw = goodRaw({ session: s.serialize() });
    expect(raw.supportContext).not.toBeNull();
    const ok = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(ok.ok && ok.save.supportContext).toEqual(raw.supportContext);
    expect(ok.ok && ok.warnings).toEqual([]);

    const broken = goodRaw({ session: s.serialize() });
    broken.supportContext = { ...broken.supportContext, origin: {} };
    const r = parseSave(broken, PROJECT_ID, { salvage: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.supportContext).toBeNull();
    expect(r.save.activeChallenge).toBeNull();
    expect(r.warnings.join()).toContain('도움 연습 상태');
    // 읽을 수 있는 통과 기록은 그대로다
    expect(r.save.attempts).toHaveLength(3);
  });

  it('부분 복구를 켜도 못 읽는 저장은 못 읽는다: 형식이 아님, 다른 게임, 못 읽는 판, 판 번호 오류, 저장한 때 오류', () => {
    const salvage = { salvage: true } as const;
    expect(parseSave('x', PROJECT_ID, salvage).ok).toBe(false);
    expect(parseSave(null, PROJECT_ID, salvage).ok).toBe(false);
    expect(parseSave([], PROJECT_ID, salvage).ok).toBe(false);
    expect(parseSave({ ...goodRaw(), projectId: 'other-game' }, PROJECT_ID, salvage).ok).toBe(false);
    const newer = parseSave({ ...goodRaw(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 }, PROJECT_ID, salvage);
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.errors.join()).toContain('더 새로운 판');
    expect(parseSave({ ...goodRaw(), saveSchemaVersion: 0 }, PROJECT_ID, salvage).ok).toBe(false);
    expect(parseSave({ ...goodRaw(), saveSchemaVersion: '1' }, PROJECT_ID, salvage).ok).toBe(false);
    expect(parseSave({ ...goodRaw(), savedAt: 'yesterday' }, PROJECT_ID, salvage).ok).toBe(false);
    expect(parseSaveText('{깨짐', PROJECT_ID, salvage).ok).toBe(false);
  });

  it('멀쩡한 저장은 엄격한 읽기와 똑같이 읽고 알림도 없다', () => {
    const raw = goodRaw();
    const strict = parseSave(raw);
    const lenient = parseSave(raw, PROJECT_ID, { salvage: true });
    expect(strict.ok && lenient.ok).toBe(true);
    if (strict.ok && lenient.ok) {
      expect(lenient.save).toEqual(strict.save);
      expect(lenient.warnings).toEqual([]);
    }
  });
});

describe('salvageSaveText: 저장소가 다시 쓸 글자를 만든다', () => {
  it('고친 글자는 엄격한 검사를 통과하고, 저장한 때는 그대로이며, 버린 것을 알린다', () => {
    const r = salvageSaveText(text(withBrokenAttempt()));
    expect(r).not.toBeNull();
    if (!r) return;
    expect(inspectSave(r.text)).toEqual({ errors: [], savedAt: NOW });
    expect(r.savedAt).toBe(NOW);
    expect(r.warnings.join()).toContain('통과 기록 1개');
    const again = parseSaveText(r.text);
    expect(again.ok && again.save.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
  });

  it('이미 고친 글자를 다시 고치면 알릴 것이 없다(되풀이해도 더 줄지 않는다)', () => {
    const first = salvageSaveText(text(withBrokenAttempt()));
    const second = first ? salvageSaveText(first.text) : null;
    expect(second?.warnings).toEqual([]);
    expect(second?.text).toBe(first?.text);
  });

  it('살릴 수 없으면 null이다: JSON이 아님, 다른 게임, 더 새로운 판, 저장한 때 오류', () => {
    expect(salvageSaveText('{깨짐')).toBeNull();
    expect(salvageSaveText('')).toBeNull();
    expect(salvageSaveText(text({ ...goodRaw(), projectId: 'other-game' }))).toBeNull();
    expect(salvageSaveText(text({ ...goodRaw(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 }))).toBeNull();
    expect(salvageSaveText(text({ ...goodRaw(), savedAt: 'x' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 저장소 시험 도구

const PREFIX = storageKeyPrefix(PROJECT_ID, SAVE_SCHEMA_VERSION);
const KEY = {
  current: `${PREFIX}save:current`,
  previous: `${PREFIX}save:previous`,
  next: `${PREFIX}save:next`,
  emergency: `${PREFIX}save:emergency`,
  unreadable: `${PREFIX}save:unreadable`,
};

const opened = (backend: KeyValueBackend, sync: SyncBackend | null = null): OpenedBackend => ({ backend, sync, kind: backend.kind, fallback: null });
const withSalvage = (o: OpenedBackend): SaveStorage =>
  new SaveStorage({ keyPrefix: PREFIX, opened: o, inspect: (t) => inspectSave(t), salvage: (t) => salvageSaveText(t) });

/** 저장한 때가 savedAt인 멀쩡한 저장 글자. x로 서로 구별한다 */
const goodText = (savedAt: string, x = 100): string => text({ ...goodRaw(), savedAt, explorationState: { ...goodRaw().explorationState, position: { x, y: 200, regionId: 'village', facing: 'down' } } });
/** 통과 기록 하나가 망가진 저장 글자 */
const damagedText = (savedAt: string, x = 100): string => {
  const raw = JSON.parse(goodText(savedAt, x)) as Record<string, any>;
  raw.attempts[1] = { attemptId: 'a2' };
  return text(raw);
};
const loadedSave = (t: string): SaveData => {
  const r = parseSaveText(t);
  if (!r.ok) throw new Error(`저장 글자를 읽을 수 없어요: ${r.errors.join()}`);
  return r.save;
};

// ---------------------------------------------------------------------------
// ② 저장소의 마지막 복구 단계

describe('SaveStorage: 현재와 직전 저장이 모두 일부 망가졌을 때', () => {
  it('통째로 새로 시작하지 않고 읽을 수 있는 것만 살려 연다. 원본은 따로 두고, 고친 것이 현재가 된다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    mem.data.set(KEY.previous, damagedText(T1, 1));
    const s = withSalvage(opened(mem));
    const r = await s.load();
    expect(r.kind).toBe('loaded');
    if (r.kind !== 'loaded') return;
    expect(r.source).toBe('salvaged');
    const save = loadedSave(r.text);
    expect(save.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
    expect(save.explorationState.position?.x).toBe(2); // 더 새것(현재)을 살렸다
    const st = s.status.get();
    expect(st).toMatchObject({ phase: 'idle', salvaged: true, unreadable: false, recoveredFromPrevious: false, keptUnread: true, savedAt: T2 });
    expect(st.loadWarnings.join()).toContain('통과 기록 1개');
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T2, 2)); // 버린 부분이 든 원본
    expect(mem.data.get(KEY.current)).toBe(r.text);
    expect(inspectSave(mem.data.get(KEY.current)!).errors).toEqual([]);
    expect(mem.data.has(KEY.next)).toBe(false);
    expect(mem.data.get(KEY.previous)).toBe(damagedText(T1, 1)); // 직전 칸은 건드리지 않았다
  });

  it('살릴 수 있는 것 중 저장한 때가 가장 새것을 고른다. 현재가 아주 못 쓸 글자면 직전 저장을 살린다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    mem.data.set(KEY.previous, damagedText(T1, 1));
    const s = withSalvage(opened(mem));
    const r = await s.load();
    expect(r.kind === 'loaded' && r.source).toBe('salvaged');
    expect(s.status.get().savedAt).toBe(T1);
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T1, 1)); // 살린 쪽의 원본을 둔다
    expect(r.kind === 'loaded' && loadedSave(r.text).explorationState.position?.x).toBe(1);
  });

  it('임시 자리와 긴급 사본도 살림 후보다: 가장 새것이 이긴다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T1, 1));
    mem.data.set(KEY.next, damagedText(T2, 2));
    mem.data.set(KEY.emergency, damagedText(T3, 3));
    const s = withSalvage(opened(mem, mem));
    const r = await s.load();
    expect(r.kind === 'loaded' && loadedSave(r.text).explorationState.position?.x).toBe(3);
    expect(s.status.get().savedAt).toBe(T3);
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T3, 3));
    expect(mem.data.has(KEY.next)).toBe(false); // 임시 자리는 현재가 되고 비워진다
  });

  it('직전 저장이 멀쩡하면 부분 복구보다 직전 저장이 먼저다(설계 5-7: 직전 저장으로 복구)', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    mem.data.set(KEY.previous, goodText(T1, 1));
    const s = withSalvage(opened(mem));
    const r = await s.load();
    expect(r).toEqual({ kind: 'loaded', text: goodText(T1, 1), source: 'previous' });
    expect(s.status.get()).toMatchObject({ recoveredFromPrevious: true, salvaged: false, loadWarnings: [], keptUnread: true });
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T2, 2));
  });

  it('고친 뒤 다시 열면 평범하게 현재로 열린다(알림은 없고, 원본은 아직 내려받을 수 있다)', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    mem.data.set(KEY.previous, damagedText(T1, 1));
    const first = withSalvage(opened(mem));
    const r1 = await first.load();
    const second = withSalvage(opened(mem));
    const r2 = await second.load();
    expect(r2).toEqual({ kind: 'loaded', text: r1.kind === 'loaded' ? r1.text : '', source: 'current' });
    expect(second.status.get()).toMatchObject({ salvaged: false, loadWarnings: [], keptUnread: true });
    expect(await second.readUnread()).toBe(damagedText(T2, 2));
  });

  it('살릴 것이 없으면(JSON이 아님, 다른 게임) 새로 시작하되 원본은 하나도 지우지 않고 첫 원본을 따로 둔다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.next, '{반쯤 쓰다 만');
    mem.data.set(KEY.previous, text({ ...goodRaw(), projectId: 'other-game' }));
    const s = withSalvage(opened(mem));
    const r = await s.load();
    expect(r.kind).toBe('unreadable');
    expect(s.status.get()).toMatchObject({ unreadable: true, salvaged: false, keptUnread: true });
    expect(mem.data.get(KEY.unreadable)).toBe('{반쯤 쓰다 만'); // 현재가 없으면 임시 자리의 것을 둔다
    expect(mem.data.get(KEY.next)).toBe('{반쯤 쓰다 만'); // 원래 자리도 그대로
    expect(mem.data.get(KEY.previous)).toBe(text({ ...goodRaw(), projectId: 'other-game' }));
  });

  it('부분 복구 함수를 넘기지 않으면 예전처럼 새로 시작한다(원본은 남긴다)', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    const s = new SaveStorage({ keyPrefix: PREFIX, opened: opened(mem), inspect: (t) => inspectSave(t) });
    expect((await s.load()).kind).toBe('unreadable');
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T2, 2));
  });

  it('부분 복구하다 던져도 읽기는 끝난다: 살릴 수 없는 저장으로 본다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    const s = new SaveStorage({
      keyPrefix: PREFIX,
      opened: opened(mem),
      inspect: (t) => inspectSave(t),
      salvage: () => {
        throw new Error('복구 오류');
      },
    });
    expect((await s.load()).kind).toBe('unreadable');
    expect(s.status.get().unreadable).toBe(true);
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T2, 2));
  });

  it('원본을 따로 적지 못해도(저장 공간) 읽기는 계속하고, 살린 것은 현재로 올린다. 못 두었다고 알린다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    const noRoom: KeyValueBackend = {
      ...mem,
      set: async (k, v) => {
        if (k === KEY.unreadable) {
          const e = new Error('full');
          e.name = 'QuotaExceededError';
          throw e;
        }
        mem.data.set(k, v);
      },
    };
    const s = withSalvage(opened(noRoom));
    const r = await s.load();
    expect(r.kind === 'loaded' && r.source).toBe('salvaged');
    expect(s.status.get()).toMatchObject({ salvaged: true, keptUnread: false });
    expect(inspectSave(mem.data.get(KEY.current)!).errors).toEqual([]);
  });

  it('readUnread: 따로 둔 원본을 돌려주고, 없으면 null이다. 읽다가 던져도 null이다', async () => {
    const mem = memoryBackend();
    const s = withSalvage(opened(mem));
    expect(await s.readUnread()).toBeNull();
    mem.data.set(KEY.unreadable, '원본');
    expect(await s.readUnread()).toBe('원본');
    const broken: KeyValueBackend = {
      ...mem,
      get: async () => {
        throw new Error('읽기 오류');
      },
    };
    expect(await withSalvage(opened(broken)).readUnread()).toBeNull();
  });

  it('지난번에 따로 둔 원본이 있으면 평범한 읽기에서도 내려받을 수 있다고 알린다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, goodText(T1, 1));
    mem.data.set(KEY.unreadable, '지난번 원본');
    const s = withSalvage(opened(mem));
    expect((await s.load()).kind).toBe('loaded');
    expect(s.status.get()).toMatchObject({ keptUnread: true, salvaged: false, unreadable: false });
    // 비어 있으면 없다고 한다
    const clean = memoryBackend();
    clean.data.set(KEY.current, goodText(T1, 1));
    const s2 = withSalvage(opened(clean));
    await s2.load();
    expect(s2.status.get().keptUnread).toBe(false);
  });
});

describe('SaveStorage.noteLoadWarnings: 읽은 뒤에 알게 된 것', () => {
  it('알릴 것이 없으면 아무것도 하지 않는다', async () => {
    const mem = memoryBackend();
    const s = withSalvage(opened(mem));
    await s.noteLoadWarnings([], '원본');
    expect(s.status.get()).toMatchObject({ loadWarnings: [], keptUnread: false });
    expect(mem.data.has(KEY.unreadable)).toBe(false);
  });

  it('알릴 것이 있고 따로 둔 원본이 없으면 그 저장의 원본을 둔다(바로 다음 저장이 덮어쓰기 전에)', async () => {
    const mem = memoryBackend();
    const s = withSalvage(opened(mem));
    await s.noteLoadWarnings(['저장한 곡 1개를 읽을 수 없어요'], '이 저장의 원본');
    expect(s.status.get()).toMatchObject({ loadWarnings: ['저장한 곡 1개를 읽을 수 없어요'], keptUnread: true });
    expect(mem.data.get(KEY.unreadable)).toBe('이 저장의 원본');
  });

  it('이미 따로 둔 원본이 있으면 덮어쓰지 않는다(더 무거운 일의 흔적이다). 같은 알림은 겹치지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    mem.data.set(KEY.previous, damagedText(T1, 1));
    const s = withSalvage(opened(mem));
    await s.load();
    const before = s.status.get().loadWarnings;
    await s.noteLoadWarnings(['가벼운 알림'], '가벼운 일의 원본');
    await s.noteLoadWarnings(['가벼운 알림'], '가벼운 일의 원본');
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T2, 2));
    expect(s.status.get().loadWarnings).toEqual([...before, '가벼운 알림']);
  });

  it('원본이 없으면(null) 알림만 올린다. 원본을 못 적어도 알림은 올라간다', async () => {
    const mem = memoryBackend();
    const s = withSalvage(opened(mem));
    await s.noteLoadWarnings(['알림 하나'], null);
    expect(s.status.get()).toMatchObject({ loadWarnings: ['알림 하나'], keptUnread: false });
    const broken: KeyValueBackend = {
      ...mem,
      set: async () => {
        throw new Error('쓰기 오류');
      },
    };
    const s2 = withSalvage(opened(broken));
    await s2.noteLoadWarnings(['알림 둘'], '원본');
    expect(s2.status.get()).toMatchObject({ loadWarnings: ['알림 둘'], keptUnread: false });
  });
});

// ---------------------------------------------------------------------------
// ③ 시작: 읽기 알림이 화면까지 간다

describe('openSave: 읽기 알림과 원본 보관', () => {
  const env = {};
  const open = (mem: ReturnType<typeof memoryBackend>) => openSave(env, { opened: opened(mem, mem) });

  it('멀쩡한 저장: 알림도 원본 보관도 없다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, goodText(T1, 1));
    const r = await open(mem);
    expect(r.save).not.toBeNull();
    expect(r.warnings).toEqual([]);
    expect(r.storage.status.get()).toMatchObject({ loadWarnings: [], keptUnread: false, salvaged: false });
    expect(mem.data.has(KEY.unreadable)).toBe(false);
  });

  it('현재와 직전 저장이 모두 일부 망가졌어도 쓸 수 있는 것으로 시작한다(처음부터 다시 하지 않는다)', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, damagedText(T2, 2));
    mem.data.set(KEY.previous, damagedText(T1, 1));
    const r = await open(mem);
    expect(r.save).not.toBeNull();
    expect(r.save?.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
    expect(r.save?.explorationState.foundDiscoveries).toEqual(['discovery.piece-1']);
    expect(r.warnings.join()).toContain('통과 기록 1개');
    expect(r.storage.status.get()).toMatchObject({ salvaged: true, keptUnread: true, unreadable: false });
    expect(r.storage.status.get().loadWarnings).toEqual(r.warnings);
    expect(mem.data.get(KEY.unreadable)).toBe(damagedText(T2, 2)); // 고쳐 쓴 글자가 원본을 덮지 않았다
  });

  it('읽은 저장에 못 읽는 저장한 곡이 있으면 알리고, 다음 저장이 덮어쓰기 전에 원본을 둔다', async () => {
    const mem = memoryBackend();
    const raw = goodRaw({ creations: [{ id: 'broken', notes: 'x' }] });
    const t = text({ ...raw, savedAt: T1 });
    mem.data.set(KEY.current, t);
    const r = await open(mem);
    expect(r.save).not.toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.storage.status.get()).toMatchObject({ keptUnread: true, salvaged: false });
    expect(r.storage.status.get().loadWarnings).toEqual(r.warnings);
    expect(mem.data.get(KEY.unreadable)).toBe(t);
  });

  it('직전 저장으로 열면서 거기에도 알릴 것이 있으면, 망가진 현재의 원본을 지키고 알림만 더한다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    mem.data.set(KEY.previous, text({ ...goodRaw({ creations: [{ id: 'broken' }] }), savedAt: T1 }));
    const r = await open(mem);
    expect(r.storage.status.get()).toMatchObject({ recoveredFromPrevious: true, keptUnread: true });
    expect(r.storage.status.get().loadWarnings.length).toBeGreaterThan(0);
    expect(mem.data.get(KEY.unreadable)).toBe('{깨짐');
  });

  it('아무 저장도 못 읽으면 새로 시작하고, 원본을 두었다고 알린다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    const r = await open(mem);
    expect(r.save).toBeNull();
    expect(r.storage.status.get()).toMatchObject({ unreadable: true, keptUnread: true });
    expect(mem.data.get(KEY.unreadable)).toBe('{깨짐');
  });
});

// ---------------------------------------------------------------------------
// ④ 자동 초기화 없음

/** 지우기와 쓰기를 모두 기록하는 저장소 */
function spyBackend() {
  const mem = memoryBackend();
  const removed: string[] = [];
  const written: string[] = [];
  const backend: SyncBackend & { readonly data: Map<string, string> } = {
    ...mem,
    remove: async (k) => {
      removed.push(k);
      mem.data.delete(k);
    },
    removeSync: (k) => {
      removed.push(k);
      mem.data.delete(k);
    },
    set: async (k, v) => {
      written.push(k);
      mem.data.set(k, v);
    },
    setSync: (k, v) => {
      written.push(k);
      mem.data.set(k, v);
    },
  };
  return { backend, data: mem.data, removed, written };
}

describe('전체 초기화를 자동으로 하지 않는다', () => {
  const scenarios: Array<{ name: string; seed: (d: Map<string, string>) => void }> = [
    { name: '현재가 망가지고 직전이 멀쩡하다', seed: (d) => (d.set(KEY.current, '{깨짐'), d.set(KEY.previous, goodText(T1, 1))) },
    { name: '둘 다 일부 망가졌다', seed: (d) => (d.set(KEY.current, damagedText(T2, 2)), d.set(KEY.previous, damagedText(T1, 1))) },
    { name: '둘 다 아예 못 읽는다', seed: (d) => (d.set(KEY.current, '{깨짐'), d.set(KEY.previous, '또 깨짐')) },
    { name: '더 새로운 판의 저장이다', seed: (d) => d.set(KEY.current, text({ ...goodRaw(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 })) },
    { name: '저장 도중 멈춘 흔적이 있다', seed: (d) => (d.set(KEY.current, goodText(T1, 1)), d.set(KEY.next, '{반쯤')) },
  ];

  for (const sc of scenarios) {
    it(`읽기는 저장 칸을 지우지 않는다(임시 자리 정리만 한다): ${sc.name}`, async () => {
      const spy = spyBackend();
      sc.seed(spy.data);
      const s = withSalvage(opened(spy.backend, spy.backend));
      await s.load();
      expect(spy.removed.filter((k) => k !== KEY.next)).toEqual([]);
      // 읽기 전에 있던 칸은 읽은 뒤에도 모두 남아 있다(임시 자리는 현재로 올라가면 비워진다)
      for (const k of [KEY.current, KEY.previous]) if (spy.data.has(k)) expect(spy.data.get(k)).toBeTruthy();
    });
  }

  it('못 읽어 새로 시작한 뒤 몇 번을 저장해도 망가진 원본은 그대로 남아 내려받을 수 있다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    mem.data.set(KEY.previous, '또 깨짐');
    const s = withSalvage(opened(mem));
    expect((await s.load()).kind).toBe('unreadable');
    for (const [i, t] of [T1, T2, T3].entries()) expect(await s.save(goodText(t, i + 1))).toBe(true);
    expect(await s.readUnread()).toBe('{깨짐');
    expect(s.status.get().keptUnread).toBe(true);
    // 새로 연 저장소에서도 같다
    const again = withSalvage(opened(mem));
    expect((await again.load()).kind).toBe('loaded');
    expect(again.status.get().keptUnread).toBe(true);
    expect(await again.readUnread()).toBe('{깨짐');
  });

  it('더 새로운 판의 저장은 읽지 않고, 지우지도 덮어쓰지도 않은 채 따로 둔다', async () => {
    const newer = text({ ...goodRaw(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1, futureField: { keep: 'me' } });
    const mem = memoryBackend();
    mem.data.set(KEY.current, newer);
    const s = withSalvage(opened(mem));
    expect((await s.load()).kind).toBe('unreadable');
    expect(mem.data.get(KEY.unreadable)).toBe(newer); // 한 글자도 바뀌지 않았다
    expect(await s.save(goodText(T2))).toBe(true); // 새로 시작해 저장해도
    expect(await s.readUnread()).toBe(newer);
    expect(s.status.get().problem).toBeNull();
  });

  it('src에는 저장을 지우는 길이 없다(SaveStorage.clear는 시험에서만 쓴다)', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(join(__dirname, '../../src'));
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => /\b(storage|persistence)(\?|!)?\.clear\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 중간에 끊겨도, 저장 공간이 모자라도

describe('저장 도중에 끊겨도 쓸 수 있는 저장이 남는다', () => {
  /** n번째 쓰기·지우기에서 던지는 저장소(공간 부족을 흉내낸다) */
  function failingAt(n: number, kind: 'quota' | 'other' = 'quota') {
    const mem = memoryBackend();
    let ops = 0;
    const fail = (): never => {
      const e = new Error('full');
      e.name = kind === 'quota' ? 'QuotaExceededError' : 'Error';
      throw e;
    };
    const backend: KeyValueBackend = {
      ...mem,
      set: async (k, v) => {
        if (++ops === n) fail();
        mem.data.set(k, v);
      },
      remove: async (k) => {
        if (++ops === n) fail();
        mem.data.delete(k);
      },
    };
    return { mem, backend, ops: () => ops };
  }

  it('저장하는 순서(임시 자리 → 직전 → 현재 → 임시 비우기)의 어느 지점에서 끊겨도 다음에 열면 옛것이나 새것이 열린다', async () => {
    // 이어 저장하는 상황: 현재 T1, 직전 T0이 있고, T2를 저장하다 끊긴다
    const T0 = '2026-11-11T00:00:00.000Z';
    for (const failAt of [1, 2, 3, 4]) {
      const f = failingAt(failAt);
      f.mem.data.set(KEY.current, goodText(T1, 1));
      f.mem.data.set(KEY.previous, goodText(T0, 0));
      const s = withSalvage(opened(f.backend));
      // 마지막 '임시 비우기'만 끊겨도 save는 끝까지 못 했다고 알린다(내용은 이미 현재로 올라가 있다)
      expect(await s.save(goodText(T2, 2)), `끊김 지점 ${failAt}`).toBe(false);
      expect(s.status.get(), `끊김 지점 ${failAt}`).toMatchObject({ phase: 'failed' });
      const reopened = withSalvage(opened(f.mem));
      const r = await reopened.load();
      expect(r.kind, `끊김 지점 ${failAt}`).toBe('loaded');
      if (r.kind !== 'loaded') continue;
      const x = loadedSave(r.text).explorationState.position?.x;
      expect([1, 2], `끊김 지점 ${failAt}`).toContain(x); // 옛것(1)이나 새것(2). 비거나 망가진 것이 아니다
      expect(reopened.status.get()).toMatchObject({ unreadable: false });
    }
  });

  it('저장 공간이 가득 차면 저장은 false로 알리고 있던 저장은 그대로이며, 공간이 생기면 다음 저장이 성공해 문제가 사라진다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, goodText(T1, 1));
    let full = true;
    const backend: KeyValueBackend = {
      ...mem,
      set: async (k, v) => {
        if (full) {
          const e = new Error('full');
          e.name = 'QuotaExceededError';
          throw e;
        }
        mem.data.set(k, v);
      },
    };
    const s = withSalvage(opened(backend));
    await s.load();
    expect(await s.save(goodText(T2, 2))).toBe(false);
    expect(s.status.get()).toMatchObject({ phase: 'failed' });
    expect(s.status.get().problem).toContain('저장 공간이 가득 찼어요');
    expect(s.status.get().problem).toContain('내보내');
    expect(mem.data.get(KEY.current)).toBe(goodText(T1, 1)); // 있던 저장은 그대로
    expect(s.status.get().savedAt).toBe(T1);
    full = false;
    expect(await s.save(goodText(T3, 3))).toBe(true);
    expect(s.status.get()).toMatchObject({ phase: 'saved', problem: null, savedAt: T3 });
    expect(mem.data.get(KEY.current)).toBe(goodText(T3, 3));
    expect(mem.data.get(KEY.previous)).toBe(goodText(T1, 1));
  });

  it('저장 공간이 모자라 임시 자리부터 못 적어도 읽기 쪽 상태(읽을 수 없음, 직전 저장으로 엶)를 건드리지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, '{깨짐');
    mem.data.set(KEY.previous, goodText(T1, 1));
    const s = withSalvage(opened(mem));
    await s.load();
    const before = s.status.get();
    expect(before.recoveredFromPrevious).toBe(true);
    const full: KeyValueBackend = {
      ...mem,
      set: async () => {
        const e = new Error('full');
        e.name = 'QuotaExceededError';
        throw e;
      },
    };
    const s2 = withSalvage(opened(full));
    expect(await s2.save(goodText(T2, 2))).toBe(false);
    expect(mem.data.get(KEY.unreadable)).toBe('{깨짐'); // 원본도 그대로
  });
});

// ---------------------------------------------------------------------------
// ⑥ 판이 다른 저장

describe('판이 다른 저장', () => {
  const v2 = storageKeyPrefix(PROJECT_ID, SAVE_SCHEMA_VERSION + 1);

  it('더 새로운 판의 앱이 남긴 키(v2)는 이 앱이 읽지도 덮어쓰지도 지우지도 않는다', async () => {
    const mem = memoryBackend();
    const newer = {
      [`${v2}save:current`]: '새 판의 현재',
      [`${v2}save:previous`]: '새 판의 직전',
      [`${v2}save:unreadable`]: '새 판의 원본',
    };
    for (const [k, v] of Object.entries(newer)) mem.data.set(k, v);
    const s = withSalvage(opened(mem, mem));
    expect(await s.load()).toEqual({ kind: 'empty' }); // v2 칸은 보지 않는다
    expect(await s.save(goodText(T1, 1))).toBe(true);
    expect(await s.save(goodText(T2, 2))).toBe(true);
    s.saveEmergency(goodText(T3, 3));
    for (const [k, v] of Object.entries(newer)) expect(mem.data.get(k)).toBe(v);
    expect([...mem.data.keys()].filter((k) => k.startsWith(PREFIX)).length).toBeGreaterThan(0);
    expect([...mem.data.keys()].filter((k) => !k.startsWith(PREFIX) && !k.startsWith(v2))).toEqual([]);
  });

  it('다른 게임이 같은 주소에 남긴 저장도 건드리지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set('other-game:v1:save:current', '다른 게임');
    const s = withSalvage(opened(mem));
    await s.load();
    await s.save(goodText(T1, 1));
    expect(mem.data.get('other-game:v1:save:current')).toBe('다른 게임');
  });

  it('더 새로운 판의 저장 파일은 가져오지 않고, 아무것도 바꾸지 않는다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY.current, goodText(T1, 1));
    const s = withSalvage(opened(mem));
    const r = await s.importText(text({ ...goodRaw(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('더 새로운 판');
    expect(mem.data.get(KEY.current)).toBe(goodText(T1, 1));
    expect(mem.data.has(KEY.previous)).toBe(false);
  });

  it('이 판의 앱은 이 판까지 읽는다고 알려 준다(판 번호가 더 크면 이유에 적힌다)', () => {
    const r = parseSave({ ...goodRaw(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain(`이 앱은 ${SAVE_SCHEMA_VERSION}판까지 읽어요`);
  });

  it('makeStorage가 만든 저장소는 판이 들어간 키를 쓴다(D-6)', async () => {
    const mem = memoryBackend();
    const s = makeStorage(opened(mem, mem));
    await s.save(goodText(T1, 1));
    expect([...mem.data.keys()].every((k) => k.startsWith('levelup-music-world:v1:'))).toBe(true);
    // 그리고 makeStorage의 저장소는 부분 복구를 쓴다
    mem.data.set(KEY.current, damagedText(T2, 2));
    mem.data.delete(KEY.previous);
    const again = makeStorage(opened(mem, mem));
    const r = await again.load();
    expect(r.kind === 'loaded' && r.source).toBe('salvaged');
  });
});
