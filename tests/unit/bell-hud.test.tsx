// @vitest-environment jsdom
// 6-7 종나무(T4, 4.6)의 화면: 표지판, 재료 선반(음이름과 변화표, 종탑은 종 세 개), 듣는 방식, 조작 막대, 도움 카드, 확인 결과, 키보드. 끌지 않아도 모두 된다(W-4).
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 종나무 작업대만으로 화면이 하는 일을 확인한다. 월드 그림은 bell-layer와 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { writtenOf } from '@/domain/pitch';
import { treeSlot } from '@/domain/slotplan';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { BELL_LETTERS } from '@/ui/challenge/bellBench';
import { bellKeyTableOf } from '@/ui/challenge/bellKeys';
import { HEAR_MODES, NO_BELL_NOTICE, NO_SOUNDING_BELL_NOTICE, TOWER_NO_HAND, bellIdleLead, bellPassedText } from '@/ui/challenge/bellText';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { FREE_IDLE_TEXT } from '@/ui/challenge/slotText';
import { BellHud } from '@/ui/installation/BellHud';
import { FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { p } from './helpers';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q05 = 'chord.major-triad';
const Q06 = 'chord.inversion';
const Q20 = 'chord.major-and-minor';
const Q21 = 'chord.primary-triads';
const Q22 = 'chord.diminished-augmented';
const Q23 = 'chord.progression-walk';
const ID = {
  W1: 'inst.bell-grove.three-bells',
  W2: 'inst.bell-grove.bright-dark',
  W3: 'inst.bell-grove.bell-tower',
  W4: 'inst.bell-grove.three-pillars',
} as const;
type Station = keyof typeof ID;
const C_MAJOR = `${Q05}/c-major`;
const F_MAJOR = `${Q05}/f-major`;
const G_MAJOR = `${Q05}/g-major`;
const C_FIRST = `${Q06}/c-first`;
const PILLARS = `${Q21}/c-major-pillars`;
const WALK = `${Q23}/c-major-walk`;

/** 아이콘은 이름을 달고 있지 않아 그림의 선 모양으로 가린다: 경고(삼각형) */
const ALERT_PATH = 'M12 7v6m0 4h.01M12 3 2.5 20h19z';

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
  /** 들어갈 정거장. 기본은 W1(나무) */
  station?: Station;
}

function boot(opts: BootOptions = {}) {
  const { enter, touchOnly, inert, key, station = 'W1', ...rigOptions } = opts;
  const r = rig({ definitions: [Q05, Q06, Q20, Q22, Q21, Q23].map(quest), ...rigOptions });
  const bridge = new WorldBridge({ x: 1900, y: 2700, facing: 'down' });
  const defs = { W1: installation(ID.W1), W2: installation(ID.W2), W3: installation(ID.W3), W4: installation(ID.W4) };
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: Object.values(defs),
    panels: new Set(['panel.chord']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  const navigations: string[] = [];
  ic.setNavigator((hash) => void navigations.push(hash));
  if (enter !== false) {
    act(() => void ic.enter(station));
    if (key) act(() => void ic.select(key));
  }
  const inst = defs[station];
  const bench = ic.bellOf(inst)!;
  const m = mount(
    <BellHud
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
  const letter = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-letter="${name}"]`)!;
  const accidental = (name: 'flat' | 'none' | 'sharp'): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-accidental="${name}"]`)!;
  const chip = (draft: number): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-bell="${draft}"]`)!;
  /** 종 칩의 이름과 그 아래 글(꺼짐, 낮음). 이름 줄과 글 줄은 따로 쌓여 그려진다 */
  const chipName = (draft: number): string => text(q(chip(draft), '.material-name'));
  const chipSub = (draft: number): string => text(q(chip(draft), '.material-sub'));
  const hear = (mode: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-hear-mode="${mode}"]`)!;
  /** 지금 걸린 종들의 이름(초안 칸 차례) */
  const hung = (): string[] => bench.states().map((s) => s.name);
  return { ...r, bridge, inst, ic, bench, m, host: m.host, navigations, hud, press, action, letter, accidental, chip, chipName, chipSub, hear, hung };
}

type T = ReturnType<typeof boot>;
const live = (t: T): string => text(q(t.host, '[data-live]'));
/** 손에 든 것(나무와 빈터)이나 고른 종(종탑)을 보이는 줄 */
const hand = (t: T): string => text(q(t.host, '.inst-hand'));
const actions = (t: T): string[] => qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action')!);

/** 나무에 C4 E4 G4를 건다(C 장3화음) */
function hangCMajor(t: T): void {
  click(t.action('cursor-right'));
  click(t.action('place'));
  click(t.action('cursor-right'));
  click(t.letter('E'));
  click(t.action('place'));
  click(t.action('cursor-right'));
  click(t.letter('G'));
  click(t.action('place'));
}

describe('들어가면 종나무 작업대가 나타난다', () => {
  it('모드 밖에서는 아무것도 그리지 않는다. 들어가면 나타나고, 나오면 사라진다', () => {
    const t = boot({ enter: false });
    expect(t.hud()).toBeNull();
    act(() => void t.ic.enter('W1'));
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe(`${t.inst.name} 작업대`);
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(ID.W1);
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    act(() => t.ic.exit());
    expect(t.hud()).toBeNull();
  });

  it('화면의 모양은 설치물의 모양을 따른다: W1 나무, W3 종탑, W4 빈터', () => {
    expect(boot({ station: 'W1' }).hud()!.getAttribute('data-bell-form')).toBe('tree');
    expect(boot({ station: 'W2' }).hud()!.getAttribute('data-bell-form')).toBe('tree');
    expect(boot({ station: 'W3' }).hud()!.getAttribute('data-bell-form')).toBe('tower');
    expect(boot({ station: 'W4' }).hud()!.getAttribute('data-bell-form')).toBe('glade');
  });

  it('조작 막대의 모든 동작이 단추로 있다(끌지 않아도 모두 된다): 나무', () => {
    const t = boot();
    expect(actions(t)).toEqual(['cursor-left', 'cursor-right', 'ring-up', 'ring-down', 'place', 'remove', 'undo', 'redo', 'hear-mine', 'hear-target', 'stop', 'check', 'view-panel', 'help', 'exit']);
    expect(qa(t.host, '[draggable]')).toHaveLength(0);
  });

  it('종탑에는 가로 자리 맞바꾸기와 소리 끄기 단추가 있고 빼기 단추는 없다', () => {
    const t = boot({ station: 'W3' });
    expect(actions(t)).toEqual(['cursor-left', 'cursor-right', 'ring-up', 'ring-down', 'swap-left', 'swap-right', 'mute', 'place', 'undo', 'redo', 'hear-mine', 'hear-target', 'stop', 'check', 'view-panel', 'help', 'exit']);
    expect(t.action('place').getAttribute('aria-label')).toBe('고른 종 울려 보기');
    expect(t.action('ring-up').getAttribute('aria-label')).toBe('한 옥타브 올리기');
  });

  it('빈터에는 나무 건너뛰기와 고른 나무 듣기 단추가 더 있다', () => {
    const t = boot({ station: 'W4' });
    expect(actions(t)).toEqual(['cursor-left', 'cursor-right', 'tree-prev', 'tree-next', 'ring-up', 'ring-down', 'place', 'remove', 'undo', 'redo', 'hear-mine', 'hear-tree', 'hear-target', 'stop', 'check', 'view-panel', 'help', 'exit']);
    expect(t.action('hear-mine').getAttribute('aria-label')).toBe('내 화음 이어 듣기');
    expect(t.action('tree-prev').getAttribute('aria-label')).toBe('이전 나무');
    expect(t.action('tree-next').getAttribute('aria-label')).toBe('다음 나무');
  });

  it.each(['W1', 'W3', 'W4'] as const)('%s: 단추는 모두 이름을 달고 있고, 조작 막대 단추는 키 안내(aria-keyshortcuts)를 갖는다. 보이는 이름이 곧 접근 이름이다', (station) => {
    const t = boot({ station });
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(b.getAttribute('aria-keyshortcuts'), b.outerHTML).toBeTruthy();
      expect(b.type).toBe('button');
      const visible = text(q(b, '.inst-btn-label'));
      expect(b.getAttribute('aria-label')!.includes(visible), `${b.getAttribute('aria-label')} ⊇ ${visible}`).toBe(true);
    }
    for (const b of qa<HTMLButtonElement>(t.host, '.inst-material')) {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-pressed'), b.outerHTML).not.toBeNull();
      expect(text(b), b.outerHTML).not.toBe('');
    }
  });

  it('눈에 보이지 않는 알림 칸이 컨트롤러의 알림을 그대로 읽어 준다', () => {
    const t = boot();
    const region = q(t.host, '[data-live]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(text(region)).toContain('에 들어왔어요');
    click(t.action('cursor-right'));
    expect(live(t)).toBe('종 1, 비어 있어요. 걸 가지는 4옥타브예요.');
  });

  it('inert가 켜져 있으면(위에 안내 카드가 떠 있을 때) 단추가 눌리지 않는다', () => {
    expect(boot({ inert: true }).hud()!.hasAttribute('inert')).toBe(true);
    expect(boot().hud()!.hasAttribute('inert')).toBe(false);
  });

  it('키보드 안내 줄은 키보드가 있는 화면에만 있고, 모양마다 다른 키를 안내한다. 터치 전용 화면에는 없다', () => {
    const tree = text(q(boot().host, '.inst-hint'));
    expect(tree).toContain('PgUp PgDn 음이름');
    expect(tree).toContain('Shift+↑↓ 변화표');
    expect(tree).not.toContain('나무');
    const tower = text(q(boot({ station: 'W3' }).host, '.inst-hint'));
    expect(tower).toContain('Shift+← → 가로 자리');
    expect(tower).toContain('X 소리');
    expect(tower).not.toContain('음이름');
    expect(text(q(boot({ station: 'W4' }).host, '.inst-hint'))).toContain('Shift+← → 나무');
    expect(q(boot({ touchOnly: true }).host, '.inst-hint')).toBeNull();
  });
});

describe('재료 선반과 손에 든 종(나무)', () => {
  it('음이름 일곱과 변화표 셋이 있다. 처음에는 C를 들고 있고 변화표는 없다', () => {
    const t = boot();
    expect(qa(t.host, '[data-letter]').map((b) => b.getAttribute('data-letter'))).toEqual([...BELL_LETTERS]);
    expect(qa(t.host, '[data-letter]').map((b) => text(b))).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(qa(t.host, '[data-accidental]').map((b) => b.getAttribute('data-accidental'))).toEqual(['flat', 'none', 'sharp']);
    expect(qa(t.host, '[data-accidental]').map((b) => b.getAttribute('aria-label'))).toEqual(['내림표', '변화표 없음', '올림표']);
    expect(hand(t)).toBe('손에 든 종 C · 종 자리를 고르세요');
    expect(q(t.host, '.inst-hand')!.getAttribute('data-hand')).toBe('C');
    expect(t.letter('C').getAttribute('aria-pressed')).toBe('true');
    expect(t.letter('D').getAttribute('aria-pressed')).toBe('false');
    expect(t.accidental('none').getAttribute('aria-pressed')).toBe('true');
    expect(t.accidental('flat').getAttribute('aria-pressed')).toBe('false');
    expect(qa(t.host, '[data-bell]')).toHaveLength(0); // 종탑의 종 칩은 나무에 없다
  });

  it('음이름 단추를 누르면 손에 든 종이 바뀌고 글로 알린다', () => {
    const t = boot();
    click(t.letter('E'));
    expect(hand(t)).toBe('손에 든 종 E · 종 자리를 고르세요');
    expect(t.letter('E').getAttribute('aria-pressed')).toBe('true');
    expect(t.letter('C').getAttribute('aria-pressed')).toBe('false');
    expect(live(t)).toContain('손에 든 종은 E');
  });

  it('변화표 단추를 누르면 음이름 단추의 이름이 변화표를 따라 바뀐다. 손에 든 종의 이름도 바뀐다', () => {
    const t = boot();
    click(t.letter('E'));
    click(t.accidental('flat'));
    expect(hand(t)).toBe('손에 든 종 E♭ · 종 자리를 고르세요');
    expect(qa(t.host, '[data-letter]').map((b) => text(b))).toEqual(['C♭', 'D♭', 'E♭', 'F♭', 'G♭', 'A♭', 'B♭']);
    expect(t.accidental('flat').getAttribute('aria-pressed')).toBe('true');
    expect(t.accidental('none').getAttribute('aria-pressed')).toBe('false');
    click(t.accidental('sharp'));
    expect(hand(t)).toBe('손에 든 종 E♯ · 종 자리를 고르세요');
    click(t.accidental('none'));
    expect(hand(t)).toBe('손에 든 종 E · 종 자리를 고르세요');
  });

  it('도전을 바꾸면 손은 처음(C)으로 돌아간다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.letter('G'));
    click(t.accidental('sharp'));
    expect(hand(t)).toContain('G♯');
    act(() => void t.ic.select(F_MAJOR));
    expect(hand(t)).toBe('손에 든 종 C · 종 자리를 고르세요');
  });
});

describe('종 자리 고르기와 걸기(단추)', () => {
  it('→ ← 단추: 종 자리를 옮기고 고른 자리를 글로 알린다. 걸기 단추의 이름도 고른 자리를 말한다', () => {
    const t = boot({ key: C_MAJOR });
    expect(t.action('place').getAttribute('aria-label')).toBe('첫 종 자리에 걸기');
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('손에 든 종 C · 종 1');
    expect(t.action('place').getAttribute('aria-label')).toBe('종 1에 걸기');
    click(t.action('cursor-right'));
    expect(hand(t)).toContain('· 종 2');
    click(t.action('cursor-left'));
    expect(hand(t)).toContain('· 종 1');
    click(t.action('cursor-left'));
    expect(live(t)).toContain('첫 종 자리예요');
  });

  it('걸기 단추: 고른 자리에 손에 든 종을 건다. 고른 자리는 그대로다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('cursor-right'));
    click(t.action('place'));
    expect(t.hung()).toEqual(['C4']);
    expect(live(t)).toBe('종 1: C4로 걸었어요.');
    expect(t.bench.cursor).toBe(0);
    click(t.action('cursor-right'));
    click(t.letter('E'));
    click(t.action('place'));
    expect(t.hung()).toEqual(['C4', 'E4']);
  });

  it('고르지 않고 걸기를 누르면 첫 종 자리에 걸린다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('place'));
    expect(t.hung()).toEqual(['C4']);
    expect(t.bench.cursor).toBe(0);
  });

  it('위 가지와 아래 가지 단추: 종이 없는 자리에서는 걸 가지를 옮기고, 음역의 끝에서는 멈추고 알린다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('cursor-right'));
    click(t.action('ring-up'));
    expect(live(t)).toBe('종 1: 걸 가지는 5옥타브예요.');
    click(t.action('ring-up'));
    expect(live(t)).toBe('걸 가지가 맨 위예요. 이 도전은 4옥타브부터 5옥타브까지 써요.');
    click(t.action('place'));
    expect(t.hung()).toEqual(['C5']);
    click(t.action('ring-down'));
    expect(t.hung()).toEqual(['C4']);
  });

  it('변화표를 붙여 건 종은 이름에 변화표가 붙는다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('cursor-right'));
    click(t.letter('E'));
    click(t.accidental('flat'));
    click(t.action('place'));
    expect(t.hung()).toEqual(['E♭4']);
  });

  it('빼기 단추는 고른 자리에 종이 있을 때만 눌린다. 누르면 그 종이 빠진다', () => {
    const t = boot({ key: C_MAJOR });
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('cursor-right'));
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('place'));
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(t.hung()).toEqual([]);
    expect(t.action('remove').disabled).toBe(true);
  });

  it('실행 취소와 다시 실행 단추는 할 수 있을 때만 눌린다', () => {
    const t = boot({ key: C_MAJOR });
    expect(t.action('undo').disabled).toBe(true);
    expect(t.action('redo').disabled).toBe(true);
    click(t.action('place'));
    expect(t.action('undo').disabled).toBe(false);
    click(t.action('undo'));
    expect(t.hung()).toEqual([]);
    expect(t.action('redo').disabled).toBe(false);
    click(t.action('redo'));
    expect(t.hung()).toEqual(['C4']);
  });
});

describe('종탑의 선반(종 세 개)', () => {
  it('음이름과 변화표 선반은 없고 종 세 개가 걸려 있다. 가장 낮은 종은 글로도 말한다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    expect(qa(t.host, '[data-letter]')).toHaveLength(0);
    expect(qa(t.host, '[data-accidental]')).toHaveLength(0);
    expect(qa(t.host, '[data-bell]').map((b) => b.getAttribute('data-bell'))).toEqual(['0', '1', '2']);
    expect([0, 1, 2].map((d) => t.chipName(d))).toEqual(['C3', 'E3', 'G3']);
    expect([0, 1, 2].map((d) => t.chipSub(d))).toEqual(['낮음', '', '']);
    expect(t.chip(0).getAttribute('data-lowest')).toBe('true');
    expect(t.chip(1).hasAttribute('data-lowest')).toBe(false);
    expect(t.chip(0).getAttribute('aria-label')).toBe('종 1, C3, 가장 낮게 울려요');
    expect(t.chip(1).getAttribute('aria-label')).toBe('종 2, E3');
    expect(hand(t)).toBe('고른 종 없음 · 종을 고르세요');
  });

  it('종 칩을 누르면 그 종을 고르고, 소리가 켜져 있다고 알린다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    click(t.chip(1));
    expect(t.bench.cursor).toBe(1);
    expect(t.chip(1).getAttribute('aria-pressed')).toBe('true');
    expect(t.chip(0).getAttribute('aria-pressed')).toBe('false');
    expect(hand(t)).toBe('고른 종 종 2 · E3 · 소리가 켜져 있어요');
    expect(q(t.host, '.inst-hand')!.getAttribute('data-selected-bell')).toBe('1');
    expect(live(t)).toBe('종 2, E3이에요. 소리가 켜져 있어요.');
    click(t.chip(0));
    expect(hand(t)).toBe('고른 종 종 1 · C3 · 가장 낮게 울려요');
  });

  it('소리 끄기: 끈 종은 ✕와 꺼짐으로 보이고 이름에도 말한다. 다시 누르면 켠다(색만으로 말하지 않는다)', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    expect(t.action('mute').disabled).toBe(true); // 종을 고르기 전에는 누를 수 없다
    click(t.chip(2));
    expect(t.action('mute').getAttribute('aria-label')).toBe('종 소리 끄기');
    click(t.action('mute'));
    expect(t.chip(2).getAttribute('data-muted')).toBe('true');
    expect(t.chip(2).classList.contains('is-muted')).toBe(true);
    expect(t.chipName(2)).toBe('✕ G3');
    expect(t.chipSub(2)).toBe('꺼짐');
    expect(t.chip(2).getAttribute('aria-label')).toBe('종 3, G3, 소리가 꺼져 있어요');
    expect(hand(t)).toBe('고른 종 종 3 · G3 · 소리가 꺼져 있어요');
    expect(t.action('mute').getAttribute('aria-label')).toBe('종 소리 켜기');
    expect(live(t)).toContain('소리를 껐어요');
    click(t.action('mute'));
    expect(t.chip(2).hasAttribute('data-muted')).toBe(false);
    expect(t.chipName(2)).toBe('G3');
    expect(t.chipSub(2)).toBe('');
    expect(live(t)).toContain('소리를 켰어요');
  });

  it('가장 낮은 종 표시는 울리는 종 가운데 가장 낮은 종을 따라간다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    click(t.chip(0));
    click(t.action('mute'));
    expect(t.chip(0).hasAttribute('data-lowest')).toBe(false);
    expect(t.chip(1).getAttribute('data-lowest')).toBe('true');
    expect(t.chipSub(1)).toBe('낮음');
    expect(t.chipSub(0)).toBe('꺼짐');
  });

  it('가로 자리 맞바꾸기: 고른 종이 옆 자리와 바뀌고 고른 자리는 그 종을 따라간다. 끝에서는 누를 수 없다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    expect(t.action('swap-left').disabled).toBe(true);
    expect(t.action('swap-right').disabled).toBe(true);
    click(t.chip(0));
    expect(t.action('swap-left').disabled).toBe(true);
    expect(t.action('swap-right').disabled).toBe(false);
    click(t.action('swap-right'));
    expect(t.hung()).toEqual(['E3', 'C3', 'G3']);
    expect(t.bench.cursor).toBe(1);
    expect(t.chip(1).getAttribute('aria-pressed')).toBe('true');
    // '낮음' 표시는 자리가 아니라 종을 따라간다: C3가 두 번째 자리로 가도 여전히 가장 낮게 울린다
    expect(t.chipName(1)).toBe('C3');
    expect(t.chipSub(1)).toBe('낮음');
    expect(t.chip(0).hasAttribute('data-lowest')).toBe(false);
    click(t.action('swap-right'));
    expect(t.hung()).toEqual(['E3', 'G3', 'C3']);
    expect(t.action('swap-right').disabled).toBe(true);
    expect(t.action('swap-left').disabled).toBe(false);
  });

  it('손에 드는 종이 없다: 음이름 키는 알림만 하고 종은 그대로다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    t.press('PageUp');
    expect(live(t)).toBe(TOWER_NO_HAND);
    expect(t.hung()).toEqual(['C3', 'E3', 'G3']);
  });

  it('옥타브 올리기와 내리기 단추는 고른 종을 한 옥타브씩 옮긴다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    click(t.chip(0));
    click(t.action('ring-up'));
    expect(t.hung()).toEqual(['C4', 'E3', 'G3']);
    expect(t.chipSub(1)).toBe('낮음'); // 가장 낮은 종이 E3로 옮겨 갔다
    expect(t.chipName(0)).toBe('C4');
    expect(t.chipSub(0)).toBe('');
    click(t.action('ring-down'));
    expect(t.hung()).toEqual(['C3', 'E3', 'G3']);
  });

  it('울려 보기: 걸린 종을 울려 보기만 하고 배치는 바꾸지 않는다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    click(t.chip(1));
    click(t.action('place'));
    expect(t.hung()).toEqual(['C3', 'E3', 'G3']);
    expect(live(t)).toBe('종 2, E3이에요. 소리가 켜져 있어요.');
  });

  it('가로 순서만 바꾸면 전위가 그대로다: 같은 소리는 같은 확인 결과를 낸다(설계서 12.9 완료 기준)', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    // 처음 배치(C3 E3 G3)는 으뜸음 자리 바탕이라 제1전위 과제를 통과하지 못한다
    click(t.action('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    const before = t.controller.feedback!.messages;
    expect(before.length).toBeGreaterThan(0);
    click(t.chip(0));
    click(t.action('swap-right'));
    click(t.action('swap-right'));
    expect(t.hung()).toEqual(['E3', 'G3', 'C3']);
    click(t.action('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback!.messages).toEqual(before);
    // C3를 한 옥타브 올리면 E가 가장 낮아 통과하고, 그 상태에서 가로 순서를 바꿔도 통과한다
    click(t.action('ring-up'));
    expect(t.hung()).toEqual(['E3', 'G3', 'C4']);
    click(t.action('check'));
    expect(t.controller.feedback?.passed).toBe(true);
    expect(text(q(t.host, '.inst-feedback'))).toContain(bellPassedText(t.bench.variant));
    click(t.action('swap-left'));
    click(t.action('swap-left'));
    expect(t.hung()).toEqual(['C4', 'E3', 'G3']);
    expect(t.controller.feedback).toBeNull(); // 고치면 지난 결과는 사라진다
    click(t.action('check'));
    expect(t.controller.feedback?.passed).toBe(true);
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
  });
});

describe('빈터(W4): 나무가 셋', () => {
  it('종 자리의 이름이 나무와 몇 번째 종인지 말한다. 나무 건너뛰기 단추로 같은 열 번호를 지키며 옮긴다', () => {
    const t = boot({ station: 'W4', key: PILLARS });
    expect(hand(t)).toBe('손에 든 종 C · 종 자리를 고르세요');
    expect(t.action('place').getAttribute('aria-label')).toBe('첫 종 자리에 걸기');
    click(t.action('tree-next'));
    expect(hand(t)).toBe('손에 든 종 C · 첫째 나무의 1번째 종');
    click(t.action('cursor-right'));
    click(t.action('tree-next'));
    expect(hand(t)).toBe('손에 든 종 C · 둘째 나무의 2번째 종');
    expect(t.action('place').getAttribute('aria-label')).toBe('둘째 나무의 2번째 종에 걸기');
    click(t.action('tree-prev'));
    expect(hand(t)).toContain('첫째 나무의 2번째 종');
    click(t.action('tree-prev'));
    expect(live(t)).toContain('첫째 나무예요');
  });

  it('아직 아무것도 걸지 않았을 때의 안내는 나무의 수를 말한다', () => {
    const t = boot({ station: 'W4', key: PILLARS });
    expect(text(q(t.host, '.feedback-idle'))).toBe(bellIdleLead('glade', 3, 0));
    expect(text(q(t.host, '.feedback-idle'))).toBe("3그루의 나무에 종을 걸고 '배치 확인'을 눌러 보세요.");
  });

  /** 나무마다 종을 건다(초안을 직접 고친다). 나무 안의 칸 번호는 0부터다 */
  const hangTrees = (t: T, trees: string[][]): void => {
    trees.forEach((names, tree) => names.forEach((n, i) => act(() => t.controller.edit({ type: 'setSlot', slot: treeSlot(tree, i), writtenPitch: writtenOf(p(n)) }))));
  };

  it('Q23을 통과하면 전위를 알려 주기만 한다: 한 문장이 덧붙고 낭독 알림에도 들어간다. 판정은 같다', () => {
    const t = boot({ station: 'W4', key: WALK });
    hangTrees(t, [['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']]);
    expect(q(t.host, '[data-shape-note]')).toBeNull();
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    const root = '전위는 판정하지 않고 알려만 줘요. 처음 으뜸화음은 기본 위치, 버금딸림화음은 기본 위치, 딸림화음은 기본 위치, 마지막 으뜸화음은 기본 위치예요.';
    expect(text(q(box, '[data-shape-note]'))).toBe(root);
    expect(t.controller.live).toBe(`통과했어요. ${root}`);
    // 첫째 나무를 제1전위, 셋째 나무를 제2전위로 바꿔도 통과한다(전위는 판정하지 않는다). 말만 달라진다
    hangTrees(t, [['E4', 'G4', 'C5'], [], ['D4', 'G4', 'B4']]);
    expect(q(t.host, '[data-shape-note]')).toBeNull(); // 고치면 지난 결과는 사라진다
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(t.host, '[data-shape-note]'))).toBe('전위는 판정하지 않고 알려만 줘요. 처음 으뜸화음은 제1전위, 버금딸림화음은 기본 위치, 딸림화음은 제2전위, 마지막 으뜸화음은 제1전위예요.');
  });

  it('통과하지 못한 확인에는 전위를 덧붙이지 않는다. Q21과 나무(Q05)의 통과에도 덧붙는 말이 없다', () => {
    const t = boot({ station: 'W4', key: WALK });
    hangTrees(t, [['C4', 'E4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']]);
    click(t.action('check'));
    expect(t.controller.feedback?.passed).toBe(false);
    expect(q(t.host, '[data-shape-note]')).toBeNull();
    expect(t.controller.live).not.toContain('전위는');
    const u = boot({ station: 'W4', key: PILLARS });
    hangTrees(u, [['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5']]);
    click(u.action('check'));
    expect(u.controller.feedback?.passed).toBe(true);
    expect(q(u.host, '[data-shape-note]')).toBeNull();
    expect(u.controller.live).toBe('통과했어요.');
    const w = boot({ key: C_MAJOR });
    hangCMajor(w);
    click(w.action('check'));
    expect(w.controller.feedback?.passed).toBe(true);
    expect(q(w.host, '[data-shape-note]')).toBeNull();
    expect(w.controller.live).toBe('통과했어요.');
  });

  it('고른 나무 듣기: 걸린 종이 없으면 그 나무의 이름으로 알린다. 있으면 그 나무의 화음만 들려 준다', () => {
    const t = boot({ station: 'W4', key: PILLARS });
    click(t.action('hear-tree'));
    expect(text(q(t.host, '[data-notice]'))).toContain('첫째 나무에는 아직 걸린 종이 없어요.');
    click(t.action('hear-mine'));
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_BELL_NOTICE);
    click(t.action('tree-next'));
    click(t.action('place'));
    click(t.action('hear-tree'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toBe('내 배치를 듣는 중이에요.');
  });
});

describe('듣는 방식', () => {
  it('세 가지 단추가 판과 같은 이름으로 있다. 처음에는 함께 울리기다', () => {
    for (const station of ['W1', 'W3', 'W4'] as const) {
      const t = boot({ station });
      expect(qa(t.host, '[data-hear-mode]').map((b) => b.getAttribute('data-hear-mode'))).toEqual(HEAR_MODES.map((m) => m.mode));
      expect(qa(t.host, '[data-hear-mode]').map((b) => text(b))).toEqual(['함께 울리기', '아래부터 차례로', '가장 낮은 종만']);
      expect(qa(t.host, '[data-hear-mode]').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
      expect(q(t.host, '.inst-hearing')!.getAttribute('aria-label')).toBe('듣는 방식');
    }
  });

  it('고르면 눌린 표시가 옮겨 가고 글로 알린다. 걸린 종이 없으면 이유를 알린다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.hear('ascending'));
    expect(t.hear('ascending').getAttribute('aria-pressed')).toBe('true');
    expect(t.hear('together').getAttribute('aria-pressed')).toBe('false');
    expect(live(t)).toContain('듣는 방식: 아래부터 차례로.');
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_BELL_NOTICE);
    expect(t.controller.playing).toBeNull();
  });

  it('종이 걸려 있으면 고르는 즉시 그 방식으로 들려 준다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('place'));
    click(t.hear('lowest'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toBe('내 배치를 듣는 중이에요.');
  });

  it('종탑에서 소리가 켜진 종이 없으면 그 이유로 알린다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    for (const draft of [0, 1, 2]) {
      click(t.chip(draft));
      click(t.action('mute'));
    }
    click(t.action('hear-mine'));
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_SOUNDING_BELL_NOTICE);
  });

  it('도전을 바꾸면 듣는 방식은 처음(함께 울리기)으로 돌아간다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.hear('ascending'));
    act(() => void t.ic.select(G_MAJOR));
    expect(t.hear('together').getAttribute('aria-pressed')).toBe('true');
    expect(t.hear('ascending').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('확인 결과와 안내', () => {
  it('자유로 놀 때의 안내는 판정하지 않는다고 말한다', () => {
    const t = boot();
    expect(text(q(t.host, '.feedback-idle'))).toBe(FREE_IDLE_TEXT);
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
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

  it('과제의 안내: 종을 걸기 전과 건 뒤가 다르다. 확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const t = boot({ key: C_MAJOR });
    expect(text(q(t.host, '.feedback-idle'))).toBe(bellIdleLead('tree', 1, 0));
    expect(text(q(t.host, '.feedback-idle'))).toContain('배치 확인');
    click(t.action('place'));
    expect(text(q(t.host, '.feedback-idle'))).toBe(bellIdleLead('tree', 1, 1));
    expect(text(q(t.host, '.feedback-idle'))).toBe("종이 1개 걸려 있어요. '배치 확인'을 눌러 보세요.");
  });

  it('틀린 배치를 확인하면 기호와 문장으로 알린다. 최대 세 줄이다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('place'));
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('needsRevision');
    expect(box.classList.contains('is-error')).toBe(true);
    const lines = qa(box, '.feedback-line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(q(box, '.feedback-line svg path')!.getAttribute('d')).toBe(ALERT_PATH);
    expect(q(box, '.feedback-idle')).toBeNull();
    expect(q(box, '.feedback-line strong')).not.toBeNull(); // 기호만이 아니라 굵은 글씨로도 알린다
  });

  it('고치면 지난 확인 결과는 사라지고 안내로 돌아간다', () => {
    const t = boot({ key: C_MAJOR });
    click(t.action('place'));
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    click(t.action('cursor-right'));
    click(t.letter('E'));
    click(t.action('place'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(q(t.host, '.feedback-idle')).not.toBeNull();
  });

  it('다 맞게 걸고 확인하면 통과하고, 구성음이 모두 걸렸다는 문장을 보인다', () => {
    const t = boot({ key: C_MAJOR });
    hangCMajor(t);
    expect(t.hung()).toEqual(['C4', 'E4', 'G4']);
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    expect(box.classList.contains('is-ok')).toBe(true);
    expect(text(box)).toContain('통과했어요.');
    expect(text(box)).toContain(bellPassedText(t.bench.variant));
    expect(text(box)).toContain('의 구성음이 모두 걸렸어요.');
  });

  it('내 배치 듣기: 걸린 종이 없으면 알림만 하고, 있으면 듣는 중이라고 글로 알린다. 정지는 듣는 동안에만 눌린다', () => {
    const t = boot({ key: C_MAJOR });
    expect(t.action('stop').disabled).toBe(true);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBeNull();
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_BELL_NOTICE);
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
    const t = boot({ key: C_MAJOR });
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
    expect(text(q(t.host, '.inst-sign-current'))).toContain('자유로 놀기');
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual(['free', C_MAJOR, F_MAJOR, G_MAJOR]);
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(text(items[1]!)).toContain('검수 전');
    click(items[2]!);
    expect(t.controller.current?.variant.variantId).toBe('f-major');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(t.hud()!.getAttribute('data-target')).toBe(F_MAJOR);
    expect(t.hud()!.getAttribute('data-target')).not.toBe('free');
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

  it.each([
    ['W1', 'tree'],
    ['W3', 'tower'],
    ['W4', 'glade'],
  ] as const)('%s의 도움 카드는 그 모양의 키 표를 보인다. 한 번 더 누르면 닫힌다', (station, form) => {
    const t = boot({ station });
    expect(q(t.host, '#inst-help')).toBeNull();
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(card.getAttribute('aria-label')).toBe('키보드 도움');
    const table = bellKeyTableOf(form);
    expect(qa(card, '.help-list li')).toHaveLength(table.length);
    for (const row of table) {
      expect(text(card)).toContain(row.keys);
      expect(text(card)).toContain(row.label);
    }
    expect(t.action('help').getAttribute('aria-expanded')).toBe('true');
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
  });

  it('도움 카드는 모양마다 다른 키만 보인다: 종탑은 가로 자리와 소리 끄기, 나무는 음이름과 변화표, 빈터는 나무 건너뛰기', () => {
    const helpOf = (station: Station): string => {
      const t = boot({ station });
      click(t.action('help'));
      return text(q(t.host, '#inst-help'));
    };
    const tree = helpOf('W1');
    expect(tree).toContain('PageUp PageDown');
    expect(tree).toContain('변화표 바꾸기');
    expect(tree).not.toContain('종의 가로 자리');
    expect(tree).not.toContain('나무 건너뛰기');
    const tower = helpOf('W3');
    expect(tower).toContain('종의 가로 자리 바꾸기(전위는 그대로예요)');
    expect(tower).toContain('종 소리 끄고 켜기');
    expect(tower).not.toContain('PageUp PageDown');
    expect(tower).not.toContain('Backspace');
    const glade = helpOf('W4');
    expect(glade).toContain('나무 건너뛰기');
    expect(glade).toContain('고른 나무의 화음만 듣기');
  });

  it('패널로 보기: 자유로 놀 때는 알리기만 하고, 과제에서는 그 판본의 패널을 연다', () => {
    const t = boot();
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([]);
    expect(live(t)).toBe(FREE_PLAY_NO_PANEL);
    act(() => void t.ic.select(G_MAJOR));
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([`#/q/${Q05}/g-major`]);
  });
});

describe('키보드(bellKeys의 표)', () => {
  it('→ ←는 종 자리를 옮기고 브라우저의 동작을 막는다', () => {
    const t = boot({ key: C_MAJOR });
    expect(t.press('ArrowRight').defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(0);
    t.press('ArrowRight');
    expect(t.bench.cursor).toBe(1);
    t.press('ArrowLeft');
    expect(t.bench.cursor).toBe(0);
    expect(t.navigations).toEqual([]);
  });

  it('↑ ↓는 종의 높이(가지)를, PageUp PageDown은 음이름을, Shift+↑ ↓는 변화표를 바꾼다', () => {
    const t = boot({ key: C_MAJOR });
    t.press('ArrowRight');
    t.press('ArrowUp');
    expect(live(t)).toBe('종 1: 걸 가지는 5옥타브예요.');
    t.press('ArrowDown');
    expect(live(t)).toBe('종 1: 걸 가지는 4옥타브예요.');
    t.press('PageUp');
    expect(hand(t)).toContain('손에 든 종 D');
    t.press('PageUp');
    t.press('PageDown');
    expect(hand(t)).toContain('손에 든 종 D');
    t.press('ArrowUp', { shiftKey: true });
    expect(hand(t)).toContain('손에 든 종 D♯');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    expect(hand(t)).toContain('손에 든 종 D♭');
    t.press('ArrowDown', { shiftKey: true });
    expect(live(t)).toContain('변화표를 더 내릴 수 없어요');
    // 음이름은 끝에서 멈추고 알린다
    for (let i = 0; i < 8; i++) t.press('PageDown');
    expect(hand(t)).toContain('손에 든 종 C♭');
    expect(live(t)).toContain('음이름의 맨 아래예요');
  });

  it('Enter와 Space는 걸고, Backspace는 뺀다. Z와 Y는 되돌린다', () => {
    const t = boot({ key: C_MAJOR });
    t.press('ArrowRight');
    t.press('Enter');
    expect(t.hung()).toEqual(['C4']);
    t.press('ArrowRight');
    t.press('PageUp');
    t.press('PageUp');
    t.press('Space');
    expect(t.hung()).toEqual(['C4', 'E4']);
    t.press('Backspace');
    expect(t.hung()).toEqual(['C4']);
    t.press('KeyZ');
    expect(t.hung()).toEqual(['C4', 'E4']);
    t.press('KeyY');
    expect(t.hung()).toEqual(['C4']);
  });

  it('P·T·S·C는 듣기와 확인이다. V는 패널로 보기다', () => {
    const t = boot({ key: C_MAJOR });
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
    expect(t.navigations).toEqual([`#/q/${Q05}/c-major`]);
  });

  it('R은 듣는 방식을 차례로 바꾼다(함께, 아래부터 차례로, 가장 낮은 종만, 다시 함께)', () => {
    const t = boot({ key: C_MAJOR });
    t.press('KeyR');
    expect(t.hear('ascending').getAttribute('aria-pressed')).toBe('true');
    t.press('KeyR');
    expect(t.hear('lowest').getAttribute('aria-pressed')).toBe('true');
    t.press('KeyR');
    expect(t.hear('together').getAttribute('aria-pressed')).toBe('true');
  });

  it('종탑: Shift+← →는 종을 맞바꾸고 X는 소리를 끄고 켠다. ↑ ↓는 높이를 바꾼다', () => {
    const t = boot({ station: 'W3', key: C_FIRST });
    t.press('ArrowRight');
    expect(t.bench.cursor).toBe(0);
    expect(t.press('ArrowRight', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.hung()).toEqual(['E3', 'C3', 'G3']);
    expect(t.bench.cursor).toBe(1);
    t.press('ArrowLeft', { shiftKey: true });
    expect(t.hung()).toEqual(['C3', 'E3', 'G3']);
    t.press('KeyX');
    expect(t.chip(0).getAttribute('data-muted')).toBe('true');
    t.press('KeyX');
    expect(t.chip(0).hasAttribute('data-muted')).toBe(false);
    t.press('ArrowUp');
    expect(t.hung()).toEqual(['C4', 'E3', 'G3']);
    // 빼기는 없다
    t.press('Backspace');
    expect(live(t)).toBe('종탑의 종은 뺄 수 없어요. 소리를 끄려면 X를 눌러요.');
    expect(t.hung()).toEqual(['C4', 'E3', 'G3']);
  });

  it('나무: X는 소리를 끄지 않고 알리기만 한다. Shift+← →는 쓰지 않아 브라우저에 맡긴다', () => {
    const t = boot({ key: C_MAJOR });
    t.press('Enter');
    t.press('KeyX');
    expect(live(t)).toBe('나무의 종은 소리를 끄지 않고 빼요. 빼려면 Backspace를 눌러요.');
    expect(t.hung()).toEqual(['C4']);
    expect(t.press('ArrowRight', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.press('ArrowLeft', { shiftKey: true }).defaultPrevented).toBe(false);
  });

  it('빈터: Shift+← →는 나무를 건너뛰고 Shift+P는 고른 나무의 화음만 듣는다', () => {
    const t = boot({ station: 'W4', key: PILLARS });
    t.press('ArrowRight', { shiftKey: true });
    expect(t.bench.cursor).toBe(0);
    t.press('ArrowRight', { shiftKey: true });
    expect(t.bench.cursor).toBe(4);
    t.press('Enter');
    expect(t.hung()).toEqual(['C4']);
    t.press('KeyP', { shiftKey: true });
    expect(t.controller.playing).toBe('mine');
    t.press('ArrowLeft', { shiftKey: true });
    expect(t.bench.cursor).toBe(0);
  });

  it('걸기·빼기·듣기는 키를 꾹 눌러도 한 번만 된다. 자리와 높이와 음이름을 옮기는 키는 되풀이된다', () => {
    const t = boot({ key: C_MAJOR });
    t.press('ArrowRight', { repeat: true });
    t.press('ArrowRight', { repeat: true });
    expect(t.bench.cursor).toBe(1);
    t.press('Enter');
    expect(t.hung()).toEqual(['C4']); // 둘째 자리에 걸었다
    expect(t.bench.states().map((s) => s.draft)).toEqual([1]);
    t.press('Enter', { repeat: true });
    t.press('Enter', { repeat: true });
    t.press('Backspace', { repeat: true });
    expect(t.hung()).toEqual(['C4']);
    t.press('PageUp', { repeat: true });
    t.press('PageUp', { repeat: true });
    expect(hand(t)).toContain('손에 든 종 E');
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
    const t = boot({ key: C_MAJOR });
    const button = t.letter('E');
    button.focus();
    expect(t.press('Enter', {}, button).defaultPrevented).toBe(false);
    expect(t.hung()).toEqual([]);
    // 방향키는 초점을 놓는다: 이어서 누르는 Enter가 그 단추가 아니라 걸기가 되게
    const arrow = t.press('ArrowRight', {}, button);
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(button);
    t.press('Enter');
    expect(t.hung()).toEqual(['C4']);
  });

  it('글자를 쓰는 칸에서는 받지 않고, 위의 겹침 화면이 이미 쓴 키(defaultPrevented)도 받지 않는다', () => {
    const t = boot({ key: C_MAJOR });
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
    const t = boot({ key: C_MAJOR });
    expect(t.press('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyP', { altKey: true }).defaultPrevented).toBe(false);
    expect(t.press('PageUp', { metaKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyQ').defaultPrevented).toBe(false);
    expect(t.press('Tab').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
  });

  it('앱 전체의 단축키(M 지도, L 목록, N 수첩)는 가로채지 않는다', () => {
    const t = boot({ key: C_MAJOR });
    for (const code of ['KeyM', 'KeyL', 'KeyN']) expect(t.press(code).defaultPrevented, code).toBe(false);
  });

  it('월드가 멈춰 있는 동안(패널이 위에 열려 있을 때)과 모드를 나온 뒤에는 받지 않는다', () => {
    const t = boot({ key: C_MAJOR });
    act(() => t.bridge.pause.set(true));
    expect(t.press('ArrowRight').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
    act(() => t.bridge.pause.set(false));
    act(() => t.ic.exit());
    expect(t.press('Enter').defaultPrevented).toBe(false);
    expect(t.navigations).toEqual([]);
  });

  it('표지판 목록 안에서는 목록이 키를 쓴다: ↑ ↓로 항목을 옮기고 → 키는 종 자리를 옮기지 않는다. Esc로 닫으면 표지판 단추로 돌아온다', () => {
    const t = boot();
    const toggle = q<HTMLButtonElement>(t.host, '[data-sign-toggle]')!;
    toggle.focus();
    click(toggle);
    expect(document.activeElement).toBe(q(t.host, '[data-sign="free"]'));
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(down));
    expect(document.activeElement).toBe(q(t.host, `[data-sign="${C_MAJOR}"]`));
    const right = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(right));
    expect(t.bench.cursor).toBeNull();
    t.press('Escape', {}, document.activeElement!);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe('조작 막대가 가리는 높이를 월드에 알린다(카메라가 종나무를 막대 위쪽에 담는다)', () => {
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
    ['W2', `${Q20}/c-minor`],
    ['W2', `${Q20}/a-minor`],
    ['W2', `${Q20}/d-minor`],
    ['W2', `${Q20}/e-minor`],
    ['W2', `${Q22}/b-dim`],
    ['W2', `${Q22}/c-aug`],
    ['W4', PILLARS],
    ['W4', WALK],
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
