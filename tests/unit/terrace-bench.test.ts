// 7-1 계단밭(T5, 4.7)의 두뇌: 설치물 컨트롤러의 계단밭 길(들어가기, 표지판, 눌러 놓기, ↑↓ 높이 바꾸기, 변화표, 듣기, 판정 표식, 월드로 올라가는 모습)과 작업대(TerraceBench).
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 칸 계산은 terrace 시험이, 키 표는 terrace-keys 시험이, 화면은 terrace-hud 시험이, 월드 그림과 실제 걷기는 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import type { QuestDefinition, QuestVariant } from '@/domain/content';
import type { InstallationDef } from '@/domain/installation';
import { describeStaffPosition } from '@/domain/staff';
import { STEP_NOTE_SEC } from '@/domain/slotmap';
import { TERRACE_COLUMNS } from '@/domain/terrace';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { LAMP_NOTE_TICKS } from '@/ui/challenge/terraceBench';
import { NO_ACCIDENTAL_NOTICE, NO_LAMP_NOTICE, PICK_COLUMN_FIRST, UNUSED_COLUMN_NOTICE, terraceEntryText } from '@/ui/challenge/terraceText';
import { FREE_KEY, FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { Q01, Q02, installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q09 = 'staff.lines-and-spaces';
const Q10 = 'staff.ledger-lines';
const Q11 = 'staff.middle-c-neighbors';
const Q12 = 'staff.range-ladder';
const N1 = 'inst.staff-hill.treble-terrace';
const N2 = 'inst.staff-hill.bass-terrace';
const N3 = 'inst.staff-hill.middle-ledge';
const T_LINES = `${Q09}/treble-lines`;
const T_SPACES = `${Q09}/treble-spaces`;
const B_LINES = `${Q09}/bass-lines`;
const B_SPACES = `${Q09}/bass-spaces`;
const T_LEDGER = `${Q10}/treble-ledger`;
const T_FAR = `${Q10}/treble-far-ledger`;
const B_LEDGER = `${Q10}/bass-ledger`;
const MIDDLE_C = `${Q01}/middle-c`;
const NEIGHBORS = `${Q11}/neighbors`;
const LADDER = `${Q12}/c3-c5`;
const LADDER_WIDE = `${Q12}/c2-c6`;

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
  const r = rig({ definitions: [Q01, Q09, Q10, Q11, Q12].map(quest), ...opts });
  const bridge = new WorldBridge({ x: 4200, y: 1000, facing: 'down' });
  const defs: Record<string, InstallationDef> = { [N1]: installation(N1), [N2]: installation(N2), [N3]: installation(N3) };
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
    panels: new Set(['panel.clef']),
    opened: { mark: (id: string) => void opened.push(id) },
    frames,
  });
  ic.setNavigator((hash) => void navigated.push(hash));
  const view = (id: string): InstallationView => bridge.installationViews.get().find((v) => v.installationId === id)!;
  const terrace = (id: string) => view(id).terrace!;
  /** 열(1부터)을 눌렀다. 높이(온음계 칸 수)가 없으면 열만 누른 것이다 */
  const press = (id: string, column: number, step?: number): void => bridge.events.send({ type: 'slot-pressed', installationId: id, slot: column, ...(step === undefined ? {} : { step }) });
  const stepOn = (id: string, slot: number, entered = false): void => bridge.events.send({ type: 'stepped', installationId: id, slot, ...(entered ? { entered: true as const } : {}) });
  return { ...r, bridge, defs, ic, frames, plays, opened, navigated, view, terrace, press, stepOn };
}

type T = ReturnType<typeof setup>;
type Station = 'N1' | 'N2' | 'N3';

const STATION_OF: Record<string, Station> = { [N1]: 'N1', [N2]: 'N2', [N3]: 'N3' };

/** 정거장에 들어가 과제 판본을 고른다(고르지 않으면 자유로 놀기). 작업대를 돌려준다 */
function enter(t: T, id: string, key?: string) {
  expect(t.ic.enter(STATION_OF[id]!)).toBe(true);
  if (key) expect(t.ic.select(key)).toBe(true);
  return t.ic.terrace!;
}

/** 지금 놓인 등의 높이(열 차례, 비면 null) */
const stepsOf = (t: T): Array<number | null> => t.ic.terrace!.states().map((s) => s.step);
const namesOf = (t: T): Array<string | null> => t.ic.terrace!.states().map((s) => s.name);
const draftOf = (t: T, questId: string, variantId: string): string => JSON.stringify(t.session.contentOf(questId, variantId));

/** 열 하나를 골라 그 높이(온음계 칸 수)에 등을 놓는다(눌러서 놓기) */
const lay = (t: T, id: string, column: number, step: number): void => t.press(id, column, step);

describe('들어가기와 표지판(4.7)', () => {
  it('N1·N2·N3는 계단밭이다: 들어가면 자유로 놀기가 열리고 계단밭 작업대가 생긴다(돌·종·징검다리·무대 작업대는 아니다)', () => {
    const t = setup();
    for (const code of ['N1', 'N2', 'N3']) expect(t.ic.has(code), code).toBe(true);
    const n1 = t.defs[N1]!;
    expect(t.ic.isTerrace(n1)).toBe(true);
    expect(t.ic.isBell(n1)).toBe(false);
    expect(t.ic.isTimeline(n1)).toBe(false);
    expect(t.ic.isStage(n1)).toBe(false);
    expect(t.ic.terrace).toBeNull(); // 들어가기 전에는 없다
    expect(t.ic.enter('N1')).toBe(true);
    expect(t.ic.state.get().mode).toEqual({ installationId: N1, stationId: 'N1' });
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.terrace).toBe(t.ic.terraceOf(n1));
    expect(t.ic.bell).toBeNull();
    expect(t.ic.timeline).toBeNull();
    expect(t.ic.stage).toBeNull();
    // 자유로 놀기는 과제가 아니다: '열어 봄'을 적지 않는다
    expect(t.opened).toEqual([]);
    // 다른 종류의 설치물에는 계단밭 작업대가 없다
    for (const id of ['inst.village.scale-stones', 'inst.beat-river.first-ford', 'inst.bell-grove.three-bells']) {
      const other = installation(id);
      expect(t.ic.isTerrace(other), id).toBe(false);
      expect(t.ic.terraceOf(other), id).toBeNull();
    }
  });

  it('작업대는 설치물마다 하나이고, 각 밭이 다루는 범위(음자리표, 낮은 음, 높은 음)가 다르다', () => {
    const t = setup();
    const benches = [N1, N2, N3].map((id) => t.ic.terraceOf(t.defs[id]!)!);
    expect(new Set(benches).size).toBe(3);
    expect(t.ic.terraceOf(t.defs[N1]!)).toBe(benches[0]); // 같은 설치물은 같은 작업대
    expect(benches.map((b) => b.map.clefs)).toEqual([['treble'], ['bass'], ['treble', 'bass']]);
    expect(benches.map((b) => [b.map.low, b.map.high])).toEqual([
      ['A3', 'C6'],
      ['C2', 'E4'],
      ['C2', 'C6'],
    ]);
    // 세 밭은 가운데 도(C4)의 세로 자리를 함께 쓴다
    expect(new Set(benches.map((b) => b.map.c4Y))).toEqual(new Set([1000]));
  });

  it('들어왔을 때 알리는 말: 자유로 놀기는 변화표 키도 알리고, 변화표를 쓰지 않는 과제는 알리지 않는다', () => {
    const t = setup();
    t.ic.enter('N1');
    expect(t.controller.live).toBe(terraceEntryText('높은음 계단밭', true));
    for (const word of ['높은음 계단밭에 들어왔어요', '←→로 열을 고르고', '↑↓로 등을 한 칸씩', 'PageUp·PageDown은 한 옥타브', 'Shift+↑↓는 변화표', 'Enter', 'Backspace', 'H', 'Esc']) expect(t.controller.live, word).toContain(word);
    const quiet = terraceEntryText('낮은음 계단밭', false);
    expect(quiet).toContain('낮은음 계단밭에 들어왔어요');
    expect(quiet).not.toContain('Shift+↑↓');
    expect(quiet).toContain('PageUp·PageDown');
  });

  it('표지판: 맨 위가 자유로 놀기이고 그 아래에 이 밭의 과제 판본이 설계서 순서대로 있다', () => {
    const t = setup();
    const keys = (id: string): string[] => {
      t.ic.enter(STATION_OF[id]!);
      const out = t.ic.signOf(t.defs[id]!).map((e) => e.key);
      t.ic.exit();
      return out;
    };
    expect(keys(N1)).toEqual([FREE_KEY, T_LINES, T_SPACES, T_LEDGER, T_FAR]);
    expect(keys(N2)).toEqual([FREE_KEY, B_LINES, B_SPACES, B_LEDGER]);
    expect(keys(N3)).toEqual([FREE_KEY, MIDDLE_C, NEIGHBORS, LADDER, LADDER_WIDE]);
  });

  it('과제를 고르면 그 과제가 열리고 열어 봤다고 적는다. 판본마다 열 수와 이름이 다르다', () => {
    const t = setup();
    const bench = enter(t, N1);
    expect(bench.free).toBe(true);
    expect(bench.columns()).toHaveLength(TERRACE_COLUMNS); // 자유로 놀기: 열 여덟 개
    expect(t.ic.select(T_LINES)).toBe(true);
    expect(t.controller.live).toContain('줄과 칸');
    expect(t.opened).toEqual([Q09]);
    expect(bench.free).toBe(false);
    expect(t.ic.state.get().targetKey).toBe(T_LINES);
    expect(bench.columns().map((c) => c.label)).toEqual(['E4', 'G4', 'B4', 'D5', 'F5']);
    t.ic.select(T_SPACES);
    expect(bench.columns().map((c) => c.label)).toEqual(['F4', 'A4', 'C5', 'E5']);
    t.ic.select(T_LEDGER);
    expect(bench.columns().map((c) => c.label)).toEqual(['C4', 'A5']);
    t.ic.select(T_FAR);
    expect(bench.columns().map((c) => c.label)).toEqual(['A3', 'C6']);
  });

  it('각 밭이 다루는 모든 판본은 그 밭에서 풀 수 있다(열 수와 보표). 가운데 턱의 음역 사다리는 음 이름이 곧 열 이름이다', () => {
    const t = setup();
    const expected: Array<[string, string, string[]]> = [
      [N1, T_LINES, ['E4', 'G4', 'B4', 'D5', 'F5']],
      [N1, T_LEDGER, ['C4', 'A5']],
      [N2, B_LINES, ['G2', 'B2', 'D3', 'F3', 'A3']],
      [N2, B_SPACES, ['A2', 'C3', 'E3', 'G3']],
      [N2, B_LEDGER, ['E2', 'C2', 'C4', 'E4']],
      [N3, MIDDLE_C, ['높은음자리표 보표', '낮은음자리표 보표']],
      [N3, NEIGHBORS, ['B3 · 높은음자리표', 'B3 · 낮은음자리표', 'C4 · 높은음자리표', 'C4 · 낮은음자리표', 'D4 · 높은음자리표', 'D4 · 낮은음자리표']],
      [N3, LADDER, ['C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5']],
      [N3, LADDER_WIDE, ['C2', 'C3', 'C4', 'C5', 'C6']],
    ];
    for (const [id, key, labels] of expected) {
      const bench = enter(t, id, key);
      expect(bench.available, key).toBe(true);
      expect(bench.columns().map((c) => c.label), key).toEqual(labels);
      expect(bench.columns().map((c) => c.column), key).toEqual(labels.map((_, i) => i + 1));
      t.ic.exit();
    }
  });

  it('음계 순서 판본(Q12)은 초안 칸이 1부터이고, 음 이름 판본은 0부터다. 음자리표는 가온 도(C4)보다 낮은 칸이 낮은음자리표다', () => {
    const t = setup();
    const bench = enter(t, N3, LADDER);
    expect(bench.columns().map((c) => c.draft)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(bench.columns().map((c) => c.clef)).toEqual(['bass', 'bass', 'bass', 'treble', 'treble', 'treble', 'treble']);
    t.ic.select(NEIGHBORS);
    expect(bench.columns().map((c) => c.draft)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(bench.columns().map((c) => c.clef)).toEqual(['treble', 'bass', 'treble', 'bass', 'treble', 'bass']);
  });

  it('이 밭에서 풀 수 없는 판본은 작업대가 받지 않는다: 판정기 종류가 다르거나, 음자리표가 이 밭에 없거나, 열이 여덟 개를 넘을 때', () => {
    const t = setup();
    const n1 = t.ic.terraceOf(t.defs[N1]!)!;
    const n2 = t.ic.terraceOf(t.defs[N2]!)!;
    const n3 = t.ic.terraceOf(t.defs[N3]!)!;
    const variantOf = (id: string, vid: string): QuestVariant => quest(id).variants[vid]!;
    // 음자리표: 높은음 밭에는 낮은음 판본이 없고, 낮은음 밭에는 높은음 판본이 없다. 가운데 턱은 둘 다 받는다
    expect(n1.columnsFor(variantOf(Q09, 'treble-lines'))).not.toBeNull();
    expect(n1.columnsFor(variantOf(Q09, 'bass-lines'))).toBeNull();
    expect(n2.columnsFor(variantOf(Q09, 'bass-lines'))).not.toBeNull();
    expect(n2.columnsFor(variantOf(Q09, 'treble-lines'))).toBeNull();
    expect(n1.columnsFor(variantOf(Q12, 'c2-c6'))).toBeNull(); // 낮은음자리표 칸이 있다
    expect(n3.columnsFor(variantOf(Q12, 'c2-c6'))).not.toBeNull();
    expect(n3.columnsFor(variantOf(Q09, 'treble-lines'))).not.toBeNull();
    // 판정기 종류: 음 이름과 음계 순서만 받는다
    expect(n3.columnsFor(variantOf(Q02, Object.keys(quest(Q02).variants)[0]!))).toBeNull();
    // 열이 여덟 개를 넘으면 받지 않는다
    const nine = structuredClone(variantOf(Q09, 'treble-lines'));
    const spec = nine.evaluatorSpec as unknown as { targets: Array<{ slotId: string; label: string; expected: unknown; clef?: string }> };
    while (spec.targets.length < 9) spec.targets.push({ ...structuredClone(spec.targets[0]!), slotId: `x${spec.targets.length}` });
    expect(n1.columnsFor(nine)).toBeNull();
    // 같은 판본은 한 번만 계산한다
    const lines = variantOf(Q09, 'treble-lines');
    expect(n1.columnsFor(lines)).toBe(n1.columnsFor(lines));
  });

  it('나오면 모드가 풀리고 도전이 닫힌다. 놓아 둔 등은 보관되어 월드에 그대로 보이고, 다시 들어가면 이어서 놓는다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    lay(t, N1, 2, 4); // G4 열에 G4
    expect(stepsOf(t)).toEqual([null, 4, null, null, null]);
    t.ic.exit();
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.controller.current).toBeNull();
    expect(t.terrace(N1).columns.map((c) => c.step)).toEqual([null, 4, null, null, null]);
    expect(t.terrace(N1).cursor).toBeNull(); // 열려 있지 않으면 고른 열이 없다
    t.ic.enter('N1');
    expect(t.ic.select(T_LINES)).toBe(true);
    expect(stepsOf(t)).toEqual([null, 4, null, null, null]);
    // 고른 열은 보관된 초안에 남아 있어 놓았던 열에서 이어 간다
    expect(bench.cursor).toBe(1);
  });
});

describe('열 고르기와 높이 바꾸기(←→ ↑↓ PageUp PageDown)', () => {
  it('← →로 열을 옮긴다: 아직 고르지 않았으면 첫 열부터, 끝에서는 멈추고 알린다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    expect(bench.cursor).toBeNull();
    expect(bench.cursorColumn()).toBeNull();
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toBe('E4 열, 비어 있어요.');
    bench.perform('cursor-left');
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toContain('첫 열이에요');
    for (let i = 0; i < 4; i++) bench.perform('cursor-right');
    expect(bench.cursor).toBe(4);
    expect(bench.cursorColumn()?.label).toBe('F5');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(4);
    expect(t.controller.live).toContain('마지막 열이에요');
  });

  it('열을 직접 고를 수 있고, 이 판본에 없는 열은 받지 않는다. 비우면 고른 열이 없어진다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.selectColumn(2);
    expect(bench.cursor).toBe(2);
    bench.selectColumn(9);
    expect(bench.cursor).toBe(2);
    bench.selectColumn(-1);
    expect(bench.cursor).toBe(2);
    bench.selectColumn(null);
    expect(bench.cursor).toBeNull();
  });

  it('빈 열에서 ↑ ↓를 누르면 그 음자리표의 가운데 줄에 등이 놓인다(높은음 B4, 낮은음 D3). 어느 쪽을 눌러도 같다', () => {
    const t = setup();
    let bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up');
    expect(stepsOf(t)).toEqual([6, null, null, null, null]);
    expect(t.controller.live).toBe(`E4 등을 ${describeStaffPosition(4)}에 놓았어요.`);
    bench.perform('cursor-right');
    bench.perform('step-down');
    expect(stepsOf(t)).toEqual([6, 6, null, null, null]);
    t.ic.exit();
    bench = enter(t, N2, B_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up');
    expect(stepsOf(t)).toEqual([-6, null, null, null, null]);
    expect(bench.states()[0]).toMatchObject({ midi: 50, step: -6, name: 'D3' }); // D3
  });

  it('놓인 등에서 ↑ ↓는 한 칸씩(온음계), PageUp PageDown은 한 옥타브(일곱 칸)씩 옮긴다. 이름 대신 보표 위치를 말한다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up'); // B4
    bench.perform('step-up'); // C5
    expect(stepsOf(t)[0]).toBe(7);
    expect(bench.states()[0]!.midi).toBe(72);
    expect(t.controller.live).toBe(`E4 등을 ${describeStaffPosition(5)}에 놓았어요.`);
    bench.perform('step-down');
    bench.perform('step-down'); // A4
    expect(bench.states()[0]!.midi).toBe(69);
    bench.perform('octave-up'); // A5
    expect(stepsOf(t)[0]).toBe(12);
    expect(bench.states()[0]!.midi).toBe(81);
    bench.perform('octave-down');
    bench.perform('octave-down'); // A3: 이 밭의 맨 아래다
    expect(stepsOf(t)[0]).toBe(-2);
    expect(bench.states()[0]!.midi).toBe(57);
  });

  it('문제를 푸는 중에는 음 이름을 말하지 않는다: 안내 문장에도, 월드로 올라가는 모습에도 이름이 없다(높이를 찾는 일이 문제이므로)', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up');
    expect(t.controller.live).not.toMatch(/B4|B♭|B♯/);
    expect(t.terrace(N1).free).toBe(false);
    expect(t.terrace(N1).columns[0]).toMatchObject({ step: 6, name: null, midi: 71 });
    expect(t.view(N1).slots[0]).toMatchObject({ slot: 1, name: null, midi: 71 });
    // 놓은 열을 다시 골라도 높이만 말한다
    bench.perform('cursor-right');
    bench.perform('cursor-left');
    expect(t.controller.live).toBe(`E4 열, ${describeStaffPosition(4)}에 있어요.`);
  });

  it('범위 끝에서는 멈추고 이유를 알린다. 끝에 닿지 않았는데 한 옥타브를 건너뛰면 끝까지만 간다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up'); // 6
    bench.perform('octave-up');
    expect(stepsOf(t)[0]).toBe(13);
    bench.perform('octave-up');
    expect(stepsOf(t)[0]).toBe(14); // 20이 아니라 맨 위(C6)까지만
    bench.perform('octave-up');
    expect(stepsOf(t)[0]).toBe(14);
    expect(t.controller.live).toBe(`E4 등은 더 위로 옮길 수 없어요. 지금은 ${describeStaffPosition(12)}에 있어요.`);
    bench.perform('step-up');
    expect(t.controller.live).toContain('더 위로 옮길 수 없어요');
    bench.perform('octave-down');
    bench.perform('octave-down');
    expect(stepsOf(t)[0]).toBe(0);
    bench.perform('octave-down');
    expect(stepsOf(t)[0]).toBe(-2); // -7이 아니라 맨 아래(A3)까지만
    bench.perform('step-down');
    expect(stepsOf(t)[0]).toBe(-2);
    expect(t.controller.live).toContain('더 아래로 옮길 수 없어요');
  });

  it('낮은음 밭의 범위는 C2~E4다: 맨 위(E4)와 맨 아래(C2)에서 멈춘다', () => {
    const t = setup();
    const bench = enter(t, N2, B_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up'); // D3
    for (let i = 0; i < 20; i++) bench.perform('step-up');
    expect(stepsOf(t)[0]).toBe(2); // E4
    expect(bench.states()[0]).toMatchObject({ midi: 64, step: 2 });
    for (let i = 0; i < 30; i++) bench.perform('step-down');
    expect(stepsOf(t)[0]).toBe(-14); // C2
    expect(bench.states()[0]!.midi).toBe(36);
  });

  it('Enter: 빈 열이면 가운데 줄에 놓고, 놓인 열이면 바꾸지 않고 울려 보기만 한다. 열을 고르지 않았으면 첫 열을 고르기만 한다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('place');
    expect(bench.cursor).toBe(0);
    expect(stepsOf(t)).toEqual([null, null, null, null, null]);
    bench.perform('place');
    expect(stepsOf(t)).toEqual([6, null, null, null, null]);
    const before = draftOf(t, Q09, 'treble-lines');
    bench.perform('place');
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
    expect(t.controller.live).toBe(`E4 열, ${describeStaffPosition(4)}에 있어요.`);
  });

  it('Backspace는 고른 열의 등을 뺀다. 고른 열이 없으면 먼저 열을 고르라고, 빈 열이면 이미 비어 있다고 알린다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('remove');
    expect(t.controller.live).toBe(PICK_COLUMN_FIRST);
    bench.perform('cursor-right');
    bench.perform('remove');
    expect(t.controller.live).toBe('E4 등은 이미 비어 있어요.');
    bench.perform('step-up');
    expect(bench.placedCount()).toBe(1);
    bench.perform('remove');
    expect(t.controller.live).toBe('E4 등을 뺐어요.');
    expect(bench.placedCount()).toBe(0);
    expect(stepsOf(t)).toEqual([null, null, null, null, null]);
  });

  it('실행 취소(Z)와 다시 실행(Y)이 된다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up');
    bench.perform('step-up');
    expect(stepsOf(t)[0]).toBe(7);
    bench.perform('undo');
    expect(stepsOf(t)[0]).toBe(6);
    bench.perform('undo');
    expect(stepsOf(t)[0]).toBeNull();
    bench.perform('redo');
    expect(stepsOf(t)[0]).toBe(6);
    bench.perform('redo');
    expect(stepsOf(t)[0]).toBe(7);
  });

  it('열마다 등 하나다: 다른 열의 등은 그대로이고, 월드의 고른 열(selected)은 하나뿐이다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up');
    bench.perform('cursor-right');
    bench.perform('step-up');
    bench.perform('step-up');
    bench.perform('step-up');
    expect(stepsOf(t)).toEqual([6, 8, null, null, null]);
    expect(t.view(N1).slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([2]);
    expect(t.terrace(N1)).toMatchObject({ cursor: 1, cursorStep: 8 });
    // 고른 열이 비어 있으면 놓으려는 높이는 가운데 줄이다
    bench.perform('cursor-right');
    expect(t.terrace(N1)).toMatchObject({ cursor: 2, cursorStep: 6 });
  });

  it('판본을 바꾸면 그 판본의 초안이 열리고, 돌아오면 놓았던 등이 그대로 있다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    lay(t, N1, 1, 2);
    expect(bench.placedCount()).toBe(1);
    t.ic.select(T_SPACES);
    expect(bench.placedCount()).toBe(0);
    expect(bench.cursor).toBeNull();
    t.ic.select(T_LINES);
    expect(stepsOf(t)).toEqual([2, null, null, null, null]);
  });
});

describe('눌러서 놓기(W-4: 끌지 않고 높이를 눌러 놓는다)', () => {
  it('열의 높이를 누르면 그 높이에 등이 놓이고 그 열이 골라진다. 월드가 눌린 자리를 온음계 칸 수로 바꿔 보낸다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    t.press(N1, 2, 4); // G4 열의 G4 높이
    expect(stepsOf(t)).toEqual([null, 4, null, null, null]);
    expect(bench.cursor).toBe(1);
    expect(t.controller.live).toBe(`G4 등을 ${describeStaffPosition(2)}에 놓았어요.`);
    expect(t.terrace(N1).columns[1]).toMatchObject({ step: 4, midi: 67, name: null });
    expect(t.view(N1).slots.find((s) => s.selected)).toMatchObject({ slot: 2, midi: 67 });
  });

  it('놓인 높이를 다시 누르면 그 열을 고르고 울려 볼 뿐 바꾸지 않는다. 다른 높이를 누르면 등이 그 높이로 옮겨 간다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    lay(t, N1, 2, 4);
    const before = draftOf(t, Q09, 'treble-lines');
    bench.perform('cursor-left'); // 다른 열로 옮겨 가 있다가
    expect(bench.cursor).toBe(0);
    t.press(N1, 2, 4);
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
    expect(bench.cursor).toBe(1);
    expect(t.controller.live).toBe(`G4 열, ${describeStaffPosition(2)}에 있어요.`);
    t.press(N1, 2, 9);
    expect(stepsOf(t)).toEqual([null, 9, null, null, null]);
    expect(t.controller.live).toBe(`G4 등을 ${describeStaffPosition(7)}에 놓았어요.`);
    t.press(N1, 2, 3);
    expect(stepsOf(t)).toEqual([null, 3, null, null, null]);
  });

  it('높이 없이 열만 눌렀거나(키보드·단추) 높이가 정수가 아니면 열만 고른다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    const before = draftOf(t, Q09, 'treble-lines');
    t.press(N1, 3);
    expect(bench.cursor).toBe(2);
    expect(t.controller.live).toBe('B4 열, 비어 있어요.');
    t.bridge.events.send({ type: 'slot-pressed', installationId: N1, slot: 4, step: 1.5 });
    expect(bench.cursor).toBe(3);
    t.bridge.events.send({ type: 'slot-pressed', installationId: N1, slot: 5, step: Number.NaN });
    expect(bench.cursor).toBe(4);
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
  });

  it('이 열의 범위 밖 높이를 누르면 등을 놓지 않고 이유를 알린다(그 열은 고른다)', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    const before = draftOf(t, Q09, 'treble-lines');
    t.press(N1, 1, 20);
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toBe(`E4: 높은음자리표 열은 ${describeStaffPosition(-4)}부터 ${describeStaffPosition(12)}까지 놓을 수 있어요.`);
    t.press(N1, 1, -3);
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
    // 낮은음 밭: 가온 도(C4) 위는 이 밭의 열이 아니다
    t.ic.exit();
    enter(t, N2, B_LINES);
    const lower = draftOf(t, Q09, 'bass-lines');
    t.press(N2, 1, 3);
    expect(draftOf(t, Q09, 'bass-lines')).toBe(lower);
    expect(t.controller.live).toContain('낮은음자리표 열은');
  });

  it('이 판본이 쓰지 않는 열과 범위 밖의 열 번호는 받지 않고 이유를 알린다', () => {
    const t = setup();
    enter(t, N1, T_SPACES); // 열이 넷이다
    const before = draftOf(t, Q09, 'treble-spaces');
    for (const column of [5, 8, 0, -1, 9, 1.5, Number.NaN]) {
      t.press(N1, column, 4);
      expect(draftOf(t, Q09, 'treble-spaces'), String(column)).toBe(before);
      expect(t.controller.live, String(column)).toBe(UNUSED_COLUMN_NOTICE);
    }
  });

  it('들어가 있지 않은 설치물이나 다른 설치물의 누름은 받지 않는다', () => {
    const t = setup();
    t.press(N1, 1, 4); // 들어가기 전
    expect(draftOf(t, Q09, 'treble-lines')).toBe(JSON.stringify(t.session.contentOf(Q09, 'treble-lines')));
    const bench = enter(t, N1, T_LINES);
    t.press(N2, 1, -6); // 다른 밭을 눌렀다
    t.press('inst.nowhere', 1, 4);
    expect(bench.placedCount()).toBe(0);
    expect(t.view(N2).terrace!.columns.every((c) => c.step === null)).toBe(true);
  });

  it('등을 놓을 때마다 그 높이의 소리를 들려 준다. 소리를 켜기 전에는 나지 않는다(W-11)', async () => {
    const t = setup();
    enter(t, N1, T_LINES);
    t.press(N1, 1, 2);
    expect(t.engine.sinks.size).toBe(0);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    t.press(N1, 3, 6); // B4
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([71]);
    t.engine.sinks.get('task')!.requests.splice(0);
    t.press(N1, 3, 7); // C5로 옮긴다
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([72]);
    t.engine.sinks.get('task')!.requests.splice(0);
    t.press(N1, 3, 7); // 같은 높이는 바꾸지 않고 울려 보기만 한다
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([72]);
  });

  it('낮은음 밭: 보표 아래의 덧줄 높이까지 놓을 수 있다. 가온 도(C4)는 높은음 밭과 같은 세로 자리(1000)다', () => {
    const t = setup();
    const bench = enter(t, N2, B_LEDGER);
    t.press(N2, 3, 0); // C4 열의 C4(위 첫 덧줄)
    expect(bench.states()[2]).toMatchObject({ step: 0, midi: 60, name: 'C4', where: '위 첫 덧줄' });
    t.ic.exit();
    enter(t, N1, T_LEDGER);
    t.press(N1, 1, 0); // 높은음 밭의 C4(아래 첫 덧줄)
    expect(t.ic.terrace!.states()[0]).toMatchObject({ step: 0, midi: 60, name: 'C4', where: '아래 첫 덧줄' });
    expect(t.terrace(N1).columns[0].step).toBe(t.terrace(N2).columns[2]!.step);
  });
});

describe('변화표(자유로 놀기와 변화표를 쓰는 과제에서만)', () => {
  it('변화표를 쓰지 않는 과제에서는 Shift+↑↓와 변화표 고르기가 알리기만 하고 등을 바꾸지 않는다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    expect(bench.accidentalsAllowed).toBe(false);
    lay(t, N1, 1, 2);
    const before = draftOf(t, Q09, 'treble-lines');
    bench.perform('accidental-up');
    expect(t.controller.live).toBe(NO_ACCIDENTAL_NOTICE);
    bench.perform('accidental-down');
    bench.pickAccidental('sharp');
    bench.pickAccidental('flat');
    bench.pickAccidental(null);
    expect(t.controller.live).toBe(NO_ACCIDENTAL_NOTICE);
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
  });

  it('자유로 놀기에서는 올림표와 내림표를 달고 뗀다. 이름이 월드에 올라가고 안내 문장도 이름을 말한다', () => {
    const t = setup();
    const bench = enter(t, N1);
    expect(bench.free).toBe(true);
    expect(bench.accidentalsAllowed).toBe(true);
    bench.perform('cursor-right');
    bench.perform('step-up'); // 가운데 줄 B4
    expect(namesOf(t)[0]).toBe('B4');
    expect(t.controller.live).toContain('B4');
    bench.perform('accidental-up');
    expect(bench.states()[0]).toMatchObject({ midi: 72, name: 'B♯4' });
    expect(t.terrace(N1).columns[0]).toMatchObject({ accidental: 'sharp', name: 'B♯4', midi: 72 });
    bench.perform('accidental-up');
    expect(t.controller.live).toContain('변화표를 더 올릴 수 없어요');
    bench.perform('accidental-down');
    bench.perform('accidental-down');
    expect(bench.states()[0]).toMatchObject({ midi: 70, name: 'B♭4' });
    expect(t.terrace(N1).columns[0].accidental).toBe('flat');
    bench.pickAccidental(null);
    expect(bench.states()[0]).toMatchObject({ midi: 71, name: 'B4' });
    expect(t.terrace(N1).columns[0].accidental).toBeNull();
    bench.pickAccidental(null);
    expect(t.controller.live).toContain('달린 변화표가 없어요');
    bench.pickAccidental('sharp');
    bench.pickAccidental('sharp');
    expect(t.controller.live).toContain('이미 올림표가 달려 있어요');
    // 높이를 옮겨도 변화표는 그대로다
    bench.perform('step-up');
    expect(bench.states()[0]).toMatchObject({ step: 7, name: 'C♯5' });
  });

  it('등이 없는 열이나 고르지 않은 열에서는 먼저 놓거나 고르라고 알린다', () => {
    const t = setup();
    const bench = enter(t, N1);
    bench.perform('accidental-up');
    expect(t.controller.live).toBe(PICK_COLUMN_FIRST);
    bench.perform('cursor-right');
    bench.perform('accidental-up');
    expect(t.controller.live).toContain('먼저 등을 놓아 주세요');
    expect(bench.placedCount()).toBe(0);
  });

  it('자유로 놀기의 열은 여덟 개이고, 높은음 밭은 모두 높은음자리표, 낮은음 밭은 모두 낮은음자리표, 가운데 턱은 번갈아 선다', () => {
    const t = setup();
    for (const [id, clefs] of [
      [N1, Array(8).fill('treble')],
      [N2, Array(8).fill('bass')],
      [N3, ['treble', 'bass', 'treble', 'bass', 'treble', 'bass', 'treble', 'bass']],
    ] as const) {
      const bench = enter(t, id);
      expect(bench.columns().map((c) => c.clef), id).toEqual(clefs);
      expect(t.terrace(id).columns, id).toHaveLength(8);
      expect(t.terrace(id).free, id).toBe(true);
      t.ic.exit();
    }
  });

  it('자유로 놀기: 낮은음자리표 열에는 가온 도 아래 낮은 높이를, 높은음자리표 열에는 높은 높이를 놓을 수 있고 반대는 안 된다', () => {
    const t = setup();
    const bench = enter(t, N3);
    t.press(N3, 2, -7); // 낮은음자리표 열의 C3
    expect(bench.states()[1]).toMatchObject({ step: -7, midi: 48, name: 'C3' });
    const before = draftOf(t, ...freeIds(t, N3));
    t.press(N3, 1, -7); // 높은음자리표 열에는 너무 낮다
    expect(draftOf(t, ...freeIds(t, N3))).toBe(before);
    expect(t.controller.live).toContain('높은음자리표 열은');
    t.press(N3, 1, 12); // 높은음자리표 열의 A5
    expect(bench.states()[0]).toMatchObject({ step: 12, midi: 81, name: 'A5' });
    t.press(N3, 2, 12); // 낮은음자리표 열에는 너무 높다
    expect(bench.states()[1]!.step).toBe(-7);
  });
});

/** 자유로 놀기 도전의 (과제 번호, 판본 번호): 초안이 이 이름으로 보관된다 */
function freeIds(t: T, id: string): [string, string] {
  const cur = t.controller.current!;
  expect(cur.free).toBe(true);
  expect(t.ic.active?.installationId).toBe(id);
  return [cur.entry.questId, cur.variant.variantId];
}

describe('듣기(P 내 등, T 목표)', () => {
  it('P: 놓은 등이 없으면 이유를 알리고, 있으면 열 차례(왼쪽부터)대로 들려 준다. 듣는 동안 울리는 열이 월드에 playing으로 올라간다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBe(NO_LAMP_NOTICE);
    lay(t, N1, 3, 6); // 셋째 열을 먼저 놓았어도 열 차례로 들린다
    lay(t, N1, 1, 2);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    expect(t.controller.notice).toBeNull();
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    expect(t.terrace(N1).columns.filter((c) => c.playing).map((c) => c.column)).toEqual([1]);
    expect(bench.playhead()).toEqual([0]);
    t.run(0.75); // 4분음표 하나(80박)가 지나면 다음 등
    t.frames.tick();
    expect(t.terrace(N1).columns.filter((c) => c.playing).map((c) => c.column)).toEqual([3]);
    expect(t.view(N1).slots.filter((s) => s.playing).map((s) => s.slot)).toEqual([3]);
    bench.perform('stop');
    t.frames.tick();
    expect(t.controller.playing).toBeNull();
    expect(t.terrace(N1).columns.every((c) => !c.playing)).toBe(true);
  });

  it('P의 소리는 놓은 등의 높이를 열 차례대로, 등마다 4분음표 하나 길이로 낸다', async () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    lay(t, N1, 3, 6); // B4
    lay(t, N1, 1, 2); // E4
    lay(t, N1, 5, 10); // F5
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-mine');
    t.run(4);
    const notes = t.engine.sinks.get('task')!.live();
    expect(notes.map((q) => q.midi)).toEqual([64, 71, 77]);
    expect(LAMP_NOTE_TICKS).toBe(960);
    const gaps = notes.slice(1).map((q, i) => +(q.time - notes[i]!.time).toFixed(3));
    expect(gaps).toEqual([0.75, 0.75]);
  });

  it('T: 문제를 푸는 중에는 목표 음을 열 차례대로 들려 준다. 목표가 어디인지는 말해 주지 않고 소리만 들려 준다', async () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    bench.perform('hear-target');
    expect(t.controller.playing).toBe('target');
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    expect(bench.playhead()).toEqual([0]);
    t.run(4);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([64, 67, 71, 74, 77]);
    expect(t.controller.live).not.toMatch(/E4|G4|높이/);
    // 놓은 등과 상관없이 목표는 같다
    bench.perform('stop');
    lay(t, N1, 1, 5);
    t.engine.sinks.get('task')!.requests.splice(0);
    bench.perform('hear-target');
    t.run(4);
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([64, 67, 71, 74, 77]);
  });

  it('T: 음계 순서 판본은 낮은 음부터 차례로, 두 보표 판본도 열 차례대로 들려 준다', async () => {
    const t = setup();
    await t.controller.enableSound();
    const hear = (id: string, key: string): number[] => {
      const bench = enter(t, id, key);
      t.engine.sinks.get('task')?.requests.splice(0);
      bench.perform('hear-target');
      t.run(8);
      const out = t.engine.sinks.get('task')!.live().map((q) => q.midi);
      bench.perform('stop');
      t.ic.exit();
      return out;
    };
    expect(hear(N3, LADDER)).toEqual([48, 52, 55, 60, 64, 67, 72]);
    expect(hear(N3, LADDER_WIDE)).toEqual([36, 48, 60, 72, 84]);
    expect(hear(N3, MIDDLE_C)).toEqual([60, 60]);
    expect(hear(N3, NEIGHBORS)).toEqual([59, 59, 60, 60, 62, 62]);
    expect(hear(N2, B_LEDGER)).toEqual([40, 36, 60, 64]);
  });

  it('자유로 놀 때는 목표와 판정이 없다: T와 C는 안내만 한다. P는 놓은 등을 들려 준다', () => {
    const t = setup();
    const bench = enter(t, N1);
    bench.perform('hear-target');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_TARGET);
    bench.perform('check');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_CHECK);
    expect(t.controller.playing).toBeNull();
    bench.perform('hear-mine');
    expect(t.controller.notice).toBe(NO_LAMP_NOTICE);
    t.press(N1, 2, 6);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
  });

  it('음계 순서 판본(Q12)의 P는 놓은 칸의 번호(1부터)로 울리는 열을 알린다', () => {
    const t = setup();
    const bench = enter(t, N3, LADDER);
    t.press(N3, 4, 0); // 넷째 칸(C4, 높은음자리표)
    t.press(N3, 1, -7); // 첫째 칸(C3, 낮은음자리표)
    bench.perform('hear-mine');
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    expect(t.terrace(N3).columns.filter((c) => c.playing).map((c) => c.column)).toEqual([1]);
    t.run(0.75);
    t.frames.tick();
    expect(t.terrace(N3).columns.filter((c) => c.playing).map((c) => c.column)).toEqual([4]);
  });
});

describe('확인과 표식(C)', () => {
  it('Q09: 다섯 줄 음을 모두 맞게 놓고 확인하면 통과한다. 하나가 틀리면 그 열에 표식(느낌표)이 서고, 고치면 표식이 사라진다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    // E4 G4 B4 D5 F5: 높은음자리표의 다섯 줄
    for (const [column, step] of [[1, 2], [2, 5], [3, 6], [4, 8], [5, 10]] as const) lay(t, N1, column, step); // 둘째 열을 A4에 놓았다(틀림)
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback?.issues.map((i) => i.code)).toEqual(['WRONG_STAFF_PITCH']);
    expect(bench.flagged()).toEqual([1]);
    expect(t.terrace(N1).columns.filter((c) => c.flagged).map((c) => c.column)).toEqual([2]);
    expect(t.view(N1).slots.filter((s) => s.flagged).map((s) => s.slot)).toEqual([2]);
    // 고치면 판정이 지워져 표식도 사라진다
    lay(t, N1, 2, 4);
    expect(t.controller.feedback).toBeNull();
    expect(bench.flagged()).toEqual([]);
    expect(t.terrace(N1).columns.every((c) => !c.flagged)).toBe(true);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.opened).toEqual([Q09]);
  });

  it('놓지 않은 열은 빠졌다고 알리고 그 열에 표식이 선다. 같은 소리의 다른 표기(올림표)와 한 옥타브 다른 높이는 각각 다른 이유로 틀린다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    lay(t, N1, 1, 2);
    lay(t, N1, 2, 4);
    lay(t, N1, 3, 6);
    lay(t, N1, 4, 8);
    bench.perform('check'); // 다섯째 열이 비었다
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback?.issues.map((i) => i.code)).toEqual(['MISSING_PLACEMENT']);
    expect(bench.flagged()).toEqual([4]);
    lay(t, N1, 5, 3); // F5(10)가 아니라 한 옥타브 낮은 F4(3)에 놓았다
    bench.perform('check');
    expect(t.controller.feedback?.issues.map((i) => i.code)).toEqual(['OCTAVE_MISMATCH']);
    expect(bench.flagged()).toEqual([4]);
  });

  it('Q12: 음계 순서 판본은 놓은 순서가 아니라 칸의 높이 순서로 판정한다. 틀린 칸은 칸 번호로 표식이 선다', () => {
    const t = setup();
    const bench = enter(t, N3, LADDER);
    // C3 E3 G3 C4 E4 G4 C5
    const steps: Array<[number, number]> = [[1, -7], [2, -5], [3, -3], [4, 0], [5, 2], [6, 4], [7, 7]];
    for (const [column, step] of steps) lay(t, N3, column, step);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    // 다섯째 칸(E4)을 F4로 올리면 그 칸이 틀린다
    lay(t, N3, 5, 3);
    expect(t.controller.feedback).toBeNull();
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(bench.flagged()).toEqual([5]);
    expect(t.terrace(N3).columns.filter((c) => c.flagged).map((c) => c.column)).toEqual([5]);
  });

  it('Q01(가운데 턱): 높은음자리표와 낮은음자리표 열에 같은 높이(가온 도 C4)를 놓으면 통과한다. 두 열의 등은 같은 세로 자리다', () => {
    const t = setup();
    const bench = enter(t, N3, MIDDLE_C);
    lay(t, N3, 1, 0);
    lay(t, N3, 2, 0);
    expect(t.terrace(N3).columns.map((c) => c.step)).toEqual([0, 0]);
    expect(bench.states().map((s) => s.where)).toEqual(['아래 첫 덧줄', '위 첫 덧줄']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    // 한 열을 한 칸 올리면 틀리고 그 열에 표식이 선다
    lay(t, N3, 2, 1);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(bench.flagged()).toEqual([1]);
  });

  it('판정 뒤에 같은 높이를 다시 눌러도(놓은 것이 바뀌지 않아서) 표식은 그대로이고, 놓은 것이 바뀌면 사라진다', () => {
    const t = setup();
    const bench = enter(t, N2, B_SPACES);
    // A2 C3 E3 G3: 낮은음자리표의 네 칸. 넷째 열을 G3(-3)이 아니라 한 칸 위 A3(-2)에 놓았다
    for (const [column, step] of [[1, -9], [2, -7], [3, -5], [4, -2]] as const) lay(t, N2, column, step);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(bench.flagged()).toEqual([3]);
    lay(t, N2, 4, -2);
    expect(t.controller.feedback).not.toBeNull();
    expect(bench.flagged()).toEqual([3]);
    lay(t, N2, 4, -3);
    expect(t.controller.feedback).toBeNull();
    expect(bench.flagged()).toEqual([]);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });
});

describe('패널로 보기와 같은 초안', () => {
  it('자유로 놀기에는 패널이 없다. 과제를 고르면 패널로 보기가 그 판본의 주소를 알려 주고, 도움과 나가기는 컨트롤러가 이어 준다', () => {
    const t = setup();
    enter(t, N1);
    expect(t.ic.performTerrace('view-panel')).toBeNull();
    expect(t.controller.live).toBe(FREE_PLAY_NO_PANEL);
    expect(t.ic.state.get().helpOpen).toBe(false);
    expect(t.ic.performTerrace('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(true);
    expect(t.ic.performTerrace('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.select(T_LINES);
    expect(t.ic.performTerrace('view-panel')).toEqual({ navigate: ContentCatalog.hashFor(Q09, 'treble-lines') });
    expect(t.ic.performTerrace('exit')).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
    // 들어가 있지 않으면 아무것도 하지 않는다
    expect(t.ic.performTerrace('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
  });

  it('performTerrace는 키 지도의 동작을 작업대로 넘긴다(들어가 있지 않으면 아무것도 하지 않는다)', () => {
    const t = setup();
    expect(t.ic.performTerrace('cursor-right')).toBeNull(); // 들어가기 전
    enter(t, N1, T_LINES);
    t.ic.performTerrace('cursor-right');
    t.ic.performTerrace('step-up');
    t.ic.performTerrace('octave-up');
    expect(stepsOf(t)).toEqual([13, null, null, null, null]);
    t.ic.performTerrace('remove');
    expect(stepsOf(t)).toEqual([null, null, null, null, null]);
    t.ic.exit();
    // 나온 뒤에는 키 동작이 아무것도 바꾸지 않는다
    const before = draftOf(t, Q09, 'treble-lines');
    expect(t.ic.performTerrace('step-up')).toBeNull();
    expect(draftOf(t, Q09, 'treble-lines')).toBe(before);
  });

  it('밭에서 놓은 등은 패널이 읽는 초안에 같은 기보 음으로 들어 있고, 패널에서 놓은 것은 밭에 그 높이로 나타난다(초안 하나, 보는 방법 둘)', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    lay(t, N1, 3, 6); // B4
    const slot = t.session.contentOf(Q09, 'treble-lines').slots.find((s) => s.slot === 2);
    expect(slot?.writtenPitch).toMatchObject({ letter: 'B', octave: 4 });
    expect(slot?.writtenPitch?.accidental ?? null).toBeNull();
    // 패널이 같은 초안을 고친다
    t.controller.edit({ type: 'setSlot', slot: 3, writtenPitch: { letter: 'D', accidental: null, octave: 5 } }, 'D5를 놓았어요.');
    expect(bench.states()[3]).toMatchObject({ step: 8, midi: 74 });
    expect(t.terrace(N1).columns[3]).toMatchObject({ step: 8, midi: 74 });
    expect(t.view(N1).slots[3]).toMatchObject({ slot: 4, midi: 74 });
  });
});

describe('월드로 올라가는 모습', () => {
  it('걸어 보기 전에도(들어간 적 없어도) 자유로 놀기 틀의 열 여덟 개가 월드에 보인다. 놓은 것이 없으니 높이와 이름이 없다', () => {
    const t = setup();
    for (const id of [N1, N2, N3]) {
      expect(t.terrace(id).columns, id).toHaveLength(8);
      expect(t.terrace(id).columns.every((c) => c.step === null && c.name === null && c.midi === null && !c.flagged && !c.playing), id).toBe(true);
      expect(t.terrace(id).cursor, id).toBeNull();
      expect(t.terrace(id).free, id).toBe(true);
      expect(t.view(id).slots, id).toHaveLength(8);
    }
  });

  it('열려 있는 도전의 고른 열과 높이만 모습에 오른다: 다른 밭의 모습에는 고른 열이 없다', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    bench.perform('step-up');
    expect(t.terrace(N1)).toMatchObject({ cursor: 0, cursorStep: 6, free: false });
    expect(t.terrace(N1).columns.map((c) => c.label)).toEqual(['E4', 'G4', 'B4', 'D5', 'F5']);
    expect(t.terrace(N2).cursor).toBeNull();
    expect(t.terrace(N3).cursor).toBeNull();
    t.ic.exit();
    expect(t.terrace(N1).cursor).toBeNull();
  });

  it('열마다 쓸 수 있는 높이(minStep, maxStep)와 음자리표가 모습에 올라간다', () => {
    const t = setup();
    enter(t, N3, NEIGHBORS);
    const cols = t.terrace(N3).columns;
    expect(cols.map((c) => c.clef)).toEqual(['treble', 'bass', 'treble', 'bass', 'treble', 'bass']);
    expect(cols.map((c) => [c.minStep, c.maxStep])).toEqual([[-2, 14], [-14, 2], [-2, 14], [-14, 2], [-2, 14], [-14, 2]]);
  });

  it('같은 모습이면 다시 올리지 않는다(월드가 쓸데없이 다시 그리지 않는다)', () => {
    const t = setup();
    const bench = enter(t, N1, T_LINES);
    bench.perform('cursor-right');
    const first = t.view(N1);
    bench.perform('cursor-left'); // 첫 열이라 바뀌는 것이 없다
    expect(t.view(N1)).toBe(first);
    bench.perform('step-up');
    expect(t.view(N1)).not.toBe(first);
  });

  it('지나가는 중 열을 밟으면 그 열에 놓인 등의 소리가 난다. 등이 없는 열은 조용하고, 작업대에 들어가 있는 동안에는 걷지 않으므로 받지 않는다', () => {
    const t = setup();
    enter(t, N1, T_LINES);
    lay(t, N1, 3, 6);
    t.stepOn(N1, 3); // 들어가 있는 동안
    expect(t.plays).toEqual([]);
    t.ic.exit();
    t.stepOn(N1, 3);
    expect(t.plays).toEqual([{ midi: 71, sec: STEP_NOTE_SEC, velocity: undefined }]);
    t.stepOn(N1, 2); // 등이 없다
    t.stepOn(N1, 8); // 이 판본이 쓰지 않는 열
    expect(t.plays).toHaveLength(1);
  });
});

describe('도전을 바꾸고 다시 열기', () => {
  it('세 밭이 한 컨트롤러를 나눠 쓴다: 한 밭을 나와 다른 밭에 들어가도 각 밭의 초안은 따로 보관된다', () => {
    const t = setup();
    enter(t, N1, T_LINES);
    lay(t, N1, 1, 2);
    t.ic.exit();
    enter(t, N2, B_LINES);
    lay(t, N2, 1, -10);
    t.ic.exit();
    enter(t, N3, MIDDLE_C);
    lay(t, N3, 1, 0);
    t.ic.exit();
    expect(t.terrace(N1).columns[0].step).toBe(2);
    expect(t.terrace(N2).columns[0].step).toBe(-10);
    expect(t.terrace(N3).columns[0].step).toBe(0);
    expect(t.terrace(N1).columns).toHaveLength(5);
    expect(t.terrace(N2).columns).toHaveLength(5);
    expect(t.terrace(N3).columns).toHaveLength(2);
    // 가운데 턱의 Q01과 높은음 밭의 Q09는 다른 초안이다
    expect(JSON.stringify(t.session.contentOf(Q09, 'treble-lines'))).not.toBe(JSON.stringify(t.session.contentOf(Q01, 'middle-c')));
  });

  it('같은 과제를 다른 밭에서 열어도(줄과 칸은 높은음 밭과 낮은음 밭) 판본이 다르므로 초안이 섞이지 않는다', () => {
    const t = setup();
    enter(t, N1, T_LINES);
    lay(t, N1, 1, 2);
    t.ic.exit();
    const bench = enter(t, N2, B_LINES);
    expect(bench.placedCount()).toBe(0);
    expect(t.session.contentOf(Q09, 'treble-lines').slots.filter((s) => s.writtenPitch).length).toBe(1);
  });
});

/** 이 시험이 쓰는 판본이 모두 콘텐츠에 있는지(이름을 잘못 적어 다른 시험이 모두 같이 빠지는 일을 막는다) */
describe('시험이 쓰는 재료', () => {
  it('과제 다섯 개와 설치물 세 개가 모두 읽힌다', () => {
    const t = setup();
    for (const id of [Q01, Q09, Q10, Q11, Q12]) expect(t.catalog.get(id), id).toBeTruthy();
    expect(Object.keys(t.defs)).toEqual([N1, N2, N3]);
    const defs = [Q01, Q09, Q10, Q11, Q12].map(quest) as QuestDefinition[];
    expect(defs.map((d) => d.questId)).toEqual([Q01, Q09, Q10, Q11, Q12]);
  });
});
