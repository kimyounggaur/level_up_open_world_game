// 5-6 발견 요소(설계서 3.6): 소리 조각(한 마디짜리 가락)과 개념 쪽지(짧은 설명 표지)를 읽고 검사한다.
// 발견 요소는 판정이 없고 과제 접근과 무관하다(W-5): 찾아도 아무것도 열리거나 닫히지 않는다. 한번 찾으면 사라지지 않는다(W-6).
// 이 파일은 좌표, 음, 글만 다룬다. 길과 '걸어서 닿는 곳'은 검사할 때 부르는 쪽(tools)이 넘겨 준다(domain은 월드 파일을 모른다).
import type { Channel } from './catalog';
import type { Availability, ContentIssue, ReviewStatus, RightsStatus } from './content';
import type { Playback } from './playback';
import { hasBatchim } from './feedback';
import { PAD_COUNT_MAX, PAD_COUNT_MIN, PAD_MIDI_MAX, PAD_MIDI_MIN, PAD_GAP, PAD_RADIUS, PAD_SPREAD_MAX, PLAY_GROUNDS, PLAY_ID_RE, PLAY_INSTRUMENTS_PER_OUTER_REGION, PLAY_TIMBRES, padSitesOf } from './play';
import type { PadDef, PlayGround, PlayInstrumentDef, PlayTimbre } from './play';
import type { LanternState } from './reaction';
import { REGION_IDS, isRegionId } from './world';
import type { RegionId, SpotKind } from './world';

// ───── 설계서 3.6의 수치 ─────
/** 지역마다 소리 조각 6, 개념 쪽지 3 */
export const SOUND_PIECES_PER_REGION = 6;
export const CONCEPT_NOTES_PER_REGION = 3;
/** 발견 요소끼리는 이만큼(px) 이상 떨어뜨린다(배치 규칙 2) */
export const MIN_SPACING = 500;
/** 길에서 이 거리 안이면 '길 가까이'다(배치 규칙 1). 길 가까이 60%, 길 밖 40% */
export const ROAD_NEAR = 300;
export const ROAD_SHARE_TARGET = 0.6;
/** 정수로 나눌 수 있는 개수는 한정되어 있어서(9개면 5.4개) 목표에서 이만큼까지 벗어나도 지킨 것으로 본다 */
export const ROAD_SHARE_TOLERANCE = 0.1;
/** 소리 조각이 들리기 시작하는 거리(배치 규칙 3) */
export const PIECE_HEAR_RADIUS = 600;
/** 막다른 샛길의 끝에서 이 거리 안에 발견 요소가 있어야 한다(길을 놓는 규칙 2) */
export const DEAD_END_RADIUS = 200;
/** 이 거리 안에 문이 있는 길 끝은 지역을 나가는 길이지 막다른 길이 아니다 */
export const GATE_RADIUS = 250;

// ───── 소리 조각의 틀(배치 규칙 4) ─────
export const PIECE_PPQ = 960;
/** 4/4 한 마디 */
export const PIECE_BAR_TICKS = 3840;
export const PIECE_TEMPO_BPM = 80;
/** 다장조 5음 음계: C D E G A */
export const PENTATONIC_PITCH_CLASSES: readonly number[] = [0, 2, 4, 7, 9];
/** 쓸 수 있는 길이: 8분음표, 4분음표, 2분음표, 온음표. 자유 가락의 칸(8분음표)에 그대로 놓이는 길이다 */
export const PIECE_DURATIONS: readonly number[] = [480, 960, 1920, 3840];
export const PIECE_MAX_NOTES = 8;
export const NOTE_TEXT_MAX = 140;
export const NAME_MAX = 20;

const ID_RE = /^disc\.([a-z0-9-]+)\.(piece|note)-(\d+)$/;

export type DiscoveryKind = 'soundPiece' | 'conceptNote';

export interface Point {
  x: number;
  y: number;
}

/** 소리 조각의 음 하나. 마디 처음부터 센 틱이다 */
export interface PieceNote {
  midi: number;
  onsetTicks: number;
  durationTicks: number;
}

export interface TextbookRef {
  sourceFileId: string;
  originalFilename: string;
  reviewStatus: ReviewStatus;
  rightsStatus: RightsStatus;
}

interface DiscoveryBase {
  discoveryId: string;
  regionId: RegionId;
  /** 수첩과 안내 칩에 쓰는 이름 */
  name: string;
  /** 월드 px */
  x: number;
  y: number;
  /** 과제와 같은 공개 규칙: draft는 미리보기에서만 보인다(11.1) */
  availability: Availability;
  reviewStatus: ReviewStatus;
  rightsStatus: RightsStatus;
}

export interface SoundPieceDef extends DiscoveryBase {
  kind: 'soundPiece';
  notes: PieceNote[];
}

export interface ConceptNoteDef extends DiscoveryBase {
  kind: 'conceptNote';
  /** 짧은 설명 */
  text: string;
  /** 이 쪽지가 잇는 과제(수첩에서 그 과제로 간다) */
  questId: string;
  /** 교재의 해당 쪽(11.4 출처·권리 대장) */
  textbookRefs: TextbookRef[];
}

export type DiscoveryDef = SoundPieceDef | ConceptNoteDef;

export interface DiscoveryFile {
  regionId: RegionId;
  items: DiscoveryDef[];
  /** 놀이 악기(3.5): 바깥 지역마다 하나, 마을에는 없다. 파일에 적지 않았으면 없다(6-9c) */
  playInstruments?: PlayInstrumentDef[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const REVIEW: readonly string[] = ['unreviewed', 'reviewed', 'needsCorrection'];
const RIGHTS: readonly string[] = ['unconfirmed', 'confirmed', 'blocked'];

/** 글자 수(한글 한 글자도 하나로 센다) */
export const lengthOf = (s: string): number => [...s].length;

// ───── 읽기 ─────

/** 발견 요소 파일 하나를 읽는다. 형식이 틀리면 문제 목록을 돌려주고 file은 null이다 */
export function parseDiscoveryFile(raw: unknown, file: string): { file: DiscoveryFile | null; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string): void => void issues.push({ code, path: `${file}${path}`, message });
  if (!isObj(raw)) {
    add('SHAPE', '', '발견 요소 파일은 객체여야 해요');
    return { file: null, issues };
  }
  const regionId = raw['regionId'];
  if (!isStr(regionId) || !isRegionId(regionId)) {
    add('REGION_ID', '.regionId', `알 수 없는 지역 id예요: ${String(regionId)}`);
    return { file: null, issues };
  }
  const list = raw['items'];
  if (!Array.isArray(list)) {
    add('SHAPE', '.items', 'items는 목록이어야 해요');
    return { file: null, issues };
  }
  const items: DiscoveryDef[] = [];
  list.forEach((entry, i) => {
    const p = `.items[${i}]`;
    if (!isObj(entry)) return add('SHAPE', p, '발견 요소는 객체여야 해요');
    const problems = issues.length;
    const discoveryId = entry['discoveryId'];
    const kind = entry['kind'];
    const name = entry['name'];
    const x = entry['x'];
    const y = entry['y'];
    if (!isStr(discoveryId) || !ID_RE.test(discoveryId)) add('ID_FORMAT', `${p}.discoveryId`, `discoveryId는 disc.village.piece-1 같은 형식이어야 해요: ${String(discoveryId)}`);
    if (kind !== 'soundPiece' && kind !== 'conceptNote') add('KIND', `${p}.kind`, "kind는 'soundPiece' 또는 'conceptNote'예요");
    if (!isStr(name) || lengthOf(name) > NAME_MAX) add('SHAPE', `${p}.name`, `name은 ${NAME_MAX}자 이하의 글자여야 해요`);
    if (!isNum(x) || !isNum(y)) add('SHAPE', `${p}`, 'x, y는 숫자여야 해요');
    const availability = entry['availability'];
    if (availability !== 'draft' && availability !== 'published') add('SHAPE', `${p}.availability`, "availability는 'draft' 또는 'published'예요");
    const reviewStatus = entry['reviewStatus'];
    const rightsStatus = entry['rightsStatus'];
    if (typeof reviewStatus !== 'string' || !REVIEW.includes(reviewStatus)) add('SHAPE', `${p}.reviewStatus`, 'reviewStatus가 올바르지 않아요');
    if (typeof rightsStatus !== 'string' || !RIGHTS.includes(rightsStatus)) add('SHAPE', `${p}.rightsStatus`, 'rightsStatus가 올바르지 않아요');
    if (issues.length > problems) return;
    const base: DiscoveryBase = {
      discoveryId: discoveryId as string,
      regionId,
      name: (name as string).trim(),
      x: x as number,
      y: y as number,
      availability: availability as Availability,
      reviewStatus: reviewStatus as ReviewStatus,
      rightsStatus: rightsStatus as RightsStatus,
    };
    if (kind === 'soundPiece') {
      const notes = entry['notes'];
      if (!Array.isArray(notes)) return add('SHAPE', `${p}.notes`, 'notes는 목록이어야 해요');
      const out: PieceNote[] = [];
      notes.forEach((n, k) => {
        if (!isObj(n) || !isNum(n['midi']) || !isNum(n['onsetTicks']) || !isNum(n['durationTicks'])) return add('SHAPE', `${p}.notes[${k}]`, '음은 {midi, onsetTicks, durationTicks}여야 해요');
        out.push({ midi: n['midi'], onsetTicks: n['onsetTicks'], durationTicks: n['durationTicks'] });
      });
      items.push({ ...base, kind: 'soundPiece', notes: out });
      return;
    }
    const text = entry['text'];
    const questId = entry['questId'];
    const refs = entry['textbookRefs'];
    if (!isStr(text)) return add('SHAPE', `${p}.text`, 'text는 글자여야 해요');
    if (!isStr(questId)) return add('SHAPE', `${p}.questId`, 'questId는 글자여야 해요');
    if (!Array.isArray(refs)) return add('SHAPE', `${p}.textbookRefs`, 'textbookRefs는 목록이어야 해요');
    const textbookRefs: TextbookRef[] = [];
    refs.forEach((r, k) => {
      const rp = `${p}.textbookRefs[${k}]`;
      if (!isObj(r) || !isStr(r['sourceFileId']) || !isStr(r['originalFilename'])) return add('SHAPE', rp, 'sourceFileId와 originalFilename이 있어야 해요');
      const rs = r['reviewStatus'];
      const rr = r['rightsStatus'];
      if (typeof rs !== 'string' || !REVIEW.includes(rs) || typeof rr !== 'string' || !RIGHTS.includes(rr)) return add('SHAPE', rp, 'reviewStatus와 rightsStatus가 올바르지 않아요');
      textbookRefs.push({ sourceFileId: r['sourceFileId'], originalFilename: r['originalFilename'], reviewStatus: rs as ReviewStatus, rightsStatus: rr as RightsStatus });
    });
    items.push({ ...base, kind: 'conceptNote', text: text.trim(), questId, textbookRefs });
  });
  // 놀이 악기(6-9c): 적지 않은 파일은 놀이 악기가 없는 파일이다
  let playInstruments: PlayInstrumentDef[] | undefined;
  const playRaw = raw['playInstruments'];
  if (playRaw !== undefined) {
    if (!Array.isArray(playRaw)) add('SHAPE', '.playInstruments', 'playInstruments는 목록이어야 해요');
    else {
      const parsed: PlayInstrumentDef[] = [];
      playRaw.forEach((entry, i) => {
        const inst = parsePlayInstrument(entry, `.playInstruments[${i}]`, regionId, add);
        if (inst) parsed.push(inst);
      });
      playInstruments = parsed;
    }
  }
  return { file: issues.length > 0 ? null : { regionId, items, ...(playInstruments ? { playInstruments } : {}) }, issues };
}

/** 놀이 악기 하나를 읽는다. 형식이 틀리면 문제를 적고 null이다 */
function parsePlayInstrument(entry: unknown, p: string, regionId: RegionId, add: (code: string, path: string, message: string) => void): PlayInstrumentDef | null {
  if (!isObj(entry)) {
    add('SHAPE', p, '놀이 악기는 객체여야 해요');
    return null;
  }
  let ok = true;
  const bad = (code: string, path: string, message: string): void => {
    ok = false;
    add(code, path, message);
  };
  const playId = entry['playId'];
  const name = entry['name'];
  const x = entry['x'];
  const y = entry['y'];
  const timbre = entry['timbre'];
  const echo = entry['echo'];
  const ground = entry['ground'];
  if (!isStr(playId) || !PLAY_ID_RE.test(playId)) bad('ID_FORMAT', `${p}.playId`, `playId는 play.beat-river.drum 같은 형식이어야 해요: ${String(playId)}`);
  if (!isStr(name) || lengthOf(name) > NAME_MAX) bad('SHAPE', `${p}.name`, `name은 ${NAME_MAX}자 이하의 글자여야 해요`);
  if (!isNum(x) || !isNum(y)) bad('SHAPE', p, 'x, y는 숫자여야 해요');
  if (typeof timbre !== 'string' || !(PLAY_TIMBRES as readonly string[]).includes(timbre)) bad('PLAY_TIMBRE', `${p}.timbre`, `timbre는 ${PLAY_TIMBRES.join(', ')} 중 하나예요: ${String(timbre)}`);
  if (echo !== undefined && typeof echo !== 'boolean') bad('SHAPE', `${p}.echo`, 'echo는 true나 false예요');
  if (ground !== undefined && (typeof ground !== 'string' || !(PLAY_GROUNDS as readonly string[]).includes(ground))) bad('SHAPE', `${p}.ground`, `ground는 ${PLAY_GROUNDS.join(', ')} 중 하나예요`);
  const availability = entry['availability'];
  const reviewStatus = entry['reviewStatus'];
  const rightsStatus = entry['rightsStatus'];
  if (availability !== 'draft' && availability !== 'published') bad('SHAPE', `${p}.availability`, "availability는 'draft' 또는 'published'예요");
  if (typeof reviewStatus !== 'string' || !REVIEW.includes(reviewStatus)) bad('SHAPE', `${p}.reviewStatus`, 'reviewStatus가 올바르지 않아요');
  if (typeof rightsStatus !== 'string' || !RIGHTS.includes(rightsStatus)) bad('SHAPE', `${p}.rightsStatus`, 'rightsStatus가 올바르지 않아요');
  const padsRaw = entry['pads'];
  const pads: PadDef[] = [];
  if (!Array.isArray(padsRaw)) bad('SHAPE', `${p}.pads`, 'pads는 목록이어야 해요');
  else {
    padsRaw.forEach((pad, k) => {
      if (!isObj(pad) || !isNum(pad['dx']) || !isNum(pad['dy']) || !isNum(pad['midi'])) return bad('SHAPE', `${p}.pads[${k}]`, '돌은 {dx, dy, midi}여야 해요');
      pads.push({ dx: pad['dx'], dy: pad['dy'], midi: pad['midi'] });
    });
  }
  if (!ok) return null;
  return {
    playId: playId as string,
    regionId,
    name: (name as string).trim(),
    x: x as number,
    y: y as number,
    timbre: timbre as PlayTimbre,
    pads,
    echo: echo === true,
    ground: (ground ?? 'none') as PlayGround,
    availability: availability as Availability,
    reviewStatus: reviewStatus as ReviewStatus,
    rightsStatus: rightsStatus as RightsStatus,
  };
}

// ───── 길 기하(검사용) ─────

export interface RoadLine {
  id: string;
  /** 길 폭(px) */
  width: number;
  points: readonly Point[];
}

/** 검사할 때 부르는 쪽이 넘기는 월드의 모양 */
export interface DiscoveryGeometry {
  roads: readonly RoadLine[];
  /** 지역을 드나드는 문(월드 px) */
  gates: readonly Point[];
  /** 막히지 않았고 시작 자리에서 걸어서 닿는 곳인가 */
  reachable: (x: number, y: number) => boolean;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 길 가운데 선까지의 가장 가까운 거리. 길이 없으면 Infinity */
export function distanceToRoads(roads: readonly RoadLine[], p: Point): number {
  let best = Infinity;
  for (const r of roads) for (let i = 1; i < r.points.length; i++) best = Math.min(best, distanceToSegment(p, r.points[i - 1]!, r.points[i]!));
  return best;
}

/**
 * 막다른 길의 끝점들. 길의 끝이 문 가까이(GATE_RADIUS)에 있거나 다른 길 위에(그 길 폭의 절반 + 40 px 안) 있으면 막다른 길이 아니다.
 * 끝점이 서로 같은 길의 한가운데에 있어도 다른 길 위로 본다.
 */
export function deadEndsOf(roads: readonly RoadLine[], gates: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const road of roads) {
    const ends = [road.points[0], road.points[road.points.length - 1]].filter((p): p is Point => !!p);
    for (const end of ends) {
      if (gates.some((g) => Math.hypot(g.x - end.x, g.y - end.y) <= GATE_RADIUS)) continue;
      const onOther = roads.some((other) => {
        if (other === road) return false;
        for (let i = 1; i < other.points.length; i++) if (distanceToSegment(end, other.points[i - 1]!, other.points[i]!) <= other.width / 2 + 40) return true;
        return false;
      });
      if (!onOther) out.push(end);
    }
  }
  return out;
}

/** 지역의 네모(월드 px). 길을 자를 때는 가장자리까지 닫힌 네모로 본다 */
export interface RegionRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 선분 a→c 가운데 네모 안에 드는 구간의 매개변수 [t0, t1](0은 a, 1은 c). 네모와 만나지 않으면 null(Liang–Barsky) */
function clipSegment(a: Point, c: Point, b: RegionRect): { t0: number; t1: number } | null {
  let t0 = 0;
  let t1 = 1;
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const edges: ReadonlyArray<readonly [number, number]> = [
    [-dx, a.x - b.x0],
    [dx, b.x1 - a.x],
    [-dy, a.y - b.y0],
    [dy, b.y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1 ? { t0, t1 } : null;
}

/**
 * 길들을 지역의 네모 안쪽만 남기고 자른다. 바깥 지역의 길(바큇살 길, 둘레길)은 여러 지역을 지나므로, 지역의 '길 가까이'(3.6-1)와
 * '막다른 길'(3.4-2)은 그 지역 안의 토막으로 본다. 길이 지역 경계를 지나는 자리는 문으로 돌려준다: 그 끝은 지역을 나가는 길이지
 * 막다른 길이 아니다(GATE_RADIUS). 길이 지역 안에서 시작하거나 끝나는 자리(예: 동쪽 길의 강둑 끝)는 문이 아니라 진짜 끝이다.
 * 한 길이 지역을 여러 번 드나들면 토막마다 `id#번호`를 붙인다.
 */
export function clipRoadsToBounds(roads: readonly RoadLine[], bounds: RegionRect): { roads: RoadLine[]; gates: Point[] } {
  const EPS = 1e-9;
  const out: RoadLine[] = [];
  const gates: Point[] = [];
  const at = (a: Point, c: Point, t: number): Point => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
  for (const road of roads) {
    const runs: Point[][] = [];
    let cur: Point[] | null = null;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!;
      const c = road.points[i]!;
      const clip = clipSegment(a, c, bounds);
      if (!clip) {
        if (cur) runs.push(cur);
        cur = null;
        continue;
      }
      const entered = clip.t0 > EPS;
      const left = clip.t1 < 1 - EPS;
      if (entered || !cur) {
        if (cur) runs.push(cur);
        cur = [at(a, c, clip.t0)];
        if (entered) gates.push(cur[0]!);
      }
      cur.push(at(a, c, clip.t1));
      if (left) {
        gates.push(cur[cur.length - 1]!);
        runs.push(cur);
        cur = null;
      }
    }
    if (cur) runs.push(cur);
    const kept = runs.filter((r) => r.length >= 2 && r.some((p, k) => k > 0 && (p.x !== r[0]!.x || p.y !== r[0]!.y)));
    kept.forEach((points, k) => out.push({ id: kept.length > 1 ? `${road.id}#${k + 1}` : road.id, width: road.width, points }));
  }
  return { roads: out, gates };
}

// ───── 검사 ─────

export interface DiscoveryContext {
  /** 쪽지가 잇는 과제 id들. 없으면 연결을 검사하지 않는다 */
  questIds?: ReadonlySet<string>;
  /** 지역마다의 월드 모양. 없는 지역은 좌표 검사를 건너뛴다 */
  geometry?: Partial<Record<RegionId, DiscoveryGeometry>>;
  /** 지역의 범위(월드 px). 없으면 범위를 검사하지 않는다 */
  bounds?: Partial<Record<RegionId, { x0: number; y0: number; x1: number; y1: number }>>;
}

type AddIssue = (code: string, path: string, message: string) => void;

function checkPiece(piece: SoundPieceDef, path: string, add: AddIssue): void {
  if (piece.notes.length === 0) add('PIECE_EMPTY', path, '소리 조각에 음이 없어요');
  if (piece.notes.length > PIECE_MAX_NOTES) add('PIECE_LONG', path, `소리 조각의 음은 ${PIECE_MAX_NOTES}개 이하예요`);
  let end = 0;
  piece.notes.forEach((n, i) => {
    const np = `${path}.notes[${i}]`;
    if (!Number.isInteger(n.midi) || !PENTATONIC_PITCH_CLASSES.includes(((n.midi % 12) + 12) % 12)) add('PIECE_SCALE', np, `다장조 5음 음계(C D E G A)의 음이어야 해요: MIDI ${n.midi}`);
    if (!Number.isInteger(n.midi) || n.midi < 48 || n.midi > 84) add('PIECE_RANGE', np, `C3부터 C6 사이의 음이어야 해요: MIDI ${n.midi}`);
    if (!PIECE_DURATIONS.includes(n.durationTicks)) add('PIECE_LENGTH', np, `길이는 ${PIECE_DURATIONS.join(', ')}틱 중 하나예요: ${n.durationTicks}`);
    if (!Number.isInteger(n.onsetTicks) || n.onsetTicks < 0 || n.onsetTicks % 480 !== 0) add('PIECE_ONSET', np, `시작은 480틱(8분음표) 단위여야 해요: ${n.onsetTicks}`);
    if (n.onsetTicks < end) add('PIECE_OVERLAP', np, '소리 조각은 한 가락이라 음이 겹치면 안 돼요(시작 순서대로, 앞 음이 끝난 뒤에)');
    if (n.onsetTicks + n.durationTicks > PIECE_BAR_TICKS) add('PIECE_BAR', np, `한 마디(${PIECE_BAR_TICKS}틱)를 넘어요`);
    end = Math.max(end, n.onsetTicks + n.durationTicks);
  });
}

/**
 * 놀이 악기 하나를 검사한다(3.5): 돌 수, 돌의 음(다장조 5음, C2–C6, 서로 다른 음), 돌의 자리(악기 가까이, 서로 겹치지 않게, 지역 안, 걸어서 닿는 곳).
 * 악기의 가운데 점은 큰 구조물(벽 같은 것) 안에 있어도 되므로 걸어서 닿는지는 돌의 자리만 본다.
 */
function checkPlayInstrument(pi: PlayInstrumentDef, path: string, geometry: DiscoveryGeometry | undefined, bounds: RegionRect | undefined, add: AddIssue): void {
  if (pi.pads.length < PAD_COUNT_MIN || pi.pads.length > PAD_COUNT_MAX) add('PLAY_PADS', path, `놀이 악기의 돌은 ${PAD_COUNT_MIN}개 이상 ${PAD_COUNT_MAX}개 이하예요: ${pi.pads.length}개`);
  const sites = padSitesOf(pi);
  const seenMidi = new Set<number>();
  sites.forEach((s, i) => {
    const np = `${path}.pads[${i}]`;
    if (!Number.isInteger(s.midi) || !PENTATONIC_PITCH_CLASSES.includes(((s.midi % 12) + 12) % 12)) add('PLAY_SCALE', np, `다장조 5음 음계(C D E G A)의 음이어야 해요: MIDI ${s.midi}`);
    if (!Number.isInteger(s.midi) || s.midi < PAD_MIDI_MIN || s.midi > PAD_MIDI_MAX) add('PLAY_RANGE', np, `C2부터 C6 사이의 음이어야 해요: MIDI ${s.midi}`);
    if (seenMidi.has(s.midi)) add('PLAY_DUP_PITCH', np, `같은 음의 돌이 둘이에요: MIDI ${s.midi}`);
    seenMidi.add(s.midi);
    const pad = pi.pads[i]!;
    if (Math.hypot(pad.dx, pad.dy) > PAD_SPREAD_MAX) add('PLAY_SPREAD', np, `돌이 악기의 가운데에서 ${PAD_SPREAD_MAX} px 안에 있어야 해요: ${Math.round(Math.hypot(pad.dx, pad.dy))} px`);
    if (bounds && (s.x - PAD_RADIUS < bounds.x0 || s.x + PAD_RADIUS > bounds.x1 || s.y - PAD_RADIUS < bounds.y0 || s.y + PAD_RADIUS > bounds.y1)) add('OUTSIDE', np, `돌이 지역 밖에 걸쳐 있어요: (${s.x}, ${s.y})`);
    if (geometry && !geometry.reachable(s.x, s.y)) add('UNREACHABLE', np, `걸어서 닿지 않는 곳이에요: (${s.x}, ${s.y})`);
  });
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const d = Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.y - sites[j]!.y);
      if (d < 2 * PAD_RADIUS + PAD_GAP) add('PLAY_PAD_SPACING', `${path}.pads[${j}]`, `돌 가운데끼리 ${2 * PAD_RADIUS + PAD_GAP} px 이상 떨어져야 해요(${i + 1}번과 ${j + 1}번): ${Math.round(d)} px`);
    }
  }
}

/**
 * 발견 요소 전체를 검사한다. 비어 있으면 통과.
 * 지역마다 소리 조각 6, 개념 쪽지 3(3.6), 소리 조각은 다장조 5음 4/4 한 마디(3.6-4), 좌표는 지역 안이고 걸어서 닿는 곳(3.6-1),
 * 서로 500 px 이상(3.6-2), 길 가까이 60% 안팎(3.6-1), 막다른 샛길 끝마다 하나(3.4-2), 공개 상태인데 검수·권리가 끝나지 않은 것이 없다(G2-7).
 */
export function validateDiscoveries(files: readonly DiscoveryFile[], ctx: DiscoveryContext = {}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string): void => void issues.push({ code, path, message });
  const seen = new Map<string, string>();
  /** 서로 떨어뜨릴 것들: 발견 요소와 놀이 악기의 가운데 */
  const all: Array<{ id: string; x: number; y: number }> = [];

  for (const f of files) {
    const root = `content/discoveries/${f.regionId}.json`;
    const pieces = f.items.filter((d): d is SoundPieceDef => d.kind === 'soundPiece');
    const notes = f.items.filter((d): d is ConceptNoteDef => d.kind === 'conceptNote');
    if (pieces.length !== SOUND_PIECES_PER_REGION) add('COUNT', root, `소리 조각은 지역마다 ${SOUND_PIECES_PER_REGION}개예요: ${pieces.length}개`);
    if (notes.length !== CONCEPT_NOTES_PER_REGION) add('COUNT', root, `개념 쪽지는 지역마다 ${CONCEPT_NOTES_PER_REGION}개예요: ${notes.length}개`);
    const geometry = ctx.geometry?.[f.regionId];
    const bounds = ctx.bounds?.[f.regionId];

    f.items.forEach((d, i) => {
      const p = `${root}.items[${i}]`;
      const m = ID_RE.exec(d.discoveryId);
      if (m && m[1] !== f.regionId) add('ID_REGION', p, `id의 지역(${m[1]})이 파일의 지역(${f.regionId})과 달라요: ${d.discoveryId}`);
      if (m && (m[2] === 'piece') !== (d.kind === 'soundPiece')) add('ID_KIND', p, `id의 종류와 kind가 달라요: ${d.discoveryId}`);
      if (d.regionId !== f.regionId) add('ID_REGION', p, `항목의 지역(${d.regionId})이 파일의 지역(${f.regionId})과 달라요`);
      const prev = seen.get(d.discoveryId);
      if (prev) add('DUP_ID', p, `id가 겹쳐요: ${d.discoveryId}(${prev})`);
      else seen.set(d.discoveryId, p);
      if (d.kind === 'soundPiece') checkPiece(d, p, add);
      else {
        if (lengthOf(d.text) > NOTE_TEXT_MAX) add('NOTE_LONG', p, `쪽지는 짧아야 해요(${NOTE_TEXT_MAX}자 이하): ${lengthOf(d.text)}자`);
        if (d.textbookRefs.length === 0) add('NOTE_SOURCE', p, '쪽지는 교재의 해당 쪽과 이어져야 해요(textbookRefs)');
        if (ctx.questIds && !ctx.questIds.has(d.questId)) add('REF_QUEST', p, `없는 과제를 가리켜요: ${d.questId}`);
      }
      if (d.availability === 'published') {
        const refsOk = d.kind === 'conceptNote' ? d.textbookRefs.every((r) => r.reviewStatus === 'reviewed' && r.rightsStatus === 'confirmed') : true;
        if (d.reviewStatus !== 'reviewed' || d.rightsStatus !== 'confirmed' || !refsOk) add('PUBLISHED_UNREVIEWED', p, '공개 상태인데 검수나 권리 확인이 끝나지 않았어요(11.4)');
      }
      if (bounds && (d.x < bounds.x0 || d.x >= bounds.x1 || d.y < bounds.y0 || d.y >= bounds.y1)) add('OUTSIDE', p, `지역 밖에 있어요: (${d.x}, ${d.y})`);
      if (geometry && !geometry.reachable(d.x, d.y)) add('UNREACHABLE', p, `걸어서 닿지 않는 곳이에요: (${d.x}, ${d.y})`);
      all.push({ id: d.discoveryId, x: d.x, y: d.y });
    });

    // 놀이 악기(3.5): 마을에는 없고 바깥 지역마다 하나. 길 가까이 몫(ROAD_SHARE)과 막다른 길 끝 덮기에는 세지 않는다
    const plays = f.playInstruments ?? [];
    const wantPlays = f.regionId === 'village' ? 0 : PLAY_INSTRUMENTS_PER_OUTER_REGION;
    if (plays.length !== wantPlays) add('COUNT', root, f.regionId === 'village' ? `놀이 악기는 마을에 없어요: ${plays.length}개` : `놀이 악기는 바깥 지역마다 ${wantPlays}개예요: ${plays.length}개`);
    plays.forEach((pi, i) => {
      const p = `${root}.playInstruments[${i}]`;
      const m = PLAY_ID_RE.exec(pi.playId);
      if (m && m[1] !== f.regionId) add('ID_REGION', p, `id의 지역(${m[1]})이 파일의 지역(${f.regionId})과 달라요: ${pi.playId}`);
      if (pi.regionId !== f.regionId) add('ID_REGION', p, `항목의 지역(${pi.regionId})이 파일의 지역(${f.regionId})과 달라요`);
      const prev = seen.get(pi.playId);
      if (prev) add('DUP_ID', p, `id가 겹쳐요: ${pi.playId}(${prev})`);
      else seen.set(pi.playId, p);
      if (!(PLAY_TIMBRES as readonly string[]).includes(pi.timbre)) add('PLAY_TIMBRE', p, `쓸 수 없는 음색이에요: ${pi.timbre}`);
      if (lengthOf(pi.name) === 0 || lengthOf(pi.name) > NAME_MAX) add('SHAPE', p, `이름은 1~${NAME_MAX}자예요`);
      if (pi.availability === 'published' && (pi.reviewStatus !== 'reviewed' || pi.rightsStatus !== 'confirmed')) add('PUBLISHED_UNREVIEWED', p, '공개 상태인데 검수나 권리 확인이 끝나지 않았어요(11.4)');
      if (bounds && (pi.x < bounds.x0 || pi.x >= bounds.x1 || pi.y < bounds.y0 || pi.y >= bounds.y1)) add('OUTSIDE', p, `지역 밖에 있어요: (${pi.x}, ${pi.y})`);
      checkPlayInstrument(pi, p, geometry, bounds, add);
      all.push({ id: pi.playId, x: pi.x, y: pi.y });
    });

    // 길 가까이 60% 안팎
    if (geometry && f.items.length > 0) {
      const near = f.items.filter((d) => distanceToRoads(geometry.roads, d) <= ROAD_NEAR).length;
      const share = near / f.items.length;
      if (Math.abs(share - ROAD_SHARE_TARGET) > ROAD_SHARE_TOLERANCE + 1e-9) {
        add('ROAD_SHARE', root, `길 ${ROAD_NEAR} px 안의 몫이 ${Math.round(share * 100)}%예요(${near}/${f.items.length}). ${Math.round((ROAD_SHARE_TARGET - ROAD_SHARE_TOLERANCE) * 100)}~${Math.round((ROAD_SHARE_TARGET + ROAD_SHARE_TOLERANCE) * 100)}% 사이여야 해요`);
      }
      // 막다른 샛길의 끝마다 발견 요소가 하나 이상
      for (const end of deadEndsOf(geometry.roads, geometry.gates)) {
        if (!f.items.some((d) => Math.hypot(d.x - end.x, d.y - end.y) <= DEAD_END_RADIUS)) add('DEAD_END', root, `막다른 길 끝 (${end.x}, ${end.y})에 발견 요소가 없어요(${DEAD_END_RADIUS} px 안)`);
      }
    }
  }

  // 서로 500 px 이상(지역이 달라도 지킨다)
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < MIN_SPACING) add('SPACING', `${a.id}~${b.id}`, `서로 ${MIN_SPACING} px 이상 떨어뜨려야 해요: ${Math.round(d)} px`);
    }
  }
  return issues;
}

// ───── 쓰는 쪽(화면, 월드, 소리)을 위한 도우미 ─────

/**
 * 지금 채널에서 보이는 발견 요소들. 정식 공개(release)에서는 공개 상태인 것만 보인다(G2-7).
 * 차례는 지역 차례(마을, 오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪)이고, 지역 안에서는 id 순서다.
 * 이 차례가 소리 조각의 번호(월드 소리가 울리는 마디, 광장 둘레의 몇 번째 등)가 되므로, 마을의 것이 늘 맨 앞이어서
 * 지역이 늘어도 앞의 번호가 바뀌지 않는다.
 */
export function visibleDiscoveries(files: readonly DiscoveryFile[], channel: Channel): DiscoveryDef[] {
  const regionRank = (id: RegionId): number => REGION_IDS.indexOf(id);
  return files
    .flatMap((f) => f.items)
    .filter((d) => channel === 'preview' || d.availability === 'published')
    .sort((a, b) => regionRank(a.regionId) - regionRank(b.regionId) || a.discoveryId.localeCompare(b.discoveryId, 'en', { numeric: true }));
}

/**
 * 지금 채널에서 보이는 놀이 악기들. 정식 공개(release)에서는 공개 상태인 것만 보인다(G2-7).
 * 차례는 지역 차례이고, 한 지역 안에서는 id 순서다. 놀이 악기는 소리 조각의 번호(마디의 짝홀, 광장 둘레의 등)에 끼지 않는다.
 */
export function visiblePlayInstruments(files: readonly DiscoveryFile[], channel: Channel): PlayInstrumentDef[] {
  const regionRank = (id: RegionId): number => REGION_IDS.indexOf(id);
  return files
    .flatMap((f) => f.playInstruments ?? [])
    .filter((p) => channel === 'preview' || p.availability === 'published')
    .sort((a, b) => regionRank(a.regionId) - regionRank(b.regionId) || a.playId.localeCompare(b.playId, 'en', { numeric: true }));
}

export const isSoundPiece = (d: DiscoveryDef): d is SoundPieceDef => d.kind === 'soundPiece';
export const isConceptNote = (d: DiscoveryDef): d is ConceptNoteDef => d.kind === 'conceptNote';

/**
 * 소리 조각만, 발견 요소 파일의 차례대로. 이 차례가 조각의 번호다: 월드 소리(어느 마디에 울리는가), 소리 물결(어느 박에 퍼지는가),
 * 광장 둘레의 등(몇 번째 등을 켜는가)이 모두 이 한 곳의 차례를 쓴다.
 */
export const soundPiecesOf = (discoveries: readonly DiscoveryDef[]): SoundPieceDef[] => discoveries.filter(isSoundPiece);

/** 소리 조각이 광장 둘레의 몇 번째 등을 켜는가(0부터). 소리 조각만의 차례다 */
export function lampIndexOf(pieces: readonly SoundPieceDef[], discoveryId: string): number {
  return pieces.findIndex((p) => p.discoveryId === discoveryId);
}

/** 거리에 따른 들림 크기(0–1). 600 px 밖은 0, 가까울수록 (1 − 거리 ÷ 600)의 제곱으로 커진다(3.6-3) */
export function pieceHearGain(distance: number): number {
  if (!(distance < PIECE_HEAR_RADIUS)) return 0;
  const k = 1 - Math.max(0, distance) / PIECE_HEAR_RADIUS;
  return k * k;
}

/** 소리 조각의 음 이름. 예: 'C4 D4 E4 G4' (수첩에서 읽어 주는 글) */
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
export const pieceNoteName = (midi: number): string => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const describePiece = (piece: SoundPieceDef): string => piece.notes.map((n) => pieceNoteName(n.midi)).join(' ');

/** 소리 조각의 재생 내용(월드의 들림, 수첩의 다시 듣기, 자유 가락의 미리 듣기가 같은 것을 쓴다). 한 마디 길이, 4분음표 80이다 */
export function piecePlayback(piece: Pick<SoundPieceDef, 'notes'>): Playback {
  return {
    notes: piece.notes.map((n, i) => ({ id: `piece-${i + 1}`, midi: n.midi, onsetTick: n.onsetTicks, durationTick: n.durationTicks })),
    lengthTicks: PIECE_BAR_TICKS,
    tempoBpm: PIECE_TEMPO_BPM,
    tempoReference: 'quarter',
  };
}

// ───── 월드의 자리: 발견 요소와 광장 게시판(3.6, 6.1, 7.4) ─────

/** 월드가 그리고, 96 px 안에 다가가면 이름 칩이 뜨고, E나 누르기로 여는 자리(정거장이 아니다) */
export interface WorldSpot {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: SpotKind;
  /** kind가 'discovery'일 때 어떤 발견 요소인가 */
  discovery?: DiscoveryKind;
}

/**
 * 광장 게시판(6.1 '만듦'): 저장한 곡이 걸린다. 합주 광장의 동쪽 바깥, 동서 큰길의 북쪽 가장자리 곁이다(둘레 100 px 안이 모두 걸을 수 있는 땅).
 * 여는 일(수첩 '내 곡' 쪽으로 간다)은 앱이 한다. 걸을 수 있는 자리인지는 시험이 월드 격자로 확인한다.
 */
export const BOARD_SPOT: WorldSpot = { id: 'board.plaza', name: '광장 게시판', x: 4556, y: 2956, kind: 'board' };

/** 월드에 놓을 자리들: 이 채널에서 보이는 발견 요소 전부와 광장 게시판. 차례는 발견 요소(id 순서), 게시판 */
export function spotsOf(discoveries: readonly DiscoveryDef[]): WorldSpot[] {
  return [...discoveries.map((d): WorldSpot => ({ id: d.discoveryId, name: d.name, x: d.x, y: d.y, kind: 'discovery', discovery: d.kind })), BOARD_SPOT];
}

// ───── 광장 둘레의 등(3.6 '찾으면') ─────

/** 합주 광장의 중심(3.3). 마을 지역 파일의 landmark와 같아야 한다(시험이 맞춘다) */
export const PLAZA_CENTER: Point = { x: 4056, y: 3081 };
/** 등이 서는 둘레의 반지름(px): 광장 바닥(반지름 360)의 바로 바깥 */
export const LAMP_RING_RADIUS = 400;
/**
 * 등이 설 수 있는 호(도, 동쪽이 0이고 시계 방향, 시작 각이 작은 것부터). 광장 둘레(반지름 400)에서 다음을 20 px 넘게 비킨 구간이다:
 * 광장을 가로지르는 동서·남북 큰길(폭 186), 북동쪽의 울타리 하나, 남동쪽의 의자. 큰길 곁의 짧은 틈(2도 남짓)은 쓰지 않는다.
 * 마을의 길·울타리가 바뀌면 시험(discovery-world.test.ts)이 등이 길이나 장애물 위에 서는 것을 잡는다.
 */
export const LAMP_ARCS_DEG: ReadonlyArray<readonly [number, number]> = [
  [17, 40],
  [58.5, 73],
  [107, 163],
  [197, 253],
  [287, 307],
];

/**
 * 등 count개가 호마다 몇 개씩 서는가. 호의 길이에 비례해 나누고(가장 큰 나머지부터 하나씩 더한다), 같으면 앞선 호부터 더한다.
 * 예: 18 → [2, 2, 6, 6, 2]. 합은 늘 count다
 */
export function lampsPerArc(count: number): number[] {
  const n = Math.max(0, Math.floor(count));
  const lengths = LAMP_ARCS_DEG.map(([from, to]) => to - from);
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const quota = lengths.map((l) => (n * l) / total);
  const out = quota.map((q) => Math.floor(q + 1e-9));
  let left = n - out.reduce((sum, v) => sum + v, 0);
  const byRemainder = quota.map((q, i) => ({ i, r: q - out[i]! })).sort((x, y) => y.r - x.r || x.i - y.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    out[i] = out[i]! + 1;
    left--;
  }
  return out;
}

/**
 * 광장 둘레의 등 count개 가운데 index번째(0부터)가 서는 발치. 큰길과 울타리, 의자를 비킨 호(LAMP_ARCS_DEG) 위에 서고,
 * 호 안에서는 같은 간격으로 호의 가운데를 중심으로 선다. 번호는 동쪽 큰길에서 시계 방향으로 늘어난다.
 * 개수가 늘어도(지역마다 6개씩, 36개까지) 같은 둘레에 같은 방식으로 선다.
 */
export function plazaLampSite(index: number, count: number): Point {
  const total = Math.max(1, Math.floor(count));
  const per = lampsPerArc(total);
  let rest = Math.max(0, Math.min(Math.floor(index), total - 1));
  let arc = 0;
  while (arc < LAMP_ARCS_DEG.length - 1 && rest >= per[arc]!) rest -= per[arc++]!;
  const [from, to] = LAMP_ARCS_DEG[arc]!;
  const deg = from + ((rest + 0.5) / Math.max(1, per[arc]!)) * (to - from);
  const angle = (deg * Math.PI) / 180;
  return { x: Math.round(PLAZA_CENTER.x + LAMP_RING_RADIUS * Math.cos(angle)), y: Math.round(PLAZA_CENTER.y + LAMP_RING_RADIUS * Math.sin(angle)) };
}

/** 광장 둘레의 등 하나의 id(1부터). 등불 층이 읽는 이름이다 */
export const plazaLampId = (index: number): string => `plaza-lamp-${index + 1}`;

/** 광장 둘레의 등마다 켜졌는가: 소리 조각 i번을 찾았으면 i번 등이 켜진다. 한번 켜지면 꺼지지 않는다(W-6, 찾은 것은 사라지지 않는다) */
export function plazaLampStates(pieces: readonly Pick<SoundPieceDef, 'discoveryId'>[], found: ReadonlySet<string>): Record<string, LanternState> {
  const out: Record<string, LanternState> = {};
  pieces.forEach((p, i) => {
    out[plazaLampId(i)] = found.has(p.discoveryId) ? 'on' : 'off';
  });
  return out;
}

// ───── 찾았을 때 알리는 글(W-9: 사실 문장) ─────

const eulReul = (text: string): string => `${text}${hasBatchim(text) ? '을' : '를'}`;

/** 처음 찾았을 때 마을 위쪽에 잠깐 뜨는 글. 남은 개수나 칭찬은 적지 않는다(6.7) */
export function foundNews(d: Pick<DiscoveryDef, 'kind' | 'name'>): string[] {
  const what = d.kind === 'soundPiece' ? '소리 조각' : '개념 쪽지';
  const lines = [`${what} ${eulReul(d.name)} 찾았어요. 수첩에 적었어요.`];
  if (d.kind === 'soundPiece') lines.push('광장 둘레의 등이 하나 켜졌어요.');
  return lines;
}
