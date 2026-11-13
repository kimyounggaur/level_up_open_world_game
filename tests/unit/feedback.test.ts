import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES, fillTemplate, hasBatchim, isKnownCode, renderAll, renderFeedback } from '@/domain/feedback';
import type { Issue } from '@/domain/feedback';

describe('조사 처리', () => {
  it('받침 판단: 한글, 숫자, 변화표, 알파벳', () => {
    expect(hasBatchim('쉼')).toBe(true);
    expect(hasBatchim('음표')).toBe(false);
    expect(hasBatchim('E4')).toBe(false); // 이사
    expect(hasBatchim('E♭3')).toBe(true); // 삼
    expect(hasBatchim('C♯')).toBe(true); // 샵
    expect(hasBatchim('G')).toBe(false); // 지
    expect(hasBatchim('A1')).toBe(true); // 일
    expect(hasBatchim('D5')).toBe(false); // 오
    expect(hasBatchim('B♭4')).toBe(false);
  });

  it('{name:이에요}와 {name:은는}', () => {
    expect(fillTemplate('지금 위치는 {n:이에요}.', { n: 'E4' })).toBe('지금 위치는 E4예요.');
    expect(fillTemplate('지금 위치는 {n:이에요}.', { n: 'E♭3' })).toBe('지금 위치는 E♭3이에요.');
    expect(fillTemplate('{n:은는} 쉼이에요.', { n: '두 번째 박' })).toBe('두 번째 박은 쉼이에요.');
    expect(fillTemplate('{n:이가} 빠졌어요.', { n: 'G' })).toBe('G가 빠졌어요.');
    expect(fillTemplate('{n:이가} 빠졌어요.', { n: 'C♯' })).toBe('C♯이 빠졌어요.');
    expect(fillTemplate('{n:을를} 겹쳤어요.', { n: 'E' })).toBe('E를 겹쳤어요.');
  });

  it("'으로/로'는 받침이 있으면 '으로', 없거나 ㄹ 받침이면 '로'다", () => {
    expect(fillTemplate('{n:으로로} 올렸어요.', { n: 'C4' })).toBe('C4로 올렸어요.'); // 사
    expect(fillTemplate('{n:으로로} 올렸어요.', { n: 'C3' })).toBe('C3으로 올렸어요.'); // 삼
    expect(fillTemplate('{n:으로로} 올렸어요.', { n: 'C♯4' })).toBe('C♯4로 올렸어요.');
    expect(fillTemplate('{n:으로로} 올렸어요.', { n: 'E♭3' })).toBe('E♭3으로 올렸어요.');
    for (const n of ['A1', 'A7', 'A8']) expect(fillTemplate('{n:으로로} 갔어요.', { n }), n).toBe(`${n}로 갔어요.`); // 일·칠·팔은 ㄹ 받침
    expect(fillTemplate('{n:으로로} 갔어요.', { n: 'A6' })).toBe('A6으로 갔어요.'); // 육
    expect(fillTemplate('{n:으로로} 갔어요.', { n: 'L' })).toBe('L로 갔어요.'); // 엘
    expect(fillTemplate('{n:으로로} 갔어요.', { n: '서울' })).toBe('서울로 갔어요.');
    expect(fillTemplate('{n:으로로} 갔어요.', { n: '학교' })).toBe('학교로 갔어요.');
    expect(fillTemplate('{n:으로로} 갔어요.', { n: '집' })).toBe('집으로 갔어요.');
    // 다른 조사의 ㄹ 받침은 그대로 받침으로 센다
    expect(fillTemplate('{n:은는} 높아요.', { n: 'A1' })).toBe('A1은 높아요.');
  });

  it('값이 없으면 자리 표시를 그대로 둔다(조용히 틀린 문장을 만들지 않는다)', () => {
    expect(fillTemplate('{a}와 {b}', { a: '1' })).toBe('1와 {b}');
  });
});

describe('설명 문장', () => {
  it('모든 코드에 기본 문장이 있다', () => {
    for (const [code, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
      expect(tpl.length, code).toBeGreaterThan(5);
      expect(isKnownCode(code)).toBe(true);
    }
    expect(isKnownCode('MISSING')).toBe(true); // 설계서 A.1의 줄임 이름
    expect(isKnownCode('NOPE')).toBe(false);
  });

  it('설계서의 예시 문장이 그대로 나온다', () => {
    const wrongStaff: Issue = {
      code: 'WRONG_STAFF_PITCH',
      params: { actualName: 'E4', expectedName: 'C4', clefName: '높은음자리표', expectedPositionText: '아래 첫 덧줄' },
    };
    expect(renderFeedback(wrongStaff)).toBe('지금 위치는 E4예요. 목표 C4는 높은음자리표의 아래 첫 덧줄에 있어요.');
    expect(
      renderFeedback({ code: 'REST_EXPECTED_NOTE_FOUND', params: { where: '두 번째 박', actualName: 'D4' } }),
    ).toBe('두 번째 박은 쉼이에요. 현재 배치에서는 D4가 울려요.');
    expect(
      renderFeedback({ code: 'MEASURE_TICKS_REMAIN', params: { measureText: '한 마디', remainTicks: 480, remainText: '8분음표 하나 길이' } }),
    ).toBe('한 마디에서 480틱이 남아요. 8분음표 하나 길이예요.');
    // E3의 '3'은 '삼'이라 받침이 있다. 설계서 예시의 'E3라서'는 풀어 쓴 문장이고, 코드는 읽는 소리를 따른다.
    expect(renderFeedback({ code: 'WRONG_INVERSION', params: { bassName: 'E3', actualInversion: '제1전위', targetInversion: '기본 위치' } })).toBe(
      '현재 가장 낮은 음은 E3이에요. 그래서 제1전위예요. 목표는 기본 위치예요.',
    );
    expect(renderFeedback({ code: 'WRONG_INVERSION', params: { bassName: 'E4', actualInversion: '제1전위', targetInversion: '제2전위' } })).toBe(
      '현재 가장 낮은 음은 E4예요. 그래서 제1전위예요. 목표는 제2전위예요.',
    );
  });

  it('콘텐츠의 규칙이 같은 코드의 기본 문장보다 우선한다', () => {
    const issue: Issue = { code: 'OCTAVE_MISMATCH', params: { actualName: 'F4', where: '마지막 자리' } };
    const rules = [{ code: 'OCTAVE_MISMATCH', template: '마지막 음은 시작음보다 한 옥타브 위여야 해요. 지금은 {actualName:이에요}.' }];
    expect(renderFeedback(issue, rules)).toBe('마지막 음은 시작음보다 한 옥타브 위여야 해요. 지금은 F4예요.');
    expect(renderFeedback(issue)).toContain('옥타브가 달라요');
  });

  it("줄인 코드 'MISSING'은 MISSING_PLACEMENT의 규칙으로 받는다", () => {
    const rules = [{ code: 'MISSING', template: '{position}번째 자리가 비어 있어요.' }];
    expect(renderFeedback({ code: 'MISSING_PLACEMENT', params: { position: 5, where: '5번째 자리' } }, rules)).toBe('5번째 자리가 비어 있어요.');
  });

  it('renderAll은 개수를 제한한다', () => {
    const issues: Issue[] = [1, 2, 3, 4].map((i) => ({ code: 'MISSING_PLACEMENT', params: { where: `${i}번` } }));
    expect(renderAll(issues, [], 2)).toEqual(['1번에 음이 아직 없어요.', '2번에 음이 아직 없어요.']);
  });
});
