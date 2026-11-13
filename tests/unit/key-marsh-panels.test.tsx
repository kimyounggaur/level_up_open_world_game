// @vitest-environment jsdom
// 7-3 건반 늪의 과제 Q27–Q31이 패널에서 풀린다(W-2 패널 쌍둥이): 월드의 건반 다리(K1–K3)와 반음 계단(K4)과 같은 초안·같은 판정이다.
//  - Q27 검은 건반의 이름: 이름표 패널(음이름 → 변화표). Q28 온음과 반음: 음정 패널의 이름 묻기. Q29 음정 쌓기: 음정 패널의 음 쌓기
//  - Q30 한 마디 안의 임시표: 깃발 패널. 완료 기준(설계서 12.10): 깃발 순서대로 66, 65, 65, 66이다
//  - Q31 반음계: 디딤돌 음계 패널(오름·내림)
// 끌지 않고 눌러서만 끝낸다(W-4). 맞고 틀림은 색만으로 전하지 않는다(7.9 4번). 낭독 설명은 이 과제를 풀 수 있을 만큼 말한다(7.9 8번).
// 판정 문장 자체(설명 코드와 문장)는 key-marsh-quests.test.ts가 정한다. 여기서는 패널이 판정기의 문장을 그 자리에 그대로 보이는지를 본다.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SlotBench } from '@/ui/challenge/slotBench';
import { intervalTextsOf } from '@/ui/challenge/intervalText';
import { NO_FLAG_NOTICE, PICK_ITEM_FIRST } from '@/ui/challenge/keyBridgeText';
import { describeKeySignature, describeScore } from '@/ui/notation/describe';
import { ClefPanel } from '@/ui/panels/clef/ClefPanel';
import { ScalePanel, describeSlotScore, scalePrompt } from '@/ui/panels/scale/ScalePanel';
import { button, click, mount, q, qa, quest, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';
import type { IntervalQuestion } from '@/domain/evaluators';

beforeAll(() => setupDom());

const Q04 = 'pitch.same-sound-different-names';
const Q27 = 'key.black-key-names';
const Q28 = 'key.whole-and-half-steps';
const Q29 = 'key.build-intervals';
const Q30 = 'key.accidentals-in-a-bar';
const Q31 = 'scale.chromatic';
const make = (): Rig => rig('preview', [Q04, Q27, Q28, Q29, Q30, Q31]);

let current: { unmount: () => void } | null = null;
let benchNow: SlotBench | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
  benchNow?.dispose();
  benchNow = null;
});

/** 음이름·음정 패널(ClefPanel)로 연다 */
function openClef(r: Rig, questId: string, variantId: string): HTMLElement {
  act(() => {
    r.controller.open(questId, variantId);
  });
  const m = mount(h(ClefPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

/** 음계 패널(ScalePanel)로 연다: Q30은 깃발 화면, Q31은 디딤돌 화면이 된다 */
function openScale(r: Rig, questId: string, variantId: string): { host: HTMLElement; bench: SlotBench } {
  const bench = new SlotBench(r.controller);
  benchNow = bench;
  act(() => {
    r.controller.open(questId, variantId);
  });
  const m = mount(h(ScalePanel, { controller: r.controller, bench }));
  current = m;
  return { host: m.host, bench };
}

const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const feedbackOf = (host: HTMLElement): string => q(host, '.feedback')!.getAttribute('data-feedback')!;
const check = (host: HTMLElement): void => click(button(host, '배치 확인'));
const live = (host: HTMLElement): string => text(q(host, '.sr-only[role="status"]'));

// ───── 이름표(Q27) ─────
const tag = (host: HTMLElement, slot: string): HTMLElement => q(host, `li.tag-card[data-slot="${slot}"]`)!;
const hang = (host: HTMLElement, slot: string, letter: string, accidental: 'sharp' | 'flat' | 'none'): void => {
  click(q(tag(host, slot), `.pick-letters button[data-letter="${letter}"]`));
  click(q(tag(host, slot), `.pick-accidentals button[data-accidental="${accidental}"]`));
};
/** 설계서 5.7: 다섯 검은 널의 올려 부른 이름과 내려 부른 이름(독립된 값) */
const BLACK_KEYS: ReadonlyArray<readonly [slot: string, letter: string, accidental: 'sharp' | 'flat']> = [
  ['k1-up', 'C', 'sharp'],
  ['k1-down', 'D', 'flat'],
  ['k2-up', 'D', 'sharp'],
  ['k2-down', 'E', 'flat'],
  ['k3-up', 'F', 'sharp'],
  ['k3-down', 'G', 'flat'],
  ['k4-up', 'G', 'sharp'],
  ['k4-down', 'A', 'flat'],
  ['k5-up', 'A', 'sharp'],
  ['k5-down', 'B', 'flat'],
];
const hangAll = (host: HTMLElement): void => {
  for (const [slot, letter, accidental] of BLACK_KEYS) hang(host, slot, letter, accidental);
};

describe('Q27 검은 건반의 이름: 이름표 패널', () => {
  it('제목과 이름표 열 개가 있고, 검은 널이 여럿이라 건반 그림은 없다. 옥타브는 하나뿐이라 고르개를 두지 않는다', () => {
    const host = openClef(make(), Q27, 'black-key-names');
    expect(text(q(host, 'h1'))).toBe('검은 건반의 이름');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['이름표 10개', '옥타브 4']);
    expect(qa(host, 'li.tag-card').map((c) => c.getAttribute('data-slot'))).toEqual(BLACK_KEYS.map(([slot]) => slot));
    expect(qa(host, 'li.tag-card h3').map((e) => text(e))).toEqual([
      '첫째 검은 널의 올려 부른 이름표',
      '첫째 검은 널의 내려 부른 이름표',
      '둘째 검은 널의 올려 부른 이름표',
      '둘째 검은 널의 내려 부른 이름표',
      '셋째 검은 널의 올려 부른 이름표',
      '셋째 검은 널의 내려 부른 이름표',
      '넷째 검은 널의 올려 부른 이름표',
      '넷째 검은 널의 내려 부른 이름표',
      '다섯째 검은 널의 올려 부른 이름표',
      '다섯째 검은 널의 내려 부른 이름표',
    ]);
    expect(qa(host, '.key-figure')).toHaveLength(0);
    expect(qa(host, '.pick-octaves')).toHaveLength(0);
    expect(qa(host, '.tag-card .tag-name').every((p) => p.getAttribute('data-name') === '')).toBe(true);
  });

  it('확인하기 전에는 맞고 틀림을 알려 주지 않는다', () => {
    const host = openClef(make(), Q27, 'black-key-names');
    expect(feedbackOf(host)).toBe('none');
    expect(text(q(host, '.feedback'))).toContain("이름표를 모두 걸고 '배치 확인'을 눌러 보세요.");
    hang(host, 'k1-up', 'C', 'sharp');
    expect(feedbackOf(host)).toBe('none');
    expect(qa(host, '.slot-status')).toHaveLength(0);
  });

  it('열 이름표를 눌러서만 모두 걸고 확인하면 통과한다(C♯·D♭, D♯·E♭, F♯·G♭, G♯·A♭, A♯·B♭)', () => {
    const r = make();
    const host = openClef(r, Q27, 'black-key-names');
    hangAll(host);
    expect(qa(host, '.tag-card .tag-name').map((p) => p.getAttribute('data-name'))).toEqual(['C♯4', 'D♭4', 'D♯4', 'E♭4', 'F♯4', 'G♭4', 'G♯4', 'A♭4', 'A♯4', 'B♭4']);
    expect(text(q(host, '.feedback'))).toContain("다 걸었어요. '배치 확인'을 눌러 보세요.");
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 이름은 다르지만 같은 소리예요.');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(10);
    expect(qa(host, 'li.tag-card.has-error')).toHaveLength(0);
    expect(r.controller.content().slots).toHaveLength(10);
  });

  it('같은 소리의 다른 이름(G♭ 자리에 F♯)은 그 이름표 하나만 고칠 곳이고, 나머지 아홉은 맞다고 한다. 기호와 글자로도 알린다', () => {
    const r = make();
    const host = openClef(r, Q27, 'black-key-names');
    hangAll(host);
    hang(host, 'k3-down', 'F', 'sharp');
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'li.tag-card.has-error').map((c) => c.getAttribute('data-slot'))).toEqual(['k3-down']);
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(9);
    const bad = tag(host, 'k3-down');
    expect(text(q(bad, '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    expect(qa(bad, '.slot-status .icon')).toHaveLength(1);
    // 설명은 판정기가 만든 문장이다: 그 이름표 안에 있고, 아래 결과 칸에도 있다
    const messages = r.controller.feedback!.messages;
    expect(messages).toHaveLength(1);
    expect(text(q(bad, '.slot-message'))).toBe(messages[0]);
    expect(text(q(host, '.feedback'))).toContain(messages[0]!);
  });

  it('소리가 다른 이름(D♮을 C♯ 자리에)도 그 이름표만 고칠 곳이다. 이름을 고치면 이전 판정이 사라진다', () => {
    const r = make();
    const host = openClef(r, Q27, 'black-key-names');
    hangAll(host);
    hang(host, 'k1-up', 'D', 'none');
    check(host);
    expect(qa(host, 'li.tag-card.has-error').map((c) => c.getAttribute('data-slot'))).toEqual(['k1-up']);
    hang(host, 'k1-up', 'C', 'sharp');
    expect(feedbackOf(host)).toBe('none');
    expect(qa(host, '.slot-status')).toHaveLength(0);
    check(host);
    expect(feedbackOf(host)).toBe('passed');
  });

  it('비워 둔 이름표는 아직 답이 없다고 알린다', () => {
    const r = make();
    const host = openClef(r, Q27, 'black-key-names');
    for (const [slot, letter, accidental] of BLACK_KEYS.slice(0, 9)) hang(host, slot, letter, accidental);
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'li.tag-card.has-error').map((c) => c.getAttribute('data-slot'))).toEqual(['k5-down']);
    expect(text(q(host, '.feedback'))).toContain('다섯째 검은 널의 내려 부른 이름표: 아직 이름표가 없어요.');
  });

  it('음이름을 걸 때마다 알림 영역에 한 문장이 남는다(화면 낭독기)', () => {
    const host = openClef(make(), Q27, 'black-key-names');
    hang(host, 'k2-up', 'D', 'sharp');
    expect(live(host)).toBe('둘째 검은 널의 올려 부른 이름표: D♯4로 바꿨어요.');
    expect(text(q(tag(host, 'k2-up'), '.tag-name'))).toBe('걸린 이름: D♯4');
  });

  it('내 이름표 듣기: 열 이름표를 낮은 소리부터 차례로 울리고, 울리는 이름표 카드에 표시가 붙는다', async () => {
    const r = make();
    const host = openClef(r, Q27, 'black-key-names');
    click(button(host, '내 이름표 듣기'));
    expect(text(q(host, '.hint-notice'))).toBe('아직 걸린 이름표가 없어요. 이름을 골라 걸어 보세요.');
    expect(r.controller.playing).toBeNull();
    hangAll(host);
    click(button(host, '내 이름표 듣기'));
    expect(r.controller.playing).toBe('mine');
    r.run(0.3);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.tag-card.is-sounding').map((c) => c.getAttribute('data-slot'))).toEqual(['k1-up']);
    r.run(30);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.tag-card.is-sounding')).toHaveLength(0);
    expect(r.controller.playing).toBeNull();
  });

  it('모든 단추와 고르개에 이름이 붙어 있다(7.9 8번)', () => {
    const host = openClef(make(), Q27, 'black-key-names');
    for (const g of qa(host, '.choice-group')) expect(text(q(host, `#${g.getAttribute('aria-labelledby')!}`)).length).toBeGreaterThan(0);
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
  });
});

// ───── 음정(Q28, Q29) ─────
const question = (host: HTMLElement, qid: string): HTMLElement => q(host, `li.question-card[data-qid="${qid}"]`)!;
const pickInterval = (host: HTMLElement, qid: string, quality: string, number: number): void => {
  click(q(question(host, qid), `.answer-quality button[data-quality="${quality}"]`));
  click(q(question(host, qid), `.answer-number button[data-number="${number}"]`));
};
const build = (host: HTMLElement, qid: string, letter: string, accidental: 'sharp' | 'flat' | 'none'): void => {
  click(q(question(host, qid), `.pick-letters button[data-letter="${letter}"]`));
  click(q(question(host, qid), `.pick-accidentals button[data-accidental="${accidental}"]`));
};

describe('Q28 온음과 반음: 음정 패널의 이름 묻기', () => {
  it('질문 넷, 각 질문에 두 음의 악보와 두 음 듣기, 성질·도수 고르개가 있다. Q04의 소리·표기 문장은 없다', () => {
    const host = openClef(make(), Q28, 'whole-and-half');
    expect(text(q(host, 'h1'))).toBe('온음과 반음');
    expect(text(q(host, '.subtitle'))).toBe('두 음을 보고, 두 음 사이의 음정 이름을 눌러서 답해 보세요. 성질과 도수를 모두 골라야 해요.');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['질문 4개', '음정 이름 고르기']);
    expect(qa(host, 'li.question-card').map((c) => c.getAttribute('data-qid'))).toEqual(['h1', 'h2', 'h3', 'h4']);
    expect(qa(host, 'li.question-card h3').map((e) => text(e))).toEqual(['E4에서 F4까지', 'B4에서 C5까지', 'C4에서 D4까지', 'F4에서 G4까지']);
    for (const qid of ['h1', 'h2', 'h3', 'h4']) {
      const card = question(host, qid);
      expect(qa(card, '.vf-stavenote'), qid).toHaveLength(2);
      expect(qa(card, '.answer-quality button').map((b) => b.getAttribute('data-quality'))).toEqual(['perfect', 'major', 'minor', 'augmented', 'diminished']);
      expect(qa(card, '.answer-number button').map((b) => b.getAttribute('data-number'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      expect(qa(card, '.answer-sound, .answer-notation, .pick-letters')).toHaveLength(0);
      expect(button(card, '두 음 듣기')).toBeTruthy();
      expect(text(q(card, '.tag-name'))).toBe('성질과 도수를 모두 골라야 답이 돼요.');
    }
    expect(text(q(host, '#questions-title ~ .muted'))).toBe("'두 음 듣기'로 소리를 들어 보고, 화살표 키로 옮겨 Enter로 골라요.");
    expect(text(host)).not.toContain('소리와 이름을 따로');
    expect(feedbackOf(host)).toBe('none');
    expect(text(q(host, '.feedback'))).toContain("모든 질문에 답하고 '배치 확인'을 눌러 보세요.");
  });

  it('두 음을 낭독 설명으로도 읽을 수 있다(7.9 8번)', () => {
    const host = openClef(make(), Q28, 'whole-and-half');
    const descs = qa(host, '.question-staff svg').map((s) => s.querySelector('desc')?.textContent ?? '');
    expect(descs).toHaveLength(4);
    expect(descs[0]).toContain('E4');
    expect(descs[0]).toContain('F4');
    expect(descs[1]).toContain('B4');
    expect(descs[1]).toContain('C5');
  });

  it('E–F와 B–C는 단2도(반음), C–D와 F–G는 장2도(온음)로 답하면 통과한다. 통과 문장도 이름 묻기에 맞는다', () => {
    const r = make();
    const host = openClef(r, Q28, 'whole-and-half');
    pickInterval(host, 'h1', 'minor', 2);
    pickInterval(host, 'h2', 'minor', 2);
    pickInterval(host, 'h3', 'major', 2);
    expect(text(q(host, '.feedback'))).toContain("모든 질문에 답하고 '배치 확인'을 눌러 보세요.");
    pickInterval(host, 'h4', 'major', 2);
    expect(text(q(question(host, 'h1'), '.tag-name'))).toBe('고른 음정: 단2도');
    expect(text(q(question(host, 'h3'), '.tag-name'))).toBe('고른 음정: 장2도');
    expect(text(q(host, '.feedback'))).toContain("다 답했어요. '배치 확인'을 눌러 보세요.");
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 두 음 사이의 음정 이름을 맞게 읽었어요.');
    expect(text(q(host, '.feedback'))).not.toContain('소리가 같아도');
    expect(qa(host, 'li.question-card .slot-status.is-ok')).toHaveLength(4);
  });

  it('온음과 반음을 바꿔 읽으면(E–F를 장2도로) 그 질문만 고칠 곳이다. 판정기의 문장이 그 질문 안에 있다', () => {
    const r = make();
    const host = openClef(r, Q28, 'whole-and-half');
    pickInterval(host, 'h1', 'major', 2);
    pickInterval(host, 'h2', 'minor', 2);
    pickInterval(host, 'h3', 'major', 2);
    pickInterval(host, 'h4', 'major', 2);
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'li.question-card.has-error').map((c) => c.getAttribute('data-qid'))).toEqual(['h1']);
    expect(qa(host, 'li.question-card .slot-status.is-ok')).toHaveLength(3);
    expect(text(q(question(host, 'h1'), '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    const messages = r.controller.feedback!.messages;
    expect(messages).toHaveLength(1);
    expect(text(q(question(host, 'h1'), '.slot-message'))).toBe(messages[0]);
  });

  it('성질만 고르고 도수를 고르지 않으면 아직 답이 아니고, 알림 영역이 도수도 고르라고 알린다', () => {
    const r = make();
    const host = openClef(r, Q28, 'whole-and-half');
    click(q(question(host, 'h1'), '.answer-quality button[data-quality="minor"]'));
    expect(live(host)).toBe('E4에서 F4까지: 단을 골랐어요. 도수도 골라 주세요.');
    expect(r.controller.content().slots).toHaveLength(0);
    click(q(question(host, 'h1'), '.answer-number button[data-number="2"]'));
    expect(r.controller.content().slots).toHaveLength(1);
  });

  it('두 음 듣기는 그 질문의 두 음을 울리고, 울리는 동안 그 질문 카드에 표시가 붙는다', async () => {
    const r = make();
    const host = openClef(r, Q28, 'whole-and-half');
    click(button(question(host, 'h3'), '두 음 듣기'));
    expect(r.controller.playing).toBe('mine');
    r.run(0.3);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.question-card.is-sounding').map((c) => c.getAttribute('data-qid'))).toEqual(['h3']);
    r.run(4);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.question-card.is-sounding')).toHaveLength(0);
    expect(r.controller.playing).toBeNull();
  });
});

describe('Q29 음정 쌓기: 음정 패널의 음 쌓기', () => {
  it('질문 둘에 시작 음 하나씩이 오선에 있고, 음이름·변화표·옥타브를 눌러 음을 만든다. 두 음 듣기는 없다(답을 들려 주지 않는다)', () => {
    const host = openClef(make(), Q29, 'basic');
    expect(text(q(host, 'h1'))).toBe('음정 쌓기');
    expect(text(q(host, '.subtitle'))).toBe('시작 음 위로 음정 이름만큼 올라간 음을 만들어 보세요. 음이름과 변화표를 눌러 골라요.');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['질문 2개', '음 쌓기']);
    expect(qa(host, 'li.question-card h3').map((e) => text(e))).toEqual(['D4 위 장3도', 'E4 위 완전5도']);
    expect(text(q(host, '#questions-title ~ .muted'))).toBe('소리를 켜 두면 고른 음이 한 번 울려요. 화살표 키로 옮겨 Enter로 골라요.');
    for (const qid of ['b1', 'b2']) {
      const card = question(host, qid);
      expect(qa(card, '.vf-stavenote'), qid).toHaveLength(1);
      expect(qa(card, 'button').some((b) => text(b).includes('두 음 듣기'))).toBe(false);
      expect(qa(card, '.pick-letters button').map((b) => b.getAttribute('data-letter'))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
      expect(qa(card, '.pick-accidentals button').map((b) => b.getAttribute('data-accidental'))).toEqual(['none', 'sharp', 'flat']);
      expect(qa(card, '.pick-octaves button').map((b) => b.getAttribute('data-octave'))).toEqual(['4', '5']);
      expect(text(q(card, '.tag-name'))).toBe('음이름과 변화표를 골라 음을 만들어 보세요.');
    }
    expect(text(host)).not.toContain('두 음을 보고');
    expect(text(host)).not.toContain('소리와 이름을 따로');
    // 시작 음만 악보에 있고, 답의 음은 그려 주지 않는다
    expect(qa(host, '.question-staff svg').map((s) => s.querySelector('desc')?.textContent ?? '')).toEqual(['높은음자리표, 4/4박자. 한 마디: 첫 번째 박 D4 2분음표 하나.', '높은음자리표, 4/4박자. 한 마디: 첫 번째 박 E4 2분음표 하나.']);
  });

  it('높은 도전의 질문 문장도 판본에서 읽는다', () => {
    const host = openClef(make(), Q29, 'challenge');
    expect(qa(host, 'li.question-card h3').map((e) => text(e))).toEqual(['F4 위 완전4도', 'E4 위 장3도']);
    expect(text(q(host, '.subtitle'))).toBe('시작 음 위로 음정 이름만큼 올라간 음을 만들어 보세요. 음이름과 변화표를 눌러 골라요.');
  });

  it('기본: D4 위 장3도는 F♯4, E4 위 완전5도는 B4를 만들면 통과한다. 통과 문장은 음 쌓기에 맞다', () => {
    const r = make();
    const host = openClef(r, Q29, 'basic');
    build(host, 'b1', 'F', 'sharp');
    build(host, 'b2', 'B', 'none');
    expect(text(q(question(host, 'b1'), '.tag-name'))).toBe('고른 음: F♯4');
    expect(text(q(question(host, 'b2'), '.tag-name'))).toBe('고른 음: B4');
    expect(feedbackOf(host)).toBe('none');
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 음정 이름대로 음을 맞게 쌓았어요.');
    expect(qa(host, 'li.question-card .slot-status.is-ok')).toHaveLength(2);
  });

  it('높은 도전: F4 위 완전4도는 B♭4, E4 위 장3도는 G♯4를 만들면 통과한다', () => {
    const r = make();
    const host = openClef(r, Q29, 'challenge');
    build(host, 'b1', 'B', 'flat');
    build(host, 'b2', 'G', 'sharp');
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(question(host, 'b1'), '.tag-name'))).toBe('고른 음: B♭4');
  });

  it('F♯ 대신 F를 만들면(장3도를 단3도로) 그 질문만 고칠 곳이고, 다른 질문은 맞다고 한다', () => {
    const r = make();
    const host = openClef(r, Q29, 'basic');
    build(host, 'b1', 'F', 'none');
    build(host, 'b2', 'B', 'none');
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'li.question-card.has-error').map((c) => c.getAttribute('data-qid'))).toEqual(['b1']);
    expect(qa(host, 'li.question-card .slot-status.is-ok')).toHaveLength(1);
    const messages = r.controller.feedback!.messages;
    expect(messages).toHaveLength(1);
    expect(text(q(question(host, 'b1'), '.slot-message'))).toBe(messages[0]);
  });

  it('옥타브가 다르면(B5) 그 질문만 고칠 곳이다. 고르면 알림 영역에 한 문장이 남는다', () => {
    const r = make();
    const host = openClef(r, Q29, 'basic');
    build(host, 'b1', 'F', 'sharp');
    build(host, 'b2', 'B', 'none');
    click(q(question(host, 'b2'), '.pick-octaves button[data-octave="5"]'));
    expect(live(host)).toBe('E4 위 완전5도: B5로 바꿨어요.');
    check(host);
    expect(qa(host, 'li.question-card.has-error').map((c) => c.getAttribute('data-qid'))).toEqual(['b2']);
  });

  it('답하지 않은 질문은 빠진 답으로 알린다', () => {
    const r = make();
    const host = openClef(r, Q29, 'basic');
    build(host, 'b1', 'F', 'sharp');
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'li.question-card.has-error').map((c) => c.getAttribute('data-qid'))).toEqual(['b2']);
  });

  it('모든 단추와 고르개에 이름이 붙어 있다(7.9 8번)', () => {
    const host = openClef(make(), Q29, 'basic');
    for (const g of qa(host, '.choice-group')) expect(text(q(host, `#${g.getAttribute('aria-labelledby')!}`)).length).toBeGreaterThan(0);
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
  });
});

describe('음정 패널의 문장은 질문의 종류에 따라 갈린다', () => {
  const ref = { letter: 'C', alter: 0, octave: 4 } as const;
  const compare: IntervalQuestion = { qid: 'c', label: 'c', kind: 'compare', a: ref, b: ref };
  const identify: IntervalQuestion = { qid: 'i', label: 'i', kind: 'identify', from: ref, to: { letter: 'D', alter: 0, octave: 4 } };
  const built: IntervalQuestion = { qid: 'b', label: 'b', kind: 'build', from: ref, diatonicNumber: 3, quality: 'major' };

  it('비교가 있으면 Q04의 문장이고, 글자는 이전과 같다', () => {
    const t = intervalTextsOf([compare, identify, identify]);
    expect(t.subtitle).toBe('두 음을 보고, 소리와 이름이 어떤지 눌러서 답해 보세요.');
    expect(t.chip).toBe('소리와 이름을 따로');
    expect(t.hint).toBe("'두 음 듣기'로 소리를 들어 보고, 화살표 키로 옮겨 Enter로 골라요.");
    expect(t.passed).toBe('소리가 같아도 이름이 다를 수 있다는 것을 구분했어요.');
  });

  it('이름 묻기만 있으면 음정 이름을, 음 쌓기만 있으면 음을 만드는 것을 말한다', () => {
    expect(intervalTextsOf([identify]).chip).toBe('음정 이름 고르기');
    expect(intervalTextsOf([built]).chip).toBe('음 쌓기');
    expect(intervalTextsOf([built, built]).hint).not.toContain('두 음 듣기');
    expect(intervalTextsOf([identify, identify]).hint).toContain('두 음 듣기');
  });

  it('이름 묻기와 음 쌓기가 섞이면 둘을 모두 말한다', () => {
    const t = intervalTextsOf([identify, built]);
    expect(t.chip).toBe('이름 읽기와 음 쌓기');
    expect(t.subtitle).toContain('음정 이름을 고르거나');
    expect(t.subtitle).toContain('음을 만들어');
    expect(t.hint).toContain('두 음 듣기');
  });

  it('Q04의 판본 둘은 이전 화면 그대로다(음정 이름 판본에서 문장이 바뀌지 않는다)', () => {
    const host = openClef(make(), Q04, 'interval-names');
    expect(text(q(host, '.subtitle'))).toBe('두 음을 보고, 소리와 이름이 어떤지 눌러서 답해 보세요.');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['질문 3개', '소리와 이름을 따로']);
  });
});

// ───── 깃발(Q30) ─────
const flagCard = (host: HTMLElement, draft: number): HTMLElement => q(host, `li.flag-card[data-flag="${draft}"]`)!;
const pickFlag = (host: HTMLElement, draft: number): void => click(button(host, `${draft}번 깃발 고르기`));
const plankButton = (host: HTMLElement, label: string): HTMLButtonElement => {
  const found = qa<HTMLButtonElement>(host, '.plank-choice button').find((b) => text(b).replace(/^✓\s*/, '') === label);
  if (!found) throw new Error(`${label} 널 단추가 없어요: ${qa(host, '.plank-choice button').map((b) => text(b)).join(' | ')}`);
  return found;
};
const plant = (host: HTMLElement, draft: number, label: string): void => {
  pickFlag(host, draft);
  click(plankButton(host, label));
};
const F4 = 'F4';
const F_SHARP_4 = '검은 널 (F4·G4 사이)';
const midisOf = (r: Rig): number[] =>
  r.controller
    .content()
    .slots.slice()
    .sort((a, b) => a.slot - b.slot)
    .map((s) => s.midi!);

describe('Q30 한 마디 안의 임시표: 깃발 패널', () => {
  it('제목, 조 이름과 깃발 수, 깃발 넷(아직 꽂지 않음), 널 열세 개(검은 널은 이웃한 흰 널로만 말한다)가 있다', () => {
    const host = openScale(make(), Q30, 'g-major-f').host;
    expect(text(q(host, 'h1'))).toBe('한 마디 안의 임시표');
    expect(text(q(host, '.subtitle'))).toBe("악보를 읽고, 음표 순서대로 어느 널의 소리인지 깃발을 꽂아 보세요. '배치 확인'을 눌러야 맞고 틀림이 나와요.");
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['G장조', '깃발 4개']);
    expect(qa(host, 'li.flag-card h3').map((e) => text(e))).toEqual(['1번 깃발', '2번 깃발', '3번 깃발', '4번 깃발']);
    expect(qa(host, 'li.flag-card .tag-name').map((p) => text(p))).toEqual(Array(4).fill('아직 꽂지 않았어요.'));
    const planks = qa<HTMLButtonElement>(host, '.plank-choice button');
    expect(planks.map((b) => text(b))).toEqual(['C4', '검은 널 (C4·D4 사이)', 'D4', '검은 널 (D4·E4 사이)', 'E4', 'F4', '검은 널 (F4·G4 사이)', 'G4', '검은 널 (G4·A4 사이)', 'A4', '검은 널 (A4·B4 사이)', 'B4', 'C5']);
    // 문제를 푸는 중에는 검은 널에 ♯나 ♭ 이름을 붙이지 않는다(4.8): 어떤 소리인지 묻는 과제이기 때문이다
    expect(planks.some((b) => /[♯♭]/.test(text(b)))).toBe(false);
    expect(text(q(host, '.plank-choice .choice-hint'))).toBe('먼저 위에서 깃발을 골라요.');
    expect(feedbackOf(host)).toBe('none');
    expect(text(q(host, '.feedback'))).toContain("깃발을 모두 채우고 '확인'을 눌러 보세요.");
  });

  it('표지판의 악보가 오선에 그려지고, 낭독 설명은 조표와 임시표까지 읽는다(이 과제를 풀 수 있게)', () => {
    const host = openScale(make(), Q30, 'g-major-f').host;
    const svg = q(host, '.score-figure svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(qa(host, '.score-figure .vf-stavenote')).toHaveLength(4);
    const desc = svg.querySelector('desc')?.textContent ?? '';
    expect(desc).toBe('높은음자리표, 4/4박자, 조표는 올림표 1개. 1번째 마디: 첫 번째 박 F4 4분음표 하나, 두 번째 박 F♮4 4분음표 하나, 세 번째 박 F4 2분음표 하나. 2번째 마디: 첫 번째 박 F4 온음표 하나.');
    // 어느 음이 올라가는지는 말하지 않는다: 조표를 읽는 것이 과제의 일부다
    expect(desc).not.toContain('F♯');
  });

  it('완료 기준(12.10): 깃발을 눌러서만 꽂으면 66, 65, 65, 66이고 확인하면 통과한다', () => {
    const r = make();
    const { host } = openScale(r, Q30, 'g-major-f');
    plant(host, 1, F_SHARP_4);
    plant(host, 2, F4);
    plant(host, 3, F4);
    plant(host, 4, F_SHARP_4);
    expect(midisOf(r)).toEqual([66, 65, 65, 66]);
    // 검은 널은 이웃한 흰 널로만 말한다(4.8): 풀기 전에는 ♯·♭ 이름이 어디에도 없다
    expect(qa(host, 'li.flag-card .tag-name').map((p) => text(p))).toEqual(['꽂은 널: F4와 G4 사이의 검은 널', '꽂은 널: F4 널', '꽂은 널: F4 널', '꽂은 널: F4와 G4 사이의 검은 널']);
    expect(text(q(host, '.flag-grid'))).not.toMatch(/[♯♭]/);
    expect(live(host)).toBe('4번 깃발을 F4와 G4 사이의 검은 널에 꽂았어요.');
    expect(text(q(host, '.feedback'))).toContain("다 채웠어요. '확인'을 눌러 보세요.");
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 임시표는 그 마디가 끝날 때까지 이어지고, 다음 마디에서는 조표가 다시 적용돼요.');
    expect(qa(host, 'li.flag-card.has-error')).toHaveLength(0);
  });

  it('임시표를 보지 않고 조표대로만 꽂으면(66, 66, 66, 66) 둘째와 셋째 깃발만 고칠 곳이다', () => {
    const r = make();
    const { host } = openScale(r, Q30, 'g-major-f');
    for (const draft of [1, 2, 3, 4]) plant(host, draft, F_SHARP_4);
    expect(midisOf(r)).toEqual([66, 66, 66, 66]);
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'li.flag-card.has-error').map((c) => c.getAttribute('data-flag'))).toEqual(['2', '3']);
    for (const draft of [2, 3]) expect(text(q(flagCard(host, draft), '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    expect(qa(flagCard(host, 1), '.slot-status')).toHaveLength(0);
    const messages = r.controller.feedback!.messages;
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) expect(text(q(host, '.feedback'))).toContain(m);
  });

  it('첫 마디의 임시표가 둘째 마디까지 이어진다고 읽으면(66, 65, 65, 65) 넷째 깃발만 고칠 곳이다', () => {
    const r = make();
    const { host } = openScale(r, Q30, 'g-major-f');
    plant(host, 1, F_SHARP_4);
    for (const draft of [2, 3, 4]) plant(host, draft, F4);
    check(host);
    expect(qa(host, 'li.flag-card.has-error').map((c) => c.getAttribute('data-flag'))).toEqual(['4']);
    // 고치면 이전 판정이 사라진다
    plant(host, 4, F_SHARP_4);
    expect(feedbackOf(host)).toBe('none');
    check(host);
    expect(feedbackOf(host)).toBe('passed');
  });

  it('깃발을 고르지 않고 널을 누르면 먼저 깃발을 고르라고 알리고, 아무것도 꽂지 않는다', () => {
    const r = make();
    const { host } = openScale(r, Q30, 'g-major-f');
    click(plankButton(host, F4));
    expect(live(host)).toBe(PICK_ITEM_FIRST);
    expect(r.controller.content().slots).toHaveLength(0);
  });

  it('깃발을 고르면 어디에 꽂혀 있는지 알리고, 다른 널을 누르면 옮겨 꽂는다. 빼기는 꽂힌 깃발에만 쓸 수 있다', () => {
    const r = make();
    const { host } = openScale(r, Q30, 'g-major-f');
    expect(button(host, '1번 깃발: 빼기').disabled).toBe(true);
    pickFlag(host, 1);
    expect(live(host)).toBe('1번 깃발, 아직 꽂지 않았어요.');
    expect(button(host, '1번 깃발 고르기').getAttribute('aria-pressed')).toBe('true');
    click(plankButton(host, F4));
    expect(live(host)).toBe('1번 깃발을 F4 널에 꽂았어요.');
    expect(button(host, '1번 깃발: 빼기').disabled).toBe(false);
    click(plankButton(host, F_SHARP_4));
    expect(live(host)).toBe('1번 깃발을 F4와 G4 사이의 검은 널에 옮겨 꽂았어요.');
    click(plankButton(host, F_SHARP_4));
    expect(live(host)).toBe('1번 깃발은 이미 F4와 G4 사이의 검은 널에 있어요.');
    expect(midisOf(r)).toEqual([66]);
    click(button(host, '1번 깃발: 빼기'));
    expect(live(host)).toBe('1번 깃발을 뺐어요.');
    expect(midisOf(r)).toEqual([]);
    expect(text(q(flagCard(host, 1), '.tag-name'))).toBe('아직 꽂지 않았어요.');
  });

  it('내 깃발 듣기: 꽂은 깃발이 없으면 알리고, 있으면 번호 차례로 울리며 울리는 깃발 카드에 표시가 붙는다', async () => {
    const r = make();
    const { host } = openScale(r, Q30, 'g-major-f');
    click(button(host, '내 깃발 듣기'));
    expect(text(q(host, '.hint-notice'))).toBe(NO_FLAG_NOTICE);
    expect(r.controller.playing).toBeNull();
    plant(host, 1, F_SHARP_4);
    plant(host, 2, F4);
    plant(host, 3, F4);
    plant(host, 4, F_SHARP_4);
    const quarterSec = 60 / r.controller.tempo().effective;
    click(button(host, '내 깃발 듣기'));
    expect(r.controller.playing).toBe('mine');
    r.run(0.4 * quarterSec);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.flag-card.is-sounding').map((c) => c.getAttribute('data-flag'))).toEqual(['1']);
    r.run(quarterSec);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.flag-card.is-sounding').map((c) => c.getAttribute('data-flag'))).toEqual(['2']);
    r.run(6 * quarterSec);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.flag-card.is-sounding')).toHaveLength(0);
    expect(r.controller.playing).toBeNull();
  });

  it('모든 단추와 고르개에 이름이 붙어 있다(7.9 8번)', () => {
    const { host } = openScale(make(), Q30, 'g-major-f');
    for (const g of qa(host, '.choice-group')) expect(text(q(host, `#${g.getAttribute('aria-labelledby')!}`)).length).toBeGreaterThan(0);
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
  });
});

// ───── 반음계(Q31) ─────
const stone = (host: HTMLElement, slot: number): HTMLButtonElement => q<HTMLButtonElement>(host, `button.cell-mine[data-slot="${slot}"]`)!;
const stoneNames = (host: HTMLElement): string[] => qa(host, 'button.cell-mine').map((b) => b.getAttribute('data-name') ?? '');
const shelf = (host: HTMLElement, i: number): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-shelf="${i}"]`)!;
const accidentalButton = (host: HTMLElement, which: 'flat' | 'none' | 'sharp'): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-accidental="${which}"]`)!;

/** 선반의 단추 차례: B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 → 자리 번호의 음을 놓는다 */
const SHELF_OF: Record<string, number> = { B3: 0, C4: 1, D4: 2, E4: 3, F4: 4, G4: 5, A4: 6, B4: 7, C5: 8, D5: 9 };
const placeNote = (host: HTMLElement, slot: number, natural: string, accidental: 'flat' | 'none' | 'sharp'): void => {
  click(stone(host, slot));
  click(shelf(host, SHELF_OF[natural]!));
  click(accidentalButton(host, accidental));
  click(button(host, `${slot}번째 자리에 놓기`));
};
type Note = readonly [natural: string, accidental: 'flat' | 'none' | 'sharp'];
const placeAll = (host: HTMLElement, notes: readonly Note[]): void => {
  notes.forEach(([natural, accidental], i) => placeNote(host, i + 1, natural, accidental));
};
/** 설계서 5.7: 오를 때는 올림표, 내릴 때는 내림표(독립된 값) */
const ASCENDING: readonly Note[] = [['C4', 'none'], ['C4', 'sharp'], ['D4', 'none'], ['D4', 'sharp'], ['E4', 'none'], ['F4', 'none'], ['F4', 'sharp'], ['G4', 'none'], ['G4', 'sharp'], ['A4', 'none'], ['A4', 'sharp'], ['B4', 'none'], ['C5', 'none']];
const DESCENDING: readonly Note[] = [['C5', 'none'], ['B4', 'none'], ['B4', 'flat'], ['A4', 'none'], ['A4', 'flat'], ['G4', 'none'], ['G4', 'flat'], ['F4', 'none'], ['E4', 'none'], ['E4', 'flat'], ['D4', 'none'], ['D4', 'flat'], ['C4', 'none']];
const ASCENDING_NAMES = ['C4', 'C♯4', 'D4', 'D♯4', 'E4', 'F4', 'F♯4', 'G4', 'G♯4', 'A4', 'A♯4', 'B4', 'C5'];
const DESCENDING_NAMES = ['C5', 'B4', 'B♭4', 'A4', 'A♭4', 'G4', 'G♭4', 'F4', 'E4', 'E♭4', 'D4', 'D♭4', 'C4'];

describe('Q31 반음계: 디딤돌 음계 패널', () => {
  it.each([
    ['ascending', 'C 반음계(오름)'],
    ['descending', 'C 반음계(내림)'],
  ] as const)('%s: 제목, 과제 문장, 열세 자리가 네 마디로 나뉜 디딤돌, 선반과 변화표가 있다', (variantId, keyName) => {
    const { host } = openScale(make(), Q31, variantId);
    expect(text(q(host, 'h1'))).toBe('반음계');
    expect(text(q(host, '.subtitle'))).toBe(`${keyName}의 음계를 C4부터 C5까지 13자리에 차례로 놓아 보세요.`);
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual([keyName, '자리 13개', '한 자리 = 4분음표']);
    expect(qa(host, '.timeline-row h3').map((e) => text(e))).toEqual(['1번째 마디', '2번째 마디', '3번째 마디', '4번째 마디']);
    expect(qa(host, 'ol.cells').map((ol) => qa(ol, 'button.cell-mine').length)).toEqual([4, 4, 4, 1]);
    expect(stoneNames(host)).toEqual(Array(13).fill(''));
    expect(qa(host, 'button.material[data-shelf]').map((b) => text(b))).toEqual(['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']);
    expect(qa(host, 'button.material[data-accidental]').map((b) => text(b))).toEqual(['♭내림표', '없음변화표 없음', '♯올림표']);
    expect(feedbackOf(host)).toBe('none');
    expect(text(q(host, '.feedback'))).toContain("13자리를 모두 놓고 '배치 확인'을 눌러 보세요.");
  });

  it('낭독 설명은 반음계의 조표라고 말하지 않는다(반음계에는 조표가 없다). 조 이름이 있는 음계는 그대로 조표를 말한다', () => {
    const { host } = openScale(make(), Q31, 'ascending');
    const desc = q(host, '.score-figure svg')!.querySelector('desc')?.textContent ?? '';
    expect(desc.startsWith('높은음자리표, 4/4박자, C 반음계(오름). 1번째 자리 비어 있음')).toBe(true);
    expect(desc).not.toContain('조표');
    const view = { slot: 1, written: null, spelled: null, midi: null, name: 'C4' };
    expect(describeSlotScore(quest(Q31).variants.ascending!, [view])).toBe('높은음자리표, 4/4박자, C 반음계(오름). 1번째 자리 C4.');
    expect(describeSlotScore(quest('scale.major').variants['g-major']!, [view])).toBe('높은음자리표, 4/4박자, G장조의 조표. 1번째 자리 C4.');
    expect(describeSlotScore(quest('scale.natural-minor').variants['d-minor']!, [view])).toBe('높은음자리표, 4/4박자, D단조의 조표. 1번째 자리 C4.');
    expect(scalePrompt(quest(Q31).variants.descending!, 13)).toBe('C 반음계(내림)의 음계를 C4부터 C5까지 13자리에 차례로 놓아 보세요.');
  });

  it('오름: 올림표로 열세 자리를 눌러서만 놓고 확인하면 통과한다', () => {
    const r = make();
    const { host, bench } = openScale(r, Q31, 'ascending');
    placeAll(host, ASCENDING);
    expect(stoneNames(host)).toEqual(ASCENDING_NAMES);
    expect(text(q(host, '.feedback'))).toContain("다 놓았어요. '배치 확인'을 눌러 보세요.");
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 13자리의 음이 C 반음계(오름)의 음계와 같아요.');
    expect(bench.flagged()).toEqual([]);
    expect(qa(host, 'button.cell-mine.has-error')).toHaveLength(0);
    expect(qa(host, '.score-figure .vf-stavenote')).toHaveLength(13);
  });

  it('내림: 내림표로 열세 자리를 놓고 확인하면 통과한다', () => {
    const r = make();
    const { host } = openScale(r, Q31, 'descending');
    placeAll(host, DESCENDING);
    expect(stoneNames(host)).toEqual(DESCENDING_NAMES);
    check(host);
    expect(feedbackOf(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 13자리의 음이 C 반음계(내림)의 음계와 같아요.');
  });

  it('오름에 내림표를 쓰면(D♭, E♭, G♭, A♭, B♭) 이름이 다른 다섯 자리만 고칠 곳이다. 소리는 같다고 알린다', () => {
    const r = make();
    const { host, bench } = openScale(r, Q31, 'ascending');
    placeAll(host, [['C4', 'none'], ['D4', 'flat'], ['D4', 'none'], ['E4', 'flat'], ['E4', 'none'], ['F4', 'none'], ['G4', 'flat'], ['G4', 'none'], ['A4', 'flat'], ['A4', 'none'], ['B4', 'flat'], ['B4', 'none'], ['C5', 'none']]);
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(bench.flagged()).toEqual([2, 4, 7, 9, 11]);
    expect(qa(host, 'button.cell-mine.has-error').map((b) => b.getAttribute('data-slot'))).toEqual(['2', '4', '7', '9', '11']);
    // 색만으로 알리지 않는다: 자리마다 경고 기호가 있고 읽는 이름에도 말이 붙는다
    expect(qa(host, 'button.cell-mine .cell-mark')).toHaveLength(5);
    expect(stone(host, 2).getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    expect(stone(host, 3).getAttribute('aria-label')).not.toContain('고칠 곳이 있어요');
    const messages = r.controller.feedback!.messages;
    expect(messages).toHaveLength(5);
    expect(qa(host, '.feedback-line')).toHaveLength(5);
    for (const m of messages) expect(text(q(host, '.feedback'))).toContain(m);
    expect(text(q(host, '.feedback'))).toContain('소리 높이는 같아요');
    expect(qa(host, '.score-figure .vf-stavenote.is-error')).toHaveLength(5);
  });

  it('빠진 자리가 있으면 몇 번째 자리인지 말한다', () => {
    const r = make();
    const { host } = openScale(r, Q31, 'ascending');
    placeAll(host, ASCENDING.slice(0, 12));
    check(host);
    expect(feedbackOf(host)).toBe('needsRevision');
    expect(qa(host, 'button.cell-mine.has-error').map((b) => b.getAttribute('data-slot'))).toEqual(['13']);
    expect(text(q(host, '.feedback'))).toContain('13번째');
  });

  it('모든 단추에 이름이 붙어 있다(7.9 8번)', () => {
    const { host } = openScale(make(), Q31, 'ascending');
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
  });
});

// ───── 낭독 설명의 순수 함수 ─────
describe('악보 낭독 설명: 조표', () => {
  it('조표를 올림표·내림표의 개수로 말하고, 없으면 말하지 않는다', () => {
    expect(describeKeySignature(0)).toBeNull();
    expect(describeKeySignature(1)).toBe('조표는 올림표 1개');
    expect(describeKeySignature(2)).toBe('조표는 올림표 2개');
    expect(describeKeySignature(-1)).toBe('조표는 내림표 1개');
    expect(describeKeySignature(-2)).toBe('조표는 내림표 2개');
    expect(describeKeySignature(0.5)).toBeNull();
  });

  it('조표가 있는 악보는 박자 뒤에 조표를 말하고, 없는 악보의 설명은 이전과 같다', () => {
    const sign = quest(Q30).variants['g-major-f']!.score;
    expect(describeScore(sign).startsWith('높은음자리표, 4/4박자, 조표는 올림표 1개. 1번째 마디: ')).toBe(true);
    const plain = quest('scale.major').variants['c-major']!.score;
    expect(describeScore(plain).startsWith('높은음자리표, 4/4박자. ')).toBe(true);
    expect(describeScore(plain)).not.toContain('조표');
    const flats = quest('scale.major').variants['bflat-major']!.score;
    expect(describeScore(flats).startsWith('높은음자리표, 4/4박자, 조표는 내림표 2개. ')).toBe(true);
  });
});
