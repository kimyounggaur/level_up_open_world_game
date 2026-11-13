// 월드 그림 층 시험이 함께 쓰는 가짜 장면. 제품 코드가 아니다.
// Phaser 없이 그리기 호출을 기록만 하는 가짜 Graphics와, 자리·보임·크기·내용·색만 기억하는 가짜 글자를 준다.
// 실제 화면의 모습은 브라우저 흐름 시험이 본다.
import { ViewCull } from '@/world/cull';

/** 화면 밖 그림 건너뛰기(world/cull.ts)의 가짜 카메라판. 아직 화면을 알려 주지 않았으므로 모든 것이 보이는 것으로 친다 */
export function fakeCull(): ViewCull {
  return new ViewCull({ id: 1 } as never);
}

/** 그리기 호출은 이름과 인자를 기록하고 자기 자신을 돌려 주는 가짜 Graphics */
export class FakeGraphics {
  depth = 0;
  /** 카메라 필터(1은 월드 카메라): 화면 밖이라 거르면 이 비트가 켜진다 */
  cameraFilter = 0;
  destroyed = false;
  log: Array<{ name: string; args: unknown[] }> = [];
  constructor() {
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        return (...args: unknown[]) => {
          target.log.push({ name: String(prop), args });
          return receiver;
        };
      },
    });
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
  count(name: string): number {
    return this.log.filter((c) => c.name === name).length;
  }
  calls(name: string): unknown[][] {
    return this.log.filter((c) => c.name === name).map((c) => c.args);
  }
  reset(): void {
    this.log = [];
  }
}

/** 가짜 글자. 폭은 글자 수에 비례한다(줄여 넣는지 보려고) */
export class FakeText {
  x = 0;
  y = 0;
  visible = true;
  scaleValue = 1;
  alpha = 1;
  color = '';
  depth = 0;
  destroyed = false;
  constructor(
    public content: string,
    color = '',
  ) {
    this.color = color;
  }
  /** Phaser 글자 개체의 text와 같은 이름(내용을 읽는 쪽이 쓴다) */
  get text(): string {
    return this.content;
  }
  get width(): number {
    return this.content.length * 14;
  }
  setOrigin(): this {
    return this;
  }
  setResolution(): this {
    return this;
  }
  setColor(c: string): this {
    this.color = c;
    return this;
  }
  setAlpha(a: number): this {
    this.alpha = a;
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
  setText(c: string): this {
    this.content = c;
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setScale(s: number): this {
    this.scaleValue = s;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeScene {
  graphics: FakeGraphics[] = [];
  texts: FakeText[] = [];
  add = {
    graphics: (): FakeGraphics => {
      const g = new FakeGraphics();
      this.graphics.push(g);
      return g;
    },
    text: (_x: number, _y: number, content: string, style?: { color?: string }): FakeText => {
      const t = new FakeText(content, style?.color ?? '');
      this.texts.push(t);
      return t;
    },
  };
  /** 지금 보이는 글자의 내용(만든 순서) */
  shown(): string[] {
    return this.texts.filter((t) => t.visible && !t.destroyed).map((t) => t.content);
  }
  /** 지금 보이는 글자 */
  visibleTexts(): FakeText[] {
    return this.texts.filter((t) => t.visible && !t.destroyed);
  }
}
