// Supplied material artwork is baked into the world once, never fetched by the
// game renderer. Reflection at tile edges avoids abrupt seams in these studies.
import manifest from '../../public/assets/remaster/frottage/asset_manifest.json';
import { WORLD_H, WORLD_W } from '../../src/domain/world';
import { BUILDING_ART_PLACEMENTS, ENVIRONMENT_ART, EXTRA_ART_PLACEMENTS } from '../../src/world/remaster';
import { polylineD } from '../curves';
import type { RoadSegment } from '../curves';
import { FORDS, MILL_PONDS, RIVER_HALF_WIDTH, riverCenter } from '../outer';

export const FROTTAGE_MATERIALS = manifest.assets.filter((a) => a.category === 'materials').map((a) => {
  const file = a.webp!;
  return { id: a.id, path: file.path, sha256: file.sha256 };
});
export const materialFill = (id: string): string => `url(#frottage-${id})`;

/** Source hashes participate in WORLD_SOURCE_HASH; baking verifies every file. */
export function frottageDefsSvg(): string {
  // The overview bakes these same live-world paintings. Include their placement
  // and alpha bounds so `check:world` catches later positioning/source changes.
  const overviewArt = [...BUILDING_ART_PLACEMENTS, EXTRA_ART_PLACEMENTS[0]!].map((p) => ({ ...p, source: ENVIRONMENT_ART[p.asset] }));
  const marker = `<!-- overview-art:${JSON.stringify(overviewArt)} -->`;
  return marker + '<defs>' + FROTTAGE_MATERIALS.map(({ id, sha256 }) => {
    const size = id === 'tex-aged-spruce' ? 192 : 384;
    const image = `<use href="#frottage-image-${id}"/>`;
    return `<!-- ${id}:${sha256} --><image id="frottage-image-${id}" href="frottage:${id}" width="${size}" height="${size}" preserveAspectRatio="none"/><pattern id="frottage-${id}" width="${size * 2}" height="${size * 2}" patternUnits="userSpaceOnUse">${image}<g transform="translate(${size * 2} 0) scale(-1 1)">${image}</g><g transform="translate(0 ${size * 2}) scale(1 -1)">${image}</g><g transform="translate(${size * 2} ${size * 2}) scale(-1 -1)">${image}</g></pattern>`;
  }).join('') + '</defs>';
}

export const frottageGrassSvg = (): string => `<rect width="${WORLD_W}" height="${WORLD_H}" fill="${materialFill('tex-sage-grass')}" opacity="0.44"/>`;

export function frottageRoadsSvg(roads: readonly RoadSegment[]): string {
  return roads.map((r) => `<path d="${polylineD(r.points)}" fill="none" stroke="${materialFill('tex-sandy-path')}" stroke-width="${r.width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.52"/>`).join('');
}

/** Match the same river/pond extents as navigation, without changing any cell. */
export function frottageWaterSvg(): string {
  const rects = [...FORDS, ...MILL_PONDS].map(({ x, y, w, h }) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="${materialFill('tex-jade-water')}" opacity="0.4"/>`).join('');
  return `<path d="${polylineD(riverCenter())}" fill="none" stroke="${materialFill('tex-jade-water')}" stroke-width="${RIVER_HALF_WIDTH * 2}" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>${rects}`;
}
