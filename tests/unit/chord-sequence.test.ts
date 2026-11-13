// 6-7 확장 X-3 화음 사건 목록 판정기(chordSequence): Q21 세 기둥과 Q23 화음 이어 걷기의 판정을 화면 없이 확인한다.
// 화음 하나를 보는 일은 triadMembership이 그대로 한다. 이 판정기가 새로 아는 것은 '몇 번째 화음이 어느 나무의 종들인가'뿐이다.
// 설계서 12.9의 6-7 완료 기준(가로 순서만 바꾸면 전위가 그대로다)의 판정기 쪽 근거: 입력에는 가로 위치도 걸은 시간도 없다(W-3).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVALUATOR_TYPES, EVALUATOR_VERSION, evaluate } from '@/domain/evaluators';
import { evaluateChordEvent, evaluateChordSequence, triadSpecOfEvent } from '@/domain/evaluators/chordSequence';
import type { ChordEventResult, ChordSequenceInput, ChordSequenceSpec } from '@/domain/evaluators/chordSequence';
import { evaluateTriadMembership } from '@/domain/evaluators/triadMembership';
import { renderAll } from '@/domain/feedback';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const spec = (questId: string, variantId: string): ChordSequenceSpec => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${questId}.json`), 'utf-8')).variants[variantId].evaluatorSpec as ChordSequenceSpec;
const PILLARS = spec('chord.primary-triads', 'c-major-pillars');
const WALK = spec('chord.progression-walk', 'c-major-walk');

/** 나무마다 걸린 음 이름 목록으로 판정기 입력을 만든다. 칸 이름은 나무 안의 순서(tone-0, tone-1, …)다 */
const trees = (...sets: string[][]): ChordSequenceInput => ({ type: 'chordSequence', trees: sets.map((names) => names.map((n, i) => ({ slotId: `tone-${i}`, pitch: p(n) }))) });
const RIGHT = trees(['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']);
const events = (input: ChordSequenceInput, s: ChordSequenceSpec): ChordEventResult[] => (evaluateChordSequence(s, input).details!['events'] as ChordEventResult[]);

describe('Q21 다장조의 세 기둥: 나무 셋에 으뜸·버금딸림·딸림화음', () => {
  it('설계서 5.5의 사건: 으뜸 C E G, 버금딸림 F A C, 딸림 G B D를 나무 셋에 건다', () => {
    expect(PILLARS.trees).toBe(3);
    expect(PILLARS.events.map((e) => [e.label, e.tree, e.requiredPitchClasses])).toEqual([
      ['으뜸화음 나무', 0, [0, 4, 7]],
      ['버금딸림화음 나무', 1, [5, 9, 0]],
      ['딸림화음 나무', 2, [7, 11, 2]],
    ]);
    // 전위는 알려 주지 않는다: reportTones가 있는 것은 Q23뿐이다
    expect(PILLARS.events.some((e) => e.reportTones)).toBe(false);
  });

  it('세 화음을 제 나무에 걸면 통과한다', () => {
    const r = evaluate(PILLARS, RIGHT);
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.evaluator).toBe('chordSequence');
    expect(events(RIGHT, PILLARS).map((e) => [e.label, e.passed])).toEqual([['으뜸화음 나무', true], ['버금딸림화음 나무', true], ['딸림화음 나무', true]]);
  });

  it('옥타브가 달라도, 종을 거는 칸의 순서가 달라도 같은 음급이면 통과한다', () => {
    const shuffled = trees(['G5', 'C4', 'E6'], ['C3', 'F5', 'A2'], ['D4', 'G4', 'B3']);
    expect(evaluate(PILLARS, shuffled).passed).toBe(true);
  });

  it('화음을 엉뚱한 나무에 걸면 어느 나무가 틀렸는지 알려 준다', () => {
    // 으뜸화음과 딸림화음의 나무가 서로 바뀌었다
    const swapped = trees(['G4', 'B4', 'D5'], ['F4', 'A4', 'C5'], ['C4', 'E4', 'G4']);
    const r = evaluate(PILLARS, swapped);
    expect(r.passed).toBe(false);
    const where = new Set(r.issues.map((i) => i.params['where']));
    expect(where).toEqual(new Set(['으뜸화음 나무', '딸림화음 나무']));
    expect(events(swapped, PILLARS).map((e) => e.passed)).toEqual([false, true, false]);
  });

  it('빠진 음은 그 나무의 이름과 함께 알려 준다("버금딸림화음 나무: A가 빠졌어요.")', () => {
    const r = evaluate(PILLARS, trees(['C4', 'E4', 'G4'], ['F4', 'C5'], ['G4', 'B4', 'D5']));
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => [i.code, i.params['where']])).toEqual([['MISSING_TONE', '버금딸림화음 나무']]);
    expect(renderAll(r.issues)).toEqual(['버금딸림화음 나무: A가 빠졌어요.']);
  });

  it('더해진 음과 겹친 음도 나무의 이름과 함께 알려 준다', () => {
    const extra = evaluate(PILLARS, trees(['C4', 'E4', 'G4', 'D4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']));
    expect(renderAll(extra.issues)).toEqual(['으뜸화음 나무: D가 더해져 있어요. 이 화음의 구성음이 아니에요.']);
    const doubled = evaluate(PILLARS, trees(['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5', 'G5']));
    expect(renderAll(doubled.issues)).toEqual(['딸림화음 나무: G를 겹쳐 놓았어요. 이 도전에서는 같은 음을 겹치지 않아요.']);
  });

  it('표기가 다르면 같은 소리여도 통과하지 않는다: 나무의 이름이 "어디"로 들어간다', () => {
    // 으뜸화음 나무의 3음 E를 같은 소리의 다른 이름 F♭으로 건다
    const r = evaluate(PILLARS, trees(['C4', 'Fb4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']));
    expect(r.passed).toBe(false);
    expect(renderAll(r.issues)).toEqual(['으뜸화음 나무: 소리 높이는 같지만 이름이 달라요. 지금은 F♭, 목표는 E예요.']);
  });

  it('아무것도 걸지 않은 나무는 개수를 알려 준다. 나무 목록이 모자라도 멈추지 않는다', () => {
    const r = evaluate(PILLARS, trees(['C4', 'E4', 'G4']));
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => [i.code, i.params['where']])).toEqual([['NOTE_COUNT', '버금딸림화음 나무'], ['NOTE_COUNT', '딸림화음 나무']]);
    expect(renderAll(r.issues)[0]).toBe('버금딸림화음 나무: 음이 0개예요. 이 도전은 3개를 놓아요.');
  });
});

describe('Q23 화음 이어 걷기: 으뜸 → 버금딸림 → 딸림 → 으뜸', () => {
  it('설계서 5.5의 사건: 처음과 끝이 같은 나무(0)이고, 모든 화음이 전위를 알려 준다', () => {
    expect(WALK.trees).toBe(3);
    expect(WALK.events.map((e) => [e.label, e.tree])).toEqual([['처음 으뜸화음', 0], ['버금딸림화음', 1], ['딸림화음', 2], ['마지막 으뜸화음', 0]]);
    for (const e of WALK.events) expect(e.reportTones, e.label).toHaveLength(3);
    // 처음과 끝은 같은 조건이다(같은 나무가 두 번 나온다)
    expect(triadSpecOfEvent(WALK.events[0]!)).toEqual(triadSpecOfEvent(WALK.events[3]!));
  });

  it('세 화음을 걸면 통과하고, 처음과 끝의 으뜸화음은 같은 나무라 둘 다 통과한다', () => {
    const r = evaluate(WALK, RIGHT);
    expect(r.passed).toBe(true);
    expect(events(RIGHT, WALK).map((e) => [e.label, e.tree, e.passed])).toEqual([['처음 으뜸화음', 0, true], ['버금딸림화음', 1, true], ['딸림화음', 2, true], ['마지막 으뜸화음', 0, true]]);
  });

  it('으뜸화음 나무가 틀리면 문제는 한 번만 말한다(처음 으뜸화음), 끝의 으뜸화음도 통과하지 않은 것으로 나온다', () => {
    const r = evaluate(WALK, trees(['C4', 'E4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']));
    expect(r.passed).toBe(false);
    expect(r.issues.map((i) => [i.code, i.params['where']])).toEqual([['MISSING_TONE', '처음 으뜸화음']]);
    expect(renderAll(r.issues)).toEqual(['처음 으뜸화음: G가 빠졌어요.']);
    expect(events(trees(['C4', 'E4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']), WALK).map((e) => e.passed)).toEqual([false, true, true, false]);
  });

  it('전위는 판정하지 않고 알려 주기만 한다: 제1전위여도 통과하고, 가장 낮은 음을 알려 준다', () => {
    // 으뜸화음 나무에 E3 G4 C5(제1전위), 딸림화음 나무에 D3 G4 B4(제2전위), 버금딸림화음은 기본 위치
    const input = trees(['E3', 'G4', 'C5'], ['F4', 'A4', 'C5'], ['D3', 'G4', 'B4']);
    const r = evaluate(WALK, input);
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    const list = events(input, WALK);
    expect(list.map((e) => [e.label, e.inversion, e.bassMidi])).toEqual([
      ['처음 으뜸화음', 'first', 52],
      ['버금딸림화음', 'root', 65],
      ['딸림화음', 'second', 50],
      ['마지막 으뜸화음', 'first', 52],
    ]);
  });

  it('구성음이 다 있지 않으면 전위는 알 수 없다(null)', () => {
    const input = trees(['E3', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']);
    const list = events(input, WALK);
    expect(list[0]).toMatchObject({ passed: false, inversion: null, bassMidi: 52 });
  });

  it('종을 하나도 걸지 않은 나무의 전위는 null이고 바닥음도 없다', () => {
    const list = events(trees([], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']), WALK);
    expect(list[0]).toMatchObject({ passed: false, inversion: null, bassMidi: null });
  });
});

describe('판정기의 성질(W-3, 순수 함수)', () => {
  it('판정기 목록에 있고 판정 버전은 그대로다(기존 판정 규칙을 바꾸지 않았다)', () => {
    expect(EVALUATOR_TYPES).toContain('chordSequence');
    expect(EVALUATOR_VERSION).toBe('1.0.0');
    expect(evaluateChordSequence(PILLARS, RIGHT).evaluatorVersion).toBe(EVALUATOR_VERSION);
  });

  it('입력을 바꾸지 않고, 같은 입력에는 같은 결과를 낸다', () => {
    const before = JSON.stringify(RIGHT);
    const a = JSON.stringify(evaluate(WALK, RIGHT));
    const b = JSON.stringify(evaluate(WALK, RIGHT));
    expect(a).toBe(b);
    expect(JSON.stringify(RIGHT)).toBe(before);
  });

  it('종의 순서(가로 위치)를 어떻게 섞어도 결과가 같다: 순열 전부', () => {
    const base = ['C4', 'E4', 'G4'];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const results = perms.map((perm) => JSON.stringify(evaluate(WALK, trees(perm.map((i) => base[i]!), ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']))));
    expect(new Set(results).size).toBe(1);
  });

  it('화음 하나의 판정은 triadMembership 판정기의 판정과 같다(조건만 사건에서 옮긴다)', () => {
    const e = WALK.events[1]!;
    const notes = [p('F4'), p('A4'), p('D5')].map((pitch, i) => ({ slotId: `tone-${i}`, pitch }));
    const viaEvent = evaluateChordEvent(e, notes).evaluation;
    const direct = evaluateTriadMembership(triadSpecOfEvent(e), { type: 'triadMembership', notes });
    expect(viaEvent).toEqual(direct);
    expect(viaEvent.passed).toBe(false);
  });

  it('where는 문제마다 따로 붙는다: 한 나무의 문제가 다른 나무의 문장을 바꾸지 않는다', () => {
    const r = evaluate(PILLARS, trees(['C4', 'E4'], ['F4', 'A4'], ['G4', 'B4', 'D5']));
    expect(renderAll(r.issues)).toEqual(['으뜸화음 나무: G가 빠졌어요.', '버금딸림화음 나무: C가 빠졌어요.']);
  });
});
