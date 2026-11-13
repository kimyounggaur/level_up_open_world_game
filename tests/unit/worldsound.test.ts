// 4-5, 4-6 세계 소리의 순수 계산: 격자, 광장 합주, 서명 소리, 들리는 거리(설계서 6.2, 8.2~8.4).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHORD_ROOT, CHORD_VOICING } from '@/domain/worldsound';
import {
  BAR_SEC,
  BEAT_SEC,
  HEAR_RADIUS,
  LOOP_BARS,
  LOOP_SEC,
  MIN_HEARD_GAIN,
  PROGRESSION,
  REGION_TIMBRE,
  SIGNATURE_PERIOD_BARS,
  WORLD_BPM,
  barInLoop,
  barIndexAt,
  barStartTime,
  diatonicStepUp,
  hearGain,
  hearPan,
  lastRingBar,
  plazaBar,
  rings,
  signatureOf,
  signatureOffset,
} from '@/domain/worldsound';
import type { WorldNote } from '@/domain/worldsound';
import { REGION_IDS, WorldMap, parseRegion } from '@/domain/world';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'content', 'regions');
const map = new WorldMap(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => parseRegion(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')), f).region!));

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const pc = (midi: number): number => ((midi % 12) + 12) % 12;
const allNotes = (n: readonly WorldNote[]): boolean => n.every((x) => C_MAJOR.has(pc(x.midi)));

describe('세계 시계의 격자(8.2)', () => {
  it('4분음표 80, 4/4, 8마디, 24초다', () => {
    expect(WORLD_BPM).toBe(80);
    expect(BEAT_SEC).toBeCloseTo(0.75, 10);
    expect(BAR_SEC).toBeCloseTo(3, 10);
    expect(LOOP_BARS).toBe(8);
    expect(LOOP_SEC).toBeCloseTo(24, 10);
  });

  it('시각과 마디 번호가 서로 바뀐다', () => {
    const t0 = 100.25;
    for (const n of [-3, -1, 0, 1, 7, 8, 40]) {
      expect(barIndexAt(barStartTime(n, t0), t0)).toBe(n);
      expect(barIndexAt(barStartTime(n, t0) + BAR_SEC - 0.001, t0)).toBe(n);
    }
  });

  it('8마디 되풀이 안의 자리는 음수 마디에서도 0–7이다', () => {
    expect([-9, -8, -1, 0, 7, 8, 9].map(barInLoop)).toEqual([7, 0, 7, 0, 7, 0, 1]);
  });
});

describe('광장 합주의 뼈대(8.3)', () => {
  it('화음은 C F G C Am F G C 여덟 마디다', () => {
    expect([...PROGRESSION]).toEqual(['C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C']);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((b) => plazaBar(b, 0).chord)).toEqual([...PROGRESSION]);
    expect(plazaBar(8, 0).chord).toBe('C'); // 되풀이
  });

  it('세계에서 저절로 나는 음은 전부 다장조의 음이다(모든 마디, 모든 층)', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      for (let layer = 0; layer <= 3; layer++) {
        const b = plazaBar(bar, layer);
        expect(allNotes(b.pulse), `맥박 마디 ${bar}`).toBe(true);
        expect(allNotes(b.bed), `화음 깔기 마디 ${bar} 층 ${layer}`).toBe(true);
      }
    }
  });

  it('화음의 세 음이 그 화음의 음이다(C: 도 미 솔, F: 파 라 도, G: 솔 시 레, Am: 라 도 미)', () => {
    const want: Record<string, number[]> = { C: [0, 4, 7], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4] };
    for (const [name, notes] of Object.entries(CHORD_VOICING)) {
      expect(new Set(notes.map(pc))).toEqual(new Set(want[name]));
    }
    // 맥박이 치는 음은 그 화음의 뿌리음이다
    const rootPc: Record<string, number> = { C: 0, F: 5, G: 7, Am: 9 };
    for (const [name, root] of Object.entries(CHORD_ROOT)) expect(pc(root), name).toBe(rootPc[name]);
  });

  it('맥박은 층이 0이어도 있고 마디마다 네 박이다. 첫 박이 가장 세다', () => {
    for (let layer = 0; layer <= 3; layer++) {
      const p = plazaBar(0, layer).pulse;
      expect(p.map((n) => n.beat)).toEqual([0, 1, 2, 3]);
      expect(p[0]!.velocity).toBeGreaterThan(p[1]!.velocity);
    }
  });

  it('마을 1층은 온음표 화음, 2층은 2분음표 화음, 3층은 4분음표로 펼친 화음이다(6.2 표)', () => {
    expect(plazaBar(0, 0).bed).toEqual([]);
    const whole = plazaBar(0, 1).bed;
    expect(whole).toHaveLength(3);
    expect(new Set(whole.map((n) => n.beat))).toEqual(new Set([0]));
    expect(whole.every((n) => n.beats > 3.5)).toBe(true);
    const half = plazaBar(0, 2).bed;
    expect(half).toHaveLength(6);
    expect(new Set(half.map((n) => n.beat))).toEqual(new Set([0, 2]));
    expect(half.every((n) => n.beats > 1.5 && n.beats < 2)).toBe(true);
    const quarter = plazaBar(0, 3).bed;
    expect(quarter.map((n) => n.beat)).toEqual([0, 1, 2, 3]);
    expect(quarter.every((n) => n.beats < 1)).toBe(true);
    // 펼친 화음: 뿌리, 3도, 5도, 3도 차례로 같은 세 음에서 나온다
    const [a, b, c] = CHORD_VOICING.C;
    expect(quarter.map((n) => n.midi)).toEqual([a + 12, b + 12, c + 12, b + 12]);
  });

  it('층이 3을 넘어도 3과 같고, 음수는 0과 같다', () => {
    expect(plazaBar(2, 9).bed).toEqual(plazaBar(2, 3).bed);
    expect(plazaBar(2, -1).bed).toEqual([]);
  });

  it('모든 음이 마디 안에서 시작하고 끝난다', () => {
    for (let layer = 0; layer <= 3; layer++) {
      for (const n of [...plazaBar(3, layer).pulse, ...plazaBar(3, layer).bed]) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat + n.beats).toBeLessThanOrEqual(4);
        expect(n.velocity).toBeGreaterThan(0);
        expect(n.velocity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('들리는 거리(8.4)', () => {
  it('음량은 (1 − 거리 ÷ 900)의 제곱이고 900 px 밖에서는 0이다', () => {
    expect(HEAR_RADIUS).toBe(900);
    expect(hearGain(0)).toBe(1);
    expect(hearGain(450)).toBeCloseTo(0.25, 10);
    expect(hearGain(900)).toBe(0);
    expect(hearGain(901)).toBe(0);
    expect(hearGain(5000)).toBe(0);
    expect(hearGain(-1)).toBe(0);
    expect(hearGain(Number.NaN)).toBe(0);
  });

  it('가까울수록 크다(줄지 않는 방향으로 단조롭다)', () => {
    let prev = Infinity;
    for (let d = 0; d <= 900; d += 30) {
      const g = hearGain(d);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
  });

  it('너무 작아서 내지 않는 문턱이 있다(바로 앞에서 끝까지 들리다가 사라지지 않게 0.01)', () => {
    expect(MIN_HEARD_GAIN).toBe(0.01);
    // 거리 810 px에서 음량 0.01이다
    expect(hearGain(810)).toBeCloseTo(0.01, 10);
  });

  it('캐릭터의 왼쪽에 있으면 왼쪽(−)에서 더 크게 들린다', () => {
    expect(hearPan(-300)).toBeLessThan(0);
    expect(hearPan(300)).toBeGreaterThan(0);
    expect(hearPan(0)).toBe(0);
    expect(hearPan(-5000)).toBe(-1);
    expect(hearPan(5000)).toBe(1);
    expect(hearPan(Number.NaN)).toBe(0);
  });
});

describe('서명 소리(8.4)', () => {
  it('4마디에 한 번, 정거장마다 시작 마디가 다르다', () => {
    expect(SIGNATURE_PERIOD_BARS).toBe(4);
    for (const offset of [0, 1, 2, 3]) {
      const hits = Array.from({ length: 16 }, (_, bar) => (rings(bar, offset) ? bar : -1)).filter((b) => b >= 0);
      expect(hits).toEqual([offset, offset + 4, offset + 8, offset + 12]);
    }
    // 음수 마디에서도 같다
    expect(rings(-4, 0)).toBe(true);
    expect(rings(-3, 1)).toBe(true);
  });

  it('가장 최근에 울린 마디: 지금 마디 이하에서 그 자리의 마디다(소리 물결이 같은 박에 퍼진다)', () => {
    for (const offset of [0, 1, 2, 3]) {
      for (let bar = -9; bar <= 20; bar++) {
        const last = lastRingBar(bar, offset);
        expect(last).toBeLessThanOrEqual(bar);
        expect(bar - last).toBeLessThan(SIGNATURE_PERIOD_BARS);
        expect(rings(last, offset)).toBe(true);
        // 울리는 마디에서는 그 마디 자신이다
        if (rings(bar, offset)) expect(last).toBe(bar);
      }
    }
    expect(lastRingBar(10, 3)).toBe(7);
    expect(lastRingBar(7, 3)).toBe(7);
    expect(lastRingBar(6, 3)).toBe(3);
  });

  it('정거장 스물세 곳의 시작 마디가 네 칸에 고르게 퍼진다(한꺼번에 울리지 않는다)', () => {
    const counts = [0, 0, 0, 0];
    map.stations.forEach((_, i) => counts[signatureOffset(i)]!++);
    expect(map.stations).toHaveLength(23);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // 마을의 다섯 정거장은 두 곳 이상이 같은 마디에 울리지 않는다(한 곳만 겹친다)
    const village = map.stations.filter((s) => s.regionId === 'village').map((s) => signatureOffset(map.stations.indexOf(s)));
    expect(village).toHaveLength(5);
    expect(new Set(village).size).toBeGreaterThanOrEqual(4);
  });

  it('같은 정거장은 늘 같은 가락이다', () => {
    expect(signatureOf('H4')).toEqual(signatureOf('H4'));
  });

  it('스물세 정거장의 가락이 모두 다르다', () => {
    const seen = new Map<string, string>();
    for (const s of map.stations) {
      const key = JSON.stringify(signatureOf(s.stationId).base.map((n) => [n.midi, n.beat, n.beats]));
      expect(seen.has(key), `${s.stationId}와 ${seen.get(key)}의 가락이 같다`).toBe(false);
      seen.set(key, s.stationId);
    }
  });

  it('가락은 한 마디 안이고, 다장조의 음이고, 으뜸화음 음(도·미·솔)으로 끝난다', () => {
    for (const s of map.stations) {
      const { base, flowerVoice } = signatureOf(s.stationId);
      expect(base.length).toBeGreaterThanOrEqual(3);
      expect(allNotes(base), s.stationId).toBe(true);
      expect(allNotes(flowerVoice), `${s.stationId} 꽃등 성부`).toBe(true);
      for (const n of base) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat + n.beats).toBeLessThanOrEqual(4);
      }
      const last = base[base.length - 1]!;
      expect([0, 4, 7]).toContain(pc(last.midi));
      // 소리의 범위는 C4–G5
      expect(Math.min(...base.map((n) => n.midi))).toBeGreaterThanOrEqual(60);
      expect(Math.max(...base.map((n) => n.midi))).toBeLessThanOrEqual(79);
    }
  });

  it('꽃등 판은 같은 가락에 성부가 하나 더해진 것이다: 같은 박에 3도 위 음, 더 여리게', () => {
    for (const s of map.stations) {
      const { base, flowerVoice } = signatureOf(s.stationId);
      expect(flowerVoice).toHaveLength(base.length);
      base.forEach((n, i) => {
        const f = flowerVoice[i]!;
        expect(f.beat).toBe(n.beat);
        expect(f.beats).toBe(n.beats);
        expect([3, 4]).toContain(f.midi - n.midi); // 단3도 또는 장3도 위(온음계의 3도)
        expect(f.velocity).toBeLessThan(n.velocity);
      });
    }
  });

  it('온음계 계단 올리기: 도 → 미, 미 → 솔, 시 → 레', () => {
    expect(diatonicStepUp(60, 2)).toBe(64);
    expect(diatonicStepUp(64, 2)).toBe(67);
    expect(diatonicStepUp(71, 2)).toBe(74);
    expect(diatonicStepUp(60, 0)).toBe(60);
    expect(diatonicStepUp(60, 7)).toBe(72);
  });

  it('지역마다 음색이 정해져 있다', () => {
    for (const id of REGION_IDS) expect(REGION_TIMBRE[id], id).toBeTruthy();
    expect(new Set(Object.values(REGION_TIMBRE)).size).toBe(REGION_IDS.length);
  });
});
