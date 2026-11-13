// @vitest-environment jsdom
// 3.6 규칙 5: 설정의 '발견 위치 표시'를 켜면 지도에 발견 요소가 모두 나타난다. 걷기가 어렵거나 찾기를 원하지 않는 사람을 위한 선택이다.
// 위치만 알려 주고 이름은 찾은 것만 알려 준다. 찾았는지는 모양으로 구별한다. 남은 개수는 적지 않는다(6.7). 기본은 꺼짐이다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadDiscoveries, loadPlayInstruments } from '@/app/discovery-data';
import { isConceptNote, isSoundPiece } from '@/domain/discovery';
import { DEFAULT_SETTINGS } from '@/domain/save/settings';
import { bootApp, cleanupApps } from './app-rig';
import { click, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

const PLAYS = loadPlayInstruments('preview');
const ALL = loadDiscoveries('preview');
const PIECES = ALL.filter(isSoundPiece);
const NOTES = ALL.filter(isConceptNote);
const ON = { ...DEFAULT_SETTINGS, showDiscoveries: true };

type Booted = Awaited<ReturnType<typeof bootApp>>;
const finds = (t: Booted): HTMLElement[] => qa(t.host, '[data-find]');
const find = (t: Booted, id: string): HTMLElement | null => q(t.host, `[data-find="${id}"]`);

describe('설정: 발견 위치 표시', () => {
  it('처음에는 꺼져 있다. 스위치가 있고 눌러서 켜고 끈다', async () => {
    const t = await bootApp('#/settings');
    const sw = q(t.host, '#set-discoveries')!;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(text(q(t.host, 'label[for="set-discoveries"]') ?? q(t.host, '#set-discoveries-label'))).toContain('발견 위치 표시');
    expect(text(q(t.host, '#set-discoveries-hint'))).toContain('이름은 찾은 것만');
    click(sw);
    expect(t.ctx.settings.get().showDiscoveries).toBe(true);
    expect(q(t.host, '#set-discoveries')!.getAttribute('aria-checked')).toBe('true');
    click(q(t.host, '#set-discoveries'));
    expect(t.ctx.settings.get().showDiscoveries).toBe(false);
  });

  it('저장에서 읽은 설정을 따른다', async () => {
    const t = await bootApp('#/settings', { settings: ON });
    expect(q(t.host, '#set-discoveries')!.getAttribute('aria-checked')).toBe('true');
  });

  it('소리 물결 표시의 안내도 소리 조각을 말한다', async () => {
    const t = await bootApp('#/settings');
    expect(text(q(t.host, '#set-ripples-hint'))).toContain('소리 조각');
  });
});

describe('지도: 꺼져 있으면 아무것도 알려 주지 않는다', () => {
  it('기본에서는 발견 요소의 표식도 안내도 없다', async () => {
    const t = await bootApp('#/map');
    expect(q(t.host, '[data-map-surface]')).not.toBeNull();
    expect(finds(t)).toEqual([]);
    expect(q(t.host, '[data-find-legend]')).toBeNull();
    // 이름이 어디에도 새지 않는다
    for (const d of ALL) expect(t.host.innerHTML).not.toContain(d.name);
  });

  it('설정을 켜면 지도에 나타나고, 끄면 사라진다', async () => {
    const t = await bootApp('#/map');
    expect(finds(t)).toHaveLength(0);
    act(() => t.ctx.settings.update((s) => ({ ...s, showDiscoveries: true })));
    expect(finds(t)).toHaveLength(ALL.length);
    act(() => t.ctx.settings.update((s) => ({ ...s, showDiscoveries: false })));
    expect(finds(t)).toEqual([]);
  });
});

describe('지도: 켜면 전부 나타난다(3.6 규칙 5)', () => {
  it('여섯 지역(마을과 다섯 바깥 지역)의 소리 조각 서른여섯과 개념 쪽지 열여덟이 모두 있다. 처음에는 모두 속이 빈 모양이다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    expect(PIECES).toHaveLength(36);
    expect(NOTES).toHaveLength(18);
    expect(finds(t)).toHaveLength(54);
    expect(qa(t.host, '[data-find-kind="piece"]')).toHaveLength(PIECES.length);
    expect(qa(t.host, '[data-find-kind="note"]')).toHaveLength(NOTES.length);
    for (const el of finds(t)) {
      expect(el.getAttribute('data-found')).toBe('0');
      expect(q(el, 'svg')!.getAttribute('data-find-shape')).toMatch(/-open$/);
    }
    expect(q(t.host, '[data-find-legend]')).not.toBeNull();
  });

  it('못 찾은 것은 종류만 읽히고 이름은 어디에도 없다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    expect(find(t, PIECES[0]!.discoveryId)!.getAttribute('aria-label')).toBe('아직 못 찾은 소리 조각');
    expect(find(t, NOTES[0]!.discoveryId)!.getAttribute('aria-label')).toBe('아직 못 찾은 개념 쪽지');
    for (const d of ALL) expect(t.host.innerHTML).not.toContain(d.name);
  });

  it('찾은 것은 속이 찬 모양이고 이름이 읽힌다. 못 찾은 것은 그대로다', async () => {
    const found = [PIECES[1]!.discoveryId, NOTES[2]!.discoveryId];
    const t = await bootApp('#/map', { settings: ON, found });
    const p = find(t, PIECES[1]!.discoveryId)!;
    expect(p.getAttribute('data-found')).toBe('1');
    expect(q(p, 'svg')!.getAttribute('data-find-shape')).toBe('piece-found');
    expect(p.getAttribute('aria-label')).toBe(`찾은 소리 조각: ${PIECES[1]!.name}`);
    const n = find(t, NOTES[2]!.discoveryId)!;
    expect(q(n, 'svg')!.getAttribute('data-find-shape')).toBe('note-found');
    expect(n.getAttribute('aria-label')).toBe(`찾은 개념 쪽지: ${NOTES[2]!.name}`);
    expect(find(t, PIECES[0]!.discoveryId)!.getAttribute('data-found')).toBe('0');
    // 못 찾은 것의 이름은 새지 않는다
    expect(t.host.innerHTML).not.toContain(PIECES[0]!.name);
    expect(t.host.innerHTML).not.toContain(NOTES[0]!.name);
  });

  it('종류는 모양으로 구별한다(색만으로 구별하지 않는다): 소리 조각은 둥글고 쪽지는 네모나다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    const shapes = new Set(finds(t).map((el) => q(el, 'svg')!.getAttribute('data-find-shape')));
    expect(shapes).toEqual(new Set(['piece-open', 'note-open']));
    expect(q(find(t, PIECES[0]!.discoveryId)!, 'circle')).not.toBeNull();
    expect(q(find(t, NOTES[0]!.discoveryId)!, 'rect')).not.toBeNull();
  });

  it('지도를 연 채로 찾으면 바로 속이 찬 모양으로 바뀐다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    const id = PIECES[3]!.discoveryId;
    expect(find(t, id)!.getAttribute('data-found')).toBe('0');
    act(() => void t.ctx.found.mark(id));
    expect(find(t, id)!.getAttribute('data-found')).toBe('1');
    expect(find(t, id)!.getAttribute('aria-label')).toContain(PIECES[3]!.name);
  });

  it('자리는 월드 좌표를 따른다: 오른쪽에 있는 조각이 지도에서도 더 오른쪽이다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    const left = (id: string): number => parseFloat(find(t, id)!.style.left);
    const top = (id: string): number => parseFloat(find(t, id)!.style.top);
    const west = PIECES.find((p) => p.discoveryId.endsWith('piece-1'))!; // x 2860
    const east = PIECES.find((p) => p.discoveryId.endsWith('piece-2'))!; // x 5400
    expect(east.x).toBeGreaterThan(west.x);
    expect(left(east.discoveryId)).toBeGreaterThan(left(west.discoveryId));
    const north = PIECES.find((p) => p.discoveryId.endsWith('piece-3'))!; // y 2120
    const south = PIECES.find((p) => p.discoveryId.endsWith('piece-5'))!; // y 4050
    expect(top(south.discoveryId)).toBeGreaterThan(top(north.discoveryId));
  });

  it('보기만 한다: 단추도 링크도 초점도 없다. 정거장 표식은 그대로 고를 수 있다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    for (const el of finds(t)) {
      expect(el.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
      expect(el.getAttribute('role')).toBe('img');
    }
    const before = q(t.host, '[data-selected-station]')!.getAttribute('data-selected-station');
    const other = qa(t.host, '[data-station]').find((b) => b.getAttribute('data-station') !== before)!;
    click(other);
    expect(q(t.host, '[data-selected-station]')!.getAttribute('data-selected-station')).toBe(other.getAttribute('data-station'));
  });

  it('남은 개수나 진행률을 적지 않는다(6.7)', async () => {
    const t = await bootApp('#/map', { settings: ON, found: [PIECES[0]!.discoveryId] });
    const all = text(q(t.host, '.map-layout'));
    expect(all).not.toMatch(/남았|남은|\d+\s*\/\s*\d+|\d+\s*%|진행|모두 찾|몇 개/);
    const legend = text(q(t.host, '[data-find-legend]'));
    expect(legend).toContain('소리 조각');
    expect(legend).toContain('개념 쪽지');
    expect(legend).toContain('속이 찬 것이 찾은 것');
  });
});

// ───── 놀이 악기(3.5, 6-9c) ─────
describe('지도: 놀이 악기', () => {
  const plays = (t: Booted): HTMLElement[] => qa(t.host, '[data-play]');
  const playOf = (t: Booted, id: string): HTMLElement | null => q(t.host, `[data-play="${id}"]`);

  it('꺼져 있으면 표식도 이름도 없다', async () => {
    const t = await bootApp('#/map');
    expect(plays(t)).toEqual([]);
    for (const p of PLAYS) expect(t.host.innerHTML).not.toContain(p.name);
  });

  it('켜면 다섯 악기가 지역 차례로 나타나고 이름이 처음부터 읽힌다(찾는 것이 아니라서 못 찾은 모양이 없다)', async () => {
    const t = await bootApp('#/map', { settings: ON });
    expect(plays(t).map((el) => el.getAttribute('data-play'))).toEqual(['play.staff-hill.pitch-slide', 'play.beat-river.drum', 'play.bell-grove.echo-wall', 'play.scale-trail.pinwheels', 'play.key-marsh.lily-chorus']);
    expect(plays(t).map((el) => el.getAttribute('aria-label'))).toEqual(['놀이 악기: 높낮이 미끄럼길', '놀이 악기: 물방울 북', '놀이 악기: 메아리 벽', '놀이 악기: 바람개비 줄', '놀이 악기: 연잎 합창']);
    for (const el of plays(t)) {
      expect(el.getAttribute('role')).toBe('img');
      expect(el.getAttribute('data-found')).toBeNull();
      expect(q(el, 'svg')!.getAttribute('data-find-shape')).toBe('play');
    }
  });

  it('설정을 켜고 끄면 따라서 나타나고 사라진다', async () => {
    const t = await bootApp('#/map');
    expect(plays(t)).toHaveLength(0);
    act(() => t.ctx.settings.update((s) => ({ ...s, showDiscoveries: true })));
    expect(plays(t)).toHaveLength(5);
    act(() => t.ctx.settings.update((s) => ({ ...s, showDiscoveries: false })));
    expect(plays(t)).toEqual([]);
  });

  it('소리 조각과 쪽지 표식(쉰넷)에 세지 않고, 찾은 것과 상관없이 모양이 같다', async () => {
    const t = await bootApp('#/map', { settings: ON, found: [PIECES[0]!.discoveryId, NOTES[0]!.discoveryId] });
    expect(finds(t)).toHaveLength(54);
    expect(plays(t)).toHaveLength(5);
    for (const el of plays(t)) expect(el.hasAttribute('data-find')).toBe(false);
    expect(new Set(plays(t).map((el) => q(el, 'svg')!.getAttribute('data-find-shape')))).toEqual(new Set(['play']));
  });

  it('모양은 소리 조각(둥근 음표 머리)이나 쪽지(네모)와 구별된다: 돌 네 개가 둘러선 모양이고, 악기의 돌 수와 상관없이 다섯 악기가 모두 같다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    for (const id of ['play.staff-hill.pitch-slide', 'play.beat-river.drum', 'play.bell-grove.echo-wall', 'play.scale-trail.pinwheels', 'play.key-marsh.lily-chorus']) {
      const svg = q(playOf(t, id)!, 'svg')!;
      expect(svg.querySelectorAll('circle'), id).toHaveLength(5); // 바탕 하나와 돌 넷
      expect(svg.querySelector('rect'), id).toBeNull();
    }
  });

  it('자리는 월드 좌표를 따른다: 박자 강가의 북(x 7700)이 종나무 숲의 벽(x 600)보다 오른쪽이고 아래다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    const drum = playOf(t, 'play.beat-river.drum')!;
    const wall = playOf(t, 'play.bell-grove.echo-wall')!;
    expect(parseFloat(drum.style.left)).toBeGreaterThan(parseFloat(wall.style.left));
    expect(parseFloat(drum.style.top)).toBeGreaterThan(parseFloat(wall.style.top)); // y 2200 > 600
  });

  it('보기만 한다: 단추도 링크도 초점도 없다', async () => {
    const t = await bootApp('#/map', { settings: ON });
    for (const el of plays(t)) expect(el.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });

  it('모양 안내에 놀이 악기가 한 줄 더 있다. 개수나 진행률은 없다(6.7)', async () => {
    const t = await bootApp('#/map', { settings: ON });
    const legend = text(q(t.host, '[data-find-legend]'));
    expect(legend).toContain('놀이 악기');
    expect(legend).toContain('소리 조각');
    expect(text(q(t.host, '.map-layout'))).not.toMatch(/남았|남은|\d+\s*\/\s*\d+|\d+\s*%|진행|몇 개/);
  });

  it('놀이 악기가 하나도 없으면(채널에 없으면) 안내에도 없다', async () => {
    const t = await bootApp('#/map', { settings: ON, playInstruments: [] });
    expect(plays(t)).toEqual([]);
    const legend = text(q(t.host, '[data-find-legend]'));
    expect(legend).not.toContain('놀이 악기');
    expect(legend).toContain('소리 조각');
  });

  it('발견 요소가 없고 놀이 악기만 있어도 놀이 악기만 안내한다', async () => {
    const t = await bootApp('#/map', { settings: ON, discoveries: [] });
    expect(finds(t)).toEqual([]);
    expect(plays(t)).toHaveLength(5);
    const legend = text(q(t.host, '[data-find-legend]'));
    expect(legend).toContain('놀이 악기');
    expect(legend).not.toContain('소리 조각');
    expect(legend).not.toContain('속이 찬 것이 찾은 것');
  });
});
