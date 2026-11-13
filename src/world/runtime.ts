// 월드 실행 로직(설계서 7.2, 7.4, 7.7). Phaser 없이 돌아가는 부분이다: 캐릭터 상태, 길 걷기, 가까운 정거장, 지역 이름, '열기' 사건.
// 장면(WorldScene)은 매 프레임 update(dt, 키 입력)를 부르고, 그림과 카메라만 맡는다. 화면(UI)과는 WorldBridge로만 만난다.
import type { WorldSpot } from '../domain/discovery';
import { slotAtPoint } from '../domain/installation';
import type { InstallationDef } from '../domain/installation';
import { padAtPoint } from '../domain/play';
import type { PlaySource } from '../domain/play';
import { INTERACT_RANGE, standOf } from '../domain/world';
import type { Facing, SpotKind, WorldMap } from '../domain/world';
import type { WorldBridge, WorldCommand, WorldEvent } from '../platform/bridge';
import { nearestInteractable, pickInteractableAt, squareAround } from './interact';
import type { Interactable, Rect } from './interact';
import { findPath, nearestFreeCell } from './nav';
import type { NavGrid, Point } from './nav';
import { cancelPath, createPlayer, startPath, stepPlayer } from './player';
import type { MoveInput, PlayerState } from './player';

/** 위치를 화면에 알리는 가장 짧은 간격(초). 멈추는 순간에는 바로 알린다 */
export const POSITION_PUBLISH_INTERVAL = 0.1;
/** 걷다가 막혔을 때 길을 다시 찾는 최대 횟수 */
export const MAX_REPLANS = 2;
/** 정거장을 누를 때 영역을 이만큼 넓혀서 본다(월드 px) */
export const TAP_SLOP = 24;

/** 걸어서 밟을 수 있는 설치물: 돌의 자리와, 같은 땅을 나눠 쓰는 설치물끼리 겨룰 때 쓰는 서는 자리 */
export type Stone = Pick<InstallationDef, 'installationId' | 'slots'> & Partial<Pick<InstallationDef, 'interactPoint'>>;

export interface WorldRuntimeInit {
  map: WorldMap;
  grid: NavGrid;
  bridge: WorldBridge;
  /** 정거장 id별 누르기 영역(월드 px). 없는 정거장은 정거장 점 둘레의 96 px 네모를 쓴다 */
  hits: Readonly<Record<string, Rect>>;
  /** 시작 자리. 없으면 호출하는 쪽이 정한 기본 자리를 쓴다 */
  start: { x: number; y: number; facing?: Facing };
  /**
   * 설치물(돌의 자리). 지나가는 중에 돌을 밟으면 'stepped' 사건을 보낸다(4.3).
   * 같은 땅을 나눠 쓰는 설치물(계단밭 N1·N2·N3)은 서는 자리(interactPoint)를 함께 받는다: 발이 여럿에 걸치면 서는 자리가 가장 가까운 설치물만 알린다.
   */
  installations?: readonly Stone[];
  /** 정거장이 아닌, 다가가서 열 수 있는 자리(발견 요소, 광장 게시판, 주민). 정거장과 같은 96 px 안내 칩과 누르기를 쓴다(7.4) */
  spots?: readonly Pick<WorldSpot, 'id' | 'name' | 'x' | 'y' | 'kind'>[];
  /** 놀이 악기(3.5, 6-9c). 걸어서 돌에 올라서면 'pad-struck' 사건을 보낸다. 열지 않는 자리라서 안내 칩과 누르기는 없다 */
  play?: readonly PlaySource[];
}

export type TapResult =
  /** 누른 곳이 없다(멈춘 상태) */
  | { kind: 'none' }
  /** 누른 곳으로 걷는다. goal은 실제로 도착할 점이다 */
  | { kind: 'walk'; goal: Point; adjusted: boolean }
  /** 정거장을 눌렀다. 그 앞까지 걸어가 연다(이미 앞이면 바로 연다) */
  | { kind: 'station'; stationId: string; goal: Point; immediate: boolean }
  /** 정거장이 아닌 자리(발견 요소, 광장 게시판, 주민)를 눌렀다. 같은 방식으로 그 앞까지 걸어가 연다 */
  | { kind: 'spot'; spotId: string; goal: Point; immediate: boolean };

interface WalkTarget {
  /** 누른 곳(정거장이면 서는 자리) */
  to: Point;
  /** 길이 실제로 끝나는 점 */
  goal: Point;
  /** 정거장 앞으로 가는 길이면 그 id(도착 사건에 적는다). 정거장이 아니면 null */
  stationId: string | null;
  /** 도착하면 열 사물. 열지 않는 길이면 null */
  opens: Interactable | null;
  retries: number;
}

const isSpot = (it: Interactable): it is Interactable & { kind: SpotKind } => it.kind === 'discovery' || it.kind === 'board' || it.kind === 'resident';

/** 사물을 열 때 보내는 사건: 정거장은 open-station, 발견 요소는 open-discovery, 광장 게시판은 open-board, 주민은 open-resident */
function openEventOf(it: Interactable): WorldEvent {
  if (it.kind === 'discovery') return { type: 'open-discovery', discoveryId: it.id };
  if (it.kind === 'board') return { type: 'open-board' };
  if (it.kind === 'resident') return { type: 'open-resident', residentId: it.id };
  return { type: 'open-station', stationId: it.id };
}

export class WorldRuntime {
  private readonly map: WorldMap;
  private readonly grid: NavGrid;
  private readonly bridge: WorldBridge;
  private readonly items: readonly Interactable[];
  private readonly byId = new Map<string, Interactable>();
  private p: PlayerState;
  private target: WalkTarget | null = null;
  private isPaused = false;
  private snap = true;
  private fade = false;
  private arrival: Point | null = null;
  private sincePublish = 0;
  private published: { x: number; y: number; facing: Facing } | null = null;
  private wasMoving = false;
  private readonly stones: readonly Stone[];
  /** 설치물마다 캐릭터가 지금 서 있는 돌(1부터). 서 있지 않으면 null */
  private readonly onStone = new Map<string, number | null>();
  private readonly plays: readonly PlaySource[];
  /** 놀이 악기마다 캐릭터가 지금 서 있는 돌(1부터). 서 있지 않으면 null */
  private readonly onPad = new Map<string, number | null>();
  private readonly offs: Array<() => void> = [];

  constructor(init: WorldRuntimeInit) {
    this.map = init.map;
    this.grid = init.grid;
    this.bridge = init.bridge;
    this.items = [
      ...init.map.stations.map((s): Interactable => {
        const stand = standOf(s);
        return { id: s.stationId, name: s.name, x: stand.x, y: stand.y, hit: init.hits[s.stationId] ?? squareAround(s.x, s.y, 96), kind: s.kind };
      }),
      ...(init.spots ?? []).map((s): Interactable => ({ id: s.id, name: s.name, x: s.x, y: s.y, hit: squareAround(s.x, s.y, 96), kind: s.kind })),
    ];
    for (const it of this.items) this.byId.set(it.id, it);
    const at = this.freePoint({ x: init.start.x, y: init.start.y });
    this.p = createPlayer(at.x, at.y, init.start.facing ?? 'down');
    this.stones = init.installations ?? [];
    this.plays = init.play ?? [];
    this.detectSteps(false);
    this.detectPads(false);
    this.isPaused = this.bridge.pause.get();
    this.offs.push(this.bridge.commands.subscribe((c) => this.handle(c)));
    this.offs.push(this.bridge.pause.subscribe((p) => this.setPaused(p)));
    this.refresh(0, true);
  }

  // ───── 읽기 ─────

  get player(): Readonly<PlayerState> {
    return this.p;
  }
  get interactables(): readonly Interactable[] {
    return this.items;
  }
  get paused(): boolean {
    return this.isPaused;
  }
  /** 걷는 중인 길의 도착점. 걷지 않으면 null */
  get walkGoal(): Point | null {
    return this.target && this.p.path ? this.target.goal : null;
  }
  /** 바로 이동·처음 시작·저장 복원 뒤 카메라를 보간 없이 옮겨야 하면 true를 한 번 돌려준다 */
  consumeSnap(): boolean {
    const v = this.snap;
    this.snap = false;
    return v;
  }
  /** 바로 이동으로 자리가 바뀐 뒤 0.3초 화면 전환(3.7)을 보여야 하면 true를 한 번 돌려준다. 움직임 줄이기에서는 장면이 무시한다 */
  consumeFade(): boolean {
    const v = this.fade;
    this.fade = false;
    return v;
  }
  /** 길 걷기가 끝난 자리(도착 물결을 그릴 곳). 한 번 돌려주고 비운다 */
  consumeArrival(): Point | null {
    const v = this.arrival;
    this.arrival = null;
    return v;
  }

  // ───── 매 프레임 ─────

  update(dtSec: number, input: MoveInput): void {
    if (this.isPaused) {
      if (this.p.moving) this.p = { ...this.p, moving: false };
      this.refresh(dtSec, false);
      return;
    }
    // 설치물 모드에서는 이동 키가 캐릭터 대신 자리를 옮긴다(4.2). 캐릭터는 서 있다: 걷던 길이 남아 있어도 접는다
    const inMode = this.bridge.installationMode.get() !== null;
    if (inMode && (this.target !== null || this.p.path !== null)) this.stopWalk();
    const move = inMode ? { dx: 0, dy: 0 } : input;
    if ((move.dx !== 0 || move.dy !== 0) && this.target) this.target = null; // 키를 누르면 길 걷기는 멈춘다(7.2)
    const res = stepPlayer(this.p, move, dtSec, this.grid);
    this.p = res.state;
    if (res.arrived) this.finishWalk();
    else if (res.stuck) this.replan();
    this.detectSteps(!inMode);
    this.detectPads(!inMode);
    this.refresh(dtSec, false);
  }

  // ───── 입력 ─────

  /** 누르기(월드 좌표). 정거장이면 그 앞까지 걸어가 열고, 아니면 그 자리로 걷는다 */
  tap(world: Point): TapResult {
    if (this.isPaused || this.bridge.installationMode.get()) return { kind: 'none' };
    const hit = pickInteractableAt(world, this.items, TAP_SLOP);
    if (hit) {
      const stand = { x: hit.x, y: hit.y };
      const result = (goal: Point, immediate: boolean): TapResult => (isSpot(hit) ? { kind: 'spot', spotId: hit.id, goal, immediate } : { kind: 'station', stationId: hit.id, goal, immediate });
      if (Math.hypot(stand.x - this.p.x, stand.y - this.p.y) <= INTERACT_RANGE) {
        this.stopWalk();
        this.bridge.events.send(openEventOf(hit));
        return result({ x: this.p.x, y: this.p.y }, true);
      }
      const r = this.beginWalk(stand, isSpot(hit) ? null : hit.id, hit);
      if (r) return result(r.goal, false);
      return { kind: 'none' };
    }
    const r = this.beginWalk(world, null, null);
    return r ? { kind: 'walk', goal: r.goal, adjusted: r.adjusted } : { kind: 'none' };
  }

  /** E, Enter, 상호작용 버튼: 96 px 안에서 가장 가까운 정거장을 연다 */
  interact(): boolean {
    // 설치물 모드의 Enter는 '놓기'다. 정거장을 다시 열지 않는다
    if (this.isPaused || this.bridge.installationMode.get()) return false;
    const near = nearestInteractable(this.p, this.items, INTERACT_RANGE);
    if (!near) return false;
    this.stopWalk();
    this.bridge.events.send(openEventOf(near.item));
    return true;
  }

  /** 지도의 '걸어가기': 정거장 앞까지 길을 찾아 걷는다. 도착해도 저절로 열지는 않는다(안내 칩이 뜬다) */
  walkToStation(stationId: string): boolean {
    const it = this.byId.get(stationId);
    if (!it || this.isPaused) return false;
    if (Math.hypot(it.x - this.p.x, it.y - this.p.y) <= INTERACT_RANGE * 0.25) {
      this.stopWalk();
      this.arrival = { x: this.p.x, y: this.p.y };
      this.bridge.events.send({ type: 'arrived', stationId });
      return true;
    }
    return this.beginWalk({ x: it.x, y: it.y }, stationId, null) !== null;
  }

  /** 지도의 '바로 이동': 정거장 앞에 선다. 카메라는 보간 없이 따라온다 */
  teleportToStation(stationId: string): boolean {
    const it = this.byId.get(stationId);
    if (!it) return false;
    this.placeAt({ x: it.x, y: it.y }, 'down');
    return true;
  }

  /** 저장한 자리로 서기. 막힌 곳이면 가장 가까운 걸을 수 있는 곳으로 */
  teleportTo(x: number, y: number, facing: Facing = 'down'): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    this.placeAt({ x, y }, facing);
    return true;
  }

  cancelWalk(): void {
    this.stopWalk();
    this.refresh(0, false);
  }

  /** 패널이나 겹침 화면이 열리면 멈추고, 닫히면 다시 움직인다. 멈추면 걷던 길도 접는다 */
  setPaused(paused: boolean): void {
    if (paused === this.isPaused) return;
    this.isPaused = paused;
    if (paused) this.stopWalk();
    this.refresh(0, false);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  // ───── 안쪽 ─────

  private handle(c: WorldCommand): void {
    switch (c.type) {
      case 'interact':
        this.interact();
        return;
      case 'walk-to-station':
        this.walkToStation(c.stationId);
        return;
      case 'teleport-to-station':
        this.teleportToStation(c.stationId);
        return;
      case 'teleport':
        this.teleportTo(c.x, c.y);
        return;
      case 'cancel-walk':
        this.cancelWalk();
        return;
    }
  }

  /** 걸을 수 있는 점. 막힌 곳이면 가장 가까운 걸을 수 있는 칸의 가운데 */
  private freePoint(pt: Point): Point {
    const x = Math.min(Math.max(pt.x, 0), this.grid.widthPx - 0.001);
    const y = Math.min(Math.max(pt.y, 0), this.grid.heightPx - 0.001);
    if (!this.grid.circleHitsBlocked(x, y)) return { x, y };
    const c = nearestFreeCell(this.grid, { x, y });
    return c ? this.grid.centerOf(c.cx, c.cy) : { x, y };
  }

  private placeAt(pt: Point, facing: Facing): void {
    const at = this.freePoint(pt);
    this.stopWalk();
    this.p = { ...this.p, x: at.x, y: at.y, facing, moving: false };
    this.detectSteps(false); // 바로 이동해 돌 위에 서도 소리는 나지 않는다. 걸어 들어갈 때만 울린다
    this.detectPads(false);
    this.snap = true;
    this.fade = true;
    this.refresh(0, true);
  }

  private beginWalk(to: Point, stationId: string | null, opens: Interactable | null): { goal: Point; adjusted: boolean } | null {
    const res = findPath(this.grid, { x: this.p.x, y: this.p.y }, to);
    if (!res) return null;
    this.p = startPath(this.p, res.waypoints);
    this.target = { to, goal: res.goal, stationId, opens, retries: 0 };
    this.refresh(0, false);
    return { goal: res.goal, adjusted: res.adjusted };
  }

  private stopWalk(): void {
    this.target = null;
    this.p = cancelPath(this.p);
  }

  private finishWalk(): void {
    const t = this.target;
    this.target = null;
    this.arrival = t ? t.goal : { x: this.p.x, y: this.p.y };
    this.bridge.events.send({ type: 'arrived', stationId: t?.stationId ?? null });
    if (t?.opens) this.bridge.events.send(openEventOf(t.opens));
  }

  /** 걷다가 막혔다(길이 닫혔다). 같은 곳으로 길을 다시 찾아 본다. 그래도 안 되면 멈춘다 */
  private replan(): void {
    const t = this.target;
    if (!t || t.retries >= MAX_REPLANS) {
      this.target = null;
      return;
    }
    const res = findPath(this.grid, { x: this.p.x, y: this.p.y }, t.to);
    if (!res) {
      this.target = null;
      return;
    }
    this.p = startPath(this.p, res.waypoints);
    this.target = { ...t, goal: res.goal, retries: t.retries + 1 };
  }

  /** 캐릭터가 서 있는 돌이 바뀌었는지 본다. 새 돌에 올라서면(announce) 밟았다는 사건을 한 번 보낸다. 돌에서 내려오면 조용히 기억만 바꾼다 */
  private detectSteps(announce: boolean): void {
    const here = this.stones.map((inst) => ({ inst, slot: slotAtPoint(inst, this.p.x, this.p.y) }));
    const owner = this.stepOwner(here);
    for (const { inst, slot } of here) {
      const before = this.onStone.get(inst.installationId) ?? null;
      if (slot === before) continue;
      this.onStone.set(inst.installationId, slot);
      // 겹친 설치물에서는 주인이 아닌 설치물이 칸을 옮겨도 조용하다(같은 밭을 세 번 울리지 않는다)
      if (owner !== null && inst.interactPoint && owner !== inst) continue;
      // 바깥에서 올라섰으면 entered를 붙인다(종나무는 올라선 나무의 화음을 한 번 울린다, 4.6)
      if (announce && slot !== null) this.bridge.events.send({ type: 'stepped', installationId: inst.installationId, slot, ...(before === null ? { entered: true as const } : {}) });
    }
  }

  /**
   * 발이 놓인 곳을 품은 설치물이 둘 이상이면(계단밭 N1·N2·N3는 한 밭을 나눠 쓴다) 서는 자리가 가장 가까운 하나가 주인이다(거리가 같으면 목록의 앞쪽).
   * 하나뿐이거나 서는 자리를 모르면 겨룰 일이 없어 null이다.
   */
  private stepOwner(here: ReadonlyArray<{ inst: Stone; slot: number | null }>): Stone | null {
    let owner: Stone | null = null;
    let best = Infinity;
    let rivals = 0;
    for (const { inst, slot } of here) {
      if (slot === null || !inst.interactPoint) continue;
      rivals += 1;
      const d = Math.hypot(inst.interactPoint.x - this.p.x, inst.interactPoint.y - this.p.y);
      if (d < best) {
        best = d;
        owner = inst;
      }
    }
    return rivals > 1 ? owner : null;
  }

  /**
   * 놀이 악기의 돌도 같다: 새 돌에 올라서면(announce) 올라섰다는 사건을 한 번 보내고, 돌에서 내려오면 조용히 기억만 바꾼다.
   * 같은 돌 위에 서 있는 동안에는 다시 울리지 않는다(내려갔다 다시 올라서면 다시 울린다).
   */
  private detectPads(announce: boolean): void {
    for (const inst of this.plays) {
      const pad = padAtPoint(inst, this.p.x, this.p.y);
      const before = this.onPad.get(inst.playId) ?? null;
      if (pad === before) continue;
      this.onPad.set(inst.playId, pad);
      if (announce && pad !== null) this.bridge.events.send({ type: 'pad-struck', playId: inst.playId, pad });
    }
  }

  /** 지역, 가까운 정거장, 걷는 중, 멈춤을 다리에 알리고 위치를 덜어서 알린다 */
  private refresh(dtSec: number, force: boolean): void {
    const region = this.map.regionAt(this.p.x, this.p.y).regionId;
    const near = nearestInteractable(this.p, this.items, INTERACT_RANGE);
    this.bridge.patchStatus({
      regionId: region,
      near: near ? { stationId: near.item.id, name: near.item.name, ...(isSpot(near.item) ? { spot: near.item.kind } : {}) } : null,
      walking: this.p.path !== null,
      paused: this.isPaused,
    });

    this.sincePublish += dtSec;
    const stopped = this.wasMoving && !this.p.moving;
    this.wasMoving = this.p.moving;
    const last = this.published;
    const changed = !last || last.x !== this.p.x || last.y !== this.p.y || last.facing !== this.p.facing;
    if (changed && (force || stopped || this.sincePublish >= POSITION_PUBLISH_INTERVAL)) {
      this.published = { x: this.p.x, y: this.p.y, facing: this.p.facing };
      this.sincePublish = 0;
      this.bridge.position.set({ x: this.p.x, y: this.p.y, facing: this.p.facing });
    }
  }
}
