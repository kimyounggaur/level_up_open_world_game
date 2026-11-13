// @vitest-environment jsdom
// 2-5 리듬 패널(Q02): 시안 B02의 구성, 시안의 상태(둘째 박에 D4)에서 같은 피드백 문장, 끌지 않고 끝내기, 도움.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RhythmPanel } from '@/ui/panels/rhythm/RhythmPanel';
import { Q02, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

function open(r: Rig) {
  act(() => {
    r.controller.open(Q02, 'quarter-rest');
  });
  const m = mount(h(RhythmPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

const mine = (host: HTMLElement) => qa<HTMLButtonElement>(host, 'button.cell-mine');
/** 재료 상자의 재료(칸의 단추와 헷갈리지 않게 .material 안에서만 찾는다) */
const material = (host: HTMLElement, label: string): HTMLButtonElement => {
  const found = qa<HTMLButtonElement>(host, 'button.material').find((b) => text(b).includes(label));
  if (!found) throw new Error(`재료 '${label}'를 찾지 못했어요`);
  return found;
};
/** 재료를 고르고(이미 골랐으면 그대로 두고) 칸을 누른다 */
const place = (host: HTMLElement, materialLabel: string, cellIndex: number): void => {
  const m = material(host, materialLabel);
  if (m.getAttribute('aria-pressed') !== 'true') click(m);
  click(mine(host)[cellIndex]!);
};

describe('시안 B02의 구성', () => {
  it('목표 줄, 내 배치 줄, 재료, 악보로 보기, 필요한 도움만이 모두 있다', () => {
    const r = rig();
    const host = open(r);
    expect(text(q(host, 'h1'))).toBe('쉼이 있는 한 마디');
    expect(qa(host, '.cell-target')).toHaveLength(4);
    expect(mine(host)).toHaveLength(4);
    expect(text(q(host, '#tray-title'))).toBe('배치할 재료');
    expect(text(q(host, '#score-title'))).toBe('악보로 보기');
    expect(text(q(host, '#assist-title'))).toBe('필요한 도움만');
    // 재료: C4 D4 E4 4분음표, 4분쉼표, 비우기
    const materials = qa(host, '.material').map((m) => text(m));
    expect(materials.some((m) => m.includes('C4'))).toBe(true);
    expect(materials.some((m) => m.includes('D4'))).toBe(true);
    expect(materials.some((m) => m.includes('E4'))).toBe(true);
    expect(materials.some((m) => m.includes('쉼'))).toBe(true);
    // 목표 악보와 내 악보 두 장
    expect(qa(host, 'svg.notation-svg')).toHaveLength(2);
  });

  it('확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const r = rig();
    const host = open(r);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    place(host, 'C4', 0);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(qa(host, '.cell-mark')).toHaveLength(0);
  });
});

describe('2-5 완료 기준: 시안의 상태(둘째 박에 D4)', () => {
  it('두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.', () => {
    const r = rig();
    const host = open(r);
    place(host, 'C4', 0);
    place(host, 'D4', 1);
    place(host, 'D4', 2);
    place(host, 'E4', 3);
    click(button(host, '배치 확인'));
    const lines = qa(host, '.feedback-line').map((l) => text(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.');
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    // 틀린 칸은 색과 함께 기호와 이름으로도 알려 준다
    const bad = mine(host)[1]!;
    expect(bad.classList.contains('has-error')).toBe(true);
    expect(bad.getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    expect(bad.querySelector('.cell-mark')).not.toBeNull();
    expect(mine(host)[0]!.classList.contains('has-error')).toBe(false);
    // 틀린 음은 악보 위에도 표시된다
    expect(qa(host, '.vf-stavenote.is-error').length).toBeGreaterThan(0);
  });

  it('둘째 박에 쉼을 놓으면 통과한다', () => {
    const r = rig();
    const host = open(r);
    place(host, 'C4', 0);
    place(host, '쉼', 1);
    place(host, 'D4', 2);
    place(host, 'E4', 3);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요');
    expect(r.controller.attempts).toHaveLength(1);
    expect(r.controller.attempts[0]!.resultType).toBe('passed');
  });

  it('고친 뒤에는 이전 판정을 지운다(내용과 맞지 않는 문장을 남기지 않는다)', () => {
    const r = rig();
    const host = open(r);
    place(host, 'C4', 0);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    place(host, 'D4', 1);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
  });
});

describe('끌지 않고 키보드와 눌러서만 끝낸다(7.9 1·2번)', () => {
  it('재료를 고르고 칸을 누르는 것만으로 놓고, 비우기와 실행 취소·다시 실행이 된다', () => {
    const r = rig();
    const host = open(r);
    place(host, 'C4', 0);
    expect(text(mine(host)[0]!)).toContain('C4');
    click(material(host, '비우기'));
    click(mine(host)[0]!);
    expect(text(mine(host)[0]!)).toContain('비어 있음');
    click(button(host, '실행 취소'));
    expect(text(mine(host)[0]!)).toContain('C4');
    click(button(host, '다시 실행'));
    expect(text(mine(host)[0]!)).toContain('비어 있음');
    click(button(host, '실행 취소'));
    click(button(host, '모두 지우기'));
    expect(mine(host).every((c) => text(c).includes('비어 있음'))).toBe(true);
    click(button(host, '실행 취소'));
    expect(text(mine(host)[0]!)).toContain('C4');
  });

  it('칸 사이를 ← →로 옮기고, Delete로 비우고, Ctrl+Z로 되돌린다', () => {
    const r = rig();
    const host = open(r);
    place(host, 'C4', 0);
    place(host, 'D4', 1);
    const cells = mine(host);
    cells[0]!.focus();
    keydown(cells[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(cells[1]);
    keydown(cells[1]!, 'ArrowLeft');
    expect(document.activeElement).toBe(cells[0]);
    expect(keydown(cells[1]!, 'Delete')).toBe(true);
    expect(text(mine(host)[1]!)).toContain('비어 있음');
    keydown(host.querySelector('.panel-body')!, 'z', { ctrlKey: true });
    expect(text(mine(host)[1]!)).toContain('D4');
  });

  it('모든 단추와 칸에 이름이 있다(7.9 8번)', () => {
    const r = rig();
    const host = open(r);
    for (const b of qa(host, 'button')) {
      const name = b.getAttribute('aria-label') ?? text(b);
      expect(name.length, `이름 없는 단추: ${b.outerHTML.slice(0, 80)}`).toBeGreaterThan(0);
    }
    expect(mine(host).map((c) => c.getAttribute('aria-label'))[0]).toBe('1박, 비어 있음');
    // 스위치는 역할과 이름이 있다
    const sw = qa(host, '[role="switch"]');
    expect(sw).toHaveLength(3);
    for (const s of sw) expect(s.getAttribute('aria-labelledby')).toBeTruthy();
  });
});

describe('2-7 필요한 도움만', () => {
  it('느리게 듣기를 켜도 원래 도전의 템포 표시는 그대로다', () => {
    const r = rig();
    const host = open(r);
    expect(text(q(host, '.tempo-now'))).toBe('현재: 4분음표 = 80 BPM');
    click(q(host, '#aid-slow')!);
    expect(q(host, '#aid-slow')!.getAttribute('aria-checked')).toBe('true');
    expect(text(q(host, '.tempo-now'))).not.toBe('현재: 4분음표 = 80 BPM');
    expect(text(q(host, '.tempo-original'))).toBe('원래 도전: 4분음표 = 80 BPM');
    expect(r.controller.tempo().original).toBe(80);
    click(q(host, '#aid-slow')!);
    expect(text(q(host, '.tempo-now'))).toBe('현재: 4분음표 = 80 BPM');
  });

  it('박 수 표시는 각 칸에 번호를 붙인다. 박 반복은 칸을 고른 뒤에만 켜진다', () => {
    const r = rig();
    const host = open(r);
    expect(qa(host, '.cell-count')).toHaveLength(0);
    click(q(host, '#aid-count')!);
    expect(qa(host, '.cell-count')).toHaveLength(8);
    const repeat = q<HTMLButtonElement>(host, '#aid-repeat')!;
    expect(repeat.disabled).toBe(true);
    click(mine(host)[1]!);
    expect(q<HTMLButtonElement>(host, '#aid-repeat')!.disabled).toBe(false);
    expect(text(q(host, '#aid-repeat-label'))).toBe('두 번째 박 반복');
  });

  it('소리를 켜기 전에는 소리 없이 재생하고, 소리가 꺼져 있다고 알려 준다', () => {
    const r = rig();
    const host = open(r);
    place(host, 'C4', 0);
    click(button(host, '내 배치 듣기'));
    expect(r.controller.playing).toBe('mine');
    expect(r.engine.startCalls).toBe(0);
    expect(text(q(host, '#sound-off-hint'))).toContain('소리가 꺼져 있어요');
    // 재생 막대는 소리와 무관하게 움직인다
    r.run(0.1);
    expect(host.querySelector('.cell-mine.is-playing')).not.toBeNull();
    click(button(host, '정지'));
    expect(r.controller.playing).toBeNull();
  });

  it('놓은 음이 없으면 알려 주고 재생하지 않는다', () => {
    const r = rig();
    const host = open(r);
    click(button(host, '내 배치 듣기'));
    expect(r.controller.playing).toBeNull();
    expect(text(q(host, '.hint-notice'))).toContain('아직 놓은 음이 없어요');
  });
});

describe('재료 고르기의 상태 말', () => {
  it('고른 재료와 고르지 않은 상태를 글로 말한다. 같은 재료를 다시 누르면 고르기를 푼다', () => {
    const r = rig();
    const host = open(r);
    const mode = (): string => text(q(host, '.tray-mode'));
    expect(mode()).toBe('고른 재료가 없어요. 박 칸을 누르면 그 칸만 골라요.');
    click(material(host, 'D4'));
    expect(mode()).toBe('고른 재료: D4 4분음표. 박 칸을 누르면 놓여요.');
    expect(material(host, 'D4').getAttribute('aria-pressed')).toBe('true');
    click(material(host, 'D4'));
    expect(mode()).toBe('고른 재료가 없어요. 박 칸을 누르면 그 칸만 골라요.');
    click(material(host, '쉼'));
    expect(mode()).toBe('고른 재료: 4분쉼표. 박 칸을 누르면 놓여요.');
    click(material(host, '비우기'));
    expect(mode()).toBe('비우기를 골랐어요. 박 칸을 누르면 그 칸을 비워요.');
  });

  it('재료 없이 칸만 누르면 그 칸이 골라지고 아무것도 놓이지 않는다', () => {
    const r = rig();
    const host = open(r);
    click(mine(host)[2]!);
    expect(mine(host)[2]!.classList.contains('is-selected')).toBe(true);
    expect(r.controller.content().events).toHaveLength(0);
    expect(mine(host)[2]!.getAttribute('aria-label')).toBe('3박, 비어 있음, 고른 칸');
  });
});
