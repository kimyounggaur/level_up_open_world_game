// 4-4 세계 반응 추적기: 재료를 놓거나 들으면 등불이 켜지고, 통과하면 꽃등과 층이 오르며, 오답과 새로 고침 뒤에도 유지된다(6.1, W-6).
// 계산 자체는 reaction.test.ts가 본다. 여기서는 '언제 다시 계산하고 누구에게 알리는가'를 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VisitedStations } from '@/app/visited';
import { ReactionTracker } from '@/app/reaction';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { FREE_QUEST_PREFIX } from '@/domain/content';
import { parseInstallation } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { WorldMap, parseRegion } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import type { TouchEvent } from '@/ui/challenge/controller';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const regionsDir = path.join(root, 'content', 'regions');
const map = new WorldMap(fs.readdirSync(regionsDir).filter((f) => f.endsWith('.json')).map((f) => parseRegion(JSON.parse(fs.readFileSync(path.join(regionsDir, f), 'utf-8')), f).region!));
const instFile = 'inst.village.scale-stones.json';
const stones: InstallationDef = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', instFile), 'utf-8')), instFile).installation!;

const Q01 = 'pitch.same-note-two-clefs';
const Q02 = 'rhythm.rest-in-a-bar';
const Q07 = 'scale.major';

let n = 0;
const attempt = (questId: string, passed: boolean): AttemptResult =>
  makeAttemptResult({
    attemptId: `a${++n}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: passed
      ? { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} }
      : { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: false, issues: [{ code: 'MISSING_PLACEMENT', params: {} }], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);

/** 컨트롤러 대신: 시도 기록과 '만졌다' 사건을 직접 보낸다 */
function fakeController(initial: readonly AttemptResult[] = []) {
  const log: AttemptResult[] = [...initial];
  const attemptListeners = new Set<(a: AttemptResult) => void>();
  const touchListeners = new Set<(t: TouchEvent) => void>();
  return {
    get attempts(): readonly AttemptResult[] {
      return log;
    },
    onAttempt(l: (a: AttemptResult) => void) {
      attemptListeners.add(l);
      return () => attemptListeners.delete(l);
    },
    onTouch(l: (t: TouchEvent) => void) {
      touchListeners.add(l);
      return () => touchListeners.delete(l);
    },
    record(a: AttemptResult): void {
      log.push(a);
      for (const l of [...attemptListeners]) l(a);
    },
    touch(t: TouchEvent): void {
      for (const l of [...touchListeners]) l(t);
    },
    listeners: () => attemptListeners.size + touchListeners.size,
  };
}

function setup(opts: { attempts?: readonly AttemptResult[]; visited?: readonly string[] } = {}) {
  const controller = fakeController(opts.attempts);
  const visited = new VisitedStations(opts.visited ?? []);
  const bridge = new WorldBridge({ x: 0, y: 0, facing: 'down' });
  const tracker = new ReactionTracker({ map, controller, visited, installations: [stones], bridge });
  return { controller, visited, bridge, tracker };
}

const edit = (questId: string): TouchEvent => ({ questId, variantId: 'v', kind: 'edit' });

describe('처음 상태', () => {
  it('기록이 없으면 합주 0층이고 모든 등불이 꺼져 있다. 알릴 소식도 없다', () => {
    const { tracker, bridge } = setup();
    const r = tracker.store.get();
    expect(r.ensembleLevel).toBe(0);
    expect(Object.values(r.lanterns).every((s) => s === 'off')).toBe(true);
    expect(Object.keys(bridge.lanterns.get())).toHaveLength(map.stations.length);
    expect(tracker.pending.get()).toEqual([]);
  });

  it('저장에서 읽은 통과 기록과 다녀간 곳은 처음부터 반영하되 새 소식으로 알리지 않는다', () => {
    const { tracker, bridge } = setup({ attempts: [attempt(Q01, true)], visited: ['H4'] });
    const r = tracker.store.get();
    expect(r.lanterns.H1).toBe('flower');
    expect(r.lanterns.H4).toBe('on');
    expect(r.ensembleLevel).toBeGreaterThan(0);
    expect(bridge.lanterns.get().H1).toBe('flower');
    expect(tracker.pending.get()).toEqual([]);
  });
});

describe('다녀감: 재료를 놓거나 들으면 등불이 켜진다', () => {
  it('과제를 만지면 그 과제가 놓인 정거장 모두에 불이 켜진다(어느 길로 열었든 같다, W-2)', () => {
    const { controller, visited, bridge, tracker } = setup();
    controller.touch(edit(Q07));
    const stationsOfQ07 = map.stationsForQuest(Q07).map((s) => s.stationId);
    expect(stationsOfQ07.length).toBeGreaterThanOrEqual(2); // H4와 S1
    for (const id of stationsOfQ07) {
      expect(visited.has(id)).toBe(true);
      expect(bridge.lanterns.get()[id]).toBe('on');
    }
    expect(tracker.store.get().lanterns.H1).toBe('off');
  });

  it('듣는 것도 만진 것이다', () => {
    const { controller, bridge } = setup();
    controller.touch({ questId: Q02, variantId: 'v', kind: 'listen' });
    expect(bridge.lanterns.get().H2).toBe('on');
  });

  it('자유로 놀기에서 놓아도 그 설치물이 선 정거장에 불이 켜진다', () => {
    const { controller, bridge } = setup();
    controller.touch({ questId: `${FREE_QUEST_PREFIX}${stones.installationId}`, variantId: 'free', kind: 'edit', freeInstallationId: stones.installationId });
    expect(bridge.lanterns.get()[stones.stationCode]).toBe('on');
    expect(bridge.lanterns.get().S1).toBe('off');
  });

  it('모르는 설치물이나 지도에 없는 과제는 아무 불도 켜지 않는다', () => {
    const { controller, visited } = setup();
    controller.touch({ questId: `${FREE_QUEST_PREFIX}inst.nowhere`, variantId: 'free', kind: 'edit', freeInstallationId: 'inst.nowhere' });
    controller.touch(edit('no.such.quest'));
    expect(visited.toArray()).toEqual([]);
  });

  it('새로 켜진 등불을 사실 문장으로 알리고, 같은 곳을 다시 만지면 다시 알리지 않는다', () => {
    const { controller, tracker } = setup();
    controller.touch(edit(Q07));
    const first = tracker.pending.get();
    expect(first).toContain('음계 디딤돌의 등불이 켜졌어요.');
    controller.touch(edit(Q07));
    expect(tracker.pending.get()).toEqual(first);
  });
});

describe('해냄: 통과하면 꽃등이 되고 층이 오른다', () => {
  it('Q01, Q02, Q07을 차례로 통과하면 마을의 층이 1, 2, 3으로 오른다', () => {
    const { controller, tracker } = setup();
    const village = (): number => tracker.store.get().regionLayers.village;
    expect(village()).toBe(0);
    controller.record(attempt(Q01, true));
    expect(village()).toBe(1);
    controller.record(attempt(Q02, true));
    expect(village()).toBe(2);
    controller.record(attempt(Q07, true));
    expect(village()).toBe(3);
    expect(tracker.store.get().ensembleLevel).toBeGreaterThanOrEqual(3);
  });

  it('꽃등과 층이 오르면 사실 문장으로 알린다(칭찬이나 평가가 없다, W-9)', () => {
    const { controller, tracker } = setup();
    controller.record(attempt(Q01, true));
    const lines = tracker.pending.get();
    expect(lines.some((l) => l.endsWith('의 등불이 꽃등이 되었어요.'))).toBe(true);
    expect(lines).toContain('음악 마을의 소리가 1층이 되었어요.');
    expect(lines.at(-1)).toMatch(/^합주 \d+층이 되었어요\.$/);
    for (const l of lines) expect(l).not.toMatch(/잘했|훌륭|축하|대단|최고/);
  });

  it('오답은 아무것도 줄이거나 바꾸지 않는다. 통과 뒤에 틀려도 그대로다(W-6)', () => {
    const { controller, tracker } = setup();
    controller.record(attempt(Q01, true));
    const before = tracker.store.get();
    const notes = tracker.pending.get();
    controller.record(attempt(Q01, false));
    controller.record(attempt(Q01, false));
    expect(tracker.store.get()).toBe(before); // 같은 값: 알리지도 않았다
    expect(tracker.pending.get()).toBe(notes);
  });

  it('통과 없이 틀리기만 해도 등불은 꽃등이 되지 않는다', () => {
    const { controller, tracker } = setup();
    controller.record(attempt(Q07, false));
    expect(tracker.store.get().ensembleLevel).toBe(0);
    expect(tracker.store.get().lanterns.H4).toBe('off');
  });

  it('통과하면 다녀가지 않았어도 꽃등이다(꽃등은 켜진 것의 다음 단계)', () => {
    const { controller, tracker, visited } = setup();
    controller.record(attempt(Q07, true));
    expect(tracker.store.get().lanterns.H4).toBe('flower');
    expect(visited.has('H4')).toBe(false);
  });

  it('같은 과제를 다시 통과해도 층은 한 번만 센다', () => {
    const { controller, tracker } = setup();
    controller.record(attempt(Q01, true));
    const level = tracker.store.get().ensembleLevel;
    controller.record(attempt(Q01, true));
    expect(tracker.store.get().ensembleLevel).toBe(level);
  });
});

describe('새 소식 가져가기', () => {
  it('화면이 가져가면 비워진다. 가져갈 것이 없으면 알리지 않는다', () => {
    const { controller, tracker } = setup();
    let notified = 0;
    tracker.pending.subscribe(() => void notified++);
    expect(tracker.takePending()).toEqual([]);
    expect(notified).toBe(0);
    controller.touch(edit(Q02));
    expect(notified).toBe(1);
    const lines = tracker.takePending();
    expect(lines.length).toBeGreaterThan(0);
    expect(tracker.pending.get()).toEqual([]);
    expect(notified).toBe(2);
  });

  it('가져가지 않은 소식은 쌓인다', () => {
    const { controller, tracker } = setup();
    controller.touch(edit(Q02));
    const a = tracker.pending.get().length;
    controller.record(attempt(Q02, true));
    expect(tracker.pending.get().length).toBeGreaterThan(a);
  });
});

describe('저장과 끝내기', () => {
  it('다녀간 곳은 정렬한 목록으로 내보내고, 그 목록으로 다시 시작해도 같은 등불이다', () => {
    const a = setup();
    a.controller.touch(edit(Q07));
    a.controller.touch(edit(Q02));
    const saved = a.visited.toArray();
    expect(saved).toEqual([...saved].sort());
    expect(saved).toContain('H2');
    expect(saved).toContain('H4');
    const b = setup({ visited: saved });
    expect(b.tracker.store.get().lanterns).toEqual(a.tracker.store.get().lanterns);
  });

  it('끝내면 구독을 모두 풀고 더는 알리지 않는다', () => {
    const { controller, tracker, visited } = setup();
    tracker.dispose();
    expect(controller.listeners()).toBe(0);
    controller.touch(edit(Q07));
    controller.record(attempt(Q01, true));
    expect(visited.toArray()).toEqual([]);
    expect(tracker.pending.get()).toEqual([]);
  });
});
