// 5-6 저장한 곡(내 곡, 설계서 4.9, 6.1, 6.5): 읽기, 저장, 이름 바꾸기, 지우기, 소리 조각 놓기.
import { describe, expect, it } from 'vitest';
import {
  CREATION_BAR_TICKS,
  CREATION_NAME_MAX,
  EMPTY_MELODY_MESSAGE,
  FULL_MESSAGE,
  MAX_CREATIONS,
  addCreation,
  creationNoteCount,
  creationPlayback,
  creationScore,
  defaultName,
  describeCreation,
  melodyKey,
  nextCreationId,
  normalizeName,
  parseCreations,
  pieceInsertEdit,
  readEvents,
  removeCreation,
  renameCreation,
} from '@/domain/creation';
import type { Creation } from '@/domain/creation';
import { ChallengeSession } from '@/domain/session';
import { note, rest } from './helpers';

const STAGE = 'inst.village.ensemble-stage';
const NOW = '2026-11-11T09:00:00.000Z';

/** C4 D4 E4 G4 (한 마디), 둘째 마디는 쉼표 */
const melody = () => [note('a', 0, 0, 960, 'C4'), note('b', 0, 960, 960, 'D4'), note('c', 0, 1920, 960, 'E4'), note('d', 0, 2880, 960, 'G4'), rest('r', 1, 0, 3840)];
const input = (over: Record<string, unknown> = {}) => ({ installationId: STAGE, events: melody(), createdAt: NOW, ...over });
const PITCHES = ['C4', 'D4', 'E4', 'G4', 'A4'];
/** 읽기를 거친(해석된 음이 든) 사건들. 틀리면 시험이 멈춘다 */
const eventsOf = (raw: unknown): Creation['events'] => {
  const r = readEvents(raw);
  if (!r.ok) throw new Error(r.reason);
  return r.events;
};
/** n번째 곡: 세 마디의 첫 박에 음 하나씩(5진법으로 n을 적은 것). 곡마다 가락이 다르다 */
const made = (n: number, over: Partial<Creation> = {}): Creation => ({
  creationId: `creation-${n}`,
  name: `곡 ${n}`,
  installationId: STAGE,
  createdAt: NOW,
  events: eventsOf([note(`e${n}`, 0, 0, 960, PITCHES[n % 5]!), note(`f${n}`, 1, 0, 960, PITCHES[Math.floor(n / 5) % 5]!), note(`g${n}`, 2, 0, 960, PITCHES[Math.floor(n / 25) % 5]!)]),
  ...over,
});

describe('이름', () => {
  it('앞뒤 빈칸을 자르고 가운데 빈칸은 하나로 한다', () => {
    expect(normalizeName('  나의   첫  곡 ')).toEqual({ ok: true, name: '나의 첫 곡' });
  });
  it('비어 있거나 20자를 넘으면 안 된다', () => {
    expect(normalizeName('   ')).toMatchObject({ ok: false, code: 'NAME_EMPTY' });
    expect(normalizeName('가'.repeat(CREATION_NAME_MAX + 1))).toMatchObject({ ok: false, code: 'NAME_LONG' });
    expect(normalizeName('가'.repeat(CREATION_NAME_MAX))).toMatchObject({ ok: true });
  });
  it('기본 이름은 아직 쓰지 않은 가장 작은 번호다', () => {
    expect(defaultName([])).toBe('내 곡 1');
    expect(defaultName([{ name: '내 곡 1' }, { name: '내 곡 3' }])).toBe('내 곡 2');
    expect(defaultName([{ name: '나의 곡' }])).toBe('내 곡 1');
  });
  it('새 번호는 가장 큰 번호 다음이다(지운 번호를 다시 쓰지 않는다)', () => {
    expect(nextCreationId([])).toBe('creation-1');
    expect(nextCreationId([{ creationId: 'creation-1' }, { creationId: 'creation-4' }])).toBe('creation-5');
  });
});

describe('가락 읽기(readEvents)', () => {
  it('올바른 가락은 해석된 음(resolvedPitch)과 함께 시간 순서로 읽힌다', () => {
    const r = readEvents([...melody()].reverse());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.eventId)).toEqual(['a', 'b', 'c', 'd', 'r']);
    const notes = r.events.filter((e) => e.type === 'note');
    expect(notes.map((e) => (e.type === 'note' ? e.resolvedPitch?.midi : null))).toEqual([60, 62, 64, 67]);
  });
  it('변화표는 해석에 반영된다', () => {
    const r = readEvents([note('s', 0, 0, 960, 'F#4')]);
    expect(r.ok && r.events[0]!.type === 'note' && r.events[0]!.resolvedPitch?.midi).toBe(66);
  });
  it('연음 묶음 표시(groupId)는 버린다', () => {
    const r = readEvents([note('g', 0, 0, 960, 'C4', { groupId: 'x' })]);
    expect(r.ok && 'groupId' in r.events[0]!).toBe(false);
  });
  it('틀린 사건은 이유와 함께 거절한다', () => {
    const bad = (mutate: (e: Record<string, any>[]) => void): string => {
      const raw = JSON.parse(JSON.stringify(melody()));
      mutate(raw);
      const r = readEvents(raw);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.reason;
    };
    expect(readEvents('x')).toMatchObject({ ok: false });
    expect(readEvents([42])).toMatchObject({ ok: false });
    expect(bad((e) => (e[0]!['eventId'] = ''))).toMatch(/eventId/);
    expect(bad((e) => (e[1]!['eventId'] = 'a'))).toMatch(/겹쳐요/);
    expect(bad((e) => (e[0]!['voiceId'] = 'v2'))).toMatch(/성부/);
    expect(bad((e) => (e[0]!['staffId'] = 's2'))).toMatch(/성부/);
    expect(bad((e) => (e[0]!['measureIndex'] = 4))).toMatch(/마디/);
    expect(bad((e) => (e[0]!['measureIndex'] = -1))).toMatch(/마디/);
    expect(bad((e) => (e[0]!['onsetTicks'] = CREATION_BAR_TICKS))).toMatch(/시작/);
    expect(bad((e) => (e[0]!['onsetTicks'] = 1.5))).toMatch(/시작/);
    expect(bad((e) => (e[0]!['durationTicks'] = 0))).toMatch(/길이/);
    expect(bad((e) => (e[3]!['durationTicks'] = 1920))).toMatch(/길이/); // 마디를 넘는다
    expect(bad((e) => (e[0]!['type'] = 'chord'))).toMatch(/종류/);
    expect(bad((e) => (e[0]!['writtenPitch'].letter = 'H'))).toMatch(/음이 틀려요/);
    expect(bad((e) => (e[0]!['writtenPitch'].octave = 12))).toMatch(/음이 틀려요/);
    expect(bad((e) => (e[0]!['writtenPitch'].accidental = 'wavy'))).toMatch(/변화표/);
    expect(bad((e) => (e[1]!['onsetTicks'] = 480))).toMatch(/겹쳐요/); // 같은 성부의 두 음이 겹친다
  });
  it('너무 높거나 낮은 음은 거절한다', () => {
    expect(readEvents([note('lo', 0, 0, 960, 'C0')])).toMatchObject({ ok: false });
    expect(readEvents([note('hi', 0, 0, 960, 'C9')])).toMatchObject({ ok: false });
  });
});

describe('저장한 곡 읽기(parseCreations)', () => {
  const good = (n: number): Record<string, unknown> => JSON.parse(JSON.stringify(made(n)));
  it('저장했다가 읽으면 같다', () => {
    const list = [made(1), made(2)];
    expect(parseCreations(JSON.parse(JSON.stringify(list)))).toEqual({ creations: list, warnings: [] });
  });
  it('없거나 목록이 아니면 빈 목록이다', () => {
    expect(parseCreations(undefined)).toEqual({ creations: [], warnings: [] });
    expect(parseCreations(null)).toEqual({ creations: [], warnings: [] });
    expect(parseCreations({}).creations).toEqual([]);
    expect(parseCreations({}).warnings).toHaveLength(1);
  });
  it('읽을 수 없는 곡만 건너뛰고 이유를 남긴다', () => {
    const noNotes = { ...good(4), events: [{ ...rest('r', 0, 0, 3840) }] };
    const r = parseCreations([good(1), 'x', { ...good(2), creationId: 'song' }, { ...good(3), installationId: '' }, noNotes, { ...good(5), events: 'bad' }, good(6)]);
    expect(r.creations.map((c) => c.creationId)).toEqual(['creation-1', 'creation-6']);
    expect(r.warnings).toHaveLength(5);
  });
  it('번호가 겹치면 먼저 나온 것만 둔다', () => {
    const r = parseCreations([good(1), { ...good(2), creationId: 'creation-1' }]);
    expect(r.creations.map((c) => c.name)).toEqual(['곡 1']);
    expect(r.warnings).toHaveLength(1);
  });
  it('이름이 틀리면 가락은 살리고 기본 이름으로 바꾼다', () => {
    const r = parseCreations([{ ...good(1), name: '' }, { ...good(2), name: 42 }, { ...good(3), name: '가'.repeat(30) }]);
    expect(r.creations.map((c) => c.name)).toEqual(['내 곡 1', '내 곡 2', '내 곡 3']);
    expect(r.warnings).toHaveLength(3);
  });
  it('번호 순서로 놓는다', () => {
    expect(parseCreations([good(10), good(2), good(1)]).creations.map((c) => c.creationId)).toEqual(['creation-1', 'creation-2', 'creation-10']);
  });
});

describe('저장하기(addCreation)', () => {
  it('새 곡은 기본 이름과 새 번호로 더해지고 넘긴 목록은 그대로다', () => {
    const list: Creation[] = [];
    const r = addCreation(list, input());
    expect(r.ok && !r.duplicate).toBe(true);
    if (!r.ok) return;
    expect(r.creation).toMatchObject({ creationId: 'creation-1', name: '내 곡 1', installationId: STAGE, createdAt: NOW });
    expect(r.creations).toHaveLength(1);
    expect(list).toHaveLength(0);
    expect(creationNoteCount(r.creation)).toBe(4);
  });
  it('이름을 주면 그 이름이다', () => {
    const r = addCreation([], input({ name: '  저녁 노래 ' }));
    expect(r.ok && r.creation.name).toBe('저녁 노래');
    expect(addCreation([], input({ name: '' }))).toMatchObject({ ok: false, code: 'NAME_EMPTY' });
    expect(addCreation([], input({ name: '가'.repeat(25) }))).toMatchObject({ ok: false, code: 'NAME_LONG' });
  });
  it('음이 하나도 없으면 저장하지 않는다(쉼표만이어도)', () => {
    expect(addCreation([], input({ events: [] }))).toEqual({ ok: false, code: 'EMPTY', message: EMPTY_MELODY_MESSAGE });
    expect(addCreation([], input({ events: [rest('r', 0, 0, 3840)] }))).toMatchObject({ ok: false, code: 'EMPTY' });
  });
  it('읽을 수 없는 가락은 저장하지 않는다', () => {
    expect(addCreation([], input({ events: [note('x', 9, 0, 960, 'C4')] }))).toMatchObject({ ok: false, code: 'INVALID' });
  });
  it('이미 저장한 같은 가락은 새로 만들지 않고 그 곡을 돌려준다(사건 id가 달라도)', () => {
    const first = addCreation([], input());
    if (!first.ok) throw new Error('저장 실패');
    const renamedEvents = melody().map((e) => ({ ...e, eventId: `z-${e.eventId}` }));
    const again = addCreation(first.creations, input({ events: renamedEvents }));
    expect(again).toMatchObject({ ok: true, duplicate: true });
    if (!again.ok) return;
    expect(again.creation.creationId).toBe('creation-1');
    expect(again.creations).toHaveLength(1);
  });
  it('조금이라도 다른 가락은 새 곡이다', () => {
    const first = addCreation([], input());
    if (!first.ok) throw new Error('저장 실패');
    const other = [...melody().slice(0, 3), note('d', 0, 2880, 960, 'A4'), rest('r', 1, 0, 3840)];
    const r = addCreation(first.creations, input({ events: other }));
    expect(r.ok && !r.duplicate && r.creation.creationId).toBe('creation-2');
  });
  it('번호는 가장 큰 번호 다음이다: 가운데 번호를 지워도 다시 쓰지 않는다', () => {
    let list: Creation[] = [];
    for (const pitch of ['C4', 'D4', 'E4']) {
      const r = addCreation(list, input({ events: [note(`n-${pitch}`, 0, 0, 960, pitch)] }));
      if (!r.ok) throw new Error('저장 실패');
      list = r.creations;
    }
    expect(list.map((c) => c.creationId)).toEqual(['creation-1', 'creation-2', 'creation-3']);
    const withoutMiddle = removeCreation(list, 'creation-2');
    const r = addCreation(withoutMiddle, input({ events: [note('n', 0, 0, 960, 'G4')] }));
    expect(r.ok && r.creation.creationId).toBe('creation-4');
  });
  it(`${MAX_CREATIONS}곡이 차면 더 저장하지 않는다`, () => {
    const full = Array.from({ length: MAX_CREATIONS }, (_, i) => made(i + 1));
    expect(new Set(full.map((c) => melodyKey(c.events))).size).toBe(MAX_CREATIONS);
    expect(addCreation(full, input())).toEqual({ ok: false, code: 'FULL', message: FULL_MESSAGE });
    // 이미 저장한 가락은 가득 차도 그 곡을 돌려준다
    expect(addCreation(full, input({ events: full[0]!.events }))).toMatchObject({ ok: true, duplicate: true });
  });
});

describe('이름 바꾸기와 지우기', () => {
  const list = [made(1), made(2)];
  it('이름만 바뀌고 가락은 그대로다', () => {
    const r = renameCreation(list, 'creation-2', ' 새 이름 ');
    expect(r.ok && r.creations.map((c) => c.name)).toEqual(['곡 1', '새 이름']);
    expect(r.ok && r.creations[1]!.events).toEqual(list[1]!.events);
  });
  it('없는 곡이나 틀린 이름은 거절한다', () => {
    expect(renameCreation(list, 'creation-9', 'x')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(renameCreation(list, 'creation-1', ' ')).toMatchObject({ ok: false, code: 'NAME_EMPTY' });
    expect(renameCreation(list, 'creation-1', '가'.repeat(21))).toMatchObject({ ok: false, code: 'NAME_LONG' });
  });
  it('지우면 그 곡만 빠지고, 없는 번호는 그대로다', () => {
    expect(removeCreation(list, 'creation-1').map((c) => c.creationId)).toEqual(['creation-2']);
    expect(removeCreation(list, 'creation-9')).toEqual(list);
  });
});

describe('가락의 지문과 재생', () => {
  it('사건 id와 쓴 순서가 달라도 같은 가락이면 지문이 같다', () => {
    const a = melody();
    const b = [...melody()].reverse().map((e) => ({ ...e, eventId: `q-${e.eventId}` }));
    expect(melodyKey(a)).toBe(melodyKey(b));
  });
  it('음높이, 위치, 길이, 쉼표가 다르면 지문이 다르다(쉼표도 가락을 적은 것의 일부다)', () => {
    const base = melodyKey(melody());
    expect(melodyKey([...melody().slice(0, 3), note('d', 0, 2880, 960, 'A4'), melody()[4]!])).not.toBe(base);
    expect(melodyKey([...melody().slice(0, 3), note('d', 0, 2880, 480, 'G4'), melody()[4]!])).not.toBe(base);
    expect(melodyKey([...melody().slice(0, 3), note('d', 0, 2400, 960, 'G4'), melody()[4]!])).not.toBe(base);
    expect(melodyKey(melody().slice(0, 4))).not.toBe(base);
  });
  it('재생 내용: 음만 나오고 쉼표는 길이에 들어 있다', () => {
    const pb = creationPlayback({ events: eventsOf(melody()) });
    expect(pb.notes.map((n) => n.midi)).toEqual([60, 62, 64, 67]);
    expect(pb.lengthTicks).toBe(4 * CREATION_BAR_TICKS);
    expect(pb.tempoBpm).toBe(80);
    expect(creationScore(melody()).measureCount).toBe(4);
  });
  it('수첩에 적는 한 줄', () => {
    expect(describeCreation({ events: melody() })).toBe('4마디 · 음 4개');
  });
});

describe('소리 조각을 마디에 놓기(pieceInsertEdit)', () => {
  const piece = [
    { midi: 60, onsetTicks: 0, durationTicks: 960 },
    { midi: 62, onsetTicks: 960, durationTicks: 960 },
    { midi: 64, onsetTicks: 1920, durationTicks: 960 },
    { midi: 67, onsetTicks: 2880, durationTicks: 960 },
  ];
  it('편집 하나(batch)이고 사건 id는 idBase 뒤에 번호가 붙는다', () => {
    const edit = pieceInsertEdit({ events: [] }, piece, 1, 'p-disc-1');
    expect(edit?.type).toBe('batch');
    if (edit?.type !== 'batch') return;
    expect(edit.edits.map((e) => e.type)).toEqual(['addEvent', 'addEvent', 'addEvent', 'addEvent']);
    const ids = edit.edits.map((e) => (e.type === 'addEvent' ? e.event.eventId : ''));
    expect(ids).toEqual(['p-disc-1-1', 'p-disc-1-2', 'p-disc-1-3', 'p-disc-1-4']);
  });
  it('그 마디에 있던 음과 쉼표는 걷어 내고 놓는다. 다른 마디는 건드리지 않는다', () => {
    const existing = [note('x', 1, 0, 960, 'A4'), rest('y', 1, 960, 2880), note('z', 0, 0, 960, 'C4')];
    const edit = pieceInsertEdit({ events: existing }, piece, 1, 'p');
    if (edit?.type !== 'batch') throw new Error('편집이 아니에요');
    const removed = edit.edits.filter((e) => e.type === 'removeEvent').map((e) => (e.type === 'removeEvent' ? e.eventId : ''));
    expect(removed.sort()).toEqual(['x', 'y']);
  });
  it('세션에 적용하면 그 마디가 조각의 가락이 되고, 실행 취소 한 번으로 되돌아간다', () => {
    const s = new ChallengeSession();
    s.openChallenge('song.short-piece', 'one-voice', { tempoBpm: 80 });
    s.apply({ type: 'addEvent', event: note('old', 2, 0, 960, 'A4') });
    const edit = pieceInsertEdit(s.content(), piece, 2, 'p-a');
    if (!edit) throw new Error('편집이 없어요');
    s.apply(edit);
    expect(s.content().events.filter((e) => e.measureIndex === 2).map((e) => e.eventId)).toEqual(['p-a-1', 'p-a-2', 'p-a-3', 'p-a-4']);
    // 같은 마디에 같은 조각을 또 놓아도 겹치지 않고, 바뀐 것이 없으니 실행 취소 기록도 늘지 않는다
    const again = pieceInsertEdit(s.content(), piece, 2, 'p-a');
    if (!again) throw new Error('편집이 없어요');
    s.apply(again);
    expect(s.content().events.filter((e) => e.measureIndex === 2)).toHaveLength(4);
    expect(s.undo()).toBe(true);
    expect(s.content().events.map((e) => e.eventId)).toEqual(['old']);
  });
  it('음이 놓일 수 없으면 null이다', () => {
    expect(pieceInsertEdit({ events: [] }, piece, 4, 'p')).toBeNull();
    expect(pieceInsertEdit({ events: [] }, piece, -1, 'p')).toBeNull();
    expect(pieceInsertEdit({ events: [] }, [{ midi: 61, onsetTicks: 0, durationTicks: 960 }], 0, 'p')).toBeNull(); // 검은 건반
    expect(pieceInsertEdit({ events: [] }, [{ midi: 60, onsetTicks: 3000, durationTicks: 960 }], 0, 'p')).toBeNull(); // 마디를 넘는다
    // 다른 마디가 이미 그 id를 쓰고 있으면 쓸 수 없다
    expect(pieceInsertEdit({ events: [note('p-1', 0, 0, 960, 'C4')] }, piece, 1, 'p')).toBeNull();
  });
});
