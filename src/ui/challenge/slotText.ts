// 순서 칸(디딤돌) 과제의 안내 문장. 월드의 설치물 모드와 패널이 같은 문장을 쓴다(4.2 '문장은 패널과 같은 것을 쓴다').

/**
 * 통과했을 때 '통과했어요.' 뒤에 붙는 문장. scaleName은 음계의 이름이다(scaleNameOf, 7-2).
 * 이름을 주지 않으면 장음계로 읽어서, Q07의 문장은 이전과 글자까지 같다.
 */
export function slotPassedText(keyName: string | undefined, count: number, scaleName = '장음계'): string {
  return `${count}자리의 음이 ${keyName ? `${keyName}의 ` : ''}${scaleName}와 같아요.`;
}

/** 아직 확인하지 않았을 때의 안내. 확인하기 전에는 맞고 틀림을 알려 주지 않는다 */
export function slotIdleText(placedCount: number, count: number): string {
  return `${slotIdleLead(placedCount, count)} 확인하기 전에는 맞고 틀림을 알려 주지 않아요.`;
}

/** 작업대(월드 화면)의 한 줄 안내. 월드 위에서는 자리를 아끼려고 앞 문장만 쓴다. 뒷 문장은 패널과 도움에 있다 */
export function slotIdleLead(placedCount: number, count: number): string {
  return placedCount === count ? "다 놓았어요. '배치 확인'을 눌러 보세요." : `${count}자리를 모두 놓고 '배치 확인'을 눌러 보세요.`;
}

/** 자유로 놀기(과제를 고르지 않은 상태)의 한 줄 안내 */
export const FREE_IDLE_TEXT = '자유로 놀기예요. 판정 없이 마음껏 놓아 보세요. 과제는 표지판에서 골라요.';
