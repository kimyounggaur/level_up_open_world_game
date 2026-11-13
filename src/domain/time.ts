// 1-2 시간: 음가 틱, 셋잇단, 박자표별 마디 길이, 틱을 초로.
// 모든 계산은 정수 틱으로 한다. 화면 픽셀이나 부동소수점의 근사 합으로 마디 완성을 판정하지 않는다.

export const PPQ = 960; // 4분음표 하나의 틱 수

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirtySecond';

export const VALUE_TICKS: Record<NoteValue, number> = {
  whole: 3840,
  half: 1920,
  quarter: 960,
  eighth: 480,
  sixteenth: 240,
  thirtySecond: 120,
};

export const VALUE_NAME_KO: Record<NoteValue, string> = {
  whole: '온음표',
  half: '2분음표',
  quarter: '4분음표',
  eighth: '8분음표',
  sixteenth: '16분음표',
  thirtySecond: '32분음표',
};

function assertInt(n: number, what: string): number {
  if (!Number.isInteger(n)) throw new Error(`${what}이(가) 정수 틱이 아니에요: ${n}`);
  return n;
}

/** 점음표의 길이. 점 하나는 절반을 더하고, 점 둘은 절반과 그 절반을 더한다. */
export function dottedTicks(base: NoteValue, dots = 1): number {
  let t = VALUE_TICKS[base];
  let add = t;
  for (let i = 0; i < dots; i++) {
    add = add / 2;
    t += add;
  }
  return assertInt(t, '점음표 길이');
}

/** 셋잇단 같은 연음: 기본 음가 normalNotes개의 길이를 actualNotes개로 나눈다. 8분음표 셋잇단(3:2) 하나는 320틱. */
export function tupletNoteTicks(base: NoteValue, actualNotes: number, normalNotes: number): number {
  return assertInt((VALUE_TICKS[base] * normalNotes) / actualNotes, '연음 길이');
}

// ---------------------------------------------------------------------------
// 박자표

export interface Meter {
  beats: number;
  unit: number; // 박자표의 분모: 4, 8 ...
}

export function parseMeter(text: string): Meter {
  const m = /^(\d+)\/(\d+)$/.exec(text.trim());
  if (!m) throw new Error(`박자표를 읽을 수 없어요: '${text}'`);
  const beats = parseInt(m[1]!, 10);
  const unit = parseInt(m[2]!, 10);
  if (![1, 2, 4, 8, 16].includes(unit) || beats < 1) throw new Error(`지원하지 않는 박자표: '${text}'`);
  return { beats, unit };
}

/** 한 마디의 틱 수. 4/4는 3840, 3/4와 6/8은 2880. */
export function measureTicks(meter: Meter | string): number {
  const m = typeof meter === 'string' ? parseMeter(meter) : meter;
  return assertInt(m.beats * (3840 / m.unit), '마디 길이');
}

/** 6/8처럼 8분음표 여섯 개를 큰 박 둘로 세는 겹박자인가 */
export function isCompound(meter: Meter | string): boolean {
  const m = typeof meter === 'string' ? parseMeter(meter) : meter;
  return m.unit === 8 && m.beats >= 6 && m.beats % 3 === 0;
}

/** 박자표가 정하는 '센다'의 단위 틱. 4/4는 4분음표(960), 6/8은 점4분음표(1440). */
export function countUnitTicks(meter: Meter | string): number {
  const m = typeof meter === 'string' ? parseMeter(meter) : meter;
  return isCompound(m) ? 1440 : 3840 / m.unit;
}

// ---------------------------------------------------------------------------
// 템포: 기준 음가와 분당 횟수. 4/4에서 '4분음표 80'은 4분음표가 분당 80회라는 뜻이다.

export type TempoReference = 'quarter' | 'dottedQuarter' | 'half' | 'eighth';

export const TEMPO_REFERENCE_TICKS: Record<TempoReference, number> = {
  quarter: 960,
  dottedQuarter: 1440,
  half: 1920,
  eighth: 480,
};

export interface Tempo {
  reference: TempoReference;
  bpm: number;
}

export function ticksToSeconds(ticks: number, tempo: Tempo): number {
  return (ticks / TEMPO_REFERENCE_TICKS[tempo.reference]) * (60 / tempo.bpm);
}

export function secondsToTicks(seconds: number, tempo: Tempo): number {
  return Math.round((seconds * tempo.bpm * TEMPO_REFERENCE_TICKS[tempo.reference]) / 60);
}

// ---------------------------------------------------------------------------
// 피드백에 쓰는 길이 설명

const EXACT_NAMES: Array<[number, string]> = [
  [3840, '온음표 하나'],
  [2880, '점2분음표 하나'],
  [1920, '2분음표 하나'],
  [1440, '점4분음표 하나'],
  [960, '4분음표 하나'],
  [720, '점8분음표 하나'],
  [640, '4분음표 셋잇단음 하나'],
  [480, '8분음표 하나'],
  [320, '8분음표 셋잇단음 하나'],
  [240, '16분음표 하나'],
  [120, '32분음표 하나'],
];

/** 480 → '8분음표 하나 길이'. 정확한 이름이 없으면 큰 음가부터 더해서 말한다. 그래도 안 되면 틱 수. */
export function describeTicks(ticks: number): string {
  if (ticks <= 0) return '길이 없음';
  const exact = EXACT_NAMES.find(([t]) => t === ticks);
  if (exact) return `${exact[1]} 길이`;
  const parts: string[] = [];
  let rest = ticks;
  for (const [t, name] of [
    [3840, '온음표'],
    [1920, '2분음표'],
    [960, '4분음표'],
    [480, '8분음표'],
    [240, '16분음표'],
    [120, '32분음표'],
  ] as Array<[number, string]>) {
    const n = Math.floor(rest / t);
    if (n > 0) {
      parts.push(`${name} ${n === 1 ? '하나' : n === 2 ? '둘' : n === 3 ? '셋' : n === 4 ? '넷' : n + '개'}`);
      rest -= n * t;
    }
  }
  if (rest !== 0) return `${ticks}틱`;
  return `${parts.join('와 ')} 길이`;
}

const ORDINAL_KO = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

export function ordinalKo(n: number): string {
  return ORDINAL_KO[n - 1] ?? `${n}`;
}

/** 4 → '네 번째', 12 → '12번째' */
export function ordinalPosition(n: number): string {
  return n >= 1 && n <= ORDINAL_KO.length ? `${ORDINAL_KO[n - 1]} 번째` : `${n}번째`;
}

/** 마디 안 위치를 말로 한다. 4/4는 'N번째 박', 6/8은 'N번째 8분음표 자리'(4/4의 박 설명을 재사용하지 않는다). */
export function positionLabel(onsetTicks: number, meter: Meter | string): string {
  const m = typeof meter === 'string' ? parseMeter(meter) : meter;
  if (isCompound(m)) {
    const slot = Math.floor(onsetTicks / 480) + 1;
    return `${ordinalKo(slot)} 번째 8분음표 자리`;
  }
  const unit = 3840 / m.unit;
  const beat = Math.floor(onsetTicks / unit) + 1;
  const within = onsetTicks % unit;
  return within === 0 ? `${ordinalKo(beat)} 번째 박` : `${ordinalKo(beat)} 번째 박 안쪽`;
}
