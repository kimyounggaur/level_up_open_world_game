// @vitest-environment jsdom
// 4.2 설치물 모드의 화면: 표지판, 재료 선반, 조작 막대, 도움 카드, 확인 결과, 키보드. 끌지 않아도 모두 된다(W-4).
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 작업대만으로 화면이 하는 일을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { BENCH_KEY_TABLE } from '@/ui/challenge/benchKeys';
import { FREE_IDLE_TEXT, slotIdleLead, slotIdleText, slotPassedText } from '@/ui/challenge/slotText';
import { InstallationHud } from '@/ui/installation/InstallationHud';
import { FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

beforeAll(() => setupDom());

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  Element.prototype.getBoundingClientRect = originalRect;
});
const originalRect = Element.prototype.getBoundingClientRect;

interface BootOptions extends RigOptions {
  enter?: boolean;
  touchOnly?: boolean;
  inert?: boolean;
  panels?: string[];
}

function boot(opts: BootOptions = {}) {
  const r = rig(opts);
  const bridge = new WorldBridge({ x: 4530, y: 3655, facing: 'right' });
  const inst = installation();
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [inst],
    panels: new Set(opts.panels ?? ['panel.scale']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  const navigations: string[] = [];
  if (opts.enter !== false) act(() => void ic.enter('H4'));
  const m = mount(
    <InstallationHud
      bridge={bridge}
      controller={r.controller}
      bench={r.bench}
      installation={ic}
      onNavigate={(hash) => navigations.push(hash)}
      touchOnly={opts.touchOnly ?? false}
      {...(opts.inert ? { inert: true } : {})}
    />,
  );
  cleanups.push(() => {
    m.unmount();
    ic.dispose();
    r.bench.dispose();
    r.controller.dispose();
  });
  const hud = (): HTMLElement | null => q(m.host, '[data-installation-hud]');
  const slots = () => bridge.installationViews.get()[0]?.slots ?? [];
  /** 키 누르기. 기본은 문서 본문에서, 창까지 올라간다 */
  const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    act(() => void target.dispatchEvent(ev));
    return ev;
  };
  const action = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-action="${name}"]`)!;
  return { ...r, bridge, inst, ic, m, host: m.host, navigations, hud, slots, press, action };
}

describe('들어가면 작업대가 나타난다', () => {
  it('모드 밖에서는 아무것도 그리지 않는다. 들어가면 나타나고, 나오면 사라진다', () => {
    const t = boot({ enter: false });
    expect(t.hud()).toBeNull();
    act(() => void t.ic.enter('H4'));
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe('음계 디딤돌 작업대');
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe('inst.village.scale-stones');
    act(() => t.ic.exit());
    expect(t.hud()).toBeNull();
  });

  it('표지판 단추, 재료 선반, 변화표, 조작 막대의 모든 동작이 단추로 있다', () => {
    const t = boot();
    expect(text(q(t.host, '[data-sign-toggle]'))).toContain('자유로 놀기');
    expect(qa(t.host, '[data-shelf]')).toHaveLength(t.bench.map.shelf.length);
    expect(qa(t.host, '[data-accidental]').map((b) => b.getAttribute('data-accidental'))).toEqual(['flat', 'none', 'sharp']);
    const names = qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'));
    expect(names).toEqual(['cursor-left', 'cursor-right', 'place', 'remove', 'undo', 'redo', 'hear-mine', 'hear-target', 'stop', 'check', 'view-panel', 'help', 'exit']);
  });

  it('단추는 모두 이름을 달고 있고, 키 안내(aria-keyshortcuts)를 갖는다. 끌어야 하는 것은 없다', () => {
    const t = boot();
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(b.getAttribute('aria-keyshortcuts'), b.outerHTML).toBeTruthy();
      expect(b.type).toBe('button');
    }
    expect(qa(t.host, '[draggable]')).toHaveLength(0);
  });

  it('단추의 이름은 보이는 글자를 포함한다(보이는 이름이 곧 접근 이름)', () => {
    const t = boot();
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      const visible = text(q(b, '.inst-btn-label'));
      expect(b.getAttribute('aria-label')!.includes(visible), `${b.getAttribute('aria-label')} ⊇ ${visible}`).toBe(true);
    }
  });

  it('손에 든 음과 고른 자리를 글로 보인다', () => {
    const t = boot();
    expect(text(q(t.host, '.inst-hand'))).toBe('손에 든 음 C4 · 자리를 고르세요');
    click(t.action('place'));
    expect(text(q(t.host, '.inst-hand'))).toBe('손에 든 음 C4 · 1번째 자리');
  });

  it('눈에 보이지 않는 알림 칸이 컨트롤러의 알림을 그대로 읽어 준다', () => {
    const t = boot();
    const live = q(t.host, '[data-live]')!;
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(text(live)).toContain('음계 디딤돌에 들어왔어요');
    click(t.action('place'));
    expect(text(live)).toBe('1번째 자리에 C4를 놓았어요.');
  });

  it('inert가 켜져 있으면(위에 안내 카드가 떠 있을 때) 단추가 눌리지 않는다', () => {
    const t = boot({ inert: true });
    expect(t.hud()!.hasAttribute('inert')).toBe(true);
    const t2 = boot();
    expect(t2.hud()!.hasAttribute('inert')).toBe(false);
  });

  it('키보드 안내 줄은 키보드가 있는 화면에만 있고, 터치 전용 화면에는 없다', () => {
    expect(q(boot().host, '.inst-hint')).not.toBeNull();
    expect(q(boot({ touchOnly: true }).host, '.inst-hint')).toBeNull();
  });
});

describe('조작 막대: 단추로 놓고, 빼고, 되돌리고, 듣고, 확인한다(W-4 터치만으로)', () => {
  it('놓기는 골라 둔 자리에(없으면 첫 자리에) 손에 든 음을 놓는다', () => {
    const t = boot();
    click(t.action('place'));
    expect(t.slots()[0]).toMatchObject({ name: 'C4', selected: true });
    click(t.action('cursor-right'));
    click(t.action('place'));
    expect(t.slots()[1]).toMatchObject({ name: 'C4', selected: true });
    expect(t.action('place').getAttribute('aria-label')).toBe('2번째 자리에 놓기');
  });

  it('← → 단추는 자리를 옮기고, 처음과 끝에서는 알려 준다', () => {
    const t = boot();
    click(t.action('cursor-right'));
    expect(t.bench.cursor).toBe(1);
    click(t.action('cursor-left'));
    expect(text(q(t.host, '[data-live]'))).toContain('첫 자리예요');
    for (let i = 0; i < 9; i++) click(t.action('cursor-right'));
    expect(t.bench.cursor).toBe(8);
    expect(text(q(t.host, '[data-live]'))).toContain('마지막 자리예요');
  });

  it('빼기는 고른 자리가 비어 있으면 눌리지 않고, 놓인 뒤에는 눌려서 뺀다', () => {
    const t = boot();
    expect(t.action('remove').disabled).toBe(true);
    click(t.action('place'));
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(t.slots()[0]!.name).toBeNull();
    expect(t.action('remove').disabled).toBe(true);
  });

  it('실행 취소와 다시 실행: 할 수 있을 때만 눌린다', () => {
    const t = boot();
    expect(t.action('undo').disabled).toBe(true);
    expect(t.action('redo').disabled).toBe(true);
    click(t.action('place'));
    expect(t.action('undo').disabled).toBe(false);
    click(t.action('undo'));
    expect(t.slots()[0]!.name).toBeNull();
    expect(t.action('redo').disabled).toBe(false);
    click(t.action('redo'));
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('재료 선반: 누른 재료가 손에 들리고 눌림 상태(aria-pressed)로 알린다. 높이가 바뀐다', () => {
    const t = boot();
    const shelf = qa<HTMLButtonElement>(t.host, '[data-shelf]');
    // 선반은 B3부터 D5까지 열 칸이고, 손에는 처음에 C4(둘째 칸)가 들려 있다
    expect(shelf.map((b) => text(b))).toEqual(['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']);
    expect(shelf.map((b) => b.getAttribute('aria-pressed'))).toEqual(shelf.map((_, i) => String(i === 1)));
    click(shelf[4]!);
    expect(shelf.map((b) => b.getAttribute('aria-pressed'))).toEqual(shelf.map((_, i) => String(i === 4)));
    expect(t.bench.hand.shelfIndex).toBe(4);
    expect(text(q(t.host, '.inst-hand strong'))).toBe(t.bench.handName());
    expect(t.bench.handName()).toBe('F4');
  });

  it('변화표: 올림표를 고르면 손에 든 음이 바뀌고 눌림 상태로 알린다. 없음으로 되돌릴 수 있다', () => {
    const t = boot();
    const sharp = q<HTMLButtonElement>(t.host, '[data-accidental="sharp"]')!;
    const none = q<HTMLButtonElement>(t.host, '[data-accidental="none"]')!;
    expect(none.getAttribute('aria-pressed')).toBe('true');
    click(sharp);
    expect(sharp.getAttribute('aria-pressed')).toBe('true');
    expect(none.getAttribute('aria-pressed')).toBe('false');
    expect(t.bench.handName()).toBe('C♯4');
    click(none);
    expect(t.bench.handName()).toBe('C4');
    // 각 변화표 단추는 그림 글자만이 아니라 이름도 갖는다
    expect(sharp.getAttribute('aria-label')).toBe('올림표');
    expect(q(t.host, '[data-accidental="flat"]')!.getAttribute('aria-label')).toBe('내림표');
  });

  it('내 배치 듣기: 소리를 켜지 않아도 듣는 중이라고 글로 알리고, 정지가 눌린다', () => {
    const t = boot();
    click(t.action('place'));
    expect(t.action('stop').disabled).toBe(true);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toBe('내 배치를 듣는 중이에요.');
    expect(t.action('stop').disabled).toBe(false);
    click(t.action('stop'));
    expect(t.controller.playing).toBeNull();
    expect(q(t.host, '[data-listening]')).toBeNull();
  });

  it('아무것도 놓지 않고 듣기를 누르면 놓은 음이 없다고 알린다', () => {
    const t = boot();
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBeNull();
    expect(text(q(t.host, '[data-notice]'))).toContain('놓');
  });

  it('자유로 놀기에서 목표 듣기와 배치 확인은 판정 없이 안내만 한다', () => {
    const t = boot();
    click(t.action('hear-target'));
    expect(q(t.host, '[data-notice]')).not.toBeNull();
    expect(t.controller.playing).toBeNull();
    click(t.action('check'));
    expect(t.controller.feedback).toBeNull();
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
  });

  it('나가기 단추로 나온다', () => {
    const t = boot();
    click(t.action('exit'));
    expect(t.hud()).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
  });
});

describe('표지판: 이 정거장의 과제와 판본을 모두 보여 주고 고른다(4.2)', () => {
  it('처음에는 닫혀 있다. 누르면 자유로 놀기와 과제 판본이 모두 나타난다', () => {
    const t = boot();
    const toggle = q(t.host, '[data-sign-toggle]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual(['free', 'scale.major/c-major', 'scale.major/f-major']);
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(text(items[1]!)).toContain('장음계 배열하기 · C장조');
    expect(text(items[1]!)).toContain('검수 전');
  });

  it('과제를 고르면 그 도전이 열리고 표지판이 닫히고, 표지판 단추가 고른 것을 말한다', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="scale.major/f-major"]'));
    expect(t.controller.current?.variant.variantId).toBe('f-major');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(text(q(t.host, '.inst-sign-current'))).toBe('장음계 배열하기 · F장조');
    expect(t.hud()!.getAttribute('data-target')).toBe('scale.major/f-major');
  });

  it('릴리스에서는 판본이 준비 중이라 눌러도 아무 일 없고(aria-disabled), 이유가 글로 있다. 자물쇠는 없다(W-10)', () => {
    const t = boot({ channel: 'release' });
    click(q(t.host, '[data-sign-toggle]'));
    const f = q<HTMLButtonElement>(t.host, '[data-sign="scale.major/f-major"]')!;
    expect(f.getAttribute('aria-disabled')).toBe('true');
    expect(f.disabled).toBe(false); // disabled 속성은 쓰지 않는다: 눌러서 이유를 읽을 수 있게
    expect(text(f)).toContain('준비 중');
    expect(text(f)).toContain('검수가 끝나면 열려요');
    click(f);
    expect(t.controller.current?.free).toBe(true);
    expect(q(t.host, '#inst-sign-list')).not.toBeNull(); // 닫히지도 않는다
    expect(q(t.host, '#inst-sign-list')!.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨|잠금/);
  });

  it('키보드로 쓸 수 있다: 목록을 열면 초점이 고른 항목으로 가고, 고르거나 Esc로 닫으면 표지판 단추로 돌아온다(W-4)', () => {
    const t = boot();
    const toggle = q<HTMLButtonElement>(t.host, '[data-sign-toggle]')!;
    toggle.focus();
    click(toggle);
    // 목록은 화면 구조상 작업대보다 앞에 있어서, 초점을 옮겨 주지 않으면 Tab이 선반으로 가 버린다
    expect(document.activeElement).toBe(q(t.host, '[data-sign="free"]'));
    click(q(t.host, '[data-sign="scale.major/c-major"]'));
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    // 다시 열면 지금 고른 항목에 초점이 간다
    click(toggle);
    expect(document.activeElement).toBe(q(t.host, '[data-sign="scale.major/c-major"]'));
    t.press('Escape');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    // 단추를 한 번 더 눌러 닫아도 초점은 단추에 있다
    click(toggle);
    click(toggle);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('목록 안에서는 ↑ ↓ Home End로 항목을 옮기고, 놓기와 높이 키는 받지 않는다(Esc만 이쪽에서 받는다)', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(document.activeElement).toBe(items[0]);
    const move = (key: string, from: Element): KeyboardEvent => t.press(key, { key }, from);
    expect(move('ArrowDown', items[0]!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[1]);
    move('ArrowDown', items[1]!);
    expect(document.activeElement).toBe(items[2]);
    move('ArrowDown', items[2]!); // 끝에서는 더 가지 않는다
    expect(document.activeElement).toBe(items[2]);
    move('ArrowUp', items[2]!);
    expect(document.activeElement).toBe(items[1]);
    move('Home', items[1]!);
    expect(document.activeElement).toBe(items[0]);
    move('End', items[0]!);
    expect(document.activeElement).toBe(items[2]);
    // 목록에 초점이 있는 동안 작업대의 키는 일하지 않는다: 손에 든 음도, 고른 자리도 그대로
    expect(q(t.host, '.inst-hand')!.getAttribute('data-hand')).toBe('C4');
    expect(t.slots().some((m) => m.selected)).toBe(false);
    const enter = t.press('Enter', {}, items[1]!);
    expect(enter.defaultPrevented).toBe(false); // 항목 단추의 누르기는 브라우저가 한다
    expect(t.slots().some((m) => m.name !== null)).toBe(false);
  });

  it('방향키는 단추에 있던 초점을 놓아 준다: 이어서 누르는 Enter는 그 단추가 아니라 놓기다', () => {
    const t = boot();
    const shelf = q<HTMLButtonElement>(t.host, '[data-shelf="2"]')!;
    shelf.focus();
    expect(document.activeElement).toBe(shelf);
    const arrow = t.press('ArrowRight', {}, shelf);
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(shelf);
    expect(t.slots()[0]!.selected).toBe(true);
    const enter = t.press('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('고를 수 없는 항목(준비 중)을 눌러도 초점은 목록 안에 남는다', () => {
    const t = boot({ channel: 'release' });
    click(q(t.host, '[data-sign-toggle]'));
    const f = q<HTMLButtonElement>(t.host, '[data-sign="scale.major/f-major"]')!;
    f.focus();
    click(f);
    expect(q(t.host, '#inst-sign-list')).not.toBeNull();
    expect(document.activeElement).toBe(f);
  });

  it('자유로 놀기로 돌아오면 자유로 놀기 안내가 나온다', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="scale.major/c-major"]'));
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="free"]'));
    expect(t.controller.current?.free).toBe(true);
    expect(text(q(t.host, '.inst-sign-current'))).toBe('자유로 놀기');
  });
});

describe('확인 결과: 색만으로 말하지 않는다(7.9 4번)', () => {
  const pickC = (t: ReturnType<typeof boot>): void => {
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="scale.major/c-major"]'));
  };

  it('처음에는 안내 문장만 있다: 자유로 놀기와 과제의 문장이 다르다', () => {
    const t = boot();
    expect(text(q(t.host, '.feedback-idle'))).toBe(FREE_IDLE_TEXT);
    pickC(t);
    expect(text(q(t.host, '.feedback-idle'))).toBe(slotIdleLead(0, 8));
    click(t.action('place'));
    expect(text(q(t.host, '.feedback-idle'))).toBe(slotIdleLead(1, 8));
  });

  it('월드 위에서는 한 줄 안내만 쓰고(자리를 아낀다), 뒷 문장은 패널의 안내에 그대로 있다', () => {
    expect(slotIdleLead(0, 8)).toBe("8자리를 모두 놓고 '배치 확인'을 눌러 보세요.");
    expect(slotIdleLead(8, 8)).toBe("다 놓았어요. '배치 확인'을 눌러 보세요.");
    expect(slotIdleText(0, 8)).toBe(`${slotIdleLead(0, 8)} 확인하기 전에는 맞고 틀림을 알려 주지 않아요.`);
    expect(FREE_IDLE_TEXT).toContain('표지판');
  });

  it('확인 결과는 작업대 안의 맨 위에 있다: 작업대의 높이에 들어가서 카메라가 돌을 그 위쪽에 담는다(돌이 가려지지 않는다)', () => {
    const t = boot();
    const main = q(t.host, '.inst-main')!;
    const fb = q(t.host, '.inst-feedback')!;
    expect(main.contains(fb)).toBe(true);
    expect(main.firstElementChild).toBe(fb);
    expect(q(t.host, '.inst-float')!.contains(fb)).toBe(false);
  });

  it('틀리면 문장과 기호가 함께 나온다. 패널과 같은 문장을 쓰고, 돌 위의 ! 표시도 선다', () => {
    const t = boot();
    pickC(t);
    click(t.action('place')); // 1번 C4: 맞다
    click(t.action('cursor-right'));
    click(t.action('place')); // 2번 C4: 틀리다
    click(t.action('check'));
    const fb = q(t.host, '.inst-feedback')!;
    expect(fb.getAttribute('data-feedback')).toBe('needsRevision');
    expect(fb.className).toContain('is-error');
    const lines = qa(fb, '.feedback-line');
    expect(lines).toHaveLength(3);
    // 줄마다 기호(그림)와 글이 함께 있다
    for (const line of lines) {
      expect(q(line, 'svg.icon'), line.outerHTML).not.toBeNull();
      expect(text(line).length).toBeGreaterThan(5);
    }
    expect(text(lines[0]!)).toBe('두 번째 자리: 지금은 C4예요. 목표는 D4예요.');
    // 문장은 세 줄까지만, 나머지는 개수로 알린다
    expect(text(q(fb, '.feedback-more'))).toBe('그 밖에 4가지가 더 있어요. 돌 위의 ! 표시를 보세요.');
    // 월드로 올라가는 표시: 틀린 자리와 빈 자리
    expect(t.slots().filter((s) => s.flagged).map((s) => s.slot)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  const fillScale = (t: ReturnType<typeof boot>, noteCount = 8): void => {
    for (let i = 0; i < noteCount; i++) {
      click(q(t.host, `[data-shelf="${i + 1}"]`)); // 선반의 둘째 칸(C4)부터
      click(t.action('place'));
      if (i < noteCount - 1) click(t.action('cursor-right'));
    }
  };

  it('올바르게 채우면 통과했다고 문장과 기호로 알리고, 표시는 없다', () => {
    const t = boot();
    pickC(t);
    fillScale(t);
    expect(t.slots().map((s) => s.name)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
    click(t.action('check'));
    const fb = q(t.host, '.inst-feedback')!;
    expect(fb.getAttribute('data-feedback')).toBe('passed');
    expect(fb.className).toContain('is-ok');
    const line = q(fb, '.feedback-line')!;
    expect(q(line, 'svg.icon')).not.toBeNull();
    expect(text(line)).toContain('통과했어요.');
    expect(text(line)).toContain(slotPassedText('C장조', 8));
    expect(t.slots().some((s) => s.flagged)).toBe(false);
  });

  it('고치면 확인 결과가 사라지고 안내 문장으로 돌아간다', () => {
    const t = boot();
    pickC(t);
    click(t.action('place'));
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    click(t.action('cursor-right'));
    click(t.action('place'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(t.slots().some((s) => s.flagged)).toBe(false);
  });
});

describe('도움 카드(H): 키 표와 돌 누르기 안내', () => {
  it('도움 단추를 누르면 키 표 전체가 나오고, 한 번 더 누르면 닫힌다', () => {
    const t = boot();
    const help = t.action('help');
    expect(help.getAttribute('aria-expanded')).toBe('false');
    expect(q(t.host, '#inst-help')).toBeNull();
    click(help);
    const card = q(t.host, '#inst-help')!;
    expect(help.getAttribute('aria-expanded')).toBe('true');
    expect(qa(card, '.help-list li')).toHaveLength(BENCH_KEY_TABLE.length);
    for (const row of BENCH_KEY_TABLE) {
      expect(text(card)).toContain(row.keys);
      expect(text(card)).toContain(row.label);
    }
    expect(text(card)).toContain('끌지 않아도 모두 할 수 있어요');
    click(help);
    expect(q(t.host, '#inst-help')).toBeNull();
  });
});

describe('키보드(4.2의 표): 모드에 있는 동안 창에서 받는다', () => {
  it('← → 는 자리를 옮기고, Enter와 Space는 놓고, Backspace는 뺀다. 눌린 키는 브라우저가 다시 쓰지 않는다(preventDefault)', () => {
    const t = boot();
    expect(t.press('ArrowRight').defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(1);
    expect(t.press('Enter').defaultPrevented).toBe(true);
    expect(t.slots()[0]!.name).toBe('C4');
    t.press('ArrowRight');
    t.press('Space');
    expect(t.slots()[1]!.name).toBe('C4');
    t.press('Backspace');
    expect(t.slots()[1]!.name).toBeNull();
    t.press('ArrowLeft');
    expect(t.bench.cursor).toBe(1);
  });

  it('↑ ↓ 는 손에 든 음의 높이를, Shift와 함께면 변화표를 바꾼다', () => {
    const t = boot();
    t.press('ArrowUp');
    expect(t.bench.handName()).toBe('D4');
    t.press('ArrowDown');
    t.press('ArrowDown');
    expect(t.bench.handName()).toBe('B3');
    t.press('ArrowUp');
    t.press('ArrowUp', { shiftKey: true });
    expect(t.bench.handName()).toBe('C♯4');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    expect(t.bench.handName()).toBe('C♭4');
  });

  it('Z와 Y는 실행 취소와 다시 실행이다. 한글 자판에서도 물리 키(code) 그대로 된다', () => {
    const t = boot();
    t.press('Enter');
    t.press('KeyZ', { key: 'ㅋ' });
    expect(t.slots()[0]!.name).toBeNull();
    t.press('KeyY', { key: 'ㅛ' });
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('P는 내 배치 듣기, S는 정지, T는 목표 듣기(과제를 골랐을 때), C는 확인이다', () => {
    const t = boot();
    t.press('Enter');
    t.press('KeyP');
    expect(t.controller.playing).toBe('mine');
    t.press('KeyS');
    expect(t.controller.playing).toBeNull();
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="scale.major/c-major"]'));
    t.press('KeyT');
    expect(t.controller.playing).toBe('target');
    t.press('KeyS');
    t.press('Enter');
    t.press('KeyC');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
  });

  it('H는 도움 카드를 열고 닫는다. Esc는 열린 카드(도움, 표지판 목록)를 먼저 닫고, 닫을 것이 없을 때만 나간다', () => {
    const t = boot();
    t.press('KeyH');
    expect(q(t.host, '#inst-help')).not.toBeNull();
    t.press('Escape');
    expect(q(t.host, '#inst-help')).toBeNull();
    expect(t.hud()).not.toBeNull();
    click(q(t.host, '[data-sign-toggle]'));
    expect(q(t.host, '#inst-sign-list')).not.toBeNull();
    t.press('Escape');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(t.hud()).not.toBeNull();
    t.press('Escape');
    expect(t.hud()).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
  });

  it('V는 과제를 골랐으면 패널 주소로 가고, 자유로 놀기에서는 가지 않고 이유를 알린다', () => {
    const t = boot();
    t.press('KeyV');
    expect(t.navigations).toEqual([]);
    expect(text(q(t.host, '[data-live]'))).toBe(FREE_PLAY_NO_PANEL);
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="scale.major/c-major"]'));
    t.press('KeyV');
    expect(t.navigations).toEqual(['#/q/scale.major/c-major']);
    click(t.action('view-panel'));
    expect(t.navigations).toEqual(['#/q/scale.major/c-major', '#/q/scale.major/c-major']);
  });

  it('꾹 눌러 되풀이되는 키(repeat)는 자리와 높이를 옮기는 키만 받는다. 놓기와 빼기, 듣기는 한 번만 한다', () => {
    const t = boot();
    t.press('Enter', { repeat: true });
    expect(t.slots()[0]!.name).toBeNull();
    t.press('ArrowRight', { repeat: true });
    t.press('ArrowRight', { repeat: true });
    expect(t.bench.cursor).toBe(2);
    t.press('ArrowUp', { repeat: true });
    expect(t.bench.handName()).toBe('D4');
    t.press('KeyP', { repeat: true });
    expect(t.controller.playing).toBeNull();
  });

  it('글자를 입력하는 칸에서 누른 키는 받지 않는다', () => {
    const t = boot();
    const input = document.createElement('input');
    document.body.appendChild(input);
    cleanups.push(() => input.remove());
    const ev = t.press('Enter', {}, input);
    expect(ev.defaultPrevented).toBe(false);
    t.press('ArrowRight', {}, input);
    expect(t.bench.cursor).toBeNull();
  });

  it('단추에 초점이 있을 때 Enter와 Space는 그 단추의 누르기다: 놓기가 겹쳐 일어나지 않는다', () => {
    const t = boot();
    const toggle = q(t.host, '[data-sign-toggle]')!;
    const ev = t.press('Enter', {}, toggle);
    expect(ev.defaultPrevented).toBe(false);
    expect(t.slots()[0]!.name).toBeNull();
    // 단추 위에서도 방향키는 자리를 옮긴다
    t.press('ArrowRight', {}, toggle);
    expect(t.bench.cursor).toBe(1);
  });

  it('Ctrl·Alt를 함께 누른 브라우저 단축키는 건드리지 않는다. Ctrl+Z는 실행 취소다', () => {
    const t = boot();
    t.press('Enter');
    const save = t.press('KeyS', { ctrlKey: true });
    expect(save.defaultPrevented).toBe(false);
    const alt = t.press('KeyH', { altKey: true });
    expect(alt.defaultPrevented).toBe(false);
    expect(q(t.host, '#inst-help')).toBeNull();
    t.press('KeyZ', { ctrlKey: true });
    expect(t.slots()[0]!.name).toBeNull();
  });

  it('월드가 멈춰 있는 동안(다른 화면이 열린 동안)에는 받지 않는다', () => {
    const t = boot();
    t.bridge.pause.set(true);
    const ev = t.press('Enter');
    expect(ev.defaultPrevented).toBe(false);
    expect(t.slots()[0]!.name).toBeNull();
    t.bridge.pause.set(false);
    t.press('Enter');
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('이미 다른 곳에서 처리한 키(defaultPrevented)와 한글 조합 중의 키는 받지 않는다', () => {
    const t = boot();
    const handled = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true });
    handled.preventDefault();
    act(() => void document.body.dispatchEvent(handled));
    expect(t.slots()[0]!.name).toBeNull();
    t.press('Enter', { isComposing: true });
    expect(t.slots()[0]!.name).toBeNull();
  });

  it('작업대를 나가면(화면이 사라지면) 키를 더 받지 않는다', () => {
    const t = boot();
    act(() => t.ic.exit());
    const ev = t.press('Enter');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('모르는 키는 그냥 지나간다', () => {
    const t = boot();
    expect(t.press('KeyQ').defaultPrevented).toBe(false);
    expect(t.press('Tab').defaultPrevented).toBe(false);
  });
});

describe('조작 막대가 가리는 높이를 월드에 알린다(카메라가 설치물을 막대 위쪽에 담는다)', () => {
  const stubRect = (top: number, height: number): void => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const isMain = this.classList?.contains('inst-main');
      return { x: 0, y: isMain ? top : 0, top: isMain ? top : 0, left: 0, right: 0, bottom: isMain ? top + height : 0, width: 0, height: isMain ? height : 0, toJSON: () => ({}) } as DOMRect;
    };
  };

  it('작업대 윗선에서 화면 아래까지의 높이를 올리고, 나오면 0으로 되돌린다', () => {
    stubRect(500, 220);
    const t = boot();
    expect(t.bridge.bottomInset.get()).toBe(window.innerHeight - 500);
    act(() => t.ic.exit());
    expect(t.bridge.bottomInset.get()).toBe(0);
  });

  it('크기가 바뀌면(ResizeObserver, 창 크기) 다시 잰다. 관찰은 나올 때 끝낸다', () => {
    const observers: Array<{ cb: () => void; observed: Element[]; disconnected: boolean }> = [];
    class FakeResizeObserver {
      private readonly rec: { cb: () => void; observed: Element[]; disconnected: boolean };
      constructor(cb: () => void) {
        this.rec = { cb, observed: [], disconnected: false };
        observers.push(this.rec);
      }
      observe(el: Element): void {
        this.rec.observed.push(el);
      }
      disconnect(): void {
        this.rec.disconnected = true;
      }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
    stubRect(500, 220);
    const t = boot();
    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed[0]!.classList.contains('inst-main')).toBe(true);
    expect(t.bridge.bottomInset.get()).toBe(window.innerHeight - 500);
    stubRect(400, 320);
    act(() => observers[0]!.cb());
    expect(t.bridge.bottomInset.get()).toBe(window.innerHeight - 400);
    stubRect(450, 270);
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(t.bridge.bottomInset.get()).toBe(window.innerHeight - 450);
    act(() => t.ic.exit());
    expect(observers[0]!.disconnected).toBe(true);
    expect(t.bridge.bottomInset.get()).toBe(0);
  });

  it('높이를 잴 수 없으면(보이지 않음) 0을 알려서 설치물이 화면 가운데에 담긴다', () => {
    stubRect(0, 0);
    const t = boot();
    expect(t.bridge.bottomInset.get()).toBe(0);
  });

  it('표지판 목록과 도움 카드는 작업대 위에 떠서 작업대의 높이를 바꾸지 않는다(같은 작업대 칸 밖에 있다)', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    click(t.action('help'));
    const main = q(t.host, '.inst-main')!;
    expect(main.contains(q(t.host, '#inst-sign-list'))).toBe(false);
    expect(main.contains(q(t.host, '#inst-help'))).toBe(false);
    expect(q(t.host, '.inst-float')!.contains(q(t.host, '#inst-sign-list'))).toBe(true);
  });
});
