// 8-5 공개 점검(13.3 G2): 정식 공개 빌드를 내보내도 되는지 기계가 볼 수 있는 조건(src/domain/release.ts, tools/release-facts.ts).
// 통과가 G2의 통과가 아님을 지킨다: 사람이 해야 하는 일의 목록은 결과와 상관없이 있다(D-9, D-13).
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { DEAD_END_RADIUS, deadEndsOf, parseDiscoveryFile } from '@/domain/discovery';
import type { DiscoveryFile, DiscoveryGeometry } from '@/domain/discovery';
import { HUMAN_RELEASE_STEPS, bareDeadEnds, evaluateReleaseGate } from '@/domain/release';
import type { ReleaseFacts } from '@/domain/release';
import type { RegionId } from '@/domain/world';
import { discoveryWorld, loadContent } from '../../tools/content-loader';
import { releaseFactsOf } from '../../tools/release-facts';
import { loadRegionDefs } from '../../tools/world-files';

const ROOT = path.resolve(__dirname, '../..');
const ready: ReleaseFacts = { questCount: 31, variantCount: 62, openQuests: 8, openVariants: 22, unconfirmed: [], lockProblems: [], deadEndCount: 8, bareDeadEnds: [] };

describe('evaluateReleaseGate', () => {
  it('막는 것이 없으면 통과한다', () => expect(evaluateReleaseGate(ready)).toEqual({ ok: true, blockers: [] }));
  it('열리는 과제가 하나도 없으면 막고, 전체 수를 알린다', () => {
    const r = evaluateReleaseGate({ ...ready, openQuests: 0, openVariants: 0 });
    expect(r.ok).toBe(false);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toContain('0개');
    expect(r.blockers[0]).toContain('31개');
    expect(r.blockers[0]).toContain('62개');
  });
  it('권리가 미확인인 대장 항목마다 막고, 공개를 막는 방법을 함께 적는다', () => {
    const r = evaluateReleaseGate({ ...ready, unconfirmed: [{ assetId: 'snd.x', gate: '사람이 듣고 승인한다' }, { assetId: 'img.y', gate: '' }] });
    expect(r.ok).toBe(false);
    expect(r.blockers[0]).toContain('snd.x');
    expect(r.blockers[0]).toContain('사람이 듣고 승인한다');
    expect(r.blockers[1]).toContain('img.y');
    expect(r.blockers[1]).toContain('적혀 있지 않아요');
  });
  it('내용 잠금이 어긋난 곳마다 막는다', () => {
    const r = evaluateReleaseGate({ ...ready, lockProblems: ['[LOCK_CHANGED] a: x', '[LOCK_MISSING] b: y'] });
    expect(r.ok).toBe(false);
    expect(r.blockers).toEqual(['내용 잠금: [LOCK_CHANGED] a: x', '내용 잠금: [LOCK_MISSING] b: y']);
  });
  it('공개 채널에서 보이는 발견 요소가 없는 막다른 길 끝마다 막고, 무엇을 공개하면 보이는지 함께 적는다', () => {
    const r = evaluateReleaseGate({
      ...ready,
      bareDeadEnds: [
        { regionId: 'village', x: 2952, y: 2475, nearestId: 'disc.sample', nearestPx: 150 },
        { regionId: 'key-marsh', x: 10, y: 20, nearestId: null, nearestPx: null },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.blockers).toHaveLength(2);
    expect(r.blockers[0]).toContain('village (2952, 2475)');
    expect(r.blockers[0]).toContain(`${DEAD_END_RADIUS} px 안`);
    expect(r.blockers[0]).toContain('disc.sample(150 px)');
    expect(r.blockers[0]).toContain('공개 상태가 되면 보여요');
    expect(r.blockers[1]).toContain('key-marsh (10, 20)');
    expect(r.blockers[1]).toContain('발견 요소가 하나도 없어요');
  });
  it('막는 것이 여럿이면 모두 알린다', () => {
    const r = evaluateReleaseGate({
      ...ready,
      openQuests: 0,
      openVariants: 0,
      unconfirmed: [{ assetId: 'a', gate: 'g' }],
      lockProblems: ['p'],
      bareDeadEnds: [{ regionId: 'village', x: 1, y: 2, nearestId: 'd', nearestPx: 3 }],
    });
    expect(r.blockers).toHaveLength(4);
  });
});

describe('bareDeadEnds: 공개 채널에서 보이는 발견 요소만으로 막다른 길 끝을 본다(3.4의 규칙 2, 7-7이 넘긴 일)', () => {
  const { geometry } = discoveryWorld(loadRegionDefs(ROOT));
  const files = loadContent(ROOT).discoveries.map((f) => {
    const { file } = parseDiscoveryFile(f.data, f.file);
    if (!file) throw new Error(`발견 요소 파일을 읽을 수 없어요: ${f.file}`);
    return file;
  });
  const endsOf = (g: DiscoveryGeometry | undefined) => (g ? deadEndsOf(g.roads, g.gates) : []);
  const total = Object.values(geometry).reduce((n, g) => n + endsOf(g).length, 0);
  /** 모든 발견 요소의 공개 상태를 정한 사본(지금 콘텐츠의 공개 상태와 상관없이 같은 결과가 나오게 한다) */
  const withState = (publishedIds: ReadonlySet<string> | 'all'): DiscoveryFile[] =>
    files.map((f) => ({ ...f, items: f.items.map((d) => ({ ...d, availability: publishedIds === 'all' || publishedIds.has(d.discoveryId) ? 'published' : 'draft' }) as typeof d) }));
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

  it('월드에 막다른 길 끝이 있고, 아무것도 공개하지 않으면 모두 비어 있다. 미리보기에서는 모두 DEAD_END 안에 발견 요소가 있다(검사 DEAD_END와 같은 뜻)', () => {
    expect(total).toBeGreaterThan(0);
    const bare = bareDeadEnds(withState(new Set()), geometry);
    expect(bare).toHaveLength(total);
    for (const b of bare) {
      expect(b.nearestId, `${b.regionId} (${b.x}, ${b.y})`).not.toBeNull();
      expect(b.nearestPx!, `${b.regionId} (${b.x}, ${b.y})의 가장 가까운 발견 요소`).toBeLessThanOrEqual(DEAD_END_RADIUS + 1); // 좌표를 반올림해서 1 px 여유
    }
  });
  it('끝 가까이의 발견 요소 하나를 공개하면 그 끝이 채워지고, 멀리 있는 것을 공개해서는 채워지지 않는다', () => {
    const none = bareDeadEnds(withState(new Set()), geometry);
    const target = none[0]!;
    const near = files.find((f) => f.regionId === target.regionId)!.items.find((d) => d.discoveryId === target.nearestId)!;
    const after = bareDeadEnds(withState(new Set([near.discoveryId])), geometry);
    // 그 발견 요소가 DEAD_END 안에 드는 끝은 모두 채워진다(한 요소가 두 끝을 채울 수도 있다)
    const filled = none.filter((b) => b.regionId === near.regionId && distance(near, b) <= DEAD_END_RADIUS + 1);
    expect(filled.length).toBeGreaterThanOrEqual(1);
    expect(after).toHaveLength(none.length - filled.length);
    expect(after.some((b) => b.regionId === target.regionId && b.x === target.x && b.y === target.y)).toBe(false);
    // 같은 지역에서 이 끝에서 먼 발견 요소만 공개하면 이 끝은 그대로 비어 있다
    const far = files.find((f) => f.regionId === target.regionId)!.items.filter((d) => distance(d, target) > DEAD_END_RADIUS + 1);
    expect(far.length).toBeGreaterThan(0);
    const stillBare = bareDeadEnds(withState(new Set(far.map((d) => d.discoveryId))), geometry);
    expect(stillBare.some((b) => b.regionId === target.regionId && b.x === target.x && b.y === target.y)).toBe(true);
  });
  it('다른 지역의 발견 요소는 세지 않는다: 한 지역의 것을 모두 공개해도 다른 지역의 끝은 비어 있다', () => {
    const regionId: RegionId = 'village';
    const ids = new Set(files.find((f) => f.regionId === regionId)!.items.map((d) => d.discoveryId));
    const bare = bareDeadEnds(withState(ids), geometry);
    expect(bare.some((b) => b.regionId === regionId)).toBe(false);
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.every((b) => b.regionId !== regionId)).toBe(true);
  });
  it('반지름의 경계: DEAD_END_RADIUS보다 1 px 안의 공개된 요소는 끝을 채우고 1 px 밖의 것은 채우지 못한다', () => {
    const regionId: RegionId = 'village';
    const g = geometry[regionId]!;
    const end = deadEndsOf(g.roads, g.gates)[0]!;
    const base = files.find((f) => f.regionId === regionId)!.items[0]!;
    const only = { [regionId]: g } as Partial<Record<RegionId, DiscoveryGeometry>>;
    const placed = (dist: number): DiscoveryFile[] => [{ regionId, items: [{ ...base, x: end.x + dist, y: end.y, availability: 'published' } as typeof base] }];
    const isThisEnd = (b: { x: number; y: number }): boolean => b.x === Math.round(end.x) && b.y === Math.round(end.y);
    expect(bareDeadEnds(placed(DEAD_END_RADIUS - 1), only).some(isThisEnd)).toBe(false);
    expect(bareDeadEnds(placed(DEAD_END_RADIUS + 1), only).some(isThisEnd)).toBe(true);
  });
  it('모두 공개하면 비고, 발견 요소 파일이 없는 지역은 끝이 모두 비어 있다(가까운 것도 없다)', () => {
    expect(bareDeadEnds(withState('all'), geometry)).toEqual([]);
    const none = bareDeadEnds([], geometry);
    expect(none).toHaveLength(total);
    expect(none.every((b) => b.nearestId === null && b.nearestPx === null)).toBe(true);
  });
});

describe('사람이 해야 하는 일', () => {
  it('통과 여부와 상관없이 있고, 관찰·음악 검수·권리·접근성·기준 기기·법률·공개 승인을 모두 말한다', () => {
    const joined = HUMAN_RELEASE_STEPS.join('\n');
    for (const word of ['G1', '음악 검수', '음색', '권리 확인', '접근성', '기준 기기', '법률', '공개 승인', 'snd.music.world-parts']) expect(joined, word).toContain(word);
    expect(HUMAN_RELEASE_STEPS.length).toBe(8);
  });
});

describe('실제 콘텐츠에서 모은 사실', () => {
  const facts = releaseFactsOf(ROOT);
  const defs = loadContent(ROOT).quests.map((f) => f.data as QuestDefinition);
  it('과제와 판본의 수가 콘텐츠 파일과 같다', () => {
    expect(facts.questCount).toBe(defs.length);
    expect(facts.variantCount).toBe(defs.reduce((n, d) => n + Object.keys(d.variants).length, 0));
  });
  it('공개 채널에서 열리는 수는 앱의 목록(ContentCatalog, release)이 여는 수와 같다', () => {
    const catalog = new ContentCatalog(defs, 'release');
    const entries = catalog.list();
    expect(facts.openQuests).toBe(entries.filter((e) => e.variants.some((v) => v.state === 'open')).length);
    expect(facts.openVariants).toBe(entries.reduce((n, e) => n + e.variants.filter((v) => v.state === 'open').length, 0));
  });
  it('열리는 과제가 하나도 없는 동안은 공개 점검이 막는다(검수를 마친 과제가 생기면 이 시험이 먼저 알려 준다)', () => {
    const r = evaluateReleaseGate({ ...facts, unconfirmed: [], lockProblems: [] });
    expect(r.ok).toBe(facts.openQuests > 0);
  });
  it('대장의 미확인 항목은 모두 공개를 막는 방법이 적혀 있다', () => {
    for (const u of facts.unconfirmed) expect(u.gate.length, u.assetId).toBeGreaterThan(20);
  });
  it('막다른 길 끝의 수와 공개 채널에서 빈 끝은 월드의 길과 발견 요소 파일에서 따로 센 값과 같다', () => {
    const { geometry } = discoveryWorld(loadRegionDefs(ROOT));
    const files = loadContent(ROOT).discoveries.map((f) => parseDiscoveryFile(f.data, f.file).file as DiscoveryFile);
    const ends = Object.values(geometry).flatMap((g) => (g ? deadEndsOf(g.roads, g.gates) : []));
    expect(facts.deadEndCount).toBe(ends.length);
    // 공개 상태(availability가 published)인 발견 요소만 센다. 지금은 하나도 없어서 모두 비어 있다 — 공개하는 것이 생기면 이 시험이 아니라 점검의 알림이 바뀐다
    const shown = files.flatMap((f) => f.items.filter((d) => d.availability === 'published'));
    const expected = Object.entries(geometry)
      .flatMap(([regionId, g]) =>
        (g ? deadEndsOf(g.roads, g.gates) : [])
          .filter((e) => !shown.some((d) => d.regionId === regionId && Math.hypot(d.x - e.x, d.y - e.y) <= DEAD_END_RADIUS))
          .map((e) => `${regionId} ${Math.round(e.x)} ${Math.round(e.y)}`),
      )
      .sort();
    expect(facts.bareDeadEnds.map((b) => `${b.regionId} ${b.x} ${b.y}`).sort()).toEqual(expected);
  });
});
