import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { FROTTAGE_MATERIALS } from '../world-src/art/frottage';

/** Decode the original WebP pixels to PNG because librsvg cannot decode WebP.
 * The original delivered WebP stays unchanged and its digest is checked first. */
export async function embedFrottageMaterials(svg: string, root: string): Promise<string> {
  for (const material of FROTTAGE_MATERIALS) {
    const data = fs.readFileSync(path.join(root, 'public/assets/remaster/frottage', material.path));
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (hash !== material.sha256) throw new Error(`Frottage source differs from supplied manifest: ${material.path}`);
    const png = await sharp(data).resize(384, 384).png().toBuffer();
    svg = svg.replaceAll(`href="frottage:${material.id}"`, `href="data:image/png;base64,${png.toString('base64')}"`);
  }
  return svg;
}
