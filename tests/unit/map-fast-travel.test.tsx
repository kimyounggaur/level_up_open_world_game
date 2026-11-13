// @vitest-environment jsdom
// 6-10 전체 지도와 바로 이동(설계서 3.7, 7.7, 12.9): 새 저장에서 정거장 23곳이 처음부터 모두 지도에 있고,
// 두 새 지역(박자 강가 E1–E4, 종나무 숲 W1–W4)을 포함한 모든 정거장으로 '바로 이동'과 '걸어가기'가 닿는다. 이동 지점을 여는 절차는 없다.
// 월드는 가짜로 대신하므로 여기서는 화면이 보내는 명령과 지도의 모양을 본다. 실제 월드에서 서는 것은 흐름 시험(`phase6-travel.flow.ts`)이 본다.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadWorldMap } from '@/app/world-data';
import { STATION_KIND_NAME_KO } from '@/ui/common/format';
import { bootApp, cleanupApps, flush } from './app-rig';
import { click, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

const map = loadWorldMap();
const NEW_REGIONS = { 'beat-river': ['E1', 'E2', 'E3', 'E4'], 'bell-grove': ['W1', 'W2', 'W3', 'W4'] } as const;
const NEW_STATIONS = Object.values(NEW_REGIONS).flat();

describe('새 저장에서 지도는 정거장을 처음부터 모두 보여 준다(3.7)', () => {
  it('정거장은 23곳이고 지역은 여섯이며, 박자 강가와 종나무 숲에는 네 곳씩 있다', () => {
    expect(map.stations).toHaveLength(23);
    expect(map.regions).toHaveLength(6);
    for (const [regionId, ids] of Object.entries(NEW_REGIONS)) {
      expect(map.region(regionId as keyof typeof NEW_REGIONS).stations.map((s) => s.stationId)).toEqual([...ids]);
    }
  });

  it('찾은 것도 다녀간 곳도 없는 새 저장에서 점 23개와 목록 23개가 모두 있다', async () => {
    const t = await bootApp('#/map');
    const want = map.stations.map((s) => s.stationId).sort();
    expect(qa(t.host, '.map-marker').map((m) => m.getAttribute('data-station')).sort()).toEqual(want);
    expect(qa(t.host, '[data-station-item]').map((b) => b.getAttribute('data-station-item')).sort()).toEqual(want);
    expect(q(t.host, '[data-map-surface]')!.getAttribute('aria-label')).toContain('정거장 23곳');
  });

  it('목록은 지역별로 묶이고, 두 새 지역에는 그 지역의 정거장만 들어 있다', async () => {
    const t = await bootApp('#/map');
    for (const region of map.regions) {
      const group = qa(t.host, '.map-station-group').find((g) => g.getAttribute('aria-label') === region.name);
      expect(group, region.name).toBeTruthy();
      expect(qa(group!, '[data-station-item]').map((b) => b.getAttribute('data-station-item'))).toEqual(region.stations.map((s) => s.stationId));
    }
    for (const [regionId, ids] of Object.entries(NEW_REGIONS)) {
      const group = qa(t.host, '.map-station-group').find((g) => g.getAttribute('aria-label') === map.region(regionId as keyof typeof NEW_REGIONS).name)!;
      expect(qa(group, '[data-station-item]').map((b) => b.getAttribute('data-station-item'))).toEqual([...ids]);
    }
  });

  it('잠기거나 흐린 정거장이 없고 이동 지점을 여는 절차도 안내하지 않는다', async () => {
    const t = await bootApp('#/map');
    for (const m of qa<HTMLButtonElement>(t.host, '.map-marker, [data-station-item]')) {
      expect(m.disabled).toBe(false);
      expect(m.getAttribute('aria-disabled')).toBeNull();
      expect(m.className).not.toMatch(/lock|disabled|dim/);
    }
    const all = text(t.host);
    expect(all).toContain('모든 장소가 처음부터 열려 있어요');
    expect(all).not.toMatch(/잠겨|잠김|해금|먼저 .*해야|열어야/);
  });
});

describe('바로 이동과 걸어가기는 어느 정거장에서든 한 번 고르면 닿는다(23곳)', () => {
  for (const st of map.stations) {
    const region = map.region(st.regionId);
    it(`${st.stationId} ${st.name}(${region.name}): 고르면 카드에 그 장소가 나오고, 바로 이동과 걸어가기가 그 정거장 하나로 명령을 보낸다`, async () => {
      // 바로 이동
      const a = await bootApp('#/map');
      a.ready();
      click(q(a.host, `[data-station="${st.stationId}"]`));
      expect(q(a.host, '[data-selected-station]')!.getAttribute('data-selected-station')).toBe(st.stationId);
      expect(text(q(a.host, '#map-card-title'))).toBe(st.name);
      expect(text(q(a.host, '.map-card-region'))).toBe(`${region.name} · ${STATION_KIND_NAME_KO[st.archetype]}`);
      click(q(a.host, '[data-action="teleport"]'));
      await flush();
      expect(a.win.location.hash).toBe('#/');
      expect(a.commands).toEqual([{ type: 'teleport-to-station', stationId: st.stationId }]);

      // 걸어가기: 목록으로 고른다(점을 누르지 않아도 된다)
      const b = await bootApp('#/map');
      b.ready();
      click(q(b.host, `[data-station-item="${st.stationId}"]`));
      expect(q(b.host, '[data-selected-station]')!.getAttribute('data-selected-station')).toBe(st.stationId);
      click(q(b.host, '[data-action="walk"]'));
      await flush();
      expect(b.win.location.hash).toBe('#/');
      expect(b.commands).toEqual([{ type: 'walk-to-station', stationId: st.stationId }]);
    });
  }
});

describe('월드가 아직 준비되지 않았어도 두 새 지역의 8곳 모두 준비된 뒤에 정확히 한 번 선다', () => {
  for (const id of NEW_STATIONS) {
    it(`${id}: 준비 전에는 명령이 나가지 않고, 준비되면 이 정거장으로 한 번만 나간다`, async () => {
      const t = await bootApp('#/map');
      click(q(t.host, `[data-station="${id}"]`));
      click(q(t.host, '[data-action="teleport"]'));
      await flush();
      expect(t.commands).toEqual([]);
      t.ready();
      expect(t.commands).toEqual([{ type: 'teleport-to-station', stationId: id }]);
      await flush();
      expect(t.commands).toHaveLength(1);
    });
  }
});
