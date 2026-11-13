// 5-6 월드의 발견 요소: 월드에 놓을 자리(발견 요소와 광장 게시판), 광장 둘레의 등, 찾았을 때 알리는 글, 소리 조각이 울리는 마디.
// 순수 계산만 본다. 월드 실행부와 그림은 world-spots.test.ts와 tests/flow가 본다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDiscoveries } from '@/app/discovery-data';
import { BOARD_SPOT, LAMP_ARCS_DEG, LAMP_RING_RADIUS, PLAZA_CENTER, distanceToRoads, foundNews, isConceptNote, isSoundPiece, lampsPerArc, plazaLampId, plazaLampSite, plazaLampStates, spotsOf } from '@/domain/discovery';
import { INTERACT_RANGE, WorldMap, standOf } from '@/domain/world';
import { BAR_SEC, PIECE_PERIOD_BARS, PIECE_VELOCITY, lastPieceRingBar, pieceRings, pieceWorldNotes } from '@/domain/worldsound';
import { NavGrid } from '../../src/world/nav';
import { NAV_ROWS } from '../../src/world/generated/worldData';
import { loadRegionDefs } from '../../tools/world-files';
import { villageColliders, villageRoads } from '../../world-src/village';

const root = path.resolve(__dirname, '../..');
const map = new WorldMap(loadRegionDefs(root));
const grid = NavGrid.fromRows(NAV_ROWS);
const all = loadDiscoveries('preview');
const pieces = all.filter(isSoundPiece);
const notes = all.filter(isConceptNote);
const P = (n: number): string => `disc.village.piece-${n}`;

describe('월드에 놓을 자리(spotsOf)', () => {
  it('발견 요소 전부를 id 순서대로 놓고, 마지막에 광장 게시판이 온다', () => {
    const spots = spotsOf(all);
    expect(spots).toHaveLength(all.length + 1);
    expect(spots.slice(0, -1).map((s) => s.id)).toEqual(all.map((d) => d.discoveryId));
    expect(spots.at(-1)).toEqual(BOARD_SPOT);
  });

  it('발견 요소의 자리는 이름과 좌표와 종류를 그대로 옮긴다. 쪽지와 소리 조각을 구별한다', () => {
    const spots = spotsOf(all);
    for (const d of all) {
      const s = spots.find((x) => x.id === d.discoveryId)!;
      expect(s).toMatchObject({ name: d.name, x: d.x, y: d.y, kind: 'discovery', discovery: d.kind });
    }
    expect(spots.filter((s) => s.discovery === 'soundPiece')).toHaveLength(pieces.length);
    expect(spots.filter((s) => s.discovery === 'conceptNote')).toHaveLength(notes.length);
  });

  it('보이는 발견 요소가 없어도 광장 게시판은 있다', () => {
    expect(spotsOf([])).toEqual([BOARD_SPOT]);
  });

  it('정거장이 아닌 자리의 이름은 모두 있고 id가 정거장이나 서로와 겹치지 않는다(7.4)', () => {
    const ids = [...spotsOf(all).map((s) => s.id), ...map.stations.map((s) => s.stationId)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of spotsOf(all)) expect(s.name.trim().length).toBeGreaterThan(0);
  });
});

describe('광장 게시판(6.1 만듦)', () => {
  it('걸어서 닿는 자리에 있다: 막힌 곳이 아니다', () => {
    expect(grid.circleHitsBlocked(BOARD_SPOT.x, BOARD_SPOT.y)).toBe(false);
  });

  it('가장 가까운 사물이 헷갈리지 않게, 다른 자리와 정거장의 서는 자리에서 칩 범위의 두 배 넘게 떨어져 있다', () => {
    const others = [...spotsOf(all).filter((s) => s.id !== BOARD_SPOT.id), ...map.stations.map((s) => ({ id: s.stationId, ...standOf(s) }))];
    for (const o of others) expect(Math.hypot(o.x - BOARD_SPOT.x, o.y - BOARD_SPOT.y), o.id).toBeGreaterThan(INTERACT_RANGE * 2);
  });

  it('둘레 100 px 안이 모두 걸을 수 있는 땅이다(게시판을 세우고 그 앞에 설 자리가 있다)', () => {
    for (let a = 0; a < 360; a += 30) {
      const x = BOARD_SPOT.x + 100 * Math.cos((a * Math.PI) / 180);
      const y = BOARD_SPOT.y + 100 * Math.sin((a * Math.PI) / 180);
      expect(grid.circleHitsBlocked(x, y), `${a}도`).toBe(false);
    }
  });

  it('광장 바닥(반지름 360) 바깥이고, 광장 둘레의 등과도 겹치지 않는다(60 px 이상)', () => {
    expect(Math.hypot(BOARD_SPOT.x - PLAZA_CENTER.x, BOARD_SPOT.y - PLAZA_CENTER.y)).toBeGreaterThan(360 + 60);
    for (let i = 0; i < 6; i++) {
      const lamp = plazaLampSite(i, 6);
      expect(Math.hypot(BOARD_SPOT.x - lamp.x, BOARD_SPOT.y - lamp.y), `${i}번 등`).toBeGreaterThan(60);
    }
  });
});

describe('광장 둘레의 등(3.6)', () => {
  it('광장 중심은 마을 지역 파일의 합주 광장과 같다', () => {
    const { x, y } = map.region('village').landmark;
    expect(PLAZA_CENTER).toEqual({ x, y });
  });

  const COUNTS = [1, 2, 3, 6, 12, 18, 24, 36];
  const sitesOf = (count: number) => Array.from({ length: count }, (_, i) => plazaLampSite(i, count));
  const minGap = (sites: ReadonlyArray<{ x: number; y: number }>): number => {
    let m = Infinity;
    for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) m = Math.min(m, Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.y - sites[j]!.y));
    return m;
  };
  /** 등 하나가 차지하는 폭의 절반(등 그림 32 px) */
  const LAMP_HALF = 16;

  it('몇 개든 광장 중심에서 같은 거리(400)의 둘레에 선다(좌표는 정수로 반올림한다)', () => {
    for (const count of COUNTS) {
      for (const s of sitesOf(count)) expect(Math.abs(Math.hypot(s.x - PLAZA_CENTER.x, s.y - PLAZA_CENTER.y) - LAMP_RING_RADIUS), `${count}개 중`).toBeLessThan(1);
    }
  });

  it('등이 설 수 있는 호는 차례대로 겹치지 않고, 큰길(폭 186)에서 등 폭의 절반 넘게 떨어져 있다', () => {
    const road = villageRoads().find((r) => r.id === 'village-east-west')!;
    expect(road.width).toBe(186); // 큰길 폭이 바뀌면 호도 다시 잡아야 한다
    for (let i = 0; i < LAMP_ARCS_DEG.length; i++) {
      const [from, to] = LAMP_ARCS_DEG[i]!;
      expect(to - from, `${i}번 호의 폭`).toBeGreaterThanOrEqual(10);
      if (i > 0) expect(from, `${i}번 호는 앞 호 뒤에서 시작`).toBeGreaterThan(LAMP_ARCS_DEG[i - 1]![1]);
      // 호의 양 끝도 동서(y)·남북(x) 큰길 한가운데 선에서 (반폭 + 등 폭의 절반) 넘게 떨어져 있다
      for (const deg of [from, to]) {
        const a = (deg * Math.PI) / 180;
        expect(Math.abs(LAMP_RING_RADIUS * Math.cos(a)), `${deg}도의 x`).toBeGreaterThanOrEqual(road.width / 2 + LAMP_HALF);
        expect(Math.abs(LAMP_RING_RADIUS * Math.sin(a)), `${deg}도의 y`).toBeGreaterThanOrEqual(road.width / 2 + LAMP_HALF);
      }
    }
    expect(LAMP_ARCS_DEG[0]![0]).toBeGreaterThan(0);
    expect(LAMP_ARCS_DEG.at(-1)![1]).toBeLessThan(360);
  });

  it('등은 큰길 위에도, 건물 지붕·울타리·의자 위에도 서지 않는다(몇 개든): 걸을 수 있는 땅에 선다', () => {
    const roads = villageRoads().map((r) => ({ id: r.id, width: r.width, points: r.points }));
    const rects = villageColliders().filter((c) => c.kind === 'rect') as Array<{ x: number; y: number; w: number; h: number; note?: string }>;
    for (const count of COUNTS) {
      for (const [i, s] of sitesOf(count).entries()) {
        const where = `${count}개 중 ${i}번 등 (${s.x}, ${s.y})`;
        for (const road of roads) expect(distanceToRoads([road], s), `${where}: ${road.id}`).toBeGreaterThanOrEqual(road.width / 2 + LAMP_HALF);
        for (const c of rects) {
          const inside = s.x > c.x - LAMP_HALF && s.x < c.x + c.w + LAMP_HALF && s.y > c.y - LAMP_HALF && s.y < c.y + c.h + LAMP_HALF;
          expect(inside, `${where}: ${c.note}`).toBe(false);
        }
        expect(grid.circleHitsBlocked(s.x, s.y, LAMP_HALF), `${where}: 막힌 칸`).toBe(false);
      }
    }
  });

  it('등끼리 겹치지 않는다: 열여덟 개는 서로 48 px 이상, 스물네 개까지는 40 px 이상, 서른여섯 개도 30 px 이상 떨어진다', () => {
    expect(minGap(sitesOf(18))).toBeGreaterThanOrEqual(48);
    for (const count of [6, 12, 18, 24]) expect(minGap(sitesOf(count)), `${count}개`).toBeGreaterThanOrEqual(40);
    expect(minGap(sitesOf(36))).toBeGreaterThanOrEqual(30);
  });

  it('번호는 동쪽 큰길에서 시계 방향으로 늘어난다', () => {
    for (const count of [6, 18, 36]) {
      const angles = sitesOf(count).map((s) => {
        const a = (Math.atan2(s.y - PLAZA_CENTER.y, s.x - PLAZA_CENTER.x) * 180) / Math.PI;
        return a < 0 ? a + 360 : a;
      });
      for (let i = 1; i < angles.length; i++) expect(angles[i]!, `${count}개 중 ${i}번`).toBeGreaterThan(angles[i - 1]!);
      for (const a of angles) expect(LAMP_ARCS_DEG.some(([from, to]) => a >= from - 0.2 && a <= to + 0.2), `${count}개: ${a.toFixed(1)}도는 호 안`).toBe(true);
    }
  });

  it('광장 게시판의 눌러 여는 범위(96 px) 안에는 등이 서지 않는다', () => {
    for (const count of COUNTS) for (const s of sitesOf(count)) expect(Math.hypot(s.x - BOARD_SPOT.x, s.y - BOARD_SPOT.y)).toBeGreaterThan(2 * INTERACT_RANGE);
  });

  it('호마다 서는 수: 호의 길이에 비례해 나누고 합은 늘 개수와 같다. 18개는 [2, 2, 6, 6, 2]', () => {
    expect(lampsPerArc(18)).toEqual([2, 2, 6, 6, 2]);
    expect(lampsPerArc(0)).toEqual([0, 0, 0, 0, 0]);
    expect(lampsPerArc(-3)).toEqual([0, 0, 0, 0, 0]);
    const lengths = LAMP_ARCS_DEG.map(([from, to]) => to - from);
    const sum = lengths.reduce((a, b) => a + b, 0);
    for (let count = 0; count <= 40; count++) {
      const per = lampsPerArc(count);
      expect(per.reduce((a, b) => a + b, 0), `${count}개`).toBe(count);
      per.forEach((n, i) => expect(Math.abs(n - (count * lengths[i]!) / sum), `${count}개 중 ${i}번 호`).toBeLessThan(1));
    }
  });

  it('범위를 벗어난 번호나 0개를 물어도 던지지 않고 가까운 자리를 준다', () => {
    expect(Number.isFinite(plazaLampSite(0, 0).x)).toBe(true);
    expect(plazaLampSite(99, 6)).toEqual(plazaLampSite(5, 6));
    expect(plazaLampSite(-4, 6)).toEqual(plazaLampSite(0, 6));
  });

  it('등 id는 1부터 센다', () => {
    expect([0, 1, 5].map(plazaLampId)).toEqual(['plaza-lamp-1', 'plaza-lamp-2', 'plaza-lamp-6']);
  });

  it('아무것도 못 찾았으면 모두 꺼져 있다. 소리 조각 하나를 찾으면 그 번호의 등만 켜진다', () => {
    const none = plazaLampStates(pieces, new Set());
    expect(pieces).toHaveLength(36); // 7-4 뒤: 마을 6, 지역마다 6씩 다섯 지역
    expect(Object.values(none)).toEqual(pieces.map(() => 'off'));
    const two = plazaLampStates(pieces, new Set([P(2)]));
    expect(Object.entries(two).filter(([, v]) => v === 'on').map(([k]) => k)).toEqual(['plaza-lamp-2']);
  });

  it('개념 쪽지나 모르는 id를 찾아도 등은 켜지지 않는다', () => {
    const s = plazaLampStates(pieces, new Set([...notes.map((n) => n.discoveryId), 'disc.nowhere.piece-9']));
    expect(Object.values(s).every((v) => v === 'off')).toBe(true);
  });

  it('찾는 것이 늘면 켜진 등도 늘기만 한다(W-6)', () => {
    const order = pieces.map((p) => p.discoveryId);
    let prev = 0;
    for (let n = 0; n <= order.length; n++) {
      const on = Object.values(plazaLampStates(pieces, new Set(order.slice(0, n)))).filter((v) => v === 'on').length;
      expect(on).toBe(n);
      expect(on).toBeGreaterThanOrEqual(prev);
      prev = on;
    }
  });
});

describe('찾았을 때 알리는 글(W-9, 6.7)', () => {
  it('소리 조각: 찾았다는 사실, 수첩에 적었다는 사실, 등이 켜졌다는 사실만 적는다', () => {
    expect(foundNews(pieces[1]!)).toEqual(['소리 조각 바람결을 찾았어요. 수첩에 적었어요.', '광장 둘레의 등이 하나 켜졌어요.']);
  });

  it('개념 쪽지: 등 이야기는 없다', () => {
    expect(foundNews(notes[0]!)).toEqual(['개념 쪽지 같은 음, 다른 자리를 찾았어요. 수첩에 적었어요.']);
  });

  it('조사는 이름의 끝 글자에 맞춘다(받침이 있으면 을, 없으면 를)', () => {
    expect(foundNews({ kind: 'soundPiece', name: '첫걸음' })[0]).toBe('소리 조각 첫걸음을 찾았어요. 수첩에 적었어요.');
    expect(foundNews({ kind: 'soundPiece', name: '돌다리' })[0]).toBe('소리 조각 돌다리를 찾았어요. 수첩에 적었어요.');
  });

  it('남은 개수, 칭찬, 숫자를 적지 않는다', () => {
    for (const d of all) {
      const text = foundNews(d).join(' ');
      expect(text).not.toMatch(/\d|남았|남은|중에|잘했|대단|축하|훌륭|%/);
    }
  });
});

describe('소리 조각이 울리는 마디(8.2)', () => {
  it('두 마디에 한 번 울린다. 번호가 짝수인 조각과 홀수인 조각이 번갈아 울린다', () => {
    expect(PIECE_PERIOD_BARS).toBe(2);
    for (let bar = 0; bar < 8; bar++) {
      expect(pieceRings(bar, 0)).toBe(bar % 2 === 0);
      expect(pieceRings(bar, 1)).toBe(bar % 2 === 1);
      expect(pieceRings(bar, 0)).not.toBe(pieceRings(bar, 1));
      expect(pieceRings(bar, 2)).toBe(pieceRings(bar, 0));
    }
  });

  it('음수 마디(시계가 시작하기 전)도 바르게 센다', () => {
    expect(pieceRings(-1, 1)).toBe(true);
    expect(pieceRings(-2, 1)).toBe(false);
    expect(lastPieceRingBar(-1, 0)).toBe(-2);
  });

  it('가장 가까운 지난 울림 마디: 울리는 마디면 그 마디, 쉬는 마디면 바로 앞 마디', () => {
    for (let bar = 0; bar < 10; bar++) {
      for (const index of [0, 1, 4, 5]) {
        const last = lastPieceRingBar(bar, index);
        expect(last).toBeLessThanOrEqual(bar);
        expect(bar - last).toBeLessThan(PIECE_PERIOD_BARS);
        expect(pieceRings(last, index)).toBe(true);
      }
    }
  });

  it('소리 조각 아홉 중 여섯은 모두 한 마디 안에 있고, 박은 마디 안의 4분음표 박이다', () => {
    for (const p of pieces) {
      const ns = pieceWorldNotes(p);
      expect(ns).toHaveLength(p.notes.length);
      for (const n of ns) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat + n.beats).toBeLessThanOrEqual(4);
        expect(n.velocity).toBe(PIECE_VELOCITY);
        expect(n.beats).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it('첫걸음(C4 D4 E4 G4, 4분음표 넷)은 박 0, 1, 2, 3에서 시작하고 한 박보다 조금 짧게 울린다', () => {
    const ns = pieceWorldNotes(pieces[0]!);
    expect(ns.map((n) => n.midi)).toEqual([60, 62, 64, 67]);
    expect(ns.map((n) => n.beat)).toEqual([0, 1, 2, 3]);
    for (const n of ns) expect(n.beats).toBeCloseTo(0.92, 5);
  });

  it('한 마디는 3초다(4분음표 80, 4박)', () => {
    expect(BAR_SEC).toBeCloseTo(3, 9);
  });

  it('쉼 없이 이어지는 긴 음(온음표)은 한 마디를 넘지 않는다', () => {
    const ns = pieceWorldNotes({ notes: [{ midi: 60, onsetTicks: 0, durationTicks: 3840 }] });
    expect(ns[0]!.beats).toBeCloseTo(3.68, 5);
    expect(ns[0]!.beat + ns[0]!.beats).toBeLessThanOrEqual(4);
  });
});
