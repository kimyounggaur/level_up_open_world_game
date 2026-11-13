// 6-7 종나무(T4)의 안내 문장. 월드의 설치물 모드(BellHud)와 패널(연속 화음 판)이 같은 문장을 쓴다(4.2 '문장은 패널과 같은 것을 쓴다').
import type { QuestVariant } from '../../domain/content';
import { bellTreeNameOf } from '../../domain/bells';
import type { BellMap } from '../../domain/bells';
import { chordTitleOf, toneLabelOf } from '../../domain/slotplan';
import type { ToneMode } from '../../domain/slotplan';

/** 나무 이름: 첫째 나무, 둘째 나무 … (빈터의 나무들은 길을 따라 선 차례다). 월드의 이름표와 같은 이름을 쓴다(domain/bells) */
export const treeNameOf = bellTreeNameOf;

/** 종 자리(초안 칸) 하나의 이름. 나무가 하나면 '종 3', 여럿이면 '둘째 나무의 3번째 종' (패널의 종 이름 toneLabelOf와 같다) */
export function bellLabelOf(map: Pick<BellMap, 'trees' | 'columns'>, draft: number): string {
  const column = draft % map.columns;
  return map.trees === 1 ? toneLabelOf(column) : `${treeNameOf(Math.floor(draft / map.columns))}의 ${column + 1}번째 종`;
}

/** 듣는 방식. 판의 세 단추와 월드의 세 단추가 같은 이름을 쓴다 */
export const HEAR_MODES: ReadonlyArray<{ mode: ToneMode; label: string }> = [
  { mode: 'together', label: '함께 울리기' },
  { mode: 'ascending', label: '아래부터 차례로' },
  { mode: 'lowest', label: '가장 낮은 종만' },
];

export const hearModeLabel = (mode: ToneMode): string => HEAR_MODES.find((m) => m.mode === mode)?.label ?? '';

export const NO_BELL_NOTICE = '아직 걸린 종이 없어요. 종을 골라 걸어 보세요.';
export const NO_SOUNDING_BELL_NOTICE = '소리가 켜진 종이 없어요. 종의 소리를 켜 보세요.';
export const TOWER_NO_REMOVE = '종탑의 종은 뺄 수 없어요. 소리를 끄려면 X를 눌러요.';
export const TREE_NO_MUTE = '나무의 종은 소리를 끄지 않고 빼요. 빼려면 Backspace를 눌러요.';
export const NO_TREE_JUMP = '나무가 하나뿐이에요.';
export const TOWER_NO_HAND = '종탑의 종은 음이름이 정해져 있어요. 높이는 ↑↓로, 가로 자리는 Shift+←→로 바꿔요.';

/** 판본이 가리키는 화음의 이름 (예: 'C장3화음'). 정답의 구성음은 말하지 않는다 */
export const bellChordTitleOf = (variant: QuestVariant): string => chordTitleOf(variant);

/** '통과했어요.' 뒤에 붙는 문장. 판과 같다 */
export function bellPassedText(variant: QuestVariant): string {
  const type = variant.evaluatorSpec.type;
  if (type === 'inversion') return '가장 낮은 종이 목표의 베이스예요.';
  if (type === 'chordSequence') return `${bellChordTitleOf(variant)}의 화음이 차례로 모두 걸렸어요.`;
  return `${bellChordTitleOf(variant)}의 구성음이 모두 걸렸어요.`;
}

/** 아직 확인하지 않았을 때의 한 줄 안내(월드 위에서는 자리를 아끼려고 앞 문장만 쓴다). 확인하기 전에는 맞고 틀림을 알려 주지 않는다 */
export function bellIdleLead(form: BellMap['form'], trees: number, hung: number): string {
  if (form === 'tower') return "종의 높이와 소리를 바꿔 보고 '배치 확인'을 눌러 보세요.";
  if (hung === 0) return form === 'glade' ? `${trees}그루의 나무에 종을 걸고 '배치 확인'을 눌러 보세요.` : "종을 걸고 '배치 확인'을 눌러 보세요.";
  return `종이 ${hung}개 걸려 있어요. '배치 확인'을 눌러 보세요.`;
}

/** 들어왔을 때 알리는 말 */
export function bellEntryText(name: string, form: BellMap['form']): string {
  if (form === 'tower') {
    return `${name}에 들어왔어요. ←→로 종을 고르고 ↑↓로 높이(옥타브)를 바꿔요. Shift+←→는 종의 가로 자리를, X는 종 소리를 바꿔요. 도움은 H, 나가기는 Esc예요.`;
  }
  const jump = form === 'glade' ? ' Shift+←→로 나무를 건너뛰어요.' : '';
  return `${name}에 들어왔어요. ←→로 종 자리를 옮기고 ↑↓로 높이를, PageUp·PageDown으로 음이름을, Shift+↑↓로 변화표를 골라 Enter로 걸어요.${jump} 도움은 H, 나가기는 Esc예요.`;
}
