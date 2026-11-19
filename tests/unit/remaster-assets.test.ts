import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDING_ART_PLACEMENTS, ENVIRONMENT_ART, artTransform } from '../../src/world/remaster';

const root = process.cwd();
describe('supplied remaster assets', () => {
  it('ships every supplied environment asset byte-for-byte, including the blank UI vectors', () => {
    const base = path.join(root, 'public/assets/remaster/frottage');
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'asset_manifest.json'), 'utf8'));
    expect(manifest.assets).toHaveLength(37);
    for (const a of manifest.assets) {
      const file = a.webp ?? a.svg;
      const bytes = fs.readFileSync(path.join(base, file.path));
      expect(createHash('sha256').update(bytes).digest('hex'), a.id).toBe(file.sha256);
    }
  });

  it('contains all 8 identities and all 4 player directions with a consistent foot anchor', () => {
    const base = path.join(root, 'public/assets/remaster/characters');
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
    const atlas = JSON.parse(fs.readFileSync(path.join(base, 'atlas.json'), 'utf8'));
    expect(manifest.characters).toHaveLength(8);
    for (const c of manifest.characters) expect(fs.existsSync(path.join(base, c.portrait)), c.part).toBe(true);
    for (const direction of ['up', 'down', 'left', 'right']) {
      for (const [pose, count] of [['idle', 2], ['walk', 6]] as const) {
        for (let i = 0; i < count; i++) expect(atlas.frames[`chr-player-${direction}-${pose}-${i}`]).toBeDefined();
      }
    }
    expect(manifest.foot).toEqual([48, 136]);
  });

  it('fits each workshop into its existing footprint without distorting the source image', () => {
    for (const p of BUILDING_ART_PLACEMENTS) {
      const source = ENVIRONMENT_ART[p.asset];
      const t = artTransform(p);
      const [left, top, right, bottom] = source.bounds;
      const scale = t.width / source.width;
      expect(t.width / t.height).toBeCloseTo(source.width / source.height);
      expect((right! - left!) * scale).toBeLessThanOrEqual(p.w + .0001);
      expect((bottom! - top!) * scale).toBeLessThanOrEqual(p.h + .0001);
      expect(t.ay * source.height).toBe(bottom);
    }
  });
});
