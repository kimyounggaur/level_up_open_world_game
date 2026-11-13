// @vitest-environment jsdom
// 7-3 건반 다리(T6, 4.8)의 화면: 표지판, 할 것 칩, 이름표 선반, 음정 이름 단추, 끝 말뚝 이름 단추, 조작 막대, 도움 카드, 확인 결과, 키보드. 끌지 않아도 모두 된다(W-4).
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 건반 다리 작업대만으로 화면이 하는 일을 확인한다. 월드 그림은 key-bridge-layer와 flow 시험이 맡는다.
// 사람이 하는 일(손가락으로 누르기, 낭독기가 읽는 소리, 색 구별)은 여기서 하지 않는다. 사람 확인 대기로 남긴다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import { NAME_TAGS } from '@/domain/keyBridge';
import { INTERVAL_PICK_NUMBERS, INTERVAL_PICK_QUALITIES } from '@/domain/slotplan';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { bridgeKeyTableOf } from '@/ui/challenge/keyBridgeKeys';
import { NO_FLAG_NOTICE, NO_STAKE_NOTICE, NO_TAG_NOTICE, PICK_ITEM_FIRST, bridgeIdleLead, bridgePassedText } from '@/ui/challenge/keyBridgeText';
import { FREE_IDLE_TEXT } from '@/ui/challenge/slotText';
import { FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import { KeyBridgeHud } from '@/ui/installation/KeyBridgeHud';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q_SAME = 'pitch.same-sound-different-names';
const Q27 = 'key.black-key-names';
const Q28 = 'key.whole-and-half-steps';
const Q29 = 'key.build-intervals';
const Q30 = 'key.accidentals-in-a-bar';
const ID = {
  K1: 'inst.key-marsh.key-bridge',
  K2: 'inst.key-marsh.interval-rope',
  K3: 'inst.key-marsh.natural-bridge',
} as const;
type Station = keyof typeof ID;
const K4 = 'inst.key-marsh.chromatic-path';
const NAME_TAGS_KEY = `${Q_SAME}/name-tags`;
const INTERVAL_NAMES = `${Q_SAME}/interval-names`;
const BLACK_KEYS = `${Q27}/black-key-names`;
const WHOLE_HALF = `${Q28}/whole-and-half`;
const BUILD_BASIC = `${Q29}/basic`;
const BUILD_CHALLENGE = `${Q29}/challenge`;
const G_MAJOR = `${Q30}/g-major-f`;

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
  /** 들어갈 정거장. 기본은 K1(건반 다리) */
  station?: Station;
}

function boot(opts: BootOptions = {}) {
  const { enter, touchOnly, inert, key, station = 'K1', ...rigOptions } = opts;
  const r = rig({ definitions: [Q_SAME, Q27, Q28, Q29, Q30].map(quest), ...rigOptions });
  const bridge = new WorldBridge({ x: 2300, y: 5000, facing: 'down' });
  const defs = { K1: installation(ID.K1), K2: installation(ID.K2), K3: installation(ID.K3) };
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [...Object.values(defs), installation(K4)],
    panels: new Set(['panel.clef', 'panel.scale']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  const navigations: string[] = [];
  ic.setNavigator((hash) => void navigations.push(hash));
  if (enter !== false) {
    act(() => void ic.enter(station));
    if (key) act(() => void ic.select(key));
  }
  const inst = defs[station];
  const bench = ic.keyBridgeOf(inst)!;
  const m = mount(
    <KeyBridgeHud
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
  /** 널(자리 번호 1부터)을 눌렀다: 월드가 하는 일과 같은 길 */
  const plank = (slot: number): void => {
    act(() => void bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot }));
  };
  return { ...r, bridge, inst, ic, bench, m, host: m.host, navigations, hud, press, action, plank };
}

type T = ReturnType<typeof boot>;
const live = (t: T): string => text(q(t.host, '[data-live]'));
/** 고른 할 것을 보이는 줄 */
const hand = (t: T): string => text(q(t.host, '.inst-hand'));
const actions = (t: T): string[] => qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action')!);
const chips = (t: T): HTMLButtonElement[] => qa<HTMLButtonElement>(t.host, '[data-bridge-chips] button');
const chipTexts = (t: T): string[] => chips(t).map((b) => text(q(b, '.material-name')));
const listed = (t: T): string[] => qa(t.host, '[data-bridge-list] li').map((li) => text(li));
const tagButton = (t: T, tag: string): HTMLButtonElement => q<HTMLButtonElement>(t.host, `[data-bridge-tags] [data-tag="${tag}"]`)!;
const hint = (t: T): string => text(q(t.host, '.inst-hint'));
/** 칩을 눌러 고른다 */
const chip = (t: T, index: number): void => click(chips(t)[index]!);

describe('들어가면 건반 다리 작업대가 나타난다', () => {
  it('모드 밖에서는 아무것도 그리지 않는다. 들어가면 나타나고, 나오면 사라진다', () => {
    const t = boot({ enter: false });
    expect(t.hud()).toBeNull();
    act(() => void t.ic.enter('K1'));
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe(`${t.inst.name} 작업대`);
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(ID.K1);
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    expect(t.hud()!.getAttribute('data-bridge-task')).toBe('names');
    expect(t.hud()!.getAttribute('data-bridge-items')).toBe('10');
    act(() => t.ic.exit());
    expect(t.hud()).toBeNull();
  });

  it.each([
    ['K1', undefined, 'names', 10],
    ['K1', NAME_TAGS_KEY, 'names', 2],
    ['K1', BLACK_KEYS, 'names', 10],
    ['K1', WHOLE_HALF, 'interval', 4],
    ['K2', undefined, 'interval', 7],
    ['K2', INTERVAL_NAMES, 'interval', 3],
    ['K2', BUILD_BASIC, 'interval', 2],
    ['K2', BUILD_CHALLENGE, 'interval', 2],
    ['K3', undefined, 'flags', 8],
    ['K3', G_MAJOR, 'flags', 4],
  ] as const)('%s의 %s: 과제는 %s이고 할 것은 %i개다', (station, key, task, count) => {
    const t = boot({ station, ...(key ? { key } : {}) });
    expect(t.hud()!.getAttribute('data-bridge-task')).toBe(task);
    expect(t.hud()!.getAttribute('data-bridge-items')).toBe(String(count));
    expect(chips(t)).toHaveLength(count);
    expect(listed(t)).toHaveLength(count);
  });

  it('조작 막대의 모든 동작이 단추로 있다(끌지 않아도 모두 된다)', () => {
    const t = boot();
    expect(actions(t)).toEqual(['cursor-left', 'cursor-right', 'hand-up', 'hand-down', 'place', 'remove', 'undo', 'redo', 'hear-mine', 'hear-target', 'stop', 'check', 'view-panel', 'help', 'exit']);
    expect(qa(t.host, '[draggable]')).toHaveLength(0);
    expect(t.action('cursor-right').getAttribute('aria-label')).toBe('다음 널');
    expect(t.action('hand-down').getAttribute('aria-label')).toBe('다음 이름표 자리');
    expect(boot({ station: 'K2' }).action('hand-down').getAttribute('aria-label')).toBe('다음 밧줄');
    expect(boot({ station: 'K3' }).action('hand-down').getAttribute('aria-label')).toBe('다음 깃발');
  });

  it.each(['K1', 'K2', 'K3'] as const)('%s: 단추는 모두 이름을 달고 있고, 조작 막대 단추는 키 안내(aria-keyshortcuts)를 갖는다. 보이는 이름이 곧 접근 이름이다', (station) => {
    const t = boot({ station });
    const check = (): void => {
      for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
        expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
        expect(b.getAttribute('aria-keyshortcuts'), b.outerHTML).toBeTruthy();
        expect(b.type).toBe('button');
        const visible = text(q(b, '.inst-btn-label'));
        expect(b.getAttribute('aria-label')!.includes(visible), `${b.getAttribute('aria-label')} ⊇ ${visible}`).toBe(true);
      }
      for (const b of qa<HTMLButtonElement>(t.host, '.inst-shelf button')) {
        expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
        expect(b.type).toBe('button');
      }
    };
    // 고르기 전, 고른 뒤: 놓기 단추의 이름이 바뀌는 두 가지 모습을 모두 본다
    check();
    chip(t, 0);
    check();
  });

  it('놓기 단추의 이름은 과제와 고른 것을 따른다', () => {
    const t1 = boot();
    expect(t1.action('place').getAttribute('aria-label')).toBe('이 널의 이름표 자리 고르기');
    const t2 = boot({ station: 'K3', key: G_MAJOR });
    expect(t2.action('place').getAttribute('aria-label')).toBe('깃발 꽂기');
    chip(t2, 1);
    expect(t2.action('place').getAttribute('aria-label')).toBe('2번 깃발 꽂기');
    const t3 = boot({ station: 'K1', key: WHOLE_HALF });
    chip(t3, 0);
    expect(t3.action('place').getAttribute('aria-label')).toBe('두 음 들어 보기');
    const t4 = boot({ station: 'K2', key: BUILD_BASIC });
    chip(t4, 0);
    expect(t4.action('place').getAttribute('aria-label')).toBe('끝 말뚝 꽂기');
    expect(t1.action('remove').getAttribute('aria-label')).toBe('이름표 떼기');
    expect(t2.action('remove').getAttribute('aria-label')).toBe('깃발 빼기');
    expect(t3.action('remove').getAttribute('aria-label')).toBe('답 비우기');
    expect(t1.action('hear-mine').getAttribute('aria-label')).toBe('내 이름표 듣기');
    expect(t2.action('hear-mine').getAttribute('aria-label')).toBe('내 깃발 듣기');
    expect(t3.action('hear-mine').getAttribute('aria-label')).toBe('고른 질문 듣기');
  });

  it('눈에 보이지 않는 알림 칸이 컨트롤러의 알림을 그대로 읽어 준다', () => {
    const t = boot({ key: BLACK_KEYS });
    const region = q(t.host, '[data-live]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    click(t.action('cursor-right'));
    expect(live(t)).toBe('C4 널.');
    click(t.action('cursor-right'));
    expect(live(t)).toBe('C4와 D4 사이의 검은 널.'); // 문제를 푸는 중에는 검은 널을 이웃한 흰 널로만 말한다
  });

  it('화면 낭독기가 할 것마다 둘러볼 수 있는 목록이 있다: 월드의 다리는 그림이라 읽히지 않는다', () => {
    const t = boot({ key: BLACK_KEYS });
    const list = q(t.host, '[data-bridge-list]')!;
    expect(list.getAttribute('aria-label')).toBe('할 것 목록');
    expect(list.classList.contains('sr-only')).toBe(true);
    expect(listed(t)).toEqual(t.bench.items().map((i) => t.bench.describe(i)));
    expect(listed(t)[0]).toBe('첫째 검은 널의 올려 부른 이름표: 비어 있어요.');
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    expect(listed(t)[0]).toContain('C♯');
  });

  it('inert가 켜져 있으면(위에 안내 카드가 떠 있을 때) 단추가 눌리지 않는다', () => {
    expect(boot({ inert: true }).hud()!.hasAttribute('inert')).toBe(true);
    expect(boot().hud()!.hasAttribute('inert')).toBe(false);
  });

  it.each([
    ['K1', BLACK_KEYS, ['Shift+↑↓ 이름표', 'Enter 자리 고르기'], ['말뚝']],
    ['K1', WHOLE_HALF, ['Enter 두 음 듣기', '↑ ↓ 밧줄'], ['Shift+↑↓', '말뚝']],
    ['K2', BUILD_BASIC, ['Shift+↑↓ 말뚝 이름', 'Enter 말뚝 꽂기'], ['이름표']],
    ['K2', INTERVAL_NAMES, ['Enter 두 음 듣기'], ['Shift+↑↓', '말뚝']],
    ['K3', G_MAJOR, ['↑ ↓ 깃발', 'Enter 꽂기'], ['Shift+↑↓']],
  ] as const)('키보드 안내 줄 %s %s: 이 과제에서 쓰는 키만 안내한다', (station, key, has, hasNot) => {
    const line = hint(boot({ station, key }));
    for (const w of has) expect(line, w).toContain(w);
    for (const w of hasNot) expect(line, w).not.toContain(w);
    expect(line).toContain('← → 널');
    expect(line).toContain('Esc 나가기');
  });

  it('키보드 안내 줄은 터치 전용 화면에는 없다', () => {
    expect(q(boot({ touchOnly: true }).host, '.inst-hint')).toBeNull();
    expect(q(boot().host, '.inst-hint')).not.toBeNull();
  });
});

describe('할 것 칩(손가락만으로 고른다)', () => {
  it('칩은 할 것마다 하나이고 처음에는 아무것도 고르지 않았다. 고른 것을 보이는 줄도 비어 있다고 말한다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(q(t.host, '[data-bridge-chips]')!.getAttribute('aria-label')).toBe('이름표 자리 고르기');
    expect(chipTexts(t)).toEqual(['1번 —', '2번 —', '3번 —', '4번 —', '5번 —', '6번 —', '7번 —', '8번 —', '9번 —', '10번 —']);
    expect(chips(t).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(chips(t).map((b) => b.getAttribute('data-item'))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(hand(t)).toBe('고른 이름표 자리 없음 · 위 칩이나 ↑ ↓로 골라 주세요 · 널 없음');
    expect(q(t.host, '.inst-hand')!.hasAttribute('data-selected-item')).toBe(false);
    expect(q(t.host, '.inst-hand')!.hasAttribute('data-plank-cursor')).toBe(false);
  });

  it('칩을 누르면 그 자리가 골라지고, 널의 커서도 그 자리의 널로 간다. 고른 칩에만 눌린 표시(aria-pressed)가 선다', () => {
    const t = boot({ key: BLACK_KEYS });
    chip(t, 2);
    expect(chips(t).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', ...Array<string>(7).fill('false')]);
    expect(chips(t)[2]!.classList.contains('is-selected')).toBe(true);
    const row = q(t.host, '.inst-hand')!;
    expect(row.getAttribute('data-selected-item')).toBe('2');
    expect(row.getAttribute('data-plank-cursor')).toBe('4'); // 둘째 검은 널(D♯4/E♭4)은 4번 널
    expect(hand(t)).toContain('둘째 검은 널의 올려 부른 이름표');
    expect(hand(t)).toContain('비어 있어요');
    expect(hand(t)).toContain('널 D4와 E4 사이의 검은 널');
    expect(hand(t)).not.toMatch(/[♯♭]/); // 문제를 푸는 중에는 널의 이름을 밝히지 않는다
  });

  it('칩의 접근 이름은 작업대가 읽어 주는 문장과 같고, 보이는 글자(칩 글)는 낭독기에서 숨긴다', () => {
    const t = boot({ key: BLACK_KEYS });
    for (const [i, b] of chips(t).entries()) {
      expect(b.getAttribute('aria-label')).toBe(t.bench.describe(t.bench.items()[i]!));
      expect(q(b, '.material-name')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('음정 과제의 칩: 질문 이름과 답을 채웠는지(✓ 또는 —)가 보인다', () => {
    const t = boot({ key: WHOLE_HALF });
    expect(chipTexts(t)).toEqual(['E4에서 F4까지 —', 'B4에서 C5까지 —', 'C4에서 D4까지 —', 'F4에서 G4까지 —']);
    chip(t, 0);
    click(q(t.host, '[data-quality="minor"]'));
    expect(chipTexts(t)[0]).toBe('E4에서 F4까지 —'); // 성질만 골랐으면 아직 채우지 않은 것이다
    click(q(t.host, '[data-number="2"]'));
    expect(chipTexts(t)[0]).toBe('E4에서 F4까지 ✓');
  });

  it('임시표 과제의 칩: 깃발을 꽂았는지가 보인다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    expect(chipTexts(t)).toEqual(['1번 —', '2번 —', '3번 —', '4번 —']);
    t.plank(7);
    expect(chipTexts(t)).toEqual(['1번 ✓', '2번 —', '3번 —', '4번 —']);
  });

  it('틀렸다고 확인된 칩에는 ! 표시와 data-flagged가 선다(색만으로 말하지 않는다)', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('check'));
    expect(chips(t).every((b) => b.getAttribute('data-flagged') === 'true')).toBe(true);
    expect(chips(t).every((b) => text(q(b, '.material-sub')) === '!')).toBe(true);
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    expect(chips(t)[0]!.hasAttribute('data-flagged')).toBe(false); // 고치면 판정이 지워진다
    expect(chips(t).some((b) => b.hasAttribute('data-flagged'))).toBe(false);
  });
});

describe('이름 과제(Q27): 이름표 선반', () => {
  it('이름표 열 개가 선반에 있다. 이름표 자리를 고르기 전에는 눌리지 않는다', () => {
    const t = boot({ key: BLACK_KEYS });
    const shelf = q(t.host, '[data-bridge-tags]')!;
    expect(shelf.getAttribute('aria-label')).toBe('이름표: 고른 자리에 걸어요');
    const buttons = qa<HTMLButtonElement>(shelf, 'button');
    expect(buttons.map((b) => b.getAttribute('data-tag'))).toEqual(NAME_TAGS.map((tag) => tag.text));
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(NAME_TAGS.map((tag) => `${tag.text} 이름표`));
    expect(buttons.every((b) => b.disabled)).toBe(true);
    chip(t, 0);
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });

  it('이름표 단추를 누르면 고른 자리에 걸리고 글로 알린다. 걸린 이름표에 눌린 표시가 서고 칩과 읽기 줄이 따라간다', () => {
    const t = boot({ key: BLACK_KEYS });
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    expect(live(t)).toBe('첫째 검은 널의 올려 부른 이름표에 C♯ 이름표를 걸었어요.');
    expect(tagButton(t, 'C♯').getAttribute('aria-pressed')).toBe('true');
    expect(tagButton(t, 'C♯').classList.contains('is-selected')).toBe(true);
    expect(tagButton(t, 'D♭').getAttribute('aria-pressed')).toBe('false');
    expect(chipTexts(t)[0]).toBe('1번 C♯');
    expect(hand(t)).toContain('· C♯ 이름표');
    // 다른 이름표로 바꾼다
    click(tagButton(t, 'D♭'));
    expect(live(t)).toBe('첫째 검은 널의 올려 부른 이름표에 D♭ 이름표를 바꿔 걸었어요.');
    expect(tagButton(t, 'C♯').getAttribute('aria-pressed')).toBe('false');
    expect(tagButton(t, 'D♭').getAttribute('aria-pressed')).toBe('true');
  });

  it('열 개를 모두 맞게 걸고 확인하면 통과 문장을 보인다. 틀린 이름이 아니라 소리가 같은 다른 이름이면 그렇게 알려 준다', () => {
    const t = boot({ key: BLACK_KEYS });
    NAME_TAGS.forEach((tag, i) => {
      chip(t, i);
      click(tagButton(t, tag.text));
    });
    expect(text(q(t.host, '.feedback-idle'))).toBe(bridgeIdleLead('names', 10, 10));
    // 첫 자리에 같은 소리의 다른 이름(D♭)을 걸면 틀린다
    chip(t, 0);
    click(tagButton(t, 'D♭'));
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('needsRevision');
    expect(text(box)).toContain('소리 높이는 같지만 이름이 달라요');
    expect(q(box, '.feedback-line svg path')!.getAttribute('d')).toBe(ALERT_PATH);
    // 고치면 통과한다
    click(tagButton(t, 'C♯'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
    click(t.action('check'));
    const ok = q(t.host, '.inst-feedback')!;
    expect(ok.getAttribute('data-feedback')).toBe('passed');
    expect(ok.classList.contains('is-ok')).toBe(true);
    expect(text(ok)).toContain('통과했어요.');
    expect(text(ok)).toContain(bridgePassedText('names'));
  });

  it('이름표 선반은 이름 과제에만 있다', () => {
    expect(q(boot({ key: WHOLE_HALF }).host, '[data-bridge-tags]')).toBeNull();
    expect(q(boot({ station: 'K2', key: BUILD_BASIC }).host, '[data-bridge-tags]')).toBeNull();
    expect(q(boot({ station: 'K3', key: G_MAJOR }).host, '[data-bridge-tags]')).toBeNull();
  });

  it('자유로 놀 때는 이름표 자리 열 개에 아무 이름표나 걸 수 있다', () => {
    const t = boot();
    expect(chips(t)).toHaveLength(10);
    chip(t, 9);
    click(tagButton(t, 'A♯'));
    expect(chipTexts(t)[9]).toBe('10번 A♯');
    expect(hand(t)).toContain('열째 검은 널의 이름표');
  });
});

describe('음정 과제(Q28, Q29): 성질과 도수, 같은가, 끝 말뚝의 이름', () => {
  it('이름 묻기(Q28): 질문을 고르면 성질 단추와 도수 단추가 나타난다. 둘 다 골라야 답이 담긴다', () => {
    const t = boot({ key: WHOLE_HALF });
    expect(q(t.host, '[data-bridge-pick]')).toBeNull(); // 질문을 고르기 전에는 단추가 없다
    chip(t, 0);
    const shelf = q(t.host, '[data-bridge-pick="identify"]')!;
    expect(shelf.getAttribute('aria-label')).toBe('음정 이름: 성질과 도수를 골라요');
    expect(qa(shelf, '[data-quality]').map((b) => b.getAttribute('data-quality'))).toEqual([...INTERVAL_PICK_QUALITIES]);
    expect(qa(shelf, '[data-number]').map((b) => b.getAttribute('data-number'))).toEqual(INTERVAL_PICK_NUMBERS.map(String));
    click(q(t.host, '[data-quality="minor"]'));
    expect(live(t)).toBe('단음정을 골랐어요. 이제 도수를 골라 주세요.');
    expect(q(t.host, '[data-quality="minor"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(t.bench.filledCount()).toBe(0);
    click(q(t.host, '[data-number="2"]'));
    expect(live(t)).toBe('E4에서 F4까지: 단2도로 골랐어요.');
    expect(q(t.host, '[data-number="2"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(t.host, '[data-quality="major"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(t.bench.filledCount()).toBe(1);
    expect(hand(t)).toContain('밧줄 2도 · 반음 1개');
  });

  it('성질 단추와 도수 단추의 접근 이름은 소리 내어 읽어도 뜻이 통한다', () => {
    const t = boot({ key: WHOLE_HALF });
    chip(t, 0);
    const labels = qa(t.host, '[data-bridge-pick="identify"] button').map((b) => b.getAttribute('aria-label')!);
    expect(labels.filter((l) => l.startsWith('성질 '))).toHaveLength(INTERVAL_PICK_QUALITIES.length);
    expect(labels.filter((l) => /^\d+도$/.test(l))).toHaveLength(INTERVAL_PICK_NUMBERS.length);
    expect(labels).toContain('성질 단');
    expect(labels).toContain('2도');
  });

  it('질문 네 개에 정답을 단추로 고르고 확인하면 통과한다(손가락만으로)', () => {
    const t = boot({ key: WHOLE_HALF });
    const answers: Array<[string, string]> = [['minor', '2'], ['minor', '2'], ['major', '2'], ['major', '2']];
    answers.forEach(([quality, number], i) => {
      chip(t, i);
      click(q(t.host, `[data-quality="${quality}"]`));
      click(q(t.host, `[data-number="${number}"]`));
    });
    expect(chipTexts(t).every((s) => s.endsWith('✓'))).toBe(true);
    expect(text(q(t.host, '.feedback-idle'))).toBe(bridgeIdleLead('interval', 4, 4));
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    expect(text(box)).toContain(bridgePassedText('interval'));
  });

  it('온음을 반음이라고 답하면 기호와 문장으로 알리고 그 질문의 칩에 ! 표시가 선다', () => {
    const t = boot({ key: WHOLE_HALF });
    [['major', '2'], ['minor', '2'], ['major', '2'], ['major', '2']].forEach(([quality, number], i) => {
      chip(t, i);
      click(q(t.host, `[data-quality="${quality}"]`));
      click(q(t.host, `[data-number="${number}"]`));
    });
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('needsRevision');
    expect(text(box)).toContain('E4에서 F4까지: 목표는 단2도. 지금 고른 것은 장2도.');
    expect(chips(t).map((b) => b.hasAttribute('data-flagged'))).toEqual([true, false, false, false]);
  });

  it('같은 소리 다른 이름(K2): 비교 질문은 소리와 표기를 따로 같다 / 달라요 단추로 답한다', () => {
    const t = boot({ station: 'K2', key: INTERVAL_NAMES });
    chip(t, 0);
    const shelf = q(t.host, '[data-bridge-pick="compare"]')!;
    expect(shelf.getAttribute('aria-label')).toBe('같은가 다른가: 소리와 표기를 따로 답해요');
    const groups = qa(shelf, '[role="group"]');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['소리이 같은가요', '표기이 같은가요']);
    expect(qa(shelf, 'button').map((b) => [b.getAttribute('data-part'), b.getAttribute('data-answer')])).toEqual([
      ['sound', 'same'],
      ['sound', 'different'],
      ['notation', 'same'],
      ['notation', 'different'],
    ].map(([part, answer]) => [part, answer]));
    click(q(t.host, '[data-part="sound"][data-answer="same"]'));
    click(q(t.host, '[data-part="notation"][data-answer="different"]'));
    expect(q(t.host, '[data-part="sound"][data-answer="same"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(t.host, '[data-part="notation"][data-answer="different"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(t.host, '[data-part="notation"][data-answer="same"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(chipTexts(t)[0]).toBe('C♯4와 D♭4 ✓'); // 비교 질문의 이름은 두 이름 그 자체다
  });

  it('음 쌓기(Q29): 끝 말뚝이 없으면 널을 눌러 꽂으라고 말하고, 꽂으면 그 널을 가리키는 이름 단추가 나타난다', () => {
    const t = boot({ station: 'K2', key: BUILD_BASIC });
    chip(t, 0); // D4 위 장3도
    const shelf = q(t.host, '[data-bridge-pick="build"]')!;
    expect(text(shelf)).toContain('널을 눌러 끝 말뚝을 꽂아 주세요.');
    expect(qa(shelf, '[data-stake]')).toHaveLength(0);
    expect(hand(t)).toContain('끝 말뚝을 꽂아 주세요');
    t.plank(7); // F♯4/G♭4 널
    const names = qa<HTMLButtonElement>(t.host, '[data-bridge-pick="build"] [data-stake]');
    expect(names.map((b) => b.getAttribute('data-stake'))).toEqual(['F♯4', 'G♭4']);
    expect(names.map((b) => b.getAttribute('aria-label'))).toEqual(['끝 말뚝 이름 F♯4', '끝 말뚝 이름 G♭4']);
    expect(names.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']); // 처음에는 올림 이름
    expect(hand(t)).toContain('밧줄 3도 · 반음 4개');
    click(names[1]!);
    expect(live(t)).toBe('끝 말뚝의 이름을 G♭4로 골랐어요.');
    expect(hand(t)).toContain('밧줄 4도 · 반음 4개');
    expect(qa(t.host, '[data-bridge-pick="build"] [data-stake]').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('흰 널에 꽂으면 처음에는 그 널의 이름이 골라져 있다. 같은 소리의 이웃 이름이 있으면 함께 보인다(B4는 C♭5). 음 쌓기 두 질문에 정답을 꽂으면 통과한다', () => {
    const t = boot({ station: 'K2', key: BUILD_BASIC });
    chip(t, 0);
    t.plank(7);
    chip(t, 1);
    t.plank(12); // B4
    const names = qa(t.host, '[data-bridge-pick="build"] [data-stake]');
    expect(names.map((b) => b.getAttribute('data-stake'))).toEqual(['C♭5', 'B4']);
    expect(names.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    // 이름이 하나뿐인 널도 있다(D4)
    const u = boot({ station: 'K2', key: BUILD_BASIC });
    chip(u, 0);
    u.plank(3);
    expect(qa(u.host, '[data-bridge-pick="build"] [data-stake]').map((b) => b.getAttribute('data-stake'))).toEqual(['D4']);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
  });

  it('고른 질문이 이름 묻기나 비교일 때는 끝 말뚝 선반이 없고, 음 쌓기일 때는 성질 선반이 없다', () => {
    const t = boot({ station: 'K2', key: BUILD_BASIC });
    chip(t, 0);
    expect(q(t.host, '[data-bridge-pick="identify"]')).toBeNull();
    expect(q(t.host, '[data-bridge-pick="compare"]')).toBeNull();
    expect(q(t.host, '[data-bridge-pick="build"]')).not.toBeNull();
    const u = boot({ key: WHOLE_HALF });
    chip(u, 0);
    expect(q(u.host, '[data-bridge-pick="build"]')).toBeNull();
    expect(q(u.host, '[data-bridge-pick="identify"]')).not.toBeNull();
  });

  it('높은 도전(Q29): 이름이 달라 틀리고, 이름 단추로 B♭4를 고르면 통과한다', () => {
    const t = boot({ station: 'K2', key: BUILD_CHALLENGE });
    chip(t, 0);
    t.plank(11); // A♯4/B♭4 널: 처음에는 올림 이름
    chip(t, 1);
    t.plank(9); // G♯4
    click(t.action('check'));
    expect(text(q(t.host, '.inst-feedback'))).toContain('소리 높이는 같지만 이름이 달라요');
    chip(t, 0);
    click(q(t.host, '[data-stake="B♭4"]'));
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
  });
});

describe('임시표 과제(Q30): 널을 눌러 깃발을 꽂는다', () => {
  it('선반이 없다: 깃발은 이름표나 이름이 아니라 널에 꽂는다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    expect(q(t.host, '[data-bridge-tags]')).toBeNull();
    expect(q(t.host, '[data-bridge-pick]')).toBeNull();
    expect(q(t.host, '[data-bridge-chips]')!.getAttribute('aria-label')).toBe('깃발 고르기');
    expect(hand(t)).toBe('고른 깃발 없음 · 위 칩이나 ↑ ↓로 골라 주세요 · 널 없음');
  });

  it('널을 차례로 누르면 1번 깃발부터 꽂히고 읽기 줄이 따라간다. 완료 기준: 깃발의 소리가 66, 65, 65, 66이다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    t.plank(7);
    expect(chipTexts(t)).toEqual(['1번 ✓', '2번 —', '3번 —', '4번 —']);
    expect(hand(t)).toContain('2번 깃발'); // 다음 빈 깃발이 골라진다
    expect(hand(t)).toContain('아직 꽂지 않았어요');
    t.plank(6);
    t.plank(6);
    t.plank(7);
    expect(chipTexts(t)).toEqual(['1번 ✓', '2번 ✓', '3번 ✓', '4번 ✓']);
    expect(t.session.contentOf(Q30, 'g-major-f').slots.map((s) => s.midi)).toEqual([66, 65, 65, 66]);
    expect(hand(t)).toContain('4번 깃발');
    expect(hand(t)).toContain('에 꽂혀 있어요');
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    expect(text(box)).toContain(bridgePassedText('flags'));
  });

  it('조표를 따르지 않고 모두 제자리 F에 꽂으면 틀린 깃발(1번, 4번)에 ! 표시가 선다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    for (let i = 0; i < 4; i++) t.plank(6);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    expect(chips(t).map((b) => b.hasAttribute('data-flagged'))).toEqual([true, false, false, true]);
  });

  it('깃발 빼기 단추는 고른 깃발이 꽂혀 있을 때만 눌린다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    expect(t.action('remove').disabled).toBe(true);
    chip(t, 0);
    expect(t.action('remove').disabled).toBe(true); // 아직 꽂지 않았다
    t.plank(7);
    chip(t, 0);
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(live(t)).toBe('1번 깃발을 뺐어요.');
    expect(chipTexts(t)[0]).toBe('1번 —');
    expect(t.action('remove').disabled).toBe(true);
  });
});

describe('조작 막대의 단추들', () => {
  it('← → 단추는 널을 옮기고 글로 알린다. 끝에서는 멈춘다', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('cursor-right'));
    expect(t.bench.cursor).toBe(1);
    expect(hand(t)).toContain('널 C4');
    click(t.action('cursor-left'));
    expect(live(t)).toContain('첫 널이에요');
    expect(t.bench.cursor).toBe(1);
  });

  it('↑ ↓ 단추는 할 것을 옮기고 그 할 것의 널로 커서도 옮긴다', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('hand-down'));
    expect(chips(t)[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(t.bench.cursor).toBe(2);
    click(t.action('hand-down'));
    click(t.action('hand-down'));
    expect(chips(t)[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(t.bench.cursor).toBe(4);
    click(t.action('hand-up'));
    expect(chips(t)[1]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('놓기 단추: 이름 과제에서는 커서가 선 널의 이름표 자리를 고른다', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('place'));
    expect(live(t)).toBe('먼저 ← →로 널을 골라 주세요.');
    click(t.action('cursor-right'));
    click(t.action('cursor-right')); // 2번 널: 검은 널
    click(t.action('place'));
    expect(chips(t)[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('떼기 단추는 이름표가 걸려 있을 때만 눌린다. 누르면 그 이름표가 떨어진다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(t.action('remove').disabled).toBe(true);
    chip(t, 0);
    expect(t.action('remove').disabled).toBe(true);
    click(tagButton(t, 'C♯'));
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(live(t)).toBe('첫째 검은 널의 올려 부른 이름표의 이름표를 뗐어요.');
    expect(chipTexts(t)[0]).toBe('1번 —');
    expect(t.action('remove').disabled).toBe(true);
  });

  it('비우기 단추는 질문에 성질만 골랐을 때도 눌린다', () => {
    const t = boot({ key: WHOLE_HALF });
    chip(t, 0);
    expect(t.action('remove').disabled).toBe(true);
    click(q(t.host, '[data-quality="minor"]'));
    expect(t.action('remove').disabled).toBe(false);
    click(t.action('remove'));
    expect(q(t.host, '[data-quality="minor"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(t.action('remove').disabled).toBe(true);
  });

  it('실행 취소와 다시 실행 단추는 할 수 있을 때만 눌린다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(t.action('undo').disabled).toBe(true);
    expect(t.action('redo').disabled).toBe(true);
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    expect(t.action('undo').disabled).toBe(false);
    click(t.action('undo'));
    expect(chipTexts(t)[0]).toBe('1번 —');
    expect(t.action('redo').disabled).toBe(false);
    click(t.action('redo'));
    expect(chipTexts(t)[0]).toBe('1번 C♯');
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

  it('과제의 안내: 채우기 전, 일부를 채운 뒤, 모두 채운 뒤가 다르다. 확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(text(q(t.host, '.feedback-idle'))).toBe(bridgeIdleLead('names', 10, 0));
    expect(text(q(t.host, '.feedback-idle'))).toBe("이름표를 모두 채우고 '확인'을 눌러 보세요.");
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    expect(text(q(t.host, '.feedback-idle'))).toBe(bridgeIdleLead('names', 10, 1));
    expect(text(q(t.host, '.feedback-idle'))).toBe("이름표가 1/10개 채워져 있어요. 모두 채우고 '확인'을 눌러 보세요.");
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
    const k3 = boot({ station: 'K3', key: G_MAJOR });
    expect(text(q(k3.host, '.feedback-idle'))).toBe("깃발을 모두 채우고 '확인'을 눌러 보세요.");
    const k1 = boot({ key: WHOLE_HALF });
    expect(text(q(k1.host, '.feedback-idle'))).toBe("답을 모두 채우고 '확인'을 눌러 보세요.");
  });

  it('틀린 곳이 셋보다 많으면 셋까지만 보이고 나머지는 다리 위의 표시를 보라고 말한다', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('check')); // 열 자리가 모두 비었다
    const box = q(t.host, '.inst-feedback')!;
    expect(qa(box, '.feedback-line')).toHaveLength(3);
    expect(text(q(box, '.feedback-more'))).toBe('그 밖에 7가지가 더 있어요. 다리 위의 ! 표시를 보세요.');
    expect(qa(box, '.feedback-line svg path').every((p) => p.getAttribute('d') === ALERT_PATH)).toBe(true);
    expect(qa(box, '.feedback-line strong')).toHaveLength(3); // 기호만이 아니라 굵은 글씨로도 알린다
  });

  it('고치면 지난 확인 결과는 사라지고 안내로 돌아간다', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('none');
    expect(q(t.host, '.feedback-idle')).not.toBeNull();
  });

  it.each([
    ['K1', BLACK_KEYS, NO_TAG_NOTICE],
    ['K3', G_MAJOR, NO_FLAG_NOTICE],
  ] as const)('내 것 듣기 %s: 놓은 것이 없으면 알림만 하고 소리는 없다', (station, key, notice) => {
    const t = boot({ station, key });
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBeNull();
    expect(text(q(t.host, '[data-notice]'))).toContain(notice);
  });

  it('음정 과제에서 질문을 고르지 않고 듣기를 누르면 먼저 고르라고 알린다. 음 쌓기에서는 끝 말뚝이 없으면 그렇게 알린다', () => {
    const t = boot({ station: 'K2', key: BUILD_BASIC });
    click(t.action('hear-mine'));
    expect(live(t)).toBe(PICK_ITEM_FIRST);
    chip(t, 0);
    click(t.action('hear-mine'));
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_STAKE_NOTICE); // 화면에 보이는 안내로 알린다
    expect(t.controller.playing).toBeNull();
  });

  it('내 것 듣기: 있으면 듣는 중이라고 글로 알린다. 정지는 듣는 동안에만 눌린다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(t.action('stop').disabled).toBe(true);
    chip(t, 0);
    click(tagButton(t, 'C♯'));
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toContain('내 것을 듣는 중이에요.');
    expect(t.action('stop').disabled).toBe(false);
    click(t.action('stop'));
    expect(t.controller.playing).toBeNull();
    expect(q(t.host, '[data-listening]')).toBeNull();
    expect(t.action('stop').disabled).toBe(true);
  });

  it('목표 듣기: 과제에서는 목표를 듣는 중이라고 알린다(임시표 과제도 그렇다)', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    expect(text(q(t.host, '[data-listening]'))).toContain('목표를 듣는 중이에요.');
    const k3 = boot({ station: 'K3', key: G_MAJOR });
    click(k3.action('hear-target'));
    expect(k3.controller.playing).toBe('target');
    expect(text(q(k3.host, '[data-listening]'))).toContain('목표를 듣는 중이에요.');
  });

  it('나가기 단추로 나온다', () => {
    const t = boot({ key: BLACK_KEYS });
    click(t.action('exit'));
    expect(t.hud()).toBeNull();
  });
});

describe('표지판과 도움 카드', () => {
  it.each([
    ['K1', ['free', NAME_TAGS_KEY, BLACK_KEYS, WHOLE_HALF]],
    ['K2', ['free', INTERVAL_NAMES, BUILD_BASIC, BUILD_CHALLENGE]],
    ['K3', ['free', G_MAJOR]],
  ] as const)('%s의 표지판은 자유로 놀기와 이 다리의 과제 판본이다', (station, keys) => {
    const t = boot({ station });
    expect(text(q(t.host, '.inst-sign-current'))).toContain('자유로 놀기');
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual([...keys]);
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(keys.map((_, i) => (i === 0 ? 'true' : 'false')));
  });

  it('표지판에서 고르면 그 과제가 열리고 목록이 닫힌다. 할 것 칩과 선반이 그 과제로 바뀐다', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, `[data-sign="${WHOLE_HALF}"]`));
    expect(t.controller.current?.variant.variantId).toBe('whole-and-half');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(t.hud()!.getAttribute('data-target')).toBe(WHOLE_HALF);
    expect(t.hud()!.getAttribute('data-bridge-task')).toBe('interval');
    expect(chips(t)).toHaveLength(4);
    expect(q(t.host, '[data-bridge-tags]')).toBeNull();
    expect(text(q(t.host, '.inst-sign-current'))).toContain('온음과 반음');
  });

  it.each([
    ['이름 과제', 'K1', BLACK_KEYS, 'names'],
    ['음정 과제', 'K2', BUILD_BASIC, 'interval'],
    ['임시표 과제', 'K3', G_MAJOR, 'flags'],
  ] as const)('도움 카드: %s는 그에 맞는 키 표를 보인다. 한 번 더 누르면 닫힌다', (_name, station, key, task) => {
    const t = boot({ station, key });
    expect(q(t.host, '#inst-help')).toBeNull();
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(card.getAttribute('aria-label')).toBe('키보드 도움');
    const table = bridgeKeyTableOf(task);
    expect(qa(card, '.help-list li')).toHaveLength(table.length);
    for (const row of table) {
      expect(text(card)).toContain(row.keys);
      expect(text(card)).toContain(row.label);
    }
    expect(text(card)).toContain('끌지 않아도 모두 할 수 있어요');
    expect(text(card)).toContain('널을 밟으면 그 널의 소리가 나요');
    expect(t.action('help').getAttribute('aria-expanded')).toBe('true');
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
  });

  it('패널로 보기: 자유로 놀 때는 알리기만 하고, 과제에서는 그 판본의 패널을 연다', () => {
    const t = boot();
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([]);
    expect(live(t)).toBe(FREE_PLAY_NO_PANEL);
    act(() => void t.ic.select(WHOLE_HALF));
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([ContentCatalog.hashFor(Q28, 'whole-and-half')]);
  });
});

describe('키보드(keyBridgeKeys의 표)', () => {
  it('→ ←는 널을 옮기고 브라우저의 동작을 막는다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(t.press('ArrowRight').defaultPrevented).toBe(true);
    expect(t.bench.cursor).toBe(1);
    t.press('ArrowRight');
    expect(t.bench.cursor).toBe(2);
    t.press('ArrowLeft');
    expect(t.bench.cursor).toBe(1);
    expect(t.navigations).toEqual([]);
  });

  it('↑ ↓는 할 것을 옮기고, Shift+↑ ↓는 이름표를 바꾼다(이름 과제)', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(t.press('ArrowDown').defaultPrevented).toBe(true);
    expect(t.bench.selectedItem()).toMatchObject({ draft: 0 });
    t.press('ArrowDown', { shiftKey: true });
    expect(t.bench.items()[0]).toMatchObject({ text: 'C♯' });
    t.press('ArrowDown', { shiftKey: true });
    expect(t.bench.items()[0]).toMatchObject({ text: 'D♭' });
    t.press('ArrowUp', { shiftKey: true });
    expect(t.bench.items()[0]).toMatchObject({ text: 'C♯' });
    t.press('ArrowDown');
    expect(t.bench.selectedItem()).toMatchObject({ draft: 1 });
    t.press('ArrowUp');
    t.press('ArrowUp');
    expect(t.bench.selectedItem()).toMatchObject({ draft: 0 });
  });

  it('Enter와 Space는 놓고, Backspace는 뺀다. Z와 Y는 되돌린다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    t.press('ArrowDown'); // 1번 깃발
    for (let i = 0; i < 7; i++) t.press('ArrowRight');
    t.press('Enter');
    expect(t.bench.items()[0]).toMatchObject({ plank: 7 });
    expect(t.bench.selectedItem()).toMatchObject({ order: 2 }); // 꽂고 나면 다음 빈 깃발이 골라진다
    t.press('ArrowUp'); // 1번 깃발로 돌아간다
    t.press('Backspace');
    expect(t.bench.items()[0]).toMatchObject({ plank: null });
    t.press('KeyZ');
    expect(t.bench.items()[0]).toMatchObject({ plank: 7 });
    t.press('KeyY');
    expect(t.bench.items()[0]).toMatchObject({ plank: null });
    t.press('Space');
    expect(t.bench.items()[0]).toMatchObject({ plank: 7 });
  });

  it('P·T·S·C는 듣기와 확인이다. V는 패널로 보기다', () => {
    const t = boot({ key: BLACK_KEYS });
    t.press('KeyT');
    expect(t.controller.playing).toBe('target');
    t.press('KeyS');
    expect(t.controller.playing).toBeNull();
    t.press('KeyP');
    expect(text(q(t.host, '[data-notice]'))).toContain(NO_TAG_NOTICE);
    t.press('KeyC');
    expect(t.controller.feedback?.passed).toBe(false);
    t.press('KeyV');
    expect(t.navigations).toEqual([ContentCatalog.hashFor(Q27, 'black-key-names')]);
  });

  it('널·할 것·이름을 옮기는 키는 꾹 눌러도 되풀이되고, 놓기·빼기·듣기는 한 번만 된다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    t.press('ArrowRight', { repeat: true });
    t.press('ArrowRight', { repeat: true });
    expect(t.bench.cursor).toBe(2);
    t.press('ArrowDown');
    t.press('Enter', { repeat: true }); // 놓기는 되풀이되지 않는다
    expect(t.bench.items()[0]).toMatchObject({ plank: null });
    t.press('Enter');
    expect(t.bench.items()[0]).toMatchObject({ plank: 2 });
    t.press('KeyP', { repeat: true });
    expect(t.controller.playing).toBeNull();
    t.press('Backspace', { repeat: true });
    expect(t.bench.items()[0]).toMatchObject({ plank: 2 });
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
    const t = boot({ station: 'K3', key: G_MAJOR });
    const button = t.action('cursor-right');
    button.focus();
    expect(t.press('Enter', {}, button).defaultPrevented).toBe(false);
    expect(t.bench.items()[0]).toMatchObject({ plank: null });
    const arrow = t.press('ArrowRight', {}, button);
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(button);
    t.press('ArrowDown');
    t.press('Enter'); // 방향키 뒤의 Enter는 그 단추가 아니라 놓기다
    expect(t.bench.items()[0]).toMatchObject({ plank: 1 });
  });

  it('글자를 쓰는 칸에서는 받지 않고, 위의 겹침 화면이 이미 쓴 키(defaultPrevented)도 받지 않는다', () => {
    const t = boot({ key: BLACK_KEYS });
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

  it('Ctrl·Alt·Meta와 함께 누른 것은 지나간다(복사 Ctrl+C, 인쇄 Ctrl+P …). 실행 취소와 다시 실행(Ctrl+Z, Ctrl+Y)만 받는다. 모르는 키와 앱 전체의 단축키(M, L, N)도 지나간다', () => {
    const t = boot({ key: BLACK_KEYS });
    expect(t.press('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyP', { altKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyC', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyC', { metaKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyP', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.controller.feedback).toBeNull(); // Ctrl+C가 '확인'으로 읽히지 않았다
    expect(t.controller.playing).toBeNull();
    expect(t.press('KeyQ').defaultPrevented).toBe(false);
    expect(t.press('Tab').defaultPrevented).toBe(false);
    for (const code of ['KeyM', 'KeyL', 'KeyN']) expect(t.press(code).defaultPrevented, code).toBe(false);
    expect(t.bench.cursor).toBeNull();
    // 실행 취소와 다시 실행은 Ctrl(또는 Cmd)과 함께 누르는 것도 받는다
    t.press('ArrowDown');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.bench.items()[0]).toMatchObject({ text: 'C♯' });
    expect(t.press('KeyZ', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(t.bench.items()[0]).toMatchObject({ text: null });
    expect(t.press('KeyY', { metaKey: true }).defaultPrevented).toBe(true);
    expect(t.bench.items()[0]).toMatchObject({ text: 'C♯' });
  });

  it('월드가 멈춰 있는 동안(패널이 위에 열려 있을 때)과 모드를 나온 뒤에는 받지 않는다', () => {
    const t = boot({ key: BLACK_KEYS });
    act(() => t.bridge.pause.set(true));
    expect(t.press('ArrowRight').defaultPrevented).toBe(false);
    expect(t.bench.cursor).toBeNull();
    act(() => t.bridge.pause.set(false));
    act(() => t.ic.exit());
    expect(t.press('Enter').defaultPrevented).toBe(false);
    expect(t.navigations).toEqual([]);
  });

  it('표지판 목록 안에서는 목록이 키를 쓴다: ↑ ↓로 항목을 옮기고 → 키는 널을 옮기지 않는다. Esc로 닫으면 표지판 단추로 돌아온다', () => {
    const t = boot();
    const toggle = q<HTMLButtonElement>(t.host, '[data-sign-toggle]')!;
    toggle.focus();
    click(toggle);
    expect(document.activeElement).toBe(q(t.host, '[data-sign="free"]'));
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(down));
    expect(document.activeElement).toBe(q(t.host, `[data-sign="${NAME_TAGS_KEY}"]`));
    const right = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(right));
    expect(t.bench.cursor).toBeNull();
    t.press('Escape', {}, document.activeElement!);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe('널을 눌러서도 한다(손가락만으로)', () => {
  it('이름표 자리가 있는 널을 누르면 그 자리가 골라지고 칩이 따라간다', () => {
    const t = boot({ key: BLACK_KEYS });
    t.plank(4);
    expect(chips(t).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', ...Array<string>(7).fill('false')]);
    t.plank(4);
    expect(chips(t)[3]!.getAttribute('aria-pressed')).toBe('true'); // 같은 널의 내려 부른 자리로 번갈아 간다
  });

  it('질문의 말뚝이 선 널을 누르면 그 질문이 골라진다', () => {
    const t = boot({ key: WHOLE_HALF });
    t.plank(12);
    expect(chips(t)[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(q(t.host, '[data-bridge-pick="identify"]')).not.toBeNull();
  });

  it('작업대를 나가면 널을 눌러도 아무 일도 일어나지 않는다', () => {
    const t = boot({ station: 'K3', key: G_MAJOR });
    act(() => t.ic.exit());
    t.plank(7);
    expect(t.session.contentOf(Q30, 'g-major-f').slots.every((s) => s.midi === null || s.midi === undefined || s.midi === 0)).toBe(true);
  });
});

describe('조작 막대가 가리는 높이를 월드에 알린다(카메라가 다리를 막대 위쪽에 담는다)', () => {
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
   * 건반 다리 세 곳(K1–K3)에 놓인 판본 전부(Q04의 두 판본과 새 과제 Q27–Q30의 다섯 개)를 콘텐츠에서 읽는다.
   * 7-8 전에는 이 가운데 다섯만 손으로 적어 두었고 Q04의 이름표 판본과 Q29의 높은 도전은 빠져 있었다. 반음 계단(K4, Q31)은 디딤돌 길 작업대라 scale-trail-hud.test.tsx가 맡는다.
   */
  const CASES: Array<readonly [Station, string]> = (Object.keys(ID) as Station[]).flatMap((station) =>
    [Q_SAME, Q27, Q28, Q29, Q30].flatMap((qid) => quest(qid).placements.flatMap((p) => (p.kind === 'installation' && p.installationId === ID[station] ? p.variantIds.map((vid) => [station, `${qid}/${vid}`] as const) : []))),
  );

  it('건반 다리에 놓인 판본을 하나도 빠뜨리지 않는다: K1 셋, K2 셋, K3 하나', () => {
    expect(CASES.map(([station, key]) => `${station} ${key}`).sort()).toEqual([`K1 ${NAME_TAGS_KEY}`, `K1 ${BLACK_KEYS}`, `K1 ${WHOLE_HALF}`, `K2 ${INTERVAL_NAMES}`, `K2 ${BUILD_BASIC}`, `K2 ${BUILD_CHALLENGE}`, `K3 ${G_MAJOR}`].sort());
  });

  it.each(CASES)('%s의 %s: 도움 카드를 열고 닫고, 목표와 내 것을 들어도 기록되는 시도는 없고 작업대에서 그대로 이어진다', (station, key) => {
    const t = boot({ station, key });
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).not.toBeNull();
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    click(t.action('stop'));
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
    // 도움과 듣기는 판정을 부르지 않는다: 시도도 설명도 없고, 작업대는 그대로 열려 있다
    expect(t.controller.attempts).toHaveLength(0);
    expect(t.controller.feedback).toBeNull();
    expect(q(t.host, '[data-installation-hud]')).not.toBeNull();
  });
});
