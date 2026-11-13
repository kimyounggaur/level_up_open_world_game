// 5단계 흐름 시험(실제 Chrome): 마을의 발견(소리 조각, 개념 쪽지), 광장 둘레의 등, 광장 게시판과 내 곡, 합주 잔치(5-6).
// 기계가 볼 수 있는 것만 본다: 표식과 등의 모습이 상태를 따라 바뀌는가, 찾으면 저장에 남는가, 소리를 켜기 전에는 오디오 장치가 없는가,
// 카드와 수첩이 같은 것을 말하는가, 잔치 카드가 단계를 차례로 밟고 악사가 무대에 서는가.
// 소리가 어떻게 들리는가, 조각과 쪽지의 음악·설명이 맞는가, 악사가 눈에 보기 좋은가는 사람이 본다(사람 확인 대기, 설계서 D-4·D-5).
// 먼저 `npm run build`가 필요하다(dist를 연다). 월드 상태는 미리보기 채널의 window.__game으로 읽는다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOARD_SPOT, PLAZA_CENTER, foundNews, plazaLampSite } from '../../src/domain/discovery';
import { FESTIVAL_SILENT_TEXT, FESTIVAL_SONGS_TEXT, FESTIVAL_START_TEXT, FESTIVAL_TITLE, festivalAskText, musiciansText } from '../../src/domain/festival';
import { dbg, hashOf, status, waitChunks, waitReady } from './game';
import { startHarness, type Harness } from './harness';
import { audioContextCount } from './inputTools';

import {
  FESTIVAL_TEST_MS,
  ITEMS,
  NOTES,
  PIECES,
  SONG,
  boot as bootVillage,
  notebookTab,
  openFestival,
  saved,
  seedSong,
  spotOf,
  squash,
  standBy,
  until,
} from './villageTools';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.close();
});

const boot = (opts: { audio?: boolean } = {}) => bootVillage(h, opts);



describe('5-6 소리 조각 표식과 광장 둘레의 등', () => {
  it('처음엔 모든 표식이 비어 있고 등이 꺼져 있다. 다가가 E로 열면 찾은 표식과 켜진 등이 되고, 소리를 켜기 전에는 오디오 장치가 없다. 새로 고쳐도 남는다', async () => {
    const { ctx, page, errors } = await boot({ audio: true });
    await waitReady(page);
    await waitChunks(page);

    // 처음: 표식 아홉(소리 조각 여섯, 개념 쪽지 셋)과 게시판 하나. 아무것도 찾지 않았고, 광장 둘레의 등은 소리 조각 수만큼 꺼져 있다
    const d0 = await dbg(page);
    expect(d0.spots.map((s) => s.id).sort()).toEqual([...ITEMS.map((i) => i.discoveryId), BOARD_SPOT.id].sort());
    expect(d0.spots.filter((s) => s.discovery === 'soundPiece')).toHaveLength(PIECES.length);
    expect(d0.spots.filter((s) => s.discovery === 'conceptNote')).toHaveLength(NOTES.length);
    expect(d0.spots.filter((s) => s.kind === 'discovery').every((s) => !s.found)).toBe(true);
    expect(d0.spots.find((s) => s.kind === 'board')).toMatchObject({ id: BOARD_SPOT.id, tags: 0 });
    expect(d0.plazaLamps.map((l) => l.state)).toEqual(PIECES.map(() => 'off'));
    // 등은 광장 둘레에 같은 간격으로 선다
    d0.plazaLamps.forEach((l, i) => {
      const site = plazaLampSite(i, PIECES.length);
      expect(Math.abs(l.x - site.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(l.y - site.y)).toBeLessThanOrEqual(1);
    });

    // 첫 소리 조각 앞에 서면 안내 칩이 뜬다. E를 누르면 찾았다고 적히고 표식과 첫 등이 바뀐다
    const piece = PIECES[0]!;
    await standBy(page, { id: piece.discoveryId, x: piece.x, y: piece.y });
    expect((await status(page)).near).toMatchObject({ stationId: piece.discoveryId, spot: 'discovery' });
    expect(await page.locator('.hud-chip').innerText()).toContain(piece.name);
    await page.keyboard.press('KeyE');
    await until(() => spotOf(page, piece.discoveryId), (s) => s?.found === true, '소리 조각을 찾은 표식이 된다');
    const d1 = await until(() => dbg(page), (d) => d.plazaLamps[0]?.state === 'on', '첫 등이 켜진다');
    expect(d1.plazaLamps.map((l) => l.state)).toEqual(PIECES.map((_, i) => (i === 0 ? 'on' : 'off')));
    // 다른 표식은 그대로다
    expect(d1.spots.filter((s) => s.kind === 'discovery' && s.found).map((s) => s.id)).toEqual([piece.discoveryId]);
    // 마을 위쪽의 알림은 사실만 말한다(남은 개수도 칭찬도 없다)
    await page.waitForFunction(() => document.querySelector('[data-news]')?.textContent?.includes('찾았어요'), undefined, { timeout: 15000 });
    expect((await page.locator('[data-news] p').allInnerTexts()).map(squash)).toEqual(foundNews(piece));
    // 소리를 켜지 않았으니 오디오 장치는 만들어지지 않았다(W-11)
    expect(await audioContextCount(page)).toBe(0);
    // 같은 것을 다시 열어도 찾은 것은 하나다
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    const afterAgain = await until(async () => (await saved(page))?.explorationState.foundDiscoveries ?? [], (f) => f.length >= 1, '찾은 것이 저장에 적힌다');
    expect(afterAgain).toEqual([piece.discoveryId]);

    // 새로 고쳐도 찾은 표식과 켜진 등이 그대로다(찾은 것은 사라지지 않는다, W-6)
    await page.reload();
    await waitReady(page);
    await waitChunks(page);
    const d2 = await dbg(page);
    expect(d2.spots.find((s) => s.id === piece.discoveryId)?.found).toBe(true);
    expect(d2.plazaLamps.map((l) => l.state)).toEqual(PIECES.map((_, i) => (i === 0 ? 'on' : 'off')));
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('소리 조각이 화면 밖 가까이에 있으면 그 방향의 화면 가장자리에 물결 표식이 있고, 표식은 이름을 싣지 않는다 (8.4, W-8)', async () => {
    const { ctx, page, errors } = await boot();
    await waitReady(page);
    await waitChunks(page);
    const piece = PIECES[1]!; // 마을 동쪽
    await standBy(page, { id: piece.discoveryId, x: piece.x, y: piece.y });
    const ids = await until(
      () => page.locator('.hud-ripples .ripple[data-source="piece"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ripple')!)),
      (v) => v.length >= 1,
      '소리 조각의 물결 표식이 가장자리에 나타난다',
    );
    const known = new Set(PIECES.map((p) => p.discoveryId));
    for (const id of ids) expect(known.has(id)).toBe(true);
    expect(ids).not.toContain(piece.discoveryId); // 지금 보이는 조각에는 표식이 없다
    // 표식은 보는 것이다: 낭독기에 읽히지 않고, 글자를 싣지 않는다(못 찾은 것은 이름도 모른다)
    expect(await page.locator('.hud-ripples').getAttribute('aria-hidden')).toBe('true');
    expect(squash(await page.locator('.hud-ripples').innerText())).toBe('');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('5-6 개념 쪽지', () => {
  it('쪽지 앞에서 E를 누르면 마을 위에 카드가 뜨고 월드가 멈춘다. Esc로 닫으면 다시 움직이고, 수첩의 발견 쪽에 그대로 적힌다', async () => {
    const { ctx, page, errors } = await boot({ audio: true });
    await waitReady(page);
    await waitChunks(page);
    const n = NOTES[0]!;
    await standBy(page, { id: n.discoveryId, x: n.x, y: n.y });
    expect((await status(page)).near).toMatchObject({ stationId: n.discoveryId, spot: 'discovery' });
    await page.keyboard.press('KeyE');
    const card = page.locator(`[data-note-card="${n.discoveryId}"]`);
    await card.waitFor();
    expect(squash(await card.locator('#note-card-title').innerText())).toContain(n.name);
    expect(squash(await card.locator('.note-card-text').innerText())).toBe(squash(n.text ?? ''));
    expect((await status(page)).paused).toBe(true);
    // 이어진 도전이 열 수 있는 것이면 그 주소로 이어진다
    const related = card.locator('[data-related]');
    expect(await related.count()).toBe(1);
    expect(await related.getAttribute('href')).toMatch(new RegExp(`^#/q/${(n.questId ?? '').replace(/\./g, '\\.')}/`));
    // 찾았다고 적혔고, 알림은 사실만 말한다
    await until(() => spotOf(page, n.discoveryId), (s) => s?.found === true, '쪽지를 찾은 표식이 된다');
    expect((await page.locator('[data-news] p').allInnerTexts()).map(squash)).toEqual(foundNews(n));
    expect(await audioContextCount(page)).toBe(0);
    // Esc로 닫으면 월드가 다시 움직인다
    await page.keyboard.press('Escape');
    await card.waitFor({ state: 'detached' });
    await until(() => status(page), (s) => !s.paused, '월드가 다시 움직인다');
    expect(await hashOf(page)).toMatch(/^(#\/?)?$/);

    // 수첩의 발견 쪽: 찾은 쪽지는 이름과 글과 이어진 도전이 있고, 나머지는 빈칸이다
    await page.keyboard.press('KeyN');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    await page.locator('[data-overlay="notebook"] [role="tab"]', { hasText: /^발견$/ }).click();
    expect(await notebookTab(page)).toBe('발견');
    const found = page.locator(`[data-overlay="notebook"] [data-discovery="${n.discoveryId}"]`);
    expect(squash(await found.locator('.nb-note-name').innerText())).toContain(n.name);
    expect(squash(await found.locator('.nb-note-text').innerText())).toBe(squash(n.text ?? ''));
    expect(await page.locator('[data-overlay="notebook"] [data-found="true"]').count()).toBe(1);
    expect(await page.locator('[data-overlay="notebook"] [data-discovery-slot]').count()).toBe(ITEMS.length - 1);
    await found.locator('[data-related]').click();
    expect(await hashOf(page)).toMatch(new RegExp(`^#/q/${(n.questId ?? '').replace(/\./g, '\\.')}/`));
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('5-6 광장 게시판과 내 곡', () => {
  it('저장한 곡마다 게시판에 쪽지가 걸리고, 게시판 앞에서 E를 누르면 수첩의 내 곡이 열린다. 이름을 바꾸고, 두 번 확인한 뒤에야 지우며, 지우면 쪽지도 사라진다', async () => {
    const { ctx, page, errors } = await boot();
    await seedSong(page);
    await until(() => spotOf(page, BOARD_SPOT.id), (s) => s?.tags === 1, '게시판에 쪽지가 하나 걸린다');

    await standBy(page, BOARD_SPOT);
    expect((await status(page)).near).toMatchObject({ stationId: BOARD_SPOT.id, spot: 'board' });
    expect(await page.locator('.hud-chip').innerText()).toContain(BOARD_SPOT.name);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-overlay="notebook"] [role="tabpanel"]');
    expect(await notebookTab(page)).toBe('내 곡');
    const card = page.locator(`[data-creation="${SONG.creationId}"]`);
    expect(squash(await card.locator('h3').innerText())).toBe(SONG.name);
    expect(squash(await card.locator('.quest-card-head .muted').innerText())).toBe('4마디 · 음 4개');

    // 이름 바꾸기
    await card.locator('[data-rename]').click();
    await card.locator('.melody-name-input').fill('새 이름');
    await card.locator('[data-rename-save]').click();
    expect(squash(await page.locator('[data-creation-status="ok"]').innerText())).toContain('새 이름');
    expect(squash(await card.locator('h3').innerText())).toBe('새 이름');
    await until(async () => (await saved(page))?.explorationState.creations.map((c) => c.name), (v) => v?.[0] === '새 이름', '바꾼 이름이 저장에 적힌다');

    // 지우기: 한 번 더 묻고, 그만두면 그대로다
    await card.locator('[data-delete]').click();
    expect(squash(await card.locator('.nb-confirm').innerText())).toContain('되돌릴 수 없어요');
    await card.locator('[data-confirm-cancel]').click();
    expect(await card.locator('.nb-confirm').count()).toBe(0);
    expect((await spotOf(page, BOARD_SPOT.id))?.tags).toBe(1);
    expect((await saved(page))?.explorationState.creations).toHaveLength(1);
    // 확인해서 지우면 곡도 게시판의 쪽지도 저장도 사라지고, 빈 쪽이 안내를 말한다
    await card.locator('[data-delete]').click();
    await card.locator('[data-confirm-delete]').click();
    await page.locator('[data-empty]').waitFor();
    expect(await page.locator('[data-creation]').count()).toBe(0);
    await until(() => spotOf(page, BOARD_SPOT.id), (s) => s?.tags === 0, '게시판의 쪽지가 사라진다');
    await until(async () => (await saved(page))?.explorationState.creations.length, (n) => n === 0, '지운 곡이 저장에서도 사라진다');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('5-6 합주 잔치', () => {
  it('저장한 곡이 없어도 열린다: 카드, 무대의 악사, 조용히 흐른다는 말. 건너뛰면 닫히고 악사도 사라지며, 소리 장치는 만들어지지 않는다', async () => {
    const { ctx, page, errors } = await boot({ audio: true });
    await waitReady(page);
    await waitChunks(page);
    expect((await dbg(page)).musicians).toEqual([]);
    await openFestival(page);

    const card = page.locator('[data-festival="playing"]');
    expect(squash(await card.locator('#festival-title').innerText())).toBe(FESTIVAL_TITLE);
    expect(squash(await card.locator('[data-festival-text]').innerText())).toBe(FESTIVAL_START_TEXT);
    // 층이 0이어도 맥박은 있다: 북 악사 하나가 무대에 선다(모양만이 아니라 글로도 알린다)
    expect(squash(await card.locator('[data-festival-musicians]').innerText())).toBe(musiciansText(['pulse']));
    const withMusicians = await until(() => dbg(page), (d) => d.musicians.length > 0, '악사가 무대에 선다');
    expect(withMusicians.musicians).toHaveLength(1);
    const m = withMusicians.musicians[0]!;
    expect(m.part).toBe('pulse');
    expect(Math.abs(m.x - PLAZA_CENTER.x)).toBeLessThanOrEqual(400); // 무대 바닥 위쪽 가운데쪽에 선다
    expect(m.y).toBeLessThan(PLAZA_CENTER.y);
    // 소리를 켜지 않았으니 조용히 흐른다고 말하고, 소리 켜기가 있다. 오디오 장치는 아직 없다
    expect(squash(await card.locator('.festival-silent').innerText())).toBe(FESTIVAL_SILENT_TEXT);
    expect(await audioContextCount(page)).toBe(0);
    // 카드가 떠 있는 동안 월드는 멈춘다
    expect((await status(page)).paused).toBe(true);

    // 건너뛰기: 묻지 않고 닫힌다
    await page.locator('[data-festival-skip]').click();
    await page.waitForSelector('[data-festival-shell]', { state: 'detached' });
    await until(() => dbg(page), (d) => d.musicians.length === 0, '악사가 무대에서 내려온다');
    expect(await audioContextCount(page)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it(
    '저장한 곡이 있으면 합주가 끝난 뒤(48초) 이어서 들을지 묻고, 내 곡 듣기를 고르면 차례로 들려 주며, 멈추기로 닫는다. 건너뛰면 묻지 않는다',
    async () => {
      const { ctx, page, errors } = await boot();
      await seedSong(page);
      // 건너뛰면 곡이 있어도 묻지 않는다
      await openFestival(page);
      await page.locator('[data-festival-skip]').click();
      await page.waitForSelector('[data-festival-shell]', { state: 'detached' });
      await page.waitForTimeout(800);
      expect(await page.locator('[data-festival-shell]').count()).toBe(0);

      // 다시 열면 끝까지 흐른다(잔치는 몇 번이든 열 수 있다). 끝나면 곡이 있으니 묻는다
      await openFestival(page);
      await page.waitForSelector('[data-festival="asking"]', { timeout: 90_000 });
      expect(squash(await page.locator('[data-festival-text]').innerText())).toBe(festivalAskText(1));
      expect(await page.locator('[data-festival-listen]').count()).toBe(1);
      expect(await page.locator('[data-festival-close]').count()).toBe(1);
      await until(() => dbg(page), (d) => d.musicians.length === 0, '합주가 끝나면 악사가 내려온다', 10000);
      // 내 곡 듣기: 차례로 들려 주는 중이고, 멈추기가 눌린다
      await page.locator('[data-festival-listen]').click();
      await page.waitForSelector('[data-festival="songs"]');
      expect(squash(await page.locator('[data-festival-text]').innerText())).toBe(FESTIVAL_SONGS_TEXT);
      await page.locator('[data-festival-stop]').click();
      await page.waitForSelector('[data-festival-shell]', { state: 'detached' });
      expect(errors).toEqual([]);
      await ctx.close();
    },
    FESTIVAL_TEST_MS,
  );
});
