// 음 순서 판정(Q07, Q12, Q24–Q26, Q30, Q31; 확장 X-1 일반화, X-4 해석 음 비교).
// 칸(slot) 번호 순서대로 목표 음과 비교한다. 칸의 좌표와 걸은 방향은 보지 않는다(W-3).
// 목표는 과제 판본의 악보에서 ScoreResolver로 풀어 얻는다. 음 개수·방향·간격은 데이터가 정한다.
import type { Issue } from '../feedback';
import { midiOf, midiToSharpName, pitchClassOf, pitchName } from '../pitch';
import type { ResolvedPitch, SpelledPitch } from '../pitch';
import { isNote, resolveScore } from '../score';
import type { Score } from '../score';
import { measureTicks, ordinalPosition } from '../time';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export interface OrderedScaleSpec {
  type: 'orderedScale';
  voiceId: string;
  /** 놓아야 하는 음의 개수(2–13). 설계서 5.9의 X-1은 5–13이라고 적었지만 Q30(X-4)은 깃발이 넷이라서 콘텐츠 검사는 2–13을 받는다(D-220) */
  count: number;
  /**
   * 정답 음이 한 방향으로만 가는 음계('ascending', 'descending')인가, 오르내림이 섞인 열('sequence', X-4)인가.
   * 'sequence'는 한 마디 안의 임시표처럼 풀린 음이 그대로 열을 이루는 과제다. 간격 목록(midiSteps)은 쓰지 않는다.
   */
  direction: 'ascending' | 'descending' | 'sequence';
  /** 음이름(문자와 변화)까지 맞아야 하는가. false면 소리 높이만 본다 */
  requireSpelling: boolean;
  /** 옥타브까지 맞아야 하는가 */
  requireOctave: boolean;
  /** 인접한 음 사이의 반음 수. 목표 악보와 맞는지는 콘텐츠 검사가 확인한다 */
  midiSteps?: number[];
  /** 설명에 쓰는 조 이름. 예: 'F장조' */
  keyName?: string;
  /** 설명에 쓰는 칸의 이름. 기본 '자리' */
  slotLabel?: string;
}

export interface OrderedPlacement {
  /** 1부터 */
  slot: number;
  /** 기보 음이 있으면 음이름까지 비교한다 */
  pitch?: SpelledPitch | null;
  /** 이름 없이 소리 높이만 있을 때(건반 널에 꽂은 깃발 등) */
  midi?: number | null;
}

export interface OrderedScaleInput {
  type: 'orderedScale';
  placed: OrderedPlacement[];
}

interface Actual {
  pitch?: SpelledPitch;
  midi: number;
}

/** 목표 악보에서 이 성부의 음을 시간 순서로 풀어 낸다(내림 방향도 악보의 시간 순서 그대로). */
export function expectedPitchesOf(expectedScore: Score, voiceId: string): ResolvedPitch[] {
  const mLen = measureTicks(expectedScore.meter);
  const resolved = resolveScore(expectedScore);
  return resolved.events
    .filter((e) => e.voiceId === voiceId && isNote(e))
    .sort((a, b) => a.measureIndex * mLen + a.onsetTicks - (b.measureIndex * mLen + b.onsetTicks))
    .map((e) => {
      if (!isNote(e) || !e.resolvedPitch) throw new Error(`해석된 음이 없어요: ${e.eventId}`);
      return e.resolvedPitch;
    });
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function matches(spec: OrderedScaleSpec, act: Actual, exp: ResolvedPitch): boolean {
  if (act.pitch) {
    if (spec.requireSpelling) {
      if (act.pitch.letter !== exp.letter || act.pitch.alter !== exp.alter) return false;
      return !spec.requireOctave || act.pitch.octave === exp.octave;
    }
    return spec.requireOctave ? midiOf(act.pitch) === exp.midi : pitchClassOf(act.pitch) === pitchClassOf(exp);
  }
  return spec.requireOctave ? act.midi === exp.midi : mod12(act.midi) === mod12(exp.midi);
}

export function evaluateOrderedScale(spec: OrderedScaleSpec, expectedScore: Score, input: OrderedScaleInput): Evaluation {
  const expected = expectedPitchesOf(expectedScore, spec.voiceId);
  if (expected.length !== spec.count) {
    throw new Error(`콘텐츠 오류: 목표 악보의 음이 ${expected.length}개인데 count는 ${spec.count}예요.`);
  }
  const label = spec.slotLabel ?? '자리';
  const actualBySlot = new Map<number, Actual>();
  for (const p of input.placed) {
    if (p.pitch) actualBySlot.set(p.slot, { pitch: p.pitch, midi: midiOf(p.pitch) });
    else if (typeof p.midi === 'number') actualBySlot.set(p.slot, { midi: p.midi });
  }
  const issues: Issue[] = [];
  const where = (slot: number): string => `${ordinalPosition(slot)} ${label}`;
  const baseParams = (slot: number): Record<string, string | number> => ({
    position: slot,
    positionOrdinal: ordinalPosition(slot),
    where: where(slot),
    ...(spec.keyName ? { keyName: spec.keyName } : {}),
  });

  // 목표보다 큰 칸 번호에 놓은 음
  const beyond = [...actualBySlot.keys()].filter((s) => s < 1 || s > spec.count);
  if (beyond.length > 0) {
    issues.push({ code: 'SCALE_LENGTH', params: { actual: actualBySlot.size, expected: spec.count } });
  }

  // 1) 두 칸이 서로 바뀐 경우는 한 문장으로 말한다
  const consumed = new Set<number>();
  for (let i = 1; i <= spec.count; i++) {
    for (let j = i + 1; j <= spec.count; j++) {
      const a = actualBySlot.get(i);
      const b = actualBySlot.get(j);
      if (!a || !b || consumed.has(i) || consumed.has(j)) continue;
      const ei = expected[i - 1]!;
      const ej = expected[j - 1]!;
      if (!matches(spec, a, ei) && !matches(spec, b, ej) && matches(spec, a, ej) && matches(spec, b, ei)) {
        consumed.add(i);
        consumed.add(j);
        issues.push({ code: 'WRONG_ORDER', params: { position: i, otherPosition: j, where: where(i) }, target: { slotId: String(i), position: i } });
      }
    }
  }

  // 2) 칸마다 비교
  for (let slot = 1; slot <= spec.count; slot++) {
    if (consumed.has(slot)) continue;
    const exp = expected[slot - 1]!;
    const act = actualBySlot.get(slot);
    const target = { slotId: String(slot), position: slot };
    if (!act) {
      issues.push({ code: 'MISSING_PLACEMENT', params: baseParams(slot), target });
      continue;
    }
    if (matches(spec, act, exp)) continue;
    const expectedName = pitchName(exp);
    const actualName = act.pitch ? pitchName(act.pitch) : midiToSharpName(act.midi);
    const params = { ...baseParams(slot), expectedName, actualName, expectedLetter: exp.letter };
    if (act.pitch && act.midi === exp.midi) {
      issues.push({ code: 'WRONG_SPELLING_SAME_PITCH', params, target });
    } else if (act.pitch && act.pitch.letter === exp.letter && act.pitch.alter === exp.alter) {
      issues.push({ code: 'OCTAVE_MISMATCH', params, target });
    } else if (!act.pitch) {
      issues.push({ code: 'PITCH_MISMATCH', params, target });
    } else {
      issues.push({ code: 'WRONG_PITCH', params, target });
    }
  }
  // 칸 순서대로 보여 준다
  issues.sort((a, b) => (a.target?.position ?? 0) - (b.target?.position ?? 0));
  return makeEvaluation('orderedScale', issues, { expectedMidi: expected.map((p) => p.midi) });
}
