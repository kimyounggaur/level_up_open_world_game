// 8-2 문구 점검(설계서 7.6, W-9): 화면에 나오는 한글 문구에 칭찬·능력·나이를 말하는 말이 없다.
// 규칙이 정말 걸리는지(민감도), 수집이 코드와 콘텐츠를 제대로 읽는지, 저장소 전체가 통과하는지를 따로 시험한다.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDeck, checkAll, collectCopy, collectFromContent, collectFromSource, summarize } from '../../tools/copy-files';
import { checkCopy, COPY_RULES, sentences, words } from '../../tools/copy-rules';

const root = path.resolve(__dirname, '..', '..');
const codes = (text: string): string[] => checkCopy(text).map((f) => f.code);

describe('규칙: 반드시 0이어야 하는 말은 정말 걸린다(민감도)', () => {
  it.each([
    ['정말 잘했어요!', 'PRAISE_ABILITY'],
    ['잘 했어요', 'PRAISE_ABILITY'],
    ['대단해요', 'PRAISE_ABILITY'],
    ['음악 천재예요', 'PRAISE_ABILITY'],
    ['똑똑한 선택', 'PRAISE_ABILITY'],
    ['실력이 늘었어요', 'PRAISE_ABILITY'],
    ['타고난 재능', 'PRAISE_ABILITY'],
    ['최고예요', 'PRAISE_ABILITY'],
    ['완벽해요', 'PRAISE_ABILITY'],
    ['멋져요', 'PRAISE_ABILITY'],
    ['축하해요', 'PRAISE_ABILITY'],
    ['어린이도 할 수 있어요', 'AGE_AUDIENCE'],
    ['아이들을 위한 마을', 'AGE_AUDIENCE'],
    ['아이가 듣고 있어요', 'AGE_AUDIENCE'],
    ['초등학생 수준', 'AGE_AUDIENCE'],
    ['초보자를 위한 안내', 'AGE_AUDIENCE'],
    ['나이에 맞는 문제', 'AGE_AUDIENCE'],
    ['7살도 할 수 있어요', 'AGE_AUDIENCE'],
    ['학생은 여기로', 'AGE_AUDIENCE'],
  ])('%s → %s', (text, code) => {
    expect(codes(text)).toContain(code);
    expect(checkCopy(text).find((f) => f.code === code)!.severity).toBe('must');
  });

  it('음악 용어나 다른 낱말의 일부는 걸리지 않는다(최고음, 플라스틱 같은 말, 아이콘)', () => {
    for (const ok of ['가장 높은 음이 최고음이에요', '플라스틱 종', '아이콘을 눌러요', '아이디어를 적어요', '나이트', '이름이나 연락처를 받지 않아요', '도움이 필요하면 눌러요']) {
      expect(checkCopy(ok).filter((f) => f.severity === 'must'), ok).toEqual([]);
    }
  });

  it('이 앱이 실제로 쓰는 사실 문구는 걸리지 않는다', () => {
    for (const ok of ['3번째 박이 달라요', '소리를 켜지 못했어요. 소리 없이 계속할 수 있어요.', '이 도전을 확인하지 못했어요. 틀린 것이 아니에요. 잠시 뒤 다시 눌러 주세요.', '계정이 없고, 이름이나 연락처를 받지 않아요.']) {
      expect(checkCopy(ok).filter((f) => f.severity === 'must'), ok).toEqual([]);
    }
  });
});

describe('규칙: 사람이 판단할 말은 표시만 한다', () => {
  it('쉽거나 어렵다는 말, 틀림·실패, 풀어 쓰지 않은 용어, 긴 문장, 낱말에 붙은 느낌표를 가린다', () => {
    expect(codes('막히면 쉬운 연습을 해 보세요')).toContain('DIFFICULTY');
    expect(codes('걷기가 어려우면 켜세요')).toContain('DIFFICULTY');
    expect(codes('틀렸어요')).toContain('NEGATIVE');
    expect(codes('저장하지 못했어요')).toContain('NEGATIVE');
    expect(codes('한 칸은 4틱이에요')).toContain('DEV_TERM');
    expect(codes('틱마다 소리가 나요')).toContain('DEV_TERM');
    expect(codes('과제 id를 적어요')).toContain('DEV_TERM');
    expect(codes('이 판본에서 쓰지 않아요')).toContain('DEV_TERM');
    expect(codes('가'.repeat(61))).toContain('LONG_SENTENCE');
    expect(codes('멋진 소리예요!')).toContain('BANG');
    for (const f of checkCopy('쉬운 연습이에요')) expect(f.severity).toBe('review');
  });

  it('다른 낱말의 끝에 붙은 틱, 표시를 가리키는 느낌표, 항목을 늘어놓은 자판 안내는 걸리지 않는다', () => {
    expect(codes('플라스틱 종')).not.toContain('DEV_TERM');
    expect(codes('종 위의 ! 표시를 보세요.')).not.toContain('BANG');
    const legend = '← → 종 · ↑ ↓ 높이 · Shift+← → 가로 자리 · X 소리 · R 듣는 방식 · P 듣기 · C 확인 · H 도움 · Esc 나가기';
    expect(legend.length).toBeGreaterThan(60);
    expect(codes(legend)).not.toContain('LONG_SENTENCE');
  });

  it('같은 규칙에 여러 번 걸려도 한 건으로 센다. 자리표시자는 한 글자로 센다', () => {
    expect(checkCopy('잘했어요. 대단해요. 훌륭해요.').filter((f) => f.code === 'PRAISE_ABILITY')).toHaveLength(1);
    expect(sentences('{CREATION_NAME_MAX}글자까지 적을 수 있어요.')).toEqual(['0글자까지 적을 수 있어요.']);
    expect(words('#/q/과제 id/판본 id')).toEqual(['q', '과제', 'id', '판본', 'id']);
  });

  it('규칙 목록의 반드시 0은 둘뿐이고 코드가 겹치지 않는다', () => {
    expect(COPY_RULES.filter((r) => r.severity === 'must').map((r) => r.code)).toEqual(['PRAISE_ABILITY', 'AGE_AUDIENCE']);
    expect(new Set(COPY_RULES.map((r) => r.code)).size).toBe(COPY_RULES.length);
  });
});

describe('수집: 코드', () => {
  const SRC = `
import { x } from './한글경로';
type K = '타입이름';
const o = { '키이름': 1, label: '레이블 글' };
export function A() {
  const n = 3;
  console.warn('콘솔 글');
  if (n > 5) throw new Error('오류 글');
  return (
    <section aria-label="구역 이름" class="plain" data-testid="id-only">
      <h2>제목 글</h2>
      <p>
        {\`이름은 \${CREATION_NAME_MAX}글자까지, \${n > 1 ? '많이' : '적게'} 적어요\`}
      </p>
      {n > 1 ? '삼항 글' : null}
    </section>
  );
}
`;
  const got = collectFromSource('src/ui/x.tsx', SRC);
  const texts = got.map((g) => g.text);

  it('화면에 나오는 글(JSX 글, 속성, 따옴표 글, 템플릿 글, 오류와 로그의 글)을 모은다', () => {
    for (const t of ['레이블 글', '콘솔 글', '오류 글', '구역 이름', '제목 글', '삼항 글', '많이', '적게']) expect(texts, t).toContain(t);
    expect(texts).toContain('이름은 {CREATION_NAME_MAX}글자까지, {…} 적어요');
  });

  it('가져오기 경로, 형식 이름, 속성 이름, 한글이 없는 글은 모으지 않는다', () => {
    for (const t of ['./한글경로', '타입이름', '키이름', 'plain', 'id-only']) expect(texts, t).not.toContain(t);
  });

  it('자리(role)와 줄 번호와 층을 적는다', () => {
    const by = (t: string) => got.find((g) => g.text === t)!;
    expect(by('구역 이름').role).toBe('attr:aria-label');
    expect(by('제목 글').role).toBe('jsx-text');
    expect(by('오류 글').role).toBe('error');
    expect(by('콘솔 글').role).toBe('log');
    expect(by('레이블 글').role).toBe('string');
    expect(by('이름은 {CREATION_NAME_MAX}글자까지, {…} 적어요').role).toBe('template');
    expect(by('제목 글').line).toBe(11);
    expect(got.every((g) => g.surface === 'screen' && g.source === 'code')).toBe(true);
    expect(collectFromSource('src/domain/x.ts', "export const a = '도메인 글';")[0]!.surface).toBe('support');
  });
});

describe('수집: 콘텐츠', () => {
  it('한글 값을 키 경로와 함께 모으고, 변형 이름은 *로 묶고, 출처 메모(sourceRefs)와 한글이 없는 값은 뺀다', () => {
    const json = {
      id: 'q.one',
      title: '제목',
      sourceRefs: [{ issues: ['개발자 메모'] }],
      variants: { 'a-minor': { label: '가 단조', score: { voices: [{ label: '윗성부' }] } }, basic: { label: '기본' } },
      feedbackRules: [{ template: '{n}번째 박이 달라요' }],
    };
    const got = collectFromContent('content/quests/q.one.json', json);
    expect(got.map((g) => [g.role, g.text])).toEqual([
      ['title', '제목'],
      ['variants.*.label', '가 단조'],
      ['variants.*.score.voices[].label', '윗성부'],
      ['variants.*.label', '기본'],
      ['feedbackRules[].template', '{n}번째 박이 달라요'],
    ]);
    expect(got.every((g) => g.source === 'content' && g.surface === 'screen' && g.line === 0)).toBe(true);
  });
});

describe('저장소 전체', () => {
  const all = collectCopy(root);
  const checked = checkAll(all);
  const sum = summarize(checked);

  it('코드와 콘텐츠에서 한글 문구를 충분히 모은다(수집이 비어 있어 통과하는 일을 막는다)', () => {
    expect(sum.bySource.code).toBeGreaterThan(2000);
    expect(sum.bySource.content).toBeGreaterThan(300);
    const texts = new Set(all.map((a) => a.text));
    for (const t of ['저장하지 못했어요', '계정이 없고, 이름이나 연락처를 받지 않아요. 진행과 기록은 이 기기에만 저장되고 어디로도 보내지 않아요.', '오픈소스와 글꼴 고지 보기']) {
      expect(texts.has(t), t).toBe(true);
    }
    // 콘텐츠: 과제 제목과 정거장 이름이 들어 있다
    expect(all.some((a) => a.source === 'content' && a.role === 'title')).toBe(true);
    expect(all.some((a) => a.source === 'content' && a.role === 'stations[].name')).toBe(true);
  });

  it('칭찬이나 능력, 나이를 말하는 말이 한 건도 없다(W-9)', () => {
    const musts = checked.flatMap((c) => c.findings.filter((f) => f.severity === 'must').map((f) => `[${f.code}] ${c.file}${c.line > 0 ? `:${c.line}` : ''} "${f.fragment}" ← ${c.text.slice(0, 50)}`));
    expect(musts).toEqual([]);
  });

  it('화면 층에서 사람이 판단할 말은 지금 아는 수를 넘지 않는다. 새로 생기면 검수표를 보고 판단한 뒤 수를 고친다', () => {
    // 지금 아는 것(8-2 기록에 하나씩 적었다): 쉬운·어려운 2, 풀어 쓰지 않은 용어 7, 긴 문장 3, 낱말에 붙은 느낌표 0
    expect(sum.byRuleScreen['DIFFICULTY']).toBeLessThanOrEqual(2);
    expect(sum.byRuleScreen['DEV_TERM']).toBeLessThanOrEqual(7);
    expect(sum.byRuleScreen['LONG_SENTENCE']).toBeLessThanOrEqual(3);
    expect(sum.byRuleScreen['BANG']).toBe(0);
  });

  it('검수표는 요약, 걸린 것, 모든 문구를 파일별로 담는다', () => {
    const deck = buildDeck(checked, '2026-11-13');
    expect(deck).toContain('# 문구 검수표 (자동 생성)');
    expect(deck).toContain(`한글 문구 ${sum.total}개`);
    expect(deck).toContain('PRAISE_ABILITY (반드시 0)');
    expect(deck).toContain('## 모든 문구 (파일별)');
    expect(deck).toContain('### src/ui/overlay/AboutSection.tsx');
    expect(deck).toContain('### content/regions/');
    // 걸린 것 표는 화면 층이 먼저 온다
    const section = deck.slice(deck.indexOf('## 걸린 것: DEV_TERM'), deck.indexOf('## 걸린 것: LONG_SENTENCE'));
    const layers = section.split('\n').flatMap((l) => (l.startsWith('| 화면 |') ? ['screen'] : l.startsWith('| 그 밖 |') ? ['support'] : []));
    const firstSupport = layers.indexOf('support');
    expect(firstSupport).toBeGreaterThan(0);
    expect(layers.slice(firstSupport).every((x) => x === 'support')).toBe(true);
  });
});
