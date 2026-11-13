// 4-5, 4-6 세계 소리의 순수 계산. 설계서 6.2, 8.2~8.4. 오디오 장치를 알지 못한다: 어떤 박에 어떤 음이 울릴지,
// 정거장의 서명 소리는 무엇이고 언제 울리며 얼마나 크게 들리는지를 숫자로만 정한다. 소리를 내는 일은 audio/가 한다.
//
// 세계에서 저절로 나는 음악은 전부 다장조, 4분음표 80, 4/4, 8마디(24초)다(8.3). 그래서 어디서 어떻게 겹쳐도 어울린다.
// 아래의 가락과 화음은 이 구현이 정한 첫 판이다. 작곡이 필요한 콘텐츠(11.5)이므로 사람의 음악 검수(D-4)를 거치기 전까지는
// '자동으로 만든 임시 판'이다.
import { PIECE_PPQ } from './discovery';
import type { SoundPieceDef } from './discovery';
import { bassStageOf, chordStageOf, clampLayer, melodyStageOf, ornamentStageOf, percussionStageOf, runnerStageOf } from './reaction';
import type { BassStage, ChordStage, MelodyStage, OrnamentStage, PercussionStage, RunnerStage } from './reaction';
import type { RegionId } from './world';

// ---------------------------------------------------------------------------
// 세계 시계의 격자(8.2)

export const WORLD_BPM = 80;
export const BEATS_PER_BAR = 4;
export const LOOP_BARS = 8;
export const BEAT_SEC = 60 / WORLD_BPM;
export const BAR_SEC = BEAT_SEC * BEATS_PER_BAR;
export const LOOP_SEC = BAR_SEC * LOOP_BARS;

/** t0에서 세어 t가 몇 번째 마디에 있는가(0부터). t0 앞이면 음수다 */
export const barIndexAt = (t: number, t0: number): number => Math.floor((t - t0) / BAR_SEC + 1e-9);
/** n번째 마디가 시작하는 시각 */
export const barStartTime = (n: number, t0: number): number => t0 + n * BAR_SEC;
/** 8마디 되풀이 안에서의 자리(0–7). 음수 마디도 바르게 센다 */
export const barInLoop = (n: number): number => ((n % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;

// ---------------------------------------------------------------------------
// 광장 합주의 뼈대(8.3)

export const PROGRESSION = ['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C'] as const;
export type ChordName = (typeof PROGRESSION)[number];

/** 마을의 화음 깔기가 쓰는 세 음(낮은 자리부터). 모두 다장조의 음이다 */
export const CHORD_VOICING: Readonly<Record<ChordName, readonly [number, number, number]>> = {
  C: [48, 52, 55],
  F: [48, 53, 57],
  G: [47, 50, 55],
  Am: [48, 52, 57],
};

/** 맥박이 치는 음: 그 마디 화음의 뿌리음(낮은 옥타브) */
export const CHORD_ROOT: Readonly<Record<ChordName, number>> = { C: 36, F: 41, G: 43, Am: 45 };

/** 한 음. beat는 마디 안에서 시작하는 박(0–4 미만), beats는 길이(박), velocity는 0–1 */
export interface WorldNote {
  midi: number;
  beat: number;
  beats: number;
  velocity: number;
}

export interface PlazaBar {
  chord: ChordName;
  /** 맥박: 층이 0이어도 늘 있다(6.4) */
  pulse: WorldNote[];
  /** 마을의 화음 깔기: 층에 따라 온음표, 2분음표, 4분음표로 펼친 화음 */
  bed: WorldNote[];
  /** 박자 강가의 타악: 그 지역의 층에 따라 첫 박, 4분음표, 8분음표 채움. 층이 0이면 비어 있다 */
  percussion: WorldNote[];
  /** 종나무 숲의 베이스: 그 지역의 층에 따라 온음표 근음, 근음과 5음, 걷는 베이스. 층이 0이면 비어 있다 */
  bass: WorldNote[];
  /** 오선 언덕의 가락(7-5): 그 지역의 층에 따라 뼈대 음만, 가락 전체, 옥타브 위 겹침. 층이 0이면 비어 있다 */
  melody: WorldNote[];
  /** 음계 길의 달리는 음(7-5): 그 지역의 층에 따라 4마디와 8마디 끝의 오름 음계, 내림 음계 추가, 2마디마다. 층이 0이거나 달리지 않는 마디는 비어 있다 */
  runner: WorldNote[];
  /** 건반 늪의 꾸밈음(7-5): 그 지역의 층에 따라 8마디에 하나, 4마디마다, 2마디마다. 층이 0이거나 꾸미지 않는 마디는 비어 있다 */
  ornament: WorldNote[];
}

/** 마을 밖 지역이 광장 합주에 더하는 성부의 층(0–3). 정하지 않으면 0이다 */
export interface PlazaParts {
  /** 박자 강가의 소리 층 → 타악 */
  percussion?: number;
  /** 종나무 숲의 소리 층 → 베이스 */
  bass?: number;
  /** 오선 언덕의 소리 층 → 가락 */
  melody?: number;
  /** 음계 길의 소리 층 → 달리는 음 */
  runner?: number;
  /** 건반 늪의 소리 층 → 꾸밈음 */
  ornament?: number;
}

/** 광장 합주의 여섯 성부가 읽는 층의 이름: 마을(화음 깔기)과 마을 밖 다섯 지역이 맡은 성부(타악, 베이스, 가락, 달리는 음, 꾸밈음) */
export type EnsembleLayerKey = 'village' | RegionPart;
/** 합주의 여섯 성부가 읽는 층(0–3). 성부마다 맡은 지역의 소리 층이다(6.2 표) */
export type EnsembleLayers = Readonly<Record<EnsembleLayerKey, number>>;
/** 성부를 맡은 지역(6.2 표): 마을은 화음 깔기, 박자 강가는 타악, 종나무 숲은 베이스, 오선 언덕은 가락, 음계 길은 달리는 음, 건반 늪은 꾸밈음 */
export const ENSEMBLE_LAYER_REGION: Readonly<Record<EnsembleLayerKey, RegionId>> = {
  village: 'village',
  percussion: 'beat-river',
  bass: 'bell-grove',
  melody: 'staff-hill',
  runner: 'scale-trail',
  ornament: 'key-marsh',
};
/** 합주의 여섯 성부. 맡은 지역의 차례(마을, 오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪)이고 설계서 6.2의 표와 같다 */
export const ENSEMBLE_LAYER_KEYS: readonly EnsembleLayerKey[] = ['village', 'melody', 'percussion', 'bass', 'runner', 'ornament'];

/** 지역마다의 층(정하지 않으면 0)에서 합주의 여섯 성부의 층을 읽는다. 층은 0–3으로 맞춘다 */
export function ensembleLayersOf(layerOf: (regionId: RegionId) => number | undefined): EnsembleLayers {
  const read = (key: EnsembleLayerKey): number => clampLayer(layerOf(ENSEMBLE_LAYER_REGION[key]) ?? 0);
  return { village: read('village'), percussion: read('percussion'), bass: read('bass'), melody: read('melody'), runner: read('runner'), ornament: read('ornament') };
}

const PULSE_STRONG = 0.5;
const PULSE_WEAK = 0.3;
const PULSE_BEATS = 0.4;
const BED_VELOCITY = 0.5;

/**
 * 광장 합주의 한 마디(성부 여섯 × 밀도 셋, 7-5). 마을의 소리 층(0–3)에 따라 화음 깔기가, 박자 강가의 층에 따라 타악이, 종나무 숲의 층에 따라 베이스가,
 * 오선 언덕의 층에 따라 가락이, 음계 길의 층에 따라 달리는 음이, 건반 늪의 층에 따라 꾸밈음이 바뀐다(6.2 표). 맥박은 층이 모두 0이어도 늘 있다(6.4).
 * 층이 오르면 소리가 더해질 뿐 먼저 있던 성부는 그대로다: 각 성부는 자기 지역의 층만 읽는다.
 */
export function plazaBar(barOfLoop: number, villageLayer: number, parts: PlazaParts = {}): PlazaBar {
  const at = barInLoop(barOfLoop);
  const chord = PROGRESSION[at]!;
  const next = PROGRESSION[(at + 1) % LOOP_BARS]!;
  const root = CHORD_ROOT[chord];
  const pulse: WorldNote[] = [0, 1, 2, 3].map((beat) => ({ midi: root, beat, beats: PULSE_BEATS, velocity: beat === 0 ? PULSE_STRONG : PULSE_WEAK }));
  return {
    chord,
    pulse,
    bed: bedNotes(chord, chordStageOf(villageLayer)),
    percussion: percussionNotes(percussionStageOf(parts.percussion ?? 0)),
    bass: bassNotes(chord, next, bassStageOf(parts.bass ?? 0)),
    melody: melodyNotes(at, melodyStageOf(parts.melody ?? 0)),
    runner: runnerNotes(at, runnerStageOf(parts.runner ?? 0)),
    ornament: ornamentNotes(at, ornamentStageOf(parts.ornament ?? 0)),
  };
}

function bedNotes(chord: ChordName, stage: ChordStage): WorldNote[] {
  const [a, b, c] = CHORD_VOICING[chord];
  switch (stage) {
    case 'none':
      return [];
    case 'whole':
      // 온음표 화음: 마디 첫 박에 셋을 한꺼번에, 마디 끝까지
      return [a, b, c].map((midi) => ({ midi, beat: 0, beats: 3.9, velocity: BED_VELOCITY }));
    case 'half':
      // 2분음표 화음: 첫 박과 셋째 박에
      return [0, 2].flatMap((beat) => [a, b, c].map((midi) => ({ midi, beat, beats: 1.9, velocity: beat === 0 ? BED_VELOCITY : BED_VELOCITY * 0.85 })));
    case 'quarter':
      // 4분음표로 펼친 화음: 한 옥타브 위에서 뿌리, 3도, 5도, 3도 차례로
      return [a + 12, b + 12, c + 12, b + 12].map((midi, beat) => ({ midi, beat, beats: 0.9, velocity: beat === 0 ? BED_VELOCITY : BED_VELOCITY * 0.8 }));
  }
}

// ---------------------------------------------------------------------------
// 광장 합주의 다른 성부(6.2 표, 6-8): 박자 강가의 타악, 종나무 숲의 베이스.
// 층이 오르면 광장 합주와 그 지역의 바탕 음악에 같은 성부가 더해진다. 모두 다장조이고 마디 안에서 시작하고 끝난다.

/** 타악이 두드리는 음: 높고 짧은 도(C6). 음높이보다 두드림으로 들리게 짧은 음색('tick')으로 낸다 */
export const PERCUSSION_MIDI = 84;
const PERC_BEATS = 0.12;
const PERC_ACCENT = 0.6;
const PERC_MID = 0.5;
const PERC_ON = 0.4;
const PERC_FILL = 0.22;

/** 타악의 한 마디: 1층 첫 박, 2층 4분음표, 3층 8분음표 채움(채움은 여린 소리). 박마다 센 정도가 다르다: 첫 박 > 셋째 박 > 나머지 */
export function percussionNotes(stage: PercussionStage): WorldNote[] {
  const hit = (beat: number, velocity: number): WorldNote => ({ midi: PERCUSSION_MIDI, beat, beats: PERC_BEATS, velocity });
  const strength = (beat: number): number => (beat === 0 ? PERC_ACCENT : beat === 2 ? PERC_MID : PERC_ON);
  switch (stage) {
    case 'none':
      return [];
    case 'first':
      return [hit(0, PERC_ACCENT)];
    case 'quarter':
      return [0, 1, 2, 3].map((beat) => hit(beat, strength(beat)));
    case 'eighth':
      return [0, 1, 2, 3].flatMap((beat) => [hit(beat, strength(beat)), hit(beat + 0.5, PERC_FILL)]);
  }
}

/** 베이스의 뿌리음(F2–C3 안). 설계서 8.3의 '베이스 1층 (온음표): C3 F2 G2 C3 A2 F2 G2 C3'와 같다 */
export const BASS_ROOT: Readonly<Record<ChordName, number>> = { C: 48, F: 41, G: 43, Am: 45 };
/** 뿌리에서 3도까지의 반음 수: 으뜸·버금딸림·딸림은 장3도, 라단조(Am)는 단3도 */
const BASS_THIRD: Readonly<Record<ChordName, number>> = { C: 4, F: 4, G: 4, Am: 3 };
const BASS_VELOCITY = 0.55;

/** 베이스의 한 마디: 1층 온음표 근음, 2층 근음과 5음(2분음표 둘), 3층 걷는 베이스(근음, 3도, 5도와 다음 마디 근음으로 가는 걸음 음) */
export function bassNotes(chord: ChordName, next: ChordName, stage: BassStage): WorldNote[] {
  const root = BASS_ROOT[chord];
  const fifth = root + 7;
  switch (stage) {
    case 'none':
      return [];
    case 'whole':
      return [{ midi: root, beat: 0, beats: 3.9, velocity: BASS_VELOCITY }];
    case 'fifth':
      return [
        { midi: root, beat: 0, beats: 1.9, velocity: BASS_VELOCITY },
        { midi: fifth, beat: 2, beats: 1.9, velocity: BASS_VELOCITY * 0.9 },
      ];
    case 'walking':
      return [root, root + BASS_THIRD[chord], fifth, approachNote(fifth, BASS_ROOT[next])].map((midi, beat) => ({ midi, beat, beats: 0.9, velocity: beat === 0 ? BASS_VELOCITY : BASS_VELOCITY * 0.85 }));
  }
}

/**
 * 다음 마디의 근음으로 가는 걸음 음: 근음에서 온음계로 한 계단 위나 아래 가운데, 지금의 5음에서 가까운 쪽(5음과 같은 음은 빼서 같은 음을 되풀이하지 않는다).
 * 다장조의 음만 나온다.
 */
export function approachNote(fifth: number, nextRoot: number): number {
  const candidates = [diatonicStepDown(nextRoot, 1), diatonicStepUp(nextRoot, 1)].filter((m) => m !== fifth);
  return candidates.reduce((best, m) => (Math.abs(m - fifth) < Math.abs(best - fifth) ? m : best), candidates[candidates.length - 1]!);
}

// ---------------------------------------------------------------------------
// 광장 합주의 나머지 성부(6.2 표, 7-4): 오선 언덕의 가락, 음계 길의 달리는 음, 건반 늪의 꾸밈음.
// 층이 오르면 먼저 있던 소리는 그대로이고 더해질 뿐이다(단계마다 앞 단계의 음을 모두 품는다). 모두 다장조이고 마디 안에서 시작하고 끝난다.
// 작곡이 필요한 콘텐츠(11.5)라서 사람의 음악 검수(D-4)를 거치기 전까지는 '자동으로 만든 임시 판'이다.

/** [음, 시작 박, 길이(박)] */
type MelodyEntry = readonly [number, number, number];

/**
 * 오선 언덕의 가락 8마디(8.3). 앞 4마디는 Q08의 예시 가락(C4 D4 E4 G4 / A4 G4 F4 E4 / D4 F4 A4 G4 / E4 D4 C4)이고,
 * 뒤 4마디는 이 구현이 이어 쓴 것이다: 으뜸화음 음 위로 한 번 올라갔다가(A단조 마디) 계단으로 높은 D까지 올라 으뜸음으로 내려앉는다.
 * 마디마다 센 박(첫 박과 셋째 박) 가운데 적어도 한 곳에는 그 마디 화음(C F G C Am F G C)의 구성음이 온다(앞 4마디도 그렇다). 센 박 둘 다가 구성음인 것은 아니다.
 */
export const MELODY: ReadonlyArray<ReadonlyArray<MelodyEntry>> = [
  [[60, 0, 1], [62, 1, 1], [64, 2, 1], [67, 3, 1]],
  [[69, 0, 1], [67, 1, 1], [65, 2, 1], [64, 3, 1]],
  [[62, 0, 1], [65, 1, 1], [69, 2, 1], [67, 3, 1]],
  [[64, 0, 1], [62, 1, 1], [60, 2, 2]],
  [[69, 0, 1], [72, 1, 1], [71, 2, 1], [69, 3, 1]],
  [[67, 0, 1], [69, 1, 1], [72, 2, 1], [69, 3, 1]],
  [[67, 0, 1], [69, 1, 1], [71, 2, 1], [74, 3, 1]],
  [[72, 0, 1], [67, 1, 1], [64, 2, 1], [60, 3, 1]],
];
const MELODY_VELOCITY = 0.5;
/** 옥타브 위 겹침은 본 가락보다 여리다 */
const MELODY_OCTAVE_RATIO = 0.55;
/** 4분음표는 조금 끊어서 낸다(뒤 음과 붙어 뭉치지 않게) */
const MELODY_GAP = 0.1;

/**
 * 가락의 한 마디: 1층 뼈대 음(센 박인 첫 박과 셋째 박에서 시작하는 음만, 다음 센 박까지 늘여서), 2층 가락 전체, 3층 가락 전체에 옥타브 위 겹침.
 * barOfLoop은 8마디 되풀이 안의 자리다(음수와 8 이상도 바르게 센다).
 */
export function melodyNotes(barOfLoop: number, stage: MelodyStage): WorldNote[] {
  const bar = MELODY[barInLoop(barOfLoop)]!;
  const full = (): WorldNote[] => bar.map(([midi, beat, beats]) => ({ midi, beat, beats: beats - MELODY_GAP, velocity: MELODY_VELOCITY }));
  switch (stage) {
    case 'none':
      return [];
    case 'skeleton':
      return bar.filter(([, beat]) => beat === 0 || beat === 2).map(([midi, beat]) => ({ midi, beat, beats: 2 - MELODY_GAP, velocity: MELODY_VELOCITY }));
    case 'full':
      return full();
    case 'octave':
      return [...full(), ...full().map((n) => ({ ...n, midi: n.midi + 12, velocity: n.velocity * MELODY_OCTAVE_RATIO }))];
  }
}

/** 달리는 음의 음계: 다장조 C5에서 C6까지 열여섯 분음표 여덟 개(반 마디, 2박) */
export const RUN_UP: readonly number[] = [72, 74, 76, 77, 79, 81, 83, 84];
export const RUN_DOWN: readonly number[] = [...RUN_UP].reverse();
const RUN_STEP_BEATS = 0.25;
const RUN_NOTE_BEATS = 0.2;
const RUN_VELOCITY = 0.4;
const RUN_FIRST_VELOCITY = 0.46;

type RunnerRank = 1 | 2 | 3;
/** 달리는 음이 놓이는 자리: 어느 마디(0–7)의 앞 반(half 0, 1–2박)과 뒤 반(half 1, 3–4박)에, 오르는지 내리는지, 몇 층부터 */
export const RUN_SLOTS: ReadonlyArray<{ bar: number; half: 0 | 1; dir: 'up' | 'down'; from: RunnerRank }> = [
  // 1층: 4마디와 8마디 끝의 오름 음계
  { bar: 3, half: 1, dir: 'up', from: 1 },
  { bar: 7, half: 1, dir: 'up', from: 1 },
  // 2층: 내림 음계 추가(2마디와 6마디 끝)
  { bar: 1, half: 1, dir: 'down', from: 2 },
  { bar: 5, half: 1, dir: 'down', from: 2 },
  // 3층: 2마디마다 오름과 내림이 모두(마디마다 앞 반에 반대쪽 음계가 더해진다)
  { bar: 1, half: 0, dir: 'up', from: 3 },
  { bar: 5, half: 0, dir: 'up', from: 3 },
  { bar: 3, half: 0, dir: 'down', from: 3 },
  { bar: 7, half: 0, dir: 'down', from: 3 },
];
const RUNNER_RANK: Readonly<Record<RunnerStage, number>> = { none: 0, rise: 1, 'rise-fall': 2, 'every-two': 3 };

/** 달리는 음의 한 마디: 6.2 표의 1층(4마디와 8마디 끝의 오름 음계), 2층(내림 음계 추가), 3층(2마디마다). 달리지 않는 마디는 비어 있다 */
export function runnerNotes(barOfLoop: number, stage: RunnerStage): WorldNote[] {
  const at = barInLoop(barOfLoop);
  const rank = RUNNER_RANK[stage];
  const out: WorldNote[] = [];
  for (const slot of RUN_SLOTS) {
    if (slot.bar !== at || slot.from > rank) continue;
    const scale = slot.dir === 'up' ? RUN_UP : RUN_DOWN;
    scale.forEach((midi, i) => out.push({ midi, beat: slot.half * 2 + i * RUN_STEP_BEATS, beats: RUN_NOTE_BEATS, velocity: i === 0 ? RUN_FIRST_VELOCITY : RUN_VELOCITY }));
  }
  return out.sort((a, b) => a.beat - b.beat);
}

/**
 * 꾸밈음이 놓이는 자리: 어느 마디(0–7)에, 반음 아래에서 들어오는 꾸밈음(grace)과 그 음이 가는 화음의 구성음(target), 몇 층부터.
 * 달리는 음(RUN_SLOTS)은 홀수째 마디(1, 3, 5, 7)에서 달리므로 꾸밈음은 짝수째 마디(0, 2, 4, 6)에 둔다(7-5): 달리는 음계의 한 음과 꾸밈음의 반음 앞꾸밈이
 * 같은 순간에 시작해 반음으로 부딪히는 일이 없게 하려는 것이다(D-246).
 */
export const ORNAMENT_SLOTS: ReadonlyArray<{ bar: number; grace: number; target: number; from: 1 | 2 | 3 }> = [
  // 1층: 8마디에 반음 꾸밈 하나(7번째 마디 G 화음의 뿌리 G로 들어가는 F♯. 다음 마디의 으뜸화음으로 이어 가는 딸림화음 마디다)
  { bar: 6, grace: 78, target: 79, from: 1 },
  // 2층: 4마디마다(3번째 마디, G 화음의 뿌리 G로 들어가는 F♯)
  { bar: 2, grace: 78, target: 79, from: 2 },
  // 3층: 2마디마다(1번째 마디 으뜸화음의 5음 G로 들어가는 F♯, 5번째 마디 A단조 화음의 뿌리 A로 들어가는 G♯)
  // 1번째 마디의 으뜸화음 3음 E로 들어가는 D♯은 가락의 옥타브 위 겹침(E5)과 반음으로 부딪혀서 쓰지 않는다(D-246)
  { bar: 0, grace: 78, target: 79, from: 3 },
  { bar: 4, grace: 80, target: 81, from: 3 },
];
const ORNAMENT_RANK: Readonly<Record<OrnamentStage, number>> = { none: 0, last: 1, 'every-four': 2, 'every-two': 3 };
const GRACE_BEAT = 2.75;
const GRACE_BEATS = 0.25;
const GRACE_VELOCITY = 0.34;
const ORNAMENT_VELOCITY = 0.42;

/**
 * 꾸밈음의 한 마디: 6.2 표의 1층(8마디에 반음 꾸밈 하나), 2층(4마디마다), 3층(2마디마다). 꾸밈음은 반음 아래(검은 건반)에서 짧게 들어와 화음의 구성음에 앉는다.
 * 꾸미지 않는 마디는 비어 있다. 마디 끝에서 다음 마디로 이어 가므로 앞 마디의 소리는 다음 마디의 첫 박 전에 끝난다.
 */
export function ornamentNotes(barOfLoop: number, stage: OrnamentStage): WorldNote[] {
  const at = barInLoop(barOfLoop);
  const rank = ORNAMENT_RANK[stage];
  const out: WorldNote[] = [];
  for (const slot of ORNAMENT_SLOTS) {
    if (slot.bar !== at || slot.from > rank) continue;
    out.push({ midi: slot.grace, beat: GRACE_BEAT, beats: GRACE_BEATS, velocity: GRACE_VELOCITY });
    out.push({ midi: slot.target, beat: GRACE_BEAT + GRACE_BEATS, beats: BEATS_PER_BAR - (GRACE_BEAT + GRACE_BEATS) - 0.1, velocity: ORNAMENT_VELOCITY });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 지역의 바탕 소리(8.1 '세계 바탕', 6.2, 6-8, 7-4): 그 지역 안에서만 들리고 지역 경계에서 2초에 걸쳐 섞인다.
// 긴 화음과 자연음에, 층이 오르면 그 지역이 맡은 성부(타악, 베이스, 가락, 달리는 음, 꾸밈음)가 더해진다.
// 화음은 광장 합주와 같은 진행(C F G C Am F G C)을 따라 어디서 겹쳐도 어울린다. 마을에는 바탕이 없다(광장 합주가 마을의 소리다).

/** 자연음의 종류: 강의 물소리, 숲의 바람 소리, 언덕의 바람결, 길가의 풀 소리, 늪의 안개 소리. 음원은 소음을 거른 합성음이다 */
export type NatureTimbre = 'river' | 'wind' | 'breeze' | 'grass' | 'mist';
/** 지역이 광장 합주에 더하는 성부(지역 파일의 ensemblePart와 같은 이름) */
export type RegionPart = 'percussion' | 'bass' | 'melody' | 'runner' | 'ornament';
/** 긴 화음의 모양: 열린 5도(뿌리와 5도만), 한 옥타브 위의 3화음, 높은 2도 꾸밈 화음(뿌리·2도·5도), 넓게 벌린 3화음, 낮은 5도 */
export type BedVoicing = 'open-fifth' | 'triad' | 'sus2' | 'open-triad' | 'low-fifth';

export interface RegionBedDef {
  regionId: RegionId;
  /** 지역 파일(content/regions)의 ambientBedId와 같다 */
  bedId: string;
  nature: NatureTimbre;
  part: RegionPart;
  voicing: BedVoicing;
}

/** 바탕 소리가 있는 지역(마을 밖 다섯). 지역 차례(world.ts의 REGION_IDS)를 따른다 */
export const REGION_BEDS: readonly RegionBedDef[] = [
  { regionId: 'staff-hill', bedId: 'bed.staff-hill', nature: 'breeze', part: 'melody', voicing: 'sus2' },
  { regionId: 'beat-river', bedId: 'bed.beat-river', nature: 'river', part: 'percussion', voicing: 'open-fifth' },
  { regionId: 'bell-grove', bedId: 'bed.bell-grove', nature: 'wind', part: 'bass', voicing: 'triad' },
  { regionId: 'scale-trail', bedId: 'bed.scale-trail', nature: 'grass', part: 'runner', voicing: 'open-triad' },
  { regionId: 'key-marsh', bedId: 'bed.key-marsh', nature: 'mist', part: 'ornament', voicing: 'low-fifth' },
];

export const regionBedOf = (regionId: RegionId): RegionBedDef | undefined => REGION_BEDS.find((b) => b.regionId === regionId);

/**
 * 자연음을 거르는 높이. 음이 아니라 소음의 가운데 주파수를 정하는 값이다(MIDI를 주파수로 읽는다):
 * 강은 높은 대역, 숲의 바람은 낮은 대역, 언덕의 바람결은 가운데 높은 대역, 풀 소리는 가장 높은 대역(사각거림), 늪의 안개는 가장 낮은 대역.
 * 시험이 다장조의 음인지 보도록 모두 다장조의 음에 맞춰 둔다.
 */
export const NATURE_CENTER_MIDI: Readonly<Record<NatureTimbre, number>> = { river: 83, wind: 60, breeze: 79, grass: 88, mist: 55 };
const NATURE_VELOCITY = 0.5;
const BED_CHORD_VELOCITY: Readonly<Record<BedVoicing, number>> = { 'open-fifth': 0.35, triad: 0.3, sus2: 0.28, 'open-triad': 0.3, 'low-fifth': 0.4 };

/** 긴 화음의 음들: 마디의 화음(광장 합주와 같은 진행)을 이 지역의 모양으로 벌린 것. 모두 다장조의 음이다 */
export function bedChordMidis(chord: ChordName, voicing: BedVoicing): number[] {
  const root = BASS_ROOT[chord];
  switch (voicing) {
    case 'open-fifth':
      return [root + 12, root + 19];
    case 'triad':
      return CHORD_VOICING[chord].map((m) => m + 12);
    case 'sus2':
      // 뿌리, 온음 위(다장조에서는 C D, F G, G A, A B가 모두 온음이다), 5음. 두 옥타브 위에서 맑게 열린 소리
      return [root + 24, root + 26, root + 31];
    case 'open-triad':
      // 뿌리와 5음 위에 한 옥타브 넘겨 3음을 얹은 넓은 3화음
      return [root + 12, root + 19, root + 24 + BASS_THIRD[chord]];
    case 'low-fifth':
      return [root, root + 7];
  }
}

export interface RegionBedBar {
  /** 긴 화음: 한 마디에 하나. 마디마다 화음이 바뀐다 */
  chord: WorldNote[];
  /** 자연음: 한 마디에 한 번 일었다 잦아드는 소리(마디가 이어져도 끊기지 않게 겹친다) */
  nature: WorldNote[];
  /** 그 지역이 맡은 성부. 층이 0이면 비어 있다 */
  part: WorldNote[];
}

/** 지역이 맡은 성부의 한 마디(층 0–3). 광장 합주의 같은 성부와 같은 음이다 */
export function regionPartNotes(part: RegionPart, barOfLoop: number, layer: number): WorldNote[] {
  const at = barInLoop(barOfLoop);
  const chord = PROGRESSION[at]!;
  const next = PROGRESSION[(at + 1) % LOOP_BARS]!;
  switch (part) {
    case 'percussion':
      return percussionNotes(percussionStageOf(layer));
    case 'bass':
      return bassNotes(chord, next, bassStageOf(layer));
    case 'melody':
      return melodyNotes(at, melodyStageOf(layer));
    case 'runner':
      return runnerNotes(at, runnerStageOf(layer));
    case 'ornament':
      return ornamentNotes(at, ornamentStageOf(layer));
  }
}

/** 지역의 바탕 소리 한 마디. 바탕 소리가 없는 지역(마을)이면 null이다 */
export function regionBedBar(regionId: RegionId, barOfLoop: number, layer: number): RegionBedBar | null {
  const def = regionBedOf(regionId);
  if (!def) return null;
  const at = barInLoop(barOfLoop);
  const chord = PROGRESSION[at]!;
  return {
    chord: bedChordMidis(chord, def.voicing).map((midi) => ({ midi, beat: 0, beats: 3.9, velocity: BED_CHORD_VELOCITY[def.voicing] })),
    nature: [{ midi: NATURE_CENTER_MIDI[def.nature], beat: 0, beats: BEATS_PER_BAR, velocity: NATURE_VELOCITY }],
    part: regionPartNotes(def.part, at, layer),
  };
}

// ---------------------------------------------------------------------------
// 지역의 표지가 내는 소리(3.5, 7-4): 건반 늪의 기준음 탑은 소리굽쇠 모양이고 A4(440 Hz)를 낮게 울린다.
// 서명 소리와 같은 거리 감쇠(900 px, 8.4)로 들리고, 마디마다 이어서 울려 끊기지 않는 울림이 된다.

export interface LandmarkSoundDef {
  regionId: RegionId;
  /** 울리는 음(A4 = 69) */
  midi: number;
}

export const LANDMARK_SOUNDS: readonly LandmarkSoundDef[] = [{ regionId: 'key-marsh', midi: 69 }];
/** 표지가 울리는 세기(서명 소리 0.7보다 훨씬 여리다: 가까이 가야 알아챈다) */
const LANDMARK_VELOCITY = 0.4;

/** 표지의 소리 한 마디: 마디 전체를 채우는 긴 음 하나. 다음 마디의 음과 서로 겹치며 이어진다(음색의 어택과 릴리스가 길다) */
export const landmarkNotes = (def: LandmarkSoundDef): WorldNote[] => [{ midi: def.midi, beat: 0, beats: BEATS_PER_BAR, velocity: LANDMARK_VELOCITY }];

// ---------------------------------------------------------------------------
// 서명 소리(8.4)

/** 서명 소리가 울리는 주기(마디). 4마디에 한 번, 12초마다 */
export const SIGNATURE_PERIOD_BARS = 4;
/** 들리는 거리(px) */
export const HEAR_RADIUS = 900;
/** 이보다 작게 들리는 소리는 내지 않는다 */
export const MIN_HEARD_GAIN = 0.01;
/** 정거장의 서명 소리를 낼 때의 기본 세기 */
export const SIGNATURE_VELOCITY = 0.7;

/** 음량 = (1 − 거리 ÷ 900)의 제곱. 900 px 밖이면 0이다 */
export function hearGain(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0 || distance >= HEAR_RADIUS) return 0;
  const r = 1 - distance / HEAR_RADIUS;
  return r * r;
}

/** 좌우: 소리가 캐릭터의 왼쪽(dx < 0)에 있으면 왼쪽이 더 크게 들린다. −1(왼쪽 끝)–1(오른쪽 끝) */
export function hearPan(dx: number): number {
  if (!Number.isFinite(dx)) return 0;
  return Math.max(-1, Math.min(1, dx / 600));
}

/** 정거장마다 시작 마디를 어긋나게 한다(한꺼번에 울리지 않게). 정거장의 차례 번호로 정한다 */
export const signatureOffset = (stationIndex: number): number => ((stationIndex % SIGNATURE_PERIOD_BARS) + SIGNATURE_PERIOD_BARS) % SIGNATURE_PERIOD_BARS;

/** 이 마디에 그 정거장의 서명 소리가 울리는가 */
export const rings = (absBar: number, offset: number): boolean => ((absBar % SIGNATURE_PERIOD_BARS) + SIGNATURE_PERIOD_BARS) % SIGNATURE_PERIOD_BARS === offset;
/** absBar 이하에서 가장 가까운, 이 자리(offset)의 서명 소리가 울리는 마디. 소리 물결이 같은 박에 퍼지게 하는 데 쓴다 */
export const lastRingBar = (absBar: number, offset: number): number => absBar - ((((absBar - offset) % SIGNATURE_PERIOD_BARS) + SIGNATURE_PERIOD_BARS) % SIGNATURE_PERIOD_BARS);

// ---------------------------------------------------------------------------
// 소리 조각(3.6, 8.1): 한 마디짜리 가락. 600 px 안에서 들리고 거리에 따라 줄어든다(pieceHearGain). 세계 시계의 마디에 맞춰 울린다.

/** 소리 조각이 울리는 주기(마디): 한 마디 울리고 한 마디 쉰다 */
export const PIECE_PERIOD_BARS = 2;
/** 소리 조각을 낼 때의 기본 세기(서명 소리보다 여리게) */
export const PIECE_VELOCITY = 0.6;

const modulo = (n: number, m: number): number => ((n % m) + m) % m;

/** 이 마디에 그 소리 조각이 울리는가. 번호의 짝수와 홀수가 번갈아 울려서 이웃한 조각이 한꺼번에 울리지 않는다 */
export const pieceRings = (absBar: number, pieceIndex: number): boolean => modulo(absBar - pieceIndex, PIECE_PERIOD_BARS) === 0;
/** absBar 이하에서 가장 가까운, 이 조각이 울리는 마디. 소리 물결이 같은 박에 퍼지게 하는 데 쓴다 */
export const lastPieceRingBar = (absBar: number, pieceIndex: number): number => absBar - modulo(absBar - pieceIndex, PIECE_PERIOD_BARS);

/** 소리 조각의 음을 세계 시계의 박으로 옮긴다. 마디 처음부터의 박(4분음표 80)이다. 음이 끊어져 들리도록 길이를 조금 줄인다 */
export function pieceWorldNotes(piece: Pick<SoundPieceDef, 'notes'>): WorldNote[] {
  return piece.notes.map((n) => ({ midi: n.midi, beat: n.onsetTicks / PIECE_PPQ, beats: Math.max(0.4, (n.durationTicks / PIECE_PPQ) * 0.92), velocity: PIECE_VELOCITY }));
}

/** 서명 소리의 두 판: 기본 판과, 꽃등이 켜진 뒤의 성부가 하나 더해진 판 */
export type SignatureVersion = 'base' | 'flower';

export interface Signature {
  /** 기본 판의 가락(한 마디) */
  base: WorldNote[];
  /** 꽃등 판에서 더해지는 성부. 꽃등 판은 base와 이것을 함께 울린다 */
  flowerVoice: WorldNote[];
}

/** 다장조 오음음계(도 레 미 솔 라)로 두 옥타브: 60–79 */
const PENTATONIC = [60, 62, 64, 67, 69, 72, 74, 76, 79] as const;
/** 끝나는 음으로 쓰는 으뜸화음 음(도, 미, 솔)의 자리 */
const ENDING = [0, 2, 3, 5, 7, 8] as const;

/** 한 마디 안의 박자꼴: [시작 박, 길이]. 쉼표도 섞는다 */
const RHYTHMS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 1], [1, 1], [2, 2]],
  [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]],
  [[0, 0.5], [0.5, 0.5], [1, 1], [2, 2]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
  [[0, 2], [2, 1], [3, 1]],
  [[0, 1], [2, 1], [3, 1]],
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 0.5], [1, 0.5], [2, 1], [3, 1]],
  [[0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1.5]],
  [[0, 1], [1, 1], [2, 1.5], [3.5, 0.5]],
];

/** 이름 문자열로 정하는 씨앗(FNV-1a) */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 씨앗에서 0–1의 수를 차례로 뽑는 작은 난수(mulberry32). 같은 씨앗이면 늘 같은 열이 나온다 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 다장조의 온음계(도 레 미 파 솔 라 시)에서 한 계단씩 올라간 음을 찾는다. 범위는 C3–C7 */
const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
export function diatonicStepUp(midi: number, steps: number): number {
  let m = midi;
  let left = steps;
  while (left > 0) {
    m += 1;
    if (MAJOR_PCS.includes((((m % 12) + 12) % 12) as (typeof MAJOR_PCS)[number])) left--;
  }
  return m;
}

/** 다장조의 온음계에서 한 계단씩 내려간 음을 찾는다(걷는 베이스의 걸음 음에 쓴다) */
export function diatonicStepDown(midi: number, steps: number): number {
  let m = midi;
  let left = steps;
  while (left > 0) {
    m -= 1;
    if (MAJOR_PCS.includes((((m % 12) + 12) % 12) as (typeof MAJOR_PCS)[number])) left--;
  }
  return m;
}

/**
 * 정거장의 서명 소리. 같은 정거장은 늘 같은 가락이다(정거장 id가 씨앗이다).
 * 가락은 다장조 오음음계에서 계단 걸음으로 움직이고 으뜸화음 음으로 끝난다. 꽃등 판은 같은 가락에 3도 위 성부를 하나 더한다.
 */
export function signatureOf(stationId: string, salt = 0): Signature {
  const rand = rng(hashOf(stationId) + salt * 7919);
  const rhythm = RHYTHMS[Math.floor(rand() * RHYTHMS.length)]!;
  let at = Math.floor(rand() * PENTATONIC.length);
  const base: WorldNote[] = rhythm.map(([beat, beats], i) => {
    if (i === rhythm.length - 1) {
      // 끝 음: 으뜸화음 음 가운데 지금 자리에서 가까운 것
      at = ENDING.reduce((best, e) => (Math.abs(e - at) < Math.abs(best - at) ? e : best), ENDING[0]);
    } else if (i > 0) {
      const step = Math.floor(rand() * 5) - 2; // −2…+2
      at = Math.max(0, Math.min(PENTATONIC.length - 1, at + (step === 0 ? 1 : step)));
    }
    return { midi: PENTATONIC[at]!, beat, beats: Math.max(0.4, beats * 0.9), velocity: SIGNATURE_VELOCITY };
  });
  const flowerVoice: WorldNote[] = base.map((n) => ({ ...n, midi: diatonicStepUp(n.midi, 2), velocity: n.velocity * 0.6 }));
  return { base, flowerVoice };
}

/** 지역마다 서명 소리의 음색을 달리한다(8.5의 제안: 교실의 악기를 지역에 붙인다, D-5는 아직 열려 있다) */
export type SignatureTimbre = 'bell' | 'chime' | 'wood' | 'handbell' | 'kalimba' | 'pluck';
export const REGION_TIMBRE: Readonly<Record<RegionId, SignatureTimbre>> = {
  village: 'bell',
  'staff-hill': 'chime',
  'beat-river': 'wood',
  'bell-grove': 'handbell',
  'scale-trail': 'kalimba',
  'key-marsh': 'pluck',
};
