// @vitest-environment jsdom
// 6-5 잔물결 수로(E3, 징검다리 확대형, 4.4)의 화면: 박 옮기기 단추, 뗏목 종류 단추, 뗏목 돌의 칸 이름, 키보드(PageUp·PageDown).
// 6-4의 공통 화면(표지판, 선반, 남은 물, 확인 결과)은 timeline-hud 시험이 맡는다. 여기서는 확대형 줄에서 달라지는 것만 본다.
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 징검다리 작업대만으로 화면이 하는 일을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { TIMELINE_KEY_TABLE } from '@/ui/challenge/timelineKeys';
import { TimelineHud } from '@/ui/installation/TimelineHud';
import { InstallationController } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import { p } from './helpers';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const E3 = 'inst.beat-river.ripple-channel';
const FORD1 = 'inst.beat-river.first-ford';
const Q03_KEY = 'rhythm.short-notes-and-triplets/thirty-seconds-triplet';
const Q17_KEY = 'rhythm.sixteenths/sixteenths-and-eighths';
const Q18_KEY = 'rhythm.triplets/triplet-eighths-and-quarters';

beforeAll(() => setupDom());

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

interface BootOptions {
  /** 들어간 뒤 표지판에서 고를 것(없으면 자유로 놀기) */
  key?: string;
  /** 들어갈 정거장. 기본은 E3 */
  station?: 'E1' | 'E3';
}

function boot(opts: BootOptions = {}) {
  const station = opts.station ?? 'E3';
  const r = rig({ definitions: ['rhythm.short-notes-and-triplets', 'rhythm.sixteenths', 'rhythm.triplets', 'rhythm.rest-in-a-bar'].map(quest) });
  const bridge = new WorldBridge({ x: 6560, y: 1660, facing: 'right' });
  const channel = installation(E3);
  const ford = installation(FORD1);
  const inst = station === 'E3' ? channel : ford;
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [channel, ford],
    panels: new Set(['panel.rhythm']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  ic.setNavigator(() => undefined);
  act(() => void ic.enter(station));
  if (opts.key) act(() => void ic.select(opts.key!));
  const bench = ic.timelineOf(inst)!;
  const m = mount(<TimelineHud bridge={bridge} controller={r.controller} bench={bench} installation={ic} onNavigate={() => undefined} touchOnly={false} />);
  cleanups.push(() => {
    m.unmount();
    ic.dispose();
    r.bench.dispose();
    r.controller.dispose();
  });
  const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    act(() => void target.dispatchEvent(ev));
    return ev;
  };
  const action = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-action="${name}"]`)!;
  const kind = (k: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-kind="${k}"]`)!;
  const tuplets = (): HTMLButtonElement[] => qa<HTMLButtonElement>(m.host, '[data-tuplet]');
  const lengths = (): HTMLButtonElement[] => qa<HTMLButtonElement>(m.host, '[data-value]');
  return { ...r, bridge, inst, ic, bench, m, host: m.host, press, action, kind, tuplets, lengths };
}

type T = ReturnType<typeof boot>;
const live = (t: T): string => text(q(t.host, '[data-live]'));
const hand = (t: T): string => text(q(t.host, '.inst-hand'));
const stones = (t: T): string[] =>
  [...t.controller.content().events]
    .sort((a, b) => a.onsetTicks - b.onsetTicks)
    .map((e) => `${e.type === 'note' ? 'N' : 'R'} ${e.onsetTicks}+${e.durationTicks}`);

describe('조작 막대: 박을 옮기는 단추(확대형 줄에만 있다)', () => {
  it('E3에는 이전 박, 다음 박 단추가 칸 단추 바로 뒤에 있다', () => {
    const t = boot();
    expect(t.host.querySelector('[data-installation-hud]')!.getAttribute('aria-label')).toBe('잔물결 수로 작업대');
    expect(qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'))).toEqual([
      'cursor-left',
      'cursor-right',
      'beat-prev',
      'beat-next',
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
  });

  it('여울목(E1)은 줄 전체가 한 화면에 담겨서 박 단추가 없다', () => {
    const t = boot({ station: 'E1' });
    expect(qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'))).not.toContain('beat-prev');
    expect(qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'))).not.toContain('beat-next');
  });

  it('박 단추는 이름과 키 안내를 가진다. 이름은 보이는 글자를 포함한다', () => {
    const t = boot();
    for (const [name, label, key] of [
      ['beat-prev', '이전 박', 'PgUp'],
      ['beat-next', '다음 박', 'PgDn'],
    ] as const) {
      const b = t.action(name);
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-label')).toBe(label);
      expect(b.getAttribute('aria-keyshortcuts')).toBe(key);
      expect(b.disabled).toBe(false);
      expect(b.getAttribute('aria-label')!.includes(text(q(b, '.inst-btn-label')))).toBe(true);
      expect(text(q(b, '.inst-key'))).toBe(key);
    }
  });

  it('다음 박 단추: 다음 박의 처음 칸을 고르고 말로 알린다. 마지막 박에서는 알리기만 한다', () => {
    const t = boot({ key: Q03_KEY });
    click(t.action('beat-next'));
    expect(t.bench.cursor).toBe(960);
    expect(hand(t)).toContain('· 2박 칸');
    expect(live(t)).toContain('2박');
    click(t.action('beat-next'));
    click(t.action('beat-next'));
    expect(t.bench.cursor).toBe(2880);
    click(t.action('beat-next'));
    expect(t.bench.cursor).toBe(2880);
    expect(live(t)).toContain('마지막 박이에요');
  });

  it('이전 박 단추: 박 가운데에서는 그 박의 처음으로, 첫 박에서는 알리기만 한다', () => {
    const t = boot({ key: Q03_KEY });
    act(() => t.bench.selectTick(1080));
    expect(hand(t)).toContain('· 2박 2번째 칸');
    click(t.action('beat-prev'));
    expect(t.bench.cursor).toBe(960);
    click(t.action('beat-prev'));
    expect(t.bench.cursor).toBe(0);
    click(t.action('beat-prev'));
    expect(t.bench.cursor).toBe(0);
    expect(live(t)).toContain('첫 박이에요');
  });
});

describe('키보드: PageUp, PageDown', () => {
  it('PageDown은 다음 박, PageUp은 이전 박이고 브라우저의 동작(쪽 넘기기)을 막는다', () => {
    const t = boot({ key: Q03_KEY });
    const down = t.press('PageDown');
    expect(down.defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(960);
    t.press('PageDown');
    expect(t.bench.cursor).toBe(1920);
    const up = t.press('PageUp');
    expect(up.defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(960);
  });

  it('칸을 옮기는 키처럼 꾹 눌러도 되풀이된다', () => {
    const t = boot({ key: Q03_KEY });
    t.press('PageDown', { repeat: true });
    t.press('PageDown', { repeat: true });
    expect(t.bench.cursor).toBe(1920);
  });

  it('단추에 초점이 있어도 박을 옮기면 초점을 놓아 준다: 이어서 누르는 Enter가 그 단추가 아니라 놓기가 된다', () => {
    const t = boot({ key: Q03_KEY });
    const btn = t.action('cursor-right');
    act(() => btn.focus());
    expect(document.activeElement).toBe(btn);
    t.press('PageDown', {}, btn);
    expect(document.activeElement).not.toBe(btn);
    expect(t.bench.cursor).toBe(960);
    t.press('Enter');
    expect(stones(t)).toEqual(['N 960+120']);
  });

  it('도움 카드의 키 표에 박 옮기기가 있다', () => {
    const t = boot();
    click(t.action('help'));
    const help = q(t.host, '#inst-help')!;
    expect(text(help)).toContain('PageUp PageDown');
    expect(text(help)).toContain('박 옮기기');
    expect(TIMELINE_KEY_TABLE.some((row) => row.keys === 'PageUp PageDown')).toBe(true);
  });

  it('키보드 안내 줄에 박 옮기기가 있다', () => {
    const t = boot();
    expect(text(q(t.host, '.inst-hint'))).toContain('PgUp PgDn 박');
  });
});

describe('재료 선반: 뗏목 종류 단추', () => {
  it('종류가 둘인 과제(Q18)에서 뗏목을 들면 길이 단추 자리에 뗏목 종류 단추가 온다(짧은 것부터)', () => {
    const t = boot({ key: Q18_KEY });
    expect(t.tuplets()).toHaveLength(0);
    expect(t.lengths().length).toBeGreaterThan(0);
    click(t.kind('raft'));
    expect(t.tuplets().map((b) => text(q(b, '.material-name')))).toEqual(['8분 셋잇단음표', '4분 셋잇단음표']);
    expect(t.lengths()).toHaveLength(0);
    // 처음에는 가장 짧은 뗏목을 든다
    expect(t.tuplets().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(q(t.host, '[role="group"][aria-label*="뗏목의 종류"]')).not.toBeNull();
  });

  it('뗏목 종류 단추를 누르면 손에 든 뗏목이 바뀌고, 놓을 자리의 길이도 그 종류를 따른다', () => {
    const t = boot({ key: Q18_KEY });
    click(t.kind('raft'));
    click(t.tuplets()[1]!);
    expect(t.tuplets().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(hand(t)).toContain('4분 셋잇단');
    act(() => t.bench.selectTick(1920));
    click(t.action('place'));
    expect(stones(t)).toEqual(['N 1920+640', 'N 2560+640', 'N 3200+640']);
    expect(t.controller.content().tuplets).toHaveLength(1);
  });

  it('다른 종류를 들면 길이 단추가 돌아오고, 뗏목 종류 단추는 사라진다', () => {
    const t = boot({ key: Q18_KEY });
    click(t.kind('raft'));
    expect(t.tuplets()).toHaveLength(2);
    click(t.kind('note'));
    expect(t.tuplets()).toHaveLength(0);
    expect(t.lengths().length).toBeGreaterThan(0);
    expect(q(t.host, '[role="group"][aria-label*="돌의 종류와 길이"]')).not.toBeNull();
  });

  it('뗏목 종류가 하나인 과제(Q03)에서는 뗏목을 들어도 종류 단추가 없고 길이 단추는 눌리지 않는다', () => {
    const t = boot({ key: Q03_KEY });
    click(t.kind('raft'));
    expect(t.tuplets()).toHaveLength(0);
    expect(t.lengths().length).toBeGreaterThan(0);
    expect(t.lengths().every((b) => b.disabled)).toBe(true);
  });

  it('종류 단추는 접근 이름과 눌림 상태를 가진다', () => {
    const t = boot({ key: Q18_KEY });
    click(t.kind('raft'));
    for (const b of t.tuplets()) {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-pressed')).not.toBeNull();
      expect(text(q(b, '.material-name'))).not.toBe('');
    }
  });
});

describe('고른 칸의 이름: 뗏목의 돌', () => {
  it('뗏목의 돌을 고르면 몇째 돌인지 말하고 칸을 또 붙이지 않는다. 놓기 단추도 그 돌을 말한다', () => {
    const t = boot({ key: Q18_KEY });
    click(t.kind('raft'));
    act(() => t.bench.selectTick(960));
    click(t.action('place'));
    expect(stones(t)).toEqual(['N 960+320', 'N 1280+320', 'N 1600+320']);
    click(t.kind('note'));
    act(() => t.bench.selectTick(1280));
    expect(hand(t)).toContain('· 2박 둘째 돌');
    expect(hand(t)).not.toContain('돌 칸');
    expect(t.action('place').getAttribute('aria-label')).toBe('2박 둘째 돌에 놓기');
    act(() => t.bench.selectTick(1600));
    expect(t.action('place').getAttribute('aria-label')).toBe('2박 셋째 돌에 놓기');
  });

  it('뗏목의 돌 하나에 음을 놓으면 그 돌만 바뀌고, 놓기 단추는 다음 돌로 간다', () => {
    const t = boot({ key: Q18_KEY });
    click(t.kind('raft'));
    act(() => t.bench.selectTick(960));
    click(t.action('place'));
    click(t.kind('note'));
    act(() => t.bench.pickPitch(p('E4')));
    act(() => t.bench.selectTick(1280));
    click(t.action('place'));
    expect(stones(t)).toEqual(['N 960+320', 'N 1280+320', 'N 1600+320']);
    expect(hand(t)).toContain('· 2박 셋째 돌');
  });

  it('칸 이름이 박만 있으면 칸을 붙인다(뗏목이 없는 줄은 그대로)', () => {
    const t = boot({ key: Q17_KEY });
    click(t.action('cursor-right'));
    expect(hand(t)).toContain('· 1박 칸');
  });
});

describe('Q17: 16분음표 칸', () => {
  it('칸 이동은 16분음표 단위이고 한 박은 네 칸이다', () => {
    const t = boot({ key: Q17_KEY });
    click(t.action('cursor-right'));
    expect(t.bench.cursor).toBe(0);
    click(t.action('cursor-right'));
    expect(t.bench.cursor).toBe(240);
    expect(hand(t)).toContain('1박 2번째 칸');
    click(t.action('beat-next'));
    expect(t.bench.cursor).toBe(960);
  });
});

describe('11.2의 6: 도움을 쓰는 동안 통과는 없다', () => {
  it.each([Q17_KEY, Q18_KEY])('%s: 도움 카드를 열고 닫고, 목표와 내 배치를 들어도 기록되는 시도는 없고 작업대에서 그대로 이어진다', (key) => {
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
