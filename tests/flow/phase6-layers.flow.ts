// 6-8 두 지역의 바탕 소리와 소리 층, 광장 합주에 타악과 베이스(설계서 6.2, 8.1, 12.9) 흐름 시험(실제 Chrome, 진짜 오디오 출력).
// 완료 기준: "층이 오르면 광장 합주가 달라진다". 이 파일이 보는 것:
//  - 새 음색(타악 tick, 베이스 bass, 강물과 바람의 자연음)이 진짜 오디오 장치에서 소리를 내고, 앱이 오류 없이 돈다
//  - 박자 강가의 과제(Q02)를 통과하면 마을의 광장 합주에 타악이, 종나무 숲의 과제(Q05)를 통과하면 베이스가 다음 마디부터 더해진다
//  - 지역의 바탕 소리는 그 지역 안에서만 들리고(7-4부터 마을 밖 다섯 지역 모두), 경계를 넘으면 닫히고 돌아오면 다시 들린다
// 7-4에서 오선 언덕, 음계 길, 건반 늪에도 바탕 소리가 깔려서 '조용한 지역'이 없어졌다. 그래서 음색을 하나씩 재는 시험은 탭이 가려진 것처럼 해서(pretendHidden)
// 세계 소리를 멈춘 채로 재고, 마을을 벗어나는 시험은 '출력이 조용해진다' 대신 '광장 합주가 닫히고 그 지역의 바탕이 열린다'를 상태와 예약 기록으로 본다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 상태는 미리보기 채널의 window.__game으로 읽는다.
// 소리의 크기와 질감이 듣기 좋은지, 강물과 바람이 자연스러운지는 사람의 귀로 확인한다(docs/approvals.md의 '사람 확인 대기').
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { barInLoop, regionBedBar } from '@/domain/worldsound';
import type { RegionId } from '@/domain/world';
import { startHarness, type Harness } from './harness';
import { completeQ02 } from './panelTools';
import { boot as bootWith, mixerState, peakOver, pretendHidden, probe, sound, standQuiet, turnSoundOn, until, wait } from './soundTools';
import type { GameCtx, Probe, RegionBarLike, SoundDebug } from './soundTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const boot = () => bootWith(h);
const LONG = 300_000;
const Q02_HASH = '#/q/rhythm.rest-in-a-bar/quarter-rest';

/** 마디 하나의 화음 깔기 음 수(마을의 소리 층 0–3): 없음, 온음표 화음(셋), 2분음표 화음(여섯), 4분음표 펼침(넷) */
const BED_NOTES = [0, 3, 6, 4];
const PERCUSSION_NOTES = [0, 1, 4, 8];
const BASS_NOTES = [0, 1, 2, 4];

/** 박자 강가의 과제(Q02)를 주소로 열어 마우스로 풀고 월드로 돌아온다. 통과하면 박자 강가의 소리 층이 오른다 */
async function passQ02(page: Page): Promise<void> {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, Q02_HASH);
  await page.waitForSelector('button.material', { timeout: 20000 });
  await completeQ02(page, 'mouse');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.hud', { timeout: 15000 });
}

/** 종나무 숲의 과제(Q05, 도 미 솔)를 풀어 통과시킨다. 통과하면 종나무 숲의 소리 층이 오른다 */
const passQ05 = (page: Page): Promise<{ passed: boolean }> =>
  page.evaluate(() => {
    const c = (window as unknown as { __game: GameCtx }).__game.controller;
    c.open('chord.major-triad', 'c-major');
    const notes: Array<[string, number]> = [['C', 4], ['E', 4], ['G', 4]];
    notes.forEach(([letter, octave], i) => c.edit({ type: 'setSlot', slot: i + 1, writtenPitch: { letter, accidental: null, octave } }));
    return { passed: c.check().passed };
  });

describe('6-8 새 음색이 진짜 오디오 장치에서 소리를 낸다', () => {
  it(
    '타악, 베이스, 화음 깔기, 강물 소리, 바람 소리를 하나씩 넣어 보면 출력에 소리가 실린다. 앱은 오류 없이 돈다',
    async () => {
      const { ctx, page, errors } = await boot();
      // 7-4부터 마을 밖 모든 지역에 바탕 소리가 깔려 조용한 지역이 없다. 소리를 켠 뒤 탭이 가려진 것처럼 해서 세계 소리를 멈추고(오디오 장치는 그대로 돈다) 음색을 하나씩 잰다
      await standQuiet(page, 'staff-hill');
      await turnSoundOn(page);
      await until(() => sound(page), (s) => s.running, '세계 소리가 돎');
      await pretendHidden(page, true);
      await until(() => sound(page), (s) => !s.running, '탭이 가려지면 세계 소리가 멈춤');
      await wait(2500); // 이미 울리던 음이 사라질 때까지
      const silence = await peakOver(page, 1500);
      expect(silence, '시험 전에는 조용하다').toBeLessThan(0.0005);

      // 앱이 실제로 내는 음과 같은 세기와 길이(마디 4박 = 3초, 0.9박 = 0.675초)
      const probes: Probe[] = [
        { timbre: 'thump', bus: 'worldLayer', midi: 36, velocity: 0.5, duration: 0.3 },
        { timbre: 'pad', bus: 'worldLayer', midi: 48, velocity: 0.5, duration: 2.9 },
        { timbre: 'tick', bus: 'worldLayer', midi: 84, velocity: 0.6, duration: 0.09 },
        { timbre: 'bass', bus: 'worldLayer', midi: 43, velocity: 0.55, duration: 0.675 },
        { timbre: 'pad', bus: 'worldBed', midi: 55, velocity: 0.35, duration: 2.9 },
        { timbre: 'river', bus: 'worldBed', midi: 83, velocity: 0.5, duration: 3 },
        { timbre: 'wind', bus: 'worldBed', midi: 60, velocity: 0.5, duration: 3 },
      ];
      const peaks: Record<string, number> = {};
      const levels: Record<string, number> = {};
      for (const p of probes) {
        const m = await probe(page, p);
        peaks[`${p.bus}:${p.timbre}`] = m.peak;
        levels[`${p.bus}:${p.timbre}`] = m.rms;
      }
      const fmt = (r: Record<string, number>, f: (v: number) => number): string => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(f(v).toFixed(4))])));
      console.log(`[phase6-layers] 음색별 출력 최댓값(−1~1): ${fmt(peaks, (v) => v)}`);
      console.log(`[phase6-layers] 음색별 출력 세기(RMS, dBFS): ${fmt(levels, (v) => 20 * Math.log10(Math.max(v, 1e-9)))}`);
      console.log(`[phase6-layers] 버스 크기(dB): ${JSON.stringify(await mixerState(page))}`);
      for (const [name, peak] of Object.entries(peaks)) {
        expect(peak, `${name}의 출력`).toBeGreaterThan(0.002);
        expect(peak, `${name}이 터지지 않는다`).toBeLessThan(0.9);
      }
      // 자연음은 화음 깔기와 비슷한 세기로 들린다(바탕 버스에서 12 dB를 넘게 작거나 크지 않다): 너무 작아 안 들리거나 화음을 덮지 않는다
      const bedChord = levels['worldBed:pad']!;
      for (const nature of ['worldBed:river', 'worldBed:wind']) {
        const ratio = levels[nature]! / bedChord;
        console.log(`[phase6-layers] ${nature}의 세기는 화음 깔기의 ${(20 * Math.log10(ratio)).toFixed(1)} dB`);
        expect(ratio, `${nature}이 화음 깔기보다 12 dB 넘게 작다`).toBeGreaterThan(0.25);
        expect(ratio, `${nature}이 화음 깔기보다 12 dB 넘게 크다`).toBeLessThan(4);
      }
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('6-8 층이 오르면 광장 합주가 달라진다(완료 기준)', () => {
  it(
    '마을의 광장 합주: 층 0은 맥박뿐, 박자 강가 과제(Q02)를 통과하면 타악이, 종나무 숲 과제(Q05)를 통과하면 베이스가 다음 마디부터 더해진다',
    async () => {
      const { ctx, page, errors } = await boot();
      await standQuiet(page, 'village'); // 서명 소리가 닿지 않는 자리: 광장 합주만 들린다
      await turnSoundOn(page);
      const s0 = await until(() => sound(page), (s) => s.running && s.plazaAudible && s.plazaBars.length >= 2, '광장 합주가 돎');
      for (const b of s0.plazaBars) {
        expect(b.layers, `마디 ${b.bar}`).toEqual({ village: 0, melody: 0, percussion: 0, bass: 0, runner: 0, ornament: 0 });
        expect([b.bed, b.percussion, b.bass, b.melody, b.runner, b.ornament], `마디 ${b.bar}의 화음 깔기, 타악, 베이스, 가락, 달리는 음, 꾸밈음`).toEqual([0, 0, 0, 0, 0, 0]);
        expect(b.pulse).toBe(4);
      }
      const peak0 = await peakOver(page, 4500);
      expect(peak0).toBeGreaterThan(0.002);

      // 박자 강가의 과제를 통과한다: 타악이 첫 박에 더해진다
      await passQ02(page);
      const fromQ02 = await until(() => sound(page), (s) => s.plazaBars.some((b) => b.layers.percussion === 1), 'Q02를 통과한 뒤 새 층으로 합주가 예약됨', 30000);
      const withPercussion = fromQ02.plazaBars.filter((b) => b.layers.percussion === 1);
      expect(withPercussion.length).toBeGreaterThanOrEqual(1);
      for (const b of withPercussion) {
        expect(b.percussion, `마디 ${b.bar}의 타악`).toBe(PERCUSSION_NOTES[1]);
        expect(b.bass).toBe(0);
        expect([b.melody, b.runner, b.ornament], `마디 ${b.bar}: 이 과제는 가락, 달리는 음, 꾸밈음의 지역에 놓이지 않았다`).toEqual([0, 0, 0]);
        expect(b.bed, `마디 ${b.bar}의 화음 깔기(마을 층 ${b.layers.village})`).toBe(BED_NOTES[b.layers.village]);
      }
      // 이전 층으로 예약한 마디는 그대로 남아 있다(이미 예약한 마디는 바뀌지 않는다)
      for (const b of fromQ02.plazaBars.filter((x) => x.layers.percussion === 0)) expect(b.percussion).toBe(0);
      const peak1 = await peakOver(page, 4500);
      console.log(`[phase6-layers] 광장 합주 출력 최댓값: 층 0 ${peak0.toFixed(4)} → 타악 더함 ${peak1.toFixed(4)}`);
      expect(peak1).toBeGreaterThan(0.002);
      expect(peak1).toBeLessThan(0.9);

      // 종나무 숲의 과제를 통과한다: 베이스가 온음표 근음으로 더해진다. 타악은 그대로다
      expect((await passQ05(page)).passed).toBe(true);
      const fromQ05 = await until(() => sound(page), (s) => s.plazaBars.some((b) => b.layers.bass === 1), 'Q05를 통과한 뒤 새 층으로 합주가 예약됨', 30000);
      const withBass = fromQ05.plazaBars.filter((b) => b.layers.bass === 1);
      expect(withBass.length).toBeGreaterThanOrEqual(1);
      for (const b of withBass) {
        expect(b.bass, `마디 ${b.bar}의 베이스`).toBe(BASS_NOTES[1]);
        expect(b.percussion).toBe(PERCUSSION_NOTES[b.layers.percussion]);
        expect(b.layers.percussion).toBe(1);
      }
      const peak2 = await peakOver(page, 4500);
      console.log(`[phase6-layers] → 베이스 더함 ${peak2.toFixed(4)}`);
      expect(peak2).toBeGreaterThan(0.002);
      expect(peak2).toBeLessThan(0.9);

      // 같은 자리의 마디가 층에 따라 달라졌음이 합주 기록에 남는다: 층 상태가 셋이고 음 수의 합이 늘었다
      const total = (b: SoundDebug['plazaBars'][number]): number => b.pulse + b.bed + b.percussion + b.bass + b.melody + b.runner + b.ornament;
      const finalBars = fromQ05.plazaBars;
      const byState = new Map<string, number>();
      for (const b of finalBars) byState.set(JSON.stringify(b.layers), total(b));
      expect(byState.size).toBeGreaterThanOrEqual(2);
      expect(Math.max(...byState.values())).toBeGreaterThan(Math.min(...byState.values()));
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

interface BedCase {
  regionId: 'staff-hill' | 'beat-river' | 'bell-grove' | 'scale-trail' | 'key-marsh';
  nature: string;
}
const BED_CASES: BedCase[] = [
  { regionId: 'staff-hill', nature: '산들바람 소리' },
  { regionId: 'beat-river', nature: '강물 소리' },
  { regionId: 'bell-grove', nature: '바람 소리' },
  { regionId: 'scale-trail', nature: '풀 소리' },
  { regionId: 'key-marsh', nature: '안개 소리' },
];

/** 앱이 예약한 지역의 마디가 도메인의 계산과 같다: 그 지역, 그 층, 8마디 되풀이 가운데 그 마디의 긴 화음, 자연음, 성부의 음 수 */
const expectedBar = (b: RegionBarLike): { chord: number; nature: number; part: number } => {
  const bar = regionBedBar(b.regionId as RegionId, barInLoop(b.bar), b.layer)!;
  return { chord: bar.chord.length, nature: bar.nature.length, part: bar.part.length };
};
const lastBarOf = (s: SoundDebug, regionId: string): number => Math.max(-1, ...s.regionBars.filter((b) => b.regionId === regionId).map((b) => b.bar));

describe('6-8, 7-4 지역의 바탕 소리는 그 지역 안에서만, 경계에서 2초에 걸쳐(8.1)', () => {
  for (const c of BED_CASES) {
    it(
      `${c.regionId}: 들어서면 ${c.nature}와 긴 화음이 예약된다. 마을로 벗어나면 이 지역의 바탕은 닫히고 광장 합주가 열리며, 돌아오면 다시 들린다`,
      async () => {
        const { ctx, page, errors } = await boot();
        await standQuiet(page, c.regionId);
        await turnSoundOn(page);
        const inside0 = await until(() => sound(page), (s) => s.running && s.audibleRegions.includes(c.regionId) && s.regionBars.length >= 2, `${c.regionId}의 바탕 소리가 돎`);
        expect(inside0.audibleRegions).toEqual([c.regionId]);
        expect(inside0.plazaAudible).toBe(false);
        expect(inside0.plazaBars).toEqual([]); // 마을 밖에서는 광장 합주를 예약하지 않는다
        for (const b of inside0.regionBars) {
          expect(b, `마디 ${b.bar}`).toMatchObject({ regionId: c.regionId, layer: 0, part: 0, nature: 1 });
          expect(b.chord, `마디 ${b.bar}의 긴 화음`).toBeGreaterThan(0);
          expect(b, `마디 ${b.bar}가 도메인의 계산과 같다`).toMatchObject(expectedBar(b));
        }
        const inside = await peakOver(page, 4500);
        console.log(`[phase6-layers] ${c.regionId} 안 출력 최댓값 ${inside.toFixed(4)}`);
        expect(inside, '출력에 바탕 소리가 실려 있다').toBeGreaterThan(0.0008);
        expect(inside).toBeLessThan(0.9);

        // 마을로 벗어난다: 이 지역의 바탕 소리는 닫히고 광장 합주가 열린다. 이 지역의 바탕은 더 예약되지 않고 광장 합주가 예약된다
        await standQuiet(page, 'village');
        await until(() => sound(page), (s) => s.audibleRegions.includes('village') && !s.audibleRegions.includes(c.regionId), '벗어나면 이 지역의 바탕이 닫히고 광장 합주가 열림', 15000);
        const left = await sound(page);
        expect(left.audibleRegions).toEqual(['village']);
        const lastBar = lastBarOf(left, c.regionId);
        await wait(4000); // 서서히 줄어드는 2초 + 이미 예약한 음의 끝 울림(자연음 1.5초)
        const away = await sound(page);
        expect(lastBarOf(away, c.regionId), '벗어난 지역의 바탕은 더 예약되지 않는다').toBe(lastBar);
        expect(away.plazaBars.length, '광장 합주가 예약된다').toBeGreaterThan(0);
        const outside = await peakOver(page, 4500);
        console.log(`[phase6-layers] ${c.regionId} 안 ${inside.toFixed(4)} → 마을(광장 합주) ${outside.toFixed(4)}`);
        expect(outside).toBeLessThan(0.9);

        // 돌아오면 다시 들린다
        await standQuiet(page, c.regionId);
        await until(() => sound(page), (s) => s.audibleRegions.includes(c.regionId) && !s.audibleRegions.includes('village') && lastBarOf(s, c.regionId) > lastBar, '돌아오면 바탕 소리가 다시 들림', 20000);
        await wait(3500);
        const back = await peakOver(page, 4500);
        console.log(`[phase6-layers] 돌아온 뒤 ${back.toFixed(4)}`);
        expect(back).toBeGreaterThan(inside * 0.5);
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }

  it(
    '두 바탕 지역 사이를 곧바로 건너가면 한쪽 소리는 닫히고 다른 쪽 소리가 열린다. 소리 층이 오르면 그 지역의 성부가 더해진다',
    async () => {
      const { ctx, page, errors } = await boot();
      await standQuiet(page, 'beat-river');
      await turnSoundOn(page);
      await until(() => sound(page), (s) => s.running && s.audibleRegions.includes('beat-river') && s.regionBars.length >= 2, '박자 강가의 바탕 소리가 돎');
      // 박자 강가의 과제를 통과한다: 그 지역의 성부(타악 첫 박)가 더해진다
      await passQ02(page);
      const raised = await until(() => sound(page), (s) => s.regionBars.some((b) => b.regionId === 'beat-river' && b.layer === 1), '박자 강가의 층이 오른 마디가 예약됨', 30000);
      for (const b of raised.regionBars.filter((x) => x.regionId === 'beat-river' && x.layer === 1)) expect(b.part, `마디 ${b.bar}의 타악`).toBe(PERCUSSION_NOTES[1]);
      for (const b of raised.regionBars.filter((x) => x.regionId === 'beat-river' && x.layer === 0)) expect(b.part).toBe(0);

      // 종나무 숲으로 곧바로 건너간다
      await standQuiet(page, 'bell-grove');
      const grove = await until(() => sound(page), (s) => s.audibleRegions.includes('bell-grove') && s.regionBars.some((b) => b.regionId === 'bell-grove'), '종나무 숲의 바탕 소리가 열림', 20000);
      expect(grove.audibleRegions).toEqual(['bell-grove']);
      expect(grove.plazaAudible).toBe(false);
      const riverBars = grove.regionBars.filter((b) => b.regionId === 'beat-river').length;
      await wait(4000);
      const after = await sound(page);
      expect(after.regionBars.filter((b) => b.regionId === 'beat-river').length, '떠난 지역의 바탕은 더 예약되지 않는다').toBe(riverBars);
      for (const b of after.regionBars.filter((x) => x.regionId === 'bell-grove')) expect(b).toMatchObject({ layer: 0, part: 0, nature: 1 });
      const peak = await peakOver(page, 4500);
      console.log(`[phase6-layers] 박자 강가 → 종나무 숲 건넌 뒤 출력 최댓값 ${peak.toFixed(4)}`);
      expect(peak).toBeGreaterThan(0.0008);

      // 종나무 숲의 과제를 통과한다: 그 지역의 성부(온음표 베이스)가 더해진다
      expect((await passQ05(page)).passed).toBe(true);
      const raisedGrove = await until(() => sound(page), (s) => s.regionBars.some((b) => b.regionId === 'bell-grove' && b.layer === 1), '종나무 숲의 층이 오른 마디가 예약됨', 30000);
      for (const b of raisedGrove.regionBars.filter((x) => x.regionId === 'bell-grove' && x.layer === 1)) expect(b.part, `마디 ${b.bar}의 베이스`).toBe(BASS_NOTES[1]);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
