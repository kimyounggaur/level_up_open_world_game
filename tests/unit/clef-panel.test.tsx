// @vitest-environment jsdom
// 2-6 음자리 패널(Q01): 오선에 놓기와 한 칸씩 옮기기. 높은음자리표 맨 아랫줄에 놓으면 E4로 읽고 실패한다.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { slotDisplayScore, staffSlotsOf } from '@/domain/challenge';
import { renderScore } from '@/ui/notation/render';
import type { RenderedStave } from '@/ui/notation/render';
import { cropToPlacementRange, yOfPosition } from '@/ui/notation/staffSurface';
import { ClefPanel } from '@/ui/panels/clef/ClefPanel';
import { Q01, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

function open(r: Rig) {
  act(() => {
    r.controller.open(Q01, 'middle-c');
  });
  const m = mount(h(ClefPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

const surface = (host: HTMLElement, slotId: string): HTMLElement => q(host, `.staff-surface[data-slot-id="${slotId}"]`)!;
const card = (host: HTMLElement, slotId: string): HTMLElement => q(host, `.slot-card[data-slot="${slotId}"]`)!;

/** 그 칸의 오선이 그려진 모양과 같은 모양을 따로 그려서 보표 도형을 얻는다 */
function staveOf(r: Rig, slotId: string): RenderedStave {
  const cur = r.controller.current!;
  const slot = staffSlotsOf(cur.def).find((s) => s.slotId === slotId)!;
  const box = document.createElement('div');
  const rendered = renderScore(box, slotDisplayScore(cur.def, slot, { slots: [], events: [], tuplets: [] }), { measuresPerSystem: 1, minMeasureWidth: 96, showTimeSignature: false });
  return rendered.staves[0]!;
}

/** 오선 그림의 보표 위치 p를 누른 것처럼 클릭한다(화면은 그림 크기 그대로) */
function tap(r: Rig, host: HTMLElement, slotId: string, position: number): void {
  const svg = surface(host, slotId).querySelector('svg')!;
  const box = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  (svg as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ top: 0, left: 0, bottom: box[3]!, right: box[2]!, width: box[2]!, height: box[3]!, x: 0, y: 0, toJSON: () => ({}) });
  const y = yOfPosition(staveOf(r, slotId), position) - box[1]!;
  click(surface(host, slotId), { clientY: y });
}

describe('구성', () => {
  it('두 보표 칸, 두 음 듣기, 덧줄 보기, 배치 확인이 있고 음이름은 아직 보이지 않는다', () => {
    const r = rig();
    const host = open(r);
    expect(text(q(host, 'h1'))).toBe('같은 음의 자리 찾기');
    expect(text(q(host, '.subtitle'))).toBe('같은 음 C4를 높은음자리표 보표와 낮은음자리표 보표에 각각 놓아 보세요.');
    expect(qa(host, '.slot-card')).toHaveLength(2);
    expect(text(card(host, 'treble').querySelector('h3'))).toBe('높은음자리표 보표');
    expect(text(card(host, 'bass').querySelector('h3'))).toBe('낮은음자리표 보표');
    expect(button(host, '두 음 듣기')).toBeTruthy();
    expect(q(host, '#aid-ledger')).not.toBeNull();
    expect(button(host, '배치 확인')).toBeTruthy();
    // 읽는 말은 위치만: 음이름은 판정 뒤에만 나온다
    for (const readout of qa(host, '.slot-readout')) expect(text(readout)).not.toMatch(/[A-G][♯♭]?\d/);
  });

  it('오선 칸은 슬라이더 역할과 이름, 범위, 값의 말이 있다', () => {
    const r = rig();
    const host = open(r);
    const s = surface(host, 'treble');
    expect(s.getAttribute('role')).toBe('slider');
    expect(s.getAttribute('tabindex')).toBe('0');
    expect(s.getAttribute('aria-label')).toBe('높은음자리표 보표: 음의 자리');
    expect(s.getAttribute('aria-valuemin')).toBe('-6');
    expect(s.getAttribute('aria-valuemax')).toBe('14');
    expect(s.getAttribute('aria-valuetext')).toBe('아직 놓지 않았어요');
  });

  it('보이는 범위는 덧줄 셋까지로 줄어든다', () => {
    const r = rig();
    const host = open(r);
    const svg = surface(host, 'treble').querySelector('svg')!;
    const stave = staveOf(r, 'treble');
    const box = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(box[1]).toBeCloseTo(yOfPosition(stave, 14) - 14, 5);
    expect(box[1]! + box[3]!).toBeCloseTo(yOfPosition(stave, -6) + 14, 5);
    // 같은 계산을 다시 해도 같다
    const copy = svg.cloneNode(true) as SVGSVGElement;
    cropToPlacementRange(copy, stave);
    expect(copy.getAttribute('viewBox')).toBe(svg.getAttribute('viewBox'));
  });
});

describe('2-6 완료 기준: 높은음자리표 맨 아랫줄에 놓으면 E4로 읽고 실패한다', () => {
  it('눌러서 맨 아랫줄(위치 0)에 놓고 확인하면 E4 문장이 나온다', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', 0);
    expect(r.controller.slotPosition(r.controller.staffSlots()[0]!)).toBe(0);
    expect(text(card(host, 'treble').querySelector('.slot-readout'))).toBe('놓은 자리: 맨 아랫줄');
    expect(surface(host, 'treble').getAttribute('aria-valuetext')).toBe('맨 아랫줄');
    // 확인하기 전에는 맞고 틀림이 없다
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    tap(r, host, 'bass', 10);
    click(button(host, '배치 확인'));
    const f = q(host, '.feedback')!;
    expect(f.getAttribute('data-feedback')).toBe('needsRevision');
    expect(qa(f, '.feedback-line').map((l) => text(l))).toEqual(['지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.']);
    // 틀린 칸은 색과 함께 기호와 문장으로 구분된다. 맞는 칸은 맞다고 말한다
    expect(card(host, 'treble').classList.contains('has-error')).toBe(true);
    expect(text(card(host, 'treble').querySelector('.slot-status'))).toBe('고칠 곳이 있어요');
    expect(text(card(host, 'treble').querySelector('.slot-message'))).toBe('지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.');
    expect(card(host, 'bass').classList.contains('has-error')).toBe(false);
    expect(text(card(host, 'bass').querySelector('.slot-status'))).toBe('맞아요');
    expect(r.controller.attempts).toHaveLength(1);
    expect(r.controller.attempts[0]!.resultType).toBe('needsRevision');
  });

  it('아래 첫 덧줄(−2)과 위 첫 덧줄(+10)에 놓으면 통과한다', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', -2);
    tap(r, host, 'bass', 10);
    expect(text(card(host, 'treble').querySelector('.slot-readout'))).toBe('놓은 자리: 아래 첫 덧줄');
    expect(text(card(host, 'bass').querySelector('.slot-readout'))).toBe('놓은 자리: 위 첫 덧줄');
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요');
    expect(qa(host, '.slot-status').map((s) => text(s))).toEqual(['맞아요', '맞아요']);
    // 그려진 온음표가 덧줄 위에 있다
    expect(r.controller.attempts[0]!.resultType).toBe('passed');
  });

  it('놓지 않은 칸은 빠졌다고 알려 준다', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', -2);
    click(button(host, '배치 확인'));
    const lines = qa(host, '.feedback-line').map((l) => text(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('낮은음자리표 보표에 음이 아직 없어요.');
    expect(card(host, 'bass').classList.contains('has-error')).toBe(true);
  });
});

describe('끌지 않고 키보드와 단추만으로 끝낸다(7.9 1·2번)', () => {
  it('↑ ↓ 키: 처음에는 가운데 줄에 놓이고 그다음부터 한 칸씩 움직인다', () => {
    const r = rig();
    const host = open(r);
    const s = surface(host, 'treble');
    s.focus();
    expect(keydown(s, 'ArrowDown')).toBe(true);
    expect(s.getAttribute('aria-valuenow')).toBe('4');
    expect(s.getAttribute('aria-valuetext')).toBe('가운데 줄');
    keydown(s, 'ArrowDown');
    expect(s.getAttribute('aria-valuenow')).toBe('3');
    expect(s.getAttribute('aria-valuetext')).toBe('둘째 칸');
    for (let i = 0; i < 5; i++) keydown(s, 'ArrowDown');
    expect(s.getAttribute('aria-valuenow')).toBe('-2');
    expect(s.getAttribute('aria-valuetext')).toBe('아래 첫 덧줄');
    keydown(s, 'ArrowUp');
    expect(s.getAttribute('aria-valuenow')).toBe('-1');
    expect(document.activeElement).toBe(s);
  });

  it('범위 끝에서는 더 가지 않고 알려 준다. PageUp·PageDown은 한 옥타브(7칸)씩', () => {
    const r = rig();
    const host = open(r);
    const s = surface(host, 'bass');
    keydown(s, 'End');
    expect(s.getAttribute('aria-valuenow')).toBe('14');
    keydown(s, 'ArrowUp');
    expect(s.getAttribute('aria-valuenow')).toBe('14');
    expect(text(q(host, '[role="status"][aria-live]'))).toContain('더 위로 옮길 수 없어요');
    keydown(s, 'PageDown');
    expect(s.getAttribute('aria-valuenow')).toBe('7');
    keydown(s, 'Home');
    expect(s.getAttribute('aria-valuenow')).toBe('-6');
    keydown(s, 'PageUp');
    expect(s.getAttribute('aria-valuenow')).toBe('1');
  });

  it('한 칸 위로·한 칸 아래로·지우기 단추와 Delete 키', () => {
    const r = rig();
    const host = open(r);
    click(button(host, '높은음자리표 보표: 한 칸 위로'));
    expect(text(card(host, 'treble').querySelector('.slot-readout'))).toBe('놓은 자리: 가운데 줄');
    click(button(host, '높은음자리표 보표: 한 칸 아래로'));
    expect(text(card(host, 'treble').querySelector('.slot-readout'))).toBe('놓은 자리: 둘째 칸');
    click(button(host, '높은음자리표 보표: 음 지우기'));
    expect(text(card(host, 'treble').querySelector('.slot-readout'))).toBe('아직 놓지 않았어요. 오선을 눌러 보세요.');
    expect(button(host, '높은음자리표 보표: 음 지우기').disabled).toBe(true);
    keydown(surface(host, 'treble'), 'Enter');
    expect(surface(host, 'treble').getAttribute('aria-valuenow')).toBe('4');
    expect(keydown(surface(host, 'treble'), 'Delete')).toBe(true);
    expect(surface(host, 'treble').getAttribute('aria-valuetext')).toBe('아직 놓지 않았어요');
  });

  it('키보드만으로 두 보표를 놓고 확인해 통과한다', () => {
    const r = rig();
    const host = open(r);
    const treble = surface(host, 'treble');
    const bass = surface(host, 'bass');
    keydown(treble, 'Enter'); // 4
    for (let i = 0; i < 6; i++) keydown(treble, 'ArrowDown'); // -2
    keydown(bass, 'Enter'); // 4
    for (let i = 0; i < 6; i++) keydown(bass, 'ArrowUp'); // 10
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
  });

  it('실행 취소와 다시 실행이 오선 놓기에도 듣는다(Ctrl+Z)', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', 4);
    tap(r, host, 'treble', 6);
    expect(surface(host, 'treble').getAttribute('aria-valuenow')).toBe('6');
    act(() => r.controller.undo());
    expect(surface(host, 'treble').getAttribute('aria-valuenow')).toBe('4');
    act(() => r.controller.redo());
    expect(surface(host, 'treble').getAttribute('aria-valuenow')).toBe('6');
  });

  it('모든 단추에 이름이 있고 스위치는 이름으로 이어진다(7.9 8번)', () => {
    const r = rig();
    const host = open(r);
    for (const b of qa(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    const sw = q(host, '#aid-ledger')!;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-labelledby')).toBe('aid-ledger-label');
  });
});

describe('도움: 덧줄 보기와 두 음 듣기', () => {
  it('덧줄 보기를 켜면 덧줄 자리 6곳에 점선이 그려지고, 끄면 사라진다. 도움 사용으로 기록된다', () => {
    const r = rig();
    const host = open(r);
    expect(qa(host, '.ledger-guide')).toHaveLength(0);
    click(q(host, '#aid-ledger')!);
    expect(qa(host, '.ledger-guide')).toHaveLength(12); // 보표 둘 × 6
    expect(r.controller.usedAssist()).toBe(true);
    // 놓은 음을 옮겨 그림이 다시 그려져도 안내선은 남는다
    tap(r, host, 'treble', 4);
    expect(qa(host, '.ledger-guide')).toHaveLength(12);
    click(q(host, '#aid-ledger')!);
    expect(qa(host, '.ledger-guide')).toHaveLength(0);
  });

  it('두 음 듣기는 놓은 음이 없으면 알려 주고, 있으면 소리 없이도 재생한다(소리는 켜기 전까지 없다)', () => {
    const r = rig();
    const host = open(r);
    click(button(host, '두 음 듣기'));
    expect(r.controller.playing).toBeNull();
    expect(text(q(host, '.hint-notice'))).toContain('아직 놓은 음이 없어요');
    tap(r, host, 'treble', -2);
    tap(r, host, 'bass', 10);
    click(button(host, '두 음 듣기'));
    expect(r.controller.playing).toBe('mine');
    expect(r.engine.startCalls).toBe(0);
    expect(text(q(host, '#sound-off-hint'))).toContain('소리가 꺼져 있어요');
    click(button(host, '정지'));
    expect(r.controller.playing).toBeNull();
  });
});

describe('소리를 끈 채로도 어느 음이 울리는지 보인다(7.9 6번)', () => {
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
  /** 한 칸이 울리는 중이면 그 칸에 '지금 울리는 음' 표시가 있고, 표시는 글자로 나온다(색만이 아니다) */
  const soundingSlots = (host: HTMLElement): string[] => qa(host, '.slot-card.is-sounding').map((c) => c.getAttribute('data-slot') ?? '');

  it('두 음 듣기: 높은음자리표 칸이 2박(1.5초) 울리고 이어서 낮은음자리표 칸이 울린다. 소리가 꺼져 있어도 같다', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', -2);
    tap(r, host, 'bass', 10);
    expect(soundingSlots(host)).toEqual([]);
    click(button(host, '두 음 듣기'));
    advance(r, 0.5);
    expect(soundingSlots(host)).toEqual(['treble']);
    expect(text(card(host, 'treble').querySelector('.slot-status.is-sounding'))).toBe('지금 울리는 음');
    expect(card(host, 'bass').querySelector('.slot-status.is-sounding')).toBeNull();
    advance(r, 1.5);
    expect(soundingSlots(host)).toEqual(['bass']);
    advance(r, 1.6);
    // 끝까지 재생하면 표시가 사라진다
    expect(r.controller.playing).toBeNull();
    nextFrame();
    expect(soundingSlots(host)).toEqual([]);
    expect(r.engine.startCalls).toBe(0);
  });

  it('낮은음자리표만 놓았으면 그 칸만 울리고, 정지하면 표시가 바로 사라진다', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'bass', 10);
    click(button(host, '두 음 듣기'));
    advance(r, 0.3);
    expect(soundingSlots(host)).toEqual(['bass']);
    click(button(host, '정지'));
    nextFrame();
    expect(soundingSlots(host)).toEqual([]);
    expect(r.controller.playheadSlot()).toBeNull();
  });

  it('소리를 켠 뒤에도 같은 표시가 나오고, 같은 순서로 소리가 난다', async () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', -2);
    tap(r, host, 'bass', 10);
    await act(async () => {
      await r.controller.enableSound();
    });
    click(button(host, '두 음 듣기'));
    advance(r, 0.4);
    expect(soundingSlots(host)).toEqual(['treble']);
    advance(r, 1.6);
    expect(soundingSlots(host)).toEqual(['bass']);
    expect(r.engine.sinks.get('task')!.live().map((x) => x.midi)).toEqual([60, 60]);
  });
});

describe('안 보이는 사람을 위한 알림', () => {
  it('놓을 때마다 위치를 알림 영역으로 전한다', () => {
    const r = rig();
    const host = open(r);
    tap(r, host, 'treble', -2);
    expect(text(q(host, '[role="status"][aria-live]'))).toBe('높은음자리표 보표에 놓았어요. 자리는 아래 첫 덧줄이에요.');
  });
});
