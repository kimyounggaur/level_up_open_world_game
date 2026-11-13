// 5-1 시간선의 순수 계산: 길이가 있는 음과 쉼, 셋잇단 묶음(뗏목), 겹침 거절, 지우기. 화면 없이 확인한다.
// Q03(32분음표 여덟 개와 8분 셋잇단)과 Q08(두 성부 합주)의 인수 기준 가운데 화면과 무관한 부분을 덮는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft, evaluatorInputOf } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import { ChallengeSession } from '@/domain/session';
import type { DraftContent } from '@/domain/session';
import { beatWindows, blocksOf, clearOnTimeline, eventCovering, eventText, filledTicks, isTimelineVariant, placeOnTimeline, raftSpanOf, tickLabel, timelineOf, timelinePitches, valueNameOfEvent } from '@/domain/timeline';
import type { Placement, TimelineAt, TimelineMaterial } from '@/domain/timeline';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const q02 = quest('rhythm.rest-in-a-bar');
const q03 = quest('rhythm.short-notes-and-triplets');
const q08 = quest('song.short-piece');
const v03 = q03.variants['thirty-seconds-triplet']!;
const spec03 = timelineOf(v03);

const at = (tick: number, voiceId = 'v1', measureIndex = 0): TimelineAt => ({ voiceId, measureIndex, tick });
const note = (name: string, value: Extract<TimelineMaterial, { kind: 'note' }>['value']): TimelineMaterial => ({ kind: 'note', pitch: p(name), value });
const rest = (value: Extract<TimelineMaterial, { kind: 'rest' }>['value']): TimelineMaterial => ({ kind: 'rest', value });
const raft = (name: string | null): TimelineMaterial => ({ kind: 'tuplet', tuplet: spec03.tuplets[0]!, stone: name ? { kind: 'note', pitch: p(name) } : { kind: 'rest' } });

function open(q: QuestDefinition, variantId: string): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(q.questId, variantId);
  return s;
}

/** 놓기에 성공해야 하는 자리. 성공하면 편집을 적용하고 결과를 돌려준다 */
function put(s: ChallengeSession, spec: ReturnType<typeof timelineOf>, where: TimelineAt, material: TimelineMaterial): Extract<Placement, { ok: true }> {
  const r = placeOnTimeline(spec, s.content(), where, material);
  if (!r.ok) throw new Error(`놓기가 거절됐어요: ${r.text}`);
  s.apply(r.edit);
  return r;
}

/** Q03의 정답을 시간선으로 놓는다: 32분음표 C4 여덟 개, 8분 셋잇단 D4 E4 F4, 2분쉼표 */
function fillQ03(s: ChallengeSession): void {
  for (let i = 0; i < 8; i++) put(s, spec03, at(i * 120), note('C4', 'thirtySecond'));
  put(s, spec03, at(960), raft('D4'));
  put(s, spec03, at(1280), note('E4', 'eighth'));
  put(s, spec03, at(1600), note('F4', 'eighth'));
  put(s, spec03, at(1920), rest('half'));
}

describe('시간선 설정', () => {
  it('Q03은 4/4 한 마디, 32분음표(120틱) 칸에 8분 셋잇단(돌 320틱)이 열린다', () => {
    expect(spec03).toMatchObject({ measureTicks: 3840, measures: 1, beatTicks: 960, cellTicks: 120, unitTicks: 40 });
    expect(spec03.voices).toEqual([{ voiceId: 'v1', staffId: 's1', label: '성부' }]);
    expect(spec03.values).toEqual(['thirtySecond', 'sixteenth', 'eighth', 'quarter', 'half', 'whole']);
    expect(spec03.tuplets).toEqual([{ actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth' }]);
  });

  it('칸이 박 하나인 Q02는 시간선이 아니고, Q03과 Q08의 모든 판본은 시간선이다', () => {
    expect(isTimelineVariant(q02.variants['quarter-rest']!)).toBe(false);
    expect(isTimelineVariant(v03)).toBe(true);
    for (const id of q08.variantIds) expect(isTimelineVariant(q08.variants[id]!)).toBe(true);
  });

  it('Q08은 4마디이고 판본마다 성부와 가장 짧은 음가가 다르다', () => {
    const one = timelineOf(q08.variants['one-voice']!);
    const two = timelineOf(q08.variants['two-voices']!);
    const hard = timelineOf(q08.variants['challenge']!);
    expect([one.measures, one.voices.map((v) => v.voiceId), one.cellTicks]).toEqual([4, ['v1'], 960]);
    expect([two.measures, two.voices.map((v) => v.voiceId), two.cellTicks]).toEqual([4, ['v1', 'v2'], 960]);
    expect([hard.measures, hard.voices.map((v) => v.label), hard.cellTicks]).toEqual([4, ['위 성부', '아래 성부'], 480]);
    expect(one.measures * one.measureTicks).toBe(15360);
    expect(one.values).toEqual(['quarter', 'half', 'whole']);
    expect(hard.values).toEqual(['eighth', 'quarter', 'half', 'whole']);
  });

  it('성부가 없는 판본(음이름 과제 등)에는 시간선이 없다', () => {
    const q01 = quest('pitch.same-note-two-clefs');
    expect(() => timelineOf(q01.variants['middle-c']!)).toThrow('시간선이 없어요');
    expect(isTimelineVariant(q01.variants['middle-c']!)).toBe(false);
  });

  it('박마다 하나씩 확대 창이 있고 음역의 제자리 음을 센다', () => {
    expect(beatWindows(spec03).map((w) => [w.label, w.from, w.to])).toEqual([['1박', 0, 960], ['2박', 960, 1920], ['3박', 1920, 2880], ['4박', 2880, 3840]]);
    expect(timelinePitches(spec03).map((x) => `${x.letter}${x.octave}`)).toEqual(['C4', 'D4', 'E4', 'F4']);
  });
});

describe('음과 쉼 놓기', () => {
  it('32분음표를 칸에 놓으면 120틱짜리 음이 추가되고 말로 알려 준다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    const r = put(s, spec03, at(0), note('C4', 'thirtySecond'));
    expect(r.announce).toBe('1박에 C4 32분음표를 놓았어요.');
    expect(s.content().events).toMatchObject([{ type: 'note', onsetTicks: 0, durationTicks: 120, writtenPitch: { letter: 'C', octave: 4 } }]);
  });

  it('같은 자리에 다시 놓으면 그 사건을 바꾼다(같은 id)', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    const first = put(s, spec03, at(0), note('C4', 'thirtySecond'));
    const second = put(s, spec03, at(0), note('D4', 'thirtySecond'));
    expect(second.eventIds).toEqual(first.eventIds);
    expect(s.content().events).toHaveLength(1);
    expect(second.edit.type).toBe('replaceEvent');
  });

  it('긴 음을 같은 자리에 덮어쓸 수 있다: 32분음표 자리에 8분음표', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(0), note('C4', 'thirtySecond'));
    const r = put(s, spec03, at(0), note('C4', 'eighth'));
    expect(r.edit.type).toBe('replaceEvent');
    expect(s.content().events[0]!.durationTicks).toBe(480);
  });

  it('다른 사건과 겹치면 놓이지 않고 겹친 사건을 사실대로 말한다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    for (let i = 0; i < 8; i++) put(s, spec03, at(i * 120), note('C4', 'thirtySecond'));
    const before = JSON.stringify(s.content());
    const r = placeOnTimeline(spec03, s.content(), at(0), note('C4', 'quarter'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('OVERLAP');
    expect(r.text).toBe('1박에 C4 4분음표를 놓으면 1박 2번째 칸의 C4 32분음표 외 6개와 겹쳐요. 겹친 것을 먼저 비워 주세요.');
    expect(JSON.stringify(s.content())).toBe(before);
  });

  it('쉼표도 겹침 규칙이 같다. 비어 있는 박 하나에는 4분쉼표가 들어간다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(960), rest('quarter'));
    expect(placeOnTimeline(spec03, s.content(), at(1200), rest('eighth')).ok).toBe(false);
    expect(placeOnTimeline(spec03, s.content(), at(1920), rest('quarter')).ok).toBe(true);
  });

  it('칸에 맞지 않는 틱, 마디 선을 넘는 길이, 이 과제에 없는 음가는 이유와 함께 거절한다', () => {
    const grid = placeOnTimeline(spec03, { slots: [], events: [], tuplets: [] }, at(60), note('C4', 'thirtySecond'));
    expect(grid).toMatchObject({ ok: false, code: 'GRID' });
    const bar = placeOnTimeline(spec03, { slots: [], events: [], tuplets: [] }, at(2880), rest('half'));
    expect(bar).toMatchObject({ ok: false, code: 'BARLINE' });
    if (!bar.ok) expect(bar.text).toBe('4박에 2분음표 길이의 쉼표를 놓으면 마디 선을 960틱 넘어요. 마디는 3840틱이에요.');
    const one = timelineOf(q08.variants['one-voice']!);
    const value = placeOnTimeline(one, { slots: [], events: [], tuplets: [] }, at(0), note('C4', 'eighth'));
    expect(value).toMatchObject({ ok: false, code: 'NO_VALUE' });
    if (!value.ok) expect(value.text).toBe('8분음표는 이 과제에서 놓을 수 없어요.');
    expect(placeOnTimeline(spec03, { slots: [], events: [], tuplets: [] }, { voiceId: 'v9', measureIndex: 0, tick: 0 }, rest('whole'))).toMatchObject({ ok: false, code: 'UNKNOWN_VOICE' });
    expect(placeOnTimeline(spec03, { slots: [], events: [], tuplets: [] }, { voiceId: 'v1', measureIndex: 3, tick: 0 }, rest('whole'))).toMatchObject({ ok: false, code: 'BARLINE' });
  });
});

describe('셋잇단 묶음(뗏목)', () => {
  it('묶음은 한 번의 편집(실행 취소 한 칸)으로 돌 셋과 묶음 정보를 함께 놓는다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    const r = put(s, spec03, at(960), raft('D4'));
    expect(r.edit.type).toBe('batch');
    expect(s.undoDepth).toBe(1);
    const c = s.content();
    expect(c.events.map((e) => [e.onsetTicks, e.durationTicks, e.groupId])).toEqual([
      [960, 320, 'g-v1-m0-960'],
      [1280, 320, 'g-v1-m0-960'],
      [1600, 320, 'g-v1-m0-960'],
    ]);
    expect(c.tuplets).toEqual([{ groupId: 'g-v1-m0-960', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: c.events.map((e) => e.eventId) }]);
    expect(r.announce).toBe('2박에 8분 셋잇단음표 묶음을 놓았어요. 돌 3개는 지금 모두 D4예요. 돌을 하나씩 눌러 바꿀 수 있어요.');
    s.undo();
    expect(s.content()).toEqual({ slots: [], events: [], tuplets: [] });
  });

  it('돌 위에 음이나 쉼을 놓으면 그 돌의 내용만 바뀌고 길이와 묶음은 그대로다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(960), raft('D4'));
    const r = put(s, spec03, at(1280), note('E4', 'eighth'));
    expect(r.edit.type).toBe('replaceEvent');
    expect(r.announce).toBe('2박 둘째 돌의 돌을 E4로 바꿨어요.');
    const stone = s.content().events.find((e) => e.onsetTicks === 1280)!;
    expect(stone).toMatchObject({ durationTicks: 320, groupId: 'g-v1-m0-960', type: 'note', writtenPitch: { letter: 'E' } });
    put(s, spec03, at(1600), rest('eighth'));
    expect(s.content().events.find((e) => e.onsetTicks === 1600)).toMatchObject({ type: 'rest', durationTicks: 320, groupId: 'g-v1-m0-960' });
    expect(s.content().tuplets).toHaveLength(1);
  });

  it('돌과 돌 사이의 틱에는 놓을 수 없다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(960), raft('D4'));
    const r = placeOnTimeline(spec03, s.content(), at(1080), note('E4', 'thirtySecond'));
    expect(r).toMatchObject({ ok: false, code: 'GRID' });
    if (!r.ok) expect(r.text).toBe('2박 2번째 칸은 셋잇단 묶음 안이라 돌의 자리에만 놓을 수 있어요.');
  });

  it('묶음은 박이 시작하는 자리에만 놓인다. 마디 끝을 넘는 자리와 다른 사건과 겹치는 자리도 거절한다', () => {
    const empty: DraftContent = { slots: [], events: [], tuplets: [] };
    const r1 = placeOnTimeline(spec03, empty, at(120), raft('D4'));
    expect(r1).toMatchObject({ ok: false, code: 'RAFT_BEAT' });
    if (!r1.ok) expect(r1.text).toBe('8분 셋잇단음표 묶음은 박이 시작하는 자리에만 놓을 수 있어요.');
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(960), note('C4', 'thirtySecond'));
    const r2 = placeOnTimeline(spec03, s.content(), at(960), raft('D4'));
    expect(r2).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(placeOnTimeline(spec03, empty, at(2880), raft('D4')).ok).toBe(true);
  });

  it('이 판본에 없는 종류의 묶음은 놓을 수 없다', () => {
    const r = placeOnTimeline(spec03, { slots: [], events: [], tuplets: [] }, at(0), { kind: 'tuplet', tuplet: { actualNotes: 5, normalNotes: 4, writtenBaseDuration: 'sixteenth' }, stone: { kind: 'rest' } });
    expect(r).toMatchObject({ ok: false, code: 'NO_TUPLET' });
  });

  it('같은 자리에 묶음을 다시 놓으면 통째로 바뀌고 묶음이 둘로 늘지 않는다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(960), raft('D4'));
    put(s, spec03, at(960), raft(null));
    const c = s.content();
    expect(c.events).toHaveLength(3);
    expect(c.events.every((e) => e.type === 'rest')).toBe(true);
    expect(c.tuplets).toHaveLength(1);
    expect(s.undoDepth).toBe(2);
  });

  it('돌 하나를 지우면 묶음 전체가 지워진다. 보통 음을 지우면 그 음만 지워진다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(0), note('C4', 'thirtySecond'));
    put(s, spec03, at(960), raft('D4'));
    const cleared = clearOnTimeline(spec03, s.content(), at(1400))!;
    expect(cleared.announce).toBe('2박 둘째 돌의 셋잇단 묶음을 통째로 지웠어요.');
    s.apply(cleared.edit);
    expect(s.content().events.map((e) => e.onsetTicks)).toEqual([0]);
    expect(s.content().tuplets).toEqual([]);
    const plain = clearOnTimeline(spec03, s.content(), at(60))!;
    expect(plain.announce).toBe('1박의 C4 32분음표를 지웠어요.');
    s.apply(plain.edit);
    expect(s.content().events).toEqual([]);
    expect(clearOnTimeline(spec03, s.content(), at(60))).toBeNull();
  });
});

describe('읽기: 조각과 말', () => {
  it('박 하나를 확대한 창은 사건 조각과 빈 칸 조각으로 나뉘고 창 밖은 자른다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(0), note('C4', 'thirtySecond'));
    put(s, spec03, at(1920), rest('half'));
    const first = blocksOf(spec03, s.content(), 'v1', 0, 0, 960);
    expect(first.filter((b) => b.kind === 'note')).toHaveLength(1);
    expect(first.filter((b) => b.kind === 'empty')).toHaveLength(7);
    expect(first[0]!.description).toBe('1박, C4 32분음표');
    expect(first[1]!.description).toBe('1박 2번째 칸, 비어 있음');
    // 3박 창에서는 2분쉼표가 3박에서 시작하고 4박으로 이어진다
    const third = blocksOf(spec03, s.content(), 'v1', 0, 1920, 2880);
    expect(third).toHaveLength(1);
    expect(third[0]).toMatchObject({ kind: 'rest', startTick: 1920, endTick: 2880, fullEnd: 3840, continues: { before: false, after: true } });
    const fourth = blocksOf(spec03, s.content(), 'v1', 0, 2880, 3840);
    expect(fourth[0]).toMatchObject({ kind: 'rest', startTick: 2880, endTick: 3840, continues: { before: true, after: false } });
  });

  it('틱 이름과 음가 이름: 돌은 몇째 돌이고 8분 셋잇단음표라고 부른다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    put(s, spec03, at(960), raft('D4'));
    const stone = eventCovering(s.content(), at(1300))!;
    expect(stone.onsetTicks).toBe(1280);
    expect(valueNameOfEvent(s.content(), stone)).toBe('8분 셋잇단음표');
    expect(eventText(s.content(), stone)).toBe('D4 8분 셋잇단음표');
    expect(tickLabel(spec03, 0, 1280, { rafted: true })).toBe('2박 둘째 돌');
    expect(tickLabel(spec03, 0, 1200)).toBe('2박 3번째 칸');
    expect(tickLabel(timelineOf(q08.variants['one-voice']!), 2, 1920)).toBe('3마디 3박');
  });

  it('성부의 한 마디가 얼마나 찼는지 틱으로 센다(셋잇단 돌 3개는 960틱)', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    fillQ03(s);
    expect(filledTicks(s.content(), 'v1', 0)).toBe(3840);
  });
});

describe('Q03 인수 기준(화면 없이)', () => {
  const variant = v03;

  it('32분음표 여덟 개, 8분 셋잇단 D4 E4 F4, 2분쉼표를 시간선으로 놓으면 통과한다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    fillQ03(s);
    const input = evaluatorInputOf(variant, s.content());
    expect(input.type).toBe('rhythmPlacement');
    const result = evaluateDraft(variant, s.content());
    expect(renderAll(result.issues, q03.feedbackRules)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('셋잇단 묶음을 놓지 않고 8분음표 셋을 놓으면 실패한다(길이가 다르다)', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    for (let i = 0; i < 8; i++) put(s, spec03, at(i * 120), note('C4', 'thirtySecond'));
    put(s, spec03, at(960), note('D4', 'eighth'));
    put(s, spec03, at(1440), note('E4', 'eighth'));
    put(s, spec03, at(1920), note('F4', 'eighth'));
    const result = evaluateDraft(variant, s.content());
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('표시만 셋잇단인 480틱 음 세 개는 실패하고 묶음 안의 길이를 알려 준다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    for (let i = 0; i < 8; i++) put(s, spec03, at(i * 120), note('C4', 'thirtySecond'));
    const mk = (id: string, tick: number, pitch: string) => ({ eventId: id, type: 'note' as const, voiceId: 'v1', staffId: 's1', measureIndex: 0, onsetTicks: tick, durationTicks: 480, groupId: 'fake', writtenPitch: { letter: pitch[0] as 'D', accidental: null, octave: 4 } });
    s.apply({ type: 'batch', edits: [
      { type: 'addEvent', event: mk('f1', 960, 'D4') },
      { type: 'addEvent', event: mk('f2', 1440, 'E4') },
      { type: 'addEvent', event: mk('f3', 1920, 'F4') },
      { type: 'setTuplets', tuplets: [{ groupId: 'fake', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['f1', 'f2', 'f3'] }] },
    ] });
    const result = evaluateDraft(variant, s.content());
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('TUPLET_DURATION');
    const text = renderAll(result.issues, q03.feedbackRules).join(' ');
    expect(text).toContain('320틱');
  });

  it('음이 하나 다르면 통과하지 못한다. 쉼표를 빠뜨려도 마찬가지다', () => {
    const s = open(q03, 'thirty-seconds-triplet');
    fillQ03(s);
    put(s, spec03, at(1280), note('G4', 'eighth')); // 돌 E4를 G4로 (음역 밖이지만 판정기는 음 이름으로 비교한다)
    expect(evaluateDraft(variant, s.content()).passed).toBe(false);
    const t = open(q03, 'thirty-seconds-triplet');
    for (let i = 0; i < 8; i++) put(t, spec03, at(i * 120), note('C4', 'thirtySecond'));
    put(t, spec03, at(960), raft('D4'));
    expect(evaluateDraft(variant, t.content()).passed).toBe(false);
  });
});

describe('Q08 시간선 인수 기준(화면 없이)', () => {
  it('한 성부 판본: 4마디 가락을 놓으면 통과하고, 마디를 하나 비우면 통과하지 못한다', () => {
    const variant = q08.variants['one-voice']!;
    const spec = timelineOf(variant);
    const s = open(q08, 'one-voice');
    const events = variant.score.events.filter((e) => e.voiceId === 'v1');
    for (const e of events) {
      const value = e.durationTicks === 1920 ? 'half' : 'quarter';
      const mat = e.type === 'note' ? note(`${e.writtenPitch.letter}${e.writtenPitch.octave}`, value) : rest(value);
      put(s, spec, at(e.onsetTicks, 'v1', e.measureIndex), mat);
    }
    expect(evaluateDraft(variant, s.content()).passed).toBe(true);
    s.apply({ type: 'removeEvent', eventId: s.content().events.at(-1)!.eventId });
    const r = evaluateDraft(variant, s.content());
    expect(r.passed).toBe(false);
  });

  it('두 성부 판본: 위 성부만 끝낸 것은 두 성부를 끝낸 것이 아니다', () => {
    const variant = q08.variants['two-voices']!;
    const spec = timelineOf(variant);
    const s = open(q08, 'two-voices');
    for (const e of variant.score.events.filter((x) => x.voiceId === 'v1')) {
      const value = e.durationTicks === 1920 ? 'half' : 'quarter';
      put(s, spec, at(e.onsetTicks, 'v1', e.measureIndex), note(`${(e as { writtenPitch: { letter: string; octave: number } }).writtenPitch.letter}${(e as { writtenPitch: { octave: number } }).writtenPitch.octave}`, value));
    }
    const upperOnly = evaluateDraft(variant, s.content());
    expect(upperOnly.passed).toBe(false);
    expect(upperOnly.details).toMatchObject({ perVoice: { v1: true, v2: false } });
    expect(renderAll(upperOnly.issues, q08.feedbackRules)[0]).toBe('아래 성부가 아직 없어요.');
  });

  it('성부마다 마디가 따로 센다: 한 성부의 마디 채움이 다른 성부에 섞이지 않는다', () => {
    const variant = q08.variants['two-voices']!;
    const spec = timelineOf(variant);
    const s = open(q08, 'two-voices');
    put(s, spec, at(0, 'v1', 0), note('C4', 'whole'));
    expect(filledTicks(s.content(), 'v1', 0)).toBe(3840);
    expect(filledTicks(s.content(), 'v2', 0)).toBe(0);
    // 아래 성부의 같은 자리는 위 성부와 겹치지 않는다
    expect(placeOnTimeline(spec, s.content(), at(0, 'v2', 0), note('C3', 'whole')).ok).toBe(true);
  });

  it('높은 도전 판본: 8분음표 칸에 8분음표와 쉼표를 놓는다', () => {
    const variant = q08.variants['challenge']!;
    const spec = timelineOf(variant);
    const s = open(q08, 'challenge');
    expect(put(s, spec, at(480, 'v1', 1), note('F4', 'eighth')).announce).toBe('2마디 1박 2번째 칸에 F4 8분음표를 놓았어요.');
    expect(placeOnTimeline(spec, s.content(), at(240, 'v1', 1), note('F4', 'eighth'))).toMatchObject({ ok: false, code: 'GRID' });
  });

  it('높은 도전 판본의 정답 악보 전체를 시간선으로 놓으면 통과한다', () => {
    const variant = q08.variants['challenge']!;
    const spec = timelineOf(variant);
    const s = open(q08, 'challenge');
    const valueOf = (ticks: number) => (ticks === 3840 ? 'whole' : ticks === 1920 ? 'half' : ticks === 960 ? 'quarter' : 'eighth') as 'whole' | 'half' | 'quarter' | 'eighth';
    for (const e of variant.score.events) {
      const v = valueOf(e.durationTicks);
      const mat = e.type === 'note' ? note(`${e.writtenPitch.letter}${e.writtenPitch.octave}`, v) : rest(v);
      put(s, spec, at(e.onsetTicks, e.voiceId, e.measureIndex), mat);
    }
    expect(evaluateDraft(variant, s.content()).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6-5 두 종류의 뗏목(Q18): 8분 셋잇단(한 박)과 4분 셋잇단(두 박). 돌의 이름은 뗏목이 시작한 박과 돌의 순서로 부른다

describe('6-5 두 종류의 뗏목: Q18 셋으로 나눈 물살', () => {
  const q18 = quest('rhythm.triplets');
  const v18 = q18.variants['triplet-eighths-and-quarters']!;
  const spec18 = timelineOf(v18);
  const eighths = spec18.tuplets.find((t) => t.writtenBaseDuration === 'eighth')!;
  const quarters = spec18.tuplets.find((t) => t.writtenBaseDuration === 'quarter')!;
  const raftOf = (t: typeof eighths, name: string | null): TimelineMaterial => ({ kind: 'tuplet', tuplet: t, stone: name ? { kind: 'note', pitch: p(name) } : { kind: 'rest' } });

  it('시간선 설정: 4/4 한 마디, 칸은 8분음표(480틱), 뗏목은 8분 셋잇단과 4분 셋잇단 두 종류가 점수 순서로 열린다', () => {
    expect(spec18).toMatchObject({ measureTicks: 3840, measures: 1, beatTicks: 960, cellTicks: 480 });
    expect(spec18.tuplets).toEqual([
      { actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth' },
      { actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'quarter' },
    ]);
    expect(spec18.values).toEqual(['eighth', 'quarter', 'half', 'whole']);
  });

  it('8분 셋잇단 뗏목은 한 박(960틱)에 돌 셋(320틱씩), 4분 셋잇단 뗏목은 두 박(1920틱)에 돌 셋(640틱씩)이다', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    put(s, spec18, at(960), raftOf(eighths, 'D4'));
    put(s, spec18, at(1920), raftOf(quarters, 'G4'));
    const stones = s.content().events.map((e) => [e.onsetTicks, e.durationTicks, e.groupId]).sort((a, b) => (a[0] as number) - (b[0] as number));
    expect(stones).toEqual([
      [960, 320, 'g-v1-m0-960'],
      [1280, 320, 'g-v1-m0-960'],
      [1600, 320, 'g-v1-m0-960'],
      [1920, 640, 'g-v1-m0-1920'],
      [2560, 640, 'g-v1-m0-1920'],
      [3200, 640, 'g-v1-m0-1920'],
    ]);
  });

  it('뗏목은 박이 시작하는 자리에만 놓인다: 박 가운데나 칸 경계에서는 놓이지 않는다. 마디 끝을 넘어서도 놓이지 않는다', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    expect(placeOnTimeline(spec18, s.content(), at(480), raftOf(eighths, 'D4')).ok).toBe(false);
    expect(placeOnTimeline(spec18, s.content(), at(1440), raftOf(quarters, 'D4')).ok).toBe(false);
    // 4분 셋잇단 뗏목은 두 박이라 4박(2880틱)에는 놓이지 않는다: 마디 끝(3840틱)을 넘는다
    const r = placeOnTimeline(spec18, s.content(), at(2880), raftOf(quarters, 'D4'));
    expect(r.ok).toBe(false);
    expect(placeOnTimeline(spec18, s.content(), at(2880), raftOf(eighths, 'D4')).ok).toBe(true);
  });

  it('돌의 이름: 3박에서 시작한 4분 셋잇단 뗏목의 셋째 돌은 4박에 놓이지만 "3박 셋째 돌"이다', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    put(s, spec18, at(960), raftOf(eighths, 'D4'));
    put(s, spec18, at(1920), raftOf(quarters, 'G4'));
    const content = s.content();
    const span = (tick: number) => raftSpanOf(content, eventCovering(content, at(tick))!)!;
    expect(span(1000)).toEqual({ start: 960, each: 320 });
    expect(span(2600)).toEqual({ start: 1920, each: 640 });
    const label = (tick: number) => tickLabel(spec18, 0, tick, { raft: span(tick) });
    expect(label(960)).toBe('2박');
    expect(label(1280)).toBe('2박 둘째 돌');
    expect(label(1600)).toBe('2박 셋째 돌');
    expect(label(1920)).toBe('3박');
    expect(label(2560)).toBe('3박 둘째 돌');
    expect(label(3200)).toBe('3박 셋째 돌');
    // 뗏목이 없는 자리는 칸으로 센다
    expect(tickLabel(spec18, 0, 480)).toBe('1박 2번째 칸');
  });

  it('연음이 아닌 돌의 뗏목 구간은 없다(raftSpanOf는 연음 돌에만 값을 준다)', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    put(s, spec18, at(0), note('C4', 'quarter'));
    expect(raftSpanOf(s.content(), eventCovering(s.content(), at(100))!)).toBeUndefined();
  });

  it('뗏목의 돌 하나를 바꾸면 그 돌만 바뀌고 뗏목은 그대로다. 말로도 몇째 돌인지 알린다', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    put(s, spec18, at(1920), raftOf(quarters, 'G4'));
    const r = put(s, spec18, at(2560), note('A4', 'quarter'));
    const notes = s.content().events.filter((e) => e.groupId).sort((a, b) => a.onsetTicks - b.onsetTicks);
    expect(notes.map((e) => (e.type === 'note' ? `${e.writtenPitch.letter}${e.writtenPitch.octave}` : '쉼'))).toEqual(['G4', 'A4', 'G4']);
    expect(s.content().tuplets).toHaveLength(1);
    expect(r.announce).toContain('3박 둘째 돌');
  });

  it('뗏목 위의 어느 돌을 비워도 뗏목이 통째로 지워진다(4분 셋잇단은 두 박을 비운다)', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    put(s, spec18, at(1920), raftOf(quarters, 'G4'));
    const cleared = clearOnTimeline(spec18, s.content(), at(3300))!;
    s.apply(cleared.edit);
    expect(s.content().events).toEqual([]);
    expect(s.content().tuplets).toEqual([]);
  });

  it('Q18의 정답을 시간선으로 놓으면 통과한다', () => {
    const s = open(q18, 'triplet-eighths-and-quarters');
    put(s, spec18, at(0), note('C4', 'quarter'));
    put(s, spec18, at(960), raftOf(eighths, 'D4'));
    put(s, spec18, at(1280), note('E4', 'eighth'));
    put(s, spec18, at(1600), note('F4', 'eighth'));
    put(s, spec18, at(1920), raftOf(quarters, 'G4'));
    put(s, spec18, at(2560), note('A4', 'quarter'));
    expect(evaluateDraft(v18, s.content()).passed).toBe(true);
    // 4분 셋잇단 자리를 8분 셋잇단 둘로 채우면 틀린 답이다
    const t = open(q18, 'triplet-eighths-and-quarters');
    put(t, spec18, at(0), note('C4', 'quarter'));
    put(t, spec18, at(960), raftOf(eighths, 'D4'));
    put(t, spec18, at(1920), raftOf(eighths, 'G4'));
    put(t, spec18, at(2880), raftOf(eighths, 'G4'));
    expect(evaluateDraft(v18, t.content()).passed).toBe(false);
  });
});

describe('6-5 Q17 잘게 쪼갠 물결: 16분음표 넷, 8분음표 둘, 2분음표', () => {
  const q17 = quest('rhythm.sixteenths');
  const v17 = q17.variants['sixteenths-and-eighths']!;
  const spec17 = timelineOf(v17);

  it('시간선 설정: 칸은 16분음표(240틱)이고 음가는 16분음표부터 온음표까지 열린다. 셋잇단은 없다', () => {
    expect(spec17).toMatchObject({ measureTicks: 3840, beatTicks: 960, cellTicks: 240 });
    expect(spec17.values).toEqual(['sixteenth', 'eighth', 'quarter', 'half', 'whole']);
    expect(spec17.tuplets).toEqual([]);
  });

  it('정답을 시간선으로 놓으면 통과하고, 16분음표를 8분음표로 바꾸면 틀린다', () => {
    const s = open(q17, 'sixteenths-and-eighths');
    for (const [tick, name] of [[0, 'C4'], [240, 'D4'], [480, 'E4'], [720, 'F4']] as const) put(s, spec17, at(tick), note(name, 'sixteenth'));
    put(s, spec17, at(960), note('G4', 'eighth'));
    put(s, spec17, at(1440), note('G4', 'eighth'));
    put(s, spec17, at(1920), note('E4', 'half'));
    expect(filledTicks(s.content(), 'v1', 0)).toBe(3840);
    expect(evaluateDraft(v17, s.content()).passed).toBe(true);
    const t = open(q17, 'sixteenths-and-eighths');
    for (const [tick, name] of [[0, 'C4'], [480, 'D4'], [960, 'E4']] as const) put(t, spec17, at(tick), note(name, 'eighth'));
    put(t, spec17, at(1440), note('F4', 'eighth'));
    put(t, spec17, at(1920), note('E4', 'half'));
    expect(evaluateDraft(v17, t.content()).passed).toBe(false);
  });
});
