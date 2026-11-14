// 바닥을 햇살 과슈 화풍에 맞추는 그림 조각(docs/art-direction.md): 풀 결, 부드러운 그림자, 길 가장자리의 풀과 자갈, 지붕, 울타리 덤불.
// 바닥 그림(world-src/index.ts의 groundBody)이 이 조각들을 이어 붙인다. 모두 같은 씨앗에서 나오므로 다시 구워도 같은 바닥이다.
// 결은 반투명한 붓자국이라 지역마다 다른 바닥색 위에서 그 색을 따라간다. 움직이지 않고 구운 그림에만 있다.
import type { Point } from '../../src/world/nav';
import { offsetPolyline } from '../curves';
import type { RoadSegment } from '../curves';
import { SHADOW, lit, mix, n, rng, shade } from './paint';

// ───── 풀 결 ─────

const GRASS_DARK = '#46703F';
const GRASS_LIGHT = '#FBFDE6';

/** 타일 가장자리에 걸친 붓자국은 반대편에도 그려 이음매가 보이지 않게 한다 */
function wrapped(tile: number, x: number, y: number, margin: number, draw: (x: number, y: number) => string): string {
  let out = '';
  for (const dx of [-tile, 0, tile]) {
    for (const dy of [-tile, 0, tile]) {
      const X = x + dx;
      const Y = y + dy;
      if (X < -margin || X > tile + margin || Y < -margin || Y > tile + margin) continue;
      out += draw(X, Y);
    }
  }
  return out;
}

/** 풀 한 포기: 잎 3–5장. 짙은 잎과 밝은 잎이 섞인다 */
function tuftPath(x: number, y: number, s: number, rand: () => number): string {
  const k = 3 + Math.floor(rand() * 3);
  let dark = '';
  let light = '';
  for (let i = 0; i < k; i++) {
    const dx = (i - (k - 1) / 2) * 2.4 * s;
    const h = (6 + rand() * 7) * s;
    const lean = (rand() - 0.5) * 7 * s;
    const blade = `M${n(x + dx - 1.3 * s)} ${n(y)}Q${n(x + dx + lean * 0.35)} ${n(y - h * 0.6)} ${n(x + dx + lean)} ${n(y - h)}Q${n(x + dx + lean * 0.25 + 0.6 * s)} ${n(y - h * 0.45)} ${n(x + dx + 1.3 * s)} ${n(y)}Z`;
    if (i % 2 === 0) dark += blade;
    else light += blade;
  }
  return `<path d="${dark}" fill="${GRASS_DARK}" opacity="0.2"/><path d="${light}" fill="${GRASS_LIGHT}" opacity="0.3"/>`;
}

/** 두 타일(384 px, 608 px)을 겹쳐 반복이 눈에 덜 띄게 한다. 정의와 덮는 사각형 둘을 돌려준다 */
export function grassSvg(worldW: number, worldH: number): string {
  const A = 384;
  const B = 608;
  const ra = rng(20261114);
  let a = '';
  // 큰 얼룩: 아주 옅은 밝음과 그늘
  for (let i = 0; i < 6; i++) {
    const x = ra() * A;
    const y = ra() * A;
    const r = 40 + ra() * 60;
    const fill = i % 2 ? GRASS_LIGHT : GRASS_DARK;
    a += wrapped(A, x, y, r, (X, Y) => `<ellipse cx="${n(X)}" cy="${n(Y)}" rx="${n(r)}" ry="${n(r * 0.7)}" fill="${fill}" opacity="${i % 2 ? 0.07 : 0.035}"/>`);
  }
  for (let i = 0; i < 34; i++) {
    const x = ra() * A;
    const y = ra() * A;
    const s = 0.8 + ra() * 0.6;
    const seed = Math.floor(ra() * 1e9);
    a += wrapped(A, x, y, 16, (X, Y) => tuftPath(X, Y, s, rng(seed)));
  }
  for (let i = 0; i < 26; i++) {
    const x = ra() * A;
    const y = ra() * A;
    const light = ra() < 0.6;
    const r = 1 + ra() * 1.2;
    a += wrapped(A, x, y, 3, (X, Y) => `<circle cx="${n(X)}" cy="${n(Y)}" r="${n(r)}" fill="${light ? GRASS_LIGHT : GRASS_DARK}" opacity="${light ? 0.4 : 0.14}"/>`);
  }
  const rb = rng(20261115);
  let b = '';
  // 들꽃: 흰 꽃, 노란 꽃, 연보라 꽃(작게, 드물게)
  const FLOWERS = ['#FFFDF2', '#F7DF86', '#D8C7F0'];
  for (let i = 0; i < 9; i++) {
    const x = rb() * B;
    const y = rb() * B;
    const col = FLOWERS[i % FLOWERS.length]!;
    const k = 2 + Math.floor(rb() * 3);
    const offs = Array.from({ length: k }, () => ({ dx: (rb() - 0.5) * 22, dy: (rb() - 0.5) * 16 }));
    b += wrapped(B, x, y, 20, (X, Y) =>
      offs
        .map(({ dx, dy }) => {
          let petals = '';
          for (let p = 0; p < 5; p++) {
            const ang = (p / 5) * Math.PI * 2;
            petals += `<circle cx="${n(X + dx + Math.cos(ang) * 2.2)}" cy="${n(Y + dy + Math.sin(ang) * 2.2)}" r="1.8" fill="${col}" opacity="0.85"/>`;
          }
          return petals + `<circle cx="${n(X + dx)}" cy="${n(Y + dy)}" r="1.1" fill="${shade(col, 0.7)}" opacity="0.8"/>`;
        })
        .join(''),
    );
  }
  for (let i = 0; i < 16; i++) {
    const x = rb() * B;
    const y = rb() * B;
    const s = 1 + rb() * 0.5;
    const seed = Math.floor(rb() * 1e9);
    b += wrapped(B, x, y, 18, (X, Y) => tuftPath(X, Y, s, rng(seed)));
  }
  const defs = `<defs><pattern id="grassA" width="${A}" height="${A}" patternUnits="userSpaceOnUse">${a}</pattern><pattern id="grassB" width="${B}" height="${B}" patternUnits="userSpaceOnUse">${b}</pattern></defs>`;
  return `${defs}<rect x="0" y="0" width="${worldW}" height="${worldH}" fill="url(#grassA)"/><rect x="0" y="0" width="${worldW}" height="${worldH}" fill="url(#grassB)"/>`;
}

// ───── 부드러운 그림자 ─────

/**
 * 나무 그림자: 차가운 청록 회색의 반투명 원 두 겹(바깥은 옅고 안은 조금 짙다).
 * 첫 원은 이전과 같은 자리와 반지름이다(시험이 `cx cy r`를 읽는다).
 */
export const softShadowCircle = (cx: number, cy: number, r: number): string =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${SHADOW}" opacity="0.15"/><circle cx="${n(cx - r * 0.08)}" cy="${n(cy - r * 0.1)}" r="${n(r * 0.8)}" fill="${SHADOW}" opacity="0.1"/>`;

// ───── 길 ─────

/** 폴리라인을 따라 간격마다 점과 그 자리의 방향(단위 벡터)을 고른다 */
function along(pts: readonly Point[], every: number, start: number): Array<{ x: number; y: number; ux: number; uy: number }> {
  const out: Array<{ x: number; y: number; ux: number; uy: number }> = [];
  let next = start;
  let walked = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    while (next <= walked + len) {
      const t = (next - walked) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len });
      next += every;
    }
    walked += len;
  }
  return out;
}

/**
 * 길 위의 결: 가운데의 닳은 띠, 자갈(밝은 것과 짙은 것), 가장자리에 난 풀.
 * 길바닥(roadsSvg) 위에 그린다. 길의 색과 폭은 그대로다.
 */
export function roadDecorSvg(roads: readonly RoadSegment[], roadColor: string, edgeColor: string): string {
  const rand = rng(20261116);
  const worn = mix(roadColor, edgeColor, 0.3);
  const parts: string[] = [];
  for (const r of roads) {
    const d = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`).join('');
    parts.push(`<path d="${d}" fill="none" stroke="${worn}" stroke-width="${n(r.width * 0.42)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.28"/>`);
  }
  for (const r of roads) {
    const half = r.width / 2;
    // 자갈: 길 안쪽 네 줄에 간격을 달리해 점을 찍는다
    for (const [k, every, size, light] of [[-0.62, 53, 2.6, true], [-0.22, 71, 2.2, false], [0.18, 61, 2.8, true], [0.58, 47, 2.2, false]] as const) {
      const line = offsetPolyline(r.points, half * k);
      for (const p of along(line, every, rand() * every)) {
        const jx = (rand() - 0.5) * 10;
        const jy = (rand() - 0.5) * 10;
        const col = light ? lit(roadColor, 0.7) : shade(edgeColor, 0.25);
        parts.push(`<ellipse cx="${n(p.x + jx)}" cy="${n(p.y + jy)}" rx="${n(size * (0.8 + rand() * 0.5))}" ry="${n(size * 0.7)}" fill="${col}" opacity="${light ? 0.9 : 0.55}"/>`);
      }
    }
    // 가장자리 풀: 길 가장자리 띠의 바깥 끝에 포기를 세운다(양쪽)
    for (const side of [-1, 1] as const) {
      const edge = offsetPolyline(r.points, side * (half + 14));
      for (const p of along(edge, 84, rand() * 84)) {
        if (rand() < 0.25) continue;
        parts.push(tuftPath(p.x + (rand() - 0.5) * 20, p.y + (rand() - 0.5) * 8, 1.3 + rand() * 0.5, rng(Math.floor(rand() * 1e9))));
      }
    }
  }
  return parts.join('');
}

// ───── 지붕(위에서 내려다본 모임지붕) ─────

/**
 * 모임지붕: 네 면을 해의 방향(왼쪽 위)에 맞춰 칠한다. 북쪽 면이 가장 밝고 동쪽 면이 가장 어둡다. 기와 줄은 처마와 나란하다.
 * 좌표는 호출한 쪽의 좌표계 그대로다(마을은 시안 좌표 × 3의 묶음 안에서 부른다).
 */
export function hipRoofSvg(x: number, y: number, w: number, h: number, color: string): string {
  const parts: string[] = [];
  const inset = Math.min(w, h) / 2;
  const r0 = { x: x + inset, y: y + h / 2 };
  const r1 = { x: x + w - inset, y: y + h / 2 };
  const P = (pts: ReadonlyArray<readonly [number, number]>): string => 'M' + pts.map(([a, b]) => `${n(a)} ${n(b)}`).join('L') + 'Z';
  const faces: Array<{ d: string; fill: string; rows: (t: number) => string }> = [
    {
      d: P([[x, y], [x + w, y], [r1.x, r1.y], [r0.x, r0.y]]),
      fill: lit(color, 0.45),
      rows: (t) => `M${n(x + t * inset)} ${n(y + t * (h / 2))}H${n(x + w - t * inset)}`,
    },
    {
      d: P([[x, y], [r0.x, r0.y], [x, y + h]]),
      fill: lit(color, 0.15),
      rows: (t) => `M${n(x + t * inset)} ${n(y + t * (h / 2))}V${n(y + h - t * (h / 2))}`,
    },
    {
      d: P([[x, y + h], [r0.x, r0.y], [r1.x, r1.y], [x + w, y + h]]),
      fill: shade(color, 0.3),
      rows: (t) => `M${n(x + t * inset)} ${n(y + h - t * (h / 2))}H${n(x + w - t * inset)}`,
    },
    {
      d: P([[x + w, y], [x + w, y + h], [r1.x, r1.y]]),
      fill: shade(color, 0.55),
      rows: (t) => `M${n(x + w - t * inset)} ${n(y + t * (h / 2))}V${n(y + h - t * (h / 2))}`,
    },
  ];
  for (const f of faces) {
    parts.push(`<path d="${f.d}" fill="${f.fill}"/>`);
    let rows = '';
    for (let i = 1; i < 6; i++) rows += f.rows(i / 6);
    parts.push(`<path d="${rows}" fill="none" stroke="${shade(f.fill, 0.35)}" stroke-width="1.1" opacity="0.55"/>`);
  }
  // 용마루와 내림마루(밝은 선), 처마 끝의 그늘
  const ridge = `M${n(x)} ${n(y)}L${n(r0.x)} ${n(r0.y)}L${n(x)} ${n(y + h)}M${n(x + w)} ${n(y)}L${n(r1.x)} ${n(r1.y)}L${n(x + w)} ${n(y + h)}M${n(r0.x)} ${n(r0.y)}H${n(r1.x)}`;
  parts.push(`<path d="${ridge}" fill="none" stroke="${lit(color, 0.9)}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>`);
  parts.push(`<path d="M${n(x)} ${n(y + h)}H${n(x + w)}V${n(y)}" fill="none" stroke="${shade(color, 0.8)}" stroke-width="2.2" opacity="0.6"/>`);
  return parts.join('');
}

// ───── 덤불 울타리 ─────

/** 잎 뭉치가 줄지어 선 덤불(위에서 본 모습). 바깥 테두리(x, y, w, h)를 넘지 않는다 */
export function hedgeSvg(x: number, y: number, w: number, h: number, color: string, seed: number): string {
  const rand = rng(seed);
  const parts: string[] = [];
  const horizontal = w >= h;
  const len = horizontal ? w : h;
  const thick = horizontal ? h : w;
  const r = thick / 2;
  const count = Math.max(2, Math.round(len / (thick * 0.9)));
  const centers: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const along = r + t * (len - 2 * r);
    const rr = r * (0.9 + rand() * 0.1);
    centers.push(horizontal ? { x: x + along, y: y + r, r: rr } : { x: x + r, y: y + along, r: rr });
  }
  for (const c of centers) parts.push(`<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(c.r)}" fill="${shade(color, 0.6)}"/>`);
  for (const c of centers) parts.push(`<circle cx="${n(c.x - c.r * 0.08)}" cy="${n(c.y - c.r * 0.1)}" r="${n(c.r * 0.88)}" fill="${color}"/>`);
  for (const c of centers) parts.push(`<circle cx="${n(c.x - c.r * 0.3)}" cy="${n(c.y - c.r * 0.32)}" r="${n(c.r * 0.42)}" fill="${lit(color, 0.6)}" opacity="0.85"/>`);
  return parts.join('');
}

// ───── 합주 광장(시안 좌표, 마을 묶음 안에서 부른다) ─────

/** 광장 바닥의 돌 이음매와 볕: 둥근 바닥(반지름 r1) 위에 얹는다. 반지름 r0–r1 사이에 방사형 이음매, 왼쪽 위는 밝고 오른쪽 아래는 그늘 */
export function plazaPavingSvg(cx: number, cy: number, r0: number, r1: number, joint: string): string {
  const parts: string[] = [];
  let d = '';
  const rings = [r0, (r0 + r1) / 2, r1];
  for (let k = 0; k < rings.length - 1; k++) {
    const a0 = rings[k]!;
    const a1 = rings[k + 1]!;
    const step = k === 0 ? 12 : 9;
    const off = k === 0 ? 0 : 4.5;
    for (let deg = off; deg < 360 + off; deg += step) {
      const t = (deg * Math.PI) / 180;
      d += `M${n(cx + Math.cos(t) * a0)} ${n(cy + Math.sin(t) * a0)}L${n(cx + Math.cos(t) * a1)} ${n(cy + Math.sin(t) * a1)}`;
    }
  }
  parts.push(`<path d="${d}" fill="none" stroke="${joint}" stroke-width="0.8" opacity="0.55"/>`);
  parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n((r0 + r1) / 2)}" fill="none" stroke="${joint}" stroke-width="0.8" opacity="0.55"/>`);
  // 볕과 그늘: 바닥 전체에 옅게
  parts.push(`<circle cx="${n(cx - r1 * 0.25)}" cy="${n(cy - r1 * 0.3)}" r="${n(r1 * 0.75)}" fill="#FFFFFF" opacity="0.18"/>`);
  parts.push(`<path d="M${n(cx + r1)} ${n(cy)}A${n(r1)} ${n(r1)} 0 0 1 ${n(cx)} ${n(cy + r1)}A${n(r1 * 0.86)} ${n(r1 * 0.86)} 0 0 0 ${n(cx + r1)} ${n(cy)}Z" fill="${SHADOW}" opacity="0.06"/>`);
  return parts.join('');
}

/** 나무 무대: 앞면(아래 턱), 윗면의 널 줄, 왼쪽 위 볕. 자리와 크기는 시안의 두 사각형 그대로다 */
export function stageSvg(front: { x: number; y: number; w: number; h: number }, top: { x: number; y: number; w: number; h: number }, wood: string): string {
  const parts: string[] = [];
  parts.push(`<rect x="${n(front.x + 3)}" y="${n(front.y + 4)}" width="${n(front.w)}" height="${n(front.h)}" rx="8" fill="${SHADOW}" opacity="0.14"/>`);
  parts.push(`<rect x="${n(front.x)}" y="${n(front.y)}" width="${n(front.w)}" height="${n(front.h)}" rx="8" fill="${shade(wood, 0.35)}"/>`);
  parts.push(`<rect x="${n(top.x)}" y="${n(top.y)}" width="${n(top.w)}" height="${n(top.h)}" rx="4" fill="${lit(wood, 0.25)}"/>`);
  let planks = '';
  for (let y = top.y + 7.5; y < top.y + top.h - 2; y += 7.5) planks += `M${n(top.x + 3)} ${n(y)}H${n(top.x + top.w - 3)}`;
  parts.push(`<path d="${planks}" fill="none" stroke="${shade(wood, 0.25)}" stroke-width="0.9" opacity="0.7"/>`);
  parts.push(`<path d="M${n(top.x + 4)} ${n(top.y + 2)}H${n(top.x + top.w * 0.7)}" fill="none" stroke="${lit(wood, 0.9)}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>`);
  return parts.join('');
}

/** 둥근 나무 의자(위에서 본 모습): 그림자, 앉는 판, 나이테 고리, 볕 */
export function stoolSvg(x: number, y: number, w: number, h: number, wood: string): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2 + 1;
  return [
    `<ellipse cx="${n(cx + 2)}" cy="${n(cy + 3)}" rx="${n(r * 1.05)}" ry="${n(r * 0.95)}" fill="${SHADOW}" opacity="0.16"/>`,
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r * 1.05)}" ry="${n(r * 0.95)}" fill="${shade(wood, 0.25)}"/>`,
    `<ellipse cx="${n(cx - 0.6)}" cy="${n(cy - 0.8)}" rx="${n(r * 0.9)}" ry="${n(r * 0.8)}" fill="${lit(wood, 0.3)}"/>`,
    `<ellipse cx="${n(cx - 0.6)}" cy="${n(cy - 0.8)}" rx="${n(r * 0.48)}" ry="${n(r * 0.42)}" fill="none" stroke="${shade(wood, 0.2)}" stroke-width="0.7" opacity="0.7"/>`,
    `<ellipse cx="${n(cx - r * 0.35)}" cy="${n(cy - r * 0.35)}" rx="${n(r * 0.25)}" ry="${n(r * 0.16)}" fill="#FFFFFF" opacity="0.4"/>`,
  ].join('');
}
