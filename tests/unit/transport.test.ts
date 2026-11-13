// 2-1 과제 재생기 검사. 가짜 시계에서 정지 뒤 남은 예약 0건, 반복 경계의 중복 음 0건.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOKAHEAD_SEC, DEFAULT_START_DELAY_SEC, STALE_NOTE_SEC, TaskTransport } from '@/audio/transport';
import type { TransportChange } from '@/audio/transport';
import type { PlayNote } from '@/audio/types';
import { AudioRig } from './audio-fakes';

const Q = 960;
/** 4/4 한 마디: 4분음표 네 개(C4 D4 E4 F4) */
const FOUR: PlayNote[] = [60, 62, 64, 65].map((midi, i) => ({ id: `n${i + 1}`, midi, onsetTick: i * Q, durationTick: Q }));

function setup(notes: PlayNote[] = FOUR, lengthTicks = 3840, tempoBpm = 80) {
  const rig = new AudioRig();
  const tp = new TaskTransport({ clock: rig.clock, timer: rig.timer, sink: rig.sink });
  tp.load({ notes, lengthTicks, tempoBpm });
  rig.sink.cancelCalls = 0; // load가 부른 정리는 세지 않는다
  const changes: TransportChange[] = [];
  tp.onChange((c) => changes.push(c));
  return { rig, tp, changes };
}

const SEC_PER_QUARTER = 60 / 80; // 0.75초

describe('선예약', () => {
  it('재생을 시작하면 첫 음이 시작 여유 뒤에 예약된다', () => {
    const { rig, tp } = setup();
    const t = rig.clock.t;
    tp.play();
    expect(rig.sink.requests).toHaveLength(1);
    expect(rig.sink.requests[0]!.id).toBe('n1');
    expect(rig.sink.requests[0]!.time).toBeCloseTo(t + DEFAULT_START_DELAY_SEC, 9);
    expect(rig.sink.requests[0]!.duration).toBeCloseTo(SEC_PER_QUARTER, 9);
    expect(rig.sink.requests[0]!.midi).toBe(60);
  });

  it('음은 시작 시각보다 약 100 ms 앞에서만 예약된다', () => {
    const { rig, tp } = setup();
    tp.play();
    rig.run(4);
    expect(rig.sink.requests).toHaveLength(4);
    for (const r of rig.sink.requests) {
      expect(r.time - r.requestedAt).toBeLessThanOrEqual(DEFAULT_LOOKAHEAD_SEC + 1e-9);
      expect(r.time - r.requestedAt).toBeGreaterThanOrEqual(-1e-9); // 늦게 예약하지도 않는다
    }
  });

  it('틱을 템포에 맞는 시각으로 바꾼다(80 BPM에서 4분음표 0.75초)', () => {
    const { rig, tp } = setup();
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(4);
    const times = rig.sink.requests.map((r) => r.time - t0);
    expect(times.map((x) => +x.toFixed(6))).toEqual([0, 0.75, 1.5, 2.25]);
  });

  it('타이머가 흔들려도 모든 음이 한 번씩, 정확한 시각에 예약된다', () => {
    const { rig, tp } = setup();
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(4, 25, 0.6); // 한 걸음이 10–40 ms 사이로 흔들린다
    expect(rig.sink.requests.map((r) => r.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(rig.sink.requests.map((r) => +(r.time - t0).toFixed(6))).toEqual([0, 0.75, 1.5, 2.25]);
  });

  it('다른 템포 단위(점4분음표 = 60)를 쓸 수 있다', () => {
    const rig = new AudioRig();
    const tp = new TaskTransport({ clock: rig.clock, timer: rig.timer, sink: rig.sink });
    const notes: PlayNote[] = [{ id: 'a', midi: 60, onsetTick: 0, durationTick: 1440 }, { id: 'b', midi: 62, onsetTick: 1440, durationTick: 1440 }];
    tp.load({ notes, lengthTicks: 2880, tempoBpm: 60, tempoReference: 'dottedQuarter' });
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(3);
    expect(rig.sink.requests.map((r) => +(r.time - t0).toFixed(6))).toEqual([0, 1]);
    expect(rig.sink.requests[0]!.duration).toBeCloseTo(1, 9);
  });

  it('같은 시작 틱의 화음은 모두 같은 시각에 예약된다', () => {
    const chord: PlayNote[] = [60, 64, 67].map((midi, i) => ({ id: `c${i}`, midi, onsetTick: 0, durationTick: 3840 }));
    const { rig, tp } = setup(chord);
    tp.play();
    rig.run(1);
    expect(rig.sink.requests).toHaveLength(3);
    expect(new Set(rig.sink.requests.map((r) => r.time)).size).toBe(1);
  });

  it('쉼표에 해당하는 틱에는 예약이 없다(4분음표, 쉼, 4분음표, 4분음표)', () => {
    const notes: PlayNote[] = [
      { id: 'n1', midi: 60, onsetTick: 0, durationTick: Q },
      { id: 'n2', midi: 62, onsetTick: 2 * Q, durationTick: Q },
      { id: 'n3', midi: 64, onsetTick: 3 * Q, durationTick: Q },
    ];
    const { rig, tp } = setup(notes);
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(4);
    expect(rig.sink.requests.map((r) => +(r.time - t0).toFixed(6))).toEqual([0, 1.5, 2.25]);
  });
});

describe('정지', () => {
  it('정지하면 아직 울리지 않은 예약이 0건이다', () => {
    const { rig, tp } = setup();
    tp.play();
    // 둘째 음이 예약 범위(앞 100 ms)에 들어온 직후까지 진행한다.
    rig.run(DEFAULT_START_DELAY_SEC + SEC_PER_QUARTER - 0.05);
    expect(rig.sink.pending().length).toBeGreaterThan(0); // 예약은 걸려 있다
    tp.stop();
    expect(rig.sink.pending()).toHaveLength(0);
    expect(rig.sink.cancelCalls).toBe(1);
  });

  it('정지한 뒤에는 시간이 흘러도 새 예약이 생기지 않는다', () => {
    const { rig, tp } = setup();
    tp.play();
    rig.run(1);
    tp.stop();
    const count = rig.sink.requests.length;
    rig.run(10);
    expect(rig.sink.requests).toHaveLength(count);
    expect(rig.timer.activeCount).toBe(0); // 타이머도 멈춘다
    expect(tp.state).toBe('stopped');
    expect(tp.positionTick()).toBeNull();
  });

  it('울리는 중인 음도 정지로 잘린다', () => {
    const { rig, tp } = setup();
    tp.play();
    rig.run(DEFAULT_START_DELAY_SEC + 0.3);
    tp.stop();
    const first = rig.sink.requests[0]!;
    expect(first.cancelled).toBe(true);
    expect(first.cutWhileSounding).toBe(true);
  });

  it('멈춰 있을 때 정지를 불러도 안전하다', () => {
    const { rig, tp, changes } = setup();
    expect(() => tp.stop()).not.toThrow();
    expect(changes).toEqual([]);
    expect(rig.sink.cancelCalls).toBe(1);
  });

  it('반복 재생을 정지하면 다음 차례의 예약도 남지 않는다', () => {
    const { rig, tp } = setup();
    tp.setSection({ startTick: 0, endTick: 3840 }, true);
    tp.play();
    rig.run(3.0 - 0.02); // 첫 차례가 끝나기 직전: 다음 차례의 첫 음이 이미 예약 범위에 들어왔다
    expect(rig.sink.pending().length).toBeGreaterThan(0);
    tp.stop();
    expect(rig.sink.pending()).toHaveLength(0);
    rig.run(10);
    expect(rig.sink.pending()).toHaveLength(0);
  });

  it('재생 중에 play를 다시 누르면 처음부터 다시 시작하고 옛 예약이 남지 않는다', () => {
    const { rig, tp, changes } = setup();
    tp.play();
    rig.run(1.0);
    tp.play();
    expect(changes.map((c) => c.reason)).toEqual(['play', 'restart']);
    const t = rig.clock.t;
    // 새 재생의 첫 음 하나만 남아 있어야 한다.
    expect(rig.sink.pending().map((r) => r.id)).toEqual(['n1']);
    expect(rig.sink.pending()[0]!.time).toBeCloseTo(t + DEFAULT_START_DELAY_SEC, 9);
  });

  it('정지한 재생의 늦은 타이머 호출은 아무것도 예약하지 않는다', () => {
    const { rig, tp } = setup();
    tp.play();
    const entry = rig.timer.entries[0]!;
    tp.stop();
    entry.active = true; // 정지했는데도 타이머가 한 번 더 불린 상황
    const count = rig.sink.requests.length;
    rig.clock.t += 5;
    entry.fn();
    expect(rig.sink.requests).toHaveLength(count);
  });
});

describe('구간 반복', () => {
  const TWO_BEATS: PlayNote[] = [
    { id: 'a', midi: 60, onsetTick: 0, durationTick: Q },
    { id: 'b', midi: 62, onsetTick: Q, durationTick: Q },
  ];

  it('반복 경계에서 같은 음이 중복 예약되지 않는다', () => {
    const { rig, tp } = setup(TWO_BEATS, 2 * Q);
    tp.setSection(null, true);
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    const iterations = 6;
    rig.run(iterations * 2 * SEC_PER_QUARTER, 25, 0.5);
    // 같은 (id, 시각) 쌍이 두 번 나오면 안 된다.
    const seen = new Set<string>();
    for (const r of rig.sink.requests) {
      const key = `${r.id}@${(r.time - t0).toFixed(6)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // 차례마다 정확히 a, b 한 번씩.
    const a = rig.sink.requests.filter((r) => r.id === 'a').map((r) => +(r.time - t0).toFixed(6));
    const b = rig.sink.requests.filter((r) => r.id === 'b').map((r) => +(r.time - t0).toFixed(6));
    const L = 2 * SEC_PER_QUARTER;
    for (let k = 0; k < iterations; k++) {
      expect(a).toContain(+(k * L).toFixed(6));
      expect(b).toContain(+(k * L + SEC_PER_QUARTER).toFixed(6));
    }
    // 같은 음의 예약 간격은 한 차례 길이보다 짧을 수 없다.
    for (let i = 1; i < a.length; i++) expect(a[i]! - a[i - 1]!).toBeCloseTo(L, 6);
  });

  it('타이머 간격과 걸음이 달라도 중복도 누락도 없다', () => {
    for (const [step, jitter] of [[7, 0], [25, 0], [25, 0.8], [40, 0.3], [90, 0]] as const) {
      const { rig, tp } = setup(TWO_BEATS, 2 * Q);
      tp.setSection(null, true);
      const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
      tp.play();
      rig.run(10, step, jitter);
      const keys = rig.sink.requests.map((r) => `${r.id}@${(r.time - t0).toFixed(6)}`);
      expect(new Set(keys).size).toBe(keys.length);
      // 10초 동안 시각이 10초 이내인 음이 모두 있어야 한다(걸음이 100 ms보다 길면 늦은 음은 건너뛸 수 있어 90 ms까지만 확인).
      const expected = Math.floor((10 - 0.1) / SEC_PER_QUARTER) + 1;
      expect(keys.length).toBeGreaterThanOrEqual(expected - 1);
    }
  });

  it('구간 끝을 넘는 음은 끝에서 잘려 다음 차례의 첫 음과 겹치지 않는다', () => {
    const notes: PlayNote[] = [
      { id: 'long', midi: 60, onsetTick: 0, durationTick: 4 * Q }, // 구간(0–2박)을 넘는다
      { id: 'tail', midi: 62, onsetTick: Q, durationTick: 3 * Q },
    ];
    const { rig, tp } = setup(notes, 4 * Q);
    tp.setSection({ startTick: 0, endTick: 2 * Q }, true);
    tp.play();
    rig.run(4);
    const L = 2 * SEC_PER_QUARTER;
    const byIter = rig.sink.requests.filter((r) => r.id === 'long');
    expect(byIter.length).toBeGreaterThanOrEqual(2);
    for (const r of byIter) expect(r.duration).toBeCloseTo(L, 9); // 구간 길이에서 잘렸다
    const tail = rig.sink.requests.filter((r) => r.id === 'tail');
    for (const r of tail) expect(r.duration).toBeCloseTo(SEC_PER_QUARTER, 9); // 1박에서 구간 끝까지
    // 한 차례의 어떤 음도 다음 차례가 시작하기 전에 끝난다.
    for (const r of rig.sink.requests) {
      const iterStart = byIter[0]!.time + Math.floor((r.time - byIter[0]!.time + 1e-6) / L) * L;
      expect(r.time + r.duration).toBeLessThanOrEqual(iterStart + L + 1e-9);
    }
  });

  it('구간의 끝 틱에서 시작하는 음은 그 차례에 속하지 않는다(다음 차례의 처음에서만 울린다)', () => {
    const notes: PlayNote[] = [
      { id: 'a', midi: 60, onsetTick: 0, durationTick: Q },
      { id: 'edge', midi: 62, onsetTick: Q, durationTick: Q }, // 구간 0–1박의 끝 틱
    ];
    const { rig, tp } = setup(notes, 2 * Q);
    tp.setSection({ startTick: 0, endTick: Q }, true);
    tp.play();
    rig.run(3);
    expect(rig.sink.requests.some((r) => r.id === 'edge')).toBe(false);
    expect(rig.sink.requests.every((r) => r.id === 'a')).toBe(true);
  });

  it('구간의 둘째 박만 반복한다(구간 시작 틱을 기준으로 시각을 센다)', () => {
    const { rig, tp } = setup();
    tp.setSection({ startTick: Q, endTick: 2 * Q }, true);
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(3);
    expect(rig.sink.requests.every((r) => r.id === 'n2')).toBe(true);
    const times = rig.sink.requests.map((r) => +(r.time - t0).toFixed(6));
    expect(times.slice(0, 3)).toEqual([0, 0.75, 1.5]);
  });

  it('구간 밖의 음은 재생하지 않는다', () => {
    const { rig, tp } = setup();
    tp.setSection({ startTick: 2 * Q, endTick: 4 * Q }, false);
    tp.play();
    rig.run(3);
    expect(rig.sink.requests.map((r) => r.id)).toEqual(['n3', 'n4']);
  });

  it('위치 막대는 반복 경계에서 구간 처음으로 돌아온다', () => {
    const { rig, tp } = setup(TWO_BEATS, 2 * Q);
    tp.setSection(null, true);
    tp.play();
    rig.run(DEFAULT_START_DELAY_SEC + 0.75);
    expect(tp.positionTick()!).toBeCloseTo(Q, 0);
    rig.run(0.75); // 한 바퀴를 막 돌았다
    expect(tp.positionTick()!).toBeCloseTo(0, 0);
    rig.run(0.375);
    expect(tp.positionTick()!).toBeCloseTo(Q / 2, 0);
  });

  it('오래 멈췄다 돌아와도(시계가 크게 뛰어도) 예약이 쏟아지지 않는다', () => {
    const { rig, tp } = setup(TWO_BEATS, 2 * Q);
    tp.setSection(null, true);
    tp.play();
    rig.run(1);
    const before = rig.sink.requests.length;
    rig.clock.t += 100 * 2 * SEC_PER_QUARTER; // 100 바퀴를 건너뛴 시계
    rig.timer.fire();
    expect(rig.sink.requests.length - before).toBeLessThanOrEqual(4); // 지나간 차례를 건너뛰고 지금 차례부터
    // 새로 예약된 음은 지금 시각 이후다.
    for (const r of rig.sink.requests.slice(before)) expect(r.time).toBeGreaterThanOrEqual(rig.clock.t - STALE_NOTE_SEC);
  });
});

describe('템포 변경', () => {
  it('재생 중에 템포를 바꾸면 멈춘 뒤 구간 처음부터 다시 시작하고, 옛 템포의 예약은 남지 않는다', () => {
    const { rig, tp, changes } = setup();
    tp.play();
    rig.run(DEFAULT_START_DELAY_SEC + SEC_PER_QUARTER - 0.04); // 둘째 음이 예약된 직후
    expect(rig.sink.pending().some((r) => r.id === 'n2')).toBe(true);
    const tChange = rig.clock.t;
    tp.setTempo(40);
    expect(changes.map((c) => c.reason)).toEqual(['play', 'restart']);
    // 옛 예약(n2)은 취소되고, 새 재생의 첫 음만 남는다.
    expect(rig.sink.pending().map((r) => r.id)).toEqual(['n1']);
    const n2Old = rig.sink.requests.find((r) => r.id === 'n2' && r.requestedAt < tChange)!;
    expect(n2Old.cancelled).toBe(true);
    // 새 재생은 40 BPM(4분음표 1.5초)으로 구간 처음부터 간다.
    const t0 = tChange + DEFAULT_START_DELAY_SEC;
    rig.run(8);
    const fresh = rig.sink.requests.filter((r) => r.requestedAt >= tChange && !r.cancelled);
    expect(fresh.map((r) => r.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(fresh.map((r) => +(r.time - t0).toFixed(6))).toEqual([0, 1.5, 3, 4.5]);
    expect(fresh[0]!.duration).toBeCloseTo(1.5, 9);
  });

  it('멈춰 있을 때 템포를 바꾸면 아무 소리도 예약하지 않는다. 다음 재생부터 새 템포다', () => {
    const { rig, tp, changes } = setup();
    tp.setTempo(50);
    expect(rig.sink.requests).toHaveLength(0);
    expect(changes).toEqual([]);
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(4);
    expect(+(rig.sink.requests[1]!.time - t0).toFixed(6)).toBeCloseTo(60 / 50, 6);
  });

  it('같은 템포로 바꾸면 재생이 끊기지 않는다', () => {
    const { rig, tp, changes } = setup();
    tp.play();
    rig.run(1);
    tp.setTempo(80);
    expect(changes.map((c) => c.reason)).toEqual(['play']);
  });

  it('구간이나 반복을 바꾸면 재생 중에는 처음부터 다시 시작한다', () => {
    const { rig, tp, changes } = setup();
    tp.play();
    rig.run(0.5);
    tp.setSection({ startTick: Q, endTick: 2 * Q }, true);
    expect(changes.map((c) => c.reason)).toEqual(['play', 'restart']);
    expect(rig.sink.pending().every((r) => r.id === 'n2')).toBe(true);
    tp.setSection({ startTick: Q, endTick: 2 * Q }, true); // 같은 설정은 다시 시작하지 않는다
    expect(changes).toHaveLength(2);
  });

  it('템포를 바꾼 뒤의 위치 막대는 새 템포로 움직인다', () => {
    const { rig, tp } = setup();
    tp.play();
    rig.run(1);
    tp.setTempo(40);
    rig.run(DEFAULT_START_DELAY_SEC + 1.5);
    expect(tp.positionTick()!).toBeCloseTo(Q, 0);
  });
});

describe('끝까지 재생', () => {
  it('반복하지 않으면 전체 길이만큼 재생한 뒤 한 번 끝난다. 끝에 쉼이 있어도 그만큼 기다린다', () => {
    const notes: PlayNote[] = [{ id: 'a', midi: 60, onsetTick: 0, durationTick: Q }]; // 그 뒤 3박은 쉼
    const { rig, tp, changes } = setup(notes, 4 * Q);
    tp.play();
    rig.run(2.9); // 4박은 3초
    expect(tp.state).toBe('playing');
    rig.run(0.3);
    expect(tp.state).toBe('stopped');
    expect(changes.map((c) => c.reason)).toEqual(['play', 'ended']);
    expect(rig.timer.activeCount).toBe(0);
    expect(rig.sink.cancelCalls).toBe(0); // 자연스럽게 끝난 음은 자르지 않는다
  });

  it('끝난 뒤에 다시 재생하면 처음부터 한다', () => {
    const { rig, tp } = setup();
    tp.play();
    rig.run(4);
    expect(tp.state).toBe('stopped');
    const t0 = rig.clock.t + DEFAULT_START_DELAY_SEC;
    tp.play();
    rig.run(4);
    const second = rig.sink.requests.slice(4);
    expect(second.map((r) => +(r.time - t0).toFixed(6))).toEqual([0, 0.75, 1.5, 2.25]);
  });
});

describe('잘못된 입력', () => {
  it('재생할 내용이 없으면 오류다', () => {
    const rig = new AudioRig();
    const tp = new TaskTransport({ clock: rig.clock, timer: rig.timer, sink: rig.sink });
    expect(() => tp.play()).toThrow(/재생할 내용이 없어요/);
  });

  it('템포와 길이, 음과 구간 값을 검사한다', () => {
    const { tp } = setup();
    expect(() => tp.setTempo(0)).toThrow(/템포가 올바르지 않아요/);
    expect(() => tp.setTempo(1000)).toThrow(/템포가 올바르지 않아요/);
    expect(() => tp.load({ notes: FOUR, lengthTicks: 0, tempoBpm: 80 })).toThrow(/재생 길이/);
    expect(() => tp.load({ notes: [{ id: 'x', midi: 60, onsetTick: -1, durationTick: 960 }], lengthTicks: 960, tempoBpm: 80 })).toThrow(/시작 틱/);
    expect(() => tp.load({ notes: [{ id: 'x', midi: 60, onsetTick: 0, durationTick: 0 }], lengthTicks: 960, tempoBpm: 80 })).toThrow(/음의 길이/);
    tp.load({ notes: FOUR, lengthTicks: 3840, tempoBpm: 80 });
    expect(() => tp.setSection({ startTick: 960, endTick: 960 }, false)).toThrow(/재생 구간/);
    expect(() => tp.setSection({ startTick: 0, endTick: 9999 }, false)).toThrow(/재생 구간/);
  });

  it('새 내용을 불러오면 재생 중이던 것을 멈춘다', () => {
    const { rig, tp } = setup();
    tp.play();
    rig.run(0.5);
    tp.load({ notes: FOUR, lengthTicks: 3840, tempoBpm: 80 });
    expect(tp.state).toBe('stopped');
    expect(rig.sink.pending()).toHaveLength(0);
  });
});
