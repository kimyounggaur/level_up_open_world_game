// 7-1 계단밭(T5, 4.7) 놓기 작업대(TerraceBench): 열(세로줄)마다 등(음표) 하나를 온음계 한 칸씩 올리고 내려 높이를 맞추는 조작.
// 설치물 모드(월드)가 쓴다. 오선 패널(StaffPanel)이 같은 초안을 다른 모양으로 보여 주므로, 밭에서 놓은 등이 패널의 오선에 그대로 보이고 패널에서 놓은 것이 월드로 돌아오면 그 높이에 놓여 있다(초안 하나, 보는 방법 둘).
// - 초안은 컨트롤러(ChallengeSession)가 쥐고 있다. 작업대는 따로 들고 있는 것이 없다: 고른 열은 초안의 선택(selection)이고, 열마다 등의 높이는 초안 칸의 기보 음이다.
// - 열 하나에 등 하나다. 열을 고른 뒤 ↑↓로 한 칸씩 옮기고, 보표 밖이면 덧줄 돌담이 생긴다. 높이를 직접 눌러 놓을 수도 있다(눌러서 놓기).
// - 판정기에 넘어가는 것은 칸의 음자리표·음이름·옥타브·변화뿐이다. 월드의 좌표와 걸은 시간은 여기서 끝난다(W-3): 월드가 눌린 높이를 칸 수(정수)로 바꿔 넘겨 준다.
// - 끌어 놓기 없이 모두 된다(W-4): 키보드(terraceKeys의 표), 높이를 눌러 놓기, 단추.
// - 문제를 푸는 중에는 높이를 보표 위치(아래 첫 덧줄 …)로만 말한다. 이름을 알려 주면 높이를 찾는 일이 사라진다. 자유로 놀 때만 이름도 말한다.
import { FREE_PLAY_NO_CHECK } from './controller';
import type { ChallengeController } from './controller';
import type { QuestVariant } from '../../domain/content';
import { TERRACE_COLUMNS, flaggedTerraceDrafts, terraceAccidentalResult, terraceAccidentalSetResult, terraceAccidentalsAllowed, terraceClearResult, terraceColumnsOf, terracePlaceResult, terraceShiftResult, terraceSpeakOf, terraceStartStep, terraceStatesOf, terraceTargetsOf, terraceViewOf } from '../../domain/terrace';
import type { TerraceColumn, TerraceMap, TerraceState, TerraceView } from '../../domain/terrace';
import type { DraftContent } from '../../domain/session';
import type { ToneNote } from '../../domain/slotplan';
import type { BenchRequest } from './slotBench';
import { OCTAVE_STEPS } from './terraceKeys';
import type { TerraceAction } from './terraceKeys';
import { NO_ACCIDENTAL_NOTICE, NO_LAMP_NOTICE, PICK_COLUMN_FIRST, UNUSED_COLUMN_NOTICE } from './terraceText';

/** '내 등 듣기'와 '목표 듣기'에서 등 하나가 울리는 길이(틱): 4분음표 */
export const LAMP_NOTE_TICKS = 960;

export class TerraceBench {
  private readonly controller: ChallengeController;
  readonly map: TerraceMap;
  private readonly fitCache = new WeakMap<QuestVariant, TerraceColumn[] | null>();
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;

  constructor(controller: ChallengeController, map: TerraceMap) {
    this.controller = controller;
    this.map = map;
    this.off = controller.subscribe(() => this.emit());
  }

  dispose(): void {
    this.off();
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  // ------------------------------------------------------------------ 읽기
  /**
   * 이 판본의 열들(왼쪽부터). 이 밭에서 풀 수 없는 판본이면 null이다: 판정기가 음이름·음계 순서가 아니거나, 열이 여덟 개를 넘거나,
   * 칸의 음자리표가 이 밭에 없거나, 쓸 수 있는 높이가 비어 있는 경우다. 판본마다 한 번만 계산한다.
   */
  columnsFor(variant: QuestVariant): TerraceColumn[] | null {
    if (this.fitCache.has(variant)) return this.fitCache.get(variant) ?? null;
    let cols: TerraceColumn[] | null = null;
    const type = variant.evaluatorSpec.type;
    if (type === 'pitchSpelling' || type === 'orderedScale') {
      try {
        const all = terraceColumnsOf(this.map, variant);
        const ok = all.length > 0 && all.length <= TERRACE_COLUMNS && all.every((c) => this.map.clefs.includes(c.clef) && c.minStep <= c.maxStep);
        cols = ok ? all : null;
      } catch {
        cols = null;
      }
    }
    this.fitCache.set(variant, cols);
    return cols;
  }

  /** 지금 도전을 이 밭에서 풀 수 있는가 */
  get available(): boolean {
    const cur = this.controller.current;
    return !!cur && this.columnsFor(cur.def) !== null;
  }

  /** 열려 있는 판본. 쓸 수 없으면 오류다 */
  get variant(): QuestVariant {
    const cur = this.controller.current;
    if (!cur || !this.columnsFor(cur.def)) throw new Error('열려 있는 과제에 계단밭 작업대가 없어요');
    return cur.def;
  }

  /** 자유로 놀기인가(판정과 목표가 없다. 등의 이름도 말한다) */
  get free(): boolean {
    return this.controller.isFree;
  }

  /** 열려 있는 판본의 열들. 쓸 수 없으면 오류다 */
  columns(): TerraceColumn[] {
    const cols = this.columnsFor(this.variant);
    if (!cols) throw new Error('열려 있는 과제에 계단밭 작업대가 없어요');
    return cols;
  }

  private content(): DraftContent {
    return this.controller.content();
  }

  /** 열마다 놓인 등(열 차례) */
  states(): TerraceState[] {
    return terraceStatesOf(this.columns(), this.content());
  }

  private stateOf(col: TerraceColumn): TerraceState {
    return this.states().find((s) => s.draft === col.draft)!;
  }

  /** 놓은 등의 수 */
  placedCount(): number {
    return this.states().filter((s) => s.written !== null).length;
  }

  /** 변화표를 쓸 수 있는가(자유로 놀기와, 조표나 임시표가 나오는 과제) */
  get accidentalsAllowed(): boolean {
    return terraceAccidentalsAllowed(this.variant);
  }

  /** 고른 열(초안 칸 번호). 아직 고르지 않았거나 이 판본의 열이 아니면 null */
  get cursor(): number | null {
    const c = this.controller.selectedSlot();
    if (c === null || !this.available) return null;
    return this.columns().some((col) => col.draft === c) ? c : null;
  }

  /** 고른 열. 고르지 않았으면 null */
  cursorColumn(): TerraceColumn | null {
    const c = this.cursor;
    return c === null ? null : (this.columns().find((col) => col.draft === c) ?? null);
  }

  /** 판정이 가리킨 열(느낌표 표식을 세울 곳). 놓은 것이 바뀌면 사라진다 */
  flagged(): number[] {
    const f = this.controller.feedback;
    return f && !f.technical && !f.passed && this.available ? flaggedTerraceDrafts(this.columns(), f.issues) : [];
  }

  /** 듣는 중 지금 울리는 열 */
  playhead(): number[] {
    return this.controller.playing ? this.controller.playheadSlots() : [];
  }

  /** 월드가 그릴 모습. 열려 있지 않은 도전(걷는 중, 패널을 다녀오는 중)은 보관된 초안의 등만 보인다 */
  viewFor(variant: QuestVariant, content: DraftContent, live: boolean, free: boolean): TerraceView | null {
    const columns = this.columnsFor(variant);
    if (!columns) return null;
    return terraceViewOf(columns, content, {
      cursor: live ? this.cursor : null,
      flagged: new Set(live ? this.flagged() : []),
      playing: new Set(live ? this.playhead() : []),
      free,
    });
  }

  /** 고른 열을 말로. 예: 'E4 열, 아래 첫 덧줄에 있어요.' / 'E4 열, 비어 있어요.' */
  describe(col: TerraceColumn): string {
    const s = this.stateOf(col);
    if (s.written === null) return `${col.label} 열, 비어 있어요.`;
    return `${col.label} 열, ${terraceSpeakOf(s, this.free)}에 있어요.`;
  }

  // ------------------------------------------------------------------ 열 고르기
  /** 열을 직접 고른다(초안 칸 번호). 소리는 내지 않는다 */
  selectColumn(draft: number | null): void {
    if (!this.available) return;
    if (draft === null) {
      this.controller.selectDraftSlot(null);
      return;
    }
    const col = this.columns().find((c) => c.draft === draft);
    if (!col) return;
    this.controller.selectDraftSlot(col.draft);
    this.controller.announce(this.describe(col));
  }

  /** ← →: 열을 한 칸씩 옮긴다. 아직 고르지 않았으면 첫 열부터 시작한다 */
  moveCursor(delta: 1 | -1): void {
    if (!this.available) return;
    const cols = this.columns();
    const now = this.cursorColumn();
    if (!now) {
      this.selectColumn(cols[0]!.draft);
      return;
    }
    const at = cols.indexOf(now) + delta;
    if (at < 0 || at >= cols.length) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 열이에요. ${this.describe(now)}`);
      return;
    }
    this.selectColumn(cols[at]!.draft);
  }

  // ------------------------------------------------------------------ 놓기, 높이 바꾸기, 빼기
  /** 편집 결과를 반영한다: 바뀐 것이 있으면 고치고 말하고, 없으면 말만 한다. 소리가 켜져 있으면 그 높이를 들려 준다 */
  private apply(col: TerraceColumn, r: ReturnType<typeof terracePlaceResult>): void {
    this.controller.selectDraftSlot(col.draft);
    if (!r.ok) {
      this.controller.announce(r.text);
      return;
    }
    if (r.edit) this.controller.edit(r.edit, r.text);
    else this.controller.announce(r.text);
    if (r.midi !== null) this.controller.previewPitch(r.midi);
  }

  /** ↑ ↓, PageUp PageDown: 고른 열의 등을 올리고 내린다. 등이 없으면 가운데 줄에 놓는다. 열을 고르지 않았으면 첫 열을 고른다 */
  moveStep(delta: number): void {
    if (!this.available) return;
    const col = this.cursorColumn();
    if (!col) {
      this.selectColumn(this.columns()[0]!.draft);
      return;
    }
    this.apply(col, terraceShiftResult(col, this.content(), delta, this.free));
  }

  /** Enter, Space: 등이 없는 열에는 가운데 줄에 놓고, 있는 열에서는 그 등을 울려 본다. 열을 고르지 않았으면 첫 열을 고른다 */
  place(): void {
    if (!this.available) return;
    const col = this.cursorColumn();
    if (!col) {
      this.selectColumn(this.columns()[0]!.draft);
      return;
    }
    const s = this.stateOf(col);
    if (s.written === null) {
      this.apply(col, terracePlaceResult(col, this.content(), terraceStartStep(col), this.free));
      return;
    }
    this.controller.announce(this.describe(col));
    if (s.midi !== null) this.controller.previewPitch(s.midi);
  }

  /** Backspace: 고른 열의 등을 뺀다 */
  remove(): void {
    if (!this.available) return;
    const col = this.cursorColumn();
    if (!col) {
      this.controller.announce(PICK_COLUMN_FIRST);
      return;
    }
    this.apply(col, terraceClearResult(col, this.content()));
  }

  /** Shift+↑ ↓: 고른 등의 변화표를 한 칸씩 바꾼다(♭ 없음 ♯). 변화표를 쓰지 않는 과제에서는 알리기만 한다 */
  shiftAccidental(delta: 1 | -1): void {
    if (!this.available) return;
    if (!this.accidentalsAllowed) {
      this.controller.announce(NO_ACCIDENTAL_NOTICE);
      return;
    }
    const col = this.cursorColumn();
    if (!col) {
      this.controller.announce(PICK_COLUMN_FIRST);
      return;
    }
    this.apply(col, terraceAccidentalResult(col, this.content(), delta));
  }

  /** 변화표를 직접 고른다(눌러서 고르기, W-4). 고른 열에 등이 있어야 한다. 변화표를 쓰지 않는 과제에서는 알리기만 한다 */
  pickAccidental(accidental: 'sharp' | 'flat' | null): void {
    if (!this.available) return;
    if (!this.accidentalsAllowed) {
      this.controller.announce(NO_ACCIDENTAL_NOTICE);
      return;
    }
    const col = this.cursorColumn();
    if (!col) {
      this.controller.announce(PICK_COLUMN_FIRST);
      return;
    }
    this.apply(col, terraceAccidentalSetResult(col, this.content(), accidental));
  }

  /** 열의 높이를 눌렀다(눌러서 놓기, W-4). 열 번호는 설치물의 자리 번호(1부터), 높이는 월드가 바꿔 준 온음계 칸 수다. 높이 없이 눌렀으면 열만 고른다 */
  press(column: number, step?: number): void {
    if (!this.available) return;
    const col = this.columns().find((c) => c.column === column);
    if (!col) {
      this.controller.announce(UNUSED_COLUMN_NOTICE);
      return;
    }
    if (step === undefined || !Number.isInteger(step)) {
      this.selectColumn(col.draft);
      return;
    }
    const s = this.stateOf(col);
    if (s.step === step) {
      // 이미 등이 있는 높이: 그 열을 고르고 울려 본다(눌러서 지나가다 놓은 것을 바꾸지 않는다)
      this.controller.selectDraftSlot(col.draft);
      this.controller.announce(this.describe(col));
      if (s.midi !== null) this.controller.previewPitch(s.midi);
      return;
    }
    // 빈 열이면 놓고, 다른 높이에 있으면 그 높이로 옮긴다. 변화표는 그대로다
    this.apply(col, terracePlaceResult(col, this.content(), step, this.free));
  }

  // ------------------------------------------------------------------ 듣기
  private lampNotes(): ToneNote[] {
    return this.states()
      .filter((s) => s.midi !== null)
      .map((s, i): ToneNote => ({ slot: s.draft, midi: s.midi!, onsetTick: i * LAMP_NOTE_TICKS, durationTick: LAMP_NOTE_TICKS }));
  }

  /** P: 내 등을 열 차례(왼쪽부터)대로 들려 준다. 놓은 등이 없으면 이유를 알린다 */
  hearMine(): boolean {
    if (!this.available) return false;
    return this.controller.playTones(this.lampNotes(), NO_LAMP_NOTICE, 'mine');
  }

  /** T: 목표 음을 열 차례대로 들려 준다. 자유로 놀 때는 목표가 없어 컨트롤러가 이유를 알린다 */
  hearTarget(): boolean {
    if (!this.available) return false;
    if (this.free) return this.controller.playTarget();
    const notes = terraceTargetsOf(this.variant).map((t, i): ToneNote => ({ slot: t.draft, midi: t.midi, onsetTick: i * LAMP_NOTE_TICKS, durationTick: LAMP_NOTE_TICKS }));
    return this.controller.playTones(notes, NO_LAMP_NOTICE, 'target');
  }

  // ------------------------------------------------------------------ 키 지도 실행
  /**
   * 키 지도(terraceActionOf)의 동작을 실행한다. 월드 화면이나 패널 틀에 부탁할 일이면 그 부탁을 돌려준다.
   * 소리 내기(P, T)와 판정(C)은 컨트롤러가 한다. 자유로 놀 때는 목표도 판정도 없어 안내만 남긴다(4.2).
   */
  perform(action: TerraceAction): BenchRequest | null {
    switch (action) {
      case 'cursor-left':
        this.moveCursor(-1);
        return null;
      case 'cursor-right':
        this.moveCursor(1);
        return null;
      case 'step-up':
        this.moveStep(1);
        return null;
      case 'step-down':
        this.moveStep(-1);
        return null;
      case 'octave-up':
        this.moveStep(OCTAVE_STEPS);
        return null;
      case 'octave-down':
        this.moveStep(-OCTAVE_STEPS);
        return null;
      case 'accidental-up':
        this.shiftAccidental(1);
        return null;
      case 'accidental-down':
        this.shiftAccidental(-1);
        return null;
      case 'place':
        this.place();
        return null;
      case 'remove':
        this.remove();
        return null;
      case 'undo':
        this.controller.undo();
        return null;
      case 'redo':
        this.controller.redo();
        return null;
      case 'hear-mine':
        this.hearMine();
        return null;
      case 'hear-target':
        this.hearTarget();
        return null;
      case 'stop':
        this.controller.stopPlayback();
        return null;
      case 'check':
        if (this.controller.isFree) this.controller.notify(FREE_PLAY_NO_CHECK);
        else this.controller.check();
        return null;
      case 'view-panel':
      case 'help':
      case 'exit':
        return action;
    }
  }
}
