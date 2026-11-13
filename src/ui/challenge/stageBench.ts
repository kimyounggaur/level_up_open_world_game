// 4.9 무대 작업대(StageBench): 합주 무대의 바닥을 읽고 고르는 조작. 음을 놓거나 빼는 일은 없다 — 음표 편집은 패널에서 한다.
// 바닥 칸(성부 줄 × 마디)을 고르는 것은 '마디를 고르는 것'이다: 한 마디의 두 성부 칸이 함께 고른 것이 된다.
// 초안과 선택, 듣기 범위, 판정 결과는 모두 컨트롤러가 쥔다. 작업대는 그것을 바닥 칸의 모습으로 옮겨 읽기만 한다(초안 하나, 보는 방법 둘).
import { ALL_SCOPE, flaggedStageSlots, playingStageSlots, stageCellOfSlot, stageCellViews, usedVoiceIds } from '../../domain/ensemble';
import type { StageCellView, StageLayout } from '../../domain/ensemble';
import { timelineOf } from '../../domain/timeline';
import { FREE_PLAY_NO_CHECK } from './controller';
import type { ChallengeController, ScopeChoice } from './controller';
import type { StageAction } from './stageKeys';

/** 작업대가 스스로 하지 못하고 바깥(월드 화면, 패널 틀)에 부탁하는 동작 */
export type StageRequest = 'view-panel' | 'help' | 'exit';

export const UNUSED_CELL_TEXT = '이 판본에서 쓰지 않아요.';

export class StageBench {
  constructor(
    private readonly controller: ChallengeController,
    readonly layout: StageLayout,
  ) {}

  // ------------------------------------------------------------------ 읽기
  /** 지금 도전에 무대 바닥을 쓸 수 있는가(합주 과제가 열려 있다) */
  get available(): boolean {
    return this.controller.isArrangement;
  }

  /** 지금 열려 있는 것이 자유 가락(판정하지 않는다)인가 */
  get free(): boolean {
    return this.controller.isFree;
  }

  /** 모든 칸의 지금 모습. 쓸 수 없으면 빈 목록 */
  views(): StageCellView[] {
    const cur = this.controller.current;
    return cur && this.available ? stageCellViews(this.layout, cur.def, this.controller.content()) : [];
  }

  /** 고른 마디(0부터). 아직 고르지 않았으면 null */
  measure(): number | null {
    return this.controller.selectedCell()?.measureIndex ?? null;
  }

  /** 판정이 가리킨 칸들(느낌표 표식). 확인하기 전, 고친 뒤, 통과 뒤, 기술 문제일 때는 없다 */
  flagged(): number[] {
    const f = this.controller.feedback;
    if (!f || f.technical || f.passed) return [];
    const used = new Set(this.usedVoices());
    return flaggedStageSlots(this.layout, f.issues).filter((slot) => {
      const cell = stageCellOfSlot(this.layout, slot);
      return cell !== null && used.has(cell.voiceId);
    });
  }

  /** 듣는 중 지금 울리는 칸들 */
  playhead(): number[] {
    const cur = this.controller.current;
    const tick = this.controller.playing ? this.controller.positionTick() : null;
    if (!cur || !this.available || tick === null) return [];
    return playingStageSlots(this.layout, this.usedVoices(), this.controller.listenScope() ?? ALL_SCOPE, tick, timelineOf(cur.def).measureTicks);
  }

  private usedVoices(): string[] {
    const cur = this.controller.current;
    return cur && this.available ? usedVoiceIds(this.layout, cur.def) : [];
  }

  /** 마디 하나를 읽어 주는 말. 예: '2마디를 골랐어요. 위 성부 2마디: 비어 있어요. …' */
  describeMeasure(measureIndex: number): string {
    const cells = this.views().filter((v) => v.measureIndex === measureIndex && v.fill !== 'unused');
    return `${measureIndex + 1}마디를 골랐어요. ${cells.map((c) => c.text).join(' ')}`.trim();
  }

  // ------------------------------------------------------------------ 고르기
  /** 마디를 고른다(소리는 내지 않는다). 없는 마디이면 false */
  selectMeasure(measureIndex: number): boolean {
    if (!this.available) return false;
    const cell = this.controller.cells().find((c) => c.measureIndex === measureIndex);
    if (!cell) return false;
    this.controller.notify(null);
    this.controller.selectCell(cell);
    this.controller.announce(this.describeMeasure(measureIndex));
    return true;
  }

  /** ← →: 마디를 한 칸씩 옮긴다. 아직 고르지 않았으면 1마디부터 시작한다 */
  moveCursor(delta: 1 | -1): void {
    if (!this.available) return;
    const now = this.measure();
    if (now === null) {
      this.selectMeasure(0);
      return;
    }
    const next = now + delta;
    if (next < 0 || next >= this.layout.measures) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 마디예요. ${this.describeMeasure(now)}`);
      return;
    }
    this.selectMeasure(next);
  }

  /**
   * 바닥 칸을 눌렀다(돌을 누르듯 칸을 누르기). 그 칸의 마디를 고르고 그 마디를 돌려준다: 부른 쪽이 패널을 연다(4.9).
   * 이 판본에서 쓰지 않는 칸이면 아무것도 바꾸지 않고 이유만 알리며 null을 돌려준다.
   */
  press(slot: number): number | null {
    if (!this.available) return null;
    const cell = stageCellOfSlot(this.layout, slot);
    if (!cell) return null;
    if (this.views().find((v) => v.slot === slot)?.fill === 'unused') {
      // 눈으로 보는 사람에게도 이유가 보이도록 화면 안내로 남긴다(화면 낭독기도 읽는다). 다음에 마디를 고르면 사라진다
      this.controller.notify(`${cell.voiceLabel} ${cell.measureIndex + 1}마디 칸은 ${UNUSED_CELL_TEXT}`);
      return null;
    }
    return this.selectMeasure(cell.measureIndex) ? cell.measureIndex : null;
  }

  // ------------------------------------------------------------------ 듣기 범위
  /** 고를 수 있는 듣기 범위들(전체, 성부별, 고른 마디). 성부가 하나뿐이면 성부별은 없다 */
  scopeChoices(): ScopeChoice[] {
    const voices = this.controller.scopeVoices();
    return [{ kind: 'all' }, ...(voices.length > 1 ? voices.map((v): ScopeChoice => ({ kind: 'voice', voiceId: v.voiceId })) : []), { kind: 'measure' }];
  }

  /** R: 듣기 범위를 다음 것으로 돌린다 */
  cycleScope(): void {
    if (!this.available) return;
    const choices = this.scopeChoices();
    const now = JSON.stringify(this.controller.scopeChoice);
    const at = choices.findIndex((c) => JSON.stringify(c) === now);
    this.controller.setScope(choices[(at + 1) % choices.length]!);
  }

  // ------------------------------------------------------------------ 키 지도 실행
  /** 키 지도(stageActionOf)의 동작을 실행한다. 월드 화면이나 패널 틀에 부탁할 일이면 그 부탁을 돌려준다 */
  perform(action: StageAction): StageRequest | null {
    switch (action) {
      case 'cell-left':
        this.moveCursor(-1);
        return null;
      case 'cell-right':
        this.moveCursor(1);
        return null;
      case 'scope-next':
        this.cycleScope();
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
        // 자유 가락은 판정하지 않는다: 눌러도 아무것도 기록하지 않고 이유만 알린다
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
