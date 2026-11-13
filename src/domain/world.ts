// 월드의 수치, 지역, 정거장 (설계서 3장, 부록 A.4, B.1). 순수 데이터와 계산만 둔다.
// 화면 좌표나 프레임 시간을 모른다(W-3). 월드 좌표는 모두 월드 px이다.
import type { ContentIssue } from './content';

// ───── 3.1 기본 수치 ─────
export const TILE = 32;
export const WORLD_TILES_X = 256;
export const WORLD_TILES_Y = 192;
export const WORLD_W = WORLD_TILES_X * TILE; // 8192
export const WORLD_H = WORLD_TILES_Y * TILE; // 6144
/** 바닥 조각 한 변(10.5). 8×6 = 48장 */
export const CHUNK_SIZE = 1024;
export const CHUNK_COLS = WORLD_W / CHUNK_SIZE;
export const CHUNK_ROWS = WORLD_H / CHUNK_SIZE;
/**
 * 조각 둘레에 이웃 조각의 그림을 이만큼(px) 더 구워 둔다. 화면 배율이 소수일 때 조각 경계에 뒤쪽 배경이 비쳐 보이는 이음선을 막는다.
 * 그려진 파일은 (CHUNK_SIZE + 2 × CHUNK_PAD) 한 변이고, 월드에서는 조각 원점에서 CHUNK_PAD만큼 바깥에서 시작해 1:1로 그린다.
 */
export const CHUNK_PAD = 2;
/** 악보 지도 배경 그림(overview.webp)의 크기: 월드를 1/4로 줄인 2048×1536 px(10.5). 월드 px당 0.25 그림 px이다 */
export const OVERVIEW_SCALE = 0.25;
export const OVERVIEW_W = WORLD_W * OVERVIEW_SCALE;
export const OVERVIEW_H = WORLD_H * OVERVIEW_SCALE;
/** 걷는 속도. 한 가지(7.2) */
export const WALK_SPEED = 220;
/** 몸 크기: 반지름 14 px의 원(7.2) */
export const BODY_RADIUS = 14;
/** 사물에서 이 거리 안에 들어오면 이름과 안내 칩이 뜬다(7.4) */
export const INTERACT_RANGE = 96;
/** 시작 위치(3.3, 시안의 (464, 488)) */
export const PLAYER_START = { x: 3984, y: 3480 } as const;

/** 캐릭터가 바라보는 방향(7.2) */
export type Facing = 'up' | 'down' | 'left' | 'right';

export const REGION_IDS = ['village', 'staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export const isRegionId = (v: unknown): v is RegionId => typeof v === 'string' && (REGION_IDS as readonly string[]).includes(v);

/** 칸 번호로 쓴 범위. 끝 칸을 포함한다(부록 A.4) */
export interface TileBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type StationKind = 'panel' | 'installation';
/** 정거장이 아닌, 다가가서 열 수 있는 자리: 발견 요소(소리 조각, 개념 쪽지, 3.6), 광장 게시판(6.1), 주민(악사, 1.5, 7-6) */
export type SpotKind = 'discovery' | 'board' | 'resident';
/** 'panel'은 작업대(패널로 여는 정거장). T1–T7은 설치물 원형(4장) */
export type StationArchetype = 'panel' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';
const ARCHETYPES: readonly string[] = ['panel', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export interface Station {
  stationId: string;
  name: string;
  regionId: RegionId;
  kind: StationKind;
  archetype: StationArchetype;
  /** 정거장 좌표(B.1). 지도에 찍히는 점이자 안내 칩의 중심이다 */
  x: number;
  y: number;
  /** 서는 자리. 정거장 점이 물 위처럼 설 수 없는 곳일 때만 따로 적는다. 없으면 (x, y)이다 */
  stand?: { x: number; y: number };
  /** 놓인 과제 id(부록 A.0). 아직 만들지 않은 과제도 적혀 있다 */
  questIds: string[];
}

/** 안내 칩의 글(7.4). 예: "음계 디딤돌 · E 또는 누르기". 키보드가 없는 터치 화면에서는 "누르기"만 쓴다 */
export function chipText(name: string, touchOnly = false): string {
  return touchOnly ? `${name} · 누르기` : `${name} · E 또는 누르기`;
}

/** 정거장 앞에 서는 자리 */
export const standOf = (s: Pick<Station, 'x' | 'y' | 'stand'>): { x: number; y: number } => s.stand ?? { x: s.x, y: s.y };

/** 서는 자리는 정거장 점에서 이 거리(px) 안에 둔다 */
export const MAX_STAND_OFFSET = 400;

export interface Landmark {
  name: string;
  x: number;
  y: number;
}

export interface RegionDef {
  regionId: RegionId;
  name: string;
  boundsTiles: TileBounds;
  accentColor: string;
  ensemblePart: string;
  layerThresholds: [number, number, number];
  ambientBedId: string;
  landmark: Landmark;
  stations: Station[];
}

/** 지역의 범위(월드 px). 오른쪽과 아래쪽 끝은 포함하지 않는다 */
export function regionBoundsPx(r: Pick<RegionDef, 'boundsTiles'>): { x0: number; y0: number; x1: number; y1: number } {
  const b = r.boundsTiles;
  return { x0: b.x0 * TILE, y0: b.y0 * TILE, x1: (b.x1 + 1) * TILE, y1: (b.y1 + 1) * TILE };
}

// ───── 부록 A.0: 과제 번호와 id ─────
/** 월드에 놓일 과제 31개의 id와 제안 제목(5장). 만들지 않은 과제는 '준비 중'으로 보인다(W-10) */
export const PLANNED_QUESTS: Readonly<Record<string, { number: string; title: string }>> = {
  'pitch.same-note-two-clefs': { number: 'Q01', title: '같은 음의 자리 찾기' },
  'rhythm.rest-in-a-bar': { number: 'Q02', title: '쉼이 있는 한 마디' },
  'rhythm.short-notes-and-triplets': { number: 'Q03', title: '짧은 음과 셋잇단음' },
  'pitch.same-sound-different-names': { number: 'Q04', title: '같은 높이의 다른 이름' },
  'chord.major-triad': { number: 'Q05', title: '장3화음 조립하기' },
  'chord.inversion': { number: 'Q06', title: '베이스를 바꾸어 전위 만들기' },
  'scale.major': { number: 'Q07', title: '장음계 배열하기' },
  'song.short-piece': { number: 'Q08', title: '선택한 짧은 곡 완성하기' },
  'staff.lines-and-spaces': { number: 'Q09', title: '줄과 칸' },
  'staff.ledger-lines': { number: 'Q10', title: '덧줄 위의 음' },
  'staff.middle-c-neighbors': { number: 'Q11', title: '가운데 턱의 이웃' },
  'staff.range-ladder': { number: 'Q12', title: '음역 사다리' },
  'rhythm.three-four': { number: 'Q13', title: '세 박 징검다리' },
  'rhythm.note-values': { number: 'Q14', title: '긴 돌 짧은 돌' },
  'rhythm.dotted': { number: 'Q15', title: '점이 붙은 돌' },
  'rhythm.rest-lengths': { number: 'Q16', title: '쉼표의 길이' },
  'rhythm.sixteenths': { number: 'Q17', title: '잘게 쪼갠 물결' },
  'rhythm.triplets': { number: 'Q18', title: '셋으로 나눈 물살' },
  'rhythm.six-eight': { number: 'Q19', title: '여섯 박 물레방아' },
  'chord.major-and-minor': { number: 'Q20', title: '밝은 종 어두운 종' },
  'chord.primary-triads': { number: 'Q21', title: '다장조의 세 기둥' },
  'chord.diminished-augmented': { number: 'Q22', title: '줄어든 종 늘어난 종' },
  'chord.progression-walk': { number: 'Q23', title: '화음 이어 걷기' },
  'scale.natural-minor': { number: 'Q24', title: '자연단음계' },
  'scale.harmonic-minor': { number: 'Q25', title: '화성단음계' },
  'scale.pentatonic': { number: 'Q26', title: '다섯 음 음계' },
  'key.black-key-names': { number: 'Q27', title: '검은 건반의 이름' },
  'key.whole-and-half-steps': { number: 'Q28', title: '온음과 반음' },
  'key.build-intervals': { number: 'Q29', title: '음정 쌓기' },
  'key.accidentals-in-a-bar': { number: 'Q30', title: '한 마디 안의 임시표' },
  'scale.chromatic': { number: 'Q31', title: '반음계' },
};

// ───── 읽기와 검사 ─────
const HEX = /^#[0-9A-Fa-f]{6}$/;
const STATION_ID = /^[HNEWSK][1-9]$/;

type Issues = ContentIssue[];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 지역 파일 하나를 읽는다. 형식이 틀리면 문제 목록을 돌려주고 지역은 null이다 */
export function parseRegion(raw: unknown, file: string): { region: RegionDef | null; issues: Issues } {
  const issues: Issues = [];
  const add = (code: string, path: string, message: string): void => void issues.push({ code, path: `${file}${path}`, message });
  if (!isObj(raw)) {
    add('SHAPE', '', '지역 파일은 객체여야 해요');
    return { region: null, issues };
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

  const regionId = str('regionId');
  if (regionId && !isRegionId(regionId)) add('REGION_ID', '.regionId', `알 수 없는 지역 id예요: ${regionId}`);
  const name = str('name');
  const accentColor = str('accentColor');
  if (accentColor && !HEX.test(accentColor)) add('COLOR', '.accentColor', `색은 #RRGGBB 형식이어야 해요: ${accentColor}`);
  const ensemblePart = str('ensemblePart');
  const ambientBedId = str('ambientBedId');

  const bt = raw['boundsTiles'];
  let boundsTiles: TileBounds = { x0: 0, x1: 0, y0: 0, y1: 0 };
  if (!isObj(bt)) add('SHAPE', '.boundsTiles', 'boundsTiles는 {x0, x1, y0, y1}이어야 해요');
  else {
    boundsTiles = { x0: num('x0', bt, '.boundsTiles'), x1: num('x1', bt, '.boundsTiles'), y0: num('y0', bt, '.boundsTiles'), y1: num('y1', bt, '.boundsTiles') };
    const { x0, x1, y0, y1 } = boundsTiles;
    if (![x0, x1, y0, y1].every(Number.isInteger) || x0 < 0 || y0 < 0 || x1 < x0 || y1 < y0 || x1 >= WORLD_TILES_X || y1 >= WORLD_TILES_Y) add('BOUNDS', '.boundsTiles', `범위가 월드(${WORLD_TILES_X}×${WORLD_TILES_Y}칸) 안의 정수 칸이어야 해요`);
  }

  const lt = raw['layerThresholds'];
  let layerThresholds: [number, number, number] = [1, 2, 3];
  if (!Array.isArray(lt) || lt.length !== 3 || !lt.every((n) => Number.isInteger(n) && (n as number) >= 1) || !(lt[0] < lt[1] && lt[1] < lt[2])) add('SHAPE', '.layerThresholds', 'layerThresholds는 1 이상의 늘어나는 정수 세 개여야 해요');
  else layerThresholds = [lt[0], lt[1], lt[2]] as [number, number, number];

  const lm = raw['landmark'];
  let landmark: Landmark = { name: '', x: 0, y: 0 };
  if (!isObj(lm)) add('SHAPE', '.landmark', 'landmark는 {name, x, y}이어야 해요');
  else landmark = { name: str('name', lm, '.landmark'), x: num('x', lm, '.landmark'), y: num('y', lm, '.landmark') };

  const stations: Station[] = [];
  const st = raw['stations'];
  if (!Array.isArray(st) || st.length === 0) add('SHAPE', '.stations', 'stations는 비어 있지 않은 목록이어야 해요');
  else {
    st.forEach((s, i) => {
      const p = `.stations[${i}]`;
      if (!isObj(s)) return add('SHAPE', p, '정거장은 객체여야 해요');
      const stationId = str('stationId', s, p);
      if (stationId && !STATION_ID.test(stationId)) add('STATION_ID', `${p}.stationId`, `정거장 id는 H1, N2처럼 써야 해요: ${stationId}`);
      const kind = s['kind'];
      if (kind !== 'panel' && kind !== 'installation') add('SHAPE', `${p}.kind`, "kind는 'panel' 또는 'installation'이에요");
      const archetype = s['archetype'];
      if (typeof archetype !== 'string' || !ARCHETYPES.includes(archetype)) add('SHAPE', `${p}.archetype`, `archetype은 ${ARCHETYPES.join(', ')} 중 하나예요`);
      else if ((kind === 'panel') !== (archetype === 'panel')) add('SHAPE', `${p}.archetype`, "kind가 panel일 때만 archetype도 'panel'이에요");
      const qids = s['questIds'];
      if (!Array.isArray(qids) || !qids.every((q) => typeof q === 'string')) add('SHAPE', `${p}.questIds`, 'questIds는 글자 목록이어야 해요');
      const standRaw = s['stand'];
      let stand: { x: number; y: number } | undefined;
      if (standRaw !== undefined) {
        if (!isObj(standRaw)) add('SHAPE', `${p}.stand`, 'stand는 {x, y}이어야 해요');
        else stand = { x: num('x', standRaw, `${p}.stand`), y: num('y', standRaw, `${p}.stand`) };
      }
      stations.push({
        stationId,
        name: str('name', s, p),
        regionId: regionId as RegionId,
        kind: kind === 'panel' ? 'panel' : 'installation',
        archetype: (typeof archetype === 'string' && ARCHETYPES.includes(archetype) ? archetype : 'panel') as StationArchetype,
        x: num('x', s, p),
        y: num('y', s, p),
        questIds: Array.isArray(qids) ? (qids.filter((q) => typeof q === 'string') as string[]) : [],
        ...(stand ? { stand } : {}),
      });
    });
  }
  if (issues.length > 0) return { region: null, issues };
  return { region: { regionId: regionId as RegionId, name, boundsTiles, accentColor, ensemblePart, layerThresholds, ambientBedId, landmark, stations }, issues };
}

/** 여섯 지역이 월드를 빈틈과 겹침 없이 채우는지, 정거장이 제 지역 안에 있는지 같은 연결을 검사한다 */
export function validateRegionSet(regions: readonly RegionDef[]): ContentIssue[] {
  const issues: Issues = [];
  const add = (code: string, path: string, message: string): void => void issues.push({ code, path, message });
  const ids = new Set<string>();
  for (const r of regions) {
    if (ids.has(r.regionId)) add('DUP_REGION', r.regionId, `지역 id가 겹쳐요: ${r.regionId}`);
    ids.add(r.regionId);
  }
  for (const id of REGION_IDS) if (!ids.has(id)) add('MISSING_REGION', id, `지역 파일이 없어요: ${id}`);

  // 칸마다 지역이 하나씩만 덮는지
  const cover = new Uint8Array(WORLD_TILES_X * WORLD_TILES_Y);
  for (const r of regions) {
    const b = r.boundsTiles;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) cover[y * WORLD_TILES_X + x] = (cover[y * WORLD_TILES_X + x] ?? 0) + 1;
  }
  let gaps = 0;
  let overlaps = 0;
  cover.forEach((n) => {
    if (n === 0) gaps++;
    else if (n > 1) overlaps++;
  });
  if (gaps > 0) add('REGION_GAP', 'regions', `어느 지역에도 속하지 않는 칸이 ${gaps}개 있어요`);
  if (overlaps > 0) add('REGION_OVERLAP', 'regions', `두 지역이 겹치는 칸이 ${overlaps}개 있어요`);

  const stationIds = new Set<string>();
  for (const r of regions) {
    const b = regionBoundsPx(r);
    for (const s of r.stations) {
      if (stationIds.has(s.stationId)) add('DUP_STATION', s.stationId, `정거장 id가 겹쳐요: ${s.stationId}`);
      stationIds.add(s.stationId);
      if (!(s.x >= b.x0 && s.x < b.x1 && s.y >= b.y0 && s.y < b.y1)) add('STATION_OUTSIDE', s.stationId, `${s.stationId}(${s.x}, ${s.y})가 ${r.name} 범위 밖에 있어요`);
      if (!s.stationId.startsWith(STATION_PREFIX[r.regionId])) add('STATION_PREFIX', s.stationId, `${r.name}의 정거장 id는 ${STATION_PREFIX[r.regionId]}로 시작해요`);
      for (const q of s.questIds) {
        if (!(q in PLANNED_QUESTS)) add('UNKNOWN_QUEST', s.stationId, `${s.stationId}에 적힌 과제 id를 모르겠어요: ${q}`);
      }
      if (s.stand) {
        if (!(s.stand.x >= b.x0 && s.stand.x < b.x1 && s.stand.y >= b.y0 && s.stand.y < b.y1)) add('STAND_OUTSIDE', s.stationId, `${s.stationId}의 서는 자리(${s.stand.x}, ${s.stand.y})가 ${r.name} 범위 밖에 있어요`);
        if (Math.hypot(s.stand.x - s.x, s.stand.y - s.y) > MAX_STAND_OFFSET) add('STAND_FAR', s.stationId, `${s.stationId}의 서는 자리가 정거장 점에서 ${MAX_STAND_OFFSET} px보다 멀어요`);
      }
    }
    if (!(r.landmark.x >= b.x0 && r.landmark.x < b.x1 && r.landmark.y >= b.y0 && r.landmark.y < b.y1)) add('LANDMARK_OUTSIDE', r.regionId, `${r.name}의 표지(${r.landmark.x}, ${r.landmark.y})가 범위 밖이에요`);
  }
  return issues;
}

const STATION_PREFIX: Record<RegionId, string> = { village: 'H', 'staff-hill': 'N', 'beat-river': 'E', 'bell-grove': 'W', 'scale-trail': 'S', 'key-marsh': 'K' };

// ───── 지역과 정거장 찾기 ─────
export class WorldMap {
  readonly regions: readonly RegionDef[];
  private readonly byId = new Map<RegionId, RegionDef>();
  private readonly stationById = new Map<string, Station>();

  constructor(regions: readonly RegionDef[]) {
    this.regions = [...regions].sort((a, b) => REGION_IDS.indexOf(a.regionId) - REGION_IDS.indexOf(b.regionId));
    for (const r of this.regions) {
      this.byId.set(r.regionId, r);
      for (const s of r.stations) this.stationById.set(s.stationId, s);
    }
  }

  region(id: RegionId): RegionDef {
    const r = this.byId.get(id);
    if (!r) throw new Error(`지역이 없어요: ${id}`);
    return r;
  }

  get stations(): Station[] {
    return this.regions.flatMap((r) => r.stations);
  }

  station(id: string): Station | undefined {
    return this.stationById.get(id);
  }

  /** 점이 놓인 지역. 월드 밖이면 가장 가까운 가장자리의 지역을 쓴다 */
  regionAt(x: number, y: number): RegionDef {
    const cx = Math.min(Math.max(x, 0), WORLD_W - 1);
    const cy = Math.min(Math.max(y, 0), WORLD_H - 1);
    for (const r of this.regions) {
      const b = regionBoundsPx(r);
      if (cx >= b.x0 && cx < b.x1 && cy >= b.y0 && cy < b.y1) return r;
    }
    throw new Error(`어느 지역에도 속하지 않는 점이에요: (${x}, ${y})`);
  }

  /** 과제가 놓인 정거장들(월드 어디에 있는지 보여 줄 때) */
  stationsForQuest(questId: string): Station[] {
    return this.stations.filter((s) => s.questIds.includes(questId));
  }

  /** 지역의 정거장에 놓인 과제 id들(목록을 지역으로 거를 때). 같은 과제가 여러 지역에 놓일 수 있다 */
  questIdsInRegion(id: RegionId): ReadonlySet<string> {
    return new Set(this.region(id).stations.flatMap((s) => s.questIds));
  }

  /** 점에서 가장 가까운 정거장(정거장 점 기준). 정거장이 없으면 undefined */
  nearestStation(x: number, y: number): Station | undefined {
    let best: Station | undefined;
    let bestD = Infinity;
    for (const s of this.stations) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }
}
