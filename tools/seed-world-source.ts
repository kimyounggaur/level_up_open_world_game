// 사물 원본의 첫 씨앗 만들기(설계서 6-3, 처음 한 번): 5단계까지 코드(world-src/outer.ts, village.ts, trees.ts)가 계산하던 나무와 표지판의 자리를
// Tiled 지도(world-src/regions/<지역>.tmj)와 사물 그림(world-src/sprites/*.svg)으로 옮겨 쓴다.
// 그 뒤로 사물은 지도 파일이 원본이다. 이 도구는 이미 있는 파일을 덮어쓰지 않는다(--force를 주면 덮어써서 손으로 고친 것이 사라진다).
//   npm run seed:world-source
import fs from 'node:fs';
import path from 'node:path';
import { REGION_IDS, TILE, WORLD_TILES_X, WORLD_TILES_Y } from '../src/domain/world';
import type { RegionId } from '../src/domain/world';
import { SIGN_FOOT, SIGN_SIZE, outerRoads, riverCenter, scatterTrees, signSpecs, signpostSvg } from '../world-src/outer';
import { renderTiledMap } from '../world-src/tiled';
import type { TiledObjectInput } from '../world-src/tiled';
import { TRUNK_DROP, TRUNK_RADIUS, treeSpriteFile, treeSpriteSvg } from '../world-src/trees';
import type { TreeSpec } from '../world-src/trees';
import { villageTrees } from '../world-src/village';
import { loadRegionDefs } from './world-files';
import { MAPS_DIR, SPRITES_DIR } from './world-source';

const spriteOf = (file: string): string => file.replace(/\.svg$/, '');

/** 나무 하나를 지도의 점 사물로 */
function treeObject(t: TreeSpec): TiledObjectInput {
  return {
    name: t.id,
    kind: 'tree',
    x: t.cx,
    y: t.cy,
    point: true,
    // 그림 크기(w, h)와 가운데 기준점(ax 0.5)은 기본값이라 적지 않는다. 줄기 발은 캐노피 가운데보다 반지름의 절반 아래이다
    props: { sprite: spriteOf(treeSpriteFile(t)), ay: 0.5, footDy: t.r * TRUNK_DROP, blockR: Math.round(t.r * TRUNK_RADIUS * 100) / 100, shadowR: t.r },
  };
}

function main(): void {
  const root = process.cwd();
  const force = process.argv.includes('--force');
  const regions = loadRegionDefs(root);
  const roads = outerRoads();
  const river = riverCenter();
  const signs = signSpecs(regions);
  const outerTrees = scatterTrees({ regions, roads, river, signs });

  const byRegion = new Map<RegionId, TiledObjectInput[]>(REGION_IDS.map((id) => [id, []]));
  const sprites = new Map<string, string>();
  for (const t of [...villageTrees(), ...outerTrees]) {
    byRegion.get(t.regionId)!.push(treeObject(t));
    sprites.set(treeSpriteFile(t), treeSpriteSvg(t.regionId, t.r));
  }
  for (const s of signs) {
    byRegion.get(s.regionId)!.push({
      name: `sign-${s.stationId}`,
      kind: 'sign',
      x: s.x,
      y: s.y,
      point: true,
      // 표지판은 그림(120×120)의 아래 가운데 근처가 발이다. 누르기 영역은 발에서 (−48, −104), 96×112
      props: { sprite: spriteOf(s.file), ay: SIGN_FOOT.y / SIGN_SIZE.h, station: s.stationId, blockR: 14, hitDx: s.hit.x - s.x, hitDy: s.hit.y - s.y, hitW: s.hit.w, hitH: s.hit.h },
    });
    sprites.set(s.file, signpostSvg(s.regionId));
  }

  const mapsDir = path.join(root, MAPS_DIR);
  const spritesDir = path.join(root, SPRITES_DIR);
  fs.mkdirSync(mapsDir, { recursive: true });
  fs.mkdirSync(spritesDir, { recursive: true });
  let written = 0;
  let skipped = 0;
  const write = (file: string, text: string): void => {
    if (fs.existsSync(file) && !force) {
      skipped++;
      return;
    }
    fs.writeFileSync(file, text);
    written++;
  };
  for (const id of REGION_IDS) write(path.join(mapsDir, `${id}.tmj`), renderTiledMap(byRegion.get(id)!, { width: WORLD_TILES_X, height: WORLD_TILES_Y, tile: TILE }));
  for (const [file, svg] of [...sprites].sort(([a], [b]) => (a < b ? -1 : 1))) write(path.join(spritesDir, file), svg);
  console.log(`지도 ${REGION_IDS.length}개와 그림 ${sprites.size}개 중 ${written}개를 썼어요${skipped > 0 ? `(이미 있어서 건너뛴 파일 ${skipped}개)` : ''}.`);
}

main();
