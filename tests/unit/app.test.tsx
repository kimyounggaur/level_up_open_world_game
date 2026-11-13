// @vitest-environment jsdom
// 2-8과 2단계 앱 조립: 주소로 패널 열기, 목록(#/list), 없는 주소의 이유와 목록, 채널별 표지, 초안 보관, 소리는 저절로 나지 않는다.
// 첫 화면은 이제 월드이고(3단계), 월드 쪽 조립은 app-world.test.tsx가 맡는다.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import type { RouterWindow } from '@/platform/router';
import { Q01, Q02, Q07, Q08, UNBUILT_PANEL, button, click, mount, q, qa, quest, screenless, setupDom, text } from './ui-rig';
import { FakeEngine } from './audio-fakes';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
let ctxNow: AppContext | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
  ctxNow?.dispose();
  ctxNow = null;
  vi.useRealTimers();
});

function fakeWindow(hash: string) {
  const listeners = new Set<() => void>();
  const win: RouterWindow & { go: (next: string) => void } = {
    location: { hash },
    addEventListener: (_type, l) => void listeners.add(l),
    removeEventListener: (_type, l) => void listeners.delete(l),
    go(next) {
      act(() => {
        win.location.hash = next;
        for (const l of [...listeners]) l();
      });
    },
  };
  return win;
}

function boot(hash: string, channel: 'preview' | 'release' = 'preview', definitions = [quest(Q01), quest(Q02), quest(Q07)]) {
  const engine = new FakeEngine();
  const ctx = createAppContext({ channel, definitions, createEngine: () => engine, makeId: () => 'att', nowIso: () => '2026-11-10T00:00:00.000Z' });
  ctxNow = ctx;
  const win = fakeWindow(hash);
  const m = mount(h(App, { ctx, win }));
  current = m;
  return { ctx, win, engine, host: m.host };
}

describe('2-8 완료 기준: 새 저장에서 주소로 Q02가 열린다', () => {
  it('#/q/rhythm.rest-in-a-bar/quarter-rest → 리듬 패널', () => {
    const { host, ctx, engine } = boot('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(text(q(host, 'h1'))).toBe('쉼이 있는 한 마디');
    expect(qa(host, 'button.cell-mine')).toHaveLength(4);
    expect(ctx.controller.current?.entry.questId).toBe(Q02);
    expect(ctx.controller.current?.variant.variantId).toBe('quarter-rest');
    // 새 저장: 초안도 기록도 없다. 열기는 진행을 보지 않는다
    expect(ctx.session.draftKeys()).toEqual([]);
    expect(ctx.controller.attempts).toHaveLength(0);
    // W-11: 열었다고 소리가 나지 않는다
    expect(engine.startCalls).toBe(0);
    expect(ctx.mixer.snapshot().state).toBe('off');
  });

  it('#/q/pitch.same-note-two-clefs/middle-c → 음자리표 패널', () => {
    const { host } = boot('#/q/pitch.same-note-two-clefs/middle-c');
    expect(text(q(host, 'h1'))).toBe('같은 음의 자리 찾기');
    expect(qa(host, '.staff-surface')).toHaveLength(2);
  });

  it('판본을 생략하면 첫 판본으로 연다', () => {
    const { host, ctx } = boot('#/q/rhythm.rest-in-a-bar');
    expect(text(q(host, 'h1'))).toBe('쉼이 있는 한 마디');
    expect(ctx.controller.current?.variant.variantId).toBe('quarter-rest');
  });

  it('#/q/scale.major/c-major → 음계 패널: 디딤돌 자리 여덟 개와 같은 초안을 쓰는 놓기 작업대', () => {
    const { host, ctx, engine } = boot('#/q/scale.major/c-major');
    expect(text(q(host, 'h1'))).toBe('장음계 배열하기');
    expect(q(host, '[data-panel-not-ready]')).toBeNull();
    expect(qa(host, 'button.cell-mine')).toHaveLength(8);
    expect(ctx.controller.current?.variant.variantId).toBe('c-major');
    expect(ctx.bench.available).toBe(true);
    expect(ctx.session.draftKeys()).toEqual([]);
    expect(engine.startCalls).toBe(0); // W-11
  });

  it('화면이 아직 없는 과제도 주소는 올바르다고 알리고, 열린 척하지 않는다', () => {
    const { host } = boot('#/q/scale.major/c-major', 'preview', [quest(Q01), quest(Q02), screenless(quest(Q07))]);
    expect(text(q(host, 'h1'))).toBe('장음계 배열하기');
    const note = q(host, '[data-panel-not-ready]')!;
    expect(note.getAttribute('data-panel-not-ready')).toBe(UNBUILT_PANEL);
    expect(text(note)).toContain('아직 만들고 있어요');
  });
});

describe('열 수 없는 주소는 이유와 전체 목록을 보여 준다(7.7)', () => {
  it('없는 과제 id', () => {
    const { host } = boot('#/q/no.such.quest/v1');
    expect(text(q(host, '[role="alert"]'))).toContain("'no.such.quest' 과제를 찾지 못했어요");
    expect(qa(host, '.quest-card')).toHaveLength(3);
  });

  it('없는 판본 id: 있는 판본을 알려 준다', () => {
    const { host } = boot('#/q/scale.major/e-major');
    const msg = text(q(host, '[role="alert"]'));
    expect(msg).toContain("'e-major' 판본이 없어요");
    expect(msg).toContain('c-major, f-major, g-major, d-major, bflat-major');
    expect(qa(host, '.quest-card')).toHaveLength(3);
  });

  it('형식이 틀린 주소와 모르는 주소', () => {
    const a = boot('#/q');
    expect(text(q(a.host, '[role="alert"]'))).toContain('주소 형식이 올바르지 않아요');
    a.win.go('#/whatever');
    expect(text(q(a.host, '[role="alert"]'))).toContain('알 수 없는 주소예요');
    expect(qa(a.host, '.quest-card')).toHaveLength(3);
  });
});

describe('자유 가락 주소(4.9, 5-6): #/q/free.<무대 설치물>/play', () => {
  const FREE_HASH = '#/q/free.inst.village.ensemble-stage/play';
  const withQ08 = [quest(Q01), quest(Q02), quest(Q07), quest(Q08)];

  it('곡 패널이 자유 가락으로 열린다: 목표 없이 내 가락을 만들고, 저장 칸과 재료함이 있다', () => {
    const { host, ctx } = boot(FREE_HASH, 'preview', withQ08);
    expect(text(q(host, 'h1'))).toBe('자유 가락');
    expect(ctx.controller.current?.free).toBe(true);
    expect(ctx.controller.current?.entry.questId).toBe('free.inst.village.ensemble-stage');
    expect(ctx.controller.current?.variant.variantId).toBe('play');
    expect(q(host, '.trow-target')).toBeNull();
    expect(q(host, '[data-melody-save]')).not.toBeNull();
    expect(q(host, '[data-melody-pieces]')).not.toBeNull();
    // 자유 가락은 과제가 아니므로 '열어 본 과제'에 적히지 않는다
    expect(ctx.opened.has(Q08)).toBe(false);
  });

  it('음을 놓고 저장하면 앱의 저장한 곡 목록에 쌓인다', () => {
    const { host, ctx } = boot(FREE_HASH, 'preview', withQ08);
    click(q(host, 'button.material[data-kind="note"]'));
    click(q(host, 'button.material[data-value="quarter"]'));
    click(q(host, 'button.material[data-pitch="E4"]'));
    click(q(host, '.trow-mine button.tblock-face[data-start="0"]'));
    expect(ctx.controller.content().events).toHaveLength(1);
    const input = q<HTMLInputElement>(host, '.melody-name-input')!;
    act(() => {
      input.value = '길 위의 노래';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(q(host, '[data-melody-save-button]'));
    expect(ctx.creations.list().map((c) => [c.name, c.installationId])).toEqual([['길 위의 노래', 'inst.village.ensemble-stage']]);
  });

  it('주소를 떠나면 닫히고 초안은 남는다. 다시 오면 놓은 음이 그대로다', () => {
    const { host, win, ctx } = boot(FREE_HASH, 'preview', withQ08);
    click(q(host, 'button.material[data-kind="note"]'));
    click(q(host, 'button.material[data-value="quarter"]'));
    click(q(host, 'button.material[data-pitch="G4"]'));
    click(q(host, '.trow-mine button.tblock-face[data-start="0"]'));
    win.go('#/list');
    expect(ctx.controller.current).toBeNull();
    expect(ctx.session.draftKeys()).toEqual(['free.inst.village.ensemble-stage/play']);
    win.go(FREE_HASH);
    expect(ctx.controller.current?.free).toBe(true);
    expect(ctx.controller.content().events).toHaveLength(1);
    expect(text(q(host, '.trow-mine button.tblock-face[data-start="0"]'))).toContain('G4');
  });

  it('틀로 삼을 과제(Q08)가 없는 판에서는 열지 않고 전체 목록과 이유를 보여 준다', () => {
    const { host, ctx } = boot(FREE_HASH);
    expect(ctx.controller.current).toBeNull();
    expect(text(q(host, '[role="alert"]'))).toContain('과제를 찾지 못했어요');
    expect(qa(host, '.quest-card')).toHaveLength(3);
  });

  it('돌 설치물의 자유로 놀기 주소는 패널이 없는 주소다(이 길은 합주 무대만 쓴다)', () => {
    const { host, ctx } = boot('#/q/free.inst.village.scale-stones/play', 'preview', withQ08);
    expect(ctx.controller.current).toBeNull();
    expect(text(q(host, '[role="alert"]'))).toContain('과제를 찾지 못했어요');
  });

  it('없는 설치물이나 다른 판본 이름이면 알 수 없는 과제로 다룬다', () => {
    const a = boot('#/q/free.inst.nowhere/play', 'preview', withQ08);
    expect(a.ctx.controller.current).toBeNull();
    expect(text(q(a.host, '[role="alert"]'))).toContain('과제를 찾지 못했어요');
    a.win.go('#/q/free.inst.village.ensemble-stage/other');
    expect(a.ctx.controller.current).toBeNull();
  });
});

describe('목록과 채널(W-10)', () => {
  it('미리보기 채널: 검수 전 표지가 붙고 열 수 있다. 세 과제 모두 화면이 있다', () => {
    const { host } = boot('#/list');
    expect(text(q(host, 'h1'))).toBe('전체 도전');
    const cards = qa(host, '.quest-card');
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.getAttribute('data-quest'))).toEqual([Q01, Q02, Q07]);
    for (const c of cards) expect(text(c.querySelector('.chip-state'))).toBe('검수 전');
    const q02 = q(host, `.quest-card[data-quest="${Q02}"]`)!;
    const open = q<HTMLAnchorElement>(q02, 'a.btn')!;
    expect(open.getAttribute('href')).toBe('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(open.getAttribute('aria-label')).toBe('쉼이 있는 한 마디 · 4분쉼표가 있는 4/4 열기');
    // 음계 과제: 다섯 판본이 모두 패널로 열린다(W-2)
    const q07 = q(host, `.quest-card[data-quest="${Q07}"]`)!;
    expect(qa<HTMLAnchorElement>(q07, 'a.btn').map((a) => a.getAttribute('href'))).toEqual(['c-major', 'f-major', 'g-major', 'd-major', 'bflat-major'].map((v) => `#/q/scale.major/${v}`));
    expect(qa(q07, '.variant-preparing')).toHaveLength(0);
    expect(text(q(host, '.review-note'))).toContain('검수 전');
  });

  it('화면이 없는 판본은 화면 준비 중이라고 말하고 열기를 두지 않는다', () => {
    const { host } = boot('#/list', 'preview', [quest(Q01), quest(Q02), screenless(quest(Q07))]);
    const q07 = q(host, `.quest-card[data-quest="${Q07}"]`)!;
    expect(qa(q07, 'a.btn')).toHaveLength(0);
    expect(qa(q07, '.variant-preparing').map((e) => text(e))).toEqual(Array(5).fill('화면 준비 중'));
  });

  it('과제 카드는 성부 수, 가장 짧은 음가, 조작 방식을 적고 난도 숫자는 적지 않는다', () => {
    const { host } = boot('#/list');
    const row = q(host, `.quest-card[data-quest="${Q02}"] .variant-row`)!;
    expect(text(row)).toContain('성부 1개 · 가장 짧은 음가 4분음표 · 조작 놓기');
    expect(text(row)).toContain('음역 C4-E4');
    expect(text(q(host, 'main'))).not.toMatch(/난도|레벨 \d|★/);
  });

  it('주제로 거르고, 거르기를 풀면 전부 다시 보인다(숨은 제한 없음)', () => {
    const { host } = boot('#/list');
    click(button(host, '리듬'));
    expect(qa(host, '.quest-card').map((c) => c.getAttribute('data-quest'))).toEqual([Q02]);
    expect(text(q(host, '[role="status"]'))).toContain('1개 도전');
    click(button(host, '리듬'));
    expect(qa(host, '.quest-card')).toHaveLength(3);
    click(button(host, '음계'));
    click(button(host, '전체'));
    expect(qa(host, '.quest-card')).toHaveLength(3);
  });

  it('배포 채널(release): 검수 전 콘텐츠는 준비 중이고 직접 주소로도 열리지 않는다. 자물쇠는 쓰지 않는다', () => {
    const { host } = boot('#/list', 'release');
    for (const c of qa(host, '.quest-card')) {
      expect(text(c.querySelector('.chip-state'))).toBe('준비 중');
      expect(qa(c, 'a.btn')).toHaveLength(0);
    }
    expect(host.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨/);
    const direct = boot('#/q/rhythm.rest-in-a-bar/quarter-rest', 'release');
    expect(text(q(direct.host, '[role="alert"]'))).toContain('준비 중이에요');
    expect(qa(direct.host, '.quest-card')).toHaveLength(3);
  });
});

describe('이동: 목록과 과제 사이, 초안 보관, 소리', () => {
  it('목록에서 열고, 돌아갔다 다시 열어도 놓은 것이 그대로다', () => {
    const { host, win, ctx } = boot('#/list');
    click(q(host, `.quest-card[data-quest="${Q02}"] a.btn`));
    // a 링크의 실제 이동은 브라우저가 하므로 같은 주소로 직접 이동시킨다
    win.go('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(text(q(host, 'h1'))).toBe('쉼이 있는 한 마디');
    click(button(host, 'C4'));
    click(qa(host, 'button.cell-mine')[0]!);
    expect(text(qa(host, 'button.cell-mine')[0]!)).toContain('C4');
    win.go('#/list');
    expect(text(q(host, 'h1'))).toBe('전체 도전');
    expect(ctx.controller.current).toBeNull();
    expect(ctx.session.draftKeys()).toEqual([`${Q02}/quarter-rest`]);
    win.go('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(text(qa(host, 'button.cell-mine')[0]!)).toContain('C4');
  });

  it('다른 과제로 옮기면 재생을 멈춘다', () => {
    const { host, win, ctx } = boot('#/q/rhythm.rest-in-a-bar/quarter-rest');
    click(button(host, 'C4'));
    click(qa(host, 'button.cell-mine')[0]!);
    click(button(host, '내 배치 듣기'));
    expect(ctx.controller.playing).toBe('mine');
    win.go('#/q/pitch.same-note-two-clefs/middle-c');
    expect(ctx.controller.playing).toBeNull();
    expect(text(q(host, 'h1'))).toBe('같은 음의 자리 찾기');
  });

  it('화면이 가려지면 소리를 멈춘다', () => {
    const { host, ctx } = boot('#/q/rhythm.rest-in-a-bar/quarter-rest');
    click(button(host, 'C4'));
    click(qa(host, 'button.cell-mine')[0]!);
    click(button(host, '내 배치 듣기'));
    expect(ctx.controller.playing).toBe('mine');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(ctx.controller.playing).toBeNull();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('소리 켜기를 눌러야 소리 장치가 시작된다', async () => {
    const { host, engine, ctx } = boot('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(engine.startCalls).toBe(0);
    await act(async () => {
      click(button(host, '소리 켜기'));
    });
    expect(engine.startCalls).toBe(1);
    expect(ctx.mixer.snapshot().state).toBe('on');
    expect(text(q(host, '.sound-status'))).toBe('소리가 켜져 있어요');
  });
});

describe('소리 점검(개발용)', () => {
  it('미리보기 채널에서만 열린다', () => {
    const a = boot('#/dev/sound-check');
    expect(text(q(a.host, 'h1'))).toBe('소리 점검');
    const b = boot('#/dev/sound-check', 'release');
    expect(text(q(b.host, '[role="alert"]'))).toContain('열 수 없어요');
  });

  it('차례로 듣기는 C2부터 C6까지 열세 음을 차례로 낸다', async () => {
    vi.useFakeTimers();
    const { host, ctx, engine } = boot('#/dev/sound-check');
    await act(async () => {
      await ctx.mixer.enable();
    });
    expect(ctx.mixer.snapshot().state).toBe('on');
    click(button(host, '차례로 듣기'));
    for (let i = 0; i < 13; i++) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
    }
    const played = engine.sinks.get('task')!.requests.filter((r) => r.id.startsWith('note-')).map((r) => r.midi);
    expect(played).toEqual([36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84]);
  });
});
