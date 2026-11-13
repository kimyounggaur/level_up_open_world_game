// 7-3 건반 다리(T6, 설계서 4.8)의 칸 계산: 설치물의 널(건반)과 초안의 칸을 서로 바꾼다. 순수 계산이다.
// 널 하나가 자리 하나이고 번호는 소리 높이 차례다(가장 낮은 널이 1번, 반음마다 한 장). 흰 널(72×240) 사이에 검은 널(44×150)이 흰 널 경계 위에 선다.
// 널을 밟으면 그 널의 음이 울린다(널의 소리는 널이 정한다). 과제 재료는 세 가지다:
//   이름 과제(pitchSpelling, 음자리표 없는 이름표 판본): 검은 널마다 이름표 자리가 둘이다. 왼쪽 흰 널에서 올려 부른 이름(♯)과 오른쪽 흰 널에서 내려 부른 이름(♭).
//   음정 과제(interval): 시작 말뚝은 널에 박혀 있고 끝 말뚝을 널에 꽂는다. 밧줄이 지나간 음이름 수(도수)와 널 수(반음 수)를 함께 보여 준다.
//   임시표 과제(orderedScale, 방향 'sequence'): 표지판의 악보를 보고 실제로 울릴 널에 순서 깃발(1부터)을 꽂는다. 깃발은 이름이 아니라 소리 높이(MIDI)만 갖는다.
// 초안은 패널(이름표 패널, 음정 패널, 건반 고르기)과 같다. 판정기로 넘어가는 값은 기보 음과 널의 MIDI뿐이고 월드 좌표와 걸은 시간은 들어오지 못한다(W-3).
import type { QuestVariant } from './content';
import { expectedPitchesOf } from './evaluators/orderedScale';
import type { IntervalQuestion } from './evaluators/interval';
import type { InstallationDef, SlotMapDef, SlotRect, WorldRect } from './installation';
import { LETTER_PC, LETTERS, alterSymbol, diatonicIndex, midiOf, midiToSharpName, parsePitch } from './pitch';
import type { Letter, SpelledPitch, WrittenPitch } from './pitch';
import type { DraftContent, DraftEdit } from './session';
import { spellWritten } from './session';
import { intervalSlotsOf, nameTagPlanOf, isNameTagVariant } from './slotplan';
import type { IntervalSlotPlan } from './slotplan';
import { fillTemplate } from './feedback';

/** 흰 널 72×240, 검은 널 44×150(4.8). 검은 널은 흰 널 경계 위에 걸치고 위쪽 끝이 맞는다 */
export const PLANK_WHITE_W = 72;
export const PLANK_WHITE_H = 240;
export const PLANK_BLACK_W = 44;
export const PLANK_BLACK_H = 150;
/** 널 위쪽의 띠: 이름표 자리, 말뚝과 밧줄, 깃발, 악보 표지판이 서는 곳. 널 아래쪽 띠는 흰 널의 이름이다 */
export const BRIDGE_BAND_TOP = 168;
export const BRIDGE_BAND_BOTTOM = 40;
/** 다리를 담을 때 둘레의 여유(월드 px)와 카메라 배율의 하한: 흰 널 한 장(72 px)이 화면에서 48 px 아래로 줄지 않는다(7.6) */
export const BRIDGE_FRAME_PAD = 32;
export const BRIDGE_MIN_ZOOM = 48 / PLANK_WHITE_W;

export type KeyBridgeMap = Extract<SlotMapDef, { kind: 'keyBridge' }>;

/** 설치물의 건반 다리 변환표. 건반 다리가 아니면 null */
export function keyBridgeMapOf(inst: { slotMap?: SlotMapDef }): KeyBridgeMap | null {
  return inst.slotMap?.kind === 'keyBridge' ? inst.slotMap : null;
}

const WHITE_STEPS = [2, 2, 1, 2, 2, 2, 1] as const; // C D E F G A B 사이의 반음 수
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11] as const;

export interface Plank {
  /** 설치물의 자리 번호(1부터, 낮은 널부터) */
  slot: number;
  midi: number;
  black: boolean;
  /** 이 널이 선 흰 널의 차례(0부터). 검은 널은 바로 왼쪽의 흰 널의 차례다 */
  whiteIndex: number;
  /** 널의 이름. 흰 널은 'C4', 검은 널은 올림 이름 'C♯4' */
  name: string;
}

const isWhiteMidi = (midi: number): boolean => (WHITE_PCS as readonly number[]).includes(((midi % 12) + 12) % 12);

/** 널의 소리 높이는 낮은 것부터 반음마다 한 장이다. 가장 낮은 널과 흰 널의 수가 정하면 나머지가 모두 정해진다 */
export function planksOf(map: Pick<KeyBridgeMap, 'lowMidi' | 'whiteCount'>): Plank[] {
  const out: Plank[] = [];
  if (!isWhiteMidi(map.lowMidi) || map.whiteCount < 1) return out;
  let midi = map.lowMidi;
  for (let w = 0; w < map.whiteCount; w++) {
    out.push({ slot: out.length + 1, midi, black: false, whiteIndex: w, name: midiToSharpName(midi) });
    const next = WHITE_STEPS[WHITE_PCS.indexOf((((midi % 12) + 12) % 12) as (typeof WHITE_PCS)[number])]!;
    if (w < map.whiteCount - 1 && next === 2) out.push({ slot: out.length + 1, midi: midi + 1, black: true, whiteIndex: w, name: midiToSharpName(midi + 1) });
    midi += next;
  }
  return out;
}

/**
 * 판본의 음역('C4-C5')이 정하는 널들. 월드의 다리가 없는 패널이 같은 널을 쓰게 한다(다리의 lowMidi와 whiteCount는 같은 음역에서 나온다).
 * 음역이 흰 건반에서 시작해 흰 건반에서 끝나지 않으면 null이다.
 */
export function planksOfRange(range: string): Plank[] | null {
  const [from, to] = range.split('-');
  if (!from || !to) return null;
  let low: SpelledPitch;
  let high: SpelledPitch;
  try {
    low = parsePitch(from);
    high = parsePitch(to);
  } catch {
    return null;
  }
  if (low.alter !== 0 || high.alter !== 0) return null;
  const whiteCount = diatonicIndex(high) - diatonicIndex(low) + 1;
  return whiteCount >= 1 ? planksOf({ lowMidi: midiOf(low), whiteCount }) : null;
}

/** 널의 사각형(월드 px). 원점은 가장 낮은 흰 널의 왼쪽 위 */
export function plankRect(p: Plank, origin: { x: number; y: number }): SlotRect {
  if (!p.black) return { slot: p.slot, x: origin.x + p.whiteIndex * PLANK_WHITE_W, y: origin.y, w: PLANK_WHITE_W, h: PLANK_WHITE_H };
  return { slot: p.slot, x: origin.x + (p.whiteIndex + 1) * PLANK_WHITE_W - PLANK_BLACK_W / 2, y: origin.y, w: PLANK_BLACK_W, h: PLANK_BLACK_H };
}

export const isBlackRect = (r: Pick<SlotRect, 'w' | 'h'>): boolean => r.w === PLANK_BLACK_W && r.h === PLANK_BLACK_H;

/** 설치물의 널들(자리 번호 차례). 자리 목록과 변환표가 맞지 않으면 빈 목록이다 */
export function planksOfInstallation(inst: Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef }): Array<Plank & { rect: SlotRect }> {
  const map = keyBridgeMapOf(inst);
  if (!map) return [];
  const planks = planksOf(map);
  return planks.map((p) => ({ ...p, rect: inst.slots.find((s) => s.slot === p.slot) ?? plankRect(p, { x: 0, y: 0 }) }));
}

/** 널 자리의 검사: 개수와 모양이 변환표와 맞고, 널이 정해진 자리에 서 있다. 문제를 글로 돌려준다 */
export function bridgeSlotProblems(inst: Pick<InstallationDef, 'slots'>, map: Pick<KeyBridgeMap, 'lowMidi' | 'whiteCount'>): string[] {
  const planks = planksOf(map);
  if (planks.length === 0) return [`가장 낮은 널(${map.lowMidi})은 흰 건반이어야 하고 흰 널은 1장 이상이어요`];
  if (inst.slots.length !== planks.length) return [`널은 ${planks.length}장이어야 해요(자리 ${inst.slots.length}개)`];
  const first = inst.slots.find((s) => s.slot === 1);
  if (!first) return ['1번 널이 없어요'];
  const problems: string[] = [];
  for (const p of planks) {
    const want = plankRect(p, { x: first.x, y: first.y });
    const got = inst.slots.find((s) => s.slot === p.slot);
    if (!got || got.x !== want.x || got.y !== want.y || got.w !== want.w || got.h !== want.h) {
      problems.push(`${p.slot}번 널(${p.name})은 ${p.black ? '검은' : '흰'} 널이라 x ${want.x}, y ${want.y}, 가로 ${want.w}, 세로 ${want.h}에 서야 해요`);
      if (problems.length >= 3) break;
    }
  }
  return problems;
}

/** 다리 전체와 둘레의 띠(위: 이름표·밧줄·깃발·표지판, 아래: 흰 널 이름)를 감싸는 사각형 */
export function bridgeBounds(inst: Pick<InstallationDef, 'slots'>): WorldRect {
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
  return { x: x0, y: y0 - BRIDGE_BAND_TOP, w: x1 - x0, h: y1 - y0 + BRIDGE_BAND_TOP + BRIDGE_BAND_BOTTOM };
}

/** 카메라가 다리를 비출 때 알아야 하는 화면: 크기와 조작 막대가 가리는 높이(화면 px) */
export interface BridgeScreen {
  width: number;
  height: number;
  bottomInset: number;
}

/**
 * 다리 전체(위쪽 띠와 아래쪽 이름 띠까지)가 흰 널 한 장을 48 px로 보이는 배율(BRIDGE_MIN_ZOOM)에서 이 화면의 조작 막대 위에 다 들어오는가.
 * 너비는 둘레의 여유(BRIDGE_FRAME_PAD)까지 보고, 높이는 띠만 본다(위쪽 띠의 이름표와 표지판은 널 위 168 px 안에 있어서 여유 32 px는 비어 있다).
 * 막대 높이는 카메라(followPose)와 같게 화면의 9할까지만 믿는다.
 */
export function bridgeFitsScreen(rect: Pick<WorldRect, 'w' | 'h'>, screen: BridgeScreen): boolean {
  const inset = Math.min(Math.max(0, screen.bottomInset), screen.height * 0.9);
  return screen.width >= (rect.w + 2 * BRIDGE_FRAME_PAD) * BRIDGE_MIN_ZOOM && screen.height - inset >= rect.h * BRIDGE_MIN_ZOOM;
}

/** 카메라가 비추려는 것: 담을 전체(rect), 전체가 화면에 다 들어오지 않을 때 보여 줄 곳(focus), 위쪽 메뉴 띠를 비워 두어야 하는가(reserveMenu) */
export interface BridgeFollow {
  rect: WorldRect;
  focus: { x: number; y: number };
  reserveMenu: boolean;
}

/**
 * 건반 다리를 담는 카메라의 목표(7-3, 설계서 7.3). 띠까지 포함한 다리 전체(rect)를 조작 막대 위에 담되, 흰 널 한 장이 화면에서 48 px 아래로 줄지 않게 한다.
 * 전체가 그 배율로 화면에 들어오면(bridgeFitsScreen) focus는 다리 전체의 가운데이고 followPose가 다리 전체를 가운데에 담는다: 어느 널을 골라도 같은 자세다.
 * 가운데로 두는 것은 followPose가 둘레의 여유(32 px)까지는 담지 못하는 높이에서도 위쪽 띠가 잘리지 않게 하려는 것이다(여유가 있는 쪽을 자르고 띠 전체는 남긴다).
 * 들어오지 않는 화면(좁은 휴대폰, 조작 막대가 높은 작은 화면)에서는 고른 널을 따라간다:
 * 가로는 널 위 커서가 선 널의 가운데(커서가 없으면 다리 가운데), 세로는 흰 널 줄의 가운데다. 높이가 모자라면 누르는 대상인 널이 먼저 보이고 위쪽 띠가 잘린다.
 * 위쪽 메뉴 띠(MENU_BAND)는 다리가 화면에 다 들어오지 않을 때만 비운다: 다 들어오는 화면(노트북, 태블릿 가로)에서는 메뉴가 오른쪽 위 구석에만 있고 위쪽 띠의 이름표와 표지판은 왼쪽과 가운데에 있어서,
 * 띠를 비우면 흰 널의 이름 띠가 잘린다. 다 들어오지 않는 화면(휴대폰 세로는 메뉴가 위쪽 전체, 휴대폰 가로는 오른쪽 위 메뉴 단추가 널 위에 겹친다)에서는 널이 메뉴 단추 뒤로 가려지지 않게 띠 아래에 비춘다.
 * 커서는 화면이 정해 다리에 올린 널 번호이고 걸은 시간이나 캐릭터 위치는 읽지 않는다(W-3). 건반 다리가 아니면 null이다.
 */
export function bridgeFollowOf(inst: Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef }, view: Pick<KeyBridgeView, 'cursor'> | null | undefined, screen: BridgeScreen): BridgeFollow | null {
  const planks = planksOfInstallation(inst);
  if (planks.length === 0) return null;
  const rect = bridgeBounds(inst);
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const fits = bridgeFitsScreen(rect, screen);
  if (fits) return { rect, focus: center, reserveMenu: false };
  const at = view && view.cursor !== null ? planks.find((p) => p.slot === view.cursor) : undefined;
  const whites = planks.filter((p) => !p.black).map((p) => p.rect);
  const rowTop = Math.min(...whites.map((r) => r.y));
  const rowBottom = Math.max(...whites.map((r) => r.y + r.h));
  return { rect, focus: { x: at ? at.rect.x + at.rect.w / 2 : center.x, y: (rowTop + rowBottom) / 2 }, reserveMenu: true };
}

/** 널의 가운데 위쪽(밧줄·깃발이 꽂히는 윗면)의 월드 좌표 */
export function plankTop(rect: SlotRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y };
}

// ───── 널 하나와 소리 높이 ─────

/** 소리 높이로 널 찾기 */
export const plankOfMidi = (planks: readonly Plank[], midi: number): Plank | undefined => planks.find((p) => p.midi === midi);

/** 널의 쓰는 이름: 올림 이름과 내림 이름. 검은 널은 둘이고 흰 널은 하나다 */
export function plankNames(p: Plank): string[] {
  if (!p.black) return [p.name];
  const lower = LETTERS[LETTERS.findIndex((l) => LETTER_PC[l] === ((p.midi - 1) % 12 + 12) % 12)]!;
  const upper = LETTERS[LETTERS.findIndex((l) => LETTER_PC[l] === ((p.midi + 1) % 12 + 12) % 12)]!;
  const octave = Math.floor(p.midi / 12) - 1;
  return [`${lower}♯${octave}`, `${upper}♭${octave}`];
}

/** 이름표 하나: 글자와 변화. 널 위에 걸 수 있는 열 개(검은 널의 이름 다섯 쌍) */
export interface NameTag {
  letter: Letter;
  accidental: 'sharp' | 'flat';
  /** 'C♯', 'D♭' */
  text: string;
}

export const NAME_TAGS: readonly NameTag[] = [
  { letter: 'C', accidental: 'sharp', text: 'C♯' },
  { letter: 'D', accidental: 'flat', text: 'D♭' },
  { letter: 'D', accidental: 'sharp', text: 'D♯' },
  { letter: 'E', accidental: 'flat', text: 'E♭' },
  { letter: 'F', accidental: 'sharp', text: 'F♯' },
  { letter: 'G', accidental: 'flat', text: 'G♭' },
  { letter: 'G', accidental: 'sharp', text: 'G♯' },
  { letter: 'A', accidental: 'flat', text: 'A♭' },
  { letter: 'A', accidental: 'sharp', text: 'A♯' },
  { letter: 'B', accidental: 'flat', text: 'B♭' },
];

/** 이름표가 걸린 널의 가까운 옥타브: 널의 소리 높이에 가장 가까운 같은 이름의 음이 이름표의 음이다 */
export function tagPitchNear(tag: Pick<NameTag, 'letter' | 'accidental'>, midi: number): WrittenPitch {
  const alter = tag.accidental === 'sharp' ? 1 : -1;
  let best = 4;
  let bestD = Infinity;
  for (let o = 0; o <= 8; o++) {
    const d = Math.abs(midiOf({ letter: tag.letter, alter, octave: o }) - midi);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return { letter: tag.letter, accidental: tag.accidental, octave: best };
}

// ───── 과제의 종류 ─────
export type BridgeTask = 'names' | 'interval' | 'flags';

/** 이 판본을 건반 다리에서 풀 수 있는 종류. 풀 수 없으면 null */
export function bridgeTaskOf(variant: QuestVariant): BridgeTask | null {
  const spec = variant.evaluatorSpec;
  if (spec.type === 'pitchSpelling') return isNameTagVariant(variant) ? 'names' : null;
  if (spec.type === 'interval') return 'interval';
  if (spec.type === 'orderedScale') return spec.direction === 'sequence' ? 'flags' : null;
  return null;
}

// --- 이름 과제: 이름표 자리

export interface TagSpot {
  /** 초안의 칸 번호(0부터) */
  draft: number;
  slotId: string;
  label: string;
  /** 이 자리가 서 있는 검은 널의 자리 번호 */
  plank: number;
  midi: number;
  /** 'raised' = 왼쪽 흰 널에서 올려 부른 이름(♯), 'lowered' = 오른쪽 흰 널에서 내려 부른 이름(♭) */
  side: 'raised' | 'lowered';
}

export function tagSpotsOf(variant: QuestVariant, planks: readonly Plank[]): TagSpot[] | null {
  if (bridgeTaskOf(variant) !== 'names') return null;
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'pitchSpelling') return null;
  const plan = nameTagPlanOf(variant);
  const out: TagSpot[] = [];
  for (const [i, t] of spec.targets.entries()) {
    const midi = midiOf(t.expected);
    const plank = plankOfMidi(planks, midi);
    if (!plank || !plank.black) return null;
    out.push({ draft: plan.slots[i]!.slot, slotId: t.slotId, label: t.label, plank: plank.slot, midi, side: t.expected.alter >= 0 ? 'raised' : 'lowered' });
  }
  return out;
}

export interface BridgeEditResult {
  ok: boolean;
  edit: DraftEdit | null;
  text: string;
  /** 들려 줄 소리 높이 */
  midi: number | null;
}

/** 이름표를 자리에 건다(또는 같은 이름표면 그대로 둔다) */
export function tagHangResult(content: DraftContent, spot: TagSpot, tag: NameTag): BridgeEditResult {
  const written = tagPitchNear(tag, spot.midi);
  const cur = content.slots.find((s) => s.slot === spot.draft)?.writtenPitch ?? null;
  const midi = midiOf(spellWritten(written, 0));
  const name = `${tag.text}`;
  if (cur && cur.letter === written.letter && cur.accidental === written.accidental) {
    return { ok: true, edit: null, text: fillTemplate('{label}: 이미 {name} 이름표가 걸려 있어요.', { label: spot.label, name }), midi };
  }
  return { ok: true, edit: { type: 'setSlot', slot: spot.draft, writtenPitch: written }, text: fillTemplate('{label}에 {name} 이름표를 {verb}.', { label: spot.label, name, verb: cur ? '바꿔 걸었어요' : '걸었어요' }), midi };
}

export function tagClearResult(content: DraftContent, spot: TagSpot): BridgeEditResult {
  const cur = content.slots.find((s) => s.slot === spot.draft)?.writtenPitch ?? null;
  if (!cur) return { ok: true, edit: null, text: fillTemplate('{label}: 이미 비어 있어요.', { label: spot.label }), midi: null };
  return { ok: true, edit: { type: 'setSlot', slot: spot.draft, writtenPitch: null }, text: fillTemplate('{label}의 이름표를 뗐어요.', { label: spot.label }), midi: null };
}

/** 자리에 걸린 이름표의 글자. 걸리지 않았으면 null */
export function hungTagText(content: DraftContent, draft: number): string | null {
  const w = content.slots.find((s) => s.slot === draft)?.writtenPitch;
  return w ? `${w.letter}${alterSymbol(w.accidental === 'sharp' ? 1 : w.accidental === 'flat' ? -1 : 0)}` : null;
}

// --- 음정 과제: 밧줄

export interface BridgeQuestion {
  qid: string;
  kind: IntervalQuestion['kind'];
  label: string;
  /** 이 질문의 초안 칸들(질문마다 1–2개) */
  parts: IntervalSlotPlan[];
  /** 시작 말뚝이 박힌 널 */
  startPlank: number;
  /** 끝 말뚝이 박힌 널. 음 쌓기는 사용자가 꽂을 때까지 없다. 비교는 두 번째 음(b)의 널이다 */
  fixedEndPlank: number | null;
  question: IntervalQuestion;
}

export function bridgeQuestionsOf(variant: QuestVariant, planks: readonly Plank[]): BridgeQuestion[] | null {
  if (bridgeTaskOf(variant) !== 'interval') return null;
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'interval') return null;
  const slots = intervalSlotsOf(variant);
  const out: BridgeQuestion[] = [];
  for (const q of spec.questions) {
    const start = q.kind === 'compare' ? q.a : q.from;
    const end = q.kind === 'compare' ? q.b : q.kind === 'identify' ? q.to : null;
    const sp = plankOfMidi(planks, midiOf(start));
    const ep = end ? plankOfMidi(planks, midiOf(end)) : undefined;
    if (!sp || (end && !ep)) return null;
    out.push({ qid: q.qid, kind: q.kind, label: q.label, parts: slots.filter((s) => s.qid === q.qid), startPlank: sp.slot, fixedEndPlank: ep ? ep.slot : null, question: q });
  }
  return out;
}

/**
 * 밧줄이 지나간 도수와 반음 수. 도수는 두 널의 이름의 글자 사이(양 끝 포함)이고 반음 수는 널 수의 차이다.
 * 이름은 쓰는 쪽이 고른다(널 하나가 이름 둘을 가질 수 있다): 위쪽 이름이 정해지지 않았으면 도수는 없다(null).
 */
export function ropeReadout(from: SpelledPitch, to: SpelledPitch | null, toMidi: number): { degree: number | null; semitones: number } {
  const semitones = Math.abs(toMidi - midiOf(from));
  if (!to) return { degree: null, semitones };
  const idx = (p: SpelledPitch): number => p.octave * 7 + LETTERS.indexOf(p.letter);
  return { degree: Math.abs(idx(to) - idx(from)) + 1, semitones };
}

export function ropeText(r: { degree: number | null; semitones: number }): string {
  return r.degree === null ? `반음 ${r.semitones}개` : `${r.degree}도 · 반음 ${r.semitones}개`;
}

/** 음 쌓기에서 끝 말뚝을 널에 꽂을 때 처음 쓰는 이름: 흰 널은 자기 이름, 검은 널은 올림 이름 */
export function stakeWrittenAt(p: Pick<Plank, 'midi'>): WrittenPitch {
  const name = midiToSharpName(p.midi);
  const m = /^([A-G])(♯?)(-?\d+)$/.exec(name)!;
  return { letter: m[1] as Letter, accidental: m[2] ? 'sharp' : null, octave: parseInt(m[3]!, 10) };
}

/** 한 널을 가리키는 쓸 수 있는 이름들(올림·내림·제자리, 겹임시표 없음). 옥타브는 널에 맞춘다 */
export function namesForMidi(midi: number): WrittenPitch[] {
  const out: WrittenPitch[] = [];
  for (const letter of LETTERS) {
    for (const accidental of [null, 'sharp', 'flat'] as const) {
      const alter = accidental === 'sharp' ? 1 : accidental === 'flat' ? -1 : 0;
      for (let octave = Math.floor(midi / 12) - 2; octave <= Math.floor(midi / 12); octave++) {
        if (midiOf({ letter, alter, octave }) === midi) out.push({ letter, accidental, octave });
      }
    }
  }
  return out;
}

export function stakeNameOf(w: WrittenPitch): string {
  return `${w.letter}${w.accidental === 'sharp' ? '♯' : w.accidental === 'flat' ? '♭' : ''}${w.octave}`;
}

// --- 임시표 과제: 순서 깃발

export interface FlagSpot {
  /** 초안의 칸 번호이자 깃발의 순서(1부터) */
  draft: number;
  order: number;
  /** 지금 꽂힌 널의 자리 번호. 꽂지 않았으면 null */
  plank: number | null;
}

export function flagCountOf(variant: QuestVariant): number {
  const spec = variant.evaluatorSpec;
  return spec.type === 'orderedScale' ? spec.count : 0;
}

/** 깃발들: 칸에 담긴 소리 높이(midi)가 꽂힌 널이다 */
export function flagSpotsOf(variant: QuestVariant, content: DraftContent, planks: readonly Plank[]): FlagSpot[] | null {
  if (bridgeTaskOf(variant) !== 'flags') return null;
  return Array.from({ length: flagCountOf(variant) }, (_, i) => {
    const entry = content.slots.find((s) => s.slot === i + 1);
    const plank = entry?.midi !== undefined ? plankOfMidi(planks, entry.midi) : undefined;
    return { draft: i + 1, order: i + 1, plank: plank ? plank.slot : null };
  });
}

/**
 * 깃발을 널에 꽂는 편집. 같은 널이면 그대로 둔다.
 * 널은 문제를 푸는 중의 말로 부른다(plankSpeakOf: 흰 널은 이름, 검은 널은 이웃한 흰 널). 깃발 과제는 '어떤 소리가 나는가'를 묻는데,
 * 꽂을 때마다 검은 널의 이름(F♯4)을 읽어 주면 월드가 그리지 않는 이름을 낭독으로만 알려 주게 된다(월드는 문제를 푸는 중 검은 널의 이름을 쓰지 않는다).
 */
export function flagPlantResult(content: DraftContent, flag: FlagSpot, plank: Plank): BridgeEditResult {
  const where = plankSpeakOf(plank, false);
  if (flag.plank === plank.slot) {
    return { ok: true, edit: null, text: fillTemplate('{order}번 깃발은 이미 {where}에 있어요.', { order: flag.order, where }), midi: plank.midi };
  }
  const had = content.slots.find((s) => s.slot === flag.draft)?.midi !== undefined;
  return { ok: true, edit: { type: 'setSlot', slot: flag.draft, writtenPitch: null, midi: plank.midi }, text: fillTemplate('{order}번 깃발을 {where}에 {verb}.', { order: flag.order, where, verb: had ? '옮겨 꽂았어요' : '꽂았어요' }), midi: plank.midi };
}

export function flagClearResult(content: DraftContent, flag: FlagSpot): BridgeEditResult {
  if (content.slots.find((s) => s.slot === flag.draft)?.midi === undefined) return { ok: true, edit: null, text: fillTemplate('{order}번 깃발은 아직 꽂지 않았어요.', { order: flag.order }), midi: null };
  return { ok: true, edit: { type: 'setSlot', slot: flag.draft, writtenPitch: null }, text: fillTemplate('{order}번 깃발을 뺐어요.', { order: flag.order }), midi: null };
}

/** 목표 소리 높이들(깃발 순서대로). 표지판 악보를 ScoreResolver로 푼 값이다 */
export function flagTargetsOf(variant: QuestVariant): number[] {
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'orderedScale') return [];
  return expectedPitchesOf(variant.score, spec.voiceId).map((p) => p.midi);
}

// ───── 월드가 그리는 모습(다리 → 월드) ─────

/** 이름표가 걸리는 자리 하나의 모습 */
export interface BridgeTagMark {
  draft: number;
  /** 서 있는 검은 널의 자리 번호 */
  plank: number;
  side: 'raised' | 'lowered';
  /** 걸린 이름표의 글자. 비어 있으면 null */
  text: string | null;
  selected: boolean;
  flagged: boolean;
}

/** 밧줄 하나: 시작 말뚝과 끝 말뚝이 박힌 널, 말뚝 곁에 쓰는 글(도수와 반음 수) */
export interface BridgeRopeMark {
  qid: string;
  from: number;
  /** 끝 말뚝이 꽂힌 널. 아직 꽂지 않았으면 null */
  to: number | null;
  /** 예: '3도 · 반음 4개'. 끝 말뚝이 없으면 null */
  text: string | null;
  selected: boolean;
  flagged: boolean;
}

export interface BridgeFlagMark {
  draft: number;
  order: number;
  /** 꽂힌 널의 자리 번호. 꽂지 않았으면 null(깃발 걸이에 서 있다) */
  plank: number | null;
  selected: boolean;
  flagged: boolean;
}

/** 표지판 악보 한 음: 오선 위치(맨 아랫줄이 0, 한 칸이 온음계 한 계단)와 임시표 */
export interface BridgeSignNote {
  position: number;
  accidental: 'sharp' | 'flat' | 'natural' | null;
  /** 4분음표 수 */
  beats: number;
  rest: boolean;
}

/** 임시표 과제(K3)의 표지판 악보. 음이름을 쓰지 않고 오선에 그림으로만 그린다(정답을 글로 알려 주지 않는다) */
export interface BridgeSign {
  keySignature: number;
  bars: BridgeSignNote[][];
}

export interface KeyBridgeView {
  task: BridgeTask;
  /** 널 위의 커서(자리 번호) */
  cursor: number | null;
  /** 지금 울리는 널들(자리 번호) */
  playing: readonly number[];
  tags: readonly BridgeTagMark[];
  ropes: readonly BridgeRopeMark[];
  flags: readonly BridgeFlagMark[];
  sign: BridgeSign | null;
  /** 자유로 놀기인가(판정과 목표가 없다) */
  free: boolean;
}

const GCLEF_BOTTOM = 4 * 7 + LETTERS.indexOf('E'); // E4: 높은음자리표의 맨 아랫줄

/** 표지판 악보: 조표, 마디, 음의 오선 위치와 임시표 */
export function bridgeSignOf(variant: QuestVariant): BridgeSign | null {
  if (bridgeTaskOf(variant) !== 'flags') return null;
  const staff = variant.score.staves[0];
  if (!staff || staff.clef !== 'treble') return null;
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'orderedScale') return null;
  const events = variant.score.events.filter((e) => e.voiceId === spec.voiceId);
  const bars: BridgeSignNote[][] = [];
  const sorted = [...events].sort((a, b) => a.measureIndex - b.measureIndex || a.onsetTicks - b.onsetTicks);
  for (const e of sorted) {
    const bar = (bars[e.measureIndex] ??= []);
    const beats = e.durationTicks / 960;
    if (e.type === 'note') {
      const w = e.writtenPitch;
      bar.push({ position: w.octave * 7 + LETTERS.indexOf(w.letter) - GCLEF_BOTTOM, accidental: w.accidental === 'sharp' || w.accidental === 'flat' || w.accidental === 'natural' ? w.accidental : null, beats, rest: false });
    } else if (e.type === 'rest') bar.push({ position: 4, accidental: null, beats, rest: true });
  }
  return { keySignature: staff.keySignature, bars: bars.map((b) => b ?? []) };
}

// ───── 월드가 그리는 자리(순수 계산) ─────
// 이름표 자리, 말뚝, 깃발과 깃발 걸이, 표지판 악보판은 널이 아니라 널 위쪽의 띠(BRIDGE_BAND_TOP)에 그린다.
// 좌표를 한곳에서 계산해 월드(keyBridgeLayer)와 시험이 같은 값을 읽게 한다. 널의 소리와 판정은 이 좌표를 읽지 않는다(W-3).

export interface BridgeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 이름표 상자 크기. 이웃한 검은 널(가운데 간격 72 px 이상)의 이름표와 겹치지 않도록 간격보다 좁다 */
export const TAG_BOX_W = 60;
export const TAG_BOX_H = 30;
/** 이름표 상자 가운데가 널 윗면에서 위로 떨어진 거리: 올려 부른 이름(♯)은 아래줄, 내려 부른 이름(♭)은 위줄이다 */
export const TAG_ROW_DY = { raised: 30, lowered: 68 } as const;
/** 말뚝 높이, 깃발 기둥 높이, 깃발 천(가로세로), 깃발 걸이에서 깃발 하나가 차지하는 너비 */
export const STAKE_H = 44;
export const FLAG_POLE_H = 52;
export const FLAG_CLOTH_W = 30;
export const FLAG_CLOTH_H = 22;
export const FLAG_SLOT_W = 44;
/** 깃발 걸이 선반이 널 윗면에서 위로 떨어진 거리. 걸이는 띠의 오른쪽 끝에서 왼쪽으로 나란히 선다 */
export const FLAG_RACK_DY = 84;
/**
 * 같은 널에 깃발이 둘 이상 꽂히면 번호가 작은 것부터 널 아래쪽으로 한 줄씩(천 한 장의 높이 + 4 px) 내려 세워서 서로의 번호를 가리지 않게 한다.
 * 같은 소리를 되풀이하는 임시표 과제의 정답(Q30은 66, 65, 65, 66)은 깃발 둘이 한 널에 서기 때문이다. 여섯째 줄부터는 같은 줄에 선다(검은 널의 길이 150 px 안).
 */
export const FLAG_STACK_DY = FLAG_CLOTH_H + 4;
export const FLAG_STACK_MAX = 5;
/** 표지판 악보판의 높이와 아래 끝이 널 윗면에서 위로 떨어진 거리(깃발 기둥 끝보다 위에 있다) */
export const SIGN_BOARD_H = 92;
export const SIGN_BOARD_GAP = 70;

/** 이름표 상자(월드 px): 검은 널 위쪽에 두 줄 */
export function tagBoxOf(rect: Pick<SlotRect, 'x' | 'y' | 'w'>, side: 'raised' | 'lowered'): BridgeBox {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y - TAG_ROW_DY[side];
  return { x: cx - TAG_BOX_W / 2, y: cy - TAG_BOX_H / 2, w: TAG_BOX_W, h: TAG_BOX_H };
}

/** 말뚝 끝(밧줄이 묶이는 곳) */
export function stakeTopOf(rect: Pick<SlotRect, 'x' | 'y' | 'w'>): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y - STAKE_H };
}

/** 널에 꽂힌 깃발: 기둥 아래와 기둥 끝. stack은 같은 널의 깃발 가운데 몇 번째인가(0부터)이고, 첫 깃발의 기둥 아래가 널 윗면이다 */
export function flagPoleOf(rect: Pick<SlotRect, 'x' | 'y' | 'w'>, stack = 0): { base: { x: number; y: number }; top: { x: number; y: number } } {
  const x = rect.x + rect.w / 2;
  const y = rect.y + Math.min(Math.max(0, stack), FLAG_STACK_MAX) * FLAG_STACK_DY;
  return { base: { x, y }, top: { x, y: y - FLAG_POLE_H } };
}

/** 같은 널에 꽂힌 깃발들 가운데 이 깃발이 몇 번째인가(번호가 작은 차례, 0부터). 꽂히지 않은 깃발은 0이다 */
export function flagStackOf(flags: ReadonlyArray<Pick<BridgeFlagMark, 'order' | 'plank'>>, flag: Pick<BridgeFlagMark, 'order' | 'plank'>): number {
  return flag.plank === null ? 0 : flags.filter((f) => f.plank === flag.plank && f.order < flag.order).length;
}

/** 깃발 걸이에 선 깃발 하나(order는 1부터)의 기둥 아래. 다리 전체 틀(bridgeBounds)의 오른쪽 끝에서 왼쪽으로 나란히 선다 */
export function flagRackSpotOf(frame: BridgeBox, count: number, order: number): { x: number; y: number } {
  return { x: frame.x + frame.w - FLAG_SLOT_W / 2 - (count - order) * FLAG_SLOT_W, y: frame.y + BRIDGE_BAND_TOP - FLAG_RACK_DY };
}

/** 표지판 악보판: 걸이(깃발이 count개)를 뺀 왼쪽 윗부분 */
export function signBoardOf(frame: BridgeBox, flagCount: number): BridgeBox {
  const rack = flagCount * FLAG_SLOT_W + 12;
  return { x: frame.x + 4, y: frame.y + BRIDGE_BAND_TOP - SIGN_BOARD_GAP - SIGN_BOARD_H, w: frame.w - rack - 16, h: SIGN_BOARD_H };
}

/**
 * 이 설치물의 판본 하나가 건반 다리에서 풀리는지 본다. 문제를 글로 돌려준다(콘텐츠 검사가 쓴다).
 * free가 true이면 자유로 놀기의 틀이다: 정답(목표)이 없어서 목표의 개수와 소리 높이는 보지 않는다.
 */
export function bridgeVariantProblems(inst: Pick<InstallationDef, 'slots'> & { slotMap?: SlotMapDef }, variant: QuestVariant, free = false): string[] {
  const map = keyBridgeMapOf(inst);
  if (!map) return ['건반 다리가 아니에요'];
  const planks = planksOf(map);
  const task = bridgeTaskOf(variant);
  const spec = variant.evaluatorSpec;
  if (!task) return [`판정기가 ${spec.type}인데 건반 다리는 음자리표 없는 이름표 판본(pitchSpelling), 음정(interval), 방향이 sequence인 음 순서(orderedScale)만 이어요`];
  if (task === 'names') {
    const spots = tagSpotsOf(variant, planks);
    if (!spots) return ['이름표 목표의 소리 높이가 다리의 검은 널에 없어요'];
    return spots.length > 12 ? [`이름표 자리는 12개까지예요(지금 ${spots.length}개)`] : [];
  }
  if (task === 'interval') return bridgeQuestionsOf(variant, planks) ? [] : ['음정 질문의 음이 다리의 널에 없어요'];
  const problems: string[] = [];
  if (spec.type === 'orderedScale' && spec.requireSpelling) problems.push('깃발은 소리 높이만 가져서 requireSpelling이 false여야 해요');
  if (free) {
    const n = flagCountOf(variant);
    if (n < 2 || n > FREE_BRIDGE_FLAGS) problems.push(`깃발은 2–${FREE_BRIDGE_FLAGS}개예요(지금 ${n}개)`);
    return problems;
  }
  const targets = flagTargetsOf(variant);
  if (targets.length < 2 || targets.length > 8) problems.push(`깃발은 2–8개예요(지금 ${targets.length}개)`);
  if (targets.some((m) => !plankOfMidi(planks, m))) problems.push('목표 소리 높이가 다리의 널에 없어요');
  return problems;
}

// ───── 자유로 놀기의 틀 ─────

/** 자유로 놀기에서 꽂을 수 있는 순서 깃발의 수 */
export const FREE_BRIDGE_FLAGS = 8;

const ORDINAL_KO = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째', '열한째', '열두째'] as const;

/**
 * 자유로 놀기의 틀: 설치물이 다루는 첫 과제(건반 다리에서 풀 수 있는 첫 판본)의 종류를 따른다. 정답이 없어서 목표는 뜻이 없다.
 * - 이름표: 검은 널마다 자리 하나. 이름표는 열 개 가운데 아무거나 건다(올려 부른 이름도 내려 부른 이름도).
 * - 밧줄: 가장 높은 흰 널을 뺀 흰 널마다 시작 말뚝이 박힌 밧줄 하나(음 쌓기). 끝 말뚝은 아무 널에나 꽂는다.
 * - 깃발: 순서 깃발 여덟 개.
 * 건반 다리가 아니거나 틀로 삼을 판본이 없으면 null이다.
 */
export function freeBridgeFrameOf(inst: Pick<InstallationDef, 'quests'> & { slotMap?: SlotMapDef }, variantOf: (questId: string, variantId: string) => QuestVariant | undefined): QuestVariant | null {
  const map = keyBridgeMapOf(inst);
  if (!map) return null;
  let base: QuestVariant | undefined;
  let task: BridgeTask | null = null;
  for (const ref of inst.quests) {
    for (const variantId of ref.variantIds) {
      const v = variantOf(ref.questId, variantId);
      const t = v ? bridgeTaskOf(v) : null;
      if (v && t) {
        base = v;
        task = t;
        break;
      }
    }
    if (base) break;
  }
  if (!base || !task) return null;
  const planks = planksOf(map);
  if (planks.length === 0) return null;
  const range = `${midiToSharpName(planks[0]!.midi)}-${midiToSharpName(planks[planks.length - 1]!.midi)}`;
  let evaluatorSpec: QuestVariant['evaluatorSpec'];
  if (task === 'names') {
    const blacks = planks.filter((p) => p.black);
    evaluatorSpec = {
      type: 'pitchSpelling',
      targets: blacks.map((p, i) => {
        const w = stakeWrittenAt(p);
        return { slotId: `tag-${p.slot}`, label: `${ORDINAL_KO[i] ?? `${i + 1}번째`} 검은 널의 이름표`, expected: { letter: w.letter, alter: 1, octave: w.octave } };
      }),
    };
  } else if (task === 'interval') {
    const whites = planks.filter((p) => !p.black);
    evaluatorSpec = {
      type: 'interval',
      questions: whites.slice(0, -1).map((p, i) => {
        const w = stakeWrittenAt(p);
        return { qid: `rope-${i + 1}`, label: `${p.name}에서 뻗는 밧줄`, kind: 'build' as const, from: { letter: w.letter, alter: 0, octave: w.octave }, diatonicNumber: 2, quality: 'major' as const };
      }),
    };
  } else {
    const own = base.evaluatorSpec;
    evaluatorSpec = { type: 'orderedScale', voiceId: own.type === 'orderedScale' ? own.voiceId : 'v1', count: FREE_BRIDGE_FLAGS, direction: 'sequence', requireSpelling: false, requireOctave: true, slotLabel: '깃발' };
  }
  return { ...base, challengeDescriptor: { ...base.challengeDescriptor, range }, score: { ...base.score, events: [] }, evaluatorSpec };
}

/** 널의 이름을 한 줄로: 흰 널은 자기 이름, 검은 널은 '올림이름/내림이름' */
export function plankLabelOf(p: Plank): string {
  const names = plankNames(p);
  return names.length === 2 ? `${names[0]}/${names[1]}` : names[0]!;
}

/**
 * 문제를 푸는 중에 널을 말하는 방법. 흰 널은 이름으로 말하고, 검은 널은 이웃한 흰 널로만 말한다(이름을 알려 주면 이름 붙이는 일이 사라진다).
 * 자유로 놀 때는 검은 널의 두 이름도 말한다.
 */
export function plankSpeakOf(p: Plank, free: boolean): string {
  if (!p.black) return `${p.name} 널`;
  if (free) return `검은 널 ${plankLabelOf(p)}`;
  return fillTemplate('{a:와과} {b} 사이의 검은 널', { a: midiToSharpName(p.midi - 1), b: midiToSharpName(p.midi + 1) });
}
