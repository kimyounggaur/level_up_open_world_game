// 4-1 설치물 정의(content/installations/*.json)를 읽고 검사한다. 설계서 4.1~4.3, 부록 A.2.
// 설치물은 판정기 하나에 '공간의 뜻' 하나를 붙인 것이다. 이 파일은 좌표와 연결만 다루고, 판정은 모른다(W-3).
import { PANEL_IDS } from './content';
import type { ContentIssue, QuestDefinition, QuestVariant } from './content';
import { measureCountOf } from './score';
import { CLEF_NAME_KO } from './staff';
import type { Clef } from './staff';
import { expectedPitchesOf } from './evaluators/orderedScale';
import { INVERSION_SLOT_COUNT, TRIAD_SLOT_COUNT, octavesOfRange } from './slotplan';
import { TERRACE_COLUMNS, TERRACE_COLUMN_GAP, TERRACE_COLUMN_W, TERRACE_FRAME_PAD, TERRACE_STEP_PX, terraceBounds, terraceColumnsOf, terraceRangeOf, terraceStepOf, terraceYOfStep } from './terrace';
import { BRIDGE_FRAME_PAD, BRIDGE_MIN_ZOOM, bridgeBounds, bridgeSlotProblems, bridgeVariantProblems, isBlackRect } from './keyBridge';
import { timelineOf } from './timeline';
import { measureTicks, tupletNoteTicks } from './time';
import { INTERACT_RANGE, isRegionId, regionBoundsPx } from './world';
import type { RegionId, Station, StationArchetype, WorldMap } from './world';

/** 설치물 원형 이름과 정거장 원형 코드(4.1). 만든 것은 steppingPath(T1, 4단계), ensembleStage(T7, 5단계), stepStones(T2), waterwheel(T3), bellTree(T4, 6단계), terraceField(T5, 7단계), keyBridge(T6, 7단계)이다 */
export const ARCHETYPE_CODES = {
  steppingPath: 'T1',
  stepStones: 'T2',
  waterwheel: 'T3',
  bellTree: 'T4',
  terraceField: 'T5',
  keyBridge: 'T6',
  ensembleStage: 'T7',
} as const satisfies Record<string, StationArchetype>;

export type InstallationArchetype = keyof typeof ARCHETYPE_CODES;

/** 자리 변환표의 종류. 자리 번호를 음악 데이터로 바꾸는 방법이다(4.2). 만든 것부터 넣는다 */
export const SLOT_MAP_KINDS = ['orderedPitches', 'stageCells', 'timelineStones', 'bellTree', 'staffField', 'keyBridge'] as const;
export type SlotMapKind = (typeof SLOT_MAP_KINDS)[number];

/** 설치물 원형마다 쓰는 자리 변환표. 원형과 변환표가 어긋난 파일은 검사에서 막는다 */
export const ARCHETYPE_SLOT_MAP: Readonly<Partial<Record<InstallationArchetype, SlotMapKind>>> = { steppingPath: 'orderedPitches', ensembleStage: 'stageCells', stepStones: 'timelineStones', waterwheel: 'timelineStones', bellTree: 'bellTree', terraceField: 'staffField', keyBridge: 'keyBridge' };

/** 합주 무대(T7)의 바닥 한 줄: 성부 하나(4.9 '줄이 성부') */
export interface StageRowDef {
  voiceId: string;
  /** 바닥 옆에 쓰는 이름. 예: '위 성부' */
  label: string;
}

/**
 * 자리 변환표의 정의. 설치물 파일의 slotMap이다.
 * - orderedPitches(T1): 자리 번호 = 음의 순서. 한 성부의 음을 차례로 놓는다.
 * - stageCells(T7): 자리 번호 = 성부 줄 × 마디 칸. 줄 하나를 왼쪽에서 오른쪽으로(마디 순서) 읽고 다음 줄로 넘어간다.
 * - timelineStones(T2, T3): 자리 번호 = 가장 잘게 나눈 시간 칸(cellTicks). 시간이 axis 방향으로 흐르고 1 px가 ticksPerPx 틱이다.
 *   돌의 시작은 칸에, 길이는 틱에서 온다. 판본의 칸은 이 칸의 배수다(예: 8분음표 칸 480틱 위의 4분음표 칸).
 *   follow가 'beat'이면 줄이 길어서(확대형, 4.4) 카메라가 줄 전체를 담지 않고 편집 중인 박 하나를 따라간다.
 *   wheel이 있으면(물레방아 T3, 4.5) 같은 줄(slots)이 바퀴로도 보인다: 한 바퀴가 줄 전체(한 마디)이고 칸은 12시에서 시계 방향으로 같은 각도씩이다.
 *   maxStoneCells는 한 돌(못)이 덮을 수 있는 칸의 수다(물레방아는 3칸까지, 점4분음표).
 * - bellTree(T4, 4.6): 자리 = 고리 하나(가지 단 × 열). 나무마다 octaves.length단 × columns열의 고리가 있고, 번호는 나무 차례, 단 차례(맨 위 단이 먼저), 열 차례(왼쪽이 먼저)다.
 *   종 하나는 초안의 칸 하나(열)를 차지하고 그 종의 옥타브가 걸린 단이다: 열이 초안의 칸 번호(나무 × columns + 열)이고 가로 순서다.
 *   form은 나무 하나(tree), 가로 순서를 바꾸는 종탑(tower), 나무 여럿이 길을 따라 서는 빈터(glade)다.
 * - staffField(T5, 4.7): 자리 = 열 하나(세로줄). 열은 8개이고 간격은 140 px다. 열 안의 높이는 자리가 아니라 온음계 위치(정수)로 정해진다:
 *   y = c4Y − 48 × (가온 도 C4에서 온음계로 몇 칸 위인가). low·high는 이 밭이 쓰는 가장 낮은 음과 가장 높은 음이고 열의 세로 길이가 그 범위를 덮는다.
 *   clefs는 이 밭이 다루는 음자리표다(높은음 밭, 낮은음 밭, 둘 다인 가운데 턱). 열의 번호는 판본의 칸 차례다(왼쪽부터).
 * - keyBridge(T6, 4.8): 자리 = 널 하나. 가장 낮은 널의 소리 높이(lowMidi, 흰 건반)와 흰 널의 수(whiteCount)가 정해지면 검은 널까지 모든 널이 정해진다.
 *   자리 번호는 소리 높이 차례다(가장 낮은 널이 1번, 반음마다 한 장). 흰 널 72×240, 검은 널 44×150이 흰 널 경계 위에 서므로 검은 널과 흰 널의 사각형은 겹친다.
 *   널의 소리는 널이 정하고(밟으면 울린다), 이름표·말뚝·깃발의 칸 번호는 초안의 칸이지 널 번호가 아니다(keyBridge.ts가 초안 칸과 널을 잇는다).
 */
export type SlotMapDef =
  | { kind: 'orderedPitches'; voiceId: string }
  | { kind: 'stageCells'; rows: StageRowDef[]; measures: number }
  | { kind: 'timelineStones'; voiceId: string; axis: 'x' | 'y'; ticksPerPx: number; cellTicks: number; follow?: 'beat'; wheel?: WheelDef; maxStoneCells?: number }
  | { kind: 'bellTree'; form: BellForm; trees: number; columns: number; octaves: number[] }
  | { kind: 'staffField'; c4Y: number; low: string; high: string; clefs: Clef[] }
  | { kind: 'keyBridge'; lowMidi: number; whiteCount: number };

/** 종나무(T4)의 모양: 나무 하나, 종탑(가로 순서를 바꾼다), 빈터(나무 여럿) */
export const BELL_FORMS = ['tree', 'tower', 'glade'] as const;
export type BellForm = (typeof BELL_FORMS)[number];

/** 종나무의 고리 한 칸의 크기(월드 px): 가로는 열 간격, 세로는 가지 단 간격. 칸이 화면에서 48 px 아래로 줄지 않게 카메라 배율의 하한도 여기서 나온다(7.6) */
export const BELL_CELL_W = 80;
export const BELL_CELL_H = 72;
/** 종나무 그림의 글자 띠: 첫 열 왼쪽의 단(옥타브) 이름과 첫 단 위의 나무 이름·열 번호. 월드가 그리는 자리와 카메라가 담는 자리를 한곳에 둔다 */
export const BELL_LABEL_LEFT = 52;
export const BELL_LABEL_TOP = 44;
/** 종나무를 담을 때 둘레의 여유(월드 px) */
export const BELL_FRAME_PAD = 24;

/** 물레방아(T3, 4.5)의 바퀴: 중심과 반지름(월드 px). 바퀴 지름은 480 px다 */
export interface WheelDef {
  cx: number;
  cy: number;
  r: number;
}

/** T1의 자리 수: 5음 음계 6, 음계 8, 반음계 13(4.3) */
export const STEPPING_SLOT_COUNTS: readonly number[] = [6, 8, 13];

export interface SlotRect {
  /** 1부터. 사용자에게도 '몇 번째 자리'로 보인다 */
  slot: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InstallationQuestRef {
  questId: string;
  variantIds: string[];
}

export interface InstallationDef {
  installationId: string;
  stationCode: string;
  regionId: RegionId;
  archetype: InstallationArchetype;
  name: string;
  interactPoint: { x: number; y: number };
  slots: SlotRect[];
  slotMap: SlotMapDef;
  quests: InstallationQuestRef[];
  panelTwin: string;
  signatureSoundId: string;
  /** 서명 소리가 들리는 거리(px, 8.4) */
  hearRadius: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 설치물 파일 하나를 읽는다. 형식이 틀리면 문제 목록을 돌려주고 설치물은 null이다 */
export function parseInstallation(raw: unknown, file: string): { installation: InstallationDef | null; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string): void => void issues.push({ code, path: `${file}${path}`, message });
  if (!isObj(raw)) {
    add('SHAPE', '', '설치물 파일은 객체여야 해요');
    return { installation: null, issues };
  }
  const str = (k: string, o: Record<string, unknown> = raw, p = ''): string => {
    const v = o[k];
    if (typeof v !== 'string' || v.length === 0) {
      add('SHAPE', `${p}.${k}`, `${k}는 글자여야 해요`);
      return '';
    }
    return v;
  };
  const num = (k: string, o: Record<string, unknown>, p: string): number => {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      add('SHAPE', `${p}.${k}`, `${k}는 숫자여야 해요`);
      return 0;
    }
    return v;
  };

  const installationId = str('installationId');
  if (installationId && !/^inst\.[a-z0-9-]+\.[a-z0-9-]+$/.test(installationId)) add('ID_FORMAT', '.installationId', `installationId는 inst.village.scale-stones 같은 형식이어야 해요: ${installationId}`);
  const stationCode = str('stationCode');
  const regionId = str('regionId');
  if (regionId && !isRegionId(regionId)) add('REGION_ID', '.regionId', `알 수 없는 지역 id예요: ${regionId}`);
  const archetype = str('archetype');
  if (archetype && !(archetype in ARCHETYPE_CODES)) add('ARCHETYPE', '.archetype', `archetype은 ${Object.keys(ARCHETYPE_CODES).join(', ')} 중 하나예요: ${archetype}`);
  const name = str('name');

  const ip = raw['interactPoint'];
  let interactPoint = { x: 0, y: 0 };
  if (!isObj(ip)) add('SHAPE', '.interactPoint', 'interactPoint는 {x, y}이어야 해요');
  else interactPoint = { x: num('x', ip, '.interactPoint'), y: num('y', ip, '.interactPoint') };

  const slots: SlotRect[] = [];
  const sl = raw['slots'];
  if (!Array.isArray(sl) || sl.length === 0) add('SHAPE', '.slots', 'slots는 비어 있지 않은 목록이어야 해요');
  else {
    sl.forEach((s, i) => {
      const p = `.slots[${i}]`;
      if (!isObj(s)) return add('SHAPE', p, '자리는 객체여야 해요');
      const rect: SlotRect = { slot: num('slot', s, p), x: num('x', s, p), y: num('y', s, p), w: num('w', s, p), h: num('h', s, p) };
      if (rect.w <= 0 || rect.h <= 0) add('SLOT_SIZE', p, '자리의 가로·세로는 0보다 커야 해요');
      slots.push(rect);
    });
  }

  const sm = raw['slotMap'];
  let slotMap: SlotMapDef = { kind: 'orderedPitches', voiceId: '' };
  if (!isObj(sm)) add('SHAPE', '.slotMap', 'slotMap은 {kind, ...}이어야 해요');
  else {
    const kind = str('kind', sm, '.slotMap');
    if (kind && !(SLOT_MAP_KINDS as readonly string[]).includes(kind)) add('SLOT_MAP_KIND', '.slotMap.kind', `아직 만들지 않은 자리 변환표예요: ${kind}`);
    if (kind === 'stageCells') {
      const rows: StageRowDef[] = [];
      const rs = sm['rows'];
      if (!Array.isArray(rs) || rs.length === 0) add('SHAPE', '.slotMap.rows', 'rows는 비어 있지 않은 목록이어야 해요');
      else {
        rs.forEach((r, i) => {
          const p = `.slotMap.rows[${i}]`;
          if (!isObj(r)) return add('SHAPE', p, '{voiceId, label}이어야 해요');
          rows.push({ voiceId: str('voiceId', r, p), label: str('label', r, p) });
        });
      }
      const measures = num('measures', sm, '.slotMap');
      if (!Number.isInteger(measures) || measures < 1) add('SHAPE', '.slotMap.measures', 'measures는 1 이상의 정수여야 해요');
      slotMap = { kind: 'stageCells', rows, measures };
    } else if (kind === 'timelineStones') {
      const axis = str('axis', sm, '.slotMap');
      if (axis && axis !== 'x' && axis !== 'y') add('SHAPE', '.slotMap.axis', "axis는 'x'나 'y'예요");
      const ticksPerPx = num('ticksPerPx', sm, '.slotMap');
      if (!Number.isInteger(ticksPerPx) || ticksPerPx < 1) add('SHAPE', '.slotMap.ticksPerPx', 'ticksPerPx는 1 이상의 정수여야 해요');
      const cellTicks = num('cellTicks', sm, '.slotMap');
      if (!Number.isInteger(cellTicks) || cellTicks < 1) add('SHAPE', '.slotMap.cellTicks', 'cellTicks는 1 이상의 정수여야 해요');
      const follow = sm['follow'];
      if (follow !== undefined && follow !== 'beat') add('SHAPE', '.slotMap.follow', "follow는 'beat'만 쓸 수 있어요");
      const wh = sm['wheel'];
      let wheel: WheelDef | undefined;
      if (wh !== undefined) {
        if (!isObj(wh)) add('SHAPE', '.slotMap.wheel', 'wheel은 {cx, cy, r}이어야 해요');
        else {
          wheel = { cx: num('cx', wh, '.slotMap.wheel'), cy: num('cy', wh, '.slotMap.wheel'), r: num('r', wh, '.slotMap.wheel') };
          if (wheel.r <= 0) add('SHAPE', '.slotMap.wheel.r', 'r는 0보다 커야 해요');
        }
      }
      const maxCells = sm['maxStoneCells'];
      const maxCellsOk = typeof maxCells === 'number' && Number.isInteger(maxCells) && maxCells >= 1;
      if (maxCells !== undefined && !maxCellsOk) add('SHAPE', '.slotMap.maxStoneCells', 'maxStoneCells는 1 이상의 정수여야 해요');
      slotMap = {
        kind: 'timelineStones',
        voiceId: str('voiceId', sm, '.slotMap'),
        axis: axis === 'y' ? 'y' : 'x',
        ticksPerPx,
        cellTicks,
        ...(follow === 'beat' ? { follow: 'beat' as const } : {}),
        ...(wheel ? { wheel } : {}),
        ...(maxCellsOk ? { maxStoneCells: maxCells } : {}),
      };
    } else if (kind === 'bellTree') {
      const form = str('form', sm, '.slotMap');
      if (form && !(BELL_FORMS as readonly string[]).includes(form)) add('SHAPE', '.slotMap.form', `form은 ${BELL_FORMS.join(', ')} 중 하나예요: ${form}`);
      const trees = num('trees', sm, '.slotMap');
      if (!Number.isInteger(trees) || trees < 1) add('SHAPE', '.slotMap.trees', 'trees는 1 이상의 정수예요');
      const columns = num('columns', sm, '.slotMap');
      if (!Number.isInteger(columns) || columns < 1) add('SHAPE', '.slotMap.columns', 'columns는 1 이상의 정수예요');
      const os = sm['octaves'];
      const octaves = Array.isArray(os) && os.length > 0 && os.every((o) => typeof o === 'number' && Number.isInteger(o)) ? (os as number[]) : null;
      if (!octaves) add('SHAPE', '.slotMap.octaves', 'octaves는 비어 있지 않은 정수 목록이어야 해요(맨 위 단부터)');
      slotMap = { kind: 'bellTree', form: (BELL_FORMS as readonly string[]).includes(form) ? (form as BellForm) : 'tree', trees, columns, octaves: octaves ?? [] };
    } else if (kind === 'staffField') {
      const c4Y = num('c4Y', sm, '.slotMap');
      if (!Number.isInteger(c4Y)) add('SHAPE', '.slotMap.c4Y', 'c4Y는 정수예요(가온 도의 세로 좌표)');
      const low = str('low', sm, '.slotMap');
      const high = str('high', sm, '.slotMap');
      const cs = sm['clefs'];
      const clefs: Clef[] = Array.isArray(cs) ? cs.filter((c): c is Clef => c === 'treble' || c === 'bass') : [];
      if (!Array.isArray(cs) || clefs.length === 0 || clefs.length !== cs.length || new Set(clefs).size !== clefs.length) add('SHAPE', '.slotMap.clefs', "clefs는 'treble'과 'bass' 중에서 겹치지 않게 고른 목록이에요");
      slotMap = { kind: 'staffField', c4Y, low, high, clefs };
    } else if (kind === 'keyBridge') {
      const lowMidi = num('lowMidi', sm, '.slotMap');
      if (!Number.isInteger(lowMidi)) add('SHAPE', '.slotMap.lowMidi', 'lowMidi는 정수예요(가장 낮은 널의 MIDI)');
      const whiteCount = num('whiteCount', sm, '.slotMap');
      if (!Number.isInteger(whiteCount) || whiteCount < 2) add('SHAPE', '.slotMap.whiteCount', 'whiteCount는 2 이상의 정수예요');
      slotMap = { kind: 'keyBridge', lowMidi, whiteCount };
    } else slotMap = { kind: 'orderedPitches', voiceId: str('voiceId', sm, '.slotMap') };
  }

  const quests: InstallationQuestRef[] = [];
  const qs = raw['quests'];
  if (!Array.isArray(qs) || qs.length === 0) add('SHAPE', '.quests', 'quests는 비어 있지 않은 목록이어야 해요');
  else {
    qs.forEach((q, i) => {
      const p = `.quests[${i}]`;
      if (!isObj(q)) return add('SHAPE', p, '{questId, variantIds}이어야 해요');
      const vids = q['variantIds'];
      if (!Array.isArray(vids) || vids.length === 0 || !vids.every((v) => typeof v === 'string')) add('SHAPE', `${p}.variantIds`, 'variantIds는 비어 있지 않은 글자 목록이어야 해요');
      quests.push({ questId: str('questId', q, p), variantIds: Array.isArray(vids) ? (vids.filter((v) => typeof v === 'string') as string[]) : [] });
    });
  }

  const panelTwin = str('panelTwin');
  const signatureSoundId = str('signatureSoundId');
  if (signatureSoundId && !/^sig\.[a-z0-9-]+\.[a-z0-9-]+$/.test(signatureSoundId)) add('ID_FORMAT', '.signatureSoundId', `signatureSoundId는 sig.village.scale-stones 같은 형식이어야 해요: ${signatureSoundId}`);
  const hearRadius = num('hearRadius', raw, '');
  if (hearRadius < 300 || hearRadius > 2000) add('HEAR_RADIUS', '.hearRadius', `hearRadius는 300–2000 px 사이여야 해요: ${hearRadius}`);

  if (issues.length > 0) return { installation: null, issues };
  return {
    installation: { installationId, stationCode, regionId: regionId as RegionId, archetype: archetype as InstallationArchetype, name, interactPoint, slots, slotMap, quests, panelTwin, signatureSoundId, hearRadius },
    issues,
  };
}

export interface InstallationContext {
  map?: WorldMap;
  quests?: readonly QuestDefinition[];
}

const overlaps = (a: SlotRect, b: SlotRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

type AddIssue = (code: string, path: string, message: string) => void;

/** timelineStones의 자리 검사: 칸 하나의 길이는 cellTicks ÷ ticksPerPx px이고, 자리는 시간 방향으로 빈틈없이 이어진다 */
function validateTimelineSlots(inst: InstallationDef, map: Extract<SlotMapDef, { kind: 'timelineStones' }>, add: AddIssue): void {
  const at = inst.installationId;
  if (map.cellTicks % map.ticksPerPx !== 0) {
    add('SLOT_GRID', at, `칸(${map.cellTicks}틱)이 px로 나누어떨어지지 않아요(1 px = ${map.ticksPerPx}틱)`);
    return;
  }
  const len = map.cellTicks / map.ticksPerPx;
  const along = (s: SlotRect): { start: number; size: number; cross: number; crossSize: number } => (map.axis === 'x' ? { start: s.x, size: s.w, cross: s.y, crossSize: s.h } : { start: s.y, size: s.h, cross: s.x, crossSize: s.w });
  const first = inst.slots[0];
  if (!first) return;
  const f = along(first);
  inst.slots.forEach((s, i) => {
    const a = along(s);
    if (a.size !== len) add('SLOT_GRID', `${at}.slots[${i}]`, `${s.slot}번 자리의 ${map.axis === 'x' ? '가로' : '세로'}는 ${len} px여야 해요(칸 ${map.cellTicks}틱 ÷ ${map.ticksPerPx})(지금 ${a.size} px)`);
    if (a.cross !== f.cross || a.crossSize !== f.crossSize) add('SLOT_ORDER', `${at}.slots[${i}]`, `${s.slot}번 자리가 첫 자리와 같은 줄에 있지 않아요`);
    if (i > 0) {
      const prev = along(inst.slots[i - 1]!);
      if (a.start !== prev.start + prev.size) add('SLOT_ORDER', `${at}.slots[${i}]`, `${s.slot}번 자리는 ${inst.slots[i - 1]!.slot}번 자리 바로 뒤에서 시작해야 해요(시간 순서, 빈틈 없이)`);
    }
  });
  if (map.wheel) {
    // 바퀴(4.5): 칸이 둘 이상이어야 각도로 나눌 수 있고, 펼친 띠(slots)와 겹치면 안 된다. 한 바퀴가 줄 전체(한 마디)다
    const w = map.wheel;
    if (inst.slots.length < 2) add('WHEEL_CELLS', at, `바퀴는 칸이 둘 이상이어야 해요(지금 ${inst.slots.length}개)`);
    const box: SlotRect = { slot: 0, x: w.cx - w.r, y: w.cy - w.r, w: w.r * 2, h: w.r * 2 };
    for (const s of inst.slots) if (overlaps(box, s)) add('WHEEL_OVERLAP', at, `바퀴가 펼친 띠의 ${s.slot}번 자리와 겹쳐요`);
  }
}

/**
 * bellTree의 자리 검사: 고리는 나무마다 단 × 열의 빈틈 없는 격자이고, 번호는 나무 차례, 단 차례(맨 위가 먼저), 열 차례(왼쪽이 먼저)다.
 * 단(옥타브)은 위에서 아래로 한 칸씩 내려가고, 나무는 왼쪽에서 오른쪽으로 늘어선다.
 */
function validateBellSlots(inst: InstallationDef, map: Extract<SlotMapDef, { kind: 'bellTree' }>, add: AddIssue): void {
  const at = inst.installationId;
  const rows = map.octaves.length;
  if (map.form !== 'glade' && map.trees !== 1) add('BELL_TREES', at, `${map.form}은 나무가 하나예요(지금 ${map.trees}그루). 나무가 여럿인 것은 glade예요`);
  if (map.form === 'glade' && map.trees < 2) add('BELL_TREES', at, `glade는 나무가 둘 이상이어야 해요(지금 ${map.trees}그루)`);
  for (let i = 1; i < map.octaves.length; i++) {
    if (map.octaves[i]! !== map.octaves[i - 1]! - 1) add('BELL_OCTAVES', at, `단(octaves)은 맨 위부터 한 옥타브씩 내려가야 해요: ${map.octaves.join(', ')}`);
  }
  const want = map.trees * rows * map.columns;
  if (inst.slots.length !== want) {
    add('SLOT_COUNT', at, `종나무의 고리 수는 나무(${map.trees}) × 단(${rows}) × 열(${map.columns}) = ${want}개예요(지금 ${inst.slots.length}개)`);
    return;
  }
  const first = inst.slots[0]!;
  inst.slots.forEach((s, i) => {
    const tree = Math.floor(i / (rows * map.columns));
    const row = Math.floor(i / map.columns) % rows;
    const column = i % map.columns;
    const p = `${at}.slots[${i}]`;
    if (s.w !== BELL_CELL_W || s.h !== BELL_CELL_H) add('SLOT_GRID', p, `${s.slot}번 고리의 크기는 ${BELL_CELL_W}×${BELL_CELL_H} px여야 해요(지금 ${s.w}×${s.h})`);
    // 같은 나무 안에서는 첫 고리 기준의 격자 자리에 있다. 나무가 바뀌면 가로로 옮겨 가지만 높이는 같다
    const first0 = inst.slots[tree * rows * map.columns]!;
    if (s.x !== first0.x + column * BELL_CELL_W || s.y !== first.y + row * BELL_CELL_H) add('SLOT_ORDER', p, `${s.slot}번 고리는 ${tree + 1}번째 나무의 ${row + 1}단 ${column + 1}열 자리(${first0.x + column * BELL_CELL_W}, ${first.y + row * BELL_CELL_H})에 있어야 해요(지금 ${s.x}, ${s.y})`);
    if (column === 0 && row === 0 && tree > 0) {
      const prev = inst.slots[(tree - 1) * rows * map.columns]!;
      if (s.x < prev.x + map.columns * BELL_CELL_W) add('SLOT_ORDER', p, `${tree + 1}번째 나무는 앞 나무의 오른쪽에 서야 해요`);
    }
  });
}

/** 종나무에 놓는 판본의 검사: 판정기에 따라 모양이 정해지고, 판본의 음역이 나무의 단 안에 있어야 한다 */
function validateBellVariant(inst: InstallationDef, map: Extract<SlotMapDef, { kind: 'bellTree' }>, label: string, v: QuestVariant, add: AddIssue): void {
  const at = inst.installationId;
  const spec = v.evaluatorSpec;
  const want = (form: BellForm, columns: number, trees = 1): void => {
    if (map.form !== form) add('SLOTMAP_FORM', at, `${label}의 판정기(${spec.type})는 ${form} 모양의 종나무에 놓아요(지금 ${map.form})`);
    if (map.columns !== columns) add('SLOTMAP_COUNT', at, `${label}는 종 칸이 ${columns}개인데 나무의 열은 ${map.columns}개예요`);
    if (map.trees !== trees) add('SLOTMAP_COUNT', at, `${label}는 나무가 ${trees}그루인데 설치물은 ${map.trees}그루예요`);
  };
  if (spec.type === 'triadMembership') want('tree', TRIAD_SLOT_COUNT);
  else if (spec.type === 'inversion') want('tower', INVERSION_SLOT_COUNT);
  else if (spec.type === 'chordSequence') want('glade', TRIAD_SLOT_COUNT, spec.trees);
  else {
    add('SLOTMAP_EVALUATOR', at, `${label}의 판정기가 ${spec.type}인데 bellTree 변환표는 triadMembership, inversion, chordSequence만 이어요`);
    return;
  }
  for (const o of octavesOfRange(v.challengeDescriptor.range)) {
    if (!map.octaves.includes(o)) add('BELL_RANGE', at, `${label}의 음역(${v.challengeDescriptor.range})의 ${o}옥타브가 나무의 단(${map.octaves.join(', ')})에 없어요`);
  }
}

/**
 * staffField의 자리 검사: 열은 8개이고 140 px 간격으로 왼쪽에서 오른쪽으로 서며, 모든 열이 같은 높이 범위(low–high)를 덮는다.
 * 세로 좌표는 y = c4Y − 48 × 칸 수이고 열의 사각형은 low의 칸 아래쪽부터 high의 칸 위쪽까지다.
 */
function validateTerraceSlots(inst: InstallationDef, map: Extract<SlotMapDef, { kind: 'staffField' }>, add: AddIssue): void {
  const at = inst.installationId;
  const r = terraceRangeOf(map);
  if (Number.isNaN(r.low) || Number.isNaN(r.high)) {
    add('TERRACE_RANGE', at, `low와 high는 A3, C6 같은 음 이름이어야 해요(지금 ${map.low}, ${map.high})`);
    return;
  }
  if (r.low >= r.high) add('TERRACE_RANGE', at, `low(${map.low})는 high(${map.high})보다 낮아야 해요`);
  if (r.low < -14 || r.high > 14) add('TERRACE_RANGE', at, `높이 범위는 덧줄 범위 C2–C6 안이어야 해요(지금 ${map.low}–${map.high})`);
  if (inst.slots.length !== TERRACE_COLUMNS) {
    add('SLOT_COUNT', at, `계단밭의 열은 ${TERRACE_COLUMNS}개예요(지금 ${inst.slots.length}개)`);
    return;
  }
  const top = terraceYOfStep(map, r.high) - TERRACE_STEP_PX / 2;
  const height = (r.high - r.low + 1) * TERRACE_STEP_PX;
  const first = inst.slots[0]!;
  inst.slots.forEach((s, i) => {
    const p = `${at}.slots[${i}]`;
    if (s.w !== TERRACE_COLUMN_W) add('SLOT_GRID', p, `${s.slot}번 열의 가로는 ${TERRACE_COLUMN_W} px여야 해요(지금 ${s.w})`);
    if (s.x !== first.x + i * TERRACE_COLUMN_GAP) add('SLOT_ORDER', p, `${s.slot}번 열은 첫 열에서 오른쪽으로 ${i * TERRACE_COLUMN_GAP} px 떨어진 x=${first.x + i * TERRACE_COLUMN_GAP}에 서야 해요(열 간격 ${TERRACE_COLUMN_GAP}, 지금 x=${s.x})`);
    if (s.y !== top || s.h !== height) add('SLOT_GRID', p, `${s.slot}번 열은 ${map.low}–${map.high}를 덮어야 해요: y=${top}, 세로 ${height} px(지금 y=${s.y}, 세로 ${s.h})`);
  });
}

/** 계단밭에 놓는 판본의 검사: 음이름이나 음계 순서 판정기이고, 칸 수·음자리표·정답의 높이가 밭이 다루는 범위 안이어야 한다 */
function validateTerraceVariant(inst: InstallationDef, map: Extract<SlotMapDef, { kind: 'staffField' }>, label: string, v: QuestVariant, add: AddIssue): void {
  const at = inst.installationId;
  const spec = v.evaluatorSpec;
  if (spec.type !== 'pitchSpelling' && spec.type !== 'orderedScale') {
    add('SLOTMAP_EVALUATOR', at, `${label}의 판정기가 ${spec.type}인데 staffField 변환표는 pitchSpelling과 orderedScale만 이어요`);
    return;
  }
  let columns;
  try {
    columns = terraceColumnsOf(map, v);
  } catch (err) {
    add('SLOTMAP_EVALUATOR', at, `${label}: ${(err as Error).message}`);
    return;
  }
  if (columns.length > inst.slots.length) add('SLOTMAP_COUNT', at, `${label}는 칸이 ${columns.length}개인데 밭의 열은 ${inst.slots.length}개예요`);
  const expected = spec.type === 'pitchSpelling' ? spec.targets.map((t) => terraceStepOf(t.expected)) : expectedPitchesOf(v.score, spec.voiceId).map((p) => terraceStepOf(p));
  columns.forEach((col, i) => {
    if (!map.clefs.includes(col.clef)) add('SLOTMAP_CLEF', at, `${label}의 ${col.label}는 ${CLEF_NAME_KO[col.clef]}로 읽는 칸인데 이 밭은 ${map.clefs.map((c) => CLEF_NAME_KO[c]).join(', ')}만 다뤄요`);
    const step = expected[i];
    if (step !== undefined && (step < col.minStep || step > col.maxStep)) add('TERRACE_RANGE', at, `${label}의 ${col.label}(${i + 1}번 열) 정답이 이 열이 쓰는 높이 범위 밖이에요`);
  });
}

/** 징검다리 설치물에 놓는 판본의 검사: 리듬 놓기 판정기이고, 성부와 박자와 칸이 설치물의 시간선과 맞아야 한다 */
function validateTimelineVariant(inst: InstallationDef, map: Extract<SlotMapDef, { kind: 'timelineStones' }>, label: string, v: QuestVariant, add: AddIssue): void {
  const at = inst.installationId;
  const spec = v.evaluatorSpec;
  if (spec.type !== 'rhythmPlacement') {
    add('SLOTMAP_EVALUATOR', at, `${label}의 판정기가 ${spec.type}인데 timelineStones 변환표는 rhythmPlacement만 이어요`);
    return;
  }
  if (spec.voiceId !== map.voiceId) add('SLOTMAP_VOICE', at, `${label}의 성부(${spec.voiceId})와 변환표의 성부(${map.voiceId})가 달라요`);
  // 판정기가 가리키는 성부가 악보에 없으면 시간선을 만들 수 없다: 예외로 멈추지 않고 문제로 알린다
  if (!v.score.voices.some((x) => x.voiceId === spec.voiceId)) {
    add('SLOTMAP_VOICE', at, `${label}의 성부(${spec.voiceId})가 악보에 없어요`);
    return;
  }
  const lane = inst.slots.length * map.cellTicks;
  if (measureCountOf(v.score) !== 1) add('SLOTMAP_COUNT', at, `${label}는 ${measureCountOf(v.score)}마디인데 징검다리는 한 마디만 놓아요`);
  const mLen = measureTicks(v.score.meter);
  if (mLen > lane) add('SLOTMAP_COUNT', at, `${label}의 한 마디(${mLen}틱)가 징검다리(${lane}틱)보다 길어요`);
  // 물레방아: 한 바퀴가 한 마디다(4.5). 줄이 한 마디보다 길면 바퀴 한 바퀴가 한 마디가 아니다
  if (map.wheel && mLen !== lane) add('SLOTMAP_COUNT', at, `${label}의 한 마디(${mLen}틱)가 바퀴 한 바퀴(${lane}틱)와 달라요(한 바퀴가 한 마디, 4.5)`);
  if (map.maxStoneCells !== undefined) {
    const cap = map.maxStoneCells * map.cellTicks;
    for (const e of v.score.events) {
      if (e.voiceId === spec.voiceId && e.durationTicks > cap) add('SLOTMAP_STONE_LENGTH', at, `${label}의 ${e.eventId}(${e.durationTicks}틱)가 돌 한 개의 한도(${map.maxStoneCells}칸, ${cap}틱)보다 길어요`);
    }
  }
  const t = timelineOf(v);
  if (t.cellTicks % map.cellTicks !== 0) add('SLOTMAP_GRID', at, `${label}의 칸(${t.cellTicks}틱)이 징검다리 칸(${map.cellTicks}틱)의 배수가 아니에요`);
  for (const k of t.tuplets) {
    const stone = tupletNoteTicks(k.writtenBaseDuration, k.actualNotes, k.normalNotes);
    if (stone % map.ticksPerPx !== 0) add('SLOTMAP_GRID', at, `${label}의 연음 돌(${stone}틱)이 px로 나누어떨어지지 않아요(1 px = ${map.ticksPerPx}틱)`);
  }
}

/** 설치물 사이와 설치물·정거장·과제 사이의 연결을 검사한다(10.4 '과제와 설치물 사이의 참조') */
export function validateInstallationSet(list: readonly InstallationDef[], ctx: InstallationContext = {}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string): void => void issues.push({ code, path, message });
  const ids = new Set<string>();
  const stations = new Set<string>();
  for (const inst of list) {
    const at = inst.installationId;
    if (ids.has(at)) add('DUP_ID', at, `설치물 id가 겹쳐요: ${at}`);
    ids.add(at);
    if (stations.has(inst.stationCode)) add('DUP_STATION', at, `한 정거장에 설치물이 둘이에요: ${inst.stationCode}`);
    stations.add(inst.stationCode);

    // 자리: 1부터 차례로, 서로 겹치지 않게
    inst.slots.forEach((s, i) => {
      if (s.slot !== i + 1) add('SLOT_NUMBER', `${at}.slots[${i}]`, `자리 번호는 1부터 차례로 이어져야 해요(${i + 1}번이어야 하는데 ${s.slot}번이에요)`);
    });
    for (let i = 0; i < inst.slots.length; i++) {
      for (let j = i + 1; j < inst.slots.length; j++) {
        // 건반 다리(T6)의 검은 널은 흰 널 경계 위에 걸쳐 서므로 검은 널과 흰 널은 겹쳐도 된다(널의 모양은 BRIDGE_PLANK가 따로 검사한다)
        if (inst.slotMap.kind === 'keyBridge' && isBlackRect(inst.slots[i]!) !== isBlackRect(inst.slots[j]!)) continue;
        if (overlaps(inst.slots[i]!, inst.slots[j]!)) add('SLOT_OVERLAP', at, `${inst.slots[i]!.slot}번과 ${inst.slots[j]!.slot}번 자리가 겹쳐요`);
      }
    }
    if (inst.archetype === 'steppingPath' && !STEPPING_SLOT_COUNTS.includes(inst.slots.length)) {
      add('SLOT_COUNT', at, `디딤돌 길의 자리 수는 ${STEPPING_SLOT_COUNTS.join(', ')} 중 하나예요(지금 ${inst.slots.length}개)`);
    }
    const wantedMap = ARCHETYPE_SLOT_MAP[inst.archetype];
    if (wantedMap && inst.slotMap.kind !== wantedMap) add('SLOTMAP_ARCHETYPE', at, `${inst.archetype} 설치물은 ${wantedMap} 변환표를 써요(지금 ${inst.slotMap.kind})`);
    if (inst.slotMap.kind === 'stageCells') {
      const { rows, measures } = inst.slotMap;
      if (inst.slots.length !== rows.length * measures) add('SLOT_COUNT', at, `무대 바닥의 자리 수는 성부 줄(${rows.length}) × 마디(${measures}) = ${rows.length * measures}개예요(지금 ${inst.slots.length}개)`);
      else {
        // 자리 번호는 줄 하나를 왼쪽에서 오른쪽으로 읽고 다음 줄로 넘어간다: 같은 줄은 같은 높이, 마디는 오른쪽으로, 줄은 아래로
        for (let r = 0; r < rows.length; r++) {
          for (let m = 0; m < measures; m++) {
            const cur = inst.slots[r * measures + m]!;
            const left = m > 0 ? inst.slots[r * measures + m - 1]! : null;
            const above = r > 0 ? inst.slots[(r - 1) * measures + m]! : null;
            if (left && !(cur.x >= left.x + left.w && cur.y === left.y)) add('SLOT_ORDER', at, `${cur.slot}번 자리는 ${left.slot}번 자리의 오른쪽, 같은 높이에 있어야 해요(마디 순서)`);
            if (above && !(cur.y >= above.y + above.h && cur.x === above.x)) add('SLOT_ORDER', at, `${cur.slot}번 자리는 ${above.slot}번 자리의 바로 아래에 있어야 해요(성부 줄 순서)`);
          }
        }
      }
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.voiceId)) add('SLOTMAP_VOICE', at, `성부 ${row.voiceId}가 줄에 두 번 나와요`);
        seen.add(row.voiceId);
      }
    }
    if (inst.slotMap.kind === 'timelineStones') {
      validateTimelineSlots(inst, inst.slotMap, add);
      // 물레방아(T3)는 바퀴가 있고, 바퀴는 물레방아에만 있다
      if (inst.archetype === 'waterwheel' && !inst.slotMap.wheel) add('WHEEL_MISSING', at, '물레방아 설치물에는 slotMap.wheel(바퀴의 중심 cx, cy와 반지름 r)이 있어야 해요');
      if (inst.archetype !== 'waterwheel' && inst.slotMap.wheel) add('WHEEL_ARCHETYPE', at, `바퀴(slotMap.wheel)는 물레방아 설치물에만 있어요(지금 ${inst.archetype})`);
    }
    if (inst.slotMap.kind === 'bellTree') validateBellSlots(inst, inst.slotMap, add);
    if (inst.slotMap.kind === 'staffField') validateTerraceSlots(inst, inst.slotMap, add);
    if (inst.slotMap.kind === 'keyBridge') for (const m of bridgeSlotProblems(inst, inst.slotMap)) add('BRIDGE_PLANK', at, m);
    if (!inst.panelTwin || !(PANEL_IDS as readonly string[]).includes(inst.panelTwin)) add('REF_PANEL', at, `알 수 없는 패널 '${inst.panelTwin}'`);

    // 정거장
    const map = ctx.map;
    if (map) {
      const station: Station | undefined = map.station(inst.stationCode);
      if (!station) add('REF_STATION', at, `지도에 없는 정거장이에요: ${inst.stationCode}`);
      else {
        if (station.kind !== 'installation') add('STATION_KIND', at, `${station.stationId}는 설치물 정거장이 아니에요(kind: ${station.kind})`);
        if (station.archetype !== ARCHETYPE_CODES[inst.archetype]) add('STATION_ARCHETYPE', at, `${station.stationId}의 원형은 ${station.archetype}인데 설치물은 ${ARCHETYPE_CODES[inst.archetype]}예요`);
        if (station.regionId !== inst.regionId) add('STATION_REGION', at, `${station.stationId}는 ${station.regionId} 지역인데 설치물은 ${inst.regionId}라고 적혀 있어요`);
        if (Math.hypot(station.x - inst.interactPoint.x, station.y - inst.interactPoint.y) > INTERACT_RANGE) add('INTERACT_FAR', at, `상호작용 점이 정거장 점에서 ${INTERACT_RANGE} px보다 멀어요`);
        for (const q of inst.quests) if (!station.questIds.includes(q.questId)) add('STATION_QUEST', at, `${q.questId}가 ${station.stationId}의 questIds에 없어요`);
      }
      if (isRegionId(inst.regionId)) {
        const b = regionBoundsPx(map.region(inst.regionId));
        for (const s of inst.slots) if (!(s.x >= b.x0 && s.y >= b.y0 && s.x + s.w <= b.x1 && s.y + s.h <= b.y1)) add('SLOT_OUTSIDE', at, `${s.slot}번 자리가 ${inst.regionId} 범위 밖이에요`);
        const wheel = inst.slotMap.kind === 'timelineStones' ? inst.slotMap.wheel : undefined;
        if (wheel && !(wheel.cx - wheel.r >= b.x0 && wheel.cy - wheel.r >= b.y0 && wheel.cx + wheel.r <= b.x1 && wheel.cy + wheel.r <= b.y1)) add('WHEEL_OUTSIDE', at, `바퀴가 ${inst.regionId} 범위 밖이에요`);
      }
    }

    // 과제
    const quests = ctx.quests;
    if (quests) {
      for (const ref of inst.quests) {
        const def = quests.find((q) => q.questId === ref.questId);
        if (!def) {
          add('REF_QUEST', at, `없는 과제예요: ${ref.questId}`);
          continue;
        }
        const placement = def.placements.find((p) => p.kind === 'installation' && p.installationId === at);
        if (!placement) add('PLACEMENT_MISSING', at, `${ref.questId}에 이 설치물을 가리키는 placements가 없어요`);
        const twin = def.placements.find((p) => p.kind === 'panel' && p.panelId === inst.panelTwin);
        if (!twin) add('TWIN_MISSING', at, `${ref.questId}에 쌍둥이 패널(${inst.panelTwin}) 배치가 없어요(W-2)`);
        for (const vid of ref.variantIds) {
          const v = def.variants[vid];
          if (!v) {
            add('REF_VARIANT', at, `${ref.questId}에 없는 판본이에요: ${vid}`);
            continue;
          }
          if (placement && !placement.variantIds.includes(vid)) add('PLACEMENT_VARIANT', at, `${ref.questId}의 배치가 ${vid}를 이 설치물에 놓지 않았어요`);
          if (twin && !twin.variantIds.includes(vid)) add('TWIN_VARIANT', at, `${ref.questId}의 ${inst.panelTwin} 배치에 ${vid}가 없어요(W-2)`);
          if (inst.slotMap.kind === 'timelineStones') {
            validateTimelineVariant(inst, inst.slotMap, `${ref.questId}/${vid}`, v, add);
          } else if (inst.slotMap.kind === 'bellTree') {
            validateBellVariant(inst, inst.slotMap, `${ref.questId}/${vid}`, v, add);
          } else if (inst.slotMap.kind === 'staffField') {
            validateTerraceVariant(inst, inst.slotMap, `${ref.questId}/${vid}`, v, add);
          } else if (inst.slotMap.kind === 'keyBridge') {
            for (const m of bridgeVariantProblems(inst, v)) add('SLOTMAP_EVALUATOR', at, `${ref.questId}/${vid}: ${m}`);
          } else if (inst.slotMap.kind === 'orderedPitches') {
            const spec = v.evaluatorSpec;
            if (spec.type !== 'orderedScale') add('SLOTMAP_EVALUATOR', at, `${ref.questId}/${vid}의 판정기가 ${spec.type}인데 orderedPitches 변환표는 orderedScale만 이어요`);
            else {
              if (spec.voiceId !== inst.slotMap.voiceId) add('SLOTMAP_VOICE', at, `${ref.questId}/${vid}의 성부(${spec.voiceId})와 변환표의 성부(${inst.slotMap.voiceId})가 달라요`);
              if (spec.count !== inst.slots.length) add('SLOTMAP_COUNT', at, `${ref.questId}/${vid}는 음 ${spec.count}개인데 자리는 ${inst.slots.length}개예요`);
            }
          } else {
            // stageCells: 판정기는 scoreArrangement만, 성부는 바닥 줄 안에서, 마디 수는 바닥의 마디 칸 수와 같아야 한다
            const spec = v.evaluatorSpec;
            const { rows, measures } = inst.slotMap;
            if (spec.type !== 'scoreArrangement') add('SLOTMAP_EVALUATOR', at, `${ref.questId}/${vid}의 판정기가 ${spec.type}인데 stageCells 변환표는 scoreArrangement만 이어요`);
            else {
              for (const voice of spec.voices) if (!rows.some((r) => r.voiceId === voice.voiceId)) add('SLOTMAP_VOICE', at, `${ref.questId}/${vid}의 성부(${voice.voiceId})가 무대 바닥의 줄에 없어요`);
              const count = measureCountOf(v.score);
              if (count !== measures) add('SLOTMAP_COUNT', at, `${ref.questId}/${vid}는 ${count}마디인데 바닥의 마디 칸은 ${measures}개예요`);
            }
          }
        }
      }
    }
  }
  return issues;
}

/** 정거장에 놓인 설치물 */
export function installationOfStation(list: readonly InstallationDef[], stationCode: string): InstallationDef | undefined {
  return list.find((i) => i.stationCode === stationCode);
}

/** 설치물에서 고를 수 있는 과제와 판본 수(표지판에 쓴다) */
export function installationVariantCount(inst: InstallationDef): number {
  return inst.quests.reduce((n, q) => n + q.variantIds.length, 0);
}

// ───── 월드 좌표 ─────
// 돌(자리)이 월드의 어디에 있는지 묻는 순수 계산이다. 캐릭터의 위치는 여기서 '어느 돌 위인가'로만 읽히고, 판정기로는 넘어가지 않는다(W-3).

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 합주 무대(T7) 바닥의 글자가 칸 바깥에서 차지하는 자리(월드 px): 첫 줄 위의 마디 이름 띠와 첫 칸 왼쪽의 성부 이름 띠.
 * 월드가 글자를 그리는 자리와 카메라가 담는 자리가 어긋나지 않도록 한곳에 둔다.
 */
export const STAGE_LABEL_TOP = 48;
export const STAGE_LABEL_LEFT = 100;
/**
 * 무대 바닥을 담을 때 둘레에 남기는 여유(월드 px). 돌 설치물의 기본 여유(72)보다 작다: 바닥은 작고 칸이 낮아서,
 * 좁은 휴대폰 화면에서도 칸이 화면에서 48px 아래로 줄지 않게 한다(7.6).
 */
export const STAGE_FRAME_PAD = 20;
/** 무대 칸의 높이(64)가 화면에서 48px 이상이 되는 배율. 이보다 멀어지지 않는다(바닥이 다 들어오는 한도 안에서) */
export const STAGE_MIN_ZOOM = 0.75;

/** 카메라가 설치물을 담을 때의 조정값. 비어 있으면 기본값(여유 72, 배율은 화면 기본 배율 이하)이다 */
export interface FrameTuning {
  /** 둘레의 여유(월드 px) */
  pad?: number;
  /** 이 배율보다 멀어지지 않는다 */
  minZoom?: number;
  /** minZoom을 '사각형의 너비가 화면에 다 들어오는 한도'로 깎지 않는다: 가로로도 넓은 물레방아가 좁은 휴대폰에서도 칸 48 px를 지킨다 */
  strictMinZoom?: boolean;
}

/**
 * 징검다리(T2) 줄 한쪽의 박 번호 띠 두께(월드 px). 월드가 박 번호와 놓을 자리의 ▼를 그리는 자리라서 카메라도 함께 담는다.
 * 시간이 가로로 흐르는 줄(axis 'x')은 줄 위쪽, 세로로 흐르는 줄(axis 'y')은 줄 왼쪽에 있다.
 */
export const STONES_LABEL_TOP = 44;
/** 박 번호 띠의 맞은편에서 셋잇단 뗏목의 '3' 표시가 차지하는 띠 두께(월드 px). 박을 따라가는 카메라(확대형)가 함께 담는다 */
export const STONES_RAFT_BAND = 32;
/** 징검다리를 담을 때 둘레의 여유(월드 px). 줄은 얇고 길어서 좁은 화면에서는 여유를 줄여야 칸이 커진다 */
export const STONES_FRAME_PAD = 24;
/** 징검다리 한 칸(60 px)이 화면에서 48px 이상이 되는 배율(7.6). 줄이 화면에 다 들어오는 한도 안에서만 올린다 */
export const STONES_MIN_ZOOM = 0.8;
/** 누르는 칸 하나가 화면에서 이만큼(px)은 되어야 손가락이 빗나가지 않는다(7.6) */
export const MIN_CELL_ON_SCREEN = 48;

export function frameTuningOf(inst: { slotMap?: SlotMapDef }): FrameTuning {
  const map = inst.slotMap;
  if (map?.kind === 'stageCells') return { pad: STAGE_FRAME_PAD, minZoom: STAGE_MIN_ZOOM };
  // 칸의 px는 설치물이 정한다: 60 px 칸은 0.8(STONES_MIN_ZOOM), 물레방아의 80 px 칸은 0.6
  if (map?.kind === 'timelineStones') {
    const minZoom = MIN_CELL_ON_SCREEN / (map.cellTicks / map.ticksPerPx);
    // 바퀴(물레방아)는 가로로도 넓다(668 px). 폭 401 px 아래의 휴대폰에서 너비에 맞추면 칸이 48 px 아래로 줄어서, 배율을 지키고 가로로도 따라간다
    return map.wheel ? { pad: STONES_FRAME_PAD, minZoom, strictMinZoom: true } : { pad: STONES_FRAME_PAD, minZoom };
  }
  // 종나무: 고리 한 칸(80×72)이 화면에서 48 px 아래로 줄지 않는다. 빈터(나무 셋)는 가로로 넓어서 폭에 맞추지 않고 고른 나무를 따라간다
  if (map?.kind === 'bellTree') return { pad: BELL_FRAME_PAD, minZoom: MIN_CELL_ON_SCREEN / Math.min(BELL_CELL_W, BELL_CELL_H), strictMinZoom: true };
  // 계단밭: 온음계 한 칸(48 px)이 화면에서 48 px 아래로 줄지 않는다(7.3). 밭은 세로로 길어서 고른 열의 등을 따라간다
  if (map?.kind === 'staffField') return { pad: TERRACE_FRAME_PAD, minZoom: MIN_CELL_ON_SCREEN / TERRACE_STEP_PX, strictMinZoom: true };
  // 건반 다리: 흰 널 한 장(72 px)이 화면에서 48 px 아래로 줄지 않는다(7.6). 다리는 가로로 길어서(1080 px) 좁은 화면에서는 고른 널을 따라간다
  if (map?.kind === 'keyBridge') return { pad: BRIDGE_FRAME_PAD, minZoom: BRIDGE_MIN_ZOOM, strictMinZoom: true };
  return {};
}

/**
 * 돌 전체를 감싸는 가장 작은 사각형(카메라가 설치물 전체를 담을 때 쓴다).
 * 무대 바닥(stageCells)이면 마디 이름과 성부 이름이 놓이는 띠까지, 징검다리(timelineStones)이면 박 번호가 놓이는 띠
 * (가로 줄은 위쪽, 세로 줄은 왼쪽)까지 담는다. 물레방아이면 바퀴까지 함께 담는다.
 */
export function slotBounds(inst: Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef }): WorldRect {
  // 계단밭은 위쪽 열 번호 띠와 왼쪽 음자리표 조각상 띠까지 담는다(terrace.ts)
  if (inst.slotMap?.kind === 'staffField') return terraceBounds(inst);
  // 건반 다리는 위쪽 띠(이름표·밧줄·깃발·표지판)와 아래쪽 띠(흰 널 이름)까지 담는다(keyBridge.ts)
  if (inst.slotMap?.kind === 'keyBridge') return bridgeBounds(inst);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of inst.slots) {
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x + s.w);
    y1 = Math.max(y1, s.y + s.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  if (inst.slotMap?.kind === 'stageCells') {
    x0 -= STAGE_LABEL_LEFT;
    y0 -= STAGE_LABEL_TOP;
  }
  if (inst.slotMap?.kind === 'bellTree') {
    x0 -= BELL_LABEL_LEFT;
    y0 -= BELL_LABEL_TOP;
  }
  if (inst.slotMap?.kind === 'timelineStones') {
    if (inst.slotMap.axis === 'y') x0 -= STONES_LABEL_TOP;
    else y0 -= STONES_LABEL_TOP;
    // 물레방아: 바퀴도 함께 담는다
    const wheel = inst.slotMap.wheel;
    if (wheel) {
      x0 = Math.min(x0, wheel.cx - wheel.r);
      y0 = Math.min(y0, wheel.cy - wheel.r);
      x1 = Math.max(x1, wheel.cx + wheel.r);
      y1 = Math.max(y1, wheel.cy + wheel.r);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 월드의 한 점이 어느 돌 위인가(1부터). 돌 사각형을 slop만큼 넓혀서 본다. 여러 돌이 걸리면 가운데가 가장 가까운 돌이다.
 * 밟기는 slop 0(발이 돌 안에 있어야 한다), 누르기는 돌 사이 틈의 절반쯤을 slop으로 줘서 손가락이 빗나가도 가까운 돌이 눌린다.
 */
export function slotAtPoint(inst: Pick<InstallationDef, 'slots'>, x: number, y: number, slop = 0): number | null {
  let best: number | null = null;
  let bestKey: [number, number, number] = [Infinity, Infinity, Infinity];
  for (const s of inst.slots) {
    if (x < s.x - slop || x > s.x + s.w + slop || y < s.y - slop || y > s.y + s.h + slop) continue;
    // 사각형 안에 있는 돌이 먼저, 그다음 넓이가 작은 돌(건반 다리의 검은 널은 흰 널 위에 선다), 그다음 가운데가 가까운 돌
    const inside = x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
    const key: [number, number, number] = [inside ? 0 : 1, s.w * s.h, Math.hypot(s.x + s.w / 2 - x, s.y + s.h / 2 - y)];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = s.slot;
      bestKey = key;
    }
  }
  return best;
}

/** 돌의 가운데(월드 px) */
export function slotCenter(rect: SlotRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
