import { describe, expect, it } from 'vitest';
import { measureCountOf, resolveScore, validateScore, notesOf } from '@/domain/score';
import type { NoteEvent, Score } from '@/domain/score';
import { baseScore, note, rest } from './helpers';

const midis = (s: Score): number[] => notesOf(resolveScore(s)).map((e) => (e as NoteEvent).resolvedPitch!.midi);

describe('1-4 ScoreResolver: 조표와 임시표', () => {
  it('G장조의 F 예시: 66, 65, 65, 다음 마디 66', () => {
    const score = baseScore({
      staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }],
      events: [
        note('a', 0, 0, 960, 'F4'), // 조표 F♯
        note('b', 0, 960, 960, 'F4', { accidental: 'natural' }), // 제자리표
        note('c', 0, 1920, 960, 'F4'), // 같은 마디: 제자리표가 이어진다
        note('d', 1, 0, 960, 'F4'), // 다음 마디: 조표로 돌아간다
      ],
    });
    expect(midis(score)).toEqual([66, 65, 65, 66]);
  });

  it('임시표는 같은 옥타브에만 이어진다', () => {
    const score = baseScore({
      staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }],
      events: [note('a', 0, 0, 960, 'F4', { accidental: 'natural' }), note('b', 0, 960, 960, 'F5')],
    });
    expect(midis(score)).toEqual([65, 78]);
  });

  it('임시표의 기억은 보표마다 따로다', () => {
    const score = baseScore({
      staves: [
        { staffId: 's1', clef: 'treble', keySignature: 1 },
        { staffId: 's2', clef: 'bass', keySignature: 1 },
      ],
      voices: [
        { voiceId: 'v1', staffId: 's1' },
        { voiceId: 'v2', staffId: 's2' },
      ],
      events: [
        note('a', 0, 0, 960, 'F4', { accidental: 'natural' }),
        note('b', 0, 960, 960, 'F4', { voice: 'v2', staff: 's2' }),
      ],
    });
    const r = resolveScore(score);
    expect((r.events.find((e) => e.eventId === 'b') as NoteEvent).resolvedPitch!.midi).toBe(66);
  });

  it('B♭장조(내림표 둘): B와 E가 반음 내려간다', () => {
    const score = baseScore({
      staves: [{ staffId: 's1', clef: 'treble', keySignature: -2 }],
      events: [note('a', 0, 0, 960, 'B4'), note('b', 0, 960, 960, 'E4'), note('c', 0, 1920, 960, 'A4')],
    });
    expect(midis(score)).toEqual([70, 63, 69]);
  });

  it('임시표가 조표를 바꾸면 같은 마디의 다음 음도 따른다(올림표)', () => {
    const score = baseScore({
      events: [note('a', 0, 0, 960, 'C4', { accidental: 'sharp' }), note('b', 0, 960, 960, 'C4'), note('c', 1, 0, 960, 'C4')],
    });
    expect(midis(score)).toEqual([61, 61, 60]);
  });

  it('해석은 원본을 바꾸지 않는다', () => {
    const score = baseScore({ events: [note('a', 0, 0, 960, 'C4')] });
    const before = JSON.stringify(score);
    resolveScore(score);
    expect(JSON.stringify(score)).toBe(before);
  });

  it('겹올림과 겹내림', () => {
    const score = baseScore({ events: [note('a', 0, 0, 960, 'F4', { accidental: 'doubleSharp' }), note('b', 1, 0, 960, 'B4', { accidental: 'doubleFlat' })] });
    expect(midis(score)).toEqual([67, 69]);
  });

  it('없는 보표를 가리키는 사건은 오류를 낸다', () => {
    const score = baseScore({ events: [note('a', 0, 0, 960, 'C4', { staff: 'sX' })] });
    expect(() => resolveScore(score)).toThrow(/보표/);
  });
});

describe('악보 검사', () => {
  const good = (): Score =>
    baseScore({
      events: [
        note('n1', 0, 0, 960, 'C4'),
        rest('r1', 0, 960, 960),
        note('n2', 0, 1920, 960, 'D4'),
        note('n3', 0, 2880, 960, 'E4'),
      ],
    });
  const codes = (s: Score, o = {}): string[] => validateScore(s, o).map((i) => i.code);

  it('올바른 한 마디는 문제가 없다', () => {
    expect(codes(good(), { requireFullMeasures: true })).toEqual([]);
    expect(measureCountOf(good())).toBe(1);
  });

  it('마디가 꽉 차지 않으면 목표 악보로 쓸 수 없다', () => {
    const s = good();
    s.events[3] = note('n3', 0, 2880, 480, 'E4');
    expect(codes(s, { requireFullMeasures: true })).toContain('MEASURE_NOT_FULL');
    expect(codes(s)).not.toContain('MEASURE_NOT_FULL'); // 사용자의 초안은 덜 찬 마디를 허용한다
  });

  it('마디를 넘는 사건과 겹침을 찾는다', () => {
    const s = good();
    s.events.push(note('x', 0, 2400, 960, 'G4')); // 같은 시작·같은 길이면 화음으로 보지만, 어긋나게 시작하면 겹침이다
    expect(codes(s)).toContain('OVERLAP');
    const s2 = good();
    s2.events[3] = note('n3', 0, 2880, 1920, 'E4');
    expect(codes(s2)).toContain('CROSS_BARLINE');
  });

  it('PPQ·조율·기준 옥타브가 다르면 알려 준다', () => {
    const s = good() as unknown as Record<string, unknown>;
    s.PPQ = 480;
    s.tuning = '31TET';
    s.octaveConvention = 'C3=MIDI60';
    expect(codes(s as unknown as Score)).toEqual(expect.arrayContaining(['PPQ', 'TUNING', 'OCTAVE']));
  });

  it('보표와 성부, 사건 id의 참조를 확인한다', () => {
    const s = good();
    s.events[0] = note('n1', 0, 0, 960, 'C4', { voice: 'vX' });
    expect(codes(s)).toContain('EVENT_VOICE');
    const dup = good();
    dup.events.push(note('n1', 1, 0, 960, 'C4'));
    expect(codes(dup)).toContain('DUP_EVENT');
  });

  it('셋잇단은 개수와 길이를 확인한다', () => {
    const tri = (dur: number): Score =>
      baseScore({
        events: [
          note('t1', 0, 0, dur, 'D4', { groupId: 'g1' }),
          note('t2', 0, dur, dur, 'E4', { groupId: 'g1' }),
          note('t3', 0, dur * 2, dur, 'F4', { groupId: 'g1' }),
        ],
        tuplets: [{ groupId: 'g1', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['t1', 't2', 't3'] }],
      });
    expect(codes(tri(320))).toEqual([]);
    expect(codes(tri(480))).toContain('TUPLET_DURATION'); // 표시만 셋잇단인 480틱 음 세 개
  });

  it('resolvedPitch의 MIDI가 해석 결과와 다르면 목표 악보를 거부한다', () => {
    const s = baseScore({ events: [{ ...note('a', 0, 0, 3840, 'C4'), resolvedPitch: { letter: 'C', alter: 0, octave: 4, midi: 61 } }] });
    expect(codes(s, { requireResolved: true })).toContain('RESOLVED_MISMATCH');
    const ok = baseScore({ events: [{ ...note('a', 0, 0, 3840, 'C4'), resolvedPitch: { letter: 'C', alter: 0, octave: 4, midi: 60 } }] });
    expect(codes(ok, { requireResolved: true })).toEqual([]);
  });
});
