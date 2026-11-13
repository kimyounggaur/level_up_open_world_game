// 7-6 주민(악사) 여섯 명과 한 줄 안내(설계서 1.5, 6.6, 9.3, 12.10): 순수 계산만 본다.
// 월드의 그림은 resident-layer.test.ts, 월드 실행부는 world-residents.test.ts, 앱은 app-residents.test.tsx, 진짜 Chrome은 tests/flow/phase7-residents.flow.ts가 본다.
// 완료 기준 '안내는 사실과 추천 이유만 말한다'(W-9)는 맨 아래 문구 시험이 본다: 모든 주민 × 층 × 상태에서 한 줄의 글을 만들어 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDiscoveries } from '@/app/discovery-data';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { ContentCatalog } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { BOARD_SPOT, spotsOf } from '@/domain/discovery';
import { slotBounds } from '@/domain/installation';
import { MUSICIAN_NAME_KO } from '@/domain/festival';
import { PLANNED_QUESTS } from '@/domain/world';
import { INTERACT_RANGE, PLAYER_START, REGION_IDS, WorldMap, regionBoundsPx, standOf } from '@/domain/world';
import { RESIDENTS, RESIDENT_BLINK_SEC, RESIDENT_FRAME, RESIDENT_LINE_MAX, RESIDENT_PART, RESIDENT_PLAYING_FRAMES, RESIDENT_STANDING_FRAMES, layerFact, partNoun, playingResidents, residentIdOf, residentOf, residentPose, residentSay, residentSpots } from '@/domain/residents';
import type { ResidentDef, ResidentSayInput } from '@/domain/residents';
import { BAR_SEC, ENSEMBLE_LAYER_REGION } from '@/domain/worldsound';
import { topicName } from '@/ui/common/format';
import { NavGrid, findPath } from '../../src/world/nav';
import { NAV_ROWS, WORLD_OBJECTS } from '../../src/world/generated/worldData';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const allDefs = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const map = new WorldMap(loadRegionDefs(root));
const grid = NavGrid.fromRows(NAV_ROWS);
const full = new ContentCatalog(allDefs, 'preview');
const discoveries = loadDiscoveries('preview');
/** 설치물이 놓인 자리: 돌 전체와 이름표 띠를 감싸는 사각형(카메라가 설치물 전체를 담을 때 쓰는 것) */
const installationRects = fs
  .readdirSync(path.join(root, 'content', 'installations'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const def = readJson('content', 'installations', f) as { installationId: string; slots: never; slotMap?: never };
    return { id: def.installationId, rect: slotBounds(def as never) };
  });

const byRegion = (id: string): ResidentDef => RESIDENTS.find((r) => r.regionId === id)!;
const BEAT = BAR_SEC / 4;

let n = 0;
function attempt(questId: string, revised: boolean): AttemptResult {
  return makeAttemptResult({
    attemptId: `r${++n}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: !revised, issues: revised ? [{ code: 'WRONG_PITCH', params: {} }] : [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);
}

const input = (over: Partial<ResidentSayInput> = {}): ResidentSayInput => ({ catalog: full, map, attempts: [], opened: new Set(), currentQuestId: null, topicName, layer: 0, ...over });
const questsOf = (regionId: string): string[] => [...new Set(map.region(regionId as never).stations.flatMap((s) => s.questIds))];

describe('주민 여섯 명', () => {
  it('지역마다 한 명이다: 지역의 차례이고 id는 resident.<지역 id>다', () => {
    expect(RESIDENTS.map((r) => r.regionId)).toEqual([...REGION_IDS]);
    expect(RESIDENTS.map((r) => r.residentId)).toEqual(REGION_IDS.map((id) => `resident.${id}`));
    expect(REGION_IDS.map(residentIdOf)).toEqual(RESIDENTS.map((r) => r.residentId));
    expect(RESIDENTS).toHaveLength(6);
  });

  it('이름은 지역 이름(지역 파일)과 성부 이름으로 이루어지고 서로 다르다(상호작용할 수 있는 사물은 모두 이름이 있다, 7.4)', () => {
    for (const r of RESIDENTS) expect(r.name).toBe(`${map.region(r.regionId).name}의 ${MUSICIAN_NAME_KO[r.part]}`);
    expect(new Set(RESIDENTS.map((r) => r.name)).size).toBe(6);
    expect(RESIDENTS.map((r) => r.name)).toEqual(['음악 마을의 화음 악사', '오선 언덕의 가락 악사', '박자 강가의 타악 악사', '종나무 숲의 베이스 악사', '음계 길의 달리는 음 악사', '건반 늪의 꾸밈음 악사']);
  });

  it('맡은 성부는 합주의 성부와 지역의 짝이다(6.2): 마을은 화음 깔기, 나머지는 그 지역이 맡은 성부', () => {
    expect(RESIDENT_PART.village).toBe('bed');
    for (const [key, regionId] of Object.entries(ENSEMBLE_LAYER_REGION)) {
      if (key === 'village') continue;
      expect(RESIDENT_PART[regionId], regionId).toBe(key);
    }
    // 여섯 주민이 여섯 다른 성부를 맡는다
    expect(new Set(RESIDENTS.map((r) => r.part)).size).toBe(6);
  });

  it('residentOf는 id로 찾고, 모르는 id는 undefined다', () => {
    expect(residentOf('resident.staff-hill')).toBe(byRegion('staff-hill'));
    expect(residentOf('resident.nowhere')).toBeUndefined();
    expect(residentOf('board.plaza')).toBeUndefined();
  });

  it('그림 칸은 48×72이고 서 있기 2장, 연주 4장이다(9.3)', () => {
    expect(RESIDENT_FRAME).toEqual({ w: 48, h: 72 });
    expect(RESIDENT_STANDING_FRAMES).toBe(2);
    expect(RESIDENT_PLAYING_FRAMES).toBe(4);
  });
});

describe('주민이 서는 자리(7.4 안내 칩, W-1 길을 막지 않는다)', () => {
  const spots = spotsOf(discoveries);
  const others = [...spots.map((s) => ({ id: s.id, x: s.x, y: s.y })), ...map.stations.map((s) => ({ id: s.stationId, ...standOf(s) }))];

  it('자기 지역 안쪽에 있다: 경계에서 250 px 넘게 떨어져 있어서 안내 칩 범위가 다른 지역으로 넘어가지 않는다', () => {
    for (const r of RESIDENTS) {
      const b = regionBoundsPx(map.region(r.regionId));
      expect(r.x, r.name).toBeGreaterThanOrEqual(b.x0 + 250);
      expect(r.x, r.name).toBeLessThanOrEqual(b.x1 - 250);
      expect(r.y, r.name).toBeGreaterThanOrEqual(b.y0 + 250);
      expect(r.y, r.name).toBeLessThanOrEqual(b.y1 - 250);
    }
  });

  it('걸어서 닿는 자리에 있다: 둘레 100 px 안이 모두 걸을 수 있는 땅이다', () => {
    for (const r of RESIDENTS) {
      expect(grid.circleHitsBlocked(r.x, r.y), r.name).toBe(false);
      for (let a = 0; a < 360; a += 30) {
        const x = r.x + 100 * Math.cos((a * Math.PI) / 180);
        const y = r.y + 100 * Math.sin((a * Math.PI) / 180);
        expect(grid.circleHitsBlocked(x, y), `${r.name} ${a}도`).toBe(false);
      }
    }
  });

  it('시작 자리에서 걸어서 갈 수 있다(바꾸지 않은 길이 있다)', () => {
    for (const r of RESIDENTS) {
      const path = findPath(grid, { x: PLAYER_START.x, y: PLAYER_START.y }, { x: r.x, y: r.y });
      expect(path, r.name).not.toBeNull();
      expect(path!.adjusted, r.name).toBe(false);
    }
  });

  it('사물 그림(나무, 표지판, 소품)과 겹치지 않는다: 48×72 칸 전체가 비어 있다', () => {
    for (const r of RESIDENTS) {
      const cell = { x0: r.x - RESIDENT_FRAME.w / 2, x1: r.x + RESIDENT_FRAME.w / 2, y0: r.y - RESIDENT_FRAME.h, y1: r.y };
      for (const ob of WORLD_OBJECTS) {
        const x0 = ob.x - ob.ax * ob.w;
        const y0 = ob.y - ob.ay * ob.h;
        const hit = cell.x1 > x0 && cell.x0 < x0 + ob.w && cell.y1 > y0 && cell.y0 < y0 + ob.h;
        expect(hit, `${r.name}이 ${ob.id}와 겹침`).toBe(false);
      }
    }
  });

  it('설치물이 놓인 자리와 겹쳐 서지 않는다: 48×72 칸이 어느 설치물의 돌과 이름표 띠에서도 한 몸 폭(24 px) 넘게 떨어져 있다(사진으로 본 종탑 기둥과의 겹침을 막는다)', () => {
    expect(installationRects.length, '설치물 20개').toBe(20);
    for (const r of RESIDENTS) {
      const cell = { x0: r.x - RESIDENT_FRAME.w / 2, x1: r.x + RESIDENT_FRAME.w / 2, y0: r.y - RESIDENT_FRAME.h, y1: r.y };
      for (const inst of installationRects) {
        const dx = Math.max(inst.rect.x - cell.x1, cell.x0 - (inst.rect.x + inst.rect.w), 0);
        const dy = Math.max(inst.rect.y - cell.y1, cell.y0 - (inst.rect.y + inst.rect.h), 0);
        expect(Math.hypot(dx, dy), `${r.name}이 ${inst.id}에서`).toBeGreaterThan(24);
      }
    }
  });

  it('가장 가까운 사물이 헷갈리지 않게, 다른 자리·정거장의 서는 자리·다른 주민에서 칩 범위의 두 배 넘게 떨어져 있다', () => {
    for (const r of RESIDENTS) {
      for (const o of others) expect(Math.hypot(o.x - r.x, o.y - r.y), `${r.name} - ${o.id}`).toBeGreaterThan(INTERACT_RANGE * 2);
      for (const p of RESIDENTS) if (p !== r) expect(Math.hypot(p.x - r.x, p.y - r.y), `${r.name} - ${p.name}`).toBeGreaterThan(INTERACT_RANGE * 2);
    }
    expect(BOARD_SPOT.id).toBe('board.plaza');
  });

  it('주민의 id는 정거장, 발견 요소, 게시판의 id와 겹치지 않는다', () => {
    const ids = [...spots.map((s) => s.id), ...map.stations.map((s) => s.stationId), ...RESIDENTS.map((r) => r.residentId)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('월드의 자리(residentSpots)', () => {
  it("월드가 여는 자리로 옮긴다: 종류는 'resident', 이름과 좌표는 그대로다", () => {
    const spots = residentSpots();
    expect(spots).toHaveLength(6);
    spots.forEach((s, i) => {
      const r = RESIDENTS[i]!;
      expect(s).toEqual({ id: r.residentId, name: r.name, x: r.x, y: r.y, kind: 'resident' });
    });
  });

  it('일부 주민만 넘겨도 그만큼만 만든다', () => {
    expect(residentSpots([byRegion('key-marsh')]).map((s) => s.id)).toEqual(['resident.key-marsh']);
    expect(residentSpots([])).toEqual([]);
  });
});

describe('연주하는 주민(그 지역의 층이 1 이상)', () => {
  it('층이 없으면 아무도 연주하지 않는다', () => {
    expect(playingResidents(() => undefined)).toEqual([]);
    expect(playingResidents(() => 0)).toEqual([]);
  });

  it('층이 1 이상인 지역의 주민만 지역의 차례로 연주한다', () => {
    const layers: Record<string, number> = { 'staff-hill': 1, 'bell-grove': 3, 'key-marsh': 2 };
    expect(playingResidents((id) => layers[id])).toEqual(['resident.staff-hill', 'resident.bell-grove', 'resident.key-marsh']);
  });

  it('모든 지역의 층이 올라가면 여섯 모두 연주한다. 층은 0–3으로 맞춘다(범위 밖의 값이나 NaN은 0이나 3으로 본다)', () => {
    expect(playingResidents(() => 3)).toHaveLength(6);
    expect(playingResidents(() => 99)).toHaveLength(6);
    expect(playingResidents(() => -4)).toEqual([]);
    expect(playingResidents(() => Number.NaN)).toEqual([]);
  });

  it('층이 오르기만 하면 연주하는 주민은 늘기만 한다(W-6: 반응은 더해질 뿐)', () => {
    let prev: string[] = [];
    for (let layer = 0; layer <= 3; layer++) {
      const now = playingResidents(() => layer);
      for (const id of prev) expect(now).toContain(id);
      prev = now;
    }
  });
});

describe('그림의 장(서 있기 2장, 연주 4장)', () => {
  it('연주는 박마다 한 장씩 넘어가 한 마디(네 박)에 네 장이 한 바퀴 돈다', () => {
    const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((beat) => residentPose(true, beat * BEAT + 0.01, false));
    expect(frames.map((f) => f.pose)).toEqual(Array(8).fill('playing'));
    expect(frames.map((f) => f.frame)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('서 있기는 눈을 뜬 장(0)이 길고 마디의 끝 0.3초만 눈을 감은 장(1)이다', () => {
    expect(residentPose(false, 0, false)).toEqual({ pose: 'standing', frame: 0 });
    expect(residentPose(false, BAR_SEC - RESIDENT_BLINK_SEC - 0.01, false)).toEqual({ pose: 'standing', frame: 0 });
    expect(residentPose(false, BAR_SEC - RESIDENT_BLINK_SEC, false)).toEqual({ pose: 'standing', frame: 1 });
    expect(residentPose(false, BAR_SEC - 0.01, false)).toEqual({ pose: 'standing', frame: 1 });
    expect(residentPose(false, BAR_SEC, false)).toEqual({ pose: 'standing', frame: 0 });
    expect(residentPose(false, 5 * BAR_SEC + 2.8, false)).toEqual({ pose: 'standing', frame: 1 });
  });

  it('장의 번호는 늘 틀 안에 있다(시계를 바꿔 가며 훑는다)', () => {
    for (let t = 0; t < 40; t += 0.07) {
      expect(residentPose(true, t, false).frame).toBeLessThan(RESIDENT_PLAYING_FRAMES);
      expect(residentPose(false, t, false).frame).toBeLessThan(RESIDENT_STANDING_FRAMES);
    }
  });

  it('움직임 줄이기에서는 넘어가지 않는다: 연주는 연주 첫 장, 서 있기는 눈을 뜬 장', () => {
    for (const t of [0, 0.4, 1.1, 2.9, 7.3]) {
      expect(residentPose(true, t, true)).toEqual({ pose: 'playing', frame: 0 });
      expect(residentPose(false, t, true)).toEqual({ pose: 'standing', frame: 0 });
    }
  });

  it('시계가 이상한 값(음수, NaN, 무한)이어도 첫 장에 선다', () => {
    for (const t of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(residentPose(true, t, false)).toEqual({ pose: 'playing', frame: 0 });
      expect(residentPose(false, t, false)).toEqual({ pose: 'standing', frame: 0 });
    }
  });
});

describe('층에 대한 사실 한 줄(layerFact)', () => {
  const region = (id: string): string => map.region(id as never).name;

  it('층 0: 그 지역에서 도전을 하나 통과하면 그 성부가 합주에 더해진다는 규칙을 말한다(받침에 맞는 조사)', () => {
    expect(layerFact(byRegion('village'), region('village'), 0)).toBe('음악 마을에서 도전을 하나 통과하면 합주에 화음이 더해져요.');
    expect(layerFact(byRegion('staff-hill'), region('staff-hill'), 0)).toBe('오선 언덕에서 도전을 하나 통과하면 합주에 가락이 더해져요.');
    expect(layerFact(byRegion('beat-river'), region('beat-river'), 0)).toBe('박자 강가에서 도전을 하나 통과하면 합주에 타악이 더해져요.');
    expect(layerFact(byRegion('bell-grove'), region('bell-grove'), 0)).toBe('종나무 숲에서 도전을 하나 통과하면 합주에 베이스가 더해져요.');
    expect(layerFact(byRegion('scale-trail'), region('scale-trail'), 0)).toBe('음계 길에서 도전을 하나 통과하면 합주에 달리는 음이 더해져요.');
    expect(layerFact(byRegion('key-marsh'), region('key-marsh'), 0)).toBe('건반 늪에서 도전을 하나 통과하면 합주에 꾸밈음이 더해져요.');
  });

  it('층 1–3: 합주에 그 성부가 몇 층으로 더해져 있는지를 말한다', () => {
    expect(layerFact(byRegion('staff-hill'), region('staff-hill'), 1)).toBe('합주에 가락이 1층으로 더해져 있어요.');
    expect(layerFact(byRegion('bell-grove'), region('bell-grove'), 2)).toBe('합주에 베이스가 2층으로 더해져 있어요.');
    expect(layerFact(byRegion('key-marsh'), region('key-marsh'), 3)).toBe('합주에 꾸밈음이 3층으로 더해져 있어요.');
  });

  it('층은 0–3으로 맞춘다', () => {
    expect(layerFact(byRegion('village'), region('village'), 9)).toBe('합주에 화음이 3층으로 더해져 있어요.');
    expect(layerFact(byRegion('village'), region('village'), -1)).toContain('통과하면');
  });

  it('성부의 이름은 악사 이름에서 악사를 뗀 것이다', () => {
    expect(RESIDENTS.map((r) => partNoun(r.part))).toEqual(['화음', '가락', '타악', '베이스', '달리는 음', '꾸밈음']);
  });
});

describe('한 줄 안내(residentSay): 추천이 있으면 추천의 이유, 없으면 층의 사실', () => {
  it('아무것도 열지 않았으면 그 지역의 첫 정거장에 놓인 과제를 알려 주고 추천의 이유를 그대로 붙인다', () => {
    const say = residentSay(byRegion('staff-hill'), input());
    expect(say.kind).toBe('recommendation');
    const first = map.region('staff-hill').stations.flatMap((s) => s.questIds).map((id) => full.get(id)).find((e) => e !== undefined)!;
    expect(say.questId).toBe(first.questId);
    const station = map.region('staff-hill').stations.find((s) => s.questIds.includes(first.questId))!;
    expect(say.text).toContain(`'${first.title}'`);
    expect(say.text).toContain(`${station.name}에 있어요.`);
    expect(say.text.endsWith('지금 있는 오선 언덕에서 아직 열어 보지 않은 도전이에요.')).toBe(true);
  });

  it('마을의 주민은 음자리 작업대의 같은 음의 자리 찾기를 말한다(조사는 받침에 맞춘다)', () => {
    const say = residentSay(byRegion('village'), input());
    expect(say).toEqual({
      text: "'같은 음의 자리 찾기'는 음자리 작업대에 있어요. 지금 있는 음악 마을에서 아직 열어 보지 않은 도전이에요.",
      questId: 'pitch.same-note-two-clefs',
      kind: 'recommendation',
    });
  });

  it('열어 본 과제는 말하지 않고 다음 과제를 말한다', () => {
    const first = residentSay(byRegion('beat-river'), input());
    const second = residentSay(byRegion('beat-river'), input({ opened: new Set([first.questId!]) }));
    expect(second.kind).toBe('recommendation');
    expect(second.questId).not.toBe(first.questId);
  });

  it('그 지역의 과제를 모두 열었으면 층의 사실 한 줄만 말한다. 열린 것이 없으니 questId는 null이다', () => {
    const opened = new Set(questsOf('key-marsh'));
    expect(residentSay(byRegion('key-marsh'), input({ opened, layer: 0 }))).toEqual({
      text: '건반 늪에서 도전을 하나 통과하면 합주에 꾸밈음이 더해져요.',
      questId: null,
      kind: 'layer',
    });
    expect(residentSay(byRegion('key-marsh'), input({ opened, layer: 2 }))).toEqual({ text: '합주에 꾸밈음이 2층으로 더해져 있어요.', questId: null, kind: 'layer' });
  });

  it('지금 열 수 있는 과제가 없으면(openable이 모두 거절) 추천 없이 층의 사실만 말한다: 공개 채널의 준비 중인 과제를 알리지 않는다(W-10)', () => {
    const say = residentSay(byRegion('village'), input({ openable: () => false, layer: 1 }));
    expect(say).toEqual({ text: '합주에 화음이 1층으로 더해져 있어요.', questId: null, kind: 'layer' });
  });

  it('지금 하는 과제의 기본 연습이 그 지역에 있으면 그 이유를 말한다: Q08에서 이어진 Q02는 박자 강가의 첫 징검다리에 있다', () => {
    // 규칙 1이 규칙 3보다 먼저다. 박자 강가의 열어 보지 않은 과제는 첫 징검다리(Q02)부터이므로 기본 연습이어도 같은 과제가 먼저 올라온다
    const say = residentSay(byRegion('beat-river'), input({ currentQuestId: 'song.short-piece' }));
    expect(say.kind).toBe('recommendation');
    expect(say.text).toContain("지금 하는 '선택한 짧은 곡 완성하기'에 이어진 기본 연습이에요.");
    expect(say.questId).toBe('rhythm.rest-in-a-bar');
  });

  it('기본 연습이 다른 지역에 있으면 그 지역의 주민이 말한다: 오선 언덕의 주민은 Q08의 연습을 말하지 않는다', () => {
    const say = residentSay(byRegion('staff-hill'), input({ currentQuestId: 'song.short-piece' }));
    expect(say.text).not.toContain('기본 연습');
    expect(say.text).toContain('아직 열어 보지 않은 도전이에요.');
  });

  it('최근에 여러 번 고친 과제와 주제가 같은 과제가 그 지역에 있으면 그 이유를 말한다', () => {
    const revised = [attempt('rhythm.rest-in-a-bar', true), attempt('rhythm.rest-in-a-bar', true)];
    const all = new Set(questsOf('beat-river'));
    all.delete('rhythm.rest-lengths'); // 같은 주제(쉼표)의 다른 과제를 열어 보지 않았다
    const say = residentSay(byRegion('beat-river'), input({ attempts: revised, opened: all, topicName }));
    expect(say.kind).toBe('recommendation');
    expect(say.text).toContain("'쉼이 있는 한 마디'에서 고칠 곳이 여러 번 나왔어요.");
  });

  it('주민은 열 수 있는 과제만 알린다: 공개 채널에서 draft인 과제는 openable이 거절한다', () => {
    const only = (id: string) => (e: { questId: string }): boolean => e.questId === id;
    const say = residentSay(byRegion('village'), input({ openable: only('rhythm.rest-in-a-bar') }));
    expect(say.questId).toBe('rhythm.rest-in-a-bar');
    expect(say.text).toContain('리듬 작업대에 있어요.');
  });

  it('같은 입력이면 같은 말이다(무작위가 없다)', () => {
    const a = residentSay(byRegion('scale-trail'), input({ layer: 2 }));
    const b = residentSay(byRegion('scale-trail'), input({ layer: 2 }));
    expect(b).toEqual(a);
  });

  it('말하는 것으로는 아무것도 바뀌지 않는다: 입력을 고치지 않는다(열어 본 과제, 기록)', () => {
    const opened = new Set<string>();
    const attempts = [attempt('rhythm.rest-in-a-bar', true)];
    const before = JSON.stringify([...opened, attempts]);
    residentSay(byRegion('beat-river'), input({ opened, attempts }));
    expect(JSON.stringify([...opened, attempts])).toBe(before);
    expect(opened.size).toBe(0);
  });
});

// ───── 완료 기준: 안내는 사실과 추천 이유만 말한다(W-9) ─────

/** 능력이나 나이를 추정하는 말, 평가하는 말, 해야 한다고 시키는 말, 경고하는 말, 6.7이 넣지 않는다고 한 말 */
const FORBIDDEN = /잘[했하]|못[했하]|훌륭|대단|똑똑|최고|실력|재능|초보|어린이|아이|나이|학생|틀렸|실패|부족|느리|빠르|쉬운|어려운|쉽|어렵|해야|하세요|해 보세요|해 봐|꼭 |반드시|하지 마|안 돼|조심|주의|경고|추천해|추천드|경험치|점수|별점|순위|완주|연속|남은|퍼센트|%|생명|시간 제한/;

describe('문구 검수: 안내는 사실과 추천 이유만 말한다(W-9, 12.10의 7-6 완료 기준)', () => {
  const regionQuests = (regionId: string): string[] => questsOf(regionId).filter((id) => full.get(id) !== undefined);

  /** 주민마다, 층 0–3마다, 여러 상태에서 만든 말 전부 */
  const sweep = (): Array<{ resident: ResidentDef; layer: number; state: string; say: ReturnType<typeof residentSay> }> => {
    const out: Array<{ resident: ResidentDef; layer: number; state: string; say: ReturnType<typeof residentSay> }> = [];
    for (const resident of RESIDENTS) {
      const ids = regionQuests(resident.regionId);
      const states: Array<[string, Partial<ResidentSayInput>]> = [
        ['처음', {}],
        ['하나 열어 봄', { opened: new Set(ids.slice(0, 1)) }],
        ['모두 열어 봄', { opened: new Set(ids) }],
        ['Q08을 하는 중', { currentQuestId: 'song.short-piece' }],
        ['Q08을 하는 중, 지역을 모두 열어 봄', { currentQuestId: 'song.short-piece', opened: new Set(ids) }],
        ['여러 번 고침', { attempts: ids.flatMap((id) => [attempt(id, true), attempt(id, true)]) }],
        ['여러 번 고침, 지역을 모두 열어 봄', { attempts: ids.flatMap((id) => [attempt(id, true), attempt(id, true)]), opened: new Set(ids) }],
        ['열 수 있는 과제 없음', { openable: () => false }],
      ];
      for (const layer of [0, 1, 2, 3]) {
        for (const [state, over] of states) out.push({ resident, layer, state, say: residentSay(resident, input({ ...over, layer })) });
      }
    }
    return out;
  };

  const all = sweep();

  it('모든 주민 × 층 × 상태에서 말이 있다(비어 있지 않다)', () => {
    expect(all).toHaveLength(6 * 4 * 8);
    for (const { say, resident, layer, state } of all) expect(say.text.trim().length, `${resident.name} ${layer}층 ${state}`).toBeGreaterThan(0);
  });

  it('한 줄이다: 줄바꿈이 없고 글자 수가 한도(110자) 안이다', () => {
    for (const { say, resident, layer, state } of all) {
      const where = `${resident.name} ${layer}층 ${state}: ${say.text}`;
      expect(say.text, where).not.toMatch(/[\n\r]/);
      expect([...say.text].length, where).toBeLessThanOrEqual(RESIDENT_LINE_MAX);
    }
  });

  it('평가하지 않고 시키지 않고 경고하지 않는다: 능력, 나이, 잘함·못함, 해야 한다, 경험치·점수·순위·남은 개수를 말하지 않는다', () => {
    for (const { say, resident, layer, state } of all) expect(say.text, `${resident.name} ${layer}층 ${state}`).not.toMatch(FORBIDDEN);
  });

  it('말은 서술문이다: 문장마다 요로 끝나고 마침표로 맺고, 물음표와 느낌표가 없다(대화를 고르게 하지 않는다)', () => {
    for (const { say, resident, layer, state } of all) {
      const where = `${resident.name} ${layer}층 ${state}: ${say.text}`;
      expect(say.text.endsWith('요.'), where).toBe(true);
      expect(say.text, where).not.toMatch(/[?!？！]/);
      expect(say.text.split(/(?<=\.)\s+/).length, where).toBeLessThanOrEqual(3);
    }
  });

  it('사실은 입력과 맞다: 말에 나오는 층의 숫자는 그 주민의 지역의 층과 같고, 층 0이면 숫자가 없다', () => {
    for (const { say, resident, layer, state } of all) {
      if (say.kind !== 'layer') continue;
      const digits = say.text.match(/\d+/g) ?? [];
      const where = `${resident.name} ${layer}층 ${state}: ${say.text}`;
      if (layer === 0) expect(digits, where).toEqual([]);
      else expect(digits, where).toEqual([String(layer)]);
    }
  });

  it('추천이면 말한 과제는 그 지역의 정거장에 놓여 있고(다른 지역의 과제를 말하지 않는다) 제목과 정거장 이름이 말에 들어 있다', () => {
    let recommendations = 0;
    for (const { say, resident, layer, state } of all) {
      if (say.kind !== 'recommendation') continue;
      recommendations++;
      const where = `${resident.name} ${layer}층 ${state}: ${say.text}`;
      expect(say.questId, where).not.toBeNull();
      const region = map.region(resident.regionId);
      const station = region.stations.find((s) => s.questIds.includes(say.questId!));
      expect(station, where).toBeDefined();
      expect(say.text, where).toContain(`'${full.get(say.questId!)!.title}'`);
      expect(say.text, where).toContain(`${station!.name}에 있어요.`);
    }
    expect(recommendations).toBeGreaterThan(0);
  });

  it('추천이 아니면 사실만이다: questId가 없고, 추천의 이유 말이 섞여 있지 않다', () => {
    for (const { say, resident, layer, state } of all) {
      if (say.kind !== 'layer') continue;
      const where = `${resident.name} ${layer}층 ${state}: ${say.text}`;
      expect(say.questId, where).toBeNull();
      expect(say.text, where).not.toContain('도전이에요');
    }
  });

  it('주민이 말하는 과제는 모두 설계서의 과제 목록에 있는 것이다(없는 과제를 말하지 않는다)', () => {
    for (const { say } of all) if (say.questId) expect(PLANNED_QUESTS[say.questId] ?? full.get(say.questId), say.questId).toBeDefined();
  });

  it('주민의 말에는 내 상태를 헤아려 알려 주는 말이 없다: 통과한 개수, 열어 본 개수, 시도 횟수를 말하지 않는다', () => {
    for (const { say, resident, layer, state } of all) {
      const where = `${resident.name} ${layer}층 ${state}: ${say.text}`;
      expect(say.text, where).not.toMatch(/\d+\s*(개|번째|번|회|명)/);
    }
  });
});
