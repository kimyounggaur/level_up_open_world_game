// @vitest-environment jsdom
// 4.9 합주 무대(T7)의 화면: 표지판, 마디 고르기, 듣기 범위, 조작 막대, 도움 카드, 확인 결과, 키보드. 끌지 않아도 모두 된다(W-4).
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 무대 작업대만으로 화면이 하는 일을 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import { freeHashFor } from '@/domain/content';
import { pieceInsertEdit } from '@/domain/creation';
import type { Creation } from '@/domain/creation';
import type { ScoreEvent } from '@/domain/score';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { STAGE_FREE_KEY_TABLE, STAGE_KEY_TABLE } from '@/ui/challenge/stageKeys';
import { STAGE_PASSED_TEXT, stageFreeIdleText, stageIdleShort, stageIdleText } from '@/ui/challenge/stageText';
import { StageHud } from '@/ui/installation/StageHud';
import { FESTIVAL_LABEL, FREE_MELODY_LABEL, InstallationController, NO_SONGS_NOTE, SONGS_LABEL } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { EIGHT, Q01, Q02, Q07, installation, quest, rig, songsOf } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));
const Q08 = 'song.short-piece';
const STAGE = 'inst.village.ensemble-stage';
const HASH_ONE = ContentCatalog.hashFor(Q08, 'one-voice');
const HASH_TWO = ContentCatalog.hashFor(Q08, 'two-voices');

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
  /** 자유 가락(기본)에 머문다. 아니면 들어간 뒤 아래 판본을 고른다(기본은 한 성부) */
  free?: boolean;
  variant?: 'one-voice' | 'two-voices' | 'challenge';
  /** 표지판에 내 곡 다시 듣기 / 잔치 열기를 잇는다 */
  songs?: Creation[];
  festival?: { open(): boolean };
}

function boot(opts: BootOptions = {}) {
  const r = rig({ definitions: [quest(Q01), quest(Q02), quest(Q07), quest(Q08)], ...opts });
  const bridge = new WorldBridge({ x: 4056, y: 3081, facing: 'right' });
  const inst = installation(STAGE);
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [inst],
    panels: new Set(['panel.song']),
    frames: { request: () => 0, cancel: () => undefined },
    ...(opts.songs ? { creations: { list: () => opts.songs!, get: (id: string) => opts.songs!.find((c) => c.creationId === id) } } : {}),
    ...(opts.festival ? { festival: opts.festival } : {}),
  });
  const navigations: string[] = [];
  ic.setNavigator((hash) => void navigations.push(hash));
  if (opts.enter !== false) {
    act(() => void ic.enter('H5'));
    if (!opts.free) act(() => void ic.select(`${Q08}/${opts.variant ?? 'one-voice'}`));
  }
  const m = mount(
    <StageHud
      bridge={bridge}
      controller={r.controller}
      installation={ic}
      stage={ic.stageOf(inst)!}
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
  const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    act(() => void target.dispatchEvent(ev));
    return ev;
  };
  const action = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-action="${name}"]`)!;
  const chip = (measure: number): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-measure="${measure}"]`)!;
  const scope = (value: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-scope="${value}"]`)!;
  const fill = (voiceId: string, measureIndex: number, count = Infinity): void => {
    const events: ScoreEvent[] = r.controller.current!.def.score.events.filter((e) => e.voiceId === voiceId && e.measureIndex === measureIndex).slice(0, count);
    act(() => {
      for (const e of events) r.controller.edit({ type: 'addEvent', event: { ...e, eventId: `d-${e.eventId}` } });
    });
  };
  const fillAll = (): void => {
    for (const v of r.controller.scopeVoices()) for (let k = 0; k < 4; k++) fill(v.voiceId, k);
  };
  return { ...r, bridge, inst, ic, m, host: m.host, navigations, hud, slots, press, action, chip, scope, fill, fillAll };
}

describe('들어가면 무대 작업대가 나타난다', () => {
  it('모드 밖에서는 아무것도 그리지 않는다. 들어가면 나타나고, 나오면 사라진다', () => {
    const t = boot({ enter: false });
    expect(t.hud()).toBeNull();
    act(() => void t.ic.enter('H5'));
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe('합주 무대 작업대');
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(STAGE);
    expect(t.hud()!.getAttribute('data-stage')).toBe('true');
    act(() => t.ic.exit());
    expect(t.hud()).toBeNull();
  });

  it('마디 단추 넷, 듣기 범위 단추, 조작 막대의 모든 동작이 단추로 있다. 음을 놓는 단추는 없다', () => {
    const t = boot();
    expect(qa(t.host, '[data-measure]').map((b) => b.getAttribute('data-measure'))).toEqual(['0', '1', '2', '3']);
    expect(qa(t.host, '[data-scope]').map((b) => b.getAttribute('data-scope'))).toEqual(['all', 'measure']);
    expect(qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'))).toEqual(['cell-left', 'cell-right', 'view-panel', 'hear-mine', 'hear-target', 'stop', 'check', 'help', 'exit']);
    expect(q(t.host, '[data-action="place"]')).toBeNull();
    expect(q(t.host, '[data-shelf]')).toBeNull();
    expect(text(q(t.host, '[data-sign-toggle]'))).toContain('선택한 짧은 곡 완성하기 · 한 성부');
  });

  it('단추는 모두 이름을 달고 있고, 조작 막대 단추는 키 안내(aria-keyshortcuts)를 갖는다. 끌어야 하는 것은 없다', () => {
    const t = boot();
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(b.getAttribute('aria-keyshortcuts'), b.outerHTML).toBeTruthy();
      expect(b.type).toBe('button');
    }
    for (const b of qa<HTMLButtonElement>(t.host, '[data-measure]')) expect(b.getAttribute('aria-label')).toBeTruthy();
    expect(qa(t.host, '[draggable]')).toHaveLength(0);
  });

  it('단추의 이름은 보이는 글자를 포함한다(보이는 이름이 곧 접근 이름)', () => {
    const t = boot();
    for (const b of qa<HTMLButtonElement>(t.host, '[data-action]')) {
      const visible = text(q(b, '.inst-btn-label'));
      expect(b.getAttribute('aria-label')!.includes(visible), `${b.getAttribute('aria-label')} ⊇ ${visible}`).toBe(true);
    }
    for (const b of qa<HTMLButtonElement>(t.host, '[data-measure]')) expect(b.getAttribute('aria-label')!.includes(text(b))).toBe(true);
  });

  it('눈에 보이지 않는 알림 칸이 컨트롤러의 알림을 그대로 읽어 준다', () => {
    const t = boot({ free: true });
    const live = q(t.host, '[data-live]')!;
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(text(live)).toContain('합주 무대에 들어왔어요');
    click(t.chip(1));
    expect(text(live)).toContain('2마디를 골랐어요');
  });

  it('inert가 켜져 있으면(위에 안내 카드가 떠 있을 때) 단추가 눌리지 않는다', () => {
    expect(boot({ inert: true }).hud()!.hasAttribute('inert')).toBe(true);
    expect(boot().hud()!.hasAttribute('inert')).toBe(false);
  });

  it('키보드 안내 줄은 키보드가 있는 화면에만 있고, 터치 전용 화면에는 없다', () => {
    expect(q(boot().host, '.inst-hint')).not.toBeNull();
    expect(q(boot({ touchOnly: true }).host, '.inst-hint')).toBeNull();
  });
});

describe('마디 고르기: 고르기만 하고 패널은 열지 않는다', () => {
  it('마디 단추를 누르면 그 마디가 눌림 상태(aria-pressed)가 되고 글로 알린다. 화면은 옮기지 않는다', () => {
    const t = boot();
    expect(qa(t.host, '[data-measure]').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false']);
    expect(text(q(t.host, '.inst-hand'))).toBe('고른 마디 없음 · 듣기 범위 전체');
    click(t.chip(2));
    expect(qa(t.host, '[data-measure]').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false']);
    expect(text(q(t.host, '.inst-hand'))).toBe('고른 마디 3마디 · 듣기 범위 전체');
    expect(t.navigations).toEqual([]);
    expect(t.ic.stage!.measure()).toBe(2);
  });

  it('마디 단추의 이름은 그 마디의 칸 모습을 말한다(비어 있음, n/N)', () => {
    const t = boot();
    expect(t.chip(0).getAttribute('aria-label')).toBe('1마디 고르기. 위 성부 1마디: 비어 있어요.');
    t.fill('v1', 0, 2);
    expect(t.chip(0).getAttribute('aria-label')).toBe('1마디 고르기. 위 성부 1마디: 4칸 중 2칸이 채워졌어요.');
  });

  it('두 성부 판본의 마디 단추는 두 줄 모두의 모습을 말한다', () => {
    const t = boot({ variant: 'two-voices' });
    const label = t.chip(1).getAttribute('aria-label')!;
    expect(label).toContain('위 성부 2마디');
    expect(label).toContain('아래 성부 2마디');
  });

  it('패널에서 열기: 고른 마디가 없으면 1마디를 열고, 단추 이름은 열 마디를 말한다', () => {
    const t = boot();
    expect(t.action('view-panel').getAttribute('aria-label')).toBe('1마디를 패널에서 열기');
    click(t.chip(2));
    expect(t.action('view-panel').getAttribute('aria-label')).toBe('3마디를 패널에서 열기');
    expect(text(t.action('view-panel'))).toContain('패널에서 열기');
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([HASH_ONE]);
    expect(t.ic.stage!.measure()).toBe(2);
  });

  it('← → 단추는 마디를 옮기고, 처음과 끝에서는 알려 준다', () => {
    const t = boot();
    click(t.action('cell-right'));
    expect(t.ic.stage!.measure()).toBe(0);
    click(t.action('cell-left'));
    expect(text(q(t.host, '[data-live]'))).toContain('첫 마디예요');
    for (let i = 0; i < 4; i++) click(t.action('cell-right'));
    expect(t.ic.stage!.measure()).toBe(3);
    expect(text(q(t.host, '[data-live]'))).toContain('마지막 마디예요');
  });
});

describe('듣기 범위: 도움이다', () => {
  it('한 성부 판본: 전체와 고른 마디만 있다. 마디를 고르면 이름이 N마디만으로 바뀐다', () => {
    const t = boot();
    expect(qa(t.host, '[data-scope]').map((b) => text(b))).toEqual(['전체', '고른 마디만']);
    click(t.chip(1));
    expect(qa(t.host, '[data-scope]').map((b) => text(b))).toEqual(['전체', '2마디만']);
  });

  it('두 성부 판본: 전체, 위 성부만, 아래 성부만, 고른 마디만', () => {
    const t = boot({ variant: 'two-voices' });
    expect(qa(t.host, '[data-scope]').map((b) => text(b))).toEqual(['전체', '위 성부만', '아래 성부만', '고른 마디만']);
    expect(qa(t.host, '[data-scope]').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('누르면 그 범위가 눌림 상태가 되고, 전체가 아니면 도움 사용으로 적힌다', () => {
    const t = boot({ variant: 'two-voices' });
    click(t.scope('voice:v2'));
    expect(t.scope('voice:v2').getAttribute('aria-pressed')).toBe('true');
    expect(t.scope('all').getAttribute('aria-pressed')).toBe('false');
    expect(text(q(t.host, '.inst-hand'))).toContain('듣기 범위 아래 성부만');
    expect(t.controller.usedAssist()).toBe(true);
    click(t.scope('all'));
    expect(text(q(t.host, '.inst-hand'))).toContain('듣기 범위 전체');
  });

  it('듣는 동안 범위의 이름을 함께 말한다', () => {
    const t = boot({ variant: 'two-voices' });
    click(t.scope('voice:v1'));
    click(t.action('hear-target'));
    expect(text(q(t.host, '[data-listening]'))).toBe('목표를 듣는 중이에요. (위 성부만)');
    expect(t.action('stop').disabled).toBe(false);
    click(t.action('stop'));
    expect(q(t.host, '[data-listening]')).toBeNull();
  });
});

describe('확인 결과와 안내', () => {
  it('아직 아무것도 놓지 않았을 때의 안내: 채운 칸 수와 패널에서 놓는다는 길을 말한다', () => {
    const t = boot();
    expect(text(q(t.host, '.feedback-idle'))).toBe(stageIdleText(4, 0));
    expect(text(q(t.host, '.feedback-idle'))).toContain('패널에서 열기');
    t.fill('v1', 0);
    expect(text(q(t.host, '.feedback-idle'))).toBe(stageIdleText(4, 1));
  });

  it('모든 칸을 채우면 배치 확인을 권한다', () => {
    const t = boot();
    t.fillAll();
    expect(text(q(t.host, '.feedback-idle'))).toBe(stageIdleText(4, 4));
    expect(text(q(t.host, '.feedback-idle'))).toContain('배치 확인');
  });

  it('작은 세로 휴대폰용 한 줄 안내가 따로 있고, 화면 낭독기는 긴 안내만 읽는다(두 번 읽히지 않는다)', () => {
    const t = boot();
    const short = q(t.host, '.feedback-idle-short')!;
    expect(text(short)).toBe(stageIdleShort(4, 0));
    expect(text(short)).toBe('채운 칸 0/4 · 칸을 눌러 열어요.');
    expect(short.getAttribute('aria-hidden')).toBe('true');
    // 긴 안내는 화면 낭독기에 그대로 남는다: 숨기는 것은 화면에서뿐이다(CSS). 여기서는 읽히는 쪽에 aria-hidden이 없음을 확인한다
    const full = q(t.host, '.feedback-idle')!;
    expect(full.getAttribute('aria-hidden')).toBeNull();
    t.fill('v1', 0);
    expect(text(q(t.host, '.feedback-idle-short'))).toBe(stageIdleShort(4, 1));
    // 모두 채우면 한 줄로 줄일 말이 따로 없다: 긴 안내와 같은 말이다
    expect(stageIdleShort(4, 4)).toBe(stageIdleText(4, 4));
    const done = boot();
    done.fillAll();
    expect(text(q(done.host, '.feedback-idle-short'))).toBe(stageIdleText(4, 4));
  });

  it('확인 결과나 알림이 있으면 한 줄 안내도 함께 사라진다', () => {
    const t = boot();
    click(t.action('check'));
    expect(q(t.host, '.feedback-idle-short')).toBeNull();
    expect(q(t.host, '.feedback-idle')).toBeNull();
  });

  it('마디 단추 줄에는 줄이는 화면에서 숨길 수 있는 이름이 붙어 있고, 같은 일을 하는 이전·다음 마디 단추가 막대에 남아 있다', () => {
    const t = boot();
    const group = q(t.host, '.inst-picks-measures')!;
    expect(group.getAttribute('aria-label')).toBe('마디 고르기');
    expect(qa(group, 'button[data-measure]').length).toBe(4);
    expect(t.action('cell-left')).toBeTruthy();
    expect(t.action('cell-right')).toBeTruthy();
    // 듣기 범위 단추 줄은 숨기는 줄에 들어 있지 않다
    expect(group.contains(q(t.host, '[data-scope]'))).toBe(false);
  });

  it('배치 확인: 고칠 곳이 있으면 기호와 문장으로 알린다', () => {
    const t = boot();
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('needsRevision');
    expect(qa(box, '.feedback-line').length).toBeGreaterThan(0);
    expect(qa(box, '.feedback-line').length).toBeLessThanOrEqual(3);
    expect(q(box, '.feedback-line svg')).not.toBeNull();
  });

  it('다 맞게 채우고 확인하면 통과하고, 곡 패널과 같은 말을 쓴다', () => {
    const t = boot();
    t.fillAll();
    click(t.action('check'));
    const box = q(t.host, '.inst-feedback')!;
    expect(box.getAttribute('data-feedback')).toBe('passed');
    expect(text(box)).toContain('통과했어요.');
    expect(text(box)).toContain(STAGE_PASSED_TEXT);
  });

  it('내 곡 듣기: 놓은 음이 없으면 알림만 한다', () => {
    const t = boot();
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBeNull();
    expect(q(t.host, '[data-notice]')).not.toBeNull();
  });

  it('내 곡 듣기: 놓은 음이 있으면 듣는 중이라고 글로 알린다', () => {
    const t = boot();
    t.fill('v1', 0);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toBe('내 곡을 듣는 중이에요. (전체)');
  });

  it('나가기 단추로 나온다', () => {
    const t = boot();
    click(t.action('exit'));
    expect(t.hud()).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
  });
});

describe('표지판과 도움 카드', () => {
  it('표지판을 열면 자유 가락과 판본 셋이 나타난다. 맨 위 자유 가락을 고르면 자유 가락이 열린다(4.2, 4.9)', () => {
    const t = boot();
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual(['free', `${Q08}/one-voice`, `${Q08}/two-voices`, `${Q08}/challenge`]);
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
    const free = items[0]!;
    expect(text(free)).toContain(FREE_MELODY_LABEL);
    expect(text(free)).not.toContain('준비 중');
    expect(free.hasAttribute('aria-disabled')).toBe(false);
    click(free);
    expect(t.controller.current?.free).toBe(true);
    expect(t.hud()!.getAttribute('data-free')).toBe('true');
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    // 고르면 목록이 닫히고 표지판 단추가 자유 가락을 말한다
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(text(q(t.host, '.inst-sign-current'))).toBe(FREE_MELODY_LABEL);
  });

  it('틀로 삼을 합주 과제가 없는 판에서는 무대에 들어가지 않고 작업대도 그리지 않는다(빈 작업대를 남기지 않는다)', () => {
    const t = boot({ free: true, definitions: [quest(Q01), quest(Q02), quest(Q07)] });
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.controller.current).toBeNull();
    expect(t.hud()).toBeNull();
  });

  it('판본을 고르면 그 판본이 열리고 표지판이 닫히고, 마디 선택은 남는다. 듣기 범위 단추도 판본에 맞게 바뀐다', () => {
    const t = boot();
    click(t.chip(1));
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, `[data-sign="${Q08}/two-voices"]`));
    expect(t.controller.current?.variant.variantId).toBe('two-voices');
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(text(q(t.host, '.inst-sign-current'))).toBe('선택한 짧은 곡 완성하기 · 두 성부');
    expect(t.hud()!.getAttribute('data-target')).toBe(`${Q08}/two-voices`);
    expect(qa(t.host, '[data-scope]')).toHaveLength(4);
  });

  it('도움 카드는 무대의 키 표를 보인다. 음을 놓는 키는 없다', () => {
    const t = boot();
    expect(q(t.host, '#inst-help')).toBeNull();
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(card.getAttribute('aria-label')).toBe('키보드 도움');
    expect(qa(card, '.help-list li')).toHaveLength(STAGE_KEY_TABLE.length);
    for (const row of STAGE_KEY_TABLE) expect(text(card)).toContain(row.keys);
    expect(text(card)).not.toContain('Backspace');
    expect(t.action('help').getAttribute('aria-expanded')).toBe('true');
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
  });
});

describe('키보드(stageKeys의 표)', () => {
  it('→ ←는 마디를 옮기고 소리나 화면을 바꾸지 않는다', () => {
    const t = boot();
    expect(t.press('ArrowRight').defaultPrevented).toBe(true);
    expect(t.ic.stage!.measure()).toBe(0);
    t.press('ArrowRight');
    expect(t.ic.stage!.measure()).toBe(1);
    t.press('ArrowLeft');
    expect(t.ic.stage!.measure()).toBe(0);
    expect(t.navigations).toEqual([]);
  });

  it('Enter, Space, V는 고른 마디를 패널에서 연다', () => {
    const t = boot();
    t.press('ArrowRight');
    t.press('Enter');
    t.press('Space');
    t.press('KeyV');
    expect(t.navigations).toEqual([HASH_ONE, HASH_ONE, HASH_ONE]);
  });

  it('단추에 초점이 있을 때 Enter는 그 단추를 누르는 일이다. 방향키는 초점을 놓아 준다', () => {
    const t = boot();
    const button = t.chip(2);
    button.focus();
    expect(t.press('Enter', {}, button).defaultPrevented).toBe(false);
    expect(t.navigations).toEqual([]);
    // V는 단추에 초점이 있어도 패널 열기다
    t.press('KeyV', {}, button);
    expect(t.navigations).toEqual([HASH_ONE]);
    // 방향키는 초점을 놓는다: 이어서 누르는 Enter가 그 단추가 아니라 패널 열기가 되게
    const prevented = t.press('ArrowRight', {}, button);
    expect(prevented.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(button);
  });

  it('R은 듣기 범위를 돌린다', () => {
    const t = boot({ variant: 'two-voices' });
    t.press('KeyR');
    expect(t.scope('voice:v1').getAttribute('aria-pressed')).toBe('true');
    t.press('KeyR');
    t.press('KeyR');
    t.press('KeyR');
    expect(t.scope('all').getAttribute('aria-pressed')).toBe('true');
  });

  it('P·T·S·C는 듣기와 확인이다', () => {
    const t = boot();
    t.fill('v1', 0);
    t.press('KeyP');
    expect(t.controller.playing).toBe('mine');
    t.press('KeyS');
    expect(t.controller.playing).toBeNull();
    t.press('KeyT');
    expect(t.controller.playing).toBe('target');
    t.press('KeyS');
    t.press('KeyC');
    expect(t.controller.feedback).not.toBeNull();
  });

  it('음을 놓고 빼는 키(↑ ↓ Backspace Z Y)는 이 작업대에서 아무 일도 하지 않고, 브라우저의 것도 막지 않는다', () => {
    const t = boot();
    t.fill('v1', 0, 1);
    for (const code of ['ArrowUp', 'ArrowDown', 'Backspace', 'Delete', 'KeyZ', 'KeyY']) expect(t.press(code).defaultPrevented, code).toBe(false);
    expect(t.controller.content().events).toHaveLength(1);
  });

  it('Esc는 열려 있는 표지판 목록과 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다', () => {
    const t = boot();
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

  it('H는 도움 카드를 여닫는다', () => {
    const t = boot();
    t.press('KeyH');
    expect(q(t.host, '#inst-help')).not.toBeNull();
    t.press('KeyH');
    expect(q(t.host, '#inst-help')).toBeNull();
  });

  it('글자를 쓰는 칸에서는 받지 않고, 위의 겹침 화면이 이미 쓴 키(defaultPrevented)도 받지 않는다', () => {
    const t = boot();
    const input = document.createElement('input');
    document.body.appendChild(input);
    cleanups.push(() => input.remove());
    expect(t.press('ArrowRight', {}, input).defaultPrevented).toBe(false);
    expect(t.ic.stage!.measure()).toBeNull();
    const first = (e: Event): void => e.preventDefault();
    window.addEventListener('keydown', first, true);
    t.press('ArrowRight');
    window.removeEventListener('keydown', first, true);
    expect(t.ic.stage!.measure()).toBeNull();
  });

  it('Ctrl·Alt·Meta와 함께 누른 것과 모르는 키는 지나간다', () => {
    const t = boot();
    expect(t.press('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyP', { altKey: true }).defaultPrevented).toBe(false);
    expect(t.press('KeyQ').defaultPrevented).toBe(false);
    expect(t.press('Tab').defaultPrevented).toBe(false);
    expect(t.ic.stage!.measure()).toBeNull();
  });

  it('월드가 멈춰 있는 동안(패널이 위에 열려 있을 때)은 받지 않는다', () => {
    const t = boot();
    act(() => t.bridge.pause.set(true));
    expect(t.press('ArrowRight').defaultPrevented).toBe(false);
    expect(t.ic.stage!.measure()).toBeNull();
  });

  it('모드를 나온 뒤에는 키를 받지 않는다', () => {
    const t = boot();
    act(() => t.ic.exit());
    expect(t.press('Enter').defaultPrevented).toBe(false);
    expect(t.navigations).toEqual([]);
  });

  it('두 성부 판본에서도 패널 주소는 그 판본의 것이다', () => {
    const t = boot({ variant: 'two-voices' });
    t.press('ArrowRight');
    t.press('Enter');
    expect(t.navigations).toEqual([HASH_TWO]);
  });
});

describe('표지판 목록의 키보드(W-4)', () => {
  it('목록을 열면 초점이 고른 항목으로 가고, 닫으면 표지판 단추로 돌아온다. 목록 안에서는 ↑ ↓로 옮긴다', () => {
    const t = boot();
    const toggle = q<HTMLButtonElement>(t.host, '[data-sign-toggle]')!;
    toggle.focus();
    click(toggle);
    expect(document.activeElement).toBe(q(t.host, `[data-sign="${Q08}/one-voice"]`));
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(down));
    expect(document.activeElement).toBe(q(t.host, `[data-sign="${Q08}/two-voices"]`));
    // 목록 안에서 → 키는 마디를 옮기지 않는다
    const right = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => void document.activeElement!.dispatchEvent(right));
    expect(t.ic.stage!.measure()).toBeNull();
    t.press('Escape', {}, document.activeElement!);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
});

describe('조작 막대가 가리는 높이를 월드에 알린다(카메라가 바닥을 막대 위쪽에 담는다)', () => {
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

describe('자유 가락의 화면(4.9, 5-6)', () => {
  /** 한 마디를 8분음표 여덟 개로 채운다 */
  const putMeasure = (t: ReturnType<typeof boot>, measure: number): void => {
    act(() => void t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, measure, `a${measure}`)!));
  };

  it('자유 가락에서는 목표 듣기와 배치 확인 단추가 없고, 듣기 단추는 내 가락 듣기다. 과제 판본의 화면에는 자유 가락 표시가 없다', () => {
    const t = boot({ free: true });
    expect(t.hud()!.getAttribute('data-free')).toBe('true');
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    expect(qa(t.host, '[data-action]').map((b) => b.getAttribute('data-action'))).toEqual(['cell-left', 'cell-right', 'view-panel', 'hear-mine', 'stop', 'help', 'exit']);
    expect(t.action('hear-mine').getAttribute('aria-label')).toBe('내 가락 듣기');
    expect(text(q(t.host, '.inst-sign-current'))).toBe(FREE_MELODY_LABEL);
    expect(text(q(t.host, '.inst-hint'))).not.toContain('C 확인');
    expect(boot().hud()!.hasAttribute('data-free')).toBe(false);
  });

  it('안내 글은 판정하지 않는다고 말하고, 네 칸을 모두 채우면 이름을 붙여 저장하라고 알린다', () => {
    const t = boot({ free: true });
    expect(text(q(t.host, '.feedback-idle'))).toBe(stageFreeIdleText(4, 0));
    expect(text(q(t.host, '.feedback-idle'))).toContain('판정하지 않아요');
    for (let m = 0; m < 4; m++) putMeasure(t, m);
    expect(text(q(t.host, '.feedback-idle'))).toBe(stageFreeIdleText(4, 4));
    expect(text(q(t.host, '.feedback-idle'))).toContain('내 곡이 돼요');
  });

  it('도움 카드는 자유 가락의 키 표를 보인다: 목표 듣기와 배치 확인 키가 없다', () => {
    const t = boot({ free: true });
    click(t.action('help'));
    const card = q(t.host, '#inst-help')!;
    expect(qa(card, '.help-list li')).toHaveLength(STAGE_FREE_KEY_TABLE.length);
    for (const row of STAGE_FREE_KEY_TABLE) expect(text(card)).toContain(row.keys);
    expect(text(card)).not.toContain('목표 듣기');
    expect(text(card)).not.toContain('배치 확인');
  });

  it('T와 C는 판정이 없다고 알리기만 한다. 시도를 남기지 않고 결과 표식도 만들지 않는다', () => {
    const t = boot({ free: true });
    t.press('KeyT');
    expect(text(q(t.host, '[data-notice]'))).toContain(FREE_PLAY_NO_TARGET);
    t.press('KeyC');
    expect(text(q(t.host, '[data-notice]'))).toContain(FREE_PLAY_NO_CHECK);
    expect(t.controller.attempts).toHaveLength(0);
    expect(t.controller.feedback).toBeNull();
    expect(t.controller.playing).toBeNull();
  });

  it('내 가락 듣기: 놓은 음이 없으면 알리기만 하고, 있으면 듣는 중이라고 글로 알린다. 정지는 듣는 동안만 눌린다', () => {
    const t = boot({ free: true });
    expect(t.action('stop').disabled).toBe(true);
    click(t.action('hear-mine'));
    expect(q(t.host, '[data-listening]')).toBeNull();
    expect(q(t.host, '[data-notice]')).not.toBeNull();
    putMeasure(t, 0);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    expect(text(q(t.host, '[data-listening]'))).toBe('내 가락을 듣는 중이에요. (전체)');
    expect(t.action('stop').disabled).toBe(false);
    click(t.action('stop'));
    expect(q(t.host, '[data-listening]')).toBeNull();
    expect(t.action('stop').disabled).toBe(true);
  });

  it('마디를 고르고 패널에서 열면 자유 가락의 주소로 간다. 고른 마디는 남는다', () => {
    const t = boot({ free: true });
    t.press('ArrowRight');
    t.press('ArrowRight');
    expect(t.ic.stage!.measure()).toBe(1);
    expect(t.action('view-panel').getAttribute('aria-label')).toBe('2마디를 패널에서 열기');
    t.press('Enter');
    expect(t.navigations).toEqual([freeHashFor(STAGE)]);
    click(t.action('view-panel'));
    expect(t.navigations).toEqual([freeHashFor(STAGE), freeHashFor(STAGE)]);
    expect(t.ic.stage!.measure()).toBe(1);
  });

  it('저장한 곡이 없으면 표지판의 내 곡 다시 듣기는 이유만 적고 눌러도 아무 일 없다(W-10)', () => {
    const t = boot({ free: true, songs: [] });
    click(q(t.host, '[data-sign-toggle]'));
    const item = q<HTMLButtonElement>(t.host, '[data-sign="songs"]')!;
    expect(text(item)).toContain(SONGS_LABEL);
    expect(text(item)).toContain(NO_SONGS_NOTE);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    click(item);
    expect(q(t.host, '#inst-sign-list')).not.toBeNull();
    expect(t.controller.previewing).toBe(false);
    expect(q(t.host, '#inst-sign-list')!.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨|잠금/);
  });

  it('저장한 곡이 있으면 표지판에 곡마다 항목이 있다(최근 곡이 위). 고르면 목록이 닫히고 무대에서 들려 주며, 정지로 멈춘다', () => {
    const t = boot({ free: true, songs: songsOf(2) });
    click(q(t.host, '[data-sign-toggle]'));
    expect(qa(t.host, '[data-sign]').map((b) => b.getAttribute('data-sign'))).toEqual(['free', `${Q08}/one-voice`, `${Q08}/two-voices`, `${Q08}/challenge`, 'song:creation-2', 'song:creation-1']);
    click(q(t.host, '[data-sign="song:creation-1"]'));
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    expect(t.controller.previewing).toBe(true);
    expect(text(q(t.host, '[data-listening="song"]'))).toBe('곡 1을 듣는 중이에요.');
    // 듣는 동안에는 '채운 칸' 안내를 가리고, 정지가 눌린다. 고른 것(자유 가락)은 그대로다
    expect(q(t.host, '.feedback-idle')).toBeNull();
    expect(t.action('stop').disabled).toBe(false);
    expect(t.hud()!.getAttribute('data-target')).toBe('free');
    click(t.action('stop'));
    expect(t.controller.previewing).toBe(false);
    expect(q(t.host, '[data-listening]')).toBeNull();
    expect(q(t.host, '.feedback-idle')).not.toBeNull();
  });

  it('잔치 열기는 연결되어 있을 때만 표지판에 있고, 고르면 잔치를 열고 목록을 닫는다', () => {
    const opened: number[] = [];
    const t = boot({ free: true, festival: { open: () => (opened.push(1), true) } });
    click(q(t.host, '[data-sign-toggle]'));
    const item = q<HTMLButtonElement>(t.host, '[data-sign="festival"]')!;
    expect(text(item)).toContain(FESTIVAL_LABEL);
    click(item);
    expect(opened).toEqual([1]);
    expect(q(t.host, '#inst-sign-list')).toBeNull();
    const none = boot({ free: true });
    click(q(none.host, '[data-sign-toggle]'));
    expect(q(none.host, '[data-sign="festival"]')).toBeNull();
    expect(q(none.host, '[data-sign="songs"]')).toBeNull();
  });
});
