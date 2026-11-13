// 6-9c 놀이 악기(설계서 3.5): 돌의 자리와 밟기 판정, 밟았을 때 낼 소리(메아리), 파일 읽기와 배치 검사, 채널별로 보이는 악기.
// 실제 두 악기(물방울 북, 메아리 벽)와 같은 모양으로 확인하고, 틀리게 고치면 검사가 잡는지 본다. 소리가 실제로 나는지는 손 점검의 몫이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDiscoveryFiles } from '@/app/discovery-data';
import type { ContentIssue } from '@/domain/content';
import { MIN_SPACING, NAME_MAX, parseDiscoveryFile, validateDiscoveries, visiblePlayInstruments } from '@/domain/discovery';
import type { DiscoveryFile } from '@/domain/discovery';
import {
  ECHO_DELAY_BEATS,
  ECHO_VELOCITY_RATIO,
  PAD_COUNT_MAX,
  PAD_COUNT_MIN,
  PAD_GAP,
  PAD_MIDI_MAX,
  PAD_MIDI_MIN,
  PAD_RADIUS,
  PAD_SPREAD_MAX,
  PAD_VELOCITY,
  PLAY_GROUNDS,
  PLAY_ID_RE,
  PLAY_INSTRUMENTS_PER_OUTER_REGION,
  PLAY_TIMBRES,
  padAtPoint,
  padSitesOf,
  strikePlan,
} from '@/domain/play';
import type { PlayInstrumentDef } from '@/domain/play';
import { BEAT_SEC } from '@/domain/worldsound';
import { discoveryWorld } from '../../tools/content-loader';
import { loadRegionDefs } from '../../tools/world-files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const codes = (issues: ContentIssue[]): string[] => issues.map((i) => i.code);

// 실제 두 악기와 같은 모양의 작은 악기들
const DRUM = { x: 1000, y: 1000, echo: false, pads: [{ dx: -72, dy: -72, midi: 48 }, { dx: 72, dy: -72, midi: 55 }, { dx: 72, dy: 72, midi: 60 }, { dx: -72, dy: 72, midi: 64 }] };
const WALL = { x: 600, y: 600, echo: true, pads: [{ dx: -208, dy: 110, midi: 60 }, { dx: -104, dy: 110, midi: 62 }, { dx: 0, dy: 110, midi: 64 }] };

// ───── 상수 ─────
describe('놀이 악기의 약속(상수)', () => {
  it('돌은 반지름 44, 이웃과의 틈 16이라 가운데끼리 104 px 이상 떨어진다. 한 악기의 돌은 2~8개, 가운데에서 300 px 안이다', () => {
    expect(PAD_RADIUS).toBe(44);
    expect(PAD_GAP).toBe(16);
    expect(2 * PAD_RADIUS + PAD_GAP).toBe(104);
    expect([PAD_COUNT_MIN, PAD_COUNT_MAX]).toEqual([2, 8]);
    expect(PAD_SPREAD_MAX).toBe(300);
    expect([PAD_MIDI_MIN, PAD_MIDI_MAX]).toEqual([36, 84]);
    expect(PLAY_INSTRUMENTS_PER_OUTER_REGION).toBe(1);
  });

  it('메아리는 한 박 뒤, 절반 세기다(세계 시계 80 BPM이면 0.75초)', () => {
    expect(ECHO_DELAY_BEATS).toBe(1);
    expect(ECHO_VELOCITY_RATIO).toBe(0.5);
    expect(BEAT_SEC).toBe(0.75);
  });

  it('음색은 음높이가 있는 세계 음색이고, 다섯 악기가 쓰는 thump, kalimba, chime, wood, pluck이 들어 있다. 바닥은 none, pool, slope, rope, lilies다(7-4가 셋을 더했다)', () => {
    for (const t of ['thump', 'kalimba', 'chime', 'wood', 'pluck']) expect(PLAY_TIMBRES, t).toContain(t);
    expect(new Set(PLAY_TIMBRES).size).toBe(PLAY_TIMBRES.length);
    expect([...PLAY_GROUNDS]).toEqual(['none', 'pool', 'slope', 'rope', 'lilies']);
  });

  it('놀이 악기 id는 play.지역.이름 꼴이다', () => {
    for (const ok of ['play.beat-river.drum', 'play.bell-grove.echo-wall', 'play.key-marsh.lily-choir']) expect(PLAY_ID_RE.test(ok), ok).toBe(true);
    for (const bad of ['play.beat-river', 'drum', 'play.Beat-River.drum', 'play.beat-river.drum.2', 'disc.beat-river.piece-1', 'play..drum', 'play.beat river.drum']) expect(PLAY_ID_RE.test(bad), bad).toBe(false);
    expect(PLAY_ID_RE.exec('play.bell-grove.echo-wall')!.slice(1)).toEqual(['bell-grove', 'echo-wall']);
  });
});

// ───── 돌의 자리 ─────
describe('돌의 자리(padSitesOf)', () => {
  it('돌 번호는 1부터, 자리는 악기의 가운데에 돌의 어긋남을 더한 것이다', () => {
    expect(padSitesOf(DRUM)).toEqual([
      { pad: 1, x: 928, y: 928, midi: 48 },
      { pad: 2, x: 1072, y: 928, midi: 55 },
      { pad: 3, x: 1072, y: 1072, midi: 60 },
      { pad: 4, x: 928, y: 1072, midi: 64 },
    ]);
  });

  it('돌이 없는 악기는 빈 목록이다', () => {
    expect(padSitesOf({ x: 0, y: 0, pads: [] })).toEqual([]);
  });
});

describe('밟은 돌 찾기(padAtPoint)', () => {
  it('돌의 가운데에 서면 그 돌의 번호다', () => {
    padSitesOf(DRUM).forEach((s) => expect(padAtPoint(DRUM, s.x, s.y)).toBe(s.pad));
    padSitesOf(WALL).forEach((s) => expect(padAtPoint(WALL, s.x, s.y)).toBe(s.pad));
  });

  it('반지름(44 px) 안은 올라선 것이고, 가장자리 위도 올라선 것이고, 그 바깥은 아니다', () => {
    const s = padSitesOf(DRUM)[0]!;
    expect(padAtPoint(DRUM, s.x + PAD_RADIUS, s.y)).toBe(1);
    expect(padAtPoint(DRUM, s.x - PAD_RADIUS + 0.5, s.y)).toBe(1);
    expect(padAtPoint(DRUM, s.x + PAD_RADIUS + 0.01, s.y)).toBeNull();
    expect(padAtPoint(DRUM, s.x, s.y - PAD_RADIUS - 0.01)).toBeNull();
    // 대각선: 거리가 반지름이면 안, 조금 넘으면 밖
    const k = PAD_RADIUS / Math.SQRT2;
    expect(padAtPoint(DRUM, s.x + k - 0.01, s.y + k - 0.01)).toBe(1);
    expect(padAtPoint(DRUM, s.x + k + 0.5, s.y + k + 0.5)).toBeNull();
  });

  it('돌과 돌 사이, 악기의 한가운데, 멀리 떨어진 곳은 어느 돌도 아니다', () => {
    expect(padAtPoint(DRUM, DRUM.x, DRUM.y)).toBeNull(); // 네 돌 한가운데(돌까지 약 102 px)
    expect(padAtPoint(DRUM, DRUM.x, DRUM.y - 72)).toBeNull(); // 1번과 2번 사이(각각 72 px)
    expect(padAtPoint(DRUM, 0, 0)).toBeNull();
    expect(padAtPoint(DRUM, 99999, -99999)).toBeNull();
    expect(padAtPoint({ x: 0, y: 0, pads: [] }, 0, 0)).toBeNull();
  });

  it('돌 틈(16 px)에서도 한쪽 돌에 걸리지 않으면 어느 돌도 아니다', () => {
    // 가운데끼리 104 px인 이웃 돌 둘: 가운데 점은 두 돌에서 각각 52 px라 둘 다 아니다
    const mid = (WALL.pads[0]!.dx + WALL.pads[1]!.dx) / 2;
    expect(padAtPoint(WALL, WALL.x + mid, WALL.y + 110)).toBeNull();
    // 첫 돌의 가장자리 안쪽에서는 1번, 둘째 돌의 가장자리 안쪽에서는 2번
    expect(padAtPoint(WALL, WALL.x - 208 + 44, WALL.y + 110)).toBe(1);
    expect(padAtPoint(WALL, WALL.x - 104 - 44, WALL.y + 110)).toBe(2);
  });

  it('겹쳐 있는 돌에서는 더 가까운 돌이 이긴다(검사는 겹침을 막지만, 판정은 어느 한 쪽으로 정해진다)', () => {
    const crowded = { x: 0, y: 0, pads: [{ dx: 0, dy: 0, midi: 60 }, { dx: 40, dy: 0, midi: 62 }] };
    expect(padAtPoint(crowded, 5, 0)).toBe(1);
    expect(padAtPoint(crowded, 35, 0)).toBe(2);
    expect(padAtPoint(crowded, 20, 0)).toBe(1); // 같은 거리면 앞의 돌
  });
});

// ───── 소리 계획 ─────
describe('돌을 밟았을 때 낼 소리(strikePlan)', () => {
  it('보통 악기(물방울 북)는 그 돌의 음 하나를 바로, 기본 세기(0.75)로 낸다', () => {
    expect(strikePlan(DRUM, 1)).toEqual([{ midi: 48, delaySec: 0, velocity: PAD_VELOCITY }]);
    expect(strikePlan(DRUM, 4)).toEqual([{ midi: 64, delaySec: 0, velocity: 0.75 }]);
  });

  it('메아리 악기(메아리 벽)는 바로 한 번, 한 박(0.75초) 뒤에 같은 음을 절반 세기(0.375)로 한 번 더 낸다', () => {
    const plan = strikePlan(WALL, 2);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toEqual({ midi: 62, delaySec: 0, velocity: 0.75 });
    expect(plan[1]).toEqual({ midi: 62, delaySec: 0.75, velocity: 0.375 });
    expect(plan[1]!.delaySec).toBe(ECHO_DELAY_BEATS * BEAT_SEC);
    expect(plan[1]!.velocity).toBe(PAD_VELOCITY * ECHO_VELOCITY_RATIO);
  });

  it('없는 돌(0번, 돌 수보다 큰 번호, 음수, 소수)은 아무 소리도 내지 않는다', () => {
    for (const bad of [0, 5, 99, -1, 1.5, Number.NaN]) {
      expect(strikePlan(DRUM, bad), String(bad)).toEqual([]);
      expect(strikePlan(WALL, bad), String(bad)).toEqual([]);
    }
  });

  it('소리의 높이는 돌마다 다르고 번호 순서가 파일의 순서다', () => {
    expect(DRUM.pads.map((_, i) => strikePlan(DRUM, i + 1)[0]!.midi)).toEqual([48, 55, 60, 64]);
  });
});

// ───── 파일 읽기 ─────
describe('발견 요소 파일 속 놀이 악기 읽기(parseDiscoveryFile)', () => {
  const rawOf = (region: string): any => JSON.parse(fs.readFileSync(path.join(root, 'content', 'discoveries', `${region}.json`), 'utf-8'));
  const parse = (mutate: (raw: any) => void, region = 'beat-river') => {
    const raw = rawOf(region);
    mutate(raw);
    return parseDiscoveryFile(raw, `${region}.json`);
  };
  const problems = (mutate: (raw: any) => void, region = 'beat-river'): string[] => codes(parse(mutate, region).issues);

  it('실제 두 파일에서 물방울 북과 메아리 벽을 읽는다. 적지 않은 echo는 없음, 적지 않은 ground는 none이다', () => {
    const drum = parse(() => undefined, 'beat-river').file!.playInstruments![0]!;
    expect(drum).toMatchObject({ playId: 'play.beat-river.drum', regionId: 'beat-river', name: '물방울 북', x: 7700, y: 2200, timbre: 'thump', echo: false, ground: 'pool' });
    expect(drum.pads.map((p) => p.midi)).toEqual([48, 55, 60, 64]);
    const wall = parse(() => undefined, 'bell-grove').file!.playInstruments![0]!;
    expect(wall).toMatchObject({ playId: 'play.bell-grove.echo-wall', regionId: 'bell-grove', name: '메아리 벽', x: 600, y: 600, timbre: 'kalimba', echo: true, ground: 'none' });
    expect(wall.pads.map((p) => p.midi)).toEqual([60, 62, 64, 67, 69]);
  });

  it('놀이 악기를 적지 않은 파일(마을)은 playInstruments가 없다', () => {
    const village = parse(() => undefined, 'village');
    expect(village.issues).toEqual([]);
    expect(village.file!.playInstruments).toBeUndefined();
  });

  it('echo와 ground를 빼도 읽힌다(기본값)', () => {
    const r = parse((raw) => {
      delete raw.playInstruments[0].echo;
      delete raw.playInstruments[0].ground;
    });
    expect(r.issues).toEqual([]);
    expect(r.file!.playInstruments![0]).toMatchObject({ echo: false, ground: 'none' });
  });

  it('이름 앞뒤 빈칸은 잘라서 읽는다', () => {
    expect(parse((raw) => (raw.playInstruments[0].name = '  물방울 북  ')).file!.playInstruments![0]!.name).toBe('물방울 북');
  });

  it('목록이 아니거나 객체가 아니면 모양 오류다', () => {
    expect(problems((raw) => (raw.playInstruments = {}))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments = 'drum'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments = [42]))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments = [null]))).toContain('SHAPE');
  });

  it('틀린 모양이 하나라도 있으면 파일을 통째로 못 읽는다(file이 null)', () => {
    const r = parse((raw) => (raw.playInstruments[0].timbre = 'organ'));
    expect(r.file).toBeNull();
    expect(codes(r.issues)).toEqual(['PLAY_TIMBRE']);
    expect(r.issues[0]!.path).toBe('beat-river.json.playInstruments[0].timbre');
  });

  it('id 형식, 이름 길이, 좌표, 음색, echo, ground, 공개 상태 항목이 틀리면 각각 잡는다', () => {
    expect(problems((raw) => (raw.playInstruments[0].playId = 'drum'))).toContain('ID_FORMAT');
    expect(problems((raw) => (raw.playInstruments[0].playId = 7))).toContain('ID_FORMAT');
    expect(problems((raw) => (raw.playInstruments[0].name = ''))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].name = '가'.repeat(NAME_MAX + 1)))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].name = '가'.repeat(NAME_MAX)))).toEqual([]);
    expect(problems((raw) => (raw.playInstruments[0].x = '7700'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].y = null))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].timbre = undefined))).toContain('PLAY_TIMBRE');
    expect(problems((raw) => (raw.playInstruments[0].echo = 'yes'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].ground = 'lava'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].ground = 3))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].availability = 'live'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].reviewStatus = 'ok'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].rightsStatus = 'free'))).toContain('SHAPE');
  });

  it('돌 목록이 없거나, 돌이 {dx, dy, midi}가 아니면 모양 오류다', () => {
    expect(problems((raw) => delete raw.playInstruments[0].pads)).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].pads = 'none'))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].pads[0] = { dx: 1, dy: 2 }))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].pads[1] = [1, 2, 60]))).toContain('SHAPE');
    expect(problems((raw) => (raw.playInstruments[0].pads[2].midi = '60'))).toContain('SHAPE');
  });

  it('ground에 쓸 수 있는 값(none, pool)과 echo의 true/false는 모두 읽힌다', () => {
    for (const g of PLAY_GROUNDS) expect(parse((raw) => (raw.playInstruments[0].ground = g)).file!.playInstruments![0]!.ground).toBe(g);
    for (const e of [true, false]) expect(parse((raw) => (raw.playInstruments[0].echo = e)).file!.playInstruments![0]!.echo).toBe(e);
    for (const t of PLAY_TIMBRES) expect(parse((raw) => (raw.playInstruments[0].timbre = t)).file!.playInstruments![0]!.timbre).toBe(t);
  });
});

// ───── 배치 검사 ─────
describe('놀이 악기의 배치 검사(validateDiscoveries)', () => {
  const world = discoveryWorld(loadRegionDefs(root));
  const ctx = { geometry: world.geometry, bounds: world.bounds };
  /** 파일을 복사한다. 원본(실제 파일)은 건드리지 않는다 */
  const fresh = (): DiscoveryFile[] => structuredClone(loadDiscoveryFiles());
  const fileOf = (files: DiscoveryFile[], id: string): DiscoveryFile => files.find((f) => f.regionId === id)!;
  const instOf = (files: DiscoveryFile[], id: 'beat-river' | 'bell-grove'): PlayInstrumentDef => fileOf(files, id).playInstruments![0]!;
  /** 한 번 고쳐서 검사하고 문제 코드를 돌려준다(검사 장치 확인: 고치지 않으면 비어 있다) */
  const damaged = (mutate: (files: DiscoveryFile[]) => void): string[] => {
    const files = fresh();
    mutate(files);
    return codes(validateDiscoveries(files, ctx));
  };

  it('고치지 않은 실제 세 파일은 문제가 없다(시험 장치 확인)', () => {
    expect(codes(validateDiscoveries(fresh(), ctx))).toEqual([]);
    // 길 정보 없이 모양만 봐도 문제가 없다
    expect(codes(validateDiscoveries(fresh()))).toEqual([]);
  });

  describe('악기의 수: 마을 0, 바깥 지역마다 1', () => {
    it('마을에 놀이 악기를 두면 걸린다', () => {
      expect(damaged((f) => (fileOf(f, 'village').playInstruments = [{ ...structuredClone(instOf(f, 'beat-river')), playId: 'play.village.drum', regionId: 'village', x: 4056, y: 3300 }]))).toContain('COUNT');
    });
    it('바깥 지역에 악기가 없으면 걸린다. 악기만 빼면 걸리는 것은 개수뿐이다(길 가까이 몫과 막다른 길은 악기와 상관없다)', () => {
      for (const id of ['beat-river', 'bell-grove'] as const) {
        expect(damaged((f) => delete fileOf(f, id).playInstruments), id).toEqual(['COUNT']);
        expect(damaged((f) => void (fileOf(f, id).playInstruments = [])), id).toEqual(['COUNT']);
      }
    });
    it('바깥 지역에 악기가 둘이면 걸린다', () => {
      expect(damaged((f) => fileOf(f, 'beat-river').playInstruments!.push({ ...structuredClone(instOf(f, 'beat-river')), playId: 'play.beat-river.drum-2', x: 6200, y: 3800 }))).toContain('COUNT');
    });
  });

  describe('id와 이름과 공개 상태', () => {
    it('id의 지역이 파일의 지역과 다르면 걸린다', () => {
      expect(damaged((f) => (instOf(f, 'beat-river').playId = 'play.bell-grove.drum'))).toContain('ID_REGION');
    });
    it('항목의 지역이 파일의 지역과 다르면 걸린다', () => {
      expect(damaged((f) => (instOf(f, 'beat-river').regionId = 'bell-grove'))).toContain('ID_REGION');
    });
    it('다른 지역의 악기와 id가 겹치면 걸린다', () => {
      const c = damaged((f) => (instOf(f, 'bell-grove').playId = 'play.beat-river.drum'));
      expect(c).toContain('DUP_ID');
      expect(c).toContain('ID_REGION');
    });
    it('쓸 수 없는 음색이면 걸린다(파일 읽기를 거치지 않고 넣어도)', () => {
      expect(damaged((f) => ((instOf(f, 'beat-river') as { timbre: string }).timbre = 'organ'))).toContain('PLAY_TIMBRE');
    });
    it('이름이 비었거나 20자를 넘으면 걸린다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').name = ''))).toContain('SHAPE');
      expect(damaged((f) => (instOf(f, 'bell-grove').name = '가'.repeat(NAME_MAX + 1)))).toContain('SHAPE');
    });
    it('검수와 권리 확인 없이 공개로 바꾸면 걸리고, 둘 다 끝나면 통과한다(G2-7)', () => {
      expect(damaged((f) => (instOf(f, 'beat-river').availability = 'published'))).toContain('PUBLISHED_UNREVIEWED');
      expect(
        damaged((f) => {
          const i = instOf(f, 'beat-river');
          i.availability = 'published';
          i.reviewStatus = 'reviewed';
        }),
      ).toContain('PUBLISHED_UNREVIEWED');
      expect(
        damaged((f) => {
          const i = instOf(f, 'beat-river');
          i.availability = 'published';
          i.reviewStatus = 'reviewed';
          i.rightsStatus = 'confirmed';
        }),
      ).toEqual([]);
    });
  });

  describe('돌', () => {
    it('돌이 2개 미만이거나 8개를 넘으면 걸린다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads = instOf(f, 'bell-grove').pads.slice(0, 1)))).toContain('PLAY_PADS');
      expect(damaged((f) => (instOf(f, 'bell-grove').pads = []))).toContain('PLAY_PADS');
      // 9개: 가운데에서 190 px 둘레에 40도 간격(가운데끼리 130 px 이상)이라 개수 말고는 걸리는 것이 없다
      const nine = Array.from({ length: 9 }, (_, i) => ({ dx: Math.round(190 * Math.cos((i * 2 * Math.PI) / 9)), dy: Math.round(190 * Math.sin((i * 2 * Math.PI) / 9)), midi: [48, 50, 52, 55, 57, 60, 62, 64, 67][i]! }));
      const out = damaged((f) => {
        const i = instOf(f, 'beat-river');
        i.x = 7700;
        i.y = 2200;
        i.pads = nine;
      });
      expect(out).toContain('PLAY_PADS');
    });
    it('2개와 8개는 개수로는 걸리지 않는다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads = instOf(f, 'bell-grove').pads.slice(0, PAD_COUNT_MIN))).includes('PLAY_PADS')).toBe(false);
      const eight = Array.from({ length: PAD_COUNT_MAX }, (_, i) => ({ dx: Math.round(150 * Math.cos((i * 2 * Math.PI) / 8)), dy: Math.round(150 * Math.sin((i * 2 * Math.PI) / 8)), midi: [48, 50, 52, 55, 57, 60, 62, 64][i]! }));
      expect(damaged((f) => (instOf(f, 'beat-river').pads = eight)).includes('PLAY_PADS')).toBe(false);
    });
    it('5음 음계(C D E G A) 밖의 음이면 걸린다: F, 반음', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = 65))).toContain('PLAY_SCALE'); // F4
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = 61))).toContain('PLAY_SCALE'); // C#4
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = 71))).toContain('PLAY_SCALE'); // B4
    });
    it('정수가 아닌 음이면 음계 오류다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = 60.5))).toContain('PLAY_SCALE');
    });
    it('C2(36)~C6(84) 밖이면 걸린다. 경계는 통과한다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = 24))).toContain('PLAY_RANGE'); // C1
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = 96))).toContain('PLAY_RANGE'); // C7
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = PAD_MIDI_MIN))).toEqual([]);
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[0]!.midi = PAD_MIDI_MAX))).toEqual([]);
    });
    it('같은 음의 돌이 둘이면 걸린다', () => {
      expect(damaged((f) => (instOf(f, 'beat-river').pads[1]!.midi = instOf(f, 'beat-river').pads[0]!.midi))).toContain('PLAY_DUP_PITCH');
    });
    it('악기의 가운데에서 300 px를 넘는 돌은 걸리고, 정확히 300 px는 통과한다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[4]!.dx = 301))).toContain('PLAY_SPREAD');
      expect(damaged((f) => ((instOf(f, 'bell-grove').pads[4]!.dx = PAD_SPREAD_MAX), (instOf(f, 'bell-grove').pads[4]!.dy = 0))).includes('PLAY_SPREAD')).toBe(false);
    });
    it('돌 가운데끼리 104 px보다 가까우면 걸리고, 104 px 이상이면 통과한다', () => {
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[1]!.dx = -208 + 103))).toContain('PLAY_PAD_SPACING');
      expect(damaged((f) => (instOf(f, 'bell-grove').pads[1]!.dx = -208 + 2 * PAD_RADIUS + PAD_GAP)).includes('PLAY_PAD_SPACING')).toBe(false);
    });
  });

  describe('악기의 자리', () => {
    it('돌이 지역 경계에 걸치면 지역 밖 오류다(악기의 가운데가 안이어도)', () => {
      // 메아리 벽을 서쪽 경계 쪽으로: 돌 1번이 x=42라 반지름 44가 경계(0)를 넘는다
      const c = damaged((f) => (instOf(f, 'bell-grove').x = 250));
      expect(c).toContain('OUTSIDE');
    });
    it('악기의 가운데가 지역 밖이면 지역 밖 오류다', () => {
      expect(damaged((f) => (instOf(f, 'beat-river').x = 4056))).toContain('OUTSIDE');
      expect(damaged((f) => (instOf(f, 'bell-grove').x = -10))).toContain('OUTSIDE');
    });
    it('돌이 걸어서 닿지 않는 곳(강 한가운데)이면 걸린다', () => {
      const c = damaged((f) => {
        const i = instOf(f, 'beat-river');
        i.x = 6950;
        i.y = 1500;
      });
      expect(c).toContain('UNREACHABLE');
    });
    it('악기의 가운데 점이 큰 구조물 안이어도 돌만 걸어서 닿으면 통과한다(메아리 벽: 가운데는 벽 안)', () => {
      // 실제 메아리 벽의 가운데(600, 600)는 벽 막힘 안이다
      const nav = world.geometry['bell-grove']!.reachable;
      expect(nav(600, 600)).toBe(false);
      for (const s of padSitesOf(instOf(fresh(), 'bell-grove'))) expect(nav(s.x, s.y), `돌 ${s.pad}`).toBe(true);
      expect(codes(validateDiscoveries(fresh(), ctx))).toEqual([]);
    });
    it('발견 요소와 500 px보다 가까우면 걸린다(같은 지역, 다른 지역 모두)', () => {
      const files = fresh();
      const item = fileOf(files, 'beat-river').items[0]!;
      expect(
        damaged((f) => {
          const i = instOf(f, 'beat-river');
          i.x = item.x + 300;
          i.y = item.y;
        }),
      ).toContain('SPACING');
      // 종나무 숲의 악기를 마을의 발견 요소 곁에(마을과 종나무 숲은 지역이 다르다)
      const village = fileOf(files, 'village').items[0]!;
      expect(
        damaged((f) => {
          const i = instOf(f, 'bell-grove');
          i.x = village.x - 100;
          i.y = village.y;
        }),
      ).toContain('SPACING');
    });
    it('실제 두 악기는 어느 발견 요소와도 500 px 이상 떨어져 있다', () => {
      const files = fresh();
      const items = files.flatMap((f) => f.items);
      for (const id of ['beat-river', 'bell-grove'] as const) {
        const inst = instOf(files, id);
        for (const d of items) expect(Math.hypot(inst.x - d.x, inst.y - d.y), `${inst.playId}~${d.discoveryId}`).toBeGreaterThanOrEqual(MIN_SPACING);
      }
      const [a, b] = [instOf(files, 'beat-river'), instOf(files, 'bell-grove')];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MIN_SPACING);
    });
  });
});

// ───── 채널별로 보이는 악기 ─────
describe('지금 채널에서 보이는 놀이 악기(visiblePlayInstruments)', () => {
  const files = (): DiscoveryFile[] => structuredClone(loadDiscoveryFiles());

  /** 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪)로 늘어놓은 다섯 놀이 악기 */
  const ALL_PLAY = ['play.staff-hill.pitch-slide', 'play.beat-river.drum', 'play.bell-grove.echo-wall', 'play.scale-trail.pinwheels', 'play.key-marsh.lily-chorus'];

  it('미리보기에서는 초안인 다섯 악기도 모두 보이고, 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪)로 선다', () => {
    expect(visiblePlayInstruments(files(), 'preview').map((p) => p.playId)).toEqual(ALL_PLAY);
  });

  it('정식 공개에서는 공개 상태인 것만 보인다. 지금은 모두 초안이라 하나도 없다(G2-7)', () => {
    expect(visiblePlayInstruments(files(), 'release')).toEqual([]);
  });

  it('공개로 바꾼 악기만 정식 공개에 보인다', () => {
    const f = files();
    const wall = f.find((x) => x.regionId === 'bell-grove')!.playInstruments![0]!;
    wall.availability = 'published';
    expect(visiblePlayInstruments(f, 'release').map((p) => p.playId)).toEqual(['play.bell-grove.echo-wall']);
  });

  it('파일을 읽는 차례가 바뀌어도 지역 차례로 정렬된다. 마을(악기 없음)은 아무것도 보태지 않는다', () => {
    const f = files();
    expect(visiblePlayInstruments([...f].reverse(), 'preview').map((p) => p.playId)).toEqual(ALL_PLAY);
    expect(visiblePlayInstruments(f.filter((x) => x.regionId === 'village'), 'preview')).toEqual([]);
    expect(visiblePlayInstruments([], 'preview')).toEqual([]);
  });

  it('한 지역 안에서는 id의 숫자 순서다', () => {
    const f = files();
    const river = f.find((x) => x.regionId === 'beat-river')!;
    const base = river.playInstruments![0]!;
    river.playInstruments = [{ ...base, playId: 'play.beat-river.drum-10' }, { ...base, playId: 'play.beat-river.drum-2' }, base];
    expect(visiblePlayInstruments([river], 'preview').map((p) => p.playId)).toEqual(['play.beat-river.drum', 'play.beat-river.drum-2', 'play.beat-river.drum-10']);
  });
});
