// 7-3 건반 다리(T6)의 안내 문장. 월드의 설치물 모드(KeyBridgeHud)가 쓴다. 맞고 틀림의 문장은 패널과 같은 것을 쓴다(판정기의 설명).
// 문제를 푸는 중에는 검은 널을 이웃한 흰 널로만 말하고 이름은 말하지 않는다: 이름을 알려 주면 이름 붙이는 일이 사라진다(4.8). 자유로 놀 때만 이름도 말한다.
import { fillTemplate } from '../../domain/feedback';
import type { BridgeTask } from '../../domain/keyBridge';

export const PICK_ITEM_FIRST = '먼저 위아래 키(↑ ↓)나 단추로 할 것을 골라 주세요.';
export const NO_TAG_NOTICE = '아직 걸린 이름표가 없어요. 이름표 자리를 고르고 이름표를 걸어 보세요.';
export const NO_FLAG_NOTICE = '아직 꽂은 깃발이 없어요. 깃발을 고르고 널을 눌러 꽂아 보세요.';
export const NO_STAKE_NOTICE = '아직 끝 말뚝이 없어요. 널을 눌러 끝 말뚝을 꽂아 보세요.';
export const TAG_ONLY_NOTICE = '이 도전에서는 이름표를 이름표 자리에만 걸어요.';
export const PICK_STAKE_FIRST = '먼저 끝 말뚝을 널에 꽂아 주세요. 널을 눌러요.';
export const PICK_PLANK_FIRST = '먼저 ← →로 널을 골라 주세요.';

const TASK_LEAD: Record<BridgeTask, string> = {
  names: '← →로 널을 옮기며 소리를 들어 보고, ↑ ↓로 이름표 자리를 골라요. Shift+↑↓나 이름표 단추로 이름표를 걸어요.',
  interval: '← →로 널을 옮기며 소리를 들어 보고, ↑ ↓로 질문을 골라요. 음정 이름은 단추로 골라요. 끝 말뚝은 널을 눌러 꽂아요.',
  flags: '← →로 널을 옮기며 소리를 들어 보고, ↑ ↓로 깃발을 골라요. Enter나 널 누르기로 깃발을 꽂아요.',
};

/** 들어왔을 때 알리는 말 */
export function bridgeEntryText(name: string, task: BridgeTask | null): string {
  return `${name}에 들어왔어요. ${task ? TASK_LEAD[task] : '← →로 널을 옮기며 소리를 들어 보세요.'} 도움은 H, 나가기는 Esc예요.`;
}

/** 아직 확인하지 않았을 때의 한 줄 안내 */
export function bridgeIdleLead(task: BridgeTask, total: number, done: number): string {
  const what = task === 'names' ? '이름표' : task === 'flags' ? '깃발' : '답';
  if (done === 0) return fillTemplate("{what:을를} 모두 채우고 '확인'을 눌러 보세요.", { what });
  if (done < total) return fillTemplate("{what:이가} {done}/{total}개 채워져 있어요. 모두 채우고 '확인'을 눌러 보세요.", { what, done, total });
  return "다 채웠어요. '확인'을 눌러 보세요.";
}

/** 통과했을 때 덧붙이는 말 */
export function bridgePassedText(task: BridgeTask): string {
  if (task === 'names') return '검은 널 하나에 이름이 둘이에요. 이름은 달라도 소리는 같아요.';
  if (task === 'interval') return '도수는 이름의 글자 수로, 반음 수는 널의 수로 세어요.';
  return '임시표는 그 마디가 끝날 때까지 이어지고, 다음 마디에서는 조표가 다시 적용돼요.';
}
