// ContentCatalog: 공개 목록과 판. 어떤 과제를 어떤 상태로 열 수 있는지 알려 준다.
// 카탈로그는 저장 기록(진행, 통과 여부)을 입력으로 받지 않는다. 그래서 직접 주소와 목록은
// 선행 완료나 기록을 조회하지 않고 바로 열린다(W-2, 7.7).
import type { Availability, ChallengeDescriptor, QuestDefinition } from './content';

/** preview: 검수 전 콘텐츠도 '검수 전' 표지와 함께 연다. release: 검수 전 콘텐츠는 '준비 중'(W-10). */
export type Channel = 'preview' | 'release';

/**
 * open        검수와 권리 확인이 끝나 공개된 것
 * unreviewed  preview에서만: 열 수 있지만 '검수 전' 표지가 붙는다
 * preparing   release에서: '준비 중' 표지. 고를 수 없다. 사용자 성과로 잠긴 것이 아니므로 자물쇠를 쓰지 않는다
 */
export type QuestState = 'open' | 'unreviewed' | 'preparing';

export const STATE_LABEL_KO: Record<QuestState, string> = { open: '', unreviewed: '검수 전', preparing: '준비 중' };

export interface VariantEntry {
  variantId: string;
  label: string;
  state: QuestState;
  descriptor: ChallengeDescriptor;
  panelIds: string[];
  installationIds: string[];
}

export interface QuestEntry {
  questId: string;
  title: string;
  topicTags: string[];
  state: QuestState;
  variants: VariantEntry[];
  definition: QuestDefinition;
}

export type ResolveFailure = 'badFormat' | 'unknownQuest' | 'unknownVariant' | 'preparing';

export type ResolveResult =
  | { ok: true; quest: QuestEntry; variant: VariantEntry; definition: QuestDefinition }
  | { ok: false; reason: ResolveFailure; message: string; /** 이유와 함께 보여 줄 전체 목록 */ all: QuestEntry[] };

export function stateOf(availability: Availability, channel: Channel): QuestState {
  if (availability === 'published') return 'open';
  return channel === 'preview' ? 'unreviewed' : 'preparing';
}

export function isSelectable(state: QuestState): boolean {
  return state !== 'preparing';
}

export class ContentCatalog {
  private readonly entries: QuestEntry[];
  private readonly byId = new Map<string, QuestEntry>();

  constructor(
    definitions: readonly QuestDefinition[],
    readonly channel: Channel,
  ) {
    this.entries = definitions.map((def) => {
      const variants: VariantEntry[] = def.variantIds.map((variantId) => {
        const v = def.variants[variantId]!;
        const state = stateOf(v.availability ?? def.availability, channel);
        return {
          variantId,
          label: v.label ?? variantId,
          state,
          descriptor: v.challengeDescriptor,
          panelIds: def.placements.filter((p) => p.kind === 'panel' && p.variantIds.includes(variantId)).map((p) => (p as { panelId: string }).panelId),
          installationIds: def.placements.filter((p) => p.kind === 'installation' && p.variantIds.includes(variantId)).map((p) => (p as { installationId: string }).installationId),
        };
      });
      // 과제의 상태는 판본 가운데 가장 열린 것을 따른다(하나라도 열 수 있으면 과제를 고를 수 있다)
      const order: QuestState[] = ['open', 'unreviewed', 'preparing'];
      const state = variants.map((v) => v.state).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'preparing';
      return { questId: def.questId, title: def.title, topicTags: def.topicTags, state, variants, definition: def };
    });
    for (const e of this.entries) {
      if (this.byId.has(e.questId)) throw new Error(`과제 id가 겹쳐요: ${e.questId}`);
      this.byId.set(e.questId, e);
    }
  }

  list(): QuestEntry[] {
    return [...this.entries];
  }

  get(questId: string): QuestEntry | undefined {
    return this.byId.get(questId);
  }

  /** 과제 id와 판본 id로 연다. 판본을 생략하면 첫 판본. 기록은 보지 않는다. */
  resolve(questId: string, variantId?: string): ResolveResult {
    const all = this.list();
    const quest = this.byId.get(questId);
    if (!quest) {
      return { ok: false, reason: 'unknownQuest', message: `'${questId}' 과제를 찾지 못했어요. 아래 목록에서 골라 주세요.`, all };
    }
    const variant = variantId === undefined ? quest.variants[0] : quest.variants.find((v) => v.variantId === variantId);
    if (!variant) {
      const names = quest.variants.map((v) => v.variantId).join(', ');
      return { ok: false, reason: 'unknownVariant', message: `'${questId}'에 '${variantId}' 판본이 없어요. 있는 판본: ${names}`, all };
    }
    if (!isSelectable(variant.state)) {
      return { ok: false, reason: 'preparing', message: '이 과제는 준비 중이에요. 검수가 끝나면 열려요.', all };
    }
    return { ok: true, quest, variant, definition: quest.definition };
  }

  /** '#/q/<과제 id>/<판본 id>' 주소를 푼다 */
  resolveHash(hash: string): ResolveResult {
    const m = /^#?\/?q\/([^/]+)(?:\/([^/]+))?\/?$/.exec(hash.trim());
    if (!m) {
      return { ok: false, reason: 'badFormat', message: `주소 형식이 올바르지 않아요: ${hash}. #/q/<과제 id>/<판본 id> 형식이에요.`, all: this.list() };
    }
    let questId: string;
    let variantId: string | undefined;
    try {
      questId = decodeURIComponent(m[1]!);
      variantId = m[2] === undefined ? undefined : decodeURIComponent(m[2]);
    } catch {
      return { ok: false, reason: 'badFormat', message: `주소를 읽을 수 없어요: ${hash}`, all: this.list() };
    }
    return this.resolve(questId, variantId);
  }

  static hashFor(questId: string, variantId?: string): string {
    return variantId ? `#/q/${encodeURIComponent(questId)}/${encodeURIComponent(variantId)}` : `#/q/${encodeURIComponent(questId)}`;
  }

  /**
   * 지역·주제·'아직 열어 보지 않은 것'으로 거른다. 거르기를 풀면 전부 보인다(숨은 제한 없음, 7.7).
   * - tag: 이 주제 태그가 붙은 것만
   * - within: 이 id들 안의 것만(지역으로 거를 때 그 지역 정거장에 놓인 과제 id들)
   * - opened: 이미 열어 본 과제 id들. 주면 그 밖의 것만 남긴다('아직 열어 보지 않은 것')
   */
  filter(opts: { tag?: string; within?: ReadonlySet<string>; opened?: ReadonlySet<string> } = {}): QuestEntry[] {
    return this.entries
      .filter((e) => (opts.tag ? e.topicTags.includes(opts.tag) : true))
      .filter((e) => (opts.within ? opts.within.has(e.questId) : true))
      .filter((e) => (opts.opened ? !opts.opened.has(e.questId) : true));
  }
}
