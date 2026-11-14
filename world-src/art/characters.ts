// 주인공 캐릭터 그림(설계서 9.3: 48×72 칸, 4방향 × (서 있기 2장 + 걷기 6장) = 32장). 햇살 과슈 화풍의 셀 셰이딩으로 칠한다.
// 생김새: 보라 베레모(캐릭터에만 쓰는 보라 #755675, 설계서 9.2)와 연보라 웃옷, 청록 목도리, 등에 멘 우쿨렐레. 이 게임을 위해 새로 지은 모습이다.
// 발은 칸의 (24, 68)에 놓인다: 장면은 그림의 기준점을 (0.5, 68/72)로 두어 발이 캐릭터의 월드 좌표에 오게 한다.
// 오른쪽을 보는 장은 왼쪽을 보는 장을 좌우로 뒤집은 것이다(등에 멘 악기도 함께 뒤집힌다).
import type { Facing } from '../../src/domain/world';
import { PLAYER_FACINGS, PLAYER_FOOT_Y as FOOT_Y, PLAYER_FRAME_H as CHARACTER_H, PLAYER_FRAME_W as CHARACTER_W, PLAYER_POSE_FRAMES as POSE_FRAMES, playerFrameName } from '../../src/world/playerSprite';
import type { PlayerPose as Pose } from '../../src/world/playerSprite';
import { Paint, ellipse, lit, n, roundRect, shade } from './paint';

const C = {
  skin: '#F4D0AE',
  hair: '#5B3B2E',
  beret: '#755675',
  jacket: '#8E6E91',
  shirt: '#F5ECD6',
  scarf: '#2C8B7C',
  shorts: '#6A4C3D',
  sock: '#F1E7D0',
  boot: '#6B4733',
  strap: '#7A5236',
  uke: '#CD8E4F',
  eye: '#3A2C35',
  blush: '#EFA08B',
  mouth: '#8A4B3E',
} as const;

interface Frame {
  /** 윗몸(머리와 몸통)이 위아래로 움직인 만큼(음수가 위) */
  bob: number;
  /** 앞·뒤 모습: 발을 든 높이. 옆 모습: 다리의 각도(도, 양수가 앞으로) */
  legA: number;
  legB: number;
  /** 팔: 앞·뒤 모습은 손의 위아래, 옆 모습은 각도 */
  armA: number;
  armB: number;
  /** 눈을 감았는가(서 있기의 둘째 장) */
  blink: boolean;
  /** 숨 쉬기: 어깨가 내려간 만큼 */
  breath: number;
}

/** 장마다 자세 값. 걷기 6장은 한 걸음이 두 번(왼발, 오른발) 지나가는 한 바퀴다 */
export function frameOf(pose: Pose, i: number, side: boolean): Frame {
  if (pose === 'idle') return { bob: 0, legA: 0, legB: 0, armA: 0, armB: 0, blink: i === 1, breath: i === 1 ? 0.5 : 0 };
  const phi = (i / 6) * Math.PI * 2;
  const s = Math.sin(phi);
  const bob = -1.3 * (1 - Math.abs(s));
  if (side) return { bob, legA: 26 * s, legB: -26 * s, armA: -22 * s, armB: 22 * s, blink: false, breath: 0 };
  return { bob, legA: 2.6 * Math.max(0, s), legB: 2.6 * Math.max(0, -s), armA: 1.3 * s, armB: -1.3 * s, blink: false, breath: 0 };
}

/** 셀 셰이딩 한 덩어리: 바탕 → 오른쪽 아래 그늘 → 왼쪽 위 볕 */
function cel(p: Paint, d: string, base: string, k = 1): void {
  p.fill(d, base);
  p.crescent(d, shade(base, 0.55 * k), 2.2, 1.6, 0.9);
}

function boot(p: Paint, x: number, y: number, flip = false): void {
  const d = roundRect(x - 3.8, y - 3.6, 7.6, 6.4, 2.6);
  cel(p, d, C.boot);
  p.fill(ellipse(x - (flip ? -1.4 : 1.4), y - 2.2, 1.6, 0.9), lit(C.boot, 0.9), 0.7);
}

function headFront(p: Paint, cx: number, cy: number, f: Frame, back: boolean): void {
  // 머리카락 뒤쪽(목덜미까지)
  p.fill(`M${n(cx - 12)} ${n(cy - 1)}Q${n(cx - 12.6)} ${n(cy + 9)} ${n(cx - 8)} ${n(cy + 11)}H${n(cx + 8)}Q${n(cx + 12.6)} ${n(cy + 9)} ${n(cx + 12)} ${n(cy - 1)}Z`, shade(C.hair, 0.4));
  if (back) {
    cel(p, ellipse(cx, cy, 12, 11.6), C.hair);
    p.stroke(`M${n(cx - 5)} ${n(cy + 2)}q1 5 -1 8M${n(cx + 3)} ${n(cy + 3)}q1 4 0 7`, shade(C.hair, 0.6), 0.8, 0.7);
  } else {
    // 얼굴, 귀
    p.fill(ellipse(cx - 11.2, cy + 2.4, 2, 2.6), shade(C.skin, 0.25));
    p.fill(ellipse(cx + 11.2, cy + 2.4, 2, 2.6), shade(C.skin, 0.45));
    cel(p, ellipse(cx, cy + 1, 11.2, 10.8), C.skin, 0.6);
    // 앞머리와 옆머리
    p.fill(`M${n(cx - 11.6)} ${n(cy + 3)}Q${n(cx - 12)} ${n(cy - 9)} ${n(cx)} ${n(cy - 10)}Q${n(cx + 12)} ${n(cy - 9)} ${n(cx + 11.6)} ${n(cy + 3)}Q${n(cx + 9)} ${n(cy - 3)} ${n(cx + 4)} ${n(cy - 3.4)}Q${n(cx + 1)} ${n(cy - 1)} ${n(cx - 2)} ${n(cy - 3.6)}Q${n(cx - 7)} ${n(cy - 2.6)} ${n(cx - 11.6)} ${n(cy + 3)}Z`, C.hair);
    p.stroke(`M${n(cx - 7)} ${n(cy - 6.4)}q4 -2.4 9 -1.6`, lit(C.hair, 0.9), 1.1, 0.7);
    // 눈, 볼, 입
    const ey = cy + 2.8;
    for (const ex of [cx - 4.6, cx + 4.6]) {
      if (f.blink) p.stroke(`M${n(ex - 1.8)} ${n(ey + 0.4)}q1.8 1.2 3.6 0`, C.eye, 1);
      else {
        p.fill(ellipse(ex, ey, 1.75, 2.3), C.eye);
        p.fill(ellipse(ex - 0.55, ey - 0.85, 0.7, 0.7), '#FFFFFF');
      }
    }
    p.fill(ellipse(cx - 7.4, cy + 6.4, 2.2, 1.3), C.blush, 0.55);
    p.fill(ellipse(cx + 7.4, cy + 6.4, 2.2, 1.3), C.blush, 0.55);
    p.stroke(`M${n(cx - 1.4)} ${n(cy + 7.6)}q1.4 1.2 2.8 0`, C.mouth, 0.95);
  }
  beret(p, cx, cy, back ? 1 : -1);
}

function beret(p: Paint, cx: number, cy: number, tilt: number): void {
  const d = `M${n(cx - 13)} ${n(cy - 6.6)}Q${n(cx - 12)} ${n(cy - 15.4)} ${n(cx + 1)} ${n(cy - 15.6)}Q${n(cx + 13.4)} ${n(cy - 15)} ${n(cx + 13.6)} ${n(cy - 7.4)}Q${n(cx + 7)} ${n(cy - 4.6)} ${n(cx)} ${n(cy - 4.8)}Q${n(cx - 7.4)} ${n(cy - 4.4)} ${n(cx - 13)} ${n(cy - 6.6)}Z`;
  p.add(`<g transform="rotate(${n(tilt * 5)} ${n(cx)} ${n(cy - 9)})">`);
  cel(p, d, C.beret);
  p.stroke(`M${n(cx - 8.6)} ${n(cy - 12.4)}Q${n(cx - 3)} ${n(cy - 15)} ${n(cx + 3)} ${n(cy - 14.6)}`, lit(C.beret, 1), 1.4, 0.8);
  p.fill(roundRect(cx - 0.9, cy - 18.6, 1.8, 3.6, 0.9), shade(C.beret, 0.4));
  p.add('</g>');
}

function torsoFront(p: Paint, cx: number, top: number, f: Frame, back: boolean): void {
  const y = top + f.breath;
  const jacket = `M${n(cx - 9.6)} ${n(y + 1)}Q${n(cx - 11)} ${n(y + 9)} ${n(cx - 9)} ${n(y + 15)}H${n(cx + 9)}Q${n(cx + 11)} ${n(y + 9)} ${n(cx + 9.6)} ${n(y + 1)}Q${n(cx)} ${n(y - 1.6)} ${n(cx - 9.6)} ${n(y + 1)}Z`;
  cel(p, jacket, C.jacket);
  if (!back) {
    p.fill(`M${n(cx - 2.6)} ${n(y + 0.6)}L${n(cx)} ${n(y + 13.6)}L${n(cx + 2.6)} ${n(y + 0.6)}Z`, C.shirt);
    for (const by of [y + 6, y + 10]) p.fill(ellipse(cx + 3.6, by, 0.8, 0.8), shade(C.jacket, 0.7));
    // 악기 멜빵: 왼쪽 어깨에서 오른쪽 허리로
    p.stroke(`M${n(cx - 7.6)} ${n(y + 1.6)}L${n(cx + 8.4)} ${n(y + 13.8)}`, C.strap, 2.2);
    p.stroke(`M${n(cx - 7.2)} ${n(y + 1.2)}L${n(cx + 8.6)} ${n(y + 13.2)}`, lit(C.strap, 0.8), 0.6, 0.7);
  }
  // 허리띠 자리 그늘
  p.fill(`M${n(cx - 9)} ${n(y + 13.6)}H${n(cx + 9)}V${n(y + 15)}H${n(cx - 9)}Z`, shade(C.jacket, 0.6), 0.6);
}

function scarfFront(p: Paint, cx: number, y: number, back: boolean): void {
  cel(p, roundRect(cx - 8.4, y - 1, 16.8, 5, 2.5), C.scarf);
  p.stroke(`M${n(cx - 6)} ${n(y)}H${n(cx + 3)}`, lit(C.scarf, 0.9), 1, 0.8);
  const tx = back ? cx - 5 : cx + 5;
  cel(p, `M${n(tx - 2.2)} ${n(y + 3)}L${n(tx + 2.2)} ${n(y + 3)}L${n(tx + 1.4)} ${n(y + 10)}L${n(tx - 1.8)} ${n(y + 9.4)}Z`, C.scarf);
}

function armsFront(p: Paint, cx: number, top: number, f: Frame): void {
  const y = top + f.breath;
  for (const [side, dy] of [[-1, f.armA], [1, f.armB]] as const) {
    const x = cx + side * 10.4;
    const sleeve = `M${n(x - 2.6)} ${n(y + 1.6)}Q${n(x + side * 1.6)} ${n(y)} ${n(x + 2.6)} ${n(y + 1.6)}L${n(x + 2.2 + side * 0.6)} ${n(y + 11 + dy)}H${n(x - 2.2 + side * 0.6)}Z`;
    cel(p, sleeve, C.jacket);
    cel(p, ellipse(x + side * 0.6, y + 12 + dy, 2.4, 2.4), C.skin, 0.6);
  }
}

function legsFront(p: Paint, cx: number, f: Frame): void {
  for (const [side, lift] of [[-1, f.legA], [1, f.legB]] as const) {
    const x = cx + side * 4.2;
    p.fill(roundRect(x - 2, 54, 4, 10 - lift, 1.6), C.sock);
    p.fill(`M${n(x + 0.4)} 54H${n(x + 2)}V${n(64 - lift)}H${n(x + 0.4)}Z`, shade(C.sock, 0.4), 0.7);
    boot(p, x, 65.4 - lift);
  }
}

function shortsFront(p: Paint, cx: number, f: Frame): void {
  const y = 48 + f.bob * 0.5;
  cel(p, `M${n(cx - 8.8)} ${n(y)}H${n(cx + 8.8)}L${n(cx + 8.4)} ${n(y + 7.6)}H${n(cx + 0.9)}L${n(cx)} ${n(y + 5.2)}L${n(cx - 0.9)} ${n(y + 7.6)}H${n(cx - 8.4)}Z`, C.shorts);
}

function ukuleleBack(p: Paint, cx: number, top: number): void {
  // 목(머리 뒤로 오른쪽 위를 향한다)과 머리
  p.stroke(`M${n(cx + 1)} ${n(top + 8)}L${n(cx + 9.6)} ${n(top - 17)}`, shade(C.uke, 0.5), 3.4);
  p.stroke(`M${n(cx + 0.4)} ${n(top + 8)}L${n(cx + 9)} ${n(top - 17)}`, C.uke, 2.2);
  cel(p, roundRect(cx + 7.6, top - 22, 4.6, 6.6, 1.6), shade(C.uke, 0.35));
  // 몸통(8자): 아래 큰 원, 위 작은 원, 울림구멍
  const body = `M${n(cx - 6.6)} ${n(top + 12)}Q${n(cx - 7.8)} ${n(top + 4.6)} ${n(cx - 4.4)} ${n(top + 2.6)}Q${n(cx - 6)} ${n(top - 2)} ${n(cx)} ${n(top - 2.6)}Q${n(cx + 6)} ${n(top - 2)} ${n(cx + 4.4)} ${n(top + 2.6)}Q${n(cx + 7.8)} ${n(top + 4.6)} ${n(cx + 6.6)} ${n(top + 12)}Q${n(cx)} ${n(top + 17)} ${n(cx - 6.6)} ${n(top + 12)}Z`;
  cel(p, body, C.uke);
  p.fill(ellipse(cx, top + 5, 2.2, 2.2), '#3B2A22');
  p.stroke(`M${n(cx - 4.6)} ${n(top + 3)}q-1.4 3 -1 7`, lit(C.uke, 1), 1, 0.8);
  p.fill(roundRect(cx - 2.6, top + 10.4, 5.2, 1.6, 0.6), shade(C.uke, 0.7));
}

/** 앞(down)과 뒤(up) 모습 */
function front(p: Paint, f: Frame, back: boolean): void {
  const cx = 24;
  p.groundShadow(24, FOOT_Y, 12.5, 3.6, 1.1);
  legsFront(p, cx, f);
  shortsFront(p, cx, f);
  const top = 35 + f.bob;
  if (back) {
    armsFront(p, cx, top, f);
    torsoFront(p, cx, top, f, true);
    ukuleleBack(p, cx, top + 3);
    headFront(p, cx, 21 + f.bob, f, true);
    scarfFront(p, cx, 32.4 + f.bob, true);
  } else {
    torsoFront(p, cx, top, f, false);
    armsFront(p, cx, top, f);
    scarfFront(p, cx, 32.4 + f.bob, false);
    headFront(p, cx, 21 + f.bob, f, false);
  }
}

/** 왼쪽을 보는 옆모습 */
function side(p: Paint, f: Frame): void {
  const cx = 24;
  const hipY = 52;
  p.groundShadow(24, FOOT_Y, 11.5, 3.4, 1.1);
  const leg = (angle: number, far: boolean): void => {
    const len = 11.6;
    const g = `transform="rotate(${n(angle)} ${cx} ${hipY})"`;
    p.add(`<g ${g}>`);
    p.fill(roundRect(cx - 2.1, hipY, 4.2, len, 1.8), far ? shade(C.sock, 0.45) : C.sock);
    p.add('</g>');
    const a = (angle * Math.PI) / 180;
    const fx = cx - Math.sin(a) * len;
    const fy = hipY + Math.cos(a) * len + 1.8;
    const toe = roundRect(fx - 5.2, fy - 2.8, 8.4, 5.6, 2.6);
    if (far) p.fill(toe, shade(C.boot, 0.45));
    else cel(p, toe, C.boot);
  };
  const top = 35 + f.bob;
  // 먼 쪽 다리와 팔(그늘색), 등에 멘 악기
  leg(f.legB, true);
  p.add(`<g transform="rotate(${n(f.armB)} ${cx + 1} ${n(top + 2)})">`);
  p.fill(roundRect(cx - 1, top + 1, 4.4, 11, 2), shade(C.jacket, 0.5));
  p.fill(ellipse(cx + 1.2, top + 12.6, 2.2, 2.2), shade(C.skin, 0.4));
  p.add('</g>');
  p.stroke(`M${n(cx + 6)} ${n(top + 10)}L${n(cx + 10.6)} ${n(top - 16)}`, shade(C.uke, 0.5), 3.4);
  p.stroke(`M${n(cx + 5.4)} ${n(top + 10)}L${n(cx + 10)} ${n(top - 16)}`, C.uke, 2.2);
  cel(p, roundRect(cx + 8.6, top - 21, 4.4, 6.4, 1.6), shade(C.uke, 0.35));
  cel(p, ellipse(cx + 7.4, top + 9, 4.6, 8.4), C.uke);
  p.fill(ellipse(cx + 8.8, top + 9, 1.6, 6.4), shade(C.uke, 0.55), 0.8);
  // 바지와 가까운 다리
  cel(p, roundRect(cx - 6.6, 47.6 + f.bob * 0.5, 13.2, 7.4, 2.4), C.shorts);
  leg(f.legA, false);
  // 몸통과 목도리(꼬리가 뒤로 날린다)
  const y = top + f.breath;
  cel(p, `M${n(cx - 6.8)} ${n(y + 1)}Q${n(cx - 8.2)} ${n(y + 9)} ${n(cx - 6.6)} ${n(y + 15)}H${n(cx + 6.6)}Q${n(cx + 7.8)} ${n(y + 9)} ${n(cx + 6.6)} ${n(y + 1)}Q${n(cx)} ${n(y - 1.6)} ${n(cx - 6.8)} ${n(y + 1)}Z`, C.jacket);
  p.stroke(`M${n(cx - 6)} ${n(y + 2)}L${n(cx + 5.6)} ${n(y + 13.6)}`, C.strap, 2.1);
  p.fill(`M${n(cx - 6.6)} ${n(y + 13.6)}H${n(cx + 6.6)}V${n(y + 15)}H${n(cx - 6.6)}Z`, shade(C.jacket, 0.6), 0.6);
  cel(p, roundRect(cx - 6.6, 31.4 + f.bob, 13.2, 5, 2.5), C.scarf);
  cel(p, `M${n(cx + 4)} ${n(33 + f.bob)}Q${n(cx + 11)} ${n(33.6 + f.bob)} ${n(cx + 13)} ${n(37.6 + f.bob)}L${n(cx + 9.6)} ${n(38.6 + f.bob)}Q${n(cx + 8)} ${n(36.6 + f.bob)} ${n(cx + 4)} ${n(36.4 + f.bob)}Z`, C.scarf);
  // 가까운 팔
  p.add(`<g transform="rotate(${n(f.armA)} ${cx} ${n(y + 2)})">`);
  cel(p, roundRect(cx - 2.4, y + 0.6, 4.8, 11.2, 2.2), C.jacket);
  cel(p, ellipse(cx, y + 12.6, 2.4, 2.4), C.skin, 0.6);
  p.add('</g>');
  // 머리: 뒷머리 → 얼굴(왼쪽을 본다) → 귀 → 앞머리 → 눈·볼·입 → 베레모
  const hx = 23.4;
  const hy = 21 + f.bob;
  p.fill(ellipse(hx + 2.4, hy + 1.4, 10.6, 10.6), shade(C.hair, 0.3));
  cel(p, `M${n(hx - 10.6)} ${n(hy + 2)}Q${n(hx - 11)} ${n(hy - 8)} ${n(hx - 1)} ${n(hy - 9.6)}Q${n(hx + 8)} ${n(hy - 9)} ${n(hx + 8)} ${n(hy + 2)}Q${n(hx + 7)} ${n(hy + 11)} ${n(hx - 2)} ${n(hy + 11)}Q${n(hx - 9.4)} ${n(hy + 10.6)} ${n(hx - 10.6)} ${n(hy + 2)}Z`, C.skin, 0.6);
  p.fill(`M${n(hx + 2)} ${n(hy - 9.4)}Q${n(hx + 12.4)} ${n(hy - 8)} ${n(hx + 11.6)} ${n(hy + 4)}Q${n(hx + 10.6)} ${n(hy + 10)} ${n(hx + 6)} ${n(hy + 10.6)}Q${n(hx + 7.4)} ${n(hy + 3)} ${n(hx + 3)} ${n(hy - 1)}Q${n(hx - 2)} ${n(hy - 2.4)} ${n(hx - 9)} ${n(hy - 1.6)}Q${n(hx - 8)} ${n(hy - 9.6)} ${n(hx + 2)} ${n(hy - 9.4)}Z`, C.hair);
  p.fill(ellipse(hx + 4.2, hy + 3, 2, 2.6), shade(C.skin, 0.3));
  p.stroke(`M${n(hx - 4)} ${n(hy - 6.4)}q4 -2.4 9 -1`, lit(C.hair, 0.9), 1.1, 0.7);
  const ex = hx - 5.4;
  const ey = hy + 2.8;
  if (f.blink) p.stroke(`M${n(ex - 1.6)} ${n(ey + 0.4)}q1.6 1.1 3.2 0`, C.eye, 1);
  else {
    p.fill(ellipse(ex, ey, 1.6, 2.3), C.eye);
    p.fill(ellipse(ex - 0.5, ey - 0.85, 0.65, 0.65), '#FFFFFF');
  }
  p.fill(ellipse(hx - 4.4, hy + 6.6, 2, 1.2), C.blush, 0.55);
  p.stroke(`M${n(hx - 9.2)} ${n(hy + 7.6)}q1.2 0.9 2.4 0.2`, C.mouth, 0.9);
  beret(p, hx + 1, hy, 1);
}

/** 캐릭터 그림 한 장 */
export function paintPlayerFrame(facing: Facing, pose: Pose, i: number): string {
  const name = playerFrameName(facing, pose, i);
  const p = new Paint(name, CHARACTER_W, CHARACTER_H);
  const isSide = facing === 'left' || facing === 'right';
  const f = frameOf(pose, i, isSide);
  if (facing === 'right') p.add(`<g transform="translate(${CHARACTER_W} 0) scale(-1 1)">`);
  if (isSide) side(p, f);
  else front(p, f, facing === 'up');
  if (facing === 'right') p.add('</g>');
  return p.svg();
}

/** 32장 전체: 그림 이름 → SVG 글 */
export function playerFrames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const facing of PLAYER_FACINGS) for (const pose of ['idle', 'walk'] as const) for (let i = 0; i < POSE_FRAMES[pose]; i++) out[`${playerFrameName(facing, pose, i)}.svg`] = paintPlayerFrame(facing, pose, i);
  return out;
}
