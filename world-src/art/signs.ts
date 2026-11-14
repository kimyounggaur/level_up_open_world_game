// 지역 표지판(정거장 곁 표지판과 길목 표지판이 같은 그림을 쓴다)을 햇살 과슈 화풍으로 칠한다. 틀과 자리는 이전과 같다(120×120, 발 (60, 112)).
// 시험(tests/flow/phase7-waysigns.flow.ts)이 길 위에서 찍은 사진에서 판의 바탕색과 윗띠 색을 읽는다:
//  - 판의 바탕색 #E9DDB8을 판 아래쪽(y 54–56, x 26·45·75·94)에 그대로 둔다. 그늘은 y 57 아래에만 깐다.
//  - 윗띠는 경로 `M14 19…`(판의 위쪽 모서리)이고 그 채움색이 지역색이다. 시험이 이 경로의 색을 읽으므로 경로와 색을 바꾸지 않는다. 띠의 가운데(y 17)는 지역색 그대로 둔다.
// 판 가운데(y 31–51)에는 점 셋 대신 지역의 그림표를 새긴다. 악보 기호는 장식으로 쓰지 않는다(설계서 9.4): 언덕과 바람, 물결, 손종, 디딤돌, 건반.
import type { RegionId } from '../../src/domain/world';
import { Paint, ellipse, lit, roundRect, shade } from './paint';

export const SIGN_BOARD = '#E9DDB8';
const POLE = '#957455';

/** 윗띠 색: 지역 강조색(설계서 9.2) */
export const SIGN_HEADER: Readonly<Record<Exclude<RegionId, 'village'>, string>> = {
  'staff-hill': '#7F9A7A',
  'beat-river': '#5E97A6',
  'bell-grove': '#B18B49',
  'scale-trail': '#C2AA70',
  'key-marsh': '#8E86A8',
};

function emblem(p: Paint, region: Exclude<RegionId, 'village'>, ink: string): void {
  const cx = 60;
  const cy = 41;
  switch (region) {
    case 'staff-hill': {
      // 언덕과 바람 두 줄기
      p.fill(`M${cx - 22} ${cy + 9}Q${cx - 6} ${cy - 9} ${cx + 8} ${cy + 1}Q${cx + 16} ${cy - 4} ${cx + 22} ${cy + 9}Z`, ink, 0.85);
      p.stroke(`M${cx - 18} ${cy - 6}q8 -5 16 -1t14 -2`, ink, 2.2, 0.8);
      p.stroke(`M${cx - 4} ${cy - 11}q7 -4 13 0`, ink, 2, 0.6);
      break;
    }
    case 'beat-river': {
      for (let i = 0; i < 3; i++) {
        const y = cy - 7 + i * 7;
        p.stroke(`M${cx - 20} ${y}q5 -4 10 0t10 0t10 0t10 0`, ink, 2.4, 0.9 - i * 0.12);
      }
      break;
    }
    case 'bell-grove': {
      // 손종: 손잡이, 몸통, 추
      p.fill(roundRect(cx - 2.5, cy - 15, 5, 8, 2), ink, 0.9);
      p.fill(`M${cx - 11} ${cy + 7}C${cx - 10} ${cy - 3} ${cx - 8} ${cy - 8} ${cx} ${cy - 8}C${cx + 8} ${cy - 8} ${cx + 10} ${cy - 3} ${cx + 11} ${cy + 7}Q${cx} ${cy + 10} ${cx - 11} ${cy + 7}Z`, ink, 0.9);
      p.fill(ellipse(cx, cy + 9.5, 3, 2.6), ink, 0.9);
      p.stroke(`M${cx - 6} ${cy - 3}q-1.5 4 -1.8 8`, lit(SIGN_BOARD, 0.4), 1.6, 0.7);
      break;
    }
    case 'scale-trail': {
      // 오르는 디딤돌 다섯
      for (let i = 0; i < 5; i++) {
        const x = cx - 22 + i * 9.5;
        const y = cy + 6 - i * 3.6;
        p.fill(roundRect(x, y - 4, 7, 9, 2.4), ink, 0.88);
      }
      break;
    }
    case 'key-marsh': {
      // 작은 건반: 흰 건반 다섯(테두리)과 검은 건반 셋
      const x0 = cx - 20;
      p.fill(roundRect(x0, cy - 10, 40, 20, 2.5), ink, 0.9);
      for (let i = 0; i < 5; i++) p.fill(roundRect(x0 + 1.6 + i * 7.6, cy - 8.4, 6.4, 16.8, 1.2), lit(SIGN_BOARD, 0.5));
      for (const i of [0, 1, 3]) p.fill(roundRect(x0 + 6 + i * 7.6, cy - 8.4, 4.4, 10, 1), ink);
      break;
    }
  }
}

/** 지역 표지판 한 장 */
export function paintSignpost(name: string, region: Exclude<RegionId, 'village'>): string {
  const p = new Paint(name, 120, 120);
  const header = SIGN_HEADER[region];
  const ink = shade(POLE, 0.55);

  // 땅 그림자(해가 왼쪽 위라 오른쪽으로 길다)
  p.groundShadow(70, 112, 30, 7);

  // 기둥: 왼쪽은 볕, 오른쪽은 그늘. 나뭇결 두 줄과 밑동의 풀
  p.fill(roundRect(55, 50, 10, 62, 3), p.linear([[0, lit(POLE, 0.6)], [0.45, POLE], [1, shade(POLE, 0.7)]], 0));
  p.stroke('M58 66v14M61.5 86v18', shade(POLE, 0.5), 1, 0.5);
  p.fill('M50 113q3 -9 6 -1q2 -10 4 0q3 -8 5 0q4 -9 6 0q2 -5 4 1Z', '#7FA163');
  p.fill('M53 113q2 -5 4 -1q2 -6 4 0q3 -5 5 0Z', lit('#7FA163', 0.6), 0.8);

  // 판의 두께(아래 모서리)와 판
  p.fill(roundRect(14, 14, 92, 52, 9), shade(SIGN_BOARD, 0.75));
  p.fill(roundRect(14, 10, 92, 52, 9), SIGN_BOARD);
  // 판 아래쪽 그늘: y 57부터만(시험이 읽는 y 54–56은 바탕색 그대로)
  p.group(p.clip(roundRect(14, 10, 92, 52, 9)), () => {
    p.fill('M14 57H106V62H14Z', shade(SIGN_BOARD, 0.35), 0.7);
    p.fill('M100 25H106V62H100Z', shade(SIGN_BOARD, 0.3), 0.45);
    // 나뭇결: 판의 위쪽 절반에만 옅게
    p.stroke('M20 30q20 -2 40 0t40 -1', shade(SIGN_BOARD, 0.3), 0.9, 0.45);
    p.stroke('M24 51q18 1 34 0', shade(SIGN_BOARD, 0.25), 0.8, 0.35);
    // 볕을 받는 왼쪽 위 가장자리
    p.stroke('M17.5 54V30', lit(SIGN_BOARD, 0.8), 1.6, 0.8);
  });

  // 윗띠(지역색). 시험이 이 경로의 채움색을 읽는다
  p.add(`<path d="M14 19a9 9 0 0 1 9-9h74a9 9 0 0 1 9 9v6H14Z" fill="${header}"/>`);
  p.stroke('M19 12.6Q22 11.4 26 11.4H94', lit(header, 0.9), 1.6, 0.75);
  p.fill('M14 23.6H106V25H14Z', shade(header, 0.6), 0.85);

  // 놋쇠 못 둘
  for (const x of [21, 99]) {
    p.fill(ellipse(x, 33, 2.4, 2.4), shade('#C9A45C', 0.4));
    p.fill(ellipse(x - 0.6, 32.4, 1.3, 1.3), lit('#C9A45C', 0.8));
  }

  emblem(p, region, ink);
  return p.svg();
}

