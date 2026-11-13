// 6-7 종나무 숲의 과제 Q20–Q23: 데이터 모양과 정답 악보, 판정 규칙(표기까지), 검사 도구가 틀린 데이터를 잡는지.
// 설계서 5.5의 값(정거장, 판정기, 기본 예시, 다른 판본)을 그대로 지킨다. 교재 대조와 검수는 사람의 일이라 검수 대장에 '대기'로 남는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '@/domain/challenge';
import { validateQuestDefinition } from '@/domain/content';
import type { ContentIssue, QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import { writtenOf } from '@/domain/pitch';
import { isNote } from '@/domain/score';
import { ChallengeSession } from '@/domain/session';
import { PLANNED_QUESTS } from '@/domain/world';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readRaw = (id: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8'));
const quest = (id: string): QuestDefinition => readRaw(id) as unknown as QuestDefinition;
const Q20 = quest('chord.major-and-minor');
const Q21 = quest('chord.primary-triads');
const Q22 = quest('chord.diminished-augmented');
const Q23 = quest('chord.progression-walk');

const INSTALLATIONS = new Set(['inst.bell-grove.three-bells', 'inst.bell-grove.bright-dark', 'inst.bell-grove.bell-tower', 'inst.bell-grove.three-pillars', 'inst.village.scale-stones', 'inst.village.ensemble-stage']);
const check = (id: string, mutate: (q: Record<string, any>) => void): ContentIssue[] => {
  const q = readRaw(id);
  mutate(q);
  return validateQuestDefinition(q, { installationIds: INSTALLATIONS });
};
const codes = (issues: ContentIssue[]): string[] => issues.map((i) => i.code);

/** 종 이름 목록(칸 0, 1, 2, …)을 걸어서 판정 결과 문장을 낸다 */
function judge(q: QuestDefinition, variantId: string, names: string[]): { passed: boolean; texts: string[]; codes: string[] } {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  names.forEach((n, slot) => s.apply({ type: 'setSlot', slot, writtenPitch: writtenOf(p(n)) }));
  const r = evaluateDraft(q.variants[variantId]!, s.content());
  return { passed: r.passed, texts: renderAll(r.issues, q.feedbackRules), codes: r.issues.map((i) => i.code) };
}

describe('Q20 밝은 종 어두운 종(W2): 단3화음', () => {
  it('설계서 5.5: 제목과 판정기(triadMembership), 판본 C·A·D·E단3화음', () => {
    expect(PLANNED_QUESTS['chord.major-and-minor']).toEqual({ number: 'Q20', title: '밝은 종 어두운 종' });
    expect(Q20.title).toBe('밝은 종 어두운 종');
    expect(Q20.variantIds).toEqual(['c-minor', 'a-minor', 'd-minor', 'e-minor']);
    expect(Object.values(Q20.variants).map((v) => v.label)).toEqual(['C단3화음 (C E♭ G)', 'A단3화음 (A C E)', 'D단3화음 (D F A)', 'E단3화음 (E G B)']);
    for (const v of Object.values(Q20.variants)) expect(v.evaluatorSpec.type).toBe('triadMembership');
  });

  it('C E♭ G를 걸면 통과한다', () => {
    expect(judge(Q20, 'c-minor', ['C4', 'Eb4', 'G4'])).toEqual({ passed: true, texts: [], codes: [] });
  });

  it('소리는 같아도 이름이 다르면 통과하지 않는다: C D♯ G는 표기 조건에서 실패한다', () => {
    const r = judge(Q20, 'c-minor', ['C4', 'D#4', 'G4']);
    expect(r.passed).toBe(false);
    expect(r.codes).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(r.texts).toEqual(['화음: 소리 높이는 같지만 이름이 달라요. 지금은 D♯, 목표는 E♭이에요.']);
  });

  it('밝은 종(장3화음 C E G)을 걸면 3음이 높다고 알려 준다: E는 더해졌고 E♭이 빠졌다', () => {
    const r = judge(Q20, 'c-minor', ['C4', 'E4', 'G4']);
    expect(r.passed).toBe(false);
    expect(r.codes).toEqual(['EXTRA_NOTE', 'MISSING_TONE']);
    expect(r.texts).toEqual(['E가 더해져 있어요. 이 화음의 구성음이 아니에요.', 'E♭이 빠졌어요.']);
  });

  it('다른 판본(A C E, D F A, E G B)도 같은 방식이고 옥타브와 칸 순서는 상관없다', () => {
    expect(judge(Q20, 'a-minor', ['A4', 'C5', 'E5']).passed).toBe(true);
    expect(judge(Q20, 'a-minor', ['E4', 'A5', 'C4']).passed).toBe(true);
    expect(judge(Q20, 'd-minor', ['D4', 'F4', 'A4']).passed).toBe(true);
    expect(judge(Q20, 'e-minor', ['G4', 'E4', 'B4']).passed).toBe(true);
    // E G B♭(E 감3화음)은 E단3화음이 아니다
    expect(judge(Q20, 'e-minor', ['E4', 'G4', 'Bb4']).passed).toBe(false);
  });

  it('종탑이 아니라 종나무(W2)와 패널에 놓인다', () => {
    expect(Q20.placements.map((x) => [x.kind, x.kind === 'installation' ? x.installationId : x.panelId])).toEqual([
      ['installation', 'inst.bell-grove.bright-dark'],
      ['panel', 'panel.chord'],
    ]);
  });
});

describe('Q22 줄어든 종 늘어난 종(W2): 감3화음과 증3화음', () => {
  it('설계서 5.5: 감3화음 B D F, 증3화음 C E G♯', () => {
    expect(Q22.title).toBe('줄어든 종 늘어난 종');
    expect(Q22.variantIds).toEqual(['b-dim', 'c-aug']);
    expect(Q22.variants['b-dim']!.evaluatorSpec).toMatchObject({ type: 'triadMembership', requiredPitchClasses: [11, 2, 5], requiredSpellings: [{ letter: 'B', alter: 0 }, { letter: 'D', alter: 0 }, { letter: 'F', alter: 0 }] });
    expect(Q22.variants['c-aug']!.evaluatorSpec).toMatchObject({ type: 'triadMembership', requiredPitchClasses: [0, 4, 8], requiredSpellings: [{ letter: 'C', alter: 0 }, { letter: 'E', alter: 0 }, { letter: 'G', alter: 1 }] });
  });

  it('B D F와 C E G♯를 걸면 통과한다', () => {
    expect(judge(Q22, 'b-dim', ['B4', 'D5', 'F5']).passed).toBe(true);
    expect(judge(Q22, 'c-aug', ['C4', 'E4', 'G#4']).passed).toBe(true);
  });

  it('G♯ 대신 A♭을 걸면 같은 소리여도 통과하지 않는다', () => {
    const r = judge(Q22, 'c-aug', ['C4', 'E4', 'Ab4']);
    expect(r.passed).toBe(false);
    expect(r.codes).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(r.texts[0]).toContain('지금은 A♭, 목표는 G♯');
  });

  it('B 감3화음에 F♯(B단3화음)을 걸면 F♯은 더해졌고 F가 빠졌다고 알려 준다', () => {
    const r = judge(Q22, 'b-dim', ['B4', 'D5', 'F#5']);
    expect(r.passed).toBe(false);
    expect(r.codes).toEqual(['EXTRA_NOTE', 'MISSING_TONE']);
    expect(r.texts).toEqual(['F♯이 더해져 있어요. 이 화음의 구성음이 아니에요.', 'F가 빠졌어요.']);
  });

  it('C E G(장3화음)는 증3화음이 아니다: G가 더해졌고 G♯이 빠졌다', () => {
    const r = judge(Q22, 'c-aug', ['C4', 'E4', 'G4']);
    expect(r.passed).toBe(false);
    expect(r.codes).toEqual(['EXTRA_NOTE', 'MISSING_TONE']);
  });
});

describe('Q21 다장조의 세 기둥(W4)과 Q23 화음 이어 걷기(W4): 화음 사건 목록(X-3)', () => {
  it('설계서 5.5: 제목, 판정기(triadMembership X-3 → chordSequence), 정거장 W4 빈터', () => {
    expect(PLANNED_QUESTS['chord.primary-triads']).toEqual({ number: 'Q21', title: '다장조의 세 기둥' });
    expect(PLANNED_QUESTS['chord.progression-walk']).toEqual({ number: 'Q23', title: '화음 이어 걷기' });
    for (const q of [Q21, Q23]) {
      expect(q.variantIds).toHaveLength(1);
      expect(Object.values(q.variants)[0]!.evaluatorSpec.type).toBe('chordSequence');
      expect(q.placements.map((x) => (x.kind === 'installation' ? x.installationId : x.panelId))).toEqual(['inst.bell-grove.three-pillars', 'panel.chord']);
    }
  });

  it('정답 악보는 사건 하나가 한 마디, 화음 하나다: Q21은 3마디, Q23은 4마디', () => {
    const measures = (q: QuestDefinition): string[][] => {
      const score = Object.values(q.variants)[0]!.score;
      const out: string[][] = [];
      for (const e of score.events.filter(isNote)) (out[e.measureIndex] ??= []).push(`${e.resolvedPitch!.letter}${e.resolvedPitch!.octave}`);
      return out;
    };
    expect(measures(Q21)).toEqual([['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']]);
    expect(measures(Q23)).toEqual([['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5'], ['C4', 'E4', 'G4']]);
  });

  it('Q23만 전위를 알려 준다(판정에는 쓰지 않는다)', () => {
    const s21 = Object.values(Q21.variants)[0]!.evaluatorSpec;
    const s23 = Object.values(Q23.variants)[0]!.evaluatorSpec;
    if (s21.type !== 'chordSequence' || s23.type !== 'chordSequence') throw new Error('판정기가 달라요');
    expect(s21.events.every((e) => e.reportTones === undefined)).toBe(true);
    expect(s23.events.every((e) => e.reportTones !== undefined)).toBe(true);
  });

  it('세 기둥: 칸 0–3(첫 나무), 4–7(둘째), 8–11(셋째)에 걸어 판정한다', () => {
    const s = new ChallengeSession();
    s.openChallenge(Q21.questId, 'c-major-pillars');
    const place = (slot: number, name: string): void => s.apply({ type: 'setSlot', slot, writtenPitch: writtenOf(p(name)) });
    ['C4', 'E4', 'G4'].forEach((n, i) => place(i, n));
    ['F4', 'A4', 'C5'].forEach((n, i) => place(4 + i, n));
    ['G4', 'B4', 'D5'].forEach((n, i) => place(8 + i, n));
    expect(evaluateDraft(Q21.variants['c-major-pillars']!, s.content()).passed).toBe(true);
    // 첫 나무에 더한 음 하나가 그 나무의 문장으로 나온다
    place(3, 'D4');
    const r = evaluateDraft(Q21.variants['c-major-pillars']!, s.content());
    expect(renderAll(r.issues)).toEqual(['으뜸화음 나무: D가 더해져 있어요. 이 화음의 구성음이 아니에요.']);
  });

  it('Q23: 으뜸화음 나무가 틀리면 처음과 끝의 으뜸화음이 같은 나무라 한 번만 말한다', () => {
    const s = new ChallengeSession();
    s.openChallenge(Q23.questId, 'c-major-walk');
    const place = (slot: number, name: string): void => s.apply({ type: 'setSlot', slot, writtenPitch: writtenOf(p(name)) });
    ['C4', 'E4'].forEach((n, i) => place(i, n));
    ['F4', 'A4', 'C5'].forEach((n, i) => place(4 + i, n));
    ['G4', 'B4', 'D5'].forEach((n, i) => place(8 + i, n));
    const r = evaluateDraft(Q23.variants['c-major-walk']!, s.content());
    expect(renderAll(r.issues)).toEqual(['처음 으뜸화음: G가 빠졌어요.']);
  });
});

describe('Q05·Q06에 더한 종나무 배치', () => {
  it('Q05는 W1 세 종 나무에, Q06은 W3 종탑에 놓이고 쌍둥이 패널(panel.chord)도 그대로 있다', () => {
    const q05 = quest('chord.major-triad');
    const q06 = quest('chord.inversion');
    expect(q05.placements).toEqual([
      { kind: 'installation', installationId: 'inst.bell-grove.three-bells', variantIds: ['c-major', 'f-major', 'g-major'] },
      { kind: 'panel', panelId: 'panel.chord', variantIds: ['c-major', 'f-major', 'g-major'] },
    ]);
    expect(q06.placements).toEqual([
      { kind: 'installation', installationId: 'inst.bell-grove.bell-tower', variantIds: ['c-first', 'c-second', 'f-first', 'f-second', 'g-first', 'g-second'] },
      { kind: 'panel', panelId: 'panel.chord', variantIds: ['c-first', 'c-second', 'f-first', 'f-second', 'g-first', 'g-second'] },
    ]);
  });
});

describe('검사 도구는 틀린 화음 사건 데이터를 잡는다(X-3)', () => {
  const spec = (q: Record<string, any>): Record<string, any> => q.variants['c-major-walk'].evaluatorSpec;

  it('원본은 통과한다', () => {
    expect(check('chord.progression-walk', () => {})).toEqual([]);
    expect(check('chord.primary-triads', () => {})).toEqual([]);
  });

  it('모양: 나무 수, 사건 수, 나무 번호, 음급, 표기, 전위를 알릴 세 음', () => {
    expect(codes(check('chord.progression-walk', (q) => (spec(q).trees = 0)))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events = [spec(q).events[0]])))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].tree = -1)))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].requiredPitchClasses = [5, 9])))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].requiredPitchClasses = [5, 9, 12])))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].requiredSpellings = [{ letter: 'H', alter: 0 }, { letter: 'A', alter: 0 }, { letter: 'C', alter: 0 }])))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].reportTones = [{ letter: 'F', alter: 0 }])))).toContain('SHAPE');
    expect(codes(check('chord.progression-walk', (q) => delete spec(q).events[1].label))).toContain('SHAPE');
  });

  it('일치: 없는 나무, 쓰이지 않은 나무, 겹친 음급, 표기와 전위 음의 음급, 정답 악보와의 어긋남', () => {
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].tree = 3)))).toContain('SPEC_RANGE');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).trees = 4)))).toContain('SPEC_REF');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].requiredPitchClasses = [5, 5, 0])))).toContain('SPEC_DUP');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].requiredSpellings[1] = { letter: 'B', alter: 0 })))).toContain('SPEC_SCORE_MISMATCH');
    expect(codes(check('chord.progression-walk', (q) => (spec(q).events[1].reportTones[0] = { letter: 'G', alter: 0 })))).toContain('SPEC_SCORE_MISMATCH');
    // 정답 악보의 둘째 마디를 다른 화음으로 바꾸면
    expect(
      codes(
        check('chord.progression-walk', (q) => {
          const notes = q.variants['c-major-walk'].score.events.filter((e: any) => e.measureIndex === 1);
          notes[0].resolvedPitch = { letter: 'G', alter: 0, octave: 4, midi: 67 };
          notes[0].writtenPitch = { letter: 'G', accidental: null, octave: 4 };
        }),
      ),
    ).toContain('SPEC_SCORE_MISMATCH');
  });

  it('정답 악보의 마디 수가 사건 수와 다르면 알린다', () => {
    const extra = check('chord.progression-walk', (q) => {
      const v = q.variants['c-major-walk'];
      v.score.events.push({ eventId: 'z1', type: 'note', voiceId: 'v1', staffId: 's1', measureIndex: 4, onsetTicks: 0, durationTicks: 3840, writtenPitch: { letter: 'C', accidental: null, octave: 4 }, resolvedPitch: { letter: 'C', alter: 0, octave: 4, midi: 60 } });
    });
    expect(codes(extra)).toContain('SPEC_SCORE_MISMATCH');
  });

  it('틀 문장(feedbackRules)은 {where}를 쓸 수 있다: 구성음 문제 다섯 코드의 매개변수다', () => {
    const ok = check('chord.progression-walk', (q) => {
      q.feedbackRules = [{ code: 'MISSING_TONE', template: '{where}에서 {name:이가} 빠졌어요.' }];
    });
    expect(ok).toEqual([]);
  });
});
