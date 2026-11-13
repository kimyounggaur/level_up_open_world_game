// 화면에 쓰는 이름과 짧은 문장 만들기. 음악 데이터는 domain에서 오고, 여기서는 말로만 바꾼다.
import type { Material } from '../../domain/challenge';
import { eventLabel } from '../../domain/challenge';
import type { ScoreEvent } from '../../domain/score';
import { TEMPO_REFERENCE_TICKS, VALUE_NAME_KO, countUnitTicks, describeTicks } from '../../domain/time';
import type { NoteValue, TempoReference } from '../../domain/time';
import { pitchName } from '../../domain/pitch';
import { expectedPitchesOf } from '../../domain/evaluators/orderedScale';
import { CLEF_NAME_KO } from '../../domain/staff';
import type { Clef } from '../../domain/staff';
import { fillTemplate } from '../../domain/feedback';
import type { QuestVariant } from '../../domain/content';
import type { Station } from '../../domain/world';

export const TEMPO_REFERENCE_NAME_KO: Record<TempoReference, string> = {
  quarter: '4분음표',
  dottedQuarter: '점4분음표',
  half: '2분음표',
  eighth: '8분음표',
};

/** 예: '4분음표 = 80 BPM' */
export const tempoText = (reference: TempoReference, bpm: number): string => `${TEMPO_REFERENCE_NAME_KO[reference]} = ${bpm} BPM`;

export const restValueName = (value: NoteValue): string => VALUE_NAME_KO[value].replace('음표', '쉼표');

/** 놓을 재료의 이름. 예: 'C4 4분음표', '4분쉼표' */
export function materialName(m: Material): string {
  return m.kind === 'rest' ? restValueName(m.value) : `${pitchName(m.pitch)} ${VALUE_NAME_KO[m.value]}`;
}

/** 사건의 이름. 예: 'C4 4분음표', '4분쉼표' */
export function eventName(e: ScoreEvent): string {
  const length = describeTicks(e.durationTicks).replace(/ 길이$/, '').replace(/ 하나$/, '');
  return e.type === 'rest' ? length.replace('음표', '쉼표') : `${eventLabel(e)} ${length}`;
}

/** 한 박의 이름. 4/4는 4분음표, 6/8은 점4분음표 */
export function beatName(meter: string): string {
  return beatNameOfTicks(countUnitTicks(meter));
}

/** 한 박의 틱으로 부르는 한 박의 이름(960틱은 4분음표, 1440틱은 점4분음표). '한 박'만 쓰지 않고 단위를 함께 적을 때 쓴다(11.2의 5) */
export function beatNameOfTicks(ticks: number): string {
  const found = (Object.keys(TEMPO_REFERENCE_TICKS) as TempoReference[]).find((r) => TEMPO_REFERENCE_TICKS[r] === ticks);
  return found ? TEMPO_REFERENCE_NAME_KO[found] : describeTicks(ticks);
}

/** 칸의 이름이 목표 음의 이름으로 시작하면('E4', 'B3 · 높은음자리표') 그 음을 직접 알려 주고 자리를 찾게 하는 과제다(Q09–Q11) */
const labelNamesTarget = (label: string, name: string): boolean => label === name || label.startsWith(`${name} · `);

/**
 * 목표 음의 이름을 음자리표별로 묶는다(처음 나온 차례). 칸의 이름이 음 이름이 아닌 과제(Q01처럼 '높은음자리표 보표')는 null이다.
 * 모든 칸이 같은 음이면 null이다: 그 경우는 '같은 음'으로 묶어 말한다.
 */
export function namedTargetsByClef(variant: QuestVariant): Array<{ clef: Clef; names: string[] }> | null {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'pitchSpelling') return null;
  const names = spec.targets.map((t) => pitchName(t.expected));
  if (names.every((n) => n === names[0])) return null;
  if (!spec.targets.every((t, i) => t.clef && labelNamesTarget(t.label, names[i]!))) return null;
  const groups: Array<{ clef: Clef; names: string[] }> = [];
  spec.targets.forEach((t, i) => {
    const g = groups.find((x) => x.clef === t.clef);
    if (g) g.names.push(names[i]!);
    else groups.push({ clef: t.clef!, names: [names[i]!] });
  });
  return groups;
}

/**
 * 오선에 놓는 과제의 안내 문장.
 * - 모든 칸의 목표가 같은 음이면 '같은 음'으로 묶어 말한다(Q01).
 * - 칸마다 목표 음의 이름이 적혀 있으면 음자리표별로 묶어 그 음을 말한다(Q09–Q11).
 * - 음계 순서(Q12)는 낮은 음부터 차례로 놓고, 칸마다 읽는 음자리표가 가온 도를 경계로 다르다고 알린다.
 */
export function spellingPrompt(variant: QuestVariant): string {
  const spec = variant.evaluatorSpec;
  if (spec.type === 'orderedScale') {
    const names = expectedPitchesOf(variant.score, spec.voiceId).map((p) => pitchName(p));
    return `${fillTemplate('{list:을를}', { list: names.join(', ') })} 낮은 음부터 차례로 놓아 보세요. 가온 도(C4)보다 낮은 칸은 낮은음자리표, 그 위 칸은 높은음자리표로 읽어요.`;
  }
  if (spec.type !== 'pitchSpelling') return '';
  const groups = namedTargetsByClef(variant);
  if (groups) {
    const parts = groups.map((g) => fillTemplate('{clef}에는 {list:을를}', { clef: CLEF_NAME_KO[g.clef], list: g.names.join(', ') }));
    return `${parts.join(', ')} 놓아 보세요.`;
  }
  const names = spec.targets.map((t) => pitchName(t.expected));
  const labels = spec.targets.map((t) => t.label);
  const where =
    labels.length === 2 ? fillTemplate('{a:와과} {b}', { a: labels[0]!, b: labels[1]! }) : labels.join(', ');
  if (names.every((n) => n === names[0])) return `${fillTemplate('같은 음 {n:을를}', { n: names[0]! })} ${where}에 각각 놓아 보세요.`;
  return `목표 음을 ${where}에 놓아 보세요.`;
}

/** 주제 태그의 화면 이름. 모르는 태그는 그대로 보인다 */
export const TOPIC_NAME_KO: Record<string, string> = {
  pitch: '음높이',
  clef: '음자리표',
  'ledger-line': '덧줄',
  staff: '오선',
  range: '음역',
  rhythm: '리듬',
  rest: '쉼표',
  'meter-4-4': '4/4박자',
  scale: '음계',
  major: '장음계',
  minor: '단음계',
  'natural-minor': '자연단음계',
  'harmonic-minor': '화성단음계',
  pentatonic: '다섯 음 음계',
  'whole-and-half-steps': '온음과 반음',
  triad: '3화음',
  inversion: '전위',
  interval: '음정',
  accidental: '임시표',
  tuplet: '셋잇단음',
  ensemble: '합주',
};

export const topicName = (tag: string): string => TOPIC_NAME_KO[tag] ?? tag;

export const INPUT_NAME_KO = { placement: '놓기', choice: '고르기', both: '놓기와 고르기' } as const;

/** 과제 카드의 한 줄: 성부 수, 가장 짧은 음가, 조작 방식. 난도를 숫자 하나로 적지 않는다(7.7) */
export function descriptorText(d: { voices: number; smallestValue: NoteValue; input: keyof typeof INPUT_NAME_KO }): string {
  return `성부 ${d.voices}개 · 가장 짧은 음가 ${VALUE_NAME_KO[d.smallestValue]} · 조작 ${INPUT_NAME_KO[d.input]}`;
}

/** 정거장 종류의 화면 이름(작업대, 설치물 원형) */
export const STATION_KIND_NAME_KO: Readonly<Record<Station['archetype'], string>> = {
  panel: '작업대',
  T1: '음계 길',
  T2: '징검다리',
  T3: '물레방아',
  T4: '종나무',
  T5: '계단밭',
  T6: '건반 다리',
  T7: '합주 무대',
};
