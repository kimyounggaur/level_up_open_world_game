import { describe, expect, it } from 'vitest';
import {
  comparePitches,
  intervalBetween,
  intervalName,
  midiOf,
  parsePitch,
  pitchAbove,
  pitchName,
  semitonesForInterval,
} from '@/domain/pitch';
import {
  HARMONIC_MINOR_STEPS,
  MAJOR_STEPS,
  NATURAL_MINOR_STEPS,
  buildScale,
  keySignatureAlter,
  majorKeySignatureOf,
} from '@/domain/key';
import {
  countUnitTicks,
  describeTicks,
  dottedTicks,
  isCompound,
  measureTicks,
  parseMeter,
  positionLabel,
  secondsToTicks,
  ticksToSeconds,
  tupletNoteTicks,
  VALUE_TICKS,
} from '@/domain/time';
import {
  describeStaffPosition,
  ledgerLinePositions,
  pitchAtStaffPosition,
  staffPositionOf,
} from '@/domain/staff';

const p = parsePitch;

describe('1-1 음높이', () => {
  it('C4=60, A4=69, C♯4=D♭4=61', () => {
    expect(midiOf(p('C4'))).toBe(60);
    expect(midiOf(p('A4'))).toBe(69);
    expect(midiOf(p('C#4'))).toBe(61);
    expect(midiOf(p('Db4'))).toBe(61);
    expect(midiOf(p('C♯4'))).toBe(61);
    expect(midiOf(p('D♭4'))).toBe(61);
  });

  it('C♯4와 D♭4는 소리는 같고 표기는 다르다', () => {
    expect(comparePitches(p('C#4'), p('Db4'))).toEqual({ soundEquivalent: true, notationEquivalent: false });
    expect(comparePitches(p('C#4'), p('C#4'))).toEqual({ soundEquivalent: true, notationEquivalent: true });
    expect(comparePitches(p('C4'), p('D4'))).toEqual({ soundEquivalent: false, notationEquivalent: false });
  });

  it('음이름 글자를 읽고 쓴다', () => {
    expect(pitchName(p('Bb4'))).toBe('B♭4');
    expect(pitchName(p('F#5'))).toBe('F♯5');
    expect(pitchName(p('C4'), false)).toBe('C');
    expect(p('Bbb2')).toEqual({ letter: 'B', alter: -2, octave: 2 });
    expect(p('C-1')).toEqual({ letter: 'C', alter: 0, octave: -1 });
    expect(() => p('H4')).toThrow();
  });

  it('C4–D♯4는 증2도, C4–E♭4는 단3도이고 둘 다 세 반음이다', () => {
    const a = intervalBetween(p('C4'), p('D#4'));
    const b = intervalBetween(p('C4'), p('Eb4'));
    expect(a).toMatchObject({ diatonicNumber: 2, quality: 'augmented', semitones: 3 });
    expect(b).toMatchObject({ diatonicNumber: 3, quality: 'minor', semitones: 3 });
    expect(intervalName(a)).toBe('증2도');
    expect(intervalName(b)).toBe('단3도');
  });

  it('5.8의 음정 표', () => {
    const cases: Array<[string, string, number, number, string]> = [
      ['D4', 'F#4', 3, 4, '장3도'],
      ['E4', 'B4', 5, 7, '완전5도'],
      ['F4', 'Bb4', 4, 5, '완전4도'],
      ['E4', 'G#4', 3, 4, '장3도'],
      ['E4', 'F4', 2, 1, '단2도'],
      ['B4', 'C5', 2, 1, '단2도'],
      ['C4', 'D4', 2, 2, '장2도'],
      ['F4', 'G4', 2, 2, '장2도'],
    ];
    for (const [a, b, num, semis, name] of cases) {
      const i = intervalBetween(p(a), p(b));
      expect(i.diatonicNumber, `${a}-${b}`).toBe(num);
      expect(i.semitones, `${a}-${b}`).toBe(semis);
      expect(intervalName(i), `${a}-${b}`).toBe(name);
    }
  });

  it('감5도, 증4도, 옥타브, 아래로 가는 음정', () => {
    expect(intervalName(intervalBetween(p('B3'), p('F4')))).toBe('감5도');
    expect(intervalName(intervalBetween(p('F4'), p('B4')))).toBe('증4도');
    expect(intervalName(intervalBetween(p('C4'), p('C5')))).toBe('완전8도');
    expect(intervalName(intervalBetween(p('C4'), p('C#4')))).toBe('증1도');
    const down = intervalBetween(p('E4'), p('C4'));
    expect(down.direction).toBe('down');
    expect(intervalName(down)).toBe('장3도'); // E4에서 아래로 C4: C–E는 장3도
  });

  it('음정을 쌓으면 이름이 올바른 음이 나온다', () => {
    expect(pitchName(pitchAbove(p('D4'), 3, 'major'))).toBe('F♯4');
    expect(pitchName(pitchAbove(p('E4'), 5, 'perfect'))).toBe('B4');
    expect(pitchName(pitchAbove(p('F4'), 4, 'perfect'))).toBe('B♭4');
    expect(pitchName(pitchAbove(p('E4'), 3, 'major'))).toBe('G♯4');
    expect(pitchName(pitchAbove(p('C4'), 2, 'augmented'))).toBe('D♯4');
    expect(pitchName(pitchAbove(p('C4'), 3, 'minor'))).toBe('E♭4');
    expect(semitonesForInterval(8, 'perfect')).toBe(12);
    expect(() => semitonesForInterval(5, 'major')).toThrow();
  });
});

describe('1-1 조표와 음계 (5.8 고정값)', () => {
  const names = (xs: ReturnType<typeof buildScale>) => xs.map((x) => pitchName(x));
  const midis = (xs: ReturnType<typeof buildScale>) => xs.map(midiOf);

  it('장음계', () => {
    expect(names(buildScale(p('C4'), MAJOR_STEPS))).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
    expect(midis(buildScale(p('C4'), MAJOR_STEPS))).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(names(buildScale(p('F4'), MAJOR_STEPS))).toEqual(['F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5', 'F5']);
    expect(midis(buildScale(p('F4'), MAJOR_STEPS))).toEqual([65, 67, 69, 70, 72, 74, 76, 77]);
    expect(names(buildScale(p('G4'), MAJOR_STEPS))).toEqual(['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5']);
    expect(midis(buildScale(p('G4'), MAJOR_STEPS))).toEqual([67, 69, 71, 72, 74, 76, 78, 79]);
    expect(names(buildScale(p('D4'), MAJOR_STEPS))).toEqual(['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5', 'D5']);
    expect(midis(buildScale(p('D4'), MAJOR_STEPS))).toEqual([62, 64, 66, 67, 69, 71, 73, 74]);
    expect(names(buildScale(p('Bb3'), MAJOR_STEPS))).toEqual(['B♭3', 'C4', 'D4', 'E♭4', 'F4', 'G4', 'A4', 'B♭4']);
    expect(midis(buildScale(p('Bb3'), MAJOR_STEPS))).toEqual([58, 60, 62, 63, 65, 67, 69, 70]);
  });

  it('자연단음계와 화성단음계', () => {
    expect(midis(buildScale(p('A3'), NATURAL_MINOR_STEPS))).toEqual([57, 59, 60, 62, 64, 65, 67, 69]);
    expect(names(buildScale(p('A3'), NATURAL_MINOR_STEPS))).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    expect(names(buildScale(p('D4'), NATURAL_MINOR_STEPS))).toEqual(['D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5']);
    expect(midis(buildScale(p('D4'), NATURAL_MINOR_STEPS))).toEqual([62, 64, 65, 67, 69, 70, 72, 74]);
    expect(names(buildScale(p('E4'), NATURAL_MINOR_STEPS))).toEqual(['E4', 'F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5']);
    expect(midis(buildScale(p('E4'), NATURAL_MINOR_STEPS))).toEqual([64, 66, 67, 69, 71, 72, 74, 76]);
    expect(names(buildScale(p('A3'), HARMONIC_MINOR_STEPS))).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G♯4', 'A4']);
    expect(midis(buildScale(p('A3'), HARMONIC_MINOR_STEPS))).toEqual([57, 59, 60, 62, 64, 65, 68, 69]);
  });

  it('다장조 5음 음계(문자 간격을 직접 준다)', () => {
    const s = buildScale(p('C4'), [2, 2, 3, 2, 3], [1, 1, 2, 1, 2]);
    expect(names(s)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4', 'C5']);
    expect(midis(s)).toEqual([60, 62, 64, 67, 69, 72]);
  });

  it('반음계: 오를 때 올림표, 내릴 때 내림표', () => {
    const up = buildScale(p('C4'), Array(12).fill(1), [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1]);
    expect(names(up)).toEqual(['C4', 'C♯4', 'D4', 'D♯4', 'E4', 'F4', 'F♯4', 'G4', 'G♯4', 'A4', 'A♯4', 'B4', 'C5']);
    const down = buildScale(p('C5'), Array(12).fill(-1), [-1, 0, -1, 0, -1, 0, -1, -1, 0, -1, 0, -1]);
    expect(names(down)).toEqual(['C5', 'B4', 'B♭4', 'A4', 'A♭4', 'G4', 'G♭4', 'F4', 'E4', 'E♭4', 'D4', 'D♭4', 'C4']);
    expect(midis(down)).toEqual([72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60]);
  });

  it('조표: G장조는 F♯, F장조는 B♭', () => {
    expect(keySignatureAlter(1, 'F')).toBe(1);
    expect(keySignatureAlter(1, 'C')).toBe(0);
    expect(keySignatureAlter(-1, 'B')).toBe(-1);
    expect(keySignatureAlter(-1, 'E')).toBe(0);
    expect(keySignatureAlter(2, 'C')).toBe(1);
    expect(keySignatureAlter(0, 'F')).toBe(0);
    expect(() => keySignatureAlter(8, 'F')).toThrow();
    expect(majorKeySignatureOf({ letter: 'G', alter: 0 })).toBe(1);
    expect(majorKeySignatureOf({ letter: 'F', alter: 0 })).toBe(-1);
    expect(majorKeySignatureOf({ letter: 'D', alter: 0 })).toBe(2);
    expect(majorKeySignatureOf({ letter: 'B', alter: -1 })).toBe(-2);
  });
});

describe('1-2 시간', () => {
  it('4분 960, 8분 셋잇단 320, 4/4는 3840, 6/8은 2880', () => {
    expect(VALUE_TICKS.quarter).toBe(960);
    expect(VALUE_TICKS.whole).toBe(3840);
    expect(VALUE_TICKS.half).toBe(1920);
    expect(VALUE_TICKS.eighth).toBe(480);
    expect(VALUE_TICKS.sixteenth).toBe(240);
    expect(VALUE_TICKS.thirtySecond).toBe(120);
    expect(tupletNoteTicks('eighth', 3, 2)).toBe(320);
    expect(tupletNoteTicks('quarter', 3, 2)).toBe(640);
    expect(measureTicks('4/4')).toBe(3840);
    expect(measureTicks('3/4')).toBe(2880);
    expect(measureTicks('6/8')).toBe(2880);
    expect(measureTicks(parseMeter('2/4'))).toBe(1920);
  });

  it('점음표', () => {
    expect(dottedTicks('half')).toBe(2880);
    expect(dottedTicks('quarter')).toBe(1440);
    expect(dottedTicks('eighth')).toBe(720);
    expect(dottedTicks('quarter', 2)).toBe(960 + 480 + 240);
  });

  it('정수가 아닌 길이는 받지 않는다', () => {
    expect(() => tupletNoteTicks('thirtySecond', 7, 2)).toThrow();
  });

  it('4분음표 80에서 960틱은 0.75초, 점4분음표 60에서 1440틱은 1초', () => {
    expect(ticksToSeconds(960, { reference: 'quarter', bpm: 80 })).toBeCloseTo(0.75, 10);
    expect(ticksToSeconds(1440, { reference: 'dottedQuarter', bpm: 60 })).toBeCloseTo(1, 10);
    expect(ticksToSeconds(3840, { reference: 'quarter', bpm: 80 })).toBeCloseTo(3, 10);
    expect(secondsToTicks(0.75, { reference: 'quarter', bpm: 80 })).toBe(960);
  });

  it('6/8은 겹박자(큰 박 둘), 4/4의 박 설명을 재사용하지 않는다', () => {
    expect(isCompound('6/8')).toBe(true);
    expect(isCompound('4/4')).toBe(false);
    expect(isCompound('3/4')).toBe(false);
    expect(countUnitTicks('6/8')).toBe(1440);
    expect(countUnitTicks('4/4')).toBe(960);
    expect(positionLabel(960, '4/4')).toBe('두 번째 박');
    expect(positionLabel(0, '4/4')).toBe('첫 번째 박');
    expect(positionLabel(960, '6/8')).toBe('세 번째 8분음표 자리');
    expect(positionLabel(960, '6/8')).not.toContain('박');
  });

  it('길이를 말로 풀어 준다', () => {
    expect(describeTicks(480)).toBe('8분음표 하나 길이');
    expect(describeTicks(320)).toBe('8분음표 셋잇단음 하나 길이');
    expect(describeTicks(960 + 480)).toBe('점4분음표 하나 길이');
    expect(describeTicks(960 + 240)).toBe('4분음표 하나와 16분음표 하나 길이');
    expect(describeTicks(7)).toBe('7틱');
  });
});

describe('1-3 보표 위치', () => {
  it('높은음자리표 첫 줄은 E4, 둘째 줄은 G4', () => {
    expect(pitchName(pitchAtStaffPosition('treble', 0))).toBe('E4');
    expect(pitchName(pitchAtStaffPosition('treble', 2))).toBe('G4');
    expect(pitchName(pitchAtStaffPosition('treble', 8))).toBe('F5');
  });

  it('낮은음자리표 첫 줄은 G2', () => {
    expect(pitchName(pitchAtStaffPosition('bass', 0))).toBe('G2');
    expect(pitchName(pitchAtStaffPosition('bass', 8))).toBe('A3');
  });

  it('C4는 높은음자리표 아래 첫 덧줄이자 낮은음자리표 위 첫 덧줄이다', () => {
    const c4 = p('C4');
    expect(staffPositionOf('treble', c4)).toBe(-2);
    expect(staffPositionOf('bass', c4)).toBe(10);
    expect(describeStaffPosition(-2)).toBe('아래 첫 덧줄');
    expect(describeStaffPosition(10)).toBe('위 첫 덧줄');
    expect(ledgerLinePositions(-2)).toEqual([-2]);
    expect(ledgerLinePositions(10)).toEqual([10]);
  });

  it('높은음자리표 맨 아랫줄에 놓으면 E4로 읽는다', () => {
    expect(pitchName(pitchAtStaffPosition('treble', 0))).toBe('E4');
    expect(describeStaffPosition(0)).toBe('맨 아랫줄');
  });

  it('덧줄과 칸의 이름(Q09–Q12의 표)', () => {
    // Q11: B3, C4, D4를 두 음자리표에서
    expect(describeStaffPosition(staffPositionOf('treble', p('B3')))).toBe('아래 첫 덧줄의 아래 칸');
    expect(describeStaffPosition(staffPositionOf('bass', p('B3')))).toBe('맨 윗줄의 위 칸');
    expect(describeStaffPosition(staffPositionOf('treble', p('D4')))).toBe('맨 아랫줄의 아래 칸');
    expect(describeStaffPosition(staffPositionOf('bass', p('D4')))).toBe('위 첫 덧줄의 위 칸');
    // Q10: 둘째 덧줄
    expect(describeStaffPosition(staffPositionOf('treble', p('A3')))).toBe('아래 둘째 덧줄');
    expect(describeStaffPosition(staffPositionOf('treble', p('A5')))).toBe('위 첫 덧줄');
    expect(describeStaffPosition(staffPositionOf('treble', p('C6')))).toBe('위 둘째 덧줄');
    expect(ledgerLinePositions(staffPositionOf('treble', p('C6')))).toEqual([10, 12]);
    expect(ledgerLinePositions(staffPositionOf('treble', p('A3')))).toEqual([-2, -4]);
    expect(ledgerLinePositions(staffPositionOf('treble', p('B3')))).toEqual([-2]);
    expect(ledgerLinePositions(4)).toEqual([]);
  });

  it('줄과 칸: 짝수 위치가 줄', () => {
    const lines = [0, 2, 4, 6, 8].map((pos) => pitchName(pitchAtStaffPosition('treble', pos), false));
    expect(lines).toEqual(['E', 'G', 'B', 'D', 'F']);
    const spaces = [1, 3, 5, 7].map((pos) => pitchName(pitchAtStaffPosition('treble', pos), false));
    expect(spaces).toEqual(['F', 'A', 'C', 'E']);
  });

  it('위치에서 읽은 음은 라벨이 아니라 위치로 정해진다(Q01 ②)', () => {
    // 높은음자리표 맨 아랫줄에 'C' 라벨을 붙여도 위치가 읽는 음은 E4다.
    const read = pitchAtStaffPosition('treble', 0);
    expect(pitchName(read)).toBe('E4');
    expect(pitchName(read)).not.toBe('C4');
  });
});
