// 저장 상태(10.6, 부록 A.3): 만들기, 읽어 확인하기, 세션(초안)과 통과 기록 되살리기.
import { describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { EVALUATOR_TYPES } from '@/domain/evaluators';
import { ChallengeSession } from '@/domain/session';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS } from '@/domain/save/settings';
import { MAX_OTHER_ATTEMPTS, PROJECT_ID, SAVE_SCHEMA_VERSION, buildSave, compactAttempts, emptySave, parseSave, parseSaveText, serializeSave, sessionOf } from '@/domain/save/save';
import type { SaveData, SaveParts } from '@/domain/save/save';

const NOW = '2026-11-11T03:00:00.000Z';
const ctx = { tempoBpm: 60, originalTempoBpm: 60, assistUsed: false, soundState: 'on', soundPlayed: true } as const;

const attempt = (id: string, pass: boolean | null): AttemptResult =>
  makeAttemptResult({
    attemptId: id,
    questId: 'pitch.same-note-two-clefs',
    variantId: 'middle-c',
    contentVersion: '0.1.0',
    recordedAt: NOW,
    evaluation: pass === null ? null : { evaluator: EVALUATOR_TYPES[0]!, evaluatorVersion: '1', passed: true, issues: [] },
    context: ctx,
  });

function sessionWithDraft() {
  const s = new ChallengeSession();
  s.openChallenge('pitch.same-note-two-clefs', 'middle-c', { tempoBpm: 60 });
  s.apply({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'C', accidental: null, octave: 4 } });
  s.apply({ type: 'setSlot', slot: 2, writtenPitch: { letter: 'E', accidental: 'sharp', octave: 4 } });
  s.select({ slot: 2 });
  return s;
}

function parts(over: Partial<SaveParts> = {}): SaveParts {
  return {
    savedAt: NOW,
    contentVersions: { 'pitch.same-note-two-clefs': '0.1.0' },
    position: { x: 3984, y: 3480, regionId: 'village', facing: 'down' },
    openedQuests: ['rhythm.rest-in-a-bar', 'pitch.same-note-two-clefs'],
    settings: { ...DEFAULT_SETTINGS, textSize: 'large' },
    session: sessionWithDraft().serialize(),
    attempts: [attempt('a1', true), attempt('a2', null)],
    preferences: { ...DEFAULT_PREFERENCES, introSeen: true },
    ...over,
  };
}

describe('buildSave', () => {
  it('설계서 A.3의 모양으로 만든다: projectId, 판, 위치, 설정, 진행 중인 도전과 초안, 환경설정, 통과 기록', () => {
    const save = buildSave(parts());
    expect(save.projectId).toBe(PROJECT_ID);
    expect(PROJECT_ID).toBe('levelup-music-world'); // D-14: 임시 id(TBD-project-id)를 쓰지 않는다
    expect(save.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(save.contentVersions).toEqual({ 'pitch.same-note-two-clefs': '0.1.0' });
    expect(save.explorationState.position).toEqual({ x: 3984, y: 3480, regionId: 'village', facing: 'down' });
    expect(save.explorationState.settings.textSize).toBe('large');
    expect(save.explorationState.openedQuests).toEqual(['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar']); // 정렬
    expect(save.explorationState.visitedStations).toEqual([]);
    expect(save.activeChallenge).toMatchObject({ questId: 'pitch.same-note-two-clefs', variantId: 'middle-c' });
    expect(Object.keys(save.challengeDrafts)).toEqual(['pitch.same-note-two-clefs/middle-c']);
    expect(save.supportContext).toBeNull();
    expect(save.preferences).toEqual({ language: 'ko', introSeen: true });
    expect(save.attempts).toHaveLength(2);
  });

  it('소리 층과 합주 층수는 저장하지 않는다: 통과 기록에서 매번 계산한다(10.6)', () => {
    const text = serializeSave(buildSave(parts()));
    expect(text).not.toMatch(/ensembleLevel|soundLayers|layerCount|합주 층/);
  });

  it('넘긴 값을 복사해서 쓴다: 나중에 바뀌어도 저장 값은 변하지 않는다', () => {
    const settings = { ...DEFAULT_SETTINGS };
    const session = sessionWithDraft();
    const save = buildSave(parts({ settings, session: session.serialize() }));
    settings.masterVolume = 0.1;
    session.apply({ type: 'setSlot', slot: 3, writtenPitch: { letter: 'G', accidental: null, octave: 4 } });
    expect(save.explorationState.settings.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(save.challengeDrafts['pitch.same-note-two-clefs/middle-c']!.slots).toHaveLength(2);
  });

  it('자기 자신이 만든 저장은 경고 하나 없이 다시 읽힌다', () => {
    const save = buildSave(parts());
    const r = parseSaveText(serializeSave(save));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toEqual([]);
      expect(r.save).toEqual(save);
    }
  });

  it('빈 저장도 읽힌다', () => {
    const r = parseSave(emptySave(NOW));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save.explorationState.position).toBeNull();
  });
});

describe('통과 기록 줄이기', () => {
  it('통과 기록은 모두 남기고, 그 밖의 시도는 가장 최근 것만 상한까지 남긴다. 순서는 그대로다', () => {
    const list: AttemptResult[] = [];
    for (let i = 0; i < 10; i++) list.push(attempt(`o${i}`, null));
    list.splice(3, 0, attempt('p1', true));
    list.push(attempt('p2', true));
    const out = compactAttempts(list, 4);
    expect(out.map((a) => a.attemptId)).toEqual(['p1', 'o6', 'o7', 'o8', 'o9', 'p2']);
    expect(compactAttempts(list, 100)).toHaveLength(list.length);
    expect(MAX_OTHER_ATTEMPTS).toBeGreaterThanOrEqual(100);
  });

  it('buildSave가 상한을 적용한다', () => {
    const many = Array.from({ length: MAX_OTHER_ATTEMPTS + 20 }, (_, i) => attempt(`o${i}`, null));
    many.push(attempt('p', true));
    const save = buildSave(parts({ attempts: many }));
    expect(save.attempts).toHaveLength(MAX_OTHER_ATTEMPTS + 1);
    expect(save.attempts.some((a) => a.attemptId === 'p')).toBe(true);
  });
});

describe('세션 되살리기', () => {
  it('저장한 초안(칸, 선택, 실행 취소 기록)으로 새 세션을 만들면 같은 상태다', () => {
    const original = sessionWithDraft();
    const save = buildSave(parts({ session: original.serialize() }));
    const r = parseSaveText(serializeSave(save));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const restored = ChallengeSession.restore(sessionOf(r.save));
    expect(restored.serialize()).toEqual(original.serialize());
    expect(restored.activeChallenge).toMatchObject({ questId: 'pitch.same-note-two-clefs', variantId: 'middle-c' });
    expect(restored.content().slots.map((s) => s.slot)).toEqual([1, 2]);
    expect(restored.selection()).toEqual({ slot: 2 });
  });
});

describe('parseSave: 믿을 수 없는 저장은 거른다', () => {
  const base = (): SaveData => buildSave(parts());
  const errorsOf = (raw: unknown): string[] => {
    const r = parseSave(raw);
    return r.ok ? [] : r.errors;
  };

  it('객체가 아니거나 JSON이 아니면 거른다', () => {
    expect(errorsOf(null)).toHaveLength(1);
    expect(errorsOf([])).toHaveLength(1);
    expect(errorsOf('x')).toHaveLength(1);
    expect(parseSaveText('{깨진 json')).toEqual({ ok: false, errors: ['JSON 형식이 아니에요'] });
  });

  it('다른 게임의 저장은 거른다(저장 키 앞에 프로젝트 id를 붙이는 것과 같은 이유)', () => {
    expect(errorsOf({ ...base(), projectId: 'TBD-project-id' }).join()).toContain('다른 게임의 저장');
    expect(parseSave({ ...base(), projectId: 'other-game' }, 'other-game').ok).toBe(true);
  });

  it('더 새로운 판의 저장과 판 번호가 이상한 저장은 거른다', () => {
    expect(errorsOf({ ...base(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 }).join()).toContain('더 새로운 판');
    expect(errorsOf({ ...base(), saveSchemaVersion: 0 }).join()).toContain('saveSchemaVersion');
    expect(errorsOf({ ...base(), saveSchemaVersion: '1' }).join()).toContain('saveSchemaVersion');
  });

  it('저장한 때가 시각이 아니면 거른다', () => {
    expect(errorsOf({ ...base(), savedAt: 'yesterday' }).join()).toContain('savedAt');
    expect(errorsOf({ ...base(), savedAt: undefined }).join()).toContain('savedAt');
  });

  it('초안이 망가졌으면 거른다(작업을 잃는 쪽이 아니라 저장소가 직전 저장으로 가게 한다)', () => {
    const s = base();
    const key = 'pitch.same-note-two-clefs/middle-c';
    const broken = { ...s, challengeDrafts: { [key]: { ...s.challengeDrafts[key]!, undoDepth: 99 } } };
    expect(errorsOf(broken).join()).toContain('undoDepth');
    expect(errorsOf({ ...s, challengeDrafts: 'x' }).join()).toContain('challengeDrafts');
    expect(errorsOf({ ...s, activeChallenge: { questId: '' } }).join()).toContain('activeChallenge');
  });

  it('통과 기록이 망가졌으면 거른다', () => {
    expect(errorsOf({ ...base(), attempts: [{ attemptId: 'a' }] }).join()).toContain('기록 1');
    expect(errorsOf({ ...base(), attempts: 'x' }).join()).toContain('attempts');
    const dup = [attempt('same', true), attempt('same', true)];
    expect(errorsOf({ ...base(), attempts: dup }).join()).toContain('겹쳐요');
  });

  it('덜 중요한 칸(위치, 목록, 설정)이 잘못됐으면 그 칸만 기본값으로 돌리고 이유를 남긴다', () => {
    const s = base();
    const r = parseSave({
      ...s,
      explorationState: {
        ...s.explorationState,
        position: { x: -5, y: 10, regionId: 'village' },
        openedQuests: ['ok', 7, ''],
        visitedStations: 'x',
        settings: { ...s.explorationState.settings, masterVolume: 3, textSize: 'huge' },
      },
      preferences: { language: 'en', introSeen: 'yes' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.explorationState.position).toBeNull();
    expect(r.save.explorationState.openedQuests).toEqual(['ok']);
    expect(r.save.explorationState.visitedStations).toEqual([]);
    expect(r.save.explorationState.settings.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(r.save.explorationState.settings.textSize).toBe('normal');
    expect(r.save.preferences).toEqual({ language: 'ko', introSeen: false });
    expect(r.warnings.length).toBeGreaterThanOrEqual(6);
    // 작업(초안, 통과 기록)은 그대로다
    expect(r.save.attempts).toHaveLength(2);
    expect(Object.keys(r.save.challengeDrafts)).toHaveLength(1);
  });

  it('없는 칸은 기본값이다(오래된 저장): 위치가 없으면 처음 자리, 방향이 없으면 아래', () => {
    const s = base();
    const { position: _p, ...rest } = s.explorationState;
    const r = parseSave({ ...s, explorationState: rest, preferences: undefined, contentVersions: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.explorationState.position).toBeNull();
      expect(r.save.preferences).toEqual(DEFAULT_PREFERENCES);
      expect(r.save.contentVersions).toEqual({});
    }
    const r2 = parseSave({ ...s, explorationState: { ...s.explorationState, position: { x: 100, y: 100, regionId: 'village' } } });
    expect(r2.ok && r2.save.explorationState.position?.facing).toBe('down');
  });
});
