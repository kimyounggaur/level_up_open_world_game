// @vitest-environment jsdom
// 4-6 소리 물결의 화면(설계서 8.4, 7.6 '화면 가장자리', 7.9의 6번, W-8): 화면 밖 900 px 안의 정거장이 있는 쪽 가장자리에 표식을 그린다.
// 소리를 켰는지와 상관없다. 위치 계산은 ripple.test.ts가 본다. 여기서는 '화면에 어떻게 나오는가'를 본다.
// 진짜 월드(Phaser)의 카메라가 알리는 범위로 그려지는지는 tests/flow/worldsound.flow.ts가 본다.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorldClock } from '@/audio/clock';
import type { RippleSource, WorldView } from '@/domain/ripple';
import { BAR_SEC } from '@/domain/worldsound';
import { WorldBridge } from '@/platform/bridge';
import { PORTRAIT_BOTTOM_INSET, Ripples, rippleSize } from '@/ui/hud/Ripples';
import { bootApp, cleanupApps } from './app-rig';
import { FakeClock } from './audio-fakes';
import { mount, q, qa, setupDom } from './ui-rig';

beforeAll(() => setupDom());

const player = { x: 5000, y: 3000 };
const SCREEN = { width: 1280, height: 720 };
const VIEW: WorldView = { x: player.x - 640, y: player.y - 360, width: 1280, height: 720 };
const at = (id: string, dx: number, dy: number): RippleSource => ({ id, name: `정거장 ${id}`, x: player.x + dx, y: player.y + dy });

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  for (const c of cleanups.splice(0)) c();
  cleanupApps();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

function rig(stations: readonly RippleSource[], opts: { reducedMotion?: boolean; view?: boolean; pieces?: readonly RippleSource[] } = {}) {
  const fake = new FakeClock(100);
  const clock = new WorldClock(fake, 100);
  const bridge = new WorldBridge({ ...player, facing: 'down' });
  if (opts.view !== false) bridge.view.set({ view: VIEW, screen: SCREEN });
  const m = mount(h(Ripples, { bridge, stations, ...(opts.pieces ? { pieces: opts.pieces } : {}), clock, reducedMotion: opts.reducedMotion ?? false }));
  cleanups.push(m.unmount);
  const marks = (): HTMLElement[] => qa(m.host, '.ripple');
  const mark = (id: string): HTMLElement | null => q(m.host, `[data-ripple="${id}"]`);
  const wave = (id: string): HTMLElement | null => q(m.host, `[data-ripple="${id}"] .ripple-wave`);
  /** 세계 시계를 마디 n개만큼 보낸다(타이머도 같은 만큼) */
  const advanceBars = (n: number): void => {
    act(() => {
      fake.t += n * BAR_SEC + 0.005;
      vi.advanceTimersByTime(n * BAR_SEC * 1000 + 5);
    });
  };
  return { ...m, fake, clock, bridge, marks, mark, wave, advanceBars };
}

describe('어느 정거장에 표식을 그리는가', () => {
  it('보이는 범위를 아직 모르면(월드가 시작하기 전) 아무것도 그리지 않는다', () => {
    const t = rig([at('a', 800, 0)], { view: false });
    expect(q(t.host, '.hud-ripples')!.getAttribute('data-ripples')).toBe('0');
    expect(t.marks()).toEqual([]);
  });

  it('화면 밖 900 px 안의 정거장에만 그리고, 화면 안이나 900 px 밖에는 그리지 않는다', () => {
    const t = rig([at('in', 100, 50), at('right', 800, 0), at('up', 0, -600), at('far', 1200, 0), at('far2', 0, 950)]);
    expect(t.marks().map((m) => m.getAttribute('data-ripple')).sort()).toEqual(['right', 'up']);
    expect(q(t.host, '.hud-ripples')!.getAttribute('data-ripples')).toBe('2');
    expect(t.mark('right')!.getAttribute('data-edge')).toBe('right');
    expect(t.mark('up')!.getAttribute('data-edge')).toBe('top');
  });

  it('표식은 그 방향의 가장자리 안쪽 14 px에 놓인다', () => {
    const t = rig([at('right', 800, 0), at('up', 0, -600)]);
    const px = (el: HTMLElement | null, prop: 'left' | 'top'): number => parseFloat(el!.style[prop]);
    expect(px(t.mark('right'), 'left')).toBeCloseTo(1280 - 14, 1);
    expect(px(t.mark('right'), 'top')).toBeCloseTo(360, 1);
    expect(px(t.mark('up'), 'top')).toBeCloseTo(14, 1);
    expect(px(t.mark('up'), 'left')).toBeCloseTo(640, 1);
  });

  it('캐릭터와 카메라가 움직이면 따라 바뀐다: 가까워져 화면 안에 들어오면 사라진다', () => {
    const t = rig([at('right', 800, 0)]);
    expect(t.marks()).toHaveLength(1);
    act(() => {
      t.bridge.position.set({ x: player.x + 400, y: player.y, facing: 'right' });
      t.bridge.view.set({ view: { ...VIEW, x: VIEW.x + 400 }, screen: SCREEN });
    });
    expect(t.marks()).toEqual([]);
    // 멀어지면 다시 생긴다
    act(() => {
      t.bridge.position.set({ x: player.x - 50, y: player.y, facing: 'left' });
      t.bridge.view.set({ view: { ...VIEW, x: VIEW.x - 50 }, screen: SCREEN });
    });
    expect(t.marks()).toHaveLength(1);
  });

  it('가까울수록 크게 그린다', () => {
    const t = rig([at('near', 700, 0), at('far', 880, 0)]);
    const w = (id: string): number => parseInt(t.mark(id)!.style.width, 10);
    expect(w('near')).toBeGreaterThan(w('far'));
    expect(rippleSize(0)).toBe(30);
    expect(rippleSize(1)).toBe(56);
    expect(rippleSize(0.25)).toBe(43);
    expect(rippleSize(-1)).toBe(30);
    expect(rippleSize(9)).toBe(56);
    for (let s = 0; s < 1; s += 0.05) expect(rippleSize(s + 0.05)).toBeGreaterThanOrEqual(rippleSize(s));
  });
});

describe('화면 낭독기와 눌림(7.9)', () => {
  it('보는 표식이다: 낭독기에는 읽히지 않고, 누르거나 초점을 받는 것이 없고, 글자도 없다', () => {
    const t = rig([at('right', 800, 0), at('up', 0, -600)]);
    const layer = q(t.host, '.hud-ripples')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
    expect((layer.textContent ?? '').trim()).toBe('');
  });
});

describe('움직임 줄이기', () => {
  it('켜면 퍼지는 물결 없이 멈춘 표식만 그리고, 마디를 따라 깨우는 타이머도 없다', () => {
    vi.useFakeTimers();
    const still = rig([at('right', 800, 0)], { reducedMotion: true });
    expect(still.marks()).toHaveLength(1);
    expect(qa(still.host, '.ripple-wave')).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('끄면 표식마다 물결이 있다. 내려가면 타이머도 멈춘다', () => {
    vi.useFakeTimers();
    const moving = rig([at('right', 800, 0), at('up', 0, -600)]);
    expect(qa(moving.host, '.ripple-wave')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    moving.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('물결은 서명 소리가 울리는 마디에 퍼진다(같은 박)', () => {
  it('정거장의 순서가 시작 마디를 정한다: 0번은 0·4·8마디, 1번은 1·5·9마디에 새 물결이 퍼진다', () => {
    vi.useFakeTimers();
    const t = rig([at('a', 800, 0), at('b', 800, 80)]);
    const a0 = t.wave('a');
    const b0 = t.wave('b');
    expect(a0).not.toBeNull();
    expect(b0).not.toBeNull();

    t.advanceBars(1); // 마디 1: b가 울린다
    expect(t.clock.bar()).toBe(1);
    expect(t.wave('a')).toBe(a0);
    expect(t.wave('b')).not.toBe(b0);
    const b1 = t.wave('b');

    t.advanceBars(1); // 마디 2: 둘 다 쉰다
    expect(t.wave('a')).toBe(a0);
    expect(t.wave('b')).toBe(b1);

    t.advanceBars(2); // 마디 4: a가 다시 울린다
    expect(t.clock.bar()).toBe(4);
    expect(t.wave('a')).not.toBe(a0);
    expect(t.wave('b')).toBe(b1);

    t.advanceBars(1); // 마디 5: b
    expect(t.wave('b')).not.toBe(b1);
  });

  it('위치가 바뀌어도 이미 퍼지는 물결은 다시 시작하지 않는다', () => {
    vi.useFakeTimers();
    const t = rig([at('a', 800, 0)]);
    const w = t.wave('a');
    act(() => t.bridge.view.set({ view: { ...VIEW, y: VIEW.y + 20 }, screen: SCREEN }));
    expect(t.wave('a')).toBe(w);
  });
});

/** 소리 조각: 이름은 싣지 않는다(못 찾은 것은 이름도 모른다) */
const pieceAt = (id: string, dx: number, dy: number): RippleSource => ({ id, name: '소리 조각', x: player.x + dx, y: player.y + dy });

describe('소리 조각도 화면 밖 900 px 안이면 물결이 있다(8.4)', () => {
  it('정거장과 같은 규칙: 화면 밖 900 px 안의 조각에만 그리고, 표식에 정거장인지 조각인지가 적힌다', () => {
    const t = rig([at('st', 0, -700)], { pieces: [pieceAt('p-in', 100, 50), pieceAt('p-right', 800, 0), pieceAt('p-far', 1200, 0), pieceAt('p-down', 0, 600)] });
    expect(t.marks().map((m) => m.getAttribute('data-ripple')).sort()).toEqual(['p-down', 'p-right', 'st']);
    expect(t.mark('p-right')!.getAttribute('data-source')).toBe('piece');
    expect(t.mark('p-right')!.getAttribute('data-edge')).toBe('right');
    expect(t.mark('p-down')!.getAttribute('data-edge')).toBe('bottom');
    expect(t.mark('st')!.getAttribute('data-source')).toBe('station');
  });

  it('조각이 없으면(기본값) 정거장만 그린다', () => {
    const t = rig([at('a', 800, 0)]);
    expect(t.marks()).toHaveLength(1);
    expect(t.mark('a')!.getAttribute('data-source')).toBe('station');
  });

  it('정거장과 조각이 한데 모여 가까운 것부터 최대 여섯 개까지만 그린다', () => {
    const t = rig(
      [at('s1', 300, 600), at('s2', 350, 600), at('s3', 400, 600)],
      { pieces: [pieceAt('p1', -300, 600), pieceAt('p2', -350, 600), pieceAt('p3', -400, 600), pieceAt('p4', -450, 600), pieceAt('p5', -500, 600)] },
    );
    expect(t.marks()).toHaveLength(6);
  });

  it('낭독기에는 읽히지 않고 이름 글자도 없다: 못 찾은 조각의 이름을 알려 주지 않는다', () => {
    const t = rig([], { pieces: [pieceAt('p-right', 800, 0)] });
    const layer = q(t.host, '.hud-ripples')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect((layer.textContent ?? '').trim()).toBe('');
    expect(layer.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });

  it('보이는 것이 소리와 무관하다: 소리를 켜지 않아도(음소거) 같은 물결이 있다 — 소리 장치에 기대지 않는다', () => {
    const t = rig([], { pieces: [pieceAt('p-right', 800, 0)], reducedMotion: true });
    expect(t.marks()).toHaveLength(1);
    expect(qa(t.host, '.ripple-wave')).toEqual([]);
  });
});

describe('조각의 물결은 조각이 울리는 마디에 퍼진다: 두 마디에 한 번, 번호의 짝홀이 번갈아', () => {
  it('0번은 0·2·4마디, 1번은 1·3·5마디에 새 물결이 퍼진다', () => {
    vi.useFakeTimers();
    const t = rig([], { pieces: [pieceAt('a', 800, 0), pieceAt('b', 800, 80)] });
    let a = t.wave('a');
    let b = t.wave('b');
    expect(a).not.toBeNull();
    for (let bar = 1; bar <= 6; bar++) {
      t.advanceBars(1);
      expect(t.clock.bar()).toBe(bar);
      const a2 = t.wave('a');
      const b2 = t.wave('b');
      if (bar % 2 === 0) {
        expect(a2, `마디 ${bar}의 a`).not.toBe(a);
        expect(b2, `마디 ${bar}의 b`).toBe(b);
      } else {
        expect(a2, `마디 ${bar}의 a`).toBe(a);
        expect(b2, `마디 ${bar}의 b`).not.toBe(b);
      }
      a = a2;
      b = b2;
    }
  });

  it('정거장은 네 마디에 한 번 그대로다(조각이 섞여 있어도 정거장의 박이 바뀌지 않는다)', () => {
    vi.useFakeTimers();
    const t = rig([at('s0', 800, 0), at('s1', 800, 80)], { pieces: [pieceAt('p0', 800, 160)] });
    const s0 = t.wave('s0');
    const p0 = t.wave('p0');
    t.advanceBars(2); // 마디 2: 조각 p0가 울린다, 정거장 s0는 아직이다
    expect(t.wave('s0')).toBe(s0);
    expect(t.wave('p0')).not.toBe(p0);
    t.advanceBars(2); // 마디 4: s0가 울린다
    expect(t.wave('s0')).not.toBe(s0);
  });
});

describe('세로 화면에서는 아래 탭 막대에 가려지지 않는다', () => {
  it('아래쪽 표식은 탭 막대 높이만큼 더 위에 놓인다. 가로 화면에서는 그대로다', () => {
    const landscape = rig([at('down', 0, 700)]);
    expect(parseFloat(landscape.mark('down')!.style.top)).toBeCloseTo(720 - 14, 1);
    landscape.unmount();

    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: query.includes('portrait'), addEventListener: () => undefined, removeEventListener: () => undefined });
    const portrait = rig([at('down', 0, 700)]);
    expect(parseFloat(portrait.mark('down')!.style.top)).toBeCloseTo(720 - 14 - PORTRAIT_BOTTOM_INSET, 1);
    expect(PORTRAIT_BOTTOM_INSET).toBeGreaterThanOrEqual(64); // 탭 막대의 최소 높이
  });
});

describe('탐험 화면 안에서(Hud)', () => {
  // 캐릭터를 H4 자리에 세운다. 900 px 안에서 화면 밖인 정거장은 H5(위쪽)뿐이다
  const standAtH4 = (t: Awaited<ReturnType<typeof bootApp>>): void => {
    const h4 = t.ctx.world.map.station('H4')!;
    act(() => {
      t.ctx.world.bridge.position.set({ x: h4.x, y: h4.y, facing: 'down' });
      t.ctx.world.bridge.view.set({ view: { x: h4.x - 640, y: h4.y - 360, width: 1280, height: 720 }, screen: SCREEN });
    });
  };
  // 정거장의 표식만(소리 조각의 표식은 따로 본다)
  const ids = (host: HTMLElement): string[] => qa(host, '[data-ripple][data-source="station"]').map((m) => m.getAttribute('data-ripple')!);
  const pieceIds = (host: HTMLElement): string[] => qa(host, '[data-ripple][data-source="piece"]').map((m) => m.getAttribute('data-ripple')!);

  it('소리를 켜지 않아도(소리 끔) 물결이 보인다(W-8: 소리 정보는 물결로 대신 받는다)', async () => {
    const t = await bootApp('');
    standAtH4(t);
    expect(t.ctx.mixer.state).toBe('off');
    expect(t.ctx.worldAudio.debug().running).toBe(false);
    expect(ids(t.host)).toEqual(['H5']);
    expect(q(t.host, '[data-ripple="H5"]')!.getAttribute('data-edge')).toBe('top');
  });

  it("설정의 '소리 물결 표시'를 끄면 사라지고, 켜면 다시 나타난다", async () => {
    const t = await bootApp('');
    standAtH4(t);
    expect(q(t.host, '[data-ripples]')).not.toBeNull();
    act(() => t.ctx.settings.update((s) => ({ ...s, soundRipples: false })));
    expect(q(t.host, '[data-ripples]')).toBeNull();
    act(() => t.ctx.settings.update((s) => ({ ...s, soundRipples: true })));
    expect(ids(t.host)).toEqual(['H5']);
  });

  it('움직임 줄이기를 켜면 퍼지는 물결이 없다', async () => {
    const t = await bootApp('');
    standAtH4(t);
    expect(qa(t.host, '[data-source="station"] .ripple-wave')).toHaveLength(1);
    act(() => t.ctx.settings.update((s) => ({ ...s, reducedMotion: true })));
    expect(ids(t.host)).toEqual(['H5']);
    expect(qa(t.host, '.ripple-wave')).toEqual([]);
  });

  it('설치물 모드에서는 그리지 않는다(조작 막대와 겹치고 놓는 일에서 눈을 떼게 한다). 나가면 다시 그린다', async () => {
    const t = await bootApp('');
    standAtH4(t);
    expect(ids(t.host)).toEqual(['H5']);
    act(() => void t.ctx.installation.enter('H4'));
    expect(t.ctx.installation.state.get().mode).not.toBeNull();
    expect(q(t.host, '[data-ripples]')).toBeNull();
    act(() => t.ctx.installation.exit());
    expect(ids(t.host)).toEqual(['H5']);
  });

  it('소리 조각도 같은 규칙으로 그린다: H4 자리에서 900 px 안의 화면 밖 조각은 \'달빛\'(piece-6)뿐이고 아래쪽에 있다. 이름은 싣지 않는다', async () => {
    const t = await bootApp('');
    standAtH4(t);
    expect(pieceIds(t.host)).toEqual(['disc.village.piece-6']);
    expect(q(t.host, '[data-ripple="disc.village.piece-6"]')!.getAttribute('data-edge')).toBe('bottom');
    expect(t.host.innerHTML).not.toContain('달빛');
    // 소리 물결 표시를 끄면 조각의 표식도 함께 사라진다
    act(() => t.ctx.settings.update((s) => ({ ...s, soundRipples: false })));
    expect(qa(t.host, '[data-ripple]')).toEqual([]);
  });

  it('겹침 화면(설정 같은 곳)이 열려 있는 동안에는 탐험 화면이 없으므로 그리지 않는다', async () => {
    const t = await bootApp('#/settings');
    expect(q(t.host, '[data-ripples]')).toBeNull();
  });

  it('물결 겹침은 탐험 화면의 맨 끝에 있어 다른 겹침 위에 그려진다', async () => {
    const t = await bootApp('');
    standAtH4(t);
    const hud = q(t.host, '.hud')!;
    const layer = q(hud, '.hud-ripples')!;
    const kids = [...hud.children];
    const next = kids[kids.indexOf(layer) + 1];
    // 뒤에 오는 것은 불러오는 중, 오류 안내 정도다(눌림을 받는 메뉴나 칩이 아니다)
    expect(next === undefined || next.classList.contains('hud-loading') || next.classList.contains('hud-error')).toBe(true);
  });
});
