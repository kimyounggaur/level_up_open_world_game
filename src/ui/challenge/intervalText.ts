// 음정 패널(IntervalPanel)의 안내 문장. 질문의 종류에 따라 문장이 갈린다.
//  - 비교(compare)가 있는 판본(Q04 음정 이름): 소리와 이름(표기)을 따로 묻는다
//  - 이름 묻기(identify)만 있는 판본(Q28 온음과 반음): 두 음 사이의 음정 이름을 고른다
//  - 음 쌓기(build)만 있는 판본(Q29 음정 쌓기): 시작 음 위로 음정 이름만큼 올라간 음을 만든다
// 한 가지 문장으로 모두 말하면 Q28·Q29에서 "소리와 이름이 어떤지", "두 음을 보고"처럼 묻지 않는 것을 묻는다고 말하게 된다.
import type { IntervalQuestion } from '../../domain/evaluators';

export interface IntervalTexts {
  /** 제목 아래 한 줄 */
  subtitle: string;
  /** 질문 개수 칩 옆의 칩 */
  chip: string;
  /** 질문 카드 모음 제목 옆의 짧은 설명 */
  hint: string;
  /** '통과했어요.' 뒤에 붙는 문장 */
  passed: string;
}

const HEAR_HINT = "'두 음 듣기'로 소리를 들어 보고, 화살표 키로 옮겨 Enter로 골라요.";

/** 질문 목록이 묻는 것에 맞는 문장. 비교가 하나라도 있으면 Q04의 문장이고, 이 문장들은 이전과 글자까지 같다 */
export function intervalTextsOf(questions: readonly IntervalQuestion[]): IntervalTexts {
  const kinds = new Set(questions.map((q) => q.kind));
  if (kinds.has('compare')) {
    return {
      subtitle: '두 음을 보고, 소리와 이름이 어떤지 눌러서 답해 보세요.',
      chip: '소리와 이름을 따로',
      hint: HEAR_HINT,
      passed: '소리가 같아도 이름이 다를 수 있다는 것을 구분했어요.',
    };
  }
  if (kinds.has('identify') && kinds.has('build')) {
    return {
      subtitle: '질문마다 두 음 사이의 음정 이름을 고르거나, 음정 이름대로 음을 만들어 보세요.',
      chip: '이름 읽기와 음 쌓기',
      hint: HEAR_HINT,
      passed: '음정 이름을 읽고, 음정 이름대로 음을 쌓았어요.',
    };
  }
  if (kinds.has('build')) {
    return {
      subtitle: '시작 음 위로 음정 이름만큼 올라간 음을 만들어 보세요. 음이름과 변화표를 눌러 골라요.',
      chip: '음 쌓기',
      hint: '소리를 켜 두면 고른 음이 한 번 울려요. 화살표 키로 옮겨 Enter로 골라요.',
      passed: '음정 이름대로 음을 맞게 쌓았어요.',
    };
  }
  return {
    subtitle: '두 음을 보고, 두 음 사이의 음정 이름을 눌러서 답해 보세요. 성질과 도수를 모두 골라야 해요.',
    chip: '음정 이름 고르기',
    hint: HEAR_HINT,
    passed: '두 음 사이의 음정 이름을 맞게 읽었어요.',
  };
}
