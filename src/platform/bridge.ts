// 월드(Phaser)와 화면(Preact)이 서로를 직접 부르지 않고 주고받는 다리(설계서 10.2: 월드와 화면은 이벤트로만 만난다).
// 월드는 상태를 알리고(status, position) 사건을 알리며(events), 화면은 월드에 명령한다(commands).
import type { BellView } from '../domain/bells';
import type { StageFill } from '../domain/ensemble';
import type { MusicianPart } from '../domain/festival';
import type { LanternState } from '../domain/reaction';
import type { ScreenSize, WorldView } from '../domain/ripple';
import type { KeyBridgeView } from '../domain/keyBridge';
import type { TerraceView } from '../domain/terrace';
import type { TimelineView } from '../domain/timelineStones';
import type { Facing, RegionId, SpotKind } from '../domain/world';

export type Unsubscribe = () => void;

/** 보내는 값을 구독자 모두에게 차례로 전한다. 구독자 하나가 던져도 나머지는 받는다(던진 오류는 따로 다시 던진다) */
export class Channel<T> {
  private readonly listeners = new Set<(v: T) => void>();

  subscribe(fn: (v: T) => void): Unsubscribe {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  send(v: T): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(v);
      } catch (err) {
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}

/** 현재 값을 들고 있고 바뀌면 알린다. 같은 값(===)이면 알리지 않는다 */
export class Store<T> {
  private value: T;
  private readonly channel = new Channel<T>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.channel.send(next);
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(fn: (v: T) => void): Unsubscribe {
    return this.channel.subscribe(fn);
  }
}

/** 안내 칩에 쓰는 가까운 사물. 정거장이 아닌 자리(발견 요소, 광장 게시판, 주민)이면 spot에 그 종류가 적히고 stationId에는 그 자리의 id가 들어간다 */
export interface NearStation {
  stationId: string;
  name: string;
  spot?: SpotKind;
}

/** 드물게 바뀌는 월드 상태. 화면이 이것을 보고 그린다 */
export interface WorldStatus {
  /** 첫 장면 조각이 올라와 걸을 수 있는가 */
  ready: boolean;
  /** 지금 서 있는 지역(왼쪽 위 이름) */
  regionId: RegionId;
  /** 96 px 안의 가장 가까운 정거장(7.4). 없으면 null */
  near: NearStation | null;
  /** 월드가 멈춰 있는가(패널이나 겹침 화면이 열려 있다) */
  paused: boolean;
  /** 누른 곳이나 지도의 '걸어가기'로 길을 따라 걷는 중인가 */
  walking: boolean;
  /** 월드를 불러오지 못했을 때의 이유. 있으면 화면이 목록·지도 대신 안내를 보여 준다(W-2: 목록과 주소로는 계속 열린다) */
  error: string | null;
}

/** 캐릭터 위치. 지도의 '내 위치'와 저장에 쓰며 자주 바뀌므로 따로 둔다(알림은 월드가 덜어서 보낸다) */
export interface PlayerPosition {
  x: number;
  y: number;
  facing: Facing;
}

export type WorldCommand =
  /** E, Enter, 상호작용 버튼: 가장 가까운 정거장을 연다 */
  | { type: 'interact' }
  /** 지도의 '걸어가기': 정거장 앞까지 길을 찾아 걷는다. 도착하면 도착 사건을 보낸다 */
  | { type: 'walk-to-station'; stationId: string }
  /** 지도의 '바로 이동': 정거장 앞에 선다 */
  | { type: 'teleport-to-station'; stationId: string }
  /** 저장한 자리로 서기 */
  | { type: 'teleport'; x: number; y: number }
  | { type: 'cancel-walk' };

export type WorldEvent =
  /** 정거장을 열라는 상호작용이 일어났다 */
  | { type: 'open-station'; stationId: string }
  /** 발견 요소(소리 조각, 개념 쪽지)에 다가가 E나 누르기를 했다(3.6). 찾았다고 적는 일은 화면(앱)이 한다 */
  | { type: 'open-discovery'; discoveryId: string }
  /** 광장 게시판에 다가가 E나 누르기를 했다(6.1). 수첩의 '내 곡' 쪽을 여는 일은 화면(앱)이 한다 */
  | { type: 'open-board' }
  /** 주민(악사)에게 다가가 E나 누르기로 말을 걸었다(1.5, 7-6). 한 줄 안내를 만들어 보여 주는 일은 화면(앱)이 한다. 저장에 적지 않는다 */
  | { type: 'open-resident'; residentId: string }
  /** 길 걷기가 끝났다. 정거장 앞이면 그 id, 아니면 null */
  | { type: 'arrived'; stationId: string | null }
  /**
   * 지나가는 중에 설치물의 돌을 밟았다(4.3 '돌을 밟으면 그 돌의 음이 울린다'). 슬롯은 1부터.
   * entered는 설치물 바깥에서 올라섰다는 표시다(설치물 안에서 옮겨 밟은 것이 아니다). 종나무(4.6)는 올라선 나무의 화음을 한 번 울리는 데 쓴다.
   */
  | { type: 'stepped'; installationId: string; slot: number; entered?: true }
  /**
   * 놀이 악기(3.5)의 돌에 올라섰다(6-9c). 돌은 1부터. 바로 이동으로 돌 위에 서도 오지 않고, 걸어 올라설 때만 온다.
   * 기록도 판정도 없다(W-5): 소리를 내고 돌을 비추는 일만 이 사건을 받는다.
   */
  | { type: 'pad-struck'; playId: string; pad: number }
  /**
   * 설치물 모드에서 돌을 눌렀다(눌러서 놓기, W-4). 슬롯은 1부터.
   * 징검다리 줄이면 tick(마디 처음부터 센 틱)도 함께 온다: 눌린 점이 놓인 틱이다. 셋잇단 돌은 칸의 경계에 맞지 않아서 칸 번호만으로는 어느 돌인지 알 수 없다.
   * 계단밭(T5, 4.7)이면 step도 함께 온다: 열(slot) 안에서 눌린 높이이고, 가온 도(C4)에서 온음계로 몇 칸 위인가(아래면 음수)다. 월드가 눌린 점의 세로 좌표를 이 정수로 바꿔 알린다.
   */
  | { type: 'slot-pressed'; installationId: string; slot: number; tick?: number; step?: number };

/** 설치물의 자리(돌) 하나가 지금 어떤 모습인가. 화면이 정해 알리고, 월드는 돌 위에 그리기만 한다 */
export interface SlotMark {
  /** 1부터 */
  slot: number;
  /** 놓인 음의 이름(조표를 적용한다). 예: 'B♭4'. 빈 자리는 null */
  name: string | null;
  /** 놓인 음의 높이(MIDI). 빈 자리는 null */
  midi: number | null;
  /** 판정이 가리킨 자리(느낌표 표식). 놓은 것이 바뀌면 사라진다 */
  flagged: boolean;
  /** 지금 고른 자리 */
  selected: boolean;
  /** 듣는 중 지금 울리는 자리 */
  playing: boolean;
  /**
   * 무대 바닥 칸(T7)의 채움. 돌 설치물에는 없다. 'unused'는 이 판본에서 쓰지 않는 칸이다.
   * 이름(name)은 '3/4'처럼 채운 칸 수이고, 비어 있으면 null이다(바닥에서 음표 하나하나는 읽지 않는다, 4.9)
   */
  fill?: StageFill;
}

/** 설치물 하나의 돌 상태 모음 */
export interface InstallationView {
  installationId: string;
  slots: readonly SlotMark[];
  /**
   * 징검다리(T2)의 모습: 놓인 돌(길이가 있는 구간), 남은 물, 놓으려는 자리, 듣는 중의 물결 선.
   * 징검다리는 돌 길이가 제각각이라 칸 하나하나(slots)가 아니라 구간으로 그린다. slots는 가장 잘게 나눈 칸의 요약으로 남는다.
   */
  timeline?: TimelineView;
  /**
   * 종나무(T4)의 모습: 걸린 종, 고른 종 자리와 가지, 쓸 수 있는 가지. 종나무는 칸 하나(slots)가 가지(고리) 하나라서 종이 걸린 고리가 이름과 높이를 갖고,
   * 월드는 이것을 읽어서 종과 가지를 옮겨 그린다.
   */
  bells?: BellView;
  /**
   * 계단밭(T5)의 모습: 열마다 등(음표)의 높이, 고른 열, 판정이 가리킨 열, 울리는 열. 열 하나(slots)가 자리 하나이지만 열 안의 높이는 자리가 아니라 정수(온음계 위치)라서
   * 월드는 이것을 읽어 등과 덧줄 돌담을 옮겨 그린다. slots는 열의 요약으로 남는다(등이 있는 열만 이름과 높이를 갖는다).
   */
  terrace?: TerraceView;
  /**
   * 건반 다리(T6)의 모습: 널 위의 커서, 걸린 이름표, 밧줄과 말뚝, 순서 깃발, 표지판 악보, 울리는 널. 널 하나(slots)가 자리 하나이고 널의 소리 높이는 자리 번호가 정한다.
   * 이름표·말뚝·깃발은 널이 아니라 초안의 칸이라서 월드는 이것을 읽어 널 위에 옮겨 그린다. slots는 널의 요약으로 남는다(커서가 선 널은 selected).
   */
  bridge?: KeyBridgeView;
}

/** 카메라가 지금 보여 주는 월드의 직사각형과 화면의 크기. 소리 물결(8.4)이 화면 밖 정거장의 방향을 구하는 데 쓴다 */
export interface ViewReport {
  view: WorldView;
  screen: ScreenSize;
}

/** 설치물 모드: 이 설치물에 들어가 있다. 월드는 이 동안 카메라가 설치물을 담고, 이동 키와 누르기를 걷기에 쓰지 않는다 */
export interface InstallationMode {
  installationId: string;
  stationId: string;
}

/** 잔치(6.4)의 월드 쪽 모습: 열려 있는 동안 악사들이 무대에 선다. 화면(앱)이 정하고 월드는 그리기만 한다 */
export interface FestivalWorld {
  active: boolean;
  /** 무대에 선 악사들의 성부(지금 실제로 울리는 성부와 같다) */
  musicians: readonly MusicianPart[];
}

export const NO_FESTIVAL: FestivalWorld = { active: false, musicians: [] };

export const INITIAL_STATUS: WorldStatus = { ready: false, regionId: 'village', near: null, paused: false, walking: false, error: null };

export class WorldBridge {
  /** 화면이 쓴다: 패널이나 겹침 화면이 열려 있어 월드를 멈춰야 하는가. 사건이 아니라 상태라서, 월드가 늦게 시작해도 값을 읽을 수 있다 */
  readonly pause = new Store<boolean>(false);
  readonly status = new Store<WorldStatus>(INITIAL_STATUS);
  readonly position: Store<PlayerPosition>;
  readonly commands = new Channel<WorldCommand>();
  readonly events = new Channel<WorldEvent>();
  /** 설치물 모드(4.2). 화면이 정하고 월드가 읽는다. 상태라서 월드가 늦게 시작해도 값을 읽을 수 있다 */
  readonly installationMode = new Store<InstallationMode | null>(null);
  /** 설치물마다 돌의 지금 모습. 화면이 정해 알리고 월드가 돌 위에 그린다 */
  readonly installationViews = new Store<readonly InstallationView[]>([]);
  /** 화면 아래를 조작 막대가 가리는 높이(화면 px). 월드가 설치물을 막대 위쪽에 담는 데 쓴다 */
  readonly bottomInset = new Store<number>(0);
  /** 카메라가 보여 주는 범위. 월드가 덜어서 알린다(0.1초마다, 바뀐 만큼만). 월드가 시작하기 전에는 null이다 */
  readonly view = new Store<ViewReport | null>(null);
  /** 정거장마다 등불의 모습(6.1). 화면이 통과 기록과 다녀간 곳에서 계산해 알리고 월드가 정거장 곁에 그린다. 없는 정거장은 꺼진 등불이다 */
  readonly lanterns = new Store<Readonly<Record<string, LanternState>>>({});
  /** 찾은 발견 요소 id들(3.6). 화면이 저장에서 읽거나 새로 찾을 때 알리고, 월드는 표식의 모습과 광장 둘레의 등을 그린다. 한번 찾은 것은 사라지지 않는다(W-6) */
  readonly found = new Store<ReadonlySet<string>>(new Set());
  /** 광장 게시판에 걸린 내 곡들의 id(6.1 '만듦', 오래된 것부터). 월드는 걸린 쪽지를 그리기만 한다 */
  readonly board = new Store<readonly string[]>([]);
  /** 잔치(6.4). 열려 있는 동안 악사들이 무대에 선다. 상태라서 월드가 늦게 시작해도 값을 읽을 수 있다 */
  readonly festival = new Store<FestivalWorld>(NO_FESTIVAL);
  /** 지금 연주하는 주민(악사)들의 id(7-6). 그 지역의 층이 1 이상이라 그 성부가 합주에 더해져 있는 주민이다. 화면이 층에서 계산해 알리고 월드는 그림의 장을 고르는 데만 쓴다 */
  readonly residents = new Store<readonly string[]>([]);

  constructor(start: PlayerPosition) {
    this.position = new Store<PlayerPosition>(start);
  }

  /** 상태의 일부만 고친다. 바뀐 것이 없으면 알리지 않는다 */
  patchStatus(patch: Partial<WorldStatus>): void {
    const prev = this.status.get();
    let changed = false;
    for (const k of Object.keys(patch) as Array<keyof WorldStatus>) {
      const a = prev[k];
      const b = patch[k];
      if (k === 'near') {
        const x = a as NearStation | null;
        const y = b as NearStation | null | undefined;
        if (y !== undefined && (x?.stationId !== y?.stationId || x?.name !== y?.name || x?.spot !== y?.spot)) changed = true;
      } else if (b !== undefined && a !== b) changed = true;
    }
    if (changed) this.status.set({ ...prev, ...patch });
  }
}
