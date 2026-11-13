// @vitest-environment jsdom
// 4-3 음계 패널(Q07, 패널 쌍둥이): 월드의 디딤돌 길과 같은 초안·같은 작업대를 쓴다(4.2 '패널로 보기').
// W-2(패널에서 풀 수 있다), W-4(끌지 않고 키보드와 누르기로 모두 된다), 맞고 틀림을 색만으로 전하지 않는다(7.9 4번).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SlotBench } from '@/ui/challenge/slotBench';
import { ScalePanel, describeSlotScore, scalePrompt } from '@/ui/panels/scale/ScalePanel';
import { Q07, button, click, keydown, mount, q, qa, quest, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
let benchNow: SlotBench | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
  benchNow?.dispose();
  benchNow = null;
});

function open(r: Rig, variantId = 'c-major', setup?: (bench: SlotBench) => void) {
  const bench = new SlotBench(r.controller);
  benchNow = bench;
  act(() => {
    r.controller.open(Q07, variantId);
    setup?.(bench);
  });
  const m = mount(h(ScalePanel, { controller: r.controller, bench }));
  current = m;
  return { host: m.host, bench };
}

const stone = (host: HTMLElement, slot: number): HTMLButtonElement => q<HTMLButtonElement>(host, `button.cell-mine[data-slot="${slot}"]`)!;
const stoneNames = (host: HTMLElement): string[] => qa(host, 'button.cell-mine').map((b) => b.getAttribute('data-name') ?? '');
const shelf = (host: HTMLElement, i: number): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-shelf="${i}"]`)!;
const accidental = (host: HTMLElement, which: 'flat' | 'none' | 'sharp'): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-accidental="${which}"]`)!;
const press = (el: Element, code: string, init: KeyboardEventInit = {}): boolean => keydown(el, code, { code, ...init });

describe('구성', () => {
  it('제목, 과제 문장, 마디별 자리 단추 여덟 개, 재료 선반, 변화표, 듣기·확인이 있다', () => {
    const r = rig();
    const { host } = open(r);
    expect(text(q(host, 'h1'))).toBe('장음계 배열하기');
    expect(text(q(host, '.subtitle'))).toBe('C장조의 장음계를 C4부터 C5까지 8자리에 차례로 놓아 보세요.');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['C장조', '자리 8개', '한 자리 = 4분음표']);
    expect(qa(host, '.timeline-row h3').map((e) => text(e))).toEqual(['1번째 마디', '2번째 마디']);
    expect(qa(host, 'ol.cells')).toHaveLength(2);
    expect(qa(host, 'button.cell-mine')).toHaveLength(8);
    expect(stoneNames(host)).toEqual(Array(8).fill(''));
    expect(text(stone(host, 1))).toContain('비어 있음');
    expect(qa(host, 'button.material[data-shelf]').map((b) => text(b))).toEqual(['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']);
    expect(qa(host, 'button.material[data-accidental]').map((b) => text(b))).toEqual(['♭내림표', '없음변화표 없음', '♯올림표']);
    for (const label of ['내 배치 듣기', '목표 듣기', '정지', '배치 확인', '실행 취소', '다시 실행', '키 도움', '첫 자리에 놓기']) expect(button(host, label), label).toBeTruthy();
    expect(q(host, '#aid-slow')).not.toBeNull();
  });

  it('박 칸이 없는 과제라서 반복 구간과 박 수 표시 도움은 없다', () => {
    const r = rig();
    const { host } = open(r);
    expect(q(host, '#aid-repeat')).toBeNull();
    expect(q(host, '#aid-count')).toBeNull();
  });

  it('목표 악보를 보여 주지 않는다(음계 과제는 목표가 곧 답이다). 내 악보만 오선에 그린다', () => {
    const r = rig();
    const { host } = open(r);
    expect(text(host)).not.toContain('목표 악보');
    expect(qa(host, '.score-figure')).toHaveLength(1);
    expect(qa(host, '.staff-host svg')).toHaveLength(1);
  });

  it('조표가 있는 판본의 선반은 조표를 적용한 이름으로 읽힌다(F장조의 B는 B♭)', () => {
    const r = rig();
    const { host } = open(r, 'f-major');
    expect(text(q(host, '.subtitle'))).toBe('F장조의 장음계를 F4부터 F5까지 8자리에 차례로 놓아 보세요.');
    expect(qa(host, 'button.material[data-shelf]').map((b) => text(b))).toEqual(['E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5', 'F5', 'G5']);
  });

  it('B♭장조는 한 옥타브 아래에서 시작한다(B♭3–B♭4)', () => {
    const r = rig();
    const { host } = open(r, 'bflat-major');
    expect(text(q(host, '.subtitle'))).toBe('B♭장조의 장음계를 B♭3부터 B♭4까지 8자리에 차례로 놓아 보세요.');
    expect(text(shelf(host, 1))).toBe('B♭3');
  });

  it('과제 문장과 악보 설명을 만드는 순수 함수', () => {
    const def = quest(Q07).variants['g-major']!;
    expect(scalePrompt(def, 8)).toBe('G장조의 장음계를 G4부터 G5까지 8자리에 차례로 놓아 보세요.');
    const views = [
      { slot: 1, written: null, spelled: null, midi: null, name: 'G4' },
      { slot: 2, written: null, spelled: null, midi: null, name: null },
    ];
    expect(describeSlotScore(def, views)).toBe('높은음자리표, 4/4박자, G장조의 조표. 1번째 자리 G4, 2번째 자리 비어 있음.');
  });

  it('열려 있는 과제가 없으면 아무것도 그리지 않는다', () => {
    const r = rig();
    const bench = new SlotBench(r.controller);
    benchNow = bench;
    const m = mount(h(ScalePanel, { controller: r.controller, bench }));
    current = m;
    expect(m.host.innerHTML).toBe('');
  });
});

describe('눌러서 놓기(마우스와 터치, 끌지 않는다)', () => {
  it('재료를 고르고 빈 자리를 누르면 놓인다. 놓인 자리를 누르면 고르기만 하고 덮어쓰지 않는다', () => {
    const r = rig();
    const { host, bench } = open(r);
    click(shelf(host, 3)); // E4
    expect(text(q(host, '.tray-mode'))).toContain('손에 든 음: E4');
    click(stone(host, 3));
    expect(stoneNames(host)[2]).toBe('E4');
    expect(stone(host, 3).getAttribute('aria-label')).toBe('3번째 자리, E4, 고른 자리');
    expect(stone(host, 3).getAttribute('aria-current')).toBe('true');
    // 다른 재료를 들고 같은 자리를 누르면 고르기만 한다
    click(shelf(host, 5)); // G4
    click(stone(host, 3));
    expect(stoneNames(host)[2]).toBe('E4');
    expect(text(q(host, '.sr-only[role="status"]'))).toContain('바꾸려면 놓기를 누르세요');
    // 놓기 단추는 바꾼다
    click(button(host, '3번째 자리에 놓기'));
    expect(stoneNames(host)[2]).toBe('G4');
    expect(bench.views()[2]!.name).toBe('G4');
  });

  it('변화표를 고르면 선반의 이름이 바뀌고, 그 이름으로 놓인다', () => {
    const r = rig();
    const { host } = open(r);
    click(accidental(host, 'sharp'));
    expect(text(shelf(host, 1))).toBe('C♯4');
    expect(accidental(host, 'sharp').getAttribute('aria-pressed')).toBe('true');
    click(stone(host, 1));
    expect(stoneNames(host)[0]).toBe('C♯4');
    click(accidental(host, 'flat'));
    expect(text(shelf(host, 2))).toBe('D♭4');
    click(accidental(host, 'none'));
    expect(text(shelf(host, 2))).toBe('D4');
  });

  it('고른 자리 비우기와 실행 취소·다시 실행', () => {
    const r = rig();
    const { host } = open(r);
    expect(button(host, '고른 자리 비우기').disabled).toBe(true);
    click(stone(host, 1));
    click(stone(host, 2));
    expect(stoneNames(host).slice(0, 3)).toEqual(['C4', 'C4', '']);
    click(button(host, '고른 자리 비우기'));
    expect(stoneNames(host)[1]).toBe('');
    click(button(host, '실행 취소'));
    expect(stoneNames(host)[1]).toBe('C4');
    click(button(host, '다시 실행'));
    expect(stoneNames(host)[1]).toBe('');
    expect(button(host, '다시 실행').disabled).toBe(true);
  });

  it('자리 단추와 재료 단추는 이름과 누름 상태를 말한다(7.9)', () => {
    const r = rig();
    const { host } = open(r);
    expect(stone(host, 5).getAttribute('aria-label')).toBe('5번째 자리, 비어 있음');
    expect(shelf(host, 1).getAttribute('aria-pressed')).toBe('true'); // 처음 손에 든 음은 으뜸음
    expect(shelf(host, 2).getAttribute('aria-pressed')).toBe('false');
    expect(q(host, '[role="group"][aria-label="소리 높이"]')).not.toBeNull();
    expect(q(host, '[role="group"][aria-label="변화표"]')).not.toBeNull();
  });
});

describe('키보드(4.2의 키 표, 패널에서도 같다)', () => {
  it('← → 로 자리를 옮기면 초점도 따라가고, ↑ ↓ 로 손에 든 음을 바꾸고, Enter로 놓는다', () => {
    const r = rig();
    const { host, bench } = open(r);
    const first = stone(host, 1);
    first.focus();
    press(first, 'ArrowRight');
    expect(bench.cursor).toBe(1);
    expect(document.activeElement).toBe(stone(host, 1));
    press(stone(host, 1), 'ArrowRight');
    expect(bench.cursor).toBe(2);
    expect(document.activeElement).toBe(stone(host, 2));
    press(stone(host, 2), 'ArrowUp');
    expect(text(q(host, '.tray-mode'))).toContain('손에 든 음: D4');
    // 단추에 초점이 있을 때 Enter는 그 단추의 누르기다(여기서는 jsdom이 누르기를 만들지 않으므로 아무 일도 없다)
    const prevented = press(stone(host, 2), 'Enter');
    expect(prevented).toBe(false);
    expect(stoneNames(host)[1]).toBe('');
    // 단추가 아닌 곳(작은 칸의 바탕)에서 Enter는 놓기다
    const body = q(host, '.panel-body')!;
    expect(press(body, 'Enter')).toBe(true);
    expect(stoneNames(host)[1]).toBe('D4');
  });

  it('C장조를 키보드만으로 놓고 C로 확인하면 통과한다(완료 기준 4-2)', () => {
    const r = rig();
    const { host } = open(r);
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < 8; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
    expect(stoneNames(host)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
    expect(press(body, 'KeyC')).toBe(true);
    const feedback = q(host, '.feedback')!;
    expect(feedback.getAttribute('data-feedback')).toBe('passed');
    expect(text(feedback)).toBe('통과했어요. 8자리의 음이 C장조의 장음계와 같아요.');
    expect(r.controller.attempts.at(-1)).toMatchObject({ questId: Q07, variantId: 'c-major', resultType: 'passed' });
  });

  it('Backspace로 빼고 Z로 되돌리고 Y로 다시 한다. Shift+↑ ↓ 는 변화표다', () => {
    const r = rig();
    const { host } = open(r);
    const body = q(host, '.panel-body')!;
    press(body, 'ArrowRight');
    press(body, 'Enter');
    expect(stoneNames(host)[0]).toBe('C4');
    press(body, 'Backspace');
    expect(stoneNames(host)[0]).toBe('');
    press(body, 'KeyZ');
    expect(stoneNames(host)[0]).toBe('C4');
    press(body, 'KeyY');
    expect(stoneNames(host)[0]).toBe('');
    press(body, 'ArrowUp', { shiftKey: true });
    expect(text(q(host, '.tray-mode'))).toContain('손에 든 음: C♯4');
    press(body, 'Enter');
    expect(stoneNames(host)[0]).toBe('C♯4');
  });

  it('Ctrl+Z, Ctrl+Y도 된다. 브라우저 단축키(Ctrl+S, Ctrl+P)는 건드리지 않는다', () => {
    const r = rig();
    const { host } = open(r);
    const body = q(host, '.panel-body')!;
    press(body, 'Enter');
    expect(stoneNames(host)[0]).toBe('C4');
    expect(press(body, 'KeyZ', { ctrlKey: true })).toBe(true);
    expect(stoneNames(host)[0]).toBe('');
    expect(press(body, 'KeyY', { ctrlKey: true })).toBe(true);
    expect(stoneNames(host)[0]).toBe('C4');
    expect(press(body, 'KeyS', { ctrlKey: true })).toBe(false);
    expect(press(body, 'KeyP', { ctrlKey: true })).toBe(false);
  });

  it('Esc는 패널이 가로채지 않는다(앱 전체의 닫기가 한다)', () => {
    const r = rig();
    const { host } = open(r);
    expect(press(q(host, '.panel-body')!, 'Escape')).toBe(false);
  });

  it('H는 키 도움을 열고 닫는다. 도움에는 설계서 4.2의 키 표가 그대로 있다', () => {
    const r = rig();
    const { host } = open(r);
    expect(q(host, '#bench-help')).toBeNull();
    press(q(host, '.panel-body')!, 'KeyH');
    const help = q(host, '#bench-help')!;
    expect(qa(help, 'li').map((li) => text(li))).toEqual([
      '← → 자리 옮기기',
      '↑ ↓ 높이나 재료 바꾸기',
      'Shift+↑ ↓ 변화표 바꾸기(♭ 없음 ♯)',
      'Enter, Space 놓기',
      'Backspace 빼기',
      'Z, Y 실행 취소, 다시 실행',
      'P 내 배치 듣기',
      'T 목표 듣기',
      'S 정지',
      'C 배치 확인',
      'V 패널로 보기',
      'H 도움',
      'Esc 나가기',
    ]);
    expect(button(host, '키 도움').getAttribute('aria-expanded')).toBe('true');
    click(button(host, '키 도움'));
    expect(q(host, '#bench-help')).toBeNull();
  });

  it('V는 이미 패널이라고 알린다', () => {
    const r = rig();
    const { host } = open(r);
    press(q(host, '.panel-body')!, 'KeyV');
    expect(text(q(host, '.sr-only[role="status"]'))).toContain('지금 패널로 보고 있어요');
  });

  it('글자를 입력하는 칸에서는 가로채지 않는다', () => {
    const r = rig();
    const { host } = open(r);
    const input = document.createElement('input');
    q(host, '.panel-body')!.appendChild(input);
    expect(press(input, 'KeyZ')).toBe(false);
    expect(press(input, 'Enter')).toBe(false);
    expect(stoneNames(host)[0]).toBe('');
  });
});

describe('월드와 패널은 같은 초안이다(4.2 패널로 보기, 완료 기준 4-3)', () => {
  it('월드(작업대)에서 놓은 것이 패널에 그대로 있다', () => {
    const r = rig();
    const { host } = open(r, 'c-major', (bench) => {
      bench.perform('cursor-right');
      bench.perform('place');
      bench.perform('cursor-right');
      bench.perform('hand-up');
      bench.perform('place');
    });
    expect(stoneNames(host).slice(0, 3)).toEqual(['C4', 'D4', '']);
    expect(stone(host, 2).getAttribute('aria-current')).toBe('true'); // 월드에서 고른 자리도 이어진다
    expect(text(q(host, '.tray-mode'))).toContain('손에 든 음: D4');
  });

  it('패널에서 고친 것이 작업대에 있고 세션에 저장된다(월드로 돌아오면 그대로다)', () => {
    const r = rig();
    const { host, bench } = open(r);
    click(shelf(host, 4)); // F4
    click(stone(host, 6));
    expect(bench.views()[5]).toMatchObject({ slot: 6, name: 'F4', midi: 65 });
    expect(r.session.contentOf(Q07, 'c-major').slots).toEqual([{ slot: 6, writtenPitch: { letter: 'F', accidental: null, octave: 4 } }]);
    expect(r.session.serialize().challengeDrafts['scale.major/c-major']!.selectedSlot).toBe(6);
  });

  it('패널을 닫고(그리기 끝) 다시 열어도 초안이 그대로다', () => {
    const r = rig();
    const { host } = open(r);
    click(stone(host, 1));
    current?.unmount();
    current = null;
    const m = mount(h(ScalePanel, { controller: r.controller, bench: benchNow! }));
    current = m;
    expect(stoneNames(m.host)[0]).toBe('C4');
  });
});

describe('확인과 설명: 맞고 틀림을 색만으로 전하지 않는다(7.9 4번)', () => {
  const typeScale = (host: HTMLElement): void => {
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < 8; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
  };

  it('확인하기 전에는 맞고 틀림을 알려 주지 않는다', () => {
    const r = rig();
    const { host } = open(r);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(text(q(host, '.feedback'))).toContain('8자리를 모두 놓고');
    click(stone(host, 1));
    typeScale(host);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(text(q(host, '.feedback'))).toContain('다 놓았어요');
    expect(qa(host, '.cell-mark')).toHaveLength(0);
  });

  it('F장조 네 번째 자리에 A♯: 같은 높이라고 설명하고, 그 자리에만 기호와 글자로 표시한다', () => {
    const r = rig();
    const { host, bench } = open(r, 'f-major');
    typeScale(host);
    expect(stoneNames(host)).toEqual(['F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5', 'F5']);
    // 네 번째 자리를 A♯으로 바꾼다
    click(stone(host, 4));
    click(shelf(host, 3)); // A4
    click(accidental(host, 'sharp'));
    click(button(host, '4번째 자리에 놓기'));
    expect(stoneNames(host)[3]).toBe('A♯4');
    click(button(host, '배치 확인'));
    const feedback = q(host, '.feedback')!;
    expect(feedback.getAttribute('data-feedback')).toBe('needsRevision');
    expect(text(feedback)).toBe('네 번째 자리는 B 이름을 써요. F장조에서는 B♭4예요. 소리 높이는 같아요.');
    expect(qa(feedback, '.icon')).toHaveLength(1); // 문장 앞의 경고 기호
    expect(bench.flagged()).toEqual([4]);
    // 그 자리에만: 색 테두리(has-error) + 경고 기호 + 이름에 '고칠 곳이 있어요'
    expect(stone(host, 4).classList.contains('has-error')).toBe(true);
    expect(stone(host, 4).querySelector('.cell-mark .icon')).not.toBeNull();
    expect(stone(host, 4).getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    for (const n of [1, 2, 3, 5, 6, 7, 8]) {
      expect(stone(host, n).classList.contains('has-error'), `${n}번`).toBe(false);
      expect(stone(host, n).getAttribute('aria-label')).not.toContain('고칠 곳');
    }
    // 고치면 표식이 사라지고 다시 확인하면 통과한다
    click(accidental(host, 'none'));
    click(shelf(host, 4)); // B4 → 조표로 B♭4
    click(button(host, '4번째 자리에 놓기'));
    expect(qa(host, '.cell-mark')).toHaveLength(0);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
  });

  it('두 자리를 바꿔 놓으면 두 자리 모두에 표시가 선다', () => {
    const r = rig();
    const { host } = open(r);
    typeScale(host);
    click(shelf(host, 4)); // F4
    click(stone(host, 3));
    click(button(host, '3번째 자리에 놓기'));
    click(shelf(host, 3)); // E4
    click(stone(host, 4));
    click(button(host, '4번째 자리에 놓기'));
    click(button(host, '배치 확인'));
    expect(qa(host, 'button.cell-mine.has-error').map((b) => b.getAttribute('data-slot'))).toEqual(['3', '4']);
    expect(text(q(host, '.feedback'))).toContain('순서가 바뀌었어요');
  });

  it('비어 있는 자리가 있으면 몇 번째 자리인지 말한다', () => {
    const r = rig();
    const { host } = open(r);
    click(stone(host, 1));
    click(button(host, '배치 확인'));
    const lines = qa(q(host, '.feedback')!, '.feedback-line').map((e) => text(e));
    expect(lines).toContain('2번째 자리가 비어 있어요.');
    expect(qa(host, 'button.cell-mine.has-error')).toHaveLength(7);
  });

  it('놓은 것을 바꾸면 이전 판정과 표시는 사라진다', () => {
    const r = rig();
    const { host } = open(r);
    click(stone(host, 1));
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    click(stone(host, 2));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(qa(host, '.cell-mark')).toHaveLength(0);
  });

  it('오선에 내 악보가 그려지고, 틀린 자리의 음표가 표시된다', () => {
    const r = rig();
    const { host } = open(r, 'f-major');
    typeScale(host);
    const notes = qa(host, '.staff-host .vf-stavenote');
    expect(notes.length).toBe(8);
    click(stone(host, 4));
    click(shelf(host, 3));
    click(accidental(host, 'sharp'));
    click(button(host, '4번째 자리에 놓기'));
    click(button(host, '배치 확인'));
    expect(qa(host, '.staff-host .vf-stavenote.is-error')).toHaveLength(1);
    const svg = q(host, '.staff-host svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelector('desc')?.textContent ?? '').toContain('4번째 자리 A♯4');
  });
});

describe('듣기(P, T, S)', () => {
  // 재생 위치 표시는 화면 프레임(requestAnimationFrame)마다 읽는다. 시험에서는 프레임을 우리가 직접 한 번씩 보낸다(음자리 패널 시험과 같다).
  let frames: FrameRequestCallback[] = [];
  const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  beforeEach(() => {
    frames = [];
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => frames.push(cb);
    globalThis.cancelAnimationFrame = (id: number): void => {
      frames[id - 1] = () => {};
    };
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.caf;
  });
  const nextFrame = (): void => {
    const due = frames;
    frames = [];
    act(() => {
      for (const cb of due) cb(0);
    });
  };
  /** 시계를 seconds만큼 보내고 화면 프레임 한 번을 보낸다 */
  const advance = (r: Rig, seconds: number): void => {
    r.run(seconds);
    nextFrame();
  };
  const sounding = (host: HTMLElement): string[] => qa(host, 'button.cell.is-playing').map((b) => b.getAttribute('data-slot') ?? '');

  it('소리를 켜기 전에는 소리가 나지 않지만 재생 위치는 움직인다(W-8, W-11)', () => {
    const r = rig();
    const { host } = open(r);
    click(stone(host, 1));
    click(stone(host, 2));
    click(button(host, '내 배치 듣기'));
    expect(r.controller.playing).toBe('mine');
    expect(r.engine.startCalls).toBe(0);
    expect(text(q(host, '.hint'))).toContain('소리');
    advance(r, 0.2);
    expect(sounding(host)).toEqual(['1']);
    expect(text(stone(host, 1))).toContain('지금');
    expect(stone(host, 1).getAttribute('aria-label')).toContain('지금 울리는 자리');
    advance(r, 0.8); // 4분음표 80 → 한 자리 0.75초
    expect(sounding(host)).toEqual(['2']);
    click(button(host, '정지'));
    nextFrame();
    expect(r.controller.playing).toBeNull();
    expect(sounding(host)).toEqual([]);
    expect(r.engine.startCalls).toBe(0);
  });

  it('끝까지 들으면 표시가 사라진다', () => {
    const r = rig();
    const { host } = open(r);
    click(stone(host, 1));
    click(button(host, '내 배치 듣기'));
    advance(r, 5.9);
    expect(sounding(host)).toEqual(['8']);
    advance(r, 0.3);
    expect(r.controller.playing).toBeNull();
    nextFrame();
    expect(sounding(host)).toEqual([]);
  });

  it('놓은 음이 없으면 내 배치 듣기는 알려 주기만 한다. 목표 듣기는 비어 있어도 된다', () => {
    const r = rig();
    const { host } = open(r);
    click(button(host, '내 배치 듣기'));
    expect(r.controller.playing).toBeNull();
    expect(text(q(host, '.hint-notice'))).toContain('아직 놓은 음이 없어요');
    click(button(host, '목표 듣기'));
    expect(r.controller.playing).toBe('target');
    // 목표를 듣는 동안에도 지금 어느 자리인지 보인다
    advance(r, 0.1);
    expect(sounding(host)).toEqual(['1']);
    advance(r, 0.9); // 시작 직후의 짧은 준비 시간이 있어 1초쯤 지나야 둘째 자리다
    expect(sounding(host)).toEqual(['2']);
  });

  it('느리게 듣기는 도움으로 기록된다(원래 템포는 그대로 보인다)', () => {
    const r = rig();
    const { host } = open(r);
    expect(text(q(host, '.tempo-original'))).toContain('원래 도전: 4분음표 = 80 BPM');
    click(q(host, '#aid-slow')!);
    expect(r.controller.usedAssist()).toBe(true);
    expect(text(q(host, '.tempo-original'))).toContain('원래 도전: 4분음표 = 80 BPM');
    expect(text(q(host, '.tempo-now'))).not.toContain('= 80 BPM');
  });

  it('P, T, S 키로도 듣고 멈춘다', () => {
    const r = rig();
    const { host } = open(r);
    const body = q(host, '.panel-body')!;
    press(body, 'KeyT');
    expect(r.controller.playing).toBe('target');
    press(body, 'KeyS');
    expect(r.controller.playing).toBeNull();
    press(body, 'Enter');
    press(body, 'KeyP');
    expect(r.controller.playing).toBe('mine');
  });
});

describe('화면 낭독기 알림', () => {
  it('놓기·빼기·옮기기마다 같은 알림 영역에 한 문장이 남는다', () => {
    const r = rig();
    const { host } = open(r);
    const live = (): string => text(q(host, '.sr-only[role="status"]'));
    click(stone(host, 2));
    expect(live()).toBe('2번째 자리에 C4를 놓았어요.');
    click(shelf(host, 2));
    expect(live()).toBe('손에 든 음은 D4예요.');
    click(button(host, '고른 자리 비우기'));
    expect(live()).toBe('2번째 자리의 음을 뺐어요.');
  });
});
