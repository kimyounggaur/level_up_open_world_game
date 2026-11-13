// 7-1 계단밭(T5) 작업대의 키 표. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 계단밭에 필요한 것만 더한다.
// - ← →: 열(세로줄)을 옮긴다. ↑ ↓: 고른 열의 등을 온음계 한 칸씩 올리고 내린다. 등이 아직 없는 열에서는 가운데 줄에 등이 놓인다.
// - PageUp·PageDown: 등을 한 옥타브(일곱 칸) 올리고 내린다. 덧줄이 있는 높이까지 한 칸씩 가려면 멀어서 건너뛰는 길을 둔다. 앱 전체의 단축키(M 지도, L 목록, N 수첩)와 겹치지 않는다(7.5).
// - Shift+↑ ↓: 변화표 꼬리표(♭ 없음 ♯). 변화표를 쓰는 과제와 자유로 놀기에서만 듣는다.
// 글자 키는 물리 키(code)로 읽으므로 한글 자판에서도 같은 자리의 키가 같은 동작이다.
import { benchActionOf } from './benchKeys';
import type { BenchKey } from './benchKeys';

export type TerraceAction =
  | 'cursor-left'
  | 'cursor-right'
  | 'step-up'
  | 'step-down'
  | 'octave-up'
  | 'octave-down'
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

const isKey = (e: BenchKey, code: string): boolean => e.code === code || (!e.code && e.key === code);

/** 키 이벤트가 계단밭 작업대의 어떤 동작인지. 못 알아보면 null (Alt와 함께 누른 것, Ctrl·Meta와 함께 누른 것은 실행 취소·다시 실행만 받는다) */
export function terraceActionOf(e: BenchKey): TerraceAction | null {
  if (e.altKey) return null;
  const base = benchActionOf(e);
  if (base === 'hand-up') return 'step-up';
  if (base === 'hand-down') return 'step-down';
  if (base) return base;
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (isKey(e, 'PageUp')) return 'octave-up';
  if (isKey(e, 'PageDown')) return 'octave-down';
  return null;
}

/** 한 옥타브는 온음계 일곱 칸이다 */
export const OCTAVE_STEPS = 7;

/** 도움 카드(H)에 보이는 키 표. 설계서 4.2의 표에 계단밭의 높이 키를 더한 것이다. 변화표 키는 변화표를 쓸 때만 보인다 */
export function terraceKeyTableOf(accidentals: boolean): ReadonlyArray<{ keys: string; label: string }> {
  return [
    { keys: '← →', label: '열 옮기기' },
    { keys: '↑ ↓', label: '등을 한 칸 올리고 내리기' },
    { keys: 'PageUp PageDown', label: '등을 한 옥타브(일곱 칸) 올리고 내리기' },
    ...(accidentals ? [{ keys: 'Shift+↑ ↓', label: '변화표 바꾸기(♭ 없음 ♯)' }] : []),
    { keys: 'Enter, Space', label: '등 놓기, 놓은 등 울려 보기' },
    { keys: 'Backspace', label: '등 빼기' },
    { keys: 'Z, Y', label: '실행 취소, 다시 실행' },
    { keys: 'P', label: '내 등 듣기' },
    { keys: 'T', label: '목표 듣기' },
    { keys: 'S', label: '정지' },
    { keys: 'C', label: '배치 확인' },
    { keys: 'V', label: '패널로 보기' },
    { keys: 'H', label: '도움' },
    { keys: 'Esc', label: '나가기' },
  ];
}
