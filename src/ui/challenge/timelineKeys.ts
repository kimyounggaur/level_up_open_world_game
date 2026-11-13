// 6-4 징검다리(T2) 작업대의 키 표. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 징검다리에 필요한 것만 더한다.
// - ↑ ↓: 음높이를 바꾼다(4.2 '높이나 재료 바꾸기'의 높이). Shift+↑ ↓: 돌 길이를 한 단계씩 바꾼다. R: 울림돌과 이끼돌(재료의 종류, 영어 rest·raft의 R)을 바꾼다.
// R로 정한 까닭: 앱 전체의 단축키가 M(지도), L(목록), N(수첩)이라서(7.5) 이 셋과 겹치는 키는 쓸 수 없다. 겹치면 수첩이 열려 작업대가 가려진다.
// PageUp·PageDown: 박 단위로 옮긴다(줄이 긴 확대형 징검다리에서 칸을 하나씩 넘기지 않아도 되도록). 앱 전체의 단축키와 겹치지 않는다.
// 글자 키는 물리 키(code)로 읽으므로 한글 자판에서도 같은 자리의 키가 같은 동작이다.
import { STONE_VOCAB } from '../timeline/vocab';
import type { TimelineVocab } from '../timeline/vocab';
import { benchActionOf } from './benchKeys';
import type { BenchKey } from './benchKeys';

export type TimelineAction =
  | 'cursor-left'
  | 'cursor-right'
  | 'beat-prev'
  | 'beat-next'
  | 'hand-up'
  | 'hand-down'
  | 'length-up'
  | 'length-down'
  | 'kind-next'
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

/** 키 이벤트가 징검다리 작업대의 어떤 동작인지. 못 알아보면 null (Alt와 함께 누른 것, Ctrl·Meta와 함께 누른 것은 실행 취소·다시 실행만 받는다) */
export function timelineActionOf(e: BenchKey): TimelineAction | null {
  const base = benchActionOf(e);
  if (base === 'accidental-up') return 'length-up';
  if (base === 'accidental-down') return 'length-down';
  if (base) return base;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.code === 'PageUp' || (!e.code && e.key === 'PageUp')) return 'beat-prev';
  if (e.code === 'PageDown' || (!e.code && e.key === 'PageDown')) return 'beat-next';
  if (e.code === 'KeyR' || (!e.code && e.key?.toLowerCase() === 'r')) return 'kind-next';
  return null;
}

/** 도움 카드(H)에 보이는 키 표. 설계서 4.2의 표에 징검다리의 길이 키와 종류 키를 더한 것이다. 물레방아는 돌 대신 못이라고 부른다 */
export const timelineKeyTableOf = (v: TimelineVocab = STONE_VOCAB): ReadonlyArray<{ keys: string; label: string }> => [
  { keys: '← →', label: '칸 옮기기' },
  { keys: 'PageUp PageDown', label: '박 옮기기' },
  { keys: '↑ ↓', label: '음높이 바꾸기' },
  { keys: 'Shift+↑ ↓', label: `${v.piece} 길이 바꾸기(뗏목은 뗏목의 종류)` },
  { keys: 'R', label: `${v.note}과 ${v.rest} 바꾸기(뗏목이 있으면 뗏목까지)` },
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

export const TIMELINE_KEY_TABLE: ReadonlyArray<{ keys: string; label: string }> = timelineKeyTableOf(STONE_VOCAB);
