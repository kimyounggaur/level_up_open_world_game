// 6-7 종나무(T4, 4.6)의 두뇌: 설치물 컨트롤러의 종나무 길(들어가기, 표지판, 눌러 걸기, 다리로 올라가는 모습, 지나가며 울리는 화음)과 작업대(BellBench: 손에 든 종, 종 자리, 걸기와 빼기, 종탑의 가로 자리 맞바꾸기와 소리 끄기, 빈터의 나무 건너뛰기, 듣는 방식).
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 종나무 계산 자체는 bells 시험이, 키 표는 bell-keys 시험이, 화면은 bell-hud 시험이, 월드 그림과 실제 걷기는 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bellMapOf, bellSlotOf } from '@/domain/bells';
import type { InstallationDef } from '@/domain/installation';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { HEAR_MODES, NO_BELL_NOTICE, NO_SOUNDING_BELL_NOTICE, TOWER_NO_HAND, TOWER_NO_REMOVE, TREE_NO_MUTE } from '@/ui/challenge/bellText';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { CHORD_PASS_SEC, FREE_KEY, FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q05 = 'chord.major-triad';
const Q06 = 'chord.inversion';
const Q20 = 'chord.major-and-minor';
const Q21 = 'chord.primary-triads';
const Q22 = 'chord.diminished-augmented';
const Q23 = 'chord.progression-walk';
const W1 = 'inst.bell-grove.three-bells';
const W2 = 'inst.bell-grove.bright-dark';
const W3 = 'inst.bell-grove.bell-tower';
const W4 = 'inst.bell-grove.three-pillars';
const C_MAJOR = `${Q05}/c-major`;
const C_FIRST = `${Q06}/c-first`;
const PILLARS = `${Q21}/c-major-pillars`;
const WALK = `${Q23}/c-major-walk`;

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
  const r = rig({ definitions: [Q05, Q06, Q20, Q22, Q21, Q23].map(quest), ...opts });
  const bridge = new WorldBridge({ x: 1900, y: 2700, facing: 'down' });
  const defs: Record<string, InstallationDef> = { [W1]: installation(W1), [W2]: installation(W2), [W3]: installation(W3), [W4]: installation(W4) };
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
    panels: new Set(['panel.chord']),
    opened: { mark: (id: string) => void opened.push(id) },
    frames,
  });
  ic.setNavigator((hash) => void navigated.push(hash));
  const view = (id: string): InstallationView => bridge.installationViews.get().find((v) => v.installationId === id)!;
  const bells = (id: string) => view(id).bells!;
  /** 나무·옥타브·열이 가리키는 고리 번호(1부터) */
  const ring = (id: string, tree: number, octave: number, column: number): number => bellSlotOf(bellMapOf(defs[id]!)!, tree, octave, column)!;
  const press = (id: string, slot: number): void => bridge.events.send({ type: 'slot-pressed', installationId: id, slot });
  const step = (id: string, slot: number, entered = false): void => bridge.events.send({ type: 'stepped', installationId: id, slot, ...(entered ? { entered: true as const } : {}) });
  return { ...r, bridge, defs, ic, frames, plays, opened, navigated, view, bells, ring, press, step };
}

type T = ReturnType<typeof setup>;

/** 정거장에 들어가 과제 판본을 고른다(고르지 않으면 자유로 놀기). 작업대를 돌려준다 */
function enter(t: T, station: 'W1' | 'W2' | 'W3' | 'W4', key?: string) {
  expect(t.ic.enter(station)).toBe(true);
  if (key) expect(t.ic.select(key)).toBe(true);
  return t.ic.bell!;
}

/** 지금 걸린 종들의 이름(초안 칸 차례) */
const hungNames = (t: T): string[] => t.ic.bell!.states().map((s) => s.name);

describe('들어가기와 표지판(4.6)', () => {
  it('W1~W4는 종나무다: 들어가면 자유로 놀기가 열리고 종나무 작업대가 생긴다(돌 작업대, 징검다리 작업대, 무대 작업대는 아니다)', () => {
    const t = setup();
    for (const code of ['W1', 'W2', 'W3', 'W4']) expect(t.ic.has(code), code).toBe(true);
    const w1 = t.defs[W1]!;
    expect(t.ic.isBell(w1)).toBe(true);
    expect(t.ic.isTimeline(w1)).toBe(false);
    expect(t.ic.isStage(w1)).toBe(false);
    expect(t.ic.bell).toBeNull(); // 들어가기 전에는 없다
    expect(t.ic.enter('W1')).toBe(true);
    expect(t.ic.state.get().mode).toEqual({ installationId: W1, stationId: 'W1' });
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.bell).toBe(t.ic.bellOf(w1));
    expect(t.ic.bell!.form).toBe('tree');
    expect(t.ic.timeline).toBeNull();
    expect(t.ic.stage).toBeNull();
    // 자유로 놀기는 과제가 아니다: '열어 봄'을 적지 않는다
    expect(t.opened).toEqual([]);
    // 다른 종류의 설치물에는 종나무 작업대가 없다
    expect(t.ic.bellOf(installation('inst.village.scale-stones'))).toBeNull();
    expect(t.ic.isBell(installation('inst.beat-river.first-ford'))).toBe(false);
  });

  it('작업대는 설치물마다 하나이고, 모양은 W1 나무, W3 종탑, W4 빈터다', () => {
    const t = setup();
    const forms = [W1, W2, W3, W4].map((id) => t.ic.bellOf(t.defs[id]!)!);
    expect(new Set(forms).size).toBe(4);
    expect(forms.map((b) => b.form)).toEqual(['tree', 'tree', 'tower', 'glade']);
    expect(forms.map((b) => b.trees)).toEqual([1, 1, 1, 3]);
    expect(t.ic.bellOf(t.defs[W1]!)).toBe(forms[0]); // 같은 설치물은 같은 작업대
  });

  it('들어왔을 때 알리는 말이 모양마다 다르다: 나무는 음이름과 변화표, 종탑은 가로 자리와 소리, 빈터는 나무 건너뛰기를 알린다', () => {
    const t = setup();
    t.ic.enter('W1');
    expect(t.controller.live).toContain('세 종 나무에 들어왔어요');
    for (const word of ['PageUp·PageDown', 'Shift+↑↓', 'Enter', 'Esc']) expect(t.controller.live, word).toContain(word);
    expect(t.controller.live).not.toContain('Shift+←→');
    t.ic.exit();
    t.ic.enter('W3');
    expect(t.controller.live).toContain('종탑에 들어왔어요');
    expect(t.controller.live).toContain('Shift+←→는 종의 가로 자리');
    expect(t.controller.live).toContain('X는 종 소리');
    t.ic.exit();
    t.ic.enter('W4');
    expect(t.controller.live).toContain('세 기둥 빈터에 들어왔어요');
    expect(t.controller.live).toContain('Shift+←→로 나무를 건너뛰어요');
  });

  it('표지판: 맨 위가 자유로 놀기이고 그 아래에 이 정거장의 과제 판본이 설계서 순서대로 있다', () => {
    const t = setup();
    const keys = (id: string): string[] => {
      const station = { [W1]: 'W1', [W2]: 'W2', [W3]: 'W3', [W4]: 'W4' }[id] as 'W1' | 'W2' | 'W3' | 'W4';
      t.ic.enter(station);
      const out = t.ic.signOf(t.defs[id]!).map((e) => e.key);
      t.ic.exit();
      return out;
    };
    expect(keys(W1)).toEqual([FREE_KEY, `${Q05}/c-major`, `${Q05}/f-major`, `${Q05}/g-major`]);
    expect(keys(W2)).toEqual([FREE_KEY, `${Q20}/c-minor`, `${Q20}/a-minor`, `${Q20}/d-minor`, `${Q20}/e-minor`, `${Q22}/b-dim`, `${Q22}/c-aug`]);
    expect(keys(W3)).toEqual([FREE_KEY, ...['c-first', 'c-second', 'f-first', 'f-second', 'g-first', 'g-second'].map((v) => `${Q06}/${v}`)]);
    expect(keys(W4)).toEqual([FREE_KEY, PILLARS, WALK]);
  });

  it('과제를 고르면 그 과제가 열리고 열어 봤다고 적는다. 종을 걸 수 있는 가지가 그 판본의 음역으로 좁아진다', () => {
    const t = setup();
    const bench = enter(t, 'W1');
    expect(bench.free).toBe(true);
    expect(bench.usable()).toEqual([2, 3, 4, 5]); // 자유로 놀기: 가지 전체
    expect(t.ic.select(C_MAJOR)).toBe(true);
    expect(t.controller.live).toContain('장3화음 조립하기');
    expect(t.opened).toEqual([Q05]);
    expect(bench.free).toBe(false);
    expect(bench.usable()).toEqual([4, 5]); // C4-B5
    expect(t.ic.state.get().targetKey).toBe(C_MAJOR);
  });

  it('나오면 모드가 풀리고 도전이 닫힌다. 걸어 둔 종은 보관되어 월드에 그대로 보이고, 다시 들어가면 손은 처음(C)으로 돌아가 있다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    t.press(W1, t.ring(W1, 0, 4, 0));
    bench.perform('letter-next');
    expect(bench.handName()).toBe('D');
    t.ic.exit();
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.controller.current).toBeNull();
    expect(t.bells(W1).bells.map((b) => b.name)).toEqual(['C4']);
    expect(t.bells(W1).cursor).toBeNull(); // 열려 있지 않으면 고른 자리가 없다
    t.ic.enter('W1');
    expect(t.ic.select(C_MAJOR)).toBe(true);
    expect(hungNames(t)).toEqual(['C4']);
    expect(bench.handName()).toBe('C');
    // 고른 자리는 보관된 초안에 남아 있어 다시 들어가면 놓았던 자리에서 이어 간다
    expect(bench.cursor).toBe(0);
  });
});

describe('나무에 종 걸기(W1, 구성음)', () => {
  it('빈 열의 가지를 누르면 손에 든 종이 그 가지에 걸린다: 고른 자리가 그 열이 되고 걸 가지가 그 단으로 옮겨 간다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    t.press(W1, t.ring(W1, 0, 4, 0));
    expect(t.controller.live).toBe('종 1: C4로 걸었어요.');
    expect(hungNames(t)).toEqual(['C4']);
    expect(bench.cursor).toBe(0);
    expect(bench.ring()).toBe(4);
    // 월드의 가지(단)는 위에서 아래 차례다: 쓸 수 있는 단도 그 차례로 올라간다
    expect(t.bells(W1)).toMatchObject({ form: 'tree', cursor: 0, cursorOctave: 4, usable: [5, 4] });
    expect(t.bells(W1).bells).toEqual([{ slot: t.ring(W1, 0, 4, 0), draft: 0, tree: 0, name: 'C4', midi: 60, muted: false, lowest: false, flagged: false, playing: false }]);
    // 고리 하나하나의 요약(지나가는 중의 소리와 점검이 읽는다): 걸린 고리만 이름과 높이를 갖고, 고른 열의 고른 단이 selected다
    const slots = t.view(W1).slots;
    expect(slots).toHaveLength(16);
    expect(slots.find((s) => s.name !== null)).toMatchObject({ slot: t.ring(W1, 0, 4, 0), name: 'C4', midi: 60, selected: true });
    expect(slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([t.ring(W1, 0, 4, 0)]);
    // 손에 든 종은 다른 음이어도 걸려 있는 종은 그대로다
    expect(bench.handName()).toBe('C');
  });

  it('손에 든 종은 음이름(PageUp·PageDown)과 변화표(Shift+↑↓)로 고른다. 고르면 그 소리를 들려 주고 끝에서는 멈추고 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    bench.perform('letter-next');
    expect(bench.handName()).toBe('D');
    expect(t.controller.live).toBe('손에 든 종은 D예요.');
    bench.perform('accidental-up');
    expect(bench.handName()).toBe('D♯');
    bench.perform('accidental-up');
    expect(t.controller.live).toContain('변화표를 더 올릴 수 없어요');
    expect(bench.handName()).toBe('D♯');
    bench.perform('accidental-down');
    bench.perform('accidental-down');
    expect(bench.handName()).toBe('D♭');
    for (let i = 0; i < 8; i++) bench.perform('letter-prev');
    expect(bench.handName()).toBe('C♭');
    expect(t.controller.live).toContain('맨 아래예요');
    bench.pickLetter('G');
    bench.pickAccidental(null);
    expect(bench.handName()).toBe('G');
    for (let i = 0; i < 8; i++) bench.perform('letter-next');
    expect(bench.handName()).toBe('B');
    expect(t.controller.live).toContain('맨 위예요');
  });

  it('← →로 종 자리를 옮기고, Enter로 손에 든 종을 그 자리의 가지에 건다. 끝에서는 멈추고 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    expect(bench.cursor).toBeNull();
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(0); // 아직 고르지 않았으면 첫 자리부터
    expect(t.controller.live).toBe('종 1, 비어 있어요. 걸 가지는 4옥타브예요.');
    bench.perform('cursor-left');
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toContain('첫 종 자리예요');
    bench.perform('letter-next'); // D
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(1);
    bench.perform('place');
    expect(t.controller.live).toBe('종 2: D4로 걸었어요.');
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(3);
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(3);
    expect(t.controller.live).toContain('마지막 종 자리예요');
    expect(hungNames(t)).toEqual(['D4']);
  });

  it('걸린 종에서 ↑ ↓는 그 종을 한 단 올리고 내린다. 걸린 종이 없는 자리에서는 종을 걸 가지만 옮긴다. 음역 밖으로는 가지 않고 이유를 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    bench.perform('cursor-right');
    // 빈 자리: 걸 가지만 옮긴다(4 → 5, 더 위는 없다)
    bench.perform('ring-up');
    expect(bench.ring()).toBe(5);
    expect(t.controller.live).toBe('종 1: 걸 가지는 5옥타브예요.');
    bench.perform('ring-up');
    expect(t.controller.live).toContain('걸 가지가 맨 위예요');
    expect(t.controller.live).toContain('4옥타브부터 5옥타브까지');
    expect(hungNames(t)).toEqual([]);
    bench.perform('place');
    expect(hungNames(t)).toEqual(['C5']);
    // 걸린 종: 올리고 내린다
    bench.perform('ring-down');
    expect(hungNames(t)).toEqual(['C4']);
    expect(t.controller.live).toBe('종 1: C4로 내렸어요.');
    bench.perform('ring-down');
    expect(hungNames(t)).toEqual(['C4']); // C3은 이 도전의 음역 밖
    expect(t.controller.live).toContain('음역');
  });

  it('걸린 가지를 다시 누르면 그 종을 고르고 울려 볼 뿐 바꾸지 않는다. 같은 열의 다른 가지를 누르면 그 열의 종이 옮겨 간다(음이름은 그대로)', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    t.press(W1, t.ring(W1, 0, 4, 0));
    const before = JSON.stringify(t.session.contentOf(Q05, 'c-major'));
    bench.perform('cursor-right'); // 종 2로 옮겨 가 있다가
    expect(bench.cursor).toBe(1);
    t.press(W1, t.ring(W1, 0, 4, 0)); // 걸린 가지를 다시 누른다
    expect(JSON.stringify(t.session.contentOf(Q05, 'c-major'))).toBe(before);
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toBe('종 1, C4가 걸려 있어요.');
    t.press(W1, t.ring(W1, 0, 5, 0)); // 같은 열의 위 가지
    expect(hungNames(t)).toEqual(['C5']);
    expect(t.controller.live).toBe('종 1: C5로 올렸어요.');
    expect(bench.ring()).toBe(5);
    t.press(W1, t.ring(W1, 0, 4, 0));
    expect(hungNames(t)).toEqual(['C4']);
    expect(t.controller.live).toBe('종 1: C4로 내렸어요.');
  });

  it('이 도전의 음역 밖 가지를 누르면 종을 걸지 않고 이유를 알린다(그 열은 고른다)', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    const before = JSON.stringify(t.session.contentOf(Q05, 'c-major'));
    t.press(W1, t.ring(W1, 0, 3, 2));
    expect(JSON.stringify(t.session.contentOf(Q05, 'c-major'))).toBe(before);
    expect(bench.cursor).toBe(2);
    expect(t.controller.live).toBe('3옥타브 가지는 이 도전에서 쓰지 않아요. 이 도전은 4옥타브부터 5옥타브까지 써요.');
    expect(t.bells(W1).usable).toEqual([5, 4]);
  });

  it('범위 밖의 고리 번호는 받지 않는다', () => {
    const t = setup();
    enter(t, 'W1', C_MAJOR);
    const before = JSON.stringify(t.session.contentOf(Q05, 'c-major'));
    for (const slot of [0, -1, 17, 1.5, Number.NaN]) t.press(W1, slot);
    expect(JSON.stringify(t.session.contentOf(Q05, 'c-major'))).toBe(before);
  });

  it('Backspace는 고른 자리의 종을 뺀다. 고른 자리가 없거나 비어 있으면 이유를 알린다. 실행 취소와 다시 실행이 된다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    bench.perform('remove');
    expect(t.controller.live).toBe('빼려면 먼저 종 자리를 골라 주세요.');
    t.press(W1, t.ring(W1, 0, 4, 1));
    expect(hungNames(t)).toEqual(['C4']);
    bench.perform('remove');
    expect(hungNames(t)).toEqual([]);
    expect(t.controller.live).toBe('종 2를 뺐어요.');
    bench.perform('remove');
    expect(t.controller.live).toBe('종 2는 이미 비어 있어요.');
    bench.perform('undo');
    expect(hungNames(t)).toEqual(['C4']);
    bench.perform('redo');
    expect(hungNames(t)).toEqual([]);
  });

  it('종을 걸 때마다 그 소리를 들려 준다(고른 가지의 높이로). 소리를 켜기 전에는 나지 않는다(W-11)', async () => {
    const t = setup();
    enter(t, 'W1', C_MAJOR);
    t.press(W1, t.ring(W1, 0, 4, 0));
    expect(t.engine.sinks.size).toBe(0);
    await t.controller.enableSound();
    t.engine.sinks.get('task')?.requests.splice(0);
    t.press(W1, t.ring(W1, 0, 5, 1)); // 빈 열의 위 가지: C5
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([72]);
    t.engine.sinks.get('task')!.requests.splice(0);
    t.press(W1, t.ring(W1, 0, 4, 1)); // 걸린 종을 아래 가지로: C4
    expect(t.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([60]);
  });

  it('C E G를 걸고 확인하면 통과한다. 하나가 틀리면 틀린 종에 표식(느낌표)이 서고, 고치면 표식이 사라진다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    const hang = (letter: 'C' | 'D' | 'E' | 'G', column: number): void => {
      bench.pickLetter(letter);
      bench.selectColumn(column);
      bench.perform('place');
    };
    hang('C', 0);
    hang('E', 1);
    hang('D', 2); // 틀린 음
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.bells(W1).bells.filter((b) => b.flagged).map((b) => b.name)).toEqual(['D4']);
    expect(bench.flagged()).toEqual([2]);
    // 고치면 판정이 지워져 표식도 사라진다
    hang('G', 2);
    expect(t.controller.feedback).toBeNull();
    expect(t.bells(W1).bells.every((b) => !b.flagged)).toBe(true);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.bells(W1).bells.map((b) => b.name)).toEqual(['C4', 'E4', 'G4']);
  });

  it('같은 음을 높이만 다르게 걸어도(옥타브 위) 구성음이므로 통과한다. 이름이 다르면(D♯과 E♭) 표기 조건에서 실패한다는 것은 W2에서 확인한다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    t.press(W1, t.ring(W1, 0, 5, 0)); // C5
    bench.pickLetter('E');
    t.press(W1, t.ring(W1, 0, 4, 1)); // E4
    bench.pickLetter('G');
    t.press(W1, t.ring(W1, 0, 5, 2)); // G5
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });
});

describe('밝은 종 어두운 종(W2, 표기)', () => {
  it('C E♭ G는 통과하고, 같은 소리를 D♯으로 적으면 소리는 같아도 표기 조건에서 실패한다', () => {
    const t = setup();
    const bench = enter(t, 'W2', `${Q20}/c-minor`);
    expect(bench.usable()).toEqual([4, 5]);
    const hang = (letter: 'C' | 'D' | 'E' | 'G', accidental: 'sharp' | 'flat' | null, column: number): void => {
      bench.pickLetter(letter);
      bench.pickAccidental(accidental);
      t.press(W2, t.ring(W2, 0, 4, column));
    };
    hang('C', null, 0);
    hang('D', 'sharp', 1);
    hang('G', null, 2);
    expect(hungNames(t)).toEqual(['C4', 'D♯4', 'G4']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback?.messages.join(' ')).toContain('소리 높이는 같지만 이름이 달라요');
    expect(bench.flagged()).toEqual([1]);
    // 걸린 종의 이름은 그 종을 고르고 손에 든 종을 다시 거는 것으로 바꾼다(걸린 가지를 누르는 것은 고르고 울려 보는 것이다)
    bench.selectColumn(1);
    bench.pickLetter('E');
    bench.pickAccidental('flat');
    bench.perform('place');
    expect(hungNames(t)).toEqual(['C4', 'E♭4', 'G4']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('줄어든 종(Q22)도 같은 작업대에서 건다: B D F는 구성음이라서 같은 단에 걸어도 통과한다', () => {
    const t = setup();
    const bench = enter(t, 'W2', `${Q22}/b-dim`);
    for (const [letter, column] of [['B', 0], ['D', 1], ['F', 2]] as const) {
      bench.pickLetter(letter);
      t.press(W2, t.ring(W2, 0, 4, column));
    }
    expect(hungNames(t)).toEqual(['B4', 'D4', 'F4']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true); // 판정은 구성음(음급·표기·개수)만 본다. 가로 자리와 단의 순서는 보지 않는다
  });
});

describe('종탑(W3, 전위): 가로 순서만 바꾸면 전위가 그대로다', () => {
  it('종 세 개가 기본 위치(C3 E3 G3)로 걸린 채 시작한다. 자유로 놀기도 같다. 가장 낮은 종은 맨 왼쪽(종 1)이다', () => {
    const t = setup();
    const bench = enter(t, 'W3');
    expect(bench.states().map((s) => [s.draft, s.name, s.lowest, s.muted])).toEqual([
      [0, 'C3', true, false],
      [1, 'E3', false, false],
      [2, 'G3', false, false],
    ]);
    expect(t.bells(W3).bells.map((b) => [b.slot, b.name])).toEqual([
      [t.ring(W3, 0, 3, 0), 'C3'],
      [t.ring(W3, 0, 3, 1), 'E3'],
      [t.ring(W3, 0, 3, 2), 'G3'],
    ]);
    t.ic.select(C_FIRST);
    expect(bench.states().map((s) => s.name)).toEqual(['C3', 'E3', 'G3']);
    expect(bench.usable()).toEqual([2, 3, 4, 5]); // C2-B5
  });

  it('종탑의 종은 뺄 수 없고, 손에 든 종이 없다(음이름과 변화표 키는 알리기만 한다). 나무의 종과 달리 가지(고리)만 누를 수 있다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('remove');
    expect(t.controller.live).toBe(TOWER_NO_REMOVE);
    for (const action of ['letter-next', 'letter-prev', 'accidental-up', 'accidental-down'] as const) {
      bench.perform(action);
      expect(t.controller.live, action).toBe(TOWER_NO_HAND);
    }
    expect(hungNames(t)).toEqual(['C3', 'E3', 'G3']);
    expect(bench.handName()).toBe('C'); // 손은 그대로다
  });

  it('↑로 종 1(C3)을 한 옥타브 올리면 가장 낮은 종이 E3이 되어 제1전위가 되고 통과한다. 알림이 가장 낮은 음을 말한다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback?.messages[0]).toBe('현재 가장 낮은 음은 C3이에요. 그래서 기본 위치예요. 목표는 제1전위예요.');
    bench.perform('cursor-right');
    expect(t.controller.live).toBe('종 1, C3이에요. 가장 낮게 울리는 종이에요.');
    bench.perform('ring-up');
    expect(hungNames(t)).toEqual(['C4', 'E3', 'G3']);
    expect(t.controller.live).toBe('종 1: C4로 올렸어요. 가장 낮은 음은 E3이에요.');
    expect(bench.states().find((s) => s.lowest)?.name).toBe('E3');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('가로 자리를 바꿔도(Shift+← →) 전위는 그대로다: 같은 음을 서로 옆 자리로 옮길 뿐이라 판정이 같고, 모든 순서에서 가장 낮은 음이 같다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('cursor-right'); // 종 1
    const messages = (): string[] => t.controller.feedback?.messages ?? [];
    bench.perform('check');
    const reference = { passed: t.controller.feedback?.passed, messages: messages() };
    expect(reference.passed).toBe(false);
    const orders = new Set<string>();
    // 종 하나를 오른쪽 끝까지, 왼쪽 끝까지 끌고 다니며 모든 가로 순서를 만든다
    const walk = (action: 'swap-right' | 'swap-left'): void => {
      bench.perform(action);
      orders.add(bench.states().map((s) => s.name).join(' '));
      bench.perform('check');
      expect({ passed: t.controller.feedback?.passed, messages: messages() }, `${action} 뒤`).toEqual(reference);
      expect(bench.states().find((s) => s.lowest)?.name, `${action} 뒤 가장 낮은 종`).toBe('C3');
    };
    walk('swap-right');
    walk('swap-right');
    expect(bench.cursor).toBe(2); // 고른 자리는 종을 따라간다
    walk('swap-left');
    walk('swap-left');
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    walk('swap-left');
    walk('swap-left');
    expect(orders.size).toBeGreaterThanOrEqual(3);
    // 소리의 모양도 같다: 같은 음의 모임이다
    expect([...bench.states().map((s) => s.midi)].sort((a, b) => a - b)).toEqual([48, 52, 55]);
  });

  it('통과한 모양에서도 가로 순서를 바꾸면 계속 통과한다(제1전위 → 순서만 바꿈 → 제1전위)', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('cursor-right');
    bench.perform('ring-up'); // C4 E3 G3: 제1전위
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    bench.perform('swap-right'); // 종 1(C4)이 가운데로
    expect(hungNames(t)).toEqual(['E3', 'C4', 'G3']);
    expect(t.controller.live).toContain('가장 낮은 음은 그대로 E3이에요');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    bench.perform('swap-right');
    expect(hungNames(t)).toEqual(['E3', 'G3', 'C4']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('맨 끝에서 더 밀면 자리를 바꾸지 않고 이유를 알린다. 고른 종이 없으면 먼저 고르라고 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('swap-right');
    expect(t.controller.live).toBe('먼저 종을 골라 주세요.');
    bench.perform('cursor-right');
    bench.perform('swap-left');
    expect(hungNames(t)).toEqual(['C3', 'E3', 'G3']);
    expect(t.controller.live).toContain('종');
    bench.perform('swap-right');
    bench.perform('swap-right');
    const after = hungNames(t);
    bench.perform('swap-right');
    expect(hungNames(t)).toEqual(after);
  });

  it('X는 고른 종의 소리를 끄고 켠다. 끈 종은 월드에 muted로 올라가고 가장 낮은 종 계산과 듣기에서 빠진다. 나무에서는 쓰지 않는다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('mute');
    expect(t.controller.live).toBe('먼저 종을 골라 주세요.');
    bench.perform('cursor-right');
    bench.perform('mute');
    expect(t.controller.live).toBe('종 1: 소리를 껐어요. 가장 낮은 음은 E3이에요.');
    expect(t.bells(W3).bells.map((b) => [b.name, b.muted, b.lowest])).toEqual([
      ['C3', true, false],
      ['E3', false, true],
      ['G3', false, false],
    ]);
    // 한 번 더 누르면 다시 켠다
    bench.perform('mute');
    expect(t.controller.live).toBe('종 1: 소리를 켰어요. 가장 낮은 음은 C3이에요.');
    expect(t.bells(W3).bells.every((b) => !b.muted)).toBe(true);
    t.ic.exit();
    const treeBench = enter(t, 'W1', C_MAJOR);
    treeBench.perform('mute');
    expect(t.controller.live).toBe(TREE_NO_MUTE);
  });

  it('종 둘레의 가지를 누르면 그 종이 그 높이로 옮겨 간다(음이름은 그대로)', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    t.press(W3, t.ring(W3, 0, 4, 0)); // 종 1: C3 → C4
    expect(hungNames(t)).toEqual(['C4', 'E3', 'G3']);
    expect(bench.cursor).toBe(0);
    t.press(W3, t.ring(W3, 0, 4, 0)); // 같은 가지를 다시: 바뀌지 않는다
    expect(hungNames(t)).toEqual(['C4', 'E3', 'G3']);
    t.press(W3, t.ring(W3, 0, 3, 0)); // 다시 3옥타브 가지로 내린다
    expect(hungNames(t)).toEqual(['C3', 'E3', 'G3']);
    // 종탑의 빈 가지는 종을 만들지 않는다(종은 늘 세 개다)
    expect(bench.hungCount()).toBe(3);
  });

  it('Enter는 고른 종을 울려 본다(걸지 않는다). 고른 종이 없으면 종 1을 고른다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    const before = JSON.stringify(t.session.contentOf(Q06, 'c-first'));
    bench.perform('place');
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toBe('종 1, C3이에요. 가장 낮게 울리는 종이에요.');
    bench.perform('cursor-right');
    bench.perform('place');
    expect(t.controller.live).toBe('종 2, E3이에요. 소리가 켜져 있어요.');
    expect(JSON.stringify(t.session.contentOf(Q06, 'c-first'))).toBe(before);
  });
});

describe('빈터(W4, 화음 사건 목록)', () => {
  const hangTree = (t: T, bench: ReturnType<typeof enter>, tree: number, notes: ReadonlyArray<readonly ['C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number]>): void => {
    notes.forEach(([letter, octave], column) => {
      bench.pickLetter(letter);
      t.press(W4, t.ring(W4, tree, octave, column));
    });
  };

  it('나무 세 그루, 한 나무에 종 자리 넷이다. 종 이름은 나무와 열을 말한다. Shift+← →로 나무를 건너뛰면 같은 열 번호가 그대로다', () => {
    const t = setup();
    const bench = enter(t, 'W4', PILLARS);
    expect(bench.trees).toBe(3);
    expect(t.view(W4).slots).toHaveLength(48);
    expect(bench.labelOf(0)).toBe('첫째 나무의 1번째 종');
    expect(bench.labelOf(6)).toBe('둘째 나무의 3번째 종');
    expect(bench.labelOf(11)).toBe('셋째 나무의 4번째 종');
    bench.perform('tree-next'); // 아직 고르지 않았으면 첫 나무의 첫 종 자리
    expect(bench.cursor).toBe(0);
    bench.perform('cursor-right');
    bench.perform('cursor-right'); // 종 3
    bench.perform('tree-next');
    expect(bench.cursor).toBe(6);
    expect(bench.cursorTree).toBe(1);
    expect(t.controller.live).toBe('둘째 나무의 3번째 종, 비어 있어요. 걸 가지는 4옥타브예요.');
    bench.perform('tree-next');
    bench.perform('tree-next');
    expect(bench.cursor).toBe(10);
    expect(t.controller.live).toContain('마지막 나무예요');
    bench.perform('tree-prev');
    bench.perform('tree-prev');
    bench.perform('tree-prev');
    expect(bench.cursor).toBe(2);
    expect(t.controller.live).toContain('첫째 나무예요');
  });

  it('고른 자리는 그 나무에서 월드로 올라간다(카메라가 고른 나무를 따라간다): cursor가 나무와 열의 초안 칸 번호다', () => {
    const t = setup();
    const bench = enter(t, 'W4', PILLARS);
    bench.selectColumn(5);
    expect(t.bells(W4).cursor).toBe(5);
    expect(bench.cursorTree).toBe(1);
    // 걸린 종이 없는 자리에서는 종을 걸 가지의 칸이 selected다(월드가 그 칸에 고른 표시를 그린다)
    expect(t.view(W4).slots.filter((s) => s.selected).map((s) => s.slot)).toEqual([t.ring(W4, 1, 4, 1)]);
  });

  it('Q21: 세 나무에 C E G, F A C, G B D를 걸고 확인하면 통과한다. 나무를 바꿔 걸면(첫 나무와 둘째 나무의 화음을 맞바꾸면) 실패한다', () => {
    const t = setup();
    const bench = enter(t, 'W4', PILLARS);
    hangTree(t, bench, 0, [['C', 4], ['E', 4], ['G', 4]]);
    hangTree(t, bench, 1, [['F', 4], ['A', 4], ['C', 5]]);
    hangTree(t, bench, 2, [['G', 4], ['B', 4], ['D', 5]]);
    expect(bench.hungCount()).toBe(9);
    expect(t.bells(W4).bells.filter((b) => b.tree === 1).map((b) => b.name)).toEqual(['F4', 'A4', 'C5']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    // 첫 나무와 둘째 나무의 화음이 바뀌었다
    t.ic.select(WALK);
    expect(t.ic.select(PILLARS)).toBe(true);
    bench.selectColumn(0);
    bench.pickLetter('F');
    bench.perform('place');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback?.messages.join(' ')).toContain('으뜸화음 나무');
    expect(bench.flagged()).toContain(0);
  });

  it('Q23: 으뜸 → 버금딸림 → 딸림 → 으뜸. 세 나무에 걸면 처음과 마지막 으뜸화음이 같은 나무라 한 번 걸고 통과한다', () => {
    const t = setup();
    const bench = enter(t, 'W4', WALK);
    hangTree(t, bench, 0, [['C', 4], ['E', 4], ['G', 4]]);
    hangTree(t, bench, 1, [['F', 4], ['A', 4], ['C', 5]]);
    hangTree(t, bench, 2, [['G', 4], ['B', 4], ['D', 5]]);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    // 전위는 알려 주기만 한다: 으뜸화음을 제1전위로 바꿔 걸어도 통과한다(C5 E4 G4는 E4가 가장 낮은 제1전위)
    bench.selectColumn(0);
    bench.pickLetter('C');
    t.press(W4, t.ring(W4, 0, 5, 0));
    expect(t.bells(W4).bells.find((b) => b.draft === 0)?.name).toBe('C5');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('내 화음 이어 듣기(P): 걸린 종이 없으면 이유를 알리고, 걸려 있으면 길의 차례대로 들려 준다. 듣는 동안 울리는 종이 월드에 playing으로 올라간다', () => {
    const t = setup();
    const bench = enter(t, 'W4', PILLARS);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBe(NO_BELL_NOTICE);
    hangTree(t, bench, 0, [['C', 4], ['E', 4], ['G', 4]]);
    hangTree(t, bench, 1, [['F', 4], ['A', 4], ['C', 5]]);
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    expect(t.bells(W4).bells.filter((b) => b.playing).map((b) => b.tree)).toEqual([0, 0, 0]); // 첫 화음이 울리는 동안
    t.run(3); // 한 화음은 온음표(80박에서 3초)다: 둘째 화음이 울릴 때
    t.frames.tick();
    const later = t.bells(W4).bells.filter((b) => b.playing).map((b) => b.tree);
    expect(later).toEqual([1, 1, 1]); // 다음 화음은 둘째 나무
    bench.perform('stop');
    t.frames.tick();
    expect(t.controller.playing).toBeNull();
    expect(t.bells(W4).bells.every((b) => !b.playing)).toBe(true);
  });

  it('Shift+P는 고른 나무의 화음만 들려 준다. 걸린 종이 없는 나무는 이유를 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W4', PILLARS);
    hangTree(t, bench, 0, [['C', 4], ['E', 4], ['G', 4]]);
    bench.selectColumn(4); // 둘째 나무
    bench.perform('hear-tree');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBe('둘째 나무에는 아직 걸린 종이 없어요.');
    bench.selectColumn(1); // 첫째 나무
    bench.perform('hear-tree');
    expect(t.controller.playing).toBe('mine');
    expect(t.controller.notice).toBeNull();
  });

  it('듣는 방식은 R로 함께 → 아래부터 차례로 → 가장 낮은 종만 → 함께로 돈다. 고르는 즉시 그 방식으로 들려 준다', () => {
    const t = setup();
    const bench = enter(t, 'W1', C_MAJOR);
    expect(HEAR_MODES.map((m) => m.mode)).toEqual(['together', 'ascending', 'lowest']);
    for (const [letter, column] of [['C', 0], ['E', 1], ['G', 2]] as const) {
      bench.pickLetter(letter);
      t.press(W1, t.ring(W1, 0, 4, column));
    }
    expect(bench.mode).toBe('together');
    bench.perform('mode-next');
    expect(bench.mode).toBe('ascending');
    expect(t.controller.playing).toBe('mine');
    expect(t.controller.live).toBe('듣는 방식: 아래부터 차례로.');
    bench.perform('mode-next');
    expect(bench.mode).toBe('lowest');
    bench.perform('mode-next');
    expect(bench.mode).toBe('together');
    bench.setMode('lowest');
    expect(bench.mode).toBe('lowest');
  });

  it('소리가 켜진 종이 없는 종탑은 듣기에서 이유를 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    for (let draft = 0; draft < 3; draft++) {
      bench.selectColumn(draft);
      bench.perform('mute');
    }
    bench.perform('hear-mine');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBe(NO_SOUNDING_BELL_NOTICE);
  });
});

describe('지나가며 울리는 화음(4.6: 차례로 지나가면 화음이 순서대로 울린다)', () => {
  /** 빈터를 한 번 설정해 두고 나온 뒤(걷는 중) 지나간다 */
  function hungGlade(t: T): void {
    const bench = enter(t, 'W4', PILLARS);
    const hang = (tree: number, notes: ReadonlyArray<readonly [string, number]>): void => {
      notes.forEach(([letter, octave], column) => {
        bench.pickLetter(letter as 'C');
        t.press(W4, t.ring(W4, tree, octave, column));
      });
    };
    hang(0, [['C', 4], ['E', 4], ['G', 4]]);
    hang(2, [['G', 4], ['B', 4], ['D', 5]]);
    t.ic.exit();
    t.plays.length = 0;
  }

  it('걸어서 나무에 올라서면 그 나무에 걸린 종들이 함께 울린다(1초, 돌 하나의 소리보다 여리게). 같은 나무 안에서 옮겨 밟을 때는 다시 울리지 않는다', () => {
    const t = setup();
    hungGlade(t);
    t.step(W4, t.ring(W4, 0, 4, 0), true);
    expect(t.plays.map((p) => p.midi).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    expect(t.plays.every((p) => p.sec === CHORD_PASS_SEC && p.velocity !== undefined && p.velocity < 0.7)).toBe(true);
    expect(CHORD_PASS_SEC).toBe(1);
    t.plays.length = 0;
    t.step(W4, t.ring(W4, 0, 4, 1)); // 같은 나무 안에서 옆 칸
    t.step(W4, t.ring(W4, 0, 5, 3)); // 같은 나무 안에서 다른 단
    expect(t.plays).toEqual([]);
  });

  it('다른 나무로 건너가면 그 나무의 화음이 울린다. 걸린 종이 없는 나무는 조용하다', () => {
    const t = setup();
    hungGlade(t);
    t.step(W4, t.ring(W4, 0, 4, 0), true);
    t.plays.length = 0;
    t.step(W4, t.ring(W4, 1, 4, 0), true); // 둘째 나무: 비어 있다
    expect(t.plays).toEqual([]);
    t.step(W4, t.ring(W4, 2, 4, 1), true); // 셋째 나무
    expect(t.plays.map((p) => p.midi).sort((a, b) => a - b)).toEqual([67, 71, 74]);
  });

  it('나무를 벗어났다가 다시 올라서면(entered) 같은 나무여도 다시 울린다. 나무 안에서 옮겨 밟기(entered 없음)는 마지막으로 올라선 나무가 같으면 조용하다', () => {
    const t = setup();
    hungGlade(t);
    t.step(W4, t.ring(W4, 0, 4, 0), true);
    t.plays.length = 0;
    t.step(W4, t.ring(W4, 0, 4, 0), true); // 나갔다 다시 올라섰다
    expect(t.plays).toHaveLength(3);
    t.plays.length = 0;
    // entered가 없어도 마지막으로 올라선 나무와 다른 나무면 울린다(월드가 빠뜨려도 길이 이어진다)
    t.step(W4, t.ring(W4, 2, 4, 0));
    expect(t.plays).toHaveLength(3);
  });

  it('작업대에 들어가 있는 동안에는 걷지 않으므로 밟기 사건을 받지 않는다', () => {
    const t = setup();
    const bench = enter(t, 'W4', PILLARS);
    bench.pickLetter('C');
    t.press(W4, t.ring(W4, 0, 4, 0));
    t.plays.length = 0;
    t.step(W4, t.ring(W4, 0, 4, 0), true);
    expect(t.plays).toEqual([]);
  });

  it('소리를 끈 종은 울리지 않는다(종탑). 걸려 있지 않은 나무, 알 수 없는 설치물, 범위 밖 고리는 조용하다', () => {
    const t = setup();
    const bench = enter(t, 'W3', C_FIRST);
    bench.perform('cursor-right');
    bench.perform('mute'); // 종 1(C3) 끔
    t.ic.exit();
    t.plays.length = 0;
    t.step(W3, t.ring(W3, 0, 3, 0), true);
    expect(t.plays.map((p) => p.midi).sort((a, b) => a - b)).toEqual([52, 55]);
    t.plays.length = 0;
    t.step('inst.nowhere', 1, true);
    t.step(W3, 999, true);
    expect(t.plays).toEqual([]);
  });

  it('종나무가 아닌 설치물을 밟는 소리(돌 하나의 음)는 그대로다', () => {
    const t = setup();
    const stones = installation('inst.village.scale-stones');
    const ic = new InstallationController({
      bridge: t.bridge,
      map,
      catalog: t.catalog,
      session: t.session,
      controller: t.controller,
      bench: t.bench,
      mixer: { playWorldNote: (midi: number, sec?: number) => void t.plays.push({ midi, sec, velocity: undefined }) },
      installations: [stones],
      panels: new Set(['panel.chord']),
      opened: { mark: () => undefined },
      frames: t.frames,
    });
    t.bridge.events.send({ type: 'stepped', installationId: stones.installationId, slot: 1, entered: true });
    // 돌의 음이 걸려 있지 않으면 조용하고, 종나무의 1초 화음은 아니다
    expect(t.plays.every((p) => p.sec !== CHORD_PASS_SEC)).toBe(true);
    ic.dispose();
  });
});

describe('자유로 놀기와 패널로 보기', () => {
  it('자유로 놀기에는 목표와 판정이 없다: 확인과 목표 듣기는 안내만 하고, 패널로 보기는 갈 곳이 없다는 것을 알린다', () => {
    const t = setup();
    const bench = enter(t, 'W1');
    bench.perform('check');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_CHECK);
    bench.perform('hear-target');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_TARGET);
    expect(t.ic.performBell('view-panel')).toBeNull();
    expect(t.controller.live).toBe(FREE_PLAY_NO_PANEL);
    // 자유로 놀 때도 종은 걸린다(가지 전체)
    t.press(W1, t.ring(W1, 0, 2, 0));
    expect(hungNames(t)).toEqual(['C2']);
    expect(t.bells(W1).usable).toEqual([5, 4, 3, 2]);
  });

  it('과제를 고르면 패널로 보기가 그 판본의 주소를 알려 준다. 키 지도의 도움과 나가기는 컨트롤러가 이어 준다', () => {
    const t = setup();
    enter(t, 'W1');
    expect(t.ic.state.get().helpOpen).toBe(false);
    expect(t.ic.performBell('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(true);
    expect(t.ic.performBell('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.select(C_MAJOR);
    expect(t.ic.performBell('view-panel')).toEqual({ navigate: `#/q/${Q05}/c-major` });
    expect(t.ic.performBell('exit')).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
    // 들어가 있지 않으면 아무것도 하지 않는다
    expect(t.ic.performBell('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
  });

  it('판의 모양은 판정기 종류가 정한다: 도전이 바뀌면 손(C)과 걸 가지와 듣는 방식이 처음으로 돌아간다', () => {
    const t = setup();
    const bench = enter(t, 'W2', `${Q20}/c-minor`);
    bench.pickLetter('E');
    bench.pickAccidental('flat');
    bench.perform('cursor-right');
    bench.perform('ring-up');
    bench.setMode('lowest');
    expect(bench.handName()).toBe('E♭');
    expect(bench.ring()).toBe(5);
    expect(bench.mode).toBe('lowest');
    t.ic.select(`${Q22}/c-aug`);
    expect(bench.handName()).toBe('C');
    expect(bench.ring()).toBe(4);
    expect(bench.mode).toBe('together');
  });
});
