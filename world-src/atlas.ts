// 사물 그림을 한 장(아틀라스)으로 묶는 계산(설계서 6-3, 9.6, 10.2 tools/build-atlas). 순수 계산이다: 그림을 칠하고 파일로 쓰는 일은 tools/atlas.ts가 한다.
// 그림은 2배 크기로 구워 선명하게 한다(9.3). 틀 사이는 GAP px 비우고, 한 장의 가로는 MAX_WIDTH를 넘지 않는다.
import crypto from 'node:crypto';
import { OBJECT_BAKE_SCALE } from '../src/world/objects';
import { svgSize } from './placements';

export const ATLAS_MAX_WIDTH = 2048;
/** 이웃 틀의 그림이 번져 들어오지 않도록 틀 사이를 비운다(그림은 0.5배로 줄여 그려진다) */
export const ATLAS_GAP = 4;
export const ATLAS_IMAGE = 'objects.webp';
export const ATLAS_DATA = 'objects.json';

export interface AtlasFrame {
  /** 틀 이름: 그림 파일 이름에서 .svg를 뗀 것 */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  frames: AtlasFrame[];
}

const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/** 세로는 2의 거듭제곱이 아니라 이 배수로만 올린다(8-4). 쓴 높이가 2156 px일 때 4096으로 올리면 GPU에 쓰지 않는 그림 메모리가 15 MiB 남는다 */
export const ATLAS_HEIGHT_STEP = 16;
const roundUp = (n: number, step: number): number => Math.ceil(n / step) * step;

/** 그림 파일 이름 → 틀 이름 */
export const frameName = (file: string): string => file.replace(/\.svg$/, '');

/** 구운 크기(2배, 올림 없음 — SVG 크기가 정수가 아니면 올린다) */
export const bakedSize = (svg: string): { w: number; h: number } | null => {
  const s = svgSize(svg);
  return s ? { w: Math.ceil(s.width * OBJECT_BAKE_SCALE), h: Math.ceil(s.height * OBJECT_BAKE_SCALE) } : null;
};

/**
 * 선반 방식으로 쌓는다: 키가 큰 순서(같으면 이름순)로 왼쪽에서 오른쪽으로 놓고, 가로가 모자라면 다음 줄로 내려간다.
 * 같은 입력이면 늘 같은 자리가 나온다. 가로는 2의 거듭제곱으로, 세로는 16의 배수로 올린다(ATLAS_HEIGHT_STEP).
 */
export function packShelves(items: ReadonlyArray<{ name: string; w: number; h: number }>, maxWidth: number = ATLAS_MAX_WIDTH, gap: number = ATLAS_GAP): AtlasLayout {
  const sorted = [...items].sort((a, b) => b.h - a.h || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const it of sorted) if (it.w > maxWidth) throw new Error(`그림 ${it.name}(${it.w} px)이 한 장의 가로 ${maxWidth} px보다 넓어요`);
  const frames: AtlasFrame[] = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;
  let usedW = 0;
  for (const it of sorted) {
    if (x > 0 && x + it.w > maxWidth) {
      x = 0;
      y += shelfH + gap;
      shelfH = 0;
    }
    frames.push({ name: it.name, x, y, w: it.w, h: it.h });
    x += it.w + gap;
    usedW = Math.max(usedW, x - gap);
    shelfH = Math.max(shelfH, it.h);
  }
  const usedH = frames.length === 0 ? 0 : y + shelfH;
  return { width: nextPow2(Math.max(1, usedW)), height: roundUp(Math.max(1, usedH), ATLAS_HEIGHT_STEP), frames };
}

/** 사물 그림 원본 전체의 해시: 그림이 하나라도 바뀌면 달라진다 */
export function spritesHash(sprites: Readonly<Record<string, string>>): string {
  const h = crypto.createHash('sha256');
  for (const [file, svg] of Object.entries(sprites).sort(([a], [b]) => (a < b ? -1 : 1))) h.update(`${file}\n${svg}\n`);
  return h.digest('hex').slice(0, 16);
}

/** 그림 원본에서 자리를 잡는다(칠하지 않는다) */
export function layoutOf(sprites: Readonly<Record<string, string>>): AtlasLayout {
  const items: Array<{ name: string; w: number; h: number }> = [];
  for (const [file, svg] of Object.entries(sprites)) {
    const b = bakedSize(svg);
    if (!b) throw new Error(`world-src/sprites/${file}: <svg>에 width와 height가 없어요`);
    items.push({ name: frameName(file), ...b });
  }
  return packShelves(items);
}

/** Phaser의 JSON Hash 아틀라스 글. this.load.atlas(키, 그림, 이 파일)로 불러온다 */
export function renderAtlasJson(layout: AtlasLayout, hash: string): string {
  const frames: Record<string, unknown> = {};
  for (const f of [...layout.frames].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    frames[f.name] = { frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h } };
  }
  const data = { frames, meta: { app: 'levelup-music-world tools/build-atlas', version: '1', image: ATLAS_IMAGE, format: 'RGBA8888', size: { w: layout.width, h: layout.height }, scale: OBJECT_BAKE_SCALE, hash } };
  return `${JSON.stringify(data, null, 1)}\n`;
}
