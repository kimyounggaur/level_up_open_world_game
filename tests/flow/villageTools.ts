// 마을 흐름 시험들이 함께 쓰는 도구(5-6의 village.flow, 5-8의 접근성 시험): 쪽 열기, 저장소 읽고 쓰기, 자리 앞에 서기, 곡 심기, 잔치 열기.
// 월드 상태는 미리보기 채널의 window.__game으로 읽는다. 먼저 `npm run build`가 필요하다.
import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import beatRiverFile from '../../content/discoveries/beat-river.json';
import bellGroveFile from '../../content/discoveries/bell-grove.json';
import keyMarshFile from '../../content/discoveries/key-marsh.json';
import scaleTrailFile from '../../content/discoveries/scale-trail.json';
import staffHillFile from '../../content/discoveries/staff-hill.json';
import discoveryFile from '../../content/discoveries/village.json';
import installation from '../../content/installations/inst.village.ensemble-stage.json';
import { makeAttemptResult } from '../../src/domain/attempt';
import { EVALUATOR_VERSION } from '../../src/domain/evaluators/types';
import { parseDiscoveryFile, visibleDiscoveries } from '../../src/domain/discovery';
import { command, dbg, teleport, waitChunks, waitNear, waitReady, type DrawnSpot } from './game';
import { appDrawn, collectErrors, skipIntro, type Harness } from './harness';
import { installAudioCounter, installInputLog } from './inputTools';

export interface Item {
  discoveryId: string;
  kind: 'soundPiece' | 'conceptNote';
  name: string;
  text?: string;
  x: number;
  y: number;
  questId?: string;
}
/**
 * 게임에 있는 발견 요소 전부(미리보기 채널): 여섯 지역의 54개(소리 조각 36, 쪽지 18, 7-4부터). 차례는 게임 안의 차례와 같다: 마을의 것이 맨 앞이고
 * 이어서 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪), 지역 안에서는 쪽지가 앞이고 id의 숫자 순서다. 그래서 PIECES[0], PIECES[1], NOTES[0]은 마을의 것이다.
 */
export const ITEMS = visibleDiscoveries(
  [discoveryFile, staffHillFile, beatRiverFile, bellGroveFile, scaleTrailFile, keyMarshFile].map((raw) => {
    const { file, issues } = parseDiscoveryFile(raw, `${raw.regionId}.json`);
    if (!file) throw new Error(`발견 요소 파일을 읽을 수 없어요: ${raw.regionId} ${JSON.stringify(issues)}`);
    return file;
  }),
  'preview',
) as unknown as Item[];
export const PIECES = ITEMS.filter((i) => i.kind === 'soundPiece');
export const NOTES = ITEMS.filter((i) => i.kind === 'conceptNote');
export const INST_ID = installation.installationId;
export const KEY_CURRENT = 'levelup-music-world:v1:save:current';
export const KEY_EMERGENCY = 'levelup-music-world:v1:save:emergency';
/** 잔치는 48초 넘게 이어진다(소리를 꺼도 같은 세계 시계로 흐른다) */
export const FESTIVAL_TEST_MS = 180_000;

/**
 * 새 맥락과 쪽을 열고 첫 안내를 건너뛴다. 크기, 터치, 움직임 줄이기는 고를 수 있다.
 * log는 입력 기록(W-4: 키 수, 누른 도구, 끌기 거리)이고, intro는 첫 안내를 닫는 방법이다(기본은 터치면 손가락, 아니면 마우스).
 */
export interface BootOptions {
  audio?: boolean;
  log?: boolean;
  width?: number;
  height?: number;
  touch?: boolean;
  reducedMotion?: 'reduce' | 'no-preference';
  intro?: 'click' | 'tap' | 'key';
}
export async function boot(h: Harness, opts: BootOptions = {}) {
  const ctx = await h.newContext({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 720 },
    ...(opts.touch ? { hasTouch: true } : {}),
    ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}),
  });
  if (opts.audio) await installAudioCounter(ctx);
  if (opts.log) await installInputLog(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await page.goto(h.url);
  const intro = opts.intro ?? (opts.touch ? 'tap' : 'click');
  if (intro === 'key') {
    // 마우스를 한 번도 쓰지 않는다: Esc로 첫 안내를 닫는다
    await appDrawn(page);
    if ((await page.locator('[data-intro]').count()) > 0) {
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-intro]', { state: 'detached' });
    }
  } else await skipIntro(page, { tap: intro === 'tap' });
  return { ctx, page, errors };
}

/** 값이 조건을 채울 때까지 읽는다. 느린 헤드리스 Chrome에서는 시간이 아니라 상태로 기다린다 */
export async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string, timeout = 30000): Promise<T> {
  const end = Date.now() + timeout;
  let last: T | undefined;
  while (Date.now() < end) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`시간 안에 ${what}: 마지막 값 ${JSON.stringify(last)}`);
}

// 저장소(IndexedDB)를 앱의 연결과 따로 연다
export const idbRead = (p: Page, key: string): Promise<string | null> =>
  p.evaluate(
    (k) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('levelup-music-world', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('save', 'readonly').objectStore('save').get(k);
          req.onsuccess = () => {
            db.close();
            resolve(typeof req.result === 'string' ? req.result : null);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
      }),
    key,
  );
export const idbWrite = (p: Page, key: string, value: string): Promise<void> =>
  p.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('levelup-music-world', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('save', 'readwrite');
          tx.objectStore('save').put(v as string, k as string);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as const,
  );

export interface SavedShape {
  preferences: { introSeen: boolean };
  explorationState: { foundDiscoveries: string[]; creations: Array<{ creationId: string; name: string }> };
}
export async function saved(p: Page): Promise<SavedShape | null> {
  const text = await idbRead(p, KEY_CURRENT);
  return text === null ? null : (JSON.parse(text) as SavedShape);
}

export const spotOf = async (p: Page, id: string): Promise<DrawnSpot | undefined> => (await dbg(p)).spots.find((s) => s.id === id);
export const squash = (t: string): string => t.replace(/\s+/g, ' ').trim();

/** 자리 앞(발치 아래 50 px)으로 바로 이동해, 그 자리가 가까운 사물이 될 때까지 기다린다 */
export async function standBy(p: Page, spot: { id: string; x: number; y: number }): Promise<void> {
  await command(p, { type: 'teleport', x: spot.x, y: spot.y + 50 });
  await waitNear(p, spot.id, 20000);
}

/** 저장 안에 심을 것: 찾은 발견 표식의 id들, 내 곡들, 통과한 것으로 칠 과제들 */
export interface Seed {
  found?: readonly string[];
  creations?: readonly unknown[];
  /** 통과한 것으로 칠 과제 id들(과제마다 통과 기록 하나, 판본은 'seed'). 지역의 소리 층을 곧바로 올릴 때 쓴다 */
  passed?: readonly string[];
}
/** 저장을 심어 놓고 다시 연다. 새 저장소에서 처음 저장이 적힌 뒤에 심고, 긴급 사본은 지운다(저장 시험이 따로 다룬다) */
export async function seedSave(page: Page, seed: Seed): Promise<void> {
  await until(async () => (await saved(page))?.preferences.introSeen ?? false, (v) => v, '첫 저장이 적힌다');
  const base = JSON.parse((await idbRead(page, KEY_CURRENT))!) as { explorationState: Record<string, unknown>; attempts?: unknown[] };
  if (seed.found) base.explorationState['foundDiscoveries'] = [...seed.found];
  if (seed.creations) base.explorationState['creations'] = [...seed.creations];
  if (seed.passed) {
    base.attempts = [
      ...(base.attempts ?? []),
      ...seed.passed.map((questId, i) =>
        makeAttemptResult({
          attemptId: `seed-${i + 1}-${questId}`,
          questId,
          variantId: 'seed',
          contentVersion: 'seed',
          recordedAt: '2026-11-12T09:00:00.000Z',
          evaluation: { evaluator: 'orderedScale', evaluatorVersion: EVALUATOR_VERSION, passed: true, issues: [] },
          context: { tempoBpm: null, originalTempoBpm: null, assistUsed: false, soundState: 'muted', soundPlayed: false },
        }),
      ),
    ];
  }
  await idbWrite(page, KEY_CURRENT, JSON.stringify(base));
  await page.evaluate((k) => localStorage.removeItem(k), KEY_EMERGENCY);
  await page.reload();
  await waitReady(page);
  await waitChunks(page);
}

/** 곡 하나가 저장에 들어 있는 상태로 다시 연다(곡을 만드는 일은 5-6 화면 시험이 따로 본다) */
const note = (id: string, letter: string, onset: number): Record<string, unknown> => ({
  eventId: id,
  type: 'note',
  voiceId: 'v1',
  staffId: 's1',
  measureIndex: 0,
  onsetTicks: onset,
  durationTicks: 960,
  writtenPitch: { letter, accidental: null, octave: 4 },
});
export const SONG = {
  creationId: 'creation-1',
  name: '시험 곡',
  installationId: INST_ID,
  createdAt: '2026-11-11T09:00:00.000Z',
  events: [note('s1', 'C', 0), note('s2', 'D', 960), note('s3', 'E', 1920), note('s4', 'F', 2880)],
};
export const seedSong = (page: Page): Promise<void> => seedSave(page, { creations: [SONG] });

/** 합주 무대(H5) 앞에서 E로 들어가 표지판의 '잔치 열기'를 골라 잔치 카드가 뜰 때까지 */
export async function openFestival(page: Page): Promise<void> {
  if ((await page.locator('[data-installation-hud][data-stage="true"]').count()) === 0) {
    expect(await teleport(page, 'H5')).toBe(true);
    await waitNear(page, 'H5', 20000);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-installation-hud][data-stage="true"]', { timeout: 20000 });
  }
  await page.locator('[data-sign-toggle]').click();
  await page.waitForSelector('#inst-sign-list');
  await page.locator('[data-sign="festival"]').click();
  await page.waitForSelector('[data-festival="playing"]', { timeout: 20000 });
}

export const notebookTab = async (p: Page): Promise<string> => squash(await p.locator('[data-overlay="notebook"] [role="tab"][aria-selected="true"]').innerText());
