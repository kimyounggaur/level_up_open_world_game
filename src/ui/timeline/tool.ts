// 시간선 패널(Q03, Q08)이 함께 쓰는 '손에 든 재료'의 계산. 화면 부품이 아니라 값만 다룬다.
// 재료는 세 번에 나눠 고른다: 종류(음, 쉼, 셋잇단 묶음, 비우기) → 길이 → 음높이. 고른 것은 종류를 바꿔도 남는다.
import { pitchName } from '../../domain/pitch';
import type { SpelledPitch } from '../../domain/pitch';
import type { NoteValue } from '../../domain/time';
import { materialValueName, materialValueTicks, timelinePitches, tupletKindName } from '../../domain/timeline';
import type { TimelineMaterial, TimelineSpec, TupletKind } from '../../domain/timeline';

export type ToolKind = 'note' | 'rest' | 'raft' | 'erase';

/** 화면 상태. 값이 null이면 아직 고르지 않은 것이고, 과제가 정한 첫 값을 쓴다 */
export interface ToolState {
  kind: ToolKind | null;
  value: NoteValue | null;
  /** 점을 붙이는가. 점음표를 놓을 수 있는 판본의 음가에서만 켜진다 */
  dotted: boolean;
  pitchKey: string | null;
  tupletKey: string | null;
}

export const NO_TOOL: ToolState = { kind: null, value: null, dotted: false, pitchKey: null, tupletKey: null };

export const tupletKeyOf = (t: Pick<TupletKind, 'actualNotes' | 'normalNotes' | 'writtenBaseDuration'>): string => `${t.writtenBaseDuration}-${t.actualNotes}-${t.normalNotes}`;

/** 상태에 과제의 첫 값을 채워 넣은 것 */
export interface ResolvedTool {
  kind: ToolKind | null;
  value: NoteValue;
  dotted: boolean;
  pitch: SpelledPitch;
  tuplet: TupletKind | null;
}

export function resolveTool(state: ToolState, spec: TimelineSpec): ResolvedTool {
  const pitches = timelinePitches(spec);
  const pitch = pitches.find((p) => pitchName(p) === state.pitchKey) ?? pitches[0]!;
  const tuplet = spec.tuplets.find((t) => tupletKeyOf(t) === state.tupletKey) ?? spec.tuplets[0] ?? null;
  const value = state.value && spec.values.includes(state.value) ? state.value : spec.values[0]!;
  const dotted = state.dotted && spec.dottedValues.includes(value);
  return { kind: state.kind, value, dotted, pitch, tuplet };
}

/** 놓을 재료. 비우기이거나 고르지 않았으면 null */
export function materialOf(tool: ResolvedTool): TimelineMaterial | null {
  if (tool.kind === 'note') return { kind: 'note', pitch: tool.pitch, value: tool.value, ...(tool.dotted ? { dotted: true } : {}) };
  if (tool.kind === 'rest') return { kind: 'rest', value: tool.value, ...(tool.dotted ? { dotted: true } : {}) };
  if (tool.kind === 'raft' && tool.tuplet) return { kind: 'tuplet', tuplet: tool.tuplet, stone: { kind: 'note', pitch: tool.pitch } };
  return null;
}

/** 길이 단추를 쓸 수 있는 종류인가 */
export const usesValue = (kind: ToolKind | null): boolean => kind === 'note' || kind === 'rest';
/** 음높이 단추를 쓸 수 있는 종류인가 */
export const usesPitch = (kind: ToolKind | null): boolean => kind === 'note' || kind === 'raft';

export const restName = (value: NoteValue, dotted = false): string => materialValueName(value, dotted).replace('음표', '쉼표');
export const valueTicksText = (value: NoteValue, dotted = false): string => `${materialValueTicks(value, dotted)}틱`;

/** '지금 고른 재료' 안내 문장 */
export function toolText(tool: ResolvedTool): string {
  switch (tool.kind) {
    case 'note':
      return `고른 재료: ${pitchName(tool.pitch)} ${materialValueName(tool.value, tool.dotted)}. 칸을 누르면 놓여요.`;
    case 'rest':
      return `고른 재료: ${restName(tool.value, tool.dotted)}. 칸을 누르면 놓여요.`;
    case 'raft':
      return tool.tuplet
        ? `고른 재료: ${tupletKindName(tool.tuplet)} 묶음(돌 ${tool.tuplet.actualNotes}개, 처음에는 모두 ${pitchName(tool.pitch)}). 박 창의 칸을 누르면 그 박에 놓여요. 돌은 하나씩 바꿀 수 있어요.`
        : '이 과제에는 셋잇단 묶음이 없어요.';
    case 'erase':
      return '비우기를 골랐어요. 칸을 누르면 그 자리를 비워요. 셋잇단 돌을 누르면 묶음 전체가 지워져요.';
    default:
      return '고른 재료가 없어요. 칸을 누르면 그 칸만 골라요.';
  }
}
