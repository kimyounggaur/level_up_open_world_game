import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { embedFrottageMaterials } from '../../tools/frottage-materials';
import { frottageDefsSvg, materialFill } from '../../world-src/art/frottage';
import { villageFrontSvg } from '../../world-src/village';

describe('supplied frottage materials', () => {
  it('actually renders the delivered texture in the SVG baker', async () => {
    // librsvg silently ignores WebP data URLs. Verify visible grain rather than
    // merely checking that an image reference was written into the SVG.
    const svg = await embedFrottageMaterials(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">${frottageDefsSvg()}<rect width="96" height="96" fill="${materialFill('tex-sage-grass')}"/></svg>`, path.resolve(__dirname, '../..'));
    expect(svg).not.toContain('href="frottage:');
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const green: number[] = [];
    for (let i = 0; i < data.length; i += info.channels) {
      expect(data[i + 3]).toBe(255);
      green.push(data[i + 1]!);
    }
    expect(Math.max(...green) - Math.min(...green)).toBeGreaterThan(20);
    expect(green.reduce((sum, x) => sum + x, 0) / green.length).toBeGreaterThan(100);
  });

  it('omits the old roof geometry only for the remastered live floor', () => {
    const oldFloor = villageFrontSvg('painted');
    const newFloor = villageFrontSvg('remaster');
    expect(oldFloor.length).toBeGreaterThan(newFloor.length);
    expect(oldFloor).toContain('x="137"'); // H1 roof-window decoration
    expect(newFloor).not.toContain('x="137"');
    expect(newFloor).toContain(materialFill('tex-limestone'));
    expect(newFloor).toContain(materialFill('tex-aged-spruce'));
    expect(villageFrontSvg('mock')).not.toContain('frottage-');
  });
});
