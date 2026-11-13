// 바닥 조각 불러오기 계획(설계서 10.5). 카메라가 비추는 범위에서 512 px 바깥까지만 불러오고,
// 두 조각 넘게 멀어지면 내리며, 동시에 12장을 넘기지 않는다. 순수 계산이라 Phaser 없이 단위 테스트한다.
import { CHUNK_COLS, CHUNK_ROWS, CHUNK_SIZE } from '../domain/world';

/** 화면 가장자리에서 이만큼 바깥까지 미리 불러온다 */
export const CHUNK_LOAD_MARGIN = 512;
/** 불러올 범위에서 이만큼(조각 수) 넘게 멀어지면 내린다 */
export const CHUNK_KEEP_DISTANCE = 2;
/** 동시에 메모리에 올려 두는 조각의 최대 수 */
export const CHUNK_MAX_LOADED = 12;

export interface ChunkId {
  c: number;
  r: number;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 텍스처 키이자 조각의 이름. 파일 이름은 여기에 .webp를 붙인 것이다(9.6) */
export const chunkName = (c: number, r: number): string => `ground-${c}-${r}`;
export const chunkUrl = (c: number, r: number): string => `world/${chunkName(c, r)}.webp`;
export const chunkOrigin = (c: number, r: number): { x: number; y: number } => ({ x: c * CHUNK_SIZE, y: r * CHUNK_SIZE });

export function parseChunkName(name: string): ChunkId | null {
  const m = /^ground-(\d+)-(\d+)$/.exec(name);
  if (!m) return null;
  const c = Number(m[1]);
  const r = Number(m[2]);
  return c < CHUNK_COLS && r < CHUNK_ROWS ? { c, r } : null;
}

export interface ChunkRange {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/** 사각형이 겹치는 조각의 범위(끝 포함). 월드 밖은 잘라 낸다 */
export function chunkRange(view: ViewRect, margin = CHUNK_LOAD_MARGIN): ChunkRange {
  const clamp = (v: number, hi: number): number => Math.min(Math.max(v, 0), hi);
  return {
    c0: clamp(Math.floor((view.x - margin) / CHUNK_SIZE), CHUNK_COLS - 1),
    c1: clamp(Math.floor((view.x + view.w + margin - 1e-6) / CHUNK_SIZE), CHUNK_COLS - 1),
    r0: clamp(Math.floor((view.y - margin) / CHUNK_SIZE), CHUNK_ROWS - 1),
    r1: clamp(Math.floor((view.y + view.h + margin - 1e-6) / CHUNK_SIZE), CHUNK_ROWS - 1),
  };
}

/** 조각에서 범위까지의 거리(조각 수, 체비쇼프). 범위 안이면 0 */
export function chunkDistance(id: ChunkId, range: ChunkRange): number {
  const dc = Math.max(range.c0 - id.c, 0, id.c - range.c1);
  const dr = Math.max(range.r0 - id.r, 0, id.r - range.r1);
  return Math.max(dc, dr);
}

export interface ChunkPlan {
  /** 지금 화면 둘레에서 필요한 조각 */
  wanted: ChunkId[];
  /** 새로 불러올 조각(화면 가운데에 가까운 것부터) */
  load: ChunkId[];
  /** 내릴 조각 */
  unload: ChunkId[];
}

export interface ChunkOptions {
  margin?: number;
  keepDistance?: number;
  maxLoaded?: number;
}

/**
 * 불러온 조각(loaded, 조각 이름)과 화면 범위에서 불러올 것과 내릴 것을 정한다.
 * - 필요한 조각은 화면 + 512 px 안에 닿는 것이다.
 * - 필요한 범위에서 두 조각 넘게 멀어진 조각은 내린다.
 * - 그래도 12장을 넘으면 필요하지 않은 조각 중 먼 것부터 내린다.
 */
export function planChunks(view: ViewRect, loaded: Iterable<string>, opts: ChunkOptions = {}): ChunkPlan {
  const margin = opts.margin ?? CHUNK_LOAD_MARGIN;
  const keep = opts.keepDistance ?? CHUNK_KEEP_DISTANCE;
  const max = opts.maxLoaded ?? CHUNK_MAX_LOADED;
  const range = chunkRange(view, margin);

  const wanted: ChunkId[] = [];
  for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) wanted.push({ c, r });
  const cx = (view.x + view.w / 2) / CHUNK_SIZE - 0.5;
  const cy = (view.y + view.h / 2) / CHUNK_SIZE - 0.5;
  wanted.sort((a, b) => Math.hypot(a.c - cx, a.r - cy) - Math.hypot(b.c - cx, b.r - cy) || a.r - b.r || a.c - b.c);

  const have = new Map<string, ChunkId>();
  for (const name of loaded) {
    const id = parseChunkName(name);
    if (id) have.set(name, id);
  }
  const wantedNames = new Set(wanted.map((w) => chunkName(w.c, w.r)));
  const load = wanted.filter((w) => !have.has(chunkName(w.c, w.r)));

  const unload: ChunkId[] = [];
  const kept: Array<{ id: ChunkId; d: number }> = [];
  for (const [name, id] of have) {
    const d = chunkDistance(id, range);
    if (d > keep) unload.push(id);
    else if (!wantedNames.has(name)) kept.push({ id, d });
  }
  // 상한: 필요한 조각은 모두 올리고, 남는 자리만큼만 필요하지 않은 조각을 둔다
  const room = Math.max(max - wanted.length, 0);
  if (kept.length > room) {
    kept.sort((a, b) => b.d - a.d || chunkName(a.id.c, a.id.r).localeCompare(chunkName(b.id.c, b.id.r)));
    const over = kept.length - room;
    for (const k of kept.slice(0, over)) unload.push(k.id);
  }
  return { wanted, load, unload };
}
