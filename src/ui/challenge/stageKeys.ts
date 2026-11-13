// 4.9 무대 바닥의 키 표. 설치물 모드의 공통 키(4.2)에서 음을 놓고 빼는 키(↑ ↓ Backspace Z Y)는 빠진다: 음표 편집은 패널에서 한다.
// 대신 듣기 범위를 돌려 고르는 R이 있다. 글자 키는 물리 키(code)로 읽으므로 한글 자판에서도 같은 자리의 키가 같은 동작이다.
import { benchActionOf } from './benchKeys';
import type { BenchKey } from './benchKeys';

export type StageAction = 'cell-left' | 'cell-right' | 'scope-next' | 'hear-mine' | 'hear-target' | 'stop' | 'check' | 'view-panel' | 'help' | 'exit';

/** 키 이벤트가 무대 바닥의 어떤 동작인지. 못 알아보면 null (Ctrl·Meta·Alt와 함께 누른 것은 브라우저의 것이므로 받지 않는다) */
export function stageActionOf(e: BenchKey): StageAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.code === 'KeyR' || (!e.code && e.key?.toLowerCase() === 'r')) return 'scope-next';
  switch (benchActionOf(e)) {
    case 'cursor-left':
      return 'cell-left';
    case 'cursor-right':
      return 'cell-right';
    // Enter, Space, V: 고른 마디를 패널에서 연다
    case 'place':
    case 'view-panel':
      return 'view-panel';
    case 'hear-mine':
      return 'hear-mine';
    case 'hear-target':
      return 'hear-target';
    case 'stop':
      return 'stop';
    case 'check':
      return 'check';
    case 'help':
      return 'help';
    case 'exit':
      return 'exit';
    default:
      return null;
  }
}

/** 도움 카드(H)에 보이는 키 표 */
export const STAGE_KEY_TABLE: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: '← →', label: '마디 고르기' },
  { keys: 'Enter, Space, V', label: '고른 마디를 패널에서 열기(음표는 패널에서 놓아요)' },
  { keys: 'R', label: '듣기 범위 바꾸기(전체 · 성부 하나 · 고른 마디)' },
  { keys: 'P', label: '내 곡 듣기' },
  { keys: 'T', label: '목표 듣기' },
  { keys: 'S', label: '정지' },
  { keys: 'C', label: '배치 확인' },
  { keys: 'H', label: '도움' },
  { keys: 'Esc', label: '나가기' },
];

/** 자유 가락의 도움 카드 키 표: 목표 듣기와 배치 확인이 없다(판정하지 않는다) */
export const STAGE_FREE_KEY_TABLE: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: '← →', label: '마디 고르기' },
  { keys: 'Enter, Space, V', label: '고른 마디를 패널에서 열기(음표는 패널에서 놓아요)' },
  { keys: 'R', label: '듣기 범위 바꾸기(전체 · 고른 마디)' },
  { keys: 'P', label: '내 가락 듣기' },
  { keys: 'S', label: '정지' },
  { keys: 'H', label: '도움' },
  { keys: 'Esc', label: '나가기' },
];
