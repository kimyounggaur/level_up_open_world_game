// 앱 조립: 콘텐츠, 세션, 소리, 재생기, 컨트롤러를 하나로 묶는다. 이 파일만 모든 계층을 알고 있다(10.2).
import { WorldClock } from '../audio/clock';
import { measureLoudness } from '../audio/instruments';
import { ToneEngine } from '../audio/engine';
import { Mixer } from '../audio/mixer';
import type { AudioEngine } from '../audio/mixer';
import { PlayAudio } from '../audio/playAudio';
import { TaskTransport } from '../audio/transport';
import type { IntervalTimer } from '../audio/types';
import { WorldAudio } from '../audio/worldAudio';
import type { WorldAudioDeps } from '../audio/worldAudio';
import type { AttemptResult } from '../domain/attempt';
import { ContentCatalog } from '../domain/catalog';
import type { Channel } from '../domain/catalog';
import type { QuestDefinition } from '../domain/content';
import type { Creation } from '../domain/creation';
import { soundPiecesOf, spotsOf } from '../domain/discovery';
import type { DiscoveryDef } from '../domain/discovery';
import type { InstallationDef } from '../domain/installation';
import type { PlayInstrumentDef } from '../domain/play';
import { RESIDENTS, playingResidents } from '../domain/residents';
import type { SaveData } from '../domain/save/save';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS } from '../domain/save/settings';
import type { Preferences, Settings } from '../domain/save/settings';
import { ChallengeSession } from '../domain/session';
import type { SessionSnapshot } from '../domain/session';
import type { WorldMap } from '../domain/world';
import { LANDMARK_SOUNDS, ensembleLayersOf } from '../domain/worldsound';
import { Store } from '../platform/bridge';
import { UsageLog } from '../platform/log';
import type { SaveStorage } from '../platform/storage';
import { Creations } from './creations';
import { Discoverer } from './discover';
import { loadDiscoveries, loadPlayInstruments } from './discovery-data';
import { Festival } from './festival';
import { FoundDiscoveries } from './found';
import { loadInstallations } from './installation-data';
import { OpenedQuests } from './opened';
import { availablePanelIds } from './panels';
import { Persistence } from './persistence';
import { ReactionTracker } from './reaction';
import type { PageEvents, Timers } from './persistence';
import { bindSettings, effectiveReducedMotion } from './settings';
import { intervalTimer } from './timer';
import { UsageTracker } from './usage';
import { documentVisibility } from './visibility';
import { VisitedStations } from './visited';
import { loadWorldMap } from './world-data';
import { WorldHost } from './world-host';
import type { StartWorld } from './world-host';
import { ChallengeController } from '../ui/challenge/controller';
import { FreeMelody } from '../ui/challenge/melody';
import { SlotBench } from '../ui/challenge/slotBench';
import { InstallationController } from '../ui/installation/controller';
import type { LoudnessReading } from '../ui/dev/SoundCheck';

/** 과제 파일들. 빌드 때 `npm run validate`가 먼저 검사한다 */
const QUEST_MODULES = import.meta.glob('../../content/quests/*.json', { eager: true, import: 'default' }) as Record<string, QuestDefinition>;

export const loadQuestDefinitions = (): QuestDefinition[] => Object.entries(QUEST_MODULES).sort(([a], [b]) => a.localeCompare(b)).map(([, def]) => def);

export interface AppContext {
  catalog: ContentCatalog;
  session: ChallengeSession;
  mixer: Mixer;
  transport: TaskTransport;
  controller: ChallengeController;
  /** 놓기 작업대(4.2): 월드의 설치물 모드와 음계 패널이 같은 것을 쓴다. 손에 든 재료만 들고, 초안은 세션이 쥔다 */
  bench: SlotBench;
  /** 설치물 모드(4.2): 정거장에서 들어가고 나가며, 표지판·돌의 모습·눌러 놓기·밟기 소리를 월드와 화면 사이에서 이어 준다 */
  installation: InstallationController;
  /** 월드(지도, 정거장, 다리). Phaser는 월드 화면을 처음 보일 때 늦게 켠다 */
  world: WorldHost;
  /** 설정(7.8). 바뀌면 믹서, 글자 크기, 움직임 줄이기에 적용된다 */
  settings: Store<Settings>;
  /** 환경설정(첫 조작 안내를 봤는가 등) */
  preferences: Store<Preferences>;
  /** 열어 본 과제 */
  opened: OpenedQuests;
  /** 다녀간 정거장(재료를 놓거나 들어 본 곳). 등불이 켜진다(6.1) */
  visited: VisitedStations;
  /** 찾은 발견 요소(소리 조각, 개념 쪽지). 수첩의 '발견' 쪽과 광장 둘레의 등이 이것을 본다(3.6) */
  found: FoundDiscoveries;
  /** 저장한 곡, 내 곡(6.1 '만듦'). 수첩, 광장 게시판, 무대가 같은 목록을 본다 */
  creations: Creations;
  /** 이 채널에서 보이는 발견 요소들(소리 조각, 개념 쪽지, 3.6). id 순서 */
  discoveries: readonly DiscoveryDef[];
  /** 이 채널에서 보이는 놀이 악기들(3.5, 6-9c). 기록이 없어서 찾았는지와는 무관하다 */
  playInstruments: readonly PlayInstrumentDef[];
  /** 자유 가락(4.9)을 저장하고, 저장한 곡과 찾은 소리 조각을 다시 듣고 놓는 곳. 곡 패널과 수첩이 쓴다 */
  melody: FreeMelody;
  /** 월드에서 발견 요소를 열었을 때 앱이 하는 일(찾았다고 적기, 들려 주기, 알림)과, 찾은 것·게시판의 곡을 월드 다리에 알리는 일 */
  discoverer: Discoverer;
  /** 세계 반응(4-4): 등불, 지역의 소리 층, 합주 층수. 통과 기록과 다녀간 정거장에서 계산한다 */
  reaction: ReactionTracker;
  /** 세계 시계(4-5, 8.2): 광장 합주와 서명 소리와 소리 물결이 같은 박을 센다. 오디오 장치를 만들지 않는다(W-11) */
  worldClock: WorldClock;
  /** 잔치(6.4): 합주 무대에서 마을의 합주를 한 판 울리고, 끝나면 내 곡을 들려 줄지 묻는다. 화면의 잔치 카드와 월드의 악사가 이 상태를 본다 */
  festival: Festival;
  /** 세계 소리(4-5, 4-6): 광장 합주 첫 판과 정거장의 서명 소리. 소리를 켠 뒤에만 마디를 예약한다 */
  worldAudio: WorldAudio;
  /** 놀이 악기의 소리(6-9c): 월드에서 돌을 밟으면 그 돌의 음을 낸다(메아리 악기는 한 박 뒤에 한 번 더) */
  playAudio: PlayAudio;
  /** 저장(10.6). 저장소를 넘기지 않은 실행(시험, 저장 없이 보는 미리보기)에서는 null */
  persistence: Persistence | null;
  /** 사용 기록(4-8, 13.2, 10.9): 관찰에 쓰는 행동 기록. 기기 안에만 쌓고 설정에서 파일로 내보낸다. 저장소를 넘기지 않으면 메모리에만 쌓는다 */
  usageLog: UsageLog;
  /** 사용 기록에 적을 사건을 앱 곳곳의 알림에서 모은다. 화면은 주소가 바뀔 때(routeChanged)와 지도의 바로 이동(mapTeleported)만 알려 준다 */
  usage: UsageTracker;
  /** 음마다 소리 크기를 오프라인으로 잰다(소리 점검 화면) */
  measure: (midis: readonly number[]) => Promise<LoudnessReading[]>;
  dispose: () => void;
}

export interface AppOptions {
  channel?: Channel;
  definitions?: readonly QuestDefinition[];
  /** 소리 장치. 테스트에서는 가짜를 넣는다 */
  createEngine?: () => AudioEngine;
  /** 늘 흐르는 시계(초). 과제 재생기와 세계 시계가 이것을 쓴다. 테스트에서는 가짜를 넣는다. 기본은 performance.now() */
  monotonicNow?: () => number;
  makeId?: () => string;
  nowIso?: () => string;
  /** 설치물 정의. 기본은 content/installations의 파일들. 시험에서는 필요한 것만 넣는다 */
  installations?: readonly InstallationDef[];
  /** 월드 설정. 시험에서는 지도와 가짜 시작 함수를 넣는다 */
  world?: { map?: WorldMap; load?: () => Promise<StartWorld>; start?: { x: number; y: number; facing?: 'up' | 'down' | 'left' | 'right' } };
  /** 처음 설정과 환경설정(저장에서 읽은 값) */
  settings?: Settings;
  preferences?: Preferences;
  /** 이미 열어 본 과제 id들(저장에서 읽은 값) */
  opened?: Iterable<string>;
  /** 이미 다녀간 정거장 id들(저장에서 읽은 값) */
  visited?: Iterable<string>;
  /** 이미 찾은 발견 요소 id들(저장에서 읽은 값) */
  found?: Iterable<string>;
  /** 저장해 둔 곡들(저장에서 읽어 parseCreations를 거친 값) */
  creations?: readonly Creation[];
  /** 발견 요소. 기본은 content/discoveries의 파일들(채널에서 보이는 것만). 시험에서는 필요한 것만 넣는다 */
  discoveries?: readonly DiscoveryDef[];
  /** 놀이 악기. 기본은 content/discoveries의 파일들(채널에서 보이는 것만). 시험에서는 필요한 것만 넣는다 */
  playInstruments?: readonly PlayInstrumentDef[];
  /** 세계 소리의 깨우는 장치와 탭 보임. 시험에서는 가짜를 넣는다(visibility에 null이면 늘 보이는 것으로 친다) */
  worldSound?: { timer?: IntervalTimer; visibility?: WorldAudioDeps['visibility'] | null };
  /** 저장에서 읽은 도전 초안과 도움 연습 상태 */
  session?: SessionSnapshot;
  /** 저장에서 읽은 지난 시도 기록 */
  attempts?: readonly AttemptResult[];
  /** 저장소에서 읽은 사용 기록(UsageLog.open). 없으면 이번 실행에서만 메모리에 쌓는다 */
  usageLog?: UsageLog;
  /** 문서 루트(글자 크기, 움직임 줄이기 속성을 붙일 곳). 기본은 document.documentElement, 없으면 붙이지 않는다 */
  root?: { dataset: DOMStringMap } | null;
  /** 저장. 저장소를 넘기면 상태가 바뀔 때마다 저장하고, 페이지가 닫힐 때 긴급 사본을 적는다 */
  persistence?: {
    storage: SaveStorage;
    /** 읽어 온 저장(없으면 null) */
    restored: SaveData | null;
    pageEvents?: PageEvents | null;
    timers?: Timers;
    debounceMs?: number;
    walkingIntervalMs?: number;
  };
}

let idCounter = 0;
const defaultId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `att-${Date.now().toString(36)}-${++idCounter}`);

export function createAppContext(options: AppOptions = {}): AppContext {
  const catalog = new ContentCatalog(options.definitions ?? loadQuestDefinitions(), options.channel ?? __RELEASE_CHANNEL__);
  const session = new ChallengeSession(options.session);
  const mixer = new Mixer({ createEngine: options.createEngine ?? (() => new ToneEngine()), ...(options.monotonicNow ? { monotonicNow: options.monotonicNow } : {}) });
  const transport = new TaskTransport({ clock: mixer.clock, timer: intervalTimer, sink: mixer.taskSink });
  const controller = new ChallengeController({
    catalog,
    session,
    mixer,
    transport,
    makeId: options.makeId ?? defaultId,
    nowIso: options.nowIso ?? (() => new Date().toISOString()),
    ...(options.attempts ? { attempts: options.attempts } : {}),
  });
  const bench = new SlotBench(controller);
  const settings = new Store<Settings>({ ...(options.settings ?? DEFAULT_SETTINGS) });
  const preferences = new Store<Preferences>({ ...(options.preferences ?? DEFAULT_PREFERENCES) });
  const opened = new OpenedQuests(options.opened ?? []);
  const visited = new VisitedStations(options.visited ?? []);
  const found = new FoundDiscoveries(options.found ?? []);
  const creations = new Creations(options.creations ?? []);
  const discoveries = options.discoveries ?? loadDiscoveries(catalog.channel);
  const playInstruments = options.playInstruments ?? loadPlayInstruments(catalog.channel);
  const melody = new FreeMelody({
    controller,
    creations,
    found,
    pieces: soundPiecesOf(discoveries),
    nowIso: options.nowIso ?? (() => new Date().toISOString()),
  });
  const root = options.root !== undefined ? options.root : typeof document !== 'undefined' ? document.documentElement : null;
  const unbindSettings = bindSettings(settings, mixer, root);
  const installations = options.installations ?? loadInstallations();
  const world = new WorldHost({
    map: options.world?.map ?? loadWorldMap(),
    installations,
    spots: spotsOf(discoveries),
    play: playInstruments,
    residents: RESIDENTS,
    reduceMotion: () => effectiveReducedMotion(settings.get()),
    ...(options.world?.load ? { load: options.world.load } : {}),
    ...(options.world?.start ? { start: options.world.start } : {}),
  });
  const reaction = new ReactionTracker({ map: world.map, controller, visited, installations, bridge: world.bridge });
  // 주민(7-6): 그 지역의 층이 1 이상이면 그 성부가 합주에 더해져 있으니 그 지역의 주민이 연주한다. 소리 층에서 계산해 월드에 알린다(저장하지 않는다, 층은 늘기만 한다: W-6)
  const syncResidents = (): void => {
    const playing = playingResidents((id) => reaction.store.get().regionLayers[id]);
    const prev = world.bridge.residents.get();
    if (playing.length !== prev.length || playing.some((id, i) => id !== prev[i])) world.bridge.residents.set(playing);
  };
  syncResidents();
  const offResidents = reaction.store.subscribe(syncResidents);
  const worldClock = new WorldClock(mixer.clock);
  const worldTimer = options.worldSound?.timer ?? intervalTimer;
  // 잔치(6.4): 여섯 지역의 층 그대로 합주를 울리고, 울리는 성부마다 악사를 세운다. 합주 무대의 표지판이 연다
  const festival = new Festival({
    clock: worldClock,
    timer: worldTimer,
    bridge: world.bridge,
    layers: () => ensembleLayersOf((id) => reaction.store.get().regionLayers[id]),
    creations,
    player: controller,
    announce: (lines) => reaction.announce(lines),
  });
  const installation = new InstallationController({
    bridge: world.bridge,
    map: world.map,
    catalog,
    session,
    controller,
    bench,
    mixer,
    installations,
    panels: availablePanelIds(),
    opened,
    creations,
    festival,
  });
  const visibility = options.worldSound?.visibility === undefined ? documentVisibility() : (options.worldSound.visibility ?? undefined);
  const worldAudio = new WorldAudio({
    mixer,
    clock: worldClock,
    timer: worldTimer,
    stations: world.map.stations.map((s) => ({ stationId: s.stationId, regionId: s.regionId, x: s.x, y: s.y })),
    pieces: soundPiecesOf(discoveries),
    // 소리를 내는 지역 표지(건반 늪의 기준음 탑): 지역 파일의 표지 자리에서 울린다(3.5, 7-4)
    landmarks: LANDMARK_SOUNDS.map((def) => {
      const lm = world.map.region(def.regionId).landmark;
      return { ...def, x: lm.x, y: lm.y };
    }),
    festival: () => festival.run(),
    reaction: () => {
      const r = reaction.store.get();
      return { villageLayer: r.regionLayers.village ?? 0, regionLayers: r.regionLayers, lanterns: r.lanterns };
    },
    listener: () => ({ ...world.bridge.position.get(), regionId: world.bridge.status.get().regionId }),
    ...(visibility ? { visibility } : {}),
  });
  // 놀이 악기(6-9c): 월드에서 돌을 밟으면 그 돌의 음이 난다. 기록도 판정도 없다(W-5)
  const playAudio = new PlayAudio(mixer, playInstruments);
  const offPads = world.bridge.events.subscribe((ev) => {
    if (ev.type === 'pad-struck') playAudio.strike(ev.playId, ev.pad);
  });
  const po = options.persistence;
  const persistence = po
    ? new Persistence({
        storage: po.storage,
        catalog,
        session,
        controller,
        settings,
        preferences,
        opened,
        visited,
        found,
        creations,
        world,
        restored: po.restored,
        nowIso: options.nowIso ?? (() => new Date().toISOString()),
        ...(po.pageEvents !== undefined ? { pageEvents: po.pageEvents } : {}),
        ...(po.timers ? { timers: po.timers } : {}),
        ...(po.debounceMs !== undefined ? { debounceMs: po.debounceMs } : {}),
        ...(po.walkingIntervalMs !== undefined ? { walkingIntervalMs: po.walkingIntervalMs } : {}),
      })
    : null;
  persistence?.start();
  const usageLog = options.usageLog ?? UsageLog.inMemory(options.nowIso ?? (() => new Date().toISOString()));
  const usage = new UsageTracker({ log: usageLog, catalog, map: world.map, session, controller, installation, bridge: world.bridge });
  usage.start();
  const discoverer = new Discoverer({
    discoveries,
    found,
    creations,
    melody,
    bridge: world.bridge,
    announce: (lines) => reaction.announce(lines),
    onFound: (id) => usage.discoveryFound(id),
  });
  // 페이지가 숨겨지거나 닫히는 순간에는 기록도 바로 적기 시작한다
  const offUsageHide = po?.pageEvents ? po.pageEvents.onHide(() => usageLog.onHide()) : null;
  return {
    catalog,
    session,
    mixer,
    transport,
    controller,
    bench,
    installation,
    world,
    settings,
    preferences,
    opened,
    visited,
    found,
    creations,
    discoveries,
    playInstruments,
    melody,
    discoverer,
    reaction,
    worldClock,
    festival,
    worldAudio,
    playAudio,
    persistence,
    usageLog,
    usage,
    measure: async (midis) => measureLoudness(await import('tone'), midis),
    dispose: () => {
      offUsageHide?.();
      discoverer.dispose();
      usage.dispose();
      usageLog.dispose();
      persistence?.dispose();
      festival.dispose();
      offPads();
      playAudio.dispose();
      worldAudio.dispose();
      offResidents();
      reaction.dispose();
      unbindSettings();
      installation.dispose();
      world.dispose();
      bench.dispose();
      controller.dispose();
      mixer.dispose();
    },
  };
}
