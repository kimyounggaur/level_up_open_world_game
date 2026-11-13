// 6-7 종나무(T4, 4.6) 놓기 작업대(BellBench): 손에 든 종(음이름 + 변화표)을 종 자리(열)의 가지(높이, 옥타브)에 거는 조작.
// 설치물 모드(월드)가 쓴다. 판(패널)이 같은 초안을 다른 모양으로 보여 주므로, 월드에서 건 종이 판에 그대로 보이고 판에서 고친 것이 월드로 돌아오면 반영되어 있다(초안 하나, 보는 방법 둘).
// - 초안은 컨트롤러(ChallengeSession)가 쥐고 있다. 작업대는 '손에 든 종'과 '종을 걸 가지(빈 열에서)'만 따로 들고, 고른 종 자리는 초안의 선택(selection)을 쓴다.
// - 한 열에는 종이 하나다. 가지(고리)를 누르면 그 열의 종이 그 가지로 옮겨 간다. 빈 열이면 손에 든 종을 그 가지에 건다.
// - 세 모양: 나무(형태 'tree', 종 칸 네 개, 구성음 판정), 종탑('tower', 종 세 개가 걸린 채 시작, 전위 판정), 빈터('glade', 나무 여러 그루, 화음 사건 목록 판정).
// - 판정기에 넘어가는 것은 초안의 종 칸(음이름·변화표·옥타브)뿐이다. 월드의 좌표와 걸은 시간은 여기서 끝난다(W-3).
// - 끌어 놓기 없이 모두 된다(W-4): 키보드(bellKeys의 표), 가지를 눌러 걸기, 단추.
import { bellCellOf, bellClearResult, bellDraftCount, bellHangResult, bellOctavesOf, bellShiftResult, bellStatesOf, bellViewOf, defaultRingOctave, flaggedBellDrafts } from '../../domain/bells';
import type { BellMap, BellState, BellView } from '../../domain/bells';
import type { QuestVariant } from '../../domain/content';
import { fillTemplate } from '../../domain/feedback';
import { midiOf, pitchName } from '../../domain/pitch';
import type { Accidental, Letter, WrittenPitch } from '../../domain/pitch';
import type { DraftContent } from '../../domain/session';
import { chordRouteNotesOf, hungTonesOfTree, soundingTonesOf, toneMuteResult, toneNotesOf, toneOctaveResult, toneShiftResult, toneSwapResult } from '../../domain/slotplan';
import type { ToneMode } from '../../domain/slotplan';
import { spellWritten } from '../../domain/session';
import { FREE_PLAY_NO_CHECK } from './controller';
import type { ChallengeController } from './controller';
import type { BellAction, BellForm } from './bellKeys';
import { HEAR_MODES, NO_BELL_NOTICE, NO_SOUNDING_BELL_NOTICE, TOWER_NO_HAND, TOWER_NO_REMOVE, TREE_NO_MUTE, bellLabelOf, hearModeLabel, treeNameOf } from './bellText';
import type { BenchRequest } from './slotBench';

type Hung = Extract<Accidental, 'sharp' | 'flat'> | null;

/** 손에 든 종: 음이름과 변화표. 높이(옥타브)는 걸 가지가 정한다 */
export interface BellHand {
  letter: Letter;
  accidental: Hung;
}

export const BELL_LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const FORM_OF: Readonly<Record<string, BellForm>> = { triadMembership: 'tree', inversion: 'tower', chordSequence: 'glade' };

const ACCIDENTAL_MARK: Readonly<Record<string, string>> = { sharp: '♯', flat: '♭' };
const keySignatureOf = (variant: QuestVariant): number => variant.score.staves[0]?.keySignature ?? 0;
const ACCIDENTAL_LADDER: readonly Hung[] = ['flat', null, 'sharp'];

/** 손에 든 종의 이름(옥타브 없이). 예: 'E♭' */
export const handNameOf = (hand: BellHand): string => `${hand.letter}${hand.accidental ? ACCIDENTAL_MARK[hand.accidental] : ''}`;

export class BellBench {
  private readonly controller: ChallengeController;
  readonly map: BellMap;
  private handState: BellHand = { letter: 'C', accidental: null };
  private ringState: number | null = null;
  private modeState: ToneMode = 'together';
  private handKey: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;

  constructor(controller: ChallengeController, map: BellMap) {
    this.controller = controller;
    this.map = map;
    // 도전이 닫히거나 바뀌면 손과 걸 가지와 듣는 방식을 처음으로 돌린다(읽을 때만 돌리면 닫았다가 같은 도전을 다시 열 때 지난 손이 남는다)
    this.off = controller.subscribe(() => {
      this.sync();
      this.emit();
    });
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
  /** 지금 도전이 이 설치물의 종나무 판본인가(판정기 종류와 설치물의 모양이 맞는다) */
  get available(): boolean {
    const type = this.controller.current?.def.evaluatorSpec.type;
    return type !== undefined && FORM_OF[type] === this.map.form;
  }

  get form(): BellForm {
    return this.map.form;
  }

  /** 열려 있는 판본. 쓸 수 없으면 오류다 */
  get variant(): QuestVariant {
    const cur = this.controller.current;
    if (!cur || !this.available) throw new Error('열려 있는 과제에 종나무 작업대가 없어요');
    return cur.def;
  }

  /** 자유로 놀기인가(판정과 목표가 없다) */
  get free(): boolean {
    return this.controller.isFree;
  }

  /** 나무의 수 */
  get trees(): number {
    return this.map.trees;
  }

  private identity(): string | null {
    const cur = this.controller.current;
    return cur ? `${cur.entry.questId}/${cur.variant.variantId}` : null;
  }

  /** 도전이 바뀌면 손(C)과 걸 가지와 듣는 방식을 처음으로 되돌린다 */
  private sync(): void {
    const id = this.identity();
    if (id === this.handKey) return;
    this.handKey = id;
    this.handState = { letter: 'C', accidental: null };
    this.ringState = null;
    this.modeState = 'together';
  }

  /** 손에 든 종 */
  get hand(): BellHand {
    this.sync();
    return this.handState;
  }

  handName(): string {
    return handNameOf(this.hand);
  }

  get mode(): ToneMode {
    this.sync();
    return this.modeState;
  }

  /** 종을 걸 수 있는 옥타브(음역 안, 작은 것부터) */
  usable(): number[] {
    return this.map.octaves.filter((o) => bellOctavesOf(this.variant).includes(o)).sort((a, b) => a - b);
  }

  private content(): DraftContent {
    return this.controller.content();
  }

  /** 걸린 종들(초안 칸 번호 차례) */
  states(): BellState[] {
    return bellStatesOf(this.variant, this.content());
  }

  private stateOf(draft: number): BellState | undefined {
    return this.states().find((s) => s.draft === draft);
  }

  /** 걸린 종의 수(소리를 끈 종도 센다) */
  hungCount(): number {
    return this.states().length;
  }

  /** 고른 종 자리(초안 칸 번호, 0부터). 아직 고르지 않았으면 null */
  get cursor(): number | null {
    const c = this.controller.selectedSlot();
    return c !== null && c >= 0 && c < bellDraftCount(this.map) ? c : null;
  }

  /** 고른 종 자리의 나무(0부터). 고르지 않았으면 null */
  get cursorTree(): number | null {
    const c = this.cursor;
    return c === null ? null : Math.floor(c / this.map.columns);
  }

  /** 종 자리의 이름. 예: '종 3', '둘째 나무의 3번째 종' */
  labelOf(draft: number): string {
    return bellLabelOf(this.map, draft);
  }

  /** 종이 없는 열에서 종을 걸 가지(옥타브). 고르지 않았으면 음역 안에서 4옥타브에 가장 가까운 가지 */
  ring(): number {
    this.sync();
    const v = this.variant;
    const usable = this.usable();
    const r = this.ringState;
    return r !== null && usable.includes(r) ? r : defaultRingOctave(this.map, v);
  }

  /** 고른 자리의 가지: 종이 걸려 있으면 그 종의 가지, 아니면 걸 가지. 고르지 않았으면 null */
  cursorOctave(): number | null {
    const c = this.cursor;
    if (c === null) return null;
    return this.stateOf(c)?.octave ?? this.ring();
  }

  /** 판정이 가리킨 종 자리(느낌표 표식을 세울 곳). 놓은 것이 바뀌면 사라진다 */
  flagged(): number[] {
    const f = this.controller.feedback;
    return f && !f.technical && !f.passed ? flaggedBellDrafts(f.issues) : [];
  }

  /** 듣는 중 지금 울리는 종 자리들 */
  playhead(): number[] {
    return this.controller.playing ? this.controller.playheadSlots() : [];
  }

  /** 월드가 그릴 모습. 열려 있지 않은 도전(걷는 중, 패널을 다녀오는 중)은 보관된 초안의 종만 보인다 */
  viewFor(variant: QuestVariant, content: DraftContent, live: boolean): BellView {
    return bellViewOf(this.map, variant, content, {
      cursor: live ? this.cursor : null,
      ringOctave: live ? this.ring() : null,
      flagged: new Set(live ? this.flagged() : []),
      playing: new Set(live ? this.playhead() : []),
    });
  }

  /** 고른 종 자리를 말로. 예: '종 2, E4가 걸려 있어요.' / '종 3, 비어 있어요. 걸 가지는 4옥타브예요.' */
  describe(draft: number): string {
    const label = this.labelOf(draft);
    const s = this.stateOf(draft);
    if (!s) return `${label}, 비어 있어요. 걸 가지는 ${this.ring()}옥타브예요.`;
    if (this.map.form !== 'tower') return `${label}, ${fillTemplate('{name:이가} 걸려 있어요.', { name: s.name })}`;
    const sound = s.muted ? '소리가 꺼져 있어요.' : s.lowest ? '가장 낮게 울리는 종이에요.' : '소리가 켜져 있어요.';
    return `${label}, ${fillTemplate('{name:이에요}.', { name: s.name })} ${sound}`;
  }

  // ------------------------------------------------------------------ 손 (음이름, 변화표)
  private setHand(next: BellHand, say: boolean): void {
    this.sync();
    this.handState = next;
    if (say) this.controller.announce(fillTemplate('손에 든 종은 {name:이에요}.', { name: handNameOf(next) }));
    this.controller.previewPitch(this.previewMidi(next));
    this.emit();
  }

  /** 손에 든 종을 들려 줄 높이: 고른 자리의 가지 */
  private previewMidi(hand: BellHand): number {
    return midiOf(spellWritten({ letter: hand.letter, accidental: hand.accidental, octave: this.cursorOctave() ?? this.ring() }, keySignatureOf(this.variant)));
  }

  /** 손에 든 종을 쓰지 않는 모양(종탑: 종이 이미 걸려 있고 음이름이 정해져 있다)이면 알리고 true */
  private noHand(): boolean {
    if (this.map.form !== 'tower') return false;
    this.controller.announce(TOWER_NO_HAND);
    return true;
  }

  /** 음이름을 직접 고른다(눌러서 고르기) */
  pickLetter(letter: Letter): void {
    if (!this.available || !BELL_LETTERS.includes(letter) || this.noHand()) return;
    this.setHand({ letter, accidental: this.hand.accidental }, true);
  }

  /** PageUp PageDown: 음이름을 한 칸씩 올리고 내린다. 끝에서는 멈추고 알린다 */
  moveLetter(delta: 1 | -1): void {
    if (!this.available || this.noHand()) return;
    const hand = this.hand;
    const next = BELL_LETTERS.indexOf(hand.letter) + delta;
    if (next < 0 || next >= BELL_LETTERS.length) {
      this.controller.announce(`음이름의 ${delta > 0 ? '맨 위' : '맨 아래'}예요. ${fillTemplate('손에 든 종은 {name:이에요}.', { name: handNameOf(hand) })}`);
      return;
    }
    this.setHand({ letter: BELL_LETTERS[next]!, accidental: hand.accidental }, true);
  }

  /** 변화표를 직접 고른다(눌러서 고르기) */
  pickAccidental(accidental: Hung): void {
    if (!this.available || this.noHand()) return;
    this.setHand({ letter: this.hand.letter, accidental }, true);
  }

  /** Shift+↑ ↓: 변화표를 한 칸씩 바꾼다(♭ 없음 ♯) */
  shiftAccidental(delta: 1 | -1): void {
    if (!this.available || this.noHand()) return;
    const hand = this.hand;
    const at = ACCIDENTAL_LADDER.indexOf(hand.accidental) + delta;
    if (at < 0 || at >= ACCIDENTAL_LADDER.length) {
      this.controller.announce(`변화표를 더 ${delta > 0 ? '올릴' : '내릴'} 수 없어요. ${fillTemplate('손에 든 종은 {name:이에요}.', { name: handNameOf(hand) })}`);
      return;
    }
    this.setHand({ letter: hand.letter, accidental: ACCIDENTAL_LADDER[at]! }, true);
  }

  // ------------------------------------------------------------------ 종 자리 고르기
  /** 종 자리를 직접 고른다. 소리는 내지 않는다 */
  selectColumn(draft: number | null): void {
    if (!this.available) return;
    if (draft !== null && (!Number.isInteger(draft) || draft < 0 || draft >= bellDraftCount(this.map))) return;
    this.controller.selectDraftSlot(draft);
    if (draft !== null) this.controller.announce(this.describe(draft));
  }

  /** ← →: 종 자리를 한 칸씩 옮긴다. 아직 고르지 않았으면 첫 자리부터 시작한다 */
  moveCursor(delta: 1 | -1): void {
    if (!this.available) return;
    const now = this.cursor;
    if (now === null) {
      this.selectColumn(0);
      return;
    }
    const next = now + delta;
    if (next < 0 || next >= bellDraftCount(this.map)) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 종 자리예요. ${this.describe(now)}`);
      return;
    }
    this.selectColumn(next);
  }

  /** Shift+← → (빈터): 나무를 건너뛴다. 같은 열 번호를 지킨다. 아직 고르지 않았으면 첫(마지막) 나무의 첫 종 자리다 */
  moveTree(delta: 1 | -1): void {
    if (!this.available) return;
    const trees = this.map.trees;
    if (trees <= 1) {
      this.controller.announce('나무가 하나뿐이에요.');
      return;
    }
    const now = this.cursor;
    if (now === null) {
      this.selectColumn(delta > 0 ? 0 : (trees - 1) * this.map.columns);
      return;
    }
    const tree = Math.floor(now / this.map.columns) + delta;
    if (tree < 0 || tree >= trees) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫째'} 나무예요. ${this.describe(now)}`);
      return;
    }
    this.selectColumn(tree * this.map.columns + (now % this.map.columns));
  }

  // ------------------------------------------------------------------ 걸기, 높이 바꾸기, 빼기
  /** 한 자리에 손에 든 종을 건다(이미 있으면 음이름과 변화표를 바꾼다). 고른 자리가 그 자리가 되고 걸 가지가 그 단으로 옮겨 간다 */
  private hang(draft: number, octave: number): void {
    const hand = this.hand;
    const written: WrittenPitch = { letter: hand.letter, accidental: hand.accidental, octave };
    const r = bellHangResult(this.variant, this.content(), draft, this.labelOf(draft), written);
    this.controller.selectDraftSlot(draft);
    if (!r.ok) {
      this.controller.announce(r.text);
      return;
    }
    this.ringState = octave;
    if (r.edit) this.controller.edit(r.edit, r.text);
    else this.controller.announce(r.text);
    this.controller.previewPitch(midiOf(spellWritten(written, keySignatureOf(this.variant))));
  }

  /** Enter, Space: 나무에서는 고른 자리(없으면 첫 자리)에 손에 든 종을 건다. 종탑에서는 고른 종을 울려 본다 */
  place(): void {
    if (!this.available) return;
    const draft = this.cursor ?? 0;
    if (this.map.form === 'tower') {
      const s = this.stateOf(draft);
      this.controller.selectDraftSlot(draft);
      if (s) {
        this.controller.announce(this.describe(draft));
        this.controller.previewPitch(s.midi);
      }
      return;
    }
    this.hang(draft, this.stateOf(draft)?.octave ?? this.ring());
  }

  /** Backspace: 고른 자리의 종을 뺀다. 종탑의 종은 뺄 수 없다 */
  remove(): void {
    if (!this.available) return;
    if (this.map.form === 'tower') {
      this.controller.announce(TOWER_NO_REMOVE);
      return;
    }
    const draft = this.cursor;
    if (draft === null) {
      this.controller.announce('빼려면 먼저 종 자리를 골라 주세요.');
      return;
    }
    const r = bellClearResult(this.content(), draft, this.labelOf(draft));
    if (r.ok && r.edit) this.controller.edit(r.edit, r.text);
    else this.controller.announce(r.text);
  }

  /** ↑ ↓: 걸린 종은 한 단 올리고 내린다(종탑은 가장 낮은 종 문장도 알려 준다). 걸린 종이 없는 자리에서는 종을 걸 가지만 옮긴다 */
  moveRing(delta: 1 | -1): void {
    if (!this.available) return;
    const draft = this.cursor;
    if (draft === null) {
      this.selectColumn(0);
      return;
    }
    const content = this.content();
    const variant = this.variant;
    const hung = this.stateOf(draft);
    if (hung) {
      const r = this.map.form === 'tower' ? toneShiftResult(variant, content, draft, delta) : bellShiftResult(variant, content, draft, this.labelOf(draft), delta);
      if (!r.ok) {
        this.controller.announce(r.text);
        return;
      }
      if (r.edit) {
        this.ringState = hung.octave + delta;
        this.controller.edit(r.edit, r.text);
        this.controller.previewPitch(hung.midi + 12 * delta);
      }
      return;
    }
    const next = this.ring() + delta;
    if (!this.usable().includes(next)) {
      const usable = this.usable();
      this.controller.announce(`걸 가지가 ${delta > 0 ? '맨 위' : '맨 아래'}예요. 이 도전은 ${usable[0]}옥타브부터 ${usable[usable.length - 1]}옥타브까지 써요.`);
      return;
    }
    this.ringState = next;
    this.controller.announce(`${this.labelOf(draft)}: 걸 가지는 ${next}옥타브예요.`);
    this.emit();
  }

  /** 가지(고리)를 눌렀다(눌러서 걸기, W-4). 고리 번호는 1부터 */
  press(slot: number): void {
    if (!this.available) return;
    const cell = bellCellOf(this.map, slot);
    if (!cell) return;
    const usable = this.usable();
    if (!usable.includes(cell.octave)) {
      this.controller.selectDraftSlot(cell.draft);
      this.controller.announce(`${cell.octave}옥타브 가지는 이 도전에서 쓰지 않아요. 이 도전은 ${usable[0]}옥타브부터 ${usable[usable.length - 1]}옥타브까지 써요.`);
      return;
    }
    const hung = this.stateOf(cell.draft);
    if (!hung) {
      // 빈 열: 손에 든 종을 이 가지에 건다
      this.hang(cell.draft, cell.octave);
      return;
    }
    if (hung.octave === cell.octave) {
      // 이미 걸린 가지: 그 종을 고르고 울려 본다(눌러서 지나가다 놓은 것을 바꾸지 않는다)
      this.ringState = cell.octave;
      this.controller.selectDraftSlot(cell.draft);
      this.controller.announce(this.describe(cell.draft));
      this.controller.previewPitch(hung.midi);
      return;
    }
    // 같은 열의 다른 가지: 그 열의 종이 이 가지로 옮겨 간다(음이름과 변화표는 그대로)
    const content = this.content();
    const r = this.map.form === 'tower' ? toneOctaveResult(this.variant, content, cell.draft, cell.octave) : bellShiftToResult(this.variant, content, cell.draft, this.labelOf(cell.draft), hung.octave, cell.octave);
    this.controller.selectDraftSlot(cell.draft);
    if (!r.ok) {
      this.controller.announce(r.text);
      return;
    }
    this.ringState = cell.octave;
    if (r.edit) this.controller.edit(r.edit, r.text);
    this.controller.previewPitch(hung.midi + 12 * (cell.octave - hung.octave));
  }

  // ------------------------------------------------------------------ 종탑: 소리 끄기와 가로 자리
  /** X: 종탑의 종 소리를 끄고 켠다. 나무의 종은 소리를 끄지 않고 뺀다 */
  mute(): void {
    if (!this.available) return;
    if (this.map.form !== 'tower') {
      this.controller.announce(TREE_NO_MUTE);
      return;
    }
    const draft = this.cursor;
    if (draft === null) {
      this.controller.announce('먼저 종을 골라 주세요.');
      return;
    }
    const r = toneMuteResult(this.variant, this.content(), draft);
    if (r.ok) this.controller.edit(r.edit, r.text);
    else this.controller.announce(r.text);
  }

  /** Shift+← → (종탑): 고른 종을 옆 자리와 맞바꾼다. 같은 음들이라 전위는 바뀌지 않는다. 고른 자리는 종을 따라간다 */
  swap(direction: 'left' | 'right'): void {
    if (!this.available || this.map.form !== 'tower') return;
    const draft = this.cursor;
    if (draft === null) {
      this.controller.announce('먼저 종을 골라 주세요.');
      return;
    }
    const r = toneSwapResult(this.variant, this.content(), draft, direction);
    if (!r.ok) {
      this.controller.announce(r.text);
      return;
    }
    this.controller.edit(r.edit, r.text);
    this.controller.selectDraftSlot(draft + (direction === 'right' ? 1 : -1));
  }

  // ------------------------------------------------------------------ 듣기
  /** 듣는 방식을 고른다. 고르면 바로 그 방식으로 들려 준다(차이를 곧바로 듣게) */
  setMode(mode: ToneMode): void {
    if (!this.available) return;
    this.sync();
    this.modeState = mode;
    this.controller.announce(`듣는 방식: ${hearModeLabel(mode)}.`);
    this.emit();
    this.hearMine();
  }

  /** R: 듣는 방식을 차례로 바꾼다 */
  nextMode(): void {
    const at = HEAR_MODES.findIndex((m) => m.mode === this.mode);
    this.setMode(HEAR_MODES[(at + 1) % HEAR_MODES.length]!.mode);
  }

  /** P: 내 배치 듣기. 빈터에서는 나무를 차례로 지나며 화음을 잇는다(Q21·Q23). 걸린 종이 없으면 이유를 알린다 */
  hearMine(): boolean {
    if (!this.available) return false;
    const variant = this.variant;
    const content = this.content();
    const mode = this.mode;
    if (this.map.form === 'tower') return this.controller.playTones(toneNotesOf(soundingTonesOf(variant, content), mode), NO_SOUNDING_BELL_NOTICE);
    if (this.map.form === 'glade') return this.controller.playTones(chordRouteNotesOf(variant, content, mode), NO_BELL_NOTICE);
    return this.controller.playTones(toneNotesOf(hungTonesOfTree(variant, content, 0), mode), NO_BELL_NOTICE);
  }

  /** Shift+P: 빈터에서 고른 나무(고르지 않았으면 첫째 나무)의 화음만 듣는다. 다른 모양은 내 배치 듣기와 같다 */
  hearTree(): boolean {
    if (!this.available) return false;
    if (this.map.form !== 'glade') return this.hearMine();
    const tree = this.cursorTree ?? 0;
    const tones = hungTonesOfTree(this.variant, this.content(), tree);
    return this.controller.playTones(toneNotesOf(tones, this.mode), `${treeNameOf(tree)}에는 아직 걸린 종이 없어요.`);
  }

  // ------------------------------------------------------------------ 키 지도 실행
  /**
   * 키 지도(bellActionOf)의 동작을 실행한다. 월드 화면이나 패널 틀에 부탁할 일이면 그 부탁을 돌려준다.
   * 소리 내기(P, T)와 판정(C)은 컨트롤러가 한다. 자유로 놀 때는 목표도 판정도 없어 안내만 남긴다(4.2).
   */
  perform(action: BellAction): BenchRequest | null {
    switch (action) {
      case 'cursor-left':
        this.moveCursor(-1);
        return null;
      case 'cursor-right':
        this.moveCursor(1);
        return null;
      case 'ring-up':
        this.moveRing(1);
        return null;
      case 'ring-down':
        this.moveRing(-1);
        return null;
      case 'letter-next':
        this.moveLetter(1);
        return null;
      case 'letter-prev':
        this.moveLetter(-1);
        return null;
      case 'accidental-up':
        this.shiftAccidental(1);
        return null;
      case 'accidental-down':
        this.shiftAccidental(-1);
        return null;
      case 'tree-prev':
        this.moveTree(-1);
        return null;
      case 'tree-next':
        this.moveTree(1);
        return null;
      case 'swap-left':
        this.swap('left');
        return null;
      case 'swap-right':
        this.swap('right');
        return null;
      case 'mute':
        this.mute();
        return null;
      case 'mode-next':
        this.nextMode();
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
      case 'hear-tree':
        this.hearTree();
        return null;
      case 'hear-target':
        this.controller.playTarget();
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

/** 걸린 종을 정한 가지로 옮긴다(나무의 눌러서 옮기기). 음이름과 변화표는 그대로다 */
function bellShiftToResult(variant: QuestVariant, content: DraftContent, draft: number, label: string, from: number, to: number): ReturnType<typeof bellHangResult> {
  const current = content.slots.find((s) => s.slot === draft)?.writtenPitch;
  if (!current) return { ok: false, text: `${label}: 걸린 종이 없어요.` };
  const r = bellHangResult(variant, content, draft, label, { ...current, octave: to });
  if (!r.ok || !r.edit) return r;
  const name = pitchName(spellWritten({ ...current, octave: to }, keySignatureOf(variant)));
  return { ok: true, edit: r.edit, text: fillTemplate('{label}: {name:으로로} {verb}.', { label, name, verb: to > from ? '올렸어요' : '내렸어요' }) };
}
