// 4-5, 4-6 세계 소리와 소리 물결 흐름 시험(실제 Chrome): 소리를 켜기 전에는 장치가 없다(W-11), 소리를 끈 채로도 화면 밖 정거장의
// 방향이 가장자리 물결로 보인다(W-8), 물결이 서명 소리와 같은 박에 퍼진다, 소리를 켜면 진짜 오디오 출력에 소리가 실린다,
// 과제 소리가 나는 동안 세계 소리가 12 dB 줄었다 돌아온다(W-7), 과제를 통과하면 정거장의 서명 소리가 꽃등 판으로 바뀐다(4-6).
// 먼저 `npm run build`가 필요하다(dist를 연다). 상태는 미리보기 채널의 window.__game으로 읽는다.
// 실제 소리의 크기와 음색이 듣기 좋은지는 사람의 귀로 확인한다(docs/approvals.md의 '사람 확인 대기').
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORLD_LOOKAHEAD_SEC } from '../../src/audio/clock';
import { dbg, pos, teleport, toScreen, waitChunks, waitNear, waitReady } from './game';
import { skipIntro, startHarness, type Harness } from './harness';
import { boot as bootWith, contextCount, mixerState, oscStarts, peakOver, sound, standQuiet, turnSoundOn, until, wait } from './soundTools';
import type { GameCtx, RingLike, SoundDebug } from './soundTools';
import { PIECES } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const boot = (opts: { w?: number; h?: number; reduced?: boolean; hash?: string } = {}) => bootWith(h, opts);

// ───── 화면 쪽 도구 ─────

interface Mark {
  id: string;
  edge: string;
  cx: number;
  cy: number;
  width: number;
  waves: number;
  animation: string;
  /** 이 표식의 한가운데를 누르면 맞는 것은 무엇인가(표식이 눌림을 막지 않는지) */
  hitIsMark: boolean;
}
const marksOf = (page: Page): Promise<Mark[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-ripples .ripple')].map((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const wave = el.querySelector('.ripple-wave');
      const hit = document.elementFromPoint(cx, cy);
      return {
        id: el.getAttribute('data-ripple')!,
        edge: el.getAttribute('data-edge')!,
        cx,
        cy,
        width: r.width,
        waves: el.querySelectorAll('.ripple-wave').length,
        animation: wave ? getComputedStyle(wave).animationName : '',
        hitIsMark: !!hit && (el === hit || el.contains(hit)),
      };
    }),
  );

/** 물결의 원천이 될 수 있는 것들: 모든 정거장과 모든 소리 조각(5-6)의 id와 월드 좌표 */
async function originsOf(page: Page): Promise<Array<{ id: string; x: number; y: number }>> {
  const pieces = PIECES.map((p) => ({ id: p.discoveryId, x: p.x, y: p.y }));
  return page.evaluate((extra) => {
    const g = (window as unknown as { __game: GameCtx }).__game;
    return [...g.world.map.stations.map((s) => ({ id: s.stationId, x: s.x, y: s.y })), ...extra];
  }, pieces);
}

/** 시험이 스스로 센 기대값(화면 안 여유 24 px, 900 px, 최대 6개): 캐릭터에게서 900 px 안이고 화면에 보이지 않는 정거장과 소리 조각 중 가까운 것부터 6개 */
async function expectedIds(page: Page): Promise<string[]> {
  const origins = await originsOf(page);
  return page.evaluate((all) => {
    const g = (window as unknown as { __game: GameCtx & { world: GameCtx['world'] & { bridge: { position: { get(): { x: number; y: number } } } } } }).__game;
    const rep = g.world.bridge.view.get();
    const p = g.world.bridge.position.get();
    if (!rep) return [];
    const { x, y, width, height } = rep.view;
    return all
      .map((s) => ({ ...s, d: Math.hypot(s.x - p.x, s.y - p.y) }))
      .filter((s) => s.d < 900)
      .filter((s) => !(s.x >= x + 24 && s.x <= x + width - 24 && s.y >= y + 24 && s.y <= y + height - 24))
      .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
      .slice(0, 6)
      .map((s) => s.id)
      .sort();
  }, origins);
}

/** 월드가 알린 보이는 범위가 카메라가 실제로 보는 범위를 따라왔는가(발행이 0.1초 간격이다) */
async function viewSettled(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: GameCtx & { world: GameCtx['world'] & { debugState(): { view: { x: number; y: number; w: number; h: number } } | null } } }).__game;
    const rep = g.world.bridge.view.get();
    const d = g.world.debugState();
    if (!rep || !d) return false;
    return Math.abs(rep.view.x - d.view.x) < 3 && Math.abs(rep.view.y - d.view.y) < 3 && Math.abs(rep.view.width - d.view.w) < 2 && Math.abs(rep.view.height - d.view.h) < 2;
  });
}

async function stand(page: Page, id: string): Promise<void> {
  expect(await teleport(page, id)).toBe(true);
  await waitNear(page, id, 20000);
  await waitChunks(page);
  await until(() => viewSettled(page), (ok) => ok, '월드가 알린 보이는 범위가 카메라를 따라옴');
  await until(
    async () => ({ drawn: (await marksOf(page)).map((m) => m.id).sort(), expected: await expectedIds(page) }),
    (v) => JSON.stringify(v.drawn) === JSON.stringify(v.expected),
    '물결이 기대와 같아짐',
    20000,
  );
}

const solveQ07 = (page: Page): Promise<{ passed: boolean }> =>
  page.evaluate(() => {
    const c = (window as unknown as { __game: GameCtx }).__game.controller;
    c.open('scale.major', 'c-major');
    const notes: Array<[string, number]> = [['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5]];
    notes.forEach(([letter, octave], i) => c.edit({ type: 'setSlot', slot: i + 1, writtenPitch: { letter, accidental: null, octave } }));
    return { passed: c.check().passed };
  });


// ───────────────────────────────────────────────────────────────────────────

describe('4-6 소리를 끈 채로 화면 가장자리 물결이 방향을 알려 준다(W-8, 7.9의 6번)', () => {
  it('W-11: 소리를 켜기 전에는 오디오 장치도, 세계 소리도 없다. 그래도 물결은 보인다', async () => {
    const { ctx, page, errors } = await boot();
    await stand(page, 'H4');
    expect(await contextCount(page)).toBe(0);
    expect(await oscStarts(page)).toBe(0);
    expect(await mixerState(page)).toMatchObject({ state: 'off', muted: false });
    expect(await sound(page)).toMatchObject({ running: false, notesScheduled: 0 });
    const marks = await marksOf(page);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.map((m) => m.id).sort()).toEqual(await expectedIds(page));
    // 세계 시계는 소리를 켜기 전에도 흐른다(물결이 같은 박을 센다)
    const t0 = await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.worldClock.now());
    await wait(500);
    const t1 = await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.worldClock.now());
    expect(t1 - t0).toBeGreaterThan(0.3);
    expect(await contextCount(page)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('표식은 그 정거장이 있는 방향의 화면 가장자리에 놓이고, 눌림을 막지 않는다. 가까울수록 크다', async () => {
    const { ctx, page, errors } = await boot();
    await stand(page, 'S2'); // 음계 길: 양쪽 가까이에 S1(왼쪽 아래)과 S3(오른쪽)이 있다
    const d = await dbg(page);
    const marks = await marksOf(page);
    const expected = await expectedIds(page);
    expect(expected.length).toBeGreaterThanOrEqual(2);
    expect(marks.map((m) => m.id).sort()).toEqual(expected);
    const origins = await originsOf(page);
    const screen = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    for (const m of marks) {
      const st = origins.find((s) => s.id === m.id)!;
      const target = toScreen(d, st.x, st.y); // 그 원천이 있을 화면 좌표(화면 밖이라 화면 바깥을 가리킨다)
      const angleToStation = Math.atan2(target.y - screen.h / 2, target.x - screen.w / 2);
      const angleOfMark = Math.atan2(m.cy - screen.h / 2, m.cx - screen.w / 2);
      let diff = Math.abs(angleToStation - angleOfMark);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      expect(diff, `${m.id}의 방향 차이(라디안)`).toBeLessThan(0.06);
      // 화면 안에 있고, 가장자리에 가깝다(가장자리와 14 px 여백)
      expect(m.cx).toBeGreaterThanOrEqual(0);
      expect(m.cx).toBeLessThanOrEqual(screen.w);
      expect(m.cy).toBeGreaterThanOrEqual(0);
      expect(m.cy).toBeLessThanOrEqual(screen.h);
      const nearEdge = Math.min(m.cx, screen.w - m.cx, m.cy, screen.h - m.cy);
      expect(nearEdge, `${m.id}가 가장자리에서 떨어진 거리`).toBeLessThan(20);
      expect(m.hitIsMark, `${m.id} 표식 위를 눌러도 표식이 받지 않는다`).toBe(false);
    }
    // 가까운 쪽이 더 크다
    const byDistance = marks
      .map((m) => ({ ...m, dist: Math.hypot(origins.find((s) => s.id === m.id)!.x - d.center.x, origins.find((s) => s.id === m.id)!.y - d.center.y) }))
      .sort((a, b) => a.dist - b.dist);
    expect(byDistance[0]!.width).toBeGreaterThanOrEqual(byDistance[byDistance.length - 1]!.width);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('물결은 그 정거장의 서명 소리가 울리는 마디에 한 번씩 퍼진다(소리를 끈 채로도 같은 박)', async () => {
    const { ctx, page, errors } = await boot();
    await stand(page, 'S2');
    const marks = await marksOf(page);
    expect(marks.length).toBeGreaterThanOrEqual(2);
    for (const m of marks) {
      expect(m.waves).toBe(1);
      expect(m.animation).toBe('ripple-wave'); // 퍼지는 움직임이 실제로 걸려 있다
    }
    await page.evaluate(() => {
      const w = window as unknown as { __pulses: Array<{ id: string; t: number; bar: number; late: number }>; __game: GameCtx };
      w.__pulses = [];
      const layer = document.querySelector('.hud-ripples')!;
      new MutationObserver((muts) => {
        for (const mu of muts)
          mu.addedNodes.forEach((n) => {
            if (!(n instanceof HTMLElement) || !n.classList.contains('ripple-wave')) return;
            const clock = w.__game.worldClock;
            const bar = clock.bar();
            w.__pulses.push({ id: n.parentElement!.getAttribute('data-ripple')!, t: clock.now(), bar, late: clock.now() - clock.barStart(bar) });
          });
      }).observe(layer, { childList: true, subtree: true });
    });
    await wait(13500); // 4마디(12초)를 한 번 지나가게 둔다
    const pulses = await page.evaluate(() => (window as unknown as { __pulses: Array<{ id: string; bar: number; late: number }> }).__pulses);
    const stations = await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.world.map.stations.map((s) => s.stationId));
    for (const m of marks) {
      const mine = pulses.filter((p) => p.id === m.id);
      const offset = stations.indexOf(m.id) % 4;
      expect(mine.length, `${m.id} 물결 횟수`).toBeGreaterThanOrEqual(1);
      expect(mine.length).toBeLessThanOrEqual(2);
      for (const p of mine) {
        expect(((p.bar % 4) + 4) % 4, `${m.id}가 퍼진 마디`).toBe(offset);
        expect(p.late, `${m.id}가 마디 시작에서 늦은 시간(초)`).toBeLessThan(1);
      }
    }
    expect(await contextCount(page)).toBe(0); // 그동안 소리 장치는 한 번도 만들어지지 않았다
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('움직임 줄이기: 표식은 그대로 있고 퍼지는 물결만 없다', async () => {
    const { ctx, page, errors } = await boot({ reduced: true });
    await stand(page, 'S2');
    const marks = await marksOf(page);
    expect(marks.length).toBeGreaterThanOrEqual(2);
    for (const m of marks) expect(m.waves).toBe(0);
    expect(marks.map((m) => m.id).sort()).toEqual(await expectedIds(page));
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("설정의 '소리 물결 표시'를 끄면 사라지고, 새로 고쳐도 꺼진 채다. 다시 켜면 나타난다", async () => {
    const { ctx, page, errors } = await boot();
    await stand(page, 'S2');
    expect((await marksOf(page)).length).toBeGreaterThan(0);
    await page.locator('.hud-btn-settings').click();
    await page.waitForSelector('[data-overlay="settings"]');
    const sw = page.locator('#set-ripples');
    expect(await sw.getAttribute('aria-checked')).toBe('true');
    await sw.click();
    expect(await sw.getAttribute('aria-checked')).toBe('false');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    expect(await page.locator('[data-ripples]').count()).toBe(0);
    // 새로 고쳐도 꺼진 채(저장된다)
    await wait(1200); // 저장은 잠깐 모았다가 쓴다
    await page.reload();
    await skipIntro(page);
    await waitReady(page);
    await waitChunks(page);
    expect(await page.locator('[data-ripples]').count()).toBe(0);
    // 다시 켠다
    await page.locator('.hud-btn-settings').click();
    await page.waitForSelector('[data-overlay="settings"]');
    expect(await page.locator('#set-ripples').getAttribute('aria-checked')).toBe('false');
    await page.locator('#set-ripples').click();
    await page.keyboard.press('Escape');
    await page.waitForSelector('.hud');
    await until(() => page.locator('[data-ripples]').count(), (n) => n === 1, '물결 층이 다시 생김', 10000);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-5 소리를 켜면 세계 소리가 진짜 오디오 출력으로 나간다', () => {
  it('소리 켜기를 누르면 장치가 켜지고, 마디마다 예약하며, 출력에 실제로 소리가 실린다. 음소거하면 조용해진다', async () => {
    const { ctx, page, errors } = await boot();
    const spot = await standQuiet(page); // 서명 소리가 닿지 않는 자리: 광장 합주의 맥박만 들린다
    expect(spot).toBeTruthy();
    expect(await contextCount(page)).toBe(0);
    await turnSoundOn(page);
    expect(await contextCount(page)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => (window as unknown as { __audioContexts: AudioContext[] }).__audioContexts[0]!.state)).toBe('running');
    const s0 = await until(() => sound(page), (s) => s.running && s.barsScheduled >= 2 && s.notesScheduled > 0, '세계 소리가 돌고 음을 예약함');
    expect(s0.plazaAudible).toBe(true);
    expect(await oscStarts(page)).toBeGreaterThan(0); // 진짜 소리 장치의 발진기가 울렸다

    const loud = await peakOver(page, 5000);
    console.log(`[worldsound] 광장 맥박만 있을 때 출력 최댓값 ${loud.toFixed(4)}`);
    expect(loud, '출력에 소리가 실려 있다').toBeGreaterThan(0.002);
    expect(loud, '소리가 터지지 않는다').toBeLessThan(0.9);

    // 음소거하면 세계 소리도 멈추고 출력이 조용해진다
    await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.mixer.setMuted(true));
    expect((await sound(page)).running).toBe(false);
    await wait(1500); // 이미 예약한 음의 끝 울림이 사라질 때까지
    const quiet = await peakOver(page, 2000);
    console.log(`[worldsound] 음소거 뒤 출력 최댓값 ${quiet.toFixed(5)}`);
    expect(quiet).toBeLessThan(loud * 0.05);
    await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.mixer.setMuted(false));
    await until(() => sound(page), (s) => s.running, '음소거를 풀면 다시 돎', 10000);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('마을을 벗어나면 광장 합주가 멈추고(2초에 걸쳐), 돌아오면 다시 들린다', async () => {
    const { ctx, page, errors } = await boot();
    await standQuiet(page, 'village');
    await turnSoundOn(page);
    await until(() => sound(page), (s) => s.running && s.plazaAudible, '마을에서 광장 합주가 들림');
    const inVillage = await peakOver(page, 4500);
    expect(inVillage).toBeGreaterThan(0.002);
    // 오선 언덕의 서쪽 가장자리: 마을 밖이고, 어떤 정거장도 소리 조각도 들리지 않는다.
    // 7-4부터 마을 밖 모든 지역에 바탕 소리가 깔려서 출력이 조용해지지는 않는다: 광장 합주는 닫히고 이 지역의 바탕이 열린다
    await standQuiet(page, 'staff-hill');
    await until(() => sound(page), (s) => !s.plazaAudible && s.audibleRegions.includes('staff-hill'), '마을을 벗어나면 광장 합주가 멈추고 이 지역의 바탕이 열림', 15000);
    const lastPlazaBar = (s: Awaited<ReturnType<typeof sound>>): number => Math.max(-1, ...s.plazaBars.map((b) => b.bar));
    const leftAt = lastPlazaBar(await sound(page));
    expect(leftAt).toBeGreaterThanOrEqual(0); // 마을에서 광장 합주를 예약했다
    await wait(4000); // 서서히 줄어드는 2초 + 이미 예약한 음의 끝 울림
    expect(lastPlazaBar(await sound(page)), '마을 밖에서는 광장 합주를 더 예약하지 않는다').toBe(leftAt);
    const outside = await peakOver(page, 4500);
    console.log(`[worldsound] 마을 ${inVillage.toFixed(4)} → 마을 밖(오선 언덕의 바탕) ${outside.toFixed(5)}`);
    expect(outside).toBeLessThan(0.9);
    // 마을로 돌아오면 다시 들린다
    await standQuiet(page, 'village');
    await until(() => sound(page), (s) => s.plazaAudible, '돌아오면 광장 합주가 다시 들림', 15000);
    await wait(3000);
    const back = await peakOver(page, 4500);
    console.log(`[worldsound] 돌아온 뒤 ${back.toFixed(4)}`);
    expect(back).toBeGreaterThan(inVillage * 0.5);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('W-7: 과제 소리가 나는 동안 세계 소리가 12 dB 줄고, 끝나면 돌아온다. 과제 중 배경 끄기를 고르면 아예 꺼진다', async () => {
    const { ctx, page, errors } = await boot();
    await standQuiet(page);
    await turnSoundOn(page);
    await until(() => sound(page), (s) => s.running && s.plazaAudible && s.barsScheduled >= 2, '광장 합주가 돎');
    const base = await peakOver(page, 4500);
    expect(base).toBeGreaterThan(0.002);
    const before = await mixerState(page);
    expect(before.ducked).toBe(false);

    // 과제 소리가 나기 시작했다고 알린다(재생기가 부르는 것과 같은 길). 세계 버스 셋이 12 dB 줄어든다
    await page.evaluate(() => {
      const w = window as unknown as { __game: GameCtx; __endTask?: () => void };
      w.__endTask = w.__game.mixer.beginTaskSound();
    });
    const during = await mixerState(page);
    expect(during.ducked).toBe(true);
    expect(during.layer).toBeCloseTo(before.layer - 12, 6);
    expect(during.sig).toBeCloseTo(before.sig - 12, 6);
    expect(during.bed).toBeCloseTo(before.bed - 12, 6);
    await wait(700); // 0.15초 어택이 끝난 뒤
    const ducked = await peakOver(page, 4500);
    console.log(`[worldsound] 평소 ${base.toFixed(4)} → 과제 소리 중 ${ducked.toFixed(4)} (비 ${(ducked / base).toFixed(3)}, 기대 약 0.25)`);
    expect(ducked / base, '12 dB는 약 0.25배').toBeLessThan(0.45);
    expect(ducked / base).toBeGreaterThan(0.1);

    // 끝나면 0.6초에 걸쳐 돌아온다
    await page.evaluate(() => (window as unknown as { __endTask: () => void }).__endTask());
    expect((await mixerState(page)).ducked).toBe(false);
    await wait(1200);
    const back = await peakOver(page, 4500);
    console.log(`[worldsound] 돌아온 뒤 ${back.toFixed(4)}`);
    expect(back / base).toBeGreaterThan(0.6);

    // 과제 중 배경 끄기: 설정을 켜면 과제 소리가 나는 동안 세계 소리가 완전히 꺼진다
    await page.evaluate(() => {
      const w = window as unknown as { __game: GameCtx; __endTask?: () => void };
      w.__game.settings.update((s) => ({ ...s, muteWorldDuringQuest: true }));
      w.__endTask = w.__game.mixer.beginTaskSound();
    });
    expect((await mixerState(page)).layer).toBe(-Infinity);
    await wait(900);
    const muted = await peakOver(page, 3000);
    console.log(`[worldsound] 과제 중 배경 끄기: ${muted.toFixed(5)}`);
    expect(muted).toBeLessThan(base * 0.03);
    await page.evaluate(() => (window as unknown as { __endTask: () => void }).__endTask());
    await wait(1200);
    expect(await peakOver(page, 4500)).toBeGreaterThan(base * 0.5);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('실제로 과제 소리를 들으면(재생기) 세계 소리가 줄어 있다가 재생이 끝나면 돌아온다', async () => {
    const { ctx, page, errors } = await boot();
    await standQuiet(page);
    await turnSoundOn(page);
    await until(() => sound(page), (s) => s.running, '세계 소리가 돎');
    // Q07의 목표를 듣는다: 컨트롤러가 재생하고, 재생 동안 믹서가 세계 소리를 줄인다
    const level = await page.evaluate(() => {
      const g = (window as unknown as { __game: GameCtx & { controller: GameCtx['controller'] & { playTarget?: () => unknown; stopPlayback(): void; playing: boolean } } }).__game;
      g.controller.open('scale.major', 'c-major');
      return { idle: g.mixer.busLevelDb('worldLayer'), hasPlay: typeof g.controller.playTarget === 'function' };
    });
    expect(level.hasPlay).toBe(true);
    await page.evaluate(() => {
      const g = (window as unknown as { __game: { controller: { playTarget(): unknown } } }).__game;
      void g.controller.playTarget();
    });
    const playing = await until(() => mixerState(page), (m) => m.ducked, '재생하는 동안 세계 소리가 줄어듦', 15000);
    expect(playing.layer).toBeCloseTo(level.idle - 12, 6);
    await page.evaluate(() => (window as unknown as { __game: { controller: { stopPlayback(): void } } }).__game.controller.stopPlayback());
    const after = await until(() => mixerState(page), (m) => !m.ducked, '재생이 끝나면 돌아옴', 15000);
    expect(after.layer).toBeCloseTo(level.idle, 6);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('4-6 서명 소리: 거리에 따른 음량, 꽃등 판', () => {
  it('정거장 곁에서는 그 정거장의 서명 소리가 4마디(12초)마다 울리고, Q07을 통과하면 다음 울림부터 꽃등 판이다', async () => {
    const { ctx, page, errors } = await boot();
    await stand(page, 'H4');
    await turnSoundOn(page);
    const index = await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.world.map.stations.findIndex((s) => s.stationId === 'H4'));
    const h4 = (s: SoundDebug): RingLike[] => s.rings.filter((r) => r.stationId === 'H4');
    const first = await until(() => sound(page), (s) => h4(s).length >= 1, 'H4의 서명 소리가 울림', 45000);
    for (const r of h4(first)) {
      expect(((r.bar % 4) + 4) % 4).toBe(index % 4);
      expect(r.version).toBe('base');
      expect(r.gain).toBeGreaterThan(0.5); // 곁에 서 있다
      expect(Math.abs(r.pan)).toBeLessThan(0.5);
    }
    const sigStart = await oscStarts(page);
    expect(sigStart).toBeGreaterThan(0);

    // 과제를 통과한다: 디딤돌의 등불이 꽃등이 된다
    expect((await solveQ07(page)).passed).toBe(true);
    const passAt = await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.worldClock.now());
    // 서명 소리의 판은 마디를 예약하는 순간에 정해지고, 예약기는 마디가 시작하기 WORLD_LOOKAHEAD_SEC(0.5초) 앞에 그 마디를 예약한다(8-4).
    // 그래서 통과하기 전에 이미 예약된 울림은 시작이 통과보다 뒤여도 기본 판이다. 시작 − 예약 폭이 통과보다 뒤인 울림(예약이 통과 뒤였다고 확실한 것)부터 꽃등 판이다.
    // 마디 번호로 가르면(`bar > 통과한 마디`) 마디가 시작하기 직전에 통과한 시험이 이미 예약된 마디를 꽃등 판으로 기대해 실패한다. 꽃등 상태가 소리에 닿는 데 걸리는 시간을 더해 여유 0.5초를 둔다
    const LAG = 0.5;
    const scheduledAfter = (r: RingLike): boolean => r.time - WORLD_LOOKAHEAD_SEC > passAt + LAG;
    const flowered = await until(() => sound(page), (s) => h4(s).some(scheduledAfter), '통과한 뒤에 예약된 H4의 서명 소리가 울림', 45000);
    for (const r of h4(flowered).filter(scheduledAfter)) expect(r.version, `울림 마디 ${r.bar}`).toBe('flower');
    // 통과하기 전에 시작한 울림은 기본 판으로 남아 있다(그 사이에 시작해 예약 시점이 애매한 울림은 가르지 않는다)
    for (const r of h4(flowered).filter((r) => r.time <= passAt)) expect(r.version, `울림 마디 ${r.bar}`).toBe('base');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('멀리 있는 정거장의 소리는 작고 왼쪽에 있으면 왼쪽으로 치우친다(8.4)', async () => {
    const { ctx, page, errors } = await boot();
    await stand(page, 'S2');
    await turnSoundOn(page);
    const s = await until(() => sound(page), (x) => new Set(x.rings.map((r) => r.stationId)).size >= 2, '두 정거장의 서명 소리가 울림', 60000);
    const stations = await page.evaluate(() => (window as unknown as { __game: GameCtx }).__game.world.map.stations);
    const me = await pos(page);
    for (const r of s.rings) {
      const st = stations.find((x) => x.stationId === r.stationId)!;
      const dist = Math.hypot(st.x - me.x, st.y - me.y);
      const expectedGain = Math.max(0, 1 - dist / 900) ** 2;
      expect(r.gain).toBeCloseTo(expectedGain, 2);
      if (st.x < me.x - 100) expect(r.pan).toBeLessThan(0);
      if (st.x > me.x + 100) expect(r.pan).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('8.2 탭이 가려지면 세계 시계가 멈춘다', () => {
  it('가려지면 멈추고 소리 장치는 그대로 두며, 돌아오면 저절로 다시 흐른다', async () => {
    const { ctx, page, errors } = await boot();
    await standQuiet(page);
    await turnSoundOn(page);
    await until(() => sound(page), (s) => s.running && s.barsScheduled >= 1, '세계 소리가 돎');
    const hide = (hidden: boolean): Promise<void> =>
      page.evaluate((hd) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hd ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await hide(true);
    expect((await sound(page)).running).toBe(false);
    const n = (await sound(page)).notesScheduled;
    await wait(3500);
    expect((await sound(page)).notesScheduled).toBe(n);
    await hide(false);
    await until(() => sound(page), (s) => s.running && s.notesScheduled > n, '돌아오면 다시 흐름', 15000);
    expect(await contextCount(page)).toBe(1); // 장치를 새로 만들지 않았다
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
