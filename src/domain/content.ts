// 1-6 과제 데이터 형식과 검사. 설계서 부록 A.1의 형식에 placements를 더한 것이다.
// 이 파일은 데이터를 믿지 않는다. 형식 → 참조 → 악보 → 판정 조건 → 문장 순으로 확인하고,
// 하나라도 틀리면 목록을 돌려준다. 빌드 도구(tools/validate-content)와 단위 테스트가 같은 함수를 쓴다.
import { canonicalCode, ISSUE_PARAMS, isKnownCode, placeholdersOf } from './feedback';
import type { FeedbackRule } from './feedback';
import { LETTER_PC, midiOf, pitchAbove, pitchClassOf } from './pitch';
import type { IntervalQuality, Letter } from './pitch';
import { isNote, validateScore } from './score';
import type { Score } from './score';
import { VALUE_TICKS } from './time';
import type { NoteValue } from './time';
import type { EvaluatorSpec } from './evaluators';
import { EVALUATOR_TYPES } from './evaluators';
import type { EvaluatorType } from './evaluators/types';
import { expectedPitchesOf } from './evaluators/orderedScale';

export const PROJECT_ID = 'levelup-music-world';
export const QUEST_SCHEMA_VERSION = 1;

/**
 * 설치물의 '자유로 놀기'(4.2 표지판 맨 위)는 판정하지 않는 초안이다. 같은 초안 저장소(ChallengeSession)에 올리려고
 * 과제 id와 판본 id를 흉내 내어 쓴다. 이 접두사는 이 용도로만 쓰고, 실제 과제의 id가 쓰지 못하게 검사가 막는다.
 */
export const FREE_QUEST_PREFIX = 'free.';
export const FREE_VARIANT_ID = 'play';
export const freeQuestId = (installationId: string): string => `${FREE_QUEST_PREFIX}${installationId}`;
export const isFreeQuestId = (questId: string): boolean => questId.startsWith(FREE_QUEST_PREFIX);
/** 자유로 놀기 초안을 패널로 여는 주소('#/q/free.<설치물 id>/play'). 합주 무대의 자유 가락은 패널에서 편집한다(4.9) */
export const freeHashFor = (installationId: string): string => `#/q/${encodeURIComponent(freeQuestId(installationId))}/${FREE_VARIANT_ID}`;
/** 위 주소에서 설치물 id를 꺼낸다. 자유로 놀기 주소가 아니면 null */
export function freeInstallationOfHash(hash: string): string | null {
  const m = /^#?\/?q\/([^/]+)\/([^/]+)\/?$/.exec(hash.trim());
  if (!m) return null;
  try {
    const questId = decodeURIComponent(m[1]!);
    if (!isFreeQuestId(questId) || decodeURIComponent(m[2]!) !== FREE_VARIANT_ID) return null;
    return questId.slice(FREE_QUEST_PREFIX.length) || null;
  } catch {
    return null;
  }
}
/** 과제를 여는 패널. 새 패널을 만들면 여기에 더한다. */
export const PANEL_IDS = ['panel.clef', 'panel.rhythm', 'panel.chord', 'panel.scale', 'panel.song'] as const;

export type Availability = 'draft' | 'published';
export type ReviewStatus = 'unreviewed' | 'reviewed' | 'needsCorrection';
export type RightsStatus = 'unconfirmed' | 'confirmed' | 'blocked';

export interface SourceRef {
  sourceFileId: string;
  originalFilename: string;
  variantOf: string | null;
  reviewStatus: ReviewStatus;
  rightsStatus: RightsStatus;
  reviewedAt?: string;
  correctedScoreVersion?: string;
  issues: string[];
}

export interface ChallengeDescriptor {
  /** 예: 'C4-C5' */
  range: string;
  voices: number;
  smallestValue: NoteValue;
  accidentals: 'none' | 'keySignature' | 'inBar' | 'mixed';
  input: 'placement' | 'choice' | 'both';
}

export type QuestPlacement =
  | { kind: 'installation'; installationId: string; variantIds: string[] }
  | { kind: 'panel'; panelId: string; variantIds: string[] };

export interface QuestVariant {
  label?: string;
  /** 판본마다 따로 공개 상태를 둘 때. 없으면 과제의 것을 쓴다 */
  availability?: Availability;
  challengeDescriptor: ChallengeDescriptor;
  /** 정답 악보. 듣기와 검사에 쓴다. 마디가 꽉 차 있고 resolvedPitch가 들어 있어야 한다 */
  score: Score;
  evaluatorSpec: EvaluatorSpec;
}

export interface AssistanceLink {
  type: string;
  label: string;
  /** type이 'practice'일 때: 이어진 기본 연습 과제의 id(5-5). 연습은 그 과제를 그대로 연다 */
  questId?: string;
  /** 연습으로 열 판본. 없으면 그 과제의 첫 판본이다 */
  variantId?: string;
}

export const PRACTICE_LINK_TYPE = 'practice';

/** 과제가 이어 둔 기본 연습 과제들(차례대로). 연습이 아닌 도움 연결은 건너뛴다 */
export function practiceLinksOf(def: Pick<QuestDefinition, 'assistanceLinks'>): AssistanceLink[] {
  return def.assistanceLinks.filter((l) => l.type === PRACTICE_LINK_TYPE && typeof l.questId === 'string');
}

export interface QuestDefinition {
  projectId: string;
  questId: string;
  schemaVersion: number;
  contentVersion: string;
  title: string;
  topicTags: string[];
  availability: Availability;
  variantIds: string[];
  placements: QuestPlacement[];
  sourceRefs: SourceRef[];
  variants: Record<string, QuestVariant>;
  assistanceLinks: AssistanceLink[];
  feedbackRules: FeedbackRule[];
}

export interface ContentIssue {
  code: string;
  path: string;
  message: string;
}

export interface ContentContext {
  /** content/installations에 있는 설치물 id. 없으면 설치물을 가리키는 배치는 모두 오류다 */
  installationIds?: ReadonlySet<string>;
  panelIds?: readonly string[];
}

type Json = Record<string, unknown>;

class Collector {
  readonly issues: ContentIssue[] = [];
  add(code: string, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }
}

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const VALUE_NAMES = Object.keys(VALUE_TICKS) as NoteValue[];
const QUALITIES: IntervalQuality[] = ['perfect', 'major', 'minor', 'augmented', 'diminished', 'doublyAugmented', 'doublyDiminished'];
const LETTER_LIST = Object.keys(LETTER_PC);

function reqStr(c: Collector, o: Json, key: string, path: string): string | null {
  const v = o[key];
  if (!isStr(v)) {
    c.add('SHAPE', `${path}.${key}`, `${key}은(는) 비어 있지 않은 글자여야 해요`);
    return null;
  }
  return v;
}

function reqArr(c: Collector, o: Json, key: string, path: string, min = 0): unknown[] | null {
  const v = o[key];
  if (!Array.isArray(v)) {
    c.add('SHAPE', `${path}.${key}`, `${key}은(는) 목록이어야 해요`);
    return null;
  }
  if (v.length < min) c.add('SHAPE', `${path}.${key}`, `${key}에 항목이 ${min}개 이상 있어야 해요`);
  return v;
}

function reqObj(c: Collector, o: Json, key: string, path: string): Json | null {
  const v = o[key];
  if (!isObj(v)) {
    c.add('SHAPE', `${path}.${key}`, `${key}은(는) 객체여야 해요`);
    return null;
  }
  return v;
}

function strList(c: Collector, v: unknown, path: string): string[] {
  if (!Array.isArray(v) || v.some((x) => !isStr(x))) {
    c.add('SHAPE', path, '글자 목록이어야 해요');
    return [];
  }
  return v as string[];
}

// ---------------------------------------------------------------------------
// 형식 검사: 판정 조건(evaluatorSpec)

function pitchShape(c: Collector, v: unknown, path: string): boolean {
  if (!isObj(v) || !LETTER_LIST.includes(String(v.letter)) || !isInt(v.alter) || !isInt(v.octave) || Math.abs(v.alter as number) > 2) {
    c.add('SHAPE', path, '음은 {letter, alter(−2…2), octave} 형식이어야 해요');
    return false;
  }
  return true;
}

function specShape(c: Collector, spec: unknown, path: string): spec is EvaluatorSpec {
  if (!isObj(spec)) {
    c.add('SHAPE', path, 'evaluatorSpec이 객체가 아니에요');
    return false;
  }
  const type = spec.type;
  if (!EVALUATOR_TYPES.includes(type as EvaluatorType)) {
    c.add('SHAPE', `${path}.type`, `알 수 없는 판정기: ${String(type)}`);
    return false;
  }
  const before = c.issues.length;
  switch (type as EvaluatorType) {
    case 'pitchSpelling': {
      const targets = reqArr(c, spec, 'targets', path, 1) ?? [];
      targets.forEach((t, i) => {
        const tp = `${path}.targets[${i}]`;
        if (!isObj(t)) return c.add('SHAPE', tp, '객체여야 해요');
        reqStr(c, t, 'slotId', tp);
        reqStr(c, t, 'label', tp);
        if (t.eventId !== undefined && !isStr(t.eventId)) c.add('SHAPE', `${tp}.eventId`, 'eventId는 글자예요');
        pitchShape(c, t.expected, `${tp}.expected`);
        if (t.clef !== undefined && t.clef !== 'treble' && t.clef !== 'bass') c.add('SHAPE', `${tp}.clef`, "clef는 'treble' 또는 'bass'예요");
      });
      break;
    }
    case 'interval': {
      const qs = reqArr(c, spec, 'questions', path, 1) ?? [];
      qs.forEach((q, i) => {
        const qp = `${path}.questions[${i}]`;
        if (!isObj(q)) return c.add('SHAPE', qp, '객체여야 해요');
        reqStr(c, q, 'qid', qp);
        reqStr(c, q, 'label', qp);
        if (q.kind === 'identify') {
          pitchShape(c, q.from, `${qp}.from`);
          pitchShape(c, q.to, `${qp}.to`);
        } else if (q.kind === 'build') {
          pitchShape(c, q.from, `${qp}.from`);
          if (!isInt(q.diatonicNumber) || (q.diatonicNumber as number) < 1) c.add('SHAPE', `${qp}.diatonicNumber`, '도수는 1 이상의 정수예요');
          if (!QUALITIES.includes(q.quality as IntervalQuality)) c.add('SHAPE', `${qp}.quality`, '알 수 없는 음정 성질이에요');
        } else if (q.kind === 'compare') {
          pitchShape(c, q.a, `${qp}.a`);
          pitchShape(c, q.b, `${qp}.b`);
        } else c.add('SHAPE', `${qp}.kind`, "kind는 'identify', 'build', 'compare' 중 하나예요");
      });
      break;
    }
    case 'rhythmPlacement':
      reqStr(c, spec, 'voiceId', path);
      if (typeof spec.requirePitch !== 'boolean') c.add('SHAPE', `${path}.requirePitch`, 'requirePitch는 true/false예요');
      break;
    case 'triadMembership': {
      const pcs = reqArr(c, spec, 'requiredPitchClasses', path, 3);
      if (pcs && pcs.some((x) => !isInt(x) || (x as number) < 0 || (x as number) > 11)) c.add('SHAPE', `${path}.requiredPitchClasses`, '음급은 0–11의 정수예요');
      if (spec.requiredSpellings !== undefined) {
        const rs = reqArr(c, spec, 'requiredSpellings', path, 3) ?? [];
        rs.forEach((s, i) => {
          if (!isObj(s) || !LETTER_LIST.includes(String(s.letter)) || !isInt(s.alter)) c.add('SHAPE', `${path}.requiredSpellings[${i}]`, '{letter, alter} 형식이어야 해요');
        });
      }
      if (spec.noteCount !== undefined && !isInt(spec.noteCount)) c.add('SHAPE', `${path}.noteCount`, 'noteCount는 정수예요');
      break;
    }
    case 'chordSequence': {
      if (!isInt(spec.trees) || (spec.trees as number) < 1) c.add('SHAPE', `${path}.trees`, 'trees는 1 이상의 정수예요');
      const events = reqArr(c, spec, 'events', path, 2) ?? [];
      events.forEach((e, i) => {
        const ep = `${path}.events[${i}]`;
        if (!isObj(e)) return c.add('SHAPE', ep, '객체여야 해요');
        reqStr(c, e, 'label', ep);
        if (!isInt(e.tree) || (e.tree as number) < 0) c.add('SHAPE', `${ep}.tree`, 'tree는 0 이상의 정수예요');
        const pcs = reqArr(c, e, 'requiredPitchClasses', ep, 3);
        if (pcs && pcs.some((x) => !isInt(x) || (x as number) < 0 || (x as number) > 11)) c.add('SHAPE', `${ep}.requiredPitchClasses`, '음급은 0–11의 정수예요');
        if (e.requiredSpellings !== undefined) {
          const rs = reqArr(c, e, 'requiredSpellings', ep, 3) ?? [];
          rs.forEach((s, j) => {
            if (!isObj(s) || !LETTER_LIST.includes(String(s.letter)) || !isInt(s.alter)) c.add('SHAPE', `${ep}.requiredSpellings[${j}]`, '{letter, alter} 형식이어야 해요');
          });
        }
        if (e.noteCount !== undefined && !isInt(e.noteCount)) c.add('SHAPE', `${ep}.noteCount`, 'noteCount는 정수예요');
        if (e.reportTones !== undefined) {
          const rt = reqArr(c, e, 'reportTones', ep, 3) ?? [];
          if (rt.length !== 3) c.add('SHAPE', `${ep}.reportTones`, '근음, 3음, 5음 세 개여야 해요');
          rt.forEach((s, j) => {
            if (!isObj(s) || !LETTER_LIST.includes(String(s.letter)) || !isInt(s.alter)) c.add('SHAPE', `${ep}.reportTones[${j}]`, '{letter, alter} 형식이어야 해요');
          });
        }
      });
      break;
    }
    case 'inversion': {
      const tones = reqArr(c, spec, 'tones', path, 3) ?? [];
      if (tones.length !== 3) c.add('SHAPE', `${path}.tones`, '근음, 3음, 5음 세 개여야 해요');
      tones.forEach((s, i) => {
        if (!isObj(s) || !LETTER_LIST.includes(String(s.letter)) || !isInt(s.alter)) c.add('SHAPE', `${path}.tones[${i}]`, '{letter, alter} 형식이어야 해요');
      });
      if (!['root', 'first', 'second'].includes(String(spec.targetInversion))) c.add('SHAPE', `${path}.targetInversion`, "'root', 'first', 'second' 중 하나예요");
      break;
    }
    case 'orderedScale':
      reqStr(c, spec, 'voiceId', path);
      if (!isInt(spec.count)) c.add('SHAPE', `${path}.count`, 'count는 정수예요');
      if (spec.direction !== 'ascending' && spec.direction !== 'descending' && spec.direction !== 'sequence') c.add('SHAPE', `${path}.direction`, "'ascending', 'descending', 'sequence' 중 하나예요");
      if (typeof spec.requireSpelling !== 'boolean') c.add('SHAPE', `${path}.requireSpelling`, 'true/false예요');
      if (typeof spec.requireOctave !== 'boolean') c.add('SHAPE', `${path}.requireOctave`, 'true/false예요');
      if (spec.midiSteps !== undefined && (!Array.isArray(spec.midiSteps) || spec.midiSteps.some((x) => !isInt(x)))) c.add('SHAPE', `${path}.midiSteps`, '정수 목록이어야 해요');
      break;
    case 'scoreArrangement': {
      const vs = reqArr(c, spec, 'voices', path, 1) ?? [];
      vs.forEach((v, i) => {
        if (!isObj(v) || !isStr(v.voiceId) || !isStr(v.label)) c.add('SHAPE', `${path}.voices[${i}]`, '{voiceId, label} 형식이어야 해요');
      });
      break;
    }
  }
  return c.issues.length === before;
}

function descriptorShape(c: Collector, d: unknown, path: string): void {
  if (!isObj(d)) return c.add('SHAPE', path, 'challengeDescriptor가 객체가 아니에요');
  reqStr(c, d, 'range', path);
  if (!isInt(d.voices) || (d.voices as number) < 1) c.add('SHAPE', `${path}.voices`, 'voices는 1 이상의 정수예요');
  if (!VALUE_NAMES.includes(d.smallestValue as NoteValue)) c.add('SHAPE', `${path}.smallestValue`, `smallestValue는 ${VALUE_NAMES.join(', ')} 중 하나예요`);
  if (!['none', 'keySignature', 'inBar', 'mixed'].includes(String(d.accidentals))) c.add('SHAPE', `${path}.accidentals`, "'none', 'keySignature', 'inBar', 'mixed' 중 하나예요");
  if (!['placement', 'choice', 'both'].includes(String(d.input))) c.add('SHAPE', `${path}.input`, "'placement', 'choice', 'both' 중 하나예요");
}

// ---------------------------------------------------------------------------
// 판정 조건과 정답 악보가 서로 맞는지

function pcOfSpelling(s: { letter: Letter; alter: number }): number {
  return (((midiOf({ letter: s.letter, alter: s.alter, octave: 4 }) % 12) + 12) % 12);
}

function specConsistency(c: Collector, spec: EvaluatorSpec, score: Score, path: string): void {
  const voiceIds = new Set(score.voices.map((v) => v.voiceId));
  const sp = `${path}.evaluatorSpec`;
  switch (spec.type) {
    case 'pitchSpelling': {
      const seen = new Set<string>();
      spec.targets.forEach((t, i) => {
        if (seen.has(t.slotId)) c.add('SPEC_DUP', `${sp}.targets[${i}]`, `slotId가 겹쳐요: ${t.slotId}`);
        seen.add(t.slotId);
        if (t.eventId) {
          const ev = score.events.find((e) => e.eventId === t.eventId);
          if (!ev || !isNote(ev) || !ev.resolvedPitch) return c.add('SPEC_REF', `${sp}.targets[${i}]`, `정답 악보에 음 ${t.eventId}가 없어요`);
          const r = ev.resolvedPitch;
          if (r.letter !== t.expected.letter || r.alter !== t.expected.alter || r.octave !== t.expected.octave) {
            c.add('SPEC_SCORE_MISMATCH', `${sp}.targets[${i}]`, `목표 음(${t.expected.letter}${t.expected.alter}/${t.expected.octave})이 정답 악보의 음(${r.letter}${r.alter}/${r.octave})과 달라요`);
          }
          const staff = score.staves.find((s) => s.staffId === ev.staffId);
          if (t.clef && staff && staff.clef !== t.clef) c.add('SPEC_SCORE_MISMATCH', `${sp}.targets[${i}].clef`, `음자리표가 정답 악보(${staff.clef})와 달라요`);
        }
      });
      break;
    }
    case 'interval': {
      const seen = new Set<string>();
      spec.questions.forEach((q, i) => {
        if (seen.has(q.qid)) c.add('SPEC_DUP', `${sp}.questions[${i}]`, `qid가 겹쳐요: ${q.qid}`);
        seen.add(q.qid);
        if (q.kind === 'build') {
          try {
            pitchAbove(q.from, q.diatonicNumber, q.quality);
          } catch (err) {
            c.add('SPEC_RANGE', `${sp}.questions[${i}]`, (err as Error).message);
          }
        }
      });
      break;
    }
    case 'rhythmPlacement':
      if (!voiceIds.has(spec.voiceId)) c.add('SPEC_REF', `${sp}.voiceId`, `정답 악보에 성부 ${spec.voiceId}가 없어요`);
      else if (score.events.every((e) => e.voiceId !== spec.voiceId)) c.add('SPEC_REF', `${sp}.voiceId`, `성부 ${spec.voiceId}에 사건이 없어요`);
      break;
    case 'scoreArrangement':
      for (const v of spec.voices) if (!voiceIds.has(v.voiceId)) c.add('SPEC_REF', `${sp}.voices`, `정답 악보에 성부 ${v.voiceId}가 없어요`);
      break;
    case 'triadMembership': {
      const set = new Set(spec.requiredPitchClasses);
      if (set.size !== spec.requiredPitchClasses.length) c.add('SPEC_DUP', `${sp}.requiredPitchClasses`, '음급이 겹쳐요');
      if (spec.requiredSpellings) {
        const spellPcs = new Set(spec.requiredSpellings.map(pcOfSpelling));
        const same = spellPcs.size === set.size && [...spellPcs].every((x) => set.has(x));
        if (!same) c.add('SPEC_SCORE_MISMATCH', `${sp}.requiredSpellings`, '표기의 음급이 requiredPitchClasses와 달라요');
      }
      const notes = score.events.filter(isNote);
      if (notes.length > 0) {
        const have = new Set(notes.map((n) => pitchClassOf(n.resolvedPitch!)));
        const same = have.size === set.size && [...have].every((x) => set.has(x));
        if (!same) c.add('SPEC_SCORE_MISMATCH', sp, '정답 악보의 음급이 requiredPitchClasses와 달라요');
      }
      if (spec.requiredMidi) {
        const have = score.events.filter(isNote).map((n) => n.resolvedPitch!.midi).sort((a, b) => a - b);
        const want = [...spec.requiredMidi].sort((a, b) => a - b);
        if (have.length > 0 && (have.length !== want.length || have.some((m, i) => m !== want[i]))) c.add('SPEC_SCORE_MISMATCH', `${sp}.requiredMidi`, '정답 악보의 MIDI와 달라요');
      }
      break;
    }
    case 'chordSequence': {
      const used = new Set<number>();
      spec.events.forEach((e, i) => {
        const ep = `${sp}.events[${i}]`;
        if (e.tree >= spec.trees) c.add('SPEC_RANGE', `${ep}.tree`, `나무 ${e.tree}는 없어요(나무는 ${spec.trees}그루예요)`);
        used.add(e.tree);
        const set = new Set(e.requiredPitchClasses);
        if (set.size !== e.requiredPitchClasses.length) c.add('SPEC_DUP', `${ep}.requiredPitchClasses`, '음급이 겹쳐요');
        if (e.requiredSpellings) {
          const spellPcs = new Set(e.requiredSpellings.map(pcOfSpelling));
          if (spellPcs.size !== set.size || ![...spellPcs].every((x) => set.has(x))) c.add('SPEC_SCORE_MISMATCH', `${ep}.requiredSpellings`, '표기의 음급이 requiredPitchClasses와 달라요');
        }
        if (e.reportTones) {
          const rp = e.reportTones.map(pcOfSpelling);
          if (rp.length !== set.size || !rp.every((x) => set.has(x))) c.add('SPEC_SCORE_MISMATCH', `${ep}.reportTones`, '전위를 알려 줄 근음·3음·5음의 음급이 requiredPitchClasses와 달라요');
        }
        // 정답 악보는 사건의 차례대로 한 마디에 화음 하나다(목표 듣기가 차례로 울린다)
        const measure = score.events.filter(isNote).filter((n) => n.measureIndex === i);
        if (measure.length > 0) {
          const have = new Set(measure.map((n) => pitchClassOf(n.resolvedPitch!)));
          if (have.size !== set.size || ![...have].every((x) => set.has(x))) c.add('SPEC_SCORE_MISMATCH', ep, `정답 악보의 ${i + 1}번째 마디의 음급이 이 화음의 requiredPitchClasses와 달라요`);
        } else c.add('SPEC_SCORE_MISMATCH', ep, `정답 악보의 ${i + 1}번째 마디에 화음이 없어요(사건 하나가 한 마디예요)`);
      });
      for (let t = 0; t < spec.trees; t++) if (!used.has(t)) c.add('SPEC_REF', `${sp}.events`, `나무 ${t}에 걸 화음이 사건에 없어요`);
      const measures = new Set(score.events.map((n) => n.measureIndex));
      if (measures.size !== spec.events.length) c.add('SPEC_SCORE_MISMATCH', `${sp}.events`, `정답 악보는 ${measures.size}마디인데 화음 사건은 ${spec.events.length}개예요`);
      break;
    }
    case 'inversion': {
      const pcs = spec.tones.map(pcOfSpelling);
      if (new Set(pcs).size !== 3) c.add('SPEC_DUP', `${sp}.tones`, '근음, 3음, 5음의 음급이 서로 달라야 해요');
      const notes = score.events.filter(isNote);
      if (notes.length > 0) {
        const lowest = notes.reduce((lo, n) => (n.resolvedPitch!.midi < lo.resolvedPitch!.midi ? n : lo));
        const idx = (['root', 'first', 'second'] as const).indexOf(spec.targetInversion);
        if (pitchClassOf(lowest.resolvedPitch!) !== pcs[idx]) c.add('SPEC_SCORE_MISMATCH', sp, `정답 악보의 가장 낮은 음이 목표 전위(${spec.targetInversion})의 베이스와 달라요`);
        if (!notes.every((n) => pcs.includes(pitchClassOf(n.resolvedPitch!)))) c.add('SPEC_SCORE_MISMATCH', sp, '정답 악보에 화음 밖의 음이 있어요');
      }
      break;
    }
    case 'orderedScale': {
      if (!voiceIds.has(spec.voiceId)) return c.add('SPEC_REF', `${sp}.voiceId`, `정답 악보에 성부 ${spec.voiceId}가 없어요`);
      if (spec.count < 2 || spec.count > 13) c.add('SPEC_RANGE', `${sp}.count`, `음의 개수는 2–13이어야 해요: ${spec.count}`);
      let pitches;
      try {
        pitches = expectedPitchesOf(score, spec.voiceId);
      } catch (err) {
        return c.add('SPEC_REF', sp, (err as Error).message);
      }
      if (pitches.length !== spec.count) c.add('SPEC_SCORE_MISMATCH', `${sp}.count`, `정답 악보의 음이 ${pitches.length}개인데 count는 ${spec.count}예요`);
      const diffs = pitches.slice(1).map((p, i) => p.midi - pitches[i]!.midi);
      if (spec.direction === 'sequence') {
        // 오르내림이 섞인 열(X-4): 방향과 간격 목록은 쓰지 않는다. 같은 소리가 이어지는 것도 열의 일부다
        if (spec.midiSteps) c.add('SPEC_SCORE_MISMATCH', `${sp}.midiSteps`, "방향이 'sequence'인 판정기는 간격 목록(midiSteps)을 쓰지 않아요");
      } else {
        const sign = spec.direction === 'ascending' ? 1 : -1;
        if (diffs.some((d) => d * sign <= 0)) c.add('SPEC_SCORE_MISMATCH', `${sp}.direction`, `정답 악보의 음이 ${spec.direction === 'ascending' ? '오르는' : '내리는'} 순서가 아니에요`);
      }
      if (spec.midiSteps) {
        const steps = diffs.map((d) => Math.abs(d));
        if (steps.length !== spec.midiSteps.length || steps.some((d, i) => d !== spec.midiSteps![i])) {
          c.add('SPEC_SCORE_MISMATCH', `${sp}.midiSteps`, `간격이 정답 악보와 달라요(악보 ${steps.join(' ')}, 적힌 값 ${spec.midiSteps.join(' ')})`);
        }
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 과제 정의 전체

export function validateQuestDefinition(def: unknown, ctx: ContentContext = {}): ContentIssue[] {
  const c = new Collector();
  if (!isObj(def)) {
    c.add('SHAPE', '', '과제 정의가 객체가 아니에요');
    return c.issues;
  }
  const questId = reqStr(c, def, 'questId', '');
  const root = questId ? questId : '(questId 없음)';
  const projectId = reqStr(c, def, 'projectId', '');
  if (projectId && projectId !== PROJECT_ID) c.add('PROJECT_ID', 'projectId', `projectId는 '${PROJECT_ID}'이어야 해요(임시 값 '${projectId}'을 쓰지 않아요)`);
  if (questId && !/^[a-z0-9]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/.test(questId)) c.add('SHAPE', 'questId', `questId 형식이 올바르지 않아요: ${questId}`);
  if (questId && isFreeQuestId(questId)) c.add('RESERVED_ID', 'questId', `'${FREE_QUEST_PREFIX}'로 시작하는 id는 자유로 놀기 초안에 예약돼 있어요: ${questId}`);
  if (def.schemaVersion !== QUEST_SCHEMA_VERSION) c.add('SCHEMA', 'schemaVersion', `schemaVersion은 ${QUEST_SCHEMA_VERSION}이어야 해요`);
  const cv = reqStr(c, def, 'contentVersion', '');
  if (cv && !/^\d+\.\d+\.\d+$/.test(cv)) c.add('SHAPE', 'contentVersion', `contentVersion은 0.1.0 같은 형식이어야 해요: ${cv}`);
  reqStr(c, def, 'title', '');
  const tags = reqArr(c, def, 'topicTags', '', 1);
  if (tags) strList(c, tags, 'topicTags');
  if (def.availability !== 'draft' && def.availability !== 'published') c.add('SHAPE', 'availability', "availability는 'draft' 또는 'published'예요");

  const variantIds = reqArr(c, def, 'variantIds', '', 1);
  const variantIdList = variantIds ? strList(c, variantIds, 'variantIds') : [];
  if (new Set(variantIdList).size !== variantIdList.length) c.add('DUP_ID', 'variantIds', 'variantIds에 같은 id가 있어요');
  const variants = reqObj(c, def, 'variants', '');

  const placements = reqArr(c, def, 'placements', '', 1);
  const placementList: QuestPlacement[] = [];
  placements?.forEach((p, i) => {
    const pp = `placements[${i}]`;
    if (!isObj(p)) return c.add('SHAPE', pp, '객체여야 해요');
    const ids = Array.isArray(p.variantIds) ? strList(c, p.variantIds, `${pp}.variantIds`) : (c.add('SHAPE', `${pp}.variantIds`, '목록이어야 해요'), []);
    if (p.kind === 'installation' && isStr(p.installationId)) placementList.push({ kind: 'installation', installationId: p.installationId, variantIds: ids });
    else if (p.kind === 'panel' && isStr(p.panelId)) placementList.push({ kind: 'panel', panelId: p.panelId, variantIds: ids });
    else c.add('SHAPE', pp, "kind는 'installation'(installationId 필요) 또는 'panel'(panelId 필요)이에요");
  });

  const refs = reqArr(c, def, 'sourceRefs', '') ?? [];
  const refList: SourceRef[] = [];
  refs.forEach((r, i) => {
    const rp = `sourceRefs[${i}]`;
    if (!isObj(r)) return c.add('SHAPE', rp, '객체여야 해요');
    reqStr(c, r, 'sourceFileId', rp);
    reqStr(c, r, 'originalFilename', rp);
    if (!(r.variantOf === null || isStr(r.variantOf))) c.add('SHAPE', `${rp}.variantOf`, 'null 또는 글자예요');
    if (!['unreviewed', 'reviewed', 'needsCorrection'].includes(String(r.reviewStatus))) c.add('SHAPE', `${rp}.reviewStatus`, "'unreviewed', 'reviewed', 'needsCorrection' 중 하나예요");
    if (!['unconfirmed', 'confirmed', 'blocked'].includes(String(r.rightsStatus))) c.add('SHAPE', `${rp}.rightsStatus`, "'unconfirmed', 'confirmed', 'blocked' 중 하나예요");
    if (!Array.isArray(r.issues)) c.add('SHAPE', `${rp}.issues`, '목록이어야 해요');
    refList.push(r as unknown as SourceRef);
  });

  const links = reqArr(c, def, 'assistanceLinks', '') ?? [];
  links.forEach((l, i) => {
    const lp = `assistanceLinks[${i}]`;
    if (!isObj(l) || !isStr(l.type) || !isStr(l.label)) return c.add('SHAPE', lp, '{type, label} 형식이어야 해요');
    if (l.type === PRACTICE_LINK_TYPE) {
      if (!isStr(l.questId)) c.add('SHAPE', `${lp}.questId`, "연습 연결(type 'practice')은 이어진 과제의 questId가 있어야 해요");
      else if (l.questId === questId) c.add('SHAPE', `${lp}.questId`, '자기 자신을 연습으로 이을 수 없어요');
      if (l.variantId !== undefined && !isStr(l.variantId)) c.add('SHAPE', `${lp}.variantId`, '글자여야 해요');
    } else if (l.questId !== undefined || l.variantId !== undefined) c.add('SHAPE', lp, `questId와 variantId는 연습 연결(type 'practice')에만 써요`);
  });
  const rules = reqArr(c, def, 'feedbackRules', '') ?? [];
  const ruleList: FeedbackRule[] = [];
  rules.forEach((r, i) => {
    if (!isObj(r) || !isStr(r.code) || !isStr(r.template)) c.add('SHAPE', `feedbackRules[${i}]`, '{code, template} 형식이어야 해요');
    else ruleList.push({ code: r.code, template: r.template });
  });

  // 판본마다 형식 검사
  const shapeOk = new Set<string>();
  if (variants) {
    for (const [vid, v] of Object.entries(variants)) {
      const vp = `variants.${vid}`;
      if (!isObj(v)) {
        c.add('SHAPE', vp, '객체여야 해요');
        continue;
      }
      const before = c.issues.length;
      descriptorShape(c, v.challengeDescriptor, `${vp}.challengeDescriptor`);
      if (!isObj(v.score)) c.add('SHAPE', `${vp}.score`, 'score가 객체가 아니에요');
      specShape(c, v.evaluatorSpec, `${vp}.evaluatorSpec`);
      if (v.availability !== undefined && v.availability !== 'draft' && v.availability !== 'published') c.add('SHAPE', `${vp}.availability`, "'draft' 또는 'published'예요");
      if (c.issues.length === before) shapeOk.add(vid);
    }
  }
  // 형식이 틀리면 의미 검사로 넘어가지 않는다(오류가 오류를 부르지 않게)
  if (c.issues.length > 0) return prefix(c.issues, root);

  // 판본 목록과 variants 일치
  const keys = Object.keys(variants!);
  for (const id of variantIdList) if (!keys.includes(id)) c.add('REF_VARIANT', 'variantIds', `variantIds에 있는 '${id}'의 정의가 variants에 없어요`);
  for (const id of keys) if (!variantIdList.includes(id)) c.add('REF_VARIANT', `variants.${id}`, `variants에 있는 '${id}'가 variantIds에 없어요`);

  // 배치 참조
  const panelIds = ctx.panelIds ?? PANEL_IDS;
  const covered = new Set<string>();
  placementList.forEach((p, i) => {
    const pp = `placements[${i}]`;
    for (const id of p.variantIds) if (!variantIdList.includes(id)) c.add('REF_VARIANT', `${pp}.variantIds`, `없는 판본 '${id}'를 배치했어요`);
    if (p.kind === 'panel') {
      if (!panelIds.includes(p.panelId)) c.add('REF_PANEL', `${pp}.panelId`, `알 수 없는 패널 '${p.panelId}'`);
      p.variantIds.forEach((id) => covered.add(id));
    } else if (!ctx.installationIds?.has(p.installationId)) {
      c.add('REF_INSTALLATION', `${pp}.installationId`, `content/installations에 없는 설치물 '${p.installationId}'`);
    }
  });
  for (const id of variantIdList) if (!covered.has(id)) c.add('NO_PANEL_PLACEMENT', 'placements', `판본 '${id}'를 여는 패널 배치가 없어요(모든 과제는 패널로도 풀 수 있어야 해요, W-2)`);

  // 악보와 판정 조건
  for (const id of keys) {
    const v = variants![id] as unknown as QuestVariant;
    const vp = `variants.${id}`;
    for (const si of validateScore(v.score, { requireFullMeasures: true, requireResolved: true })) {
      c.add(`SCORE_${si.code}`, `${vp}.score`, si.message);
    }
    if (!c.issues.some((x) => x.path.startsWith(`${vp}.score`))) specConsistency(c, v.evaluatorSpec, v.score, vp);
  }

  // 공개 상태에는 검수와 권리 확인이 따라야 한다(W-10)
  const published = def.availability === 'published' || keys.some((id) => (variants![id] as QuestVariant).availability === 'published');
  if (published) {
    if (refList.length === 0) c.add('PUBLISHED_NO_SOURCE', 'sourceRefs', '공개 상태인데 출처 기록이 없어요');
    refList.forEach((r, i) => {
      if (r.reviewStatus !== 'reviewed') c.add('PUBLISHED_UNREVIEWED', `sourceRefs[${i}].reviewStatus`, `공개 상태인데 검수가 끝나지 않았어요(${r.reviewStatus})`);
      if (r.rightsStatus !== 'confirmed') c.add('PUBLISHED_RIGHTS', `sourceRefs[${i}].rightsStatus`, `공개 상태인데 권리가 확인되지 않았어요(${r.rightsStatus})`);
    });
  }

  // 문장 규칙: 아는 코드, 쓸 수 있는 값 이름만
  const seenCodes = new Set<string>();
  ruleList.forEach((r, i) => {
    const rp = `feedbackRules[${i}]`;
    if (!isKnownCode(r.code)) return c.add('RULE_CODE', `${rp}.code`, `알 수 없는 설명 코드 '${r.code}'`);
    const canon = canonicalCode(r.code)!;
    if (seenCodes.has(canon)) c.add('RULE_DUP', `${rp}.code`, `같은 코드(${canon})의 규칙이 둘이에요`);
    seenCodes.add(canon);
    const allowed = new Set(ISSUE_PARAMS[canon]);
    for (const name of placeholdersOf(r.template)) {
      if (!allowed.has(name)) c.add('RULE_PARAM', `${rp}.template`, `'${r.code}' 설명에서 쓸 수 없는 값 '{${name}}' (쓸 수 있는 값: ${ISSUE_PARAMS[canon].join(', ')})`);
    }
    if (/\{[^}]*$/.test(r.template) || /^[^{]*\}/.test(r.template)) c.add('RULE_TEMPLATE', `${rp}.template`, '중괄호가 짝이 맞지 않아요');
  });

  return prefix(c.issues, root);
}

function prefix(issues: ContentIssue[], root: string): ContentIssue[] {
  return issues.map((i) => ({ ...i, path: i.path ? `${root}: ${i.path}` : root }));
}

/** 여러 과제 파일을 함께 검사한다. id 중복과 교차 참조까지 본다. */
export function validateQuestSet(defs: unknown[], ctx: ContentContext = {}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const ids = new Map<string, number>();
  defs.forEach((d, i) => {
    issues.push(...validateQuestDefinition(d, ctx));
    if (isObj(d) && isStr(d.questId)) ids.set(d.questId, (ids.get(d.questId) ?? 0) + 1);
    else issues.push({ code: 'SHAPE', path: `quests[${i}]`, message: 'questId가 없어요' });
  });
  for (const [id, n] of ids) if (n > 1) issues.push({ code: 'DUP_ID', path: id, message: `questId '${id}'가 ${n}개 파일에 있어요` });
  // 기본 연습 연결은 있는 과제와 판본을 가리켜야 한다(5-5)
  const byId = new Map<string, QuestDefinition>();
  for (const d of defs) if (isObj(d) && isStr(d.questId)) byId.set(d.questId, d as unknown as QuestDefinition);
  for (const d of byId.values()) {
    const links = Array.isArray(d.assistanceLinks) ? d.assistanceLinks : [];
    links.forEach((l, i) => {
      if (!isObj(l) || l.type !== PRACTICE_LINK_TYPE || !isStr(l.questId)) return;
      const target = byId.get(l.questId);
      const at = `${d.questId}.assistanceLinks[${i}]`;
      if (!target) issues.push({ code: 'REF_QUEST', path: at, message: `연습으로 이은 과제 '${l.questId}'가 없어요` });
      else if (isStr(l.variantId) && !(Array.isArray(target.variantIds) && target.variantIds.includes(l.variantId))) issues.push({ code: 'REF_VARIANT', path: at, message: `'${l.questId}'에 '${l.variantId}' 판본이 없어요` });
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// 검수 대장(content/sources/review-log.json): 사람이 하는 확인의 기록. 도구가 대신 '완료'로 바꾸지 않는다.

export type ReviewStep = 'music-review' | 'play-review' | 'rights-approval';
export const REVIEW_STEPS: readonly ReviewStep[] = ['music-review', 'play-review', 'rights-approval'];

export interface ReviewLogEntry {
  questId: string;
  step: ReviewStep;
  status: 'pending' | 'done';
  /** 확인한 사람. 완료일 때 필요 */
  by?: string;
  /** 확인한 날(YYYY-MM-DD). 완료일 때 필요 */
  at?: string;
  note?: string;
}

export function validateReviewLog(log: unknown, quests: readonly QuestDefinition[]): ContentIssue[] {
  const c = new Collector();
  if (!Array.isArray(log)) {
    c.add('SHAPE', 'review-log', '검수 대장은 목록이어야 해요');
    return c.issues;
  }
  const byKey = new Map<string, ReviewLogEntry>();
  log.forEach((e, i) => {
    const ep = `review-log[${i}]`;
    if (!isObj(e) || !isStr(e.questId)) return c.add('SHAPE', ep, '{questId, step, status} 형식이어야 해요');
    if (!REVIEW_STEPS.includes(e.step as ReviewStep)) return c.add('SHAPE', `${ep}.step`, `step은 ${REVIEW_STEPS.join(', ')} 중 하나예요`);
    if (e.status !== 'pending' && e.status !== 'done') return c.add('SHAPE', `${ep}.status`, "status는 'pending' 또는 'done'이에요");
    if (e.status === 'done') {
      if (!isStr(e.by)) c.add('LOG_DONE', `${ep}.by`, '완료로 적으려면 확인한 사람(by)이 있어야 해요');
      if (!isStr(e.at) || !/^\d{4}-\d{2}-\d{2}$/.test(e.at as string)) c.add('LOG_DONE', `${ep}.at`, '완료로 적으려면 확인한 날(at, YYYY-MM-DD)이 있어야 해요');
    }
    const key = `${e.questId}/${e.step}`;
    if (byKey.has(key)) c.add('DUP_ID', ep, `같은 기록이 둘이에요: ${key}`);
    byKey.set(key, e as unknown as ReviewLogEntry);
  });
  const known = new Set(quests.map((q) => q.questId));
  for (const e of byKey.values()) if (!known.has(e.questId)) c.add('REF_QUEST', 'review-log', `없는 과제 '${e.questId}'의 기록이에요`);
  for (const q of quests) {
    const published = q.availability === 'published' || Object.values(q.variants).some((v) => v.availability === 'published');
    for (const step of REVIEW_STEPS) {
      const e = byKey.get(`${q.questId}/${step}`);
      if (!e) c.add('LOG_MISSING', q.questId, `검수 대장에 '${step}' 기록이 없어요(아직이면 pending으로 적어요)`);
      else if (published && e.status !== 'done') c.add('PUBLISHED_UNREVIEWED', q.questId, `공개 상태인데 '${step}'이 끝나지 않았어요`);
    }
  }
  return c.issues;
}
