// 월드 호스트: 월드(Phaser)를 필요할 때 늦게 켜고, 화면과 월드 사이의 다리(WorldBridge)를 들고 있다.
// 주소로 패널을 바로 여는 길(W-2)은 월드를 기다리지 않는다: Phaser는 월드 화면을 처음 보일 때만 불러온다.
import type { WorldSpot } from '../domain/discovery';
import type { InstallationDef } from '../domain/installation';
import type { PlayInstrumentDef } from '../domain/play';
import type { ResidentDef } from '../domain/residents';
import { PLAYER_START, standOf } from '../domain/world';
import type { Facing, WorldMap } from '../domain/world';
import { WorldBridge } from '../platform/bridge';
import type { WorldCommand } from '../platform/bridge';
import type { StartWorldOptions, WorldHandle } from '../world/start';

export type StartWorld = (opts: StartWorldOptions) => WorldHandle;

export interface WorldHostOptions {
  map: WorldMap;
  /** 월드 시작 함수를 불러온다. 기본은 world/start를 동적으로 불러온다(별도 덩어리). 시험에서는 가짜를 넣는다 */
  load?: () => Promise<StartWorld>;
  /** 저장에서 복원한 자리. 없으면 시작 자리 */
  start?: { x: number; y: number; facing?: Facing };
  /** 움직임 줄이기가 켜져 있는가(설정과 브라우저 설정). 월드가 카메라와 연출을 정할 때마다 부른다 */
  reduceMotion?: () => boolean;
  /** 설치물(돌의 자리). 월드가 켜질 때 넘긴다 */
  installations?: readonly InstallationDef[];
  /** 정거장이 아닌 자리(발견 요소, 광장 게시판). 월드가 켜질 때 넘긴다 */
  spots?: readonly WorldSpot[];
  /** 놀이 악기(3.5, 6-9c). 월드가 켜질 때 넘긴다 */
  play?: readonly PlayInstrumentDef[];
  /** 주민(악사, 7-6). 월드가 켜질 때 넘긴다 */
  residents?: readonly ResidentDef[];
}

const defaultLoad = async (): Promise<StartWorld> => (await import('../world/start')).startWorld;

/** 월드가 준비되기 전이나 멈춰 있는 동안 받아 둘 명령의 최대 수 */
const MAX_PENDING = 8;

/**
 * 월드가 살아 움직일 때까지 기다렸다가 보낼 명령. 지도에서 '걸어가기'나 '바로 이동'을 누르면 지도를 닫는 것과 동시에 명령이 나가는데,
 * 그 순간 월드는 아직 멈춰 있다(겹침 화면이 닫히고 나서야 움직인다). 그 밖의 명령(상호작용, 걷기 취소)은 지금 눌렀을 때만 뜻이 있어 기다리지 않는다.
 */
const DEFERRABLE: ReadonlySet<WorldCommand['type']> = new Set(['walk-to-station', 'teleport-to-station', 'teleport']);

export class WorldHost {
  readonly map: WorldMap;
  readonly bridge: WorldBridge;
  private readonly load: () => Promise<StartWorld>;
  private readonly reduceMotion: (() => boolean) | undefined;
  private readonly installations: readonly InstallationDef[];
  private readonly spots: readonly WorldSpot[];
  private readonly play: readonly PlayInstrumentDef[];
  private readonly residents: readonly ResidentDef[];
  private handle: WorldHandle | null = null;
  private mounting = false;
  private disposed = false;
  private start: { x: number; y: number; facing: Facing };
  private pending: WorldCommand[] = [];
  private offLive: (() => void) | null = null;

  constructor(opts: WorldHostOptions) {
    this.map = opts.map;
    this.load = opts.load ?? defaultLoad;
    this.reduceMotion = opts.reduceMotion;
    this.installations = opts.installations ?? [];
    this.spots = opts.spots ?? [];
    this.play = opts.play ?? [];
    this.residents = opts.residents ?? [];
    this.start = { x: opts.start?.x ?? PLAYER_START.x, y: opts.start?.y ?? PLAYER_START.y, facing: opts.start?.facing ?? 'down' };
    this.bridge = new WorldBridge({ ...this.start });
    // 월드가 켜지기 전에도 화면(왼쪽 위 지역 이름, 지도의 '지금 여기')이 시작 자리에 맞게 보이게 한다
    this.bridge.patchStatus({ regionId: this.map.regionAt(this.start.x, this.start.y).regionId });
  }

  get running(): boolean {
    return this.handle !== null;
  }

  /** 점검용: 월드 장면의 지금 상태(카메라 중심, 배율, 보이는 범위, 불러온 조각). 월드나 장면이 아직 없으면 null */
  debugState(): ReturnType<WorldHandle['scene']['debugState']> {
    return this.handle ? this.handle.scene.debugState() : null;
  }

  /** 월드를 켠다. 이미 켜졌거나 켜는 중이면 아무 일도 하지 않는다. 실패했다면 다시 부르면 다시 시도한다 */
  async mount(parent: HTMLElement): Promise<void> {
    if (this.handle || this.mounting || this.disposed) return;
    this.mounting = true;
    this.bridge.patchStatus({ error: null });
    try {
      const startWorld = await this.load();
      if (this.disposed) return;
      this.handle = startWorld({
        parent,
        map: this.map,
        bridge: this.bridge,
        start: { ...this.start },
        installations: this.installations,
        spots: this.spots,
        play: this.play,
        residents: this.residents,
        ...(this.reduceMotion ? { reduceMotion: this.reduceMotion } : {}),
      });
      this.flushWhenLive();
    } catch (err) {
      if (__RELEASE_CHANNEL__ === 'preview') console.error('World failed to load', err);
      this.handle = null;
      this.bridge.patchStatus({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.mounting = false;
    }
  }

  /** 월드가 준비되어 있고 멈춰 있지 않은가 */
  private get live(): boolean {
    return this.handle !== null && this.bridge.status.get().ready && !this.bridge.pause.get();
  }

  /** 월드에 명령한다. 월드가 준비 중이거나 멈춰 있으면 걷기·이동 명령은 월드가 살아난 뒤에 보내고, 나머지는 버린다 */
  command(c: WorldCommand): void {
    if (this.live) {
      this.bridge.commands.send(c);
      return;
    }
    if (DEFERRABLE.has(c.type) && this.pending.length < MAX_PENDING) this.pending.push(c);
  }

  /** 정거장 앞에 서게 한다. 월드가 아직 없으면 시작 자리를 정거장 앞으로 바꿔 둔다 */
  teleportToStation(stationId: string): boolean {
    const st = this.map.station(stationId);
    if (!st) return false;
    if (!this.handle) {
      const stand = standOf(st);
      this.start = { x: stand.x, y: stand.y, facing: 'down' };
      // 월드가 아직 없어도 화면이 새 자리를 보여 주고, 저장에도 그 자리가 적힌다
      this.bridge.position.set({ ...this.start });
      this.bridge.patchStatus({ regionId: this.map.regionAt(this.start.x, this.start.y).regionId });
      return true;
    }
    this.command({ type: 'teleport-to-station', stationId });
    return true;
  }

  /** 월드가 준비되고 멈춰 있지 않게 될 때마다 받아 둔 명령을 보낸다 */
  private flushWhenLive(): void {
    this.offLive?.();
    const flush = (): void => {
      if (!this.live) return;
      const queued = this.pending.splice(0);
      for (const c of queued) this.bridge.commands.send(c);
    };
    const offStatus = this.bridge.status.subscribe(flush);
    const offPause = this.bridge.pause.subscribe(flush);
    this.offLive = () => {
      offStatus();
      offPause();
    };
    flush();
  }

  dispose(): void {
    this.disposed = true;
    this.offLive?.();
    this.offLive = null;
    this.pending = [];
    this.handle?.destroy();
    this.handle = null;
  }
}
