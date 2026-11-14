// 월드 장면(설계서 3-1, 3-5, 7.1–7.3, 10.5). 그리는 일만 맡는다: 바닥 조각 스트리밍, 사물(발 위치 y순 겹침), 캐릭터 표식, 카메라, 누르기.
// 움직임과 상호작용의 규칙은 WorldRuntime(Phaser 없음)에 있고, 이 장면은 그 결과를 화면에 옮겨 그린다.
import Phaser from 'phaser';
import { bellFollowOf } from '../domain/bells';
import { plazaLampId, plazaLampSite, plazaLampStates } from '../domain/discovery';
import { stageFloorOf } from '../domain/festival';
import { bridgeFollowOf } from '../domain/keyBridge';
import type { WorldSpot } from '../domain/discovery';
import { frameTuningOf, slotAtPoint, slotBounds } from '../domain/installation';
import type { PlayInstrumentDef } from '../domain/play';
import type { LanternState } from '../domain/reaction';
import type { ResidentDef } from '../domain/residents';
import type { InstallationDef, WorldRect } from '../domain/installation';
import { terraceFollowOf, terraceMapOf, terraceStepAtPress } from '../domain/terrace';
import { beatFollowOf, followsBeat, laneOf, slotStartTick, tickAtSlotPoint } from '../domain/timelineStones';
import { wheelFollowOf, wheelOf, wheelSlotAt, wheelTurnDeg } from '../domain/waterwheel';
import { CHUNK_PAD } from '../domain/world';
import type { Facing } from '../domain/world';
import { Store } from '../platform/bridge';
import type { ViewReport, WorldBridge } from '../platform/bridge';
import { CameraRig, MENU_BAND, cameraZoom, clampCenter, snapCenter, visibleWorld } from './camera';
import type { CameraPose, ViewSize } from './camera';
import { chunkName, chunkOrigin, chunkUrl, planChunks } from './chunks';
import type { ViewRect } from './chunks';
import { ViewCull } from './cull';
import type { CullStats } from './cull';
import type { Point } from './nav';
import { FestivalLayer } from './festival/layer';
import type { DrawnMusician } from './festival/layer';
import { InstallationLayer } from './installations/layer';
import type { DrawnInstallation } from './installations/layer';
import { LanternLayer } from './lanterns/layer';
import type { DrawnLantern, LanternSite } from './lanterns/layer';
import { PlayLayer } from './play/layer';
import type { DrawnPlay } from './play/layer';
import { ResidentLayer } from './residents/layer';
import type { DrawnResident } from './residents/layer';
import { SpotLayer } from './spots/layer';
import type { DrawnSpot } from './spots/layer';
import { depthOfFoot } from './objects';
import { PLAYER_FOOT_Y, PLAYER_FRAME_H, PLAYER_FRAME_W, advanceWalk, playerLook } from './playerSprite';
import type { WorldObjectData } from './objects';
import type { MoveInput } from './player';
import type { WorldRuntime } from './runtime';

export interface WorldSceneOptions {
  runtime: WorldRuntime;
  bridge: WorldBridge;
  objects: readonly WorldObjectData[];
  /** 사물 그림 한 장(아틀라스, 6-3): public/world/ 안의 그림 파일과 틀 목록 파일 */
  atlas: { image: string; data: string };
  /** 지금 눌린 이동 키 */
  keyboard: () => MoveInput;
  /** 움직임 줄이기(7.3, 9.7): 켜면 카메라 따라가기 보간, 도착 물결, 걷는 흔들림을 쓰지 않는다 */
  reduceMotion: () => boolean;
  /** 설치물(돌의 자리). 설치물 모드의 카메라와 돌 위의 그림에 쓴다 */
  installations?: readonly InstallationDef[];
  /** 등불이 설 정거장들(6.1). 모습은 다리(bridge.lanterns)에서 읽는다 */
  stations?: readonly LanternSite[];
  /** 정거장이 아닌 자리(발견 요소, 광장 게시판, 3.6, 6.1): 표식을 그린다. 소리 조각의 수만큼 광장 둘레에 등을 세운다 */
  spots?: readonly WorldSpot[];
  /** 놀이 악기(3.5, 6-9c): 바닥의 돌과 음 이름을 그리고, 밟으면 밝힌다 */
  play?: readonly PlayInstrumentDef[];
  /** 주민(악사, 7-6): 지역마다 한 명이 서 있다. 연주하는 주민은 다리(bridge.residents)에서 읽는다. spots와 따로 받는다(발견 표식 층은 주민을 그리지 않는다) */
  residents?: readonly ResidentDef[];
}

/** 월드 맨 아래 바닥 조각, 그 위의 바닥 표시(도착 물결 등), 그 위의 사물과 캐릭터(깊이 = 발 위치 y) */
const GROUND_DEPTH = -1_000_000;
const MARK_DEPTH = -100_000;
const BACKGROUND = 0xdde5d3;
/** 조각을 불러오다 실패하면 이만큼 기다렸다가 다시 시도한다 */
const RETRY_AFTER_MS = 5000;
/** 카메라가 보는 범위를 화면에 알리는 간격(초) */
const VIEW_PUBLISH_INTERVAL = 0.1;
/** 도착 물결 길이(9.7) */
export const RIPPLE_SECONDS = 0.6;
/** 지도의 '바로 이동' 화면 전환 길이(3.7): 새 자리에서 바닥색으로부터 0.3초 동안 나타난다. 움직임 줄이기에서는 없다 */
export const TELEPORT_FADE_MS = 300;
/** 설치물 모드에서 돌을 누를 때 돌 사이 틈의 절반쯤을 더해 본다(손가락이 빗나가도 가까운 돌이 눌린다, W-4) */
export const SLOT_TAP_SLOP = 10;
const TEAL = 0x17675d;

/** 사물 그림 틀의 이름: 그림 파일 이름에서 .svg를 뗀 것 */
export const spriteKey = (file: string): string => file.replace(/\.svg$/, '');
/** 사물 아틀라스를 Phaser 텍스처로 올릴 때 쓰는 키 */
export const OBJECT_ATLAS_KEY = 'world-objects';

export interface SceneDebugState {
  center: Point;
  zoom: number;
  view: ViewRect;
  size: ViewSize;
  chunks: string[];
  pending: string[];
  objects: number;
  playerDepth: number;
  /** 캐릭터를 그린 y. 걷는 중 위아래로 흔들리면 runtime의 y와 달라진다(움직임 줄이기에서는 같다) */
  playerY: number;
  /** Phaser가 센 초당 프레임 수(점검용) */
  fps: number;
  /** 장면 시계(초). 한 프레임에 0.1초까지만 더해서, 프레임이 느린 화면에서는 실제 시간보다 느리게 간다(점검용) */
  clock: number;
  /** 바로 이동 화면 전환을 시작한 횟수(점검용). 움직임 줄이기에서는 늘지 않는다 */
  fades: number;
  /** 설치물 모드의 카메라: 설치물을 담는 쪽인가, 0.3초 전환 중인가 */
  framing: boolean;
  transitioning: boolean;
  /** 설치물 층이 지금 돌 위에 그린 것 */
  installations: readonly DrawnInstallation[];
  /** 정거장 곁에 그린 등불들 */
  lanterns: readonly DrawnLantern[];
  /** 발견 표식과 광장 게시판 */
  spots: readonly DrawnSpot[];
  /** 광장 둘레의 등들(소리 조각을 찾은 만큼 켜진다) */
  plazaLamps: readonly DrawnLantern[];
  /** 잔치 동안 무대 위에 선 악사들(6.4). 잔치가 열려 있지 않으면 비어 있다 */
  musicians: readonly DrawnMusician[];
  /** 놀이 악기의 돌들(6-9c): 돌마다 음 이름과 지금 모습(평소, 밟음, 되돌아온 소리) */
  play: readonly DrawnPlay[];
  /** 서 있는 주민들(7-6): 주민마다 연주 중인가와 지금 그린 장 */
  residents: readonly DrawnResident[];
  /** 화면 밖 그림 건너뛰기(8-4): 거른 그래픽 수와, 그리는 호출을 건너뛴 설치물 수 */
  cull: CullStats & { installationsSkipped: number };
}

export class WorldScene extends Phaser.Scene {
  private readonly o: WorldSceneOptions;
  private readonly chunkImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly chunkPending = new Set<string>();
  private readonly chunkDrop = new Set<string>();
  private readonly chunkFailedAt = new Map<string, number>();
  private readonly objectImages: Phaser.GameObjects.Image[] = [];
  private readonly standOf = new Map<string, Point>();
  private created = false;
  /** 처음 시작할 때 보일 바닥 조각을 고르는 데만 쓴다. 그 뒤의 카메라는 rig가 쥔다 */
  private center: Point;
  private rig: CameraRig | null = null;
  private readonly instById = new Map<string, InstallationDef>();
  private layer: InstallationLayer | null = null;
  private lanternLayer: LanternLayer | null = null;
  private spotLayer: SpotLayer | null = null;
  private lampLayer: LanternLayer | null = null;
  private festivalLayer: FestivalLayer | null = null;
  private playLayer: PlayLayer | null = null;
  private residentLayer: ResidentLayer | null = null;
  private offLamps: (() => void) | null = null;
  /** 화면 밖 그림 건너뛰기(8-4). 장면이 만들어질 때 카메라를 받아 세운다. 점검용으로 enabled를 꺼서 걸러 내지 않은 화면과 견줄 수 있다 */
  cull!: ViewCull;
  private clock = 0;
  private player!: Phaser.GameObjects.Container;
  /** 캐릭터 그림(아틀라스의 chr-player-… 틀)과 지금 그린 틀 이름, 걷기 한 바퀴의 진행(0–1) */
  private playerSprite!: Phaser.GameObjects.Image;
  private playerFrame = '';
  private walkPhase = 0;
  private marks!: Phaser.GameObjects.Graphics;
  private ripple: { x: number; y: number; t0: number } | null = null;
  private lastView: ViewReport | null = null;
  private sinceViewPublish = 0;
  private fades = 0;

  constructor(options: WorldSceneOptions) {
    super({ key: 'world' });
    this.o = options;
    const p = options.runtime.player;
    this.center = { x: p.x, y: p.y };
    for (const it of options.runtime.interactables) this.standOf.set(it.id, { x: it.x, y: it.y });
    for (const inst of options.installations ?? []) this.instById.set(inst.installationId, inst);
  }

  // ───── 시작 ─────

  preload(): void {
    // 사물 그림은 2배로 구운 한 장이다. 틀을 화면 크기(w, h)로 줄여 그린다(9.3)
    this.load.atlas(OBJECT_ATLAS_KEY, `world/${this.o.atlas.image}`, `world/${this.o.atlas.data}`);
    // 시작할 때 화면에 보이는 바닥 조각만 먼저 올린다. 나머지는 걸으면서 이어서 불러온다
    const size = this.viewSize();
    const p = this.o.runtime.player;
    this.center = snapCenter(p, size);
    for (const id of planChunks(this.viewRect(this.center, size), [], { margin: 0 }).wanted) {
      const name = chunkName(id.c, id.r);
      this.chunkPending.add(name);
      this.load.image(name, chunkUrl(id.c, id.r));
    }
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, this.onFileComplete, this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onFileError, this);
  }

  create(): void {
    this.created = true;
    const cam = this.cameras.main;
    cam.setBackgroundColor(BACKGROUND);
    cam.setRoundPixels(true);
    this.input.mouse?.disableContextMenu();

    // 처음에 올라온 바닥 조각
    for (const name of [...this.chunkPending]) if (this.textures.exists(name)) this.placeChunk(name);
    for (const ob of this.o.objects) {
      const img = this.add.image(ob.x, ob.y, OBJECT_ATLAS_KEY, spriteKey(ob.file)).setOrigin(ob.ax, ob.ay).setDisplaySize(ob.w, ob.h).setDepth(ob.sortY);
      this.objectImages.push(img);
    }
    this.buildPlayer();
    this.marks = this.add.graphics().setDepth(MARK_DEPTH);
    this.cull = new ViewCull(cam);
    this.layer = new InstallationLayer(this, this.o.installations ?? [], this.o.bridge, this.cull);
    this.lanternLayer = new LanternLayer(this, this.o.stations ?? [], this.o.bridge, this.cull);
    this.buildSpots();
    this.festivalLayer = new FestivalLayer(this, stageFloorOf(this.o.installations ?? []), this.o.bridge);
    if ((this.o.play ?? []).length > 0) this.playLayer = new PlayLayer(this, this.o.play ?? [], this.cull);
    if ((this.o.residents ?? []).length > 0) this.residentLayer = new ResidentLayer(this, this.o.residents ?? [], this.o.bridge, this.cull);
    const offStep = this.o.bridge.events.subscribe((ev) => {
      if (ev.type === 'stepped') this.layer?.flash(ev.installationId, ev.slot, this.clock);
      else if (ev.type === 'pad-struck') this.playLayer?.strike(ev.playId, ev.pad, this.clock);
    });
    this.rig = new CameraRig({ center: this.center, zoom: cameraZoom(this.viewSize()) });

    this.input.on('pointerdown', this.onPointer, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offStep();
      this.layer?.destroy();
      this.layer = null;
      this.lanternLayer?.destroy();
      this.lanternLayer = null;
      this.spotLayer?.destroy();
      this.spotLayer = null;
      this.lampLayer?.destroy();
      this.lampLayer = null;
      this.festivalLayer?.destroy();
      this.festivalLayer = null;
      this.playLayer?.destroy();
      this.playLayer = null;
      this.residentLayer?.destroy();
      this.residentLayer = null;
      this.offLamps?.();
      this.offLamps = null;
      this.input.off('pointerdown', this.onPointer, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.load.off(Phaser.Loader.Events.FILE_COMPLETE, this.onFileComplete, this);
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onFileError, this);
    });

    this.applyPose(this.rig.pose);
    this.o.bridge.patchStatus({ ready: true });
  }

  // ───── 매 프레임 ─────

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(Math.max(deltaMs / 1000, 0), 0.1);
    this.clock += dt;
    const rt = this.o.runtime;
    rt.update(dt, this.o.keyboard());
    const p = rt.player;
    const reduce = this.o.reduceMotion();

    // 카메라: 지나가기에서는 캐릭터를 따라가고, 설치물 모드에서는 설치물 전체를 담는다(0.3초, 움직임 줄이기에서는 바로)
    const size = this.viewSize();
    const mode = this.o.bridge.installationMode.get();
    const inst = mode ? this.instById.get(mode.installationId) : undefined;
    // 긴 줄(확대형 징검다리)은 줄 전체가 아니라 편집 중인 박 하나를 따라간다(4.4). 모습이 아직 올라오지 않은 첫 프레임에는 첫 박이다
    const lane = inst && followsBeat(inst) ? laneOf(inst) : null;
    const shown = inst ? this.o.bridge.installationViews.get().find((v) => v.installationId === inst.installationId) : undefined;
    const timeline = shown?.timeline;
    // 물레방아(바퀴와 띠)도 같은 방식이다: 전체가 메뉴 띠와 조작 막대 사이에 들어오면 전체를, 칸이 48 px 아래로 줄 만큼 좁으면 고른 칸을 비춘다(7.3).
    // 종나무(나무 하나, 종탑, 빈터)도 그렇다(6-7c): 위쪽 이름표 띠(열 번호)가 오른쪽 위 메뉴 단추 뒤로 가려지지 않게 메뉴 띠 아래에 담는다.
    // 계단밭(7-1d)도 그렇다: 이름표 띠까지 담고, 온음계 한 칸이 48 px 아래로 줄 만큼 좁으면 고른 열의 고른 높이를 비춘다.
    // 건반 다리(7-3)도 그렇다: 흰 널 한 장이 48 px 아래로 줄 만큼 좁은 화면(휴대폰)에서는 널 위 커서가 선 널을 비춘다. 다리가 너비에 다 들어오는 화면에서는 메뉴 띠를 비우지 않고 전체를 담는다
    const follow: { rect: WorldRect; focus: { x: number; y: number }; alsoShow?: { x: number; y: number }; reserveMenu?: boolean } | null =
      lane && inst
        ? beatFollowOf(lane, timeline)
        : inst
          ? (bellFollowOf(inst, shown?.bells) ?? wheelFollowOf(inst, timeline) ?? terraceFollowOf(inst, shown?.terrace) ?? bridgeFollowOf(inst, shown?.bridge, { width: size.width, height: size.height, bottomInset: this.o.bridge.bottomInset.get() }))
          : null;
    const pose = this.rig!.step({
      dt,
      view: size,
      target: p,
      frame: follow ? follow.rect : inst ? slotBounds(inst) : null,
      ...(follow ? { focus: follow.focus, topInset: follow.reserveMenu === false ? 0 : MENU_BAND, ...(follow.alsoShow ? { alsoShow: follow.alsoShow } : {}) } : {}),
      ...(inst ? frameTuningOf(inst) : {}),
      bottomInset: this.o.bridge.bottomInset.get(),
      snap: rt.consumeSnap(),
      reduce,
    });
    this.applyPose(pose);
    const seen = this.viewRect(pose.center, size, pose.zoom);
    // 화면 밖 그래픽을 거른다(8-4). 이 프레임의 자세로 정하므로 바로 이동한 첫 프레임에도 새 자리가 그려진다
    this.cull.update(seen);
    this.streamChunks(seen);
    this.publishView(seen, size, dt);

    // 캐릭터: 발 위치의 y가 겹침 순서다. 걸을 때는 걷기 장을 넘기고 위아래로 살짝 흔들린다(움직임 줄이기에서는 장도 흔들림도 없다)
    this.walkPhase = advanceWalk(this.walkPhase, p.moving, dt);
    this.showPlayer(p.facing, p.moving, reduce);
    this.player.setDepth(depthOfFoot(p.y));

    if (rt.consumeFade() && !reduce) {
      this.fades += 1;
      this.cameras.main.fadeIn(TELEPORT_FADE_MS, (BACKGROUND >> 16) & 255, (BACKGROUND >> 8) & 255, BACKGROUND & 255);
    }

    const arrived = rt.consumeArrival();
    if (arrived && !reduce) this.ripple = { x: arrived.x, y: arrived.y, t0: this.clock };
    this.drawMarks();
    this.layer?.update(this.clock, reduce);
    this.festivalLayer?.update(this.clock, reduce);
    this.playLayer?.update(this.clock, reduce);
    this.residentLayer?.update(this.clock, reduce);
  }

  // ───── 카메라 ─────

  private viewSize(): ViewSize {
    return { width: this.scale.width, height: this.scale.height };
  }

  private viewRect(center: Point, size: ViewSize, zoom: number = cameraZoom(size)): ViewRect {
    const vis = visibleWorld(size, zoom);
    return { x: center.x - vis.width / 2, y: center.y - vis.height / 2, w: vis.width, h: vis.height };
  }

  private applyPose(pose: CameraPose): void {
    const cam = this.cameras.main;
    if (cam.zoom !== pose.zoom) cam.setZoom(pose.zoom);
    cam.centerOn(pose.center.x, pose.center.y);
  }

  /** 카메라가 보는 범위를 화면에 알린다(소리 물결). 0.1초마다, 눈에 띄게 바뀐 때만 */
  private publishView(rect: ViewRect, size: ViewSize, dt: number): void {
    this.sinceViewPublish += dt;
    const last = this.lastView;
    const changed =
      !last ||
      Math.abs(last.view.x - rect.x) > 2 ||
      Math.abs(last.view.y - rect.y) > 2 ||
      Math.abs(last.view.width - rect.w) > 1 ||
      Math.abs(last.view.height - rect.h) > 1 ||
      last.screen.width !== size.width ||
      last.screen.height !== size.height;
    if (!changed || (last && this.sinceViewPublish < VIEW_PUBLISH_INTERVAL)) return;
    this.sinceViewPublish = 0;
    this.lastView = { view: { x: rect.x, y: rect.y, width: rect.w, height: rect.h }, screen: { width: size.width, height: size.height } };
    this.o.bridge.view.set(this.lastView);
  }

  private onResize(): void {
    const size = this.viewSize();
    this.cameras.resize(size.width, size.height);
    const pose = this.rig?.pose;
    if (pose) this.applyPose({ center: clampCenter(pose.center, size, undefined, pose.zoom), zoom: pose.zoom });
  }

  // ───── 바닥 조각 스트리밍(10.5) ─────

  private streamChunks(view: ViewRect): void {
    const plan = planChunks(view, [...this.chunkImages.keys(), ...this.chunkPending]);
    for (const id of plan.unload) {
      const name = chunkName(id.c, id.r);
      if (this.chunkPending.has(name)) this.chunkDrop.add(name);
      else this.dropChunk(name);
    }
    for (const id of plan.wanted) this.chunkDrop.delete(chunkName(id.c, id.r));
    const now = this.time.now;
    let requested = false;
    for (const id of plan.load) {
      const name = chunkName(id.c, id.r);
      const failed = this.chunkFailedAt.get(name);
      if (failed !== undefined && now - failed < RETRY_AFTER_MS) continue;
      this.chunkFailedAt.delete(name);
      this.chunkPending.add(name);
      this.load.image(name, chunkUrl(id.c, id.r));
      requested = true;
    }
    if (requested && !this.load.isLoading()) this.load.start();
  }

  private onFileComplete(key: string, type: string): void {
    if (type !== 'image' || !this.created || !this.chunkPending.has(key)) return;
    this.chunkPending.delete(key);
    if (this.chunkDrop.delete(key)) {
      this.textures.remove(key);
      return;
    }
    this.placeChunk(key);
  }

  private onFileError(file: { key: string }): void {
    if (!this.chunkPending.delete(file.key)) return;
    this.chunkDrop.delete(file.key);
    this.chunkFailedAt.set(file.key, this.time.now);
  }

  private placeChunk(name: string): void {
    this.chunkPending.delete(name);
    const m = /^ground-(\d+)-(\d+)$/.exec(name);
    if (!m || this.chunkImages.has(name)) return;
    const o = chunkOrigin(Number(m[1]), Number(m[2]));
    // 파일에는 둘레 CHUNK_PAD px의 이웃 그림이 겹쳐 구워져 있다. 1:1로 그리면 경계의 이음선이 생기지 않는다
    this.chunkImages.set(name, this.add.image(o.x - CHUNK_PAD, o.y - CHUNK_PAD, name).setOrigin(0, 0).setDepth(GROUND_DEPTH));
  }

  private dropChunk(name: string): void {
    const img = this.chunkImages.get(name);
    if (!img) return;
    img.destroy();
    this.chunkImages.delete(name);
    this.textures.remove(name);
  }

  // ───── 발견 표식, 게시판, 광장 둘레의 등 ─────

  /**
   * 정거장이 아닌 자리의 표식과 광장 둘레의 등을 세운다. 광장 둘레의 등은 소리 조각마다 하나이고(3.6 '광장 둘레의 등 하나가 켜짐'),
   * 켜졌는지는 찾은 것(bridge.found)에서 계산해 등불 층에 넘긴다: 등을 그리는 일은 정거장 곁의 등불과 같은 층이 한다.
   */
  private buildSpots(): void {
    const spots = this.o.spots ?? [];
    if (spots.length === 0) return;
    this.spotLayer = new SpotLayer(this, spots, this.o.bridge, this.cull);
    const pieces = spots.filter((s) => s.kind === 'discovery' && s.discovery === 'soundPiece').map((s) => ({ discoveryId: s.id }));
    if (pieces.length === 0) return;
    const sites: LanternSite[] = pieces.map((_, i) => ({ stationId: plazaLampId(i), ...plazaLampSite(i, pieces.length) }));
    const states = new Store<Readonly<Record<string, LanternState>>>(plazaLampStates(pieces, this.o.bridge.found.get()));
    this.offLamps = this.o.bridge.found.subscribe((f) => states.set(plazaLampStates(pieces, f)));
    this.lampLayer = new LanternLayer(this, sites, { lanterns: states }, this.cull, { x: 0, y: 0 });
  }

  // ───── 캐릭터와 바닥 표시 ─────

  /** 캐릭터(9.3): 아틀라스의 캐릭터 그림 한 장. 발이 캐릭터의 월드 좌표에 오도록 기준점을 발에 둔다(D-308) */
  private buildPlayer(): void {
    const p = this.o.runtime.player;
    this.playerSprite = this.add.image(0, 0, OBJECT_ATLAS_KEY, playerLook(p.facing, false, 0, 0, true).frame);
    this.playerSprite.setOrigin(0.5, PLAYER_FOOT_Y / PLAYER_FRAME_H).setDisplaySize(PLAYER_FRAME_W, PLAYER_FRAME_H);
    this.player = this.add.container(p.x, p.y, [this.playerSprite]).setDepth(depthOfFoot(p.y));
    this.showPlayer(p.facing, false, this.o.reduceMotion());
  }

  /** 바라보는 쪽과 걷기에 맞는 장을 고르고 위아래 흔들림을 준다 */
  private showPlayer(facing: Facing, moving: boolean, reduce: boolean): void {
    const p = this.o.runtime.player;
    const look = playerLook(facing, moving, this.walkPhase, this.clock, reduce);
    if (look.frame !== this.playerFrame) {
      this.playerSprite.setFrame(look.frame);
      this.playerSprite.setDisplaySize(PLAYER_FRAME_W, PLAYER_FRAME_H);
      this.playerFrame = look.frame;
    }
    this.player.setPosition(p.x, p.y + look.bob);
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) return;
    const w = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // 설치물 모드에서는 걷지 않는다. 돌을 누르면 '이 자리를 눌렀다'고 알리고, 돌 밖은 아무 일도 없다(4.2, W-4)
    const mode = this.o.bridge.installationMode.get();
    if (mode) {
      const inst = this.instById.get(mode.installationId);
      const lane = inst ? laneOf(inst) : null;
      // 물레방아의 바퀴는 칸이 사각형이 아니라 부채꼴이다: 눌린 점을 바퀴의 칸으로 바꾼다. 듣는 중에는 바퀴가 돈 만큼 되돌려서 찾는다(W-3: 시간이 아니라 그려진 모습이 기준이다)
      const wheel = inst ? wheelOf(inst) : null;
      if (inst && wheel && lane) {
        const playTick = this.o.bridge.installationViews.get().find((v) => v.installationId === inst.installationId)?.timeline?.playTick ?? null;
        const turn = this.o.reduceMotion() ? 0 : wheelTurnDeg(wheel, playTick);
        const wheelSlot = wheelSlotAt(wheel, w.x, w.y, turn);
        if (wheelSlot !== null) {
          this.o.bridge.events.send({ type: 'slot-pressed', installationId: mode.installationId, slot: wheelSlot, tick: slotStartTick(lane, wheelSlot) });
          return;
        }
      }
      // 띠(사각형 칸)도 같은 칸을 가리킨다: 바퀴 밖에서는 띠를 눌러 볼 수 있다
      const slot = inst ? slotAtPoint(inst, w.x, w.y, SLOT_TAP_SLOP) : null;
      if (slot !== null) {
        // 계단밭의 열은 높이가 중요하다: 눌린 세로 좌표를 온음계 칸 수로 바꿔 보낸다(W-3: 시간이 아니라 높이만 넘어간다). 열 끝의 반 칸 경계는 범위 안으로 맞춘다
        const field = inst ? terraceMapOf(inst) : null;
        const step = field ? terraceStepAtPress(field, w.y) : null;
        this.o.bridge.events.send({ type: 'slot-pressed', installationId: mode.installationId, slot, ...(lane ? { tick: tickAtSlotPoint(lane, slot, w.x, w.y) } : {}), ...(step !== null ? { step } : {}) });
      }
      return;
    }
    this.o.runtime.tap({ x: w.x, y: w.y });
  }

  /** 걷는 길의 도착점, 가까운 정거장의 서는 자리, 도착 물결을 바닥 위에 그린다 */
  private drawMarks(): void {
    const g = this.marks;
    g.clear();
    const near = this.o.bridge.status.get().near;
    const stand = near ? this.standOf.get(near.stationId) : undefined;
    if (stand) {
      g.fillStyle(TEAL, 0.12).fillCircle(stand.x, stand.y, 34);
      g.lineStyle(3, TEAL, 0.55).strokeCircle(stand.x, stand.y, 34);
    }
    const goal = this.o.runtime.walkGoal;
    if (goal) {
      g.fillStyle(TEAL, 0.8).fillCircle(goal.x, goal.y, 5);
      g.lineStyle(2, TEAL, 0.5).strokeCircle(goal.x, goal.y, 11);
    }
    const r = this.ripple;
    if (r) {
      const t = (this.clock - r.t0) / RIPPLE_SECONDS;
      if (t >= 1) this.ripple = null;
      else {
        g.lineStyle(4, TEAL, 0.8 * (1 - t)).strokeCircle(r.x, r.y, 10 + 40 * t);
        g.lineStyle(2, TEAL, 0.5 * (1 - t)).strokeCircle(r.x, r.y, 4 + 22 * t);
      }
    }
  }

  // ───── 시험과 점검 ─────

  /** 장면이 아직 만들어지기 전이면 null */
  debugState(): SceneDebugState | null {
    if (!this.created || !this.rig) return null;
    const size = this.viewSize();
    const pose = this.rig.pose;
    return {
      center: { ...pose.center },
      zoom: this.cameras.main.zoom,
      view: this.viewRect(pose.center, size, pose.zoom),
      size,
      chunks: [...this.chunkImages.keys()].sort(),
      pending: [...this.chunkPending].sort(),
      objects: this.objectImages.length,
      playerDepth: this.player.depth,
      playerY: this.player.y,
      fps: this.game.loop.actualFps,
      clock: this.clock,
      fades: this.fades,
      framing: this.rig.framing,
      transitioning: this.rig.transitioning,
      installations: this.layer?.debug() ?? [],
      lanterns: this.lanternLayer?.debug() ?? [],
      spots: this.spotLayer?.debug() ?? [],
      plazaLamps: this.lampLayer?.debug() ?? [],
      musicians: this.festivalLayer?.debug() ?? [],
      play: this.playLayer?.debug() ?? [],
      residents: this.residentLayer?.debug() ?? [],
      cull: { ...this.cull.stats(), installationsSkipped: this.layer?.skippedCount() ?? 0 },
    };
  }
}
