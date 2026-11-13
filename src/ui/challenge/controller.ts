// 2-5~2-7 과제 하나를 푸는 동안의 모든 동작을 한곳에 모은다.
// 패널(Q01, Q02 …)은 이 컨트롤러를 보여 주고 부르기만 한다. 판정은 domain, 소리는 audio가 한다.
//  - 초안 편집은 ChallengeSession이 쥐고 있다(패널과 설치물이 같은 초안을 본다, 4.2).
//  - 판정과 기록: '배치 확인'을 누를 때만 판정하고 AttemptResult로 남긴다. 기술 문제는 음악 오답으로 남기지 않는다(W-8).
//  - 소리: 소리 켜기를 누르기 전에는 소리가 나지 않는다(W-11). 소리가 없어도 재생 막대와 편집은 그대로다.
//  - 도움: 느리게 듣기·박 반복·박 수 표시는 도전 설정을 건드리지 않는다. 원래 템포 설정은 그대로다(7.5, 2-7).
import { makeAttemptResult } from '../../domain/attempt';
import type { AttemptResult } from '../../domain/attempt';
import { chordShapeTextOf, freeBellFrameOf } from '../../domain/bells';
import type { QuestEntry, ResolveResult, VariantEntry } from '../../domain/catalog';
import { ContentCatalog } from '../../domain/catalog';
import { clearStaffSlotEdit, draftScoreOf, evaluateDraft, gridCellsOf, placeOnStaffEdit, staffSlotsOf } from '../../domain/challenge';
import type { GridCell, StaffSlot } from '../../domain/challenge';
import { FREE_QUEST_PREFIX, FREE_VARIANT_ID, freeQuestId } from '../../domain/content';
import type { QuestDefinition, QuestVariant } from '../../domain/content';
import { ALL_SCOPE, FREE_MELODY_LABEL, freeMelodyVariant, scopeName, scopedPlayback, songLengthTicks, stageLayoutOf } from '../../domain/ensemble';
import type { ListenScope } from '../../domain/ensemble';
import { fillTemplate, renderAll } from '../../domain/feedback';
import type { Issue } from '../../domain/feedback';
import type { InstallationDef } from '../../domain/installation';
import { midiOf } from '../../domain/pitch';
import { scoreToPlayback, slowTempoFor } from '../../domain/playback';
import type { PlayNote, Playback } from '../../domain/playback';
import { draftKey, spellWritten } from '../../domain/session';
import { SLOT_NOTE_TICKS, hasSlotMap, slotMapOf } from '../../domain/slotmap';
import type { SlotMap } from '../../domain/slotmap';
import type { ToneNote } from '../../domain/slotplan';
import { describeStaffPosition, pitchAtStaffPosition, staffPositionOf } from '../../domain/staff';
import { freeBridgeFrameOf } from '../../domain/keyBridge';
import { freeTerraceFrameOf } from '../../domain/terrace';
import type { ChallengeSession, DraftContent, DraftEdit, SupportContext } from '../../domain/session';
import { beatCellsOf, isArrangementVariant, isTimelineVariant, measureCellsOf, timelineOf } from '../../domain/timeline';
import { freeStonesFrameOf } from '../../domain/timelineStones';
import { measureTicks, ordinalPosition } from '../../domain/time';
import type { Mixer, MixerSnapshot } from '../../audio/mixer';
import type { TaskTransport } from '../../audio/transport';
import { SURFACE_START_POSITION, clampPosition } from '../notation/staffSurface';

export interface ControllerDeps {
  catalog: ContentCatalog;
  session: ChallengeSession;
  mixer: Mixer;
  transport: TaskTransport;
  /** 시도 id와 기록 시각은 앱 계층이 정한다. domain은 시계와 난수를 모른다 */
  makeId: () => string;
  nowIso: () => string;
  /** 저장에서 읽은 지난 시도 기록. 이어서 쌓인다(통과 기록은 합주 층수의 원본이다, W-6) */
  attempts?: readonly AttemptResult[];
}

export interface CurrentChallenge {
  entry: QuestEntry;
  variant: VariantEntry;
  definition: QuestDefinition;
  def: QuestVariant;
  /** 판정하지 않는 자유로 놀기(4.2 표지판 맨 위). 목표도 판정도 시도 기록도 없다 */
  free?: boolean;
}

/** 어떤 과제를 만졌는가. 재료를 놓거나(edit) 들어 보거나(previewPitch, play) 하면 알린다(등불, 4.2) */
export interface TouchEvent {
  questId: string;
  variantId: string;
  /** 자유로 놀기면 그 설치물 id */
  freeInstallationId?: string;
  kind: 'edit' | 'listen';
  /** 듣기일 때 무엇을 들었는가: 내 배치, 목표, 음 하나 미리 듣기(놓을 때 나는 소리). 사용 기록(4-8)이 '다시 듣기'와 미리 듣기를 가린다 */
  listened?: 'mine' | 'target' | 'note';
}

export const FREE_PLAY_NO_CHECK = '자유로 놀 때는 판정하지 않아요. 표지판에서 과제를 고르면 확인할 수 있어요.';
export const FREE_PLAY_NO_TARGET = '자유로 놀 때는 들을 목표가 없어요. 표지판에서 과제를 고르면 목표를 들을 수 있어요.';

export interface FeedbackView {
  attemptId: string;
  passed: boolean;
  /** 판정하지 못했다(기술 문제). 틀렸다는 뜻이 아니다 */
  technical: boolean;
  messages: string[];
  issues: Issue[];
  /** 통과한 뒤에 덧붙여 알리는 말. 판정에 쓰이지 않는다(Q23의 전위: 5.5 '알려 주기만 한다') */
  notes?: string[];
}

export interface Aids {
  slow: boolean;
  repeat: boolean;
  showCount: boolean;
  /** 덧줄이 놓일 자리를 점선으로 보여 준다(Q01의 '덧줄 보기') */
  ledger: boolean;
  /** 곡의 일부만 듣는다: 성부 하나만이나 고른 마디만(Q08의 '성부 분리', 4.2 도움 메뉴) */
  scoped: boolean;
}

const NO_AIDS: Aids = { slow: false, repeat: false, showCount: false, ledger: false, scoped: false };

/**
 * 합주 과제(Q08)에서 무엇을 들을까. 고른 마디(measure)는 지금 고른 마디를 따라간다: 마디를 바꾸면 다음에 듣는 것이 바뀐다.
 * 재생 중인 소리는 바뀌지 않는다(이미 시작한 것은 끝까지).
 */
export type ScopeChoice = { kind: 'all' } | { kind: 'voice'; voiceId: string } | { kind: 'measure' };

const ALL_CHOICE: ScopeChoice = { kind: 'all' };

export type Playing = 'mine' | 'target' | null;

export interface TempoView {
  original: number;
  effective: number;
  slow: boolean;
}

/** '두 음 듣기'에서 음 하나가 차지하는 길이(2박) */
export const PLACED_NOTE_TICKS = 1920;

export const NO_NOTES_NOTICE = '아직 놓은 음이 없어요. 박 칸에 음이나 쉼을 놓아 보세요.';
export const NO_STAFF_NOTES_NOTICE = '아직 놓은 음이 없어요. 오선을 눌러 음을 놓아 보세요.';
export const NO_SLOT_NOTES_NOTICE = '아직 놓은 음이 없어요. 재료를 고르고 자리에 놓아 보세요.';
export const NO_TONE_NOTICE = '아직 걸린 음이 없어요. 이름을 골라 걸어 보세요.';
export const NO_MEASURE_NOTICE = '들을 마디를 먼저 골라 주세요.';
export const NOTHING_IN_SCOPE_NOTICE = '고른 범위에는 아직 소리 나는 음이 없어요. 음을 놓거나 다른 범위를 골라 보세요.';
export const SOUND_OFF_HINT = '소리가 꺼져 있어요. 소리 켜기를 누르면 들려요. 지금은 소리 없이 재생해요.';

/** 보표 위치의 제자리 음을 기보 음으로 */
function writtenAt(slot: StaffSlot, position: number) {
  const p = pitchAtStaffPosition(slot.clef, position, 0);
  return { letter: p.letter, accidental: null, octave: p.octave };
}

export class ChallengeController {
  private readonly deps: ControllerDeps;
  private currentChallenge: CurrentChallenge | null = null;
  private lastFeedback: (FeedbackView & { signature: string }) | null = null;
  private readonly attemptLog: AttemptResult[] = [];
  private aidState: Aids = { ...NO_AIDS };
  private scopeState: ScopeChoice = ALL_CHOICE;
  private readonly assistUsed = new Set<string>();
  private soundPlayedSignature: string | null = null;
  private playingNow: Playing = null;
  /** 저장한 곡 같은 만들어 둔 재생(previewPlayback)을 듣는 중인가. 도전과 상관없다 */
  private previewNow = false;
  /** '두 음 듣기'로 재생 중인 보표 칸 번호들(울리는 차례). 다른 재생에서는 null */
  private placedPlayOrder: number[] | null = null;
  /** `playTones`로 재생 중인 칸마다 울리는 구간(틱). 다른 재생에서는 null */
  private toneWindows: Array<{ slot: number; from: number; to: number }> | null = null;
  private endTaskSound: (() => void) | null = null;
  private liveText = '';
  private noticeText: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly attemptListeners = new Set<(a: AttemptResult) => void>();
  private readonly touchListeners = new Set<(t: TouchEvent) => void>();
  private readonly slotMaps = new WeakMap<QuestVariant, SlotMap>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    if (deps.attempts) this.attemptLog.push(...deps.attempts);
    this.unsubscribers.push(
      deps.session.subscribe(() => {
        this.sync();
        this.emit();
      }),
      deps.mixer.subscribe(() => this.emit()),
      deps.transport.onChange((c) => {
        if (c.state === 'stopped') this.finishPlayback();
        this.emit();
      }),
    );
    this.sync();
  }

  dispose(): void {
    this.stopPlayback();
    for (const u of this.unsubscribers.splice(0)) u();
    this.listeners.clear();
  }

  // ------------------------------------------------------------------ 구독
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onAttempt(listener: (a: AttemptResult) => void): () => void {
    this.attemptListeners.add(listener);
    return () => this.attemptListeners.delete(listener);
  }

  /** 재료를 놓거나 들어 볼 때마다 알린다(등불을 켠다, 4.2). 어떤 길로 열었든(패널, 설치물) 같다(W-2) */
  onTouch(listener: (t: TouchEvent) => void): () => void {
    this.touchListeners.add(listener);
    return () => this.touchListeners.delete(listener);
  }

  private touch(kind: TouchEvent['kind'], listened?: NonNullable<TouchEvent['listened']>): void {
    const cur = this.currentChallenge;
    if (!cur || this.touchListeners.size === 0) return;
    const event: TouchEvent = {
      questId: cur.entry.questId,
      variantId: cur.variant.variantId,
      kind,
      ...(listened ? { listened } : {}),
      ...(cur.free ? { freeInstallationId: cur.entry.questId.slice(FREE_QUEST_PREFIX.length) } : {}),
    };
    for (const l of [...this.touchListeners]) l(event);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  // ------------------------------------------------------------------ 열기와 닫기
  /** 세션이 가리키는 도전을 카탈로그에서 찾아 현재 도전으로 삼는다 */
  private sync(): void {
    const active = this.deps.session.activeChallenge;
    if (!active) {
      this.currentChallenge = null;
      return;
    }
    const cur = this.currentChallenge;
    if (cur && cur.entry.questId === active.questId && cur.variant.variantId === active.variantId) return;
    const r = this.deps.catalog.resolve(active.questId, active.variantId);
    if (!r.ok) {
      this.currentChallenge = null;
      return;
    }
    this.stopPlayback();
    this.currentChallenge = { entry: r.quest, variant: r.variant, definition: r.definition, def: r.definition.variants[r.variant.variantId]! };
    this.lastFeedback = null;
    this.aidState = { ...NO_AIDS };
    this.scopeState = ALL_CHOICE;
    this.noticeText = null;
  }

  /** 과제를 연다. 못 열면 이유와 전체 목록이 담긴 결과를 돌려준다(7.7). 기록은 보지 않는다 */
  open(questId: string, variantId?: string): ResolveResult {
    const r = this.deps.catalog.resolve(questId, variantId);
    if (!r.ok) return r;
    // 주소로 다른 도전을 열 때 도움 연습 중이었다면 먼저 원래 곡으로 돌아온다. 돌아가기는 늘 성공한다(7.5).
    // 주소가 연습으로 연 과제를 가리키면(연습을 시작해서 그 화면으로 왔다) 연습을 그대로 둔다
    const session = this.deps.session;
    if (session.inAssist) {
      const active = session.activeChallenge;
      const samePractice = !!session.supportContext?.practice && !!active && active.questId === r.quest.questId && active.variantId === r.variant.variantId;
      if (!samePractice) session.returnToOrigin();
    }
    const def = r.definition.variants[r.variant.variantId]!;
    this.deps.session.openChallenge(r.quest.questId, r.variant.variantId, { tempoBpm: def.score.tempoBpm });
    this.sync();
    this.emit();
    return r;
  }

  /**
   * 설치물의 '자유로 놀기'를 연다(4.2). 설치물이 다루는 첫 과제의 첫 판본을 틀로 삼는다(자리 수, 선반, 조표).
   * 합주 무대(T7)의 자유로 놀기는 '자유 가락'이다(4.9): 틀은 첫 판본의 4마디 4/4 한 성부이고 목표 악보만 비어 있다. 패널에서 편집한다.
   * 목표도 판정도 시도 기록도 없다. 초안은 다른 과제처럼 세션에 남고 저장된다. 열 수 없으면 false를 돌려준다.
   * 틀로 삼는 판본은 공개 상태와 상관없다: 틀에서 가져오는 것은 자리 수와 음역뿐이라 검수 전 내용이 드러나지 않는다.
   */
  openFree(installation: InstallationDef): boolean {
    const ref = installation.quests[0];
    const entry = ref ? this.deps.catalog.get(ref.questId) : undefined;
    const variantId = ref?.variantIds[0];
    const base = entry && variantId ? entry.definition.variants[variantId] : undefined;
    if (!entry || !base || !variantId) return false;
    const melody = stageLayoutOf(installation) !== null && isArrangementVariant(base);
    // 징검다리의 틀은 설치물이 다루는 판본들을 아우른다(가장 잘게 나눈 칸, 음역 전체, 줄 전체가 한 마디)
    const lookup = (q: string, v: string): QuestVariant | undefined => this.deps.catalog.get(q)?.definition.variants[v];
    const stones = melody ? null : freeStonesFrameOf(installation, lookup);
    // 종나무의 틀은 첫 판본에서 가져오되 음역을 가지 전체로 넓힌다(판정이 없으니 쓰지 않는 가지만 가려 둔다)
    const bells = melody || stones ? null : freeBellFrameOf(installation, lookup);
    // 계단밭의 틀은 열 여덟 개다(음자리표가 번갈아 선다). 판정이 없으니 정답은 뜻이 없다
    const terrace = melody || stones || bells ? null : freeTerraceFrameOf(installation, lookup);
    // 건반 다리의 틀은 설치물이 다루는 첫 과제의 종류를 따른다(이름표 자리, 밧줄, 깃발)
    const bridge = melody || stones || bells || terrace ? null : freeBridgeFrameOf(installation, lookup);
    if (!melody && !stones && !bells && !terrace && !bridge && !hasSlotMap(base)) return false;
    const frame = melody ? freeMelodyVariant(base) : (stones ?? bells ?? terrace ?? bridge ?? base);
    const questId = freeQuestId(installation.installationId);
    // 이미 이 자유로 놀기가 열려 있으면 그대로 둔다(패널로 옮겨도 도움과 듣기 범위가 남는다. 열려 있는 과제를 다시 여는 open과 같다)
    const active = this.deps.session.activeChallenge;
    const open = this.currentChallenge;
    if (open?.free && open.entry.questId === questId && active && active.questId === questId && active.variantId === FREE_VARIANT_ID) return true;
    const label = melody ? FREE_MELODY_LABEL : '자유로 놀기';
    const definition: QuestDefinition = {
      ...entry.definition,
      questId,
      title: label,
      availability: 'published',
      variantIds: [FREE_VARIANT_ID],
      variants: { [FREE_VARIANT_ID]: frame },
      placements: [],
      sourceRefs: [],
      assistanceLinks: [],
      feedbackRules: [],
    };
    // 자유 가락은 원래 판본이 쓰는 패널로 편집한다(곡 패널). 돌 설치물의 자유로 놀기는 패널이 없다
    const panelIds = melody ? [...(entry.variants.find((v) => v.variantId === variantId)?.panelIds ?? [])] : [];
    const variant: VariantEntry = { variantId: FREE_VARIANT_ID, label, state: 'open', descriptor: frame.challengeDescriptor, panelIds, installationIds: [installation.installationId] };
    const questEntry: QuestEntry = { questId, title: label, topicTags: [], state: 'open', variants: [variant], definition };
    if (this.deps.session.inAssist) this.deps.session.returnToOrigin();
    this.stopPlayback();
    // 세션이 알리기 전에 현재 도전을 정해 둔다(동기화가 같은 도전으로 보고 그대로 둔다)
    this.currentChallenge = { entry: questEntry, variant, definition, def: frame, free: true };
    this.lastFeedback = null;
    this.aidState = { ...NO_AIDS };
    this.scopeState = ALL_CHOICE;
    this.noticeText = null;
    this.deps.session.openChallenge(questId, FREE_VARIANT_ID, { tempoBpm: frame.score.tempoBpm });
    this.emit();
    return true;
  }

  /** 지금 도전이 자유로 놀기인가 */
  get isFree(): boolean {
    return this.currentChallenge?.free === true;
  }

  /** 지금 도전의 자리 변환표(디딤돌 같은 순서 칸). 없으면 null. 한 판본에 하나만 만든다 */
  slotMap(): SlotMap | null {
    const cur = this.currentChallenge;
    if (!cur || !hasSlotMap(cur.def)) return null;
    let m = this.slotMaps.get(cur.def);
    if (!m) {
      m = slotMapOf(cur.def);
      this.slotMaps.set(cur.def, m);
    }
    return m;
  }

  close(): void {
    this.stopPlayback();
    this.deps.session.closeChallenge();
    this.currentChallenge = null;
    this.lastFeedback = null;
    this.emit();
  }

  get current(): CurrentChallenge | null {
    return this.currentChallenge;
  }

  private requireCurrent(): CurrentChallenge {
    if (!this.currentChallenge) throw new Error('열려 있는 과제가 없어요');
    return this.currentChallenge;
  }

  // ------------------------------------------------------------------ 초안
  content(): DraftContent {
    return this.deps.session.content();
  }

  private signature(): string {
    const c = this.deps.session.content();
    return JSON.stringify([c.slots, c.events, c.tuplets]);
  }

  /** 초안을 고친다. 소리와 이전 판정은 고친 내용과 맞지 않으므로 멈추고 지운다 */
  edit(edit: DraftEdit, announce?: string): void {
    this.stopPlayback();
    this.deps.session.apply(edit);
    if (announce) this.liveText = announce;
    this.touch('edit');
    this.emit();
  }

  undo(): void {
    this.stopPlayback();
    if (this.deps.session.undo()) this.liveText = '실행을 취소했어요.';
    this.emit();
  }

  redo(): void {
    this.stopPlayback();
    if (this.deps.session.redo()) this.liveText = '취소한 것을 다시 했어요.';
    this.emit();
  }

  get canUndo(): boolean {
    return this.deps.session.canUndo;
  }

  get canRedo(): boolean {
    return this.deps.session.canRedo;
  }

  /** 놓은 것을 모두 지운다. 실행 취소로 되돌릴 수 있다 */
  clearAll(): void {
    const key = this.activeKey();
    this.stopPlayback();
    this.deps.session.apply({ type: 'clear' });
    if (key) this.assistUsed.delete(key);
    this.liveText = '놓은 것을 모두 지웠어요.';
    this.emit();
  }

  private activeKey(): string | null {
    const a = this.deps.session.activeChallenge;
    return a ? draftKey(a.questId, a.variantId) : null;
  }

  // ------------------------------------------------------------------ 박 칸 선택
  /** 고를 수 있는 칸. Q02는 칸 하나가 박 하나, 시간선 과제 Q03은 박 하나의 확대 창, 합주 과제 Q08은 마디 하나다 */
  cells(): GridCell[] {
    const def = this.requireCurrent().def;
    if (isArrangementVariant(def)) return measureCellsOf(def);
    return isTimelineVariant(def) ? beatCellsOf(def) : gridCellsOf(def);
  }

  /** 합주 과제인가: 칸이 마디 하나이고 성부가 여럿일 수 있다(5-4) */
  get isArrangement(): boolean {
    const cur = this.currentChallenge;
    return !!cur && isArrangementVariant(cur.def);
  }

  selectedCell(): GridCell | null {
    const sel = this.deps.session.selection();
    if (sel.slot === undefined || sel.measure === undefined) return null;
    return this.cells().find((c) => c.measureIndex === sel.measure && c.cellIndex === sel.slot) ?? null;
  }

  selectCell(cell: GridCell | null): void {
    if (!this.deps.session.readOnly) {
      this.deps.session.select(cell ? { measure: cell.measureIndex, slot: cell.cellIndex } : {});
    }
    if (!cell && this.aidState.repeat) this.setRepeat(false);
    this.emit();
  }

  // ------------------------------------------------------------------ 오선 칸 선택과 놓기(Q01)
  staffSlots(): StaffSlot[] {
    return staffSlotsOf(this.requireCurrent().def);
  }

  /** 칸에 놓인 음의 보표 위치. 비어 있으면 null */
  slotPosition(slot: StaffSlot): number | null {
    const entry = this.deps.session.content().slots.find((x) => x.slot === slot.slot);
    if (!entry || !entry.writtenPitch) return null;
    return staffPositionOf(slot.clef, spellWritten(entry.writtenPitch, slot.keySignature));
  }

  selectedSlot(): number | null {
    const sel = this.deps.session.selection();
    return sel.slot !== undefined && sel.measure === undefined ? sel.slot : null;
  }

  selectSlot(slot: StaffSlot | null): void {
    if (!this.deps.session.readOnly) this.deps.session.select(slot ? { slot: slot.slot } : {});
    this.emit();
  }

  /** 종나무에서 종 자리(초안 칸 번호, 0부터)를 고른다. null이면 고름을 푼다. 고른 자리는 초안 옆에 보관되어 패널과 월드가 같이 본다 */
  selectDraftSlot(draft: number | null): void {
    if (!this.deps.session.readOnly) this.deps.session.select(draft === null ? {} : { slot: draft });
    this.emit();
  }

  /** 순서 칸(디딤돌)에서 고른 자리(1부터). 순서 칸이 아닌 과제에서는 null */
  orderedCursor(): number | null {
    return this.slotMap() ? this.selectedSlot() : null;
  }

  /** 순서 칸의 한 자리를 고른다(1부터). null이면 고름을 푼다. 범위 밖이면 아무 일도 하지 않는다 */
  selectOrderedSlot(slot: number | null): void {
    const map = this.slotMap();
    if (!map) return;
    if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > map.count)) return;
    if (!this.deps.session.readOnly) this.deps.session.select(slot === null ? {} : { slot });
    this.emit();
  }

  /** 오선의 한 위치에 온음표를 놓는다. 위치는 범위 안으로 맞춘다. 소리가 켜져 있으면 그 음을 한 번 들려 준다 */
  placeOnStaff(slot: StaffSlot, position: number): void {
    const at = clampPosition(position);
    this.edit(placeOnStaffEdit(slot, at), `${slot.label}에 놓았어요. 자리는 ${describeStaffPosition(at)}이에요.`);
    this.selectSlot(slot);
    this.previewPitch(midiOf(spellWritten(writtenAt(slot, at), slot.keySignature)));
  }

  /** 위 · 아래로 한 칸씩 옮긴다. 아직 놓지 않았으면 가운데 줄에서 시작한다 */
  moveOnStaff(slot: StaffSlot, delta: number): void {
    const now = this.slotPosition(slot);
    if (now === null) {
      this.placeOnStaff(slot, SURFACE_START_POSITION);
      return;
    }
    const next = clampPosition(now + delta);
    if (next === now) {
      this.announce(`${slot.label}의 음은 더 ${delta > 0 ? '위로' : '아래로'} 옮길 수 없어요. 자리는 ${describeStaffPosition(now)}이에요.`);
      return;
    }
    this.placeOnStaff(slot, next);
  }

  clearStaffSlot(slot: StaffSlot): void {
    if (this.slotPosition(slot) === null) {
      this.announce(fillTemplate('{label:은는} 이미 비어 있어요.', { label: slot.label }));
      return;
    }
    this.edit(clearStaffSlotEdit(slot), `${slot.label}의 음을 지웠어요.`);
  }

  setLedger(on: boolean): void {
    this.aidState = { ...this.aidState, ledger: on };
    if (on) this.markAssist();
    this.liveText = on ? '덧줄이 놓일 자리를 점선으로 보여 줘요.' : '덧줄 안내를 껐어요.';
    this.emit();
  }

  // ------------------------------------------------------------------ 판정과 기록
  get feedback(): FeedbackView | null {
    const f = this.lastFeedback;
    if (!f || f.signature !== this.signature()) return null;
    const { signature: _signature, ...view } = f;
    return view;
  }

  get attempts(): readonly AttemptResult[] {
    return this.attemptLog;
  }

  /** '배치 확인'. 판정하고 시도를 기록한다. 판정할 수 없는 기술 문제는 음악 오답으로 적지 않는다 */
  check(): FeedbackView {
    const cur = this.requireCurrent();
    if (cur.free) throw new Error(FREE_PLAY_NO_CHECK);
    this.stopPlayback();
    const key = this.activeKey()!;
    let evaluation = null as ReturnType<typeof evaluateDraft> | null;
    let technicalMessage: string | undefined;
    try {
      evaluation = evaluateDraft(cur.def, this.deps.session.content());
    } catch (err) {
      technicalMessage = (err as Error).message;
    }
    const attempt = makeAttemptResult({
      attemptId: this.deps.makeId(),
      questId: cur.entry.questId,
      variantId: cur.variant.variantId,
      contentVersion: cur.definition.contentVersion,
      recordedAt: this.deps.nowIso(),
      evaluation,
      context: {
        tempoBpm: this.tempo().effective,
        originalTempoBpm: this.tempo().original,
        assistUsed: this.assistUsed.has(key),
        soundState: this.deps.mixer.soundState(),
        soundPlayed: this.soundPlayedSignature === this.signature(),
      },
      ...(technicalMessage ? { technicalFailure: { kind: 'content' as const, message: technicalMessage } } : {}),
    });
    this.attemptLog.push(attempt);
    // 통과한 뒤에만 덧붙이는 말: 화음의 전위를 알려 주기만 한다(Q23). 판정은 이미 끝났고 이 말은 결과를 바꾸지 않는다
    const shape = evaluation?.passed ? chordShapeTextOf(cur.def, this.deps.session.content()) : null;
    const view: FeedbackView = evaluation
      ? { attemptId: attempt.attemptId, passed: evaluation.passed, technical: false, messages: renderAll(evaluation.issues, cur.definition.feedbackRules), issues: evaluation.issues, ...(shape ? { notes: [shape] } : {}) }
      : { attemptId: attempt.attemptId, passed: false, technical: true, messages: ['이 도전을 확인하지 못했어요. 틀린 것이 아니에요. 잠시 뒤 다시 눌러 주세요.'], issues: [] };
    this.lastFeedback = { ...view, signature: this.signature() };
    this.liveText = view.passed ? (shape ? `통과했어요. ${shape}` : '통과했어요.') : view.technical ? view.messages[0]! : `고칠 곳이 ${view.messages.length}개 있어요. ${view.messages[0]}`;
    for (const l of [...this.attemptListeners]) l(attempt);
    this.emit();
    return view;
  }

  // ------------------------------------------------------------------ 템포와 도움
  get aids(): Aids {
    return { ...this.aidState };
  }

  /** 원래 템포는 과제의 설정이고 느리게 듣기가 바꾸지 않는다 */
  tempo(): TempoView {
    const cur = this.requireCurrent();
    const stored = this.deps.session.activeChallenge?.challengeSettings.tempoBpm;
    const original = typeof stored === 'number' ? stored : cur.def.score.tempoBpm;
    return { original, effective: this.aidState.slow ? slowTempoFor(original) : original, slow: this.aidState.slow };
  }

  private markAssist(): void {
    const key = this.activeKey();
    if (key) this.assistUsed.add(key);
  }

  setSlow(on: boolean): void {
    if (on === this.aidState.slow) return;
    this.aidState = { ...this.aidState, slow: on };
    if (on) this.markAssist();
    if (this.playingNow) this.deps.transport.setTempo(this.tempo().effective);
    this.emit();
  }

  /** 고른 박 칸만 되풀이해서 듣는다. 칸을 먼저 골라야 한다 */
  setRepeat(on: boolean): void {
    const cell = this.selectedCell();
    if (on && !cell) {
      this.noticeText = this.isArrangement ? '반복할 마디를 먼저 골라 주세요.' : '반복할 박 칸을 먼저 골라 주세요.';
      this.emit();
      return;
    }
    this.aidState = { ...this.aidState, repeat: on };
    this.noticeText = null;
    if (on) this.markAssist();
    if (this.playingNow) this.deps.transport.setSection(on && cell ? this.rangeOf(cell) : null, on);
    this.emit();
  }

  setShowCount(on: boolean): void {
    this.aidState = { ...this.aidState, showCount: on };
    if (on) this.markAssist();
    this.emit();
  }

  /** 반복 단추에 쓰는 이름. 예: '두 번째 박 반복'. 합주 과제는 마디 단위라 '2마디 반복'이다 */
  repeatLabel(): string {
    const cell = this.selectedCell();
    if (this.isArrangement) return cell ? `${cell.measureIndex + 1}마디 반복` : '마디 반복';
    return cell ? `${ordinalPosition(cell.cellIndex + 1)} 박 반복` : '박 반복';
  }

  // ------------------------------------------------------------------ 듣기 범위(Q08, 4.9)
  /** 지금 고른 듣기 범위 */
  get scopeChoice(): ScopeChoice {
    return { ...this.scopeState };
  }

  /** 이 과제에서 따로 들을 수 있는 성부들(위에서부터). 합주 과제가 아니면 빈 목록 */
  scopeVoices(): Array<{ voiceId: string; label: string }> {
    const cur = this.currentChallenge;
    if (!cur || !isArrangementVariant(cur.def)) return [];
    return timelineOf(cur.def).voices.map((v) => ({ voiceId: v.voiceId, label: v.label }));
  }

  /**
   * 듣기 범위를 고른다: 전체, 성부 하나만, 고른 마디만. 전체가 아니면 도움을 쓴 것으로 적는다(4.2 도움 메뉴의 '성부 분리').
   * 이 과제에 없는 성부는 고를 수 없다. 재생 중이면 멈춘다(다음에 듣기를 누르면 고른 범위로 들려요).
   */
  setScope(choice: ScopeChoice): void {
    if (!this.isArrangement) return;
    if (choice.kind === 'voice' && !this.scopeVoices().some((v) => v.voiceId === choice.voiceId)) return;
    const next: ScopeChoice = choice.kind === 'voice' ? { kind: 'voice', voiceId: choice.voiceId } : { kind: choice.kind } as ScopeChoice;
    const same = JSON.stringify(next) === JSON.stringify(this.scopeState);
    this.noticeText = null;
    if (!same) this.stopPlayback();
    this.scopeState = next;
    this.aidState = { ...this.aidState, scoped: next.kind !== 'all' };
    if (next.kind !== 'all') this.markAssist();
    this.liveText = `듣기 범위: ${this.scopeLabel()}.`;
    this.emit();
  }

  /** 지금 듣기가 가리키는 범위. '고른 마디'인데 마디를 고르지 않았으면 null */
  listenScope(): ListenScope | null {
    const choice = this.scopeState;
    if (choice.kind === 'all') return ALL_SCOPE;
    if (choice.kind === 'voice') return choice;
    const cell = this.selectedCell();
    return cell ? { kind: 'measure', measureIndex: cell.measureIndex } : null;
  }

  /** 범위의 이름. 예: '전체', '위 성부만', '2마디만', '고른 마디만' */
  scopeLabel(): string {
    const scope = this.listenScope();
    if (scope === null) return '고른 마디만';
    return scopeName(scope, this.scopeVoices());
  }

  usedAssist(): boolean {
    const key = this.activeKey();
    return key ? this.assistUsed.has(key) : false;
  }

  private rangeOf(cell: GridCell): { startTick: number; endTick: number } {
    const len = measureTicks(this.requireCurrent().def.score.meter);
    const start = cell.measureIndex * len + cell.onsetTicks;
    return { startTick: start, endTick: start + cell.durationTicks };
  }

  // ------------------------------------------------------------------ 소리
  get sound(): MixerSnapshot {
    return this.deps.mixer.snapshot();
  }

  /** '소리 켜기'. 사용자가 누른 안에서 불러야 한다 */
  async enableSound(): Promise<void> {
    await this.deps.mixer.enable();
    this.emit();
  }

  get soundAudible(): boolean {
    return this.deps.mixer.canPlaySound;
  }

  /** 소리를 껐다 켠다. 소리를 켠 뒤에만 뜻이 있다 */
  toggleMute(): void {
    this.deps.mixer.setMuted(!this.deps.mixer.muted);
    this.emit();
  }

  /** 짧은 음 하나를 들려 준다(오선에 놓거나 옮길 때). 소리가 꺼져 있으면 아무 일도 하지 않는다 */
  previewPitch(midi: number): void {
    this.touch('listen', 'note');
    this.deps.mixer.playTaskNote(midi);
  }

  // ------------------------------------------------------------------ 재생
  get playing(): Playing {
    return this.playingNow;
  }

  /** 지금 재생 위치(틱). 멈춰 있으면 null */
  positionTick(): number | null {
    return this.playingNow ? this.deps.transport.positionTick() : null;
  }

  /** '두 음 듣기'로 지금 울리고 있는 보표 칸 번호. 재생 중이 아니면 null. 소리를 꺼 두어도 위치는 움직인다 */
  playheadSlot(): number | null {
    const tick = this.positionTick();
    if (tick === null) return null;
    // '두 음 듣기'(놓은 음만 차례로)는 순서 칸이 있는 과제(Q12)에서도 자리마다 2박씩 지나간다
    const order = this.placedPlayOrder;
    if (order) return order.length === 0 ? null : (order[Math.min(order.length - 1, Math.floor(tick / PLACED_NOTE_TICKS))] ?? null);
    // 순서 칸(디딤돌)은 자리 하나가 4분음표 하나다. 내 배치와 목표 모두 같은 걸음으로 지나간다
    const map = this.slotMap();
    if (map) return Math.min(map.count, Math.floor(tick / SLOT_NOTE_TICKS) + 1);
    return null;
  }

  /** 재생 위치가 있는 박 칸 */
  playheadCell(): GridCell | null {
    const tick = this.positionTick();
    if (tick === null) return null;
    const len = measureTicks(this.requireCurrent().def.score.meter);
    const m = Math.floor(tick / len);
    const within = tick - m * len;
    return this.cells().find((c) => c.measureIndex === m && within >= c.onsetTicks && within < c.onsetTicks + c.durationTicks) ?? null;
  }

  playMine(): boolean {
    return this.play('mine');
  }

  playTarget(): boolean {
    return this.play('target');
  }

  private play(which: 'mine' | 'target'): boolean {
    const cur = this.requireCurrent();
    this.noticeText = null;
    this.placedPlayOrder = null;
    this.toneWindows = null;
    if (which === 'target' && cur.free) {
      this.stopPlayback();
      this.noticeText = FREE_PLAY_NO_TARGET;
      this.emit();
      return false;
    }
    const map = which === 'mine' ? this.slotMap() : null;
    let load: { notes: PlayNote[]; lengthTicks: number; tempoBpm: number; tempoReference: Parameters<TaskTransport['load']>[0]['tempoReference'] };
    // 합주 과제: 고른 범위(전체, 성부 하나, 고른 마디)로 들려 준다. 곡 전체 길이를 지켜서 빈 마디도 지나간다
    let sectionOnce: { startTick: number; endTick: number } | null = null;
    if (!map && this.isArrangement) {
      const scope = this.listenScope();
      if (scope === null) {
        this.stopPlayback();
        this.noticeText = NO_MEASURE_NOTICE;
        this.emit();
        return false;
      }
      const score = which === 'mine' ? draftScoreOf(cur.def.score, this.deps.session.content()) : cur.def.score;
      const sp = scopedPlayback(score, scope, this.tempo().effective, songLengthTicks(cur.def));
      if (sp.audibleCount === 0) {
        this.stopPlayback();
        this.noticeText = which === 'mine' && scope.kind === 'all' ? NO_NOTES_NOTICE : NOTHING_IN_SCOPE_NOTICE;
        this.emit();
        return false;
      }
      load = { notes: sp.notes, lengthTicks: sp.lengthTicks, tempoBpm: sp.tempoBpm, tempoReference: sp.tempoReference };
      sectionOnce = sp.section;
    } else if (map) {
      // 디딤돌: 자리 번호 순서대로 4분음표씩. 빈 자리는 쉰다(4.3 '4분음표 80으로 왼쪽부터 차례로')
      const pb = map.playback(this.deps.session.content());
      load = { notes: pb.notes, lengthTicks: pb.lengthTicks, tempoBpm: this.tempo().effective, tempoReference: 'quarter' };
    } else {
      const score = which === 'mine' ? draftScoreOf(cur.def.score, this.deps.session.content()) : cur.def.score;
      const pb = scoreToPlayback(score, { tempoBpm: this.tempo().effective });
      load = { notes: pb.notes, lengthTicks: pb.lengthTicks, tempoBpm: pb.tempoBpm, tempoReference: pb.tempoReference };
    }
    if (load.notes.length === 0) {
      this.stopPlayback();
      this.noticeText = map ? NO_SLOT_NOTES_NOTICE : NO_NOTES_NOTICE;
      this.emit();
      return false;
    }
    this.deps.transport.load(load);
    const cell = this.selectedCell();
    if (this.aidState.repeat && cell) this.deps.transport.setSection(this.rangeOf(cell), true);
    else if (sectionOnce) this.deps.transport.setSection(sectionOnce, false);
    this.endTaskSound?.();
    this.endTaskSound = this.deps.mixer.beginTaskSound();
    this.playingNow = which;
    this.touch('listen', which);
    this.deps.transport.play();
    if (which === 'mine' && this.deps.mixer.canPlaySound) this.soundPlayedSignature = this.signature();
    this.emit();
    return true;
  }

  /** 오선에 놓은 음들을 차례로 들려 준다(Q01의 '두 음 듣기'). 놓지 않은 칸은 건너뛴다 */
  playPlacedNotes(): boolean {
    const cur = this.requireCurrent();
    const content = this.deps.session.content();
    const notes: PlayNote[] = [];
    const order: number[] = [];
    for (const slot of staffSlotsOf(cur.def)) {
      const entry = content.slots.find((x) => x.slot === slot.slot);
      if (!entry || !entry.writtenPitch) continue;
      notes.push({ id: `slot-${slot.slot}`, midi: midiOf(spellWritten(entry.writtenPitch, slot.keySignature)), onsetTick: notes.length * PLACED_NOTE_TICKS, durationTick: PLACED_NOTE_TICKS });
      order.push(slot.slot);
    }
    this.noticeText = null;
    this.toneWindows = null;
    if (notes.length === 0) {
      this.stopPlayback();
      this.noticeText = NO_STAFF_NOTES_NOTICE;
      this.emit();
      return false;
    }
    this.deps.transport.load({ notes, lengthTicks: notes.length * PLACED_NOTE_TICKS, tempoBpm: this.tempo().effective, tempoReference: 'quarter' });
    this.placedPlayOrder = order;
    this.endTaskSound?.();
    this.endTaskSound = this.deps.mixer.beginTaskSound();
    this.playingNow = 'mine';
    this.touch('listen', 'mine');
    this.deps.transport.play();
    if (this.deps.mixer.canPlaySound) this.soundPlayedSignature = this.signature();
    this.emit();
    return true;
  }

  /**
   * 칸에 걸린 음들을 모드에 맞게 들려 준다(Q04 이름표, Q05·Q06 종, Q09–Q12 계단밭의 등). 함께, 아래부터 차례로, 가장 낮은 것만은 `toneNotesOf`가 정한다.
   * 들려 줄 음이 없으면 소리를 내지 않고 이유를 알린다. which가 'target'이면 목표를 듣는 것이다(내 배치를 들었다는 기록은 남지 않는다).
   */
  playTones(notes: readonly ToneNote[], emptyNotice: string = NO_TONE_NOTICE, which: 'mine' | 'target' = 'mine'): boolean {
    this.requireCurrent();
    this.noticeText = null;
    this.placedPlayOrder = null;
    this.toneWindows = null;
    if (notes.length === 0) {
      this.stopPlayback();
      this.noticeText = emptyNotice;
      this.emit();
      return false;
    }
    const lengthTicks = Math.max(...notes.map((n) => n.onsetTick + n.durationTick));
    this.deps.transport.load({
      notes: notes.map((n) => ({ id: `tone-${n.slot}`, midi: n.midi, onsetTick: n.onsetTick, durationTick: n.durationTick })),
      lengthTicks,
      tempoBpm: this.tempo().effective,
      tempoReference: 'quarter',
    });
    this.toneWindows = notes.map((n) => ({ slot: n.slot, from: n.onsetTick, to: n.onsetTick + n.durationTick }));
    this.endTaskSound?.();
    this.endTaskSound = this.deps.mixer.beginTaskSound();
    this.playingNow = which;
    this.touch('listen', which);
    this.deps.transport.play();
    if (which === 'mine' && this.deps.mixer.canPlaySound) this.soundPlayedSignature = this.signature();
    this.emit();
    return true;
  }

  /**
   * 만들어 둔 재생(예: 저장한 곡)을 들려 준다. 열려 있는 도전이 없어도 된다(수첩, 무대). 소리가 꺼져 있어도 위치는 움직인다.
   * 도전의 초안, 판정, 기록, 사용 기록의 '다시 듣기'와 상관없다. 이미 듣고 있던 것은 멈춘다. 들려 줄 음이 없으면 false.
   */
  previewPlayback(playback: Playback): boolean {
    this.stopPlayback();
    this.noticeText = null;
    this.placedPlayOrder = null;
    this.toneWindows = null;
    if (playback.notes.length === 0) {
      this.noticeText = '들려 줄 음이 없어요.';
      this.emit();
      return false;
    }
    this.deps.transport.load({ notes: playback.notes, lengthTicks: playback.lengthTicks, tempoBpm: playback.tempoBpm, tempoReference: playback.tempoReference });
    this.endTaskSound = this.deps.mixer.beginTaskSound();
    this.previewNow = true;
    this.deps.transport.play();
    this.emit();
    return true;
  }

  /** 만들어 둔 재생(previewPlayback)을 듣는 중인가 */
  get previewing(): boolean {
    return this.previewNow;
  }

  /** 만들어 둔 재생의 지금 위치(틱). 듣는 중이 아니면 null */
  previewTick(): number | null {
    return this.previewNow ? this.deps.transport.positionTick() : null;
  }

  /** 지금 울리는 칸 번호들. 함께 울릴 때는 여럿이다. 재생 중이 아니면 빈 목록. 소리를 꺼 두어도 위치는 움직인다 */
  playheadSlots(): number[] {
    const tick = this.positionTick();
    if (tick === null) return [];
    const windows = this.toneWindows;
    if (windows) return windows.filter((w) => tick >= w.from && tick < w.to).map((w) => w.slot);
    const one = this.playheadSlot();
    return one === null ? [] : [one];
  }

  stopPlayback(): void {
    if (this.playingNow || this.previewNow || this.endTaskSound) {
      this.deps.transport.stop();
      this.finishPlayback();
    }
  }

  private finishPlayback(): void {
    this.playingNow = null;
    this.previewNow = false;
    this.placedPlayOrder = null;
    this.toneWindows = null;
    this.endTaskSound?.();
    this.endTaskSound = null;
  }

  // ------------------------------------------------------------------ 안내 문구
  /** 눈에 보이지 않지만 화면 낭독기가 읽는 알림 */
  get live(): string {
    return this.liveText;
  }

  get notice(): string | null {
    return this.noticeText;
  }

  /** 화면 낭독기가 읽을 짧은 알림을 남긴다 */
  announce(text: string): void {
    this.liveText = text;
    this.emit();
  }

  /** 화면에 보이는 짧은 안내를 남긴다(화면 낭독기도 읽는다). null이면 지운다 */
  notify(text: string | null): void {
    this.noticeText = text;
    if (text) this.liveText = text;
    this.emit();
  }

  // ------------------------------------------------------------------ 도움 연습(7.5)
  get inAssist(): boolean {
    return this.deps.session.inAssist;
  }

  get supportContext(): SupportContext | null {
    return this.deps.session.supportContext;
  }

  /** 돌아갈 원래 도전의 이름과 주소. 도움 연습 중이 아니면 null */
  origin(): { title: string; variantLabel: string; hash: string } | null {
    const ctx = this.deps.session.supportContext;
    if (!ctx) return null;
    const { questId, variantId } = ctx.origin.challenge;
    const hash = ContentCatalog.hashFor(questId, variantId);
    const entry = this.deps.catalog.get(questId);
    if (!entry) return { title: questId, variantLabel: variantId, hash };
    return { title: entry.title, variantLabel: entry.variants.find((v) => v.variantId === variantId)?.label ?? variantId, hash };
  }

  /** 초안을 고칠 수 없는 상태인가: 원래 도전을 그대로 둔 도움 연습 중이다(연습 과제를 따로 연 연습은 고칠 수 있다) */
  get readOnly(): boolean {
    return this.deps.session.readOnly;
  }

  /**
   * 기본 연습을 연다(5-5). 지금 도전의 초안과 설정은 보관되고, 연습 과제는 자기 초안으로 열린다.
   * 연습을 끝내지 않고 `returnToOrigin`을 불러도 원래 곡이 그대로 돌아온다. 못 열면 이유가 담긴 결과를 돌려주고 아무것도 바꾸지 않는다.
   * 화면을 옮기는 일(연습 과제의 주소로 가기)은 부른 쪽이 한다.
   */
  startPractice(questId: string, variantId?: string): ResolveResult {
    const r = this.deps.catalog.resolve(questId, variantId);
    if (!r.ok) return r;
    const cur = this.requireCurrent();
    // 자기 자신은 연습으로 열지 않는다(내용 검사가 막지만, 화면에서도 아무 일 없이 돌려준다)
    if (!cur.free && cur.entry.questId === r.quest.questId && cur.variant.variantId === r.variant.variantId) return r;
    this.stopPlayback();
    const def = r.definition.variants[r.variant.variantId]!;
    this.deps.session.enterAssist('basicPractice', r.quest.questId, {}, { questId: r.quest.questId, variantId: r.variant.variantId, challengeSettings: { tempoBpm: def.score.tempoBpm } });
    this.sync();
    this.liveText = `기본 연습을 열었어요: ${r.quest.title}. 원래 곡으로 돌아가기는 늘 눌러요.`;
    this.emit();
    return r;
  }

  /** 항상 성공한다. 연습의 결과와 무관하게 원래 곡의 초안, 판본, 선택이 그대로 돌아온다 */
  returnToOrigin(): void {
    this.stopPlayback();
    this.deps.session.returnToOrigin();
    this.sync();
    this.liveText = '원래 곡으로 돌아왔어요.';
    this.emit();
  }
}
