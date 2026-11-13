// 7-1 관찰 O1 '허수아비 밭'(설계서 3.5, 5.3): 판정이 없는 관찰 지점이다. 허수아비의 팔이 음표의 기둥이고,
// 밭의 높이에 따라 팔이 위나 아래로 향한 것을 보고 지나간다. 가운데 줄(밧줄)보다 아래 음은 기둥이 위로, 그 위의 음은 아래로 향한다.
// 허수아비는 언덕의 지도(world-src/regions/staff-hill.tmj)에 놓인 그림 사물이므로, 이 시험은 지금 놓인 지도를 읽어 본다.
// 시험하는 것: ① 기둥 방향 규칙(순수 계산) ② 놓인 일곱 허수아비의 자리가 보표 위치와 같고 그림의 방향이 규칙과 같음
// ③ 그림 속 팔이 정말 위로(또는 아래로) 뻗어 있음 ④ 나무가 그림을 덮지 않고 밭 안을 걸을 수 있음 ⑤ 판정과 연결되지 않음.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { staffPositionOf, STAFF_MIDDLE_LINE, stemDirectionOf } from '../../src/domain/staff';
import { TERRACE_STEP_PX } from '../../src/domain/terrace';
import type { WorldObjectData } from '../../src/world/objects';
import { loadWorldSource } from '../../tools/world-source';
import { loadRegionDefs } from '../../tools/world-files';
import { buildWorld } from '../../world-src/index';

const root = path.resolve(__dirname, '../..');
const build = buildWorld(loadRegionDefs(root), loadWorldSource(root));

/** 설계서 3.5의 관찰 지점 좌표: 허수아비 밭의 가운데(밧줄이 지나는 자리) */
const FIELD = { x: 3500, y: 900 };
/** 허수아비 사이의 가로 간격(그림 폭 104보다 좁아서 키 큰 팔이 서로 가리지 않을 만큼만 겹친다) */
const SPACING_X = 90;

const scarecrows = build.objects.filter((o) => /^scarecrow-staff-hill-p\d+$/.test(o.id));
const rope = build.objects.find((o) => o.id === 'rope-staff-hill-middle-line');
/** 허수아비 이름 끝의 번호가 보표 위치다(맨 아랫줄 0 … 맨 윗줄 8). 가운데 줄은 4다 */
const positionOf = (o: WorldObjectData): number => Number(/p(\d+)$/.exec(o.id)![1]);
const frameOf = (o: WorldObjectData) => ({ x: o.x - o.ax * o.w, y: o.y - o.ay * o.h, w: o.w, h: o.h });
const frames = (): Array<{ id: string; x: number; y: number; w: number; h: number }> => [...scarecrows, rope!].map((o) => ({ id: o.id, ...frameOf(o) }));

/** 나무 그림의 덮개 원: 그림 파일 이름 'obj-…-tree-r90.svg'의 숫자가 덮개의 반지름이고, 그림 틀의 가운데가 원의 가운데다 */
function canopyOf(o: WorldObjectData): { x: number; y: number; r: number } | null {
  if (o.kind !== 'tree') return null;
  const m = /-r(\d+)\.svg$/.exec(o.file);
  if (!m) return null;
  return { x: o.x - o.ax * o.w + o.w / 2, y: o.y - o.ay * o.h + o.h / 2, r: Number(m[1]) };
}
const circleTouches = (c: { x: number; y: number; r: number }, rect: { x: number; y: number; w: number; h: number }): boolean => {
  const dx = Math.max(rect.x - c.x, 0, c.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - c.y, 0, c.y - (rect.y + rect.h));
  return Math.hypot(dx, dy) <= c.r;
};
/** 어느 나무의 덮개가 이 틀들 가운데 하나라도 건드리는가 */
const trespassers = (objects: readonly WorldObjectData[], rects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): string[] =>
  objects.filter((o) => {
    const c = canopyOf(o);
    return c !== null && rects.some((r) => circleTouches(c, r));
  }).map((o) => o.id);

describe('기둥의 방향 규칙(순수 계산)', () => {
  it('가운데 줄보다 아래 음은 기둥이 위로, 가운데 줄과 그 위의 음은 아래로 향한다', () => {
    expect(STAFF_MIDDLE_LINE).toBe(4);
    for (let p = -6; p <= 14; p++) expect(stemDirectionOf(p), `위치 ${p}`).toBe(p < 4 ? 'up' : 'down');
    // 경계: 넷째 위치(아래에서 셋째 칸의 위 한 칸 아래)가 마지막 '위로', 가운데 줄이 처음 '아래로'다
    expect(stemDirectionOf(3)).toBe('up');
    expect(stemDirectionOf(4)).toBe('down');
    expect(stemDirectionOf(5)).toBe('down');
  });

  it('음자리표와 상관없이 보표 위치로만 정해진다: 높은음자리표의 B4와 낮은음자리표의 D3은 모두 가운데 줄이라 기둥이 아래로 간다', () => {
    const at = (clef: 'treble' | 'bass', letter: 'A' | 'B' | 'C' | 'D', octave: number) => stemDirectionOf(staffPositionOf(clef, { letter, octave }));
    expect(at('treble', 'B', 4)).toBe('down');
    expect(at('bass', 'D', 3)).toBe('down');
    expect(at('treble', 'A', 4)).toBe('up');
    expect(at('bass', 'C', 3)).toBe('up');
    // 가운데 도(C4)는 높은음자리표에서는 아래 첫 덧줄이라 위로, 낮은음자리표에서는 위 첫 덧줄이라 아래로 간다
    expect(at('treble', 'C', 4)).toBe('up');
    expect(at('bass', 'C', 4)).toBe('down');
  });
});

describe('허수아비 밭(O1)', () => {
  it('지도가 깨끗하게 구워진다(정거장은 23곳 그대로다: 관찰 지점은 정거장이 아니다)', () => {
    expect(build.issues).toEqual([]);
    expect(build.stands && Object.keys(build.stands)).toHaveLength(23);
  });

  it('밧줄 하나와 허수아비 일곱이 놓여 있다. 밧줄이 가운데 줄이고 밭의 가운데는 설계서의 관찰 지점 (3500, 900)이다', () => {
    expect(rope).toBeDefined();
    expect(rope).toMatchObject({ kind: 'prop', file: 'obj-staff-hill-field-rope.svg', x: FIELD.x, y: FIELD.y, ay: 0.5 });
    expect(scarecrows.map(positionOf).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // 가운데 줄에 선 허수아비(위치 4)가 밭의 한가운데다
    const mid = scarecrows.find((o) => positionOf(o) === STAFF_MIDDLE_LINE)!;
    expect({ x: mid.x, y: mid.y }).toEqual(FIELD);
  });

  it(`허수아비의 높이는 보표 위치와 같다: 위치가 하나 오르면 ${TERRACE_STEP_PX} px 높이 서고(계단밭의 한 칸과 같다), 가로로 ${SPACING_X} px씩 오른쪽으로 선다`, () => {
    for (const o of scarecrows) {
      const p = positionOf(o);
      expect(o.y, `${o.id} 높이`).toBe(rope!.y + TERRACE_STEP_PX * (STAFF_MIDDLE_LINE - p));
      expect(o.x, `${o.id} 가로`).toBe(rope!.x + SPACING_X * (p - STAFF_MIDDLE_LINE));
    }
  });

  it('그림의 방향이 규칙과 같다: 밧줄보다 아래(화면 아래쪽) 허수아비는 팔이 위로, 밧줄 위의 것과 밧줄 위에 선 것은 팔이 아래로 향한다', () => {
    for (const o of scarecrows) {
      const want = stemDirectionOf(positionOf(o));
      expect(o.file, o.id).toBe(`obj-staff-hill-scarecrow-${want}.svg`);
      // 밧줄과의 위아래로 다시 읽어도 같다(이름의 번호가 아니라 놓인 높이로)
      expect(o.y > rope!.y ? 'up' : 'down', `${o.id} 놓인 높이`).toBe(want);
    }
    // 위로 향한 것이 셋(위치 1–3), 아래로 향한 것이 넷(위치 4–7, 가운데 줄 포함)이다
    expect(scarecrows.filter((o) => o.file.endsWith('-up.svg'))).toHaveLength(3);
    expect(scarecrows.filter((o) => o.file.endsWith('-down.svg'))).toHaveLength(4);
  });

  it('그림 속의 팔이 정말 그 쪽으로 뻗는다: 그림의 기준점은 허수아비의 머리이고, 팔(막대)은 머리에서 위(또는 아래)로 100 px 넘게 뻗어 있다', () => {
    const stem = (svg: string) => {
      const m = /<rect x="([\d.]+)" y="([\d.]+)" width="8" height="([\d.]+)"/.exec(svg);
      expect(m, '팔(너비 8의 막대)을 찾지 못했어요').not.toBeNull();
      return { top: Number(m![2]), bottom: Number(m![2]) + Number(m![3]) };
    };
    for (const dir of ['up', 'down'] as const) {
      const o = scarecrows.find((s) => s.file === `obj-staff-hill-scarecrow-${dir}.svg`)!;
      const svg = build.sprites[o.file]!;
      const headY = o.ay * o.h;
      const { top, bottom } = stem(svg);
      if (dir === 'up') {
        expect(top, '위로 향한 팔의 끝은 머리보다 높다').toBeLessThan(headY - 100);
        expect(bottom, '팔은 머리에서 시작한다').toBeGreaterThanOrEqual(headY);
      } else {
        expect(bottom, '아래로 향한 팔의 끝은 머리보다 낮다').toBeGreaterThan(headY + 100);
        expect(top, '팔은 머리에서 시작한다').toBeLessThanOrEqual(headY);
      }
    }
  });

  it('밭은 오선 언덕 안에 있고, 놓인 그림 틀이 모두 지역의 경계 안이다', () => {
    const region = JSON.parse(fs.readFileSync(path.join(root, 'content', 'regions', 'staff-hill.json'), 'utf-8')) as { boundsTiles: { x0: number; x1: number; y0: number; y1: number } };
    const b = region.boundsTiles;
    for (const f of frames()) {
      expect(f.x, `${f.id} 왼쪽`).toBeGreaterThanOrEqual(b.x0 * 32);
      expect(f.x + f.w, `${f.id} 오른쪽`).toBeLessThanOrEqual((b.x1 + 1) * 32);
      expect(f.y, `${f.id} 위쪽`).toBeGreaterThanOrEqual(b.y0 * 32);
      expect(f.y + f.h, `${f.id} 아래쪽`).toBeLessThanOrEqual((b.y1 + 1) * 32);
    }
  });

  it('어떤 나무의 덮개도 허수아비와 밧줄 그림을 덮지 않는다(나무 잎이 팔을 가리면 관찰이 안 된다)', () => {
    expect(trespassers(build.objects, frames())).toEqual([]);
  });

  it('줄기가 막은 자리도 없다: 그림 틀 안을 16 px 간격으로 훑어도 막힌 점이 없다(밭 안을 걸어 다닐 수 있다)', () => {
    const blocked: string[] = [];
    for (const f of frames()) for (let y = f.y + 4; y < f.y + f.h; y += 16) for (let x = f.x + 4; x < f.x + f.w; x += 16) if (build.grid.isBlockedPoint(x, y)) blocked.push(`${f.id}(${x}, ${y})`);
    expect(blocked).toEqual([]);
    // 허수아비는 막지 않는다(그림이 있어도 걸어 지나갈 수 있다): 머리가 놓인 점과 팔 끝, 밭의 가운데에 캐릭터 몸이 들어가도 막히지 않는다
    for (const o of scarecrows) {
      expect(build.grid.circleHitsBlocked(o.x, o.y), `${o.id} 놓인 점`).toBe(false);
      expect(build.grid.circleHitsBlocked(o.x, o.sortY), `${o.id} 발`).toBe(false);
    }
  });

  it('관찰에는 판정이 없다: 어느 과제도 설치물도 허수아비를 가리키지 않고, 정거장이 아니라서 누르기 영역도 없다', () => {
    for (const o of [...scarecrows, rope!]) expect(o.stationId, o.id).toBeUndefined();
    const quests = fs.readdirSync(path.join(root, 'content', 'quests')).map((f) => fs.readFileSync(path.join(root, 'content', 'quests', f), 'utf-8'));
    const insts = fs.readdirSync(path.join(root, 'content', 'installations')).map((f) => fs.readFileSync(path.join(root, 'content', 'installations', f), 'utf-8'));
    for (const text of [...quests, ...insts]) expect(text).not.toMatch(/scarecrow|허수아비/);
  });

  it('검사가 헛돌지 않는다: 허수아비 한가운데에 나무를 놓으면 덮개가 걸리고, 규칙을 거꾸로 한 그림은 걸린다', () => {
    const mid = scarecrows.find((o) => positionOf(o) === STAFF_MIDDLE_LINE)!;
    const tree: WorldObjectData = { id: 'stray', kind: 'tree', file: 'obj-staff-hill-tree-r72.svg', x: mid.x, y: mid.y, ax: 0.5, ay: 0.5, w: 152, h: 152, sortY: mid.y + 36 };
    expect(trespassers([tree], frames())).toEqual(['stray']);
    expect(trespassers([{ ...tree, x: mid.x + 800 }], frames())).toEqual([]);
    // 가운데 줄 아래(위치 3)의 허수아비가 팔을 아래로 향한 그림을 쓰면 규칙과 달라진다
    const low = scarecrows.find((o) => positionOf(o) === 3)!;
    expect(low.file).not.toBe('obj-staff-hill-scarecrow-down.svg');
    expect(`obj-staff-hill-scarecrow-${stemDirectionOf(positionOf(low))}.svg`).toBe(low.file);
  });
});
