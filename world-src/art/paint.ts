// 손으로 칠한 듯한 그림을 코드로 그리는 도구(햇살 과슈 화풍, docs/art-direction.md). 순수 계산이다: 같은 씨앗이면 같은 SVG 글이 나온다.
// 화풍의 약속: 해는 왼쪽 위(10시)에 있다. 밝은 면은 따뜻하고 밝게, 그늘 면은 차갑고 어둡게 칠한다. 외곽선 대신 명암의 차이로 덩어리를 나눈다.
// 그림은 sharp(librsvg)로 2배로 구워지므로 librsvg가 그리는 기능만 쓴다: 경로, 그라디언트, clipPath, mask, 투명도.

export interface Pt {
  x: number;
  y: number;
}

/** 씨앗으로 정해지는 0 이상 1 미만의 수(mulberry32). 그림마다 씨앗을 주면 다시 구워도 같은 그림이 나온다 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 글자에서 씨앗을 만든다(그림 이름마다 다른 그림) */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 좌표 글: 소수 둘째 자리까지, 군더더기 0을 뺀다 */
export const n = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

// ───── 색 ─────

const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) throw new Error(`#RRGGBB 형식이 아니에요: ${hex}`);
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const rgbHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase();

function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 색상환에서 h를 target 쪽으로 최대 maxDeg만큼 돌린다 */
const turnHue = (h: number, target: number, maxDeg: number): number => {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.max(-maxDeg, Math.min(maxDeg, d));
};

/** 명도를 dl만큼(−1–1), 채도를 ds만큼 바꾼다 */
export function tone(hex: string, dl: number, ds = 0): string {
  const [h, s, l] = rgbHsl(...hexRgb(hex));
  return rgbHex(...hslRgb(h, clamp01(s + ds), clamp01(l + dl)));
}

/** 볕을 받은 면: 밝게, 노란 쪽(45°)으로 조금 돌린다. k는 0–1 */
export function lit(hex: string, k = 0.5): string {
  const [h, s, l] = rgbHsl(...hexRgb(hex));
  return rgbHex(...hslRgb(turnHue(h, 48, 14 * k), clamp01(s + 0.04 * k), clamp01(l + 0.16 * k)));
}

/**
 * 그늘 면: 어둡게, 차가운 쪽으로 조금 돌린다. k는 0–1.
 * 초록과 파랑(80–300°)은 푸른 쪽(225°)으로, 노랑과 주황(20–80°)은 붉은 주황 쪽(18°)으로, 빨강과 자주는 자줏빛(330°)으로 돌린다.
 * 노랑을 푸른 쪽으로 돌리면 색상환의 가까운 길이 초록을 지나서 금빛 그늘이 풀빛으로 얼룩진다.
 */
export function shade(hex: string, k = 0.5): string {
  const [h, s, l] = rgbHsl(...hexRgb(hex));
  const target = h >= 80 && h < 300 ? 225 : h >= 20 && h < 80 ? 18 : 330;
  const turn = target === 225 ? 22 : 12;
  return rgbHex(...hslRgb(turnHue(h, target, turn * k), clamp01(s - 0.02 * k), clamp01(l - 0.2 * k)));
}

/** a에 b를 t(0–1)만큼 섞는다 */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  return rgbHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** 드리운 그림자의 색. 검정이 아니라 차가운 청록 회색에 투명도를 준다 */
export const SHADOW = '#3E5A5C';

// ───── 모양 ─────

/** 점들을 지나는 부드러운 닫힌 곡선(Catmull-Rom을 3차 베지어로) */
export function smoothClosed(pts: readonly Pt[], tension = 1): string {
  const k = pts.length;
  if (k < 3) throw new Error('점이 셋 이상 있어야 해요');
  const at = (i: number): Pt => pts[((i % k) + k) % k]!;
  let d = `M${n(at(0).x)} ${n(at(0).y)}`;
  for (let i = 0; i < k; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tension, y: p1.y + ((p2.y - p0.y) / 6) * tension };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tension, y: p2.y - ((p3.y - p1.y) / 6) * tension };
    d += `C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return d + 'Z';
}

/** 점들을 지나는 부드러운 열린 곡선 */
export function smoothOpen(pts: readonly Pt[], tension = 1): string {
  const k = pts.length;
  if (k < 2) throw new Error('점이 둘 이상 있어야 해요');
  const at = (i: number): Pt => pts[Math.max(0, Math.min(k - 1, i))]!;
  let d = `M${n(at(0).x)} ${n(at(0).y)}`;
  for (let i = 0; i < k - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + ((p2.x - p0.x) / 6) * tension, y: p1.y + ((p2.y - p0.y) / 6) * tension };
    const c2 = { x: p2.x - ((p3.x - p1.x) / 6) * tension, y: p2.y - ((p3.y - p1.y) / 6) * tension };
    d += `C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return d;
}

/** 손으로 그린 듯 가장자리가 조금 일렁이는 타원 덩어리의 점들. wobble은 반지름에 대한 비율 */
export function blobPoints(cx: number, cy: number, rx: number, ry: number, rand: () => number, opts: { points?: number; wobble?: number; rot?: number } = {}): Pt[] {
  const k = opts.points ?? 9;
  const wob = opts.wobble ?? 0.08;
  const rot = opts.rot ?? rand() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < k; i++) {
    const a = rot + (i / k) * Math.PI * 2;
    const f = 1 - wob + rand() * wob * 2;
    pts.push({ x: cx + Math.cos(a) * rx * f, y: cy + Math.sin(a) * ry * f });
  }
  return pts;
}

export const blob = (cx: number, cy: number, rx: number, ry: number, rand: () => number, opts: { points?: number; wobble?: number; rot?: number } = {}): string =>
  smoothClosed(blobPoints(cx, cy, rx, ry, rand, opts));

/** 모서리가 둥근 사각형 경로 */
export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${n(x + rr)} ${n(y)}H${n(x + w - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w)} ${n(y + rr)}V${n(y + h - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w - rr)} ${n(y + h)}H${n(x + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x)} ${n(y + h - rr)}V${n(y + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)}Z`;
}

export const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;

// ───── 그림 한 장 ─────

/** SVG 한 장. id는 그림 이름을 앞에 붙여 아틀라스 안에서도 겹치지 않게 한다 */
export class Paint {
  private readonly defs: string[] = [];
  private readonly parts: string[] = [];
  private seq = 0;

  constructor(
    readonly name: string,
    readonly w: number,
    readonly h: number,
  ) {}

  uid(prefix: string): string {
    this.seq += 1;
    return `${this.name.replace(/[^a-z0-9]+/gi, '')}-${prefix}${this.seq}`;
  }

  def(s: string): void {
    this.defs.push(s);
  }

  add(s: string): void {
    this.parts.push(s);
  }

  /** 채운 경로 */
  fill(d: string, color: string, opacity = 1, extra = ''): void {
    this.parts.push(`<path d="${d}" fill="${color}"${opacity < 1 ? ` opacity="${n(opacity)}"` : ''}${extra ? ' ' + extra : ''}/>`);
  }

  /** 선 */
  stroke(d: string, color: string, width: number, opacity = 1, extra = ''): void {
    this.parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` opacity="${n(opacity)}"` : ''}${extra ? ' ' + extra : ''}/>`,
    );
  }

  /** 두 색 사이의 직선 그라디언트. 각도는 도(0 = 왼쪽→오른쪽, 90 = 위→아래). 이름을 돌려준다 */
  linear(stops: ReadonlyArray<readonly [number, string, number?]>, angleDeg = 90): string {
    const id = this.uid('g');
    const a = (angleDeg * Math.PI) / 180;
    const x1 = 0.5 - Math.cos(a) / 2;
    const y1 = 0.5 - Math.sin(a) / 2;
    const x2 = 0.5 + Math.cos(a) / 2;
    const y2 = 0.5 + Math.sin(a) / 2;
    const st = stops.map(([o, c, op]) => `<stop offset="${n(o)}" stop-color="${c}"${op !== undefined && op < 1 ? ` stop-opacity="${n(op)}"` : ''}/>`).join('');
    this.def(`<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${st}</linearGradient>`);
    return `url(#${id})`;
  }

  /** 둥근 그라디언트. (fx, fy)는 밝은 점(0–1, 물체 틀 기준) */
  radial(stops: ReadonlyArray<readonly [number, string, number?]>, fx = 0.35, fy = 0.3, r = 0.75): string {
    const id = this.uid('r');
    const st = stops.map(([o, c, op]) => `<stop offset="${n(o)}" stop-color="${c}"${op !== undefined && op < 1 ? ` stop-opacity="${n(op)}"` : ''}/>`).join('');
    this.def(`<radialGradient id="${id}" cx="${n(fx)}" cy="${n(fy)}" fx="${n(fx)}" fy="${n(fy)}" r="${n(r)}">${st}</radialGradient>`);
    return `url(#${id})`;
  }

  /** 경로로 자르는 틀을 만든다. 경로를 여럿 주면 합친 모양으로 자른다 */
  clip(d: string | readonly string[]): string {
    const id = this.uid('c');
    const ds = typeof d === 'string' ? [d] : d;
    this.def(`<clipPath id="${id}">${ds.map((x) => `<path d="${x}"/>`).join('')}</clipPath>`);
    return `clip-path="url(#${id})"`;
  }

  /** 자르는 틀 안에서만 그린다: 이 사이에 add/fill/stroke한 것이 틀 안에 든다 */
  group(attrs: string, draw: () => void): void {
    this.parts.push(`<g ${attrs}>`);
    draw();
    this.parts.push('</g>');
  }

  /**
   * 그늘 초승달: 모양을 그늘색으로 칠하되, 왼쪽 위로 (dx, dy)만큼 옮긴 같은 모양은 빼고 칠한다.
   * 결과는 오른쪽 아래 가장자리에만 남는 그늘이다(해가 왼쪽 위).
   */
  crescent(d: string, color: string, dx: number, dy: number, opacity = 1): void {
    const id = this.uid('m');
    this.def(
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${this.w}" height="${this.h}"><rect width="${this.w}" height="${this.h}" fill="#fff"/><path d="${d}" transform="translate(${n(-dx)} ${n(-dy)})" fill="#000"/></mask>`,
    );
    this.parts.push(`<path d="${d}" fill="${color}" mask="url(#${id})"${opacity < 1 ? ` opacity="${n(opacity)}"` : ''}/>`);
  }

  /** 땅에 닿는 부드러운 그림자: 바깥은 옅고 안은 짙은 타원 두 겹 */
  groundShadow(cx: number, cy: number, rx: number, ry: number, strength = 1): void {
    this.fill(ellipse(cx, cy, rx, ry), SHADOW, 0.16 * strength);
    this.fill(ellipse(cx - rx * 0.06, cy - ry * 0.05, rx * 0.72, ry * 0.68), SHADOW, 0.18 * strength);
  }

  svg(): string {
    const defs = this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">${defs}${this.parts.join('')}</svg>`;
  }
}
