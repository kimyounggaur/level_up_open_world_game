// 7-2 음계 길의 놓기 작업대: 새 판본(Q24–Q26, Q07의 G·D·B♭장조)을 키보드, 눌러서, 듣기로 푼다. 설계서 4.2, 4.3, 5.8.
// 작업대(SlotBench)와 변환표는 판본의 음역, 조표, 판정 조건에서 모든 것을 읽는다. 그래서 새 판본은 코드 변경 없이 열려야 하고, 그것을 여기서 확인한다.
// 값은 설계서 5.8의 표를 그대로 옮긴 것이다(코드가 계산한 값을 정답으로 삼지 않는다).
import { describe, expect, it } from 'vitest';
import { quest, rig } from './controller-rig';
import type { Rig } from './controller-rig';

const NATURAL = 'scale.natural-minor';
const HARMONIC = 'scale.harmonic-minor';
const PENTA = 'scale.pentatonic';
const MAJOR = 'scale.major';
const make = (): Rig => rig({ definitions: [MAJOR, NATURAL, HARMONIC, PENTA].map(quest) });

const names = (r: Rig): Array<string | null> => r.bench.views().map((v) => v.name);
const midis = (r: Rig): Array<number | null> => r.bench.views().map((v) => v.midi);

/** 키보드만으로 자리를 한 칸씩 옮겨 가며 으뜸음부터 한 음씩 위로 놓는다(→, Enter, ↑) */
function typeScale(r: Rig, count: number): void {
  for (let i = 0; i < count; i++) {
    r.bench.perform('cursor-right');
    r.bench.perform('place');
    r.bench.perform('hand-up');
  }
}

interface Row {
  questId: string;
  variantId: string;
  /** 재료 선반(변화표 없이 쓴 이름) */
  shelf: string[];
  /** 처음 손에 든 음(조표를 적용한 이름) */
  hand: string;
  count: number;
  keySignature: number;
  /** 으뜸음부터 한 음씩 위로 놓으면 놓이는 이름(조표를 적용한 이름) */
  names: string[];
  /** 설계서 5.8의 MIDI */
  midi: number[];
}

/** 온음계의 음만 쓰는 판본들: 으뜸음에서 ↑ 로 한 음씩 올라가면 조표가 알아서 변화음을 만든다 */
const DIATONIC: Row[] = [
  {
    questId: NATURAL,
    variantId: 'a-minor',
    shelf: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    hand: 'A3',
    count: 8,
    keySignature: 0,
    names: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'],
    midi: [57, 59, 60, 62, 64, 65, 67, 69],
  },
  {
    questId: NATURAL,
    variantId: 'd-minor',
    shelf: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'],
    hand: 'D4',
    count: 8,
    keySignature: -1,
    names: ['D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5'],
    midi: [62, 64, 65, 67, 69, 70, 72, 74],
  },
  {
    questId: NATURAL,
    variantId: 'e-minor',
    shelf: ['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'],
    hand: 'E4',
    count: 8,
    keySignature: 1,
    names: ['E4', 'F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'],
    midi: [64, 66, 67, 69, 71, 72, 74, 76],
  },
  {
    questId: MAJOR,
    variantId: 'g-major',
    shelf: ['F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'],
    hand: 'G4',
    count: 8,
    keySignature: 1,
    names: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5'],
    midi: [67, 69, 71, 72, 74, 76, 78, 79],
  },
  {
    questId: MAJOR,
    variantId: 'd-major',
    shelf: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'],
    hand: 'D4',
    count: 8,
    keySignature: 2,
    names: ['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5', 'D5'],
    midi: [62, 64, 66, 67, 69, 71, 73, 74],
  },
  {
    questId: MAJOR,
    variantId: 'bflat-major',
    shelf: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    hand: 'B♭3',
    count: 8,
    keySignature: -2,
    names: ['B♭3', 'C4', 'D4', 'E♭4', 'F4', 'G4', 'A4', 'B♭4'],
    midi: [58, 60, 62, 63, 65, 67, 69, 70],
  },
];

/** 임시표나 건너뛰는 음이 있는 판본: 정답을 놓는 방법이 따로 있다 */
const SPECIAL: Row[] = [
  {
    questId: HARMONIC,
    variantId: 'a-harmonic-minor',
    shelf: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    hand: 'A3',
    count: 8,
    keySignature: 0,
    names: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G♯4', 'A4'],
    midi: [57, 59, 60, 62, 64, 65, 68, 69],
  },
  {
    questId: PENTA,
    variantId: 'c-pentatonic',
    shelf: ['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'],
    hand: 'C4',
    count: 6,
    keySignature: 0,
    names: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
    midi: [60, 62, 64, 67, 69, 72],
  },
];
const ALL = [...DIATONIC, ...SPECIAL];
const open = (r: Rig, row: Row): void => void r.controller.open(row.questId, row.variantId);

/** 임시표가 필요한 판본의 정답을 키보드로 놓는다: 화성단음계는 일곱째에 ♯, 다섯 음 음계는 F와 B를 건너뛴다 */
function typeAnswer(r: Rig, row: Row): void {
  if (row.variantId === 'a-harmonic-minor') {
    typeScale(r, 8);
    r.bench.selectSlot(7);
    r.bench.pickShelf(7); // G4
    r.bench.perform('accidental-up'); // G♯4
    r.bench.perform('place');
    return;
  }
  if (row.variantId === 'c-pentatonic') {
    [1, 2, 3, 5, 6, 8].forEach((shelfIndex, i) => {
      r.bench.selectSlot(i + 1);
      r.bench.pickShelf(shelfIndex);
      r.bench.perform('place');
    });
    return;
  }
  typeScale(r, row.count);
}

describe('열기: 선반, 손, 자리 수, 조표가 판본에서 나온다', () => {
  it.each(ALL.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s', (_key, row) => {
    const r = make();
    open(r, row);
    expect(r.bench.available).toBe(true);
    expect(r.bench.map.count).toBe(row.count);
    expect(r.bench.map.keySignature).toBe(row.keySignature);
    expect(r.bench.map.shelf.map((s) => s.name)).toEqual(row.shelf);
    expect(r.bench.map.tonicIndex).toBe(1);
    expect(r.bench.handName()).toBe(row.hand);
    expect(r.bench.cursor).toBeNull();
    expect(names(r)).toEqual(Array(row.count).fill(null));
  });

  it('조표가 있는 판본의 선반은 변화표 없이 고른 음에 조표가 알아서 붙는다: D단조의 B는 B♭, E단조의 F는 F♯', () => {
    const r = make();
    r.controller.open(NATURAL, 'd-minor');
    r.bench.pickShelf(6); // B4
    expect(r.bench.handName()).toBe('B♭4');
    r.controller.open(NATURAL, 'e-minor');
    r.bench.pickShelf(2); // F4
    expect(r.bench.handName()).toBe('F♯4');
    r.bench.pickAccidental('flat'); // 일부러 적은 ♭은 조표보다 앞선다
    expect(r.bench.handName()).toBe('F♭4');
  });

  it('도전이 바뀌면 손은 새 판본의 으뜸음으로 돌아온다', () => {
    const r = make();
    r.controller.open(NATURAL, 'a-minor');
    r.bench.pickShelf(7);
    expect(r.bench.handName()).toBe('G4');
    r.controller.open(NATURAL, 'd-minor');
    expect(r.bench.handName()).toBe('D4');
    r.controller.open(PENTA, 'c-pentatonic');
    expect(r.bench.handName()).toBe('C4');
    r.controller.open(MAJOR, 'bflat-major');
    expect(r.bench.handName()).toBe('B♭3');
  });
});

describe('키보드만으로 풀기(완료 기준 4-2와 같은 방식)', () => {
  it.each(ALL.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s: 정답을 놓고 확인하면 통과한다. 놓인 이름과 MIDI가 5.8의 표와 같다', (_key, row) => {
    const r = make();
    open(r, row);
    typeAnswer(r, row);
    expect(names(r)).toEqual(row.names);
    expect(midis(r)).toEqual(row.midi);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(true);
    expect(r.controller.feedback?.messages).toEqual([]);
    expect(r.controller.attempts.at(-1)).toMatchObject({ questId: row.questId, variantId: row.variantId, resultType: 'passed' });
    expect(r.bench.flagged()).toEqual([]);
  });

  it('→ 는 자리 수에서 멈춘다: 다섯 음 음계는 6번째가 마지막이다', () => {
    const r = make();
    r.controller.open(PENTA, 'c-pentatonic');
    for (let i = 0; i < 10; i++) r.bench.perform('cursor-right');
    expect(r.bench.cursor).toBe(6);
    expect(r.controller.live).toContain('마지막 자리예요');
  });

  it('손의 음은 으뜸음 한 음 아래(맨 아래)부터 옥타브 위 한 음(맨 위)까지 움직인다', () => {
    const r = make();
    r.controller.open(NATURAL, 'a-minor');
    r.bench.perform('hand-down');
    r.bench.perform('hand-down');
    expect(r.bench.handName()).toBe('G3');
    expect(r.controller.live).toContain('재료 선반의 맨 아래예요');
    for (let i = 0; i < 20; i++) r.bench.perform('hand-up');
    expect(r.bench.handName()).toBe('B4');
    expect(r.controller.live).toContain('재료 선반의 맨 위예요');
  });
});

describe('화성단음계(Q25): 일곱째 음의 ♯은 조표가 아니라 손으로 올려야 한다', () => {
  const row = SPECIAL[0]!;

  it('조표처럼 온음계로만 놓으면 일곱째 자리가 G로 놓여 틀리고, 그 자리에만 표식이 선다', () => {
    const r = make();
    open(r, row);
    typeScale(r, 8);
    expect(names(r)).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(false);
    expect(r.controller.feedback?.messages).toEqual(['일곱 번째 자리: 지금은 G4예요. 목표는 G♯4예요.']);
    expect(r.bench.flagged()).toEqual([7]);
  });

  it('일곱째 자리에 G를 고르고 Shift+↑ 로 ♯을 붙여 놓으면 고쳐진다. 초안에는 올림표가 적힌 음으로 저장된다', () => {
    const r = make();
    open(r, row);
    typeAnswer(r, row);
    expect(r.bench.handName()).toBe('G♯4');
    expect(r.session.contentOf(HARMONIC, 'a-harmonic-minor').slots.find((s) => s.slot === 7)).toEqual({ slot: 7, writtenPitch: { letter: 'G', accidental: 'sharp', octave: 4 } });
    expect(r.session.contentOf(HARMONIC, 'a-harmonic-minor').slots.find((s) => s.slot === 6)).toEqual({ slot: 6, writtenPitch: { letter: 'F', accidental: null, octave: 4 } });
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(true);
  });

  it('고치기 전에는 표식이 있다가 고치면 사라진다(놓은 것이 바뀌면 이전 판정은 맞지 않는다)', () => {
    const r = make();
    open(r, row);
    typeScale(r, 8);
    r.bench.perform('check');
    expect(r.bench.flagged()).toEqual([7]);
    r.bench.selectSlot(7);
    r.bench.pickShelf(7);
    r.bench.perform('accidental-up');
    r.bench.perform('place');
    expect(r.bench.flagged()).toEqual([]);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(true);
  });

  it('G♯ 대신 A♭을 놓으면 같은 소리지만 G 이름을 써야 한다고 말한다', () => {
    const r = make();
    open(r, row);
    typeScale(r, 8);
    r.bench.selectSlot(7);
    r.bench.pickShelf(8); // A4
    r.bench.perform('accidental-down'); // A♭4
    r.bench.perform('place');
    expect(names(r)[6]).toBe('A♭4');
    r.bench.perform('check');
    expect(r.controller.feedback?.messages).toEqual(['일곱 번째 자리는 G 이름을 써요. A단조에서는 G♯4예요. 소리 높이는 같아요.']);
    expect(r.bench.flagged()).toEqual([7]);
  });

  it('같은 A단조의 자연단음계(Q24)와 한 초안을 나누지 않는다: 판본마다 초안이 따로 있다', () => {
    const r = make();
    r.controller.open(NATURAL, 'a-minor');
    typeScale(r, 8);
    open(r, row);
    expect(names(r)).toEqual(Array(8).fill(null));
    r.bench.perform('place');
    r.controller.open(NATURAL, 'a-minor');
    expect(names(r)).toEqual(['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
  });
});

describe('다섯 음 음계(Q26): 6자리, F와 B를 건너뛴다', () => {
  const row = SPECIAL[1]!;

  it('온음계로 한 음씩 올라가면 넷째 자리부터 어긋난다: F, G, A가 놓여 세 자리가 틀린다', () => {
    const r = make();
    open(r, row);
    typeScale(r, 6);
    expect(names(r)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(false);
    expect(r.controller.feedback?.messages).toEqual([
      '네 번째 자리: 지금은 F4예요. 목표는 G4예요.',
      '다섯 번째 자리: 지금은 G4예요. 목표는 A4예요.',
      '여섯 번째 자리: 지금은 A4예요. 목표는 C5예요.',
    ]);
    expect(r.bench.flagged()).toEqual([4, 5, 6]);
  });

  it('F와 B를 건너뛰고 C D E G A C를 놓으면 통과한다. 목표 악보의 쉼표 두 박은 자리가 아니다', () => {
    const r = make();
    open(r, row);
    typeAnswer(r, row);
    expect(r.bench.map.count).toBe(6);
    expect(names(r)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4', 'C5']);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(true);
  });

  it('마지막 칸에 B4를 놓으면 C5가 목표라고 알려 준다', () => {
    const r = make();
    open(r, row);
    typeAnswer(r, row);
    r.bench.selectSlot(6);
    r.bench.pickShelf(7); // B4
    r.bench.perform('place');
    r.bench.perform('check');
    expect(r.controller.feedback?.messages).toEqual(['여섯 번째 자리: 지금은 B4예요. 목표는 C5예요.']);
    expect(r.bench.flagged()).toEqual([6]);
  });

  it('일곱 번째 자리는 없다: 눌러도 아무 일이 없고 선택도 되지 않는다', () => {
    const r = make();
    open(r, row);
    r.bench.press(7);
    r.bench.selectSlot(7);
    expect(r.bench.cursor).toBeNull();
    expect(r.session.contentOf(PENTA, 'c-pentatonic').slots).toEqual([]);
  });
});

describe('눌러서 놓기는 키보드와 같은 초안을 만든다(W-4: 끌지 않고도 된다)', () => {
  it.each(DIATONIC.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s', (_key, row) => {
    const byKeys = make();
    open(byKeys, row);
    typeScale(byKeys, row.count);
    const byPress = make();
    open(byPress, row);
    for (let i = 0; i < row.count; i++) {
      byPress.bench.pickShelf(1 + i);
      byPress.bench.press(i + 1);
    }
    expect(names(byPress)).toEqual(row.names);
    expect(byPress.session.contentOf(row.questId, row.variantId).slots).toEqual(byKeys.session.contentOf(row.questId, row.variantId).slots);
    byPress.bench.perform('check');
    expect(byPress.controller.feedback?.passed).toBe(true);
  });
});

describe('듣기: 목표 듣기와 내 배치 듣기', () => {
  it.each(ALL.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s: 목표 듣기는 5.8의 소리 높이를 4분음표 80으로 차례로 들려 준다', async (_key, row) => {
    const r = make();
    open(r, row);
    await r.controller.enableSound();
    r.engine.sinks.get('task')?.requests.splice(0);
    r.bench.perform('hear-target');
    expect(r.controller.playing).toBe('target');
    r.run(8);
    const live = r.engine.sinks.get('task')!.live();
    expect(live.map((q) => q.midi)).toEqual(row.midi);
    // 4분음표 하나는 0.75초(80 BPM)
    expect(live[1]!.time - live[0]!.time).toBeCloseTo(0.75, 2);
    expect(live[0]!.duration).toBeCloseTo(0.75, 2);
    expect(r.controller.playing).toBeNull();
  });

  it.each(ALL.map((row) => [`${row.questId}/${row.variantId}`, row] as const))('%s: 정답을 놓은 뒤 내 배치 듣기는 목표와 같은 소리다', async (_key, row) => {
    const r = make();
    open(r, row);
    typeAnswer(r, row);
    await r.controller.enableSound();
    r.engine.sinks.get('task')?.requests.splice(0);
    r.bench.perform('hear-mine');
    expect(r.controller.playing).toBe('mine');
    r.run(8);
    expect(r.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual(row.midi);
    expect(r.controller.playing).toBeNull();
  });

  it('다섯 음 음계의 목표 듣기는 6음만 울린다(악보의 쉼표 두 박은 소리가 없다). 내 배치 듣기도 6자리 4.5초에서 끝난다', async () => {
    const r = make();
    r.controller.open(PENTA, 'c-pentatonic');
    typeAnswer(r, SPECIAL[1]!);
    await r.controller.enableSound();
    r.engine.sinks.get('task')?.requests.splice(0);
    r.bench.perform('hear-mine');
    r.run(4);
    expect(r.controller.playing).toBe('mine'); // 6자리 × 0.75초 = 4.5초
    r.run(1);
    expect(r.controller.playing).toBeNull();
    expect(r.engine.sinks.get('task')!.live()).toHaveLength(6);
  });

  it('소리를 켜기 전에는 소리가 나지 않지만 재생 위치는 움직인다(W-8, W-11)', () => {
    const r = make();
    r.controller.open(NATURAL, 'd-minor');
    typeScale(r, 8);
    r.bench.perform('hear-mine');
    expect(r.engine.startCalls).toBe(0);
    expect(r.engine.sinks.size).toBe(0);
    expect(r.controller.playing).toBe('mine');
    r.run(7);
    expect(r.controller.playing).toBeNull();
  });
});
