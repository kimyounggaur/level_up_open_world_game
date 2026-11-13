// 2-4 악보 그리기: 한 보표, 덧줄, 임시표, 쉼표, 셋잇단, 큰보표. VexFlow가 SVG로 그린다(10.1).
// 그린 결과에서 음의 보표 위치를 거꾸로 읽어 낸다. 악보가 정답 데이터와 같은지 도형으로 다시 확인하기 위해서다.
import { Accidental, Beam, Dot, Formatter, GhostNote, Renderer, Stave, StaveConnector, StaveNote, Stem, Tuplet, Voice } from 'vexflow/bravura';
import { LETTERS } from '../../domain/pitch';
import type { Accidental as WrittenAccidental, Letter } from '../../domain/pitch';
import { isNote, measureCountOf } from '../../domain/score';
import type { NoteEvent, Score, ScoreEvent, ScoreStaff, TupletGroup } from '../../domain/score';
import { countUnitTicks, isCompound, measureTicks, parseMeter } from '../../domain/time';
import type { NoteValue } from '../../domain/time';

export type Highlight = 'error' | 'ok' | 'focus';

export interface NotationOptions {
  /** 한 줄에 놓을 마디 수. 넘으면 다음 줄로 간다 (기본 4) */
  measuresPerSystem?: number;
  /** 마디 하나가 차지하는 최소 폭(px). 음이 많으면 더 넓어진다 (기본 150) */
  minMeasureWidth?: number;
  /** 첫 마디에 박자표를 그린다 (기본 true) */
  showTimeSignature?: boolean;
  /** 사건 id별 표시. 색만으로 뜻을 전하지 않도록 호출한 쪽이 문장과 기호를 따로 둔다 */
  highlight?: Readonly<Record<string, Highlight>>;
  /** 스크린 리더용 이름과 설명 */
  title?: string;
  description?: string;
}

export interface RenderedNote {
  eventIds: string[];
  staffId: string;
  voiceId: string;
  measureIndex: number;
  onsetTicks: number;
  kind: 'note' | 'chord' | 'rest';
  /** 그려진 도형에서 읽은 보표 위치(0 = 맨 아랫줄, 한 칸 = 1). 쉼표는 빈 배열 */
  positions: number[];
  /** 그려진 음표의 임시표 기호 */
  accidentals: Array<string | null>;
  x: number;
  /** 각 음표 머리의 y */
  ys: number[];
  /** VexFlow 길이 코드. 예: 'q', '8', 'qr', 'hd' */
  duration: string;
  tuplet: boolean;
  beamed: boolean;
  dots: number;
  /** 기둥 방향. 온음표와 쉼표는 기둥이 없다 */
  stem: 'up' | 'down' | 'none';
}

export interface RenderedStave {
  staffId: string;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  clef: string;
  /** 맨 아랫줄의 y */
  bottomLineY: number;
  /** 줄 사이 간격 */
  spacing: number;
}

export interface RenderedScore {
  svg: SVGSVGElement;
  width: number;
  height: number;
  notes: RenderedNote[];
  staves: RenderedStave[];
}

// ---------------------------------------------------------------------------
// 틱 ↔ VexFlow 길이 코드

const DURATION_CODES: Array<{ ticks: number; code: string; dots: number }> = [
  { ticks: 3840, code: 'w', dots: 0 },
  { ticks: 2880, code: 'h', dots: 1 },
  { ticks: 1920, code: 'h', dots: 0 },
  { ticks: 1440, code: 'q', dots: 1 },
  { ticks: 960, code: 'q', dots: 0 },
  { ticks: 720, code: '8', dots: 1 },
  { ticks: 480, code: '8', dots: 0 },
  { ticks: 360, code: '16', dots: 1 },
  { ticks: 240, code: '16', dots: 0 },
  { ticks: 180, code: '32', dots: 1 },
  { ticks: 120, code: '32', dots: 0 },
];

const VALUE_CODE: Record<NoteValue, string> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', sixteenth: '16', thirtySecond: '32' };

export function durationCodeOf(ticks: number): { code: string; dots: number } | null {
  const hit = DURATION_CODES.find((d) => d.ticks === ticks);
  return hit ? { code: hit.code, dots: hit.dots } : null;
}

/** 틱 수를 표준 길이들의 합으로 쪼갠다(빈 곳 채우기용). 쪼갤 수 없는 나머지는 버린다 */
export function decomposeTicks(ticks: number): number[] {
  const out: number[] = [];
  let rest = ticks;
  for (const d of DURATION_CODES) {
    while (rest >= d.ticks) {
      out.push(d.ticks);
      rest -= d.ticks;
    }
  }
  return out;
}

const ACCIDENTAL_SYMBOL: Record<WrittenAccidental, string> = { sharp: '#', flat: 'b', natural: 'n', doubleSharp: '##', doubleFlat: 'bb' };

const KEY_SIGNATURE_NAMES: Record<number, string> = {
  0: 'C',
  1: 'G',
  2: 'D',
  3: 'A',
  4: 'E',
  5: 'B',
  6: 'F#',
  7: 'C#',
  [-1]: 'F',
  [-2]: 'Bb',
  [-3]: 'Eb',
  [-4]: 'Ab',
  [-5]: 'Db',
  [-6]: 'Gb',
  [-7]: 'Cb',
};

export function keySignatureName(ks: number): string {
  const name = KEY_SIGNATURE_NAMES[ks];
  if (!name) throw new Error(`지원하지 않는 조표예요: ${ks}`);
  return name;
}

const keyOf = (p: { letter: Letter; octave: number }): string => `${p.letter.toLowerCase()}/${p.octave}`;
const diatonic = (p: { letter: Letter; octave: number }): number => p.octave * 7 + LETTERS.indexOf(p.letter);

// ---------------------------------------------------------------------------
// 슬롯: 한 보표·한 마디·한 성부의 그려질 것

interface Slot {
  tick: number;
  duration: number;
  /** null이면 빈 곳(보이지 않는 자리 채움) */
  events: ScoreEvent[] | null;
  group?: TupletGroup;
}

function buildSlots(events: ScoreEvent[], measureLen: number, tuplets: readonly TupletGroup[]): Slot[] {
  const groupOf = new Map<string, TupletGroup>();
  for (const g of tuplets) for (const id of g.eventIds) groupOf.set(id, g);
  const sorted = [...events].sort((a, b) => a.onsetTicks - b.onsetTicks || (isNote(a) && isNote(b) ? diatonic(a.writtenPitch) - diatonic(b.writtenPitch) : 0));
  const slots: Slot[] = [];
  let cursor = 0;
  const pushGap = (from: number, to: number) => {
    let t = from;
    for (const d of decomposeTicks(to - from)) {
      slots.push({ tick: t, duration: d, events: null });
      t += d;
    }
  };
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    // 같은 시작과 길이의 음은 한 화음으로 묶는다
    const chord: ScoreEvent[] = [e];
    if (isNote(e)) {
      while (i + 1 < sorted.length) {
        const n = sorted[i + 1]!;
        if (isNote(n) && n.onsetTicks === e.onsetTicks && n.durationTicks === e.durationTicks && groupOf.get(n.eventId) === groupOf.get(e.eventId)) {
          chord.push(n);
          i++;
        } else break;
      }
    }
    if (e.onsetTicks > cursor) pushGap(cursor, e.onsetTicks);
    slots.push({ tick: e.onsetTicks, duration: e.durationTicks, events: chord, group: groupOf.get(e.eventId) });
    cursor = Math.max(cursor, e.onsetTicks + e.durationTicks);
  }
  if (cursor < measureLen) pushGap(cursor, measureLen);
  return slots;
}

// ---------------------------------------------------------------------------
// 그리기

const STAFF_ROW_HEIGHT = 130;
const STAFF_GAP = 60;
const MARGIN_X = 10;
// 위아래로 덧줄 셋(위치 −6…+14)까지 잘리지 않게 여유를 둔다
const MARGIN_Y = 24;

interface BuiltVoice {
  voice: Voice;
  beams: Beam[];
  tuplets: Tuplet[];
  notes: Array<{ vf: StaveNote; slot: Slot; ids: string[]; voiceId: string; accidentals: Array<string | null>; tupletMember: boolean }>;
}

function buildVoice(
  score: Score,
  staff: ScoreStaff,
  voiceId: string,
  voiceIndexInStaff: number,
  voiceCount: number,
  events: ScoreEvent[],
  measureLen: number,
  meter: { beats: number; unit: number },
  beamSpan: number,
): BuiltVoice {
  const slots = buildSlots(events, measureLen, score.tuplets ?? []);
  const notes: BuiltVoice['notes'] = [];
  const tickables: Array<StaveNote | GhostNote> = [];
  // 성부가 둘 이상이면 기둥 방향을 정해 둔다. 하나면 음 높이에 따라 자동으로 정한다.
  const stemDir = voiceCount > 1 ? (voiceIndexInStaff === 0 ? Stem.UP : Stem.DOWN) : undefined;
  const autoStem = stemDir === undefined;
  const tupletNotes = new Map<string, StaveNote[]>();
  const groups = new Map<string, TupletGroup>();

  for (const slot of slots) {
    if (!slot.events) {
      const code = durationCodeOf(slot.duration);
      const ghost = new GhostNote({ duration: code ? `${code.code}${code.dots ? 'd' : ''}` : '8' });
      if (code && code.dots) Dot.buildAndAttach([ghost], { all: true });
      tickables.push(ghost);
      continue;
    }
    const first = slot.events[0]!;
    const isRest = first.type === 'rest';
    let code: string;
    let dots = 0;
    if (slot.group) {
      code = VALUE_CODE[slot.group.writtenBaseDuration];
    } else {
      const d = durationCodeOf(slot.duration);
      if (!d) throw new Error(`그릴 수 없는 길이예요: ${slot.duration}틱 (사건 ${first.eventId})`);
      code = d.code;
      dots = d.dots;
    }
    const accidentals: Array<string | null> = [];
    let vf: StaveNote;
    if (isRest) {
      vf = new StaveNote({ clef: staff.clef, keys: [staff.clef === 'bass' ? 'd/3' : 'b/4'], duration: `${code}${dots ? 'd' : ''}r` });
    } else {
      const sortedNotes = [...(slot.events as NoteEvent[])].sort((a, b) => diatonic(a.writtenPitch) - diatonic(b.writtenPitch));
      vf = new StaveNote({ clef: staff.clef, keys: sortedNotes.map((n) => keyOf(n.writtenPitch)), duration: `${code}${dots ? 'd' : ''}`, ...(stemDir !== undefined ? { stemDirection: stemDir } : { autoStem: true }) });
      sortedNotes.forEach((n, i) => {
        const acc = n.writtenPitch.accidental;
        accidentals.push(acc ? ACCIDENTAL_SYMBOL[acc] : null);
        if (acc) vf.addModifier(new Accidental(ACCIDENTAL_SYMBOL[acc]), i);
      });
    }
    if (dots > 0) Dot.buildAndAttach([vf], { all: true });
    tickables.push(vf);
    const ids = slot.events.map((e) => e.eventId);
    notes.push({ vf, slot, ids, voiceId, accidentals, tupletMember: Boolean(slot.group) });
    if (slot.group) {
      const list = tupletNotes.get(slot.group.groupId) ?? [];
      list.push(vf);
      tupletNotes.set(slot.group.groupId, list);
      groups.set(slot.group.groupId, slot.group);
    }
  }

  // 셋잇단은 박자 계산이 바뀌므로 성부에 음을 넣기 전에 만든다.
  const tuplets: Tuplet[] = [];
  for (const [gid, list] of tupletNotes) {
    const g = groups.get(gid)!;
    tuplets.push(new Tuplet(list, { numNotes: g.actualNotes, notesOccupied: g.normalNotes, ratioed: false }));
  }
  const voice = new Voice({ numBeats: meter.beats, beatValue: meter.unit }).setMode(Voice.Mode.SOFT);
  voice.addTickables(tickables);

  // 8분음표보다 짧은 음은 박 단위로 묶는다. 쉼표나 빈 곳이 끼면 끊고, 셋잇단 묶음은 박을 넘어도 한 묶음이다.
  const beams: Beam[] = [];
  let group: StaveNote[] = [];
  let groupKey = '';
  let prevEnd = -1;
  const flush = (): void => {
    if (group.length >= 2) beams.push(new Beam(group, autoStem));
    group = [];
  };
  for (const n of notes) {
    const isNoteSlot = n.slot.events![0]!.type === 'note';
    const beamable = isNoteSlot && ['8', '16', '32'].includes(n.vf.getDuration());
    if (!beamable) {
      flush();
      prevEnd = n.slot.tick + n.slot.duration;
      continue;
    }
    const key = n.slot.group ? `g:${n.slot.group.groupId}` : `b:${Math.floor(n.slot.tick / beamSpan)}`;
    if (group.length > 0 && (n.slot.tick !== prevEnd || key !== groupKey)) flush();
    if (group.length === 0) groupKey = key;
    group.push(n.vf);
    prevEnd = n.slot.tick + n.slot.duration;
  }
  flush();
  return { voice, beams, tuplets, notes };
}

/** 악보를 container 안에 SVG로 그린다. 기존 내용은 지운다. */
export function renderScore(container: HTMLElement, score: Score, options: NotationOptions = {}): RenderedScore {
  const meter = parseMeter(score.meter);
  const measureLen = measureTicks(score.meter);
  const measures = Math.max(1, measureCountOf(score));
  const perSystem = Math.max(1, options.measuresPerSystem ?? 4);
  const minW = options.minMeasureWidth ?? 150;
  const showTime = options.showTimeSignature ?? true;
  // 빗금으로 묶는 단위: 4/4는 4분음표 하나, 6/8은 점4분음표 하나, 3/8처럼 짧은 마디는 마디 전체
  const beamSpan = isCompound(meter) ? 1440 : meter.unit >= 8 ? Math.min(measureLen, 1440) : countUnitTicks(meter);
  const staves = score.staves;
  if (staves.length === 0) throw new Error('보표가 없는 악보는 그릴 수 없어요');

  // 마디마다 필요한 폭: 가장 슬롯이 많은 보표 기준
  const slotCountAt = (m: number): number => {
    let max = 1;
    for (const st of staves) {
      const evs = score.events.filter((e) => e.staffId === st.staffId && e.measureIndex === m);
      const byVoice = new Map<string, ScoreEvent[]>();
      for (const e of evs) byVoice.set(e.voiceId, [...(byVoice.get(e.voiceId) ?? []), e]);
      for (const list of byVoice.values()) max = Math.max(max, buildSlots(list, measureLen, score.tuplets ?? []).filter((s) => s.events).length);
    }
    return max;
  };
  const prefixWidth = (m: number, firstInSystem: boolean): number => {
    if (!firstInSystem) return 0;
    const ks = Math.max(...staves.map((s) => Math.abs(s.keySignature)));
    return 44 + ks * 12 + (m === 0 && showTime ? 30 : 0);
  };

  const systems: number[][] = [];
  for (let m = 0; m < measures; m += perSystem) systems.push(Array.from({ length: Math.min(perSystem, measures - m) }, (_, i) => m + i));
  const measureWidth = (m: number, first: boolean): number => Math.max(minW, 38 * slotCountAt(m) + 30) + prefixWidth(m, first);
  const systemWidths = systems.map((sys) => sys.reduce((sum, m, i) => sum + measureWidth(m, i === 0), 0));
  const totalWidth = Math.max(...systemWidths) + MARGIN_X * 2 + 6;
  const systemHeight = staves.length * STAFF_ROW_HEIGHT + (staves.length - 1) * STAFF_GAP;
  const totalHeight = systems.length * (systemHeight + 20) + MARGIN_Y * 2;

  container.replaceChildren();
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(totalWidth, totalHeight);
  const ctx = renderer.getContext();
  const svg = container.querySelector('svg') as SVGSVGElement;
  svg.setAttribute('role', 'img');
  svg.setAttribute('class', 'notation-svg');
  svg.removeAttribute('pointer-events');
  // VexFlow가 붙인 고정 크기(style)를 지운다. 크기는 viewBox와 화면 스타일이 정해서 폭에 맞춰 줄고 늘어난다
  svg.style.removeProperty('width');
  svg.style.removeProperty('height');
  if (!svg.getAttribute('style')) svg.removeAttribute('style');
  if (options.title) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = options.title;
    svg.insertBefore(t, svg.firstChild);
    svg.setAttribute('aria-label', options.title);
  }
  if (options.description) {
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'desc');
    d.textContent = options.description;
    svg.insertBefore(d, svg.children[1] ?? null);
  }

  const out: RenderedScore = { svg, width: totalWidth, height: totalHeight, notes: [], staves: [] };

  systems.forEach((sys, sysIdx) => {
    const sysTop = MARGIN_Y + sysIdx * (systemHeight + 20);
    let x = MARGIN_X;
    const firstStaves: Stave[] = [];
    const lastStaves: Stave[] = [];
    sys.forEach((m, i) => {
      const first = i === 0;
      const w = measureWidth(m, first);
      const measureStaves: Stave[] = [];
      staves.forEach((st, staffIdx) => {
        const y = sysTop + staffIdx * (STAFF_ROW_HEIGHT + STAFF_GAP) - 20;
        const stave = new Stave(x, y, w);
        if (first) {
          stave.addClef(st.clef);
          if (st.keySignature !== 0) stave.addKeySignature(keySignatureName(st.keySignature));
          if (m === 0 && showTime) stave.addTimeSignature(score.meter);
        }
        stave.setContext(ctx).draw();
        measureStaves.push(stave);
        out.staves.push({ staffId: st.staffId, measureIndex: m, x, y, width: w, clef: st.clef, bottomLineY: stave.getYForLine(4), spacing: stave.getSpacingBetweenLines() });

        // 이 보표·마디의 성부들
        const voicesHere = score.voices.filter((v) => v.staffId === st.staffId);
        const built: BuiltVoice[] = [];
        voicesHere.forEach((v, vi) => {
          const evs = score.events.filter((e) => e.voiceId === v.voiceId && e.measureIndex === m);
          if (evs.length === 0) return;
          built.push(buildVoice(score, st, v.voiceId, vi, voicesHere.length, evs, measureLen, meter, beamSpan));
        });
        if (built.length === 0) return;
        const voices = built.map((b) => b.voice);
        new Formatter().joinVoices(voices).formatToStave(voices, stave);
        for (const b of built) {
          b.voice.draw(ctx, stave);
          b.beams.forEach((bm) => bm.setContext(ctx).draw());
          b.tuplets.forEach((t) => t.setContext(ctx).draw());
        }
        for (const b of built) {
          const beamed = new Set(b.beams.flatMap((bm) => bm.getNotes()));
          for (const n of b.notes) {
            const ys = n.vf.getYs();
            const isRest = n.slot.events![0]!.type === 'rest';
            const sp = stave.getSpacingBetweenLines();
            const positions = isRest ? [] : ys.map((yy) => Math.round((stave.getYForLine(4) - yy) / (sp / 2)));
            out.notes.push({
              eventIds: n.ids,
              staffId: st.staffId,
              voiceId: n.voiceId,
              measureIndex: m,
              onsetTicks: n.slot.tick,
              kind: isRest ? 'rest' : n.ids.length > 1 ? 'chord' : 'note',
              positions,
              accidentals: n.accidentals,
              x: n.vf.getAbsoluteX(),
              ys,
              duration: n.vf.getDuration() + (n.vf.isRest() ? 'r' : ''),
              tuplet: n.tupletMember,
              beamed: beamed.has(n.vf),
              dots: Math.round(Dot.getDots(n.vf).length / Math.max(1, n.vf.getKeys().length)),
              stem: isRest || !n.vf.hasStem() ? 'none' : n.vf.getStemDirection() === Stem.UP ? 'up' : 'down',
            });
            const el = n.vf.getSVGElement();
            if (el) {
              el.setAttribute('data-event-ids', n.ids.join(' '));
              const mark = n.ids.map((id) => options.highlight?.[id]).find(Boolean);
              if (mark) el.classList.add(`is-${mark}`);
            }
          }
        }
      });
      if (first) firstStaves.push(...measureStaves);
      lastStaves.push(...measureStaves);
      x += w;
    });
    // 큰보표: 보표가 둘 이상이면 왼쪽에 중괄호와 세로선을 그린다
    if (staves.length > 1) {
      const top = firstStaves[0]!;
      const bottom = firstStaves[staves.length - 1]!;
      new StaveConnector(top, bottom).setType('brace').setContext(ctx).draw();
      new StaveConnector(top, bottom).setType('singleLeft').setContext(ctx).draw();
      const endTop = lastStaves[lastStaves.length - staves.length]!;
      const endBottom = lastStaves[lastStaves.length - 1]!;
      new StaveConnector(endTop, endBottom).setType('singleRight').setContext(ctx).draw();
    }
  });

  out.notes.sort((a, b) => a.measureIndex - b.measureIndex || a.onsetTicks - b.onsetTicks || a.staffId.localeCompare(b.staffId) || a.voiceId.localeCompare(b.voiceId));
  return out;
}
