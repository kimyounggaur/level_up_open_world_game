// 월드 사물 원본을 파일에서 읽는다(설계서 6-3): 지도(world-src/regions/*.tmj)와 사물 그림(world-src/sprites/*.svg).
// 지도는 지역 순서(REGION_IDS)대로, 그 밖의 이름은 이름순으로 뒤에 읽는다. 굽기 도구와 시험이 같은 함수를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { REGION_IDS, TILE, WORLD_TILES_X, WORLD_TILES_Y } from '../src/domain/world';
import type { WorldSource } from '../world-src/index';
import { parseTiledMap } from '../world-src/tiled';
import type { TiledMap } from '../world-src/tiled';

export const MAPS_DIR = 'world-src/regions';
export const SPRITES_DIR = 'world-src/sprites';

const MAP_DIMS = { width: WORLD_TILES_X, height: WORLD_TILES_Y, tile: TILE };

/** 지도 파일 이름을 읽는 차례로 정렬한다: 지역 id 순서가 먼저, 나머지는 이름순 */
export function orderMapFiles(files: readonly string[]): string[] {
  const rank = (f: string): number => {
    const i = (REGION_IDS as readonly string[]).indexOf(f.replace(/\.tmj$/, ''));
    return i < 0 ? REGION_IDS.length : i;
  };
  return [...files].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
}

/** 글 목록에서 지도를 읽는다(파일 입출력 없음: 시험이 메모리의 글을 넣을 수 있다) */
export function parseWorldSource(mapTexts: ReadonlyArray<{ file: string; text: string }>, sprites: Record<string, string>): WorldSource {
  const maps: TiledMap[] = [];
  const issues: string[] = [];
  for (const { file, text } of mapTexts) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      issues.push(`${file}: JSON으로 읽을 수 없어요(${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    const parsed = parseTiledMap(raw, file, MAP_DIMS);
    issues.push(...parsed.issues);
    if (parsed.map) maps.push(parsed.map);
  }
  return { maps, sprites, issues };
}

export function loadWorldSource(root: string): WorldSource {
  const mapsDir = path.join(root, MAPS_DIR);
  const spritesDir = path.join(root, SPRITES_DIR);
  const mapFiles = fs.existsSync(mapsDir) ? orderMapFiles(fs.readdirSync(mapsDir).filter((f) => f.endsWith('.tmj'))) : [];
  const texts = mapFiles.map((f) => ({ file: `${MAPS_DIR}/${f}`, text: fs.readFileSync(path.join(mapsDir, f), 'utf-8') }));
  const sprites: Record<string, string> = {};
  if (fs.existsSync(spritesDir)) {
    for (const f of fs.readdirSync(spritesDir).filter((x) => x.endsWith('.svg')).sort()) sprites[f] = fs.readFileSync(path.join(spritesDir, f), 'utf-8');
  }
  return parseWorldSource(texts, sprites);
}
