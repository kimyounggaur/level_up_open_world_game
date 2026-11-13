// 시험 도구(제품 코드가 아니다): 과제 판본에서 '정답 그대로'의 판정기 입력을 만든다. 화면 없이 판정기만 부른다.
// content.test.ts(정답은 자기 판정기를 통과한다)와 review-checklist.test.ts(11.2 검수 점검표)가 함께 쓴다.
import { expectedPitchesOf } from '@/domain/evaluators';
import type { EvaluatorInput } from '@/domain/evaluators';
import { comparePitches, intervalBetween, pitchAbove } from '@/domain/pitch';

/** 정답 악보나 판정 조건에서 '정답 그대로'의 판정기 입력을 만든다(화면 없이) */
export function answerInput(v: Record<string, any>): EvaluatorInput {
  const spec = v.evaluatorSpec;
  const events: any[] = v.score.events;
  switch (spec.type) {
    case 'pitchSpelling':
      return { type: 'pitchSpelling', placed: spec.targets.map((t: any) => ({ slotId: t.slotId, pitch: t.expected })) };
    case 'rhythmPlacement':
      return { type: 'rhythmPlacement', score: v.score };
    case 'scoreArrangement':
      return { type: 'scoreArrangement', score: v.score };
    case 'orderedScale':
      return { type: 'orderedScale', placed: expectedPitchesOf(v.score, spec.voiceId).map((x, i) => ({ slot: i + 1, pitch: { letter: x.letter, alter: x.alter, octave: x.octave } })) };
    case 'triadMembership':
      return { type: 'triadMembership', notes: events.filter((e) => e.type === 'note').map((e, i) => ({ slotId: `tone-${i}`, pitch: e.resolvedPitch })) };
    case 'inversion':
      return { type: 'inversion', notes: events.filter((e) => e.type === 'note').map((e, i) => ({ slotId: `tone-${i}`, pitch: e.resolvedPitch })) };
    case 'chordSequence': {
      // 사건의 차례대로 한 마디에 화음 하나다: 사건의 나무에 그 마디의 음을 건다(같은 나무가 다시 나오면 처음에 건 것이 그대로 남는다)
      const trees: any[][] = Array.from({ length: spec.trees }, () => []);
      (spec.events as any[]).forEach((ev, i) => {
        if (trees[ev.tree]!.length > 0) return;
        const measure = events.filter((e) => e.type === 'note' && e.measureIndex === i);
        trees[ev.tree] = measure.map((e, j) => ({ slotId: `tone-${j}`, pitch: e.resolvedPitch }));
      });
      return { type: 'chordSequence', trees };
    }
    case 'interval': {
      const answers: Record<string, any> = {};
      for (const q of spec.questions) {
        if (q.kind === 'compare') {
          const c = comparePitches(q.a, q.b);
          answers[q.qid] = { soundSame: c.soundEquivalent, notationSame: c.notationEquivalent };
        } else if (q.kind === 'identify') {
          const i = intervalBetween(q.from, q.to);
          answers[q.qid] = { diatonicNumber: i.diatonicNumber, quality: i.quality };
        } else answers[q.qid] = { pitch: pitchAbove(q.from, q.diatonicNumber, q.quality) };
      }
      return { type: 'interval', answers };
    }
    default:
      throw new Error(`정답 입력을 만들 수 없는 판정기: ${spec.type}`);
  }
}
