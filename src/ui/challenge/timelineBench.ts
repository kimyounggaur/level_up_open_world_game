// 6-4 징검다리 작업대(TimelineBench, 설계서 4.4): 울림돌(음이 있는 돌)과 이끼돌(쉼표)을 손에 들고 여울의 칸에 놓는 조작.
// - 초안은 컨트롤러(ChallengeSession)가 쥔다. 작업대는 '손에 든 돌'과 '고른 칸'만 따로 들고, 놓은 것은 초안에 그대로 쓴다.
//   그래서 월드에서 놓은 것이 패널에 그대로 보이고, 패널에서 고친 것이 월드로 돌아오면 반영되어 있다(초안 하나, 보는 방법 둘).
// - 시간 계산(격자, 겹침, 마디 선, 연음 묶음)은 domain/timeline의 placeOnTimeline이 한다. 여기서는 어디에 놓을지와 말로 알리는 일만 맡는다.
// - 칸 번호는 월드가 알려 준 가장 잘게 나눈 칸(1부터)이다. 판정기에 넘어가는 것은 사건 목록(종류, 시작 틱, 길이 틱, 기보 음)뿐이다(W-3).
// - 셋잇단 뗏목의 돌은 칸의 경계에 맞지 않는다(320틱 돌은 120틱 칸의 경계가 아니다). 그래서 고른 칸이 뗏목 위이면 칸이 아니라 돌 단위로 옮기고
//   (stops), 뗏목 안의 칸은 그 돌의 시작과 같은 자리로 본다(align). 뗏목은 놓은 뒤에도 첫 돌에 머물러 돌을 하나씩 바꿀 수 있다.
// - 끌어 놓기 없이 모두 된다(W-4): 키보드(timelineKeys의 표), 눌러서 놓기, 단추.
import type { QuestVariant } from '../../domain/content';
import { fillTemplate } from '../../domain/feedback';
import { midiOf } from '../../domain/pitch';
import type { SpelledPitch } from '../../domain/pitch';
import { isNote } from '../../domain/score';
import type { DraftContent } from '../../domain/session';
import { tupletNoteTicks } from '../../domain/time';
import { alreadyEmptyText, blocksOf, clearOnTimeline, eventCovering, eventEnd, eventText, filledTicks, materialValueTicks, placeOnTimeline, raftSpanOf, tickLabel, timelineOf, timelinePitches, tupletKindName, voiceEventsOf } from '../../domain/timeline';
import type { TimelineMaterial, TimelineSpec, TupletKind } from '../../domain/timeline';
import { freeSpecOf, slotStartTick, stoneLengthsOf, timelineViewOf, waterSegments, waterSentence } from '../../domain/timelineStones';
import type { CursorMark, StoneLane, StoneLength, TimelineView, WaterSegment } from '../../domain/timelineStones';
import { marksOf } from '../timeline/marks';
import { NO_TOOL, materialOf, resolveTool, tupletKeyOf, usesPitch, usesValue } from '../timeline/tool';
import type { ResolvedTool, ToolKind, ToolState } from '../timeline/tool';
import { FREE_PLAY_NO_CHECK } from './controller';
import type { ChallengeController } from './controller';
import { STONE_VOCAB } from '../timeline/vocab';
import type { TimelineVocab } from '../timeline/vocab';
import { handLabelOf, noNotesNoticeOf } from './stoneText';
import type { TimelineAction } from './timelineKeys';

/** 작업대가 스스로 하지 못하고 바깥(월드 화면, 패널 틀)에 부탁하는 동작 */
export type TimelineRequest = 'view-panel' | 'help' | 'exit';

/** 처음에 손에 드는 것: 울림돌. 길이는 과제가 정한 가장 짧은 음가, 음은 음역의 맨 아래다 */
const START_TOOL: ToolState = { ...NO_TOOL, kind: 'note' };

export class TimelineBench {
  private readonly controller: ChallengeController;
  readonly lane: StoneLane;
  /** 놓는 것을 부르는 말: 징검다리는 돌, 물레방아는 못(4.5) */
  readonly vocab: TimelineVocab;
  private tool: ToolState = START_TOOL;
  private cursorTick: number | null = null;
  private identityKey: string | null = null;
  private readonly specs = new WeakMap<QuestVariant, TimelineSpec>();
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;

  constructor(controller: ChallengeController, lane: StoneLane, vocab: TimelineVocab = STONE_VOCAB) {
    this.controller = controller;
    this.lane = lane;
    this.vocab = vocab;
    // 도전이 바뀌거나 닫히면(나갔다 다시 들어온 것도 같다) 손과 고른 칸을 처음으로 돌려놓는다. 놓은 것은 초안에 있어서 그대로다
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
  /** 지금 도전에 징검다리 작업대를 쓸 수 있는가(리듬 배치 과제가 열려 있다) */
  get available(): boolean {
    const cur = this.controller.current;
    return !!cur && cur.def.evaluatorSpec.type === 'rhythmPlacement';
  }

  /** 자유로 놀기인가(판정과 목표가 없다) */
  get free(): boolean {
    return this.controller.isFree;
  }

  /** 열린 판본의 시간 규칙. 자유로 놀기에서는 목표가 없으니 칸과 마디에 드는 점음표를 모두 놓을 수 있다 */
  get spec(): TimelineSpec {
    const cur = this.controller.current;
    if (!cur) throw new Error('열려 있는 과제에 징검다리 작업대가 없어요');
    return this.specOf(cur.def, cur.free === true);
  }

  private specOf(def: QuestVariant, free: boolean): TimelineSpec {
    let s = this.specs.get(def);
    if (!s) {
      const base = timelineOf(def);
      s = free ? freeSpecOf(base) : base;
      this.specs.set(def, s);
    }
    return s;
  }

  /** 돌이 놓이는 격자 한 칸의 틱. 줄의 가장 잘게 나눈 칸보다 굵을 수 있다(4분음표가 가장 짧은 과제는 칸 두 개가 한 칸이다) */
  get step(): number {
    return Math.max(this.spec.cellTicks, this.lane.cellTicks);
  }

  private sync(): void {
    const cur = this.controller.current;
    const id = cur ? `${cur.entry.questId}/${cur.variant.variantId}` : null;
    if (id === this.identityKey) return;
    this.identityKey = id;
    this.tool = START_TOOL;
    this.cursorTick = null;
  }

  /** 손에 든 것(과제가 정한 첫 값을 채운 것). 도전이 바뀌면 울림돌로 되돌린다 */
  get hand(): ResolvedTool {
    this.sync();
    return resolveTool(this.tool, this.spec);
  }

  handName(): string {
    return handLabelOf(this.hand, this.vocab);
  }

  /** 손에 들 수 있는 돌의 길이들(짧은 것부터). 설치물이 정한 한도(물레방아는 세 칸)보다 긴 것은 없다 */
  lengths(): StoneLength[] {
    return stoneLengthsOf(this.spec, this.lane.maxStoneTicks);
  }

  /** 손에 들 수 있는 음높이들 */
  pitches(): SpelledPitch[] {
    return timelinePitches(this.spec);
  }

  /** 손에 들 수 있는 뗏목의 종류들(짧은 것부터). 셋잇단이 없는 과제는 비어 있다 */
  tuplets(): TupletKind[] {
    return [...this.spec.tuplets].sort((a, b) => tupletTicksOf(a) - tupletTicksOf(b));
  }

  /** 손에 들 수 있는 재료의 종류들. 셋잇단이 나오는 과제에는 뗏목이 있다. 비우기는 늘 있다 */
  kinds(): ToolKind[] {
    return ['note', 'rest', ...(this.spec.tuplets.length > 0 ? (['raft'] as const) : []), 'erase'];
  }

  /** 고른 칸의 시작 틱(마디 처음부터). 아직 고르지 않았으면 null. 뗏목이 지워지는 등 초안이 바뀌어도 놓을 수 있는 자리로 맞춰서 돌려준다 */
  get cursor(): number | null {
    this.sync();
    return this.cursorTick === null ? null : this.align(this.cursorTick);
  }

  /** 틱을 놓을 수 있는 자리로 맞춘다: 셋잇단 돌 안이면 그 돌의 시작, 아니면 격자 칸의 시작 */
  private align(tick: number, content: DraftContent = this.controller.content()): number {
    const covering = eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick });
    return covering?.groupId ? covering.onsetTicks : Math.floor(tick / this.step) * this.step;
  }

  /**
   * 칸을 옮길 때 멈추는 자리들(오름차순): 격자 칸의 시작과 셋잇단 돌의 시작. 돌 한가운데에 걸친 격자 칸은 그 돌의 시작과 같은 자리라서 따로 서지 않는다.
   * 격자에 닿지 않는 돌(둘째, 셋째 돌)도 설 수 있어야 하므로 격자를 훑는 것과 별개로 돌의 시작을 모두 더한다.
   */
  stops(content: DraftContent = this.controller.content()): number[] {
    const stones = voiceEventsOf(content, this.lane.voiceId, 0).filter((e) => e.groupId);
    const out = new Set<number>(stones.map((e) => e.onsetTicks));
    for (let t = 0; t < this.spec.measureTicks; t += this.step) {
      if (!stones.some((e) => e.onsetTicks < t && t < eventEnd(e))) out.add(t);
    }
    return [...out].sort((a, b) => a - b);
  }

  /** 고른 칸을 말로. 예: '2박', '1박 2번째 칸', '3박 셋째 돌'. 고르지 않았으면 null */
  cursorLabel(): string | null {
    const at = this.cursor;
    if (at === null) return null;
    const e = eventCovering(this.controller.content(), { voiceId: this.lane.voiceId, measureIndex: 0, tick: at });
    return tickLabel(this.spec, 0, at, e ? { raft: raftSpanOf(this.controller.content(), e) } : {});
  }

  /** 한 마디 가운데 돌이 채운 틱 */
  filled(): number {
    return filledTicks(this.controller.content(), this.lane.voiceId, 0);
  }

  /** 돌이 덮지 않은 물 구간들 */
  water(content: DraftContent = this.controller.content()): WaterSegment[] {
    return waterSegments(this.spec, content, this.lane.voiceId, 0);
  }

  /** 지금 초안이 남긴 물을 말로. 판정이 아니라 지금 초안의 사실이다(맞고 틀림은 확인할 때만 알린다) */
  waterLine(content: DraftContent = this.controller.content()): string {
    return waterSentence(this.spec, this.water(content), 0, this.vocab.water);
  }

  // ------------------------------------------------------------------ 월드에 올릴 모습
  /**
   * 월드가 그릴 모습. 열려 있지 않은 도전의 보관된 초안으로도 만든다(걷는 중에는 풍경으로 보인다).
   * live면 열려 있는 도전이므로 판정이 가리킨 곳, 놓으려는 자리, 듣는 중의 위치를 함께 담는다.
   */
  viewFor(def: QuestVariant, content: DraftContent, live: boolean, free: boolean): TimelineView {
    const spec = this.specOf(def, free);
    let flagged: WaterSegment[] = [];
    let remain = false;
    let cursor: CursorMark | null = null;
    let playTick: number | null = null;
    if (live) {
      const f = this.controller.feedback;
      if (f && !f.technical && !f.passed) {
        const blocks = blocksOf(spec, content, this.lane.voiceId, 0, 0, spec.measureTicks);
        const marks = marksOf(f.issues, blocks, { measureIndex: 0, voiceId: this.lane.voiceId });
        flagged = blocks.filter((b) => marks.errorKeys.has(b.key)).map((b) => ({ from: b.fullStart, to: Math.min(b.fullEnd, spec.measureTicks) }));
        remain = marks.remainKeys.size > 0;
      }
      cursor = this.cursorMark(spec, content);
      playTick = this.controller.playing ? this.controller.positionTick() : null;
    }
    return timelineViewOf({ spec, lane: this.lane, content, flagged, remain, cursor, playTick });
  }

  /** 고른 칸에 손에 든 것을 놓으면 차지할 구간. 고른 칸이 없으면 null */
  private cursorMark(spec: TimelineSpec, content: DraftContent): CursorMark | null {
    const tick = this.cursor;
    if (tick === null) return null;
    const tool = resolveTool(this.tool, spec);
    if (tool.kind === 'erase' || tool.kind === null) {
      const covering = eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick });
      const from = covering ? covering.onsetTicks : tick;
      return { startTick: from, endTick: covering ? eventEnd(covering) : tick + this.stepOf(spec), ...(tick !== from ? { at: tick } : {}), kind: 'erase', ok: covering !== undefined };
    }
    const material = materialOf(tool);
    if (!material) return null;
    const at = this.snap(spec, content, material, tick);
    const placed = placeOnTimeline(spec, content, { voiceId: this.lane.voiceId, measureIndex: 0, tick: at }, material);
    // 뗏목의 돌 위에 음이나 쉼을 놓으면 그 돌 하나가 바뀐다: 놓으려는 자리의 윤곽도 돌 하나다
    const stone = material.kind === 'tuplet' ? undefined : eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick: at });
    const end = stone?.groupId && stone.onsetTicks === at ? eventEnd(stone) : at + durationOf(material);
    return { startTick: at, endTick: end, ...(tick !== at ? { at: tick } : {}), kind: material.kind === 'tuplet' ? 'raft' : material.kind, ok: placed.ok };
  }

  private stepOf(spec: TimelineSpec): number {
    return Math.max(spec.cellTicks, this.lane.cellTicks);
  }

  /**
   * 뗏목은 박이 시작하는 자리에만 놓인다: 칸이 박 가운데여도 그 박의 처음에 놓는다.
   * 이미 놓인 뗏목 위이면 그 뗏목의 처음이다(4분음표 셋잇단 뗏목은 두 박에 걸치므로, 둘째 박에 놓인 돌을 골라도 뗏목째 바뀐다)
   */
  private snap(spec: TimelineSpec, content: DraftContent, material: TimelineMaterial, tick: number): number {
    if (material.kind !== 'tuplet') return tick;
    const covering = eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick });
    const raft = covering ? raftSpanOf(content, covering) : undefined;
    return raft ? raft.start : Math.floor(tick / spec.beatTicks) * spec.beatTicks;
  }

  // ------------------------------------------------------------------ 손(재료 고르기)
  private say(prefix?: string): void {
    const text = fillTemplate('손에 든 것은 {name:이에요}.', { name: this.handName() });
    this.controller.announce(prefix ? `${prefix} ${text}` : text);
  }

  private setTool(next: ToolState): void {
    this.sync();
    this.tool = next;
    this.emit();
  }

  /** 재료의 종류를 직접 고른다(눌러서 고르기) */
  pickKind(kind: ToolKind): void {
    if (!this.available || !this.kinds().includes(kind)) return;
    this.setTool({ ...this.tool, kind });
    this.say();
  }

  /** R: 울림돌 → 이끼돌 → (뗏목) → 울림돌. 비우기에서는 울림돌로 돌아온다 */
  nextKind(): void {
    if (!this.available) return;
    const order: ToolKind[] = this.kinds().filter((k) => k !== 'erase');
    const at = order.indexOf(this.hand.kind ?? 'note');
    this.setTool({ ...this.tool, kind: order[(at + 1) % order.length]! });
    this.say();
  }

  /** 돌 길이를 직접 고른다(눌러서 고르기). 이끼돌이나 울림돌의 길이다 */
  pickLength(value: ResolvedTool['value'], dotted: boolean): void {
    if (!this.available) return;
    // 줄이 정한 한도(물레방아의 못은 세 칸)보다 긴 것은 손에 들 수 없다: 화면의 단추와 Shift+↑↓가 보여 주는 것과 같다
    const cap = this.lane.maxStoneTicks;
    if (cap !== undefined && materialValueTicks(value, dotted) > cap) {
      const longest = this.lengths().at(-1);
      this.controller.announce(`${this.vocab.piece}은 ${longest ? `${longest.name}까지만` : '더 길게는'} 들 수 있어요. ${fillTemplate('손에 든 것은 {name:이에요}.', { name: this.handName() })}`);
      return;
    }
    const kind = this.hand.kind;
    this.setTool({ ...this.tool, kind: usesValue(kind) ? kind : 'note', value, dotted });
    this.say();
  }

  /** 음높이를 직접 고른다(눌러서 고르기). 울림돌이나 뗏목에 쓰인다 */
  pickPitch(pitch: SpelledPitch): void {
    if (!this.available) return;
    const key = `${pitch.letter}${pitch.alter}${pitch.octave}`;
    const spec = this.spec;
    const found = timelinePitches(spec).find((p) => `${p.letter}${p.alter}${p.octave}` === key);
    if (!found) return;
    const name = `${found.letter}${found.octave}`;
    this.setTool({ ...this.tool, kind: usesPitch(this.hand.kind) ? this.hand.kind : 'note', pitchKey: name });
    this.controller.previewPitch(midiOf(found));
    this.say();
  }

  /** 셋잇단 묶음의 종류를 직접 고른다(눌러서 고르기) */
  pickTuplet(key: string): void {
    if (!this.available || !this.spec.tuplets.some((t) => tupletKeyOf(t) === key)) return;
    this.setTool({ ...this.tool, kind: 'raft', tupletKey: key });
    this.say();
  }

  /** ↑ ↓: 손에 든 음높이를 한 칸씩 올리고 내린다. 음이 없는 재료(이끼돌, 비우기)이면 알리기만 한다 */
  moveHand(delta: 1 | -1): void {
    if (!this.available) return;
    const hand = this.hand;
    if (!usesPitch(hand.kind)) {
      this.controller.announce(hand.kind === 'rest' ? `${this.vocab.rest}에는 음높이가 없어요. ${this.vocab.note}을 들면 ↑ ↓로 음을 바꿔요.` : `비우기에는 음높이가 없어요. ${this.vocab.note}을 들면 ↑ ↓로 음을 바꿔요.`);
      return;
    }
    const pitches = this.pitches();
    const at = pitches.findIndex((p) => p.letter === hand.pitch.letter && p.octave === hand.pitch.octave && p.alter === hand.pitch.alter);
    const next = at + delta;
    if (next < 0 || next >= pitches.length) {
      this.controller.announce(`음역의 ${delta > 0 ? '맨 위' : '맨 아래'}예요. ${fillTemplate('손에 든 것은 {name:이에요}.', { name: this.handName() })}`);
      return;
    }
    const to = pitches[next]!;
    this.setTool({ ...this.tool, pitchKey: `${to.letter}${to.octave}` });
    this.controller.previewPitch(midiOf(to));
    this.say();
  }

  /** Shift+↑ ↓: 돌 길이를 한 단계씩 늘이고 줄인다. 길이가 없는 재료(뗏목, 비우기)이면 알리기만 한다 */
  shiftLength(delta: 1 | -1): void {
    if (!this.available) return;
    const hand = this.hand;
    if (hand.kind === 'raft') {
      this.shiftTuplet(delta);
      return;
    }
    if (!usesValue(hand.kind)) {
      this.controller.announce(`비우기에는 길이가 없어요. ${this.vocab.note}이나 ${this.vocab.rest}을 들면 길이를 바꿀 수 있어요.`);
      return;
    }
    const lengths = this.lengths();
    const at = lengths.findIndex((l) => l.value === hand.value && l.dotted === hand.dotted);
    const next = at + delta;
    if (next < 0 || next >= lengths.length) {
      this.controller.announce(
        lengths.length === 1
          ? `이 과제에서는 ${this.vocab.piece} 길이가 하나뿐이에요. ${fillTemplate('손에 든 것은 {name:이에요}.', { name: this.handName() })}`
          : `가장 ${delta > 0 ? '긴' : '짧은'} ${this.vocab.piece}이에요. ${fillTemplate('손에 든 것은 {name:이에요}.', { name: this.handName() })}`,
      );
      return;
    }
    const to = lengths[next]!;
    this.setTool({ ...this.tool, value: to.value, dotted: to.dotted });
    this.say();
  }

  /** 뗏목의 종류(8분 셋잇단, 4분 셋잇단)를 짧은 것부터 길어지는 순서로 한 단계씩 바꾼다. 종류가 하나뿐이면 알리기만 한다 */
  private shiftTuplet(delta: 1 | -1): void {
    const kinds = this.tuplets();
    const hand = this.hand;
    const at = kinds.findIndex((k) => hand.tuplet !== null && tupletKeyOf(k) === tupletKeyOf(hand.tuplet));
    if (kinds.length < 2) {
      this.controller.announce(`이 과제의 뗏목은 ${hand.tuplet ? tupletKindName(hand.tuplet) : '한'} 종류뿐이에요. 돌 세 개가 한 벌로 놓여요.`);
      return;
    }
    const to = kinds[at + delta];
    if (!to) {
      this.controller.announce(`가장 ${delta > 0 ? '긴' : '짧은'} 뗏목이에요. ${fillTemplate('손에 든 것은 {name:이에요}.', { name: this.handName() })}`);
      return;
    }
    this.pickTuplet(tupletKeyOf(to));
  }

  // ------------------------------------------------------------------ 칸 고르기
  /** 칸이 무엇을 품고 있는지 말로. 예: '2박, C4 4분음표가 놓여 있어요.' */
  describeAt(tick: number): string {
    const spec = this.spec;
    const content = this.controller.content();
    const e = eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick });
    const raft = e ? raftSpanOf(content, e) : undefined;
    const where = tickLabel(spec, 0, tick, raft ? { raft } : {});
    if (!e) return `${where}, 비어 있어요.`;
    const what = eventText(content, e);
    if (e.onsetTicks === tick) return `${where}, ${fillTemplate('{name:이가} 놓여 있어요.', { name: what })}`;
    return `${where}, ${fillTemplate('{start}부터 이어지는 {name:이가} 놓여 있어요.', { start: tickLabel(spec, 0, e.onsetTicks, raft ? { raft } : {}), name: what })}`;
  }

  /** 칸을 고른다. 컨트롤러의 고른 칸(박)도 함께 옮겨서 패널로 넘어가도 같은 박이 열린다. 소리는 내지 않는다 */
  private setCursor(tick: number | null): void {
    this.sync();
    this.cursorTick = tick;
    if (tick !== null) {
      const cell = this.controller.cells().find((c) => c.measureIndex === 0 && tick >= c.onsetTicks && tick < c.onsetTicks + c.durationTicks) ?? null;
      this.controller.selectCell(cell);
    } else {
      this.emit();
    }
  }

  /** 칸을 직접 고른다. 줄 밖이거나 마디 밖(물가 바위)이면 고르지 않고 이유를 알린다 */
  selectTick(tick: number | null): void {
    if (!this.available) return;
    if (tick === null) {
      this.setCursor(null);
      return;
    }
    const spec = this.spec;
    if (tick >= spec.measureTicks) {
      this.controller.announce(this.shoreText());
      return;
    }
    const at = this.align(tick);
    this.setCursor(at);
    this.controller.announce(this.describeAt(at));
  }

  /** 물가 바위가 덮은 칸을 눌렀을 때의 말(3/4 과제의 오른쪽 120 px) */
  private shoreText(): string {
    const spec = this.spec;
    return `물가 바위가 덮은 칸이에요. 이 과제는 ${Math.round(spec.measureTicks / spec.beatTicks)}박까지만 써요.`;
  }

  /** ← →: 칸을 한 칸씩 옮긴다(뗏목 위에서는 돌 하나씩). 아직 고르지 않았으면 첫 칸부터 시작한다 */
  moveCursor(delta: 1 | -1): void {
    if (!this.available) return;
    const now = this.cursor;
    if (now === null) {
      this.selectTick(0);
      return;
    }
    const stops = this.stops();
    let at = 0;
    stops.forEach((t, i) => {
      if (t <= now) at = i;
    });
    const next = delta > 0 ? stops[at + 1] : stops[at]! < now ? stops[at] : stops[at - 1];
    if (next === undefined) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 칸이에요. ${this.describeAt(now)}`);
      return;
    }
    this.selectTick(next);
  }

  /**
   * 박 단위로 옮긴다(PageUp·PageDown, 막대의 이전 박·다음 박). 고른 칸이 박 가운데이면 이전 박은 먼저 그 박의 처음으로 간다.
   * 다음 박은 박의 처음 이후에 처음 서는 자리로, 이전 박은 박의 처음 이전에 마지막으로 서는 자리로 간다. 박 선을 걸친 돌이 있으면
   * (4분음표 셋잇단 뗏목의 둘째 돌은 3박과 4박 사이의 선을 걸친다) 다음 박은 그 돌을 건너뛰어 그 다음 돌에 서고, 이전 박은 그 돌에 선다.
   * 그래야 다음 박을 누를 때마다 박이 하나씩 앞서간다. 줄이 긴 설치물에서 칸을 하나씩 넘기지 않고 박을 건너뛰는 길이다.
   */
  moveBeat(delta: 1 | -1): void {
    if (!this.available) return;
    const spec = this.spec;
    const now = this.cursor ?? 0;
    const beatStart = Math.floor(now / spec.beatTicks) * spec.beatTicks;
    const goal = delta > 0 ? beatStart + spec.beatTicks : now > beatStart ? beatStart : beatStart - spec.beatTicks;
    if (goal < 0 || goal >= spec.measureTicks) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 박이에요. ${this.describeAt(now)}`);
      return;
    }
    const stops = this.stops();
    let next = 0;
    if (delta > 0) next = stops.find((t) => t >= goal) ?? goal;
    else stops.forEach((t) => (t <= goal ? (next = t) : undefined));
    this.selectTick(next);
  }

  // ------------------------------------------------------------------ 놓기와 빼기
  /**
   * 고른 칸에(없으면 첫 칸에) 손에 든 것을 놓는다. 같은 시작 칸에 이미 있으면 바꾼다.
   * 다른 돌과 겹치거나 마디 선을 넘으면 놓이지 않고 이유를 알린다. 놓은 뒤에는 남은 물도 함께 알리고, 고른 칸은 놓은 돌의 끝으로 간다.
   */
  place(tick?: number): void {
    if (!this.available) return;
    const spec = this.spec;
    const hand = this.hand;
    const from = tick ?? this.cursor ?? 0;
    if (hand.kind === 'erase') {
      this.remove(from);
      return;
    }
    const material = materialOf(hand);
    if (!material) {
      this.controller.announce(`손에 든 것이 없어요. ${this.vocab.note}이나 ${this.vocab.rest}을 골라 주세요.`);
      return;
    }
    const at = this.snap(spec, this.controller.content(), material, from);
    const placed = placeOnTimeline(spec, this.controller.content(), { voiceId: this.lane.voiceId, measureIndex: 0, tick: at }, material);
    this.setCursor(at);
    if (!placed.ok) {
      this.controller.announce(placed.text);
      return;
    }
    this.controller.edit(placed.edit);
    this.controller.announce(`${placed.announce} ${this.waterLine()}`);
    this.setCursor(this.afterPlacing(material, at));
    const heard = material.kind === 'note' ? material.pitch : material.kind === 'tuplet' && material.stone.kind === 'note' ? material.stone.pitch : null;
    if (heard) this.controller.previewPitch(midiOf(heard));
  }

  /**
   * 놓은 뒤에 고를 칸. 돌은 놓은 돌 바로 다음 칸으로 간다(줄 끝이면 그대로).
   * 뗏목은 첫 돌에 머문다: 돌마다 음을 바꾸려면 첫 돌부터 차례로 바꿔야 해서, 뗏목 뒤로 가 버리면 돌아오느라 칸을 여러 번 옮겨야 한다.
   * 뗏목의 돌 하나를 바꿨으면 뗏목의 다음 돌로 간다(마지막 돌이면 뗏목 다음 칸).
   */
  private afterPlacing(material: TimelineMaterial, at: number): number {
    if (material.kind === 'tuplet') return at;
    const content = this.controller.content();
    const placed = eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick: at });
    const end = placed ? eventEnd(placed) : at + durationOf(material);
    const next = this.stops(content).find((t) => t >= end);
    return next !== undefined && next < this.spec.measureTicks ? next : at;
  }

  /** 고른 칸의 돌을 뺀다. 칸이 돌의 가운데여도 그 돌 전체가 빠진다. 연음 돌이면 묶음이 통째로 빠진다 */
  remove(tick?: number): void {
    if (!this.available) return;
    const spec = this.spec;
    const at = tick ?? this.cursor;
    if (at === null) {
      this.controller.announce('빼려면 먼저 칸을 골라 주세요.');
      return;
    }
    const content = this.controller.content();
    const covering = eventCovering(content, { voiceId: this.lane.voiceId, measureIndex: 0, tick: at });
    const cleared = clearOnTimeline(spec, content, { voiceId: this.lane.voiceId, measureIndex: 0, tick: at });
    if (!cleared || !covering) {
      this.setCursor(at);
      this.controller.announce(alreadyEmptyText(spec, 0, at));
      return;
    }
    this.controller.edit(cleared.edit);
    // 뗏목을 비웠으면 뗏목이 있던 처음 자리로 돌아온다(돌 하나의 자리는 뗏목이 없어지면 칸이 아니다)
    this.setCursor(raftSpanOf(content, covering)?.start ?? covering.onsetTicks);
    this.controller.announce(`${cleared.announce} ${this.waterLine()}`);
  }

  /**
   * 누르기로 칸을 눌렀다(월드의 돌 자리). 슬롯 번호는 줄의 가장 잘게 나눈 칸(1부터)이다.
   * 비우기를 들고 있으면 그 칸의 돌을 치운다. 빈 칸이면 손에 든 것을 놓는다.
   * 이미 돌이 놓여 있으면 그 돌만 고른다: 눌러서 지나가다 놓은 것을 덮어쓰지 않는다. 바꾸려면 '놓기'(Enter, 단추)를 쓴다.
   */
  press(slot: number, pressedTick?: number): void {
    if (!this.available) return;
    const spec = this.spec;
    // 월드가 눌린 점의 틱을 알려 주면 그 틱으로 본다: 셋잇단 돌은 칸의 경계에 맞지 않아서, 칸의 처음 틱만으로는 이웃한 돌이 눌릴 수 있다
    const raw = pressedTick ?? slotStartTick(this.lane, slot);
    if (raw >= spec.measureTicks) {
      this.controller.announce(this.shoreText());
      return;
    }
    const tick = this.align(raw);
    if (this.hand.kind === 'erase') {
      this.remove(tick);
      return;
    }
    const covering = eventCovering(this.controller.content(), { voiceId: this.lane.voiceId, measureIndex: 0, tick });
    if (covering) {
      this.setCursor(covering.onsetTicks);
      this.controller.announce(`${this.describeAt(covering.onsetTicks)} 바꾸려면 놓기를 누르세요.`);
      return;
    }
    this.place(tick);
  }

  // ------------------------------------------------------------------ 듣기
  private hearMine(): void {
    if (!this.controller.content().events.some(isNote)) {
      this.controller.stopPlayback();
      this.controller.notify(noNotesNoticeOf(this.vocab));
      return;
    }
    this.controller.playMine();
  }

  // ------------------------------------------------------------------ 키 지도 실행
  /**
   * 키 지도(timelineActionOf)의 동작을 실행한다. 월드 화면이나 패널 틀에 부탁할 일이면 그 부탁을 돌려준다.
   * 소리 내기(P, T)와 판정(C)은 컨트롤러가 한다. 자유로 놀 때는 목표도 판정도 없어 안내만 남긴다(4.2).
   */
  perform(action: TimelineAction): TimelineRequest | null {
    switch (action) {
      case 'cursor-left':
        this.moveCursor(-1);
        return null;
      case 'cursor-right':
        this.moveCursor(1);
        return null;
      case 'beat-prev':
        this.moveBeat(-1);
        return null;
      case 'beat-next':
        this.moveBeat(1);
        return null;
      case 'hand-up':
        this.moveHand(1);
        return null;
      case 'hand-down':
        this.moveHand(-1);
        return null;
      case 'length-up':
        this.shiftLength(1);
        return null;
      case 'length-down':
        this.shiftLength(-1);
        return null;
      case 'kind-next':
        this.nextKind();
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

/** 연음 종류의 뗏목 하나가 차지하는 틱(돌 하나의 틱 × 돌 수). 뗏목 종류를 길이 순으로 세울 때 쓴다 */
const tupletTicksOf = (t: { actualNotes: number; normalNotes: number; writtenBaseDuration: Parameters<typeof tupletNoteTicks>[0] }): number => tupletNoteTicks(t.writtenBaseDuration, t.actualNotes, t.normalNotes) * t.actualNotes;

/** 재료가 차지하는 틱. 뗏목은 돌 하나의 틱 × 돌 수다 */
export function durationOf(material: TimelineMaterial): number {
  if (material.kind === 'tuplet') return tupletNoteTicks(material.tuplet.writtenBaseDuration, material.tuplet.actualNotes, material.tuplet.normalNotes) * material.tuplet.actualNotes;
  return materialValueTicks(material.value, material.dotted === true);
}
