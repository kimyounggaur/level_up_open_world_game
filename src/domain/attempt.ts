// AttemptResult: 한 번의 시도를 어떻게 기록하는가(W-6, W-8, 6.1, 10.6).
// 이 파일은 시계도 난수도 저장소도 모른다. 시도 id와 기록 시각은 앱 계층이 만들어 넘긴다.
//
// 원칙
//  - 기술 문제(오디오 실패, 그리기 실패, 프레임 저하)는 음악 오답으로 기록하지 않는다(W-8).
//  - 소리를 끄고 한 시도는 소리를 듣고 확인한 성과('hearing: confirmed')로 기록하지 않는다(W-8).
//  - 통과 기록에는 템포와 도움 사용 여부를 함께 적는다. 느린 템포의 통과를 원래 템포의 통과로 바꿔 적지 않는다(7.6).
//  - 세계 반응은 통과 기록에서 매번 계산한다. 반응 값은 저장하지 않는다(10.6).
import type { Evaluation } from './evaluators/types';
import type { Issue } from './feedback';

export type AttemptResultType = 'passed' | 'needsRevision' | 'unscored' | 'technicalError';

/** 시도하는 동안의 소리 상태 */
export type SoundState = 'on' | 'muted' | 'unavailable' | 'failed';

export type TechnicalKind = 'audio' | 'render' | 'performance' | 'storage' | 'content';

/** 측정하지 못한 것. 측정하지 못했다는 사실을 따로 남겨 실패로 읽히지 않게 한다 */
export type NotMeasured = 'hearing' | 'evaluation';

export type HearingStatus = 'confirmed' | 'notMeasured';

export const ATTEMPT_RESULT_TYPES: readonly AttemptResultType[] = ['passed', 'needsRevision', 'unscored', 'technicalError'];
export const SOUND_STATES: readonly SoundState[] = ['on', 'muted', 'unavailable', 'failed'];
export const TECHNICAL_KINDS: readonly TechnicalKind[] = ['audio', 'render', 'performance', 'storage', 'content'];

export interface AttemptContext {
  /** 이 시도에서 쓴 템포(4분음표 기준 bpm). 템포라는 개념이 없는 과제는 null */
  tempoBpm: number | null;
  /** 판본이 정한 원래 템포. 없으면 null */
  originalTempoBpm: number | null;
  /** 이 시도 중에 도움(느리게, 구간 반복, 기본 연습 등)을 썼는가 */
  assistUsed: boolean;
  soundState: SoundState;
  /** 이 시도의 소리를 실제로 재생했는가. 재생이 시작된 것이 확인된 경우에만 true */
  soundPlayed: boolean;
}

export interface TechnicalFailure {
  kind: TechnicalKind;
  message?: string;
}

export interface AttemptInput {
  attemptId: string;
  questId: string;
  variantId: string;
  contentVersion: string;
  /** ISO 8601 문자열. 앱 계층이 정한다 */
  recordedAt?: string;
  /** 판정기를 돌리지 않았으면 null(예: 자유 편집을 저장만 한 경우) */
  evaluation: Evaluation | null;
  context: AttemptContext;
  /** 소리를 들어야 성립하는 과제(귀로 고르기 등)인가 */
  hearingRequired?: boolean;
  /** 시도를 판정할 수 없게 만든 기술 문제 */
  technicalFailure?: TechnicalFailure;
}

export interface AttemptResult {
  attemptId: string;
  questId: string;
  variantId: string;
  contentVersion: string;
  recordedAt: string | null;
  resultType: AttemptResultType;
  evaluator: string | null;
  evaluatorVersion: string | null;
  /** 사실만 담은 문제 목록. needsRevision일 때만 비어 있지 않다 */
  issues: Issue[];
  hearing: HearingStatus;
  notMeasured: NotMeasured[];
  tempoBpm: number | null;
  originalTempoBpm: number | null;
  /** 원래 템포보다 느리게 한 시도인가(tempoBpm과 originalTempoBpm에서 계산) */
  slowerThanOriginal: boolean;
  assistUsed: boolean;
  technical: TechnicalFailure | null;
}

/** 시도 하나를 기록 형식으로 바꾼다. 같은 입력이면 항상 같은 결과다. */
export function makeAttemptResult(input: AttemptInput): AttemptResult {
  const { context } = input;
  const heard = context.soundState === 'on' && context.soundPlayed;
  const hearing: HearingStatus = heard ? 'confirmed' : 'notMeasured';
  const slower = context.tempoBpm !== null && context.originalTempoBpm !== null && context.tempoBpm < context.originalTempoBpm;

  const base = {
    attemptId: input.attemptId,
    questId: input.questId,
    variantId: input.variantId,
    contentVersion: input.contentVersion,
    recordedAt: input.recordedAt ?? null,
    hearing,
    tempoBpm: context.tempoBpm,
    originalTempoBpm: context.originalTempoBpm,
    slowerThanOriginal: slower,
    assistUsed: context.assistUsed,
  };

  const notMeasured = (extra: NotMeasured[] = []): NotMeasured[] => {
    const out = new Set<NotMeasured>(extra);
    if (!heard) out.add('hearing');
    return [...out].sort();
  };

  // 1) 기술 문제: 판정할 수 없었다. 음악 오답이 아니다.
  let technical: TechnicalFailure | null = input.technicalFailure ?? null;
  if (!technical && input.hearingRequired && context.soundState === 'failed') {
    technical = { kind: 'audio', message: '소리를 내지 못했어요' };
  }
  if (technical) {
    return { ...base, resultType: 'technicalError', evaluator: null, evaluatorVersion: null, issues: [], notMeasured: notMeasured(['evaluation']), technical };
  }

  // 2) 판정기를 돌리지 않았다.
  if (!input.evaluation) {
    return { ...base, resultType: 'unscored', evaluator: null, evaluatorVersion: null, issues: [], notMeasured: notMeasured(['evaluation']), technical: null };
  }

  // 3) 소리가 있어야 성립하는 과제인데 듣지 못했다. 틀린 것이 아니라 측정하지 못한 것이다.
  if (input.hearingRequired && !heard) {
    return {
      ...base,
      resultType: 'unscored',
      evaluator: input.evaluation.evaluator,
      evaluatorVersion: input.evaluation.evaluatorVersion,
      issues: [],
      notMeasured: notMeasured(),
      technical: null,
    };
  }

  // 4) 일반 판정
  const passed = input.evaluation.passed;
  return {
    ...base,
    resultType: passed ? 'passed' : 'needsRevision',
    evaluator: input.evaluation.evaluator,
    evaluatorVersion: input.evaluation.evaluatorVersion,
    issues: passed ? [] : input.evaluation.issues.map((i) => ({ ...i, params: { ...i.params }, ...(i.target ? { target: { ...i.target } } : {}) })),
    notMeasured: notMeasured(),
    technical: null,
  };
}

// ---------------------------------------------------------------------------
// 기록을 읽는 방법

export const isPass = (r: AttemptResult): boolean => r.resultType === 'passed';

/** 음악적으로 고칠 곳이 있다고 판정된 시도인가. 기술 문제와 측정하지 못한 시도는 아니다 */
export const isMusicalMiss = (r: AttemptResult): boolean => r.resultType === 'needsRevision';

/** '소리를 듣고 확인한 통과'만 센다. 소리를 끄고 한 통과는 세지 않는다(W-8) */
export const isHearingSuccess = (r: AttemptResult): boolean => r.resultType === 'passed' && r.hearing === 'confirmed';

export const hearingSuccessCount = (results: readonly AttemptResult[]): number => results.filter(isHearingSuccess).length;

/** 통과한 서로 다른 (과제) 목록. 도움을 썼는지, 템포가 얼마였는지는 따지지 않는다(W-6, 6.1) */
export function passedQuestIds(results: readonly AttemptResult[]): string[] {
  return [...new Set(results.filter(isPass).map((r) => r.questId))].sort();
}

/** 통과한 서로 다른 (과제, 판본) 목록 */
export function passedVariantKeys(results: readonly AttemptResult[]): string[] {
  return [...new Set(results.filter(isPass).map((r) => `${r.questId}/${r.variantId}`))].sort();
}

/** 수첩의 한 줄: 과제와 판본마다 통과 기록을 요약한다. 느린 템포와 도움 사용을 따로 보여 준다(7.6) */
export interface PassSummary {
  questId: string;
  variantId: string;
  passCount: number;
  /** 원래 템포로, 도움 없이 통과한 적이 있는가 */
  passedAtOriginalTempoWithoutAssist: boolean;
  /** 느린 템포로 통과한 적이 있는가 */
  passedSlower: boolean;
  /** 도움을 쓰고 통과한 적이 있는가 */
  passedWithAssist: boolean;
  /** 통과 가운데 가장 빠른 템포. 템포가 없는 과제면 null */
  fastestPassBpm: number | null;
}

export function summarizePasses(results: readonly AttemptResult[]): PassSummary[] {
  const byKey = new Map<string, PassSummary>();
  for (const r of results) {
    if (!isPass(r)) continue;
    const key = `${r.questId}/${r.variantId}`;
    let s = byKey.get(key);
    if (!s) {
      s = { questId: r.questId, variantId: r.variantId, passCount: 0, passedAtOriginalTempoWithoutAssist: false, passedSlower: false, passedWithAssist: false, fastestPassBpm: null };
      byKey.set(key, s);
    }
    s.passCount++;
    if (r.slowerThanOriginal) s.passedSlower = true;
    if (r.assistUsed) s.passedWithAssist = true;
    if (!r.slowerThanOriginal && !r.assistUsed) s.passedAtOriginalTempoWithoutAssist = true;
    if (r.tempoBpm !== null && (s.fastestPassBpm === null || r.tempoBpm > s.fastestPassBpm)) s.fastestPassBpm = r.tempoBpm;
  }
  return [...byKey.values()].sort((a, b) => (a.questId === b.questId ? a.variantId.localeCompare(b.variantId) : a.questId.localeCompare(b.questId)));
}

// ---------------------------------------------------------------------------
// 저장된 기록 검사(저장소가 새 저장으로 바꾸기 전에, 가져오기에서 쓴다)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nullableNumber = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0);

export function validateAttemptResult(r: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(r)) return ['기록이 객체가 아니에요'];
  for (const f of ['attemptId', 'questId', 'variantId', 'contentVersion'] as const) {
    if (typeof r[f] !== 'string' || (r[f] as string).length === 0) errors.push(`${f}가 비어 있어요`);
  }
  if (!(ATTEMPT_RESULT_TYPES as readonly unknown[]).includes(r.resultType)) errors.push(`resultType이 올바르지 않아요: ${String(r.resultType)}`);
  if (r.hearing !== 'confirmed' && r.hearing !== 'notMeasured') errors.push('hearing이 올바르지 않아요');
  if (!Array.isArray(r.issues)) errors.push('issues가 배열이 아니에요');
  if (!Array.isArray(r.notMeasured)) errors.push('notMeasured가 배열이 아니에요');
  if (!nullableNumber(r.tempoBpm) || !nullableNumber(r.originalTempoBpm)) errors.push('템포가 올바르지 않아요');
  if (typeof r.assistUsed !== 'boolean') errors.push('assistUsed가 올바르지 않아요');
  if (typeof r.slowerThanOriginal !== 'boolean') errors.push('slowerThanOriginal이 올바르지 않아요');
  if (errors.length > 0) return errors;

  const issues = r.issues as unknown[];
  const type = r.resultType as AttemptResultType;
  if (type === 'passed' && issues.length > 0) errors.push('통과 기록에 문제가 들어 있어요');
  if (type === 'needsRevision' && issues.length === 0) errors.push('수정 필요 기록에 문제가 없어요');
  if ((type === 'unscored' || type === 'technicalError') && issues.length > 0) errors.push('측정하지 못한 기록에 문제가 들어 있어요(기술 문제를 음악 오답으로 적지 않아요)');
  if (type === 'technicalError' && !isObj(r.technical)) errors.push('기술 오류 기록에 technical이 없어요');
  if (type !== 'technicalError' && r.technical !== null) errors.push('기술 오류가 아닌 기록에 technical이 있어요');
  if (r.hearing === 'confirmed' && (r.notMeasured as unknown[]).includes('hearing')) errors.push('듣고 확인한 기록인데 hearing이 측정되지 않았다고 적혀 있어요');
  if (r.hearing === 'notMeasured' && !(r.notMeasured as unknown[]).includes('hearing')) errors.push('듣고 확인하지 않은 기록인데 notMeasured에 hearing이 없어요');
  if (r.slowerThanOriginal === true && !(typeof r.tempoBpm === 'number' && typeof r.originalTempoBpm === 'number' && r.tempoBpm < r.originalTempoBpm)) {
    errors.push('느린 템포라고 적혀 있지만 템포가 원래보다 느리지 않아요');
  }
  return errors;
}

/**
 * 읽을 수 있는 기록만 남긴다(저장 부분 복구용, 10.6). 망가진 기록과 attemptId가 겹치는 뒤의 기록은 버리고, 버린 이유를 '기록 n: …' 문장으로 돌려준다.
 * 버리지 않은 기록은 값 그대로다(고치지 않는다).
 */
export function salvageAttemptResults(list: readonly unknown[]): { attempts: AttemptResult[]; dropped: string[] } {
  const attempts: AttemptResult[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  list.forEach((r, i) => {
    const errors = validateAttemptResult(r);
    if (errors.length > 0) {
      dropped.push(`기록 ${i + 1}: ${errors[0]!}`);
      return;
    }
    const id = (r as AttemptResult).attemptId;
    if (seen.has(id)) {
      dropped.push(`기록 ${i + 1}: attemptId가 겹쳐요: ${id}`);
      return;
    }
    seen.add(id);
    attempts.push(r as AttemptResult);
  });
  return { attempts, dropped };
}

export function validateAttemptResults(list: unknown): string[] {
  if (!Array.isArray(list)) return ['통과 기록이 배열이 아니에요'];
  const errors: string[] = [];
  const seen = new Set<string>();
  list.forEach((r, i) => {
    for (const e of validateAttemptResult(r)) errors.push(`기록 ${i + 1}: ${e}`);
    if (isObj(r) && typeof r.attemptId === 'string') {
      if (seen.has(r.attemptId)) errors.push(`기록 ${i + 1}: attemptId가 겹쳐요: ${r.attemptId}`);
      seen.add(r.attemptId);
    }
  });
  return errors;
}
