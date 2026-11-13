// 5-6 발견 요소(설계서 3.6): 읽기와 검사 규칙, 보이는 목록, 들림 크기. 실제 content/discoveries/village.json이 규칙을 지키는지도 확인한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentIssue } from '@/domain/content';
import {
  CONCEPT_NOTES_PER_REGION,
  DEAD_END_RADIUS,
  MIN_SPACING,
  PIECE_BAR_TICKS,
  PIECE_HEAR_RADIUS,
  PENTATONIC_PITCH_CLASSES,
  SOUND_PIECES_PER_REGION,
  deadEndsOf,
  describePiece,
  distanceToRoads,
  isConceptNote,
  isSoundPiece,
  lampIndexOf,
  parseDiscoveryFile,
  pieceHearGain,
  pieceNoteName,
  piecePlayback,
  PIECE_TEMPO_BPM,
  validateDiscoveries,
  visibleDiscoveries,
} from '@/domain/discovery';
import type { ConceptNoteDef, DiscoveryContext, DiscoveryDef, DiscoveryFile, DiscoveryGeometry, SoundPieceDef } from '@/domain/discovery';
import { validateContentDir } from '../../tools/content-loader';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const codes = (issues: ContentIssue[]): string[] => issues.map((i) => i.code);

// ───── 시험용 마을: 가로 길 두 줄, 3×3 격자 위의 발견 요소 아홉 개(600 px 간격) ─────
const COLS = [3000, 3600, 4200];
const ROWS = [2400, 3000, 3600];
const roads = [
  { id: 'upper', width: 80, points: [{ x: 3000, y: 2400 }, { x: 4200, y: 2400 }] },
  { id: 'lower', width: 80, points: [{ x: 3000, y: 3000 }, { x: 4200, y: 3000 }] },
];
const geometry = (over: Partial<DiscoveryGeometry> = {}): DiscoveryGeometry => ({ roads, gates: [], reachable: () => true, ...over });
const ctx = (over: Partial<DiscoveryContext> = {}): DiscoveryContext => ({
  questIds: new Set(['chord.major-triad', 'rhythm.rest-in-a-bar']),
  geometry: { village: geometry() },
  bounds: { village: { x0: 2000, y0: 2000, x1: 6000, y1: 4200 } },
  ...over,
});

const base = {
  regionId: 'village' as const,
  availability: 'draft' as const,
  reviewStatus: 'unreviewed' as const,
  rightsStatus: 'unconfirmed' as const,
};
const piece = (n: number, x: number, y: number, over: Partial<SoundPieceDef> = {}): SoundPieceDef => ({
  ...base,
  kind: 'soundPiece',
  discoveryId: `disc.village.piece-${n}`,
  name: `조각 ${n}`,
  x,
  y,
  notes: [
    { midi: 60, onsetTicks: 0, durationTicks: 960 },
    { midi: 62, onsetTicks: 960, durationTicks: 960 },
  ],
  ...over,
});
const conceptNote = (n: number, x: number, y: number, over: Partial<ConceptNoteDef> = {}): ConceptNoteDef => ({
  ...base,
  kind: 'conceptNote',
  discoveryId: `disc.village.note-${n}`,
  name: `쪽지 ${n}`,
  x,
  y,
  text: '짧은 설명이에요.',
  questId: 'chord.major-triad',
  textbookRefs: [{ sourceFileId: 'file-1', originalFilename: '029-1.png', reviewStatus: 'unreviewed', rightsStatus: 'unconfirmed' }],
  ...over,
});
/** 격자 아홉 칸 가운데 앞 여섯은 소리 조각, 뒤 셋은 개념 쪽지. 줄 0·1은 길에서 가깝고 줄 2는 멀다(6/9 = 67%) */
function goodItems(): DiscoveryDef[] {
  const spots = ROWS.flatMap((y) => COLS.map((x) => ({ x, y })));
  return spots.map((s, i) => (i < 6 ? piece(i + 1, s.x, s.y) : conceptNote(i - 5, s.x, s.y)));
}
const goodFile = (): DiscoveryFile => ({ regionId: 'village', items: goodItems() });
const withItem = (index: number, over: Record<string, unknown>): DiscoveryFile => {
  const items = goodItems();
  items[index] = { ...items[index]!, ...over } as DiscoveryDef;
  return { regionId: 'village', items };
};
const check = (file: DiscoveryFile, c: DiscoveryContext = ctx()): string[] => codes(validateDiscoveries([file], c));

describe('발견 요소 읽기(parseDiscoveryFile)', () => {
  const raw = (): Record<string, any> => JSON.parse(JSON.stringify(goodFile()));
  it('올바른 파일은 문제 없이 읽힌다', () => {
    const r = parseDiscoveryFile(raw(), 'village.json');
    expect(r.issues).toEqual([]);
    expect(r.file?.items).toHaveLength(9);
    expect(r.file?.items.filter(isSoundPiece)).toHaveLength(SOUND_PIECES_PER_REGION);
    expect(r.file?.items.filter(isConceptNote)).toHaveLength(CONCEPT_NOTES_PER_REGION);
  });
  it('객체가 아니거나 지역 id가 틀리면 file이 null이다', () => {
    expect(parseDiscoveryFile([], 'a.json').file).toBeNull();
    expect(codes(parseDiscoveryFile({ regionId: 'moon', items: [] }, 'a.json').issues)).toEqual(['REGION_ID']);
    expect(codes(parseDiscoveryFile({ regionId: 'village', items: {} }, 'a.json').issues)).toEqual(['SHAPE']);
  });
  it('항목의 형식이 틀리면 알려 주고 file은 null이다', () => {
    const bad = (mutate: (r: Record<string, any>) => void): string[] => {
      const r = raw();
      mutate(r);
      const out = parseDiscoveryFile(r, 'village.json');
      expect(out.file).toBeNull();
      return codes(out.issues);
    };
    expect(bad((r) => (r['items'][0].discoveryId = 'village-1'))).toContain('ID_FORMAT');
    expect(bad((r) => (r['items'][0].kind = 'poster'))).toContain('KIND');
    expect(bad((r) => (r['items'][0].name = ''))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].name = '가'.repeat(21)))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].x = 'a'))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].availability = 'public'))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].reviewStatus = 'ok'))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].rightsStatus = 'ok'))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].notes = 'x'))).toContain('SHAPE');
    expect(bad((r) => (r['items'][0].notes[0] = { midi: 60 }))).toContain('SHAPE');
    expect(bad((r) => delete r['items'][6].text)).toContain('SHAPE');
    expect(bad((r) => delete r['items'][6].questId)).toContain('SHAPE');
    expect(bad((r) => (r['items'][6].textbookRefs = [{ sourceFileId: 'f' }]))).toContain('SHAPE');
    expect(bad((r) => (r['items'][6].textbookRefs[0].rightsStatus = 'yes'))).toContain('SHAPE');
  });
  it('이름과 글은 앞뒤 빈칸을 잘라 읽는다', () => {
    const r = raw();
    r['items'][0].name = '  첫걸음 ';
    r['items'][6].text = ' 쪽지 글 ';
    const out = parseDiscoveryFile(r, 'village.json').file!;
    expect(out.items[0]!.name).toBe('첫걸음');
    expect((out.items[6] as ConceptNoteDef).text).toBe('쪽지 글');
  });
});

describe('발견 요소 검사(validateDiscoveries)', () => {
  it('규칙을 지킨 시험용 마을은 문제가 없다', () => {
    expect(validateDiscoveries([goodFile()], ctx())).toEqual([]);
    // 맥락이 없으면 형식 검사만 한다
    expect(validateDiscoveries([goodFile()])).toEqual([]);
  });

  it('지역마다 소리 조각 6, 개념 쪽지 3이어야 한다', () => {
    const f = goodFile();
    f.items.pop();
    expect(check(f)).toContain('COUNT');
    const g = goodFile();
    g.items[0] = conceptNote(4, 3000, 2400);
    expect(codes(validateDiscoveries([g]))).toEqual(['COUNT', 'COUNT']);
  });

  describe('소리 조각의 틀(다장조 5음 · 4/4 한 마디)', () => {
    const pieceWith = (notes: SoundPieceDef['notes']): string[] => check(withItem(0, { notes }));
    it('5음 음계 밖의 음은 안 된다', () => {
      expect(pieceWith([{ midi: 65, onsetTicks: 0, durationTicks: 960 }])).toContain('PIECE_SCALE');
      expect(pieceWith([{ midi: 61, onsetTicks: 0, durationTicks: 960 }])).toContain('PIECE_SCALE');
      for (const pc of PENTATONIC_PITCH_CLASSES) expect(pieceWith([{ midi: 60 + pc, onsetTicks: 0, durationTicks: 960 }])).toEqual([]);
    });
    it('C3~C6 밖의 음은 안 된다', () => {
      expect(pieceWith([{ midi: 36, onsetTicks: 0, durationTicks: 960 }])).toContain('PIECE_RANGE');
      expect(pieceWith([{ midi: 96, onsetTicks: 0, durationTicks: 960 }])).toContain('PIECE_RANGE');
      expect(pieceWith([{ midi: 48, onsetTicks: 0, durationTicks: 960 }])).toEqual([]);
      expect(pieceWith([{ midi: 84, onsetTicks: 0, durationTicks: 960 }])).toEqual([]);
    });
    it('길이는 8분·4분·2분·온음표, 시작은 8분음표 단위', () => {
      expect(pieceWith([{ midi: 60, onsetTicks: 0, durationTicks: 240 }])).toContain('PIECE_LENGTH');
      expect(pieceWith([{ midi: 60, onsetTicks: 0, durationTicks: 1440 }])).toContain('PIECE_LENGTH');
      expect(pieceWith([{ midi: 60, onsetTicks: 200, durationTicks: 960 }])).toContain('PIECE_ONSET');
      expect(pieceWith([{ midi: 60, onsetTicks: -480, durationTicks: 960 }])).toContain('PIECE_ONSET');
      for (const d of [480, 960, 1920, 3840]) expect(pieceWith([{ midi: 60, onsetTicks: 0, durationTicks: d }])).toEqual([]);
    });
    it('음이 겹치거나 한 마디를 넘으면 안 된다', () => {
      expect(
        pieceWith([
          { midi: 60, onsetTicks: 0, durationTicks: 1920 },
          { midi: 62, onsetTicks: 960, durationTicks: 960 },
        ]),
      ).toContain('PIECE_OVERLAP');
      expect(pieceWith([{ midi: 60, onsetTicks: 2880, durationTicks: 1920 }])).toContain('PIECE_BAR');
      expect(pieceWith([{ midi: 60, onsetTicks: PIECE_BAR_TICKS - 960, durationTicks: 960 }])).toEqual([]);
    });
    it('음이 없거나 여덟 개를 넘으면 안 된다', () => {
      expect(pieceWith([])).toContain('PIECE_EMPTY');
      const nine = Array.from({ length: 9 }, (_, i) => ({ midi: 60, onsetTicks: i * 480, durationTicks: 480 }));
      expect(pieceWith(nine)).toContain('PIECE_LONG');
      expect(pieceWith(nine.slice(0, 8))).toEqual([]);
    });
  });

  describe('개념 쪽지', () => {
    it('140자를 넘기면 안 된다', () => {
      expect(check(withItem(6, { text: '가'.repeat(141) }))).toContain('NOTE_LONG');
      expect(check(withItem(6, { text: '가'.repeat(140) }))).toEqual([]);
    });
    it('교재의 해당 쪽과 이어져야 한다(출처 추적)', () => {
      expect(check(withItem(6, { textbookRefs: [] }))).toContain('NOTE_SOURCE');
    });
    it('없는 과제를 가리키면 안 된다', () => {
      expect(check(withItem(6, { questId: 'no.such.quest' }))).toContain('REF_QUEST');
      // 과제 목록이 없으면 연결을 검사하지 않는다
      expect(codes(validateDiscoveries([withItem(6, { questId: 'no.such.quest' })], { ...ctx(), questIds: undefined }))).toEqual([]);
    });
  });

  it('id가 겹치거나 지역·종류가 id와 다르면 안 된다', () => {
    expect(check(withItem(1, { discoveryId: 'disc.village.piece-1' }))).toContain('DUP_ID');
    expect(check(withItem(0, { discoveryId: 'disc.staff-hill.piece-1' }))).toContain('ID_REGION');
    expect(check(withItem(0, { discoveryId: 'disc.village.note-9' }))).toContain('ID_KIND');
    expect(check(withItem(0, { regionId: 'staff-hill' }))).toContain('ID_REGION');
  });

  it('공개 상태인데 검수나 권리가 끝나지 않았으면 안 된다(G2 일곱째)', () => {
    expect(check(withItem(0, { availability: 'published' }))).toContain('PUBLISHED_UNREVIEWED');
    expect(check(withItem(0, { availability: 'published', reviewStatus: 'reviewed' }))).toContain('PUBLISHED_UNREVIEWED');
    expect(check(withItem(0, { availability: 'published', reviewStatus: 'reviewed', rightsStatus: 'confirmed' }))).toEqual([]);
    // 쪽지는 교재 쪽의 검수·권리까지 끝나야 한다
    const ok = { availability: 'published', reviewStatus: 'reviewed', rightsStatus: 'confirmed' };
    expect(check(withItem(6, ok))).toContain('PUBLISHED_UNREVIEWED');
    const refsDone = [{ sourceFileId: 'f', originalFilename: '029-1.png', reviewStatus: 'reviewed', rightsStatus: 'confirmed' }];
    expect(check(withItem(6, { ...ok, textbookRefs: refsDone }))).toEqual([]);
  });

  it('지역 안이고 걸어서 닿는 곳이어야 한다', () => {
    expect(check(withItem(0, { x: 1000 }))).toContain('OUTSIDE');
    expect(check(withItem(0, { y: 4200 }))).toContain('OUTSIDE');
    const blocked = geometry({ reachable: (x, y) => !(x === 3000 && y === 2400) });
    expect(check(goodFile(), ctx({ geometry: { village: blocked } }))).toEqual(['UNREACHABLE']);
  });

  it('서로 500 px 이상 떨어져야 한다', () => {
    const f = withItem(1, { x: 3000 + MIN_SPACING - 1, y: 2400 });
    expect(check(f)).toContain('SPACING');
    // 딱 500 px이면 지킨 것이다(다른 규칙은 건드리지 않게 줄 0의 첫 두 칸만 옮긴다)
    const g = withItem(1, { x: 3000 + MIN_SPACING, y: 2400 });
    expect(check(g)).not.toContain('SPACING');
  });

  it('길 300 px 안의 몫이 60%에서 ±10%p 안이어야 한다', () => {
    // 줄 2를 길 쪽으로 당기면 9/9, 줄 1까지 길에서 멀리 보내면 3/9
    const all = goodFile();
    const farGeometry = geometry({ roads: [{ id: 'far', width: 80, points: [{ x: 3000, y: 2400 }, { x: 3000, y: 2500 }] }] });
    expect(check(all, ctx({ geometry: { village: farGeometry } }))).toContain('ROAD_SHARE');
    const everything = geometry({ roads: [...roads, { id: 'third', width: 80, points: [{ x: 3000, y: 3600 }, { x: 4200, y: 3600 }] }] });
    expect(check(all, ctx({ geometry: { village: everything } }))).toContain('ROAD_SHARE');
    // 5/9(56%)와 6/9(67%)는 모두 지킨 것이다
    const five = geometry({ roads: [roads[0]!, { id: 'short', width: 80, points: [{ x: 3000, y: 3000 }, { x: 3600, y: 3000 }] }] });
    expect(check(all, ctx({ geometry: { village: five } }))).not.toContain('ROAD_SHARE');
  });

  // 아래 길(y=3000)의 가운데에서 위로 뻗다 (3300, 2700)에서 끝나는 샛길. 어느 발견 요소와도 400 px 넘게 떨어져 있고, 길 가까이 몫(6/9)은 그대로다
  const spur = { id: 'spur', width: 60, points: [{ x: 3300, y: 3000 }, { x: 3300, y: 2700 }] };
  it('막다른 샛길의 끝에는 발견 요소가 하나 있어야 한다', () => {
    const withDeadEnd = geometry({ roads: [...roads, spur] });
    expect(check(goodFile(), ctx({ geometry: { village: withDeadEnd } }))).toEqual(['DEAD_END']);
    // 끝에서 200 px 안에 발견 요소가 있으면 지킨 것이다
    const items = goodItems();
    items[1] = { ...items[1]!, x: 3300, y: 2700 - DEAD_END_RADIUS + 1 } as DiscoveryDef;
    const nearEnd = { regionId: 'village' as const, items };
    expect(check(nearEnd, ctx({ geometry: { village: withDeadEnd } }))).not.toContain('DEAD_END');
    items[1] = { ...items[1]!, y: 2700 - DEAD_END_RADIUS - 1 } as DiscoveryDef;
    expect(check({ regionId: 'village', items }, ctx({ geometry: { village: withDeadEnd } }))).toContain('DEAD_END');
  });

  it('문 가까이서 끝나는 길은 막다른 길이 아니다', () => {
    const gate = geometry({ roads: [...roads, spur], gates: [{ x: 3300, y: 2500 }] });
    expect(check(goodFile(), ctx({ geometry: { village: gate } }))).toEqual([]);
  });

  it('지역이 달라도 서로 500 px 안에 두지 않는다', () => {
    const a = goodFile();
    const b: DiscoveryFile = {
      regionId: 'staff-hill',
      items: goodItems().map((d) => ({ ...d, regionId: 'staff-hill', discoveryId: d.discoveryId.replace('village', 'staff-hill') }) as DiscoveryDef),
    };
    const issues = codes(validateDiscoveries([a, b]));
    expect(issues.filter((c) => c === 'SPACING').length).toBeGreaterThan(0);
  });
});

describe('길 기하', () => {
  it('길 가운데 선까지의 거리를 잰다', () => {
    expect(distanceToRoads(roads, { x: 3500, y: 2400 })).toBe(0);
    expect(distanceToRoads(roads, { x: 3500, y: 2700 })).toBe(300);
    expect(distanceToRoads(roads, { x: 2900, y: 2400 })).toBe(100);
    expect(distanceToRoads([], { x: 0, y: 0 })).toBe(Infinity);
    // 길이가 0인 점도 거리를 낸다
    expect(distanceToRoads([{ id: 'dot', width: 10, points: [{ x: 10, y: 10 }, { x: 10, y: 10 }] }], { x: 13, y: 14 })).toBe(5);
  });
  it('막다른 길의 끝을 찾는다', () => {
    const t = [
      { id: 'main', width: 80, points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] },
      { id: 'branch', width: 60, points: [{ x: 500, y: 20 }, { x: 500, y: 400 }] },
    ];
    // 샛길의 한쪽 끝은 큰길 위(막다른 길 아님), 다른 쪽 끝은 막다른 길, 큰길의 양 끝도 막다른 길이다
    expect(deadEndsOf(t, [])).toEqual(expect.arrayContaining([{ x: 500, y: 400 }, { x: 0, y: 0 }, { x: 1000, y: 0 }]));
    expect(deadEndsOf(t, [])).toHaveLength(3);
    // 문이 가까우면 빠진다
    expect(deadEndsOf(t, [{ x: 0, y: 100 }, { x: 1000, y: 0 }])).toEqual([{ x: 500, y: 400 }]);
  });
});

describe('쓰는 쪽을 위한 도우미', () => {
  const files = [goodFile()];
  it('미리보기에서는 모두, 정식 공개에서는 공개된 것만 보인다', () => {
    expect(visibleDiscoveries(files, 'preview')).toHaveLength(9);
    expect(visibleDiscoveries(files, 'release')).toEqual([]);
    const published = [withItem(2, { availability: 'published', reviewStatus: 'reviewed', rightsStatus: 'confirmed' })];
    expect(visibleDiscoveries(published, 'release').map((d) => d.discoveryId)).toEqual(['disc.village.piece-3']);
  });
  it('차례는 id의 숫자 순서다(piece-10이 piece-2 앞에 오지 않는다)', () => {
    const items = [piece(10, 0, 0), piece(2, 0, 0), conceptNote(1, 0, 0), piece(1, 0, 0)];
    expect(visibleDiscoveries([{ regionId: 'village', items }], 'preview').map((d) => d.discoveryId)).toEqual([
      'disc.village.note-1',
      'disc.village.piece-1',
      'disc.village.piece-2',
      'disc.village.piece-10',
    ]);
  });
  it('종류 판별과 등의 차례', () => {
    const items = goodItems();
    expect(items.filter(isSoundPiece)).toHaveLength(6);
    expect(items.filter(isConceptNote)).toHaveLength(3);
    const pieces = items.filter(isSoundPiece);
    expect(lampIndexOf(pieces, 'disc.village.piece-1')).toBe(0);
    expect(lampIndexOf(pieces, 'disc.village.piece-6')).toBe(5);
    expect(lampIndexOf(pieces, 'disc.village.note-1')).toBe(-1);
  });
  it('들림 크기: 600 px 밖은 0, 가까울수록 (1 − 거리/600)의 제곱', () => {
    expect(pieceHearGain(PIECE_HEAR_RADIUS)).toBe(0);
    expect(pieceHearGain(PIECE_HEAR_RADIUS + 1)).toBe(0);
    expect(pieceHearGain(0)).toBe(1);
    expect(pieceHearGain(300)).toBeCloseTo(0.25, 10);
    expect(pieceHearGain(-5)).toBe(1);
    expect(pieceHearGain(Number.NaN)).toBe(0);
    let last = 1;
    for (let d = 1; d < PIECE_HEAR_RADIUS; d += 25) {
      const g = pieceHearGain(d);
      expect(g).toBeLessThanOrEqual(last);
      expect(g).toBeGreaterThan(0);
      last = g;
    }
  });
  it('재생 내용: 한 마디 길이, 4분음표 80이다. 음마다 id와 틱이 조각의 음 그대로다', () => {
    const pb = piecePlayback({ notes: [{ midi: 60, onsetTicks: 0, durationTicks: 960 }, { midi: 67, onsetTicks: 1920, durationTicks: 1920 }] });
    expect(pb.lengthTicks).toBe(PIECE_BAR_TICKS);
    expect(pb.tempoBpm).toBe(PIECE_TEMPO_BPM);
    expect(PIECE_TEMPO_BPM).toBe(80);
    expect(pb.tempoReference).toBe('quarter');
    expect(pb.notes).toEqual([
      { id: 'piece-1', midi: 60, onsetTick: 0, durationTick: 960 },
      { id: 'piece-2', midi: 67, onsetTick: 1920, durationTick: 1920 },
    ]);
  });
  it('실제 소리 조각 여섯 개는 모두 한 마디 안에서 끝나는 재생이 된다', () => {
    const pieces = goodItems().filter(isSoundPiece);
    for (const piece of pieces) {
      const pb = piecePlayback(piece);
      expect(pb.notes).toHaveLength(piece.notes.length);
      for (const n of pb.notes) expect(n.onsetTick + n.durationTick).toBeLessThanOrEqual(pb.lengthTicks);
    }
  });
  it('음 이름', () => {
    expect(pieceNoteName(60)).toBe('C4');
    expect(pieceNoteName(69)).toBe('A4');
    expect(pieceNoteName(48)).toBe('C3');
    expect(pieceNoteName(63)).toBe('E♭4');
    expect(describePiece(piece(1, 0, 0))).toBe('C4 D4');
  });
});

describe('실제 마을 발견 요소(content/discoveries/village.json)', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'content', 'discoveries', 'village.json'), 'utf-8'));
  const parsed = parseDiscoveryFile(raw, 'village.json');
  const file = parsed.file!;

  it('형식이 맞고 소리 조각 6, 개념 쪽지 3이다', () => {
    expect(parsed.issues).toEqual([]);
    expect(file.items.filter(isSoundPiece)).toHaveLength(6);
    expect(file.items.filter(isConceptNote)).toHaveLength(3);
  });
  it('콘텐츠 검사(좌표·길 가까이 몫·막다른 길·간격·닿는 곳)를 통과한다', () => {
    expect(validateContentDir(root)).toEqual([]);
  });
  it('소리 조각은 모두 다장조 5음 한 마디 안이고 쉬는 박이나 길이가 제각각이다', () => {
    const pieces = file.items.filter(isSoundPiece);
    for (const p of pieces) {
      for (const n of p.notes) expect(PENTATONIC_PITCH_CLASSES).toContain(n.midi % 12);
      expect(Math.max(...p.notes.map((n) => n.onsetTicks + n.durationTicks))).toBeLessThanOrEqual(PIECE_BAR_TICKS);
    }
    // 가락이 서로 다르다
    expect(new Set(pieces.map(describePiece)).size).toBe(6);
  });
  it('아직 사람이 검수하지 않았으니 모두 미리보기에만 보인다(11.1, G2 일곱째)', () => {
    expect(file.items.every((d) => d.availability === 'draft' && d.reviewStatus === 'unreviewed' && d.rightsStatus === 'unconfirmed')).toBe(true);
    expect(visibleDiscoveries([file], 'release')).toEqual([]);
    expect(visibleDiscoveries([file], 'preview')).toHaveLength(9);
  });
  it('쪽지는 교재의 쪽과 과제에 이어진다', () => {
    const notes = file.items.filter(isConceptNote);
    expect(notes.map((n) => n.questId)).toEqual(['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar', 'chord.major-triad']);
    for (const n of notes) {
      expect(n.textbookRefs.length).toBeGreaterThan(0);
      expect(n.text.length).toBeGreaterThan(10);
    }
  });

  describe('틀린 내용을 넣으면 검사가 잡는다', () => {
    const dirs: string[] = [];
    afterEach(() => {
      while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
    });
    /** content/를 임시 폴더에 복사해 마을 발견 요소 파일만 고친 뒤 검사한다(원본은 건드리지 않는다) */
    function damaged(mutate: (r: Record<string, any>) => void, fileName = 'village.json'): string[] {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
      dirs.push(tmp);
      fs.cpSync(path.join(root, 'content'), path.join(tmp, 'content'), { recursive: true });
      const target = path.join(tmp, 'content', 'discoveries', 'village.json');
      const r = JSON.parse(fs.readFileSync(target, 'utf-8'));
      mutate(r);
      fs.rmSync(target);
      fs.writeFileSync(path.join(tmp, 'content', 'discoveries', fileName), JSON.stringify(r));
      return codes(validateContentDir(tmp));
    }
    it('조각을 이웃에 바짝 붙이면 간격 오류', () => {
      expect(damaged((r) => ((r['items'][1].x = r['items'][0].x + 100), (r['items'][1].y = r['items'][0].y)))).toContain('SPACING');
    });
    it('조각을 막힌 곳으로 옮기면 닿지 않는 곳 오류', () => {
      // (3000, 2700)은 북서쪽 집 안이라 길이 막혀 있다
      expect(damaged((r) => ((r['items'][0].x = 3000), (r['items'][0].y = 2700)))).toContain('UNREACHABLE');
    });
    it('쪽지의 교재 쪽을 지우면 출처 오류', () => {
      expect(damaged((r) => (r['items'][6].textbookRefs = []))).toContain('NOTE_SOURCE');
    });
    it('없는 과제를 가리키면 연결 오류', () => {
      expect(damaged((r) => (r['items'][6].questId = 'no.such.quest'))).toContain('REF_QUEST');
    });
    it('검수 없이 공개로 바꾸면 공개 오류', () => {
      expect(damaged((r) => (r['items'][0].availability = 'published'))).toContain('PUBLISHED_UNREVIEWED');
    });
    it('막다른 길 끝의 쪽지를 치우면 막다른 길 오류', () => {
      // 첫 쪽지(2810,2475)를 길 한가운데 가까이로 옮겨도 간격과 별개로 막다른 길 끝이 비게 된다
      expect(damaged((r) => ((r['items'][6].x = 4056), (r['items'][6].y = 3450)))).toContain('DEAD_END');
    });
    it('파일 이름이 지역 id와 다르면 오류', () => {
      expect(damaged(() => undefined, 'staff-hill.json')).toContain('FILENAME');
    });
    it('개수가 맞지 않으면 오류', () => {
      expect(damaged((r) => r['items'].pop())).toContain('COUNT');
    });
  });
});
