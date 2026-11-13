// 6-7 종나무 숲의 설치물 네 곳(W1 세 종 나무, W2 밝은 종 어두운 종, W3 종탑, W4 세 기둥 빈터)과 종나무 변환표(bellTree, 4.6)의 검사.
// 자리(고리)의 격자와 번호, 판정기와 모양의 짝, 음역과 단, 카메라 틀, 월드 점이 고리 번호로 바뀌는 길을 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@/domain/content';
import { ARCHETYPE_CODES, BELL_CELL_H, BELL_CELL_W, BELL_FORMS, BELL_FRAME_PAD, BELL_LABEL_LEFT, BELL_LABEL_TOP, MIN_CELL_ON_SCREEN, SLOT_MAP_KINDS, frameTuningOf, parseInstallation, slotAtPoint, slotBounds, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
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
const W1 = load('inst.bell-grove.three-bells');
const W2 = load('inst.bell-grove.bright-dark');
const W3 = load('inst.bell-grove.bell-tower');
const W4 = load('inst.bell-grove.three-pillars');
const ALL = [W1, W2, W3, W4];
const codes = (list: InstallationDef[], ctx = { map, quests }): string[] => validateInstallationSet(list, ctx).map((i) => i.code);
const bell = (inst: InstallationDef): Extract<NonNullable<InstallationDef['slotMap']>, { kind: 'bellTree' }> => {
  if (inst.slotMap?.kind !== 'bellTree') throw new Error('종나무가 아니에요');
  return inst.slotMap;
};

describe('종나무 변환표의 상수(4.6)', () => {
  it('변환표 종류에 bellTree가 있고 원형 이름은 T4다', () => {
    expect(SLOT_MAP_KINDS).toContain('bellTree');
    expect(ARCHETYPE_CODES.bellTree).toBe('T4');
    expect(BELL_FORMS).toEqual(['tree', 'tower', 'glade']);
  });

  it('고리 한 칸은 80 × 72 px이고, 이름 띠는 왼쪽 52 px, 위쪽 44 px이다', () => {
    expect([BELL_CELL_W, BELL_CELL_H, BELL_LABEL_LEFT, BELL_LABEL_TOP, BELL_FRAME_PAD]).toEqual([80, 72, 52, 44, 24]);
  });
});

describe('네 설치물의 정의', () => {
  it('정거장 W1–W4, 종나무 숲, 쌍둥이 패널은 panel.chord다', () => {
    expect(ALL.map((i) => [i.stationCode, i.regionId, i.archetype, i.name, i.panelTwin])).toEqual([
      ['W1', 'bell-grove', 'bellTree', '세 종 나무', 'panel.chord'],
      ['W2', 'bell-grove', 'bellTree', '밝은 종 어두운 종', 'panel.chord'],
      ['W3', 'bell-grove', 'bellTree', '종탑', 'panel.chord'],
      ['W4', 'bell-grove', 'bellTree', '세 기둥 빈터', 'panel.chord'],
    ]);
    for (const i of ALL) expect(ARCHETYPE_CODES[i.archetype]).toBe('T4');
  });

  it('상호작용 점은 정거장 점 그대로이고 서명 소리 id가 있다(소리는 6-8)', () => {
    for (const i of ALL) {
      const st = map.station(i.stationCode)!;
      expect(i.interactPoint, i.installationId).toEqual({ x: st.x, y: st.y });
      expect(i.signatureSoundId).toBe(`sig.bell-grove.${i.installationId.split('.')[2]}`);
    }
  });

  it('모양과 열 수: 나무(W1, W2)는 열 넷, 종탑(W3)은 열 셋, 빈터(W4)는 나무 셋에 열 넷. 단은 옥타브 5, 4, 3, 2다(위에서 아래로)', () => {
    expect(ALL.map((i) => bell(i))).toEqual([
      { kind: 'bellTree', form: 'tree', trees: 1, columns: 4, octaves: [5, 4, 3, 2] },
      { kind: 'bellTree', form: 'tree', trees: 1, columns: 4, octaves: [5, 4, 3, 2] },
      { kind: 'bellTree', form: 'tower', trees: 1, columns: 3, octaves: [5, 4, 3, 2] },
      { kind: 'bellTree', form: 'glade', trees: 3, columns: 4, octaves: [5, 4, 3, 2] },
    ]);
  });

  it('고리의 수는 나무 × 단 × 열이다: 16, 16, 12, 48', () => {
    expect(ALL.map((i) => i.slots.length)).toEqual([16, 16, 12, 48]);
  });

  it('과제와 판본: W1은 Q05, W2는 Q20과 Q22, W3은 Q06, W4는 Q21과 Q23이다', () => {
    expect(ALL.map((i) => i.quests)).toEqual([
      [{ questId: 'chord.major-triad', variantIds: ['c-major', 'f-major', 'g-major'] }],
      [
        { questId: 'chord.major-and-minor', variantIds: ['c-minor', 'a-minor', 'd-minor', 'e-minor'] },
        { questId: 'chord.diminished-augmented', variantIds: ['b-dim', 'c-aug'] },
      ],
      [{ questId: 'chord.inversion', variantIds: ['c-first', 'c-second', 'f-first', 'f-second', 'g-first', 'g-second'] }],
      [
        { questId: 'chord.primary-triads', variantIds: ['c-major-pillars'] },
        { questId: 'chord.progression-walk', variantIds: ['c-major-walk'] },
      ],
    ]);
  });

  it('고리는 나무 차례, 단 차례(맨 위가 먼저), 열 차례(왼쪽이 먼저)로 번호가 붙고, 격자에 틈이 없다', () => {
    for (const i of ALL) {
      const m = bell(i);
      const rows = m.octaves.length;
      const first = i.slots[0]!;
      i.slots.forEach((s, n) => {
        const tree = Math.floor(n / (rows * m.columns));
        const row = Math.floor(n / m.columns) % rows;
        const column = n % m.columns;
        const treeX = i.slots[tree * rows * m.columns]!.x;
        expect(s.slot, `${i.installationId} ${n}`).toBe(n + 1);
        expect([s.w, s.h]).toEqual([BELL_CELL_W, BELL_CELL_H]);
        expect([s.x, s.y]).toEqual([treeX + column * BELL_CELL_W, first.y + row * BELL_CELL_H]);
      });
    }
  });

  it('빈터의 나무 셋은 가로로 96 px씩 떨어져 서고 같은 높이에 있다', () => {
    const xs = [0, 16, 32].map((n) => W4.slots[n]!.x);
    expect(xs).toEqual([356, 772, 1188]);
    expect(xs[1]! - (xs[0]! + 4 * BELL_CELL_W)).toBe(96);
    expect(xs[2]! - (xs[1]! + 4 * BELL_CELL_W)).toBe(96);
    expect(new Set([0, 16, 32].map((n) => W4.slots[n]!.y)).size).toBe(1);
  });

  it('고리 자리(나무마다의 첫 고리)', () => {
    expect([W1, W2, W3].map((i) => [i.slots[0]!.x, i.slots[0]!.y])).toEqual([
      [1740, 2292],
      [1580, 3090],
      [980, 2092],
    ]);
    expect([W4.slots[0]!.x, W4.slots[0]!.y]).toEqual([356, 1188]);
  });

  it('content 폴더 전체와 설치물 연결 검사를 통과한다(정거장, 과제, 쌍둥이 패널, 지역 범위)', () => {
    expect(validateContentDir(root)).toEqual([]);
    expect(codes(ALL)).toEqual([]);
  });

  it('고리 틀(이름 띠까지)은 정거장 서는 자리에서 60 px 이상 떨어져 있다(서는 자리가 종 위에 놓이지 않는다)', () => {
    for (const i of ALL) {
      const b = slotBounds(i);
      const st = map.station(i.stationCode)!;
      const dx = Math.max(b.x - st.x, 0, st.x - (b.x + b.w));
      const dy = Math.max(b.y - st.y, 0, st.y - (b.y + b.h));
      expect(Math.hypot(dx, dy), i.installationId).toBeGreaterThanOrEqual(60);
    }
  });
});

describe('판본과 모양의 짝, 음역과 단(검사)', () => {
  it('원본 그대로는 문제가 없다', () => {
    for (const i of ALL) expect(codes([i]), i.installationId).toEqual([]);
  });

  it('구성음 판본(Q05)을 종탑 모양에 놓거나 열 수가 다르면 알린다', () => {
    const wrongForm = { ...clone(W1), slotMap: { ...bell(W1), form: 'tower' as const } };
    expect(codes([wrongForm])).toContain('SLOTMAP_FORM');
    // 열이 셋인 나무에 종 칸이 넷인 판본: 고리 수도 어긋나지만 판본 쪽 문제도 알린다
    const threeColumns = { ...clone(W3), quests: [{ questId: 'chord.major-triad', variantIds: ['c-major'] }], stationCode: 'W1' };
    const c = codes([threeColumns]);
    expect(c).toContain('SLOTMAP_COUNT');
    expect(c).toContain('SLOTMAP_FORM');
  });

  it('전위 판본(Q06)은 종탑에만 놓인다: 열 셋', () => {
    const asTree = { ...clone(W1), stationCode: 'W3', quests: [{ questId: 'chord.inversion', variantIds: ['c-first'] }] };
    expect(codes([asTree])).toEqual(expect.arrayContaining(['SLOTMAP_FORM', 'SLOTMAP_COUNT']));
  });

  it('사건 목록 판본(Q21, Q23)은 나무 수가 판정기의 trees와 같은 빈터에만 놓인다', () => {
    const oneTree = { ...clone(W4), slots: W4.slots.slice(0, 16), slotMap: { ...bell(W4), form: 'tree' as const, trees: 1 } };
    const c = codes([oneTree]);
    expect(c).toContain('SLOTMAP_FORM');
    expect(c).toContain('SLOTMAP_COUNT');
    const twoTrees = { ...clone(W4), slots: W4.slots.slice(0, 32), slotMap: { ...bell(W4), trees: 2 } };
    expect(codes([twoTrees])).toContain('SLOTMAP_COUNT');
  });

  it('판본의 음역 옥타브가 나무의 단에 없으면 알린다(Q06은 C2–B5)', () => {
    const noLowRing = clone(W3);
    noLowRing.slotMap = { ...bell(W3), octaves: [5, 4, 3] };
    noLowRing.slots = noLowRing.slots.slice(0, 9);
    expect(codes([noLowRing])).toContain('BELL_RANGE');
  });

  it('종나무가 아닌 판정기(rhythmPlacement)는 종나무 변환표에 놓을 수 없다', () => {
    const rhythm = { ...clone(W1), quests: [{ questId: 'rhythm.six-eight', variantIds: ['quarters-and-eighths'] }] };
    expect(codes([rhythm])).toContain('SLOTMAP_EVALUATOR');
  });
});

describe('고리(자리) 검사', () => {
  it('나무가 하나인 모양에 나무를 둘로 적거나, 빈터가 나무 하나이면 알린다', () => {
    const twoTrees = clone(W1);
    twoTrees.slotMap = { ...bell(W1), trees: 2 };
    expect(codes([twoTrees])).toContain('BELL_TREES');
    const oneGlade = clone(W4);
    oneGlade.slotMap = { ...bell(W4), trees: 1 };
    oneGlade.slots = oneGlade.slots.slice(0, 16);
    expect(codes([oneGlade])).toContain('BELL_TREES');
  });

  it('단은 맨 위부터 한 옥타브씩 내려가야 한다', () => {
    const skip = clone(W1);
    skip.slotMap = { ...bell(W1), octaves: [5, 3, 2, 1] };
    expect(codes([skip])).toContain('BELL_OCTAVES');
  });

  it('고리 수가 나무 × 단 × 열과 다르면 알린다', () => {
    const short = clone(W1);
    short.slots.pop();
    expect(codes([short])).toContain('SLOT_COUNT');
  });

  it('고리 크기가 80 × 72가 아니거나 격자에서 벗어나거나 나무가 앞 나무 위에 겹치면 알린다', () => {
    const size = clone(W1);
    size.slots[5]!.w = 96;
    expect(codes([size])).toContain('SLOT_GRID');
    const off = clone(W1);
    off.slots[5]!.x += 8;
    expect(codes([off])).toContain('SLOT_ORDER');
    const overlap = clone(W4);
    for (let n = 16; n < 32; n++) overlap.slots[n]!.x -= 340;
    expect(codes([overlap])).toContain('SLOT_ORDER');
  });

  it('고리가 지역 밖이면 알린다', () => {
    const out = clone(W4);
    out.slots.forEach((s) => (s.x -= 400));
    expect(codes([out])).toContain('SLOT_OUTSIDE');
  });

  it('모양과 열과 나무와 단은 형식 검사에서 먼저 걸러진다', () => {
    const raw = readJson('content', 'installations', 'inst.bell-grove.three-bells.json') as Record<string, any>;
    const t = (slotMap: Record<string, unknown>): string[] => parseInstallation({ ...clone(raw), slotMap }, 'x.json').issues.map((i) => i.code);
    expect(t({ kind: 'bellTree', form: 'forest', trees: 1, columns: 4, octaves: [5, 4] })).toContain('SHAPE');
    expect(t({ kind: 'bellTree', form: 'tree', trees: 0, columns: 4, octaves: [5, 4] })).toContain('SHAPE');
    expect(t({ kind: 'bellTree', form: 'tree', trees: 1, columns: 0, octaves: [5, 4] })).toContain('SHAPE');
    expect(t({ kind: 'bellTree', form: 'tree', trees: 1, columns: 4, octaves: [] })).toContain('SHAPE');
    expect(t({ kind: 'bellTree', form: 'tree', trees: 1, columns: 4, octaves: [5, 'x'] })).toContain('SHAPE');
  });
});

describe('카메라 틀과 월드 점(4.6)', () => {
  it('slotBounds는 이름 띠(왼쪽 52, 위쪽 44)까지 담는다', () => {
    expect(slotBounds(W1)).toEqual({ x: 1688, y: 2248, w: 372, h: 332 });
    expect(slotBounds(W3)).toEqual({ x: 928, y: 2048, w: 292, h: 332 });
    expect(slotBounds(W4)).toEqual({ x: 304, y: 1144, w: 1204, h: 332 });
  });

  it('고리 한 칸이 화면에서 48 px 아래로 줄지 않는다: minZoom = 48 / 72, 배율을 지키고 가로로도 따라간다', () => {
    const t = frameTuningOf(W1);
    expect(t).toEqual({ pad: BELL_FRAME_PAD, minZoom: MIN_CELL_ON_SCREEN / BELL_CELL_H, strictMinZoom: true });
    expect(t.minZoom! * Math.min(BELL_CELL_W, BELL_CELL_H)).toBeCloseTo(48, 6);
    for (const i of ALL) expect(frameTuningOf(i)).toEqual(t);
  });

  it('점은 고리 번호로 바뀐다: 나무 W1의 둘째 단(옥타브 4), 셋째 열의 한가운데는 7번이다', () => {
    const s = W1.slots[6]!;
    expect(slotAtPoint(W1, s.x + s.w / 2, s.y + s.h / 2)).toBe(7);
    expect(bell(W1).octaves[Math.floor(6 / 4) % 4]).toBe(4);
  });

  it('빈터에서는 나무마다 번호가 이어진다: 둘째 나무의 첫 고리는 17번, 셋째 나무는 33번', () => {
    expect(slotAtPoint(W4, W4.slots[16]!.x + 4, W4.slots[16]!.y + 4)).toBe(17);
    expect(slotAtPoint(W4, W4.slots[32]!.x + 4, W4.slots[32]!.y + 4)).toBe(33);
    // 나무 사이의 길(96 px 틈)은 어느 고리도 아니다. 누르기 여유(slop)가 틈 반쯤이어도 가운데는 비어 있다
    const gapX = W4.slots[0]!.x + 4 * BELL_CELL_W + 48;
    expect(slotAtPoint(W4, gapX, W4.slots[0]!.y + 10, 0)).toBeNull();
    expect(slotAtPoint(W4, gapX, W4.slots[0]!.y + 10, 24)).toBeNull();
  });

  it('고리 밖의 점은 null이다. 누르기 여유가 있으면 가까운 고리가 눌린다', () => {
    const s = W1.slots[0]!;
    expect(slotAtPoint(W1, s.x - 10, s.y + 10, 0)).toBeNull();
    expect(slotAtPoint(W1, s.x - 10, s.y + 10, 12)).toBe(1);
  });
});
