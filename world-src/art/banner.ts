// 첫 안내 카드 위의 그림 띠(ui-intro-banner.svg, 520×128): 햇살 과슈 화풍의 풍경. 하늘, 먼 언덕, 마을 지붕, 둥근 나무, 굽은 길, 들꽃.
// 장식 그림이라 화면 낭독기가 읽지 않는다(CSS의 바탕 그림). 이 게임을 위해 새로 그린 풍경이다.
import { Paint, blob, ellipse, lit, mix, n, rng, roundRect, shade, smoothClosed } from './paint';
import type { Pt } from './paint';

const W = 520;
const H = 128;

/** 가로로 이어지는 언덕 띠: 위쪽 가장자리가 부드럽게 오르내린다 */
function hill(p: Paint, base: number, amp: number, waves: number, phase: number, color: string, rand: () => number): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * (W + 80) - 40;
    pts.push({ x, y: base - Math.sin((i / 10) * Math.PI * waves + phase) * amp - rand() * amp * 0.3 });
  }
  // 부드러운 위쪽 가장자리: 점들을 곡선으로 잇고 아래를 닫는다
  const closed: Pt[] = [...pts, { x: W + 40, y: H + 20 }, { x: -40, y: H + 20 }];
  p.fill(smoothClosed(closed, 0.9), color);
}

function roundTree(p: Paint, x: number, y: number, r: number, leaf: string, rand: () => number): void {
  p.fill(ellipse(x + r * 0.5, y + r * 1.02, r * 1.1, r * 0.22), '#3E5A5C', 0.18);
  p.fill(roundRect(x - r * 0.12, y + r * 0.2, r * 0.24, r * 0.8, r * 0.1), shade('#8A5E43', 0.2));
  const lobes: Array<[number, number, number]> = [
    [x - r * 0.45, y + r * 0.1, r * 0.62],
    [x + r * 0.42, y + r * 0.12, r * 0.6],
    [x, y - r * 0.32, r * 0.7],
  ];
  for (const [lx, ly, lr] of lobes) p.fill(blob(lx, ly, lr, lr * 0.92, rand, { points: 8, wobble: 0.08 }), shade(leaf, 0.35));
  for (const [lx, ly, lr] of lobes) p.fill(blob(lx - lr * 0.12, ly - lr * 0.14, lr * 0.84, lr * 0.78, rand, { points: 8, wobble: 0.08 }), leaf);
  for (const [lx, ly, lr] of lobes) p.fill(blob(lx - lr * 0.32, ly - lr * 0.34, lr * 0.4, lr * 0.34, rand, { points: 7, wobble: 0.12 }), lit(leaf, 0.6), 0.85);
}

function house(p: Paint, x: number, y: number, w: number, roof: string): void {
  const h = w * 0.55;
  p.fill(roundRect(x + 6, y + h * 0.9, w, 6, 3), '#3E5A5C', 0.16);
  p.fill(roundRect(x, y + h * 0.35, w, h * 0.65, 2), p.linear([[0, '#FBF4E2'], [1, '#E2D3B3']], 0));
  p.fill(roundRect(x + w * 0.42, y + h * 0.62, w * 0.16, h * 0.38, 1.5), shade('#8A5E43', 0.2));
  p.fill(roundRect(x + w * 0.12, y + h * 0.52, w * 0.18, h * 0.2, 1), '#6D8C93');
  p.fill(roundRect(x + w * 0.7, y + h * 0.52, w * 0.18, h * 0.2, 1), '#6D8C93');
  const r = `M${n(x - 4)} ${n(y + h * 0.4)}L${n(x + w * 0.5)} ${n(y)}L${n(x + w + 4)} ${n(y + h * 0.4)}Z`;
  p.fill(r, p.linear([[0, lit(roof, 0.4)], [0.55, roof], [1, shade(roof, 0.45)]], 0));
  p.stroke(`M${n(x - 4)} ${n(y + h * 0.4)}L${n(x + w * 0.5)} ${n(y)}`, lit(roof, 0.9), 1.2, 0.7);
}

export function paintIntroBanner(): string {
  const p = new Paint('ui-intro-banner', W, H);
  const rand = rng(20261118);
  // 하늘: 왼쪽 위의 해에서 번지는 빛
  p.fill(`M0 0H${W}V${H}H0Z`, p.linear([[0, '#FFF6DE'], [0.55, '#E6F0E2'], [1, '#CFE3DD']], 90));
  p.fill(ellipse(70, 18, 120, 70), p.radial([[0, '#FFFBEA', 0.95], [1, '#FFFBEA', 0]], 0.5, 0.5, 0.5));
  // 구름 두 조각
  for (const [cx, cy, s] of [[360, 24, 1], [460, 38, 0.7]] as const) {
    p.fill(blob(cx, cy, 34 * s, 9 * s, rand, { points: 9, wobble: 0.15 }), '#FFFFFF', 0.75);
    p.fill(blob(cx - 10 * s, cy - 5 * s, 18 * s, 8 * s, rand, { points: 8, wobble: 0.15 }), '#FFFFFF', 0.8);
  }
  // 먼 언덕 → 가운데 언덕 → 가까운 풀밭
  hill(p, 72, 12, 2.2, 0.4, mix('#9DBFB4', '#CFE3DD', 0.35), rand);
  hill(p, 88, 10, 1.6, 1.8, '#9FC08E', rand);
  // 먼 언덕 위의 작은 나무 둘
  roundTree(p, 404, 64, 6, mix('#6A9C62', '#9DBFB4', 0.35), rand);
  roundTree(p, 420, 67, 4.5, mix('#78A85C', '#9DBFB4', 0.35), rand);
  hill(p, 104, 7, 1.2, 3.1, '#B9D49C', rand);
  // 굽은 길
  p.fill('M210 128C230 112 250 106 290 100C320 96 330 92 340 88L352 89C344 96 330 102 304 108C272 116 262 120 252 128Z', '#F1E6C8');
  p.stroke('M232 126C246 116 262 110 292 104', '#E2D4B0', 1.4, 0.8);
  // 마을: 집 둘과 나무
  house(p, 300, 70, 34, '#B46E53');
  house(p, 342, 76, 28, '#587F75');
  roundTree(p, 110, 84, 15, '#6A9C62', rand);
  roundTree(p, 150, 92, 11, '#78A85C', rand);
  roundTree(p, 470, 88, 13, '#549A86', rand);
  // 가까운 풀과 들꽃
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = 112 + rand() * 14;
    const h = 5 + rand() * 6;
    p.fill(`M${n(x - 1.4)} ${n(y)}Q${n(x)} ${n(y - h * 0.6)} ${n(x + (rand() - 0.5) * 4)} ${n(y - h)}Q${n(x + 0.6)} ${n(y - h * 0.4)} ${n(x + 1.4)} ${n(y)}Z`, i % 2 ? '#6F9A57' : '#8DB46B', 0.85);
  }
  for (let i = 0; i < 12; i++) {
    const x = rand() * W;
    const y = 110 + rand() * 14;
    const col = ['#FFFDF2', '#F7DF86', '#E9B3C4'][i % 3]!;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      p.fill(ellipse(x + Math.cos(a) * 1.7, y + Math.sin(a) * 1.7, 1.4, 1.4), col);
    }
    p.fill(ellipse(x, y, 0.9, 0.9), shade(col, 0.7));
  }
  return p.svg();
}
