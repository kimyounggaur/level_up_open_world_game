// Runtime artwork cut from the user's original 2026-11-18 character sheets.
// The frame names deliberately match playerLook(); mechanics and foot anchors stay unchanged.
import type Phaser from 'phaser';
import type { MusicianPart } from '../domain/festival';

export const CHARACTER_ATLAS_KEY = 'remaster-characters';
export const CHARACTER_ATLAS_IMAGE = 'assets/remaster/characters/atlas.webp';
export const CHARACTER_ATLAS_DATA = 'assets/remaster/characters/atlas.json';
export const CHARACTER_WORLD_WIDTH = 48;
export const CHARACTER_WORLD_HEIGHT = 72;
export const CHARACTER_FOOT_ORIGIN = 136 / 144;
export const musicianFrameName = (part: MusicianPart): string => `chr-${part}-standing`;

/** Keep a lightweight vector fallback if the asset could not be loaded. */
export function hasCharacterArt(scene: Phaser.Scene): boolean {
  return !!scene.textures?.exists(CHARACTER_ATLAS_KEY);
}

export function musicianImage(scene: Phaser.Scene, part: MusicianPart, x: number, y: number): Phaser.GameObjects.Image | null {
  if (!hasCharacterArt(scene)) return null;
  return scene.add.image(x, y, CHARACTER_ATLAS_KEY, musicianFrameName(part))
    .setOrigin(0.5, CHARACTER_FOOT_ORIGIN)
    .setDisplaySize(CHARACTER_WORLD_WIDTH, CHARACTER_WORLD_HEIGHT);
}
