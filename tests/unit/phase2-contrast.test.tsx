// @vitest-environment jsdom
// 2단계 완료 기준(설계서 12.5): "악보·소리·판정 대조표를 작성한다." 근거: 11.2의 1번, 13.3 G2의 3번.
//
// 사용자가 누르는 길(패널의 단추와 칸) 그대로 배치를 만든 다음, 세 가지를 따로 읽어서 사람이 적어 둔 기준값과 맞춰 본다.
//   악보 = 화면에 그려진 SVG의 도형에서 읽은 것(음표머리의 높이 → 줄·칸 위치, 쉼표는 글자 모양)
//   소리 = 소리 받이(NoteSink)에 실제로 넘어간 음(MIDI, 재생 시작 뒤 초, 길이 초)
//   판정 = 패널에 나온 문장
// 기준값은 설계서(1-3 보표 위치, 4.4와 5.2의 예시, 5.3의 자리 이름, 5.8의 MIDI)와 악보 읽는 법에서 사람이 옮겨 적은 것이다.
// 코드가 계산한 값을 정답으로 삼지 않는다(12.2의 3번). 그래서 아래 표들은 domain/staff 같은 계산 코드를 가져다 쓰지 않는다.
//
// 이 테스트가 통과하면 docs/verification/phase2-악보소리판정-대조표.md가 같은 내용이어야 한다.
// 문서를 다시 만들 때: UPDATE_DOCS=1 npx vitest run tests/unit/phase2-contrast.test.tsx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_START_DELAY_SEC } from '@/audio/transport';
import { ClefPanel } from '@/ui/panels/clef/ClefPanel';
import { RhythmPanel } from '@/ui/panels/rhythm/RhythmPanel';
import { Q01, Q02, button, click, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC_PATH = path.join(root, 'docs', 'verification', 'phase2-악보소리판정-대조표.md');

// ---------------------------------------------------------------------------
// 사람이 적은 기준값 (코드에서 가져오지 않는다)

/** 높은음자리표: 맨 아랫줄(위치 0)이 E4. 줄에서 칸으로 한 칸 올라갈 때마다 +1 (설계서 1-3) */
const TREBLE: Record<number, string> = { [-3]: 'B3', [-2]: 'C4', [-1]: 'D4', 0: 'E4', 1: 'F4', 2: 'G4', 3: 'A4', 4: 'B4', 5: 'C5' };
/** 낮은음자리표: 맨 아랫줄(위치 0)이 G2 */
const BASS: Record<number, string> = { [-2]: 'E2', [-1]: 'F2', 0: 'G2', 1: 'A2', 2: 'B2', 3: 'C3', 4: 'D3', 5: 'E3', 6: 'F3', 7: 'G3', 8: 'A3', 9: 'B3', 10: 'C4', 11: 'D4' };
/** C4=MIDI 60 (설계서 5.8과 상세 설계) */
const MIDI_OF: Record<string, number> = { E2: 40, F2: 41, G2: 43, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, C5: 72 };
/** 설계서 5.3의 자리 이름. 화면 낭독기가 읽는 말이다 */
const SPOKEN: Record<number, string> = { [-2]: '아래 첫 덧줄', [-1]: '맨 아랫줄의 아래 칸', 0: '맨 아랫줄', 5: '셋째 칸', 8: '맨 윗줄', 9: '맨 윗줄의 위 칸', 10: '위 첫 덧줄' };

/** 4/4, 4분음표=80: 4분음표 960틱 = 0.75초, 한 마디 3초. 온음표 3840틱은 3초이지만 '두 음 듣기'는 음마다 2박(1920틱) = 1.5초로 차례로 들려 준다 */
const BEAT_SEC = 0.75;
const TWO_BEATS_SEC = 1.5;

/** SMuFL(Bravura) 글자 번호 */
const REST_RANGE = { from: 0xe4e0, to: 0xe4ff };
const GLYPH_REST_QUARTER = 0xe4e5;
const GLYPH_NOTEHEAD_BLACK = 0xe0a4;
const GLYPH_NOTEHEAD_WHOLE = 0xe0a2;

// ---------------------------------------------------------------------------
// 화면에서 읽는 도구

interface DrawnNote {
  kind: 'note';
  id: string;
  x: number;
  position: number;
  glyph: number;
}
interface DrawnRest {
  kind: 'rest';
  id: string;
  x: number;
  glyph: number;
}
type Drawn = DrawnNote | DrawnRest;

/** 그려진 도형에서 읽는다: 오선 줄의 y에서 칸 높이를 알고, 음표머리의 y를 칸 높이로 나눈다 */
function readDrawn(svg: Element): Drawn[] {
  const lineYs = [...svg.querySelectorAll('.vf-stave path')].map((p) => Number(/^M[\d.]+ ([\d.]+)L/.exec(p.getAttribute('d') ?? '')?.[1]));
  if (lineYs.length !== 5 || lineYs.some((y) => !Number.isFinite(y))) throw new Error(`오선 다섯 줄을 읽지 못했어요: ${lineYs.join(',')}`);
  const bottom = Math.max(...lineYs);
  const halfStep = (bottom - Math.min(...lineYs)) / 8;
  const out: Drawn[] = [];
  for (const g of svg.querySelectorAll('.vf-stavenote')) {
    const head = g.querySelector('.vf-notehead text');
    if (!head) continue;
    const glyph = (head.textContent ?? '').codePointAt(0) ?? 0;
    const id = g.getAttribute('data-event-ids') ?? '';
    const x = Number(head.getAttribute('x'));
    if (glyph >= REST_RANGE.from && glyph <= REST_RANGE.to) out.push({ kind: 'rest', id, x, glyph });
    else out.push({ kind: 'note', id, x, glyph, position: Math.round((bottom - Number(head.getAttribute('y'))) / halfStep) });
  }
  return out.sort((a, b) => a.x - b.x);
}

interface Sounded {
  id: string;
  midi: number;
  startSec: number;
  lengthSec: number;
}

/** 소리를 켜고 단추를 눌러 끝까지 재생한 뒤, 소리 받이가 받은 음을 읽는다 */
async function listen(r: Rig, host: HTMLElement, label: string, seconds: number): Promise<Sounded[]> {
  await act(async () => {
    await r.controller.enableSound();
  });
  const t0 = r.engine.now();
  click(button(host, label));
  r.run(seconds);
  const sink = r.engine.sinks.get('task');
  const live = sink ? sink.live() : [];
  r.controller.stopPlayback();
  return live
    .map((x) => ({ id: x.id, midi: x.midi, startSec: Math.round((x.time - t0 - DEFAULT_START_DELAY_SEC) * 1000) / 1000, lengthSec: Math.round(x.duration * 1000) / 1000 }))
    .sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
}

const judgment = (host: HTMLElement): { state: string; sentences: string[] } => ({
  state: q(host, '.feedback')!.getAttribute('data-feedback') ?? '',
  sentences: qa(host, '.feedback-line').map((l) => text(l)),
});

// ---------------------------------------------------------------------------
// Q02 쉼이 있는 한 마디

type Cell = 'C4' | 'D4' | 'E4' | '쉼' | null;

interface Q02Case {
  id: string;
  title: string;
  cells: Cell[];
  /** 왼쪽부터 읽은 악보: 음 이름(보표 위치), 또는 '쉼'. 비운 박은 아무것도 그려지지 않는다 */
  score: Array<{ name: string; position: number } | '쉼'>;
  /** [MIDI, 시작 초]. 길이는 모두 한 박(0.75초). 쉼과 빈 박에서는 소리가 없다 */
  sound: Array<[number, number]>;
  state: 'passed' | 'needsRevision' | 'none';
  sentences: string[];
}

const n = (name: string, position: number) => ({ name, position });

const Q02_CASES: Q02Case[] = [
  { id: 'A', title: '정답 예시', cells: ['C4', '쉼', 'D4', 'E4'], score: [n('C4', -2), '쉼', n('D4', -1), n('E4', 0)], sound: [[60, 0], [62, 1.5], [64, 2.25]], state: 'passed', sentences: ['통과했어요. 목표와 같아요.'] },
  { id: 'B', title: '시안의 상태: 둘째 박에 D4 (설계서 4.4의 예)', cells: ['C4', 'D4', 'D4', 'E4'], score: [n('C4', -2), n('D4', -1), n('D4', -1), n('E4', 0)], sound: [[60, 0], [62, 0.75], [62, 1.5], [64, 2.25]], state: 'needsRevision', sentences: ['두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.'] },
  { id: 'C', title: '음이 다름: 셋째 박이 D4가 아니라 E4', cells: ['C4', '쉼', 'E4', 'E4'], score: [n('C4', -2), '쉼', n('E4', 0), n('E4', 0)], sound: [[60, 0], [64, 1.5], [64, 2.25]], state: 'needsRevision', sentences: ['세 번째 박: 목표는 D4예요. 지금은 E4예요.'] },
  { id: 'D', title: '누락: 넷째 박이 비어 있음', cells: ['C4', '쉼', 'D4', null], score: [n('C4', -2), '쉼', n('D4', -1)], sound: [[60, 0], [62, 1.5]], state: 'needsRevision', sentences: ['네 번째 박에 음표가 없어요.', '한 마디에서 960틱이 남아요. 4분음표 하나 길이예요.'] },
  { id: 'E', title: '추가: 쉼 대신 음표를 하나 더 놓음', cells: ['C4', '쉼', 'D4', '쉼'], score: [n('C4', -2), '쉼', n('D4', -1), '쉼'], sound: [[60, 0], [62, 1.5]], state: 'needsRevision', sentences: ['네 번째 박에는 E4가 울려야 해요. 지금은 쉼이에요.'] },
  { id: 'F', title: '순서: 셋째와 넷째 음이 서로 바뀜', cells: ['C4', '쉼', 'E4', 'D4'], score: [n('C4', -2), '쉼', n('E4', 0), n('D4', -1)], sound: [[60, 0], [64, 1.5], [62, 2.25]], state: 'needsRevision', sentences: ['세 번째 박: 목표는 D4예요. 지금은 E4예요.', '네 번째 박: 목표는 E4예요. 지금은 D4예요.'] },
  { id: 'G', title: '쉼이 앞에: 한 박씩 밀려 들림', cells: ['쉼', 'C4', 'D4', 'E4'], score: ['쉼', n('C4', -2), n('D4', -1), n('E4', 0)], sound: [[60, 0.75], [62, 1.5], [64, 2.25]], state: 'needsRevision', sentences: ['첫 번째 박에는 C4가 울려야 해요. 지금은 쉼이에요.', '두 번째 박은 쉼이에요. 현재 배치에서는 C4가 울려요.'] },
  { id: 'H', title: '쉼표를 놓지 않고 비워 둠(소리는 정답과 같다)', cells: ['C4', null, 'D4', 'E4'], score: [n('C4', -2), n('D4', -1), n('E4', 0)], sound: [[60, 0], [62, 1.5], [64, 2.25]], state: 'needsRevision', sentences: ['두 번째 박에 쉼표가 없어요.', '한 마디에서 960틱이 남아요. 4분음표 하나 길이예요.'] },
  { id: 'I', title: '아무것도 놓지 않고 확인', cells: [null, null, null, null], score: [], sound: [], state: 'needsRevision', sentences: ['배치한 음과 쉼이 아직 없어요.'] },
];

interface Q02Observed {
  c: Q02Case;
  drawn: Drawn[];
  sound: Sounded[];
  judged: { state: string; sentences: string[] };
}
const q02Observed: Q02Observed[] = [];

function openQ02(): { r: Rig; host: HTMLElement } {
  const r = rig();
  act(() => {
    r.controller.open(Q02, 'quarter-rest');
  });
  const m = mount(h(RhythmPanel, { controller: r.controller }));
  current = m;
  return { r, host: m.host };
}

function placeCells(host: HTMLElement, cells: Cell[]): void {
  cells.forEach((label, i) => {
    if (!label) return;
    const m = qa<HTMLButtonElement>(host, 'button.material').find((b) => text(b).includes(label));
    if (!m) throw new Error(`재료 ${label}를 찾지 못했어요`);
    if (m.getAttribute('aria-pressed') !== 'true') click(m);
    click(qa<HTMLButtonElement>(host, 'button.cell-mine')[i]!);
  });
}

const svgNamed = (host: HTMLElement, label: string): Element => {
  const found = qa(host, 'svg.notation-svg').find((s) => s.getAttribute('aria-label') === label);
  if (!found) throw new Error(`'${label}' 악보를 찾지 못했어요`);
  return found;
};

/** 읽은 악보를 '이름(위치)'과 '쉼'으로 */
const scoreWords = (drawn: Drawn[], names: Record<number, string>): Array<{ name: string; position: number } | '쉼'> =>
  drawn.map((d) => (d.kind === 'rest' ? '쉼' : { name: names[d.position] ?? `?${d.position}`, position: d.position }));

describe('Q02: 목표(정답 예시)의 악보와 소리', () => {
  it('목표 악보는 C4, 4분쉼표, D4, E4이고 목표 듣기는 60, 62, 64를 0초, 1.5초, 2.25초에 울린다', async () => {
    const { r, host } = openQ02();
    const drawn = readDrawn(svgNamed(host, '목표 악보'));
    expect(scoreWords(drawn, TREBLE)).toEqual([n('C4', -2), '쉼', n('D4', -1), n('E4', 0)]);
    expect(drawn.filter((d) => d.kind === 'rest').map((d) => d.glyph)).toEqual([GLYPH_REST_QUARTER]);
    expect(drawn.filter((d) => d.kind === 'note').map((d) => d.glyph)).toEqual([GLYPH_NOTEHEAD_BLACK, GLYPH_NOTEHEAD_BLACK, GLYPH_NOTEHEAD_BLACK]);
    const sound = await listen(r, host, '목표 듣기', 4.5);
    expect(sound.map((s) => [s.midi, s.startSec, s.lengthSec])).toEqual([[60, 0, BEAT_SEC], [62, 1.5, BEAT_SEC], [64, 2.25, BEAT_SEC]]);
  });
});

describe('Q02: 내 배치의 악보, 소리, 판정', () => {
  for (const c of Q02_CASES) {
    it(`${c.id}. ${c.title}`, async () => {
      const { r, host } = openQ02();
      placeCells(host, c.cells);
      // 확인하기 전에는 판정이 없다
      expect(judgment(host).state).toBe('none');
      const drawn = readDrawn(svgNamed(host, '내 악보'));
      const sound = await listen(r, host, '내 배치 듣기', 4.5);
      click(button(host, '배치 확인'));
      const judged = judgment(host);

      // 0) 이 표의 기준값끼리 맞는가: 소리는 '음표를 놓은 박'에서만, 그 박의 시작 초에, 그 음의 MIDI로 나야 한다(쉼과 빈 박은 소리 없음)
      const fromCells: Array<[number, number]> = [];
      c.cells.forEach((cell, i) => {
        if (cell && cell !== '쉼') fromCells.push([MIDI_OF[cell]!, i * BEAT_SEC]);
      });
      expect(c.sound).toEqual(fromCells);

      // 1) 악보: 기준과 같다
      expect(scoreWords(drawn, TREBLE)).toEqual(c.score);
      for (const d of drawn) {
        if (d.kind === 'rest') expect(d.glyph).toBe(GLYPH_REST_QUARTER);
        else expect(d.glyph).toBe(GLYPH_NOTEHEAD_BLACK);
      }
      // 2) 소리: 기준과 같다. 길이는 모두 한 박
      expect(sound.map((s) => [s.midi, s.startSec])).toEqual(c.sound);
      for (const s of sound) expect(s.lengthSec).toBe(BEAT_SEC);
      // 3) 판정: 기준과 같다
      expect(judged.state).toBe(c.state);
      expect(judged.sentences).toEqual(c.sentences);

      // 4) 악보와 소리의 대조: 그려진 음표머리와 울린 음이 같은 음이다(같은 사건 번호끼리 위치에서 읽은 이름의 MIDI가 소리와 같다).
      const drawnNotes = drawn.filter((d): d is DrawnNote => d.kind === 'note');
      expect(sound.map((s) => s.id).sort()).toEqual(drawnNotes.map((d) => d.id).sort());
      for (const d of drawnNotes) {
        const sounded = sound.find((s) => s.id === d.id)!;
        expect(sounded.midi).toBe(MIDI_OF[TREBLE[d.position]!]);
      }
      // 왼쪽에 그려진 음이 먼저 울린다
      expect(sound.map((s) => s.id)).toEqual(drawnNotes.map((d) => d.id));
      // 그려진 쉼표 자리에서는 소리가 없다(사건 번호의 칸 번호가 쉼표의 박 번호다)
      for (const d of drawn) {
        if (d.kind !== 'rest') continue;
        const beat = Number(/c(\d+)$/.exec(d.id)?.[1]);
        expect(sound.some((s) => s.startSec === beat * BEAT_SEC)).toBe(false);
      }
      q02Observed.push({ c, drawn, sound, judged });
    });
  }

  it('소리가 꺼져 있으면 소리 받이에는 아무것도 가지 않지만 재생 위치는 움직이고, 판정은 같다', () => {
    const { r, host } = openQ02();
    placeCells(host, ['C4', '쉼', 'D4', 'E4']);
    click(button(host, '내 배치 듣기'));
    r.run(1);
    expect(r.engine.startCalls).toBe(0);
    expect(r.engine.sinks.size).toBe(0);
    expect(qa(host, '.cell-mine.is-playing')).toHaveLength(1);
    click(button(host, '배치 확인'));
    expect(judgment(host)).toEqual({ state: 'passed', sentences: ['통과했어요. 목표와 같아요.'] });
  });
});

// ---------------------------------------------------------------------------
// Q01 같은 음의 자리 찾기

interface Q01Case {
  id: string;
  title: string;
  /** [높은음자리표, 낮은음자리표] 보표 위치. null = 놓지 않음 */
  positions: [number | null, number | null];
  /** 읽은 음 이름 */
  names: [string | null, string | null];
  /** 화면 낭독기가 읽는 자리 */
  spoken: [string, string];
  /** [MIDI, 시작 초]. 길이는 모두 1.5초 */
  sound: Array<[number, number]>;
  state: 'passed' | 'needsRevision';
  sentences: string[];
}

const NOT_PLACED = '아직 놓지 않았어요';

const Q01_CASES: Q01Case[] = [
  { id: 'A', title: '정답 예시: C4를 아래 첫 덧줄과 위 첫 덧줄에', positions: [-2, 10], names: ['C4', 'C4'], spoken: ['아래 첫 덧줄', '위 첫 덧줄'], sound: [[60, 0], [60, 1.5]], state: 'passed', sentences: ['통과했어요. 두 보표의 음이 목표와 같아요.'] },
  { id: 'B', title: '높은음자리표 맨 아랫줄(E4)에 놓음 (2-6의 완료 기준)', positions: [0, 10], names: ['E4', 'C4'], spoken: ['맨 아랫줄', '위 첫 덧줄'], sound: [[64, 0], [60, 1.5]], state: 'needsRevision', sentences: ['지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.'] },
  { id: 'C', title: '낮은음자리표에서 한 칸 모자람(B3)', positions: [-2, 9], names: ['C4', 'B3'], spoken: ['아래 첫 덧줄', '맨 윗줄의 위 칸'], sound: [[60, 0], [59, 1.5]], state: 'needsRevision', sentences: ['지금 위치는 B3이에요. 목표 C4는 낮은음자리표의 위 첫 덧줄에 있어요.'] },
  { id: 'D', title: '낮은음자리표 맨 윗줄(A3)에 놓음', positions: [-2, 8], names: ['C4', 'A3'], spoken: ['아래 첫 덧줄', '맨 윗줄'], sound: [[60, 0], [57, 1.5]], state: 'needsRevision', sentences: ['지금 위치는 A3이에요. 목표 C4는 낮은음자리표의 위 첫 덧줄에 있어요.'] },
  { id: 'E', title: '두 보표에 같은 모양으로 놓음(낮은음자리표에서는 E2)', positions: [-2, -2], names: ['C4', 'E2'], spoken: ['아래 첫 덧줄', '아래 첫 덧줄'], sound: [[60, 0], [40, 1.5]], state: 'needsRevision', sentences: ['지금 위치는 E2예요. 목표 C4는 낮은음자리표의 위 첫 덧줄에 있어요.'] },
  { id: 'F', title: '옥타브가 다름: 높은음자리표 셋째 칸(C5)', positions: [5, 10], names: ['C5', 'C4'], spoken: ['셋째 칸', '위 첫 덧줄'], sound: [[72, 0], [60, 1.5]], state: 'needsRevision', sentences: ['높은음자리표 보표: 옥타브가 달라요. 지금은 C5, 목표는 C4예요.'] },
  { id: 'G', title: '누락: 낮은음자리표에 놓지 않음', positions: [-2, null], names: ['C4', null], spoken: ['아래 첫 덧줄', NOT_PLACED], sound: [[60, 0]], state: 'needsRevision', sentences: ['낮은음자리표 보표에 음이 아직 없어요.'] },
];

interface Q01Observed {
  c: Q01Case;
  drawn: [Drawn[], Drawn[]];
  spokenRead: string[];
  sound: Sounded[];
  judged: { state: string; sentences: string[] };
}
const q01Observed: Q01Observed[] = [];

describe('Q01: 두 보표의 악보, 소리, 판정', () => {
  for (const c of Q01_CASES) {
    it(`${c.id}. ${c.title}`, async () => {
      const r = rig();
      act(() => {
        r.controller.open(Q01, 'middle-c');
      });
      const m = mount(h(ClefPanel, { controller: r.controller }));
      current = m;
      const host = m.host;
      const slots = r.controller.staffSlots();
      act(() => {
        c.positions.forEach((p, i) => {
          if (p !== null) r.controller.placeOnStaff(slots[i]!, p);
        });
      });
      expect(judgment(host).state).toBe('none');

      const surfaces = ['treble', 'bass'].map((id) => q(host, `.staff-surface[data-slot-id="${id}"]`)!);
      const drawn: [Drawn[], Drawn[]] = [readDrawn(surfaces[0]!.querySelector('svg')!), readDrawn(surfaces[1]!.querySelector('svg')!)];
      const spokenRead = surfaces.map((s) => s.getAttribute('aria-valuetext') ?? '');
      const sound = await listen(r, host, '두 음 듣기', 4.5);
      click(button(host, '배치 확인'));
      const judged = judgment(host);

      // 1) 악보: 그려진 위치와 그 위치에서 읽은 음 이름이 기준과 같다. 놓지 않은 보표에는 음표가 없다
      const tables = [TREBLE, BASS];
      for (let i = 0; i < 2; i++) {
        const notes = drawn[i]!.filter((d): d is DrawnNote => d.kind === 'note');
        const expectedPos = c.positions[i];
        if (expectedPos === null) {
          expect(drawn[i]).toHaveLength(0);
        } else {
          expect(notes).toHaveLength(1);
          expect(notes[0]!.position).toBe(expectedPos);
          expect(tables[i]![notes[0]!.position]).toBe(c.names[i]);
          expect(notes[0]!.glyph).toBe(GLYPH_NOTEHEAD_WHOLE);
        }
      }
      // 2) 낭독: 설계서 5.3의 자리 이름과 같다
      expect(spokenRead).toEqual(c.spoken);
      c.positions.forEach((p, i) => {
        expect(spokenRead[i]).toBe(p === null ? NOT_PLACED : SPOKEN[p]);
      });
      // 3) 소리: 놓은 보표의 음만, 높은음자리표부터 차례로 2박씩
      expect(sound.map((s) => [s.midi, s.startSec])).toEqual(c.sound);
      for (const s of sound) expect(s.lengthSec).toBe(TWO_BEATS_SEC);
      // 4) 악보와 소리의 대조: 읽은 이름의 MIDI가 소리와 같다
      const placed = c.names.filter((x): x is string => x !== null);
      expect(sound.map((s) => s.midi)).toEqual(placed.map((name) => MIDI_OF[name]));
      // 5) 판정
      expect(judged.state).toBe(c.state);
      expect(judged.sentences).toEqual(c.sentences);
      q01Observed.push({ c, drawn, spokenRead, sound, judged });
    });
  }
});

// ---------------------------------------------------------------------------
// 문서

const fmt = (x: number): string => x.toFixed(2);
const signed = (p: number): string => (p > 0 ? `+${p}` : p < 0 ? `\u2212${-p}` : '0');
const soundText = (s: Sounded[]): string => (s.length === 0 ? '소리 없음' : s.map((x) => `${x.midi}@${fmt(x.startSec)}`).join(' · '));
const stateText: Record<string, string> = { passed: '통과', needsRevision: '고칠 곳 있음', none: '판정 전' };
const judgedText = (j: { state: string; sentences: string[] }): string => `**${stateText[j.state] ?? j.state}**<br>${j.sentences.join('<br>')}`;

function q02Cell(c: Cell): string {
  return c ?? '(빈 칸)';
}

function buildDocument(): string {
  const lines: string[] = [];
  lines.push('# 2단계 악보·소리·판정 대조표', '');
  lines.push('이 문서는 `tests/unit/phase2-contrast.test.tsx`가 만든다. 직접 고치지 않는다. 고칠 때는 `UPDATE_DOCS=1 npx vitest run tests/unit/phase2-contrast.test.tsx`로 다시 만든다.', '');
  lines.push('근거: 설계서 12.5(2단계 완료 기준), 11.2의 1번, 13.3 G2의 3번. 이 표의 모든 행은 테스트에서 사람이 적은 기준값과 일치한 것만 남는다. 일치하지 않으면 테스트가 실패하고 문서는 만들어지지 않는다.', '');
  lines.push('## 읽는 법', '');
  lines.push('- **놓은 것**: 사용자가 패널에서 누른 그대로다(Q02는 박 칸에 재료를 놓았고, Q01은 오선 위치를 눌렀다).');
  lines.push('- **악보**: 화면에 그려진 SVG의 도형에서 읽었다. 음표머리의 높이를 오선 줄 사이 거리의 절반(한 칸)으로 나눈 보표 위치(맨 아랫줄 0, 한 칸마다 1)에 사람이 적은 음 이름 표를 댔고, 쉼표는 글자 모양으로 읽었다. 박을 비워 둔 곳에는 아무것도 그려지지 않는다.');
  lines.push('- **소리**: 소리 받이(NoteSink)에 실제로 넘어간 음이다. `MIDI번호@재생 시작 뒤 초`. 재생 단추를 누른 뒤 시작 지연 0.06초는 뺐다. 쉼표와 빈 박에서는 소리가 없다.');
  lines.push('- **판정**: 패널에 나온 문장 그대로다.');
  lines.push('- **기준값**: C4=MIDI 60, D4=62, E4=64, B3=59, A3=57, C5=72, E2=40(설계서 5.8과 상세 설계). 4/4에서 4분음표는 960틱이고 템포 4분음표=80이면 한 박 0.75초, 한 마디 3초다. 높은음자리표 맨 아랫줄은 E4, 낮은음자리표 맨 아랫줄은 G2다(설계서 1-3).');
  lines.push('');

  lines.push('## Q02 쉼이 있는 한 마디 (4/4, 4분음표=80, 높은음자리표)', '');
  lines.push('목표(정답 예시): 악보 `C4(−2) · 쉼 · D4(−1) · E4(0)`, 소리 `60@0.00 · 62@1.50 · 64@2.25`(목표 듣기). 음마다 길이는 한 박(0.75초)이다.', '');
  lines.push('| 번호 | 놓은 것 (1–4박) | 악보에서 읽은 것 | 소리 | 판정 |');
  lines.push('|---|---|---|---|---|');
  for (const o of q02Observed) {
    const words = scoreWords(o.drawn, TREBLE)
      .map((w) => (w === '쉼' ? '쉼' : `${w.name}(${signed(w.position)})`))
      .join(' · ');
    lines.push(`| ${o.c.id}. ${o.c.title} | ${o.c.cells.map(q02Cell).join(' · ')} | ${words || '(그려진 것 없음)'} | ${soundText(o.sound)} | ${judgedText(o.judged)} |`);
  }
  lines.push('');
  lines.push('- H행은 소리가 정답(A행)과 같은데도 판정이 고칠 곳을 알리는 유일한 행이다. 소리만으로는 빈 박과 쉼표를 구분할 수 없고, 이 과제는 쉼표를 적는 것이라서 한 마디를 빈틈없이 채워야 하기 때문이다(설계서 4.4: 돌이 여울을 빈틈없이 채워야 한 마디가 된다). 판정 문장이 무엇이 빠졌는지 말하므로 의도한 동작이다.');
  lines.push('- G행에서 첫 음이 0.75초에 울리는 것은 첫 박의 쉼표만큼 소리가 비어 있다는 뜻이다. 쉼표가 악보에서 차지하는 시간과 소리에서 비는 시간이 같다.');
  lines.push('- 소리가 꺼져 있을 때는 소리 받이에 아무것도 가지 않지만 재생 위치 표시는 움직이고 판정은 같다(W-11, 테스트로 확인).');
  lines.push('');

  lines.push('## Q01 같은 음의 자리 찾기 (4/4, 4분음표=80, 온음표 하나씩)', '');
  lines.push('목표(정답 예시): C4를 높은음자리표의 아래 첫 덧줄(−2)과 낮은음자리표의 위 첫 덧줄(+10)에. 두 음 듣기는 놓은 음을 높은음자리표부터 차례로 음마다 2박(1.5초)씩 들려 준다. 목표 악보는 정답을 보여 주지 않으려고 패널에 그리지 않는다.', '');
  lines.push('| 번호 | 놓은 것 (높은음자리표 / 낮은음자리표) | 악보에서 읽은 것 | 화면 낭독기가 읽는 자리 | 소리 | 판정 |');
  lines.push('|---|---|---|---|---|---|');
  for (const o of q01Observed) {
    const read = [TREBLE, BASS].map((table, i) => {
      const note = o.drawn[i]!.find((d): d is DrawnNote => d.kind === 'note');
      return note ? `${table[note.position]}(${signed(note.position)})` : '(없음)';
    });
    lines.push(`| ${o.c.id}. ${o.c.title} | ${o.c.positions.map((p) => (p === null ? '(놓지 않음)' : signed(p))).join(' / ')} | ${read.join(' / ')} | ${o.spokenRead.join(' / ')} | ${soundText(o.sound)} | ${judgedText(o.judged)} |`);
  }
  lines.push('');
  lines.push('- 설계서 5.3의 자리 이름(아래 첫 덧줄, 맨 아랫줄의 아래 칸, 맨 윗줄의 위 칸, 위 첫 덧줄)과 낭독 문장이 같다.');
  lines.push('- B행의 문장은 설계서 4.7의 예("지금 위치는 E4예요. 목표 C4는 아래 첫 덧줄에 있어요.")에 "높은음자리표의"를 더했다. 이 과제는 보표가 둘이라서 어느 보표의 덧줄인지 말해야 하기 때문이다.');
  lines.push('- 패널은 \'배치 확인\'을 누르기 전에는 음 이름을 알려 주지 않고 위치만 말한다(낭독 열). 음 이름은 판정 문장에서만 나온다.');
  lines.push('');

  lines.push('## 11.2 검수 점검표에서 이 단계가 확인하는 것', '');
  lines.push('| 항목 | 결과 | 근거 |');
  lines.push('|---|---|---|');
  lines.push('| 1 정답 예시의 악보, 재생음, 판정이 일치한다 | 일치 | 위 표의 Q02 A행과 Q01 A행, 그리고 Q02의 목표 악보와 목표 듣기(표 위 문장) |');
  lines.push('| 2 오답 사례마다 기대한 설명이 나온다 | 부분 | 누락(D, G, H), 추가(E), 순서(F), 음 다름(C), 옥타브(Q01 F), 위치(Q01 B–E)는 이 표에서 확인한다. 길이와 표기는 이 두 과제의 재료로 만들 수 없다. 음소거는 `tests/unit/attempt.test.ts`(W-8)에서 확인한다 |');
  lines.push('| 3 음이름과 옥타브가 보표 위치에서 계산한 값과 같다 | 일치 | 위 표의 악보 열(손으로 적은 위치→이름 표) |');
  lines.push('| 4 마디 길이의 합이 박자표와 같다 | 일치 | `npm run validate` |');
  lines.push('| 5 박의 단위가 함께 적혀 있다 | 일치 | 패널의 템포 표기는 "4분음표 = 80 BPM"처럼 단위와 함께 나온다(`tests/unit/rhythm-panel.test.tsx`) |');
  lines.push('| 6 도움 경로가 열리고 통과 없이 돌아온다 | 일치 | `tests/unit/session.test.ts`, `tests/unit/controller.test.ts` |');
  lines.push('| 7 설치물과 패널에서 같은 결과가 나온다 | 해당 없음 | 설치물은 4단계 |');
  lines.push('| 8 출처와 권리가 적혀 있다 | **대기** | 두 과제의 검수 기록이 `unreviewed`, 권리가 `unconfirmed`다. 사람의 음악 검수와 권리 확인이 끝나기 전까지 `availability: draft`로 둔다 |');
  lines.push('');
  lines.push('## 사람 확인 대기', '');
  lines.push('- 이 표는 자동 점검이다. 사람의 음악 검수(결정 D-4)는 이 표를 보고 문장과 음이 음악적으로 옳은지 확인하는 일이다. 대기 중이다.');
  lines.push('- 귀로 듣는 확인(C2–C6가 고르게 들리는지)은 사람이 해야 한다. 오프라인 측정은 진폭이 같은지만 말해 주며, 사람 귀가 느끼는 크기는 높이에 따라 다르다.');
  lines.push('');
  return lines.join('\n');
}

describe('대조표 문서', () => {
  it('모든 행이 모였고, 문서가 이 결과와 같다', () => {
    expect(q02Observed.map((o) => o.c.id)).toEqual(Q02_CASES.map((c) => c.id));
    expect(q01Observed.map((o) => o.c.id)).toEqual(Q01_CASES.map((c) => c.id));
    const doc = buildDocument();
    if (process.env.UPDATE_DOCS) {
      fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
      fs.writeFileSync(DOC_PATH, doc, 'utf-8');
      return;
    }
    expect(fs.existsSync(DOC_PATH), `${DOC_PATH}가 없어요. UPDATE_DOCS=1로 만드세요`).toBe(true);
    expect(fs.readFileSync(DOC_PATH, 'utf-8')).toBe(doc);
  });
});
