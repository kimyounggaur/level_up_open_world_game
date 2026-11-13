// 7-3 건반 다리(T6, 4.8) 작업대(KeyBridgeBench): 널(건반) 위에 이름표를 걸고, 말뚝과 밧줄로 음정을 재고, 순서 깃발을 꽂는 조작.
// 설치물 모드(월드)가 쓴다. 이름표 패널, 음정 패널, 건반 고르기 패널이 같은 초안을 다른 모양으로 보여 주므로, 다리에서 한 것이 패널에 그대로 보이고 패널에서 한 것이 다리로 돌아온다.
// - 초안은 컨트롤러(ChallengeSession)가 쥐고 있다. 작업대가 따로 들고 있는 것은 널 위의 커서와 음정 이름을 고르는 중간 단계뿐이다. 고른 것(이름표 자리, 질문, 깃발)은 초안의 선택(selection)이다.
// - 널의 소리는 널이 정한다: 널을 고르거나 밟으면 그 널의 음이 울린다(4.8). 이름표를 걸면 이름표가 가리키는 음이 울려서 널의 소리와 맞는지 귀로 확인할 수 있다.
// - 판정기에 넘어가는 것은 기보 음(이름표, 음정 이름, 쌓은 음)과 널의 MIDI(깃발)뿐이다. 월드의 좌표와 걸은 시간은 여기서 끝난다(W-3): 월드가 눌린 널을 자리 번호(정수)로 바꿔 넘겨 준다.
// - 끌어 놓기 없이 모두 된다(W-4): 키보드(← → 널, ↑ ↓ 할 것, Enter), 널 눌러 놓기, 이름표·음정 이름 단추.
import { midiOf } from '../../domain/pitch';
import type { IntervalQuality, SpelledPitch, WrittenPitch } from '../../domain/pitch';
import type { QuestVariant } from '../../domain/content';
import type { InstallationDef } from '../../domain/installation';
import { flaggedSlots } from '../../domain/slotmap';
import {
  NAME_TAGS,
  bridgeQuestionsOf,
  bridgeSignOf,
  bridgeTaskOf,
  bridgeVariantProblems,
  flagClearResult,
  flagPlantResult,
  flagSpotsOf,
  flagTargetsOf,
  hungTagText,
  keyBridgeMapOf,
  namesForMidi,
  plankOfMidi,
  planksOf,
  plankSpeakOf,
  ropeReadout,
  ropeText,
  stakeNameOf,
  stakeWrittenAt,
  tagClearResult,
  tagHangResult,
  tagSpotsOf,
} from '../../domain/keyBridge';
import type { BridgeQuestion, BridgeTask, KeyBridgeView, NameTag, Plank } from '../../domain/keyBridge';
import type { DraftContent, DraftEdit } from '../../domain/session';
import { spellWritten } from '../../domain/session';
import { CHOICE_DIFFERENT, CHOICE_SAME, clearChoiceEdit, intervalPickEdit, intervalPickName, intervalPickOf, nameTagTonesOf, setChoiceEdit, toneNotesOf } from '../../domain/slotplan';
import type { IntervalPick, ToneNote } from '../../domain/slotplan';
import { INTERVAL_QUALITY_KO } from '../../domain/pitch';
import { FREE_PLAY_NO_CHECK } from './controller';
import type { ChallengeController } from './controller';
import type { BenchAction } from './benchKeys';
import type { BenchRequest } from './slotBench';
import { NO_FLAG_NOTICE, NO_STAKE_NOTICE, NO_TAG_NOTICE, PICK_ITEM_FIRST, PICK_PLANK_FIRST, PICK_STAKE_FIRST } from './keyBridgeText';

/** '내 소리 듣기'와 '목표 듣기'에서 소리 하나가 울리는 길이(틱): 4분음표 */
export const BRIDGE_NOTE_TICKS = 960;

export interface TagItem {
  kind: 'tag';
  draft: number;
  label: string;
  plank: number;
  side: 'raised' | 'lowered';
  /** 걸린 이름표의 글자. 예: 'C♯' */
  text: string | null;
  flagged: boolean;
  selected: boolean;
}

export interface QuestionPart {
  draft: number;
  part: 'sound' | 'notation' | 'interval' | 'pitch';
  label: string;
  /** 고른 답을 말로. 비었으면 null */
  value: string | null;
}

export interface QuestionItem {
  kind: 'question';
  qid: string;
  label: string;
  qkind: 'identify' | 'build' | 'compare';
  parts: QuestionPart[];
  startPlank: number;
  /** 끝 말뚝이 꽂힌 널. 음 쌓기에서 아직 꽂지 않았으면 null */
  endPlank: number | null;
  /** 밧줄이 지나간 도수와 반음 수. 예: '3도 · 반음 4개' */
  rope: string | null;
  /** 음정 이름을 고르는 중간 단계(이름 묻기). 성질과 도수 */
  pick: IntervalPick;
  flagged: boolean;
  selected: boolean;
}

export interface FlagItem {
  kind: 'flag';
  draft: number;
  label: string;
  order: number;
  plank: number | null;
  flagged: boolean;
  selected: boolean;
}

export type BridgeItem = TagItem | QuestionItem | FlagItem;

const EMPTY_PICK: IntervalPick = { quality: null, number: null };

export class KeyBridgeBench {
  private readonly controller: ChallengeController;
  readonly installation: InstallationDef;
  readonly planks: readonly Plank[];
  private readonly fitCache = new WeakMap<QuestVariant, { free: boolean; ok: boolean }>();
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;
  /** 널 위의 커서(자리 번호). 초안이 아니라 작업대의 것이다 */
  private plankCursor: number | null = null;
  /** 음정 이름을 고르는 중간 단계(칸 번호 → 성질·도수 중 하나만 고른 상태) */
  private readonly pending = new Map<number, IntervalPick>();

  constructor(controller: ChallengeController, installation: InstallationDef) {
    const map = keyBridgeMapOf(installation);
    if (!map) throw new Error('건반 다리 설치물이 아니에요');
    this.controller = controller;
    this.installation = installation;
    this.planks = planksOf(map);
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
  /** 이 판본을 이 다리에서 풀 수 있는가. 자유로 놀기의 틀은 목표가 없어 목표를 보지 않는다. 판본마다 한 번만 계산한다 */
  fits(variant: QuestVariant, free: boolean = this.free): boolean {
    const hit = this.fitCache.get(variant);
    if (hit && hit.free === free) return hit.ok;
    const ok = bridgeVariantProblems(this.installation, variant, free).length === 0;
    this.fitCache.set(variant, { free, ok });
    return ok;
  }

  get available(): boolean {
    const cur = this.controller.current;
    return !!cur && this.fits(cur.def);
  }

  /** 열려 있는 판본. 쓸 수 없으면 오류다 */
  get variant(): QuestVariant {
    const cur = this.controller.current;
    if (!cur || !this.fits(cur.def)) throw new Error('열려 있는 과제에 건반 다리 작업대가 없어요');
    return cur.def;
  }

  get task(): BridgeTask | null {
    const cur = this.controller.current;
    return cur && this.fits(cur.def) ? bridgeTaskOf(cur.def) : null;
  }

  get free(): boolean {
    return this.controller.isFree;
  }

  private content(): DraftContent {
    return this.controller.content();
  }

  /** 널 하나. 자리 번호는 1부터 */
  plank(slot: number): Plank | undefined {
    return this.planks[slot - 1];
  }

  /** 널을 말로(문제를 푸는 중에는 검은 널의 이름을 말하지 않는다) */
  speak(slot: number): string {
    const p = this.plank(slot);
    return p ? plankSpeakOf(p, this.free) : '';
  }

  /** 널 위의 커서(자리 번호). 아직 고르지 않았으면 null */
  get cursor(): number | null {
    return this.plankCursor;
  }

  /** 판정이 가리킨 것: 이름표 자리 id, 질문 id, 깃발 칸 번호. 놓은 것이 바뀌면 사라진다 */
  private flaggedKeys(): { ids: Set<string>; positions: Set<number> } {
    const f = this.controller.feedback;
    const ids = new Set<string>();
    if (!f || f.technical || f.passed || !this.available || this.free) return { ids, positions: new Set() };
    for (const issue of f.issues) if (issue.target?.slotId) ids.add(issue.target.slotId);
    return { ids, positions: new Set(flaggedSlots(f.issues)) };
  }

  /** 이 판본의 할 것들(이름표 자리, 질문, 깃발) */
  itemsFor(variant: QuestVariant, content: DraftContent, live: boolean, free: boolean = this.free): BridgeItem[] {
    if (!this.fits(variant, free)) return [];
    const flagged = live ? this.flaggedKeys() : { ids: new Set<string>(), positions: new Set<number>() };
    const selectedDraft = live ? this.controller.selectedSlot() : null;
    const task = bridgeTaskOf(variant);
    if (task === 'names') {
      return (tagSpotsOf(variant, this.planks) ?? []).map(
        (s): TagItem => ({ kind: 'tag', draft: s.draft, label: s.label, plank: s.plank, side: s.side, text: hungTagText(content, s.draft), flagged: flagged.ids.has(s.slotId), selected: selectedDraft === s.draft }),
      );
    }
    if (task === 'flags') {
      return (flagSpotsOf(variant, content, this.planks) ?? []).map(
        (f): FlagItem => ({ kind: 'flag', draft: f.draft, label: `${f.order}번 깃발`, order: f.order, plank: f.plank, flagged: flagged.positions.has(f.draft), selected: selectedDraft === f.draft }),
      );
    }
    return (bridgeQuestionsOf(variant, this.planks) ?? []).map((q) => this.questionItem(variant, content, q, flagged.ids.has(q.qid), selectedDraft));
  }

  private questionItem(variant: QuestVariant, content: DraftContent, q: BridgeQuestion, flagged: boolean, selectedDraft: number | null): QuestionItem {
    const keySig = variant.score.staves[0]?.keySignature ?? 0;
    const entry = (draft: number) => content.slots.find((s) => s.slot === draft);
    const parts: QuestionPart[] = q.parts.map((p) => {
      const e = entry(p.slot);
      let value: string | null = null;
      if (p.part === 'interval') value = intervalPickName(intervalPickOf(e?.choice));
      else if (p.part === 'sound' || p.part === 'notation') value = e?.choice === CHOICE_SAME ? '같아요' : e?.choice === CHOICE_DIFFERENT ? '달라요' : null;
      else if (e?.writtenPitch) value = stakeNameOf(e.writtenPitch);
      return { draft: p.slot, part: p.part, label: p.label, value };
    });
    let endPlank = q.fixedEndPlank;
    let rope: string | null = null;
    const raw = q.question;
    if (raw.kind === 'build') {
      const w = entry(q.parts[0]!.slot)?.writtenPitch;
      if (w) {
        const to: SpelledPitch = spellWritten(w, keySig);
        endPlank = plankOfMidi(this.planks, midiOf(to))?.slot ?? null;
        rope = ropeText(ropeReadout(raw.from, to, midiOf(to)));
      }
    } else if (raw.kind === 'identify') rope = ropeText(ropeReadout(raw.from, raw.to, midiOf(raw.to)));
    else rope = ropeText(ropeReadout(raw.a, raw.b, midiOf(raw.b)));
    const first = q.parts[0]!.slot;
    const pick = q.kind === 'identify' ? this.pickOf(first, entry(first)?.choice) : EMPTY_PICK;
    return { kind: 'question', qid: q.qid, label: q.label, qkind: q.kind, parts, startPlank: q.startPlank, endPlank, rope, pick, flagged, selected: selectedDraft !== null && q.parts.some((p) => p.slot === selectedDraft) };
  }

  private pickOf(draft: number, choice: string | undefined): IntervalPick {
    const done = intervalPickOf(choice);
    if (done.quality) {
      this.pending.delete(draft);
      return done;
    }
    return this.pending.get(draft) ?? EMPTY_PICK;
  }

  /** 열려 있는 판본의 할 것들 */
  items(): BridgeItem[] {
    return this.available ? this.itemsFor(this.variant, this.content(), true) : [];
  }

  /** 고른 것. 고르지 않았으면 null */
  selectedItem(): BridgeItem | null {
    return this.items().find((i) => i.selected) ?? null;
  }

  /** 채운 것의 수(이름표, 깃발, 답을 채운 질문) */
  filledCount(): number {
    return this.items().filter((i) => (i.kind === 'tag' ? i.text !== null : i.kind === 'flag' ? i.plank !== null : i.parts.every((p) => p.value !== null))).length;
  }

  /** 지금 울리는 널들(듣는 중) */
  private playingPlanks(): number[] {
    if (!this.controller.playing) return [];
    const drafts = new Set(this.controller.playheadSlots());
    const out: number[] = [];
    for (const item of this.items()) {
      if (item.kind === 'tag' && drafts.has(item.draft)) out.push(item.plank);
      else if (item.kind === 'flag' && drafts.has(item.draft) && item.plank !== null) out.push(item.plank);
    }
    return out;
  }

  /** 월드가 그릴 모습. 열려 있지 않은 도전(걷는 중, 패널을 다녀오는 중)은 보관된 초안의 표식만 보인다 */
  viewFor(variant: QuestVariant, content: DraftContent, live: boolean, free: boolean): KeyBridgeView | null {
    const task = this.fits(variant, free) ? bridgeTaskOf(variant) : null;
    if (!task) return null;
    const items = this.itemsFor(variant, content, live, free);
    return {
      task,
      cursor: live ? this.plankCursor : null,
      playing: live ? this.playingPlanks() : [],
      tags: items.filter((i): i is TagItem => i.kind === 'tag').map((i) => ({ draft: i.draft, plank: i.plank, side: i.side, text: i.text, selected: i.selected, flagged: i.flagged })),
      ropes: items.filter((i): i is QuestionItem => i.kind === 'question').map((i) => ({ qid: i.qid, from: i.startPlank, to: i.endPlank, text: i.endPlank !== null || i.qkind !== 'build' ? i.rope : null, selected: i.selected, flagged: i.flagged })),
      flags: items.filter((i): i is FlagItem => i.kind === 'flag').map((i) => ({ draft: i.draft, order: i.order, plank: i.plank, selected: i.selected, flagged: i.flagged })),
      sign: free ? null : bridgeSignOf(variant),
      free,
    };
  }

  /** 할 것 하나를 말로 */
  describe(item: BridgeItem): string {
    if (item.kind === 'tag') return `${item.label}: ${item.text ? `${item.text} 이름표가 걸려 있어요` : '비어 있어요'}.`;
    if (item.kind === 'flag') return `${item.label}: ${item.plank !== null ? `${this.speak(item.plank)}에 꽂혀 있어요` : '아직 꽂지 않았어요'}.`;
    const answered = item.parts.filter((p) => p.value !== null).map((p) => `${p.label} ${p.value}`);
    return `${item.label}: ${item.rope ? `밧줄은 ${item.rope}. ` : ''}${answered.length > 0 ? answered.join(', ') : '답이 아직 없어요'}.`;
  }

  // ------------------------------------------------------------------ 고르기
  private draftOf(item: BridgeItem): number {
    return item.kind === 'question' ? item.parts[0]!.draft : item.draft;
  }

  private plankOfItem(item: BridgeItem): number | null {
    return item.kind === 'tag' ? item.plank : item.kind === 'flag' ? item.plank : item.startPlank;
  }

  /** 할 것을 직접 고른다(초안 칸 번호나 질문의 첫 칸). 소리는 내지 않는다 */
  selectItem(draft: number | null): void {
    if (!this.available) return;
    if (draft === null) {
      this.controller.selectDraftSlot(null);
      return;
    }
    const item = this.items().find((i) => (i.kind === 'question' ? i.parts.some((p) => p.draft === draft) : i.draft === draft));
    if (!item) return;
    this.controller.selectDraftSlot(this.draftOf(item));
    const at = this.plankOfItem(item);
    if (at !== null) this.plankCursor = at;
    this.controller.announce(this.describe(item));
    this.emit();
  }

  /** ↑ ↓: 할 것을 한 칸씩 옮긴다. 아직 고르지 않았으면 첫 번째부터 시작한다 */
  moveItem(delta: 1 | -1): void {
    if (!this.available) return;
    const items = this.items();
    if (items.length === 0) return;
    const now = items.findIndex((i) => i.selected);
    if (now < 0) {
      this.selectItem(this.draftOf(items[0]!));
      return;
    }
    const at = now + delta;
    if (at < 0 || at >= items.length) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 번째예요. ${this.describe(items[now]!)}`);
      return;
    }
    this.selectItem(this.draftOf(items[at]!));
  }

  /** 널 위의 커서를 옮기고 그 널의 소리를 들려 준다 */
  private goTo(slot: number): void {
    const p = this.plank(slot);
    if (!p) return;
    this.plankCursor = slot;
    this.controller.announce(`${plankSpeakOf(p, this.free)}.`);
    this.controller.previewPitch(p.midi);
    this.emit();
  }

  /** ← →: 널을 한 장씩 옮긴다. 아직 고르지 않았으면 고른 것이 선 널이나 가장 낮은 널부터 시작한다 */
  movePlank(delta: 1 | -1): void {
    if (!this.available) return;
    if (this.plankCursor === null) {
      const sel = this.selectedItem();
      this.goTo((sel ? this.plankOfItem(sel) : null) ?? 1);
      return;
    }
    const to = this.plankCursor + delta;
    if (to < 1 || to > this.planks.length) {
      this.controller.announce(`${delta > 0 ? '마지막' : '첫'} 널이에요. ${this.speak(this.plankCursor)}.`);
      return;
    }
    this.goTo(to);
  }

  // ------------------------------------------------------------------ 놓기
  private apply(r: { ok: boolean; edit: DraftEdit | null; text: string; midi: number | null }): void {
    if (!r.ok) {
      this.controller.announce(r.text);
      return;
    }
    if (r.edit) this.controller.edit(r.edit, r.text);
    else this.controller.announce(r.text);
    if (r.midi !== null) this.controller.previewPitch(r.midi);
  }

  /** 이름표를 고른 자리에 건다(이름표 단추) */
  hangTag(tag: NameTag): void {
    const sel = this.selectedItem();
    if (this.task !== 'names' || !sel || sel.kind !== 'tag') {
      this.controller.announce(this.task === 'names' ? '먼저 이름표 자리를 골라 주세요.' : PICK_ITEM_FIRST);
      return;
    }
    const spot = tagSpotsOf(this.variant, this.planks)!.find((s) => s.draft === sel.draft)!;
    this.apply(tagHangResult(this.content(), spot, tag));
  }

  /** Shift+↑ ↓: 걸린 이름표를 열 개의 이름표 가운데서 한 칸씩 바꾼다. 비어 있으면 첫 이름표를 건다 */
  cycleName(delta: 1 | -1): void {
    if (!this.available) return;
    const sel = this.selectedItem();
    if (!sel) {
      this.controller.announce(PICK_ITEM_FIRST);
      return;
    }
    if (sel.kind === 'tag') {
      const i = NAME_TAGS.findIndex((t) => t.text === sel.text);
      const next = NAME_TAGS[i < 0 ? (delta > 0 ? 0 : NAME_TAGS.length - 1) : (i + delta + NAME_TAGS.length) % NAME_TAGS.length]!;
      this.hangTag(next);
      return;
    }
    if (sel.kind === 'question' && sel.qkind === 'build') {
      const part = sel.parts[0]!;
      const w = this.content().slots.find((s) => s.slot === part.draft)?.writtenPitch;
      if (!w) {
        this.controller.announce(PICK_STAKE_FIRST);
        return;
      }
      const names = namesForMidi(midiOf(spellWritten(w, 0)));
      const at = names.findIndex((n) => n.letter === w.letter && n.accidental === w.accidental && n.octave === w.octave);
      this.pickName(names[(at + delta + names.length) % names.length]!);
      return;
    }
    this.controller.announce('이 할 것에는 바꿀 이름이 없어요.');
  }

  /** 끝 말뚝의 이름을 고른다(음 쌓기). 말뚝이 선 널과 같은 소리의 이름이어야 한다 */
  pickName(written: WrittenPitch): void {
    const sel = this.selectedItem();
    if (!sel || sel.kind !== 'question' || sel.qkind !== 'build') {
      this.controller.announce(PICK_ITEM_FIRST);
      return;
    }
    const draft = sel.parts[0]!.draft;
    const cur = this.content().slots.find((s) => s.slot === draft)?.writtenPitch;
    if (!cur) {
      this.controller.announce(PICK_STAKE_FIRST);
      return;
    }
    const mid = midiOf(spellWritten(cur, 0));
    if (midiOf(spellWritten(written, 0)) !== mid) {
      this.controller.announce('말뚝이 선 널과 소리가 다른 이름이에요.');
      return;
    }
    this.controller.edit({ type: 'setSlot', slot: draft, writtenPitch: written }, `끝 말뚝의 이름을 ${stakeNameOf(written)}로 골랐어요.`);
    this.controller.previewPitch(mid);
  }

  /** 끝 말뚝을 널에 꽂는다(음 쌓기). 처음에는 흰 널은 자기 이름, 검은 널은 올림 이름을 쓰고 이름은 따로 고른다 */
  plantStake(slot: number): void {
    const sel = this.selectedItem();
    const p = this.plank(slot);
    if (!p || !sel || sel.kind !== 'question' || sel.qkind !== 'build') return;
    const draft = sel.parts[0]!.draft;
    const cur = this.content().slots.find((s) => s.slot === draft)?.writtenPitch;
    if (cur && midiOf(spellWritten(cur, 0)) === p.midi) {
      this.controller.announce(`끝 말뚝은 이미 ${plankSpeakOf(p, this.free)}에 있어요.`);
      this.controller.previewPitch(p.midi);
      return;
    }
    const written = stakeWrittenAt(p);
    this.controller.edit({ type: 'setSlot', slot: draft, writtenPitch: written }, `끝 말뚝을 ${plankSpeakOf(p, this.free)}에 꽂았어요. 이름을 골라 주세요.`);
    this.controller.previewPitch(p.midi);
  }

  /**
   * 깃발을 널에 꽂는다. 고른 깃발이 없으면 비어 있는 첫 깃발이다.
   * 비어 있던 깃발을 처음 꽂으면 다음 빈 깃발이 골라진다: 널을 차례로 누르기만 해도 1번부터 순서대로 꽂힌다(손가락만으로도). 골라진 다음 깃발은 안내에도 덧붙인다.
   * 이미 꽂은 깃발을 옮길 때는 그 깃발이 그대로 골라져 있어서, 이어서 다른 널을 눌러 다시 옮겨 볼 수 있다. 빈 깃발이 더 없으면 방금 꽂은 깃발이 골라진 채로 남는다.
   */
  plantFlag(slot: number): void {
    const p = this.plank(slot);
    if (!p || this.task !== 'flags') return;
    const flags = this.items().filter((i): i is FlagItem => i.kind === 'flag');
    const target = flags.find((f) => f.selected) ?? flags.find((f) => f.plank === null) ?? flags[0];
    if (!target) return;
    this.controller.selectDraftSlot(target.draft);
    this.apply(flagPlantResult(this.content(), { draft: target.draft, order: target.order, plank: target.plank }, p));
    if (target.plank !== null) return;
    const after = this.items().filter((i): i is FlagItem => i.kind === 'flag');
    if (after.find((f) => f.draft === target.draft)?.plank === null) return; // 꽂지 못했다
    const next = [...after.filter((f) => f.order > target.order), ...after.filter((f) => f.order < target.order)].find((f) => f.plank === null);
    if (!next) return;
    this.controller.selectDraftSlot(next.draft);
    // 고른 깃발이 조용히 넘어가면 낭독기로 듣는 사람은 모른다: 꽂았다는 안내에 다음 깃발을 덧붙인다
    this.controller.announce(`${this.controller.live} 다음은 ${next.label}이에요.`);
  }

  /** Enter, Space: 고른 것을 널에 놓는다. 이름표 자리는 커서가 선 널의 자리로 옮겨 가고, 질문은 그 소리를 들려 준다 */
  plant(): void {
    if (!this.available) return;
    if (this.plankCursor === null) {
      this.controller.announce(PICK_PLANK_FIRST);
      return;
    }
    const slot = this.plankCursor;
    const task = this.task;
    if (task === 'flags') {
      this.plantFlag(slot);
      return;
    }
    const sel = this.selectedItem();
    if (task === 'names') {
      const spots = this.items().filter((i): i is TagItem => i.kind === 'tag' && i.plank === slot);
      if (spots.length === 0) {
        this.controller.announce(`${this.speak(slot)}에는 이름표 자리가 없어요.`);
        this.controller.previewPitch(this.plank(slot)!.midi);
        return;
      }
      // 같은 널의 자리가 둘이면 눌릴 때마다 번갈아 고른다
      const at = spots.findIndex((s) => s.selected);
      this.selectItem(spots[(at + 1) % spots.length]!.draft);
      return;
    }
    if (sel?.kind === 'question' && sel.qkind === 'build') {
      this.plantStake(slot);
      return;
    }
    // 이름 묻기와 비교는 널에 꽂을 것이 없다: 고른 질문의 두 음을 들려 준다. 고른 질문이 없으면 커서가 선 널의 소리를 들려 준다
    if (sel?.kind === 'question') {
      this.hearMine();
      return;
    }
    this.controller.previewPitch(this.plank(slot)!.midi);
  }

  /** 널을 눌렀다(눌러서 놓기, W-4). 자리 번호는 설치물의 널 번호(1부터)다 */
  press(slot: number): void {
    if (!this.available || !this.plank(slot)) return;
    this.plankCursor = slot;
    const task = this.task;
    if (task === 'flags') {
      this.plantFlag(slot);
      return;
    }
    if (task === 'names') {
      const spots = this.items().filter((i): i is TagItem => i.kind === 'tag' && i.plank === slot);
      if (spots.length > 0) {
        const at = spots.findIndex((s) => s.selected);
        this.selectItem(spots[(at + 1) % spots.length]!.draft);
        this.controller.previewPitch(this.plank(slot)!.midi);
        return;
      }
    }
    const sel = this.selectedItem();
    if (task === 'interval' && sel?.kind === 'question' && sel.qkind === 'build') {
      this.plantStake(slot);
      return;
    }
    if (task === 'interval') {
      // 질문의 시작 말뚝이나 끝 말뚝이 선 널을 누르면 그 질문을 고른다(손가락만으로도 질문을 고를 수 있게). 같은 널에 질문이 여럿이면 누를 때마다 번갈아 고른다
      const here = this.items().filter((i): i is QuestionItem => i.kind === 'question' && (i.startPlank === slot || i.endPlank === slot));
      if (here.length > 0) {
        const at = here.findIndex((q) => q.selected);
        this.selectItem(here[(at + 1) % here.length]!.parts[0]!.draft);
        this.controller.previewPitch(this.plank(slot)!.midi);
        return;
      }
    }
    this.goTo(slot);
  }

  /** 음정 이름의 성질을 고른다(이름 묻기) */
  pickQuality(quality: IntervalQuality): void {
    this.pickInterval({ quality });
  }

  /** 음정 이름의 도수를 고른다(이름 묻기) */
  pickNumber(number: number): void {
    this.pickInterval({ number });
  }

  private pickInterval(change: { quality: IntervalQuality } | { number: number }): void {
    const sel = this.selectedItem();
    if (!sel || sel.kind !== 'question' || sel.qkind !== 'identify') {
      this.controller.announce(PICK_ITEM_FIRST);
      return;
    }
    const draft = sel.parts[0]!.draft;
    const base = this.pickOf(draft, this.content().slots.find((s) => s.slot === draft)?.choice);
    const pick: IntervalPick = 'quality' in change ? { ...base, quality: change.quality } : { ...base, number: change.number };
    const edit = intervalPickEdit(draft, pick);
    if (edit) {
      this.pending.delete(draft);
      this.controller.edit(edit, `${sel.label}: ${intervalPickName(pick)}로 골랐어요.`);
      return;
    }
    this.pending.set(draft, pick);
    // 한 글자 성질('단', '장')만 읽으면 낭독기에서 뜻이 모호하다: '단음정을 골랐어요'처럼 음정을 붙여 읽는다
    this.controller.announce('quality' in change ? `${INTERVAL_QUALITY_KO[change.quality]}음정을 골랐어요. 이제 도수를 골라 주세요.` : `${change.number}도를 골랐어요. 이제 성질을 골라 주세요.`);
    this.emit();
  }

  /** 같은 소리인가, 같은 표기인가에 답한다(비교). part는 질문 안의 칸 차례(0 소리, 1 표기) */
  pickSame(partIndex: 0 | 1, same: boolean): void {
    const sel = this.selectedItem();
    if (!sel || sel.kind !== 'question' || sel.qkind !== 'compare') {
      this.controller.announce(PICK_ITEM_FIRST);
      return;
    }
    const part = sel.parts[partIndex];
    if (!part) return;
    this.controller.edit(setChoiceEdit(part.draft, same ? CHOICE_SAME : CHOICE_DIFFERENT), `${sel.label}: ${part.label}이 ${same ? '같다고' : '다르다고'} 답했어요.`);
  }

  /** Backspace: 고른 것의 답을 비운다 */
  remove(): void {
    if (!this.available) return;
    const sel = this.selectedItem();
    if (!sel) {
      this.controller.announce(PICK_ITEM_FIRST);
      return;
    }
    if (sel.kind === 'tag') {
      const spot = tagSpotsOf(this.variant, this.planks)!.find((s) => s.draft === sel.draft)!;
      this.apply(tagClearResult(this.content(), spot));
      return;
    }
    if (sel.kind === 'flag') {
      this.apply(flagClearResult(this.content(), { draft: sel.draft, order: sel.order, plank: sel.plank }));
      return;
    }
    const filled = sel.parts.filter((p) => p.value !== null);
    if (filled.length === 0 && sel.pick.quality === null && sel.pick.number === null) {
      this.controller.announce(`${sel.label}: 이미 비어 있어요.`);
      return;
    }
    for (const p of sel.parts) this.pending.delete(p.draft);
    if (filled.length === 0) {
      this.emit();
      return;
    }
    const first = filled[0]!;
    this.controller.edit(clearChoiceEdit(first.draft), `${sel.label}: 답을 비웠어요.`);
    for (const p of filled.slice(1)) this.controller.edit(clearChoiceEdit(p.draft));
  }

  // ------------------------------------------------------------------ 듣기
  private flagNotes(): ToneNote[] {
    return this.items()
      .filter((i): i is FlagItem => i.kind === 'flag' && i.plank !== null)
      .map((f, k): ToneNote => ({ slot: f.draft, midi: this.plank(f.plank!)!.midi, onsetTick: k * BRIDGE_NOTE_TICKS, durationTick: BRIDGE_NOTE_TICKS }));
  }

  /** P: 내 것을 들려 준다. 이름표는 걸린 이름의 음을, 깃발은 꽂은 널을 순서대로, 음정은 고른 질문의 두 음을 */
  hearMine(): boolean {
    if (!this.available) return false;
    const task = this.task;
    if (task === 'flags') return this.controller.playTones(this.flagNotes(), NO_FLAG_NOTICE, 'mine');
    if (task === 'names') return this.controller.playTones(toneNotesOf(nameTagTonesOf(this.variant, this.content()), 'ascending'), NO_TAG_NOTICE, 'mine');
    const sel = this.selectedItem();
    if (!sel || sel.kind !== 'question') {
      this.controller.announce(PICK_ITEM_FIRST);
      return false;
    }
    const q = bridgeQuestionsOf(this.variant, this.planks)!.find((x) => x.qid === sel.qid)!;
    const raw = q.question;
    const keySig = this.variant.score.staves[0]?.keySignature ?? 0;
    let midis: number[];
    if (raw.kind === 'identify') midis = [midiOf(raw.from), midiOf(raw.to)];
    else if (raw.kind === 'compare') midis = [midiOf(raw.a), midiOf(raw.b)];
    else {
      const w = this.content().slots.find((s) => s.slot === sel.parts[0]!.draft)?.writtenPitch;
      // 끝 말뚝이 없으면 소리 없이 이유를 보이는 안내로 알린다(이름표·깃발과 같다. 듣던 소리가 있으면 멈춘다)
      if (!w) return this.controller.playTones([], NO_STAKE_NOTICE, 'mine');
      midis = [midiOf(raw.from), midiOf(spellWritten(w, keySig))];
    }
    const notes = midis.map((midi, k): ToneNote => ({ slot: sel.parts[0]!.draft, midi, onsetTick: k * BRIDGE_NOTE_TICKS, durationTick: BRIDGE_NOTE_TICKS }));
    return this.controller.playTones(notes, NO_STAKE_NOTICE, 'mine');
  }

  /** T: 목표를 들려 준다. 자유로 놀 때는 목표가 없어 컨트롤러가 이유를 알린다 */
  hearTarget(): boolean {
    if (!this.available) return false;
    if (this.free) return this.controller.playTarget();
    if (this.task === 'flags') {
      const notes = flagTargetsOf(this.variant).map((midi, k): ToneNote => ({ slot: k + 1, midi, onsetTick: k * BRIDGE_NOTE_TICKS, durationTick: BRIDGE_NOTE_TICKS }));
      return this.controller.playTones(notes, NO_FLAG_NOTICE, 'target');
    }
    return this.controller.playTarget();
  }

  /**
   * 키 지도(benchKeys)의 동작을 실행한다. 월드 화면이나 패널 틀에 부탁할 일이면 그 부탁을 돌려준다.
   * ← → 널, ↑ ↓ 할 것, Shift+↑ ↓ 이름 바꾸기, Enter·Space 놓기. 소리 내기(P, T)와 판정(C)은 컨트롤러가 한다.
   */
  perform(action: BenchAction): BenchRequest | null {
    switch (action) {
      case 'cursor-left':
        this.movePlank(-1);
        return null;
      case 'cursor-right':
        this.movePlank(1);
        return null;
      case 'hand-up':
        this.moveItem(-1);
        return null;
      case 'hand-down':
        this.moveItem(1);
        return null;
      case 'accidental-up':
        this.cycleName(-1);
        return null;
      case 'accidental-down':
        this.cycleName(1);
        return null;
      case 'place':
        this.plant();
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
