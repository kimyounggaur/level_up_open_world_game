// 7-2 음계의 종류: 인접한 음 사이의 반음 수 목록(orderedScale의 midiSteps)에서 음계의 이름을 읽는다.
// 안내 글(통과 문장, 패널 문장)이 '장음계'로 고정되지 않고, 과제 데이터가 가리키는 음계를 부르게 한다.
// 목록은 설계서 5.8의 간격과 같고, 정답 악보와 맞는지는 콘텐츠 검사(content.ts의 SPEC_SCORE_MISMATCH)가 이미 본다.
// 아는 목록이 아니면 '음계'로 부른다: 알지 못하는 음계에 틀린 이름을 붙이지 않는다.

export type ScaleKindId = 'major' | 'naturalMinor' | 'harmonicMinor' | 'pentatonic';

export interface ScaleKind {
  id: ScaleKindId;
  /** 화면에 쓰는 이름 */
  name: string;
  /** 인접한 음 사이의 반음 수 */
  steps: readonly number[];
}

export const SCALE_KINDS: readonly ScaleKind[] = [
  { id: 'major', name: '장음계', steps: [2, 2, 1, 2, 2, 2, 1] },
  { id: 'naturalMinor', name: '자연단음계', steps: [2, 1, 2, 2, 1, 2, 2] },
  { id: 'harmonicMinor', name: '화성단음계', steps: [2, 1, 2, 2, 1, 3, 1] },
  { id: 'pentatonic', name: '다섯 음 음계', steps: [2, 2, 3, 2, 3] },
];

/** 아는 목록에 없을 때 쓰는 이름 */
export const GENERIC_SCALE_NAME = '음계';

/** 간격 목록이 아는 음계와 정확히 같으면 그 음계, 아니면 null. 간격이 없는 판정기(null)도 null이다 */
export function scaleKindOf(steps: readonly number[] | undefined): ScaleKind | null {
  if (!steps) return null;
  return SCALE_KINDS.find((k) => k.steps.length === steps.length && k.steps.every((s, i) => s === steps[i])) ?? null;
}

/** 안내 글에 쓰는 음계 이름. 모르면 '음계' */
export const scaleNameOf = (steps: readonly number[] | undefined): string => scaleKindOf(steps)?.name ?? GENERIC_SCALE_NAME;
