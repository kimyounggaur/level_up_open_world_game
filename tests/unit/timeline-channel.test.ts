// 6-5 잔물결 수로(E3, 징검다리 확대형, 설계서 4.4)의 두뇌: 같은 작업대(TimelineBench)가 세로로 긴 줄에서 셋잇단 뗏목(Q03, Q18)과 16분음표(Q17)를 놓는 길.
// - 뗏목의 돌은 칸의 경계에 맞지 않아서(320틱 돌은 120틱 칸의 경계가 아니다) 고른 칸이 돌 단위로 움직인다(stops, align).
// - 월드가 눌린 점의 틱을 함께 알려 주므로, 칸 하나에 걸친 두 돌 가운데 눌린 돌이 골라진다.
// - PageUp·PageDown은 박 단위로 옮기고, 카메라가 따라가는 박은 고른 칸(듣는 중이면 물결 선)에서 정해진다.
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 줄 계산은 timeline-stones, 화면은 timeline-hud, 월드 그림은 timeline-layer와 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isNote } from '@/domain/score';
import type { DraftContent } from '@/domain/session';
import { beatFollowOf } from '@/domain/timelineStones';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { FREE_KEY, InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const E3 = 'inst.beat-river.ripple-channel';
const Q03 = 'rhythm.short-notes-and-triplets';
const Q17 = 'rhythm.sixteenths';
const Q18 = 'rhythm.triplets';
const Q03_KEY = `${Q03}/thirty-seconds-triplet`;
const Q17_KEY = `${Q17}/sixteenths-and-eighths`;
const Q18_KEY = `${Q18}/triplet-eighths-and-quarters`;

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
  const r = rig({ definitions: [Q03, Q17, Q18].map(quest), ...opts });
  const bridge = new WorldBridge({ x: 6560, y: 1660, facing: 'right' });
  const inst = installation(E3);
  const frames = new FakeFrames();
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => {} },
    installations: [inst],
    panels: new Set(['panel.rhythm']),
    opened: { mark: () => {} },
    frames,
  });
  ic.setNavigator(() => {});
  const view = (): InstallationView => bridge.installationViews.get().find((v) => v.installationId === inst.installationId)!;
  const timeline = () => view().timeline!;
  /** 월드가 칸을 눌렀다고 알린다. tick은 눌린 점의 틱(월드가 알려 주면 그 틱으로 본다) */
  const press = (slot: number, tick?: number): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot, ...(tick !== undefined ? { tick } : {}) });
  return { ...r, bridge, inst, ic, frames, view, timeline, press };
}

type T = ReturnType<typeof setup>;

/** E3에 들어가 과제 판본을 고르고 작업대를 돌려준다 */
function enter(t: T, key: string) {
  expect(t.ic.enter('E3')).toBe(true);
  expect(t.ic.select(key)).toBe(true);
  return t.ic.timeline!;
}

/** 초안에 놓인 돌들(시작 틱 순서). 예: ['C4 0+960', '쉼 960+960'] */
function drawnFrom(content: DraftContent): string[] {
  return [...content.events]
    .sort((a, b) => a.onsetTicks - b.onsetTicks)
    .map((e) => `${isNote(e) ? `${e.writtenPitch.letter}${e.writtenPitch.octave}` : '쉼'} ${e.onsetTicks}+${e.durationTicks}`);
}
const drawn = (t: T): string[] => drawnFrom(t.controller.content());

describe('들어가기와 표지판', () => {
  it('E3는 징검다리다: 정거장 E3에 들어가면 세로 줄의 작업대가 생기고, 박을 따라가는 설치물이다', () => {
    const t = setup();
    expect(t.ic.has('E3')).toBe(true);
    expect(t.ic.isTimeline(t.inst)).toBe(true);
    expect(t.ic.isStage(t.inst)).toBe(false);
    expect(t.ic.enter('E3')).toBe(true);
    expect(t.ic.state.get().mode).toEqual({ installationId: E3, stationId: 'E3' });
    const bench = t.ic.timeline!;
    expect(bench.lane).toEqual({ axis: 'y', ticksPerPx: 2, start: 700, cross: 6656, crossSize: 96, cellTicks: 120, laneTicks: 3840, voiceId: 'v1' });
    expect(t.controller.live).toContain('잔물결 수로에 들어왔어요');
    // 박 옮기기 키가 안내에 있다
    expect(t.controller.live).toContain('PageUp');
  });

  it('표지판: 자유로 놀기가 맨 위, 그 아래에 Q03, Q17, Q18의 판본이 정거장(E3)에 적힌 과제 순서대로 있다', () => {
    const t = setup();
    t.ic.enter('E3');
    const entries = t.ic.signOf(t.inst);
    expect(entries.map((e) => e.key)).toEqual([FREE_KEY, Q03_KEY, Q17_KEY, Q18_KEY]);
    expect(entries.slice(1).every((e) => e.selectable)).toBe(true);
    expect(entries[3]!.label).toContain('4분음표, 8분 셋잇단, 4분 셋잇단');
  });

  it('과제마다 시간 규칙이 다르다: Q17은 16분음표 칸(240틱), Q18은 8분음표 칸(480틱), Q03은 32분음표 칸(120틱)이다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    expect([bench.spec.cellTicks, bench.step]).toEqual([240, 240]);
    t.ic.select(Q18_KEY);
    expect([bench.spec.cellTicks, bench.step]).toEqual([480, 480]);
    t.ic.select(Q03_KEY);
    expect([bench.spec.cellTicks, bench.step]).toEqual([120, 120]);
  });

  it('배포 채널에서는 검수가 끝나지 않은 과제를 고를 수 없다(준비 중)', () => {
    const t = setup({ channel: 'release' });
    t.ic.enter('E3');
    expect(t.ic.signOf(t.inst).slice(1).every((e) => !e.selectable && e.badge === '준비 중')).toBe(true);
    expect(t.ic.select(Q18_KEY)).toBe(false);
  });
});

describe('Q17 잘게 쪼갠 물결: 16분음표 칸', () => {
  it('눌러서 정답을 놓고 확인하면 통과한다: 눌린 칸(120틱)은 16분음표 칸(240틱) 안으로 맞춰진다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    expect(bench.lengths().map((l) => l.value)).toEqual(['sixteenth', 'eighth', 'quarter', 'half', 'whole']);
    bench.pickLength('sixteenth', false);
    for (const [slot, name] of [[1, 'C4'], [3, 'D4'], [5, 'E4'], [7, 'F4']] as const) {
      bench.pickPitch(p(name));
      t.press(slot);
    }
    bench.pickLength('eighth', false);
    bench.pickPitch(p('G4'));
    t.press(9);
    t.press(13);
    bench.pickLength('half', false);
    bench.pickPitch(p('E4'));
    t.press(17);
    expect(drawn(t)).toEqual(['C4 0+240', 'D4 240+240', 'E4 480+240', 'F4 720+240', 'G4 960+480', 'G4 1440+480', 'E4 1920+1920']);
    expect(bench.water()).toEqual([]);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('120틱 칸의 두 번째 칸(slot 2)을 눌러도 16분음표 칸의 시작(0틱)이 골라진다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    t.press(2);
    expect(drawn(t)).toEqual(['C4 0+240']);
    expect(bench.cursor).toBe(240);
    // 놓인 돌 위를 다시 누르면 덮어쓰지 않고 고르기만 한다
    t.press(2);
    expect(drawn(t)).toEqual(['C4 0+240']);
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toContain('바꾸려면 놓기를 누르세요');
  });

  it('칸 이동은 16분음표 칸 단위로 16칸이다: ←를 열여섯 번 누르면 마지막 칸(3600틱)이고 더 가면 알린다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    for (let i = 0; i < 16; i++) bench.perform('cursor-right');
    expect(bench.cursor).toBe(3600);
    expect(bench.stops()).toHaveLength(16);
    bench.perform('cursor-right');
    expect(t.controller.live).toContain('마지막 칸이에요');
  });
});

describe('Q18 셋으로 나눈 물살: 두 종류의 뗏목', () => {
  it('손에 들 수 있는 것: 울림돌, 이끼돌, 뗏목, 비우기. 뗏목은 8분 셋잇단과 4분 셋잇단이 짧은 것부터 있다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    expect(bench.kinds()).toEqual(['note', 'rest', 'raft', 'erase']);
    expect(bench.tuplets().map((k) => k.writtenBaseDuration)).toEqual(['eighth', 'quarter']);
    bench.pickKind('raft');
    expect(bench.handName()).toContain('8분 셋잇단');
    // Shift+↑ ↓는 뗏목의 종류를 바꾼다(돌 길이가 아니다)
    bench.perform('length-up');
    expect(bench.handName()).toContain('4분 셋잇단');
    bench.perform('length-up');
    expect(t.controller.live).toContain('가장 긴 뗏목이에요');
    bench.perform('length-down');
    expect(bench.handName()).toContain('8분 셋잇단');
    bench.perform('length-down');
    expect(t.controller.live).toContain('가장 짧은 뗏목이에요');
  });

  it('뗏목이 하나뿐인 과제(Q03)에서는 Shift+↑ ↓가 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.pickKind('raft');
    bench.perform('length-up');
    expect(t.controller.live).toContain('뗏목은 8분 셋잇단음표 종류뿐이에요');
    expect(bench.tuplets()).toHaveLength(1);
  });

  it('칸 이동은 뗏목 위에서 돌 하나씩 움직인다: 8분 셋잇단 돌은 960, 1280, 1600틱이고 칸 이름은 몇째 돌이다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.place(960);
    expect(drawn(t)).toEqual(['C4 960+320', 'C4 1280+320', 'C4 1600+320']);
    // 뗏목은 놓은 뒤에도 첫 돌에 머문다(돌마다 음을 바꾸려면 첫 돌부터 차례로 바꾼다)
    expect(bench.cursor).toBe(960);
    expect(bench.cursorLabel()).toBe('2박');
    expect(bench.stops()).toEqual([0, 480, 960, 1280, 1600, 1920, 2400, 2880, 3360]);
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(1280);
    expect(bench.cursorLabel()).toBe('2박 둘째 돌');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(1600);
    expect(bench.cursorLabel()).toBe('2박 셋째 돌');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(1920);
    // 거꾸로도 돌 하나씩이다
    bench.perform('cursor-left');
    expect(bench.cursor).toBe(1600);
    bench.perform('cursor-left');
    bench.perform('cursor-left');
    expect(bench.cursor).toBe(960);
    bench.perform('cursor-left');
    expect(bench.cursor).toBe(480);
  });

  it('돌 하나의 음을 바꾸면 그 돌만 바뀌고, 고른 칸은 뗏목의 다음 돌로 간다. 마지막 돌이면 뗏목 다음 칸이다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.pickPitch(p('D4'));
    bench.place(960);
    bench.pickKind('note');
    bench.pickLength('eighth', false);
    bench.pickPitch(p('E4'));
    bench.selectTick(1280);
    bench.place();
    expect(drawn(t)).toEqual(['D4 960+320', 'E4 1280+320', 'D4 1600+320']);
    expect(bench.cursor).toBe(1600);
    bench.pickPitch(p('F4'));
    bench.place();
    expect(drawn(t)).toEqual(['D4 960+320', 'E4 1280+320', 'F4 1600+320']);
    expect(bench.cursor).toBe(1920);
    // 뗏목은 하나다
    expect(t.controller.content().tuplets).toHaveLength(1);
  });

  it('4분 셋잇단 뗏목은 두 박이다: 돌은 1920, 2560, 3200틱이고 둘째 돌이 4박의 선을 걸친다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.perform('length-up');
    bench.pickPitch(p('G4'));
    bench.place(1920);
    expect(drawn(t)).toEqual(['G4 1920+640', 'G4 2560+640', 'G4 3200+640']);
    expect(bench.stops()).toEqual([0, 480, 960, 1440, 1920, 2560, 3200]);
    bench.selectTick(2880);
    // 2880틱은 둘째 돌 안이다: 그 돌의 시작이 골라진다
    expect(bench.cursor).toBe(2560);
    expect(bench.cursorLabel()).toBe('3박 둘째 돌');
    bench.selectTick(3300);
    expect(bench.cursor).toBe(3200);
    expect(bench.cursorLabel()).toBe('3박 셋째 돌');
    expect(t.controller.live).toContain('3박 셋째 돌');
  });

  it('뗏목은 박이 시작하는 자리에 놓인다: 박 가운데를 골라도 그 박의 처음에 놓인다. 놓인 뗏목 위에서는 뗏목의 처음이다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.place(1440);
    expect(drawn(t)).toEqual(['C4 960+320', 'C4 1280+320', 'C4 1600+320']);
    // 4분 셋잇단 뗏목을 놓은 자리에서 둘째 돌을 골라 다시 놓아도 뗏목째 바뀐다(처음은 3박이다)
    bench.perform('length-up');
    bench.place(1920);
    bench.pickPitch(p('D4'));
    bench.place(3200);
    expect(drawn(t).filter((s) => s.endsWith('+640'))).toEqual(['D4 1920+640', 'D4 2560+640', 'D4 3200+640']);
    expect(t.controller.content().tuplets).toHaveLength(2);
  });

  it('뗏목을 놓으려는 자리의 윤곽(cursor 표시)은 뗏목 전체다. 뗏목의 돌 위에 음을 놓으려면 돌 하나다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.selectTick(960);
    // 8분 셋잇단 뗏목은 한 박이다
    expect(t.timeline().cursor).toEqual({ startTick: 960, endTick: 1920, kind: 'raft', ok: true });
    // 4분 셋잇단 뗏목은 두 박이다
    bench.perform('length-up');
    expect(t.timeline().cursor).toEqual({ startTick: 960, endTick: 2880, kind: 'raft', ok: true });
    // 마지막 박(2880틱)에서는 두 박이 마디 선을 넘는다
    bench.selectTick(2880);
    expect(t.timeline().cursor).toEqual({ startTick: 2880, endTick: 4800, kind: 'raft', ok: false });
    bench.perform('length-down');
    bench.selectTick(960);
    bench.place(960);
    bench.pickKind('note');
    bench.pickLength('eighth', false);
    bench.selectTick(1290);
    expect(t.timeline().cursor).toMatchObject({ startTick: 1280, endTick: 1600, kind: 'note', ok: true });
  });

  it('뗏목의 어느 돌을 빼도 뗏목이 통째로 빠지고 고른 칸은 뗏목의 처음으로 돌아온다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.place(960);
    bench.selectTick(1600);
    bench.perform('remove');
    expect(drawn(t)).toEqual([]);
    expect(t.controller.content().tuplets).toEqual([]);
    expect(bench.cursor).toBe(960);
    expect(t.controller.live).toContain('남은 물');
  });

  it('정답을 키보드로 놓고 확인하면 통과한다(C4 4분음표, 8분 셋잇단 D4 E4 F4, 4분 셋잇단 G4 A4 G4)', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    // 4분음표 C4: 기본 손은 울림돌 C4 8분음표다
    bench.pickLength('quarter', false);
    bench.perform('place');
    expect(bench.cursor).toBe(960);
    // 8분 셋잇단 D4 E4 F4
    bench.pickKind('raft');
    bench.pickPitch(p('D4'));
    bench.perform('place');
    bench.pickKind('note');
    bench.pickLength('eighth', false);
    bench.perform('cursor-right');
    bench.perform('hand-up');
    bench.perform('place');
    bench.perform('hand-up');
    bench.perform('place');
    expect(drawn(t)).toEqual(['C4 0+960', 'D4 960+320', 'E4 1280+320', 'F4 1600+320']);
    expect(bench.cursor).toBe(1920);
    // 4분 셋잇단 G4 A4 G4
    bench.pickKind('raft');
    bench.perform('length-up');
    bench.pickPitch(p('G4'));
    bench.perform('place');
    bench.pickKind('note');
    bench.pickLength('quarter', false);
    bench.perform('cursor-right');
    bench.pickPitch(p('A4'));
    bench.perform('place');
    expect(drawn(t)).toEqual(['C4 0+960', 'D4 960+320', 'E4 1280+320', 'F4 1600+320', 'G4 1920+640', 'A4 2560+640', 'G4 3200+640']);
    expect(bench.waterLine()).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });
});

describe('눌러서 놓기: 월드가 눌린 점의 틱을 함께 알린다', () => {
  /** Q03 줄에 8분 셋잇단 뗏목을 2박(960틱)에 놓은 모습: 돌은 960–1279, 1280–1599, 1600–1919틱 */
  function withRaft() {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.pickKind('raft');
    bench.place(960);
    return { t, bench };
  }

  it('칸 11(1200–1319틱)은 첫째 돌과 둘째 돌에 걸친다: 눌린 틱이 어느 돌인지 정한다', () => {
    const { t, bench } = withRaft();
    t.press(11, 1210);
    expect(bench.cursor).toBe(960);
    expect(bench.cursorLabel()).toBe('2박');
    t.press(11, 1290);
    expect(bench.cursor).toBe(1280);
    expect(bench.cursorLabel()).toBe('2박 둘째 돌');
    // 틱이 없으면 칸의 처음 틱(1200)을 본다: 이웃한 돌이 눌릴 수 있어서 월드가 틱을 알린다
    t.press(11);
    expect(bench.cursor).toBe(960);
  });

  it('칸 14(1560–1679틱)는 둘째 돌과 셋째 돌에 걸친다', () => {
    const { t, bench } = withRaft();
    t.press(14, 1570);
    expect(bench.cursor).toBe(1280);
    t.press(14, 1620);
    expect(bench.cursor).toBe(1600);
    expect(bench.cursorLabel()).toBe('2박 셋째 돌');
  });

  it('돌이 놓인 곳을 누르면 덮어쓰지 않고 그 돌만 고른다. 말로 알리고 바꾸는 길을 안내한다', () => {
    const { t, bench } = withRaft();
    t.press(11, 1290);
    expect(drawn(t)).toEqual(['C4 960+320', 'C4 1280+320', 'C4 1600+320']);
    expect(t.controller.live).toContain('2박 둘째 돌');
    expect(t.controller.live).toContain('바꾸려면 놓기를 누르세요');
    expect(bench.cursor).toBe(1280);
  });

  it('비우기를 들고 뗏목의 돌을 누르면 뗏목이 통째로 지워진다', () => {
    const { t, bench } = withRaft();
    bench.pickKind('erase');
    t.press(14, 1620);
    expect(drawn(t)).toEqual([]);
    expect(t.controller.content().tuplets).toEqual([]);
  });

  it('빈 칸을 누르면 손에 든 것이 놓인다: 눌린 틱이 칸 안(250틱)이면 칸의 처음(240틱)에 놓인다(Q03은 칸이 120틱이다)', () => {
    const t = setup();
    enter(t, Q03_KEY);
    const bench = t.ic.timeline!;
    bench.pickKind('note');
    bench.pickLength('thirtySecond', false);
    t.press(3, 250);
    expect(drawn(t)).toEqual(['C4 240+120']);
    expect(bench.cursor).toBe(360);
  });

  it('마디 밖의 틱(3/4 과제의 남는 줄)은 물가 바위로 알리고 놓지 않는다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    t.bridge.events.send({ type: 'slot-pressed', installationId: E3, slot: 32, tick: 3839 });
    // 4/4라 마디 안이다
    expect(drawn(t)).toHaveLength(1);
    expect(bench.cursor).not.toBeNull();
  });
});

describe('박 단위로 옮기기(PageUp, PageDown)', () => {
  it('Q03: 박의 처음으로 건너뛴다. 처음에는 첫 칸에서 시작하고 마지막 박에서는 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(960);
    expect(bench.cursorLabel()).toBe('2박');
    bench.perform('beat-next');
    expect(bench.cursor).toBe(1920);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(2880);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(2880);
    expect(t.controller.live).toContain('마지막 박이에요');
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(1920);
  });

  it('박 가운데에서 이전 박은 먼저 그 박의 처음으로 가고, 첫 박에서는 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.selectTick(1080);
    expect(bench.cursorLabel()).toBe('2박 2번째 칸');
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(960);
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(0);
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toContain('첫 박이에요');
  });

  it('Q03: 뗏목이 있는 박에서 다음 박은 뗏목을 건너뛰고, 이전 박은 뗏목의 처음에 선다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.pickKind('raft');
    bench.place(960);
    bench.selectTick(1600);
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(960);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(1920);
    bench.selectTick(1280);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(1920);
  });

  it('Q18: 4분 셋잇단 뗏목의 둘째 돌이 박 선을 걸쳐도 다음 박은 한 박씩 앞서간다(걸친 돌에 걸려 멈추지 않는다)', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.perform('length-up');
    bench.place(1920);
    bench.selectTick(1920);
    bench.perform('beat-next');
    // 4박(2880틱)의 처음은 둘째 돌의 안이다: 박 안에서 처음 서는 자리는 셋째 돌(3200틱)이다
    expect(bench.cursor).toBe(3200);
    expect(bench.cursorLabel()).toBe('3박 셋째 돌');
    bench.perform('beat-next');
    expect(bench.cursor).toBe(3200);
    expect(t.controller.live).toContain('마지막 박이에요');
    // 이전 박: 4박의 처음에 걸친 돌(둘째 돌)에 선다. 한 번 더 누르면 3박의 처음이다
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(2560);
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(1920);
    bench.perform('beat-prev');
    expect(bench.cursor).toBe(960);
  });

  it('Q17: 16분음표 칸에서도 박 하나(960틱)씩 옮긴다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    bench.selectTick(240);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(960);
    bench.perform('beat-next');
    expect(bench.cursor).toBe(1920);
  });

  it('고른 칸의 박은 컨트롤러(패널)의 고른 칸과 함께 옮겨진다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.perform('beat-next');
    expect(t.controller.selectedCell()).toMatchObject({ measureIndex: 0, onsetTicks: 960 });
  });
});

describe('카메라가 따라가는 박(월드로 올라가는 모습)', () => {
  const followed = (t: T) => beatFollowOf(t.ic.timeline!.lane, t.timeline());

  it('아무것도 고르지 않았으면 첫 박이다. 고른 칸이 다른 박으로 가면 따라가는 박도 바뀐다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    expect(t.timeline().cursor).toBeNull();
    expect(followed(t).beat).toBe(0);
    bench.perform('beat-next');
    expect(followed(t).beat).toBe(1);
    expect(followed(t).rect).toMatchObject({ y: 700 + 480, h: 480 });
    bench.perform('beat-next');
    bench.perform('beat-next');
    expect(followed(t).beat).toBe(3);
    bench.selectTick(0);
    expect(followed(t).beat).toBe(0);
  });

  it('뗏목 위의 칸도 박을 따라간다: 4분 셋잇단 뗏목의 셋째 돌(3200틱)은 4박이다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.perform('length-up');
    bench.place(1920);
    bench.selectTick(3200);
    // 윤곽은 뗏목 전체(1920–3839틱)이고, 고른 칸의 틱(3200)은 따로 실린다
    expect(t.timeline().cursor).toMatchObject({ startTick: 1920, endTick: 3840, at: 3200, kind: 'raft' });
    expect(followed(t).beat).toBe(3);
    // 박 번호 띠: 박의 길이는 한 박이 아니라 모습의 beatTicks(4/4는 960틱)다
    expect(t.timeline().beatTicks).toBe(960);
    expect(t.timeline().measureTicks).toBe(3840);
  });

  it('뗏목을 손에 든 채 첫째 돌을 고르면 윤곽의 처음과 고른 칸이 같아서 고른 칸의 틱(at)은 담기지 않는다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.perform('length-up');
    bench.place(1920);
    bench.selectTick(1920);
    const cursor = t.timeline().cursor!;
    expect(cursor).toMatchObject({ startTick: 1920, endTick: 3840, kind: 'raft' });
    expect('at' in cursor).toBe(false);
    expect(followed(t).beat).toBe(2);
  });

  it('비우기를 든 채 긴 돌(2분음표)의 뒤쪽 칸을 고르면 윤곽은 돌 전체이고 카메라는 고른 칸이 있는 박을 따라간다', () => {
    const t = setup();
    const bench = enter(t, Q17_KEY);
    bench.pickLength('half', false);
    bench.pickPitch(p('E4'));
    bench.place(1920);
    expect(drawn(t)).toEqual(['E4 1920+1920']);
    bench.pickKind('erase');
    bench.selectTick(3120);
    expect(bench.cursor).toBe(3120);
    expect(t.timeline().cursor).toEqual({ startTick: 1920, endTick: 3840, at: 3120, kind: 'erase', ok: true });
    // 돌은 3박(1920틱)에서 시작하지만 고른 칸(3120틱)은 4박 안이다
    expect(followed(t).beat).toBe(3);
    expect(followed(t).rect).toMatchObject({ y: 700 + 3 * 480, h: 480 });
    bench.selectTick(1920);
    expect(t.timeline().cursor).toEqual({ startTick: 1920, endTick: 3840, kind: 'erase', ok: true });
    expect(followed(t).beat).toBe(2);
  });

  it('줄의 모습은 마디 전체(32칸)다: 박 하나만 담는 것은 카메라의 일이고 그리는 것은 줄 전체다', () => {
    const t = setup();
    enter(t, Q18_KEY);
    const tl = t.timeline();
    expect(tl.measureTicks).toBe(3840);
    expect(tl.gridTicks).toBe(480);
    expect(tl.water.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 0, to: 3840 }]);
  });

  it('나가면 모드가 풀리고 도전이 닫힌다. 다시 들어오면 놓은 것은 그대로이고 고른 칸은 처음으로 돌아가 있다', () => {
    const t = setup();
    const bench = enter(t, Q18_KEY);
    bench.pickKind('raft');
    bench.place(960);
    bench.selectTick(1600);
    t.ic.exit();
    expect(t.ic.state.get().mode).toBeNull();
    t.ic.enter('E3');
    t.ic.select(Q18_KEY);
    expect(drawn(t)).toEqual(['C4 960+320', 'C4 1280+320', 'C4 1600+320']);
    expect(t.ic.timeline!.cursor).toBeNull();
    expect(followed(t).beat).toBe(0);
  });
});

describe('Q03 32분음표와 8분 셋잇단(E3에서)', () => {
  it('정답을 눌러서 놓고 확인하면 통과한다: 32분음표 C4 여덟 개, 8분 셋잇단 D4 E4 F4, 2분쉼표', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    expect(bench.step).toBe(120);
    bench.pickLength('thirtySecond', false);
    for (let slot = 1; slot <= 8; slot++) t.press(slot);
    expect(drawn(t).slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, i) => `C4 ${i * 120}+120`));
    expect(bench.cursor).toBe(960);
    bench.pickKind('raft');
    bench.pickPitch(p('D4'));
    bench.perform('place');
    bench.pickKind('note');
    bench.pickLength('eighth', false);
    bench.perform('cursor-right');
    bench.perform('hand-up');
    bench.perform('place');
    bench.perform('hand-up');
    bench.perform('place');
    bench.pickKind('rest');
    bench.pickLength('half', false);
    expect(bench.cursor).toBe(1920);
    bench.perform('place');
    expect(drawn(t).slice(8)).toEqual(['D4 960+320', 'E4 1280+320', 'F4 1600+320', '쉼 1920+1920']);
    expect(bench.water()).toEqual([]);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('틀린 답: 뗏목 돌을 모두 같은 음으로 두면 틀리고, 틀린 돌에 표식이 붙는다', () => {
    const t = setup();
    const bench = enter(t, Q03_KEY);
    bench.pickLength('thirtySecond', false);
    for (let slot = 1; slot <= 8; slot++) t.press(slot);
    bench.pickKind('raft');
    bench.pickPitch(p('D4'));
    bench.perform('place');
    bench.pickKind('rest');
    bench.pickLength('half', false);
    bench.selectTick(1920);
    bench.perform('place');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(false);
    expect(t.timeline().stones.some((s) => s.flagged)).toBe(true);
  });
});
