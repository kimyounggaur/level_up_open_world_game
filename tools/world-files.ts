// 월드 굽기의 파일 쪽 도구: 지역 읽기, 생성 파일(worldData.ts)과 목록(manifest.json) 글 만들기, 원본 해시.
// 굽기 도구(build-world.ts)와 "생성 파일이 낡지 않았는지" 테스트가 같은 함수를 쓴다. sharp는 여기서 쓰지 않는다.
import crypto from 'node:crypto';
import { CHUNK_COLS, CHUNK_PAD, CHUNK_ROWS, CHUNK_SIZE, OVERVIEW_H, OVERVIEW_W, parseRegion } from '../src/domain/world';
import type { RegionDef } from '../src/domain/world';
import { ATLAS_DATA, ATLAS_IMAGE, frameName } from '../world-src/atlas';
import type { WorldBuild } from '../world-src/index';
import { planAtlas } from './atlas';
import { loadContent } from './content-loader';

export const GENERATED_PATH = 'src/world/generated/worldData.ts';
export const WORLD_PUBLIC_DIR = 'public/world';
export const MANIFEST_NAME = 'manifest.json';
/** 악보 지도 배경 그림 파일 이름 */
export const OVERVIEW_NAME = 'overview.webp';

export const chunkFileName = (c: number, r: number): string => `ground-${c}-${r}.webp`;

export function allChunkFiles(): string[] {
  const out: string[] = [];
  for (let r = 0; r < CHUNK_ROWS; r++) for (let c = 0; c < CHUNK_COLS; c++) out.push(chunkFileName(c, r));
  return out;
}

/** content/regions를 읽어 검사한 지역 목록. 문제가 있으면 던진다 */
export function loadRegionDefs(root: string): RegionDef[] {
  const loaded = loadContent(root);
  if (loaded.issues.length > 0) throw new Error(`content를 읽지 못했어요: ${loaded.issues.map((i) => i.message).join('; ')}`);
  return loaded.regions.map((f) => {
    const { region, issues } = parseRegion(f.data, f.file);
    if (!region) throw new Error(`지역 파일이 틀렸어요: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
    return region;
  });
}

const sortedEntries = (o: Record<string, unknown>): Array<[string, unknown]> => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));

/** 바닥 원본 전체의 해시. 그림 원본, 막힌 칸 표, 사물, 누르기 영역, 사물 그림이 하나라도 바뀌면 달라진다 */
export function sourceHashOf(build: WorldBuild): string {
  const h = crypto.createHash('sha256');
  h.update(build.svgBody);
  h.update(JSON.stringify(build.grid.toRows()));
  h.update(JSON.stringify(build.objects));
  h.update(JSON.stringify(sortedEntries(build.hits)));
  h.update(JSON.stringify(sortedEntries(build.stands)));
  h.update(JSON.stringify(Object.entries(build.sprites).sort(([a], [b]) => (a < b ? -1 : 1))));
  return h.digest('hex').slice(0, 16);
}

const objectLine = (o: unknown): string => `  ${JSON.stringify(o)},`;

/** src/world/generated/worldData.ts의 내용 */
export function renderWorldDataTs(build: WorldBuild, hash: string): string {
  const rows = build.grid.toRows();
  const frames = Object.keys(build.sprites).map(frameName).sort();
  const hitIds = Object.keys(build.hits).sort();
  const lines: string[] = [];
  lines.push('// 자동 생성 파일 — 직접 고치지 않는다. `npm run build:world`가 world-src/와 content/regions/에서 만든다(설계서 10.5).');
  lines.push("import type { WorldObjectData } from '../objects';");
  lines.push('');
  lines.push('/** 바닥 원본의 해시. 원본이 바뀌었는데 다시 굽지 않았으면 테스트가 알린다 */');
  lines.push(`export const WORLD_SOURCE_HASH = '${hash}';`);
  lines.push('');
  lines.push("/** 막힌 칸 표. 줄마다 256칸, '#'은 막힌 칸, '.'은 걸을 수 있는 칸 */");
  lines.push('export const NAV_ROWS: readonly string[] = [');
  for (const r of rows) lines.push(`  '${r}',`);
  lines.push('];');
  lines.push('');
  lines.push('/** 사물(나무, 표지판, 소품). 발 위치의 y(sortY) 순서로 정렬되어 있다. 지도(world-src/regions/*.tmj)에 놓인 그대로다 */');
  lines.push('export const WORLD_OBJECTS: readonly WorldObjectData[] = [');
  for (const o of build.objects) lines.push(objectLine(o));
  lines.push('];');
  lines.push('');
  lines.push('/** 사물 그림은 한 장(아틀라스)으로 묶여 있다(6-3). public/world/ 안의 그림 파일과 틀 목록 파일 */');
  lines.push(`export const OBJECT_ATLAS = { image: '${ATLAS_IMAGE}', data: '${ATLAS_DATA}' } as const;`);
  lines.push('');
  lines.push('/** 아틀라스에 든 틀 이름(그림 파일 이름에서 .svg를 뗀 것) */');
  lines.push('export const OBJECT_FRAMES: readonly string[] = [');
  for (const f of frames) lines.push(`  '${f}',`);
  lines.push('];');
  lines.push('');
  lines.push('/** 정거장 id → 누르기 영역(월드 px) */');
  lines.push('export const STATION_HITS: Readonly<Record<string, { x: number; y: number; w: number; h: number }>> = {');
  for (const id of hitIds) lines.push(`  ${id}: ${JSON.stringify(build.hits[id])},`);
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

export interface WorldManifest {
  sourceHash: string;
  chunkSize: number;
  /** 조각 파일 둘레의 여백(px). 파일 한 변은 chunkSize + 2 × chunkPad */
  chunkPad: number;
  cols: number;
  rows: number;
  chunks: string[];
  /** 아틀라스에 든 사물 그림(world-src/sprites/의 파일 이름) */
  sprites: string[];
  /** 사물 그림 한 장(6-3): 그림 파일, 틀 목록 파일, 크기, 그림 원본 해시 */
  atlas: { image: string; data: string; width: number; height: number; hash: string };
  /** 악보 지도 배경 그림 */
  overview: { file: string; width: number; height: number };
}

export function renderManifest(build: WorldBuild, hash: string): string {
  const atlas = planAtlas(build.sprites);
  const manifest: WorldManifest = {
    sourceHash: hash,
    chunkSize: CHUNK_SIZE,
    chunkPad: CHUNK_PAD,
    cols: CHUNK_COLS,
    rows: CHUNK_ROWS,
    chunks: allChunkFiles(),
    sprites: Object.keys(build.sprites).sort(),
    atlas: { image: ATLAS_IMAGE, data: ATLAS_DATA, width: atlas.layout.width, height: atlas.layout.height, hash: atlas.hash },
    overview: { file: OVERVIEW_NAME, width: OVERVIEW_W, height: OVERVIEW_H },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
