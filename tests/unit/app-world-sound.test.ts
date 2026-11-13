// 4-5, 4-6 앱 조립: 세계 시계와 세계 소리가 믹서, 세계 반응, 캐릭터의 자리, 탭 보임에 올바르게 이어졌는가(W-11, W-7).
// 소리 계산은 world-audio.test.ts가, 믹서와의 약속은 world-audio-mixer.test.ts가 본다. 여기서는 '이어 놓은 선'만 본다.
// 진짜 Chrome에서 진짜 소리 장치로 도는지는 tests/flow/worldsound.flow.ts가 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { placeOnStaffEdit, staffSlotsOf } from '@/domain/challenge';
import { rings, signatureOffset } from '@/domain/worldsound';
import { FakeClock, FakeEngine, FakeTimer, FakeVisibility } from './audio-fakes';
import { Q01, Q02, Q05, Q07, quest } from './ui-rig';

const T0 = 5000;
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
  let created = 0;
  const timer = new FakeTimer();
  const visibility = new FakeVisibility();
  const ctx: AppContext = createAppContext({
    channel: 'preview',
    definitions: [quest(Q01), quest(Q02), quest(Q07)],
    createEngine: () => {
      created++;
      return engine;
    },
    monotonicNow: () => mono.now(),
    worldSound: { timer, visibility },
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
  /** 캐릭터를 그 정거장 곁(아래로 40 px)에 세운다 */
  const standAt = (stationId: string): void => {
    const s = ctx.world.map.station(stationId)!;
    ctx.world.bridge.position.set({ x: s.x, y: s.y + 40, facing: 'down' });
    ctx.world.bridge.patchStatus({ regionId: s.regionId });
  };
  return { ctx, mono, engine, timer, visibility, created: () => created, run, standAt };
}

describe('W-11 세계 소리는 소리를 켜기 전에 아무것도 만들지 않는다', () => {
  it('앱을 만들어 한참 두어도 오디오 장치도, 깨우는 타이머도, 예약한 음도 없다', () => {
    const t = boot();
    t.run(60);
    expect(t.created()).toBe(0);
    expect(t.engine.startCalls).toBe(0);
    expect(t.timer.activeCount).toBe(0);
    expect(t.ctx.mixer.state).toBe('off');
    expect(t.ctx.worldAudio.debug()).toMatchObject({ running: false, notesScheduled: 0, barsScheduled: 0 });
  });

  it('세계 시계는 소리를 켜기 전에도 흐른다: 시작 시각이 정해져 있고, 소리 물결이 같은 박을 센다', () => {
    const t = boot();
    expect(t.ctx.worldClock.origin).toBe(T0);
    expect(t.ctx.worldClock.bar()).toBe(0);
    t.mono.t = T0 + 7.5;
    expect(t.ctx.worldClock.bar()).toBe(2); // 한 마디 3초
    expect(t.created()).toBe(0); // 시계를 읽어도 장치는 만들지 않는다
  });

  it('소리 켜기를 누르면 돌기 시작하고, 음소거하면 멈춘다. 다시 켜면 이어서 돈다', async () => {
    const t = boot();
    await t.ctx.mixer.enable();
    expect(t.created()).toBe(1);
    expect(t.ctx.worldAudio.debug().running).toBe(true);
    expect(t.timer.activeCount).toBe(1);
    t.run(10);
    expect(t.ctx.worldAudio.debug().notesScheduled).toBeGreaterThan(0);

    t.ctx.mixer.setMuted(true);
    expect(t.ctx.worldAudio.debug().running).toBe(false);
    expect(t.timer.activeCount).toBe(0);
    const n = t.ctx.worldAudio.debug().notesScheduled;
    t.run(10);
    expect(t.ctx.worldAudio.debug().notesScheduled).toBe(n);

    t.ctx.mixer.setMuted(false);
    expect(t.ctx.worldAudio.debug().running).toBe(true);
    t.run(10);
    expect(t.ctx.worldAudio.debug().notesScheduled).toBeGreaterThan(n);
  });

  it('소리 켜기가 막히면(브라우저가 거절) 세계 소리는 돌지 않고 오류도 없다', async () => {
    const t = boot();
    t.engine.startError = Object.assign(new Error('막힘'), { name: 'NotAllowedError' });
    await t.ctx.mixer.enable();
    expect(t.ctx.mixer.state).toBe('failed');
    t.run(30);
    expect(t.ctx.worldAudio.debug()).toMatchObject({ running: false, notesScheduled: 0 });
  });
});

describe('탭이 가려지면 세계 시계가 멈춘다(8.2)', () => {
  it('가려지면 멈추고 예약한 음을 지우고, 돌아오면 저절로 다시 흐른다', async () => {
    const t = boot();
    await t.ctx.mixer.enable();
    t.run(7);
    t.visibility.set(true);
    expect(t.ctx.worldAudio.debug().running).toBe(false);
    expect(t.timer.activeCount).toBe(0);
    const n = t.ctx.worldAudio.debug().notesScheduled;
    t.run(20);
    expect(t.ctx.worldAudio.debug().notesScheduled).toBe(n);
    t.visibility.set(false);
    expect(t.ctx.worldAudio.debug().running).toBe(true);
    t.run(7);
    expect(t.ctx.worldAudio.debug().notesScheduled).toBeGreaterThan(n);
  });

  it('탭 보임을 null로 넘기면 늘 보이는 것으로 친다', async () => {
    const t = boot({ worldSound: { timer: new FakeTimer(), visibility: null } });
    await t.ctx.mixer.enable();
    expect(t.ctx.worldAudio.debug().running).toBe(true);
  });
});

describe('캐릭터의 자리와 정거장의 순서가 소리에 이어져 있다', () => {
  it('정거장 곁에 서면 그 정거장의 서명 소리가 정해진 마디에 울린다(순서가 소리 물결과 같다)', async () => {
    const t = boot();
    t.standAt('H4');
    await t.ctx.mixer.enable();
    t.run(40);
    const index = t.ctx.world.map.stations.findIndex((s) => s.stationId === 'H4');
    expect(index).toBeGreaterThanOrEqual(0);
    const h4 = t.ctx.worldAudio.debug().rings.filter((r) => r.stationId === 'H4');
    expect(h4.length).toBeGreaterThanOrEqual(2);
    for (const r of h4) {
      expect(rings(r.bar, signatureOffset(index))).toBe(true);
      expect(r.gain).toBeGreaterThan(0.9); // 40 px 곁이다
    }
  });

  it('광장 합주는 마을에서만 들린다: 캐릭터의 지역을 따라간다', async () => {
    const t = boot({ attempts: [pass(Q01)] });
    t.standAt('H4');
    await t.ctx.mixer.enable();
    t.run(4);
    expect(t.ctx.worldAudio.debug().plazaAudible).toBe(true);
    t.standAt('N1'); // 오선 언덕
    t.run(1);
    expect(t.ctx.worldAudio.debug().plazaAudible).toBe(false);
    t.standAt('H1');
    t.run(1);
    expect(t.ctx.worldAudio.debug().plazaAudible).toBe(true);
  });

  it('마을의 소리 층은 세계 반응에서 온다: 통과 기록이 없으면 0, Q01을 통과했으면 그 지역의 층이다', async () => {
    const none = boot();
    none.standAt('H1');
    await none.ctx.mixer.enable();
    none.run(4);
    expect(none.ctx.worldAudio.debug().villageLayer).toBe(0);

    const passed = boot({ attempts: [pass(Q01)] });
    passed.standAt('H1');
    await passed.ctx.mixer.enable();
    passed.run(4);
    const layer = passed.ctx.reaction.store.get().regionLayers.village;
    expect(layer).toBeGreaterThan(0);
    expect(passed.ctx.worldAudio.debug().villageLayer).toBe(layer);
  });

  it('통과 기록이 있는 정거장은 꽃등 판이, 없는 정거장은 기본 판이 울린다', async () => {
    const t = boot({ attempts: [pass(Q07)] });
    t.standAt('H4');
    await t.ctx.mixer.enable();
    t.run(40);
    expect(t.ctx.reaction.store.get().lanterns['H4']).toBe('flower');
    const h4 = t.ctx.worldAudio.debug().rings.filter((r) => r.stationId === 'H4');
    expect(h4.length).toBeGreaterThan(0);
    for (const r of h4) expect(r.version).toBe('flower');
    // 곁에 있는 다른 정거장(Q07과 상관없다)은 기본 판이다
    const others = t.ctx.worldAudio.debug().rings.filter((r) => r.stationId !== 'H4');
    for (const r of others) expect(r.version).toBe('base');
  });

  it('같은 자리에서 과제를 통과하면 그 정거장의 서명 소리가 기본 판에서 꽃등 판으로 바뀐다(4-6 완료 기준)', async () => {
    const t = boot();
    t.standAt('H1');
    await t.ctx.mixer.enable();
    t.run(15);
    const before = t.ctx.worldAudio.debug().rings.filter((r) => r.stationId === 'H1');
    expect(before.length).toBeGreaterThan(0);
    for (const r of before) expect(r.version).toBe('base');

    t.ctx.controller.open(Q01, 'middle-c');
    const slots = staffSlotsOf(t.ctx.controller.current!.def);
    t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, -2)); // 높은음자리표의 아래 첫 덧줄(C4)
    t.ctx.controller.edit(placeOnStaffEdit(slots[1]!, 10)); // 낮은음자리표의 위 첫 덧줄(C4)
    t.ctx.controller.check();
    expect(t.ctx.reaction.store.get().lanterns['H1']).toBe('flower');
    const barAtPass = t.ctx.worldClock.bar();
    t.run(15);
    const after = t.ctx.worldAudio.debug().rings.filter((r) => r.stationId === 'H1' && r.bar > barAtPass);
    expect(after.length).toBeGreaterThan(0);
    for (const r of after) expect(r.version).toBe('flower');
  });
});

describe('6-8 박자 강가와 종나무 숲의 층이 소리까지 이어져 있다', () => {
  it('박자 강가의 과제(Q02)를 통과하면 마을의 광장 합주에 타악이 첫 박부터 더해진다', async () => {
    const t = boot({ attempts: [pass(Q02)] });
    const layers = t.ctx.reaction.store.get().regionLayers;
    expect(layers['beat-river']).toBe(1);
    t.standAt('H4');
    await t.ctx.mixer.enable();
    t.run(8);
    const bars = t.ctx.worldAudio.debug().plazaBars;
    expect(bars.length).toBeGreaterThanOrEqual(2);
    for (const b of bars) {
      expect(b.layers).toEqual({ village: layers.village, percussion: 1, bass: layers['bell-grove'], melody: layers['staff-hill'], runner: layers['scale-trail'], ornament: layers['key-marsh'] });
      expect(b.percussion).toBe(1);
    }
  });

  it('종나무 숲의 과제(Q05)를 통과하면 마을의 광장 합주에 베이스가 온음표 근음부터 더해진다', async () => {
    const t = boot({ definitions: [quest(Q01), quest(Q02), quest(Q05), quest(Q07)], attempts: [pass(Q05)] });
    const layers = t.ctx.reaction.store.get().regionLayers;
    expect(layers['bell-grove']).toBe(1);
    t.standAt('H4');
    await t.ctx.mixer.enable();
    t.run(8);
    const bars = t.ctx.worldAudio.debug().plazaBars;
    expect(bars.length).toBeGreaterThanOrEqual(2);
    for (const b of bars) {
      expect(b.layers.bass).toBe(1);
      expect(b.bass).toBe(1);
      expect(b.percussion).toBe(layers['beat-river'] === 0 ? 0 : [0, 1, 4, 8][layers['beat-river']]);
    }
  });

  it('통과 기록이 없으면 타악도 베이스도 없다. 놀다가 과제를 통과하면 다음 마디부터 광장 합주가 달라진다(6-8 완료 기준)', async () => {
    const t = boot();
    t.standAt('H1');
    await t.ctx.mixer.enable();
    t.run(8);
    const before = t.ctx.worldAudio.debug().plazaBars;
    expect(before.length).toBeGreaterThanOrEqual(2);
    for (const b of before) expect([b.bed, b.percussion, b.bass]).toEqual([0, 0, 0]);

    t.ctx.controller.open(Q01, 'middle-c');
    const slots = staffSlotsOf(t.ctx.controller.current!.def);
    t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, -2));
    t.ctx.controller.edit(placeOnStaffEdit(slots[1]!, 10));
    t.ctx.controller.check();
    const layer = t.ctx.reaction.store.get().regionLayers.village;
    expect(layer).toBeGreaterThan(0);
    const barAtPass = t.ctx.worldClock.bar();
    t.run(10);
    // 이미 예약한 마디 하나는 그대로 두고, 그 뒤 마디부터 새 층으로 읽는다
    const after = t.ctx.worldAudio.debug().plazaBars.filter((b) => b.bar > barAtPass + 1);
    expect(after.length).toBeGreaterThanOrEqual(2);
    for (const b of after) {
      expect(b.layers.village).toBe(layer);
      expect(b.bed).toBeGreaterThan(0);
    }
  });

  it('박자 강가 안에서는 그 지역의 바탕 소리(강물 소리, 긴 화음)와 타악이 나가고, 마을의 합주는 멈춘다', async () => {
    const t = boot({ attempts: [pass(Q02)] });
    t.standAt('E1');
    await t.ctx.mixer.enable();
    t.run(10);
    const d = t.ctx.worldAudio.debug();
    expect(d.audibleRegions).toEqual(['beat-river']);
    expect(d.plazaAudible).toBe(false);
    expect(d.plazaBars).toEqual([]);
    expect(d.regionBars.length).toBeGreaterThanOrEqual(2);
    for (const b of d.regionBars) {
      expect(b).toMatchObject({ regionId: 'beat-river', layer: 1, part: 1 });
      expect(b.chord).toBeGreaterThan(0);
      expect(b.nature).toBe(1);
    }
    // 소리 받이는 처음 예약될 때 만들어진다: 강물과 타악은 있고 바람과 베이스는 없다
    const made = t.engine.sinkLog.map((l) => `${l.bus}:${l.options.timbre}`).sort();
    expect(made).toContain('worldBed:river');
    expect(made).toContain('worldBed:pad');
    expect(made).toContain('worldLayer:tick');
    expect(made).not.toContain('worldBed:wind');
    expect(made).not.toContain('worldLayer:bass');
  });

  it('종나무 숲 안에서는 바람 소리와 긴 화음과 베이스가 나간다', async () => {
    const t = boot({ definitions: [quest(Q01), quest(Q02), quest(Q05), quest(Q07)], attempts: [pass(Q05)] });
    const stationId = t.ctx.world.map.stations.find((s) => s.regionId === 'bell-grove')!.stationId;
    t.standAt(stationId);
    await t.ctx.mixer.enable();
    t.run(10);
    const d = t.ctx.worldAudio.debug();
    expect(d.audibleRegions).toEqual(['bell-grove']);
    for (const b of d.regionBars) expect(b).toMatchObject({ regionId: 'bell-grove', layer: 1, part: 1 });
    const made = t.engine.sinkLog.map((l) => `${l.bus}:${l.options.timbre}`);
    expect(made).toContain('worldBed:wind');
    expect(made).toContain('worldLayer:bass');
    expect(made).not.toContain('worldBed:river');
  });

  it('마을에 가만히 있으면 지역 바탕 소리의 소리 받이는 만들지도 않는다(소리 켜기를 가볍게 둔다)', async () => {
    const t = boot({ attempts: [pass(Q02)] });
    t.standAt('H4');
    await t.ctx.mixer.enable();
    t.run(10);
    const made = t.engine.sinkLog.map((l) => `${l.bus}:${l.options.timbre}`);
    expect(made).not.toContain('worldBed:river');
    expect(made).not.toContain('worldBed:wind');
    expect(t.ctx.worldAudio.debug().regionBars).toEqual([]);
  });
});

describe('설정과 내리기', () => {
  it('내리면 깨우는 타이머가 멈추고, 한 번 더 내려도 던지지 않는다', async () => {
    const t = boot();
    await t.ctx.mixer.enable();
    expect(t.timer.activeCount).toBe(1);
    t.ctx.dispose();
    expect(t.timer.activeCount).toBe(0);
    expect(t.ctx.worldAudio.debug().running).toBe(false);
    expect(() => t.ctx.dispose()).not.toThrow();
  });

  it('배경 소리 크기와 과제 중 배경 끄기 설정이 믹서의 세계 버스에 닿는다', () => {
    const t = boot();
    t.ctx.settings.update((s) => ({ ...s, worldVolume: 0.2, muteWorldDuringQuest: true }));
    expect(t.ctx.mixer.settings.worldVolume).toBe(0.2);
    expect(t.ctx.mixer.settings.muteWorldDuringQuest).toBe(true);
  });
});
