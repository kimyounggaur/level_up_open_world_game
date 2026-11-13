// 6-7 종 하나를 거는 일의 계산(bells.ts: bellHangResult, bellShiftResult, bellClearResult, bellOctavesOf, defaultRingOctave, freeBellFrameOf)과
// 종탑의 옥타브 옮기기(slotplan의 toneOctaveResult). 월드의 작업대와 판(패널)이 같은 계산을 쓰므로 문장과 편집을 여기서 한 번에 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '@/domain/challenge';
import { bellClearResult, bellHangResult, bellMapOf, bellOctavesOf, bellShiftResult, bellStatesOf, defaultRingOctave, freeBellFrameOf } from '@/domain/bells';
import type { BellMap } from '@/domain/bells';
import type { QuestDefinition, QuestVariant } from '@/domain/content';
import { parseInstallation } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { writtenOf } from '@/domain/pitch';
import { ChallengeSession } from '@/domain/session';
import { toneOctaveResult } from '@/domain/slotplan';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const inst = (id: string): InstallationDef => {
  const { installation, issues } = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', `${id}.json`), 'utf-8')), `${id}.json`);
  expect(issues).toEqual([]);
  return installation!;
};
const q05 = quest('chord.major-triad');
const q06 = quest('chord.inversion');
const variantOf = (q: QuestDefinition, id: string): QuestVariant => q.variants[id]!;
const v05 = variantOf(q05, 'c-major');
const v06 = variantOf(q06, 'c-first');

const open = (q: QuestDefinition, variantId: string): ChallengeSession => {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  return s;
};
const withRange = (v: QuestVariant, range: string): QuestVariant => ({ ...v, challengeDescriptor: { ...v.challengeDescriptor, range } });
const mapOf = (octaves: number[]): BellMap => ({ kind: 'bellTree', form: 'tree', trees: 1, columns: 4, octaves });

describe('bellOctavesOf: 판본의 음역 안에서 종을 걸 수 있는 옥타브', () => {
  it('판본이 정한 음역이 그대로 옥타브 목록이 된다(작은 것부터)', () => {
    expect(bellOctavesOf(v05)).toEqual([4, 5]);
    expect(bellOctavesOf(v06)).toEqual([2, 3, 4, 5]);
    expect(bellOctavesOf(variantOf(quest('chord.primary-triads'), 'c-major-pillars'))).toEqual([4, 5]);
    expect(bellOctavesOf(withRange(v05, 'C3-B3'))).toEqual([3]);
  });
});

describe('bellHangResult: 종 칸에 음을 건다', () => {
  it('빈 칸에는 걸고, 걸린 칸에는 바꾼다. 편집은 setSlot이고 문장은 칸의 이름과 음의 이름을 말한다', () => {
    const s = open(q05, 'c-major');
    const first = bellHangResult(v05, s.content(), 0, '종 1', writtenOf(p('C4')));
    expect(first).toEqual({ ok: true, edit: { type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('C4')) }, text: '종 1: C4로 걸었어요.' });
    if (first.ok && first.edit) s.apply(first.edit);
    expect(bellStatesOf(v05, s.content()).map((b) => b.name)).toEqual(['C4']);
    const changed = bellHangResult(v05, s.content(), 0, '종 1', writtenOf(p('E5')));
    expect(changed).toEqual({ ok: true, edit: { type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('E5')) }, text: '종 1: E5로 바꿨어요.' });
  });

  it('변화표가 붙은 음은 변화표를 이름에 담는다', () => {
    const s = open(q05, 'c-major');
    const r = bellHangResult(v05, s.content(), 1, '종 2', { letter: 'E', accidental: 'flat', octave: 4 });
    expect(r.ok && r.text).toBe('종 2: E♭4로 걸었어요.');
  });

  it('이미 같은 음이 걸려 있으면 편집 없이 문장만 돌려준다(되돌리기 기록을 늘리지 않는다)', () => {
    const s = open(q05, 'c-major');
    const r0 = bellHangResult(v05, s.content(), 2, '종 3', writtenOf(p('G4')));
    if (r0.ok && r0.edit) s.apply(r0.edit);
    const again = bellHangResult(v05, s.content(), 2, '종 3', writtenOf(p('G4')));
    expect(again).toEqual({ ok: true, edit: null, text: '종 3: 이미 G4예요.' });
  });

  it('조사는 음이름을 읽는 소리의 끝에 맞춘다: 3옥타브(삼)는 "으로"와 "이에요", 4옥타브(사)는 "로"와 "예요"다', () => {
    const wide = withRange(v05, 'C2-B5');
    const s = open(q05, 'c-major');
    expect(bellHangResult(wide, s.content(), 0, '종 1', writtenOf(p('C3')))).toMatchObject({ ok: true, text: '종 1: C3으로 걸었어요.' });
    expect(bellHangResult(wide, s.content(), 0, '종 1', writtenOf(p('C2')))).toMatchObject({ ok: true, text: '종 1: C2로 걸었어요.' });
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('D3')) });
    expect(bellHangResult(wide, s.content(), 0, '종 1', writtenOf(p('E3')))).toMatchObject({ ok: true, text: '종 1: E3으로 바꿨어요.' });
    expect(bellHangResult(wide, s.content(), 0, '종 1', writtenOf(p('D3')))).toMatchObject({ ok: true, edit: null, text: '종 1: 이미 D3이에요.' });
    expect(bellHangResult(wide, s.content(), 0, '종 1', { letter: 'D', accidental: 'sharp', octave: 3 })).toMatchObject({ text: '종 1: D♯3으로 바꿨어요.' });
  });

  it('음역 밖의 옥타브는 걸 수 없다: 이유와 음역을 말한다', () => {
    const s = open(q05, 'c-major');
    expect(bellHangResult(v05, s.content(), 0, '종 1', writtenOf(p('C3')))).toEqual({ ok: false, text: '종 1: 3옥타브는 이 도전의 음역 밖이에요. 음역은 C4부터 B5까지예요.' });
    expect(bellHangResult(v05, s.content(), 0, '종 1', writtenOf(p('C6')))).toEqual({ ok: false, text: '종 1: 6옥타브는 이 도전의 음역 밖이에요. 음역은 C4부터 B5까지예요.' });
  });

  it('나무가 여럿인 판본의 칸 이름을 그대로 문장에 쓴다', () => {
    const v21 = variantOf(quest('chord.primary-triads'), 'c-major-pillars');
    const s = open(quest('chord.primary-triads'), 'c-major-pillars');
    const r = bellHangResult(v21, s.content(), 4, '둘째 나무의 1번째 종', writtenOf(p('F4')));
    expect(r).toMatchObject({ ok: true, edit: { type: 'setSlot', slot: 4 }, text: '둘째 나무의 1번째 종: F4로 걸었어요.' });
  });
});

describe('bellShiftResult: 걸린 종의 높이를 한 단 올리고 내린다', () => {
  const hung = (name: string): ChallengeSession => {
    const s = open(q05, 'c-major');
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: writtenOf(p(name)) });
    return s;
  };

  it('걸린 종이 없으면 먼저 걸라고 알린다', () => {
    expect(bellShiftResult(v05, open(q05, 'c-major').content(), 0, '종 1', 1)).toEqual({ ok: false, text: '종 1: 걸린 종이 없어요. 먼저 종을 걸어 주세요.' });
  });

  it('올리면 한 옥타브 위, 내리면 한 옥타브 아래다. 음이름과 변화표는 그대로다', () => {
    const up = bellShiftResult(v05, hung('E4').content(), 0, '종 1', 1);
    expect(up).toEqual({ ok: true, edit: { type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('E5')) }, text: '종 1: E5로 올렸어요.' });
    const down = bellShiftResult(v05, hung('E5').content(), 0, '종 1', -1);
    expect(down).toEqual({ ok: true, edit: { type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('E4')) }, text: '종 1: E4로 내렸어요.' });
    const flat = hung('E4');
    flat.apply({ type: 'setSlot', slot: 0, writtenPitch: { letter: 'E', accidental: 'flat', octave: 4 } });
    expect(bellShiftResult(v05, flat.content(), 0, '종 1', 1)).toMatchObject({ ok: true, text: '종 1: E♭5로 올렸어요.' });
  });

  it('음역의 끝에서는 멈추고 음역을 말한다', () => {
    expect(bellShiftResult(v05, hung('C5').content(), 0, '종 1', 1)).toEqual({ ok: false, text: '종 1: 더 높이 올릴 수 없어요. 이 도전의 음역은 C4부터 B5까지예요.' });
    expect(bellShiftResult(v05, hung('C4').content(), 0, '종 1', -1)).toEqual({ ok: false, text: '종 1: 더 낮게 내릴 수 없어요. 이 도전의 음역은 C4부터 B5까지예요.' });
  });
});

describe('bellClearResult: 종 칸을 비운다(나무의 종을 뺀다)', () => {
  it('걸린 종은 빼고, 이미 비어 있으면 편집 없이 문장만 돌려준다', () => {
    const s = open(q05, 'c-major');
    expect(bellClearResult(s.content(), 1, '종 2')).toEqual({ ok: true, edit: null, text: '종 2는 이미 비어 있어요.' });
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: writtenOf(p('E4')) });
    const r = bellClearResult(s.content(), 1, '종 2');
    expect(r).toEqual({ ok: true, edit: { type: 'setSlot', slot: 1, writtenPitch: null }, text: '종 2를 뺐어요.' });
    if (r.ok && r.edit) s.apply(r.edit);
    expect(bellStatesOf(v05, s.content())).toEqual([]);
  });

  it('다른 칸의 종은 건드리지 않는다', () => {
    const s = open(q05, 'c-major');
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: writtenOf(p('C4')) });
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: writtenOf(p('E4')) });
    const r = bellClearResult(s.content(), 0, '종 1');
    if (r.ok && r.edit) s.apply(r.edit);
    expect(bellStatesOf(v05, s.content()).map((b) => [b.draft, b.name])).toEqual([[1, 'E4']]);
  });
});

describe('defaultRingOctave: 종이 없는 열을 고를 때 걸 가지가 처음 놓이는 단', () => {
  it('음역 안의 단 가운데 4옥타브에 가장 가까운 단이다', () => {
    expect(defaultRingOctave(mapOf([5, 4, 3, 2]), v05)).toBe(4); // C4-B5
    expect(defaultRingOctave(mapOf([5, 4, 3, 2]), v06)).toBe(4); // C2-B5
    expect(defaultRingOctave(mapOf([5, 4, 3, 2]), withRange(v05, 'C2-B3'))).toBe(3);
    expect(defaultRingOctave(mapOf([5, 4, 3, 2]), withRange(v05, 'C5-B5'))).toBe(5);
  });

  it('같은 거리면 낮은 단이다(3과 5)', () => {
    expect(defaultRingOctave(mapOf([5, 3]), withRange(v05, 'C3-B5'))).toBe(3);
  });

  it('음역과 가지가 하나도 겹치지 않으면 가지 전체에서 고른다(걸 곳이 없다는 이유는 걸 때 알린다)', () => {
    expect(defaultRingOctave(mapOf([5, 4, 3, 2]), withRange(v05, 'C7-B7'))).toBe(4);
  });
});

describe('freeBellFrameOf: 자유로 놀기의 틀', () => {
  const quests: Record<string, QuestDefinition> = Object.fromEntries(['chord.major-triad', 'chord.inversion', 'chord.primary-triads', 'chord.major-and-minor'].map((id) => [id, quest(id)]));
  const lookup = (questId: string, variantId: string): QuestVariant | undefined => quests[questId]?.variants[variantId];

  it('설치물이 다루는 첫 과제의 첫 판본에서 가져오되 음역만 가지 전체로 넓힌다', () => {
    const w1 = inst('inst.bell-grove.three-bells');
    const frame = freeBellFrameOf(w1, lookup)!;
    expect(frame.challengeDescriptor.range).toBe('C2-B5');
    const base = variantOf(quest('chord.major-triad'), w1.quests[0]!.variantIds[0]!);
    expect({ ...frame, challengeDescriptor: base.challengeDescriptor }).toEqual(base);
    expect({ ...frame.challengeDescriptor, range: base.challengeDescriptor.range }).toEqual(base.challengeDescriptor);
    expect(bellOctavesOf(frame)).toEqual([2, 3, 4, 5]);
  });

  it('종탑과 빈터도 같다: 종탑은 전위 판본의 틀, 빈터는 사건 목록 판본의 틀이다', () => {
    const tower = freeBellFrameOf(inst('inst.bell-grove.bell-tower'), lookup)!;
    expect(tower.evaluatorSpec.type).toBe('inversion');
    expect(tower.challengeDescriptor.range).toBe('C2-B5');
    const glade = freeBellFrameOf(inst('inst.bell-grove.three-pillars'), lookup)!;
    expect(glade.evaluatorSpec.type).toBe('chordSequence');
    expect(glade.challengeDescriptor.range).toBe('C2-B5');
  });

  it('종나무가 아니거나 판본을 찾지 못하면 null이다', () => {
    expect(freeBellFrameOf(inst('inst.village.scale-stones'), lookup)).toBeNull();
    expect(freeBellFrameOf(inst('inst.bell-grove.three-bells'), () => undefined)).toBeNull();
    expect(bellMapOf(inst('inst.village.scale-stones'))).toBeNull();
  });
});

describe('toneOctaveResult(종탑): 종의 옥타브를 정한 단으로 옮긴다', () => {
  it('정한 단으로 옮기고 가장 낮은 음을 문장으로 알린다. 옮긴 결과는 전위 판정에 반영된다', () => {
    const s = open(q06, 'c-first');
    const r = toneOctaveResult(v06, s.content(), 0, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('종 1: C4로 올렸어요.');
    expect(r.text).toContain('가장 낮은 음은 E3');
    s.apply(r.edit);
    expect(evaluateDraft(v06, s.content()).passed).toBe(true);
    const back = toneOctaveResult(v06, s.content(), 0, 3);
    expect(back.ok && back.text).toContain('종 1: C3으로 내렸어요.');
  });

  it('이미 그 단이면 이유만 알린다', () => {
    const s = open(q06, 'c-first');
    expect(toneOctaveResult(v06, s.content(), 0, 3)).toEqual({ ok: false, text: '종 1: 이미 C3이에요.' });
  });

  it('음역 밖의 단과 없는 종은 이유만 알린다', () => {
    const s = open(q06, 'c-first');
    expect(toneOctaveResult(v06, s.content(), 0, 6)).toEqual({ ok: false, text: '종 1: 6옥타브는 이 도전의 음역 밖이에요. 음역은 C2부터 B5까지예요.' });
    expect(toneOctaveResult(v06, s.content(), 0, 1)).toEqual({ ok: false, text: '종 1: 1옥타브는 이 도전의 음역 밖이에요. 음역은 C2부터 B5까지예요.' });
    expect(toneOctaveResult(v06, s.content(), 7, 4)).toEqual({ ok: false, text: '종 8은 없어요.' });
  });
});
