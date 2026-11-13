// @vitest-environment jsdom
// 3단계 화면: 첫 안내 카드(1.6), 악보 지도(3.7, 7.7), 설정(7.8), 목록 거르기(7.7). 월드는 가짜로 대신한다.
// 지도에서 걸어가기와 바로 이동은 월드가 움직이기 시작할 때(겹침 화면이 닫힐 때) 명령으로 나간다.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/domain/save/settings';
import { PLAYER_START } from '@/domain/world';
import { cleanupApps, bootApp, flush } from './app-rig';
import { Q01, Q02, Q07, button, click, keydown, q, qa, quest, screenless, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

const touchOnly = (): void => {
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: query.includes('coarse'), addEventListener: () => undefined, removeEventListener: () => undefined });
};

describe('1.6 첫 안내 카드', () => {
  it('처음 마을을 열면 세 줄 안내와 시작·전체 도전 보기·소리 켜기가 있고, 월드는 멈춰 있으며 뒤의 화면은 눌리지 않는다', async () => {
    const t = await bootApp('', { intro: true });
    const card = q(t.host, '[data-intro]')!;
    expect(card).not.toBeNull();
    expect(q(card, '[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    const lines = qa(card, '.intro-steps li');
    expect(lines.map((l) => text(q(l, '.intro-head')))).toEqual(['걷기', '열기', '지도']);
    expect(text(card)).toMatch(/방향키나 W A S D/);
    expect(text(card)).toMatch(/E를 눌러요/);
    expect(text(card)).toMatch(/M을 누르면/);
    for (const label of ['시작', '전체 도전 보기', '소리 켜기']) expect(button(card, label)).toBeTruthy();
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(button(card, '시작'));
  });

  it('가입이나 진단 시험은 없고, 무엇을 먼저 하라고 시키지 않는다', async () => {
    const t = await bootApp('', { intro: true });
    const card = text(q(t.host, '[data-intro]'));
    expect(card).not.toMatch(/가입|로그인|진단|먼저 해|꼭 /);
  });

  it("'시작'을 누르면 카드가 사라지고 월드가 움직이며, 본 것으로 기억한다", async () => {
    const t = await bootApp('', { intro: true });
    click(button(q(t.host, '[data-intro]')!, '시작'));
    expect(q(t.host, '[data-intro]')).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(t.ctx.preferences.get().introSeen).toBe(true);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(false);
  });

  it('Esc로 건너뛸 수 있다', async () => {
    const t = await bootApp('', { intro: true });
    t.press('Escape');
    expect(q(t.host, '[data-intro]')).toBeNull();
    expect(t.ctx.preferences.get().introSeen).toBe(true);
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it("'전체 도전 보기'는 안내를 닫고 목록으로 간다", async () => {
    const t = await bootApp('', { intro: true });
    click(button(q(t.host, '[data-intro]')!, '전체 도전 보기'));
    expect(t.win.location.hash).toBe('#/list');
    expect(t.ctx.preferences.get().introSeen).toBe(true);
    expect(qa(t.host, '.quest-card')).toHaveLength(3);
  });

  it('안내가 떠 있을 때 M을 눌러 다른 화면으로 가면 본 것으로 치고, 돌아와도 다시 뜨지 않는다', async () => {
    const t = await bootApp('', { intro: true });
    t.press('KeyM');
    expect(t.win.location.hash).toBe('#/map');
    expect(t.ctx.preferences.get().introSeen).toBe(true);
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(q(t.host, '[data-intro]')).toBeNull();
  });

  it('처음 주소가 마을이 아니면(지도, 목록, 패널, 정거장 안내) 안내는 뜨지 않는다. 나중에 마을로 와도 뜨지 않는다(W-2)', async () => {
    for (const hash of ['#/map', '#/list', '#/s/H1', '#/q/rhythm.rest-in-a-bar/quarter-rest']) {
      const t = await bootApp(hash, { intro: true });
      expect(q(t.host, '[data-intro]'), hash).toBeNull();
      act(() => {
        t.win.location.hash = '#/';
      });
      expect(q(t.host, '.hud'), hash).not.toBeNull();
      expect(q(t.host, '[data-intro]'), hash).toBeNull();
      expect(t.ctx.world.bridge.pause.get(), hash).toBe(false);
    }
  });

  it('이미 본 사람에게는 뜨지 않는다', async () => {
    const t = await bootApp('');
    expect(q(t.host, '[data-intro]')).toBeNull();
  });

  it('키보드가 없는 터치 화면에서는 키 이름 없이 누르기로 말한다', async () => {
    touchOnly();
    const t = await bootApp('', { intro: true });
    const card = text(q(t.host, '[data-intro]'));
    expect(card).not.toMatch(/W A S D|E를|M을/);
    expect(card).toContain('누르면 걸어가요');
  });

  it("설정의 '조작 안내 다시 보기'는 마을로 가서 안내를 다시 보인다", async () => {
    const t = await bootApp('#/settings', { preferences: { language: 'ko', introSeen: true } });
    expect(q(t.host, '[data-intro]')).toBeNull();
    click(button(t.host, '조작 안내 다시 보기'));
    expect(t.win.location.hash).toBe('#/');
    expect(q(t.host, '[data-intro]')).not.toBeNull();
    expect(t.ctx.preferences.get().introSeen).toBe(false);
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    click(button(q(t.host, '[data-intro]')!, '시작'));
    expect(q(t.host, '[data-intro]')).toBeNull();
    expect(t.ctx.preferences.get().introSeen).toBe(true);
  });
});

describe('3.7, 7.7 악보 지도', () => {
  const markers = (host: HTMLElement) => qa<HTMLButtonElement>(host, '.map-marker');

  it('B01 구성: 왼쪽 지도, 오른쪽 카드. 정거장 23곳이 처음부터 모두 보이고 지역 이름 여섯이 있다', async () => {
    const t = await bootApp('#/map');
    const map = q(t.host, '[data-overlay="map"]')!;
    expect(map).not.toBeNull();
    expect(q(map, '.map-stage .map-surface')).not.toBeNull();
    expect(q(map, 'aside.map-side .map-card')).not.toBeNull();
    expect(markers(t.host)).toHaveLength(23);
    expect(new Set(markers(t.host).map((m) => m.getAttribute('data-station'))).size).toBe(23);
    expect(qa(map, '.map-region-label').map((l) => text(l))).toEqual(['음악 마을', '오선 언덕', '박자 강가', '종나무 숲', '음계 길', '건반 늪']);
    // 이동 지점을 여는 절차도 자물쇠도 없다
    expect(map.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨|해금/);
    // 확대·축소와 내 위치
    expect(button(map, '확대')).toBeTruthy();
    expect(button(map, '축소')).toBeTruthy();
    expect(q(map, '[data-me]')!.getAttribute('aria-label')).toContain('내 위치');
  });

  it('처음에는 서 있는 자리에서 가장 가까운 정거장을 고른 상태다', async () => {
    const t = await bootApp('#/map');
    const expected = t.ctx.world.map.nearestStation(PLAYER_START.x, PLAYER_START.y)!;
    expect(q(t.host, '.map-card')!.getAttribute('data-selected-station')).toBe(expected.stationId);
    expect(markers(t.host).find((m) => m.getAttribute('data-station') === expected.stationId)!.getAttribute('aria-pressed')).toBe('true');
  });

  it('정거장을 고르면 카드가 바뀐다: 작업대 H1은 Q01을, 음계 디딤돌 H4는 Q07을 패널로 바로 시작할 수 있다', async () => {
    const t = await bootApp('#/map');
    click(q(t.host, '[data-station="H1"]'));
    let card = q(t.host, '.map-card')!;
    expect(text(q(card, 'h2'))).toBe('음자리 작업대');
    expect(text(q(card, '.map-card-region'))).toBe('음악 마을 · 작업대');
    const quests = qa(card, '.map-quest');
    expect(quests.map((x) => x.getAttribute('data-quest'))).toEqual([Q01, 'pitch.same-sound-different-names']);
    const q01 = quests[0]!;
    expect(text(q(q01, '.map-quest-head'))).toContain('Q01');
    expect(text(q01)).toContain('음자리표');
    expect(text(q01)).toMatch(/성부 \d개 · 가장 짧은 음가 .+ · 조작/); // 난도를 숫자 하나로 적지 않는다
    expect(q<HTMLAnchorElement>(q01, 'a.btn')!.getAttribute('href')).toBe('#/q/pitch.same-note-two-clefs/middle-c');
    expect(text(q01)).toContain('이 도전 시작하기');
    expect(quests[1]!.classList.contains('is-preparing')).toBe(true);
    expect(qa(quests[1]!, 'a')).toHaveLength(0);

    click(q(t.host, '[data-station="H4"]'));
    card = q(t.host, '.map-card')!;
    expect(text(q(card, 'h2'))).toBe('음계 디딤돌');
    expect(text(q(card, '.map-card-region'))).toBe('음악 마을 · 음계 길');
    const q07 = q(card, `[data-quest="${Q07}"]`)!;
    expect(text(q07)).toContain('이 도전 시작하기');
    expect(q<HTMLAnchorElement>(q07, 'a.btn')!.getAttribute('href')).toBe('#/q/scale.major/c-major');
    expect(q07.classList.contains('is-preparing')).toBe(false);
  });

  it('아직 화면이 없는 과제가 놓인 정거장 카드는 준비 중이라고 말하고 열기를 두지 않는다', async () => {
    const t = await bootApp('#/map', { definitions: [quest(Q01), quest(Q02), screenless(quest(Q07))] });
    click(q(t.host, '[data-station="H4"]'));
    const q07 = q(q(t.host, '.map-card')!, `[data-quest="${Q07}"]`)!;
    expect(text(q07)).toContain('화면을 만드는 중이에요');
    expect(qa(q07, 'a')).toHaveLength(0);
  });

  it('지도의 점이 아니어도 아래 목록으로 모든 정거장을 고를 수 있다(끌기도 마우스도 필요 없다)', async () => {
    const t = await bootApp('#/map');
    const items = qa<HTMLButtonElement>(t.host, '[data-station-item]');
    expect(items).toHaveLength(23);
    click(items.find((b) => b.getAttribute('data-station-item') === 'K2')!);
    expect(text(q(t.host, '.map-card h2'))).toBe('음정 밧줄');
    expect(q(t.host, '[data-station-item="K2"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q(t.host, '[data-station="K2"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it("'걸어가기'는 월드가 움직이기 시작할 때 걷기 명령을 보내고 마을로 돌아간다. 저절로 열지는 않는다", async () => {
    const t = await bootApp('#/map');
    t.ready();
    click(q(t.host, '[data-station="H4"]'));
    click(q(t.host, '[data-action="walk"]'));
    await flush();
    expect(t.win.location.hash).toBe('#/');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(t.commands).toEqual([{ type: 'walk-to-station', stationId: 'H4' }]);
  });

  it("'바로 이동'으로 다른 지역에 서면 왼쪽 위 지역 이름과 안내 칩이 바로 바뀐다(마을로 돌아오는 순간 월드 상태가 연달아 두 번 바뀌어도 놓치지 않는다)", async () => {
    const t = await bootApp('#/map');
    t.ready();
    const bridge = t.ctx.world.bridge;
    // 가짜 장면: 멈춤이 풀리면 상태에 알리고, 이동 명령을 받으면 새 지역에 선다(실제 장면과 같은 순서)
    bridge.pause.subscribe((p) => bridge.patchStatus({ paused: p }));
    bridge.commands.subscribe((c) => {
      if (c.type === 'teleport-to-station') bridge.patchStatus({ regionId: 'key-marsh', near: { stationId: 'K3', name: '제자리표 다리' } });
    });
    click(q(t.host, '[data-station="K3"]'));
    click(q(t.host, '[data-action="teleport"]'));
    await flush();
    await flush();
    expect(bridge.status.get().regionId).toBe('key-marsh');
    expect(text(q(t.host, '.hud-region-name'))).toBe('건반 늪');
    expect(text(q(t.host, '.hud-chip'))).toContain('제자리표 다리');
  });

  it("'바로 이동'은 정거장 앞에 서라는 명령을 보내고 마을로 돌아간다", async () => {
    const t = await bootApp('#/map');
    t.ready();
    click(q(t.host, '[data-station="K3"]'));
    click(q(t.host, '[data-action="teleport"]'));
    await flush();
    expect(t.win.location.hash).toBe('#/');
    expect(t.commands).toEqual([{ type: 'teleport-to-station', stationId: 'K3' }]);
  });

  it('월드가 아직 준비되지 않았으면 명령은 월드가 준비된 뒤에 나간다', async () => {
    const t = await bootApp('#/map');
    click(q(t.host, '[data-station="W2"]'));
    click(q(t.host, '[data-action="walk"]'));
    await flush();
    expect(t.commands).toEqual([]);
    t.ready();
    expect(t.commands).toEqual([{ type: 'walk-to-station', stationId: 'W2' }]);
  });

  it('방향키로 옆 정거장을 고른다. 고른 점만 탭 순서에 있다(초점 이동)', async () => {
    const t = await bootApp('#/map');
    click(q(t.host, '[data-station="H1"]'));
    const tabbable = markers(t.host).filter((m) => m.tabIndex === 0);
    expect(tabbable.map((m) => m.getAttribute('data-station'))).toEqual(['H1']);
    const h1 = tabbable[0]!;
    h1.focus();
    // H1은 음자리 작업대, 오른쪽에는 H2(리듬 작업대)나 다른 정거장이 있다
    const before = q(t.host, '.map-card')!.getAttribute('data-selected-station');
    keydown(h1, 'ArrowRight');
    const after = q(t.host, '.map-card')!.getAttribute('data-selected-station');
    expect(after).not.toBe(before);
    expect(document.activeElement).toBe(q(t.host, `[data-station="${after}"]`));
    expect(markers(t.host).filter((m) => m.tabIndex === 0)).toHaveLength(1);
  });

  it('확대·축소 단추와 + − 0 키가 지도의 배율을 바꾼다. 한계를 넘지 않는다', async () => {
    const t = await bootApp('#/map');
    const surface = q(t.host, '[data-map-surface]')!;
    const zoom = (): number => Number(surface.getAttribute('data-zoom'));
    expect(zoom()).toBe(1);
    click(button(t.host, '확대'));
    expect(zoom()).toBeCloseTo(1.6, 1);
    click(button(t.host, '확대'));
    click(button(t.host, '확대'));
    click(button(t.host, '확대'));
    click(button(t.host, '확대'));
    expect(zoom()).toBe(4);
    click(button(t.host, '축소'));
    expect(zoom()).toBeCloseTo(2.5, 1);
    keydown(q(t.host, '.map-marker[tabindex="0"]'), '-');
    expect(zoom()).toBeCloseTo(1.56, 1);
    keydown(q(t.host, '.map-marker[tabindex="0"]'), '+');
    expect(zoom()).toBeCloseTo(2.5, 1);
    click(button(t.host, '전체 보기'));
    expect(zoom()).toBe(1);
    keydown(q(t.host, '.map-marker[tabindex="0"]'), '+');
    keydown(q(t.host, '.map-marker[tabindex="0"]'), '0');
    expect(zoom()).toBe(1);
    for (let i = 0; i < 6; i++) click(button(t.host, '축소'));
    expect(zoom()).toBe(1);
  });

  it('가까이 키우면 모든 정거장 이름이 보이고, 전체 보기에서는 고른 것만 이름이 보인다', async () => {
    const t = await bootApp('#/map');
    expect(qa(t.host, '.map-marker.has-label')).toHaveLength(1);
    for (let i = 0; i < 4; i++) click(button(t.host, '확대'));
    expect(qa(t.host, '.map-marker.has-label')).toHaveLength(23);
  });

  it('M이나 Esc로 닫으면 월드로 돌아온다', async () => {
    const t = await bootApp('');
    t.press('KeyM');
    expect(q(t.host, '[data-overlay="map"]')).not.toBeNull();
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it('모든 점에는 이름과 지역이 붙고, 고른 점에는 눌림 상태가 있다(7.9 8번)', async () => {
    const t = await bootApp('#/map');
    for (const m of markers(t.host)) {
      expect(m.getAttribute('aria-label')).toMatch(/.+, (음악 마을|오선 언덕|박자 강가|종나무 숲|음계 길|건반 늪)$/);
      expect(m.hasAttribute('aria-pressed')).toBe(true);
    }
  });
});

describe('7.8 설정', () => {
  const range = (host: HTMLElement, id: string): HTMLInputElement => q<HTMLInputElement>(host, `#${id}`)!;
  const setRange = (el: HTMLInputElement, value: number): void => {
    el.value = String(value);
    act(() => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('소리 켜기, 전체 소리 크기, 과제 소리 크기, 글자 크기, 움직임 줄이기, 조작 안내 다시 보기가 있다', async () => {
    const t = await bootApp('#/settings');
    const page = q(t.host, '[data-overlay="settings"]')!;
    expect(text(q(page, 'h1'))).toBe('설정');
    expect(button(page, '소리 켜기')).toBeTruthy();
    expect(range(t.host, 'set-master').value).toBe('60');
    expect(range(t.host, 'set-task').value).toBe('100');
    expect(qa(page, '[data-text-size]').map((b) => text(b))).toEqual(['보통', '크게']);
    expect(q(page, '#set-reduce')!.getAttribute('role')).toBe('switch');
    expect(button(page, '조작 안내 다시 보기')).toBeTruthy();
  });

  it('소리 크기를 바꾸면 믹서에 바로 적용된다. 슬라이더의 이름과 값이 읽힌다', async () => {
    const t = await bootApp('#/settings');
    setRange(range(t.host, 'set-master'), 30);
    expect(t.ctx.settings.get().masterVolume).toBe(0.3);
    expect(t.ctx.mixer.settings.masterVolume).toBe(0.3);
    setRange(range(t.host, 'set-task'), 45);
    expect(t.ctx.mixer.settings.taskVolume).toBe(0.45);
    const el = range(t.host, 'set-master');
    expect(el.getAttribute('aria-valuetext')).toBe('30퍼센트');
    expect(q(t.host, 'label[for="set-master"]')).not.toBeNull();
    expect(text(q(t.host, 'output[for="set-master"]'))).toBe('30%');
  });

  it('끌지 않아도 − + 단추로 바꿀 수 있다. 끝에서는 눌러도 아무 일이 없고 초점이 사라지지 않는다(W-4)', async () => {
    const t = await bootApp('#/settings');
    click(button(t.host, '전체 소리 크기 줄이기'));
    expect(t.ctx.settings.get().masterVolume).toBe(0.5);
    click(button(t.host, '전체 소리 크기 키우기'));
    click(button(t.host, '전체 소리 크기 키우기'));
    expect(t.ctx.settings.get().masterVolume).toBe(0.7);
    for (let i = 0; i < 5; i++) click(button(t.host, '전체 소리 크기 키우기'));
    expect(t.ctx.settings.get().masterVolume).toBe(1);
    const up = button(t.host, '전체 소리 크기 키우기');
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(up.disabled).toBe(false);
    for (let i = 0; i < 12; i++) click(button(t.host, '전체 소리 크기 줄이기'));
    expect(t.ctx.settings.get().masterVolume).toBe(0);
  });

  it("글자 크기 '크게'는 문서에 적용되고, '보통'으로 되돌릴 수 있다", async () => {
    const t = await bootApp('#/settings');
    const [normal, large] = qa(t.host, '[data-text-size]');
    expect(normal!.getAttribute('aria-pressed')).toBe('true');
    click(large!);
    expect(t.ctx.settings.get().textSize).toBe('large');
    expect(document.documentElement.dataset.textSize).toBe('large');
    expect(large!.getAttribute('aria-pressed')).toBe('true');
    click(normal!);
    expect(document.documentElement.dataset.textSize).toBe('normal');
  });

  it('움직임 줄이기를 켜면 문서와 월드가 따른다', async () => {
    const t = await bootApp('#/settings');
    expect(t.ctx.settings.get().reducedMotion).toBe(false);
    click(q(t.host, '#set-reduce'));
    expect(t.ctx.settings.get().reducedMotion).toBe(true);
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    expect(q(t.host, '#set-reduce')!.getAttribute('aria-checked')).toBe('true');
  });

  it('배경 소리 크기와 과제 중 배경 끄기가 있고, 바꾸면 믹서의 세계 버스에 바로 적용된다(8.6, W-7)', async () => {
    const t = await bootApp('#/settings');
    expect(range(t.host, 'set-world').value).toBe('50');
    expect(q(t.host, 'label[for="set-world"]')).not.toBeNull();
    setRange(range(t.host, 'set-world'), 20);
    expect(t.ctx.settings.get().worldVolume).toBe(0.2);
    expect(t.ctx.mixer.settings.worldVolume).toBe(0.2);
    const mute = q(t.host, '#set-mute-world')!;
    expect(mute.getAttribute('role')).toBe('switch');
    expect(mute.getAttribute('aria-checked')).toBe('false');
    click(mute);
    expect(t.ctx.settings.get().muteWorldDuringQuest).toBe(true);
    expect(t.ctx.mixer.settings.muteWorldDuringQuest).toBe(true);
    expect(q(t.host, '#set-mute-world')!.getAttribute('aria-checked')).toBe('true');
    // 끌지 않아도 − 단추로 바꿀 수 있다(W-4)
    click(button(t.host, '배경 소리 크기 줄이기'));
    expect(t.ctx.settings.get().worldVolume).toBe(0.1);
  });

  it('소리 물결 표시는 처음에 켜져 있고, 끄면 설정에 남는다(7.8, 8.4)', async () => {
    const t = await bootApp('#/settings');
    const sw = q(t.host, '#set-ripples')!;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(text(q(t.host, '#set-ripples-hint'))).toContain('소리를 꺼도');
    click(sw);
    expect(t.ctx.settings.get().soundRipples).toBe(false);
    expect(q(t.host, '#set-ripples')!.getAttribute('aria-checked')).toBe('false');
  });

  it('브라우저의 움직임 줄이기가 켜져 있으면 그 이유를 알려 준다', async () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined });
    const t = await bootApp('#/settings');
    expect(text(q(t.host, '#set-reduce-detail'))).toContain('브라우저');
  });

  it('처음 값은 저장에서 읽은 설정을 따른다', async () => {
    const t = await bootApp('#/settings', { settings: { ...DEFAULT_SETTINGS, masterVolume: 0.2, textSize: 'large', reducedMotion: true } });
    expect(range(t.host, 'set-master').value).toBe('20');
    expect(document.documentElement.dataset.textSize).toBe('large');
    expect(q(t.host, '#set-reduce')!.getAttribute('aria-checked')).toBe('true');
  });

  it('돌아가기와 Esc로 닫으면 월드로 돌아오고, 바꾼 설정은 그대로다', async () => {
    const t = await bootApp('#/settings');
    click(q(t.host, '#set-reduce'));
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(t.ctx.settings.get().reducedMotion).toBe(true);
  });
});

describe('7.7 목록 거르기와 열어 본 과제', () => {
  const ids = (host: HTMLElement): string[] => qa(host, '.quest-card').map((c) => c.getAttribute('data-quest')!);

  it('지역으로 거른다: 음악 마을은 Q01·Q02를, 오선 언덕은 Q01을, 음계 길은 Q07을 보인다. 풀면 전부 다시 보인다', async () => {
    const t = await bootApp('#/list');
    expect(ids(t.host)).toHaveLength(3);
    click(q(t.host, '[data-filter-region="village"]'));
    expect(ids(t.host).sort()).toEqual([Q01, Q02, Q07].sort()); // H1 Q01, H2 Q02, H4 Q07
    click(q(t.host, '[data-filter-region="staff-hill"]'));
    expect(ids(t.host)).toEqual([Q01]); // N3
    click(q(t.host, '[data-filter-region="scale-trail"]'));
    expect(ids(t.host)).toEqual([Q07]); // S1
    click(q(t.host, '[data-filter-region="bell-grove"]'));
    expect(ids(t.host)).toEqual([]);
    expect(q(t.host, '[data-empty]')).not.toBeNull();
    expect(text(q(t.host, '.filter-status'))).toContain('지역: 종나무 숲');
    click(q(t.host, '[data-filter-clear]'));
    expect(ids(t.host)).toHaveLength(3);
    expect(q(t.host, '[data-empty]')).toBeNull();
  });

  it('주제와 지역을 함께 걸 수 있고, 같은 칩을 다시 누르면 풀린다', async () => {
    const t = await bootApp('#/list');
    click(q(t.host, '[data-filter-region="beat-river"]')); // E1에 Q02
    expect(ids(t.host)).toEqual([Q02]);
    click(q(t.host, '[data-filter-tag="scale"]'));
    expect(ids(t.host)).toEqual([]);
    click(q(t.host, '[data-filter-tag="scale"]'));
    expect(ids(t.host)).toEqual([Q02]);
    click(q(t.host, '[data-filter-region="beat-river"]'));
    expect(ids(t.host)).toHaveLength(3);
  });

  it("'아직 열어 보지 않은 것'은 패널을 열어 본 과제를 뺀다. 열어 본 것은 저장에 들어갈 목록으로 남는다", async () => {
    const t = await bootApp('#/q/pitch.same-note-two-clefs/middle-c');
    expect(t.ctx.opened.has(Q01)).toBe(true);
    expect(t.ctx.opened.toArray()).toEqual([Q01]);
    act(() => {
      t.win.location.hash = '#/list';
    });
    click(q(t.host, '[data-filter-unopened]'));
    expect(ids(t.host).sort()).toEqual([Q02, Q07].sort());
    expect(q(t.host, '[data-filter-unopened]')!.getAttribute('aria-pressed')).toBe('true');
    click(q(t.host, '[data-filter-unopened]'));
    expect(ids(t.host)).toHaveLength(3);
  });

  it('저장에서 읽은 열어 본 과제가 거르기에 쓰인다. 모두 열어 봤으면 이유와 풀기 단추가 보인다', async () => {
    const t = await bootApp('#/list', { opened: [Q01, Q02, Q07] });
    click(q(t.host, '[data-filter-unopened]'));
    expect(ids(t.host)).toEqual([]);
    expect(text(q(t.host, '[data-empty]'))).toContain('거르기를 풀면 전부 다시 보여요');
    click(q(t.host, '[data-filter-clear]'));
    expect(ids(t.host)).toHaveLength(3);
  });

  it('거르기에 숨은 제한이 없다: 기본 상태에서 3개 모두 보이고, 열 수 있는 것은 모두 열기 단추가 있다', async () => {
    const t = await bootApp('#/list');
    expect(ids(t.host)).toHaveLength(3);
    expect(qa(t.host, '.quest-card a.btn').length).toBeGreaterThanOrEqual(2);
  });
});

describe('위쪽 메뉴: 휴대폰 세로 화면에서도 설정에 닿는다(7.9)', () => {
  it('탐험 화면에 설정 단추가 있고 이름이 붙어 있다', async () => {
    const t = await bootApp('');
    const gear = q(t.host, '.hud-menu .hud-btn-settings')!;
    expect(gear).not.toBeNull();
    expect(text(gear)).toBe('설정');
    click(gear);
    await flush();
    expect(t.win.location.hash).toBe('#/settings');
  });

  it('세로 화면 규칙은 다른 단추만 숨기고 설정 단추는 남긴다(탭 막대에 설정이 없다)', () => {
    const css = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/ui/hud.css'), 'utf8');
    const portrait = css.slice(css.indexOf('@media (orientation: portrait)'));
    expect(portrait).toMatch(/\.hud-menu \.hud-btn:not\(\.hud-btn-settings\)\s*\{\s*display:\s*none;/);
    expect(portrait).not.toMatch(/\.hud-menu \.hud-btn\s*\{\s*display:\s*none;/);
  });
});
