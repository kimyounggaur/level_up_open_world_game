// 지역 표지와 큰 소품(풍향계, 정자, 기준음 탑, 메아리 벽)을 햇살 과슈 화풍으로 칠한다. 틀 크기와 서는 자리(아래 가운데)는 이전과 같다.
// 해는 왼쪽 위: 돌과 나무의 왼쪽 면은 볕, 오른쪽 면은 그늘이다. 악보 기호는 뜻이 있는 자리에만 정확한 모양으로 둔다(풍향계의 높은음자리표, 설계서 9.4).
import { Paint, SHADOW, blob, ellipse, lit, mix, n, rng, roundRect, seedOf, shade, smoothOpen } from './paint';
import type { Pt } from './paint';

const STONE = '#E4D9BD';
const STONE_DARK = '#C9BB98';
const WOOD = '#9A6A4C';
const BRASS = '#D2A84E';
const GRASS = '#7FA163';
const MOSS = '#7E9C5A';

/** 왼쪽은 볕, 오른쪽은 그늘인 가로 그라디언트 */
const sideLight = (p: Paint, base: string, k = 1): string => p.linear([[0, lit(base, 0.45 * k)], [0.4, base], [1, shade(base, 0.6 * k)]], 0);

/** 풀 포기: 밑동 둘레에 세 갈래 잎 */
function tuft(p: Paint, x: number, y: number, s: number, rand: () => number, color = GRASS): void {
  const k = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < k; i++) {
    const dx = (i - (k - 1) / 2) * 2.6 * s;
    const h = (5 + rand() * 5) * s;
    const lean = (rand() - 0.5) * 5 * s;
    p.fill(`M${n(x + dx - 1.6 * s)} ${n(y)}Q${n(x + dx + lean * 0.4)} ${n(y - h * 0.6)} ${n(x + dx + lean)} ${n(y - h)}Q${n(x + dx + lean * 0.3 + 0.8 * s)} ${n(y - h * 0.4)} ${n(x + dx + 1.6 * s)} ${n(y)}Z`, i % 2 ? lit(color, 0.5) : color);
  }
}

/** 이끼 얼룩 */
function moss(p: Paint, x: number, y: number, w: number, h: number, rand: () => number): void {
  p.fill(blob(x, y, w, h, rand, { points: 7, wobble: 0.25 }), MOSS, 0.85);
  p.fill(blob(x - w * 0.2, y - h * 0.25, w * 0.55, h * 0.5, rand, { points: 6, wobble: 0.25 }), lit(MOSS, 0.6), 0.8);
}

// ───── 음자리표 풍향계(오선 언덕, 112×192) ─────

export function paintWeathervane(name: string): string {
  const p = new Paint(name, 112, 192);
  const rand = rng(seedOf(name));
  p.groundShadow(66, 184, 46, 8);

  // 아래 넓은 단: 윗면과 앞면
  p.fill(roundRect(14, 168, 84, 16, 5), sideLight(p, STONE_DARK));
  p.fill(roundRect(14, 163, 84, 9, 4), lit(STONE, 0.4));
  // 받침 돌: 볕을 받는 왼쪽과 그늘진 오른쪽, 돌 이음매
  p.fill(roundRect(26, 128, 60, 42, 6), sideLight(p, STONE));
  p.stroke('M28 149H84M44 129V149M66 149V169', shade(STONE, 0.35), 1.1, 0.55);
  // 바람꽃 무늬를 새긴 놋쇠 판
  p.fill(roundRect(38, 136, 36, 26, 4), shade(BRASS, 0.45));
  p.fill(roundRect(39.2, 137.2, 33.6, 23.6, 3.4), sideLight(p, BRASS, 0.7));
  const cx = 56;
  const cy = 149;
  p.fill(`M${cx} ${cy - 9}L${cx + 2.4} ${cy - 2.4}L${cx + 9} ${cy}L${cx + 2.4} ${cy + 2.4}L${cx} ${cy + 9}L${cx - 2.4} ${cy + 2.4}L${cx - 9} ${cy}L${cx - 2.4} ${cy - 2.4}Z`, shade(BRASS, 0.75));
  p.fill(ellipse(cx, cy, 1.8, 1.8), lit(BRASS, 0.9));
  // 뚜껑 돌
  p.fill(roundRect(20, 122, 72, 12, 5), lit(STONE, 0.3));
  p.fill('M22 131H90V134H22Z', shade(STONE, 0.4), 0.7);
  p.stroke('M24 124.6H70', lit(STONE, 0.9), 1.4, 0.8);
  moss(p, 30, 168, 9, 3.4, rand);
  moss(p, 88, 170, 7, 3, rand);
  tuft(p, 16, 184, 1, rand);
  tuft(p, 98, 185, 0.9, rand);

  // 쇠 기둥과 가로대, 놋쇠 구슬
  p.fill(roundRect(52.5, 96, 7, 28, 3), sideLight(p, '#5E5B66'));
  p.fill(roundRect(36, 104, 40, 4.4, 2), sideLight(p, '#5E5B66'));
  for (const x of [36, 76]) {
    p.fill(ellipse(x, 106, 4.4, 4.4), sideLight(p, BRASS));
    p.fill(ellipse(x - 1.3, 104.7, 1.5, 1.5), '#FFF6D8', 0.9);
  }

  // 높은음자리표(뜻이 있는 기호라 모양은 이전과 같다): 그늘 → 청록 쇠 → 볕
  const clef = 'translate(33.6 4) scale(0.8)';
  const paths: Array<[string, number]> = [
    ['M28 2L28 112', 6],
    ['M28 112C28 124 14 126 10 118C7 112 12 106 18 108', 6],
    ['M30 2C40 14 42 30 32 46C22 60 -2 70 2 90C6 108 28 108 36 94C42 84 40 68 26 66C16 64 10 74 18 80', 7],
    ['M30 2C18 10 4 22 6 36C8 50 20 56 28 60', 7],
  ];
  const teal = '#1E7466';
  p.add(`<g transform="translate(1.6 1.8)">`);
  for (const [d, w] of paths) p.stroke(d, shade(teal, 0.9), w + 1.2, 0.45, `transform="${clef}"`);
  p.add('</g>');
  for (const [d, w] of paths) p.stroke(d, teal, w, 1, `transform="${clef}"`);
  p.add(`<g transform="translate(-0.9 -1)">`);
  for (const [d, w] of paths) p.stroke(d, lit(teal, 1), w * 0.28, 0.75, `transform="${clef}"`);
  p.add('</g>');
  p.fill(ellipse(56, 6, 4.5, 4.5), sideLight(p, BRASS));
  p.fill(ellipse(54.6, 4.7, 1.5, 1.5), '#FFF6D8', 0.9);
  return p.svg();
}

// ───── 정자(음계 길, 200×190) ─────

export function paintGazebo(name: string): string {
  const p = new Paint(name, 200, 190);
  const rand = rng(seedOf(name));
  p.groundShadow(110, 181, 94, 9);

  // 돌 기단: 앞면, 윗면, 계단
  p.fill(roundRect(12, 150, 176, 30, 6), sideLight(p, STONE_DARK));
  p.stroke('M14 165H186M40 151V165M84 151V165M128 151V165M168 151V165M60 165V179M108 165V179M150 165V179', shade(STONE_DARK, 0.4), 1, 0.5);
  p.fill(roundRect(8, 140, 184, 20, 6), lit(STONE, 0.25));
  p.stroke('M14 143.4H150', lit(STONE, 0.9), 1.4, 0.8);
  p.fill(roundRect(82, 170, 36, 12, 3), lit(STONE, 0.15));
  p.fill(roundRect(86, 177, 28, 8, 2.5), STONE);
  moss(p, 26, 178, 10, 3.2, rand);
  moss(p, 174, 176, 8, 3, rand);
  tuft(p, 10, 182, 1.1, rand);
  tuft(p, 192, 181, 1, rand);

  // 마루 그늘(지붕 아래)과 기둥, 난간
  p.fill('M20 138H180V144H20Z', shade(STONE, 0.6), 0.5);
  const pillar = '#A9553F';
  for (const x of [30, 64, 127, 161]) {
    p.fill(roundRect(x, 72, 9, 70, 2), sideLight(p, pillar));
    p.fill(roundRect(x - 1.5, 136, 12, 6, 2), shade(STONE, 0.3));
  }
  const rail = WOOD;
  for (const [x, w] of [[39, 25], [136, 25]] as const) {
    p.fill(roundRect(x, 104, w, 5, 1.5), sideLight(p, rail));
    p.fill(roundRect(x, 122, w, 5, 1.5), sideLight(p, rail));
    for (let i = 1; i < 4; i++) p.fill(`M${n(x + (w / 4) * i - 1)} 109H${n(x + (w / 4) * i + 1)}V122H${n(x + (w / 4) * i - 1)}Z`, shade(rail, 0.3));
  }
  // 현판: 짙은 판에 놋쇠 테
  p.fill(roundRect(86, 88, 28, 18, 3), shade(BRASS, 0.5));
  p.fill(roundRect(88, 90, 24, 14, 2.4), '#3F4E55');
  p.stroke('M93 97H107', lit(BRASS, 0.6), 1.4, 0.9);

  // 처마 밑: 서까래 띠(청록과 주홍의 단청 띠는 얇게만)
  p.fill('M14 80H186V92H14Z', '#3E5559');
  p.fill('M18 80H182V84H18Z', '#2E7D6E');
  for (let x = 22; x < 180; x += 8) p.fill(ellipse(x, 82, 1.3, 1.3), '#E59A5A', 0.9);
  for (let x = 20; x < 182; x += 6) p.fill(`M${x} 84H${x + 3}V92H${x}Z`, shade('#3E5559', 0.4), 0.6);

  // 지붕: 곡선 처마, 기와 줄, 볕을 받는 왼쪽
  const roof = '#5E7F86';
  const roofD = 'M0 70C22 68 36 52 48 30H152C164 52 178 68 200 70L188 84H12Z';
  p.fill(roofD, p.linear([[0, lit(roof, 0.55)], [0.5, roof], [1, shade(roof, 0.55)]], 0));
  p.group(p.clip(roofD), () => {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const top = 48 + t * 104;
      const bottom = 4 + t * 192;
      p.stroke(`M${n(top)} 32Q${n((top + bottom) / 2 + (t - 0.5) * 6)} 60 ${n(bottom)} 84`, shade(roof, 0.5), 1.6, 0.55);
      p.stroke(`M${n(top - 1.6)} 32Q${n((top + bottom) / 2 + (t - 0.5) * 6 - 1.6)} 60 ${n(bottom - 1.8)} 84`, lit(roof, 0.6), 0.9, 0.5);
    }
    p.fill('M0 76H200V86H0Z', shade(roof, 0.7), 0.55);
  });
  // 처마 끝 들림과 마구리
  p.fill('M0 70C-2 64 2 60 6 62L14 74Z', lit(roof, 0.3));
  p.fill('M200 70C202 64 198 60 194 62L186 74Z', shade(roof, 0.3));
  p.fill(ellipse(8, 72, 3, 3), '#EFE6CB');
  p.fill(ellipse(192, 72, 3, 3), shade('#EFE6CB', 0.3));
  // 용마루와 꼭대기 장식
  p.fill(roundRect(44, 22, 112, 11, 5.5), sideLight(p, '#EDE3C7'));
  p.stroke('M50 25H120', '#FFFBEF', 1.4, 0.8);
  p.fill(roundRect(98, 10, 4, 14, 1.5), sideLight(p, WOOD));
  p.fill(ellipse(100, 9, 5, 5), sideLight(p, BRASS));
  p.fill(ellipse(98.6, 7.6, 1.6, 1.6), '#FFF6D8', 0.9);
  return p.svg();
}

// ───── 기준음 탑(건반 늪, 160×250): 소리굽쇠와 A4 판 ─────

/** 글꼴 없이 선으로 쓴 'A4'(굽는 기계의 글꼴에 기대지 않는다) */
function a4(p: Paint, x: number, y: number, h: number, color: string): void {
  const w = h * 0.62;
  p.stroke(`M${n(x)} ${n(y + h)}L${n(x + w / 2)} ${n(y)}L${n(x + w)} ${n(y + h)}M${n(x + w * 0.22)} ${n(y + h * 0.62)}H${n(x + w * 0.78)}`, color, h * 0.15);
  const x2 = x + w + h * 0.24;
  p.stroke(`M${n(x2 + w * 0.62)} ${n(y + h)}V${n(y)}L${n(x2)} ${n(y + h * 0.68)}H${n(x2 + w * 0.86)}`, color, h * 0.15);
}

export function paintTuningTower(name: string): string {
  const p = new Paint(name, 160, 250);
  const rand = rng(seedOf(name));
  p.groundShadow(90, 242, 66, 9);

  // 단 두 개
  p.fill(roundRect(20, 222, 120, 20, 7), sideLight(p, STONE_DARK));
  p.fill(roundRect(20, 217, 120, 9, 4), lit(STONE, 0.3));
  p.fill(roundRect(34, 202, 92, 22, 7), sideLight(p, STONE));
  p.stroke('M38 205.6H110', lit(STONE, 0.9), 1.3, 0.8);
  // 탑 몸통: 아래가 조금 넓다
  const shaft = 'M60 206L63 114H97L100 206Z';
  p.fill(shaft, sideLight(p, STONE));
  p.group(p.clip(shaft), () => {
    p.stroke('M58 138H102M58 162H102M58 186H102M74 114V138M86 138V162M72 162V186M88 186V206', shade(STONE, 0.4), 1.1, 0.5);
    p.fill('M90 110H104V210H90Z', shade(STONE, 0.5), 0.35);
  });
  // A4 판(진한 판에 놋쇠 글자)
  p.fill(roundRect(68, 146, 24, 30, 4), shade(BRASS, 0.5));
  p.fill(roundRect(69.6, 147.6, 20.8, 26.8, 3), '#3F4A5E');
  a4(p, 71.6, 153, 14, lit(BRASS, 0.5));
  // 뚜껑 돌
  p.fill(roundRect(56, 102, 48, 14, 6), lit(STONE, 0.35));
  p.fill('M58 113H102V116H58Z', shade(STONE, 0.45), 0.7);
  moss(p, 40, 222, 10, 3.4, rand);
  moss(p, 118, 224, 9, 3.2, rand);
  // 갈대(늪)
  for (const [x, s] of [[14, 1.2], [26, 0.9], [138, 1.1], [149, 0.85]] as const) tuft(p, x, 241, s, rand, '#7D9A6E');
  for (const [x, h] of [[18, 40], [144, 34]] as const) {
    p.stroke(`M${x} 240Q${x + 2} ${240 - h / 2} ${x - 1} ${240 - h}`, '#8C8A5E', 1.6);
    p.fill(roundRect(x - 3.2, 240 - h - 9, 5, 11, 2.5), '#7A5A44');
  }

  // 소리굽쇠: 손잡이와 U자 갈래(보랏빛 쇠)
  const fork = '#8E86A8';
  p.fill(roundRect(76, 72, 8, 34, 3), sideLight(p, fork));
  const u = 'M58 18V62Q58 82 80 82Q102 82 102 62V18';
  p.stroke(u, shade(fork, 0.9), 12.4, 0.5, 'transform="translate(1.8 2)"');
  p.stroke(u, fork, 11);
  p.stroke('M58 20V62Q58 80 76 81.4', lit(fork, 1), 3, 0.8, 'transform="translate(-2.2 -0.6)"');
  p.stroke('M102 20V58', shade(fork, 0.6), 3, 0.6, 'transform="translate(2.4 0)"');
  // 떨리는 소리 물결(빛 번짐 + 선)
  const arcs = ['M42 30Q34 46 42 62', 'M26 24Q14 46 26 68', 'M118 30Q126 46 118 62', 'M134 24Q146 46 134 68'];
  for (const d of arcs) p.stroke(d, lit(fork, 1), 8, 0.22);
  for (const d of arcs) p.stroke(d, lit(fork, 0.6), 3, 0.85);
  return p.svg();
}

// ───── 메아리 벽(종나무 숲, 520×150): 아치 다섯과 손종 ─────

/** 아치의 가운데 x: 벽 앞 땅의 돌 다섯(월드 x 392·496·600·704·808)과 같은 줄이다 */
export const ECHO_ARCH_X = [52, 156, 260, 364, 468] as const;

export function paintEchoWall(name: string): string {
  const p = new Paint(name, 520, 150);
  const rand = rng(seedOf(name));
  // 벽이 오른쪽 아래로 드리운 그림자
  p.fill(roundRect(34, 66, 480, 80, 10), SHADOW, 0.2);
  p.fill(roundRect(28, 60, 480, 76, 10), SHADOW, 0.12);

  // 벽 몸통: 위는 볕, 아래로 갈수록 짙다. 돌 블록 줄눈
  const wall = '#D9CBA6';
  const body = roundRect(20, 44, 480, 80, 8);
  p.fill(body, p.linear([[0, lit(wall, 0.35)], [0.55, wall], [1, shade(wall, 0.45)]], 90));
  p.group(p.clip(body), () => {
    const rows = [56, 78, 101, 124];
    for (let i = 0; i < rows.length - 1; i++) {
      const y0 = rows[i]!;
      const y1 = rows[i + 1]!;
      p.stroke(`M20 ${y1}H500`, shade(wall, 0.4), 1.2, 0.6);
      p.stroke(`M20 ${y1 + 1.4}H500`, lit(wall, 0.5), 0.8, 0.5);
      const off = i % 2 === 0 ? 0 : 30;
      for (let x = 20 + off; x < 500; x += 60) {
        p.stroke(`M${x} ${y0}V${y1}`, shade(wall, 0.4), 1.1, 0.55);
        if (rand() < 0.35) p.fill(roundRect(x + 4, y0 + 3, 50, y1 - y0 - 6, 3), lit(wall, 0.25), 0.4);
      }
    }
  });

  // 아치: 안쪽은 어둡고 아래로 밝아진다. 테두리 돌은 왼쪽 위가 밝다
  for (const cx of ECHO_ARCH_X) {
    const arch = `M${cx - 26} 124V88a26 26 0 0 1 52 0V124Z`;
    p.fill(arch, p.linear([[0, '#4E4638'], [0.7, '#6E624C'], [1, '#85765C']], 90));
    p.stroke(`M${cx - 27} 124V88a27 27 0 0 1 54 0V124`, shade(wall, 0.25), 4, 0.9);
    p.stroke(`M${cx - 28.4} 122V88a28.4 28.4 0 0 1 22 -27.6`, lit(wall, 0.8), 1.6, 0.8);
    // 줄과 손종
    p.stroke(`M${cx} 63V92`, '#5A4632', 1.6);
    const bell = `M${cx - 13} 116C${cx - 12} 102 ${cx - 9} 92 ${cx} 92C${cx + 9} 92 ${cx + 12} 102 ${cx + 13} 116Q${cx} 120 ${cx - 13} 116Z`;
    p.fill(bell, sideLight(p, BRASS));
    p.fill(ellipse(cx, 116, 13, 3.2), shade(BRASS, 0.55));
    p.fill(ellipse(cx, 119, 3.4, 3.4), shade(BRASS, 0.9));
    p.stroke(`M${cx - 7} 100Q${cx - 9} 106 ${cx - 9.4} 112`, '#FFF4D2', 2, 0.8);
  }

  // 갓돌(위 덮개): 윗면과 앞 턱
  p.fill(roundRect(12, 30, 496, 24, 8), p.linear([[0, lit(STONE, 0.5)], [1, STONE]], 90));
  p.fill('M12 48H508V54H12Z', shade(STONE, 0.45));
  p.stroke('M20 33.4H420', '#FFFBEF', 1.4, 0.8);
  // 이끼와 덩굴
  for (const [x, w] of [[40, 22], [150, 14], [300, 26], [430, 18]] as const) moss(p, x, 31, w, 4.4, rand);
  // 덩굴은 아치 사이 벽(첫째와 둘째 아치 사이)에 늘어진다
  const vine: Pt[] = [
    { x: 106, y: 50 },
    { x: 100, y: 62 },
    { x: 108, y: 76 },
    { x: 102, y: 90 },
    { x: 106, y: 102 },
  ];
  p.stroke(smoothOpen(vine), shade(MOSS, 0.5), 1.4);
  for (const v of vine) p.fill(ellipse(v.x + 3, v.y, 3.2, 2.2), mix(MOSS, GRASS, 0.5));
  for (const x of [26, 120, 210, 330, 410, 494]) tuft(p, x, 126, 1, rand);
  return p.svg();
}
