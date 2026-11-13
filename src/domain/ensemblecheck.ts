// 7-5 광장 합주의 대표 조합 12가지(설계서 11.5, 12.10)와, 겹쳐 들었을 때 거슬릴 만한 곳을 소리 없이 악보에서 찾아보는 자동 점검.
// 이 점검은 귀로 듣는 점검(D-4)을 대신하지 않는다. 악보에서 셀 수 있는 것만 센다: 다장조 밖의 음, 센 박의 부딪힘, 꾸밈음의 부딪힘, 성부끼리의 겹침, 소리의 겹친 정도.
// 이 파일은 시계도 소리 장치도 모른다. 광장 합주의 음(plazaBar)과 층만으로 계산한다.
import { festivalParts } from './festival';
import type { MusicianPart } from './festival';
import { BEATS_PER_BAR, LOOP_BARS, PROGRESSION, plazaBar } from './worldsound';
import type { ChordName, EnsembleLayers, WorldNote } from './worldsound';

/** 합주의 성부(소리가 나는 것): 맥박, 화음 깔기, 타악, 베이스, 가락, 달리는 음, 꾸밈음. 악사의 성부 이름과 같다 */
export type EnsemblePart = MusicianPart;
/** 소리 높이가 있는 성부. 타악은 소리 높이가 없는 '틱'이라 음정을 따지지 않는다 */
export const PITCHED_PARTS: readonly EnsemblePart[] = ['pulse', 'bed', 'bass', 'melody', 'runner', 'ornament'];
const ALL_PARTS: readonly EnsemblePart[] = ['pulse', 'bed', 'percussion', 'bass', 'melody', 'runner', 'ornament'];

/**
 * 대표 조합 한 가지. 여섯 성부의 층(layers)과, 그 층이 되도록 통과하는 과제(quests: 정거장에 놓인 과제 id).
 * 모든 조합은 실제로 과제를 통과해서 만들 수 있다(시험이 지역 데이터로 확인한다): 마을의 층은 마을 정거장의 과제를 센 것이라 오선 언덕, 박자 강가,
 * 종나무 숲, 음계 길, 건반 늪과 함께 놓인 과제(Q01–Q07 따위)를 통과하면 그 지역들도 함께 오른다(6.2).
 */
export interface EnsembleCombo {
  id: string;
  name: string;
  layers: EnsembleLayers;
  quests: readonly string[];
  /** 이 조합을 대표로 드는 까닭(듣는 이가 무엇을 들으면 되는지) */
  why: string;
}

// 지역에만 놓인 과제(마을의 층을 올리지 않는다)와, 마을과 지역에 함께 놓인 과제
const STAFF_ONLY = ['staff.lines-and-spaces', 'staff.ledger-lines', 'staff.middle-c-neighbors'] as const;
const RIVER_ONLY = ['rhythm.three-four', 'rhythm.rest-lengths', 'rhythm.note-values'] as const;
const GROVE_ONLY = ['chord.major-and-minor', 'chord.diminished-augmented', 'chord.primary-triads'] as const;
const TRAIL_ONLY = ['scale.natural-minor', 'scale.harmonic-minor', 'scale.pentatonic'] as const;
const MARSH_ONLY = ['key.black-key-names', 'key.whole-and-half-steps', 'key.build-intervals'] as const;
/** 마을에도 놓인 과제 다섯: 오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪에 하나씩 닿는다. 마을은 다섯을 세어 3층이 된다 */
const SHARED_FIVE = ['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar', 'chord.major-triad', 'scale.major', 'pitch.same-sound-different-names'] as const;

const layers = (village: number, melody: number, percussion: number, bass: number, runner: number, ornament: number): EnsembleLayers => ({ village, melody, percussion, bass, runner, ornament });

/**
 * 대표 조합 12가지: 처음(층 0), 과제 하나(첫 변화), 지역 하나만 끝낸 소리 다섯(가락, 타악, 베이스, 달리는 음, 꾸밈음), 높은 소리 셋, 낮은 소리 셋,
 * 마을 3층에 바깥 지역이 1층씩, 2층씩, 모두 3층(18층). 층이 같은 폭으로 오르는 순서이고 성부마다 가장 빽빽한 모습이 한 번씩 들어 있다.
 */
export const ENSEMBLE_COMBOS: readonly EnsembleCombo[] = [
  { id: 'c01-start', name: '처음(층이 모두 0)', layers: layers(0, 0, 0, 0, 0, 0), quests: [], why: '맥박 하나뿐인 첫 소리. 잔치도 이 소리로 열린다.' },
  {
    id: 'c02-first-quest',
    name: '첫 과제 하나(Q01)',
    layers: layers(1, 1, 0, 0, 0, 0),
    quests: ['pitch.same-note-two-clefs'],
    why: '과제 하나로 마을의 화음 깔기(온음표)와 오선 언덕의 가락 뼈대가 처음 더해지는 소리. 맥박 위에 소리가 겹치는 첫 순간.',
  },
  { id: 'c03-melody', name: '오선 언덕만 끝낸 소리', layers: layers(0, 3, 0, 0, 0, 0), quests: STAFF_ONLY, why: '가락이 옥타브 위 겹침까지 다 있고 화음은 없다: 가락 하나가 맥박 위에 선다.' },
  { id: 'c04-percussion', name: '박자 강가만 끝낸 소리', layers: layers(0, 0, 3, 0, 0, 0), quests: RIVER_ONLY, why: '타악의 8분음표 채움. 소리 높이가 없어 맥박 곁에서 박자만 촘촘해진다.' },
  { id: 'c05-bass', name: '종나무 숲만 끝낸 소리', layers: layers(0, 0, 0, 3, 0, 0), quests: GROVE_ONLY, why: '걷는 베이스가 마디마다 다음 화음의 뿌리로 걸어간다. 맥박의 뿌리음과 겹치는 낮은 소리.' },
  { id: 'c06-runner', name: '음계 길만 끝낸 소리', layers: layers(0, 0, 0, 0, 3, 0), quests: TRAIL_ONLY, why: '달리는 음이 2마디마다 오르고 내린다. 화음이 없는 채로 음계만 달린다.' },
  { id: 'c07-ornament', name: '건반 늪만 끝낸 소리', layers: layers(0, 0, 0, 0, 0, 3), quests: MARSH_ONLY, why: '꾸밈음이 2마디마다 반음 아래에서 들어와 화음의 음에 앉는다. 다장조 밖의 음이 나오는 유일한 성부.' },
  {
    id: 'c08-high-three',
    name: '높은 소리 셋(가락, 달리는 음, 꾸밈음)',
    layers: layers(0, 3, 0, 0, 3, 3),
    quests: [...STAFF_ONLY, ...TRAIL_ONLY, ...MARSH_ONLY],
    why: '가락, 달리는 음, 꾸밈음이 모두 C5 안팎의 같은 높이에서 겹친다. 낮은 소리가 없어 높은 소리끼리 부딪히기 쉬운 조합.',
  },
  {
    id: 'c09-low-three',
    name: '낮은 소리 셋(화음, 타악, 베이스)',
    layers: layers(3, 0, 3, 3, 0, 0),
    quests: ['rhythm.rest-in-a-bar', 'rhythm.short-notes-and-triplets', 'chord.major-triad', 'chord.inversion', 'song.short-piece', 'rhythm.three-four', 'chord.major-and-minor'],
    why: '마을의 4분음표 펼친 화음, 타악의 8분음표 채움, 걷는 베이스가 낮은 곳에서 겹친다. 낮은 소리가 뭉치기 쉬운 조합.',
  },
  { id: 'c10-ones', name: '마을 3층, 바깥 지역 1층씩', layers: layers(3, 1, 1, 1, 1, 1), quests: SHARED_FIVE, why: '여섯 성부가 모두 들어 있되 모두 가장 성긴 모습. 층을 올리며 지나는 중간 지점.' },
  {
    id: 'c11-twos',
    name: '마을 3층, 바깥 지역 2층씩',
    layers: layers(3, 2, 2, 2, 2, 2),
    quests: [...SHARED_FIVE, 'staff.lines-and-spaces', 'rhythm.three-four', 'chord.major-and-minor', 'scale.natural-minor', 'key.black-key-names'],
    why: '여섯 성부가 모두 중간 밀도. 가락 전체와 4분음표 타악, 근음과 5음의 베이스, 내림 음계가 함께 든다.',
  },
  {
    id: 'c12-full',
    name: '모두 3층(합주 18층)',
    layers: layers(3, 3, 3, 3, 3, 3),
    quests: [
      ...SHARED_FIVE,
      'rhythm.short-notes-and-triplets',
      'chord.inversion',
      'song.short-piece',
      ...STAFF_ONLY,
      ...RIVER_ONLY,
      ...GROVE_ONLY,
      ...TRAIL_ONLY,
      ...MARSH_ONLY,
    ],
    why: '여섯 성부가 모두 가장 빽빽한 완성된 합주. 가장 많이 겹치는 소리다.',
  },
];

/** 한 음: 합주의 어느 마디(0–7)의 어느 성부가 언제(박) 얼마나(박) 몇 번 음높이로 */
export interface EnsembleNote extends WorldNote {
  part: EnsemblePart;
  bar: number;
}

/** 층에 따른 8마디 합주의 모든 음(성부 일곱: 맥박, 화음, 타악, 베이스, 가락, 달리는 음, 꾸밈음) */
export function ensembleLoop(l: EnsembleLayers): EnsembleNote[] {
  const out: EnsembleNote[] = [];
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const b = plazaBar(bar, l.village, { percussion: l.percussion, bass: l.bass, melody: l.melody, runner: l.runner, ornament: l.ornament });
    for (const part of ALL_PARTS) for (const n of b[part]) out.push({ ...n, part, bar });
  }
  return out;
}

/** 다장조의 음이름(으뜸음 C를 0으로 센 반음 수) */
export const C_MAJOR_PITCH_CLASSES: ReadonlySet<number> = new Set([0, 2, 4, 5, 7, 9, 11]);
/** 그 마디 화음의 구성음 3개(C를 0으로 센 반음 수) */
export const CHORD_PITCH_CLASSES: Readonly<Record<ChordName, readonly number[]>> = { C: [0, 4, 7], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4] };
/**
 * 날카롭게 들리는 간격(반음 수): 단2도(1), 장7도(11), 단9도(13). 소리 높이가 있는 두 성부가 이 간격으로 함께 울리면 부딪힌다.
 * 장2도와 3도, 4도, 5도, 6도, 옥타브는 부딪힌다고 세지 않는다.
 */
export const SHARP_INTERVALS: ReadonlySet<number> = new Set([1, 11, 13]);

/** 16분음표 칸(0.25박): 광장 합주의 모든 음이 이 격자 위에서 시작한다 */
const GRID_BEATS = 0.25;
const EPS = 1e-9;

export interface EnsembleReport {
  layers: EnsembleLayers;
  /** 여섯 성부의 층의 합(0–18) */
  level: number;
  /** 8마디 안에서 소리가 나는 성부(악사가 서는 차례) */
  parts: MusicianPart[];
  /** 성부마다 8마디에 울리는 음의 수 */
  notes: Record<EnsemblePart, number>;
  /** 성부마다 음높이의 범위(MIDI, 타악은 틱이라 뺀다) */
  registers: Partial<Record<EnsemblePart, [number, number]>>;
  /** 다장조 밖의 음. 꾸밈음의 앞꾸밈만 있어야 한다 */
  outsideKey: Array<{ bar: number; part: EnsemblePart; midi: number }>;
  /** 마디 밖으로 넘어가는 음의 수(시작이 마디 앞이거나 끝이 마디 뒤) */
  outsideBar: number;
  /** 첫 박과 셋째 박의 첫 순간에 울리고 있는 두 성부가 날카로운 간격(SHARP_INTERVALS)으로 부딪히는 쌍의 수 */
  strongBeatRubs: number;
  /** 꾸밈음의 앞꾸밈이 시작하는 순간 다른 성부의 음과 반음이나 단9도로 부딪히는 쌍의 수 */
  graceRubs: number;
  /** 같은 순간에 시작한 두 음이 날카로운 간격으로 부딪히는 쌍의 수(센 박이 아닌 곳. 센 박은 strongBeatRubs가 센다) */
  attackRubs: number;
  /** 한 음이 시작할 때 이미 울리고 있던 다른 성부의 음과 날카로운 간격으로 부딪히는 쌍의 수(달리는 음계가 지나가는 자리 따위) */
  passingRubs: number;
  /** 달리는 음과 꾸밈음이 한 마디에 함께 있는 마디의 수 */
  runnerAndOrnamentSameBar: number;
  /** 한꺼번에 울리는 음의 가장 많은 수(타악 제외) */
  maxSimultaneous: number;
  /** 한꺼번에 울리는 음의 세기(velocity) 합의 가장 큰 값. 소리가 겹친 정도를 재는 눈금이고 귀에 들리는 크기가 아니다 */
  peakVelocity: number;
  /** 꾸밈음의 앞꾸밈이 가는 곳이 그 마디 화음의 구성음이고 반음 위가 아닌 것의 수 */
  graceNotResolved: number;
}

/** 층에 따른 합주 8마디를 16분음표 칸마다 훑어서 세어 본 점검표 */
export function ensembleReport(l: EnsembleLayers): EnsembleReport {
  return analyzeEnsemble(ensembleLoop(l), l);
}

/** 음 목록 하나를 16분음표 칸마다 훑어서 세어 본 점검표. 음 목록은 합주 8마디(마디 0–7)의 음이다(점검 자체를 시험하려고 따로 연다) */
export function analyzeEnsemble(notes: readonly EnsembleNote[], l: EnsembleLayers): EnsembleReport {
  const count = Object.fromEntries(ALL_PARTS.map((p) => [p, 0])) as Record<EnsemblePart, number>;
  const registers: Partial<Record<EnsemblePart, [number, number]>> = {};
  const outsideKey: EnsembleReport['outsideKey'] = [];
  let outsideBar = 0;
  for (const n of notes) {
    count[n.part]++;
    if (n.part !== 'percussion') {
      const r = registers[n.part] ?? [Infinity, -Infinity];
      registers[n.part] = [Math.min(r[0], n.midi), Math.max(r[1], n.midi)];
      if (!C_MAJOR_PITCH_CLASSES.has(n.midi % 12)) outsideKey.push({ bar: n.bar, part: n.part, midi: n.midi });
    }
    if (n.beat < -EPS || n.beat + n.beats > BEATS_PER_BAR + EPS) outsideBar++;
  }

  let strongBeatRubs = 0;
  let graceRubs = 0;
  let attackRubs = 0;
  let passingRubs = 0;
  let maxSimultaneous = 0;
  let peakVelocity = 0;
  const pitched = notes.filter((n) => n.part !== 'percussion');
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const here = notes.filter((n) => n.bar === bar);
    const herePitched = pitched.filter((n) => n.bar === bar);
    for (let slot = 0; slot < BEATS_PER_BAR / GRID_BEATS; slot++) {
      const t = slot * GRID_BEATS;
      const sounding = (n: EnsembleNote): boolean => n.beat <= t + EPS && t < n.beat + n.beats - EPS;
      const starts = (n: EnsembleNote): boolean => Math.abs(n.beat - t) < EPS;
      const now = herePitched.filter(sounding);
      maxSimultaneous = Math.max(maxSimultaneous, now.length);
      peakVelocity = Math.max(peakVelocity, here.filter(sounding).reduce((sum, n) => sum + n.velocity, 0));
      for (let i = 0; i < now.length; i++) {
        for (let j = i + 1; j < now.length; j++) {
          const a = now[i]!;
          const b = now[j]!;
          if (a.part === b.part) continue;
          const d = Math.abs(a.midi - b.midi);
          if (SHARP_INTERVALS.has(d)) {
            if (t === 0 || t === 2) strongBeatRubs++; // 첫 박(0)과 셋째 박(2)
            else if (starts(a) && starts(b)) attackRubs++;
            else if (starts(a) || starts(b)) passingRubs++;
          }
          const graceNow = (a.part === 'ornament' && starts(a) && !C_MAJOR_PITCH_CLASSES.has(a.midi % 12)) || (b.part === 'ornament' && starts(b) && !C_MAJOR_PITCH_CLASSES.has(b.midi % 12));
          if (graceNow && (d === 1 || d === 13)) graceRubs++;
        }
      }
    }
  }

  // 꾸밈음의 앞꾸밈은 0.25박 뒤 같은 성부의 음(반음 위)으로 가고 그 음은 그 마디 화음의 구성음이다
  let graceNotResolved = 0;
  for (const g of notes.filter((n) => n.part === 'ornament' && !C_MAJOR_PITCH_CLASSES.has(n.midi % 12))) {
    const chord = PROGRESSION[g.bar]!;
    const target = notes.find((n) => n.part === 'ornament' && n.bar === g.bar && Math.abs(n.beat - (g.beat + g.beats)) < EPS);
    if (!target || target.midi !== g.midi + 1 || !CHORD_PITCH_CLASSES[chord].includes(target.midi % 12)) graceNotResolved++;
  }

  const runnerBars = new Set(notes.filter((n) => n.part === 'runner').map((n) => n.bar));
  const ornamentBars = new Set(notes.filter((n) => n.part === 'ornament').map((n) => n.bar));
  const runnerAndOrnamentSameBar = [...runnerBars].filter((b) => ornamentBars.has(b)).length;

  return {
    layers: l,
    level: l.village + l.melody + l.percussion + l.bass + l.runner + l.ornament,
    parts: festivalParts(l),
    notes: count,
    registers,
    outsideKey,
    outsideBar,
    strongBeatRubs,
    graceRubs,
    attackRubs,
    passingRubs,
    runnerAndOrnamentSameBar,
    maxSimultaneous,
    peakVelocity,
    graceNotResolved,
  };
}

/**
 * 자동 점검의 판정: 비어 있으면 통과다. 통과가 '거슬리는 곳이 없다'는 뜻은 아니다. 악보로 셀 수 있는 것만 본 것이고 귀로 듣는 점검(D-4)이 따로 남는다.
 *  - 다장조 밖의 음은 꾸밈음의 앞꾸밈뿐이고, 앞꾸밈은 반음 위의 화음 구성음으로 간다
 *  - 모든 음이 마디 안에서 시작하고 끝난다
 *  - 첫 박과 셋째 박에는 날카로운 간격(단2도, 장7도, 단9도)으로 부딪히는 소리가 없다
 *  - 꾸밈음의 앞꾸밈은 다른 성부의 음과 반음이나 단9도로 부딪히지 않는다
 *  - 달리는 음과 꾸밈음은 같은 마디에 없다
 */
export function ensembleProblems(r: EnsembleReport): string[] {
  const out: string[] = [];
  const stray = r.outsideKey.filter((n) => n.part !== 'ornament');
  if (stray.length > 0) out.push(`다장조 밖의 음이 꾸밈음 말고도 있다: ${stray.map((n) => `${n.part} ${n.midi}(마디 ${n.bar + 1})`).join(', ')}`);
  if (r.graceNotResolved > 0) out.push(`꾸밈음의 앞꾸밈 ${r.graceNotResolved}개가 반음 위의 화음 구성음으로 가지 않는다`);
  if (r.outsideBar > 0) out.push(`마디 밖으로 넘어가는 음이 ${r.outsideBar}개 있다`);
  if (r.strongBeatRubs > 0) out.push(`첫 박이나 셋째 박에 날카로운 간격으로 부딪히는 쌍이 ${r.strongBeatRubs}개 있다`);
  if (r.graceRubs > 0) out.push(`꾸밈음의 앞꾸밈이 다른 성부와 반음이나 단9도로 부딪히는 쌍이 ${r.graceRubs}개 있다`);
  if (r.runnerAndOrnamentSameBar > 0) out.push(`달리는 음과 꾸밈음이 함께 있는 마디가 ${r.runnerAndOrnamentSameBar}개 있다`);
  return out;
}
