// 판정이 알려 준 자리(시작 틱, 마디)를 시간선 조각에 옮긴다. 판정기는 화면을 모르고, 화면은 조각 key만 안다.
import type { Issue } from '../../domain/feedback';
import type { TimelineBlock, TimelineSpec } from '../../domain/timeline';

export interface BlockMarks {
  /** 고치라고 한 조각의 key */
  errorKeys: Set<string>;
  /** 마디가 덜 채워졌다고 한 마디의 빈 조각 key(남은 구간) */
  remainKeys: Set<string>;
}

/** 묶음 전체가 틀렸다고 말하는 문제(길이나 묶음이 목표와 다르다). 돌 하나의 음이나 쉼이 틀린 것과 다르다 */
const GROUP_WIDE_CODES: ReadonlySet<string> = new Set(['TUPLET_MISMATCH', 'TUPLET_DURATION']);

/**
 * `blocks`는 한 성부의 한 마디 전체 조각이어야 한다(창에 자른 조각이 아니라).
 * - 시작 틱이 있는 문제: 그 틱을 덮는 조각(사건이나 빈 칸)에 표시한다.
 * - 묶음이 틀렸다는 문제(TUPLET_MISMATCH, TUPLET_DURATION): 묶음의 모든 돌에 표시한다(묶음은 한 벌로만 놓이므로).
 *   돌 하나의 음이나 쉼이 틀린 문제는 그 돌에만 표시한다.
 * - 마디가 덜 채워졌다는 문제: 그 마디의 빈 조각을 남은 구간으로 강조한다.
 */
export function marksOf(issues: readonly Issue[], blocks: readonly TimelineBlock[], at: { measureIndex: number; voiceId?: string }): BlockMarks {
  const errorKeys = new Set<string>();
  const remainKeys = new Set<string>();
  const wholeGroups = new Set<string>();
  for (const issue of issues) {
    const t = issue.target;
    if (!t) continue;
    if (t.voiceId !== undefined && at.voiceId !== undefined && t.voiceId !== at.voiceId) continue;
    if ((t.measureIndex ?? 0) !== at.measureIndex) continue;
    if (issue.code === 'MEASURE_TICKS_REMAIN') {
      for (const b of blocks) if (b.kind === 'empty') remainKeys.add(b.key);
      continue;
    }
    const onset = t.onsetTicks;
    if (onset === undefined) continue;
    const hit = blocks.find((b) => b.fullStart <= onset && onset < b.fullEnd);
    if (!hit) continue;
    errorKeys.add(hit.key);
    if (hit.groupId && GROUP_WIDE_CODES.has(issue.code)) wholeGroups.add(hit.groupId);
  }
  for (const b of blocks) if (b.groupId && wholeGroups.has(b.groupId)) errorKeys.add(b.key);
  return { errorKeys, remainKeys };
}

/** 박 창 중에서 고칠 곳이 걸친 창의 번호들 */
export function windowsWithMarks(spec: TimelineSpec, blocks: readonly TimelineBlock[], marks: BlockMarks): Set<number> {
  const found = new Set<number>();
  for (const b of blocks) {
    if (!marks.errorKeys.has(b.key) && !marks.remainKeys.has(b.key)) continue;
    const first = Math.floor(b.fullStart / spec.beatTicks);
    const last = Math.floor((Math.min(b.fullEnd, spec.measureTicks) - 1) / spec.beatTicks);
    for (let w = first; w <= last; w++) found.add(w);
  }
  return found;
}

/** 틀린 조각의 사건 id들. 악보 그림에 표시를 붙일 때 쓴다 */
export function errorEventIdsOf(blocks: readonly TimelineBlock[], marks: BlockMarks): Record<string, 'error'> {
  const out: Record<string, 'error'> = {};
  for (const b of blocks) if (b.eventId && marks.errorKeys.has(b.key)) out[b.eventId] = 'error';
  return out;
}
