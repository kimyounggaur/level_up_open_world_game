// 5-4 합주 무대(T7)의 계산: 바닥 칸(성부 줄 × 마디 칸)과 악보를 잇는다. 설계서 4.9, 4.2.
// 바닥 칸은 '그 성부의 그 마디'라는 악보 위의 자리를 가리킬 뿐이다. 판정기는 바닥을 모르고 악보만 본다(W-3).
// 화면 좌표와 시간을 받지 않는다. 칸 번호, 성부 id, 마디 번호, 틱 같은 정수와 글자만 오간다.
import type { QuestVariant } from './content';
import type { Issue } from './feedback';
import type { InstallationDef, StageRowDef } from './installation';
import { measureRange, scoreToPlayback } from './playback';
import type { PlayNote, Playback, TickRange } from './playback';
import type { Score } from './score';
import type { DraftContent } from './session';
import { filledTicks, timelineOf } from './timeline';

/** 무대 바닥의 틀: 성부 줄들과 마디 칸 수. 설치물 파일의 slotMap(stageCells)에서 온다 */
export interface StageLayout {
  rows: readonly StageRowDef[];
  measures: number;
}

/** 설치물이 무대 바닥이면 그 틀을, 아니면 null */
export function stageLayoutOf(inst: Pick<InstallationDef, 'slotMap'>): StageLayout | null {
  return inst.slotMap.kind === 'stageCells' ? { rows: inst.slotMap.rows, measures: inst.slotMap.measures } : null;
}

export interface StageCell {
  /** 1부터. 성부 줄 하나를 왼쪽(1마디)에서 오른쪽으로 읽고 다음 줄로 넘어간다 */
  slot: number;
  /** 0부터 센 성부 줄 */
  row: number;
  voiceId: string;
  voiceLabel: string;
  /** 0부터 센 마디 */
  measureIndex: number;
}

/** 바닥의 모든 칸(자리 번호 순서) */
export function stageCells(layout: StageLayout): StageCell[] {
  const out: StageCell[] = [];
  layout.rows.forEach((row, r) => {
    for (let m = 0; m < layout.measures; m++) out.push({ slot: r * layout.measures + m + 1, row: r, voiceId: row.voiceId, voiceLabel: row.label, measureIndex: m });
  });
  return out;
}

export function stageCellOfSlot(layout: StageLayout, slot: number): StageCell | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > layout.rows.length * layout.measures) return null;
  return stageCells(layout)[slot - 1] ?? null;
}

/** 성부와 마디가 가리키는 칸의 자리 번호. 바닥에 없으면 null */
export function stageSlotOf(layout: StageLayout, voiceId: string, measureIndex: number): number | null {
  const r = layout.rows.findIndex((row) => row.voiceId === voiceId);
  if (r < 0 || !Number.isInteger(measureIndex) || measureIndex < 0 || measureIndex >= layout.measures) return null;
  return r * layout.measures + measureIndex + 1;
}

/** 이 판본이 쓰는 성부들의 id(바닥 줄 순서) */
export function usedVoiceIds(layout: StageLayout, variant: QuestVariant): string[] {
  const used = new Set(timelineOf(variant).voices.map((v) => v.voiceId));
  return layout.rows.map((r) => r.voiceId).filter((id) => used.has(id));
}

// ---------------------------------------------------------------------------
// 칸의 모습

export type StageFill = 'unused' | 'empty' | 'partial' | 'full';

export interface StageCellView {
  slot: number;
  voiceId: string;
  measureIndex: number;
  fill: StageFill;
  /** 채워진 칸 수와 마디의 칸 수(칸 = 판본이 정한 가장 짧은 음가) */
  filledCells: number;
  totalCells: number;
  /** 바닥에 쓰는 짧은 글. 비었거나 쓰지 않는 칸은 null. 예: '3/4' */
  name: string | null;
  /** 낭독기가 읽는 말 */
  text: string;
}

/** 칸마다 지금 얼마나 채워져 있는가. 음표 하나하나는 바닥에서 읽지 않는다: 성부가 둘이고 음가가 섞이면 바닥 칸으로는 읽기 어렵다(4.9) */
export function stageCellViews(layout: StageLayout, variant: QuestVariant, content: DraftContent): StageCellView[] {
  const spec = timelineOf(variant);
  const used = new Set(spec.voices.map((v) => v.voiceId));
  const totalCells = Math.round(spec.measureTicks / spec.cellTicks);
  return stageCells(layout).map((cell): StageCellView => {
    const where = `${cell.voiceLabel} ${cell.measureIndex + 1}마디`;
    if (!used.has(cell.voiceId)) {
      return { slot: cell.slot, voiceId: cell.voiceId, measureIndex: cell.measureIndex, fill: 'unused', filledCells: 0, totalCells, name: null, text: `${where}: 이 판본에서는 쓰지 않아요.` };
    }
    const ticks = filledTicks(content, cell.voiceId, cell.measureIndex);
    const filledCells = Math.min(totalCells, Math.floor(ticks / spec.cellTicks));
    const fill: StageFill = ticks <= 0 ? 'empty' : ticks >= spec.measureTicks ? 'full' : 'partial';
    const text = fill === 'empty' ? `${where}: 비어 있어요.` : fill === 'full' ? `${where}: 가득 채워졌어요.` : `${where}: ${totalCells}칸 중 ${filledCells}칸이 채워졌어요.`;
    return { slot: cell.slot, voiceId: cell.voiceId, measureIndex: cell.measureIndex, fill, filledCells, totalCells, name: fill === 'empty' ? null : `${filledCells}/${totalCells}`, text };
  });
}

/**
 * 판정이 가리킨 칸들(느낌표 표식). 그 성부의 그 마디만 가리킨다(4.2 '다른 자리에만 느낌표').
 * 마디를 가리키지 않는 문제(예: 성부가 통째로 비어 있다)는 그 성부의 모든 마디 칸을 가리킨다.
 */
export function flaggedStageSlots(layout: StageLayout, issues: readonly Issue[]): number[] {
  const set = new Set<number>();
  for (const issue of issues) {
    const t = issue.target;
    if (!t) continue;
    const rows = t.voiceId === undefined ? layout.rows.map((r) => r.voiceId) : [t.voiceId];
    for (const voiceId of rows) {
      if (t.measureIndex !== undefined) {
        const slot = stageSlotOf(layout, voiceId, t.measureIndex);
        if (slot !== null) set.add(slot);
      } else {
        for (let m = 0; m < layout.measures; m++) {
          const slot = stageSlotOf(layout, voiceId, m);
          if (slot !== null) set.add(slot);
        }
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 듣기 범위: 전체, 성부 하나만, 고른 마디만(4.9). 성부 따로 듣기는 도움 메뉴에 있다(4.2).

export type ListenScope = { kind: 'all' } | { kind: 'voice'; voiceId: string } | { kind: 'measure'; measureIndex: number };

export const ALL_SCOPE: ListenScope = { kind: 'all' };

export function sameScope(a: ListenScope, b: ListenScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'voice' && b.kind === 'voice') return a.voiceId === b.voiceId;
  if (a.kind === 'measure' && b.kind === 'measure') return a.measureIndex === b.measureIndex;
  return true;
}

/** 범위의 이름. 예: '전체', '위 성부만', '2마디만' */
export function scopeName(scope: ListenScope, rows: readonly StageRowDef[]): string {
  if (scope.kind === 'all') return '전체';
  if (scope.kind === 'voice') return `${rows.find((r) => r.voiceId === scope.voiceId)?.label ?? scope.voiceId}만`;
  return `${scope.measureIndex + 1}마디만`;
}

/** 범위가 가리키는 틱 구간. 전체와 성부 하나는 곡 전체 길이를 쓰므로 null이다 */
export function scopeSection(scope: ListenScope, meter: string): TickRange | null {
  return scope.kind === 'measure' ? measureRange(meter, scope.measureIndex) : null;
}

export interface ScopedPlayback extends Playback {
  /** 이 구간만 재생한다(고른 마디만). 없으면 처음부터 끝까지 */
  section: TickRange | null;
  /** 범위 안에서 울리는 음의 수. 0이면 들려 줄 것이 없다 */
  audibleCount: number;
}

/**
 * 악보를 범위에 맞게 재생 내용으로 바꾼다. 소리가 악보와 판정에 쓴 해석과 같다(G2-3).
 * `minLengthTicks`는 곡 전체 길이다: 아직 다 놓지 않은 초안도 끝 마디까지 지나가야 바닥의 재생 표시가 곡 전체를 따라간다.
 */
export function scopedPlayback(score: Score, scope: ListenScope, tempoBpm: number, minLengthTicks = 0): ScopedPlayback {
  const pb = scoreToPlayback(score, { tempoBpm, ...(scope.kind === 'voice' ? { voiceIds: [scope.voiceId] } : {}) });
  const section = scopeSection(scope, score.meter);
  const audible: PlayNote[] = section ? pb.notes.filter((n) => n.onsetTick >= section.startTick && n.onsetTick < section.endTick) : pb.notes;
  return { ...pb, lengthTicks: Math.max(pb.lengthTicks, minLengthTicks), section, audibleCount: audible.length };
}

/**
 * 지금 울리는 칸들(재생 위치 → 바닥 칸). 성부 하나만 들을 때는 그 줄의 칸 하나, 아니면 이 판본이 쓰는 모든 줄의 그 마디 칸이다.
 * 고른 마디만 들을 때는 그 마디의 칸들이다.
 */
export function playingStageSlots(layout: StageLayout, usedVoices: readonly string[], scope: ListenScope, tick: number, measureTicks: number): number[] {
  if (!(tick >= 0) || measureTicks <= 0) return [];
  const m = Math.floor(tick / measureTicks);
  if (m < 0 || m >= layout.measures) return [];
  if (scope.kind === 'measure' && scope.measureIndex !== m) return [];
  const voices = scope.kind === 'voice' ? [scope.voiceId] : usedVoices;
  return voices.map((v) => stageSlotOf(layout, v, m)).filter((s): s is number => s !== null);
}

/** 합주 무대의 자유 가락(4.9)의 이름과 설명. 표지판과 패널 제목이 같은 말을 쓴다 */
export const FREE_MELODY_LABEL = '자유 가락';

/**
 * 자유 가락의 판본(4.9): 합주 판본의 틀(4마디 4/4, 성부 하나, 음역)에서 목표 악보만 비운 것이다.
 * 가장 짧은 음은 8분음표로 늘려, 소리 조각의 8분음표가 그대로 놓인다. 판정하지 않으므로 판정기 설정은 쓰이지 않는다.
 * 기본 판본은 성부 하나짜리(한 성부)를 골라 넘긴다: 바닥의 아래 줄은 쓰지 않는 칸으로 남는다.
 */
export function freeMelodyVariant(base: QuestVariant): QuestVariant {
  const found = freeMelodyFrames.get(base);
  if (found) return found;
  const { tuplets: _tuplets, chords: _chords, ...score } = base.score;
  const made: QuestVariant = {
    ...base,
    score: { ...score, events: [], measureCount: score.measureCount ?? 4 },
    challengeDescriptor: { ...base.challengeDescriptor, smallestValue: 'eighth' },
  };
  freeMelodyFrames.set(base, made);
  return made;
}

/** 같은 판본에서는 같은 틀을 돌려준다(화면이 틀이 바뀐 줄 알고 다시 그리지 않게) */
const freeMelodyFrames = new WeakMap<QuestVariant, QuestVariant>();

/** 곡 전체 길이(틱). Q08의 4마디 4/4는 15360이다(5-4) */
export function songLengthTicks(variant: QuestVariant): number {
  const spec = timelineOf(variant);
  return spec.measureTicks * spec.measures;
}
