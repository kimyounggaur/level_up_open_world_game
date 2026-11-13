// AttemptResult 검사: 기술 문제와 음소거를 음악 오답이나 듣기 성과로 기록하지 않는다(W-8), 통과 기록에 템포와 도움이 남는다(6.1).
import { describe, expect, it } from 'vitest';
import {
  hearingSuccessCount,
  isHearingSuccess,
  isMusicalMiss,
  isPass,
  makeAttemptResult,
  passedQuestIds,
  passedVariantKeys,
  summarizePasses,
  validateAttemptResult,
  validateAttemptResults,
} from '@/domain/attempt';
import type { AttemptContext, AttemptInput, AttemptResult } from '@/domain/attempt';
import { makeEvaluation } from '@/domain/evaluators/types';
import type { Issue } from '@/domain/feedback';

const issue: Issue = { code: 'WRONG_SPELLING_SAME_PITCH', params: { position: 4, expectedName: 'B♭4', actualName: 'A♯4' }, target: { position: 4 } };
const passedEval = makeEvaluation('orderedScale', []);
const failedEval = makeEvaluation('orderedScale', [issue]);

const ctx = (over: Partial<AttemptContext> = {}): AttemptContext => ({
  tempoBpm: 80,
  originalTempoBpm: 80,
  assistUsed: false,
  soundState: 'on',
  soundPlayed: true,
  ...over,
});

let counter = 0;
const input = (over: Partial<AttemptInput> = {}): AttemptInput => ({
  attemptId: `a${++counter}`,
  questId: 'scale.major',
  variantId: 'f-major',
  contentVersion: '0.1.0',
  evaluation: passedEval,
  context: ctx(),
  ...over,
});

describe('시도를 기록 형식으로 바꾸기', () => {
  it('판정을 통과하면 passed다. 템포와 도움 사용 여부와 판정기 버전이 함께 남는다', () => {
    const r = makeAttemptResult(input({ recordedAt: '2026-11-10T13:00:00.000Z' }));
    expect(r.resultType).toBe('passed');
    expect(r.issues).toEqual([]);
    expect(r.evaluator).toBe('orderedScale');
    expect(r.evaluatorVersion).toBe('1.0.0');
    expect(r.tempoBpm).toBe(80);
    expect(r.originalTempoBpm).toBe(80);
    expect(r.assistUsed).toBe(false);
    expect(r.hearing).toBe('confirmed');
    expect(r.notMeasured).toEqual([]);
    expect(r.technical).toBeNull();
    expect(r.recordedAt).toBe('2026-11-10T13:00:00.000Z');
  });

  it('판정을 통과하지 못하면 needsRevision이고 사실 문제 목록이 그대로 담긴다', () => {
    const r = makeAttemptResult(input({ evaluation: failedEval }));
    expect(r.resultType).toBe('needsRevision');
    expect(r.issues).toEqual([issue]);
    expect(isMusicalMiss(r)).toBe(true);
    expect(isPass(r)).toBe(false);
  });

  it('기록한 문제를 고쳐도 원래 판정 결과는 바뀌지 않는다(복사본)', () => {
    const r = makeAttemptResult(input({ evaluation: failedEval }));
    (r.issues[0]!.params as Record<string, unknown>).position = 99;
    expect(failedEval.issues[0]!.params.position).toBe(4);
  });

  it('같은 입력이면 같은 기록이다', () => {
    const i = input({ evaluation: failedEval });
    expect(makeAttemptResult(i)).toEqual(makeAttemptResult(i));
  });

  it('recordedAt을 주지 않으면 null이다(도메인은 시계를 모른다)', () => {
    expect(makeAttemptResult(input()).recordedAt).toBeNull();
  });
});

describe('W-8 소리 없이도: 기술 문제와 음소거를 음악 결과로 읽지 않는다', () => {
  it('음소거로 과제를 완료하면 통과로 기록하되 듣기 성과로는 세지 않는다', () => {
    const r = makeAttemptResult(input({ context: ctx({ soundState: 'muted', soundPlayed: false }) }));
    expect(r.resultType).toBe('passed');
    expect(r.hearing).toBe('notMeasured');
    expect(r.notMeasured).toEqual(['hearing']);
    expect(isHearingSuccess(r)).toBe(false);
    expect(hearingSuccessCount([r])).toBe(0);
  });

  it('오디오가 실패한 상태의 배치 통과도 듣기 성과가 아니다', () => {
    const r = makeAttemptResult(input({ context: ctx({ soundState: 'failed', soundPlayed: false }) }));
    expect(r.resultType).toBe('passed');
    expect(isHearingSuccess(r)).toBe(false);
  });

  it('소리가 켜져 있어도 재생하지 않았으면 듣기 성과가 아니다', () => {
    const r = makeAttemptResult(input({ context: ctx({ soundState: 'on', soundPlayed: false }) }));
    expect(r.hearing).toBe('notMeasured');
    expect(isHearingSuccess(r)).toBe(false);
  });

  it('소리를 켜고 들은 통과만 듣기 성과로 센다', () => {
    const heard = makeAttemptResult(input());
    const muted = makeAttemptResult(input({ context: ctx({ soundState: 'muted', soundPlayed: false }) }));
    const missedButHeard = makeAttemptResult(input({ evaluation: failedEval }));
    expect(hearingSuccessCount([heard, muted, missedButHeard])).toBe(1);
  });

  it('들어야 하는 과제를 음소거로 했다면 틀린 것이 아니라 측정하지 못한 것이다', () => {
    const r = makeAttemptResult(input({ hearingRequired: true, evaluation: failedEval, context: ctx({ soundState: 'muted', soundPlayed: false }) }));
    expect(r.resultType).toBe('unscored');
    expect(r.issues).toEqual([]); // 오답으로 적지 않는다
    expect(r.notMeasured).toEqual(['hearing']);
    expect(isMusicalMiss(r)).toBe(false);
    expect(isPass(r)).toBe(false);
  });

  it('들어야 하는 과제에서 오디오가 실패하면 technicalError다', () => {
    const r = makeAttemptResult(input({ hearingRequired: true, evaluation: failedEval, context: ctx({ soundState: 'failed', soundPlayed: false }) }));
    expect(r.resultType).toBe('technicalError');
    expect(r.technical?.kind).toBe('audio');
    expect(r.issues).toEqual([]);
    expect(isMusicalMiss(r)).toBe(false);
    expect(r.notMeasured).toEqual(['evaluation', 'hearing']);
  });

  it('들어야 하는 과제를 소리를 켜고 들었으면 일반 판정이다', () => {
    expect(makeAttemptResult(input({ hearingRequired: true })).resultType).toBe('passed');
    expect(makeAttemptResult(input({ hearingRequired: true, evaluation: failedEval })).resultType).toBe('needsRevision');
  });

  it('호출한 쪽이 알린 기술 문제는 판정 결과가 있어도 technicalError다', () => {
    for (const kind of ['audio', 'render', 'performance', 'storage', 'content'] as const) {
      const r = makeAttemptResult(input({ evaluation: failedEval, technicalFailure: { kind, message: '문제' } }));
      expect(r.resultType).toBe('technicalError');
      expect(r.issues).toEqual([]);
      expect(r.technical).toEqual({ kind, message: '문제' });
      expect(r.evaluator).toBeNull();
    }
  });

  it('판정기를 돌리지 않은 시도는 unscored다', () => {
    const r = makeAttemptResult(input({ evaluation: null }));
    expect(r.resultType).toBe('unscored');
    expect(r.notMeasured).toEqual(['evaluation']);
    expect(r.issues).toEqual([]);
    expect(r.evaluator).toBeNull();
  });

  it('통과도 오답도 아닌 기록은 반응에 쓰이지 않는다', () => {
    const rs = [
      makeAttemptResult(input({ evaluation: null })),
      makeAttemptResult(input({ technicalFailure: { kind: 'render' } })),
      makeAttemptResult(input({ hearingRequired: true, context: ctx({ soundState: 'muted', soundPlayed: false }) })),
    ];
    expect(passedQuestIds(rs)).toEqual([]);
    expect(rs.some(isMusicalMiss)).toBe(false);
  });
});

describe('템포와 도움 사용 여부(6.1, 7.6)', () => {
  it('느린 템포의 통과는 느린 통과로 적힌다', () => {
    const r = makeAttemptResult(input({ context: ctx({ tempoBpm: 50, originalTempoBpm: 80, assistUsed: true }) }));
    expect(r.slowerThanOriginal).toBe(true);
    expect(r.assistUsed).toBe(true);
    expect(r.tempoBpm).toBe(50);
    expect(r.originalTempoBpm).toBe(80);
  });

  it('원래 템포나 더 빠른 템포는 느린 통과가 아니다. 템포가 없는 과제도 아니다', () => {
    expect(makeAttemptResult(input({ context: ctx({ tempoBpm: 80 }) })).slowerThanOriginal).toBe(false);
    expect(makeAttemptResult(input({ context: ctx({ tempoBpm: 100 }) })).slowerThanOriginal).toBe(false);
    expect(makeAttemptResult(input({ context: ctx({ tempoBpm: null, originalTempoBpm: null }) })).slowerThanOriginal).toBe(false);
    expect(makeAttemptResult(input({ context: ctx({ tempoBpm: 50, originalTempoBpm: null }) })).slowerThanOriginal).toBe(false);
  });

  it('세계 반응은 통과한 과제를 도움과 템포와 상관없이 센다(W-6)', () => {
    const rs = [
      makeAttemptResult(input({ questId: 'pitch.same-note-two-clefs', variantId: 'v1', context: ctx({ tempoBpm: 40, assistUsed: true }) })),
      makeAttemptResult(input({ questId: 'rhythm.rest-in-a-bar', variantId: 'basic' })),
      makeAttemptResult(input({ questId: 'scale.major', variantId: 'c-major', evaluation: failedEval })),
    ];
    expect(passedQuestIds(rs)).toEqual(['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar']);
  });

  it('통과 뒤에 같은 과제에서 오답을 내도 통과는 그대로다(W-6)', () => {
    const rs = [makeAttemptResult(input()), makeAttemptResult(input({ evaluation: failedEval })), makeAttemptResult(input({ evaluation: failedEval }))];
    expect(passedQuestIds(rs)).toEqual(['scale.major']);
    expect(passedVariantKeys(rs)).toEqual(['scale.major/f-major']);
  });

  it('수첩 요약은 느린 통과와 도움 통과를 원래 통과와 섞지 않는다', () => {
    const rs = [
      makeAttemptResult(input({ context: ctx({ tempoBpm: 50, assistUsed: true }) })),
      makeAttemptResult(input({ variantId: 'c-major', context: ctx({ tempoBpm: 80 }) })),
      makeAttemptResult(input({ variantId: 'c-major', context: ctx({ tempoBpm: 100 }) })),
      makeAttemptResult(input({ variantId: 'c-major', evaluation: failedEval })),
    ];
    const sum = summarizePasses(rs);
    expect(sum).toEqual([
      { questId: 'scale.major', variantId: 'c-major', passCount: 2, passedAtOriginalTempoWithoutAssist: true, passedSlower: false, passedWithAssist: false, fastestPassBpm: 100 },
      { questId: 'scale.major', variantId: 'f-major', passCount: 1, passedAtOriginalTempoWithoutAssist: false, passedSlower: true, passedWithAssist: true, fastestPassBpm: 50 },
    ]);
  });
});

describe('저장된 기록 검사', () => {
  const good = (): AttemptResult => makeAttemptResult(input());
  const bad = (patch: Record<string, unknown>) => validateAttemptResult({ ...good(), ...patch });

  it('만든 기록은 모두 검사를 통과한다', () => {
    const all = [
      makeAttemptResult(input()),
      makeAttemptResult(input({ evaluation: failedEval })),
      makeAttemptResult(input({ evaluation: null })),
      makeAttemptResult(input({ technicalFailure: { kind: 'audio' } })),
      makeAttemptResult(input({ hearingRequired: true, context: ctx({ soundState: 'muted', soundPlayed: false }) })),
      makeAttemptResult(input({ context: ctx({ tempoBpm: 50, originalTempoBpm: 80, assistUsed: true }) })),
    ];
    for (const r of all) expect(validateAttemptResult(r)).toEqual([]);
    expect(validateAttemptResults(all)).toEqual([]);
  });

  it('형식이 어긋난 기록을 거른다', () => {
    expect(validateAttemptResult(null)).toEqual(['기록이 객체가 아니에요']);
    expect(bad({ attemptId: '' }).join('|')).toContain('attemptId');
    expect(bad({ resultType: 'maybe' }).join('|')).toContain('resultType');
    expect(bad({ hearing: 'loud' }).join('|')).toContain('hearing');
    expect(bad({ tempoBpm: -3 }).join('|')).toContain('템포');
    expect(bad({ assistUsed: 'no' }).join('|')).toContain('assistUsed');
  });

  it('기록 안의 모순을 거른다', () => {
    expect(bad({ issues: [issue] }).join('|')).toContain('통과 기록에 문제가 들어 있어요');
    const miss = makeAttemptResult(input({ evaluation: failedEval }));
    expect(validateAttemptResult({ ...miss, issues: [] }).join('|')).toContain('수정 필요 기록에 문제가 없어요');
    const unscored = makeAttemptResult(input({ evaluation: null }));
    expect(validateAttemptResult({ ...unscored, issues: [issue] }).join('|')).toContain('기술 문제를 음악 오답으로 적지 않아요');
    const tech = makeAttemptResult(input({ technicalFailure: { kind: 'audio' } }));
    expect(validateAttemptResult({ ...tech, technical: null }).join('|')).toContain('technical이 없어요');
    expect(bad({ technical: { kind: 'audio' } }).join('|')).toContain('technical이 있어요');
    expect(bad({ hearing: 'confirmed', notMeasured: ['hearing'] }).join('|')).toContain('hearing이 측정되지 않았다고');
    expect(bad({ hearing: 'notMeasured', notMeasured: [] }).join('|')).toContain('notMeasured에 hearing이 없어요');
    expect(bad({ slowerThanOriginal: true }).join('|')).toContain('느린 템포라고 적혀 있지만');
  });

  it('목록에서 attemptId가 겹치면 거른다', () => {
    const a = good();
    expect(validateAttemptResults([a, { ...a }]).join('|')).toContain('attemptId가 겹쳐요');
    expect(validateAttemptResults({} as never)).toEqual(['통과 기록이 배열이 아니에요']);
  });
});
