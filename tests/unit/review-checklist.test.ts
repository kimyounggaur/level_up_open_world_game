// 5-10 검수 점검표(설계서 11.2)를 여덟 과제의 모든 판본에 한꺼번에 댄다. 기계가 확인할 수 있는 항목만 확인한다.
//   1 정답 예시의 악보, 재생음, 판정 결과가 서로 일치한다   3 음이름과 옥타브가 보표 위치에서 계산한 값과 같다
//   4 마디 길이의 합이 박자표와 같다                       5 '한 박'이라고만 쓴 곳이 없다(박의 단위를 함께 적는다)
//   8 출처와 권리가 적혀 있다
// 이 파일이 하지 않는 것(점검표의 나머지는 `docs/approvals.md`의 5-10과 6-11에서 기존 시험으로 이어 놓았다):
//   2 오답 사례마다 기대한 설명: `evaluators.test.ts`(5-10)와, 6단계 과제까지 일부러 틀린 입력을 만들어 대는 `review-wrong-cases.test.ts`(6-11),
//     7단계 과제의 `staff-hill-quests.test.ts`, `scale-trail-quests.test.ts`, `key-marsh-quests.test.ts`와, 음소거로 한 시도가 틀린 시도가 되지 않는 것(W-8)을 22개 판본 모두로 지키는 `review-seventh.test.ts`(7-8)
//   6 도움 경로가 열리고 통과 없이 돌아온다: 5-5의 시험, 그리고 6단계 작업대 화면의 '11.2의 6' 시험(timeline-hud, timeline-channel-hud, waterwheel-hud, bell-hud)과
//     7단계의 같은 시험(terrace-hud, scale-trail-hud, key-bridge-hud. 7-8에서 새 과제 22개 판본 모두로 넓혔다)
//     (이 파일은 아래에서 기본 연습으로 나가는 연결이 Q08에만 있는지만 지킨다)
//   7 설치물과 패널에서 같은 결과: 두 화면이 같은 컨트롤러의 같은 초안과 같은 check()를 쓰는 구조(`docs/approvals.md`의 6-11, D-193, 7-8)와
//     `slotmap.test.ts`, 7단계의 패널 쌍둥이 시험(staff-panel, scale-trail-panel, key-marsh-panels) 등. 음악 검수, 플레이 검수, 권리 확인과 공개 승인: 사람의 일이다.
//   (이 파일은 점검표 밖의 G2 7번 조건으로, 정식 공개 채널이 검수 전 과제를 모두 '준비 중'으로 막는지를 모든 과제와 판본에 대해 지킨다: 아래 'G2의 7')
// 사람이 하는 단계(검수 대장의 music-review, play-review, rights-approval)는 이 시험이 완료로 바꾸지 않는다.
// 아래 마지막 묶음은 그 단계가 모두 '대기'로 남아 있고 과제가 모두 '초안'임을 확인한다. 사람이 끝내면 이 묶음을 먼저 고쳐야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentCatalog } from '@/domain/catalog';
import { evaluate } from '@/domain/evaluators';
import { renderAll } from '@/domain/feedback';
import { scoreToPlayback } from '@/domain/playback';
import { LETTER_PC } from '@/domain/pitch';
import { isNote, measureCountOf, resolveScore, validateScore } from '@/domain/score';
import type { NoteEvent, Score } from '@/domain/score';
import { pitchLetterAtStaffPosition, staffPositionOf } from '@/domain/staff';
import { measureTicks } from '@/domain/time';
import { answerInput } from './answers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...parts: string[]): any => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf-8'));
const questFiles = fs.readdirSync(path.join(root, 'content', 'quests')).filter((f) => f.endsWith('.json')).sort();
const QUESTS: Array<Record<string, any>> = questFiles.map((f) => readJson('content', 'quests', f));
/** [과제 id/판본 id, 과제, 판본] */
const VARIANTS = QUESTS.flatMap((q) => (q.variantIds as string[]).map((vid) => [`${q.questId}/${vid}`, q, q.variants[vid]] as const));
const NOTES = (score: Score): NoteEvent[] => score.events.filter(isNote);

/** 설계서 부록 A.0의 Q01–Q08 */
const EIGHT = ['pitch.same-note-two-clefs', 'rhythm.rest-in-a-bar', 'rhythm.short-notes-and-triplets', 'pitch.same-sound-different-names', 'chord.major-triad', 'chord.inversion', 'scale.major', 'song.short-piece'];
/**
 * 6단계에서 더한 과제(설계서 5.4의 Q13–Q19, 박자 강가의 징검다리와 잔물결 수로와 물레방아, 5.5의 Q20–Q23, 종나무 숲의 종나무와 빈터). 기계가 확인하는 항목(1, 3, 4, 5, 8)은 여덟 과제와 같이 댄다.
 * 교재 대조와 검수(사람의 일)는 6-11이 맡는다. 만들 때마다 여기에 더한다.
 */
const SIXTH = [
  'rhythm.three-four',
  'rhythm.note-values',
  'rhythm.dotted',
  'rhythm.rest-lengths',
  'rhythm.sixteenths',
  'rhythm.triplets',
  'rhythm.six-eight',
  'chord.major-and-minor',
  'chord.primary-triads',
  'chord.diminished-augmented',
  'chord.progression-walk',
];

/**
 * 7단계에서 더한 과제: 오선 언덕의 Q09–Q12(설계서 5.3, 계단밭 T5)와 음계 길의 Q24–Q26(5.6, 디딤돌 길 T1의 단음계 길과 다섯 음 길),
 * 건반 늪의 Q27–Q31(5.7, 건반 다리 T6 세 곳과 반음 계단 T1). 출처 기록은 Q27이 설계서가 가리킨 교재 023을 갖고, 7-8에서 Q25(052)·Q28(024)·Q30(021-2)에는
 * 그림으로 본 쪽을, Q29(075, 076)에는 글자 판독으로 읽은 쪽을 후보로 더했다(검수 아님, 사람 확인 대기). Q26·Q31은 후보를 찾지 못해 출처 기록이 아직 없고
 * 검수 대장의 음악 검수가 교재 대조를 적는다(아래 '11.2의 8'). 만들 때마다 여기에 더한다.
 */
const SEVENTH = [
  'staff.lines-and-spaces',
  'staff.ledger-lines',
  'staff.middle-c-neighbors',
  'staff.range-ladder',
  'scale.natural-minor',
  'scale.harmonic-minor',
  'scale.pentatonic',
  'key.black-key-names',
  'key.whole-and-half-steps',
  'key.build-intervals',
  'key.accidentals-in-a-bar',
  'scale.chromatic',
];

describe('점검표를 대는 범위: 범위 A의 여덟 과제와 6단계·7단계에서 더한 과제, 그 모든 판본', () => {
  it('설계서의 여덟 과제와 6단계·7단계에서 더한 과제가 모두 있고, 판본이 모두 잡힌다', () => {
    expect(QUESTS.map((q) => q.questId).sort()).toEqual([...EIGHT, ...SIXTH, ...SEVENTH].sort());
    expect(VARIANTS.length).toBeGreaterThanOrEqual(EIGHT.length + SIXTH.length + SEVENTH.length);
    for (const q of QUESTS) expect(Object.keys(q.variants).sort(), `${q.questId}의 판본`).toEqual([...q.variantIds].sort());
  });
});

// ---------------------------------------------------------------------------
// 1 정답 예시의 악보, 재생음, 판정 결과가 서로 일치한다

describe('11.2의 1: 정답 예시의 악보, 재생음, 판정 결과가 서로 일치한다', () => {
  it.each(VARIANTS)('%s', (_name, _q, v) => {
    const score = v.score as Score;
    // 판정: 정답 그대로를 입력하면 통과하고 설명이 나오지 않는다
    const r = evaluate(v.evaluatorSpec, answerInput(v), score);
    expect(renderAll(r.issues), '정답이 설명을 만들었어요').toEqual([]);
    expect(r.passed).toBe(true);

    // 재생음: 악보의 음 하나가 재생음 하나이고, 재생음의 MIDI는 데이터에 적힌 해석 음(음이름·옥타브·변화)에서 따로 계산한 값과 같다
    const pb = scoreToPlayback(score);
    const notes = NOTES(score);
    expect(pb.notes, '재생음의 수').toHaveLength(notes.length);
    const len = measureTicks(score.meter);
    for (const e of notes) {
      const n = pb.notes.find((x) => x.id === e.eventId);
      expect(n, `${e.eventId}의 재생음`).toBeDefined();
      const rp = e.resolvedPitch!;
      expect(n!.midi, `${e.eventId}의 MIDI`).toBe(12 * (rp.octave + 1) + LETTER_PC[rp.letter] + rp.alter);
      expect(rp.midi, `${e.eventId}의 데이터 MIDI`).toBe(n!.midi);
      expect(n!.onsetTick, `${e.eventId}의 시작`).toBe(e.measureIndex * len + e.onsetTicks);
      expect(n!.durationTick, `${e.eventId}의 길이`).toBe(e.durationTicks);
    }
    expect(pb.lengthTicks, '전체 길이').toBe(measureCountOf(score) * len);
    // 쉼표는 소리가 없다
    expect(pb.notes.every((n) => notes.some((e) => e.eventId === n.id))).toBe(true);
  });

  it('성부를 하나만 고른 재생은 그 성부의 음만 낸다(Q08의 성부 따로 듣기)', () => {
    const song = QUESTS.find((q) => q.questId === 'song.short-piece')!;
    for (const vid of song.variantIds as string[]) {
      const score = song.variants[vid].score as Score;
      for (const voice of score.voices) {
        const mine = NOTES(score).filter((e) => e.voiceId === voice.voiceId);
        const pb = scoreToPlayback(score, { voiceIds: [voice.voiceId] });
        expect(pb.notes.map((n) => n.id).sort(), `${vid} ${voice.voiceId}`).toEqual(mine.map((e) => e.eventId).sort());
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3 음이름과 옥타브가 보표 위치에서 계산한 값과 같다

describe('11.2의 3: 음이름과 옥타브가 보표 위치에서 계산한 값과 같다', () => {
  /** 도메인의 계산과 따로 적은 식: 온음계 계단 수에서 음자리표의 맨 아랫줄(높은음자리표 E4, 낮은음자리표 G2)을 뺀다 */
  const STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const positionOf = (clef: 'treble' | 'bass', letter: string, octave: number): number => octave * 7 + STEP[letter]! - (clef === 'treble' ? 4 * 7 + 2 : 2 * 7 + 4);

  it('설계서의 기준 위치: 높은음자리표 E4가 0, C4가 −2, 낮은음자리표 G2가 0, C4가 10', () => {
    expect(staffPositionOf('treble', { letter: 'E', octave: 4 })).toBe(0);
    expect(staffPositionOf('treble', { letter: 'C', octave: 4 })).toBe(-2);
    expect(staffPositionOf('bass', { letter: 'G', octave: 2 })).toBe(0);
    expect(staffPositionOf('bass', { letter: 'C', octave: 4 })).toBe(10);
  });

  it.each(VARIANTS)('%s', (_name, _q, v) => {
    const score = resolveScore(v.score as Score);
    for (const e of NOTES(score)) {
      const clef = score.staves.find((s) => s.staffId === e.staffId)!.clef;
      const { letter, octave } = e.writtenPitch;
      const pos = staffPositionOf(clef, { letter, octave });
      expect(pos, `${e.eventId}의 보표 위치`).toBe(positionOf(clef, letter, octave));
      // 위치에서 다시 계산한 음이름과 옥타브가 데이터와 같다
      expect(pitchLetterAtStaffPosition(clef, pos), `${e.eventId}`).toEqual({ letter, octave });
      // 해석 음은 기보 음의 문자와 옥타브를 바꾸지 않는다(변화만 조표와 임시표로 정해진다)
      expect(e.resolvedPitch!.letter).toBe(letter);
      expect(e.resolvedPitch!.octave).toBe(octave);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 마디 길이의 합이 박자표와 같다

describe('11.2의 4: 마디 길이의 합이 박자표와 같다', () => {
  it.each(VARIANTS)('%s', (_name, _q, v) => {
    // 모든 성부의 모든 마디가 빈틈과 겹침 없이 박자표의 길이를 채운다. 해석 음이 들어 있고 해석기의 결과와 같다
    expect(validateScore(v.score as Score, { requireFullMeasures: true, requireResolved: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5 '한 박'이라고만 쓴 곳이 없다

describe("11.2의 5: '한 박'이라고만 쓴 곳이 없다. 박의 단위가 함께 적혀 있다", () => {
  function files(dir: string, ext: RegExp): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...files(p, ext));
      else if (ext.test(e.name)) out.push(p);
    }
    return out;
  }
  /** '한 박' 바로 뒤에 ' =' 또는 '('가 와야 단위가 함께 적힌 것이다: '한 박 = 4분음표', '한 박(4분음표)' */
  const ALONE = /한\s*박(?!\s*=|\()/;
  const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

  it('화면 글(src)과 콘텐츠(content)에 단위 없는 한 박이 없다', () => {
    const found: string[] = [];
    let scanned = 0;
    const scan = (file: string): void => {
      scanned++;
      fs.readFileSync(file, 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          if (!ALONE.test(line) || isComment(line)) return;
          found.push(`${path.relative(root, file)}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
    };
    for (const f of files(path.join(root, 'src'), /\.(ts|tsx)$/)) scan(f);
    for (const f of files(path.join(root, 'content'), /\.json$/)) scan(f);
    expect(scanned, '훑은 파일 수(아무것도 훑지 않고 통과하지 않는다)').toBeGreaterThan(100);
    expect(found).toEqual([]);
  });

  it('찾는 식이 제대로 일한다: 단위가 붙은 것은 통과, 붙지 않은 것은 걸린다', () => {
    expect(ALONE.test('<span class="chip">한 박 = {beatName(def.score.meter)}</span>')).toBe(false);
    expect(ALONE.test('sub: `한 박(${beatNameOfTicks(spec.beatTicks)})을 셋으로`')).toBe(false);
    expect(ALONE.test("sub: '한 박을 셋으로'")).toBe(true);
    expect(ALONE.test('한 박만큼 쉬어요')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8 출처와 권리가 적혀 있다

describe('11.2의 8: 출처와 권리가 적혀 있다', () => {
  const log: Array<Record<string, any>> = readJson('content', 'sources', 'review-log.json');

  it('교재에서 온 과제는 출처 기록마다 원본 파일 id, 파일 이름, 검수 상태, 권리 상태가 있다', () => {
    for (const q of QUESTS.filter((x) => x.questId !== 'song.short-piece')) {
      const refs = q.sourceRefs as unknown[];
      if (refs.length === 0) {
        // 설계서(5.4, 5.6, 5.7)가 관련 교재를 '확인 필요'로 적은 새 과제: 출처 기록이 아직 없는 대신 검수 대장의 음악 검수가 교재 대조가 남았다고 적는다(없는 출처를 지어내지 않는다)
        expect([...SIXTH, ...SEVENTH], `${q.questId}: 출처 기록이 없는 것은 6단계·7단계에서 더한 새 과제뿐이에요`).toContain(q.questId);
        const note = String(log.find((r) => r.questId === q.questId && r.step === 'music-review')?.note ?? '');
        expect(note, `${q.questId}의 음악 검수 기록`).toMatch(/교재.*대조/);
      }
      for (const r of q.sourceRefs as Array<Record<string, any>>) {
        expect(typeof r.sourceFileId === 'string' && r.sourceFileId.length > 0, `${q.questId} sourceFileId`).toBe(true);
        expect(typeof r.originalFilename === 'string' && r.originalFilename.length > 0, `${q.questId} originalFilename`).toBe(true);
        expect(['unreviewed', 'inReview', 'reviewed', 'needsCorrection']).toContain(r.reviewStatus);
        expect(['unconfirmed', 'confirmed', 'rejected']).toContain(r.rightsStatus);
        expect(Array.isArray(r.issues), `${q.questId} issues`).toBe(true);
      }
    }
  });

  it('교재 밖에서 새로 쓴 과제(Q08)는 출처 기록이 없는 대신 검수 대장의 권리 단계가 그 사정을 적는다', () => {
    const song = QUESTS.find((q) => q.questId === 'song.short-piece')!;
    expect(song.sourceRefs).toEqual([]);
    const rights = log.find((r) => r.questId === 'song.short-piece' && r.step === 'rights-approval')!;
    expect(rights.note).toContain('교재에 없는');
  });

  it('검수 대장에는 모든 과제의 세 단계(음악 검수, 플레이 검수, 권리 확인과 공개 승인)가 한 번씩 있다', () => {
    for (const q of QUESTS) {
      const steps = log.filter((r) => r.questId === q.questId).map((r) => r.step).sort();
      expect(steps, `${q.questId}의 검수 대장`).toEqual(['music-review', 'play-review', 'rights-approval']);
    }
    expect(log).toHaveLength(QUESTS.length * 3);
  });
});

// ---------------------------------------------------------------------------
// 사람이 하는 단계

describe('사람이 하는 단계는 자동으로 완료가 되지 않는다(D-4, D-13)', () => {
  it('검수 대장의 세 단계는 모두 대기이고, 과제는 모두 초안이다. 어떤 출처도 검수나 권리 확인이 끝났다고 적혀 있지 않다', () => {
    const log: Array<Record<string, any>> = readJson('content', 'sources', 'review-log.json');
    expect(log.filter((r) => r.status !== 'pending'), '대기가 아닌 검수 기록').toEqual([]);
    expect(QUESTS.filter((q) => q.availability !== 'draft').map((q) => q.questId), '초안이 아닌 과제').toEqual([]);
    for (const q of QUESTS) {
      for (const r of q.sourceRefs as Array<Record<string, any>>) {
        expect(r.reviewStatus, `${q.questId} ${r.originalFilename}`).toBe('unreviewed');
        expect(r.rightsStatus, `${q.questId} ${r.originalFilename}`).toBe('unconfirmed');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6 도움 경로: 기본 연습으로 나가는 연결

describe('11.2의 6: 기본 연습으로 나가는 연결은 Q08에만 있다', () => {
  it('새 과제에 기본 연습(practice) 연결을 더하면 도움에서 돌아오는 시험(5-5의 session.test.ts)을 그 과제에도 더하라고 이 시험이 알린다', () => {
    for (const q of QUESTS) {
      const practice = (q.assistanceLinks as Array<{ type: string }>).filter((l) => l.type === 'practice');
      if (q.questId === 'song.short-piece') expect(practice.length, 'Q08의 기본 연습 연결').toBeGreaterThan(0);
      else expect(practice, `${q.questId}에 기본 연습 연결이 생겼어요. 돌아오는 시험을 더하세요`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 7 공개 채널: 검수 전 과제는 정식 공개에서 열리지 않는다

describe('G2의 7: 정식 공개(release) 채널은 검수가 끝나지 않은 과제와 판본을 모두 막는다', () => {
  const release = new ContentCatalog(QUESTS as never, 'release');
  const preview = new ContentCatalog(QUESTS as never, 'preview');

  it.each(VARIANTS)('%s', (name, q) => {
    const [, vid] = name.split('/');
    const closed = release.resolve(q.questId, vid!);
    expect(closed.ok, '정식 공개에서 열렸어요').toBe(false);
    if (!closed.ok) expect(closed.reason).toBe('preparing');
    expect(release.get(q.questId)!.variants.find((x) => x.variantId === vid)!.state).toBe('preparing');
    expect(release.get(q.questId)!.state).toBe('preparing');
    // 미리보기에서는 '검수 전' 표지와 함께 열린다
    expect(preview.resolve(q.questId, vid!).ok).toBe(true);
    expect(preview.get(q.questId)!.variants.find((x) => x.variantId === vid)!.state).toBe('unreviewed');
  });
});
