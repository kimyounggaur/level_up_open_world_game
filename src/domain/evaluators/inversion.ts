// 전위 판정(Q06). 화면의 가로 순서가 아니라 실제로 울리는 음 가운데 가장 낮은 음(MIDI)으로 정한다.
// 소리를 끈 종, 배경 음악, 소리의 꼬리는 입력에 들어오지 않는다. 구성음이 모두 울리지 않으면 판정하지 않고 알려 준다.
import type { Issue } from '../feedback';
import { alterSymbol, midiOf, pitchClassOf, pitchName } from '../pitch';
import type { Letter, SpelledPitch } from '../pitch';
import { makeEvaluation } from './types';
import type { Evaluation } from './types';

export type InversionKind = 'root' | 'first' | 'second';

export const INVERSION_NAME_KO: Record<InversionKind, string> = {
  root: '기본 위치',
  first: '제1전위',
  second: '제2전위',
};

export interface InversionSpec {
  type: 'inversion';
  /** 근음, 3음, 5음의 이름과 변화. 순서가 중요하다 */
  tones: [ToneSpelling, ToneSpelling, ToneSpelling];
  targetInversion: InversionKind;
}

export interface ToneSpelling {
  letter: Letter;
  alter: number;
}

export interface InversionInput {
  type: 'inversion';
  notes: Array<{ slotId?: string; pitch: SpelledPitch; /** 소리를 껐으면 false. 기본 true */ active?: boolean }>;
}

function pcOf(t: ToneSpelling): number {
  return (((midiOf({ letter: t.letter, alter: t.alter, octave: 4 }) % 12) + 12) % 12);
}

function toneName(t: ToneSpelling): string {
  return `${t.letter}${alterSymbol(t.alter)}`;
}

/** 실제로 울리는 음만 보고 현재 전위를 구한다. 구성음이 모두 있어야 한다. */
export function currentInversion(spec: InversionSpec, input: InversionInput): { kind: InversionKind | null; bass: SpelledPitch | null; missing: string[]; extra: SpelledPitch[] } {
  const active = input.notes.filter((n) => n.active !== false).map((n) => n.pitch);
  const pcs = spec.tones.map(pcOf);
  const missing = spec.tones.filter((_, i) => !active.some((p) => pitchClassOf(p) === pcs[i])).map(toneName);
  const extra = active.filter((p) => !pcs.includes(pitchClassOf(p)));
  if (active.length === 0) return { kind: null, bass: null, missing, extra };
  const bass = active.reduce((lo, p) => (midiOf(p) < midiOf(lo) ? p : lo));
  if (missing.length > 0 || extra.length > 0) return { kind: null, bass, missing, extra };
  const idx = pcs.indexOf(pitchClassOf(bass));
  return { kind: (['root', 'first', 'second'] as const)[idx]!, bass, missing, extra };
}

export function evaluateInversion(spec: InversionSpec, input: InversionInput): Evaluation {
  const issues: Issue[] = [];
  const cur = currentInversion(spec, input);
  if (cur.missing.length > 0) {
    issues.push({ code: 'INCOMPLETE_TRIAD', params: { missingNames: cur.missing.join(', ') } });
  }
  for (const p of cur.extra) {
    issues.push({ code: 'EXTRA_NOTE', params: { name: pitchName(p, false) } });
  }
  if (issues.length === 0 && cur.kind !== spec.targetInversion) {
    issues.push({
      code: 'WRONG_INVERSION',
      params: {
        bassName: pitchName(cur.bass!),
        actualInversion: INVERSION_NAME_KO[cur.kind!],
        targetInversion: INVERSION_NAME_KO[spec.targetInversion],
      },
    });
  }
  return makeEvaluation('inversion', issues, { currentInversion: cur.kind, bassMidi: cur.bass ? midiOf(cur.bass) : null });
}
