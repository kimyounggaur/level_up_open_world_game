// 1-3 보표 위치: 음자리표와 줄·칸 위치에서 음이름과 옥타브를 계산한다.
// 표의 라벨을 화면 좌표에 직접 연결하지 않고, 보표 기준음과 온음계 위치로 계산한다.
import { diatonicIndex, letterOctaveAt, spellEquals } from './pitch';
import type { Letter, SpelledPitch } from './pitch';

export type Clef = 'treble' | 'bass';

/** 맨 아랫줄의 음. 높은음자리표는 E4, 낮은음자리표는 G2 */
export const CLEF_BOTTOM_LINE: Record<Clef, { letter: Letter; octave: number }> = {
  treble: { letter: 'E', octave: 4 },
  bass: { letter: 'G', octave: 2 },
};

export const CLEF_NAME_KO: Record<Clef, string> = { treble: '높은음자리표', bass: '낮은음자리표' };

/**
 * 보표 위치(position): 맨 아랫줄 0, 그 위 칸 1, 둘째 줄 2 … 맨 윗줄 8. 짝수는 줄, 홀수는 칸.
 * 아래쪽은 −1, −2 …, 위쪽은 9, 10 …. 한 칸이 온음계 한 계단이다.
 */
export function staffPositionOf(clef: Clef, p: { letter: Letter; octave: number }): number {
  return diatonicIndex(p) - diatonicIndex(CLEF_BOTTOM_LINE[clef]);
}

export function pitchLetterAtStaffPosition(clef: Clef, position: number): { letter: Letter; octave: number } {
  return letterOctaveAt(diatonicIndex(CLEF_BOTTOM_LINE[clef]) + position);
}

/** 위치와 변화량(alter)으로 음을 만든다. 변화표는 위치에 따라 정해지지 않고 사용자가 고른다. */
export function pitchAtStaffPosition(clef: Clef, position: number, alter = 0): SpelledPitch {
  return { ...pitchLetterAtStaffPosition(clef, position), alter };
}

/** 그려야 하는 덧줄의 위치들. 보표 밖의 줄(짝수 위치)을 보표에서 가까운 것부터 그 음까지 */
export function ledgerLinePositions(position: number): number[] {
  const out: number[] = [];
  if (position <= -2) {
    const lowest = position % 2 === 0 ? position : position + 1;
    for (let p = -2; p >= lowest; p -= 2) out.push(p);
  } else if (position >= 10) {
    const highest = position % 2 === 0 ? position : position - 1;
    for (let p = 10; p <= highest; p += 2) out.push(p);
  }
  return out;
}

/** 가운데 줄의 보표 위치(맨 아랫줄 0, 둘째 줄 2, 가운데 줄 4) */
export const STAFF_MIDDLE_LINE = 4;

/**
 * 음표 기둥의 방향(관찰 O1 '기둥의 방향', 설계서 5.3): 가운데 줄보다 아래 음은 기둥이 위로, 가운데 줄과 그 위의 음은 아래로 향한다.
 * 가운데 줄 위의 음은 기둥이 아래로 가는 것이 표기의 관례다. 음자리표와 상관없이 위치만 본다.
 */
export function stemDirectionOf(position: number): 'up' | 'down' {
  return position < STAFF_MIDDLE_LINE ? 'up' : 'down';
}

const LINE_NAMES = ['맨 아랫줄', '아래에서 둘째 줄', '가운데 줄', '아래에서 넷째 줄', '맨 윗줄'];
const SPACE_NAMES = ['첫째 칸', '둘째 칸', '셋째 칸', '넷째 칸'];
const LEDGER_ORDINAL = ['첫', '둘째', '셋째', '넷째', '다섯째'];

function ledgerOrdinal(n: number): string {
  return n === 1 ? '첫' : (LEDGER_ORDINAL[n - 1] ?? `${n}째`);
}

/** '아래 첫 덧줄', '맨 아랫줄의 아래 칸' 같은 말로 위치를 설명한다. */
export function describeStaffPosition(position: number): string {
  if (position >= 0 && position <= 8) {
    return position % 2 === 0 ? LINE_NAMES[position / 2]! : SPACE_NAMES[(position - 1) / 2]!;
  }
  if (position < 0) {
    if (position === -1) return '맨 아랫줄의 아래 칸';
    const lineIdx = Math.floor(-position / 2); // 덧줄 번호(1부터)
    return position % 2 === 0 ? `아래 ${ledgerOrdinal(lineIdx)} 덧줄` : `아래 ${ledgerOrdinal(lineIdx)} 덧줄의 아래 칸`;
  }
  if (position === 9) return '맨 윗줄의 위 칸';
  const lineIdx = Math.floor((position - 8) / 2);
  return position % 2 === 0 ? `위 ${ledgerOrdinal(lineIdx)} 덧줄` : `위 ${ledgerOrdinal(lineIdx)} 덧줄의 위 칸`;
}

export function staffPositionsEqual(clef: Clef, a: SpelledPitch, b: SpelledPitch): boolean {
  return spellEquals(a, b) && staffPositionOf(clef, a) === staffPositionOf(clef, b);
}
