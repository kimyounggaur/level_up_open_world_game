// @vitest-environment jsdom
// 도움말의 '소리' 구역(8-3, 설계서 8.6, 10.8): 소리를 켰는데 들리지 않을 때 볼 안내가 있다.
// 아이폰과 아이패드는 무음 모드이면 브라우저 소리가 나지 않을 수 있다. 앱은 이것을 알아낼 수 없어서(소리 장치는 '켜져 있다'고 답한다) 안내 문구로만 도울 수 있다.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, cleanupApps } from './app-rig';
import { q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

async function soundSection() {
  const t = await bootApp('#/help');
  const page = q(t.host, '[data-overlay="help"]')!;
  const section = q(page, '[aria-labelledby="help-sound"]')!;
  return section;
}

describe('도움말의 소리 구역: 소리가 들리지 않을 때(8.6)', () => {
  it('소리를 켰는데 들리지 않을 때 볼 것을 세 가지 말한다: 기기 음량, 아이폰과 아이패드의 무음 모드, 이어폰과 블루투스 연결', async () => {
    const section = await soundSection();
    expect(text(q(section, 'h2'))).toBe('소리');
    const note = text(q(section, '[data-testid="help-no-sound"]'));
    for (const phrase of ['소리를 켰는데 들리지 않으면', '음량', '아이폰과 아이패드', '무음 모드', '이어폰', '블루투스']) expect(note, phrase).toContain(phrase);
  });

  it('한 문장에 한 가지만 말한다(7.6): 문장마다 60자 이하이고, 사용자를 탓하거나 능력·나이를 말하지 않는다', async () => {
    const section = await soundSection();
    const note = text(q(section, '[data-testid="help-no-sound"]'));
    const sentences = note.split(/(?<=[.!?])\s+/);
    expect(sentences).toHaveLength(3);
    for (const s of sentences) expect(s.length, s).toBeLessThanOrEqual(60);
    for (const word of ['잘못', '실수', '어린이', '아이들', '초보', '쉽', '어렵']) expect(note, word).not.toContain(word);
  });

  it('앞의 안내(소리 켜기를 누른 뒤에만 난다, 끈 채로도 걷고 푼다)와 놀이 악기 안내는 그대로 있고, 밖으로 가는 링크는 없다', async () => {
    const section = await soundSection();
    const all = text(section);
    expect(all).toContain("소리는 '소리 켜기'를 누른 뒤에만 나요.");
    expect(all).toContain('소리를 끈 채로도 걷고, 도전을 풀 수 있어요.');
    expect(all).toContain('물방울 북이나 메아리 벽');
    expect(qa(section, 'a[href]')).toHaveLength(0);
  });
});
