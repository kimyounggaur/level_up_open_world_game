// 잔치 진행기(app/festival.ts): 열기, 48초 흐름, 건너뛰기, 끝난 뒤 묻기, 내 곡 이어 듣기, 끊기(합주 무대에서 나옴).
// 가짜 시계와 가짜 타이머와 가짜 재생기로 시험한다(소리 장치를 만들지 않는다).
import { describe, expect, it, vi } from 'vitest';
import { WorldClock } from '@/audio/clock';
import { Creations } from '@/app/creations';
import { FESTIVAL_TICK_MS, Festival } from '@/app/festival';
import type { FestivalPlayer } from '@/app/festival';
import { creationsPlayback } from '@/domain/creation';
import { FESTIVAL_BARS, FESTIVAL_END_TEXT, FESTIVAL_MIN_LEAD_SEC, FESTIVAL_SECONDS } from '@/domain/festival';
import type { Playback } from '@/domain/playback';
import type { EnsembleLayers } from '@/domain/worldsound';
import { NO_FESTIVAL, WorldBridge } from '@/platform/bridge';
import { BAR_SEC } from '@/domain/worldsound';
import { FakeClock, FakeTimer } from './audio-fakes';
import { songsOf } from './controller-rig';

const T0 = 1000;

/** 내 곡 재생을 흉내 내는 가짜 재생기: 시작하면 previewing이 참이고, 멈추거나 끝나면 거짓이 된다 */
class FakePlayer implements FestivalPlayer {
  previewing = false;
  started: Playback[] = [];
  stops = 0;
  accept = true;
  private readonly listeners = new Set<() => void>();
  previewPlayback(playback: Playback): boolean {
    if (!this.accept) return false;
    this.started.push(playback);
    this.previewing = true;
    this.emit();
    return true;
  }
  stopPlayback(): void {
    this.stops++;
    if (this.previewing) {
      this.previewing = false;
      this.emit();
    }
  }
  /** 곡이 끝까지 울렸다 */
  endNaturally(): void {
    this.previewing = false;
    this.emit();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}

function rig(over: { songs?: number; layer?: number; startAt?: number; regions?: Partial<EnsembleLayers> } = {}) {
  const clock = new FakeClock(over.startAt ?? T0 + 1);
  const world = new WorldClock(clock, T0);
  const timer = new FakeTimer();
  const bridge = new WorldBridge({ x: 4056, y: 3060, facing: 'down' });
  bridge.installationMode.set({ installationId: 'inst.village.ensemble-stage', stationId: 'H5' } as never);
  const creations = new Creations(songsOf(over.songs ?? 0));
  const player = new FakePlayer();
  const announce = vi.fn<(lines: readonly string[]) => void>();
  const state = { layer: over.layer ?? 0, regions: { ...over.regions } as Partial<EnsembleLayers> };
  const layers = (): EnsembleLayers => ({ village: state.layer, percussion: 0, bass: 0, melody: 0, runner: 0, ornament: 0, ...state.regions });
  const festival = new Festival({ clock: world, timer, bridge, layers, creations, player, announce });
  /** 시계를 sec초 흘리면서 타이머를 100 ms마다 깨운다 */
  const run = (sec: number): void => {
    const end = clock.t + sec;
    while (clock.t < end - 1e-9) {
      clock.t = Math.min(end, clock.t + FESTIVAL_TICK_MS / 1000);
      timer.fire();
    }
  };
  return { clock, world, timer, bridge, creations, player, announce, state, festival, run };
}

describe('열기(open)', () => {
  it('처음에는 열려 있지 않다: 구간이 없고 월드 다리에도 악사가 없다', () => {
    const t = rig();
    expect(t.festival.phase).toBe('idle');
    expect(t.festival.run()).toBeNull();
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.timer.activeCount).toBe(0);
  });

  it('열면 합주의 첫 마디부터 16마디(48초) 구간이 정해지고 악사가 서고 타이머가 돈다', () => {
    const t = rig({ startAt: T0 + 3 * 5 + 0.5 }); // 5번째 마디의 한가운데쯤
    expect(t.festival.open()).toBe(true);
    const run = t.festival.run();
    expect(run).toEqual({ startBar: 6, endBar: 6 + FESTIVAL_BARS });
    expect(FESTIVAL_BARS * BAR_SEC).toBe(FESTIVAL_SECONDS);
    expect(t.festival.phase).toBe('playing');
    expect(t.bridge.festival.get()).toEqual({ active: true, musicians: ['pulse'] });
    expect(t.timer.activeCount).toBe(1);
  });

  it('다음 마디 시작까지 0.4초가 안 남았으면 그다음 마디부터 시작한다', () => {
    const t = rig({ startAt: T0 + 3 * 5 + 3 - (FESTIVAL_MIN_LEAD_SEC - 0.05) });
    t.festival.open();
    expect(t.festival.run()!.startBar).toBe(7);
  });

  it('마을 층이 1 이상이면 화음 악사도 선다. 층은 연 순간의 값으로 정해진다', () => {
    const t = rig({ layer: 2 });
    t.festival.open();
    expect(t.bridge.festival.get()).toEqual({ active: true, musicians: ['pulse', 'bed'] });
    t.state.layer = 0; // 도중에 층이 바뀌어도 이미 선 악사는 그대로
    expect(t.bridge.festival.get().musicians).toEqual(['pulse', 'bed']);
  });

  it('마을 밖 지역의 층이 1 이상이면 그 성부를 맡은 악사도 선다(7-5). 선 차례는 박, 화음, 가락 악사들이다', () => {
    const t = rig({ layer: 1, regions: { percussion: 1, bass: 2, melody: 3, runner: 1, ornament: 2 } });
    t.festival.open();
    expect(t.bridge.festival.get()).toEqual({ active: true, musicians: ['pulse', 'percussion', 'bass', 'bed', 'melody', 'runner', 'ornament'] });
    const only = rig({ regions: { runner: 1 } });
    only.festival.open();
    expect(only.bridge.festival.get().musicians).toEqual(['pulse', 'runner']);
  });

  it('열려 있는 동안 다시 열지 않는다(false). 구간과 악사도 그대로다', () => {
    const t = rig();
    t.festival.open();
    const before = t.festival.run();
    expect(t.festival.open()).toBe(false);
    expect(t.festival.run()).toEqual(before);
    expect(t.timer.activeCount).toBe(1);
  });

  it('열 때 듣던 것이 있으면 멈춘다', () => {
    const t = rig();
    t.player.previewing = true;
    t.festival.open();
    expect(t.player.stops).toBe(1);
    expect(t.player.previewing).toBe(false);
  });
});

describe('흐름: 48초가 지나면 끝난다', () => {
  it('끝나기 직전까지는 합주가 울리는 중이다', () => {
    const t = rig();
    t.festival.open();
    const run = t.festival.run()!;
    t.run(t.world.barStart(run.endBar) - t.clock.t - 0.2);
    expect(t.festival.phase).toBe('playing');
    expect(t.bridge.festival.get().active).toBe(true);
  });

  it('저장한 곡이 없으면 끝에서 "잔치가 끝났어요."만 알리고 바로 닫는다. 악사도 내려온다', () => {
    const t = rig({ songs: 0 });
    t.festival.open();
    const run = t.festival.run()!;
    t.run(t.world.barStart(run.endBar) - t.clock.t + 0.2);
    expect(t.festival.phase).toBe('idle');
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.announce).toHaveBeenCalledWith([FESTIVAL_END_TEXT]);
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.timer.activeCount).toBe(0);
    expect(t.festival.run()).toBeNull();
  });

  it('저장한 곡이 있으면 끝에서 묻는 상태가 된다(곡 수를 안다). 이때는 알림을 따로 내지 않는다', () => {
    const t = rig({ songs: 3 });
    t.festival.open();
    const run = t.festival.run()!;
    t.run(t.world.barStart(run.endBar) - t.clock.t + 0.2);
    expect(t.festival.state.get()).toEqual({ phase: 'asking', songs: 3 });
    expect(t.announce).not.toHaveBeenCalled();
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.timer.activeCount).toBe(0);
    expect(t.festival.run()).toBeNull();
  });

  it('소리가 꺼져 있어도(진행기는 소리를 모른다) 같은 시간에 끝난다', () => {
    // 진행기는 세계 시계만 본다. 소리를 켰는지는 월드 소리와 화면이 다룬다.
    const t = rig({ songs: 0 });
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    expect(t.festival.phase).toBe('idle');
  });
});

describe('건너뛰기(skip)', () => {
  it('합주가 울리는 중에 건너뛰면 묻지 않고 바로 끝난다. 저장한 곡이 있어도 묻지 않는다', () => {
    const t = rig({ songs: 2 });
    t.festival.open();
    t.run(5);
    expect(t.festival.skip()).toBe(true);
    expect(t.festival.phase).toBe('idle');
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.timer.activeCount).toBe(0);
    expect(t.festival.run()).toBeNull();
  });

  it('건너뛰어도 알림은 내지 않는다(끝까지 간 것이 아니다)', () => {
    const t = rig({ songs: 0 });
    t.festival.open();
    t.festival.skip();
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('열려 있지 않거나 묻는 중이면 아무 일도 없다(false)', () => {
    const t = rig({ songs: 1 });
    expect(t.festival.skip()).toBe(false);
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    expect(t.festival.phase).toBe('asking');
    expect(t.festival.skip()).toBe(false);
    expect(t.festival.phase).toBe('asking');
  });
});

describe('다시 열기: 잔치는 결말이 아니다', () => {
  it('끝난 뒤(곡 없음) 바로 다시 열 수 있고 새 구간은 지금 이후다', () => {
    const t = rig();
    t.festival.open();
    const first = t.festival.run()!;
    t.run(FESTIVAL_SECONDS + 4);
    expect(t.festival.open()).toBe(true);
    const second = t.festival.run()!;
    expect(second.startBar).toBeGreaterThanOrEqual(first.endBar);
    expect(second.endBar - second.startBar).toBe(FESTIVAL_BARS);
  });

  it('건너뛴 뒤에도 다시 열 수 있다', () => {
    const t = rig();
    t.festival.open();
    t.festival.skip();
    expect(t.festival.open()).toBe(true);
    expect(t.festival.phase).toBe('playing');
  });

  it('묻는 중에는 열지 않는다. 답한 뒤에 열린다', () => {
    const t = rig({ songs: 1 });
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    expect(t.festival.open()).toBe(false);
    t.festival.answer(false);
    expect(t.festival.open()).toBe(true);
  });
});

describe('끝난 뒤의 물음(answer)', () => {
  function asking(songs = 2) {
    const t = rig({ songs });
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    expect(t.festival.phase).toBe('asking');
    return t;
  }

  it('"아니요"는 그대로 닫는다. 재생을 시작하지 않는다', () => {
    const t = asking();
    expect(t.festival.answer(false)).toBe(true);
    expect(t.festival.phase).toBe('idle');
    expect(t.player.started).toEqual([]);
  });

  it('"들을게요"는 내 곡을 곡 사이 한 마디 쉼으로 이어서 들려 준다', () => {
    const t = asking(2);
    expect(t.festival.answer(true)).toBe(true);
    expect(t.festival.state.get()).toEqual({ phase: 'songs', songs: 2 });
    expect(t.player.started).toHaveLength(1);
    expect(t.player.started[0]).toEqual(creationsPlayback(t.creations.list()));
  });

  it('곡이 끝까지 울리면 닫는다', () => {
    const t = asking();
    t.festival.answer(true);
    t.player.endNaturally();
    expect(t.festival.phase).toBe('idle');
    expect(t.player.listenerCount).toBe(0);
  });

  it('재생을 시작하지 못하면(false) 닫고 false를 돌려 준다', () => {
    const t = asking();
    t.player.accept = false;
    expect(t.festival.answer(true)).toBe(false);
    expect(t.festival.phase).toBe('idle');
  });

  it('묻는 중이 아니면 아무 일도 없다(false)', () => {
    const t = rig({ songs: 1 });
    expect(t.festival.answer(true)).toBe(false);
    expect(t.festival.answer(false)).toBe(false);
    t.festival.open();
    expect(t.festival.answer(true)).toBe(false);
    expect(t.festival.phase).toBe('playing');
    expect(t.player.started).toEqual([]);
  });

  it('듣는 중에 멈추면(stopSongs) 재생을 멈추고 닫는다', () => {
    const t = asking();
    t.festival.answer(true);
    const stops = t.player.stops;
    expect(t.festival.stopSongs()).toBe(true);
    expect(t.player.stops).toBe(stops + 1);
    expect(t.festival.phase).toBe('idle');
    expect(t.player.listenerCount).toBe(0);
  });

  it('듣는 중이 아니면 stopSongs는 아무 일도 없다(false)', () => {
    const t = rig({ songs: 1 });
    expect(t.festival.stopSongs()).toBe(false);
    t.festival.open();
    expect(t.festival.stopSongs()).toBe(false);
    expect(t.festival.phase).toBe('playing');
  });

  it('다른 일로 재생이 멈춰도(곡 패널 등) 듣는 중 상태가 닫힌다', () => {
    const t = asking();
    t.festival.answer(true);
    t.player.stopPlayback();
    expect(t.festival.phase).toBe('idle');
  });
});

describe('끊기(interrupt): 합주 무대에서 나오거나 화면이 월드를 떠났다', () => {
  it('합주가 울리는 중이면 건너뛴 것처럼 끝난다. 묻지 않는다', () => {
    const t = rig({ songs: 2 });
    t.festival.open();
    t.festival.interrupt();
    expect(t.festival.phase).toBe('idle');
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.timer.activeCount).toBe(0);
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('묻는 중이면 그대로 닫는다', () => {
    const t = rig({ songs: 2 });
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    t.festival.interrupt();
    expect(t.festival.phase).toBe('idle');
  });

  it('내 곡을 듣는 중이면 재생을 멈추고 닫는다', () => {
    const t = rig({ songs: 2 });
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    t.festival.answer(true);
    t.festival.interrupt();
    expect(t.festival.phase).toBe('idle');
    expect(t.player.previewing).toBe(false);
  });

  it('열려 있지 않으면 아무 일도 없다(재생기도 건드리지 않는다)', () => {
    const t = rig();
    t.festival.interrupt();
    expect(t.festival.phase).toBe('idle');
    expect(t.player.stops).toBe(0);
  });

  it('합주 무대의 설치 모드가 닫히면(지도로 이동, 다른 정거장) 잔치가 끝난다', () => {
    const t = rig({ songs: 1 });
    t.festival.open();
    t.bridge.installationMode.set(null);
    expect(t.festival.phase).toBe('idle');
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
  });

  it('설치 모드가 열릴 때는 잔치를 건드리지 않는다', () => {
    const t = rig();
    t.bridge.installationMode.set(null);
    t.bridge.installationMode.set({ installationId: 'inst.village.ensemble-stage', stationId: 'H5' } as never);
    expect(t.festival.phase).toBe('idle');
  });
});

describe('정리(dispose)', () => {
  it('열려 있던 잔치도 타이머도 구독도 정리한다. 이후 열리지 않는다', () => {
    const t = rig({ songs: 1 });
    t.festival.open();
    t.festival.dispose();
    expect(t.timer.activeCount).toBe(0);
    expect(t.bridge.festival.get()).toBe(NO_FESTIVAL);
    expect(t.festival.phase).toBe('idle');
    expect(t.festival.open()).toBe(false);
    expect(t.festival.run()).toBeNull();
    expect(() => t.bridge.installationMode.set(null)).not.toThrow(); // 구독이 풀려 더는 반응하지 않는다
    expect(t.festival.phase).toBe('idle');
  });

  it('내 곡을 듣던 중이어도 재생 구독을 풀고 닫는다', () => {
    const t = rig({ songs: 1 });
    t.festival.open();
    t.run(FESTIVAL_SECONDS + 4);
    t.festival.answer(true);
    t.festival.dispose();
    expect(t.festival.phase).toBe('idle');
    expect(t.player.listenerCount).toBe(0);
  });

  it('두 번 불러도 괜찮다', () => {
    const t = rig();
    t.festival.dispose();
    expect(() => t.festival.dispose()).not.toThrow();
  });
});
