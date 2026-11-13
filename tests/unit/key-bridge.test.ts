// 7-3 건반 다리(T6, 4.8)의 칸 계산(keyBridge.ts): 널(건반)의 배열과 모양, 이름표·밧줄·깃발이 초안과 만나는 길, 월드가 그리는 자리, 판본과 다리의 짝 검사, 자유로 놀기의 틀.
// 순수 계산만 본다. 설치물 컨트롤러와 작업대는 key-bridge-bench 시험이, 월드 그림은 key-bridge-layer 시험이, 건반 늪의 터는 key-marsh-site 시험이 맡는다.
// 값(널 25장과 13장, 위치, 이름)은 설계서 4.8과 5.7의 건반 배열에서 손으로 센 것이다. 코드의 식을 베끼지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition, QuestVariant } from '@/domain/content';
import { ARCHETYPE_CODES, ARCHETYPE_SLOT_MAP, SLOT_MAP_KINDS, frameTuningOf, parseInstallation, slotAtPoint, slotBounds, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import {
  BRIDGE_BAND_BOTTOM,
  BRIDGE_BAND_TOP,
  BRIDGE_FRAME_PAD,
  BRIDGE_MIN_ZOOM,
  FLAG_CLOTH_H,
  FLAG_CLOTH_W,
  FLAG_POLE_H,
  FLAG_RACK_DY,
  FLAG_SLOT_W,
  FLAG_STACK_DY,
  FLAG_STACK_MAX,
  FREE_BRIDGE_FLAGS,
  NAME_TAGS,
  PLANK_BLACK_H,
  PLANK_BLACK_W,
  PLANK_WHITE_H,
  PLANK_WHITE_W,
  SIGN_BOARD_GAP,
  SIGN_BOARD_H,
  STAKE_H,
  TAG_BOX_H,
  TAG_BOX_W,
  TAG_ROW_DY,
  bridgeBounds,
  bridgeQuestionsOf,
  bridgeSignOf,
  bridgeSlotProblems,
  bridgeTaskOf,
  bridgeVariantProblems,
  flagClearResult,
  flagCountOf,
  flagPlantResult,
  flagPoleOf,
  flagRackSpotOf,
  flagSpotsOf,
  flagStackOf,
  flagTargetsOf,
  freeBridgeFrameOf,
  hungTagText,
  isBlackRect,
  keyBridgeMapOf,
  namesForMidi,
  plankLabelOf,
  plankNames,
  plankOfMidi,
  plankRect,
  plankSpeakOf,
  plankTop,
  planksOf,
  planksOfInstallation,
  planksOfRange,
  ropeReadout,
  ropeText,
  signBoardOf,
  stakeNameOf,
  stakeTopOf,
  stakeWrittenAt,
  tagBoxOf,
  tagClearResult,
  tagHangResult,
  tagPitchNear,
  tagSpotsOf,
} from '@/domain/keyBridge';
import type { BridgeBox, TagSpot } from '@/domain/keyBridge';
import type { SpelledPitch, WrittenPitch } from '@/domain/pitch';
import type { DraftContent, SlotEntry } from '@/domain/session';
import { WorldMap, parseRegion } from '@/domain/world';
import type { RegionDef } from '@/domain/world';
import { validateContentDir } from '../../tools/content-loader';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const questFile = (id: string): QuestDefinition => readJson('content', 'quests', `${id}.json`) as QuestDefinition;
const variantOf = (questId: string, variantId: string): QuestVariant => questFile(questId).variants[variantId]!;
const quests: QuestDefinition[] = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);
const regions: RegionDef[] = fs
  .readdirSync(path.join(root, 'content', 'regions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseRegion(readJson('content', 'regions', f), f).region!);
const map = new WorldMap(regions);

const load = (id: string): InstallationDef => {
  const { installation, issues } = parseInstallation(readJson('content', 'installations', `${id}.json`), `${id}.json`);
  expect(issues).toEqual([]);
  return installation!;
};
const K1 = load('inst.key-marsh.key-bridge');
const K2 = load('inst.key-marsh.interval-rope');
const K3 = load('inst.key-marsh.natural-bridge');
const K4 = load('inst.key-marsh.chromatic-path');
const BRIDGES = [K1, K2, K3];
const N1 = load('inst.staff-hill.treble-terrace');
const codes = (list: InstallationDef[]): string[] => validateInstallationSet(list, { map, quests }).map((i) => i.code);
const bridgeMap = (inst: InstallationDef): { kind: 'keyBridge'; lowMidi: number; whiteCount: number } => {
  const m = keyBridgeMapOf(inst);
  if (!m) throw new Error('건반 다리가 아니에요');
  return m;
};

const P1 = planksOf(bridgeMap(K1));
const P2 = planksOf(bridgeMap(K2));
const P3 = planksOf(bridgeMap(K3));
const names = (planks: ReturnType<typeof planksOf>): string => planks.map((p) => p.name).join(' ');

const Q27 = variantOf('key.black-key-names', 'black-key-names');
const Q28 = variantOf('key.whole-and-half-steps', 'whole-and-half');
const Q29_BASIC = variantOf('key.build-intervals', 'basic');
const Q29_CHALLENGE = variantOf('key.build-intervals', 'challenge');
const Q30 = variantOf('key.accidentals-in-a-bar', 'g-major-f');
const Q31_UP = variantOf('scale.chromatic', 'ascending');
const NAME_TAGS_VARIANT = variantOf('pitch.same-sound-different-names', 'name-tags');
const INTERVAL_NAMES_VARIANT = variantOf('pitch.same-sound-different-names', 'interval-names');
const CLEF_VARIANT = variantOf('staff.lines-and-spaces', 'treble-lines');

const content = (slots: SlotEntry[] = []): DraftContent => ({ slots, events: [], tuplets: [] });
const W = (letter: WrittenPitch['letter'], accidental: WrittenPitch['accidental'], octave: number): WrittenPitch => ({ letter, accidental, octave });
const P = (letter: SpelledPitch['letter'], alter: number, octave: number): SpelledPitch => ({ letter, alter, octave });
const overlap = (a: BridgeBox, b: BridgeBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: BridgeBox, outer: BridgeBox): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe('건반 다리의 상수와 변환표(4.8)', () => {
  it('변환표 종류에 keyBridge가 있고 원형 이름은 T6이다. 원형과 변환표의 짝이 정해져 있다', () => {
    expect(SLOT_MAP_KINDS).toContain('keyBridge');
    expect(ARCHETYPE_CODES.keyBridge).toBe('T6');
    expect(ARCHETYPE_SLOT_MAP.keyBridge).toBe('keyBridge');
  });

  it('흰 널은 72×240, 검은 널은 44×150이고 위쪽 띠는 168 px, 아래쪽 띠는 40 px, 틀 여백은 32 px다. 흰 널 한 장(72 px)이 화면에서 48 px 아래로 줄지 않는다(배율 하한 2/3)', () => {
    expect([PLANK_WHITE_W, PLANK_WHITE_H, PLANK_BLACK_W, PLANK_BLACK_H]).toEqual([72, 240, 44, 150]);
    expect([BRIDGE_BAND_TOP, BRIDGE_BAND_BOTTOM, BRIDGE_FRAME_PAD]).toEqual([168, 40, 32]);
    expect(BRIDGE_MIN_ZOOM).toBeCloseTo(2 / 3, 12);
  });

  it('keyBridgeMapOf는 건반 다리의 변환표만 돌려준다', () => {
    expect(keyBridgeMapOf(K1)).toEqual({ kind: 'keyBridge', lowMidi: 60, whiteCount: 15 });
    expect(keyBridgeMapOf(K2)).toEqual({ kind: 'keyBridge', lowMidi: 60, whiteCount: 8 });
    expect(keyBridgeMapOf(K3)).toEqual({ kind: 'keyBridge', lowMidi: 60, whiteCount: 8 });
    expect(keyBridgeMapOf(K4)).toBeNull(); // 반음 계단은 디딤돌 길(T1)이다
    expect(keyBridgeMapOf(N1)).toBeNull();
    expect(keyBridgeMapOf({})).toBeNull();
  });
});

describe('널의 배열(planksOf)', () => {
  it('K1은 C4에서 C6까지 흰 널 15장과 검은 널 10장, 모두 25장이다. 번호는 소리 높이 차례로 1부터, 반음마다 한 장이다', () => {
    expect(P1).toHaveLength(25);
    expect(names(P1)).toBe('C4 C♯4 D4 D♯4 E4 F4 F♯4 G4 G♯4 A4 A♯4 B4 C5 C♯5 D5 D♯5 E5 F5 F♯5 G5 G♯5 A5 A♯5 B5 C6');
    expect(P1.map((p) => p.slot)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(P1.map((p) => p.midi)).toEqual(Array.from({ length: 25 }, (_, i) => 60 + i));
    expect(P1.filter((p) => !p.black)).toHaveLength(15);
    expect(P1.filter((p) => p.black).map((p) => p.slot)).toEqual([2, 4, 7, 9, 11, 14, 16, 19, 21, 23]);
  });

  it('K2와 K3는 C4에서 C5까지 흰 널 8장과 검은 널 5장, 모두 13장이다', () => {
    for (const p of [P2, P3]) {
      expect(p).toHaveLength(13);
      expect(names(p)).toBe('C4 C♯4 D4 D♯4 E4 F4 F♯4 G4 G♯4 A4 A♯4 B4 C5');
      expect(p.filter((x) => x.black).map((x) => x.slot)).toEqual([2, 4, 7, 9, 11]);
    }
  });

  it('E–F와 B–C 사이에는 검은 널이 없다. 검은 널의 whiteIndex는 바로 왼쪽의 흰 널의 차례다', () => {
    const e = P1.find((p) => p.name === 'E4')!;
    const f = P1.find((p) => p.name === 'F4')!;
    expect(f.slot).toBe(e.slot + 1);
    const b = P1.find((p) => p.name === 'B4')!;
    expect(P1.find((p) => p.name === 'C5')!.slot).toBe(b.slot + 1);
    for (const p of P1.filter((x) => x.black)) {
      const left = P1.find((x) => x.slot === p.slot - 1)!;
      expect(left.black, p.name).toBe(false);
      expect(p.whiteIndex, p.name).toBe(left.whiteIndex);
    }
  });

  it('맨 위의 흰 널 뒤에는 검은 널을 더하지 않는다. 다른 흰 건반에서 시작해도 된다', () => {
    expect(names(planksOf({ lowMidi: 60, whiteCount: 2 }))).toBe('C4 C♯4 D4');
    expect(names(planksOf({ lowMidi: 64, whiteCount: 3 }))).toBe('E4 F4 F♯4 G4');
    expect(names(planksOf({ lowMidi: 60, whiteCount: 1 }))).toBe('C4');
  });

  it('가장 낮은 널이 검은 건반이거나 흰 널이 한 장도 없으면 널이 없다', () => {
    expect(planksOf({ lowMidi: 61, whiteCount: 8 })).toEqual([]);
    expect(planksOf({ lowMidi: 60, whiteCount: 0 })).toEqual([]);
  });

  it('planksOfRange: 판본의 음역(흰 건반에서 흰 건반까지)이 정하는 널들이다. 올림표가 붙었거나 거꾸로이거나 읽을 수 없으면 null이다', () => {
    expect(planksOfRange('C4-C5')).toEqual(P2);
    expect(planksOfRange('C4-C6')).toEqual(P1);
    expect(planksOfRange('C4-C4')!.map((p) => p.name)).toEqual(['C4']);
    expect(planksOfRange('C4-D4')!.map((p) => p.name)).toEqual(['C4', 'C♯4', 'D4']);
    expect(planksOfRange('C♯4-C5')).toBeNull();
    expect(planksOfRange('C4-B♭4')).toBeNull();
    expect(planksOfRange('C5-C4')).toBeNull();
    expect(planksOfRange('xx')).toBeNull();
    expect(planksOfRange('C4')).toBeNull();
    expect(planksOfRange('H4-C5')).toBeNull();
  });
});

describe('널의 모양과 자리(plankRect, planksOfInstallation)', () => {
  const origin = { x: 1000, y: 2000 };

  it('흰 널은 whiteIndex × 72 에서 72×240이고, 검은 널은 왼쪽 흰 널의 오른쪽 끝에 가운데가 걸친 44×150이다. 두 널의 윗면은 같은 높이다', () => {
    const c4 = plankRect(P1[0]!, origin);
    expect(c4).toEqual({ slot: 1, x: 1000, y: 2000, w: 72, h: 240 });
    const cs4 = plankRect(P1[1]!, origin);
    expect(cs4).toEqual({ slot: 2, x: 1050, y: 2000, w: 44, h: 150 }); // 72 − 22
    const d4 = plankRect(P1[2]!, origin);
    expect(d4).toEqual({ slot: 3, x: 1072, y: 2000, w: 72, h: 240 });
    // 검은 널의 가운데는 두 흰 널의 경계(x=1072) 위다
    expect(cs4.x + cs4.w / 2).toBe(1072);
    const c5 = plankRect(P1[12]!, origin);
    expect(c5.x).toBe(1000 + 7 * 72);
  });

  it('isBlackRect는 44×150만 검은 널로 본다', () => {
    expect(isBlackRect({ w: 44, h: 150 })).toBe(true);
    expect(isBlackRect({ w: 72, h: 240 })).toBe(false);
    expect(isBlackRect({ w: 44, h: 240 })).toBe(false);
  });

  it('plankTop은 널 윗면의 가운데다', () => {
    expect(plankTop({ slot: 1, x: 1000, y: 2000, w: 72, h: 240 })).toEqual({ x: 1036, y: 2000 });
    expect(plankTop({ slot: 2, x: 1050, y: 2000, w: 44, h: 150 })).toEqual({ x: 1072, y: 2000 });
  });

  it('세 다리의 자리는 변환표가 정한 널의 자리와 모두 같다: 첫 널의 자리만 알면 나머지가 정해진다', () => {
    for (const inst of BRIDGES) {
      expect(bridgeSlotProblems(inst, bridgeMap(inst)), inst.installationId).toEqual([]);
      const planks = planksOfInstallation(inst);
      expect(planks, inst.installationId).toHaveLength(inst.slots.length);
      for (const p of planks) expect(p.rect, `${inst.installationId} ${p.slot}`).toEqual(inst.slots.find((s) => s.slot === p.slot));
    }
    // 다리 하나는 첫 널의 자리 하나로 서 있다
    expect(K1.slots[0]).toEqual({ slot: 1, x: 1760, y: 5300, w: 72, h: 240 });
    expect(K2.slots[0]).toEqual({ slot: 1, x: 912, y: 5700, w: 72, h: 240 });
    expect(K3.slots[0]).toEqual({ slot: 1, x: 2912, y: 5800, w: 72, h: 240 });
  });

  it('planksOfInstallation은 건반 다리가 아니면 비어 있다', () => {
    expect(planksOfInstallation(N1)).toEqual([]);
    expect(planksOfInstallation(K4)).toEqual([]);
  });

  it('plankOfMidi는 소리 높이로 널을 찾는다. 다리에 없는 높이는 undefined다', () => {
    expect(plankOfMidi(P1, 60)!.slot).toBe(1);
    expect(plankOfMidi(P1, 66)!.name).toBe('F♯4');
    expect(plankOfMidi(P1, 84)!.name).toBe('C6');
    expect(plankOfMidi(P2, 84)).toBeUndefined();
    expect(plankOfMidi(P2, 59)).toBeUndefined();
  });
});

describe('널 자리의 검사(bridgeSlotProblems)', () => {
  const map1 = bridgeMap(K1);

  it('흰 건반이 아닌 곳에서 시작하거나 흰 널이 없으면 이유를 알린다', () => {
    expect(bridgeSlotProblems(K1, { lowMidi: 61, whiteCount: 15 })).toEqual(['가장 낮은 널(61)은 흰 건반이어야 하고 흰 널은 1장 이상이어요']);
    expect(bridgeSlotProblems(K1, { lowMidi: 60, whiteCount: 0 })).toHaveLength(1);
  });

  it('널의 수가 맞지 않거나 1번 널이 없으면 알린다', () => {
    const short = clone(K1);
    short.slots.pop();
    expect(bridgeSlotProblems(short, map1)).toEqual(['널은 25장이어야 해요(자리 24개)']);
    const noFirst = clone(K1);
    noFirst.slots[0]!.slot = 99;
    expect(bridgeSlotProblems(noFirst, map1)).toEqual(['1번 널이 없어요']);
  });

  it('널 하나가 정해진 자리에서 1 px라도 벗어나거나 크기가 다르면 그 널의 이름과 서야 할 자리를 알려 준다', () => {
    const off = clone(K1);
    off.slots[1]!.x += 1; // 2번 널(C♯4, 검은 널)
    expect(bridgeSlotProblems(off, map1)).toEqual(['2번 널(C♯4)은 검은 널이라 x 1810, y 5300, 가로 44, 세로 150에 서야 해요']);
    const lower = clone(K1);
    lower.slots[4]!.y += 4; // 5번 널(E4, 흰 널)
    expect(bridgeSlotProblems(lower, map1)).toEqual(['5번 널(E4)은 흰 널이라 x 1904, y 5300, 가로 72, 세로 240에 서야 해요']);
    const fat = clone(K1);
    fat.slots[2]!.w = 73;
    expect(bridgeSlotProblems(fat, map1)).toHaveLength(1);
  });

  it('여러 널이 틀려도 세 개까지만 알린다', () => {
    const bad = clone(K1);
    for (const s of bad.slots.slice(1)) s.w += 1;
    expect(bridgeSlotProblems(bad, map1)).toHaveLength(3);
  });

  it('다리 전체가 한꺼번에 옮겨져도 첫 널을 기준으로 하므로 문제가 없다(자리는 첫 널이 정한다)', () => {
    const moved = clone(K1);
    for (const s of moved.slots) {
      s.x += 640;
      s.y -= 96;
    }
    expect(bridgeSlotProblems(moved, map1)).toEqual([]);
  });
});

describe('카메라 틀과 월드 점(4.8)', () => {
  it('bridgeBounds는 널 전체에 위쪽 띠 168 px와 아래쪽 띠 40 px를 더한 사각형이다', () => {
    expect(bridgeBounds(K1)).toEqual({ x: 1760, y: 5132, w: 1080, h: 448 });
    expect(bridgeBounds(K2)).toEqual({ x: 912, y: 5532, w: 576, h: 448 });
    expect(bridgeBounds(K3)).toEqual({ x: 2912, y: 5632, w: 576, h: 448 });
    expect(bridgeBounds({ slots: [] })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    for (const inst of BRIDGES) expect(slotBounds(inst), inst.installationId).toEqual(bridgeBounds(inst));
    // 널 아래 끝에서 띠 40 px: 흰 널의 높이 240 + 위쪽 168 + 아래쪽 40
    for (const inst of BRIDGES) expect(bridgeBounds(inst).h).toBe(PLANK_WHITE_H + BRIDGE_BAND_TOP + BRIDGE_BAND_BOTTOM);
  });

  it('흰 널 한 장(72 px)이 화면에서 48 px 아래로 줄지 않는다: 여백 32 px, 배율 하한 2/3, 배율을 지키고 가로로 고른 널을 따라간다', () => {
    for (const inst of BRIDGES) expect(frameTuningOf(inst), inst.installationId).toEqual({ pad: BRIDGE_FRAME_PAD, minZoom: BRIDGE_MIN_ZOOM, strictMinZoom: true });
    expect(frameTuningOf(K4)).toEqual({}); // 반음 계단은 디딤돌 길의 틀을 쓴다
  });

  it('점은 널 번호로 바뀐다: 흰 널 가운데는 흰 널, 검은 널 윗부분은 검은 널이다', () => {
    // K1: 1번 흰 널 x 1760–1832, 2번 검은 널 x 1810–1854 y 5300–5450, 3번 흰 널 x 1832–1904
    expect(slotAtPoint(K1, 1780, 5400)).toBe(1);
    expect(slotAtPoint(K1, 1868, 5500)).toBe(3);
    expect(slotAtPoint(K1, 1832, 5400)).toBe(2); // 경계 위, 검은 널 안쪽: 작은 널이 먼저다
    expect(slotAtPoint(K1, 1832, 5500)).toBe(1); // 검은 널 아래쪽은 흰 널이다
  });

  it('누르기 여유가 있어도 널 안에 있는 점이 먼저다: 검은 널 곁(흰 널 안)을 누르면 흰 널이 눌린다. 어느 널도 아닌 곳은 null이다', () => {
    expect(slotAtPoint(K1, 1860, 5400, 10)).toBe(3);
    expect(slotAtPoint(K1, 1856, 5460, 10)).toBe(3);
    expect(slotAtPoint(K1, 1700, 5400)).toBeNull(); // 다리의 왼쪽 밖
    expect(slotAtPoint(K1, 1780, 5100)).toBeNull(); // 널 위의 띠(이름표 자리, 널이 아니다)
    expect(slotAtPoint(K1, 1780, 5600)).toBeNull(); // 널 아래
  });
});

describe('널의 이름(plankNames, plankLabelOf, plankSpeakOf)', () => {
  it('흰 널의 이름은 하나, 검은 널의 이름은 올림 이름과 내림 이름 둘이다', () => {
    expect(plankNames(P1[0]!)).toEqual(['C4']);
    expect(plankNames(P1[1]!)).toEqual(['C♯4', 'D♭4']);
    expect(P1.filter((p) => p.black).map((p) => plankNames(p).join('/'))).toEqual(['C♯4/D♭4', 'D♯4/E♭4', 'F♯4/G♭4', 'G♯4/A♭4', 'A♯4/B♭4', 'C♯5/D♭5', 'D♯5/E♭5', 'F♯5/G♭5', 'G♯5/A♭5', 'A♯5/B♭5']);
  });

  it('plankLabelOf는 한 줄로 쓴다: 흰 널은 이름, 검은 널은 올림이름/내림이름', () => {
    expect(plankLabelOf(P1[2]!)).toBe('D4');
    expect(plankLabelOf(P1[3]!)).toBe('D♯4/E♭4');
  });

  it('문제를 푸는 중에는 흰 널은 이름으로, 검은 널은 이웃한 흰 널로만 말한다(이름을 알려 주면 이름 붙이는 일이 사라진다)', () => {
    expect(plankSpeakOf(P1[0]!, false)).toBe('C4 널');
    expect(plankSpeakOf(P1[1]!, false)).toBe('C4와 D4 사이의 검은 널');
    expect(plankSpeakOf(P1[8]!, false)).toBe('G4와 A4 사이의 검은 널');
    expect(plankSpeakOf(P1[13]!, false)).toBe('C5와 D5 사이의 검은 널');
    // 문제를 푸는 중의 말에는 올림·내림 이름이 하나도 나오지 않는다
    for (const p of P1.filter((x) => x.black)) expect(plankSpeakOf(p, false), p.name).not.toMatch(/[♯♭]/);
  });

  it('자유로 놀 때는 검은 널의 두 이름을 모두 말한다', () => {
    expect(plankSpeakOf(P1[1]!, true)).toBe('검은 널 C♯4/D♭4');
    expect(plankSpeakOf(P1[0]!, true)).toBe('C4 널');
  });
});

describe('이름표(NAME_TAGS, tagPitchNear)', () => {
  it('이름표는 열 개: 검은 널 다섯 개의 이름 쌍이다(C♯ D♭ D♯ E♭ F♯ G♭ G♯ A♭ A♯ B♭)', () => {
    expect(NAME_TAGS.map((t) => t.text)).toEqual(['C♯', 'D♭', 'D♯', 'E♭', 'F♯', 'G♭', 'G♯', 'A♭', 'A♯', 'B♭']);
    expect(new Set(NAME_TAGS.map((t) => t.text)).size).toBe(10);
    for (const t of NAME_TAGS) expect(t.text).toBe(`${t.letter}${t.accidental === 'sharp' ? '♯' : '♭'}`);
  });

  it('이름표가 가리키는 음은 널의 소리 높이에 가장 가까운 같은 이름의 음이다', () => {
    expect(tagPitchNear({ letter: 'C', accidental: 'sharp' }, 61)).toEqual(W('C', 'sharp', 4));
    expect(tagPitchNear({ letter: 'D', accidental: 'flat' }, 61)).toEqual(W('D', 'flat', 4));
    expect(tagPitchNear({ letter: 'C', accidental: 'sharp' }, 73)).toEqual(W('C', 'sharp', 5));
    expect(tagPitchNear({ letter: 'B', accidental: 'flat' }, 70)).toEqual(W('B', 'flat', 4));
    expect(tagPitchNear({ letter: 'A', accidental: 'sharp' }, 82)).toEqual(W('A', 'sharp', 5));
  });
});

describe('이름 과제: 이름표 자리(Q27, 이름표 판본)', () => {
  it('bridgeTaskOf: 음자리표 없는 이름표 판본은 names, 음정은 interval, 방향이 sequence인 음 순서는 flags다. 그 밖의 판본은 null이다', () => {
    expect(bridgeTaskOf(Q27)).toBe('names');
    expect(bridgeTaskOf(NAME_TAGS_VARIANT)).toBe('names');
    expect(bridgeTaskOf(Q28)).toBe('interval');
    expect(bridgeTaskOf(Q29_BASIC)).toBe('interval');
    expect(bridgeTaskOf(Q29_CHALLENGE)).toBe('interval');
    expect(bridgeTaskOf(INTERVAL_NAMES_VARIANT)).toBe('interval');
    expect(bridgeTaskOf(Q30)).toBe('flags');
    expect(bridgeTaskOf(Q31_UP)).toBeNull(); // 방향이 ascending인 음 순서는 반음 계단(K4)의 일이다
    expect(bridgeTaskOf(CLEF_VARIANT)).toBeNull(); // 음자리표가 있는 음이름 판본은 계단밭의 일이다
  });

  it('Q27은 검은 널 다섯 개에 올려 부른 이름표와 내려 부른 이름표 자리가 둘씩, 모두 열 자리다. 자리 순서는 널의 높이 차례, 올림이 먼저다', () => {
    const spots = tagSpotsOf(Q27, P1)!;
    expect(spots).toHaveLength(10);
    expect(spots.map((s) => [s.draft, s.slotId, s.plank, s.midi, s.side])).toEqual([
      [0, 'k1-up', 2, 61, 'raised'],
      [1, 'k1-down', 2, 61, 'lowered'],
      [2, 'k2-up', 4, 63, 'raised'],
      [3, 'k2-down', 4, 63, 'lowered'],
      [4, 'k3-up', 7, 66, 'raised'],
      [5, 'k3-down', 7, 66, 'lowered'],
      [6, 'k4-up', 9, 68, 'raised'],
      [7, 'k4-down', 9, 68, 'lowered'],
      [8, 'k5-up', 11, 70, 'raised'],
      [9, 'k5-down', 11, 70, 'lowered'],
    ]);
    expect(spots[0]!.label).toBe('첫째 검은 널의 올려 부른 이름표');
    expect(spots[9]!.label).toBe('다섯째 검은 널의 내려 부른 이름표');
  });

  it('이름표 판본(name-tags)은 첫 검은 널(C♯4/D♭4)에 두 자리다', () => {
    expect(tagSpotsOf(NAME_TAGS_VARIANT, P1)!.map((s) => [s.draft, s.slotId, s.plank, s.side])).toEqual([
      [0, 'up', 2, 'raised'],
      [1, 'down', 2, 'lowered'],
    ]);
  });

  it('이름 과제가 아니거나 목표가 다리의 검은 널에 없으면 null이다', () => {
    expect(tagSpotsOf(Q28, P1)).toBeNull();
    expect(tagSpotsOf(Q30, P1)).toBeNull();
    const small = planksOf({ lowMidi: 60, whiteCount: 4 }); // C4 C♯4 D4 D♯4 E4 F4: F♯4가 없다
    expect(tagSpotsOf(Q27, small)).toBeNull();
    // 흰 널에 놓이는 목표(검은 널이 아니다)도 null이다
    const onWhite = clone(Q27);
    (onWhite.evaluatorSpec as unknown as { targets: Array<{ expected: SpelledPitch }> }).targets[0]!.expected = P('C', 0, 4);
    expect(tagSpotsOf(onWhite, P1)).toBeNull();
  });

  const spot = tagSpotsOf(Q27, P1)![0] as TagSpot; // 첫 올려 부른 자리: 검은 널 C♯4/D♭4, 칸 0

  it('이름표를 걸면 널의 소리 높이에 가장 가까운 음이 칸에 들어가고, 그 소리를 들려 준다. 같은 이름이 걸려 있으면 편집이 없다', () => {
    const r = tagHangResult(content(), spot, NAME_TAGS[0]!); // C♯
    expect(r).toEqual({ ok: true, edit: { type: 'setSlot', slot: 0, writtenPitch: W('C', 'sharp', 4) }, text: '첫째 검은 널의 올려 부른 이름표에 C♯ 이름표를 걸었어요.', midi: 61 });
    const again = tagHangResult(content([{ slot: 0, writtenPitch: W('C', 'sharp', 4) }]), spot, NAME_TAGS[0]!);
    expect(again.edit).toBeNull();
    expect(again.text).toBe('첫째 검은 널의 올려 부른 이름표: 이미 C♯ 이름표가 걸려 있어요.');
    expect(again.midi).toBe(61);
  });

  it('다른 이름표가 걸려 있으면 바꿔 건다. 내려 부른 이름(D♭)도 같은 소리(61)를 들려 준다', () => {
    const r = tagHangResult(content([{ slot: 0, writtenPitch: W('C', 'sharp', 4) }]), spot, NAME_TAGS[1]!); // D♭
    expect(r.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: W('D', 'flat', 4) });
    expect(r.text).toBe('첫째 검은 널의 올려 부른 이름표에 D♭ 이름표를 바꿔 걸었어요.');
    expect(r.midi).toBe(61);
  });

  it('엉뚱한 이름표(F♯)를 걸어도 걸리고 그 이름표의 소리(66)가 울린다: 널의 소리(61)와 귀로 비교할 수 있다. 판정은 나중에 한다', () => {
    const r = tagHangResult(content(), spot, NAME_TAGS[4]!);
    expect(r.ok).toBe(true);
    expect(r.edit).toEqual({ type: 'setSlot', slot: 0, writtenPitch: W('F', 'sharp', 4) });
    expect(r.midi).toBe(66);
  });

  it('이름표를 떼면 칸이 비고, 이미 비어 있으면 편집이 없다', () => {
    const had = tagClearResult(content([{ slot: 0, writtenPitch: W('C', 'sharp', 4) }]), spot);
    expect(had).toEqual({ ok: true, edit: { type: 'setSlot', slot: 0, writtenPitch: null }, text: '첫째 검은 널의 올려 부른 이름표의 이름표를 뗐어요.', midi: null });
    const empty = tagClearResult(content(), spot);
    expect(empty.edit).toBeNull();
    expect(empty.text).toBe('첫째 검은 널의 올려 부른 이름표: 이미 비어 있어요.');
  });

  it('걸린 이름표의 글자: 올림은 ♯, 내림은 ♭, 비었으면 null', () => {
    expect(hungTagText(content([{ slot: 0, writtenPitch: W('C', 'sharp', 4) }]), 0)).toBe('C♯');
    expect(hungTagText(content([{ slot: 1, writtenPitch: W('D', 'flat', 4) }]), 1)).toBe('D♭');
    expect(hungTagText(content([{ slot: 2, writtenPitch: W('E', null, 4) }]), 2)).toBe('E');
    expect(hungTagText(content([{ slot: 0, writtenPitch: null }]), 0)).toBeNull();
    expect(hungTagText(content(), 0)).toBeNull();
  });
});

describe('음정 과제: 질문과 밧줄(Q28, Q29, 같은 소리 다른 이름)', () => {
  it('Q28은 이름 묻기 네 개다: 널 번호 5→6(E4→F4), 12→13(B4→C5), 1→3(C4→D4), 6→8(F4→G4). 칸은 질문마다 하나다', () => {
    const qs = bridgeQuestionsOf(Q28, P1)!;
    expect(qs.map((q) => [q.qid, q.kind, q.startPlank, q.fixedEndPlank, q.parts.map((p) => p.slot)])).toEqual([
      ['h1', 'identify', 5, 6, [0]],
      ['h2', 'identify', 12, 13, [1]],
      ['h3', 'identify', 1, 3, [2]],
      ['h4', 'identify', 6, 8, [3]],
    ]);
    expect(qs.map((q) => q.label)).toEqual(['E4에서 F4까지', 'B4에서 C5까지', 'C4에서 D4까지', 'F4에서 G4까지']);
  });

  it('Q29는 음 쌓기다: 시작 말뚝만 널에 박혀 있고 끝 말뚝은 사용자가 꽂는다(널 번호가 아직 없다)', () => {
    expect(bridgeQuestionsOf(Q29_BASIC, P2)!.map((q) => [q.qid, q.kind, q.label, q.startPlank, q.fixedEndPlank])).toEqual([
      ['b1', 'build', 'D4 위 장3도', 3, null],
      ['b2', 'build', 'E4 위 완전5도', 5, null],
    ]);
    expect(bridgeQuestionsOf(Q29_CHALLENGE, P2)!.map((q) => [q.qid, q.label, q.startPlank, q.fixedEndPlank])).toEqual([
      ['b1', 'F4 위 완전4도', 6, null],
      ['b2', 'E4 위 장3도', 5, null],
    ]);
  });

  it('같은 소리 다른 이름의 음정 판본은 비교(소리와 표기, 칸 둘)와 이름 묻기 둘이다: 비교는 시작과 끝이 같은 널(2번)이다', () => {
    const qs = bridgeQuestionsOf(INTERVAL_NAMES_VARIANT, P2)!;
    expect(qs.map((q) => [q.qid, q.kind, q.startPlank, q.fixedEndPlank, q.parts.length])).toEqual([
      ['c1', 'compare', 2, 2, 2],
      ['i1', 'identify', 1, 4, 1],
      ['i2', 'identify', 1, 4, 1],
    ]);
    expect(qs[0]!.parts.map((p) => p.part)).toEqual(['sound', 'notation']);
  });

  it('음정 과제가 아니거나 음이 다리에 없으면 null이다', () => {
    expect(bridgeQuestionsOf(Q27, P1)).toBeNull();
    expect(bridgeQuestionsOf(Q30, P1)).toBeNull();
    expect(bridgeQuestionsOf(Q28, P2)).not.toBeNull();
    expect(bridgeQuestionsOf(Q28, planksOf({ lowMidi: 60, whiteCount: 4 }))).toBeNull(); // B4가 없다
  });

  it('밧줄은 지나간 도수(두 이름의 글자 사이, 양 끝 포함)와 반음 수(널 수의 차이)를 함께 보여 준다', () => {
    expect(ropeReadout(P('C', 0, 4), P('E', 0, 4), 64)).toEqual({ degree: 3, semitones: 4 });
    expect(ropeReadout(P('E', 0, 4), P('F', 0, 4), 65)).toEqual({ degree: 2, semitones: 1 });
    expect(ropeReadout(P('C', 0, 4), P('C', 0, 5), 72)).toEqual({ degree: 8, semitones: 12 });
    // 같은 널(63)이라도 이름에 따라 도수가 다르다: D♯4는 2도, E♭4는 3도
    expect(ropeReadout(P('C', 0, 4), P('D', 1, 4), 63)).toEqual({ degree: 2, semitones: 3 });
    expect(ropeReadout(P('C', 0, 4), P('E', -1, 4), 63)).toEqual({ degree: 3, semitones: 3 });
    // 아래로 뻗은 밧줄도 같다
    expect(ropeReadout(P('E', 0, 4), P('C', 0, 4), 60)).toEqual({ degree: 3, semitones: 4 });
    // 위쪽 이름이 정해지지 않았으면 도수가 없다
    expect(ropeReadout(P('C', 0, 4), null, 64)).toEqual({ degree: null, semitones: 4 });
  });

  it('밧줄의 글: 도수가 있으면 "3도 · 반음 4개", 없으면 "반음 4개"', () => {
    expect(ropeText({ degree: 3, semitones: 4 })).toBe('3도 · 반음 4개');
    expect(ropeText({ degree: null, semitones: 4 })).toBe('반음 4개');
  });

  it('끝 말뚝을 처음 꽂을 때의 이름: 흰 널은 자기 이름, 검은 널은 올림 이름이다', () => {
    expect(stakeWrittenAt({ midi: 60 })).toEqual(W('C', null, 4));
    expect(stakeWrittenAt({ midi: 61 })).toEqual(W('C', 'sharp', 4));
    expect(stakeWrittenAt({ midi: 66 })).toEqual(W('F', 'sharp', 4));
    expect(stakeWrittenAt({ midi: 72 })).toEqual(W('C', null, 5));
  });

  it('namesForMidi: 한 널을 가리키는 이름들(올림·내림·제자리, 겹임시표 없음)이다. 검은 널은 둘, 흰 널은 자기 이름과 이웃 이름(B♯, F♭ 따위) 둘이다', () => {
    const asText = (midi: number): string[] => namesForMidi(midi).map(stakeNameOf).sort();
    expect(asText(61)).toEqual(['C♯4', 'D♭4']);
    expect(asText(63)).toEqual(['D♯4', 'E♭4']);
    expect(asText(60)).toEqual(['B♯3', 'C4']);
    expect(asText(64)).toEqual(['E4', 'F♭4']);
    expect(asText(65)).toEqual(['E♯4', 'F4']);
    // 겹임시표(C𝄫, B𝄪)는 이름에 없다
    for (let m = 60; m <= 84; m++) for (const w of namesForMidi(m)) expect(['sharp', 'flat', null]).toContain(w.accidental);
  });

  it('stakeNameOf: 글자, 변화, 옥타브를 붙여 쓴다', () => {
    expect(stakeNameOf(W('C', 'sharp', 4))).toBe('C♯4');
    expect(stakeNameOf(W('B', 'flat', 3))).toBe('B♭3');
    expect(stakeNameOf(W('E', null, 5))).toBe('E5');
  });
});

describe('임시표 과제: 순서 깃발(Q30)', () => {
  const targets = flagTargetsOf(Q30);

  it('완료 기준(12.10): 깃발의 목표 소리는 순서대로 66, 65, 65, 66이다(G장조의 F♯, 제자리표 붙은 F, 이어지는 F, 다시 조표를 따르는 F♯)', () => {
    expect(targets).toEqual([66, 65, 65, 66]);
    expect(flagCountOf(Q30)).toBe(4);
  });

  it('깃발은 4개이고 번호는 칸 번호와 같은 1부터다. 아직 꽂지 않았으면 널이 없다', () => {
    expect(flagSpotsOf(Q30, content(), P3)).toEqual([
      { draft: 1, order: 1, plank: null },
      { draft: 2, order: 2, plank: null },
      { draft: 3, order: 3, plank: null },
      { draft: 4, order: 4, plank: null },
    ]);
  });

  it('칸에 담긴 소리 높이(midi)가 깃발이 꽂힌 널이다: 66은 7번 널(F♯4), 65는 6번 널(F4)이다. 다리에 없는 높이는 꽂히지 않은 것이다', () => {
    const c = content([
      { slot: 1, writtenPitch: null, midi: 66 },
      { slot: 2, writtenPitch: null, midi: 65 },
      { slot: 3, writtenPitch: null, midi: 99 },
    ]);
    expect(flagSpotsOf(Q30, c, P3)!.map((f) => f.plank)).toEqual([7, 6, null, null]);
  });

  it('깃발 과제가 아니면 null이다', () => {
    expect(flagSpotsOf(Q28, content(), P1)).toBeNull();
    expect(flagSpotsOf(Q31_UP, content(), P1)).toBeNull();
    expect(flagCountOf(Q28)).toBe(0);
    expect(flagTargetsOf(Q28)).toEqual([]);
  });

  it('깃발을 꽂으면 깃발은 이름이 아니라 소리 높이만 가진다(writtenPitch가 null, midi만 있다). 그 소리를 들려 준다', () => {
    const f7 = P3[6]!; // F♯4
    const r = flagPlantResult(content(), { draft: 1, order: 1, plank: null }, f7);
    expect(r).toEqual({ ok: true, edit: { type: 'setSlot', slot: 1, writtenPitch: null, midi: 66 }, text: '1번 깃발을 F4와 G4 사이의 검은 널에 꽂았어요.', midi: 66 });
  });

  it('이미 꽂힌 깃발을 다른 널에 꽂으면 옮겨 꽂는다. 같은 널이면 편집이 없다', () => {
    const c = content([{ slot: 1, writtenPitch: null, midi: 66 }]);
    const moved = flagPlantResult(c, { draft: 1, order: 1, plank: 7 }, P3[5]!); // F4
    expect(moved.edit).toEqual({ type: 'setSlot', slot: 1, writtenPitch: null, midi: 65 });
    expect(moved.text).toBe('1번 깃발을 F4 널에 옮겨 꽂았어요.');
    const same = flagPlantResult(c, { draft: 1, order: 1, plank: 7 }, P3[6]!);
    expect(same.edit).toBeNull();
    expect(same.text).toBe('1번 깃발은 이미 F4와 G4 사이의 검은 널에 있어요.');
    expect(same.midi).toBe(66);
  });

  it('깃발 안내는 어느 널에서도 검은 널의 이름(♯, ♭)을 말하지 않는다: 흰 널은 이름으로, 검은 널은 이웃한 흰 널로 말한다', () => {
    // 이 과제는 '어떤 소리가 나는가'를 묻는다. 월드는 문제를 푸는 중 검은 널의 이름을 그리지 않으므로 낭독만 이름을 알려 주면 안 된다
    for (const p of P3) {
      const fresh = flagPlantResult(content(), { draft: 1, order: 1, plank: null }, p).text;
      const moved = flagPlantResult(content([{ slot: 1, writtenPitch: null, midi: 60 }]), { draft: 1, order: 1, plank: 1 }, p).text;
      const same = flagPlantResult(content([{ slot: 1, writtenPitch: null, midi: p.midi }]), { draft: 1, order: 1, plank: p.slot }, p).text;
      for (const t of [fresh, moved, same]) expect(t, `${p.slot}번 널`).not.toMatch(/[♯♭]/);
      expect(fresh).toBe(`1번 깃발을 ${plankSpeakOf(p, false)}에 꽂았어요.`);
    }
    expect(flagPlantResult(content(), { draft: 3, order: 3, plank: null }, P3[3]!).text).toBe('3번 깃발을 D4와 E4 사이의 검은 널에 꽂았어요.');
    expect(flagPlantResult(content(), { draft: 3, order: 3, plank: null }, P3[4]!).text).toBe('3번 깃발을 E4 널에 꽂았어요.');
  });

  it('깃발을 빼면 칸이 비고, 꽂지 않은 깃발이면 편집이 없다', () => {
    const c = content([{ slot: 2, writtenPitch: null, midi: 65 }]);
    expect(flagClearResult(c, { draft: 2, order: 2, plank: 6 })).toEqual({ ok: true, edit: { type: 'setSlot', slot: 2, writtenPitch: null }, text: '2번 깃발을 뺐어요.', midi: null });
    const none = flagClearResult(c, { draft: 1, order: 1, plank: null });
    expect(none.edit).toBeNull();
    expect(none.text).toBe('1번 깃발은 아직 꽂지 않았어요.');
  });

  it('표지판 악보(그림으로만 그린다): 조표 ♯ 하나, 두 마디다. 첫 마디는 F, 제자리표 붙은 F, 이어지는 F(2박), 둘째 마디는 F 온음표다', () => {
    const sign = bridgeSignOf(Q30)!;
    expect(sign.keySignature).toBe(1);
    expect(sign.bars).toHaveLength(2);
    // 오선 위치: 높은음자리표의 맨 아랫줄 E4가 0이고 F4는 1이다
    expect(sign.bars[0]).toEqual([
      { position: 1, accidental: null, beats: 1, rest: false },
      { position: 1, accidental: 'natural', beats: 1, rest: false },
      { position: 1, accidental: null, beats: 2, rest: false },
    ]);
    expect(sign.bars[1]).toEqual([{ position: 1, accidental: null, beats: 4, rest: false }]);
  });

  it('표지판 악보는 깃발 과제에만 있다', () => {
    expect(bridgeSignOf(Q28)).toBeNull();
    expect(bridgeSignOf(Q27)).toBeNull();
    expect(bridgeSignOf(Q31_UP)).toBeNull();
  });
});

describe('월드가 그리는 자리(순수 계산)', () => {
  // K2의 2번 널(C♯4, 검은 널)과 3번 널(D4, 흰 널)
  const black = K2.slots[1]!;
  const white = K2.slots[2]!;
  const frame = bridgeBounds(K2);

  it('이름표 상자는 60×30이다. 올려 부른 이름(♯)은 널 윗면에서 30 px, 내려 부른 이름(♭)은 68 px 위가 가운데다', () => {
    expect([TAG_BOX_W, TAG_BOX_H, TAG_ROW_DY.raised, TAG_ROW_DY.lowered]).toEqual([60, 30, 30, 68]);
    // 2번 널: x 962–1006(가운데 984), 윗면 y 5700
    expect(tagBoxOf(black, 'raised')).toEqual({ x: 954, y: 5655, w: 60, h: 30 });
    expect(tagBoxOf(black, 'lowered')).toEqual({ x: 954, y: 5617, w: 60, h: 30 });
  });

  it('이름표 상자는 널 윗면 위 띠 안에 서고 서로 겹치지 않는다: 이웃한 검은 널(가운데 간격 72 px 이상)의 상자와도 두 줄끼리도', () => {
    for (const inst of [K1, K2]) {
      const f = bridgeBounds(inst);
      const boxes: Array<{ id: string; box: BridgeBox }> = [];
      for (const p of planksOfInstallation(inst).filter((x) => x.black)) {
        for (const side of ['raised', 'lowered'] as const) boxes.push({ id: `${inst.stationCode} ${p.name} ${side}`, box: tagBoxOf(p.rect, side) });
      }
      expect(boxes.length).toBe(inst === K1 ? 20 : 10);
      for (const { id, box } of boxes) {
        expect(inside(box, f), id).toBe(true);
        expect(box.y + box.h <= inst.slots[0]!.y, `${id}: 널 윗면보다 아래로 내려오지 않는다`).toBe(true);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!.box, boxes[j]!.box), `${boxes[i]!.id} / ${boxes[j]!.id}`).toBe(false);
    }
  });

  it('말뚝 끝은 널 윗면 가운데에서 44 px 위, 깃발 기둥은 널 윗면에서 52 px 위로 선다', () => {
    expect([STAKE_H, FLAG_POLE_H, FLAG_CLOTH_W, FLAG_CLOTH_H, FLAG_SLOT_W, FLAG_RACK_DY]).toEqual([44, 52, 30, 22, 44, 84]);
    expect(stakeTopOf(black)).toEqual({ x: 984, y: 5656 });
    // 3번 널(D4)은 x 984–1056, 가운데 1020
    expect(flagPoleOf(white)).toEqual({ base: { x: 1020, y: 5700 }, top: { x: 1020, y: 5648 } });
    // 말뚝과 기둥의 끝은 모두 위쪽 띠 안이다
    for (const s of K2.slots) {
      expect(stakeTopOf(s).y).toBeGreaterThanOrEqual(frame.y);
      expect(flagPoleOf(s).top.y).toBeGreaterThanOrEqual(frame.y);
    }
  });

  it('같은 널에 깃발이 여럿이면 번호가 작은 것부터 아래로 26 px씩 내려 선다: 위아래 천이 겹치지 않고, 여섯째 줄부터는 같은 줄이다', () => {
    expect([FLAG_STACK_DY, FLAG_STACK_MAX]).toEqual([26, 5]);
    // 3번 널(D4)의 첫 깃발은 널 윗면(5700)에 서고, 둘째는 26 px, 셋째는 52 px 아래에 선다
    expect([0, 1, 2].map((k) => flagPoleOf(white, k).base)).toEqual([
      { x: 1020, y: 5700 },
      { x: 1020, y: 5726 },
      { x: 1020, y: 5752 },
    ]);
    expect(flagPoleOf(white, 2).top).toEqual({ x: 1020, y: 5700 });
    // 천은 기둥 끝에서 오른쪽으로 30 × 22: 줄 간격(26)이 천 높이(22)보다 커서 위아래 천이 겹치지 않는다
    for (let k = 0; k < FLAG_STACK_MAX; k++) {
      const gap = flagPoleOf(white, k + 1).top.y - flagPoleOf(white, k).top.y;
      expect(gap, `${k}번째와 ${k + 1}번째`).toBe(26);
      expect(gap).toBeGreaterThan(FLAG_CLOTH_H);
    }
    // 위 천의 아래 끝과 아래 기둥의 끝도 겹치지 않는다(기둥이 위 깃발의 천을 가로지르지 않는다)
    for (let k = 0; k < FLAG_STACK_MAX; k++) expect(flagPoleOf(white, k + 1).top.y).toBeGreaterThan(flagPoleOf(white, k).top.y + FLAG_CLOTH_H);
    // 여섯째 줄부터는 같은 줄이고, 가장 아래 깃발의 기둥 아래도 검은 널(150 px) 안이다. 음수는 첫 줄이다
    expect(flagPoleOf(white, 9).base.y).toBe(flagPoleOf(white, FLAG_STACK_MAX).base.y);
    expect(flagPoleOf(black, FLAG_STACK_MAX).base.y - black.y).toBeLessThan(PLANK_BLACK_H);
    expect(flagPoleOf(white, -1)).toEqual(flagPoleOf(white));
    // 같은 널의 첫 깃발은 지금까지와 같은 자리다
    expect(flagPoleOf(white, 0)).toEqual(flagPoleOf(white));
  });

  it('flagStackOf: 같은 널의 깃발 가운데 번호가 작은 차례다. 꽂히지 않은 깃발과 다른 널의 깃발은 세지 않는다', () => {
    // Q30의 정답 모양: 1번과 4번이 7번 널(F♯4), 2번과 3번이 6번 널(F4)
    const answer = [
      { order: 1, plank: 7 },
      { order: 2, plank: 6 },
      { order: 3, plank: 6 },
      { order: 4, plank: 7 },
    ];
    expect(answer.map((f) => flagStackOf(answer, f))).toEqual([0, 0, 1, 1]);
    // 목록의 차례가 뒤섞여도 번호가 작은 차례다
    const shuffled = [...answer].reverse();
    expect(shuffled.map((f) => flagStackOf(shuffled, f))).toEqual([1, 1, 0, 0]);
    // 걸이에 서 있는(꽂히지 않은) 깃발은 0이고 다른 깃발의 차례에 들어가지 않는다
    const racked = [
      { order: 1, plank: null },
      { order: 2, plank: 6 },
      { order: 3, plank: null },
      { order: 4, plank: 6 },
    ];
    expect(racked.map((f) => flagStackOf(racked, f))).toEqual([0, 0, 0, 1]);
    // 한 널에 몰리면 0, 1, 2, 3으로 내려온다
    const pile = [1, 2, 3, 4].map((order) => ({ order, plank: 3 }));
    expect(pile.map((f) => flagStackOf(pile, f))).toEqual([0, 1, 2, 3]);
  });

  it('깃발 걸이는 틀의 오른쪽 끝에서 왼쪽으로 44 px씩 나란히 선다: 마지막 깃발이 가장 오른쪽이다', () => {
    const spots = [1, 2, 3, 4].map((order) => flagRackSpotOf(frame, 4, order));
    expect(spots).toEqual([
      { x: 1334, y: 5616 },
      { x: 1378, y: 5616 },
      { x: 1422, y: 5616 },
      { x: 1466, y: 5616 },
    ]);
    // 걸이의 가장 오른쪽 깃발이 틀 안에 있다
    expect(spots[3]!.x + FLAG_SLOT_W / 2).toBe(frame.x + frame.w);
    // 자유로 놀 때의 여덟 깃발도 틀 안에 모두 선다(K3의 폭 576 px)
    const free = Array.from({ length: FREE_BRIDGE_FLAGS }, (_, i) => flagRackSpotOf(bridgeBounds(K3), FREE_BRIDGE_FLAGS, i + 1));
    expect(free[0]!.x - FLAG_SLOT_W / 2).toBeGreaterThanOrEqual(bridgeBounds(K3).x);
    expect(new Set(free.map((s) => s.y)).size).toBe(1);
  });

  it('표지판 악보판은 걸이를 뺀 왼쪽 윗부분이다: 걸이와 가로로 겹치지 않고, 깃발 기둥 끝(널 윗면 위 52 px)보다 위에 있다', () => {
    expect([SIGN_BOARD_H, SIGN_BOARD_GAP]).toEqual([92, 70]);
    const board = signBoardOf(frame, 4);
    expect(board).toEqual({ x: 916, y: 5538, w: 372, h: 92 });
    expect(inside(board, frame)).toBe(true);
    const rackLeft = flagRackSpotOf(frame, 4, 1).x - FLAG_SLOT_W / 2;
    expect(board.x + board.w).toBeLessThan(rackLeft);
    // 널 윗면(5700)에서 70 px 위가 악보판의 아래 끝이다: 깃발 기둥 끝(5648)보다 위다
    expect(board.y + board.h).toBe(black.y - SIGN_BOARD_GAP);
    expect(board.y + board.h).toBeLessThan(flagPoleOf(white).top.y);
    // K3의 실제 틀에서도 같다
    const k3 = bridgeBounds(K3);
    const k3board = signBoardOf(k3, flagCountOf(Q30));
    expect(inside(k3board, k3)).toBe(true);
    expect(k3board.x + k3board.w).toBeLessThan(flagRackSpotOf(k3, 4, 1).x - FLAG_SLOT_W / 2);
  });
});

describe('판본과 다리의 짝 검사(bridgeVariantProblems)', () => {
  it('설치물이 싣는 판본은 모두 그 다리에서 풀린다: K1 이름표·Q27·Q28, K2 같은 소리 다른 이름(음정)·Q29, K3 Q30', () => {
    for (const [inst, list] of [
      [K1, [NAME_TAGS_VARIANT, Q27, Q28]],
      [K2, [INTERVAL_NAMES_VARIANT, Q29_BASIC, Q29_CHALLENGE]],
      [K3, [Q30]],
    ] as const) {
      for (const v of list) {
        expect(bridgeVariantProblems(inst, v), `${inst.stationCode}`).toEqual([]);
        expect(bridgeVariantProblems(inst, v, true), `${inst.stationCode} 자유`).toEqual([]);
      }
    }
  });

  it('건반 다리가 아니면 알린다', () => {
    expect(bridgeVariantProblems(N1, Q27)).toEqual(['건반 다리가 아니에요']);
  });

  it('다리가 풀 수 없는 판정기(방향이 ascending인 음 순서, 음자리표가 있는 음이름)는 이유를 알린다', () => {
    expect(bridgeVariantProblems(K1, Q31_UP)).toEqual(['판정기가 orderedScale인데 건반 다리는 음자리표 없는 이름표 판본(pitchSpelling), 음정(interval), 방향이 sequence인 음 순서(orderedScale)만 이어요']);
    expect(bridgeVariantProblems(K1, CLEF_VARIANT)).toHaveLength(1);
  });

  it('다리의 널에 없는 소리가 목표이면 알린다(작은 다리 C4–F4)', () => {
    const small = { slots: K1.slots, slotMap: { kind: 'keyBridge' as const, lowMidi: 60, whiteCount: 4 } };
    expect(bridgeVariantProblems(small, Q27)).toEqual(['이름표 목표의 소리 높이가 다리의 검은 널에 없어요']);
    expect(bridgeVariantProblems(small, Q28)).toEqual(['음정 질문의 음이 다리의 널에 없어요']);
    expect(bridgeVariantProblems(small, Q30)).toEqual(['목표 소리 높이가 다리의 널에 없어요']);
    // 자유로 놀기의 틀은 정답(목표)이 없어서 목표의 소리 높이를 보지 않는다
    expect(bridgeVariantProblems(small, Q30, true)).toEqual([]);
  });

  it('이름표 자리가 12개를 넘으면 알린다', () => {
    const many = clone(Q27);
    const spec = many.evaluatorSpec as unknown as { targets: Array<{ slotId: string; label: string; expected: SpelledPitch }> };
    for (let i = 0; i < 3; i++) spec.targets.push({ slotId: `x${i}`, label: `덧 이름표 ${i}`, expected: P('C', 1, 4) });
    expect(bridgeVariantProblems(K1, many)).toEqual(['이름표 자리는 12개까지예요(지금 13개)']);
  });

  it('깃발은 소리 높이만 가져서 requireSpelling이 true이면 알린다', () => {
    const spelling = clone(Q30);
    (spelling.evaluatorSpec as unknown as { requireSpelling: boolean }).requireSpelling = true;
    expect(bridgeVariantProblems(K3, spelling)).toEqual(['깃발은 소리 높이만 가져서 requireSpelling이 false여야 해요']);
  });

  it('깃발은 2–8개다: 하나도, 아홉 개도 안 된다. 자유로 놀기의 틀은 칸 수(count)를 센다', () => {
    const one = clone(Q30);
    (one.evaluatorSpec as unknown as { count: number }).count = 1;
    expect(bridgeVariantProblems(K3, one, true)).toEqual(['깃발은 2–8개예요(지금 1개)']);
    const nine = clone(Q30);
    (nine.evaluatorSpec as unknown as { count: number }).count = 9;
    expect(bridgeVariantProblems(K3, nine, true)).toEqual(['깃발은 2–8개예요(지금 9개)']);
    // 목표를 세는 쪽: 악보의 음이 하나뿐이면 알린다
    const lonely = clone(Q30);
    lonely.score.events = lonely.score.events.slice(0, 1);
    expect(bridgeVariantProblems(K3, lonely)).toEqual(['깃발은 2–8개예요(지금 1개)']);
  });
});

describe('자유로 놀기의 틀(freeBridgeFrameOf)', () => {
  const lookup = (questId: string, variantId: string): QuestVariant | undefined => questFile(questId).variants[variantId];

  it('K1(이름표)은 검은 널마다 자리 하나, 열 개다: 모두 올림 이름이고 이름표는 열 개 가운데 아무거나 건다', () => {
    const frame = freeBridgeFrameOf(K1, lookup)!;
    expect(frame.challengeDescriptor.range).toBe('C4-C6');
    expect(frame.evaluatorSpec.type).toBe('pitchSpelling');
    const targets = (frame.evaluatorSpec as unknown as { targets: Array<{ slotId: string; label: string; expected: SpelledPitch }> }).targets;
    expect(targets.map((t) => t.slotId)).toEqual(['tag-2', 'tag-4', 'tag-7', 'tag-9', 'tag-11', 'tag-14', 'tag-16', 'tag-19', 'tag-21', 'tag-23']);
    expect(targets.map((t) => `${t.expected.letter}${t.expected.alter === 1 ? '♯' : ''}${t.expected.octave}`)).toEqual(['C♯4', 'D♯4', 'F♯4', 'G♯4', 'A♯4', 'C♯5', 'D♯5', 'F♯5', 'G♯5', 'A♯5']);
    expect(targets[0]!.label).toBe('첫째 검은 널의 이름표');
    expect(targets[9]!.label).toBe('열째 검은 널의 이름표');
    expect(frame.score.events).toEqual([]);
    expect(bridgeVariantProblems(K1, frame, true)).toEqual([]);
    expect(tagSpotsOf(frame, P1)).toHaveLength(10);
  });

  it('K2(밧줄)는 가장 높은 흰 널을 뺀 흰 널마다 시작 말뚝이 박힌 밧줄 하나다: 일곱 개, 끝 말뚝은 아무 널에나 꽂는다(음 쌓기)', () => {
    const frame = freeBridgeFrameOf(K2, lookup)!;
    expect(frame.challengeDescriptor.range).toBe('C4-C5');
    expect(frame.evaluatorSpec.type).toBe('interval');
    const qs = (frame.evaluatorSpec as unknown as { questions: Array<{ qid: string; label: string; kind: string; from: SpelledPitch }> }).questions;
    expect(qs.map((q) => [q.qid, q.label, q.kind, `${q.from.letter}${q.from.octave}`])).toEqual([
      ['rope-1', 'C4에서 뻗는 밧줄', 'build', 'C4'],
      ['rope-2', 'D4에서 뻗는 밧줄', 'build', 'D4'],
      ['rope-3', 'E4에서 뻗는 밧줄', 'build', 'E4'],
      ['rope-4', 'F4에서 뻗는 밧줄', 'build', 'F4'],
      ['rope-5', 'G4에서 뻗는 밧줄', 'build', 'G4'],
      ['rope-6', 'A4에서 뻗는 밧줄', 'build', 'A4'],
      ['rope-7', 'B4에서 뻗는 밧줄', 'build', 'B4'],
    ]);
    expect(bridgeVariantProblems(K2, frame, true)).toEqual([]);
    expect(bridgeQuestionsOf(frame, P2)!.map((q) => q.startPlank)).toEqual([1, 3, 5, 6, 8, 10, 12]);
  });

  it('K3(깃발)는 순서 깃발 여덟 개다. 이름이 아니라 소리 높이만 갖는다', () => {
    const frame = freeBridgeFrameOf(K3, lookup)!;
    expect(frame.evaluatorSpec).toEqual({ type: 'orderedScale', voiceId: 'v1', count: 8, direction: 'sequence', requireSpelling: false, requireOctave: true, slotLabel: '깃발' });
    expect(FREE_BRIDGE_FLAGS).toBe(8);
    expect(frame.score.events).toEqual([]);
    expect(bridgeVariantProblems(K3, frame, true)).toEqual([]);
    expect(flagCountOf(frame)).toBe(8);
  });

  it('틀로 삼는 것은 설치물이 싣는 판본 가운데 다리에서 풀 수 있는 첫 판본이다: 풀 수 없는 판본(반음계)은 건너뛴다', () => {
    const skip = { ...clone(K1), quests: [{ questId: 'scale.chromatic', variantIds: ['ascending'] }, { questId: 'key.whole-and-half-steps', variantIds: ['whole-and-half'] }] };
    expect(freeBridgeFrameOf(skip, lookup)!.evaluatorSpec.type).toBe('interval');
  });

  it('건반 다리가 아니거나 풀 수 있는 판본이 하나도 없으면 null이다', () => {
    expect(freeBridgeFrameOf(N1, lookup)).toBeNull();
    expect(freeBridgeFrameOf(K4, lookup)).toBeNull();
    const none = { ...clone(K1), quests: [{ questId: 'scale.chromatic', variantIds: ['ascending'] }] };
    expect(freeBridgeFrameOf(none, lookup)).toBeNull();
    expect(freeBridgeFrameOf(K1, () => undefined)).toBeNull();
  });
});

describe('세 다리의 정의와 설치물 검사', () => {
  it('정거장 K1–K3, 건반 늪, 건반 다리 원형이다. 쌍둥이 패널은 K1·K2가 panel.clef, K3가 panel.scale이다. K4는 디딤돌 길(T1)이다', () => {
    expect([K1, K2, K3, K4].map((i) => [i.stationCode, i.regionId, i.archetype, i.name, i.panelTwin])).toEqual([
      ['K1', 'key-marsh', 'keyBridge', '건반 다리', 'panel.clef'],
      ['K2', 'key-marsh', 'keyBridge', '음정 밧줄', 'panel.clef'],
      ['K3', 'key-marsh', 'keyBridge', '제자리표 다리', 'panel.scale'],
      ['K4', 'key-marsh', 'steppingPath', '반음 계단', 'panel.scale'],
    ]);
    for (const i of BRIDGES) expect(ARCHETYPE_CODES[i.archetype]).toBe('T6');
    expect(ARCHETYPE_CODES[K4.archetype]).toBe('T1');
  });

  it('상호작용 점은 정거장 점 그대로이고 서명 소리 id가 있다(소리는 7-4)', () => {
    for (const i of [K1, K2, K3, K4]) {
      const st = map.station(i.stationCode)!;
      expect(i.interactPoint, i.installationId).toEqual({ x: st.x, y: st.y });
      expect(i.signatureSoundId).toBe(`sig.key-marsh.${i.installationId.split('.')[2]}`);
    }
    expect(BRIDGES.map((i) => i.interactPoint)).toEqual([
      { x: 2300, y: 5100 },
      { x: 1200, y: 5500 },
      { x: 3200, y: 5600 },
    ]);
  });

  it('과제와 판본: K1은 이름표·Q27·Q28, K2는 같은 소리 다른 이름(음정)·Q29, K3는 Q30, K4는 반음계(오름·내림)다', () => {
    expect([K1, K2, K3, K4].map((i) => i.quests)).toEqual([
      [
        { questId: 'pitch.same-sound-different-names', variantIds: ['name-tags'] },
        { questId: 'key.black-key-names', variantIds: ['black-key-names'] },
        { questId: 'key.whole-and-half-steps', variantIds: ['whole-and-half'] },
      ],
      [
        { questId: 'pitch.same-sound-different-names', variantIds: ['interval-names'] },
        { questId: 'key.build-intervals', variantIds: ['basic', 'challenge'] },
      ],
      [{ questId: 'key.accidentals-in-a-bar', variantIds: ['g-major-f'] }],
      [{ questId: 'scale.chromatic', variantIds: ['ascending', 'descending'] }],
    ]);
  });

  it('널은 K1 25장, K2·K3 13장이고 번호는 소리 높이 차례다. 흰 널 사이 간격은 없다(72 px씩 이어진다)', () => {
    expect(BRIDGES.map((i) => i.slots.length)).toEqual([25, 13, 13]);
    for (const inst of BRIDGES) {
      const whites = inst.slots.filter((s) => !isBlackRect(s));
      whites.forEach((s, n) => expect(s.x, `${inst.stationCode} ${s.slot}`).toBe(whites[0]!.x + n * PLANK_WHITE_W));
      expect(new Set(whites.map((s) => s.y)).size).toBe(1);
    }
  });

  it('content 폴더 전체와 설치물 연결 검사를 통과한다(정거장, 과제, 쌍둥이 패널, 지역 범위)', () => {
    expect(validateContentDir(root)).toEqual([]);
    expect(codes([K1, K2, K3, K4])).toEqual([]);
  });

  it('원본 그대로는 문제가 없고, 원형과 변환표가 짝이 아니면 알린다', () => {
    for (const i of BRIDGES) expect(codes([i]), i.installationId).toEqual([]);
    const wrong = clone(K1);
    wrong.archetype = 'bellTree';
    expect(codes([wrong])).toContain('SLOTMAP_ARCHETYPE');
    const other = clone(K1);
    (other as { slotMap: unknown }).slotMap = { kind: 'orderedPitches', voiceId: 'v1' };
    expect(codes([other])).toContain('SLOTMAP_ARCHETYPE');
  });

  it('널이 정해진 자리에 서 있지 않으면 알린다(BRIDGE_PLANK): 1 px 어긋남, 널 한 장 빠짐', () => {
    const off = clone(K1);
    off.slots[6]!.x += 1;
    expect(codes([off])).toEqual(['BRIDGE_PLANK']);
    const short = clone(K2);
    short.slots.pop();
    expect(codes([short])).toContain('BRIDGE_PLANK');
  });

  it('검은 널과 흰 널은 겹쳐도 되지만 흰 널끼리나 검은 널끼리 겹치면 알린다(SLOT_OVERLAP)', () => {
    expect(codes([K1])).not.toContain('SLOT_OVERLAP');
    const white = clone(K1);
    white.slots[2]!.x -= 20; // 3번(D4)이 1번(C4)과 겹친다
    expect(codes([white])).toContain('SLOT_OVERLAP');
    const blacks = clone(K1);
    blacks.slots[3]!.x -= 30; // 4번(D♯4)이 2번(C♯4)과 겹친다
    expect(codes([blacks])).toContain('SLOT_OVERLAP');
  });

  it('자리 번호가 1부터 차례가 아니면 알린다(SLOT_NUMBER). 다리가 지역 밖이면 알린다(SLOT_OUTSIDE)', () => {
    const swapped = clone(K2);
    [swapped.slots[3]!.slot, swapped.slots[4]!.slot] = [swapped.slots[4]!.slot, swapped.slots[3]!.slot];
    expect(codes([swapped])).toContain('SLOT_NUMBER');
    const out = clone(K1);
    for (const s of out.slots) s.x += 4000;
    expect(codes([out])).toContain('SLOT_OUTSIDE');
  });

  it('판정기가 다리가 이어 주지 못하는 판본(리듬 놓기, 반음계)이면 알린다(SLOTMAP_EVALUATOR)', () => {
    const rhythm = { ...clone(K1), quests: [{ questId: 'rhythm.six-eight', variantIds: ['quarters-and-eighths'] }] };
    expect(codes([rhythm])).toContain('SLOTMAP_EVALUATOR');
    const chromatic = { ...clone(K3), quests: [{ questId: 'scale.chromatic', variantIds: ['ascending'] }] };
    expect(codes([chromatic])).toContain('SLOTMAP_EVALUATOR');
  });

  it('변환표 모양은 형식 검사에서 먼저 걸러진다: 가장 낮은 널의 MIDI는 정수, 흰 널은 2장 이상', () => {
    const raw = readJson('content', 'installations', 'inst.key-marsh.interval-rope.json') as Record<string, unknown>;
    const t = (slotMap: Record<string, unknown>): string[] => parseInstallation({ ...clone(raw), slotMap }, 'x.json').issues.map((i) => i.code);
    const ok = { kind: 'keyBridge', lowMidi: 60, whiteCount: 8 };
    expect(t(ok)).toEqual([]);
    expect(t({ ...ok, lowMidi: 60.5 })).toContain('SHAPE');
    expect(t({ ...ok, lowMidi: 'C4' })).toContain('SHAPE');
    expect(t({ ...ok, whiteCount: 1 })).toContain('SHAPE');
    expect(t({ ...ok, whiteCount: 8.5 })).toContain('SHAPE');
    expect(t({ ...ok, whiteCount: undefined })).toContain('SHAPE');
  });
});
