// 7-1 오선 언덕의 과제 Q09–Q12(설계서 5.3): 값이 설계서의 표와 같고, 정답은 통과하며, 판본마다 일부러 틀린 입력에 기대한 설명이 나온다(11.2 검수 점검표 2번).
// 6단계의 review-wrong-cases는 rhythmPlacement·triadMembership·chordSequence만 대고, 이 과제들은 pitchSpelling(Q09–Q11)과 orderedScale(Q12)이라 여기서 맡는다.
// 방법: 판본마다 정답 입력을 만든 다음 일부러 틀리게 바꾼다. 어떻게 바꿀지와 기대하는 코드와 문장에 들어갈 말은 이 파일이 정한다(판정기의 코드를 베끼지 않는다).
// 틀리게 바꾸는 입력은 정답 데이터에서 만든 것이고 사람이 만든 오답이 아니다. 사람이 실제로 많이 하는 틀림인지는 검수에서 본다(관찰 대기).
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
import { CLEF_BOTTOM_LINE, CLEF_NAME_KO, describeStaffPosition } from '@/domain/staff';
import type { Clef } from '@/domain/staff';
import { isTwoClefPair, staffIdleText, staffListenLabel, staffPassedText } from '@/ui/challenge/staffText';
import { namedTargetsByClef, spellingPrompt } from '@/ui/common/format';
import { answerInput } from './answers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (id: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8'));
const Q09 = load('staff.lines-and-spaces');
const Q10 = load('staff.ledger-lines');
const Q11 = load('staff.middle-c-neighbors');
const Q12 = load('staff.range-ladder');
const QUESTS = [Q09, Q10, Q11, Q12];

interface VariantRef {
  key: string;
  quest: Record<string, any>;
  variantId: string;
  v: Record<string, any>;
}
const VARIANTS: VariantRef[] = QUESTS.flatMap((q) => (q.variantIds as string[]).map((variantId) => ({ key: `${q.questId}/${variantId}`, quest: q, variantId, v: q.variants[variantId] as Record<string, any> })));

/** 설계서 5.3의 표: 판본마다 놓을 음(칸 차례대로)과 음자리표 */
const DESIGN: Record<string, { names: string[]; clefs: Clef[] }> = {
  'staff.lines-and-spaces/treble-lines': { names: ['E4', 'G4', 'B4', 'D5', 'F5'], clefs: ['treble', 'treble', 'treble', 'treble', 'treble'] },
  'staff.lines-and-spaces/treble-spaces': { names: ['F4', 'A4', 'C5', 'E5'], clefs: ['treble', 'treble', 'treble', 'treble'] },
  'staff.lines-and-spaces/bass-lines': { names: ['G2', 'B2', 'D3', 'F3', 'A3'], clefs: ['bass', 'bass', 'bass', 'bass', 'bass'] },
  'staff.lines-and-spaces/bass-spaces': { names: ['A2', 'C3', 'E3', 'G3'], clefs: ['bass', 'bass', 'bass', 'bass'] },
  'staff.ledger-lines/treble-ledger': { names: ['C4', 'A5'], clefs: ['treble', 'treble'] },
  'staff.ledger-lines/treble-far-ledger': { names: ['A3', 'C6'], clefs: ['treble', 'treble'] },
  'staff.ledger-lines/bass-ledger': { names: ['E2', 'C2', 'C4', 'E4'], clefs: ['bass', 'bass', 'bass', 'bass'] },
  'staff.middle-c-neighbors/neighbors': { names: ['B3', 'B3', 'C4', 'C4', 'D4', 'D4'], clefs: ['treble', 'bass', 'treble', 'bass', 'treble', 'bass'] },
};
const SCALES: Record<string, string[]> = {
  'staff.range-ladder/c3-c5': ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5'],
  'staff.range-ladder/c2-c6': ['C2', 'C3', 'C4', 'C5', 'C6'],
};

const spelled = (p: Record<string, any>): SpelledPitch => ({ letter: p.letter as Letter, alter: p.alter as number, octave: p.octave as number });
const stepUp = (p: SpelledPitch, by = 1): SpelledPitch => ({ ...letterOctaveAt(diatonicIndex(p) + by), alter: p.alter });

/** 같은 소리 높이를 다른 이름으로 쓴다(E→F♭, F→E♯, B→C♭, C→B♯, D→C𝄪 …). 변화가 가장 작은 것을 고른다 */
function enharmonicOf(p: SpelledPitch): SpelledPitch {
  const midi = midiOf(p);
  const found: SpelledPitch[] = [];
  for (const letter of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as Letter[]) {
    for (let octave = p.octave - 1; octave <= p.octave + 1; octave++) {
      for (let alter = -2; alter <= 2; alter++) {
        const q = { letter, alter, octave };
        if (midiOf(q) === midi && !(q.letter === p.letter && q.alter === p.alter)) found.push(q);
      }
    }
  }
  found.sort((a, b) => Math.abs(a.alter) - Math.abs(b.alter) || Math.abs(a.octave - p.octave) - Math.abs(b.octave - p.octave));
  return found[0]!;
}

/** 이 음자리표에서 보표 위치 n에 놓이는 음(제자리) */
const pitchAt = (clef: Clef, position: number): SpelledPitch => ({ ...letterOctaveAt(diatonicIndex(CLEF_BOTTOM_LINE[clef]) + position), alter: 0 });
const positionOf = (clef: Clef, p: SpelledPitch): number => diatonicIndex(p) - diatonicIndex(CLEF_BOTTOM_LINE[clef]);

interface WrongCase {
  what: string;
  input: EvaluatorInput;
  /** 이 코드가 모두 나와야 한다 */
  codes: IssueCode[];
  /** 설명 문장에 들어가야 할 말 */
  text?: string[];
  /** 첫 설명이 가리키는 칸(판정기의 target.slotId) */
  firstSlot?: string;
}

function spellingCases(v: Record<string, any>): WrongCase[] {
  const spec = v.evaluatorSpec;
  const targets = spec.targets as Array<{ slotId: string; label: string; clef: Clef; expected: Record<string, any> }>;
  const right = (answerInput(v) as { placed: Array<{ slotId: string; pitch: SpelledPitch | null }> }).placed;
  const change = (i: number, pitch: SpelledPitch | null): EvaluatorInput => ({ type: 'pitchSpelling', placed: right.map((p, k) => (k === i ? { slotId: p.slotId, pitch } : p)) });
  const t = targets[0]!;
  const exp = spelled(t.expected);
  const last = targets.length - 1;
  const lastT = targets[last]!;
  const out: WrongCase[] = [];
  out.push({ what: `'${t.label}' 칸을 비운다`, input: change(0, null), codes: ['MISSING_PLACEMENT'], text: [t.label], firstSlot: t.slotId });
  out.push({
    what: `'${t.label}'를 온음계 한 칸 위에 놓는다(보표 위치가 하나 어긋난다)`,
    input: change(0, stepUp(exp)),
    codes: ['WRONG_STAFF_PITCH'],
    text: [`지금 위치는 ${pitchName(stepUp(exp))}`, `목표 ${pitchName(exp)}`, CLEF_NAME_KO[t.clef], describeStaffPosition(positionOf(t.clef, exp))],
    firstSlot: t.slotId,
  });
  out.push({ what: `마지막 칸 '${lastT.label}'를 온음계 한 칸 아래에 놓는다`, input: change(last, stepUp(spelled(lastT.expected), -1)), codes: ['WRONG_STAFF_PITCH'], firstSlot: lastT.slotId });
  out.push({
    what: `'${t.label}'를 한 옥타브 위에 놓는다(이름은 같고 높이만 다르다)`,
    input: change(0, { ...exp, octave: exp.octave + 1 }),
    codes: ['OCTAVE_MISMATCH'],
    text: ['옥타브가 달라요'],
    firstSlot: t.slotId,
  });
  const alt = enharmonicOf(exp);
  out.push({
    what: `'${t.label}'를 같은 소리의 다른 이름(${pitchName(alt)})으로 놓는다`,
    input: change(0, alt),
    codes: ['WRONG_SPELLING_SAME_PITCH'],
    text: ['소리 높이는 같지만 이름이 달라요', pitchName(alt), pitchName(exp)],
    firstSlot: t.slotId,
  });
  // 다른 음자리표의 읽는 법으로 놓는다: 그 음의 위치(다른 음자리표 기준)를 이 음자리표의 같은 위치에 놓는다
  const other: Clef = t.clef === 'treble' ? 'bass' : 'treble';
  const confused = pitchAt(t.clef, positionOf(other, exp));
  out.push({ what: `'${t.label}'를 ${CLEF_NAME_KO[other]}의 위치 그대로 놓는다(음자리표를 바꿔 읽는다)`, input: change(0, confused), codes: ['WRONG_STAFF_PITCH'], text: [CLEF_NAME_KO[t.clef]], firstSlot: t.slotId });
  out.push({
    what: '목표에 없는 칸에 음을 더 놓는다',
    input: { type: 'pitchSpelling', placed: [...right, { slotId: 'extra-column', pitch: exp }] },
    codes: ['EXTRA_PLACEMENT'],
    firstSlot: 'extra-column',
  });
  return out;
}

function scaleCases(v: Record<string, any>): WrongCase[] {
  const right = (answerInput(v) as { placed: Array<{ slot: number; pitch: SpelledPitch }> }).placed;
  const input = (placed: Array<{ slot: number; pitch: SpelledPitch | null }>): EvaluatorInput => ({ type: 'orderedScale', placed });
  const count = right.length;
  const mid = Math.floor(count / 2);
  const out: WrongCase[] = [];
  out.push({ what: '첫째 칸을 비운다', input: input(right.slice(1)), codes: ['MISSING_PLACEMENT'], text: ['첫 번째 자리에 음이 아직 없어요'], firstSlot: '1' });
  out.push({ what: '두 칸의 음을 맞바꾼다(순서가 바뀐다)', input: input(right.map((p, i) => ({ slot: p.slot, pitch: i === 0 ? right[mid]!.pitch : i === mid ? right[0]!.pitch : p.pitch }))), codes: ['WRONG_ORDER'], firstSlot: '1' });
  out.push({
    what: `${mid + 1}번째 칸을 한 옥타브 위에 놓는다`,
    input: input(right.map((p, i) => (i === mid ? { slot: p.slot, pitch: { ...p.pitch, octave: p.pitch.octave + 1 } } : p))),
    codes: ['OCTAVE_MISMATCH'],
    text: ['옥타브가 달라요'],
    firstSlot: String(mid + 1),
  });
  out.push({
    what: `${mid + 1}번째 칸을 같은 소리의 다른 이름으로 놓는다`,
    input: input(right.map((p, i) => (i === mid ? { slot: p.slot, pitch: enharmonicOf(p.pitch) } : p))),
    codes: ['WRONG_SPELLING_SAME_PITCH'],
    text: ['소리 높이는 같지만 이름이 달라요'],
    firstSlot: String(mid + 1),
  });
  out.push({
    what: `${mid + 1}번째 칸을 온음계 한 칸 위에 놓는다`,
    input: input(right.map((p, i) => (i === mid ? { slot: p.slot, pitch: stepUp(p.pitch) } : p))),
    codes: ['WRONG_PITCH'],
    firstSlot: String(mid + 1),
  });
  out.push({ what: '목표보다 많은 음을 놓는다', input: input([...right, { slot: count + 1, pitch: stepUp(right[count - 1]!.pitch) }]), codes: ['SCALE_LENGTH'], text: [`${count + 1}개`, `${count}개`] });
  return out;
}

const casesOf = (x: VariantRef): WrongCase[] => (x.v.evaluatorSpec.type === 'orderedScale' ? scaleCases(x.v) : spellingCases(x.v));

describe('설계서 5.3의 값(Q09–Q12)', () => {
  it('판정기는 Q09–Q11이 pitchSpelling, Q12가 orderedScale이다', () => {
    for (const q of [Q09, Q10, Q11]) for (const id of q.variantIds as string[]) expect(q.variants[id].evaluatorSpec.type, `${q.questId}/${id}`).toBe('pitchSpelling');
    for (const id of Q12.variantIds as string[]) expect(Q12.variants[id].evaluatorSpec.type, `${Q12.questId}/${id}`).toBe('orderedScale');
  });

  it('판본은 모두 열 개다: Q09 넷(높은음 줄·칸, 낮은음 줄·칸), Q10 셋(높은음 덧줄, 높은 도전, 낮은음 덧줄), Q11 하나, Q12 둘(높은 도전 포함)', () => {
    expect(Q09.variantIds).toEqual(['treble-lines', 'treble-spaces', 'bass-lines', 'bass-spaces']);
    expect(Q10.variantIds).toEqual(['treble-ledger', 'treble-far-ledger', 'bass-ledger']);
    expect(Q11.variantIds).toEqual(['neighbors']);
    expect(Q12.variantIds).toEqual(['c3-c5', 'c2-c6']);
    expect(VARIANTS).toHaveLength(10);
  });

  it.each(Object.entries(DESIGN))('%s: 놓을 음과 음자리표가 설계서와 같다', (key, want) => {
    const x = VARIANTS.find((y) => y.key === key)!;
    const targets = x.v.evaluatorSpec.targets as Array<{ clef: Clef; expected: Record<string, any>; label: string }>;
    expect(targets.map((t) => pitchName(spelled(t.expected)))).toEqual(want.names);
    expect(targets.map((t) => t.clef)).toEqual(want.clefs);
  });

  it.each(Object.entries(SCALES))('%s: 목표 악보의 음이 설계서의 순서와 같다(낮은 음부터)', (key, names) => {
    const x = VARIANTS.find((y) => y.key === key)!;
    const spec = x.v.evaluatorSpec;
    expect(spec.count).toBe(names.length);
    expect(spec.direction).toBe('ascending');
    expect(spec.requireSpelling).toBe(true);
    expect(spec.requireOctave).toBe(true);
    const notes = (x.v.score.events as any[]).filter((e) => e.type === 'note').map((e) => pitchName(spelled(e.resolvedPitch)));
    expect(notes).toEqual(names);
  });

  it('높은 도전 판본에는 이름에 그렇게 적혀 있다(난도 표시일 뿐이고 처음부터 고를 수 있다, 5.1)', () => {
    for (const key of ['staff.ledger-lines/treble-far-ledger', 'staff.range-ladder/c2-c6']) {
      const x = VARIANTS.find((y) => y.key === key)!;
      expect(x.v.label, key).toContain('높은 도전');
    }
  });

  it('칸의 이름이 목표 음의 이름이다(Q09–Q11): 이름을 알려 주고 보표에서 자리를 찾게 하는 과제다', () => {
    for (const x of VARIANTS.filter((y) => y.v.evaluatorSpec.type === 'pitchSpelling')) {
      for (const t of x.v.evaluatorSpec.targets as Array<{ label: string; expected: Record<string, any> }>) {
        const name = pitchName(spelled(t.expected));
        expect(t.label === name || t.label.startsWith(`${name} · `), `${x.key} ${t.label}`).toBe(true);
      }
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

  it('판본마다 사례가 여섯 개 이상 만들어진다(누락, 보표 위치나 순서, 옥타브, 표기, 추가)', () => {
    for (const x of VARIANTS) expect(casesOf(x).length, x.key).toBeGreaterThanOrEqual(6);
    expect(ALL.length).toBeGreaterThan(60);
  });

  it.each(ALL)('%s', (_name, x, c) => {
    const spec = x.v.evaluatorSpec;
    const r = evaluate(spec, c.input, x.v.score as Score);
    const codes = r.issues.map((i) => i.code);
    expect(r.passed, '틀리게 바꾼 입력이 통과했어요').toBe(false);
    for (const code of c.codes) expect(codes, `${x.key}: ${c.what}`).toContain(code);
    const texts = renderAll(r.issues);
    expect(texts.every((s) => s.length > 0 && !s.includes('{')), '설명 문장에 채우지 못한 자리가 남았어요').toBe(true);
    const all = texts.join('\n');
    for (const word of c.text ?? []) expect(all, `설명에 '${word}'가 없어요`).toContain(word);
    if (c.firstSlot) expect(r.issues[0]!.target?.slotId, '첫 설명이 가리키는 칸').toBe(c.firstSlot);
    // 판정이 가리킨 칸 표식이 월드와 패널에서 쓰는 slotId와 맞는다: 모든 이슈에 target이 있다(총평 이슈는 SCALE_LENGTH뿐이다)
    for (const issue of r.issues) if (issue.code !== 'SCALE_LENGTH') expect(issue.target?.slotId, `${issue.code}에 가리킨 칸이 없어요`).toBeDefined();
  });

  it('보표 위치의 설명은 설계서 4.7의 예와 같은 모양이다: 지금 위치는 …예요. 목표 …는 음자리표의 … 있어요', () => {
    const x = VARIANTS.find((y) => y.key === 'staff.ledger-lines/treble-ledger')!;
    const spec = x.v.evaluatorSpec;
    const input: EvaluatorInput = { type: 'pitchSpelling', placed: [{ slotId: 'treble-c4', pitch: { letter: 'E', alter: 0, octave: 4 } }, { slotId: 'treble-a5', pitch: { letter: 'A', alter: 0, octave: 5 } }] };
    const r = evaluate(spec, input, x.v.score as Score);
    expect(renderAll(r.issues)).toEqual(['지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.']);
  });

  it('위 첫 덧줄의 A5와 낮은음자리표 위 첫 덧줄의 C4도 말로 설명된다', () => {
    const bass = VARIANTS.find((y) => y.key === 'staff.ledger-lines/bass-ledger')!;
    const input: EvaluatorInput = {
      type: 'pitchSpelling',
      placed: [
        { slotId: 'bass-e2', pitch: { letter: 'E', alter: 0, octave: 2 } },
        { slotId: 'bass-c2', pitch: { letter: 'C', alter: 0, octave: 2 } },
        { slotId: 'bass-c4', pitch: { letter: 'D', alter: 0, octave: 4 } },
        { slotId: 'bass-e4', pitch: { letter: 'E', alter: 0, octave: 4 } },
      ],
    };
    const r = evaluate(bass.v.evaluatorSpec, input, bass.v.score as Score);
    expect(renderAll(r.issues)).toEqual(['지금 위치는 D4예요. 목표 C4는 낮은음자리표의 위 첫 덧줄에 있어요.']);
  });
});

describe('안내 문장: 오선 패널과 월드의 계단밭이 같은 문장을 쓴다', () => {
  const x = (key: string) => VARIANTS.find((y) => y.key === key)!.v as any;

  it('Q09–Q11의 안내는 음자리표별로 묶어 놓을 음을 알려 준다', () => {
    expect(spellingPrompt(x('staff.lines-and-spaces/treble-lines'))).toBe('높은음자리표에는 E4, G4, B4, D5, F5를 놓아 보세요.');
    expect(spellingPrompt(x('staff.lines-and-spaces/bass-spaces'))).toBe('낮은음자리표에는 A2, C3, E3, G3을 놓아 보세요.');
    expect(spellingPrompt(x('staff.ledger-lines/treble-ledger'))).toBe('높은음자리표에는 C4, A5를 놓아 보세요.');
    expect(spellingPrompt(x('staff.middle-c-neighbors/neighbors'))).toBe('높은음자리표에는 B3, C4, D4를, 낮은음자리표에는 B3, C4, D4를 놓아 보세요.');
  });

  it('Q12의 안내는 낮은 음부터 차례로 놓고, 가온 도를 경계로 읽는 음자리표가 달라진다고 알린다', () => {
    expect(spellingPrompt(x('staff.range-ladder/c3-c5'))).toBe('C3, E3, G3, C4, E4, G4, C5를 낮은 음부터 차례로 놓아 보세요. 가온 도(C4)보다 낮은 칸은 낮은음자리표, 그 위 칸은 높은음자리표로 읽어요.');
    expect(spellingPrompt(x('staff.range-ladder/c2-c6'))).toContain('C2, C3, C4, C5, C6을 낮은 음부터');
  });

  it('Q01의 안내는 그대로다(같은 음을 두 보표에)', () => {
    const q01 = load('pitch.same-note-two-clefs');
    expect(spellingPrompt(q01.variants['middle-c'])).toBe('같은 음 C4를 높은음자리표 보표와 낮은음자리표 보표에 각각 놓아 보세요.');
    expect(namedTargetsByClef(q01.variants['middle-c'])).toBeNull();
  });

  it('음자리표별로 묶는 것은 칸의 이름이 음 이름인 과제만이다', () => {
    expect(namedTargetsByClef(x('staff.lines-and-spaces/treble-lines'))).toEqual([{ clef: 'treble', names: ['E4', 'G4', 'B4', 'D5', 'F5'] }]);
    expect(namedTargetsByClef(x('staff.middle-c-neighbors/neighbors'))).toEqual([
      { clef: 'treble', names: ['B3', 'C4', 'D4'] },
      { clef: 'bass', names: ['B3', 'C4', 'D4'] },
    ]);
    expect(namedTargetsByClef(x('staff.range-ladder/c3-c5'))).toBeNull(); // 음계 순서는 판정 목표가 없다
  });

  it('두 칸 과제(Q01)는 원래의 문장을 그대로 쓰고, 그 밖의 과제는 칸 수를 말한다', () => {
    const two = [{ clef: 'treble' as const }, { clef: 'bass' as const }];
    const five = Array.from({ length: 5 }, () => ({ clef: 'treble' as const }));
    expect(isTwoClefPair(two)).toBe(true);
    expect(isTwoClefPair(five)).toBe(false);
    expect(isTwoClefPair([{ clef: 'treble' }, { clef: 'treble' }])).toBe(false);
    expect(staffPassedText(two)).toBe('두 보표의 음이 목표와 같아요.');
    expect(staffPassedText(five)).toBe('놓은 음이 모두 목표와 같아요.');
    expect(staffIdleText(0, two)).toBe("두 보표에 모두 놓고 '배치 확인'을 눌러 보세요.");
    expect(staffIdleText(2, two)).toBe("다 놓았어요. '배치 확인'을 눌러 보세요.");
    expect(staffIdleText(1, five)).toBe("5개 모두 놓고 '배치 확인'을 눌러 보세요.");
    expect(staffIdleText(5, five)).toBe("다 놓았어요. '배치 확인'을 눌러 보세요.");
    expect(staffListenLabel(two)).toBe('두 음 듣기');
    expect(staffListenLabel(five)).toBe('놓은 음 듣기');
  });
});
