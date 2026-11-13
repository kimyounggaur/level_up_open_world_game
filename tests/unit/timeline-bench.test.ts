// 6-4 징검다리(T2, 4.4)의 두뇌: 설치물 컨트롤러의 징검다리 길(들어가기, 표지판, 눌러 놓기, 다리로 올라가는 모습, 듣는 동안의 따라가기)과 작업대(TimelineBench: 손, 칸, 놓기와 빼기, 겹침과 마디 선, 남은 물).
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 시간 계산 자체는 timeline-stones·timeline 시험이, 화면은 timeline-hud 시험이, 월드 그림은 timeline-layer와 flow 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isNote } from '@/domain/score';
import type { DraftContent } from '@/domain/session';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import type { TouchEvent } from '@/ui/challenge/controller';
import { NO_STONE_NOTES_NOTICE } from '@/ui/challenge/stoneText';
import { FREE_KEY, FREE_PLAY_NO_PANEL, InstallationController } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { Q02, installation, quest, rig } from './controller-rig';
import type { RigOptions } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

const Q13 = 'rhythm.three-four';
const Q14 = 'rhythm.note-values';
const Q15 = 'rhythm.dotted';
const Q16 = 'rhythm.rest-lengths';
const FORD1 = 'inst.beat-river.first-ford';
const FORD2 = 'inst.beat-river.long-short';
const REST_KEY = `${Q02}/quarter-rest`;
const THREE_KEY = `${Q13}/three-quarters`;
const HALF_REST_KEY = `${Q16}/quarter-and-half-rests`;
const EIGHTH_REST_KEY = `${Q16}/eighth-rest-mix`;

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

function setup(opts: RigOptions & { panels?: string[] } = {}) {
  const { panels, ...rigOptions } = opts;
  const r = rig({ definitions: [Q02, Q13, Q16, Q14, Q15].map(quest), ...rigOptions });
  const bridge = new WorldBridge({ x: 6700, y: 2800, facing: 'right' });
  const first = installation(FORD1);
  const second = installation(FORD2);
  const frames = new FakeFrames();
  const opened: string[] = [];
  const navigated: string[] = [];
  const touches: TouchEvent[] = [];
  r.controller.onTouch((e) => void touches.push(e));
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => {} },
    installations: [first, second],
    panels: new Set(panels ?? ['panel.rhythm']),
    opened: { mark: (id) => void opened.push(id) },
    frames,
  });
  ic.setNavigator((hash) => void navigated.push(hash));
  const view = (inst = first): InstallationView => bridge.installationViews.get().find((v) => v.installationId === inst.installationId)!;
  const timeline = (inst = first) => view(inst).timeline!;
  const press = (slot: number, inst = first): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot });
  return { ...r, bridge, first, second, ic, frames, opened, navigated, touches, view, timeline, press };
}

type T = ReturnType<typeof setup>;

/** E1에 들어가 과제 판본을 고른다(고르지 않으면 자유로 놀기). 작업대를 돌려준다 */
function enter(t: T, key?: string, station: 'E1' | 'E2' = 'E1') {
  expect(t.ic.enter(station)).toBe(true);
  if (key) expect(t.ic.select(key)).toBe(true);
  return t.ic.timeline!;
}

/** 초안에 놓인 돌들(시작 틱 순서). 예: ['C4 0+960', '쉼 960+960'] */
function drawnFrom(content: DraftContent): string[] {
  return [...content.events]
    .sort((a, b) => a.onsetTicks - b.onsetTicks)
    .map((e) => `${isNote(e) ? `${e.writtenPitch.letter}${e.writtenPitch.octave}` : '쉼'} ${e.onsetTicks}+${e.durationTicks}`);
}

/** 열려 있는 도전의 초안에 놓인 돌들 */
const drawn = (t: T): string[] => drawnFrom(t.controller.content());

describe('들어가기와 표지판(4.4)', () => {
  it('E1은 징검다리다: 들어가면 자유로 놀기가 열리고 징검다리 작업대가 생긴다(무대 작업대는 없다)', () => {
    const t = setup();
    expect(t.ic.has('E1')).toBe(true);
    expect(t.ic.isTimeline(t.first)).toBe(true);
    expect(t.ic.isStage(t.first)).toBe(false);
    expect(t.ic.timeline).toBeNull();
    expect(t.ic.enter('E1')).toBe(true);
    expect(t.ic.state.get().mode).toEqual({ installationId: FORD1, stationId: 'E1' });
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.timeline).not.toBeNull();
    expect(t.ic.timeline).toBe(t.ic.timelineOf(t.first));
    expect(t.ic.stage).toBeNull();
    expect(t.controller.live).toContain('첫 징검다리에 들어왔어요');
    expect(t.controller.live).toContain('Shift+↑↓');
    expect(t.controller.live).toContain('R로');
    expect(t.controller.live).toContain('Esc');
    // 자유로 놀기는 과제가 아니다: '열어 봄'을 적지 않는다
    expect(t.opened).toEqual([]);
  });

  it('작업대는 설치물마다 하나이고 줄이 다르다(E1과 E2는 가로 줄의 높이가 다르다)', () => {
    const t = setup();
    const a = t.ic.timelineOf(t.first)!;
    const b = t.ic.timelineOf(t.second)!;
    expect(a).not.toBe(b);
    expect(a.lane).toMatchObject({ axis: 'x', start: 6760, cross: 2752, cellTicks: 480, laneTicks: 3840, voiceId: 'v1' });
    expect(b.lane).toMatchObject({ axis: 'x', start: 6760, cross: 3552, cellTicks: 480, laneTicks: 3840, voiceId: 'v1' });
    expect(t.ic.timelineOf(installation('inst.village.scale-stones'))).toBeNull();
  });

  it('표지판: 맨 위가 자유로 놀기이고 그 아래에 이 정거장의 과제 판본이 순서대로 있다. 미리보기에서는 검수 전이어도 고를 수 있다', () => {
    const t = setup();
    t.ic.enter('E1');
    const entries = t.ic.signOf(t.first);
    expect(entries.map((e) => e.key)).toEqual([FREE_KEY, REST_KEY, THREE_KEY, HALF_REST_KEY, EIGHTH_REST_KEY]);
    expect(entries.filter((e) => e.selected).map((e) => e.key)).toEqual([FREE_KEY]);
    expect(entries[0]).toMatchObject({ label: '자유로 놀기', badge: null, selectable: true });
    expect(entries.slice(1).every((e) => e.selectable && e.badge === '검수 전')).toBe(true);
    expect(entries[1]!.label).toBe('쉼이 있는 한 마디 · 4분쉼표가 있는 4/4');
    expect(entries[2]!.label).toBe('세 박 징검다리 · 3/4박자: 4분음표, 4분쉼표, 4분음표');
    expect(entries[4]!.label).toBe('쉼표의 길이 · 높은 도전: 8분음표, 8분쉼표, 4분음표, 2분쉼표');
  });

  it('배포 채널에서는 검수가 끝나지 않은 과제를 고를 수 없다(준비 중). 자유로 놀기는 그대로 쓴다', () => {
    const t = setup({ channel: 'release' });
    const bench = enter(t);
    const entries = t.ic.signOf(t.first);
    expect(entries.slice(1).every((e) => !e.selectable && e.badge === '준비 중')).toBe(true);
    expect(t.ic.select(REST_KEY)).toBe(false);
    expect(t.ic.select(THREE_KEY)).toBe(false);
    expect(t.controller.current?.free).toBe(true);
    bench.place(0);
    expect(drawn(t)).toEqual(['C4 0+480']);
  });

  it('E2의 표지판에는 긴 돌 짧은 돌과 점이 붙은 돌이 있다', () => {
    const t = setup();
    t.ic.enter('E2');
    const entries = t.ic.signOf(t.second);
    expect(entries.map((e) => e.key)).toEqual([FREE_KEY, `${Q14}/half-quarter-eighths`, `${Q15}/dotted-half`, `${Q15}/dotted-quarter-mix`]);
    expect(entries.slice(1).every((e) => e.selectable)).toBe(true);
    expect(t.ic.has('E2')).toBe(true);
  });

  it('과제를 고르면 그 과제가 열리고 열어 봤다고 적는다. 시간 규칙이 그 판본의 것으로 바뀐다', () => {
    const t = setup();
    const bench = enter(t);
    expect(bench.free).toBe(true);
    expect(bench.spec).toMatchObject({ measureTicks: 3840, cellTicks: 480, values: ['eighth', 'quarter', 'half', 'whole'], dottedValues: ['quarter', 'half'] });
    expect(bench.step).toBe(480);
    expect(t.ic.select(REST_KEY)).toBe(true);
    expect(t.controller.live).toContain('쉼이 있는 한 마디');
    expect(t.opened).toEqual([Q02]);
    expect(bench.free).toBe(false);
    expect(bench.spec).toMatchObject({ measureTicks: 3840, cellTicks: 960, values: ['quarter'], dottedValues: [] });
    expect(bench.step).toBe(960);
    expect(t.ic.state.get().targetKey).toBe(REST_KEY);
    expect(t.ic.targetLabel(t.first)).toContain('4분쉼표가 있는 4/4');
    expect(t.ic.select(THREE_KEY)).toBe(true);
    expect(bench.spec.measureTicks).toBe(2880);
    expect(t.opened).toEqual([Q02, Q13]);
  });

  it('나오면 모드가 풀리고 도전이 닫힌다. 다시 들어가면 놓은 것은 그대로이고 손은 처음으로 돌아가 있다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(0);
    bench.moveHand(1);
    expect(bench.handName()).toBe('울림돌 D4 4분음표');
    t.ic.exit();
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.controller.current).toBeNull();
    // 열려 있지 않아도 놓은 것은 보관된다
    expect(drawnFrom(t.session.contentOf(Q02, 'quarter-rest'))).toEqual(['C4 0+960']);
    t.ic.enter('E1');
    expect(t.ic.select(REST_KEY)).toBe(true);
    expect(drawn(t)).toEqual(['C4 0+960']);
    expect(bench.handName()).toBe('울림돌 C4 4분음표');
    expect(bench.cursor).toBeNull();
  });

  it('키 지도의 나가기·도움·패널로 보기는 컨트롤러가 이어 준다', () => {
    const t = setup();
    enter(t);
    // 자유로 놀 때는 패널로 볼 수 없다
    expect(t.ic.performTimeline('view-panel')).toBeNull();
    expect(t.controller.live).toBe(FREE_PLAY_NO_PANEL);
    expect(t.ic.state.get().helpOpen).toBe(false);
    expect(t.ic.performTimeline('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(true);
    expect(t.ic.performTimeline('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.select(REST_KEY);
    expect(t.ic.performTimeline('view-panel')).toEqual({ navigate: `#/q/${Q02}/quarter-rest` });
    expect(t.ic.performTimeline('exit')).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
    // 들어가 있지 않으면 아무것도 하지 않는다
    expect(t.ic.performTimeline('help')).toBeNull();
    expect(t.ic.state.get().helpOpen).toBe(false);
  });
});

describe('손에 든 돌(4.4)', () => {
  it('처음에는 울림돌을 든다: 길이는 과제가 정한 가장 짧은 값, 음은 음역의 맨 아래다', () => {
    const t = setup();
    const bench = enter(t);
    expect(bench.handName()).toBe('울림돌 C4 8분음표');
    expect(bench.hand).toMatchObject({ kind: 'note', value: 'eighth', dotted: false });
    t.ic.select(REST_KEY);
    expect(bench.handName()).toBe('울림돌 C4 4분음표');
    t.ic.exit();
    enter(t, `${Q14}/half-quarter-eighths`, 'E2');
    expect(t.ic.timeline!.handName()).toBe('울림돌 G4 8분음표');
  });

  it('손에 들 수 있는 것: 울림돌, 이끼돌, 비우기(셋잇단이 없는 과제에는 뗏목이 없다). 길이와 음은 과제를 따른다', () => {
    const t = setup();
    const bench = enter(t);
    expect(bench.kinds()).toEqual(['note', 'rest', 'erase']);
    expect(bench.lengths().map((l) => [l.value, l.dotted])).toEqual([
      ['eighth', false],
      ['quarter', false],
      ['quarter', true],
      ['half', false],
      ['half', true],
      ['whole', false],
    ]);
    expect(bench.pitches().map((p) => `${p.letter}${p.octave}`)).toEqual(['C4', 'D4', 'E4']);
    t.ic.select(REST_KEY);
    expect(bench.lengths().map((l) => [l.value, l.dotted])).toEqual([['quarter', false]]);
    t.ic.exit();
    enter(t, `${Q15}/dotted-half`, 'E2');
    expect(t.ic.timeline!.lengths().map((l) => [l.value, l.dotted])).toEqual([
      ['quarter', false],
      ['half', false],
      ['half', true],
      ['whole', false],
    ]);
  });

  it('N은 울림돌 → 이끼돌 → 울림돌로 돌고, 음높이와 길이는 기억한다. 비우기에서는 울림돌로 돌아온다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.perform('hand-up');
    expect(t.controller.live).toBe('손에 든 것은 울림돌 D4 4분음표예요.');
    bench.perform('kind-next');
    expect(t.controller.live).toBe('손에 든 것은 이끼돌 4분쉼표예요.');
    bench.perform('kind-next');
    expect(t.controller.live).toBe('손에 든 것은 울림돌 D4 4분음표예요.');
    bench.pickKind('erase');
    expect(t.controller.live).toBe('손에 든 것은 비우기예요.');
    bench.perform('kind-next');
    expect(bench.hand.kind).toBe('note');
    // 뗏목은 이 과제에 없다: 눌러도 바뀌지 않는다
    bench.pickKind('raft');
    expect(bench.hand.kind).toBe('note');
  });

  it('↑ ↓는 음높이를 한 칸씩 바꾸고 소리로 들려 준다. 음역의 끝에서는 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    expect(bench.handName()).toBe('울림돌 C4 4분음표');
    bench.perform('hand-down');
    expect(t.controller.live).toBe('음역의 맨 아래예요. 손에 든 것은 울림돌 C4 4분음표예요.');
    expect(t.touches.filter((e) => e.listened === 'note')).toHaveLength(0);
    bench.perform('hand-up');
    expect(t.controller.live).toBe('손에 든 것은 울림돌 D4 4분음표예요.');
    bench.perform('hand-up');
    expect(bench.handName()).toBe('울림돌 E4 4분음표');
    expect(t.touches.filter((e) => e.listened === 'note')).toHaveLength(2);
    bench.perform('hand-up');
    expect(t.controller.live).toBe('음역의 맨 위예요. 손에 든 것은 울림돌 E4 4분음표예요.');
    expect(t.touches.filter((e) => e.listened === 'note')).toHaveLength(2);
    bench.perform('hand-down');
    expect(bench.handName()).toBe('울림돌 D4 4분음표');
  });

  it('이끼돌과 비우기에는 음높이가 없다고 알린다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.pickKind('rest');
    bench.perform('hand-up');
    expect(t.controller.live).toBe('이끼돌에는 음높이가 없어요. 울림돌을 들면 ↑ ↓로 음을 바꿔요.');
    bench.pickKind('erase');
    bench.perform('hand-down');
    expect(t.controller.live).toBe('비우기에는 음높이가 없어요. 울림돌을 들면 ↑ ↓로 음을 바꿔요.');
    expect(bench.hand.kind).toBe('erase');
  });

  it('Shift+↑ ↓는 돌 길이를 한 단계씩 바꾼다. 점이 붙은 길이는 짝이 되는 길이 다음에 온다. 끝에서는 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t);
    expect(bench.handName()).toBe('울림돌 C4 8분음표');
    bench.perform('length-down');
    expect(t.controller.live).toBe('가장 짧은 돌이에요. 손에 든 것은 울림돌 C4 8분음표예요.');
    for (const name of ['4분음표', '점4분음표', '2분음표', '점2분음표', '온음표']) {
      bench.perform('length-up');
      expect(t.controller.live).toBe(`손에 든 것은 울림돌 C4 ${name}예요.`);
    }
    bench.perform('length-up');
    expect(t.controller.live).toBe('가장 긴 돌이에요. 손에 든 것은 울림돌 C4 온음표예요.');
    bench.perform('length-down');
    expect(bench.handName()).toBe('울림돌 C4 점2분음표');
  });

  it('길이가 하나뿐인 과제에서는 그렇다고 알린다. 이끼돌도 같은 길이를 쓴다. 비우기에는 길이가 없다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.perform('length-up');
    expect(t.controller.live).toBe('이 과제에서는 돌 길이가 하나뿐이에요. 손에 든 것은 울림돌 C4 4분음표예요.');
    bench.perform('length-down');
    expect(t.controller.live).toBe('이 과제에서는 돌 길이가 하나뿐이에요. 손에 든 것은 울림돌 C4 4분음표예요.');
    bench.pickKind('rest');
    expect(bench.handName()).toBe('이끼돌 4분쉼표');
    bench.pickKind('erase');
    bench.perform('length-up');
    expect(t.controller.live).toBe('비우기에는 길이가 없어요. 울림돌이나 이끼돌을 들면 길이를 바꿀 수 있어요.');
  });

  it('길이와 음높이를 직접 고를 수 있다(눌러서 고르기). 이 과제에 없는 값은 받지 않는다', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('quarter', true);
    expect(bench.handName()).toBe('울림돌 C4 점4분음표');
    bench.pickPitch({ letter: 'E', alter: 0, octave: 4 });
    expect(bench.handName()).toBe('울림돌 E4 점4분음표');
    // 음역 밖(G5)은 받지 않는다
    bench.pickPitch({ letter: 'G', alter: 0, octave: 5 });
    expect(bench.handName()).toBe('울림돌 E4 점4분음표');
    // 길이를 고르면 비우기가 풀리고 울림돌이 된다
    bench.pickKind('erase');
    bench.pickLength('half', false);
    expect(bench.handName()).toBe('울림돌 E4 2분음표');
    // 이끼돌로 바꾸면 길이만 이어진다
    bench.pickKind('rest');
    expect(bench.handName()).toBe('이끼돌 2분쉼표');
  });

  it('다른 도전을 열면 손은 처음(울림돌, 음역의 맨 아래, 첫 길이)으로 돌아가고 고른 칸도 없다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.pickKind('rest');
    bench.moveCursor(1);
    expect(bench.cursor).toBe(0);
    t.ic.select(THREE_KEY);
    expect(bench.handName()).toBe('울림돌 C4 4분음표');
    expect(bench.cursor).toBeNull();
    expect(bench.cursorLabel()).toBeNull();
  });
});

describe('칸 고르기와 놓기(4.4)', () => {
  it('← →는 칸을 한 칸씩 옮긴다. 처음에는 첫 칸을 고르고, 끝에서는 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    expect(bench.cursor).toBeNull();
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(0);
    expect(bench.cursorLabel()).toBe('1박');
    expect(t.controller.live).toBe('1박, 비어 있어요.');
    bench.perform('cursor-left');
    expect(t.controller.live).toBe('첫 칸이에요. 1박, 비어 있어요.');
    expect(bench.cursor).toBe(0);
    for (let i = 0; i < 3; i++) bench.perform('cursor-right');
    expect(bench.cursor).toBe(2880);
    expect(t.controller.live).toBe('4박, 비어 있어요.');
    bench.perform('cursor-right');
    expect(t.controller.live).toBe('마지막 칸이에요. 4박, 비어 있어요.');
    expect(bench.cursor).toBe(2880);
  });

  it('칸 하나의 크기는 과제가 정한다: 자유로 놀기는 8분음표 칸, 4분음표가 가장 짧은 과제는 4분음표 칸이다', () => {
    const t = setup();
    const bench = enter(t);
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(480);
    expect(bench.cursorLabel()).toBe('1박 2번째 칸');
    t.ic.select(REST_KEY);
    bench.perform('cursor-right');
    bench.perform('cursor-right');
    expect(bench.cursor).toBe(960);
    expect(bench.cursorLabel()).toBe('2박');
  });

  it('고른 칸은 패널이 아는 박(컨트롤러의 고른 칸)도 함께 옮겨 패널로 넘어가도 같은 박이 열린다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    expect(t.controller.selectedCell()).toBeNull();
    bench.selectTick(1920);
    expect(t.controller.selectedCell()).toMatchObject({ measureIndex: 0, onsetTicks: 1920, durationTicks: 960, label: '3박' });
    bench.selectTick(null);
    expect(bench.cursor).toBeNull();
    expect(t.timeline().cursor).toBeNull();
  });

  it('놓기: 고른 칸에 손에 든 돌을 놓고, 남은 물을 함께 알리고, 고른 칸은 놓은 돌의 끝으로 간다. 울림돌을 놓으면 그 음이 들린다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.perform('cursor-right');
    t.touches.length = 0;
    bench.perform('place');
    expect(drawn(t)).toEqual(['C4 0+960']);
    expect(t.controller.live).toBe('1박에 C4 4분음표를 놓았어요. 남은 물은 2박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    expect(bench.cursor).toBe(960);
    expect(bench.cursorLabel()).toBe('2박');
    expect(bench.filled()).toBe(960);
    expect(t.touches.filter((e) => e.kind === 'edit')).toHaveLength(1);
    expect(t.touches.filter((e) => e.listened === 'note')).toHaveLength(1);
    bench.perform('hand-up');
    bench.perform('place');
    expect(drawn(t)).toEqual(['C4 0+960', 'D4 960+960']);
    expect(bench.cursor).toBe(1920);
  });

  it('고른 칸이 없으면 첫 칸에 놓는다. 이끼돌은 소리를 내지 않는다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.pickKind('rest');
    t.touches.length = 0;
    bench.perform('place');
    expect(drawn(t)).toEqual(['쉼 0+960']);
    expect(t.controller.live).toBe('1박에 4분음표 길이의 쉼표를 놓았어요. 남은 물은 2박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    expect(t.touches.filter((e) => e.listened === 'note')).toHaveLength(0);
  });

  it('마지막 칸에 놓으면 고른 칸이 마디 밖으로 나가지 않고 그 칸에 머문다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(2880);
    expect(drawn(t)).toEqual(['C4 2880+960']);
    expect(bench.cursor).toBe(2880);
  });

  it('같은 시작 칸에 놓으면 바꾼다(다른 재료, 다른 음)', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(960);
    bench.pickKind('rest');
    bench.place(960);
    expect(drawn(t)).toEqual(['쉼 960+960']);
    bench.pickKind('note');
    bench.moveHand(1);
    bench.place(960);
    expect(drawn(t)).toEqual(['D4 960+960']);
  });

  it('다른 돌과 겹치면 놓이지 않고 이유를 알린다. 초안은 바뀌지 않는다', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('half', false);
    bench.place(0);
    expect(drawn(t)).toEqual(['C4 0+1920']);
    const before = t.controller.canUndo;
    bench.pickLength('quarter', false);
    bench.place(960);
    expect(t.controller.live).toBe('2박에 C4 4분음표를 놓으면 1박의 C4 2분음표와 겹쳐요. 겹친 것을 먼저 비워 주세요.');
    expect(drawn(t)).toEqual(['C4 0+1920']);
    expect(t.controller.canUndo).toBe(before);
    // 겹침을 알렸어도 고른 칸은 놓으려던 칸이다
    expect(bench.cursor).toBe(960);
    expect(t.timeline().cursor).toMatchObject({ startTick: 960, endTick: 1920, kind: 'note', ok: false });
  });

  it('마디 선을 넘는 돌은 놓이지 않고 이유를 알린다(몇 틱 넘는지, 마디가 몇 틱인지)', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('half', false);
    bench.place(2880);
    expect(t.controller.live).toBe('4박에 C4 2분음표를 놓으면 마디 선을 960틱 넘어요. 마디는 3840틱이에요.');
    expect(drawn(t)).toEqual([]);
    bench.pickLength('quarter', true);
    bench.place(3360);
    expect(t.controller.live).toBe('4박 2번째 칸에 C4 점4분음표를 놓으면 마디 선을 960틱 넘어요. 마디는 3840틱이에요.');
    expect(drawn(t)).toEqual([]);
    expect(t.controller.canUndo).toBe(false);
  });

  it('점이 붙은 돌과 점이 붙은 쉼표를 놓는다(자유로 놀기에서는 칸과 마디에 드는 점음표를 모두 쓴다)', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('half', true);
    bench.place(0);
    expect(drawn(t)).toEqual(['C4 0+2880']);
    expect(t.controller.live).toContain('점2분음표');
    bench.pickKind('rest');
    bench.pickLength('quarter', false);
    bench.place(2880);
    expect(drawn(t)).toEqual(['C4 0+2880', '쉼 2880+960']);
    expect(t.controller.live).toContain('남은 물이 없어요');
    expect(bench.water()).toEqual([]);
  });

  it('빼기: 칸이 돌의 가운데여도 그 돌 전체가 빠지고 고른 칸은 그 돌의 처음으로 간다. 비어 있으면 그렇게 알린다', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('half', false);
    bench.place(0);
    bench.pickLength('quarter', false);
    bench.place(1920);
    expect(drawn(t)).toEqual(['C4 0+1920', 'C4 1920+960']);
    bench.remove(960);
    expect(drawn(t)).toEqual(['C4 1920+960']);
    expect(bench.cursor).toBe(0);
    expect(t.controller.live).toBe('1박의 C4 2분음표를 지웠어요. 남은 물은 2곳, 모두 2880틱이에요. 1박부터 3박까지 1920틱(2분음표 하나 길이), 4박부터 마디 끝까지 960틱(4분음표 하나 길이).');
    bench.remove(960);
    expect(t.controller.live).toBe('2박은 이미 비어 있어요.');
    expect(drawn(t)).toEqual(['C4 1920+960']);
  });

  it('고른 칸이 없을 때의 빼기는 먼저 칸을 고르라고 알린다. 고른 칸을 빼면 그 칸의 돌이 빠진다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(0);
    bench.selectTick(null);
    bench.perform('remove');
    expect(t.controller.live).toBe('빼려면 먼저 칸을 골라 주세요.');
    expect(drawn(t)).toEqual(['C4 0+960']);
    bench.selectTick(0);
    bench.perform('remove');
    expect(drawn(t)).toEqual([]);
    expect(t.controller.live).toContain('지웠어요');
    expect(t.controller.live).toContain('남은 물은 1박부터 마디 끝까지 3840틱');
  });

  it('비우기를 든 채 놓기를 누르면 그 칸의 돌이 빠진다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(0);
    bench.place(960);
    bench.pickKind('erase');
    bench.selectTick(960);
    bench.perform('place');
    expect(drawn(t)).toEqual(['C4 0+960']);
    bench.place(1920);
    expect(t.controller.live).toBe('3박은 이미 비어 있어요.');
  });

  it('실행 취소와 다시 실행은 놓은 것과 뺀 것을 되돌린다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(0);
    bench.place(960);
    bench.remove(0);
    expect(drawn(t)).toEqual(['C4 960+960']);
    bench.perform('undo');
    expect(drawn(t)).toEqual(['C4 0+960', 'C4 960+960']);
    bench.perform('undo');
    expect(drawn(t)).toEqual(['C4 0+960']);
    bench.perform('redo');
    expect(drawn(t)).toEqual(['C4 0+960', 'C4 960+960']);
  });

  it('칸을 고를 때 소리는 내지 않는다(고르기와 듣기는 다르다)', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.place(0);
    t.touches.length = 0;
    bench.selectTick(0);
    bench.perform('cursor-right');
    expect(t.touches).toEqual([]);
  });

  it('칸을 말로 알린다: 비어 있는 칸, 돌이 시작하는 칸, 돌이 이어지는 칸', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('half', false);
    bench.place(960);
    expect(bench.describeAt(0)).toBe('1박, 비어 있어요.');
    expect(bench.describeAt(960)).toBe('2박, C4 2분음표가 놓여 있어요.');
    expect(bench.describeAt(1440)).toBe('2박 2번째 칸, 2박부터 이어지는 C4 2분음표가 놓여 있어요.');
    expect(bench.describeAt(1920)).toBe('3박, 2박부터 이어지는 C4 2분음표가 놓여 있어요.');
    expect(bench.describeAt(2880)).toBe('4박, 비어 있어요.');
  });
});

describe('눌러서 놓기(월드의 돌 자리)', () => {
  it('빈 칸을 누르면 손에 든 돌이 놓인다. 칸이 이미 돌이면 그 돌만 고르고 덮어쓰지 않는다(바꾸려면 놓기)', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    t.press(1);
    expect(drawn(t)).toEqual(['C4 0+960']);
    expect(t.controller.live).toContain('1박에 C4 4분음표를 놓았어요.');
    bench.moveHand(1);
    t.press(1);
    expect(drawn(t)).toEqual(['C4 0+960']);
    expect(t.controller.live).toBe('1박, C4 4분음표가 놓여 있어요. 바꾸려면 놓기를 누르세요.');
    expect(bench.cursor).toBe(0);
    bench.perform('place');
    expect(drawn(t)).toEqual(['D4 0+960']);
  });

  it('돌 자리는 가장 잘게 나눈 칸(1부터)이다. 4분음표가 가장 짧은 과제에서는 칸 두 개가 한 칸이다', () => {
    const t = setup();
    enter(t, REST_KEY);
    t.press(2);
    expect(drawn(t)).toEqual(['C4 0+960']);
    t.press(4);
    expect(drawn(t)).toEqual(['C4 0+960', 'C4 960+960']);
    t.press(8);
    expect(drawn(t)).toEqual(['C4 0+960', 'C4 960+960', 'C4 2880+960']);
    // 자유로 놀기는 8분음표 칸이라 칸 하나가 한 칸이다
    t.ic.select(FREE_KEY);
    t.press(2);
    expect(drawn(t)).toEqual(['C4 480+480']);
  });

  it('3/4박자 과제의 마디 밖 칸(물가 바위)을 누르면 이유를 알리고 아무것도 하지 않는다', () => {
    const t = setup();
    const bench = enter(t, THREE_KEY);
    t.press(7);
    expect(t.controller.live).toBe('물가 바위가 덮은 칸이에요. 이 과제는 3박까지만 써요.');
    t.press(8);
    expect(t.controller.live).toBe('물가 바위가 덮은 칸이에요. 이 과제는 3박까지만 써요.');
    expect(drawn(t)).toEqual([]);
    expect(bench.cursor).toBeNull();
    // 직접 고르기도 같다
    bench.selectTick(2880);
    expect(t.controller.live).toBe('물가 바위가 덮은 칸이에요. 이 과제는 3박까지만 써요.');
    expect(bench.cursor).toBeNull();
    // 마디 안의 마지막 박은 놓인다
    t.press(5);
    expect(drawn(t)).toEqual(['C4 1920+960']);
  });

  it('비우기를 든 채 누르면 그 칸의 돌이 빠진다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    t.press(1);
    bench.pickKind('erase');
    t.press(2);
    expect(drawn(t)).toEqual([]);
    t.press(3);
    expect(t.controller.live).toBe('2박은 이미 비어 있어요.');
  });

  it('겹치는 칸을 누르면 놓이지 않고 이유를 알린다. 돌이 덮고 있는 칸을 누르면 그 돌만 고른다', () => {
    const t = setup();
    const bench = enter(t);
    t.press(3);
    expect(drawn(t)).toEqual(['C4 960+480']);
    // 2분음표를 1박에 놓으면 2박 1번째 칸의 돌과 겹친다
    bench.pickLength('half', false);
    t.press(1);
    expect(t.controller.live).toBe('1박에 C4 2분음표를 놓으면 2박의 C4 8분음표와 겹쳐요. 겹친 것을 먼저 비워 주세요.');
    expect(drawn(t)).toEqual(['C4 960+480']);
    // 돌이 덮은 칸을 누르면 그 돌만 고른다
    t.press(3);
    expect(t.controller.live).toBe('2박, C4 8분음표가 놓여 있어요. 바꾸려면 놓기를 누르세요.');
    expect(drawn(t)).toEqual(['C4 960+480']);
  });

  it('들어가 있지 않거나 다른 설치물의 누르기는 받지 않는다', () => {
    const t = setup();
    t.press(1);
    expect(t.controller.current).toBeNull();
    const bench = enter(t, REST_KEY);
    t.press(1, t.second);
    expect(drawn(t)).toEqual([]);
    t.ic.exit();
    t.press(1);
    expect(drawnFrom(t.session.contentOf(Q02, 'quarter-rest'))).toEqual([]);
    expect(bench.cursor).toBeNull();
  });
});

describe('남은 물과 확인(4.4)', () => {
  it('남은 물은 확인하지 않아도 늘 사실로 알린다: 비었을 때, 일부만 채웠을 때, 가득 채웠을 때', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    expect(bench.waterLine()).toBe('남은 물은 1박부터 마디 끝까지 3840틱(온음표 하나 길이)이에요.');
    bench.place(0);
    expect(bench.waterLine()).toBe('남은 물은 2박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    bench.place(960);
    bench.place(1920);
    bench.place(2880);
    expect(bench.waterLine()).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
    expect(bench.water()).toEqual([]);
    // 가운데가 빈 물은 구간마다 센다
    bench.remove(960);
    expect(bench.water()).toEqual([{ from: 960, to: 1920 }]);
    expect(bench.waterLine()).toBe('남은 물은 2박부터 3박까지 960틱(4분음표 하나 길이)이에요.');
  });

  it('쉼표 4분쉼표가 있는 마디를 돌로 채우고 확인하면 통과한다. 통과했을 때는 표시가 없다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    t.press(1);
    bench.pickKind('rest');
    t.press(3);
    bench.pickKind('note');
    bench.moveHand(1);
    t.press(5);
    bench.moveHand(1);
    t.press(7);
    expect(drawn(t)).toEqual(['C4 0+960', '쉼 960+960', 'D4 1920+960', 'E4 2880+960']);
    expect(t.controller.live).toContain('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
    // 확인하기 전에는 맞고 틀림을 알리지 않는다
    expect(t.controller.feedback).toBeNull();
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.controller.live).toBe('통과했어요.');
    const tl = t.timeline();
    expect(tl.waterEmphasis).toBe(false);
    expect(tl.water).toEqual([]);
    expect(tl.stones.every((s) => !s.flagged)).toBe(true);
    expect(tl.stones.map((s) => [s.startTick, s.endTick, s.kind, s.name])).toEqual([
      [0, 960, 'note', 'C4'],
      [960, 1920, 'rest', null],
      [1920, 2880, 'note', 'D4'],
      [2880, 3840, 'note', 'E4'],
    ]);
  });

  it('3/4박자(세 박 징검다리)도 돌로 채우고 확인하면 통과한다. 마디는 2880틱이다', () => {
    const t = setup();
    const bench = enter(t, THREE_KEY);
    t.press(1);
    bench.pickKind('rest');
    t.press(3);
    bench.pickKind('note');
    bench.moveHand(1);
    bench.moveHand(1);
    t.press(5);
    expect(drawn(t)).toEqual(['C4 0+960', '쉼 960+960', 'E4 1920+960']);
    expect(bench.waterLine()).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.timeline().measureTicks).toBe(2880);
  });

  it('쉼표의 길이: 4분쉼표와 2분쉼표를 이끼돌로 놓아 통과한다', () => {
    const t = setup();
    const bench = enter(t, HALF_REST_KEY);
    expect(bench.step).toBe(960);
    bench.moveHand(1);
    bench.moveHand(1);
    t.press(1);
    bench.pickKind('rest');
    t.press(3);
    bench.pickLength('half', false);
    expect(bench.handName()).toBe('이끼돌 2분쉼표');
    t.press(5);
    expect(drawn(t)).toEqual(['E4 0+960', '쉼 960+960', '쉼 1920+1920']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('쉼표의 길이(높은 도전): 8분음표·8분쉼표·4분음표·2분쉼표를 놓아 통과한다. 칸은 8분음표 칸이다', () => {
    const t = setup();
    const bench = enter(t, EIGHTH_REST_KEY);
    expect(bench.step).toBe(480);
    expect(bench.handName()).toBe('울림돌 C4 8분음표');
    t.press(1);
    bench.pickKind('rest');
    t.press(2);
    bench.pickKind('note');
    bench.moveHand(1);
    bench.pickLength('quarter', false);
    t.press(3);
    bench.pickKind('rest');
    bench.pickLength('half', false);
    t.press(5);
    expect(drawn(t)).toEqual(['C4 0+480', '쉼 480+480', 'D4 960+960', '쉼 1920+1920']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });

  it('틀린 배치를 확인하면 어디가 틀렸는지가 돌과 남은 물에 표시된다. 남은 물은 강조되고 표시된 돌은 깃발이 선다', () => {
    const t = setup();
    const bench = enter(t, THREE_KEY);
    t.press(1);
    t.press(3);
    expect(drawn(t)).toEqual(['C4 0+960', 'C4 960+960']);
    // 확인하기 전에는 강조하지 않는다
    expect(t.timeline().waterEmphasis).toBe(false);
    expect(t.timeline().stones.every((s) => !s.flagged)).toBe(true);
    bench.perform('check');
    const fb = t.controller.feedback!;
    expect(fb.passed).toBe(false);
    expect(fb.issues.map((i) => i.code)).toEqual(['REST_EXPECTED_NOTE_FOUND', 'MISSING_EVENT', 'MEASURE_TICKS_REMAIN']);
    const tl = t.timeline();
    expect(tl.waterEmphasis).toBe(true);
    expect(tl.water).toEqual([{ from: 1920, to: 2880, flagged: true }]);
    expect(tl.stones.map((s) => s.flagged)).toEqual([false, true]);
    // 다리로 올라가는 칸 요약에도 표시가 있다
    expect(t.view().slots.map((s) => s.flagged)).toEqual([false, false, true, true, false, false, false, false]);
    // 고치면 표시가 사라진다
    bench.remove(960);
    bench.pickKind('rest');
    bench.place(960);
    expect(t.timeline().waterEmphasis).toBe(false);
  });

  it('고치고 다시 확인하면 표시가 새로 계산된다', () => {
    const t = setup();
    const bench = enter(t, THREE_KEY);
    t.press(1);
    bench.perform('check');
    expect(t.timeline().waterEmphasis).toBe(true);
    bench.pickKind('rest');
    t.press(3);
    bench.pickKind('note');
    bench.moveHand(1);
    bench.moveHand(1);
    t.press(5);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.timeline().waterEmphasis).toBe(false);
    expect(t.timeline().water).toEqual([]);
  });

  it('아무것도 놓지 않고 확인하면 놓은 것이 없다고 알린다(남은 물은 마디 전체)', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.perform('check');
    expect(t.controller.feedback?.issues.map((i) => i.code)).toEqual(['MISSING_VOICE']);
    expect(t.timeline().water).toEqual([{ from: 0, to: 3840, flagged: false }]);
  });

  it('자유로 놀 때는 판정도 목표도 없다고 알린다. 놓은 돌이 없으면 듣기도 알리기만 한다', () => {
    const t = setup();
    const bench = enter(t);
    bench.perform('check');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_CHECK);
    expect(t.controller.feedback).toBeNull();
    bench.perform('hear-target');
    expect(t.controller.notice).toBe(FREE_PLAY_NO_TARGET);
    expect(t.controller.playing).toBeNull();
    bench.perform('hear-mine');
    expect(t.controller.notice).toBe(NO_STONE_NOTES_NOTICE);
    expect(t.controller.playing).toBeNull();
  });

  it('이끼돌만 놓았을 때도 들을 음이 없다고 알린다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.pickKind('rest');
    bench.place(0);
    bench.perform('hear-mine');
    expect(t.controller.notice).toBe(NO_STONE_NOTES_NOTICE);
    expect(t.controller.playing).toBeNull();
  });
});

describe('월드로 올라가는 모습(다리)', () => {
  it('들어가면 모든 징검다리의 모습이 올라간다: 돌이 없고 물이 마디 전체이며 고른 칸이 없다', () => {
    const t = setup();
    expect(t.bridge.installationViews.get().map((v) => v.installationId)).toEqual([FORD1, FORD2]);
    expect(t.view().timeline).toMatchObject({ measureTicks: 3840, stones: [], waterEmphasis: false, cursor: null, playTick: null });
    enter(t, REST_KEY);
    expect(t.timeline()).toMatchObject({ measureTicks: 3840, gridTicks: 960, beatTicks: 960, stones: [], water: [{ from: 0, to: 3840, flagged: false }], cursor: null });
    expect(t.view().slots).toHaveLength(8);
    expect(t.view().slots.every((s) => s.name === null && !s.selected && !s.playing && !s.flagged)).toBe(true);
  });

  it('놓으면 돌 구간이 올라가고, 칸 요약에는 그 칸을 덮은 돌의 이름과 음이 있다. 고른 칸은 selected다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    t.press(1);
    bench.moveHand(1);
    t.press(3);
    const tl = t.timeline();
    expect(tl.stones).toEqual([
      { startTick: 0, endTick: 960, kind: 'note', name: 'C4', midi: 60, dotted: false, flagged: false, playing: false },
      { startTick: 960, endTick: 1920, kind: 'note', name: 'D4', midi: 62, dotted: false, flagged: false, playing: false },
    ]);
    // 놓은 뒤 고른 칸은 3박이다(놓으려는 자리: 손에 든 D4를 3박에 놓으면)
    expect(tl.cursor).toEqual({ startTick: 1920, endTick: 2880, kind: 'note', ok: true });
    const slots = t.view().slots;
    expect(slots.map((s) => s.name)).toEqual(['C4', 'C4', 'D4', 'D4', null, null, null, null]);
    expect(slots.map((s) => s.midi)).toEqual([60, 60, 62, 62, null, null, null, null]);
    expect(slots.map((s) => s.selected)).toEqual([false, false, false, false, true, true, false, false]);
  });

  it('칸 요약의 칸 하나는 가장 잘게 나눈 칸(480틱)이라, 자유로 놀기에서는 칸마다 하나씩 고른다', () => {
    const t = setup();
    const bench = enter(t);
    bench.place(0);
    bench.place(480);
    expect(t.view().slots.map((s) => s.name)).toEqual(['C4', 'C4', null, null, null, null, null, null]);
    expect(t.view().slots.map((s) => s.selected)).toEqual([false, false, true, false, false, false, false, false]);
    expect(t.timeline().gridTicks).toBe(480);
  });

  it('고른 칸의 표시는 손에 든 것을 놓으면 차지할 구간이다: 이끼돌은 쉼, 비우기는 그 칸의 돌 전체, 비어 있으면 ok 아님', () => {
    const t = setup();
    const bench = enter(t);
    bench.pickLength('half', false);
    bench.place(0);
    bench.selectTick(960);
    // 2분음표를 2박에 놓으면 겹친다
    bench.pickLength('half', false);
    expect(t.timeline().cursor).toEqual({ startTick: 960, endTick: 2880, kind: 'note', ok: false });
    bench.pickKind('rest');
    bench.pickLength('eighth', false);
    expect(t.timeline().cursor).toEqual({ startTick: 960, endTick: 1440, kind: 'rest', ok: false });
    bench.pickKind('erase');
    // 칸의 돌 전체(0부터 1920)를 비운다. 고른 칸(960)은 돌의 처음과 달라서 at으로 따로 실린다(카메라가 따라가는 박을 정한다)
    expect(t.timeline().cursor).toEqual({ startTick: 0, endTick: 1920, at: 960, kind: 'erase', ok: true });
    bench.selectTick(2880);
    expect(t.timeline().cursor).toEqual({ startTick: 2880, endTick: 3360, kind: 'erase', ok: false });
  });

  it('나가면 돌은 풍경으로 남고 고른 칸, 강조, 듣는 위치는 사라진다. 다시 들어오면 그대로 이어진다', () => {
    const t = setup();
    const bench = enter(t, THREE_KEY);
    t.press(1);
    t.press(3);
    bench.perform('check');
    expect(t.timeline().waterEmphasis).toBe(true);
    t.ic.exit();
    const tl = t.timeline();
    expect(tl.stones.map((s) => [s.startTick, s.endTick, s.name])).toEqual([
      [0, 960, 'C4'],
      [960, 1920, 'C4'],
    ]);
    expect(tl.cursor).toBeNull();
    expect(tl.waterEmphasis).toBe(false);
    expect(tl.stones.every((s) => !s.flagged && !s.playing)).toBe(true);
    expect(tl.water).toEqual([{ from: 1920, to: 2880, flagged: false }]);
    expect(tl.playTick).toBeNull();
    t.ic.enter('E1');
    t.ic.select(THREE_KEY);
    expect(t.timeline().stones).toHaveLength(2);
  });

  it('다른 설치물(E2)의 모습은 E1과 따로다', () => {
    const t = setup();
    enter(t, REST_KEY);
    t.press(1);
    expect(t.timeline(t.first).stones).toHaveLength(1);
    expect(t.timeline(t.second).stones).toHaveLength(0);
    t.ic.exit();
    enter(t, `${Q14}/half-quarter-eighths`, 'E2');
    t.press(1, t.second);
    expect(t.timeline(t.second).stones.map((s) => s.name)).toEqual(['G4']);
    expect(t.timeline(t.first).stones).toHaveLength(1);
  });

  it('E2의 점이 붙은 돌: 점2분음표를 놓으면 점이 붙은 돌로 올라간다', () => {
    const t = setup();
    const bench = enter(t, `${Q15}/dotted-half`, 'E2');
    bench.pickLength('half', true);
    expect(bench.handName()).toBe('울림돌 C4 점2분음표');
    t.press(1, t.second);
    expect(t.timeline(t.second).stones).toEqual([{ startTick: 0, endTick: 2880, kind: 'note', name: 'C4', midi: 60, dotted: true, flagged: false, playing: false }]);
    expect(t.controller.live).toContain('점2분음표');
    bench.pickLength('quarter', false);
    bench.moveHand(1);
    bench.place(2880);
    expect(drawn(t)).toEqual(['C4 0+2880', 'D4 2880+960']);
    bench.perform('check');
    expect(t.controller.feedback?.passed).toBe(true);
  });
});

describe('듣는 동안의 따라가기', () => {
  it('내 배치를 들으면 프레임마다 지금 울리는 자리가 올라가고, 정지하면 사라진다(소리를 꺼 두어도 움직인다)', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    t.press(1);
    t.press(3);
    expect(t.timeline().playTick).toBeNull();
    bench.perform('hear-mine');
    expect(t.controller.playing).toBe('mine');
    t.frames.tick();
    t.run(0.2);
    t.frames.tick();
    const early = t.timeline();
    expect(early.playTick).not.toBeNull();
    expect(early.playTick!).toBeGreaterThan(0);
    expect(early.playTick!).toBeLessThan(960);
    expect(early.stones.map((s) => s.playing)).toEqual([true, false]);
    expect(t.view().slots.map((s) => s.playing)).toEqual([true, true, false, false, false, false, false, false]);
    t.run(1);
    t.frames.tick();
    const later = t.timeline();
    expect(later.playTick!).toBeGreaterThan(960);
    expect(later.stones.map((s) => s.playing)).toEqual([false, true]);
    expect(t.view().slots.map((s) => s.playing)).toEqual([false, false, true, true, false, false, false, false]);
    bench.perform('stop');
    t.frames.tick();
    expect(t.controller.playing).toBeNull();
    expect(t.timeline().playTick).toBeNull();
    expect(t.timeline().stones.every((s) => !s.playing)).toBe(true);
  });

  it('목표를 들을 수 있다(자유로 놀 때는 없다). 듣는 동안은 놓은 돌이 따로 울리지 않는다', () => {
    const t = setup();
    const bench = enter(t, REST_KEY);
    bench.perform('hear-target');
    expect(t.controller.playing).toBe('target');
    bench.perform('stop');
    expect(t.controller.playing).toBeNull();
  });
});
