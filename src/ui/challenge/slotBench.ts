// 4.2 놓기 작업대(SlotBench): 재료를 손에 들고 자리에 놓는 조작. 설치물 모드(월드)와 음계 패널이 같은 것을 쓴다.
// - 초안은 컨트롤러(ChallengeSession)가 쥐고 있다. 작업대는 '손에 든 재료'만 따로 들고, 자리 고름은 초안의 선택(selection)을 쓴다.
//   그래서 월드에서 놓은 것이 패널에 그대로 보이고, 패널에서 고친 것이 월드로 돌아오면 반영되어 있다(초안 하나, 보는 방법 둘).
// - 자리 번호는 1부터다. 판정기에 넘어가는 것은 자리 변환표(SlotMap)가 바꾼 음이름뿐이다(W-3).
// - 끌어 놓기 없이 모두 된다(W-4): 키보드(4.2 표), 눌러서 고르고 놓기, 단추.
import { fillTemplate } from '../../domain/feedback';
import { flaggedSlots, shiftAccidental } from '../../domain/slotmap';
import type { Hand, SlotMap, SlotView } from '../../domain/slotmap';
import type { BenchAction } from './benchKeys';
import { FREE_PLAY_NO_CHECK } from './controller';
import type { ChallengeController } from './controller';

/** 작업대가 스스로 하지 못하고 바깥(월드 화면, 패널 틀)에 부탁하는 동작 */
export type BenchRequest = 'view-panel' | 'help' | 'exit';

const ordinal = (n: number): string => `${n}번째 자리`;

export class SlotBench {
  private readonly controller: ChallengeController;
  private handState: Hand = { shelfIndex: 0, accidental: null };
  private handKey: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;

  constructor(controller: ChallengeController) {
    this.controller = controller;
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
  /** 지금 도전에 놓기 작업대를 쓸 수 있는가(자리 변환표가 있다) */
  get available(): boolean {
    return this.controller.slotMap() !== null;
  }

  /** 자리 변환표. 쓸 수 없으면 오류다 */
  get map(): SlotMap {
    const m = this.controller.slotMap();
    if (!m) throw new Error('열려 있는 과제에 놓기 작업대가 없어요');
    return m;
  }

  /** 자유로 놀기인가(판정과 목표가 없다) */
  get free(): boolean {
    return this.controller.isFree;
  }

  private identity(): string | null {
    const cur = this.controller.current;
    return cur ? `${cur.entry.questId}/${cur.variant.variantId}` : null;
  }

  /** 손에 든 재료. 도전이 바뀌면 으뜸음(변화표 없음)으로 되돌린다 */
  get hand(): Hand {
    const id = this.identity();
    if (id !== this.handKey) {
      this.handKey = id;
      this.handState = { shelfIndex: this.controller.slotMap()?.tonicIndex ?? 0, accidental: null };
    }
    return this.handState;
  }

  /** 손에 든 재료의 이름. 예: 'B♭4' (조표를 적용한다) */
  handName(): string {
    return this.map.nameOf(this.hand);
  }

  /** 고른 자리(1부터). 아직 고르지 않았으면 null */
  get cursor(): number | null {
    return this.controller.orderedCursor();
  }

  /** 모든 자리의 지금 모습 */
  views(): SlotView[] {
    return this.map.view(this.controller.content());
  }

  /** 판정이 가리킨 자리(느낌표 표식을 세울 곳). 놓은 것이 바뀌면 사라진다 */
  flagged(): number[] {
    const f = this.controller.feedback;
    return f && !f.technical && !f.passed ? flaggedSlots(f.issues) : [];
  }

  /** 듣는 중 지금 울리는 자리 */
  playhead(): number | null {
    return this.controller.playing ? this.controller.playheadSlot() : null;
  }

  // ------------------------------------------------------------------ 손(재료 고르기)
  private setHand(next: Hand, say: boolean): void {
    this.hand; // 도전이 바뀌었으면 먼저 으뜸음으로
    this.handState = next;
    const map = this.map;
    if (say) this.controller.announce(fillTemplate('손에 든 음은 {name:이에요}.', { name: map.nameOf(next) }));
    this.controller.previewPitch(map.midiOf(next));
    this.emit();
  }

  /** 선반의 칸을 직접 고른다(눌러서 고르기) */
  pickShelf(shelfIndex: number): void {
    if (!this.available) return;
    const map = this.map;
    if (!Number.isInteger(shelfIndex) || shelfIndex < 0 || shelfIndex >= map.shelf.length) return;
    this.setHand({ shelfIndex, accidental: this.hand.accidental }, true);
  }

  /** 변화표를 직접 고른다(눌러서 고르기) */
  pickAccidental(accidental: Hand['accidental']): void {
    if (!this.available) return;
    this.setHand({ shelfIndex: this.hand.shelfIndex, accidental }, true);
  }

  /** ↑ ↓: 손에 든 음을 한 칸씩 올리고 내린다. 선반 끝에서는 멈추고 알린다 */
  moveHand(delta: 1 | -1): void {
    if (!this.available) return;
    const map = this.map;
    const hand = this.hand;
    const next = hand.shelfIndex + delta;
    if (next < 0 || next >= map.shelf.length) {
      this.controller.announce(`재료 선반의 ${delta > 0 ? '맨 위' : '맨 아래'}예요. ${fillTemplate('손에 든 음은 {name:이에요}.', { name: map.nameOf(hand) })}`);
      return;
    }
    this.setHand({ shelfIndex: next, accidental: hand.accidental }, true);
  }

  /** Shift+↑ ↓: 변화표를 한 칸씩 바꾼다(♭ 없음 ♯) */
  shiftHandAccidental(delta: 1 | -1): void {
    if (!this.available) return;
    const hand = this.hand;
    const accidental = shiftAccidental(hand.accidental, delta);
    if (accidental === hand.accidental) {
      this.controller.announce(`변화표를 더 ${delta > 0 ? '올릴' : '내릴'} 수 없어요. ${fillTemplate('손에 든 음은 {name:이에요}.', { name: this.map.nameOf(hand) })}`);
      return;
    }
    this.setHand({ shelfIndex: hand.shelfIndex, accidental }, true);
  }

  // ------------------------------------------------------------------ 자리 고르기
  private describeSlot(n: number): string {
    const v = this.views()[n - 1];
    return v?.name ? `${ordinal(n)}, ${fillTemplate('{name:이가} 놓여 있어요.', { name: v.name })}` : `${ordinal(n)}, 비어 있어요.`;
  }

  /** 자리를 직접 고른다. 소리는 내지 않는다 */
  selectSlot(slot: number | null): void {
    if (!this.available) return;
    this.controller.selectOrderedSlot(slot);
    if (slot !== null) this.controller.announce(this.describeSlot(slot));
  }

  /** ← →: 자리를 한 칸씩 옮긴다. 아직 고르지 않았으면 첫 자리부터 시작한다 */
  moveCursor(delta: 1 | -1): void {
    if (!this.available) return;
    const count = this.map.count;
    const now = this.cursor;
    if (now === null) {
      this.selectSlot(1);
      return;
    }
    const next = now + delta;
    if (next < 1 || next > count) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 자리예요. ${this.describeSlot(now)}`);
      return;
    }
    this.selectSlot(next);
  }

  // ------------------------------------------------------------------ 놓기와 빼기
  /** 고른 자리에(없으면 첫 자리에) 손에 든 재료를 놓는다. 이미 있으면 바꾼다. 소리가 켜져 있으면 그 음을 들려 준다 */
  place(slot?: number): void {
    if (!this.available) return;
    const map = this.map;
    const n = slot ?? this.cursor ?? 1;
    const hand = this.hand;
    const name = map.nameOf(hand);
    const existing = this.views()[n - 1];
    if (existing?.written && existing.name === name && existing.written.accidental === map.written(hand).accidental) {
      this.controller.selectOrderedSlot(n);
      this.controller.announce(`${ordinal(n)}에는 이미 ${fillTemplate('{name:이가} 있어요.', { name })}`);
      return;
    }
    this.controller.edit(map.place(n, hand), `${ordinal(n)}에 ${fillTemplate('{name:을를}', { name })} 놓았어요.`);
    this.controller.selectOrderedSlot(n);
    this.controller.previewPitch(map.midiOf(hand));
  }

  /** 고른 자리의 재료를 뺀다 */
  remove(slot?: number): void {
    if (!this.available) return;
    const n = slot ?? this.cursor;
    if (n === null) {
      this.controller.announce('빼려면 먼저 자리를 골라 주세요.');
      return;
    }
    if (!this.views()[n - 1]?.written) {
      this.controller.selectOrderedSlot(n);
      this.controller.announce(fillTemplate('{where:은는} 이미 비어 있어요.', { where: ordinal(n) }));
      return;
    }
    this.controller.edit(this.map.clear(n), `${ordinal(n)}의 음을 뺐어요.`);
    this.controller.selectOrderedSlot(n);
  }

  /**
   * 누르기로 자리를 눌렀다(돌이나 패널의 자리 단추).
   * 빈 자리면 손에 든 재료를 놓는다. 이미 놓여 있으면 그 자리만 고른다: 눌러서 지나가다 놓은 것을 덮어쓰지 않는다.
   * 놓인 자리를 바꾸려면 '놓기'(Enter, 단추)를 쓴다.
   */
  press(slot: number): void {
    if (!this.available) return;
    const v = this.views()[slot - 1];
    if (!v) return;
    if (v.written) {
      this.controller.selectOrderedSlot(slot);
      this.controller.announce(`${this.describeSlot(slot)} 바꾸려면 놓기를 누르세요.`);
      return;
    }
    this.place(slot);
  }

  // ------------------------------------------------------------------ 키 지도 실행
  /**
   * 키 지도(benchActionOf)의 동작을 실행한다. 월드 화면이나 패널 틀에 부탁할 일이면 그 부탁을 돌려준다.
   * 소리 내기(P, T)와 판정(C)은 컨트롤러가 한다. 자유로 놀 때는 목표도 판정도 없어 안내만 남긴다(4.2).
   */
  perform(action: BenchAction): BenchRequest | null {
    switch (action) {
      case 'cursor-left':
        this.moveCursor(-1);
        return null;
      case 'cursor-right':
        this.moveCursor(1);
        return null;
      case 'hand-up':
        this.moveHand(1);
        return null;
      case 'hand-down':
        this.moveHand(-1);
        return null;
      case 'accidental-up':
        this.shiftHandAccidental(1);
        return null;
      case 'accidental-down':
        this.shiftHandAccidental(-1);
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
        this.controller.playMine();
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
