// @vitest-environment jsdom
// 5-6 월드의 발견 요소(3.6)와 광장 게시판(6.1)이 앱에서 하는 일: 열면 찾았다고 적고(처음에만 사용 기록과 소식을 남긴다),
// 소리 조각은 들려 주고, 개념 쪽지는 카드로 띄우며(떠 있는 동안 월드는 멈춘다), 게시판은 수첩의 '내 곡' 쪽을 연다.
// 월드(Phaser)는 가짜다. 진짜 월드에서 열리는지는 tests/flow/discoveries.flow.ts가 본다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadDiscoveries } from '@/app/discovery-data';
import { ContentCatalog } from '@/domain/catalog';
import { foundNews, isConceptNote, isSoundPiece } from '@/domain/discovery';
import type { ConceptNoteDef, DiscoveryDef } from '@/domain/discovery';
import { songsOf } from './controller-rig';
import { bootApp, cleanupApps, flush } from './app-rig';
import { Q01, button, click, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => {
  vi.useRealTimers();
  cleanupApps();
});

type Booted = Awaited<ReturnType<typeof bootApp>>;

const village = (): DiscoveryDef[] => loadDiscoveries('preview');
const pieceDef = (n: number): DiscoveryDef => village().find((d) => d.discoveryId === `disc.village.piece-${n}`)!;
const noteDef = (n: number): ConceptNoteDef => {
  const d = village().find((x) => x.discoveryId === `disc.village.note-${n}`)!;
  if (!isConceptNote(d)) throw new Error('쪽지가 아니에요');
  return d;
};

/** 월드가 발견 요소를 열었다고 알린다 */
const openDiscovery = (t: Booted, discoveryId: string): void => {
  act(() => t.ctx.world.bridge.events.send({ type: 'open-discovery', discoveryId }));
};
const openBoard = (t: Booted): void => {
  act(() => t.ctx.world.bridge.events.send({ type: 'open-board' }));
};
const newsLines = (t: Booted): string[] => qa(t.host, '[data-news] p').map((p) => text(p));
const foundEvents = (t: Booted): string[] =>
  t.ctx.usageLog
    .snapshot()
    .events.filter((e) => e.type === 'discovery-found')
    .map((e) => (e as { discoveryId: string }).discoveryId);
const noteCard = (t: Booted): HTMLElement | null => q(t.host, '[data-note-card]');

describe('소리 조각을 열면(3.6)', () => {
  it('처음 열면 찾았다고 적고, 사용 기록 한 건과 사실 문장 한 줄을 남기고, 소리 조각을 들려 준다. 월드는 멈추지 않는다', async () => {
    const t = await bootApp('');
    const def = pieceDef(2);
    expect(isSoundPiece(def)).toBe(true);
    expect(t.ctx.found.has(def.discoveryId)).toBe(false);
    expect(t.ctx.melody.listening()).toBeNull();

    openDiscovery(t, def.discoveryId);

    expect(t.ctx.found.has(def.discoveryId)).toBe(true);
    expect(foundEvents(t)).toEqual([def.discoveryId]);
    expect(newsLines(t)).toEqual([...foundNews(def)]);
    expect(t.ctx.melody.listening()).toBe(`piece:${def.discoveryId}`);
    expect(t.ctx.controller.previewing).toBe(true);
    // 카드도 겹침 화면도 없다: 월드는 계속 움직인다
    expect(noteCard(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(t.win.location.hash).toBe('');
  });

  it('찾은 것은 월드 다리에도 올라간다(월드가 찾은 모양으로 그린다)', async () => {
    const t = await bootApp('');
    expect([...t.ctx.world.bridge.found.get()]).toEqual([]);
    openDiscovery(t, pieceDef(1).discoveryId);
    openDiscovery(t, pieceDef(3).discoveryId);
    expect([...t.ctx.world.bridge.found.get()].sort()).toEqual([pieceDef(1).discoveryId, pieceDef(3).discoveryId].sort());
  });

  it('다시 열면 다시 들려 주지만 사용 기록과 소식은 새로 남기지 않는다', async () => {
    const t = await bootApp('');
    const def = pieceDef(4);
    openDiscovery(t, def.discoveryId);
    t.ctx.controller.stopPlayback();
    expect(t.ctx.controller.previewing).toBe(false);
    const news = newsLines(t);

    openDiscovery(t, def.discoveryId);

    expect(t.ctx.controller.previewing).toBe(true);
    expect(foundEvents(t)).toEqual([def.discoveryId]);
    expect(newsLines(t)).toEqual(news);
  });

  it('이미 찾아 둔 것(저장에서 읽은 값)을 열면 처음이 아니다: 소식도 사용 기록도 없다', async () => {
    const def = pieceDef(5);
    const t = await bootApp('', { found: [def.discoveryId] });
    openDiscovery(t, def.discoveryId);
    expect(foundEvents(t)).toEqual([]);
    expect(newsLines(t)).toEqual([]);
    expect(t.ctx.controller.previewing).toBe(true);
  });

  it('이 판에 없는 id의 사건은 무시한다: 찾은 것에 적지 않고 소식도 없다', async () => {
    const t = await bootApp('');
    openDiscovery(t, 'disc.village.piece-99');
    expect([...t.ctx.found.store.get()]).toEqual([]);
    expect(foundEvents(t)).toEqual([]);
    expect(newsLines(t)).toEqual([]);
    expect(t.ctx.controller.previewing).toBe(false);
  });

  it('소리가 꺼져 있어도 찾았다고 적는다(소리 없이 위치만 움직인다)', async () => {
    const t = await bootApp('');
    expect(button(t.host, '소리 켜기')).toBeTruthy();
    openDiscovery(t, pieceDef(6).discoveryId);
    expect(t.ctx.found.has(pieceDef(6).discoveryId)).toBe(true);
    expect(newsLines(t)).toEqual([...foundNews(pieceDef(6))]);
  });

  it('찾는 것은 과제 접근과 무관하다(W-5): 아무것도 열리거나 닫히지 않는다', async () => {
    const t = await bootApp('');
    const opened = [...t.ctx.opened.store.get()];
    for (let n = 1; n <= 6; n++) openDiscovery(t, pieceDef(n).discoveryId);
    expect([...t.ctx.opened.store.get()]).toEqual(opened);
    expect(t.ctx.controller.current).toBeNull();
    expect(t.win.location.hash).toBe('');
  });
});

describe('개념 쪽지를 열면(3.6)', () => {
  it('마을 위에 카드가 뜬다: 이름과 글, 검수 전 표지, 닫기. 월드는 멈추고 뒤 화면은 눌리지 않는다', async () => {
    const t = await bootApp('');
    const note = noteDef(1);
    openDiscovery(t, note.discoveryId);

    const card = noteCard(t)!;
    expect(card).not.toBeNull();
    expect(card.getAttribute('data-note-card')).toBe(note.discoveryId);
    expect(text(q(card, 'h1'))).toContain(note.name);
    expect(text(q(card, '.note-card-text'))).toBe(note.text);
    // 새로 만든 쪽지는 사람의 검수 전이다(D-4): 미리보기 채널에서는 표지를 붙인다
    expect(text(q(card, 'h1'))).toContain('검수 전');
    expect(q(card, '[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(true);
    // 닫기 단추에 초점이 가 있다(키보드로 바로 닫을 수 있다)
    expect(document.activeElement).toBe(button(card, '닫기'));
  });

  it('처음 열면 찾았다고 적고 소식을 남긴다. 소리 조각처럼 소리를 내지는 않는다', async () => {
    const t = await bootApp('');
    const note = noteDef(2);
    openDiscovery(t, note.discoveryId);
    expect(t.ctx.found.has(note.discoveryId)).toBe(true);
    expect(foundEvents(t)).toEqual([note.discoveryId]);
    expect(newsLines(t)).toEqual([...foundNews(note)]);
    expect(t.ctx.controller.previewing).toBe(false);
    expect(text(q(noteCard(t)!, 'p.muted.small:last-of-type'))).toBe("수첩의 '발견' 쪽에 적었어요.");
  });

  it('Esc로 닫으면 카드가 사라지고 월드가 다시 움직인다. 주소는 그대로다', async () => {
    const t = await bootApp('');
    openDiscovery(t, noteDef(1).discoveryId);
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    t.press('Escape');
    expect(noteCard(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(false);
    expect(t.win.location.hash).toBe('');
  });

  it('닫기 단추로도 닫는다', async () => {
    const t = await bootApp('');
    openDiscovery(t, noteDef(2).discoveryId);
    click(button(noteCard(t)!, '닫기'));
    expect(noteCard(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it('이어진 도전을 열 수 있으면 그 주소와 이름을 단 링크가 있다. 링크를 따라가면 카드는 사라진다', async () => {
    const t = await bootApp('');
    const note = noteDef(1);
    expect(note.questId).toBe(Q01);
    openDiscovery(t, note.discoveryId);
    const link = q<HTMLAnchorElement>(noteCard(t)!, '[data-related]')!;
    expect(link.getAttribute('href')).toBe(ContentCatalog.hashFor(Q01, 'middle-c'));
    // 낭독기 이름은 화면에 보이는 글('이어진 도전 열기')을 품는다(음성으로 누를 수 있게, 7.9 8번)
    expect(link.getAttribute('aria-label')).toBe('이어진 도전 열기: 같은 음의 자리 찾기');
    expect(link.getAttribute('aria-label')).toContain(text(link));
    act(() => {
      t.win.location.hash = link.getAttribute('href')!;
    });
    expect(noteCard(t)).toBeNull();
    expect(text(q(t.host, 'h1'))).toBe('같은 음의 자리 찾기');
  });

  it('이어진 도전이 이 판에서 열 수 없으면(없거나 화면이 없다) 링크를 두지 않는다', async () => {
    const t = await bootApp('');
    // 기본 판에는 화음 과제(note-3가 잇는 것)가 없다
    openDiscovery(t, noteDef(3).discoveryId);
    expect(noteCard(t)).not.toBeNull();
    expect(q(noteCard(t)!, '[data-related]')).toBeNull();
  });

  it('카드가 떠 있는 채로 지도(M)로 가면 카드는 닫히고, 지도를 닫아 돌아오면 다시 뜨지 않는다', async () => {
    const t = await bootApp('');
    openDiscovery(t, noteDef(1).discoveryId);
    t.press('KeyM');
    expect(noteCard(t)).toBeNull();
    expect(t.win.location.hash).toBe('#/map');
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(noteCard(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it('같은 쪽지를 다시 열면 카드는 다시 뜨지만 소식과 사용 기록은 새로 남지 않는다', async () => {
    const t = await bootApp('');
    const note = noteDef(1);
    openDiscovery(t, note.discoveryId);
    t.press('Escape');
    const news = newsLines(t);
    openDiscovery(t, note.discoveryId);
    expect(noteCard(t)).not.toBeNull();
    expect(newsLines(t)).toEqual(news);
    expect(foundEvents(t)).toEqual([note.discoveryId]);
  });
});

describe('광장 게시판을 열면(6.1)', () => {
  it('수첩이 열리고 \'내 곡\' 쪽이 먼저 펼쳐진다. 월드는 멈춘다', async () => {
    const t = await bootApp('', { creations: songsOf(2) });
    openBoard(t);
    expect(t.win.location.hash).toBe('#/notebook');
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    const tab = qa(t.host, '[role="tab"]').find((b) => b.getAttribute('aria-selected') === 'true')!;
    expect(text(tab)).toBe('내 곡');
    expect(qa(t.host, '[data-creation]')).toHaveLength(2);
  });

  it('저장한 곡이 없으면 빈 쪽 안내가 보인다', async () => {
    const t = await bootApp('');
    openBoard(t);
    const tab = qa(t.host, '[role="tab"]').find((b) => b.getAttribute('aria-selected') === 'true')!;
    expect(text(tab)).toBe('내 곡');
    expect(qa(t.host, '[data-creation]')).toHaveLength(0);
  });

  it('수첩을 나갔다가 N으로 다시 열면 처음 쪽(도전 기록)이 펼쳐진다. 게시판이 정한 쪽은 한 번만 쓴다', async () => {
    const t = await bootApp('', { creations: songsOf(1) });
    openBoard(t);
    t.press('Escape');
    expect(t.win.location.hash).toBe('#/');
    t.press('KeyN');
    expect(t.win.location.hash).toBe('#/notebook');
    const tab = qa(t.host, '[role="tab"]').find((b) => b.getAttribute('aria-selected') === 'true')!;
    expect(text(tab)).not.toBe('내 곡');
  });
});

describe('게시판에 걸린 곡을 월드에 알린다(6.1)', () => {
  it('저장한 곡의 id들이 다리에 올라가고, 곡이 늘면 따라 늘어난다', async () => {
    const t = await bootApp('', { creations: songsOf(2) });
    expect(t.ctx.world.bridge.board.get()).toHaveLength(2);
    t.ctx.melody.rename(t.ctx.creations.list()[0]!.creationId, '새 이름');
    expect(t.ctx.world.bridge.board.get()).toHaveLength(2);
    await flush();
  });
});
