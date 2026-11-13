// 징검다리(T2) 과제의 안내 문장. 월드의 설치물 모드와 패널이 같은 문장을 쓴다(4.2 '문장은 패널과 같은 것을 쓴다').
import { pitchName } from '../../domain/pitch';
import { materialValueName, tupletKindName } from '../../domain/timeline';
import { restName } from '../timeline/tool';
import type { ResolvedTool } from '../timeline/tool';
import { STONE_VOCAB } from '../timeline/vocab';
import type { TimelineVocab } from '../timeline/vocab';

/** 놓은 울림돌(울림 못)이 하나도 없는데 내 배치를 들으려 할 때 */
export const noNotesNoticeOf = (v: TimelineVocab = STONE_VOCAB): string => `아직 놓은 ${v.note}이 없어요. ${v.note}을 골라 칸에 놓아 보세요.`;
export const NO_STONE_NOTES_NOTICE = noNotesNoticeOf(STONE_VOCAB);

/** 통과했을 때 '통과했어요.' 뒤에 붙는 문장 */
export const passedTextOf = (v: TimelineVocab = STONE_VOCAB): string => `${v.piece}이 한 마디를 빈틈없이 채웠고 목표와 같아요.`;
export const STONE_PASSED_TEXT = passedTextOf(STONE_VOCAB);

/** 아직 확인하지 않았을 때의 한 줄 안내. 확인하기 전에는 맞고 틀림을 알려 주지 않는다 */
export function stoneIdleLead(filledTicks: number, measureTicks: number, v: TimelineVocab = STONE_VOCAB): string {
  return filledTicks >= measureTicks ? "한 마디를 다 채웠어요. '배치 확인'을 눌러 보세요." : `${v.withPiece} 한 마디를 빈틈없이 채우고 '배치 확인'을 눌러 보세요.`;
}

/** 손에 든 것의 이름. 예: '울림돌 C4 4분음표', '이끼돌 4분쉼표', '비우기' */
export function handLabelOf(tool: ResolvedTool, v: TimelineVocab = STONE_VOCAB): string {
  switch (tool.kind) {
    case 'note':
      return `${v.note} ${pitchName(tool.pitch)} ${materialValueName(tool.value, tool.dotted)}`;
    case 'rest':
      return `${v.rest} ${restName(tool.value, tool.dotted)}`;
    case 'raft':
      return tool.tuplet ? `${tupletKindName(tool.tuplet)} 뗏목(${pitchName(tool.pitch)})` : '뗏목';
    case 'erase':
      return '비우기';
    default:
      return '없음';
  }
}

/** 칸 위에 올려 둔 손의 모양을 설명하는 짧은 글(단추 이름과 낭독에 쓴다) */
export type KindNames = Readonly<Record<'note' | 'rest' | 'raft' | 'erase', { name: string; sub: string }>>;
export const kindNamesOf = (v: TimelineVocab = STONE_VOCAB): KindNames => ({
  note: { name: v.note, sub: '소리가 나요' },
  rest: { name: v.rest, sub: '쉼표예요' },
  raft: { name: '셋잇단 뗏목', sub: '세 돌이 한 벌이에요' },
  erase: { name: '비우기', sub: `${v.piece}을 치워요` },
});
export const KIND_NAMES: KindNames = kindNamesOf(STONE_VOCAB);
