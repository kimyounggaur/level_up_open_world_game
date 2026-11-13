// 사물(설계서 3-5, 6-3, 10.5): 나무, 표지판, 물레방아 같은 소품처럼 발 위치의 y값 순서로 겹쳐 그리는 그림.
// 순수 데이터와 계산만 둔다. 그림을 올리는 일은 WorldScene이 한다.

export type WorldObjectKind = 'tree' | 'sign' | 'prop';

export interface WorldObjectData {
  id: string;
  kind: WorldObjectKind;
  /** 사물 그림 이름(world-src/sprites/의 SVG 파일 이름). 그림은 한 장(아틀라스)으로 묶여 있고, 틀 이름은 이 이름에서 .svg를 뗀 것이다 */
  file: string;
  /** 놓는 위치(월드 px). 그림의 (ax, ay) 비율 지점이 이 점에 온다 */
  x: number;
  y: number;
  ax: number;
  ay: number;
  /** 화면에 그릴 크기(월드 px). 파일은 2배로 구워 불러온다(9.3) */
  w: number;
  h: number;
  /** 겹침 순서가 되는 발 위치의 y. 값이 클수록(남쪽일수록) 앞에 그려진다 */
  sortY: number;
  /** 정거장을 가리키는 사물(표지판 따위)이면 그 정거장 id */
  stationId?: string;
}

/** 사물 그림은 2배 크기로 구워 선명하게 한다(9.3) */
export const OBJECT_BAKE_SCALE = 2;

/** 캐릭터를 그릴 순서값. 발 위치의 y를 그대로 쓴다 */
export const depthOfFoot = (footY: number): number => footY;

/** 사물이 캐릭터를 가리는가. 캐릭터의 발이 사물의 정렬 y보다 북쪽(작음)이면 사물이 앞에 그려져 가린다 */
export const hidesPlayer = (obj: Pick<WorldObjectData, 'sortY'>, playerFootY: number): boolean => depthOfFoot(playerFootY) < obj.sortY;
