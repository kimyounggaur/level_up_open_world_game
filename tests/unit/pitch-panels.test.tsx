// @vitest-environment jsdom
// 5-2 Q04 패널: 이름표 두 개(name-tags)와 음정 이름(interval-names).
// 완료 기준: C♯4와 D♭4를 같은 소리, 다른 표기로 판정한다. 눌러서만 끝낼 수 있고(7.9 1·2번), 맞고 틀림은 기호와 문장으로 알린다(4번).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ClefPanel } from '@/ui/panels/clef/ClefPanel';
import { Q04, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

function open(r: Rig, variant: string): HTMLElement {
  act(() => {
    r.controller.open(Q04, variant);
  });
  const m = mount(h(ClefPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

const live = (host: HTMLElement): string => text(q(host, '.sr-only[role="status"]'));
const check = (host: HTMLElement): void => click(button(host, '배치 확인'));
const feedback = (host: HTMLElement): string => q(host, '.feedback')!.getAttribute('data-feedback')!;
const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// --- 이름표
const tag = (host: HTMLElement, slot: string): HTMLElement => q(host, `li.tag-card[data-slot="${slot}"]`)!;
const letter = (host: HTMLElement, slot: string, l: string): void => click(q(tag(host, slot), `.pick-letters button[data-letter="${l}"]`));
const accidental = (host: HTMLElement, slot: string, a: 'sharp' | 'flat' | 'none'): void => click(q(tag(host, slot), `.pick-accidentals button[data-accidental="${a}"]`));
const hang = (host: HTMLElement, slot: string, l: string, a: 'sharp' | 'flat' | 'none'): void => {
  letter(host, slot, l);
  accidental(host, slot, a);
};
const nameOf = (host: HTMLElement, slot: string): string => q(tag(host, slot), '.tag-name')!.getAttribute('data-name')!;

describe('이름표 두 개: 구성', () => {
  it('제목, 건반 그림, 이름표 두 개와 음이름·변화표 고르개가 있다. 옥타브는 하나뿐이라 고르개를 두지 않는다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    expect(text(q(host, 'h1'))).toBe('같은 높이의 다른 이름');
    expect(qa(host, 'li.tag-card').map((c) => c.getAttribute('data-slot'))).toEqual(['up', 'down']);
    expect(qa(host, 'li.tag-card h3').map((e) => text(e))).toEqual(['올려 부른 이름표', '내려 부른 이름표']);
    expect(qa(tag(host, 'up'), '.pick-letters button').map((b) => b.getAttribute('data-letter'))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(qa(tag(host, 'up'), '.pick-accidentals button').map((b) => b.getAttribute('data-accidental'))).toEqual(['none', 'sharp', 'flat']);
    expect(q(tag(host, 'up'), '.pick-octaves')).toBeNull();
    // 겹임시표(겹샵·겹플랫)는 이 단계의 과제에 없다
    expect(qa(host, 'button[data-accidental]').every((b) => ['none', 'sharp', 'flat'].includes(b.getAttribute('data-accidental')!))).toBe(true);
  });

  it('건반 그림은 흰 건반 C4와 D4 사이의 검은 건반 하나다. 정답의 이름은 그림에 없다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    const svg = q(host, 'svg.key-picture')!;
    expect(svg.getAttribute('aria-label')).toBe('건반 그림: 흰 건반 C4와 D4 사이에 검은 건반이 하나 있어요');
    expect(qa(svg, 'rect.key-white')).toHaveLength(2);
    expect(qa(svg, 'rect.key-black')).toHaveLength(1);
    expect(text(q(host, '.key-note'))).toContain('검은 건반은 왼쪽 흰 건반 C4와 오른쪽 흰 건반 D4 사이에 있어요.');
    expect(text(host)).not.toContain('C♯4');
    expect(text(host)).not.toContain('D♭4');
  });

  it('처음에는 이름표가 비어 있고, 확인하기 전에는 맞고 틀림을 알려 주지 않는다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    expect(nameOf(host, 'up')).toBe('');
    expect(text(tag(host, 'up'))).toContain('아직 걸지 않았어요. 음이름을 골라 보세요.');
    expect(feedback(host)).toBe('none');
    expect(q(host, '.slot-status.is-ok')).toBeNull();
    expect(q(host, '.slot-status.is-error')).toBeNull();
    expect(text(q(host, '.feedback'))).toContain('확인하기 전에는 맞고 틀림을 알려 주지 않아요.');
  });
});

describe('이름표 두 개: 고르기', () => {
  it('음이름을 고르면 변화표 없는 음이 걸리고, 변화표를 고르면 이름이 바뀐다. 고를 때마다 문장으로 알린다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    letter(host, 'up', 'C');
    expect(nameOf(host, 'up')).toBe('C4');
    expect(live(host)).toBe('올려 부른 이름표: C4로 걸었어요.');
    accidental(host, 'up', 'sharp');
    expect(nameOf(host, 'up')).toBe('C♯4');
    expect(live(host)).toBe('올려 부른 이름표: C♯4로 바꿨어요.');
    expect(q(tag(host, 'up'), '.pick-letters button[data-letter="C"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(tag(host, 'up'), '.pick-accidentals button[data-accidental="sharp"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(text(tag(host, 'up'))).toContain('걸린 이름: C♯4');
  });

  it('음이름보다 변화표를 먼저 누르면 이유를 알리고 아무것도 걸지 않는다', () => {
    const r = rig('preview', [Q04]);
    const host = open(r, 'name-tags');
    accidental(host, 'up', 'sharp');
    expect(live(host)).toBe('올려 부른 이름표: 먼저 음이름을 골라 주세요.');
    expect(nameOf(host, 'up')).toBe('');
    expect(r.controller.content().slots).toEqual([]);
  });

  it('이미 걸린 이름을 다시 고르면 바뀌지 않고 그렇게 알린다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    hang(host, 'down', 'D', 'flat');
    letter(host, 'down', 'D');
    expect(live(host)).toBe('내려 부른 이름표: 이미 D♭4예요.');
    expect(nameOf(host, 'down')).toBe('D♭4');
  });

  it('지우기는 걸린 이름표만 비운다. 비어 있으면 단추를 눌러도 되지 않는다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    expect(button(tag(host, 'up'), '지우기').disabled).toBe(true);
    hang(host, 'up', 'C', 'sharp');
    hang(host, 'down', 'D', 'flat');
    click(button(tag(host, 'up'), '지우기'));
    expect(nameOf(host, 'up')).toBe('');
    expect(nameOf(host, 'down')).toBe('D♭4');
    expect(live(host)).toBe('올려 부른 이름표를 비웠어요.');
  });

  it('고른 것을 바꾸면 이전 확인 결과가 사라진다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    hang(host, 'up', 'C', 'sharp');
    hang(host, 'down', 'D', 'flat');
    check(host);
    expect(feedback(host)).toBe('passed');
    letter(host, 'down', 'E');
    expect(feedback(host)).toBe('none');
    expect(q(host, '.slot-status.is-ok')).toBeNull();
  });
});

describe('이름표 두 개: 판정', () => {
  it('C♯4와 D♭4를 걸면 통과한다: 이름은 다르지만 같은 소리', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    hang(host, 'up', 'C', 'sharp');
    hang(host, 'down', 'D', 'flat');
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 이름은 다르지만 같은 소리예요.');
    expect(qa(host, '.slot-status.is-ok').map((e) => text(e))).toEqual(['맞아요', '맞아요']);
  });

  it('같은 이름을 두 번 걸면 고쳐야 할 이름표를 문장으로 알린다: 소리는 같지만 이름이 달라요', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    hang(host, 'up', 'D', 'flat');
    hang(host, 'down', 'D', 'flat');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(tag(host, 'up').classList.contains('has-error')).toBe(true);
    expect(text(q(tag(host, 'up'), '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    expect(text(q(tag(host, 'up'), '.slot-message'))).toContain('소리 높이는 같지만 이름이 달라요');
    // 맞게 건 이름표는 맞다고 말한다
    expect(tag(host, 'down').classList.contains('has-error')).toBe(false);
    expect(text(q(tag(host, 'down'), '.slot-status.is-ok'))).toBe('맞아요');
  });

  it('소리가 다른 이름(D♮)을 걸면 틀렸다고 알리고, 다른 이름표는 그대로 맞다고 한다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    hang(host, 'up', 'C', 'sharp');
    hang(host, 'down', 'D', 'none');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(tag(host, 'down').classList.contains('has-error')).toBe(true);
    expect(tag(host, 'up').classList.contains('has-error')).toBe(false);
  });

  it('비워 둔 이름표는 "아직 답이 없어요"로 알린다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    hang(host, 'up', 'C', 'sharp');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(tag(host, 'down'), '.slot-message'))).toBe('내려 부른 이름표: 아직 답이 없어요.');
    expect(text(q(tag(host, 'up'), '.slot-status.is-ok'))).toBe('맞아요');
  });
});

describe('이름표 두 개: 키보드와 듣기', () => {
  it('고르개는 모음마다 Tab 정지가 하나이고 화살표로 초점만 옮긴다. 고르는 것은 Enter(누르기)다', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    const letters = qa<HTMLButtonElement>(tag(host, 'up'), '.pick-letters button');
    expect(letters.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(letters[0]!.tabIndex).toBe(0);
    act(() => letters[0]!.focus());
    keydown(letters[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(letters[1]);
    expect(nameOf(host, 'up')).toBe('');
    keydown(letters[1]!, 'End');
    expect(document.activeElement).toBe(letters[6]);
    keydown(letters[6]!, 'ArrowRight');
    expect(document.activeElement).toBe(letters[0]);
    // 옮긴 초점이 새 Tab 정지가 된다
    expect(qa<HTMLButtonElement>(tag(host, 'up'), '.pick-letters button').filter((b) => b.tabIndex === 0)).toHaveLength(1);
    click(letters[2]!);
    expect(nameOf(host, 'up')).toBe('E4');
  });

  it('모든 단추와 고르개에는 이름이 있다(7.9 8번)', () => {
    const host = open(rig('preview', [Q04]), 'name-tags');
    for (const g of qa(host, '.choice-group')) {
      const labelledBy = g.getAttribute('aria-labelledby')!;
      expect(text(q(host, `#${labelledBy}`)).length, labelledBy).toBeGreaterThan(0);
    }
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    expect(text(q(tag(host, 'up'), '.choice-title'))).toBe('올려 부른 이름표: 음이름');
  });

  it('걸린 이름표가 없으면 듣기는 이유를 알리고, 걸면 차례로 울리며 울리는 이름표 카드에 표시가 붙는다', async () => {
    const r = rig('preview', [Q04]);
    const host = open(r, 'name-tags');
    click(button(host, '내 이름표 듣기'));
    expect(text(q(host, '.hint-notice'))).toBe('아직 걸린 이름표가 없어요. 이름을 골라 걸어 보세요.');
    expect(r.controller.playing).toBeNull();
    hang(host, 'up', 'C', 'sharp');
    hang(host, 'down', 'D', 'flat');
    click(button(host, '내 이름표 듣기'));
    expect(r.controller.playing).toBe('mine');
    expect(button(host, '내 이름표 듣기').getAttribute('aria-pressed')).toBe('true');
    r.run(0.3);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, '.slot-card.is-sounding').map((c) => c.getAttribute('data-slot'))).toEqual(['up']);
    expect(text(q(tag(host, 'up'), '.slot-status.is-sounding'))).toBe('지금 울리는 음');
    r.run(1.5);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, '.slot-card.is-sounding').map((c) => c.getAttribute('data-slot'))).toEqual(['down']);
    r.run(3);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, '.slot-card.is-sounding')).toHaveLength(0);
    expect(r.controller.playing).toBeNull();
  });

  it('소리가 꺼져 있어도 같은 일을 하고, 소리 없이 재생한다는 안내가 보인다(7.9 6번)', () => {
    const r = rig('preview', [Q04]);
    const host = open(r, 'name-tags');
    expect(r.controller.soundAudible).toBe(false);
    expect(text(q(host, '#sound-off-hint'))).toContain('지금은 소리 없이 재생해요');
    hang(host, 'up', 'C', 'sharp');
    click(button(host, '내 이름표 듣기'));
    expect(r.controller.playing).toBe('mine');
  });
});

// --- 음정 이름
const question = (host: HTMLElement, qid: string): HTMLElement => q(host, `li.question-card[data-qid="${qid}"]`)!;
const answer = (host: HTMLElement, qid: string, part: 'sound' | 'notation', value: 'same' | 'different'): void =>
  click(q(question(host, qid), `.answer-${part} button[data-answer="${value}"]`));
const pickInterval = (host: HTMLElement, qid: string, quality: string, number: number): void => {
  click(q(question(host, qid), `.answer-quality button[data-quality="${quality}"]`));
  click(q(question(host, qid), `.answer-number button[data-number="${number}"]`));
};
const solveIntervals = (host: HTMLElement): void => {
  answer(host, 'c1', 'sound', 'same');
  answer(host, 'c1', 'notation', 'different');
  pickInterval(host, 'i1', 'augmented', 2);
  pickInterval(host, 'i2', 'minor', 3);
};

describe('음정 이름: 구성', () => {
  it('질문 세 개: 두 음을 비교하는 것 하나와 음정 이름을 묻는 것 둘. 각 질문에 두 음의 악보가 있다', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    expect(text(q(host, 'h1'))).toBe('같은 높이의 다른 이름');
    expect(qa(host, 'li.question-card').map((c) => c.getAttribute('data-qid'))).toEqual(['c1', 'i1', 'i2']);
    expect(qa(host, 'li.question-card h3').map((e) => text(e))).toEqual(['C♯4와 D♭4', 'C4에서 D♯4까지', 'C4에서 E♭4까지']);
    expect(qa(host, '.question-staff')).toHaveLength(3);
    // 비교 질문은 소리와 표기를 따로 묻는다
    expect(qa(question(host, 'c1'), '.choice-title').map((e) => text(e))).toEqual(['C♯4와 D♭4: 소리 높이는', 'C♯4와 D♭4: 표기(음이름)는']);
    // 음정 질문은 성질과 도수를 따로 고른다
    expect(qa(question(host, 'i1'), '.answer-quality button').map((b) => text(b).replace('✓', '').trim())).toEqual(['완전', '장', '단', '증', '감']);
    expect(qa(question(host, 'i1'), '.answer-number button').map((b) => b.getAttribute('data-number'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('확인하기 전에는 맞고 틀림도 정답도 보이지 않는다', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    expect(feedback(host)).toBe('none');
    expect(qa(host, '.slot-status.is-ok, .slot-status.is-error')).toHaveLength(0);
    expect(text(host)).not.toContain('증2도');
    expect(text(host)).not.toContain('단3도');
  });
});

describe('음정 이름: 고르기와 판정', () => {
  it('소리는 같고 표기는 다르다고 고르고, 증2도와 단3도를 고르면 통과한다', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    solveIntervals(host);
    expect(text(q(question(host, 'i1'), '.tag-name'))).toBe('고른 음정: 증2도');
    expect(text(q(question(host, 'i2'), '.tag-name'))).toBe('고른 음정: 단3도');
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(3);
  });

  it('성질만 고르면 아직 답이 아니다. 도수까지 골라야 초안에 담긴다', () => {
    const r = rig('preview', [Q04]);
    const host = open(r, 'interval-names');
    click(q(question(host, 'i1'), '.answer-quality button[data-quality="augmented"]'));
    expect(live(host)).toBe('C4에서 D♯4까지: 증을 골랐어요. 도수도 골라 주세요.');
    expect(text(q(question(host, 'i1'), '.tag-name'))).toBe('성질과 도수를 모두 골라야 답이 돼요.');
    expect(r.controller.content().slots).toEqual([]);
    click(q(question(host, 'i1'), '.answer-number button[data-number="2"]'));
    expect(text(q(question(host, 'i1'), '.tag-name'))).toBe('고른 음정: 증2도');
    expect(r.controller.content().slots).toHaveLength(1);
    expect(live(host)).toBe('C4에서 D♯4까지: 증2도라고 골랐어요.');
  });

  it('소리가 같다는 것과 이름이 같다는 것을 따로 틀릴 수 있다: 표기를 "같아요"로 고르면 표기만 고칠 곳이 된다', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    answer(host, 'c1', 'sound', 'same');
    answer(host, 'c1', 'notation', 'same');
    pickInterval(host, 'i1', 'augmented', 2);
    pickInterval(host, 'i2', 'minor', 3);
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    const q1 = question(host, 'c1');
    expect(q1.classList.contains('has-error')).toBe(true);
    expect(q(q1, '.answer-notation')!.classList.contains('has-error')).toBe(true);
    expect(q(q1, '.answer-sound')!.classList.contains('has-error')).toBe(false);
    expect(text(q(q1, '.slot-message'))).toBe('C♯4와 D♭4: 표기(음이름)가 달라요.');
    expect(text(q(q1, '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    // 다른 질문은 맞다
    expect(text(q(question(host, 'i1'), '.slot-status.is-ok'))).toBe('맞아요');
  });

  it('세 반음이라는 이유로 증2도를 단3도로 고르면 틀린다', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    answer(host, 'c1', 'sound', 'same');
    answer(host, 'c1', 'notation', 'different');
    pickInterval(host, 'i1', 'minor', 3);
    pickInterval(host, 'i2', 'minor', 3);
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(question(host, 'i1').classList.contains('has-error')).toBe(true);
    expect(text(q(question(host, 'i1'), '.slot-message'))).toContain('목표는 증2도');
    expect(question(host, 'i2').classList.contains('has-error')).toBe(false);
  });

  it('비교 질문에 한쪽만 답하면, 판정받지 않은 답에는 맞다고 하지 않고 빠진 답만 고칠 곳으로 알린다', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    answer(host, 'c1', 'sound', 'same');
    pickInterval(host, 'i1', 'augmented', 2);
    pickInterval(host, 'i2', 'minor', 3);
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(q(question(host, 'c1'), '.answer-notation')!.classList.contains('has-error')).toBe(true);
    expect(q(question(host, 'c1'), '.answer-sound')!.classList.contains('has-error')).toBe(false);
    expect(text(q(question(host, 'c1'), '.slot-message'))).toBe('C♯4와 D♭4: 아직 답이 없어요.');
    expect(q(question(host, 'c1'), '.slot-status.is-ok')).toBeNull();
  });

  it('성질이나 도수를 바꾸면 이전 확인 결과가 사라지고, 지우기는 고른 음정만 비운다', () => {
    const r = rig('preview', [Q04]);
    const host = open(r, 'interval-names');
    solveIntervals(host);
    check(host);
    expect(feedback(host)).toBe('passed');
    click(q(question(host, 'i1'), '.answer-number button[data-number="3"]'));
    expect(feedback(host)).toBe('none');
    expect(text(q(question(host, 'i1'), '.tag-name'))).toBe('고른 음정: 증3도');
    click(button(question(host, 'i1'), '지우기'));
    expect(text(q(question(host, 'i1'), '.tag-name'))).toBe('성질과 도수를 모두 골라야 답이 돼요.');
    expect(text(q(question(host, 'i2'), '.tag-name'))).toBe('고른 음정: 단3도');
    expect(r.controller.content().slots).toHaveLength(3); // 비교 둘, 음정 하나(i2)
  });

  it('두 음 듣기는 답을 하지 않아도 질문의 두 음을 울린다. 울리는 동안 그 질문 카드에 표시가 붙고, 끝나면 사라진다', async () => {
    const r = rig('preview', [Q04]);
    const host = open(r, 'interval-names');
    click(button(question(host, 'i1'), '두 음 듣기'));
    expect(r.controller.playing).toBe('mine');
    r.run(0.3);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.question-card.is-sounding').map((c) => c.getAttribute('data-qid'))).toEqual(['i1']);
    expect(text(q(question(host, 'i1'), '.slot-status.is-sounding'))).toBe('지금 울리는 음');
    r.run(4);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, 'li.question-card.is-sounding')).toHaveLength(0);
    expect(r.controller.playing).toBeNull();
  });

  it('모든 버튼과 고르개에 이름이 붙어 있다(7.9 8번)', () => {
    const host = open(rig('preview', [Q04]), 'interval-names');
    for (const g of qa(host, '.choice-group')) expect(text(q(host, `#${g.getAttribute('aria-labelledby')!}`)).length).toBeGreaterThan(0);
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
  });
});
