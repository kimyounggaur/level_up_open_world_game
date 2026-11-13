// 무대 바닥에서 쓰지 않는 칸에 긋는 사선 무늬(4.9)와, 소리를 끈 종의 점선 테두리(6-7c). 그리는 것(Phaser)과 떨어진 순수 계산이라 단위 시험한다.

/** 직사각형 안에 간격 step의 / 방향 선을 긋는다. 선마다 [x0, y0, x1, y1]이고 모두 직사각형 안에 있다 */
export function hatchSegments(x: number, y: number, w: number, h: number, step: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  if (w <= 0 || h <= 0 || step <= 0) return out;
  for (let c = x + y + step; c < x + y + w + h; c += step) {
    // x' + y' = c 인 선을 직사각형 안으로 자른다
    const xa = Math.max(x, c - (y + h));
    const xb = Math.min(x + w, c - y);
    if (xa < xb) out.push([xa, c - xa, xb, c - xb]);
  }
  return out;
}

/** 선분 하나를 길이 dash의 선과 길이 gap의 틈으로 번갈아 끊어 점선으로 만든다. 선마다 [x0, y0, x1, y1]이고 모두 선분 위에 있다 */
export function dashSegments(x0: number, y0: number, x1: number, y1: number, dash: number, gap: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len <= 0 || dash <= 0) return out;
  const step = dash + Math.max(0, gap);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let t = 0; t < len; t += step) {
    const e = Math.min(t + dash, len);
    out.push([x0 + ux * t, y0 + uy * t, x0 + ux * e, y0 + uy * e]);
  }
  return out;
}

/** 직사각형의 네 변을 점선으로(위, 오른쪽, 아래, 왼쪽 차례) */
export function dashedRectSegments(x: number, y: number, w: number, h: number, dash: number, gap: number): Array<[number, number, number, number]> {
  if (w <= 0 || h <= 0) return [];
  return [...dashSegments(x, y, x + w, y, dash, gap), ...dashSegments(x + w, y, x + w, y + h, dash, gap), ...dashSegments(x + w, y + h, x, y + h, dash, gap), ...dashSegments(x, y + h, x, y, dash, gap)];
}
