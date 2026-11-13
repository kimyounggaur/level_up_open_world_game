// 화음 구성음 판정(Q05, Q20–Q23; 확장 X-3). 구성음의 음급 집합·표기·개수를 본다.
// 가로 순서와 옥타브는 기본적으로 보지 않는다. 전위는 inversion 판정기의 일이다.
import type { Issue } from '../feedback';
import { alterSymbol, midiOf, pitchClassOf, pitchName } from '../pitch';
import type { Letter, SpelledPitch } from '../pitch';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export interface RequiredSpelling {
  letter: Letter;
  alter: number;
}

export interface TriadMembershipSpec {
  type: 'triadMembership';
  /** 필요한 음급 0–11 */
  requiredPitchClasses: number[];
  /** 표기까지 요구할 때(감3화음, 증3화음, 단3화음). 없으면 음급만 본다 */
  requiredSpellings?: RequiredSpelling[];
  /** 놓아야 하는 음의 개수. 기본은 필요한 음급의 수 */
  noteCount?: number;
  /** 같은 음급을 겹쳐 놓아도 되는가. 기본 false */
  allowDoubling?: boolean;
  /** 옥타브까지 고정하는 과제면 정확한 MIDI 목록 */
  requiredMidi?: number[];
}

export interface PlacedTone {
  slotId?: string;
  pitch: SpelledPitch;
}

export interface TriadMembershipInput {
  type: 'triadMembership';
  notes: PlacedTone[];
}

const DEFAULT_PC_NAME = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function spellingName(s: RequiredSpelling): string {
  return `${s.letter}${alterSymbol(s.alter)}`;
}

function toneNameFor(spec: TriadMembershipSpec, pc: number): string {
  const sp = spec.requiredSpellings?.find((s) => (((midiOfLetterAlter(s) % 12) + 12) % 12) === pc);
  return sp ? spellingName(sp) : DEFAULT_PC_NAME[pc]!;
}

function midiOfLetterAlter(s: RequiredSpelling): number {
  return midiOf({ letter: s.letter, alter: s.alter, octave: 4 });
}

/** 음이름(옥타브 없이). 예: E♭ */
export function bareName(p: SpelledPitch): string {
  return pitchName(p, false);
}

export function evaluateTriadMembership(spec: TriadMembershipSpec, input: TriadMembershipInput): Evaluation {
  const issues: Issue[] = [];
  const required = [...new Set(spec.requiredPitchClasses)];
  const expectedCount = spec.noteCount ?? required.length;
  const allowDoubling = spec.allowDoubling ?? false;
  const notes = input.notes;

  if (notes.length === 0) {
    return makeEvaluation('triadMembership', [{ code: 'NOTE_COUNT', params: { actual: 0, expected: `${expectedCount}개` } }]);
  }

  // 음급별로 묶는다. 겹침과 구성음 밖의 음을 먼저 알려 준다(관찰된 사실만 말한다).
  const byPc = new Map<number, PlacedTone[]>();
  for (const n of notes) {
    const pc = pitchClassOf(n.pitch);
    const list = byPc.get(pc) ?? [];
    list.push(n);
    byPc.set(pc, list);
  }

  // 구성음 밖
  for (const [pc, list] of byPc) {
    if (required.includes(pc)) continue;
    for (const n of list) {
      issues.push({ code: 'EXTRA_NOTE', params: { name: bareName(n.pitch) }, target: n.slotId ? { slotId: n.slotId } : undefined });
    }
  }
  // 빠진 구성음
  for (const pc of required) {
    if (!byPc.has(pc)) issues.push({ code: 'MISSING_TONE', params: { name: toneNameFor(spec, pc) } });
  }
  // 겹침
  if (!allowDoubling) {
    for (const [pc, list] of byPc) {
      if (required.includes(pc) && list.length > 1) {
        issues.push({ code: 'DUPLICATE_TONE', params: { name: toneNameFor(spec, pc) }, target: list[1]!.slotId ? { slotId: list[1]!.slotId } : undefined });
      }
    }
  }
  // 표기: 음급이 같아도 이름이 다르면 통과하지 않는다(증3화음의 G♯을 A♭으로 쓰면 실패)
  if (spec.requiredSpellings) {
    for (const rs of spec.requiredSpellings) {
      const pc = ((midiOfLetterAlter(rs) % 12) + 12) % 12;
      for (const n of byPc.get(pc) ?? []) {
        if (n.pitch.letter !== rs.letter || n.pitch.alter !== rs.alter) {
          issues.push({
            code: 'WRONG_SPELLING_SAME_PITCH',
            params: { where: '화음', actualName: bareName(n.pitch), expectedName: spellingName(rs), expectedLetter: rs.letter },
            target: n.slotId ? { slotId: n.slotId } : undefined,
          });
        }
      }
    }
  }
  // 옥타브를 고정하는 과제
  if (spec.requiredMidi && issues.length === 0) {
    const got = notes.map((n) => midiOf(n.pitch)).sort((a, b) => a - b);
    const want = [...spec.requiredMidi].sort((a, b) => a - b);
    if (got.length !== want.length || got.some((m, i) => m !== want[i])) {
      issues.push({ code: 'WRONG_OCTAVE_SET', params: { expectedNames: want.map((m) => midiName(m, spec)).join(' ') } });
    }
  }
  // 위의 설명으로 말하지 못한 개수 차이
  if (issues.length === 0 && notes.length !== expectedCount) {
    issues.push({ code: 'NOTE_COUNT', params: { actual: notes.length, expected: `${expectedCount}개` } });
  }
  return makeEvaluation('triadMembership', issues, { pitchClasses: [...byPc.keys()].sort((a, b) => a - b) });
}

function midiName(m: number, spec: TriadMembershipSpec): string {
  const pc = ((m % 12) + 12) % 12;
  return `${toneNameFor(spec, pc)}${Math.floor(m / 12) - 1}`;
}
