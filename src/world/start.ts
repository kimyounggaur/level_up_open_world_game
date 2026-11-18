// 월드 시작(설계서 3-1, 10.2): Phaser 게임을 만들고 WorldRuntime, 키 입력, 장면을 하나로 묶는다.
// 앱은 이 파일을 필요할 때만(월드 화면을 처음 열 때) 불러온다. Phaser가 큰 덩어리라 첫 화면을 느리게 하지 않기 위해서다.
import Phaser from 'phaser';
import type { WorldSpot } from '../domain/discovery';
import type { InstallationDef } from '../domain/installation';
import type { PlayInstrumentDef } from '../domain/play';
import { residentSpots } from '../domain/residents';
import type { ResidentDef } from '../domain/residents';
import { isTimelineStones } from '../domain/timelineStones';
import type { Facing, WorldMap } from '../domain/world';
import type { WorldBridge } from '../platform/bridge';
import { KeyTracker, isActivatable, isTypingTarget } from './keys';
import { NavGrid } from './nav';
import { NAV_ROWS, OBJECT_ATLAS, STATION_HITS, WORLD_OBJECTS } from './generated/worldData';
import { WorldRuntime } from './runtime';
import { WorldScene } from './WorldScene';

export interface StartWorldOptions {
  /** 캔버스를 붙일 요소(화면 전체) */
  parent: HTMLElement;
  map: WorldMap;
  bridge: WorldBridge;
  start: { x: number; y: number; facing?: Facing };
  /** 움직임 줄이기. 기본은 브라우저의 prefers-reduced-motion */
  reduceMotion?: () => boolean;
  /** 설치물(돌의 자리). 밟기 사건, 설치물 모드의 카메라, 돌 위의 그림에 쓴다 */
  installations?: readonly InstallationDef[];
  /** 정거장이 아닌 자리(발견 요소, 광장 게시판). 안내 칩과 열기에 쓰고, 표식으로 그린다(3.6, 6.1) */
  spots?: readonly WorldSpot[];
  /** 놀이 악기(3.5, 6-9c). 걸어서 돌에 올라서면 소리와 불빛이 난다 */
  play?: readonly PlayInstrumentDef[];
  /** 주민(악사, 7-6). 안내 칩과 말 걸기에 쓰고(spots처럼 96 px), 따로 둔 주민 층이 그린다. 연주하는 주민은 bridge.residents에서 읽는다 */
  residents?: readonly ResidentDef[];
}

export interface WorldHandle {
  readonly runtime: WorldRuntime;
  readonly scene: WorldScene;
  readonly game: Phaser.Game;
  destroy(): void;
}

const defaultReduceMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 키 이벤트를 월드로 보낼지 정한다. 입력칸에서 누른 키, 단축키, 월드가 멈춘 동안의 키는 보내지 않는다(7.5) */
export function startWorld(opts: StartWorldOptions): WorldHandle {
  const grid = NavGrid.fromRows(NAV_ROWS);
  const installations = opts.installations ?? [];
  const spots = opts.spots ?? [];
  const play = opts.play ?? [];
  const residents = opts.residents ?? [];
  // 지나가는 중에 밟는 돌(4.3): 징검다리(T2)의 돌은 밟지 않는다. 여울은 걸어 들어갈 수 없는 물이고, 돌은 눌러서나 키로 놓는 악기다(4.4, W-1)
  const walkable = installations.filter((inst) => !isTimelineStones(inst));
  const runtime = new WorldRuntime({ map: opts.map, grid, bridge: opts.bridge, hits: STATION_HITS, start: opts.start, installations: walkable, spots: [...spots, ...residentSpots(residents)], play });
  const keys = new KeyTracker();
  const scene = new WorldScene({
    runtime,
    bridge: opts.bridge,
    objects: WORLD_OBJECTS,
    atlas: OBJECT_ATLAS,
    keyboard: () => keys.input,
    reduceMotion: opts.reduceMotion ?? defaultReduceMotion,
    installations,
    stations: opts.map.stations.map((s) => ({ stationId: s.stationId, x: s.x, y: s.y })),
    spots,
    play,
    residents,
  });

  const onKeyDown = (e: KeyboardEvent): void => {
    // 설치물 모드에서는 키가 놓기 작업대의 것이다(4.2). 월드는 받지 않고, 누르고 있던 이동 키도 놓은 것으로 친다
    if (runtime.paused || isTypingTarget(e.target) || opts.bridge.installationMode.get()) {
      keys.clear();
      return;
    }
    const action = keys.down(e);
    if (!action) return;
    if (action === 'interact') {
      // 버튼에 초점이 있을 때 Enter는 그 버튼의 누르기다. 상호작용이 겹쳐 일어나지 않게 한다
      if (e.key === 'Enter' && isActivatable(e.target)) return;
      if (runtime.interact()) e.preventDefault();
      return;
    }
    e.preventDefault(); // 방향키가 화면을 밀지 않게 한다
  };
  const onKeyUp = (e: KeyboardEvent): void => keys.up(e);
  const release = (): void => keys.clear();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  const offStatus = opts.bridge.status.subscribe((s) => {
    if (s.paused) keys.clear();
  });

  let game: Phaser.Game;
  try {
    game = new Phaser.Game({
      // Some classroom devices disable WebGL. Phaser keeps the same world and
      // input with its Canvas renderer when GPU acceleration is unavailable.
      type: Phaser.AUTO,
      parent: opts.parent,
      backgroundColor: '#DDE5D3',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene,
      // 소리는 Tone.js가 맡는다. Phaser는 소리를 만들지 않는다(W-11: 사용자가 켠 뒤에만 소리가 난다)
      audio: { noAudio: true },
      // 키는 위에서 직접 읽는다. 입력칸의 글자를 가로채지 않는다
      input: { keyboard: false, gamepad: false },
      banner: false,
      disableContextMenu: true,
      render: { antialias: true, powerPreference: 'low-power' },
    });
  } catch (err) {
    teardown();
    opts.bridge.patchStatus({ error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  game.canvas.setAttribute('role', 'img');
  game.canvas.setAttribute('aria-label', '음악 마을 월드. 방향키 또는 W A S D로 걷고, E 또는 Enter로 가까운 작업대를 엽니다. 목록(L)과 지도(M)로도 같은 과제를 열 수 있습니다.');

  function teardown(): void {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', release);
    offStatus();
    runtime.dispose();
  }

  return {
    runtime,
    scene,
    game,
    destroy: () => {
      teardown();
      game.destroy(true);
    },
  };
}
