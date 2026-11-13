// 4.2 설치물 모드의 두뇌. 화면(HUD)과 월드(Phaser) 사이에서 다음을 맡는다.
//  - 들어가기와 나가기: 월드의 카메라와 입력은 다리(WorldBridge)의 설치물 모드를 따른다.
//  - 표지판: 이 정거장의 과제와 판본을 모두 보여 주고, 맨 위의 '자유로 놀기'가 기본이다. 고른 것이 지금 열린 도전(초안)이다.
//  - 돌의 지금 모습을 월드에 알린다: 놓인 음의 이름, 고른 자리, 판정이 가리킨 자리, 듣는 중인 자리.
//  - 돌을 눌렀을 때 놓기(눌러서 놓기, W-4), 지나가다 돌을 밟으면 그 음을 0.5초 들려 주기(4.3).
//  - 계단밭(T5)은 열을 눌러 고르고 높이를 눌러 놓는다(4.7). 눌린 높이는 월드가 온음계 칸 수로 바꿔 보내므로 걸은 시간과 좌표는 여기서 끝난다(W-3).
//  - 건반 다리(T6)는 널을 눌러 그 소리를 듣고, 이름표를 걸고, 끝 말뚝과 깃발을 꽂는다(4.8). 눌린 널은 월드가 자리 번호(정수)로 바꿔 보낸다. 널을 밟으면 그 널의 음이 울린다.
// 판정은 모른다. 놓기와 듣기와 확인은 놓기 작업대(SlotBench)와 컨트롤러가 한다. 월드의 좌표와 걸은 시간은 여기서 끝난다(W-3).
import { bellCellOf, bellMapOf, freeBellFrameOf, treeChordMidis } from '../../domain/bells';
import type { BellMap } from '../../domain/bells';
import { ContentCatalog, STATE_LABEL_KO, isSelectable } from '../../domain/catalog';
import { FREE_VARIANT_ID, freeHashFor, freeQuestId } from '../../domain/content';
import type { QuestVariant } from '../../domain/content';
import { CREATION_BAR_TICKS, CREATION_VOICE_ID, creationPlayback, describeCreation } from '../../domain/creation';
import type { Creation } from '../../domain/creation';
import { ALL_SCOPE, FREE_MELODY_LABEL, freeMelodyVariant, playingStageSlots, stageCellViews, stageLayoutOf } from '../../domain/ensemble';
import type { StageCellView } from '../../domain/ensemble';
import { fillTemplate } from '../../domain/feedback';
import type { InstallationDef } from '../../domain/installation';
import { freeBridgeFrameOf, keyBridgeMapOf, planksOf } from '../../domain/keyBridge';
import { STEP_NOTE_SEC, slotMapOf } from '../../domain/slotmap';
import type { SlotMap } from '../../domain/slotmap';
import { PLANNED_QUESTS } from '../../domain/world';
import type { WorldMap } from '../../domain/world';
import type { ChallengeSession, DraftContent } from '../../domain/session';
import { freeTerraceFrameOf, terraceMapOf } from '../../domain/terrace';
import { isArrangementVariant } from '../../domain/timeline';
import { followsBeat, freeStonesFrameOf, laneOf, slotStartTick } from '../../domain/timelineStones';
import type { Mixer } from '../../audio/mixer';
import { Store } from '../../platform/bridge';
import type { InstallationMode, InstallationView, WorldBridge, WorldEvent } from '../../platform/bridge';
import type { BellAction } from '../challenge/bellKeys';
import { BellBench } from '../challenge/bellBench';
import { bellEntryText } from '../challenge/bellText';
import type { BenchAction } from '../challenge/benchKeys';
import { KeyBridgeBench } from '../challenge/keyBridgeBench';
import type { BridgeAction } from '../challenge/keyBridgeKeys';
import { bridgeEntryText } from '../challenge/keyBridgeText';
import type { ChallengeController } from '../challenge/controller';
import type { SlotBench } from '../challenge/slotBench';
import { StageBench } from '../challenge/stageBench';
import type { StageAction } from '../challenge/stageKeys';
import { TerraceBench } from '../challenge/terraceBench';
import type { TerraceAction } from '../challenge/terraceKeys';
import { terraceEntryText } from '../challenge/terraceText';
import { TimelineBench } from '../challenge/timelineBench';
import type { TimelineAction } from '../challenge/timelineKeys';
import { vocabOf } from '../timeline/vocab';

/** 표지판에서 고를 수 있는 것: 자유로 놀기, 또는 과제의 판본 하나 */
export type InstallationTarget = { kind: 'free' } | { kind: 'quest'; questId: string; variantId: string };

const FREE: InstallationTarget = { kind: 'free' };
export const FREE_KEY = 'free';
export const targetKey = (t: InstallationTarget): string => (t.kind === 'free' ? FREE_KEY : `${t.questId}/${t.variantId}`);

export const FREE_PLAY_LABEL = '자유로 놀기';
export const FREE_PLAY_NOTE = '판정 없이 마음껏 놓아 보는 자리예요. 놓은 것은 보관돼요.';
export const FREE_PLAY_NO_PANEL = '자유로 놀 때는 패널로 볼 수 없어요. 표지판에서 과제를 고르면 패널로 볼 수 있어요.';
export const NO_PANEL_YET = '이 과제는 아직 패널 화면을 만드는 중이에요. 여기서 계속 풀 수 있어요.';
/** 합주 무대(T7)의 표지판 맨 위. 4마디짜리 자유 편집이다(4.9) */
export { FREE_MELODY_LABEL };
export const FREE_MELODY_NOTE = '4마디짜리 나만의 가락을 판정 없이 놓아 보는 자리예요. 놓은 것은 보관돼요.';
/** 표지판의 '내 곡 다시 듣기'(4.9): 저장한 곡이 있으면 곡마다 한 항목, 없으면 이유만 적은 항목 하나 */
export const SONGS_LABEL = '내 곡 다시 듣기';
export const NO_SONGS_NOTE = '아직 저장한 곡이 없어요. 자유 가락을 저장하면 여기서 다시 들을 수 있어요.';
export const FESTIVAL_LABEL = '잔치 열기';
export const FESTIVAL_NOTE = '지금까지 쌓은 소리로 합주해요. 언제든 열 수 있고, 몇 번이든 열 수 있어요.';

/** 표지판에서 고르면 도전을 바꾸지 않고 바로 하는 일 */
export type SignAction = { kind: 'song'; creationId: string } | { kind: 'festival' };

export interface SignEntry {
  /** 'free', '<과제 id>/<판본 id>', 'song:<곡 id>', 'festival' */
  key: string;
  /** 고르면 열리는 도전. 바로 하는 일(action)이면 null */
  target: InstallationTarget | null;
  /** 도전을 바꾸지 않고 바로 하는 일(내 곡 다시 듣기, 잔치 열기). 아니면 null */
  action: SignAction | null;
  label: string;
  /** '검수 전'(미리보기)이나 '준비 중' 같은 표지. 없으면 null */
  badge: string | null;
  selectable: boolean;
  selected: boolean;
  /** 부연 한 문장. 고를 수 없으면 이유다(자물쇠 없이 말로만, W-10) */
  note: string | null;
}

export interface InstallationUiState {
  /** 들어가 있는 설치물. 지나가기면 null */
  mode: InstallationMode | null;
  /** 표지판에서 고른 것의 키 */
  targetKey: string;
  /** 도움 카드(H)가 열려 있는가 */
  helpOpen: boolean;
}

/** 프레임 예약. 기본은 requestAnimationFrame이고 시험에서는 가짜를 넣는다 */
export interface FrameScheduler {
  request(fn: () => void): unknown;
  cancel(handle: unknown): void;
}

const defaultFrames: FrameScheduler = {
  request: (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)),
  cancel: (h) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(h as number) : clearTimeout(h as ReturnType<typeof setTimeout>)),
};

export interface InstallationControllerDeps {
  bridge: WorldBridge;
  map: WorldMap;
  catalog: ContentCatalog;
  session: ChallengeSession;
  controller: ChallengeController;
  bench: SlotBench;
  /** 돌을 밟을 때 소리를 내는 곳 */
  mixer: Pick<Mixer, 'playWorldNote'>;
  installations: readonly InstallationDef[];
  /** 화면이 만들어진 패널 id들. '패널로 보기'가 열 수 있는지 가린다 */
  panels: ReadonlySet<string>;
  /** 열어 본 과제를 기록한다(목록과 지도가 쓴다) */
  opened?: { mark(questId: string): void };
  /** 저장한 곡(내 곡). 있으면 합주 무대의 표지판이 '내 곡 다시 듣기'를 보인다 */
  creations?: { list(): readonly Creation[]; get(creationId: string): Creation | undefined };
  /** 잔치(6.4). 있으면 합주 무대의 표지판이 '잔치 열기'를 보인다. 열 수 없으면 false(이유는 부른 쪽이 안다) */
  festival?: { open(): boolean };
  frames?: FrameScheduler;
}

/** 종나무에 올라섰을 때 나무의 화음이 울리는 시간(초)과 세기. 종이 여럿 함께 울리므로 돌 하나보다 조금 여리다(4.6) */
export const CHORD_PASS_SEC = 1;
const CHORD_PASS_VELOCITY = 0.5;

/** 지도에서 걸어가기나 바로 이동하면 설치물 모드에서 나온다 */
const LEAVING_COMMANDS: ReadonlySet<string> = new Set(['walk-to-station', 'teleport-to-station', 'teleport']);

export class InstallationController {
  readonly state = new Store<InstallationUiState>({ mode: null, targetKey: FREE_KEY, helpOpen: false });
  private readonly d: InstallationControllerDeps;
  private readonly frames: FrameScheduler;
  private readonly byId = new Map<string, InstallationDef>();
  private readonly byStation = new Map<string, InstallationDef>();
  /** 설치물마다 표지판에서 고른 것(이 실행 동안만 기억한다). 고르지 않았으면 자유로 놀기다 */
  private readonly targets = new Map<string, InstallationTarget>();
  private readonly maps = new WeakMap<QuestVariant, SlotMap>();
  /** 무대 바닥(T7) 설치물마다 하나씩. 돌 설치물에는 없다 */
  private readonly stages = new Map<string, StageBench>();
  /** 징검다리(T2) 설치물마다 하나씩. 돌 설치물과 무대에는 없다 */
  private readonly timelines = new Map<string, TimelineBench>();
  /** 종나무(T4) 설치물마다 하나씩. 다른 설치물에는 없다 */
  private readonly bells = new Map<string, BellBench>();
  /** 계단밭(T5) 설치물마다 하나씩. 다른 설치물에는 없다 */
  private readonly terraces = new Map<string, TerraceBench>();
  /** 건반 다리(T6) 설치물마다 하나씩. 다른 설치물에는 없다 */
  private readonly keyBridges = new Map<string, KeyBridgeBench>();
  /** 지나가는 중에 마지막으로 올라선 나무(설치물마다). 같은 나무 안에서 옮겨 밟을 때 화음을 되풀이하지 않는다 */
  private readonly lastStepTree = new Map<string, number>();
  /** 화면을 옮기는 길(앱이 건다). 바닥 칸을 누르면 그 마디를 패널에서 연다(4.9) */
  private navigator: ((hash: string) => void) | null = null;
  private lastJson = '';
  private lastViews: readonly InstallationView[] = [];
  private pump: unknown = null;
  private disposed = false;
  private readonly offs: Array<() => void> = [];

  constructor(deps: InstallationControllerDeps) {
    this.d = deps;
    this.frames = deps.frames ?? defaultFrames;
    for (const inst of deps.installations) {
      this.byId.set(inst.installationId, inst);
      this.byStation.set(inst.stationCode, inst);
    }
    this.offs.push(
      deps.session.subscribe(() => this.publish()),
      deps.controller.subscribe(() => {
        this.publish();
        this.syncPump();
      }),
      deps.bridge.events.subscribe((ev) => this.onEvent(ev)),
      deps.bridge.commands.subscribe((c) => {
        if (LEAVING_COMMANDS.has(c.type)) this.exit();
      }),
      // 패널이나 겹침 화면에서 마을로 돌아왔다: 컨트롤러가 닫혔을 수 있으니 설치물의 도전을 다시 연다
      deps.bridge.pause.subscribe((paused) => {
        if (!paused) this.resume();
      }),
      this.state.subscribe(() => this.syncPump()),
    );
    this.publish();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopPump();
    for (const off of this.offs.splice(0)) off();
    for (const bench of this.timelines.values()) bench.dispose();
    this.timelines.clear();
    for (const bench of this.bells.values()) bench.dispose();
    this.bells.clear();
    for (const bench of this.terraces.values()) bench.dispose();
    this.terraces.clear();
    for (const bench of this.keyBridges.values()) bench.dispose();
    this.keyBridges.clear();
  }

  // ------------------------------------------------------------------ 읽기
  /** 이 정거장에 설치물이 있는가(월드가 '열기'를 보냈을 때 정거장 안내 대신 설치물 모드로 가는지 가린다) */
  has(stationId: string): boolean {
    return this.byStation.has(stationId);
  }

  /** 화면을 옮기는 길을 건다(앱). 걸기 전에 칸을 눌러도 선택만 되고 패널은 열리지 않는다 */
  setNavigator(go: ((hash: string) => void) | null): void {
    this.navigator = go;
  }

  /** 설치물 id로 정의를 찾는다. 없으면 null */
  definition(installationId: string): InstallationDef | null {
    return this.byId.get(installationId) ?? null;
  }

  /** 합주 무대의 자유 가락을 열 수 있는가(틀로 삼을 합주 과제가 있다) */
  hasFreeMelody(inst: InstallationDef): boolean {
    return this.melodyFrameOf(inst) !== null;
  }

  /** 이 설치물이 합주 무대(바닥 칸)인가 */
  isStage(inst: InstallationDef): boolean {
    return stageLayoutOf(inst) !== null;
  }

  /** 설치물의 무대 작업대. 무대 바닥이 아니면 null */
  stageOf(inst: InstallationDef): StageBench | null {
    const found = this.stages.get(inst.installationId);
    if (found) return found;
    const layout = stageLayoutOf(inst);
    if (!layout) return null;
    const made = new StageBench(this.d.controller, layout);
    this.stages.set(inst.installationId, made);
    return made;
  }

  /** 들어가 있는 합주 무대의 작업대. 지나가기이거나 돌 설치물이면 null */
  get stage(): StageBench | null {
    const inst = this.active;
    return inst ? this.stageOf(inst) : null;
  }

  /** 이 설치물이 징검다리(T2)인가 */
  isTimeline(inst: InstallationDef): boolean {
    return laneOf(inst) !== null;
  }

  /** 징검다리와 물레방아에 들어왔을 때 알리는 말. 놓는 것을 돌이라고 부를지 못이라고 부를지는 설치물이 정한다(4.5) */
  private timelineEntryText(inst: InstallationDef): string {
    const v = vocabOf(inst);
    return `${inst.name}에 들어왔어요. ←→로 칸을 옮기고 Enter로 ${v.piece}을 놓아요. 음높이는 ↑↓, ${v.piece} 길이는 Shift+↑↓, ${v.note}과 ${v.rest}은 R로 바꿔요.${followsBeat(inst) ? ' 박을 옮기려면 PageUp, PageDown이에요.' : ''} 도움은 H, 나가기는 Esc예요.`;
  }

  /** 설치물의 징검다리 작업대. 징검다리가 아니면 null */
  timelineOf(inst: InstallationDef): TimelineBench | null {
    const found = this.timelines.get(inst.installationId);
    if (found) return found;
    const lane = laneOf(inst);
    if (!lane) return null;
    const made = new TimelineBench(this.d.controller, lane, vocabOf(inst));
    // 작업대 혼자 바뀌는 것(고른 칸을 비우기)도 월드의 모습에 올린다. 같은 모습이면 올리지 않는다
    made.subscribe(() => this.publish());
    this.timelines.set(inst.installationId, made);
    return made;
  }

  /** 들어가 있는 징검다리의 작업대. 지나가기이거나 징검다리가 아니면 null */
  get timeline(): TimelineBench | null {
    const inst = this.active;
    return inst ? this.timelineOf(inst) : null;
  }

  /** 이 설치물이 종나무(T4)인가 */
  isBell(inst: InstallationDef): boolean {
    return bellMapOf(inst) !== null;
  }

  /** 설치물의 종나무 작업대. 종나무가 아니면 null */
  bellOf(inst: InstallationDef): BellBench | null {
    const found = this.bells.get(inst.installationId);
    if (found) return found;
    const map = bellMapOf(inst);
    if (!map) return null;
    const made = new BellBench(this.d.controller, map);
    // 작업대 혼자 바뀌는 것(손에 든 종, 종을 걸 가지, 듣는 방식)도 월드의 모습에 올린다. 같은 모습이면 올리지 않는다
    made.subscribe(() => this.publish());
    this.bells.set(inst.installationId, made);
    return made;
  }

  /** 들어가 있는 종나무의 작업대. 지나가기이거나 종나무가 아니면 null */
  get bell(): BellBench | null {
    const inst = this.active;
    return inst ? this.bellOf(inst) : null;
  }

  /** 이 설치물이 계단밭(T5)인가 */
  isTerrace(inst: InstallationDef): boolean {
    return terraceMapOf(inst) !== null;
  }

  /** 설치물의 계단밭 작업대. 계단밭이 아니면 null */
  terraceOf(inst: InstallationDef): TerraceBench | null {
    const found = this.terraces.get(inst.installationId);
    if (found) return found;
    const map = terraceMapOf(inst);
    if (!map) return null;
    const made = new TerraceBench(this.d.controller, map);
    // 작업대 혼자 바뀌는 것(고른 열 비우기 같은 것)도 월드의 모습에 올린다. 같은 모습이면 올리지 않는다
    made.subscribe(() => this.publish());
    this.terraces.set(inst.installationId, made);
    return made;
  }

  /** 들어가 있는 계단밭의 작업대. 지나가기이거나 계단밭이 아니면 null */
  get terrace(): TerraceBench | null {
    const inst = this.active;
    return inst ? this.terraceOf(inst) : null;
  }

  /** 이 설치물이 건반 다리(T6)인가 */
  isKeyBridge(inst: InstallationDef): boolean {
    return keyBridgeMapOf(inst) !== null;
  }

  /** 설치물의 건반 다리 작업대. 건반 다리가 아니면 null */
  keyBridgeOf(inst: InstallationDef): KeyBridgeBench | null {
    const found = this.keyBridges.get(inst.installationId);
    if (found) return found;
    if (!keyBridgeMapOf(inst)) return null;
    const made = new KeyBridgeBench(this.d.controller, inst);
    // 작업대 혼자 바뀌는 것(널 위의 커서, 음정 이름을 고르는 중간 단계)도 월드의 모습에 올린다. 같은 모습이면 올리지 않는다
    made.subscribe(() => this.publish());
    this.keyBridges.set(inst.installationId, made);
    return made;
  }

  /** 들어가 있는 건반 다리의 작업대. 지나가기이거나 건반 다리가 아니면 null */
  get keyBridge(): KeyBridgeBench | null {
    const inst = this.active;
    return inst ? this.keyBridgeOf(inst) : null;
  }

  /** 들어가 있는 설치물의 정의 */
  get active(): InstallationDef | null {
    const mode = this.state.get().mode;
    return mode ? (this.byId.get(mode.installationId) ?? null) : null;
  }

  private targetOf(inst: InstallationDef): InstallationTarget {
    return this.targets.get(inst.installationId) ?? this.defaultTarget(inst);
  }

  /**
   * 고르지 않았을 때 보여 줄 것: 자유로 놀기(합주 무대는 자유 가락)다. 맨 위의 자유로 놀기가 기본이다(4.2).
   * 합주 무대는 자유 가락의 틀(첫 과제의 첫 판본)을 만들 수 없을 때만 열 수 있는 첫 과제 판본이다. 그것도 없으면 자유로 놀기(들어갈 수 없다).
   */
  private defaultTarget(inst: InstallationDef): InstallationTarget {
    if (!this.isStage(inst) || this.melodyFrameOf(inst) !== null) return FREE;
    for (const ref of inst.quests) {
      const entry = this.d.catalog.get(ref.questId);
      for (const variantId of ref.variantIds) {
        const variant = entry?.variants.find((v) => v.variantId === variantId);
        if (variant && isSelectable(variant.state)) return { kind: 'quest', questId: ref.questId, variantId };
      }
    }
    return FREE;
  }

  /** 합주 무대의 자유 가락 틀(목표 악보가 빈 판본). 틀로 삼을 과제가 없거나 합주 과제가 아니면 null */
  private melodyFrameOf(inst: InstallationDef): QuestVariant | null {
    if (!this.isStage(inst)) return null;
    const ref = inst.quests[0];
    const base = ref ? this.d.catalog.get(ref.questId)?.definition.variants[ref.variantIds[0] ?? ''] : undefined;
    return base && isArrangementVariant(base) ? freeMelodyVariant(base) : null;
  }

  /** 지금 고른 것의 이름('자유로 놀기' 또는 '장음계 배열하기 · C장조') */
  targetLabel(inst: InstallationDef): string {
    return this.signOf(inst).find((e) => e.selected)?.label ?? FREE_PLAY_LABEL;
  }

  /**
   * 표지판: 자유로 놀기가 맨 위이고, 이 정거장의 과제와 판본이 모두 있다. 열 수 없는 것은 '준비 중'으로 적고 고를 수 없다(W-10).
   * 합주 무대는 맨 아래에 도전을 바꾸지 않고 바로 하는 일이 있다: 내 곡 다시 듣기, 잔치 열기(4.9).
   */
  signOf(inst: InstallationDef): SignEntry[] {
    const selected = targetKey(this.targetOf(inst));
    const stage = this.isStage(inst);
    const melody = stage ? this.melodyFrameOf(inst) : null;
    const entries: SignEntry[] = stage
      ? [
          melody
            ? { key: FREE_KEY, target: FREE, action: null, label: FREE_MELODY_LABEL, badge: null, selectable: true, selected: selected === FREE_KEY, note: FREE_MELODY_NOTE }
            : { key: FREE_KEY, target: FREE, action: null, label: FREE_MELODY_LABEL, badge: STATE_LABEL_KO.preparing, selectable: false, selected: false, note: '곧 열려요.' },
        ]
      : [{ key: FREE_KEY, target: FREE, action: null, label: FREE_PLAY_LABEL, badge: null, selectable: true, selected: selected === FREE_KEY, note: FREE_PLAY_NOTE }];
    const station = this.d.map.station(inst.stationCode);
    const questIds = [...new Set([...(station?.questIds ?? []), ...inst.quests.map((q) => q.questId)])];
    for (const questId of questIds) {
      const entry = this.d.catalog.get(questId);
      const ref = inst.quests.find((q) => q.questId === questId);
      if (!entry || !ref) {
        const title = entry?.title ?? PLANNED_QUESTS[questId]?.title ?? questId;
        entries.push({
          key: `${questId}/-`,
          target: { kind: 'quest', questId, variantId: '' },
          action: null,
          label: title,
          badge: STATE_LABEL_KO.preparing,
          selectable: false,
          selected: false,
          note: entry ? '이 설치물에서 풀 수 있게 만드는 중이에요.' : '아직 만들지 않은 과제예요.',
        });
        continue;
      }
      for (const variantId of ref.variantIds) {
        const variant = entry.variants.find((v) => v.variantId === variantId);
        if (!variant) continue;
        const key = `${questId}/${variantId}`;
        const selectable = isSelectable(variant.state);
        entries.push({
          key,
          target: { kind: 'quest', questId, variantId },
          action: null,
          label: `${entry.title} · ${variant.label}`,
          badge: variant.state === 'open' ? null : STATE_LABEL_KO[variant.state],
          selectable,
          selected: selected === key,
          note: selectable ? null : '검수가 끝나면 열려요.',
        });
      }
    }
    if (stage) entries.push(...this.stageActionsOf());
    return entries;
  }

  /** 합주 무대 표지판의 맨 아래 항목들. 저장한 곡과 잔치를 다루는 곳이 연결되어 있을 때만 보인다 */
  private stageActionsOf(): SignEntry[] {
    const out: SignEntry[] = [];
    const creations = this.d.creations;
    if (creations) {
      const list = creations.list();
      if (list.length === 0) {
        out.push({ key: 'songs', target: null, action: null, label: SONGS_LABEL, badge: null, selectable: false, selected: false, note: NO_SONGS_NOTE });
      } else {
        // 가장 최근에 저장한 곡이 위에 온다
        for (const c of [...list].reverse()) {
          out.push({ key: `song:${c.creationId}`, target: null, action: { kind: 'song', creationId: c.creationId }, label: `${SONGS_LABEL} · ${c.name}`, badge: null, selectable: true, selected: false, note: describeCreation(c) });
        }
      }
    }
    if (this.d.festival) out.push({ key: 'festival', target: null, action: { kind: 'festival' }, label: FESTIVAL_LABEL, badge: null, selectable: true, selected: false, note: FESTIVAL_NOTE });
    return out;
  }

  // ------------------------------------------------------------------ 들어가기와 나가기
  /**
   * 설치물 모드로 들어간다. 이 정거장에 설치물이 없거나 열 수 있는 도전이 하나도 없으면 false(호출한 쪽이 정거장 안내를 연다).
   * 도전을 열 수 없는데 모드만 켜 두면 화면에 작업대가 없는 채로 캐릭터가 서 있게 되므로, 그때는 들어가지 않는다.
   */
  enter(stationId: string): boolean {
    const inst = this.byStation.get(stationId);
    if (!inst) return false;
    const cur = this.state.get();
    if (cur.mode?.installationId === inst.installationId) return true;
    const mode: InstallationMode = { installationId: inst.installationId, stationId };
    this.state.set({ mode, targetKey: targetKey(this.targetOf(inst)), helpOpen: false });
    this.d.bridge.installationMode.set(mode);
    if (!this.ensureOpen()) {
      this.state.set(cur);
      this.d.bridge.installationMode.set(null);
      return false;
    }
    this.d.controller.announce(
      this.isStage(inst)
        ? `${inst.name}에 들어왔어요. ←→로 마디를 고르고 Enter로 패널에서 열어요. 도움은 H, 나가기는 Esc예요.`
        : this.isTimeline(inst)
          ? this.timelineEntryText(inst)
          : this.isBell(inst)
            ? bellEntryText(inst.name, bellMapOf(inst)!.form)
            : this.isTerrace(inst)
              ? terraceEntryText(inst.name, this.terraceOf(inst)!.available && this.terraceOf(inst)!.accidentalsAllowed)
              : this.isKeyBridge(inst)
                ? bridgeEntryText(inst.name, this.keyBridgeOf(inst)!.task)
                : `${inst.name}에 들어왔어요. ←→로 자리를 옮기고 Enter로 놓아요. 도움은 H, 나가기는 Esc예요.`,
    );
    this.publish();
    return true;
  }

  /** 나간다. 초안은 자동으로 보관된다(4.2). 열려 있던 도전은 닫고 월드는 다시 걷는다 */
  exit(): void {
    const st = this.state.get();
    const inst = st.mode ? this.byId.get(st.mode.installationId) : undefined;
    if (!st.mode || !inst) return;
    const c = this.d.controller;
    c.stopPlayback();
    const ours = this.isOpen(inst, this.targetOf(inst));
    this.d.bridge.installationMode.set(null);
    this.d.bridge.bottomInset.set(0);
    this.state.set({ ...st, mode: null, helpOpen: false });
    if (ours) c.close();
    c.announce(`${inst.name}에서 나왔어요. 놓은 것은 그대로 보관돼요.`);
    this.publish();
  }

  toggleHelp(): void {
    const st = this.state.get();
    if (st.mode) this.state.set({ ...st, helpOpen: !st.helpOpen });
  }

  // ------------------------------------------------------------------ 표지판
  /** 표지판에서 고른다. 고를 수 없으면 false. 고르면 그 도전이 열린다. 바로 하는 일(내 곡 듣기, 잔치)이면 그 일을 한다 */
  select(key: string): boolean {
    const inst = this.active;
    if (!inst) return false;
    const entry = this.signOf(inst).find((e) => e.key === key);
    if (!entry || !entry.selectable) return false;
    if (entry.action) return this.act(entry.action);
    const target = entry.target;
    if (!target) return false;
    if (entry.selected && this.isOpen(inst, target)) return true;
    this.d.controller.stopPlayback();
    this.targets.set(inst.installationId, target);
    this.state.set({ ...this.state.get(), targetKey: entry.key });
    if (!this.openTarget(inst, target)) {
      // 열 수 없으면 자유로 놀기로 돌아간다
      this.targets.delete(inst.installationId);
      this.state.set({ ...this.state.get(), targetKey: FREE_KEY });
      this.openTarget(inst, FREE);
      this.d.controller.announce('그 과제는 지금 열 수 없어서 자유로 놀기로 돌아왔어요.');
    } else {
      const name = target.kind === 'free' ? (this.isStage(inst) ? FREE_MELODY_LABEL : FREE_PLAY_LABEL) : entry.label;
      this.d.controller.announce(target.kind === 'free' ? fillTemplate('{name:을를} 골랐어요. 판정 없이 놓아 보세요.', { name }) : fillTemplate('{name:을를} 열었어요.', { name }));
    }
    this.publish();
    return true;
  }

  /** 도전을 바꾸지 않고 바로 하는 일 */
  private act(action: SignAction): boolean {
    if (action.kind === 'festival') return this.d.festival?.open() ?? false;
    return this.playSong(action.creationId);
  }

  private previewName: string | null = null;

  /** 저장한 곡을 무대에서 들려 준다(4.9, 6.1 '만듦'). 곡이 없으면 false */
  playSong(creationId: string): boolean {
    const c = this.d.creations?.get(creationId);
    if (!c) return false;
    const c0 = this.d.controller;
    this.previewName = c.name;
    const ok = c0.previewPlayback(creationPlayback(c));
    if (!ok) this.previewName = null;
    else c0.announce(fillTemplate('{name:을를} 들려 줘요.', { name: c.name }));
    this.publish();
    return ok;
  }

  /** 저장한 곡을 듣는 중이면 그 이름. 아니면 null */
  previewLabel(): string | null {
    return this.d.controller.previewing ? this.previewName : null;
  }

  // ------------------------------------------------------------------ 열려 있는 도전
  private isOpen(inst: InstallationDef, target: InstallationTarget): boolean {
    const cur = this.d.controller.current;
    if (!cur) return false;
    if (target.kind === 'free') return cur.free === true && cur.entry.questId === freeQuestId(inst.installationId);
    return !cur.free && cur.entry.questId === target.questId && cur.variant.variantId === target.variantId;
  }

  private openTarget(inst: InstallationDef, target: InstallationTarget): boolean {
    const c = this.d.controller;
    if (target.kind === 'free') return c.openFree(inst);
    const r = c.open(target.questId, target.variantId);
    if (r.ok) this.d.opened?.mark(target.questId);
    return r.ok;
  }

  /** 설치물 모드에 있는 동안 그 도전이 열려 있게 지킨다(패널을 다녀오면 컨트롤러가 닫혀 있다) */
  private ensureOpen(): boolean {
    const inst = this.active;
    if (!inst) return false;
    const target = this.targetOf(inst);
    if (this.isOpen(inst, target)) return true;
    if (this.openTarget(inst, target)) return true;
    // 고른 과제를 열 수 없으면 자유로 놀기로
    this.targets.delete(inst.installationId);
    this.state.set({ ...this.state.get(), targetKey: FREE_KEY });
    return this.openTarget(inst, FREE);
  }

  private resume(): void {
    if (this.state.get().mode && this.ensureOpen()) this.publish();
  }

  // ------------------------------------------------------------------ 동작
  /** 패널로 볼 주소. 돌 설치물의 자유로 놀기이거나 패널 화면이 없으면 이유를 알리고 null. 합주 무대의 자유 가락은 곡 패널로 편집한다(4.9) */
  panelHash(): string | null {
    const inst = this.active;
    if (!inst) return null;
    const target = this.targetOf(inst);
    if (target.kind === 'free') {
      if (!this.isStage(inst) || this.melodyFrameOf(inst) === null) {
        this.d.controller.announce(FREE_PLAY_NO_PANEL);
        return null;
      }
      const ref = inst.quests[0];
      const variant = ref ? this.d.catalog.get(ref.questId)?.variants.find((v) => v.variantId === ref.variantIds[0]) : undefined;
      if (!variant || !variant.panelIds.some((id) => this.d.panels.has(id))) {
        this.d.controller.announce(NO_PANEL_YET);
        return null;
      }
      return freeHashFor(inst.installationId);
    }
    const variant = this.d.catalog.get(target.questId)?.variants.find((v) => v.variantId === target.variantId);
    if (!variant || !variant.panelIds.some((id) => this.d.panels.has(id))) {
      this.d.controller.announce(NO_PANEL_YET);
      return null;
    }
    return ContentCatalog.hashFor(target.questId, target.variantId);
  }

  /**
   * 키 지도(4.2)의 동작을 한다. 키보드와 조작 막대의 단추가 같은 길을 쓴다.
   * 화면을 옮겨야 하면(패널로 보기) 갈 주소를 돌려준다.
   */
  perform(action: BenchAction): { navigate: string } | null {
    if (!this.ensureOpen()) return null;
    const request = this.d.bench.perform(action);
    if (request === 'exit') this.exit();
    else if (request === 'help') this.toggleHelp();
    else if (request === 'view-panel') {
      const hash = this.panelHash();
      return hash ? { navigate: hash } : null;
    }
    return null;
  }

  /**
   * 징검다리 작업대의 키 지도(4.4)의 동작을 한다. 키보드와 조작 막대의 단추가 같은 길을 쓴다.
   * 화면을 옮겨야 하면(패널로 보기) 갈 주소를 돌려준다.
   */
  performTimeline(action: TimelineAction): { navigate: string } | null {
    const bench = this.timeline;
    if (!bench || !this.ensureOpen()) return null;
    const request = bench.perform(action);
    if (request === 'exit') this.exit();
    else if (request === 'help') this.toggleHelp();
    else if (request === 'view-panel') {
      const hash = this.panelHash();
      return hash ? { navigate: hash } : null;
    }
    return null;
  }

  /**
   * 종나무 작업대의 키 지도(4.6)의 동작을 한다. 키보드와 조작 막대의 단추가 같은 길을 쓴다.
   * 화면을 옮겨야 하면(패널로 보기) 갈 주소를 돌려준다.
   */
  performBell(action: BellAction): { navigate: string } | null {
    const bench = this.bell;
    if (!bench || !this.ensureOpen()) return null;
    const request = bench.perform(action);
    if (request === 'exit') this.exit();
    else if (request === 'help') this.toggleHelp();
    else if (request === 'view-panel') {
      const hash = this.panelHash();
      return hash ? { navigate: hash } : null;
    }
    return null;
  }

  /**
   * 계단밭 작업대의 키 지도(4.7)의 동작을 한다. 키보드와 조작 막대의 단추가 같은 길을 쓴다.
   * 화면을 옮겨야 하면(패널로 보기) 갈 주소를 돌려준다.
   */
  performTerrace(action: TerraceAction): { navigate: string } | null {
    const bench = this.terrace;
    if (!bench || !this.ensureOpen()) return null;
    const request = bench.perform(action);
    if (request === 'exit') this.exit();
    else if (request === 'help') this.toggleHelp();
    else if (request === 'view-panel') {
      const hash = this.panelHash();
      return hash ? { navigate: hash } : null;
    }
    return null;
  }

  /**
   * 건반 다리 작업대의 키 지도(4.8)의 동작을 한다. 키보드와 조작 막대의 단추가 같은 길을 쓴다.
   * 화면을 옮겨야 하면(패널로 보기) 갈 주소를 돌려준다.
   */
  performKeyBridge(action: BridgeAction): { navigate: string } | null {
    const bench = this.keyBridge;
    if (!bench || !this.ensureOpen()) return null;
    const request = bench.perform(action);
    if (request === 'exit') this.exit();
    else if (request === 'help') this.toggleHelp();
    else if (request === 'view-panel') {
      const hash = this.panelHash();
      return hash ? { navigate: hash } : null;
    }
    return null;
  }

  /**
   * 합주 무대 바닥의 키 지도(4.9)의 동작을 한다. 키보드와 조작 막대의 단추가 같은 길을 쓴다.
   * 화면을 옮겨야 하면(마디를 패널에서 열기) 갈 주소를 돌려준다.
   */
  performStage(action: StageAction): { navigate: string } | null {
    const stage = this.stage;
    if (!stage || !this.ensureOpen()) return null;
    const request = stage.perform(action);
    if (request === 'exit') this.exit();
    else if (request === 'help') this.toggleHelp();
    else if (request === 'view-panel') {
      const hash = this.openMeasureHash(stage);
      return hash ? { navigate: hash } : null;
    }
    return null;
  }

  /** 고른 마디를 패널에서 여는 주소. 마디를 고르지 않았으면 1마디를 고르고 연다. 패널이 없으면 이유를 알리고 null */
  private openMeasureHash(stage: StageBench): string | null {
    if (stage.measure() === null) stage.selectMeasure(0);
    return this.panelHash();
  }

  // ------------------------------------------------------------------ 월드의 사건
  private onEvent(ev: WorldEvent): void {
    if (ev.type === 'slot-pressed') {
      const mode = this.state.get().mode;
      if (!mode || mode.installationId !== ev.installationId || !this.ensureOpen()) return;
      const stage = this.stage;
      if (stage) {
        // 바닥 칸을 누르면 그 마디가 패널에서 열린다(4.9). 쓰지 않는 칸이면 이유만 알린다
        if (stage.press(ev.slot) !== null) {
          const hash = this.panelHash();
          if (hash) this.navigator?.(hash);
        }
        return;
      }
      const timeline = this.timeline;
      if (timeline) {
        timeline.press(ev.slot, ev.tick);
        return;
      }
      const bell = this.bell;
      if (bell) {
        bell.press(ev.slot);
        return;
      }
      const terrace = this.terrace;
      if (terrace) {
        // 월드가 눌린 높이를 온음계 칸 수로 바꿔 보낸다. 높이 없이 눌렸으면(열만 눌렀거나 키보드) 열만 고른다
        terrace.press(ev.slot, ev.step);
        return;
      }
      const keyBridge = this.keyBridge;
      if (keyBridge) {
        // 월드가 눌린 널을 자리 번호로 바꿔 보낸다. 널의 소리는 널이 정한다
        keyBridge.press(ev.slot);
        return;
      }
      this.d.bench.press(ev.slot);
      return;
    }
    if (ev.type === 'stepped') {
      // 지나가는 중에 돌을 밟으면 그 돌의 음이 0.5초 울린다. 빈 돌은 조용하다(4.3). 설치물 모드에서는 걷지 않으므로 오지 않는다
      if (this.state.get().mode) return;
      // 종나무는 가지 하나하나가 아니라 올라선 나무의 화음을 울린다(4.6 '차례로 지나가면 화음이 순서대로 울린다')
      const inst = this.byId.get(ev.installationId);
      const bellMap = inst ? bellMapOf(inst) : null;
      if (bellMap) {
        this.stepOnBells(ev.installationId, bellMap, ev.slot, ev.entered === true);
        return;
      }
      const midi = this.lastViews.find((v) => v.installationId === ev.installationId)?.slots.find((s) => s.slot === ev.slot)?.midi;
      if (typeof midi === 'number') this.d.mixer.playWorldNote(midi, STEP_NOTE_SEC);
    }
  }

  /** 지나가다 종나무에 올라섰다: 그 나무에 걸린 종들이 함께 울린다. 같은 나무 안에서 옮겨 밟을 때는 다시 울리지 않는다. 걸린 종이 없는 나무는 조용하다 */
  private stepOnBells(installationId: string, map: BellMap, slot: number, entered: boolean): void {
    const cell = bellCellOf(map, slot);
    if (!cell) return;
    const last = this.lastStepTree.get(installationId);
    this.lastStepTree.set(installationId, cell.tree);
    if (!entered && last === cell.tree) return;
    const view = this.lastViews.find((v) => v.installationId === installationId)?.bells;
    if (!view) return;
    for (const midi of treeChordMidis(view, cell.tree)) this.d.mixer.playWorldNote(midi, CHORD_PASS_SEC, CHORD_PASS_VELOCITY);
  }

  // ------------------------------------------------------------------ 돌의 지금 모습
  private mapOf(def: QuestVariant): SlotMap {
    let m = this.maps.get(def);
    if (!m) {
      m = slotMapOf(def);
      this.maps.set(def, m);
    }
    return m;
  }

  /** 설치물이 지금 보여 주는 도전: 표지판에서 고른 것, 없으면 자유로 놀기(합주 무대는 자유 가락) */
  private shown(inst: InstallationDef): { questId: string; variantId: string; def: QuestVariant } | null {
    const target = this.targetOf(inst);
    if (target.kind === 'quest') {
      const def = this.d.catalog.get(target.questId)?.definition.variants[target.variantId];
      if (def) return { questId: target.questId, variantId: target.variantId, def };
    }
    // 자유로 놀기의 틀은 설치물이 다루는 첫 과제의 첫 판본이다(controller.openFree와 같다)
    const ref = inst.quests[0];
    const base = ref ? this.d.catalog.get(ref.questId)?.definition.variants[ref.variantIds[0] ?? ''] : undefined;
    if (!base) return null;
    const frame = this.isStage(inst) ? (this.melodyFrameOf(inst) ?? base) : (this.stonesFrameOf(inst) ?? this.bellFrameOf(inst) ?? this.terraceFrameOf(inst) ?? this.keyBridgeFrameOf(inst) ?? base);
    return { questId: freeQuestId(inst.installationId), variantId: FREE_VARIANT_ID, def: frame };
  }

  /** 합주 무대 바닥의 모습: 칸마다 채운 정도, 고른 마디, 판정이 가리킨 칸, 울리는 칸. 자유 가락도 같은 바닥이다(채운 정도만 보인다) */
  private stageViewOf(inst: InstallationDef, stage: StageBench): InstallationView {
    const empty = (slot: number) => ({ slot, name: null, midi: null, flagged: false, selected: false, playing: false, fill: 'empty' as const });
    const shown = this.shown(inst);
    if (!shown) return { installationId: inst.installationId, slots: inst.slots.map((s) => empty(s.slot)) };
    const cur = this.d.controller.current;
    const free = this.targetOf(inst).kind === 'free';
    const live = !!cur && !!cur.free === free && cur.entry.questId === shown.questId && cur.variant.variantId === shown.variantId && stage.available;
    // 열려 있지 않을 때(걷는 중, 패널을 다녀오는 중)도 보관된 초안의 채움은 보인다
    const cells = stageCellViewsOf(stage, shown.def, this.d.session.contentOf(shown.questId, shown.variantId));
    const flagged = new Set(live ? stage.flagged() : []);
    // 저장한 곡을 듣는 동안은 위 줄의 마디가 차례로 울린다(내 곡 다시 듣기). 도전을 듣는 것과 겹치지 않는다
    const previewTick = this.d.controller.previewTick();
    const playing = new Set(previewTick !== null ? playingStageSlots(stage.layout, [CREATION_VOICE_ID], ALL_SCOPE, previewTick, CREATION_BAR_TICKS) : live ? stage.playhead() : []);
    const selected = live ? stage.measure() : null;
    return {
      installationId: inst.installationId,
      slots: cells.map((c) => ({
        slot: c.slot,
        name: c.name,
        midi: null,
        flagged: flagged.has(c.slot),
        selected: selected !== null && selected === c.measureIndex && c.fill !== 'unused',
        playing: playing.has(c.slot),
        fill: c.fill,
      })),
    };
  }

  /** 종나무의 자유로 놀기 틀(도전 컨트롤러의 openFree와 같은 틀이다: 첫 판본에서 음역을 가지 전체로 넓힌 것). 종나무가 아니면 null */
  private bellFrameOf(inst: InstallationDef): QuestVariant | null {
    return freeBellFrameOf(inst, (q, v) => this.d.catalog.get(q)?.definition.variants[v]);
  }

  /** 징검다리의 자유로 놀기 틀(도전 컨트롤러의 openFree와 같은 틀이다). 징검다리가 아니면 null */
  private stonesFrameOf(inst: InstallationDef): QuestVariant | null {
    return freeStonesFrameOf(inst, (q, v) => this.d.catalog.get(q)?.definition.variants[v]);
  }

  /** 계단밭의 자유로 놀기 틀(도전 컨트롤러의 openFree와 같은 틀이다: 열 여덟 개, 음자리표가 번갈아 선다). 계단밭이 아니면 null */
  private terraceFrameOf(inst: InstallationDef): QuestVariant | null {
    return freeTerraceFrameOf(inst, (q, v) => this.d.catalog.get(q)?.definition.variants[v]);
  }

  /** 건반 다리의 자유로 놀기 틀(도전 컨트롤러의 openFree와 같은 틀이다: 설치물이 다루는 첫 과제의 종류를 따른다). 건반 다리가 아니면 null */
  private keyBridgeFrameOf(inst: InstallationDef): QuestVariant | null {
    return freeBridgeFrameOf(inst, (q, v) => this.d.catalog.get(q)?.definition.variants[v]);
  }

  /**
   * 징검다리의 모습: 놓인 돌 구간, 남은 물, 놓으려는 자리, 듣는 중의 물결 선. 열려 있지 않을 때도 보관된 초안의 돌은 보인다.
   * slots는 가장 잘게 나눈 칸의 요약이다(그 칸을 덮은 돌의 이름과 음, 고른 칸, 듣는 칸).
   */
  private stonesViewOf(inst: InstallationDef, bench: TimelineBench): InstallationView {
    const shown = this.shown(inst);
    const empty = (slot: number) => ({ slot, name: null, midi: null, flagged: false, selected: false, playing: false });
    if (!shown) return { installationId: inst.installationId, slots: inst.slots.map((s) => empty(s.slot)) };
    const cur = this.d.controller.current;
    const free = this.targetOf(inst).kind === 'free';
    const live = !!cur && !!cur.free === free && cur.entry.questId === shown.questId && cur.variant.variantId === shown.variantId && bench.available;
    const timeline = bench.viewFor(shown.def, this.d.session.contentOf(shown.questId, shown.variantId), live, free);
    const cursor = timeline.cursor;
    return {
      installationId: inst.installationId,
      timeline,
      slots: inst.slots.map((s) => {
        const at = slotStartTick(bench.lane, s.slot);
        const stone = timeline.stones.find((st) => st.startTick <= at && at < st.endTick);
        return {
          slot: s.slot,
          name: stone?.name ?? null,
          midi: stone?.midi ?? null,
          flagged: stone?.flagged ?? false,
          selected: cursor !== null && cursor.startTick <= at && at < cursor.startTick + timeline.gridTicks,
          playing: stone?.playing ?? false,
        };
      }),
    };
  }

  /**
   * 종나무의 모습: 걸린 종, 고른 종 자리와 가지, 판정이 가리킨 종, 울리는 종. 열려 있지 않을 때도 보관된 초안의 종은 보인다.
   * slots는 가지(고리) 하나하나의 요약이다: 종이 걸린 가지만 이름과 높이를 갖는다(지나가는 중의 소리와 점검이 읽는다).
   */
  private bellsViewOf(inst: InstallationDef, bench: BellBench): InstallationView {
    const shown = this.shown(inst);
    const empty = (slot: number) => ({ slot, name: null, midi: null, flagged: false, selected: false, playing: false });
    if (!shown) return { installationId: inst.installationId, slots: inst.slots.map((s) => empty(s.slot)) };
    const cur = this.d.controller.current;
    const free = this.targetOf(inst).kind === 'free';
    const live = !!cur && !!cur.free === free && cur.entry.questId === shown.questId && cur.variant.variantId === shown.variantId && bench.available;
    const bells = bench.viewFor(shown.def, this.d.session.contentOf(shown.questId, shown.variantId), live);
    const map = bench.map;
    return {
      installationId: inst.installationId,
      bells,
      slots: inst.slots.map((s) => {
        const cell = bellCellOf(map, s.slot);
        const mark = bells.bells.find((b) => b.slot === s.slot);
        return {
          slot: s.slot,
          name: mark?.name ?? null,
          midi: mark?.midi ?? null,
          flagged: mark?.flagged ?? false,
          selected: !!cell && bells.cursor === cell.draft && bells.cursorOctave === cell.octave,
          playing: mark?.playing ?? false,
        };
      }),
    };
  }

  /**
   * 계단밭의 모습: 열마다 등(높이, 변화표), 고른 열과 높이, 판정이 가리킨 열, 울리는 열. 열려 있지 않을 때도 보관된 초안의 등은 보인다.
   * slots는 열(설치물의 자리) 하나하나의 요약이다: 등이 놓인 열만 높이(midi)를 갖고, 이름은 자유로 놀 때만 있다(문제를 푸는 중에는 이름을 밝히지 않는다, 4.7).
   */
  private terraceViewOf(inst: InstallationDef, bench: TerraceBench): InstallationView {
    const shown = this.shown(inst);
    const empty = (slot: number) => ({ slot, name: null, midi: null, flagged: false, selected: false, playing: false });
    const blank: InstallationView = { installationId: inst.installationId, slots: inst.slots.map((s) => empty(s.slot)) };
    if (!shown) return blank;
    const cur = this.d.controller.current;
    const free = this.targetOf(inst).kind === 'free';
    const live = !!cur && !!cur.free === free && cur.entry.questId === shown.questId && cur.variant.variantId === shown.variantId && bench.available;
    const terrace = bench.viewFor(shown.def, this.d.session.contentOf(shown.questId, shown.variantId), live, free);
    if (!terrace) return blank;
    return {
      installationId: inst.installationId,
      terrace,
      slots: inst.slots.map((s) => {
        const mark = terrace.columns.find((c) => c.column === s.slot);
        return { slot: s.slot, name: mark?.name ?? null, midi: mark?.midi ?? null, flagged: mark?.flagged ?? false, selected: !!mark && terrace.cursor === mark.draft, playing: mark?.playing ?? false };
      }),
    };
  }

  /**
   * 건반 다리의 모습: 널 위의 커서, 걸린 이름표, 말뚝과 밧줄, 꽂힌 깃발, 표지판 악보, 울리는 널. 열려 있지 않을 때도 보관된 초안의 이름표와 깃발은 보인다.
   * slots는 널 하나하나의 요약이다: 널은 늘 자기 소리 높이(midi)를 갖는다(밟으면 그 소리가 난다). 이름은 흰 널과 자유로 놀 때만 있다(문제를 푸는 중에는 검은 널의 이름을 밝히지 않는다, 4.8).
   */
  private keyBridgeViewOf(inst: InstallationDef, bench: KeyBridgeBench): InstallationView {
    const planks = planksOf(keyBridgeMapOf(inst)!);
    const free = this.targetOf(inst).kind === 'free';
    const shown = this.shown(inst);
    const cur = this.d.controller.current;
    const live = !!shown && !!cur && !!cur.free === free && cur.entry.questId === shown.questId && cur.variant.variantId === shown.variantId && bench.available;
    const bridge = shown ? bench.viewFor(shown.def, this.d.session.contentOf(shown.questId, shown.variantId), live, free) : null;
    return {
      installationId: inst.installationId,
      ...(bridge ? { bridge } : {}),
      slots: inst.slots.map((s) => {
        const p = planks[s.slot - 1];
        return {
          slot: s.slot,
          name: p && (!p.black || free) ? p.name : null,
          midi: p ? p.midi : null,
          flagged: !!bridge && (bridge.tags.some((t) => t.plank === s.slot && t.flagged) || bridge.flags.some((f) => f.plank === s.slot && f.flagged)),
          selected: !!bridge && bridge.cursor === s.slot,
          playing: !!bridge && bridge.playing.includes(s.slot),
        };
      }),
    };
  }

  private viewOf(inst: InstallationDef): InstallationView {
    const stage = this.stageOf(inst);
    if (stage) return this.stageViewOf(inst, stage);
    const stones = this.timelineOf(inst);
    if (stones) return this.stonesViewOf(inst, stones);
    const bells = this.bellOf(inst);
    if (bells) return this.bellsViewOf(inst, bells);
    const terrace = this.terraceOf(inst);
    if (terrace) return this.terraceViewOf(inst, terrace);
    const keyBridge = this.keyBridgeOf(inst);
    if (keyBridge) return this.keyBridgeViewOf(inst, keyBridge);
    const empty = (slot: number) => ({ slot, name: null, midi: null, flagged: false, selected: false, playing: false });
    const shown = this.shown(inst);
    if (!shown) return { installationId: inst.installationId, slots: inst.slots.map((s) => empty(s.slot)) };
    const map = this.mapOf(shown.def);
    const slots = map.view(this.d.session.contentOf(shown.questId, shown.variantId));
    const cur = this.d.controller.current;
    const live = !!cur && cur.entry.questId === shown.questId && cur.variant.variantId === shown.variantId && this.d.bench.available;
    const flagged = new Set(live ? this.d.bench.flagged() : []);
    const cursor = live ? this.d.bench.cursor : null;
    const playing = live ? this.d.bench.playhead() : null;
    return {
      installationId: inst.installationId,
      slots: slots.map((v) => ({ slot: v.slot, name: v.name, midi: v.midi, flagged: flagged.has(v.slot), selected: cursor === v.slot, playing: playing === v.slot })),
    };
  }

  /** 월드가 돌 위에 그릴 모습을 다리에 올린다. 바뀐 것이 없으면 올리지 않는다 */
  private publish(): void {
    if (this.disposed) return;
    const views = this.d.installations.map((inst) => this.viewOf(inst));
    const json = JSON.stringify(views);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.lastViews = views;
    this.d.bridge.installationViews.set(views);
  }

  // ------------------------------------------------------------------ 듣는 중의 돌
  /** 듣는 동안은 프레임마다 재생 위치를 읽어 '지금 울리는 자리'를 돌에 알린다. 소리를 꺼 두어도 움직인다(W-8) */
  private syncPump(): void {
    const playing = (this.d.controller.playing !== null || this.d.controller.previewing) && this.state.get().mode !== null;
    if (playing && this.pump === null) this.schedule();
    else if (!playing) this.stopPump();
  }

  private schedule(): void {
    this.pump = this.frames.request(() => {
      this.pump = null;
      if (this.disposed) return;
      this.publish();
      this.syncPump();
    });
  }

  private stopPump(): void {
    if (this.pump !== null) this.frames.cancel(this.pump);
    this.pump = null;
  }
}

/** 보관된 초안(열려 있지 않아도)으로 바닥 칸의 모습을 만든다 */
function stageCellViewsOf(stage: StageBench, def: QuestVariant, content: DraftContent): StageCellView[] {
  return stageCellViews(stage.layout, def, content);
}
