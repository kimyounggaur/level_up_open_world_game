// 월드 바닥과 사물의 색. 시안 B01에서 읽은 값과 부록 B.2의 지역 강조색이다(설계서 9.2).
import type { RegionId } from '../src/domain/world';

export const COLOR = {
  ground: '#DDE5D3',
  dot: '#ABBDA5',
  patchA: '#CCDABC',
  patchB: '#BDCEB6',
  roadEdge: '#CBC5AC',
  road: '#EEE4C9',
  roadDash: '#DDD1B3',
  plazaOuter: '#C7BBA1',
  plaza: '#EFE7D6',
  plazaRing: '#D3C7AF',
  teal: '#17675D',
  white: '#FFFEFA',
  stage: '#B77C60',
  stageTop: '#D09A76',
  stageLine: '#E7B995',
  stool: '#8E7663',
  buildingShadow: '#B7BDA6',
  doorStep: '#EEE4CD',
  doorLine: '#BEAF92',
  hedge: '#9FB493',
  hedgeShadow: '#B7C5AA',
  stone: '#EFE6CB',
  stoneEdge: '#BDCAA9',
  treeShadow: '#B6C3AA',
  canopy: '#7F9A7A',
  canopyLight: '#92AC87',
  vein: '#759270',
  benchSeat: '#B18C67',
  benchDark: '#957455',
  // 시안에 없는 바깥 지역용 색(같은 채도와 명도로 맞춘다)
  bank: '#D8D7BC',
  water: '#9DC3CB',
  waterLight: '#B3D4D9',
  ripple: '#D3E7E9',
  plank: '#B18C67',
  plankLine: '#957455',
  fenceBand: '#CBD5BF',
  signBoard: '#E9DDB8',
  signPole: '#957455',
} as const;

/** 지역 강조색(9.2). content/regions의 accentColor와 같아야 한다 — 같은지는 테스트가 확인한다 */
export const ACCENT: Readonly<Record<RegionId, string>> = {
  village: '#17675D',
  'staff-hill': '#7F9A7A',
  'beat-river': '#5E97A6',
  'bell-grove': '#B18B49',
  'scale-trail': '#C2AA70',
  'key-marsh': '#8E86A8',
};

const toRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) throw new Error(`#RRGGBB 형식이 아니에요: ${hex}`);
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const toHex = (r: number, g: number, b: number): string => '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** a에 b를 t(0–1)만큼 섞는다 */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** 지역 바닥색: 마을은 시안의 바닥색 그대로, 그 밖은 강조색을 조금 섞는다. 지역 경계에서는 200 px에 걸쳐 섞인다(3.2) */
export const GROUND_TINT_STRENGTH = 0.2;
export const groundTint = (id: RegionId): string => (id === 'village' ? COLOR.ground : mixHex(COLOR.ground, ACCENT[id], GROUND_TINT_STRENGTH));

export interface TreeStyle {
  canopy: string;
  light: string;
  vein: string;
}

/** 나무 색: 시안의 나무 색에 지역 강조색을 섞은 변형(9.3 '지역마다 색 변형') */
export function treeStyle(id: RegionId): TreeStyle {
  if (id === 'village' || id === 'staff-hill') return { canopy: COLOR.canopy, light: COLOR.canopyLight, vein: COLOR.vein };
  const k = 0.3;
  return {
    canopy: mixHex(COLOR.canopy, ACCENT[id], k),
    light: mixHex(COLOR.canopyLight, ACCENT[id], k),
    vein: mixHex(COLOR.vein, ACCENT[id], k),
  };
}
