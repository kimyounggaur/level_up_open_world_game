// 6-6 물레방아(T3, 설계서 4.5)의 순수 계산: 바퀴의 각도와 칸과 큰 박, 바퀴와 펼친 띠가 같은 초안인지, 못(돌) 길이의 한도,
// 6/8 자유로 놀기의 틀, 카메라, 설치물 검사. 화면과 월드 없이 숫자와 문장만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@/domain/content';
import { ARCHETYPE_CODES, ARCHETYPE_SLOT_MAP, MIN_CELL_ON_SCREEN, STONES_FRAME_PAD, STONES_MIN_ZOOM, frameTuningOf, parseInstallation, slotBounds, validateInstallationSet } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { evaluateRhythmPlacement } from '@/domain/evaluators';
import type { RhythmPlacementSpec } from '@/domain/evaluators';
import { isNote, measureCountOf } from '@/domain/score';
import { measureTicks } from '@/domain/time';
import { timelineOf, tickLabel } from '@/domain/timeline';
import { WHEEL_WATER_WORDS, freeStonesFrameOf, laneOf, laneRect, slotOfTick, slotStartTick, stoneLengthsOf, tickAtSlotPoint, waterSentence } from '@/domain/timelineStones';
import { WHEEL_ZONES, isWheel, tickToDeg, wheelBeats, wheelFollowOf, wheelOf, wheelPoint, wheelSlotAt, wheelTurnDeg } from '@/domain/waterwheel';
import { WorldMap, parseRegion } from '@/domain/world';
import { MENU_BAND, SHOW_MARGIN, followPose } from '@/world/camera';
import type { CameraPose } from '@/world/camera';
import type { RegionDef } from '@/domain/world';
import { installation, quest } from './controller-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...p: string[]): unknown => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf-8'));
const regions: RegionDef[] = fs
  .readdirSync(path.join(root, 'content', 'regions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => parseRegion(readJson('content', 'regions', f), f).region!);
const map = new WorldMap(regions);
const quests: QuestDefinition[] = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson('content', 'quests', f) as QuestDefinition);

const WHEEL = 'inst.beat-river.waterwheel';
const w4 = installation(WHEEL);
const e1 = installation('inst.beat-river.first-ford');
const e3 = installation('inst.beat-river.ripple-channel');
const q19 = quest('rhythm.six-eight');
const lane = laneOf(w4)!;
const wheel = wheelOf(w4)!;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rawE4 = readJson('content', 'installations', `${WHEEL}.json`) as Record<string, any>;
const issuesOf = (list: InstallationDef[]) => validateInstallationSet(list, { map, quests });
const codes = (list: InstallationDef[]): string[] => issuesOf(list).map((i) => i.code);
const load = (raw: unknown): InstallationDef => {
  const { installation: inst, issues } = parseInstallation(raw, 'x.json');
  expect(issues).toEqual([]);
  return inst!;
};
const variantOf = (questId: string, variantId: string) => (questId === q19.questId ? q19.variants[variantId] : quest(questId).variants[variantId]);

describe('E4 물레방아 설치물의 값(4.5)', () => {
  it('정거장 E4, 박자 강가, 물레방아(T3). 변환표는 원형에서 정해진다: waterwheel → timelineStones', () => {
    expect([w4.installationId, w4.stationCode, w4.regionId, w4.archetype, w4.name]).toEqual([WHEEL, 'E4', 'beat-river', 'waterwheel', '물레방아']);
    expect(ARCHETYPE_CODES.waterwheel).toBe('T3');
    expect(ARCHETYPE_SLOT_MAP.waterwheel).toBe('timelineStones');
    expect(w4.interactPoint).toEqual({ x: 6450, y: 2300 });
    expect([w4.panelTwin, w4.signatureSoundId, w4.hearRadius]).toEqual(['panel.rhythm', 'sig.beat-river.waterwheel', 900]);
  });

  it('펼친 띠: 세로로 흐르는 6칸 × 80 px(8분음표 480틱, 1 px = 6틱), 줄 전체가 2880틱(6/8 한 마디)이다', () => {
    expect(w4.slots).toEqual(Array.from({ length: 6 }, (_, i) => ({ slot: i + 1, x: 5760, y: 2096 + 80 * i, w: 96, h: 80 })));
    expect(w4.slotMap).toEqual({ kind: 'timelineStones', voiceId: 'v1', axis: 'y', ticksPerPx: 6, cellTicks: 480, wheel: { cx: 6144, cy: 2336, r: 240 }, maxStoneCells: 3 });
    expect(lane).toEqual({ axis: 'y', ticksPerPx: 6, start: 2096, cross: 5760, crossSize: 96, cellTicks: 480, laneTicks: 2880, voiceId: 'v1', maxStoneTicks: 1440 });
  });

  it('바퀴: 지름 480 px, 못 구멍 6개 60°마다. 정거장은 바퀴 바로 옆(동쪽)에 있다', () => {
    expect(wheel).toMatchObject({ cx: 6144, cy: 2336, r: 240, cells: 6, cellDeg: 60, cellTicks: 480, turnTicks: 2880 });
    expect(wheel.r * 2).toBe(480);
    expect(isWheel(w4)).toBe(true);
    // 정거장과 상호작용 점 사이는 96 px 안이다(바퀴 가장자리 6384에서 66 px)
    expect(w4.interactPoint.x - (wheel.cx + wheel.r)).toBe(66);
  });

  it('지도의 정거장과 이어진다: 설치물 정거장 E4(T3)이고 Q19가 적혀 있다', () => {
    const st = map.station('E4')!;
    expect([st.kind, st.archetype, st.regionId]).toEqual(['installation', 'T3', 'beat-river']);
    expect(st.questIds).toEqual(['rhythm.six-eight']);
    expect(w4.quests).toEqual([{ questId: 'rhythm.six-eight', variantIds: ['dotted-quarter-and-eighths', 'quarters-and-eighths'] }]);
  });

  it('바퀴가 아닌 설치물(E1, E3, 마을 돌)에는 바퀴도 못의 한도도 없다', () => {
    expect(wheelOf(e1)).toBeNull();
    expect(wheelOf(e3)).toBeNull();
    expect(wheelOf(installation('inst.village.scale-stones'))).toBeNull();
    expect(isWheel(e1)).toBe(false);
    expect(laneOf(e1)!.maxStoneTicks).toBeUndefined();
    expect(laneOf(e3)!.maxStoneTicks).toBeUndefined();
  });

  it('content 폴더 전체 검사에서 문제가 없다(지도, 과제, 바퀴의 크기와 자리)', () => {
    expect(issuesOf([w4])).toEqual([]);
    expect(issuesOf([w4, e1, e3])).toEqual([]);
  });
});

describe('Q19 여섯 박 물레방아: 6/8, 한 바퀴가 한 마디', () => {
  const v1 = q19.variants['dotted-quarter-and-eighths']!;
  const v2 = q19.variants['quarters-and-eighths']!;
  const noteTicks = (v: typeof v1) => v.score.events.map((e) => [e.onsetTicks, e.durationTicks]);

  it('두 판본이 모두 6/8 한 마디(2880틱)이고 4.5의 표와 같다: 점4분 + 8분 셋, 4분 + 8분 + 4분 + 8분', () => {
    for (const v of [v1, v2]) {
      expect(v.score.meter).toBe('6/8');
      expect(measureTicks(v.score.meter)).toBe(2880);
      expect(measureCountOf(v.score)).toBe(1);
      expect(v.challengeDescriptor.smallestValue).toBe('eighth');
    }
    expect(noteTicks(v1)).toEqual([[0, 1440], [1440, 480], [1920, 480], [2400, 480]]);
    expect(noteTicks(v2)).toEqual([[0, 960], [960, 480], [1440, 960], [2400, 480]]);
    for (const v of [v1, v2]) expect(v.score.events.reduce((s, e) => s + e.durationTicks, 0)).toBe(2880);
  });

  it('템포 기준은 점4분음표(분당 60)이고, 큰 박은 둘(1440틱)이다: 한 바퀴가 2초', () => {
    for (const v of [v1, v2]) {
      expect([v.score.tempoReference, v.score.tempoBpm]).toEqual(['dottedQuarter', 60]);
      const s = timelineOf(v);
      expect([s.measureTicks, s.beatTicks, s.cellTicks, s.measures]).toEqual([2880, 1440, 480, 1]);
    }
  });

  it('바퀴의 못 구멍 수(6)와 칸 하나(480틱)가 판본의 8분음표 칸과 같다', () => {
    for (const v of [v1, v2]) expect(timelineOf(v).cellTicks).toBe(wheel.cellTicks);
    expect(wheel.cells * wheel.cellTicks).toBe(timelineOf(v1).measureTicks);
  });

  it('칸의 이름은 6/8의 박으로 부른다: 1박 / 1박 2번째 칸 / 1박 3번째 칸 / 2박 …', () => {
    const s = timelineOf(v1);
    expect([0, 480, 960, 1440, 1920, 2400].map((t) => tickLabel(s, 0, t))).toEqual(['1박', '1박 2번째 칸', '1박 3번째 칸', '2박', '2박 2번째 칸', '2박 3번째 칸']);
  });

  describe('판정기는 6/8의 마디를 2880틱으로 본다(X-2: 마디 길이를 박자표에서 계산)', () => {
    const judge = (v: typeof v1, score: typeof v1.score) => evaluateRhythmPlacement(v.evaluatorSpec as RhythmPlacementSpec, v.score, { type: 'rhythmPlacement', score });
    const issueOf = (r: ReturnType<typeof judge>) => r.issues.map((i) => [i.code, i.params.where]);

    it('두 판본 모두 정답 악보는 통과한다. 판정하는 마디 길이는 2880틱, 마디는 하나다', () => {
      for (const v of [v1, v2]) {
        const r = judge(v, v.score);
        expect([r.passed, r.issues]).toEqual([true, []]);
        expect(r.details).toEqual({ measureTicks: 2880, measureCount: 1 });
      }
      expect(v1.evaluatorSpec).toMatchObject({ type: 'rhythmPlacement', requirePitch: true });
    });

    it('음이 다르면 놓인 자리를 8분음표 자리로 말한다(4/4의 박으로 말하지 않는다). 음높이도 본다', () => {
      const s = clone(v1.score);
      const last = s.events[3]!;
      if (!isNote(last)) throw new Error('마지막 사건은 음표다');
      last.writtenPitch = { letter: 'C', accidental: null, octave: 4 };
      last.resolvedPitch = { letter: 'C', alter: 0, octave: 4, midi: 60 };
      const r = judge(v1, s);
      expect(r.passed).toBe(false);
      expect(issueOf(r)).toEqual([['PITCH_MISMATCH', '여섯 번째 8분음표 자리']]);
      expect(r.issues[0]!.params).toMatchObject({ expectedName: 'F4', actualName: 'C4' });
    });

    it('마디를 덜 채우면 못 채운 자리와 남은 길이를 말한다: 점4분음표 하나 길이', () => {
      const s = clone(v1.score);
      s.events = s.events.slice(0, 1);
      const r = judge(v1, s);
      expect(r.passed).toBe(false);
      expect(issueOf(r)).toEqual([
        ['MISSING_EVENT', '네 번째 8분음표 자리'],
        ['MISSING_EVENT', '다섯 번째 8분음표 자리'],
        ['MISSING_EVENT', '여섯 번째 8분음표 자리'],
        ['MEASURE_TICKS_REMAIN', undefined],
      ]);
      expect(r.issues[3]!.params).toMatchObject({ measureText: '한 마디', remainTicks: 1440, remainText: '점4분음표 하나 길이' });
    });

    it('마디를 넘치게 채우면 넘친 길이를 말한다', () => {
      const s = clone(v1.score);
      s.events[3]!.durationTicks = 960;
      const r = judge(v1, s);
      expect(r.passed).toBe(false);
      expect(issueOf(r)).toEqual([['DURATION_MISMATCH', '여섯 번째 8분음표 자리'], ['MEASURE_TICKS_OVER', undefined]]);
      expect(r.issues[1]!.params).toMatchObject({ overTicks: 480, overText: '8분음표 하나 길이' });
    });

    it('한 판본의 정답을 다른 판본에 내면 통과하지 않는다(두 판본은 서로 다른 답이다)', () => {
      const r = judge(v2, v1.score);
      expect(r.passed).toBe(false);
      expect(issueOf(r).map((x) => x[0])).toEqual(['DURATION_MISMATCH', 'MISSING_EVENT', 'DURATION_MISMATCH', 'PITCH_MISMATCH']);
    });
  });
});

describe('못(돌) 길이의 한도: 세 칸(점4분음표)까지', () => {
  it('못은 8분, 4분, 점4분만 있다. 2분음표와 점2분음표는 줄 전체(두 큰 박)에 걸쳐서 놓지 않는다', () => {
    const s = timelineOf(q19.variants['dotted-quarter-and-eighths']!);
    expect(stoneLengthsOf(s, lane.maxStoneTicks).map((l) => [l.name, l.ticks])).toEqual([['8분음표', 480], ['4분음표', 960], ['점4분음표', 1440]]);
    // 한도가 없으면 2분과 점2분도 놓을 수 있다: 한도는 줄(설치물)이 정한다
    expect(stoneLengthsOf(s).map((l) => l.ticks)).toEqual([480, 960, 1440, 1920, 2880]);
  });

  it('점이 없는 판본(4분과 8분)에서는 점4분 못을 손에 들 수 없다', () => {
    const s = timelineOf(q19.variants['quarters-and-eighths']!);
    expect(s.dottedValues).toEqual([]);
    expect(stoneLengthsOf(s, lane.maxStoneTicks).map((l) => l.name)).toEqual(['8분음표', '4분음표']);
  });

  it('줄의 한도는 maxStoneCells × cellTicks이고, 정답 판본의 가장 긴 못(점4분 1440틱)이 한도에 든다', () => {
    expect(lane.maxStoneTicks).toBe(3 * 480);
    for (const v of Object.values(q19.variants)) for (const e of v.score.events) expect(e.durationTicks).toBeLessThanOrEqual(lane.maxStoneTicks!);
  });
});

describe('바퀴 위의 각도와 칸', () => {
  it('각도는 12시에서 시계 방향이고, 한 바퀴가 한 마디(2880틱 = 360°)다', () => {
    expect(tickToDeg(wheel, 0)).toBe(0);
    expect(tickToDeg(wheel, 480)).toBe(60);
    expect(tickToDeg(wheel, 1440)).toBe(180);
    expect(tickToDeg(wheel, 2880)).toBe(360);
  });

  it('바퀴 위의 점: 0°는 12시, 90°는 3시, 180°는 6시, 270°는 9시', () => {
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    };
    near(wheelPoint(wheel, 0, 100), { x: 6144, y: 2236 });
    near(wheelPoint(wheel, 90, 100), { x: 6244, y: 2336 });
    near(wheelPoint(wheel, 180, 100), { x: 6144, y: 2436 });
    near(wheelPoint(wheel, 270, 100), { x: 6044, y: 2336 });
  });

  it('구역의 비율: 허브 0.27 → 못이 놓이는 고리 0.52–0.88 → 테두리 0.92부터', () => {
    expect(WHEEL_ZONES).toEqual({ hub: 0.27, ringIn: 0.52, ringOut: 0.88, rimIn: 0.92 });
    expect(wheel.hubR).toBeCloseTo(240 * 0.27, 6);
    expect(wheel.ringIn).toBeCloseTo(240 * 0.52, 6);
    expect(wheel.ringOut).toBeCloseTo(240 * 0.88, 6);
    expect(wheel.rimIn).toBeCloseTo(240 * 0.92, 6);
    expect(wheel.hubR).toBeLessThan(wheel.ringIn);
    expect(wheel.ringOut).toBeLessThan(wheel.rimIn);
  });

  it('돌아간 각도는 재생 위치(틱)에 비례한다. 듣지 않으면 0이고, 한 바퀴를 넘지 않는다', () => {
    expect(wheelTurnDeg(wheel, null)).toBe(0);
    expect(wheelTurnDeg(wheel, 0)).toBe(0);
    expect(wheelTurnDeg(wheel, 1440)).toBe(180);
    expect(wheelTurnDeg(wheel, 2880)).toBe(360);
    expect(wheelTurnDeg(wheel, 9999)).toBe(360);
    expect(wheelTurnDeg(wheel, -5)).toBe(0);
  });

  it('칸 찾기: 고리 위의 점은 각도에 맞는 칸이다(1–6). 허브 안쪽과 바퀴 밖은 칸이 아니다', () => {
    const mid = (radius: number, deg: number) => wheelPoint(wheel, deg, radius);
    const ring = (wheel.ringIn + wheel.ringOut) / 2;
    for (let k = 1; k <= 6; k++) {
      const p = mid(ring, (k - 0.5) * 60);
      expect(wheelSlotAt(wheel, p.x, p.y), `${k}번 칸`).toBe(k);
    }
    expect(wheelSlotAt(wheel, wheel.cx, wheel.cy)).toBeNull();
    const hub = mid(wheel.hubR - 1, 30);
    expect(wheelSlotAt(wheel, hub.x, hub.y)).toBeNull();
    const out = mid(wheel.r + 1, 30);
    expect(wheelSlotAt(wheel, out.x, out.y)).toBeNull();
    // 허브 바로 바깥과 테두리 안쪽까지는 칸이다(칸 번호 띠와 테두리도 눌러진다)
    const inner = mid(wheel.hubR + 1, 30);
    const rim = mid(wheel.r - 1, 30);
    expect(wheelSlotAt(wheel, inner.x, inner.y)).toBe(1);
    expect(wheelSlotAt(wheel, rim.x, rim.y)).toBe(1);
  });

  it('칸의 경계: 정확히 12시(0°)는 1번 칸이고, 시계 방향으로 60°마다 다음 칸이다. 12시 바로 왼쪽은 6번 칸이다', () => {
    const ring = (wheel.ringIn + wheel.ringOut) / 2;
    const at = (deg: number) => wheelPoint(wheel, deg, ring);
    expect(wheelSlotAt(wheel, at(0).x, at(0).y)).toBe(1);
    expect(wheelSlotAt(wheel, at(59.9).x, at(59.9).y)).toBe(1);
    expect(wheelSlotAt(wheel, at(60.1).x, at(60.1).y)).toBe(2);
    expect(wheelSlotAt(wheel, at(359.9).x, at(359.9).y)).toBe(6);
  });

  it('듣는 중 바퀴가 돈 만큼 되돌려서 칸을 찾는다: 반시계 방향으로 60° 돌면 화면 0°–60°에 2번 칸이 온다', () => {
    const ring = (wheel.ringIn + wheel.ringOut) / 2;
    const p = wheelPoint(wheel, 30, ring);
    expect(wheelSlotAt(wheel, p.x, p.y, 0)).toBe(1);
    expect(wheelSlotAt(wheel, p.x, p.y, 60)).toBe(2);
    expect(wheelSlotAt(wheel, p.x, p.y, 180)).toBe(4);
    // 한 바퀴를 다 돌면(360°) 제자리다
    expect(wheelSlotAt(wheel, p.x, p.y, 360)).toBe(1);
  });
});

describe('바퀴와 펼친 띠는 같은 초안이다(12.9)', () => {
  it('한 바퀴의 틱이 띠 전체의 틱과 같고, 바퀴의 칸 수가 띠의 자리 수와 같다', () => {
    expect(wheel.turnTicks).toBe(lane.laneTicks);
    expect(wheel.cells).toBe(w4.slots.length);
    expect(wheel.cellTicks).toBe(lane.cellTicks);
  });

  it('같은 틱은 바퀴와 띠에서 같은 칸이다: 바퀴 위의 점 → 칸 번호 = 띠 위의 틱 → 칸 번호', () => {
    const ring = (wheel.ringIn + wheel.ringOut) / 2;
    for (const tick of [0, 1, 239, 479, 480, 960, 1439, 1440, 1441, 1919, 1920, 2400, 2879]) {
      const p = wheelPoint(wheel, tickToDeg(wheel, tick + 0.5), ring);
      expect(wheelSlotAt(wheel, p.x, p.y), `${tick}틱`).toBe(slotOfTick(lane, tick));
    }
  });

  it('칸 k의 띠 위의 사각형은 설치물의 자리 k이고, 눌린 칸은 칸의 시작 틱으로 바뀐다', () => {
    for (let k = 1; k <= 6; k++) {
      const r = laneRect(lane, slotStartTick(lane, k), slotStartTick(lane, k) + 480);
      expect(r, `${k}번`).toEqual({ x: w4.slots[k - 1]!.x, y: w4.slots[k - 1]!.y, w: w4.slots[k - 1]!.w, h: w4.slots[k - 1]!.h });
      expect(slotStartTick(lane, k)).toBe((k - 1) * 480);
    }
  });

  it('띠를 눌러도 같은 칸이 눌린다(바퀴 밖에서 띠를 누를 수 있다)', () => {
    // 띠 3번 자리 한가운데
    const s = w4.slots[2]!;
    expect(tickAtSlotPoint(lane, 3, s.x + s.w / 2, s.y + s.h / 2)).toBe(960 + 240);
    expect(slotOfTick(lane, 960 + 240)).toBe(3);
  });

  it('바퀴는 띠와 겹치지 않는다: 바퀴의 서쪽 끝(5904)이 띠의 동쪽 끝(5856)에서 48 px 떨어져 있다', () => {
    const bandEast = Math.max(...w4.slots.map((s) => s.x + s.w));
    expect(wheel.cx - wheel.r - bandEast).toBe(48);
  });
});

describe('큰 박의 구간과 무늬', () => {
  it('6/8은 큰 박 둘이다: 첫째는 줄무늬(0°–180°), 둘째는 점무늬(180°–360°)', () => {
    expect(wheelBeats(wheel, 1440)).toEqual([
      { beat: 1, fromTick: 0, toTick: 1440, fromDeg: 0, toDeg: 180, pattern: 'stripes' },
      { beat: 2, fromTick: 1440, toTick: 2880, fromDeg: 180, toDeg: 360, pattern: 'dots' },
    ]);
  });

  it('박이 더 잘게 나뉘면 줄무늬와 점무늬가 번갈아 온다(색이 아니라 무늬로 구분)', () => {
    const beats = wheelBeats(wheel, 960);
    expect(beats.map((b) => [b.beat, b.pattern])).toEqual([[1, 'stripes'], [2, 'dots'], [3, 'stripes']]);
    expect(beats[2]!.toDeg).toBe(360);
  });

  it('마디가 한 바퀴보다 짧으면 마디까지만 나눈다(3/4 같은 판본이 놓여도 바퀴를 벗어나지 않는다)', () => {
    expect(wheelBeats(wheel, 960, 1920).map((b) => b.toTick)).toEqual([960, 1920]);
    expect(wheelBeats(wheel, 1440, 99999).at(-1)!.toTick).toBe(2880);
  });
});

describe('카메라: 바퀴와 띠를 한 화면에 담는다', () => {
  it('slotBounds는 띠와 바퀴 전체(박 번호 띠 44 px 포함)를 담는다: x 5716–6384, y 2096–2576', () => {
    expect(slotBounds(w4)).toEqual({ x: 5716, y: 2096, w: 668, h: 480 });
    const b = slotBounds(w4);
    expect(b.x).toBeLessThanOrEqual(w4.slots[0]!.x - 44);
    expect(b.x + b.w).toBeGreaterThanOrEqual(wheel.cx + wheel.r);
    expect(b.y).toBeLessThanOrEqual(wheel.cy - wheel.r);
    expect(b.y + b.h).toBeGreaterThanOrEqual(wheel.cy + wheel.r);
  });

  it('칸이 화면에서 48 px 아래로 줄지 않게 하한을 잡는다: 칸 80 px × 0.6 = 48. 징검다리(E1–E3)의 하한 0.8은 그대로다', () => {
    expect(MIN_CELL_ON_SCREEN).toBe(48);
    // 바퀴는 가로로도 넓어서(668 px) 좁은 휴대폰에서도 칸 48 px를 지키려고 너비 한도를 풀어 둔다(strictMinZoom)
    expect(frameTuningOf(w4)).toEqual({ pad: STONES_FRAME_PAD, minZoom: 0.6, strictMinZoom: true });
    expect(80 * 0.6).toBe(MIN_CELL_ON_SCREEN);
    expect(frameTuningOf(e1)).toEqual({ pad: STONES_FRAME_PAD, minZoom: STONES_MIN_ZOOM });
    expect(frameTuningOf(e3)).toEqual({ pad: STONES_FRAME_PAD, minZoom: STONES_MIN_ZOOM });
  });

  it('wheelFollowOf: 물레방아가 아니면 null이다. 고른 칸이 없으면 바퀴의 가운데, 있으면 바퀴 칸의 가운데(focus)와 띠의 같은 칸 가운데(alsoShow)다', () => {
    expect(wheelFollowOf(e1)).toBeNull();
    expect(wheelFollowOf(e3, { cursor: { startTick: 0 } })).toBeNull();
    const none = wheelFollowOf(w4)!;
    expect(none.rect).toEqual(slotBounds(w4));
    expect(none.focus).toEqual({ x: 6144, y: 2336 });
    expect(none.alsoShow).toBeUndefined();
    expect(wheelFollowOf(w4, { cursor: null })!.focus).toEqual({ x: 6144, y: 2336 });
    for (let k = 0; k < 6; k++) {
      const f = wheelFollowOf(w4, { cursor: { startTick: k * 480 + 100 } })!;
      const ring = wheelPoint(wheel, tickToDeg(wheel, k * 480 + 240), (wheel.ringIn + wheel.ringOut) / 2);
      const cell = w4.slots[k]!;
      expect(f.focus.x).toBeCloseTo(ring.x, 9);
      expect(f.focus.y).toBeCloseTo(ring.y, 9);
      expect(f.alsoShow).toEqual({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
    }
    // 12시 쪽 칸(1번)의 바퀴 칸은 위, 띠의 1번 칸도 위다. 6번 칸은 바퀴에서는 위(11시), 띠에서는 맨 아래다
    expect(wheelFollowOf(w4, { cursor: { startTick: 0 } })!.alsoShow!.y).toBeLessThan(wheelFollowOf(w4, { cursor: { startTick: 5 * 480 } })!.alsoShow!.y);
    expect(wheelFollowOf(w4, { cursor: { startTick: 5 * 480 } })!.focus.y).toBeLessThan(wheelFollowOf(w4, { cursor: { startTick: 5 * 480 } })!.alsoShow!.y);
    // 윤곽의 처음(startTick)과 고른 칸(at)이 다르면 고른 칸을 따른다. 칸 수를 넘는 틱은 마지막 칸으로 가둔다
    expect(wheelFollowOf(w4, { cursor: { startTick: 0, at: 960 } })).toEqual(wheelFollowOf(w4, { cursor: { startTick: 960 } }));
    expect(wheelFollowOf(w4, { cursor: { startTick: 99999 } })).toEqual(wheelFollowOf(w4, { cursor: { startTick: 5 * 480 } }));
  });

  /**
   * 설계서 7.3: 설치물 전체가 메뉴 띠 아래와 조작 막대 위에 들어오면 전체를 비추고, 칸이 48 px 아래로 줄 것 같으면 줄이지 않고 고른 칸을 따라간다.
   * 조작 막대 높이는 D-139에서 잰 값이다: 데스크톱 441 px, 세로 화면 646 px
   */
  describe('화면 크기마다의 자세(followPose)', () => {
    const rect = slotBounds(w4);
    const tuning = frameTuningOf(w4);
    const sizes: Array<{ name: string; width: number; height: number; inset: number }> = [
      { name: '1280×720', width: 1280, height: 720, inset: 441 },
      { name: '1920×1080', width: 1920, height: 1080, inset: 441 },
      { name: '세로 430×932', width: 430, height: 932, inset: 646 },
      { name: '세로 412×915', width: 412, height: 915, inset: 646 },
      // 폭 401 px(= 668 × 0.6) 아래: 너비에 맞추면 칸이 48 px 아래로 줄어드는 휴대폰. 바퀴는 배율을 지키고 가로로도 따라간다.
      // 막대 높이는 잰 값이다(D-139, D-151): 폭 390 px에서 646 px. 폭 360 px에서는 671 px(360×740)라 카메라가 믿는 한계
      // (화면 높이의 90%에서 메뉴 띠를 뺀 값, 800 px에서 656 px)보다 15 px 크다: 이 크기는 카메라가 다루는 값으로 그린다(6-6의 알려진 한계, D-151)
      { name: '세로 390×844', width: 390, height: 844, inset: 646 },
      { name: '세로 360×800', width: 360, height: 800, inset: Math.floor(0.9 * 800) - MENU_BAND },
    ];
    const poseOf = (cursor: { startTick: number } | null, s: (typeof sizes)[number]): { pose: CameraPose; f: NonNullable<ReturnType<typeof wheelFollowOf>> } => {
      const f = wheelFollowOf(w4, { cursor })!;
      return { f, pose: followPose(f.rect, f.focus, { width: s.width, height: s.height }, { ...tuning, bottomInset: s.inset, topInset: MENU_BAND, ...(f.alsoShow ? { alsoShow: f.alsoShow } : {}) }) };
    };
    const screen = (pose: CameraPose, s: (typeof sizes)[number], x: number, y: number) => ({ x: (x - pose.center.x) * pose.zoom + s.width / 2, y: (y - pose.center.y) * pose.zoom + s.height / 2 });

    for (const s of sizes) {
      it(`${s.name}: 칸이 화면에서 48 px 아래로 줄지 않는다(띠의 칸도, 바퀴 고리의 두께도)`, () => {
        const { pose } = poseOf(null, s);
        expect(pose.zoom).toBeGreaterThanOrEqual(0.6 - 1e-9);
        expect(w4.slots[0]!.h * pose.zoom).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
        expect((wheel.ringOut - wheel.ringIn) * pose.zoom).toBeGreaterThanOrEqual(MIN_CELL_ON_SCREEN - 1e-6);
      });

      it(`${s.name}: 어느 칸을 골라도 바퀴의 그 칸 가운데는 메뉴 띠 아래, 조작 막대 위에 온전히 보이고, 띠의 그 칸은 둘이 함께 보이는 크기에 들면 함께 보인다`, () => {
        const lo = MENU_BAND;
        const hi = s.height - s.inset;
        for (let k = 0; k < 6; k++) {
          const { pose, f } = poseOf({ startTick: k * 480 }, s);
          // 바퀴 칸: 누르는 자리(고리의 가운데)가 고리의 반 두께(43 px × 배율)만큼 여유를 두고 보인다
          const ring = wheelPoint(wheel, tickToDeg(wheel, k * 480 + 240), (wheel.ringIn + wheel.ringOut) / 2);
          const at = screen(pose, s, ring.x, ring.y);
          const half = ((wheel.ringOut - wheel.ringIn) / 2) * pose.zoom;
          expect(at.y - half, `${k + 1}번 바퀴 칸의 위`).toBeGreaterThanOrEqual(lo - 1e-6);
          expect(at.y + half, `${k + 1}번 바퀴 칸의 아래`).toBeLessThanOrEqual(hi + 1e-6);
          expect(at.x, `${k + 1}번 바퀴 칸의 왼쪽`).toBeGreaterThanOrEqual(0);
          expect(at.x, `${k + 1}번 바퀴 칸의 오른쪽`).toBeLessThanOrEqual(s.width);
          // 띠 칸: 두 점이 칸 하나씩의 여유(SHOW_MARGIN)를 두고 보이는 범위에 들면 함께 보인다. 들지 않으면 바퀴 칸만 비춘다
          const cell = w4.slots[k]!;
          const visH = (hi - lo) / pose.zoom;
          const visW = s.width / pose.zoom;
          const pair = Math.abs(f.alsoShow!.y - f.focus.y) <= visH - 2 * SHOW_MARGIN && Math.abs(f.alsoShow!.x - f.focus.x) <= visW - 2 * SHOW_MARGIN;
          if (pair) {
            const top = screen(pose, s, cell.x, cell.y).y;
            const bottom = screen(pose, s, cell.x, cell.y + cell.h).y;
            expect(top, `${k + 1}번 띠 칸의 위`).toBeGreaterThanOrEqual(lo - 1e-6);
            expect(bottom, `${k + 1}번 띠 칸의 아래`).toBeLessThanOrEqual(hi + 1e-6);
            expect(screen(pose, s, cell.x, cell.y).x, `${k + 1}번 띠 칸의 왼쪽`).toBeGreaterThanOrEqual(-1e-6);
            expect(screen(pose, s, cell.x + cell.w, cell.y).x, `${k + 1}번 띠 칸의 오른쪽`).toBeLessThanOrEqual(s.width + 1e-6);
          }
        }
      });

      it(`${s.name}: 칸을 고르기 전에도 바퀴의 가운데가 메뉴 띠 아래, 조작 막대 위에 보인다`, () => {
        const { pose } = poseOf(null, s);
        const at = screen(pose, s, wheel.cx, wheel.cy);
        expect(at.y).toBeGreaterThanOrEqual(MENU_BAND);
        expect(at.y).toBeLessThanOrEqual(s.height - s.inset);
      });
    }

    it('1920×1080: 바퀴와 띠 전체가 메뉴 띠 아래, 조작 막대 위에 들어오고 어느 칸을 골라도 카메라는 가만히 있다', () => {
      const s = sizes[1]!;
      const first = poseOf(null, s).pose;
      const a = screen(first, s, rect.x, rect.y);
      const b = screen(first, s, rect.x + rect.w, rect.y + rect.h);
      expect(a.y).toBeGreaterThanOrEqual(MENU_BAND);
      expect(b.y).toBeLessThanOrEqual(s.height - s.inset);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(s.width);
      for (let k = 0; k < 6; k++) expect(poseOf({ startTick: k * 480 }, s).pose).toEqual(first);
    });

    it('작은 화면(1280×720, 430×932)에서는 고른 칸에 따라 카메라가 위아래로만 움직인다. 배율은 그대로다', () => {
      for (const s of [sizes[0]!, sizes[2]!]) {
        const top = poseOf({ startTick: 0 }, s).pose;
        const bottom = poseOf({ startTick: 3 * 480 }, s).pose;
        expect(bottom.center.y).toBeGreaterThan(top.center.y);
        expect(bottom.zoom).toBe(top.zoom);
        expect(bottom.center.x).toBe(top.center.x);
      }
    });

    it('폭 401 px 아래의 휴대폰(390, 360): 배율은 0.6이라 칸이 48 px이고, 가로로도 고른 칸을 따라간다', () => {
      for (const s of [sizes[4]!, sizes[5]!]) {
        const a = poseOf({ startTick: 0 }, s).pose; // 1번 칸: 바퀴의 오른쪽 위
        const b = poseOf({ startTick: 4 * 480 }, s).pose; // 5번 칸: 바퀴의 왼쪽
        expect(a.zoom, s.name).toBeCloseTo(0.6, 9);
        expect(b.zoom, s.name).toBeCloseTo(0.6, 9);
        // 담는 사각형(668 + 여유)이 보이는 너비(폭 ÷ 0.6)보다 넓다: 카메라가 가로로 움직인다. 바퀴의 오른쪽 칸을 고르면 더 오른쪽을 비춘다
        expect(s.width / 0.6, s.name).toBeLessThan(rect.w + 2 * tuning.pad!);
        expect(a.center.x, s.name).toBeGreaterThan(b.center.x);
        // 너비에 맞추기만 했다면(strictMinZoom 없이) 배율은 폭 ÷ 사각형 너비까지 내려가 칸이 48 px 아래가 된다
        const f = wheelFollowOf(w4, { cursor: { startTick: 0 } })!;
        const loose = followPose(f.rect, f.focus, { width: s.width, height: s.height }, { pad: tuning.pad!, minZoom: tuning.minZoom!, bottomInset: s.inset, topInset: MENU_BAND });
        expect(loose.zoom, s.name).toBeLessThan(0.6);
        expect(80 * loose.zoom, s.name).toBeLessThan(MIN_CELL_ON_SCREEN);
      }
    });
  });
});

describe('6/8 자유로 놀기의 틀(4.2)', () => {
  it('물레방아의 틀은 6/8 한 마디, 8분음표 칸, 두 판본의 음역을 아우른 C4–F4이고 목표 악보가 비어 있다', () => {
    const frame = freeStonesFrameOf(w4, variantOf)!;
    expect(frame.score.meter).toBe('6/8');
    expect(measureCountOf(frame.score)).toBe(1);
    expect(frame.score.events).toEqual([]);
    expect(frame.challengeDescriptor.smallestValue).toBe('eighth');
    expect(frame.challengeDescriptor.range).toBe('C4-F4');
    // 같은 입력에는 같은 틀을 돌려준다(화면이 틀이 바뀐 줄 알고 다시 그리지 않게)
    expect(freeStonesFrameOf(w4, variantOf)).toBe(frame);
  });

  it('틀의 시간선은 줄과 같다: 2880틱, 칸 480틱, 큰 박 1440틱', () => {
    const s = timelineOf(freeStonesFrameOf(w4, variantOf)!);
    expect([s.measureTicks, s.cellTicks, s.beatTicks]).toEqual([2880, 480, 1440]);
  });

  it('바뀌지 않은 것: 4/4 줄(E1)의 틀은 여전히 4/4 한 마디다', () => {
    const frame = freeStonesFrameOf(e1, variantOf)!;
    expect(frame.score.meter).toBe('4/4');
    expect(timelineOf(frame).measureTicks).toBe(3840);
  });
});

describe('바퀴의 낱말: 못과 빈 구멍', () => {
  it('빈 구멍을 말로: 하나, 여럿, 하나도 없음', () => {
    const s = timelineOf(q19.variants['dotted-quarter-and-eighths']!);
    expect(waterSentence(s, [{ from: 0, to: 2880 }], 0, WHEEL_WATER_WORDS)).toBe('빈 구멍은 1박부터 마디 끝까지 2880틱(점2분음표 하나 길이)이에요.');
    expect(waterSentence(s, [{ from: 480, to: 960 }, { from: 2400, to: 2880 }], 0, WHEEL_WATER_WORDS)).toContain('빈 구멍은 2곳, 모두 960틱이에요.');
    expect(waterSentence(s, [], 0, WHEEL_WATER_WORDS)).toBe('빈 구멍이 없어요. 못이 한 마디를 빈틈없이 채웠어요.');
  });

  it('낱말을 주지 않으면 징검다리의 말이다(E1–E3는 그대로)', () => {
    const s = timelineOf(q19.variants['dotted-quarter-and-eighths']!);
    expect(waterSentence(s, [])).toBe('남은 물이 없어요. 돌이 한 마디를 빈틈없이 채웠어요.');
  });
});

describe('바퀴 설치물을 검사한다(10.4)', () => {
  const mutate = (fn: (raw: Record<string, any>) => void): InstallationDef => {
    const raw = clone(rawE4);
    fn(raw);
    return load(raw);
  };

  it('바퀴가 없는 물레방아는 WHEEL_MISSING', () => {
    expect(codes([mutate((r) => delete r.slotMap.wheel)])).toContain('WHEEL_MISSING');
  });

  it('물레방아가 아닌데 바퀴가 있으면 WHEEL_ARCHETYPE', () => {
    const e = clone(readJson('content', 'installations', 'inst.beat-river.first-ford.json') as Record<string, any>);
    e.slotMap.wheel = { cx: 7000, cy: 2400, r: 100 };
    expect(codes([load(e)])).toContain('WHEEL_ARCHETYPE');
  });

  it('바퀴가 펼친 띠와 겹치면 WHEEL_OVERLAP', () => {
    expect(codes([mutate((r) => (r.slotMap.wheel.cx = 5900))])).toContain('WHEEL_OVERLAP');
  });

  it('바퀴가 지역 밖으로 나가면 WHEEL_OUTSIDE (박자 강가는 x 5600부터다)', () => {
    expect(codes([mutate((r) => (r.slotMap.wheel = { cx: 5700, cy: 2336, r: 240 }))])).toContain('WHEEL_OUTSIDE');
  });

  it('칸이 하나뿐이면 바퀴를 각도로 나눌 수 없다: WHEEL_CELLS', () => {
    expect(codes([mutate((r) => (r.slots = [r.slots[0]]))])).toContain('WHEEL_CELLS');
  });

  it('한 바퀴가 한 마디가 아니면(줄이 마디보다 길면) SLOTMAP_COUNT', () => {
    const longer = mutate((r) => {
      r.slots = Array.from({ length: 8 }, (_, i) => ({ slot: i + 1, x: 5760, y: 2096 + 80 * i, w: 96, h: 80 }));
    });
    expect(codes([longer])).toContain('SLOTMAP_COUNT');
  });

  it('못의 한도(maxStoneCells)보다 긴 음이 정답에 있으면 SLOTMAP_STONE_LENGTH', () => {
    // 한도 2칸(960틱): 점4분음표(1440틱)가 들어 있는 첫 판본이 걸린다
    expect(codes([mutate((r) => (r.slotMap.maxStoneCells = 2))])).toContain('SLOTMAP_STONE_LENGTH');
    // 한도 3칸이면 문제가 없다
    expect(codes([mutate((r) => (r.slotMap.maxStoneCells = 3))])).not.toContain('SLOTMAP_STONE_LENGTH');
  });

  it('바퀴의 값이 숫자가 아니거나 한도가 1칸보다 작으면 읽기에서 SHAPE', () => {
    const bad = clone(rawE4);
    bad.slotMap.wheel = { cx: 'x', cy: 2336, r: 240 };
    expect(parseInstallation(bad, 'x.json').issues.map((i) => i.code)).toContain('SHAPE');
    const bad2 = clone(rawE4);
    bad2.slotMap.maxStoneCells = 0;
    expect(parseInstallation(bad2, 'x.json').issues.map((i) => i.code)).toContain('SHAPE');
  });
});
