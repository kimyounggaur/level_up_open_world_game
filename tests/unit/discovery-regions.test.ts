// 6-9 두 지역(박자 강가, 종나무 숲)과 7-4 세 지역(오선 언덕, 음계 길, 건반 늪)의 발견 요소: 길을 지역 안으로 자르는 계산,
// 지역마다의 월드 모양(길·문·막다른 길), 실제 파일이 3.6의 배치 규칙(걸어서 닿는 곳, 길 가까이 몫, 막다른 길 끝, 간격)과 음역을 지키는지,
// 틀리게 고치면 검사가 잡는지.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDiscoveries, loadDiscoveryFiles, loadPlayInstruments } from '@/app/discovery-data';
import type { ContentIssue } from '@/domain/content';
import {
  DEAD_END_RADIUS,
  MIN_SPACING,
  PENTATONIC_PITCH_CLASSES,
  PIECE_BAR_TICKS,
  ROAD_NEAR,
  clipRoadsToBounds,
  deadEndsOf,
  describePiece,
  distanceToRoads,
  isConceptNote,
  isSoundPiece,
  parseDiscoveryFile,
  validateDiscoveries,
  visibleDiscoveries,
  visiblePlayInstruments,
} from '@/domain/discovery';
import type { ConceptNoteDef, DiscoveryFile, DiscoveryGeometry, RegionRect, RoadLine, SoundPieceDef } from '@/domain/discovery';
import { PAD_RADIUS, padSitesOf } from '@/domain/play';
import { REGION_IDS } from '@/domain/world';
import type { RegionId } from '@/domain/world';
import { NAV_ROWS } from '@/world/generated/worldData';
import { NavGrid } from '@/world/nav';
import { discoveryWorld, validateContentDir } from '../../tools/content-loader';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const codes = (issues: ContentIssue[]): string[] => issues.map((i) => i.code);
/** 마을 밖 다섯 지역(지역 차례) */
const OUTER = ['staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh'] as const;
/** 지역마다 발견 요소 아홉 가운데 길 300 px 안에 있는 수(5/9나 6/9면 규칙 60%±10%를 지킨다, 3.6) */
const NEAR_COUNT: Readonly<Record<(typeof OUTER)[number], number>> = { 'staff-hill': 6, 'beat-river': 6, 'bell-grove': 6, 'scale-trail': 6, 'key-marsh': 5 };
/** 지역마다 길의 막다른 끝(한 곳씩)과 그 끝에서 가장 가까운 발견 요소까지의 거리의 위쪽 한계는 DEAD_END_RADIUS다 */
const DEAD_END: Readonly<Record<(typeof OUTER)[number], { x: number; y: number }>> = {
  'staff-hill': { x: 4056, y: 220 },
  'beat-river': { x: 7800, y: 3081 },
  'bell-grove': { x: 1100, y: 2600 },
  'scale-trail': { x: 7200, y: 5600 },
  'key-marsh': { x: 2840, y: 5100 },
};

// ───── 길 자르기(순수 계산) ─────
describe('길을 지역의 네모 안으로 자르기(clipRoadsToBounds)', () => {
  const R: RegionRect = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
  const road = (id: string, points: Array<[number, number]>, width = 100): RoadLine => ({ id, width, points: points.map(([x, y]) => ({ x, y })) });

  it('지역 안에 통째로 있는 길은 그대로 남고 문이 생기지 않는다', () => {
    const r = road('a', [[100, 100], [900, 100], [900, 800]]);
    expect(clipRoadsToBounds([r], R)).toEqual({ roads: [r], gates: [] });
  });

  it('한쪽이 지역 밖으로 나가면 경계에서 잘리고, 그 경계 자리가 문이다. 지역 안의 끝은 문이 아니다', () => {
    const out = clipRoadsToBounds([road('a', [[500, 500], [1500, 500]])], R);
    expect(out.roads).toEqual([road('a', [[500, 500], [1000, 500]])]);
    expect(out.gates).toEqual([{ x: 1000, y: 500 }]);
    // 안쪽 끝(500, 500)은 진짜 끝이라 막다른 길이다. 경계의 끝은 문이라 막다른 길이 아니다
    expect(deadEndsOf(out.roads, out.gates)).toEqual([{ x: 500, y: 500 }]);
  });

  it('지역을 가로지르는 길은 두 경계가 모두 문이고 막다른 길이 없다', () => {
    const out = clipRoadsToBounds([road('a', [[-500, 300], [1500, 300]])], R);
    expect(out.roads).toEqual([road('a', [[0, 300], [1000, 300]])]);
    expect(out.gates).toEqual([{ x: 0, y: 300 }, { x: 1000, y: 300 }]);
    expect(deadEndsOf(out.roads, out.gates)).toEqual([]);
  });

  it('꺾인 길은 꺾이는 점을 지키며 자른다. 폭은 그대로다', () => {
    const out = clipRoadsToBounds([road('bend', [[200, 200], [600, 200], [600, 1400]], 124)], R);
    expect(out.roads).toEqual([road('bend', [[200, 200], [600, 200], [600, 1000]], 124)]);
    expect(out.gates).toEqual([{ x: 600, y: 1000 }]);
  });

  it('지역 밖만 지나는 길은 사라진다', () => {
    expect(clipRoadsToBounds([road('far', [[1200, 0], [1200, 1000]]), road('far2', [[-300, -300], [-100, 2000]])], R)).toEqual({ roads: [], gates: [] });
  });

  it('경계의 한 점만 스치는 길은 길로 남지 않는다', () => {
    expect(clipRoadsToBounds([road('touch', [[-100, -100], [0, 0]])], R).roads).toEqual([]);
  });

  it('지역을 나갔다 다시 들어오는 길은 토막마다 id#번호를 붙이고 문이 둘씩 생긴다', () => {
    const out = clipRoadsToBounds([road('r', [[500, 500], [1500, 500], [1500, 800], [500, 800]])], R);
    expect(out.roads.map((x) => x.id)).toEqual(['r#1', 'r#2']);
    expect(out.roads[0]!.points).toEqual([{ x: 500, y: 500 }, { x: 1000, y: 500 }]);
    expect(out.roads[1]!.points).toEqual([{ x: 1000, y: 800 }, { x: 500, y: 800 }]);
    expect(out.gates).toEqual([{ x: 1000, y: 500 }, { x: 1000, y: 800 }]);
  });

  it('길이 여럿이어도 길마다 따로 자른다', () => {
    const out = clipRoadsToBounds([road('a', [[500, 100], [500, 1500]]), road('b', [[100, 900], [900, 900]])], R);
    expect(out.roads.map((x) => x.id)).toEqual(['a', 'b']);
    // 'b'는 안에서 끝나는 길이라 문이 없다. 'a'만 아래 경계(y = 1000)에 문이 하나 생긴다(계산 오차는 무시한다)
    expect(out.gates).toHaveLength(1);
    expect(out.gates[0]!.x).toBeCloseTo(500, 6);
    expect(out.gates[0]!.y).toBeCloseTo(1000, 6);
  });
});

// ───── 지역마다의 월드 모양 ─────
describe('지역마다의 월드 모양(discoveryWorld)', () => {
  const defs = loadRegionDefs(root);
  const { geometry, bounds } = discoveryWorld(defs);
  const onEdge = (p: { x: number; y: number }, b: RegionRect): boolean => {
    const inside = p.x >= b.x0 - 1e-6 && p.x <= b.x1 + 1e-6 && p.y >= b.y0 - 1e-6 && p.y <= b.y1 + 1e-6;
    return inside && (Math.abs(p.x - b.x0) < 1e-6 || Math.abs(p.x - b.x1) < 1e-6 || Math.abs(p.y - b.y0) < 1e-6 || Math.abs(p.y - b.y1) < 1e-6);
  };

  it('모든 지역의 범위가 있고, 마을과 다섯 바깥 지역에는 길과 문이 있다', () => {
    for (const id of REGION_IDS) expect(bounds[id], id).toBeDefined();
    for (const id of ['village', ...OUTER] as const) {
      expect(geometry[id]!.roads.length, id).toBeGreaterThan(0);
      expect(geometry[id]!.gates.length, id).toBeGreaterThan(0);
    }
  });

  it('바깥 지역의 길은 모두 그 지역의 범위 안에 있고, 문은 모두 지역의 경계 위에 있다', () => {
    for (const id of OUTER) {
      const b = bounds[id]!;
      for (const road of geometry[id]!.roads) {
        for (const p of road.points) expect(p.x >= b.x0 - 1e-6 && p.x <= b.x1 + 1e-6 && p.y >= b.y0 - 1e-6 && p.y <= b.y1 + 1e-6, `${id} ${road.id} (${p.x}, ${p.y})`).toBe(true);
      }
      for (const g of geometry[id]!.gates) expect(onEdge(g, b), `${id} 문 (${g.x}, ${g.y})`).toBe(true);
    }
  });

  it('박자 강가의 길은 동쪽 바큇살, 음계길로 가는 바큇살, 둘레길 토막이고 강둑 끝(7800, 3081)이 하나뿐인 막다른 길이다', () => {
    const g = geometry['beat-river']!;
    expect(g.roads.map((r) => r.id)).toEqual(['spoke-east', 'spoke-scale', 'loop']);
    expect(g.roads.map((r) => r.width)).toEqual([186, 186, 124]);
    expect(deadEndsOf(g.roads, g.gates)).toEqual([{ x: 7800, y: 3081 }]);
  });

  it('종나무 숲의 길은 서쪽 바큇살과 둘레길 토막이고 서쪽 길의 끝(1100, 2600)이 하나뿐인 막다른 길이다', () => {
    const g = geometry['bell-grove']!;
    expect(g.roads.map((r) => r.id)).toEqual(['spoke-west', 'loop']);
    expect(deadEndsOf(g.roads, g.gates)).toEqual([{ x: 1100, y: 2600 }]);
  });

  it('오선 언덕의 길은 북쪽 바큇살과 둘레길 두 토막이고 꼭대기 쪽 끝(4056, 220)이 하나뿐인 막다른 길이다(7-4)', () => {
    const g = geometry['staff-hill']!;
    expect(g.roads.map((r) => r.id)).toEqual(['spoke-north', 'loop#1', 'loop#2']);
    expect(g.roads.map((r) => r.width)).toEqual([186, 124, 124]);
    expect(deadEndsOf(g.roads, g.gates)).toEqual([DEAD_END['staff-hill']]);
  });

  it('음계 길의 길은 남쪽 바큇살, 박자 강가에서 오는 바큇살, 둘레길이고 길 끝(7200, 5600)이 하나뿐인 막다른 길이다(7-4)', () => {
    const g = geometry['scale-trail']!;
    expect(g.roads.map((r) => r.id)).toEqual(['spoke-south', 'spoke-scale', 'loop']);
    expect(g.roads.map((r) => r.width)).toEqual([186, 186, 124]);
    expect(deadEndsOf(g.roads, g.gates)).toEqual([DEAD_END['scale-trail']]);
  });

  it('건반 늪의 길은 남쪽 바큇살 두 토막과 둘레길이고 길 끝(2840, 5100)이 하나뿐인 막다른 길이다(7-4)', () => {
    const g = geometry['key-marsh']!;
    expect(g.roads.map((r) => r.id)).toEqual(['spoke-south#1', 'spoke-south#2', 'loop']);
    expect(g.roads.map((r) => r.width)).toEqual([186, 186, 124]);
    expect(deadEndsOf(g.roads, g.gates)).toEqual([DEAD_END['key-marsh']]);
  });

  it('마을의 길과 문은 그대로다(길 여섯, 문 다섯, 막다른 길 셋)', () => {
    const g = geometry['village']!;
    expect(g.roads).toHaveLength(6);
    expect(g.gates).toHaveLength(5);
    expect(deadEndsOf(g.roads, g.gates)).toHaveLength(3);
  });

  it('걸어서 닿는 곳은 모든 지역이 한 판을 쓴다: 마을 광장은 닿고 지역 밖 먼 곳이나 강 한가운데는 닿지 않는다', () => {
    const reachable = geometry['village']!.reachable;
    expect(reachable(4056, 3081)).toBe(true);
    for (const id of OUTER) expect(geometry[id]!.reachable, id).toBe(reachable);
    expect(reachable(6950, 1500)).toBe(false);
  });
});

// ───── 실제 파일 ─────
describe('실제 다섯 바깥 지역의 발견 요소(content/discoveries)', () => {
  const defs = loadRegionDefs(root);
  const { geometry, bounds } = discoveryWorld(defs);
  const read = (region: string) => parseDiscoveryFile(JSON.parse(fs.readFileSync(path.join(root, 'content', 'discoveries', `${region}.json`), 'utf-8')), `${region}.json`);

  it('형식이 맞고 지역마다 소리 조각 6, 개념 쪽지 3이다', () => {
    for (const id of OUTER) {
      const parsed = read(id);
      expect(parsed.issues, id).toEqual([]);
      expect(parsed.file!.regionId).toBe(id);
      expect(parsed.file!.items.filter(isSoundPiece), id).toHaveLength(6);
      expect(parsed.file!.items.filter(isConceptNote), id).toHaveLength(3);
    }
  });

  it('콘텐츠 검사 전체(좌표·닿는 곳·길 가까이 몫·막다른 길·간격)를 통과한다', () => {
    expect(validateContentDir(root)).toEqual([]);
  });

  it('지역 안이고, 길 300 px 안의 몫이 지역마다 5/9(56%)나 6/9(67%)이다(규칙은 60%±10%)', () => {
    for (const id of OUTER) {
      const file = read(id).file!;
      const b = bounds[id]!;
      const near = file.items.filter((d) => distanceToRoads(geometry[id]!.roads, d) <= ROAD_NEAR);
      expect(near, id).toHaveLength(NEAR_COUNT[id]);
      expect([5, 6], id).toContain(near.length);
      for (const d of file.items) expect(d.x >= b.x0 && d.x < b.x1 && d.y >= b.y0 && d.y < b.y1, d.discoveryId).toBe(true);
    }
  });

  it('막다른 길 끝 200 px 안에 발견 요소가 있다(꼭대기 길 끝, 강둑 끝, 서쪽 길 끝, 정자 쪽 길 끝, 늪 안쪽 길 끝)', () => {
    for (const id of OUTER) {
      const file = read(id).file!;
      const e = DEAD_END[id];
      const nearest = Math.min(...file.items.map((d) => Math.hypot(d.x - e.x, d.y - e.y)));
      expect(nearest, id).toBeLessThanOrEqual(DEAD_END_RADIUS);
    }
  });

  it('여섯 지역 모두를 통틀어 서로 500 px 이상 떨어져 있고 이름이 겹치지 않는다', () => {
    const all = loadDiscoveries('preview');
    expect(all).toHaveLength(54);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i]!.x - all[j]!.x, all[i]!.y - all[j]!.y), `${all[i]!.discoveryId}~${all[j]!.discoveryId}`).toBeGreaterThanOrEqual(MIN_SPACING);
    }
    expect(new Set(all.map((d) => d.name)).size).toBe(54);
  });

  it('소리 조각은 모두 다장조 5음, 한 마디 안, 자유 가락의 음역(C4~A4) 안이고, 서른여섯 가락이 모두 다르다(음 이름 차례도 모두 다르다)', () => {
    const pieces = visibleDiscoveries(loadDiscoveryFiles(), 'preview').filter(isSoundPiece);
    expect(pieces).toHaveLength(36);
    for (const p of pieces) {
      for (const n of p.notes) {
        expect(PENTATONIC_PITCH_CLASSES, p.discoveryId).toContain(n.midi % 12);
        expect(n.midi, p.discoveryId).toBeGreaterThanOrEqual(60);
        expect(n.midi, p.discoveryId).toBeLessThanOrEqual(69);
      }
      expect(Math.max(...p.notes.map((n) => n.onsetTicks + n.durationTicks)), p.discoveryId).toBeLessThanOrEqual(PIECE_BAR_TICKS);
    }
    expect(new Set(pieces.map((p) => JSON.stringify(p.notes))).size).toBe(36);
    expect(new Set(pieces.map(describePiece)).size).toBe(36);
  });

  it('쪽지는 그 지역의 도전과 교재의 쪽에 이어진다', () => {
    const quests = new Map<string, { placements: Array<{ installationId?: string }> }>();
    for (const f of fs.readdirSync(path.join(root, 'content', 'quests'))) {
      const q = JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', f), 'utf-8'));
      quests.set(q.questId, q);
    }
    for (const id of OUTER) {
      const notes = read(id).file!.items.filter(isConceptNote) as ConceptNoteDef[];
      for (const n of notes) {
        const q = quests.get(n.questId);
        expect(q, `${n.discoveryId}가 잇는 과제 ${n.questId}`).toBeDefined();
        expect(q!.placements.some((p) => p.installationId?.startsWith(`inst.${id}.`)), `${n.discoveryId}: 같은 지역의 설치물에 놓인 과제`).toBe(true);
        expect(n.textbookRefs.length, n.discoveryId).toBeGreaterThan(0);
        expect(n.text.length, n.discoveryId).toBeGreaterThan(10);
      }
      // 한 지역의 쪽지 셋이 서로 다른 설명이다
      expect(new Set(notes.map((n) => n.text)).size).toBe(3);
    }
  });

  it('아직 사람이 검수하지 않았으니 모두 미리보기에만 보인다(11.1, G2 일곱째)', () => {
    for (const id of OUTER) {
      const file = read(id).file!;
      expect(file.items.every((d) => d.availability === 'draft' && d.reviewStatus === 'unreviewed' && d.rightsStatus === 'unconfirmed'), id).toBe(true);
      expect(file.items.filter(isConceptNote).every((n) => n.textbookRefs.every((r) => r.reviewStatus === 'unreviewed' && r.rightsStatus === 'unconfirmed')), id).toBe(true);
      expect(visibleDiscoveries([file], 'release'), id).toEqual([]);
    }
  });
});

// ───── 놀이 악기(3.5) ─────
describe('실제 놀이 악기(높낮이 미끄럼길, 물방울 북, 메아리 벽, 바람개비 줄, 연잎 합창)', () => {
  const defs = loadRegionDefs(root);
  const { geometry, bounds } = discoveryWorld(defs);
  const grid = NavGrid.fromRows(NAV_ROWS);
  const plays = loadPlayInstruments('preview');
  const byId = (id: string) => plays.find((p) => p.playId === id)!;
  const drum = byId('play.beat-river.drum');
  const wall = byId('play.bell-grove.echo-wall');
  const slide = byId('play.staff-hill.pitch-slide');
  const pinwheels = byId('play.scale-trail.pinwheels');
  const lilies = byId('play.key-marsh.lily-chorus');

  it('바깥 지역마다 하나씩, 설계서의 이름과 자리와 음색이다(마을에는 없다). 차례는 지역 차례다', () => {
    expect(plays.map((p) => p.playId)).toEqual(['play.staff-hill.pitch-slide', 'play.beat-river.drum', 'play.bell-grove.echo-wall', 'play.scale-trail.pinwheels', 'play.key-marsh.lily-chorus']);
    expect(plays.map((p) => p.regionId)).toEqual([...OUTER]);
    expect(slide).toMatchObject({ name: '높낮이 미끄럼길', x: 3300, y: 500, timbre: 'chime', echo: false, ground: 'slope' });
    expect(drum).toMatchObject({ name: '물방울 북', x: 7700, y: 2200, timbre: 'thump', echo: false, ground: 'pool' });
    expect(wall).toMatchObject({ name: '메아리 벽', x: 600, y: 600, timbre: 'kalimba', echo: true, ground: 'none' });
    expect(pinwheels).toMatchObject({ name: '바람개비 줄', x: 6550, y: 4540, timbre: 'wood', echo: false, ground: 'rope' });
    expect(lilies).toMatchObject({ name: '연잎 합창', x: 3720, y: 5180, timbre: 'pluck', echo: false, ground: 'lilies' });
    expect(loadDiscoveryFiles().find((f) => f.regionId === 'village')!.playInstruments).toBeUndefined();
  });

  it('돌은 모두 다장조 5음(C D E G A)이고 서로 다른 음이며, 물방울 북은 낮은 음(C3~E4), 나머지 넷은 C4~A4의 다섯 음이다', () => {
    for (const p of plays) {
      const midis = p.pads.map((x) => x.midi);
      for (const m of midis) expect(PENTATONIC_PITCH_CLASSES, `${p.playId} ${m}`).toContain(m % 12);
      expect(new Set(midis).size, p.playId).toBe(midis.length);
    }
    expect(drum.pads.map((x) => x.midi)).toEqual([48, 55, 60, 64]);
    for (const p of [wall, slide, pinwheels, lilies]) expect(p.pads.map((x) => x.midi), p.playId).toEqual([60, 62, 64, 67, 69]);
  });

  it('물방울 북의 돌은 정사각형 모서리(±72)에 네 개, 메아리 벽의 돌은 벽 아래 한 줄에 104 px 간격으로 다섯 개다', () => {
    expect(drum.pads.map((x) => [x.dx, x.dy])).toEqual([[-72, -72], [72, -72], [72, 72], [-72, 72]]);
    expect(wall.pads.map((x) => [x.dx, x.dy])).toEqual([[-208, 110], [-104, 110], [0, 110], [104, 110], [208, 110]]);
  });

  it('높낮이 미끄럼길의 돌은 세로 한 줄에 110 px 간격으로 낮은 음이 아래, 높은 음이 위다. 바람개비 줄의 돌은 가로 한 줄에 110 px 간격으로 낮은 음이 왼쪽이다(7-4)', () => {
    expect(slide.pads.map((x) => [x.dx, x.dy])).toEqual([[0, 220], [0, 110], [0, 0], [0, -110], [0, -220]]);
    expect(pinwheels.pads.map((x) => [x.dx, x.dy])).toEqual([[-220, 0], [-110, 0], [0, 0], [110, 0], [220, 0]]);
  });

  it('연잎 합창의 돌은 지름 120 px 안쪽 원 둘레에 같은 간격으로 다섯 개이고, 음 높이가 시계 방향으로 오른다(7-4)', () => {
    const angles = lilies.pads.map((x) => (Math.atan2(x.dy, x.dx) * 180) / Math.PI);
    for (const x of lilies.pads) expect(Math.hypot(x.dx, x.dy), 'r').toBeCloseTo(120, 0);
    // 위(−90°)에서 시작해 시계 방향으로 72°씩(화면의 y는 아래가 +)
    angles.forEach((a, i) => expect(((a + 90 - i * 72 + 540) % 360) - 180, `${i}번째 돌`).toBeCloseTo(0, 0));
  });

  it('돌이 놓인 땅 전체(가운데, 안쪽 둘레, 가장자리)가 걸을 수 있는 땅이고 지역 안이다', () => {
    for (const p of plays) {
      const b = bounds[p.regionId]!;
      for (const s of padSitesOf(p)) {
        expect(grid.circleHitsBlocked(s.x, s.y), `${p.playId} 돌 ${s.pad} 가운데(캐릭터가 서는 자리)`).toBe(false);
        expect(geometry[p.regionId]!.reachable(s.x, s.y), `${p.playId} 돌 ${s.pad} 걸어서 닿는다`).toBe(true);
        for (const r of [PAD_RADIUS / 2, PAD_RADIUS]) {
          for (let k = 0; k < 16; k++) {
            const x = s.x + r * Math.cos((k * 2 * Math.PI) / 16);
            const y = s.y + r * Math.sin((k * 2 * Math.PI) / 16);
            expect(grid.isBlockedPoint(x, y), `${p.playId} 돌 ${s.pad} 반지름 ${r} ${k}번째 점`).toBe(false);
          }
        }
        expect(s.x - PAD_RADIUS >= b.x0 && s.x + PAD_RADIUS <= b.x1 && s.y - PAD_RADIUS >= b.y0 && s.y + PAD_RADIUS <= b.y1, `${p.playId} 돌 ${s.pad} 지역 안`).toBe(true);
      }
    }
  });

  it('메아리 벽의 가운데는 벽 안(막힘)이고 돌은 벽 아래의 열린 땅이다. 물방울 북의 가운데는 네 돌 사이의 빈 땅이다', () => {
    expect(grid.circleHitsBlocked(wall.x, wall.y)).toBe(true);
    for (const s of padSitesOf(wall)) expect(s.y).toBeGreaterThan(wall.y + 100);
    expect(grid.circleHitsBlocked(drum.x, drum.y)).toBe(false);
  });

  it('발견 요소 쉰넷 어디에서도 500 px 이상 떨어져 있다', () => {
    const items = loadDiscoveries('preview');
    for (const p of plays) for (const d of items) expect(Math.hypot(p.x - d.x, p.y - d.y), `${p.playId}~${d.discoveryId}`).toBeGreaterThanOrEqual(MIN_SPACING);
  });

  it('아직 사람이 검수하지 않았으니 초안이고 미리보기에만 보인다(11.1)', () => {
    for (const p of plays) expect(p, p.playId).toMatchObject({ availability: 'draft', reviewStatus: 'unreviewed', rightsStatus: 'unconfirmed' });
    expect(visiblePlayInstruments(loadDiscoveryFiles(), 'release')).toEqual([]);
  });

  it('놀이 악기는 길 가까이 몫(5/9, 6/9)과 막다른 길 끝 덮기에 세지 않는다: 악기를 빼도 같은 몫이다', () => {
    for (const id of OUTER) {
      const file = parseDiscoveryFile(JSON.parse(fs.readFileSync(path.join(root, 'content', 'discoveries', `${id}.json`), 'utf-8')), `${id}.json`).file!;
      expect(file.items, id).toHaveLength(9);
      const near = file.items.filter((d) => distanceToRoads(geometry[id]!.roads, d) <= ROAD_NEAR);
      expect(near, id).toHaveLength(NEAR_COUNT[id]);
    }
  });
});

// ───── 차례 ─────
describe('여러 지역의 발견 요소 차례', () => {
  it('마을이 맨 앞, 이어서 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪), 지역 안에서는 쪽지가 앞이고 id의 숫자 순서다', () => {
    const files = loadDiscoveryFiles();
    const ids = visibleDiscoveries(files, 'preview').map((d) => d.discoveryId);
    const region = (id: string): RegionId => id.split('.')[1] as RegionId;
    const order: RegionId[] = ['village', 'staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh'];
    expect(ids).toHaveLength(54);
    order.forEach((r, k) => {
      const mine = ids.slice(k * 9, k * 9 + 9);
      expect(mine.every((id) => region(id) === r), r).toBe(true);
      expect(mine, r).toEqual([1, 2, 3].map((n) => `disc.${r}.note-${n}`).concat([1, 2, 3, 4, 5, 6].map((n) => `disc.${r}.piece-${n}`)));
    });
    expect(ids[0]).toBe('disc.village.note-1');
    expect(ids[9]).toBe('disc.staff-hill.note-1');
    expect(ids[18]).toBe('disc.beat-river.note-1');
  });

  it('파일을 읽는 차례가 바뀌어도 마을 조각의 번호(0~5)는 그대로다: 소리와 광장 등의 번호가 흔들리지 않는다', () => {
    const files = loadDiscoveryFiles();
    const reversed = [...files].reverse();
    const pieces = (fs: DiscoveryFile[]): SoundPieceDef[] => visibleDiscoveries(fs, 'preview').filter(isSoundPiece);
    expect(pieces(reversed).map((p) => p.discoveryId)).toEqual(pieces(files).map((p) => p.discoveryId));
    expect(pieces(files).slice(0, 6).map((p) => p.discoveryId)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `disc.village.piece-${n}`));
  });
});

// ───── 길과 틀린 내용 ─────
describe('바깥 지역의 규칙을 어기면 검사가 잡는다', () => {
  const defs = loadRegionDefs(root);
  const world = discoveryWorld(defs);
  const files = loadDiscoveryFiles();
  const fileOf = (id: RegionId): DiscoveryFile => files.find((f) => f.regionId === id)!;
  const ctx = (geometry: Partial<Record<RegionId, DiscoveryGeometry>>) => ({ geometry, bounds: world.bounds });
  const only = (id: RegionId, g: DiscoveryGeometry) => codes(validateDiscoveries([fileOf(id)], ctx({ [id]: g })));

  it('실제 모양으로는 문제가 없다', () => {
    for (const id of OUTER) expect(only(id, world.geometry[id]!), id).toEqual([]);
  });

  it('길이 하나도 없으면 길 가까이 몫이 0%라 걸린다. 모든 곳이 길 곁이어도 걸린다', () => {
    for (const id of OUTER) {
      const real = world.geometry[id]!;
      expect(only(id, { ...real, roads: [], gates: [] }), id).toContain('ROAD_SHARE');
      const wide: RoadLine[] = [{ id: 'everywhere', width: 100, points: fileOf(id).items.map((d) => ({ x: d.x, y: d.y })) }];
      expect(only(id, { ...real, roads: wide }), id).toContain('ROAD_SHARE');
    }
  });

  it('막다른 길의 끝에 발견 요소가 없으면 걸린다: 지역 안에서 끝나는 길의 끝이 막다른 길이다', () => {
    for (const id of OUTER) {
      const end = DEAD_END[id];
      const real = world.geometry[id]!;
      const moved: DiscoveryFile = { ...fileOf(id), items: fileOf(id).items.filter((d) => Math.hypot(d.x - end.x, d.y - end.y) > DEAD_END_RADIUS) };
      expect(moved.items.length, id).toBeLessThan(9);
      expect(codes(validateDiscoveries([moved], ctx({ [id]: real }))), id).toContain('DEAD_END');
    }
  });

  it('길이 지역 경계에서 잘려 끝나는 자리는 막다른 길이 아니다(문이다): 문을 없애면 막다른 길이 늘어 걸린다', () => {
    const real = world.geometry['beat-river']!;
    expect(deadEndsOf(real.roads, real.gates)).toHaveLength(1);
    expect(deadEndsOf(real.roads, [])).toHaveLength(1 + real.gates.length);
    expect(only('beat-river', { ...real, gates: [] })).toContain('DEAD_END');
  });

  it('지역 밖으로 옮기면 지역 밖 오류, 걸어서 닿지 않는 곳이면 닿지 않는 곳 오류', () => {
    for (const id of OUTER) {
      const f = fileOf(id);
      // 광장 한가운데(4056, 3081)는 두 바깥 지역 어디의 범위도 아니다
      const out: DiscoveryFile = { ...f, items: f.items.map((d, i) => (i === 0 ? { ...d, x: 4056, y: 3081 } : d)) };
      expect(codes(validateDiscoveries([out], ctx({ [id]: world.geometry[id]! }))), id).toContain('OUTSIDE');
    }
    const f = fileOf('beat-river');
    const river: DiscoveryFile = { ...f, items: f.items.map((d, i) => (i === 0 ? { ...d, x: 6950, y: 1500 } : d)) };
    expect(codes(validateDiscoveries([river], ctx({ 'beat-river': world.geometry['beat-river']! })))).toContain('UNREACHABLE');
  });

  describe('파일을 고쳐 넣으면(원본은 건드리지 않는다)', () => {
    const dirs: string[] = [];
    afterEach(() => {
      while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
    });
    /** content/를 임시 폴더에 복사해 한 지역의 발견 요소 파일만 고친 뒤 전체를 검사한다 */
    function damaged(region: (typeof OUTER)[number], mutate: (r: Record<string, any>) => void): string[] {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-region-'));
      dirs.push(tmp);
      fs.cpSync(path.join(root, 'content'), path.join(tmp, 'content'), { recursive: true });
      const target = path.join(tmp, 'content', 'discoveries', `${region}.json`);
      const r = JSON.parse(fs.readFileSync(target, 'utf-8'));
      mutate(r);
      fs.writeFileSync(target, JSON.stringify(r));
      return codes(validateContentDir(tmp));
    }

    it('고치지 않고 복사만 하면 문제가 없다(시험 장치 확인)', () => {
      for (const id of OUTER) expect(damaged(id, () => undefined), id).toEqual([]);
    });
    it('이웃에 바짝 붙이면 간격 오류, 다른 지역의 조각에 붙여도 간격 오류', () => {
      expect(damaged('beat-river', (r) => ((r['items'][1].x = r['items'][0].x + 100), (r['items'][1].y = r['items'][0].y)))).toContain('SPACING');
      // 종나무 숲의 조각을 마을의 조각 곁(첫걸음 근처)으로
      expect(damaged('bell-grove', (r) => ((r['items'][0].x = 2600), (r['items'][0].y = 3000)))).toContain('SPACING');
    });
    it('조각을 강 한가운데로 옮기면 닿지 않는 곳 오류', () => {
      expect(damaged('beat-river', (r) => ((r['items'][0].x = 6950), (r['items'][0].y = 1500)))).toContain('UNREACHABLE');
    });
    it('강둑 끝의 조각을 치우면 막다른 길 오류', () => {
      // 박자 강가의 강둑 끝(7800, 3081)에 있는 발견 요소는 piece-4 '강둑 끝 노래'
      expect(damaged('beat-river', (r) => {
        const it = r['items'].find((d: any) => d.discoveryId === 'disc.beat-river.piece-4');
        it.x = 6000;
        it.y = 3900;
      })).toContain('DEAD_END');
    });
    it('서쪽 길 끝의 쪽지를 치우면 막다른 길 오류', () => {
      expect(damaged('bell-grove', (r) => {
        const it = r['items'].find((d: any) => d.discoveryId === 'disc.bell-grove.note-2');
        it.x = 450;
        it.y = 3100;
      })).toContain('DEAD_END');
    });
    it('쪽지의 교재 쪽을 지우거나 없는 과제를 가리키면 오류', () => {
      expect(damaged('beat-river', (r) => (r['items'].find((d: any) => d.kind === 'conceptNote').textbookRefs = []))).toContain('NOTE_SOURCE');
      expect(damaged('bell-grove', (r) => (r['items'].find((d: any) => d.kind === 'conceptNote').questId = 'no.such.quest'))).toContain('REF_QUEST');
    });
    it('개수가 맞지 않으면 오류, 검수 없이 공개로 바꾸면 공개 오류', () => {
      expect(damaged('bell-grove', (r) => r['items'].pop())).toContain('COUNT');
      expect(damaged('beat-river', (r) => (r['items'][0].availability = 'published'))).toContain('PUBLISHED_UNREVIEWED');
    });
    it('조각의 음이 5음 음계 밖이거나 길이가 틀리면 오류', () => {
      expect(damaged('beat-river', (r) => (r['items'][0].notes[0].midi = 61))).toContain('PIECE_SCALE');
      expect(damaged('bell-grove', (r) => (r['items'][0].notes[0].durationTicks = 1000))).toContain('PIECE_LENGTH');
    });
  });
});
