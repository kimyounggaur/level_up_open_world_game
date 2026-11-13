// 1-7 ChallengeSession: 초안, 실행 취소, 도움 이동과 복귀.
// 초안은 과제·판본마다 하나다. 패널과 설치물은 같은 초안을 보는 두 가지 방법일 뿐이다(4.2).
// 도움 연습에 들어가면 원래 도전의 초안·판본·선택·설정을 보관하고, 연습 결과와 무관하게 돌아온다(7.5).
// 이 파일은 시계도 난수도 화면도 모른다. 소리는 자동으로 재생하지 않는다(W-11): 모든 전환 결과에 autoplay: false가 붙는다.
import { ACCIDENTAL_ALTER } from './pitch';
import type { SpelledPitch, WrittenPitch } from './pitch';
import { keySignatureAlter } from './key';
import type { ScoreEvent, TupletGroup } from './score';

export const MAX_UNDO = 50;

export interface SlotEntry {
  slot: number;
  /** 기보 음. null이면 비운 칸(쉼표가 아니라 '아직 없음') */
  writtenPitch: WrittenPitch | null;
  /** 이름 없이 소리 높이만 고르는 과제(건반 널의 깃발 등) */
  midi?: number;
  /** 소리를 끈 종 등 */
  muted?: boolean;
  /**
   * 음이 아니라 고르는 답: 같은 소리인가('yes'/'no'), 음정 이름('augmented:2' = 증2도 처럼 '성질:도수') 같은 것.
   * 값의 뜻은 판정기가 정하고 초안은 글자로만 담는다(5-2).
   */
  choice?: string;
}

export interface DraftContent {
  slots: SlotEntry[];
  events: ScoreEvent[];
  tuplets: TupletGroup[];
}

export interface Selection {
  slot?: number;
  measure?: number;
  eventId?: string;
}

export type SettingValue = number | string | boolean;
export type Settings = Record<string, SettingValue>;

export interface ActiveChallenge {
  questId: string;
  variantId: string;
  /** 이 도전의 설정(템포 등). 도움 연습의 설정과 따로 보관한다 */
  challengeSettings: Settings;
}

export type DraftEdit =
  | { type: 'setSlot'; slot: number; writtenPitch: WrittenPitch | null; midi?: number; choice?: string }
  | { type: 'setSlotMuted'; slot: number; muted: boolean }
  | { type: 'addEvent'; event: ScoreEvent }
  | { type: 'removeEvent'; eventId: string }
  | { type: 'replaceEvent'; eventId: string; event: ScoreEvent }
  | { type: 'setTuplets'; tuplets: TupletGroup[] }
  /** 여러 편집을 한 번에: 실행 취소 한 칸이다(셋잇단 묶음 놓기, 묶음 지우기). 하나라도 틀리면 아무것도 바뀌지 않는다 */
  | { type: 'batch'; edits: DraftEdit[] }
  | { type: 'clear' };

/** 저장과 비교에 쓰는 한 도전의 초안 전체 */
export interface DraftState {
  content: DraftContent;
  selection: Selection;
  /** 실행 취소로 돌아갈 이전 내용들(오래된 것이 앞) */
  undo: DraftContent[];
  redo: DraftContent[];
}

export interface SupportContext {
  /** 도움 메뉴의 종류. 예: 'listenPair', 'basicPractice' */
  assistType: string;
  practiceId: string;
  /** 도움 연습 안에서만 쓰는 설정. 도전 설정과 섞이지 않는다 */
  assistSettings: Settings;
  /** 1이면 원래 도전에서 바로 들어온 연습, 2 이상이면 연습 안에서 또 연 연습 */
  depth: number;
  /** 가장 처음 도전(최상위 출발점). 연습이 몇 겹이든 여기로 돌아온다 */
  origin: { challenge: ActiveChallenge; draft: DraftState };
  /**
   * 연습으로 연 과제(5-5). 있으면 연습 안에서 이 과제의 초안을 고칠 수 있다. 원래 곡의 초안은 `origin`에 그대로 있다.
   * 없으면 원래 도전을 그대로 둔 도움이라 초안을 고칠 수 없다.
   */
  practice?: PracticeTarget;
}

/** 도움 연습으로 여는 과제. 연습의 도전 설정은 원래 도전의 것과 섞이지 않는다 */
export interface PracticeTarget {
  questId: string;
  variantId: string;
  challengeSettings?: Settings;
}

export interface SavedDraft {
  slots: SlotEntry[];
  events: ScoreEvent[];
  tuplets: TupletGroup[];
  selectedSlot?: number;
  selectedMeasure?: number;
  selectedEventId?: string;
  undoDepth: number;
  /** 실행 취소 기록. 새로 고친 뒤에도 이어서 취소할 수 있다 */
  history: DraftContent[];
}

export interface SessionSnapshot {
  activeChallenge: ActiveChallenge | null;
  challengeDrafts: Record<string, SavedDraft>;
  supportContext: SupportContext | null;
}

/** 전환 결과. 소리는 어떤 전환에서도 저절로 나지 않는다. */
export interface TransitionResult {
  autoplay: false;
}

export const draftKey = (questId: string, variantId: string): string => `${questId}/${variantId}`;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function emptyContent(): DraftContent {
  return { slots: [], events: [], tuplets: [] };
}

function emptyDraft(): DraftState {
  return { content: emptyContent(), selection: {}, undo: [], redo: [] };
}

function applyEdit(content: DraftContent, edit: DraftEdit): DraftContent {
  const next = clone(content);
  switch (edit.type) {
    case 'setSlot': {
      const i = next.slots.findIndex((s) => s.slot === edit.slot);
      const entry: SlotEntry = { slot: edit.slot, writtenPitch: edit.writtenPitch, ...(edit.midi !== undefined ? { midi: edit.midi } : {}), ...(edit.choice !== undefined ? { choice: edit.choice } : {}) };
      if (i >= 0) entry.muted = next.slots[i]!.muted;
      if (entry.muted === undefined) delete entry.muted;
      if (edit.writtenPitch === null && edit.midi === undefined && edit.choice === undefined) {
        if (i >= 0) next.slots.splice(i, 1); // 칸을 비운다
      } else if (i >= 0) next.slots[i] = entry;
      else next.slots.push(entry);
      next.slots.sort((a, b) => a.slot - b.slot);
      return next;
    }
    case 'setSlotMuted': {
      const s = next.slots.find((x) => x.slot === edit.slot);
      if (!s) throw new Error(`${edit.slot}번째 칸이 비어 있어요`);
      if (edit.muted) s.muted = true;
      else delete s.muted;
      return next;
    }
    case 'addEvent':
      if (next.events.some((e) => e.eventId === edit.event.eventId)) throw new Error(`사건 id가 겹쳐요: ${edit.event.eventId}`);
      next.events.push(clone(edit.event));
      return next;
    case 'removeEvent': {
      const before = next.events.length;
      next.events = next.events.filter((e) => e.eventId !== edit.eventId);
      if (next.events.length === before) throw new Error(`없는 사건이에요: ${edit.eventId}`);
      next.tuplets = next.tuplets.map((g) => ({ ...g, eventIds: g.eventIds.filter((id) => id !== edit.eventId) })).filter((g) => g.eventIds.length > 0);
      return next;
    }
    case 'replaceEvent': {
      const i = next.events.findIndex((e) => e.eventId === edit.eventId);
      if (i < 0) throw new Error(`없는 사건이에요: ${edit.eventId}`);
      next.events[i] = clone(edit.event);
      return next;
    }
    case 'setTuplets':
      next.tuplets = clone(edit.tuplets);
      return next;
    case 'batch':
      return edit.edits.reduce((acc, e) => applyEdit(acc, e), next);
    case 'clear':
      return emptyContent();
  }
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 칸에 놓은 기보 음을 조표를 적용해 이름이 있는 음으로 바꾼다. 임시표가 있으면 그것이 우선한다. */
export function spellWritten(w: WrittenPitch, keySignature: number): SpelledPitch {
  const alter = w.accidental !== null ? ACCIDENTAL_ALTER[w.accidental] : keySignatureAlter(keySignature, w.letter);
  return { letter: w.letter, alter, octave: w.octave };
}

export class ChallengeSession {
  private active: ActiveChallenge | null;
  private drafts: Map<string, DraftState>;
  private support: SupportContext | null;
  private listeners = new Set<() => void>();

  constructor(snapshot?: SessionSnapshot) {
    this.active = null;
    this.drafts = new Map();
    this.support = null;
    if (snapshot) this.load(snapshot);
  }

  // ------------------------------------------------------------------ 구독
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  // ------------------------------------------------------------------ 현재 상태 보기
  get activeChallenge(): ActiveChallenge | null {
    return this.active ? clone(this.active) : null;
  }

  /** 도움 연습 중인가 */
  get inAssist(): boolean {
    return this.support !== null;
  }

  /** 도움 연습 중이지만 원래 도전을 그대로 둔 것이라 초안과 선택을 고칠 수 없는가(연습 과제를 따로 연 연습은 고칠 수 있다) */
  get readOnly(): boolean {
    return this.frozen;
  }

  private get frozen(): boolean {
    return this.support !== null && this.support.practice === undefined;
  }

  get supportContext(): SupportContext | null {
    return this.support ? clone(this.support) : null;
  }

  private currentKey(): string {
    if (!this.active) throw new Error('열려 있는 도전이 없어요');
    return draftKey(this.active.questId, this.active.variantId);
  }

  private draft(): DraftState {
    const key = this.currentKey();
    let d = this.drafts.get(key);
    if (!d) {
      d = emptyDraft();
      this.drafts.set(key, d);
    }
    return d;
  }

  /** 현재 도전의 초안 내용(복사본) */
  content(): DraftContent {
    return clone(this.draft().content);
  }

  selection(): Selection {
    return { ...this.draft().selection };
  }

  get canUndo(): boolean {
    return this.active !== null && !this.frozen && this.draft().undo.length > 0;
  }

  get canRedo(): boolean {
    return this.active !== null && !this.frozen && this.draft().redo.length > 0;
  }

  get undoDepth(): number {
    return this.active ? this.draft().undo.length : 0;
  }

  /** 어떤 도전에 초안이 남아 있는가(비어 있지 않은 것만) */
  draftKeys(): string[] {
    return [...this.drafts.entries()].filter(([, d]) => d.content.slots.length + d.content.events.length > 0).map(([k]) => k);
  }

  contentOf(questId: string, variantId: string): DraftContent {
    const d = this.drafts.get(draftKey(questId, variantId));
    return d ? clone(d.content) : emptyContent();
  }

  // ------------------------------------------------------------------ 도전 열기와 닫기
  /** 도전을 연다. 다른 도전의 초안은 그대로 남는다. 도움 연습 중에는 먼저 돌아와야 한다. */
  openChallenge(questId: string, variantId: string, challengeSettings: Settings = {}): TransitionResult {
    // 연습으로 열린 과제를 다시 여는 것(주소가 연습 과제를 가리킨다)은 그대로 둔다. 다른 도전은 먼저 돌아와야 한다
    const practiceAgain = this.support?.practice && this.active && this.active.questId === questId && this.active.variantId === variantId;
    if (this.support && !practiceAgain) throw new Error('도움 연습 중에는 도전을 바꿀 수 없어요. 먼저 원래 곡으로 돌아가 주세요');
    const same = this.active && this.active.questId === questId && this.active.variantId === variantId;
    this.active = { questId, variantId, challengeSettings: same ? { ...this.active!.challengeSettings, ...challengeSettings } : { ...challengeSettings } };
    this.draft(); // 없으면 빈 초안을 만든다
    this.emit();
    return { autoplay: false };
  }

  /** 도전을 닫는다. 초안은 남는다(나가기, 8.1 '초안은 자동으로 보관된다'). */
  closeChallenge(): TransitionResult {
    if (this.support) this.returnToOrigin();
    this.active = null;
    this.emit();
    return { autoplay: false };
  }

  updateChallengeSettings(patch: Settings): void {
    if (!this.active) throw new Error('열려 있는 도전이 없어요');
    if (this.frozen) throw new Error('도움 연습 중에는 도전 설정을 바꿀 수 없어요. 연습의 설정은 따로 있어요');
    this.active = { ...this.active, challengeSettings: { ...this.active.challengeSettings, ...patch } };
    this.emit();
  }

  // ------------------------------------------------------------------ 편집
  private assertEditable(): DraftState {
    if (this.frozen) throw new Error('도움 연습 중에는 원래 초안을 고칠 수 없어요');
    return this.draft();
  }

  /** 초안을 고친다. 바뀐 것이 없으면 실행 취소 기록을 늘리지 않는다. */
  apply(edit: DraftEdit): void {
    const d = this.assertEditable();
    const next = applyEdit(d.content, edit);
    if (sameJson(next, d.content)) return;
    d.undo.push(d.content);
    if (d.undo.length > MAX_UNDO) d.undo.shift();
    d.redo = [];
    d.content = next;
    this.emit();
  }

  undo(): boolean {
    const d = this.assertEditable();
    const prev = d.undo.pop();
    if (!prev) return false;
    d.redo.push(d.content);
    d.content = prev;
    this.emit();
    return true;
  }

  redo(): boolean {
    const d = this.assertEditable();
    const next = d.redo.pop();
    if (!next) return false;
    d.undo.push(d.content);
    d.content = next;
    this.emit();
    return true;
  }

  /** 선택(칸, 마디, 사건)을 바꾼다. 선택은 실행 취소 기록에 들어가지 않는다. */
  select(sel: Selection): void {
    const d = this.assertEditable();
    d.selection = { ...sel };
    this.emit();
  }

  // ------------------------------------------------------------------ 도움 이동과 복귀
  /**
   * 도움 연습에 들어간다. 처음 들어가면 원래 도전의 초안·판본·선택·설정을 통째로 보관한다.
   * 연습 안에서 또 도움을 열어도 출발점은 처음 것을 그대로 둔다(최상위 출발점 유지).
   *
   * `practice`를 주면 그 과제가 지금 도전이 된다(5-5 기본 연습). 연습 과제는 자기 초안을 따로 가지므로 원래 곡의 초안은 건드리지 않고,
   * 연습을 끝내지 않고 돌아와도 보관해 둔 원래 곡이 그대로 돌아온다. 주지 않으면 원래 도전을 그대로 둔 도움이다(초안을 고칠 수 없다).
   */
  enterAssist(assistType: string, practiceId: string, assistSettings: Settings = {}, practice?: PracticeTarget): TransitionResult {
    if (!this.active) throw new Error('열려 있는 도전이 없어요');
    if (!this.support) {
      this.support = {
        assistType,
        practiceId,
        assistSettings: { ...assistSettings },
        depth: 1,
        origin: { challenge: clone(this.active), draft: clone(this.draft()) },
      };
    } else {
      const { practice: _previous, ...rest } = this.support;
      this.support = { ...rest, assistType, practiceId, assistSettings: { ...assistSettings }, depth: this.support.depth + 1 };
    }
    if (practice) {
      this.support = { ...this.support, practice: clone(practice) };
      this.active = { questId: practice.questId, variantId: practice.variantId, challengeSettings: { ...(practice.challengeSettings ?? {}) } };
      this.draft(); // 연습 과제의 초안이 없으면 빈 초안을 만든다
    }
    this.emit();
    return { autoplay: false };
  }

  updateAssistSettings(patch: Settings): void {
    if (!this.support) throw new Error('도움 연습 중이 아니에요');
    this.support = { ...this.support, assistSettings: { ...this.support.assistSettings, ...patch } };
    this.emit();
  }

  /**
   * 원래 곡으로 돌아간다. 항상 성공한다: 연습 결과, 연습 중의 오류, 연습의 깊이와 무관하다.
   * 도움 연습 중이 아니면 아무것도 바꾸지 않고 현재 상태를 돌려준다(여러 번 눌러도 같다).
   */
  returnToOrigin(): TransitionResult {
    if (this.support) {
      const { challenge, draft } = this.support.origin;
      this.active = clone(challenge);
      this.drafts.set(draftKey(challenge.questId, challenge.variantId), clone(draft));
      this.support = null;
      this.emit();
    }
    return { autoplay: false };
  }

  // ------------------------------------------------------------------ 저장
  serialize(): SessionSnapshot {
    const challengeDrafts: Record<string, SavedDraft> = {};
    for (const [key, d] of this.drafts) {
      const empty = d.content.slots.length + d.content.events.length + d.content.tuplets.length === 0;
      if (empty && d.undo.length === 0 && Object.keys(d.selection).length === 0) continue;
      challengeDrafts[key] = {
        slots: clone(d.content.slots),
        events: clone(d.content.events),
        tuplets: clone(d.content.tuplets),
        ...(d.selection.slot !== undefined ? { selectedSlot: d.selection.slot } : {}),
        ...(d.selection.measure !== undefined ? { selectedMeasure: d.selection.measure } : {}),
        ...(d.selection.eventId !== undefined ? { selectedEventId: d.selection.eventId } : {}),
        undoDepth: d.undo.length,
        history: clone(d.undo),
      };
    }
    return { activeChallenge: this.activeChallenge, challengeDrafts, supportContext: this.supportContext };
  }

  private load(s: SessionSnapshot): void {
    const errors = validateSessionSnapshot(s);
    if (errors.length > 0) throw new Error(`세션 저장 형식이 올바르지 않아요: ${errors.join('; ')}`);
    this.active = s.activeChallenge ? clone(s.activeChallenge) : null;
    this.drafts = new Map();
    for (const [key, sd] of Object.entries(s.challengeDrafts)) {
      const selection: Selection = {};
      if (sd.selectedSlot !== undefined) selection.slot = sd.selectedSlot;
      if (sd.selectedMeasure !== undefined) selection.measure = sd.selectedMeasure;
      if (sd.selectedEventId !== undefined) selection.eventId = sd.selectedEventId;
      this.drafts.set(key, { content: { slots: clone(sd.slots), events: clone(sd.events), tuplets: clone(sd.tuplets) }, selection, undo: clone(sd.history), redo: [] });
    }
    this.support = s.supportContext ? clone(s.supportContext) : null;
  }

  static restore(snapshot: SessionSnapshot): ChallengeSession {
    return new ChallengeSession(snapshot);
  }
}

// ---------------------------------------------------------------------------
// 저장된 세션 검사: 저장소가 새 저장으로 바꾸기 전에 쓴다(10.6)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validActive(v: unknown): boolean {
  return isObj(v) && typeof v.questId === 'string' && v.questId.length > 0 && typeof v.variantId === 'string' && v.variantId.length > 0 && isObj(v.challengeSettings);
}

/**
 * 읽을 수 있는 세션만 남긴다(저장 부분 복구용, 10.6). 망가진 초안은 그 초안만, 진행 중 도전과 도움 연습 상태는 못 읽으면 비워서 처음 상태로 돌린다.
 * 버린 것은 사람이 읽는 문장으로 돌려준다. 읽을 수 있는 초안은 값 그대로다.
 */
export function salvageSessionSnapshot(raw: { activeChallenge?: unknown; challengeDrafts?: unknown; supportContext?: unknown }): { session: SessionSnapshot; dropped: string[] } {
  const dropped: string[] = [];
  let activeChallenge = (raw.activeChallenge ?? null) as SessionSnapshot['activeChallenge'];
  if (activeChallenge !== null && !validActive(activeChallenge)) {
    dropped.push('진행 중이던 도전을 읽을 수 없어 처음 상태로 돌렸어요');
    activeChallenge = null;
  }
  const challengeDrafts: Record<string, SavedDraft> = {};
  if (isObj(raw.challengeDrafts)) {
    for (const [key, d] of Object.entries(raw.challengeDrafts)) {
      const errors = validateSessionSnapshot({ activeChallenge: null, challengeDrafts: { [key]: d }, supportContext: null });
      if (errors.length > 0) dropped.push(`초안 ${key}: 읽을 수 없어 버렸어요(${errors[0]!})`);
      else challengeDrafts[key] = d as SavedDraft;
    }
  } else if (raw.challengeDrafts !== undefined && raw.challengeDrafts !== null) {
    dropped.push('초안 목록을 읽을 수 없어 모두 비웠어요');
  }
  let supportContext = (raw.supportContext ?? null) as SessionSnapshot['supportContext'];
  if (supportContext !== null && validateSessionSnapshot({ activeChallenge: null, challengeDrafts: {}, supportContext }).length > 0) {
    // 도움 연습 중이던 상태가 반쯤만 남지 않게 진행 중 도전도 함께 처음 상태로 돌린다
    dropped.push('도움 연습 상태를 읽을 수 없어 원래 상태로 돌렸어요');
    supportContext = null;
    activeChallenge = null;
  }
  return { session: { activeChallenge, challengeDrafts, supportContext }, dropped };
}

export function validateSessionSnapshot(s: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(s)) return ['세션이 객체가 아니에요'];
  if (s.activeChallenge !== null && !validActive(s.activeChallenge)) errors.push('activeChallenge가 올바르지 않아요');
  if (!isObj(s.challengeDrafts)) errors.push('challengeDrafts가 객체가 아니에요');
  else {
    for (const [key, d] of Object.entries(s.challengeDrafts)) {
      if (!/^[^/]+\/[^/]+$/.test(key)) errors.push(`초안 키가 올바르지 않아요: ${key}`);
      if (!isObj(d) || !Array.isArray(d.slots) || !Array.isArray(d.events) || !Array.isArray(d.tuplets) || !Array.isArray(d.history)) {
        errors.push(`초안 ${key}의 형식이 올바르지 않아요`);
        continue;
      }
      // 칸 번호는 판정기마다 기준이 다르다: 오선 칸(Q01 음이름 쓰기)은 0부터, 순서 칸(Q07 음계)은 1부터 센다.
      // 저장 검사는 "0 이상의 정수"까지만 본다(칸이 범위 안인지는 과제 정의가 아는 일이다).
      if ((d.slots as unknown[]).some((x) => !isObj(x) || !Number.isInteger(x.slot) || (x.slot as number) < 0)) errors.push(`초안 ${key}의 칸 번호가 올바르지 않아요`);
      if (!Number.isInteger(d.undoDepth) || d.undoDepth !== (d.history as unknown[]).length) errors.push(`초안 ${key}의 undoDepth가 기록 길이와 달라요`);
    }
  }
  if (s.supportContext !== null) {
    const sc = s.supportContext;
    if (!isObj(sc) || typeof sc.assistType !== 'string' || typeof sc.practiceId !== 'string' || !isObj(sc.assistSettings) || !Number.isInteger(sc.depth) || !isObj(sc.origin)) {
      errors.push('supportContext가 올바르지 않아요');
    } else if (!validActive(sc.origin.challenge) || !isObj(sc.origin.draft) || !isObj(sc.origin.draft.content)) {
      errors.push('supportContext.origin이 올바르지 않아요');
    } else if (sc.practice !== undefined && (!isObj(sc.practice) || typeof sc.practice.questId !== 'string' || typeof sc.practice.variantId !== 'string' || (sc.practice.challengeSettings !== undefined && !isObj(sc.practice.challengeSettings)))) {
      errors.push('supportContext.practice가 올바르지 않아요');
    }
  }
  return errors;
}
