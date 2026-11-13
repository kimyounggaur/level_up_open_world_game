// 8-3: 휴대폰·태블릿에서만 드러나는 화면 규칙이 스타일 파일에서 빠지지 않게 글로 지킨다.
// 이 시험은 '그 규칙이 파일에 있다'만 본다. 실제로 노치를 피하는지는 흐름 시험(tests/flow/devices.flow.ts, 가장자리 여백을 흉내 낸 Chrome)이 보고,
// 주소창이 늘고 주는 것과 당겨서 새로 고침은 실제 기기에서 사람이 본다(docs/device-checklist.md).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selector: string;
  body: string;
}
/** 가장 안쪽 규칙(선택자 { 선언들 })을 모두 모은다. @media 안의 것도 포함한다 */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of strip(css).matchAll(re)) {
    const selector = m[1]!.replace(/\s+/g, ' ').trim();
    if (selector.startsWith('@')) continue;
    out.push({ selector, body: m[2]!.replace(/\s+/g, ' ').trim() });
  }
  return out;
}
const bodiesOf = (css: string, selector: string): string[] => rules(css).filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector)).map((r) => r.body);

describe('가장자리 여백(노치, 홈 막대): viewport-fit=cover를 쓰므로 화면이 그 안쪽에 놓여야 한다', () => {
  it('index.html은 viewport-fit=cover를 쓴다. 이 값이 있어야 env(safe-area-inset-*)가 0이 아니다', () => {
    expect(read('index.html')).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/);
  });

  const hud = read('src/ui/hud.css');

  it('탐험 화면(.hud)은 네 가장자리 여백을 --safe-*로 한 번 정의한다', () => {
    const body = bodiesOf(hud, '.hud').join(' ');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(body).toContain(`--safe-${side}: env(safe-area-inset-${side}, 0px)`);
  });

  it('탐험 화면의 요소는 모두 absolute라서 틀의 padding으로 밀리지 않는다: 가장자리에서 px로 띄운 요소는 제 자리에 --safe-*를 더한다', () => {
    const edge = /(?:^|[;\s])(top|right|bottom|left):\s*[^;]*\d+px/;
    const missing = rules(hud)
      .filter((r) => /position:\s*absolute/.test(r.body) && edge.test(r.body) && !r.body.includes('--safe-'))
      .map((r) => r.selector);
    expect(missing, '가장자리 여백을 더하지 않은 요소').toEqual([]);
  });

  it('요소마다 알맞은 쪽의 여백을 더한다(지역 이름은 위·왼쪽, 메뉴는 위·오른쪽, 안내 칩은 아래, 열기 단추는 오른쪽·아래, 탭 막대는 안쪽 아래)', () => {
    const one = (sel: string): string => bodiesOf(hud, sel).join(' ');
    expect(one('.hud-corner')).toMatch(/top:\s*calc\(12px \+ var\(--safe-top\)\)/);
    expect(one('.hud-corner')).toMatch(/left:\s*calc\(12px \+ var\(--safe-left\)\)/);
    expect(one('.hud-menu')).toMatch(/top:\s*calc\(12px \+ var\(--safe-top\)\)/);
    expect(one('.hud-menu')).toMatch(/right:\s*calc\(12px \+ var\(--safe-right\)\)/);
    expect(bodiesOf(hud, '.hud-chip-wrap').join(' ')).toMatch(/bottom:\s*calc\(28px \+ var\(--safe-bottom\)\)/);
    expect(bodiesOf(hud, '.hud-chip-wrap').join(' ')).toMatch(/bottom:\s*calc\(160px \+ var\(--safe-bottom\)\)/); // 세로 화면
    expect(one('.hud-interact')).toMatch(/right:\s*calc\(16px \+ var\(--safe-right\)\)/);
    expect(one('.hud-interact')).toMatch(/bottom:\s*calc\(84px \+ var\(--safe-bottom\)\)/);
    expect(one('.hud-tabs')).toMatch(/padding:\s*0 var\(--safe-right\) var\(--safe-bottom\) var\(--safe-left\)/);
  });

  it('지도, 목록, 패널, 겹침 화면의 틀(.panel-shell, .list-shell, .overlay-shell)은 안쪽에 네 가장자리 여백을 둔다', () => {
    const panels = read('src/ui/panels.css');
    const want = 'padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
    expect(bodiesOf(panels, '.panel-shell').join(' ')).toContain(want);
    expect(bodiesOf(panels, '.list-shell').join(' ')).toContain(want);
    expect(bodiesOf(panels, '.overlay-shell').join(' ')).toContain(want);
  });

  it('설치물 모드의 틀(.inst-hud)은 처음부터 네 가장자리 여백을 둔다(세로 화면은 아래를 탭 막대 높이에 더한다)', () => {
    const inst = read('src/ui/installation.css');
    expect(bodiesOf(inst, '.inst-hud').join(' ')).toContain('padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0)');
    expect(bodiesOf(inst, '.inst-hud').join(' ')).toContain('padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px))');
  });
});

describe('주소창이 늘고 주는 브라우저와 당겨서 새로 고침', () => {
  it('html과 body는 overscroll-behavior: none이다: 화면을 끝까지 당겨도 브라우저가 새로 고치지 않는다', () => {
    expect(bodiesOf(read('src/ui/tokens.css'), 'html').join(' ')).toContain('overscroll-behavior: none');
    expect(bodiesOf(read('src/ui/tokens.css'), 'body').join(' ')).toContain('overscroll-behavior: none');
  });

  it('화면 높이를 쓰는 곳은 vh 다음에 dvh를 한 번 더 적는다: dvh를 모르는 브라우저는 vh로, 아는 브라우저는 지금 보이는 높이로', () => {
    const panels = strip(read('src/ui/panels.css'));
    const uses = panels.match(/[a-z-]+:\s*[^;]*\b100vh\b[^;]*;/g) ?? [];
    expect(uses.length, '100vh를 쓰는 선언이 있다').toBeGreaterThan(0);
    for (const decl of uses) {
      const prop = decl.split(':')[0]!.trim();
      if (prop !== 'max-height' && prop !== 'height' && prop !== 'min-height') continue; // 100vw 등은 가로라서 상관없다
      const at = panels.indexOf(decl);
      const after = panels.slice(at + decl.length, at + decl.length + 400);
      expect(after, `${decl} 바로 뒤에 dvh 선언이 있다`).toMatch(new RegExp(`${prop}:\\s*[^;]*100dvh`));
    }
  });
});
