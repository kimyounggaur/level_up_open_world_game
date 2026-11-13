// 1-6 과제 데이터 형식, 검사 도구, Q01–Q08 데이터. 틀린 데이터를 넣으면 검사가 실패해야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentCatalog, STATE_LABEL_KO } from '@/domain/catalog';
import { FREE_QUEST_PREFIX, FREE_VARIANT_ID, PANEL_IDS, freeHashFor, freeInstallationOfHash, freeQuestId, isFreeQuestId, practiceLinksOf, validateQuestDefinition, validateQuestSet, validateReviewLog } from '@/domain/content';
import type { ContentIssue, QuestDefinition } from '@/domain/content';
import { evaluate, expectedPitchesOf } from '@/domain/evaluators';
import type { EvaluatorInput } from '@/domain/evaluators';
import { renderAll } from '@/domain/feedback';
import { isNote } from '@/domain/score';
import { validateContentDir } from '../../tools/content-loader';
import { answerInput } from './answers';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readQuest = (id: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8'));
/** 설계서 부록 A.0의 Q01–Q08 */
const ALL = [
  'pitch.same-note-two-clefs',
  'rhythm.rest-in-a-bar',
  'rhythm.short-notes-and-triplets',
  'pitch.same-sound-different-names',
  'chord.major-triad',
  'chord.inversion',
  'scale.major',
  'song.short-piece',
];
/** 6단계에서 더한 과제(Q13–Q19, 박자 강가의 징검다리와 잔물결 수로, 물레방아). 만든 만큼만 올린다 */
const BEAT_RIVER = ['rhythm.three-four', 'rhythm.note-values', 'rhythm.dotted', 'rhythm.rest-lengths', 'rhythm.sixteenths', 'rhythm.triplets', 'rhythm.six-eight'];
/** 6단계에서 더한 종나무 숲의 새 과제(Q20–Q23). Q05·Q06은 범위 A의 과제에 종나무 배치를 더한 것이다 */
const BELL_GROVE = ['chord.major-and-minor', 'chord.primary-triads', 'chord.diminished-augmented', 'chord.progression-walk'];
/** 7단계에서 더한 오선 언덕의 새 과제(Q09–Q12). 계단밭(T5)에 놓는다 */
const STAFF_HILL = ['staff.lines-and-spaces', 'staff.ledger-lines', 'staff.middle-c-neighbors', 'staff.range-ladder'];
/** 7단계에서 더한 음계 길의 새 과제(Q24–Q26). 디딤돌 길(T1) 세 곳 중 단음계 길(S2)과 다섯 음 길(S3)에 놓는다 */
const SCALE_TRAIL = ['scale.natural-minor', 'scale.harmonic-minor', 'scale.pentatonic'];
/** 7단계에서 더한 건반 늪의 새 과제(Q27–Q31). 건반 다리(T6) 세 곳과 반음 계단(T1)에 놓는다. Q04는 범위 A의 과제에 건반 다리 배치를 더한 것이다 */
const KEY_MARSH = ['key.black-key-names', 'key.whole-and-half-steps', 'key.build-intervals', 'key.accidentals-in-a-bar', 'scale.chromatic'];
/** 지금 content/quests에 있는 모든 과제: 범위 A의 여덟 과제와 6단계·7단계에서 더한 것 */
const BUILT = [...ALL, ...BEAT_RIVER, ...BELL_GROVE, ...STAFF_HILL, ...SCALE_TRAIL, ...KEY_MARSH];
const codes = (issues: ContentIssue[]): string[] => issues.map((i) => i.code);

/** 콘텐츠가 가리키는 설치물(content/installations). 검사 도구는 폴더에서 읽지만, 단위 검사는 같은 이름을 직접 준다 */
const KNOWN_INSTALLATIONS = new Set([
  'inst.village.scale-stones',
  'inst.village.ensemble-stage',
  'inst.beat-river.first-ford',
  'inst.beat-river.long-short',
  'inst.beat-river.ripple-channel',
  'inst.beat-river.waterwheel',
  'inst.bell-grove.three-bells',
  'inst.bell-grove.bright-dark',
  'inst.bell-grove.bell-tower',
  'inst.bell-grove.three-pillars',
  'inst.staff-hill.treble-terrace',
  'inst.staff-hill.bass-terrace',
  'inst.staff-hill.middle-ledge',
  'inst.scale-trail.major-path',
  'inst.scale-trail.minor-path',
  'inst.scale-trail.pentatonic-path',
  'inst.key-marsh.key-bridge',
  'inst.key-marsh.interval-rope',
  'inst.key-marsh.natural-bridge',
  'inst.key-marsh.chromatic-path',
]);
const panelPlacement = (q: Record<string, any>): Record<string, any> => q.placements.find((x: Record<string, any>) => x.kind === 'panel');

/** 원본을 복제해 고친 뒤 검사한다 */
function check(id: string, mutate: (q: Record<string, any>) => void, ctx: Parameters<typeof validateQuestDefinition>[1] = { installationIds: KNOWN_INSTALLATIONS }): ContentIssue[] {
  const q = readQuest(id);
  mutate(q);
  return validateQuestDefinition(q, ctx);
}

describe('실제 content 폴더', () => {
  it('Q01–Q08과 6단계·7단계에서 더한 과제의 데이터와 검수 대장이 검사를 통과한다', () => {
    expect(validateContentDir(root)).toEqual([]);
  });

  it('과제 파일 이름이 questId와 같고 설계서 부록 A.0의 id(Q01–Q08)와 5.3의 id(Q09–Q12), 5.4의 id(Q13–Q19), 5.5의 id(Q20–Q23), 5.6의 id(Q24–Q26), 5.7의 id(Q27–Q31)를 쓴다', () => {
    const ids = fs.readdirSync(path.join(root, 'content', 'quests')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(ids).toEqual([...BUILT].sort());
    expect(readQuest('pitch.same-note-two-clefs').projectId).toBe('levelup-music-world');
  });

  it('아직 사람이 확인하지 않은 것은 모두 draft와 pending이다(자동으로 공개 상태로 바꾸지 않는다)', () => {
    for (const id of BUILT) {
      const q = readQuest(id);
      expect(q.availability).toBe('draft');
      for (const s of q.sourceRefs) {
        expect(s.reviewStatus).toBe('unreviewed');
        expect(s.rightsStatus).toBe('unconfirmed');
      }
    }
    const log = JSON.parse(fs.readFileSync(path.join(root, 'content', 'sources', 'review-log.json'), 'utf-8')) as Array<{ status: string }>;
    expect(log).toHaveLength(BUILT.length * 3); // 과제마다 음악 검수, 플레이 검수, 권리 승인
    expect(log.every((e) => e.status === 'pending')).toBe(true);
  });
});

describe('Q07 장음계: 설계서 5.8의 수치와 독립적으로 대조', () => {
  const table: Record<string, number[]> = {
    'c-major': [60, 62, 64, 65, 67, 69, 71, 72],
    'f-major': [65, 67, 69, 70, 72, 74, 76, 77],
    'g-major': [67, 69, 71, 72, 74, 76, 78, 79],
    'd-major': [62, 64, 66, 67, 69, 71, 73, 74],
    'bflat-major': [58, 60, 62, 63, 65, 67, 69, 70],
  };
  const q = readQuest('scale.major');
  it.each(Object.entries(table))('%s', (vid, midis) => {
    const v = q.variants[vid];
    expect(expectedPitchesOf(v.score, 'v1').map((x) => x.midi)).toEqual(midis);
    expect(v.evaluatorSpec.midiSteps).toEqual([2, 2, 1, 2, 2, 2, 1]);
  });

  it('G장조는 F♯, D장조는 F♯과 C♯, B♭장조는 B♭과 E♭이 조표로 풀린다', () => {
    const names = (vid: string) => expectedPitchesOf(q.variants[vid].score, 'v1').map((x) => `${x.letter}${x.alter === 1 ? '♯' : x.alter === -1 ? '♭' : ''}${x.octave}`);
    expect(names('g-major')).toEqual(['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5']);
    expect(names('d-major')).toEqual(['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5', 'D5']);
    expect(names('bflat-major')).toEqual(['B♭3', 'C4', 'D4', 'E♭4', 'F4', 'G4', 'A4', 'B♭4']);
  });
});

describe('Q24–Q26 음계 길: 설계서 5.8의 수치와 독립적으로 대조', () => {
  // 설계서 5.8의 표를 그대로 옮긴 값이다(코드가 계산한 값을 정답으로 삼지 않는다)
  const table: Array<[string, string, number[], number[]]> = [
    ['scale.natural-minor', 'a-minor', [57, 59, 60, 62, 64, 65, 67, 69], [2, 1, 2, 2, 1, 2, 2]],
    ['scale.natural-minor', 'd-minor', [62, 64, 65, 67, 69, 70, 72, 74], [2, 1, 2, 2, 1, 2, 2]],
    ['scale.natural-minor', 'e-minor', [64, 66, 67, 69, 71, 72, 74, 76], [2, 1, 2, 2, 1, 2, 2]],
    ['scale.harmonic-minor', 'a-harmonic-minor', [57, 59, 60, 62, 64, 65, 68, 69], [2, 1, 2, 2, 1, 3, 1]],
    ['scale.pentatonic', 'c-pentatonic', [60, 62, 64, 67, 69, 72], [2, 2, 3, 2, 3]],
  ];
  const nameOf = (x: { letter: string; alter: number; octave: number }): string => `${x.letter}${x.alter === 1 ? '♯' : x.alter === -1 ? '♭' : ''}${x.octave}`;
  it.each(table)('%s/%s', (questId, vid, midis, steps) => {
    const v = readQuest(questId).variants[vid];
    expect(expectedPitchesOf(v.score, 'v1').map((x) => x.midi)).toEqual(midis);
    expect(v.evaluatorSpec.midiSteps).toEqual(steps);
    expect(v.evaluatorSpec.count).toBe(midis.length);
    expect(v.evaluatorSpec.direction).toBe('ascending');
  });

  it('D단조는 B♭, E단조는 F♯이 조표로 풀리고, A단조는 조표가 없다', () => {
    const q = readQuest('scale.natural-minor');
    const keySig = (vid: string) => q.variants[vid].score.staves[0].keySignature;
    expect([keySig('a-minor'), keySig('d-minor'), keySig('e-minor')]).toEqual([0, -1, 1]);
    const names = (vid: string) => expectedPitchesOf(q.variants[vid].score, 'v1').map(nameOf);
    expect(names('a-minor')).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    expect(names('d-minor')).toEqual(['D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5']);
    expect(names('e-minor')).toEqual(['E4', 'F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5']);
  });

  it('Q25 화성단음계의 G♯은 조표가 아니라 임시표(올림표)로 적혀 있다: 조표는 비어 있고 일곱째 음만 올림표가 붙는다', () => {
    const v = readQuest('scale.harmonic-minor').variants['a-harmonic-minor'];
    expect(v.score.staves[0].keySignature).toBe(0);
    const notes = v.score.events.filter((e: Record<string, any>) => e.type === 'note');
    expect(notes.map((e: Record<string, any>) => e.writtenPitch.accidental)).toEqual([null, null, null, null, null, null, 'sharp', null]);
    expect(expectedPitchesOf(v.score, 'v1').map(nameOf)).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G♯4', 'A4']);
  });

  it('Q26 다섯 음 음계는 6칸이다: 4/4 마디 둘 가운데 둘째 마디의 남은 두 박은 쉼표로 채운다', () => {
    const v = readQuest('scale.pentatonic').variants['c-pentatonic'];
    expect(v.evaluatorSpec.count).toBe(6);
    expect(v.score.meter).toBe('4/4');
    expect(expectedPitchesOf(v.score, 'v1').map(nameOf)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4', 'C5']);
    const rests = v.score.events.filter((e: Record<string, any>) => e.type === 'rest');
    expect(rests.map((e: Record<string, any>) => [e.measureIndex, e.onsetTicks, e.durationTicks])).toEqual([
      [1, 1920, 960],
      [1, 2880, 960],
    ]);
  });

  it('각 과제는 설계서 5.6의 정거장에 놓인다: Q24와 Q25는 단음계 길(S2), Q26은 다섯 음 길(S3). 패널로도 모두 열린다', () => {
    const where = (id: string) => readQuest(id).placements.filter((x: Record<string, any>) => x.kind === 'installation').map((x: Record<string, any>) => x.installationId);
    expect(where('scale.natural-minor')).toEqual(['inst.scale-trail.minor-path']);
    expect(where('scale.harmonic-minor')).toEqual(['inst.scale-trail.minor-path']);
    expect(where('scale.pentatonic')).toEqual(['inst.scale-trail.pentatonic-path']);
    for (const id of SCALE_TRAIL) {
      const q = readQuest(id);
      expect(panelPlacement(q).variantIds, id).toEqual(q.variantIds);
    }
  });

  it('Q07의 G·D·B♭장조는 장음계 길(S1)에 놓이고 C·F장조는 마을 디딤돌에 그대로 있다', () => {
    const q = readQuest('scale.major');
    const on = (instId: string) => q.placements.find((x: Record<string, any>) => x.installationId === instId).variantIds;
    expect(on('inst.village.scale-stones')).toEqual(['c-major', 'f-major']);
    expect(on('inst.scale-trail.major-path')).toEqual(['g-major', 'd-major', 'bflat-major']);
  });
});

describe('정답 악보는 자기 판정기를 통과한다', () => {
  it('Q01: 정답 악보의 두 C4를 두 보표에 놓으면 통과한다', () => {
    const v = readQuest('pitch.same-note-two-clefs').variants['middle-c'];
    const input: EvaluatorInput = { type: 'pitchSpelling', placed: v.evaluatorSpec.targets.map((t: any) => ({ slotId: t.slotId, pitch: t.expected })) };
    expect(evaluate(v.evaluatorSpec, input, v.score).passed).toBe(true);
  });

  it('Q02: 정답 악보 그대로를 입력하면 통과한다', () => {
    const v = readQuest('rhythm.rest-in-a-bar').variants['quarter-rest'];
    expect(evaluate(v.evaluatorSpec, { type: 'rhythmPlacement', score: v.score }, v.score).passed).toBe(true);
  });

  it('Q07: 다섯 판본의 정답 음을 칸 순서대로 놓으면 모두 통과한다', () => {
    const q = readQuest('scale.major');
    for (const vid of q.variantIds) {
      const v = q.variants[vid];
      const placed = expectedPitchesOf(v.score, 'v1').map((x, i) => ({ slot: i + 1, pitch: { letter: x.letter, alter: x.alter, octave: x.octave } }));
      expect(evaluate(v.evaluatorSpec, { type: 'orderedScale', placed }, v.score).passed, vid).toBe(true);
    }
  });
});

describe('모든 과제의 모든 판본: 정답 값을 입력으로 만들면 자기 판정기를 통과한다', () => {
  const cases = BUILT.flatMap((id) => {
    const q = readQuest(id);
    return (q.variantIds as string[]).map((vid) => [`${id}/${vid}`, q.variants[vid]] as const);
  });

  it.each(cases)('%s', (_name, v) => {
    const r = evaluate(v.evaluatorSpec, answerInput(v), v.score);
    expect(renderAll(r.issues), '정답이 설명을 만들었어요').toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('모든 과제(범위 A의 여덟 과제와 6단계에서 더한 과제)가 판본을 갖고 모든 판본이 위 검사를 거친다', () => {
    expect(cases.length).toBeGreaterThanOrEqual(BUILT.length);
    expect(new Set(cases.map(([name]) => name.split('/')[0])).size).toBe(BUILT.length);
  });
});

describe('Q07 콘텐츠의 설명 문장(설계서 부록 A.3)', () => {
  const q = readQuest('scale.major');
  const v = q.variants['f-major'];
  const run = (...names: string[]) =>
    renderAll(evaluate(v.evaluatorSpec, { type: 'orderedScale', placed: names.map((n, i) => ({ slot: i + 1, pitch: p(n) })) }, v.score).issues, q.feedbackRules);

  it('F장조 넷째 자리에 A♯을 놓고 배치 확인을 누르면 "네 번째 자리는 B 이름을 써요"가 나온다', () => {
    const msgs = run('F4', 'G4', 'A4', 'A#4');
    expect(msgs[0]).toBe('네 번째 자리는 B 이름을 써요. F장조에서는 B♭4예요. 소리 높이는 같아요.');
    expect(msgs.slice(1)).toEqual(['5번째 자리가 비어 있어요.', '6번째 자리가 비어 있어요.', '7번째 자리가 비어 있어요.', '8번째 자리가 비어 있어요.']);
  });

  it('순서가 바뀌면 바뀐 두 자리를 말한다', () => {
    expect(run('F4', 'A4', 'G4', 'Bb4', 'C5', 'D5', 'E5', 'F5')).toEqual(['2번째와 3번째 자리의 순서가 바뀌었어요.']);
  });

  it('마지막 음이 한 옥타브 아래면 장음계가 옥타브 위까지 이어진다고 말한다', () => {
    expect(run('F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F4')).toEqual(['여덟 번째 자리의 옥타브가 달라요. 지금은 F4, 목표는 F5예요. 장음계는 시작음에서 한 옥타브 위까지 이어져요.']);
  });
});

describe('Q24–Q26 콘텐츠의 설명 문장(7-2)', () => {
  const run = (questId: string, vid: string, ...names: string[]) => {
    const q = readQuest(questId);
    const v = q.variants[vid];
    return renderAll(evaluate(v.evaluatorSpec, { type: 'orderedScale', placed: names.map((n, i) => ({ slot: i + 1, pitch: p(n) })) }, v.score).issues, q.feedbackRules);
  };

  it('D단조 여섯째 자리에 A♯을 놓으면 B 이름을 써야 한다고 말한다(소리 높이는 같다)', () => {
    const msgs = run('scale.natural-minor', 'd-minor', 'D4', 'E4', 'F4', 'G4', 'A4', 'A#4', 'C5', 'D5');
    expect(msgs).toEqual(['여섯 번째 자리는 B 이름을 써요. D단조에서는 B♭4예요. 소리 높이는 같아요.']);
  });

  it('A단조 자연단음계에서 일곱째 음을 G♯으로 올리면 목표는 G4라고 알려 준다(화성단음계와 섞지 않는다)', () => {
    const msgs = run('scale.natural-minor', 'a-minor', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4', 'A4');
    expect(msgs).toEqual(['일곱 번째 자리: 지금은 G♯4예요. 목표는 G4예요.']);
  });

  it('화성단음계에서 G♯ 대신 A♭을 쓰면 G 이름을 써야 한다고 말한다', () => {
    const msgs = run('scale.harmonic-minor', 'a-harmonic-minor', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'Ab4', 'A4');
    expect(msgs).toEqual(['일곱 번째 자리는 G 이름을 써요. A단조에서는 G♯4예요. 소리 높이는 같아요.']);
  });

  it('화성단음계에서 G♮(자연단음계의 일곱째 음)을 놓으면 고칠 곳으로 알려 준다', () => {
    expect(run('scale.harmonic-minor', 'a-harmonic-minor', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4')).toEqual(['일곱 번째 자리: 지금은 G4예요. 목표는 G♯4예요.']);
  });

  it('마지막 음이 한 옥타브 아래면 단음계도 옥타브 위까지 이어진다고 말한다', () => {
    expect(run('scale.natural-minor', 'e-minor', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E4')).toEqual([
      '여덟 번째 자리의 옥타브가 달라요. 지금은 E4, 목표는 E5예요. 자연단음계도 시작음에서 한 옥타브 위까지 이어져요.',
    ]);
    expect(run('scale.harmonic-minor', 'a-harmonic-minor', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G#4', 'A3')).toEqual([
      '여덟 번째 자리의 옥타브가 달라요. 지금은 A3, 목표는 A4예요. 화성단음계도 시작음에서 한 옥타브 위까지 이어져요.',
    ]);
  });

  it('다섯 음 음계: 마지막 음이 C4면 옥타브가 달라요, 두 칸이 바뀌면 순서가 바뀌었다고 말한다, 빈 칸도 알려 준다', () => {
    expect(run('scale.pentatonic', 'c-pentatonic', 'C4', 'D4', 'E4', 'G4', 'A4', 'C4')).toEqual([
      '여섯 번째 자리의 옥타브가 달라요. 지금은 C4, 목표는 C5예요. 다섯 음 음계도 시작음에서 한 옥타브 위의 같은 음까지 이어져요.',
    ]);
    expect(run('scale.pentatonic', 'c-pentatonic', 'C4', 'E4', 'D4', 'G4', 'A4', 'C5')).toEqual(['2번째와 3번째 자리의 순서가 바뀌었어요.']);
    expect(run('scale.pentatonic', 'c-pentatonic', 'C4', 'D4', 'E4', 'G4', 'A4')).toEqual(['6번째 자리가 비어 있어요.']);
  });
});

describe('틀린 데이터를 넣으면 검사가 실패한다', () => {
  it('마디 길이의 합이 박자표와 다르면 실패한다', () => {
    const issues = check('rhythm.rest-in-a-bar', (q) => {
      q.variants['quarter-rest'].score.events[3].durationTicks = 480; // 마지막 4분음표를 8분음표로
    });
    expect(codes(issues)).toContain('SCORE_MEASURE_NOT_FULL');
    expect(issues.find((i) => i.code === 'SCORE_MEASURE_NOT_FULL')!.message).toContain('3360');
  });

  it('MIDI 번호가 음이름·옥타브·변화와 다르면 실패한다', () => {
    const issues = check('rhythm.rest-in-a-bar', (q) => {
      q.variants['quarter-rest'].score.events[2].resolvedPitch.midi = 63; // D4(62)를 63으로
    });
    expect(codes(issues)).toContain('SCORE_RESOLVED_MISMATCH');
  });

  it('조표를 적용하지 않은 해석 음(F장조의 B를 B♮로 적음)은 실패한다', () => {
    const issues = check('scale.major', (q) => {
      const e = q.variants['f-major'].score.events[3]; // B♭4
      e.resolvedPitch.alter = 0;
      e.resolvedPitch.midi = 71;
    });
    expect(codes(issues)).toContain('SCORE_RESOLVED_MISMATCH');
  });

  it('resolvedPitch가 빠지면 실패한다', () => {
    const issues = check('scale.major', (q) => {
      delete q.variants['c-major'].score.events[0].resolvedPitch;
    });
    expect(codes(issues)).toContain('SCORE_RESOLVED_MISSING');
  });

  it('판정 조건이 정답 악보와 어긋나면 실패한다(간격, 개수, 방향, 목표 음)', () => {
    expect(codes(check('scale.major', (q) => (q.variants['c-major'].evaluatorSpec.midiSteps = [2, 2, 2, 1, 2, 2, 1])))).toContain('SPEC_SCORE_MISMATCH');
    expect(codes(check('scale.major', (q) => (q.variants['c-major'].evaluatorSpec.count = 7)))).toContain('SPEC_SCORE_MISMATCH');
    expect(codes(check('scale.major', (q) => (q.variants['c-major'].evaluatorSpec.direction = 'descending')))).toContain('SPEC_SCORE_MISMATCH');
    expect(codes(check('pitch.same-note-two-clefs', (q) => (q.variants['middle-c'].evaluatorSpec.targets[0].expected.octave = 5)))).toContain('SPEC_SCORE_MISMATCH');
    expect(codes(check('pitch.same-note-two-clefs', (q) => (q.variants['middle-c'].evaluatorSpec.targets[1].clef = 'treble')))).toContain('SPEC_SCORE_MISMATCH');
    expect(codes(check('rhythm.rest-in-a-bar', (q) => (q.variants['quarter-rest'].evaluatorSpec.voiceId = 'v9')))).toContain('SPEC_REF');
  });

  it('임시 projectId와 알 수 없는 스키마 판은 실패한다', () => {
    expect(codes(check('scale.major', (q) => (q.projectId = 'TBD-project-id')))).toContain('PROJECT_ID');
    expect(codes(check('scale.major', (q) => (q.schemaVersion = 2)))).toContain('SCHEMA');
  });

  it('공개 상태인데 검수나 권리가 미확인이면 실패한다(W-10)', () => {
    const issues = check('scale.major', (q) => (q.availability = 'published'));
    expect(codes(issues)).toEqual(expect.arrayContaining(['PUBLISHED_UNREVIEWED', 'PUBLISHED_RIGHTS']));
    const ok = check('scale.major', (q) => {
      q.availability = 'published';
      for (const s of q.sourceRefs) {
        s.reviewStatus = 'reviewed';
        s.rightsStatus = 'confirmed';
      }
    });
    expect(ok).toEqual([]);
    expect(codes(check('scale.major', (q) => ((q.availability = 'published'), (q.sourceRefs = []))))).toContain('PUBLISHED_NO_SOURCE');
    // 판본 하나만 공개로 올려도 같은 검사를 받는다
    expect(codes(check('scale.major', (q) => (q.variants['c-major'].availability = 'published')))).toContain('PUBLISHED_UNREVIEWED');
  });

  it('없는 패널·설치물·판본을 가리키는 배치는 실패한다. 모든 판본은 패널로 열려야 한다', () => {
    expect(codes(check('scale.major', (q) => (panelPlacement(q).panelId = 'panel.nowhere')))).toContain('REF_PANEL');
    // 음계 과제는 마을 디딤돌에도 놓여 있다(4.1). 설치물 목록에 없으면 실패한다
    expect(codes(check('scale.major', () => undefined, { installationIds: new Set() }))).toContain('REF_INSTALLATION');
    expect(codes(check('scale.major', (q) => (q.placements[0].installationId = 'inst.nowhere')))).toContain('REF_INSTALLATION');
    expect(check('scale.major', () => undefined)).toEqual([]);
    const second = (q: Record<string, any>) => q.placements.push({ kind: 'installation', installationId: 'inst.village.scale-stones', variantIds: ['g-major'] });
    expect(check('scale.major', second)).toEqual([]);
    expect(codes(check('scale.major', (q) => panelPlacement(q).variantIds.pop()))).toContain('NO_PANEL_PLACEMENT'); // bflat-major를 여는 패널이 없다
    expect(codes(check('scale.major', (q) => panelPlacement(q).variantIds.push('x-major')))).toContain('REF_VARIANT');
    expect(codes(check('scale.major', (q) => q.variantIds.push('e-major')))).toContain('REF_VARIANT');
    expect(codes(check('scale.major', (q) => delete q.variants['d-major']))).toContain('REF_VARIANT');
    expect(PANEL_IDS).toContain('panel.scale');
  });

  it('설명 규칙: 모르는 코드, 쓸 수 없는 값 이름, 같은 코드 둘, 짝이 안 맞는 중괄호는 실패한다', () => {
    const rule = (r: object) => (q: Record<string, any>) => q.feedbackRules.push(r);
    expect(codes(check('rhythm.rest-in-a-bar', rule({ code: 'NO_SUCH_CODE', template: '무언가' })))).toContain('RULE_CODE');
    expect(codes(check('rhythm.rest-in-a-bar', rule({ code: 'DURATION_MISMATCH', template: '{where}: {foo}' })))).toContain('RULE_PARAM');
    expect(
      codes(
        check('rhythm.rest-in-a-bar', (q) => {
          q.feedbackRules.push({ code: 'MISSING_EVENT', template: '{where}' }, { code: 'MISSING_EVENT', template: '{where}' });
        }),
      ),
    ).toContain('RULE_DUP');
    expect(codes(check('rhythm.rest-in-a-bar', rule({ code: 'MISSING_EVENT', template: '{where에 없어요' })))).toEqual(expect.arrayContaining(['RULE_TEMPLATE']));
    // 줄인 이름 MISSING은 MISSING_PLACEMENT와 같은 규칙으로 센다
    expect(codes(check('rhythm.rest-in-a-bar', (q) => q.feedbackRules.push({ code: 'MISSING', template: '{where}' }, { code: 'MISSING_PLACEMENT', template: '{where}' })))).toContain('RULE_DUP');
  });

  it('형식이 틀리면 형식 오류만 알리고 의미 검사로 넘어가지 않는다', () => {
    const issues = check('scale.major', (q) => {
      delete q.title;
      q.variants['c-major'].evaluatorSpec.type = 'nope';
    });
    expect(new Set(codes(issues))).toEqual(new Set(['SHAPE']));
    expect(codes(check('scale.major', (q) => (q.variants['c-major'].challengeDescriptor.smallestValue = 'quarterish')))).toEqual(['SHAPE']);
    expect(codes(validateQuestDefinition(42))).toEqual(['SHAPE']);
    expect(codes(validateQuestDefinition({}))).toContain('SHAPE');
  });

  it('여러 파일을 함께 볼 때 questId가 겹치면 실패한다', () => {
    const a = readQuest('scale.major');
    const issues = validateQuestSet([a, structuredClone(a)]);
    expect(codes(issues)).toContain('DUP_ID');
  });

  it('기본 연습 연결(5-5): 연습 연결에는 이어진 과제가 있어야 하고, 자기 자신이나 다른 종류의 연결에는 쓸 수 없다', () => {
    const q08 = readQuest('song.short-piece');
    expect(practiceLinksOf(q08 as QuestDefinition).map((l) => l.questId)).toEqual(['rhythm.rest-in-a-bar', 'rhythm.short-notes-and-triplets', 'chord.major-triad']);
    expect(codes(check('song.short-piece', (q) => q.assistanceLinks.push({ type: 'practice', label: '연습' })))).toContain('SHAPE');
    expect(codes(check('song.short-piece', (q) => q.assistanceLinks.push({ type: 'practice', label: '자기 자신', questId: 'song.short-piece' })))).toContain('SHAPE');
    expect(codes(check('song.short-piece', (q) => q.assistanceLinks.push({ type: 'practice', label: '판본', questId: 'rhythm.rest-in-a-bar', variantId: 7 })))).toContain('SHAPE');
    expect(codes(check('song.short-piece', (q) => (q.assistanceLinks[0].questId = 'rhythm.rest-in-a-bar')))).toContain('SHAPE');
    // 올바른 연결은 문제가 없다
    expect(codes(check('song.short-piece', (q) => q.assistanceLinks.push({ type: 'practice', label: '판본 지정', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' })))).toEqual([]);
  });

  it('기본 연습 연결은 있는 과제와 판본을 가리켜야 한다(여러 파일을 함께 볼 때)', () => {
    const all = BUILT.map((id) => readQuest(id));
    expect(validateQuestSet(all, { installationIds: KNOWN_INSTALLATIONS })).toEqual([]);
    const unknownQuest = structuredClone(all);
    unknownQuest.find((q) => q.questId === 'song.short-piece')!.assistanceLinks.push({ type: 'practice', label: '없는 과제', questId: 'rhythm.nothing' });
    expect(codes(validateQuestSet(unknownQuest, { installationIds: KNOWN_INSTALLATIONS }))).toContain('REF_QUEST');
    const unknownVariant = structuredClone(all);
    unknownVariant.find((q) => q.questId === 'song.short-piece')!.assistanceLinks.push({ type: 'practice', label: '없는 판본', questId: 'rhythm.rest-in-a-bar', variantId: 'no-such' });
    expect(codes(validateQuestSet(unknownVariant, { installationIds: KNOWN_INSTALLATIONS }))).toContain('REF_VARIANT');
    // 연결을 이은 과제를 빼면 가리키는 곳이 사라진다
    const dropped = all.filter((q) => q.questId !== 'chord.major-triad');
    expect(codes(validateQuestSet(dropped, { installationIds: KNOWN_INSTALLATIONS }))).toContain('REF_QUEST');
  });

  it('악보 구조 오류도 그대로 알린다(겹침, 마디 넘김)', () => {
    const issues = check('rhythm.rest-in-a-bar', (q) => {
      q.variants['quarter-rest'].score.events[3].onsetTicks = 3000; // 마디를 넘는다
    });
    expect(codes(issues)).toContain('SCORE_CROSS_BARLINE');
  });
});

describe('검수 대장', () => {
  const defs = ALL.map((id) => readQuest(id) as QuestDefinition);
  const entries = (status: 'pending' | 'done' = 'pending') =>
    ALL.flatMap((questId) => (['music-review', 'play-review', 'rights-approval'] as const).map((step) => ({ questId, step, status, ...(status === 'done' ? { by: '검수자', at: '2026-11-10' } : {}) })));

  it('모든 과제에 세 단계가 적혀 있으면 통과한다', () => {
    expect(validateReviewLog(entries(), defs)).toEqual([]);
  });

  it('빠진 단계, 없는 과제, 같은 기록 둘, 완료인데 확인자와 날짜가 없는 경우는 실패한다', () => {
    expect(codes(validateReviewLog(entries().slice(1), defs))).toContain('LOG_MISSING');
    expect(codes(validateReviewLog([...entries(), { questId: 'x.y', step: 'music-review', status: 'pending' }], defs))).toContain('REF_QUEST');
    expect(codes(validateReviewLog([...entries(), entries()[0]], defs))).toContain('DUP_ID');
    expect(codes(validateReviewLog(entries().map((e, i) => (i === 0 ? { ...e, status: 'done' } : e)), defs))).toContain('LOG_DONE');
    expect(codes(validateReviewLog('x', defs))).toEqual(['SHAPE']);
  });

  it('공개 상태의 과제는 세 단계가 모두 완료여야 한다', () => {
    const pub = structuredClone(defs);
    pub.find((d) => d.questId === 'scale.major')!.availability = 'published';
    expect(codes(validateReviewLog(entries(), pub))).toContain('PUBLISHED_UNREVIEWED');
    expect(validateReviewLog(entries('done'), pub)).toEqual([]);
  });
});

describe('ContentCatalog: 공개 목록과 판 (W-10, 7.7)', () => {
  const defs = ALL.map((id) => readQuest(id) as QuestDefinition);
  const byId = (list: QuestDefinition[], id: string): QuestDefinition => list.find((d) => d.questId === id)!;
  const published = (): QuestDefinition[] => {
    const d = structuredClone(defs);
    byId(d, 'scale.major').availability = 'published';
    return d;
  };

  it('preview 채널: 검수 전 과제는 "검수 전" 표지와 함께 열린다', () => {
    const cat = new ContentCatalog(defs, 'preview');
    for (const e of cat.list()) {
      expect(e.state).toBe('unreviewed');
      expect(STATE_LABEL_KO[e.state]).toBe('검수 전');
    }
    expect(cat.resolve('rhythm.rest-in-a-bar').ok).toBe(true);
  });

  it('release 채널: 검수 전 과제는 "준비 중"이고 열리지 않는다. 공개된 과제는 열린다', () => {
    const cat = new ContentCatalog(published(), 'release');
    expect(cat.get('scale.major')!.state).toBe('open');
    expect(cat.get('rhythm.rest-in-a-bar')!.state).toBe('preparing');
    expect(STATE_LABEL_KO.preparing).toBe('준비 중');
    const r = cat.resolve('rhythm.rest-in-a-bar');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('preparing');
      expect(r.all).toHaveLength(defs.length); // 이유와 함께 전체 목록을 보여 준다
      expect(r.message).not.toMatch(/잠|🔒/); // 성과로 잠긴 것처럼 말하지 않는다
    }
    expect(cat.resolve('scale.major', 'g-major').ok).toBe(true);
  });

  it('판본마다 공개 상태를 따로 둘 수 있고, 과제는 가장 열린 판본을 따른다', () => {
    const d = structuredClone(defs);
    byId(d, 'scale.major').variants['c-major']!.availability = 'published';
    const cat = new ContentCatalog(d, 'release');
    const q = cat.get('scale.major')!;
    expect(q.state).toBe('open');
    expect(q.variants.map((v) => v.state)).toEqual(['open', 'preparing', 'preparing', 'preparing', 'preparing']);
    expect(cat.resolve('scale.major', 'c-major').ok).toBe(true);
    expect(cat.resolve('scale.major', 'f-major').ok).toBe(false);
  });

  it('직접 주소: 과제 id와 판본 id만으로 바로 연다. 판본을 생략하면 첫 판본이다', () => {
    const cat = new ContentCatalog(defs, 'preview');
    const r = cat.resolveHash('#/q/scale.major/f-major');
    expect(r.ok && r.variant.variantId).toBe('f-major');
    const first = cat.resolveHash('#/q/scale.major');
    expect(first.ok && first.variant.variantId).toBe('c-major');
    // 새 저장(아무 기록 없음)에서도 선행 완료를 묻지 않는다: 카탈로그는 저장 기록을 받는 곳이 없다
    expect(cat.resolveHash('#/q/rhythm.rest-in-a-bar/quarter-rest').ok).toBe(true);
    expect(ContentCatalog.hashFor('scale.major', 'f-major')).toBe('#/q/scale.major/f-major');
    expect(ContentCatalog.hashFor('scale.major')).toBe('#/q/scale.major');
  });

  it('없는 id나 틀린 주소는 이유와 전체 목록을 돌려준다', () => {
    const cat = new ContentCatalog(defs, 'preview');
    const unknownQuest = cat.resolveHash('#/q/nope.nothing/x');
    expect(!unknownQuest.ok && unknownQuest.reason).toBe('unknownQuest');
    const unknownVariant = cat.resolveHash('#/q/scale.major/z-major');
    expect(!unknownVariant.ok && unknownVariant.reason).toBe('unknownVariant');
    expect(!unknownVariant.ok && unknownVariant.message).toContain('c-major');
    for (const bad of ['', '#/x/y', '#/q/', '#/q/a/b/c', '#/q/%E0%A4%A']) {
      const r = cat.resolveHash(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('badFormat');
        expect(r.all).toHaveLength(defs.length);
      }
    }
  });

  it('거르기를 풀면 전부 다시 보인다(숨은 제한이 없다)', () => {
    const cat = new ContentCatalog(defs, 'preview');
    const rhythm = defs.filter((d) => d.topicTags.includes('rhythm')).map((d) => d.questId);
    expect(rhythm).toEqual(expect.arrayContaining(['rhythm.rest-in-a-bar', 'rhythm.short-notes-and-triplets']));
    expect(cat.filter({ tag: 'rhythm' }).map((e) => e.questId)).toEqual(rhythm);
    expect(cat.filter({ within: new Set(['scale.major']) }).map((e) => e.questId)).toEqual(['scale.major']);
    expect(cat.filter({ opened: new Set(['scale.major']) }).map((e) => e.questId)).not.toContain('scale.major');
    expect(cat.filter({ tag: 'rhythm', opened: new Set(rhythm) })).toEqual([]);
    expect(cat.filter()).toHaveLength(defs.length);
  });

  it('과제 id가 겹치면 만들 때 오류를 낸다', () => {
    expect(() => new ContentCatalog([defs[0]!, defs[0]!], 'preview')).toThrow(/겹쳐요/);
  });

  it('판본 항목에 패널과 설치물 배치가 담긴다', () => {
    const cat = new ContentCatalog(defs, 'preview');
    const variants = cat.get('scale.major')!.variants;
    // 마을 디딤돌(H4)에는 C장조와 F장조가, 음계 길의 장음계 길(S1, 7-2)에는 G·D·B♭장조가 놓여 있다. 모든 판본은 패널로도 열린다(W-2)
    expect(variants[0]).toMatchObject({ variantId: 'c-major', panelIds: ['panel.scale'], installationIds: ['inst.village.scale-stones'] });
    expect(variants.map((v) => [v.variantId, v.installationIds])).toEqual([
      ['c-major', ['inst.village.scale-stones']],
      ['f-major', ['inst.village.scale-stones']],
      ['g-major', ['inst.scale-trail.major-path']],
      ['d-major', ['inst.scale-trail.major-path']],
      ['bflat-major', ['inst.scale-trail.major-path']],
    ]);
    expect(variants.every((v) => v.panelIds.includes('panel.scale'))).toBe(true);
    // 쉼이 있는 한 마디(Q02)는 박자 강가의 첫 징검다리(E1)에도 놓여 있고, 패널로도 열린다
    expect(cat.get('rhythm.rest-in-a-bar')!.variants.map((v) => [v.variantId, v.installationIds])).toEqual([['quarter-rest', ['inst.beat-river.first-ford']]]);
  });
});

describe('정답 악보 안의 음 목록은 이름 있는 음만 담는다', () => {
  it('Q01–Q08의 모든 음에 resolvedPitch가 있다', () => {
    for (const id of ALL) {
      const q = readQuest(id);
      for (const v of Object.values<any>(q.variants)) {
        for (const e of v.score.events) if (isNote(e)) expect(e.resolvedPitch?.midi).toBeTypeOf('number');
      }
    }
  });
});

describe('자유로 놀기 주소(4.2, 4.9)', () => {
  const STAGE = 'inst.village.ensemble-stage';

  it('과제 id와 판본 id를 흉내 낸다: free.<설치물 id> / play', () => {
    expect(FREE_QUEST_PREFIX).toBe('free.');
    expect(FREE_VARIANT_ID).toBe('play');
    expect(freeQuestId(STAGE)).toBe('free.inst.village.ensemble-stage');
    expect(isFreeQuestId(freeQuestId(STAGE))).toBe(true);
    // 실제 과제 id는 자유로 놀기가 아니다
    for (const id of ALL) expect(isFreeQuestId(id)).toBe(false);
  });

  it('패널을 여는 주소로 만들고, 같은 주소에서 설치물 id를 다시 꺼낸다', () => {
    const hash = freeHashFor(STAGE);
    expect(hash).toBe('#/q/free.inst.village.ensemble-stage/play');
    expect(freeInstallationOfHash(hash)).toBe(STAGE);
    // 맨 앞 #이나 /가 없어도, 끝의 /가 있어도 같다
    expect(freeInstallationOfHash('/q/free.inst.village.ensemble-stage/play')).toBe(STAGE);
    expect(freeInstallationOfHash('q/free.inst.village.ensemble-stage/play/')).toBe(STAGE);
    expect(freeInstallationOfHash('  #/q/free.inst.village.ensemble-stage/play  ')).toBe(STAGE);
  });

  it('퍼센트로 인코딩된 주소도 읽는다', () => {
    expect(freeInstallationOfHash(`#/q/${encodeURIComponent(freeQuestId(STAGE))}/${FREE_VARIANT_ID}`)).toBe(STAGE);
    expect(freeInstallationOfHash(`#/q/${encodeURIComponent(freeQuestId('inst.별'))}/play`)).toBe('inst.별');
  });

  it('자유로 놀기 주소가 아니면 null이다: 실제 과제, 다른 판본, 설치물 id가 비었거나 형식이 다른 주소', () => {
    expect(freeInstallationOfHash('#/q/song.short-piece/one-voice')).toBeNull();
    expect(freeInstallationOfHash(`#/q/${freeQuestId(STAGE)}/one-voice`)).toBeNull();
    expect(freeInstallationOfHash('#/q/free./play')).toBeNull();
    expect(freeInstallationOfHash(`#/q/${freeQuestId(STAGE)}`)).toBeNull();
    expect(freeInstallationOfHash('#/notebook')).toBeNull();
    expect(freeInstallationOfHash('')).toBeNull();
    expect(freeInstallationOfHash('#/q/%E0%A4%A/play')).toBeNull();
  });
});
