// 오선에 놓는 과제(Q01, Q09–Q12)의 안내 문장. 오선 패널(ClefPanel)과 월드의 계단밭(TerraceHud)이 같은 문장을 쓴다(4.2 '문장은 패널과 같은 것을 쓴다').
// Q01처럼 두 음자리표에 같은 음을 하나씩 놓는 두 칸 과제는 원래의 문장을 그대로 두고, 그 밖의 과제(칸이 더 많거나 한 음자리표뿐인 것)는 칸 수를 말하는 문장을 쓴다.
import type { StaffSlot } from '../../domain/challenge';

/** 두 음자리표(높은음, 낮은음)에 한 칸씩인 두 칸 과제인가(Q01) */
export const isTwoClefPair = (slots: readonly Pick<StaffSlot, 'clef'>[]): boolean => slots.length === 2 && slots[0]!.clef !== slots[1]!.clef;

/** '통과했어요.' 뒤에 붙는 문장 */
export const staffPassedText = (slots: readonly Pick<StaffSlot, 'clef'>[]): string => (isTwoClefPair(slots) ? '두 보표의 음이 목표와 같아요.' : '놓은 음이 모두 목표와 같아요.');

/** 아직 확인하지 않았을 때의 한 줄 안내. 확인하기 전에는 맞고 틀림을 알려 주지 않는다 */
export function staffIdleText(placed: number, slots: readonly Pick<StaffSlot, 'clef'>[]): string {
  if (placed === slots.length) return "다 놓았어요. '배치 확인'을 눌러 보세요.";
  return isTwoClefPair(slots) ? "두 보표에 모두 놓고 '배치 확인'을 눌러 보세요." : `${slots.length}개 모두 놓고 '배치 확인'을 눌러 보세요.`;
}

/** 놓은 음을 차례로 들려 주는 단추의 이름 */
export const staffListenLabel = (slots: readonly Pick<StaffSlot, 'clef'>[]): string => (isTwoClefPair(slots) ? '두 음 듣기' : '놓은 음 듣기');
