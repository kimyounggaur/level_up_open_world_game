// 7-5 광장 합주 완성(성부 6 × 밀도 3)과 잔치(설계서 6.2, 6.4, 11.5, 12.10) 흐름 시험(실제 Chrome, 진짜 오디오 출력).
// 완료 기준: "대표 조합 12가지를 들어 통과". 귀로 듣고 거슬리는 곳이 없는지 정하는 일은 사람의 몫이다(D-4, docs/approvals.md의 '사람 확인 대기').
// 이 파일은 사람이 듣기 전에 기계가 볼 수 있는 것을 본다:
//  - 대표 조합 12가지(src/domain/ensemblecheck.ts)마다 그 조합이 되도록 과제를 통과한 저장으로 열면 세계 반응의 층이 정확히 그 조합이다.
//    마을에서 소리를 켜면 광장 합주가 그 층으로 예약되고(성부마다 마디의 음 수가 도메인의 계산과 같다), 진짜 오디오 출력에 소리가 실리며,
//    한 바퀴(8마디)가 지나는 동안 출력이 깨지는 데까지 가지 않는다(최댓값 1 미만. 소리를 모으는 한계 장치가 없어서 겹치면 이 값이 커진다)
//  - 마을에서 과제(Q07, 장음계)를 통과하면 달리는 음이 다음 마디부터 광장 합주에 더해진다. 이전 마디는 그대로다
//  - 층이 모두 3인 잔치: 악사 일곱이 무대 바닥 위에 일정한 간격으로 서고 글로도 알리며, 소리를 켜면 진짜 출력에 소리가 실린다. 무대 사진을 남긴다
// 환경 변수 ENSEMBLE_RECORD_DIR가 있으면 조합마다 실제 소리를 그 폴더에 한 바퀴 넘게 녹음해 둔다(사람이 귀로 확인할 자료. 시험의 통과 기준이 아니다).
// 소리만 보는 시험은 화면을 작게(640×360) 연다. 이 시험 환경은 소프트웨어로 그려서, 1280×720에서는 화면 그리기가 주 스레드를 채워 마디 예약기가 마디를 20% 안팎 건너뛴다
// (모두 3층에서도 층 0에서도 같다. 7-5의 결함이 아니다). 작게 열면 건너뛰지 않아서 한 바퀴의 마디가 모두 울리고 녹음에도 빈 마디가 없다.
// 먼저 `npm run build`가 필요하다(dist를 연다). 상태는 미리보기 채널의 window.__game으로 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import stageFile from '../../content/installations/inst.village.ensemble-stage.json';
import { ENSEMBLE_COMBOS } from '@/domain/ensemblecheck';
import type { EnsembleCombo } from '@/domain/ensemblecheck';
import { MUSICIAN_GAP_MIN, MUSICIAN_NAME_KO, MUSICIAN_ORDER, festivalParts, musicianSpots, musiciansText, stageFloorOf } from '@/domain/festival';
import { parseInstallation } from '@/domain/installation';
import { ENSEMBLE_LAYER_KEYS, ENSEMBLE_LAYER_REGION, barInLoop, plazaBar } from '@/domain/worldsound';
import type { EnsembleLayers } from '@/domain/worldsound';
import { dbg, toScreen } from './game';
import { startHarness, type Harness } from './harness';
import { boot as bootWith, peakOver, recordOver, rmsOver, sound, standQuiet, turnSoundOn, until } from './soundTools';
import type { GameCtx, PlazaBarLike } from './soundTools';
import { openFestival, seedSave, squash } from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const LONG = 300_000;
/** 소리만 보는 시험의 화면 크기(위 머리말) */
const SMALL = { w: 640, h: 360 } as const;
const SHOTS = path.resolve(__dirname, '../../docs/verification/screens');
const RECORD_DIR = process.env['ENSEMBLE_RECORD_DIR'];
/** 합주 한 바퀴(8마디 24초)가 다 지나고도 남도록 재는 시간. 소리를 켠 뒤 첫 마디는 켜는 중이라 한 마디(3초) 더 두고, 예약이 한 마디 앞서므로 한 마디 더 둔다 */
const LISTEN_MS = 33_000;

const SIX_ZERO: EnsembleLayers = { village: 0, melody: 0, percussion: 0, bass: 0, runner: 0, ornament: 0 };

const stageDef = parseInstallation(stageFile, 'inst.village.ensemble-stage.json').installation;
const FLOOR = stageDef ? stageFloorOf([stageDef]) : null;

/** 세계 반응이 읽는 지역별 소리 층과 합주의 층 합 */
const readReaction = (page: Page): Promise<{ regionLayers: Record<string, number>; ensembleLevel: number }> =>
  page.evaluate(() => {
    const r = (window as unknown as { __game: GameCtx }).__game.reaction.store.get();
    return { regionLayers: { ...r.regionLayers }, ensembleLevel: r.ensembleLevel };
  });

/** 앱이 한 마디에 예약한 성부별 음의 수가 도메인의 계산(그 층, 8마디 되풀이 가운데 그 마디)과 같다 */
const expectedRecord = (b: PlazaBarLike): Omit<PlazaBarLike, 'bar' | 'layers'> => {
  const l = b.layers;
  const p = plazaBar(barInLoop(b.bar), l.village, { percussion: l.percussion, bass: l.bass, melody: l.melody, runner: l.runner, ornament: l.ornament });
  return { chord: p.chord, pulse: p.pulse.length, bed: p.bed.length, percussion: p.percussion.length, bass: p.bass.length, melody: p.melody.length, runner: p.runner.length, ornament: p.ornament.length };
};
const recordOf = (b: PlazaBarLike): Omit<PlazaBarLike, 'bar' | 'layers'> => ({
  chord: b.chord,
  pulse: b.pulse,
  bed: b.bed,
  percussion: b.percussion,
  bass: b.bass,
  melody: b.melody,
  runner: b.runner,
  ornament: b.ornament,
});

const dB = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));

describe('7-5 대표 조합 12가지: 과제를 통과해서 만든 층으로 광장 합주가 예약되고, 진짜 출력에 소리가 실린다', () => {
  for (const combo of ENSEMBLE_COMBOS as readonly EnsembleCombo[]) {
    it(
      `${combo.id} ${combo.name}(합주 ${ENSEMBLE_LAYER_KEYS.reduce((s, k) => s + combo.layers[k], 0)}층): 층이 정확히 이 조합이고, 한 바퀴의 마디가 모두 도메인의 계산대로 예약되며, 출력이 깨지지 않는다`,
      async () => {
        const { ctx, page, errors } = await bootWith(h, { record: RECORD_DIR !== undefined, ...SMALL });
        await seedSave(page, { passed: combo.quests });

        // 세계 반응의 층이 정확히 이 조합이다(과제를 통과해서 만들 수 있는 조합이라는 증거)
        const reaction = await readReaction(page);
        for (const key of ENSEMBLE_LAYER_KEYS) expect(reaction.regionLayers[ENSEMBLE_LAYER_REGION[key]], `${key}(${ENSEMBLE_LAYER_REGION[key]})의 층`).toBe(combo.layers[key]);
        expect(reaction.ensembleLevel).toBe(ENSEMBLE_LAYER_KEYS.reduce((s, k) => s + combo.layers[k], 0));

        await standQuiet(page, 'village'); // 서명 소리가 닿지 않는 자리: 광장 합주만 들린다
        await turnSoundOn(page);
        const meter = Promise.all([peakOver(page, LISTEN_MS), rmsOver(page, LISTEN_MS)]);
        const recording = RECORD_DIR !== undefined ? recordOver(page, LISTEN_MS) : null;

        const s = await until(
          () => sound(page),
          (x) => x.running && x.plazaAudible && new Set(x.plazaBars.map((b) => barInLoop(b.bar))).size === 8,
          '한 바퀴 8마디가 모두 예약됨',
          60_000,
        );
        for (const b of s.plazaBars) {
          expect(b.layers, `마디 ${b.bar}의 층`).toEqual(combo.layers);
          expect(recordOf(b), `마디 ${b.bar}(${barInLoop(b.bar) + 1}번째)의 성부별 음 수`).toEqual(expectedRecord(b));
        }
        // 소리가 있는 성부와 없는 성부: 맥박은 늘 있고, 층이 0인 성부는 한 마디도 예약하지 않는다
        const total = (key: 'pulse' | 'bed' | 'percussion' | 'bass' | 'melody' | 'runner' | 'ornament'): number => s.plazaBars.reduce((sum, b) => sum + b[key], 0);
        expect(total('pulse')).toBeGreaterThan(0);
        if (combo.layers.village === 0) expect(total('bed')).toBe(0);
        else expect(total('bed')).toBeGreaterThan(0);
        for (const key of ['percussion', 'bass', 'melody', 'ornament'] as const) {
          if (combo.layers[key] === 0) expect(total(key), key).toBe(0);
          else expect(total(key), key).toBeGreaterThan(0);
        }
        // 달리는 음은 홀수 번호 마디에만 있다(꾸밈음과 같은 마디에 없다)
        for (const b of s.plazaBars) {
          if (b.runner > 0) expect(barInLoop(b.bar) % 2, `마디 ${b.bar}: 달리는 음`).toBe(1);
          if (b.ornament > 0) expect(barInLoop(b.bar) % 2, `마디 ${b.bar}: 꾸밈음`).toBe(0);
          expect(b.runner > 0 && b.ornament > 0, `마디 ${b.bar}: 달리는 음과 꾸밈음이 함께`).toBe(false);
        }

        const [peak, rms] = await meter;
        console.log(
          `[phase7-ensemble] ${combo.id} 합주 ${reaction.ensembleLevel}층: 출력 최댓값 ${peak.toFixed(4)}, 세기(RMS) ${dB(rms).toFixed(1)} dBFS, 예약한 마디 ${s.plazaBars.length}개의 성부별 음 수 ` +
            JSON.stringify(Object.fromEntries((['pulse', 'bed', 'percussion', 'bass', 'melody', 'runner', 'ornament'] as const).map((k) => [k, total(k)]))),
        );
        expect(peak, '출력에 소리가 실려 있다').toBeGreaterThan(0.002);
        expect(peak, '출력이 깨지지 않는다(디지털 최대값 1 미만)').toBeLessThan(1);
        if (recording) {
          const bytes = await recording;
          fs.mkdirSync(RECORD_DIR!, { recursive: true });
          fs.writeFileSync(path.join(RECORD_DIR!, `${combo.id}.webm`), bytes);
        }
        expect(errors).toEqual([]);
        await ctx.close();
      },
      LONG,
    );
  }
});

describe('7-5 층이 오르면 마을의 광장 합주에 새 성부가 더해진다', () => {
  const solveQ07 = (page: Page): Promise<{ passed: boolean }> =>
    page.evaluate(() => {
      const c = (window as unknown as { __game: GameCtx }).__game.controller;
      c.open('scale.major', 'c-major');
      const notes: Array<[string, number]> = [['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5]];
      notes.forEach(([letter, octave], i) => c.edit({ type: 'setSlot', slot: i + 1, writtenPitch: { letter, accidental: null, octave } }));
      return { passed: c.check().passed };
    });

  it(
    '마을에서 소리를 켜고 서 있다가 과제 Q07(장음계, 마을과 음계 길에 놓인 과제)을 통과하면 다음 마디부터 달리는 음이 광장 합주에 더해진다. 이전 마디는 그대로다',
    async () => {
      const { ctx, page, errors } = await bootWith(h, SMALL);
      await standQuiet(page, 'village');
      await turnSoundOn(page);
      const s0 = await until(() => sound(page), (s) => s.running && s.plazaAudible && s.plazaBars.length >= 2, '광장 합주가 돎');
      for (const b of s0.plazaBars) {
        expect(b.layers, `마디 ${b.bar}`).toEqual(SIX_ZERO);
        expect([b.bed, b.percussion, b.bass, b.melody, b.runner, b.ornament]).toEqual([0, 0, 0, 0, 0, 0]);
        expect(b.pulse).toBe(4);
      }

      expect((await solveQ07(page)).passed).toBe(true);
      // 마을(장음계는 마을 정거장에도 놓였다)과 음계 길이 함께 1층이 된다. 달리는 음은 4마디와 8마디 끝에서 달린다(1층)
      const after = await until(() => sound(page), (s) => s.plazaBars.some((b) => b.layers.runner === 1 && b.runner > 0), '새 층으로 예약한 마디에 달리는 음이 있음', 90_000);
      const withRunner = after.plazaBars.filter((b) => b.layers.runner === 1);
      expect(withRunner.length).toBeGreaterThanOrEqual(1);
      for (const b of withRunner) {
        expect(b.layers, `마디 ${b.bar}의 층`).toEqual({ ...SIX_ZERO, village: 1, runner: 1 });
        expect(recordOf(b), `마디 ${b.bar}의 성부별 음 수`).toEqual(expectedRecord(b));
        expect([b.percussion, b.bass, b.melody, b.ornament]).toEqual([0, 0, 0, 0]);
      }
      expect(withRunner.some((b) => b.runner > 0)).toBe(true);
      for (const b of withRunner.filter((x) => x.runner > 0)) expect([3, 7], `마디 ${b.bar}`).toContain(barInLoop(b.bar));
      // 이전 층으로 예약한 마디는 그대로 남아 있다(이미 예약한 마디는 바뀌지 않는다)
      for (const b of after.plazaBars.filter((x) => x.layers.runner === 0)) expect(b.runner).toBe(0);
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});

describe('7-5 잔치: 층이 모두 3이면 악사 일곱이 무대에 서고 합주가 들린다', () => {
  const FULL = ENSEMBLE_COMBOS.find((c) => c.id === 'c12-full')!;

  it(
    '악사 일곱이 서는 차례대로 무대 바닥 위에 일정한 간격으로 서고, 글로도 알린다. 소리를 켜면 진짜 출력에 소리가 실리고 깨지지 않는다. 무대의 사진을 남긴다',
    async () => {
      expect(FLOOR, '무대 바닥을 설치물 데이터에서 읽는다').not.toBeNull();
      const { ctx, page, errors } = await bootWith(h);
      await seedSave(page, { passed: FULL.quests });
      await turnSoundOn(page);
      await openFestival(page);

      const parts = festivalParts(FULL.layers);
      expect(parts, '일곱 성부 모두').toEqual([...MUSICIAN_ORDER]);
      const card = page.locator('[data-festival="playing"]');
      expect(squash(await card.locator('[data-festival-musicians]').innerText())).toBe(musiciansText(parts));
      const withMusicians = await until(() => dbg(page), (d) => d.musicians.length === 7, '악사 일곱이 무대에 선다');
      const byX = [...withMusicians.musicians].sort((a, b) => a.x - b.x);
      expect(byX.map((m) => m.part), '왼쪽부터 서는 차례').toEqual(parts);
      expect(byX.map((m) => m.name)).toEqual(parts.map((p) => MUSICIAN_NAME_KO[p]));
      const spots = musicianSpots(FLOOR!, 7);
      byX.forEach((m, i) => {
        expect(Math.abs(m.x - spots[i]!.x), `${m.part}의 x`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.y - spots[i]!.y), `${m.part}의 y`).toBeLessThanOrEqual(1);
        expect(m.x, `${m.part}는 무대 바닥 가로 범위 안`).toBeGreaterThanOrEqual(FLOOR!.x0);
        expect(m.x).toBeLessThanOrEqual(FLOOR!.x1);
      });
      for (let i = 1; i < byX.length; i++) expect(byX[i]!.x - byX[i - 1]!.x, `${byX[i - 1]!.part}와 ${byX[i]!.part}의 간격`).toBeGreaterThanOrEqual(MUSICIAN_GAP_MIN - 1);

      // 악사가 모두 선 무대의 사진(눈으로 보는 점검 자료): 잔치가 끝나기 전에, 악사가 서자마자 찍는다. 화면 전체와, 악사 둘레를 가까이 자른 것
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, 'phase7-festival-seven-musicians.png') });
      const view = await dbg(page);
      const left = toScreen(view, byX[0]!.x, byX[0]!.y);
      const right = toScreen(view, byX[6]!.x, byX[6]!.y);
      const clip = {
        x: Math.max(0, Math.floor(left.x - 90)),
        y: Math.max(0, Math.floor(left.y - 130)),
        width: Math.min(view.size.width, Math.ceil(right.x - left.x + 180)),
        height: 190,
      };
      clip.width = Math.min(clip.width, view.size.width - clip.x);
      await page.screenshot({ path: path.join(SHOTS, 'phase7-festival-seven-musicians-close.png'), clip });
      console.log(`[phase7-ensemble] 악사 ${byX.length}명 자리(월드 px): ${JSON.stringify(byX.map((m) => [m.part, m.x, m.y]))}, 가까이 자른 곳(화면 px) ${JSON.stringify(clip)}`);

      // 잔치가 도는 동안 합주가 들린다: 광장 합주가 모든 성부와 함께 예약되고, 출력이 깨지지 않는다
      // (이 화면 크기에서는 마디가 더러 건너뛰어진다. 그래서 어느 성부가 한 번이라도 울렸는지만 보고 마디 수는 따지지 않는다)
      const [peak, rms] = await Promise.all([peakOver(page, 20_000), rmsOver(page, 20_000)]);
      const s = await until(() => sound(page), (x) => x.running && x.plazaAudible && x.plazaBars.length >= 6, '잔치의 광장 합주가 예약됨', 60_000);
      for (const b of s.plazaBars) expect(b.layers, `마디 ${b.bar}의 층`).toEqual(FULL.layers);
      for (const key of ['pulse', 'bed', 'percussion', 'bass', 'melody', 'runner', 'ornament'] as const) expect(s.plazaBars.some((b) => b[key] > 0), `${key}가 예약됨`).toBe(true);
      console.log(`[phase7-ensemble] 잔치(합주 18층): 출력 최댓값 ${peak.toFixed(4)}, 세기(RMS) ${dB(rms).toFixed(1)} dBFS, 예약한 마디 ${s.plazaBars.length}개`);
      expect(peak).toBeGreaterThan(0.002);
      expect(peak).toBeLessThan(1);

      // 닫는다: 잔치가 아직 돌면 건너뛰고, 이미 끝났으면(저장한 곡이 없으면 저절로 닫힌다) 그대로 둔다
      if ((await page.locator('[data-festival-skip]').count()) > 0) await page.locator('[data-festival-skip]').click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForSelector('[data-festival-shell]', { state: 'detached', timeout: 20_000 });
      await until(() => dbg(page), (d) => d.musicians.length === 0, '악사가 무대에서 내려온다');
      expect(errors).toEqual([]);
      await ctx.close();
    },
    LONG,
  );
});
