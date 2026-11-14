// 나무(위에서 내려다본 덮개)를 햇살 과슈 화풍으로 칠한다(docs/art-direction.md). 그림 틀은 이전과 같다: 가로·세로 2r + 8, 가운데가 덮개의 가운데이고
// 덮개는 반지름 r 안에만 칠한다(시험이 파일 이름의 r로 덮개를 잰다). 덮개는 잎 뭉치 여러 개가 겹친 것이고, 바깥 고리 → 안쪽 고리 → 꼭대기 순으로 밝아진다.
// 큰 덩어리의 명암이 먼저이고(해를 마주한 왼쪽 위가 밝다), 잎 붓자국과 꽃은 덮개 모양 안에만 찍는다.
import type { RegionId } from '../../src/domain/world';
import { Paint, blob, lit, mix, n, rng, seedOf, shade } from './paint';

export interface Foliage {
  /** 잎의 가운데 색 */
  leaf: string;
  /** 덮개 위의 작은 꽃이나 열매 */
  accent?: { color: string; kind: 'blossom' | 'fleck' | 'bell' };
  /** 꽃이나 열매가 달린 나무의 비율(0–1). 같은 지역의 나무도 모두 같지는 않다 */
  accentShare?: number;
}

/** 지역마다 잎 색(지역 강조색과 어울리게, docs/art-direction.md의 지역 성격) */
export const FOLIAGE: Readonly<Record<RegionId, Foliage>> = {
  village: { leaf: '#6A9C62', accent: { color: '#F6B898', kind: 'blossom' }, accentShare: 0.5 },
  'staff-hill': { leaf: '#78A85C', accent: { color: '#FFF6DE', kind: 'blossom' }, accentShare: 0.6 },
  'beat-river': { leaf: '#549A86', accent: { color: '#CDEBD6', kind: 'fleck' }, accentShare: 0.7 },
  'bell-grove': { leaf: '#BC9C4C', accent: { color: '#FBE08E', kind: 'bell' }, accentShare: 1 },
  'scale-trail': { leaf: '#A0A65C', accent: { color: '#E79C5C', kind: 'fleck' }, accentShare: 0.8 },
  'key-marsh': { leaf: '#6A9A8C', accent: { color: '#D4BFF0', kind: 'blossom' }, accentShare: 0.7 },
};

interface Lobe {
  x: number;
  y: number;
  r: number;
}

/** 해가 오는 쪽(왼쪽 위)을 바라보는 정도: 1이면 해를 마주 보고, 0이면 등진다 */
const facingSun = (dx: number, dy: number): number => {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0.6;
  return ((-dx - dy) / (len * Math.SQRT2) + 1) / 2;
};

function ring(cx: number, cy: number, count: number, dist: number, lobeR: number, jitter: number, rand: () => number, rot: number): Lobe[] {
  const out: Lobe[] = [];
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * Math.PI * 2 + (rand() - 0.5) * jitter;
    const r = lobeR * (0.9 + rand() * 0.2);
    const d = dist * (0.94 + rand() * 0.08);
    out.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r });
  }
  return out;
}

/** 나무 한 그루. name은 그림 이름(씨앗이 된다), r은 덮개의 반지름 */
export function paintTree(name: string, r: number, f: Foliage): string {
  const size = 2 * r + 8;
  const c = r + 4;
  const p = new Paint(name, size, size);
  const rand = rng(seedOf(name));
  const base = f.leaf;
  const deep = shade(base, 0.85);

  // 바깥 고리: 잎 뭉치가 가장자리를 이룬다. 뭉치 가장자리(일렁임 포함)가 반지름 r을 넘지 않게 둔다
  const outerCount = Math.max(8, Math.min(11, Math.round(r / 8.5)));
  const outerR = r * 0.37;
  const outer = ring(c, c, outerCount, r - outerR * 1.14, outerR, 0.25, rand, rand() * Math.PI * 2).map((l) => {
    const room = r - Math.hypot(l.x - c, l.y - c);
    return { ...l, r: Math.min(l.r, room / 1.09) };
  });
  const inner = ring(c, c, Math.max(4, Math.round(outerCount * 0.5)), r * 0.3, r * 0.37, 0.4, rand, rand() * Math.PI * 2);
  const top: Lobe[] = [
    { x: c - r * 0.12, y: c - r * 0.14, r: r * 0.34 },
    { x: c + r * 0.16, y: c + r * 0.1, r: r * 0.2 },
  ];

  const outerPaths = outer.map((l) => blob(l.x, l.y, l.r, l.r * 0.96, rand, { points: 8, wobble: 0.06 }));
  const corePath = blob(c, c, r * 0.68, r * 0.68, rand, { points: 10, wobble: 0.04 });
  const canopyClip = p.clip([...outerPaths, corePath]);

  // 1) 바닥 덮개: 뭉치 사이 틈과 오른쪽 아래 가장자리에 남는 가장 짙은 색
  for (const d of outerPaths) p.fill(d, deep);
  p.fill(corePath, deep);

  // 2) 고리마다: 뭉치 채움 → 오른쪽 아래 그늘 초승달 → 해를 마주한 뭉치에만 밝은 점
  const layer = (lobes: readonly Lobe[], dark: number, light: number, hi: number, given?: readonly string[]): void => {
    const shapes = lobes.map((l, i) => {
      const t = facingSun(l.x - c, l.y - c);
      const fill = mix(shade(base, dark), lit(base, light), t);
      return { l, t, fill, d: given?.[i] ?? blob(l.x, l.y, l.r, l.r * 0.95, rand, { points: 8, wobble: 0.07 }) };
    });
    for (const s of shapes) p.fill(s.d, s.fill);
    for (const s of shapes) p.crescent(s.d, shade(s.fill, 0.6), s.l.r * 0.26, s.l.r * 0.32, 0.85);
    for (const s of shapes) {
      if (s.t < 0.42) continue;
      const hr = s.l.r * (0.36 + rand() * 0.08);
      p.fill(blob(s.l.x - s.l.r * 0.3, s.l.y - s.l.r * 0.34, hr, hr * 0.8, rand, { points: 7, wobble: 0.12 }), lit(s.fill, hi), 0.35 + s.t * 0.5);
    }
  };
  layer(outer, 0.62, 0.08, 0.5, outerPaths.map((d) => d));
  layer(inner, 0.28, 0.32, 0.6);
  layer(top, 0.05, 0.5, 0.75);

  p.group(canopyClip, () => {
    // 3) 덮개 전체를 하나의 둥근 덩어리로 묶는 빛: 왼쪽 위는 볕, 오른쪽 아래 가장자리는 그늘
    p.fill(`M0 0H${size}V${size}H0Z`, p.radial([[0, lit(base, 1), 0.32], [0.45, base, 0], [0.8, deep, 0], [1, deep, 0.45]], 0.36, 0.32, 0.72));

    // 4) 잎 붓자국: 밝은 쪽은 연둣빛, 그늘 쪽은 짙은 청록
    const marks = Math.round(r * 0.45);
    for (let i = 0; i < marks; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r * 0.92;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      const sunny = facingSun(x - c, y - c) > 0.5;
      const len = r * (0.05 + rand() * 0.03);
      const ang = (a * 180) / Math.PI + 90 + (rand() - 0.5) * 50;
      p.add(
        `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(len)}" ry="${n(len * 0.4)}" transform="rotate(${n(ang)} ${n(x)} ${n(y)})" fill="${sunny ? lit(base, 0.95) : shade(base, 0.7)}" opacity="${sunny ? 0.5 : 0.4}"/>`,
      );
    }

    // 5) 꽃이나 열매: 덮개 위에 몇 송이
    const share = f.accentShare ?? 0;
    if (f.accent && rand() < share) {
      const count = Math.max(4, Math.round(r / 12));
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const d = (0.2 + rand() * 0.6) * r;
        const x = c + Math.cos(a) * d;
        const y = c + Math.sin(a) * d;
        const col = f.accent.color;
        if (f.accent.kind === 'blossom') {
          for (let k = 0; k < 5; k++) {
            const b = (k / 5) * Math.PI * 2 + a;
            p.add(`<circle cx="${n(x + Math.cos(b) * 2)}" cy="${n(y + Math.sin(b) * 2)}" r="1.7" fill="${col}"/>`);
          }
          p.add(`<circle cx="${n(x)}" cy="${n(y)}" r="1.1" fill="${shade(col, 0.6)}"/>`);
        } else if (f.accent.kind === 'bell') {
          // 작은 놋쇠 방울 열매: 아래가 퍼진 종 모양, 추, 밝은 점
          p.fill(`M${n(x - 3.2)} ${n(y + 2.6)}Q${n(x - 2.8)} ${n(y - 3.4)} ${n(x)} ${n(y - 3.7)}Q${n(x + 2.8)} ${n(y - 3.4)} ${n(x + 3.2)} ${n(y + 2.6)}Z`, col);
          p.add(`<circle cx="${n(x)}" cy="${n(y + 3.1)}" r="0.95" fill="${shade(col, 0.9)}"/>`);
          p.add(`<circle cx="${n(x - 1)}" cy="${n(y - 1.3)}" r="0.85" fill="#FFF8E2" opacity="0.9"/>`);
        } else {
          const ang = rand() * 180;
          p.add(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="3.2" ry="1.5" transform="rotate(${n(ang)} ${n(x)} ${n(y)})" fill="${col}" opacity="0.9"/>`);
        }
      }
    }
  });

  return p.svg();
}

/** 그림 이름에서 덮개 반지름을 읽는다('obj-…-tree-r90' → 90) */
export const treeRadiusOf = (name: string): number | null => {
  const m = /-tree-r(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
};
