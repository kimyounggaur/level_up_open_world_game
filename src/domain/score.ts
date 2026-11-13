// 1-4 악보 데이터와 ScoreResolver: 조표와 임시표 해석, 악보 검사.
import { ACCIDENTAL_ALTER, LETTER_PC, midiOf, pitchName } from './pitch';
import type { ResolvedPitch, WrittenPitch } from './pitch';
import { keySignatureAlter } from './key';
import { PPQ, VALUE_TICKS, measureTicks, tupletNoteTicks } from './time';
import type { NoteValue, TempoReference } from './time';
import type { Clef } from './staff';

export interface ScoreStaff {
  staffId: string;
  clef: Clef;
  /** 올림표 개수(+), 내림표 개수(−) */
  keySignature: number;
}

export interface ScoreVoice {
  voiceId: string;
  staffId: string;
  label?: string;
}

interface EventBase {
  eventId: string;
  voiceId: string;
  staffId: string;
  /** 0부터 센다 */
  measureIndex: number;
  /** 마디의 처음부터 센 틱 */
  onsetTicks: number;
  durationTicks: number;
  groupId?: string;
}

export interface NoteEvent extends EventBase {
  type: 'note';
  writtenPitch: WrittenPitch;
  resolvedPitch?: ResolvedPitch;
}

export interface RestEvent extends EventBase {
  type: 'rest';
}

export type ScoreEvent = NoteEvent | RestEvent;

export interface TupletGroup {
  groupId: string;
  actualNotes: number;
  normalNotes: number;
  writtenBaseDuration: NoteValue;
  eventIds: string[];
}

export interface ChordEventDef {
  chordEventId: string;
  eventIds: string[];
  label?: string;
}

export interface Score {
  PPQ: 960;
  tuning: '12TET';
  octaveConvention: 'C4=MIDI60';
  tempoReference: TempoReference;
  tempoBpm: number;
  meter: string;
  /** 비어 있는 끝 마디까지 세려면 적는다. 없으면 가장 큰 measureIndex + 1 */
  measureCount?: number;
  staves: ScoreStaff[];
  voices: ScoreVoice[];
  events: ScoreEvent[];
  tuplets?: TupletGroup[];
  chords?: ChordEventDef[];
}

export function isNote(e: ScoreEvent): e is NoteEvent {
  return e.type === 'note';
}

export function measureCountOf(score: Pick<Score, 'events' | 'measureCount'>): number {
  const maxIdx = score.events.reduce((m, e) => Math.max(m, e.measureIndex), -1);
  return Math.max(score.measureCount ?? 0, maxIdx + 1);
}

export function absoluteOnset(e: Pick<ScoreEvent, 'measureIndex' | 'onsetTicks'>, measureLen: number): number {
  return e.measureIndex * measureLen + e.onsetTicks;
}

export function scoreTotalTicks(score: Pick<Score, 'events' | 'measureCount' | 'meter'>): number {
  return measureCountOf(score) * measureTicks(score.meter);
}

function byTime(a: ScoreEvent, b: ScoreEvent): number {
  return a.measureIndex - b.measureIndex || a.onsetTicks - b.onsetTicks;
}

// ---------------------------------------------------------------------------
// ScoreResolver: 기보 음(writtenPitch)에 조표와 같은 마디의 임시표를 적용해 해석 음(resolvedPitch)을 확정한다.
// 같은 보표 안에서 같은 문자와 옥타브의 임시표는 그 마디가 끝날 때까지 유지되고, 다음 마디에서는 조표로 돌아간다.
// 해석한 음을 재생할 때는 조표를 다시 적용하지 않는다.

export function resolveScore<S extends Score>(score: S): S {
  const staffById = new Map(score.staves.map((s) => [s.staffId, s]));
  const events = score.events.map((e) => ({ ...e })) as ScoreEvent[];
  const order = new Map(score.voices.map((v, i) => [v.voiceId, i]));
  const byStaff = new Map<string, ScoreEvent[]>();
  for (const e of events) {
    if (!staffById.has(e.staffId)) throw new Error(`알 수 없는 보표: ${e.staffId} (사건 ${e.eventId})`);
    const list = byStaff.get(e.staffId) ?? [];
    list.push(e);
    byStaff.set(e.staffId, list);
  }
  for (const [staffId, list] of byStaff) {
    const staff = staffById.get(staffId)!;
    list.sort((a, b) => byTime(a, b) || (order.get(a.voiceId) ?? 0) - (order.get(b.voiceId) ?? 0));
    let measure = -1;
    let memory = new Map<string, number>();
    for (const e of list) {
      if (e.measureIndex !== measure) {
        measure = e.measureIndex;
        memory = new Map();
      }
      if (e.type !== 'note') continue;
      const wp = e.writtenPitch;
      const key = `${wp.letter}${wp.octave}`;
      let alter: number;
      if (wp.accidental !== null) {
        alter = ACCIDENTAL_ALTER[wp.accidental];
        memory.set(key, alter);
      } else if (memory.has(key)) {
        alter = memory.get(key)!;
      } else {
        alter = keySignatureAlter(staff.keySignature, wp.letter);
      }
      e.resolvedPitch = { letter: wp.letter, alter, octave: wp.octave, midi: midiOf({ letter: wp.letter, alter, octave: wp.octave }) };
    }
  }
  return { ...score, events };
}

// ---------------------------------------------------------------------------
// 악보 검사 (콘텐츠 검사와 판정 전 구조 검사에 쓴다)

export interface ScoreIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidateScoreOptions {
  /** 모든 성부의 모든 마디가 박자표대로 꽉 차야 한다(목표 악보) */
  requireFullMeasures?: boolean;
  /** resolvedPitch가 들어 있고 해석기의 결과와 같아야 한다(목표 악보) */
  requireResolved?: boolean;
}

export function validateScore(score: Score, opts: ValidateScoreOptions = {}): ScoreIssue[] {
  const issues: ScoreIssue[] = [];
  const add = (code: string, message: string, path?: string) => issues.push({ code, message, path });

  if (score.PPQ !== PPQ) add('PPQ', `PPQ는 ${PPQ}이어야 해요: ${String(score.PPQ)}`);
  if (score.tuning !== '12TET') add('TUNING', `tuning은 12TET이어야 해요: ${String(score.tuning)}`);
  if (score.octaveConvention !== 'C4=MIDI60') add('OCTAVE', `octaveConvention은 C4=MIDI60이어야 해요: ${String(score.octaveConvention)}`);
  if (!Number.isFinite(score.tempoBpm) || score.tempoBpm <= 0) add('TEMPO', `tempoBpm이 올바르지 않아요: ${score.tempoBpm}`);
  let measureLen = 0;
  try {
    measureLen = measureTicks(score.meter);
  } catch (err) {
    add('METER', (err as Error).message);
    return issues;
  }

  const staffIds = new Set<string>();
  for (const s of score.staves) {
    if (staffIds.has(s.staffId)) add('DUP_STAFF', `보표 id가 겹쳐요: ${s.staffId}`);
    staffIds.add(s.staffId);
    if (!Number.isInteger(s.keySignature) || s.keySignature < -7 || s.keySignature > 7) add('KEY_SIGNATURE', `조표가 올바르지 않아요: ${s.keySignature}`, s.staffId);
  }
  const voiceIds = new Set<string>();
  const voiceStaff = new Map<string, string>();
  for (const v of score.voices) {
    if (voiceIds.has(v.voiceId)) add('DUP_VOICE', `성부 id가 겹쳐요: ${v.voiceId}`);
    voiceIds.add(v.voiceId);
    voiceStaff.set(v.voiceId, v.staffId);
    if (!staffIds.has(v.staffId)) add('VOICE_STAFF', `성부 ${v.voiceId}의 보표 ${v.staffId}가 없어요`);
  }
  // 한 보표를 여러 성부가 나눠 쓰는 경우는 첫 제품에서 지원하지 않는다(조용히 바꾸지 않고 알린다).
  const staffUse = new Map<string, string[]>();
  for (const v of score.voices) staffUse.set(v.staffId, [...(staffUse.get(v.staffId) ?? []), v.voiceId]);
  for (const [sid, vs] of staffUse) if (vs.length > 1) add('SHARED_STAFF', `보표 ${sid}를 성부 ${vs.join(', ')}가 함께 써요. 아직 지원하지 않아요`);

  const eventIds = new Set<string>();
  const byId = new Map<string, ScoreEvent>();
  for (const e of score.events) {
    const at = `event ${e.eventId}`;
    if (eventIds.has(e.eventId)) add('DUP_EVENT', `사건 id가 겹쳐요: ${e.eventId}`);
    eventIds.add(e.eventId);
    byId.set(e.eventId, e);
    if (!voiceIds.has(e.voiceId)) add('EVENT_VOICE', `${at}: 없는 성부 ${e.voiceId}`);
    else if (voiceStaff.get(e.voiceId) !== e.staffId) add('EVENT_STAFF', `${at}: 성부의 보표(${voiceStaff.get(e.voiceId)})와 사건의 보표(${e.staffId})가 달라요`);
    if (!Number.isInteger(e.measureIndex) || e.measureIndex < 0) add('MEASURE_INDEX', `${at}: measureIndex가 올바르지 않아요`);
    if (!Number.isInteger(e.onsetTicks) || e.onsetTicks < 0) add('ONSET', `${at}: onsetTicks가 올바르지 않아요`);
    if (!Number.isInteger(e.durationTicks) || e.durationTicks <= 0) add('DURATION', `${at}: durationTicks가 양의 정수여야 해요`);
    if (e.onsetTicks + e.durationTicks > measureLen) add('CROSS_BARLINE', `${at}: 마디(${measureLen}틱)를 넘어요. 마디를 넘는 길이는 지원하지 않아요`);
    if (e.type === 'note') {
      const wp = e.writtenPitch;
      if (!wp || !(wp.letter in LETTER_PC) || !Number.isInteger(wp.octave)) add('WRITTEN_PITCH', `${at}: 기보 음이 올바르지 않아요`);
    }
  }

  // 같은 성부의 겹침 검사(같은 시작·같은 길이의 음은 화음으로 본다)
  for (const v of score.voices) {
    const list = score.events.filter((e) => e.voiceId === v.voiceId).sort(byTime);
    for (let m = 0; m < measureCountOf(score); m++) {
      const inMeasure = list.filter((e) => e.measureIndex === m);
      let end = 0;
      let prevOnset = -1;
      let prevDur = -1;
      let prevType: string | null = null;
      for (const e of inMeasure) {
        const sameChord = e.type === 'note' && prevType === 'note' && e.onsetTicks === prevOnset && e.durationTicks === prevDur;
        if (!sameChord) {
          if (e.onsetTicks < end) add('OVERLAP', `성부 ${v.voiceId} ${m + 1}번째 마디: 사건 ${e.eventId}가 앞의 사건과 겹쳐요`);
          end = Math.max(end, e.onsetTicks + e.durationTicks);
        }
        prevOnset = e.onsetTicks;
        prevDur = e.durationTicks;
        prevType = e.type;
      }
      if (opts.requireFullMeasures) {
        // 빈틈 없이 마디 길이를 채워야 한다
        let cursor = 0;
        let ok = true;
        let lastKey = '';
        for (const e of inMeasure) {
          const key = `${e.onsetTicks}/${e.durationTicks}`;
          if (e.type === 'note' && key === lastKey) continue;
          lastKey = key;
          if (e.onsetTicks !== cursor) ok = false;
          cursor = e.onsetTicks + e.durationTicks;
        }
        if (!ok || cursor !== measureLen) {
          add('MEASURE_NOT_FULL', `성부 ${v.voiceId} ${m + 1}번째 마디: 길이의 합이 ${measureLen}틱이 아니거나 빈틈이 있어요(합 ${cursor}틱)`);
        }
      }
    }
  }

  // 연음(셋잇단 등)
  for (const g of score.tuplets ?? []) {
    const evs = g.eventIds.map((id) => byId.get(id));
    if (evs.some((x) => !x)) {
      add('TUPLET_REF', `연음 ${g.groupId}가 없는 사건을 가리켜요`);
      continue;
    }
    let each: number;
    try {
      each = tupletNoteTicks(g.writtenBaseDuration, g.actualNotes, g.normalNotes);
    } catch (err) {
      add('TUPLET', `연음 ${g.groupId}: ${(err as Error).message}`);
      continue;
    }
    if (g.eventIds.length !== g.actualNotes) add('TUPLET_COUNT', `연음 ${g.groupId}: 사건 ${g.eventIds.length}개, actualNotes ${g.actualNotes}`);
    for (const e of evs as ScoreEvent[]) {
      if (e.durationTicks !== each) add('TUPLET_DURATION', `연음 ${g.groupId}의 ${e.eventId}: ${each}틱이어야 하는데 ${e.durationTicks}틱이에요`);
    }
    const span = g.normalNotes * VALUE_TICKS[g.writtenBaseDuration];
    if (g.actualNotes * each !== span) add('TUPLET_SPAN', `연음 ${g.groupId}: 묶음 길이가 ${span}틱과 달라요`);
  }

  for (const c of score.chords ?? []) {
    for (const id of c.eventIds) {
      const e = byId.get(id);
      if (!e) add('CHORD_REF', `화음 ${c.chordEventId}가 없는 사건 ${id}를 가리켜요`);
      else if (e.type !== 'note') add('CHORD_REST', `화음 ${c.chordEventId}에 쉼표 ${id}가 들어 있어요`);
    }
  }

  if (opts.requireResolved) {
    let resolved: Score | null = null;
    try {
      resolved = resolveScore(score);
    } catch (err) {
      add('RESOLVE', (err as Error).message);
    }
    if (resolved) {
      for (const e of resolved.events) {
        if (e.type !== 'note') continue;
        const given = (score.events.find((x) => x.eventId === e.eventId) as NoteEvent).resolvedPitch;
        const want = e.resolvedPitch!;
        if (!given) add('RESOLVED_MISSING', `사건 ${e.eventId}: resolvedPitch가 없어요(기대 ${pitchName(want)}, MIDI ${want.midi})`);
        else if (given.letter !== want.letter || given.alter !== want.alter || given.octave !== want.octave || given.midi !== want.midi) {
          add('RESOLVED_MISMATCH', `사건 ${e.eventId}: resolvedPitch가 해석 결과와 달라요(적힌 값 ${pitchName(given)} MIDI ${given.midi}, 해석 값 ${pitchName(want)} MIDI ${want.midi})`);
        } else if (given.midi !== midiOf(given)) {
          add('MIDI', `사건 ${e.eventId}: midi ${given.midi}가 음이름·변화·옥타브와 맞지 않아요`);
        }
      }
    }
  }
  return issues;
}

export function notesOf(score: Pick<Score, 'events'>, voiceId?: string): NoteEvent[] {
  return score.events.filter(isNote).filter((e) => (voiceId ? e.voiceId === voiceId : true)).sort(byTime);
}

export function eventsOfVoice(score: Pick<Score, 'events'>, voiceId: string): ScoreEvent[] {
  return score.events.filter((e) => e.voiceId === voiceId).sort(byTime);
}
