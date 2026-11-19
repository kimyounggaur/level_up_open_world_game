import type Phaser from 'phaser';
import type { ArtPlacement } from './remaster';
import { artTransform, environmentKey } from './remaster';
import { FONT } from './installations/palette';

export function placeArtwork(scene: Phaser.Scene, p: ArtPlacement): Phaser.GameObjects.Image {
  const t = artTransform(p);
  const image = scene.add.image(p.x, p.y, environmentKey(p.asset))
    .setOrigin(t.ax, t.ay).setDisplaySize(t.width, t.height).setDepth(p.depth);
  if (p.rotation) {
    // The bridge rotates about its centre, keeping its walking surface on the
    // original east-west route rather than swinging it around a foot anchor.
    image.setOrigin(t.ax, (ENV_CENTER[p.asset] ?? 0.5)).setPosition(p.x, p.y - 65).setRotation(p.rotation);
  }
  if (p.label) scene.add.text(p.x, p.y + (p.labelY ?? 0), p.label, {
    fontFamily: FONT, fontSize: p.label === '𝄞' ? '24px' : '12px', color: '#173d38',
    backgroundColor: '#f4ecd3', padding: { x: 3, y: 1 }, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(p.depth + 0.1);
  return image;
}

const ENV_CENTER: Partial<Record<ArtPlacement['asset'], number>> = { 'prop-stone-footbridge': 0.5 };
