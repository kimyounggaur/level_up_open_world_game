// 시간선의 조각을 눌렀을 때 하는 일: 고른 재료를 놓거나, 비우거나, 조각만 고른다. 놓을 수 없으면 이유를 문장으로 돌려준다.
import { midiOf } from '../../domain/pitch';
import { alreadyEmptyText, clearOnTimeline, placeOnTimeline } from '../../domain/timeline';
import type { TimelineBlock, TimelineSpec } from '../../domain/timeline';
import type { ChallengeController } from '../challenge/controller';
import { materialOf } from './tool';
import type { ResolvedTool } from './tool';

export type PressKind = 'placed' | 'cleared' | 'rejected' | 'empty' | 'picked';

export interface PressOutcome {
  kind: PressKind;
  /** 화면에 보이고 낭독기가 읽는 문장 */
  text: string;
  /** 일이 일어난 자리(마디 처음부터 센 틱). 눌린 뒤에 초점을 돌려 놓을 곳 */
  tick: number;
}

export interface PressWindow {
  voiceId: string;
  measureIndex: number;
  /** 확대 창의 시작 틱. 셋잇단 묶음은 박이 시작하는 자리에만 놓이므로 창의 처음에 놓는다 */
  from: number;
}

export function pressBlock(controller: ChallengeController, spec: TimelineSpec, win: PressWindow, tool: ResolvedTool, block: TimelineBlock): PressOutcome {
  const content = controller.content();
  const material = materialOf(tool);
  if (material) {
    const tick = material.kind === 'tuplet' ? win.from : block.fullStart;
    const placed = placeOnTimeline(spec, content, { voiceId: win.voiceId, measureIndex: win.measureIndex, tick }, material);
    if (!placed.ok) {
      controller.announce(placed.text);
      return { kind: 'rejected', text: placed.text, tick };
    }
    controller.edit(placed.edit, placed.announce);
    const heard = material.kind === 'note' ? material.pitch : material.kind === 'tuplet' && material.stone.kind === 'note' ? material.stone.pitch : null;
    if (heard) controller.previewPitch(midiOf(heard));
    return { kind: 'placed', text: placed.announce, tick };
  }
  if (tool.kind === 'erase') {
    const cleared = clearOnTimeline(spec, content, { voiceId: win.voiceId, measureIndex: win.measureIndex, tick: block.fullStart });
    if (!cleared) {
      const text = alreadyEmptyText(spec, win.measureIndex, block.fullStart);
      controller.announce(text);
      return { kind: 'empty', text, tick: block.fullStart };
    }
    controller.edit(cleared.edit, cleared.announce);
    return { kind: 'cleared', text: cleared.announce, tick: block.fullStart };
  }
  const text = `${block.description}.`;
  controller.announce(text);
  return { kind: 'picked', text, tick: block.fullStart };
}

/** 키보드의 Delete: 그 조각이 비어 있지 않으면 비운다. 비운 결과를 돌려준다 */
export function clearBlock(controller: ChallengeController, spec: TimelineSpec, win: PressWindow, block: TimelineBlock): PressOutcome | null {
  if (block.kind === 'empty') return null;
  const cleared = clearOnTimeline(spec, controller.content(), { voiceId: win.voiceId, measureIndex: win.measureIndex, tick: block.fullStart });
  if (!cleared) return null;
  controller.edit(cleared.edit, cleared.announce);
  return { kind: 'cleared', text: cleared.announce, tick: block.fullStart };
}
