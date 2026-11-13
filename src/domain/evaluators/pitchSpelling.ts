// 음이름 판정(Q01, Q04, Q09–Q11, Q27): 보표에 놓은 음의 이름·변화·옥타브가 목표와 같은가.
// 소리 높이(MIDI)가 같아도 표기가 다르면 통과하지 않는다.
import type { Issue } from '../feedback';
import { midiOf, pitchName, samePitchClassSpelling, spellEquals } from '../pitch';
import type { SpelledPitch } from '../pitch';
import { CLEF_NAME_KO, describeStaffPosition, staffPositionOf } from '../staff';
import type { Clef } from '../staff';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export interface PitchSpellingTarget {
  slotId: string;
  /** 화면에 쓰는 이름. 예: '높은음자리표 보표' */
  label: string;
  expected: SpelledPitch;
  /** 보표에 놓는 과제면 음자리표. 목표 위치를 말로 설명하는 데 쓴다 */
  clef?: Clef;
  /** 정답 악보에서 이 목표가 가리키는 음의 id. 콘텐츠 검사가 악보와 맞는지 확인한다 */
  eventId?: string;
}

export interface PitchSpellingSpec {
  type: 'pitchSpelling';
  targets: PitchSpellingTarget[];
}

export interface PitchSpellingInput {
  type: 'pitchSpelling';
  placed: Array<{ slotId: string; pitch: SpelledPitch | null }>;
}

export function evaluatePitchSpelling(spec: PitchSpellingSpec, input: PitchSpellingInput): Evaluation {
  const issues: Issue[] = [];
  const bySlot = new Map<string, SpelledPitch>();
  for (const p of input.placed) if (p.pitch) bySlot.set(p.slotId, p.pitch);

  for (const t of spec.targets) {
    const actual = bySlot.get(t.slotId);
    const target = { slotId: t.slotId };
    if (!actual) {
      issues.push({ code: 'MISSING_PLACEMENT', params: { where: t.label }, target });
      continue;
    }
    if (spellEquals(actual, t.expected)) continue;
    const params = {
      where: t.label,
      actualName: pitchName(actual),
      expectedName: pitchName(t.expected),
      expectedLetter: t.expected.letter,
    };
    if (midiOf(actual) === midiOf(t.expected)) {
      issues.push({ code: 'WRONG_SPELLING_SAME_PITCH', params, target });
    } else if (samePitchClassSpelling(actual, t.expected)) {
      issues.push({ code: 'OCTAVE_MISMATCH', params, target });
    } else if (t.clef) {
      issues.push({
        code: 'WRONG_STAFF_PITCH',
        params: {
          ...params,
          clefName: CLEF_NAME_KO[t.clef],
          expectedPositionText: describeStaffPosition(staffPositionOf(t.clef, t.expected)),
        },
        target,
      });
    } else {
      issues.push({ code: 'WRONG_PITCH', params, target });
    }
  }
  const known = new Set(spec.targets.map((t) => t.slotId));
  for (const slotId of bySlot.keys()) {
    if (!known.has(slotId)) issues.push({ code: 'EXTRA_PLACEMENT', params: { where: slotId }, target: { slotId } });
  }
  return makeEvaluation('pitchSpelling', issues);
}
