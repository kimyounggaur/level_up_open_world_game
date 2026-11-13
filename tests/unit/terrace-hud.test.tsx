// @vitest-environment jsdom
// 7-1 계단밭(T5, 4.7)의 화면: 표지판, 고른 열 읽기, 변화표 선반(자유로 놀기), 조작 막대, 도움 카드, 확인 결과, 키보드. 끌지 않아도 모두 된다(W-4).
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 계단밭 작업대만으로 화면이 하는 일을 확인한다. 월드 그림은 terrace-layer와 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import { describeStaffPosition } from '@/domain/staff';
import { TERRACE_COLUMNS } from '@/domain/terrace';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { FREE_IDLE_TEXT } from '@/ui/challenge/slotText';
import { staffPassedText } from '@/ui/challenge/staffText';
import { terraceKeyTableOf } from '@/ui/challenge/terraceKeys';
import { NO_ACCIDENTAL_NOTICE, terraceIdleLead } from '@/ui/challenge/terraceText';
import { FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import { TerraceHud } from '@/ui/installation/TerraceHud';
import { loadRegionDefs } from '../../tools/world-files';
import { Q01, installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q09 = 'staff.lines-and-spaces';
const Q10 = 'staff.ledger-lines';
const Q11 = 'staff.middle-c-neighbors';
const Q12 = 'staff.range-ladder';
const ID = {
  N1: 'inst.staff-hill.treble-terrace',
  N2: 'inst.staff-hill.bass-terrace',
  N3: 'inst.staff-hill.middle-ledge',
} as const;
type Station = keyof typeof ID;
const T_LINES = `${Q09}/treble-lines`;
const T_SPACES = `${Q09}/treble-spaces`;
const T_LEDGER = `${Q10}/treble-ledger`;
const T_FAR = `${Q10}/treble-far-ledger`;
const B_LINES = `${Q09}/bass-lines`;
const B_LEDGER = `${Q10}/bass-ledger`;
const MIDDLE_C = `${Q01}/middle-c`;
const NEIGHBORS = `${Q11}/neighbors`;
const LADDER = `${Q12}/c3-c5`;

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
  /** 들어갈 정거장. 기본은 N1(높은음 밭) */
  station?: Station;
}

function boot(opts: BootOptions = {}) {
  const { enter, touchOnly, inert, key, station = 'N1', ...rigOptions } = opts;
  const r = rig({ definitions: [Q01, Q09, Q10, Q11, Q12].map(quest), ...rigOptions });
  const bridge = new WorldBridge({ x: 4200, y: 1000, facing: 'down' });
  const defs = { N1: installation(ID.N1), N2: installation(ID.N2), N3: installation(ID.N3) };
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: Object.values(defs),
    panels: new Set(['panel.clef']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  const navigations: string[] = [];
  ic.setNavigator((hash) => void navigations.push(hash));
  if (enter !== false) {
    act(() => void ic.enter(station));
    if (key) act(() => void ic.select(key));
  }
  const inst = defs[station];
  const bench = ic.terraceOf(inst)!;
  const m = mount(
    <TerraceHud
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
  const accidental = (name: 'flat' | 'none' | 'sharp'): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-accidental="${name}"]`)!;
  /** 지금 놓인 등의 높이(열 차례, 비면 null) */
  const steps = (): Array<number | null> => bench.states().map((s) => s.step);
  const names = (): Array<string | null> => bench.states().map((s) => s.name);
  return { ...r, bridge, inst, ic, bench, m, host: m.host, navigations, hud, press, action, accidental, steps, names };
}

type T = ReturnType<typeof boot>;
const live = (t: T): string => text(q(t.host, '[data-live]'));
/** 고른 열을 보이는 줄 */
const hand = (t: T): string => text(q(t.host, '.inst-hand'));
const actions = (t: T): string[] => qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action')!);
const hearable = (t: T): string[] => qa(t.host, '[data-terrace-list] li').map((li) => text(li));

describe('들어가면 계단밭 작업대가 나타난다', () => {
  it('모드 밖에서는 아무것도 그리지 않는다. 들어가면 나타나고, 나오면 사라진다', () => {
    const t = boot({ enter: false });
    expect(t.hud()).toBeNull();
    act(() => void t.ic.enter('N1'));
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe(`${t.inst.name} 작업대`);
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(ID.N1);
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    expect(t.hud()!.getAttribute('data-terrace-columns')).toBe(String(TERRACE_COLUMNS));
    act(() => t.ic.exit());
    expect(t.hud()).toBeNull();
  });

  it('열의 수는 판본을 따른다(자유로 놀기는 여덟 열)', () => {
    expect(boot({ key: T_LINES }).hud()!.getAttribute('data-terrace-columns')).toBe('5');
    expect(boot({ key: T_SPACES }).hud()!.getAttribute('data-terrace-columns')).toBe('4');
    expect(boot({ key: T_LEDGER }).hud()!.getAttribute('data-terrace-columns')).toBe('2');
    expect(boot({ station: 'N3', key: LADDER }).hud()!.getAttribute('data-terrace-columns')).toBe('7');
    expect(boot({ station: 'N3', key: NEIGHBORS }).hud()!.getAttribute('data-terrace-columns')).toBe('6');
  });

  it('조작 막대의 모든 동작이 단추로 있다(끌지 않아도 모두 된다)', () => {
    const t = boot();
    expect(actions(t)).toEqual(['cursor-left', 'cursor-right', 'step-up', 'step-down', 'octave-up', 'octave-down', 'place', 'remove', 'undo', 'redo', 'hear-mine', 'hear-target', 'stop', 'check', 'view-panel', 'help', 'exit']);
    expect(qa(t.host, '[draggable]')).toHaveLength(0);
    expect(t.action('step-up').getAttribute('aria-label')).toBe('등을 한 칸 위로');
    expect(t.action('octave-down').getAttribute('aria-label')).toBe('등을 한 옥타브 아래로');
  });

  it.each(['N1', 'N2', 'N3'] as const)('%s: 단추는 모두 이름을 달고 있고, 조작 막대 단추는 키 안내(aria-keyshortcuts)를 갖는다. 보이는 이름이 곧 접근 이름이다', (station) => {
    const t = boot({ station });
    const check = (): void => {
      for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
        expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
        expect(b.getAttribute('aria-keyshortcuts'), b.outerHTML).toBeTruthy();
        expect(b.type).toBe('button');
        const visible = text(q(b, '.inst-btn-label'));
        expect(b.getAttribute('aria-label')!.includes(visible), `${b.getAttribute('aria-label')} ⊇ ${visible}`).toBe(true);
      }
    };
    // 열을 고르기 전, 고른 뒤(빈 열), 등을 놓은 뒤: 놓기 단추의 이름이 바뀌는 세 가지 모습을 모두 본다
    check();
    expect(t.action('place').getAttribute('aria-label')).toBe('첫 열 고르기');
    click(t.action('cursor-right'));
    check();
    expect(t.action('place').getAttribute('aria-label')).toBe(`${t.bench.cursorColumn()!.label} 열에 등 놓기`);
    click(t.action('step-up'));
    check();
    expect(t.action('place').getAttribute('aria-label')).toBe('놓은 등 울려 보기');
  });

  it('눈에 보이지 않는 알림 칸이 컨트롤러의 알림을 그대로 읽어 준다', () => {
    const t = boot({ key: T_LINES });
    const region = q(t.host, '[data-live]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    click(t.action('cursor-right'));
    expect(live(t)).toBe('E4 열, 비어 있어요.');
  });

  it('화면 낭독기가 열마다 둘러볼 수 있는 목록이 있다: 월드의 밭은 그림이라 읽히지 않는다', () => {
    const t = boot({ key: T_LINES });
    const list = q(t.host, '[data-terrace-list]')!;
    expect(list.getAttribute('aria-label')).toBe('열 목록');
    expect(list.classList.contains('sr-only')).toBe(true);
    expect(hearable(t)).toEqual(['E4 열, 비어 있어요.', 'G4 열, 비어 있어요.', 'B4 열, 비어 있어요.', 'D5 열, 비어 있어요.', 'F5 열, 비어 있어요.']);
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    // 문제를 푸는 중에는 보표 위치만 읽는다(이름은 밝히지 않는다)
    expect(hearable(t)[0]).toBe(`E4 열, ${describeStaffPosition(4)}에 있어요.`);
    expect(hearable(t)[1]).toBe('G4 열, 비어 있어요.');
  });

  it('inert가 켜져 있으면(위에 안내 카드가 떠 있을 때) 단추가 눌리지 않는다', () => {
    expect(boot({ inert: true }).hud()!.hasAttribute('inert')).toBe(true);
    expect(boot().hud()!.hasAttribute('inert')).toBe(false);
  });

  it('키보드 안내 줄은 키보드가 있는 화면에만 있고, 변화표를 쓸 때만 변화표 키를 안내한다. 터치 전용 화면에는 없다', () => {
    const free = text(q(boot().host, '.inst-hint'));
    expect(free).toContain('← → 열');
    expect(free).toContain('↑ ↓ 한 칸');
    expect(free).toContain('PgUp PgDn 한 옥타브');
    expect(free).toContain('Shift+↑↓ 변화표');
    const quest = text(q(boot({ key: T_LINES }).host, '.inst-hint'));
    expect(quest).toContain('PgUp PgDn 한 옥타브');
    expect(quest).not.toContain('Shift+↑↓');
    expect(q(boot({ touchOnly: true }).host, '.inst-hint')).toBeNull();
  });
});

describe('고른 열과 등 놓기(단추)', () => {
  it('열을 고르기 전에는 고른 열이 없다고 말한다. → 단추로 첫 열부터 고르고 글로 알린다', () => {
    const t = boot({ key: T_LINES });
    expect(hand(t)).toBe('고른 열 없음 · 열을 고르세요');
    expect(q(t.host, '.inst-hand')!.hasAttribute('data-selected-column')).toBe(false);
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('고른 열 E4 · 비어 있어요');
    expect(q(t.host, '.inst-hand')!.getAttribute('data-selected-column')).toBe('0');
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('고른 열 G4 · 비어 있어요');
    click(t.action('cursor-left'));
    expect(hand(t)).toContain('고른 열 E4');
    click(t.action('cursor-left'));
    expect(live(t)).toContain('첫 열이에요');
  });

  it('↑ 단추: 빈 열에는 가운데 줄에 등이 놓인다. 문제를 푸는 중에는 보표 위치만 말하고 음 이름은 말하지 않는다', () => {
    const t = boot({ key: T_LINES });
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    expect(t.steps()).toEqual([6, null, null, null, null]);
    expect(hand(t)).toBe(`고른 열 E4 · ${describeStaffPosition(4)}`);
    expect(live(t)).toBe(`E4 등을 ${describeStaffPosition(4)}에 놓았어요.`);
    expect(live(t)).not.toMatch(/B4/);
    expect(hand(t)).not.toMatch(/B4/);
  });

  it('↑ ↓ 단추는 한 칸씩, 옥타브 단추는 일곱 칸씩 옮기고 범위의 끝에서는 멈추고 알린다', () => {
    const t = boot({ key: T_LINES });
    click(t.action('cursor-right'));
    click(t.action('step-up')); // 6
    click(t.action('step-up')); // 7
    expect(t.steps()[0]).toBe(7);
    click(t.action('step-down'));
    expect(t.steps()[0]).toBe(6);
    click(t.action('octave-up'));
    expect(t.steps()[0]).toBe(13);
    click(t.action('octave-up'));
    expect(t.steps()[0]).toBe(14); // 맨 위(C6)까지만
    click(t.action('octave-up'));
    expect(live(t)).toContain('더 위로 옮길 수 없어요');
    click(t.action('octave-down'));
    click(t.action('octave-down'));
    click(t.action('octave-down'));
    expect(t.steps()[0]).toBe(-2); // 맨 아래(A3)까지만
    click(t.action('step-down'));
    expect(live(t)).toContain('더 아래로 옮길 수 없어요');
  });

  it('놓기 단추: 열을 고르지 않았으면 첫 열을 고르기만 하고, 빈 열에는 놓고, 놓인 열에서는 울려 볼 뿐 바꾸지 않는다', () => {
    const t = boot({ key: T_LINES });
    click(t.action('place'));
    expect(t.bench.cursor).toBe(0);
    expect(t.steps()).toEqual([null, null, null, null, null]);
    click(t.action('place'));
    expect(t.steps()).toEqual([6, null, null, null, null]);
    const before = JSON.stringify(t.session.contentOf(Q09, 'treble-lines'));
    click(t.action('place'));
    expect(JSON.stringify(t.session.contentOf(Q09, 'treble-lines'))).toBe(before);
    expect(live(t)).toBe(`E4 열, ${describeStaffPosition(4)}에 있어요.`);
  });

  it('빼기 단추는 고른 열에 등이 있을 때만 눌린다. 누르면 그 등이 빠진다', () => {
    const t = boot({ key: T_LINES });
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('cursor-right'));
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('step-up'));
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(t.steps()).toEqual([null, null, null, null, null]);
    expect(live(t)).toBe('E4 등을 뺐어요.');
    expect(t.action('remove').disabled).toBe(true);
  });

  it('실행 취소와 다시 실행 단추는 할 수 있을 때만 눌린다', () => {
    const t = boot({ key: T_LINES });
    expect(t.action('undo').disabled).toBe(true);
    expect(t.action('redo').disabled).toBe(true);
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    expect(t.action('undo').disabled).toBe(false);
    click(t.action('undo'));
    expect(t.steps()[0]).toBeNull();
    expect(t.action('redo').disabled).toBe(false);
    click(t.action('redo'));
    expect(t.steps()[0]).toBe(6);
  });

  it('고른 열의 읽기 줄은 열이 고른 음자리표와 이름을 따라간다: 가운데 턱은 같은 이름이 두 음자리표로 나뉜다', () => {
    const t = boot({ station: 'N3', key: NEIGHBORS });
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('고른 열 B3 · 높은음자리표 · 비어 있어요');
    click(t.action('cursor-right'));
    expect(hand(t)).toBe('고른 열 B3 · 낮은음자리표 · 비어 있어요');
    click(t.action('step-up')); // 낮은음자리표의 가운데 줄 D3
    expect(t.bench.states()[1]).toMatchObject({ step: -6, midi: 50 });
    expect(hand(t)).toBe(`고른 열 B3 · 낮은음자리표 · ${describeStaffPosition(4)}`);
  });
});

describe('변화표 선반(자유로 놀기)', () => {
  it('변화표를 쓰지 않는 과제에는 선반이 없다. 키로 눌러도 쓰지 않는다고 알리기만 한다', () => {
    const t = boot({ key: T_LINES });
    expect(qa(t.host, '[data-accidental]')).toHaveLength(0);
    expect(q(t.host, '.inst-shelf')).toBeNull();
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    t.press('ArrowUp', { shiftKey: true });
    expect(live(t)).toBe(NO_ACCIDENTAL_NOTICE);
    expect(t.bench.states()[0]!.written?.accidental ?? null).toBeNull();
  });

  it('자유로 놀기에는 내림표, 없음, 올림표 세 단추가 있고 등이 있는 열을 골랐을 때만 눌린다', () => {
    const t = boot();
    expect(qa(t.host, '[data-accidental]').map((b) => b.getAttribute('data-accidental'))).toEqual(['flat', 'none', 'sharp']);
    expect(qa(t.host, '[data-accidental]').map((b) => b.getAttribute('aria-label'))).toEqual(['내림표', '변화표 없음', '올림표']);
    expect(qa(t.host, '[data-accidental]').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    click(t.action('cursor-right'));
    expect(qa(t.host, '[data-accidental]').every((b) => (b as HTMLButtonElement).disabled)).toBe(true); // 빈 열
    click(t.action('step-up'));
    expect(qa(t.host, '[data-accidental]').every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    for (const b of qa(t.host, '[data-accidental]')) expect(b.getAttribute('aria-pressed')).not.toBeNull();
  });

  it('올림표와 내림표를 달고 떼면 이름이 바뀐다. 눌린 표시(aria-pressed)가 달린 변화표를 따라간다', () => {
    const t = boot();
    click(t.action('cursor-right'));
    click(t.action('step-up')); // 가운데 줄 B4
    expect(t.accidental('none').getAttribute('aria-pressed')).toBe('true');
    expect(t.accidental('sharp').getAttribute('aria-pressed')).toBe('false');
    expect(hand(t)).toContain('B4, ');
    click(t.accidental('sharp'));
    expect(t.names()[0]).toBe('B♯4');
    expect(t.accidental('sharp').getAttribute('aria-pressed')).toBe('true');
    expect(t.accidental('none').getAttribute('aria-pressed')).toBe('false');
    expect(hand(t)).toContain('B♯4, ');
    click(t.accidental('flat'));
    expect(t.names()[0]).toBe('B♭4');
    expect(t.accidental('flat').getAttribute('aria-pressed')).toBe('true');
    click(t.accidental('none'));
    expect(t.names()[0]).toBe('B4');
    expect(t.accidental('none').getAttribute('aria-pressed')).toBe('true');
  });

  it('자유로 놀 때는 이름도 말한다(문제를 푸는 중과 달리 높이를 찾는 일이 문제가 아니다)', () => {
    const t = boot();
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    expect(live(t)).toContain('B4');
    expect(hand(t)).toContain('B4');
    expect(hearable(t)[0]).toContain('B4');
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

  it('과제의 안내: 등을 놓기 전, 일부를 놓은 뒤, 모두 놓은 뒤가 다르다. 확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const t = boot({ key: T_LINES });
    expect(text(q(t.host, '.feedback-idle'))).toBe(terraceIdleLead(5, 0));
    expect(text(q(t.host, '.feedback-idle'))).toBe("열마다 등을 놓고 '배치 확인'을 눌러 보세요.");
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    expect(text(q(t.host, '.feedback-idle'))).toBe(terraceIdleLead(5, 1));
    expect(text(q(t.host, '.feedback-idle'))).toBe("등이 1개 놓여 있어요. 모두 놓고 '배치 확인'을 눌러 보세요.");
    for (let i = 0; i < 4; i++) {
      click(t.action('cursor-right'));
      click(t.action('step-up'));
    }
    expect(text(q(t.host, '.feedback-idle'))).toBe("다 놓았어요. '배치 확인'을 눌러 보세요.");
  });

  /** 높이(온음계 칸 수)를 눌러 놓는다(월드가 하는 일과 같은 길) */
  const lay = (t: T, column: number, step: number): void => {
    act(() => {
      t.bridge.events.send({ type: 'slot-pressed', installationId: t.inst.installationId, slot: column, step });
    });
  };

  it('틀린 배치를 확인하면 기호와 문장으로 알린다. 어디가 틀렸는지 목표 음과 보표 위치로 말한다', () => {
    const t = boot({ key: T_LINES });
    // E4 G4 B4 D5 F5 중 둘째 열을 한 칸 위(A4)에 놓았다
    for (const [column, step] of [[1, 2], [2, 5], [3, 6], [4, 8], [5, 10]] as const) lay(t, column, step);
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('needsRevision');
    expect(box.classList.contains('is-error')).toBe(true);
    const lines = qa(box, '.feedback-line');
    expect(lines).toHaveLength(1);
    expect(q(box, '.feedback-line svg path')!.getAttribute('d')).toBe(ALERT_PATH);
    expect(q(box, '.feedback-line strong')).not.toBeNull(); // 기호만이 아니라 굵은 글씨로도 알린다
    expect(text(lines[0]!)).toContain('지금 위치는 A4예요.');
    expect(text(lines[0]!)).toContain('목표 G4는 높은음자리표의');
    expect(q(box, '.feedback-idle')).toBeNull();
  });

  it('틀린 곳이 셋보다 많으면 셋까지만 보이고 나머지는 열 위의 표시를 보라고 말한다', () => {
    const t = boot({ key: T_LINES });
    for (const [column, step] of [[1, 3], [2, 6], [3, 7], [4, 9], [5, 11]] as const) lay(t, column, step); // 모두 한 칸 위
    click(t.action('check'));
    expect(qa(t.host, '.inst-feedback .feedback-line')).toHaveLength(3);
    expect(text(q(t.host, '.feedback-more'))).toBe('그 밖에 2가지가 더 있어요. 열 위의 ! 표시를 보세요.');
    expect(t.bench.flagged()).toEqual([0, 1, 2, 3, 4]);
  });

  it('고치면 지난 확인 결과는 사라지고 안내로 돌아간다', () => {
    const t = boot({ key: T_LINES });
    lay(t, 1, 3);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    lay(t, 1, 2);
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(q(t.host, '.feedback-idle')).not.toBeNull();
  });

  it('다 맞게 놓고 확인하면 통과하고, 놓은 음이 모두 목표와 같다는 문장을 보인다', () => {
    const t = boot({ key: T_LINES });
    for (const [column, step] of [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]] as const) lay(t, column, step);
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    expect(box.classList.contains('is-ok')).toBe(true);
    expect(text(box)).toContain('통과했어요.');
    expect(text(box)).toContain(staffPassedText(t.bench.columns()));
    expect(text(box)).toContain('놓은 음이 모두 목표와 같아요.');
  });

  it('가운데 턱의 두 보표 과제(Q01)는 통과 문장이 두 보표를 말한다', () => {
    const t = boot({ station: 'N3', key: MIDDLE_C });
    lay(t, 1, 0);
    lay(t, 2, 0);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(t.host, '.inst-feedback'))).toContain('두 보표의 음이 목표와 같아요.');
  });

  it('내 등 듣기: 놓은 등이 없으면 알림만 하고, 있으면 듣는 중이라고 글로 알린다. 정지는 듣는 동안에만 눌린다', () => {
    const t = boot({ key: T_LINES });
    expect(t.action('stop').disabled).toBe(true);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBeNull();
    expect(text(q(t.host, '[data-notice]'))).toContain('아직 놓은 등이 없어요');
    click(t.action('cursor-right'));
    click(t.action('step-up'));
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toContain('내 등을 듣는 중이에요.');
    expect(t.action('stop').disabled).toBe(false);
    click(t.action('stop'));
    expect(t.controller.playing).toBeNull();
    expect(q(t.host, '[data-listening]')).toBeNull();
    expect(t.action('stop').disabled).toBe(true);
  });

  it('목표 듣기: 과제에서는 목표를 듣는 중이라고 알린다', () => {
    const t = boot({ key: T_LINES });
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    expect(text(q(t.host, '[data-listening]'))).toContain('목표를 듣는 중이에요.');
  });

  it('나가기 단추로 나온다', () => {
    const t = boot({ key: T_LINES });
    click(t.action('exit'));
    expect(t.hud()).toBeNull();
  });
});

describe('표지판과 도움 카드', () => {
  it('표지판을 열면 자유로 놀기와 이 밭의 과제 판본이 나타난다. 고르면 그 과제가 열리고 목록이 닫힌다', () => {
    const t = boot();
    expect(text(q(t.host, '.inst-sign-current'))).toContain('자유로 놀기');
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual(['free', T_LINES, T_SPACES, T_LEDGER, T_FAR]);
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false']);
    expect(text(items[1]!)).toContain('검수 전');
    click(items[2]!);
    expect(t.controller.current?.variant.variantId).toBe('treble-spaces');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(t.hud()!.getAttribute('data-target')).toBe(T_SPACES);
    expect(t.hud()!.getAttribute('data-terrace-columns')).toBe('4');
  });

  it('가운데 턱의 표지판은 Q01, Q11, Q12 순서이고, 낮은음 밭의 표지판은 낮은음자리표 판본만 있다', () => {
    const signs = (station: Station): string[] => {
      const t = boot({ station });
      click(q(t.host, '[data-sign-toggle]'));
      return qa(t.host, '[data-sign]').map((b) => b.getAttribute('data-sign')!);
    };
    expect(signs('N3')).toEqual(['free', MIDDLE_C, NEIGHBORS, LADDER, `${Q12}/c2-c6`]);
    expect(signs('N2')).toEqual(['free', B_LINES, `${Q09}/bass-spaces`, B_LEDGER]);
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
    ['과제(변화표 없음)', T_LINES, false],
    ['자유로 놀기(변화표 있음)', undefined, true],
  ] as const)('도움 카드: %s는 그에 맞는 키 표를 보인다. 한 번 더 누르면 닫힌다', (_name, key, accidentals) => {
    const t = boot(key ? { key } : {});
    expect(q(t.host, '#inst-help')).toBeNull();
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(card.getAttribute('aria-label')).toBe('키보드 도움');
    const table = terraceKeyTableOf(accidentals);
    expect(qa(card, '.help-list li')).toHaveLength(table.length);
    for (const row of table) {
      expect(text(card)).toContain(row.keys);
      expect(text(card)).toContain(row.label);
    }
    expect(text(card).includes('Shift+↑ ↓')).toBe(accidentals);
    expect(text(card)).toContain('PageUp PageDown');
    expect(text(card)).toContain('끌지 않아도 모두 할 수 있어요');
    expect(t.action('help').getAttribute('aria-expanded')).toBe('true');
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
  });

  it('패널로 보기: 자유로 놀 때는 알리기만 하고, 과제에서는 그 판본의 패널을 연다', () => {
    const t = boot();
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([]);
    expect(live(t)).toBe(FREE_PLAY_NO_PANEL);
    act(() => void t.ic.select(T_SPACES));
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([ContentCatalog.hashFor(Q09, 'treble-spaces')]);
  });
});

describe('키보드(terraceKeys의 표)', () => {
  it('→ ←는 열을 옮기고 브라우저의 동작을 막는다', () => {
    const t = boot({ key: T_LINES });
    expect(t.press('ArrowRight').defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(0);
    t.press('ArrowRight');
    expect(t.bench.cursor).toBe(1);
    t.press('ArrowLeft');
    expect(t.bench.cursor).toBe(0);
    expect(t.navigations).toEqual([]);
  });

  it('↑ ↓는 등을 한 칸씩, PageUp PageDown은 한 옥타브씩 옮긴다', () => {
    const t = boot({ key: T_LINES });
    t.press('ArrowRight');
    expect(t.press('ArrowUp').defaultPrevented).toBe(true);
    expect(t.steps()[0]).toBe(6); // 빈 열: 가운데 줄에 놓인다
    t.press('ArrowUp');
    expect(t.steps()[0]).toBe(7);
    t.press('ArrowDown');
    t.press('ArrowDown');
    expect(t.steps()[0]).toBe(5);
    t.press('PageUp');
    expect(t.steps()[0]).toBe(12);
    t.press('PageDown');
    t.press('PageDown');
    expect(t.steps()[0]).toBe(-2); // -9가 아니라 맨 아래까지
  });

  it('Shift+↑ ↓는 변화표다(자유로 놀기): 올림표와 내림표를 달고, 끝에서는 멈추고 알린다', () => {
    const t = boot();
    t.press('ArrowRight');
    t.press('ArrowUp'); // B4
    t.press('ArrowUp', { shiftKey: true });
    expect(t.names()[0]).toBe('B♯4');
    t.press('ArrowUp', { shiftKey: true });
    expect(live(t)).toContain('변화표를 더 올릴 수 없어요');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    expect(t.names()[0]).toBe('B♭4');
    expect(t.steps()[0]).toBe(6); // 높이는 그대로다
  });

  it('Enter와 Space는 놓고, Backspace는 뺀다. Z와 Y는 되돌린다', () => {
    const t = boot({ key: T_LINES });
    t.press('ArrowRight');
    t.press('Enter');
    expect(t.steps()).toEqual([6, null, null, null, null]);
    t.press('ArrowRight');
    t.press('Space');
    expect(t.steps()).toEqual([6, 6, null, null, null]);
    t.press('Backspace');
    expect(t.steps()).toEqual([6, null, null, null, null]);
    t.press('KeyZ');
    expect(t.steps()).toEqual([6, 6, null, null, null]);
    t.press('KeyY');
    expect(t.steps()).toEqual([6, null, null, null, null]);
  });

  it('P·T·S·C는 듣기와 확인이다. V는 패널로 보기다', () => {
    const t = boot({ key: T_LINES });
    t.press('Enter');
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
    expect(t.navigations).toEqual([ContentCatalog.hashFor(Q09, 'treble-lines')]);
  });

  it('걸어서 놓기·빼기·듣기는 키를 꾹 눌러도 한 번만 된다. 열과 높이와 변화표를 옮기는 키는 되풀이된다', () => {
    const t = boot({ key: T_LINES });
    t.press('ArrowRight', { repeat: true });
    t.press('ArrowRight', { repeat: true });
    expect(t.bench.cursor).toBe(1); // 열을 둘 옮겼다(첫 열 → 둘째 열)
    t.press('Enter', { repeat: true }); // 놓기는 되풀이되지 않는다
    expect(t.steps()).toEqual([null, null, null, null, null]);
    t.press('Enter');
    expect(t.steps()).toEqual([null, 6, null, null, null]);
    t.press('ArrowUp', { repeat: true });
    t.press('ArrowUp', { repeat: true });
    expect(t.steps()[1]).toBe(8);
    t.press('PageDown', { repeat: true });
    expect(t.steps()[1]).toBe(1);
    t.press('Backspace', { repeat: true });
    expect(t.steps()[1]).toBe(1);
    t.press('KeyP', { repeat: true });
    expect(t.controller.playing).toBeNull();
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
    const t = boot({ key: T_LINES });
    const button = t.action('cursor-right');
    button.focus();
    expect(t.press('Enter', {}, button).defaultPrevented).toBe(false);
    expect(t.steps()).toEqual([null, null, null, null, null]);
    // 방향키는 초점을 놓는다: 이어서 누르는 Enter가 그 단추가 아니라 놓기가 되게
    const arrow = t.press('ArrowRight', {}, button);
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(button);
    t.press('Enter');
    expect(t.steps()).toEqual([6, null, null, null, null]);
  });

  it('글자를 쓰는 칸에서는 받지 않고, 위의 겹침 화면이 이미 쓴 키(defaultPrevented)도 받지 않는다', () => {
    const t = boot({ key: T_LINES });
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
    const t = boot({ key: T_LINES });
    expect(t.press('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyP', { altKey: true }).defaultPrevented).toBe(false);
    expect(t.press('PageUp', { metaKey: true }).defaultPrevented).toBe(false);
    expect(t.press('PageUp', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyQ').defaultPrevented).toBe(false);
    expect(t.press('Tab').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
  });

  it('앱 전체의 단축키(M 지도, L 목록, N 수첩)는 가로채지 않는다', () => {
    const t = boot({ key: T_LINES });
    for (const code of ['KeyM', 'KeyL', 'KeyN']) expect(t.press(code).defaultPrevented, code).toBe(false);
  });

  it('월드가 멈춰 있는 동안(패널이 위에 열려 있을 때)과 모드를 나온 뒤에는 받지 않는다', () => {
    const t = boot({ key: T_LINES });
    act(() => t.bridge.pause.set(true));
    expect(t.press('ArrowRight').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
    act(() => t.bridge.pause.set(false));
    act(() => t.ic.exit());
    expect(t.press('Enter').defaultPrevented).toBe(false);
    expect(t.navigations).toEqual([]);
  });

  it('표지판 목록 안에서는 목록이 키를 쓴다: ↑ ↓로 항목을 옮기고 → 키는 열을 옮기지 않는다. Esc로 닫으면 표지판 단추로 돌아온다', () => {
    const t = boot();
    const toggle = q<HTMLButtonElement>(t.host, '[data-sign-toggle]')!;
    toggle.focus();
    click(toggle);
    expect(document.activeElement).toBe(q(t.host, '[data-sign="free"]'));
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(down));
    expect(document.activeElement).toBe(q(t.host, `[data-sign="${T_LINES}"]`));
    const right = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(right));
    expect(t.bench.cursor).toBeNull();
    t.press('Escape', {}, document.activeElement!);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe('조작 막대가 가리는 높이를 월드에 알린다(카메라가 밭을 막대 위쪽에 담는다)', () => {
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
  /**
   * 계단밭 세 곳에 놓인 판본 전부(Q01의 가운데 턱 판본과 새 과제 Q09–Q12의 열 개)를 콘텐츠에서 읽는다.
   * 7-8 전에는 이 가운데 여섯만 손으로 적어 두었고 나머지 다섯(Q09의 높은음 칸·낮은음 줄·낮은음 칸, Q10의 높은음 덧줄, Q12의 높은 도전)은 시험에서 빠져 있었다.
   */
  const CASES: Array<readonly [Station, string]> = (Object.keys(ID) as Station[]).flatMap((station) =>
    [Q01, Q09, Q10, Q11, Q12].flatMap((qid) => quest(qid).placements.flatMap((p) => (p.kind === 'installation' && p.installationId === ID[station] ? p.variantIds.map((vid) => [station, `${qid}/${vid}`] as const) : []))),
  );

  it('계단밭에 놓인 판본을 하나도 빠뜨리지 않는다: 높은음 밭(N1) 넷, 낮은음 밭(N2) 셋, 가운데 턱(N3) 넷', () => {
    expect(CASES.map(([station, key]) => `${station} ${key}`).sort()).toEqual(
      [
        [T_LINES, T_SPACES, T_LEDGER, T_FAR].map((k) => `N1 ${k}`),
        [B_LINES, `${Q09}/bass-spaces`, B_LEDGER].map((k) => `N2 ${k}`),
        [MIDDLE_C, NEIGHBORS, LADDER, `${Q12}/c2-c6`].map((k) => `N3 ${k}`),
      ]
        .flat()
        .sort(),
    );
  });

  it.each(CASES)('%s의 %s: 도움 카드를 열고 닫고, 목표와 내 등을 들어도 기록되는 시도는 없고 작업대에서 그대로 이어진다', (station, key) => {
    const t = boot({ station, key });
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).not.toBeNull();
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    click(t.action('place'));
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
