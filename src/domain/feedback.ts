// 판정 결과의 설명 코드(IssueCode)와 문장. 관찰된 사실만 말한다(W-9). 막연히 '불협화음'이라고 하지 않는다.

export type IssueCode =
  // 음 놓기·음이름
  | 'MISSING_PLACEMENT'
  | 'EXTRA_PLACEMENT'
  | 'WRONG_STAFF_PITCH'
  | 'WRONG_SPELLING_SAME_PITCH'
  | 'OCTAVE_MISMATCH'
  | 'WRONG_PITCH'
  | 'WRONG_ORDER'
  // 음계 순서
  | 'SCALE_LENGTH'
  // 리듬·악보 배치
  | 'MISSING_EVENT'
  | 'EXTRA_EVENT'
  | 'REST_EXPECTED_NOTE_FOUND'
  | 'NOTE_EXPECTED_REST_FOUND'
  | 'DURATION_MISMATCH'
  | 'TUPLET_DURATION'
  | 'TUPLET_MISMATCH'
  | 'PITCH_MISMATCH'
  | 'MEASURE_TICKS_REMAIN'
  | 'MEASURE_TICKS_OVER'
  | 'OVERLAP'
  | 'MISSING_VOICE'
  // 화음·전위
  | 'MISSING_TONE'
  | 'EXTRA_NOTE'
  | 'DUPLICATE_TONE'
  | 'NOTE_COUNT'
  | 'WRONG_OCTAVE_SET'
  | 'INCOMPLETE_TRIAD'
  | 'WRONG_INVERSION'
  // 음정
  | 'WRONG_INTERVAL'
  | 'WRONG_SOUND_EQUIV'
  | 'WRONG_NOTATION_EQUIV';

export type ParamValue = string | number | boolean;

export interface IssueTarget {
  /** 설치물이나 패널의 자리 id */
  slotId?: string;
  /** 1부터 세는 자리 번호(화면에 보이는 순서) */
  position?: number;
  eventId?: string;
  measureIndex?: number;
  voiceId?: string;
  onsetTicks?: number;
}

export interface Issue {
  code: IssueCode;
  params: Record<string, ParamValue>;
  target?: IssueTarget;
}

export interface FeedbackRule {
  code: string;
  template: string;
}

// ---------------------------------------------------------------------------
// 조사 처리: 받침이 있는가를 보고 은/는, 이/가, 을/를, 이에요/예요를 고른다.
// 음이름은 '읽는 소리'의 끝을 본다. 숫자(옥타브)는 일·이·삼·사·오·육·칠·팔·구, ♯은 '샵', ♭은 '플랫'.

const DIGIT_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };

export function hasBatchim(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  const ch = s[s.length - 1]!;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (ch in DIGIT_BATCHIM) return DIGIT_BATCHIM[ch]!;
  if (ch === '♯' || ch === '♭') return true;
  if (/[A-Za-z]/.test(ch)) return /[LMNRlmnr]/.test(ch); // 알파벳: 에이·비·씨·디·이·에프·지는 받침 없음, L·M·N·R은 있음
  return false;
}

/** 읽는 소리의 끝이 ㄹ 받침인가. '으로/로'는 ㄹ 받침 뒤에서 '로'를 쓴다(예: 일·칠·팔, 엘·알, '서울로') */
export function endsWithRieul(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  const ch = s[s.length - 1]!;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 8;
  if (ch === '1' || ch === '7' || ch === '8') return true;
  return /[LRlr]/.test(ch);
}

// [받침 있을 때, 받침 없을 때]. 앞 글자만 쓴 줄임 표기('이에요', '이고', '으로')도 받는다.
const PARTICLES: Record<string, [string, string]> = {
  은는: ['은', '는'],
  이가: ['이', '가'],
  을를: ['을', '를'],
  와과: ['과', '와'],
  이에요예요: ['이에요', '예요'],
  이에요: ['이에요', '예요'],
  이고고: ['이고', '고'],
  이고: ['이고', '고'],
  으로로: ['으로', '로'],
  으로: ['으로', '로'],
};

/** '{name}' 또는 '{name:은는}' 자리를 params로 채운다. 값이 없으면 자리 표시를 그대로 둔다. */
export function fillTemplate(template: string, params: Record<string, ParamValue>): string {
  return template.replace(/\{([A-Za-z0-9_]+)(?::([^}]+))?\}/g, (whole, key: string, particle?: string) => {
    if (!(key in params)) return whole;
    const value = String(params[key]);
    if (!particle) return value;
    const pair = PARTICLES[particle];
    if (!pair) return value + particle;
    const withBatchim = hasBatchim(value) && !((particle === '으로로' || particle === '으로') && endsWithRieul(value));
    return value + (withBatchim ? pair[0] : pair[1]);
  });
}

// ---------------------------------------------------------------------------
// 기본 문장. 콘텐츠의 feedbackRules가 같은 코드를 정의하면 그것이 우선한다.

export const DEFAULT_TEMPLATES: Record<IssueCode, string> = {
  MISSING_PLACEMENT: '{where}에 음이 아직 없어요.',
  EXTRA_PLACEMENT: '{where}에 목표에 없는 음이 놓여 있어요.',
  WRONG_STAFF_PITCH: '지금 위치는 {actualName:이에요}. 목표 {expectedName:은는} {clefName}의 {expectedPositionText}에 있어요.',
  WRONG_SPELLING_SAME_PITCH: '{where}: 소리 높이는 같지만 이름이 달라요. 지금은 {actualName}, 목표는 {expectedName:이에요}.',
  OCTAVE_MISMATCH: '{where}: 옥타브가 달라요. 지금은 {actualName}, 목표는 {expectedName:이에요}.',
  WRONG_PITCH: '{where}: 지금은 {actualName:이에요}. 목표는 {expectedName:이에요}.',
  WRONG_ORDER: '{position}번째와 {otherPosition}번째 자리의 순서가 바뀌었어요.',
  SCALE_LENGTH: '음이 {actual}개 놓여 있어요. 이 도전은 {expected}개를 놓아요.',
  MISSING_EVENT: '{where}에 {expectedKindKo}가 없어요.',
  EXTRA_EVENT: '{where}에 목표에 없는 {actualKindKo}가 있어요.',
  REST_EXPECTED_NOTE_FOUND: '{where:은는} 쉼이에요. 현재 배치에서는 {actualName:이가} 울려요.',
  NOTE_EXPECTED_REST_FOUND: '{where}에는 {expectedName:이가} 울려야 해요. 지금은 쉼이에요.',
  DURATION_MISMATCH: '{where}: 목표는 {expectedText}, 지금은 {actualText}.',
  TUPLET_DURATION: '{where}: 이 묶음에서는 각 음이 {eachTicks}틱이에요. 묶음 전체는 {groupTotalText}여야 해요.',
  TUPLET_MISMATCH: '{where}: 연음 묶음이 목표와 달라요. 목표는 {expectedGroup}.',
  PITCH_MISMATCH: '{where}: 목표는 {expectedName:이에요}. 지금은 {actualName:이에요}.',
  MEASURE_TICKS_REMAIN: '{measureText}에서 {remainTicks}틱이 남아요. {remainText:이에요}.',
  MEASURE_TICKS_OVER: '{measureText:이가} {overTicks}틱 넘쳐요. {overText:이에요}.',
  OVERLAP: '{where}: 음이 서로 겹쳐 있어요.',
  MISSING_VOICE: '{voiceLabel:이가} 아직 없어요.',
  MISSING_TONE: '{name:이가} 빠졌어요.',
  EXTRA_NOTE: '{name:이가} 더해져 있어요. 이 화음의 구성음이 아니에요.',
  DUPLICATE_TONE: '{name:을를} 겹쳐 놓았어요. 이 도전에서는 같은 음을 겹치지 않아요.',
  NOTE_COUNT: '음이 {actual}개예요. 이 도전은 {expected}를 놓아요.',
  WRONG_OCTAVE_SET: '음의 높이(옥타브)가 목표와 달라요. 목표는 {expectedNames}.',
  INCOMPLETE_TRIAD: '{missingNames:이가} 없어 완전한 3화음 조건을 먼저 확인해야 해요.',
  WRONG_INVERSION: '현재 가장 낮은 음은 {bassName:이에요}. 그래서 {actualInversion:이에요}. 목표는 {targetInversion:이에요}.',
  WRONG_INTERVAL: '{where}: 목표는 {expectedText}. 지금 고른 것은 {actualText}.',
  WRONG_SOUND_EQUIV: '{where}: 소리 높이가 {expectedAnswer}.',
  WRONG_NOTATION_EQUIV: '{where}: 표기(음이름)가 {expectedAnswer}.',
};

/**
 * 판정기가 각 설명 코드에 담아 주는 값의 이름. 콘텐츠 문장은 여기에 있는 이름만 쓸 수 있다.
 * (없는 이름을 쓰면 '{이름}'이 화면에 그대로 보이므로 콘텐츠 검사가 막는다.)
 */
const POS_PARAMS = ['where', 'position', 'positionOrdinal', 'keyName', 'actualName', 'expectedName', 'expectedLetter'] as const;
export const ISSUE_PARAMS: Record<IssueCode, readonly string[]> = {
  MISSING_PLACEMENT: ['where', 'position', 'positionOrdinal', 'keyName'],
  EXTRA_PLACEMENT: ['where'],
  WRONG_STAFF_PITCH: ['where', 'actualName', 'expectedName', 'expectedLetter', 'clefName', 'expectedPositionText'],
  WRONG_SPELLING_SAME_PITCH: POS_PARAMS,
  OCTAVE_MISMATCH: POS_PARAMS,
  WRONG_PITCH: POS_PARAMS,
  WRONG_ORDER: ['position', 'otherPosition', 'where'],
  SCALE_LENGTH: ['actual', 'expected'],
  MISSING_EVENT: ['where', 'expectedKindKo'],
  EXTRA_EVENT: ['where', 'actualKindKo'],
  REST_EXPECTED_NOTE_FOUND: ['where', 'actualName'],
  NOTE_EXPECTED_REST_FOUND: ['where', 'expectedName'],
  DURATION_MISMATCH: ['where', 'expectedText', 'actualText'],
  TUPLET_DURATION: ['where', 'eachTicks', 'groupTotalText'],
  TUPLET_MISMATCH: ['where', 'expectedGroup'],
  PITCH_MISMATCH: POS_PARAMS,
  MEASURE_TICKS_REMAIN: ['measureText', 'remainTicks', 'remainText'],
  MEASURE_TICKS_OVER: ['measureText', 'overTicks', 'overText'],
  OVERLAP: ['where'],
  MISSING_VOICE: ['voiceLabel'],
  // 화음 사건 목록(X-3)은 어느 화음인지를 where로 알려 준다. 화음 하나를 보는 과제는 where를 주지 않으므로 그 문장 틀은 where를 쓰지 않는다
  MISSING_TONE: ['name', 'where'],
  EXTRA_NOTE: ['name', 'where'],
  DUPLICATE_TONE: ['name', 'where'],
  NOTE_COUNT: ['actual', 'expected', 'where'],
  WRONG_OCTAVE_SET: ['expectedNames', 'where'],
  INCOMPLETE_TRIAD: ['missingNames'],
  WRONG_INVERSION: ['bassName', 'actualInversion', 'targetInversion'],
  WRONG_INTERVAL: ['where', 'expectedText', 'actualText', 'semitones'],
  WRONG_SOUND_EQUIV: ['where', 'expectedAnswer'],
  WRONG_NOTATION_EQUIV: ['where', 'expectedAnswer'],
};

/** 문장 틀에 들어 있는 '{이름}' 자리들의 이름 */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(/\{([A-Za-z0-9_]+)(?::[^}]+)?\}/g)].map((m) => m[1]!);
}

/** 콘텐츠 규칙에서 줄여 쓴 코드 이름을 받아 준다(설계서 부록 A.1의 'MISSING'). */
export const CODE_ALIASES: Record<string, IssueCode> = { MISSING: 'MISSING_PLACEMENT' };

export function isKnownCode(code: string): boolean {
  return code in DEFAULT_TEMPLATES || code in CODE_ALIASES;
}

/** 줄여 쓴 이름을 정식 코드로 바꾼다. 모르는 이름이면 null */
export function canonicalCode(code: string): IssueCode | null {
  if (code in DEFAULT_TEMPLATES) return code as IssueCode;
  return CODE_ALIASES[code] ?? null;
}

/** 화음 사건 목록(X-3)이 어느 화음인지(where)를 알려 주는 코드들. 문장 틀이 {where}를 쓰지 않으면 앞에 '어디: '를 붙인다 */
const WHERE_PREFIX_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>(['MISSING_TONE', 'EXTRA_NOTE', 'DUPLICATE_TONE', 'NOTE_COUNT', 'WRONG_OCTAVE_SET']);

export function renderFeedback(issue: Issue, rules: readonly FeedbackRule[] = []): string {
  const rule = rules.find((r) => r.code === issue.code || CODE_ALIASES[r.code] === issue.code);
  const template = rule ? rule.template : DEFAULT_TEMPLATES[issue.code];
  const text = fillTemplate(template, issue.params);
  const where = issue.params['where'];
  if (typeof where === 'string' && where.length > 0 && WHERE_PREFIX_CODES.has(issue.code) && !placeholdersOf(template).includes('where')) return `${where}: ${text}`;
  return text;
}

export function renderAll(issues: readonly Issue[], rules: readonly FeedbackRule[] = [], max = Infinity): string[] {
  return issues.slice(0, max).map((i) => renderFeedback(i, rules));
}
