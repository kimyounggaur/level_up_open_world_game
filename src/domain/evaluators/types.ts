// 판정기 공통 형식. 판정기는 순수 함수다. 화면 좌표, 프레임 시간, 걸은 시간을 입력으로 받을 수 없다(W-3).
import type { Issue } from '../feedback';

/** 판정 규칙이 바뀌면 올린다. 기록(AttemptResult)에 함께 저장한다. */
export const EVALUATOR_VERSION = '1.0.0';

export type EvaluatorType =
  | 'pitchSpelling'
  | 'interval'
  | 'rhythmPlacement'
  | 'triadMembership'
  | 'chordSequence'
  | 'inversion'
  | 'orderedScale'
  | 'scoreArrangement';

export interface Evaluation {
  evaluator: EvaluatorType;
  evaluatorVersion: string;
  passed: boolean;
  issues: Issue[];
  /** 판정기별 부가 정보(현재 전위, 성부별 결과 등) */
  details?: Record<string, unknown>;
}

export function makeEvaluation(evaluator: EvaluatorType, issues: Issue[], details?: Record<string, unknown>): Evaluation {
  return { evaluator, evaluatorVersion: EVALUATOR_VERSION, passed: issues.length === 0, issues, ...(details ? { details } : {}) };
}
