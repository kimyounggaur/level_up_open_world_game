// 4-5 세계 시계와 마디 예약기(설계서 8.2): 오디오 시계 기준, 25 ms 간격, 약 500 ms 앞 예약(8-4), 마디를 한 번씩만 부른다.
import { describe, expect, it } from 'vitest';
import { BarScheduler, STALE_BAR_SEC, WORLD_LOOKAHEAD_SEC, WorldClock } from '@/audio/clock';
import { BAR_SEC } from '@/domain/worldsound';
import { FakeClock, FakeTimer } from './audio-fakes';

function rig(start = 1000, origin = 1000) {
  const clock = new FakeClock(start);
  const timer = new FakeTimer();
  const world = new WorldClock(clock, origin);
  const bars: Array<{ bar: number; start: number; at: number }> = [];
  let ticks = 0;
  const sched = new BarScheduler({ clock: world, timer, onBar: (bar, s) => bars.push({ bar, start: s, at: clock.now() }), onTick: () => ticks++ });
  const run = (sec: number, stepMs = 25): void => {
    const end = clock.t + sec;
    while (clock.t < end - 1e-9) {
      clock.t = Math.min(end, clock.t + stepMs / 1000);
      timer.fire();
    }
  };
  return { clock, timer, world, sched, bars, run, ticks: () => ticks };
}

describe('세계 시계의 격자', () => {
  it('시작 시각에서 센다. 소리를 켠 때와 상관없이 같은 격자다', () => {
    const clock = new FakeClock(500);
    const w = new WorldClock(clock);
    expect(w.origin).toBe(500);
    clock.t = 500 + BAR_SEC * 5 + 0.1;
    expect(w.bar()).toBe(5);
    expect(w.barStart(5)).toBeCloseTo(500 + 15, 10);
    const w2 = new WorldClock(clock, 490);
    expect(w2.bar()).toBe(Math.floor((clock.t - 490) / BAR_SEC));
  });

  it('주기 안의 위치는 0 이상 주기 미만이다(시작 전 시각에서도)', () => {
    const clock = new FakeClock(100);
    const w = new WorldClock(clock, 100);
    expect(w.phaseInPeriod(4, 100)).toBeCloseTo(0, 10);
    expect(w.phaseInPeriod(4, 100 + 13)).toBeCloseTo(1, 10);
    expect(w.phaseInPeriod(4, 100 - 1)).toBeCloseTo(11, 10);
  });
});

describe('마디 예약기', () => {
  it('시작하면 다음 마디부터, 마디마다 한 번씩만 부른다', () => {
    const r = rig();
    r.sched.start();
    r.run(30);
    const nums = r.bars.map((b) => b.bar);
    expect(nums).toEqual([...new Set(nums)]); // 중복 없음
    expect(nums[0]).toBe(0);
    expect(nums).toEqual(nums.map((_, i) => nums[0]! + i)); // 건너뜀 없음
    expect(nums.length).toBeGreaterThanOrEqual(10);
  });

  it('마디가 시작하기 앞서 부르는 시간(약 500 ms) 안쪽에 부른다(너무 일찍도 늦게도 아니다)', () => {
    const r = rig();
    r.sched.start();
    r.run(30);
    for (const b of r.bars.slice(1)) {
      const lead = b.start - b.at;
      expect(lead, `마디 ${b.bar}`).toBeGreaterThanOrEqual(-1e-9);
      expect(lead).toBeLessThanOrEqual(WORLD_LOOKAHEAD_SEC + 0.0251);
    }
  });

  it('깨우기가 413 ms씩 밀려도 마디를 건너뛰지 않는다(8-4: 그림이 무거운 화면에서 잰 가장 긴 깨우기 간격). 앞서 부르는 시간이 0.15초이던 때는 건너뛰었다', () => {
    const run = (lookaheadSec: number | undefined): { skipped: number[]; late: number } => {
      const clock = new FakeClock(1000);
      const timer = new FakeTimer();
      const world = new WorldClock(clock, 1000);
      const called: number[] = [];
      let late = 0;
      const sched = new BarScheduler({
        clock: world,
        timer,
        lookaheadSec,
        onBar: (bar, s) => {
          called.push(bar);
          if (s < clock.now()) late++;
        },
      });
      sched.start();
      const end = clock.t + 60;
      while (clock.t < end) {
        clock.t += 0.413;
        timer.fire();
      }
      const first = called[0]!;
      const last = called[called.length - 1]!;
      const skipped: number[] = [];
      for (let b = first; b <= last; b++) if (!called.includes(b)) skipped.push(b);
      return { skipped, late };
    };
    expect(WORLD_LOOKAHEAD_SEC + STALE_BAR_SEC).toBeGreaterThan(0.413);
    expect(run(undefined)).toEqual({ skipped: [], late: 0 });
    // 대조: 옛 값(0.15 + 0.05 = 0.2초 창)에서는 같은 깨우기 간격에 마디를 놓친다. 시험이 헛돌지 않는다는 증거다
    expect(run(0.15).skipped.length).toBeGreaterThan(0);
  });

  it('마디 시작 시각은 격자에 맞는다', () => {
    const r = rig(1000, 997.3);
    r.sched.start();
    r.run(20);
    for (const b of r.bars) expect((b.start - 997.3) / BAR_SEC).toBeCloseTo(b.bar, 8);
  });

  it('마디 중간에 시작하면 지난 마디는 건너뛰고 다음 마디부터 간다(늦게 울리지 않는다)', () => {
    const r = rig(1000, 1000);
    r.clock.t = 1000 + BAR_SEC * 2 + 1.2; // 3번째 마디 중간
    r.sched.start();
    r.run(7);
    expect(r.bars[0]!.bar).toBe(3);
    expect(r.bars[0]!.start).toBeGreaterThan(r.bars[0]!.at - 1e-9);
  });

  it('마디 시작에서 아주 조금 지났으면 그 마디도 부른다', () => {
    const r = rig(1000, 1000);
    r.clock.t = 1000 + BAR_SEC * 4 + STALE_BAR_SEC / 2;
    r.sched.start();
    expect(r.bars[0]!.bar).toBe(4);
  });

  it('오래 멈췄다 깨어도 지난 마디를 몰아서 부르지 않는다', () => {
    const r = rig();
    r.sched.start();
    r.run(7);
    const before = r.bars.length;
    r.clock.t += 60; // 타이머가 오래 멈췄다(탭이 가려진 때처럼)
    r.timer.fire();
    const after = r.bars.slice(before);
    expect(after.length).toBeLessThanOrEqual(2);
    for (const b of after) expect(b.start).toBeGreaterThanOrEqual(r.clock.t - STALE_BAR_SEC - 1e-9);
  });

  it('멈추면 타이머가 풀리고 더는 부르지 않는다. 다시 시작할 수 있다', () => {
    const r = rig();
    r.sched.start();
    expect(r.timer.activeCount).toBe(1);
    r.run(4);
    r.sched.halt();
    expect(r.timer.activeCount).toBe(0);
    expect(r.sched.running).toBe(false);
    const n = r.bars.length;
    r.run(10);
    expect(r.bars.length).toBe(n);
    r.sched.start();
    r.run(7);
    expect(r.bars.length).toBeGreaterThan(n);
    // 다시 시작해도 같은 마디를 두 번 부르지 않는다
    const nums = r.bars.map((b) => b.bar);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('두 번 시작해도 타이머는 하나다', () => {
    const r = rig();
    r.sched.start();
    r.sched.start();
    expect(r.timer.activeCount).toBe(1);
  });

  it('onTick은 깰 때마다 불린다', () => {
    const r = rig();
    r.sched.start();
    const t0 = r.ticks();
    r.run(1);
    expect(r.ticks() - t0).toBe(40);
  });

  it('onBar 안에서 멈추면 그 뒤 마디는 부르지 않는다', () => {
    const clock = new FakeClock(0);
    const timer = new FakeTimer();
    const seen: number[] = [];
    const s: BarScheduler = new BarScheduler({
      clock: new WorldClock(clock, 0),
      timer,
      onBar: (bar) => {
        seen.push(bar);
        s.halt();
      },
    });
    s.start();
    clock.t = 10;
    timer.fire();
    expect(seen).toEqual([0]);
  });
});
