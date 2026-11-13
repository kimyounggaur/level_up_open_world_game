// @vitest-environment jsdom
// 6-7 화음 사건 목록(확장 X-3) 패널: Q21 다장조의 세 기둥, Q23 화음 이어 걷기. 종나무 여러 그루에 화음을 하나씩 건다.
// 완료 기준: 화음이 길의 차례(나무)에 맞게 걸려야 통과한다. 옥타브와 가로 자리와 종의 칸 순서는 정답에 영향을 주지 않는다(W-3).
// 눌러서만 끝낼 수 있고(7.9 1·2번), 맞고 틀림은 기호와 문장으로 알린다(4번). 정답(구성음)은 화면 어디에도 없다.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bellPassedText } from '@/ui/challenge/bellText';
import { ChordPanel } from '@/ui/panels/chord/ChordPanel';
import { Q05, Q06, button, click, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

const Q21 = 'chord.primary-triads';
const Q23 = 'chord.progression-walk';
const PILLARS = 'c-major-pillars';
const WALK = 'c-major-walk';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

const close = (): void => {
  current?.unmount();
  current = null;
};

function open(r: Rig, quest: string, variant: string): HTMLElement {
  act(() => {
    r.controller.open(quest, variant);
  });
  const m = mount(h(ChordPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

const boot = (quest = Q21, variant = PILLARS) => {
  const r = rig('preview', [Q05, Q06, Q21, Q23]);
  return { r, host: open(r, quest, variant) };
};

const live = (host: HTMLElement): string => text(q(host, '.sr-only[role="status"]'));
const check = (host: HTMLElement): void => click(button(host, '배치 확인'));
const feedback = (host: HTMLElement): string => q(host, '.feedback')!.getAttribute('data-feedback')!;
const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (): Promise<void> => {
  await act(async () => {
    await later(80);
  });
};
/** 나무(0부터)와 종 번호(1부터)가 가리키는 종 카드. 칸 번호는 나무 × 4 + 열이다 */
const bell = (host: HTMLElement, tree: number, n: number): HTMLElement => q(host, `li.bell-card[data-slot="tone-${tree * 4 + n - 1}"]`)!;
const treeCard = (host: HTMLElement, tree: number): HTMLElement => q(host, `section[data-tree="${tree}"]`)!;
const sounding = (host: HTMLElement): string[] => qa(host, 'li.bell-card.is-sounding').map((c) => c.getAttribute('data-slot')!);
const bellName = (host: HTMLElement, tree: number, n: number): string => q(bell(host, tree, n), '.tag-name')!.getAttribute('data-name')!;
const letter = (host: HTMLElement, tree: number, n: number, l: string): void => click(q(bell(host, tree, n), `.pick-letters button[data-letter="${l}"]`));
const octave = (host: HTMLElement, tree: number, n: number, o: number): void => click(q(bell(host, tree, n), `.pick-octaves button[data-octave="${o}"]`));
const hang = (host: HTMLElement, tree: number, n: number, l: string, o?: number): void => {
  letter(host, tree, n, l);
  if (o !== undefined) octave(host, tree, n, o);
};
const hangChord = (host: HTMLElement, tree: number, letters: string): void => {
  [...letters].forEach((l, i) => hang(host, tree, i + 1, l));
};
/** 세 나무에 으뜸화음(C E G), 버금딸림화음(F A C), 딸림화음(G B D)을 건다 */
const hangPrimaryTriads = (host: HTMLElement): void => {
  hangChord(host, 0, 'CEG');
  hangChord(host, 1, 'FAC');
  hangChord(host, 2, 'GBD');
};

describe('세 기둥(Q21): 구성', () => {
  it('제목과 안내, 화음의 길, 나무 세 그루가 있다', () => {
    const { host } = boot();
    expect(text(q(host, 'h1'))).toBe('다장조의 세 기둥');
    expect(text(q(host, '.subtitle'))).toBe('나무 3그루에 화음을 하나씩 걸어 보세요. 나무마다 종은 최대 4개까지 걸 수 있어요.');
    expect(qa(host, 'section[data-tree]').map((s) => s.getAttribute('data-tree'))).toEqual(['0', '1', '2']);
    expect(qa(host, 'section[data-tree] h2').map((e) => text(e))).toEqual(['첫째 나무 · 으뜸화음 나무', '둘째 나무 · 버금딸림화음 나무', '셋째 나무 · 딸림화음 나무']);
    expect(qa(host, 'svg.bell-tree')).toHaveLength(3);
    for (const svg of qa(host, 'svg.bell-tree')) expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(qa(host, 'svg.bell-tree .tree-bell')).toHaveLength(0);
  });

  it('칩은 걸린 종의 수와 쓸 수 있는 옥타브를 말한다', () => {
    const { host } = boot();
    const chips = qa(host, '.chips .chip').map((c) => text(c));
    expect(chips[0]).toBe('걸린 종 0개');
    expect(chips[1]).toBe('옥타브 4·5'); // 이 판본의 음역은 C4-B5다
    hang(host, 0, 1, 'C');
    hang(host, 2, 3, 'D');
    expect(text(qa(host, '.chips .chip')[0]!)).toBe('걸린 종 2개');
  });

  it('화음의 길은 처음부터 보인다: 사건의 차례와 이름과 그 화음이 걸릴 나무', () => {
    const { host } = boot();
    const steps = qa(host, 'ol.route-list li.route-step');
    expect(q(host, 'ol.route-list')!.getAttribute('data-events')).toBe('3');
    expect(steps.map((s) => s.getAttribute('data-tree'))).toEqual(['0', '1', '2']);
    expect(steps.map((s) => text(q(s, '.route-no')))).toEqual(['1', '2', '3']);
    expect(steps.map((s) => text(q(s, 'strong')))).toEqual(['으뜸화음 나무', '버금딸림화음 나무', '딸림화음 나무']);
    expect(steps.map((s) => text(q(s, '.muted')))).toEqual(['첫째 나무', '둘째 나무', '셋째 나무']);
    expect(q(host, '.route-no')!.getAttribute('aria-hidden')).toBe('true'); // 차례는 목록(ol)이 이미 말한다
  });

  it('나무마다 종 카드 넷(음이름·변화표·옥타브 고르개)과 이 나무의 악보가 있다', () => {
    const { host } = boot();
    for (const tree of [0, 1, 2]) {
      const card = treeCard(host, tree);
      expect(qa(card, 'li.bell-card h3').map((e) => text(e))).toEqual(['종 1', '종 2', '종 3', '종 4']);
      expect(qa(card, 'li.bell-card').map((c) => c.getAttribute('data-slot'))).toEqual([0, 1, 2, 3].map((n) => `tone-${tree * 4 + n}`));
      expect(qa(card, '.pick-letters button')).toHaveLength(4 * 7);
      expect(qa(card, '.pick-accidentals button')).toHaveLength(4 * 3);
      expect(text(q(card, 'figure.score-figure figcaption'))).toBe(['첫째', '둘째', '셋째'][tree] + ' 나무의 종');
      expect(text(q(card, '.card-head > .muted.small'))).toBe('걸린 종 0개');
    }
  });

  it('정답(구성음)은 화면 어디에도 없다', () => {
    for (const [quest, variant] of [[Q21, PILLARS], [Q23, WALK]] as const) {
      const { host } = boot(quest, variant);
      for (const notes of ['C E G', 'F A C', 'G B D', 'C·E·G', 'F·A·C', 'G·B·D']) expect(text(host), notes).not.toContain(notes);
      close();
    }
  });

  it('도움 화면에는 이어 듣기 세 가지와 목표 듣기와 배치 확인이 있다', () => {
    const { host } = boot();
    expect(qa(host, '[data-hear-route]').map((b) => b.getAttribute('data-hear-route'))).toEqual(['together', 'ascending', 'lowest']);
    expect(qa(host, '[data-hear-route]').map((b) => text(b))).toEqual(['이어 듣기: 함께 울리기', '아래부터 차례로', '가장 낮은 종만']);
    expect(qa(host, '[data-hear-tree]').map((b) => b.getAttribute('data-hear-tree'))).toEqual(['0', '1', '2']);
    expect(button(host, '목표 화음 듣기')).not.toBeNull();
    expect(button(host, '배치 확인')).not.toBeNull();
  });

  it('모든 단추와 고르개에 이름이 붙어 있다(7.9 8번)', () => {
    const { host } = boot();
    for (const g of qa(host, '.choice-group')) expect(text(q(host, `#${g.getAttribute('aria-labelledby')!}`)).length).toBeGreaterThan(0);
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    // 종의 이름은 어느 나무의 몇 번째 종인지 말한다(나무가 여럿이라 '종 3'만으로는 어느 것인지 모른다)
    expect(text(q(bell(host, 1, 3), '.choice-title'))).toBe('둘째 나무의 3번째 종: 음이름');
    expect(button(bell(host, 2, 1), '비우기').getAttribute('aria-label')).toBe('셋째 나무의 1번째 종: 비우기');
  });

  it('제목 순서가 건너뛰지 않는다: 제목은 h1 하나이고 카드 제목이 h2, 종 제목이 h3다', () => {
    const { host } = boot();
    expect(qa(host, 'h1')).toHaveLength(1);
    const ids = qa(host, 'h1, h2, h3').map((e) => Number(e.tagName[1]));
    for (let i = 1; i < ids.length; i++) expect(ids[i]! - ids[i - 1]!, ids.join('')).toBeLessThanOrEqual(1);
    expect(qa(host, 'section.card[aria-labelledby]').every((s) => q(host, `#${s.getAttribute('aria-labelledby')!}`) !== null)).toBe(true);
  });
});

describe('세 기둥(Q21): 종 걸기', () => {
  it('음이름을 고르면 그 나무의 그 종 칸에 걸린다. 고칠 때마다 문장으로 알리고 어느 나무인지 말한다', () => {
    const { host } = boot();
    letter(host, 1, 1, 'F');
    expect(bellName(host, 1, 1)).toBe('F4');
    expect(live(host)).toBe('둘째 나무의 1번째 종: F4로 걸었어요.');
    expect(text(bell(host, 1, 1))).toContain('걸린 종: F4');
    // 다른 나무의 같은 자리는 비어 있다
    expect(bellName(host, 0, 1)).toBe('');
    expect(bellName(host, 2, 1)).toBe('');
    click(q(bell(host, 1, 1), '.pick-accidentals button[data-accidental="sharp"]'));
    expect(bellName(host, 1, 1)).toBe('F♯4');
    octave(host, 1, 1, 5);
    expect(bellName(host, 1, 1)).toBe('F♯5');
    expect(live(host)).toBe('둘째 나무의 1번째 종: F♯5로 바꿨어요.');
  });

  it('종은 자기 나무의 가지에 매달린다. 다른 나무의 그림에는 나타나지 않는다', () => {
    const { host } = boot();
    hang(host, 1, 2, 'A', 4);
    hang(host, 2, 4, 'D', 5);
    const bellsOf = (tree: number) => qa(treeCard(host, tree), 'svg.bell-tree .tree-bell').map((g) => [g.getAttribute('data-slot'), g.getAttribute('data-octave'), text(q(g, '.tree-name'))]);
    expect(bellsOf(0)).toEqual([]);
    expect(bellsOf(1)).toEqual([['1', '4', 'A4']]);
    expect(bellsOf(2)).toEqual([['3', '5', 'D5']]);
    expect(text(q(treeCard(host, 1), '.card-head > .muted.small'))).toBe('걸린 종 1개');
    expect(text(q(treeCard(host, 0), '.card-head > .muted.small'))).toBe('걸린 종 0개');
  });

  it('걸린 종은 비우기로 내린다. 비어 있으면 누를 수 없다', () => {
    const { host } = boot();
    expect(button(bell(host, 2, 2), '비우기').disabled).toBe(true);
    hang(host, 2, 2, 'B');
    expect(button(bell(host, 2, 2), '비우기').disabled).toBe(false);
    click(button(bell(host, 2, 2), '비우기'));
    expect(bellName(host, 2, 2)).toBe('');
    expect(live(host)).toBe('셋째 나무의 2번째 종을 비웠어요.');
    expect(text(q(host, '.chips .chip'))).toBe('걸린 종 0개');
  });

  it('나무마다 악보가 따로 그려진다: 걸린 종이 있는 나무만 악보에 음이 나온다', () => {
    const { host } = boot();
    hangChord(host, 0, 'CEG');
    for (const tree of [0, 1, 2]) {
      expect(q(treeCard(host, tree), '.score-figure svg'), `나무 ${tree}`).not.toBeNull();
      expect(q(treeCard(host, tree), '.score-figure .staff-error')).toBeNull();
    }
  });
});

describe('세 기둥(Q21): 판정', () => {
  it('세 나무에 으뜸·버금딸림·딸림화음을 걸면 통과한다. 걸린 종마다 맞다고 알린다', () => {
    const { r, host } = boot();
    hangPrimaryTriads(host);
    check(host);
    expect(feedback(host)).toBe('passed');
    const box = text(q(host, '.feedback'));
    expect(box).toContain('통과했어요.');
    expect(box).toContain(bellPassedText(r.controller.current!.def));
    expect(box).toContain('의 화음이 차례로 모두 걸렸어요.');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(9);
    expect(qa(host, 'li.bell-card.has-error')).toHaveLength(0);
  });

  it('옥타브와 종의 칸 순서는 정답에 영향을 주지 않는다: 한 나무 안에서 G5 C4 E5처럼 걸어도 그 화음이다', () => {
    const { host } = boot();
    hang(host, 0, 1, 'G', 5);
    hang(host, 0, 2, 'C', 4);
    hang(host, 0, 4, 'E', 5);
    hangChord(host, 1, 'FAC');
    hang(host, 2, 4, 'D', 5);
    hang(host, 2, 2, 'B', 4);
    hang(host, 2, 3, 'G', 5);
    check(host);
    expect(feedback(host)).toBe('passed');
  });

  it('화음이 길의 차례와 다른 나무에 걸리면 통과하지 못한다(나무의 가로 순서가 아니라 길의 차례가 정한다)', () => {
    const { host } = boot();
    hangChord(host, 0, 'FAC');
    hangChord(host, 1, 'CEG');
    hangChord(host, 2, 'GBD');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).not.toContain('통과했어요.');
  });

  it('한 나무에 틀린 종이 있으면 그 나무의 문제만 알린다: 다른 나무의 맞는 종은 맞다고 한다', () => {
    const { host } = boot();
    hangChord(host, 0, 'CEG');
    hangChord(host, 1, 'FAC');
    hang(host, 2, 1, 'G');
    hang(host, 2, 2, 'B');
    hang(host, 2, 3, 'D');
    hang(host, 2, 4, 'F'); // 딸림화음에 F가 더해졌다
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    const lines = qa(host, '.feedback .feedback-line').map((l) => text(l));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('F가 더해져 있어요'))).toBe(true);
    // 어느 화음의 일인지 문장이 말한다: 화음의 길에 보이는 이름으로 시작한다(길의 이름이 곧 나무를 가리킨다)
    expect(lines.every((l) => l.startsWith('딸림화음 나무: '))).toBe(true);
    expect(bell(host, 2, 4).classList.contains('has-error')).toBe(true);
    expect(text(q(bell(host, 2, 4), '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    expect(text(q(bell(host, 2, 4), '.slot-message'))).toContain('F가 더해져 있어요');
    for (const [tree, n] of [[0, 1], [0, 2], [0, 3], [1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]] as const) {
      expect(bell(host, tree, n).classList.contains('has-error'), `${tree}-${n}`).toBe(false);
      expect(text(q(bell(host, tree, n), '.slot-status.is-ok')), `${tree}-${n}`).toBe('맞아요');
    }
  });

  it('음이 빠지면 빠진 음을 문장으로만 알린다(종마다의 표시가 아니다)', () => {
    const { host } = boot();
    hangChord(host, 0, 'CEG');
    hang(host, 1, 1, 'F');
    hang(host, 1, 2, 'A');
    hangChord(host, 2, 'GBD');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('버금딸림화음 나무: C가 빠졌어요.');
    expect(qa(host, 'li.bell-card.has-error')).toHaveLength(0);
  });

  it('아무 종도 걸지 않고 확인하면 나무마다의 문제를 알리고 종마다의 표시는 없다', () => {
    const { host } = boot();
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(qa(host, '.feedback .feedback-line').length).toBeGreaterThan(0);
    expect(qa(host, '.slot-status')).toHaveLength(0);
  });

  it('종을 바꾸면 이전 확인 결과가 사라진다', () => {
    const { host } = boot();
    hangPrimaryTriads(host);
    check(host);
    expect(feedback(host)).toBe('passed');
    hang(host, 2, 4, 'F');
    expect(feedback(host)).toBe('none');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(0);
    expect(text(q(host, '.feedback-idle'))).toBe("나무마다 종을 걸고 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.");
  });

  it('확인하기 전에는 맞고 틀림을 알리지 않는다', () => {
    const { host } = boot();
    hangPrimaryTriads(host);
    expect(feedback(host)).toBe('none');
    expect(qa(host, '.slot-status')).toHaveLength(0);
    expect(qa(host, '.feedback-line')).toHaveLength(0);
  });
});

describe('세 기둥(Q21): 듣기', () => {
  it('걸린 종이 없으면 이유를 알린다: 이어 듣기는 길 전체의 이유로, 나무 듣기는 그 나무의 이름으로', () => {
    const { r, host } = boot();
    click(button(host, '이어 듣기: 함께 울리기'));
    expect(text(q(host, '.hint-notice'))).toBe('아직 걸린 종이 없어요. 종을 골라 걸어 보세요.');
    expect(r.controller.playing).toBeNull();
    click(q(host, '[data-hear-tree="1"]'));
    expect(text(q(host, '.hint-notice'))).toBe('둘째 나무에는 아직 걸린 종이 없어요.');
    expect(r.controller.playing).toBeNull();
  });

  it('이어 듣기는 길의 차례대로 나무마다 화음을 울린다. 지금 울리는 종에 표시가 붙는다', async () => {
    const { r, host } = boot();
    hangPrimaryTriads(host);
    click(button(host, '이어 듣기: 함께 울리기'));
    expect(button(host, '이어 듣기: 함께 울리기').getAttribute('aria-pressed')).toBe('true');
    expect(button(host, '아래부터 차례로').getAttribute('aria-pressed')).toBe('false');
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-0', 'tone-1', 'tone-2']); // 첫째 나무의 화음
    expect(qa(treeCard(host, 0), 'svg.bell-tree .tree-bell.is-sounding')).toHaveLength(3);
    expect(qa(treeCard(host, 1), 'svg.bell-tree .tree-bell.is-sounding')).toHaveLength(0);
    expect(text(q(bell(host, 0, 1), '.slot-status.is-sounding'))).toBe('지금 울리는 음');
    r.run(3.2); // 한 화음은 온음표다(80박에서 3초)
    await settle();
    expect(sounding(host)).toEqual(['tone-4', 'tone-5', 'tone-6']); // 둘째 나무의 화음
    r.run(3);
    await settle();
    expect(sounding(host)).toEqual(['tone-8', 'tone-9', 'tone-10']); // 셋째 나무의 화음
    r.run(6);
    await settle();
    expect(sounding(host)).toEqual([]);
    expect(r.controller.playing).toBeNull();
  });

  it('나무 듣기 단추의 이름은 보이는 글자를 품는다(낭독기가 화면의 말 그대로 부르고, 어느 나무인지도 알린다)', () => {
    const { host } = boot();
    const buttons = qa(host, '[data-hear-tree]');
    expect(buttons).toHaveLength(3);
    const names = buttons.map((b) => b.getAttribute('aria-label') ?? '');
    expect(names).toEqual(['이 나무 듣기: 첫째 나무의 화음', '이 나무 듣기: 둘째 나무의 화음', '이 나무 듣기: 셋째 나무의 화음']);
    for (const b of buttons) {
      const seen = text(b).replace(/\s+/g, '');
      expect(seen).toBe('이나무듣기');
      expect((b.getAttribute('aria-label') ?? '').replace(/\s+/g, '')).toContain(seen);
    }
  });

  it('이 나무 듣기는 그 나무의 화음만 울린다', async () => {
    const { r, host } = boot();
    hangPrimaryTriads(host);
    click(q(host, '[data-hear-tree="1"]'));
    expect(r.controller.playing).toBe('mine');
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-4', 'tone-5', 'tone-6']);
    r.run(4);
    await settle();
    expect(sounding(host)).toEqual([]);
  });

  it('가장 낮은 종만 이어 들으면 나무마다 가장 낮은 종 하나씩 울린다', async () => {
    const { r, host } = boot();
    hang(host, 0, 1, 'G', 4);
    hang(host, 0, 2, 'C', 4);
    hang(host, 0, 3, 'E', 4);
    hangChord(host, 1, 'FAC');
    click(button(host, '가장 낮은 종만'));
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-1']); // 첫째 나무에서 가장 낮은 것은 C(둘째 칸)
  });

  it('목표 화음 듣기는 목표를 재생한다', () => {
    const { r, host } = boot();
    click(button(host, '목표 화음 듣기'));
    expect(r.controller.playing).toBe('target');
    expect(button(host, '목표 화음 듣기').getAttribute('aria-pressed')).toBe('true');
  });

  it('종을 걸 때마다 그 소리를 한 번 들려 준다. 소리를 켜기 전에는 나지 않고, 비울 때는 소리가 없다(W-11)', async () => {
    const { r, host } = boot();
    hang(host, 1, 1, 'F');
    expect(r.engine.sinks.size).toBe(0);
    await act(async () => {
      await r.controller.enableSound();
    });
    r.engine.sinks.get('task')?.requests.splice(0);
    hang(host, 1, 2, 'A');
    expect(r.engine.sinks.get('task')!.live().map((n) => n.midi)).toEqual([69]); // A4
    r.engine.sinks.get('task')!.requests.splice(0);
    octave(host, 1, 2, 5);
    expect(r.engine.sinks.get('task')!.live().map((n) => n.midi)).toEqual([81]); // A5
    r.engine.sinks.get('task')!.requests.splice(0);
    click(button(bell(host, 1, 2), '비우기'));
    expect(r.engine.sinks.get('task')!.live()).toEqual([]);
  });
});

describe('화음 이어 걷기(Q23): 같은 나무로 돌아오는 길', () => {
  it('길이 네 걸음이다: 으뜸 → 버금딸림 → 딸림 → 으뜸. 처음과 끝이 같은 나무를 가리킨다', () => {
    const { host } = boot(Q23, WALK);
    const steps = qa(host, 'ol.route-list li.route-step');
    expect(q(host, 'ol.route-list')!.getAttribute('data-events')).toBe('4');
    expect(steps.map((s) => s.getAttribute('data-tree'))).toEqual(['0', '1', '2', '0']);
    expect(steps.map((s) => text(q(s, '.route-no')))).toEqual(['1', '2', '3', '4']);
    expect(steps.map((s) => text(q(s, '.muted')))).toEqual(['첫째 나무', '둘째 나무', '셋째 나무', '첫째 나무']);
    // 나무는 셋뿐이다: 길이 넷이어도 카드는 나무마다 하나
    expect(qa(host, 'section[data-tree]')).toHaveLength(3);
    // 나무 이름 옆에는 그 나무를 처음 가리키는 사건의 이름이 붙는다
    expect(text(q(treeCard(host, 0), 'h2'))).toContain('첫째 나무');
  });

  it('세 나무에 화음을 하나씩 걸면 통과한다(처음과 끝의 으뜸화음은 같은 나무다)', () => {
    const { r, host } = boot(Q23, WALK);
    hangPrimaryTriads(host);
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain(bellPassedText(r.controller.current!.def));
  });

  it('통과하면 전위를 알려 주기만 한다: 판정은 그대로이고 한 문장이 덧붙는다(5.5)', () => {
    const { r, host } = boot(Q23, WALK);
    const hangAt = (tree: number, notes: Array<[string, number]>): void => notes.forEach(([l, o], i) => hang(host, tree, i + 1, l, o));
    hangAt(0, [['C', 4], ['E', 4], ['G', 4]]);
    hangAt(1, [['F', 4], ['A', 4], ['C', 5]]);
    hangAt(2, [['G', 4], ['B', 4], ['D', 5]]);
    expect(q(host, '[data-shape-note]')).toBeNull();
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '[data-shape-note]'))).toBe('전위는 판정하지 않고 알려만 줘요. 처음 으뜸화음은 기본 위치, 버금딸림화음은 기본 위치, 딸림화음은 기본 위치, 마지막 으뜸화음은 기본 위치예요.');
    expect(live(host)).toContain('통과했어요. 전위는 판정하지 않고 알려만 줘요.');
    expect(r.controller.feedback?.notes).toHaveLength(1);
    // 같은 도전에서 전위로 걸어도 통과하고, 안내만 달라진다
    hangAt(0, [['E', 4], ['G', 4], ['C', 5]]);
    hangAt(2, [['D', 4], ['G', 4], ['B', 4]]);
    expect(q(host, '[data-shape-note]')).toBeNull(); // 고치면 지난 결과는 사라진다
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '[data-shape-note]'))).toBe('전위는 판정하지 않고 알려만 줘요. 처음 으뜸화음은 제1전위, 버금딸림화음은 기본 위치, 딸림화음은 제2전위, 마지막 으뜸화음은 제1전위예요.');
  });

  it('통과하지 못하면 전위는 말하지 않는다. 알릴 전위가 없는 도전(Q21)에도 덧붙는 말이 없다', () => {
    const { host } = boot(Q23, WALK);
    hangChord(host, 0, 'CE');
    check(host);
    expect(feedback(host)).not.toBe('passed');
    expect(q(host, '[data-shape-note]')).toBeNull();
    close();
    const pillars = boot(Q21, PILLARS);
    hangPrimaryTriads(pillars.host);
    check(pillars.host);
    expect(feedback(pillars.host)).toBe('passed');
    expect(q(pillars.host, '[data-shape-note]')).toBeNull();
    expect(pillars.r.controller.feedback?.notes).toBeUndefined();
  });

  it('길을 따라 이어 듣는다: 으뜸 → 버금딸림 → 딸림 → 다시 첫째 나무의 화음', async () => {
    const { r, host } = boot(Q23, WALK);
    hangPrimaryTriads(host);
    click(button(host, '이어 듣기: 함께 울리기'));
    const seen: string[][] = [];
    for (let i = 0; i < 4; i++) {
      r.run(i === 0 ? 0.3 : 3);
      await settle();
      seen.push(sounding(host));
    }
    expect(seen).toEqual([
      ['tone-0', 'tone-1', 'tone-2'],
      ['tone-4', 'tone-5', 'tone-6'],
      ['tone-8', 'tone-9', 'tone-10'],
      ['tone-0', 'tone-1', 'tone-2'],
    ]);
  });
});

describe('화음 패널의 갈래', () => {
  it('화음 사건 목록 판본은 이 패널로, 구성음 판본과 전위 판본은 각자의 패널로 간다', () => {
    const seq = boot();
    expect(q(seq.host, 'section[data-tree]')).not.toBeNull();
    expect(q(seq.host, 'ol.route-list')).not.toBeNull();
    close();
    const r = rig('preview', [Q05, Q06, Q21, Q23]);
    const triad = open(r, Q05, 'c-major');
    expect(q(triad, 'ol.route-list')).toBeNull();
    expect(text(q(triad, 'h1'))).toBe('장3화음 조립하기');
    close();
    const tower = open(rig('preview', [Q05, Q06, Q21, Q23]), Q06, 'c-first');
    expect(q(tower, 'ol.route-list')).toBeNull();
    expect(text(q(tower, 'h1'))).toBe('베이스를 바꾸어 전위 만들기');
  });
});
