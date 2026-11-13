// 3단계 월드 데이터: 설계서 3.1·3.2·B.1의 값을 손으로 옮겨 적은 표와 대조한다(코드가 계산한 값을 정답으로 삼지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANNED_QUESTS, REGION_IDS, TILE, WORLD_H, WORLD_W, WorldMap, parseRegion, regionBoundsPx, validateRegionSet } from '../../src/domain/world';
import type { RegionDef } from '../../src/domain/world';

const dir = path.resolve(__dirname, '../../content/regions');
const raws = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as unknown }));

function loadAll(): RegionDef[] {
  return raws.map((r) => {
    const { region, issues } = parseRegion(r.data, r.file);
    expect(issues).toEqual([]);
    return region!;
  });
}

// 설계서 3.1
describe('3.1 기본 수치', () => {
  it('월드는 256×192칸, 8192×6144 px', () => {
    expect(TILE).toBe(32);
    expect(WORLD_W).toBe(8192);
    expect(WORLD_H).toBe(6144);
  });
});

// 설계서 3.2 표: id, 이름, 범위 x0–x1, y0–y1 (px)
const REGION_TABLE: ReadonlyArray<[string, string, number, number, number, number]> = [
  ['village', '음악 마을', 2592, 5600, 2016, 4128],
  ['staff-hill', '오선 언덕', 2592, 5600, 0, 2016],
  ['beat-river', '박자 강가', 5600, 8192, 0, 4128],
  ['bell-grove', '종나무 숲', 0, 2592, 0, 4128],
  ['scale-trail', '음계 길', 4096, 8192, 4128, 6144],
  ['key-marsh', '건반 늪', 0, 4096, 4128, 6144],
];

describe('3.2 지역 구성', () => {
  const regions = loadAll();
  const map = new WorldMap(regions);

  it('지역 여섯 개의 이름과 범위가 표와 같다', () => {
    expect(regions.map((r) => r.regionId).sort()).toEqual([...REGION_IDS].sort());
    for (const [id, name, x0, x1, y0, y1] of REGION_TABLE) {
      const r = map.region(id as (typeof REGION_IDS)[number]);
      expect(r.name).toBe(name);
      expect(regionBoundsPx(r)).toEqual({ x0, x1, y0, y1 });
    }
  });

  it('부록 A.4의 칸 범위: 박자 강가는 x 175–255, y 0–128', () => {
    expect(map.region('beat-river').boundsTiles).toEqual({ x0: 175, x1: 255, y0: 0, y1: 128 });
  });

  it('강조색이 9.2의 표와 같다', () => {
    const accent: Record<string, string> = { village: '#17675D', 'staff-hill': '#7F9A7A', 'beat-river': '#5E97A6', 'bell-grove': '#B18B49', 'scale-trail': '#C2AA70', 'key-marsh': '#8E86A8' };
    for (const r of regions) expect(r.accentColor.toUpperCase()).toBe(accent[r.regionId]);
  });

  it('6.2의 지역별 합주 성부', () => {
    const part: Record<string, string> = { village: 'chords', 'staff-hill': 'melody', 'beat-river': 'percussion', 'bell-grove': 'bass', 'scale-trail': 'runner', 'key-marsh': 'ornament' };
    for (const r of regions) expect(r.ensemblePart).toBe(part[r.regionId]);
  });

  it('지역 점 찾기: 경계는 위·왼쪽 지역에 속하지 않고 아래·오른쪽 지역에 속한다', () => {
    const at = (x: number, y: number): string => map.regionAt(x, y).regionId;
    expect(at(3984, 3480)).toBe('village'); // 시작 위치
    expect(at(4056, 2015)).toBe('staff-hill');
    expect(at(4056, 2016)).toBe('village');
    expect(at(5599, 3081)).toBe('village');
    expect(at(5600, 3081)).toBe('beat-river');
    expect(at(2591, 3081)).toBe('bell-grove');
    expect(at(2592, 3081)).toBe('village');
    expect(at(4095, 4128)).toBe('key-marsh');
    expect(at(4096, 4128)).toBe('scale-trail');
    expect(at(4056, 4127)).toBe('village');
  });

  it('월드 밖의 점은 가장 가까운 가장자리의 지역으로 센다', () => {
    expect(map.regionAt(-50, -50).regionId).toBe('bell-grove');
    expect(map.regionAt(9000, 7000).regionId).toBe('scale-trail');
    expect(map.regionAt(9000, -10).regionId).toBe('beat-river');
    expect(map.regionAt(-1, 7000).regionId).toBe('key-marsh');
  });
});

// 부록 B.1 표: 정거장, 이름, 지역 이름, x, y, 원형
const STATION_TABLE: ReadonlyArray<[string, string, string, number, number, string]> = [
  ['H1', '음자리 작업대', '음악 마을', 3219, 2964, '패널'],
  ['H2', '리듬 작업대', '음악 마을', 4956, 2856, '패널'],
  ['H3', '화음 작업대', '음악 마을', 3273, 3882, '패널'],
  ['H4', '음계 디딤돌', '음악 마을', 4530, 3655, 'T1'],
  ['H5', '합주 무대', '음악 마을', 4056, 3081, 'T7'],
  ['N1', '높은음 계단밭', '오선 언덕', 4200, 712, 'T5'],
  ['N2', '낮은음 계단밭', '오선 언덕', 4200, 1288, 'T5'],
  ['N3', '가운데 턱', '오선 언덕', 4200, 1000, 'T5'],
  ['E1', '첫 징검다리', '박자 강가', 7000, 2800, 'T2'],
  ['E2', '긴 돌 짧은 돌', '박자 강가', 7000, 3600, 'T2'],
  ['E3', '잔물결 수로', '박자 강가', 6620, 1660, 'T2'],
  ['E4', '물레방아', '박자 강가', 6450, 2300, 'T3'],
  ['W1', '세 종 나무', '종나무 숲', 1900, 2700, 'T4'],
  ['W2', '밝은 종 어두운 종', '종나무 숲', 1500, 3500, 'T4'],
  ['W3', '종탑', '종나무 숲', 1100, 2500, 'T4'],
  ['W4', '세 기둥 빈터', '종나무 숲', 900, 1600, 'T4'],
  ['S1', '장음계 길', '음계 길', 5400, 4800, 'T1'],
  ['S2', '단음계 길', '음계 길', 6100, 5300, 'T1'],
  ['S3', '다섯 음 길', '음계 길', 6800, 5000, 'T1'],
  ['K1', '건반 다리', '건반 늪', 2300, 5100, 'T6'],
  ['K2', '음정 밧줄', '건반 늪', 1200, 5500, 'T6'],
  ['K3', '제자리표 다리', '건반 늪', 3200, 5600, 'T6'],
  ['K4', '반음 계단', '건반 늪', 800, 4700, 'T1'],
];

describe('B.1 정거장 23곳', () => {
  const map = new WorldMap(loadAll());

  it('정거장은 23곳이다', () => {
    expect(STATION_TABLE).toHaveLength(23);
    expect(map.stations).toHaveLength(23);
    expect(map.regions.map((r) => r.stations.length)).toEqual([5, 3, 4, 4, 3, 4]); // 마을, 언덕, 강가, 숲, 음계 길, 늪
  });

  it.each(STATION_TABLE)('%s %s (%s) 좌표 (%i, %i), 원형 %s', (id, name, regionName, x, y, archetype) => {
    const s = map.station(id);
    expect(s).toBeDefined();
    expect(s!.name).toBe(name);
    expect(map.region(s!.regionId).name).toBe(regionName);
    expect([s!.x, s!.y]).toEqual([x, y]);
    expect(s!.archetype).toBe(archetype === '패널' ? 'panel' : archetype);
    expect(s!.kind).toBe(archetype === '패널' ? 'panel' : 'installation');
    // 정거장은 제 지역 안에 있다
    expect(map.regionAt(s!.x, s!.y).regionId).toBe(s!.regionId);
  });

  // 3.3 정거장 표의 '과제' 칸과 3.5 지역별 표, 5.2의 정거장 칸을 합친 값(번호로 적고 id로 바꿔 대조)
  const QUESTS: Record<string, string[]> = {
    H1: ['Q01', 'Q04'], H2: ['Q02', 'Q03'], H3: ['Q05', 'Q06'], H4: ['Q07'], H5: ['Q08'],
    N1: ['Q09', 'Q10'], N2: ['Q09', 'Q10'], N3: ['Q01', 'Q11', 'Q12'],
    E1: ['Q02', 'Q13', 'Q16'], E2: ['Q14', 'Q15'], E3: ['Q03', 'Q17', 'Q18'], E4: ['Q19'],
    W1: ['Q05'], W2: ['Q20', 'Q22'], W3: ['Q06'], W4: ['Q21', 'Q23'],
    S1: ['Q07'], S2: ['Q24', 'Q25'], S3: ['Q26'],
    K1: ['Q04', 'Q27', 'Q28'], K2: ['Q04', 'Q29'], K3: ['Q30'], K4: ['Q31'],
  };
  it('정거장마다 놓인 과제 번호가 설계서 표와 같다', () => {
    for (const [id, numbers] of Object.entries(QUESTS)) {
      const got = map.station(id)!.questIds.map((q) => PLANNED_QUESTS[q]!.number);
      expect(got).toEqual(numbers);
    }
  });

  it('과제 계획표는 Q01–Q31 서른한 개이고 번호가 겹치지 않는다', () => {
    const numbers = Object.values(PLANNED_QUESTS).map((q) => q.number).sort();
    expect(numbers).toEqual(Array.from({ length: 31 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`));
  });

  it('과제는 5.2–5.7의 정거장 칸대로 정거장에 놓인다(Q07은 H4와 S1, Q02는 H2와 E1)', () => {
    expect(map.stationsForQuest('scale.major').map((s) => s.stationId)).toEqual(['H4', 'S1']);
    expect(map.stationsForQuest('rhythm.rest-in-a-bar').map((s) => s.stationId)).toEqual(['H2', 'E1']);
    expect(map.stationsForQuest('pitch.same-note-two-clefs').map((s) => s.stationId)).toEqual(['H1', 'N3']);
    expect(map.stationsForQuest('pitch.same-sound-different-names').map((s) => s.stationId)).toEqual(['H1', 'K1', 'K2']);
  });
});

describe('지역 파일 검사', () => {
  it('통과하는 파일 여섯 개는 문제가 없다', () => {
    expect(validateRegionSet(loadAll())).toEqual([]);
  });

  it('지역 범위에 빈틈이 생기면 잡는다', () => {
    const regions = loadAll();
    regions.find((r) => r.regionId === 'bell-grove')!.boundsTiles.x1 -= 1;
    expect(validateRegionSet(regions).map((i) => i.code)).toContain('REGION_GAP');
  });

  it('두 지역이 겹치면 잡는다', () => {
    const regions = loadAll();
    regions.find((r) => r.regionId === 'bell-grove')!.boundsTiles.x1 += 1;
    expect(validateRegionSet(regions).map((i) => i.code)).toContain('REGION_OVERLAP');
  });

  it('정거장이 제 지역 밖에 있으면 잡는다', () => {
    const regions = loadAll();
    regions.find((r) => r.regionId === 'village')!.stations[0]!.x = 100;
    expect(validateRegionSet(regions).map((i) => i.code)).toContain('STATION_OUTSIDE');
  });

  it('정거장 id가 겹치면 잡는다', () => {
    const regions = loadAll();
    regions.find((r) => r.regionId === 'village')!.stations[1]!.stationId = 'H1';
    expect(validateRegionSet(regions).map((i) => i.code)).toContain('DUP_STATION');
  });

  it('계획표에 없는 과제 id가 적히면 잡는다', () => {
    const regions = loadAll();
    regions.find((r) => r.regionId === 'village')!.stations[0]!.questIds.push('pitch.typo');
    expect(validateRegionSet(regions).map((i) => i.code)).toContain('UNKNOWN_QUEST');
  });

  it('지역 파일이 하나 빠지면 잡는다', () => {
    const regions = loadAll().filter((r) => r.regionId !== 'key-marsh');
    const codes = validateRegionSet(regions).map((i) => i.code);
    expect(codes).toContain('MISSING_REGION');
    expect(codes).toContain('REGION_GAP');
  });

  it('형식이 틀린 파일은 읽지 못하고 이유를 알려 준다', () => {
    const bad = { ...(raws[0]!.data as object), accentColor: 'teal', boundsTiles: { x0: 0, x1: 300, y0: 0, y1: 10 } };
    const { region, issues } = parseRegion(bad, 'x.json');
    expect(region).toBeNull();
    expect(issues.map((i) => i.code).sort()).toEqual(['BOUNDS', 'COLOR']);
    expect(parseRegion(null, 'y.json').issues[0]!.code).toBe('SHAPE');
    const noStations = { ...(raws[0]!.data as object), stations: [] };
    expect(parseRegion(noStations, 'z.json').issues.map((i) => i.path)).toContain('z.json.stations');
  });
});
