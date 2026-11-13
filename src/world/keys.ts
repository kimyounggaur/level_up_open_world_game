// 키보드 입력(설계서 7.2, 7.4, 7.5): 방향키·WASD로 걷고 E 또는 Enter로 상호작용한다. 순수 계산이라 단위 테스트한다.
// 글자 키가 아니라 물리 키(code)로 읽는다. 한글 자판에서도 W·A·S·D·E가 같은 자리 그대로 동작해야 한다.
import type { MoveInput } from './player';

export type KeyAction = 'left' | 'right' | 'up' | 'down' | 'interact';

export interface KeyLike {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

const BY_CODE: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyE: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
};

// code가 없는 합성 이벤트나 오래된 환경을 위한 대비
const BY_KEY: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
  ArrowUp: 'up',
  w: 'up',
  ArrowDown: 'down',
  s: 'down',
  e: 'interact',
  Enter: 'interact',
};

/** 키 이벤트가 월드의 어떤 동작인지. Ctrl, Alt, Meta와 함께 누른 것은 브라우저 단축키이므로 받지 않는다 */
export function actionOf(e: KeyLike): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code]!;
  if (!e.code && e.key) return BY_KEY[e.key.length === 1 ? e.key.toLowerCase() : e.key] ?? null;
  return null;
}

/** 눌린 키를 물리 키마다 따로 센다. 방향키 오른쪽과 D를 함께 누르다 D만 떼도 오른쪽은 계속 눌린 것이다 */
const idOf = (e: KeyLike): string | null => (e.code ? e.code : e.key ? `key:${e.key.length === 1 ? e.key.toLowerCase() : e.key}` : null);

/** 지금 눌려 있는 이동 키들. 반대쪽 키를 함께 누르면 서로 지운다 */
export class KeyTracker {
  private readonly held = new Map<string, Exclude<KeyAction, 'interact'>>();

  /** 키를 눌렀다. 이동 키면 기억하고, 상호작용 키는 처음 누른 순간에만 'interact'를 돌려준다(꾹 누르기는 한 번으로 센다) */
  down(e: KeyLike): KeyAction | null {
    const a = actionOf(e);
    if (!a) return null;
    if (a === 'interact') return e.repeat ? null : 'interact';
    const id = idOf(e);
    if (id) this.held.set(id, a);
    return a;
  }

  up(e: KeyLike): void {
    // 키를 누른 채 Ctrl 등을 눌러 actionOf가 null이어도 뗄 때는 지운다
    const id = idOf(e);
    if (id) this.held.delete(id);
  }

  /** 창이 포커스를 잃었거나 패널이 열릴 때 눌린 채로 남지 않게 한다 */
  clear(): void {
    this.held.clear();
  }

  get anyHeld(): boolean {
    return this.held.size > 0;
  }

  get input(): MoveInput {
    const acts = new Set(this.held.values());
    return { dx: (acts.has('right') ? 1 : 0) - (acts.has('left') ? 1 : 0), dy: (acts.has('down') ? 1 : 0) - (acts.has('up') ? 1 : 0) };
  }
}

/** 글을 입력하는 곳(입력칸, 선택 상자, 편집 가능한 영역)인가. 여기서 누른 키는 월드로 보내지 않는다(7.5) */
export function isTypingTarget(t: unknown): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/** Enter가 이미 그 요소의 동작(누르기)이 되는가. 버튼에 초점이 있을 때 Enter가 상호작용까지 겹쳐 일어나지 않게 한다 */
export function isActivatable(t: unknown): boolean {
  const el = t as { tagName?: string; getAttribute?: (n: string) => string | null } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || tag === 'a' || tag === 'summary') return true;
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  return role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab';
}
