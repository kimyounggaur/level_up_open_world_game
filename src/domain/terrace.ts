// 7-1 계단밭(T5, 설계서 4.7)의 칸 계산: 설치물의 열(세로줄)과 초안의 음 칸을 서로 바꾼다. 순수 계산이다.
// 계단밭은 큰보표를 땅에 눕힌 밭이다. 음의 세로 위치는 '가운데 도(C4)에서 온음계로 몇 칸 위인가'로 정해진다(y = c4Y − 48 × 칸 수).
// 등(음표) 하나는 열 하나를 차지한다. 열을 고르고 ↑↓로 한 칸(48 px)씩 높이를 옮긴다. 보표 밖이면 짧은 덧줄 돌담이 생긴다.
// 초안은 오선 패널(Q01의 StaffPanel)과 같다: 칸마다 쓰는 음자리표가 있고, 등의 높이는 그 음의 이름·옥타브(기보 음)로 보관된다.
//   그래서 월드의 밭에서 놓은 것이 패널의 오선에 그대로 보이고, 패널에서 놓은 것이 월드로 돌아오면 그 높이에 놓여 있다(초안 하나, 보는 방법 둘).
// 판정기로 넘어가는 값은 음자리표·음이름·옥타브·변화뿐이다. 음이름과 옥타브는 라벨이 아니라 온음계 위치에서 계산한다(4.7).
// 화면 좌표와 걸은 시간은 여기로 들어오지 못한다(W-3). 월드의 점은 높이 칸(정수)으로 바뀐 뒤에야 여기로 온다.
import { staffSlotsOf } from './challenge';
import type { StaffSlot } from './challenge';
import type { QuestVariant } from './content';
import { expectedPitchesOf } from './evaluators/orderedScale';
import type { InstallationDef, SlotMapDef, WorldRect } from './installation';
import { diatonicIndex, letterOctaveAt, midiOf, pitchName } from './pitch';
import type { Accidental, Letter, SpelledPitch, WrittenPitch } from './pitch';
import type { DraftContent, DraftEdit } from './session';
import { spellWritten } from './session';
import { shiftAccidental } from './slotmap';
import { CLEF_BOTTOM_LINE, CLEF_NAME_KO, describeStaffPosition } from './staff';
import type { Clef } from './staff';

/** 열은 8개, 열 사이 간격은 140 px, 등 하나(열의 가로)는 96 px다(4.7) */
export const TERRACE_COLUMNS = 8;
export const TERRACE_COLUMN_GAP = 140;
export const TERRACE_COLUMN_W = 96;
/** 온음계 한 칸은 48 px, 줄 간격은 96 px다(4.7). 화면에서 48 px 아래로 줄지 않게 카메라 배율의 하한이 여기서 나온다(7.3) */
export const TERRACE_STEP_PX = 48;
/** 밭의 글자 띠: 위쪽의 열 번호·이름 띠와 왼쪽의 음자리표 조각상·위치 이름 띠. 월드가 그리는 자리와 카메라가 담는 자리를 한곳에 둔다 */
export const TERRACE_LABEL_TOP = 56;
export const TERRACE_LABEL_LEFT = 64;
/** 밭을 담을 때 둘레의 여유(월드 px) */
export const TERRACE_FRAME_PAD = 24;
/** 한 열이 쓰는 높이: 그 열의 음자리표에서 보표 위치로 −4(아래 둘째 덧줄)부터 12(위 둘째 덧줄)까지. 패널의 오선(−6–14) 안이다 */
export const TERRACE_MIN_POSITION = -4;
export const TERRACE_MAX_POSITION = 12;
/** 열에서 처음 높이를 옮길 때 시작하는 보표 위치: 가운데 줄(패널의 오선과 같다) */
export const TERRACE_START_POSITION = 4;

export type TerraceMap = Extract<SlotMapDef, { kind: 'staffField' }>;

/** 설치물의 계단밭 변환표. 계단밭이 아니면 null */
export function terraceMapOf(inst: { slotMap?: SlotMapDef }): TerraceMap | null {
  return inst.slotMap?.kind === 'staffField' ? inst.slotMap : null;
}

const C4_INDEX = diatonicIndex({ letter: 'C', octave: 4 });

/** 온음계 위치: 가운데 도(C4)에서 몇 칸 위인가(아래는 음수). 한 칸이 온음계 한 계단이다 */
export const terraceStepOf = (p: { letter: Letter; octave: number }): number => diatonicIndex(p) - C4_INDEX;
/** 온음계 위치가 가리키는 음의 글자와 옥타브 */
export const terracePitchAtStep = (step: number): { letter: Letter; octave: number } => letterOctaveAt(C4_INDEX + step);
/** 온음계 위치의 세로 좌표(월드 px, 그 칸의 가운데). 위가 높은 음이다 */
export const terraceYOfStep = (map: Pick<TerraceMap, 'c4Y'>, step: number): number => map.c4Y - TERRACE_STEP_PX * step;
/** 세로 좌표가 가리키는 가장 가까운 온음계 위치 */
export const terraceStepAtY = (map: Pick<TerraceMap, 'c4Y'>, y: number): number => Math.round((map.c4Y - y) / TERRACE_STEP_PX);

/** 변환표의 높이 범위(온음계 위치). low·high는 'A3', 'C6' 같은 글자다 */
export function terraceRangeOf(map: Pick<TerraceMap, 'low' | 'high'>): { low: number; high: number } {
  return { low: stepOfName(map.low), high: stepOfName(map.high) };
}

/**
 * 눌린 세로 좌표(월드 px)가 가리키는 온음계 위치: 가장 가까운 칸을 밭의 높이 범위 안으로 맞춘다.
 * 열의 맨 위와 맨 아래는 반 칸(24 px)만큼 범위 밖으로 나와 있어서, 그 경계를 누르면 반올림한 칸이 범위 밖에 놓일 수 있다.
 * 월드가 이 값을 눌림 사건(slot-pressed의 step)에 실어 보낸다. 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3). −0은 0으로 돌려준다.
 */
export function terraceStepAtPress(map: Pick<TerraceMap, 'c4Y' | 'low' | 'high'>, y: number): number {
  const range = terraceRangeOf(map);
  return Math.min(range.high, Math.max(range.low, terraceStepAtY(map, y))) + 0;
}

/** 'A3' 같은 글자의 온음계 위치. 읽을 수 없으면 NaN */
export function stepOfName(name: string): number {
  const m = /^([A-G])(-?\d+)$/.exec(name.trim());
  if (!m) return Number.NaN;
  return terraceStepOf({ letter: m[1] as Letter, octave: parseInt(m[2]!, 10) });
}

/** 한 음자리표의 보표가 쓰는 온음계 위치 범위(덧줄 둘까지) */
export function clefStepRange(clef: Clef): { min: number; max: number } {
  const bottom = terraceStepOf(CLEF_BOTTOM_LINE[clef]);
  return { min: bottom + TERRACE_MIN_POSITION, max: bottom + TERRACE_MAX_POSITION };
}

/** 온음계 위치 → 그 음자리표의 보표 위치(맨 아랫줄 0, 위 칸 1 …) */
export const terracePositionOf = (clef: Clef, step: number): number => step - terraceStepOf(CLEF_BOTTOM_LINE[clef]);

/** 열의 가로 가운데(월드 px). 열 번호는 1부터 */
export function terraceColumnX(inst: Pick<InstallationDef, 'slots'>, column: number): number | null {
  const rect = inst.slots.find((s) => s.slot === column);
  return rect ? rect.x + rect.w / 2 : null;
}

/** 열 하나가 맡은 일: 어느 음자리표로 읽는 칸이고 어느 높이까지 쓸 수 있는가 */
export interface TerraceColumn {
  /** 설치물의 자리 번호(1부터) */
  column: number;
  /** 초안의 칸 번호(음이름 판본은 목표의 차례 0부터, 음계 판본은 순서 1부터) */
  draft: number;
  /** 판정기가 이 칸을 부르는 id(이슈의 target.slotId) */
  slotId: string;
  /** 화면에 쓰는 이름. 예: 'E4', 'B3 · 높은음자리표' */
  label: string;
  clef: Clef;
  keySignature: number;
  /** 이 열이 쓸 수 있는 높이(온음계 위치). 설치물의 범위와 음자리표의 범위가 겹치는 곳이다 */
  minStep: number;
  maxStep: number;
}

/**
 * 판본의 칸들을 열에 놓는다: 왼쪽부터 차례로 1번 열이다. 판본이 쓰지 않는 열은 목록에 없다.
 * 칸의 개수·음자리표·이름은 오선 패널(StaffPanel)이 읽는 것과 같다(staffSlotsOf).
 */
export function terraceColumnsOf(map: Pick<TerraceMap, 'low' | 'high'>, variant: QuestVariant): TerraceColumn[] {
  const range = terraceRangeOf(map);
  return staffSlotsOf(variant).map((s: StaffSlot, i): TerraceColumn => {
    const w = clefStepRange(s.clef);
    return { column: i + 1, draft: s.slot, slotId: s.slotId, label: s.label, clef: s.clef, keySignature: s.keySignature, minStep: Math.max(w.min, range.low), maxStep: Math.min(w.max, range.high) };
  });
}

/** 열에서 처음 놓을 높이: 그 음자리표의 가운데 줄(범위 안으로 맞춘다) */
export function terraceStartStep(col: Pick<TerraceColumn, 'clef' | 'minStep' | 'maxStep'>): number {
  const at = terraceStepOf(CLEF_BOTTOM_LINE[col.clef]) + TERRACE_START_POSITION;
  return Math.min(col.maxStep, Math.max(col.minStep, at));
}

// ───── 초안 읽기 ─────

/** 열 하나의 지금 모습 */
export interface TerraceState {
  column: number;
  draft: number;
  /** 놓인 기보 음. 비었으면 null */
  written: WrittenPitch | null;
  spelled: SpelledPitch | null;
  midi: number | null;
  /** 온음계 위치(C4에서 몇 칸 위). 비었으면 null */
  step: number | null;
  /** 이 열의 음자리표에서 본 보표 위치. 비었으면 null */
  position: number | null;
  /** 놓인 음의 이름(변화표와 옥타브 포함). 예: 'B♭3'. 비었으면 null */
  name: string | null;
  /** 보표 위치를 말로. 예: '아래 첫 덧줄'. 비었으면 null */
  where: string | null;
}

export function terraceStatesOf(columns: readonly TerraceColumn[], content: DraftContent): TerraceState[] {
  return columns.map((col): TerraceState => {
    const w = content.slots.find((s) => s.slot === col.draft)?.writtenPitch ?? null;
    if (!w) return { column: col.column, draft: col.draft, written: null, spelled: null, midi: null, step: null, position: null, name: null, where: null };
    const spelled = spellWritten(w, col.keySignature);
    const step = terraceStepOf(w);
    const position = terracePositionOf(col.clef, step);
    return { column: col.column, draft: col.draft, written: w, spelled, midi: midiOf(spelled), step, position, name: pitchName(spelled), where: describeStaffPosition(position) };
  });
}

/**
 * 열마다 들려 줄 목표 음(MIDI), 열 차례(왼쪽부터)대로: 음이름 판본은 목표의 expected, 음계 판본은 목표 악보의 차례다.
 * 월드의 '목표 듣기'가 쓴다. 목표 악보를 그대로 틀면 두 보표의 음이 한꺼번에 울리므로, 열을 하나씩 지나며 들려 준다.
 */
export function terraceTargetsOf(variant: QuestVariant): Array<{ draft: number; midi: number }> {
  const spec = variant.evaluatorSpec;
  if (spec.type === 'orderedScale') return expectedPitchesOf(variant.score, spec.voiceId).map((p, i) => ({ draft: i + 1, midi: p.midi }));
  if (spec.type === 'pitchSpelling') return spec.targets.map((t, i) => ({ draft: i, midi: midiOf(t.expected) }));
  return [];
}

/** 열에 놓인 등의 변화표(없으면 null) */
export const terraceAccidentalOf = (state: Pick<TerraceState, 'written'>): Accidental | null => state.written?.accidental ?? null;

// ───── 고치기 ─────

export type TerraceEditResult = { ok: true; edit: DraftEdit | null; text: string; midi: number | null } | { ok: false; text: string };

const fail = (text: string): TerraceEditResult => ({ ok: false, text });

function writtenAt(step: number, accidental: Accidental | null): WrittenPitch {
  const p = terracePitchAtStep(step);
  return { letter: p.letter, accidental, octave: p.octave };
}

/** 등의 높이와 변화표를 말로. 문제를 푸는 중에는 보표 위치(아래 첫 덧줄)만 말하고 음이름은 말하지 않는다: 이름을 알려 주면 높이를 찾는 일이 사라진다. 자유로 놀기에서는 이름도 말한다 */
export function terraceSpeakOf(state: Pick<TerraceState, 'name' | 'where'>, showName: boolean): string {
  if (state.where === null) return '';
  return showName && state.name ? `${state.name}, ${state.where}` : state.where;
}

/** 열에 등을 놓는다(이미 있으면 그 높이로 옮긴다). 변화표는 따로 주지 않으면 있던 그대로다 */
export function terracePlaceResult(col: TerraceColumn, content: DraftContent, step: number, showName: boolean, accidental?: Accidental | null): TerraceEditResult {
  if (!Number.isInteger(step)) return fail(`${col.label}: 높이를 알 수 없어요.`);
  if (step < col.minStep || step > col.maxStep) {
    const lo = describeStaffPosition(terracePositionOf(col.clef, col.minStep));
    const hi = describeStaffPosition(terracePositionOf(col.clef, col.maxStep));
    return fail(`${col.label}: ${CLEF_NAME_KO[col.clef]} 열은 ${lo}부터 ${hi}까지 놓을 수 있어요.`);
  }
  const current = content.slots.find((s) => s.slot === col.draft)?.writtenPitch ?? null;
  const written = writtenAt(step, accidental === undefined ? (current?.accidental ?? null) : accidental);
  const spelled = spellWritten(written, col.keySignature);
  const where = describeStaffPosition(terracePositionOf(col.clef, step));
  const name = pitchName(spelled);
  const speak = showName ? `${name}, ${where}` : where;
  const same = !!current && current.letter === written.letter && current.octave === written.octave && (current.accidental ?? null) === written.accidental;
  const text = same ? `${col.label} 등은 이미 ${speak}에 있어요.` : `${col.label} 등을 ${speak}에 놓았어요.`;
  return { ok: true, edit: same ? null : { type: 'setSlot', slot: col.draft, writtenPitch: written }, text, midi: midiOf(spelled) };
}

/**
 * 등을 올리거나(+) 내린다(−): 한 칸(±1)이 기본이고 한 옥타브(±7)도 쓴다. 비어 있으면 가운데 줄에서 시작한다.
 * 범위 끝에 닿지 않았는데 건너뛰면 끝까지만 가고, 이미 끝에 있으면 멈추고 이유를 말한다.
 */
export function terraceShiftResult(col: TerraceColumn, content: DraftContent, delta: number, showName: boolean): TerraceEditResult {
  const current = content.slots.find((s) => s.slot === col.draft)?.writtenPitch ?? null;
  if (!current) return terracePlaceResult(col, content, terraceStartStep(col), showName);
  const now = terraceStepOf(current);
  const next = Math.min(col.maxStep, Math.max(col.minStep, now + delta));
  if (next === now) {
    const where = describeStaffPosition(terracePositionOf(col.clef, now));
    return fail(`${col.label} 등은 더 ${delta > 0 ? '위로' : '아래로'} 옮길 수 없어요. 지금은 ${where}에 있어요.`);
  }
  return terracePlaceResult(col, content, next, showName);
}

const accidentalNowOf = (written: WrittenPitch): 'sharp' | 'flat' | null => (written.accidental === 'sharp' || written.accidental === 'flat' ? written.accidental : null);

/** 변화표 꼬리표를 바로 정한다(♭ 없음 ♯). 등이 없으면 먼저 놓으라고 알리고, 이미 그 변화표면 바꾸지 않고 말한다 */
export function terraceAccidentalSetResult(col: TerraceColumn, content: DraftContent, accidental: 'sharp' | 'flat' | null): TerraceEditResult {
  const current = content.slots.find((s) => s.slot === col.draft)?.writtenPitch ?? null;
  if (!current) return fail(`${col.label}: 먼저 등을 놓아 주세요. 변화표는 놓은 등에 달아요.`);
  if (accidentalNowOf(current) === accidental) return fail(`${col.label}: ${accidental === 'sharp' ? '이미 올림표가 달려 있어요.' : accidental === 'flat' ? '이미 내림표가 달려 있어요.' : '달린 변화표가 없어요.'}`);
  const written: WrittenPitch = { ...current, accidental };
  const spelled = spellWritten(written, col.keySignature);
  const word = accidental === 'sharp' ? '올림표를 달았어요' : accidental === 'flat' ? '내림표를 달았어요' : '변화표를 뗐어요';
  return { ok: true, edit: { type: 'setSlot', slot: col.draft, writtenPitch: written }, text: `${col.label} 등에 ${word}.`, midi: midiOf(spelled) };
}

/** 변화표 꼬리표를 한 칸 바꾼다(♭ 없음 ♯). 등이 없으면 먼저 놓으라고 알린다 */
export function terraceAccidentalResult(col: TerraceColumn, content: DraftContent, delta: 1 | -1): TerraceEditResult {
  const current = content.slots.find((s) => s.slot === col.draft)?.writtenPitch ?? null;
  if (!current) return fail(`${col.label}: 먼저 등을 놓아 주세요. 변화표는 놓은 등에 달아요.`);
  const now = accidentalNowOf(current);
  const shifted = shiftAccidental(now, delta);
  if (shifted === now) return fail(`${col.label}: 변화표를 더 ${delta > 0 ? '올릴' : '내릴'} 수 없어요.`);
  return terraceAccidentalSetResult(col, content, shifted === 'sharp' || shifted === 'flat' ? shifted : null);
}

/** 열의 등을 뺀다 */
export function terraceClearResult(col: TerraceColumn, content: DraftContent): TerraceEditResult {
  const current = content.slots.find((s) => s.slot === col.draft)?.writtenPitch ?? null;
  if (!current) return fail(`${col.label} 등은 이미 비어 있어요.`);
  return { ok: true, edit: { type: 'setSlot', slot: col.draft, writtenPitch: null }, text: `${col.label} 등을 뺐어요.`, midi: null };
}

// ───── 월드가 그리는 모습 ─────

/** 열 하나의 등: 월드가 그린다. 이름과 보표 위치는 설명 글이고, 월드는 높이(step)로 위치를 그린다 */
export interface TerraceMark {
  column: number;
  draft: number;
  label: string;
  clef: Clef;
  /** 등의 온음계 위치. 비었으면 null */
  step: number | null;
  /** 변화표 꼬리표 */
  accidental: Accidental | null;
  /** 이 열이 쓸 수 있는 높이 */
  minStep: number;
  maxStep: number;
  /** 놓인 음의 이름. 문제를 푸는 중에는 null이다(높이를 찾는 일이 문제이므로 이름을 밝히지 않는다). 자유로 놀기에서만 들어온다 */
  name: string | null;
  midi: number | null;
  flagged: boolean;
  playing: boolean;
}

export interface TerraceView {
  /** 판본이 쓰는 열들(왼쪽부터) */
  columns: TerraceMark[];
  /** 고른 열의 초안 칸 번호. 고르지 않았으면 null */
  cursor: number | null;
  /** 고른 열에서 등이 있는(놓으려는) 높이. 고른 열이 없으면 null */
  cursorStep: number | null;
  /** 자유로 놀기인가(이름을 밝힌다) */
  free: boolean;
}

export interface TerraceViewInput {
  cursor: number | null;
  flagged: ReadonlySet<number>;
  playing: ReadonlySet<number>;
  free: boolean;
}

/** 월드에 올릴 모습. flagged와 playing은 초안 칸 번호의 집합이다 */
export function terraceViewOf(columns: readonly TerraceColumn[], content: DraftContent, input: TerraceViewInput): TerraceView {
  const states = terraceStatesOf(columns, content);
  const marks = columns.map((col, i): TerraceMark => {
    const s = states[i]!;
    const acc = s.written?.accidental ?? null;
    return {
      column: col.column,
      draft: col.draft,
      label: col.label,
      clef: col.clef,
      step: s.step,
      accidental: acc === 'sharp' || acc === 'flat' ? acc : null,
      minStep: col.minStep,
      maxStep: col.maxStep,
      name: input.free ? s.name : null,
      midi: s.midi,
      flagged: input.flagged.has(col.draft),
      playing: input.playing.has(col.draft),
    };
  });
  const at = input.cursor === null ? undefined : marks.find((m) => m.draft === input.cursor);
  const cursorStep = at ? (at.step ?? terraceStartStep(at)) : null;
  return { columns: marks, cursor: at ? at.draft : null, cursorStep, free: input.free };
}

/** 판정이 가리킨 칸들(초안 칸 번호). 음이름 판정은 slotId로, 음계 순서 판정은 칸 번호(position)로 가리킨다 */
export function flaggedTerraceDrafts(columns: readonly TerraceColumn[], issues: ReadonlyArray<{ target?: { slotId?: string; position?: number } }>): number[] {
  const out = new Set<number>();
  for (const issue of issues) {
    const t = issue.target;
    if (!t) continue;
    const bySlot = t.slotId === undefined ? undefined : columns.find((c) => c.slotId === t.slotId);
    if (bySlot) out.add(bySlot.draft);
  }
  return [...out].sort((a, b) => a - b);
}

// ───── 자유로 놀기의 틀 ─────

/**
 * 자유로 놀기의 틀: 설치물이 다루는 음자리표마다 보표와 성부 하나, 열 여덟 개(목표가 아니라 틀이라 정답은 뜻이 없다).
 * 음자리표가 둘이면 높은음자리표 열과 낮은음자리표 열이 번갈아 선다(왼쪽부터): 이웃한 두 열에서 같은 높이를 바로 견줄 수 있다.
 * 계단밭이 아니거나 틀로 삼을 판본이 없으면 null이다. 변화표는 자유로 놀 때 쓴다(accidentals: 'mixed').
 */
export function freeTerraceFrameOf(inst: Pick<InstallationDef, 'quests'> & { slotMap?: SlotMapDef }, variantOf: (questId: string, variantId: string) => QuestVariant | undefined): QuestVariant | null {
  const map = terraceMapOf(inst);
  const ref = inst.quests[0];
  const base = map && ref ? variantOf(ref.questId, ref.variantIds[0] ?? '') : undefined;
  if (!map || !base) return null;
  const staves = map.clefs.map((clef, i) => ({ staffId: `s${i + 1}`, clef, keySignature: 0 }));
  const voices = staves.map((s, i) => ({ voiceId: `v${i + 1}`, staffId: s.staffId }));
  const targets = Array.from({ length: TERRACE_COLUMNS }, (_, i) => {
    const clef = map.clefs[i % map.clefs.length]!;
    return { slotId: `column-${i + 1}`, label: map.clefs.length > 1 ? `${i + 1}번 열 · ${CLEF_NAME_KO[clef]}` : `${i + 1}번 열`, expected: { letter: 'C' as Letter, alter: 0, octave: 4 }, clef };
  });
  return {
    ...base,
    challengeDescriptor: { ...base.challengeDescriptor, range: `${map.low}-${map.high}`, voices: staves.length, accidentals: 'mixed', input: 'placement' },
    score: { ...base.score, staves, voices, events: [] },
    evaluatorSpec: { type: 'pitchSpelling', targets },
  };
}

/** 이 판본은 변화표를 쓰는가: 자유로 놀기와, 조표나 임시표가 나오는 과제 */
export const terraceAccidentalsAllowed = (variant: Pick<QuestVariant, 'challengeDescriptor'>): boolean => variant.challengeDescriptor.accidentals !== 'none';

// ───── 밭의 돌담(월드가 그린다) ─────

/** 한 음자리표의 다섯 줄이 놓인 온음계 위치(아래에서 위로) */
export const terraceStaffSteps = (clef: Clef): number[] => {
  const bottom = terraceStepOf(CLEF_BOTTOM_LINE[clef]);
  return [0, 2, 4, 6, 8].map((p) => bottom + p);
};

/**
 * 밭이 영구히 두는 돌담의 온음계 위치(아래에서 위로)와 종류. 줄은 음자리표마다 다섯 개이고, 음자리표가 둘이면 두 보표 사이에 가운데 턱(C4, 위치 0)이 하나 선다.
 * 같은 턱이 높은음자리표의 아래 첫 덧줄이자 낮은음자리표의 위 첫 덧줄이다(3.5). 음자리표가 하나뿐인 밭은 턱을 두지 않는다.
 */
export function terraceFieldWalls(clefs: readonly Clef[]): Array<{ step: number; kind: 'line' | 'middle' }> {
  const out: Array<{ step: number; kind: 'line' | 'middle' }> = [];
  for (const clef of clefs) for (const step of terraceStaffSteps(clef)) out.push({ step, kind: 'line' });
  if (clefs.includes('treble') && clefs.includes('bass')) out.push({ step: 0, kind: 'middle' });
  return out.sort((a, b) => a.step - b.step);
}

/**
 * 놓은 음에 달리는 짧은 덧줄 돌담의 온음계 위치(보표에 가까운 쪽부터). 보표 밖의 줄(짝수 위치)을 놓은 음까지 긋는다:
 * 줄 위의 음은 그 줄까지, 칸의 음은 그 칸에서 보표 쪽으로 가장 가까운 줄까지다(악보의 덧줄과 같다). 보표 안과 보표 바로 옆 칸(−1, 9)은 덧줄이 없다.
 */
export function terraceLedgerSteps(clef: Clef, step: number): number[] {
  const bottom = terraceStepOf(CLEF_BOTTOM_LINE[clef]);
  const p = step - bottom;
  const out: number[] = [];
  if (p <= -2) for (let q = -2; q >= p; q -= 2) out.push(bottom + q);
  else if (p >= 10) for (let q = 10; q <= p; q += 2) out.push(bottom + q);
  return out;
}

// ───── 카메라 ─────

/** 카메라가 비추려는 것: 담을 전체(rect)와, 전체가 화면에 다 들어오지 않을 때 보여 줄 곳(focus) */
export interface TerraceFollow {
  rect: WorldRect;
  focus: { x: number; y: number };
}

/** 밭 전체의 사각형: 열들의 사각형에 글자 띠(위쪽 열 번호, 왼쪽 음자리표 조각상)를 더한 것 */
export function terraceBounds(inst: Pick<InstallationDef, 'slots'>): WorldRect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of inst.slots) {
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x + s.w);
    y1 = Math.max(y1, s.y + s.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0 - TERRACE_LABEL_LEFT, y: y0 - TERRACE_LABEL_TOP, w: x1 - x0 + TERRACE_LABEL_LEFT, h: y1 - y0 + TERRACE_LABEL_TOP };
}

/**
 * 계단밭을 담는 카메라의 목표(7-1d). 이름표 띠까지 포함한 밭 전체(rect)를 메뉴 띠 아래, 조작 막대 위에 담되 온음계 한 칸(48 px)이 화면에서 48 px 아래로 줄지 않게 한다.
 * 전체가 그 자리에 들어오면 followPose가 전체를 가운데에 담고(이때 focus는 읽지 않는다), 들어오지 않으면 고른 열의 등(없으면 시작 높이)을 비춘다:
 * 가로는 고른 열의 가운데, 세로는 등의 높이다. 고른 열이 없으면 밭 가운데다. 높이는 화면이 정해 다리에 올린 정수(cursorStep)이고 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3).
 * 계단밭이 아니면 null이다.
 */
export function terraceFollowOf(inst: Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef }, view?: Pick<TerraceView, 'cursor' | 'cursorStep' | 'columns'> | null): TerraceFollow | null {
  const map = terraceMapOf(inst);
  if (!map) return null;
  const rect = terraceBounds(inst);
  const col = view && view.cursor !== null ? view.columns.find((c) => c.draft === view.cursor) : undefined;
  const x = col ? terraceColumnX(inst, col.column) : null;
  const y = view && view.cursorStep !== null ? terraceYOfStep(map, view.cursorStep) : null;
  return { rect, focus: { x: x ?? rect.x + rect.w / 2, y: y ?? rect.y + rect.h / 2 } };
}
