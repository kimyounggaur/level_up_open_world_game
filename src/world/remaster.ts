// Supplied artwork is loaded unchanged. Alpha bounds align its visible feet with
// the existing map, independently of transparent margins or source resolution.
import art from './remasterAssets.json';
import type { WorldObjectData } from './objects';

export type EnvironmentArt = keyof typeof art;
export const ENVIRONMENT_ART = art;
export const environmentKey = (id: EnvironmentArt): string => `frottage-${id}`;
export interface ArtPlacement {
  asset: EnvironmentArt;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  label?: string;
  labelY?: number;
  rotation?: number;
}

export const BUILDING_ART_PLACEMENTS: readonly ArtPlacement[] = [
  { asset: 'bld-h1-pitch-workshop', x: 3219, y: 2898, w: 618, h: 354, depth: 2886 },
  { asset: 'bld-h2-rhythm-workshop', x: 4956, y: 2790, w: 570, h: 384, depth: 2778 },
  { asset: 'bld-h3-harmony-workshop', x: 3273, y: 3816, w: 594, h: 336, depth: 3804 },
];

/** Convert the visible alpha rectangle to a full-image transform, without
 * stretching the illustration. x/y refer to the centre of its visible feet. */
export function artTransform(p: ArtPlacement): { width: number; height: number; ax: number; ay: number } {
  const a = art[p.asset];
  const [left, top, right, bottom] = a.bounds as [number, number, number, number];
  const scale = Math.min(p.w / (right - left), p.h / (bottom - top));
  return { width: a.width * scale, height: a.height * scale, ax: ((left + right) / 2) / a.width, ay: bottom / a.height };
}

/** Geometry and interaction targets stay in world-src. Only their pictures change. */
export function objectArtwork(ob: WorldObjectData): ArtPlacement | null {
  if (ob.kind === 'tree') {
    return { asset: ob.file.includes('bell-grove') ? 'prop-bell-grove-tree' : 'prop-village-tree', x: ob.x, y: ob.sortY, w: ob.w * 1.18, h: ob.h * 1.3, depth: ob.sortY };
  }
  if (ob.kind === 'sign') return { asset: 'prop-wayfinding-sign', x: ob.x, y: ob.y, w: 112, h: 100, depth: ob.sortY, label: ob.stationId, labelY: -52 };
  const ids: Record<string, EnvironmentArt> = {
    'obj-staff-hill-weathervane': 'lm-staff-hill-windvane',
    'obj-scale-trail-gazebo': 'lm-scale-trail-gazebo',
    'obj-key-marsh-tuning-tower': 'lm-key-marsh-tuning-tower',
    'obj-bell-grove-echo-wall': 'lm-bell-grove-echo-wall',
  };
  const asset = ids[ob.file.replace(/\.svg$/, '')];
  if (!asset) return null;
  return { asset, x: ob.x, y: ob.y, w: ob.w, h: ob.h, depth: ob.sortY,
    ...(asset === 'lm-key-marsh-tuning-tower' ? { label: 'A4 · 440 Hz', labelY: -26 } : {}),
    ...(asset === 'lm-staff-hill-windvane' ? { label: '𝄞', labelY: -126 } : {}),
  };
}

// Decorative shells sit beside the playable music grids. Their original notes,
// slots and rotating beat indicators continue to be drawn by InstallationLayer.
export const EXTRA_ART_PLACEMENTS: readonly ArtPlacement[] = [
  { asset: 'bld-ensemble-stage', x: 4056, y: 3057, w: 330, h: 210, depth: -50_000 },
  { asset: 'lm-beat-river-waterwheel-shell', x: 6370, y: 2155, w: 150, h: 150, depth: 2155 },
  { asset: 'lm-bell-grove-bell-tower-shell', x: 1290, y: 2420, w: 125, h: 250, depth: 2420 },
  { asset: 'prop-stone-footbridge', x: 7010, y: 3146, w: 142, h: 430, depth: -50_000, rotation: Math.PI / 2 },
  { asset: 'prop-limestone-rock', x: 5680, y: 2860, w: 110, h: 90, depth: 2860 },
  { asset: 'prop-limestone-rock', x: 2656, y: 4240, w: 90, h: 70, depth: 4240 },
  { asset: 'prop-brass-lantern', x: 3865, y: 2975, w: 24, h: 70, depth: 2975 },
  { asset: 'prop-brass-lantern', x: 4250, y: 2975, w: 24, h: 70, depth: 2975 },
];
