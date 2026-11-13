// 7-3 건반 다리(T6) 작업대의 키 표. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 다리에서 각 키가 하는 일만 정한다.
// - ← →: 널(건반)을 한 장씩 옮긴다. 옮길 때마다 그 널의 소리가 울린다(널의 소리는 널이 정한다, 4.8).
// - ↑ ↓: 할 것을 한 칸씩 고른다(이름 과제는 이름표 자리, 음정 과제는 밧줄, 임시표 과제는 깃발).
// - Enter, Space: 이름표 자리 고르기(이름 과제), 끝 말뚝 꽂기와 두 음 들어 보기(음정 과제), 깃발 꽂기(임시표 과제).
// - Shift+↑ ↓: 이름표를 열 개 가운데서 바꾸기(이름 과제), 끝 말뚝의 이름 바꾸기(음 쌓기).
// 글자 키는 물리 키(code)로 읽으므로 한글 자판에서도 같은 자리의 키가 같은 동작이다. 키를 읽는 것은 benchActionOf 하나다.
import { benchActionOf } from './benchKeys';
import type { BenchAction, BenchKey } from './benchKeys';
import type { BridgeTask } from '../../domain/keyBridge';

export type BridgeAction = BenchAction;

/** 키 이벤트가 건반 다리 작업대의 어떤 동작인지. 못 알아보면 null (Alt와 함께 누른 것, Ctrl·Meta와 함께 누른 것은 실행 취소·다시 실행만 받는다) */
export function bridgeActionOf(e: BenchKey): BridgeAction | null {
  return benchActionOf(e);
}

type KeyRow = { keys: string; label: string };

const COMMON_TAIL: readonly KeyRow[] = [
  { keys: 'Z, Y', label: '실행 취소, 다시 실행' },
  { keys: 'P', label: '내 것 듣기' },
  { keys: 'T', label: '목표 듣기' },
  { keys: 'S', label: '정지' },
  { keys: 'C', label: '확인' },
  { keys: 'V', label: '패널로 보기' },
  { keys: 'H', label: '도움' },
  { keys: 'Esc', label: '나가기' },
];

/** 도움 카드(H)에 보이는 키 표. 설계서 4.2의 표에 다리에서 각 키가 하는 일을 맞춘 것이다. 과제를 열지 않았으면 공통 키만 보인다 */
export function bridgeKeyTableOf(task: BridgeTask | null): ReadonlyArray<KeyRow> {
  const head: KeyRow = { keys: '← →', label: '널 옮기기(소리가 울려요)' };
  if (task === 'names') {
    return [
      head,
      { keys: '↑ ↓', label: '이름표 자리 고르기' },
      { keys: 'Enter, Space', label: '이 널의 이름표 자리 고르기' },
      { keys: 'Shift+↑ ↓', label: '이름표 바꾸기' },
      { keys: 'Backspace', label: '이름표 떼기' },
      ...COMMON_TAIL,
    ];
  }
  if (task === 'interval') {
    return [
      head,
      { keys: '↑ ↓', label: '밧줄 고르기' },
      { keys: 'Enter, Space', label: '끝 말뚝 꽂기(음 쌓기), 두 음 들어 보기' },
      { keys: 'Shift+↑ ↓', label: '끝 말뚝의 이름 바꾸기(음 쌓기)' },
      { keys: 'Backspace', label: '답 비우기' },
      ...COMMON_TAIL,
    ];
  }
  if (task === 'flags') {
    return [head, { keys: '↑ ↓', label: '깃발 고르기' }, { keys: 'Enter, Space', label: '고른 깃발 꽂기' }, { keys: 'Backspace', label: '고른 깃발 빼기' }, ...COMMON_TAIL];
  }
  return [head, ...COMMON_TAIL];
}
