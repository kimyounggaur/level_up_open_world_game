// @vitest-environment jsdom
// 7-1 오선 패널(panel.clef의 StaffPanel)의 일반화: 음자리표(Q01)의 두 칸 과제와 오선 언덕(Q09–Q12)의 여러 칸 과제가 같은 화면을 쓴다.
// Q01의 문장('보표 2개', '두 음 듣기', '두 보표의 음이 목표와 같아요.')은 그대로이고, 그 밖의 과제는 칸 수를 말하는 문장을 쓴다. 월드의 계단밭(TerraceHud)도 같은 문장을 쓴다(staffText).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { slotDisplayScore, staffSlotsOf } from '@/domain/challenge';
import { renderScore } from '@/ui/notation/render';
import type { RenderedStave } from '@/ui/notation/render';
import { yOfPosition } from '@/ui/notation/staffSurface';
import { ClefPanel } from '@/ui/panels/clef/ClefPanel';
import { Q01, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

const Q09 = 'staff.lines-and-spaces';
const Q10 = 'staff.ledger-lines';
const Q11 = 'staff.middle-c-neighbors';
const Q12 = 'staff.range-ladder';
const NOTE_PATTERN = /[A-G][♯♭]?\d/;

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

const newRig = (): Rig => rig('preview', [Q09, Q10, Q11, Q12]);

function open(r: Rig, questId: string, variantId: string): HTMLElement {
  act(() => {
    r.controller.open(questId, variantId);
  });
  const m = mount(h(ClefPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

const surface = (host: HTMLElement, slotId: string): HTMLElement => q(host, `.staff-surface[data-slot-id="${slotId}"]`)!;
const card = (host: HTMLElement, slotId: string): HTMLElement => q(host, `.slot-card[data-slot="${slotId}"]`)!;
const slotIds = (r: Rig): string[] => r.controller.staffSlots().map((s) => s.slotId);

function staveOf(r: Rig, slotId: string): RenderedStave {
  const cur = r.controller.current!;
  const slot = staffSlotsOf(cur.def).find((s) => s.slotId === slotId)!;
  const box = document.createElement('div');
  const rendered = renderScore(box, slotDisplayScore(cur.def, slot, { slots: [], events: [], tuplets: [] }), { measuresPerSystem: 1, minMeasureWidth: 96, showTimeSignature: false });
  return rendered.staves[0]!;
}

/** 오선 그림의 보표 위치 p를 누른 것처럼 클릭한다 */
function tap(r: Rig, host: HTMLElement, slotId: string, position: number): void {
  const svg = surface(host, slotId).querySelector('svg')!;
  const box = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  (svg as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ top: 0, left: 0, bottom: box[3]!, right: box[2]!, width: box[2]!, height: box[3]!, x: 0, y: 0, toJSON: () => ({}) });
  const y = yOfPosition(staveOf(r, slotId), position) - box[1]!;
  click(surface(host, slotId), { clientY: y });
}

/** 칸 차례대로 보표 위치를 눌러 놓는다 */
function lay(r: Rig, host: HTMLElement, positions: readonly number[]): void {
  const ids = slotIds(r);
  expect(ids).toHaveLength(positions.length);
  positions.forEach((p, i) => tap(r, host, ids[i]!, p));
}

const feedback = (host: HTMLElement): string => q(host, '.feedback')!.getAttribute('data-feedback')!;
const chips = (host: HTMLElement): string[] => qa(host, '.chips .chip').map((c) => text(c));

describe('Q01은 두 칸 과제의 문장 그대로다', () => {
  it('칩은 보표 2개, 듣기 단추는 두 음 듣기, 안내는 두 보표에 모두 놓고 확인하라고 한다', () => {
    const r = newRig();
    const host = open(r, Q01, 'middle-c');
    expect(chips(host)).toEqual(['보표 2개', '온음표 하나씩']);
    expect(button(host, '두 음 듣기')).toBeTruthy();
    expect(qa(host, 'button').some((b) => text(b) === '놓은 음 듣기')).toBe(false);
    expect(text(q(host, '.feedback-idle'))).toBe("두 보표에 모두 놓고 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.");
    tap(r, host, 'treble', -2);
    expect(text(q(host, '.feedback-idle'))).toContain("두 보표에 모두 놓고 '배치 확인'");
    tap(r, host, 'bass', 10);
    expect(text(q(host, '.feedback-idle'))).toContain("다 놓았어요. '배치 확인'을 눌러 보세요.");
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('두 보표의 음이 목표와 같아요.');
  });
});

describe('Q09 줄과 칸', () => {
  it('높은음자리표의 줄: 칸이 다섯, 이름은 목표 음이다. 칩은 음 5개, 듣기 단추는 놓은 음 듣기다. 읽는 말에는 이름이 없다', () => {
    const r = newRig();
    const host = open(r, Q09, 'treble-lines');
    expect(text(q(host, 'h1'))).toBe('줄과 칸');
    expect(text(q(host, '.subtitle'))).toBe('높은음자리표에는 E4, G4, B4, D5, F5를 놓아 보세요.');
    expect(qa(host, '.slot-card')).toHaveLength(5);
    expect(qa(host, '.slot-card h3').map((h3) => text(h3))).toEqual(['E4', 'G4', 'B4', 'D5', 'F5']);
    expect(chips(host)).toEqual(['음 5개', '온음표 하나씩']);
    expect(button(host, '놓은 음 듣기')).toBeTruthy();
    expect(qa(host, 'button').some((b) => text(b) === '두 음 듣기')).toBe(false);
    expect(text(q(host, '.feedback-idle'))).toBe("5개 모두 놓고 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.");
    for (const readout of qa(host, '.slot-readout')) expect(text(readout)).not.toMatch(NOTE_PATTERN);
  });

  it('줄 다섯(위치 0, 2, 4, 6, 8)에 놓고 확인하면 통과한다. 놓은 음이 모두 목표와 같다고 말한다', () => {
    const r = newRig();
    const host = open(r, Q09, 'treble-lines');
    lay(r, host, [0, 2, 4, 6, 8]);
    expect(text(q(host, '.feedback-idle'))).toContain("다 놓았어요. '배치 확인'을 눌러 보세요.");
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('놓은 음이 모두 목표와 같아요.');
    expect(text(q(host, '.feedback'))).not.toContain('두 보표');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(5);
    expect(r.controller.attempts.at(-1)!.resultType).toBe('passed');
  });

  it('한 칸을 한 칸 위에 놓으면 그 칸만 틀리고, 지금 놓은 음과 목표를 위치로 말한다', () => {
    const r = newRig();
    const host = open(r, Q09, 'treble-lines');
    lay(r, host, [0, 3, 4, 6, 8]); // 둘째 칸(G4)을 한 칸 위(A4)에 놓았다
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('needsRevision');
    const ids = slotIds(r);
    expect(card(host, ids[1]!).classList.contains('has-error')).toBe(true);
    for (const id of [ids[0]!, ids[2]!, ids[3]!, ids[4]!]) expect(card(host, id).classList.contains('has-error'), id).toBe(false);
    expect(text(card(host, ids[1]!).querySelector('.slot-message'))).toBe('지금 위치는 A4예요. 목표 G4는 높은음자리표의 아래에서 둘째 줄에 있어요.');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(4);
  });

  it('낮은음자리표의 칸(Q09 bass-spaces): 위치 1, 3, 5, 7에 놓으면 A2 C3 E3 G3로 읽고 통과한다', () => {
    const r = newRig();
    const host = open(r, Q09, 'bass-spaces');
    expect(text(q(host, '.subtitle'))).toBe('낮은음자리표에는 A2, C3, E3, G3을 놓아 보세요.'); // 받침이 있는 이름(G3 = 지 삼)은 '을'로 이어진다
    expect(chips(host)[0]).toBe('음 4개');
    lay(r, host, [1, 3, 5, 7]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
  });
});

describe('Q10 덧줄', () => {
  it('높은음자리표의 첫 덧줄(C4, A5): 아래 첫 덧줄(−2)과 위 첫 덧줄(+10)에 놓으면 통과한다', () => {
    const r = newRig();
    const host = open(r, Q10, 'treble-ledger');
    expect(chips(host)[0]).toBe('음 2개'); // 칸이 둘이어도 두 음자리표 한 쌍이 아니면 음 N개다
    expect(button(host, '놓은 음 듣기')).toBeTruthy();
    lay(r, host, [-2, 10]);
    expect(text(card(host, slotIds(r)[0]!).querySelector('.slot-readout'))).toBe('놓은 자리: 아래 첫 덧줄');
    expect(text(card(host, slotIds(r)[1]!).querySelector('.slot-readout'))).toBe('놓은 자리: 위 첫 덧줄');
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('놓은 음이 모두 목표와 같아요.');
  });

  it('둘째 덧줄(A3, C6): 아래 둘째 덧줄(−4)과 위 둘째 덧줄(+12)에 놓으면 통과한다', () => {
    const r = newRig();
    const host = open(r, Q10, 'treble-far-ledger');
    lay(r, host, [-4, 12]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
  });

  it('낮은음자리표의 덧줄(E2 C2 C4 E4)', () => {
    const r = newRig();
    const host = open(r, Q10, 'bass-ledger');
    expect(chips(host)[0]).toBe('음 4개');
    // 낮은음자리표: E2는 아래 첫 덧줄(−2), C2는 아래 둘째 덧줄(−4), C4는 위 첫 덧줄(+10), E4는 위 둘째 덧줄(+12)
    lay(r, host, [-2, -4, 10, 12]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
  });
});

describe('Q11 가운데 턱의 이웃', () => {
  it('B3 C4 D4를 두 음자리표에 각각 놓는다: 칸 여섯, 이름에 음자리표가 붙고 칩은 음 6개다(두 칸 쌍이 아니다)', () => {
    const r = newRig();
    const host = open(r, Q11, 'neighbors');
    expect(text(q(host, '.subtitle'))).toBe('높은음자리표에는 B3, C4, D4를, 낮은음자리표에는 B3, C4, D4를 놓아 보세요.');
    expect(qa(host, '.slot-card h3').map((h3) => text(h3))).toEqual(['B3 · 높은음자리표', 'B3 · 낮은음자리표', 'C4 · 높은음자리표', 'C4 · 낮은음자리표', 'D4 · 높은음자리표', 'D4 · 낮은음자리표']);
    expect(chips(host)[0]).toBe('음 6개');
    // 높은음자리표: B3 −3, C4 −2, D4 −1 / 낮은음자리표: B3 9, C4 10, D4 11
    lay(r, host, [-3, 9, -2, 10, -1, 11]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('놓은 음이 모두 목표와 같아요.');
  });

  it('음자리표를 바꿔 읽으면 틀린다: 낮은음자리표 칸의 B3를 높은음자리표의 위치(−3)에 놓으면 낮은음자리표로는 D2가 된다', () => {
    const r = newRig();
    const host = open(r, Q11, 'neighbors');
    lay(r, host, [-3, -3, -2, 10, -1, 11]); // 둘째 칸(낮은음 B3)을 −3에 놓았다. 낮은음자리표의 −3은 맨 아랫줄(G2)에서 세 칸 아래다
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('needsRevision');
    const ids = slotIds(r);
    expect(card(host, ids[1]!).classList.contains('has-error')).toBe(true);
    expect(qa(host, '.slot-card.has-error')).toHaveLength(1);
    // B3는 낮은음자리표에서 맨 윗줄(A3) 바로 위 칸이다
    expect(text(card(host, ids[1]!).querySelector('.slot-message'))).toBe('지금 위치는 D2예요. 목표 B3은 낮은음자리표의 맨 윗줄의 위 칸에 있어요.');
  });
});

describe('Q12 음역 사다리', () => {
  it('음을 낮은 음부터 차례로 놓는다: 칸 일곱, 가온 도 아래는 낮은음자리표 칸이다', () => {
    const r = newRig();
    const host = open(r, Q12, 'c3-c5');
    expect(text(q(host, '.subtitle'))).toBe('C3, E3, G3, C4, E4, G4, C5를 낮은 음부터 차례로 놓아 보세요. 가온 도(C4)보다 낮은 칸은 낮은음자리표, 그 위 칸은 높은음자리표로 읽어요.');
    expect(qa(host, '.slot-card h3').map((h3) => text(h3))).toEqual(['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5']);
    expect(chips(host)[0]).toBe('음 7개');
    expect(button(host, '놓은 음 듣기')).toBeTruthy();
    // 낮은음자리표: C3 3, E3 5, G3 7 / 높은음자리표: C4 −2, E4 0, G4 2, C5 5
    lay(r, host, [3, 5, 7, -2, 0, 2, 5]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('놓은 음이 모두 목표와 같아요.');
  });

  it('넓은 판본(C2–C6)은 칸이 다섯이다', () => {
    const r = newRig();
    const host = open(r, Q12, 'c2-c6');
    expect(qa(host, '.slot-card')).toHaveLength(5);
    expect(chips(host)[0]).toBe('음 5개');
    // 낮은음자리표: C2 −4(아래 둘째 덧줄)와 C3 3 / 높은음자리표: C4 −2, C5 5, C6 12
    lay(r, host, [-4, 3, -2, 5, 12]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
  });

  it('칸의 높이 순서가 뒤바뀌면 틀린다. 놓지 않은 칸은 빠졌다고 알린다', () => {
    const r = newRig();
    const host = open(r, Q12, 'c3-c5');
    lay(r, host, [5, 3, 7, -2, 0, 2, 5]); // 앞의 두 칸을 맞바꿔 놓았다(E3 C3)
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('needsRevision');
    expect(qa(host, '.feedback-line').length).toBeGreaterThan(0);
    // 하나를 지우고 다시 확인하면 그 칸이 빠졌다고도 말한다(순서가 바뀐 곳과 함께 나온다)
    click(button(host, `${r.controller.staffSlots()[2]!.label}: 음 지우기`));
    click(button(host, '배치 확인'));
    const lines = qa(host, '.feedback-line').map((l) => text(l)).join(' ');
    expect(lines).toContain('1번째와 2번째 자리의 순서가 바뀌었어요.');
    expect(lines).toContain('세 번째 자리: 아직 놓지 않았어요.');
  });
});

describe('놓은 음 듣기는 놓은 음을 칸 차례로 들려 주고, 울리는 칸을 글자로도 보여 준다', () => {
  // 재생 위치 표시는 화면 프레임(requestAnimationFrame)마다 읽는다. 시험에서는 프레임을 우리가 직접 한 번씩 보낸다.
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
  const soundingSlots = (host: HTMLElement): string[] => qa(host, '.slot-card.is-sounding').map((c) => c.getAttribute('data-slot') ?? '');

  it('Q12: 놓은 차례가 아니라 칸 차례로, 놓은 음마다 2박(1.5초)씩 울린다. 놓지 않은 칸은 건너뛴다', () => {
    const r = newRig();
    const host = open(r, Q12, 'c3-c5');
    const ids = slotIds(r);
    tap(r, host, ids[3]!, -2); // C4를 먼저 놓고
    tap(r, host, ids[0]!, 3); // C3를 나중에 놓았다
    expect(soundingSlots(host)).toEqual([]);
    click(button(host, '놓은 음 듣기'));
    expect(r.controller.playing).toBe('mine');
    advance(r, 0.5);
    expect(soundingSlots(host)).toEqual([ids[0]!]);
    expect(text(card(host, ids[0]!).querySelector('.slot-status.is-sounding'))).toBe('지금 울리는 음');
    advance(r, 1.5);
    expect(soundingSlots(host)).toEqual([ids[3]!]);
    advance(r, 1.6);
    expect(r.controller.playing).toBeNull();
    nextFrame();
    expect(soundingSlots(host)).toEqual([]);
  });

  it('Q09: 놓은 음이 없으면 알려 주고, 정지하면 표시가 바로 사라진다', () => {
    const r = newRig();
    const host = open(r, Q09, 'treble-lines');
    const ids = slotIds(r);
    click(button(host, '놓은 음 듣기'));
    expect(r.controller.playing).toBeNull();
    expect(text(q(host, '.hint-notice'))).toContain('아직 놓은 음이 없어요');
    tap(r, host, ids[2]!, 4);
    click(button(host, '놓은 음 듣기'));
    advance(r, 0.3);
    expect(soundingSlots(host)).toEqual([ids[2]!]);
    click(button(host, '정지'));
    nextFrame();
    expect(soundingSlots(host)).toEqual([]);
  });
});

describe('키보드와 단추로 놓는다(끌지 않아도 된다)', () => {
  it('Q09: 칸마다 한 칸씩 옮기는 단추와 ↑ ↓ 키가 있다. 모든 단추에 이름이 있다', () => {
    const r = newRig();
    const host = open(r, Q09, 'treble-lines');
    const first = slotIds(r)[0]!;
    click(button(host, 'E4: 한 칸 위로'));
    expect(text(card(host, first).querySelector('.slot-readout'))).toBe('놓은 자리: 가운데 줄');
    expect(keydown(surface(host, first), 'ArrowDown')).toBe(true);
    expect(surface(host, first).getAttribute('aria-valuetext')).toBe('둘째 칸');
    for (const b of qa(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    // 칸마다 단추가 셋씩 있다
    expect(qa(host, '.slot-controls')).toHaveLength(5);
  });

  it('덧줄 보기를 쓰고 통과하면 통과로 기록되되 도움을 썼다고 함께 남는다. 쓰지 않으면 남지 않는다', () => {
    const r = newRig();
    const host = open(r, Q10, 'treble-ledger');
    lay(r, host, [-2, 10]);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    expect(r.controller.attempts.at(-1)!.resultType).toBe('passed');
    expect(r.controller.attempts.at(-1)!.assistUsed).toBe(false);
    expect(r.controller.usedAssist()).toBe(false);
    // 같은 도전에서 덧줄 보기를 켜고 다시 확인한다
    click(q(host, '#aid-ledger')!);
    expect(r.controller.aids.ledger).toBe(true);
    expect(r.controller.usedAssist()).toBe(true);
    click(button(host, '배치 확인'));
    expect(r.controller.attempts.at(-1)!.resultType).toBe('passed');
    expect(r.controller.attempts.at(-1)!.assistUsed).toBe(true);
  });
});
