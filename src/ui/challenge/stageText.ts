// 무대 작업대(4.9)의 안내 문장. 돌 작업대의 slotText와 같은 말투로, 같은 글을 화면과 시험이 함께 쓴다.

/** 무대 바닥의 확인 전 안내. usedCells는 이 판본이 쓰는 칸 수, fullCells는 가득 채운 칸 수 */
export function stageIdleText(usedCells: number, fullCells: number): string {
  if (usedCells > 0 && fullCells >= usedCells) return "모든 칸을 채웠어요. '배치 확인'을 눌러 보세요.";
  return `마디를 고르고 '패널에서 열기'로 음표를 놓으세요. 채운 칸 ${fullCells}/${usedCells}. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.`;
}

/**
 * 좁고 낮은 세로 화면(작은 휴대폰)에서 확인 전 안내를 한 줄로 줄인 말. 작업대가 바닥을 가리지 않게 하려는 것이다(4.9, 7.3).
 * 줄이면서 빠지는 말(확인하기 전에는 맞고 틀림을 알려 주지 않는다)은 화면 낭독기가 긴 문장으로 그대로 읽는다.
 */
export function stageIdleShort(usedCells: number, fullCells: number): string {
  if (usedCells > 0 && fullCells >= usedCells) return "모든 칸을 채웠어요. '배치 확인'을 눌러 보세요.";
  return `채운 칸 ${fullCells}/${usedCells} · 칸을 눌러 열어요.`;
}

/** 통과했을 때(곡 패널과 같은 말) */
export const STAGE_PASSED_TEXT = '목표와 같아요.';

/** 자유 가락의 안내(판정하지 않는다). usedCells는 쓰는 칸 수, fullCells는 가득 채운 칸 수 */
export function stageFreeIdleText(usedCells: number, fullCells: number): string {
  if (usedCells > 0 && fullCells >= usedCells) return "모든 칸을 채웠어요. 패널에서 이름을 붙여 저장하면 내 곡이 돼요.";
  return `마디를 고르고 '패널에서 열기'로 가락을 만들어 보세요. 판정하지 않아요. 채운 칸 ${fullCells}/${usedCells}.`;
}
