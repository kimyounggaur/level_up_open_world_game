// @vitest-environment jsdom
// 2-4 악보 그리기. 그린 도형에서 읽어 낸 보표 위치가 정답 데이터와 같아야 하고,
// Q01·Q02·Q03 정답 악보의 SVG가 기준본과 같아야 한다(tests/fixtures/notation).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { diatonicIndex, letterOctaveAt } from '@/domain/pitch';
import type { Letter } from '@/domain/pitch';
import { CLEF_BOTTOM_LINE, staffPositionOf } from '@/domain/staff';
import type { Clef } from '@/domain/staff';
import type { Score } from '@/domain/score';
import { decomposeTicks, durationCodeOf, keySignatureName, renderScore } from '@/ui/notation/render';
import { installDomStubs } from './dom-setup';
import { baseScore, note, rest } from './helpers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureDir = path.join(root, 'tests', 'fixtures', 'notation');

beforeAll(() => installDomStubs());

function draw(score: Score, options = {}) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const rendered = renderScore(div, score, options);
  return { div, rendered };
}

/** VexFlow가 붙이는 번호(vf-auto1001 …)를 처음 나온 차례대로 다시 매기고, 태그마다 줄을 나눈다 */
function normalizeSvg(html: string): string {
  const ids = new Map<string, string>();
  const renumbered = html.replace(/vf-auto\d+/g, (m) => {
    if (!ids.has(m)) ids.set(m, `vf-${ids.size + 1}`);
    return ids.get(m)!;
  });
  return renumbered.replace(/></g, '>\n<') + '\n';
}

/** SMuFL 임시표 글자: 내림 E260, 제자리 E261, 올림 E262, 겹올림 E263, 겹내림 E264 */
const ACCIDENTAL_GLYPHS = ['\ue260', '\ue261', '\ue262', '\ue263', '\ue264'];
/** SVG 안의 글자 가운데 주어진 글자인 것을 그려진 차례로 모은다 */
const glyphsIn = (root: Element, wanted: readonly string[]): string[] => [...root.querySelectorAll('text')].map((t) => t.textContent ?? '').filter((t) => wanted.includes(t));

const questScore = (questId: string, variantId: string): Score => {
  const q = JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${questId}.json`), 'utf-8')) as { variants: Record<string, { score: Score }> };
  return q.variants[variantId]!.score;
};

/** 설계서 5.2의 Q03: C4 32분 8개, D4 E4 F4 8분 셋잇단, 2분쉼표. 내용 데이터가 아니라 그리기 확인용 고정물이다 */
const q03Answer = (): Score =>
  baseScore({
    events: [
      ...Array.from({ length: 8 }, (_, i) => note(`a${i + 1}`, 0, i * 120, 120, 'C4')),
      note('t1', 0, 960, 320, 'D4', { groupId: 'g1' }),
      note('t2', 0, 1280, 320, 'E4', { groupId: 'g1' }),
      note('t3', 0, 1600, 320, 'F4', { groupId: 'g1' }),
      rest('r1', 0, 1920, 1920),
    ],
    tuplets: [{ groupId: 'g1', actualNotes: 3, normalNotes: 2, writtenBaseDuration: 'eighth', eventIds: ['t1', 't2', 't3'] }],
  });

describe('틱과 길이 코드', () => {
  it('표준 길이는 길이 코드와 점 개수로 바뀐다', () => {
    expect(durationCodeOf(3840)).toEqual({ code: 'w', dots: 0 });
    expect(durationCodeOf(2880)).toEqual({ code: 'h', dots: 1 });
    expect(durationCodeOf(1440)).toEqual({ code: 'q', dots: 1 });
    expect(durationCodeOf(120)).toEqual({ code: '32', dots: 0 });
    expect(durationCodeOf(700)).toBeNull();
  });

  it('빈 곳은 표준 길이들의 합으로 쪼갠다', () => {
    expect(decomposeTicks(3840)).toEqual([3840]);
    expect(decomposeTicks(2880)).toEqual([2880]);
    expect(decomposeTicks(1920 + 480)).toEqual([1920, 480]);
    expect(decomposeTicks(0)).toEqual([]);
    // 쪼갠 합은 항상 처음 틱 수 이하이며, 120의 배수는 빠짐없이 쪼개진다
    for (const n of [120, 240, 360, 480, 840, 1080, 1560, 2040, 3480]) expect(decomposeTicks(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('조표 −7…+7이 모두 이름으로 바뀌고 범위 밖은 오류다', () => {
    const names = Array.from({ length: 15 }, (_, i) => keySignatureName(i - 7));
    expect(new Set(names).size).toBe(15);
    expect(keySignatureName(0)).toBe('C');
    expect(keySignatureName(-2)).toBe('Bb');
    expect(() => keySignatureName(8)).toThrow('지원하지 않는 조표');
  });
});

describe('그린 도형에서 읽은 보표 위치', () => {
  for (const clef of ['treble', 'bass'] as Clef[]) {
    it(`${clef}: 덧줄 5개 밖까지 온음계 위치 −10…+18이 domain의 staffPositionOf와 같다`, () => {
      const bottom = diatonicIndex(CLEF_BOTTOM_LINE[clef]);
      const positions = Array.from({ length: 29 }, (_, i) => i - 10);
      const events = positions.map((pos, i) => {
        const { letter, octave } = letterOctaveAt(bottom + pos);
        return note(`n${i}`, Math.floor(i / 4), (i % 4) * 960, 960, `${letter}${octave}`, { staff: 's1' });
      });
      const score = baseScore({ staves: [{ staffId: 's1', clef, keySignature: 0 }], events });
      const { rendered } = draw(score);
      const drawn = rendered.notes.filter((n) => n.kind === 'note');
      expect(drawn).toHaveLength(positions.length);
      drawn.forEach((n, i) => {
        const ev = events[i]!;
        if (ev.type !== 'note') throw new Error('음이 아니에요');
        expect(n.positions).toEqual([staffPositionOf(clef, ev.writtenPitch)]);
        expect(n.positions[0]).toBe(positions[i]);
      });
    });
  }

  it('C4는 높은음자리표에서 −2(아래 첫 덧줄), 낮은음자리표에서 +10(위 첫 덧줄)', () => {
    const { rendered } = draw(questScore('pitch.same-note-two-clefs', 'middle-c'));
    const byStaff = Object.fromEntries(rendered.notes.map((n) => [n.staffId, n.positions[0]]));
    expect(byStaff).toEqual({ s1: -2, s2: 10 });
  });

  it('같은 높이는 같은 줄에 놓이고, 한 칸 위는 반 간격(스페이싱의 절반)만큼 위에 그려진다', () => {
    const events = [note('a', 0, 0, 960, 'E4'), note('b', 0, 960, 960, 'F4'), note('c', 0, 1920, 960, 'E4')];
    const { rendered } = draw(baseScore({ events }));
    const [a, b, c] = rendered.notes;
    expect(a!.ys[0]).toBe(c!.ys[0]);
    const spacing = rendered.staves[0]!.spacing;
    expect(a!.ys[0]! - b!.ys[0]!).toBeCloseTo(spacing / 2, 5);
  });

  it('온음 변화표가 붙어도 위치(letter)는 바뀌지 않는다', () => {
    const events = [note('a', 0, 0, 960, 'F#4'), note('b', 0, 960, 960, 'Fb4'), note('c', 0, 1920, 960, 'F4')];
    const { rendered } = draw(baseScore({ events }));
    expect(rendered.notes.map((n) => n.positions[0])).toEqual([1, 1, 1]);
  });
});

describe('임시표, 조표, 점, 쉼표', () => {
  it('임시표 다섯 종류가 기호로 그려진다', () => {
    const events = [
      note('s', 0, 0, 960, 'F4', { accidental: 'sharp' }),
      note('f', 0, 960, 960, 'B4', { accidental: 'flat' }),
      note('n', 0, 1920, 960, 'C4', { accidental: 'natural' }),
      note('ss', 0, 2880, 960, 'G4', { accidental: 'doubleSharp' }),
      note('ff', 1, 0, 960, 'E4', { accidental: 'doubleFlat' }),
      note('plain', 1, 960, 960, 'D4'),
    ];
    const { rendered, div } = draw(baseScore({ events }));
    expect(rendered.notes.map((n) => n.accidentals[0])).toEqual(['#', 'b', 'n', '##', 'bb', null]);
    // 실제 SVG에 그려진 기호(SMuFL 글자)도 같은 순서로 하나씩이다
    expect(glyphsIn(div, ACCIDENTAL_GLYPHS)).toEqual(['\ue262', '\ue260', '\ue261', '\ue263', '\ue264']);
  });

  it('임시표가 없는 자연음(null)은 아무것도 붙지 않는다. 자연표를 적은 것(natural)과 다르다', () => {
    const { rendered, div } = draw(baseScore({ events: [note('a', 0, 0, 960, 'C4')] }));
    expect(rendered.notes[0]!.accidentals).toEqual([null]);
    expect(glyphsIn(div, ACCIDENTAL_GLYPHS)).toEqual([]);
  });

  it('조표는 첫 마디에만 그려진다', () => {
    const events = [note('a', 0, 0, 3840, 'G4'), note('b', 1, 0, 3840, 'F#4')];
    const { div } = draw(baseScore({ staves: [{ staffId: 's1', clef: 'treble', keySignature: 1 }], events }));
    expect(div.querySelectorAll('.vf-keysignature').length).toBe(1);
  });

  it('조표가 없으면 그리지 않는다', () => {
    const { div } = draw(baseScore({ events: [note('a', 0, 0, 3840, 'G4')] }));
    expect(div.querySelectorAll('.vf-keysignature').length).toBe(0);
  });

  it('점음표와 점쉼표', () => {
    const events = [note('a', 0, 0, 1440, 'C4'), note('b', 0, 1440, 480, 'D4'), note('c', 0, 1920, 2880 - 960, 'E4'), rest('r', 1, 0, 2880), note('d', 1, 2880, 960, 'G4')];
    const { rendered } = draw(baseScore({ events }));
    const [a, b, c, r] = rendered.notes;
    expect([a!.duration, a!.dots]).toEqual(['q', 1]);
    expect([b!.duration, b!.dots]).toEqual(['8', 0]);
    expect([c!.duration, c!.dots]).toEqual(['h', 0]);
    expect([r!.duration, r!.dots, r!.kind, r!.positions]).toEqual(['hr', 1, 'rest', []]);
  });

  it('쉼표 길이별 길이 코드', () => {
    const lens: Array<[number, string]> = [[3840, 'wr'], [1920, 'hr'], [960, 'qr'], [480, '8r'], [240, '16r'], [120, '32r']];
    for (const [ticks, code] of lens) {
      const { rendered } = draw(baseScore({ events: [rest('r', 0, 0, ticks), note('x', 0, ticks, 3840 - ticks, 'C4')].filter((e) => e.durationTicks > 0 && durationCodeOf(e.durationTicks) !== null) }));
      expect(rendered.notes[0]!.duration).toBe(code);
    }
  });

  it('쉼표는 보표 위치가 없고, 높은음자리표와 낮은음자리표 모두 그려진다', () => {
    const score = baseScore({
      staves: [
        { staffId: 's1', clef: 'treble', keySignature: 0 },
        { staffId: 's2', clef: 'bass', keySignature: 0 },
      ],
      voices: [
        { voiceId: 'v1', staffId: 's1' },
        { voiceId: 'v2', staffId: 's2' },
      ],
      events: [rest('r1', 0, 0, 3840, { staff: 's1', voice: 'v1' }), rest('r2', 0, 0, 3840, { staff: 's2', voice: 'v2' })],
    });
    const { rendered } = draw(score);
    expect(rendered.notes.map((n) => [n.staffId, n.kind, n.positions])).toEqual([['s1', 'rest', []], ['s2', 'rest', []]]);
  });
});

describe('화음, 성부, 빈 곳', () => {
  it('같은 시작·길이의 음은 한 화음으로 묶이고 낮은 음부터 읽힌다', () => {
    const events = [note('g', 0, 0, 960, 'G4'), note('c', 0, 0, 960, 'C4'), note('e', 0, 0, 960, 'E4'), note('x', 0, 960, 960, 'D4')];
    const { rendered } = draw(baseScore({ events }));
    const chord = rendered.notes[0]!;
    expect(chord.kind).toBe('chord');
    expect(chord.eventIds).toEqual(['c', 'e', 'g']);
    expect(chord.positions).toEqual([-2, 0, 2]);
    expect(rendered.notes[1]!.kind).toBe('note');
  });

  it('두 성부는 기둥 방향이 갈린다(첫 성부 위, 둘째 성부 아래)', () => {
    const score = baseScore({
      voices: [
        { voiceId: 'v1', staffId: 's1' },
        { voiceId: 'v2', staffId: 's1' },
      ],
      events: [
        note('a', 0, 0, 1920, 'G4', { voice: 'v1' }),
        note('b', 0, 1920, 1920, 'A4', { voice: 'v1' }),
        note('c', 0, 0, 960, 'C4', { voice: 'v2' }),
        note('d', 0, 960, 960, 'D4', { voice: 'v2' }),
        note('e', 0, 1920, 1920, 'E4', { voice: 'v2' }),
      ],
    });
    const { rendered } = draw(score);
    const stems = Object.fromEntries(rendered.notes.map((n) => [n.eventIds[0], n.stem]));
    expect(stems).toEqual({ a: 'up', b: 'up', c: 'down', d: 'down', e: 'down' });
  });

  it('성부가 하나면 기둥 방향은 음 높이에 따라 정해진다(가운데 줄 아래는 위로, 위는 아래로)', () => {
    const { rendered } = draw(baseScore({ events: [note('a', 0, 0, 960, 'C4'), note('b', 0, 960, 960, 'B4'), note('c', 0, 1920, 960, 'G5'), note('d', 0, 2880, 3840 - 2880, 'E4')] }));
    expect(rendered.notes.map((n) => n.stem)).toEqual(['up', 'down', 'down', 'up']);
  });

  it('온음표는 기둥이 없다', () => {
    const { rendered } = draw(baseScore({ events: [note('a', 0, 0, 3840, 'C4')] }));
    expect(rendered.notes[0]!.stem).toBe('none');
  });

  it('마디 앞이 비어 있어도(자리 채움) 그려지고, 뒤 음의 가로 위치가 밀려난다', () => {
    const lone = draw(baseScore({ events: [note('a', 0, 0, 960, 'C4')] })).rendered.notes[0]!;
    const late = draw(baseScore({ events: [note('a', 0, 1920, 960, 'C4')] })).rendered.notes[0]!;
    expect(late.onsetTicks).toBe(1920);
    expect(late.x).toBeGreaterThan(lone.x);
    expect(late.positions).toEqual([-2]);
  });

  it('틱이 맞지 않는 길이의 음은 오류로 알린다', () => {
    expect(() => draw(baseScore({ events: [note('a', 0, 0, 700, 'C4')] }))).toThrow('그릴 수 없는 길이');
  });

  it('보표가 없으면 오류로 알린다', () => {
    expect(() => draw(baseScore({ staves: [] }))).toThrow('보표가 없는');
  });
});

describe('셋잇단과 빗금', () => {
  it('Q03 정답: 32분음표 8개는 한 빗금으로 묶이고, 8분 셋잇단 셋은 셋잇단 표시가 붙는다', () => {
    const { rendered, div } = draw(q03Answer());
    const sixteen = rendered.notes.filter((n) => n.duration === '32');
    expect(sixteen).toHaveLength(8);
    expect(sixteen.every((n) => n.beamed && !n.tuplet)).toBe(true);
    const triplet = rendered.notes.filter((n) => n.tuplet);
    expect(triplet.map((n) => [n.eventIds[0], n.duration, n.positions[0]])).toEqual([
      ['t1', '8', -1],
      ['t2', '8', 0],
      ['t3', '8', 1],
    ]);
    expect(triplet.every((n) => n.beamed)).toBe(true);
    expect(div.querySelectorAll('.vf-tuplet').length).toBe(1);
    const half = rendered.notes.at(-1)!;
    expect([half.kind, half.duration]).toEqual(['rest', 'hr']);
  });

  it('보통 8분음표 셋은 셋잇단 표시가 없다', () => {
    const events = [note('a', 0, 0, 480, 'C4'), note('b', 0, 480, 480, 'D4'), note('c', 0, 960, 480, 'E4'), rest('r', 0, 1440, 3840 - 1440 - 0)].filter((e) => durationCodeOf(e.durationTicks));
    const { div, rendered } = draw(baseScore({ events }));
    expect(div.querySelectorAll('.vf-tuplet').length).toBe(0);
    expect(rendered.notes.filter((n) => n.tuplet)).toHaveLength(0);
  });

  it('쉼표는 빗금에 묶이지 않는다', () => {
    const events = [note('a', 0, 0, 480, 'C4'), rest('r', 0, 480, 480), note('b', 0, 960, 480, 'D4'), note('c', 0, 1440, 480, 'E4'), rest('r2', 0, 1920, 1920)];
    const { rendered } = draw(baseScore({ events }));
    expect(rendered.notes.find((n) => n.eventIds[0] === 'r')!.beamed).toBe(false);
    expect(rendered.notes.find((n) => n.eventIds[0] === 'a')!.beamed).toBe(false);
    expect(rendered.notes.find((n) => n.eventIds[0] === 'b')!.beamed).toBe(true);
    expect(rendered.notes.find((n) => n.eventIds[0] === 'c')!.beamed).toBe(true);
  });
});

describe('여러 마디와 줄바꿈', () => {
  const eightBars = (): Score => baseScore({ events: Array.from({ length: 8 }, (_, m) => note(`n${m}`, m, 0, 3840, 'C4')) });

  it('한 줄에 4마디씩 넘기고, 둘째 줄은 아래에 그려진다', () => {
    const { rendered } = draw(eightBars());
    expect(rendered.staves).toHaveLength(8);
    const ys = [...new Set(rendered.staves.map((s) => s.y))];
    expect(ys).toHaveLength(2);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(100);
    expect(rendered.staves.slice(0, 4).every((s) => s.y === ys[0])).toBe(true);
  });

  it('마디 폭 옵션과 한 줄 마디 수 옵션이 먹는다', () => {
    const two = draw(eightBars(), { measuresPerSystem: 2 }).rendered;
    expect(new Set(two.staves.map((s) => s.y)).size).toBe(4);
  });

  it('viewBox가 그려진 크기와 같아 화면 폭에 맞춰 줄어든다', () => {
    const { rendered } = draw(eightBars());
    expect(rendered.svg.getAttribute('viewBox')).toBe(`0 0 ${rendered.width} ${rendered.height}`);
  });

  it('다시 그리면 이전 그림은 지워진다', () => {
    const div = document.createElement('div');
    renderScore(div, eightBars());
    renderScore(div, eightBars());
    expect(div.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('접근성과 표시', () => {
  it('이름과 설명이 svg에 붙는다', () => {
    const { rendered } = draw(baseScore({ events: [note('a', 0, 0, 3840, 'C4')] }), { title: '정답 악보', description: '높은음자리표, 온음표 C4' });
    expect(rendered.svg.getAttribute('role')).toBe('img');
    expect(rendered.svg.getAttribute('aria-label')).toBe('정답 악보');
    expect(rendered.svg.querySelector('title')!.textContent).toBe('정답 악보');
    expect(rendered.svg.querySelector('desc')!.textContent).toBe('높은음자리표, 온음표 C4');
  });

  it('음표마다 사건 id가 붙고, 표시한 음에는 클래스가 붙는다', () => {
    const events = [note('a', 0, 0, 960, 'C4'), note('b', 0, 960, 960, 'D4'), note('c', 0, 1920, 960, 'E4'), note('d', 0, 2880, 960, 'F4')];
    const { div } = draw(baseScore({ events }), { highlight: { b: 'error', c: 'ok', d: 'focus' } });
    expect(div.querySelector('[data-event-ids~="b"]')!.classList.contains('is-error')).toBe(true);
    expect(div.querySelector('[data-event-ids~="c"]')!.classList.contains('is-ok')).toBe(true);
    expect(div.querySelector('[data-event-ids~="d"]')!.classList.contains('is-focus')).toBe(true);
    expect(div.querySelector('[data-event-ids~="a"]')!.getAttribute('class')).not.toMatch(/is-/);
  });

  it('모든 사건이 정확히 한 번 그려진다(Q01·Q02·Q03 정답, 큰보표, 화음)', () => {
    const scores = [questScore('pitch.same-note-two-clefs', 'middle-c'), questScore('rhythm.rest-in-a-bar', 'quarter-rest'), q03Answer()];
    for (const score of scores) {
      const { rendered } = draw(score);
      const drawn = rendered.notes.flatMap((n) => n.eventIds).sort();
      expect(drawn).toEqual(score.events.map((e) => e.eventId).sort());
    }
  });
});

describe('정답 악보 SVG 비교(기준본)', () => {
  it('Q01 정답: 같은 음 C4가 높은음자리표 아래 첫 덧줄과 낮은음자리표 위 첫 덧줄에', async () => {
    const { div } = draw(questScore('pitch.same-note-two-clefs', 'middle-c'), { title: 'Q01 정답 악보' });
    await expect(normalizeSvg(div.innerHTML)).toMatchFileSnapshot(path.join(fixtureDir, 'q01-answer.svg'));
  });

  it('Q02 정답: C4 4분음표, 4분쉼표, D4, E4', async () => {
    const { div } = draw(questScore('rhythm.rest-in-a-bar', 'quarter-rest'), { title: 'Q02 정답 악보' });
    await expect(normalizeSvg(div.innerHTML)).toMatchFileSnapshot(path.join(fixtureDir, 'q02-answer.svg'));
  });

  it('Q03 정답: C4 32분 8개, D4 E4 F4 8분 셋잇단, 2분쉼표', async () => {
    const { div } = draw(q03Answer(), { title: 'Q03 정답 악보' });
    await expect(normalizeSvg(div.innerHTML)).toMatchFileSnapshot(path.join(fixtureDir, 'q03-answer.svg'));
  });

  it('같은 악보를 두 번 그리면 번호만 달라도 정규화한 SVG는 같다', () => {
    const a = normalizeSvg(draw(q03Answer()).div.innerHTML);
    const b = normalizeSvg(draw(q03Answer()).div.innerHTML);
    expect(a).toBe(b);
  });
});

// 보표 기준음 표가 render와 어긋나지 않았는지, 문자가 7개인지 같은 기본 가정을 한 번 더 지킨다.
describe('기본 가정', () => {
  it('보표 맨 아랫줄은 높은음자리표 E4, 낮은음자리표 G2', () => {
    const treble = CLEF_BOTTOM_LINE.treble;
    const bass = CLEF_BOTTOM_LINE.bass;
    expect([treble.letter as Letter, treble.octave]).toEqual(['E', 4]);
    expect([bass.letter as Letter, bass.octave]).toEqual(['G', 2]);
  });
});
