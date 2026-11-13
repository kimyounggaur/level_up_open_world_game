// 7-1 계단밭(T5)의 안내 문장. 월드의 설치물 모드(TerraceHud)가 쓴다. 맞고 틀림과 통과 문장은 오선 패널과 같은 것을 쓴다(staffText).
// 문제를 푸는 중에는 보표 위치(아래 첫 덧줄 …)만 말하고 음 이름은 말하지 않는다: 이름을 알려 주면 높이를 찾는 일이 사라진다(4.7). 자유로 놀기에서만 이름도 말한다.

export const NO_LAMP_NOTICE = '아직 놓은 등이 없어요. ←→로 열을 고르고 ↑로 등을 놓아 보세요.';
export const NO_ACCIDENTAL_NOTICE = '이 도전에서는 변화표를 쓰지 않아요.';
export const UNUSED_COLUMN_NOTICE = '이 도전에서는 쓰지 않는 열이에요. 이름이 붙은 열에 놓아 주세요.';
export const PICK_COLUMN_FIRST = '먼저 열을 골라 주세요.';
export const PLACE_LAMP_FIRST = '먼저 등을 놓아 주세요.';

/** 들어왔을 때 알리는 말 */
export function terraceEntryText(name: string, accidentals: boolean): string {
  const tail = accidentals ? ' Shift+↑↓는 변화표예요.' : '';
  return `${name}에 들어왔어요. ←→로 열을 고르고 ↑↓로 등을 한 칸씩 올리고 내려요. PageUp·PageDown은 한 옥타브예요.${tail} Enter로 놓거나 울려 보고, Backspace로 빼요. 도움은 H, 나가기는 Esc예요.`;
}

/** 아직 확인하지 않았을 때의 한 줄 안내(월드 위에서는 자리를 아끼려고 앞 문장만 쓴다) */
export function terraceIdleLead(total: number, placed: number): string {
  if (placed === 0) return "열마다 등을 놓고 '배치 확인'을 눌러 보세요.";
  if (placed < total) return `등이 ${placed}개 놓여 있어요. 모두 놓고 '배치 확인'을 눌러 보세요.`;
  return "다 놓았어요. '배치 확인'을 눌러 보세요.";
}
