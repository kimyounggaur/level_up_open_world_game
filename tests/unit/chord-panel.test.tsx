// @vitest-environment jsdom
// 5-3 Q05·Q06 화음 패널: 종나무에 종을 걸어 장3화음을 만들고(Q05), 종탑에서 베이스를 바꾸어 전위를 만든다(Q06).
// 완료 기준: C E G D는 실패한다. 화면의 가로 순서를 바꿔도 전위는 그대로다. 눌러서만 끝낼 수 있고(7.9 1·2번), 맞고 틀림은 기호와 문장으로 알린다(4번).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ChordPanel } from '@/ui/panels/chord/ChordPanel';
import { Q05, Q06, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

function open(r: Rig, quest: string, variant: string): HTMLElement {
  act(() => {
    r.controller.open(quest, variant);
  });
  const m = mount(h(ChordPanel, { controller: r.controller }));
  current = m;
  return m.host;
}

const live = (host: HTMLElement): string => text(q(host, '.sr-only[role="status"]'));
const check = (host: HTMLElement): void => click(button(host, '배치 확인'));
const feedback = (host: HTMLElement): string => q(host, '.feedback')!.getAttribute('data-feedback')!;
const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (): Promise<void> => {
  await act(async () => {
    await later(80);
  });
};
const bell = (host: HTMLElement, n: number): HTMLElement => q(host, `li.bell-card[data-slot="tone-${n - 1}"]`)!;
const sounding = (host: HTMLElement): string[] => qa(host, 'li.bell-card.is-sounding').map((c) => c.getAttribute('data-slot')!);

// --- Q05
const letter = (host: HTMLElement, n: number, l: string): void => click(q(bell(host, n), `.pick-letters button[data-letter="${l}"]`));
const octave = (host: HTMLElement, n: number, o: number): void => click(q(bell(host, n), `.pick-octaves button[data-octave="${o}"]`));
const bellName = (host: HTMLElement, n: number): string => q(bell(host, n), '.tag-name')!.getAttribute('data-name')!;
const hang = (host: HTMLElement, n: number, l: string, o?: number): void => {
  letter(host, n, l);
  if (o !== undefined) octave(host, n, o);
};
const hangCEG = (host: HTMLElement): void => {
  hang(host, 1, 'C');
  hang(host, 2, 'E');
  hang(host, 3, 'G');
};

describe('장3화음 조립(Q05): 구성', () => {
  it('제목과 안내, 종 네 칸(음이름·변화표·옥타브 고르개), 종나무, 내 종의 악보가 있다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    expect(text(q(host, 'h1'))).toBe('장3화음 조립하기');
    expect(text(q(host, '.subtitle'))).toBe('C장3화음의 구성음을 종으로 걸어 보세요. 종은 최대 4개까지 걸 수 있어요.');
    expect(qa(host, 'li.bell-card h3').map((e) => text(e))).toEqual(['종 1', '종 2', '종 3', '종 4']);
    expect(qa(bell(host, 1), '.pick-octaves button').map((b) => b.getAttribute('data-octave'))).toEqual(['4', '5']);
    expect(qa(bell(host, 1), '.pick-accidentals button')).toHaveLength(3);
    expect(qa(host, 'svg.bell-tree .tree-row').map((g) => g.getAttribute('data-octave'))).toEqual(['4', '5']);
    expect(qa(host, 'svg.bell-tree .tree-bell')).toHaveLength(0);
    expect(text(q(host, '#score-title'))).toBe('악보로 보기');
    expect(qa(host, '.score-view figure')).toHaveLength(1);
    expect(text(q(host, '.score-view figcaption'))).toBe('내 종');
  });

  it('정답(구성음)은 화면 어디에도 없다. 판본 이름의 괄호 안 구성음도 보이지 않는다', () => {
    for (const [variant, notes] of [['c-major', 'C E G'], ['f-major', 'F A C'], ['g-major', 'G B D']] as const) {
      const host = open(rig('preview', [Q05]), Q05, variant);
      expect(text(host)).not.toContain(notes);
      current?.unmount();
      current = null;
    }
  });

  it('판본마다 안내의 화음 이름이 다르다', () => {
    const f = open(rig('preview', [Q05]), Q05, 'f-major');
    expect(text(q(f, '.subtitle'))).toContain('F장3화음의 구성음');
    current?.unmount();
    current = null;
    const g = open(rig('preview', [Q05]), Q05, 'g-major');
    expect(text(q(g, '.subtitle'))).toContain('G장3화음의 구성음');
  });
});

describe('장3화음 조립(Q05): 종 걸기', () => {
  it('음이름을 고르면 종이 걸리고, 변화표와 옥타브로 고친다. 고를 때마다 문장으로 알린다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    letter(host, 1, 'E');
    expect(bellName(host, 1)).toBe('E4');
    expect(live(host)).toBe('종 1: E4로 걸었어요.');
    click(q(bell(host, 1), '.pick-accidentals button[data-accidental="flat"]'));
    expect(bellName(host, 1)).toBe('E♭4');
    octave(host, 1, 5);
    expect(bellName(host, 1)).toBe('E♭5');
    expect(live(host)).toBe('종 1: E♭5로 바꿨어요.');
    expect(text(bell(host, 1))).toContain('걸린 종: E♭5');
  });

  it('종을 걸면 종나무의 그 옥타브 가지에 매달린다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hang(host, 1, 'C', 4);
    hang(host, 4, 'G', 5);
    const bells = qa(host, 'svg.bell-tree .tree-bell').map((g) => [g.getAttribute('data-slot'), g.getAttribute('data-octave'), text(q(g, '.tree-name'))]);
    expect(bells).toEqual([
      ['0', '4', 'C4'],
      ['3', '5', 'G5'],
    ]);
  });

  it('걸린 종은 비우기로 내린다. 비어 있으면 누를 수 없다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    expect(button(bell(host, 2), '비우기').disabled).toBe(true);
    hang(host, 2, 'E');
    click(button(bell(host, 2), '비우기'));
    expect(bellName(host, 2)).toBe('');
    expect(live(host)).toBe('종 2를 비웠어요.');
  });

  it('내 종의 악보는 걸린 종을 한 화음으로 그린다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hangCEG(host);
    expect(q(host, '.score-view .staff-error')).toBeNull();
    expect(q(host, '.score-view svg')).not.toBeNull();
  });
});

describe('장3화음 조립(Q05): 판정', () => {
  it('C E G를 걸면 통과한다. 걸린 종마다 맞다고 알린다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hangCEG(host);
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. C장3화음의 구성음이 모두 걸렸어요.');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(3);
    expect(q(bell(host, 4), '.slot-status')).toBeNull();
  });

  it('C E G D는 실패한다: 더해진 D만 고칠 곳이고, 맞게 건 종은 맞다고 한다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hangCEG(host);
    hang(host, 4, 'D');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('D가 더해져 있어요. 이 화음의 구성음이 아니에요.');
    expect(bell(host, 4).classList.contains('has-error')).toBe(true);
    expect(text(q(bell(host, 4), '.slot-status.is-error'))).toBe('고칠 곳이 있어요');
    expect(text(q(bell(host, 4), '.slot-message'))).toContain('D가 더해져 있어요');
    for (const n of [1, 2, 3]) {
      expect(bell(host, n).classList.contains('has-error'), `종 ${n}`).toBe(false);
      expect(text(q(bell(host, n), '.slot-status.is-ok'))).toBe('맞아요');
    }
  });

  it('G가 빠지면 빠진 음을 문장으로만 알린다(종마다의 표시가 아니다). 걸린 C와 E는 맞다고 한다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hang(host, 1, 'C');
    hang(host, 2, 'E');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('G가 빠졌어요.');
    expect(qa(host, 'li.bell-card.has-error')).toHaveLength(0);
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(2);
  });

  it('같은 음을 겹쳐 걸면 겹친 종을 알린다(옥타브가 달라도 같은 음이름)', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hangCEG(host);
    hang(host, 4, 'C', 5);
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('C를 겹쳐 놓았어요.');
    expect(bell(host, 4).classList.contains('has-error')).toBe(true);
  });

  it('아무 종도 걸지 않고 확인하면 개수를 알리고 종마다의 표시는 없다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('음이 0개예요. 이 도전은 3개를 놓아요.');
    expect(qa(host, '.slot-status')).toHaveLength(0);
  });

  it('걸린 칸의 순서와 옥타브는 정답에 영향을 주지 않는다: G5, C4, E4도 C장3화음이다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hang(host, 1, 'G', 5);
    hang(host, 3, 'C', 4);
    hang(host, 4, 'E', 4);
    check(host);
    expect(feedback(host)).toBe('passed');
  });

  it('F장3화음과 G장3화음 판본도 같은 화면에서 푼다', () => {
    const f = open(rig('preview', [Q05]), Q05, 'f-major');
    hang(f, 1, 'F');
    hang(f, 2, 'A');
    hang(f, 3, 'C', 5);
    check(f);
    expect(feedback(f)).toBe('passed');
    current?.unmount();
    current = null;
    const g = open(rig('preview', [Q05]), Q05, 'g-major');
    hang(g, 1, 'G');
    hang(g, 2, 'B');
    hang(g, 3, 'D', 5);
    check(g);
    expect(feedback(g)).toBe('passed');
  });

  it('종을 바꾸면 이전 확인 결과가 사라진다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    hangCEG(host);
    check(host);
    expect(feedback(host)).toBe('passed');
    hang(host, 4, 'D');
    expect(feedback(host)).toBe('none');
    expect(qa(host, '.slot-status.is-ok')).toHaveLength(0);
  });
});

describe('장3화음 조립(Q05): 듣기', () => {
  it('걸린 종이 없으면 이유를 알린다', () => {
    const r = rig('preview', [Q05]);
    const host = open(r, Q05, 'c-major');
    click(button(host, '함께 울리기'));
    expect(text(q(host, '.hint-notice'))).toBe('아직 걸린 종이 없어요. 종에 이름을 골라 걸어 보세요.');
    expect(r.controller.playing).toBeNull();
  });

  it('함께 울리기는 걸린 종 모두에 울림 표시를 붙이고, 끝나면 사라진다', async () => {
    const r = rig('preview', [Q05]);
    const host = open(r, Q05, 'c-major');
    hangCEG(host);
    click(button(host, '함께 울리기'));
    expect(button(host, '함께 울리기').getAttribute('aria-pressed')).toBe('true');
    expect(button(host, '아래부터 차례로').getAttribute('aria-pressed')).toBe('false');
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-0', 'tone-1', 'tone-2']);
    expect(qa(host, 'svg.bell-tree .tree-bell.is-sounding')).toHaveLength(3);
    r.run(4);
    await settle();
    expect(sounding(host)).toEqual([]);
    expect(r.controller.playing).toBeNull();
  });

  it('아래부터 차례로는 낮은 음의 종부터 하나씩 울린다(칸 순서가 아니다)', async () => {
    const r = rig('preview', [Q05]);
    const host = open(r, Q05, 'c-major');
    hang(host, 1, 'E');
    hang(host, 2, 'C');
    hang(host, 3, 'G');
    click(button(host, '아래부터 차례로'));
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-1']);
    r.run(1.5);
    await settle();
    expect(sounding(host)).toEqual(['tone-0']);
    r.run(1.5);
    await settle();
    expect(sounding(host)).toEqual(['tone-2']);
  });

  it('가장 낮은 종만 들으면 가장 낮은 종 하나만 울린다', async () => {
    const r = rig('preview', [Q05]);
    const host = open(r, Q05, 'c-major');
    hang(host, 1, 'E');
    hang(host, 2, 'C');
    hang(host, 3, 'G');
    click(button(host, '가장 낮은 종만'));
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-1']);
  });

  it('목표 화음 듣기는 목표를 재생한다', () => {
    const r = rig('preview', [Q05]);
    const host = open(r, Q05, 'c-major');
    click(button(host, '목표 화음 듣기'));
    expect(r.controller.playing).toBe('target');
    expect(button(host, '목표 화음 듣기').getAttribute('aria-pressed')).toBe('true');
  });

  it('모든 버튼과 고르개에 이름이 붙어 있다(7.9 8번)', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    for (const g of qa(host, '.choice-group')) expect(text(q(host, `#${g.getAttribute('aria-labelledby')!}`)).length).toBeGreaterThan(0);
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    expect(text(q(bell(host, 3), '.choice-title'))).toBe('종 3: 음이름');
  });

  it('종 그림(종나무)은 장식이라 화면 낭독기에 읽히지 않는다', () => {
    const host = open(rig('preview', [Q05]), Q05, 'c-major');
    expect(q(host, 'svg.bell-tree')!.getAttribute('aria-hidden')).toBe('true');
  });
});

// --- Q06
const swap = (host: HTMLElement, n: number, dir: 'left' | 'right'): void => click(button(bell(host, n), dir === 'left' ? '왼쪽으로 자리 바꾸기' : '오른쪽으로 자리 바꾸기'));
const up = (host: HTMLElement, n: number): void => click(button(bell(host, n), '옥타브 올리기'));
const down = (host: HTMLElement, n: number): void => click(button(bell(host, n), '옥타브 내리기'));
const mute = (host: HTMLElement, n: number): void => click(button(bell(host, n), /소리 (끄기|켜기)/));
const names = (host: HTMLElement): string[] => qa(host, 'li.bell-card').map((c) => c.getAttribute('data-name')!);
const bass = (host: HTMLElement): string => q(host, '.bass-readout')!.getAttribute('data-bass')!;

describe('전위(Q06): 구성', () => {
  it('종 세 개가 기본 위치(C3 E3 G3)로 걸린 채 시작하고, 가장 낮은 종에 표시가 붙는다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    expect(text(q(host, 'h1'))).toBe('베이스를 바꾸어 전위 만들기');
    expect(text(q(host, '.subtitle'))).toBe('C장3화음 제1전위로 만들어 보세요. 가장 낮게 울리는 종이 베이스예요.');
    expect(names(host)).toEqual(['C3', 'E3', 'G3']);
    expect(bass(host)).toBe('C3');
    expect(text(q(host, '.bass-readout'))).toBe('지금 가장 낮은 음: C3 (종 1)');
    expect(qa(host, 'li.bell-card.is-lowest').map((c) => c.getAttribute('data-slot'))).toEqual(['tone-0']);
    expect(text(q(bell(host, 1), '.slot-status.is-lowest'))).toBe('가장 낮은 종');
    expect(qa(host, 'svg.bell-tree .tree-row').map((g) => g.getAttribute('data-octave'))).toEqual(['2', '3', '4', '5']);
    expect(qa(host, 'svg.bell-tree .tree-bell').map((g) => [g.getAttribute('data-slot'), g.getAttribute('data-octave')])).toEqual([
      ['0', '3'],
      ['1', '3'],
      ['2', '3'],
    ]);
    expect(qa(host, 'svg.bell-tree .tree-bell.is-lowest')).toHaveLength(1);
  });

  it('칸 순서의 양 끝 종은 바깥쪽으로 자리를 옮길 수 없다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    expect(button(bell(host, 1), '왼쪽으로 자리 바꾸기').disabled).toBe(true);
    expect(button(bell(host, 3), '오른쪽으로 자리 바꾸기').disabled).toBe(true);
    expect(button(bell(host, 2), '왼쪽으로 자리 바꾸기').disabled).toBe(false);
  });

  it('목표 악보는 정답이라서 보이지 않는다. 내 종의 악보만 있다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    expect(qa(host, '.score-view figure')).toHaveLength(1);
    expect(text(q(host, '.score-view figcaption'))).toBe('내 종');
    expect(q(host, '.score-view .staff-error')).toBeNull();
  });
});

describe('전위(Q06): 고치기', () => {
  it('옥타브를 올리면 이름과 가장 낮은 음이 바뀌고, 바뀐 것을 문장으로 알린다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    up(host, 1);
    expect(names(host)).toEqual(['C4', 'E3', 'G3']);
    expect(bass(host)).toBe('E3');
    expect(live(host)).toBe('종 1: C4로 올렸어요. 가장 낮은 음은 E3이에요.');
    expect(qa(host, 'li.bell-card.is-lowest').map((c) => c.getAttribute('data-slot'))).toEqual(['tone-1']);
    down(host, 1);
    expect(names(host)).toEqual(['C3', 'E3', 'G3']);
    expect(live(host)).toBe('종 1: C3으로 내렸어요. 가장 낮은 음은 C3이에요.');
  });

  it('음역(C2–B5) 밖으로는 옮기지 못하고 이유를 알린다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    down(host, 1);
    expect(names(host)[0]).toBe('C2');
    down(host, 1);
    expect(names(host)[0]).toBe('C2');
    expect(live(host)).toBe('종 1: 더 낮게 내릴 수 없어요. 이 도전의 음역은 C2부터 B5까지예요.');
    for (let i = 0; i < 4; i++) up(host, 3);
    expect(names(host)[2]).toBe('G5');
    up(host, 3);
    expect(live(host)).toBe('종 3: 더 높이 올릴 수 없어요. 이 도전의 음역은 C2부터 B5까지예요.');
  });

  it('소리를 끄고 켠다. 꺼진 종은 가장 낮은 음에서 빠지고, 꺼졌다는 표시가 글자와 점선으로 보인다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    mute(host, 1);
    expect(live(host)).toBe('종 1: 소리를 껐어요. 가장 낮은 음은 E3이에요.');
    expect(bass(host)).toBe('E3');
    expect(text(q(bell(host, 1), '.slot-status.is-muted'))).toBe('소리 꺼짐');
    expect(bell(host, 1).getAttribute('data-muted')).toBe('true');
    expect(text(button(bell(host, 1), /소리 (끄기|켜기)/))).toBe('소리 켜기');
    expect(q(host, 'svg.bell-tree .tree-bell.is-muted .tree-x')).not.toBeNull();
    mute(host, 1);
    expect(live(host)).toBe('종 1: 소리를 켰어요. 가장 낮은 음은 C3이에요.');
    expect(bass(host)).toBe('C3');
    expect(q(host, '.slot-status.is-muted')).toBeNull();
  });

  it('모든 종의 소리를 끄면 가장 낮은 음이 없다고 알린다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    for (const n of [1, 2, 3]) mute(host, n);
    expect(text(q(host, '.bass-readout'))).toBe('소리가 켜진 종이 없어요.');
    expect(bass(host)).toBe('');
    expect(live(host)).toBe('종 3: 소리를 껐어요. 소리가 켜진 종이 없어요.');
    expect(qa(host, 'li.bell-card.is-lowest')).toHaveLength(0);
  });

  it('자리를 바꿔도 같은 음들이다: 가장 낮은 음은 그대로라고 알리고 가로 순서만 바뀐다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    swap(host, 1, 'right');
    expect(names(host)).toEqual(['E3', 'C3', 'G3']);
    expect(bass(host)).toBe('C3');
    expect(live(host)).toBe('종 1과 종 2의 자리를 바꿨어요. 가장 낮은 음은 그대로 C3이에요.');
    expect(qa(host, 'li.bell-card.is-lowest').map((c) => c.getAttribute('data-slot'))).toEqual(['tone-1']);
    swap(host, 3, 'left');
    expect(names(host)).toEqual(['E3', 'G3', 'C3']);
    expect(bass(host)).toBe('C3');
  });

  it('소리를 끈 종도 자리를 바꾸면 따라 움직인다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    mute(host, 1);
    swap(host, 1, 'right');
    expect(names(host)).toEqual(['E3', 'C3', 'G3']);
    expect(bell(host, 2).getAttribute('data-muted')).toBe('true');
    expect(bell(host, 1).getAttribute('data-muted')).toBe('false');
  });

  it('자리 바꾸기는 실행 취소 한 번으로 돌아온다', () => {
    const r = rig('preview', [Q06]);
    const host = open(r, Q06, 'c-first');
    swap(host, 1, 'right');
    expect(names(host)).toEqual(['E3', 'C3', 'G3']);
    act(() => r.controller.undo());
    expect(names(host)).toEqual(['C3', 'E3', 'G3']);
    expect(r.controller.content().slots).toEqual([]);
  });
});

describe('전위(Q06): 판정', () => {
  it('처음의 기본 위치는 제1전위가 아니다: 가장 낮은 음과 현재 전위를 문장으로 알린다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('현재 가장 낮은 음은 C3이에요. 그래서 기본 위치예요. 목표는 제1전위예요.');
  });

  it('C를 한 옥타브 올리면 제1전위(E3 G3 C4)가 되어 통과한다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    up(host, 1);
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(text(q(host, '.feedback'))).toContain('통과했어요. 가장 낮은 종이 목표의 베이스예요.');
  });

  it('화면의 가로 순서를 바꿔도 전위는 그대로다: 통과한 배치의 순서를 어떻게 바꿔도 통과한다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    up(host, 1);
    for (const [n, dir] of [[1, 'right'], [2, 'right'], [1, 'right'], [3, 'left']] as const) {
      swap(host, n, dir);
      check(host);
      expect(feedback(host), `${names(host).join(' ')}`).toBe('passed');
    }
  });

  it('기본 위치에서 순서만 바꾸면 전위는 여전히 기본 위치라서 실패한다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    swap(host, 1, 'right');
    swap(host, 2, 'right');
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('현재 가장 낮은 음은 C3이에요. 그래서 기본 위치예요.');
  });

  it('제2전위 판본은 C와 E를 모두 올려 G가 가장 낮을 때 통과하고, 제1전위의 답은 통과하지 못한다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-second');
    expect(text(q(host, '.subtitle'))).toContain('C장3화음 제2전위로');
    up(host, 1);
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('그래서 제1전위예요. 목표는 제2전위예요.');
    up(host, 2);
    check(host);
    expect(feedback(host)).toBe('passed');
    expect(bass(host)).toBe('G3');
  });

  it('소리를 끈 종은 판정에서 빠진다: 한 종을 끄면 3화음이 모자라다고 알린다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    up(host, 1);
    mute(host, 2);
    check(host);
    expect(feedback(host)).toBe('needsRevision');
    expect(text(q(host, '.feedback'))).toContain('E가 없어 완전한 3화음 조건을 먼저 확인해야 해요.');
  });

  it('고치면 이전 확인 결과가 사라진다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    up(host, 1);
    check(host);
    expect(feedback(host)).toBe('passed');
    swap(host, 1, 'right');
    expect(feedback(host)).toBe('none');
  });

  it('F장3화음과 G장3화음 판본도 같은 화면에서 푼다', () => {
    const f = open(rig('preview', [Q06]), Q06, 'f-first');
    expect(names(f)).toEqual(['F3', 'A3', 'C4']);
    up(f, 1);
    check(f);
    expect(feedback(f)).toBe('passed');
    current?.unmount();
    current = null;
    const g = open(rig('preview', [Q06]), Q06, 'g-second');
    expect(names(g)).toEqual(['G3', 'B3', 'D4']);
    up(g, 1);
    up(g, 2);
    check(g);
    expect(feedback(g)).toBe('passed');
  });
});

describe('전위(Q06): 듣기', () => {
  it('가장 낮은 종만 들으면 가장 낮은 종 하나만 울린다. 자리를 바꾸면 그 종의 칸이 따라간다', async () => {
    const r = rig('preview', [Q06]);
    const host = open(r, Q06, 'c-first');
    swap(host, 1, 'right');
    click(button(host, '가장 낮은 종만'));
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-1']);
    expect(names(host)[1]).toBe('C3');
  });

  it('아래부터 차례로는 소리를 켠 종만 낮은 음부터 울린다', async () => {
    const r = rig('preview', [Q06]);
    const host = open(r, Q06, 'c-first');
    mute(host, 1);
    click(button(host, '아래부터 차례로'));
    r.run(0.3);
    await settle();
    expect(sounding(host)).toEqual(['tone-1']);
    r.run(1.5);
    await settle();
    expect(sounding(host)).toEqual(['tone-2']);
    r.run(2);
    await settle();
    expect(sounding(host)).toEqual([]);
  });

  it('소리가 켜진 종이 없으면 이유를 알린다', () => {
    const r = rig('preview', [Q06]);
    const host = open(r, Q06, 'c-first');
    for (const n of [1, 2, 3]) mute(host, n);
    click(button(host, '함께 울리기'));
    expect(text(q(host, '.hint-notice'))).toBe('소리가 켜진 종이 없어요. 종의 소리를 켜 보세요.');
    expect(r.controller.playing).toBeNull();
  });

  it('목표 화음 듣기는 목표를 재생한다', () => {
    const r = rig('preview', [Q06]);
    const host = open(r, Q06, 'c-first');
    click(button(host, '목표 화음 듣기'));
    expect(r.controller.playing).toBe('target');
  });

  it('모든 버튼에 이름이 붙어 있고, 같은 이름의 버튼은 종 번호로 가려낼 수 있다(7.9 8번)', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    for (const b of qa<HTMLButtonElement>(host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    const labels = qa<HTMLButtonElement>(host, 'li.bell-card button').map((b) => b.getAttribute('aria-label')!);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('종 2: 옥타브 올리기');
  });

  it('키보드: 단추는 모두 Tab으로 닿고(tabindex 기본), Enter로 누르는 것은 브라우저의 단추 동작이다', () => {
    const host = open(rig('preview', [Q06]), Q06, 'c-first');
    const bad = qa<HTMLButtonElement>(host, 'li.bell-card button').filter((b) => b.tabIndex < 0);
    expect(bad).toHaveLength(0);
    // 단추에 초점이 가도 화살표 키가 아무것도 바꾸지 않는다(고르개가 아니라 개별 단추)
    const first = button(bell(host, 1), '옥타브 올리기');
    act(() => first.focus());
    keydown(first, 'ArrowRight');
    expect(names(host)).toEqual(['C3', 'E3', 'G3']);
  });
});
