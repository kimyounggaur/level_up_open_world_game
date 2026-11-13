// 4.2 키보드 표: 설치물 모드와 음계 패널이 같은 키를 쓴다. 순수 계산이라 단위 테스트한다.
// 글자 키가 아니라 물리 키(code)로 읽는다. 한글 자판에서도 Z·Y·P·T·S·C·V·H가 같은 자리 그대로 동작해야 한다.
// 설계서 4.2의 표에 이 구현이 더한 것은 하나다: Shift+↑ ↓ 로 변화표(♭ 없음 ♯)를 바꾼다(재료 = 음이름 + 변화표 + 옥타브, 4.3).

export type BenchAction =
  | 'cursor-left'
  | 'cursor-right'
  | 'hand-up'
  | 'hand-down'
  | 'accidental-up'
  | 'accidental-down'
  | 'place'
  | 'remove'
  | 'undo'
  | 'redo'
  | 'hear-mine'
  | 'hear-target'
  | 'stop'
  | 'check'
  | 'view-panel'
  | 'help'
  | 'exit';

export interface BenchKey {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const BY_CODE: Readonly<Record<string, BenchAction>> = {
  ArrowLeft: 'cursor-left',
  ArrowRight: 'cursor-right',
  Enter: 'place',
  NumpadEnter: 'place',
  Space: 'place',
  Backspace: 'remove',
  Delete: 'remove',
  KeyZ: 'undo',
  KeyY: 'redo',
  KeyP: 'hear-mine',
  KeyT: 'hear-target',
  KeyS: 'stop',
  KeyC: 'check',
  KeyV: 'view-panel',
  KeyH: 'help',
  Escape: 'exit',
};

// code가 없는 합성 이벤트나 오래된 환경을 위한 대비
const BY_KEY: Readonly<Record<string, BenchAction>> = {
  ArrowLeft: 'cursor-left',
  ArrowRight: 'cursor-right',
  Enter: 'place',
  ' ': 'place',
  Backspace: 'remove',
  Delete: 'remove',
  z: 'undo',
  y: 'redo',
  p: 'hear-mine',
  t: 'hear-target',
  s: 'stop',
  c: 'check',
  v: 'view-panel',
  h: 'help',
  Escape: 'exit',
};

/**
 * 키 이벤트가 놓기 작업대의 어떤 동작인지. 못 알아보면 null.
 * - Alt와 함께 누른 것은 받지 않는다. Ctrl·Meta와 함께 누른 것은 실행 취소(Ctrl+Z), 다시 실행(Ctrl+Y, Ctrl+Shift+Z)만 받는다.
 * - ↑ ↓ 는 손에 든 음을 올리고 내린다. Shift와 함께면 변화표를 바꾼다.
 */
export function benchActionOf(e: BenchKey): BenchAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  const code = e.code;
  const key = e.key;
  if (code === 'ArrowUp' || (!code && key === 'ArrowUp')) return mod ? null : e.shiftKey ? 'accidental-up' : 'hand-up';
  if (code === 'ArrowDown' || (!code && key === 'ArrowDown')) return mod ? null : e.shiftKey ? 'accidental-down' : 'hand-down';
  const base = code ? BY_CODE[code] : key ? BY_KEY[key.length === 1 ? key.toLowerCase() : key] : undefined;
  if (!base) return null;
  if (mod) {
    // 브라우저 단축키(Ctrl+S 저장, Ctrl+P 인쇄, Ctrl+C 복사, Ctrl+H 기록 …)는 건드리지 않는다
    if (base === 'undo') return e.shiftKey ? 'redo' : 'undo';
    if (base === 'redo') return 'redo';
    return null;
  }
  // Shift+Z는 다시 실행으로도 읽는다(리듬 패널의 단축키와 같다)
  if (base === 'undo' && e.shiftKey) return 'redo';
  // 글자 키는 물리 키로 읽으므로 Caps Lock이나 한글 입력 상태에서도 같은 동작이다
  return base;
}

/** 도움 카드(H)에 보이는 키 표. 설계서 4.2의 표와 같다 */
export const BENCH_KEY_TABLE: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: '← →', label: '자리 옮기기' },
  { keys: '↑ ↓', label: '높이나 재료 바꾸기' },
  { keys: 'Shift+↑ ↓', label: '변화표 바꾸기(♭ 없음 ♯)' },
  { keys: 'Enter, Space', label: '놓기' },
  { keys: 'Backspace', label: '빼기' },
  { keys: 'Z, Y', label: '실행 취소, 다시 실행' },
  { keys: 'P', label: '내 배치 듣기' },
  { keys: 'T', label: '목표 듣기' },
  { keys: 'S', label: '정지' },
  { keys: 'C', label: '배치 확인' },
  { keys: 'V', label: '패널로 보기' },
  { keys: 'H', label: '도움' },
  { keys: 'Esc', label: '나가기' },
];

/** 글자를 입력하는 칸에서 누른 키는 작업대가 가로채지 않는다 */
export function isTypingElement(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el !== 'object') return false;
  const tag = (el.tagName ?? '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** 눌러서 쓰는 단추나 링크에 초점이 있을 때 Enter·Space는 그 단추의 누르기다. 작업대의 '놓기'가 겹쳐 일어나지 않게 한다 */
export function isActivatableElement(target: unknown): boolean {
  const el = target as { tagName?: string; getAttribute?: (name: string) => string | null } | null;
  if (!el || typeof el !== 'object') return false;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
  const role = el.getAttribute?.('role');
  return role === 'button' || role === 'link' || role === 'menuitem' || role === 'checkbox' || role === 'switch' || role === 'radio' || role === 'tab';
}
