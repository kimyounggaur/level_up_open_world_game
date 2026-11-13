// 조표와 음계 만들기.
import { LETTERS, LETTER_PC, letterOctaveAt, diatonicIndex, midiOf, alterSymbol } from './pitch';
import type { Letter, SpelledPitch } from './pitch';

const SHARP_ORDER: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: readonly Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** keySignature: 올림표 개수(+), 내림표 개수(−). -7..7 */
export function keySignatureAlter(keySignature: number, letter: Letter): number {
  if (!Number.isInteger(keySignature) || keySignature < -7 || keySignature > 7) {
    throw new Error(`조표는 -7에서 7 사이의 정수여야 해요: ${keySignature}`);
  }
  if (keySignature > 0) return SHARP_ORDER.slice(0, keySignature).includes(letter) ? 1 : 0;
  if (keySignature < 0) return FLAT_ORDER.slice(0, -keySignature).includes(letter) ? -1 : 0;
  return 0;
}

/** 장조의 으뜸음에서 조표를 구한다(으뜸음의 올림·내림은 alter). 예: F장조 → -1, G장조 → +1 */
export function majorKeySignatureOf(tonic: { letter: Letter; alter: number }): number {
  // 으뜸음의 온음계 위치(C=0, G=1, D=2, ... 5도권 순서)로 계산한다.
  const circle: Record<Letter, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };
  return circle[tonic.letter] + 7 * tonic.alter;
}

export const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1] as const;
export const NATURAL_MINOR_STEPS = [2, 1, 2, 2, 1, 2, 2] as const;
export const HARMONIC_MINOR_STEPS = [2, 1, 2, 2, 1, 3, 1] as const;

/**
 * 으뜸음에서 출발해 반음 간격(semitoneSteps)과 문자 간격(letterSteps)으로 음계를 만든다.
 * letterSteps를 생략하면 문자가 하나씩 올라간다(온음계). 5음 음계나 반음계는 문자 간격을 직접 준다.
 * 내림 음계는 음수 간격을 준다. 결과는 으뜸음을 포함해 간격 수 + 1개다.
 */
export function buildScale(tonic: SpelledPitch, semitoneSteps: readonly number[], letterSteps?: readonly number[]): SpelledPitch[] {
  if (letterSteps && letterSteps.length !== semitoneSteps.length) throw new Error('문자 간격과 반음 간격의 개수가 달라요');
  const out: SpelledPitch[] = [{ ...tonic }];
  let idx = diatonicIndex(tonic);
  let midi = midiOf(tonic);
  const down = semitoneSteps.some((s) => s < 0);
  semitoneSteps.forEach((s, i) => {
    idx += letterSteps ? letterSteps[i]! : down ? -1 : 1;
    midi += s;
    const { letter, octave } = letterOctaveAt(idx);
    out.push({ letter, octave, alter: midi - (12 * (octave + 1) + LETTER_PC[letter]) });
  });
  return out;
}

export function keyNameKo(tonic: { letter: Letter; alter: number }, mode: 'major' | 'minor'): string {
  return `${tonic.letter}${alterSymbol(tonic.alter)}${mode === 'major' ? '장조' : '단조'}`;
}

export const ALL_LETTERS = LETTERS;
