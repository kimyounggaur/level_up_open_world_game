// @vitest-environment jsdom
// 3단계 앱 조립: 첫 화면은 월드, 월드가 연 정거장은 패널 또는 정거장 안내로, 겹침 화면이 열리면 월드는 멈추고,
// 주소로 패널을 바로 여는 길은 월드를 기다리지 않는다(W-2). 월드는 가짜로 대신하고, 진짜 월드는 tests/flow/world.flow.ts가 확인한다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { appCleanups, bootApp, cleanupApps, flush } from './app-rig';
import { Q01, Q02, Q07, button, click, q, qa, quest, screenless, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());

afterEach(() => cleanupApps());

const boot = bootApp;
const cleanup = appCleanups;

describe('3-1 첫 화면은 월드다', () => {
  it('빈 주소는 탐험 화면이다: 지역 이름과 메뉴가 있고 목록 카드는 없다. 월드를 켠다', async () => {
    const t = await boot('');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(qa(t.host, '.quest-card')).toHaveLength(0);
    expect(text(q(t.host, '.hud-region-name'))).toBe('음악 마을');
    for (const label of ['지도', '목록', '소리 켜기', '도움', '설정']) expect(button(t.host, label)).toBeTruthy();
    expect(t.starts).toHaveLength(1);
    expect(t.starts[0]!.parent).toBe(t.parent);
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it('#/와 #도 탐험 화면이다', async () => {
    for (const hash of ['#/', '#']) {
      const t = await boot(hash);
      expect(q(t.host, '.hud')).not.toBeNull();
      cleanup.pop()!();
    }
  });

  it('월드가 준비되기 전에는 불러오는 중이라고 알린다. 준비되면 사라진다', async () => {
    const t = await boot('');
    expect(text(q(t.host, '.hud-loading'))).toBe('마을을 불러오는 중이에요…');
    act(() => t.ctx.world.bridge.patchStatus({ ready: true }));
    expect(q(t.host, '.hud-loading')).toBeNull();
  });

  it('월드를 불러오지 못하면 목록과 주소로는 모두 열린다고 알리고 목록으로 가는 길을 둔다(W-2)', async () => {
    const t = await boot('');
    act(() => t.ctx.world.bridge.patchStatus({ error: '덩어리를 불러오지 못했어요' }));
    const err = q(t.host, '.hud-error')!;
    expect(text(err)).toContain('마을을 그리지 못했어요');
    expect(text(err)).toContain('목록이나 주소로는 모든 도전을 그대로 열 수 있어요');
    click(button(err, '목록 열기'));
    expect(t.win.location.hash).toBe('#/list');
    expect(qa(t.host, '.quest-card')).toHaveLength(3);
  });
});

describe('안내 칩과 상호작용(7.4)', () => {
  it('가까운 정거장의 이름과 \'E 또는 누르기\'를 보이고, 누르면 상호작용 명령을 보낸다', async () => {
    const t = await boot('');
    expect(q(t.host, '.hud-chip')).toBeNull();
    act(() => t.ctx.world.bridge.patchStatus({ ready: true, near: { stationId: 'H1', name: '음자리 작업대' } }));
    expect(text(q(t.host, '.hud-chip'))).toBe('음자리 작업대 · E 또는 누르기');
    click(q(t.host, '.hud-chip'));
    expect(t.commands).toEqual([{ type: 'interact' }]);
    act(() => t.ctx.world.bridge.patchStatus({ near: null }));
    expect(q(t.host, '.hud-chip')).toBeNull();
  });

  it('키보드가 없는 터치 화면에서는 \'누르기\'만 쓴다', async () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: query.includes('coarse'), addEventListener: () => undefined, removeEventListener: () => undefined });
    const t = await boot('');
    act(() => t.ctx.world.bridge.patchStatus({ ready: true, near: { stationId: 'H1', name: '음자리 작업대' } }));
    expect(text(q(t.host, '.hud-chip'))).toBe('음자리 작업대 · 누르기');
  });

  it('세로 화면용 상호작용 단추는 정거장 곁에서만 있고 이름을 달고 있다', async () => {
    const t = await boot('');
    expect(q(t.host, '.hud-interact')).toBeNull();
    act(() => t.ctx.world.bridge.patchStatus({ ready: true, near: { stationId: 'H4', name: '음계 디딤돌' } }));
    const btn = q(t.host, '.hud-interact')!;
    expect(btn.getAttribute('aria-label')).toBe('음계 디딤돌 열기');
    click(btn);
    expect(t.commands).toEqual([{ type: 'interact' }]);
  });

  it('발견 표식과 게시판 곁의 단추는 \'살피기\'이고, 낭독기 이름이 화면의 글을 품는다(음성으로 누를 수 있게, 7.9 8번)', async () => {
    const t = await boot('');
    act(() => t.ctx.world.bridge.patchStatus({ ready: true, near: { stationId: 'board.plaza', name: '광장 게시판', spot: 'board' } }));
    const btn = q(t.host, '.hud-interact')!;
    expect(text(btn)).toBe('살피기');
    expect(btn.getAttribute('aria-label')).toBe('광장 게시판 살피기');
    expect(btn.getAttribute('aria-label')).toContain(text(btn));
  });
});

describe('월드가 정거장을 열면(3-4, 3-6)', () => {
  it('작업대 H1은 Q01 패널로, H2는 Q02 패널로 바로 간다. 월드는 멈춘다', async () => {
    const t = await boot('');
    t.send('H1');
    expect(t.win.location.hash).toBe('#/q/pitch.same-note-two-clefs/middle-c');
    expect(text(q(t.host, 'h1'))).toBe('같은 음의 자리 찾기');
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    expect(t.ctx.controller.current?.entry.questId).toBe(Q01);
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(t.ctx.controller.current).toBeNull();
    t.send('H2');
    expect(t.win.location.hash).toBe('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(text(q(t.host, 'h1'))).toBe('쉼이 있는 한 마디');
  });

  it('설치물 H4는 설치물 모드로 들어간다(4.2): 주소는 그대로, 월드는 계속 움직이고, 정거장 칩과 열기 단추는 숨는다', async () => {
    const t = await boot('');
    act(() => t.ctx.world.bridge.patchStatus({ ready: true, near: { stationId: 'H4', name: '음계 디딤돌' } }));
    expect(q(t.host, '.hud-chip')).not.toBeNull();
    expect(q(t.host, '[data-installation-hud]')).toBeNull();
    t.send('H4');
    expect(t.win.location.hash).toBe('');
    const hud = q(t.host, '[data-installation-hud]')!;
    expect(hud.getAttribute('data-installation-hud')).toBe('inst.village.scale-stones');
    expect(t.ctx.world.bridge.installationMode.get()).toEqual({ installationId: 'inst.village.scale-stones', stationId: 'H4' });
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(q(t.host, '.hud-chip')).toBeNull();
    expect(q(t.host, '.hud-interact')).toBeNull();
    // 처음에는 자유로 놀기다: 판정 없이 놓는 도전이 열려 있다
    expect(t.ctx.controller.current?.free).toBe(true);
    expect(text(q(hud, '[data-sign-toggle]'))).toContain('자유로 놀기');
    // Esc로 나온다: 도전은 닫히고 정거장 칩이 다시 보인다
    t.press('Escape');
    expect(q(t.host, '[data-installation-hud]')).toBeNull();
    expect(t.ctx.world.bridge.installationMode.get()).toBeNull();
    expect(t.ctx.controller.current).toBeNull();
    expect(q(t.host, '.hud-chip')).not.toBeNull();
  });

  it('설치물 H4의 정거장 안내는 주소로 직접 열 수 있다: 놓인 Q07은 패널로 열 수 있다(W-2)', async () => {
    const t = await boot('#/s/H4');
    const sheet = q(t.host, '[data-overlay="station-H4"]')!;
    expect(text(q(sheet, 'h1'))).toBe('음계 디딤돌');
    const rows = qa(sheet, '.station-quest');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute('data-quest')).toBe(Q07);
    expect(q(rows[0]!, 'a.btn')!.getAttribute('href')).toBe('#/q/scale.major/c-major');
    expect(sheet.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨/);
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
  });

  it('화면이 아직 없는 과제만 놓인 설치물의 안내는 준비 중이라고 말하고 열기를 두지 않는다', async () => {
    const t = await boot('#/s/H4', { definitions: [quest(Q01), quest(Q02), screenless(quest(Q07))] });
    const sheet = q(t.host, '[data-overlay="station-H4"]')!;
    const rows = qa(sheet, '.station-quest');
    expect(rows).toHaveLength(1);
    expect(text(rows[0]!)).toContain('화면을 만드는 중이에요');
    expect(qa(sheet, 'a.btn')).toHaveLength(0);
    expect(sheet.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨/);
  });

  it('화면이 아직 없는 과제를 설치물에서 골라도 풀 수 있고, \'패널로 보기\'는 준비 중이라고만 알린다', async () => {
    const t = await boot('', { definitions: [quest(Q01), quest(Q02), screenless(quest(Q07))] });
    t.send('H4');
    click(q(t.host, '[data-sign-toggle]')!);
    click(q(t.host, `[data-sign="${Q07}/c-major"]`)!);
    expect(t.ctx.controller.current?.entry.questId).toBe(Q07);
    t.press('KeyV');
    expect(t.win.location.hash).toBe('');
    expect(text(q(t.host, '[data-live]'))).toContain('패널 화면을 만드는 중이에요');
    expect(q(t.host, '[data-installation-hud]')).not.toBeNull();
  });

  it('모르는 정거장 id의 사건은 무시한다', async () => {
    const t = await boot('');
    t.send('ZZ');
    expect(t.win.location.hash).toBe('');
    expect(q(t.host, '.hud')).not.toBeNull();
  });

  it('정거장 안내를 주소로 직접 열 수 있다: H1에는 열 수 있는 Q01과 준비 중인 Q04가 놓여 있다', async () => {
    const t = await boot('#/s/H1');
    const rows = qa(t.host, '.station-quest');
    expect(rows.map((r) => r.getAttribute('data-quest'))).toEqual([Q01, 'pitch.same-sound-different-names']);
    expect(q(rows[0]!, 'a.btn')!.getAttribute('href')).toBe('#/q/pitch.same-note-two-clefs/middle-c');
    expect(rows[1]!.classList.contains('is-preparing')).toBe(true);
    expect(text(rows[1]!)).toContain('준비 중');
    expect(t.starts).toHaveLength(1); // 안내 뒤에 월드가 있다
  });

  it('없는 정거장 주소는 이유와 지도로 가는 길을 보여 준다', async () => {
    const t = await boot('#/s/ZZ');
    expect(text(q(t.host, '[role="alert"]'))).toContain("'ZZ'라는 정거장은 없어요");
    expect(q<HTMLAnchorElement>(t.host, 'a.btn')!.getAttribute('href')).toBe('#/map');
  });
});

describe('7.5 화면 상태: 월드가 멈추고 움직이는 때', () => {
  it('목록·지도·설정·도움·정거장 안내·패널이 열려 있는 동안 월드는 멈춘다', async () => {
    const t = await boot('');
    const pause = t.ctx.world.bridge.pause;
    expect(pause.get()).toBe(false);
    for (const hash of ['#/list', '#/map', '#/settings', '#/help', '#/s/H4', '#/q/rhythm.rest-in-a-bar/quarter-rest']) {
      act(() => {
        t.win.location.hash = hash;
      });
      expect(pause.get(), hash).toBe(true);
      act(() => {
        t.win.location.hash = '#/';
      });
      expect(pause.get(), hash).toBe(false);
    }
  });

  it('L은 목록, M은 지도를 연다. 다시 누르거나 Esc를 누르면 월드로 돌아온다', async () => {
    const t = await boot('');
    t.press('KeyL');
    expect(t.win.location.hash).toBe('#/list');
    expect(qa(t.host, '.quest-card')).toHaveLength(3);
    t.press('KeyL');
    expect(q(t.host, '.hud')).not.toBeNull();
    t.press('KeyM');
    expect(t.win.location.hash).toBe('#/map');
    expect(q(t.host, '[data-overlay="map"]')).not.toBeNull();
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
  });

  it('탐험 화면에서 Esc는 아무 일도 하지 않는다', async () => {
    const t = await boot('');
    t.press('Escape');
    expect(t.win.location.hash).toBe('');
    expect(q(t.host, '.hud')).not.toBeNull();
  });

  it('과제 패널 안에서 L과 M은 글자 키 그대로 둔다', async () => {
    const t = await boot('#/q/rhythm.rest-in-a-bar/quarter-rest');
    t.press('KeyL');
    t.press('KeyM');
    expect(t.win.location.hash).toBe('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(text(q(t.host, 'h1'))).toBe('쉼이 있는 한 마디');
  });

  it('돌아가기 단추는 패널, 목록, 정거장 안내, 도움 어디에서나 월드로 돌아온다', async () => {
    for (const hash of ['#/q/rhythm.rest-in-a-bar/quarter-rest', '#/list', '#/s/H4', '#/help', '#/q/scale.major/c-major']) {
      const t = await boot(hash);
      click(button(t.host, '돌아가기'));
      expect(q(t.host, '.hud'), hash).not.toBeNull();
      cleanup.pop()!();
    }
  });

  it('HUD의 지도·목록·도움·설정 단추가 그 화면을 연다', async () => {
    for (const [label, hash] of [
      ['지도', '#/map'],
      ['목록', '#/list'],
      ['수첩', '#/notebook'],
      ['도움', '#/help'],
      ['설정', '#/settings'],
    ] as const) {
      const t = await boot('');
      click(qa<HTMLButtonElement>(q(t.host, '.hud-menu')!, 'button').find((b) => text(b).includes(label))!);
      expect(t.win.location.hash).toBe(hash);
      cleanup.pop()!();
    }
  });

  it('세로 화면 탭 막대: 시안 B03 그대로 지도·도전·최근 작업·도움(D-44)', async () => {
    const t = await boot('');
    const tabs = qa(q(t.host, '.hud-tabs')!, 'button');
    expect(tabs.map((b) => text(b))).toEqual(['지도', '도전', '최근 작업', '도움']);
    click(tabs[1]!);
    expect(t.win.location.hash).toBe('#/list');
    cleanup.pop()!();
    // '최근 작업'은 수첩이다. 눈에 보이는 글자가 이름에 들어 있다
    const u = await boot('');
    const notebookTab = qa<HTMLButtonElement>(q(u.host, '.hud-tabs')!, 'button')[2]!;
    expect(notebookTab.getAttribute('aria-label')).toContain('최근 작업');
    click(notebookTab);
    expect(u.win.location.hash).toBe('#/notebook');
  });
});

describe('W-2 주소로 패널을 바로 여는 길은 월드를 기다리지 않는다', () => {
  it('#/q/…, 개발 화면, 모르는 주소에서는 월드를 켜지 않고, 월드 화면으로 돌아가면 켠다', async () => {
    const t = await boot('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(text(q(t.host, 'h1'))).toBe('쉼이 있는 한 마디');
    expect(t.starts).toHaveLength(0);
    expect(t.ctx.world.running).toBe(false);
    t.press('Escape');
    await flush();
    expect(t.starts).toHaveLength(1);
    expect(q(t.host, '.hud')).not.toBeNull();

    const u = await boot('#/whatever');
    expect(u.starts).toHaveLength(0);
    const d = await boot('#/dev/sound-check');
    expect(d.starts).toHaveLength(0);
  });

  it('화면을 닫을 때 월드도 닫는다', async () => {
    const t = await boot('');
    expect(t.destroyed()).toBe(0);
    t.ctx.dispose();
    expect(t.destroyed()).toBe(1);
  });
});

describe('조작 안내(7.8)', () => {
  it('걷기·열기·지도·목록·닫기와 패널 안의 키를 모두 알려 주고, 끌기 없이도 된다고 말한다(W-4)', async () => {
    const t = await boot('#/help');
    const body = text(q(t.host, '.overlay-main'));
    expect(text(q(t.host, 'h1'))).toBe('조작 안내');
    for (const word of ['방향키', 'W A S D', 'E 또는 Enter', '지도', '목록', 'Esc', '끌지 않아도', 'Tab', 'Ctrl+Z', '소리 켜기']) expect(body, word).toContain(word);
  });

  it('설정으로 가는 링크가 있다: 휴대폰 세로 화면은 탭 막대에 설정이 없어서 도움에서도 닿아야 한다', async () => {
    const t = await boot('#/help');
    const link = q(t.host, '.overlay-main a[href="#/settings"]');
    expect(link).not.toBeNull();
    expect(text(link)).toBe('설정 열기');
  });
});
