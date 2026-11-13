// 6-8 두 지역의 바탕 소리와 소리 층, 광장 합주에 타악과 베이스(설계서 6.2, 8.1, 12.9). 7-4가 세 지역(오선 언덕, 음계 길, 건반 늪)을 더했다.
//  - 박자 강가의 층이 광장 합주의 타악(첫 박 → 4분음표 → 8분음표 채움)을, 종나무 숲의 층이 베이스(온음표 근음 → 근음과 5음 → 걷는 베이스)를 정한다.
//  - 마을 밖 다섯 지역 안에서는 지역의 바탕 소리(긴 화음과 자연음)에 그 지역이 맡은 성부(타악, 베이스, 가락, 달리는 음, 꾸밈음)가 층만큼 더해진다.
//    가락·달리는 음·꾸밈음이 광장 합주에 더해지는 것(오선 언덕, 음계 길, 건반 늪의 층이 마을의 합주를 바꾼다)은 7-5이고, 맨 아래의 '광장 합주의 가락, 달리는 음, 꾸밈음' 시험이 본다.
//  - 지역 경계에서 2초에 걸쳐 들리고 사라진다. 소리를 켜기 전에는 예약하지 않는다(W-11).
//  - 건반 늪의 기준음 탑은 900 px 안에서 A4를 마디마다 이어 울린다(7-4, 3.5).
// 완료 기준: "층이 오르면 광장 합주가 달라진다". 가짜 시계, 가짜 타이머, 가짜 소리 받이로 시험한다. 실제 소리는 손으로 듣는 점검의 몫이다.
import { describe, expect, it } from 'vitest';
import { WORLD_LOOKAHEAD_SEC, WorldClock } from '@/audio/clock';
import { PART_TIMBRE, PLAZA_REGION, REGION_FADE_SEC, WorldAudio } from '@/audio/worldAudio';
import { FESTIVAL_BARS } from '@/domain/festival';
import type { FestivalRun } from '@/domain/festival';
import { REGION_IDS } from '@/domain/world';
import type { RegionId } from '@/domain/world';
import { BAR_SEC, BASS_ROOT, BEAT_SEC, LANDMARK_SOUNDS, LOOP_BARS, LOOP_SEC, NATURE_CENTER_MIDI, PROGRESSION, REGION_BEDS, barInLoop, hearGain, landmarkNotes, plazaBar, regionBedBar, regionBedOf, regionPartNotes } from '@/domain/worldsound';
import { FakeClock, FakeTimer, FakeVisibility, FakeWorldMixer } from './audio-fakes';
import type { FakeSink } from './audio-fakes';

const T0 = 1000;
type Layers = Partial<Record<RegionId, number>>;
const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

function rig(opts: { layers?: Layers; at?: RegionId; audible?: boolean; run?: FestivalRun | null; omitRegionLayers?: boolean } = {}) {
  const clock = new FakeClock(T0);
  const world = new WorldClock(clock, T0);
  const timer = new FakeTimer();
  const mixer = new FakeWorldMixer(clock);
  const visibility = new FakeVisibility();
  mixer.audible = opts.audible ?? true;
  const state = {
    layers: { village: 0, 'beat-river': 0, 'bell-grove': 0, ...(opts.layers ?? {}) } as Layers,
    at: (opts.at ?? 'village') as RegionId,
    run: opts.run ?? null,
  };
  const audio = new WorldAudio({
    mixer,
    clock: world,
    timer,
    stations: [],
    festival: () => state.run,
    reaction: () =>
      opts.omitRegionLayers
        ? { villageLayer: state.layers.village ?? 0, lanterns: {} }
        : { villageLayer: state.layers.village ?? 0, regionLayers: state.layers, lanterns: {} },
    listener: () => ({ x: 4600, y: 3500, regionId: state.at }),
    visibility,
  });
  const run = (sec: number): void => {
    const end = clock.t + sec;
    while (clock.t < end - 1e-9) {
      clock.t = Math.min(end, clock.t + 0.025);
      timer.fire();
    }
  };
  return { clock, mixer, visibility, state, audio, run };
}

type Rig = ReturnType<typeof rig>;

/**
 * WorldAudio가 소리 받이를 신청하는 차례: 광장 합주 일곱(맥박, 화음 깔기, 타악, 베이스, 가락, 달리는 음, 꾸밈음), 그 뒤로 REGION_BEDS 차례
 * (오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪)대로 지역마다(긴 화음, 자연음, 지역 성부)
 */
function sinks(r: Rig) {
  const reg = r.mixer.registered;
  const at = (i: number, bus: string, timbre: string): FakeSink => {
    expect(reg[i]!.bus, `받이 ${i}의 버스`).toBe(bus);
    expect(reg[i]!.options.timbre, `받이 ${i}의 음색`).toBe(timbre);
    return reg[i]!.sink;
  };
  const region = (id: RegionId) => {
    const i = REGION_BEDS.findIndex((b) => b.regionId === id);
    const def = REGION_BEDS[i]!;
    const base = PLAZA_SINKS + i * 3;
    return { chord: at(base, 'worldBed', 'pad'), nature: at(base + 1, 'worldBed', def.nature), part: at(base + 2, 'worldLayer', PART_TIMBRE[def.part]) };
  };
  const hill = region('staff-hill');
  const river = region('beat-river');
  const grove = region('bell-grove');
  const trail = region('scale-trail');
  const marsh = region('key-marsh');
  return {
    pulse: at(0, 'worldLayer', 'thump'),
    bed: at(1, 'worldLayer', 'pad'),
    percussion: at(2, 'worldLayer', 'tick'),
    bass: at(3, 'worldLayer', 'bass'),
    plazaMelody: at(4, 'worldLayer', 'lead'),
    plazaRunner: at(5, 'worldLayer', 'run'),
    plazaOrnament: at(6, 'worldLayer', 'spark'),
    hillChord: hill.chord,
    breeze: hill.nature,
    hillPart: hill.part,
    riverChord: river.chord,
    river: river.nature,
    riverPart: river.part,
    groveChord: grove.chord,
    wind: grove.nature,
    grovePart: grove.part,
    trailChord: trail.chord,
    grass: trail.nature,
    trailPart: trail.part,
    marshChord: marsh.chord,
    mist: marsh.nature,
    marshPart: marsh.part,
  };
}
type Sinks = ReturnType<typeof sinks>;

/** 광장 합주가 신청하는 소리 받이의 수(7-5): 맥박, 화음 깔기, 타악, 베이스, 가락, 달리는 음, 꾸밈음 */
const PLAZA_SINKS = 7;
const barOf = (t: number): number => Math.floor((t - T0) / BAR_SEC + 1e-9);
const beatOf = (t: number): number => Math.round(((t - T0 - barOf(t) * BAR_SEC) / BEAT_SEC) * 1000) / 1000;
/** 한 마디에 예약된 음들(박, 음높이)을 시작 순서로 */
const inBar = (sink: FakeSink, bar: number): Array<[number, number]> =>
  sink.requests
    .filter((q) => barOf(q.time) === bar)
    .map((q): [number, number] => [beatOf(q.time), q.midi])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const beatsOf = (sink: FakeSink, bar: number): number[] => inBar(sink, bar).map(([beat]) => beat);

const PLAZA_NAMES = ['pulse', 'bed', 'percussion', 'bass', 'plazaMelody', 'plazaRunner', 'plazaOrnament'] as const satisfies ReadonlyArray<keyof Sinks>;
/** 지역마다 소리 받이 셋의 이름(긴 화음, 자연음, 지역 성부) */
const NAMES: Readonly<Record<string, readonly [keyof Sinks, keyof Sinks, keyof Sinks]>> = {
  'staff-hill': ['hillChord', 'breeze', 'hillPart'],
  'beat-river': ['riverChord', 'river', 'riverPart'],
  'bell-grove': ['groveChord', 'wind', 'grovePart'],
  'scale-trail': ['trailChord', 'grass', 'trailPart'],
  'key-marsh': ['marshChord', 'mist', 'marshPart'],
};
const REGION_NAMES: ReadonlyArray<keyof Sinks> = REGION_BEDS.flatMap((b) => [...NAMES[b.regionId]!]);
/** 모든 지역의 층을 한 값으로 둔 층 표 */
const allLayers = (layer: number): Layers => Object.fromEntries(REGION_IDS.map((id) => [id, layer])) as Layers;
/** 한 마디의 음을 (박, 음높이) 쌍으로, 시작 순서로 */
const pairsOf = (notes: ReadonlyArray<{ beat: number; midi: number }>): Array<[number, number]> => notes.map((n): [number, number] => [n.beat, n.midi]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

describe('광장 합주의 타악: 박자 강가의 층이 정한다(6.2 표)', () => {
  it('층이 모두 0이면 맥박만 있다. 타악도 베이스도 없다', () => {
    const r = rig();
    r.run(LOOP_SEC);
    const s = sinks(r);
    expect(s.pulse.requests.length).toBeGreaterThan(0);
    expect(s.percussion.requests).toEqual([]);
    expect(s.bass.requests).toEqual([]);
  });

  it('1층은 마디의 첫 박, 2층은 4분음표 네 개, 3층은 8분음표 채움(여덟 개)이다', () => {
    const expected: Record<number, number[]> = {
      1: [0],
      2: [0, 1, 2, 3],
      3: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    };
    for (const layer of [1, 2, 3]) {
      const r = rig({ layers: { 'beat-river': layer } });
      r.run(BAR_SEC * 4);
      const perc = sinks(r).percussion;
      for (const bar of [1, 2, 3]) expect(beatsOf(perc, bar), `박자 강가 ${layer}층, 마디 ${bar}`).toEqual(expected[layer]);
    }
  });

  it('타악은 박자 강가의 층만 읽는다: 마을과 종나무 숲의 층은 타악을 바꾸지 않는다', () => {
    const r = rig({ layers: { village: 3, 'bell-grove': 3, 'beat-river': 0 } });
    r.run(BAR_SEC * 4);
    expect(sinks(r).percussion.requests).toEqual([]);
    const q = rig({ layers: { village: 0, 'bell-grove': 0, 'beat-river': 2 } });
    q.run(BAR_SEC * 4);
    expect(beatsOf(sinks(q).percussion, 2)).toEqual([0, 1, 2, 3]);
  });
});

describe('광장 합주의 베이스: 종나무 숲의 층이 정한다(6.2 표, 8.3)', () => {
  it('1층은 온음표 근음 하나, 2층은 근음과 5음(2분음표 둘), 3층은 걷는 베이스(4분음표 넷)다', () => {
    const expected: Record<number, number[]> = { 1: [0], 2: [0, 2], 3: [0, 1, 2, 3] };
    for (const layer of [1, 2, 3]) {
      const r = rig({ layers: { 'bell-grove': layer } });
      r.run(BAR_SEC * 4);
      const bass = sinks(r).bass;
      for (const bar of [1, 2, 3]) expect(beatsOf(bass, bar), `종나무 숲 ${layer}층, 마디 ${bar}`).toEqual(expected[layer]);
    }
  });

  it('근음은 8.3의 표 그대로다: C3 F2 G2 C3 A2 F2 G2 C3. 2층의 두 번째 음은 근음의 5음이다', () => {
    const roots = [48, 41, 43, 48, 45, 41, 43, 48];
    const one = rig({ layers: { 'bell-grove': 1 } });
    one.run(LOOP_SEC);
    for (let bar = 0; bar < LOOP_BARS; bar++) expect(inBar(sinks(one).bass, bar), `마디 ${bar}`).toEqual([[0, roots[bar]!]]);
    const two = rig({ layers: { 'bell-grove': 2 } });
    two.run(LOOP_SEC);
    for (let bar = 0; bar < LOOP_BARS; bar++) expect(inBar(sinks(two).bass, bar), `마디 ${bar}`).toEqual([[0, roots[bar]!], [2, roots[bar]! + 7]]);
    // 표는 화음 이름과도 맞는다
    expect(PROGRESSION.map((c) => BASS_ROOT[c])).toEqual(roots);
  });

  it('베이스는 종나무 숲의 층만 읽는다', () => {
    const r = rig({ layers: { village: 3, 'beat-river': 3, 'bell-grove': 0 } });
    r.run(BAR_SEC * 4);
    expect(sinks(r).bass.requests).toEqual([]);
  });
});

describe('층이 오르면 광장 합주가 달라진다(6-8 완료 기준)', () => {
  // 마을, 박자 강가, 종나무 숲의 층을 차례로 하나씩 올린다. 층이 바뀐 다음 마디부터 달라진다
  const STEPS: Array<[RegionId, number]> = [
    ['village', 1], ['village', 2], ['village', 3],
    ['beat-river', 1], ['beat-river', 2], ['beat-river', 3],
    ['bell-grove', 1], ['bell-grove', 2], ['bell-grove', 3],
  ];

  /** 광장 합주 네 소리 받이가 한 마디에 낸 음 전체의 지문 */
  const fingerprint = (s: Sinks, bar: number): string => JSON.stringify(PLAZA_NAMES.map((n) => [n, inBar(s[n], bar)]));

  it('층을 한 단계 올릴 때마다 같은 자리의 마디가 다른 합주가 된다', () => {
    const r = rig();
    const prints: string[] = [];
    // 층을 바꾸고 두 마디쯤 지난 뒤의 8마디 가운데, 합주 뼈대의 같은 자리(셋째 마디, G 화음)를 읽는다
    const settle = (): number => {
      r.run(BAR_SEC * 2);
      const from = barOf(r.clock.t) + 1;
      r.run(LOOP_SEC);
      return [...Array(LOOP_BARS).keys()].map((k) => from + k).find((b) => barInLoop(b) === 2)!;
    };
    prints.push(fingerprint(sinks(r), settle()));
    for (const [region, layer] of STEPS) {
      r.state.layers[region] = layer;
      prints.push(fingerprint(sinks(r), settle()));
    }
    expect(prints).toHaveLength(STEPS.length + 1);
    for (let i = 1; i < prints.length; i++) expect(prints[i], `${i}번째 층 올림(${STEPS[i - 1]![0]} ${STEPS[i - 1]![1]}층)`).not.toBe(prints[i - 1]);
    expect(new Set(prints).size).toBe(prints.length);
  });

  it('마디마다 읽은 층이 기록되고, 타악과 베이스 음 수는 층을 따라 0 → 1 → 4 → 8, 0 → 1 → 2 → 4로 늘어난다', () => {
    const r = rig();
    const record = () => r.audio.debug().plazaBars;
    r.run(BAR_SEC * 2.5);
    r.state.layers['beat-river'] = 1;
    r.state.layers['bell-grove'] = 1;
    r.run(BAR_SEC * 3);
    r.state.layers['beat-river'] = 2;
    r.state.layers['bell-grove'] = 2;
    r.run(BAR_SEC * 3);
    r.state.layers['beat-river'] = 3;
    r.state.layers['bell-grove'] = 3;
    r.run(BAR_SEC * 3);
    const bars = record();
    expect(bars.length).toBeGreaterThanOrEqual(10);
    const percByLayer = [0, 1, 4, 8];
    const bassByLayer = [0, 1, 2, 4];
    for (const b of bars) {
      expect(b.percussion, `마디 ${b.bar}의 타악`).toBe(percByLayer[b.layers.percussion]);
      expect(b.bass, `마디 ${b.bar}의 베이스`).toBe(bassByLayer[b.layers.bass]);
    }
    // 층은 낮아지지 않고, 세 층을 모두 거쳤다
    const seen = (pick: (b: (typeof bars)[number]) => number) => [...new Set(bars.map(pick))];
    expect(seen((b) => b.layers.percussion)).toEqual([0, 1, 2, 3]);
    expect(seen((b) => b.layers.bass)).toEqual([0, 1, 2, 3]);
    // 기록과 실제 예약도 같다
    const s = sinks(r);
    for (const b of bars) {
      expect(inBar(s.percussion, b.bar), `마디 ${b.bar}의 타악 예약`).toHaveLength(b.percussion);
      expect(inBar(s.bass, b.bar), `마디 ${b.bar}의 베이스 예약`).toHaveLength(b.bass);
    }
  });

  it('층이 바뀐 다음 마디부터 바뀐다: 이미 예약한 마디는 그대로다', () => {
    const r = rig();
    r.run(BAR_SEC * 1.5); // 마디 0은 예약됨, 마디 1은 곧 예약된다
    r.state.layers['bell-grove'] = 3;
    r.run(BAR_SEC * 3);
    const s = sinks(r);
    // 마디 1은 층을 바꾸기 전(2.85초)에 예약됐고, 마디 2(5.85초)부터 새 층을 읽는다
    expect(inBar(s.bass, 0)).toEqual([]);
    expect(inBar(s.bass, 1)).toEqual([]);
    expect(beatsOf(s.bass, 2)).toEqual([0, 1, 2, 3]);
    expect(beatsOf(s.bass, 3)).toEqual([0, 1, 2, 3]);
  });

  it('plazaBar가 정한 음과 같은 음을 같은 시각에 예약한다(타악과 베이스가 모두 있을 때)', () => {
    const r = rig({ layers: { village: 2, 'beat-river': 3, 'bell-grove': 3 } });
    r.run(LOOP_SEC);
    const s = sinks(r);
    for (let bar = 1; bar < LOOP_BARS; bar++) {
      const want = plazaBar(barInLoop(bar), 2, { percussion: 3, bass: 3 });
      const asPairs = (notes: ReadonlyArray<{ beat: number; midi: number }>) => notes.map((n): [number, number] => [n.beat, n.midi]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(inBar(s.pulse, bar), `맥박 ${bar}`).toEqual(asPairs(want.pulse));
      expect(inBar(s.bed, bar), `화음 ${bar}`).toEqual(asPairs(want.bed));
      expect(inBar(s.percussion, bar), `타악 ${bar}`).toEqual(asPairs(want.percussion));
      expect(inBar(s.bass, bar), `베이스 ${bar}`).toEqual(asPairs(want.bass));
    }
  });

  it('새 성부의 음도 모두 다장조이고, 시작이 시계 격자 위에 있고, 마디 시작 전에(예약기가 앞서 부르는 시간 안쪽) 예약된다', () => {
    const r = rig({ layers: { village: 3, 'beat-river': 3, 'bell-grove': 3 } });
    r.run(LOOP_SEC + 1);
    const s = sinks(r);
    for (const name of ['percussion', 'bass'] as const) {
      expect(s[name].requests.length, name).toBeGreaterThan(0);
      for (const q of s[name].requests) {
        expect(MAJOR.has(q.midi % 12), `${name} ${q.midi}`).toBe(true);
        const grid = (q.time - T0) / (BEAT_SEC / 2);
        expect(Math.abs(grid - Math.round(grid))).toBeLessThan(1e-6);
        const barStart = T0 + barOf(q.time) * BAR_SEC;
        expect(barStart - q.requestedAt).toBeLessThanOrEqual(WORLD_LOOKAHEAD_SEC + 0.026);
        expect(q.requestedAt).toBeLessThanOrEqual(barStart + 1e-6);
        expect(q.velocity).toBeGreaterThan(0);
        expect(q.velocity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reaction이 지역의 층을 주지 않으면 0층으로 읽는다(옛 호출과 같다)', () => {
    const r = rig({ layers: { village: 2, 'beat-river': 3, 'bell-grove': 3 }, omitRegionLayers: true });
    r.run(LOOP_SEC);
    const s = sinks(r);
    expect(s.bed.requests.length).toBeGreaterThan(0);
    expect(s.percussion.requests).toEqual([]);
    expect(s.bass.requests).toEqual([]);
  });

  it('잔치 동안에도 타악과 베이스는 잔치의 합주 마디(첫 마디부터 두 번)를 따른다', () => {
    const run: FestivalRun = { startBar: 6, endBar: 6 + FESTIVAL_BARS };
    const r = rig({ run, layers: { 'bell-grove': 1, 'beat-river': 1 } });
    r.run(BAR_SEC * (6 + FESTIVAL_BARS) + 1);
    const s = sinks(r);
    for (let i = 0; i < FESTIVAL_BARS; i++) {
      expect(inBar(s.bass, 6 + i), `잔치의 ${i}번째 마디`).toEqual([[0, BASS_ROOT[PROGRESSION[i % LOOP_BARS]!]]]);
      expect(beatsOf(s.percussion, 6 + i)).toEqual([0]);
    }
  });
});

describe('광장 합주의 가락, 달리는 음, 꾸밈음: 오선 언덕, 음계 길, 건반 늪의 층이 정한다(7-5, 6.2 표)', () => {
  const NEW_PARTS = [
    { region: 'staff-hill', part: 'melody', sink: 'plazaMelody' },
    { region: 'scale-trail', part: 'runner', sink: 'plazaRunner' },
    { region: 'key-marsh', part: 'ornament', sink: 'plazaOrnament' },
  ] as const;
  const bars = (from: number, count = LOOP_BARS): number[] => Array.from({ length: count }, (_, k) => from + k);

  it('층이 0이면 세 성부 모두 없다. 층이 오르면 자기 지역의 성부만 생기고, 다른 소리 받이는 그대로다', () => {
    const base = rig({ layers: { village: 2, 'beat-river': 2, 'bell-grove': 2 } });
    base.run(LOOP_SEC);
    for (const n of ['plazaMelody', 'plazaRunner', 'plazaOrnament'] as const) expect(sinks(base)[n].requests, n).toEqual([]);
    for (const { region, sink } of NEW_PARTS) {
      const raised = rig({ layers: { village: 2, 'beat-river': 2, 'bell-grove': 2, [region]: 3 } });
      raised.run(LOOP_SEC);
      const s = sinks(raised);
      expect(s[sink].requests.length, `${region} 3층의 ${sink}`).toBeGreaterThan(0);
      // 나머지 광장 소리 받이는 층을 올리기 전과 같다
      for (const n of PLAZA_NAMES.filter((x) => x !== sink)) {
        for (let bar = 0; bar < LOOP_BARS; bar++) expect(inBar(s[n], bar), `${region}을 올려도 ${n} 마디 ${bar}`).toEqual(inBar(sinks(base)[n], bar));
      }
    }
  });

  it('plazaBar가 정한 음과 같은 음을 같은 시각에 예약한다(여섯 성부가 모두 있을 때, 층이 섞여 있을 때)', () => {
    const mixes: Array<[Layers, { percussion: number; bass: number; melody: number; runner: number; ornament: number }, number]> = [
      [{ village: 3, 'beat-river': 3, 'bell-grove': 3, 'staff-hill': 3, 'scale-trail': 3, 'key-marsh': 3 }, { percussion: 3, bass: 3, melody: 3, runner: 3, ornament: 3 }, 3],
      [{ village: 1, 'beat-river': 2, 'bell-grove': 3, 'staff-hill': 2, 'scale-trail': 1, 'key-marsh': 3 }, { percussion: 2, bass: 3, melody: 2, runner: 1, ornament: 3 }, 1],
      [{ village: 0, 'staff-hill': 1, 'scale-trail': 2, 'key-marsh': 1 }, { percussion: 0, bass: 0, melody: 1, runner: 2, ornament: 1 }, 0],
    ];
    for (const [layers, parts, village] of mixes) {
      const r = rig({ layers });
      r.run(LOOP_SEC);
      const s = sinks(r);
      for (let bar = 1; bar < LOOP_BARS; bar++) {
        const want = plazaBar(barInLoop(bar), village, parts);
        expect(inBar(s.pulse, bar), `맥박 ${bar}`).toEqual(pairsOf(want.pulse));
        expect(inBar(s.bed, bar), `화음 ${bar}`).toEqual(pairsOf(want.bed));
        expect(inBar(s.percussion, bar), `타악 ${bar}`).toEqual(pairsOf(want.percussion));
        expect(inBar(s.bass, bar), `베이스 ${bar}`).toEqual(pairsOf(want.bass));
        expect(inBar(s.plazaMelody, bar), `가락 ${bar}`).toEqual(pairsOf(want.melody));
        expect(inBar(s.plazaRunner, bar), `달리는 음 ${bar}`).toEqual(pairsOf(want.runner));
        expect(inBar(s.plazaOrnament, bar), `꾸밈음 ${bar}`).toEqual(pairsOf(want.ornament));
      }
    }
  });

  it('마디마다 읽은 층(여섯 성부)과 성부마다의 음 수가 기록되고, 기록과 실제 예약이 같다', () => {
    const r = rig();
    r.run(BAR_SEC * 2.5);
    // 기록은 최근 마디만 남으므로 층마다 그때의 기록을 모아 둔다
    const recorded: ReturnType<typeof r.audio.debug>['plazaBars'] = [];
    const collect = (): void => {
      for (const b of r.audio.debug().plazaBars) if (!recorded.some((x) => x.bar === b.bar)) recorded.push(b);
    };
    collect();
    for (const layer of [1, 2, 3]) {
      r.state.layers['staff-hill'] = layer;
      r.state.layers['scale-trail'] = layer;
      r.state.layers['key-marsh'] = layer;
      for (let i = 0; i < LOOP_BARS; i++) {
        r.run(BAR_SEC);
        collect();
      }
    }
    expect(recorded.length).toBeGreaterThanOrEqual(3 * LOOP_BARS);
    const s = sinks(r);
    for (const b of recorded) {
      expect(Object.keys(b.layers).sort(), `마디 ${b.bar}의 층 이름`).toEqual(['bass', 'melody', 'ornament', 'percussion', 'runner', 'village']);
      const want = plazaBar(barInLoop(b.bar), b.layers.village, b.layers);
      expect(b.melody, `마디 ${b.bar}의 가락`).toBe(want.melody.length);
      expect(b.runner, `마디 ${b.bar}의 달리는 음`).toBe(want.runner.length);
      expect(b.ornament, `마디 ${b.bar}의 꾸밈음`).toBe(want.ornament.length);
      expect(inBar(s.plazaMelody, b.bar), `마디 ${b.bar}의 가락 예약`).toHaveLength(b.melody);
      expect(inBar(s.plazaRunner, b.bar), `마디 ${b.bar}의 달리는 음 예약`).toHaveLength(b.runner);
      expect(inBar(s.plazaOrnament, b.bar), `마디 ${b.bar}의 꾸밈음 예약`).toHaveLength(b.ornament);
    }
    // 층을 한 단계씩 올렸고 세 층을 모두 거쳤다
    const seen = (pick: (b: (typeof recorded)[number]) => number) => [...new Set(recorded.map(pick))];
    expect(seen((b) => b.layers.melody)).toEqual([0, 1, 2, 3]);
    expect(seen((b) => b.layers.runner)).toEqual([0, 1, 2, 3]);
    expect(seen((b) => b.layers.ornament)).toEqual([0, 1, 2, 3]);
  });

  it('층을 한 단계 올릴 때마다(성부 여섯 × 층 셋, 18단계) 8마디 합주 전체가 달라진다', () => {
    const r = rig();
    const KEYS = [['village', 'village'], ['staff-hill', 'melody'], ['beat-river', 'percussion'], ['bell-grove', 'bass'], ['scale-trail', 'runner'], ['key-marsh', 'ornament']] as const;
    // 층을 바꾸고 두 마디쯤 지난 뒤의 8마디 전체를 합주 안의 자리별로 읽는다
    const loopFingerprint = (): string => {
      r.run(BAR_SEC * 2);
      const from = barOf(r.clock.t) + 1;
      r.run(LOOP_SEC);
      const s = sinks(r);
      const byPos = bars(from).sort((x, y) => barInLoop(x) - barInLoop(y));
      return JSON.stringify(byPos.map((bar) => PLAZA_NAMES.map((n) => [n, inBar(s[n], bar)])));
    };
    const prints: string[] = [loopFingerprint()];
    const labels: string[] = ['모두 0층'];
    for (const [region, key] of KEYS) {
      for (const layer of [1, 2, 3]) {
        r.state.layers[region] = layer;
        prints.push(loopFingerprint());
        labels.push(`${key} ${layer}층`);
      }
    }
    expect(prints).toHaveLength(19);
    for (let i = 1; i < prints.length; i++) expect(prints[i], `${labels[i]}로 올림`).not.toBe(prints[i - 1]);
    expect(new Set(prints).size).toBe(prints.length);
  });

  it('새 성부의 음은 모두 16분음표 격자 위에서 시작하고 마디 시작 전에(예약기가 앞서 부르는 시간 안쪽) 예약된다. 다장조 밖의 음은 꾸밈음의 앞꾸밈뿐이다', () => {
    const r = rig({ layers: { village: 3, 'beat-river': 3, 'bell-grove': 3, 'staff-hill': 3, 'scale-trail': 3, 'key-marsh': 3 } });
    r.run(LOOP_SEC + 1);
    const s = sinks(r);
    let outside = 0;
    for (const { part, sink } of NEW_PARTS) {
      expect(s[sink].requests.length, part).toBeGreaterThan(0);
      for (const q of s[sink].requests) {
        const grid = (q.time - T0) / (BEAT_SEC / 4);
        expect(Math.abs(grid - Math.round(grid)), `${part} 격자`).toBeLessThan(1e-6);
        const barStart = T0 + barOf(q.time) * BAR_SEC;
        expect(barStart - q.requestedAt).toBeLessThanOrEqual(WORLD_LOOKAHEAD_SEC + 0.026);
        expect(q.requestedAt).toBeLessThanOrEqual(barStart + 1e-6);
        expect(q.velocity).toBeGreaterThan(0);
        expect(q.velocity).toBeLessThanOrEqual(1);
        if (!MAJOR.has(q.midi % 12)) {
          expect(part, `다장조 밖의 음 ${q.midi}`).toBe('ornament');
          outside++;
        }
      }
    }
    // 꾸밈음 3층(2마디마다)의 앞꾸밈은 8마디에 네 번이다
    expect(outside).toBeGreaterThan(0);
  });

  it('잔치 동안에도 새 성부는 잔치의 합주 마디(첫 마디부터 두 번)를 따른다', () => {
    const run: FestivalRun = { startBar: 6, endBar: 6 + FESTIVAL_BARS };
    const r = rig({ run, layers: { 'staff-hill': 2, 'scale-trail': 3, 'key-marsh': 2 } });
    r.run(BAR_SEC * (6 + FESTIVAL_BARS) + 1);
    const s = sinks(r);
    for (let i = 0; i < FESTIVAL_BARS; i++) {
      const want = plazaBar(i % LOOP_BARS, 0, { melody: 2, runner: 3, ornament: 2 });
      expect(inBar(s.plazaMelody, 6 + i), `잔치의 ${i}번째 마디 가락`).toEqual(pairsOf(want.melody));
      expect(inBar(s.plazaRunner, 6 + i), `잔치의 ${i}번째 마디 달리는 음`).toEqual(pairsOf(want.runner));
      expect(inBar(s.plazaOrnament, 6 + i), `잔치의 ${i}번째 마디 꾸밈음`).toEqual(pairsOf(want.ornament));
    }
  });

  it('마을 밖 지역에 서 있으면 광장 합주는 울리지 않는다: 새 성부는 그 지역 안의 지역 소리 받이로만 나온다', () => {
    for (const { region, sink } of NEW_PARTS) {
      const r = rig({ at: region, layers: { village: 3, 'staff-hill': 3, 'scale-trail': 3, 'key-marsh': 3 } });
      r.run(LOOP_SEC);
      expect(sinks(r)[sink].requests, `${region} 안에서 광장의 ${sink}`).toEqual([]);
    }
  });
});

describe('지역의 바탕 소리: 마을 밖 다섯 지역 안에서만(8.1 세계 바탕)', () => {
  it('지역 안에서는 그 지역의 자연음과 긴 화음과 성부가 예약되고, 광장 합주와 다른 지역의 바탕은 예약되지 않는다', () => {
    for (const def of REGION_BEDS) {
      const r = rig({ at: def.regionId, layers: { [def.regionId]: 3 } });
      r.run(LOOP_SEC);
      const s = sinks(r);
      const mine = NAMES[def.regionId]!;
      for (const n of mine) expect(s[n].requests.length, `${def.regionId} ${n}`).toBeGreaterThan(0);
      for (const n of [...PLAZA_NAMES, ...REGION_NAMES.filter((x) => !mine.includes(x))]) expect(s[n].requests, `${def.regionId} 안에서 ${n}`).toEqual([]);
    }
  });

  it('마을 안에서는 지역의 바탕이 없다. 바탕이 없는 지역에서는 어떤 새 소리도 예약되지 않는다', () => {
    const without = REGION_IDS.filter((id) => !regionBedOf(id));
    expect(without).toEqual(['village']);
    for (const regionId of without) {
      const r = rig({ at: regionId, layers: allLayers(3) });
      r.run(BAR_SEC * 4);
      const s = sinks(r);
      for (const n of REGION_NAMES) expect(s[n].requests, `${regionId} ${n}`).toEqual([]);
      if (regionId !== PLAZA_REGION) for (const n of PLAZA_NAMES) expect(s[n].requests, `${regionId} ${n}`).toEqual([]);
    }
  });

  it('자연음은 마디마다 한 번, 4박(한 마디) 길이로 그 소리의 기준 높이에서 일어난다', () => {
    for (const def of REGION_BEDS) {
      const r = rig({ at: def.regionId });
      r.run(BAR_SEC * 5);
      const sink = sinks(r)[NAMES[def.regionId]![1]];
      for (let bar = 1; bar < 5; bar++) {
        const notes = sink.requests.filter((q) => barOf(q.time) === bar);
        expect(notes, `${def.regionId} ${def.nature} 마디 ${bar}`).toHaveLength(1);
        expect(notes[0]!.midi).toBe(NATURE_CENTER_MIDI[def.nature]);
        expect(notes[0]!.duration).toBeCloseTo(BAR_SEC, 9);
        expect(beatOf(notes[0]!.time)).toBe(0);
      }
    }
  });

  it('지역의 긴 화음은 층과 상관없이 늘 있고, 지역의 성부는 층만큼 더해진다(타악 0, 1, 4, 8, 베이스 0, 1, 2, 4, 나머지는 domain의 표)', () => {
    const counts: Record<string, number[]> = { 'beat-river': [0, 1, 4, 8], 'bell-grove': [0, 1, 2, 4] };
    for (const def of REGION_BEDS) {
      const [chord, , part] = NAMES[def.regionId]!;
      const r = rig({ at: def.regionId });
      for (let layer = 0; layer <= 3; layer++) {
        r.state.layers[def.regionId] = layer;
        r.run(BAR_SEC * 1.5); // 층이 바뀐 다음 마디부터다
        const first = barOf(r.clock.t) + 1;
        r.run(BAR_SEC * 3);
        const s = sinks(r);
        for (let bar = first; bar < first + 2; bar++) {
          const want = pairsOf(regionPartNotes(def.part, barInLoop(bar), layer));
          expect(inBar(s[part], bar), `${def.regionId} ${layer}층 마디 ${bar}`).toEqual(want);
          if (counts[def.regionId]) expect(want, `${def.regionId} ${layer}층 음 수`).toHaveLength(counts[def.regionId]![layer]!);
          if (layer === 0) expect(want).toEqual([]);
          expect(inBar(s[chord], bar).length, `${def.regionId} ${layer}층 긴 화음`).toBeGreaterThan(0);
        }
      }
      const records = r.audio.debug().regionBars.filter((b) => b.regionId === def.regionId);
      expect(records.length).toBeGreaterThan(0);
      for (const b of records) expect(b.part, `${def.regionId} 마디 ${b.bar}`).toBe(regionPartNotes(def.part, barInLoop(b.bar), b.layer).length);
    }
  });

  it('지역 성부는 광장 합주가 같은 층에서 내는 성부와 같은 음이다(박자 강가의 타악, 종나무 숲의 베이스)', () => {
    for (const [regionId, part, plazaPart] of [['beat-river', 'riverPart', 'percussion'], ['bell-grove', 'grovePart', 'bass']] as const) {
      const r = rig({ at: regionId, layers: { [regionId]: 3 } });
      r.run(LOOP_SEC);
      const here = inBar(sinks(r)[part], 2);
      const plazaBarOut = plazaBar(2, 0, { [plazaPart]: 3 })[plazaPart];
      expect(here, regionId).toEqual(pairsOf(plazaBarOut));
    }
  });

  it('예약한 음은 domain의 regionBedBar가 정한 그대로이고, 8마디 주기로 되풀이된다', () => {
    for (const def of REGION_BEDS) {
      const r = rig({ at: def.regionId, layers: { [def.regionId]: 3 } });
      r.run(LOOP_SEC * 2 + 1);
      const s = sinks(r);
      const names = NAMES[def.regionId]!;
      const parts = ['chord', 'nature', 'part'] as const;
      for (let bar = 1; bar < LOOP_BARS; bar++) {
        const want = regionBedBar(def.regionId, bar, 3)!;
        parts.forEach((p, k) => {
          const expected = pairsOf(want[p]);
          expect(inBar(s[names[k]!], bar), `${def.regionId} ${p} 마디 ${bar}`).toEqual(expected);
          expect(inBar(s[names[k]!], bar + LOOP_BARS), `${def.regionId} ${p} 마디 ${bar + LOOP_BARS}(한 바퀴 뒤)`).toEqual(expected);
        });
      }
    }
  });

  it('지역의 바탕 소리 음도 모두 다장조이고(꾸밈음의 앞꾸밈만 예외), 마디 시작 전에(예약기가 앞서 부르는 시간 안쪽) 예약된다. 자연음은 거르는 높이라 제외한다', () => {
    const natureNames = new Set<keyof Sinks>(['river', 'wind', 'breeze', 'grass', 'mist']);
    for (const def of REGION_BEDS) {
      const r = rig({ at: def.regionId, layers: { [def.regionId]: 3 } });
      r.run(LOOP_SEC + 1);
      const s = sinks(r);
      for (const n of NAMES[def.regionId]!) {
        const all = s[n].requests;
        for (const q of all) {
          if (!natureNames.has(n)) {
            // 건반 늪의 꾸밈음은 반음 아래에서 다음 음으로 올라 풀리는 앞꾸밈이다: 다장조 밖이면 0.25박 뒤에 반음 높은 다장조의 음이 온다
            const resolved = all.some((o) => Math.abs(o.time - (q.time + 0.25 * BEAT_SEC)) < 1e-6 && o.midi === q.midi + 1 && MAJOR.has(o.midi % 12));
            expect(MAJOR.has(q.midi % 12) || (def.part === 'ornament' && resolved), `${n} ${q.midi}`).toBe(true);
          }
          const barStart = T0 + barOf(q.time) * BAR_SEC;
          expect(barStart - q.requestedAt, n).toBeLessThanOrEqual(WORLD_LOOKAHEAD_SEC + 0.026);
          expect(q.requestedAt, n).toBeLessThanOrEqual(barStart + 1e-6);
        }
      }
    }
  });

  it('reaction이 지역의 층을 주지 않으면 0층이다: 긴 화음과 자연음만 있고 지역 성부는 없다', () => {
    for (const def of REGION_BEDS) {
      const r = rig({ at: def.regionId, layers: { [def.regionId]: 3 }, omitRegionLayers: true });
      r.run(LOOP_SEC);
      const s = sinks(r);
      const [chord, nature, part] = NAMES[def.regionId]!;
      expect(s[chord].requests.length, def.regionId).toBeGreaterThan(0);
      expect(s[nature].requests.length, def.regionId).toBeGreaterThan(0);
      expect(s[part].requests, def.regionId).toEqual([]);
    }
  });
});

describe('지역 경계에서 2초에 걸쳐 들리고 사라진다(8.1)', () => {
  const GROUPS: Record<string, readonly (keyof Sinks)[]> = { village: PLAZA_NAMES, ...NAMES };
  const levelOf = (r: Rig, group: string) => GROUPS[group]!.map((n) => sinks(r)[n].lastLevel);
  const SILENT = { db: -Infinity, ramp: REGION_FADE_SEC };
  const OPEN = { db: 0, ramp: REGION_FADE_SEC };
  const without = (names: ReadonlyArray<keyof Sinks>): Array<keyof Sinks> => REGION_NAMES.filter((n) => !names.includes(n));

  it('섞이는 시간은 2초다', () => {
    expect(REGION_FADE_SEC).toBe(2);
  });

  it('마을에서 시작하면 마을 합주만 열리고, 다섯 지역의 바탕은 닫아 둔다', () => {
    const r = rig();
    r.run(0.1);
    for (const lv of levelOf(r, 'village')) expect(lv).toEqual(OPEN);
    for (const def of REGION_BEDS) for (const lv of levelOf(r, def.regionId)) expect(lv, def.regionId).toEqual(SILENT);
    expect(r.audio.debug().audibleRegions).toEqual(['village']);
    expect(r.audio.debug().plazaAudible).toBe(true);
  });

  it('마을에서 박자 강가로 넘어가면 마을은 2초에 걸쳐 잦아들고 박자 강가는 2초에 걸쳐 일어선다. 다른 지역은 건드리지 않는다', () => {
    const r = rig();
    r.run(0.1);
    const others = without(NAMES['beat-river']!);
    const before = others.map((n) => sinks(r)[n].levels.length);
    r.state.at = 'beat-river';
    r.run(0.1);
    for (const lv of levelOf(r, 'village')) expect(lv).toEqual(SILENT);
    for (const lv of levelOf(r, 'beat-river')) expect(lv).toEqual(OPEN);
    others.forEach((n, i) => expect(sinks(r)[n].levels, n).toHaveLength(before[i]!));
    expect(r.audio.debug().audibleRegions).toEqual(['beat-river']);
    expect(r.audio.debug().plazaAudible).toBe(false);
  });

  it('박자 강가에서 종나무 숲으로 넘어가면 서로 바뀐다. 한 경계에 소리 받이마다 크기 변경은 한 번뿐이고, 다른 지역은 건드리지 않는다', () => {
    const r = rig({ at: 'beat-river' });
    r.run(0.1);
    const before = REGION_NAMES.map((n) => sinks(r)[n].levels.length);
    r.state.at = 'bell-grove';
    r.run(5); // 오래 머물러도 더 바뀌지 않는다
    for (const lv of levelOf(r, 'beat-river')) expect(lv).toEqual(SILENT);
    for (const lv of levelOf(r, 'bell-grove')) expect(lv).toEqual(OPEN);
    const after = REGION_NAMES.map((n) => sinks(r)[n].levels.length);
    // 박자 강가 셋은 닫히고(+1), 종나무 숲 셋은 열렸다(+1). 나머지 아홉은 그대로다
    const moved = new Set<keyof Sinks>([...NAMES['beat-river']!, ...NAMES['bell-grove']!]);
    after.forEach((n, i) => expect(n - before[i]!, REGION_NAMES[i]).toBe(moved.has(REGION_NAMES[i]!) ? 1 : 0));
    expect(r.audio.debug().audibleRegions).toEqual(['bell-grove']);
  });

  it('새 세 지역도 같은 방식으로 열리고 닫힌다(오선 언덕에서 음계 길로)', () => {
    const r = rig({ at: 'staff-hill' });
    r.run(0.1);
    for (const lv of levelOf(r, 'staff-hill')) expect(lv).toEqual(OPEN);
    for (const id of ['beat-river', 'bell-grove', 'scale-trail', 'key-marsh']) for (const lv of levelOf(r, id)) expect(lv, id).toEqual(SILENT);
    r.state.at = 'scale-trail';
    r.run(0.1);
    for (const lv of levelOf(r, 'staff-hill')) expect(lv).toEqual(SILENT);
    for (const lv of levelOf(r, 'scale-trail')) expect(lv).toEqual(OPEN);
    r.state.at = 'key-marsh';
    r.run(0.1);
    for (const lv of levelOf(r, 'scale-trail')) expect(lv).toEqual(SILENT);
    for (const lv of levelOf(r, 'key-marsh')) expect(lv).toEqual(OPEN);
    expect(r.audio.debug().audibleRegions).toEqual(['key-marsh']);
  });

  it('지역 사이를 오가며 지나가는 동안 이미 예약한 음을 따로 지우지는 않는다(줄어들며 끝까지 울린다)', () => {
    const r = rig({ at: 'beat-river', layers: { 'beat-river': 3 } });
    r.run(BAR_SEC * 2.5);
    const cancels = REGION_NAMES.map((n) => sinks(r)[n].cancelCalls);
    r.state.at = 'bell-grove';
    r.run(BAR_SEC * 2);
    REGION_NAMES.forEach((n, i) => expect(sinks(r)[n].cancelCalls, n).toBe(cancels[i]));
  });

  it('떠난 지역의 소리는 더 예약되지 않고, 들어간 지역의 소리는 다음 마디부터 예약된다', () => {
    const r = rig({ at: 'beat-river', layers: { 'beat-river': 3, 'bell-grove': 3 } });
    r.run(BAR_SEC * 2.5);
    const s = sinks(r);
    const riverBefore = s.river.requests.length;
    expect(s.wind.requests).toEqual([]);
    r.state.at = 'bell-grove';
    r.run(BAR_SEC * 3);
    // 넘어간 뒤로 강물 소리는 더 예약되지 않고, 바람 소리는 마디 3, 4, 5에 한 번씩 예약된다
    expect(s.river.requests.length - riverBefore).toBe(0);
    expect(s.wind.requests.map((q) => barOf(q.time))).toEqual([3, 4, 5]);
  });

  it('소리를 끄면 새 소리 받이도 모두 예약을 지우고, 다시 켜면 열림을 처음부터 다시 맞춘다', () => {
    const r = rig({ at: 'beat-river', layers: { 'beat-river': 3 } });
    r.run(BAR_SEC * 2.5);
    const s = sinks(r);
    const all = [...PLAZA_NAMES, ...REGION_NAMES];
    const cancels = all.map((n) => s[n].cancelCalls);
    const levels = all.map((n) => s[n].levels.length);
    r.mixer.setAudible(false);
    all.forEach((n, i) => expect(s[n].cancelCalls, `${n} 취소`).toBeGreaterThan(cancels[i]!));
    expect(r.audio.debug().running).toBe(false);
    const requests = REGION_NAMES.map((n) => s[n].requests.length);
    r.run(BAR_SEC * 3);
    REGION_NAMES.forEach((n, i) => expect(s[n].requests.length, `${n} 꺼진 동안`).toBe(requests[i]));
    r.mixer.setAudible(true);
    r.run(0.1);
    all.forEach((n, i) => expect(s[n].levels.length, `${n} 다시 켬`).toBe(levels[i]! + 1));
    for (const lv of levelOf(r, 'beat-river')) expect(lv).toEqual(OPEN);
    r.run(BAR_SEC * 3);
    expect(s.river.requests.length).toBeGreaterThan(requests[REGION_NAMES.indexOf('river')]!);
  });

  it('탭이 숨겨지면 멈추고 예약을 지운다', () => {
    const r = rig({ at: 'bell-grove', layers: { 'bell-grove': 3 } });
    r.run(BAR_SEC * 2.5);
    const s = sinks(r);
    const n = s.wind.requests.length;
    const cancels = s.wind.cancelCalls;
    r.visibility.set(true);
    expect(s.wind.cancelCalls).toBeGreaterThan(cancels);
    r.run(BAR_SEC * 4);
    expect(s.wind.requests.length).toBe(n);
    r.visibility.set(false);
    r.run(BAR_SEC * 3);
    expect(s.wind.requests.length).toBeGreaterThan(n);
  });

  it('W-11: 소리를 켜기 전에는 새 소리 받이에도 예약이 없다', () => {
    const r = rig({ audible: false, at: 'beat-river', layers: { 'beat-river': 3 } });
    r.run(BAR_SEC * 4);
    for (const q of r.mixer.allSinks) {
      expect(q.requests).toEqual([]);
      expect(q.levels).toEqual([]);
    }
  });
});

describe('표지의 소리: 건반 늪의 기준음 탑은 A4를 낮게 울린다(7-4, 3.5)', () => {
  // 기준음 탑의 자리는 composition이 지역 파일에서 읽어 넘긴다. 여기서는 시험용 자리를 직접 준다
  const TOWER = { regionId: 'key-marsh' as const, midi: 69, x: 2300, y: 5750 };

  /** landmarks에 null을 주면 표지를 넘기지 않는다(undefined는 기본값으로 바뀌므로 쓰지 않는다) */
  function hum(listener: { x: number; y: number }, landmarks: Array<typeof TOWER> | null = [TOWER]) {
    const clock = new FakeClock(T0);
    const world = new WorldClock(clock, T0);
    const timer = new FakeTimer();
    const mixer = new FakeWorldMixer(clock);
    mixer.audible = true;
    const audio = new WorldAudio({
      mixer,
      clock: world,
      timer,
      stations: [],
      ...(landmarks ? { landmarks } : {}),
      reaction: () => ({ villageLayer: 0, regionLayers: {}, lanterns: {} }),
      listener: () => ({ x: listener.x, y: listener.y, regionId: 'key-marsh' as RegionId }),
      visibility: new FakeVisibility(),
    });
    const run = (sec: number): void => {
      const end = clock.t + sec;
      while (clock.t < end - 1e-9) {
        clock.t = Math.min(end, clock.t + 0.025);
        timer.fire();
      }
    };
    // 서명 소리 받이는 처음 쓸 때 신청한다. 울림은 fork 음색, 좌우를 나누는 서명 버스다
    const fork = () => mixer.registered.find((q) => q.options.timbre === 'fork');
    return { audio, run, fork, mixer };
  }

  it('A4 한 마디짜리 긴 음을 마디마다 하나씩, 탑 곁에서는 온 세기에 가깝게 울린다', () => {
    const h = hum({ x: 2300, y: 5750 });
    h.run(BAR_SEC * 4);
    const reg = h.fork()!;
    expect(reg.bus).toBe('worldSignature');
    expect(reg.options.pan).toBe(true);
    const bars = reg.sink.requests.map((q) => barOf(q.time));
    expect(bars.length).toBeGreaterThanOrEqual(4);
    expect(new Set(bars).size).toBe(bars.length); // 마디마다 하나
    for (const q of reg.sink.requests) {
      expect(q.midi).toBe(69);
      expect(q.duration).toBeCloseTo(BAR_SEC, 9);
      expect(beatOf(q.time)).toBe(0);
      expect(q.velocity).toBeCloseTo(landmarkNotes(TOWER)[0]!.velocity, 9);
    }
    const rec = h.audio.debug().landmarkRings;
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.every((x) => x.regionId === 'key-marsh' && x.gain === 1)).toBe(true);
  });

  it('900 px 밖에서는 들리지 않고, 안에서는 서명 소리와 같은 거리 감쇠로 작아진다', () => {
    const far = hum({ x: 2300 + 901, y: 5750 });
    far.run(BAR_SEC * 4);
    expect(far.fork()?.sink.requests ?? []).toEqual([]);
    expect(far.audio.debug().landmarkRings).toEqual([]);
    const mid = hum({ x: 2300 - 450, y: 5750 });
    mid.run(BAR_SEC * 4);
    const g = hearGain(450);
    expect(g).toBeCloseTo(0.25, 9);
    const q = mid.fork()!.sink.requests[0]!;
    expect(q.velocity).toBeCloseTo(landmarkNotes(TOWER)[0]!.velocity * g, 6);
    // 탑이 오른쪽에 있으니 소리는 오른쪽으로 치우친다
    expect(mid.fork()!.sink.requests[0]!.pan ?? 0).toBeGreaterThan(0);
  });

  it('표지를 넘기지 않으면 표지의 소리는 없다', () => {
    const none = hum({ x: 2300, y: 5750 }, null);
    none.run(BAR_SEC * 4);
    expect(none.fork()).toBeUndefined();
    expect(none.audio.debug().landmarkRings).toEqual([]);
  });

  it('이 시험이 쓰는 기준음 탑은 LANDMARK_SOUNDS와 같다(건반 늪, A4)', () => {
    expect(LANDMARK_SOUNDS).toEqual([{ regionId: 'key-marsh', midi: 69 }]);
  });
});
