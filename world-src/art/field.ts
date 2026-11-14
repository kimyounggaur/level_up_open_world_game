// 허수아비 밭(관찰 O1)의 그림: 허수아비 둘(기둥이 위, 아래)과 가운데 줄 밧줄. 햇살 과슈 화풍으로 칠하되 뜻이 있는 자리는 이전과 같다.
// - 허수아비의 머리가 음표 머리이고 그림의 기준점이다. 기둥(막대)은 너비 8의 사각형으로 두고 자리와 길이도 이전과 같다:
//   시험(tests/unit/scarecrow-field.test.ts)이 `<rect x y width="8" height>`를 읽어 기둥이 머리에서 100 px 넘게 뻗는지 본다.
// - 밧줄은 보표의 가운데 줄이라 곧게 둔다(처지게 그리지 않는다).
import { Paint, blob, ellipse, lit, n, rng, roundRect, seedOf, shade } from './paint';

const STRAW = '#E7D49B';
const BURLAP = '#E3D2A6';
const POLE = '#9A6A4C';
const HAT = '#B4823F';
const ROPE = '#B98B5E';

interface Head {
  /** 음표 머리(자루 몸통)의 가운데와 크기, 기울기 */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
}

function drawHead(p: Paint, h: Head, rand: () => number, face: { eyes: [number, number][]; mouth: string }, hat: { d: string; band: string }): void {
  // 밑에 삐져나온 짚
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + (i / 8) * 0.7);
    const x = h.cx + Math.cos(a) * h.rx * 0.8;
    const y = h.cy + Math.sin(a) * h.ry * 0.85;
    const len = 6 + rand() * 6;
    p.stroke(`M${n(x)} ${n(y)}l${n(Math.cos(a) * len * 0.5 + (rand() - 0.5) * 3)} ${n(len)}`, i % 2 ? STRAW : shade(STRAW, 0.35), 2.2);
  }
  // 자루 몸통: 볕을 받는 왼쪽 위가 밝다
  const sack = `M${n(h.cx - h.rx)} ${n(h.cy)}a${n(h.rx)} ${n(h.ry)} 0 1 0 ${n(2 * h.rx)} 0a${n(h.rx)} ${n(h.ry)} 0 1 0 ${n(-2 * h.rx)} 0Z`;
  const rot = `transform="rotate(${n(h.rot)} ${n(h.cx)} ${n(h.cy)})"`;
  p.add(`<path d="${sack}" fill="${p.radial([[0, lit(BURLAP, 0.7)], [0.55, BURLAP], [1, shade(BURLAP, 0.55)]], 0.32, 0.3, 0.8)}" ${rot}/>`);
  // 자루 결(가로 바늘땀)
  p.add(`<g ${rot}>`);
  for (let i = -2; i <= 2; i++) p.stroke(`M${n(h.cx - h.rx * 0.7)} ${n(h.cy + i * 5.5)}Q${n(h.cx)} ${n(h.cy + i * 5.5 + 2)} ${n(h.cx + h.rx * 0.7)} ${n(h.cy + i * 5.5)}`, shade(BURLAP, 0.25), 0.8, 0.45);
  p.stroke(`M${n(h.cx - h.rx * 0.95)} ${n(h.cy - 2)}q${n(h.rx * 0.3)} ${n(-h.ry * 0.7)} ${n(h.rx * 0.9)} ${n(-h.ry * 0.86)}`, '#FFF8E4', 1.6, 0.7);
  p.add('</g>');
  // 얼굴: 단추 눈, 볼, 웃는 입
  for (const [x, y] of face.eyes) {
    p.fill(ellipse(x, y, 3.2, 3.2), '#5B4636');
    p.fill(ellipse(x - 1, y - 1, 1, 1), '#FFF4DE', 0.9);
  }
  p.fill(ellipse(face.eyes[0]![0] - 5, face.eyes[0]![1] + 6, 3.4, 2), '#E79C86', 0.45);
  p.fill(ellipse(face.eyes[1]![0] + 5, face.eyes[1]![1] + 6, 3.4, 2), '#E79C86', 0.45);
  p.stroke(face.mouth, '#5B4636', 2.2);
  // 밀짚모자
  p.fill(hat.d, p.linear([[0, lit(HAT, 0.5)], [0.6, HAT], [1, shade(HAT, 0.5)]], 20));
  p.fill(hat.band, '#8E3F3A');
}

/** 기둥(음표의 기둥): 너비 8의 사각형. 시험이 이 사각형을 읽는다 */
function pole(p: Paint, x: number, y: number, h: number): void {
  const fill = p.linear([[0, lit(POLE, 0.6)], [0.45, POLE], [1, shade(POLE, 0.6)]], 0);
  p.add(`<rect x="${x}" y="${y}" width="8" height="${h}" rx="3" fill="${fill}"/>`);
  p.stroke(`M${x + 2.6} ${y + 10}v${n(h * 0.25)}M${x + 5} ${y + h * 0.55}v${n(h * 0.3)}`, shade(POLE, 0.5), 0.9, 0.5);
}

/** 기둥 끝의 둥근 손잡이(이전 그림의 고리 자리) */
function knob(p: Paint, x: number, y: number): void {
  p.fill(ellipse(x, y, 10, 10), shade('#EFE6CB', 0.3));
  p.fill(ellipse(x, y, 8.6, 8.6), p.radial([[0, '#FFFBEE'], [0.6, '#EFE6CB'], [1, shade('#EFE6CB', 0.4)]], 0.35, 0.3, 0.8));
  p.fill(blob(x - 1, y - 1, 5, 4, rng(7), { points: 6, wobble: 0.3 }), STRAW, 0.55);
}

/** 기둥이 위로 뻗은 허수아비(104×176, 머리 기준점 (46, 144)) */
export function paintScarecrowUp(name: string): string {
  const p = new Paint(name, 104, 176);
  const rand = rng(seedOf(name));
  p.groundShadow(52, 168, 38, 7);
  pole(p, 70, 24, 124);
  knob(p, 74, 22);
  drawHead(
    p,
    { cx: 46, cy: 144, rx: 31, ry: 22, rot: -16 },
    rand,
    { eyes: [[38, 146], [52, 146]], mouth: 'M39 154q6 4 12 0' },
    { d: 'M18 134q26-38 54-4-28 9-54 4Z', band: 'M24 131.5q20 -7 40 -2l-1 3.4q-19 -5 -38 1.6Z' },
  );
  return p.svg();
}

/** 기둥이 아래로 뻗은 허수아비(104×176, 머리 기준점 (58, 50)) */
export function paintScarecrowDown(name: string): string {
  const p = new Paint(name, 104, 176);
  const rand = rng(seedOf(name));
  p.groundShadow(52, 168, 38, 7);
  pole(p, 26, 30, 132);
  knob(p, 30, 162);
  drawHead(
    p,
    { cx: 58, cy: 50, rx: 31, ry: 22, rot: -16 },
    rand,
    { eyes: [[50, 52], [64, 52]], mouth: 'M51 60q6 4 12 0' },
    { d: 'M30 40q26-38 54-4-28 9-54 4Z', band: 'M36 37.5q20 -7 40 -2l-1 3.4q-19 -5 -38 1.6Z' },
  );
  return p.svg();
}

/** 가운데 줄 밧줄(700×44): 말뚝 둘과 꼬인 밧줄 */
export function paintFieldRope(name: string): string {
  const p = new Paint(name, 700, 44);
  p.fill(ellipse(352, 36, 334, 5.4), '#3E5A5C', 0.14);
  for (const x of [14, 674]) {
    p.fill(roundRect(x, 10, 12, 32, 3), p.linear([[0, lit(POLE, 0.6)], [0.45, POLE], [1, shade(POLE, 0.6)]], 0));
    p.fill(ellipse(x + 6, 11, 6, 2.4), lit(POLE, 0.4));
  }
  // 밧줄: 몸과 아래 그늘, 꼬임 무늬
  p.fill(roundRect(22, 19, 656, 6, 3), ROPE);
  p.fill('M22 23.4H678V25H22Z', shade(ROPE, 0.6), 0.7);
  p.fill('M24 19.6H676V20.8H24Z', lit(ROPE, 0.8), 0.7);
  let twists = '';
  for (let x = 28; x < 676; x += 7) twists += `M${x} 19.4l4.6 5.2`;
  p.stroke(twists, shade(ROPE, 0.45), 1.3, 0.75);
  return p.svg();
}
