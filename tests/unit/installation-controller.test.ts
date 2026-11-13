// 4.2 설치물 모드의 두뇌: 들어가기와 나가기, 표지판, 돌의 모습(다리로 올라가는 값), 눌러 놓기, 밟기 소리, 패널을 다녀오기, 듣는 동안 따라가는 돌.
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 월드 쪽은 world-runtime·world-camera 시험이, 화면은 installation-hud 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STEP_NOTE_SEC } from '@/domain/slotmap';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { FREE_KEY, FREE_PLAY_LABEL, FREE_PLAY_NO_PANEL, InstallationController, NO_PANEL_YET } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { Q01, Q02, Q07, installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));
const FREE_QUEST = 'free.inst.village.scale-stones';

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
  /** 예약된 프레임 함수를 한 번씩 부른다(부르는 동안 새로 예약된 것은 다음 tick에서) */
  tick(): void {
    const run = [...this.pending.values()];
    this.pending.clear();
    for (const fn of run) fn();
  }
}

function setup(opts: RigOptions & { panels?: string[] } = {}) {
  const { panels, ...rigOptions } = opts;
  const r = rig(rigOptions);
  const bridge = new WorldBridge({ x: 4530, y: 3655, facing: 'right' });
  const inst = installation();
  const frames = new FakeFrames();
  const stepped: Array<{ midi: number; sec: number | undefined }> = [];
  const opened: string[] = [];
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: (midi, sec) => void stepped.push({ midi, sec }) },
    installations: [inst],
    panels: new Set(panels ?? ['panel.scale']),
    opened: { mark: (id) => void opened.push(id) },
    frames,
  });
  const slots = (): InstallationView['slots'] => bridge.installationViews.get().find((v) => v.installationId === inst.installationId)!.slots;
  const press = (slot: number): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot });
  const step = (slot: number): void => bridge.events.send({ type: 'stepped', installationId: inst.installationId, slot });
  return { ...r, bridge, inst, ic, frames, stepped, opened, slots, press, step };
}

describe('들어가기와 나가기(4.2)', () => {
  it('H4에는 설치물이 있고 다른 정거장에는 없다', () => {
    const t = setup();
    expect(t.ic.has('H4')).toBe(true);
    expect(t.ic.has('H1')).toBe(false);
    expect(t.ic.active).toBeNull();
    expect(t.ic.state.get()).toEqual({ mode: null, targetKey: FREE_KEY, helpOpen: false });
  });

  it('들어가면 설치물 모드가 켜지고 자유로 놀기가 열린다. 들어왔다고 알린다', () => {
    const t = setup();
    expect(t.ic.enter('H4')).toBe(true);
    const mode = { installationId: 'inst.village.scale-stones', stationId: 'H4' };
    expect(t.ic.state.get().mode).toEqual(mode);
    expect(t.bridge.installationMode.get()).toEqual(mode);
    expect(t.ic.active).toBe(t.inst);
    expect(t.controller.current?.entry.questId).toBe(FREE_QUEST);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.targetLabel(t.inst)).toBe(FREE_PLAY_LABEL);
    expect(t.controller.live).toContain('음계 디딤돌에 들어왔어요');
    expect(t.controller.live).toContain('H');
    expect(t.controller.live).toContain('Esc');
  });

  it('설치물이 없는 정거장에는 들어가지 않는다', () => {
    const t = setup();
    expect(t.ic.enter('H1')).toBe(false);
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.bridge.installationMode.get()).toBeNull();
    expect(t.controller.current).toBeNull();
  });

  it('열 수 있는 도전이 하나도 없으면(틀로 삼을 과제가 목록에 없으면) 모드만 켜 두지 않고 들어가지 않는다', () => {
    const t = setup({ definitions: [quest(Q01), quest(Q02)] });
    expect(t.ic.enter('H4')).toBe(false);
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.bridge.installationMode.get()).toBeNull();
  });

  it('이미 들어가 있으면 다시 들어가도 그대로다(놓은 것은 남는다)', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.perform('place');
    t.ic.enter('H4');
    expect(t.slots()[0]!.name).toBe('C4');
    expect(t.ic.state.get().mode?.stationId).toBe('H4');
  });

  it('나오면 모드와 가려진 높이가 풀리고, 우리가 연 도전은 닫히고, 나왔다고 알린다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.bridge.bottomInset.set(280);
    t.ic.toggleHelp();
    t.ic.exit();
    expect(t.ic.state.get()).toEqual({ mode: null, targetKey: FREE_KEY, helpOpen: false });
    expect(t.bridge.installationMode.get()).toBeNull();
    expect(t.bridge.bottomInset.get()).toBe(0);
    expect(t.controller.current).toBeNull();
    expect(t.controller.live).toContain('음계 디딤돌에서 나왔어요');
    expect(t.controller.live).toContain('그대로 보관돼요');
  });

  it('나와도 놓은 것은 남아 있고, 다시 들어가면 그대로 돌 위에 있다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.perform('place');
    t.ic.perform('hand-up');
    t.ic.perform('cursor-right');
    t.ic.perform('place');
    t.ic.exit();
    expect(t.slots().slice(0, 3).map((s) => s.name)).toEqual(['C4', 'D4', null]);
    t.ic.enter('H4');
    expect(t.slots().slice(0, 3).map((s) => s.name)).toEqual(['C4', 'D4', null]);
  });

  it('모드가 아닐 때 나가기는 아무 일도 하지 않는다', () => {
    const t = setup();
    t.ic.exit();
    expect(t.controller.live).toBe('');
    expect(t.controller.current).toBeNull();
  });

  it('다른 도전이 열려 있을 때(패널을 다녀온 뒤) 나와도 그 도전은 닫지 않는다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.controller.open(Q01, 'middle-c');
    t.ic.exit();
    expect(t.controller.current?.entry.questId).toBe(Q01);
  });

  it('나가면 듣던 소리가 멈춘다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.perform('place');
    t.ic.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    t.ic.exit();
    expect(t.controller.playing).toBeNull();
  });

  it('도움 카드는 H로 열고 닫고, 나가면 닫힌다. 모드가 아닐 때는 열리지 않는다', () => {
    const t = setup();
    t.ic.toggleHelp();
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.enter('H4');
    t.ic.perform('help');
    expect(t.ic.state.get().helpOpen).toBe(true);
    t.ic.perform('help');
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.toggleHelp();
    t.ic.exit();
    expect(t.ic.state.get().helpOpen).toBe(false);
  });

  it('Esc(나가기)와 같은 동작으로 나온다', () => {
    const t = setup();
    t.ic.enter('H4');
    expect(t.ic.perform('exit')).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
  });
});

describe('표지판(4.2): 이 정거장의 과제와 판본이 모두 보인다', () => {
  it('맨 위는 자유로 놀기이고, 이 설치물이 다루는 판본(C장조, F장조)만 있다. 둘 다 고를 수 있다', () => {
    const t = setup();
    t.ic.enter('H4');
    const sign = t.ic.signOf(t.inst);
    expect(sign.map((e) => e.key)).toEqual(['free', 'scale.major/c-major', 'scale.major/f-major']);
    expect(sign.map((e) => e.label)).toEqual(['자유로 놀기', '장음계 배열하기 · C장조', '장음계 배열하기 · F장조']);
    expect(sign.map((e) => e.selectable)).toEqual([true, true, true]);
    expect(sign.map((e) => e.selected)).toEqual([true, false, false]);
    // 미리보기 채널에서는 검수 전 표지가 붙는다
    expect(sign.map((e) => e.badge)).toEqual([null, '검수 전', '검수 전']);
    // 이 설치물에 놓이지 않은 판본(G, D, B♭장조)은 이 표지판에 없다
    expect(sign.some((e) => /G장조|D장조|B♭/.test(e.label))).toBe(false);
  });

  it('과제를 고르면 그 도전이 열리고, 열어 본 과제로 기록되고, 열었다고 알린다', () => {
    const t = setup();
    t.ic.enter('H4');
    expect(t.ic.select('scale.major/f-major')).toBe(true);
    expect(t.controller.current?.entry.questId).toBe(Q07);
    expect(t.controller.current?.variant.variantId).toBe('f-major');
    expect(t.controller.current?.free).toBeFalsy();
    expect(t.ic.state.get().targetKey).toBe('scale.major/f-major');
    expect(t.ic.targetLabel(t.inst)).toBe('장음계 배열하기 · F장조');
    expect(t.opened).toEqual([Q07]);
    expect(t.controller.live).toBe('장음계 배열하기 · F장조를 열었어요.');
    expect(t.ic.signOf(t.inst).map((e) => e.selected)).toEqual([false, false, true]);
  });

  it('자유로 놀기로 돌아올 수 있고, 돌아오면 자유로 놀기를 골랐다고 알린다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    expect(t.ic.select(FREE_KEY)).toBe(true);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.live).toContain('자유로 놀기');
    expect(t.controller.live).toContain('판정 없이');
  });

  it('같은 것을 다시 골라도 그대로다(초안이 지워지지 않는다)', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    t.ic.perform('place');
    expect(t.ic.select('scale.major/c-major')).toBe(true);
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('도전마다 초안이 따로다: 자유로 놀기와 C장조 초안이 섞이지 않고, 돌아오면 그대로 있다(W-12)', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.perform('place'); // 자유로 놀기의 1번 자리
    expect(t.slots()[0]!.name).toBe('C4');
    t.ic.select('scale.major/c-major');
    expect(t.slots().every((s) => s.name === null)).toBe(true);
    t.ic.select(FREE_KEY);
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('릴리스 채널에서는 과제 판본이 준비 중이라 고를 수 없고, 자물쇠 표시는 없다(W-10)', () => {
    const t = setup({ channel: 'release' });
    expect(t.ic.enter('H4')).toBe(true); // 자유로 놀기는 공개 상태와 상관없이 열린다
    const sign = t.ic.signOf(t.inst);
    expect(sign.map((e) => e.selectable)).toEqual([true, false, false]);
    expect(sign.slice(1).map((e) => e.badge)).toEqual(['준비 중', '준비 중']);
    expect(sign.slice(1).every((e) => e.note !== null && e.note.length > 0)).toBe(true);
    expect(JSON.stringify(sign)).not.toMatch(/자물쇠|🔒|잠김|잠겨|잠금/);
    expect(t.ic.select('scale.major/c-major')).toBe(false);
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.current?.free).toBe(true);
  });

  it('모드 밖에서, 또는 없는 키는 고를 수 없다', () => {
    const t = setup();
    expect(t.ic.select('scale.major/c-major')).toBe(false);
    t.ic.enter('H4');
    expect(t.ic.select('no.such/key')).toBe(false);
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
  });

  it('나갔다 다시 들어오면 고른 것을 기억한다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/f-major');
    t.ic.exit();
    t.ic.enter('H4');
    expect(t.ic.state.get().targetKey).toBe('scale.major/f-major');
    expect(t.controller.current?.variant.variantId).toBe('f-major');
  });
});

describe('돌의 모습이 월드로 올라간다(4.2, 4.3)', () => {
  it('들어가면 돌 여덟 개가 모두 비어 있고, 고른 자리도 없고, 표시도 없다', () => {
    const t = setup();
    t.ic.enter('H4');
    expect(t.slots()).toHaveLength(8);
    for (const s of t.slots()) expect(s).toMatchObject({ name: null, midi: null, flagged: false, selected: false, playing: false });
  });

  it('놓으면 그 돌에 음 이름과 높이가 나타나고 그 자리가 골라진다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.perform('place');
    expect(t.slots()[0]).toMatchObject({ slot: 1, name: 'C4', midi: 60, selected: true });
    t.ic.perform('cursor-right');
    expect(t.slots()[0]!.selected).toBe(false);
    expect(t.slots()[1]!.selected).toBe(true);
  });

  it('돌을 누르면 손에 든 음이 그 돌에 놓인다(W-4: 끌지 않고 누르기만으로)', () => {
    const t = setup();
    t.ic.enter('H4');
    t.press(3);
    expect(t.slots()[2]).toMatchObject({ name: 'C4', midi: 60, selected: true });
    expect(t.slots()[0]!.name).toBeNull();
    expect(t.controller.live).toBe('3번째 자리에 C4를 놓았어요.');
  });

  it('이미 놓인 돌을 누르면 덮어쓰지 않고 그 돌을 고르기만 한다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.press(2);
    t.ic.perform('hand-up');
    t.press(2);
    expect(t.slots()[1]).toMatchObject({ name: 'C4', selected: true });
    expect(t.controller.live).toContain('바꾸려면 놓기를 누르세요');
    // 놓기로는 바꿀 수 있다
    t.ic.perform('place');
    expect(t.slots()[1]!.name).toBe('D4');
  });

  it('다른 설치물의 누르기나 모드 밖의 누르기는 무시한다', () => {
    const t = setup();
    t.press(1); // 모드 밖
    expect(t.controller.current).toBeNull();
    t.ic.enter('H4');
    t.bridge.events.send({ type: 'slot-pressed', installationId: 'inst.other', slot: 1 });
    expect(t.slots()[0]!.name).toBeNull();
  });

  it('도전이 닫혀 있을 때(패널을 다녀온 직후) 돌을 눌러도 다시 열고 놓는다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.controller.close();
    t.press(4);
    expect(t.controller.current?.free).toBe(true);
    expect(t.slots()[3]!.name).toBe('C4');
  });

  it('확인하면 틀린 자리와 빈 자리에 표시가 서고, 같은 문장이 확인 결과에도 있다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    t.press(1); // C4: 맞다
    t.press(2); // C4: 목표는 D4
    t.ic.perform('check');
    const flagged = t.slots().filter((s) => s.flagged).map((s) => s.slot);
    expect(flagged).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(t.slots()[0]!.flagged).toBe(false);
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.controller.feedback?.messages[0]).toBe('두 번째 자리: 지금은 C4예요. 목표는 D4예요.');
  });

  it('올바르게 채우면 표시가 없고 통과한다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    const names = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    for (let i = 0; i < 8; i++) {
      t.ic.perform('place');
      if (i < 7) {
        t.ic.perform('hand-up');
        t.ic.perform('cursor-right');
      }
    }
    expect(t.slots().map((s) => s.name)).toEqual(names);
    t.ic.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.slots().some((s) => s.flagged)).toBe(false);
  });

  it('고치면 표시는 사라진다(틀린 채로 남아 있지 않다)', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    t.press(1);
    t.ic.perform('check');
    expect(t.slots().some((s) => s.flagged)).toBe(true);
    t.ic.perform('hand-up');
    t.press(2);
    expect(t.slots().some((s) => s.flagged)).toBe(false);
  });

  it('자유로 놀기에서 확인과 목표 듣기는 판정 없이 안내만 남긴다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.perform('check');
    expect(t.controller.feedback).toBeNull();
    expect(t.controller.notice).toBeTruthy();
    expect(t.slots().some((s) => s.flagged)).toBe(false);
    t.ic.perform('hear-target');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBeTruthy();
  });

  it('값이 바뀌지 않으면 다리에 다시 올리지 않는다', () => {
    const t = setup();
    t.ic.enter('H4');
    let count = 0;
    t.bridge.installationViews.subscribe(() => count++);
    t.controller.announce('아무것도 바뀌지 않았어요.');
    t.controller.announce('다른 글귀예요.');
    expect(count).toBe(0);
    t.ic.perform('place'); // 음이 놓이고(이름), 그 자리가 골라진다(표시): 모습이 바뀐 만큼만 올라간다
    expect(count).toBeGreaterThan(0);
    const after = count;
    t.controller.announce('또 다른 글귀예요.');
    t.controller.notify('알림이에요.');
    expect(count).toBe(after);
  });

  it('고른 도전의 초안을 보여 준다: 표지판에서 고르면 그 판본의 초안이 돌에 올라온다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    t.press(1);
    t.ic.select('scale.major/f-major');
    expect(t.slots().every((s) => s.name === null)).toBe(true);
    t.ic.select('scale.major/c-major');
    expect(t.slots()[0]!.name).toBe('C4');
  });
});

describe('걸어서 지나가며 돌을 밟으면(4.3)', () => {
  /** 1번 돌에 C4, 2번 돌에 D4를 놓고 나온다 */
  const prepared = () => {
    const t = setup();
    t.ic.enter('H4');
    t.press(1);
    t.ic.perform('hand-up');
    t.press(2);
    t.ic.exit();
    return t;
  };

  it('음이 놓인 돌을 밟으면 그 음이 0.5초 울린다', () => {
    const t = prepared();
    t.step(1);
    t.step(2);
    expect(t.stepped).toEqual([
      { midi: 60, sec: STEP_NOTE_SEC },
      { midi: 62, sec: STEP_NOTE_SEC },
    ]);
    expect(STEP_NOTE_SEC).toBe(0.5);
  });

  it('빈 돌은 조용하다', () => {
    const t = prepared();
    t.step(3);
    t.step(8);
    expect(t.stepped).toEqual([]);
  });

  it('설치물 모드에 들어가 있는 동안에는 밟기 사건이 와도 울리지 않는다', () => {
    const t = prepared();
    t.ic.enter('H4');
    t.step(1);
    expect(t.stepped).toEqual([]);
  });

  it('모르는 설치물이나 없는 자리의 사건은 무시한다', () => {
    const t = prepared();
    t.bridge.events.send({ type: 'stepped', installationId: 'inst.other', slot: 1 });
    t.step(99);
    expect(t.stepped).toEqual([]);
  });

  it('한 번도 열지 않은 설치물의 돌도 조용하다(오류 없이)', () => {
    const t = setup();
    expect(() => t.step(1)).not.toThrow();
    expect(t.stepped).toEqual([]);
  });

  it('놓은 것을 지우면 그 돌은 다시 조용하다', () => {
    const t = prepared();
    t.ic.enter('H4');
    t.press(2); // 놓인 돌을 누르면 그 돌만 고른다
    t.ic.perform('remove');
    expect(t.slots()[1]!.name).toBeNull();
    t.ic.exit();
    t.step(2);
    expect(t.stepped).toEqual([]);
    t.step(1);
    expect(t.stepped).toHaveLength(1);
  });
});

describe('월드의 명령(지도에서 걸어가기, 바로 이동)', () => {
  it.each(['walk-to-station', 'teleport-to-station'] as const)('%s는 설치물 모드를 끝낸다', (type) => {
    const t = setup();
    t.ic.enter('H4');
    t.bridge.commands.send({ type, stationId: 'H1' });
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.bridge.installationMode.get()).toBeNull();
  });

  it('저장한 자리로 서기(teleport)도 끝낸다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.bridge.commands.send({ type: 'teleport', x: 100, y: 100 });
    expect(t.ic.state.get().mode).toBeNull();
  });

  it('상호작용과 걷기 취소 명령은 모드를 그대로 둔다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.bridge.commands.send({ type: 'interact' });
    t.bridge.commands.send({ type: 'cancel-walk' });
    expect(t.ic.state.get().mode).not.toBeNull();
  });
});

describe('패널로 보기와 패널을 다녀오기', () => {
  it('자유로 놀기에서는 패널로 볼 수 없다고 알리고 가지 않는다', () => {
    const t = setup();
    t.ic.enter('H4');
    expect(t.ic.perform('view-panel')).toBeNull();
    expect(t.controller.live).toBe(FREE_PLAY_NO_PANEL);
    expect(t.ic.panelHash()).toBeNull();
  });

  it('과제를 고른 뒤에는 그 판본의 패널 주소를 돌려준다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/f-major');
    expect(t.ic.perform('view-panel')).toEqual({ navigate: '#/q/scale.major/f-major' });
  });

  it('패널 화면이 아직 없는 과제는 준비 중이라고만 알리고, 여기서 계속 풀 수 있다', () => {
    const t = setup({ panels: [] });
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    expect(t.ic.perform('view-panel')).toBeNull();
    expect(t.controller.live).toBe(NO_PANEL_YET);
    expect(t.ic.state.get().mode).not.toBeNull();
    t.press(1);
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('패널에서 마을로 돌아오면(월드가 멈췄다 풀림) 설치물의 도전이 다시 열린다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.ic.select('scale.major/c-major');
    t.press(1);
    t.bridge.pause.set(true); // 패널 화면이 열림
    t.controller.close(); // 화면을 떠나면 컨트롤러가 닫힌다
    expect(t.controller.current).toBeNull();
    t.bridge.pause.set(false); // 마을로 돌아옴
    expect(t.controller.current?.variant.variantId).toBe('c-major');
    expect(t.slots()[0]!.name).toBe('C4');
  });

  it('모드 밖에서 멈춤이 풀려도 아무것도 열지 않는다', () => {
    const t = setup();
    t.bridge.pause.set(true);
    t.bridge.pause.set(false);
    expect(t.controller.current).toBeNull();
  });

  it('도전이 닫혀 있어도 키 동작은 다시 열고 한다', () => {
    const t = setup();
    t.ic.enter('H4');
    t.controller.close();
    expect(t.ic.perform('place')).toBeNull();
    expect(t.controller.current?.free).toBe(true);
    expect(t.slots()[0]!.name).toBe('C4');
  });
});

describe('듣는 동안 돌이 따라간다(4.3): 소리를 꺼 두어도 움직인다(W-8)', () => {
  const three = () => {
    const t = setup();
    t.ic.enter('H4');
    for (let i = 0; i < 3; i++) {
      t.ic.perform('place');
      t.ic.perform('hand-up');
      t.ic.perform('cursor-right');
    }
    return t;
  };

  it('듣는 동안에는 프레임마다 지금 울리는 자리를 돌에 알리고, 끝나면 멈춘다', () => {
    const t = three();
    expect(t.frames.pending.size).toBe(0);
    t.ic.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    expect(t.frames.pending.size).toBe(1);
    t.run(0.1);
    t.frames.tick();
    expect(t.slots().findIndex((s) => s.playing)).toBe(0);
    t.run(0.8); // 4분음표 80: 한 자리에 0.75초
    t.frames.tick();
    expect(t.slots().findIndex((s) => s.playing)).toBe(1);
    t.run(0.75);
    t.frames.tick();
    expect(t.slots().findIndex((s) => s.playing)).toBe(2);
    t.run(6);
    t.frames.tick();
    t.frames.tick();
    expect(t.controller.playing).toBeNull();
    expect(t.slots().some((s) => s.playing)).toBe(false);
    expect(t.frames.pending.size).toBe(0);
  });

  it('정지하면 프레임 예약도 접고 돌의 표시도 지운다', () => {
    const t = three();
    t.ic.perform('hear-mine');
    t.run(0.1);
    t.frames.tick();
    expect(t.slots().some((s) => s.playing)).toBe(true);
    t.ic.perform('stop');
    expect(t.controller.playing).toBeNull();
    expect(t.frames.pending.size).toBe(0);
    expect(t.slots().some((s) => s.playing)).toBe(false);
  });

  it('모드 밖에서 듣는 것(패널)은 프레임을 쓰지 않는다', () => {
    const t = three();
    t.ic.exit();
    t.controller.openFree(t.inst);
    t.controller.playMine();
    expect(t.frames.pending.size).toBe(0);
  });

  it('dispose하면 프레임 예약을 접고, 이후의 사건은 받지 않는다', () => {
    const t = three();
    t.ic.perform('hear-mine');
    expect(t.frames.pending.size).toBe(1);
    t.ic.dispose();
    expect(t.frames.pending.size).toBe(0);
    const before = JSON.stringify(t.slots());
    t.press(8);
    expect(JSON.stringify(t.slots())).toBe(before);
    t.ic.dispose(); // 두 번 불러도 괜찮다
  });
});

describe('설치물이 다루는 도전의 가림막', () => {
  it('이 시험의 틀: 과제 정의 셋(Q01, Q02, Q07)과 H4의 설치물', () => {
    const t = setup();
    expect(t.catalog.get(Q07)?.variants.length).toBeGreaterThanOrEqual(2);
    expect(t.inst.quests).toEqual([{ questId: Q07, variantIds: ['c-major', 'f-major'] }]);
  });
});
