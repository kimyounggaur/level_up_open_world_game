// 판정기 묶음과 공통 진입점. 판정기는 순수 함수다.
import type { Score } from '../score';
import { evaluateChordSequence } from './chordSequence';
import type { ChordSequenceInput, ChordSequenceSpec } from './chordSequence';
import { evaluateInterval } from './interval';
import type { IntervalInput, IntervalSpec } from './interval';
import { evaluateInversion } from './inversion';
import type { InversionInput, InversionSpec } from './inversion';
import { evaluateOrderedScale } from './orderedScale';
import type { OrderedScaleInput, OrderedScaleSpec } from './orderedScale';
import { evaluatePitchSpelling } from './pitchSpelling';
import type { PitchSpellingInput, PitchSpellingSpec } from './pitchSpelling';
import { evaluateRhythmPlacement } from './rhythmPlacement';
import type { RhythmPlacementInput, RhythmPlacementSpec } from './rhythmPlacement';
import { evaluateScoreArrangement } from './scoreArrangement';
import type { ScoreArrangementInput, ScoreArrangementSpec } from './scoreArrangement';
import { evaluateTriadMembership } from './triadMembership';
import type { TriadMembershipInput, TriadMembershipSpec } from './triadMembership';
import type { Evaluation, EvaluatorType } from './types';

export * from './types';
export * from './pitchSpelling';
export * from './interval';
export * from './rhythmPlacement';
export * from './triadMembership';
export * from './chordSequence';
export * from './inversion';
export * from './orderedScale';
export * from './scoreArrangement';

export type EvaluatorSpec =
  | PitchSpellingSpec
  | IntervalSpec
  | RhythmPlacementSpec
  | TriadMembershipSpec
  | ChordSequenceSpec
  | InversionSpec
  | OrderedScaleSpec
  | ScoreArrangementSpec;

export type EvaluatorInput =
  | PitchSpellingInput
  | IntervalInput
  | RhythmPlacementInput
  | TriadMembershipInput
  | ChordSequenceInput
  | InversionInput
  | OrderedScaleInput
  | ScoreArrangementInput;

export const EVALUATOR_TYPES: readonly EvaluatorType[] = [
  'pitchSpelling',
  'interval',
  'rhythmPlacement',
  'triadMembership',
  'chordSequence',
  'inversion',
  'orderedScale',
  'scoreArrangement',
];

/**
 * 판정기를 종류에 맞게 부른다. 점수 악보가 필요한 판정기(rhythmPlacement, orderedScale, scoreArrangement)는
 * 과제 판본의 목표 악보(expectedScore)를 받는다. 입력의 종류가 판정기와 다르면 오류로 알린다.
 */
export function evaluate(spec: EvaluatorSpec, input: EvaluatorInput, expectedScore?: Score): Evaluation {
  if (spec.type !== input.type) throw new Error(`판정기(${spec.type})와 입력(${input.type})의 종류가 달라요`);
  const needScore = (): Score => {
    if (!expectedScore) throw new Error(`${spec.type} 판정에는 목표 악보가 필요해요`);
    return expectedScore;
  };
  switch (spec.type) {
    case 'pitchSpelling':
      return evaluatePitchSpelling(spec, input as PitchSpellingInput);
    case 'interval':
      return evaluateInterval(spec, input as IntervalInput);
    case 'rhythmPlacement':
      return evaluateRhythmPlacement(spec, needScore(), input as RhythmPlacementInput);
    case 'triadMembership':
      return evaluateTriadMembership(spec, input as TriadMembershipInput);
    case 'chordSequence':
      return evaluateChordSequence(spec, input as ChordSequenceInput);
    case 'inversion':
      return evaluateInversion(spec, input as InversionInput);
    case 'orderedScale':
      return evaluateOrderedScale(spec, needScore(), input as OrderedScaleInput);
    case 'scoreArrangement':
      return evaluateScoreArrangement(spec, needScore(), input as ScoreArrangementInput);
  }
}
