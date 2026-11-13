// 6.4 잔치와 세계 소리의 이어 놓은 선: 소리를 켠 채 잔치를 열면 월드 소리가 잔치 구간(16마디)을 합주의 첫 마디부터 울리고,
// 끝나면 평소로 돌아온다. 소리를 켜지 않아도 잔치는 시계를 따라 지나간다(조용한 잔치, W-11).
// 소리 계산은 world-audio-festival.test.ts가, 진행기는 festival-manager.test.ts가 본다. 여기서는 앱 조립만 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { FESTIVAL_BARS, FESTIVAL_SECONDS } from '@/domain/festival';
import { REGION_IDS } from '@/domain/world';
import { LOOP_BARS } from '@/domain/worldsound';
import { FakeClock, FakeEngine, FakeTimer } from './audio-fakes';
import { songsOf } from './controller-rig';
import { Q01, Q02, Q07, quest } from './ui-rig';

const T0 = 5000;
/** 여섯 지역(마을과 마을 밖 다섯)의 층이 모두 1 이상이 되는 다섯 과제: 오선 언덕(N3), 박자 강가(E1), 종나무 숲(W1), 음계 길(S1), 건반 늪(K1) */
const FIVE_QUESTS = ['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar', 'chord.major-triad', 'scale.major', 'pitch.same-sound-different-names'];
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const pass = (questId: string): AttemptResult =>
  makeAttemptResult({
    attemptId: `a-${questId}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);

function boot(extra: Partial<NonNullable<Parameters<typeof createAppContext>[0]>> = {}) {
  const mono = new FakeClock(T0);
  const engine = new FakeEngine();
  const timer = new FakeTimer();
  const ctx: AppContext = createAppContext({
    channel: 'preview',
    definitions: [quest(Q01), quest(Q02), quest(Q07)],
    createEngine: () => engine,
    monotonicNow: () => mono.now(),
    worldSound: { timer, visibility: null },
    makeId: () => 'att',
    nowIso: () => '2026-11-11T00:00:00.000Z',
    root: null,
    ...extra,
  });
  cleanups.push(() => ctx.dispose());
  const run = (sec: number): void => {
    const end = mono.t + sec;
    while (mono.t < end - 1e-9) {
      mono.t = Math.min(end, mono.t + 0.025);
      engine.clock.t += 0.025;
      timer.fire();
    }
  };
  /** 캐릭터를 합주 무대 곁에 세운다(마을) */
  const standAtStage = (): void => {
    const s = ctx.world.map.station('H5')!;
    ctx.world.bridge.position.set({ x: s.x, y: s.y + 40, facing: 'down' });
    ctx.world.bridge.patchStatus({ regionId: s.regionId });
  };
  return { ctx, mono, engine, timer, run, standAtStage };
}

describe('소리를 켠 채 잔치를 연다', () => {
  it('월드 소리가 잔치 구간 16마디를 울리고, 끝나면 진행기가 닫힌다(저장한 곡이 없을 때)', async () => {
    const t = boot();
    t.standAtStage();
    await t.ctx.mixer.enable();
    t.run(2);
    expect(t.ctx.worldAudio.debug().festivalBars).toBe(0);
    expect(t.ctx.festival.open()).toBe(true);
    const run = t.ctx.festival.run()!;
    expect(run.endBar - run.startBar).toBe(FESTIVAL_BARS);
    t.run(FESTIVAL_SECONDS + 8);
    expect(t.ctx.worldAudio.debug().festivalBars).toBe(FESTIVAL_BARS);
    expect(t.ctx.festival.phase).toBe('idle');
    expect(t.ctx.festival.run()).toBeNull();
    // 끝난 뒤에는 잔치의 마디가 늘지 않는다(평소의 합주로 돌아온다)
    t.run(12);
    expect(t.ctx.worldAudio.debug().festivalBars).toBe(FESTIVAL_BARS);
  });

  it('층이 0이어도 광장 맥박이 잔치 구간에 울린다(6.4)', async () => {
    const t = boot();
    t.standAtStage();
    await t.ctx.mixer.enable();
    t.run(1);
    expect(t.ctx.reaction.store.get().regionLayers.village ?? 0).toBe(0);
    const before = t.ctx.worldAudio.debug().notesScheduled;
    t.ctx.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    expect(t.ctx.worldAudio.debug().notesScheduled).toBeGreaterThan(before);
    expect(t.ctx.worldAudio.debug().festivalBars).toBe(FESTIVAL_BARS);
  });

  it('건너뛰면 그 뒤의 마디는 잔치로 세지 않는다', async () => {
    const t = boot();
    t.standAtStage();
    await t.ctx.mixer.enable();
    t.run(1);
    t.ctx.festival.open();
    t.run(10);
    const during = t.ctx.worldAudio.debug().festivalBars;
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan(FESTIVAL_BARS);
    expect(t.ctx.festival.skip()).toBe(true);
    t.run(30);
    expect(t.ctx.worldAudio.debug().festivalBars).toBe(during);
  });

  it('마을 층이 있으면 화음 악사가 서고, 저장한 곡이 있으면 끝에서 묻는다(Q01은 마을과 오선 언덕에 모두 놓여 가락 악사도 선다)', async () => {
    const t = boot({ attempts: [pass(Q01)], creations: songsOf(2) });
    t.standAtStage();
    await t.ctx.mixer.enable();
    t.run(1);
    const layers = t.ctx.reaction.store.get().regionLayers;
    expect([layers.village, layers['staff-hill'], layers['beat-river'], layers['bell-grove'], layers['scale-trail'], layers['key-marsh']]).toEqual([1, 1, 0, 0, 0, 0]);
    t.ctx.festival.open();
    expect(t.ctx.world.bridge.festival.get().musicians).toEqual(['pulse', 'bed', 'melody']);
    t.run(FESTIVAL_SECONDS + 8);
    expect(t.ctx.festival.state.get()).toEqual({ phase: 'asking', songs: 2 });
  });

  it('여섯 지역의 층이 모두 있으면(다섯 과제를 통과) 악사 일곱이 서고, 잔치 16마디에 일곱 성부의 음이 모두 예약된다(7-5)', async () => {
    const t = boot({ attempts: FIVE_QUESTS.map(pass) });
    t.standAtStage();
    await t.ctx.mixer.enable();
    t.run(1);
    const layers = t.ctx.reaction.store.get().regionLayers;
    for (const id of REGION_IDS) expect(layers[id], id).toBeGreaterThanOrEqual(1);
    t.ctx.festival.open();
    const run = t.ctx.festival.run()!;
    expect(t.ctx.world.bridge.festival.get()).toEqual({ active: true, musicians: ['pulse', 'percussion', 'bass', 'bed', 'melody', 'runner', 'ornament'] });
    t.run(FESTIVAL_SECONDS + 8);
    const inFest = t.ctx.worldAudio.debug().plazaBars.filter((b) => b.bar >= run.startBar && b.bar < run.endBar);
    expect(inFest).toHaveLength(FESTIVAL_BARS);
    for (const part of ['pulse', 'bed', 'percussion', 'bass', 'melody', 'runner', 'ornament'] as const) {
      expect(inFest.some((b) => b[part] > 0), `${part}이 잔치 16마디 가운데 울린다`).toBe(true);
    }
    // 잔치의 마디는 합주의 첫 마디부터 두 번이므로 둘째 8마디가 첫 8마디와 같은 음 수를 낸다
    const counts = (b: (typeof inFest)[number]) => [b.pulse, b.bed, b.percussion, b.bass, b.melody, b.runner, b.ornament];
    for (let i = 0; i < LOOP_BARS; i++) expect(counts(inFest[i + LOOP_BARS]!), `${i}번째 마디`).toEqual(counts(inFest[i]!));
  });
});

describe('소리를 켜지 않은 채 잔치를 연다(W-11)', () => {
  it('아무 음도 예약하지 않고 오디오 장치도 만들지 않지만, 잔치는 시계를 따라 지나간다', async () => {
    const t = boot();
    t.standAtStage();
    expect(t.ctx.festival.open()).toBe(true);
    t.run(FESTIVAL_SECONDS + 8);
    expect(t.ctx.festival.phase).toBe('idle');
    expect(t.ctx.mixer.state).toBe('off');
    expect(t.engine.startCalls).toBe(0);
    expect(t.ctx.worldAudio.debug()).toMatchObject({ running: false, notesScheduled: 0, festivalBars: 0 });
  });

  it('조용한 잔치 도중에 소리를 켜면 남은 구간이 들린다', async () => {
    const t = boot();
    t.standAtStage();
    t.ctx.festival.open();
    t.run(20);
    expect(t.ctx.festival.phase).toBe('playing');
    await t.ctx.mixer.enable();
    t.run(FESTIVAL_SECONDS);
    const bars = t.ctx.worldAudio.debug().festivalBars;
    expect(bars).toBeGreaterThan(0);
    expect(bars).toBeLessThan(FESTIVAL_BARS);
    expect(t.ctx.festival.phase).toBe('idle');
  });
});

describe('정리', () => {
  it('앱을 내리면 잔치의 타이머도 풀린다', async () => {
    const t = boot();
    t.standAtStage();
    t.ctx.festival.open();
    expect(t.timer.activeCount).toBeGreaterThan(0);
    t.ctx.dispose();
    expect(t.timer.activeCount).toBe(0);
  });
});
