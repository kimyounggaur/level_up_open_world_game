// 4-5 세계 시계(설계서 8.2). 4분음표 80, 4/4, 8마디(24초)로 도는 격자와, 마디마다 소리를 미리 예약하는 예약기.
// - 격자는 한 번 정한 시작 시각(origin)에서 센다. 소리를 켠 때와 상관없이 같은 격자라서, 소리 물결(화면)과 서명 소리(오디오)가
//   소리를 켜기 전부터 같은 박을 센다. 시계는 늘 흐르는 시계(믹서의 clock)이고 오디오 장치를 만들지 않는다(W-11).
// - 예약기는 25 ms마다 깨어나 약 500 ms 앞에 시작하는 마디를 한 번씩만 부른다. 화면 프레임이 아니라 시계를 기준으로 한다.
//   (8-4: 그림이 무거운 화면에서는 25 ms 깨우기가 200 ms 넘게 밀려, 150 ms 앞에서는 마디 하나를 통째로 놓쳤다. 앞서 예약하는 폭을 넓혀 밀림을 견디게 했다.)
// - 멈췄다가 다시 시작하면 지나간 마디는 건너뛰고 다음 마디부터 간다(늦게 울리지 않는다).
import { BAR_SEC, barIndexAt, barStartTime } from '../domain/worldsound';
import type { AudioClock, IntervalTimer } from './types';

export const WORLD_INTERVAL_MS = 25;
/**
 * 마디가 시작하기 이만큼(초) 앞에서 그 마디를 예약한다. 깨우기가 이만큼 + STALE_BAR_SEC보다 더 밀리면 마디를 놓친다.
 * 0.15였을 때(창 0.2초)는 그림이 무거운 화면(소프트웨어 렌더링 SwiftShader)에서 깨우기 사이가 233 ms(중앙값)까지 벌어져 마디를 놓쳤다(8-4의 측정).
 * 0.5로 늘리면 창이 0.55초가 된다. 비용은 마디의 내용을 정하는 때가 0.35초 앞당겨져, 지역을 옮긴 뒤 소리가 바뀌는 것이 최대 0.35초 늦어지는 것이다(소리는 어차피 마디 3초 단위로 바뀐다).
 */
export const WORLD_LOOKAHEAD_SEC = 0.5;
/** 이만큼 넘게 늦은 마디는 건너뛴다 */
export const STALE_BAR_SEC = 0.05;

/** 세계의 격자. 시작 시각을 한 번 정하고 늘 같은 격자를 쓴다 */
export class WorldClock {
  readonly origin: number;
  constructor(private readonly clock: AudioClock, origin?: number) {
    this.origin = origin ?? clock.now();
  }
  now(): number {
    return this.clock.now();
  }
  /** 지금(또는 t)이 몇 번째 마디인가 */
  bar(t: number = this.now()): number {
    return barIndexAt(t, this.origin);
  }
  barStart(n: number): number {
    return barStartTime(n, this.origin);
  }
  /** 4마디(12초) 주기에서 지금 마디 안의 위치(0 이상 12 미만, 초) */
  phaseInPeriod(periodBars: number, t: number = this.now()): number {
    const span = periodBars * BAR_SEC;
    return (((t - this.origin) % span) + span) % span;
  }
}

export interface BarSchedulerDeps {
  clock: WorldClock;
  timer: IntervalTimer;
  /** 마디가 시작하기 직전에 한 번 부른다. startTime은 그 마디의 시작 시각(시계 기준)이다 */
  onBar: (bar: number, startTime: number) => void;
  /** 깰 때마다(마디가 없어도) 부른다. 마디 사이에 바뀌는 것을 살피는 데 쓴다 */
  onTick?: () => void;
  intervalMs?: number;
  lookaheadSec?: number;
}

export class BarScheduler {
  private readonly d: BarSchedulerDeps;
  private stop: (() => void) | null = null;
  private next = 0;
  /** 지금까지 부른 마디 수(테스트와 진단용) */
  barsScheduled = 0;

  constructor(deps: BarSchedulerDeps) {
    this.d = deps;
  }

  get running(): boolean {
    return this.stop !== null;
  }

  /** 다음에 부를 마디 번호(시작하지 않았으면 null) */
  get nextBar(): number | null {
    return this.stop ? this.next : null;
  }

  /** 시작한다. 지금 도는 마디의 나머지는 건너뛰고 다음 마디부터 간다. 이미 돌고 있으면 아무 일도 없다 */
  start(): void {
    if (this.stop) return;
    const now = this.d.clock.now();
    let n = this.d.clock.bar(now);
    // 지금 마디의 시작이 이미 지났으면 다음 마디부터(조금 지난 정도는 그대로 부른다)
    if (this.d.clock.barStart(n) < now - STALE_BAR_SEC) n += 1;
    this.next = n;
    this.stop = this.d.timer.start(() => this.tick(), this.d.intervalMs ?? WORLD_INTERVAL_MS);
    this.tick();
  }

  halt(): void {
    this.stop?.();
    this.stop = null;
  }

  private tick(): void {
    if (!this.stop) return;
    this.d.onTick?.();
    if (!this.stop) return;
    const now = this.d.clock.now();
    const horizon = now + (this.d.lookaheadSec ?? WORLD_LOOKAHEAD_SEC);
    // 오래 멈춰 있었다면 지나간 마디는 건너뛴다
    while (this.d.clock.barStart(this.next) < now - STALE_BAR_SEC) this.next += 1;
    while (this.d.clock.barStart(this.next) <= horizon) {
      const bar = this.next;
      this.next += 1;
      this.barsScheduled += 1;
      this.d.onBar(bar, this.d.clock.barStart(bar));
      if (!this.stop) return; // onBar 안에서 멈췄다
    }
  }
}
