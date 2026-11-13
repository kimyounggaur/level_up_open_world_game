// 악보 배치 판정(Q08). 성부마다 따로 비교한다. 한 성부를 끝낸 것을 두 성부를 끝낸 것으로 세지 않는다.
// 마디 수와 성부 수, 박자는 판본이 정한다. 틱은 정수로만 센다.
import type { Issue } from '../feedback';
import type { Score } from '../score';
import { evaluateRhythmPlacement } from './rhythmPlacement';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export interface ScoreArrangementSpec {
  type: 'scoreArrangement';
  /** 판정할 성부들. 한 성부 판본이면 하나, 두 성부 판본이면 둘 */
  voices: Array<{ voiceId: string; label: string }>;
  /** 음높이까지 비교할지. 기본 true */
  requirePitch?: boolean;
}

export interface ScoreArrangementInput {
  type: 'scoreArrangement';
  score: Score;
}

export function evaluateScoreArrangement(spec: ScoreArrangementSpec, expectedScore: Score, input: ScoreArrangementInput): Evaluation {
  const issues: Issue[] = [];
  const perVoice: Record<string, boolean> = {};
  for (const v of spec.voices) {
    const multi = spec.voices.length > 1;
    const ev = evaluateRhythmPlacement(
      { type: 'rhythmPlacement', voiceId: v.voiceId, requirePitch: spec.requirePitch ?? true },
      expectedScore,
      { type: 'rhythmPlacement', score: input.score },
      multi ? { voiceLabel: v.label } : {},
    );
    perVoice[v.voiceId] = ev.passed;
    for (const i of ev.issues) {
      issues.push({ ...i, target: { ...(i.target ?? {}), voiceId: v.voiceId } });
    }
  }
  return makeEvaluation('scoreArrangement', issues, { perVoice });
}
