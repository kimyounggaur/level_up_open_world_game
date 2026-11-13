// 6-4 징검다리(T2, 설계서 4.4)의 순수 계산: 줄의 위치와 시간(틱)을 오가는 계산, 남은 물, 월드가 그릴 모습, 손에 드는 돌의 길이, 자유로 놀기의 틀.
// 점이 붙은 돌과 쉼표 돌을 놓는 규칙(겹치면 놓이지 않고 이유를 알려 준다)도 여기서 확인한다. 화면과 월드 없이 숫자와 문장만 본다.
import { describe, expect, it } from 'vitest';
import { STONES_FRAME_PAD, STONES_LABEL_TOP, STONES_MIN_ZOOM, STONES_RAFT_BAND, frameTuningOf, slotBounds } from '@/domain/installation';
import { ChallengeSession } from '@/domain/session';
import { alreadyEmptyText, clearOnTimeline, eventCovering, isDottedLength, placeOnTimeline, timelineOf } from '@/domain/timeline';
import type { TimelineAt, TimelineMaterial } from '@/domain/timeline';
import { beatFollowOf, followsBeat, freeSpecOf, freeStonesFrameOf, freeStonesVariant, isTimelineStones, laneOf, laneRect, slotOfTick, slotStartTick, stoneLengthsOf, tickAtPoint, tickAtSlotPoint, timelineViewOf, waterSegmentText, waterSegments, waterSentence } from '@/domain/timelineStones';
import { installation, quest } from './controller-rig';
import { p } from './helpers';

const E1 = installation('inst.beat-river.first-ford');
const E2 = installation('inst.beat-river.long-short');
const H4 = installation('inst.village.scale-stones');
const lane1 = laneOf(E1)!;
const lane2 = laneOf(E2)!;
/** 과제는 한 번만 읽는다: 실제 앱에서도 카탈로그의 판본 객체는 같은 것이다(틀의 같은 객체 시험이 이것에 기댄다) */
const quests = new Map<string, ReturnType<typeof quest>>();
const variantOf = (questId: string, variantId: string) => {
  if (!quests.has(questId)) quests.set(questId, quest(questId));
  return quests.get(questId)!.variants[variantId];
};
const spec = (questId: string, variantId: string) => timelineOf(variantOf(questId, variantId)!);

const at = (tick: number): TimelineAt => ({ voiceId: 'v1', measureIndex: 0, tick });
const note = (name: string, value: Extract<TimelineMaterial, { kind: 'note' }>['value'], dotted = false): TimelineMaterial => ({ kind: 'note', pitch: p(name), value, ...(dotted ? { dotted } : {}) });
const rest = (value: Extract<TimelineMaterial, { kind: 'rest' }>['value'], dotted = false): TimelineMaterial => ({ kind: 'rest', value, ...(dotted ? { dotted } : {}) });

function open(questId: string, variantId: string): ChallengeSession {
  const s = new ChallengeSession();
  s.openChallenge(questId, variantId);
  return s;
}

describe('줄의 위치(4.4): 480 px가 4/4 한 마디, 1 px = 8틱', () => {
  it('첫 징검다리(E1)와 긴 돌 짧은 돌(E2)은 같은 여울목의 줄이다: x 6760부터 480 px, 칸은 60 px(8분음표 480틱)', () => {
    expect(isTimelineStones(E1)).toBe(true);
    expect(isTimelineStones(H4)).toBe(false);
    expect(lane1).toEqual({ axis: 'x', ticksPerPx: 8, start: 6760, cross: 2752, crossSize: 96, cellTicks: 480, laneTicks: 3840, voiceId: 'v1' });
    expect(lane2).toEqual({ ...lane1, cross: 3552 });
    expect(E1.slots).toHaveLength(8);
    expect(E1.slots.every((s) => s.w === 60 && s.h === 96)).toBe(true);
  });

  it('돌 설치물이 아니면 줄이 없다', () => {
    expect(laneOf(H4)).toBeNull();
  });

  it('틱 구간을 월드 사각형으로: 4분음표 하나는 120 px. inset은 시간 방향 양끝만 줄인다', () => {
    expect(laneRect(lane1, 0, 960)).toEqual({ x: 6760, y: 2752, w: 120, h: 96 });
    expect(laneRect(lane1, 960, 3840)).toEqual({ x: 6880, y: 2752, w: 360, h: 96 });
    expect(laneRect(lane1, 0, 960, 2)).toEqual({ x: 6762, y: 2752, w: 116, h: 96 });
    // 시간이 세로로 흐르는 줄(확대형 수로)에서는 위치와 크기의 방향이 바뀐다
    const vertical = { ...lane1, axis: 'y' as const, start: 700, cross: 6700, crossSize: 60, ticksPerPx: 2 };
    expect(laneRect(vertical, 0, 480)).toEqual({ x: 6700, y: 700, w: 60, h: 240 });
  });

  it('월드의 한 점이 줄에서 몇 틱 자리인지: 줄 밖이면 null', () => {
    expect(tickAtPoint(lane1, 6760, 2800)).toBe(0);
    expect(tickAtPoint(lane1, 6880, 2800)).toBe(960);
    expect(tickAtPoint(lane1, 7239, 2800)).toBe(3832);
    expect(tickAtPoint(lane1, 6759, 2800)).toBeNull();
    expect(tickAtPoint(lane1, 7240, 2800)).toBeNull();
    expect(tickAtPoint(lane1, 6800, 2751)).toBeNull();
    expect(tickAtPoint(lane1, 6800, 2849)).toBeNull();
  });

  it('칸 번호(1부터)와 시작 틱을 오간다', () => {
    expect(slotStartTick(lane1, 1)).toBe(0);
    expect(slotStartTick(lane1, 3)).toBe(960);
    expect(slotOfTick(lane1, 960)).toBe(3);
    expect(slotOfTick(lane1, 959)).toBe(2);
  });

  it('카메라: 칸이 48 px 아래로 줄지 않게 확대 하한 0.8을 두고, 박 번호 띠(44 px)를 위에 더해 담는다', () => {
    expect(frameTuningOf(E1)).toEqual({ pad: STONES_FRAME_PAD, minZoom: STONES_MIN_ZOOM });
    expect([STONES_FRAME_PAD, STONES_MIN_ZOOM, STONES_LABEL_TOP]).toEqual([24, 0.8, 44]);
    expect(slotBounds(E1)).toEqual({ x: 6760, y: 2752 - STONES_LABEL_TOP, w: 480, h: 96 + STONES_LABEL_TOP });
    // 60 px 칸 × 0.8 = 48 px: 가장 좁은 화면에서도 한 칸을 손가락으로 누를 수 있다
    expect(60 * STONES_MIN_ZOOM).toBeGreaterThanOrEqual(48);
  });
});

describe('판본의 시간선: 칸과 돌의 길이', () => {
  it('Q02·Q13은 박 하나가 칸(960틱)이고 4분음표 돌 하나뿐이다. Q13은 한 마디가 2880틱이라 줄의 오른쪽 120 px가 남는다', () => {
    const q02 = spec('rhythm.rest-in-a-bar', 'quarter-rest');
    const q13 = spec('rhythm.three-four', 'three-quarters');
    expect([q02.measureTicks, q02.cellTicks, q02.values, q02.dottedValues]).toEqual([3840, 960, ['quarter'], []]);
    expect([q13.measureTicks, q13.beatTicks, q13.cellTicks, q13.values]).toEqual([2880, 960, 960, ['quarter']]);
    expect((lane1.laneTicks - q13.measureTicks) / lane1.ticksPerPx).toBe(120);
  });

  it('돌 길이는 짧은 것부터이고, 점이 붙은 돌은 목표에 점음표가 있는 판본에서만 나온다(4.4: 점2분 360 px, 점4분 180 px)', () => {
    const names = (s: ReturnType<typeof spec>) => stoneLengthsOf(s).map((l) => `${l.name}:${l.ticks}`);
    expect(names(spec('rhythm.rest-lengths', 'quarter-and-half-rests'))).toEqual(['4분음표:960', '2분음표:1920', '온음표:3840']);
    expect(names(spec('rhythm.rest-lengths', 'eighth-rest-mix'))).toEqual(['8분음표:480', '4분음표:960', '2분음표:1920', '온음표:3840']);
    expect(names(spec('rhythm.dotted', 'dotted-half'))).toEqual(['4분음표:960', '2분음표:1920', '점2분음표:2880', '온음표:3840']);
    expect(names(spec('rhythm.dotted', 'dotted-quarter-mix'))).toEqual(['8분음표:480', '4분음표:960', '점4분음표:1440', '2분음표:1920', '점2분음표:2880', '온음표:3840']);
    // 점2분은 360 px, 점4분은 180 px
    expect(2880 / lane1.ticksPerPx).toBe(360);
    expect(1440 / lane1.ticksPerPx).toBe(180);
  });

  it('점이 붙은 길이를 알아본다', () => {
    expect([480, 720, 960, 1440, 1920, 2880, 3840].map(isDottedLength)).toEqual([false, true, false, true, false, true, false]);
  });

  it('자유로 놀기에서는 목표가 없으니 칸과 마디에 맞는 점음표를 모두 놓을 수 있다', () => {
    expect(freeSpecOf(spec('rhythm.rest-lengths', 'quarter-and-half-rests')).dottedValues).toEqual(['half']);
    expect(freeSpecOf(spec('rhythm.rest-lengths', 'eighth-rest-mix')).dottedValues).toEqual(['quarter', 'half']);
    // 원래 값은 바꾸지 않는다
    const base = spec('rhythm.rest-lengths', 'eighth-rest-mix');
    freeSpecOf(base);
    expect(base.dottedValues).toEqual([]);
  });
});

describe('점이 붙은 돌과 쉼표 돌 놓기(4.4)', () => {
  it('점2분음표는 360 px(2880틱)를 차지하고, 말로 알려 준다', () => {
    const s = spec('rhythm.dotted', 'dotted-half');
    const sess = open('rhythm.dotted', 'dotted-half');
    const r = placeOnTimeline(s, sess.content(), at(0), note('C4', 'half', true));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.announce).toBe('1박에 C4 점2분음표를 놓았어요.');
    sess.apply(r.edit);
    expect(sess.content().events).toMatchObject([{ type: 'note', onsetTicks: 0, durationTicks: 2880 }]);
    expect(eventCovering(sess.content(), at(1920))!.eventId).toBe('u-v1-m0-0');
  });

  it('점이 붙은 돌을 열어 주지 않은 판본에서는 놓이지 않는다', () => {
    const s = spec('rhythm.rest-lengths', 'quarter-and-half-rests');
    const r = placeOnTimeline(s, open('rhythm.rest-lengths', 'quarter-and-half-rests').content(), at(0), note('C4', 'half', true));
    expect(r).toMatchObject({ ok: false, code: 'NO_VALUE' });
  });

  it('이미 놓인 돌과 겹치면 놓이지 않고 이유를 알려 준다. 아무것도 바뀌지 않는다', () => {
    const s = spec('rhythm.dotted', 'dotted-half');
    const sess = open('rhythm.dotted', 'dotted-half');
    const first = placeOnTimeline(s, sess.content(), at(0), note('C4', 'half', true));
    if (!first.ok) throw new Error(first.text);
    sess.apply(first.edit);
    const before = JSON.stringify(sess.content());
    const r = placeOnTimeline(s, sess.content(), at(1920), note('D4', 'quarter'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('OVERLAP');
    expect(r.text).toContain('겹쳐요');
    expect(r.text).toContain('점2분음표');
    expect(r.text).toContain('겹친 것을 먼저 비워 주세요');
    expect(JSON.stringify(sess.content())).toBe(before);
  });

  it('마디 선을 넘는 돌은 놓이지 않는다: 3박에 점2분음표(2880틱)는 한 마디(3840틱)를 넘는다', () => {
    const s = spec('rhythm.dotted', 'dotted-half');
    const r = placeOnTimeline(s, open('rhythm.dotted', 'dotted-half').content(), at(1920), note('C4', 'half', true));
    expect(r).toMatchObject({ ok: false, code: 'BARLINE' });
    if (!r.ok) expect(r.text).toContain('마디 선을 960틱 넘어요');
  });

  it('3/4 과제의 마디는 2880틱이다: 4분음표 돌 셋이면 가득 차고, 3박 자리 다음은 마디 선을 넘는다', () => {
    const s = spec('rhythm.three-four', 'three-quarters');
    const sess = open('rhythm.three-four', 'three-quarters');
    for (const [tick, m] of [
      [0, note('C4', 'quarter')],
      [960, rest('quarter')],
      [1920, note('E4', 'quarter')],
    ] as const) {
      const r = placeOnTimeline(s, sess.content(), at(tick), m);
      if (!r.ok) throw new Error(r.text);
      sess.apply(r.edit);
    }
    expect(waterSegments(s, sess.content(), 'v1')).toEqual([]);
    const over = placeOnTimeline(s, sess.content(), at(2880), note('C4', 'quarter'));
    expect(over).toMatchObject({ ok: false, code: 'BARLINE' });
  });

  it('쉼표 돌(이끼돌)을 놓고 비운다. 이미 빈 자리를 비우면 할 일이 없다고 말한다', () => {
    const s = spec('rhythm.rest-lengths', 'quarter-and-half-rests');
    const sess = open('rhythm.rest-lengths', 'quarter-and-half-rests');
    const r = placeOnTimeline(s, sess.content(), at(1920), rest('half'));
    if (!r.ok) throw new Error(r.text);
    expect(r.announce).toContain('2분음표 길이의 쉼표');
    sess.apply(r.edit);
    expect(sess.content().events).toMatchObject([{ type: 'rest', onsetTicks: 1920, durationTicks: 1920 }]);
    const cleared = clearOnTimeline(s, sess.content(), at(2400))!;
    sess.apply(cleared.edit);
    expect(sess.content().events).toEqual([]);
    expect(clearOnTimeline(s, sess.content(), at(2400))).toBeNull();
    expect(alreadyEmptyText(s, 0, 2400)).toBe('3박 2번째 칸은 이미 비어 있어요.');
  });
});

describe('남은 물(4.4): 돌이 덮지 않은 구간', () => {
  const s = spec('rhythm.rest-lengths', 'eighth-rest-mix');

  function drafted(...placed: Array<[number, TimelineMaterial]>): ChallengeSession {
    const sess = open('rhythm.rest-lengths', 'eighth-rest-mix');
    for (const [tick, m] of placed) {
      const r = placeOnTimeline(s, sess.content(), at(tick), m);
      if (!r.ok) throw new Error(r.text);
      sess.apply(r.edit);
    }
    return sess;
  }

  it('아무것도 놓지 않으면 마디 전체가 물이다', () => {
    expect(waterSegments(s, drafted().content(), 'v1')).toEqual([{ from: 0, to: 3840 }]);
    expect(waterSentence(s, waterSegments(s, drafted().content(), 'v1'))).toBe('남은 물은 1박부터 마디 끝까지 3840틱(온음표 하나 길이)이에요.');
  });

  it('앞과 뒤가 비면 물이 두 곳이다. 맞닿은 구간은 하나로 센다', () => {
    const sess = drafted([960, note('C4', 'quarter')], [1920, note('D4', 'quarter')]);
    expect(waterSegments(s, sess.content(), 'v1')).toEqual([
      { from: 0, to: 960 },
      { from: 2880, to: 3840 },
    ]);
    const text = waterSentence(s, waterSegments(s, sess.content(), 'v1'));
    expect(text).toContain('남은 물은 2곳, 모두 1920틱이에요.');
    expect(text).toContain('1박부터 2박까지 960틱(4분음표 하나 길이)');
    expect(text).toContain('4박부터 마디 끝까지 960틱(4분음표 하나 길이)');
  });

  it('돌이 빈틈없이 채우면 남은 물이 없다고 말한다', () => {
    const sess = drafted([0, note('C4', 'half')], [1920, rest('half')]);
    expect(waterSegments(s, sess.content(), 'v1')).toEqual([]);
    expect(waterSentence(s, [])).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
  });

  it('구간 하나를 말로: 박 안의 칸은 몇 번째 칸인지 적고, 틱 수와 그 길이를 함께 적는다', () => {
    expect(waterSegmentText(s, { from: 3360, to: 3840 })).toBe('4박 2번째 칸부터 마디 끝까지 480틱(8분음표 하나 길이)');
  });
});

describe('월드가 그릴 모습(timelineViewOf)', () => {
  const s = spec('rhythm.dotted', 'dotted-quarter-mix');
  const lane = { voiceId: 'v1', cellTicks: 480 };

  function drafted(): ChallengeSession {
    const sess = open('rhythm.dotted', 'dotted-quarter-mix');
    for (const [tick, m] of [
      [0, note('E4', 'quarter', true)],
      [1440, note('D4', 'eighth')],
      [1920, rest('half')],
    ] as const) {
      const r = placeOnTimeline(s, sess.content(), at(tick), m as TimelineMaterial);
      if (!r.ok) throw new Error(r.text);
      sess.apply(r.edit);
    }
    return sess;
  }

  it('돌은 틱 구간으로, 음 이름과 점과 쉼으로, 남은 물은 구간으로 나온다', () => {
    const view = timelineViewOf({ spec: s, lane, content: drafted().content() });
    expect(view).toMatchObject({ measureTicks: 3840, gridTicks: 480, beatTicks: 960, waterEmphasis: false, cursor: null, playTick: null });
    expect(view.stones).toEqual([
      { startTick: 0, endTick: 1440, kind: 'note', name: 'E4', midi: 64, dotted: true, flagged: false, playing: false },
      { startTick: 1440, endTick: 1920, kind: 'note', name: 'D4', midi: 62, dotted: false, flagged: false, playing: false },
      { startTick: 1920, endTick: 3840, kind: 'rest', name: null, midi: null, dotted: false, flagged: false, playing: false },
    ]);
    expect(view.water).toEqual([]);
  });

  it('판정이 가리킨 구간과 겹치는 돌과 물에 표식이 붙고, 마디가 덜 찼다는 판정이면 물을 강조한다', () => {
    const sess = open('rhythm.dotted', 'dotted-quarter-mix');
    const r = placeOnTimeline(s, sess.content(), at(0), note('E4', 'quarter', true));
    if (!r.ok) throw new Error(r.text);
    sess.apply(r.edit);
    const view = timelineViewOf({ spec: s, lane, content: sess.content(), flagged: [{ from: 1440, to: 3840 }], remain: true });
    expect(view.waterEmphasis).toBe(true);
    expect(view.water).toEqual([{ from: 1440, to: 3840, flagged: true }]);
    expect(view.stones[0]!.flagged).toBe(false);
    const hit = timelineViewOf({ spec: s, lane, content: sess.content(), flagged: [{ from: 0, to: 480 }] });
    expect(hit.stones[0]!.flagged).toBe(true);
    expect(hit.water[0]!.flagged).toBe(false);
  });

  it('듣는 중의 물결 선은 지나가는 돌에만 playing을 달고, 마디 밖이면 없는 것으로 친다. 놓으려는 자리는 그대로 올린다', () => {
    const content = drafted().content();
    const view = timelineViewOf({ spec: s, lane, content, playTick: 1500, cursor: { startTick: 960, endTick: 1440, kind: 'note', ok: false } });
    expect(view.stones.map((x) => x.playing)).toEqual([false, true, false]);
    expect(view.playTick).toBe(1500);
    expect(view.cursor).toEqual({ startTick: 960, endTick: 1440, kind: 'note', ok: false });
    expect(timelineViewOf({ spec: s, lane, content, playTick: 3840 }).playTick).toBeNull();
    expect(timelineViewOf({ spec: s, lane, content, playTick: -1 }).playTick).toBeNull();
  });
});

describe('자유로 놀기의 틀(4.2)', () => {
  const variantFn = (q: string, v: string) => variantOf(q, v);

  it('줄 전체가 한 마디인 4/4이고 목표 악보는 비어 있다. 칸은 줄의 한 칸(8분음표)', () => {
    const frame = freeStonesFrameOf(E1, variantFn)!;
    expect(frame.score.meter).toBe('4/4');
    expect(frame.score.measureCount).toBe(1);
    expect(frame.score.events).toEqual([]);
    expect(frame.challengeDescriptor.smallestValue).toBe('eighth');
  });

  it('음역은 설치물의 판본을 모두 아우른다: E1은 C4–E4, E2는 C4–B4(C4–E4와 G4–B4)', () => {
    expect(freeStonesFrameOf(E1, variantFn)!.challengeDescriptor.range).toBe('C4-E4');
    expect(freeStonesFrameOf(E2, variantFn)!.challengeDescriptor.range).toBe('C4-B4');
  });

  it('같은 입력에는 같은 틀 객체를 돌려준다(화면이 틀이 바뀐 줄 알고 다시 그리지 않게)', () => {
    expect(freeStonesFrameOf(E1, variantFn)).toBe(freeStonesFrameOf(E1, variantFn));
  });

  it('틀로 삼을 판본이 없으면 null이고, 돌 설치물이 아니면 null이다', () => {
    expect(freeStonesFrameOf(E1, () => undefined)).toBeNull();
    expect(freeStonesVariant([], lane1)).toBeNull();
    expect(freeStonesFrameOf(H4, variantFn)).toBeNull();
  });

  it('자유로 놀기의 시간선은 8분음표 칸이고 점4분·점2분까지 놓을 수 있다', () => {
    const s = timelineOf(freeStonesFrameOf(E2, variantFn)!);
    expect([s.measureTicks, s.cellTicks]).toEqual([3840, 480]);
    expect(stoneLengthsOf(freeSpecOf(s)).map((l) => l.name)).toEqual(['8분음표', '4분음표', '점4분음표', '2분음표', '점2분음표', '온음표']);
  });
});

// ---------------------------------------------------------------------------
// 6-5 잔물결 수로(E3, 확대형): 시간이 세로로 흐르고 1 px = 2틱. 카메라는 박 하나를 따라간다

describe('E3 잔물결 수로의 줄(4.4 확대형): 한 박 480 px, 한 마디 1920 px', () => {
  const E3 = installation('inst.beat-river.ripple-channel');
  const lane3 = laneOf(E3)!;

  it('줄: 세로(y)로 흐르고 y 700에서 시작해 1920 px, 칸은 60 px(32분음표 120틱), 두께는 96 px', () => {
    expect(isTimelineStones(E3)).toBe(true);
    expect(lane3).toEqual({ axis: 'y', ticksPerPx: 2, start: 700, cross: 6656, crossSize: 96, cellTicks: 120, laneTicks: 3840, voiceId: 'v1' });
    expect(E3.slots).toHaveLength(32);
    expect(E3.slots.every((s) => s.w === 96 && s.h === 60)).toBe(true);
  });

  it('박을 따라가는 줄인지는 변환표의 follow가 정한다: E3만 따라간다', () => {
    expect(followsBeat(E3)).toBe(true);
    expect(followsBeat(E1)).toBe(false);
    expect(followsBeat(E2)).toBe(false);
    expect(followsBeat(H4)).toBe(false);
    // 슬롯 지도가 없는 값도 따라가지 않는다
    expect(followsBeat({})).toBe(false);
  });

  it('틱 구간을 월드 사각형으로: 한 박은 480 px, 8분 셋잇단 뗏목은 한 박이고 돌 하나는 160 px, 4분 셋잇단 뗏목은 960 px(돌 하나 320 px)', () => {
    expect(laneRect(lane3, 0, 960)).toEqual({ x: 6656, y: 700, w: 96, h: 480 });
    expect(laneRect(lane3, 960, 1920)).toEqual({ x: 6656, y: 1180, w: 96, h: 480 });
    expect(laneRect(lane3, 1280, 1600)).toEqual({ x: 6656, y: 1340, w: 96, h: 160 });
    expect(laneRect(lane3, 1920, 3840)).toEqual({ x: 6656, y: 1660, w: 96, h: 960 });
    expect(laneRect(lane3, 2560, 3200)).toEqual({ x: 6656, y: 1980, w: 96, h: 320 });
    // 32분음표 하나(120틱)는 60 px, inset은 시간 방향(위아래)만 줄인다
    expect(laneRect(lane3, 120, 240)).toEqual({ x: 6656, y: 760, w: 96, h: 60 });
    expect(laneRect(lane3, 120, 240, 2)).toEqual({ x: 6656, y: 762, w: 96, h: 56 });
  });

  it('월드의 한 점이 줄에서 몇 틱 자리인지: 위에서 아래로 센다. 줄 밖이면 null', () => {
    expect(tickAtPoint(lane3, 6700, 700)).toBe(0);
    expect(tickAtPoint(lane3, 6700, 1180)).toBe(960);
    expect(tickAtPoint(lane3, 6700, 2619)).toBe(3838);
    expect(tickAtPoint(lane3, 6700, 699)).toBeNull();
    expect(tickAtPoint(lane3, 6700, 2620)).toBeNull();
    expect(tickAtPoint(lane3, 6655, 1000)).toBeNull();
    expect(tickAtPoint(lane3, 6753, 1000)).toBeNull();
  });

  it('칸 번호(1부터)와 시작 틱을 오간다: 칸 17은 3박의 처음(1920틱)', () => {
    expect(slotStartTick(lane3, 17)).toBe(1920);
    expect(slotOfTick(lane3, 1920)).toBe(17);
    expect(slotOfTick(lane3, 1919)).toBe(16);
    expect(slotOfTick(lane3, 3839)).toBe(32);
  });

  it('카메라가 담는 영역: 줄 전체에 박 번호 띠를 왼쪽에 더한다. 칸은 60 px라 확대 하한 0.8에서도 48 px 이상이다', () => {
    expect(slotBounds(E3)).toEqual({ x: 6656 - STONES_LABEL_TOP, y: 700, w: 96 + STONES_LABEL_TOP, h: 1920 });
    expect(frameTuningOf(E3)).toEqual({ pad: STONES_FRAME_PAD, minZoom: STONES_MIN_ZOOM });
    expect(60 * STONES_MIN_ZOOM).toBeGreaterThanOrEqual(48);
  });

  it('눌린 점의 틱: 눌린 칸 안으로 가둔다. 칸 사이 틈이나 가장자리를 눌러도 그 칸 안의 틱이다', () => {
    // 칸 11은 1200–1319틱(y 1300–1359)
    expect(tickAtSlotPoint(lane3, 11, 6700, 1300)).toBe(1200);
    expect(tickAtSlotPoint(lane3, 11, 6700, 1330)).toBe(1260);
    expect(tickAtSlotPoint(lane3, 11, 6700, 1359)).toBe(1318);
    // 손가락이 칸 위쪽 틈을 눌렀어도 그 칸의 시작이다
    expect(tickAtSlotPoint(lane3, 11, 6700, 1290)).toBe(1200);
    expect(tickAtSlotPoint(lane3, 11, 6700, 1400)).toBe(1319);
    // 가로 줄에서도 같다(E1 칸 3은 960–1439틱)
    expect(tickAtSlotPoint(lane1, 3, 6900, 2800)).toBe(960 + 8 * 20);
    expect(tickAtSlotPoint(lane1, 3, 6700, 2800)).toBe(960);
  });
});

describe('카메라가 따라갈 박(beatFollowOf)', () => {
  const E3 = installation('inst.beat-river.ripple-channel');
  const lane3 = laneOf(E3)!;
  const view = (patch: Partial<Parameters<typeof beatFollowOf>[1] & object> = {}) => ({ beatTicks: 960, measureTicks: 3840, cursor: null, playTick: null, ...patch });
  const cursorAt = (startTick: number) => ({ startTick, endTick: startTick + 120, kind: 'note' as const, ok: true });

  it('아무것도 고르지 않았으면 첫 박이다: 담는 사각형은 줄의 두께에 박 번호 띠(왼쪽 44)와 뗏목 표시 띠(오른쪽 32)를 더하고 길이는 박 하나(480 px)', () => {
    const f = beatFollowOf(lane3, view());
    expect(f.beat).toBe(0);
    expect(f.rect).toEqual({ x: 6656 - STONES_LABEL_TOP, y: 700, w: 96 + STONES_LABEL_TOP + STONES_RAFT_BAND, h: 480 });
    // 화면 중심으로 삼는 점: 줄의 가운데 두께, 첫 칸의 가운데
    expect(f.focus).toEqual({ x: 6704, y: 730 });
    expect(STONES_RAFT_BAND).toBe(32);
  });

  it('고른 칸이 있는 박을 따라간다: 1300틱은 2박(960–1919틱, y 1180–1659)', () => {
    const f = beatFollowOf(lane3, view({ cursor: cursorAt(1200) }));
    expect(f.beat).toBe(1);
    expect(f.rect).toMatchObject({ y: 1180, h: 480 });
    expect(f.focus).toEqual({ x: 6704, y: 700 + (1200 + 60) / 2 });
    // 칸을 박의 처음으로 옮기면 박이 바뀐다
    expect(beatFollowOf(lane3, view({ cursor: cursorAt(1920) })).beat).toBe(2);
    expect(beatFollowOf(lane3, view({ cursor: cursorAt(1919) })).beat).toBe(1);
  });

  it('듣는 중이면 물결 선이 있는 박이 먼저다(고른 칸보다 앞선다)', () => {
    const f = beatFollowOf(lane3, view({ cursor: cursorAt(0), playTick: 3000 }));
    expect(f.beat).toBe(3);
    expect(f.rect).toMatchObject({ y: 700 + 3 * 480, h: 480 });
    expect(f.focus.y).toBe(700 + (3000 + 60) / 2);
  });

  it('줄 밖의 값은 마디 안으로 가둔다: 마디 끝을 넘은 틱은 마지막 박, 음수는 첫 박', () => {
    expect(beatFollowOf(lane3, view({ playTick: 99999 })).beat).toBe(3);
    expect(beatFollowOf(lane3, view({ cursor: cursorAt(-500) })).beat).toBe(0);
  });

  it('3/4박자(마디 2880틱)는 세 박뿐이다: 마지막 박은 마디 끝에서 끝나고 그 뒤 박은 없다', () => {
    const v = view({ measureTicks: 2880 });
    expect(beatFollowOf(lane3, { ...v, cursor: cursorAt(2879) }).beat).toBe(2);
    expect(beatFollowOf(lane3, { ...v, playTick: 3500 }).beat).toBe(2);
    expect(beatFollowOf(lane3, { ...v, cursor: cursorAt(2879) }).rect).toMatchObject({ y: 700 + 2 * 480, h: 480 });
  });

  it('6/8처럼 박이 960틱이 아니면 그 박의 길이를 쓴다(점4분음표 한 박 1440틱 = 720 px)', () => {
    const f = beatFollowOf(lane3, { beatTicks: 1440, measureTicks: 2880, cursor: cursorAt(1500), playTick: null });
    expect(f.beat).toBe(1);
    expect(f.rect).toMatchObject({ y: 700 + 720, h: 720 });
  });

  it('모습을 아직 받지 못한 첫 프레임(tl 없음)에는 첫 박이다. 박의 길이는 4분음표(960틱)로 본다', () => {
    const f = beatFollowOf(lane3);
    expect(f.beat).toBe(0);
    expect(f.rect).toMatchObject({ y: 700, h: 480 });
  });

  it('가로 줄에서도 같은 계산이다: 박의 길이는 가로이고 두께는 세로다(띠는 위와 아래)', () => {
    const f = beatFollowOf(lane1, view({ cursor: cursorAt(1000) }));
    expect(f.beat).toBe(1);
    expect(f.rect).toEqual({ x: 6760 + 120, y: 2752 - STONES_LABEL_TOP, w: 120, h: 96 + STONES_LABEL_TOP + STONES_RAFT_BAND });
    expect(f.focus).toEqual({ x: 6760 + (1000 + 240) / 8, y: 2752 + 48 });
  });
});
