// 6-6 물레방아(T3, 설계서 4.5)의 순수 계산: 바퀴 위의 각도, 틱, 칸을 서로 바꾼다.
// 바퀴는 징검다리 줄(펼친 띠)과 같은 초안을 다른 모양으로 보여 줄 뿐이다: 한 바퀴가 한 마디(2880틱)이고
// 칸(구멍)은 12시에서 시계 방향으로 같은 각도씩 이어진다. 화면은 이 계산의 결과를 그리기만 한다(W-3).
import { slotBounds } from './installation';
import type { InstallationDef, SlotMapDef, WorldRect } from './installation';
import type { CursorMark } from './timelineStones';

/** 바퀴의 안쪽 구역들을 반지름에 대한 비율로 나눈다: 가운데 허브 → 칸 번호 → 못이 놓이는 고리 → 테두리 */
export const WHEEL_ZONES = {
  /** 가운데 허브: 이 안쪽을 눌러도 칸이 아니다 */
  hub: 0.27,
  /** 못이 놓이는 고리의 안쪽 */
  ringIn: 0.52,
  /** 못이 놓이는 고리의 바깥쪽 */
  ringOut: 0.88,
  /** 테두리(큰 박의 띠 무늬와 큰 박 번호가 놓인다)의 안쪽 */
  rimIn: 0.92,
} as const;

export interface WheelGeometry {
  cx: number;
  cy: number;
  /** 바퀴 반지름(월드 px). 지름 480 px다 */
  r: number;
  /** 칸(못 구멍)의 수. 6 */
  cells: number;
  /** 한 칸의 각도(도). 60 */
  cellDeg: number;
  /** 한 칸의 틱 */
  cellTicks: number;
  /** 한 바퀴의 틱(칸 수 × 칸). 한 마디다 */
  turnTicks: number;
  hubR: number;
  ringIn: number;
  ringOut: number;
  rimIn: number;
}

type WheelHost = Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef };

/** 설치물의 바퀴. 물레방아가 아니면(바퀴가 없으면) null */
export function wheelOf(inst: WheelHost): WheelGeometry | null {
  const map = inst.slotMap;
  if (map?.kind !== 'timelineStones' || !map.wheel) return null;
  const cells = inst.slots.length;
  if (cells < 2) return null;
  const { cx, cy, r } = map.wheel;
  return {
    cx,
    cy,
    r,
    cells,
    cellDeg: 360 / cells,
    cellTicks: map.cellTicks,
    turnTicks: cells * map.cellTicks,
    hubR: r * WHEEL_ZONES.hub,
    ringIn: r * WHEEL_ZONES.ringIn,
    ringOut: r * WHEEL_ZONES.ringOut,
    rimIn: r * WHEEL_ZONES.rimIn,
  };
}

export const isWheel = (inst: WheelHost): boolean => wheelOf(inst) !== null;

/** 마디 처음부터 센 틱이 바퀴의 몇 도인가(12시에서 시계 방향) */
export const tickToDeg = (w: Pick<WheelGeometry, 'turnTicks'>, tick: number): number => (tick / w.turnTicks) * 360;

/** 바퀴 위의 한 점(월드 px). deg는 12시에서 시계 방향, radius는 중심에서의 거리 */
export function wheelPoint(w: Pick<WheelGeometry, 'cx' | 'cy'>, deg: number, radius: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: w.cx + radius * Math.sin(rad), y: w.cy - radius * Math.cos(rad) };
}

/**
 * 듣는 중 바퀴가 돈 각도(도). 한 바퀴가 한 마디라서 재생 위치(틱)에 비례한다. 듣지 않으면 0이다.
 * 바퀴는 반시계 방향으로 돌아, 12시에 선 방망이 아래로 칸이 차례로 온다(그려지는 쪽에서 이 각도를 빼서 쓴다).
 */
export function wheelTurnDeg(w: Pick<WheelGeometry, 'turnTicks'>, playTick: number | null): number {
  return playTick === null ? 0 : tickToDeg(w, Math.min(Math.max(0, playTick), w.turnTicks));
}

/**
 * 월드의 한 점이 바퀴의 몇 번째 칸인가(1부터). 허브 안쪽이거나 바퀴 밖이면 null.
 * turnDeg는 듣는 중 바퀴가 돈 각도다: 돌아간 만큼 되돌려서 칸을 찾는다(칸의 자리는 바퀴와 함께 돈다).
 */
export function wheelSlotAt(w: WheelGeometry, x: number, y: number, turnDeg = 0): number | null {
  const dx = x - w.cx;
  const dy = y - w.cy;
  const d = Math.hypot(dx, dy);
  if (d < w.hubR || d > w.r) return null;
  // 12시에서 시계 방향의 각도: atan2(dx, -dy)
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI + turnDeg;
  deg = ((deg % 360) + 360) % 360;
  return Math.min(w.cells, Math.floor(deg / w.cellDeg) + 1);
}

/** 큰 박 하나가 바퀴에서 차지하는 구간(띠 무늬가 칠해지는 자리) */
export interface WheelBeat {
  /** 1부터 센 큰 박 번호 */
  beat: number;
  fromTick: number;
  toTick: number;
  fromDeg: number;
  toDeg: number;
  /** 큰 박마다 번갈아 다른 무늬: 첫째 줄무늬, 둘째 점무늬, 셋째 줄무늬… (색만으로 구분하지 않는다) */
  pattern: 'stripes' | 'dots';
}

/** 한 마디를 박(6/8이면 큰 박 둘)으로 나눈 바퀴의 구간들 */
export function wheelBeats(w: Pick<WheelGeometry, 'turnTicks'>, beatTicks: number, measureTicks: number = w.turnTicks): WheelBeat[] {
  const out: WheelBeat[] = [];
  const unit = Math.max(1, beatTicks);
  const used = Math.min(Math.max(0, measureTicks), w.turnTicks);
  for (let from = 0, i = 0; from < used; from += unit, i++) {
    const to = Math.min(from + unit, used);
    out.push({ beat: i + 1, fromTick: from, toTick: to, fromDeg: tickToDeg(w, from), toDeg: tickToDeg(w, to), pattern: i % 2 === 0 ? 'stripes' : 'dots' });
  }
  return out;
}

/**
 * 편집 중 카메라가 비추려는 것: 바퀴와 띠 전체(rect)와, 전체가 화면에 다 들어오지 않을 때 보여 줄 고른 칸의 자리.
 * focus는 바퀴에서 고른 칸의 가운데이고, alsoShow는 띠의 같은 칸 가운데다(고른 칸이 없으면 없다).
 */
export interface WheelFollow {
  rect: WorldRect;
  focus: { x: number; y: number };
  alsoShow?: { x: number; y: number };
}

/**
 * 물레방아를 담는 카메라의 목표(설계서 7.3). 바퀴와 띠 전체가 메뉴 띠 아래, 조작 막대 위에 들어오면 전체를 비추고,
 * 칸이 화면에서 48 px 아래로 줄 만큼 좁은 화면이면 줄이지 않고 고른 칸을 따라간다.
 * 고른 칸은 바퀴의 칸 가운데(focus)가 먼저이고, 띠의 같은 칸 가운데(alsoShow)는 둘이 함께 보이는 크기에 들 때만 함께 비춘다
 * (followPose가 정한다): 바퀴를 눌러 골랐든 띠를 눌러 골랐든 같은 칸이 어디서나 보이게 하되, 눌러야 하는 칸이 하나라도 온전히 보이는 것이 먼저다.
 * 고른 칸이 아직 없으면 바퀴의 가운데다. 듣는 중에도 카메라는 고른 칸에 머문다(12시의 방망이는 움직이지 않고 바퀴가 돈다).
 * 물레방아가 아니면 null이다. 모습(cursor)은 화면이 정해 다리에 올린 것이고, 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3).
 */
export function wheelFollowOf(inst: WheelHost, tl?: { cursor: Pick<CursorMark, 'startTick' | 'at'> | null }): WheelFollow | null {
  const w = wheelOf(inst);
  if (!w) return null;
  const rect = slotBounds(inst);
  const at = tl?.cursor ? (tl.cursor.at ?? tl.cursor.startTick) : null;
  if (at === null || at === undefined) return { rect, focus: { x: w.cx, y: w.cy } };
  const k = Math.min(Math.max(0, Math.floor(at / w.cellTicks)), w.cells - 1);
  const onWheel = wheelPoint(w, tickToDeg(w, k * w.cellTicks + w.cellTicks / 2), (w.ringIn + w.ringOut) / 2);
  const cell = inst.slots[k]!;
  return { rect, focus: onWheel, alsoShow: { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 } };
}
