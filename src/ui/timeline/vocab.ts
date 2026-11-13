// 6-6 징검다리(E1–E3)와 물레방아(E4)는 같은 작업대를 쓰지만 놓는 것을 다르게 부른다(설계서 4.4, 4.5):
// 징검다리는 울림돌·이끼돌·칸 위의 돌, 물레방아는 울림 못·이끼 못·구멍에 박는 못이다.
// 설치물이 정하고(바퀴가 있으면 물레방아), 작업대와 화면과 안내 문장이 같은 말을 쓴다. 돌의 말은 그대로 두어 E1–E3의 문장이 바뀌지 않는다.
import type { SlotMapDef } from '../../domain/installation';
import { STONE_WATER_WORDS, WHEEL_WATER_WORDS } from '../../domain/timelineStones';
import type { WaterWords } from '../../domain/timelineStones';

export interface TimelineVocab {
  id: 'stones' | 'wheel';
  /** 음이 있는 한 조각: 울림돌 / 울림 못 */
  note: string;
  /** 쉼표 한 조각: 이끼돌 / 이끼 못 */
  rest: string;
  /** 한 조각: 돌 / 못 */
  piece: string;
  /** '~로' 붙은 말: 돌로 / 못으로 */
  withPiece: string;
  /** 돌이 덮지 않은 곳과 한 조각을 부르는 말(남은 물을 알리는 문장에 쓴다) */
  water: WaterWords;
}

export const STONE_VOCAB: TimelineVocab = { id: 'stones', note: '울림돌', rest: '이끼돌', piece: '돌', withPiece: '돌로', water: STONE_WATER_WORDS };
export const WHEEL_VOCAB: TimelineVocab = { id: 'wheel', note: '울림 못', rest: '이끼 못', piece: '못', withPiece: '못으로', water: WHEEL_WATER_WORDS };

/** 설치물의 말. 바퀴가 있으면 물레방아의 말이다 */
export function vocabOf(inst: { slotMap?: SlotMapDef }): TimelineVocab {
  return inst.slotMap?.kind === 'timelineStones' && inst.slotMap.wheel ? WHEEL_VOCAB : STONE_VOCAB;
}
