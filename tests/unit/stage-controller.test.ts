// 4.9 합주 무대(T7)의 두뇌: 설치물 컨트롤러의 무대 경로(들어가기, 표지판, 바닥 칸의 모습, 칸 누르기 → 패널 열기, 듣기 범위, 판정 표식, 패널을 다녀오기)와 무대 작업대(StageBench).
// 월드(Phaser)와 화면(Preact) 없이 다리(WorldBridge)와 가짜 소리·가짜 프레임으로 확인한다. 월드 그림은 flow 시험이, 화면은 stage-hud 시험이 맡는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import { FREE_VARIANT_ID, freeHashFor, freeQuestId } from '@/domain/content';
import { pieceInsertEdit } from '@/domain/creation';
import type { Creation } from '@/domain/creation';
import type { ScoreEvent } from '@/domain/score';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { InstallationView } from '@/platform/bridge';
import { FESTIVAL_LABEL, FREE_KEY, FREE_MELODY_LABEL, FREE_MELODY_NOTE, InstallationController, NO_SONGS_NOTE, SONGS_LABEL } from '@/ui/installation/controller';
import type { FrameScheduler } from '@/ui/installation/controller';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET } from '@/ui/challenge/controller';
import { UNUSED_CELL_TEXT } from '@/ui/challenge/stageBench';
import { loadRegionDefs } from '../../tools/world-files';
import { EIGHT, Q01, Q02, Q07, installation, quest, rig, songsOf } from './controller-rig';
import type { RigOptions } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));
const Q08 = 'song.short-piece';
const STAGE = 'inst.village.ensemble-stage';
const FREE_QUEST = freeQuestId(STAGE);
const FREE_HASH = freeHashFor(STAGE);
const HASH_ONE = ContentCatalog.hashFor(Q08, 'one-voice');
const HASH_TWO = ContentCatalog.hashFor(Q08, 'two-voices');

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

function setup(opts: RigOptions & { panels?: string[]; songs?: Creation[]; festival?: { open(): boolean } } = {}) {
  const { panels, songs, festival, ...rigOptions } = opts;
  const r = rig({ definitions: [quest(Q01), quest(Q02), quest(Q07), quest(Q08)], ...rigOptions });
  const bridge = new WorldBridge({ x: 4056, y: 3081, facing: 'right' });
  const inst = installation(STAGE);
  const frames = new FakeFrames();
  const opened: string[] = [];
  const navigated: string[] = [];
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => {} },
    installations: [inst],
    panels: new Set(panels ?? ['panel.song']),
    opened: { mark: (id) => void opened.push(id) },
    ...(songs ? { creations: { list: () => songs, get: (id: string) => songs.find((c) => c.creationId === id) } } : {}),
    ...(festival ? { festival } : {}),
    frames,
  });
  ic.setNavigator((hash) => void navigated.push(hash));
  const slots = (): InstallationView['slots'] => bridge.installationViews.get().find((v) => v.installationId === inst.installationId)!.slots;
  const press = (slot: number): void => bridge.events.send({ type: 'slot-pressed', installationId: inst.installationId, slot });
  /** 목표 악보에서 그 성부·마디의 음표를 초안에 옮긴다(count개까지) */
  const fill = (voiceId: string, measureIndex: number, count = Infinity): void => {
    const events: ScoreEvent[] = r.controller.current!.def.score.events.filter((e) => e.voiceId === voiceId && e.measureIndex === measureIndex).slice(0, count);
    for (const e of events) r.controller.edit({ type: 'addEvent', event: { ...e, eventId: `d-${e.eventId}` } });
  };
  const fillAll = (): void => {
    for (const v of r.controller.scopeVoices()) for (let m = 0; m < 4; m++) fill(v.voiceId, m);
  };
  return { ...r, bridge, inst, ic, frames, opened, navigated, slots, press, fill, fillAll };
}

type T = ReturnType<typeof setup>;
const fills = (t: T): string[] => t.slots().map((s) => s.fill ?? 'none');
/** 무대에 들어가 과제 판본을 고른다. 들어갈 때 기본으로 열리는 것은 자유 가락이다(4.2 맨 위가 기본) */
function enterQuest(t: T, variant = 'one-voice'): void {
  expect(t.ic.enter('H5')).toBe(true);
  expect(t.ic.select(`${Q08}/${variant}`)).toBe(true);
}

describe('들어가기와 표지판(4.9)', () => {
  it('H5에는 무대 설치물이 있고, 들어가면 자유 가락이 열리고 무대 작업대가 생긴다(맨 위가 기본, 4.2)', () => {
    const t = setup();
    expect(t.ic.has('H5')).toBe(true);
    expect(t.ic.isStage(t.inst)).toBe(true);
    expect(t.ic.stage).toBeNull();
    expect(t.ic.enter('H5')).toBe(true);
    expect(t.ic.state.get().mode).toEqual({ installationId: STAGE, stationId: 'H5' });
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    const cur = t.controller.current!;
    expect(cur.free).toBe(true);
    expect(cur.entry.questId).toBe(FREE_QUEST);
    expect(cur.variant.variantId).toBe(FREE_VARIANT_ID);
    expect(cur.entry.title).toBe(FREE_MELODY_LABEL);
    // 목표 악보가 비어 있고, 틀은 첫 판본(한 성부, 4마디 4/4)이다. 가장 짧은 음은 8분음표다
    expect(cur.def.score.events).toEqual([]);
    expect(cur.def.score.measureCount).toBe(4);
    expect(cur.def.challengeDescriptor.smallestValue).toBe('eighth');
    expect(cur.variant.panelIds).toEqual(['panel.song']);
    expect(t.ic.stage).not.toBeNull();
    // 자유 가락은 과제가 아니다: '열어 봄'을 적지 않는다
    expect(t.opened).not.toContain(Q08);
    expect(t.controller.live).toContain('합주 무대에 들어왔어요');
    expect(t.controller.live).toContain('마디를 고르고');
    expect(t.controller.live).toContain('Esc');
  });

  it('돌 설치물은 무대 작업대가 없다', () => {
    const t = setup();
    const stones = installation('inst.village.scale-stones');
    expect(t.ic.isStage(stones)).toBe(false);
    expect(t.ic.stageOf(stones)).toBeNull();
  });

  it('표지판의 맨 위는 자유 가락이고 기본으로 골라져 있다. 그 아래에 과제 판본이 있고, 오가도 자유 가락의 초안은 남는다', () => {
    const t = setup();
    t.ic.enter('H5');
    const entries = t.ic.signOf(t.inst);
    expect(entries[0]).toMatchObject({ key: FREE_KEY, label: FREE_MELODY_LABEL, badge: null, selectable: true, selected: true, action: null, note: FREE_MELODY_NOTE });
    expect(entries.slice(1).map((e) => e.key)).toEqual([`${Q08}/one-voice`, `${Q08}/two-voices`, `${Q08}/challenge`]);
    expect(entries.filter((e) => e.selected).map((e) => e.key)).toEqual([FREE_KEY]);
    expect(t.ic.targetLabel(t.inst)).toBe(FREE_MELODY_LABEL);
    // 저장한 곡과 잔치를 다루는 곳이 연결되지 않았으면 그 항목은 보이지 않는다
    expect(entries.some((e) => e.action !== null || e.key === 'songs')).toBe(false);

    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'x')!);
    expect(t.slots()[0]).toMatchObject({ fill: 'full' });
    expect(t.ic.select(`${Q08}/two-voices`)).toBe(true);
    expect(t.controller.current?.free).toBeUndefined();
    expect(t.ic.targetLabel(t.inst)).toContain('두 성부');
    expect(t.slots()[0]).toMatchObject({ fill: 'empty' });
    expect(t.ic.select(FREE_KEY)).toBe(true);
    expect(t.controller.current?.free).toBe(true);
    expect(t.controller.live).toContain('자유 가락을 골랐어요');
    expect(t.slots()[0]).toMatchObject({ fill: 'full' });
  });

  it('표지판에서 다른 판본을 고르면 그 판본이 열린다', () => {
    const t = setup();
    enterQuest(t);
    expect(t.ic.select(`${Q08}/two-voices`)).toBe(true);
    expect(t.controller.current?.variant.variantId).toBe('two-voices');
    expect(t.ic.targetLabel(t.inst)).toContain('두 성부');
    expect(t.ic.state.get().targetKey).toBe(`${Q08}/two-voices`);
  });

  it('틀로 삼을 과제가 목록에 없으면 들어가지 않는다(모드만 켜 두지 않는다)', () => {
    const t = setup({ definitions: [quest(Q01), quest(Q02), quest(Q07)] });
    expect(t.ic.enter('H5')).toBe(false);
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.bridge.installationMode.get()).toBeNull();
    expect(t.controller.current).toBeNull();
  });

  it('나오면 모드가 풀리고 열었던 도전이 닫히고, 다시 들어가면 놓은 것이 그대로다', () => {
    const t = setup();
    enterQuest(t);
    t.fill('v1', 0);
    t.ic.exit();
    expect(t.ic.state.get().mode).toBeNull();
    expect(t.bridge.installationMode.get()).toBeNull();
    expect(t.controller.current).toBeNull();
    expect(t.controller.live).toContain('합주 무대에서 나왔어요');
    enterQuest(t);
    expect(t.slots()[0]).toMatchObject({ fill: 'full', name: '4/4' });
  });
});

describe('바닥 칸의 모습(4.9)', () => {
  it('한 성부 판본: 위 줄 네 칸은 비어 있고 아래 줄 네 칸은 쓰지 않는다. 돌과 달리 음 높이가 없다', () => {
    const t = setup();
    enterQuest(t);
    expect(t.slots().map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fills(t)).toEqual(['empty', 'empty', 'empty', 'empty', 'unused', 'unused', 'unused', 'unused']);
    expect(t.slots().every((s) => s.midi === null && s.name === null && !s.flagged && !s.selected && !s.playing)).toBe(true);
  });

  it('두 성부 판본: 두 줄 모두 쓴다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.select(`${Q08}/two-voices`);
    expect(fills(t)).toEqual(Array(8).fill('empty'));
  });

  it('칸의 채움은 마디 안의 칸 수로 센다: 비어 있음, n/N, 가득', () => {
    const t = setup();
    enterQuest(t);
    t.fill('v1', 0);
    t.fill('v1', 1, 2);
    expect(fills(t).slice(0, 4)).toEqual(['full', 'partial', 'empty', 'empty']);
    expect(t.slots()[0]!.name).toBe('4/4');
    expect(t.slots()[1]!.name).toBe('2/4');
    expect(t.slots()[2]!.name).toBeNull();
  });

  it('고치면 바닥이 바로 따라온다(되돌리기도)', () => {
    const t = setup();
    enterQuest(t);
    t.fill('v1', 2);
    expect(t.slots()[2]!.fill).toBe('full');
    t.controller.undo();
    expect(t.slots()[2]!.fill).toBe('partial');
    t.controller.clearAll();
    expect(t.slots()[2]!.fill).toBe('empty');
  });

  it('도전이 열려 있지 않아도(걷는 중) 보관된 초안의 채움이 보인다. 고른 마디와 표식은 보이지 않는다', () => {
    const t = setup();
    enterQuest(t);
    t.fill('v1', 0);
    t.ic.stage!.selectMeasure(0);
    t.ic.exit();
    expect(t.slots()[0]).toMatchObject({ fill: 'full', selected: false });
  });
});

describe('칸을 누르면 그 마디가 패널에서 열린다(4.9)', () => {
  it('위 줄의 칸을 누르면 그 마디를 고르고 패널 주소로 간다. 두 성부 칸이 함께 고른 것이다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.select(`${Q08}/two-voices`);
    t.press(3);
    expect(t.ic.stage!.measure()).toBe(2);
    expect(t.navigated).toEqual([HASH_TWO]);
    expect(t.slots().filter((s) => s.selected).map((s) => s.slot)).toEqual([3, 7]);
    expect(t.controller.live).toContain('3마디를 골랐어요');
  });

  it('아래 줄의 칸을 눌러도 같은 마디다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.select(`${Q08}/two-voices`);
    t.press(6);
    expect(t.ic.stage!.measure()).toBe(1);
    expect(t.navigated).toEqual([HASH_TWO]);
  });

  it('쓰지 않는 칸을 누르면 아무것도 바뀌지 않고 이유만 알린다', () => {
    const t = setup();
    enterQuest(t);
    t.press(6);
    expect(t.ic.stage!.measure()).toBeNull();
    expect(t.navigated).toEqual([]);
    expect(t.controller.live).toContain(UNUSED_CELL_TEXT);
    expect(t.controller.live).toContain('아래 성부 2마디 칸');
    // 눈으로 보는 사람에게도 같은 이유가 보인다
    expect(t.controller.notice).toBe('아래 성부 2마디 칸은 이 판본에서 쓰지 않아요.');
    expect(t.slots().some((s) => s.selected)).toBe(false);
  });

  it('쓰지 않는 칸에 대한 안내는 다음에 마디를 고르면 사라진다', () => {
    const t = setup();
    enterQuest(t);
    t.press(6);
    expect(t.controller.notice).not.toBeNull();
    t.press(2);
    expect(t.controller.notice).toBeNull();
    expect(t.ic.stage!.measure()).toBe(1);
  });

  it('고른 마디의 쓰지 않는 칸은 고른 것으로 보이지 않는다(한 성부 판본)', () => {
    const t = setup();
    enterQuest(t);
    t.press(2);
    expect(t.slots().filter((s) => s.selected).map((s) => s.slot)).toEqual([2]);
  });

  it('다른 설치물이나 모드 밖의 누르기는 받지 않는다', () => {
    const t = setup();
    t.press(1);
    expect(t.navigated).toEqual([]);
    enterQuest(t);
    t.bridge.events.send({ type: 'slot-pressed', installationId: 'inst.village.scale-stones', slot: 1 });
    expect(t.navigated).toEqual([]);
    expect(t.ic.stage!.measure()).toBeNull();
  });

  it('없는 칸 번호는 무시한다', () => {
    const t = setup();
    enterQuest(t);
    t.press(9);
    t.press(0);
    expect(t.navigated).toEqual([]);
    expect(t.ic.stage!.measure()).toBeNull();
  });

  it('길이 걸리기 전에는 마디만 고르고 화면은 옮기지 않는다', () => {
    const t = setup();
    t.ic.setNavigator(null);
    enterQuest(t);
    t.press(2);
    expect(t.ic.stage!.measure()).toBe(1);
    expect(t.navigated).toEqual([]);
  });

  it('패널 화면이 없는 판이면 화면을 옮기지 않고 이유를 알린다', () => {
    const t = setup({ panels: [] });
    enterQuest(t);
    t.press(1);
    expect(t.navigated).toEqual([]);
    expect(t.ic.stage!.measure()).toBe(0);
    expect(t.controller.live).toContain('패널 화면을 만드는 중');
  });
});

describe('키 지도(stageKeys)의 동작', () => {
  it('← →는 마디를 옮긴다. 처음에는 1마디부터 시작하고 끝에서는 알리기만 한다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.performStage('cell-right');
    expect(t.ic.stage!.measure()).toBe(0);
    t.ic.performStage('cell-right');
    t.ic.performStage('cell-right');
    t.ic.performStage('cell-right');
    expect(t.ic.stage!.measure()).toBe(3);
    t.ic.performStage('cell-right');
    expect(t.ic.stage!.measure()).toBe(3);
    expect(t.controller.live).toContain('마지막 마디예요');
    t.ic.performStage('cell-left');
    expect(t.ic.stage!.measure()).toBe(2);
    expect(t.navigated).toEqual([]);
  });

  it('첫 마디에서 ←를 누르면 첫 마디라고 알린다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.stage!.selectMeasure(0);
    t.ic.performStage('cell-left');
    expect(t.ic.stage!.measure()).toBe(0);
    expect(t.controller.live).toContain('첫 마디예요');
  });

  it('패널에서 열기: 고른 마디의 주소를 돌려준다. 고른 마디가 없으면 1마디를 골라서 연다', () => {
    const t = setup();
    enterQuest(t);
    expect(t.ic.performStage('view-panel')).toEqual({ navigate: HASH_ONE });
    expect(t.ic.stage!.measure()).toBe(0);
    t.ic.stage!.selectMeasure(2);
    expect(t.ic.performStage('view-panel')).toEqual({ navigate: HASH_ONE });
    expect(t.ic.stage!.measure()).toBe(2);
  });

  it('도움은 도움 카드를 여닫고, 나가기는 나간다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.performStage('help');
    expect(t.ic.state.get().helpOpen).toBe(true);
    t.ic.performStage('help');
    expect(t.ic.state.get().helpOpen).toBe(false);
    t.ic.performStage('exit');
    expect(t.ic.state.get().mode).toBeNull();
  });

  it('무대가 아닌 설치물에는 무대 동작이 없다', () => {
    const t = setup();
    expect(t.ic.performStage('cell-right')).toBeNull();
  });

  it('배치 확인: 비어 있으면 고칠 곳을 알리고, 위 줄 칸에 느낌표가 붙는다. 다 맞게 채우면 통과하고 느낌표가 사라진다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.performStage('check');
    expect(t.controller.feedback?.passed).toBe(false);
    const flagged = t.slots().filter((s) => s.flagged).map((s) => s.slot);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((slot) => slot >= 1 && slot <= 4)).toBe(true);
    t.fillAll();
    t.ic.performStage('check');
    expect(t.controller.feedback?.passed).toBe(true);
    expect(t.slots().some((s) => s.flagged)).toBe(false);
    expect(fills(t).slice(0, 4)).toEqual(['full', 'full', 'full', 'full']);
  });

  it('고치면 이전 판정은 지워져 느낌표도 함께 사라진다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.performStage('check');
    expect(t.slots().some((s) => s.flagged)).toBe(true);
    t.fill('v1', 0, 1);
    expect(t.slots().some((s) => s.flagged)).toBe(false);
  });
});

describe('듣기 범위(4.2, 4.9)', () => {
  it('한 성부 판본: R은 전체와 고른 마디만 돌아간다(성부별은 전체와 같아 없다)', () => {
    const t = setup();
    enterQuest(t);
    expect(t.ic.stage!.scopeChoices()).toEqual([{ kind: 'all' }, { kind: 'measure' }]);
    t.ic.performStage('scope-next');
    expect(t.controller.scopeChoice).toEqual({ kind: 'measure' });
    t.ic.performStage('scope-next');
    expect(t.controller.scopeChoice).toEqual({ kind: 'all' });
  });

  it('두 성부 판본: 전체 → 위 성부만 → 아래 성부만 → 고른 마디만 → 전체', () => {
    const t = setup();
    enterQuest(t);
    t.ic.select(`${Q08}/two-voices`);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(t.controller.scopeLabel());
      t.ic.performStage('scope-next');
    }
    expect(seen).toEqual(['전체', '위 성부만', '아래 성부만', '고른 마디만', '전체']);
  });

  it('전체가 아닌 범위로 들으면 도움 사용으로 적힌다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.select(`${Q08}/two-voices`);
    expect(t.controller.usedAssist()).toBe(false);
    t.ic.performStage('scope-next');
    expect(t.controller.aids.scoped).toBe(true);
    expect(t.controller.usedAssist()).toBe(true);
  });

  it('듣는 동안 울리는 칸이 표지로 따라온다: 전체면 두 줄의 같은 마디, 성부 하나만이면 그 줄만', () => {
    const t = setup();
    enterQuest(t);
    t.ic.select(`${Q08}/two-voices`);
    t.ic.performStage('hear-target');
    expect(t.controller.playing).toBe('target');
    t.run(0.5);
    t.frames.tick();
    expect(t.slots().filter((s) => s.playing).map((s) => s.slot)).toEqual([1, 5]);
    t.ic.performStage('stop');
    t.frames.tick();
    expect(t.slots().some((s) => s.playing)).toBe(false);

    t.controller.setScope({ kind: 'voice', voiceId: 'v2' });
    t.ic.performStage('hear-target');
    t.run(0.5);
    t.frames.tick();
    expect(t.slots().filter((s) => s.playing).map((s) => s.slot)).toEqual([5]);
  });

  it('내 곡 듣기는 놓은 음이 없으면 알림만 하고 울리지 않는다', () => {
    const t = setup();
    enterQuest(t);
    t.ic.performStage('hear-mine');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).not.toBeNull();
  });
});

describe('패널을 다녀오기(4.2, 4.9)', () => {
  it('패널에서 마을로 돌아오면(월드가 다시 걷는 상태가 되면) 무대의 과제가 다시 열려 있고, 고른 마디가 남아 있다', () => {
    const t = setup();
    enterQuest(t);
    t.fill('v1', 0);
    t.press(2);
    // 패널 화면으로 가면 앱이 월드를 멈추고, 주소가 가리키는 과제를 열었다 닫는다
    t.bridge.pause.set(true);
    t.controller.close();
    expect(t.controller.current).toBeNull();
    t.bridge.pause.set(false);
    expect(t.controller.current?.variant.variantId).toBe('one-voice');
    expect(t.ic.stage!.measure()).toBe(1);
    expect(t.slots()[0]!.fill).toBe('full');
    expect(t.slots()[1]!.selected).toBe(true);
  });
});

// ───── 자유 가락(4.9, 5-6) ─────

describe('자유 가락의 바닥(4.9)', () => {
  it('위 줄 네 칸은 비어 있고 아래 줄 네 칸은 쓰지 않는다. 칸 하나는 8분음표다', () => {
    const t = setup();
    t.ic.enter('H5');
    expect(fills(t)).toEqual(['empty', 'empty', 'empty', 'empty', 'unused', 'unused', 'unused', 'unused']);
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT.slice(0, 2), 1, 'b')!);
    expect(fills(t).slice(0, 4)).toEqual(['full', 'partial', 'empty', 'empty']);
    expect(t.slots()[0]!.name).toBe('8/8');
    expect(t.slots()[1]!.name).toBe('2/8');
    expect(t.ic.stage!.describeMeasure(1)).toContain('8칸 중 2칸이 채워졌어요');
  });

  it('위 줄 칸을 누르면 그 마디를 고르고 자유 가락 패널의 주소로 간다', () => {
    const t = setup();
    t.ic.enter('H5');
    t.press(3);
    expect(t.ic.stage!.measure()).toBe(2);
    expect(t.navigated).toEqual([FREE_HASH]);
    expect(t.slots().filter((s) => s.selected).map((s) => s.slot)).toEqual([3]);
    expect(t.controller.live).toContain('3마디를 골랐어요');
  });

  it('아래 줄 칸은 쓰지 않는다고 알리기만 한다', () => {
    const t = setup();
    t.ic.enter('H5');
    t.press(6);
    expect(t.navigated).toEqual([]);
    expect(t.controller.notice).toBe('아래 성부 2마디 칸은 이 판본에서 쓰지 않아요.');
  });

  it('패널에서 열기: 고른 마디가 없으면 1마디를 골라서 자유 가락의 주소를 돌려준다', () => {
    const t = setup();
    t.ic.enter('H5');
    expect(t.ic.performStage('view-panel')).toEqual({ navigate: FREE_HASH });
    expect(t.ic.stage!.measure()).toBe(0);
    expect(t.ic.panelHash()).toBe(FREE_HASH);
  });

  it('패널 화면이 없는 판이면 화면을 옮기지 않고 이유를 알린다', () => {
    const t = setup({ panels: [] });
    t.ic.enter('H5');
    t.press(1);
    expect(t.navigated).toEqual([]);
    expect(t.controller.live).toContain('패널 화면을 만드는 중');
  });

  it('배치 확인은 판정하지 않는다: 시도를 기록하지 않고 이유만 알린다. 목표 듣기도 목표가 없다고 알린다', () => {
    const t = setup();
    t.ic.enter('H5');
    expect(() => t.ic.performStage('check')).not.toThrow();
    expect(t.controller.attempts).toHaveLength(0);
    expect(t.controller.feedback).toBeNull();
    expect(t.controller.notice).toBe(FREE_PLAY_NO_CHECK);
    t.ic.performStage('hear-target');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).toBe(FREE_PLAY_NO_TARGET);
  });

  it('내 가락 듣기: 놓은 음이 없으면 알리기만 하고, 있으면 울리는 마디가 바닥에 따라온다', () => {
    const t = setup();
    t.ic.enter('H5');
    t.ic.performStage('hear-mine');
    expect(t.controller.playing).toBeNull();
    expect(t.controller.notice).not.toBeNull();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    t.ic.performStage('hear-mine');
    expect(t.controller.playing).toBe('mine');
    t.run(0.5);
    t.frames.tick();
    expect(t.slots().filter((s) => s.playing).map((s) => s.slot)).toEqual([1]);
    t.ic.performStage('stop');
    t.frames.tick();
    expect(t.slots().some((s) => s.playing)).toBe(false);
  });

  it('고른 마디만 들으면 그 마디만 울린다', () => {
    const t = setup();
    t.ic.enter('H5');
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 2, 'c')!);
    t.ic.stage!.selectMeasure(2);
    t.controller.setScope({ kind: 'measure' });
    t.ic.performStage('hear-mine');
    expect(t.controller.playing).toBe('mine');
    t.run(0.5);
    t.frames.tick();
    expect(t.slots().filter((s) => s.playing).map((s) => s.slot)).toEqual([3]);
  });

  it('패널을 다녀와도 자유 가락이 다시 열려 있고, 고른 마디와 놓은 것이 남아 있다. 패널로 옮겨도 듣기 범위가 남는다', () => {
    const t = setup();
    t.ic.enter('H5');
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    t.press(2);
    t.controller.setScope({ kind: 'measure' });
    // 앱은 주소가 바뀌면 같은 자유 가락을 다시 연다: 이미 열려 있으면 그대로 둔다
    expect(t.controller.openFree(t.inst)).toBe(true);
    expect(t.controller.scopeChoice).toEqual({ kind: 'measure' });
    t.bridge.pause.set(true);
    t.controller.close();
    expect(t.controller.current).toBeNull();
    t.bridge.pause.set(false);
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.stage!.measure()).toBe(1);
    expect(t.slots()[0]!.fill).toBe('full');
    expect(t.slots()[1]!.selected).toBe(true);
  });

  it('나오면 닫히고, 다시 들어오면 자유 가락이 그대로 열린다', () => {
    const t = setup();
    t.ic.enter('H5');
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 3, 'd')!);
    t.ic.exit();
    expect(t.controller.current).toBeNull();
    expect(t.slots()[3]!.fill).toBe('full');
    t.ic.enter('H5');
    expect(t.controller.current?.free).toBe(true);
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
  });

  it('틀로 삼을 합주 과제가 없으면 자유 가락도 없다: 표지판에서 준비 중이다', () => {
    const t = setup({ definitions: [quest(Q01), quest(Q02), quest(Q07)] });
    expect(t.ic.hasFreeMelody(t.inst)).toBe(false);
    const entry = t.ic.signOf(t.inst)[0]!;
    expect(entry).toMatchObject({ key: FREE_KEY, badge: '준비 중', selectable: false, selected: false });
  });

  it('돌 설치물의 자유로 놀기는 그대로다: 패널이 없다', () => {
    const t = setup();
    const stones = installation('inst.village.scale-stones');
    expect(t.ic.hasFreeMelody(stones)).toBe(false);
    expect(t.controller.openFree(stones)).toBe(true);
    expect(t.controller.current?.variant.panelIds).toEqual([]);
  });
});

describe('표지판의 내 곡 다시 듣기와 잔치 열기(4.9, 6.1 만듦, 6.4)', () => {
  it('저장한 곡이 없으면 내 곡 다시 듣기는 이유만 적고 고를 수 없다', () => {
    const t = setup({ songs: [] });
    t.ic.enter('H5');
    const entry = t.ic.signOf(t.inst).find((e) => e.key === 'songs')!;
    expect(entry).toMatchObject({ label: SONGS_LABEL, selectable: false, selected: false, action: null, target: null, note: NO_SONGS_NOTE });
    expect(t.ic.select('songs')).toBe(false);
  });

  it('저장한 곡이 있으면 곡마다 항목이 있고(최근에 저장한 곡이 위), 고르면 무대에서 들려 준다. 고른 도전은 그대로다', () => {
    const songs = songsOf(2);
    const t = setup({ songs });
    t.ic.enter('H5');
    const entries = t.ic.signOf(t.inst);
    expect(entries.filter((e) => e.key.startsWith('song:')).map((e) => e.key)).toEqual(['song:creation-2', 'song:creation-1']);
    expect(entries.find((e) => e.key === 'song:creation-1')).toMatchObject({ label: `${SONGS_LABEL} · 곡 1`, selectable: true, selected: false, target: null, action: { kind: 'song', creationId: 'creation-1' }, note: '4마디 · 음 8개' });
    expect(t.ic.select('song:creation-1')).toBe(true);
    expect(t.controller.previewing).toBe(true);
    expect(t.controller.playing).toBeNull();
    expect(t.ic.previewLabel()).toBe('곡 1');
    expect(t.controller.live).toContain('곡 1을 들려 줘요');
    // 고른 도전(자유 가락)은 그대로다
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    expect(t.controller.current?.free).toBe(true);
    // 위 줄의 마디가 차례로 울린다(첫 곡은 8분음표 여덟 개가 첫 마디만 채운다: 1마디가 울린다)
    t.run(0.5);
    t.frames.tick();
    expect(t.slots().filter((s) => s.playing).map((s) => s.slot)).toEqual([1]);
    t.run(3);
    t.frames.tick();
    expect(t.slots().filter((s) => s.playing).map((s) => s.slot)).toEqual([2]);
    t.ic.performStage('stop');
    t.frames.tick();
    expect(t.controller.previewing).toBe(false);
    expect(t.ic.previewLabel()).toBeNull();
    expect(t.slots().some((s) => s.playing)).toBe(false);
  });

  it('끝까지 들으면 저절로 멈춘다. 다른 곡을 고르면 먼저 듣던 것은 멈추고 새 곡이 들린다', () => {
    const t = setup({ songs: songsOf(2) });
    t.ic.enter('H5');
    t.ic.select('song:creation-1');
    t.run(13);
    expect(t.controller.previewing).toBe(false);
    t.ic.select('song:creation-1');
    t.run(1);
    t.ic.select('song:creation-2');
    expect(t.ic.previewLabel()).toBe('곡 2');
    expect(t.controller.previewing).toBe(true);
  });

  it('나가면 듣던 곡은 멈춘다', () => {
    const t = setup({ songs: songsOf(1) });
    t.ic.enter('H5');
    t.ic.select('song:creation-1');
    expect(t.controller.previewing).toBe(true);
    t.ic.exit();
    expect(t.controller.previewing).toBe(false);
  });

  it('없는 곡은 들려 주지 않는다', () => {
    const t = setup({ songs: songsOf(1) });
    t.ic.enter('H5');
    expect(t.ic.playSong('creation-9')).toBe(false);
    expect(t.controller.previewing).toBe(false);
    expect(t.ic.select('song:creation-9')).toBe(false);
  });

  it('잔치 열기는 연결되어 있을 때만 표지판에 있고, 고르면 잔치를 연다', () => {
    const calls: number[] = [];
    const t = setup({ festival: { open: () => (calls.push(1), true) } });
    t.ic.enter('H5');
    const entry = t.ic.signOf(t.inst).find((e) => e.key === 'festival')!;
    expect(entry).toMatchObject({ label: FESTIVAL_LABEL, selectable: true, selected: false, target: null, action: { kind: 'festival' } });
    expect(t.ic.select('festival')).toBe(true);
    expect(calls).toEqual([1]);
    expect(t.ic.state.get().targetKey).toBe(FREE_KEY);
    const none = setup();
    none.ic.enter('H5');
    expect(none.ic.signOf(none.inst).some((e) => e.key === 'festival')).toBe(false);
  });

  it('잔치를 열 수 없으면 고를 수 없는 것으로 돌려준다', () => {
    const t = setup({ festival: { open: () => false } });
    t.ic.enter('H5');
    expect(t.ic.select('festival')).toBe(false);
  });
});
