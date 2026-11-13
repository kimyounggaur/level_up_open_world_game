// 월드에서 발견 요소를 열었을 때 앱이 하는 일(app/discover.ts): 처음 찾았을 때만 적고 알리며, 월드가 그릴 것을 다리에 올린다.
import { describe, expect, it, vi } from 'vitest';
import { Creations } from '@/app/creations';
import { Discoverer } from '@/app/discover';
import { loadDiscoveries } from '@/app/discovery-data';
import { FoundDiscoveries } from '@/app/found';
import { foundNews, isConceptNote } from '@/domain/discovery';
import type { DiscoveryDef } from '@/domain/discovery';
import { WorldBridge } from '@/platform/bridge';
import { songsOf } from './controller-rig';

const defs: DiscoveryDef[] = loadDiscoveries('preview');
const P = (n: number): string => `disc.village.piece-${n}`;
const N = (n: number): string => `disc.village.note-${n}`;

function rig(over: { found?: string[]; creations?: ReturnType<typeof songsOf>; discoveries?: DiscoveryDef[] } = {}) {
  const found = new FoundDiscoveries(over.found ?? []);
  const creations = new Creations(over.creations ?? []);
  const bridge = new WorldBridge({ x: 4056, y: 3300, facing: 'down' });
  const previewPiece = vi.fn((_id: string) => true);
  const announce = vi.fn<(lines: readonly string[]) => void>();
  const onFound = vi.fn<(id: string) => void>();
  const d = new Discoverer({ discoveries: over.discoveries ?? defs, found, creations, melody: { previewPiece }, bridge, announce, onFound });
  return { d, found, creations, bridge, previewPiece, announce, onFound };
}

describe('열기(open)', () => {
  it('소리 조각을 처음 열면 적고, 사용 기록과 알림을 한 번씩 남기고, 들려 준다', () => {
    const t = rig();
    const out = t.d.open(P(2));
    expect(out).toEqual({ kind: 'piece', discoveryId: P(2), first: true });
    expect(t.found.has(P(2))).toBe(true);
    expect(t.onFound).toHaveBeenCalledTimes(1);
    expect(t.onFound).toHaveBeenCalledWith(P(2));
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.announce).toHaveBeenCalledWith(foundNews(defs.find((x) => x.discoveryId === P(2))!));
    expect(t.previewPiece).toHaveBeenCalledWith(P(2));
  });

  it('다시 열면 first가 거짓이고 적지도 알리지도 않지만 다시 들려 준다', () => {
    const t = rig();
    t.d.open(P(1));
    const out = t.d.open(P(1));
    expect(out).toEqual({ kind: 'piece', discoveryId: P(1), first: false });
    expect(t.onFound).toHaveBeenCalledTimes(1);
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.previewPiece).toHaveBeenCalledTimes(2);
  });

  it('저장에서 읽은 찾은 것은 처음이 아니다', () => {
    const t = rig({ found: [P(3)] });
    expect(t.d.open(P(3))).toMatchObject({ first: false });
    expect(t.onFound).not.toHaveBeenCalled();
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('개념 쪽지는 글을 돌려주고 소리는 내지 않는다. 처음 찾았을 때만 알린다', () => {
    const t = rig();
    const out = t.d.open(N(1))!;
    expect(out.kind).toBe('note');
    if (out.kind !== 'note') return;
    expect(out.first).toBe(true);
    expect(isConceptNote(out.note)).toBe(true);
    expect(out.note.discoveryId).toBe(N(1));
    expect(t.previewPiece).not.toHaveBeenCalled();
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.d.open(N(1))).toMatchObject({ kind: 'note', first: false });
    expect(t.announce).toHaveBeenCalledTimes(1);
  });

  it('이 판에 없는 id는 null이고 아무것도 적지 않는다', () => {
    const t = rig();
    expect(t.d.open('disc.village.piece-99')).toBeNull();
    expect(t.d.open('')).toBeNull();
    expect(t.found.size).toBe(0);
    expect(t.onFound).not.toHaveBeenCalled();
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('판에서 빠진 요소(저장에만 남은 id)는 열 수 없다. 이미 적힌 기록은 그대로다', () => {
    const only = defs.filter((x) => x.discoveryId !== P(4));
    const t = rig({ found: [P(4)], discoveries: only });
    expect(t.d.open(P(4))).toBeNull();
    expect(t.found.has(P(4))).toBe(true);
  });

  it('찾은 것은 하나씩만 센다: 여러 개를 열어도 서로 영향이 없다', () => {
    const t = rig();
    for (const id of [P(1), P(2), N(1), P(1), N(2)]) t.d.open(id);
    expect(t.found.toArray()).toEqual([N(1), N(2), P(1), P(2)].sort());
    expect(t.onFound).toHaveBeenCalledTimes(4);
  });
});

describe('월드 다리와의 동기', () => {
  it('만들 때 지금 값을 먼저 올린다(월드가 늦게 켜져도 읽을 수 있다)', () => {
    const t = rig({ found: [P(1), N(2)], creations: songsOf(3) });
    expect([...t.bridge.found.get()].sort()).toEqual([N(2), P(1)].sort());
    expect(t.bridge.board.get()).toEqual(t.creations.list().map((c) => c.creationId));
  });

  it('찾으면 다리의 찾은 것이 늘어난다', () => {
    const t = rig();
    const seen: number[] = [];
    t.bridge.found.subscribe((s) => seen.push(s.size));
    t.d.open(P(1));
    t.d.open(P(1));
    t.d.open(N(3));
    expect(seen).toEqual([1, 2]);
  });

  it('저장한 곡이 늘고 줄면 게시판 id가 따라간다', () => {
    const t = rig();
    expect(t.bridge.board.get()).toEqual([]);
    const r = t.creations.save({ name: '새 곡', installationId: 'inst.village.ensemble-stage', events: songsOf(1)[0]!.events, createdAt: '2026-11-11T00:00:00.000Z' });
    expect(r.ok).toBe(true);
    expect(t.bridge.board.get()).toHaveLength(1);
    t.creations.remove(t.creations.list()[0]!.creationId);
    expect(t.bridge.board.get()).toEqual([]);
  });

  it('dispose 뒤에는 열어도 null이고 다리를 더 건드리지 않는다', () => {
    const t = rig();
    t.d.dispose();
    expect(t.d.open(P(1))).toBeNull();
    t.found.mark(P(2));
    expect([...t.bridge.found.get()]).toEqual([]);
    expect(t.onFound).not.toHaveBeenCalled();
  });
});
