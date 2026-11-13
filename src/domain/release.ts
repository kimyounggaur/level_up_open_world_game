// 8-5 공개 점검(13.3 G2, 11.4): 정식 공개(release) 빌드를 내보내도 되는지, 기계가 볼 수 있는 조건만 센다.
// 이 점검이 통과해도 G2가 통과한 것이 아니다. 관찰, 음악 검수, 교재 대조와 권리 확인, 낭독기, 실기기, 법률 검토는 사람이 하고
// 기록으로 남지 않는 것이 많아 이 점검이 대신하지 않는다(D-9, D-13). 그래서 결과에 사람이 해야 하는 일의 목록(HUMAN_RELEASE_STEPS)을 늘 함께 낸다.
import { DEAD_END_RADIUS, deadEndsOf, visibleDiscoveries } from './discovery';
import type { DiscoveryFile, DiscoveryGeometry } from './discovery';
import type { RegionId } from './world';

/** 정식 공개 채널에서 보이는 발견 요소가 가까이에 없는 막다른 길의 끝 하나 */
export interface BareDeadEnd {
  regionId: string;
  x: number;
  y: number;
  /** 공개 여부와 상관없이 이 끝에서 가장 가까운 발견 요소(무엇을 공개하면 채워지는지 알리려고 적는다). 지역에 발견 요소가 없으면 null */
  nearestId: string | null;
  nearestPx: number | null;
}

/**
 * 막다른 길의 끝마다, 정식 공개(release)에서 보이는 발견 요소(공개 상태인 것)가 DEAD_END_RADIUS 안에 있는지 보아 없는 끝을 돌려준다.
 * 3.4의 규칙 2("막다른 길 끝에는 볼거리가 있다")의 검사(DEAD_END)는 공개 상태와 상관없이 파일 전체를 보므로,
 * 발견 요소가 공개되기 전의 공개 채널은 따로 센다(7-7이 8-5로 넘긴 일).
 */
export function bareDeadEnds(files: readonly DiscoveryFile[], geometry: Partial<Record<RegionId, DiscoveryGeometry>>): BareDeadEnd[] {
  const out: BareDeadEnd[] = [];
  // 길이 있는 지역마다 본다. 발견 요소 파일이 없는 지역은 발견 요소가 하나도 없는 것으로 본다(끝이 모두 빈다)
  for (const [regionId, g] of Object.entries(geometry) as Array<[RegionId, DiscoveryGeometry | undefined]>) {
    if (!g) continue;
    const f = files.find((x) => x.regionId === regionId);
    const shown = f ? visibleDiscoveries([f], 'release') : [];
    for (const end of deadEndsOf(g.roads, g.gates)) {
      if (shown.some((d) => Math.hypot(d.x - end.x, d.y - end.y) <= DEAD_END_RADIUS)) continue;
      let nearestId: string | null = null;
      let nearestPx: number | null = null;
      for (const d of f?.items ?? []) {
        const dist = Math.hypot(d.x - end.x, d.y - end.y);
        if (nearestPx === null || dist < nearestPx) {
          nearestPx = dist;
          nearestId = d.discoveryId;
        }
      }
      out.push({ regionId, x: Math.round(end.x), y: Math.round(end.y), nearestId, nearestPx: nearestPx === null ? null : Math.round(nearestPx) });
    }
  }
  return out;
}

export interface ReleaseFacts {
  questCount: number;
  variantCount: number;
  /** 정식 공개 채널에서 열리는(공개 상태인) 과제와 판본의 수 */
  openQuests: number;
  openVariants: number;
  /** 출처·권리 대장에서 권리가 미확인인 항목과 공개를 막는 방법(gate) */
  unconfirmed: ReadonlyArray<{ assetId: string; gate: string }>;
  /** 내용 잠금(8-6)과 지금 콘텐츠가 어긋난 곳. 잠금이 없는 것도 하나로 센다 */
  lockProblems: readonly string[];
  /** 월드의 막다른 길 끝의 수와, 그 가운데 공개 채널에서 보이는 발견 요소가 가까이에 없는 끝(3.4의 규칙 2) */
  deadEndCount: number;
  bareDeadEnds: readonly BareDeadEnd[];
}

export interface ReleaseGate {
  ok: boolean;
  /** 공개 빌드를 막는 것. 비어 있어야 `build:release`가 진행된다 */
  blockers: string[];
}

export function evaluateReleaseGate(f: ReleaseFacts): ReleaseGate {
  const blockers: string[] = [];
  if (f.openQuests === 0) {
    blockers.push(`공개 채널에서 열리는 과제가 0개예요(전체 ${f.questCount}개, 판본 ${f.variantCount}개가 모두 '준비 중'). 검수를 마친 과제만 availability를 'published'로 바꿔요`);
  }
  for (const u of f.unconfirmed) blockers.push(`권리가 미확인인 대장 항목 ${u.assetId}: ${u.gate || '공개를 막는 방법이 적혀 있지 않아요'}`);
  for (const p of f.lockProblems) blockers.push(`내용 잠금: ${p}`);
  for (const d of f.bareDeadEnds) {
    const hint = d.nearestId === null ? '이 지역에는 발견 요소가 하나도 없어요' : `가장 가까운 ${d.nearestId}(${d.nearestPx} px)가 검수와 권리 확인을 마치고 공개 상태가 되면 보여요`;
    blockers.push(`막다른 길 끝 ${d.regionId} (${d.x}, ${d.y})에 공개 채널에서 보이는 발견 요소가 없어요(3.4의 규칙 2, ${DEAD_END_RADIUS} px 안). ${hint}`);
  }
  return { ok: blockers.length === 0, blockers };
}

/** 이 점검이 대신하지 않는 일. 점검이 통과해도 이 목록은 그대로 사람이 한다(13.2, 13.3, 11.1, D-4, D-5) */
export const HUMAN_RELEASE_STEPS: readonly string[] = [
  '사용 관찰 G1(13.2): 대상 이용자 5–8명, 가설 H1–H5',
  '음악 검수(D-4): 공개할 과제의 악보·재생음·판정을 사람이 나란히 보고 듣는다. 광장 합주·지역 바탕 소리·정거장 서명 소리·소리 조각·놀이 악기의 음과 가락을 듣고 승인한다(대장 snd.music.world-parts의 상태를 바꾸는 것이 승인이다)',
  '음색 듣기(D-5): 합성 음색 20개가 악기답게 들리는지',
  '교재 대조와 권리 확인: 출처 기록의 reviewStatus와 rightsStatus, 교재 폴더 사본 가운데 원본 정하기, Q08 곡의 작곡 권리',
  '접근성 사람 점검(7.9): 화면 낭독기, 실제 브라우저 확대, 실기기 터치, 무채색 화면 눈으로 보기',
  '기준 기기 점검(10.8)과 프레임 수(10.7): 기준 기기를 정하는 일(D-2)이 먼저다',
  '호스팅 설정과 법률 검토: 접속 분석 끄기, 접속 기록 보관 기간, 개인정보 보호법 적용 여부(docs/hosting.md, docs/privacy-flow.md)',
  '공개 승인(11.1의 9단계)',
];
