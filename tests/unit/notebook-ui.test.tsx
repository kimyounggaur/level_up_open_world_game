// @vitest-environment jsdom
// 4-7 수첩 화면(6.5, 7.5의 N)과 목록의 추천 이유 줄(6.6). 월드는 가짜로 대신한다. 진짜 Chrome에서의 모습은 tests/flow/notebook.flow.ts가 본다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadDiscoveries } from '@/app/discovery-data';
import { ContentCatalog } from '@/domain/catalog';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import type { DiscoveryDef } from '@/domain/discovery';
import type { Issue, IssueCode } from '@/domain/feedback';
import { passLine } from '@/ui/notebook/Notebook';
import { bootApp, cleanupApps, flush } from './app-rig';
import { songsOf } from './controller-rig';
import { Q01, Q02, Q07, button, click, keydown, q, qa, quest, screenless, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

let n = 0;
interface Over {
  variant?: string;
  tempo?: number;
  original?: number;
  assist?: boolean;
  issues?: Issue[];
}
function attempt(questId: string, over: Over = {}): AttemptResult {
  const issues = over.issues ?? [];
  return makeAttemptResult({
    attemptId: `a${++n}`,
    questId,
    variantId: over.variant ?? (questId === Q02 ? 'quarter-rest' : questId === Q01 ? 'middle-c' : 'c-major'),
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: issues.length === 0, issues, facts: {} },
    context: { tempoBpm: over.tempo ?? 80, originalTempoBpm: over.original ?? 80, assistUsed: over.assist ?? false, soundState: 'on', soundPlayed: true },
  } as never);
}
const issue = (code: IssueCode, position?: number): Issue => ({ code, params: {}, ...(position !== undefined ? { target: { position } } : {}) });

const tabs = (host: ParentNode) => qa<HTMLButtonElement>(host, '[role="tab"]');
const selectedTab = (host: ParentNode) => tabs(host).find((t) => t.getAttribute('aria-selected') === 'true')!;
const pageText = (host: ParentNode): string => text(q(host, '[role="tabpanel"]'));
const open = (host: ParentNode, label: string): void => click(tabs(host).find((t) => text(t) === label)!);

describe('수첩을 여는 길', () => {
  it('#/notebook 주소로 열리고, 제목은 수첩이며, 돌아가기가 있다', async () => {
    const t = await bootApp('#/notebook');
    expect(text(q(t.host, 'h1'))).toBe('수첩');
    expect(q(t.host, '[data-overlay="notebook"]')).not.toBeNull();
    expect(button(t.host, '돌아가기')).toBeTruthy();
  });

  it('N 키로 열고 다시 N 또는 Esc로 닫는다. 월드는 멈춘다', async () => {
    const t = await bootApp('');
    t.press('KeyN');
    expect(t.win.location.hash).toBe('#/notebook');
    await flush();
    expect(q(t.host, '[data-overlay="notebook"]')).not.toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    t.press('KeyN');
    expect(t.win.location.hash).toBe('#/');
    t.press('KeyN');
    t.press('Escape');
    expect(t.win.location.hash).toBe('#/');
  });

  it('탐험 화면의 오른쪽 위 메뉴에 수첩 단추(N)가 있고, 누르면 수첩이 열린다', async () => {
    const t = await bootApp('');
    const menu = q(t.host, '.hud-menu')!;
    const btn = button(menu, '수첩');
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('N');
    expect(text(q(btn, '.hud-key'))).toBe('N');
    click(btn);
    expect(t.win.location.hash).toBe('#/notebook');
  });

  it('쓰는 중인 글 입력에서는 N이 화면을 가로채지 않는다', async () => {
    const t = await bootApp('');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    keydown(input, 'n', { code: 'KeyN' });
    expect(t.win.location.hash).toBe('');
    input.remove();
  });
});

describe('쪽: 지역 여섯 장, 발견, 내 곡, 관찰(6.5)', () => {
  it('쪽 탭은 지역 쪽 여섯 장과 발견, 내 곡, 관찰이다. 처음에는 지금 있는 지역의 쪽이 펼쳐져 있다', async () => {
    const t = await bootApp('#/notebook');
    expect(tabs(t.host).map((b) => text(b))).toEqual(['음악 마을', '오선 언덕', '박자 강가', '종나무 숲', '음계 길', '건반 늪', '발견', '내 곡', '관찰']);
    expect(text(selectedTab(t.host))).toBe('음악 마을');
    expect(q(t.host, '[role="tablist"]')!.getAttribute('aria-label')).toBe('수첩의 쪽');
    const panel = q(t.host, '[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(selectedTab(t.host).id);
    expect(selectedTab(t.host).getAttribute('aria-controls')).toBe(panel.id);
  });

  it('지금 있는 지역이 다르면 그 지역의 쪽이 먼저 펼쳐진다', async () => {
    const t = await bootApp('');
    t.ctx.world.bridge.patchStatus({ regionId: 'scale-trail' });
    t.press('KeyN');
    await flush();
    expect(text(selectedTab(t.host))).toBe('음계 길');
    expect(text(q(t.host, '[role="tabpanel"] h2'))).toBe('음계 길');
  });

  it('쪽은 탭을 눌러 넘기고, 고른 탭에만 tabindex 0이 있다(탭 순서에 한 칸만 든다)', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '관찰');
    expect(text(selectedTab(t.host))).toBe('관찰');
    expect(tabs(t.host).filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(tabs(t.host).find((b) => b.tabIndex === 0)).toBe(selectedTab(t.host));
    expect(q(t.host, '[role="tabpanel"]')!.getAttribute('data-page-id')).toBe('observations');
  });

  it('← → Home End로 쪽을 넘기고, 가장자리에서는 반대쪽으로 이어진다. 초점도 따라간다', async () => {
    const t = await bootApp('#/notebook');
    const list = q(t.host, '[role="tablist"]')!;
    const first = tabs(t.host)[0]!;
    first.focus();
    expect(keydown(first, 'ArrowRight')).toBe(true);
    expect(text(selectedTab(t.host))).toBe('오선 언덕');
    expect(document.activeElement).toBe(selectedTab(t.host));
    keydown(document.activeElement!, 'ArrowLeft');
    keydown(document.activeElement!, 'ArrowLeft');
    expect(text(selectedTab(t.host))).toBe('관찰'); // 처음 쪽에서 왼쪽으로 가면 마지막 쪽
    keydown(document.activeElement!, 'ArrowRight');
    expect(text(selectedTab(t.host))).toBe('음악 마을');
    keydown(document.activeElement!, 'End');
    expect(text(selectedTab(t.host))).toBe('관찰');
    keydown(document.activeElement!, 'Home');
    expect(text(selectedTab(t.host))).toBe('음악 마을');
    // Ctrl을 누른 채는 브라우저의 것이다
    expect(keydown(list.querySelector('[role="tab"][tabindex="0"]')!, 'ArrowRight', { ctrlKey: true })).toBe(false);
    expect(text(selectedTab(t.host))).toBe('음악 마을');
  });

  it('이전 쪽·다음 쪽 단추로도 넘긴다(터치)', async () => {
    const t = await bootApp('#/notebook');
    click(button(t.host, '다음 쪽'));
    expect(text(selectedTab(t.host))).toBe('오선 언덕');
    click(button(t.host, '이전 쪽'));
    click(button(t.host, '이전 쪽'));
    expect(text(selectedTab(t.host))).toBe('관찰');
    for (const label of ['이전 쪽', '다음 쪽']) expect(button(t.host, label).getBoundingClientRect).toBeDefined();
  });

  it('쪽을 넘겨도 N과 Esc는 그대로 닫는다', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '건반 늪');
    t.press('Escape');
    expect(t.win.location.hash).toBe('#/');
  });
});

describe('지역 쪽: 열어 봄과 통과, 템포와 도움', () => {
  it('마을 쪽에는 Q01 Q02 Q07이 번호 차례로 있고, 놓인 곳이 적힌다. 만들지 않은 과제는 없다', async () => {
    const t = await bootApp('#/notebook');
    const cards = qa(t.host, '.nb-quest');
    expect(cards.map((c) => c.getAttribute('data-quest'))).toEqual([Q01, Q02, Q07]);
    expect(cards.map((c) => text(q(c, 'h3')))).toEqual(['Q01 같은 음의 자리 찾기', 'Q02 쉼이 있는 한 마디', 'Q07 장음계 배열하기']);
    expect(text(q(cards[2]!, '.nb-places'))).toBe('놓인 곳: 음계 디딤돌');
    expect(pageText(t.host)).not.toContain('화음');
  });

  it("'열어 봄'은 열어 본 과제에만 붙는다", async () => {
    const t = await bootApp('#/notebook', { opened: [Q02] });
    const mark = (id: string) => q(q(t.host, `.nb-quest[data-quest="${id}"]`)!, '.nb-opened');
    expect(mark(Q02)).not.toBeNull();
    expect(text(mark(Q02))).toBe('열어 봄');
    expect(mark(Q01)).toBeNull();
    expect(mark(Q07)).toBeNull();
  });

  it('기록이 없는 판본은 "아직 기록이 없어요", 확인만 한 판본은 확인한 횟수만 적는다', async () => {
    const t = await bootApp('#/notebook', { attempts: [attempt(Q02, { issues: [issue('MISSING_EVENT')] }), attempt(Q02, { issues: [issue('MISSING_EVENT')] })] });
    const row = (qid: string, vid: string) => q(q(t.host, `.nb-quest[data-quest="${qid}"]`)!, `.nb-variant[data-variant="${vid}"]`)!;
    expect(text(row(Q02, 'quarter-rest'))).toContain('확인 2번');
    expect(text(row(Q02, 'quarter-rest'))).not.toContain('통과');
    expect(row(Q02, 'quarter-rest').getAttribute('data-passed')).toBe('false');
    expect(text(row(Q01, 'middle-c'))).toContain('아직 기록이 없어요');
    // 고칠 곳이 나왔다고 열어 본 표시가 빠지지는 않는다
    expect(q(q(t.host, `.nb-quest[data-quest="${Q02}"]`)!, '.nb-opened')).not.toBeNull();
  });

  it('통과에는 템포와 도움이 함께 적힌다', async () => {
    const t = await bootApp('#/notebook', { attempts: [attempt(Q02, { tempo: 80, original: 80, assist: false })] });
    const row = q(q(t.host, `.nb-quest[data-quest="${Q02}"]`)!, '.nb-variant')!;
    // ✓는 보이기만 하는 표시(aria-hidden)이고 간격은 CSS가 준다. 읽는 말은 "통과 · …"로 시작한다
    expect(text(q(row, '.nb-pass'))).toBe('✓통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이');
    expect(q(row, '.nb-pass .nb-mark')!.getAttribute('aria-hidden')).toBe('true');
    expect(text(row)).toContain('확인 1번');
  });

  it('느린 템포의 통과는 원래 템포의 통과와 다른 줄에 적힌다. 섞이지 않는다', async () => {
    const t = await bootApp('#/notebook', {
      attempts: [attempt(Q02, { tempo: 60, original: 80, assist: true }), attempt(Q02, { tempo: 80, original: 80 }), attempt(Q02, { tempo: 60, original: 80, assist: true })],
    });
    const lines = qa(q(t.host, `.nb-quest[data-quest="${Q02}"]`)!, '.nb-pass').map((l) => text(l));
    expect(lines).toEqual([
      '✓통과 · 느린 템포 4분음표 = 60 BPM(원래 80) · 도움을 썼어요 · 2번',
      '✓통과 · 원래 템포 4분음표 = 80 BPM · 도움 없이',
    ]);
    const slow = qa(t.host, '.nb-pass').filter((l) => l.getAttribute('data-slower') === 'true');
    expect(slow).toHaveLength(1);
    expect(slow[0]!.getAttribute('data-assist')).toBe('true');
  });

  it('passLine: 템포가 없으면 도움만, 3/8처럼 다른 기준음이면 그 이름으로 적는다', () => {
    expect(passLine({ tempoBpm: null, originalTempoBpm: null, slower: false, assistUsed: false, count: 1 })).toBe('통과 · 도움 없이');
    expect(passLine({ tempoBpm: 60, originalTempoBpm: 60, slower: false, assistUsed: true, count: 3 }, 'dottedQuarter')).toBe('통과 · 원래 템포 점4분음표 = 60 BPM · 도움을 썼어요 · 3번');
  });

  it('통과한 판본마다 따로 적힌다(장음계의 판본들)', async () => {
    const t = await bootApp('#/notebook', { attempts: [attempt(Q07, { variant: 'c-major' }), attempt(Q07, { variant: 'f-major', tempo: 60, original: 80, assist: true })] });
    const rows = qa(q(t.host, `.nb-quest[data-quest="${Q07}"]`)!, '.nb-variant');
    expect(rows.map((r) => r.getAttribute('data-variant'))).toEqual(['c-major', 'f-major', 'g-major', 'd-major', 'bflat-major']);
    expect(rows.map((r) => r.getAttribute('data-passed'))).toEqual(['true', 'true', 'false', 'false', 'false']);
    expect(text(q(rows[1]!, '.nb-pass'))).toContain('느린 템포');
  });

  it('같은 과제는 놓인 지역의 쪽마다 같은 기록으로 나온다(장음계는 마을과 음계 길)', async () => {
    const t = await bootApp('#/notebook', { attempts: [attempt(Q07, { variant: 'c-major' })] });
    open(t.host, '음계 길');
    const card = q(t.host, `.nb-quest[data-quest="${Q07}"]`)!;
    expect(text(q(card, '.nb-places'))).toBe('놓인 곳: 장음계 길');
    expect(text(q(card, '.nb-pass'))).toContain('통과');
    open(t.host, '오선 언덕');
    expect(qa(t.host, '.nb-quest').map((c) => c.getAttribute('data-quest'))).toEqual([Q01]);
  });

  it('열 수 있는 도전이 없는 지역 쪽에는 그렇게 적힌다', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '종나무 숲');
    expect(q(t.host, '[data-empty]')).not.toBeNull();
    expect(pageText(t.host)).toContain('열 수 있는 도전이 아직 없어요');
    expect(qa(t.host, '.nb-quest')).toHaveLength(0);
  });

  it('열기 링크는 열 수 있는 판본에만 있고 그 주소로 간다. 화면이 없는 판본에는 없다', async () => {
    const t = await bootApp('#/notebook');
    const a = q<HTMLAnchorElement>(q(t.host, `.nb-quest[data-quest="${Q02}"]`)!, 'a.btn')!;
    expect(a.getAttribute('href')).toBe('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(a.getAttribute('aria-label')).toBe('쉼이 있는 한 마디 · 4분쉼표 열기'.replace('4분쉼표', quest(Q02).variants['quarter-rest']!.label ?? 'quarter-rest'));
    cleanupApps();
    const u = await bootApp('#/notebook', { definitions: [quest(Q01), screenless(quest(Q02)), quest(Q07)] });
    expect(q(q(u.host, `.nb-quest[data-quest="${Q02}"]`)!, 'a.btn')).toBeNull();
    expect(q(q(u.host, `.nb-quest[data-quest="${Q01}"]`)!, 'a.btn')).not.toBeNull();
  });

  it('통과한 기록 옆에서도 그 과제를 다시 열 수 있다. 막지 않는다', async () => {
    const t = await bootApp('#/notebook', { attempts: [attempt(Q02)] });
    expect(q(q(t.host, `.nb-quest[data-quest="${Q02}"]`)!, 'a.btn')).not.toBeNull();
  });
});

describe('발견, 내 곡, 관찰', () => {
  it('관찰은 확인한 도전이 없으면 안내만 적는다', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '관찰');
    expect(pageText(t.host)).toContain('아직 확인한 도전이 없어요');
    expect(qa(t.host, '.nb-observation')).toHaveLength(0);
  });

  it('관찰은 있었던 일만 사실 문장으로 적고, 시도가 적으면 그렇게 밝힌다', async () => {
    const t = await bootApp('#/notebook', {
      attempts: [attempt(Q07, { issues: [issue('WRONG_PITCH', 4)] }), attempt(Q07, { issues: [issue('WRONG_PITCH', 4)] })],
    });
    open(t.host, '관찰');
    const cards = qa(t.host, '.nb-observation');
    expect(cards).toHaveLength(1);
    expect(text(q(cards[0]!, 'h3'))).toBe('장음계 배열하기');
    expect(text(q(cards[0]!, '.nb-few'))).toBe('적은 시도에서 관찰');
    expect(qa(cards[0]!, '.nb-sentences li').map((l) => text(l))).toEqual([
      '최근 2번 확인했고, 모두 고칠 곳이 나왔어요.',
      '음의 높이가 2번 고칠 곳으로 나왔어요.',
      '4번째 자리가 2번 고칠 곳으로 나왔어요.',
    ]);
  });

  it('세 번 이상 확인했으면 "적은 시도" 표시가 없다', async () => {
    const t = await bootApp('#/notebook', { attempts: [attempt(Q07), attempt(Q07), attempt(Q07)] });
    open(t.host, '관찰');
    expect(q(t.host, '.nb-few')).toBeNull();
    expect(qa(t.host, '.nb-sentences li').map((l) => text(l))).toEqual(['최근 3번 확인했고, 모두 통과했어요.']);
  });

  it('경험치, 별점, 순위, 완주율, 남은 일의 개수가 어느 쪽에도 없다(6.7)', async () => {
    const t = await bootApp('#/notebook', { opened: [Q01], attempts: [attempt(Q02), attempt(Q07, { issues: [issue('WRONG_PITCH', 2)] }), attempt(Q07, { issues: [issue('WRONG_PITCH', 2)] })] });
    const seen: string[] = [];
    for (const tab of tabs(t.host)) {
      click(tab);
      // 판본 이름("4분쉼표가 있는 4/4"의 4/4는 박자표)은 내용의 이름이지 진행 숫자가 아니라서 빼고 센다
      const copy = q(t.host, '[role="tabpanel"]')!.cloneNode(true) as HTMLElement;
      for (const label of Array.from(copy.querySelectorAll('.nb-variant strong'))) label.remove();
      seen.push(text(copy));
    }
    const all = seen.join('\n');
    expect(all).not.toMatch(/경험치|레벨|별점|별 |순위|랭킹|완주|달성|남았|남은|연속|포인트|점수|%|\d+\s*\/\s*\d+|\d+\s*개\s*중|중\s*\d+/);
    expect(all).not.toMatch(/잘했|훌륭|대단|축하|부족|실력/);
    // 빼고 센 글이 비어 있지 않은지 — 시험이 아무것도 보지 않는 것이 되지 않도록
    expect(seen.join('').length).toBeGreaterThan(300);
  });
});

describe('목록의 추천(6.6): 순서를 바꾸고 이유 한 줄을 붙일 뿐이다', () => {
  const ids = (host: ParentNode): string[] => qa(host, '.quest-card').map((c) => c.getAttribute('data-quest')!);

  it('마을에서 아직 아무것도 열지 않았으면 마을 정거장의 차례로 이유가 붙는다', async () => {
    const t = await bootApp('#/list');
    expect(ids(t.host)).toEqual([Q01, Q02, Q07]);
    const reasons = qa(t.host, '.quest-reason').map((r) => text(r));
    expect(reasons).toEqual(Array(3).fill('지금 있는 음악 마을에서 아직 열어 보지 않은 도전이에요.'));
    expect(qa(t.host, '.quest-card').every((c) => c.getAttribute('data-reason') === 'unopenedHere')).toBe(true);
  });

  it('열어 본 과제는 추천에서 빠져 뒤로 가지만, 목록에서 빠지지는 않는다', async () => {
    const t = await bootApp('#/list', { opened: [Q01] });
    expect(ids(t.host)).toEqual([Q02, Q07, Q01]);
    expect(qa(t.host, '.quest-reason')).toHaveLength(2);
    expect(q(q(t.host, `.quest-card[data-quest="${Q01}"]`)!, '.quest-reason')).toBeNull();
    // 추천이 아니어도 열 수 있다
    expect(q(q(t.host, `.quest-card[data-quest="${Q01}"]`)!, 'a.btn')).not.toBeNull();
  });

  it('다른 지역에 있으면 그 지역의 열어 보지 않은 과제가 앞에 온다', async () => {
    const t = await bootApp('');
    t.ctx.world.bridge.patchStatus({ regionId: 'scale-trail' });
    t.press('KeyL');
    await flush();
    expect(ids(t.host)).toEqual([Q07, Q01, Q02]);
    expect(text(q(t.host, '.quest-reason'))).toBe('지금 있는 음계 길에서 아직 열어 보지 않은 도전이에요.');
  });

  it('모두 열어 보았으면 이유 줄도 순서 바꿈도 없다', async () => {
    const t = await bootApp('#/list', { opened: [Q01, Q02, Q07] });
    expect(ids(t.host)).toEqual([Q01, Q02, Q07]);
    expect(qa(t.host, '.quest-reason')).toHaveLength(0);
  });

  it('거르기를 하면 걸러진 목록 안에서만 앞으로 온다. 거르기를 풀면 전부 다시 보인다', async () => {
    const t = await bootApp('#/list', { opened: [Q01] });
    click(q(t.host, '[data-filter-tag="scale"]')!);
    expect(ids(t.host)).toEqual([Q07]);
    expect(text(q(t.host, '.quest-reason'))).toContain('아직 열어 보지 않은 도전');
    click(q(t.host, '[data-filter-clear]')!);
    expect(ids(t.host)).toHaveLength(3);
  });

  it('추천 이유는 사실만 말하고 경고나 막는 말이 없다(W-9)', async () => {
    const t = await bootApp('#/list');
    const all = qa(t.host, '.quest-reason').map((r) => text(r)).join('\n');
    expect(all).not.toMatch(/먼저|꼭|해야|하세요|위험|주의|경고|잠겨|못 열|열 수 없/);
  });
});

// ───── 발견과 내 곡(5-6, 6.5) ─────
const P = (n: number): string => `disc.village.piece-${n}`;
const NOTE = (n: number): string => `disc.village.note-${n}`;
const piece = (n: number): DiscoveryDef => loadDiscoveries('preview').find((d) => d.discoveryId === P(n))!;
/** 마을과 다섯 바깥 지역의 발견 요소 이름 전부(아무것도 못 찾았을 때 어디에도 새지 않아야 하는 것) */
const ALL_NAMES = loadDiscoveries('preview').map((d) => d.name);
const slots = (host: ParentNode, group: 'pieces' | 'notes') => qa(q(host, `[data-group="${group}"]`)!, 'li');
const replayBtn = (host: ParentNode, id: string): HTMLButtonElement => q<HTMLButtonElement>(host, `[data-replay="${id}"]`)!;

describe('발견(6.5): 찾은 것은 이름과 다시 듣기, 못 찾은 것은 빈칸만', () => {
  it('아무것도 못 찾았으면 이름도 힌트도 없이 빈칸만 있다: 소리 조각 서른여섯 칸, 개념 쪽지 열여덟 칸', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '발견');
    expect(text(q(t.host, '[role="tabpanel"] h2'))).toBe('발견');
    expect(qa(t.host, '.nb-group h3').map((h) => text(h))).toEqual(['소리 조각', '개념 쪽지']);
    expect(slots(t.host, 'pieces')).toHaveLength(36);
    expect(slots(t.host, 'notes')).toHaveLength(18);
    expect(qa(t.host, '[data-discovery-slot]')).toHaveLength(54);
    expect(qa(t.host, '[data-found="true"]')).toHaveLength(0);
    const copy = pageText(t.host);
    expect(ALL_NAMES).toHaveLength(54);
    for (const name of ALL_NAMES) expect(copy).not.toContain(name);
    // 어디에 있는지 짐작하게 하는 말도, 숫자도 없다
    expect(copy).not.toMatch(/광장|길가|근처|동쪽|서쪽|남쪽|북쪽|좌표|\d/);
    expect(copy).not.toMatch(/곧|나중에|업데이트|준비 중/);
    expect(q(t.host, '[data-replay]')).toBeNull();
  });

  it('찾은 소리 조각은 제자리(찾은 차례가 아니라 정해진 자리)에 이름과 음 이름과 듣기 단추로 적힌다. 나머지는 빈칸이다', async () => {
    const t = await bootApp('#/notebook', { found: [P(2), P(5)] });
    open(t.host, '발견');
    const rows = slots(t.host, 'pieces');
    // 마을의 조각 여섯이 앞에 놓이고, 이어서 다른 지역의 조각이 정해진 자리에 빈칸으로 있다
    expect(rows).toHaveLength(36);
    expect(rows.map((r) => r.getAttribute('data-found'))).toEqual(Array.from({ length: 36 }, (_, i) => String(i === 1 || i === 4)));
    expect(rows[1]!.getAttribute('data-discovery')).toBe(P(2));
    expect(text(q(rows[1]!, '.nb-found-text'))).toBe('바람결 E4 D4 C4 검수 전');
    expect(text(q(rows[4]!, '.nb-found-text'))).toBe('저녁 종 A4 G4 검수 전');
    expect(replayBtn(t.host, P(2)).getAttribute('aria-label')).toBe('바람결 듣기');
    expect(qa(t.host, '[data-discovery-slot]')).toHaveLength(52);
    // 못 찾은 것의 이름은 아직 없다
    expect(pageText(t.host)).not.toContain('첫걸음');
  });

  it('찾은 개념 쪽지는 이름과 설명 글을 보이고, 열 수 있는 도전이면 이어진 도전 열기가 있다. 열 수 없으면 단추만 없다', async () => {
    const t = await bootApp('#/notebook', { found: [NOTE(1), NOTE(3)] });
    open(t.host, '발견');
    const rows = slots(t.host, 'notes');
    expect(rows).toHaveLength(18);
    expect(rows.map((r) => r.getAttribute('data-found'))).toEqual(Array.from({ length: 18 }, (_, i) => String(i === 0 || i === 2)));
    expect(text(q(rows[0]!, '.nb-note-name'))).toBe('같은 음, 다른 자리 검수 전');
    expect(text(q(rows[0]!, '.nb-note-text'))).toContain('음자리표가 다르면 오선의 다른 자리에 적어요');
    const link = q<HTMLAnchorElement>(rows[0]!, '[data-related]')!;
    expect(link.getAttribute('href')).toBe(ContentCatalog.hashFor(Q01, 'middle-c'));
    expect(link.getAttribute('aria-label')).toBe('이어진 도전 열기: 같은 음의 자리 찾기');
    expect(link.getAttribute('aria-label')).toContain(text(link));
    // 세 번째 쪽지가 잇는 화음 과제(Q05)는 이 판(Q01, Q02, Q07)에 없어서 단추가 없다. 설명은 그대로 읽힌다
    expect(q(rows[2]!, '[data-related]')).toBeNull();
    expect(text(q(rows[2]!, '.nb-note-text')).length).toBeGreaterThan(10);
  });

  it('검수 전 표지는 아직 공개하지 않은 것에만 붙고, 정식 공개에 올라간 것에는 붙지 않는다', async () => {
    const published = { ...piece(1), availability: 'published', reviewStatus: 'reviewed', rightsStatus: 'confirmed' } as DiscoveryDef;
    const t = await bootApp('#/notebook', { found: [P(1), P(2)], discoveries: [published, piece(2)] });
    open(t.host, '발견');
    expect(q(q(t.host, `[data-discovery="${P(1)}"]`)!, '.chip-state')).toBeNull();
    expect(text(q(q(t.host, `[data-discovery="${P(2)}"]`)!, '.chip-state'))).toBe('검수 전');
    expect(slots(t.host, 'pieces')).toHaveLength(2);
  });

  it('보이는 발견 요소가 없는 판(정식 공개 전)에서는 숨어 있는 것이 아직 없다고만 적는다', async () => {
    const t = await bootApp('#/notebook', { discoveries: [] });
    open(t.host, '발견');
    expect(q(t.host, '[data-empty]')).not.toBeNull();
    expect(pageText(t.host)).toContain('이 판에는 숨어 있는 것이 아직 들어 있지 않아요');
    expect(qa(t.host, '[data-discovery-slot]')).toHaveLength(0);
  });

  it('쪽을 연 채로 새로 찾으면 그 자리가 바로 채워진다', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '발견');
    expect(qa(t.host, '[data-found="true"]')).toHaveLength(0);
    act(() => void t.ctx.found.mark(P(3)));
    expect(qa(t.host, '[data-found="true"]')).toHaveLength(1);
    expect(text(q(t.host, `[data-discovery="${P(3)}"] strong`))).toBe('돌다리');
  });

  it('듣기 단추: 누르면 들려 주고 같은 단추가 정지가 된다. 한 번 더 누르면 멈춘다. 소리 조각은 도전과 상관없이 들린다', async () => {
    const t = await bootApp('#/notebook', { found: [P(1)] });
    open(t.host, '발견');
    expect(t.ctx.controller.previewing).toBe(false);
    click(replayBtn(t.host, P(1)));
    expect(t.ctx.controller.previewing).toBe(true);
    expect(t.ctx.melody.listening()).toBe(`piece:${P(1)}`);
    expect(replayBtn(t.host, P(1)).getAttribute('aria-label')).toBe('첫걸음 정지');
    expect(replayBtn(t.host, P(1)).getAttribute('data-playing')).toBe('true');
    expect(t.ctx.controller.current).toBeNull();
    click(replayBtn(t.host, P(1)));
    expect(t.ctx.controller.previewing).toBe(false);
    expect(replayBtn(t.host, P(1)).getAttribute('aria-label')).toBe('첫걸음 듣기');
  });

  it('쪽을 넘기거나 수첩을 닫으면 듣던 소리가 멈춘다. 다른 소리 조각을 누르면 먼저 듣던 것은 멈춘다', async () => {
    const t = await bootApp('#/notebook', { found: [P(1), P(2)] });
    open(t.host, '발견');
    click(replayBtn(t.host, P(1)));
    click(replayBtn(t.host, P(2)));
    expect(t.ctx.melody.listening()).toBe(`piece:${P(2)}`);
    expect(replayBtn(t.host, P(1)).getAttribute('data-playing')).toBe('false');
    open(t.host, '관찰');
    expect(t.ctx.controller.previewing).toBe(false);
    open(t.host, '발견');
    click(replayBtn(t.host, P(1)));
    expect(t.ctx.controller.previewing).toBe(true);
    act(() => {
      t.win.location.hash = '#/';
    });
    await flush();
    expect(t.ctx.controller.previewing).toBe(false);
  });
});

describe('내 곡(6.5): 저장한 자유 편집의 다시 듣기, 이름 바꾸기, 지우기', () => {
  const rows = (host: ParentNode) => qa(host, '.nb-creation');
  const rowName = (r: Element): string => text(q(r, 'h3'));

  it('저장한 곡이 없으면 안내만 적고, 만들지 않은 기능을 약속하지 않는다', async () => {
    const t = await bootApp('#/notebook');
    open(t.host, '내 곡');
    expect(text(q(t.host, '[role="tabpanel"] h2'))).toBe('내 곡');
    expect(q(t.host, '[data-empty]')).not.toBeNull();
    expect(pageText(t.host)).toContain('저장한 곡이 아직 없어요');
    expect(pageText(t.host)).not.toMatch(/곧|나중에|업데이트|준비 중/);
    expect(rows(t.host)).toHaveLength(0);
  });

  it('저장한 곡은 가장 최근에 저장한 것이 위에 오고, 이름과 길이(4마디, 음 몇 개)와 세 단추가 있다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(3) });
    open(t.host, '내 곡');
    expect(rows(t.host).map(rowName)).toEqual(['곡 3', '곡 2', '곡 1']);
    expect(text(q(rows(t.host)[0]!, '.quest-card-head .muted'))).toBe('4마디 · 음 8개');
    const first = rows(t.host)[0]!;
    expect(qa(first, 'button').map((b) => b.getAttribute('aria-label'))).toEqual(['곡 3 듣기', '곡 3 이름 바꾸기', '곡 3 지우기']);
    expect(qa(first, 'button').map((b) => text(b))).toEqual(['듣기', '이름 바꾸기', '지우기']);
  });

  it('듣기: 누르면 들려 주고 정지가 된다. 쪽을 넘기면 멈춘다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(2) });
    open(t.host, '내 곡');
    click(replayBtn(t.host, 'creation-1'));
    expect(t.ctx.controller.previewing).toBe(true);
    expect(replayBtn(t.host, 'creation-1').getAttribute('aria-label')).toBe('곡 1 정지');
    expect(replayBtn(t.host, 'creation-2').getAttribute('aria-label')).toBe('곡 2 듣기');
    click(replayBtn(t.host, 'creation-1'));
    expect(t.ctx.controller.previewing).toBe(false);
    click(replayBtn(t.host, 'creation-2'));
    open(t.host, '발견');
    expect(t.ctx.controller.previewing).toBe(false);
  });

  it('이름 바꾸기: 입력 칸이 열리고 초점이 가며 지금 이름이 들어 있다. 저장하면 이름이 바뀌고 결과를 글로 알린다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(2) });
    open(t.host, '내 곡');
    click(q(q(t.host, '[data-creation="creation-1"]')!, '[data-rename]'));
    const input = q<HTMLInputElement>(t.host, '.melody-name-input')!;
    expect(input.value).toBe('곡 1');
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(20);
    act(() => {
      input.value = '아침 노래';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(q(t.host, '[data-rename-save]'));
    expect(t.ctx.creations.list().map((c) => c.name)).toEqual(['아침 노래', '곡 2']);
    expect(rows(t.host).map(rowName)).toEqual(['곡 2', '아침 노래']);
    const status = q(t.host, '[data-creation-status]')!;
    expect(status.getAttribute('data-creation-status')).toBe('ok');
    expect(status.getAttribute('role')).toBe('status');
    expect(text(status)).toBe('이름을 아침 노래로 바꿨어요.');
    // 맞고 틀림은 색만으로 알리지 않는다(7.9의 4번): 글 앞에 기호가 붙는다
    expect(status.querySelector('svg.icon')?.getAttribute('aria-hidden')).toBe('true');
    // 눌렀던 단추가 사라지므로 결과를 알리는 글로 초점이 간다
    expect(document.activeElement).toBe(status);
    expect(q(t.host, '.melody-name-input')).toBeNull();
  });

  it('이름이 비었거나 너무 길면 바꾸지 않고 이유를 알린다. 입력 칸은 그대로 열려 있다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(1) });
    open(t.host, '내 곡');
    click(q(t.host, '[data-rename]'));
    const input = q<HTMLInputElement>(t.host, '.melody-name-input')!;
    act(() => {
      input.value = '   ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(q(t.host, '[data-rename-save]'));
    expect(q(t.host, '[data-creation-status]')!.getAttribute('data-creation-status')).toBe('error');
    expect(q(t.host, '[data-creation-status] svg.icon'), '실패 글에도 기호가 붙는다').not.toBeNull();
    expect(t.ctx.creations.list()[0]!.name).toBe('곡 1');
    expect(q(t.host, '.melody-name-input')).not.toBeNull();
    act(() => {
      input.value = '가'.repeat(21);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(q(t.host, '[data-rename-save]'));
    expect(q(t.host, '[data-creation-status]')!.getAttribute('data-creation-status')).toBe('error');
    expect(t.ctx.creations.list()[0]!.name).toBe('곡 1');
  });

  it('이름 바꾸기를 그만두면 아무것도 바뀌지 않는다. Esc는 입력만 닫고 수첩은 닫지 않는다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(1) });
    open(t.host, '내 곡');
    click(q(t.host, '[data-rename]'));
    click(q(t.host, '[data-rename-cancel]'));
    expect(q(t.host, '.melody-name-input')).toBeNull();
    click(q(t.host, '[data-rename]'));
    const input = q<HTMLInputElement>(t.host, '.melody-name-input')!;
    expect(keydown(input, 'Escape')).toBe(true);
    expect(q(t.host, '.melody-name-input')).toBeNull();
    expect(t.win.location.hash).toBe('#/notebook');
    expect(q(t.host, '[data-overlay="notebook"]')).not.toBeNull();
    expect(t.ctx.creations.list()[0]!.name).toBe('곡 1');
  });

  it('이름 바꾸기를 그만두면(그만두기 단추, Esc) 초점이 이름 바꾸기 단추로 돌아온다. 눌렀던 단추가 사라져도 초점이 문서 처음으로 날아가지 않는다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(2) });
    open(t.host, '내 곡');
    const row = (): Element => q(t.host, '[data-creation="creation-2"]')!;
    click(q(row(), '[data-rename]'));
    click(q(row(), '[data-rename-cancel]'));
    expect(document.activeElement).toBe(q(row(), '[data-rename]'));
    click(q(row(), '[data-rename]'));
    expect(keydown(q<HTMLInputElement>(t.host, '.melody-name-input')!, 'Escape')).toBe(true);
    expect(document.activeElement).toBe(q(row(), '[data-rename]'));
  });

  it('지우기를 누르면 초점이 확인 상자의 그만두기로 가고(물음을 이어 읽는다), 그만두면 지우기 단추로 돌아온다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(2) });
    open(t.host, '내 곡');
    const row = (): Element => q(t.host, '[data-creation="creation-2"]')!;
    click(q(row(), '[data-delete]'));
    const cancel = q(row(), '[data-confirm-cancel]')!;
    expect(document.activeElement).toBe(cancel);
    const asked = t.host.querySelector(`#${cancel.getAttribute('aria-describedby')}`);
    expect(text(asked)).toContain('지울까요?');
    click(cancel);
    expect(q(row(), '.nb-confirm')).toBeNull();
    expect(document.activeElement).toBe(q(row(), '[data-delete]'));
  });

  it('지우기는 한 번 더 묻는다. 그만두면 그대로이고, 지우기를 누르면 곡이 사라진다(광장 게시판과 무대 표지판도 같은 목록을 본다)', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(2) });
    open(t.host, '내 곡');
    click(q(q(t.host, '[data-creation="creation-2"]')!, '[data-delete]'));
    const confirm = q(t.host, '.nb-confirm')!;
    expect(confirm.getAttribute('role')).toBe('group');
    expect(confirm.getAttribute('aria-label')).toBe('곡 2 지우기 확인');
    expect(text(q(confirm, 'p'))).toBe('곡 2를 지울까요? 광장 게시판에서도 사라지고 되돌릴 수 없어요.');
    expect(t.ctx.creations.list()).toHaveLength(2);
    click(q(confirm, '[data-confirm-cancel]'));
    expect(q(t.host, '.nb-confirm')).toBeNull();
    expect(t.ctx.creations.list()).toHaveLength(2);
    click(q(q(t.host, '[data-creation="creation-2"]')!, '[data-delete]'));
    click(q(t.host, '[data-confirm-delete]'));
    expect(t.ctx.creations.list().map((c) => c.creationId)).toEqual(['creation-1']);
    expect(rows(t.host).map(rowName)).toEqual(['곡 1']);
    const status = q(t.host, '[data-creation-status]')!;
    expect(text(status)).toBe('곡 2를 지웠어요.');
    expect(document.activeElement).toBe(status);
  });

  it('마지막 곡을 지우면 빈 쪽 안내로 돌아가고, 듣던 곡을 지우면 소리가 멈춘다', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(1) });
    open(t.host, '내 곡');
    click(replayBtn(t.host, 'creation-1'));
    expect(t.ctx.controller.previewing).toBe(true);
    click(q(t.host, '[data-delete]'));
    click(q(t.host, '[data-confirm-delete]'));
    expect(t.ctx.controller.previewing).toBe(false);
    expect(q(t.host, '[data-empty]')).not.toBeNull();
    expect(pageText(t.host)).toContain('저장한 곡이 아직 없어요');
  });

  it('수첩을 열고 닫기만 해서는 곡이 지워지지 않는다(앱이 알아서 지우지 않는다)', async () => {
    const t = await bootApp('#/notebook', { creations: songsOf(2) });
    open(t.host, '내 곡');
    act(() => {
      t.win.location.hash = '#/';
    });
    await flush();
    act(() => {
      t.win.location.hash = '#/notebook';
    });
    await flush();
    expect(t.ctx.creations.list()).toHaveLength(2);
  });

  it('발견과 내 곡에도 경험치, 별점, 순위, 완주율, 남은 일의 개수가 없다(6.7)', async () => {
    const t = await bootApp('#/notebook', { found: [P(1), P(2), NOTE(1)], creations: songsOf(3) });
    const seen: string[] = [];
    for (const label of ['발견', '내 곡']) {
      open(t.host, label);
      seen.push(pageText(t.host));
    }
    const all = seen.join('\n');
    expect(all).not.toMatch(/경험치|레벨|별점|별 |순위|랭킹|완주|달성|남았|남은|연속|포인트|점수|%|\d+\s*\/\s*\d+|\d+\s*개\s*중|중\s*\d+/);
    expect(all).not.toMatch(/잘했|훌륭|대단|축하|부족|실력/);
    expect(all.length).toBeGreaterThan(200);
  });
});
