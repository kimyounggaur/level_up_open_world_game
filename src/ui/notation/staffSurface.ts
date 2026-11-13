// 2-6 오선에 놓기: 눌린 화면 위치를 보표 위치로 바꾸는 도형 계산.
// 보표의 줄 사이 간격과 맨 아랫줄의 y는 VexFlow가 그린 도형(RenderedStave)에서 읽는다.
// 눌린 곳의 화면 좌표는 여기서 보표 위치(정수)로 바뀌고, 그 뒤로는 화면 좌표가 판정에 쓰이지 않는다(W-3).
import type { RenderedStave } from './render';

/** 눌러서 놓을 수 있는 가장 낮은 위치와 가장 높은 위치: 덧줄 셋(아래 −6, 위 +14)까지 */
export const SURFACE_MIN_POSITION = -6;
export const SURFACE_MAX_POSITION = 14;
/** 처음 키보드로 놓을 때 시작하는 위치: 가운데 줄 */
export const SURFACE_START_POSITION = 4;

export const clampPosition = (position: number, min = SURFACE_MIN_POSITION, max = SURFACE_MAX_POSITION): number => Math.min(max, Math.max(min, position));

/** 보표 위치 → 그림 안의 y. 위치 0은 맨 아랫줄, 한 칸은 줄 간격의 절반 */
export function yOfPosition(stave: Pick<RenderedStave, 'bottomLineY' | 'spacing'>, position: number): number {
  return stave.bottomLineY - position * (stave.spacing / 2);
}

/** 그림 안의 y → 가장 가까운 보표 위치(범위 안으로 맞춘다) */
export function positionOfY(stave: Pick<RenderedStave, 'bottomLineY' | 'spacing'>, y: number, min = SURFACE_MIN_POSITION, max = SURFACE_MAX_POSITION): number {
  return clampPosition(Math.round((stave.bottomLineY - y) / (stave.spacing / 2)), min, max);
}

/** 화면의 y(client)를 SVG 그림의 y로 바꾼다. 그림은 화면 폭에 맞춰 줄어들거나 늘어날 수 있고, 보이는 범위(viewBox)가 위에서 잘려 있을 수도 있다 */
export function clientYToSvgY(svg: SVGSVGElement, clientY: number): number {
  const rect = svg.getBoundingClientRect();
  const box = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const valid = box.length === 4 && box.every((n) => Number.isFinite(n));
  const viewHeight = valid ? box[3]! : rect.height;
  const minY = valid ? box[1]! : 0;
  if (rect.height <= 0) return minY;
  return minY + (clientY - rect.top) * (viewHeight / rect.height);
}

/**
 * 눌러서 놓을 수 있는 범위(덧줄 셋까지)만 보이도록 그림의 세로 범위를 줄인다.
 * 한 보표만 그리는 화면이 쓸데없이 길어지지 않게 한다. 보표의 도형 값(bottomLineY, spacing)은 그대로다.
 */
export function cropToPlacementRange(svg: SVGSVGElement, stave: Pick<RenderedStave, 'bottomLineY' | 'spacing'>, padding = 14): void {
  const box = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const width = box.length === 4 && Number.isFinite(box[2]) ? box[2]! : Number(svg.getAttribute('width')) || 0;
  const top = yOfPosition(stave, SURFACE_MAX_POSITION) - padding;
  const height = yOfPosition(stave, SURFACE_MIN_POSITION) + padding - top;
  svg.setAttribute('viewBox', `0 ${top} ${width} ${height}`);
  svg.setAttribute('height', String(height));
}

/** 덧줄 위치들(보표 밖의 줄): 아래 −2, −4, −6, 위 10, 12, 14 */
export const LEDGER_POSITIONS: readonly number[] = [-2, -4, -6, 10, 12, 14];

const SVG_NS = 'http://www.w3.org/2000/svg';

/** '덧줄 보기' 도움: 덧줄이 놓일 자리에 점선 안내선을 그린다. 이미 있던 안내선은 지운다 */
export function drawLedgerGuides(svg: SVGSVGElement, stave: RenderedStave, on: boolean): number {
  svg.querySelectorAll('.ledger-guide').forEach((el) => el.remove());
  if (!on) return 0;
  const x1 = stave.x + 18;
  const x2 = stave.x + stave.width - 18;
  for (const position of LEDGER_POSITIONS) {
    const y = yOfPosition(stave, position);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'ledger-guide');
    line.setAttribute('x1', String(x1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    svg.appendChild(line);
  }
  return LEDGER_POSITIONS.length;
}
