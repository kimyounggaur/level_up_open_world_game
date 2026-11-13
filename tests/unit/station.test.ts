// 3-6, W-1, W-2: 정거장에서 과제로. 열 수 있는 과제가 하나뿐인 작업대는 바로 패널, 그 밖에는 정거장 안내.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stationTarget } from '../../src/app/station';
import { ContentCatalog } from '../../src/domain/catalog';
import type { QuestDefinition } from '../../src/domain/content';
import { stationQuests } from '../../src/domain/station-quests';
import { WorldMap } from '../../src/domain/world';
import { stationHash } from '../../src/platform/router';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(__dirname, '../..');
const read = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const defs = ['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar', 'scale.major'].map(read);
const preview = new ContentCatalog(defs, 'preview');
const release = new ContentCatalog(defs, 'release');
const map = new WorldMap(loadRegionDefs(root));
const PANELS = new Set(['panel.clef', 'panel.rhythm']);
const st = (id: string) => map.station(id)!;

describe('작업대(H1, H2)', () => {
  it('H1은 Q01 패널로, H2는 Q02 패널로 바로 연다(3-6 완료 기준)', () => {
    expect(stationTarget(preview, PANELS, st('H1'))).toBe('#/q/pitch.same-note-two-clefs/middle-c');
    expect(stationTarget(preview, PANELS, st('H2'))).toBe('#/q/rhythm.rest-in-a-bar/quarter-rest');
  });

  it('H1에 놓인 과제 중 Q04는 아직 만들지 않았다고 말하고, 열린 척하지 않는다', () => {
    const qs = stationQuests(preview, PANELS, st('H1'));
    expect(qs.map((q) => q.number)).toEqual(['Q01', 'Q04']);
    expect(qs[0]).toMatchObject({ questId: 'pitch.same-note-two-clefs', openable: true, state: 'unreviewed', note: null });
    expect(qs[1]).toMatchObject({ questId: 'pitch.same-sound-different-names', openable: false, hash: null, state: 'planned' });
    expect(qs[1]!.note).toContain('준비 중');
    expect(qs[1]!.title).toBe('같은 높이의 다른 이름');
  });

  it('검수 전 과제는 preview에서만 열린다. release에서는 정거장 안내가 \'준비 중\'이라고 말한다(W-10)', () => {
    expect(stationTarget(release, PANELS, st('H1'))).toBe(stationHash('H1'));
    const q = stationQuests(release, PANELS, st('H1'))[0]!;
    expect(q).toMatchObject({ openable: false, hash: null, state: 'preparing' });
    expect(q.note).toContain('준비 중');
  });
});

describe('열 수 없는 정거장', () => {
  it('아직 아무 과제도 없는 작업대(H3)는 안내가 열린다', () => {
    expect(stationTarget(preview, PANELS, st('H3'))).toBe('#/s/H3');
    expect(stationQuests(preview, PANELS, st('H3')).every((q) => !q.openable && q.state === 'planned')).toBe(true);
  });

  it('설치물(H4 음계 디딤돌)은 과제가 카탈로그에 있어도 패널 화면이 없으면 안내가 열리고 이유를 말한다', () => {
    expect(stationTarget(preview, PANELS, st('H4'))).toBe('#/s/H4');
    const q = stationQuests(preview, PANELS, st('H4'))[0]!;
    expect(q).toMatchObject({ questId: 'scale.major', number: 'Q07', openable: false });
    expect(q.note).toBe('화면을 만드는 중이에요.');
  });

  it('패널 화면이 만들어지면 같은 과제가 열린다(설치물 정거장은 4단계까지 안내를 거친다)', () => {
    const withScale = new Set([...PANELS, 'panel.scale']);
    expect(stationQuests(preview, withScale, st('H4'))[0]!.openable).toBe(true);
    expect(stationTarget(preview, withScale, st('H4'))).toBe('#/s/H4'); // 설치물은 정거장 안내(설치물 모드는 4단계)
  });

  it('열 수 있는 과제가 둘 이상인 작업대는 고르는 안내가 열린다', () => {
    const two = { stationId: 'HX', kind: 'panel' as const, questIds: ['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar'] };
    expect(stationTarget(preview, PANELS, two)).toBe('#/s/HX');
    expect(stationQuests(preview, PANELS, two).filter((q) => q.openable)).toHaveLength(2);
  });

  it('계획에 없는 과제 id도 죽지 않고 id를 이름으로 보여 준다', () => {
    const q = stationQuests(preview, PANELS, { questIds: ['nope.unknown'] })[0]!;
    expect(q).toMatchObject({ number: null, title: 'nope.unknown', openable: false, state: 'planned' });
  });
});

describe('W-1: 23개 정거장 모두에 닿는 곳이 있다', () => {
  it.each(['preview', 'release'] as const)('%s: 정거장마다 패널 주소나 정거장 안내 주소 중 하나로 열린다', (ch) => {
    const cat = ch === 'preview' ? preview : release;
    const stations = map.stations;
    expect(stations).toHaveLength(23);
    for (const s of stations) {
      const t = stationTarget(cat, PANELS, s);
      expect(t.startsWith('#/q/') || t === stationHash(s.stationId), `${s.stationId}: ${t}`).toBe(true);
    }
  });
});
