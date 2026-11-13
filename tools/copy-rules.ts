// 8-2 문구 점검의 규칙(설계서 7.6, W-9): 화면에 나오는 한글 문구 한 덩어리를 받아 걸리는 것을 돌려준다. 순수한 함수다(파일을 읽지 않는다).
//
// 무엇을 잡는가
//   must   W-9("능력이나 나이를 추정하지 않는다", 칭찬하지 않는다)를 어기는 말. 한 건도 없어야 한다. 단위 시험이 지킨다.
//   review 사람이 보고 판단할 말. 어기는지는 글만으로 알 수 없다(어려움을 말하는 것, 틀림을 말하는 것, 긴 문장, 풀지 않은 용어, 느낌표).
// 한계: 글자 모양만 본다. 말뜻과 읽기 수준(어린이 대상이면 달라진다. D-3)은 사람이 검수표(npm run copy -- --deck)로 본다.
// 이 파일은 tools/ 아래라서 문구 수집(src와 content만 읽는다)에 걸리지 않는다.

export type CopySeverity = 'must' | 'review';

export interface CopyFinding {
  code: string;
  severity: CopySeverity;
  /** 걸린 말(낱말이나 문장의 앞부분) */
  fragment: string;
}

export interface CopyRuleInfo {
  code: string;
  severity: CopySeverity;
  label: string;
}

/** 문장 하나의 길이 한도(글자 수). 7.6의 "한 문장에 한 가지만"을 글자 모양으로 어림한 것이라 review로만 쓴다 */
export const SENTENCE_REVIEW_LENGTH = 60;

/** 낱말 뒤에 붙는 조사. 한글에는 낱말 경계가 없어서, 낱말 하나(어절)가 '말뿌리 + 조사'일 때만 같은 말로 본다 */
const JOSA = '(?:은|는|이|가|의|를|을|도|에|에게|에게는|와|과|랑|만|로|으로|처럼|한테|께|보다|라도|이라도|이나|나|들|들은|들이|들의|들을|들도|들에게)?';

const AGE_STEMS = ['어린이', '아이', '꼬마', '유아', '유치원생', '초등학생', '초등', '중학생', '고등학생', '학생', '초보자', '초보', '입문자', '또래', '나이'];
const AGE_WORD = new RegExp(`^(?:${AGE_STEMS.join('|')})${JOSA}$`);

const PRAISE: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: '잘했다는 말', re: /잘\s?했/ },
  { label: '대단하다는 말', re: /대단/ },
  { label: '천재·똑똑하다는 말', re: /천재|똑똑|영재/ },
  { label: '훌륭하다는 말', re: /훌륭/ },
  { label: '멋지다는 말', re: /멋(?:지|져|진)/ },
  // '최고음'은 음악 용어(가장 높은 음)다
  { label: '최고라는 말', re: /최고(?!음)/ },
  { label: '능력을 가리키는 말', re: /실력|재능|소질/ },
  { label: '완벽하다는 말', re: /완벽/ },
  { label: '놀랍다는 말', re: /굉장|놀라(?:워|운|웠)/ },
  { label: '칭찬·축하', re: /칭찬|축하/ },
];

const DIFFICULTY: ReadonlyArray<RegExp> = [/^쉬(?:운|워|웠|움|우|울)/, /^쉽/, /^어렵/, /^어려/, /^간단/, /^당연/, /^누구나/, /^금방/];
const NEGATIVE: ReadonlyArray<RegExp> = [/틀렸|틀려/, /실패/, /못\s?했/, /못\s?해/, /오답/];
/** 풀어 쓰지 않으면 처음 보는 사람에게 낯선 말. 어절로 보아 '플라스틱'처럼 다른 낱말의 끝에 붙은 것은 걸리지 않게 한다 */
const DEV_WORDS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "'틱'(풀어 쓴 적 없는 박자 단위)", re: /^\d*틱(?:은|는|이|이에요|이야|입니다|이고|이며|인|가|의|을|를|도|에|으로|로|마다|씩|만|까지|부터)?$/ },
  { label: "'id'", re: /^id(?:는|가|를|도|의)?$/i },
  { label: "'판본'", re: /^판본/ },
  { label: "'JSON'", re: /^json/i },
];

export const COPY_RULES: readonly CopyRuleInfo[] = [
  { code: 'PRAISE_ABILITY', severity: 'must', label: '칭찬이나 능력을 말하는 말(W-9)' },
  { code: 'AGE_AUDIENCE', severity: 'must', label: '나이나 대상을 짐작하는 말(W-9, 7.6)' },
  { code: 'DIFFICULTY', severity: 'review', label: '쉽거나 어렵다고 말하는 말' },
  { code: 'NEGATIVE', severity: 'review', label: '틀림이나 실패를 말하는 말' },
  { code: 'DEV_TERM', severity: 'review', label: '개발 용어이거나 풀어 쓰지 않은 용어' },
  { code: 'LONG_SENTENCE', severity: 'review', label: `${SENTENCE_REVIEW_LENGTH}글자를 넘는 문장(7.6의 한 문장에 한 가지)` },
  { code: 'BANG', severity: 'review', label: '낱말에 붙은 느낌표(재촉이나 칭찬처럼 읽힐 수 있다)' },
];

/** 어절로 가른다: 글자나 숫자가 아닌 것이 경계다 */
export function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

/** 문장으로 가른다: 마침표, 물음표, 느낌표, 줄바꿈 뒤, 그리고 ' · '(자판 안내처럼 항목을 늘어놓는 글의 구분). 자리표시자 {…}는 한 글자로 센다 */
export function sentences(text: string): string[] {
  return text
    .replace(/\{[^{}]*\}/g, '0')
    .split(/(?<=[.!?…。])\s+|\n+|\s·\s/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const excerpt = (s: string, n = 24): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 문구 한 덩어리가 걸리는 규칙들. 같은 규칙에 여러 번 걸려도 처음 걸린 것 하나만 돌려준다 */
export function checkCopy(text: string): CopyFinding[] {
  const out: CopyFinding[] = [];
  const add = (code: string, fragment: string): void => {
    const info = COPY_RULES.find((r) => r.code === code)!;
    if (!out.some((f) => f.code === code)) out.push({ code, severity: info.severity, fragment: excerpt(fragment) });
  };
  for (const p of PRAISE) {
    const m = p.re.exec(text);
    if (m) add('PRAISE_ABILITY', text.slice(Math.max(0, m.index - 4), m.index + m[0].length + 6));
  }
  const ws = words(text);
  const age = ws.find((w) => AGE_WORD.test(w));
  if (age) add('AGE_AUDIENCE', age);
  const years = /\d+\s?살/.exec(text);
  if (years) add('AGE_AUDIENCE', years[0]);
  const hard = ws.find((w) => DIFFICULTY.some((re) => re.test(w)));
  if (hard) add('DIFFICULTY', hard);
  for (const re of NEGATIVE) {
    const m = re.exec(text);
    if (m) {
      add('NEGATIVE', text.slice(Math.max(0, m.index - 4), m.index + m[0].length + 6));
      break;
    }
  }
  for (const t of DEV_WORDS) if (ws.some((w) => t.re.test(w))) add('DEV_TERM', t.label);
  const long = sentences(text).find((s) => [...s].length > SENTENCE_REVIEW_LENGTH);
  if (long) add('LONG_SENTENCE', long);
  // 느낌표가 낱말에 붙어 있을 때만 본다. "종 위의 ! 표시"처럼 표시를 가리키는 글자 하나는 느낌표가 아니다
  const bang = /\S!/.exec(text.replace(/\{[^{}]*\}/g, '0'));
  if (bang) add('BANG', text.slice(Math.max(0, bang.index - 8), bang.index + 2));
  return out;
}
