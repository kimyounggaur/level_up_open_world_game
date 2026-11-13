// @vitest-environment jsdom
// 설정의 '정보' 구역(8-2, 설계서 10.9, 8-1의 알려진 한계): 받지 않는 것과 저장하는 곳을 한 단락으로 말하고,
// 오픈소스와 악보 글꼴의 고지 원문을 접었다 펴는 상자에서 읽을 수 있다.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, cleanupApps } from './app-rig';
import { NOTICES } from '@/app/notices';
import { AboutSection } from '@/ui/overlay/AboutSection';
import { mount, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const m of mounted.splice(0)) m();
  cleanupApps();
});

const root = path.resolve(__dirname, '..', '..');
const NOTICES_FILE = fs.readFileSync(path.join(root, 'public', 'THIRD-PARTY-NOTICES.txt'), 'utf-8');

function section(notices = '가짜 고지\nMIT License\n') {
  const m = mount(<AboutSection notices={notices} />);
  mounted.push(m.unmount);
  return m.host;
}

describe('정보 구역: 받지 않는 것과 저장하는 곳', () => {
  it('계정이 없고 이름이나 연락처를 받지 않으며 이 기기에만 저장한다고 말한다', () => {
    const host = section();
    expect(text(q(host, 'h2'))).toBe('정보');
    const note = text(q(host, '[data-testid="about-privacy"]'));
    for (const phrase of ['계정이 없고', '이름이나 연락처를 받지 않아요', '이 기기에만 저장되고', '어디로도 보내지 않아요']) expect(note, phrase).toContain(phrase);
  });

  it('한 문장에 한 가지만 말한다(7.6): 문장마다 60자 이하이고 능력이나 나이를 말하지 않는다', () => {
    const host = section();
    const sentences = text(q(host, '[data-testid="about-privacy"]')).split(/(?<=[.!?])\s+/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    for (const s of sentences) expect(s.length, s).toBeLessThanOrEqual(60);
    expect(text(host)).not.toMatch(/어린이|아이|나이|학생|초보|실력/);
  });

  it('구역은 제목으로 이름이 붙은 영역이다(화면 낭독기가 구역 이름을 읽는다)', () => {
    const host = section();
    const el = q(host, 'section')!;
    expect(el.getAttribute('aria-labelledby')).toBe('set-about');
    expect(q(host, '#set-about')!.tagName).toBe('H2');
  });
});

describe('정보 구역: 고지 원문', () => {
  it('처음에는 접혀 있고, 펼치는 단추의 이름은 글로 읽힌다', () => {
    const host = section();
    const details = q<HTMLDetailsElement>(host, 'details')!;
    expect(details.open).toBe(false);
    const summary = q(details, 'summary')!;
    expect(text(summary)).toBe('오픈소스와 글꼴 고지 보기');
    expect(summary.classList.contains('btn')).toBe(true);
  });

  it('원문을 한 글자도 바꾸지 않고 보인다. 키보드로 넘겨 볼 수 있다(tabindex 0, 이름 있음)', () => {
    const notices = '첫 줄\n  들여쓴 줄 © 2024\n\n마지막 줄\n';
    const host = section(notices);
    const pre = q(host, '[data-testid="notices-text"]')!;
    expect(pre.tagName).toBe('PRE');
    expect(pre.textContent).toBe(notices);
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.getAttribute('aria-label')).toBe('오픈소스와 글꼴 고지 원문');
  });

  it('고지를 파일 링크로 걸지 않는다(서버가 글자 인코딩을 알리지 않으면 한글이 깨질 수 있다). 밖으로 가는 링크가 없다', () => {
    const host = section();
    expect(qa(host, 'a')).toHaveLength(0);
    expect(qa(host, '[href]')).toHaveLength(0);
  });
});

describe('설정 화면에 끼워 넣기', () => {
  it('정보 구역이 맨 아래에 있고 고지 원문은 빌드가 만든 파일과 같다', async () => {
    const t = await bootApp('#/settings');
    const page = q(t.host, '[data-overlay="settings"]')!;
    const titles = qa(page, 'section.settings-section > h2').map((h) => text(h));
    expect(titles[titles.length - 1]).toBe('정보');
    expect(titles).toContain('사용 기록');
    expect(q(page, '[data-testid="notices-text"]')!.textContent).toBe(NOTICES_FILE);
  });

  it('앱이 가져오는 고지 글자(NOTICES)가 public 파일과 같고 제3자 라이선스 원문이 들어 있다', () => {
    expect(NOTICES).toBe(NOTICES_FILE);
    expect(NOTICES).toContain('Bravura');
    expect(NOTICES).toContain('MIT License');
    expect(NOTICES.length).toBeGreaterThan(10000);
  });
});
