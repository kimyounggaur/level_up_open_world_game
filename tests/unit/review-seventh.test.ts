// 7-8 검수 점검표(설계서 11.2)를 7단계에서 더한 새 과제 12개(Q09–Q12, Q24–Q31)의 판본 22개에 댄다.
// 이 열두 과제는 점검표의 대부분을 다른 시험이 이미 댄다. 이 파일은 그 시험들이 대는 범위가 열두 과제를 빠뜨리지 않았는지 지키고, 아직 대지 않은 한 갈래를 맡는다.
//   1 정답 예시의 악보·재생음·판정   3 음이름과 옥타브   4 마디 길이   5 '한 박'   8 출처와 권리   G2의 7(정식 공개 채널 차단)   사람이 하는 단계는 자동으로 완료되지 않는다
//     → review-checklist.test.ts가 모든 판본에 댄다(그 파일의 SEVENTH 목록이 이 열두 과제다)
//   2 오답 사례마다 기대한 설명: 지역마다 판본별로 틀린 입력을 만들어 댄다
//     → staff-hill-quests.test.ts(Q09–Q12), scale-trail-quests.test.ts(Q24–Q26), key-marsh-quests.test.ts(Q27–Q31)
//   2의 마지막 갈래, 음소거로 한 시도는 틀린 시도가 아니다(W-8): 이 파일이 22개 판본 모두에 댄다. 6-11의 review-wrong-cases.test.ts는 리듬·화음 판정기만 대서 이 판본들은 빠져 있었다
//   6 도움 경로가 열리고 통과 없이 돌아온다: 작업대 화면 시험의 '11.2의 6'(terrace-hud, scale-trail-hud, key-bridge-hud)이 판본 22개를 모두 댄다
//   7 설치물과 패널에서 같은 결과: 두 화면이 같은 컨트롤러의 같은 check()를 쓰는 구조(docs/approvals.md의 7-8)와 패널 쪽 시험(staff-panel, scale-trail-panel, key-marsh-panels)
// 틀린 입력은 정답 데이터에서 기계가 만든 것이다(마지막 답 하나를 뺀다). 사람이 실제로 자주 하는 틀림인지는 검수에서 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isHearingSuccess, isMusicalMiss, makeAttemptResult } from '@/domain/attempt';
import { evaluate } from '@/domain/evaluators';
import type { EvaluatorInput } from '@/domain/evaluators';
import { renderAll } from '@/domain/feedback';
import type { Score } from '@/domain/score';
import { answerInput } from './answers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUESTS: Array<Record<string, any>> = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', f), 'utf-8')));

/** 7단계에서 더한 과제와 판본의 수(설계서 5.3, 5.6, 5.7). 판본을 더하거나 빼면 이 표와 아래 시험들이 알린다 */
const NEW: Record<string, number> = {
  'staff.lines-and-spaces': 4, // Q09
  'staff.ledger-lines': 3, // Q10
  'staff.middle-c-neighbors': 1, // Q11
  'staff.range-ladder': 2, // Q12
  'scale.natural-minor': 3, // Q24
  'scale.harmonic-minor': 1, // Q25
  'scale.pentatonic': 1, // Q26
  'key.black-key-names': 1, // Q27
  'key.whole-and-half-steps': 1, // Q28
  'key.build-intervals': 2, // Q29
  'key.accidentals-in-a-bar': 1, // Q30
  'scale.chromatic': 2, // Q31
};

interface VariantRef {
  key: string;
  questId: string;
  variantId: string;
  v: Record<string, any>;
}
const VARIANTS: VariantRef[] = QUESTS.filter((q) => q.questId in NEW).flatMap((q) =>
  (q.variantIds as string[]).map((vid) => ({ key: `${q.questId}/${vid}`, questId: q.questId as string, variantId: vid, v: q.variants[vid] as Record<string, any> })),
);

/** 판정기가 보는 답에서 마지막 하나를 뺀 입력(누락). 판정기마다 답의 모양이 다르다 */
function omitLast(input: EvaluatorInput): EvaluatorInput {
  switch (input.type) {
    case 'pitchSpelling':
      return { ...input, placed: input.placed.slice(0, -1) };
    case 'orderedScale':
      return { ...input, placed: input.placed.slice(0, -1) };
    case 'interval': {
      const ids = Object.keys(input.answers);
      return { ...input, answers: Object.fromEntries(ids.slice(0, -1).map((id) => [id, input.answers[id]!])) };
    }
    default:
      throw new Error(`이 파일이 틀린 입력을 만들 수 없는 판정기: ${input.type}`);
  }
}

describe('범위: 7단계의 새 과제 12개와 판본 22개', () => {
  it('열두 과제가 모두 있고 판본이 22개다(Q09 4, Q10 3, Q11 1, Q12 2, Q24 3, Q25 1, Q26 1, Q27 1, Q28 1, Q29 2, Q30 1, Q31 2)', () => {
    for (const [id, n] of Object.entries(NEW)) {
      const q = QUESTS.find((x) => x.questId === id);
      expect(q, id).toBeDefined();
      expect(q!.variantIds, id).toHaveLength(n);
    }
    expect(Object.keys(NEW)).toHaveLength(12);
    expect(VARIANTS).toHaveLength(22);
  });

  it('판정기는 pitchSpelling, orderedScale, interval 셋뿐이다(다른 판정기가 생기면 틀린 입력을 만드는 시험을 더하라고 이 시험이 알린다)', () => {
    const types = new Set(VARIANTS.map((x) => x.v.evaluatorSpec.type as string));
    expect([...types].sort()).toEqual(['interval', 'orderedScale', 'pitchSpelling']);
  });

  it('누락 입력(마지막 답 하나를 뺀 것)은 판본 22개 모두에서 통과하지 못하고 설명이 나온다', () => {
    for (const x of VARIANTS) {
      const r = evaluate(x.v.evaluatorSpec, omitLast(answerInput(x.v)), x.v.score as Score);
      expect(r.passed, `${x.key}: 하나를 뺐는데 통과했어요`).toBe(false);
      expect(renderAll(r.issues).length, `${x.key}: 설명이 없어요`).toBeGreaterThan(0);
    }
  });
});

describe('11.2의 2: 음소거로 한 시도는 틀린 시도가 아니다(W-8)', () => {
  const muted = { tempoBpm: null, originalTempoBpm: null, assistUsed: false, soundState: 'muted' as const, soundPlayed: false };

  it.each(VARIANTS.map((x) => [x.key, x] as const))('%s', (_name, x) => {
    const spec = x.v.evaluatorSpec;
    const score = x.v.score as Score;
    const base = { attemptId: 'a-1', questId: x.questId, variantId: x.variantId, contentVersion: 'test' };
    // 정답을 소리 없이 하면 통과로 적히지만 소리를 듣고 확인한 성과로는 세지 않는다
    const pass = makeAttemptResult({ ...base, evaluation: evaluate(spec, answerInput(x.v), score), context: muted });
    expect(pass.resultType).toBe('passed');
    expect(pass.hearing).toBe('notMeasured');
    expect(pass.notMeasured).toContain('hearing');
    expect(pass.technical).toBeNull();
    expect(isHearingSuccess(pass)).toBe(false);
    // 틀린 답은 소리를 껐어도 고칠 곳이 있는 시도로 적히고 설명이 남는다. 소리가 꺼진 것이 이유로 적히지 않는다
    const miss = makeAttemptResult({ ...base, evaluation: evaluate(spec, omitLast(answerInput(x.v)), score), context: muted });
    expect(miss.resultType).toBe('needsRevision');
    expect(isMusicalMiss(miss)).toBe(true);
    expect(miss.issues.length).toBeGreaterThan(0);
    expect(miss.hearing).toBe('notMeasured');
    expect(miss.technical).toBeNull();
    expect(renderAll(miss.issues).join('\n')).not.toMatch(/소리|음소거|꺼/);
  });
});
