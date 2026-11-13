// 6-7 종나무(T4) 작업대의 키 표. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 종나무에 필요한 것만 더한다.
// - ← →: 종 자리(열)를 옮긴다. ↑ ↓: 고른 종의 높이(가지 한 단, 옥타브)를 바꾼다. 종이 아직 없는 자리에서는 종을 걸 가지를 옮긴다.
// - PageUp·PageDown: 손에 든 종의 음이름(도 레 미 파 솔 라 시), Shift+↑ ↓: 변화표(♭ 없음 ♯). 앱 전체의 단축키(M 지도, L 목록, N 수첩)와 겹치지 않는다(7.5).
// - Shift+← →: 종탑에서는 고른 종을 옆 자리와 맞바꾼다(가로 순서만 바뀐다), 빈터에서는 나무를 건너뛴다. 나무 하나짜리에서는 쓰지 않는다.
// - X: 종탑의 종 소리를 끄고 켠다(끈 종은 ✕ 표시). R: 듣는 방식(함께, 아래부터 차례로, 가장 낮은 종만)을 바꾼다. Shift+P: 빈터에서 고른 나무의 화음만 듣는다.
// 글자 키는 물리 키(code)로 읽으므로 한글 자판에서도 같은 자리의 키가 같은 동작이다.
import type { BellMap } from '../../domain/bells';
import { benchActionOf } from './benchKeys';
import type { BenchKey } from './benchKeys';

export type BellForm = BellMap['form'];

export type BellAction =
  | 'cursor-left'
  | 'cursor-right'
  | 'ring-up'
  | 'ring-down'
  | 'letter-next'
  | 'letter-prev'
  | 'accidental-up'
  | 'accidental-down'
  | 'tree-prev'
  | 'tree-next'
  | 'swap-left'
  | 'swap-right'
  | 'mute'
  | 'mode-next'
  | 'place'
  | 'remove'
  | 'undo'
  | 'redo'
  | 'hear-mine'
  | 'hear-tree'
  | 'hear-target'
  | 'stop'
  | 'check'
  | 'view-panel'
  | 'help'
  | 'exit';

const isKey = (e: BenchKey, code: string, key: string): boolean => e.code === code || (!e.code && (e.key === key || e.key?.toLowerCase() === key.toLowerCase()));

/** 키 이벤트가 종나무 작업대의 어떤 동작인지. 못 알아보면 null (Alt와 함께 누른 것, Ctrl·Meta와 함께 누른 것은 실행 취소·다시 실행만 받는다) */
export function bellActionOf(e: BenchKey, form: BellForm): BellAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  // Shift+← →: 종탑은 가로 자리 맞바꾸기, 빈터는 나무 건너뛰기, 나무 하나짜리는 쓰지 않는다
  if (!mod && e.shiftKey) {
    const left = isKey(e, 'ArrowLeft', 'ArrowLeft');
    const right = isKey(e, 'ArrowRight', 'ArrowRight');
    if (left || right) {
      if (form === 'tower') return left ? 'swap-left' : 'swap-right';
      if (form === 'glade') return left ? 'tree-prev' : 'tree-next';
      return null;
    }
    // Shift+P: 고른 나무의 화음만 듣기
    if (isKey(e, 'KeyP', 'p')) return 'hear-tree';
  }
  const base = benchActionOf(e);
  if (base === 'hand-up') return 'ring-up';
  if (base === 'hand-down') return 'ring-down';
  if (base) return base;
  if (mod) return null;
  if (e.shiftKey) return null;
  if (isKey(e, 'PageUp', 'PageUp')) return 'letter-next';
  if (isKey(e, 'PageDown', 'PageDown')) return 'letter-prev';
  if (isKey(e, 'KeyR', 'r')) return 'mode-next';
  if (isKey(e, 'KeyX', 'x')) return 'mute';
  return null;
}

/** 도움 카드(H)에 보이는 키 표. 설계서 4.2의 표에 종나무의 높이·음이름·변화표 키를 더한 것이다. 형태마다 쓰는 키가 다르다 */
export function bellKeyTableOf(form: BellForm): ReadonlyArray<{ keys: string; label: string }> {
  const head: Array<{ keys: string; label: string }> =
    form === 'tower'
      ? [
          { keys: '← →', label: '종 고르기' },
          { keys: '↑ ↓', label: '종의 높이(옥타브) 바꾸기' },
          { keys: 'Shift+← →', label: '종의 가로 자리 바꾸기(전위는 그대로예요)' },
          { keys: 'X', label: '종 소리 끄고 켜기' },
          { keys: 'Enter, Space', label: '종 울려 보기' },
        ]
      : [
          { keys: '← →', label: '종 자리 옮기기' },
          ...(form === 'glade' ? [{ keys: 'Shift+← →', label: '나무 건너뛰기' }] : []),
          { keys: '↑ ↓', label: '종의 높이(가지) 바꾸기' },
          { keys: 'PageUp PageDown', label: '손에 든 종의 음이름 바꾸기' },
          { keys: 'Shift+↑ ↓', label: '변화표 바꾸기(♭ 없음 ♯)' },
          { keys: 'Enter, Space', label: '종 걸기' },
          { keys: 'Backspace', label: '종 빼기' },
        ];
  return [
    ...head,
    { keys: 'Z, Y', label: '실행 취소, 다시 실행' },
    { keys: 'P', label: form === 'glade' ? '내 화음 이어 듣기' : '내 배치 듣기' },
    ...(form === 'glade' ? [{ keys: 'Shift+P', label: '고른 나무의 화음만 듣기' }] : []),
    { keys: 'R', label: '듣는 방식 바꾸기(함께, 아래부터 차례로, 가장 낮은 종만)' },
    { keys: 'T', label: '목표 듣기' },
    { keys: 'S', label: '정지' },
    { keys: 'C', label: '배치 확인' },
    { keys: 'V', label: '패널로 보기' },
    { keys: 'H', label: '도움' },
    { keys: 'Esc', label: '나가기' },
  ];
}
