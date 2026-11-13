// @vitest-environment jsdom
// 저장 복구(5-7)의 실제 시작 경로: 저장 읽기(openSave) → 앱 조립(createAppContext) → 저장 → 다시 열기.
// 현재와 직전 저장이 모두 일부 망가져도 통째로 새로 시작하지 않고, 읽을 수 있는 진행으로 이어 간다. 망가진 원본은 끝까지 남는다.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openSave, optionsFromSave } from '@/app/boot';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { EVALUATOR_TYPES } from '@/domain/evaluators';
import { buildSave, parseSaveText, serializeSave } from '@/domain/save/save';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS } from '@/domain/save/settings';
import { ChallengeSession } from '@/domain/session';
import { memoryBackend } from '@/platform/storage';
import type { OpenedBackend } from '@/platform/storage';
import { FakeEngine } from './audio-fakes';
import { Q01, Q02, Q07, quest, setupDom } from './ui-rig';

beforeAll(() => setupDom());
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const KEY = (k: string): string => `levelup-music-world:v1:save:${k}`;
const T1 = '2026-11-11T01:00:00.000Z';
const T2 = '2026-11-11T02:00:00.000Z';

const attempt = (id: string): AttemptResult =>
  makeAttemptResult({
    attemptId: id,
    questId: Q01,
    variantId: 'middle-c',
    contentVersion: '0.1.0',
    recordedAt: T1,
    evaluation: { evaluator: EVALUATOR_TYPES[0]!, evaluatorVersion: '1', passed: true, issues: [] },
    context: { tempoBpm: 60, originalTempoBpm: 60, assistUsed: false, soundState: 'on', soundPlayed: true },
  });

/** 통과 기록 셋 중 둘째가 망가진 저장 글자 */
function damagedSave(savedAt: string, x: number): string {
  const save = buildSave({
    savedAt,
    contentVersions: { [Q01]: '0.1.0' },
    position: { x, y: 3000, regionId: 'village', facing: 'down' },
    openedQuests: [Q01],
    settings: { ...DEFAULT_SETTINGS, textSize: 'large' },
    session: new ChallengeSession().serialize(),
    attempts: [attempt('a1'), attempt('a2'), attempt('a3')],
    preferences: { ...DEFAULT_PREFERENCES, introSeen: true },
  });
  const raw = JSON.parse(serializeSave(save)) as Record<string, any>;
  raw.attempts[1] = { attemptId: 'a2', resultType: 'passed' };
  return JSON.stringify(raw);
}

const openedOf = (mem: ReturnType<typeof memoryBackend>): OpenedBackend => ({ kind: 'memory', fallback: null, sync: mem, backend: mem });

async function start(mem: ReturnType<typeof memoryBackend>): Promise<{ ctx: AppContext; loaded: Awaited<ReturnType<typeof openSave>> }> {
  const loaded = await openSave({}, { opened: openedOf(mem) });
  const ctx = createAppContext({
    channel: 'preview',
    definitions: [quest(Q01), quest(Q02), quest(Q07)],
    createEngine: () => new FakeEngine(),
    root: null,
    nowIso: () => T2,
    usageLog: loaded.usageLog,
    persistence: { storage: loaded.storage, restored: loaded.save, pageEvents: null },
    ...optionsFromSave(loaded.save),
  });
  cleanups.push(() => ctx.dispose());
  return { ctx, loaded };
}

describe('저장이 일부 망가진 채로 시작해도 진행이 이어진다(5-7)', () => {
  it('현재와 직전 저장의 통과 기록이 하나씩 망가져 있어도, 읽을 수 있는 기록·위치·설정으로 시작한다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), damagedSave(T2, 4100));
    mem.data.set(KEY('previous'), damagedSave(T1, 4000));
    const { ctx, loaded } = await start(mem);

    expect(loaded.save).not.toBeNull();
    expect(ctx.controller.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
    expect(ctx.settings.get().textSize).toBe('large');
    expect(Math.round(ctx.world.bridge.position.get().x)).toBe(4100); // 더 새것(현재)에서 살렸다
    const st = ctx.persistence!.status.get();
    expect(st).toMatchObject({ salvaged: true, unreadable: false, keptUnread: true });
    expect(st.loadWarnings.join()).toContain('통과 기록 1개');
  });

  it('이어서 저장하면 정상 저장이 되고, 망가진 원본은 그대로 남아 내려받을 수 있으며, 다시 열면 알림 없이 열린다', async () => {
    const mem = memoryBackend();
    const original = damagedSave(T2, 4100);
    mem.data.set(KEY('current'), original);
    mem.data.set(KEY('previous'), damagedSave(T1, 4000));
    const { ctx } = await start(mem);

    ctx.settings.set({ ...ctx.settings.get(), masterVolume: 0.3 });
    expect(await ctx.persistence!.flush()).toBe(true);
    const saved = parseSaveText(mem.data.get(KEY('current'))!);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.save.explorationState.settings.masterVolume).toBe(0.3);
      expect(saved.save.explorationState.settings.textSize).toBe('large'); // 살린 설정은 그대로다
      expect(saved.save.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
    }
    expect(mem.data.get(KEY('unreadable'))).toBe(original); // 한 글자도 바뀌지 않았다
    const exported = await ctx.persistence!.exportUnread();
    expect(exported?.text).toBe(original);
    expect(exported?.fileName).toMatch(/^levelup-music-world-unread-2026-11-11\.json$/);

    const again = await openSave({}, { opened: openedOf(mem) });
    expect(again.save?.attempts.map((a) => a.attemptId)).toEqual(['a1', 'a3']);
    expect(again.warnings).toEqual([]);
    expect(again.storage.status.get()).toMatchObject({ salvaged: false, unreadable: false, keptUnread: true });
  });

  it('아무것도 못 읽어 새로 시작해도, 이어서 저장한 뒤에 원본이 남아 있다(자동 초기화로 사라지지 않는다)', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), '{깨짐');
    mem.data.set(KEY('previous'), '또 깨짐');
    const { ctx, loaded } = await start(mem);
    expect(loaded.save).toBeNull();
    expect(ctx.persistence!.status.get()).toMatchObject({ unreadable: true, keptUnread: true });
    ctx.settings.set({ ...ctx.settings.get(), textSize: 'large' });
    expect(await ctx.persistence!.flush()).toBe(true);
    expect(parseSaveText(mem.data.get(KEY('current'))!).ok).toBe(true);
    expect((await ctx.persistence!.exportUnread())?.text).toBe('{깨짐');
  });

  it('멀쩡한 저장으로 시작하면 원본 보관도 알림도 없다', async () => {
    const mem = memoryBackend();
    const good = buildSave({
      savedAt: T1,
      contentVersions: {},
      position: null,
      openedQuests: [],
      settings: { ...DEFAULT_SETTINGS },
      session: new ChallengeSession().serialize(),
      attempts: [attempt('a1')],
      preferences: { ...DEFAULT_PREFERENCES },
    });
    mem.data.set(KEY('current'), serializeSave(good));
    const { ctx, loaded } = await start(mem);
    expect(loaded.warnings).toEqual([]);
    expect(ctx.persistence!.status.get()).toMatchObject({ salvaged: false, unreadable: false, keptUnread: false, loadWarnings: [] });
    expect(await ctx.persistence!.exportUnread()).toBeNull();
    expect(mem.data.has(KEY('unreadable'))).toBe(false);
  });
});
