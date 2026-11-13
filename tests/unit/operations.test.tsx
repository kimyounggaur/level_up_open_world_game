// @vitest-environment jsdom
// 8-6 운영 절차(12.11)의 앱 단 시험: 콘텐츠 판을 올리거나 문제 있는 과제를 내려도 이미 저장된 기록은 그대로다.
//  · 이전 기록은 새 정답 기준으로 다시 계산하지 않는다(판이 올라도 기록의 판과 통과는 그대로)
//  · 내린 과제(준비 중)의 초안과 통과 기록은 저장에서 사라지지 않고, 다시 올리면 이어진다
//  · 파일을 지워 버리면 기록과 초안은 남지만 저장이 적는 그 과제의 판이 사라진다(그래서 지우지 않고 내린다)
// 실제 시작 경로(저장 읽기 → 앱 조립 → 저장 → 다시 열기)를 쓴다. 절차는 docs/operations.md.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openSave, optionsFromSave } from '@/app/boot';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import { makeAttemptResult, passedQuestIds } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import type { Channel } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { EVALUATOR_TYPES } from '@/domain/evaluators';
import { buildSave, parseSaveText, serializeSave } from '@/domain/save/save';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS } from '@/domain/save/settings';
import { ChallengeSession } from '@/domain/session';
import { memoryBackend } from '@/platform/storage';
import type { OpenedBackend } from '@/platform/storage';
import { FakeEngine } from './audio-fakes';
import { Q01, Q02, quest, setupDom } from './ui-rig';

beforeAll(() => setupDom());
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const KEY = (k: string): string => `levelup-music-world:v1:save:${k}`;
const T1 = '2026-11-13T01:00:00.000Z';
const T2 = '2026-11-13T02:00:00.000Z';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const published = (d: QuestDefinition): QuestDefinition => ({ ...clone(d), availability: 'published' });

const passed = (id: string, questId: string, variantId: string): AttemptResult =>
  makeAttemptResult({
    attemptId: id,
    questId,
    variantId,
    contentVersion: '0.1.0',
    recordedAt: T1,
    evaluation: { evaluator: EVALUATOR_TYPES[0]!, evaluatorVersion: '1', passed: true, issues: [] },
    context: { tempoBpm: null, originalTempoBpm: null, assistUsed: false, soundState: 'on', soundPlayed: true },
  });

const DRAFT_PITCH = { letter: 'C', accidental: null, octave: 4 } as const;
const ATTEMPTS = [passed('a1', Q01, 'middle-c'), passed('a2', Q02, 'quarter-rest')];

/** 0.1.0에서 Q01·Q02를 통과했고 Q01 초안에 C4를 하나 놓아 둔 저장 */
function seededSave(): string {
  const session = new ChallengeSession();
  session.openChallenge(Q01, 'middle-c', { tempoBpm: 60 });
  session.apply({ type: 'setSlot', slot: 1, writtenPitch: DRAFT_PITCH });
  return serializeSave(
    buildSave({
      savedAt: T1,
      contentVersions: { [Q01]: '0.1.0', [Q02]: '0.1.0' },
      position: null,
      openedQuests: [Q01, Q02],
      settings: DEFAULT_SETTINGS,
      session: session.serialize(),
      attempts: ATTEMPTS,
      preferences: { ...DEFAULT_PREFERENCES, introSeen: true },
    }),
  );
}

const openedOf = (mem: ReturnType<typeof memoryBackend>): OpenedBackend => ({ kind: 'memory', fallback: null, sync: mem, backend: mem });

async function start(mem: ReturnType<typeof memoryBackend>, channel: Channel, definitions: QuestDefinition[]): Promise<AppContext> {
  const loaded = await openSave({}, { opened: openedOf(mem) });
  const ctx = createAppContext({
    channel,
    definitions,
    createEngine: () => new FakeEngine(),
    root: null,
    nowIso: () => T2,
    usageLog: loaded.usageLog,
    persistence: { storage: loaded.storage, restored: loaded.save, pageEvents: null },
    ...optionsFromSave(loaded.save),
  });
  cleanups.push(() => ctx.dispose());
  return ctx;
}

/** 저장을 한 번 더 쓰게 만들고(설정을 바꿔) 방금 쓴 저장을 읽는다 */
async function saveAgain(ctx: AppContext, mem: ReturnType<typeof memoryBackend>) {
  ctx.settings.set({ ...ctx.settings.get(), masterVolume: 0.3 });
  expect(await ctx.persistence!.flush()).toBe(true);
  const r = parseSaveText(mem.data.get(KEY('current'))!);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.errors.join());
  return r.save;
}

describe('콘텐츠 판 올리기: 이전 기록은 새 정답 기준으로 다시 계산하지 않는다', () => {
  it('정답 악보가 바뀌고 판이 올라도, 0.1.0에서 통과한 기록은 통과 그대로이고 기록에 적힌 판도 0.1.0이다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), seededSave());
    const raised = clone(quest(Q01));
    raised.contentVersion = '0.2.0';
    const first = Object.keys(raised.variants)[0]!;
    raised.variants[first]!.score.tempoBpm += 20; // 정답 기준이 바뀌었다
    const ctx = await start(mem, 'preview', [raised, quest(Q02)]);

    expect(ctx.catalog.get(Q01)!.definition.contentVersion).toBe('0.2.0');
    expect(ctx.controller.attempts).toEqual(ATTEMPTS);
    expect(ctx.controller.attempts.filter((a) => a.questId === Q01).map((a) => a.contentVersion)).toEqual(['0.1.0']);
    expect([...passedQuestIds(ctx.controller.attempts)].sort()).toEqual([Q01, Q02].sort());

    // 다시 저장해도 기록은 그대로이고, 저장이 적는 '지금 본 판'만 오른다
    const saved = await saveAgain(ctx, mem);
    expect(saved.attempts).toEqual(ATTEMPTS);
    expect(saved.contentVersions[Q01]).toBe('0.2.0');
    expect(saved.contentVersions[Q02]).toBe('0.1.0');
  });
});

describe('문제 있는 과제 내리기: 저장된 것은 지우지 않는다', () => {
  it('내린 과제(정식 공개의 준비 중)는 열리지 않지만 초안과 통과 기록은 저장에 남고, 다시 올리면 초안이 이어진다', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), seededSave());
    const down = clone(quest(Q01));
    down.availability = 'draft';
    const ctxDown = await start(mem, 'release', [down, published(quest(Q02))]);

    const r = ctxDown.catalog.resolve(Q01, 'middle-c');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('preparing');
    expect(ctxDown.catalog.resolve(Q02, 'quarter-rest').ok).toBe(true); // 내리지 않은 것은 열린다
    expect(ctxDown.session.draftKeys()).toContain(`${Q01}/middle-c`);

    const mid = await saveAgain(ctxDown, mem);
    expect(Object.keys(mid.challengeDrafts)).toContain(`${Q01}/middle-c`);
    expect(mid.attempts).toEqual(ATTEMPTS);
    expect(mid.contentVersions[Q01]).toBe('0.1.0'); // 내려도 목록에 있으므로 판이 그대로 적힌다

    // 문제를 고쳐 다시 올린다: 새 앱이 같은 저장으로 열린다
    const ctxUp = await start(mem, 'release', [published(quest(Q01)), published(quest(Q02))]);
    expect(ctxUp.catalog.resolve(Q01, 'middle-c').ok).toBe(true);
    expect(ctxUp.session.contentOf(Q01, 'middle-c').slots[0]?.writtenPitch).toEqual(DRAFT_PITCH);
    expect(ctxUp.controller.attempts).toEqual(ATTEMPTS);
  });

  it('과제 파일을 지워 버리면 통과 기록과 초안은 남지만 저장이 적는 그 과제의 판(contentVersions)은 사라진다(그래서 지우지 않고 draft로 내린다)', async () => {
    const mem = memoryBackend();
    mem.data.set(KEY('current'), seededSave());
    const ctx = await start(mem, 'preview', [quest(Q02)]); // Q01의 정의가 없다
    expect(ctx.catalog.get(Q01)).toBeUndefined();

    const saved = await saveAgain(ctx, mem);
    expect(saved.attempts).toEqual(ATTEMPTS);
    expect(Object.keys(saved.challengeDrafts)).toContain(`${Q01}/middle-c`);
    expect(Object.keys(saved.contentVersions)).not.toContain(Q01);
    expect(saved.contentVersions[Q02]).toBe('0.1.0');
  });
});
