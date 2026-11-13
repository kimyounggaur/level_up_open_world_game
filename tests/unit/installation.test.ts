// 4-1 설치물 정의: 부록 A.2의 값과 연결 검사(정거장, 과제, 쌍둥이 패널).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@/domain/content';
import { ARCHETYPE_CODES, STAGE_FRAME_PAD, STAGE_LABEL_LEFT, STAGE_LABEL_TOP, STAGE_MIN_ZOOM, frameTuningOf, installationOfStation, installationVariantCount, parseInstallation, slotAtPoint, slotBounds, slotCenter, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { WorldMap, parseRegion } from '@/domain/world';
import type { RegionDef } from '@/domain/world';
import { INTERACT_RANGE } from '@/domain/world';
import { validateContentDir } from '../../tools/content-loader';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const raw = readJson('content', 'installations', 'inst.village.scale-stones.json') as Record<string, unknown>;
const quests = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const regions: RegionDef[] = fs
  .readdirSync(path.join(root, 'content', 'regions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseRegion(readJson('content', 'regions', f), f).region!);
const map = new WorldMap(regions);

const load = (data: unknown = raw): InstallationDef => {
  const { installation, issues } = parseInstallation(data, 'x.json');
  expect(issues).toEqual([]);
  return installation!;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const codes = (list: InstallationDef[], ctx = { map, quests }): string[] => validateInstallationSet(list, ctx).map((i) => i.code);

describe('부록 A.2 마을의 음계 디딤돌', () => {
  const inst = load();

  it('정거장 H4, 마을, 디딤돌 길(T1)이다', () => {
    expect(inst.installationId).toBe('inst.village.scale-stones');
    expect(inst.stationCode).toBe('H4');
    expect(inst.regionId).toBe('village');
    expect(inst.archetype).toBe('steppingPath');
    expect(ARCHETYPE_CODES[inst.archetype]).toBe('T1');
    expect(inst.name).toBe('음계 디딤돌');
    expect(inst.interactPoint).toEqual({ x: 4530, y: 3655 });
  });

  it('자리 여덟 개: x = 4575 + 99(i−1), y 3579, 81×153(4.3)', () => {
    expect(inst.slots).toHaveLength(8);
    inst.slots.forEach((s, i) => expect(s).toEqual({ slot: i + 1, x: 4575 + 99 * i, y: 3579, w: 81, h: 153 }));
  });

  it('변환표 orderedPitches(v1), 과제 Q07의 C장조와 F장조, 쌍둥이 패널 panel.scale', () => {
    expect(inst.slotMap).toEqual({ kind: 'orderedPitches', voiceId: 'v1' });
    expect(inst.quests).toEqual([{ questId: 'scale.major', variantIds: ['c-major', 'f-major'] }]);
    expect(inst.panelTwin).toBe('panel.scale');
    expect(inst.signatureSoundId).toBe('sig.village.scale-stones');
    expect(inst.hearRadius).toBe(900);
    expect(installationVariantCount(inst)).toBe(2);
  });

  it('돌 줄 전체가 H4의 누르기 영역(4575, 3579, 774×153)과 같다', () => {
    const left = inst.slots[0]!.x;
    const right = inst.slots[7]!.x + inst.slots[7]!.w;
    expect([left, right - left, inst.slots[0]!.y, inst.slots[0]!.h]).toEqual([4575, 774, 3579, 153]);
  });

  it('정거장에서 찾을 수 있다', () => {
    expect(installationOfStation([inst], 'H4')).toBe(inst);
    expect(installationOfStation([inst], 'H1')).toBeUndefined();
  });

  it('content 폴더 전체 검사를 통과한다', () => {
    expect(validateContentDir(root)).toEqual([]);
  });

  it('상호작용 점이 정거장 점과 같아 96 px 안이다', () => {
    const st = map.station('H4')!;
    expect(Math.hypot(st.x - inst.interactPoint.x, st.y - inst.interactPoint.y)).toBeLessThanOrEqual(INTERACT_RANGE);
  });
});

describe('형식 검사', () => {
  it('필수 칸이 빠지면 읽지 못하고 이유를 알린다', () => {
    for (const key of ['installationId', 'stationCode', 'regionId', 'archetype', 'name', 'interactPoint', 'slots', 'slotMap', 'quests', 'panelTwin', 'signatureSoundId', 'hearRadius']) {
      const bad = clone(raw);
      delete bad[key];
      const r = parseInstallation(bad, 'x.json');
      expect(r.installation, key).toBeNull();
      expect(r.issues.length, key).toBeGreaterThan(0);
    }
  });

  it('객체가 아니면 읽지 못한다', () => {
    expect(parseInstallation(null, 'x.json').installation).toBeNull();
    expect(parseInstallation([], 'x.json').installation).toBeNull();
  });

  it('id 형식, 지역, 원형, 변환표 종류, 듣는 거리를 확인한다', () => {
    const t = (patch: Record<string, unknown>): string[] => parseInstallation({ ...clone(raw), ...patch }, 'x.json').issues.map((i) => i.code);
    expect(t({ installationId: 'scale-stones' })).toContain('ID_FORMAT');
    expect(t({ regionId: 'moon' })).toContain('REGION_ID');
    expect(t({ archetype: 'rocket' })).toContain('ARCHETYPE');
    expect(t({ slotMap: { kind: 'magic', voiceId: 'v1' } })).toContain('SLOT_MAP_KIND');
    expect(t({ signatureSoundId: 'scale' })).toContain('ID_FORMAT');
    expect(t({ hearRadius: 100 })).toContain('HEAR_RADIUS');
    expect(t({ hearRadius: 5000 })).toContain('HEAR_RADIUS');
  });
});

describe('연결 검사', () => {
  const good = load();

  it('정상 데이터는 문제가 없다', () => {
    expect(codes([good])).toEqual([]);
  });

  it('자리 번호가 1부터 이어지지 않거나 겹치거나 자리 수가 다르면 알린다', () => {
    const skip = clone(good);
    skip.slots[3]!.slot = 9;
    expect(codes([skip])).toContain('SLOT_NUMBER');
    const overlap = clone(good);
    overlap.slots[1]!.x = overlap.slots[0]!.x + 10;
    expect(codes([overlap])).toContain('SLOT_OVERLAP');
    const seven = clone(good);
    seven.slots.pop();
    const c = codes([seven]);
    expect(c).toContain('SLOT_COUNT');
    expect(c).toContain('SLOTMAP_COUNT');
  });

  it('지도에 없는 정거장, 설치물이 아닌 정거장, 원형이 다른 정거장, 다른 지역을 알린다', () => {
    expect(codes([{ ...clone(good), stationCode: 'H9' }])).toContain('REF_STATION');
    const panelStation = { ...clone(good), stationCode: 'H1' };
    const c = codes([panelStation]);
    expect(c).toContain('STATION_KIND');
    expect(c).toContain('STATION_ARCHETYPE');
    expect(codes([{ ...clone(good), regionId: 'staff-hill' }])).toContain('STATION_REGION');
  });

  it('상호작용 점이 멀거나 자리가 지역 밖이면 알린다', () => {
    expect(codes([{ ...clone(good), interactPoint: { x: 4530 + INTERACT_RANGE + 5, y: 3655 } }])).toContain('INTERACT_FAR');
    const out = clone(good);
    out.slots[7]!.x = 5600;
    expect(codes([out])).toContain('SLOT_OUTSIDE');
  });

  it('정거장에 적히지 않은 과제를 알린다', () => {
    const q = clone(good);
    q.quests = [{ questId: 'chord.major-triad', variantIds: ['major'] }];
    expect(codes([q])).toContain('STATION_QUEST');
  });

  it('과제와 판본 연결: 없는 과제, 없는 판본, 배치 없음, 쌍둥이 패널 없음', () => {
    const noQuest = clone(good);
    noQuest.quests = [{ questId: 'scale.nothing', variantIds: ['c-major'] }];
    expect(codes([noQuest])).toContain('REF_QUEST');
    const noVariant = clone(good);
    noVariant.quests = [{ questId: 'scale.major', variantIds: ['z-major'] }];
    expect(codes([noVariant])).toContain('REF_VARIANT');

    const noPlacement = quests.map((q) => (q.questId === 'scale.major' ? { ...clone(q), placements: q.placements.filter((p) => p.kind !== 'installation') } : q));
    expect(codes([good], { map, quests: noPlacement })).toContain('PLACEMENT_MISSING');
    const noTwin = quests.map((q) => (q.questId === 'scale.major' ? { ...clone(q), placements: q.placements.filter((p) => p.kind !== 'panel') } : q));
    expect(codes([good], { map, quests: noTwin })).toContain('TWIN_MISSING');
    const partial = quests.map((q) =>
      q.questId === 'scale.major' ? { ...clone(q), placements: q.placements.map((p) => (p.kind === 'installation' ? { ...p, variantIds: ['c-major'] } : p)) } : q,
    );
    expect(codes([good], { map, quests: partial })).toContain('PLACEMENT_VARIANT');
  });

  it('변환표와 판정기가 어긋나면 알린다: 성부, 판정기 종류', () => {
    const wrongVoice = clone(good);
    wrongVoice.slotMap = { kind: 'orderedPitches', voiceId: 'v2' };
    expect(codes([wrongVoice])).toContain('SLOTMAP_VOICE');
    const q01Quests = quests.map((q) => q);
    const withSpelling: InstallationDef = { ...clone(good), quests: [{ questId: 'pitch.same-note-two-clefs', variantIds: ['middle-c'] }] };
    const c = codes([withSpelling], { map, quests: q01Quests });
    expect(c).toContain('SLOTMAP_EVALUATOR');
  });

  it('id와 정거장이 겹치면 알린다', () => {
    expect(codes([good, clone(good)])).toEqual(expect.arrayContaining(['DUP_ID', 'DUP_STATION']));
  });

  it('쌍둥이 패널 id는 알려진 패널이어야 한다', () => {
    expect(codes([{ ...clone(good), panelTwin: 'panel.unknown' }])).toContain('REF_PANEL');
  });
});

describe('월드 좌표: 돌의 자리와 점(4.2, 4.3)', () => {
  const inst = load();

  it('slotBounds는 돌 전체를 감싼다: (4575, 3579) 774×153', () => {
    expect(slotBounds(inst)).toEqual({ x: 4575, y: 3579, w: 774, h: 153 });
    expect(slotBounds({ slots: [] })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('무대 바닥(stageCells)은 마디 이름과 성부 이름이 놓이는 띠까지 담는다: 칸은 (3899, 2919) 316×132', () => {
    const stage = load(readJson('content', 'installations', 'inst.village.ensemble-stage.json'));
    // 칸만 담으면 첫 줄 위와 첫 칸 왼쪽의 글자가 카메라 밖으로 나간다
    const cells = slotBounds({ slots: stage.slots });
    expect(cells).toEqual({ x: 3899, y: 2919, w: 316, h: 132 });
    expect(slotBounds(stage)).toEqual({ x: 3899 - STAGE_LABEL_LEFT, y: 2919 - STAGE_LABEL_TOP, w: 316 + STAGE_LABEL_LEFT, h: 132 + STAGE_LABEL_TOP });
    // 돌 설치물은 글자 띠가 없다
    expect(slotBounds(inst)).toEqual(slotBounds({ slots: inst.slots }));
  });

  it('카메라 조정값: 무대 바닥만 작은 여유와 최소 배율을 쓰고, 돌 설치물은 기본값(빈 값)이다', () => {
    const stage = load(readJson('content', 'installations', 'inst.village.ensemble-stage.json'));
    expect(frameTuningOf(stage)).toEqual({ pad: STAGE_FRAME_PAD, minZoom: STAGE_MIN_ZOOM });
    expect(STAGE_FRAME_PAD).toBeLessThan(72);
    // 칸 높이(64)가 화면에서 48px 이상이 되는 배율이다
    expect(stage.slots.every((s) => s.h * STAGE_MIN_ZOOM >= 48)).toBe(true);
    expect(frameTuningOf(inst)).toEqual({});
    expect(frameTuningOf({})).toEqual({});
  });

  it('slotCenter는 돌의 가운데다', () => {
    expect(slotCenter(inst.slots[0]!)).toEqual({ x: 4575 + 40.5, y: 3579 + 76.5 });
    expect(slotCenter(inst.slots[7]!)).toEqual({ x: 4575 + 99 * 7 + 40.5, y: 3579 + 76.5 });
  });

  it('돌 가운데의 점은 그 돌이다(밟기, slop 0)', () => {
    for (const s of inst.slots) {
      const c = slotCenter(s);
      expect(slotAtPoint(inst, c.x, c.y)).toBe(s.slot);
    }
  });

  it('돌 모서리 안쪽은 돌이고 바깥쪽은 아니다(slop 0)', () => {
    const s = inst.slots[2]!;
    expect(slotAtPoint(inst, s.x, s.y)).toBe(3);
    expect(slotAtPoint(inst, s.x + s.w, s.y + s.h)).toBe(3);
    expect(slotAtPoint(inst, s.x - 0.01, s.y + 10)).toBeNull();
    expect(slotAtPoint(inst, s.x + 10, s.y - 0.01)).toBeNull();
    expect(slotAtPoint(inst, s.x + 10, s.y + s.h + 0.01)).toBeNull();
  });

  it('돌 사이 틈(18 px)은 밟기에서는 어느 돌도 아니고, 누르기(slop 10)에서는 가까운 돌이다', () => {
    // 1번 돌은 x 4575–4656, 2번 돌은 4674–4755. 틈은 4656–4674
    expect(slotAtPoint(inst, 4665, 3650)).toBeNull();
    expect(slotAtPoint(inst, 4660, 3650, 10)).toBe(1);
    expect(slotAtPoint(inst, 4670, 3650, 10)).toBe(2);
  });

  it('누르기의 여유(slop)는 돌 줄 둘레에서 끝난다', () => {
    expect(slotAtPoint(inst, 4565, 3650, 10)).toBe(1);
    expect(slotAtPoint(inst, 4564.9, 3650, 10)).toBeNull();
    expect(slotAtPoint(inst, 4650, 3579 - 10, 10)).toBe(1);
    expect(slotAtPoint(inst, 4650, 3579 - 10.1, 10)).toBeNull();
    expect(slotAtPoint(inst, 4650, 3579 + 153 + 10.1, 10)).toBeNull();
    expect(slotAtPoint(inst, 4575 + 774 + 10, 3650, 10)).toBe(8);
    expect(slotAtPoint(inst, 4575 + 774 + 10.1, 3650, 10)).toBeNull();
  });

  it('돌 줄에서 먼 곳이나 캐릭터의 시작 자리는 돌이 아니다', () => {
    expect(slotAtPoint(inst, 3984, 3480)).toBeNull();
    expect(slotAtPoint(inst, 0, 0)).toBeNull();
  });
});
