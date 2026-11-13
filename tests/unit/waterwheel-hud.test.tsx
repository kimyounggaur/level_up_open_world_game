// @vitest-environment jsdom
// 6-6 물레방아(T3, 4.5)의 작업대: 같은 징검다리 작업대에 말만 다르다 — '돌'이 아니라 '못', '남은 물'이 아니라 '빈 구멍'.
// 컨트롤러, 작업대, 화면(TimelineHud)만으로 확인한다(월드는 쓰지 않는다). 징검다리(E1–E3)의 말이 그대로인지도 함께 본다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { FREE_IDLE_TEXT } from '@/ui/challenge/slotText';
import { STONE_PASSED_TEXT, handLabelOf, kindNamesOf, noNotesNoticeOf, passedTextOf, stoneIdleLead } from '@/ui/challenge/stoneText';
import { TIMELINE_KEY_TABLE, timelineKeyTableOf } from '@/ui/challenge/timelineKeys';
import { STONE_VOCAB, WHEEL_VOCAB, vocabOf } from '@/ui/timeline/vocab';
import { TimelineHud } from '@/ui/installation/TimelineHud';
import { InstallationController } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q19 = 'rhythm.six-eight';
const WHEEL = 'inst.beat-river.waterwheel';
const FORD1 = 'inst.beat-river.first-ford';
const KEY1 = `${Q19}/dotted-quarter-and-eighths`;
const KEY2 = `${Q19}/quarters-and-eighths`;

beforeAll(() => setupDom());

const originalRect = Element.prototype.getBoundingClientRect;
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  Element.prototype.getBoundingClientRect = originalRect;
});

interface BootOptions extends RigOptions {
  key?: string;
  station?: 'E1' | 'E4';
}

function boot(opts: BootOptions = {}) {
  const { key, station, ...rigOptions } = opts;
  const r = rig({ definitions: [quest(Q19), quest('rhythm.rest-in-a-bar')], ...rigOptions });
  const bridge = new WorldBridge({ x: 6450, y: 2300, facing: 'left' });
  const wheel = installation(WHEEL);
  const ford = installation(FORD1);
  const inst = station === 'E1' ? ford : wheel;
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [wheel, ford],
    panels: new Set(['panel.rhythm']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  ic.setNavigator(() => undefined);
  act(() => void ic.enter(station ?? 'E4'));
  if (key) act(() => void ic.select(key));
  const bench = ic.timelineOf(inst)!;
  const m = mount(<TimelineHud bridge={bridge} controller={r.controller} bench={bench} installation={ic} onNavigate={() => undefined} touchOnly={false} />);
  cleanups.push(() => {
    m.unmount();
    ic.dispose();
    r.bench.dispose();
    r.controller.dispose();
  });
  const hud = (): HTMLElement | null => q(m.host, '[data-installation-hud]');
  const action = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-action="${name}"]`)!;
  const kind = (k: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-kind="${k}"]`)!;
  const length = (value: string, dotted = false): HTMLButtonElement | null => q<HTMLButtonElement>(m.host, `[data-value="${value}"]${dotted ? '[data-dotted="true"]' : ':not([data-dotted])'}`);
  const water = (): HTMLElement => q(m.host, '.inst-water')!;
  return { ...r, bridge, inst, ic, bench, m, host: m.host, hud, action, kind, length, water };
}

type T = ReturnType<typeof boot>;
const live = (t: T): string => text(q(t.host, '[data-live]'));
const hand = (t: T): string => text(q(t.host, '.inst-hand'));
const stones = (t: T): string[] =>
  [...t.controller.content().events]
    .sort((a, b) => a.onsetTicks - b.onsetTicks)
    .map((e) => `${e.type === 'note' ? 'N' : 'R'} ${e.onsetTicks}+${e.durationTicks}`);

describe('말: 물레방아는 못과 빈 구멍, 징검다리는 돌과 남은 물', () => {
  it('낱말 묶음: 물레방아의 설치물은 wheel 묶음, 징검다리는 stones 묶음이다', () => {
    expect(vocabOf(installation(WHEEL))).toBe(WHEEL_VOCAB);
    expect(vocabOf(installation(FORD1))).toBe(STONE_VOCAB);
    expect(WHEEL_VOCAB).toMatchObject({ id: 'wheel', note: '울림 못', rest: '이끼 못', piece: '못', withPiece: '못으로', water: { empty: '빈 구멍', piece: '못' } });
    expect(STONE_VOCAB).toMatchObject({ id: 'stones', note: '울림돌', rest: '이끼돌', piece: '돌', withPiece: '돌로', water: { empty: '남은 물', piece: '돌' } });
  });

  it('문장은 낱말만 바뀐다: 같은 틀에 못 또는 돌이 들어간다', () => {
    expect(noNotesNoticeOf(WHEEL_VOCAB)).toBe('아직 놓은 울림 못이 없어요. 울림 못을 골라 칸에 놓아 보세요.');
    expect(passedTextOf(WHEEL_VOCAB)).toBe('못이 한 마디를 빈틈없이 채웠고 목표와 같아요.');
    expect(stoneIdleLead(0, 2880, WHEEL_VOCAB)).toBe("못으로 한 마디를 빈틈없이 채우고 '배치 확인'을 눌러 보세요.");
    expect(stoneIdleLead(2880, 2880, WHEEL_VOCAB)).toBe("한 마디를 다 채웠어요. '배치 확인'을 눌러 보세요.");
    expect(kindNamesOf(WHEEL_VOCAB).erase.sub).toBe('못을 치워요');
    // 기본값은 징검다리의 말이다(E1–E3의 문장은 그대로)
    expect(noNotesNoticeOf()).toBe('아직 놓은 울림돌이 없어요. 울림돌을 골라 칸에 놓아 보세요.');
    expect(passedTextOf()).toBe(STONE_PASSED_TEXT);
    expect(stoneIdleLead(0, 3840)).toBe("돌로 한 마디를 빈틈없이 채우고 '배치 확인'을 눌러 보세요.");
  });

  it('키 안내표의 낱말도 바뀐다. 키는 같다', () => {
    const wheel = timelineKeyTableOf(WHEEL_VOCAB);
    expect(wheel.map((r) => r.keys)).toEqual(TIMELINE_KEY_TABLE.map((r) => r.keys));
    expect(wheel.map((r) => r.label).join(' ')).toContain('못');
    expect(wheel.map((r) => r.label).join(' ')).not.toContain('돌');
    expect(TIMELINE_KEY_TABLE.map((r) => r.label).join(' ')).not.toContain('못');
  });

  it('손에 든 것의 이름', () => {
    const tool = { kind: 'note', pitch: { letter: 'C', alter: 0, octave: 4 }, value: 'eighth', dotted: false } as never;
    expect(handLabelOf(tool, WHEEL_VOCAB)).toBe('울림 못 C4 8분음표');
    expect(handLabelOf(tool, STONE_VOCAB)).toBe('울림돌 C4 8분음표');
  });
});

describe('들어가면 물레방아 작업대가 나타난다', () => {
  it('작업대 이름은 물레방아이고, 들어왔다는 알림이 못으로 말한다', () => {
    const t = boot();
    expect(t.hud()!.getAttribute('aria-label')).toBe('물레방아 작업대');
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(WHEEL);
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    expect(live(t)).toContain('물레방아에 들어왔어요');
    expect(live(t)).toContain('Enter로 못을 놓아요');
    expect(live(t)).toContain('못 길이는 Shift+↑↓');
    expect(live(t)).toContain('울림 못과 이끼 못은 R로');
    expect(live(t)).not.toContain('돌');
    // 바퀴는 박을 따라가지 않는다(PageUp, PageDown 안내가 없다)
    expect(live(t)).not.toContain('PageUp');
  });

  it('재료 선반: 울림 못, 이끼 못, 비우기. 선반의 이름도 못이다', () => {
    const t = boot();
    expect(q(t.host, '.inst-shelf')!.getAttribute('aria-label')).toBe('재료 선반: 못의 종류와 길이');
    expect(text(t.kind('note'))).toContain('울림 못');
    expect(text(t.kind('rest'))).toContain('이끼 못');
    expect(t.kind('raft')).toBeNull();
    expect(t.kind('erase')).not.toBeNull();
  });

  it('길이 단추는 세 개뿐이다: 8분음표, 4분음표, 점4분음표. 2분음표와 점2분음표는 없다(못은 세 칸까지)', () => {
    const t = boot();
    expect(qa(t.host, '[data-value]').map((b) => text(b))).toEqual(['8분음표', '4분음표', '점4분음표']);
    expect(t.length('half')).toBeNull();
    expect(t.length('half', true)).toBeNull();
    expect(t.length('quarter', true)).not.toBeNull();
  });

  it('징검다리(E1)는 그대로다: 돌의 말과 2분음표까지의 단추가 있다', () => {
    const t = boot({ station: 'E1' });
    expect(t.hud()!.getAttribute('aria-label')).toBe('첫 징검다리 작업대');
    expect(q(t.host, '.inst-shelf')!.getAttribute('aria-label')).toBe('재료 선반: 돌의 종류와 길이');
    expect(text(t.kind('note'))).toContain('울림돌');
    expect(t.length('half')).not.toBeNull();
    expect(live(t)).toContain('Enter로 돌을 놓아요');
  });

  it('자유로 놀기의 빈 마디: 빈 구멍 한 줄과 손에 든 것의 이름이 못으로 나온다', () => {
    const t = boot();
    expect(text(t.water())).toContain('빈 구멍은 1박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    expect(hand(t)).toContain('울림 못 C4 8분음표');
    expect(hand(t)).toContain('칸을 고르세요');
    expect(text(q(t.host, '.feedback-idle'))).toBe(FREE_IDLE_TEXT);
  });
});

describe('못을 놓는다', () => {
  it('점4분 못을 들고 놓으면 세 칸(1440틱)을 덮는다. 빈 구멍 줄이 줄어든다', () => {
    const t = boot();
    click(t.length('quarter', true)!);
    expect(hand(t)).toContain('울림 못 C4 점4분음표');
    act(() => t.bench.place(0));
    expect(stones(t)).toEqual(['N 0+1440']);
    expect(text(t.water())).toContain('빈 구멍은 2박부터 마디 끝까지 1440틱(점4분음표 하나 길이)이에요.');
    // 놓았다는 알림은 칸의 이름(박)과 음표 이름으로 말하고, 남은 자리는 빈 구멍으로 말한다(돌이라는 말은 나오지 않는다)
    expect(live(t)).toContain('1박에 C4 점4분음표를 놓았어요.');
    expect(live(t)).toContain('빈 구멍은 2박부터');
    expect(live(t)).not.toContain('돌');
  });

  it('이끼 못은 \'이끼 못 4분쉼표\'로 불린다', () => {
    const t = boot();
    click(t.kind('rest'));
    expect(hand(t)).toContain('이끼 못');
    act(() => t.bench.place(0));
    expect(stones(t)).toEqual(['R 0+480']);
  });

  it('줄의 한도를 넘는 길이는 손에 들 수 없다: 2분음표를 고르라는 요청은 안내만 하고 손은 그대로다', () => {
    const t = boot();
    const before = hand(t);
    act(() => t.bench.pickLength('half', false));
    expect(hand(t)).toBe(before);
    expect(live(t)).toBe('못은 점4분음표까지만 들 수 있어요. 손에 든 것은 울림 못 C4 8분음표예요.');
    act(() => t.bench.pickLength('half', true));
    expect(hand(t)).toBe(before);
    // 한도 안의 길이는 든다
    act(() => t.bench.pickLength('quarter', true));
    expect(hand(t)).toContain('점4분음표');
  });

  it('Shift+↑로 늘려 가면 점4분음표에서 멈춘다(그 위는 없다)', () => {
    const t = boot();
    act(() => t.bench.shiftLength(1));
    act(() => t.bench.shiftLength(1));
    expect(hand(t)).toContain('울림 못 C4 점4분음표');
    act(() => t.bench.shiftLength(1));
    expect(hand(t)).toContain('점4분음표');
    expect(live(t)).toContain('가장 긴 못이에요.');
  });

  it('E1의 돌은 한도가 없다: 2분음표를 든다', () => {
    const t = boot({ station: 'E1' });
    act(() => t.bench.pickLength('half', false));
    expect(hand(t)).toContain('울림돌 C4 2분음표');
  });
});

describe('Q19 두 판본을 못으로 채우고 확인하면 통과한다', () => {
  it('점4분 + 8분 셋(C4 D4 E4 F4)', () => {
    const t = boot({ key: KEY1 });
    expect(t.bench.free).toBe(false);
    expect(t.bench.spec).toMatchObject({ measureTicks: 2880, beatTicks: 1440, cellTicks: 480 });
    act(() => t.bench.pickLength('quarter', true));
    act(() => t.bench.place(0));
    act(() => t.bench.pickLength('eighth', false));
    for (const tick of [1440, 1920, 2400]) {
      act(() => t.bench.moveHand(1));
      act(() => t.bench.place(tick));
    }
    expect(stones(t)).toEqual(['N 0+1440', 'N 1440+480', 'N 1920+480', 'N 2400+480']);
    expect(text(t.water())).toContain('빈 구멍이 없어요. 못이 한 마디를 빈틈없이 채웠어요.');
    act(() => void t.bench.perform('check'));
    expect(t.controller.feedback?.passed).toBe(true);
    expect(text(q(t.host, '.inst-feedback'))).toContain('통과했어요.');
    expect(text(q(t.host, '.inst-feedback'))).toContain('못이 한 마디를 빈틈없이 채웠고 목표와 같아요.');
  });

  it('4분 + 8분 + 4분 + 8분(C4 D4 E4 D4)', () => {
    const t = boot({ key: KEY2 });
    // 8분 칸은 480틱이고 점4분 단추는 없다(이 판본에는 점음표가 없다)
    expect(t.length('quarter', true)).toBeNull();
    act(() => t.bench.pickLength('quarter', false));
    act(() => t.bench.place(0));
    act(() => t.bench.pickLength('eighth', false));
    act(() => t.bench.moveHand(1));
    act(() => t.bench.place(960));
    act(() => t.bench.pickLength('quarter', false));
    act(() => t.bench.moveHand(1));
    act(() => t.bench.place(1440));
    act(() => t.bench.pickLength('eighth', false));
    act(() => t.bench.moveHand(-1));
    act(() => t.bench.place(2400));
    expect(stones(t)).toEqual(['N 0+960', 'N 960+480', 'N 1440+960', 'N 2400+480']);
    act(() => void t.bench.perform('check'));
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('길이만 맞고 음이 목표와 다르면 통과하지 않고, 틀린 칸의 목표 음을 알려 준다(Q19는 음높이도 본다)', () => {
    const t = boot({ key: KEY1 });
    act(() => t.bench.pickLength('quarter', true));
    act(() => t.bench.place(0));
    act(() => t.bench.pickLength('eighth', false));
    // 음을 올리지 않고 C4만 놓는다: 길이(점4분 + 8분 셋)는 목표와 같다
    for (const tick of [1440, 1920, 2400]) act(() => t.bench.place(tick));
    expect(stones(t)).toEqual(['N 0+1440', 'N 1440+480', 'N 1920+480', 'N 2400+480']);
    act(() => void t.bench.perform('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    const said = text(q(t.host, '.inst-feedback'));
    expect(said).toContain('네 번째 8분음표 자리: 목표는 D4예요. 지금은 C4예요.');
    expect(said).toContain('다섯 번째 8분음표 자리: 목표는 E4예요.');
    expect(said).toContain('여섯 번째 8분음표 자리: 목표는 F4예요.');
  });

  it('마디를 덜 채우고 확인하면 빈 구멍 줄이 강조되고 같은 문장에 기호가 붙는다', () => {
    const t = boot({ key: KEY1 });
    act(() => t.bench.pickLength('quarter', true));
    act(() => t.bench.place(0));
    act(() => void t.bench.perform('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.water().getAttribute('data-emphasis')).toBe('true');
    expect(t.water().querySelector('strong')).not.toBeNull();
    expect(text(t.water())).toContain('빈 구멍은 2박부터 마디 끝까지 1440틱');
  });

  it('틀린 칸의 설명은 6/8의 박으로 말한다(8분음표 자리)', () => {
    const t = boot({ key: KEY1 });
    act(() => t.bench.pickLength('eighth', false));
    // 정답은 점4분음표로 시작하는데 8분음표 셋으로 시작해 본다
    for (const tick of [0, 480, 960]) {
      act(() => t.bench.place(tick));
      act(() => t.bench.moveHand(1));
    }
    act(() => void t.bench.perform('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    const said = text(q(t.host, '.inst-feedback'));
    expect(said).toMatch(/번째 8분음표 자리|박/);
  });
});

describe('도움 카드', () => {
  it('못의 말로 쓰여 있다: 칸을 눌러도 손에 든 못이 놓인다', () => {
    const t = boot();
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(text(card)).toContain('키보드로 놓기');
    expect(text(card)).toContain('칸을 눌러도 손에 든 못이 놓여요. 못은 칸에 맞춰 놓이고, 다른 못과 겹치면 놓이지 않고 이유를 알려 줘요.');
    expect(qa(card, 'kbd').map((k) => text(k))).toEqual(timelineKeyTableOf(WHEEL_VOCAB).map((r) => r.keys));
  });
});

describe('11.2의 6: 도움을 쓰는 동안 통과는 없다', () => {
  it.each([KEY1, KEY2])('%s: 도움 카드를 열고 닫고, 목표와 내 배치를 들어도 기록되는 시도는 없고 작업대에서 그대로 이어진다', (key) => {
    const t = boot({ key });
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).not.toBeNull();
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    click(t.action('place'));
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    click(t.action('stop'));
    expect(t.controller.playing).toBeNull();
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
    // 도움과 듣기는 판정을 부르지 않는다: 시도도 설명도 없고, 작업대는 그대로 열려 있다
    expect(t.controller.attempts).toHaveLength(0);
    expect(t.controller.feedback).toBeNull();
    expect(q(t.host, '[data-installation-hud]')).not.toBeNull();
  });
});
