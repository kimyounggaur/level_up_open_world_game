// 6-4 징검다리(T2, 4.4) 설치물 파일: E1 첫 징검다리와 E2 긴 돌 짧은 돌의 값, 형식 검사, 연결 검사(자리, 변환표, 과제 판본), 카메라가 담는 영역과 눌러 고르는 칸.
// 시간 계산은 timeline-stones, 컨트롤러와 작업대는 timeline-bench, 화면은 timeline-hud, 월드 그림은 timeline-layer 시험이 맡는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@/domain/content';
import { ARCHETYPE_CODES, ARCHETYPE_SLOT_MAP, STONES_FRAME_PAD, STONES_LABEL_TOP, STONES_MIN_ZOOM, frameTuningOf, installationOfStation, installationVariantCount, parseInstallation, slotAtPoint, slotBounds, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { laneOf } from '@/domain/timelineStones';
import { INTERACT_RANGE, WorldMap, parseRegion, standOf } from '@/domain/world';
import type { RegionDef } from '@/domain/world';
import { validateContentDir } from '../../tools/content-loader';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const FORD1 = 'inst.beat-river.first-ford';
const FORD2 = 'inst.beat-river.long-short';
const e1raw = readJson('content', 'installations', `${FORD1}.json`) as Record<string, unknown>;
const e2raw = readJson('content', 'installations', `${FORD2}.json`) as Record<string, unknown>;
const quests = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const regions: RegionDef[] = fs
  .readdirSync(path.join(root, 'content', 'regions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseRegion(readJson('content', 'regions', f), f).region!);
const map = new WorldMap(regions);

const load = (data: unknown): InstallationDef => {
  const { installation, issues } = parseInstallation(data, 'x.json');
  expect(issues).toEqual([]);
  return installation!;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const e1 = load(e1raw);
const e2 = load(e2raw);
const issuesOf = (list: InstallationDef[], ctx: { map?: WorldMap; quests?: readonly QuestDefinition[] } = { map, quests }) => validateInstallationSet(list, ctx);
const codes = (list: InstallationDef[], ctx?: { map?: WorldMap; quests?: readonly QuestDefinition[] }): string[] => issuesOf(list, ctx).map((i) => i.code);
const cells = (n: number, x: number, y: number, w: number, h: number) => Array.from({ length: n }, (_, i) => ({ slot: i + 1, x: x + w * i, y, w, h }));

describe('E1 첫 징검다리와 E2 긴 돌 짧은 돌의 값', () => {
  it('E1: 정거장 E1, 박자 강, 징검다리(T2). 자리는 60×96 여덟 개가 빈틈없이 이어진다', () => {
    expect([e1.installationId, e1.stationCode, e1.regionId, e1.archetype, e1.name]).toEqual([FORD1, 'E1', 'beat-river', 'stepStones', '첫 징검다리']);
    expect(ARCHETYPE_CODES[e1.archetype]).toBe('T2');
    expect(e1.interactPoint).toEqual({ x: 7000, y: 2800 });
    expect(e1.slots).toEqual(cells(8, 6760, 2752, 60, 96));
    expect(e1.slotMap).toEqual({ kind: 'timelineStones', voiceId: 'v1', axis: 'x', ticksPerPx: 8, cellTicks: 480 });
    expect(e1.quests).toEqual([
      { questId: 'rhythm.rest-in-a-bar', variantIds: ['quarter-rest'] },
      { questId: 'rhythm.three-four', variantIds: ['three-quarters'] },
      { questId: 'rhythm.rest-lengths', variantIds: ['quarter-and-half-rests', 'eighth-rest-mix'] },
    ]);
    expect([e1.panelTwin, e1.signatureSoundId, e1.hearRadius]).toEqual(['panel.rhythm', 'sig.beat-river.first-ford', 900]);
  });

  it('E2: 정거장 E2, 같은 모양의 줄이 E1 아래(y 3552)에 있다', () => {
    expect([e2.installationId, e2.stationCode, e2.regionId, e2.archetype, e2.name]).toEqual([FORD2, 'E2', 'beat-river', 'stepStones', '긴 돌 짧은 돌']);
    expect(e2.interactPoint).toEqual({ x: 7000, y: 3600 });
    expect(e2.slots).toEqual(cells(8, 6760, 3552, 60, 96));
    expect(e2.slotMap).toEqual(e1.slotMap);
    expect(e2.quests).toEqual([
      { questId: 'rhythm.note-values', variantIds: ['half-quarter-eighths'] },
      { questId: 'rhythm.dotted', variantIds: ['dotted-half', 'dotted-quarter-mix'] },
    ]);
    expect([e2.panelTwin, e2.signatureSoundId, e2.hearRadius]).toEqual(['panel.rhythm', 'sig.beat-river.long-short', 900]);
  });

  it('줄 한 개: 1 px가 8틱, 칸 하나가 480틱(60 px), 줄 전체가 3840틱(4/4 한 마디)이다', () => {
    expect(laneOf(e1)).toEqual({ axis: 'x', ticksPerPx: 8, start: 6760, cross: 2752, crossSize: 96, cellTicks: 480, laneTicks: 3840, voiceId: 'v1' });
    expect(laneOf(e2)).toEqual({ axis: 'x', ticksPerPx: 8, start: 6760, cross: 3552, crossSize: 96, cellTicks: 480, laneTicks: 3840, voiceId: 'v1' });
    // 칸 하나의 길이는 cellTicks ÷ ticksPerPx
    expect(e1.slots.every((s) => s.w === 480 / 8)).toBe(true);
    // 두 줄은 서로 닿지 않는다
    expect(e1.slots[0]!.y + e1.slots[0]!.h).toBeLessThan(e2.slots[0]!.y);
  });

  it('변환표 종류는 원형에서 정해진다: stepStones → timelineStones', () => {
    expect(ARCHETYPE_SLOT_MAP.stepStones).toBe('timelineStones');
    expect(ARCHETYPE_SLOT_MAP.steppingPath).toBe('orderedPitches');
    expect(ARCHETYPE_SLOT_MAP.ensembleStage).toBe('stageCells');
  });

  it('지도의 정거장과 이어진다: 설치물 정거장 E1, E2(T2)이고 과제가 정거장에 적혀 있다', () => {
    for (const inst of [e1, e2]) {
      const st = map.station(inst.stationCode)!;
      expect([st.kind, st.archetype, st.regionId]).toEqual(['installation', 'T2', 'beat-river']);
      for (const q of inst.quests) expect(st.questIds).toContain(q.questId);
      expect(Math.hypot(st.x - inst.interactPoint.x, st.y - inst.interactPoint.y)).toBeLessThanOrEqual(INTERACT_RANGE);
    }
    expect(installationOfStation([e1, e2], 'E1')).toBe(e1);
    expect(installationOfStation([e1, e2], 'E2')).toBe(e2);
    expect(installationOfStation([e1, e2], 'E3')).toBeUndefined();
  });

  it('표지판의 판본 수: E1은 4개, E2는 3개다(자유로 놀기는 따로 센다)', () => {
    expect(installationVariantCount(e1)).toBe(4);
    expect(installationVariantCount(e2)).toBe(3);
  });

  it('두 설치물을 함께 검사해도 문제가 없고, content 폴더 전체 검사도 통과한다', () => {
    expect(issuesOf([e1, e2])).toEqual([]);
    expect(validateContentDir(root)).toEqual([]);
  });
});

describe('월드 좌표: 카메라와 누르기', () => {
  it('slotBounds는 칸 전체에 박 번호가 놓이는 띠(44 px)를 더한다', () => {
    expect(slotBounds({ slots: e1.slots })).toEqual({ x: 6760, y: 2752, w: 480, h: 96 });
    expect(slotBounds(e1)).toEqual({ x: 6760, y: 2752 - STONES_LABEL_TOP, w: 480, h: 96 + STONES_LABEL_TOP });
    expect(slotBounds(e2)).toEqual({ x: 6760, y: 3552 - STONES_LABEL_TOP, w: 480, h: 96 + STONES_LABEL_TOP });
    expect(STONES_LABEL_TOP).toBe(44);
  });

  it('카메라 조정값: 작은 여유(24)와 최소 배율(0.8). 칸 하나(60 px)가 화면에서 48 px 이상이 된다', () => {
    expect(frameTuningOf(e1)).toEqual({ pad: STONES_FRAME_PAD, minZoom: STONES_MIN_ZOOM });
    expect(STONES_FRAME_PAD).toBeLessThan(72);
    expect(e1.slots.every((s) => s.w * STONES_MIN_ZOOM >= 48)).toBe(true);
  });

  it('누르기: 칸 안은 그 칸의 번호이고, 줄 위의 박 번호 띠나 줄 바깥은 칸이 아니다', () => {
    expect(slotAtPoint(e1, 6790, 2800)).toBe(1);
    expect(slotAtPoint(e1, 7210, 2800)).toBe(8);
    expect(slotAtPoint(e1, 7030, 2753)).toBe(5);
    expect(slotAtPoint(e1, 6790, 2730)).toBeNull();
    expect(slotAtPoint(e1, 6740, 2800)).toBeNull();
    expect(slotAtPoint(e1, 7260, 2800)).toBeNull();
    expect(slotAtPoint(e1, 6790, 2860)).toBeNull();
    // E2의 줄은 따로다
    expect(slotAtPoint(e2, 6790, 2800)).toBeNull();
    expect(slotAtPoint(e2, 6790, 3600)).toBe(1);
  });
});

describe('형식 검사: 징검다리 변환표', () => {
  const sm = (patch: Record<string, unknown>) => ({ ...clone(e1raw), slotMap: { ...(e1raw['slotMap'] as Record<string, unknown>), ...patch } });
  const parse = (data: unknown) => parseInstallation(data, 'x.json');
  const paths = (data: unknown): string[] => parse(data).issues.map((i) => i.path);

  it('axis가 x나 y가 아니면 읽지 못한다', () => {
    expect(paths(sm({ axis: 'z' }))).toContain('x.json.slotMap.axis');
    expect(parse(sm({ axis: 'z' })).installation).toBeNull();
    // 세로 줄(E3의 수로)은 읽는다
    expect(parse(sm({ axis: 'y' })).issues).toEqual([]);
  });

  it('ticksPerPx와 cellTicks는 1 이상의 정수여야 한다', () => {
    for (const bad of [0, -8, 1.5]) {
      expect(paths(sm({ ticksPerPx: bad }))).toContain('x.json.slotMap.ticksPerPx');
      expect(paths(sm({ cellTicks: bad }))).toContain('x.json.slotMap.cellTicks');
    }
    expect(parse(sm({ ticksPerPx: 2, cellTicks: 120 })).issues).toEqual([]);
  });

  it('성부(voiceId)가 빠지면 읽지 못하고, 모르는 종류는 알린다', () => {
    const noVoice = sm({});
    delete (noVoice.slotMap as Record<string, unknown>)['voiceId'];
    expect(paths(noVoice)).toContain('x.json.slotMap.voiceId');
    expect(parse(sm({ kind: 'timelineStone' })).issues.map((i) => i.code)).toContain('SLOT_MAP_KIND');
  });

  it('칸이 틱이나 px 정수가 아니어도 읽기는 읽는다(나누어떨어지는지는 연결 검사가 본다)', () => {
    expect(parse(sm({ cellTicks: 470 })).issues).toEqual([]);
  });
});

describe('연결 검사: 징검다리 설치물', () => {
  const withMap = (patch: Record<string, unknown>): InstallationDef => ({ ...clone(e1), slotMap: { ...(e1.slotMap as object), ...patch } as InstallationDef['slotMap'] });
  const at = (list: InstallationDef[], code: string) => issuesOf(list).filter((i) => i.code === code);

  it('칸(cellTicks)이 px로 나누어떨어지지 않으면 알린다', () => {
    expect(codes([withMap({ cellTicks: 470 })])).toContain('SLOT_GRID');
  });

  it('칸 하나의 길이가 cellTicks ÷ ticksPerPx와 다르면 그 칸을 알린다', () => {
    const wide = clone(e1);
    wide.slots[2]!.w = 61;
    const found = at([wide], 'SLOT_GRID');
    expect(found.map((i) => i.path)).toEqual([`${FORD1}.slots[2]`]);
    expect(found[0]!.message).toContain('60 px');
  });

  it('줄이 곧지 않으면 알린다: 한 칸이 다른 높이에 있다', () => {
    const bent = clone(e1);
    bent.slots[3]!.y += 4;
    expect(at([bent], 'SLOT_ORDER').map((i) => i.path)).toEqual([`${FORD1}.slots[3]`]);
    const thick = clone(e1);
    thick.slots[3]!.h = 90;
    expect(codes([thick])).toContain('SLOT_ORDER');
  });

  it('시간 순서가 아니거나 빈틈이 있으면 알린다', () => {
    const gap = clone(e1);
    gap.slots[5]!.x += 6;
    expect(codes([gap])).toContain('SLOT_ORDER');
    const swapped = clone(e1);
    [swapped.slots[1]!.x, swapped.slots[2]!.x] = [swapped.slots[2]!.x, swapped.slots[1]!.x];
    expect(codes([swapped])).toContain('SLOT_ORDER');
    // 겹치면 겹침으로도 알린다
    const overlap = clone(e1);
    overlap.slots[1]!.x -= 10;
    expect(codes([overlap])).toEqual(expect.arrayContaining(['SLOT_ORDER', 'SLOT_OVERLAP']));
  });

  it('원형과 변환표 종류가 어긋나면 알린다(stepStones는 timelineStones를 쓴다)', () => {
    const wrong = { ...clone(e1), slotMap: { kind: 'orderedPitches', voiceId: 'v1' } } as InstallationDef;
    expect(codes([wrong])).toContain('SLOTMAP_ARCHETYPE');
  });

  it('변환표와 판정기가 어긋나면 알린다: 성부, 판정기 종류', () => {
    const edited = (patch: (q: QuestDefinition) => void): QuestDefinition[] => {
      const copy = clone(quests);
      patch(copy.find((q) => q.questId === 'rhythm.rest-in-a-bar')!);
      return copy;
    };
    const voice = edited((q) => {
      (q.variants['quarter-rest']!.evaluatorSpec as { voiceId: string }).voiceId = 'v2';
    });
    // 악보에 없는 성부는 예외가 아니라 문제로 알린다
    const inVoice = issuesOf([e1], { map, quests: voice }).filter((i) => i.code === 'SLOTMAP_VOICE');
    expect(inVoice.map((i) => i.message)).toEqual(['rhythm.rest-in-a-bar/quarter-rest의 성부(v2)와 변환표의 성부(v1)가 달라요', 'rhythm.rest-in-a-bar/quarter-rest의 성부(v2)가 악보에 없어요']);
    // 악보에 있는 다른 성부면 달라요만 알린다
    const other = edited((q) => {
      const variant = q.variants['quarter-rest']!;
      (variant.evaluatorSpec as { voiceId: string }).voiceId = 'v2';
      variant.score.voices.push({ ...variant.score.voices[0]!, voiceId: 'v2' });
    });
    expect(issuesOf([e1], { map, quests: other }).filter((i) => i.code === 'SLOTMAP_VOICE').map((i) => i.message)).toEqual(['rhythm.rest-in-a-bar/quarter-rest의 성부(v2)와 변환표의 성부(v1)가 달라요']);
    const kind = edited((q) => {
      q.variants['quarter-rest']!.evaluatorSpec = { type: 'orderedScale', voiceId: 'v1', count: 8 } as never;
    });
    expect(codes([e1], { map, quests: kind })).toContain('SLOTMAP_EVALUATOR');
    // 고치지 않은 판본은 그대로 통과한다
    expect(codes([e1], { map, quests })).toEqual([]);
  });

  it('줄이 판본의 한 마디보다 짧으면 알린다(4/4 판본만 걸리고 3/4 판본은 2880틱 안에 든다)', () => {
    const short = clone(e1);
    short.slots = short.slots.slice(0, 6);
    const found = at([short], 'SLOTMAP_COUNT').map((i) => i.message);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((m) => m.includes('rhythm.rest-in-a-bar/quarter-rest'))).toBe(true);
    expect(found.some((m) => m.includes('rhythm.three-four'))).toBe(false);
    expect(found.every((m) => m.includes('징검다리(2880틱)보다 길어요'))).toBe(true);
  });

  it('판본의 가장 짧은 음가가 줄의 칸보다 잘면 알린다(칸의 배수가 아니다)', () => {
    const finer = { ...clone(e1), quests: [{ questId: 'rhythm.short-notes-and-triplets', variantIds: ['thirty-seconds-triplet'] }] };
    const found = at([finer], 'SLOTMAP_GRID').map((i) => i.message);
    expect(found).toEqual(['rhythm.short-notes-and-triplets/thirty-seconds-triplet의 칸(120틱)이 징검다리 칸(480틱)의 배수가 아니에요']);
  });

  it('연음 돌의 길이가 px로 나누어떨어지지 않으면 알린다', () => {
    // 1 px = 15틱이면 칸 480틱은 32 px로 떨어지지만 8분 셋잇단 돌(320틱)은 떨어지지 않는다
    const odd = { ...clone(e1), slotMap: { ...(e1.slotMap as object), ticksPerPx: 15 } as InstallationDef['slotMap'], slots: cells(8, 6760, 2752, 32, 96), quests: [{ questId: 'rhythm.short-notes-and-triplets', variantIds: ['thirty-seconds-triplet'] }] };
    const found = at([odd], 'SLOTMAP_GRID').map((i) => i.message);
    expect(found.some((m) => m.includes('연음 돌(320틱)이 px로 나누어떨어지지 않아요(1 px = 15틱)'))).toBe(true);
    // 칸 자체는 맞아서 자리 검사는 걸리지 않는다
    expect(codes([odd])).not.toContain('SLOT_GRID');
  });

  it('과제 연결은 다른 설치물과 같다: 없는 과제, 없는 판본, 배치 없음, 정거장에 없는 과제', () => {
    const nothing = { ...clone(e1), quests: [{ questId: 'rhythm.nowhere', variantIds: ['x'] }] };
    expect(codes([nothing])).toEqual(expect.arrayContaining(['REF_QUEST', 'STATION_QUEST']));
    const noVariant = { ...clone(e1), quests: [{ questId: 'rhythm.rest-in-a-bar', variantIds: ['nowhere'] }] };
    expect(codes([noVariant])).toContain('REF_VARIANT');
    // E1 파일에 E2의 과제를 적으면 정거장 E1에 없다
    const alien = { ...clone(e1), quests: [{ questId: 'rhythm.note-values', variantIds: ['half-quarter-eighths'] }] };
    expect(codes([alien])).toContain('STATION_QUEST');
  });

  it('id와 정거장이 겹치면 알린다', () => {
    expect(codes([e1, clone(e1)])).toEqual(expect.arrayContaining(['DUP_ID', 'DUP_STATION']));
  });

  it('지도가 없을 때는 지도 관련 검사를 건너뛰고 자리 검사는 한다', () => {
    const bent = clone(e1);
    bent.slots[3]!.y += 4;
    expect(codes([bent], {})).toEqual(['SLOT_ORDER']);
    expect(codes([e1], {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6-5 잔물결 수로(E3): 시간이 세로로 흐르는 확대형 줄

const RIPPLE = 'inst.beat-river.ripple-channel';
const e3raw = readJson('content', 'installations', `${RIPPLE}.json`) as Record<string, unknown>;
const e3 = load(e3raw);
const e3Slots = Array.from({ length: 32 }, (_, i) => ({ slot: i + 1, x: 6656, y: 700 + 60 * i, w: 96, h: 60 }));

describe('E3 잔물결 수로의 값(4.4 확대형)', () => {
  it('정거장 E3, 박자 강, 징검다리(T2). 자리는 96×60 서른두 개가 위에서 아래로 빈틈없이 이어진다', () => {
    expect([e3.installationId, e3.stationCode, e3.regionId, e3.archetype, e3.name]).toEqual([RIPPLE, 'E3', 'beat-river', 'stepStones', '잔물결 수로']);
    expect(ARCHETYPE_CODES[e3.archetype]).toBe('T2');
    expect(e3.interactPoint).toEqual({ x: 6704, y: 1660 });
    expect(e3.slots).toEqual(e3Slots);
    expect(e3.slotMap).toEqual({ kind: 'timelineStones', voiceId: 'v1', axis: 'y', ticksPerPx: 2, cellTicks: 120, follow: 'beat' });
    expect(e3.quests).toEqual([
      { questId: 'rhythm.sixteenths', variantIds: ['sixteenths-and-eighths'] },
      { questId: 'rhythm.triplets', variantIds: ['triplet-eighths-and-quarters'] },
      { questId: 'rhythm.short-notes-and-triplets', variantIds: ['thirty-seconds-triplet'] },
    ]);
    expect([e3.panelTwin, e3.signatureSoundId, e3.hearRadius]).toEqual(['panel.rhythm', 'sig.beat-river.ripple-channel', 900]);
  });

  it('줄 한 개: 1 px가 2틱, 칸 하나가 120틱(60 px), 한 박이 480 px, 줄 전체가 3840틱(1920 px)이다', () => {
    expect(laneOf(e3)).toEqual({ axis: 'y', ticksPerPx: 2, start: 700, cross: 6656, crossSize: 96, cellTicks: 120, laneTicks: 3840, voiceId: 'v1' });
    expect(e3.slots.every((s) => s.h === 120 / 2)).toBe(true);
    expect(e3.slots[31]!.y + e3.slots[31]!.h - e3.slots[0]!.y).toBe(3840 / 2);
    // 설계서 4.4: 한 박 480 px, 한 마디 1920 px
    expect([960 / 2, 3840 / 2]).toEqual([480, 1920]);
  });

  it('지도의 정거장과 이어진다: 설치물 정거장 E3(T2)이고 세 과제가 정거장에 적혀 있다. 서는 자리는 수로 서쪽 둑이다', () => {
    const st = map.station('E3')!;
    expect([st.kind, st.archetype, st.regionId]).toEqual(['installation', 'T2', 'beat-river']);
    expect(st.questIds).toEqual(['rhythm.short-notes-and-triplets', 'rhythm.sixteenths', 'rhythm.triplets']);
    for (const q of e3.quests) expect(st.questIds).toContain(q.questId);
    expect(Math.hypot(st.x - e3.interactPoint.x, st.y - e3.interactPoint.y)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(standOf(st)).toEqual({ x: 6560, y: 1660 });
    expect(installationOfStation([e1, e2, e3], 'E3')).toBe(e3);
    expect(installationVariantCount(e3)).toBe(3);
  });

  it('세 설치물을 함께 검사해도 문제가 없고, 판본 정답이 줄 안에 든다(4/4 한 마디 3840틱, 칸 120틱의 배수)', () => {
    expect(issuesOf([e1, e2, e3])).toEqual([]);
    expect(validateContentDir(root)).toEqual([]);
  });

  it('Q03은 E3에도 놓인다(패널과 E3). 같은 판본이 두 징검다리에서 풀린다', () => {
    const q03 = quests.find((q) => q.questId === 'rhythm.short-notes-and-triplets')!;
    const ids = q03.placements.filter((p) => p.kind === 'installation').map((p) => (p as { installationId: string }).installationId);
    expect(ids).toEqual([RIPPLE]);
    expect(q03.placements.some((p) => p.kind === 'panel')).toBe(true);
  });
});

describe('월드 좌표: 세로 줄의 카메라와 누르기', () => {
  it('slotBounds는 박 번호 띠(44 px)를 줄의 왼쪽에 더한다(시간이 세로로 흐르면 띠가 위가 아니라 왼쪽이다)', () => {
    expect(slotBounds({ slots: e3.slots })).toEqual({ x: 6656, y: 700, w: 96, h: 1920 });
    expect(slotBounds(e3)).toEqual({ x: 6656 - STONES_LABEL_TOP, y: 700, w: 96 + STONES_LABEL_TOP, h: 1920 });
    // 가로 줄은 그대로다
    expect(slotBounds(e1)).toEqual({ x: 6760, y: 2752 - STONES_LABEL_TOP, w: 480, h: 96 + STONES_LABEL_TOP });
  });

  it('카메라 조정값은 가로 줄과 같다. 칸 하나(60 px)가 화면에서 48 px 이상이 된다', () => {
    expect(frameTuningOf(e3)).toEqual({ pad: STONES_FRAME_PAD, minZoom: STONES_MIN_ZOOM });
    expect(e3.slots.every((s) => s.h * STONES_MIN_ZOOM >= 48)).toBe(true);
  });

  it('누르기: 칸 안은 그 칸의 번호이고, 줄 왼쪽의 박 번호 띠나 줄 바깥은 칸이 아니다', () => {
    expect(slotAtPoint(e3, 6700, 710)).toBe(1);
    expect(slotAtPoint(e3, 6700, 1030)).toBe(6);
    expect(slotAtPoint(e3, 6700, 2619)).toBe(32);
    expect(slotAtPoint(e3, 6700, 699)).toBeNull();
    expect(slotAtPoint(e3, 6700, 2621)).toBeNull();
    expect(slotAtPoint(e3, 6640, 1000)).toBeNull();
    expect(slotAtPoint(e3, 6760, 1000)).toBeNull();
  });
});

describe('형식 검사: follow(박을 따라가는 카메라)', () => {
  const sm = (patch: Record<string, unknown>) => ({ ...clone(e3raw), slotMap: { ...(e3raw['slotMap'] as Record<string, unknown>), ...patch } });
  const parse = (data: unknown) => parseInstallation(data, 'x.json');

  it("follow는 'beat'만 받는다. 없으면 줄 전체를 담는다(E1, E2)", () => {
    expect(parse(sm({})).issues).toEqual([]);
    expect((parse(sm({})).installation!.slotMap as { follow?: string }).follow).toBe('beat');
    expect((e1.slotMap as { follow?: string }).follow).toBeUndefined();
    const bad = parse(sm({ follow: 'bar' }));
    expect(bad.issues.map((i) => i.path)).toContain('x.json.slotMap.follow');
    expect(bad.installation).toBeNull();
    expect(parse(sm({ follow: true })).issues.map((i) => i.path)).toContain('x.json.slotMap.follow');
  });

  it('follow를 빼도 세로 줄은 읽힌다(줄 전체를 담는 카메라)', () => {
    const raw = sm({});
    delete (raw.slotMap as Record<string, unknown>)['follow'];
    const inst = parse(raw);
    expect(inst.issues).toEqual([]);
    expect('follow' in (inst.installation!.slotMap as object)).toBe(false);
  });
});

describe('연결 검사: 세로 줄', () => {
  const at = (list: InstallationDef[], code: string) => issuesOf(list).filter((i) => i.code === code);

  it('세로 줄은 칸의 높이가 cellTicks ÷ ticksPerPx이다. 다르면 그 칸을 알린다', () => {
    const tall = clone(e3);
    tall.slots[4]!.h = 61;
    const found = at([tall], 'SLOT_GRID');
    expect(found.map((i) => i.path)).toEqual([`${RIPPLE}.slots[4]`]);
    expect(found[0]!.message).toContain('60 px');
  });

  it('세로 줄이 곧지 않으면 알린다: 한 칸이 옆으로 밀렸다', () => {
    const bent = clone(e3);
    bent.slots[7]!.x += 4;
    expect(at([bent], 'SLOT_ORDER').map((i) => i.path)).toEqual([`${RIPPLE}.slots[7]`]);
  });

  it('위에서 아래로 시간 순서여야 한다: 두 칸의 자리를 바꾸거나 빈틈이 있으면 알린다', () => {
    const swapped = clone(e3);
    [swapped.slots[1]!.y, swapped.slots[2]!.y] = [swapped.slots[2]!.y, swapped.slots[1]!.y];
    expect(codes([swapped])).toContain('SLOT_ORDER');
    const gap = clone(e3);
    gap.slots[9]!.y += 6;
    expect(codes([gap])).toContain('SLOT_ORDER');
  });

  it('줄이 판본의 한 마디보다 짧으면 알린다(서른두 칸보다 적으면 Q17, Q18, Q03이 걸린다)', () => {
    const short = clone(e3);
    short.slots = short.slots.slice(0, 24);
    const found = at([short], 'SLOTMAP_COUNT').map((i) => i.message);
    expect(found.length).toBe(3);
    expect(found.every((m) => m.includes('징검다리(2880틱)보다 길어요'))).toBe(true);
  });

  it('연음 돌의 길이는 1 px가 몇 틱인지에 맞아야 한다: 2틱이면 320틱과 640틱 돌이 모두 나누어떨어진다', () => {
    expect(at([e3], 'SLOTMAP_GRID')).toEqual([]);
    // 1 px = 3틱이면 칸(120틱)은 40 px로 떨어지지만 8분 셋잇단 돌(320틱)은 떨어지지 않는다
    const odd = { ...clone(e3), slotMap: { ...(e3.slotMap as object), ticksPerPx: 3 } as InstallationDef['slotMap'], slots: Array.from({ length: 32 }, (_, i) => ({ slot: i + 1, x: 6656, y: 700 + 40 * i, w: 96, h: 40 })) };
    const found = at([odd], 'SLOTMAP_GRID').map((i) => i.message);
    expect(found.some((m) => m.includes('연음 돌(320틱)이 px로 나누어떨어지지 않아요(1 px = 3틱)'))).toBe(true);
    expect(codes([odd])).not.toContain('SLOT_GRID');
  });

  it('칸이 가장 짧은 음가보다 굵으면 알린다: Q03의 32분음표(120틱)는 칸이 240틱인 줄에 놓을 수 없다', () => {
    const coarse = { ...clone(e3), slotMap: { ...(e3.slotMap as object), cellTicks: 240 } as InstallationDef['slotMap'], slots: Array.from({ length: 16 }, (_, i) => ({ slot: i + 1, x: 6656, y: 700 + 120 * i, w: 96, h: 120 })) };
    const found = at([coarse], 'SLOTMAP_GRID').map((i) => i.message);
    expect(found.some((m) => m.includes('rhythm.short-notes-and-triplets/thirty-seconds-triplet의 칸(120틱)이 징검다리 칸(240틱)의 배수가 아니에요'))).toBe(true);
  });
});
