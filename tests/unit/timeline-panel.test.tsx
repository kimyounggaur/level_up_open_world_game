// @vitest-environment jsdom
// 5-1 Q03 시간선 패널: 박마다 확대하는 시간선, 32분음표, 셋잇단 묶음(뗏목).
// 완료 기준: Q03 인수 테스트 통과, 표시만 셋잇단인 480틱 음 세 개는 실패한다. 끌지 않고 눌러서만 끝낸다(7.9 1·2번).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ScoreEvent } from '@/domain/score';
import { RhythmPanel } from '@/ui/panels/rhythm/RhythmPanel';
import { Q03, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

const VARIANT = 'thirty-seconds-triplet';

function open(r: Rig): HTMLElement {
  act(() => {
    r.controller.open(Q03, VARIANT);
  });
  const m = mount(h(RhythmPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

/** 확대 창의 '내 배치' 줄 조각 단추들 */
const zoom = (host: HTMLElement): HTMLButtonElement[] => qa<HTMLButtonElement>(host, '.trow-zoom.trow-mine button.tblock-face');
/** 확대 창의 '목표' 줄 조각들 */
const target = (host: HTMLElement): HTMLElement[] => qa(host, '.trow-zoom.trow-target .tblock');
const kindButton = (host: HTMLElement, kind: string): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-kind="${kind}"]`)!;
const valueButton = (host: HTMLElement, value: string): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-value="${value}"]`)!;
const pitchButton = (host: HTMLElement, pitch: string): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-pitch="${pitch}"]`)!;
const beatButton = (host: HTMLElement, beat: number): HTMLButtonElement => q<HTMLButtonElement>(host, `.beat-button[data-beat="${beat - 1}"]`)!;
const goBeat = (host: HTMLElement, beat: number): void => click(beatButton(host, beat));
const mode = (host: HTMLElement): string => text(q(host, '.tray-mode'));
/** 조각이 차지한 열 구간. 예: '1/13'(jsdom이 공백과 세미콜론을 붙여 적으므로 지운다) */
const columns = (el: Element): string => (el.closest('.tblock')!.getAttribute('style') ?? '').replace(/[\s;]/g, '').replace('grid-column:', '');
const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 재료를 고른다: 종류(이미 골랐으면 그대로), 길이, 음높이 */
function pick(host: HTMLElement, kind: string, opts: { value?: string; pitch?: string } = {}): void {
  if (kindButton(host, kind).getAttribute('aria-pressed') !== 'true') click(kindButton(host, kind));
  if (opts.value) click(valueButton(host, opts.value));
  if (opts.pitch) click(pitchButton(host, opts.pitch));
}

/** 목표와 같은 배치를 눌러서 만든다: 1박 C4 32분 8개, 2박 D4 E4 F4 셋잇단, 3박부터 2분쉼표 */
function solve(host: HTMLElement): void {
  pick(host, 'note', { value: 'thirtySecond', pitch: 'C4' });
  for (let i = 0; i < 8; i++) click(zoom(host)[i]!);
  goBeat(host, 2);
  pick(host, 'raft', { pitch: 'D4' });
  click(zoom(host)[0]!);
  pick(host, 'note', { pitch: 'E4' });
  click(zoom(host)[1]!);
  pick(host, 'note', { pitch: 'F4' });
  click(zoom(host)[2]!);
  goBeat(host, 3);
  pick(host, 'rest', { value: 'half' });
  click(zoom(host)[0]!);
}

const note = (id: string, tick: number, ticks: number, letter: 'C' | 'D' | 'E' | 'F', groupId?: string): ScoreEvent => ({
  eventId: id,
  type: 'note',
  voiceId: 'v1',
  staffId: 's1',
  measureIndex: 0,
  onsetTicks: tick,
  durationTicks: ticks,
  writtenPitch: { letter, accidental: null, octave: 4 },
  ...(groupId ? { groupId } : {}),
});

describe('구성', () => {
  it('제목, 안내 문장, 칩, 박 고르기 네 개, 목표와 내 배치 줄, 재료 세 단계, 악보, 도움이 있다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    expect(text(q(host, 'h1'))).toBe('짧은 음과 셋잇단음');
    expect(text(q(host, '.subtitle'))).toBe('박을 하나씩 확대해서, 목표 악보와 같게 짧은 음과 셋잇단 묶음, 쉼을 놓아 보세요.');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['4/4박자', '한 박 = 4분음표', '가장 짧은 음 = 32분음표']);
    expect(qa(host, '.beat-button').map((b) => b.getAttribute('aria-label'))).toEqual(['1박 확대', '2박 확대', '3박 확대', '4박 확대']);
    expect(text(q(host, '#timeline-title'))).toBe('한 마디 시간선');
    expect(text(q(host, '#tray-title'))).toBe('배치할 재료');
    expect(text(q(host, '#score-title'))).toBe('악보로 보기');
    expect(text(q(host, '#assist-title'))).toBe('필요한 도움만');
    expect(qa(host, 'svg.notation-svg')).toHaveLength(2);
    // 재료: 종류 넷(음, 쉼, 셋잇단 묶음, 비우기), 길이 여섯, 음높이 넷
    expect(qa(host, 'button.material[data-kind]').map((b) => b.getAttribute('data-kind'))).toEqual(['note', 'rest', 'raft', 'erase']);
    // 11.2의 5: '한 박'만 쓰지 않고 박의 단위를 함께 적는다
    expect(text(q(host, 'button.material[data-kind="raft"] .material-sub'))).toBe('한 박(4분음표)을 셋으로');
    expect(qa(host, 'button.material[data-value]').map((b) => b.getAttribute('data-value'))).toEqual(['thirtySecond', 'sixteenth', 'eighth', 'quarter', 'half', 'whole']);
    expect(qa(host, 'button.material[data-pitch]').map((b) => b.getAttribute('data-pitch'))).toEqual(['C4', 'D4', 'E4', 'F4']);
  });

  it('처음에는 1박이 확대되어 있고 32분음표 칸 여덟 개가 비어 있다. 목표 줄은 단추가 아니다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    expect(text(q(host, '#zoom-title'))).toBe('1박 확대');
    expect(beatButton(host, 1).getAttribute('aria-pressed')).toBe('true');
    expect(zoom(host)).toHaveLength(8);
    expect(zoom(host)[0]!.getAttribute('aria-label')).toBe('1박, 비어 있음');
    expect(zoom(host)[1]!.getAttribute('aria-label')).toBe('1박 2번째 칸, 비어 있음');
    expect(zoom(host)[7]!.getAttribute('aria-label')).toBe('1박 8번째 칸, 비어 있음');
    expect(target(host)).toHaveLength(8);
    expect(qa(host, '.trow-zoom.trow-target button')).toHaveLength(0);
    expect(text(q(host, '.trow-zoom.trow-target .tblock .sr-only'))).toBe('목표: 1박, C4 32분음표');
    // 칸 하나와 셋잇단 돌 하나의 길이를 알려 준다
    expect(text(q(host, '.zoom-head .muted'))).toBe('칸 하나 = 32분음표(120틱) · 셋잇단 돌 하나 = 320틱');
  });

  it('확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    pick(host, 'note', { value: 'thirtySecond', pitch: 'C4' });
    click(zoom(host)[0]!);
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(qa(host, '.tblock-mark')).toHaveLength(0);
    expect(qa(host, '.beat-mark')).toHaveLength(0);
  });
});

describe('5-1 완료 기준: Q03를 눌러서만 끝낸다', () => {
  it('32분음표 여덟 개, 셋잇단 묶음의 돌 셋, 2분쉼표를 놓고 확인하면 통과한다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    solve(host);
    const events = r.controller.content().events;
    expect(events).toHaveLength(12);
    expect(events.filter((e) => e.groupId).map((e) => [e.onsetTicks, e.durationTicks])).toEqual([
      [960, 320],
      [1280, 320],
      [1600, 320],
    ]);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요');
    expect(r.controller.attempts).toHaveLength(1);
    expect(r.controller.attempts[0]!.resultType).toBe('passed');
    expect(qa(host, '.tblock.has-error')).toHaveLength(0);
  });

  it('셋잇단 묶음은 박 창 안에 돌 셋으로 보이고, 돌 하나는 셋잇단 8분음표로 읽힌다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 2);
    pick(host, 'raft', { pitch: 'D4' });
    click(zoom(host)[0]!);
    const stones = zoom(host);
    expect(stones).toHaveLength(3);
    expect(stones.map((s) => s.getAttribute('aria-label'))).toEqual([
      '2박, D4 8분 셋잇단음표',
      '2박 둘째 돌, D4 8분 셋잇단음표',
      '2박 셋째 돌, D4 8분 셋잇단음표',
    ]);
    // 묶음 위에 '3' 표시가 한 번 붙는다
    expect(qa(host, '.trow-zoom.trow-mine .raft-mark').map((m) => text(m))).toEqual(['3']);
    expect(text(q(host, '[role="status"].sr-only'))).toContain('돌 3개는 지금 모두 D4예요');
  });

  it('돌을 하나씩 누르면 그 돌의 음만 바뀌고 길이와 묶음은 그대로다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 2);
    pick(host, 'raft', { pitch: 'D4' });
    click(zoom(host)[0]!);
    pick(host, 'note', { pitch: 'E4' });
    click(zoom(host)[1]!);
    expect(zoom(host).map((s) => text(s))).toEqual(['D4', 'E4', 'D4']);
    expect(r.controller.content().events.map((e) => e.durationTicks)).toEqual([320, 320, 320]);
    expect(r.controller.content().tuplets).toHaveLength(1);
    // 쉼으로도 바꿀 수 있다
    pick(host, 'rest');
    click(zoom(host)[2]!);
    expect(zoom(host).map((s) => text(s))).toEqual(['D4', 'E4', '쉼']);
    expect(zoom(host)[2]!.closest('.tblock')!.classList.contains('kind-rest')).toBe(true);
  });

  it('보통 8분음표와 셋잇단 8분음표는 너비가 달라 눈으로 구분된다(480틱 대 320틱)', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 2);
    pick(host, 'note', { value: 'eighth', pitch: 'D4' });
    click(zoom(host)[0]!);
    // 한 박(960틱)은 24단위. 8분음표 480틱은 12단위
    expect(columns(zoom(host)[0]!)).toBe('1/13');
    // 같은 자리에 셋잇단 묶음을 놓으려면 먼저 비워야 한다
    click(button(host, '실행 취소'));
    pick(host, 'raft', { pitch: 'D4' });
    click(zoom(host)[0]!);
    expect(zoom(host).map((s) => columns(s))).toEqual(['1/9', '9/17', '17/25']);
  });

  it('비우기로 셋잇단 돌 하나를 누르면 묶음 전체가 지워진다. 실행 취소는 한 번에 되돌린다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 2);
    pick(host, 'raft', { pitch: 'D4' });
    click(zoom(host)[0]!);
    expect(r.controller.content().events).toHaveLength(3);
    pick(host, 'erase');
    click(zoom(host)[1]!);
    expect(r.controller.content().events).toHaveLength(0);
    expect(r.controller.content().tuplets).toHaveLength(0);
    expect(zoom(host)).toHaveLength(8);
    click(button(host, '실행 취소'));
    expect(r.controller.content().events).toHaveLength(3);
    expect(r.controller.content().tuplets).toHaveLength(1);
    // 묶음을 놓은 것 자체도 한 번에 취소된다
    click(button(host, '실행 취소'));
    expect(r.controller.content().events).toHaveLength(0);
  });
});

describe('5-1 완료 기준: 표시만 셋잇단인 480틱 음 세 개는 실패한다', () => {
  function fakeTriplet(r: Rig): void {
    act(() => {
      r.controller.edit({
        type: 'batch',
        edits: [
          { type: 'addEvent', event: note('x1', 960, 480, 'D', 'gx') },
          { type: 'addEvent', event: note('x2', 1440, 480, 'E', 'gx') },
          { type: 'addEvent', event: note('x3', 1920, 480, 'F', 'gx') },
          { type: 'setTuplets', tuplets: [{ groupId: 'gx', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['x1', 'x2', 'x3'] }] },
        ],
      });
    });
  }

  it('각 음이 320틱이어야 한다고 말하고, 걸린 돌과 박에 표시를 붙인다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    pick(host, 'note', { value: 'thirtySecond', pitch: 'C4' });
    for (let i = 0; i < 8; i++) click(zoom(host)[i]!);
    fakeTriplet(r);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    const lines = qa(host, '.feedback-line').map((l) => text(l));
    expect(lines[0]).toBe('두 번째 박: 이 묶음에서는 각 음이 320틱이에요. 묶음 전체는 4분음표 하나 길이여야 해요.');
    expect(r.controller.attempts[0]!.resultType).not.toBe('passed');
    // 2박 창: 눈에 보이는 돌 둘(셋째 돌은 3박 창으로 넘어가 있다)이 모두 틀린 표시를 가진다
    goBeat(host, 2);
    expect(zoom(host).map((s) => s.closest('.tblock')!.classList.contains('has-error'))).toEqual([true, true]);
    expect(zoom(host)[0]!.getAttribute('aria-label')).toBe('2박, D4 8분 셋잇단음표, 고칠 곳이 있어요');
    expect(zoom(host)[0]!.querySelector('.tblock-mark')).not.toBeNull();
    // 박 고르기 단추에도 기호와 이름이 붙는다
    expect(beatButton(host, 2).classList.contains('has-error')).toBe(true);
    expect(beatButton(host, 2).getAttribute('aria-label')).toBe('2박 확대, 고칠 곳이 있어요');
    expect(beatButton(host, 2).querySelector('.beat-mark')).not.toBeNull();
    expect(beatButton(host, 1).classList.contains('has-error')).toBe(false);
    // 틀린 음은 악보 위에도 표시된다
    expect(qa(host, '.vf-stavenote.is-error').length).toBeGreaterThan(0);
  });

  it('마디가 덜 채워졌으면 비어 있는 구간을 남은 구간으로 강조한다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    pick(host, 'note', { value: 'thirtySecond', pitch: 'C4' });
    for (let i = 0; i < 8; i++) click(zoom(host)[i]!);
    fakeTriplet(r);
    click(button(host, '배치 확인'));
    goBeat(host, 4);
    expect(zoom(host).every((b) => b.closest('.tblock')!.classList.contains('is-remain'))).toBe(true);
    expect(zoom(host)[0]!.getAttribute('aria-label')).toContain('아직 채워지지 않은 구간');
    expect(beatButton(host, 4).classList.contains('has-error')).toBe(true);
    // 문장도 남은 길이를 말한다
    expect(qa(host, '.feedback-line').map((l) => text(l)).join(' ')).toContain('1440틱');
  });

  it('고친 뒤에는 이전 판정과 표시를 지운다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    fakeTriplet(r);
    click(button(host, '배치 확인'));
    expect(qa(host, '.beat-button.has-error').length).toBeGreaterThan(0);
    click(button(host, '모두 지우기'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(qa(host, '.beat-button.has-error')).toHaveLength(0);
    expect(qa(host, '.tblock.has-error')).toHaveLength(0);
  });
});

describe('돌 하나의 음만 틀리면 그 돌에만 표시한다', () => {
  it('둘째 돌을 쉼으로 바꾸면 둘째 돌과 2박 단추만 고칠 곳으로 보인다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    solve(host);
    goBeat(host, 2);
    pick(host, 'rest');
    click(zoom(host)[1]!);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    expect(zoom(host).map((s) => s.closest('.tblock')!.classList.contains('has-error'))).toEqual([false, true, false]);
    expect(zoom(host).map((s) => s.querySelector('.tblock-mark') !== null)).toEqual([false, true, false]);
    expect(zoom(host)[1]!.getAttribute('aria-label')).toBe('2박 둘째 돌, 쉼표 8분 셋잇단음표, 고칠 곳이 있어요');
    expect(beatButton(host, 2).classList.contains('has-error')).toBe(true);
    expect(beatButton(host, 1).classList.contains('has-error')).toBe(false);
    expect(beatButton(host, 3).classList.contains('has-error')).toBe(false);
    // 돌의 음만 맞게 고치면 통과한다
    pick(host, 'note', { pitch: 'E4' });
    click(zoom(host)[1]!);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
  });
});

describe('놓을 수 없는 자리는 이유를 문장으로 알려 주고 초안을 바꾸지 않는다', () => {
  it('겹치는 자리: 먼저 비우라고 알려 준다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    pick(host, 'note', { value: 'thirtySecond', pitch: 'C4' });
    click(zoom(host)[0]!);
    click(zoom(host)[1]!);
    const before = JSON.stringify(r.controller.content());
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(zoom(host)[0]!);
    const reject = q(host, '.tray-reject');
    expect(reject).not.toBeNull();
    expect(text(reject)).toContain('1박에 C4 4분음표를 놓으면');
    expect(text(reject)).toContain('겹친 것을 먼저 비워 주세요');
    expect(JSON.stringify(r.controller.content())).toBe(before);
    expect(r.controller.attempts).toHaveLength(0);
    // 낭독기에도 같은 문장이 간다
    expect(text(q(host, '[role="status"].sr-only'))).toContain('겹친 것을 먼저 비워 주세요');
  });

  it('마디 선을 넘는 길이: 몇 틱 넘는지 알려 준다. 다음에 놓으면 안내가 사라진다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 4);
    pick(host, 'rest', { value: 'half' });
    click(zoom(host)[0]!);
    expect(text(q(host, '.tray-reject'))).toBe('4박에 2분음표 길이의 쉼표를 놓으면 마디 선을 960틱 넘어요. 마디는 3840틱이에요.');
    expect(r.controller.content().events).toHaveLength(0);
    pick(host, 'rest', { value: 'quarter' });
    click(zoom(host)[0]!);
    expect(q(host, '.tray-reject')).toBeNull();
    expect(r.controller.content().events).toHaveLength(1);
  });

  it('칸 격자에 맞지 않는 셋잇단 묶음 자리: 묶음은 박 창 처음에 놓이므로 칸을 아무 데나 눌러도 그 박에 놓인다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 2);
    pick(host, 'raft', { pitch: 'F4' });
    click(zoom(host)[5]!);
    expect(r.controller.content().events.map((e) => e.onsetTicks)).toEqual([960, 1280, 1600]);
  });

  it('재료를 바꾸면 안내가 사라진다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    goBeat(host, 4);
    pick(host, 'note', { value: 'whole', pitch: 'C4' });
    click(zoom(host)[0]!);
    expect(q(host, '.tray-reject')).not.toBeNull();
    click(valueButton(host, 'quarter'));
    expect(q(host, '.tray-reject')).toBeNull();
  });
});

describe('재료 고르기의 상태 말', () => {
  it('종류를 고르기 전에는 길이와 음높이 단추가 눌리지 않는다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    expect(mode(host)).toBe('고른 재료가 없어요. 칸을 누르면 그 칸만 골라요.');
    expect(qa<HTMLButtonElement>(host, 'button.material[data-value]').every((b) => b.disabled)).toBe(true);
    expect(qa<HTMLButtonElement>(host, 'button.material[data-pitch]').every((b) => b.disabled)).toBe(true);
    click(kindButton(host, 'note'));
    expect(qa<HTMLButtonElement>(host, 'button.material[data-value]').every((b) => !b.disabled)).toBe(true);
    expect(qa<HTMLButtonElement>(host, 'button.material[data-pitch]').every((b) => !b.disabled)).toBe(true);
    expect(mode(host)).toBe('고른 재료: C4 32분음표. 칸을 누르면 놓여요.');
  });

  it('쉼은 음높이를, 셋잇단 묶음은 길이를 쓰지 않는다. 비우기는 둘 다 쓰지 않는다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    click(kindButton(host, 'rest'));
    expect(valueButton(host, 'half').disabled).toBe(false);
    expect(pitchButton(host, 'C4').disabled).toBe(true);
    expect(mode(host)).toBe('고른 재료: 32분쉼표. 칸을 누르면 놓여요.');
    click(valueButton(host, 'half'));
    expect(mode(host)).toBe('고른 재료: 2분쉼표. 칸을 누르면 놓여요.');
    expect(text(valueButton(host, 'half'))).toContain('2분쉼표');
    click(kindButton(host, 'raft'));
    expect(valueButton(host, 'half').disabled).toBe(true);
    expect(pitchButton(host, 'C4').disabled).toBe(false);
    expect(mode(host)).toContain('8분 셋잇단음표 묶음(돌 3개, 처음에는 모두 C4)');
    click(kindButton(host, 'erase'));
    expect(valueButton(host, 'half').disabled).toBe(true);
    expect(pitchButton(host, 'C4').disabled).toBe(true);
    expect(mode(host)).toContain('비우기를 골랐어요');
  });

  it('같은 종류를 다시 누르면 고르기를 풀고, 길이와 음높이는 종류를 바꿔도 남는다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    pick(host, 'note', { value: 'sixteenth', pitch: 'E4' });
    expect(mode(host)).toBe('고른 재료: E4 16분음표. 칸을 누르면 놓여요.');
    click(kindButton(host, 'note'));
    expect(mode(host)).toBe('고른 재료가 없어요. 칸을 누르면 그 칸만 골라요.');
    click(kindButton(host, 'erase'));
    click(kindButton(host, 'note'));
    expect(mode(host)).toBe('고른 재료: E4 16분음표. 칸을 누르면 놓여요.');
    expect(valueButton(host, 'sixteenth').getAttribute('aria-pressed')).toBe('true');
    expect(pitchButton(host, 'E4').getAttribute('aria-pressed')).toBe('true');
  });

  it('재료 없이 칸만 누르면 아무것도 놓이지 않고 그 칸을 읽어 준다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    click(zoom(host)[2]!);
    expect(r.controller.content().events).toHaveLength(0);
    expect(text(q(host, '[role="status"].sr-only'))).toBe('1박 3번째 칸, 비어 있음.');
  });
});

describe('박 고르기와 키보드(7.9 1번)', () => {
  it('박을 고르면 그 박이 확대되고 컨트롤러가 고른 박으로 기억한다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    expect(r.controller.selectedCell()?.label).toBe('1박');
    goBeat(host, 3);
    expect(text(q(host, '#zoom-title'))).toBe('3박 확대');
    expect(beatButton(host, 3).getAttribute('aria-pressed')).toBe('true');
    expect(beatButton(host, 1).getAttribute('aria-pressed')).toBe('false');
    expect(r.controller.selectedCell()?.label).toBe('3박');
    expect(zoom(host)[0]!.getAttribute('aria-label')).toBe('3박, 비어 있음');
    expect(text(q(host, '[role="status"].sr-only'))).toBe('3박을 확대했어요.');
  });

  it('칸 사이를 ← →로 옮기고, 창의 끝에서는 옆 박으로 넘어가며, PageUp·PageDown으로 박을 바꾼다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    const first = zoom(host);
    first[0]!.focus();
    keydown(first[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(first[1]);
    keydown(first[1]!, 'ArrowLeft');
    expect(document.activeElement).toBe(first[0]);
    // 끝에서 한 번 더 →: 2박 창의 첫 조각으로
    first[7]!.focus();
    keydown(first[7]!, 'ArrowRight');
    expect(text(q(host, '#zoom-title'))).toBe('2박 확대');
    expect(document.activeElement).toBe(zoom(host)[0]);
    // ← 로 돌아오면 1박 창의 마지막 조각
    keydown(zoom(host)[0]!, 'ArrowLeft');
    expect(text(q(host, '#zoom-title'))).toBe('1박 확대');
    expect(document.activeElement).toBe(zoom(host)[7]);
    // 첫 박에서 ←, 마지막 박에서 →는 아무 데도 가지 않는다
    keydown(zoom(host)[0]!, 'ArrowLeft');
    expect(text(q(host, '#zoom-title'))).toBe('1박 확대');
    keydown(zoom(host)[0]!, 'PageDown');
    expect(text(q(host, '#zoom-title'))).toBe('2박 확대');
    keydown(zoom(host)[0]!, 'PageUp');
    expect(text(q(host, '#zoom-title'))).toBe('1박 확대');
    goBeat(host, 4);
    keydown(zoom(host)[7]!, 'ArrowRight');
    expect(text(q(host, '#zoom-title'))).toBe('4박 확대');
  });

  it('놓은 뒤에도 초점이 그 자리에 남는다. Delete로 비우고 Ctrl+Z로 되돌린다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    pick(host, 'note', { value: 'thirtySecond', pitch: 'C4' });
    zoom(host)[2]!.focus();
    click(zoom(host)[2]!);
    expect(text(zoom(host)[2]!)).toBe('C4');
    expect(document.activeElement).toBe(zoom(host)[2]);
    expect(keydown(zoom(host)[2]!, 'Delete')).toBe(true);
    expect(text(zoom(host)[2]!)).toBe('');
    expect(document.activeElement).toBe(zoom(host)[2]);
    keydown(q(host, '.panel-body')!, 'z', { ctrlKey: true });
    expect(text(zoom(host)[2]!)).toBe('C4');
    keydown(q(host, '.panel-body')!, 'y', { ctrlKey: true });
    expect(text(zoom(host)[2]!)).toBe('');
  });

  it('모든 단추와 조각에 이름이 있다(7.9 8번)', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    solve(host);
    goBeat(host, 2);
    for (const b of qa(host, 'button')) {
      const name = b.getAttribute('aria-label') ?? text(b);
      expect(name.length, `이름 없는 단추: ${b.outerHTML.slice(0, 100)}`).toBeGreaterThan(0);
    }
    // 재료 세 단계는 이름 붙은 묶음이다
    for (const g of qa(host, '.tray-step')) expect(g.getAttribute('aria-labelledby')).toBeTruthy();
    // 개요 줄은 장식이라 낭독기에서 숨기고, 확대 창이 읽힌다
    expect(qa(host, '.trow-overview').every((el) => el.querySelector('ol')!.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(q(host, '.trow-zoom.trow-mine ol')!.getAttribute('aria-label')).toBe('내 배치 2박 확대');
  });
});

describe('필요한 도움만', () => {
  it('박 수 표시는 박 고르기 단추에 번호를 붙인다. 고른 박 반복은 고른 박을 따라간다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    expect(qa(host, '.beat-button .cell-count')).toHaveLength(0);
    click(q(host, '#aid-count')!);
    expect(qa(host, '.beat-button .cell-count').map((c) => text(c))).toEqual(['1', '2', '3', '4']);
    expect(q<HTMLButtonElement>(host, '#aid-repeat')!.disabled).toBe(false);
    expect(text(q(host, '#aid-repeat-label'))).toBe('첫 번째 박 반복');
    goBeat(host, 3);
    expect(text(q(host, '#aid-repeat-label'))).toBe('세 번째 박 반복');
  });

  it('느리게 듣기를 켜도 원래 도전의 템포 표시는 그대로다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    const original = r.controller.tempo().original;
    click(q(host, '#aid-slow')!);
    expect(r.controller.tempo().original).toBe(original);
    expect(r.controller.tempo().effective).toBeLessThan(original);
  });

  it('내 배치 듣기: 재생선이 개요와 확대 창에서 움직이고, 소리를 꺼도 움직인다', async () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    solve(host);
    goBeat(host, 1);
    click(button(host, '내 배치 듣기'));
    expect(r.controller.playing).toBe('mine');
    expect(r.engine.startCalls).toBe(0);
    r.run(0.1);
    expect(qa(host, '.trow-overview.trow-mine .trow-playhead')).toHaveLength(1);
    expect(qa(host, '.trow-zoom.trow-mine .trow-playhead')).toHaveLength(1);
    expect(qa(host, '.trow-zoom.trow-target .trow-playhead')).toHaveLength(0);
    expect(host.querySelector('.trow-zoom.trow-mine .tblock.is-playing')).not.toBeNull();
    // 한 박이 지나면 1박 창에서는 재생선이 없고 개요에서는 계속 간다(그리기 프레임이 돌 시간을 준다)
    r.run(1);
    await act(async () => {
      await later(80);
    });
    expect(qa(host, '.trow-zoom.trow-mine .trow-playhead')).toHaveLength(0);
    expect(qa(host, '.trow-overview.trow-mine .trow-playhead')).toHaveLength(1);
    click(button(host, '정지'));
    expect(r.controller.playing).toBeNull();
    expect(qa(host, '.trow-playhead')).toHaveLength(0);
  });

  it('목표 듣기는 목표 줄에만 재생선을 그린다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    click(button(host, '목표 듣기'));
    expect(r.controller.playing).toBe('target');
    r.run(0.1);
    expect(qa(host, '.trow-zoom.trow-target .trow-playhead')).toHaveLength(1);
    expect(qa(host, '.trow-zoom.trow-mine .trow-playhead')).toHaveLength(0);
  });

  it('놓은 음이 없으면 알려 주고 재생하지 않는다', () => {
    const r = rig('preview', [Q03]);
    const host = open(r);
    click(button(host, '내 배치 듣기'));
    expect(r.controller.playing).toBeNull();
    expect(text(q(host, '.hint-notice'))).toContain('아직 놓은 음이 없어요');
  });
});
