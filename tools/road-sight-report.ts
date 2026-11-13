// 길 위의 볼거리 간격과 걷는 시간의 보고(7-7, 설계서 3.4의 규칙 1과 2, 3.1의 걷는 시간):
//   npm run roadsight           보고를 찍는다(규칙 1의 가장 긴 빈 구간, 어림값을 바꿨을 때, 규칙 2, 걷는 시간, 볼거리 사이 거리)
//   npm run check:roadsight     규칙을 어기거나 표와 시간이 어긋나면 1로 끝난다
// 규칙 1은 발견 요소가 하나도 안 보이는 가장 나쁜 경우(D-259)로 센다. 어림값(들리는 810 px, 보이는 270 px)이 틀렸다면 얼마나 어긋나는지도 함께 찍는다.
// 이 점검은 눈과 귀로 하는 점검(걷는 길이 지루하지 않은지, 810 px 가까이의 소리가 귀에 들리는지, 표지판이 길 위에서 알아보기 쉬운지)을 대신하지 않는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDiscoveryFiles } from '../src/app/discovery-data';
import { DEAD_END_RADIUS, PIECE_HEAR_RADIUS, deadEndsOf, visibleDiscoveries, visiblePlayInstruments } from '../src/domain/discovery';
import { BARE_STRETCH_MAX, SEE_RADIUS, bareStretches, validateRoadSight } from '../src/domain/roadsight';
import type { Perceivable, Sight } from '../src/domain/roadsight';
import { WALK_SPEED, WORLD_W } from '../src/domain/world';
import { HEAR_RADIUS, MIN_HEARD_GAIN } from '../src/domain/worldsound';
import { DEADZONE_SCREEN, cameraZoom } from '../src/world/camera';
import { NAV_ROWS } from '../src/world/generated/worldData';
import { NavGrid, findPath } from '../src/world/nav';
import type { Point } from '../src/world/nav';
import { createPlayer, startPath, stepPlayer } from '../src/world/player';
import { LOOP_POINTS, LOOP_SECONDS, ROUTE_TABLE, outerRoads } from '../world-src/outer';
import { discoveryWorld, roadSightWorld } from './content-loader';
import { loadRegionDefs } from './world-files';

const check = process.argv.slice(2).includes('--check');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const regionDefs = loadRegionDefs(root);
const { roads, sights } = roadSightWorld(regionDefs);
const files = loadDiscoveryFiles();
const problems: string[] = [];
const px = (n: number): string => `${Math.round(n)} px`;

/** 게임이 소리를 내는 거리(음량이 MIN_HEARD_GAIN 이상): 정거장과 기준음 탑의 소리 */
const AUDIBLE = HEAR_RADIUS * (1 - Math.sqrt(MIN_HEARD_GAIN));

// ───── 규칙 1 ─────
const waysign = (s: Sight): boolean => s.id.startsWith('waysign-');
const previewSights: Sight[] = [
  ...sights,
  ...visibleDiscoveries(files, 'preview').map((d): Sight => ({ id: d.discoveryId, kind: d.kind, x: d.x, y: d.y })),
  ...visiblePlayInstruments(files, 'preview').map((p): Sight => ({ id: p.playId, kind: 'playInstrument', x: p.x, y: p.y })),
];
const count = (list: readonly Sight[], kind: Sight['kind']): number => list.filter((s) => s.kind === kind).length;

interface Longest {
  length: number;
  where: string;
  over: number;
}
function longestStretch(list: readonly Sight[], perceivable?: Perceivable): Longest {
  let best: Longest = { length: 0, where: '-', over: 0 };
  for (const road of roads) {
    for (const b of bareStretches(road, list, undefined, perceivable)) {
      const over = best.over + (b.length > BARE_STRETCH_MAX ? 1 : 0);
      best = b.length > best.length ? { length: b.length, where: `${road.id} ${Math.round(b.fromArc)}–${Math.round(b.toArc)}`, over } : { ...best, over };
    }
  }
  return best;
}

/** 어림값을 바꾼 알아볼 수 있는 거리: sound가 false이면 소리를 켜지 않은 사람이라 들리는 것이 없고 모두 보이는 거리로만 센다 */
const radii =
  (audible: number, seen: number, sound: boolean): Perceivable =>
  (kind, d) => {
    if (!(d >= 0)) return false;
    if (kind === 'station' || kind === 'landmarkSound') return d <= (sound ? audible : seen);
    if (kind === 'soundPiece') return d <= (sound ? (audible * PIECE_HEAR_RADIUS) / HEAR_RADIUS : seen);
    return d <= seen;
  };
/**
 * 세로 화면(설계서 7.1의 휴대폰 430×932)에서 캐릭터가 카메라의 멈춤 구역(7.3, 화면 가운데 160×120 px)의 끝에 서 있으면,
 * 그쪽(걷는 쪽)으로 보이는 거리가 멈춤 구역의 반폭(월드 px)만큼 줄어든다. 걸을 때 앞쪽이 바로 그 쪽이다
 */
const PORTRAIT_PHONE = { width: 430, height: 932 } as const;
const SEEN_AT_DEADZONE_EDGE = SEE_RADIUS - DEADZONE_SCREEN.width / cameraZoom(PORTRAIT_PHONE) / 2;
/** 정거장과 기준음 탑을 아예 세지 않는다(표지판과 발견 요소만) */
const withoutStations: Perceivable = (kind, d) => d >= 0 && kind !== 'station' && kind !== 'landmarkSound' && d <= SEE_RADIUS;

console.log(`== 규칙 1: 길 위 어디서든 다음 정거장이 보이거나 들린다(빈 구간이 ${BARE_STRETCH_MAX} px를 넘으면 안 된다)`);
console.log(`길 ${roads.length}개(${roads.map((r) => r.id).join(', ')})`);
console.log(`알아볼 수 있는 것(발견 요소 없음): 정거장 ${count(sights, 'station')}, 기준음 탑 ${count(sights, 'landmarkSound')}, 표지판 ${count(sights, 'sign')}(길목 ${sights.filter(waysign).length}). 들림 ${px(AUDIBLE)}, 보임 ${SEE_RADIUS} px, 표본 간격 8 px, 길 폭의 가운데 줄과 양쪽 가장자리`);
const issues = validateRoadSight(roads, sights);
for (const i of issues) problems.push(`${i.code} ${i.message}`);
console.log('길마다(발견 요소 없음): 빈 구간 수, 가장 긴 것, 한도에 가까운(500 px 넘는) 구간');
for (const road of roads) {
  const list = bareStretches(road, sights);
  const longest = Math.max(0, ...list.map((b) => b.length));
  const near = list.filter((b) => b.length > 500).map((b) => `${Math.round(b.fromArc)}–${Math.round(b.toArc)}(${Math.round(b.length)})`);
  console.log(`  ${road.id.padEnd(18)} ${String(list.length).padStart(2)}곳  가장 긴 ${String(Math.round(longest)).padStart(4)} px  ${near.join(' ')}`);
}
const base = longestStretch(sights);
console.log(`가장 긴 빈 구간(발견 요소 없음): ${px(base.length)} (${base.where}), ${BARE_STRETCH_MAX} px 넘는 구간 ${base.over}곳 → ${issues.length === 0 ? '통과' : '어김'}`);
const noWay = longestStretch(sights.filter((s) => !waysign(s)));
console.log(`길목 표지판 ${sights.filter(waysign).length}개를 모두 뺀 경우: ${px(noWay.length)} (${noWay.where}), ${BARE_STRETCH_MAX} px 넘는 구간 ${noWay.over}곳`);
const preview = longestStretch(previewSights);
console.log(`발견 요소 ${previewSights.length - sights.length}개가 모두 보이는 미리보기 채널: ${preview.length.toFixed(2)} px (${preview.where})`);

console.log('어림값을 바꾸면(발견 요소 없음 / 미리보기):');
const scenarios: Array<[string, Perceivable | undefined]> = [
  [`지금(들림 ${Math.round(AUDIBLE)}, 보임 ${SEE_RADIUS})`, undefined],
  ['들림 700 px', radii(700, SEE_RADIUS, true)],
  ['들림 600 px', radii(600, SEE_RADIUS, true)],
  ['보임 220 px', radii(AUDIBLE, 220, true)],
  [`보임 ${Math.round(SEEN_AT_DEADZONE_EDGE)} px(세로 화면에서 캐릭터가 카메라 멈춤 구역의 끝에 있을 때, 원으로 어림한 가장 나쁜 값)`, radii(AUDIBLE, SEEN_AT_DEADZONE_EDGE, true)],
  ['소리를 켜지 않은 사람(정거장과 기준음 탑, 소리 조각도 보이는 270 px로만)', radii(AUDIBLE, SEE_RADIUS, false)],
  ['정거장과 기준음 탑을 세지 않음(표지판과 발견 요소만)', withoutStations],
];
for (const [label, perceivable] of scenarios) {
  const a = longestStretch(sights, perceivable);
  const b = longestStretch(previewSights, perceivable);
  console.log(`  ${label}: ${px(a.length)} (${a.where}), 넘는 구간 ${a.over}곳 / 미리보기 ${px(b.length)}, 넘는 구간 ${b.over}곳`);
}

// ───── 규칙 2 ─────
console.log('\n== 규칙 2: 막다른 길 끝에는 발견 요소가 있다');
const { geometry } = discoveryWorld(regionDefs);
let ends = 0;
for (const def of regionDefs) {
  const g = geometry[def.regionId];
  const file = files.find((f) => f.regionId === def.regionId);
  if (!g || !file) {
    problems.push(`지역 ${def.regionId}의 길이나 발견 요소 파일이 없어요`);
    continue;
  }
  for (const end of deadEndsOf(g.roads, g.gates)) {
    ends++;
    const nearest = Math.min(Infinity, ...file.items.map((d) => Math.hypot(d.x - end.x, d.y - end.y)));
    const ok = nearest <= DEAD_END_RADIUS;
    if (!ok) problems.push(`막다른 길 끝 ${def.regionId} (${Math.round(end.x)}, ${Math.round(end.y)})에서 ${DEAD_END_RADIUS} px 안에 발견 요소가 없어요`);
    console.log(`  ${def.regionId.padEnd(11)} (${Math.round(end.x)}, ${Math.round(end.y)}): 가장 가까운 소리 조각·쪽지 ${px(nearest)} ${ok ? '' : '← 어김'}`);
  }
}
console.log(`막다른 길 끝 ${ends}곳(한도 ${DEAD_END_RADIUS} px)`);

// ───── 걷는 시간 ─────
console.log(`\n== 걷는 시간(실제 걸음 계산, ${WALK_SPEED} px/초)`);
const grid = NavGrid.fromRows(NAV_ROWS);
interface Walked {
  sec: number;
  arrived: boolean;
  at: Point;
}
function walk(from: Point, waypoints: readonly Point[]): Walked {
  let state = startPath(createPlayer(from.x, from.y), waypoints);
  let sec = 0;
  for (let i = 0; i < 60 * 300; i++) {
    const r = stepPlayer(state, { dx: 0, dy: 0 }, 1 / 60, grid);
    state = r.state;
    sec += 1 / 60;
    if (r.arrived) return { sec, arrived: true, at: { x: state.x, y: state.y } };
    if (r.stuck) return { sec, arrived: false, at: { x: state.x, y: state.y } };
  }
  return { sec, arrived: false, at: { x: state.x, y: state.y } };
}
const length = (pts: readonly Point[]): number => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
const show = (w: Walked): string => (w.arrived ? `${w.sec.toFixed(2)}초` : `막힘 ${w.sec.toFixed(2)}초 (${Math.round(w.at.x)}, ${Math.round(w.at.y)})`);

const drawn = outerRoads();
for (const row of ROUTE_TABLE) {
  const gate = row.gate;
  if (!gate) continue;
  const viaWalk = walk(gate, row.via);
  const line = drawn.find((r) => r.id === row.id)!.points;
  const lineWalk = walk(line[0]!, line.slice(1));
  const found = findPath(grid, gate, row.via[row.via.length - 1]!);
  const tapWalk = found ? walk(gate, found.waypoints) : null;
  console.log(`  ${row.name.padEnd(4)} 표 ${row.lengthPx} px ${row.seconds}초 | 표의 점대로 ${show(viaWalk)} | 그려진 길 ${px(length(line))} 가운데 줄 ${show(lineWalk)} | 눌러서 걷기 ${tapWalk ? show(tapWalk) : '길 없음'}`);
  if (!viaWalk.arrived || Math.round(viaWalk.sec) !== row.seconds) problems.push(`${row.name} 길을 표의 점대로 걸으면 ${show(viaWalk)}이라 표(${row.seconds}초)와 달라요`);
  if (!tapWalk?.arrived) problems.push(`${row.name} 길을 눌러서 걸어도 닿지 않아요`);
}
const loop = drawn.find((r) => r.id === 'loop')!.points;
const loopVia = walk(LOOP_POINTS[0]!, LOOP_POINTS.slice(1));
const loopDrawn = walk(loop[0]!, loop.slice(1));
console.log(`  둘레길 설계서 ${px(length(LOOP_POINTS))} ${LOOP_SECONDS}초 | 점들을 곧게 이은 선 ${show(loopVia)} | 그려진 길 ${px(length(loop))} ${show(loopDrawn)}`);
if (!loopDrawn.arrived || Math.abs(loopDrawn.sec - LOOP_SECONDS) >= 2) problems.push(`그려진 둘레길을 걸으면 ${show(loopDrawn)}이라 설계서의 ${LOOP_SECONDS}초와 2초 넘게 달라요`);

console.log(`  월드를 가로로 끝에서 끝까지 ${(WORLD_W / WALK_SPEED).toFixed(1)}초(설계서 약 37초)`);
if (Math.round(WORLD_W / WALK_SPEED) !== 37) problems.push('월드를 가로로 끝에서 끝까지 걷는 시간이 약 37초가 아니에요');
const plaza = { x: 4056, y: 3081 };
const toLandmark = regionDefs
  .filter((r) => r.regionId !== 'village')
  .map((r) => ({ id: r.regionId, sec: Math.hypot(r.landmark.x - plaza.x, r.landmark.y - plaza.y) / WALK_SPEED }));
console.log(`  광장에서 각 지역 표지까지 직선(설계서 11–18초): ${toLandmark.map((t) => `${t.id} ${t.sec.toFixed(1)}초`).join(', ')}`);
for (const t of toLandmark) if (Math.round(t.sec) < 11 || Math.round(t.sec) > 18) problems.push(`광장에서 ${t.id} 표지까지 ${t.sec.toFixed(1)}초라 11–18초 밖이에요`);

// ───── 볼거리 사이 거리 ─────
const nearestMean = (pts: ReadonlyArray<{ x: number; y: number }>): number => pts.reduce((sum, a) => sum + Math.min(...pts.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))), 0) / pts.length;
const stations = sights.filter((s) => s.kind === 'station');
const stationMean = nearestMean(stations);
const allMean = nearestMean([...stations, ...previewSights.filter((s) => s.kind === 'soundPiece' || s.kind === 'conceptNote' || s.kind === 'playInstrument')]);
console.log(`  볼거리 사이 평균(가장 가까운 이웃까지, 설계서 약 750 px = 3–4초): 정거장 ${stations.length}곳 ${stationMean.toFixed(1)} px(${(stationMean / WALK_SPEED).toFixed(1)}초), 발견 요소와 놀이 악기까지 ${allMean.toFixed(1)} px`);
if (stationMean < 660 || stationMean > 880) problems.push(`정거장 사이의 평균 거리 ${stationMean.toFixed(1)} px가 설계서의 약 750 px와 많이 달라요(660–880 px 밖)`);

if (problems.length > 0) {
  console.error(`\n길 점검에서 문제 ${problems.length}건을 찾았어요.`);
  for (const p of problems) console.error(`  - ${p}`);
  if (check) process.exit(1);
}
console.log(check ? '\n길 점검 통과(걷는 길이 지루하지 않은지, 소리가 귀에 들리는지, 표지판이 알아보기 쉬운지는 사람이 본다).' : '');
