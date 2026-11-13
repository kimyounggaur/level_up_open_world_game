// 6단계 '만듦'(설계서 4.9, 6.1, 6.5): 합주 무대의 자유 가락을 저장한 것이 '내 곡'이다.
// 자유 가락은 4마디, 4/4, 한 성부다. 음과 쉼표, 그리고 찾은 소리 조각을 놓는다. 판정하지 않는다.
// 저장한 곡은 explorationState.creations에 들어간다(10.6). 이 파일은 순수하다: 읽고(parseCreations), 더하고, 이름을 바꾸고, 지우는 계산만 한다.
// 지우기는 사람이 수첩에서 직접 하는 일이다(6.5). 앱이 스스로 지우거나 줄이는 일은 없다(W-6).
import { LETTERS } from './pitch';
import type { Accidental } from './pitch';
import { scoreToPlayback } from './playback';
import type { Playback } from './playback';
import { resolveScore, validateScore } from './score';
import type { NoteEvent, Score, ScoreEvent } from './score';
import type { DraftContent, DraftEdit } from './session';
import { measureTicks } from './time';

// ───── 틀 ─────
export const CREATION_MEASURES = 4;
export const CREATION_METER = '4/4';
export const CREATION_TEMPO_BPM = 80;
export const CREATION_STAFF_ID = 's1';
export const CREATION_VOICE_ID = 'v1';
/** 저장할 수 있는 곡의 수. 저장 크기가 끝없이 커지지 않게 한다 */
export const MAX_CREATIONS = 30;
export const CREATION_NAME_MAX = 20;
export const DEFAULT_NAME_PREFIX = '내 곡';
/** 자유 가락의 틀이 되는 한 마디의 틱(4/4) */
export const CREATION_BAR_TICKS = measureTicks(CREATION_METER);

const ID_RE = /^creation-(\d+)$/;
const ACCIDENTALS: readonly (Accidental | null)[] = [null, 'sharp', 'flat', 'natural', 'doubleSharp', 'doubleFlat'];

export interface Creation {
  /** creation-1, creation-2 … (지워도 번호를 다시 쓰지 않는 것은 아니다: 가장 큰 번호 다음 번호를 쓴다) */
  creationId: string;
  /** 사람이 읽는 이름(1~20자). 수첩에서 바꿀 수 있다 */
  name: string;
  /** 만든 자리(합주 무대 설치물 id) */
  installationId: string;
  /** 저장한 때(ISO 8601). 보여 주기만 하고 순서는 번호로 정한다 */
  createdAt: string;
  /** 한 성부 4마디의 음과 쉼표. 해석된 음(resolvedPitch)이 들어 있다 */
  events: ScoreEvent[];
}

/** 자유 가락의 악보 틀(목표 악보가 아니라 재생과 해석을 위한 틀) */
export function creationFrame(): Omit<Score, 'events'> {
  return {
    PPQ: 960,
    tuning: '12TET',
    octaveConvention: 'C4=MIDI60',
    tempoReference: 'quarter',
    tempoBpm: CREATION_TEMPO_BPM,
    meter: CREATION_METER,
    measureCount: CREATION_MEASURES,
    staves: [{ staffId: CREATION_STAFF_ID, clef: 'treble', keySignature: 0 }],
    voices: [{ voiceId: CREATION_VOICE_ID, staffId: CREATION_STAFF_ID }],
  };
}

export const creationScore = (events: readonly ScoreEvent[]): Score => ({ ...creationFrame(), events: events.map((e) => ({ ...e })) });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
/** 글자 수(한글 한 글자도 하나로 센다) */
const lengthOf = (s: string): number => [...s].length;

// ───── 이름 ─────
export type NameResult = { ok: true; name: string } | { ok: false; code: 'NAME_EMPTY' | 'NAME_LONG'; message: string };

/** 앞뒤 빈칸을 자르고 가운데의 여러 빈칸을 하나로 한다. 비어 있거나 20자를 넘으면 안 된다 */
export function normalizeName(raw: string): NameResult {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return { ok: false, code: 'NAME_EMPTY', message: '이름을 적어 주세요.' };
  if (lengthOf(name) > CREATION_NAME_MAX) return { ok: false, code: 'NAME_LONG', message: `이름은 ${CREATION_NAME_MAX}글자까지 적을 수 있어요.` };
  return { ok: true, name };
}

/** 아직 쓰지 않은 가장 작은 번호의 이름: 내 곡 1, 내 곡 2 … */
export function defaultName(list: readonly Pick<Creation, 'name'>[]): string {
  const used = new Set(list.map((c) => c.name));
  for (let n = 1; ; n++) if (!used.has(`${DEFAULT_NAME_PREFIX} ${n}`)) return `${DEFAULT_NAME_PREFIX} ${n}`;
}

/** 새 곡의 번호: 가장 큰 번호 다음. 지운 번호를 다시 쓰지 않는다 */
export function nextCreationId(list: readonly Pick<Creation, 'creationId'>[]): string {
  let max = 0;
  for (const c of list) {
    const m = ID_RE.exec(c.creationId);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `creation-${max + 1}`;
}

// ───── 사건 읽기 ─────

/** 사건 하나를 읽는다. 틀이면 이유를 글로 돌려준다. 음의 해석(resolvedPitch)은 뒤에서 다시 계산하므로 여기서는 믿지 않는다 */
function readEvent(raw: unknown): ScoreEvent | string {
  if (!isObj(raw)) return '사건이 객체가 아니에요';
  const eventId = raw['eventId'];
  if (typeof eventId !== 'string' || eventId.length === 0) return 'eventId가 없어요';
  if (raw['voiceId'] !== CREATION_VOICE_ID || raw['staffId'] !== CREATION_STAFF_ID) return `${eventId}: 성부나 보표가 틀려요`;
  const measureIndex = raw['measureIndex'];
  const onsetTicks = raw['onsetTicks'];
  const durationTicks = raw['durationTicks'];
  if (!isInt(measureIndex) || measureIndex < 0 || measureIndex >= CREATION_MEASURES) return `${eventId}: 마디가 범위 밖이에요`;
  if (!isInt(onsetTicks) || onsetTicks < 0 || onsetTicks >= CREATION_BAR_TICKS) return `${eventId}: 시작 위치가 틀려요`;
  if (!isInt(durationTicks) || durationTicks <= 0 || onsetTicks + durationTicks > CREATION_BAR_TICKS) return `${eventId}: 길이가 틀려요`;
  const base = { eventId, voiceId: CREATION_VOICE_ID, staffId: CREATION_STAFF_ID, measureIndex, onsetTicks, durationTicks };
  if (raw['type'] === 'rest') return { ...base, type: 'rest' };
  if (raw['type'] !== 'note') return `${eventId}: 종류가 틀려요`;
  const wp = raw['writtenPitch'];
  if (!isObj(wp) || typeof wp['letter'] !== 'string' || !LETTERS.includes(wp['letter'] as never) || !isInt(wp['octave']) || wp['octave'] < 0 || wp['octave'] > 9) return `${eventId}: 음이 틀려요`;
  const accidental = wp['accidental'] === undefined ? null : wp['accidental'];
  if (!ACCIDENTALS.includes(accidental as never)) return `${eventId}: 변화표가 틀려요`;
  return { ...base, type: 'note', writtenPitch: { letter: wp['letter'] as NoteEvent['writtenPitch']['letter'], accidental: accidental as Accidental | null, octave: wp['octave'] } };
}

/**
 * 사건들을 읽어 틀에 맞는 목록으로 만든다(음은 조표 없는 제자리 해석으로 확정). 하나라도 틀리면 이유를 돌려준다.
 * 마디 안 겹침과 같은 구조 오류도 여기서 잡는다. 연음 묶음 표시(groupId)는 자유 가락에 쓰지 않으므로 버린다.
 */
export function readEvents(raw: unknown): { ok: true; events: ScoreEvent[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: '사건 목록이 아니에요' };
  const events: ScoreEvent[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    const e = readEvent(r);
    if (typeof e === 'string') return { ok: false, reason: e };
    if (ids.has(e.eventId)) return { ok: false, reason: `사건 id가 겹쳐요: ${e.eventId}` };
    ids.add(e.eventId);
    events.push(e);
  }
  const score = creationScore(events);
  const issues = validateScore(score);
  if (issues.length > 0) return { ok: false, reason: issues[0]!.message };
  let resolved: Score;
  try {
    resolved = resolveScore(score);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  for (const e of resolved.events) {
    if (e.type === 'note' && !(e.resolvedPitch && e.resolvedPitch.midi >= 21 && e.resolvedPitch.midi <= 108)) return { ok: false, reason: `${e.eventId}: 음이 너무 높거나 낮아요` };
  }
  events.splice(0, events.length, ...resolved.events);
  events.sort((a, b) => a.measureIndex - b.measureIndex || a.onsetTicks - b.onsetTicks || a.eventId.localeCompare(b.eventId));
  return { ok: true, events };
}

const noteCount = (events: readonly ScoreEvent[]): number => events.filter((e) => e.type === 'note').length;
export const creationNoteCount = (c: Pick<Creation, 'events'>): number => noteCount(c.events);

/** 수첩에 적는 한 줄: '4마디 · 음 7개' */
export const describeCreation = (c: Pick<Creation, 'events'>): string => `${CREATION_MEASURES}마디 · 음 ${noteCount(c.events)}개`;

/** 같은 가락인가를 가리는 지문. 사건 id와 저장한 때는 보지 않고 마디, 위치, 길이, 소리 높이(쉼표는 r)만 본다 */
export function melodyKey(events: readonly ScoreEvent[]): string {
  const resolved = resolveScore(creationScore(events)).events;
  return resolved
    .map((e) => `${e.measureIndex}:${e.onsetTicks}:${e.durationTicks}:${e.type === 'note' ? (e.resolvedPitch?.midi ?? '?') : 'r'}`)
    .sort()
    .join('|');
}

/** 저장한 곡의 재생 내용(수첩과 무대가 같은 것을 쓴다) */
export function creationPlayback(c: Pick<Creation, 'events'>, tempoBpm: number = CREATION_TEMPO_BPM): Playback {
  return scoreToPlayback(creationScore(c.events), { tempoBpm });
}

/** 곡과 곡 사이에 쉬는 마디 수(잔치 뒤 '내 곡 듣기'에서 곡이 이어 붙지 않게) */
export const SONG_GAP_MEASURES = 1;

/**
 * 저장한 곡들을 차례로 이은 재생(잔치가 끝난 뒤 '내 곡 듣기', 6.4). 곡마다 4마디를 그대로 쓰고 곡 사이에 한 마디를 쉰다.
 * 곡이 없으면 음이 없는 재생이다. 음 id는 곡 순서를 앞에 붙여 겹치지 않게 한다.
 */
export function creationsPlayback(list: readonly Pick<Creation, 'events'>[], tempoBpm: number = CREATION_TEMPO_BPM): Playback {
  const notes: Playback['notes'] = [];
  let offset = 0;
  let tempoReference: Playback['tempoReference'] | null = null;
  list.forEach((c, i) => {
    const p = creationPlayback(c, tempoBpm);
    tempoReference ??= p.tempoReference;
    for (const n of p.notes) notes.push({ ...n, id: `song${i + 1}-${n.id}`, onsetTick: n.onsetTick + offset });
    offset += p.lengthTicks + SONG_GAP_MEASURES * CREATION_BAR_TICKS;
  });
  // 마지막 곡 뒤의 쉼은 재생 길이에 넣지 않는다
  const lengthTicks = list.length === 0 ? 0 : offset - SONG_GAP_MEASURES * CREATION_BAR_TICKS;
  return { notes, lengthTicks, tempoBpm, tempoReference: tempoReference ?? creationPlayback({ events: [] }, tempoBpm).tempoReference };
}

// ───── 저장한 곡 목록 읽기 ─────

/**
 * 저장에서 읽은 값을 곡 목록으로 만든다. 읽을 수 없는 곡은 건너뛰고 이유를 warnings에 남긴다(나머지는 그대로 산다).
 * 이름이 틀렸으면 가락은 살리고 이름만 기본 이름으로 바꾼다. 번호가 겹치면 먼저 나온 것만 둔다. 순서는 번호 순이다.
 */
export function parseCreations(raw: unknown): { creations: Creation[]; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === undefined || raw === null) return { creations: [], warnings };
  if (!Array.isArray(raw)) return { creations: [], warnings: ['explorationState.creations: 목록이 아니라서 비웠어요'] };
  const out: Creation[] = [];
  const ids = new Set<string>();
  raw.forEach((item, i) => {
    const at = `explorationState.creations[${i}]`;
    if (!isObj(item)) return void warnings.push(`${at}: 곡이 객체가 아니라서 건너뛰었어요`);
    const id = item['creationId'];
    if (typeof id !== 'string' || !ID_RE.test(id)) return void warnings.push(`${at}: creationId가 올바르지 않아서 건너뛰었어요`);
    if (ids.has(id)) return void warnings.push(`${at}: 번호가 겹쳐서 건너뛰었어요(${id})`);
    const installationId = item['installationId'];
    if (typeof installationId !== 'string' || installationId.length === 0) return void warnings.push(`${at}: installationId가 없어서 건너뛰었어요`);
    const read = readEvents(item['events']);
    if (!read.ok) return void warnings.push(`${at}: 가락을 읽을 수 없어서 건너뛰었어요(${read.reason})`);
    if (noteCount(read.events) === 0) return void warnings.push(`${at}: 음이 없는 곡이라서 건너뛰었어요`);
    ids.add(id);
    const named = typeof item['name'] === 'string' ? normalizeName(item['name']) : null;
    out.push({
      creationId: id,
      name: named?.ok ? named.name : '',
      installationId,
      createdAt: typeof item['createdAt'] === 'string' ? item['createdAt'] : '',
      events: read.events,
    });
    if (!named?.ok) warnings.push(`${at}: 이름이 올바르지 않아서 기본 이름으로 바꿨어요`);
  });
  out.sort((a, b) => Number(ID_RE.exec(a.creationId)![1]) - Number(ID_RE.exec(b.creationId)![1]));
  for (const c of out) if (c.name === '') c.name = defaultName(out);
  return { creations: out, warnings };
}

// ───── 저장, 이름 바꾸기, 지우기 ─────
export type AddResult =
  | { ok: true; duplicate: boolean; creations: Creation[]; creation: Creation }
  | { ok: false; code: 'EMPTY' | 'FULL' | 'INVALID' | 'NAME_EMPTY' | 'NAME_LONG'; message: string };

export const EMPTY_MELODY_MESSAGE = '음이 하나도 없어서 저장하지 않았어요. 음을 놓은 뒤에 저장해 주세요.';
export const FULL_MESSAGE = `내 곡이 ${MAX_CREATIONS}개로 가득 찼어요. 수첩에서 하나를 지우면 새로 저장할 수 있어요.`;

/**
 * 자유 가락을 새 곡으로 저장한다. 음이 하나도 없으면 저장하지 않고, 이미 저장한 같은 가락이면 새로 만들지 않고 그 곡을 돌려준다(duplicate).
 * 이름을 주지 않으면 '내 곡 N'이다. 넘긴 목록은 바꾸지 않는다.
 */
export function addCreation(list: readonly Creation[], input: { name?: string; installationId: string; events: readonly ScoreEvent[]; createdAt: string }): AddResult {
  const read = readEvents(input.events);
  if (!read.ok) return { ok: false, code: 'INVALID', message: '가락을 읽을 수 없어서 저장하지 않았어요.' };
  if (noteCount(read.events) === 0) return { ok: false, code: 'EMPTY', message: EMPTY_MELODY_MESSAGE };
  const key = melodyKey(read.events);
  const same = list.find((c) => melodyKey(c.events) === key);
  if (same) return { ok: true, duplicate: true, creations: [...list], creation: same };
  if (list.length >= MAX_CREATIONS) return { ok: false, code: 'FULL', message: FULL_MESSAGE };
  let name = defaultName(list);
  if (input.name !== undefined) {
    const n = normalizeName(input.name);
    if (!n.ok) return n;
    name = n.name;
  }
  const creation: Creation = { creationId: nextCreationId(list), name, installationId: input.installationId, createdAt: input.createdAt, events: read.events };
  return { ok: true, duplicate: false, creations: [...list, creation], creation };
}

export type RenameResult = { ok: true; creations: Creation[] } | { ok: false; code: 'NAME_EMPTY' | 'NAME_LONG' | 'NOT_FOUND'; message: string };

export function renameCreation(list: readonly Creation[], creationId: string, rawName: string): RenameResult {
  if (!list.some((c) => c.creationId === creationId)) return { ok: false, code: 'NOT_FOUND', message: '그 곡을 찾을 수 없어요.' };
  const n = normalizeName(rawName);
  if (!n.ok) return n;
  return { ok: true, creations: list.map((c) => (c.creationId === creationId ? { ...c, name: n.name } : c)) };
}

/** 곡을 지운다. 없는 번호이면 목록을 그대로 돌려준다 */
export const removeCreation = (list: readonly Creation[], creationId: string): Creation[] => list.filter((c) => c.creationId !== creationId);

// ───── 소리 조각을 자유 가락에 놓기 ─────
const NATURAL_LETTER: Readonly<Record<number, NoteEvent['writtenPitch']['letter']>> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

/** 소리 조각의 음 하나(마디 처음부터 센 틱) */
export interface PieceNoteLike {
  midi: number;
  onsetTicks: number;
  durationTicks: number;
}

/**
 * 소리 조각을 자유 가락의 한 마디에 놓는 편집(한 번에 하나, 실행 취소 한 칸).
 * 그 마디에 있던 음과 쉼표는 모두 걷어 내고 조각의 음을 놓는다. 조각이 쉬는 박은 비워 둔다.
 * 제자리 음이 아닌 음이 있거나 마디를 벗어나면 null이다(조각은 다장조 5음이라 일어나지 않지만 검사 규칙이 바뀌어도 조용히 틀리지 않게 한다).
 * 사건 id는 `<idBase>-<번호>`다. 같은 마디에 같은 조각을 또 놓아도 걷어 내고 놓으므로 겹치지 않는다.
 */
export function pieceInsertEdit(content: Pick<DraftContent, 'events'>, notes: readonly PieceNoteLike[], measureIndex: number, idBase: string): DraftEdit | null {
  if (!isInt(measureIndex) || measureIndex < 0 || measureIndex >= CREATION_MEASURES) return null;
  const added: ScoreEvent[] = [];
  for (const [i, n] of notes.entries()) {
    const letter = NATURAL_LETTER[((n.midi % 12) + 12) % 12];
    if (!letter || !isInt(n.midi) || n.onsetTicks < 0 || n.durationTicks <= 0 || n.onsetTicks + n.durationTicks > CREATION_BAR_TICKS) return null;
    const octave = Math.floor(n.midi / 12) - 1;
    added.push({
      eventId: `${idBase}-${i + 1}`,
      type: 'note',
      voiceId: CREATION_VOICE_ID,
      staffId: CREATION_STAFF_ID,
      measureIndex,
      onsetTicks: n.onsetTicks,
      durationTicks: n.durationTicks,
      writtenPitch: { letter, accidental: null, octave },
      resolvedPitch: { letter, alter: 0, octave, midi: n.midi },
    });
  }
  const removed = content.events.filter((e) => e.measureIndex === measureIndex && e.voiceId === CREATION_VOICE_ID);
  const replaced = new Set(removed.map((e) => e.eventId));
  // 새 사건의 id가 다른 마디의 사건과 겹치면 그 id는 쓸 수 없다
  if (content.events.some((e) => !replaced.has(e.eventId) && added.some((a) => a.eventId === e.eventId))) return null;
  return { type: 'batch', edits: [...removed.map((e): DraftEdit => ({ type: 'removeEvent', eventId: e.eventId })), ...added.map((event): DraftEdit => ({ type: 'addEvent', event }))] };
}
