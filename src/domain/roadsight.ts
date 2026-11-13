// 7-7 길 위의 볼거리 간격(설계서 3.4 길을 놓는 규칙 1): "길 위 어느 지점에서든 다음 정거장이 보이거나 들린다.
// 둘 다 아닌 구간이 600 px를 넘으면 표지판이나 발견 요소를 놓는다." 순수 계산이다. 도메인은 월드 파일을 모르므로 길과 자리는 부르는 쪽이 넘겨 준다.
//
// 세는 법(D-259):
//  · 들린다 = 게임이 실제로 소리를 내는 거리다. 정거장의 서명 소리와 지역 표지(기준음 탑)는 음량 (1 − 거리 ÷ 900)²이 MIN_HEARD_GAIN(0.01) 이상인 810 px 안에서,
//    소리 조각은 (1 − 거리 ÷ 600)²이 같은 값 이상인 540 px 안에서 울린다(worldAudio가 이 값 아래는 소리를 내지 않는다).
//  · 보인다 = 캐릭터가 화면 한가운데일 때 어느 화면에서나 보이는 원 안(SEE_RADIUS, 270 px)이다. 세로 화면은 가로 540 월드 px가 보이므로 그 절반이다(7.1).
//    정거장이 보이는 범위는 어느 화면에서도 들리는 범위(810 px) 안이라서 정거장은 들리는 거리로 센다.
//  · 표지판, 개념 쪽지, 놀이 악기는 보여서 센다.
//  · 길 위 어느 지점 = 길 폭 안의 어느 곳이다. 길은 폭이 있어(바큇살 186 px, 둘레길 124 px) 걷는 사람이 가운데 줄에서 비켜 서 있을 수 있으므로, 길을 훑는 자리마다
//    가운데 줄과 양쪽 가장자리(폭의 절반만큼 옆)에서 모두 알아볼 수 있는 것이 있어야 알아볼 수 있는 자리로 센다(가운데 줄만 보면 가장자리를 걷는 사람이 놓친다).
//  · 발견 요소(소리 조각, 쪽지, 놀이 악기)는 공개 채널에서 검수가 끝나기 전에는 보이지 않는다(G2-7). 그래서 규칙을 지키는지는 발견 요소가 하나도 없는 경우
//    (정거장, 기준음 탑의 소리, 표지판만 있는 경우)로 확인한다. 발견 요소가 더해지면 빈 구간은 늘지 않는다.
import type { ContentIssue } from './content';
import { pieceHearGain } from './discovery';
import type { Point, RoadLine } from './discovery';
import { MIN_HEARD_GAIN, hearGain } from './worldsound';

/** 캐릭터가 화면 한가운데일 때 어느 화면에서나 보이는 원의 반지름(월드 px): 세로 화면에서 가로로 보이는 540 월드 px의 절반(7.1) */
export const SEE_RADIUS = 270;
/** 길을 놓는 규칙 1: 정거장이 보이지도 들리지도 않는 구간이 이보다 길면 표지판이나 발견 요소를 놓는다 */
export const BARE_STRETCH_MAX = 600;
/** 길을 훑는 간격(px) */
export const SAMPLE_STEP = 8;

export type SightKind = 'station' | 'landmarkSound' | 'soundPiece' | 'conceptNote' | 'playInstrument' | 'sign';

/** 길을 걸으며 알아볼 수 있는 것 하나 */
export interface Sight {
  id: string;
  kind: SightKind;
  x: number;
  y: number;
}

/** 이 종류의 것이 거리 distance(px)에서 알아볼 수 있는가(들리거나 보이는가) */
export function isPerceivable(kind: SightKind, distance: number): boolean {
  if (!(distance >= 0)) return false;
  switch (kind) {
    case 'station':
    case 'landmarkSound':
      return hearGain(distance) >= MIN_HEARD_GAIN;
    case 'soundPiece':
      return pieceHearGain(distance) >= MIN_HEARD_GAIN;
    default:
      return distance <= SEE_RADIUS;
  }
}

/** 이 종류의 것이 거리 distance(px)에서 알아볼 수 있는가를 정하는 함수. 기본은 isPerceivable이고, 어림값을 바꿔 보는 보고(`tools/road-sight-report.ts`)가 다른 값을 넘긴다 */
export type Perceivable = (kind: SightKind, distance: number) => boolean;

/** 부르는 쪽이 가진 월드의 것들 */
export interface SightSources {
  stations: ReadonlyArray<{ stationId: string; x: number; y: number }>;
  /** 소리를 내는 지역 표지(건반 늪의 기준음 탑) */
  landmarks: ReadonlyArray<{ regionId: string; x: number; y: number }>;
  /** 표지판 그림이 놓인 자리(정거장 곁의 것과 길목의 것 모두) */
  signs: ReadonlyArray<{ id: string; x: number; y: number }>;
  /** 발견 요소. 비우면 공개 채널에서 아직 아무것도 공개되지 않은 가장 나쁜 경우다 */
  discoveries?: ReadonlyArray<{ id: string; kind: 'soundPiece' | 'conceptNote' | 'playInstrument'; x: number; y: number }>;
}

export function sightsOf(src: SightSources): Sight[] {
  return [
    ...src.stations.map((s): Sight => ({ id: s.stationId, kind: 'station', x: s.x, y: s.y })),
    ...src.landmarks.map((l): Sight => ({ id: `landmark.${l.regionId}`, kind: 'landmarkSound', x: l.x, y: l.y })),
    ...src.signs.map((s): Sight => ({ id: s.id, kind: 'sign', x: s.x, y: s.y })),
    ...(src.discoveries ?? []).map((d): Sight => ({ id: d.id, kind: d.kind, x: d.x, y: d.y })),
  ];
}

/** 아무것도 알아볼 수 없는 구간 하나 */
export interface BareStretch {
  roadId: string;
  /** 구간이 시작하는 곳과 끝나는 곳의 길 위 거리(길의 처음부터, px). 닫힌 길에서 이음매를 넘으면 fromArc가 toArc보다 크다 */
  fromArc: number;
  toArc: number;
  /** 구간의 길이(px). 길을 step 간격으로 훑어 센 값이라 경계가 표본 사이 어디인지는 알 수 없고, 그만큼(step 안쪽)의 오차가 있다 */
  length: number;
  start: Point;
  end: Point;
}

/** 길의 한 표본: 길 위 거리 s, 가운데 줄의 자리, 그 자리에서 길에 수직인 단위 벡터(nx, ny) */
interface Sample extends Point {
  s: number;
  nx: number;
  ny: number;
}

function sampleAlong(points: readonly Point[], step: number): { samples: Sample[]; total: number } {
  const samples: Sample[] = [];
  let s = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let d = 0; d < len; d += step) samples.push({ s: s + d, x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len, nx, ny });
    s += len;
  }
  const last = points[points.length - 1];
  const prev = samples[samples.length - 1];
  if (last && prev) samples.push({ s, x: last.x, y: last.y, nx: prev.nx, ny: prev.ny });
  return { samples, total: s };
}

/**
 * 길의 어느 곳에서든(step 간격의 표본마다 가운데 줄과 양쪽 가장자리) 알아볼 수 있는 것이 하나도 없는 자리가 이어진 구간들.
 * 길 폭이 0이면 가운데 줄만 본다. 처음과 끝이 같은 닫힌 길은 이음매를 넘는 구간을 하나로 잇는다. 길이는 가운데 줄을 따라 잰다.
 * 무엇을 알아볼 수 있다고 칠지(perceivable)는 기본이 isPerceivable이고, 다른 값으로 어림값이 달라지면 어떻게 되는지 볼 때만 바꾼다
 */
export function bareStretches(road: RoadLine, sights: readonly Sight[], step: number = SAMPLE_STEP, perceivable: Perceivable = isPerceivable): BareStretch[] {
  const { samples, total } = sampleAlong(road.points, step);
  if (samples.length === 0) return [];
  const half = Math.max(0, road.width) / 2;
  const perceivedAt = (x: number, y: number): boolean => sights.some((t) => perceivable(t.kind, Math.hypot(x - t.x, y - t.y)));
  const runs: Array<{ i0: number; i1: number }> = [];
  let start = -1;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const perceived = perceivedAt(p.x, p.y) && (half === 0 || (perceivedAt(p.x + p.nx * half, p.y + p.ny * half) && perceivedAt(p.x - p.nx * half, p.y - p.ny * half)));
    if (perceived) {
      if (start >= 0) runs.push({ i0: start, i1: i - 1 });
      start = -1;
    } else if (start < 0) start = i;
  }
  if (start >= 0) runs.push({ i0: start, i1: samples.length - 1 });

  const first = road.points[0]!;
  const last = road.points[road.points.length - 1]!;
  const closed = road.points.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < 1;
  const lastIndex = samples.length - 1;
  const out: BareStretch[] = [];
  const make = (i0: number, i1: number, length: number): BareStretch => ({ roadId: road.id, fromArc: samples[i0]!.s, toArc: samples[i1]!.s, length, start: { x: samples[i0]!.x, y: samples[i0]!.y }, end: { x: samples[i1]!.x, y: samples[i1]!.y } });
  const startsAtSeam = runs.length > 0 && runs[0]!.i0 === 0;
  const endsAtSeam = runs.length > 0 && runs[runs.length - 1]!.i1 === lastIndex;
  if (closed && startsAtSeam && endsAtSeam && runs.length > 1) {
    // 이음매를 넘는 구간: 마지막 구간의 끝과 첫 구간의 처음이 같은 점이다
    const tail = runs[runs.length - 1]!;
    const head = runs[0]!;
    out.push(make(tail.i0, head.i1, total - samples[tail.i0]!.s + samples[head.i1]!.s + step));
    for (const r of runs.slice(1, -1)) out.push(make(r.i0, r.i1, samples[r.i1]!.s - samples[r.i0]!.s + step));
  } else {
    for (const r of runs) out.push(make(r.i0, r.i1, samples[r.i1]!.s - samples[r.i0]!.s + step));
  }
  return out;
}

/** 규칙 1을 어기는 곳(빈 구간이 600 px를 넘는 곳)을 문제로 돌려준다. 비어 있으면 통과 */
export function validateRoadSight(roads: readonly RoadLine[], sights: readonly Sight[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const road of roads) {
    for (const b of bareStretches(road, sights)) {
      if (b.length <= BARE_STRETCH_MAX) continue;
      issues.push({
        code: 'ROAD_BARE',
        path: `roads.${road.id}`,
        message: `길 ${road.id}의 ${Math.round(b.fromArc)}~${Math.round(b.toArc)} px 구간(${Math.round(b.length)} px)의 가운데 줄이나 가장자리에서 정거장이 들리지도 보이지도 않고 표지판이나 발견 요소도 없어요(${BARE_STRETCH_MAX} px 넘김): (${Math.round(b.start.x)}, ${Math.round(b.start.y)}) → (${Math.round(b.end.x)}, ${Math.round(b.end.y)})`,
      });
    }
  }
  return issues;
}
