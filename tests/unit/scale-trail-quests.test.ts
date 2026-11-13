// 7-2 음계 길의 과제 Q24–Q26과 Q07의 새 판본(G·D·B♭장조): 정답은 판정기를 통과하고, 판본마다 일부러 틀리게 바꾼 입력에 기대한 설명이 나온다(11.2 검수 점검표 2번).
// 값 자체(설계서 5.8의 MIDI 표, 조표, 임시표, 쉼표)는 content.test.ts가 독립적으로 대조한다. 여기서는 정답 데이터에서 오답을 만들어 판정기에 넣는다.
// 틀리게 바꾸는 방법과 기대하는 코드·문장은 이 파일이 정한다(판정기의 코드를 베끼지 않는다). 설명은 과제 자신의 feedbackRules로 만든다(화면과 같다).
// 만들어 낸 오답은 정답 데이터에서 나온 것이고 사람이 만든 오답이 아니다. 사람이 실제로 많이 하는 틀림인지는 검수에서 본다(관찰 대기).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluate } from '@/domain/evaluators';
import type { EvaluatorInput } from '@/domain/evaluators';
import { renderAll } from '@/domain/feedback';
import type { IssueCode } from '@/domain/feedback';
import { diatonicIndex, letterOctaveAt, midiOf, pitchName } from '@/domain/pitch';
import type { Letter, SpelledPitch } from '@/domain/pitch';
import type { Score } from '@/domain/score';
import { answerInput } from './answers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (id: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8'));

/** 이 단계에서 새로 놓인 판본: Q24(셋), Q25(하나), Q26(하나), Q07의 장음계 길 판본(셋) */
const NEW_VARIANTS: Array<[string, string[]]> = [
  ['scale.natural-minor', ['a-minor', 'd-minor', 'e-minor']],
  ['scale.harmonic-minor', ['a-harmonic-minor']],
  ['scale.pentatonic', ['c-pentatonic']],
  ['scale.major', ['g-major', 'd-major', 'bflat-major']],
];

interface VariantRef {
  key: string;
  quest: Record<string, any>;
  variantId: string;
  v: Record<string, any>;
}
const VARIANTS: VariantRef[] = NEW_VARIANTS.flatMap(([questId, ids]) => {
  const quest = load(questId);
  return ids.map((variantId) => ({ key: `${questId}/${variantId}`, quest, variantId, v: quest.variants[variantId] as Record<string, any> }));
});

/** 설명 문장에 들어 있는 음계의 이름(옥타브 설명이 그 음계 이름으로 말한다) */
const SCALE_WORD: Record<string, string> = {
  'scale.major': '장음계',
  'scale.natural-minor': '자연단음계',
  'scale.harmonic-minor': '화성단음계',
  'scale.pentatonic': '다섯 음 음계',
};
const ORDINAL = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟'];

const stepUp = (q: SpelledPitch, by = 1): SpelledPitch => ({ ...letterOctaveAt(diatonicIndex(q) + by), alter: q.alter });
const withAlter = (q: SpelledPitch, by: number): SpelledPitch => ({ ...q, alter: q.alter + by });

/** 같은 소리 높이를 다른 이름으로 쓴다(변화가 가장 작은 것을 고른다). 예: E → F♭, D → C𝄪 */
function enharmonicOf(q: SpelledPitch): SpelledPitch {
  const midi = midiOf(q);
  const found: SpelledPitch[] = [];
  for (const letter of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as Letter[]) {
    for (let octave = q.octave - 1; octave <= q.octave + 1; octave++) {
      for (let alter = -2; alter <= 2; alter++) {
        const c = { letter, alter, octave };
        if (midiOf(c) === midi && !(c.letter === q.letter && c.alter === q.alter)) found.push(c);
      }
    }
  }
  found.sort((a, b) => Math.abs(a.alter) - Math.abs(b.alter) || Math.abs(a.octave - q.octave) - Math.abs(b.octave - q.octave));
  return found[0]!;
}

interface WrongCase {
  what: string;
  input: EvaluatorInput;
  /** 칸 순서대로 나와야 하는 설명 코드 전체(총평인 SCALE_LENGTH가 있으면 맨 앞) */
  codes: IssueCode[];
  /** 설명 문장에 들어가야 할 말 */
  text?: string[];
  /** 첫 설명이 가리키는 칸(판정기의 target.slotId) */
  firstSlot?: string;
}

function casesOf(x: VariantRef): WrongCase[] {
  const spec = x.v.evaluatorSpec;
  const steps = spec.midiSteps as number[];
  const right = (answerInput(x.v) as { placed: Array<{ slot: number; pitch: SpelledPitch }> }).placed;
  const count = right.length;
  const mid = Math.floor(count / 2); // 한 칸만 바꿀 때 쓰는 칸(0부터): 여덟 칸이면 다섯째, 여섯 칸이면 넷째
  const input = (placed: Array<{ slot: number; pitch: SpelledPitch | null }>): EvaluatorInput => ({ type: 'orderedScale', placed });
  const edit = (i: number, pitch: SpelledPitch | null): EvaluatorInput => input(right.map((q, k) => (k === i ? { slot: q.slot, pitch } : q)));
  const editMany = (changes: Record<number, SpelledPitch>): EvaluatorInput => input(right.map((q, k) => (k in changes ? { slot: q.slot, pitch: changes[k]! } : q)));
  const exp = (i: number): SpelledPitch => right[i]!.pitch;
  const word = SCALE_WORD[x.quest.questId as string]!;
  const out: WrongCase[] = [];

  out.push({ what: '1번째 칸을 비운다', input: input(right.slice(1)), codes: ['MISSING_PLACEMENT'], text: ['1번째 자리가 비어 있어요.'], firstSlot: '1' });
  out.push({ what: '마지막 칸을 비운다', input: input(right.slice(0, -1)), codes: ['MISSING_PLACEMENT'], text: [`${count}번째 자리가 비어 있어요.`], firstSlot: String(count) });
  out.push({ what: '아무것도 놓지 않는다', input: input([]), codes: Array.from({ length: count }, () => 'MISSING_PLACEMENT' as IssueCode), firstSlot: '1' });
  out.push({
    what: `1번째 칸과 ${mid + 1}번째 칸의 음을 맞바꾼다`,
    input: input(right.map((q, k) => ({ slot: q.slot, pitch: k === 0 ? exp(mid) : k === mid ? exp(0) : q.pitch }))),
    codes: ['WRONG_ORDER'],
    text: [`1번째와 ${mid + 1}번째 자리의 순서가 바뀌었어요.`],
    firstSlot: '1',
  });
  out.push({
    what: `${mid + 1}번째 칸을 한 옥타브 위에 놓는다`,
    input: edit(mid, { ...exp(mid), octave: exp(mid).octave + 1 }),
    codes: ['OCTAVE_MISMATCH'],
    text: ['의 옥타브가 달라요', `지금은 ${pitchName({ ...exp(mid), octave: exp(mid).octave + 1 })}`, `목표는 ${pitchName(exp(mid))}`],
    firstSlot: String(mid + 1),
  });
  out.push({
    what: '마지막 칸을 한 옥타브 아래에 놓는다(시작음의 옥타브 위까지 이어진다는 설명이 나온다)',
    input: edit(count - 1, { ...exp(count - 1), octave: exp(count - 1).octave - 1 }),
    codes: ['OCTAVE_MISMATCH'],
    text: [`지금은 ${pitchName({ ...exp(count - 1), octave: exp(count - 1).octave - 1 })}`, `목표는 ${pitchName(exp(count - 1))}`, word, '옥타브 위'],
    firstSlot: String(count),
  });
  const alt = enharmonicOf(exp(mid));
  out.push({
    what: `${mid + 1}번째 칸을 같은 소리의 다른 이름(${pitchName(alt)})으로 놓는다`,
    input: edit(mid, alt),
    codes: ['WRONG_SPELLING_SAME_PITCH'],
    text: [`${ORDINAL[mid]} 번째 자리는 ${exp(mid).letter} 이름을 써요`, `${spec.keyName}에서는 ${pitchName(exp(mid))}`, '소리 높이는 같아요'],
    firstSlot: String(mid + 1),
  });
  out.push({
    what: `${mid + 1}번째 칸을 온음계 한 칸 위에 놓는다`,
    input: edit(mid, stepUp(exp(mid))),
    codes: ['WRONG_PITCH'],
    text: [`지금은 ${pitchName(stepUp(exp(mid)))}`, `목표는 ${pitchName(exp(mid))}`],
    firstSlot: String(mid + 1),
  });
  out.push({
    what: '목표보다 한 칸 더 놓는다',
    input: input([...right, { slot: count + 1, pitch: stepUp(exp(count - 1)) }]),
    codes: ['SCALE_LENGTH'],
    text: [`${count + 1}개`, `${count}개`],
  });

  // 단음계(자연·화성): 일곱째 음과 여섯째 음의 올림·내림이 두 음계를 가른다
  const isMinor = steps.join() === '2,1,2,2,1,2,2' || steps.join() === '2,1,2,2,1,3,1';
  if (isMinor) {
    const seventh = 6; // 일곱째 음(색인 6)
    const natural = steps.join() === '2,1,2,2,1,2,2';
    out.push({
      what: natural ? '일곱째 음을 반음 올린다(화성단음계의 이끎음을 자연단음계에 놓는다)' : '일곱째 음을 반음 내린다(자연단음계의 일곱째 음을 화성단음계에 놓는다)',
      input: edit(seventh, withAlter(exp(seventh), natural ? 1 : -1)),
      codes: ['WRONG_PITCH'],
      text: [`지금은 ${pitchName(withAlter(exp(seventh), natural ? 1 : -1))}`, `목표는 ${pitchName(exp(seventh))}`],
      firstSlot: String(seventh + 1),
    });
    out.push({
      what: '여섯째 음을 반음 올린다(가락단음계의 오름 모양처럼 여섯째도 올린다)',
      input: edit(5, withAlter(exp(5), 1)),
      codes: ['WRONG_PITCH'],
      text: [`지금은 ${pitchName(withAlter(exp(5), 1))}`, `목표는 ${pitchName(exp(5))}`],
      firstSlot: '6',
    });
  }

  // 조표에서 나오는 변화를 빠뜨린다: 조표가 있는 판본마다 변화음 칸마다 제자리 음을 놓는다
  const keySig = x.v.score.staves[0].keySignature as number;
  if (keySig !== 0) {
    const altered = right.map((q, k) => [q, k] as const).filter(([q]) => q.pitch.alter !== 0);
    const changes: Record<number, SpelledPitch> = {};
    for (const [q, k] of altered) changes[k] = { ...q.pitch, alter: 0 };
    const firstK = altered[0]![1];
    out.push({
      what: `조표가 만드는 변화음 ${altered.length}개를 빠뜨리고 제자리 음으로 놓는다`,
      input: editMany(changes),
      codes: altered.map(() => 'WRONG_PITCH' as IssueCode),
      text: [`지금은 ${pitchName(changes[firstK]!)}`, `목표는 ${pitchName(exp(firstK))}`],
      firstSlot: String(firstK + 1),
    });
  }

  // 다섯 음 음계: 온음계의 음(F, B)이 끼어든다
  if (steps.join() === '2,2,3,2,3') {
    const pitch = (name: string, octave: number): SpelledPitch => ({ letter: name as Letter, alter: 0, octave });
    out.push({
      what: '장음계의 앞 여섯 음(C D E F G A)을 놓는다: 다섯 음 음계에 없는 F가 들어간다',
      input: input([pitch('C', 4), pitch('D', 4), pitch('E', 4), pitch('F', 4), pitch('G', 4), pitch('A', 4)].map((q, i) => ({ slot: i + 1, pitch: q }))),
      codes: ['WRONG_PITCH', 'WRONG_PITCH', 'WRONG_PITCH'],
      text: ['지금은 F4', '목표는 G4'],
      firstSlot: '4',
    });
    out.push({
      what: '마지막 칸에 B4를 놓는다(C5 대신 온음계의 일곱째 음을 놓는다)',
      input: edit(5, pitch('B', 4)),
      codes: ['WRONG_PITCH'],
      text: ['지금은 B4', '목표는 C5'],
      firstSlot: '6',
    });
    out.push({
      what: '장음계 일곱 음(C D E F G A B)을 모두 놓는다: 개수가 넘치고 넷째부터 어긋난다',
      input: input([pitch('C', 4), pitch('D', 4), pitch('E', 4), pitch('F', 4), pitch('G', 4), pitch('A', 4), pitch('B', 4)].map((q, i) => ({ slot: i + 1, pitch: q }))),
      codes: ['SCALE_LENGTH', 'WRONG_PITCH', 'WRONG_PITCH', 'WRONG_PITCH'],
      text: ['7개', '6개'],
    });
  }
  return out;
}

describe('판본 구성', () => {
  it('새 판본은 모두 여덟 개다: Q24 셋, Q25 하나, Q26 하나, Q07의 장음계 길 판본 셋', () => {
    expect(VARIANTS.map((x) => x.key)).toEqual([
      'scale.natural-minor/a-minor',
      'scale.natural-minor/d-minor',
      'scale.natural-minor/e-minor',
      'scale.harmonic-minor/a-harmonic-minor',
      'scale.pentatonic/c-pentatonic',
      'scale.major/g-major',
      'scale.major/d-major',
      'scale.major/bflat-major',
    ]);
  });

  it('판본의 이름과 판정 조건의 조 이름이 같고, 조 이름의 첫 글자가 시작음의 글자다', () => {
    for (const x of VARIANTS) {
      expect(x.v.label, x.key).toBe(x.v.evaluatorSpec.keyName);
      const first = answerInput(x.v) as { placed: Array<{ pitch: SpelledPitch }> };
      expect((x.v.evaluatorSpec.keyName as string)[0], x.key).toBe(first.placed[0]!.pitch.letter);
    }
  });
});

describe('정답은 자기 판정기를 통과한다', () => {
  it.each(VARIANTS.map((x) => [x.key, x] as const))('%s', (_key, x) => {
    const r = evaluate(x.v.evaluatorSpec, answerInput(x.v), x.v.score as Score);
    expect(r.issues).toEqual([]);
    expect(r.passed).toBe(true);
  });
});

describe('11.2의 2: 정답을 일부러 틀리게 바꾸면 기대한 설명이 나온다', () => {
  const ALL = VARIANTS.flatMap((x) => casesOf(x).map((c) => [`${x.key} · ${c.what}`, x, c] as const));

  it('판본마다 사례가 아홉 개 이상 만들어진다(누락, 순서, 옥타브, 표기, 음 높이, 개수, 그리고 음계의 특징)', () => {
    for (const x of VARIANTS) expect(casesOf(x).length, x.key).toBeGreaterThanOrEqual(9);
    expect(ALL.length).toBeGreaterThan(80);
  });

  it('단음계 판본에는 일곱째·여섯째 음 사례가, 조표가 있는 판본에는 조표 사례가, 다섯 음 음계에는 온음계 음 사례가 들어 있다', () => {
    const has = (key: string, part: string) => casesOf(VARIANTS.find((x) => x.key === key)!).some((c) => c.what.includes(part));
    for (const key of ['scale.natural-minor/a-minor', 'scale.natural-minor/d-minor', 'scale.natural-minor/e-minor', 'scale.harmonic-minor/a-harmonic-minor']) {
      expect(has(key, '일곱째 음을'), key).toBe(true);
      expect(has(key, '여섯째 음을'), key).toBe(true);
    }
    for (const key of ['scale.natural-minor/d-minor', 'scale.natural-minor/e-minor', 'scale.major/g-major', 'scale.major/d-major', 'scale.major/bflat-major']) expect(has(key, '조표가 만드는 변화음'), key).toBe(true);
    for (const key of ['scale.natural-minor/a-minor', 'scale.harmonic-minor/a-harmonic-minor', 'scale.pentatonic/c-pentatonic']) expect(has(key, '조표가 만드는 변화음'), key).toBe(false);
    expect(has('scale.pentatonic/c-pentatonic', '장음계'), 'pentatonic').toBe(true);
  });

  it.each(ALL)('%s', (_name, x, c) => {
    const r = evaluate(x.v.evaluatorSpec, c.input, x.v.score as Score);
    expect(r.passed, '틀리게 바꾼 입력이 통과했어요').toBe(false);
    expect(
      r.issues.map((i) => i.code),
      `${x.key}: ${c.what}`,
    ).toEqual(c.codes);
    const texts = renderAll(r.issues, x.quest.feedbackRules);
    expect(texts.every((s) => s.length > 0 && !s.includes('{')), '설명 문장에 채우지 못한 자리가 남았어요').toBe(true);
    const all = texts.join('\n');
    for (const w of c.text ?? []) expect(all, `설명에 '${w}'가 없어요`).toContain(w);
    if (c.firstSlot) expect(r.issues[0]!.target?.slotId, '첫 설명이 가리키는 칸').toBe(c.firstSlot);
    // 가리킨 칸 표식이 월드의 디딤돌과 패널이 쓰는 slotId(1부터)와 맞는다: 총평인 SCALE_LENGTH를 뺀 모든 설명에 칸이 있다
    for (const issue of r.issues) if (issue.code !== 'SCALE_LENGTH') expect(issue.target?.slotId, `${issue.code}에 가리킨 칸이 없어요`).toMatch(/^[1-9]\d*$/);
  });
});

describe('두 단음계를 섞은 입력: 일곱째 자리만 다르다고 말한다', () => {
  const natural = VARIANTS.find((x) => x.key === 'scale.natural-minor/a-minor')!;
  const harmonic = VARIANTS.find((x) => x.key === 'scale.harmonic-minor/a-harmonic-minor')!;

  it('자연단음계의 정답을 화성단음계 판본에 넣으면 일곱째만 어긋난다(G가 아니라 G♯)', () => {
    const r = evaluate(harmonic.v.evaluatorSpec, answerInput(natural.v), harmonic.v.score as Score);
    expect(r.issues.map((i) => [i.code, i.target?.slotId])).toEqual([['WRONG_PITCH', '7']]);
    expect(renderAll(r.issues, harmonic.quest.feedbackRules)).toEqual(['일곱 번째 자리: 지금은 G4예요. 목표는 G♯4예요.']);
  });

  it('화성단음계의 정답을 자연단음계 판본에 넣으면 일곱째만 어긋난다(G♯이 아니라 G)', () => {
    const r = evaluate(natural.v.evaluatorSpec, answerInput(harmonic.v), natural.v.score as Score);
    expect(r.issues.map((i) => [i.code, i.target?.slotId])).toEqual([['WRONG_PITCH', '7']]);
    expect(renderAll(r.issues, natural.quest.feedbackRules)).toEqual(['일곱 번째 자리: 지금은 G♯4예요. 목표는 G4예요.']);
  });

  it('두 판본의 정답은 일곱째 음 하나(G와 G♯)만 다르다', () => {
    const a = (answerInput(natural.v) as { placed: Array<{ pitch: SpelledPitch }> }).placed.map((x) => pitchName(x.pitch));
    const b = (answerInput(harmonic.v) as { placed: Array<{ pitch: SpelledPitch }> }).placed.map((x) => pitchName(x.pitch));
    expect(a.map((n, i) => (n === b[i] ? null : [i + 1, n, b[i]])).filter(Boolean)).toEqual([[7, 'G4', 'G♯4']]);
  });
});
