// 6-8 광장 합주의 다른 성부와 지역의 바탕 소리의 순수 계산(설계서 6.2 표, 8.1, 8.3), 7-4가 더한 세 지역의 성부와 바탕과 표지의 소리.
// 완료 기준의 도메인 쪽 근거: 층이 오르면 광장 합주가 달라진다(박자 강가는 타악, 종나무 숲은 베이스가 더해진다).
// 오선 언덕의 가락, 음계 길의 달리는 음, 건반 늪의 꾸밈음은 7-5에서 광장 합주(plazaBar)에도 더해졌다. 그 시험은 world-audio-parts.test.ts와 ensemble-check.test.ts에 있고, 여기서는 지역 성부 함수만 시험한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASS_STAGES,
  MELODY_STAGES,
  ORNAMENT_STAGES,
  PERCUSSION_STAGES,
  RUNNER_STAGES,
  bassStageOf,
  chordStageOf,
  clampLayer,
  melodyStageOf,
  ornamentStageOf,
  percussionStageOf,
  runnerStageOf,
} from '@/domain/reaction';
import {
  BASS_ROOT,
  BEATS_PER_BAR,
  CHORD_VOICING,
  LANDMARK_SOUNDS,
  LOOP_BARS,
  MELODY,
  NATURE_CENTER_MIDI,
  ORNAMENT_SLOTS,
  PERCUSSION_MIDI,
  PROGRESSION,
  REGION_BEDS,
  RUN_DOWN,
  RUN_SLOTS,
  RUN_UP,
  approachNote,
  barInLoop,
  bassNotes,
  bedChordMidis,
  diatonicStepDown,
  diatonicStepUp,
  landmarkNotes,
  melodyNotes,
  ornamentNotes,
  percussionNotes,
  plazaBar,
  regionBedBar,
  regionBedOf,
  regionPartNotes,
  runnerNotes,
} from '@/domain/worldsound';
import type { WorldNote } from '@/domain/worldsound';
import { REGION_IDS, WorldMap, parseRegion } from '@/domain/world';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'content', 'regions');
const map = new WorldMap(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => parseRegion(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).region!));

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const pc = (midi: number): number => ((midi % 12) + 12) % 12;
const allNotes = (n: readonly WorldNote[]): boolean => n.every((x) => C_MAJOR.has(pc(x.midi)));
const inBar = (n: readonly WorldNote[]): boolean => n.every((x) => x.beat >= 0 && x.beat < BEATS_PER_BAR && x.beat + x.beats <= BEATS_PER_BAR && x.velocity > 0 && x.velocity <= 1);
const LAYERS = [0, 1, 2, 3] as const;
const BARS = Array.from({ length: LOOP_BARS }, (_, i) => i);
const key = (n: readonly WorldNote[]): string => JSON.stringify(n);
/** 음의 시작(음높이@박)들. 길이와 세기와 상관없이 어느 음이 어느 박에 있는지만 본다 */
const onsets = (n: readonly WorldNote[]): string[] => n.map((x) => `${x.midi}@${x.beat}`);
/** 마디(0–7)별로 비어 있지 않은 마디의 번호들 */
const barsWith = (f: (bar: number) => readonly WorldNote[]): number[] => BARS.filter((bar) => f(bar).length > 0);
/** 그 마디 화음의 구성음 음이름(0–11) */
const chordTones = (bar: number): Set<number> => new Set(CHORD_VOICING[PROGRESSION[bar]!].map(pc));
/** 꾸밈음(앞꾸밈): 다장조 밖의 음이 0.25박 뒤에 반음 높은 다장조의 음으로 풀린다. 이런 음만 다장조 밖에 있을 수 있다 */
const resolvedGrace = (notes: readonly WorldNote[], n: WorldNote): boolean =>
  !C_MAJOR.has(pc(n.midi)) && notes.some((o) => o.midi === n.midi + 1 && C_MAJOR.has(pc(o.midi)) && Math.abs(o.beat - (n.beat + n.beats)) < 1e-9 && n.beats === 0.25);

describe('층 단계(6.2 표)', () => {
  it('박자 강가: 0층 없음, 1층 첫 박, 2층 4분음표, 3층 8분음표 채움', () => {
    expect(LAYERS.map(percussionStageOf)).toEqual(['none', 'first', 'quarter', 'eighth']);
    expect([...PERCUSSION_STAGES]).toEqual(['none', 'first', 'quarter', 'eighth']);
  });

  it('종나무 숲: 0층 없음, 1층 온음표 근음, 2층 근음과 5음, 3층 걷는 베이스', () => {
    expect(LAYERS.map(bassStageOf)).toEqual(['none', 'whole', 'fifth', 'walking']);
    expect([...BASS_STAGES]).toEqual(['none', 'whole', 'fifth', 'walking']);
  });

  it('오선 언덕: 0층 없음, 1층 뼈대 음만, 2층 가락 전체, 3층 옥타브 위 겹침', () => {
    expect(LAYERS.map(melodyStageOf)).toEqual(['none', 'skeleton', 'full', 'octave']);
    expect([...MELODY_STAGES]).toEqual(['none', 'skeleton', 'full', 'octave']);
  });

  it('음계 길: 0층 없음, 1층 4마디와 8마디 끝의 오름 음계, 2층 내림 음계 추가, 3층 2마디마다', () => {
    expect(LAYERS.map(runnerStageOf)).toEqual(['none', 'rise', 'rise-fall', 'every-two']);
    expect([...RUNNER_STAGES]).toEqual(['none', 'rise', 'rise-fall', 'every-two']);
  });

  it('건반 늪: 0층 없음, 1층 8마디에 반음 꾸밈 하나, 2층 4마디마다, 3층 2마디마다', () => {
    expect(LAYERS.map(ornamentStageOf)).toEqual(['none', 'last', 'every-four', 'every-two']);
    expect([...ORNAMENT_STAGES]).toEqual(['none', 'last', 'every-four', 'every-two']);
  });

  it('층이 3을 넘으면 3과 같고 음수와 수가 아닌 것은 0과 같다(여섯 단계 모두)', () => {
    for (const f of [percussionStageOf, bassStageOf, chordStageOf, melodyStageOf, runnerStageOf, ornamentStageOf] as const) {
      expect(f(9)).toBe(f(3));
      expect(f(-2)).toBe(f(0));
      expect(f(Number.NaN)).toBe(f(0));
      expect(f(2.9)).toBe(f(2));
    }
    expect([-1, 0, 1.7, 3, 4, Number.NaN, Number.POSITIVE_INFINITY].map(clampLayer)).toEqual([0, 0, 1, 3, 3, 0, 0]);
  });
});

describe('타악(박자 강가): 층이 오르면 소리가 더해진다', () => {
  it('0층은 비어 있고 1층은 첫 박 하나, 2층은 네 박, 3층은 박과 박 사이의 채움까지 여덟 번이다', () => {
    expect(percussionNotes('none')).toEqual([]);
    expect(percussionNotes('first').map((n) => n.beat)).toEqual([0]);
    expect(percussionNotes('quarter').map((n) => n.beat)).toEqual([0, 1, 2, 3]);
    expect(percussionNotes('eighth').map((n) => n.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it('박마다 세기가 다르다: 첫 박이 가장 세고 셋째 박이 그다음이며 채움은 가장 여리다', () => {
    const eighth = percussionNotes('eighth');
    const v = (beat: number): number => eighth.find((n) => n.beat === beat)!.velocity;
    expect(v(0)).toBeGreaterThan(v(2));
    expect(v(2)).toBeGreaterThan(v(1));
    expect(v(1)).toBe(v(3));
    for (const off of [0.5, 1.5, 2.5, 3.5]) expect(v(off), `채움 ${off}`).toBeLessThan(v(1));
  });

  it('층이 오르면 먼저 있던 소리는 그대로이고 더해질 뿐이다(박과 세기가 같다)', () => {
    const stages = ['first', 'quarter', 'eighth'] as const;
    for (let i = 0; i + 1 < stages.length; i++) {
      const lower = percussionNotes(stages[i]!);
      const higher = percussionNotes(stages[i + 1]!);
      expect(higher.length).toBeGreaterThan(lower.length);
      for (const n of lower) expect(higher, `${stages[i]} → ${stages[i + 1]}`).toContainEqual(n);
    }
  });

  it('모든 타악은 한 음(높은 도)이고 짧으며 마디 안에서 시작하고 끝난다', () => {
    for (const stage of PERCUSSION_STAGES) {
      const notes = percussionNotes(stage);
      expect(notes.every((n) => n.midi === PERCUSSION_MIDI)).toBe(true);
      expect(notes.every((n) => n.beats < 0.5)).toBe(true);
      expect(inBar(notes)).toBe(true);
      expect(allNotes(notes)).toBe(true);
    }
  });
});

describe('베이스(종나무 숲): 층이 오르면 소리가 더해진다', () => {
  const at = (bar: number): [(typeof PROGRESSION)[number], (typeof PROGRESSION)[number]] => [PROGRESSION[bar]!, PROGRESSION[(bar + 1) % LOOP_BARS]!];

  it('1층의 온음표 근음은 설계서 8.3의 C3 F2 G2 C3 A2 F2 G2 C3이다', () => {
    const roots = BARS.map((bar) => {
      const notes = bassNotes(...at(bar), 'whole');
      expect(notes).toHaveLength(1);
      expect(notes[0]!.beat).toBe(0);
      expect(notes[0]!.beats).toBeGreaterThan(3.5);
      return notes[0]!.midi;
    });
    expect(roots).toEqual([48, 41, 43, 48, 45, 41, 43, 48]);
    expect(BARS.map((bar) => BASS_ROOT[PROGRESSION[bar]!])).toEqual(roots);
  });

  it('2층은 근음과 5음이다: 첫 박에 근음, 셋째 박에 5음(2분음표 둘)', () => {
    for (const bar of BARS) {
      const [chord, next] = at(bar);
      const notes = bassNotes(chord, next, 'fifth');
      expect(notes.map((n) => n.beat)).toEqual([0, 2]);
      expect(notes.map((n) => n.midi)).toEqual([BASS_ROOT[chord], BASS_ROOT[chord] + 7]);
      expect(notes.every((n) => n.beats > 1.5 && n.beats < 2)).toBe(true);
    }
  });

  it('3층은 걷는 베이스다: 근음, 3도, 5도에 다음 마디 근음으로 가는 걸음 음(여덟 마디의 모든 음)', () => {
    const lines = BARS.map((bar) => bassNotes(...at(bar), 'walking').map((n) => n.midi));
    expect(lines).toEqual([
      [48, 52, 55, 43],
      [41, 45, 48, 45],
      [43, 47, 50, 47],
      [48, 52, 55, 47],
      [45, 48, 52, 43],
      [41, 45, 48, 45],
      [43, 47, 50, 47],
      [48, 52, 55, 50],
    ]);
    for (const bar of BARS) expect(bassNotes(...at(bar), 'walking').map((n) => n.beat)).toEqual([0, 1, 2, 3]);
  });

  it('걸음 음은 다음 마디 근음에서 온음계로 한 계단이고 5음을 되풀이하지 않는다', () => {
    for (const bar of BARS) {
      const [chord, next] = at(bar);
      const fifth = BASS_ROOT[chord] + 7;
      const step = approachNote(fifth, BASS_ROOT[next]);
      expect([diatonicStepDown(BASS_ROOT[next], 1), diatonicStepUp(BASS_ROOT[next], 1)], `${bar}마디`).toContain(step);
      expect(step, `${bar}마디`).not.toBe(fifth);
      expect(C_MAJOR.has(pc(step))).toBe(true);
    }
  });

  it('근음은 어느 층에서나 첫 박의 같은 음이다. 층이 오르면 베이스가 길어지지 않고 단계가 바뀐다', () => {
    for (const bar of BARS) {
      const [chord, next] = at(bar);
      for (const stage of ['whole', 'fifth', 'walking'] as const) {
        const first = bassNotes(chord, next, stage)[0]!;
        expect([first.beat, first.midi], `${bar}마디 ${stage}`).toEqual([0, BASS_ROOT[chord]]);
      }
      const counts = (['whole', 'fifth', 'walking'] as const).map((s) => bassNotes(chord, next, s).length);
      expect(counts).toEqual([1, 2, 4]);
    }
  });

  it('베이스는 모두 다장조의 음이고 F2–G3 안이며 마디 안에서 시작하고 끝난다. 0층은 비어 있다', () => {
    for (const bar of BARS) {
      expect(bassNotes(...at(bar), 'none')).toEqual([]);
      for (const stage of ['whole', 'fifth', 'walking'] as const) {
        const notes = bassNotes(...at(bar), stage);
        expect(allNotes(notes)).toBe(true);
        expect(inBar(notes)).toBe(true);
        expect(notes.every((n) => n.midi >= 41 && n.midi <= 55)).toBe(true);
      }
    }
  });

  it('온음계로 한 계단 내려가고 올라간다', () => {
    expect([48, 41, 43, 45].map((m) => diatonicStepDown(m, 1))).toEqual([47, 40, 41, 43]);
    expect([48, 41, 43, 45].map((m) => diatonicStepUp(m, 1))).toEqual([50, 43, 45, 47]);
    expect(diatonicStepDown(60, 2)).toBe(57);
    expect(diatonicStepDown(60, 0)).toBe(60);
  });
});

describe('가락(오선 언덕): 층이 오르면 소리가 더해진다(7-4)', () => {
  const STAGES = ['skeleton', 'full', 'octave'] as const;

  it('앞 4마디는 설계서 8.3의 Q08 예시 가락이다: C4 D4 E4 G4 / A4 G4 F4 E4 / D4 F4 A4 G4 / E4 D4 C4', () => {
    expect([0, 1, 2, 3].map((bar) => melodyNotes(bar, 'full').map((n) => n.midi))).toEqual([
      [60, 62, 64, 67],
      [69, 67, 65, 64],
      [62, 65, 69, 67],
      [64, 62, 60],
    ]);
    expect(MELODY).toHaveLength(LOOP_BARS);
  });

  it('가락은 마디마다 4박을 빈틈없이 채우고(음 사이를 0.1박만 끊는다) 마디 안에서 끝난다', () => {
    for (const bar of BARS) {
      const full = melodyNotes(bar, 'full');
      expect(inBar(full), `${bar}마디`).toBe(true);
      full.forEach((n, i) => {
        const next = full[i + 1]?.beat ?? BEATS_PER_BAR;
        expect(n.beat + n.beats + 0.1, `${bar}마디 ${i}번째 음`).toBeCloseTo(next, 9);
      });
    }
  });

  it('마디마다 센 박(첫 박, 셋째 박) 가운데 적어도 한 곳에는 그 마디 화음(C F G C Am F G C)의 구성음이 온다', () => {
    for (const bar of BARS) {
      const strong = melodyNotes(bar, 'full').filter((n) => n.beat === 0 || n.beat === 2);
      expect(strong.some((n) => chordTones(bar).has(pc(n.midi))), `${bar}마디 ${PROGRESSION[bar]}`).toBe(true);
    }
  });

  it('1층은 센 박(첫 박과 셋째 박)의 음만 2분음표로, 2층은 가락 전체, 3층은 가락 전체에 한 옥타브 위 겹침이다', () => {
    for (const bar of BARS) {
      const full = melodyNotes(bar, 'full');
      const skeleton = melodyNotes(bar, 'skeleton');
      expect(melodyNotes(bar, 'none')).toEqual([]);
      expect(skeleton.map((n) => n.beat), `${bar}마디`).toEqual([0, 2]);
      expect(skeleton.map((n) => n.midi)).toEqual(full.filter((n) => n.beat === 0 || n.beat === 2).map((n) => n.midi));
      expect(skeleton.every((n) => n.beats > 1.5 && n.beats < 2)).toBe(true);
      const octave = melodyNotes(bar, 'octave');
      expect(octave).toHaveLength(full.length * 2);
      for (const n of full) {
        const up = octave.find((o) => o.midi === n.midi + 12 && o.beat === n.beat)!;
        expect(up, `${bar}마디 ${n.midi} 위`).toBeDefined();
        expect(up.velocity).toBeLessThan(n.velocity);
        expect(up.beats).toBe(n.beats);
      }
    }
  });

  it('층이 오르면 먼저 있던 소리는 그대로이고 더해질 뿐이다(음과 박이 같다)', () => {
    for (const bar of BARS) {
      for (let i = 0; i + 1 < STAGES.length; i++) {
        const lower = onsets(melodyNotes(bar, STAGES[i]!));
        const higher = onsets(melodyNotes(bar, STAGES[i + 1]!));
        expect(higher.length, `${bar}마디 ${STAGES[i]} → ${STAGES[i + 1]}`).toBeGreaterThan(lower.length);
        for (const o of lower) expect(higher, `${bar}마디 ${STAGES[i]} → ${STAGES[i + 1]}`).toContain(o);
      }
    }
  });

  it('모두 다장조의 음이고 마디 안에서 끝난다. 마디 번호가 8 이상이거나 음수여도 8마디 되풀이로 센다', () => {
    for (const stage of MELODY_STAGES) {
      for (const bar of BARS) {
        const notes = melodyNotes(bar, stage);
        expect(allNotes(notes), `${bar}마디 ${stage}`).toBe(true);
        expect(inBar(notes), `${bar}마디 ${stage}`).toBe(true);
        expect(melodyNotes(bar + LOOP_BARS, stage)).toEqual(notes);
        expect(melodyNotes(bar - LOOP_BARS, stage)).toEqual(notes);
      }
    }
  });
});

describe('달리는 음(음계 길): 층이 오르면 소리가 더해진다(7-4)', () => {
  const STAGES = ['rise', 'rise-fall', 'every-two'] as const;
  const runs = (stage: (typeof STAGES)[number], dir: 'up' | 'down'): number => BARS.reduce((sum, bar) => sum + runnerNotes(bar, stage).filter((n) => n.midi === (dir === 'up' ? RUN_UP[0] : RUN_DOWN[0]) && n.velocity > 0.45).length, 0);

  it('음계는 다장조 C5에서 C6까지 여덟 음이고, 내림 음계는 그 거꾸로다', () => {
    expect([...RUN_UP]).toEqual([72, 74, 76, 77, 79, 81, 83, 84]);
    expect([...RUN_DOWN]).toEqual([84, 83, 81, 79, 77, 76, 74, 72]);
    expect(RUN_UP.every((m) => C_MAJOR.has(pc(m)))).toBe(true);
  });

  it('1층은 4마디와 8마디 끝(3, 4박)의 오름 음계만 있고 나머지 마디는 비어 있다', () => {
    expect(barsWith((bar) => runnerNotes(bar, 'rise'))).toEqual([3, 7]);
    for (const bar of [3, 7]) {
      const notes = runnerNotes(bar, 'rise');
      expect(notes.map((n) => n.midi)).toEqual([...RUN_UP]);
      expect(notes.map((n) => n.beat)).toEqual([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]);
    }
    expect(runnerNotes(0, 'none')).toEqual([]);
  });

  it('2층은 내림 음계가 더해진다(2마디와 6마디 끝). 3층은 2마디마다(1, 3, 5, 7번째 마디 모두 두 번씩) 오름과 내림이 모두 있다', () => {
    expect(barsWith((bar) => runnerNotes(bar, 'rise-fall'))).toEqual([1, 3, 5, 7]);
    expect(runnerNotes(1, 'rise-fall').map((n) => n.midi)).toEqual([...RUN_DOWN]);
    expect(runnerNotes(1, 'rise-fall').map((n) => n.beat)).toEqual([2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75]);
    expect(runnerNotes(3, 'rise-fall').map((n) => n.midi)).toEqual([...RUN_UP]);
    expect(barsWith((bar) => runnerNotes(bar, 'every-two'))).toEqual([1, 3, 5, 7]);
    for (const bar of [1, 3, 5, 7]) {
      const notes = runnerNotes(bar, 'every-two');
      expect(notes, `${bar}마디`).toHaveLength(16);
      expect(notes.map((n) => n.beat)).toEqual(Array.from({ length: 16 }, (_, i) => i * 0.25));
    }
  });

  it('한 바퀴(8마디)에 오름과 내림이 몇 번인가: 1층 오름 2번, 2층 오름 2번과 내림 2번, 3층 오름 4번과 내림 4번', () => {
    expect([runs('rise', 'up'), runs('rise', 'down')]).toEqual([2, 0]);
    expect([runs('rise-fall', 'up'), runs('rise-fall', 'down')]).toEqual([2, 2]);
    expect([runs('every-two', 'up'), runs('every-two', 'down')]).toEqual([4, 4]);
  });

  it('층이 오르면 먼저 있던 소리는 그대로이고 더해질 뿐이다(음과 박이 같다)', () => {
    for (const bar of BARS) {
      for (let i = 0; i + 1 < STAGES.length; i++) {
        const lower = onsets(runnerNotes(bar, STAGES[i]!));
        const higher = onsets(runnerNotes(bar, STAGES[i + 1]!));
        for (const o of lower) expect(higher, `${bar}마디 ${STAGES[i]} → ${STAGES[i + 1]}`).toContain(o);
      }
    }
    // 어느 마디도 두 달리기가 같은 박에서 겹치지 않는다(자리표의 반마다 하나)
    const seen = new Set<string>();
    for (const slot of RUN_SLOTS) {
      const id = `${slot.bar}/${slot.half}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });

  it('모두 다장조의 음이고 마디 안에서 끝난다. 달리지 않는 마디와 0층은 비어 있다. 마디 번호는 8마디 되풀이로 센다', () => {
    for (const stage of RUNNER_STAGES) {
      for (const bar of BARS) {
        const notes = runnerNotes(bar, stage);
        expect(allNotes(notes)).toBe(true);
        expect(inBar(notes)).toBe(true);
        expect(runnerNotes(bar + LOOP_BARS, stage)).toEqual(notes);
      }
    }
    for (const bar of BARS) expect(runnerNotes(bar, 'none')).toEqual([]);
    expect(runnerNotes(0, 'every-two')).toEqual([]);
  });
});

describe('꾸밈음(건반 늪): 층이 오르면 소리가 더해진다(7-4)', () => {
  const STAGES = ['last', 'every-four', 'every-two'] as const;

  it('한 바퀴 8마디에서 1층은 7번째 마디(번호 6)에만, 2층은 3번째와 7번째 마디(2, 6), 3층은 1, 3, 5, 7번째 마디(0, 2, 4, 6)에 있다. 0층은 비어 있다(7-5: 짝수 번호)', () => {
    expect(barsWith((bar) => ornamentNotes(bar, 'none'))).toEqual([]);
    expect(barsWith((bar) => ornamentNotes(bar, 'last'))).toEqual([6]);
    expect(barsWith((bar) => ornamentNotes(bar, 'every-four'))).toEqual([2, 6]);
    expect(barsWith((bar) => ornamentNotes(bar, 'every-two'))).toEqual([0, 2, 4, 6]);
  });

  it('꾸밈음은 달리는 음과 같은 마디에 없다: 달리는 음은 홀수 번호 마디(1, 3, 5, 7), 꾸밈음은 짝수 번호 마디(0, 2, 4, 6)에서만 난다(7-5, D-246)', () => {
    const ornamentBars = barsWith((bar) => ornamentNotes(bar, 'every-two'));
    const runnerBars = barsWith((bar) => runnerNotes(bar, 'every-two'));
    expect(runnerBars.every((bar) => bar % 2 === 1)).toBe(true);
    expect(ornamentBars.every((bar) => bar % 2 === 0)).toBe(true);
    expect(ornamentBars.filter((bar) => runnerBars.includes(bar))).toEqual([]);
  });

  it('꾸밈음은 마디 끝(2.75박)에서 반음 아래의 검은 건반으로 0.25박만 들어와, 반음 위의 다장조 음에 앉는다', () => {
    for (const stage of STAGES) {
      for (const bar of BARS) {
        const notes = ornamentNotes(bar, stage);
        for (let i = 0; i < notes.length; i += 2) {
          const [grace, target] = [notes[i]!, notes[i + 1]!];
          expect([grace.beat, grace.beats], `${bar}마디 ${stage}`).toEqual([2.75, 0.25]);
          expect(C_MAJOR.has(pc(grace.midi)), `${bar}마디 앞꾸밈 ${grace.midi}`).toBe(false);
          expect(target.midi).toBe(grace.midi + 1);
          expect(C_MAJOR.has(pc(target.midi))).toBe(true);
          expect(target.beat).toBe(3);
          expect(grace.velocity).toBeLessThan(target.velocity);
        }
      }
    }
  });

  it('앉는 음은 그 마디 화음의 구성음이다(1번째 마디는 으뜸화음의 5음, 3번째와 7번째 마디는 G 화음의 뿌리, 5번째 마디는 A단조 화음의 뿌리)', () => {
    for (const slot of ORNAMENT_SLOTS) {
      expect(chordTones(slot.bar).has(pc(slot.target)), `${slot.bar}마디 ${PROGRESSION[slot.bar]}`).toBe(true);
      expect(slot.grace + 1).toBe(slot.target);
    }
    expect(ORNAMENT_SLOTS.map((s) => [s.bar, PROGRESSION[s.bar]])).toEqual([[6, 'G'], [2, 'G'], [0, 'C'], [4, 'Am']]);
    expect(ORNAMENT_SLOTS.map((s) => [s.grace, s.target])).toEqual([[78, 79], [78, 79], [78, 79], [80, 81]]);
  });

  it('앉는 음은 마디를 넘지 않는다: 다음 마디의 첫 박 전에 끝난다', () => {
    for (const stage of ORNAMENT_STAGES) for (const bar of BARS) expect(inBar(ornamentNotes(bar, stage))).toBe(true);
  });

  it('층이 오르면 먼저 있던 소리는 그대로이고 더해질 뿐이다(음과 박이 같다)', () => {
    for (const bar of BARS) {
      for (let i = 0; i + 1 < STAGES.length; i++) {
        const lower = onsets(ornamentNotes(bar, STAGES[i]!));
        const higher = onsets(ornamentNotes(bar, STAGES[i + 1]!));
        for (const o of lower) expect(higher, `${bar}마디 ${STAGES[i]} → ${STAGES[i + 1]}`).toContain(o);
      }
    }
    const counts = STAGES.map((stage) => BARS.reduce((sum, bar) => sum + ornamentNotes(bar, stage).length, 0) / 2);
    expect(counts).toEqual([1, 2, 4]); // 한 바퀴의 꾸밈음 수
  });

  it('다장조 밖의 음은 이 앞꾸밈뿐이다: 모두 0.25박 뒤에 반음 높은 다장조의 음으로 풀린다. 마디 번호는 8마디 되풀이로 센다', () => {
    for (const stage of ORNAMENT_STAGES) {
      for (const bar of BARS) {
        const notes = ornamentNotes(bar, stage);
        for (const n of notes) expect(C_MAJOR.has(pc(n.midi)) || resolvedGrace(notes, n), `${bar}마디 ${stage} ${n.midi}`).toBe(true);
        expect(ornamentNotes(bar + LOOP_BARS, stage)).toEqual(notes);
      }
    }
  });
});

describe('표지가 내는 소리(건반 늪의 기준음 탑, 7-4)', () => {
  it('기준음 탑은 A4(MIDI 69)를 울리고, 지금 소리를 내는 표지는 이것 하나다', () => {
    expect(LANDMARK_SOUNDS).toEqual([{ regionId: 'key-marsh', midi: 69 }]);
  });

  it('소리는 마디 전체를 채우는 긴 음 하나이고, 서명 소리(0.7)보다 여리다. 다장조의 음이다', () => {
    for (const def of LANDMARK_SOUNDS) {
      const notes = landmarkNotes(def);
      expect(notes).toEqual([{ midi: def.midi, beat: 0, beats: BEATS_PER_BAR, velocity: 0.4 }]);
      expect(allNotes(notes)).toBe(true);
      expect(notes[0]!.velocity).toBeLessThan(0.7);
    }
  });
});

describe('광장 합주: 층이 오르면 합주가 달라진다(6-8 완료 기준의 도메인 쪽 근거)', () => {
  it('다른 지역의 층을 정하지 않으면 타악과 베이스는 비어 있고 맥박과 화음 깔기는 전과 같다', () => {
    for (const bar of BARS) {
      const b = plazaBar(bar, 2);
      expect(b.percussion).toEqual([]);
      expect(b.bass).toEqual([]);
      expect({ pulse: b.pulse, bed: b.bed }).toEqual({ pulse: plazaBar(bar, 2, { percussion: 3, bass: 3 }).pulse, bed: plazaBar(bar, 2, { percussion: 3, bass: 3 }).bed });
    }
  });

  it('박자 강가의 층이 한 층 오를 때마다 합주의 마디가 달라진다(타악이 더해진다)', () => {
    for (const bar of BARS) {
      const bars = LAYERS.map((layer) => plazaBar(bar, 0, { percussion: layer }));
      for (let i = 0; i + 1 < bars.length; i++) {
        expect(key(bars[i]!.percussion), `${bar}마디 ${i}층 → ${i + 1}층`).not.toBe(key(bars[i + 1]!.percussion));
        expect(bars[i + 1]!.percussion.length).toBeGreaterThan(bars[i]!.percussion.length);
      }
      expect(bars[0]!.bass).toEqual([]);
    }
  });

  it('종나무 숲의 층이 한 층 오를 때마다 합주의 마디가 달라진다(베이스가 더해진다)', () => {
    for (const bar of BARS) {
      const bars = LAYERS.map((layer) => plazaBar(bar, 0, { bass: layer }));
      for (let i = 0; i + 1 < bars.length; i++) {
        expect(key(bars[i]!.bass), `${bar}마디 ${i}층 → ${i + 1}층`).not.toBe(key(bars[i + 1]!.bass));
      }
      expect(bars[0]!.bass).toEqual([]);
      expect(bars[0]!.percussion).toEqual([]);
    }
  });

  it('성부마다 자기 지역의 층만 읽는다: 한 성부의 층이 다른 성부를 바꾸지 않는다', () => {
    for (const bar of BARS) {
      const base = plazaBar(bar, 1, { percussion: 1, bass: 1 });
      expect(plazaBar(bar, 1, { percussion: 3, bass: 1 }).bass).toEqual(base.bass);
      expect(plazaBar(bar, 1, { percussion: 3, bass: 1 }).bed).toEqual(base.bed);
      expect(plazaBar(bar, 1, { percussion: 1, bass: 3 }).percussion).toEqual(base.percussion);
      expect(plazaBar(bar, 1, { percussion: 1, bass: 3 }).pulse).toEqual(base.pulse);
      expect(plazaBar(bar, 3, { percussion: 1, bass: 1 }).percussion).toEqual(base.percussion);
    }
  });

  it('세계에서 저절로 나는 음은 전부 다장조이고 마디 안에서 끝난다(모든 마디, 세 지역의 모든 층)', () => {
    for (const bar of BARS) {
      for (const village of LAYERS) {
        for (const percussion of LAYERS) {
          for (const bass of LAYERS) {
            const b = plazaBar(bar, village, { percussion, bass });
            for (const part of [b.pulse, b.bed, b.percussion, b.bass]) {
              expect(allNotes(part)).toBe(true);
              expect(inBar(part)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('베이스의 근음은 그 마디 화음의 뿌리음 계열이다(광장 합주의 화음 진행을 따른다)', () => {
    const rootPc: Record<string, number> = { C: 0, F: 5, G: 7, Am: 9 };
    for (const bar of BARS) {
      const b = plazaBar(bar, 0, { bass: 1 });
      expect(pc(b.bass[0]!.midi)).toBe(rootPc[b.chord]);
      // 같은 마디의 화음 깔기가 있다면 그 화음의 음과 같은 으뜸 계열이다
      const bed = plazaBar(bar, 1).bed.map((n) => pc(n.midi));
      expect(bed).toContain(pc(CHORD_VOICING[b.chord][0]));
    }
  });
});

describe('지역의 바탕 소리(8.1 세계 바탕, 6.2)', () => {
  const OUTER = ['staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh'] as const;
  // 화음의 3음이 뿌리에서 몇 반음 위인가: C F G는 장3도(4), Am은 단3도(3)
  const THIRD = { C: 4, F: 4, G: 4, Am: 3 } as const;

  it('바탕 소리가 있는 지역은 마을 밖 다섯 지역이다(지역 차례). 마을에는 없다(광장 합주가 마을의 소리다)', () => {
    expect(REGION_BEDS.map((b) => b.regionId)).toEqual([...OUTER]);
    expect(REGION_IDS.filter((id) => !regionBedOf(id))).toEqual(['village']);
    for (const id of REGION_IDS) {
      const has = (OUTER as readonly string[]).includes(id);
      expect(regionBedOf(id) !== undefined, id).toBe(has);
      expect(regionBedBar(id, 0, 3) !== null, id).toBe(has);
    }
  });

  it('지역 파일의 ambientBedId와 맡은 성부가 정의와 같다', () => {
    for (const def of REGION_BEDS) {
      const region = map.region(def.regionId);
      expect(region.ambientBedId).toBe(def.bedId);
      expect(region.ensemblePart).toBe(def.part);
    }
    expect(REGION_BEDS.map((b) => [b.part, b.nature, b.voicing])).toEqual([
      ['melody', 'breeze', 'sus2'],
      ['percussion', 'river', 'open-fifth'],
      ['bass', 'wind', 'triad'],
      ['runner', 'grass', 'open-triad'],
      ['ornament', 'mist', 'low-fifth'],
    ]);
  });

  it('오선 언덕: 높고 맑게 열린 뿌리·2도·5도의 긴 화음과 산들바람, 층이 오르면 가락이 더해진다', () => {
    for (const bar of BARS) {
      const chord = PROGRESSION[bar]!;
      const bed = regionBedBar('staff-hill', bar, 0)!;
      expect(bed.chord.map((n) => n.midi)).toEqual([BASS_ROOT[chord] + 24, BASS_ROOT[chord] + 26, BASS_ROOT[chord] + 31]);
      expect(bed.chord.every((n) => n.beat === 0 && n.beats > 3.5)).toBe(true);
      expect(bed.nature).toEqual([{ midi: NATURE_CENTER_MIDI.breeze, beat: 0, beats: BEATS_PER_BAR, velocity: expect.any(Number) }]);
      expect(bed.part).toEqual([]);
      const layered = LAYERS.map((layer) => key(regionBedBar('staff-hill', bar, layer)!.part));
      expect(new Set(layered).size).toBe(4);
    }
  });

  it('박자 강가: 열린 5도의 긴 화음과 강의 물소리, 층이 오르면 타악이 더해진다', () => {
    for (const bar of BARS) {
      const chord = PROGRESSION[bar]!;
      const bed = regionBedBar('beat-river', bar, 0)!;
      expect(bed.chord.map((n) => n.midi)).toEqual([BASS_ROOT[chord] + 12, BASS_ROOT[chord] + 19]);
      expect(bed.chord.every((n) => n.beat === 0 && n.beats > 3.5)).toBe(true);
      expect(bed.nature).toEqual([{ midi: NATURE_CENTER_MIDI.river, beat: 0, beats: BEATS_PER_BAR, velocity: expect.any(Number) }]);
      expect(bed.part).toEqual([]);
      const layered = LAYERS.map((layer) => key(regionBedBar('beat-river', bar, layer)!.part));
      expect(new Set(layered).size).toBe(4);
    }
  });

  it('종나무 숲: 한 옥타브 위 3화음의 긴 화음과 바람 소리, 층이 오르면 베이스가 더해진다', () => {
    for (const bar of BARS) {
      const chord = PROGRESSION[bar]!;
      const bed = regionBedBar('bell-grove', bar, 0)!;
      expect(bed.chord.map((n) => n.midi)).toEqual(CHORD_VOICING[chord].map((m) => m + 12));
      expect(bed.nature[0]!.midi).toBe(NATURE_CENTER_MIDI.wind);
      expect(bed.part).toEqual([]);
      const layered = LAYERS.map((layer) => key(regionBedBar('bell-grove', bar, layer)!.part));
      expect(new Set(layered).size).toBe(4);
    }
  });

  it('음계 길: 넓게 벌린 3화음의 긴 화음과 풀 소리, 층이 오르면 달리는 음이 더해진다', () => {
    for (const bar of BARS) {
      const chord = PROGRESSION[bar]!;
      const bed = regionBedBar('scale-trail', bar, 0)!;
      expect(bed.chord.map((n) => n.midi)).toEqual([BASS_ROOT[chord] + 12, BASS_ROOT[chord] + 19, BASS_ROOT[chord] + 24 + THIRD[chord]]);
      expect(bed.nature[0]!.midi).toBe(NATURE_CENTER_MIDI.grass);
      expect(bed.part).toEqual([]);
    }
    // 달리는 음은 4마디와 8마디 끝에서 시작하므로 마디마다 달라지는 것은 아니다: 한 바퀴 전체로 네 층이 모두 다르다
    const loops = LAYERS.map((layer) => key(BARS.flatMap((bar) => regionBedBar('scale-trail', bar, layer)!.part)));
    expect(new Set(loops).size).toBe(4);
  });

  it('건반 늪: 낮은 5도의 긴 화음과 안개 소리, 층이 오르면 꾸밈음이 더해진다', () => {
    for (const bar of BARS) {
      const chord = PROGRESSION[bar]!;
      const bed = regionBedBar('key-marsh', bar, 0)!;
      expect(bed.chord.map((n) => n.midi)).toEqual([BASS_ROOT[chord], BASS_ROOT[chord] + 7]);
      expect(bed.nature[0]!.midi).toBe(NATURE_CENTER_MIDI.mist);
      expect(bed.part).toEqual([]);
    }
    const loops = LAYERS.map((layer) => key(BARS.flatMap((bar) => regionBedBar('key-marsh', bar, layer)!.part)));
    expect(new Set(loops).size).toBe(4);
  });

  it('긴 화음의 모양 다섯 가지는 어느 화음에서나 모두 다장조의 음이다', () => {
    for (const chord of ['C', 'F', 'G', 'Am'] as const) {
      for (const def of REGION_BEDS) {
        const midis = bedChordMidis(chord, def.voicing);
        expect(midis.length, `${chord} ${def.voicing}`).toBeGreaterThanOrEqual(2);
        for (const m of midis) expect(C_MAJOR.has(pc(m)), `${chord} ${def.voicing} ${m}`).toBe(true);
        // 낮은 5도(건반 늪)만 베이스 높이(G3 이하)에 있고, 나머지는 한 옥타브 이상 위에 있다
        expect(midis.every((m) => m <= 55), `${chord} ${def.voicing}`).toBe(def.voicing === 'low-fifth');
      }
    }
  });

  it('바탕은 층이 0이어도 있다. 층은 지역의 성부만 바꾸고 긴 화음과 자연음은 그대로다', () => {
    for (const id of OUTER) {
      for (const bar of BARS) {
        const zero = regionBedBar(id, bar, 0)!;
        expect(zero.chord.length).toBeGreaterThan(0);
        expect(zero.nature).toHaveLength(1);
        for (const layer of LAYERS) {
          const bed = regionBedBar(id, bar, layer)!;
          expect(bed.chord).toEqual(zero.chord);
          expect(bed.nature).toEqual(zero.nature);
        }
      }
    }
  });

  it('지역의 성부는 광장 합주의 같은 성부와 같은 음이다(박자 강가의 타악, 종나무 숲의 베이스: 그 지역에서 듣는 것과 광장에서 듣는 것이 한 성부다)', () => {
    for (const bar of BARS) {
      for (const layer of LAYERS) {
        expect(regionBedBar('beat-river', bar, layer)!.part).toEqual(plazaBar(bar, 0, { percussion: layer }).percussion);
        expect(regionBedBar('bell-grove', bar, layer)!.part).toEqual(plazaBar(bar, 0, { bass: layer }).bass);
      }
    }
  });

  it('새 세 지역의 성부는 그 성부의 함수가 내는 음 그대로다(광장 합주에 더하는 것은 7-5)', () => {
    for (const bar of BARS) {
      for (const layer of LAYERS) {
        expect(regionBedBar('staff-hill', bar, layer)!.part).toEqual(melodyNotes(bar, melodyStageOf(layer)));
        expect(regionBedBar('scale-trail', bar, layer)!.part).toEqual(runnerNotes(bar, runnerStageOf(layer)));
        expect(regionBedBar('key-marsh', bar, layer)!.part).toEqual(ornamentNotes(bar, ornamentStageOf(layer)));
        expect(regionPartNotes('melody', bar, layer)).toEqual(regionBedBar('staff-hill', bar, layer)!.part);
      }
    }
  });

  it('바탕의 모든 음(자연음의 거르는 높이 포함)은 다장조이고(꾸밈음의 앞꾸밈만 예외) 마디 안에서 끝난다. 화음은 마디마다 바뀐다', () => {
    for (const def of REGION_BEDS) {
      const chords = new Set<string>();
      for (const bar of BARS) {
        const bed = regionBedBar(def.regionId, bar, 3)!;
        for (const part of [bed.chord, bed.nature, bed.part]) {
          // 건반 늪의 꾸밈음은 반음 아래에서 들어오는 앞꾸밈이라 다장조 밖일 수 있고, 그때는 0.25박 뒤에 다장조 음으로 풀린다
          expect(part.every((n) => C_MAJOR.has(pc(n.midi)) || (def.part === 'ornament' && resolvedGrace(part, n))), `${def.regionId} ${bar}마디`).toBe(true);
          expect(inBar(part)).toBe(true);
        }
        chords.add(key(bed.chord));
      }
      expect(chords.size).toBe(4); // C F G Am 네 가지 화음
    }
  });

  it('바탕 소리는 광장 합주와 같은 진행이라 8마디 되풀이 뒤에 같은 마디가 된다', () => {
    for (const def of REGION_BEDS) {
      expect(regionBedBar(def.regionId, 3, 2)).toEqual(regionBedBar(def.regionId, 3 + LOOP_BARS, 2));
      expect(regionBedBar(def.regionId, -1, 2)).toEqual(regionBedBar(def.regionId, LOOP_BARS - 1, 2));
      expect(barInLoop(-1)).toBe(LOOP_BARS - 1);
    }
  });
});
