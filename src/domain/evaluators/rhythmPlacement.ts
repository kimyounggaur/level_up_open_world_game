// 리듬 배치 판정(Q02, Q03, Q13–Q19; 확장 X-2 박자 일반화).
// 마디 합이 맞는지와 음·쉼이 같은 자리에 같은 길이로 놓였는지를 따로 본다. 합만 맞는 오답은 통과하지 않는다.
// 입력은 틱 정수뿐이다. 화면 픽셀이나 시간선의 부동소수점 위치로 판정하지 않는다(W-3).
import type { Issue } from '../feedback';
import { pitchName, spellEquals } from '../pitch';
import { isNote, measureCountOf, resolveScore } from '../score';
import type { Score, ScoreEvent, TupletGroup } from '../score';
import { VALUE_NAME_KO, describeTicks, measureTicks, positionLabel, tupletNoteTicks } from '../time';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export interface RhythmPlacementSpec {
  type: 'rhythmPlacement';
  voiceId: string;
  /** 음높이까지 비교할지. false면 음/쉼과 길이만 본다 */
  requirePitch: boolean;
}

export interface RhythmPlacementInput {
  type: 'rhythmPlacement';
  /** 사용자가 만든 악보. 조표와 임시표는 판정기가 직접 풀어서 쓴다 */
  score: Score;
}

const KIND_KO = { note: '음표', rest: '쉼표' } as const;
const TUPLET_NAME_KO: Record<number, string> = { 2: '둘', 3: '셋', 4: '넷', 5: '다섯', 6: '여섯', 7: '일곱', 8: '여덟', 9: '아홉' };

export function tupletName(g: Pick<TupletGroup, 'actualNotes' | 'writtenBaseDuration'>): string {
  return `${VALUE_NAME_KO[g.writtenBaseDuration]} ${TUPLET_NAME_KO[g.actualNotes] ?? g.actualNotes}잇단음표`;
}

export function measureText(measureIndex: number, measureCount: number): string {
  return measureCount === 1 ? '한 마디' : `${measureIndex + 1}번째 마디`;
}

function groupOf(score: Score, e: ScoreEvent): TupletGroup | undefined {
  return e.groupId ? score.tuplets?.find((g) => g.groupId === e.groupId) : undefined;
}

function sameTuplet(a: TupletGroup, b: TupletGroup): boolean {
  return a.actualNotes === b.actualNotes && a.normalNotes === b.normalNotes && a.writtenBaseDuration === b.writtenBaseDuration;
}

function nameOf(e: ScoreEvent): string {
  return isNote(e) && e.resolvedPitch ? pitchName(e.resolvedPitch) : '쉼';
}

interface Positioned {
  at: number;
  issue: Issue;
}

export interface RhythmOptions {
  /** 여러 성부를 판정할 때 설명 앞에 붙일 이름. 예: '위 성부' */
  voiceLabel?: string;
}

export function evaluateRhythmPlacement(spec: RhythmPlacementSpec, expectedScore: Score, input: RhythmPlacementInput, options: RhythmOptions = {}): Evaluation {
  const exp = resolveScore(expectedScore);
  const act = resolveScore(input.score);
  const meter = exp.meter;
  const mLen = measureTicks(meter);
  const measures = measureCountOf(exp);
  const at = (e: ScoreEvent): number => e.measureIndex * mLen + e.onsetTicks;
  const byAt = (a: ScoreEvent, b: ScoreEvent): number => at(a) - at(b) || a.eventId.localeCompare(b.eventId);
  const expEvents = exp.events.filter((e) => e.voiceId === spec.voiceId).sort(byAt);
  const actEvents = act.events.filter((e) => e.voiceId === spec.voiceId).sort(byAt);
  const prefix = options.voiceLabel ? `${options.voiceLabel}의 ` : '';
  const whereOf = (abs: number): string => {
    const m = Math.floor(abs / mLen);
    const pos = positionLabel(abs % mLen, meter);
    return prefix + (measures > 1 ? `${m + 1}번째 마디의 ${pos}` : pos);
  };

  if (actEvents.length === 0) {
    const label = exp.voices.find((v) => v.voiceId === spec.voiceId)?.label ?? '배치한 음과 쉼';
    return makeEvaluation('rhythmPlacement', [{ code: 'MISSING_VOICE', params: { voiceLabel: label }, target: { voiceId: spec.voiceId } }]);
  }

  const found: Positioned[] = [];
  const add = (abs: number, issue: Issue): void => {
    found.push({ at: abs, issue });
  };

  // 1) 겹침: 같은 성부에서 앞 사건이 끝나기 전에 다음 사건이 시작되면 안 된다.
  for (let i = 1; i < actEvents.length; i++) {
    const prev = actEvents[i - 1]!;
    const cur = actEvents[i]!;
    if (at(prev) + prev.durationTicks > at(cur)) {
      add(at(cur), { code: 'OVERLAP', params: { where: whereOf(at(cur)) }, target: { eventId: cur.eventId, measureIndex: cur.measureIndex, onsetTicks: cur.onsetTicks } });
    }
  }

  // 2) 사건별 비교: 같은 시작 틱에 같은 종류, 같은 길이, (필요하면) 같은 음이 있는가
  const actByAt = new Map<number, ScoreEvent>();
  for (const e of actEvents) if (!actByAt.has(at(e))) actByAt.set(at(e), e);
  const reportedGroups = new Set<string>();
  const coveredSpans: Array<[number, number]> = [];

  for (const E of expEvents) {
    const t = at(E);
    const where = whereOf(t);
    const target = { eventId: E.eventId, measureIndex: E.measureIndex, onsetTicks: E.onsetTicks };
    const gE = groupOf(exp, E);
    if (gE && reportedGroups.has(gE.groupId)) continue; // 같은 묶음의 뒤 사건은 첫 설명으로 충분하다
    const A = actByAt.get(t);
    const span: [number, number] = [t, t + E.durationTicks];
    const fail = (issue: Issue): void => {
      add(t, issue);
      if (gE) {
        reportedGroups.add(gE.groupId);
        const members = expEvents.filter((x) => x.groupId === gE.groupId);
        const start = Math.min(...members.map(at));
        const end = Math.max(...members.map((x) => at(x) + x.durationTicks));
        coveredSpans.push([start, end]);
      } else {
        coveredSpans.push(span);
      }
    };
    if (!A) {
      fail({ code: 'MISSING_EVENT', params: { where, expectedKindKo: KIND_KO[E.type] }, target });
      continue;
    }
    if (E.type === 'rest' && A.type === 'note') {
      fail({ code: 'REST_EXPECTED_NOTE_FOUND', params: { where, actualName: nameOf(A) }, target });
      continue;
    }
    if (E.type === 'note' && A.type === 'rest') {
      fail({ code: 'NOTE_EXPECTED_REST_FOUND', params: { where, expectedName: nameOf(E) }, target });
      continue;
    }
    const gA = groupOf(act, A);
    if (gE) {
      if (!gA || !sameTuplet(gE, gA)) {
        fail({ code: 'TUPLET_MISMATCH', params: { where, expectedGroup: tupletName(gE) }, target });
        continue;
      }
      if (A.durationTicks !== E.durationTicks) {
        const each = tupletNoteTicks(gE.writtenBaseDuration, gE.actualNotes, gE.normalNotes);
        const total = each * gE.actualNotes;
        fail({ code: 'TUPLET_DURATION', params: { where, eachTicks: each, groupTotalText: describeTicks(total) }, target });
        continue;
      }
    } else if (gA) {
      fail({ code: 'TUPLET_MISMATCH', params: { where, expectedGroup: '묶음 없는 보통 음표' }, target });
      continue;
    } else if (A.durationTicks !== E.durationTicks) {
      fail({
        code: 'DURATION_MISMATCH',
        params: { where, expectedText: describeTicks(E.durationTicks), actualText: describeTicks(A.durationTicks) },
        target,
      });
      continue;
    }
    if (spec.requirePitch && isNote(E) && isNote(A)) {
      if (E.resolvedPitch && A.resolvedPitch && !spellEquals(E.resolvedPitch, A.resolvedPitch)) {
        fail({ code: 'PITCH_MISMATCH', params: { where, expectedName: pitchName(E.resolvedPitch), actualName: pitchName(A.resolvedPitch) }, target });
      }
    }
  }

  // 3) 목표에 없는 사건. 이미 설명한 구간 안에서 시작한 사건은 따로 말하지 않는다.
  const expAt = new Set(expEvents.map(at));
  for (const A of actEvents) {
    const t = at(A);
    if (expAt.has(t)) continue;
    if (coveredSpans.some(([s, e]) => t > s && t < e)) continue;
    add(t, { code: 'EXTRA_EVENT', params: { where: whereOf(t), actualKindKo: KIND_KO[A.type] }, target: { eventId: A.eventId, measureIndex: A.measureIndex, onsetTicks: A.onsetTicks } });
  }

  // 4) 마디 합. 합이 맞아도 위의 비교를 통과해야 한다. 합이 틀리면 남거나 넘치는 틱을 알려 준다.
  for (let m = 0; m < measures; m++) {
    const sum = actEvents.filter((e) => e.measureIndex === m).reduce((s, e) => s + e.durationTicks, 0);
    const mAt = m * mLen + mLen - 0.5;
    if (sum < mLen) {
      const remain = mLen - sum;
      add(mAt, { code: 'MEASURE_TICKS_REMAIN', params: { measureText: prefix + measureText(m, measures), remainTicks: remain, remainText: describeTicks(remain) }, target: { measureIndex: m } });
    } else if (sum > mLen) {
      const over = sum - mLen;
      add(mAt, { code: 'MEASURE_TICKS_OVER', params: { measureText: prefix + measureText(m, measures), overTicks: over, overText: describeTicks(over) }, target: { measureIndex: m } });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return makeEvaluation('rhythmPlacement', found.map((f) => f.issue), { measureTicks: mLen, measureCount: measures });
}

