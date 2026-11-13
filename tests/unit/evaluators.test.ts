// 1-5 판정기 인수 테스트. 상세 설계 Q01–Q08과 확장 X-1…X-5 가운데 화면과 무관한 항목 전부.
import { describe, expect, it } from 'vitest';
import { ISSUE_PARAMS, renderAll, renderFeedback } from '@/domain/feedback';
import type { Issue } from '@/domain/feedback';
import { pitchAtStaffPosition } from '@/domain/staff';
import { measureTicks } from '@/domain/time';
import {
  EVALUATOR_TYPES,
  evaluate,
  evaluateInterval,
  evaluateInversion,
  evaluateOrderedScale,
  evaluatePitchSpelling,
  evaluateRhythmPlacement,
  evaluateScoreArrangement,
  evaluateTriadMembership,
} from '@/domain/evaluators';
import type { OrderedScaleSpec, PitchSpellingSpec, TriadMembershipSpec } from '@/domain/evaluators';
import type { Score } from '@/domain/score';
import { baseScore, note, p, quarterLine, rest } from './helpers';

// 판정기가 담아 주는 값의 이름은 ISSUE_PARAMS에 적힌 것뿐이어야 한다(콘텐츠 검사가 이 목록을 믿고 문장을 검사한다).
function checkParamNames(e: { issues: Issue[] }): void {
  for (const i of e.issues) {
    const allowed = new Set(ISSUE_PARAMS[i.code]);
    for (const k of Object.keys(i.params)) expect(allowed.has(k), `${i.code}에 목록에 없는 값 '${k}'`).toBe(true);
  }
}
const codes = (e: { issues: Issue[] }): string[] => {
  checkParamNames(e);
  return e.issues.map((i) => i.code);
};
const texts = (e: { issues: Issue[] }, rules: Array<{ code: string; template: string }> = []): string[] => {
  checkParamNames(e);
  return renderAll(e.issues, rules);
};

// ---------------------------------------------------------------------------
describe('Q01 같은 음의 자리 찾기 (pitchSpelling)', () => {
  const spec: PitchSpellingSpec = {
    type: 'pitchSpelling',
    targets: [
      { slotId: 'treble', label: '높은음자리표 보표', expected: p('C4'), clef: 'treble' },
      { slotId: 'bass', label: '낮은음자리표 보표', expected: p('C4'), clef: 'bass' },
    ],
  };
  const at = (treble: number | null, bass: number | null) => ({
    type: 'pitchSpelling' as const,
    placed: [
      { slotId: 'treble', pitch: treble === null ? null : pitchAtStaffPosition('treble', treble) },
      { slotId: 'bass', pitch: bass === null ? null : pitchAtStaffPosition('bass', bass) },
    ],
  });

  it('높은음자리표의 아래 첫 덧줄(−2)과 낮은음자리표의 위 첫 덧줄(10)이면 통과한다', () => {
    expect(evaluatePitchSpelling(spec, at(-2, 10)).passed).toBe(true);
  });

  it('높은음자리표의 맨 아랫줄(E4)에 놓으면 실패하고, 목표 위치를 말로 알려 준다', () => {
    const r = evaluatePitchSpelling(spec, at(0, 10));
    expect(r.passed).toBe(false);
    expect(codes(r)).toEqual(['WRONG_STAFF_PITCH']);
    expect(texts(r)[0]).toBe('지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.');
  });

  it('낮은음자리표 쪽 오답은 낮은음자리표의 말로 알려 준다', () => {
    const r = evaluatePitchSpelling(spec, at(-2, 8)); // 낮은음자리표 맨 윗줄 = A3
    expect(texts(r)[0]).toBe('지금 위치는 A3이에요. 목표 C4는 낮은음자리표의 위 첫 덧줄에 있어요.');
  });

  it('소리 높이는 같지만 이름이 다르면(B♯3) 실패하고 이유를 밝힌다', () => {
    const r = evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [{ slotId: 'treble', pitch: p('B#3') }, { slotId: 'bass', pitch: p('C4') }] });
    expect(codes(r)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(texts(r)[0]).toContain('소리 높이는 같지만 이름이 달라요');
  });

  it('옥타브가 다르면 옥타브 문제라고 알려 준다', () => {
    const r = evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [{ slotId: 'treble', pitch: p('C5') }, { slotId: 'bass', pitch: p('C4') }] });
    expect(codes(r)).toEqual(['OCTAVE_MISMATCH']);
  });

  it('하나만 놓으면 비어 있는 쪽을 알려 준다', () => {
    const r = evaluatePitchSpelling(spec, at(-2, null));
    expect(codes(r)).toEqual(['MISSING_PLACEMENT']);
    expect(texts(r)[0]).toBe('낮은음자리표 보표에 음이 아직 없어요.');
  });

  it('목표에 없는 칸의 음은 알려 준다', () => {
    const r = evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [...at(-2, 10).placed, { slotId: 'extra', pitch: p('D4') }] });
    expect(codes(r)).toEqual(['EXTRA_PLACEMENT']);
  });
});

// ---------------------------------------------------------------------------
describe('Q04 같은 높이의 다른 이름 (pitchSpelling + interval)', () => {
  const spec: PitchSpellingSpec = {
    type: 'pitchSpelling',
    targets: [
      { slotId: 'up', label: '올려 부른 이름표', expected: p('C#4') },
      { slotId: 'down', label: '내려 부른 이름표', expected: p('Db4') },
    ],
  };

  it('C♯4와 D♭4를 각각 맞게 쓰면 통과한다', () => {
    expect(evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [{ slotId: 'up', pitch: p('C#4') }, { slotId: 'down', pitch: p('Db4') }] }).passed).toBe(true);
  });

  it('두 이름표에 같은 이름을 쓰면 소리는 같아도 표기가 다르다고 알려 준다', () => {
    const r = evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [{ slotId: 'up', pitch: p('C#4') }, { slotId: 'down', pitch: p('C#4') }] });
    expect(codes(r)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(texts(r)[0]).toBe('내려 부른 이름표: 소리 높이는 같지만 이름이 달라요. 지금은 C♯4, 목표는 D♭4예요.');
  });

  it('소리가 같다와 표기가 같다를 따로 묻는다', () => {
    const q = { qid: 'c1', label: 'C♯4와 D♭4', kind: 'compare' as const, a: p('C#4'), b: p('Db4') };
    const spec2 = { type: 'interval' as const, questions: [q] };
    expect(evaluateInterval(spec2, { type: 'interval', answers: { c1: { soundSame: true, notationSame: false } } }).passed).toBe(true);
    const bothSame = evaluateInterval(spec2, { type: 'interval', answers: { c1: { soundSame: true, notationSame: true } } });
    expect(codes(bothSame)).toEqual(['WRONG_NOTATION_EQUIV']);
    const soundDiff = evaluateInterval(spec2, { type: 'interval', answers: { c1: { soundSame: false, notationSame: false } } });
    expect(codes(soundDiff)).toEqual(['WRONG_SOUND_EQUIV']);
  });
});

describe('X-5 음정 단독 과제 (interval)', () => {
  const spec = {
    type: 'interval' as const,
    questions: [
      { qid: 'a', label: 'C4에서 D♯4', kind: 'identify' as const, from: p('C4'), to: p('D#4') },
      { qid: 'b', label: 'C4에서 E♭4', kind: 'identify' as const, from: p('C4'), to: p('Eb4') },
    ],
  };

  it('C4–D♯4는 증2도, C4–E♭4는 단3도다. 세 반음이라고 같게 채점하지 않는다', () => {
    const ok = evaluateInterval(spec, { type: 'interval', answers: { a: { diatonicNumber: 2, quality: 'augmented' }, b: { diatonicNumber: 3, quality: 'minor' } } });
    expect(ok.passed).toBe(true);
    const swapped = evaluateInterval(spec, { type: 'interval', answers: { a: { diatonicNumber: 3, quality: 'minor' }, b: { diatonicNumber: 2, quality: 'augmented' } } });
    expect(codes(swapped)).toEqual(['WRONG_INTERVAL', 'WRONG_INTERVAL']);
    expect(texts(swapped)[0]).toBe('C4에서 D♯4: 목표는 증2도. 지금 고른 것은 단3도.');
  });

  it('도수와 성질로 음을 만드는 과제: 같은 소리의 다른 이름은 이름이 다르다고 알려 준다', () => {
    const build = { type: 'interval' as const, questions: [{ qid: 'x', label: 'C4 위로 단3도', kind: 'build' as const, from: p('C4'), diatonicNumber: 3, quality: 'minor' as const }] };
    expect(evaluateInterval(build, { type: 'interval', answers: { x: { pitch: p('Eb4') } } }).passed).toBe(true);
    const wrong = evaluateInterval(build, { type: 'interval', answers: { x: { pitch: p('D#4') } } });
    expect(codes(wrong)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
  });

  it('설계서 5.8의 음정 표를 판정이 그대로 따른다', () => {
    const rows: Array<[string, string, number, 'major' | 'minor' | 'perfect']> = [
      ['D4', 'F#4', 3, 'major'],
      ['E4', 'B4', 5, 'perfect'],
      ['F4', 'Bb4', 4, 'perfect'],
      ['E4', 'G#4', 3, 'major'],
      ['E4', 'F4', 2, 'minor'],
      ['C4', 'D4', 2, 'major'],
    ];
    for (const [a, b, n, q] of rows) {
      const spec2 = { type: 'interval' as const, questions: [{ qid: 'q', label: `${a}에서 ${b}`, kind: 'identify' as const, from: p(a), to: p(b) }] };
      expect(evaluateInterval(spec2, { type: 'interval', answers: { q: { diatonicNumber: n, quality: q } } }).passed, `${a}-${b}`).toBe(true);
    }
  });

  it('답이 없거나 질문과 답의 종류가 다르면 맞다고 하지 않는다', () => {
    const r = evaluateInterval(spec, { type: 'interval', answers: { a: { pitch: p('C4') } } });
    expect(codes(r)).toEqual(['MISSING_PLACEMENT', 'MISSING_PLACEMENT']);
  });
});

// ---------------------------------------------------------------------------
describe('Q02 쉼이 있는 한 마디 (rhythmPlacement)', () => {
  const expected: Score = baseScore({
    events: [note('n1', 0, 0, 960, 'C4'), rest('r1', 0, 960, 960), note('n2', 0, 1920, 960, 'D4'), note('n3', 0, 2880, 960, 'E4')],
  });
  const spec = { type: 'rhythmPlacement' as const, voiceId: 'v1', requirePitch: true };
  const run = (events: Score['events'], s = spec) => evaluateRhythmPlacement(s, expected, { type: 'rhythmPlacement', score: baseScore({ events }) });

  it('정답은 통과한다', () => {
    expect(run(expected.events).passed).toBe(true);
  });

  it('합만 맞는 오답은 실패한다: 쉼표가 둘째 박이 아니라 셋째 박에 있다', () => {
    const r = run([note('a', 0, 0, 960, 'C4'), note('b', 0, 960, 960, 'D4'), rest('c', 0, 1920, 960), note('d', 0, 2880, 960, 'E4')]);
    expect(r.passed).toBe(false);
    expect(codes(r)).toEqual(['REST_EXPECTED_NOTE_FOUND', 'NOTE_EXPECTED_REST_FOUND']); // 마디의 합은 맞아서 합 문제는 없다
    expect(texts(r)[0]).toBe('두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.');
    expect(texts(r)[1]).toBe('세 번째 박에는 D4가 울려야 해요. 지금은 쉼이에요.');
  });

  it('쉼표를 빼고 세 음만 놓으면 쉼표 자리를 먼저 알려 준다', () => {
    const r = run([note('a', 0, 0, 960, 'C4'), note('b', 0, 960, 960, 'D4'), note('c', 0, 1920, 960, 'E4')]);
    expect(r.passed).toBe(false);
    expect(texts(r)[0]).toBe('두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.');
    expect(codes(r)).toContain('MEASURE_TICKS_REMAIN');
  });

  it('마지막 음이 8분음표면 한 마디에서 480틱이 남는다고 알려 준다', () => {
    const r = run([note('a', 0, 0, 960, 'C4'), rest('b', 0, 960, 960), note('c', 0, 1920, 960, 'D4'), note('d', 0, 2880, 480, 'E4')]);
    expect(r.passed).toBe(false);
    expect(codes(r)).toEqual(['DURATION_MISMATCH', 'MEASURE_TICKS_REMAIN']);
    expect(texts(r)).toEqual(['네 번째 박: 목표는 4분음표 하나 길이, 지금은 8분음표 하나 길이.', '한 마디에서 480틱이 남아요. 8분음표 하나 길이예요.']);
  });

  it('마디가 넘치면 넘친 틱을 알려 준다', () => {
    const r = run([note('a', 0, 0, 960, 'C4'), rest('b', 0, 960, 960), note('c', 0, 1920, 960, 'D4'), note('d', 0, 2880, 1920, 'E4')]);
    expect(codes(r)).toContain('MEASURE_TICKS_OVER');
    expect(texts(r).join(' ')).toContain('한 마디가 960틱 넘쳐요. 4분음표 하나 길이예요.');
  });

  it('음이 바뀌면 음높이 문제라고 알려 준다. 음높이를 요구하지 않는 과제면 통과한다', () => {
    const swapped = [note('a', 0, 0, 960, 'C4'), rest('b', 0, 960, 960), note('c', 0, 1920, 960, 'E4'), note('d', 0, 2880, 960, 'D4')];
    expect(codes(run(swapped))).toEqual(['PITCH_MISMATCH', 'PITCH_MISMATCH']);
    expect(run(swapped, { ...spec, requirePitch: false }).passed).toBe(true);
  });

  it('아무것도 놓지 않으면 하나의 설명만 한다', () => {
    const r = run([]);
    expect(codes(r)).toEqual(['MISSING_VOICE']);
  });

  it('목표에 없는 사건과 겹친 사건을 알려 준다', () => {
    const extra = run([...expected.events, note('x', 1, 0, 960, 'G4')]);
    expect(codes(extra)).toContain('EXTRA_EVENT');
    const overlap = run([note('a', 0, 0, 1920, 'C4'), rest('b', 0, 960, 960), note('c', 0, 1920, 960, 'D4'), note('d', 0, 2880, 960, 'E4')]);
    expect(codes(overlap)).toContain('OVERLAP');
  });

  it('조표와 임시표는 판정기가 직접 풀어 비교한다', () => {
    const keyed = baseScore({ staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }], events: [note('a', 0, 0, 3840, 'F4', { accidental: null })] });
    const sameSound = baseScore({ staves: [{ staffId: 's1', clef: 'treble', keySignature: 0 }], events: [note('a', 0, 0, 3840, 'F#4')] });
    const r = evaluateRhythmPlacement({ type: 'rhythmPlacement', voiceId: 'v1', requirePitch: true }, keyed, { type: 'rhythmPlacement', score: sameSound });
    expect(r.passed).toBe(true); // F♯4로 같은 음이다
  });
});

// ---------------------------------------------------------------------------
describe('Q03 짧은 음과 셋잇단음 (rhythmPlacement)', () => {
  const thirtySeconds = (prefix: string, pitch: string) => Array.from({ length: 8 }, (_, i) => note(`${prefix}${i + 1}`, 0, i * 120, 120, pitch));
  const tuplet = { groupId: 'g1', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth' as const, eventIds: ['t1', 't2', 't3'] };
  const target: Score = baseScore({
    events: [
      ...thirtySeconds('s', 'C4'),
      note('t1', 0, 960, 320, 'D4', { groupId: 'g1' }),
      note('t2', 0, 1280, 320, 'E4', { groupId: 'g1' }),
      note('t3', 0, 1600, 320, 'F4', { groupId: 'g1' }),
      rest('r', 0, 1920, 1920),
    ],
    tuplets: [tuplet],
  });
  const spec = { type: 'rhythmPlacement' as const, voiceId: 'v1', requirePitch: true };
  const run = (user: Score) => evaluateRhythmPlacement(spec, target, { type: 'rhythmPlacement', score: user });

  it('목표 악보 자체가 정상이다(마디가 꽉 차고 셋잇단은 320틱 셋)', async () => {
    const { validateScore } = await import('@/domain/score');
    expect(validateScore(target, { requireFullMeasures: true })).toEqual([]);
  });

  it('정답은 통과한다', () => {
    expect(run(target).passed).toBe(true);
  });

  it('셋잇단 표시만 붙인 480틱 음 세 개는 실패한다', () => {
    const fake: Score = baseScore({
      events: [
        ...thirtySeconds('s', 'C4'),
        note('t1', 0, 960, 480, 'D4', { groupId: 'g1' }),
        note('t2', 0, 1440, 480, 'E4', { groupId: 'g1' }),
        note('t3', 0, 1920, 480, 'F4', { groupId: 'g1' }),
        rest('r', 0, 2400, 1440),
      ],
      tuplets: [tuplet],
    });
    const r = run(fake);
    expect(r.passed).toBe(false);
    expect(codes(r)[0]).toBe('TUPLET_DURATION');
    expect(texts(r)[0]).toBe('두 번째 박: 이 묶음에서는 각 음이 320틱이에요. 묶음 전체는 4분음표 하나 길이여야 해요.');
    // 같은 묶음의 뒤 사건은 따로 말하지 않는다
    expect(codes(r).filter((c) => c === 'TUPLET_DURATION')).toHaveLength(1);
  });

  it('320틱으로 놓았지만 셋잇단 묶음 표시가 없으면 묶음이 다르다고 알려 준다', () => {
    const noGroup: Score = baseScore({
      events: [
        ...thirtySeconds('s', 'C4'),
        note('t1', 0, 960, 320, 'D4'),
        note('t2', 0, 1280, 320, 'E4'),
        note('t3', 0, 1600, 320, 'F4'),
        rest('r', 0, 1920, 1920),
      ],
    });
    const r = run(noGroup);
    expect(codes(r)[0]).toBe('TUPLET_MISMATCH');
    expect(texts(r)[0]).toContain('8분음표 셋잇단음표');
  });

  it('32분쉼표(120틱)가 들어 있으면 그 자리를 알려 준다', () => {
    const events: Score['events'] = [...thirtySeconds('s', 'C4')];
    events[1] = rest('s2', 0, 120, 120);
    const user: Score = baseScore({
      events: [...events, ...target.events.slice(8)],
      tuplets: [tuplet],
    });
    const r = run(user);
    expect(codes(r)).toEqual(['NOTE_EXPECTED_REST_FOUND']);
    expect(texts(r)[0]).toBe('첫 번째 박 안쪽에는 C4가 울려야 해요. 지금은 쉼이에요.');
  });

  it('32분음표 일곱 개면 120틱이 남는다고 32분음표 하나 길이로 알려 준다', () => {
    const user: Score = baseScore({ events: [...thirtySeconds('s', 'C4').slice(0, 7), ...target.events.slice(8)], tuplets: [tuplet] });
    const r = run(user);
    expect(codes(r)).toContain('MEASURE_TICKS_REMAIN');
    expect(texts(r).join(' ')).toContain('한 마디에서 120틱이 남아요. 32분음표 하나 길이예요.');
  });
});

// ---------------------------------------------------------------------------
describe('Q05 장3화음 조립하기 (triadMembership)', () => {
  const cMajor: TriadMembershipSpec = { type: 'triadMembership', requiredPitchClasses: [0, 4, 7], requiredSpellings: [{ letter: 'C', alter: 0 }, { letter: 'E', alter: 0 }, { letter: 'G', alter: 0 }] };
  const fMajor: TriadMembershipSpec = { type: 'triadMembership', requiredPitchClasses: [5, 9, 0], requiredSpellings: [{ letter: 'F', alter: 0 }, { letter: 'A', alter: 0 }, { letter: 'C', alter: 0 }] };
  const bells = (...names: string[]) => ({ type: 'triadMembership' as const, notes: names.map((n, i) => ({ slotId: `b${i}`, pitch: p(n) })) });

  it('C E G와 F A C는 통과한다', () => {
    expect(evaluateTriadMembership(cMajor, bells('C4', 'E4', 'G4')).passed).toBe(true);
    expect(evaluateTriadMembership(fMajor, bells('F3', 'A3', 'C4')).passed).toBe(true);
  });

  it('C E G D는 실패한다: D가 구성음이 아니다', () => {
    const r = evaluateTriadMembership(cMajor, bells('C4', 'E4', 'G4', 'D4'));
    expect(r.passed).toBe(false);
    expect(codes(r)).toEqual(['EXTRA_NOTE']);
    expect(texts(r)[0]).toBe('D가 더해져 있어요. 이 화음의 구성음이 아니에요.');
  });

  it('C E E는 실패한다: G가 빠지고 E가 겹친다', () => {
    const r = evaluateTriadMembership(cMajor, bells('C4', 'E4', 'E5'));
    expect(codes(r)).toEqual(['MISSING_TONE', 'DUPLICATE_TONE']);
    expect(texts(r)).toEqual(['G가 빠졌어요.', 'E를 겹쳐 놓았어요. 이 도전에서는 같은 음을 겹치지 않아요.']);
  });

  it('C E D는 "G가 빠졌고 D가 추가되어" 있다고 둘 다 말한다', () => {
    const r = evaluateTriadMembership(cMajor, bells('C4', 'E4', 'D4'));
    expect(texts(r).sort()).toEqual(['D가 더해져 있어요. 이 화음의 구성음이 아니에요.', 'G가 빠졌어요.'].sort());
  });

  it('가로 순서와 옥타브는 보지 않는다', () => {
    expect(evaluateTriadMembership(cMajor, bells('G2', 'C6', 'E3')).passed).toBe(true);
    expect(evaluateTriadMembership(cMajor, bells('C3', 'E4', 'G5')).passed).toBe(true);
  });

  it('음을 놓지 않았거나 개수가 다르면 알려 준다', () => {
    expect(codes(evaluateTriadMembership(cMajor, bells()))).toEqual(['NOTE_COUNT']);
    const four = { ...cMajor, allowDoubling: true };
    expect(codes(evaluateTriadMembership(four, bells('C4', 'E4', 'G4', 'C5')))).toEqual(['NOTE_COUNT']); // 3개를 놓는 도전
    expect(evaluateTriadMembership({ ...four, noteCount: 4 }, bells('C4', 'E4', 'G4', 'C5')).passed).toBe(true);
  });

  it('다른 화음의 구성음은 실패한다: G B D는 C장3화음이 아니다', () => {
    expect(evaluateTriadMembership(cMajor, bells('G3', 'B3', 'D4')).passed).toBe(false);
  });
});

describe('Q20·Q22 단·감·증3화음 (같은 판정기, 데이터만 다르다)', () => {
  const cMinor: TriadMembershipSpec = { type: 'triadMembership', requiredPitchClasses: [0, 3, 7], requiredSpellings: [{ letter: 'C', alter: 0 }, { letter: 'E', alter: -1 }, { letter: 'G', alter: 0 }] };
  const bDim: TriadMembershipSpec = { type: 'triadMembership', requiredPitchClasses: [11, 2, 5], requiredSpellings: [{ letter: 'B', alter: 0 }, { letter: 'D', alter: 0 }, { letter: 'F', alter: 0 }] };
  const cAug: TriadMembershipSpec = { type: 'triadMembership', requiredPitchClasses: [0, 4, 8], requiredSpellings: [{ letter: 'C', alter: 0 }, { letter: 'E', alter: 0 }, { letter: 'G', alter: 1 }] };
  const bells = (...names: string[]) => ({ type: 'triadMembership' as const, notes: names.map((n) => ({ pitch: p(n) })) });

  it('C단3화음은 C E♭ G, 장3화음의 E는 구성음 밖이라고 알려 준다', () => {
    expect(evaluateTriadMembership(cMinor, bells('C4', 'Eb4', 'G4')).passed).toBe(true);
    const r = evaluateTriadMembership(cMinor, bells('C4', 'E4', 'G4'));
    expect(texts(r).sort()).toEqual(['E가 더해져 있어요. 이 화음의 구성음이 아니에요.', 'E♭이 빠졌어요.'].sort());
  });

  it('E♭을 D♯으로 쓰면 소리는 같지만 이름이 다르다고 알려 준다', () => {
    const r = evaluateTriadMembership(cMinor, bells('C4', 'D#4', 'G4'));
    expect(codes(r)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
  });

  it('감3화음 B D F와 증3화음 C E G♯. G♯을 A♭으로 쓰면 실패한다', () => {
    expect(evaluateTriadMembership(bDim, bells('B3', 'D4', 'F4')).passed).toBe(true);
    expect(evaluateTriadMembership(cAug, bells('C4', 'E4', 'G#4')).passed).toBe(true);
    const r = evaluateTriadMembership(cAug, bells('C4', 'E4', 'Ab4'));
    expect(codes(r)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(texts(r)[0]).toBe('화음: 소리 높이는 같지만 이름이 달라요. 지금은 A♭, 목표는 G♯이에요.');
  });

  it('X-3 화음 여러 개의 순서 판정: 사건 목록을 차례로 판정한다', () => {
    const progression = [
      { name: '으뜸화음', spec: { type: 'triadMembership' as const, requiredPitchClasses: [0, 4, 7] }, notes: ['C4', 'E4', 'G4'] },
      { name: '버금딸림화음', spec: { type: 'triadMembership' as const, requiredPitchClasses: [5, 9, 0] }, notes: ['F3', 'A3', 'C4'] },
      { name: '딸림화음', spec: { type: 'triadMembership' as const, requiredPitchClasses: [7, 11, 2] }, notes: ['G3', 'B3', 'D4'] },
      { name: '으뜸화음', spec: { type: 'triadMembership' as const, requiredPitchClasses: [0, 4, 7] }, notes: ['C4', 'E4', 'G4'] },
    ];
    expect(progression.every((s) => evaluateTriadMembership(s.spec, bells(...s.notes)).passed)).toBe(true);
    // 세 번째를 버금딸림화음으로 건 경우는 그 화음만 실패한다
    const results = progression.map((s, i) => evaluateTriadMembership(s.spec, bells(...(i === 2 ? ['F3', 'A3', 'C4'] : s.notes))).passed);
    expect(results).toEqual([true, true, false, true]);
  });
});

// ---------------------------------------------------------------------------
describe('Q06 전위 (inversion)', () => {
  const fMajor = (target: 'root' | 'first' | 'second') => ({
    type: 'inversion' as const,
    tones: [{ letter: 'F' as const, alter: 0 }, { letter: 'A' as const, alter: 0 }, { letter: 'C' as const, alter: 0 }] as [{ letter: 'F'; alter: number }, { letter: 'A'; alter: number }, { letter: 'C'; alter: number }],
    targetInversion: target,
  });
  const cMajor = (target: 'root' | 'first' | 'second') => ({
    type: 'inversion' as const,
    tones: [{ letter: 'C' as const, alter: 0 }, { letter: 'E' as const, alter: 0 }, { letter: 'G' as const, alter: 0 }] as [{ letter: 'C'; alter: number }, { letter: 'E'; alter: number }, { letter: 'G'; alter: number }],
    targetInversion: target,
  });
  const bells = (...items: Array<string | [string, boolean]>) => ({
    type: 'inversion' as const,
    notes: items.map((it) => (Array.isArray(it) ? { pitch: p(it[0]), active: it[1] } : { pitch: p(it) })),
  });

  it('F장3화음의 세 자리(설계서 5.8)를 각각 알아본다', () => {
    expect(evaluateInversion(fMajor('root'), bells('F3', 'A3', 'C4')).passed).toBe(true);
    expect(evaluateInversion(fMajor('first'), bells('A3', 'C4', 'F4')).passed).toBe(true);
    expect(evaluateInversion(fMajor('second'), bells('C4', 'F4', 'A4')).passed).toBe(true);
    expect(evaluateInversion(fMajor('root'), bells('F3', 'A3', 'C4')).details).toMatchObject({ currentInversion: 'root', bassMidi: 53 });
  });

  it('가로 순서를 바꿔도 전위는 그대로다(실제 최저음으로 정한다)', () => {
    const a = evaluateInversion(cMajor('first'), bells('E3', 'G3', 'C4'));
    const b = evaluateInversion(cMajor('first'), bells('C4', 'E3', 'G3'));
    const c = evaluateInversion(cMajor('first'), bells('G3', 'C4', 'E3'));
    expect([a.passed, b.passed, c.passed]).toEqual([true, true, true]);
    expect(a.details).toEqual(b.details);
  });

  it('목표와 다르면 가장 낮은 음과 현재 전위를 알려 준다', () => {
    const r = evaluateInversion(cMajor('root'), bells('E3', 'G3', 'C4'));
    expect(codes(r)).toEqual(['WRONG_INVERSION']);
    expect(texts(r)[0]).toBe('현재 가장 낮은 음은 E3이에요. 그래서 제1전위예요. 목표는 기본 위치예요.');
  });

  it('구성음이 모두 울리지 않으면(G를 끔) 전위를 판정하지 않고 완전한 3화음부터 확인하게 한다', () => {
    const r = evaluateInversion(cMajor('root'), bells('C3', 'E3', ['G3', false]));
    expect(r.passed).toBe(false);
    expect(codes(r)).toEqual(['INCOMPLETE_TRIAD']);
    expect(texts(r)[0]).toBe('G가 없어 완전한 3화음 조건을 먼저 확인해야 해요.');
  });

  it('꺼진 음(소리 꼬리, 껐다 켠 종)은 최저음 계산에서 빠진다', () => {
    const r = evaluateInversion(cMajor('first'), bells(['C3', false], 'E3', 'G3', 'C4'));
    expect(r.passed).toBe(true);
    expect(r.details).toMatchObject({ currentInversion: 'first', bassMidi: 52 });
  });

  it('화음 밖의 음이 울리고 있으면 알려 준다', () => {
    const r = evaluateInversion(cMajor('root'), bells('C3', 'E3', 'G3', 'D4'));
    expect(codes(r)).toEqual(['EXTRA_NOTE']);
  });

  it('G장3화음의 세 자리도 같은 규칙이다(설계서 5.8)', () => {
    const g = (t: 'root' | 'first' | 'second') => ({ type: 'inversion' as const, tones: [{ letter: 'G' as const, alter: 0 }, { letter: 'B' as const, alter: 0 }, { letter: 'D' as const, alter: 0 }] as never, targetInversion: t });
    expect(evaluateInversion(g('root'), bells('G3', 'B3', 'D4')).passed).toBe(true);
    expect(evaluateInversion(g('first'), bells('B3', 'D4', 'G4')).passed).toBe(true);
    expect(evaluateInversion(g('second'), bells('D4', 'G4', 'B4')).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Q07 장음계 배열하기 (orderedScale)', () => {
  const fMajorScore = (): Score =>
    baseScore({
      staves: [{ staffId: 's1', clef: 'treble', keySignature: -1 }],
      events: ['F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'].map((t, i) => note(`n${i + 1}`, Math.floor(i / 4), (i % 4) * 960, 960, t, { accidental: null })),
    });
  const spec: OrderedScaleSpec = { type: 'orderedScale', voiceId: 'v1', count: 8, direction: 'ascending', requireSpelling: true, requireOctave: true, midiSteps: [2, 2, 1, 2, 2, 2, 1], keyName: 'F장조' };
  const rules = [
    { code: 'WRONG_SPELLING_SAME_PITCH', template: '{positionOrdinal} 자리는 {expectedLetter} 이름을 써요. {keyName}에서는 {expectedName}예요. 소리 높이는 같아요.' },
    { code: 'WRONG_ORDER', template: '{position}번째와 {otherPosition}번째 자리의 순서가 바뀌었어요.' },
    { code: 'OCTAVE_MISMATCH', template: '마지막 음은 시작음보다 한 옥타브 위여야 해요. 지금은 {actualName:이에요}.' },
    { code: 'MISSING', template: '{position}번째 자리가 비어 있어요.' },
  ];
  const place = (...names: string[]) => ({ type: 'orderedScale' as const, placed: names.map((n, i) => ({ slot: i + 1, pitch: p(n) })) });
  const run = (...names: string[]) => evaluateOrderedScale(spec, fMajorScore(), place(...names));

  it('조표로 풀면 F장조는 F4 G4 A4 B♭4 C5 D5 E5 F5, MIDI 65 67 69 70 72 74 76 77이다', () => {
    const r = run('F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5');
    expect(r.passed).toBe(true);
    expect(r.details).toMatchObject({ expectedMidi: [65, 67, 69, 70, 72, 74, 76, 77] });
  });

  it('넷째 자리에 A♯을 놓으면 소리 높이는 같지만 B 이름을 써야 한다고 알려 준다', () => {
    const r = run('F4', 'G4', 'A4', 'A#4');
    expect(r.passed).toBe(false);
    expect(codes(r)[0]).toBe('WRONG_SPELLING_SAME_PITCH');
    expect(texts(r, rules)[0]).toBe('네 번째 자리는 B 이름을 써요. F장조에서는 B♭4예요. 소리 높이는 같아요.');
    // 나머지 다섯째~여덟째 자리는 비어 있다고 알려 준다
    expect(texts(r, rules).slice(1)).toEqual(['5번째 자리가 비어 있어요.', '6번째 자리가 비어 있어요.', '7번째 자리가 비어 있어요.', '8번째 자리가 비어 있어요.']);
  });

  it('순서가 섞이면 바뀐 두 자리를 한 문장으로 알려 준다', () => {
    const r = run('F4', 'A4', 'G4', 'Bb4', 'C5', 'D5', 'E5', 'F5');
    expect(codes(r)).toEqual(['WRONG_ORDER']);
    expect(texts(r, rules)).toEqual(['2번째와 3번째 자리의 순서가 바뀌었어요.']);
  });

  it('마지막 음이 F4이면 옥타브 문제라고 알려 준다', () => {
    const r = run('F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F4');
    expect(codes(r)).toEqual(['OCTAVE_MISMATCH']);
    expect(texts(r, rules)).toEqual(['마지막 음은 시작음보다 한 옥타브 위여야 해요. 지금은 F4예요.']);
  });

  it('조표의 B♭을 빠뜨리고 B♮을 놓으면 음이 다르다고 알려 준다', () => {
    const r = run('F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5');
    expect(codes(r)).toEqual(['WRONG_PITCH']);
  });

  it('G장조 표(5.8): F♯이 필요하고 F♮이면 실패한다', () => {
    const g = baseScore({
      staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }],
      events: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'].map((t, i) => note(`n${i + 1}`, Math.floor(i / 4), (i % 4) * 960, 960, t, { accidental: null })),
    });
    const ok = evaluateOrderedScale({ ...spec, keyName: 'G장조' }, g, place('G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5'));
    expect(ok.passed).toBe(true);
    expect(ok.details).toMatchObject({ expectedMidi: [67, 69, 71, 72, 74, 76, 78, 79] });
    const bad = evaluateOrderedScale({ ...spec, keyName: 'G장조' }, g, place('G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'));
    expect(codes(bad)).toEqual(['WRONG_PITCH']);
  });

  it('칸 번호가 목표보다 큰 곳에 놓으면 길이 문제로 알려 준다', () => {
    const r = evaluateOrderedScale(spec, fMajorScore(), { type: 'orderedScale', placed: [...place('F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5').placed, { slot: 9, pitch: p('G5') }] });
    expect(codes(r)).toEqual(['SCALE_LENGTH']);
  });

  it('목표 악보의 음 개수가 count와 다르면 콘텐츠 오류로 알린다', () => {
    expect(() => evaluateOrderedScale({ ...spec, count: 7 }, fMajorScore(), place())).toThrow(/콘텐츠 오류/);
  });

  it('옥타브나 이름을 요구하지 않는 과제는 소리 높이만 본다(X-1)', () => {
    const loose = { ...spec, requireSpelling: false, requireOctave: false };
    const r = evaluateOrderedScale(loose, fMajorScore(), place('F2', 'G6', 'A4', 'A#5', 'C3', 'D5', 'E1', 'F4'));
    expect(r.passed).toBe(true);
  });
});

describe('X-1 orderedScale 일반화: 음의 개수, 방향, 간격', () => {
  const free = (events: Score['events'], over: Partial<Score> = {}) => baseScore({ events, ...over });
  const spec = (count: number, direction: 'ascending' | 'descending'): OrderedScaleSpec => ({ type: 'orderedScale', voiceId: 'v1', count, direction, requireSpelling: true, requireOctave: true });
  const place = (...names: string[]) => ({ type: 'orderedScale' as const, placed: names.map((n, i) => ({ slot: i + 1, pitch: p(n) })) });

  it('Q12 음역 사다리: C3 E3 G3 C4 E4 G4 C5(7개)', () => {
    const names = ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5'];
    const score = quarterLine(names);
    expect(evaluateOrderedScale(spec(7, 'ascending'), score, place(...names)).passed).toBe(true);
    expect(codes(evaluateOrderedScale(spec(7, 'ascending'), score, place('C3', 'E3', 'G3', 'C4', 'E4', 'C5', 'G4')))).toEqual(['WRONG_ORDER']);
  });

  it('Q31 반음계 내림 13개', () => {
    const down = ['C5', 'B4', 'Bb4', 'A4', 'Ab4', 'G4', 'Gb4', 'F4', 'E4', 'Eb4', 'D4', 'Db4', 'C4'];
    const score = quarterLine(down);
    expect(evaluateOrderedScale(spec(13, 'descending'), score, place(...down)).passed).toBe(true);
    // 올림표로 쓴 내림 반음계는 이름이 달라 실패한다
    const sharpNames = ['C5', 'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4'];
    const r = evaluateOrderedScale(spec(13, 'descending'), score, place(...sharpNames));
    expect(r.passed).toBe(false);
    expect(new Set(codes(r))).toEqual(new Set(['WRONG_SPELLING_SAME_PITCH']));
    expect(r.issues).toHaveLength(5); // B♭ A♭ G♭ E♭ D♭ 자리에 A♯ G♯ F♯ D♯ C♯을 쓴 다섯 곳
  });

  it('Q26 다섯 음 길(C D E G A C5)은 6개를 놓는다', () => {
    const names = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'];
    expect(evaluateOrderedScale(spec(6, 'ascending'), quarterLine(names), place(...names)).passed).toBe(true);
  });

  it('Q25 화성단음계 A3…G♯4 A4(설계서 5.8)', () => {
    const names = ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4', 'A4'];
    const score = free(names.map((n, i) => note(`n${i + 1}`, Math.floor(i / 4), (i % 4) * 960, 960, n)));
    const r = evaluateOrderedScale(spec(8, 'ascending'), score, place(...names));
    expect(r.passed).toBe(true);
    expect(r.details).toMatchObject({ expectedMidi: [57, 59, 60, 62, 64, 65, 68, 69] });
  });
});

describe('X-4 Q30 마디 안의 임시표: 해석한 MIDI 열을 비교한다', () => {
  const g: Score = baseScore({
    staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }],
    events: [
      note('a', 0, 0, 960, 'F4', { accidental: null }),
      note('b', 0, 960, 960, 'F4', { accidental: 'natural' }),
      note('c', 0, 1920, 960, 'F4', { accidental: null }),
      note('d', 1, 0, 960, 'F4', { accidental: null }),
    ],
  });
  const spec: OrderedScaleSpec = { type: 'orderedScale', voiceId: 'v1', count: 4, direction: 'ascending', requireSpelling: false, requireOctave: true, slotLabel: '깃발' };
  const flags = (...midis: number[]) => ({ type: 'orderedScale' as const, placed: midis.map((m, i) => ({ slot: i + 1, midi: m })) });

  it('깃발을 66, 65, 65, 66번 널에 꽂으면 통과한다', () => {
    const r = evaluateOrderedScale(spec, g, flags(66, 65, 65, 66));
    expect(r.passed).toBe(true);
    expect(r.details).toMatchObject({ expectedMidi: [66, 65, 65, 66] });
  });

  it('둘째 깃발을 66에 꽂으면(제자리표를 무시) 그 깃발을 알려 준다', () => {
    const r = evaluateOrderedScale(spec, g, flags(66, 66, 65, 66));
    expect(codes(r)).toEqual(['PITCH_MISMATCH']);
    expect(texts(r)[0]).toBe('두 번째 깃발: 목표는 F4예요. 지금은 F♯4예요.');
  });

  it('셋째 깃발을 66에 꽂으면(같은 마디의 기억을 무시) 알려 준다', () => {
    expect(codes(evaluateOrderedScale(spec, g, flags(66, 65, 66, 66)))).toEqual(['PITCH_MISMATCH']);
  });
});

// ---------------------------------------------------------------------------
describe('Q08 선택한 짧은 곡 완성하기 (scoreArrangement)', () => {
  const two = (): Score =>
    baseScore({
      staves: [
        { staffId: 's1', clef: 'treble', keySignature: 0 },
        { staffId: 's2', clef: 'bass', keySignature: 0 },
      ],
      voices: [
        { voiceId: 'v1', staffId: 's1', label: '위 성부' },
        { voiceId: 'v2', staffId: 's2', label: '아래 성부' },
      ],
      events: [
        ...['C5', 'D5', 'E5', 'C5'].map((t, m) => note(`u${m}`, m, 0, 3840, t)),
        ...['C3', 'G2', 'C3', 'C3'].map((t, m) => note(`l${m}`, m, 0, 3840, t, { voice: 'v2', staff: 's2' })),
      ],
    });
  const oneVoice = { type: 'scoreArrangement' as const, voices: [{ voiceId: 'v1', label: '위 성부' }] };
  const twoVoices = { type: 'scoreArrangement' as const, voices: [{ voiceId: 'v1', label: '위 성부' }, { voiceId: 'v2', label: '아래 성부' }] };
  const input = (s: Score) => ({ type: 'scoreArrangement' as const, score: s });

  it('한 성부는 4마디 × 3840틱 = 15360틱이다', () => {
    expect(4 * measureTicks('4/4')).toBe(15360);
    const r = evaluateScoreArrangement(oneVoice, two(), input(two()));
    expect(r.passed).toBe(true);
    expect(r.details).toMatchObject({ perVoice: { v1: true } });
  });

  it('두 성부 판본 정답은 통과한다', () => {
    expect(evaluateScoreArrangement(twoVoices, two(), input(two())).passed).toBe(true);
  });

  it('한 성부만 끝낸 것은 두 성부를 끝낸 것이 아니다', () => {
    const onlyUpper: Score = { ...two(), events: two().events.filter((e) => e.voiceId === 'v1') };
    expect(evaluateScoreArrangement(oneVoice, two(), input(onlyUpper)).passed).toBe(true); // 한 성부 판본이면 통과
    const r = evaluateScoreArrangement(twoVoices, two(), input(onlyUpper)); // 두 성부 판본이면 실패
    expect(r.passed).toBe(false);
    expect(codes(r)).toEqual(['MISSING_VOICE']);
    expect(texts(r)).toEqual(['아래 성부가 아직 없어요.']);
    expect(r.details).toMatchObject({ perVoice: { v1: true, v2: false } });
  });

  it('성부를 맞바꿔 놓으면 성부별로 비교해서 실패한다', () => {
    const s = two();
    const swapped: Score = {
      ...s,
      events: s.events.map((e) => (e.type === 'note' && e.voiceId === 'v1' ? { ...e, voiceId: 'v2', staffId: 's2' } : e.type === 'note' && e.voiceId === 'v2' ? { ...e, voiceId: 'v1', staffId: 's1' } : e)),
    };
    expect(evaluateScoreArrangement(twoVoices, s, input(swapped)).passed).toBe(false);
  });

  it('틀린 곳은 성부 이름과 마디, 박을 붙여 알려 준다', () => {
    const s = two();
    const wrong: Score = { ...s, events: s.events.map((e) => (e.eventId === 'l2' ? note('l2', 2, 0, 3840, 'D3', { voice: 'v2', staff: 's2' }) : e)) };
    const r = evaluateScoreArrangement(twoVoices, s, input(wrong));
    expect(codes(r)).toEqual(['PITCH_MISMATCH']);
    expect(texts(r)[0]).toBe('아래 성부의 3번째 마디의 첫 번째 박: 목표는 C3이에요. 지금은 D3이에요.');
    expect(r.issues[0]!.target?.voiceId).toBe('v2');
  });

  it('마디가 비었거나 덜 찬 곳은 성부 이름을 붙여 남은 틱을 알려 준다', () => {
    const s = two();
    const short: Score = { ...s, events: s.events.map((e) => (e.eventId === 'u3' ? note('u3', 3, 0, 1920, 'C5') : e)) };
    const r = evaluateScoreArrangement(twoVoices, s, input(short));
    expect(codes(r)).toEqual(['DURATION_MISMATCH', 'MEASURE_TICKS_REMAIN']);
    expect(texts(r)[1]).toBe('위 성부의 4번째 마디에서 1920틱이 남아요. 2분음표 하나 길이예요.');
  });
});

// ---------------------------------------------------------------------------
describe('판정기 공통 성질', () => {
  it('판정기는 여덟 종류다(설계서의 일곱 + 확장 X-3의 chordSequence)', () => {
    expect(EVALUATOR_TYPES).toHaveLength(8);
    expect(EVALUATOR_TYPES).toContain('chordSequence');
  });

  it('입력을 바꾸지 않고, 같은 입력에는 같은 결과를 낸다', () => {
    const expected = quarterLine(['C4', 'D4', 'E4', 'F4']);
    const input = { type: 'rhythmPlacement' as const, score: quarterLine(['C4', 'D4', 'E4']) };
    const before = JSON.stringify(input);
    const a = evaluate({ type: 'rhythmPlacement', voiceId: 'v1', requirePitch: true }, input, expected);
    const b = evaluate({ type: 'rhythmPlacement', voiceId: 'v1', requirePitch: true }, input, expected);
    expect(JSON.stringify(input)).toBe(before);
    expect(a).toEqual(b);
  });

  it('화면 좌표·프레임 시간·걸은 시간 같은 값이 입력에 섞여 있어도 결과가 같다(W-3)', () => {
    const spec: PitchSpellingSpec = { type: 'pitchSpelling', targets: [{ slotId: 'a', label: '자리', expected: p('C4') }] };
    const clean = evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [{ slotId: 'a', pitch: p('D4') }] });
    const noisy = evaluatePitchSpelling(spec, { type: 'pitchSpelling', placed: [{ slotId: 'a', pitch: p('D4'), pixelX: 412, frameTime: 33.3, walkedMs: 91000 } as never] });
    expect(noisy).toEqual(clean);
  });

  it('종류가 다른 입력을 넣으면 오류를 낸다. 점수 악보가 필요한데 없으면 오류를 낸다', () => {
    expect(() => evaluate({ type: 'pitchSpelling', targets: [] }, { type: 'interval', answers: {} })).toThrow(/종류가 달라요/);
    expect(() => evaluate({ type: 'rhythmPlacement', voiceId: 'v1', requirePitch: true }, { type: 'rhythmPlacement', score: baseScore() })).toThrow(/목표 악보/);
  });

  it('모든 설명 코드는 렌더링되어 빈 자리 표시가 남지 않는다(대표 사례)', () => {
    const issue: Issue = { code: 'WRONG_PITCH', params: { where: '첫 칸', actualName: 'D4', expectedName: 'C4' } };
    expect(renderFeedback(issue)).not.toMatch(/\{/);
  });
});
