// 사물 그림 아틀라스 굽기(설계서 6-3): world-src/sprites/*.svg → public/world/objects.webp + objects.json.
// 그림은 2배로 칠해 무손실 WebP 한 장에 쌓는다. build-world와 build-atlas가 같은 함수를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import { OBJECT_BAKE_SCALE } from '../src/world/objects';
import { ATLAS_DATA, ATLAS_IMAGE, frameName, layoutOf, renderAtlasJson, spritesHash } from '../world-src/atlas';
import type { AtlasLayout } from '../world-src/atlas';

export interface AtlasBake {
  layout: AtlasLayout;
  hash: string;
  /** objects.json의 글 */
  json: string;
  imageBytes: number;
}

/** 칠하지 않고 자리만 잡아 objects.json의 글을 만든다(낡았는지 보는 검사에 쓴다) */
export function planAtlas(sprites: Readonly<Record<string, string>>): { layout: AtlasLayout; hash: string; json: string } {
  const layout = layoutOf(sprites);
  const hash = spritesHash(sprites);
  return { layout, hash, json: renderAtlasJson(layout, hash) };
}

export async function bakeAtlas(sprites: Readonly<Record<string, string>>, outDir: string): Promise<AtlasBake> {
  const { layout, hash, json } = planAtlas(sprites);
  const bySprite = new Map(Object.entries(sprites).map(([file, svg]) => [frameName(file), svg]));
  const layers: OverlayOptions[] = [];
  for (const f of layout.frames) {
    const svg = bySprite.get(f.name)!;
    // 2배 밀도로 칠하고, 크기가 소수라 올림한 경우만 틀 크기에 맞춰 늘린다
    let png = await sharp(Buffer.from(svg), { density: 72 * OBJECT_BAKE_SCALE }).png().toBuffer();
    const meta = await sharp(png).metadata();
    if (meta.width !== f.w || meta.height !== f.h) png = await sharp(png).resize(f.w, f.h, { fit: 'fill' }).png().toBuffer();
    layers.push({ input: png, left: f.x, top: f.y });
  }
  fs.mkdirSync(outDir, { recursive: true });
  const info = await sharp({ create: { width: layout.width, height: layout.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    // quality는 무손실에서 압축에 들이는 힘이다(화소는 그대로). 세로를 4096→2160으로 줄이니 기본값(80)에서는 파일이 133,616 B→180,196 B로 늘었고(같은 화소),
    // 100에서는 124,356 B다. 굽는 시간은 약 2초→6초다(8-4).
    .webp({ lossless: true, effort: 6, quality: 100 })
    .toFile(path.join(outDir, ATLAS_IMAGE));
  fs.writeFileSync(path.join(outDir, ATLAS_DATA), json);
  return { layout, hash, json, imageBytes: info.size };
}
