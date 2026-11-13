// 7-3 건반 다리(T6, 4.8)의 두뇌: 설치물 컨트롤러의 다리 길(들어가기, 표지판, 널 옮기기, 이름표 걸기, 끝 말뚝과 밧줄, 순서 깃발, 듣기, 판정 표식, 월드로 올라가는 모습)과 작업대(KeyBridgeBench).
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 칸 계산은 key-bridge 시험이, 키 표는 key-bridge-keys 시험이, 화면은 key-bridge-hud 시험이, 월드 그림은 key-bridge-layer 시험이, 실제 걷기와 누르기는 flow 시험이 맡는다.
// 사람이 하는 일(귀로 널 소리 가리기, 손가락으로 누르기, 낭독기)은 여기서 하지 않는다. 사람 확인 대기로 남긴다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import type { IntervalQuality } from '@/domain/pitch';
import type { InstallationDef } from '@/domain/installation';
import { NAME_TAGS } from '@/domain/keyBridge';
import { STEP_NOTE_SEC } from '@/domain/slotmap';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { BRIDGE_NOTE_TICKS } from '@/ui/challenge/keyBridgeBench';
import type { FlagItem, KeyBridgeBench, QuestionItem, TagItem } from '@/ui/challenge/keyBridgeBench';
import { NO_FLAG_NOTICE, NO_STAKE_NOTICE, NO_TAG_NOTICE, PICK_ITEM_FIRST, PICK_PLANK_FIRST, PICK_STAKE_FIRST, bridgeEntryText } from '@/ui/challenge/keyBridgeText';
import { FREE_KEY, FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q_SAME = 'pitch.same-sound-different-names';
const Q27 = 'key.black-key-names';
const Q28 = 'key.whole-and-half-steps';
const Q29 = 'key.build-intervals';
const Q30 = 'key.accidentals-in-a-bar';
const Q31 = 'scale.chromatic';
const K1 = 'inst.key-marsh.key-bridge';
const K2 = 'inst.key-marsh.interval-rope';
const K3 = 'inst.key-marsh.natural-bridge';
const K4 = 'inst.key-marsh.chromatic-path';
const NAME_TAGS_KEY = `${Q_SAME}/name-tags`;
const INTERVAL_NAMES_KEY = `${Q_SAME}/interval-names`;
const BLACK_KEYS = `${Q27}/black-key-names`;
const WHOLE_HALF = `${Q28}/whole-and-half`;
const BUILD_BASIC = `${Q29}/basic`;
const BUILD_CHALLENGE = `${Q29}/challenge`;
const G_MAJOR = `${Q30}/g-major-f`;

class FakeFrames implements FrameScheduler {
  private next = 1;
  readonly pending = new Map<number, () => void>();
  request(fn: () => void): number {
    const handle = this.next++;
    this.pending.set(handle, fn);
    return handle;
  }
  cancel(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  tick(): void {
    const run = [...this.pending.values()];
    this.pending.clear();
    for (const fn of run) fn();
  }
}

function setup(opts: RigOptions = {}) {
  const r = rig({ definitions: [Q_SAME, Q27, Q28, Q29, Q30, Q31].map(quest), ...opts });
  const bridge = new WorldBridge({ x: 2300, y: 5000, facing: 'down' });
  const defs: Record<string, InstallationDef> = { [K1]: installation(K1), [K2]: installation(K2), [K3]: installation(K3), [K4]: installation(K4) };
  const frames = new FakeFrames();
  const plays: Array<{ midi: number; sec: number | undefined; velocity: number | undefined }> = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: (midi: number, sec?: number, velocity?: number) => void plays.push({ midi, sec, velocity }) },
    installations: Object.values(defs),
    panels: new Set(['panel.clef', 'panel.scale']),
    opened: { mark: (id: string) => void opened.push(id) },
    frames,
  });
  ic.setNavigator((hash) => void navigated.push(hash));
  const view = (id: string): InstallationView => bridge.installationViews.get().find((v) => v.installationId === id)!;
  const bridgeOf = (id: string) => view(id).bridge!;
  /** 널(자리 번호 1부터)을 눌렀다 */
  const press = (id: string, slot: number): void => bridge.events.send({ type: 'slot-pressed', installationId: id, slot });
  const stepOn = (id: string, slot: number, entered = false): void => bridge.events.send({ type: 'stepped', installationId: id, slot, ...(entered ? { entered: true as const } : {}) });
  return { ...r, bridge, defs, ic, frames, plays, opened, navigated, view, bridgeOf, press, stepOn };
}

type T = ReturnType<typeof setup>;

const STATION_OF: Record<string, string> = { [K1]: 'K1', [K2]: 'K2', [K3]: 'K3' };

/** 정거장에 들어가 과제 판본을 고른다(고르지 않으면 자유로 놀기). 작업대를 돌려준다 */
function enter(t: T, id: string, key?: string): KeyBridgeBench {
  expect(t.ic.enter(STATION_OF[id]!)).toBe(true);
  if (key) expect(t.ic.select(key)).toBe(true);
  return t.ic.keyBridge!;
}

const tags = (b: KeyBridgeBench): TagItem[] => b.items().filter((i): i is TagItem => i.kind === 'tag');
const questions = (b: KeyBridgeBench): QuestionItem[] => b.items().filter((i): i is QuestionItem => i.kind === 'question');
const flags = (b: KeyBridgeBench): FlagItem[] => b.items().filter((i): i is FlagItem => i.kind === 'flag');
const hung = (b: KeyBridgeBench): Array<string | null> => tags(b).map((i) => i.text);
const planked = (b: KeyBridgeBench): Array<number | null> => flags(b).map((i) => i.plank);
const draftOf = (t: T, questId: string, variantId: string): string => JSON.stringify(t.session.contentOf(questId, variantId));
const codesOf = (t: T): string[] => t.controller.feedback?.issues.map((i) => i.code) ?? [];

/** Q27의 열 개 이름표를 정답대로 건다: 자리 차례가 C♯ D♭ D♯ E♭ F♯ G♭ G♯ A♭ A♯ B♭이고 이름표 열 개도 같은 차례다 */
function hangAll(b: KeyBridgeBench): void {
  for (let i = 0; i < 10; i++) {
    b.selectItem(i);
    b.hangTag(NAME_TAGS[i]!);
  }
}

/** Q28의 정답: 단2도, 단2도, 장2도, 장2도 */
const WHOLE_HALF_ANSWERS: Array<[IntervalQuality, number]> = [
  ['minor', 2],
  ['minor', 2],
  ['major', 2],
  ['major', 2],
];
function answerWholeHalf(b: KeyBridgeBench, answers = WHOLE_HALF_ANSWERS): void {
  answers.forEach(([quality, number], i) => {
    b.selectItem(i);
    b.pickQuality(quality);
    b.pickNumber(number);
  });
}

describe('들어가기와 표지판(4.8)', () => {
  it('K1·K2·K3는 건반 다리다: 들어가면 자유로 놀기가 열리고 건반 다리 작업대가 생긴다(다른 작업대는 아니다). K4 반음 계단은 디딤돌 길이다', () => {
    const t = setup();
    for (const code of ['K1', 'K2', 'K3', 'K4']) expect(t.ic.has(code), code).toBe(true);
    for (const id of [K1, K2, K3]) {
      const def = t.defs[id]!;
      expect(t.ic.isKeyBridge(def), id).toBe(true);
      expect(t.ic.isTerrace(def), id).toBe(false);
      expect(t.ic.isBell(def), id).toBe(false);
      expect(t.ic.isTimeline(def), id).toBe(false);
      expect(t.ic.isStage(def), id).toBe(false);
    }
    expect(t.ic.isKeyBridge(t.defs[K4]!)).toBe(false);
    expect(t.ic.keyBridgeOf(t.defs[K4]!)).toBeNull();
    expect(t.ic.keyBridge).toBeNull(); // 들어가기 전에는 없다
    expect(t.ic.enter('K1')).toBe(true);
    expect(t.ic.state.get().mode).toEqual({ installationId: K1, stationId: 'K1' });
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.keyBridge).toBe(t.ic.keyBridgeOf(t.defs[K1]!));
    expect(t.ic.terrace).toBeNull();
    expect(t.ic.bell).toBeNull();
    expect(t.ic.timeline).toBeNull();
    expect(t.ic.stage).toBeNull();
    // 자유로 놀기는 과제가 아니다: '열어 봄'을 적지 않는다
    expect(t.opened).toEqual([]);
  });

  it('작업대는 설치물마다 하나이고, 다리마다 널의 수가 다르다(K1 25장, K2와 K3 13장)', () => {
    const t = setup();
    const benches = [K1, K2, K3].map((id) => t.ic.keyBridgeOf(t.defs[id]!)!);
    expect(new Set(benches).size).toBe(3);
    expect(t.ic.keyBridgeOf(t.defs[K1]!)).toBe(benches[0]); // 같은 설치물은 같은 작업대
    expect(benches.map((b) => b.planks.length)).toEqual([25, 13, 13]);
    expect(benches.map((b) => b.plank(1)!.name)).toEqual(['C4', 'C4', 'C4']);
    expect(benches.map((b) => b.plank(b.planks.length)!.name)).toEqual(['C6', 'C5', 'C5']);
    expect(benches[0]!.plank(0)).toBeUndefined();
    expect(benches[0]!.plank(26)).toBeUndefined();
  });

  it('들어왔을 때 알리는 말은 다리의 첫 과제에 맞는다: 이름표(K1), 밧줄(K2), 깃발(K3)', () => {
    const t = setup();
    t.ic.enter('K1');
    expect(t.controller.live).toBe(bridgeEntryText('건반 다리', 'names'));
    t.ic.exit();
    t.ic.enter('K2');
    expect(t.controller.live).toBe(bridgeEntryText('음정 밧줄', 'interval'));
    t.ic.exit();
    t.ic.enter('K3');
    expect(t.controller.live).toBe(bridgeEntryText('제자리표 다리', 'flags'));
    for (const word of ['제자리표 다리에 들어왔어요', '← →로 널을 옮기며', '↑ ↓로 깃발을 골라요', '도움은 H', '나가기는 Esc']) expect(t.controller.live, word).toContain(word);
  });

  it('표지판: 맨 위가 자유로 놀기이고 그 아래에 이 다리의 과제 판본이 설계서 순서대로 있다', () => {
    const t = setup();
    const keys = (id: string): string[] => {
      t.ic.enter(STATION_OF[id]!);
      const out = t.ic.signOf(t.defs[id]!).map((e) => e.key);
      t.ic.exit();
      return out;
    };
    expect(keys(K1)).toEqual([FREE_KEY, NAME_TAGS_KEY, BLACK_KEYS, WHOLE_HALF]);
    expect(keys(K2)).toEqual([FREE_KEY, INTERVAL_NAMES_KEY, BUILD_BASIC, BUILD_CHALLENGE]);
    expect(keys(K3)).toEqual([FREE_KEY, G_MAJOR]);
  });

  it('과제를 고르면 그 과제가 열리고 열어 봤다고 적는다. 판본마다 할 것의 수가 다르다', () => {
    const t = setup();
    const bench = enter(t, K1);
    expect(bench.free).toBe(true);
    expect(bench.task).toBe('names');
    expect(bench.items()).toHaveLength(10); // 자유로 놀기: 검은 널마다 자리 하나
    expect(t.ic.select(NAME_TAGS_KEY)).toBe(true);
    expect(t.opened).toEqual([Q_SAME]);
    expect(bench.free).toBe(false);
    expect(t.ic.state.get().targetKey).toBe(NAME_TAGS_KEY);
    expect(bench.items()).toHaveLength(2);
    t.ic.select(BLACK_KEYS);
    expect(bench.items()).toHaveLength(10);
    expect(t.opened).toEqual([Q_SAME, Q27]);
    t.ic.select(WHOLE_HALF);
    expect(bench.task).toBe('interval');
    expect(bench.items().map((i) => i.label)).toEqual(['E4에서 F4까지', 'B4에서 C5까지', 'C4에서 D4까지', 'F4에서 G4까지']);
    expect(t.opened).toEqual([Q_SAME, Q27, Q28]);
  });

  it('각 다리가 다루는 모든 판본은 그 다리에서 풀 수 있다: 할 것의 수와 이름', () => {
    const t = setup();
    const expected: Array<[string, string, string, number]> = [
      [K1, NAME_TAGS_KEY, 'names', 2],
      [K1, BLACK_KEYS, 'names', 10],
      [K1, WHOLE_HALF, 'interval', 4],
      [K2, INTERVAL_NAMES_KEY, 'interval', 3],
      [K2, BUILD_BASIC, 'interval', 2],
      [K2, BUILD_CHALLENGE, 'interval', 2],
      [K3, G_MAJOR, 'flags', 4],
    ];
    for (const [id, key, task, count] of expected) {
      const bench = enter(t, id, key);
      expect(bench.available, key).toBe(true);
      expect(bench.task, key).toBe(task);
      expect(bench.items(), key).toHaveLength(count);
      t.ic.exit();
    }
  });

  it('이 다리에서 풀 수 없는 판본은 작업대가 받지 않는다: 방향이 오름인 음 순서(반음계)는 다리의 일이 아니다', () => {
    const t = setup();
    const bench = t.ic.keyBridgeOf(t.defs[K1]!)!;
    const variantOf = (id: string, vid: string) => quest(id).variants[vid]!;
    expect(bench.fits(variantOf(Q27, 'black-key-names'))).toBe(true);
    expect(bench.fits(variantOf(Q28, 'whole-and-half'))).toBe(true);
    expect(bench.fits(variantOf(Q30, 'g-major-f'))).toBe(true);
    expect(bench.fits(variantOf(Q31, 'ascending'))).toBe(false);
    // 같은 판본은 한 번만 계산한다
    const v = variantOf(Q27, 'black-key-names');
    expect(bench.fits(v)).toBe(bench.fits(v));
  });

  it('나오면 모드가 풀리고 도전이 닫힌다. 걸어 둔 이름표는 보관되어 월드에 그대로 보이고, 다시 들어가면 이어서 건다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[0]!);
    expect(hung(bench).slice(0, 2)).toEqual(['C♯', null]);
    t.ic.exit();
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.controller.current).toBeNull();
    expect(t.bridgeOf(K1).tags.map((x) => x.text).slice(0, 2)).toEqual(['C♯', null]);
    expect(t.bridgeOf(K1).cursor).toBeNull(); // 열려 있지 않으면 널 위의 커서가 없다
    t.ic.enter('K1');
    expect(t.ic.select(BLACK_KEYS)).toBe(true);
    expect(hung(bench).slice(0, 2)).toEqual(['C♯', null]);
  });
});

describe('널 옮기기(← →)와 널의 소리', () => {
  it('← →로 널을 옮긴다: 아직 고르지 않았으면 가장 낮은 널부터, 끝에서는 멈추고 알린다. 문제를 푸는 중에는 검은 널을 이웃한 흰 널로만 말한다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    expect(bench.cursor).toBeNull();
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(1);
    expect(t.controller.live).toBe('C4 널.');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(2);
    expect(t.controller.live).toBe('C4와 D4 사이의 검은 널.');
    expect(t.controller.live).not.toMatch(/[♯♭]/);
    bench.perform('cursor-left');
    bench.perform('cursor-left');
    expect(bench.cursor).toBe(1);
    expect(t.controller.live).toContain('첫 널이에요. C4 널.');
    for (let i = 0; i < 30; i++) bench.perform('cursor-right');
    expect(bench.cursor).toBe(25);
    expect(t.controller.live).toBe('마지막 널이에요. C6 널.');
  });

  it('자유로 놀 때는 검은 널의 두 이름을 모두 말한다', () => {
    const t = setup();
    const bench = enter(t, K1);
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    expect(t.controller.live).toBe('검은 널 C♯4/D♭4.');
    expect(bench.speak(2)).toBe('검은 널 C♯4/D♭4');
    expect(bench.speak(1)).toBe('C4 널');
    expect(bench.speak(99)).toBe('');
  });

  it('널을 옮길 때마다 그 널의 소리가 울린다. 소리를 켜기 전에는 나지 않는다(W-11)', async () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('cursor-right');
    expect(t.engine.sinks.size).toBe(0);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('cursor-right');
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([61]);
    t.engine.sinks.get('task')!.requests.splice(0);
    bench.perform('cursor-right');
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([62]);
    t.engine.sinks.get('task')!.requests.splice(0);
    t.press(K1, 25);
    expect(bench.cursor).toBe(25);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([84]);
  });

  it('널을 눌러도 그 널로 커서가 옮겨 간다(눌러서 놓기). 이 다리에 없는 널과 다른 다리를 누른 것은 받지 않는다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    t.press(K2, 6);
    expect(bench.cursor).toBe(6);
    t.press(K2, 99);
    t.press(K2, 0);
    expect(bench.cursor).toBe(6);
    t.press(K1, 3); // 다른 다리를 눌렀다
    t.press('inst.nowhere', 3);
    expect(bench.cursor).toBe(6);
    expect(t.bridgeOf(K1).cursor).toBeNull();
  });

  it('고른 널이 월드에 올라간다: 다리의 모습과 널 하나하나의 요약(소리 높이는 늘 있고, 이름은 흰 널만)', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    expect(t.bridgeOf(K1)).toMatchObject({ task: 'names', cursor: 2, free: false });
    const slots = t.view(K1).slots;
    expect(slots).toHaveLength(25);
    expect(slots.map((s) => s.midi)).toEqual(Array.from({ length: 25 }, (_, i) => 60 + i));
    expect(slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([2]);
    // 문제를 푸는 중에는 검은 널의 이름을 알려 주지 않는다(이름 붙이는 일이 사라진다)
    expect(slots[0]!.name).toBe('C4');
    expect(slots[1]!.name).toBeNull();
    expect(slots[2]!.name).toBe('D4');
    expect(slots.filter((s) => s.name !== null)).toHaveLength(15);
    // 자유로 놀 때는 모든 널의 이름이 보인다(검은 널은 올림 이름)
    t.ic.select(FREE_KEY);
    expect(t.view(K1).slots.filter((s) => s.name !== null)).toHaveLength(25);
    expect(t.view(K1).slots[1]!.name).toBe('C♯4');
  });
});

describe('이름 과제(Q27): 이름표 걸기', () => {
  it('할 것은 이름표 자리 열 개다: 처음에는 비어 있고, 고르지 않았다. ↑ ↓로 첫 자리부터 한 칸씩 고르면 그 자리의 널로 커서가 간다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    expect(tags(bench).map((i) => [i.draft, i.plank, i.side, i.text, i.selected])).toEqual([
      [0, 2, 'raised', null, false],
      [1, 2, 'lowered', null, false],
      [2, 4, 'raised', null, false],
      [3, 4, 'lowered', null, false],
      [4, 7, 'raised', null, false],
      [5, 7, 'lowered', null, false],
      [6, 9, 'raised', null, false],
      [7, 9, 'lowered', null, false],
      [8, 11, 'raised', null, false],
      [9, 11, 'lowered', null, false],
    ]);
    expect(bench.filledCount()).toBe(0);
    expect(bench.selectedItem()).toBeNull();
    bench.perform('hand-down');
    expect(bench.selectedItem()).toMatchObject({ kind: 'tag', draft: 0, label: '첫째 검은 널의 올려 부른 이름표' });
    expect(bench.cursor).toBe(2);
    expect(t.controller.live).toBe('첫째 검은 널의 올려 부른 이름표: 비어 있어요.');
    bench.perform('hand-down');
    expect(bench.selectedItem()).toMatchObject({ draft: 1 });
    expect(bench.cursor).toBe(2);
    bench.perform('hand-down');
    expect(bench.cursor).toBe(4);
    bench.perform('hand-up');
    expect(bench.selectedItem()).toMatchObject({ draft: 1 });
  });

  it('첫 자리에서 위로, 마지막 자리에서 아래로 가면 멈추고 알린다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('hand-down');
    bench.perform('hand-up');
    expect(bench.selectedItem()).toMatchObject({ draft: 0 });
    expect(t.controller.live).toBe('첫 번째예요. 첫째 검은 널의 올려 부른 이름표: 비어 있어요.');
    for (let i = 0; i < 12; i++) bench.perform('hand-down');
    expect(bench.selectedItem()).toMatchObject({ draft: 9 });
    expect(t.controller.live).toBe('마지막 번째예요. 다섯째 검은 널의 내려 부른 이름표: 비어 있어요.');
  });

  it('이름표를 걸면 널의 소리 높이에 가장 가까운 음이 초안에 들어가고, 그 이름표의 소리가 울린다. 패널이 읽는 초안과 같다', async () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[0]!);
    expect(t.controller.live).toBe('첫째 검은 널의 올려 부른 이름표에 C♯ 이름표를 걸었어요.');
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([61]);
    expect(t.session.contentOf(Q27, 'black-key-names').slots.find((s) => s.slot === 0)?.writtenPitch).toEqual({ letter: 'C', accidental: 'sharp', octave: 4 });
    expect(hung(bench)[0]).toBe('C♯');
    expect(bench.filledCount()).toBe(1);
    expect(t.bridgeOf(K1).tags[0]).toMatchObject({ draft: 0, plank: 2, side: 'raised', text: 'C♯', selected: true, flagged: false });
    // 패널이 같은 초안을 고친다: 둘째 자리에 D♭
    t.controller.edit({ type: 'setSlot', slot: 1, writtenPitch: { letter: 'D', accidental: 'flat', octave: 4 } }, 'D♭4를 놓았어요.');
    expect(hung(bench).slice(0, 2)).toEqual(['C♯', 'D♭']);
  });

  it('같은 이름표를 다시 걸면 바뀌는 것 없이 알리기만 하고, 다른 이름표를 걸면 바꿔 건다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[0]!);
    const before = draftOf(t, Q27, 'black-key-names');
    bench.hangTag(NAME_TAGS[0]!);
    expect(t.controller.live).toBe('첫째 검은 널의 올려 부른 이름표: 이미 C♯ 이름표가 걸려 있어요.');
    expect(draftOf(t, Q27, 'black-key-names')).toBe(before);
    bench.hangTag(NAME_TAGS[1]!);
    expect(t.controller.live).toBe('첫째 검은 널의 올려 부른 이름표에 D♭ 이름표를 바꿔 걸었어요.');
    expect(hung(bench)[0]).toBe('D♭');
  });

  it('이름표 자리를 고르지 않고 걸려고 하면 먼저 자리를 고르라고 알린다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.hangTag(NAME_TAGS[0]!);
    expect(t.controller.live).toBe('먼저 이름표 자리를 골라 주세요.');
    expect(hung(bench).every((x) => x === null)).toBe(true);
  });

  it('Shift+↑ ↓: 걸린 이름표를 열 개 가운데서 한 칸씩 바꾼다. 비어 있으면 위로는 마지막, 아래로는 첫 이름표를 건다. 끝에서 이어진다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('accidental-down'); // 고른 것이 없다
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
    bench.selectItem(0);
    bench.perform('accidental-down');
    expect(hung(bench)[0]).toBe('C♯');
    bench.perform('accidental-down');
    expect(hung(bench)[0]).toBe('D♭');
    bench.perform('accidental-up');
    bench.perform('accidental-up');
    expect(hung(bench)[0]).toBe('B♭'); // 첫 이름표에서 위로 가면 마지막으로 이어진다
    bench.selectItem(1);
    bench.perform('accidental-up'); // 비어 있으면 마지막 이름표
    expect(hung(bench)[1]).toBe('B♭');
  });

  it('널을 누르면 그 널의 이름표 자리를 고른다: 같은 널에 자리가 둘이면(올려 부른 이름, 내려 부른 이름) 누를 때마다 번갈아 고르고 널의 소리를 들려 준다', async () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    t.press(K1, 4); // 둘째 검은 널(D♯4/E♭4)
    expect(bench.selectedItem()).toMatchObject({ draft: 2 });
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([63]);
    t.press(K1, 4);
    expect(bench.selectedItem()).toMatchObject({ draft: 3 });
    t.press(K1, 4);
    expect(bench.selectedItem()).toMatchObject({ draft: 2 });
    // 이름표 자리가 없는 널(흰 널)을 누르면 그 널로 커서만 옮기고 소리를 들려 준다
    t.press(K1, 3);
    expect(bench.cursor).toBe(3);
    expect(bench.selectedItem()).toMatchObject({ draft: 2 });
  });

  it('Enter: 커서가 선 널에 이름표 자리가 있으면 그 자리를 고르고, 없으면 이유를 알린다. 커서를 먼저 정하지 않았으면 널을 고르라고 알린다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('place');
    expect(t.controller.live).toBe(PICK_PLANK_FIRST);
    t.press(K1, 3); // 흰 널
    bench.perform('place');
    expect(t.controller.live).toBe('D4 널에는 이름표 자리가 없어요.');
    t.press(K1, 2); // 검은 널(눌러서 자리를 하나 골랐다)
    bench.selectItem(null);
    bench.perform('place');
    expect(bench.selectedItem()).toMatchObject({ draft: 0 });
  });

  it('Backspace: 걸린 이름표를 뗀다. 이미 비어 있으면 알리기만 한다. 실행 취소와 다시 실행이 이름표 걸기를 되돌린다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('remove');
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
    bench.selectItem(0);
    bench.perform('remove');
    expect(t.controller.live).toBe('첫째 검은 널의 올려 부른 이름표: 이미 비어 있어요.');
    bench.hangTag(NAME_TAGS[0]!);
    bench.perform('remove');
    expect(t.controller.live).toBe('첫째 검은 널의 올려 부른 이름표의 이름표를 뗐어요.');
    expect(hung(bench)[0]).toBeNull();
    bench.perform('undo');
    expect(hung(bench)[0]).toBe('C♯');
    bench.perform('undo');
    expect(hung(bench)[0]).toBeNull();
    bench.perform('redo');
    expect(hung(bench)[0]).toBe('C♯');
  });

  it('열 개를 모두 맞게 걸고 확인하면 통과한다(열어 봤다고 적는다). 완료 기준의 이름표: C♯ D♭ D♯ E♭ F♯ G♭ G♯ A♭ A♯ B♭', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    hangAll(bench);
    expect(hung(bench)).toEqual(['C♯', 'D♭', 'D♯', 'E♭', 'F♯', 'G♭', 'G♯', 'A♭', 'A♯', 'B♭']);
    expect(bench.filledCount()).toBe(10);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.opened).toEqual([Q27]);
  });

  it('올려 부른 자리에 같은 소리의 내려 부른 이름을 걸면 "소리 높이는 같지만 이름이 달라요"로 틀리고 그 자리에 표식이 선다. 고치면 판정이 지워져 표식도 사라진다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    hangAll(bench);
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[1]!); // 올려 부른 자리에 D♭
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(codesOf(t)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(t.controller.feedback?.messages[0]).toContain('소리 높이는 같지만 이름이 달라요');
    expect(tags(bench).filter((i) => i.flagged).map((i) => i.draft)).toEqual([0]);
    expect(t.bridgeOf(K1).tags.filter((x) => x.flagged).map((x) => x.draft)).toEqual([0]);
    expect(t.view(K1).slots.filter((s) => s.flagged).map((s) => s.slot)).toEqual([2]); // 검은 널 C♯4/D♭4
    bench.hangTag(NAME_TAGS[0]!);
    expect(t.controller.feedback).toBeNull();
    expect(tags(bench).every((i) => !i.flagged)).toBe(true);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('걸지 않은 자리는 빠졌다고 알리고 그 자리에 표식이 선다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(codesOf(t)).toEqual(Array.from({ length: 10 }, () => 'MISSING_PLACEMENT'));
    expect(tags(bench).every((i) => i.flagged)).toBe(true);
  });

  it('P: 걸린 이름표가 없으면 이유를 알리고, 있으면 자리 차례대로 이름표의 음을 들려 준다. 듣는 동안 울리는 널이 월드에 playing으로 올라간다', async () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBe(NO_TAG_NOTICE);
    bench.selectItem(2);
    bench.hangTag(NAME_TAGS[2]!); // D♯
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[0]!); // C♯
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    const quarterSec = 60 / t.controller.tempo().effective;
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    expect(t.bridgeOf(K1).playing).toEqual([2]);
    expect(t.view(K1).slots.filter((s) => s.playing).map((s) => s.slot)).toEqual([2]);
    t.run(3 * quarterSec - 0.2); // 이름표 하나는 2분음표(4분음표 둘)라서, 4분음표 셋이 지난 곳은 둘째 이름표다
    t.frames.tick();
    expect(t.bridgeOf(K1).playing).toEqual([4]);
    t.run(2 * quarterSec);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([61, 63]);
    expect(BRIDGE_NOTE_TICKS).toBe(960); // 깃발과 음정 밧줄의 한 음은 4분음표다
    bench.perform('stop');
    t.frames.tick();
    expect(t.controller.playing).toBeNull();
    expect(t.bridgeOf(K1).playing).toEqual([]);
  });

  it('T: 목표 음을 자리 차례대로 들려 준다. 놓은 이름표와 상관없이 같다', async () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-target');
    expect(t.controller.playing).toBe('target');
    t.run(10);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([61, 61, 63, 63, 66, 66, 68, 68, 70, 70]);
  });
});

describe('음정 과제(Q28): 이름 묻기', () => {
  it('할 것은 질문 네 개다. 밧줄은 두 널 사이의 도수와 반음 수를 보여 준다: E4에서 F4까지는 2도, 반음 1개', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    expect(questions(bench).map((q) => [q.qid, q.startPlank, q.endPlank, q.rope, q.qkind])).toEqual([
      ['h1', 5, 6, '2도 · 반음 1개', 'identify'],
      ['h2', 12, 13, '2도 · 반음 1개', 'identify'],
      ['h3', 1, 3, '2도 · 반음 2개', 'identify'],
      ['h4', 6, 8, '2도 · 반음 2개', 'identify'],
    ]);
    expect(t.bridgeOf(K1).ropes.map((r) => [r.qid, r.from, r.to, r.text])).toEqual([
      ['h1', 5, 6, '2도 · 반음 1개'],
      ['h2', 12, 13, '2도 · 반음 1개'],
      ['h3', 1, 3, '2도 · 반음 2개'],
      ['h4', 6, 8, '2도 · 반음 2개'],
    ]);
  });

  it('↑ ↓로 질문을 고르면 시작 말뚝의 널로 커서가 가고 질문을 말해 준다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    bench.perform('hand-down');
    expect(bench.selectedItem()).toMatchObject({ kind: 'question', qid: 'h1' });
    expect(bench.cursor).toBe(5);
    expect(t.controller.live).toBe('E4에서 F4까지: 밧줄은 2도 · 반음 1개. 답이 아직 없어요.');
    bench.perform('hand-down');
    expect(bench.cursor).toBe(12);
  });

  it('성질과 도수를 모두 골라야 답이 담긴다: 하나만 골랐으면 초안은 그대로이고 나머지를 고르라고 알린다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    bench.selectItem(0);
    const before = draftOf(t, Q28, 'whole-and-half');
    bench.pickQuality('minor');
    expect(t.controller.live).toBe('단음정을 골랐어요. 이제 도수를 골라 주세요.');
    expect(draftOf(t, Q28, 'whole-and-half')).toBe(before);
    expect(questions(bench)[0]!.pick).toEqual({ quality: 'minor', number: null });
    expect(questions(bench)[0]!.parts[0]!.value).toBeNull();
    bench.pickNumber(2);
    expect(t.controller.live).toBe('E4에서 F4까지: 단2도로 골랐어요.');
    expect(questions(bench)[0]!.parts[0]!.value).toBe('단2도');
    expect(t.session.contentOf(Q28, 'whole-and-half').slots.find((s) => s.slot === 0)?.choice).toBe('minor:2');
    expect(bench.filledCount()).toBe(1);
  });

  it('도수를 먼저 골라도 된다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    bench.selectItem(2);
    bench.pickNumber(2);
    expect(t.controller.live).toBe('2도를 골랐어요. 이제 성질을 골라 주세요.');
    bench.pickQuality('major');
    expect(questions(bench)[2]!.parts[0]!.value).toBe('장2도');
  });

  it('고른 질문이 없거나 이름 묻기가 아니면 성질과 도수를 받지 않는다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    bench.pickQuality('major');
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
    const k2 = enter(t, K2, BUILD_BASIC);
    k2.selectItem(0);
    k2.pickQuality('major'); // 음 쌓기는 성질을 고르지 않는다
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
  });

  it('질문 네 개에 정답(단2도, 단2도, 장2도, 장2도)을 고르고 확인하면 통과한다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    answerWholeHalf(bench);
    expect(questions(bench).map((q) => q.parts[0]!.value)).toEqual(['단2도', '단2도', '장2도', '장2도']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.opened).toEqual([Q28]);
  });

  it('반음(E4→F4)을 온음이라고 답하면 WRONG_INTERVAL로 틀리고 그 밧줄에 표식이 선다. 고치면 사라진다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    answerWholeHalf(bench, [['major', 2], ...WHOLE_HALF_ANSWERS.slice(1)]);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(codesOf(t)).toEqual(['WRONG_INTERVAL']);
    expect(questions(bench).filter((q) => q.flagged).map((q) => q.qid)).toEqual(['h1']);
    expect(t.bridgeOf(K1).ropes.filter((r) => r.flagged).map((r) => r.qid)).toEqual(['h1']);
    bench.selectItem(0);
    bench.pickQuality('minor');
    expect(t.controller.feedback).toBeNull();
    expect(questions(bench).every((q) => !q.flagged)).toBe(true);
  });

  it('질문의 시작 말뚝이나 끝 말뚝이 선 널을 누르면 그 질문을 고른다(손가락만으로도). 같은 널에 질문이 여럿이면 번갈아 고른다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    t.press(K1, 6); // h1의 끝 말뚝 널(F4)이자 h4의 시작 말뚝 널
    expect(bench.selectedItem()).toMatchObject({ qid: 'h1' });
    t.press(K1, 6);
    expect(bench.selectedItem()).toMatchObject({ qid: 'h4' });
    t.press(K1, 6);
    expect(bench.selectedItem()).toMatchObject({ qid: 'h1' });
    t.press(K1, 13); // h2의 끝 말뚝 널
    expect(bench.selectedItem()).toMatchObject({ qid: 'h2' });
    t.press(K1, 2); // 질문이 없는 널: 커서만 옮긴다
    expect(bench.cursor).toBe(2);
    expect(bench.selectedItem()).toMatchObject({ qid: 'h2' });
  });

  it('Backspace: 고른 질문의 답을 비운다. 중간 단계(성질만 고른 상태)도 비운다. 이미 비어 있으면 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    bench.selectItem(0);
    bench.perform('remove');
    expect(t.controller.live).toBe('E4에서 F4까지: 이미 비어 있어요.');
    bench.pickQuality('minor');
    bench.perform('remove');
    expect(questions(bench)[0]!.pick).toEqual({ quality: null, number: null });
    bench.pickQuality('minor');
    bench.pickNumber(2);
    bench.perform('remove');
    expect(t.controller.live).toBe('E4에서 F4까지: 답을 비웠어요.');
    expect(questions(bench)[0]!.parts[0]!.value).toBeNull();
  });

  it('P: 고른 질문의 두 음을 차례로 들려 준다. 고른 질문이 없으면 알린다', async () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    await t.controller.enableSound();
    bench.perform('hear-mine');
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
    expect(t.controller.playing).toBeNull();
    bench.selectItem(2); // C4에서 D4까지
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    t.run(3);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([60, 62]);
  });

  it('Enter: 널에 꽂을 것이 없는 질문(이름 묻기)에서는 고른 질문의 두 음을 들려 준다. 질문을 고르지 않았으면 커서가 선 널의 소리만 들려 준다', async () => {
    const t = setup();
    const bench = enter(t, K1, WHOLE_HALF);
    await t.controller.enableSound();
    t.press(K1, 4); // 질문이 없는 널
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('place');
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([63]);
    bench.selectItem(3); // F4에서 G4까지
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('place');
    t.run(3);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([65, 67]);
  });
});

describe('음정 과제(Q29): 음 쌓기(끝 말뚝과 밧줄)', () => {
  it('시작 말뚝만 널에 박혀 있다: 끝 말뚝이 없으면 밧줄 글도 없다(기본 D4 위 장3도, E4 위 완전5도)', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    expect(questions(bench).map((q) => [q.qid, q.label, q.startPlank, q.endPlank, q.qkind])).toEqual([
      ['b1', 'D4 위 장3도', 3, null, 'build'],
      ['b2', 'E4 위 완전5도', 5, null, 'build'],
    ]);
    expect(t.bridgeOf(K2).ropes.map((r) => [r.qid, r.from, r.to, r.text])).toEqual([
      ['b1', 3, null, null],
      ['b2', 5, null, null],
    ]);
  });

  it('끝 말뚝을 널에 꽂으면 그 소리가 울리고 밧줄이 도수와 반음 수를 보여 준다. 처음 쓰는 이름은 흰 널은 자기 이름, 검은 널은 올림 이름이다', async () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    await t.controller.enableSound();
    bench.selectItem(0); // D4 위 장3도
    expect(bench.cursor).toBe(3);
    t.engine.sinks.get('task')?.requests.splice(0);
    t.press(K2, 7); // F♯4 널
    expect(t.controller.live).toBe('끝 말뚝을 F4와 G4 사이의 검은 널에 꽂았어요. 이름을 골라 주세요.');
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([66]);
    expect(t.session.contentOf(Q29, 'basic').slots.find((s) => s.slot === 0)?.writtenPitch).toEqual({ letter: 'F', accidental: 'sharp', octave: 4 });
    expect(questions(bench)[0]).toMatchObject({ endPlank: 7, rope: '3도 · 반음 4개' });
    expect(questions(bench)[0]!.parts[0]!.value).toBe('F♯4');
    expect(t.bridgeOf(K2).ropes[0]).toMatchObject({ qid: 'b1', from: 3, to: 7, text: '3도 · 반음 4개' });
    // 같은 널에 다시 꽂으면 바뀌는 것 없이 알리기만 한다
    const before = draftOf(t, Q29, 'basic');
    t.press(K2, 7);
    expect(t.controller.live).toBe('끝 말뚝은 이미 F4와 G4 사이의 검은 널에 있어요.');
    expect(draftOf(t, Q29, 'basic')).toBe(before);
  });

  it('두 질문의 정답(D4 위 장3도 = F♯4, E4 위 완전5도 = B4)을 꽂고 확인하면 통과한다. 질문을 고르는 것은 ↑ ↓다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    bench.perform('hand-down'); // b1
    t.press(K2, 7);
    bench.perform('hand-down'); // b2
    expect(bench.selectedItem()).toMatchObject({ qid: 'b2' });
    t.press(K2, 12); // B4
    expect(questions(bench).map((q) => q.endPlank)).toEqual([7, 12]);
    expect(questions(bench).map((q) => q.rope)).toEqual(['3도 · 반음 4개', '5도 · 반음 7개']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.opened).toEqual([Q29]);
  });

  it('도수가 틀린 널(장3도 자리에 F4)에 꽂으면 WRONG_PITCH로 틀리고 그 밧줄에 표식이 선다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    bench.selectItem(0);
    t.press(K2, 6); // F4
    bench.selectItem(1);
    t.press(K2, 12);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(codesOf(t)).toEqual(['WRONG_PITCH']);
    expect(questions(bench).filter((q) => q.flagged).map((q) => q.qid)).toEqual(['b1']);
    expect(t.bridgeOf(K2).ropes.filter((r) => r.flagged).map((r) => r.qid)).toEqual(['b1']);
  });

  it('높은 도전(F4 위 완전4도 = B♭4): 같은 소리의 올림 이름(A♯4)으로 꽂으면 이름이 달라 틀리고, 이름을 B♭4로 바꾸면 밧줄이 4도로 바뀌고 통과한다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_CHALLENGE);
    bench.selectItem(0);
    t.press(K2, 11); // A♯4/B♭4 널: 처음에는 올림 이름
    expect(questions(bench)[0]).toMatchObject({ endPlank: 11, rope: '3도 · 반음 5개' });
    expect(questions(bench)[0]!.parts[0]!.value).toBe('A♯4');
    bench.selectItem(1);
    t.press(K2, 9); // G♯4: E4 위 장3도
    bench.perform('check');
    expect(codesOf(t)).toEqual(['WRONG_SPELLING_SAME_PITCH']);
    expect(questions(bench).filter((q) => q.flagged).map((q) => q.qid)).toEqual(['b1']);
    bench.selectItem(0);
    bench.pickName({ letter: 'B', accidental: 'flat', octave: 4 });
    expect(t.controller.live).toBe('끝 말뚝의 이름을 B♭4로 골랐어요.');
    expect(questions(bench)[0]).toMatchObject({ endPlank: 11, rope: '4도 · 반음 5개' });
    expect(t.controller.feedback).toBeNull();
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('Shift+↑ ↓: 끝 말뚝이 선 널을 가리키는 이름들을 한 칸씩 바꾼다(A♯4 ↔ B♭4). 말뚝이 없으면 먼저 꽂으라고 알린다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_CHALLENGE);
    bench.selectItem(0);
    bench.perform('accidental-down');
    expect(t.controller.live).toBe(PICK_STAKE_FIRST);
    t.press(K2, 11);
    bench.perform('accidental-down');
    expect(questions(bench)[0]!.parts[0]!.value).toBe('B♭4');
    bench.perform('accidental-down');
    expect(questions(bench)[0]!.parts[0]!.value).toBe('A♯4');
    bench.perform('accidental-up');
    expect(questions(bench)[0]!.parts[0]!.value).toBe('B♭4');
  });

  it('말뚝이 선 널과 소리가 다른 이름은 받지 않는다. 고른 질문이 음 쌓기가 아니거나 말뚝이 없어도 받지 않는다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_CHALLENGE);
    bench.pickName({ letter: 'B', accidental: 'flat', octave: 4 });
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
    bench.selectItem(0);
    bench.pickName({ letter: 'B', accidental: 'flat', octave: 4 });
    expect(t.controller.live).toBe(PICK_STAKE_FIRST);
    t.press(K2, 11);
    const before = draftOf(t, Q29, 'challenge');
    bench.pickName({ letter: 'C', accidental: null, octave: 5 });
    expect(t.controller.live).toBe('말뚝이 선 널과 소리가 다른 이름이에요.');
    expect(draftOf(t, Q29, 'challenge')).toBe(before);
  });

  it('P: 끝 말뚝이 없으면 알리고, 있으면 시작음과 끝 말뚝의 음을 차례로 들려 준다. Backspace는 끝 말뚝을 뺀다', async () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    await t.controller.enableSound();
    bench.selectItem(0);
    bench.perform('hear-mine');
    expect(t.controller.notice).toBe(NO_STAKE_NOTICE);
    expect(t.controller.playing).toBeNull();
    t.press(K2, 7);
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-mine');
    t.run(3);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([62, 66]);
    bench.perform('stop');
    bench.perform('remove');
    expect(questions(bench)[0]!.endPlank).toBeNull();
    expect(t.bridgeOf(K2).ropes[0]).toMatchObject({ to: null, text: null });
  });

  it('Enter: 커서가 선 널에 끝 말뚝을 꽂는다. 커서를 먼저 정하지 않았으면 알린다', () => {
    const t = setup();
    const bench = enter(t, K2, BUILD_BASIC);
    bench.perform('hand-down'); // b1: 커서가 시작 말뚝의 널(3번)로 간다
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    bench.perform('cursor-right'); // 7번
    expect(bench.cursor).toBe(7);
    bench.perform('place');
    expect(questions(bench)[0]!.endPlank).toBe(7);
  });
});

describe('같은 소리 다른 이름(K2): 비교와 이름 묻기', () => {
  it('질문 셋: 비교(소리와 표기, 칸 둘), C4에서 D♯4까지, C4에서 E♭4까지. 비교는 같은 널(C♯4/D♭4)에 선다', () => {
    const t = setup();
    const bench = enter(t, K2, INTERVAL_NAMES_KEY);
    expect(questions(bench).map((q) => [q.qid, q.qkind, q.parts.length, q.startPlank, q.endPlank])).toEqual([
      ['c1', 'compare', 2, 2, 2],
      ['i1', 'identify', 1, 1, 4],
      ['i2', 'identify', 1, 1, 4],
    ]);
    expect(questions(bench)[0]!.parts.map((p) => p.label)).toEqual(['소리', '표기']);
    expect(questions(bench).map((q) => q.rope)).toEqual(['2도 · 반음 0개', '2도 · 반음 3개', '3도 · 반음 3개']);
  });

  it('정답(소리는 같고 표기는 다르다, 증2도, 단3도)을 고르고 확인하면 통과한다. 소리가 같다고만 답하면 아직 채우지 않은 것이다', () => {
    const t = setup();
    const bench = enter(t, K2, INTERVAL_NAMES_KEY);
    bench.selectItem(questions(bench)[0]!.parts[0]!.draft);
    bench.pickSame(0, true);
    expect(questions(bench)[0]!.parts.map((p) => p.value)).toEqual(['같아요', null]);
    expect(bench.filledCount()).toBe(0);
    bench.pickSame(1, false);
    expect(questions(bench)[0]!.parts.map((p) => p.value)).toEqual(['같아요', '달라요']);
    expect(bench.filledCount()).toBe(1);
    bench.selectItem(questions(bench)[1]!.parts[0]!.draft);
    bench.pickQuality('augmented');
    bench.pickNumber(2);
    bench.selectItem(questions(bench)[2]!.parts[0]!.draft);
    bench.pickQuality('minor');
    bench.pickNumber(3);
    expect(bench.filledCount()).toBe(3);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('표기도 같다고 답하면 틀린다. 비교가 아닌 질문에서 같은가 다른가는 받지 않는다', () => {
    const t = setup();
    const bench = enter(t, K2, INTERVAL_NAMES_KEY);
    bench.selectItem(questions(bench)[1]!.parts[0]!.draft);
    bench.pickSame(0, true);
    expect(t.controller.live).toBe(PICK_ITEM_FIRST);
    bench.selectItem(questions(bench)[0]!.parts[0]!.draft);
    bench.pickSame(0, true);
    bench.pickSame(1, true);
    expect(questions(bench)[0]!.parts.map((p) => p.value)).toEqual(['같아요', '같아요']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(questions(bench).filter((q) => q.flagged).map((q) => q.qid)).toContain('c1');
  });
});

describe('임시표 과제(Q30): 순서 깃발', () => {
  it('할 것은 깃발 네 개다: 처음에는 꽂지 않았고 월드의 표지판에 악보가 오른다(조표 ♯ 하나, 두 마디)', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    expect(flags(bench).map((f) => [f.draft, f.order, f.plank, f.label])).toEqual([
      [1, 1, null, '1번 깃발'],
      [2, 2, null, '2번 깃발'],
      [3, 3, null, '3번 깃발'],
      [4, 4, null, '4번 깃발'],
    ]);
    const view = t.bridgeOf(K3);
    expect(view.task).toBe('flags');
    expect(view.sign).toMatchObject({ keySignature: 1 });
    expect(view.sign!.bars).toHaveLength(2);
    expect(view.flags.map((f) => [f.order, f.plank])).toEqual([[1, null], [2, null], [3, null], [4, null]]);
  });

  it('널을 차례로 누르기만 해도 1번부터 순서대로 꽂힌다: 꽂고 나면 다음 빈 깃발이 골라진다. 완료 기준: 깃발의 소리가 66, 65, 65, 66이다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    t.press(K3, 7); // F♯4
    expect(planked(bench)).toEqual([7, null, null, null]);
    expect(bench.selectedItem()).toMatchObject({ kind: 'flag', order: 2 });
    t.press(K3, 6); // F4
    expect(planked(bench)).toEqual([7, 6, null, null]);
    expect(bench.selectedItem()).toMatchObject({ order: 3 });
    t.press(K3, 6);
    t.press(K3, 7);
    expect(planked(bench)).toEqual([7, 6, 6, 7]);
    // 빈 깃발이 더 없으면 방금 꽂은 깃발이 골라진 채로 남는다
    expect(bench.selectedItem()).toMatchObject({ order: 4 });
    expect(t.session.contentOf(Q30, 'g-major-f').slots.map((s) => s.midi)).toEqual([66, 65, 65, 66]);
    expect(t.session.contentOf(Q30, 'g-major-f').slots.every((s) => s.writtenPitch === null)).toBe(true); // 깃발은 이름이 아니라 소리 높이만 갖는다
    expect(t.bridgeOf(K3).flags.map((f) => f.plank)).toEqual([7, 6, 6, 7]);
    expect(bench.filledCount()).toBe(4);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.opened).toEqual([Q30]);
  });

  it('이미 꽂은 깃발을 고르고 다른 널을 누르면 옮겨 꽂는다. 옮긴 뒤에도 그 깃발이 골라져 있어 다시 옮길 수 있다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    t.press(K3, 7);
    t.press(K3, 6);
    bench.selectItem(1); // 1번 깃발
    t.press(K3, 8); // G4로 옮긴다
    expect(planked(bench)).toEqual([8, 6, null, null]);
    expect(t.controller.live).toBe('1번 깃발을 G4 널에 옮겨 꽂았어요.');
    expect(bench.selectedItem()).toMatchObject({ order: 1 });
    t.press(K3, 9);
    expect(planked(bench)).toEqual([9, 6, null, null]);
    expect(bench.selectedItem()).toMatchObject({ order: 1 });
  });

  it('깃발을 꽂을 때마다 그 널의 소리가 울린다. 같은 널에 다시 꽂으면 바뀌는 것 없이 알리기만 한다', async () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    t.press(K3, 7);
    expect(t.controller.live).toBe('1번 깃발을 F4와 G4 사이의 검은 널에 꽂았어요. 다음은 2번 깃발이에요.');
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([66]);
    bench.selectItem(1);
    const before = draftOf(t, Q30, 'g-major-f');
    t.press(K3, 7);
    expect(t.controller.live).toBe('1번 깃발은 이미 F4와 G4 사이의 검은 널에 있어요.');
    expect(draftOf(t, Q30, 'g-major-f')).toBe(before);
  });

  it('꽂을 때 골라진 다음 깃발을 안내에 덧붙인다(낭독기로 듣는 사람도 알도록). 마지막 빈 깃발과 옮겨 꽂기에는 덧붙이지 않고, 순서 없이 꽂으면 뒤에서 앞으로 이어진다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    t.press(K3, 6);
    expect(t.controller.live).toBe('1번 깃발을 F4 널에 꽂았어요. 다음은 2번 깃발이에요.');
    t.press(K3, 7);
    t.press(K3, 7);
    expect(t.controller.live).toBe('3번 깃발을 F4와 G4 사이의 검은 널에 꽂았어요. 다음은 4번 깃발이에요.');
    t.press(K3, 6);
    expect(t.controller.live).toBe('4번 깃발을 F4 널에 꽂았어요.'); // 빈 깃발이 더 없다
    expect(bench.selectedItem()).toMatchObject({ order: 4 });
    t.press(K3, 7); // 4번 깃발을 옮겨 꽂는다
    expect(t.controller.live).toBe('4번 깃발을 F4와 G4 사이의 검은 널에 옮겨 꽂았어요.');
    // 순서 없이: 3번을 비우고 2번을 비운 뒤 3번부터 꽂으면 4번이 이미 꽂혀 있어 1번으로 돌아가지 않고 비어 있는 2번으로 이어진다
    bench.selectItem(3);
    bench.perform('remove');
    bench.selectItem(2);
    bench.perform('remove');
    bench.selectItem(3);
    t.press(K3, 6);
    expect(t.controller.live).toBe('3번 깃발을 F4 널에 꽂았어요. 다음은 2번 깃발이에요.');
    expect(bench.selectedItem()).toMatchObject({ order: 2 });
  });

  it('↑ ↓로 깃발을 고르고 Enter로 커서가 선 널에 꽂는다. Backspace는 고른 깃발을 뺀다. 실행 취소가 되돌린다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    bench.perform('hand-down');
    expect(bench.selectedItem()).toMatchObject({ order: 1 });
    expect(t.controller.live).toBe('1번 깃발: 아직 꽂지 않았어요.');
    for (let i = 0; i < 7; i++) bench.perform('cursor-right');
    expect(bench.cursor).toBe(7);
    bench.perform('place');
    expect(planked(bench)).toEqual([7, null, null, null]);
    bench.selectItem(1);
    bench.perform('remove');
    expect(t.controller.live).toBe('1번 깃발을 뺐어요.');
    expect(planked(bench)).toEqual([null, null, null, null]);
    bench.perform('remove');
    expect(t.controller.live).toBe('1번 깃발은 아직 꽂지 않았어요.');
    bench.perform('undo');
    expect(planked(bench)).toEqual([7, null, null, null]);
  });

  it('조표를 따르지 않고 모든 깃발을 제자리 F(65)에 꽂으면 PITCH_MISMATCH로 틀리고 틀린 깃발(1번, 4번)에 표식이 선다. 맞게 옮기면 사라진다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    for (let i = 0; i < 4; i++) t.press(K3, 6);
    expect(planked(bench)).toEqual([6, 6, 6, 6]);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(codesOf(t)).toEqual(['PITCH_MISMATCH', 'PITCH_MISMATCH']);
    expect(flags(bench).filter((f) => f.flagged).map((f) => f.order)).toEqual([1, 4]);
    expect(t.bridgeOf(K3).flags.filter((f) => f.flagged).map((f) => f.order)).toEqual([1, 4]);
    expect(t.view(K3).slots.filter((s) => s.flagged).map((s) => s.slot)).toEqual([6]);
    bench.selectItem(1);
    t.press(K3, 7);
    expect(t.controller.feedback).toBeNull();
    expect(flags(bench).every((f) => !f.flagged)).toBe(true);
  });

  it('꽂지 않은 깃발은 빠졌다고 알리고 그 깃발에 표식이 선다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    t.press(K3, 7);
    t.press(K3, 6);
    t.press(K3, 6);
    bench.perform('check');
    expect(codesOf(t)).toEqual(['MISSING_PLACEMENT']);
    expect(flags(bench).filter((f) => f.flagged).map((f) => f.order)).toEqual([4]);
  });

  it('P: 꽂은 깃발이 없으면 이유를 알리고, 있으면 깃발 순서대로 꽂은 널의 소리를 들려 준다. 듣는 동안 울리는 널이 월드에 올라간다', async () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    bench.perform('hear-mine');
    expect(t.controller.notice).toBe(NO_FLAG_NOTICE);
    t.press(K3, 7);
    t.press(K3, 6);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    const quarterSec = 60 / t.controller.tempo().effective;
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    expect(t.bridgeOf(K3).playing).toEqual([7]);
    t.run(1.5 * quarterSec - 0.2); // 깃발 하나는 4분음표: 4분음표 하나 반이 지난 곳은 둘째 깃발이다
    t.frames.tick();
    expect(t.bridgeOf(K3).playing).toEqual([6]);
    t.run(2 * quarterSec);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([66, 65]);
  });

  it('T: 목표를 깃발 순서대로 들려 준다(66, 65, 65, 66). 목표가 어느 널인지는 말해 주지 않고 소리만 들려 준다', async () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-target');
    expect(t.controller.playing).toBe('target');
    t.run(5 * (60 / t.controller.tempo().effective));
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([66, 65, 65, 66]);
    // 정답을 글로 알려 주지 않는다(들려 주기만 한다): 알림에 널의 이름이나 소리 높이가 없다
    expect(t.controller.live).not.toMatch(/널|F♯|F♮|F4|65|66/);
    expect(t.controller.notice).toBeNull();
  });

  it('깃발 과제에서는 이름 고르기와 이름 바꾸기가 없다: Shift+↑ ↓는 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    bench.selectItem(1);
    bench.perform('accidental-down');
    expect(t.controller.live).toBe('이 할 것에는 바꿀 이름이 없어요.');
    expect(planked(bench)).toEqual([null, null, null, null]);
  });
});

describe('자유로 놀기: 목표와 판정이 없다', () => {
  it('K1: 검은 널마다 이름표 자리 하나, 열 개다. 아무 이름표나 걸 수 있고 올려 부른 이름도 내려 부른 이름도 걸린다', () => {
    const t = setup();
    const bench = enter(t, K1);
    expect(tags(bench).map((i) => i.plank)).toEqual([2, 4, 7, 9, 11, 14, 16, 19, 21, 23]);
    expect(tags(bench)[0]!.label).toBe('첫째 검은 널의 이름표');
    bench.selectItem(0);
    bench.hangTag(NAME_TAGS[1]!); // D♭
    expect(hung(bench)[0]).toBe('D♭');
    bench.selectItem(9);
    bench.hangTag(NAME_TAGS[8]!); // A♯: 열째 검은 널(A♯5)
    expect(t.session.contentOf(Q27, 'black-key-names')).toBeTruthy();
    expect(bench.filledCount()).toBe(2);
    expect(t.bridgeOf(K1)).toMatchObject({ free: true, sign: null });
  });

  it('K2: 가장 높은 흰 널을 뺀 흰 널마다 밧줄 하나, 일곱 개다. 끝 말뚝은 아무 널에나 꽂는다', () => {
    const t = setup();
    const bench = enter(t, K2);
    expect(questions(bench).map((q) => [q.qid, q.startPlank])).toEqual([
      ['rope-1', 1],
      ['rope-2', 3],
      ['rope-3', 5],
      ['rope-4', 6],
      ['rope-5', 8],
      ['rope-6', 10],
      ['rope-7', 12],
    ]);
    bench.selectItem(0);
    t.press(K2, 13); // C5
    expect(questions(bench)[0]).toMatchObject({ endPlank: 13, rope: '8도 · 반음 12개' });
    expect(t.controller.live).toBe('끝 말뚝을 C5 널에 꽂았어요. 이름을 골라 주세요.');
  });

  it('K3: 순서 깃발 여덟 개다. 표지판 악보는 없다', () => {
    const t = setup();
    const bench = enter(t, K3);
    expect(flags(bench)).toHaveLength(8);
    t.press(K3, 1);
    t.press(K3, 3);
    expect(planked(bench).slice(0, 3)).toEqual([1, 3, null]);
    expect(t.bridgeOf(K3).sign).toBeNull();
  });

  it('T와 C는 안내만 하고 판정하지 않는다. P는 놓은 것을 들려 준다', () => {
    const t = setup();
    const bench = enter(t, K3);
    bench.perform('hear-target');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_TARGET);
    bench.perform('check');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_CHECK);
    expect(t.controller.feedback).toBeNull();
    bench.perform('hear-mine');
    expect(t.controller.notice).toBe(NO_FLAG_NOTICE);
    t.press(K3, 5);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
  });

  it('자유로 놀기에는 패널이 없다. 과제를 고르면 패널로 보기가 그 판본의 주소를 알려 준다. 도움과 나가기는 컨트롤러가 이어 준다', () => {
    const t = setup();
    enter(t, K1);
    expect(t.ic.performKeyBridge('view-panel')).toBeNull();
    expect(t.controller.live).toBe(FREE_PLAY_NO_PANEL);
    expect(t.ic.performKeyBridge('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(true);
    expect(t.ic.performKeyBridge('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.select(BLACK_KEYS);
    expect(t.ic.performKeyBridge('view-panel')).toEqual({ navigate: ContentCatalog.hashFor(Q27, 'black-key-names') });
    expect(t.ic.performKeyBridge('exit')).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.ic.performKeyBridge('help')).toBeNull(); // 들어가 있지 않으면 아무것도 하지 않는다
    expect(t.ic.state.get().helpOpen).toBe(false);
  });
});

describe('월드의 사건과 월드로 올라가는 모습', () => {
  it('걸어 보기 전에도(들어간 적 없어도) 자유로 놀기 틀의 다리 모습이 월드에 보인다: 널 수만큼 자리가 있고 이름표·깃발은 비어 있다', () => {
    const t = setup();
    expect(t.view(K1).slots).toHaveLength(25);
    expect(t.view(K2).slots).toHaveLength(13);
    expect(t.view(K3).slots).toHaveLength(13);
    expect(t.bridgeOf(K1)).toMatchObject({ task: 'names', free: true, cursor: null });
    expect(t.bridgeOf(K1).tags).toHaveLength(10);
    expect(t.bridgeOf(K1).tags.every((x) => x.text === null && !x.selected && !x.flagged)).toBe(true);
    expect(t.bridgeOf(K2)).toMatchObject({ task: 'interval', free: true });
    expect(t.bridgeOf(K2).ropes).toHaveLength(7);
    expect(t.bridgeOf(K3)).toMatchObject({ task: 'flags', free: true });
    expect(t.bridgeOf(K3).flags).toHaveLength(8);
    // 널은 늘 자기 소리 높이를 갖는다
    expect(t.view(K2).slots.map((s) => s.midi)).toEqual(Array.from({ length: 13 }, (_, i) => 60 + i));
    expect(t.view(K1).slots.every((s) => !s.flagged && !s.playing && !s.selected)).toBe(true);
    // 건반 다리가 아닌 설치물(K4)은 다리 모습이 없다
    expect(t.view(K4).bridge).toBeUndefined();
  });

  it('같은 모습이면 다시 올리지 않는다(월드가 쓸데없이 다시 그리지 않는다)', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('cursor-right');
    const first = t.view(K1);
    bench.perform('cursor-left'); // 첫 널이라 바뀌는 것이 없다
    expect(t.view(K1)).toBe(first);
    bench.perform('cursor-right');
    expect(t.view(K1)).not.toBe(first);
  });

  it('지나가는 중 널을 밟으면 그 널의 소리가 난다(검은 널도 흰 널도). 작업대에 들어가 있는 동안에는 걷지 않으므로 받지 않는다. 이 다리에 없는 널은 조용하다', () => {
    const t = setup();
    enter(t, K1, BLACK_KEYS);
    t.stepOn(K1, 3); // 들어가 있는 동안
    expect(t.plays).toEqual([]);
    t.ic.exit();
    t.stepOn(K1, 3);
    expect(t.plays).toEqual([{ midi: 62, sec: STEP_NOTE_SEC, velocity: undefined }]);
    t.stepOn(K1, 2, true);
    expect(t.plays.map((p) => p.midi)).toEqual([62, 61]);
    t.stepOn(K1, 99);
    expect(t.plays).toHaveLength(2);
    t.stepOn(K3, 13);
    expect(t.plays.map((p) => p.midi)).toEqual([62, 61, 72]);
  });

  it('작업대에 들어간 다리만 고른 널이 보인다: 다른 다리의 모습에는 커서가 없다. 나오면 사라진다', () => {
    const t = setup();
    const bench = enter(t, K1, BLACK_KEYS);
    bench.perform('cursor-right');
    expect(t.bridgeOf(K1).cursor).toBe(1);
    expect(t.bridgeOf(K2).cursor).toBeNull();
    expect(t.bridgeOf(K3).cursor).toBeNull();
    t.ic.exit();
    expect(t.bridgeOf(K1).cursor).toBeNull();
  });

  it('세 다리가 한 컨트롤러를 나눠 쓴다: 한 다리를 나와 다른 다리에 들어가도 각 다리의 초안은 따로 보관된다', () => {
    const t = setup();
    const b1 = enter(t, K1, BLACK_KEYS);
    b1.selectItem(0);
    b1.hangTag(NAME_TAGS[0]!);
    t.ic.exit();
    const b2 = enter(t, K2, BUILD_BASIC);
    b2.selectItem(0);
    t.press(K2, 7);
    t.ic.exit();
    const b3 = enter(t, K3, G_MAJOR);
    t.press(K3, 7);
    t.ic.exit();
    expect(t.bridgeOf(K1).tags[0]!.text).toBe('C♯');
    expect(t.bridgeOf(K2).ropes[0]).toMatchObject({ to: 7, text: '3도 · 반음 4개' });
    expect(t.bridgeOf(K3).flags.map((f) => f.plank)).toEqual([7, null, null, null]);
    expect(b1).not.toBe(b3);
    // 같은 과제를 같은 설치물에서 다시 열면 이어서 한다
    const again = enter(t, K3, G_MAJOR);
    expect(planked(again)).toEqual([7, null, null, null]);
  });

  it('다리에서 건 것은 패널이 읽는 초안과 같다(초안 하나, 보는 방법 둘): 패널이 고친 것은 다리에 그대로 나타난다', () => {
    const t = setup();
    const bench = enter(t, K3, G_MAJOR);
    t.controller.edit({ type: 'setSlot', slot: 2, writtenPitch: null, midi: 65 }, '깃발을 꽂았어요.');
    expect(planked(bench)).toEqual([null, 6, null, null]);
    expect(t.bridgeOf(K3).flags[1]).toMatchObject({ order: 2, plank: 6 });
  });
});
