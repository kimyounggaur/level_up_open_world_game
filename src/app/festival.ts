// 잔치 열기(설계서 6.4, 7.5 '잔치' 상태)를 진행하는 곳. 합주 무대의 표지판에서 '잔치 열기'를 고르면 열리고, 현재 층 그대로 8마디 합주를 두 번(48초) 울린다.
//  - 어느 마디에서 열어도 합주의 첫 마디부터 시작하도록 구간(FestivalRun)을 정해 월드 소리(WorldAudio)에 알린다. 소리를 켜지 않았어도 구간은 지나간다(조용한 잔치).
//  - 열려 있는 동안 악사들이 무대에 선다(월드 다리의 festival). 합주에 울리는 성부(마을과 마을 밖 다섯 지역의 층 1 이상)마다 악사가 서고, 층이 모두 0이어도 맥박 악사와 함께 열린다.
//  - 건너뛰기나 끝남으로 나온다. 건너뛰면 그대로 끝나고, 끝까지 가면 저장한 곡이 있을 때 내 곡을 이어서 들을지 묻는다.
//  - 잔치는 결말이 아니다: 끝난 뒤에도 몇 번이든 다시 열 수 있다.
// 이 상태 동안 이동 키는 아무 일도 하지 않는다(7.5): 앱이 화면을 가려 월드를 멈추고, 이 곳은 상태와 시간만 맡는다.
import type { IntervalTimer } from '../audio/types';
import { creationsPlayback } from '../domain/creation';
import type { Creation } from '../domain/creation';
import { FESTIVAL_END_TEXT, festivalParts, festivalRunAt } from '../domain/festival';
import type { FestivalRun, MusicianPart } from '../domain/festival';
import type { Playback } from '../domain/playback';
import type { EnsembleLayers } from '../domain/worldsound';
import { NO_FESTIVAL, Store } from '../platform/bridge';
import type { WorldBridge } from '../platform/bridge';

export type FestivalState =
  | { phase: 'idle' }
  /** 합주가 울리는 중(소리를 켜지 않았으면 조용히 흐른다) */
  | { phase: 'playing'; run: FestivalRun; musicians: readonly MusicianPart[] }
  /** 끝났다. 저장한 곡이 있어서 이어서 들을지 묻는 중 */
  | { phase: 'asking'; songs: number }
  /** 내 곡을 차례로 들려 주는 중 */
  | { phase: 'songs'; songs: number };

export const IDLE: FestivalState = { phase: 'idle' };

/** 잔치가 끝났는지 살피는 간격(ms). 마디는 3초라서 이만큼이면 충분히 촘촘하다 */
export const FESTIVAL_TICK_MS = 100;

/** 세계 시계에서 필요한 것만 */
export interface FestivalClock {
  now(): number;
  bar(t?: number): number;
  barStart(n: number): number;
}

/** 내 곡을 들려 주는 데 필요한 것(챌린지 컨트롤러가 이 모양이다) */
export interface FestivalPlayer {
  previewPlayback(playback: Playback): boolean;
  stopPlayback(): void;
  readonly previewing: boolean;
  subscribe(listener: () => void): () => void;
}

export interface FestivalDeps {
  clock: FestivalClock;
  timer: IntervalTimer;
  bridge: Pick<WorldBridge, 'festival' | 'installationMode'>;
  /** 합주의 여섯 성부가 읽는 층(0–3). 연 순간의 층으로 악사가 정해진다 */
  layers: () => EnsembleLayers;
  creations: { list(): readonly Creation[] };
  player: FestivalPlayer;
  /** 사실 문장을 마을 위쪽에 잠깐 알린다 */
  announce: (lines: readonly string[]) => void;
}

export class Festival {
  readonly state = new Store<FestivalState>(IDLE);
  private readonly d: FestivalDeps;
  private stopTimer: (() => void) | null = null;
  private offPlayer: (() => void) | null = null;
  private readonly offs: Array<() => void> = [];
  private disposed = false;

  constructor(deps: FestivalDeps) {
    this.d = deps;
    // 합주 무대에서 나오면(지도로 이동, 다른 정거장 등) 잔치도 끝난다
    this.offs.push(
      deps.bridge.installationMode.subscribe((mode) => {
        if (mode === null) this.interrupt();
      }),
    );
  }

  /** 지금 열려 있는 잔치의 마디 구간. 합주가 울리는 중이 아니면 null(월드 소리가 읽는다) */
  run(): FestivalRun | null {
    const s = this.state.get();
    return s.phase === 'playing' ? s.run : null;
  }

  get phase(): FestivalState['phase'] {
    return this.state.get().phase;
  }

  /** 잔치를 연다. 이미 열려 있거나 끝난 뒤 묻는 중이면 열지 않는다(false) */
  open(): boolean {
    if (this.disposed || this.state.get().phase !== 'idle') return false;
    // 듣던 것이 있으면 멈춘다: 합주가 울리는 동안 다른 재생이 겹치지 않게
    this.d.player.stopPlayback();
    const now = this.d.clock.now();
    const bar = this.d.clock.bar(now);
    const run = festivalRunAt(bar, this.d.clock.barStart(bar + 1) - now);
    const musicians = festivalParts(this.d.layers());
    this.state.set({ phase: 'playing', run, musicians });
    this.d.bridge.festival.set({ active: true, musicians });
    this.stopTimer = this.d.timer.start(() => this.tick(), FESTIVAL_TICK_MS);
    return true;
  }

  private tick(): void {
    const s = this.state.get();
    if (s.phase !== 'playing') return;
    if (this.d.clock.now() >= this.d.clock.barStart(s.run.endBar)) this.finish();
  }

  /** 끝까지 갔다. 저장한 곡이 있으면 이어서 들을지 묻고, 없으면 끝났다고만 알린다 */
  private finish(): void {
    this.clearPlaying();
    const songs = this.d.creations.list().length;
    if (songs > 0) {
      this.state.set({ phase: 'asking', songs });
    } else {
      this.state.set(IDLE);
      this.d.announce([FESTIVAL_END_TEXT]);
    }
  }

  /** 건너뛴다(Esc도 같다). 합주가 울리는 중일 때만 뜻이 있다. 건너뛰면 묻지 않고 바로 끝난다 */
  skip(): boolean {
    if (this.state.get().phase !== 'playing') return false;
    this.clearPlaying();
    this.state.set(IDLE);
    return true;
  }

  /** 끝난 뒤의 물음에 답한다. 들으려 하면 내 곡을 차례로 들려 준다. 묻는 중이 아니면 false */
  answer(listen: boolean): boolean {
    const s = this.state.get();
    if (s.phase !== 'asking') return false;
    if (!listen) {
      this.state.set(IDLE);
      return true;
    }
    const list = this.d.creations.list();
    const playback = creationsPlayback(list);
    if (!this.d.player.previewPlayback(playback)) {
      this.state.set(IDLE);
      return false;
    }
    this.state.set({ phase: 'songs', songs: list.length });
    // 곡이 끝나면(또는 다른 일로 재생이 멈추면) 닫는다. 재생을 시작한 뒤에 걸어서, 시작하다 멈춘 신호에 속지 않는다
    this.offPlayer = this.d.player.subscribe(() => {
      if (this.state.get().phase === 'songs' && !this.d.player.previewing) this.endSongs();
    });
    return true;
  }

  /** 내 곡 듣기를 멈춘다. 듣는 중이 아니면 false */
  stopSongs(): boolean {
    if (this.state.get().phase !== 'songs') return false;
    this.d.player.stopPlayback();
    this.endSongs();
    return true;
  }

  private endSongs(): void {
    this.offPlayer?.();
    this.offPlayer = null;
    if (this.state.get().phase === 'songs') this.state.set(IDLE);
  }

  /**
   * 어느 단계에서든 잔치를 끝낸다(화면이 월드를 떠났거나 합주 무대에서 나왔다). 듣던 내 곡도 멈춘다. 열려 있지 않으면 아무 일도 없다.
   * 끝까지 간 것이 아니므로 묻지 않는다.
   */
  interrupt(): void {
    switch (this.state.get().phase) {
      case 'playing':
        this.skip();
        break;
      case 'asking':
        this.state.set(IDLE);
        break;
      case 'songs':
        this.stopSongs();
        break;
      default:
        break;
    }
  }

  /** 합주가 울리는 중의 뒷정리: 시간 살피기를 멈추고 악사를 무대에서 내린다 */
  private clearPlaying(): void {
    this.stopTimer?.();
    this.stopTimer = null;
    this.d.bridge.festival.set(NO_FESTIVAL);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPlaying();
    this.endSongs();
    this.state.set(IDLE);
    for (const off of this.offs.splice(0)) off();
  }
}
