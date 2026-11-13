// 2-5~2-7 컨트롤러: 판정과 기록, 소리 켜기 전 무음, 느리게 듣기와 원래 템포, 박 반복, 도움 연습 복귀.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Mixer } from '@/audio/mixer';
import { TaskTransport } from '@/audio/transport';
import { ContentCatalog } from '@/domain/catalog';
import { clearStaffSlotEdit, placeInCellEdit, placeOnStaffEdit, staffSlotsOf } from '@/domain/challenge';
import type { Material } from '@/domain/challenge';
import type { QuestDefinition } from '@/domain/content';
import { ChallengeSession } from '@/domain/session';
import { NO_NOTES_NOTICE, ChallengeController } from '@/ui/challenge/controller';
import { FakeClock, FakeEngine, FakeTimer } from './audio-fakes';
import { p } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
const Q01 = 'pitch.same-note-two-clefs';
const Q02 = 'rhythm.rest-in-a-bar';
const Q07 = 'scale.major';

const note = (t: string): Material => ({ kind: 'note', pitch: p(t), value: 'quarter' });
const rest: Material = { kind: 'rest', value: 'quarter' };

function rig(extra: readonly QuestDefinition[] = []) {
  const catalog = new ContentCatalog([quest(Q01), quest(Q02), quest(Q07), ...extra], 'preview');
  const session = new ChallengeSession();
  const engine = new FakeEngine();
  const mono = new FakeClock(10);
  const mixer = new Mixer({ createEngine: () => engine, monotonicNow: () => mono.now(), setTimer: () => () => {} });
  const timer = new FakeTimer();
  const transport = new TaskTransport({ clock: mixer.clock, timer, sink: mixer.taskSink });
  let n = 0;
  const controller = new ChallengeController({ catalog, session, mixer, transport, makeId: () => `att-${++n}`, nowIso: () => '2026-11-10T00:00:00.000Z' });
  const run = (seconds: number): void => {
    const end = mono.t + seconds;
    while (mono.t < end - 1e-9) {
      mono.t = Math.min(end, mono.t + 0.025);
      engine.clock.t += 0.025;
      timer.fire();
    }
  };
  const fillB02 = (): void => {
    const cells = controller.cells();
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), cells[0]!, note('C4')));
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), cells[1]!, note('D4')));
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), cells[2]!, note('D4')));
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), cells[3]!, note('E4')));
  };
  const fixB02 = (): void => {
    const cells = controller.cells();
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), cells[1]!, rest));
  };
  return { catalog, session, engine, mono, mixer, timer, transport, controller, run, fillB02, fixB02 };
}

describe('열기', () => {
  it('과제를 열면 도전 설정에 원래 템포가 들어간다. 소리는 저절로 나지 않는다', () => {
    const { controller, session, engine } = rig();
    const r = controller.open(Q02, 'quarter-rest');
    expect(r.ok).toBe(true);
    expect(controller.current!.entry.title).toBe('쉼이 있는 한 마디');
    expect(session.activeChallenge!.challengeSettings.tempoBpm).toBe(80);
    expect(controller.playing).toBeNull();
    expect(engine.startCalls).toBe(0);
  });

  it('없는 id는 이유와 전체 목록을 돌려주고 다른 도전을 열지 않는다', () => {
    const { controller } = rig();
    const r = controller.open('nope.nothing');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('unknownQuest');
      expect(r.all).toHaveLength(3);
    }
    expect(controller.current).toBeNull();
  });

  it('진행 기록 없이도 바로 열린다(W-2)', () => {
    const { controller } = rig();
    expect(controller.attempts).toHaveLength(0);
    expect(controller.open(Q01, 'middle-c').ok).toBe(true);
  });
});

describe('판정과 기록', () => {
  it('시안의 상태(둘째 박에 D4)에서 시안과 같은 문장이 나오고 needsRevision으로 기록된다', () => {
    const { controller, fillB02 } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    const f = controller.check();
    expect(f.passed).toBe(false);
    expect(f.messages).toEqual(['두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.']);
    const a = controller.attempts.at(-1)!;
    expect(a).toMatchObject({ questId: Q02, variantId: 'quarter-rest', resultType: 'needsRevision', tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, slowerThanOriginal: false, hearing: 'notMeasured' });
    expect(a.issues[0]!.code).toBe('REST_EXPECTED_NOTE_FOUND');
    expect(a.contentVersion).toBe('0.1.0');
  });

  it('둘째 박을 쉼으로 고치면 통과로 기록된다', () => {
    const { controller, fillB02, fixB02 } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    controller.check();
    fixB02();
    const f = controller.check();
    expect(f.passed).toBe(true);
    expect(f.messages).toEqual([]);
    expect(controller.attempts.map((x) => x.resultType)).toEqual(['needsRevision', 'passed']);
    expect(controller.attempts.map((x) => x.attemptId)).toEqual(['att-1', 'att-2']);
  });

  it('고치면 이전 판정은 사라진다(맞지 않는 문장을 보여 주지 않는다)', () => {
    const { controller, fillB02, fixB02 } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    controller.check();
    expect(controller.feedback).not.toBeNull();
    fixB02();
    expect(controller.feedback).toBeNull();
  });

  it('Q01: 높은음자리표 맨 아랫줄에 놓으면 E4로 읽고 실패한다', () => {
    const { controller } = rig();
    controller.open(Q01, 'middle-c');
    const slots = staffSlotsOf(controller.current!.def);
    controller.edit(placeOnStaffEdit(slots[0]!, 0));
    controller.edit(placeOnStaffEdit(slots[1]!, 10));
    const f = controller.check();
    expect(f.passed).toBe(false);
    expect(f.messages).toEqual(['지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.']);
    controller.edit(placeOnStaffEdit(slots[0]!, -2));
    expect(controller.check().passed).toBe(true);
    controller.edit(clearStaffSlotEdit(slots[0]!));
    expect(controller.check().messages).toEqual(['높은음자리표 보표에 음이 아직 없어요.']);
  });

  it('판정기가 연결되지 않은 과제는 틀린 것이 아니라 기술 문제로 기록한다(W-8)', () => {
    // 일곱 판정기는 5단계에서 모두 연결했다. 앞으로 늘어날 종류를 흉내 낸 판정기를 가진 과제로 확인한다
    const unwired = quest(Q07);
    const base = unwired.variants['c-major']!;
    const fake: QuestDefinition = { ...unwired, questId: 'fake.unwired', variantIds: ['v1'], variants: { v1: { ...base, evaluatorSpec: { type: 'futureEvaluator' } as never } }, placements: [{ kind: 'panel', panelId: 'panel.song', variantIds: ['v1'] }] };
    const { controller } = rig([fake]);
    controller.open('fake.unwired', 'v1');
    const f = controller.check();
    expect(f.technical).toBe(true);
    expect(f.passed).toBe(false);
    expect(f.messages[0]).toContain('틀린 것이 아니에요');
    const a = controller.attempts.at(-1)!;
    expect(a.resultType).toBe('technicalError');
    expect(a.technical?.kind).toBe('content');
    expect(a.issues).toEqual([]);
  });

  it('시도를 알리는 구독자가 기록을 받는다', () => {
    const { controller, fillB02 } = rig();
    const seen: string[] = [];
    controller.onAttempt((a) => seen.push(a.attemptId));
    controller.open(Q02, 'quarter-rest');
    fillB02();
    controller.check();
    expect(seen).toEqual(['att-1']);
  });
});

describe('소리', () => {
  it('소리 켜기를 누르기 전에는 재생 막대는 움직여도 소리는 나가지 않는다(W-11)', () => {
    const { controller, fillB02, run, engine, mixer } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    expect(controller.playMine()).toBe(true);
    run(1.2);
    expect(controller.playing).toBe('mine');
    expect(controller.positionTick()).toBeGreaterThan(0);
    expect(engine.startCalls).toBe(0);
    expect(engine.sinks.size).toBe(0);
    expect(controller.soundAudible).toBe(false);
    expect(mixer.snapshot().state).toBe('off');
  });

  it('소리 켜기 뒤에는 악보의 음이 해석된 높이로 나간다. 쉼표 자리는 건너뛴다', async () => {
    const { controller, fillB02, fixB02, run, engine } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    await controller.enableSound();
    expect(engine.startCalls).toBe(1);
    controller.playMine();
    run(4);
    const sink = engine.sinks.get('task')!;
    expect(sink.live().map((r) => r.midi)).toEqual([60, 62, 64]);
    expect(sink.live().map((r) => r.id)).toEqual(['u-m0c0', 'u-m0c2', 'u-m0c3']);
  });

  it('목표 듣기는 목표 악보의 음을 낸다', async () => {
    const { controller, run, engine } = rig();
    controller.open(Q02, 'quarter-rest');
    await controller.enableSound();
    controller.playTarget();
    run(4);
    expect(engine.sinks.get('task')!.live().map((r) => r.midi)).toEqual([60, 62, 64]);
    expect(controller.playing).toBeNull(); // 끝까지 재생하면 멈춘 상태로 돌아간다
  });

  it('놓은 음이 없으면 재생하지 않고 이유를 알려 준다', () => {
    const { controller } = rig();
    controller.open(Q02, 'quarter-rest');
    expect(controller.playMine()).toBe(false);
    expect(controller.notice).toBe(NO_NOTES_NOTICE);
    expect(controller.playing).toBeNull();
  });

  it('고치면 재생이 멈추고 남은 예약이 없다', async () => {
    const { controller, fillB02, run, engine } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    await controller.enableSound();
    controller.playMine();
    run(0.5);
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), controller.cells()[3]!, rest));
    expect(controller.playing).toBeNull();
    expect(engine.sinks.get('task')!.pending()).toHaveLength(0);
  });

  it('재생하는 동안 세계 소리는 줄고 멈추면 돌아온다', async () => {
    const { controller, fillB02, mixer } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    await controller.enableSound();
    controller.playMine();
    expect(mixer.snapshot().ducked).toBe(true);
    controller.stopPlayback();
    expect(mixer.snapshot().ducked).toBe(false);
  });

  it('소리를 켜지 못해도 편집·재생·판정이 계속된다. 소리 때문에 틀린 것으로 기록하지 않는다(W-8)', async () => {
    const { controller, fillB02, fixB02, run, engine } = rig();
    engine.startError = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    await controller.enableSound();
    expect(controller.sound.state).toBe('failed');
    expect(controller.sound.message).toContain('소리 없이도 계속할 수 있어요');
    expect(controller.playMine()).toBe(true);
    run(1);
    expect(controller.playing).toBe('mine');
    const f = controller.check();
    expect(f.passed).toBe(true);
    expect(controller.attempts.at(-1)).toMatchObject({ resultType: 'passed', hearing: 'notMeasured' });
  });

  it('내 배치를 소리 켠 채 들은 뒤 그대로 확인하면 듣기를 확인한 것으로 기록된다. 고치면 아니다', async () => {
    const { controller, fillB02, fixB02, run } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    await controller.enableSound();
    controller.playMine();
    run(0.2);
    controller.check();
    expect(controller.attempts.at(-1)!.hearing).toBe('confirmed');
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), controller.cells()[0]!, note('D4')));
    controller.check();
    expect(controller.attempts.at(-1)!.hearing).toBe('notMeasured');
  });
});

describe('도움: 느리게 듣기, 박 반복, 박 수 표시', () => {
  it('느리게 들어도 원래 템포 설정은 그대로다(2-7)', async () => {
    const { controller, session, fillB02, fixB02, run, transport } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    await controller.enableSound();
    controller.setSlow(true);
    expect(controller.tempo()).toEqual({ original: 80, effective: 50, slow: true });
    controller.playMine();
    expect(transport.bpm).toBe(50);
    run(1);
    expect(session.activeChallenge!.challengeSettings.tempoBpm).toBe(80);
    controller.setSlow(false); // 재생 중에 끄면 원래 템포로 다시 시작한다
    expect(transport.bpm).toBe(80);
    expect(controller.playing).toBe('mine');
    controller.stopPlayback();
    controller.playMine();
    expect(transport.bpm).toBe(80);
    expect(controller.tempo()).toEqual({ original: 80, effective: 80, slow: false });
    expect(session.activeChallenge!.challengeSettings.tempoBpm).toBe(80);
  });

  it('느린 템포로 통과하면 기록에 도움 사용과 느린 템포가 남는다(7.6)', () => {
    const { controller, fillB02, fixB02 } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    controller.setSlow(true);
    controller.check();
    expect(controller.attempts.at(-1)).toMatchObject({ resultType: 'passed', tempoBpm: 50, originalTempoBpm: 80, slowerThanOriginal: true, assistUsed: true });
  });

  it('도움을 쓰지 않았으면 기록에 도움 사용이 없다. 박 수 표시도 도움으로 센다', () => {
    const { controller, fillB02, fixB02 } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    controller.check();
    expect(controller.attempts.at(-1)!.assistUsed).toBe(false);
    controller.setShowCount(true);
    controller.check();
    expect(controller.attempts.at(-1)!.assistUsed).toBe(true);
  });

  it('칸을 고르지 않으면 반복을 켤 수 없다. 이유를 알려 준다', () => {
    const { controller } = rig();
    controller.open(Q02, 'quarter-rest');
    controller.setRepeat(true);
    expect(controller.aids.repeat).toBe(false);
    expect(controller.notice).toBe('반복할 박 칸을 먼저 골라 주세요.');
    expect(controller.repeatLabel()).toBe('박 반복');
  });

  it('고른 박 칸만 되풀이해서 듣는다. 예: 두 번째 박 반복', async () => {
    const { controller, fillB02, fixB02, run, transport, engine } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    fixB02();
    controller.edit(placeInCellEdit(controller.current!.def, controller.content(), controller.cells()[1]!, note('D4')));
    await controller.enableSound();
    controller.selectCell(controller.cells()[1]!);
    expect(controller.repeatLabel()).toBe('두 번째 박 반복');
    controller.setRepeat(true);
    controller.playMine();
    expect(transport.section).toEqual({ startTick: 960, endTick: 1920 });
    expect(transport.repeating).toBe(true);
    run(3);
    const sounded = engine.sinks.get('task')!.live();
    expect(sounded.length).toBeGreaterThanOrEqual(3);
    expect(new Set(sounded.map((r) => r.midi))).toEqual(new Set([62]));
    controller.setRepeat(false);
    expect(transport.section).toBeNull();
    expect(transport.repeating).toBe(false);
  });

  it('재생 중인 박 칸을 알려 준다(박 수 표시에 쓴다)', () => {
    const { controller, fillB02, run } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    controller.playMine();
    run(0.1);
    expect(controller.playheadCell()!.label).toBe('1박');
    run(1.0); // 80bpm에서 4분음표는 0.75초
    expect(controller.playheadCell()!.label).toBe('2박');
  });
});

describe('도움 연습과 돌아가기', () => {
  it('연습에서 아무것도 하지 않고 돌아와도 초안과 선택이 같다. 연습 중 재생은 멈춘다', () => {
    const { controller, session, fillB02 } = rig();
    controller.open(Q02, 'quarter-rest');
    fillB02();
    controller.selectCell(controller.cells()[1]!);
    const before = JSON.stringify([controller.content(), session.selection()]);
    controller.playMine();
    session.enterAssist('basicPractice', 'rhythm.rest-in-a-bar');
    expect(controller.inAssist).toBe(true);
    controller.returnToOrigin();
    expect(controller.inAssist).toBe(false);
    expect(controller.playing).toBeNull();
    expect(JSON.stringify([controller.content(), session.selection()])).toBe(before);
    expect(controller.current!.entry.questId).toBe(Q02);
  });

  it('여러 번 눌러도 같다', () => {
    const { controller, session } = rig();
    controller.open(Q02, 'quarter-rest');
    session.enterAssist('basicPractice', 'x');
    controller.returnToOrigin();
    controller.returnToOrigin();
    expect(controller.inAssist).toBe(false);
  });
});
