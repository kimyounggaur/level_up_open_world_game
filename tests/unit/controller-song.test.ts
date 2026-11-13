// 5-4, 5-5 컨트롤러: 합주 과제(Q08)의 마디 칸과 듣기 범위, 기본 연습 시작과 돌아가기.
// 소리 장치는 가짜다. 재생 내용은 전송기(transport)가 받은 값을 가로채서 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TransportScore } from '@/audio/transport';
import { draftScoreOf } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { placeOnTimeline, timelineOf } from '@/domain/timeline';
import type { TimelineMaterial } from '@/domain/timeline';
import { NOTHING_IN_SCOPE_NOTICE, NO_MEASURE_NOTICE, NO_NOTES_NOTICE } from '@/ui/challenge/controller';
import { rig } from './controller-rig';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALL: QuestDefinition[] = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', f), 'utf-8')) as QuestDefinition);
const Q08 = 'song.short-piece';
const Q02 = 'rhythm.rest-in-a-bar';
const Q03 = 'rhythm.short-notes-and-triplets';
const Q05 = 'chord.major-triad';

type Value = 'whole' | 'half' | 'quarter' | 'eighth';
const valueOf = (ticks: number): Value => (ticks === 3840 ? 'whole' : ticks === 1920 ? 'half' : ticks === 960 ? 'quarter' : 'eighth');

function song(variantId: string) {
  const r = rig({ definitions: ALL });
  r.controller.open(Q08, variantId);
  const def = r.controller.current!.def;
  /** 정답 악보의 사건을 시간선으로 놓는다(고른 성부와 마디만) */
  const fill = (opts: { voices?: string[]; measures?: number[] } = {}): void => {
    for (const e of def.score.events) {
      if (opts.voices && !opts.voices.includes(e.voiceId)) continue;
      if (opts.measures && !opts.measures.includes(e.measureIndex)) continue;
      const material: TimelineMaterial = e.type === 'note' ? { kind: 'note', pitch: p(`${e.writtenPitch.letter}${e.writtenPitch.octave}`), value: valueOf(e.durationTicks) } : { kind: 'rest', value: valueOf(e.durationTicks) };
      const placed = placeOnTimeline(timelineOf(def), r.controller.content(), { voiceId: e.voiceId, measureIndex: e.measureIndex, tick: e.onsetTicks }, material);
      if (!placed.ok) throw new Error(placed.text);
      r.controller.edit(placed.edit);
    }
  };
  /** 전송기에 올라간 재생 내용들(가장 마지막이 지금 것) */
  const loads: TransportScore[] = [];
  const original = r.transport.load.bind(r.transport);
  r.transport.load = (score: TransportScore): void => {
    loads.push(score);
    original(score);
  };
  return { ...r, def, fill, loads };
}

describe('합주 과제의 칸은 마디 하나다', () => {
  it('Q08은 마디 칸 네 개이고, 고른 칸은 마디와 0번 칸으로 세션에 남는다', () => {
    const { controller, session } = song('two-voices');
    expect(controller.isArrangement).toBe(true);
    const cells = controller.cells();
    expect(cells.map((c) => [c.label, c.measureIndex, c.cellIndex, c.onsetTicks, c.durationTicks])).toEqual([
      ['1마디', 0, 0, 0, 3840],
      ['2마디', 1, 0, 0, 3840],
      ['3마디', 2, 0, 0, 3840],
      ['4마디', 3, 0, 0, 3840],
    ]);
    expect(controller.selectedCell()).toBeNull();
    controller.selectCell(cells[2]!);
    expect(session.selection()).toEqual({ measure: 2, slot: 0 });
    expect(controller.selectedCell()?.label).toBe('3마디');
    controller.selectCell(null);
    expect(controller.selectedCell()).toBeNull();
  });

  it('다른 과제는 합주 과제가 아니고 칸 계산도 그대로다: Q02는 박 네 칸, Q03은 박 창', () => {
    const r = rig({ definitions: ALL });
    r.controller.open(Q02, 'quarter-rest');
    expect(r.controller.isArrangement).toBe(false);
    expect(r.controller.cells().map((c) => c.label)).toEqual(['1박', '2박', '3박', '4박']);
    expect(r.controller.scopeVoices()).toEqual([]);
    r.controller.open(Q03, 'thirty-seconds-triplet');
    expect(r.controller.isArrangement).toBe(false);
    expect(r.controller.cells().length).toBe(4); // 한 마디의 박 창
  });

  it('반복 단추의 이름은 마디 단위이고, 마디를 고르지 않으면 이유를 알린다', () => {
    const { controller } = song('one-voice');
    expect(controller.repeatLabel()).toBe('마디 반복');
    controller.setRepeat(true);
    expect(controller.aids.repeat).toBe(false);
    expect(controller.notice).toBe('반복할 마디를 먼저 골라 주세요.');
    controller.selectCell(controller.cells()[1]!);
    expect(controller.repeatLabel()).toBe('2마디 반복');
    controller.setRepeat(true);
    expect(controller.aids.repeat).toBe(true);
    expect(controller.usedAssist()).toBe(true);
  });

  it('Q02의 반복 이름은 그대로 박 단위다', () => {
    const r = rig({ definitions: ALL });
    r.controller.open(Q02, 'quarter-rest');
    r.controller.selectCell(r.controller.cells()[1]!);
    expect(r.controller.repeatLabel()).toBe('두 번째 박 반복');
  });
});

describe('듣기 범위: 전체, 성부 하나, 고른 마디', () => {
  it('성부 목록은 판본이 쓰는 성부다', () => {
    expect(song('one-voice').controller.scopeVoices()).toEqual([{ voiceId: 'v1', label: '위 성부' }]);
    expect(song('two-voices').controller.scopeVoices()).toEqual([
      { voiceId: 'v1', label: '위 성부' },
      { voiceId: 'v2', label: '아래 성부' },
    ]);
  });

  it('처음에는 전체이고 도움을 쓴 것이 아니다. 성부나 마디를 고르면 도움으로 적힌다', () => {
    const { controller } = song('two-voices');
    expect(controller.scopeChoice).toEqual({ kind: 'all' });
    expect(controller.aids.scoped).toBe(false);
    expect(controller.scopeLabel()).toBe('전체');
    expect(controller.usedAssist()).toBe(false);
    controller.setScope({ kind: 'voice', voiceId: 'v2' });
    expect(controller.scopeChoice).toEqual({ kind: 'voice', voiceId: 'v2' });
    expect(controller.aids.scoped).toBe(true);
    expect(controller.scopeLabel()).toBe('아래 성부만');
    expect(controller.usedAssist()).toBe(true);
    expect(controller.live).toBe('듣기 범위: 아래 성부만.');
    controller.setScope({ kind: 'all' });
    expect(controller.aids.scoped).toBe(false);
    expect(controller.usedAssist()).toBe(true); // 한번 쓴 도움은 이 도전의 기록에 남는다
  });

  it('없는 성부는 고를 수 없다. 한 성부 판본에는 아래 성부가 없다', () => {
    const { controller } = song('one-voice');
    controller.setScope({ kind: 'voice', voiceId: 'v2' });
    expect(controller.scopeChoice).toEqual({ kind: 'all' });
    expect(controller.usedAssist()).toBe(false);
  });

  it('합주 과제가 아니면 범위를 고를 수 없다', () => {
    const r = rig({ definitions: ALL });
    r.controller.open(Q02, 'quarter-rest');
    r.controller.setScope({ kind: 'voice', voiceId: 'v1' });
    expect(r.controller.scopeChoice).toEqual({ kind: 'all' });
    expect(r.controller.aids.scoped).toBe(false);
  });

  it('고른 마디는 지금 고른 마디를 따라간다. 마디를 고르지 않았으면 듣지 못하고 이유를 알린다', () => {
    const { controller, fill, loads } = song('two-voices');
    fill();
    controller.setScope({ kind: 'measure' });
    expect(controller.listenScope()).toBeNull();
    expect(controller.scopeLabel()).toBe('고른 마디만');
    expect(controller.playMine()).toBe(false);
    expect(controller.notice).toBe(NO_MEASURE_NOTICE);
    expect(controller.playing).toBeNull();
    expect(loads).toHaveLength(0);
    controller.selectCell(controller.cells()[1]!);
    expect(controller.listenScope()).toEqual({ kind: 'measure', measureIndex: 1 });
    expect(controller.scopeLabel()).toBe('2마디만');
    controller.selectCell(controller.cells()[3]!);
    expect(controller.scopeLabel()).toBe('4마디만');
  });

  it('다른 도전을 열면 범위는 전체로 돌아간다', () => {
    const { controller } = song('two-voices');
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    controller.open(Q08, 'challenge');
    expect(controller.scopeChoice).toEqual({ kind: 'all' });
    expect(controller.aids.scoped).toBe(false);
  });

  it('범위를 바꾸면 재생 중이던 소리가 멈춘다', () => {
    const { controller, fill, run } = song('two-voices');
    fill();
    expect(controller.playMine()).toBe(true);
    run(0.2);
    expect(controller.playing).toBe('mine');
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    expect(controller.playing).toBeNull();
    // 같은 범위를 다시 누르면 아무것도 바뀌지 않는다
    expect(controller.playMine()).toBe(true);
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    expect(controller.playing).toBe('mine');
  });
});

describe('범위대로 들려 주기', () => {
  const keyOf = (n: { onsetTick: number; midi: number }): string => `${n.onsetTick}:${n.midi}`;

  it('전체: 두 성부 전부, 곡 전체 길이 15360틱, 구간 없음', () => {
    const { controller, fill, loads, transport } = song('two-voices');
    fill();
    expect(controller.playMine()).toBe(true);
    const sent = loads.at(-1)!;
    expect(sent.lengthTicks).toBe(15360);
    expect(sent.notes.length).toBe(draftScoreOf(controller.current!.def.score, controller.content()).events.filter((e) => e.type === 'note').length);
    expect(transport.section).toBeNull();
  });

  it('아직 다 놓지 않은 초안도 곡 전체 길이까지 듣고, 놓은 것이 하나도 없으면 안내만 한다', () => {
    const { controller, fill, loads } = song('two-voices');
    expect(controller.playMine()).toBe(false);
    expect(controller.notice).toBe(NO_NOTES_NOTICE);
    fill({ voices: ['v1'], measures: [0] });
    expect(controller.playMine()).toBe(true);
    expect(loads.at(-1)!.lengthTicks).toBe(15360);
  });

  it('성부 하나만: 그 성부의 음만 보낸다. 비어 있는 성부는 들려 줄 것이 없다고 알린다', () => {
    const { controller, fill, loads, def } = song('two-voices');
    fill({ voices: ['v1'] });
    controller.setScope({ kind: 'voice', voiceId: 'v2' });
    expect(controller.playMine()).toBe(false);
    expect(controller.notice).toBe(NOTHING_IN_SCOPE_NOTICE);
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    expect(controller.playMine()).toBe(true);
    const sent = loads.at(-1)!.notes.map(keyOf).sort();
    const answer = draftScoreOf(def.score, controller.content());
    expect(answer.events.filter((e) => e.voiceId === 'v2')).toHaveLength(0);
    expect(sent.length).toBe(def.score.events.filter((e) => e.voiceId === 'v1' && e.type === 'note').length);
  });

  it('목표 듣기도 같은 범위를 따른다: 아래 성부만 듣기', () => {
    const { controller, loads, def } = song('two-voices');
    controller.setScope({ kind: 'voice', voiceId: 'v2' });
    expect(controller.playTarget()).toBe(true);
    expect(loads.at(-1)!.notes.length).toBe(def.score.events.filter((e) => e.voiceId === 'v2' && e.type === 'note').length);
    expect(controller.playing).toBe('target');
  });

  it('고른 마디만: 그 마디 구간 하나를 한 번 듣는다(반복하지 않는다)', () => {
    const { controller, fill, transport, run } = song('two-voices');
    fill();
    controller.selectCell(controller.cells()[1]!);
    controller.setScope({ kind: 'measure' });
    expect(controller.playMine()).toBe(true);
    expect(transport.section).toEqual({ startTick: 3840, endTick: 7680 });
    expect(transport.repeating).toBe(false);
    run(0.2);
    const tick = controller.positionTick()!;
    expect(tick).toBeGreaterThanOrEqual(3840);
    expect(tick).toBeLessThan(7680);
    expect(controller.playheadCell()?.label).toBe('2마디');
    // 한 마디(80bpm, 4/4)는 3초: 끝나면 저절로 멈춘다
    run(4);
    expect(controller.playing).toBeNull();
  });

  it('고른 마디가 비어 있으면 들려 줄 것이 없다고 알린다', () => {
    const { controller, fill } = song('two-voices');
    fill({ measures: [0] });
    controller.selectCell(controller.cells()[2]!);
    controller.setScope({ kind: 'measure' });
    expect(controller.playMine()).toBe(false);
    expect(controller.notice).toBe(NOTHING_IN_SCOPE_NOTICE);
  });

  it('마디 반복을 켜면 반복이 이긴다: 고른 마디를 되풀이한다', () => {
    const { controller, fill, transport } = song('two-voices');
    fill();
    controller.selectCell(controller.cells()[2]!);
    controller.setRepeat(true);
    controller.setScope({ kind: 'measure' });
    expect(controller.playMine()).toBe(true);
    expect(transport.section).toEqual({ startTick: 7680, endTick: 11520 });
    expect(transport.repeating).toBe(true);
  });

  it('느리게 듣기는 범위와 함께 쓴다: 원래 템포 설정은 그대로다', () => {
    const { controller, fill, loads } = song('two-voices');
    fill();
    controller.setSlow(true);
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    expect(controller.playMine()).toBe(true);
    expect(loads.at(-1)!.tempoBpm).toBe(controller.tempo().effective);
    expect(controller.tempo().original).toBe(80);
    expect(controller.tempo().effective).toBeLessThan(80);
  });

  it('범위를 고른 채 배치를 확인해 통과하면 도움 사용으로 기록된다(통과에 도움 여부가 함께 적힌다)', () => {
    const { controller, fill } = song('two-voices');
    fill();
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    const view = controller.check();
    expect(view.passed).toBe(true);
    expect(controller.attempts.at(-1)!.assistUsed).toBe(true);
  });

  it('범위 없이 통과하면 도움 사용이 아니다', () => {
    const { controller, fill } = song('two-voices');
    fill();
    expect(controller.check().passed).toBe(true);
    expect(controller.attempts.at(-1)!.assistUsed).toBe(false);
  });

  it('한 성부의 완료를 두 성부의 완료로 올리지 않는다: 위 성부만 놓으면 통과하지 못한다', () => {
    const { controller, fill } = song('two-voices');
    fill({ voices: ['v1'] });
    const view = controller.check();
    expect(view.passed).toBe(false);
    expect(view.messages[0]).toBe('아래 성부가 아직 없어요.');
  });
});

describe('기본 연습(5-5): Q08에서 Q02, Q03, Q05로', () => {
  it('연습을 열면 연습 과제가 지금 도전이 되고 원래 곡의 이름과 주소가 남는다', () => {
    const { controller, fill } = song('two-voices');
    fill({ voices: ['v1'], measures: [0] });
    const r = controller.startPractice(Q02);
    expect(r.ok).toBe(true);
    expect(controller.inAssist).toBe(true);
    expect(controller.readOnly).toBe(false);
    expect(controller.current!.entry.questId).toBe(Q02);
    expect(controller.current!.variant.variantId).toBe('quarter-rest'); // 판본을 정하지 않으면 첫 판본
    expect(controller.origin()).toEqual({ title: controller.origin()!.title, variantLabel: controller.origin()!.variantLabel, hash: '#/q/song.short-piece/two-voices' });
    expect(controller.origin()!.title).toBe(ALL.find((q) => q.questId === Q08)!.title);
    expect(controller.live).toContain('기본 연습을 열었어요');
  });

  it('연습 과제는 자기 초안으로 열리고 고칠 수 있다. 선택도 된다', () => {
    const { controller, session } = song('two-voices');
    controller.startPractice(Q02);
    expect(controller.content().events).toEqual([]);
    const cell = controller.cells()[1]!;
    controller.selectCell(cell);
    expect(session.selection()).toEqual({ measure: cell.measureIndex, slot: cell.cellIndex });
    expect(controller.selectedCell()?.label).toBe('2박');
  });

  it('연습을 끝내지 않고 돌아와도 원래 곡의 첫 마디 배치가 그대로 복원된다', () => {
    const { controller, fill, session } = song('two-voices');
    fill({ measures: [0] });
    controller.selectCell(controller.cells()[0]!);
    const keptEvents = JSON.stringify(controller.content().events);
    const keptSelection = session.selection();
    controller.startPractice(Q02);
    // 연습 과제에서 무엇이든 한다(놓고, 확인한다)
    const cells = controller.cells();
    controller.selectCell(cells[0]!);
    controller.check();
    controller.returnToOrigin();
    expect(controller.inAssist).toBe(false);
    expect(controller.current!.entry.questId).toBe(Q08);
    expect(controller.current!.variant.variantId).toBe('two-voices');
    expect(JSON.stringify(controller.content().events)).toBe(keptEvents);
    expect(session.selection()).toEqual(keptSelection);
    expect(controller.live).toBe('원래 곡으로 돌아왔어요.');
  });

  it('연습 중의 확인은 연습 과제의 기록이다: 원곡의 완료로 합산하지 않는다', () => {
    const { controller, fill } = song('two-voices');
    fill();
    controller.startPractice(Q02);
    const view = controller.check();
    expect(view.passed).toBe(false);
    expect(controller.attempts).toHaveLength(1);
    expect(controller.attempts[0]!.questId).toBe(Q02);
    controller.returnToOrigin();
    expect(controller.attempts.filter((a) => a.questId === Q08)).toHaveLength(0);
  });

  it('연습 과제의 주소를 열어도 연습은 그대로이고, 다른 도전의 주소를 열면 먼저 원래 곡으로 돌아온다', () => {
    const { controller, session } = song('two-voices');
    controller.startPractice(Q02);
    controller.open(Q02, 'quarter-rest');
    expect(controller.inAssist).toBe(true);
    expect(controller.current!.entry.questId).toBe(Q02);
    controller.open(Q03, 'thirty-seconds-triplet');
    expect(controller.inAssist).toBe(false);
    expect(controller.current!.entry.questId).toBe(Q03);
    expect(session.supportContext).toBeNull();
  });

  it('원래 곡의 주소를 열면 연습을 끝낸 것과 같다(브라우저 뒤로 가기)', () => {
    const { controller, fill } = song('two-voices');
    fill({ measures: [0] });
    const kept = JSON.stringify(controller.content().events);
    controller.startPractice(Q05);
    controller.open(Q08, 'two-voices');
    expect(controller.inAssist).toBe(false);
    expect(controller.current!.entry.questId).toBe(Q08);
    expect(JSON.stringify(controller.content().events)).toBe(kept);
  });

  it('도전을 닫아도 원래 곡의 초안은 남는다', () => {
    const { controller, fill } = song('two-voices');
    fill({ measures: [0] });
    controller.startPractice(Q03);
    controller.close();
    expect(controller.inAssist).toBe(false);
    controller.open(Q08, 'two-voices');
    expect(controller.content().events.length).toBeGreaterThan(0);
  });

  it('열 수 없는 연습은 이유를 알리고 아무것도 바꾸지 않는다', () => {
    const { controller, fill, session } = song('two-voices');
    fill({ measures: [0] });
    const before = JSON.stringify(session.serialize());
    const r = controller.startPractice('rhythm.nothing');
    expect(r.ok).toBe(false);
    expect(controller.inAssist).toBe(false);
    expect(JSON.stringify(session.serialize())).toBe(before);
    expect(controller.current!.entry.questId).toBe(Q08);
  });

  it('자기 자신은 연습으로 열지 않는다', () => {
    const { controller } = song('two-voices');
    const r = controller.startPractice(Q08, 'two-voices');
    expect(r.ok).toBe(true);
    expect(controller.inAssist).toBe(false);
  });

  it('연습 중의 도움과 범위는 연습 과제 것이다: 돌아오면 원래 곡은 도움 없이 시작한다', () => {
    const { controller } = song('two-voices');
    controller.setScope({ kind: 'voice', voiceId: 'v1' });
    controller.startPractice(Q02);
    expect(controller.aids.scoped).toBe(false);
    expect(controller.scopeChoice).toEqual({ kind: 'all' });
    controller.setSlow(true);
    controller.returnToOrigin();
    expect(controller.aids.slow).toBe(false);
    expect(controller.aids.scoped).toBe(false);
  });

  it('연습을 열 때 재생 중이던 소리는 멈춘다', () => {
    const { controller, fill, run } = song('two-voices');
    fill();
    controller.playMine();
    run(0.2);
    expect(controller.playing).toBe('mine');
    controller.startPractice(Q02);
    expect(controller.playing).toBeNull();
  });

  it('연습의 도전 설정은 연습 과제의 원래 템포다', () => {
    const { controller, session } = song('two-voices');
    controller.startPractice(Q03);
    expect(session.activeChallenge!.challengeSettings).toEqual({ tempoBpm: ALL.find((q) => q.questId === Q03)!.variants['thirty-seconds-triplet']!.score.tempoBpm });
    expect(controller.tempo().original).toBe(session.activeChallenge!.challengeSettings.tempoBpm);
  });
});
