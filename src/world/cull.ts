// 화면 밖 그림 건너뛰기(설계서 10.7 '프레임', 8-4).
// 등불·발견 표식·주민·놀이 악기의 바닥 같은 그래픽은 한 번 그려 두어도, Phaser는 프레임마다 그 도형을 다시 삼각형으로 나누어 그린다(카메라 밖에 있어도 그렇다).
// 이 월드는 그런 그래픽이 100여 개이고 도형이 4만 개 가까이라, 아무것도 하지 않아도 프레임마다 스크립트 시간이 20 ms 안팎 든다(측정은 docs/approvals.md 8-4).
// 그래서 화면(카메라가 보는 월드 사각형 + 여유)에 닿지 않는 것은 카메라 필터(cameraFilter)로 거른다: 그려지지 않을 뿐 장면에는 그대로 있다.
// 매 프레임 다시 그리는 설치물 층은 그래픽이 하나뿐이라, 화면 밖 설치물이 그리는 호출을 NO_DRAW가 받아 버린다(그린 기록과 글자 자리는 그대로 계산한다).
// 판정(맞고 틀림)과 소리는 이 파일과 상관이 없다: 그리는 일만 줄인다. 화면에 보이는 것은 끄지 않았을 때와 같아야 한다(tests/flow/cull.flow.ts가 화소로 비교한다).
import type Phaser from 'phaser';

/** 월드 좌표의 사각형(닿으면 겹친 것으로 본다) */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 화면 둘레에 더 얹는 여유(월드 px). 카메라는 이 프레임의 자세로 정확히 알고 있으므로(같은 프레임에 맞춘다) 움직임을 더 덮을 필요는 없고,
 * 그림의 겉 상자를 넉넉히 잡은 것을 마지막으로 한 번 더 받쳐 주는 값이다.
 */
export const CULL_MARGIN = 96;

/**
 * 발치가 (x, y)인 작은 표식(등불, 발견 표식, 게시판, 주민, 악사)이 그려지는 범위.
 * 가장 넓은 것이 게시판(가로 ±75, 위로 98)과 악기를 든 주민(가로 ±30, 위로 55 + 흔들림)이다. 넉넉하게 잡는다.
 */
export function footBox(x: number, y: number): Box {
  return { x0: x - 120, y0: y - 180, x1: x + 120, y1: y + 50 };
}

/** 두 사각형이 겹치는가(맞닿으면 겹친 것으로 본다) */
export function overlaps(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/** 사각형을 사방으로 넓힌다 */
export function grow(b: Box, by: number): Box {
  return { x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by };
}

/** 카메라가 보는 월드 사각형 */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Entry {
  obj: Phaser.GameObjects.GameObject;
  box: Box;
  hidden: boolean;
}

export interface CullStats {
  /** 걸러 내기를 켰는가 */
  enabled: boolean;
  /** 맡은 그래픽 수 */
  tracked: number;
  /** 지금 화면 밖이라 거른 그래픽 수 */
  hidden: number;
}

export class ViewCull {
  /** 점검용: false이면 아무것도 거르지 않는다(걸러 낸 화면과 화소를 견줄 때 쓴다) */
  enabled = true;
  private view: Box = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
  private readonly entries: Entry[] = [];

  constructor(private readonly camera: Phaser.Cameras.Scene2D.Camera) {}

  /** 한 번 그려 두는 그래픽을 맡긴다. box는 그 그래픽이 그려지는 월드 범위다 */
  track(obj: Phaser.GameObjects.GameObject, box: Box): void {
    this.entries.push({ obj, box, hidden: false });
  }

  /** 맡긴 그래픽이 없어질 때(층을 걷을 때) 부른다. 거른 채로 두지 않고 되돌린다 */
  untrack(obj: Phaser.GameObjects.GameObject): void {
    const i = this.entries.findIndex((e) => e.obj === obj);
    if (i < 0) return;
    const [e] = this.entries.splice(i, 1);
    if (e && e.hidden) this.show(e.obj);
  }

  /** 매 프레임 한 번, 카메라 자세를 정한 다음에 부른다 */
  update(view: ViewBox): void {
    this.view = grow({ x0: view.x, y0: view.y, x1: view.x + view.w, y1: view.y + view.h }, CULL_MARGIN);
    for (const e of this.entries) {
      const hide = this.enabled && !overlaps(e.box, this.view);
      if (hide === e.hidden) continue;
      e.hidden = hide;
      if (hide) this.hide(e.obj);
      else this.show(e.obj);
    }
  }

  /** 이 범위가 화면에 닿는가. 꺼 두었으면 늘 그렇다 */
  sees(box: Box): boolean {
    return !this.enabled || overlaps(box, this.view);
  }

  stats(): CullStats {
    let hidden = 0;
    for (const e of this.entries) if (e.hidden) hidden += 1;
    return { enabled: this.enabled, tracked: this.entries.length, hidden };
  }

  private hide(obj: Phaser.GameObjects.GameObject): void {
    obj.cameraFilter |= this.camera.id;
  }

  private show(obj: Phaser.GameObjects.GameObject): void {
    obj.cameraFilter &= ~this.camera.id;
  }
}

/**
 * 아무것도 그리지 않는 그래픽. 화면 밖 설치물이 부르는 그리기 호출(fillStyle, fillRoundedRect, lineBetween …)을 모두 받아서 버린다.
 * 어떤 메서드든 자기 자신을 돌려주므로 `g.fillStyle(...).fillRect(...)`처럼 이어 불러도 된다.
 */
export const NO_DRAW: Phaser.GameObjects.Graphics = (() => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => (prop === 'then' ? undefined : () => sink),
  };
  const sink: object = new Proxy({}, handler);
  return sink as Phaser.GameObjects.Graphics;
})();
