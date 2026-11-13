// 7-1 계단밭 언덕의 설치물 세 곳(N1 높은음 계단밭, N2 낮은음 계단밭, N3 가운데 턱)과 계단밭 변환표(staffField, 4.7)의 검사.
// 열의 격자와 번호, 높이 범위, 판정기·음자리표·열 수와 판본의 짝, 카메라 틀, 월드 점이 열 번호로 바뀌는 길을 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@/domain/content';
import { ARCHETYPE_CODES, ARCHETYPE_SLOT_MAP, MIN_CELL_ON_SCREEN, SLOT_MAP_KINDS, frameTuningOf, parseInstallation, slotAtPoint, slotBounds, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { TERRACE_COLUMNS, TERRACE_COLUMN_GAP, TERRACE_COLUMN_W, TERRACE_FRAME_PAD, TERRACE_LABEL_LEFT, TERRACE_LABEL_TOP, TERRACE_STEP_PX, stepOfName, terraceBounds, terraceMapOf, terraceYOfStep } from '@/domain/terrace';
import { WorldMap, parseRegion } from '@/domain/world';
import type { RegionDef } from '@/domain/world';
import { validateContentDir } from '../../tools/content-loader';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const quests = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const regions: RegionDef[] = fs
  .readdirSync(path.join(root, 'content', 'regions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseRegion(readJson('content', 'regions', f), f).region!);
const map = new WorldMap(regions);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const load = (id: string): InstallationDef => {
  const { installation, issues } = parseInstallation(readJson('content', 'installations', `${id}.json`), `${id}.json`);
  expect(issues).toEqual([]);
  return installation!;
};
const N1 = load('inst.staff-hill.treble-terrace');
const N2 = load('inst.staff-hill.bass-terrace');
const N3 = load('inst.staff-hill.middle-ledge');
const ALL = [N1, N2, N3];
const codes = (list: InstallationDef[], ctx: { map: WorldMap; quests: QuestDefinition[] } = { map, quests }): string[] => validateInstallationSet(list, ctx).map((i) => i.code);
const field = (inst: InstallationDef): Extract<NonNullable<InstallationDef['slotMap']>, { kind: 'staffField' }> => {
  if (inst.slotMap?.kind !== 'staffField') throw new Error('계단밭이 아니에요');
  return inst.slotMap;
};

/** 높이 범위를 바꾸고 열의 사각형도 그 범위에 맞춘다(범위만 바꿔서 다른 검사가 함께 울리지 않게) */
function retarget(inst: InstallationDef, low: string, high: string): InstallationDef {
  const out = clone(inst);
  const m = field(out);
  m.low = low;
  m.high = high;
  const top = terraceYOfStep(m, stepOfName(high)) - TERRACE_STEP_PX / 2;
  const height = (stepOfName(high) - stepOfName(low) + 1) * TERRACE_STEP_PX;
  for (const s of out.slots) {
    s.y = top;
    s.h = height;
  }
  return out;
}

describe('계단밭 변환표의 상수(4.7)', () => {
  it('변환표 종류에 staffField가 있고 원형 이름은 T5다. 원형과 변환표의 짝이 정해져 있다', () => {
    expect(SLOT_MAP_KINDS).toContain('staffField');
    expect(ARCHETYPE_CODES.terraceField).toBe('T5');
    expect(ARCHETYPE_SLOT_MAP.terraceField).toBe('staffField');
  });

  it('열은 8개, 간격 140 px, 폭 96 px. 온음계 한 칸은 48 px이다. 글자 띠는 위쪽 56 px, 왼쪽 64 px, 틀 여백은 24 px이다', () => {
    expect([TERRACE_COLUMNS, TERRACE_COLUMN_GAP, TERRACE_COLUMN_W, TERRACE_STEP_PX, TERRACE_LABEL_TOP, TERRACE_LABEL_LEFT, TERRACE_FRAME_PAD]).toEqual([8, 140, 96, 48, 56, 64, 24]);
  });
});

describe('세 설치물의 정의', () => {
  it('정거장 N1–N3, 계단밭 언덕, 쌍둥이 패널은 panel.clef다', () => {
    expect(ALL.map((i) => [i.stationCode, i.regionId, i.archetype, i.name, i.panelTwin])).toEqual([
      ['N1', 'staff-hill', 'terraceField', '높은음 계단밭', 'panel.clef'],
      ['N2', 'staff-hill', 'terraceField', '낮은음 계단밭', 'panel.clef'],
      ['N3', 'staff-hill', 'terraceField', '가운데 턱', 'panel.clef'],
    ]);
    for (const i of ALL) expect(ARCHETYPE_CODES[i.archetype]).toBe('T5');
  });

  it('상호작용 점은 정거장 점 그대로이고 서명 소리 id가 있다(소리는 7-4)', () => {
    for (const i of ALL) {
      const st = map.station(i.stationCode)!;
      expect(i.interactPoint, i.installationId).toEqual({ x: st.x, y: st.y });
      expect(i.signatureSoundId).toBe(`sig.staff-hill.${i.installationId.split('.')[2]}`);
    }
  });

  it('높이 범위와 보표: N1은 A3–C6 높은음자리표, N2는 C2–E4 낮은음자리표, N3는 C2–C6 두 보표다. 가온 도(C4)의 세로 좌표는 모두 1000이다', () => {
    expect(ALL.map((i) => field(i))).toEqual([
      { kind: 'staffField', c4Y: 1000, low: 'A3', high: 'C6', clefs: ['treble'] },
      { kind: 'staffField', c4Y: 1000, low: 'C2', high: 'E4', clefs: ['bass'] },
      { kind: 'staffField', c4Y: 1000, low: 'C2', high: 'C6', clefs: ['treble', 'bass'] },
    ]);
    for (const i of ALL) expect(terraceMapOf(i)).toBe(field(i));
  });

  it('과제와 판본: N1은 Q09·Q10의 높은음자리표 판본, N2는 낮은음자리표 판본, N3는 Q01·Q11·Q12다', () => {
    expect(ALL.map((i) => i.quests)).toEqual([
      [
        { questId: 'staff.lines-and-spaces', variantIds: ['treble-lines', 'treble-spaces'] },
        { questId: 'staff.ledger-lines', variantIds: ['treble-ledger', 'treble-far-ledger'] },
      ],
      [
        { questId: 'staff.lines-and-spaces', variantIds: ['bass-lines', 'bass-spaces'] },
        { questId: 'staff.ledger-lines', variantIds: ['bass-ledger'] },
      ],
      [
        { questId: 'pitch.same-note-two-clefs', variantIds: ['middle-c'] },
        { questId: 'staff.middle-c-neighbors', variantIds: ['neighbors'] },
        { questId: 'staff.range-ladder', variantIds: ['c3-c5', 'c2-c6'] },
      ],
    ]);
  });

  it('열은 8개이고 왼쪽부터 번호가 붙는다. 첫 열은 x=4352이고 140 px씩 떨어지며 폭은 96 px다', () => {
    for (const i of ALL) {
      expect(i.slots, i.installationId).toHaveLength(TERRACE_COLUMNS);
      i.slots.forEach((s, n) => {
        expect(s.slot).toBe(n + 1);
        expect(s.x).toBe(4352 + n * TERRACE_COLUMN_GAP);
        expect(s.w).toBe(TERRACE_COLUMN_W);
      });
    }
  });

  it('열의 사각형은 low의 칸 아래쪽부터 high의 칸 위쪽까지다: N1 y=304 세로 816, N2 y=880 세로 816, N3 y=304 세로 1392', () => {
    expect(ALL.map((i) => [i.slots[0]!.y, i.slots[0]!.h])).toEqual([
      [304, 816],
      [880, 816],
      [304, 1392],
    ]);
    for (const i of ALL) expect(new Set(i.slots.map((s) => `${s.y}/${s.h}`)).size, i.installationId).toBe(1);
    // 같은 높이는 세 밭에서 같은 세로 좌표다: 가온 도(C4)의 칸은 1000에서 24 px 위아래다
    for (const i of ALL) {
      const top = i.slots[0]!.y;
      const bottom = top + i.slots[0]!.h;
      expect(top <= 1000 - 24 && bottom >= 1000 + 24, i.installationId).toBe(true);
    }
  });

  it('content 폴더 전체와 설치물 연결 검사를 통과한다(정거장, 과제, 쌍둥이 패널, 지역 범위)', () => {
    expect(validateContentDir(root)).toEqual([]);
    expect(codes(ALL)).toEqual([]);
  });

  it('서는 자리(상호작용 점)는 열의 틀 밖에 있다: 밭의 왼쪽 글자 띠보다 더 왼쪽이다', () => {
    for (const i of ALL) {
      const b = slotBounds(i);
      expect(i.interactPoint.x, i.installationId).toBeLessThan(b.x);
    }
  });
});

describe('판본과 밭의 짝, 높이 범위(검사)', () => {
  it('원본 그대로는 문제가 없다', () => {
    for (const i of ALL) expect(codes([i]), i.installationId).toEqual([]);
  });

  it('원형과 변환표가 짝이 아니면 알린다', () => {
    const wrong = clone(N1);
    wrong.archetype = 'bellTree';
    expect(codes([wrong])).toContain('SLOTMAP_ARCHETYPE');
    const other = clone(N1);
    (other as { slotMap: unknown }).slotMap = { kind: 'orderedPitches', voiceId: 'v1' };
    expect(codes([other])).toContain('SLOTMAP_ARCHETYPE');
  });

  it('판정기가 음이름이나 음계 순서가 아니면 알린다(리듬 놓기 판본은 계단밭에 놓을 수 없다)', () => {
    const rhythm = { ...clone(N1), quests: [{ questId: 'rhythm.six-eight', variantIds: ['quarters-and-eighths'] }] };
    expect(codes([rhythm])).toContain('SLOTMAP_EVALUATOR');
  });

  it('밭이 다루지 않는 음자리표의 판본이면 알린다: 낮은음 밭에 높은음자리표 판본, 높은음 밭에 낮은음자리표 판본', () => {
    const trebleOnBass = { ...clone(N2), quests: [{ questId: 'staff.lines-and-spaces', variantIds: ['treble-lines'] }] };
    expect(codes([trebleOnBass])).toContain('SLOTMAP_CLEF');
    const bassOnTreble = { ...clone(N1), quests: [{ questId: 'staff.lines-and-spaces', variantIds: ['bass-lines'] }] };
    expect(codes([bassOnTreble])).toContain('SLOTMAP_CLEF');
    // 가운데 턱은 두 음자리표를 모두 다룬다
    const both = { ...clone(N3), quests: [{ questId: 'staff.lines-and-spaces', variantIds: ['treble-lines', 'bass-lines'] }] };
    expect(codes([both])).not.toContain('SLOTMAP_CLEF');
  });

  it('정답의 높이가 밭의 범위 밖이면 알린다: 높은음 밭의 low를 C4로 올리면 A3 정답이 범위 밖이다', () => {
    const tooHigh = retarget({ ...clone(N1), quests: [{ questId: 'staff.ledger-lines', variantIds: ['treble-far-ledger'] }] }, 'C4', 'C6');
    expect(codes([tooHigh])).toEqual(['TERRACE_RANGE']);
    // 낮은음 밭의 high를 C4로 내리면 E4 정답이 범위 밖이다
    const tooLow = retarget({ ...clone(N2), quests: [{ questId: 'staff.ledger-lines', variantIds: ['bass-ledger'] }] }, 'C2', 'C4');
    expect(codes([tooLow])).toEqual(['TERRACE_RANGE']);
    // 범위가 넉넉하면 문제없다
    expect(codes([retarget(N1, 'A3', 'C6')])).toEqual([]);
  });

  it('판본의 칸이 밭의 열(8개)보다 많으면 알린다', () => {
    const wide = clone(quests);
    const q09 = wide.find((q) => q.questId === 'staff.lines-and-spaces')!;
    const spec = q09.variants['treble-lines']!.evaluatorSpec as unknown as { targets: unknown[] };
    while (spec.targets.length < 9) spec.targets.push(clone(spec.targets[0]));
    expect(codes([N1], { map, quests: wide })).toContain('SLOTMAP_COUNT');
  });
});

describe('열(자리) 검사', () => {
  it('높이 범위의 low와 high가 음 이름이 아니거나, low가 high보다 높거나 같거나, 덧줄 범위(C2–C6)를 벗어나면 알린다', () => {
    const bad = clone(N1);
    field(bad).low = 'H3';
    expect(codes([bad])).toContain('TERRACE_RANGE');
    const same = clone(N1);
    field(same).low = 'C6';
    expect(codes([same])).toContain('TERRACE_RANGE');
    const inverted = clone(N1);
    field(inverted).low = 'D6';
    expect(codes([inverted])).toContain('TERRACE_RANGE');
    const low = clone(N2);
    field(low).low = 'C1';
    expect(codes([low])).toContain('TERRACE_RANGE');
    const high = clone(N1);
    field(high).high = 'D6';
    expect(codes([high])).toContain('TERRACE_RANGE');
  });

  it('열 수가 8개가 아니면 알린다', () => {
    const short = clone(N1);
    short.slots.pop();
    expect(codes([short])).toContain('SLOT_COUNT');
    const long = clone(N1);
    long.slots.push({ slot: 9, x: 4352 + 8 * 140, y: 304, w: 96, h: 816 });
    expect(codes([long])).toContain('SLOT_COUNT');
  });

  it('열의 폭이 96 px가 아니거나 높이 범위를 덮지 않으면 알린다', () => {
    const wide = clone(N1);
    wide.slots[3]!.w = 100;
    expect(codes([wide])).toContain('SLOT_GRID');
    const lower = clone(N1);
    lower.slots[3]!.y += 48;
    expect(codes([lower])).toContain('SLOT_GRID');
    const shorter = clone(N1);
    shorter.slots[3]!.h -= 48;
    expect(codes([shorter])).toContain('SLOT_GRID');
  });

  it('열이 140 px 간격으로 왼쪽부터 서지 않으면 알린다', () => {
    const off = clone(N1);
    off.slots[5]!.x += 8;
    expect(codes([off])).toContain('SLOT_ORDER');
    const swapped = clone(N1);
    [swapped.slots[1]!.x, swapped.slots[2]!.x] = [swapped.slots[2]!.x, swapped.slots[1]!.x];
    expect(codes([swapped])).toContain('SLOT_ORDER');
  });

  it('열이 지역 밖이면 알린다', () => {
    const out = clone(N1);
    out.slots.forEach((s) => (s.x += 400));
    expect(codes([out])).toContain('SLOT_OUTSIDE');
  });

  it('변환표 모양은 형식 검사에서 먼저 걸러진다: 가온 도의 세로 좌표는 정수, 음자리표는 높은음과 낮은음 중 겹치지 않게', () => {
    const raw = readJson('content', 'installations', 'inst.staff-hill.treble-terrace.json') as Record<string, unknown>;
    const t = (slotMap: Record<string, unknown>): string[] => parseInstallation({ ...clone(raw), slotMap }, 'x.json').issues.map((i) => i.code);
    const ok = { kind: 'staffField', c4Y: 1000, low: 'A3', high: 'C6', clefs: ['treble'] };
    expect(t(ok)).toEqual([]);
    expect(t({ ...ok, c4Y: 1000.5 })).toContain('SHAPE');
    expect(t({ ...ok, c4Y: 'x' })).toContain('SHAPE');
    expect(t({ ...ok, clefs: [] })).toContain('SHAPE');
    expect(t({ ...ok, clefs: ['alto'] })).toContain('SHAPE');
    expect(t({ ...ok, clefs: ['treble', 'treble'] })).toContain('SHAPE');
    expect(t({ ...ok, clefs: 'treble' })).toContain('SHAPE');
    expect(t({ ...ok, low: undefined })).toContain('SHAPE');
    expect(t({ ...ok, high: 7 })).toContain('SHAPE');
    expect(t({ ...ok, clefs: ['bass', 'treble'] })).toEqual([]);
  });
});

describe('카메라 틀과 월드 점(4.7)', () => {
  it('slotBounds는 위쪽 열 번호 띠(56 px)와 왼쪽 음자리표 조각상 띠(64 px)까지 담는다', () => {
    expect(slotBounds(N1)).toEqual({ x: 4288, y: 248, w: 1140, h: 872 });
    expect(slotBounds(N2)).toEqual({ x: 4288, y: 824, w: 1140, h: 872 });
    expect(slotBounds(N3)).toEqual({ x: 4288, y: 248, w: 1140, h: 1448 });
    for (const i of ALL) expect(slotBounds(i), i.installationId).toEqual(terraceBounds(i));
  });

  it('온음계 한 칸(48 px)이 화면에서 48 px 아래로 줄지 않는다: minZoom = 48 / 48 = 1, 배율을 지키고 세로로 고른 열의 등을 따라간다', () => {
    const t = frameTuningOf(N1);
    expect(t).toEqual({ pad: TERRACE_FRAME_PAD, minZoom: MIN_CELL_ON_SCREEN / TERRACE_STEP_PX, strictMinZoom: true });
    expect(t.minZoom).toBe(1);
    for (const i of ALL) expect(frameTuningOf(i)).toEqual(t);
  });

  it('점은 열 번호로 바뀐다: 셋째 열의 가운데는 높이와 상관없이 3번이다', () => {
    const s = N1.slots[2]!;
    for (const y of [s.y + 1, s.y + s.h / 2, s.y + s.h - 1]) expect(slotAtPoint(N1, s.x + s.w / 2, y)).toBe(3);
    expect(slotAtPoint(N1, 4352 + 4, 700)).toBe(1);
    expect(slotAtPoint(N1, 4352 + 7 * 140 + 90, 700)).toBe(8);
  });

  it('열 사이의 길(44 px 틈)과 밭 위아래는 어느 열도 아니다. 누르기 여유가 있으면 가까운 열이 눌린다', () => {
    const first = N1.slots[0]!;
    const gapX = first.x + first.w + 22;
    expect(slotAtPoint(N1, gapX, 700, 0)).toBeNull();
    expect(slotAtPoint(N1, first.x + 10, first.y - 10, 0)).toBeNull();
    expect(slotAtPoint(N1, first.x + 10, first.y + first.h + 10, 0)).toBeNull();
    expect(slotAtPoint(N1, first.x + first.w + 8, 700, 12)).toBe(1);
    expect(slotAtPoint(N1, first.x - 8, 700, 12)).toBe(1);
  });
});
