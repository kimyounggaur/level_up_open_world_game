// 1-1 음높이: 음이름·변화·옥타브와 MIDI, 온음계 위치, 음정의 도수와 성질.
// 재생 기준: 12평균율, C4 = MIDI 60. MIDI 번호만으로 음이름을 복원하지 않는다(기보 음을 따로 가진다).

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
/** null은 변화표가 쓰이지 않았다는 뜻이고 natural은 제자리표를 명시했다는 뜻이다. 둘은 같지 않다. */
export type Accidental = 'sharp' | 'flat' | 'natural' | 'doubleSharp' | 'doubleFlat';

/** 사용자가 적은 음(기보 입력) */
export interface WrittenPitch {
  letter: Letter;
  accidental: Accidental | null;
  octave: number;
}
/** 음이름·변화량·옥타브로 정해진 음 */
export interface SpelledPitch {
  letter: Letter;
  alter: number;
  octave: number;
}
/** 조표와 임시표를 적용해 확정한 음 */
export interface ResolvedPitch extends SpelledPitch {
  midi: number;
}

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_INDEX: Record<Letter, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export const ACCIDENTAL_ALTER: Record<Accidental, number> = {
  sharp: 1,
  flat: -1,
  natural: 0,
  doubleSharp: 2,
  doubleFlat: -2,
};

export function accidentalToAlter(a: Accidental): number {
  return ACCIDENTAL_ALTER[a];
}

export function alterToAccidental(alter: number): Accidental | null {
  switch (alter) {
    case 0:
      return null;
    case 1:
      return 'sharp';
    case -1:
      return 'flat';
    case 2:
      return 'doubleSharp';
    case -2:
      return 'doubleFlat';
    default:
      throw new Error(`지원하지 않는 변화량: ${alter}`);
  }
}

export function alterSymbol(alter: number): string {
  if (alter === 0) return '';
  if (alter === 1) return '♯';
  if (alter === -1) return '♭';
  if (alter === 2) return '♯♯';
  if (alter === -2) return '♭♭';
  throw new Error(`지원하지 않는 변화량: ${alter}`);
}

export function midiOf(p: SpelledPitch): number {
  return 12 * (p.octave + 1) + LETTER_PC[p.letter] + p.alter;
}

export function pitchClassOfMidi(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function pitchClassOf(p: SpelledPitch): number {
  return pitchClassOfMidi(midiOf(p));
}

export function resolvedOf(p: SpelledPitch): ResolvedPitch {
  return { letter: p.letter, alter: p.alter, octave: p.octave, midi: midiOf(p) };
}

/** 온음계 위의 절대 위치(C4 = 28). 문자 하나가 한 칸이다. */
export function diatonicIndex(p: { letter: Letter; octave: number }): number {
  return p.octave * 7 + LETTER_INDEX[p.letter];
}

export function letterOctaveAt(index: number): { letter: Letter; octave: number } {
  const i = ((index % 7) + 7) % 7;
  return { letter: LETTERS[i]!, octave: Math.floor(index / 7) };
}

export function pitchName(p: SpelledPitch, withOctave = true): string {
  return `${p.letter}${alterSymbol(p.alter)}${withOctave ? p.octave : ''}`;
}

/** 'C4', 'C#4', 'C♯4', 'Bb4', 'B♭4', 'B♮4', 'F##3', 'Bbb2' 같은 글자를 읽는다. */
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** 이름을 모르는 소리 높이를 말할 때 쓰는 기본 이름(올림표 쪽). 66 → 'F♯4' */
export function midiToSharpName(midi: number): string {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function parsePitch(text: string): SpelledPitch {
  const m = /^([A-G])(##|♯♯|bb|♭♭|#|♯|b|♭|♮|n)?(-?\d+)$/.exec(text.trim());
  if (!m) throw new Error(`음이름을 읽을 수 없어요: '${text}'`);
  const sym = m[2] ?? '';
  const alter = sym === '#' || sym === '♯' ? 1 : sym === '##' || sym === '♯♯' ? 2 : sym === 'b' || sym === '♭' ? -1 : sym === 'bb' || sym === '♭♭' ? -2 : 0;
  return { letter: m[1] as Letter, alter, octave: parseInt(m[3]!, 10) };
}

export function writtenOf(p: SpelledPitch, explicitNatural = false): WrittenPitch {
  const acc = alterToAccidental(p.alter);
  return { letter: p.letter, accidental: acc ?? (explicitNatural ? 'natural' : null), octave: p.octave };
}

export function spellEquals(a: SpelledPitch, b: SpelledPitch): boolean {
  return a.letter === b.letter && a.alter === b.alter && a.octave === b.octave;
}

export function samePitchClassSpelling(a: SpelledPitch, b: SpelledPitch): boolean {
  return a.letter === b.letter && a.alter === b.alter;
}

/** 소리 높이가 같은가(soundEquivalent)와 표기가 같은가(notationEquivalent)를 따로 돌려준다. */
export function comparePitches(a: SpelledPitch, b: SpelledPitch): { soundEquivalent: boolean; notationEquivalent: boolean } {
  return { soundEquivalent: midiOf(a) === midiOf(b), notationEquivalent: spellEquals(a, b) };
}

// ---------------------------------------------------------------------------
// 음정: 문자 사이의 거리(도수)와 실제 반음 거리를 함께 쓴다.

export type IntervalQuality = 'perfect' | 'major' | 'minor' | 'augmented' | 'diminished' | 'doublyAugmented' | 'doublyDiminished';

export interface Interval {
  diatonicNumber: number;
  quality: IntervalQuality;
  semitones: number;
  direction: 'up' | 'down';
}

const PERFECT_BASE: Record<number, number> = { 0: 0, 3: 5, 4: 7 };
const MAJOR_BASE: Record<number, number> = { 1: 2, 2: 4, 5: 9, 6: 11 };

export const INTERVAL_QUALITY_KO: Record<IntervalQuality, string> = {
  perfect: '완전',
  major: '장',
  minor: '단',
  augmented: '증',
  diminished: '감',
  doublyAugmented: '겹증',
  doublyDiminished: '겹감',
};

export function intervalBetween(from: SpelledPitch, to: SpelledPitch): Interval {
  let lo = from;
  let hi = to;
  let direction: 'up' | 'down' = 'up';
  const fi = diatonicIndex(from);
  const ti = diatonicIndex(to);
  if (ti < fi || (ti === fi && midiOf(to) < midiOf(from))) {
    lo = to;
    hi = from;
    direction = 'down';
  }
  const steps = diatonicIndex(hi) - diatonicIndex(lo);
  const semitones = midiOf(hi) - midiOf(lo);
  const octaves = Math.floor(steps / 7);
  const n = steps % 7;
  const reduced = semitones - 12 * octaves;
  let quality: IntervalQuality;
  if (n in PERFECT_BASE) {
    const d = reduced - PERFECT_BASE[n]!;
    quality = d === 0 ? 'perfect' : d === 1 ? 'augmented' : d === -1 ? 'diminished' : d >= 2 ? 'doublyAugmented' : 'doublyDiminished';
  } else {
    const d = reduced - MAJOR_BASE[n]!;
    quality = d === 0 ? 'major' : d === -1 ? 'minor' : d === 1 ? 'augmented' : d >= 2 ? 'doublyAugmented' : d === -2 ? 'diminished' : 'doublyDiminished';
  }
  return { diatonicNumber: steps + 1, quality, semitones, direction };
}

export function intervalName(i: Pick<Interval, 'diatonicNumber' | 'quality'>): string {
  return `${INTERVAL_QUALITY_KO[i.quality]}${i.diatonicNumber}도`;
}

/** 도수와 성질이 맞는 반음 수 */
export function semitonesForInterval(diatonicNumber: number, quality: IntervalQuality): number {
  const steps = diatonicNumber - 1;
  const octaves = Math.floor(steps / 7);
  const n = steps % 7;
  if (n in PERFECT_BASE) {
    const off = { perfect: 0, augmented: 1, diminished: -1, doublyAugmented: 2, doublyDiminished: -2 }[quality as 'perfect'];
    if (off === undefined) throw new Error(`${diatonicNumber}도에는 '${INTERVAL_QUALITY_KO[quality]}' 성질이 없어요`);
    return 12 * octaves + PERFECT_BASE[n]! + off;
  }
  const off = { major: 0, minor: -1, augmented: 1, diminished: -2, doublyAugmented: 2, doublyDiminished: -3 }[quality as 'major'];
  if (off === undefined) throw new Error(`${diatonicNumber}도에는 '${INTERVAL_QUALITY_KO[quality]}' 성질이 없어요`);
  return 12 * octaves + MAJOR_BASE[n]! + off;
}

/** from 위로 정해진 음정만큼 떨어진 음을 올바른 이름으로 만든다. */
export function pitchAbove(from: SpelledPitch, diatonicNumber: number, quality: IntervalQuality): SpelledPitch {
  const idx = diatonicIndex(from) + diatonicNumber - 1;
  const { letter, octave } = letterOctaveAt(idx);
  const targetMidi = midiOf(from) + semitonesForInterval(diatonicNumber, quality);
  return { letter, octave, alter: targetMidi - (12 * (octave + 1) + LETTER_PC[letter]) };
}
