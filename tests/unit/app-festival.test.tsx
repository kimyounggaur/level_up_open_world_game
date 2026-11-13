// @vitest-environment jsdom
// 6.4 잔치 열기의 화면(7.5 '잔치' 상태): 합주 무대의 표지판 → 잔치 카드 → 건너뛰기 / 끝남 / 내 곡 이어 듣기 / 마을을 떠나면 중단.
// 월드(Phaser)는 가짜이고, 세계 시계와 타이머는 시험이 쥔다. 진짜 월드에서 악사가 서는지는 tests/flow/festival.flow.ts가 본다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { creationsPlayback } from '@/domain/creation';
import { FESTIVAL_END_TEXT, FESTIVAL_SECONDS, FESTIVAL_SILENT_TEXT, FESTIVAL_SONGS_TEXT, FESTIVAL_START_TEXT, FESTIVAL_TITLE, festivalAskText, musiciansText } from '@/domain/festival';
import { NO_FESTIVAL } from '@/platform/bridge';
import { bootApp, cleanupApps } from './app-rig';
import { FakeClock, FakeTimer } from './audio-fakes';
import { songsOf } from './controller-rig';
import { Q01, Q02, Q07, click, q, qa, quest, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

const Q08 = 'song.short-piece';
const DEFS = [quest(Q01), quest(Q02), quest(Q07), quest(Q08)];
const T0 = 5000;

const pass = (questId: string): AttemptResult =>
  makeAttemptResult({
    attemptId: `a-${questId}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);

/** 여섯 지역(마을과 마을 밖 다섯)의 층이 모두 1 이상이 되는 다섯 과제: 오선 언덕(N3), 박자 강가(E1), 종나무 숲(W1), 음계 길(S1), 건반 늪(K1) */
const FIVE_QUESTS = ['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar', 'chord.major-triad', 'scale.major', 'pitch.same-sound-different-names'];

async function boot(over: { songs?: number; layer?: boolean; all?: boolean; stage?: boolean } = {}) {
  const mono = new FakeClock(T0);
  const timer = new FakeTimer();
  const t = await bootApp('', {
    definitions: DEFS,
    creations: songsOf(over.songs ?? 0),
    ...(over.all ? { attempts: FIVE_QUESTS.map(pass) } : over.layer ? { attempts: [pass(Q01)] } : {}),
    clock: { now: () => mono.now(), timer },
  });
  if (over.stage !== false) t.send('H5');
  /** 세계 시계를 sec초 흘리면서 타이머를 깨운다 */
  const run = (sec: number): void => {
    act(() => {
      const end = mono.t + sec;
      while (mono.t < end - 1e-9) {
        mono.t = Math.min(end, mono.t + 0.1);
        timer.fire();
      }
    });
  };
  const openFestival = (): void => {
    click(q(t.host, '[data-sign-toggle]'));
    click(q(t.host, '[data-sign="festival"]'));
  };
  const card = (): HTMLElement | null => q(t.host, '[data-festival-shell]');
  const phase = (): string | null => q(t.host, '[data-festival]')?.getAttribute('data-festival') ?? null;
  const news = (): string[] => qa(t.host, '[data-news] p').map((p) => text(p));
  return { ...t, mono, timer, run, openFestival, card, phase, news };
}

describe('열기', () => {
  it('무대에 들어가 표지판에서 "잔치 열기"를 고르면 잔치 카드가 아래에 뜨고, 합주 중이라고 알린다', async () => {
    const t = await boot();
    expect(t.card()).toBeNull();
    t.openFestival();
    expect(t.card()).not.toBeNull();
    expect(t.phase()).toBe('playing');
    expect(text(q(t.host, '.festival-title'))).toBe(FESTIVAL_TITLE);
    expect(text(q(t.host, '[data-festival-text]'))).toBe(FESTIVAL_START_TEXT);
    expect(q(t.host, '[data-festival-skip]')).not.toBeNull();
  });

  it('열려 있는 동안 월드는 멈추고, 마을 화면과 무대 작업대는 눌리지 않는다(inert)', async () => {
    const t = await boot();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    t.openFestival();
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(true);
    expect(q(t.host, '[data-installation-hud]')!.closest('[inert]')).not.toBeNull();
    // 카드는 눌린다(inert 밖이다)
    expect(q(t.host, '[data-festival-shell]')!.closest('[inert]')).toBeNull();
  });

  it('카드는 대화상자로 이름과 설명을 달고, 주 단추(건너뛰기)로 초점이 간다', async () => {
    const t = await boot();
    t.openFestival();
    const dialog = q(t.host, '.festival-card')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe(FESTIVAL_TITLE);
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe(FESTIVAL_START_TEXT);
    expect(document.activeElement).toBe(q(t.host, '[data-festival-skip]'));
  });

  it('층이 0이어도 열린다: 맥박만 있는 북 악사가 선다고 글로 알린다', async () => {
    const t = await boot();
    t.openFestival();
    expect(t.ctx.world.bridge.festival.get()).toEqual({ active: true, musicians: ['pulse'] });
    expect(text(q(t.host, '[data-festival-musicians]'))).toBe(musiciansText(['pulse']));
  });

  it('마을 층이 있으면 화음 악사도 선다(Q01은 마을과 오선 언덕에 모두 놓여 가락 악사도 선다)', async () => {
    const t = await boot({ layer: true });
    t.openFestival();
    expect(t.ctx.world.bridge.festival.get()).toEqual({ active: true, musicians: ['pulse', 'bed', 'melody'] });
    expect(text(q(t.host, '[data-festival-musicians]'))).toBe(musiciansText(['pulse', 'bed', 'melody']));
  });

  it('여섯 지역의 층이 모두 있으면 악사 일곱이 서고, 잔치 카드가 일곱 악사의 이름을 글로 알린다(7-5)', async () => {
    const t = await boot({ all: true });
    t.openFestival();
    const all = ['pulse', 'percussion', 'bass', 'bed', 'melody', 'runner', 'ornament'] as const;
    expect(t.ctx.world.bridge.festival.get()).toEqual({ active: true, musicians: [...all] });
    expect(text(q(t.host, '[data-festival-musicians]'))).toBe(musiciansText(all));
    expect(text(q(t.host, '[data-festival-musicians]'))).toBe('북 악사, 타악 악사, 베이스 악사, 화음 악사, 가락 악사, 달리는 음 악사와 꾸밈음 악사가 무대에 서 있어요.');
  });

  it('소리를 켜지 않았으면 조용히 흐른다는 말과 소리 켜기 단추가 함께 있다', async () => {
    const t = await boot();
    t.openFestival();
    const silent = q(t.host, '[data-festival-silent]')!;
    expect(text(q(silent, '.festival-silent'))).toBe(FESTIVAL_SILENT_TEXT);
    expect(q(silent, '.sound-control button')).not.toBeNull();
    // 월드 소리의 잔치 구간은 이미 정해져 있다(소리를 켜면 그 구간이 들린다)
    expect(t.ctx.festival.run()).not.toBeNull();
  });
});

describe('건너뛰기', () => {
  it('건너뛰기를 누르면 카드가 닫히고 악사가 내려오며 월드가 다시 움직인다. 저장한 곡이 있어도 묻지 않는다', async () => {
    const t = await boot({ songs: 2 });
    t.openFestival();
    click(q(t.host, '[data-festival-skip]'));
    expect(t.card()).toBeNull();
    expect(t.ctx.festival.phase).toBe('idle');
    expect(t.ctx.world.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(false);
  });

  it('Esc도 건너뛰기와 같다', async () => {
    const t = await boot({ songs: 1 });
    t.openFestival();
    t.press('Escape');
    expect(t.card()).toBeNull();
    expect(t.ctx.festival.phase).toBe('idle');
  });

  it('이동 키는 아무 일도 하지 않는다: 월드에 이동 명령이 가지 않고 잔치도 그대로다', async () => {
    const t = await boot();
    t.openFestival();
    const before = t.commands.length;
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) t.press(code);
    expect(t.commands.length).toBe(before);
    expect(t.phase()).toBe('playing');
  });

  it('건너뛴 뒤에 다시 열 수 있다(몇 번이든)', async () => {
    const t = await boot();
    for (let i = 0; i < 3; i++) {
      t.openFestival();
      expect(t.phase()).toBe('playing');
      click(q(t.host, '[data-festival-skip]'));
      expect(t.card()).toBeNull();
    }
  });
});

describe('끝남', () => {
  it('저장한 곡이 없으면 48초 뒤에 카드가 닫히고 "잔치가 끝났어요."를 알린다', async () => {
    const t = await boot({ songs: 0 });
    t.openFestival();
    t.run(FESTIVAL_SECONDS - 6);
    expect(t.phase()).toBe('playing');
    t.run(12);
    expect(t.card()).toBeNull();
    expect(t.news()).toContain(FESTIVAL_END_TEXT);
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(t.ctx.world.bridge.festival.get()).toBe(NO_FESTIVAL);
  });

  it('저장한 곡이 있으면 곡 수와 함께 내 곡을 이어서 들을지 묻는다', async () => {
    const t = await boot({ songs: 3 });
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    expect(t.phase()).toBe('asking');
    expect(text(q(t.host, '[data-festival-text]'))).toBe(festivalAskText(3));
    expect(q(t.host, '[data-festival-listen]')).not.toBeNull();
    expect(q(t.host, '[data-festival-close]')).not.toBeNull();
    expect(q(t.host, '[data-festival-skip]')).toBeNull();
    // 묻는 동안에도 월드는 멈춰 있고 초점은 주 단추에 있다
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    expect(document.activeElement).toBe(q(t.host, '[data-festival-listen]'));
  });

  it('"닫기"는 재생 없이 닫는다. Esc도 같다', async () => {
    const t = await boot({ songs: 2 });
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    click(q(t.host, '[data-festival-close]'));
    expect(t.card()).toBeNull();
    expect(t.ctx.controller.previewing).toBe(false);
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    expect(t.phase()).toBe('asking');
    t.press('Escape');
    expect(t.card()).toBeNull();
    expect(t.ctx.controller.previewing).toBe(false);
  });

  it('"내 곡 듣기"는 저장한 곡을 곡 사이 한 마디 쉼으로 이어서 들려 준다', async () => {
    const t = await boot({ songs: 2 });
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    click(q(t.host, '[data-festival-listen]'));
    expect(t.phase()).toBe('songs');
    expect(text(q(t.host, '[data-festival-text]'))).toBe(FESTIVAL_SONGS_TEXT);
    expect(t.ctx.controller.previewing).toBe(true);
    expect(q(t.host, '[data-festival-stop]')).not.toBeNull();
    expect(document.activeElement).toBe(q(t.host, '[data-festival-stop]'));
    expect(creationsPlayback(t.ctx.creations.list()).notes.length).toBeGreaterThan(0);
  });

  it('내 곡을 듣는 중에 "멈추기"나 Esc를 누르면 재생이 멈추고 카드가 닫힌다', async () => {
    const t = await boot({ songs: 2 });
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    click(q(t.host, '[data-festival-listen]'));
    click(q(t.host, '[data-festival-stop]'));
    expect(t.card()).toBeNull();
    expect(t.ctx.controller.previewing).toBe(false);
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    click(q(t.host, '[data-festival-listen]'));
    expect(t.ctx.controller.previewing).toBe(true);
    t.press('Escape');
    expect(t.card()).toBeNull();
    expect(t.ctx.controller.previewing).toBe(false);
  });
});

describe('마을을 떠나면 잔치가 끝난다', () => {
  it('합주 중에 지도(M)로 가면 중단된다: 악사가 내려오고 묻지 않는다', async () => {
    const t = await boot({ songs: 2 });
    t.openFestival();
    t.press('KeyM');
    expect(t.ctx.festival.phase).toBe('idle');
    expect(t.ctx.world.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.card()).toBeNull();
  });

  it('내 곡을 듣는 중에 목록(L)으로 가면 재생이 멈춘다', async () => {
    const t = await boot({ songs: 2 });
    t.openFestival();
    t.run(FESTIVAL_SECONDS + 6);
    click(q(t.host, '[data-festival-listen]'));
    expect(t.ctx.controller.previewing).toBe(true);
    t.press('KeyL');
    expect(t.ctx.festival.phase).toBe('idle');
    expect(t.ctx.controller.previewing).toBe(false);
  });

  it('돌아와도 잔치는 다시 열려 있지 않다', async () => {
    const t = await boot();
    t.openFestival();
    t.press('KeyM');
    act(() => {
      t.win.location.hash = '#/';
    });
    expect(t.ctx.festival.phase).toBe('idle');
    expect(t.card()).toBeNull();
  });
});

describe('무대 밖에서는 열리지 않는다', () => {
  it('무대에 들어가지 않으면 잔치 카드는 없다', async () => {
    const t = await boot({ stage: false });
    expect(t.card()).toBeNull();
    expect(t.ctx.festival.phase).toBe('idle');
  });
});
