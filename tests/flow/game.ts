// 흐름 시험 공용 도구: 미리보기 채널의 window.__game으로 월드 상태를 읽고, 느린 헤드리스 Chrome에서도 흔들리지 않게
// 시간이 아니라 상태(준비됨, 조각이 올라옴, 가까이 감, 멈춤, 움직인 거리)로 기다린다.
import type { Page } from 'playwright-core';

export interface Status {
  ready: boolean;
  regionId: string;
  /** 가까운 사물. 정거장이 아닌 자리(발견 표식, 광장 게시판, 주민)이면 spot에 그 종류가 적히고 stationId에는 그 자리의 id가 들어간다 */
  near: { stationId: string; name: string; spot?: 'discovery' | 'board' | 'resident' } | null;
  paused: boolean;
  walking: boolean;
  error: string | null;
}
export interface Pos {
  x: number;
  y: number;
  facing: string;
}
export interface Dbg {
  /** 장면 시계(초): 한 프레임에 0.1초까지만 더해서, 프레임이 느린 화면에서는 실제 시간보다 느리게 간다 */
  clock: number;
  fades: number;
  center: { x: number; y: number };
  zoom: number;
  view: { x: number; y: number; w: number; h: number };
  size: { width: number; height: number };
  chunks: string[];
  pending: string[];
  /** 캐릭터를 그리는 순서값(발 위치의 y). 사물의 정렬 y보다 작으면 사물이 위에 그려진다 */
  playerDepth: number;
  /** 캐릭터를 그린 y(위아래 흔들림이 있으면 월드 위치의 y와 다르다) */
  playerY: number;
  /** 설치물 모드의 카메라: 설치물을 담는 쪽인가, 0.3초 전환 중인가 */
  framing: boolean;
  transitioning: boolean;
  /** 설치물 층이 지금 돌 위에 그린 것 */
  installations: DrawnInstallation[];
  /** 정거장 곁에 그린 등불들 */
  lanterns: DrawnLantern[];
  /** 발견 표식과 광장 게시판 */
  spots: DrawnSpot[];
  /** 광장 둘레의 등들(소리 조각을 찾은 만큼 켜진다) */
  plazaLamps: DrawnLantern[];
  /** 잔치 동안 무대 위에 선 악사들. 잔치가 열려 있지 않으면 비어 있다 */
  musicians: DrawnMusician[];
  /** 놀이 악기(6-9c): 바닥의 돌과 돌 위의 음 이름, 밟은 돌의 모습(idle, struck, echo) */
  play: DrawnPlay[];
  /** 서 있는 주민(악사) 여섯(7-6): 연주 중인가와 지금 그린 장 */
  residents: DrawnResident[];
  /** 화면 밖 그림 건너뛰기(8-4): 켰는가, 맡은 그래픽 수, 지금 거른 그래픽 수, 그리는 호출을 건너뛴 설치물 수 */
  cull: { enabled: boolean; tracked: number; hidden: number; installationsSkipped: number };
}
export interface DrawnResident {
  residentId: string;
  name: string;
  /** 발치의 월드 좌표 */
  x: number;
  y: number;
  depth: number;
  /** 연주 중인가(그 지역의 층이 1 이상) */
  playing: boolean;
  pose: 'standing' | 'playing';
  /** 그 자세 안의 몇 번째 장(0부터) */
  frame: number;
  /** 악기가 놓인 자리에서 벗어난 만큼(월드 px) */
  toolOffset: { x: number; y: number };
  /** 음표 표지가 보이는가 */
  noteVisible: boolean;
}
export interface DrawnPad {
  pad: number;
  x: number;
  y: number;
  midi: number;
  label: string;
  state: 'idle' | 'struck' | 'echo';
}
export interface DrawnPlay {
  playId: string;
  name: string;
  x: number;
  y: number;
  pads: DrawnPad[];
  /** 돌 아래에 깐 바닥의 종류(7-4부터 비탈, 밧줄, 연못이 더해졌다) */
  ground: 'none' | 'pool' | 'slope' | 'rope' | 'lilies';
}
export interface DrawnSpot {
  id: string;
  kind: 'discovery' | 'board' | 'resident';
  discovery?: 'soundPiece' | 'conceptNote';
  found: boolean;
  /** 게시판에 걸려 보이는 쪽지 수. 게시판이 아니면 0 */
  tags: number;
  x: number;
  y: number;
  depth: number;
}
export interface DrawnMusician {
  part: 'pulse' | 'bed' | 'percussion' | 'bass' | 'melody' | 'runner' | 'ornament';
  name: string;
  x: number;
  y: number;
  depth: number;
  /** 지금 발이 땅에서 떠 있는 높이(월드 px). 움직임 줄이기에서는 늘 0 */
  lift: number;
}
export interface DrawnLantern {
  stationId: string;
  state: 'off' | 'on' | 'flower';
  /** 발치의 월드 좌표 */
  x: number;
  y: number;
  depth: number;
}
export interface DrawnSlot {
  slot: number;
  label: string | null;
  numbered: boolean;
  selected: boolean;
  flagged: boolean;
  playing: boolean;
  /** 무대 칸의 채운 정도(돌이면 없다) */
  fill?: 'unused' | 'empty' | 'partial' | 'full';
}
/** 징검다리(T2)에 그려진 돌 하나. x, y, w, h는 월드 좌표 */
export interface DrawnStone {
  startTick: number;
  endTick: number;
  kind: 'note' | 'rest';
  label: string;
  dotted: boolean;
  flagged: boolean;
  playing: boolean;
  raft: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DrawnWater {
  from: number;
  to: number;
  flagged: boolean;
  labelled: boolean;
  emphasised: boolean;
}
/** 징검다리 한 줄의 그려진 모습: 돌, 남은 물, 놓으려는 자리, 물결 선, 물가 바위, 박 번호 수, 뗏목 수 */
export interface DrawnTimeline {
  stones: DrawnStone[];
  water: DrawnWater[];
  waterEmphasis: boolean;
  cursor: { startTick: number; endTick: number; kind: 'note' | 'rest' | 'raft' | 'erase'; ok: boolean } | null;
  playTick: number | null;
  shoreRocks: { from: number; to: number } | null;
  beats: number;
  rafts: number;
}
/** 물레방아(T3)의 바퀴에 그려진 못 하나. startDeg, endDeg는 바퀴가 돌지 않았을 때의 자리(12시에서 시계 방향) */
export interface DrawnNail {
  startTick: number;
  endTick: number;
  kind: 'note' | 'rest';
  label: string;
  dotted: boolean;
  flagged: boolean;
  playing: boolean;
  startDeg: number;
  endDeg: number;
}
/** 물레방아의 바퀴: 못, 빈 구멍, 놓으려는 자리, 듣는 중 도는 각도. 띠(timeline)와 같은 초안을 읽는다 */
export interface DrawnWheel {
  cx: number;
  cy: number;
  r: number;
  cells: number;
  turnDeg: number;
  nails: DrawnNail[];
  holes: number[];
  flaggedHoles: number[];
  beats: Array<{ beat: number; fromTick: number; toTick: number; pattern: 'stripes' | 'dots' }>;
  cursor: { startTick: number; endTick: number; kind: 'note' | 'rest' | 'raft' | 'erase'; ok: boolean } | null;
  playTick: number | null;
  numbered: boolean;
  clapper: boolean;
}
/** 종나무(T4)에 그려진 종 하나. x, y, w, h는 종이 걸린 고리 칸(월드 좌표), slot은 고리 번호(1부터)다 */
export interface DrawnBellMark {
  slot: number;
  tree: number;
  column: number;
  octave: number;
  label: string;
  muted: boolean;
  lowest: boolean;
  flagged: boolean;
  playing: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 종나무의 그려진 모습: 걸린 종, 쓰지 않는 가지(빗금), 단 이름표 수, 고른 자리. 이름표와 빗금과 고른 자리는 설치물 모드에서만 있다 */
export interface DrawnBells {
  form: 'tree' | 'tower' | 'glade';
  trees: number;
  bells: DrawnBellMark[];
  hatched: number[];
  labels: { octaves: number; columns: number; trees: number };
  cursor: { slot: number | null; tree: number; column: number; octave: number | null } | null;
}
/** 계단밭(T5)에 그려진 등 하나. x, y는 등의 가운데(월드 좌표), step은 가온 도(C4)에서 온음계로 몇 칸 위인가(아래는 음수)다 */
export interface DrawnLampMark {
  column: number;
  draft: number;
  step: number;
  x: number;
  y: number;
  /** 등 안에 쓴 이름. 문제를 푸는 중에는 null이다 */
  label: string | null;
  accidental: 'sharp' | 'flat' | null;
  flagged: boolean;
  playing: boolean;
  selected: boolean;
}
/** 계단밭의 그려진 모습: 돌담(세 설치물이 한 밭을 나눠 쓰므로 같은 목록), 조각상, 등, 덧줄 돌담, 쓰지 않는 구간(빗금), 열 이름표 수, 고른 자리, 밟은 열 */
export interface DrawnTerraceField {
  walls: Array<{ step: number; y: number; kind: 'line' | 'middle' }>;
  plaques: string[];
  lamps: DrawnLampMark[];
  ledgers: Array<{ column: number; step: number; y: number }>;
  hatched: number[];
  headers: number;
  cursor: { column: number; step: number; y: number; placed: boolean } | null;
  flashing: number[];
}
/** 건반 다리(T6)에 그려진 모습: 널 위의 커서, 이름표 자리, 밧줄, 깃발, 표지판 악보(world/installations/keyBridgeLayer.ts의 DrawnKeyBridge와 같은 모양) */
export interface DrawnBridgeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DrawnKeyBridge {
  task: 'names' | 'interval' | 'flags' | null;
  free: boolean;
  /** 이름을 쓴 흰 널의 이름들(설치물 모드에서만) */
  names: string[];
  /** 고른 널(자리 번호) */
  cursor: number | null;
  playing: number[];
  flashing: number[];
  tags: Array<{ draft: number; plank: number; side: 'raised' | 'lowered'; text: string | null; selected: boolean; flagged: boolean; box: DrawnBridgeBox }>;
  ropes: Array<{ qid: string; from: number; to: number | null; text: string | null; selected: boolean; flagged: boolean; a: { x: number; y: number }; b: { x: number; y: number } | null }>;
  /** x, y는 기둥 아래. plank가 null이면 깃발 걸이에 서 있다. stack은 같은 널의 깃발 가운데 몇 번째인가(0부터) */
  flags: Array<{ draft: number; order: number; plank: number | null; stack: number; selected: boolean; flagged: boolean; x: number; y: number }>;
  sign: { board: DrawnBridgeBox; keySignature: number; bars: number; notes: number; rests: number; accidentals: number; clef: boolean } | null;
}
export interface DrawnInstallation {
  installationId: string;
  active: boolean;
  slots: DrawnSlot[];
  /** 무대 바닥이면 고른 마디(0부터)와 마디·성부 이름을 그렸는가 */
  selectedMeasure?: number | null;
  labelled?: boolean;
  /** 징검다리이면 그린 돌과 남은 물 등. slots는 가장 잘게 나눈 칸의 요약이다 */
  timeline?: DrawnTimeline;
  /** 물레방아이면 그린 바퀴(못과 빈 구멍). 띠(timeline)와 같은 초안이다 */
  wheel?: DrawnWheel;
  /** 종나무이면 그린 종과 가지 */
  bell?: DrawnBells;
  /** 계단밭이면 그린 돌담과 등 */
  terrace?: DrawnTerraceField;
  /** 건반 다리이면 그린 널 위의 표시와 이름표, 밧줄, 깃발, 표지판 악보 */
  keyBridge?: DrawnKeyBridge;
}
export interface InstallationMode {
  installationId: string;
  stationId: string;
}
export interface WorldEventLike {
  type: string;
  installationId?: string;
  slot?: number;
  stationId?: string | null;
  /** stepped: 바깥에서 올라섰다(종나무는 이때 올라선 나무의 화음을 울린다) */
  entered?: boolean;
  /** slot-pressed: 계단밭에서 눌린 높이(온음계 칸 수, 가온 도가 0). 열만 눌렸으면 없다 */
  step?: number;
}
export interface Game {
  world: {
    bridge: {
      status: { get(): Status };
      position: { get(): Pos };
      installationMode: { get(): InstallationMode | null };
      bottomInset: { get(): number };
      events: { subscribe(fn: (e: WorldEventLike) => void): () => void };
    };
    command(c: unknown): void;
    teleportToStation(id: string): boolean;
    debugState(): Dbg | null;
  };
}

export const status = (p: Page): Promise<Status> => p.evaluate(() => (window as unknown as { __game: Game }).__game.world.bridge.status.get());
export const pos = (p: Page): Promise<Pos> => p.evaluate(() => (window as unknown as { __game: Game }).__game.world.bridge.position.get());
export const dbg = (p: Page): Promise<Dbg> => p.evaluate(() => (window as unknown as { __game: Game }).__game.world.debugState() as Dbg);
export const command = (p: Page, c: unknown): Promise<void> => p.evaluate((cmd) => (window as unknown as { __game: Game }).__game.world.command(cmd), c);
export const teleport = (p: Page, id: string): Promise<boolean> => p.evaluate((sid) => (window as unknown as { __game: Game }).__game.world.teleportToStation(sid), id);
/** 캐릭터를 그린 y와 월드 위치 y의 차이(한 번에 읽는다). 걷는 중 흔들림의 크기 */
export const bobOf = (p: Page): Promise<number> =>
  p.evaluate(() => {
    const w = (window as unknown as { __game: Game }).__game.world;
    return (w.debugState() as Dbg).playerY - w.bridge.position.get().y;
  });
export const hashOf = (p: Page): Promise<string> => p.evaluate(() => location.hash);

export const waitReady = (p: Page) =>
  p.waitForFunction(
    () => {
      const g = (window as unknown as { __game?: Game }).__game;
      return !!g && g.world.bridge.status.get().ready;
    },
    undefined,
    { timeout: 30000 },
  );
/** 바닥 조각이 모두 올라올 때까지 */
export const waitChunks = (p: Page) =>
  p.waitForFunction(
    () => {
      const d = (window as unknown as { __game?: Game }).__game?.world.debugState();
      return !!d && d.chunks.length > 0 && d.pending.length === 0;
    },
    undefined,
    { timeout: 30000 },
  );
export const waitNear = (p: Page, id: string, timeout = 60000) =>
  p.waitForFunction(
    (sid) => (window as unknown as { __game: Game }).__game.world.bridge.status.get().near?.stationId === sid,
    id,
    { timeout },
  );
export const waitStopped = (p: Page) => p.waitForFunction(() => !(window as unknown as { __game: Game }).__game.world.bridge.status.get().walking, undefined, { timeout: 30000 });
export const toScreen = (d: Dbg, wx: number, wy: number) => ({ x: (wx - d.view.x) * d.zoom, y: (wy - d.view.y) * d.zoom });
export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
/**
 * 눌러 볼 영역(정거장의 눌림 영역 등) 안에서 화면에 보이는 점을 월드 좌표로 돌려준다.
 * 둘레에 margin(화면 px)의 여유를 둬서 위쪽 메뉴나 아래쪽 막대 위를 누르지 않게 한다.
 */
export function visiblePointIn(d: Dbg, hit: { x: number; y: number; w: number; h: number }, margin = 120): { x: number; y: number } {
  const m = margin / d.zoom;
  const x0 = Math.max(hit.x + 8, d.view.x + m);
  const x1 = Math.min(hit.x + hit.w - 8, d.view.x + d.view.w - m);
  const y0 = Math.max(hit.y + 8, d.view.y + m);
  const y1 = Math.min(hit.y + hit.h - 8, d.view.y + d.view.h - m);
  if (x0 > x1 || y0 > y1) throw new Error('영역이 화면 안에 보이지 않아요');
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
/** 소프트웨어 렌더링(Chrome 헤드리스)은 프레임이 느려서, 시간이 아니라 움직인 거리로 기다린다 */
export const waitMoved = (p: Page, from: Pos, minDist: number, timeout = 30000) =>
  p.waitForFunction(
    ([x, y, min]) => {
      const q = (window as unknown as { __game: Game }).__game.world.bridge.position.get();
      return Math.hypot(q.x - (x as number), q.y - (y as number)) >= (min as number);
    },
    [from.x, from.y, minDist] as const,
    { timeout },
  );

// ───── 설치물 모드(4.2) ─────

/** 지금 들어가 있는 설치물 모드(없으면 null) */
export const modeOf = (p: Page): Promise<InstallationMode | null> => p.evaluate(() => (window as unknown as { __game: Game }).__game.world.bridge.installationMode.get());
/** 화면 아래를 조작 막대가 가리는 높이(화면 px) */
export const insetOf = (p: Page): Promise<number> => p.evaluate(() => (window as unknown as { __game: Game }).__game.world.bridge.bottomInset.get());
/** 설치물 층이 그린 돌들(설치물 하나) */
export const drawnOf = async (p: Page, installationId = 'inst.village.scale-stones'): Promise<DrawnInstallation> => {
  const d = await dbg(p);
  const found = d.installations.find((i) => i.installationId === installationId);
  if (!found) throw new Error(`그려진 설치물이 없어요: ${installationId}`);
  return found;
};
/** 모드에 들어가 카메라가 설치물을 담는 자리에 닿을 때까지(전환이 끝날 때까지) */
export const waitFramed = (p: Page, timeout = 30000) =>
  p.waitForFunction(
    () => {
      const d = (window as unknown as { __game?: Game }).__game?.world.debugState();
      return !!d && d.framing && !d.transitioning;
    },
    undefined,
    { timeout },
  );
/** 모드에서 나와 카메라가 캐릭터를 따라가는 자리로 돌아올 때까지 */
export const waitUnframed = (p: Page, timeout = 30000) =>
  p.waitForFunction(
    () => {
      const d = (window as unknown as { __game?: Game }).__game?.world.debugState();
      return !!d && !d.framing && !d.transitioning;
    },
    undefined,
    { timeout },
  );
/** 월드의 사건(밟기, 돌 누르기)을 모아 두기 시작한다. 모은 것은 stepEvents로 읽는다 */
export const recordEvents = (p: Page): Promise<void> =>
  p.evaluate(() => {
    const w = window as unknown as { __game: Game; __events?: WorldEventLike[] };
    w.__events = [];
    w.__game.world.bridge.events.subscribe((e) => void w.__events!.push({ ...e }));
  });
export const eventsOf = (p: Page, type: string): Promise<WorldEventLike[]> => p.evaluate((t) => ((window as unknown as { __events?: WorldEventLike[] }).__events ?? []).filter((e) => e.type === t), type);
