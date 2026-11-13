// 7-4 세 지역(오선 언덕, 음계 길, 건반 늪)의 바탕 소리, 소리 층, 기준음 탑의 소리(설계서 6.2, 8.1, 3.5, 12.10) 흐름 시험(실제 Chrome, 진짜 오디오 출력).
// 이 파일이 보는 것:
//  - 새 음색(산들바람, 풀 소리, 안개 소리, 가락 lead, 달리는 음 run, 꾸밈음 spark, 기준음 탑 fork)이 진짜 오디오 장치에서 소리를 내고, 자연음은 화음 깔기와 비슷한 세기다(D-173의 방법)
//  - 세 지역에서 소리 층이 오르면 그 지역의 성부(가락, 달리는 음, 꾸밈음)가 더해진다: 통과 기록을 심은 저장(2층, 3층)과, 음계 길에서 과제를 실제로 풀어 0층에서 1층으로 오르는 것
//  - 앱이 예약한 마디의 음 수는 도메인의 계산(그 지역, 그 층, 8마디 되풀이 가운데 그 마디)과 같다
//  - 건반 늪의 기준음 탑은 900 px 안에서만 울리고, 가까울수록 크며, 탑이 있는 쪽으로 좌우가 기운다
// 지역 바탕과 경계의 넘나듦(다섯 지역 모두)은 phase6-layers.flow.ts가, 새 놀이 악기 셋은 phase6-play.flow.ts가 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 상태는 미리보기 채널의 window.__game으로 읽는다.
// 소리의 크기와 질감이 듣기 좋은지, 가락이 노래로 들리는지, 안개와 풀 소리가 자연스러운지는 사람의 귀로 확인한다(docs/approvals.md의 '사람 확인 대기').
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BEAT_SEC, LANDMARK_SOUNDS, LOOP_BARS, barInLoop, landmarkNotes, melodyNotes, ornamentNotes, regionBedBar, runnerNotes } from '@/domain/worldsound';
import type { WorldNote } from '@/domain/worldsound';
import type { RegionId } from '@/domain/world';
import { command, pos } from './game';
import { startHarness, type Harness } from './harness';
import { boot as bootWith, mixerState, peakOver, pretendHidden, probe, sound, standQuiet, turnSoundOn, until, wait } from './soundTools';
import type { GameCtx, Probe, RegionBarLike, SoundDebug } from './soundTools';
import { seedSave } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const boot = () => bootWith(h);
const LONG = 300_000;

type NewRegion = 'staff-hill' | 'scale-trail' | 'key-marsh';

/** 앱이 예약한 지역의 마디가 도메인의 계산과 같다: 그 지역, 그 층, 8마디 되풀이 가운데 그 마디의 긴 화음, 자연음, 성부의 음 수 */
const expectedBar = (b: RegionBarLike): { chord: number; nature: number; part: number } => {
  const bar = regionBedBar(b.regionId as RegionId, barInLoop(b.bar), b.layer)!;
  return { chord: bar.chord.length, nature: bar.nature.length, part: bar.part.length };
};

const dbOf = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));

describe('7-4 새 음색이 진짜 오디오 장치에서 소리를 낸다', () => {
  it(
    '산들바람, 풀 소리, 안개 소리, 가락, 달리는 음, 꾸밈음, 기준음 탑의 소리를 하나씩 넣어 보면 출력에 소리가 실린다. 자연음은 화음 깔기와 비슷한 세기(±12 dB)이고 앱은 오류 없이 돈다',
    async () => {
      const { ctx, page, errors } = await boot();
      // 모든 지역에 바탕 소리가 깔려 조용한 지역이 없다: 소리를 켠 뒤 탭이 가려진 것처럼 해서 세계 소리를 멈추고(오디오 장치는 그대로 돈다) 음색을 하나씩 잰다
      await standQuiet(page, 'staff-hill');
      await turnSoundOn(page);
      await until(() => sound(page), (s) => s.running, '세계 소리가 돎');
      await pretendHidden(page, true);
      await until(() => sound(page), (s) => !s.running, '탭이 가려지면 세계 소리가 멈춤');
      await wait(2500);
      const silence = await peakOver(page, 1500);
      expect(silence, '시험 전에는 조용하다').toBeLessThan(0.0005);

      // 앱이 실제로 내는 음과 같은 세기와 길이: 도메인이 정한 음에서 읽는다
      const asProbe = (timbre: string, bus: Probe['bus'], n: WorldNote, pan = false): Probe => ({ timbre, bus, midi: n.midi, velocity: n.velocity, duration: n.beats * BEAT_SEC, ...(pan ? { pan: true } : {}) });
      const nature = (id: NewRegion): WorldNote => regionBedBar(id, 0, 0)!.nature[0]!;
      // 꾸밈음이 놓인 마디는 합주 설계(D-246)가 정한다: 어느 마디인지 시험이 박아 두지 않고 1층에서 처음 꾸미는 마디의 음(앞꾸밈, 목표음)을 읽는다
      const firstOrnament = (): WorldNote[] => Array.from({ length: LOOP_BARS }, (_, bar) => ornamentNotes(bar, 'last')).find((notes) => notes.length > 0)!;
      const probes: Array<[string, Probe]> = [
        ['pad', { timbre: 'pad', bus: 'worldBed', midi: 55, velocity: 0.35, duration: 2.9 }], // 비교의 기준: 6-8과 같은 화음 깔기
        ['breeze', asProbe('breeze', 'worldBed', nature('staff-hill'))],
        ['grass', asProbe('grass', 'worldBed', nature('scale-trail'))],
        ['mist', asProbe('mist', 'worldBed', nature('key-marsh'))],
        ['lead', asProbe('lead', 'worldLayer', melodyNotes(0, 'full')[0]!)],
        ['run', asProbe('run', 'worldLayer', runnerNotes(3, 'rise')[0]!)],
        ['spark', asProbe('spark', 'worldLayer', firstOrnament()[1]!)],
        ['fork', asProbe('fork', 'worldSignature', landmarkNotes(LANDMARK_SOUNDS[0]!)[0]!, true)],
      ];
      const peaks: Record<string, number> = {};
      const levels: Record<string, number> = {};
      for (const [name, p] of probes) {
        const m = await probe(page, p);
        peaks[name] = m.peak;
        levels[name] = m.rms;
      }
      const fmt = (r: Record<string, number>, f: (v: number) => number): string => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(f(v).toFixed(4))])));
      console.log(`[phase7-regions] 음색별 출력 최댓값(−1~1): ${fmt(peaks, (v) => v)}`);
      console.log(`[phase7-regions] 음색별 출력 세기(RMS, dBFS): ${fmt(levels, dbOf)}`);
      console.log(`[phase7-regions] 버스 크기(dB): ${JSON.stringify(await mixerState(page))}`);
      for (const [name, peak] of Object.entries(peaks)) {
        expect(peak, `${name}의 출력`).toBeGreaterThan(0.002);
        expect(peak, `${name}이 터지지 않는다`).toBeLessThan(0.9);
      }
      // 자연음은 화음 깔기와 비슷한 세기로 들린다(12 dB를 넘게 작거나 크지 않다): 너무 작아 안 들리거나 화음을 덮지 않는다
      for (const name of ['breeze', 'grass', 'mist']) {
        const ratio = levels[name]! / levels['pad']!;
        console.log(`[phase7-regions] ${name}의 세기는 화음 깔기의 ${(20 * Math.log10(ratio)).toFixed(1)} dB`);
        expect(ratio, `${name}이 화음 깔기보다 12 dB 넘게 작다`).toBeGreaterThan(0.25);
        expect(ratio, `${name}이 화음 깔기보다 12 dB 넘게 크다`).toBeLessThan(4);
      }
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

interface LayerCase {
  regionId: NewRegion;
  part: string;
  /** 이 지역에만 놓인 과제들(마을에 놓인 과제는 빼서 마을의 층이 함께 오르지 않게 한다) */
  quests: string[];
}
const LAYER_CASES: LayerCase[] = [
  { regionId: 'staff-hill', part: '가락', quests: ['staff.lines-and-spaces', 'staff.ledger-lines', 'staff.middle-c-neighbors'] },
  { regionId: 'scale-trail', part: '달리는 음', quests: ['scale.natural-minor', 'scale.harmonic-minor', 'scale.pentatonic'] },
  { regionId: 'key-marsh', part: '꾸밈음', quests: ['key.black-key-names', 'key.whole-and-half-steps', 'key.build-intervals'] },
];

describe('7-4 세 지역의 소리 층: 층이 오르면 그 지역의 성부가 더해진다', () => {
  for (const c of LAYER_CASES) {
    for (const layer of [2, 3] as const) {
      it(
        `${c.regionId}: 이 지역의 과제 ${layer}개를 통과한 저장은 ${layer}층이고, 서면 이 지역의 성부(${c.part})가 층에 맞게 예약된다. 진짜 출력에 소리가 실린다`,
        async () => {
          const { ctx, page, errors } = await boot();
          await seedSave(page, { passed: c.quests.slice(0, layer) });
          await standQuiet(page, c.regionId);
          await turnSoundOn(page);
          const s = await until(
            () => sound(page),
            (x) => x.running && x.audibleRegions.includes(c.regionId) && x.regionBars.some((b) => b.regionId === c.regionId && b.part > 0),
            `${c.regionId}의 성부(${c.part})가 예약됨`,
            60000,
          );
          expect(s.audibleRegions).toEqual([c.regionId]);
          const bars = s.regionBars.filter((b) => b.regionId === c.regionId);
          for (const b of bars) {
            expect(b.layer, `마디 ${b.bar}의 층`).toBe(layer);
            expect(b, `마디 ${b.bar}가 도메인의 계산과 같다`).toMatchObject(expectedBar(b));
            expect(b.nature).toBe(1);
          }
          expect(bars.some((b) => b.part > 0), `성부(${c.part})가 더해진 마디가 있다`).toBe(true);
          const peak = await peakOver(page, 4500);
          console.log(`[phase7-regions] ${c.regionId} ${layer}층 출력 최댓값 ${peak.toFixed(4)}, 성부 음 수 ${JSON.stringify(bars.map((b) => b.part))}`);
          expect(peak, '출력에 소리가 실려 있다').toBeGreaterThan(0.0008);
          expect(peak).toBeLessThan(0.9);
          expect(errors).toEqual([]);
          await ctx.close();
        },
        LONG,
      );
    }
  }

  const solveQ07 = (page: Page): Promise<{ passed: boolean }> =>
    page.evaluate(() => {
      const c = (window as unknown as { __game: GameCtx }).__game.controller;
      c.open('scale.major', 'c-major');
      const notes: Array<[string, number]> = [['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5]];
      notes.forEach(([letter, octave], i) => c.edit({ type: 'setSlot', slot: i + 1, writtenPitch: { letter, accidental: null, octave } }));
      return { passed: c.check().passed };
    });

  it(
    '음계 길에서 소리를 켜고 서 있다가 과제 Q07(장음계)을 풀면 다음 마디부터 달리는 음이 더해진다. 이전 마디는 그대로다',
    async () => {
      const { ctx, page, errors } = await boot();
      await standQuiet(page, 'scale-trail');
      await turnSoundOn(page);
      const before = await until(() => sound(page), (s) => s.running && s.audibleRegions.includes('scale-trail') && s.regionBars.length >= 2, '음계 길의 바탕 소리가 돎');
      for (const b of before.regionBars) expect(b, `마디 ${b.bar}`).toMatchObject({ regionId: 'scale-trail', layer: 0, part: 0 });
      expect((await solveQ07(page)).passed).toBe(true);
      // 음계 길의 정거장 S1에 놓인 과제라서 통과하면 음계 길이 1층이 된다
      const raised = await until(() => sound(page), (s) => s.regionBars.some((b) => b.regionId === 'scale-trail' && b.layer === 1), '음계 길의 층이 오른 마디가 예약됨', 40000);
      const layer1 = raised.regionBars.filter((b) => b.regionId === 'scale-trail' && b.layer === 1);
      for (const b of layer1) expect(b, `마디 ${b.bar}가 도메인의 계산과 같다`).toMatchObject(expectedBar(b));
      // 1층의 달리는 음은 8마디 되풀이의 넷째와 여덟째 마디에만 있다(오름 음계 8음)
      for (const b of layer1) expect(b.part, `마디 ${b.bar}`).toBe(barInLoop(b.bar) === 3 || barInLoop(b.bar) === 7 ? 8 : 0);
      // 이전 층으로 예약한 마디는 그대로 남아 있다(이미 예약한 마디는 바뀌지 않는다)
      for (const b of raised.regionBars.filter((x) => x.regionId === 'scale-trail' && x.layer === 0)) expect(b.part).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-4 건반 늪의 기준음 탑: 900 px 안에서만 A4가 마디마다 울린다', () => {
  it(
    '탑에서 멀면 울리지 않는다. 탑 곁(동쪽 325 px)에 서면 마디마다 울리고, 소리 크기는 거리에 따라 줄며 좌우는 탑이 있는 왼쪽으로 기운다. 멀어지면 더 울리지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      await standQuiet(page, 'key-marsh'); // 탑에서 900 px 넘게 떨어진 자리
      await turnSoundOn(page);
      const far = await until(() => sound(page), (s) => s.running && s.audibleRegions.includes('key-marsh') && s.regionBars.length >= 2, '건반 늪의 바탕 소리가 돎');
      const tower = { x: 2300, y: 5750 };
      const p0 = await pos(page);
      expect(Math.hypot(p0.x - tower.x, p0.y - tower.y), '탑에서 멀리 떨어진 자리').toBeGreaterThan(900);
      expect(far.landmarkRings, '멀면 탑이 울리지 않는다').toEqual([]);

      // 탑의 동쪽 325 px: 걸어서 닿는 자리
      await command(page, { type: 'teleport', x: 2625, y: 5750 });
      await until(() => pos(page), (p) => Math.hypot(p.x - 2625, p.y - 5750) < 200, '캐릭터가 탑 곁에 선다', 20000);
      const near = await until(() => sound(page), (s) => s.landmarkRings.length >= 2, '탑이 울린다', 30000);
      const p1 = await pos(page);
      const d = Math.hypot(tower.x - p1.x, tower.y - p1.y);
      const dx = tower.x - p1.x;
      expect(d, '탑에서 900 px 안').toBeLessThan(900);
      const lastRings = near.landmarkRings.filter((r) => r.time > 0).slice(-2);
      for (const r of lastRings) {
        expect(r.regionId).toBe('key-marsh');
        // 서명 소리와 같은 거리 감쇠: (1 − d/900)². 걷는 동안 조금 달라질 수 있어 넉넉히 본다
        expect(r.gain, `울림 ${r.bar}마디의 크기`).toBeGreaterThan(Math.pow(1 - (d + 150) / 900, 2));
        expect(r.gain).toBeLessThan(Math.pow(Math.max(0, 1 - (d - 150) / 900), 2) + 0.01);
        // 탑이 소리 듣는 쪽의 왼쪽(dx < 0)에 있으면 왼쪽으로 기운다
        expect(Math.sign(r.pan), `울림 ${r.bar}마디의 좌우`).toBe(Math.sign(dx));
      }
      expect(near.landmarkRings.map((r) => r.bar), '마디마다 이어서 울린다').toEqual(near.landmarkRings.map((r) => r.bar).sort((a, b) => a - b));

      // 멀어지면 더 울리지 않는다
      await standQuiet(page, 'key-marsh');
      await until(() => pos(page), (p) => Math.hypot(p.x - tower.x, p.y - tower.y) > 900, '탑에서 멀어진다', 20000);
      const left = await sound(page);
      const lastBar = Math.max(...left.landmarkRings.map((r) => r.bar));
      await wait(7000); // 두 마디 넘게
      const after = await sound(page);
      expect(Math.max(...after.landmarkRings.map((r) => r.bar)), '멀어진 뒤에는 더 울리지 않는다').toBe(lastBar);
      expect(mixerStateOk(await mixerState(page))).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

const mixerStateOk = (m: { state: string; muted: boolean }): boolean => m.state === 'on' && !m.muted;

// 타입만 쓰이는 이름을 유지한다(SoundDebug는 상태를 읽는 시험이 늘 때 쓴다)
export type { SoundDebug };
