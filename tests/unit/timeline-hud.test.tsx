// @vitest-environment jsdom
// 6-4 징검다리(T2, 4.4)의 화면: 표지판, 재료 선반(돌의 종류, 길이, 음높이), 남은 물 한 줄, 조작 막대, 도움 카드, 확인 결과, 키보드. 끌지 않아도 모두 된다(W-4).
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 징검다리 작업대만으로 화면이 하는 일을 확인한다. 월드 그림은 timeline-layer와 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { FREE_IDLE_TEXT } from '@/ui/challenge/slotText';
import { NO_STONE_NOTES_NOTICE, STONE_PASSED_TEXT, stoneIdleLead } from '@/ui/challenge/stoneText';
import { TIMELINE_KEY_TABLE } from '@/ui/challenge/timelineKeys';
import { TimelineHud } from '@/ui/installation/TimelineHud';
import { FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { Q02, installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q13 = 'rhythm.three-four';
const Q14 = 'rhythm.note-values';
const Q15 = 'rhythm.dotted';
const Q16 = 'rhythm.rest-lengths';
const FORD1 = 'inst.beat-river.first-ford';
const REST_KEY = `${Q02}/quarter-rest`;
const THREE_KEY = `${Q13}/three-quarters`;
const EIGHTH_REST_KEY = `${Q16}/eighth-rest-mix`;
const LONG_SHORT_KEY = `${Q14}/half-quarter-eighths`;
const DOTTED_KEY = `${Q15}/dotted-half`;

/** 아이콘은 이름을 달고 있지 않아 그림의 선 모양으로 가린다: 경고(삼각형)와 발자국 */
const ALERT_PATH = 'M12 7v6m0 4h.01M12 3 2.5 20h19z';
const FOOTSTEPS_PATH_START = 'M8 4c1.7';

beforeAll(() => setupDom());

const originalRect = Element.prototype.getBoundingClientRect;
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  Element.prototype.getBoundingClientRect = originalRect;
});

interface BootOptions extends RigOptions {
  enter?: boolean;
  touchOnly?: boolean;
  inert?: boolean;
  /** 들어간 뒤 표지판에서 고를 것(없으면 자유로 놀기) */
  key?: string;
  /** 들어갈 정거장. 기본은 E1 */
  station?: 'E1' | 'E2';
}

function boot(opts: BootOptions = {}) {
  const { enter, touchOnly, inert, key, station, ...rigOptions } = opts;
  const r = rig({ definitions: [Q02, Q13, Q16, Q14, Q15].map(quest), ...rigOptions });
  const bridge = new WorldBridge({ x: 6700, y: 2800, facing: 'right' });
  const first = installation(FORD1);
  const second = installation('inst.beat-river.long-short');
  const inst = station === 'E2' ? second : first;
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [first, second],
    panels: new Set(['panel.rhythm']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  const navigations: string[] = [];
  ic.setNavigator((hash) => void navigations.push(hash));
  if (enter !== false) {
    act(() => void ic.enter(station ?? 'E1'));
    if (key) act(() => void ic.select(key));
  }
  const bench = ic.timelineOf(inst)!;
  const m = mount(
    <TimelineHud
      bridge={bridge}
      controller={r.controller}
      bench={bench}
      installation={ic}
      onNavigate={(hash) => navigations.push(hash)}
      touchOnly={touchOnly ?? false}
      {...(inert ? { inert: true } : {})}
    />,
  );
  cleanups.push(() => {
    m.unmount();
    ic.dispose();
    r.bench.dispose();
    r.controller.dispose();
  });
  const hud = (): HTMLElement | null => q(m.host, '[data-installation-hud]');
  const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    act(() => void target.dispatchEvent(ev));
    return ev;
  };
  const action = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-action="${name}"]`)!;
  const kind = (k: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-kind="${k}"]`)!;
  const length = (value: string, dotted = false): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-value="${value}"]${dotted ? '[data-dotted="true"]' : ':not([data-dotted])'}`)!;
  const pitch = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-pitch="${name}"]`)!;
  const water = (): HTMLElement => q(m.host, '.inst-water')!;
  const stones = (): string[] =>
    [...r.controller.content().events]
      .sort((a, b) => a.onsetTicks - b.onsetTicks)
      .map((e) => `${e.type === 'note' ? 'N' : 'R'} ${e.onsetTicks}+${e.durationTicks}`);
  return { ...r, bridge, inst, ic, bench, m, host: m.host, navigations, hud, press, action, kind, length, pitch, water, stones };
}

type T = ReturnType<typeof boot>;
const live = (t: T): string => text(q(t.host, '[data-live]'));
/** 손에 든 것과 고른 칸을 보이는 줄 */
const hand = (t: T): string => text(q(t.host, '.inst-hand'));

describe('들어가면 징검다리 작업대가 나타난다', () => {
  it('모드 밖에서는 아무것도 그리지 않는다. 들어가면 나타나고, 나오면 사라진다', () => {
    const t = boot({ enter: false });
    expect(t.hud()).toBeNull();
    act(() => void t.ic.enter('E1'));
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe('첫 징검다리 작업대');
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(FORD1);
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    act(() => t.ic.exit());
    expect(t.hud()).toBeNull();
  });

  it('조작 막대의 모든 동작이 단추로 있다(끌지 않아도 모두 된다)', () => {
    const t = boot();
    expect(qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'))).toEqual([
      'cursor-left',
      'cursor-right',
      'place',
      'remove',
      'undo',
      'redo',
      'hear-mine',
      'hear-target',
      'stop',
      'check',
      'view-panel',
      'help',
      'exit',
    ]);
    expect(qa(t.host, '[draggable]')).toHaveLength(0);
  });

  it('단추는 모두 이름을 달고 있고, 조작 막대 단추는 키 안내(aria-keyshortcuts)를 갖는다', () => {
    const t = boot();
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(b.getAttribute('aria-keyshortcuts'), b.outerHTML).toBeTruthy();
      expect(b.type).toBe('button');
    }
    for (const b of qa<HTMLButtonElement>(t.host, '.inst-material')) {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-pressed'), b.outerHTML).not.toBeNull();
      expect(text(b), b.outerHTML).not.toBe('');
    }
  });

  it('단추의 이름은 보이는 글자를 포함한다(보이는 이름이 곧 접근 이름)', () => {
    const t = boot();
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      const visible = text(q(b, '.inst-btn-label'));
      expect(b.getAttribute('aria-label')!.includes(visible), `${b.getAttribute('aria-label')} ⊇ ${visible}`).toBe(true);
    }
  });

  it('눈에 보이지 않는 알림 칸이 컨트롤러의 알림을 그대로 읽어 준다', () => {
    const t = boot();
    const region = q(t.host, '[data-live]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(text(region)).toContain('첫 징검다리에 들어왔어요');
    click(t.action('cursor-right'));
    expect(live(t)).toBe('1박, 비어 있어요.');
  });

  it('inert가 켜져 있으면(위에 안내 카드가 떠 있을 때) 단추가 눌리지 않는다', () => {
    expect(boot({ inert: true }).hud()!.hasAttribute('inert')).toBe(true);
    expect(boot().hud()!.hasAttribute('inert')).toBe(false);
  });

  it('키보드 안내 줄은 키보드가 있는 화면에만 있고, 터치 전용 화면에는 없다', () => {
    const hint = q(boot().host, '.inst-hint');
    expect(hint).not.toBeNull();
    expect(text(hint)).toContain('Shift+↑↓ 길이');
    expect(text(hint)).toContain('R 종류');
    expect(q(boot({ touchOnly: true }).host, '.inst-hint')).toBeNull();
  });
});

describe('재료 선반과 손에 든 돌', () => {
  it('자유로 놀기의 선반: 울림돌·이끼돌·비우기, 길이 여섯, 음 셋. 처음에는 울림돌 C4 8분음표를 들고 있다', () => {
    const t = boot();
    expect(qa(t.host, '[data-kind]').map((b) => b.getAttribute('data-kind'))).toEqual(['note', 'rest', 'erase']);
    expect(qa(t.host, '[data-kind]').map((b) => text(b))).toEqual(['울림돌', '이끼돌', '비우기']);
    expect(qa(t.host, '[data-value]').map((b) => `${b.getAttribute('data-value')}${b.getAttribute('data-dotted') ? '*' : ''}`)).toEqual(['eighth', 'quarter', 'quarter*', 'half', 'half*', 'whole']);
    expect(qa(t.host, '[data-value]').map((b) => text(b))).toEqual(['8분음표', '4분음표', '점4분음표', '2분음표', '점2분음표', '온음표']);
    expect(qa(t.host, '[data-pitch]').map((b) => b.getAttribute('data-pitch'))).toEqual(['C4', 'D4', 'E4']);
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 8분음표 · 칸을 고르세요');
    expect(q(t.host, '.inst-hand')!.getAttribute('data-hand')).toBe('울림돌 C4 8분음표');
    expect(t.kind('note').getAttribute('aria-pressed')).toBe('true');
    expect(t.kind('rest').getAttribute('aria-pressed')).toBe('false');
    expect(t.length('eighth').getAttribute('aria-pressed')).toBe('true');
    expect(t.pitch('C4').getAttribute('aria-pressed')).toBe('true');
    expect(t.pitch('D4').getAttribute('aria-pressed')).toBe('false');
  });

  it('과제 판본의 선반은 그 판본이 정한 것만 있다: 4분음표가 가장 짧은 과제는 길이 하나', () => {
    const t = boot({ key: REST_KEY });
    expect(qa(t.host, '[data-value]').map((b) => b.getAttribute('data-value'))).toEqual(['quarter']);
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 4분음표 · 칸을 고르세요');
    expect(text(q(t.host, '.inst-sign-current'))).toContain('쉼이 있는 한 마디');
    expect(t.hud()!.getAttribute('data-target')).toBe(REST_KEY);
  });

  it('E2의 선반: 점이 붙은 돌 과제는 점2분음표를 고를 수 있고, 긴 돌 짧은 돌 과제는 G4 A4 B4다', () => {
    const t = boot({ station: 'E2', key: DOTTED_KEY });
    expect(qa(t.host, '[data-value]').map((b) => `${b.getAttribute('data-value')}${b.getAttribute('data-dotted') ? '*' : ''}`)).toEqual(['quarter', 'half', 'half*', 'whole']);
    click(t.length('half', true));
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 점2분음표 · 칸을 고르세요');
    act(() => void t.ic.select(LONG_SHORT_KEY));
    expect(qa(t.host, '[data-pitch]').map((b) => b.getAttribute('data-pitch'))).toEqual(['G4', 'A4', 'B4']);
    expect(hand(t)).toBe('손에 든 것 울림돌 G4 8분음표 · 칸을 고르세요');
  });

  it('종류 단추: 이끼돌을 들면 길이 단추의 이름이 쉼표 이름이 되고 음높이 단추는 눌리지 않는다', () => {
    const t = boot();
    click(t.kind('rest'));
    expect(hand(t)).toBe('손에 든 것 이끼돌 8분쉼표 · 칸을 고르세요');
    expect(t.kind('rest').getAttribute('aria-pressed')).toBe('true');
    expect(qa(t.host, '[data-value]').map((b) => text(b))).toEqual(['8분쉼표', '4분쉼표', '점4분쉼표', '2분쉼표', '점2분쉼표', '온쉼표']);
    expect(qa(t.host, '[data-pitch]')).toHaveLength(3);
    expect(qa<HTMLButtonElement>(t.host, '[data-pitch]').every((b) => b.disabled)).toBe(true);
    expect(qa(t.host, '[data-value]')).toHaveLength(6);
    expect(qa<HTMLButtonElement>(t.host, '[data-value]').every((b) => !b.disabled)).toBe(true);
    expect(live(t)).toBe('손에 든 것은 이끼돌 8분쉼표예요.');
  });

  it('비우기를 들면 길이와 음높이 단추가 모두 눌리지 않는다. 다시 울림돌을 고르면 돌아온다', () => {
    const t = boot();
    click(t.kind('erase'));
    expect(hand(t)).toBe('손에 든 것 비우기 · 칸을 고르세요');
    expect(qa(t.host, '[data-value], [data-pitch]')).toHaveLength(9);
    expect(qa<HTMLButtonElement>(t.host, '[data-value], [data-pitch]').every((b) => b.disabled)).toBe(true);
    expect(qa(t.host, '[data-value], [data-pitch]').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    click(t.kind('note'));
    expect(qa<HTMLButtonElement>(t.host, '[data-value], [data-pitch]').every((b) => !b.disabled)).toBe(true);
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 8분음표 · 칸을 고르세요');
  });

  it('길이 단추와 음높이 단추로 손에 든 돌을 바꾼다. 음을 고르면 그 음이 들린다', () => {
    const t = boot();
    click(t.length('quarter', true));
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 점4분음표 · 칸을 고르세요');
    expect(t.length('quarter', true).getAttribute('aria-pressed')).toBe('true');
    expect(t.length('eighth').getAttribute('aria-pressed')).toBe('false');
    click(t.pitch('E4'));
    expect(hand(t)).toBe('손에 든 것 울림돌 E4 점4분음표 · 칸을 고르세요');
    expect(t.pitch('E4').getAttribute('aria-pressed')).toBe('true');
    expect(t.pitch('C4').getAttribute('aria-pressed')).toBe('false');
  });

  it('도전을 바꾸면 손은 처음으로 돌아간다', () => {
    const t = boot({ key: REST_KEY });
    click(t.kind('rest'));
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('손에 든 것 이끼돌 4분쉼표 · 1박 칸');
    act(() => void t.ic.select(THREE_KEY));
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 4분음표 · 칸을 고르세요');
  });
});

describe('칸 고르기와 놓기(단추)', () => {
  it('→ ← 단추: 칸을 옮기고 고른 칸을 글로 알린다. 놓기 단추의 이름도 고른 칸을 말한다', () => {
    const t = boot({ key: REST_KEY });
    expect(t.action('place').getAttribute('aria-label')).toBe('첫 칸에 놓기');
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 4분음표 · 1박 칸');
    expect(t.action('place').getAttribute('aria-label')).toBe('1박 칸에 놓기');
    click(t.action('cursor-right'));
    expect(hand(t)).toContain('· 2박 칸');
    click(t.action('cursor-left'));
    expect(hand(t)).toContain('· 1박 칸');
  });

  it('칸의 이름이 이미 칸으로 끝나면 칸을 또 붙이지 않는다(8분음표 칸)', () => {
    const t = boot();
    click(t.action('cursor-right'));
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('손에 든 것 울림돌 C4 8분음표 · 1박 2번째 칸');
    expect(t.action('place').getAttribute('aria-label')).toBe('1박 2번째 칸에 놓기');
    expect(text(t.action('place'))).toContain('놓기');
  });

  it('놓기 단추: 고른 칸에 놓고 남은 물을 알린다. 고른 칸은 놓은 돌의 끝으로 간다', () => {
    const t = boot({ key: REST_KEY });
    click(t.action('place'));
    expect(t.stones()).toEqual(['N 0+960']);
    expect(live(t)).toBe('1박에 C4 4분음표를 놓았어요. 남은 물은 2박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    expect(hand(t)).toContain('· 2박 칸');
    expect(t.action('place').getAttribute('aria-label')).toBe('2박 칸에 놓기');
    click(t.pitch('D4'));
    click(t.action('place'));
    expect(t.stones()).toEqual(['N 0+960', 'N 960+960']);
  });

  it('빼기 단추는 고른 칸에 돌이 있을 때만 눌린다. 누르면 그 돌이 빠진다', () => {
    const t = boot({ key: REST_KEY });
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('cursor-right'));
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('place'));
    // 놓은 뒤 고른 칸은 2박이라 비어 있다
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('cursor-left'));
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(t.stones()).toEqual([]);
    expect(t.action('remove').disabled).toBe(true);
  });

  it('실행 취소와 다시 실행 단추는 할 수 있을 때만 눌린다', () => {
    const t = boot({ key: REST_KEY });
    expect(t.action('undo').disabled).toBe(true);
    expect(t.action('redo').disabled).toBe(true);
    click(t.action('place'));
    expect(t.action('undo').disabled).toBe(false);
    click(t.action('undo'));
    expect(t.stones()).toEqual([]);
    expect(t.action('redo').disabled).toBe(false);
    click(t.action('redo'));
    expect(t.stones()).toEqual(['N 0+960']);
  });

  it('겹치면 놓이지 않고 이유를 화면 낭독기가 읽는 알림으로 알린다', () => {
    const t = boot();
    click(t.length('half'));
    click(t.action('place'));
    click(t.length('quarter'));
    click(t.action('cursor-right'));
    act(() => void t.bench.selectTick(960));
    click(t.action('place'));
    expect(t.stones()).toEqual(['N 0+1920']);
    expect(live(t)).toContain('겹쳐요');
    expect(live(t)).toContain('겹친 것을 먼저 비워 주세요');
  });
});

describe('남은 물 한 줄', () => {
  it('아무것도 놓지 않아도 문장으로 보인다. 기호는 발자국이고 강조는 없다', () => {
    const t = boot({ key: REST_KEY });
    const w = t.water();
    expect(text(w)).toBe('남은 물은 1박부터 마디 끝까지 3840틱(온음표 하나 길이)이에요.');
    expect(w.getAttribute('data-water')).toBe('1');
    expect(w.classList.contains('is-emphasis')).toBe(false);
    expect(w.hasAttribute('data-emphasis')).toBe(false);
    expect(q(w, 'strong')).toBeNull();
    expect(q(w, 'svg path')!.getAttribute('d')!.startsWith(FOOTSTEPS_PATH_START)).toBe(true);
  });

  it('놓을 때마다 지금 초안의 사실로 바뀐다. 모두 채우면 물이 없다고 말한다', () => {
    const t = boot({ key: REST_KEY });
    click(t.action('place'));
    expect(text(t.water())).toBe('남은 물은 2박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    for (let i = 0; i < 3; i++) click(t.action('place'));
    expect(t.stones()).toHaveLength(4);
    expect(text(t.water())).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
    expect(t.water().getAttribute('data-water')).toBe('0');
  });

  it('확인하기 전에는 강조하지 않는다. 마디가 덜 채워졌다는 확인 결과가 나오면 기호와 굵은 글씨로 강조한다(색만으로 말하지 않는다)', () => {
    const t = boot({ key: THREE_KEY });
    click(t.action('place'));
    expect(t.water().classList.contains('is-emphasis')).toBe(false);
    click(t.action('check'));
    const w = t.water();
    expect(w.classList.contains('is-emphasis')).toBe(true);
    expect(w.getAttribute('data-emphasis')).toBe('true');
    expect(text(q(w, 'strong'))).toBe(text(w));
    expect(text(w)).toBe('남은 물은 2박부터 마디 끝까지 1920틱(2분음표 하나 길이)이에요.');
    expect(q(w, 'svg path')!.getAttribute('d')).toBe(ALERT_PATH);
    // 문장은 판정이 아닌 때와 같다: 강조는 글자를 바꾸지 않는다
    click(t.action('undo'));
    expect(t.water().classList.contains('is-emphasis')).toBe(false);
  });

  it('마디는 채웠지만 틀린 배치는 강조하지 않는다(물이 남은 것이 문제가 아니다)', () => {
    const t = boot({ key: THREE_KEY });
    for (let i = 0; i < 3; i++) click(t.action('place'));
    expect(t.stones()).toHaveLength(3);
    click(t.action('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.water().classList.contains('is-emphasis')).toBe(false);
    expect(text(t.water())).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
  });
});

describe('확인 결과와 안내', () => {
  it('자유로 놀 때의 안내는 판정하지 않는다고 말한다', () => {
    const t = boot();
    expect(text(q(t.host, '.feedback-idle'))).toBe(FREE_IDLE_TEXT);
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
  });

  it('과제의 안내: 아직 채우지 않았을 때와 다 채웠을 때가 다르다. 확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const t = boot({ key: REST_KEY });
    expect(text(q(t.host, '.feedback-idle'))).toBe(stoneIdleLead(0, 3840));
    expect(text(q(t.host, '.feedback-idle'))).toContain('배치 확인');
    for (let i = 0; i < 4; i++) click(t.action('place'));
    expect(text(q(t.host, '.feedback-idle'))).toBe(stoneIdleLead(3840, 3840));
    expect(text(q(t.host, '.feedback-idle'))).toContain('한 마디를 다 채웠어요');
  });

  it('틀린 배치를 확인하면 기호와 문장으로 알린다. 최대 세 줄이다', () => {
    const t = boot({ key: THREE_KEY });
    click(t.action('place'));
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('needsRevision');
    expect(box.classList.contains('is-error')).toBe(true);
    const lines = qa(box, '.feedback-line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(q(box, '.feedback-line svg')).not.toBeNull();
    expect(q(box, '.feedback-idle')).toBeNull();
  });

  it('다 맞게 채우고 확인하면 통과하고, 돌이 한 마디를 채웠다는 문장을 보인다', () => {
    const t = boot({ key: REST_KEY });
    click(t.action('place'));
    click(t.kind('rest'));
    click(t.action('place'));
    click(t.kind('note'));
    click(t.pitch('D4'));
    click(t.action('place'));
    click(t.pitch('E4'));
    click(t.action('place'));
    expect(t.stones()).toEqual(['N 0+960', 'R 960+960', 'N 1920+960', 'N 2880+960']);
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    expect(text(box)).toContain('통과했어요.');
    expect(text(box)).toContain(STONE_PASSED_TEXT);
    expect(t.water().classList.contains('is-emphasis')).toBe(false);
  });

  it('자유로 놀 때 확인과 목표 듣기는 판정이 없다고 알리기만 한다', () => {
    const t = boot();
    click(t.action('check'));
    expect(text(q(t.host, '[data-notice]'))).toContain(FREE_PLAY_NO_CHECK);
    click(t.action('hear-target'));
    expect(text(q(t.host, '[data-notice]'))).toContain(FREE_PLAY_NO_TARGET);
    expect(t.controller.attempts).toHaveLength(0);
    expect(t.controller.feedback).toBeNull();
    expect(t.controller.playing).toBeNull();
  });

  it('내 배치 듣기: 놓은 울림돌이 없으면 알림만 하고, 있으면 듣는 중이라고 글로 알린다. 정지는 듣는 동안에만 눌린다', () => {
    const t = boot({ key: REST_KEY });
    expect(t.action('stop').disabled).toBe(true);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBeNull();
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_STONE_NOTES_NOTICE);
    click(t.action('place'));
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toBe('내 배치를 듣는 중이에요.');
    expect(t.action('stop').disabled).toBe(false);
    click(t.action('stop'));
    expect(q(t.host, '[data-listening]')).toBeNull();
    expect(t.action('stop').disabled).toBe(true);
  });

  it('목표 듣기: 과제에서는 목표를 듣는 중이라고 알린다', () => {
    const t = boot({ key: REST_KEY });
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    expect(text(q(t.host, '[data-listening]'))).toBe('목표를 듣는 중이에요.');
  });

  it('나가기 단추로 나온다', () => {
    const t = boot();
    click(t.action('exit'));
    expect(t.hud()).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
  });
});

describe('표지판과 도움 카드', () => {
  it('표지판을 열면 자유로 놀기와 과제 판본이 나타난다. 고르면 그 과제가 열리고 목록이 닫힌다', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual(['free', REST_KEY, THREE_KEY, `${Q16}/quarter-and-half-rests`, EIGHTH_REST_KEY]);
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(text(items[1]!)).toContain('검수 전');
    click(items[4]!);
    expect(t.controller.current?.variant.variantId).toBe('eighth-rest-mix');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(text(q(t.host, '.inst-sign-current'))).toContain('쉼표의 길이 · 높은 도전');
    expect(t.hud()!.getAttribute('data-target')).toBe(EIGHTH_REST_KEY);
    // 칸이 8분음표 칸으로 바뀐다
    click(t.action('cursor-right'));
    click(t.action('cursor-right'));
    expect(hand(t)).toContain('· 1박 2번째 칸');
  });

  it('배포 채널에서는 검수가 끝나지 않은 과제는 준비 중이라 고를 수 없다', () => {
    const t = boot({ channel: 'release' });
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items[0]!.hasAttribute('aria-disabled')).toBe(false);
    for (const b of items.slice(1)) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(text(b)).toContain('준비 중');
    }
    click(items[1]!);
    expect(t.controller.current?.free).toBe(true);
    expect(q(t.host, '#inst-sign-list')).not.toBeNull();
  });

  it('도움 카드는 징검다리의 키 표를 보인다: 돌 길이 키와 종류 키가 있고 변화표 키는 없다', () => {
    const t = boot();
    expect(q(t.host, '#inst-help')).toBeNull();
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(card.getAttribute('aria-label')).toBe('키보드 도움');
    expect(qa(card, '.help-list li')).toHaveLength(TIMELINE_KEY_TABLE.length);
    for (const row of TIMELINE_KEY_TABLE) expect(text(card)).toContain(row.keys);
    expect(text(card)).toContain('돌 길이 바꾸기');
    expect(text(card)).toContain('울림돌과 이끼돌 바꾸기');
    expect(text(card)).not.toContain('변화표');
    expect(t.action('help').getAttribute('aria-expanded')).toBe('true');
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
  });

  it('패널로 보기: 자유로 놀 때는 알리기만 하고, 과제에서는 그 판본의 패널을 연다', () => {
    const t = boot();
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([]);
    expect(live(t)).toBe(FREE_PLAY_NO_PANEL);
    act(() => void t.ic.select(THREE_KEY));
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([`#/q/${Q13}/three-quarters`]);
  });
});

describe('키보드(timelineKeys의 표)', () => {
  it('→ ←는 칸을 옮기고 브라우저의 동작을 막는다', () => {
    const t = boot({ key: REST_KEY });
    expect(t.press('ArrowRight').defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(0);
    t.press('ArrowRight');
    expect(t.bench.cursor).toBe(960);
    t.press('ArrowLeft');
    expect(t.bench.cursor).toBe(0);
    expect(t.navigations).toEqual([]);
  });

  it('↑ ↓는 음높이를, Shift+↑ ↓는 돌 길이를, R은 울림돌과 이끼돌을 바꾼다', () => {
    const t = boot();
    t.press('ArrowUp');
    expect(hand(t)).toContain('울림돌 D4 8분음표');
    t.press('ArrowDown');
    expect(hand(t)).toContain('울림돌 C4 8분음표');
    t.press('ArrowUp', { shiftKey: true });
    expect(hand(t)).toContain('울림돌 C4 4분음표');
    t.press('ArrowDown', { shiftKey: true });
    expect(hand(t)).toContain('울림돌 C4 8분음표');
    t.press('KeyR');
    expect(hand(t)).toContain('이끼돌 8분쉼표');
    t.press('KeyR');
    expect(hand(t)).toContain('울림돌 C4 8분음표');
  });

  it('Enter와 Space는 놓고, Backspace는 뺀다. Z와 Y는 되돌린다', () => {
    const t = boot({ key: REST_KEY });
    t.press('ArrowRight');
    t.press('Enter');
    expect(t.stones()).toEqual(['N 0+960']);
    t.press('Space');
    expect(t.stones()).toEqual(['N 0+960', 'N 960+960']);
    t.press('ArrowLeft');
    t.press('Backspace');
    expect(t.stones()).toEqual(['N 0+960']);
    t.press('KeyZ');
    expect(t.stones()).toEqual(['N 0+960', 'N 960+960']);
    t.press('KeyY');
    expect(t.stones()).toEqual(['N 0+960']);
  });

  it('P·T·S·C는 듣기와 확인이다. V는 패널로 보기다', () => {
    const t = boot({ key: REST_KEY });
    t.press('Enter');
    t.press('KeyP');
    expect(t.controller.playing).toBe('mine');
    t.press('KeyS');
    expect(t.controller.playing).toBeNull();
    t.press('KeyT');
    expect(t.controller.playing).toBe('target');
    t.press('KeyS');
    t.press('KeyC');
    expect(t.controller.feedback).not.toBeNull();
    t.press('KeyV');
    expect(t.navigations).toEqual([`#/q/${Q02}/quarter-rest`]);
  });

  it('놓기·빼기·듣기는 키를 꾹 눌러도 한 번만 된다. 칸과 높이를 옮기는 키는 되풀이된다', () => {
    const t = boot({ key: REST_KEY });
    t.press('ArrowRight', { repeat: true });
    t.press('ArrowRight', { repeat: true });
    expect(t.bench.cursor).toBe(960);
    t.press('Enter');
    expect(t.stones()).toEqual(['N 960+960']);
    t.press('Enter', { repeat: true });
    t.press('Enter', { repeat: true });
    expect(t.stones()).toEqual(['N 960+960']);
    t.press('ArrowUp', { repeat: true });
    t.press('ArrowUp', { repeat: true });
    expect(hand(t)).toContain('울림돌 E4 4분음표');
  });

  it('H는 도움 카드를 여닫는다. Esc는 열려 있는 표지판 목록과 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다', () => {
    const t = boot();
    t.press('KeyH');
    expect(q(t.host, '#inst-help')).not.toBeNull();
    t.press('KeyH');
    expect(q(t.host, '#inst-help')).toBeNull();
    click(t.action('help'));
    click(q(t.host, '[data-sign-toggle]'));
    t.press('Escape');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(q(t.host, '#inst-help')).not.toBeNull();
    t.press('Escape');
    expect(q(t.host, '#inst-help')).toBeNull();
    expect(t.hud()).not.toBeNull();
    t.press('Escape');
    expect(t.hud()).toBeNull();
  });

  it('단추에 초점이 있을 때 Enter는 그 단추를 누르는 일이다. 방향키는 초점을 놓아 준다', () => {
    const t = boot({ key: REST_KEY });
    const button = t.kind('rest');
    button.focus();
    expect(t.press('Enter', {}, button).defaultPrevented).toBe(false);
    expect(t.stones()).toEqual([]);
    // 방향키는 초점을 놓는다: 이어서 누르는 Enter가 그 단추가 아니라 놓기가 되게
    const arrow = t.press('ArrowRight', {}, button);
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(button);
    t.press('Enter');
    expect(t.stones()).toEqual(['N 0+960']);
  });

  it('글자를 쓰는 칸에서는 받지 않고, 위의 겹침 화면이 이미 쓴 키(defaultPrevented)도 받지 않는다', () => {
    const t = boot({ key: REST_KEY });
    const input = document.createElement('input');
    document.body.appendChild(input);
    cleanups.push(() => input.remove());
    expect(t.press('ArrowRight', {}, input).defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
    const first = (e: Event): void => e.preventDefault();
    window.addEventListener('keydown', first, true);
    t.press('ArrowRight');
    window.removeEventListener('keydown', first, true);
    expect(t.bench.cursor).toBeNull();
  });

  it('Ctrl·Alt·Meta와 함께 누른 것과 모르는 키는 지나간다', () => {
    const t = boot({ key: REST_KEY });
    expect(t.press('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyP', { altKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyR', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyQ').defaultPrevented).toBe(false);
    expect(t.press('Tab').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
  });

  it('월드가 멈춰 있는 동안(패널이 위에 열려 있을 때)과 모드를 나온 뒤에는 받지 않는다', () => {
    const t = boot({ key: REST_KEY });
    act(() => t.bridge.pause.set(true));
    expect(t.press('ArrowRight').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
    act(() => t.bridge.pause.set(false));
    act(() => t.ic.exit());
    expect(t.press('Enter').defaultPrevented).toBe(false);
    expect(t.navigations).toEqual([]);
  });

  it('표지판 목록 안에서는 목록이 키를 쓴다: ↑ ↓로 항목을 옮기고 → 키는 칸을 옮기지 않는다. Esc로 닫으면 표지판 단추로 돌아온다', () => {
    const t = boot();
    const toggle = q<HTMLButtonElement>(t.host, '[data-sign-toggle]')!;
    toggle.focus();
    click(toggle);
    expect(document.activeElement).toBe(q(t.host, '[data-sign="free"]'));
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(down));
    expect(document.activeElement).toBe(q(t.host, `[data-sign="${REST_KEY}"]`));
    const right = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(right));
    expect(t.bench.cursor).toBeNull();
    t.press('Escape', {}, document.activeElement!);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe('조작 막대가 가리는 높이를 월드에 알린다(카메라가 여울을 막대 위쪽에 담는다)', () => {
  const stubRect = (top: number, height: number): void => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const isMain = this.classList?.contains('inst-main');
      return { x: 0, y: isMain ? top : 0, top: isMain ? top : 0, left: 0, right: 0, bottom: isMain ? top + height : 0, width: 0, height: isMain ? height : 0, toJSON: () => ({}) } as DOMRect;
    };
  };

  it('작업대 윗선에서 화면 아래까지의 높이를 올리고, 나오면 0으로 되돌린다', () => {
    stubRect(500, 260);
    const t = boot();
    expect(t.bridge.bottomInset.get()).toBe(window.innerHeight - 500);
    act(() => t.ic.exit());
    expect(t.bridge.bottomInset.get()).toBe(0);
  });

  it('표지판 목록과 도움 카드는 작업대 위에 떠서 작업대의 높이를 바꾸지 않는다', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    click(t.action('help'));
    const main = q(t.host, '.inst-main')!;
    expect(main.contains(q(t.host, '#inst-sign-list'))).toBe(false);
    expect(main.contains(q(t.host, '#inst-help'))).toBe(false);
    expect(q(t.host, '.inst-float')!.contains(q(t.host, '#inst-sign-list'))).toBe(true);
  });
});

describe('11.2의 6: 도움을 쓰는 동안 통과는 없다', () => {
  it.each([
    ['E1', THREE_KEY],
    ['E1', EIGHTH_REST_KEY],
    ['E1', `${Q16}/quarter-and-half-rests`],
    ['E2', LONG_SHORT_KEY],
    ['E2', DOTTED_KEY],
    ['E2', `${Q15}/dotted-quarter-mix`],
  ] as const)('%s의 %s: 도움 카드를 열고 닫고, 목표와 내 배치를 들어도 기록되는 시도는 없고 작업대에서 그대로 이어진다', (station, key) => {
    const t = boot({ station, key });
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
