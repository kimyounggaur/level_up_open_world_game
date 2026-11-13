// 7-5 광장 합주의 대표 조합 12가지와 자동 점검(설계서 11.5, 12.10): 12가지는 실제 과제 통과로 만들 수 있는 상태이고, 모두 점검을 통과한다.
// 겹쳐 들었을 때 거슬리는 곳이 없는지를 귀로 듣는 점검(D-4)은 사람의 몫이다. 여기서는 악보에서 셀 수 있는 것만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import {
  C_MAJOR_PITCH_CLASSES,
  CHORD_PITCH_CLASSES,
  ENSEMBLE_COMBOS,
  SHARP_INTERVALS,
  analyzeEnsemble,
  ensembleLoop,
  ensembleProblems,
  ensembleReport,
} from '@/domain/ensemblecheck';
import type { EnsembleNote } from '@/domain/ensemblecheck';
import { MUSICIAN_NAME_KO, MUSICIAN_ORDER, festivalParts } from '@/domain/festival';
import { computeReaction } from '@/domain/reaction';
import { REGION_IDS, WorldMap, parseRegion } from '@/domain/world';
import type { EnsembleLayers } from '@/domain/worldsound';
import { BAR_SEC, BEAT_SEC, BEATS_PER_BAR, ENSEMBLE_LAYER_KEYS, ENSEMBLE_LAYER_REGION, LOOP_BARS, PROGRESSION, WORLD_BPM, ensembleLayersOf } from '@/domain/worldsound';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'content', 'regions');
const map = new WorldMap(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => parseRegion(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).region!));

let n = 0;
const pass = (questId: string): AttemptResult =>
  makeAttemptResult({
    attemptId: `e${++n}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);

const level = (l: EnsembleLayers): number => l.village + l.melody + l.percussion + l.bass + l.runner + l.ornament;
const at = (id: string) => ENSEMBLE_COMBOS.find((c) => c.id === id)!;

describe('대표 조합 12가지: 실제 과제 통과로 만들 수 있다', () => {
  it('열두 가지이고, 이름과 번호와 층이 서로 다르다', () => {
    expect(ENSEMBLE_COMBOS).toHaveLength(12);
    expect(new Set(ENSEMBLE_COMBOS.map((c) => c.id)).size).toBe(12);
    expect(new Set(ENSEMBLE_COMBOS.map((c) => c.name)).size).toBe(12);
    expect(new Set(ENSEMBLE_COMBOS.map((c) => JSON.stringify(c.layers))).size).toBe(12);
    for (const c of ENSEMBLE_COMBOS) {
      expect(c.why.length, c.id).toBeGreaterThan(10);
      for (const key of ENSEMBLE_LAYER_KEYS) {
        expect(Number.isInteger(c.layers[key]), `${c.id} ${key}`).toBe(true);
        expect(c.layers[key], `${c.id} ${key}`).toBeGreaterThanOrEqual(0);
        expect(c.layers[key], `${c.id} ${key}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('조합마다 그 과제들을 통과하면 세계 반응의 지역 층이 정확히 그 층이 된다(과제 id는 모두 정거장에 놓인 과제다)', () => {
    const placed = new Set(REGION_IDS.flatMap((id) => [...map.questIdsInRegion(id)]));
    for (const c of ENSEMBLE_COMBOS) {
      for (const q of c.quests) expect(placed.has(q), `${c.id}의 과제 ${q}`).toBe(true);
      expect(new Set(c.quests).size, `${c.id}의 과제가 겹치지 않는다`).toBe(c.quests.length);
      const reaction = computeReaction(map, c.quests.map(pass));
      const got = ensembleLayersOf((id) => reaction.regionLayers[id]);
      expect(got, `${c.id} ${c.name}`).toEqual(c.layers);
    }
  });

  it('성부와 지역이 맞는다: 마을은 화음, 오선 언덕은 가락, 박자 강가는 타악, 종나무 숲은 베이스, 음계 길은 달리는 음, 건반 늪은 꾸밈음(6.2 표)', () => {
    expect(ENSEMBLE_LAYER_REGION).toEqual({ village: 'village', melody: 'staff-hill', percussion: 'beat-river', bass: 'bell-grove', runner: 'scale-trail', ornament: 'key-marsh' });
    for (const id of REGION_IDS.filter((r) => r !== 'village')) expect(map.region(id).ensemblePart, id).toBe(Object.entries(ENSEMBLE_LAYER_REGION).find(([, r]) => r === id)![0]);
  });

  it('12가지가 고르게 퍼져 있다: 층이 0인 처음과 18인 완성이 들어 있고, 성부마다 가장 빽빽한 모습(3층)이 적어도 한 번 있고, 한 성부만 3층인 조합이 성부마다 있다', () => {
    const levels = ENSEMBLE_COMBOS.map((c) => level(c.layers));
    expect(Math.min(...levels)).toBe(0);
    expect(Math.max(...levels)).toBe(18);
    for (const key of ENSEMBLE_LAYER_KEYS) {
      expect(ENSEMBLE_COMBOS.some((c) => c.layers[key] === 3), `${key} 3층`).toBe(true);
    }
    // 한 성부만 3층이고 나머지는 0층인 조합: 마을을 뺀 다섯 성부마다 하나씩(마을만 3층인 조합은 마을 과제가 지역을 함께 올려서 만들 수 없다)
    for (const key of ENSEMBLE_LAYER_KEYS.filter((k) => k !== 'village')) {
      const solo = ENSEMBLE_COMBOS.filter((c) => c.layers[key] === 3 && ENSEMBLE_LAYER_KEYS.every((k) => k === key || c.layers[k] === 0));
      expect(solo, `${key}만 3층`).toHaveLength(1);
    }
  });
});

describe('대표 조합 12가지의 합주: 악사와 소리', () => {
  it('울리는 성부(악사가 서는 차례)가 조합마다 이 표대로다', () => {
    const expected: Record<string, string[]> = {
      'c01-start': ['pulse'],
      'c02-first-quest': ['pulse', 'bed', 'melody'],
      'c03-melody': ['pulse', 'melody'],
      'c04-percussion': ['pulse', 'percussion'],
      'c05-bass': ['pulse', 'bass'],
      'c06-runner': ['pulse', 'runner'],
      'c07-ornament': ['pulse', 'ornament'],
      'c08-high-three': ['pulse', 'melody', 'runner', 'ornament'],
      'c09-low-three': ['pulse', 'percussion', 'bass', 'bed'],
      'c10-ones': [...MUSICIAN_ORDER],
      'c11-twos': [...MUSICIAN_ORDER],
      'c12-full': [...MUSICIAN_ORDER],
    };
    for (const c of ENSEMBLE_COMBOS) {
      expect(ensembleReport(c.layers).parts, c.id).toEqual(expected[c.id]);
      expect(festivalParts(c.layers), c.id).toEqual(expected[c.id]);
      for (const p of expected[c.id]!) expect(MUSICIAN_NAME_KO[p as keyof typeof MUSICIAN_NAME_KO], p).toBeTruthy();
    }
  });

  it('보고서의 층 합과 8마디의 음 수가 합주의 음(plazaBar)과 같다', () => {
    for (const c of ENSEMBLE_COMBOS) {
      const r = ensembleReport(c.layers);
      const loop = ensembleLoop(c.layers);
      expect(r.level, c.id).toBe(level(c.layers));
      expect(Object.values(r.notes).reduce((a, b) => a + b, 0), c.id).toBe(loop.length);
      // 맥박은 층이 0이어도 4박 × 8마디 = 32음
      expect(r.notes.pulse, c.id).toBe(32);
    }
  });

  it('성부마다 음높이의 범위가 있고, 높은 쪽 성부(가락, 달리는 음, 꾸밈음)는 C4 위에, 맥박은 C2~A2에 있다', () => {
    const full = ensembleReport(at('c12-full').layers);
    expect(full.registers.pulse).toEqual([36, 45]);
    expect(full.registers.bed![0]).toBeGreaterThanOrEqual(48);
    expect(full.registers.bass![1]).toBeLessThanOrEqual(55);
    expect(full.registers.melody![0]).toBeGreaterThanOrEqual(60);
    expect(full.registers.runner).toEqual([72, 84]);
    expect(full.registers.ornament![0]).toBeGreaterThanOrEqual(75);
    expect(full.registers.percussion).toBeUndefined();
  });
});

describe('자동 점검: 대표 조합 12가지 모두 통과한다', () => {
  it('조합마다 점검의 문제가 없다(다장조, 마디 안, 센 박, 꾸밈음, 달리는 음과 꾸밈음)', () => {
    for (const c of ENSEMBLE_COMBOS) expect(ensembleProblems(ensembleReport(c.layers)), `${c.id} ${c.name}`).toEqual([]);
  });

  it('다장조 밖의 음은 꾸밈음의 앞꾸밈뿐이다: 모두 반음 위의 화음 구성음으로 가고, 앞꾸밈은 일곱 개가 아니라 2마디마다 하나씩 층만큼 있다', () => {
    const counts: Record<string, number> = {};
    for (const c of ENSEMBLE_COMBOS) {
      const r = ensembleReport(c.layers);
      expect(r.outsideKey.every((x) => x.part === 'ornament'), c.id).toBe(true);
      expect(r.graceNotResolved, c.id).toBe(0);
      counts[c.id] = r.outsideKey.length;
    }
    // 꾸밈음 1층 8마디에 하나, 2층 둘, 3층 넷(6.2 표)
    expect(counts['c07-ornament']).toBe(4);
    expect(counts['c10-ones']).toBe(1);
    expect(counts['c11-twos']).toBe(2);
    expect(counts['c12-full']).toBe(4);
    expect(counts['c01-start']).toBe(0);
    expect(counts['c03-melody']).toBe(0);
  });

  it('첫 박과 셋째 박에는 날카로운 간격(단2도, 장7도, 단9도)으로 부딪히는 소리가 없다', () => {
    expect([...SHARP_INTERVALS].sort((a, b) => a - b)).toEqual([1, 11, 13]);
    for (const c of ENSEMBLE_COMBOS) expect(ensembleReport(c.layers).strongBeatRubs, c.id).toBe(0);
  });

  it('꾸밈음의 앞꾸밈은 다른 성부의 음과 반음이나 단9도로 부딪히지 않는다', () => {
    for (const c of ENSEMBLE_COMBOS) expect(ensembleReport(c.layers).graceRubs, c.id).toBe(0);
  });

  it('달리는 음과 꾸밈음은 같은 마디에 함께 없다(꾸밈음은 짝수째 마디, 달리는 음은 홀수째 마디)', () => {
    for (const c of ENSEMBLE_COMBOS) expect(ensembleReport(c.layers).runnerAndOrnamentSameBar, c.id).toBe(0);
    const full = ensembleLoop(at('c12-full').layers);
    const ornamentBars = [...new Set(full.filter((x) => x.part === 'ornament').map((x) => x.bar))].sort();
    const runnerBars = [...new Set(full.filter((x) => x.part === 'runner').map((x) => x.bar))].sort();
    expect(ornamentBars).toEqual([0, 2, 4, 6]);
    expect(runnerBars).toEqual([1, 3, 5, 7]);
  });

  it('꾸밈음의 앞꾸밈이 가는 곳은 그 마디 화음의 구성음이다(마디 1 C: G, 마디 3 G: G, 마디 5 Am: A, 마디 7 G: G)', () => {
    const full = ensembleLoop(at('c12-full').layers).filter((x) => x.part === 'ornament');
    const targets = full.filter((x) => C_MAJOR_PITCH_CLASSES.has(x.midi % 12));
    expect(targets.map((x) => [x.bar, x.midi])).toEqual([[0, 79], [2, 79], [4, 81], [6, 79]]);
    for (const t of targets) expect(CHORD_PITCH_CLASSES[PROGRESSION[t.bar]!], `마디 ${t.bar + 1}`).toContain(t.midi % 12);
    const graces = full.filter((x) => !C_MAJOR_PITCH_CLASSES.has(x.midi % 12));
    expect(graces.map((x) => [x.bar, x.midi])).toEqual([[0, 78], [2, 78], [4, 80], [6, 78]]);
    // 앞꾸밈은 target보다 반음 아래이고 0.25박 앞이다
    graces.forEach((g, i) => {
      expect(targets[i]!.midi).toBe(g.midi + 1);
      expect(targets[i]!.beat).toBeCloseTo(g.beat + g.beats, 9);
    });
  });

  it('층이 오르면 꾸밈음은 앞 층의 자리를 그대로 두고 더해진다(1층 마디 7 ⊂ 2층 마디 3, 7 ⊂ 3층 마디 1, 3, 5, 7)', () => {
    const barsOf = (o: number): number[] => [...new Set(ensembleLoop({ village: 0, melody: 0, percussion: 0, bass: 0, runner: 0, ornament: o }).filter((x) => x.part === 'ornament').map((x) => x.bar))].sort();
    expect(barsOf(0)).toEqual([]);
    expect(barsOf(1)).toEqual([6]);
    expect(barsOf(2)).toEqual([2, 6]);
    expect(barsOf(3)).toEqual([0, 2, 4, 6]);
  });
});

describe('설계서 11.5: 다장조와 4분음표 80을 지킨다', () => {
  it('세계 시계는 4분음표 80, 4/4이고 한 마디가 3초, 8마디가 24초다', () => {
    expect(WORLD_BPM).toBe(80);
    expect(BEAT_SEC).toBeCloseTo(0.75, 12);
    expect(BEATS_PER_BAR).toBe(4);
    expect(BAR_SEC).toBeCloseTo(3, 12);
    expect(LOOP_BARS * BAR_SEC).toBeCloseTo(24, 12);
  });

  it('합주의 화음 진행은 다장조 안의 화음(C, F, G, Am)이고 으뜸화음 C에서 시작해 C로 끝난다', () => {
    expect(PROGRESSION).toEqual(['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C']);
    for (const chord of PROGRESSION) for (const pc of CHORD_PITCH_CLASSES[chord]) expect(C_MAJOR_PITCH_CLASSES.has(pc), chord).toBe(true);
    expect([PROGRESSION[0], PROGRESSION[LOOP_BARS - 1]]).toEqual(['C', 'C']);
  });

  it('모든 음은 16분음표 격자(0.25박 = 0.1875초) 위에서 시작하고, 길이도 격자의 정수배이거나 마디 끝 직전(0.1박)에서 끝난다. 대표 조합 12가지 모두에서 그렇다', () => {
    for (const c of ENSEMBLE_COMBOS) {
      for (const note of ensembleLoop(c.layers)) {
        const slots = note.beat / 0.25;
        expect(Math.abs(slots - Math.round(slots)), `${c.id} 마디 ${note.bar + 1} ${note.part} ${note.midi}의 시작 ${note.beat}박`).toBeLessThan(1e-9);
        expect(note.beat).toBeGreaterThanOrEqual(0);
        expect(note.beat + note.beats).toBeLessThanOrEqual(BEATS_PER_BAR + 1e-9);
      }
    }
  });

  it('마디마다 화음의 으뜸음(뿌리)이 베이스나 맥박의 낮은 음에 있다: 맥박의 첫 음은 그 마디 화음의 뿌리다', () => {
    const roots: Record<string, number> = { C: 0, F: 5, G: 7, Am: 9 };
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const first = ensembleLoop({ village: 0, melody: 0, percussion: 0, bass: 0, runner: 0, ornament: 0 }).filter((x) => x.bar === bar && x.part === 'pulse').sort((a, b) => a.beat - b.beat)[0]!;
      expect(first.midi % 12, `마디 ${bar + 1} ${PROGRESSION[bar]}`).toBe(roots[PROGRESSION[bar]!]);
    }
  });
});

describe('자동 점검: 층의 모든 조합(0–3의 여섯 자리, 4096가지)에서도 같은 성질이 지켜진다', () => {
  it('어떤 층 조합이든 센 박에 날카로운 부딪힘이 없고, 꾸밈음의 앞꾸밈이 부딪히지 않고, 점검의 문제가 없다', () => {
    const levels = [0, 1, 2, 3];
    let checked = 0;
    for (const village of levels) for (const melody of levels) for (const percussion of levels) for (const bass of levels) for (const runner of levels) for (const ornament of levels) {
      const layers: EnsembleLayers = { village, melody, percussion, bass, runner, ornament };
      const problems = ensembleProblems(ensembleReport(layers));
      if (problems.length > 0) throw new Error(`${JSON.stringify(layers)}: ${problems.join(' / ')}`);
      checked++;
    }
    expect(checked).toBe(4096);
  });
});

describe('자동 점검이 정말 잡는지(점검 자체의 시험)', () => {
  const NONE: EnsembleLayers = { village: 0, melody: 0, percussion: 0, bass: 0, runner: 0, ornament: 0 };
  const note = (part: EnsembleNote['part'], midi: number, beat: number, beats: number, bar = 0): EnsembleNote => ({ part, bar, midi, beat, beats, velocity: 0.5 });
  const run = (notes: EnsembleNote[]) => analyzeEnsemble(notes, NONE);

  it('아무 문제 없는 음은 문제가 없다', () => {
    const r = run([note('bed', 60, 0, 3.9), note('melody', 64, 0, 0.9), note('melody', 67, 1, 0.9)]);
    expect(ensembleProblems(r)).toEqual([]);
    expect([r.strongBeatRubs, r.attackRubs, r.passingRubs, r.graceRubs]).toEqual([0, 0, 0, 0]);
  });

  it('첫 박에 단2도로 같이 시작하면 센 박의 부딪힘으로 센다. 장7도와 단9도도 센다. 장2도와 3도는 세지 않는다(소리는 모두 다장조 안의 음)', () => {
    // 미(64)와 파(65), 시(71)와 도(72)는 다장조 안의 단2도다. 도(60)와 시(71)는 장7도, 미(64)와 파(77)는 단9도다
    expect(run([note('bed', 64, 0, 0.9), note('melody', 65, 0, 0.9)]).strongBeatRubs).toBe(1);
    expect(run([note('bed', 60, 2, 0.9), note('melody', 71, 2, 0.9)]).strongBeatRubs).toBe(1);
    expect(run([note('bed', 64, 0, 0.9), note('melody', 77, 0, 0.9)]).strongBeatRubs).toBe(1);
    expect(run([note('bed', 60, 0, 0.9), note('melody', 62, 0, 0.9)]).strongBeatRubs).toBe(0);
    expect(run([note('bed', 60, 0, 0.9), note('melody', 64, 0, 0.9)]).strongBeatRubs).toBe(0);
    const r = run([note('bed', 64, 0, 0.9), note('melody', 65, 0, 0.9)]);
    expect(ensembleProblems(r)).toHaveLength(1);
    expect(ensembleProblems(r)[0]).toContain('첫 박이나 셋째 박');
  });

  it('센 박이 아닌 곳에서는 같이 시작하면 시작-시작으로, 하나가 울리는 중에 다른 하나가 시작하면 지나가는 부딪힘으로 센다', () => {
    const both = run([note('bed', 60, 1, 0.9), note('melody', 61, 1, 0.9)]);
    expect([both.strongBeatRubs, both.attackRubs, both.passingRubs]).toEqual([0, 1, 0]);
    // 약박 하나에서 한 소리가 울리는 중에 다른 소리가 짧게 시작한다
    const passing = run([note('bed', 60, 0.5, 1.4), note('runner', 61, 1, 0.2)]);
    expect([passing.strongBeatRubs, passing.attackRubs, passing.passingRubs]).toEqual([0, 0, 1]);
  });

  it('같은 성부의 두 음과 타악은 세지 않는다(소리 높이를 따지는 것은 서로 다른 소리 높이 성부끼리다)', () => {
    expect(run([note('melody', 60, 0, 0.9), note('melody', 61, 0, 0.9)]).strongBeatRubs).toBe(0);
    expect(run([note('bed', 60, 0, 0.9), note('percussion', 61, 0, 0.9)]).strongBeatRubs).toBe(0);
  });

  it('꾸밈음의 앞꾸밈이 시작할 때 다른 성부와 반음으로 부딪히면 센다. 앞꾸밈이 반음 위의 화음 구성음으로 가지 않으면 잡는다', () => {
    // C 화음 마디: 가락 E5(76)가 울리는 중에 D♯5(75)가 시작하고 E5로 간다
    const rub = run([note('melody', 76, 2, 0.9), note('ornament', 75, 2.75, 0.25), note('ornament', 76, 3, 0.8)]);
    expect(rub.graceRubs).toBe(1);
    expect(rub.graceNotResolved).toBe(0);
    expect(ensembleProblems(rub).join(' ')).toContain('꾸밈음의 앞꾸밈이 다른 성부와');
    // 앞꾸밈만 있고 가는 곳이 없다
    expect(run([note('ornament', 78, 2.75, 0.25)]).graceNotResolved).toBe(1);
    // 가는 곳이 그 마디 화음의 구성음이 아니다(C 화음 마디에서 A로 간다)
    expect(run([note('ornament', 80, 2.75, 0.25), note('ornament', 81, 3, 0.8)]).graceNotResolved).toBe(1);
    // 바르게 쓴 앞꾸밈(C 화음 마디, F♯ → G)은 문제가 없다
    const ok = run([note('ornament', 78, 2.75, 0.25), note('ornament', 79, 3, 0.8)]);
    expect([ok.graceNotResolved, ok.graceRubs, ensembleProblems(ok).length]).toEqual([0, 0, 0]);
  });

  it('다장조 밖의 음을 꾸밈음이 아닌 성부가 내면 잡는다. 마디 밖으로 넘어가는 음도 잡는다', () => {
    expect(ensembleProblems(run([note('melody', 61, 1, 0.9)]))[0]).toContain('다장조 밖의 음이 꾸밈음 말고도');
    expect(ensembleProblems(run([note('bed', 60, 3.5, 1)]))[0]).toContain('마디 밖');
    expect(run([note('bed', 60, -0.5, 1)]).outsideBar).toBe(1);
  });

  it('달리는 음과 꾸밈음이 한 마디에 함께 있으면 잡는다. 다른 마디면 잡지 않는다', () => {
    const same = run([note('runner', 72, 2, 0.2, 1), note('ornament', 78, 2.75, 0.25, 1), note('ornament', 79, 3, 0.8, 1)]);
    expect(same.runnerAndOrnamentSameBar).toBe(1);
    expect(ensembleProblems(same).join(' ')).toContain('달리는 음과 꾸밈음이 함께');
    const apart = run([note('runner', 72, 2, 0.2, 1), note('ornament', 78, 2.75, 0.25, 2), note('ornament', 79, 3, 0.8, 2)]);
    expect(apart.runnerAndOrnamentSameBar).toBe(0);
  });

  it('겹친 정도(한꺼번에 울리는 음의 수와 세기의 합)를 잰다. 타악은 음의 수에서 뺀다', () => {
    const r = run([note('bed', 60, 0, 1), note('bed', 64, 0, 1), note('melody', 72, 0, 1), note('percussion', 84, 0, 0.12)]);
    expect(r.maxSimultaneous).toBe(3);
    expect(r.peakVelocity).toBeCloseTo(2, 9);
  });
});
