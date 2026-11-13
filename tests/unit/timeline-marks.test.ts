// 5-1 판정이 알려 준 자리를 시간선 조각으로 옮기는 계산(marksOf)과 박 칸(beatCellsOf). 화면 없이 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { ChallengeSession } from '@/domain/session';
import { beatCellsOf, blocksOf, placeOnTimeline, timelineOf } from '@/domain/timeline';
import type { TimelineAt, TimelineMaterial } from '@/domain/timeline';
import { errorEventIdsOf, marksOf, windowsWithMarks } from '@/ui/timeline/marks';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const q02 = quest('rhythm.rest-in-a-bar');
const q03 = quest('rhythm.short-notes-and-triplets');
const q08 = quest('song.short-piece');
const v03 = q03.variants['thirty-seconds-triplet']!;
const spec = timelineOf(v03);

const at = (tick: number): TimelineAt => ({ voiceId: 'v1', measureIndex: 0, tick });
const note = (name: string, value: 'thirtySecond' | 'eighth'): TimelineMaterial => ({ kind: 'note', pitch: p(name), value });
const raft = (name: string): TimelineMaterial => ({ kind: 'tuplet', tuplet: spec.tuplets[0]!, stone: { kind: 'note', pitch: p(name) } });

function session(): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(q03.questId, 'thirty-seconds-triplet');
  return s;
}
function put(s: ChallengeSession, where: TimelineAt, material: TimelineMaterial): void {
  const r = placeOnTimeline(spec, s.content(), where, material);
  if (!r.ok) throw new Error(r.text);
  s.apply(r.edit);
}
function marksFor(s: ChallengeSession) {
  const content = s.content();
  const evaluation = evaluateDraft(v03, content);
  const blocks = blocksOf(spec, content, 'v1', 0, 0, spec.measureTicks);
  return { evaluation, blocks, marks: marksOf(evaluation.issues, blocks, { measureIndex: 0, voiceId: 'v1' }) };
}
const keyAt = (blocks: ReturnType<typeof blocksOf>, tick: number): string => blocks.find((b) => b.fullStart <= tick && tick < b.fullEnd)!.key;

describe('marksOf: 판정이 알려 준 자리를 조각에 옮긴다', () => {
  it('돌 하나의 음만 틀리면 그 돌에만 표시한다(묶음 전체가 아니다)', () => {
    const s = session();
    for (let i = 0; i < 8; i++) put(s, at(i * 120), note('C4', 'thirtySecond'));
    put(s, at(960), raft('D4'));
    put(s, at(1280), note('G4', 'eighth')); // 목표는 E4 (돌의 음만 바뀐다)
    put(s, at(1600), note('F4', 'eighth'));
    put(s, at(1920), { kind: 'rest', value: 'half' });
    const { evaluation, blocks, marks } = marksFor(s);
    expect(evaluation.passed).toBe(false);
    expect([...marks.errorKeys]).toEqual([keyAt(blocks, 1280)]);
    expect(marks.remainKeys.size).toBe(0);
  });

  it('묶음이 틀렸다는 문제(길이)는 묶음의 모든 돌에 표시한다', () => {
    const s = session();
    for (let i = 0; i < 8; i++) put(s, at(i * 120), note('C4', 'thirtySecond'));
    const letters = ['D', 'E', 'F'] as const;
    s.apply({
      type: 'batch',
      edits: [
        ...[0, 1, 2].map((i) => ({
          type: 'addEvent' as const,
          event: { eventId: `x${i}`, type: 'note' as const, voiceId: 'v1', staffId: 's1', measureIndex: 0, onsetTicks: 960 + i * 480, durationTicks: 480, writtenPitch: { letter: letters[i]!, accidental: null, octave: 4 }, groupId: 'gx' },
        })),
        { type: 'setTuplets', tuplets: [{ groupId: 'gx', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['x0', 'x1', 'x2'] }] },
      ],
    });
    const { evaluation, blocks, marks } = marksFor(s);
    expect(evaluation.issues.map((i) => i.code)).toContain('TUPLET_DURATION');
    for (const id of ['x0', 'x1', 'x2']) expect(marks.errorKeys.has(id)).toBe(true);
    // 묶음이 걸친 박 창은 2박(창 번호 1)과 3박(창 번호 2). 남은 구간까지 치면 4박(창 번호 3)의 빈 칸도 걸린다
    expect([...windowsWithMarks(spec, blocks, { errorKeys: marks.errorKeys, remainKeys: new Set() })].sort()).toEqual([1, 2]);
    expect([...windowsWithMarks(spec, blocks, marks)].sort()).toEqual([1, 2, 3]);
  });

  it('마디가 덜 채워졌다는 문제는 빈 조각을 남은 구간으로 강조하고, 그 박 창에 표시를 건다', () => {
    const s = session();
    for (let i = 0; i < 8; i++) put(s, at(i * 120), note('C4', 'thirtySecond'));
    put(s, at(960), raft('D4'));
    put(s, at(1280), note('E4', 'eighth'));
    put(s, at(1600), note('F4', 'eighth'));
    const { blocks, marks } = marksFor(s);
    const empties = blocks.filter((b) => b.kind === 'empty');
    expect(empties.length).toBeGreaterThan(0);
    expect(empties.every((b) => marks.remainKeys.has(b.key))).toBe(true);
    // 3박과 4박의 빈 구간이 걸린다. 1박과 2박은 걸리지 않는다
    expect([...windowsWithMarks(spec, blocks, marks)].sort()).toEqual([2, 3]);
  });

  it('다른 성부와 다른 마디의 문제는 가져오지 않는다. 시작 틱이 없는 문제는 조각을 고르지 못한다', () => {
    const s = session();
    put(s, at(0), note('C4', 'thirtySecond'));
    const blocks = blocksOf(spec, s.content(), 'v1', 0, 0, spec.measureTicks);
    const issues = [
      { code: 'PITCH_MISMATCH', params: {}, target: { voiceId: 'v2', measureIndex: 0, onsetTicks: 0 } },
      { code: 'PITCH_MISMATCH', params: {}, target: { measureIndex: 1, onsetTicks: 0 } },
      { code: 'MISSING_VOICE', params: {}, target: { voiceId: 'v1' } },
    ] as never;
    const marks = marksOf(issues, blocks, { measureIndex: 0, voiceId: 'v1' });
    expect(marks.errorKeys.size).toBe(0);
    expect(marks.remainKeys.size).toBe(0);
  });

  it('판정이 없으면(확인하기 전) 표시도 없다', () => {
    const s = session();
    put(s, at(0), note('C4', 'thirtySecond'));
    const blocks = blocksOf(spec, s.content(), 'v1', 0, 0, spec.measureTicks);
    const marks = marksOf([], blocks, { measureIndex: 0 });
    expect(marks.errorKeys.size).toBe(0);
    expect(windowsWithMarks(spec, blocks, marks).size).toBe(0);
    expect(errorEventIdsOf(blocks, marks)).toEqual({});
  });

  it('errorEventIdsOf는 틀린 조각의 사건 id만 모은다(빈 조각에는 사건이 없다)', () => {
    const s = session();
    for (let i = 0; i < 8; i++) put(s, at(i * 120), note('C4', 'thirtySecond'));
    put(s, at(960), raft('D4'));
    put(s, at(1280), note('G4', 'eighth'));
    put(s, at(1600), note('F4', 'eighth'));
    const { blocks, marks } = marksFor(s);
    const ids = errorEventIdsOf(blocks, marks);
    expect(Object.keys(ids)).toEqual(['u-v1-m0-1280']);
    expect(ids['u-v1-m0-1280']).toBe('error');
  });
});

describe('beatCellsOf: 시간선 과제에서 고르는 박 칸', () => {
  it('Q03은 박 네 개(960틱씩)이고 이름은 1박부터 4박이다', () => {
    const cells = beatCellsOf(v03);
    expect(cells.map((c) => [c.cellId, c.cellIndex, c.onsetTicks, c.durationTicks, c.label])).toEqual([
      ['m0c0', 0, 0, 960, '1박'],
      ['m0c1', 1, 960, 960, '2박'],
      ['m0c2', 2, 1920, 960, '3박'],
      ['m0c3', 3, 2880, 960, '4박'],
    ]);
  });

  it('Q08은 네 마디의 박 열여섯 개이고 마디 이름이 붙는다', () => {
    const cells = beatCellsOf(q08.variants['two-voices']!);
    expect(cells).toHaveLength(16);
    expect(cells[0]!.label).toBe('1마디 1박');
    expect(cells[15]!.label).toBe('4마디 4박');
    expect(cells[5]).toMatchObject({ measureIndex: 1, cellIndex: 1, onsetTicks: 960 });
  });

  it('박 하나가 한 칸인 Q02에는 쓰지 않는다(그쪽은 gridCellsOf)', () => {
    expect(() => beatCellsOf(q02.variants['quarter-rest']!)).not.toThrow();
    expect(beatCellsOf(q02.variants['quarter-rest']!)).toHaveLength(4);
  });
});

describe('TimelineBlock.groupSize: 연음 묶음의 돌 수', () => {
  it('묶음의 조각만 groupSize를 가진다', () => {
    const s = session();
    put(s, at(0), note('C4', 'thirtySecond'));
    put(s, at(960), raft('D4'));
    const blocks = blocksOf(spec, s.content(), 'v1', 0, 0, spec.measureTicks);
    expect(blocks.filter((b) => b.groupSize === 3)).toHaveLength(3);
    expect(blocks.filter((b) => b.groupSize === undefined && b.groupId === undefined).length).toBeGreaterThan(1);
    expect(blocks.every((b) => (b.groupId === undefined) === (b.groupSize === undefined))).toBe(true);
  });
});
