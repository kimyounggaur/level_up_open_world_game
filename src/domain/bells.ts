// 4.6 종나무(T4)의 칸 계산: 설치물의 고리(가지 단 × 열)와 초안의 종 칸을 서로 바꾼다. 순수 계산이다.
// 초안은 패널(TriadPanel, InversionPanel, 연속 화음 패널)과 같다: 종 하나는 칸 하나(열)를 차지하고, 그 종의 옥타브가 걸린 단이다.
// 그래서 월드의 종나무에서 건 것이 패널에 그대로 보이고, 패널에서 건 것이 월드로 돌아오면 걸려 있다(초안 하나, 보는 방법 둘).
// 화면 좌표와 걸은 시간은 여기로 들어오지 못한다(W-3). 월드의 점은 slotAtPoint가 고리 번호로 바꾼 뒤에야 여기로 온다.
import type { QuestVariant } from './content';
import { evaluateChordEvent } from './evaluators/chordSequence';
import { INVERSION_NAME_KO } from './evaluators/inversion';
import { fillTemplate } from './feedback';
import { BELL_CELL_H, BELL_CELL_W, BELL_LABEL_LEFT, BELL_LABEL_TOP, slotBounds } from './installation';
import type { InstallationDef, SlotMapDef, WorldRect } from './installation';
import { midiOf, pitchName } from './pitch';
import type { SpelledPitch, WrittenPitch } from './pitch';
import { spellWritten } from './session';
import type { DraftContent, DraftEdit } from './session';
import { INVERSION_SLOT_COUNT, TRIAD_SLOT_COUNT, chordSequenceInputOf, hungTonesOfTree, lowestToneOf, octavesOfRange, sequenceSpecOf, toneCardsOf, treeBellsOf, treeSlot } from './slotplan';

export type BellMap = Extract<SlotMapDef, { kind: 'bellTree' }>;

/** 설치물의 종나무 변환표. 종나무가 아니면 null */
export function bellMapOf(inst: { slotMap?: SlotMapDef }): BellMap | null {
  return inst.slotMap?.kind === 'bellTree' ? inst.slotMap : null;
}

/** 고리 하나: 어느 나무의 어느 단(옥타브)·열인가. draft는 그 열의 초안 칸 번호다 */
export interface BellCell {
  /** 설치물의 고리 번호(1부터) */
  slot: number;
  tree: number;
  /** 맨 위 단이 0 */
  row: number;
  column: number;
  octave: number;
  /** 초안의 칸 번호(나무 × 열 수 + 열, 0부터) */
  draft: number;
}

/** 고리 번호(1부터)가 가리키는 나무·단·열. 범위 밖이면 null */
export function bellCellOf(map: BellMap, slot: number): BellCell | null {
  const rows = map.octaves.length;
  const total = map.trees * rows * map.columns;
  if (!Number.isInteger(slot) || slot < 1 || slot > total) return null;
  const i = slot - 1;
  const tree = Math.floor(i / (rows * map.columns));
  const row = Math.floor(i / map.columns) % rows;
  const column = i % map.columns;
  return { slot, tree, row, column, octave: map.octaves[row]!, draft: tree * map.columns + column };
}

/** 나무·옥타브·열의 고리 번호(1부터). 이 나무에 없는 단이면 null */
export function bellSlotOf(map: BellMap, tree: number, octave: number, column: number): number | null {
  const row = map.octaves.indexOf(octave);
  if (row < 0 || tree < 0 || tree >= map.trees || column < 0 || column >= map.columns) return null;
  return (tree * map.octaves.length + row) * map.columns + column + 1;
}

/** 초안 칸 번호가 가리키는 나무와 열 */
export function bellDraftPosition(map: BellMap, draft: number): { tree: number; column: number } | null {
  if (!Number.isInteger(draft) || draft < 0 || draft >= map.trees * map.columns) return null;
  return { tree: Math.floor(draft / map.columns), column: draft % map.columns };
}

/** 초안 칸의 개수(나무 × 열) */
export const bellDraftCount = (map: BellMap): number => map.trees * map.columns;

const TREE_ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

/** 나무 이름: 첫째 나무, 둘째 나무 … (빈터의 나무들은 길을 따라 선 차례다). 월드의 이름표와 화면의 문장이 같은 이름을 쓴다 */
export const bellTreeNameOf = (tree: number): string => `${TREE_ORDINALS[tree] ?? `${tree + 1}번째`} 나무`;

/** 설치물의 틀(자리와 변환표)만 있으면 되는 모양 */
export type BellHost = Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef };

/** 나무 한 그루가 차지하는 사각형: 고리 격자와 왼쪽의 옥타브 이름표 띠, 위쪽의 열 이름표 띠까지. 종나무가 아니거나 그루가 없으면 null */
export function bellTreeRect(inst: BellHost, tree: number): WorldRect | null {
  const map = bellMapOf(inst);
  if (!map || !Number.isInteger(tree) || tree < 0 || tree >= map.trees) return null;
  const first = bellSlotOf(map, tree, map.octaves[0]!, 0);
  const cell = first === null ? undefined : inst.slots.find((s) => s.slot === first);
  if (!cell) return null;
  return { x: cell.x - BELL_LABEL_LEFT, y: cell.y - BELL_LABEL_TOP, w: BELL_LABEL_LEFT + map.columns * BELL_CELL_W, h: BELL_LABEL_TOP + map.octaves.length * BELL_CELL_H };
}

/** 카메라가 비추려는 것: 담을 전체(rect)와, 전체가 화면에 다 들어오지 않을 때 보여 줄 곳(focus) */
export interface BellFollow {
  rect: WorldRect;
  focus: { x: number; y: number };
}

/** 카메라가 읽는 화면의 고름: 고른 열(초안 칸 번호)과, 그 열의 종이 걸리는(걸릴) 단의 옥타브 */
export type BellCursorView = Pick<BellView, 'cursor'> & Partial<Pick<BellView, 'cursorOctave'>>;

/**
 * 종나무를 담는 카메라의 목표(6-7c). 나무 하나(W1, W2), 종탑(W3), 빈터(W4) 모두 같은 규칙이다:
 * 이름표 띠까지 포함한 설치물 전체(slotBounds)를 메뉴 띠 아래, 조작 막대 위에 담되 고리 한 칸이 화면에서 48 px 아래로 줄지 않게 한다.
 * 전체가 그 자리에 들어오면 followPose가 전체를 가운데에 담고(이때 focus는 읽지 않는다), 들어오지 않으면 고른 칸을 비춘다:
 *   - 가로는 고른 나무의 가운데다. 가로로 넓은 빈터(1204 px)는 좁은 화면에서 한 번에 담으면 칸이 48 px 아래로 줄어서 나무 단위로 따라가고,
 *     같은 나무 안에서 열이 바뀔 때는 카메라가 움직이지 않는다.
 *   - 세로는 고른 종이 걸린(걸릴) 단의 가운데다. 조작 막대가 화면의 대부분을 가릴 만큼 크면(좁은 화면) ↑↓로 단을 옮길 때 카메라가 위아래로 따라간다.
 *     고른 단을 모르면 나무의 가운데다.
 * 고른 열이 없으면 첫째 나무다(첫 사건의 나무). 듣는 중에도 카메라는 고른 칸에 머문다(바퀴와 같다: 고르지 않은 쪽은 다시 골라서 본다).
 * 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3). 고른 열(cursor)은 화면이 정해 다리에 올린 것이다. 종나무가 아니면 null이다.
 */
export function bellFollowOf(inst: BellHost, view?: BellCursorView | null): BellFollow | null {
  const map = bellMapOf(inst);
  if (!map) return null;
  const cursor = view?.cursor ?? null;
  const tree = cursor === null ? 0 : Math.min(Math.max(0, Math.floor(cursor / map.columns)), map.trees - 1);
  const r = bellTreeRect(inst, tree);
  if (!r) return null;
  const octave = view?.cursorOctave ?? null;
  const row = octave === null ? -1 : map.octaves.indexOf(octave);
  const y = row < 0 ? r.y + r.h / 2 : r.y + BELL_LABEL_TOP + (row + 0.5) * BELL_CELL_H;
  return { rect: slotBounds(inst), focus: { x: r.x + r.w / 2, y } };
}

/** 이 판본의 종 칸 수가 나무의 열과 맞는가(구성음 4, 전위 3, 사건 목록 4) */
export function bellColumnsOf(variant: QuestVariant): number {
  return variant.evaluatorSpec.type === 'inversion' ? INVERSION_SLOT_COUNT : TRIAD_SLOT_COUNT;
}

/** 종 하나의 지금 모습. 걸린 종만 있다 */
export interface BellState {
  /** 초안의 칸 번호 */
  draft: number;
  tree: number;
  column: number;
  written: WrittenPitch;
  pitch: SpelledPitch;
  /** 음이름과 옥타브. 예: 'E♭4' */
  name: string;
  midi: number;
  octave: number;
  /** 소리를 껐는가(종탑) */
  muted: boolean;
  /** 울리는 종 가운데 가장 낮은 종인가(종탑에서만 알린다) */
  lowest: boolean;
}

/**
 * 걸린 종들(초안의 칸 번호 차례). 구성음 판본은 나무 하나의 종 넷 가운데 걸린 것, 사건 목록은 나무마다의 종, 전위(종탑)는 처음부터 걸려 있는 종 셋이다.
 * 종탑은 건드리지 않은 종도 처음 걸려 있던 기본 위치의 종으로 나온다(toneCardsOf).
 */
export function bellStatesOf(variant: QuestVariant, content: DraftContent): BellState[] {
  const spec = variant.evaluatorSpec;
  if (spec.type === 'inversion') {
    const cards = toneCardsOf(variant, content);
    const low = lowestToneOf(cards.filter((c) => !c.muted).map((c) => ({ slot: c.slot, pitch: c.pitch })));
    return cards.map((c) => ({ draft: c.slot, tree: 0, column: c.slot, written: c.written, pitch: c.pitch, name: c.name, midi: midiOf(c.pitch), octave: c.pitch.octave, muted: c.muted, lowest: low !== null && low.slot === c.slot }));
  }
  const trees = spec.type === 'chordSequence' ? spec.trees : spec.type === 'triadMembership' ? 1 : 0;
  const out: BellState[] = [];
  for (let tree = 0; tree < trees; tree++) {
    treeBellsOf(variant, content, tree).forEach((b, column) => {
      if (!b.written || !b.pitch) return;
      out.push({ draft: treeSlot(tree, column), tree, column, written: b.written, pitch: b.pitch, name: pitchName(b.pitch), midi: midiOf(b.pitch), octave: b.pitch.octave, muted: false, lowest: false });
    });
  }
  return out;
}

/** 이 판본에서 종이 걸리는 나무의 수 */
export function bellTreeCountOf(variant: QuestVariant): number {
  const spec = variant.evaluatorSpec;
  return spec.type === 'chordSequence' ? spec.trees : spec.type === 'triadMembership' || spec.type === 'inversion' ? 1 : 0;
}

/** 이 판본의 종 칸(열)이 처음부터 걸려 있는가. 종탑은 그렇고 나무는 비어 있다 */
export const bellsStartHung = (variant: QuestVariant): boolean => variant.evaluatorSpec.type === 'inversion';

/** 판정 문제가 가리키는 초안 칸 번호들('tone-N'). 놓은 것이 바뀌면 컨트롤러가 판정을 지우므로 오래된 표식은 남지 않는다 */
export function flaggedBellDrafts(issues: ReadonlyArray<{ target?: { slotId?: string } }>): number[] {
  const out = new Set<number>();
  for (const i of issues) {
    const m = /^tone-(\d+)$/.exec(i.target?.slotId ?? '');
    if (m) out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}

// ───── 월드가 그리는 모습 ─────

/** 월드가 종 하나를 그릴 때 알아야 하는 것 */
export interface BellMark {
  /** 이 종이 걸린 고리의 번호(1부터). 열과 옥타브에서 구한다 */
  slot: number;
  draft: number;
  tree: number;
  name: string;
  midi: number;
  muted: boolean;
  lowest: boolean;
  flagged: boolean;
  playing: boolean;
}

/** 종나무 설치물의 모습. 설치물의 slots(고리마다의 요약)에 더해, 월드가 종·고른 열·쓸 수 있는 가지를 그리는 데 쓴다 */
export interface BellView {
  form: BellMap['form'];
  /** 걸린 종들 */
  bells: BellMark[];
  /** 고른 열(초안 칸 번호). 고르지 않았으면 null */
  cursor: number | null;
  /** 고른 열에서 종이 걸리는(걸릴) 단의 옥타브. 고르지 않았으면 null */
  cursorOctave: number | null;
  /** 판본의 음역 안에 있는 단(맨 위부터). 나머지 단은 쓰지 않는 가지로 그린다 */
  usable: number[];
}

export interface BellViewInput {
  cursor: number | null;
  /** 고른 열에 아직 종이 없을 때 새 종이 걸릴 단 */
  ringOctave: number | null;
  flagged: ReadonlySet<number>;
  playing: ReadonlySet<number>;
}

/** 종 상태와 화면의 고름으로 월드의 모습을 만든다. 고리 번호를 구할 수 없는 종(나무에 없는 단)은 그리지 않는다 */
export function bellViewOf(map: BellMap, variant: QuestVariant, content: DraftContent, input: BellViewInput): BellView {
  const states = bellStatesOf(variant, content);
  const bells: BellMark[] = [];
  for (const s of states) {
    const slot = bellSlotOf(map, s.tree, s.octave, s.column);
    if (slot === null) continue;
    bells.push({ slot, draft: s.draft, tree: s.tree, name: s.name, midi: s.midi, muted: s.muted, lowest: s.lowest, flagged: input.flagged.has(s.draft), playing: input.playing.has(s.draft) });
  }
  const cursor = input.cursor;
  const hung = cursor === null ? undefined : states.find((s) => s.draft === cursor);
  return {
    form: map.form,
    bells,
    cursor,
    cursorOctave: cursor === null ? null : (hung?.octave ?? input.ringOctave),
    usable: map.octaves.filter((o) => octavesOfRange(variant.challengeDescriptor.range).includes(o)),
  };
}

/** 열의 종이 걸린 나무 하나의 울리는 음 높이들(지나가며 들리는 화음). 소리를 끈 종은 빠진다 */
export function treeChordMidis(view: BellView, tree: number): number[] {
  return view.bells.filter((b) => b.tree === tree && !b.muted).map((b) => b.midi);
}

/**
 * 화음의 전위를 알려 주기만 하는 안내(5.5 Q23 '구성음만 판정하고 전위는 알려 주기만 한다'). 통과한 뒤에 한 문장으로 말한다.
 * 판정에는 쓰이지 않는다: 같은 음을 읽어 reportTones가 있는 사건마다 지금의 전위를 말할 뿐이다. 구성음이 다 걸려 있지 않은 화음은 말하지 않고,
 * 알릴 사건이 없는 판본(Q21, 나무 하나, 종탑)은 null이다.
 */
export function chordShapeTextOf(variant: QuestVariant, content: DraftContent): string | null {
  if (variant.evaluatorSpec.type !== 'chordSequence') return null;
  const spec = sequenceSpecOf(variant);
  const input = chordSequenceInputOf(variant, content);
  const parts: Array<{ who: string; shape: string }> = [];
  for (const event of spec.events) {
    if (!event.reportTones) continue;
    const kind = evaluateChordEvent(event, input.trees[event.tree] ?? []).result.inversion;
    if (kind) parts.push({ who: fillTemplate('{label:은는}', { label: event.label }), shape: INVERSION_NAME_KO[kind] });
  }
  const last = parts[parts.length - 1];
  if (!last) return null;
  const items = [...parts.slice(0, -1).map((x) => `${x.who} ${x.shape}`), fillTemplate('{who} {shape:이에요}', last)];
  return `전위는 판정하지 않고 알려만 줘요. ${items.join(', ')}.`;
}

/** 나무 하나에 걸린 종들을 판본의 음이름 그대로 나열한다(안내 문장용). 예: 'C4 E4 G4' */
export function treeChordText(variant: QuestVariant, content: DraftContent, tree: number): string {
  return hungTonesOfTree(variant, content, tree)
    .map((t) => pitchName(t.pitch))
    .join(' ');
}

/** 기보 음이 판본의 조표를 따라 어떤 소리인가(종탑·나무의 종은 조표 없이 쓴다) */
export function bellPitchOf(variant: QuestVariant, written: WrittenPitch): SpelledPitch {
  return spellWritten(written, variant.score.staves[0]?.keySignature ?? 0);
}

// ───── 종 하나를 거는 일(작업대와 판이 같은 계산을 쓴다) ─────

/** 판본의 음역 안에서 종을 걸 수 있는 옥타브(작은 것부터) */
export const bellOctavesOf = (variant: QuestVariant): number[] => octavesOfRange(variant.challengeDescriptor.range);

function rangeText(variant: QuestVariant): string {
  const [from, to] = variant.challengeDescriptor.range.split('-');
  return `${from}부터 ${to ?? from}까지`;
}

const keySignatureOf = (variant: QuestVariant): number => variant.score.staves[0]?.keySignature ?? 0;

/** 종 하나를 고친 결과: 초안의 편집(바뀌는 것이 없으면 null)과 화면 낭독용 문장. 고칠 수 없으면 이유만 돌려준다 */
export type BellEditResult = { ok: true; edit: DraftEdit | null; text: string } | { ok: false; text: string };

/** 종 칸(draft)에 음을 건다. 이미 같은 음이 걸려 있으면 편집 없이 문장만 돌려준다. 음역 밖의 옥타브는 걸 수 없다 */
export function bellHangResult(variant: QuestVariant, content: DraftContent, draft: number, label: string, written: WrittenPitch): BellEditResult {
  if (!bellOctavesOf(variant).includes(written.octave)) return { ok: false, text: `${label}: ${written.octave}옥타브는 이 도전의 음역 밖이에요. 음역은 ${rangeText(variant)}예요.` };
  const name = pitchName(spellWritten(written, keySignatureOf(variant)));
  const current = content.slots.find((s) => s.slot === draft)?.writtenPitch ?? null;
  if (current && current.letter === written.letter && current.accidental === written.accidental && current.octave === written.octave) {
    return { ok: true, edit: null, text: fillTemplate('{label}: 이미 {name:이에요}.', { label, name }) };
  }
  return { ok: true, edit: { type: 'setSlot', slot: draft, writtenPitch: written }, text: fillTemplate('{label}: {name:으로로} {verb}.', { label, name, verb: current ? '바꿨어요' : '걸었어요' }) };
}

/** 걸린 종의 높이(옥타브)를 한 단 올리거나 내린다. 음역 밖으로는 나가지 않는다 */
export function bellShiftResult(variant: QuestVariant, content: DraftContent, draft: number, label: string, delta: 1 | -1): BellEditResult {
  const current = content.slots.find((s) => s.slot === draft)?.writtenPitch ?? null;
  if (!current) return { ok: false, text: `${label}: 걸린 종이 없어요. 먼저 종을 걸어 주세요.` };
  const octave = current.octave + delta;
  if (!bellOctavesOf(variant).includes(octave)) return { ok: false, text: `${label}: 더 ${delta > 0 ? '높이 올릴' : '낮게 내릴'} 수 없어요. 이 도전의 음역은 ${rangeText(variant)}예요.` };
  const moved: WrittenPitch = { ...current, octave };
  const name = pitchName(spellWritten(moved, keySignatureOf(variant)));
  return { ok: true, edit: { type: 'setSlot', slot: draft, writtenPitch: moved }, text: fillTemplate('{label}: {name:으로로} {verb}.', { label, name, verb: delta > 0 ? '올렸어요' : '내렸어요' }) };
}

/** 종 칸을 비운다(나무의 종을 뺀다). 이미 비어 있으면 편집 없이 문장만 돌려준다 */
export function bellClearResult(content: DraftContent, draft: number, label: string): BellEditResult {
  if (!content.slots.some((s) => s.slot === draft && s.writtenPitch)) return { ok: true, edit: null, text: fillTemplate('{label:은는} 이미 비어 있어요.', { label }) };
  return { ok: true, edit: { type: 'setSlot', slot: draft, writtenPitch: null }, text: fillTemplate('{label:을를} 뺐어요.', { label }) };
}

/** 종이 없는 열을 고를 때 가지 표시가 처음 놓이는 단: 음역 안의 단 가운데 4옥타브에 가장 가까운 단 */
export function defaultRingOctave(map: BellMap, variant: QuestVariant): number {
  const inRange = bellOctavesOf(variant);
  const usable = map.octaves.filter((o) => inRange.includes(o));
  const pool = usable.length > 0 ? usable : [...map.octaves];
  return [...pool].sort((a, b) => Math.abs(a - 4) - Math.abs(b - 4) || a - b)[0]!;
}

/**
 * 자유로 놀기의 틀: 설치물이 다루는 첫 과제의 첫 판본에서 가져오되, 음역을 가지 전체(맨 아래 단부터 맨 위 단까지)로 넓힌다.
 * 판정과 목표가 없으므로 판본의 음역은 쓰지 않는 가지를 가리는 것 말고는 의미가 없다. 종나무가 아니면 null.
 */
export function freeBellFrameOf(inst: Pick<InstallationDef, 'quests'> & { slotMap?: SlotMapDef }, variantOf: (questId: string, variantId: string) => QuestVariant | undefined): QuestVariant | null {
  const map = bellMapOf(inst);
  const ref = inst.quests[0];
  const base = map && ref ? variantOf(ref.questId, ref.variantIds[0] ?? '') : undefined;
  if (!map || !base) return null;
  return { ...base, challengeDescriptor: { ...base.challengeDescriptor, range: `C${Math.min(...map.octaves)}-B${Math.max(...map.octaves)}` } };
}
