// 악보 → 재생 음 목록. 소리가 악보와 판정에 쓰인 해석과 같은지 확인한다(G2-3).
import { describe, expect, it } from 'vitest';
import { beatRange, measureRange, scoreToPlayback, slowTempoFor } from '@/domain/playback';
import type { Score } from '@/domain/score';
import q01 from '../../content/quests/pitch.same-note-two-clefs.json';
import q02 from '../../content/quests/rhythm.rest-in-a-bar.json';
import q07 from '../../content/quests/scale.major.json';
import { baseScore, note, rest } from './helpers';

const answerOf = (quest: { variants: Record<string, { score: unknown }> }, variant: string): Score => quest.variants[variant]!.score as Score;

describe('악보를 재생 내용으로 바꾸기', () => {
  it('Q02 정답: 4분음표, 4분쉼표, 4분음표, 4분음표 → 음 셋과 쉼이 만드는 빈 박', () => {
    const pb = scoreToPlayback(answerOf(q02, 'quarter-rest'));
    expect(pb.notes.map((n) => [n.id, n.midi, n.onsetTick, n.durationTick])).toEqual([
      ['n1', 60, 0, 960],
      ['n2', 62, 1920, 960],
      ['n3', 64, 2880, 960],
    ]);
    expect(pb.lengthTicks).toBe(3840);
    expect(pb.tempoBpm).toBe(80);
    expect(pb.tempoReference).toBe('quarter');
  });

  it('Q01 정답: 두 보표에 온음표 C4. 둘 다 MIDI 60이다(같은 음)', () => {
    const pb = scoreToPlayback(answerOf(q01, 'middle-c'));
    expect(pb.notes.map((n) => [n.midi, n.onsetTick, n.durationTick])).toEqual([
      [60, 0, 3840],
      [60, 0, 3840],
    ]);
    expect(pb.lengthTicks).toBe(3840);
  });

  it('성부를 골라 재생할 수 있다(높은음자리표 쪽만)', () => {
    const pb = scoreToPlayback(answerOf(q01, 'middle-c'), { voiceIds: ['v1'] });
    expect(pb.notes).toHaveLength(1);
  });

  it('Q07 정답의 소리: 설계서 5.8의 MIDI 값과 같다', () => {
    const expected: Record<string, number[]> = {
      'c-major': [60, 62, 64, 65, 67, 69, 71, 72],
      'f-major': [65, 67, 69, 70, 72, 74, 76, 77],
      'g-major': [67, 69, 71, 72, 74, 76, 78, 79],
      'd-major': [62, 64, 66, 67, 69, 71, 73, 74],
      'bflat-major': [58, 60, 62, 63, 65, 67, 69, 70],
    };
    for (const [variant, midis] of Object.entries(expected)) {
      expect(scoreToPlayback(answerOf(q07, variant)).notes.map((n) => n.midi)).toEqual(midis);
    }
  });

  it('조표가 있으면 조표를 적용한 소리가 난다. 같은 마디의 임시표는 이어지고 다음 마디에서 조표로 돌아간다(G장조의 F)', () => {
    const score: Score = baseScore({
      staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }],
      events: [
        note('a', 0, 0, 960, 'F4', { accidental: null }), // 조표의 F♯
        note('b', 0, 960, 960, 'F4', { accidental: 'natural' }), // F♮
        note('c', 0, 1920, 960, 'F4', { accidental: null }), // 임시표가 이어진다: F♮
        rest('r1', 0, 2880, 960),
        note('d', 1, 0, 960, 'F4', { accidental: null }), // 다음 마디: 다시 F♯
      ],
    });
    // helpers의 note()는 음이름에서 변화를 뽑으므로 F4의 written accidental을 직접 확인한다.
    const pb = scoreToPlayback(score);
    expect(pb.notes.map((n) => n.midi)).toEqual([66, 65, 65, 66]);
    expect(pb.notes[3]!.onsetTick).toBe(3840); // 다음 마디의 시작
    expect(pb.lengthTicks).toBe(2 * 3840);
  });

  it('템포를 덮어쓸 수 있다', () => {
    expect(scoreToPlayback(answerOf(q02, 'quarter-rest'), { tempoBpm: 50 }).tempoBpm).toBe(50);
  });

  it('셋잇단음은 실제 길이(320)로 재생된다', () => {
    const score: Score = baseScore({
      events: [
        note('t1', 0, 0, 320, 'C4', { groupId: 'g' }),
        note('t2', 0, 320, 320, 'D4', { groupId: 'g' }),
        note('t3', 0, 640, 320, 'E4', { groupId: 'g' }),
        rest('r', 0, 960, 2880),
      ],
      tuplets: [{ groupId: 'g', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['t1', 't2', 't3'] }],
    });
    expect(scoreToPlayback(score).notes.map((n) => [n.onsetTick, n.durationTick])).toEqual([[0, 320], [320, 320], [640, 320]]);
  });

  it('빈 악보도 한 마디 길이를 가진다', () => {
    expect(scoreToPlayback(baseScore()).lengthTicks).toBe(3840);
  });
});

describe('박과 마디의 구간', () => {
  it('4/4의 둘째 박은 960–1920이다. 둘째 마디면 마디 길이만큼 밀린다', () => {
    expect(beatRange('4/4', 0, 1)).toEqual({ startTick: 960, endTick: 1920 });
    expect(beatRange('4/4', 1, 1)).toEqual({ startTick: 3840 + 960, endTick: 3840 + 1920 });
  });

  it('6/8은 점4분음표가 한 박이다(박이 둘)', () => {
    expect(beatRange('6/8', 0, 0)).toEqual({ startTick: 0, endTick: 1440 });
    expect(beatRange('6/8', 0, 1)).toEqual({ startTick: 1440, endTick: 2880 });
    expect(() => beatRange('6/8', 0, 2)).toThrow(/박 번호/);
  });

  it('3/4는 박이 셋이다', () => {
    expect(beatRange('3/4', 0, 2)).toEqual({ startTick: 1920, endTick: 2880 });
  });

  it('마디 구간', () => {
    expect(measureRange('4/4', 2)).toEqual({ startTick: 7680, endTick: 11520 });
  });
});

describe('느리게 듣기의 템포', () => {
  it('80은 50이다(시안 B02와 같다)', () => {
    expect(slowTempoFor(80)).toBe(50);
  });
  it('5 단위로 맞추고 40 아래로 내리지 않으며 원래보다 빠르지 않다', () => {
    expect(slowTempoFor(120)).toBe(75);
    expect(slowTempoFor(60)).toBe(40);
    expect(slowTempoFor(50)).toBe(40);
    expect(slowTempoFor(40)).toBe(40);
    expect(slowTempoFor(30)).toBe(30);
  });
  it('잘못된 값은 오류다', () => {
    expect(() => slowTempoFor(0)).toThrow();
    expect(() => slowTempoFor(Number.NaN)).toThrow();
  });
});
