// 4-2 자리 변환표와 Q07 인수 시험 다섯 가지(설계서 12.7 4-2, 4.3).
// 변환표 → 초안 → 판정기까지 설치물과 패널이 같은 길을 쓰는지 본다. 좌표와 시간은 어디에도 나오지 않는다(W-3).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateDraft } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { renderAll } from '@/domain/feedback';
import { ChallengeSession } from '@/domain/session';
import type { DraftContent } from '@/domain/session';
import { SLOT_NOTE_TICKS, STEP_NOTE_SEC, flaggedSlots, hasSlotMap, shiftAccidental, slotMapOf } from '@/domain/slotmap';
import type { Hand } from '@/domain/slotmap';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const q07 = JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', 'scale.major.json'), 'utf-8')) as QuestDefinition;
const cMajor = q07.variants['c-major']!;
const fMajor = q07.variants['f-major']!;
const cMap = slotMapOf(cMajor);
const fMap = slotMapOf(fMajor);

/** 선반의 이름('F4')과 변화표로 손에 든 재료를 만든다 */
const hand = (map: ReturnType<typeof slotMapOf>, name: string, accidental: Hand['accidental'] = null): Hand => {
  const i = map.shelf.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`선반에 ${name}이 없어요`);
  return { shelfIndex: i, accidental };
};

/** 변환표로 자리에 놓는다. 설치물도 패널도 이 편집을 쓴다 */
function sessionWith(variantId: 'c-major' | 'f-major', placements: Array<[number, string, Hand['accidental']?]>): { session: ChallengeSession; content: () => DraftContent } {
  const map = variantId === 'c-major' ? cMap : fMap;
  const session = new ChallengeSession();
  session.openChallenge(q07.questId, variantId);
  for (const [slot, name, acc] of placements) session.apply(map.place(slot, hand(map, name, acc ?? null)));
  return { session, content: () => session.content() };
}

const F_MAJOR: Array<[number, string, Hand['accidental']?]> = [
  [1, 'F4'],
  [2, 'G4'],
  [3, 'A4'],
  [4, 'B4'], // 조표의 ♭이 적용돼 B♭4
  [5, 'C5'],
  [6, 'D5'],
  [7, 'E5'],
  [8, 'F5'],
];

describe('재료 선반(4.3)', () => {
  it('으뜸음 한 음 아래부터 옥타브 위 한 음까지다: C장조는 B3–D5, F장조는 E4–G5', () => {
    expect(cMap.shelf.map((s) => s.name)).toEqual(['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']);
    expect(fMap.shelf.map((s) => s.name)).toEqual(['E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']);
    expect(cMap.shelf[cMap.tonicIndex]!.name).toBe('C4');
    expect(fMap.shelf[fMap.tonicIndex]!.name).toBe('F4');
  });

  it('자리는 여덟 개이고 판정기의 성부와 같은 v1이다', () => {
    expect(cMap.count).toBe(8);
    expect(fMap.count).toBe(8);
    expect(cMap.voiceId).toBe('v1');
  });

  it('조표가 적용된 이름이 돌에 쓰인다: F장조에서 B는 B♭4', () => {
    expect(fMap.keySignature).toBe(-1);
    expect(fMap.nameOf(hand(fMap, 'B4'))).toBe('B♭4');
    expect(fMap.nameOf(hand(fMap, 'A4', 'sharp'))).toBe('A♯4');
    expect(cMap.nameOf(hand(cMap, 'B4'))).toBe('B4');
  });

  it('변화표 고르기는 ♭ · 없음 · ♯ 사이를 오가고 끝에서 멈춘다', () => {
    expect(shiftAccidental(null, 1)).toBe('sharp');
    expect(shiftAccidental('sharp', 1)).toBe('sharp');
    expect(shiftAccidental(null, -1)).toBe('flat');
    expect(shiftAccidental('flat', -1)).toBe('flat');
    expect(shiftAccidental('flat', 1)).toBeNull();
  });

  it('음계 순서 판정기가 아닌 판본에는 변환표가 없다', () => {
    const q01 = JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', 'pitch.same-note-two-clefs.json'), 'utf-8')) as QuestDefinition;
    const v = q01.variants['middle-c']!;
    expect(hasSlotMap(v)).toBe(false);
    expect(() => slotMapOf(v)).toThrow('orderedPitches');
    expect(hasSlotMap(cMajor)).toBe(true);
  });

  it('자리 번호는 1부터 8까지만 받는다', () => {
    expect(() => cMap.place(0, hand(cMap, 'C4'))).toThrow('1부터 8까지');
    expect(() => cMap.place(9, hand(cMap, 'C4'))).toThrow('1부터 8까지');
    expect(() => cMap.clear(1.5)).toThrow('1부터 8까지');
  });
});

describe('Q07 인수 시험 다섯 가지(설치물과 패널이 같은 변환표를 쓴다)', () => {
  it('① F장조 정답: F4 G4 A4 B♭4 C5 D5 E5 F5 (MIDI 65 67 69 70 72 74 76 77)', () => {
    const { content } = sessionWith('f-major', F_MAJOR);
    expect(fMap.view(content()).map((v) => v.midi)).toEqual([65, 67, 69, 70, 72, 74, 76, 77]);
    const result = evaluateDraft(fMajor, content());
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('① B를 ♭ 변화표로 적어도 같은 정답이다(조표와 임시표가 같은 B♭)', () => {
    const { content } = sessionWith('f-major', [...F_MAJOR.slice(0, 3), [4, 'B4', 'flat'], ...F_MAJOR.slice(4)]);
    expect(evaluateDraft(fMajor, content()).passed).toBe(true);
  });

  it('② 넷째 자리에 A♯: 소리 높이는 같지만 이름이 틀렸다고 말한다', () => {
    const { content } = sessionWith('f-major', [...F_MAJOR.slice(0, 3), [4, 'A4', 'sharp'], ...F_MAJOR.slice(4)]);
    const result = evaluateDraft(fMajor, content());
    expect(result.passed).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(renderAll(result.issues, q07.feedbackRules)).toEqual(['네 번째 자리는 B 이름을 써요. F장조에서는 B♭4예요. 소리 높이는 같아요.']);
    expect(flaggedSlots(result.issues)).toEqual([4]);
  });

  it('③ 두 자리의 순서가 바뀌었다: 둘째와 셋째를 맞바꾸면 두 자리에 표식이 선다', () => {
    const { content } = sessionWith('f-major', [
      [1, 'F4'],
      [2, 'A4'],
      [3, 'G4'],
      ...F_MAJOR.slice(3),
    ]);
    const result = evaluateDraft(fMajor, content());
    expect(result.issues.map((i) => i.code)).toEqual(['WRONG_ORDER']);
    expect(renderAll(result.issues, q07.feedbackRules)).toEqual(['2번째와 3번째 자리의 순서가 바뀌었어요.']);
    expect(flaggedSlots(result.issues)).toEqual([2, 3]);
  });

  it('④ 옥타브가 다르다: 마지막 F를 F4로 놓았다', () => {
    const { content } = sessionWith('f-major', [...F_MAJOR.slice(0, 7), [8, 'F4']]);
    const result = evaluateDraft(fMajor, content());
    expect(result.issues.map((i) => i.code)).toEqual(['OCTAVE_MISMATCH']);
    expect(flaggedSlots(result.issues)).toEqual([8]);
  });

  it('⑤ 빈 자리: 넷째를 비우면 "4번째 자리가 비어 있어요", 모두 비우면 여덟 곳', () => {
    const { content } = sessionWith('f-major', [...F_MAJOR.slice(0, 3), ...F_MAJOR.slice(4)]);
    const result = evaluateDraft(fMajor, content());
    expect(result.issues.map((i) => i.code)).toEqual(['MISSING_PLACEMENT']);
    expect(renderAll(result.issues, q07.feedbackRules)).toEqual(['4번째 자리가 비어 있어요.']);
    expect(flaggedSlots(result.issues)).toEqual([4]);
    const empty = sessionWith('f-major', []);
    expect(flaggedSlots(evaluateDraft(fMajor, empty.content()).issues)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('C장조 정답과 틀린 변화표(F♯)', () => {
    const right = sessionWith('c-major', [[1, 'C4'], [2, 'D4'], [3, 'E4'], [4, 'F4'], [5, 'G4'], [6, 'A4'], [7, 'B4'], [8, 'C5']]);
    expect(evaluateDraft(cMajor, right.content()).passed).toBe(true);
    const wrong = sessionWith('c-major', [[1, 'C4'], [2, 'D4'], [3, 'E4'], [4, 'F4', 'sharp'], [5, 'G4'], [6, 'A4'], [7, 'B4'], [8, 'C5']]);
    const result = evaluateDraft(cMajor, wrong.content());
    expect(result.passed).toBe(false);
    expect(flaggedSlots(result.issues)).toEqual([4]);
  });
});

describe('W-3 판정기로 넘어가는 값', () => {
  it('자리 번호와 음이름뿐이다: 좌표, 시간, 캐릭터 위치는 키로도 없다', () => {
    const { content } = sessionWith('f-major', F_MAJOR);
    const placed = fMap.evaluatorPlacements(content());
    expect(placed).toHaveLength(8);
    for (const p of placed) expect(Object.keys(p).sort()).toEqual(['pitch', 'slot']);
    expect(placed[3]).toEqual({ slot: 4, pitch: { letter: 'B', alter: -1, octave: 4 } });
    expect(JSON.stringify(placed)).not.toMatch(/"(x|y|w|h|time|elapsed|position)"/);
  });

  it('같은 초안은 어떤 설치물 위치에서도 같은 판정이다(자리 번호만 본다)', () => {
    const a = sessionWith('f-major', F_MAJOR).content();
    const b = sessionWith('f-major', [...F_MAJOR].reverse()).content(); // 놓은 순서가 달라도
    expect(JSON.stringify(evaluateDraft(fMajor, a))).toBe(JSON.stringify(evaluateDraft(fMajor, b)));
  });
});

describe('듣기(4.3 4분음표 80으로 왼쪽부터 차례로)', () => {
  it('내 배치 듣기: 자리 번호 순서대로 4분음표씩, 빈 자리는 쉰다', () => {
    const { content } = sessionWith('f-major', [...F_MAJOR.slice(0, 3), ...F_MAJOR.slice(4)]);
    const pb = fMap.playback(content());
    expect(pb.lengthTicks).toBe(8 * SLOT_NOTE_TICKS);
    expect(pb.notes.map((n) => n.id)).toEqual(['slot-1', 'slot-2', 'slot-3', 'slot-5', 'slot-6', 'slot-7', 'slot-8']);
    expect(pb.notes.map((n) => n.onsetTick)).toEqual([0, 960, 1920, 3840, 4800, 5760, 6720]);
    expect(pb.notes.map((n) => n.midi)).toEqual([65, 67, 69, 72, 74, 76, 77]);
  });

  it('돌 하나를 밟으면 0.5초 울린다', () => {
    expect(STEP_NOTE_SEC).toBe(0.5);
  });
});

describe('내 악보(패널의 오선 보기)', () => {
  it('놓은 음을 목표 악보의 틀에 4분음표로 늘어놓고, 빈 자리는 4분쉼표다', () => {
    const { content } = sessionWith('f-major', [...F_MAJOR.slice(0, 3), ...F_MAJOR.slice(4)]);
    const score = fMap.score(content());
    expect(score.meter).toBe('4/4');
    expect(score.staves).toEqual(fMajor.score.staves); // 조표 -1(B♭)을 그대로 쓴다
    expect(score.measureCount).toBe(2);
    expect(score.events.map((e) => [e.eventId, e.type, e.measureIndex, e.onsetTicks, e.durationTicks])).toEqual([
      ['slot-1', 'note', 0, 0, 960],
      ['slot-2', 'note', 0, 960, 960],
      ['slot-3', 'note', 0, 1920, 960],
      ['slot-4', 'rest', 0, 2880, 960],
      ['slot-5', 'note', 1, 0, 960],
      ['slot-6', 'note', 1, 960, 960],
      ['slot-7', 'note', 1, 1920, 960],
      ['slot-8', 'note', 1, 2880, 960],
    ]);
  });

  it('아무것도 놓지 않았어도 틀은 그려진다(쉼표 여덟 개). 목표의 음은 담기지 않는다', () => {
    const { content } = sessionWith('c-major', []);
    const score = cMap.score(content());
    expect(score.events).toHaveLength(8);
    expect(score.events.every((e) => e.type === 'rest')).toBe(true);
    expect(JSON.stringify(score)).not.toContain('resolvedPitch');
  });

  it('A♯을 놓으면 기보 음이 그대로 담겨 오선에서 B♭과 다른 자리·다른 임시표로 보인다', () => {
    const { content } = sessionWith('f-major', [
      [3, 'A4'],
      [4, 'A4', 'sharp'],
    ]);
    const notes = fMap.score(content()).events.filter((e) => e.type === 'note');
    expect(notes.map((e) => (e.type === 'note' ? e.writtenPitch : null))).toEqual([
      { letter: 'A', accidental: null, octave: 4 },
      { letter: 'A', accidental: 'sharp', octave: 4 },
    ]);
  });

  it('원본 판본의 악보는 바뀌지 않는다', () => {
    const before = JSON.stringify(fMajor.score);
    const { content } = sessionWith('f-major', F_MAJOR);
    fMap.score(content());
    expect(JSON.stringify(fMajor.score)).toBe(before);
  });
});

describe('자리 비우기와 되돌리기', () => {
  it('비운 자리는 초안에서 사라지고, 실행 취소로 돌아온다', () => {
    const { session } = sessionWith('f-major', F_MAJOR);
    session.apply(fMap.clear(4));
    expect(session.content().slots.map((s) => s.slot)).toEqual([1, 2, 3, 5, 6, 7, 8]);
    session.undo();
    expect(session.content().slots.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('같은 자리에 다시 놓으면 바꾼다', () => {
    const { session } = sessionWith('f-major', [[1, 'F4']]);
    session.apply(fMap.place(1, hand(fMap, 'G4')));
    expect(session.content().slots).toEqual([{ slot: 1, writtenPitch: { letter: 'G', accidental: null, octave: 4 } }]);
  });
});
