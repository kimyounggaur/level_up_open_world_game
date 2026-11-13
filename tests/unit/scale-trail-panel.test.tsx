// @vitest-environment jsdom
// 7-2 음계 패널로 새 판본 열기(패널 쌍둥이, W-2): Q24–Q26과 Q07의 G·D·B♭장조가 같은 패널에서 풀린다.
// 패널은 과제 데이터에서 제목, 문장, 칩, 선반 이름, 통과 문장을 읽는다. 월드의 디딤돌 길(S1–S3)과 같은 초안·같은 작업대다(4.2 '패널로 보기').
// 끌지 않고 키보드와 누르기로 모두 된다(W-4). 맞고 틀림은 색만으로 전하지 않는다(7.9 4번).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SlotBench } from '@/ui/challenge/slotBench';
import { ScalePanel, describeSlotScore, scalePrompt } from '@/ui/panels/scale/ScalePanel';
import { button, click, keydown, mount, q, qa, quest, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

const NATURAL = 'scale.natural-minor';
const HARMONIC = 'scale.harmonic-minor';
const PENTA = 'scale.pentatonic';
const MAJOR = 'scale.major';
const make = (): Rig => rig('preview', [NATURAL, HARMONIC, PENTA]);

let current: { unmount: () => void } | null = null;
let benchNow: SlotBench | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
  benchNow?.dispose();
  benchNow = null;
});

function open(r: Rig, questId: string, variantId: string, setup?: (bench: SlotBench) => void) {
  const bench = new SlotBench(r.controller);
  benchNow = bench;
  act(() => {
    r.controller.open(questId, variantId);
    setup?.(bench);
  });
  const m = mount(h(ScalePanel, { controller: r.controller, bench }));
  current = m;
  return { host: m.host, bench };
}

const stone = (host: HTMLElement, slot: number): HTMLButtonElement => q<HTMLButtonElement>(host, `button.cell-mine[data-slot="${slot}"]`)!;
const stoneNames = (host: HTMLElement): string[] => qa(host, 'button.cell-mine').map((b) => b.getAttribute('data-name') ?? '');
const shelf = (host: HTMLElement, i: number): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-shelf="${i}"]`)!;
const shelfNames = (host: HTMLElement): string[] => qa(host, 'button.material[data-shelf]').map((b) => text(b));
const accidental = (host: HTMLElement, which: 'flat' | 'none' | 'sharp'): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-accidental="${which}"]`)!;
const press = (el: Element, code: string, init: KeyboardEventInit = {}): boolean => keydown(el, code, { code, ...init });

interface Row {
  questId: string;
  variantId: string;
  title: string;
  /** 과제 문장(설계서 4.3의 '조 이름의 음계를 어디부터 어디까지 몇 자리에') */
  subtitle: string;
  chips: string[];
  count: number;
  /** 선반의 단추 글자(조표를 적용한 이름) */
  shelf: string[];
  /** 으뜸음부터 한 음씩 위로 놓으면 놓이는 이름 */
  names: string[];
  /** 통과했을 때의 문장 */
  passed: string;
}

const ROWS: Row[] = [
  {
    questId: NATURAL,
    variantId: 'a-minor',
    title: '자연단음계',
    subtitle: 'A단조의 자연단음계를 A3부터 A4까지 8자리에 차례로 놓아 보세요.',
    chips: ['A단조', '자리 8개', '한 자리 = 4분음표'],
    count: 8,
    shelf: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    names: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'],
    passed: '통과했어요. 8자리의 음이 A단조의 자연단음계와 같아요.',
  },
  {
    questId: NATURAL,
    variantId: 'd-minor',
    title: '자연단음계',
    subtitle: 'D단조의 자연단음계를 D4부터 D5까지 8자리에 차례로 놓아 보세요.',
    chips: ['D단조', '자리 8개', '한 자리 = 4분음표'],
    count: 8,
    shelf: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5'],
    names: ['D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5'],
    passed: '통과했어요. 8자리의 음이 D단조의 자연단음계와 같아요.',
  },
  {
    questId: NATURAL,
    variantId: 'e-minor',
    title: '자연단음계',
    subtitle: 'E단조의 자연단음계를 E4부터 E5까지 8자리에 차례로 놓아 보세요.',
    chips: ['E단조', '자리 8개', '한 자리 = 4분음표'],
    count: 8,
    shelf: ['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5'],
    names: ['E4', 'F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'],
    passed: '통과했어요. 8자리의 음이 E단조의 자연단음계와 같아요.',
  },
  {
    questId: MAJOR,
    variantId: 'g-major',
    title: '장음계 배열하기',
    subtitle: 'G장조의 장음계를 G4부터 G5까지 8자리에 차례로 놓아 보세요.',
    chips: ['G장조', '자리 8개', '한 자리 = 4분음표'],
    count: 8,
    shelf: ['F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5', 'A5'],
    names: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5'],
    passed: '통과했어요. 8자리의 음이 G장조의 장음계와 같아요.',
  },
  {
    questId: MAJOR,
    variantId: 'd-major',
    title: '장음계 배열하기',
    subtitle: 'D장조의 장음계를 D4부터 D5까지 8자리에 차례로 놓아 보세요.',
    chips: ['D장조', '자리 8개', '한 자리 = 4분음표'],
    count: 8,
    shelf: ['C♯4', 'D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5', 'D5', 'E5'],
    names: ['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5', 'D5'],
    passed: '통과했어요. 8자리의 음이 D장조의 장음계와 같아요.',
  },
  {
    questId: MAJOR,
    variantId: 'bflat-major',
    title: '장음계 배열하기',
    subtitle: 'B♭장조의 장음계를 B♭3부터 B♭4까지 8자리에 차례로 놓아 보세요.',
    chips: ['B♭장조', '자리 8개', '한 자리 = 4분음표'],
    count: 8,
    shelf: ['A3', 'B♭3', 'C4', 'D4', 'E♭4', 'F4', 'G4', 'A4', 'B♭4', 'C5'],
    names: ['B♭3', 'C4', 'D4', 'E♭4', 'F4', 'G4', 'A4', 'B♭4'],
    passed: '통과했어요. 8자리의 음이 B♭장조의 장음계와 같아요.',
  },
];

const HARMONIC_ROW = {
  subtitle: 'A단조의 화성단음계를 A3부터 A4까지 8자리에 차례로 놓아 보세요.',
  names: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G♯4', 'A4'],
  shelf: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
};
const PENTA_ROW = {
  subtitle: 'C장조의 다섯 음 음계를 C4부터 C5까지 6자리에 차례로 놓아 보세요.',
  names: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
  shelf: ['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'],
};

describe('과제 문장과 악보 설명을 만드는 순수 함수', () => {
  it('음계의 이름은 판본의 간격 목록에서 읽는다: 자연단음계, 화성단음계, 다섯 음 음계, 장음계', () => {
    for (const row of ROWS) expect(scalePrompt(quest(row.questId).variants[row.variantId]!, row.count), `${row.questId}/${row.variantId}`).toBe(row.subtitle);
    expect(scalePrompt(quest(HARMONIC).variants['a-harmonic-minor']!, 8)).toBe(HARMONIC_ROW.subtitle);
    expect(scalePrompt(quest(PENTA).variants['c-pentatonic']!, 6)).toBe(PENTA_ROW.subtitle);
  });

  it('Q07의 C·F장조 문장은 이전과 글자까지 같다', () => {
    expect(scalePrompt(quest(MAJOR).variants['c-major']!, 8)).toBe('C장조의 장음계를 C4부터 C5까지 8자리에 차례로 놓아 보세요.');
    expect(scalePrompt(quest(MAJOR).variants['f-major']!, 8)).toBe('F장조의 장음계를 F4부터 F5까지 8자리에 차례로 놓아 보세요.');
  });

  it('악보 설명은 음자리표, 박자, 조 이름의 조표, 자리마다의 음을 말한다', () => {
    const def = quest(NATURAL).variants['d-minor']!;
    const views = [
      { slot: 1, written: null, spelled: null, midi: null, name: 'D4' },
      { slot: 2, written: null, spelled: null, midi: null, name: null },
    ];
    expect(describeSlotScore(def, views)).toBe('높은음자리표, 4/4박자, D단조의 조표. 1번째 자리 D4, 2번째 자리 비어 있음.');
  });
});

describe('구성: 판본마다 제목, 문장, 칩, 선반, 자리 단추가 데이터대로 나온다', () => {
  it.each(ROWS.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s', (_key, row) => {
    const r = make();
    const { host } = open(r, row.questId, row.variantId);
    expect(text(q(host, 'h1'))).toBe(row.title);
    expect(text(q(host, '.subtitle'))).toBe(row.subtitle);
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(row.chips);
    expect(qa(host, '.timeline-row h3').map((e) => text(e))).toEqual(['1번째 마디', '2번째 마디']);
    expect(qa(host, 'button.cell-mine')).toHaveLength(row.count);
    expect(stoneNames(host)).toEqual(Array(row.count).fill(''));
    expect(shelfNames(host)).toEqual(row.shelf);
    expect(text(q(host, '.tray-mode'))).toContain(`손에 든 음: ${row.names[0]}`);
    expect(text(host)).not.toContain('목표 악보'); // 음계 과제는 목표가 곧 답이다
  });

  it('화성단음계(Q25): A단조, 조표 없음, 선반은 G3에서 B4까지', () => {
    const r = make();
    const { host } = open(r, HARMONIC, 'a-harmonic-minor');
    expect(text(q(host, 'h1'))).toBe('화성단음계');
    expect(text(q(host, '.subtitle'))).toBe(HARMONIC_ROW.subtitle);
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['A단조', '자리 8개', '한 자리 = 4분음표']);
    expect(shelfNames(host)).toEqual(HARMONIC_ROW.shelf);
  });

  it('다섯 음 음계(Q26): 6자리. 첫 마디에 넷, 둘째 마디에 둘이 놓인다', () => {
    const r = make();
    const { host } = open(r, PENTA, 'c-pentatonic');
    expect(text(q(host, 'h1'))).toBe('다섯 음 음계');
    expect(text(q(host, '.subtitle'))).toBe(PENTA_ROW.subtitle);
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['C장조', '자리 6개', '한 자리 = 4분음표']);
    expect(shelfNames(host)).toEqual(PENTA_ROW.shelf);
    const rows = qa(host, 'ol.cells');
    expect(rows.map((ol) => qa(ol, 'button.cell-mine').map((b) => b.getAttribute('data-slot')))).toEqual([
      ['1', '2', '3', '4'],
      ['5', '6'],
    ]);
  });
});

describe('키보드만으로 풀기: ← → ↑ Enter로 놓고 C로 확인하면 통과한다(완료 기준 4-2와 같은 방식)', () => {
  it.each(ROWS.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s', (_key, row) => {
    const r = make();
    const { host } = open(r, row.questId, row.variantId);
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < row.count; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
    expect(stoneNames(host)).toEqual(row.names);
    expect(press(body, 'KeyC')).toBe(true);
    const feedback = q(host, '.feedback')!;
    expect(feedback.getAttribute('data-feedback')).toBe('passed');
    expect(text(feedback)).toBe(row.passed);
    expect(r.controller.attempts.at(-1)).toMatchObject({ questId: row.questId, variantId: row.variantId, resultType: 'passed' });
  });
});

describe('화성단음계(Q25): 틀리면 그 자리에만 표시가 서고, ♯을 붙이면 통과한다', () => {
  it('온음계로만 놓으면 일곱 번째 자리가 G로 놓여 틀린다: 기호와 글자로 표시한다(7.9 4번)', () => {
    const r = make();
    const { host, bench } = open(r, HARMONIC, 'a-harmonic-minor');
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < 8; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
    expect(stoneNames(host)[6]).toBe('G4');
    click(button(host, '배치 확인'));
    const feedback = q(host, '.feedback')!;
    expect(feedback.getAttribute('data-feedback')).toBe('needsRevision');
    expect(text(feedback)).toBe('일곱 번째 자리: 지금은 G4예요. 목표는 G♯4예요.');
    expect(qa(feedback, '.icon')).toHaveLength(1);
    expect(bench.flagged()).toEqual([7]);
    expect(stone(host, 7).classList.contains('has-error')).toBe(true);
    expect(stone(host, 7).querySelector('.cell-mark .icon')).not.toBeNull();
    expect(stone(host, 7).getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    for (const n of [1, 2, 3, 4, 5, 6, 8]) {
      expect(stone(host, n).classList.contains('has-error'), `${n}번`).toBe(false);
      expect(stone(host, n).getAttribute('aria-label')).not.toContain('고칠 곳');
    }
  });

  it('일곱째 자리를 눌러 고르고 G에 올림표를 붙여 놓으면 표식이 사라지고 통과한다', () => {
    const r = make();
    const { host } = open(r, HARMONIC, 'a-harmonic-minor');
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < 8; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
    click(button(host, '배치 확인'));
    click(stone(host, 7));
    click(shelf(host, 7)); // G4
    click(accidental(host, 'sharp'));
    expect(text(shelf(host, 7))).toBe('G♯4');
    click(button(host, '7번째 자리에 놓기'));
    expect(stoneNames(host)).toEqual(HARMONIC_ROW.names);
    expect(qa(host, '.cell-mark')).toHaveLength(0);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(host, '.feedback'))).toBe('통과했어요. 8자리의 음이 A단조의 화성단음계와 같아요.');
  });

  it('오선의 내 악보는 올림표가 붙은 G♯을 그린다', () => {
    const r = make();
    const { host } = open(r, HARMONIC, 'a-harmonic-minor');
    click(stone(host, 7));
    click(shelf(host, 7));
    click(accidental(host, 'sharp'));
    click(button(host, '7번째 자리에 놓기'));
    const svg = q(host, '.staff-host svg')!;
    expect(svg.querySelector('desc')?.textContent ?? '').toContain('7번째 자리 G♯4');
  });
});

describe('다섯 음 음계(Q26): 눌러서 6자리를 놓는다', () => {
  it('F와 B를 건너뛰며 C D E G A C를 고르고 자리를 누르면 놓이고, 확인하면 통과한다', () => {
    const r = make();
    const { host } = open(r, PENTA, 'c-pentatonic');
    [1, 2, 3, 5, 6, 8].forEach((shelfIndex, i) => {
      click(shelf(host, shelfIndex));
      click(stone(host, i + 1));
    });
    expect(stoneNames(host)).toEqual(PENTA_ROW.names);
    click(button(host, '배치 확인'));
    const feedback = q(host, '.feedback')!;
    expect(feedback.getAttribute('data-feedback')).toBe('passed');
    expect(text(feedback)).toBe('통과했어요. 6자리의 음이 C장조의 다섯 음 음계와 같아요.');
    expect(r.controller.attempts.at(-1)).toMatchObject({ questId: PENTA, variantId: 'c-pentatonic', resultType: 'passed' });
  });

  it('확인하기 전의 안내는 6자리를 모두 놓으라고 말한다', () => {
    const r = make();
    const { host } = open(r, PENTA, 'c-pentatonic');
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(text(q(host, '.feedback'))).toContain('6자리를 모두 놓고');
  });

  it('F와 A를 끼워 넣으면 넷째부터 셋째 자리가 모두 표시된다. 일곱 번째 자리는 없다', () => {
    const r = make();
    const { host, bench } = open(r, PENTA, 'c-pentatonic');
    [1, 2, 3, 4, 5, 6].forEach((shelfIndex, i) => {
      click(shelf(host, shelfIndex));
      click(stone(host, i + 1));
    });
    expect(stoneNames(host)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    click(button(host, '배치 확인'));
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    expect(bench.flagged()).toEqual([4, 5, 6]);
    expect(qa(host, 'button.cell-mine.has-error').map((b) => b.getAttribute('data-slot'))).toEqual(['4', '5', '6']);
    expect(stone(host, 7)).toBeNull();
  });

  it('오선의 내 악보는 놓은 음 여섯 개를 그린다(둘째 마디는 두 음뿐이다)', () => {
    const r = make();
    const { host } = open(r, PENTA, 'c-pentatonic');
    [1, 2, 3, 5, 6, 8].forEach((shelfIndex, i) => {
      click(shelf(host, shelfIndex));
      click(stone(host, i + 1));
    });
    expect(qa(host, '.staff-host .vf-stavenote')).toHaveLength(6);
    const svg = q(host, '.staff-host svg')!;
    expect(svg.querySelector('desc')?.textContent ?? '').toContain('6번째 자리 C5');
  });
});

describe('조표가 있는 판본: 오선과 선반이 조표를 적용해 읽는다', () => {
  it('D단조: 놓은 여섯째 음이 B♭으로 읽히고 오선의 설명에도 B♭이 적힌다', () => {
    const r = make();
    const { host } = open(r, NATURAL, 'd-minor');
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < 8; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
    expect(stoneNames(host)[5]).toBe('B♭4');
    expect(qa(host, '.staff-host .vf-stavenote')).toHaveLength(8);
    const svg = q(host, '.staff-host svg')!;
    expect(svg.querySelector('desc')?.textContent ?? '').toContain('D단조의 조표');
    expect(svg.querySelector('desc')?.textContent ?? '').toContain('6번째 자리 B♭4');
  });

  it('조표가 있는 단음계에서도 같은 소리의 다른 이름은 이름을 고치라고 말한다: D단조 여섯째 자리에 A♯', () => {
    const r = make();
    const { host, bench } = open(r, NATURAL, 'd-minor');
    const body = q(host, '.panel-body')!;
    for (let i = 0; i < 8; i++) {
      press(body, 'ArrowRight');
      press(body, 'Enter');
      press(body, 'ArrowUp');
    }
    click(stone(host, 6));
    click(shelf(host, 5)); // A4
    click(accidental(host, 'sharp'));
    click(button(host, '6번째 자리에 놓기'));
    expect(stoneNames(host)[5]).toBe('A♯4');
    click(button(host, '배치 확인'));
    expect(text(q(host, '.feedback'))).toBe('여섯 번째 자리는 B 이름을 써요. D단조에서는 B♭4예요. 소리 높이는 같아요.');
    expect(bench.flagged()).toEqual([6]);
  });
});

describe('월드의 디딤돌 길과 패널은 같은 초안이다(4.2 패널로 보기)', () => {
  it('월드(작업대)에서 놓은 것이 패널에 그대로 있다: E단조 첫 두 자리', () => {
    const r = make();
    const { host } = open(r, NATURAL, 'e-minor', (bench) => {
      bench.perform('cursor-right');
      bench.perform('place');
      bench.perform('cursor-right');
      bench.perform('hand-up');
      bench.perform('place');
    });
    expect(stoneNames(host).slice(0, 3)).toEqual(['E4', 'F♯4', '']);
    expect(stone(host, 2).getAttribute('aria-current')).toBe('true');
    expect(text(q(host, '.tray-mode'))).toContain('손에 든 음: F♯4');
  });

  it('패널에서 고친 것이 세션에 저장된다: 다섯 음 음계의 여섯째 자리', () => {
    const r = make();
    const { host, bench } = open(r, PENTA, 'c-pentatonic');
    click(shelf(host, 8)); // C5
    click(stone(host, 6));
    expect(bench.views()[5]).toMatchObject({ slot: 6, name: 'C5', midi: 72 });
    expect(r.session.contentOf(PENTA, 'c-pentatonic').slots).toEqual([{ slot: 6, writtenPitch: { letter: 'C', accidental: null, octave: 5 } }]);
    expect(r.session.serialize().challengeDrafts['scale.pentatonic/c-pentatonic']!.selectedSlot).toBe(6);
  });
});
