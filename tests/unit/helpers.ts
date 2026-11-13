// 테스트용 악보 만들기 도구. 제품 코드가 아니다.
import { parsePitch, writtenOf } from '@/domain/pitch';
import type { Accidental, SpelledPitch } from '@/domain/pitch';
import type { NoteEvent, RestEvent, Score, TupletGroup } from '@/domain/score';

export const p = (text: string): SpelledPitch => parsePitch(text);

export function baseScore(over: Partial<Score> = {}): Score {
  return {
    PPQ: 960,
    tuning: '12TET',
    octaveConvention: 'C4=MIDI60',
    tempoReference: 'quarter',
    tempoBpm: 80,
    meter: '4/4',
    staves: [{ staffId: 's1', clef: 'treble', keySignature: 0 }],
    voices: [{ voiceId: 'v1', staffId: 's1' }],
    events: [],
    ...over,
  };
}

export interface EvOpts {
  voice?: string;
  staff?: string;
  groupId?: string;
  /** 기보 임시표를 직접 지정한다. 생략하면 음이름에서 나온 변화를 쓴다(자연음은 표시 없음) */
  accidental?: Accidental | null;
}

export function note(id: string, measure: number, onset: number, dur: number, pitch: string, o: EvOpts = {}): NoteEvent {
  const wp = writtenOf(p(pitch));
  return {
    eventId: id,
    type: 'note',
    voiceId: o.voice ?? 'v1',
    staffId: o.staff ?? 's1',
    measureIndex: measure,
    onsetTicks: onset,
    durationTicks: dur,
    writtenPitch: o.accidental !== undefined ? { ...wp, accidental: o.accidental } : wp,
    ...(o.groupId ? { groupId: o.groupId } : {}),
  };
}

export function rest(id: string, measure: number, onset: number, dur: number, o: EvOpts = {}): RestEvent {
  return {
    eventId: id,
    type: 'rest',
    voiceId: o.voice ?? 'v1',
    staffId: o.staff ?? 's1',
    measureIndex: measure,
    onsetTicks: onset,
    durationTicks: dur,
    ...(o.groupId ? { groupId: o.groupId } : {}),
  };
}

/** 4분음표로 이어진 음 목록(4/4)을 한 성부 악보로 만든다. 음마다 마디가 4개씩 채워진다. */
export function quarterLine(pitches: string[], over: Partial<Score> = {}): Score {
  const events = pitches.map((t, i) => note(`n${i + 1}`, Math.floor(i / 4), (i % 4) * 960, 960, t));
  return baseScore({ events, ...over });
}

export const triplet83: TupletGroup = { groupId: 'g1', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: [] };
