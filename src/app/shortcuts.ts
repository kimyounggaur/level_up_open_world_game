// 전역 단축키(설계서 7.5): Esc는 열린 화면을 닫고, M은 지도, L은 목록, N은 수첩을 연다(다시 누르면 닫는다).
// 글을 입력하는 중이거나 한글 조합 중이면 가로채지 않는다. 글자 키가 아니라 물리 키(code)로 읽어 한글 자판에서도 같은 자리 그대로 동작한다.
import { overlayHash } from '../platform/router';
import type { OverlayPage, Route } from '../platform/router';
import { isTypingTarget } from '../world/keys';

export interface ShortcutEvent {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** 한글 같은 조합 입력 중인가 */
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
}

export type ShortcutAction = { type: 'close' } | { type: 'go'; hash: string };

const OVERLAY_KEYS: Readonly<Record<string, OverlayPage>> = { KeyM: 'map', KeyL: 'list', KeyN: 'notebook' };
const OVERLAY_KEYS_BY_KEY: Readonly<Record<string, OverlayPage>> = { m: 'map', l: 'list', n: 'notebook' };

/** 키 이벤트가 앱 화면 이동이면 무엇인지. 아니면 null(월드나 패널이 그대로 받는다) */
export function resolveShortcut(e: ShortcutEvent, route: Route): ShortcutAction | null {
  if (e.defaultPrevented || e.isComposing) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  const isEscape = e.code ? e.code === 'Escape' : e.key === 'Escape';
  if (isEscape) return route.kind === 'home' ? null : { type: 'close' };

  // 지도, 목록, 수첩은 탐험 화면과 겹침 화면에서만 단축키로 연다. 패널 안에서는 글자 키를 가로채지 않는다
  if (route.kind !== 'home' && route.kind !== 'overlay' && route.kind !== 'station') return null;
  if (e.repeat || isTypingTarget(e.target)) return null;
  const page = e.code ? OVERLAY_KEYS[e.code] : e.key ? OVERLAY_KEYS_BY_KEY[e.key.toLowerCase()] : undefined;
  if (!page) return null;
  if (route.kind === 'overlay' && route.page === page) return { type: 'close' };
  return { type: 'go', hash: overlayHash(page) };
}
