// 음정 판정(Q04, Q28, Q29 — 확장 X-5): 문자 간 거리(도수)와 실제 반음 거리를 함께 쓴다.
// 세 반음이라는 이유만으로 증2도와 단3도를 같게 채점하지 않는다.
import type { Issue } from '../feedback';
import { comparePitches, intervalBetween, intervalName, midiOf, pitchAbove, pitchName, spellEquals } from '../pitch';
import type { IntervalQuality, SpelledPitch } from '../pitch';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export type IntervalQuestion =
  | { qid: string; label: string; kind: 'identify'; from: SpelledPitch; to: SpelledPitch }
  | { qid: string; label: string; kind: 'build'; from: SpelledPitch; diatonicNumber: number; quality: IntervalQuality }
  | { qid: string; label: string; kind: 'compare'; a: SpelledPitch; b: SpelledPitch };

export interface IntervalSpec {
  type: 'interval';
  questions: IntervalQuestion[];
}

export type IntervalAnswer =
  | { diatonicNumber: number; quality: IntervalQuality }
  | { pitch: SpelledPitch }
  | { soundSame: boolean; notationSame: boolean };

export interface IntervalInput {
  type: 'interval';
  answers: Record<string, IntervalAnswer | undefined>;
}

export function evaluateInterval(spec: IntervalSpec, input: IntervalInput): Evaluation {
  const issues: Issue[] = [];
  for (const q of spec.questions) {
    const target = { slotId: q.qid };
    const ans = input.answers[q.qid];
    if (!ans) {
      issues.push({ code: 'MISSING_PLACEMENT', params: { where: q.label }, target });
      continue;
    }
    if (q.kind === 'identify' && 'diatonicNumber' in ans) {
      const want = intervalBetween(q.from, q.to);
      if (want.diatonicNumber !== ans.diatonicNumber || want.quality !== ans.quality) {
        issues.push({
          code: 'WRONG_INTERVAL',
          params: { where: q.label, expectedText: intervalName(want), actualText: intervalName(ans), semitones: want.semitones },
          target,
        });
      }
    } else if (q.kind === 'build' && 'pitch' in ans) {
      const want = pitchAbove(q.from, q.diatonicNumber, q.quality);
      if (!spellEquals(want, ans.pitch)) {
        const params = { where: q.label, actualName: pitchName(ans.pitch), expectedName: pitchName(want), expectedLetter: want.letter };
        issues.push({ code: midiOf(want) === midiOf(ans.pitch) ? 'WRONG_SPELLING_SAME_PITCH' : 'WRONG_PITCH', params, target });
      }
    } else if (q.kind === 'compare' && 'soundSame' in ans) {
      const want = comparePitches(q.a, q.b);
      if (want.soundEquivalent !== ans.soundSame) {
        issues.push({ code: 'WRONG_SOUND_EQUIV', params: { where: q.label, expectedAnswer: want.soundEquivalent ? '같아요' : '달라요' }, target });
      }
      if (want.notationEquivalent !== ans.notationSame) {
        issues.push({ code: 'WRONG_NOTATION_EQUIV', params: { where: q.label, expectedAnswer: want.notationEquivalent ? '같아요' : '달라요' }, target });
      }
    } else {
      // 질문과 답의 종류가 맞지 않으면 답이 없는 것으로 본다(조용히 맞다고 하지 않는다).
      issues.push({ code: 'MISSING_PLACEMENT', params: { where: q.label }, target });
    }
  }
  return makeEvaluation('interval', issues);
}
