// 1-7 ChallengeSession 검사. 완료 기준: 연습에서 아무것도 하지 않고 돌아와도 초안, 판본, 선택 마디가 같다.
import { describe, expect, it } from 'vitest';
import { writtenOf } from '@/domain/pitch';
import { ChallengeSession, MAX_UNDO, draftKey, spellWritten, validateSessionSnapshot } from '@/domain/session';
import type { SessionSnapshot } from '@/domain/session';
import { note, p, rest } from './helpers';

const W = (text: string) => writtenOf(p(text));

function openQ07(s: ChallengeSession): void {
  s.openChallenge('scale.major', 'c-major', { tempoBpm: 80 });
}

describe('초안', () => {
  it('도전을 열면 빈 초안이 생기고, 도전마다 초안이 따로다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.openChallenge('rhythm.rest-in-a-bar', 'basic');
    expect(s.content().slots).toEqual([]);
    s.apply({ type: 'addEvent', event: note('n1', 0, 0, 960, 'C4') });
    s.openChallenge('scale.major', 'c-major');
    expect(s.content().slots).toHaveLength(1);
    expect(s.content().events).toHaveLength(0);
    expect(s.draftKeys().sort()).toEqual([draftKey('rhythm.rest-in-a-bar', 'basic'), draftKey('scale.major', 'c-major')].sort());
  });

  it('같은 과제의 다른 판본은 초안이 따로다', () => {
    const s = new ChallengeSession();
    s.openChallenge('scale.major', 'c-major');
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.openChallenge('scale.major', 'g-major');
    expect(s.content().slots).toEqual([]);
    expect(s.contentOf('scale.major', 'c-major').slots).toHaveLength(1);
  });

  it('도전을 닫아도 초안은 남는다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 3, writtenPitch: W('E4') });
    s.closeChallenge();
    expect(s.activeChallenge).toBeNull();
    openQ07(s);
    expect(s.content().slots.map((x) => x.slot)).toEqual([3]);
  });

  it('열려 있는 도전이 없으면 편집은 오류다', () => {
    const s = new ChallengeSession();
    expect(() => s.apply({ type: 'clear' })).toThrow(/열려 있는 도전이 없어요/);
  });

  it('칸을 놓고 비우고 소리를 끈다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 2, writtenPitch: W('D4') });
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 2]); // 번호순
    s.apply({ type: 'setSlotMuted', slot: 2, muted: true });
    expect(s.content().slots[1]!.muted).toBe(true);
    s.apply({ type: 'setSlotMuted', slot: 2, muted: false });
    expect(s.content().slots[1]!.muted).toBeUndefined();
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: null });
    expect(s.content().slots.map((x) => x.slot)).toEqual([2]);
    expect(() => s.apply({ type: 'setSlotMuted', slot: 9, muted: true })).toThrow(/9번째 칸이 비어 있어요/);
  });

  it('소리 높이만 고르는 칸(깃발)도 담는다', () => {
    const s = new ChallengeSession();
    s.openChallenge('scale.keyboard-flags', 'v1');
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: null, midi: 62 });
    expect(s.content().slots).toEqual([{ slot: 1, writtenPitch: null, midi: 62 }]);
  });

  it('사건을 더하고 바꾸고 지운다. 지운 사건은 셋잇단 묶음에서도 빠진다', () => {
    const s = new ChallengeSession();
    s.openChallenge('rhythm.rest-in-a-bar', 'basic');
    s.apply({ type: 'addEvent', event: note('n1', 0, 0, 640, 'C4', { groupId: 'g1' }) });
    s.apply({ type: 'addEvent', event: note('n2', 0, 640, 640, 'D4', { groupId: 'g1' }) });
    s.apply({ type: 'setTuplets', tuplets: [{ groupId: 'g1', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['n1', 'n2'] }] });
    expect(() => s.apply({ type: 'addEvent', event: note('n1', 1, 0, 960, 'E4') })).toThrow(/겹쳐요/);
    s.apply({ type: 'replaceEvent', eventId: 'n2', event: rest('n2', 0, 640, 640, { groupId: 'g1' }) });
    expect(s.content().events[1]!.type).toBe('rest');
    s.apply({ type: 'removeEvent', eventId: 'n1' });
    expect(s.content().tuplets[0]!.eventIds).toEqual(['n2']);
    s.apply({ type: 'removeEvent', eventId: 'n2' });
    expect(s.content().tuplets).toEqual([]); // 비어 버린 묶음은 사라진다
    expect(() => s.apply({ type: 'removeEvent', eventId: 'zzz' })).toThrow(/없는 사건/);
    expect(() => s.apply({ type: 'replaceEvent', eventId: 'zzz', event: rest('zzz', 0, 0, 960) })).toThrow(/없는 사건/);
  });

  it('내용 복사본을 고쳐도 초안은 바뀌지 않는다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    const c = s.content();
    c.slots[0]!.writtenPitch = W('G4');
    c.slots.push({ slot: 8, writtenPitch: W('C5') });
    expect(s.content().slots).toEqual([{ slot: 1, writtenPitch: W('C4') }]);
  });
});

describe('실행 취소와 다시 실행', () => {
  it('고친 순서의 거꾸로 되돌리고 다시 실행한다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.apply({ type: 'setSlot', slot: 2, writtenPitch: W('D4') });
    s.apply({ type: 'setSlot', slot: 3, writtenPitch: W('E4') });
    expect(s.undoDepth).toBe(3);
    expect(s.undo()).toBe(true);
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 2]);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.content().slots).toEqual([]);
    expect(s.undo()).toBe(false); // 더 되돌릴 것이 없다
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.content().slots.map((x) => x.slot)).toEqual([1]);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(false);
  });

  it('새로 고치면 다시 실행 기록이 사라진다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.apply({ type: 'setSlot', slot: 2, writtenPitch: W('D4') });
    s.undo();
    expect(s.canRedo).toBe(true);
    s.apply({ type: 'setSlot', slot: 5, writtenPitch: W('G4') });
    expect(s.canRedo).toBe(false);
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 5]);
  });

  it('내용이 바뀌지 않는 편집은 기록을 늘리지 않는다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') }); // 같은 값
    s.apply({ type: 'setSlot', slot: 7, writtenPitch: null }); // 이미 빈 칸
    s.apply({ type: 'setTuplets', tuplets: [] }); // 이미 없다
    expect(s.undoDepth).toBe(1);
  });

  it('기록은 정해진 깊이까지만 남긴다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    for (let i = 0; i < MAX_UNDO + 10; i++) {
      s.apply({ type: 'setSlot', slot: 1, writtenPitch: W(i % 2 === 0 ? 'C4' : 'D4') });
    }
    expect(s.undoDepth).toBe(MAX_UNDO);
    let n = 0;
    while (s.undo()) n++;
    expect(n).toBe(MAX_UNDO);
  });

  it('선택은 실행 취소 기록에 들어가지 않는다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.select({ slot: 1, measure: 0 });
    s.select({ slot: 4 });
    expect(s.undoDepth).toBe(1);
    expect(s.selection()).toEqual({ slot: 4 });
  });

  it('도전마다 실행 취소 기록이 따로다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.openChallenge('scale.major', 'g-major');
    expect(s.canUndo).toBe(false);
    expect(s.undo()).toBe(false);
    s.openChallenge('scale.major', 'c-major');
    expect(s.canUndo).toBe(true);
  });
});

describe('도움 이동과 복귀 (1-7 완료 기준)', () => {
  function prepared(): ChallengeSession {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.apply({ type: 'setSlot', slot: 2, writtenPitch: W('D4') });
    s.apply({ type: 'setSlot', slot: 4, writtenPitch: W('F4') });
    s.select({ slot: 4, measure: 1 });
    return s;
  }

  it('연습에서 아무것도 하지 않고 돌아와도 초안, 판본, 선택 마디가 같다', () => {
    const s = prepared();
    const before = s.serialize();
    expect(s.enterAssist('basicPractice', 'practice.scale-step').autoplay).toBe(false);
    expect(s.inAssist).toBe(true);
    expect(s.returnToOrigin().autoplay).toBe(false);
    expect(s.inAssist).toBe(false);
    const after = s.serialize();
    expect(after).toEqual(before);
    expect(s.activeChallenge).toEqual({ questId: 'scale.major', variantId: 'c-major', challengeSettings: { tempoBpm: 80 } });
    expect(s.selection()).toEqual({ slot: 4, measure: 1 });
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 2, 4]);
  });

  it('실행 취소 기록도 그대로 돌아온다', () => {
    const s = prepared();
    const depth = s.undoDepth;
    s.enterAssist('listenPair', 'practice.listen');
    s.returnToOrigin();
    expect(s.undoDepth).toBe(depth);
    expect(s.undo()).toBe(true);
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 2]);
  });

  it('연습 중에는 원래 초안을 고칠 수 없다', () => {
    const s = prepared();
    s.enterAssist('basicPractice', 'practice.scale-step');
    expect(() => s.apply({ type: 'clear' })).toThrow(/도움 연습 중에는 원래 초안을 고칠 수 없어요/);
    expect(() => s.undo()).toThrow(/도움 연습 중/);
    expect(() => s.redo()).toThrow(/도움 연습 중/);
    expect(() => s.select({ slot: 1 })).toThrow(/도움 연습 중/);
    expect(s.canUndo).toBe(false); // 연습 중에는 버튼이 꺼진다
    s.returnToOrigin();
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 2, 4]);
  });

  it('연습 중에는 다른 도전을 열 수 없고 먼저 돌아와야 한다', () => {
    const s = prepared();
    s.enterAssist('basicPractice', 'practice.scale-step');
    expect(() => s.openChallenge('rhythm.rest-in-a-bar', 'basic')).toThrow(/원래 곡으로 돌아가 주세요/);
    s.returnToOrigin();
    expect(() => s.openChallenge('rhythm.rest-in-a-bar', 'basic')).not.toThrow();
  });

  it('연습 안에서 또 연습을 열어도 최상위 출발점으로 돌아온다', () => {
    const s = prepared();
    const before = s.serialize();
    s.enterAssist('basicPractice', 'practice.a');
    s.enterAssist('listenPair', 'practice.b');
    s.enterAssist('basicPractice', 'practice.c');
    expect(s.supportContext!.depth).toBe(3);
    expect(s.supportContext!.practiceId).toBe('practice.c');
    s.returnToOrigin();
    expect(s.inAssist).toBe(false);
    expect(s.serialize()).toEqual(before);
  });

  it('도움 설정은 도전 설정과 따로다', () => {
    const s = prepared();
    s.enterAssist('listenPair', 'practice.listen', { tempoBpm: 50, loop: true });
    s.updateAssistSettings({ tempoBpm: 40 });
    expect(s.supportContext!.assistSettings).toEqual({ tempoBpm: 40, loop: true });
    expect(s.activeChallenge!.challengeSettings).toEqual({ tempoBpm: 80 });
    expect(() => s.updateChallengeSettings({ tempoBpm: 120 })).toThrow(/도움 연습 중에는 도전 설정을 바꿀 수 없어요/);
    s.returnToOrigin();
    expect(s.activeChallenge!.challengeSettings).toEqual({ tempoBpm: 80 }); // 연습의 40이 새어 나오지 않는다
    expect(s.supportContext).toBeNull();
  });

  it('다음 도움 연습의 설정은 이전 연습에서 이어지지 않는다', () => {
    const s = prepared();
    s.enterAssist('listenPair', 'practice.listen', { tempoBpm: 50 });
    s.returnToOrigin();
    s.enterAssist('listenPair', 'practice.listen');
    expect(s.supportContext!.assistSettings).toEqual({});
  });

  it('도움 연습 중이 아닐 때 복귀를 눌러도 아무것도 바뀌지 않고 실패하지도 않는다', () => {
    const s = prepared();
    const before = s.serialize();
    expect(() => s.returnToOrigin()).not.toThrow();
    expect(s.returnToOrigin().autoplay).toBe(false);
    expect(s.serialize()).toEqual(before);
  });

  it('복귀는 연습 안에서 무슨 일이 있어도 반복해서 성공한다', () => {
    const s = prepared();
    const before = s.serialize();
    s.enterAssist('basicPractice', 'practice.a');
    s.updateAssistSettings({ tempoBpm: 1 });
    s.returnToOrigin();
    s.returnToOrigin();
    s.returnToOrigin();
    expect(s.serialize()).toEqual(before);
  });

  it('도전을 닫으면 연습도 정리되고 원래 초안은 남는다', () => {
    const s = prepared();
    s.enterAssist('basicPractice', 'practice.a');
    s.closeChallenge();
    expect(s.inAssist).toBe(false);
    expect(s.activeChallenge).toBeNull();
    openQ07(s);
    expect(s.content().slots.map((x) => x.slot)).toEqual([1, 2, 4]);
  });

  it('열려 있는 도전이 없으면 도움 연습을 열 수 없다', () => {
    const s = new ChallengeSession();
    expect(() => s.enterAssist('basicPractice', 'practice.a')).toThrow(/열려 있는 도전이 없어요/);
  });

  it('도움으로 들어가고 돌아오는 어떤 전환에서도 소리는 저절로 나지 않는다', () => {
    const s = new ChallengeSession();
    const results = [
      s.openChallenge('scale.major', 'c-major'),
      s.enterAssist('basicPractice', 'p'),
      s.enterAssist('listenPair', 'q'),
      s.returnToOrigin(),
      s.returnToOrigin(),
      s.closeChallenge(),
    ];
    for (const r of results) expect(r.autoplay).toBe(false);
  });
});

describe('기본 연습: 연습 과제를 따로 열기(5-5)', () => {
  const Q08 = ['song.short-piece', 'one-voice'] as const;
  const Q02 = ['rhythm.rest-in-a-bar', 'quarter-rest'] as const;

  /** Q08 한 성부 판본의 첫 마디에 음을 놓아 둔 세션 */
  function preparedSong(): ChallengeSession {
    const s = new ChallengeSession();
    s.openChallenge(Q08[0], Q08[1], { tempoBpm: 80 });
    s.apply({ type: 'addEvent', event: note('n1', 0, 0, 960, 'C4') });
    s.apply({ type: 'addEvent', event: note('n2', 0, 960, 960, 'D4') });
    s.select({ measure: 0, slot: 0 });
    return s;
  }
  const practice = (s: ChallengeSession): void => void s.enterAssist('basicPractice', Q02[0], {}, { questId: Q02[0], variantId: Q02[1], challengeSettings: { tempoBpm: 80 } });

  it('연습으로 들어가면 연습 과제가 지금 도전이 되고, 연습 과제의 초안은 따로 고칠 수 있다', () => {
    const s = preparedSong();
    practice(s);
    expect(s.inAssist).toBe(true);
    expect(s.activeChallenge).toEqual({ questId: Q02[0], variantId: Q02[1], challengeSettings: { tempoBpm: 80 } });
    expect(s.supportContext!.practice).toEqual({ questId: Q02[0], variantId: Q02[1], challengeSettings: { tempoBpm: 80 } });
    expect(s.content().events).toEqual([]); // 연습 과제는 자기 초안을 쓴다
    s.apply({ type: 'addEvent', event: note('p1', 0, 0, 960, 'C4') });
    expect(s.content().events).toHaveLength(1);
    expect(s.canUndo).toBe(true);
    s.select({ measure: 0, slot: 2 });
    expect(s.selection()).toEqual({ measure: 0, slot: 2 });
  });

  it('연습을 끝내지 않고 돌아와도 원래 곡의 첫 마디 배치와 선택이 그대로 복원된다', () => {
    const s = preparedSong();
    const before = s.serialize();
    const keptEvents = s.content().events;
    practice(s);
    s.apply({ type: 'addEvent', event: note('p1', 0, 0, 960, 'E4') });
    s.apply({ type: 'addEvent', event: note('p2', 0, 960, 960, 'F4') });
    expect(s.returnToOrigin().autoplay).toBe(false);
    expect(s.inAssist).toBe(false);
    expect(s.activeChallenge).toEqual({ questId: Q08[0], variantId: Q08[1], challengeSettings: { tempoBpm: 80 } });
    expect(s.content().events).toEqual(keptEvents);
    expect(s.selection()).toEqual({ measure: 0, slot: 0 });
    expect(s.undoDepth).toBe(2);
    // 원래 곡의 저장 내용은 그대로이고, 연습 과제의 초안이 하나 더 생겼다
    const after = s.serialize();
    expect(after.activeChallenge).toEqual(before.activeChallenge);
    expect(after.challengeDrafts[draftKey(Q08[0], Q08[1])]).toEqual(before.challengeDrafts[draftKey(Q08[0], Q08[1])]);
    expect(Object.keys(after.challengeDrafts).sort()).toEqual([draftKey(Q02[0], Q02[1]), draftKey(Q08[0], Q08[1])].sort());
    expect(after.supportContext).toBeNull();
  });

  it('연습 중에 다른 도전을 열면 막히고, 연습 과제를 다시 여는 것은 그대로 둔다', () => {
    const s = preparedSong();
    practice(s);
    expect(() => s.openChallenge('scale.major', 'c-major')).toThrow(/원래 곡으로 돌아가 주세요/);
    expect(() => s.openChallenge(Q08[0], Q08[1])).toThrow(/원래 곡으로 돌아가 주세요/);
    s.apply({ type: 'addEvent', event: note('p1', 0, 0, 960, 'C4') });
    expect(() => s.openChallenge(Q02[0], Q02[1], { tempoBpm: 60 })).not.toThrow();
    expect(s.inAssist).toBe(true);
    expect(s.content().events).toHaveLength(1);
    expect(s.activeChallenge!.challengeSettings).toEqual({ tempoBpm: 60 });
    s.returnToOrigin();
    expect(s.activeChallenge!.challengeSettings).toEqual({ tempoBpm: 80 }); // 연습의 설정이 새어 나오지 않는다
  });

  it('연습 과제의 도전 설정은 연습 안에서 바꿀 수 있고 돌아오면 사라진다', () => {
    const s = preparedSong();
    practice(s);
    expect(() => s.updateChallengeSettings({ tempoBpm: 50 })).not.toThrow();
    expect(s.activeChallenge!.challengeSettings).toEqual({ tempoBpm: 50 });
    s.returnToOrigin();
    expect(s.activeChallenge!.challengeSettings).toEqual({ tempoBpm: 80 });
  });

  it('연습 과제 없이 연 도움은 전과 같이 원래 초안을 고칠 수 없다', () => {
    const s = preparedSong();
    s.enterAssist('listenPair', 'practice.listen');
    expect(s.supportContext!.practice).toBeUndefined();
    expect(() => s.apply({ type: 'clear' })).toThrow(/도움 연습 중에는 원래 초안을 고칠 수 없어요/);
    expect(s.activeChallenge!.questId).toBe(Q08[0]);
  });

  it('연습 안에서 연습 과제 없는 도움을 또 열면 연습 과제 초안도 잠기고, 돌아가면 최상위 출발점이다', () => {
    const s = preparedSong();
    const before = s.serialize();
    practice(s);
    s.enterAssist('listenPair', 'practice.listen');
    expect(s.supportContext).toMatchObject({ depth: 2 });
    expect(s.supportContext!.practice).toBeUndefined();
    expect(() => s.apply({ type: 'clear' })).toThrow(/도움 연습 중/);
    s.returnToOrigin();
    expect(s.activeChallenge).toEqual(before.activeChallenge);
    expect(s.content().events).toHaveLength(2);
  });

  it('연습에서 연습으로 옮겨 가도 원래 곡은 처음 것이다(연습 과제만 바뀐다)', () => {
    const s = preparedSong();
    practice(s);
    s.enterAssist('basicPractice', 'rhythm.short-notes-and-triplets', {}, { questId: 'rhythm.short-notes-and-triplets', variantId: 'thirty-seconds-triplet' });
    expect(s.supportContext).toMatchObject({ depth: 2, practiceId: 'rhythm.short-notes-and-triplets', practice: { questId: 'rhythm.short-notes-and-triplets' } });
    expect(s.activeChallenge!.questId).toBe('rhythm.short-notes-and-triplets');
    s.returnToOrigin();
    expect(s.activeChallenge!.questId).toBe(Q08[0]);
    expect(s.content().events).toHaveLength(2);
  });

  it('도전을 닫으면 연습도 정리되고 원래 곡의 초안은 남는다', () => {
    const s = preparedSong();
    practice(s);
    s.closeChallenge();
    expect(s.inAssist).toBe(false);
    expect(s.activeChallenge).toBeNull();
    s.openChallenge(Q08[0], Q08[1]);
    expect(s.content().events).toHaveLength(2);
  });

  it('연습 중에 저장하고 복원해도 연습은 이어지고, 돌아가면 원래 곡이다', () => {
    const s = preparedSong();
    const originDraft = s.serialize().challengeDrafts[draftKey(Q08[0], Q08[1])];
    practice(s);
    s.apply({ type: 'addEvent', event: note('p1', 0, 0, 960, 'C4') });
    const snap = JSON.parse(JSON.stringify(s.serialize())) as SessionSnapshot;
    expect(validateSessionSnapshot(snap)).toEqual([]);
    const r = ChallengeSession.restore(snap);
    expect(r.inAssist).toBe(true);
    expect(r.activeChallenge!.questId).toBe(Q02[0]);
    expect(r.content().events).toHaveLength(1);
    expect(r.canUndo).toBe(true); // 연습 과제는 고칠 수 있다
    r.returnToOrigin();
    expect(r.activeChallenge!.questId).toBe(Q08[0]);
    expect(r.serialize().challengeDrafts[draftKey(Q08[0], Q08[1])]).toEqual(originDraft);
  });

  it('저장된 연습 정보의 형식이 틀리면 거른다', () => {
    const s = preparedSong();
    practice(s);
    const snap = JSON.parse(JSON.stringify(s.serialize())) as { supportContext: Record<string, unknown> };
    expect(validateSessionSnapshot(snap)).toEqual([]);
    snap.supportContext.practice = { questId: 7 };
    expect(validateSessionSnapshot(snap).join('|')).toContain('supportContext.practice');
    snap.supportContext.practice = { questId: Q02[0], variantId: Q02[1], challengeSettings: 3 };
    expect(validateSessionSnapshot(snap).join('|')).toContain('supportContext.practice');
  });

  it('여러 번 눌러도 돌아오는 것은 같다', () => {
    const s = preparedSong();
    const before = s.serialize();
    practice(s);
    s.returnToOrigin();
    const once = s.serialize();
    s.returnToOrigin();
    s.returnToOrigin();
    expect(s.serialize()).toEqual(once);
    expect(once.activeChallenge).toEqual(before.activeChallenge);
  });
});

describe('저장과 복원', () => {
  it('저장했다가 복원하면 같은 상태다(초안, 선택, 실행 취소 기록 포함)', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.apply({ type: 'setSlot', slot: 2, writtenPitch: W('D4') });
    s.select({ slot: 2, measure: 0 });
    const snap = JSON.parse(JSON.stringify(s.serialize())) as SessionSnapshot; // 저장소를 거친 것처럼
    const r = ChallengeSession.restore(snap);
    expect(r.serialize()).toEqual(snap);
    expect(r.content()).toEqual(s.content());
    expect(r.selection()).toEqual({ slot: 2, measure: 0 });
    expect(r.undoDepth).toBe(2);
    expect(r.undo()).toBe(true);
    expect(r.content().slots.map((x) => x.slot)).toEqual([1]);
  });

  it('다시 실행 기록은 저장하지 않는다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.undo();
    const r = ChallengeSession.restore(s.serialize());
    expect(r.canRedo).toBe(false);
  });

  it('도움 연습 중에 저장해도 복원 뒤 돌아가면 원래 도전이다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.select({ slot: 1, measure: 0 });
    const origin = s.serialize();
    s.enterAssist('listenPair', 'practice.listen', { tempoBpm: 50 });
    const snap = JSON.parse(JSON.stringify(s.serialize())) as SessionSnapshot;
    const r = ChallengeSession.restore(snap);
    expect(r.inAssist).toBe(true);
    expect(r.supportContext!.assistSettings).toEqual({ tempoBpm: 50 });
    r.returnToOrigin();
    expect(r.serialize()).toEqual(origin);
  });

  it('빈 초안은 저장하지 않는다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    expect(s.serialize().challengeDrafts).toEqual({});
  });

  it('초안이 비어 있어도 선택이나 실행 취소 기록이 있으면 저장한다', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.apply({ type: 'clear' });
    expect(Object.keys(s.serialize().challengeDrafts)).toHaveLength(1);
  });

  it('저장 내용에는 점수나 판정 결과가 들어가지 않는다(반응은 다시 계산한다)', () => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    const text = JSON.stringify(s.serialize());
    for (const word of ['passed', 'needsRevision', 'AttemptResult', 'lamp', 'score']) expect(text).not.toContain(word);
  });
});

describe('저장된 세션 검사', () => {
  const valid = (): SessionSnapshot => {
    const s = new ChallengeSession();
    openQ07(s);
    s.apply({ type: 'setSlot', slot: 1, writtenPitch: W('C4') });
    s.enterAssist('basicPractice', 'practice.a');
    return JSON.parse(JSON.stringify(s.serialize())) as SessionSnapshot;
  };

  it('올바른 저장은 오류가 없다', () => {
    expect(validateSessionSnapshot(valid())).toEqual([]);
    expect(validateSessionSnapshot({ activeChallenge: null, challengeDrafts: {}, supportContext: null })).toEqual([]);
  });

  it('형식이 어긋난 저장을 거른다', () => {
    expect(validateSessionSnapshot(null)).toEqual(['세션이 객체가 아니에요']);
    expect(validateSessionSnapshot([])).toEqual(['세션이 객체가 아니에요']);
    const a = valid() as unknown as Record<string, unknown>;
    a.activeChallenge = { questId: '', variantId: 'x', challengeSettings: {} };
    expect(validateSessionSnapshot(a).join('|')).toContain('activeChallenge');
    const b = valid() as unknown as { challengeDrafts: Record<string, Record<string, unknown>> };
    const k = Object.keys(b.challengeDrafts)[0]!;
    b.challengeDrafts[k]!.undoDepth = 99;
    expect(validateSessionSnapshot(b).join('|')).toContain('undoDepth');
    b.challengeDrafts['잘못된키'] = b.challengeDrafts[k]!;
    expect(validateSessionSnapshot(b).join('|')).toContain('초안 키가 올바르지 않아요');
    const c = valid() as unknown as Record<string, unknown>;
    c.supportContext = { assistType: 'x' };
    expect(validateSessionSnapshot(c).join('|')).toContain('supportContext');
    const d = valid() as unknown as { challengeDrafts: Record<string, { slots: unknown }> };
    const dk = Object.keys(d.challengeDrafts)[0]!;
    d.challengeDrafts[dk]!.slots = [{ slot: -1 }];
    expect(validateSessionSnapshot(d).join('|')).toContain('칸 번호');
    d.challengeDrafts[dk]!.slots = [{ slot: 1.5 }];
    expect(validateSessionSnapshot(d).join('|')).toContain('칸 번호');
    d.challengeDrafts[dk]!.slots = [{ slot: '1' }];
    expect(validateSessionSnapshot(d).join('|')).toContain('칸 번호');
  });

  it('오선 칸은 0번부터 센다: 0번 칸을 채운 Q01 초안도 저장하고 되살릴 수 있다(회귀)', () => {
    // 4단계에서 찾은 잠복 오류: 검사가 "1 이상"만 받아서 Q01의 첫 칸을 채운 초안이 복원 때 거부될 뻔했다.
    const s = new ChallengeSession();
    s.openChallenge('pitch.same-note-two-clefs', 'middle-c');
    s.apply({ type: 'setSlot', slot: 0, writtenPitch: W('C4') });
    const snap = JSON.parse(JSON.stringify(s.serialize())) as SessionSnapshot;
    expect(validateSessionSnapshot(snap)).toEqual([]);
    const back = ChallengeSession.restore(snap);
    expect(back.content().slots.map((x) => x.slot)).toEqual([0]);
    expect(back.serialize()).toEqual(s.serialize());
  });

  it('망가진 저장으로는 세션을 만들 수 없다(저장소가 이전 저장을 쓰게 한다)', () => {
    expect(() => new ChallengeSession({ activeChallenge: null, challengeDrafts: 3 as never, supportContext: null })).toThrow(/세션 저장 형식이 올바르지 않아요/);
  });
});

describe('칸에 놓은 음의 이름 정하기', () => {
  it('조표가 없으면 임시표 없는 음은 자연음이다', () => {
    expect(spellWritten({ letter: 'F', octave: 4, accidental: null }, 0)).toEqual({ letter: 'F', alter: 0, octave: 4 });
  });

  it('조표가 이름을 바꾼다(올림표 1개: F는 F♯)', () => {
    expect(spellWritten({ letter: 'F', octave: 4, accidental: null }, 1)).toEqual({ letter: 'F', alter: 1, octave: 4 });
    expect(spellWritten({ letter: 'G', octave: 4, accidental: null }, 1)).toEqual({ letter: 'G', alter: 0, octave: 4 });
  });

  it('임시표가 조표보다 우선한다. 제자리표는 조표를 지운다', () => {
    expect(spellWritten({ letter: 'F', octave: 4, accidental: 'natural' }, 1)).toEqual({ letter: 'F', alter: 0, octave: 4 });
    expect(spellWritten({ letter: 'B', octave: 3, accidental: 'sharp' }, -2)).toEqual({ letter: 'B', alter: 1, octave: 3 });
  });
});
