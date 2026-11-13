// content/ 폴더를 읽어 검사한다. 빌드 도구(validate-content)와 단위 테스트가 같은 함수를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { validateQuestSet, validateReviewLog } from '../src/domain/content';
import { clipRoadsToBounds, parseDiscoveryFile, validateDiscoveries } from '../src/domain/discovery';
import type { DiscoveryFile, DiscoveryGeometry, RoadLine } from '../src/domain/discovery';
import type { ContentIssue, QuestDefinition } from '../src/domain/content';
import { parseInstallation, validateInstallationSet } from '../src/domain/installation';
import type { InstallationDef } from '../src/domain/installation';
import { sightsOf, validateRoadSight } from '../src/domain/roadsight';
import type { Sight } from '../src/domain/roadsight';
import { PLANNED_QUESTS, TILE, WorldMap, parseRegion, regionBoundsPx, validateRegionSet } from '../src/domain/world';
import type { RegionDef, RegionId } from '../src/domain/world';
import { LANDMARK_SOUNDS } from '../src/domain/worldsound';
import { NavGrid } from '../src/world/nav';
import { NAV_ROWS, WORLD_OBJECTS } from '../src/world/generated/worldData';
import { outerRoads } from '../world-src/outer';
import { VILLAGE_GATES, villageRoads } from '../world-src/village';

export const CONTENT_DIRS = ['quests', 'installations', 'regions', 'discoveries', 'ensemble', 'sources'] as const;

export interface LoadedFile {
  file: string;
  data: unknown;
}

export interface LoadedContent {
  root: string;
  quests: LoadedFile[];
  installations: LoadedFile[];
  regions: LoadedFile[];
  discoveries: LoadedFile[];
  reviewLog: unknown;
  issues: ContentIssue[];
}

function readJsonFiles(dir: string, issues: ContentIssue[]): LoadedFile[] {
  if (!fs.existsSync(dir)) return [];
  const out: LoadedFile[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      out.push({ file, data: JSON.parse(fs.readFileSync(file, 'utf-8')) });
    } catch (err) {
      issues.push({ code: 'JSON', path: path.relative(path.dirname(path.dirname(dir)), file), message: `JSON을 읽을 수 없어요: ${(err as Error).message}` });
    }
  }
  return out;
}

export function loadContent(root: string): LoadedContent {
  const issues: ContentIssue[] = [];
  for (const d of CONTENT_DIRS) {
    if (!fs.existsSync(path.join(root, 'content', d))) issues.push({ code: 'FOLDER', path: `content/${d}`, message: 'content 폴더가 없어요' });
  }
  const quests = readJsonFiles(path.join(root, 'content', 'quests'), issues);
  const installations = readJsonFiles(path.join(root, 'content', 'installations'), issues);
  const regions = readJsonFiles(path.join(root, 'content', 'regions'), issues);
  const discoveries = readJsonFiles(path.join(root, 'content', 'discoveries'), issues);
  const logFile = path.join(root, 'content', 'sources', 'review-log.json');
  let reviewLog: unknown = [];
  if (fs.existsSync(logFile)) {
    try {
      reviewLog = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    } catch (err) {
      issues.push({ code: 'JSON', path: 'content/sources/review-log.json', message: `JSON을 읽을 수 없어요: ${(err as Error).message}` });
    }
  }
  return { root, quests, installations, regions, discoveries, reviewLog, issues };
}

/** content 전체를 검사하고 문제 목록을 돌려준다. 비어 있으면 통과. */
export function validateContentDir(root: string): ContentIssue[] {
  const loaded = loadContent(root);
  const issues: ContentIssue[] = [...loaded.issues];

  // 파일 이름은 과제 id와 같아야 한다
  for (const q of loaded.quests) {
    const id = (q.data as { questId?: unknown } | null)?.questId;
    const base = path.basename(q.file, '.json');
    if (typeof id === 'string' && id !== base) issues.push({ code: 'FILENAME', path: path.relative(root, q.file), message: `파일 이름(${base})이 questId(${id})와 달라요` });
  }

  const installationIds = new Set<string>();
  for (const i of loaded.installations) {
    const id = (i.data as { installationId?: unknown } | null)?.installationId;
    if (typeof id === 'string' && id.length > 0) installationIds.add(id);
    else issues.push({ code: 'SHAPE', path: path.relative(root, i.file), message: 'installationId가 없어요' });
  }

  const defs = loaded.quests.map((q) => q.data);
  issues.push(...validateQuestSet(defs, { installationIds }));

  // 지역과 정거장(3.2, B.1). 파일 이름은 지역 id와 같아야 한다
  const regionDefs: RegionDef[] = [];
  for (const r of loaded.regions) {
    const rel = path.relative(root, r.file);
    const parsed = parseRegion(r.data, rel);
    issues.push(...parsed.issues);
    if (parsed.region) {
      regionDefs.push(parsed.region);
      const base = path.basename(r.file, '.json');
      if (base !== parsed.region.regionId) issues.push({ code: 'FILENAME', path: rel, message: `파일 이름(${base})이 regionId(${parsed.region.regionId})와 달라요` });
    }
  }
  if (loaded.regions.length > 0 && issues.every((i) => !i.path.startsWith('content/regions') || i.code === 'FILENAME')) {
    issues.push(...validateRegionSet(regionDefs));
  }
  // 과제 파일이 이미 있는 과제는 계획표의 제목과 같아야 한다(지도 카드와 목록이 다른 이름을 쓰지 않게)
  for (const q of loaded.quests) {
    const d = q.data as { questId?: unknown; title?: unknown } | null;
    const planned = typeof d?.questId === 'string' ? PLANNED_QUESTS[d.questId] : undefined;
    if (planned && typeof d?.title === 'string' && d.title !== planned.title) {
      issues.push({ code: 'TITLE_MISMATCH', path: path.relative(root, q.file), message: `제목 '${d.title}'이 계획표(domain/world.ts)의 '${planned.title}'와 달라요` });
    }
  }
  const valid = defs.filter((d): d is QuestDefinition => typeof d === 'object' && d !== null && typeof (d as { questId?: unknown }).questId === 'string');

  // 설치물(4.1, A.2). 파일 이름은 installationId와 같아야 하고, 정거장·과제와의 연결을 함께 검사한다
  const installationDefs: InstallationDef[] = [];
  for (const i of loaded.installations) {
    const rel = path.relative(root, i.file);
    const parsed = parseInstallation(i.data, rel);
    issues.push(...parsed.issues);
    if (!parsed.installation) continue;
    installationDefs.push(parsed.installation);
    const base = path.basename(i.file, '.json');
    if (base !== parsed.installation.installationId) issues.push({ code: 'FILENAME', path: rel, message: `파일 이름(${base})이 installationId(${parsed.installation.installationId})와 달라요` });
  }
  const regionsOk = regionDefs.length > 0 && issues.every((i) => !i.path.startsWith('content/regions'));
  const map = regionsOk && regionDefs.length === 6 ? new WorldMap(regionDefs) : undefined;
  issues.push(...validateInstallationSet(installationDefs, { ...(map ? { map } : {}), quests: valid }));

  issues.push(...validateReviewLog(loaded.reviewLog, valid));
  issues.push(...validateDiscoveryFiles(root, loaded.discoveries, valid, regionDefs));
  // 길 위의 볼거리 간격(3.4 규칙 1): 지역 여섯이 모두 읽혔을 때만 본다
  if (map) issues.push(...validateRoadSightFiles(regionDefs));
  return issues;
}

/** 시작 자리에서 걸어서 닿는 칸의 표(32 px 칸). 64 px(캐릭터 몸 지름의 두 배) 안이 모두 열린 곳만 '닿는 곳'으로 친다 */
function reachabilityOf(grid: NavGrid, start: { x: number; y: number }): (x: number, y: number) => boolean {
  const key = (cx: number, cy: number): number => cy * grid.cols + cx;
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[Math.floor(start.x / TILE), Math.floor(start.y / TILE)]];
  seen.add(key(queue[0]![0], queue[0]![1]));
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.isBlockedCell(nx, ny) || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return (x, y) => {
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (grid.isBlockedCell(cx + dx, cy + dy)) return false;
    return seen.has(key(cx, cy));
  };
}

/**
 * 지역마다 발견 요소를 검사할 때 쓰는 월드의 모양: 길, 문, 걸어서 닿는 곳, 지역의 범위.
 *  · 마을: 마을 안 길(villageRoads)과 마을의 문 다섯.
 *  · 바깥 지역: 바큇살 길과 둘레길(outerRoads)을 지역의 범위 안으로 자른 토막이 길이고, 길이 지역 경계를 지나는 자리가 문이다.
 *    그래서 막다른 길은 지역 안에서 끝나는 길의 끝(예: 동쪽 길의 강둑 끝)뿐이다.
 *  · 걸어서 닿는 곳은 마을 시작 자리에서 이어진 칸이고, 몸(64 px)이 막힌 칸에 닿지 않는 곳이다.
 */
export function discoveryWorld(regionDefs: readonly RegionDef[]): { geometry: Partial<Record<RegionId, DiscoveryGeometry>>; bounds: Partial<Record<RegionId, { x0: number; y0: number; x1: number; y1: number }>> } {
  const grid = NavGrid.fromRows(NAV_ROWS);
  const reachable = reachabilityOf(grid, { x: 3984, y: 3480 });
  const geometry: Partial<Record<RegionId, DiscoveryGeometry>> = {
    village: { roads: villageRoads().map((r) => ({ id: r.id, width: r.width, points: r.points })), gates: VILLAGE_GATES, reachable },
  };
  const bounds: Partial<Record<RegionId, { x0: number; y0: number; x1: number; y1: number }>> = {};
  for (const r of regionDefs) bounds[r.regionId] = regionBoundsPx(r);
  const outer = outerRoads().map((r) => ({ id: r.id, width: r.width, points: r.points }));
  for (const r of regionDefs) {
    if (r.regionId === 'village') continue;
    const clipped = clipRoadsToBounds(outer, bounds[r.regionId]!);
    geometry[r.regionId] = { roads: clipped.roads, gates: clipped.gates, reachable };
  }
  return { geometry, bounds };
}

/** 발견 요소(3.6)를 읽고 검사한다. 파일 이름은 지역 id와 같아야 한다. 길과 문은 world-src의 것을 쓴다(discoveryWorld) */
function validateDiscoveryFiles(root: string, files: LoadedFile[], quests: QuestDefinition[], regionDefs: RegionDef[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const parsed: DiscoveryFile[] = [];
  for (const f of files) {
    const rel = path.relative(root, f.file);
    const r = parseDiscoveryFile(f.data, rel);
    issues.push(...r.issues);
    if (!r.file) continue;
    parsed.push(r.file);
    const base = path.basename(f.file, '.json');
    if (base !== r.file.regionId) issues.push({ code: 'FILENAME', path: rel, message: `파일 이름(${base})이 regionId(${r.file.regionId})와 달라요` });
  }
  if (issues.length > 0) return issues;
  const { geometry, bounds } = discoveryWorld(regionDefs);
  issues.push(...validateDiscoveries(parsed, { questIds: new Set(quests.map((q) => q.questId)), geometry, bounds }));
  return issues;
}

/** 표지판 그림 파일(obj-<지역>-signpost.svg). 정거장 곁의 표지판(sign)과 길목의 표지판(prop)이 같은 그림을 쓴다 */
export const SIGNPOST_FILE = /^obj-[a-z-]+-signpost\.svg$/;

/**
 * 길 위의 볼거리(3.4 규칙 1)를 검사할 때 쓰는 월드의 모양.
 *  · 길: 마을 안 길(샛길 포함)과 바큇살 길 다섯, 둘레길(world-src가 그리는 점들과 폭). 폭이 있으므로 검사는 가운데 줄과 양쪽 가장자리를 본다.
 *  · 알아볼 수 있는 것: 정거장(소리가 나는 자리), 소리를 내는 지역 표지(LANDMARK_SOUNDS), 표지판 그림이 놓인 자리(월드 파일의 사물).
 *  · 발견 요소는 넣지 않는다. 공개 채널에서는 검수가 끝나기 전에 보이지 않으므로(G2-7) 아무것도 공개되지 않은 가장 나쁜 경우로 센다(D-259).
 */
export function roadSightWorld(regionDefs: readonly RegionDef[]): { roads: RoadLine[]; sights: Sight[] } {
  const roads: RoadLine[] = [...villageRoads(), ...outerRoads()].map((r) => ({ id: r.id, width: r.width, points: r.points }));
  const stations = regionDefs.flatMap((r) => r.stations.map((s) => ({ stationId: s.stationId, x: s.x, y: s.y })));
  const landmarks = LANDMARK_SOUNDS.flatMap((def) => {
    const region = regionDefs.find((r) => r.regionId === def.regionId);
    return region ? [{ regionId: def.regionId, x: region.landmark.x, y: region.landmark.y }] : [];
  });
  const signs = WORLD_OBJECTS.filter((o) => SIGNPOST_FILE.test(o.file)).map((o) => ({ id: o.id, x: o.x, y: o.y }));
  return { roads, sights: sightsOf({ stations, landmarks, signs }) };
}

/** 규칙 1(길의 어느 곳에서든 정거장이 들리거나 보이거나 표지판이 보인다)을 가장 나쁜 경우로 검사한다. 비어 있으면 통과 */
export function validateRoadSightFiles(regionDefs: readonly RegionDef[]): ContentIssue[] {
  const { roads, sights } = roadSightWorld(regionDefs);
  return validateRoadSight(roads, sights);
}
