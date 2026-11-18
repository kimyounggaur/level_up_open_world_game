// 월드 바닥 굽기(설계서 10.5, 9.6): world-src/의 원본 → 바닥 조각 48장(1024×1024 + 둘레 2 px 여백), 사물 SVG, 막힌 칸 표.
//   npm run build:world            조각과 생성 파일을 다시 굽는다
//   npm run build:world -- --check 굽지 않고 생성 파일이 원본과 맞는지만 본다(낡았으면 1로 끝난다)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CHUNK_COLS, CHUNK_PAD, CHUNK_ROWS, CHUNK_SIZE, OVERVIEW_H, OVERVIEW_SCALE, OVERVIEW_W, REGION_IDS, WORLD_H, WORLD_TILES_X, WORLD_TILES_Y, WORLD_W } from '../src/domain/world';
import { ATLAS_DATA, ATLAS_IMAGE } from '../world-src/atlas';
import { buildWorld } from '../world-src/index';
import { embedFrottageMaterials } from './frottage-materials';
import { artTransform, BUILDING_ART_PLACEMENTS, ENVIRONMENT_ART, EXTRA_ART_PLACEMENTS } from '../src/world/remaster';
import type { WorldBuild } from '../world-src/index';
import { groundTint } from '../world-src/palette';
import { bakeAtlas, planAtlas } from './atlas';
import { loadWorldSource } from './world-source';
import { GENERATED_PATH, MANIFEST_NAME, OVERVIEW_NAME, WORLD_PUBLIC_DIR, allChunkFiles, chunkFileName, loadRegionDefs, renderManifest, renderWorldDataTs, sourceHashOf } from './world-files';

/** 지역 경계에서 바닥색이 섞이는 폭(3.2: 200 px). 칸 단위 가우스 번짐의 시그마 */
const TINT_BLUR_TILES = 2.4;
const WEBP_QUALITY = 84;
const OVERVIEW_WEBP_QUALITY = 80;
/** 악보 지도 그림에서 조각 하나가 차지하는 한 변(px): 1024 × 0.25 */
const OVERVIEW_TILE = CHUNK_SIZE * OVERVIEW_SCALE;
const BACKGROUND_HEX = '#DDE5D3';

const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** 칸마다 지역 바닥색을 칠한 작은 그림을 번지게 해서 월드 크기로 키운다. 바닥 조각의 밑칠이다 */
async function tintBase(build: WorldBuild): Promise<Buffer> {
  const small = Buffer.alloc(WORLD_TILES_X * WORLD_TILES_Y * 3);
  const colors = REGION_IDS.map((id) => hexToRgb(groundTint(id)));
  for (let i = 0; i < build.regionTiles.length; i++) {
    const [r, g, b] = colors[build.regionTiles[i]!]!;
    small[i * 3] = r;
    small[i * 3 + 1] = g;
    small[i * 3 + 2] = b;
  }
  // sharp는 한 파이프라인 안에서 크기 조절을 번짐보다 먼저 하므로, 번지게 한 뒤 따로 키운다
  const blurred = await sharp(small, { raw: { width: WORLD_TILES_X, height: WORLD_TILES_Y, channels: 3 } })
    .blur(TINT_BLUR_TILES)
    .raw()
    .toBuffer();
  return sharp(blurred, { raw: { width: WORLD_TILES_X, height: WORLD_TILES_Y, channels: 3 } })
    .resize(WORLD_W, WORLD_H, { kernel: 'cubic' })
    .raw()
    .toBuffer();
}

/** 파일 한 변: 조각 + 둘레 여백(이웃 그림을 겹쳐 구워 이음선을 막는다) */
const BAKED_SIZE = CHUNK_SIZE + 2 * CHUNK_PAD;

/** 조각 하나의 겉그림: 월드 좌표의 SVG를 이 조각의 창(viewBox, 둘레 여백 포함)으로 잘라 그린다 */
const overlaySvg = (build: WorldBuild, c: number, r: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${BAKED_SIZE}" height="${BAKED_SIZE}" viewBox="${c * CHUNK_SIZE - CHUNK_PAD} ${r * CHUNK_SIZE - CHUNK_PAD} ${BAKED_SIZE} ${BAKED_SIZE}">${build.svgBody}</svg>`;

/** 월드 바깥으로 CHUNK_PAD만큼 가장자리를 복제해 늘린 밑칠. 월드 가장자리 조각도 같은 방식으로 자를 수 있다 */
const padBase = (base: Buffer): Promise<Buffer> =>
  sharp(base, { raw: { width: WORLD_W, height: WORLD_H, channels: 3 } })
    .extend({ top: CHUNK_PAD, bottom: CHUNK_PAD, left: CHUNK_PAD, right: CHUNK_PAD, extendWith: 'copy' })
    .raw()
    .toBuffer();

/** 조각 하나를 굽는다. 파일 크기와, 악보 지도 그림에 붙일 줄인 조각(여백을 뺀 1024 → 256 px)을 돌려준다 */
async function bakeChunk(padded: Buffer, build: WorldBuild, c: number, r: number, outDir: string): Promise<{ size: number; tile: Buffer }> {
  // 늘린 밑칠에서는 월드 좌표 x가 x + CHUNK_PAD이므로, 여백을 포함한 조각은 (c × 조각, r × 조각)에서 시작한다
  const ground = await sharp(padded, { raw: { width: WORLD_W + 2 * CHUNK_PAD, height: WORLD_H + 2 * CHUNK_PAD, channels: 3 } })
    .extract({ left: c * CHUNK_SIZE, top: r * CHUNK_SIZE, width: BAKED_SIZE, height: BAKED_SIZE })
    .png()
    .toBuffer();
  const overlay = await sharp(Buffer.from(overlaySvg(build, c, r))).png().toBuffer();
  const full = await sharp(ground).composite([{ input: overlay }]).png().toBuffer();
  const file = path.join(outDir, chunkFileName(c, r));
  const info = await sharp(full).webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(file);
  const tile = await sharp(full)
    .extract({ left: CHUNK_PAD, top: CHUNK_PAD, width: CHUNK_SIZE, height: CHUNK_SIZE })
    .resize(OVERVIEW_TILE, OVERVIEW_TILE, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return { size: info.size, tile };
}

/** 줄인 조각 48장을 이어 붙여 악보 지도 배경 그림 한 장을 굽는다 */
async function bakeOverview(tiles: Array<{ c: number; r: number; tile: Buffer }>, outDir: string): Promise<number> {
  // Terrain chunks omit the old flat roofs. The overview uses the very same
  // supplied paintings and foot transforms as the live world layer.
  const artwork = await Promise.all([...BUILDING_ART_PLACEMENTS, EXTRA_ART_PLACEMENTS[0]!].map(async (p) => {
    const transform = artTransform(p);
    const width = Math.max(1, Math.round(transform.width * OVERVIEW_SCALE));
    const height = Math.max(1, Math.round(transform.height * OVERVIEW_SCALE));
    return {
      input: await sharp(path.join(process.cwd(), 'public', ENVIRONMENT_ART[p.asset].path)).resize(width, height).png().toBuffer(),
      left: Math.round(p.x * OVERVIEW_SCALE - transform.ax * width),
      top: Math.round(p.y * OVERVIEW_SCALE - transform.ay * height),
    };
  }));
  const info = await sharp({ create: { width: OVERVIEW_W, height: OVERVIEW_H, channels: 3, background: BACKGROUND_HEX } })
    .composite([...tiles.map((t) => ({ input: t.tile, left: t.c * OVERVIEW_TILE, top: t.r * OVERVIEW_TILE })), ...artwork])
    .webp({ quality: OVERVIEW_WEBP_QUALITY, effort: 5 })
    .toFile(path.join(outDir, OVERVIEW_NAME));
  return info.size;
}

function main(): Promise<void> {
  const root = process.cwd();
  const check = process.argv.includes('--check');
  const regions = loadRegionDefs(root);
  const build = buildWorld(regions, loadWorldSource(root));
  if (build.issues.length > 0) {
    console.error(`월드 점검에서 문제가 ${build.issues.length}건 나왔어요:\n- ${build.issues.join('\n- ')}`);
    process.exit(1);
  }
  const hash = sourceHashOf(build);
  const ts = renderWorldDataTs(build, hash);
  const manifest = renderManifest(build, hash);
  const outDir = path.join(root, WORLD_PUBLIC_DIR);

  if (check) {
    const problems: string[] = [];
    const genFile = path.join(root, GENERATED_PATH);
    if (!fs.existsSync(genFile) || fs.readFileSync(genFile, 'utf-8') !== ts) problems.push(`${GENERATED_PATH}가 원본과 달라요`);
    const mf = path.join(outDir, MANIFEST_NAME);
    if (!fs.existsSync(mf) || fs.readFileSync(mf, 'utf-8') !== manifest) problems.push(`${WORLD_PUBLIC_DIR}/${MANIFEST_NAME}이 원본과 달라요`);
    for (const f of [...allChunkFiles(), ATLAS_IMAGE, ATLAS_DATA, OVERVIEW_NAME]) if (!fs.existsSync(path.join(outDir, f))) problems.push(`${WORLD_PUBLIC_DIR}/${f}가 없어요`);
    const atlasFile = path.join(outDir, ATLAS_DATA);
    if (fs.existsSync(atlasFile) && fs.readFileSync(atlasFile, 'utf-8') !== planAtlas(build.sprites).json) problems.push(`${WORLD_PUBLIC_DIR}/${ATLAS_DATA}가 사물 그림 원본과 달라요`);
    if (problems.length > 0) {
      console.error(`월드가 낡았어요. npm run build:world를 실행하세요:\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`월드가 원본과 맞아요 (해시 ${hash})`);
    return Promise.resolve();
  }

  return (async () => {
    const started = Date.now();
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(path.dirname(path.join(root, GENERATED_PATH)), { recursive: true });

    const base = await padBase(await tintBase(build));
    const bakeBuild = { ...build, svgBody: await embedFrottageMaterials(build.svgBody, root) };
    let total = 0;
    const jobs: Array<[number, number]> = [];
    for (let r = 0; r < CHUNK_ROWS; r++) for (let c = 0; c < CHUNK_COLS; c++) jobs.push([c, r]);
    const sizes: number[] = [];
    const tiles: Array<{ c: number; r: number; tile: Buffer }> = [];
    for (let i = 0; i < jobs.length; i += 4) {
      const batch = jobs.slice(i, i + 4);
      const done = await Promise.all(batch.map(([c, r]) => bakeChunk(base, bakeBuild, c, r, outDir)));
      done.forEach((d, k) => {
        sizes.push(d.size);
        tiles.push({ c: batch[k]![0], r: batch[k]![1], tile: d.tile });
      });
    }
    total = sizes.reduce((a, b) => a + b, 0);
    const overviewSize = await bakeOverview(tiles, outDir);

    // 사물 그림: 한 장(아틀라스)으로 묶는다(6-3)
    const atlas = await bakeAtlas(build.sprites, outDir);
    // 목록에 없는 낡은 파일을 지운다(5단계까지 낱장으로 내보내던 obj-*.svg 포함)
    const keep = new Set<string>([...allChunkFiles(), ATLAS_IMAGE, ATLAS_DATA, MANIFEST_NAME, OVERVIEW_NAME]);
    for (const f of fs.readdirSync(outDir)) if (!keep.has(f) && /^(ground-.*\.webp|obj-.*\.svg)$/.test(f)) fs.rmSync(path.join(outDir, f));
    fs.writeFileSync(path.join(outDir, MANIFEST_NAME), manifest);
    fs.writeFileSync(path.join(root, GENERATED_PATH), ts);

    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    console.log(`바닥 조각 ${jobs.length}장 ${(total / 1024).toFixed(0)} KB (한 장 ${(min / 1024).toFixed(0)}–${(max / 1024).toFixed(0)} KB), 지도 그림 ${OVERVIEW_W}×${OVERVIEW_H} ${(overviewSize / 1024).toFixed(0)} KB, 사물 그림 ${Object.keys(build.sprites).length}개를 한 장 ${atlas.layout.width}×${atlas.layout.height} ${(atlas.imageBytes / 1024).toFixed(0)} KB로 묶음, 해시 ${hash}, ${((Date.now() - started) / 1000).toFixed(1)}초`);
    console.log(`막힌 칸 표: 걸을 수 있는 칸 ${build.stats.freeCells}/${WORLD_TILES_X * WORLD_TILES_Y}, 사물 ${build.objects.length}개(나무 ${build.stats.trees}, 표지판 ${build.stats.signs}, 소품 ${build.stats.props}), 메운 틈 ${build.stats.closedGaps.length}칸`);
  })();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
