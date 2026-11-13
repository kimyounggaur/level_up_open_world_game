// 음계 길 디딤돌 길(T1: S1 S2 S3)과 건반 늪 반음 계단(K4)의 돌 그림(설계서 4.3, 9.3, 12.10의 7-2, 7-3). 마을 H4의 돌(village.ts)과 같은 모양으로 바닥에 굽는다.
// 설치물 층(src/world/installations/layer.ts)은 구워 둔 돌 위에 이름·번호·표식만 올려 그리므로 돌 그림 자체가 바닥에 있어야 한다(4-1).
// 돌 자리는 설치물 파일(content/installations/inst.scale-trail.*.json, inst.key-marsh.chromatic-path.json)의 slots와 같아야 한다. 어긋나면 글자가 돌 밖에 뜨므로
// tests/unit/scale-trail-site.test.ts와 tests/unit/key-marsh-site.test.ts가 이 목록과 설치물 파일을 맞대어 본다. 순수 계산이다.
import { COLOR } from './palette';
import { circle, rect } from './shapes';
import { STONE_DOTS } from './village';

/** 돌 하나의 크기와 중심 간격(월드 px). H4의 시안 27×51, 간격 33의 3배와 같다(4.3) */
export const TRAIL_STONE = { w: 81, h: 153, pitch: 99 } as const;

export interface TrailStoneRow {
  installationId: string;
  stationCode: string;
  /** 이 줄에서 돌 번호가 가장 낮은 돌(줄의 첫 돌)의 왼쪽 위 모서리(월드 px) */
  x: number;
  y: number;
  /** 돌 개수. 같은 높이에서 TRAIL_STONE.pitch 간격으로 놓인다 */
  count: number;
  /** 줄의 첫 돌 번호. 없으면 1이다. 꺾은 계단(K4)의 둘째 줄은 8부터 시작한다 */
  slotStart?: number;
  /** 줄이 나아가는 방향. 없으면 왼쪽에서 오른쪽(1)이다. 꺾은 계단의 둘째 줄은 오른쪽에서 왼쪽(-1)으로 돌아온다 */
  dir?: 1 | -1;
  /** 돌 전체의 수(속 점 색이 전체에 걸쳐 풀빛에서 볕빛으로 변한다). 없으면 이 줄의 돌 개수다 */
  total?: number;
}

/** 음계 길의 돌 줄 셋. S1 S2는 서는 자리 오른쪽에서, S3는 박자 강 때문에 서는 자리 왼쪽에서 끝난다(D-209) */
export const TRAIL_STONE_ROWS: readonly TrailStoneRow[] = [
  { installationId: 'inst.scale-trail.major-path', stationCode: 'S1', x: 5550, y: 4724, count: 8 },
  { installationId: 'inst.scale-trail.minor-path', stationCode: 'S2', x: 6250, y: 5224, count: 8 },
  { installationId: 'inst.scale-trail.pentatonic-path', stationCode: 'S3', x: 6074, y: 4974, count: 6 },
  // 반음 계단(K4)은 13칸을 7개와 6개 두 줄로 꺾는다(4.3): 위 줄은 오른쪽으로 일곱 칸, 아래 줄은 일곱째 칸 바로 밑에서 왼쪽으로 여섯 칸 돌아온다
  { installationId: 'inst.key-marsh.chromatic-path', stationCode: 'K4', x: 900, y: 4560, count: 7, total: 13 },
  { installationId: 'inst.key-marsh.chromatic-path', stationCode: 'K4', x: 1494, y: 4743, count: 6, slotStart: 8, dir: -1, total: 13 },
];

/** 한 줄의 돌들 왼쪽 위 모서리. 돌 번호는 줄의 첫 돌(slotStart, 없으면 1)부터이고, 돌은 줄의 방향(dir)으로 한 간격씩 놓인다 */
export const trailStoneRects = (row: TrailStoneRow): Array<{ slot: number; x: number; y: number; w: number; h: number }> =>
  Array.from({ length: row.count }, (_, i) => ({ slot: (row.slotStart ?? 1) + i, x: row.x + TRAIL_STONE.pitch * i * (row.dir ?? 1), y: row.y, w: TRAIL_STONE.w, h: TRAIL_STONE.h }));

/** 돌 속 점의 색: 돌이 8개이면 H4와 같고, 더 적으면 풀빛에서 볕빛까지 고르게 건너뛴다 */
export const trailStoneDot = (index: number, count: number): string => STONE_DOTS[count <= 1 ? 0 : Math.round((index * (STONE_DOTS.length - 1)) / (count - 1))]!;

/** 음계 길의 돌 그림(월드 좌표). 길 위, 나무 그림자 아래에 굽는다 */
export function trailStonesSvg(): string {
  const parts: string[] = [];
  for (const row of TRAIL_STONE_ROWS) {
    trailStoneRects(row).forEach((s) => {
      // H4와 같은 모양: 시안의 모서리 4, 테두리 1, 점 반지름 5, 점의 높이(돌 위에서 27)의 3배. 점은 돌의 가로 가운데에 놓인다
      parts.push(rect(s.x, s.y, s.w, s.h, COLOR.stone, { rx: 12, stroke: COLOR.stoneEdge, 'stroke-width': 3 }), circle(s.x + s.w / 2, s.y + 81, 15, trailStoneDot(s.slot - 1, row.total ?? row.count)));
    });
  }
  return parts.join('');
}
