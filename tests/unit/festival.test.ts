// 6.4 잔치 열기의 순수 계산: 48초(8마디 × 2), 합주의 첫 마디부터, 층 0에서도 맥박, 악사 구성, 내 곡 이어 듣기용 재생.
import { describe, expect, it } from 'vitest';
import { CREATION_BAR_TICKS, SONG_GAP_MEASURES, creationPlayback, creationsPlayback } from '@/domain/creation';
import {
  FESTIVAL_ASK_TEXT,
  FESTIVAL_BARS,
  FESTIVAL_LOOPS,
  FESTIVAL_MIN_LEAD_SEC,
  FESTIVAL_SECONDS,
  MUSICIAN_NAME_KO,
  festivalAskText,
  festivalLoopBar,
  festivalParts,
  festivalRound,
  festivalRunAt,
  inFestival,
  MUSICIAN_FEET_GAP,
  MUSICIAN_GAP_MAX,
  MUSICIAN_GAP_MIN,
  MUSICIAN_ORDER,
  musicianSpots,
  musiciansText,
  stageFloorOf,
} from '@/domain/festival';
import { STAGE_LABEL_TOP } from '@/domain/installation';
import { installation as installationOf } from './controller-rig';
import { BAR_SEC, ENSEMBLE_LAYER_KEYS, LOOP_BARS, plazaBar } from '@/domain/worldsound';
import type { EnsembleLayers } from '@/domain/worldsound';
import { songsOf } from './controller-rig';

describe('길이: 현재 층 그대로 8마디 합주를 두 번, 48초(6.4)', () => {
  it('8마디 × 2 = 16마디, 마디 3초라서 48초다', () => {
    expect(FESTIVAL_LOOPS).toBe(2);
    expect(LOOP_BARS).toBe(8);
    expect(FESTIVAL_BARS).toBe(16);
    expect(BAR_SEC).toBe(3);
    expect(FESTIVAL_SECONDS).toBe(48);
  });
});

describe('구간 정하기(festivalRunAt)', () => {
  it('다음 마디가 충분히 멀면 다음 마디부터, 가까우면 그다음 마디부터 시작한다', () => {
    expect(festivalRunAt(10, 2.5)).toEqual({ startBar: 11, endBar: 27 });
    expect(festivalRunAt(10, FESTIVAL_MIN_LEAD_SEC)).toEqual({ startBar: 11, endBar: 27 });
    expect(festivalRunAt(10, FESTIVAL_MIN_LEAD_SEC - 0.01)).toEqual({ startBar: 12, endBar: 28 });
    expect(festivalRunAt(10, 0.05)).toEqual({ startBar: 12, endBar: 28 });
  });

  it('언제나 16마디 구간이고, 첫 마디는 지금보다 뒤다', () => {
    for (let bar = -3; bar < 40; bar++) {
      for (const sec of [0, 0.1, 0.39, 0.4, 1.5, 2.99]) {
        const r = festivalRunAt(bar, sec);
        expect(r.endBar - r.startBar).toBe(FESTIVAL_BARS);
        expect(r.startBar).toBeGreaterThan(bar);
        expect(r.startBar).toBeLessThanOrEqual(bar + 2);
      }
    }
  });
});

describe('구간 안의 마디', () => {
  const run = { startBar: 11, endBar: 27 };

  it('시작 마디부터 끝 마디 직전까지가 잔치 안이다. 끝 마디는 잔치가 아니다', () => {
    expect(inFestival(run, 10)).toBe(false);
    expect(inFestival(run, 11)).toBe(true);
    expect(inFestival(run, 26)).toBe(true);
    expect(inFestival(run, 27)).toBe(false);
    expect(inFestival(null, 12)).toBe(false);
  });

  it('잔치는 합주의 첫 마디부터 시작한다: 몇 번째 마디에서 열어도 0, 1, … 7, 0, 1, … 7이다', () => {
    for (const start of [0, 1, 5, 8, 13, 100]) {
      const r = { startBar: start, endBar: start + FESTIVAL_BARS };
      const seq = Array.from({ length: FESTIVAL_BARS }, (_, i) => festivalLoopBar(r, start + i));
      expect(seq).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]);
      expect(festivalLoopBar(r, start - 1)).toBeNull();
      expect(festivalLoopBar(r, start + FESTIVAL_BARS)).toBeNull();
    }
    expect(festivalLoopBar(null, 3)).toBeNull();
  });

  it('첫 마디의 화음은 합주 첫 마디의 화음(C)이다(어느 마디에서 열어도 처음부터 들린다)', () => {
    for (const start of [0, 3, 6, 9, 14]) {
      const r = { startBar: start, endBar: start + FESTIVAL_BARS };
      expect(plazaBar(festivalLoopBar(r, start)!, 0).chord).toBe('C');
    }
  });

  it('몇 번째로 듣는 중인가: 첫 8마디는 1번째, 다음 8마디는 2번째', () => {
    const r = { startBar: 20, endBar: 36 };
    expect(festivalRound(r, 19)).toBeNull();
    for (let b = 20; b < 28; b++) expect(festivalRound(r, b)).toBe(1);
    for (let b = 28; b < 36; b++) expect(festivalRound(r, b)).toBe(2);
    expect(festivalRound(r, 36)).toBeNull();
  });
});

const NO_LAYERS: EnsembleLayers = { village: 0, percussion: 0, bass: 0, melody: 0, runner: 0, ornament: 0 };
const layersWith = (over: Partial<EnsembleLayers>): EnsembleLayers => ({ ...NO_LAYERS, ...over });
const ALL_ON: EnsembleLayers = { village: 1, percussion: 1, bass: 1, melody: 1, runner: 1, ornament: 1 };

describe('악사들(6.2, 6.4, 7-5): 층이 0이어도 맥박과 함께 열린다', () => {
  it('층이 모두 0이면 북 악사 하나, 마을 층 1부터는 화음 악사가 함께 선다', () => {
    expect(festivalParts(NO_LAYERS)).toEqual(['pulse']);
    for (const layer of [1, 2, 3]) expect(festivalParts(layersWith({ village: layer }))).toEqual(['pulse', 'bed']);
  });

  it('마을 밖 지역의 층 1부터는 그 지역의 성부를 맡은 악사가 선다(타악은 박자 강가, 베이스는 종나무 숲, 가락은 오선 언덕, 달리는 음은 음계 길, 꾸밈음은 건반 늪)', () => {
    expect(festivalParts(layersWith({ percussion: 1 }))).toEqual(['pulse', 'percussion']);
    expect(festivalParts(layersWith({ bass: 2 }))).toEqual(['pulse', 'bass']);
    expect(festivalParts(layersWith({ melody: 3 }))).toEqual(['pulse', 'melody']);
    expect(festivalParts(layersWith({ runner: 1 }))).toEqual(['pulse', 'runner']);
    expect(festivalParts(layersWith({ ornament: 2 }))).toEqual(['pulse', 'ornament']);
  });

  it('여섯 성부의 층이 모두 1 이상이면 악사 일곱(맥박 하나, 화음 하나, 마을 밖 다섯)이 서고, 서는 차례는 MUSICIAN_ORDER다', () => {
    const all = festivalParts(ALL_ON);
    expect(all).toEqual(['pulse', 'percussion', 'bass', 'bed', 'melody', 'runner', 'ornament']);
    expect(all).toEqual([...MUSICIAN_ORDER]);
    expect(MUSICIAN_ORDER).toHaveLength(7);
    // 일부만 있어도 차례는 그대로다(앞뒤가 바뀌지 않는다)
    expect(festivalParts(layersWith({ ornament: 1, village: 1, percussion: 3 }))).toEqual(['pulse', 'percussion', 'bed', 'ornament']);
  });

  it('층이 더 올라도 악사는 더 늘지 않는다(층은 소리의 빽빽함이고 악사는 성부다). 층 0은 서지 않는다', () => {
    for (const key of ENSEMBLE_LAYER_KEYS) {
      expect(festivalParts(layersWith({ [key]: 1 })).length).toBe(festivalParts(layersWith({ [key]: 3 })).length);
      expect(festivalParts(layersWith({ [key]: 0 }))).toEqual(['pulse']);
    }
  });

  it('실제로 울리는 성부와 같다: 층의 모든 조합(0–3의 여섯 자리, 4096가지)에서 악사의 유무가 8마디 합주 안에서 그 성부가 울리는지와 같다', () => {
    const levels = [0, 1, 2, 3];
    let checked = 0;
    for (const village of levels) for (const percussion of levels) for (const bass of levels) for (const melody of levels) for (const runner of levels) for (const ornament of levels) {
      const layers: EnsembleLayers = { village, percussion, bass, melody, runner, ornament };
      const parts = festivalParts(layers);
      const bars = Array.from({ length: LOOP_BARS }, (_, bar) => plazaBar(bar, village, { percussion, bass, melody, runner, ornament }));
      const sounds = (key: 'pulse' | 'bed' | 'percussion' | 'bass' | 'melody' | 'runner' | 'ornament'): boolean => bars.some((b) => b[key].length > 0);
      for (const part of MUSICIAN_ORDER) {
        if (parts.includes(part) !== sounds(part)) throw new Error(`${part}: 악사 ${parts.includes(part)} 소리 ${sounds(part)} (${JSON.stringify(layers)})`);
      }
      checked++;
    }
    expect(checked).toBe(4096);
  });

  it('악사마다 이름이 있다', () => {
    expect(MUSICIAN_NAME_KO.pulse).toBe('북 악사');
    expect(MUSICIAN_NAME_KO.bed).toBe('화음 악사');
    expect(MUSICIAN_NAME_KO.percussion).toBe('타악 악사');
    expect(MUSICIAN_NAME_KO.bass).toBe('베이스 악사');
    expect(MUSICIAN_NAME_KO.melody).toBe('가락 악사');
    expect(MUSICIAN_NAME_KO.runner).toBe('달리는 음 악사');
    expect(MUSICIAN_NAME_KO.ornament).toBe('꾸밈음 악사');
  });
});

describe('끝난 뒤 묻는 말', () => {
  it('잔치가 끝났다고 사실을 말하고, 저장한 곡 수를 적고, 이어서 들을지 묻는다', () => {
    const t = festivalAskText(3);
    expect(t).toContain('잔치가 끝났어요');
    expect(t).toContain('3개');
    expect(t).toContain(FESTIVAL_ASK_TEXT);
    expect(FESTIVAL_ASK_TEXT).toBe('내 곡을 이어서 들을까요?');
  });
});

describe('내 곡 이어 듣기용 재생(creationsPlayback)', () => {
  it('곡이 없으면 음이 없는 재생이다', () => {
    const p = creationsPlayback([]);
    expect(p.notes).toEqual([]);
    expect(p.lengthTicks).toBe(0);
  });

  it('곡이 하나면 그 곡의 재생과 같다(음 id만 곡 번호가 붙는다)', () => {
    const [a] = songsOf(1);
    const one = creationPlayback(a!);
    const all = creationsPlayback([a!]);
    expect(all.lengthTicks).toBe(one.lengthTicks);
    expect(all.tempoBpm).toBe(one.tempoBpm);
    expect(all.notes.map((n) => [n.midi, n.onsetTick, n.durationTick])).toEqual(one.notes.map((n) => [n.midi, n.onsetTick, n.durationTick]));
    expect(all.notes.every((n) => n.id.startsWith('song1-'))).toBe(true);
  });

  it('여러 곡은 차례로 이어 붙고 곡 사이에 한 마디를 쉰다', () => {
    const list = songsOf(3);
    const parts = list.map((c) => creationPlayback(c));
    const all = creationsPlayback(list);
    const gap = SONG_GAP_MEASURES * CREATION_BAR_TICKS;
    expect(all.lengthTicks).toBe(parts.reduce((n, p) => n + p.lengthTicks, 0) + 2 * gap);
    // 둘째 곡의 첫 음은 첫 곡이 끝난 뒤 한 마디 쉬고 시작한다
    const secondStart = parts[0]!.lengthTicks + gap;
    const second = all.notes.filter((n) => n.id.startsWith('song2-'));
    expect(second.length).toBe(parts[1]!.notes.length);
    expect(Math.min(...second.map((n) => n.onsetTick))).toBe(secondStart + Math.min(...parts[1]!.notes.map((n) => n.onsetTick)));
    // 모든 음이 재생 길이 안이다
    for (const n of all.notes) expect(n.onsetTick + n.durationTick).toBeLessThanOrEqual(all.lengthTicks);
    // 음 id는 겹치지 않는다
    expect(new Set(all.notes.map((n) => n.id)).size).toBe(all.notes.length);
    // 곡의 순서가 그대로다
    const order = [...new Set(all.notes.sort((a, b) => a.onsetTick - b.onsetTick).map((n) => n.id.split('-')[0]))];
    expect(order).toEqual(['song1', 'song2', 'song3']);
  });

  it('곡 안의 음 사이 간격은 그대로다(곡마다 같은 크기만큼 밀 뿐이다)', () => {
    const list = songsOf(2);
    const p1 = creationPlayback(list[1]!);
    const all = creationsPlayback(list);
    const second = all.notes.filter((n) => n.id.startsWith('song2-')).sort((a, b) => a.onsetTick - b.onsetTick);
    const base = [...p1.notes].sort((a, b) => a.onsetTick - b.onsetTick);
    const shift = second[0]!.onsetTick - base[0]!.onsetTick;
    second.forEach((n, i) => {
      expect(n.onsetTick - base[i]!.onsetTick).toBe(shift);
      expect(n.midi).toBe(base[i]!.midi);
    });
  });
});

describe('악사가 서는 자리', () => {
  const stage = installationOf('inst.village.ensemble-stage');

  it('무대 설치물에서 바닥 가장자리를 읽는다: 칸들의 가로 범위와 윗변', () => {
    const floor = stageFloorOf([stage]);
    expect(floor).toEqual({ x0: 3899, x1: 4215, y0: 2919 });
  });

  it('무대 바닥(stageCells)이 없으면 null이다. 돌 설치물만 있어도 마찬가지다', () => {
    expect(stageFloorOf([])).toBeNull();
    expect(stageFloorOf([installationOf('inst.village.scale-stones')])).toBeNull();
  });

  it('악사가 없으면 자리도 없다', () => {
    expect(musicianSpots({ x0: 3899, x1: 4215, y0: 2919 }, 0)).toEqual([]);
  });

  it('한 줄로 서고, 발은 마디 이름 띠 위다', () => {
    const floor = stageFloorOf([stage])!;
    for (const n of [1, 2, 3, 6, 7]) {
      const spots = musicianSpots(floor, n);
      expect(spots).toHaveLength(n);
      for (const s of spots) expect(s.y).toBe(floor.y0 - STAGE_LABEL_TOP - MUSICIAN_FEET_GAP);
    }
  });

  it('무대 가운데를 기준으로 좌우 대칭이다', () => {
    const floor = stageFloorOf([stage])!;
    const cx = (floor.x0 + floor.x1) / 2;
    for (const n of [1, 2, 3, 4, 6, 7]) {
      const xs = musicianSpots(floor, n).map((s) => s.x);
      expect(Math.abs(xs.reduce((a, b) => a + b, 0) / n - cx)).toBeLessThanOrEqual(1);
      for (let i = 0; i < n; i++) expect(Math.abs(xs[i]! + xs[n - 1 - i]! - 2 * cx)).toBeLessThanOrEqual(1);
    }
  });

  it('둘이면 96 px 간격이다. 악사가 늘어도 간격은 46 px 아래로 줄지 않고 무대 폭 안에 선다(일곱까지)', () => {
    const floor = stageFloorOf([stage])!;
    const two = musicianSpots(floor, 2);
    expect(two[1]!.x - two[0]!.x).toBe(MUSICIAN_GAP_MAX);
    expect(MUSICIAN_GAP_MIN).toBe(46);
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const xs = musicianSpots(floor, n).map((s) => s.x);
      for (let i = 1; i < n; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(MUSICIAN_GAP_MIN - 1);
      expect(xs[0]!).toBeGreaterThanOrEqual(floor.x0);
      expect(xs[n - 1]!).toBeLessThanOrEqual(floor.x1);
    }
  });

  it('악사 일곱은 간격 46 px로 서고, 가운데끼리의 폭 276 px이 무대 폭(316 px) 안이다(7-5)', () => {
    const floor = stageFloorOf([stage])!;
    const xs = musicianSpots(floor, 7).map((s) => s.x);
    for (let i = 1; i < 7; i++) expect(xs[i]! - xs[i - 1]!).toBe(MUSICIAN_GAP_MIN);
    expect(xs[6]! - xs[0]!).toBe(276);
    expect(floor.x1 - floor.x0).toBe(316);
    expect(xs[0]!).toBeGreaterThan(floor.x0);
    expect(xs[6]!).toBeLessThan(floor.x1);
  });

  it('같은 자리에 두 악사가 서지 않는다', () => {
    const floor = stageFloorOf([stage])!;
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const xs = musicianSpots(floor, n).map((s) => s.x);
      expect(new Set(xs).size).toBe(n);
    }
  });
});

describe('악사를 말로 적기', () => {
  it('하나, 둘일 때의 문장', () => {
    expect(musiciansText([])).toBe('');
    expect(musiciansText(['pulse'])).toBe('북 악사가 무대에 서 있어요.');
    expect(musiciansText(['pulse', 'bed'])).toBe('북 악사와 화음 악사가 무대에 서 있어요.');
  });

  it('셋 이상이면 쉼표로 이어 마지막 앞에 “와”를 쓰고, 일곱 악사 모두 이름이 들어간다', () => {
    expect(musiciansText(['pulse', 'percussion', 'bed'])).toBe('북 악사, 타악 악사와 화음 악사가 무대에 서 있어요.');
    const all = musiciansText(festivalParts(ALL_ON));
    expect(all).toBe('북 악사, 타악 악사, 베이스 악사, 화음 악사, 가락 악사, 달리는 음 악사와 꾸밈음 악사가 무대에 서 있어요.');
    for (const part of MUSICIAN_ORDER) expect(all).toContain(MUSICIAN_NAME_KO[part]);
  });

  it('악사의 이름은 모두 서로 다르다(모양과 이름이 함께 구별한다)', () => {
    const names = Object.values(MUSICIAN_NAME_KO);
    expect(new Set(names).size).toBe(names.length);
  });
});
