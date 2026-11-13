// 화음 사건 목록의 순서 판정(확장 X-3: Q21 세 기둥, Q23 화음 이어 걷기). 화음 하나를 보는 일은 triadMembership 판정기가 그대로 한다.
// 이 판정기가 새로 아는 것은 '사건 목록'뿐이다: 몇 번째 화음이 어느 나무의 종들인가. 나무마다 구성음의 음급·표기·개수를 차례로 본다.
// 전위는 판정하지 않는다. reportTones가 있는 화음은 지금의 전위를 details에 알려 줄 뿐이고, 통과와 실패에 영향을 주지 않는다(Q23).
// 가로 위치와 걸은 시간은 입력으로 받을 수 없다. 같은 음이면 같은 결과가 나온다(W-3).
import type { Issue } from '../feedback';
import { midiOf } from '../pitch';
import { currentInversion } from './inversion';
import type { InversionKind, ToneSpelling } from './inversion';
import { evaluateTriadMembership } from './triadMembership';
import type { PlacedTone, RequiredSpelling, TriadMembershipSpec } from './triadMembership';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

/** 화음 사건 하나: 어느 나무에 거는 어떤 화음인가 */
export interface ChordEventSpec {
  /** 판정 문장에서 '어디'로 쓰는 이름. 예: '으뜸화음 나무', '마지막 으뜸화음' */
  label: string;
  /** 이 화음을 거는 나무(0부터). 같은 나무를 두 번 가리켜도 된다(처음과 끝의 으뜸화음) */
  tree: number;
  requiredPitchClasses: number[];
  requiredSpellings?: RequiredSpelling[];
  noteCount?: number;
  allowDoubling?: boolean;
  requiredMidi?: number[];
  /** 지금의 전위를 알려 줄 화음이면 근음, 3음, 5음. 판정에는 쓰지 않는다 */
  reportTones?: [ToneSpelling, ToneSpelling, ToneSpelling];
}

export interface ChordSequenceSpec {
  type: 'chordSequence';
  /** 나무의 수. 사건의 tree는 0부터 trees − 1까지다 */
  trees: number;
  /** 차례대로 보는 화음 사건 */
  events: ChordEventSpec[];
}

export interface ChordSequenceInput {
  type: 'chordSequence';
  /** 나무마다 걸린 음(칸 번호 차례). 사건의 tree가 이 목록의 자리를 가리킨다 */
  trees: PlacedTone[][];
}

/** 사건 하나의 결과. 같은 나무에 같은 조건이 앞에 있으면 그 결과를 그대로 쓰고 문제는 다시 적지 않는다 */
export interface ChordEventResult {
  label: string;
  tree: number;
  passed: boolean;
  /** reportTones가 있는 화음의 지금 전위. 구성음이 다 있지 않으면 null */
  inversion: InversionKind | null;
  /** reportTones가 있을 때 가장 낮은 음의 MIDI. 걸린 음이 없으면 null */
  bassMidi: number | null;
}

/** 사건 하나를 triadMembership이 받는 판정 조건으로 바꾼다 */
export function triadSpecOfEvent(event: ChordEventSpec): TriadMembershipSpec {
  return {
    type: 'triadMembership',
    requiredPitchClasses: event.requiredPitchClasses,
    ...(event.requiredSpellings ? { requiredSpellings: event.requiredSpellings } : {}),
    ...(event.noteCount !== undefined ? { noteCount: event.noteCount } : {}),
    ...(event.allowDoubling !== undefined ? { allowDoubling: event.allowDoubling } : {}),
    ...(event.requiredMidi ? { requiredMidi: event.requiredMidi } : {}),
  };
}

/** 한 나무에 걸린 음으로 사건 하나를 본다. 판정과 전위 알림 모두 같은 음을 읽는다 */
export function evaluateChordEvent(event: ChordEventSpec, notes: readonly PlacedTone[]): { evaluation: Evaluation; result: ChordEventResult } {
  const evaluation = evaluateTriadMembership(triadSpecOfEvent(event), { type: 'triadMembership', notes: [...notes] });
  let inversion: InversionKind | null = null;
  let bassMidi: number | null = null;
  if (event.reportTones) {
    const cur = currentInversion({ type: 'inversion', tones: event.reportTones, targetInversion: 'root' }, { type: 'inversion', notes: notes.map((n) => ({ pitch: n.pitch })) });
    inversion = cur.kind;
    bassMidi = cur.bass ? midiOf(cur.bass) : null;
  }
  return { evaluation, result: { label: event.label, tree: event.tree, passed: evaluation.passed, inversion, bassMidi } };
}

export function evaluateChordSequence(spec: ChordSequenceSpec, input: ChordSequenceInput): Evaluation {
  const issues: Issue[] = [];
  const results: ChordEventResult[] = [];
  // 같은 나무에 같은 조건이 이미 나왔으면(처음과 끝의 으뜸화음) 같은 문제를 두 번 말하지 않는다
  const judged = new Map<string, ChordEventResult>();
  for (const event of spec.events) {
    const key = `${event.tree}|${JSON.stringify(triadSpecOfEvent(event))}`;
    const before = judged.get(key);
    const { evaluation, result } = evaluateChordEvent(event, input.trees[event.tree] ?? []);
    if (before) {
      results.push({ ...result, passed: before.passed });
      continue;
    }
    judged.set(key, result);
    results.push(result);
    for (const issue of evaluation.issues) issues.push({ ...issue, params: { ...issue.params, where: event.label } });
  }
  return makeEvaluation('chordSequence', issues, { events: results });
}
