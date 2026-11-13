// 6-11 검수 점검표 2번(설계서 11.2): 오답 사례(누락, 추가, 순서, 옥타브, 길이, 표기, 음소거)마다 기대한 설명이 나온다.
// 5-10에서는 이 항목을 `evaluators.test.ts`의 사례별 시험이 맡았다. 6단계에서 더한 과제는 같은 판정기에 데이터만 다르게 올렸기 때문에(박자표 3/4와 6/8, 점음표, 16분음표, 셋잇단음표,
// 단·감·증3화음, 화음 목록) 그 자리의 말이 제대로 나오는지는 따로 대어 봐야 한다.
// 방법: 판본마다 정답 입력을 만든 다음 일부러 틀리게 바꾼다. 어떻게 바꿀지와 기대하는 설명 코드와 문장에 들어갈 말은 이 파일이 정한다(판정기의 코드를 베끼지 않는다).
//   - 틀리게 바꾸는 입력은 정답 데이터에서 만든 것이고, 사람이 만든 오답이 아니다. 사람이 실제로 많이 하는 틀림인지는 검수에서 본다.
//   - 이 파일이 대는 판정기는 rhythmPlacement, triadMembership, chordSequence 셋이다. 이 셋을 쓰는 모든 판본(새 과제 11개의 18판본과 원래 과제 5판본)이 대상이다.
//     다른 판정기를 쓰는 판본은 5-10의 `evaluators.test.ts`가 맡고, 어느 쪽에도 속하지 않는 새 판정기가 생기면 이 파일의 '범위' 시험이 알린다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isHearingSuccess, isMusicalMiss, makeAttemptResult } from '@/domain/attempt';
import { evaluate } from '@/domain/evaluators';
import type { EvaluatorInput, PlacedTone } from '@/domain/evaluators';
import { renderAll } from '@/domain/feedback';
import type { IssueCode } from '@/domain/feedback';
import { LETTER_PC, alterSymbol, midiOf, pitchName } from '@/domain/pitch';
import type { SpelledPitch } from '@/domain/pitch';
import { measureCountOf, resolveScore } from '@/domain/score';
import type { Score } from '@/domain/score';
import { describeTicks, measureTicks, positionLabel } from '@/domain/time';
import { answerInput } from './answers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUESTS: Array<Record<string, any>> = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', f), 'utf-8')));

interface VariantRef {
  key: string;
  questId: string;
  variantId: string;
  v: Record<string, any>;
}
const VARIANTS: VariantRef[] = QUESTS.flatMap((q) => (q.variantIds as string[]).map((vid) => ({ key: `${q.questId}/${vid}`, questId: q.questId as string, variantId: vid, v: q.variants[vid] as Record<string, any> })));

/** 이 파일이 대는 판정기 */
const HANDLED = ['rhythmPlacement', 'triadMembership', 'chordSequence'];
/**
 * 다른 판정기를 쓰는 과제: 5-10의 evaluators.test.ts가 맡는다(Q01, Q04, Q06, Q07, Q08).
 * 7단계의 오선 언덕 과제(Q09–Q12)는 staff-hill-quests.test.ts가, 음계 길 과제(Q24–Q26)는 scale-trail-quests.test.ts가,
 * 건반 늪 과제(Q27–Q31)는 key-marsh-quests.test.ts가 판본마다 틀린 입력을 만들어 대 본다.
 */
const ELSEWHERE = [
  'pitch.same-note-two-clefs',
  'pitch.same-sound-different-names',
  'chord.inversion',
  'scale.major',
  'song.short-piece',
  'staff.lines-and-spaces',
  'staff.ledger-lines',
  'staff.middle-c-neighbors',
  'staff.range-ladder',
  'scale.natural-minor',
  'scale.harmonic-minor',
  'scale.pentatonic',
  'key.black-key-names',
  'key.whole-and-half-steps',
  'key.build-intervals',
  'key.accidentals-in-a-bar',
  'scale.chromatic',
];
/** 6단계에서 더한 11개 과제. 모든 판본이 이 파일의 대상이어야 한다 */
const SIXTH = [
  'rhythm.three-four',
  'rhythm.note-values',
  'rhythm.dotted',
  'rhythm.rest-lengths',
  'rhythm.sixteenths',
  'rhythm.triplets',
  'rhythm.six-eight',
  'chord.major-and-minor',
  'chord.primary-triads',
  'chord.diminished-augmented',
  'chord.progression-walk',
];

const COVERED = VARIANTS.filter((x) => HANDLED.includes(x.v.evaluatorSpec.type));

// ---------------------------------------------------------------------------
// 오답 사례의 모양

type Axis = 'omission' | 'extra' | 'order' | 'octave' | 'duration' | 'notation';

interface WrongCase {
  axis: Axis;
  /** 무엇을 어떻게 바꾸었는가(시험 이름에 쓴다) */
  what: string;
  input: EvaluatorInput;
  /** true면 이 과제는 그 점을 보지 않는다고 설계서가 정한 경우이므로 통과해야 한다(예: 화음 하나의 옥타브와 가로 순서) */
  passes?: boolean;
  /** 이 코드가 모두 나와야 한다 */
  codes?: IssueCode[];
  /** 이 코드 가운데 하나는 나와야 한다 */
  anyOf?: IssueCode[];
  /** 이 코드는 나오면 안 된다 */
  not?: IssueCode[];
  /** 렌더링한 설명 전체에 이 글이 모두 들어 있어야 한다 */
  text?: string[];
  /** 첫 설명의 '어디'가 이 글이어야 한다 */
  firstWhere?: string;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------
// 리듬(rhythmPlacement): 악보를 통째로 고친다

type Ev = Record<string, any>;

function rhythmCases(v: Record<string, any>): WrongCase[] {
  const score = v.score as Score;
  const spec = v.evaluatorSpec as { voiceId: string; requirePitch: boolean };
  const len = measureTicks(score.meter);
  const measures = measureCountOf(score);
  const abs = (e: Ev): number => e.measureIndex * len + e.onsetTicks;
  const events = (score.events as Ev[]).filter((e) => e.voiceId === spec.voiceId).sort((a, b) => abs(a) - abs(b));
  const whereOf = (t: number): string => (measures > 1 ? `${Math.floor(t / len) + 1}번째 마디의 ` : '') + positionLabel(t % len, score.meter);
  const kindKo = (e: Ev): string => (e.type === 'note' ? '음표' : '쉼표');
  const input = (s: Score): EvaluatorInput => ({ type: 'rhythmPlacement', score: s });
  const mutate = (fn: (s: Score, evs: Ev[]) => void): Score => {
    const s = clone(score);
    fn(s, s.events as Ev[]);
    return s;
  };
  const out: WrongCase[] = [];
  const find = (id: string, evs: Ev[]): Ev => evs.find((e) => e.eventId === id)!;

  // 누락: 처음 사건(음표 또는 쉼표) 하나를 지운다. 그 자리와 종류를 말하고, 마디에서 모자란 틱도 말한다
  {
    const first = events[0]!;
    const s = mutate((sc) => {
      sc.events = (sc.events as Ev[]).filter((e) => e.eventId !== first.eventId) as typeof sc.events;
    });
    out.push({
      axis: 'omission',
      what: `처음 ${kindKo(first)}를 지운다`,
      input: input(s),
      codes: ['MISSING_EVENT', 'MEASURE_TICKS_REMAIN'],
      text: [whereOf(abs(first)), kindKo(first), `${first.durationTicks}틱`],
      firstWhere: whereOf(abs(first)),
    });
  }

  // 길이와 추가를 보일 사건: 묶음(셋잇단) 밖이고 반으로 나눌 수 있는 첫 사건
  const host = events.find((e) => !e.groupId && e.durationTicks >= 240 && e.durationTicks % 2 === 0);
  if (host) {
    const half = host.durationTicks / 2;
    // 추가: 그 사건의 한가운데에 사건을 하나 더 얹는다. 목표에 없는 사건, 겹침, 넘치는 틱을 말한다
    const withExtra = mutate((sc, evs) => {
      const extra = { ...clone(find(host.eventId, evs)), eventId: 'extra-1', onsetTicks: host.onsetTicks + half, durationTicks: half };
      sc.events = [...evs, extra] as typeof sc.events;
    });
    out.push({
      axis: 'extra',
      what: `${kindKo(host)} 한가운데에 ${half}틱짜리를 더 얹는다`,
      input: input(withExtra),
      codes: ['EXTRA_EVENT', 'OVERLAP', 'MEASURE_TICKS_OVER'],
      text: [whereOf(abs(host) + half), '목표에 없는', `${half}틱`],
    });
    // 길이: 그 사건을 반으로 줄인다. 목표와 지금의 길이를 둘 다 말한다
    const shorter = mutate((_sc, evs) => {
      find(host.eventId, evs).durationTicks = half;
    });
    out.push({
      axis: 'duration',
      what: `${kindKo(host)}의 길이를 ${host.durationTicks}틱에서 ${half}틱으로 줄인다`,
      input: input(shorter),
      codes: ['DURATION_MISMATCH', 'MEASURE_TICKS_REMAIN'],
      text: [whereOf(abs(host)), describeTicks(host.durationTicks), describeTicks(half), `${half}틱`],
      firstWhere: whereOf(abs(host)),
    });
  }

  // 순서: 이웃한 두 덩어리(사건 하나, 또는 셋잇단 묶음 전체)의 자리를 맞바꾼다. 첫 사건이 길이, 종류, 음, 묶음 여부 가운데 하나라도 달라야 한다.
  // 마디 합은 그대로 맞으므로, 합이 맞아도 통과하지 않는다는 것을 보인다
  {
    const sig = (e: Ev): string => `${e.type}|${e.durationTicks}|${e.type === 'note' ? e.resolvedPitch.midi : ''}|${e.groupId ? 'g' : ''}`;
    interface Unit {
      evs: Ev[];
      start: number;
      end: number;
    }
    const units: Unit[] = [];
    for (const e of events) {
      const last = units[units.length - 1];
      if (e.groupId && last && last.evs[0]!.groupId === e.groupId) {
        last.evs.push(e);
        last.end = abs(e) + e.durationTicks;
      } else units.push({ evs: [e], start: abs(e), end: abs(e) + e.durationTicks });
    }
    for (let i = 0; i + 1 < units.length; i++) {
      const a = units[i]!;
      const b = units[i + 1]!;
      if (Math.floor(a.start / len) !== Math.floor(b.start / len) || a.end !== b.start || sig(a.evs[0]!) === sig(b.evs[0]!)) continue;
      const swapped = mutate((_sc, evs) => {
        for (const e of b.evs) find(e.eventId, evs).onsetTicks -= b.start - a.start;
        for (const e of a.evs) find(e.eventId, evs).onsetTicks += b.end - b.start;
      });
      const ids = (u: Unit): string => u.evs.map((e) => e.eventId).join('·');
      out.push({
        axis: 'order',
        what: `이웃한 두 덩어리(${ids(a)} / ${ids(b)})의 자리를 맞바꾼다`,
        input: input(swapped),
        anyOf: ['DURATION_MISMATCH', 'REST_EXPECTED_NOTE_FOUND', 'NOTE_EXPECTED_REST_FOUND', 'PITCH_MISMATCH', 'TUPLET_MISMATCH', 'TUPLET_DURATION'],
        not: ['MEASURE_TICKS_REMAIN', 'MEASURE_TICKS_OVER', 'OVERLAP'],
        firstWhere: whereOf(a.start),
      });
      break;
    }
  }

  // 옥타브: 처음 음표를 한 옥타브 올린다. 음높이를 요구하는 과제면 목표와 지금의 이름을 둘 다 말한다
  {
    const note = events.find((e) => e.type === 'note');
    if (note) {
      const up = mutate((_sc, evs) => {
        find(note.eventId, evs).writtenPitch.octave += 1;
      });
      const want = pitchName(note.resolvedPitch as SpelledPitch);
      const got = pitchName({ ...(note.resolvedPitch as SpelledPitch), octave: note.resolvedPitch.octave + 1 });
      out.push(
        spec.requirePitch
          ? { axis: 'octave', what: `${want}를 ${got}로 한 옥타브 올린다`, input: input(up), codes: ['PITCH_MISMATCH'], text: [whereOf(abs(note)), want, got], firstWhere: whereOf(abs(note)) }
          : { axis: 'octave', what: `${want}를 ${got}로 한 옥타브 올린다(이 과제는 음높이를 보지 않는다)`, input: input(up), passes: true },
      );
    }
  }

  // 표기: 음표를 쉼표로, 쉼표를 음표로 바꾼다. 셋잇단 묶음이 있으면 묶음 표시를 지우고, 묶음 안의 음 길이를 틀리게 한다
  {
    const note = events.find((e) => e.type === 'note' && !e.groupId);
    if (note) {
      const toRest = mutate((sc, evs) => {
        const e = find(note.eventId, evs);
        const rest: Ev = { eventId: e.eventId, type: 'rest', voiceId: e.voiceId, staffId: e.staffId, measureIndex: e.measureIndex, onsetTicks: e.onsetTicks, durationTicks: e.durationTicks };
        sc.events = evs.map((x) => (x.eventId === e.eventId ? rest : x)) as typeof sc.events;
      });
      out.push({
        axis: 'notation',
        what: `${pitchName(note.resolvedPitch as SpelledPitch)} 음표를 쉼표로 바꾼다`,
        input: input(toRest),
        codes: ['NOTE_EXPECTED_REST_FOUND'],
        text: [whereOf(abs(note)), pitchName(note.resolvedPitch as SpelledPitch), '쉼'],
        firstWhere: whereOf(abs(note)),
      });
    }
    const rest = events.find((e) => e.type === 'rest' && !e.groupId);
    if (rest && note) {
      const toNote = mutate((sc, evs) => {
        const e = find(rest.eventId, evs);
        const n: Ev = { ...e, type: 'note', writtenPitch: { ...clone(note.writtenPitch) } };
        sc.events = evs.map((x) => (x.eventId === e.eventId ? n : x)) as typeof sc.events;
      });
      const actual = resolveScore(toNote).events.find((e) => e.eventId === rest.eventId) as Ev;
      out.push({
        axis: 'notation',
        what: `쉼표를 ${pitchName(actual.resolvedPitch as SpelledPitch)} 음표로 바꾼다`,
        input: input(toNote),
        codes: ['REST_EXPECTED_NOTE_FOUND'],
        text: [whereOf(abs(rest)), pitchName(actual.resolvedPitch as SpelledPitch)],
        firstWhere: whereOf(abs(rest)),
      });
    }
    const member = events.find((e) => e.groupId);
    if (member) {
      const group = score.tuplets!.find((g) => g.groupId === member.groupId)!;
      const each = member.durationTicks as number;
      const unmarked = mutate((_sc, evs) => {
        for (const e of evs) if (e.groupId === member.groupId) delete e.groupId;
      });
      out.push({ axis: 'notation', what: `셋잇단 묶음(${group.groupId}) 표시를 지운다(길이는 그대로)`, input: input(unmarked), codes: ['TUPLET_MISMATCH'], text: [whereOf(abs(member)), '잇단음표'], firstWhere: whereOf(abs(member)) });
      const shortened = mutate((_sc, evs) => {
        find(member.eventId, evs).durationTicks = each / 2;
      });
      out.push({
        axis: 'duration',
        what: `묶음 안의 음(${member.eventId})을 ${each}틱에서 ${each / 2}틱으로 줄인다`,
        input: input(shortened),
        codes: ['TUPLET_DURATION', 'MEASURE_TICKS_REMAIN'],
        text: [whereOf(abs(member)), `${each}틱`],
        firstWhere: whereOf(abs(member)),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 화음 하나(triadMembership)와 화음 목록(chordSequence): 걸린 음을 고친다

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/**
 * 소리가 같고 이름이 다른 표기(올림이나 내림 하나만 쓴다)를 찾는다. 예: C4 → B♯3, E♭4 → D♯4, G♯4 → A♭4.
 * D, G, A처럼 올림표 하나나 내림표 하나로는 다르게 적을 수 없는 음(겹올림표나 겹내림표가 필요하다)은 undefined다.
 */
function respell(p: SpelledPitch): SpelledPitch | undefined {
  const midi = midiOf(p);
  for (const letter of NATURALS) {
    if (letter === p.letter) continue;
    for (const octave of [p.octave, p.octave - 1, p.octave + 1]) {
      const alter = midi - (12 * (octave + 1) + LETTER_PC[letter]);
      if (alter === 1 || alter === -1) return { letter, alter, octave };
    }
  }
  return undefined;
}

/** 걸린 음 가운데 다르게 적을 수 있는 첫 음의 자리와 그 다른 표기 */
function firstRespellable(notes: readonly PlacedTone[]): { index: number; spelled: SpelledPitch } {
  for (let index = 0; index < notes.length; index++) {
    const spelled = respell(notes[index]!.pitch);
    if (spelled) return { index, spelled };
  }
  throw new Error('다르게 적을 수 있는 음이 하나도 없어요');
}

/** 화음 구성음의 음급이 아닌 자연음 하나 */
function outsider(required: number[], octave = 4): SpelledPitch {
  const letter = NATURALS.find((l) => !required.includes(LETTER_PC[l] % 12))!;
  return { letter, alter: 0, octave };
}

const tone = (p: SpelledPitch, i: number): PlacedTone => ({ slotId: `x-${i}`, pitch: p });
const sound = (p: SpelledPitch): string => `${p.letter}${alterSymbol(p.alter)}`;

function triadCases(v: Record<string, any>): WrongCase[] {
  const spec = v.evaluatorSpec as { requiredPitchClasses: number[]; requiredSpellings?: Array<{ letter: string; alter: number }>; allowDoubling?: boolean; requiredMidi?: number[] };
  const good = (answerInput(v) as { type: 'triadMembership'; notes: PlacedTone[] }).notes;
  const input = (notes: PlacedTone[]): EvaluatorInput => ({ type: 'triadMembership', notes });
  const out: WrongCase[] = [];
  const first = good[0]!;

  out.push({ axis: 'omission', what: `${sound(first.pitch)}을 뺀다`, input: input(good.slice(1)), codes: ['MISSING_TONE'], not: ['EXTRA_NOTE'], text: [sound(first.pitch), '빠졌어요'] });
  const alien = outsider(spec.requiredPitchClasses);
  out.push({ axis: 'extra', what: `구성음이 아닌 ${sound(alien)}을 더한다`, input: input([...good, tone(alien, 9)]), codes: ['EXTRA_NOTE'], text: [sound(alien), '구성음이 아니에요'] });
  if (!spec.allowDoubling) {
    out.push({ axis: 'extra', what: `${sound(first.pitch)}을 겹쳐 놓는다`, input: input([...good, tone(first.pitch, 9)]), codes: ['DUPLICATE_TONE'], text: [sound(first.pitch), '겹쳐'] });
  }
  out.push({ axis: 'extra', what: '아무것도 놓지 않는다', input: input([]), codes: ['NOTE_COUNT'], text: ['0개'] });
  // 표기: 소리 높이는 같고 이름이 다르다(표기를 요구하는 과제만)
  const { index: k, spelled } = firstRespellable(good);
  const old = good[k]!.pitch;
  const respelled = good.map((n, i) => (i === k ? { ...n, pitch: spelled } : n));
  out.push(
    spec.requiredSpellings
      ? { axis: 'notation', what: `${pitchName(old)}을 ${pitchName(spelled)}으로 다르게 적는다`, input: input(respelled), codes: ['WRONG_SPELLING_SAME_PITCH'], not: ['MISSING_TONE', 'EXTRA_NOTE'], text: [sound(spelled), sound(old), '이름이 달라요'] }
      : { axis: 'notation', what: `${pitchName(old)}을 ${pitchName(spelled)}으로 다르게 적는다(이 과제는 표기를 보지 않는다)`, input: input(respelled), passes: true },
  );
  // 옥타브: 첫 음을 한 옥타브 올린다
  const up = { ...first.pitch, octave: first.pitch.octave + 1 };
  out.push(
    spec.requiredMidi
      ? { axis: 'octave', what: `${pitchName(first.pitch)}을 한 옥타브 올린다`, input: input([tone(up, 0), ...good.slice(1)]), codes: ['WRONG_OCTAVE_SET'] }
      : { axis: 'octave', what: `${pitchName(first.pitch)}을 한 옥타브 올린다(이 과제는 옥타브를 보지 않는다)`, input: input([tone(up, 0), ...good.slice(1)]), passes: true },
  );
  // 순서: 가로 순서는 보지 않는다(전위는 다른 판정기의 일이다)
  out.push({ axis: 'order', what: '구성음을 거꾸로 늘어놓는다(가로 순서는 보지 않는다)', input: input([...good].reverse()), passes: true });
  return out;
}

function sequenceCases(v: Record<string, any>): WrongCase[] {
  const spec = v.evaluatorSpec as { trees: number; events: Array<{ label: string; tree: number; requiredPitchClasses: number[]; requiredSpellings?: unknown; requiredMidi?: number[] }> };
  const good = (answerInput(v) as { type: 'chordSequence'; trees: PlacedTone[][] }).trees;
  const input = (trees: PlacedTone[][]): EvaluatorInput => ({ type: 'chordSequence', trees });
  const withTree = (i: number, notes: PlacedTone[]): PlacedTone[][] => good.map((t, k) => (k === i ? notes : t));
  const out: WrongCase[] = [];
  // 나무 하나를 한 화음만 맡는 사건: 그 사건의 문제만 말하는지 본다
  const alone = (e: { tree: number }): boolean => spec.events.filter((x) => x.tree === e.tree).length === 1;
  const ev = spec.events.find(alone)!;
  const notes = good[ev.tree]!;

  out.push({ axis: 'omission', what: `'${ev.label}'의 ${sound(notes[0]!.pitch)}을 뺀다`, input: input(withTree(ev.tree, notes.slice(1))), codes: ['MISSING_TONE'], text: [ev.label, sound(notes[0]!.pitch)], firstWhere: ev.label });
  const alien = outsider(ev.requiredPitchClasses);
  out.push({ axis: 'extra', what: `'${ev.label}'에 구성음이 아닌 ${sound(alien)}을 더한다`, input: input(withTree(ev.tree, [...notes, tone(alien, 9)])), codes: ['EXTRA_NOTE'], text: [ev.label, sound(alien), '구성음이 아니에요'] });
  out.push({ axis: 'extra', what: `'${ev.label}'의 나무를 비워 둔다`, input: input(withTree(ev.tree, [])), codes: ['NOTE_COUNT'], text: [ev.label, '0개'] });
  const { index: k, spelled } = firstRespellable(notes);
  const old = notes[k]!.pitch;
  out.push({
    axis: 'notation',
    what: `'${ev.label}'의 ${pitchName(old)}을 ${pitchName(spelled)}으로 다르게 적는다`,
    input: input(withTree(ev.tree, notes.map((n, i) => (i === k ? { ...n, pitch: spelled } : n)))),
    codes: ['WRONG_SPELLING_SAME_PITCH'],
    text: [ev.label, sound(spelled), sound(old)],
  });
  const up = { ...notes[0]!.pitch, octave: notes[0]!.pitch.octave + 1 };
  out.push(
    ev.requiredMidi
      ? { axis: 'octave', what: `'${ev.label}'의 ${pitchName(notes[0]!.pitch)}을 한 옥타브 올린다`, input: input(withTree(ev.tree, [tone(up, 0), ...notes.slice(1)])), codes: ['WRONG_OCTAVE_SET'], text: [ev.label] }
      : { axis: 'octave', what: `'${ev.label}'의 ${pitchName(notes[0]!.pitch)}을 한 옥타브 올린다(이 과제는 옥타브를 보지 않는다)`, input: input(withTree(ev.tree, [tone(up, 0), ...notes.slice(1)])), passes: true },
  );
  // 순서: 서로 다른 화음을 맡은 두 나무의 음을 맞바꾼다. 두 화음 모두 그 이름으로 설명이 나온다
  const a = spec.events.find((e) => alone(e))!;
  const b = spec.events.find((e) => alone(e) && e.tree !== a.tree && JSON.stringify(e.requiredPitchClasses) !== JSON.stringify(a.requiredPitchClasses))!;
  const swapped = good.map((t, k) => (k === a.tree ? good[b.tree]! : k === b.tree ? good[a.tree]! : t));
  out.push({ axis: 'order', what: `'${a.label}'와 '${b.label}'의 나무에 건 음을 맞바꾼다`, input: input(swapped), anyOf: ['MISSING_TONE', 'EXTRA_NOTE'], text: [a.label, b.label], firstWhere: a.label });
  return out;
}

function casesOf(x: VariantRef): WrongCase[] {
  switch (x.v.evaluatorSpec.type) {
    case 'rhythmPlacement':
      return rhythmCases(x.v);
    case 'triadMembership':
      return triadCases(x.v);
    case 'chordSequence':
      return sequenceCases(x.v);
    default:
      throw new Error(`틀린 입력을 만드는 방법이 없는 판정기: ${x.v.evaluatorSpec.type}`);
  }
}

const SAMPLE_BAD = new Map<string, EvaluatorInput>();

// ---------------------------------------------------------------------------

describe('11.2의 2: 범위', () => {
  it('이 파일이 대지 않는 판본은 모두 5-10의 evaluators.test.ts가 맡는 원래 과제뿐이다. 새 판정기를 쓰는 과제가 생기면 여기서 알린다', () => {
    const left = VARIANTS.filter((x) => !HANDLED.includes(x.v.evaluatorSpec.type));
    expect(left.length).toBeGreaterThan(0);
    for (const x of left) expect(ELSEWHERE, `${x.key}(${x.v.evaluatorSpec.type})는 틀린 입력을 만드는 방법이 없다`).toContain(x.questId);
  });

  it('6단계에서 더한 11개 과제의 모든 판본이 대상이다', () => {
    for (const id of SIXTH) {
      const q = QUESTS.find((x) => x.questId === id);
      expect(q, id).toBeDefined();
      for (const vid of q!.variantIds as string[]) expect(COVERED.map((x) => x.key), `${id}/${vid}`).toContain(`${id}/${vid}`);
    }
    expect(COVERED.filter((x) => SIXTH.includes(x.questId))).toHaveLength(18);
  });

  it('판본마다 일곱 가지 사례 가운데 이 판정기가 보는 것은 모두 만들어진다(빠진 것이 없다)', () => {
    for (const x of COVERED) {
      const axes = new Set(casesOf(x).map((c) => c.axis));
      const type = x.v.evaluatorSpec.type as string;
      // 화음 판정기는 길이를 보지 않는다. 나머지 다섯 가지는 모든 판정기에 있다
      const want: Axis[] = type === 'rhythmPlacement' ? ['omission', 'extra', 'order', 'octave', 'duration', 'notation'] : ['omission', 'extra', 'order', 'octave', 'notation'];
      for (const a of want) expect(axes.has(a), `${x.key}에 '${a}' 사례가 없다`).toBe(true);
    }
  });
});

describe('11.2의 2: 정답을 일부러 틀리게 바꾸면 기대한 설명이 나온다', () => {
  const ALL = COVERED.flatMap((x) => casesOf(x).map((c) => [`${x.key} · ${c.axis} · ${c.what}`, x, c] as const));

  it.each(ALL)('%s', (_name, x, c) => {
    const spec = x.v.evaluatorSpec;
    const r = evaluate(spec, c.input, x.v.score as Score);
    const texts = renderAll(r.issues);
    const codes = r.issues.map((i) => i.code);
    if (c.passes) {
      expect(codes, '이 과제가 보지 않는다고 정한 점인데 설명이 나왔어요').toEqual([]);
      expect(r.passed).toBe(true);
      return;
    }
    expect(r.passed, '틀린 답이 통과했어요').toBe(false);
    expect(texts.length).toBeGreaterThan(0);
    for (const code of c.codes ?? []) expect(codes, `기대한 설명 코드 ${code}`).toContain(code);
    if (c.anyOf) expect(c.anyOf.some((code) => codes.includes(code)), `기대한 설명 코드 가운데 하나(${c.anyOf.join(', ')}): ${codes.join(', ')}`).toBe(true);
    for (const code of c.not ?? []) expect(codes, `나오면 안 되는 설명 코드 ${code}`).not.toContain(code);
    // 문장: 비어 있지 않고, 채우지 못한 자리('{…}')나 이상한 값이 없다
    for (const t of texts) {
      expect(t.trim().length, '빈 설명').toBeGreaterThan(0);
      expect(t, `채우지 못한 자리나 이상한 값: ${t}`).not.toMatch(/[{}]|undefined|NaN|null|Infinity/);
    }
    const all = texts.join('\n');
    for (const s of c.text ?? []) expect(all, `설명에 '${s}'이 들어 있어야 해요:\n${all}`).toContain(s);
    // 첫 설명은 틀린 첫 자리를 가리킨다
    if (c.firstWhere !== undefined) expect(texts[0], `첫 설명이 '${c.firstWhere}'를 가리켜야 해요: ${texts[0]}`).toContain(c.firstWhere);
    // 같은 입력이면 같은 설명이다(W-3)
    expect(renderAll(evaluate(spec, c.input, x.v.score as Score).issues)).toEqual(texts);
    if (!SAMPLE_BAD.has(x.key)) SAMPLE_BAD.set(x.key, c.input);
  });
});

describe('11.2의 2: 음소거로 한 시도는 틀린 시도가 아니다(W-8)', () => {
  const muted = { tempoBpm: null, originalTempoBpm: null, assistUsed: false, soundState: 'muted' as const, soundPlayed: false };

  it.each(COVERED.map((x) => [x.key, x] as const))('%s', (_name, x) => {
    const spec = x.v.evaluatorSpec;
    const score = x.v.score as Score;
    const base = { attemptId: 'a-1', questId: x.questId, variantId: x.variantId, contentVersion: 'test' };
    // 정답을 소리 없이 하면 통과로 적히지만 소리를 듣고 확인한 성과로는 세지 않는다
    const pass = makeAttemptResult({ ...base, evaluation: evaluate(spec, answerInput(x.v), score), context: muted });
    expect(pass.resultType).toBe('passed');
    expect(pass.hearing).toBe('notMeasured');
    expect(pass.notMeasured).toContain('hearing');
    expect(pass.technical).toBeNull();
    expect(isHearingSuccess(pass)).toBe(false);
    // 틀린 답은 소리를 껐어도 고칠 곳이 있는 시도로 적히고 설명이 남는다. 소리가 꺼진 것이 이유로 적히지 않는다
    const wrong = casesOf(x).find((c) => !c.passes)!;
    const miss = makeAttemptResult({ ...base, evaluation: evaluate(spec, wrong.input, score), context: muted });
    expect(miss.resultType).toBe('needsRevision');
    expect(isMusicalMiss(miss)).toBe(true);
    expect(miss.issues.length).toBeGreaterThan(0);
    expect(miss.hearing).toBe('notMeasured');
    expect(miss.technical).toBeNull();
    expect(renderAll(miss.issues).join('\n')).not.toMatch(/소리|음소거|꺼/);
  });
});
