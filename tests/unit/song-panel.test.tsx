// @vitest-environment jsdom
// 5-4 Q08 곡 패널: 마디를 하나씩 열어 성부마다 목표 악보와 같게 음과 쉼을 놓는다. 끌지 않고 눌러서만 끝낸다(7.9 1·2번).
// 듣기 범위는 도움이고(4.2), 기본 연습은 지금 곡을 그대로 두고 열었다 돌아온다(7.5).
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Creations } from '@/app/creations';
import { loadDiscoveries } from '@/app/discovery-data';
import { FoundDiscoveries } from '@/app/found';
import { ContentCatalog } from '@/domain/catalog';
import { CREATION_NAME_MAX, EMPTY_MELODY_MESSAGE } from '@/domain/creation';
import { isSoundPiece } from '@/domain/discovery';
import { isNote } from '@/domain/score';
import { describeScore } from '@/ui/notation/describe';
import { VALUE_TICKS } from '@/domain/time';
import type { NoteValue } from '@/domain/time';
import { tempoText } from '@/ui/common/format';
import { NavContext } from '@/ui/common/nav';
import type { NavApi } from '@/ui/common/nav';
import { FreeMelody } from '@/ui/challenge/melody';
import { FREE_IDLE_TEXT, FREE_SUBTITLE, SongPanel } from '@/ui/panels/song/SongPanel';
import { installation } from './controller-rig';
import { Q02, Q03, Q05, Q08, button, click, keydown, mount, q, qa, rig, setupDom, text } from './ui-rig';
import type { Rig } from './ui-rig';

beforeAll(() => setupDom());

let current: { unmount: () => void } | null = null;
afterEach(() => {
  current?.unmount();
  current = null;
});

type Went = string[];

function open(r: Rig, variant: string, went: Went = []): HTMLElement {
  act(() => {
    r.controller.open(Q08, variant);
  });
  const nav: NavApi = { close: () => undefined, go: (hash) => void went.push(hash) };
  const m = mount(h(NavContext.Provider, { value: nav }, h(SongPanel, { controller: r.controller })));
  current = m;
  return m.host;
}

const newRig = (): Rig => rig('preview', [Q03, Q05, Q08]);

const measureButton = (host: HTMLElement, m: number): HTMLButtonElement => q<HTMLButtonElement>(host, `.measure-button[data-measure="${m}"]`)!;
const voiceRow = (host: HTMLElement, voiceId: string): HTMLElement => q(host, `.song-voice[data-voice="${voiceId}"]`)!;
/** 한 성부의 '내 배치' 줄 조각 단추들 */
const mine = (host: HTMLElement, voiceId: string): HTMLButtonElement[] => qa<HTMLButtonElement>(voiceRow(host, voiceId), '.trow-mine button.tblock-face');
const targets = (host: HTMLElement, voiceId: string): HTMLElement[] => qa(voiceRow(host, voiceId), '.trow-target .tblock');
const blockAt = (host: HTMLElement, voiceId: string, tick: number): HTMLButtonElement => q<HTMLButtonElement>(voiceRow(host, voiceId), `.trow-mine button.tblock-face[data-start="${tick}"]`)!;
const kindButton = (host: HTMLElement, kind: string): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-kind="${kind}"]`)!;
const valueButton = (host: HTMLElement, value: string): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-value="${value}"]`)!;
const pitchButton = (host: HTMLElement, pitch: string): HTMLButtonElement => q<HTMLButtonElement>(host, `button.material[data-pitch="${pitch}"]`)!;
const feedback = (host: HTMLElement): string => q(host, '.feedback')!.getAttribute('data-feedback')!;
const valueOf = (ticks: number): NoteValue => (Object.keys(VALUE_TICKS) as NoteValue[]).find((v) => VALUE_TICKS[v] === ticks)!;

/** 재료를 고른다: 종류(이미 골랐으면 그대로), 길이, 음높이 */
function pick(host: HTMLElement, kind: string, opts: { value?: string; pitch?: string } = {}): void {
  if (kindButton(host, kind).getAttribute('aria-pressed') !== 'true') click(kindButton(host, kind));
  if (opts.value) click(valueButton(host, opts.value));
  if (opts.pitch) click(pitchButton(host, opts.pitch));
}

/** 목표 악보를 보고 눌러서만 같게 만든다: 마디를 열고, 성부 줄마다 재료를 고르고 그 자리의 칸을 누른다 */
function solve(host: HTMLElement, r: Rig): void {
  const def = r.controller.current!.def;
  for (let m = 0; m < r.controller.cells().length; m++) {
    click(measureButton(host, m));
    for (const e of def.score.events.filter((x) => x.measureIndex === m)) {
      if (isNote(e)) pick(host, 'note', { value: valueOf(e.durationTicks), pitch: `${e.writtenPitch.letter}${e.writtenPitch.octave}` });
      else pick(host, 'rest', { value: valueOf(e.durationTicks) });
      click(blockAt(host, e.voiceId, e.onsetTicks));
    }
  }
}

describe('구성', () => {
  it('한 성부 판본: 제목, 칩, 마디 네 개, 성부 줄 하나(목표와 내 배치), 재료, 악보 둘, 도움이 있다', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    expect(text(q(host, 'h1'))).toBe('선택한 짧은 곡 완성하기');
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['4/4박자', tempoText('quarter', 80), '한 성부', '가장 짧은 음 = 4분음표']);
    expect(qa(host, '.measure-button').map((b) => b.getAttribute('data-measure'))).toEqual(['0', '1', '2', '3']);
    expect(qa(host, '.measure-button .measure-name').map((n) => text(n))).toEqual(['1마디', '2마디', '3마디', '4마디']);
    expect(qa(host, '.song-voice')).toHaveLength(1);
    expect(text(q(host, '.song-voice-name'))).toBe('위 성부');
    expect(mine(host, 'v1')).toHaveLength(4);
    expect(targets(host, 'v1')).toHaveLength(4);
    expect(qa(host, '.trow-target button')).toHaveLength(0);
    expect(text(q(host, '#tray-title'))).toBe('배치할 재료');
    expect(text(q(host, '#score-title'))).toBe('악보로 보기');
    expect(text(q(host, '#assist-title'))).toBe('필요한 도움만');
    expect(qa(host, 'svg.notation-svg')).toHaveLength(2);
    // 박 수 표시는 곡 패널에 없고, 마디 반복은 있다
    expect(q(host, '#aid-count')).toBeNull();
    expect(text(q(host, '#aid-repeat-label'))).toBe('1마디 반복');
    expect(qa(host, 'button.material[data-kind]').map((b) => b.getAttribute('data-kind'))).toEqual(['note', 'rest', 'erase']);
    expect(qa(host, 'button.material[data-value]').map((b) => b.getAttribute('data-value'))).toEqual(['quarter', 'half', 'whole']);
  });

  it('처음에는 1마디가 열려 있고, 목표 줄은 단추가 아니며, 목표 음 이름이 줄에 보인다', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    expect(measureButton(host, 0).getAttribute('aria-pressed')).toBe('true');
    expect(measureButton(host, 1).getAttribute('aria-pressed')).toBe('false');
    expect(r.controller.selectedCell()?.measureIndex).toBe(0);
    expect(text(q(host, '#song-title'))).toBe('1마디 시간선');
    expect(targets(host, 'v1').map((t) => text(t))).toEqual(['C4목표: 1마디 1박, C4 4분음표', 'D4목표: 1마디 2박, D4 4분음표', 'E4목표: 1마디 3박, E4 4분음표', 'G4목표: 1마디 4박, G4 4분음표']);
    expect(mine(host, 'v1')[0]!.getAttribute('aria-label')).toBe('1마디 1박, 비어 있음');
  });

  it('두 성부 판본: 성부 줄 둘, 마디 단추마다 성부별 채움이 보인다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    expect(qa(host, '.song-voice-name').map((n) => text(n))).toEqual(['위 성부', '아래 성부']);
    expect(qa(host, '.chips .chip').map((c) => text(c))[2]).toBe('2성부');
    expect(mine(host, 'v1')).toHaveLength(4);
    expect(mine(host, 'v2')).toHaveLength(4);
    expect(measureButton(host, 0).getAttribute('aria-label')).toBe('1마디 열기. 위 성부 비어 있어요. 아래 성부 비어 있어요.');
    expect(qa(measureButton(host, 0), '.voice-fill')).toHaveLength(2);
    // 2마디의 아래 성부는 온음표 하나(목표)를 칸 하나에 놓아도 마디 전체는 채워지지 않는다
    pick(host, 'note', { value: 'quarter', pitch: 'F3' });
    click(measureButton(host, 1));
    click(blockAt(host, 'v2', 0));
    expect(measureButton(host, 1).getAttribute('aria-label')).toBe('2마디 열기. 위 성부 비어 있어요. 아래 성부 4칸 중 1칸이 채워졌어요.');
  });

  it('높은 도전 판본: 8분음표 칸 여덟 개씩이고 음역이 넓다', () => {
    const r = newRig();
    const host = open(r, 'challenge');
    expect(mine(host, 'v1')).toHaveLength(8);
    expect(mine(host, 'v2')).toHaveLength(8);
    expect(qa(host, 'button.material[data-value]').map((b) => b.getAttribute('data-value'))).toEqual(['eighth', 'quarter', 'half', 'whole']);
    expect(qa(host, 'button.material[data-pitch]').map((b) => b.getAttribute('data-pitch'))[0]).toBe('G2');
    expect(text(q(host, '#song-title')!.nextElementSibling)).toContain('8분음표(480틱)');
  });

  it('확인하기 전에는 맞고 틀림을 말하지 않는다', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    expect(feedback(host)).toBe('none');
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(mine(host, 'v1')[0]!);
    expect(feedback(host)).toBe('none');
    expect(qa(host, '.tblock-mark')).toHaveLength(0);
    expect(qa(host, '.beat-mark')).toHaveLength(0);
  });
});

describe('5-4 완료 기준: 세 판본을 눌러서만 끝낸다', () => {
  it.each([['one-voice'], ['two-voices'], ['challenge']])('%s: 목표와 같게 놓고 확인하면 통과한다(도움 없이)', (variant) => {
    const r = newRig();
    const host = open(r, variant);
    solve(host, r);
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
    const attempt = r.controller.attempts.at(-1)!;
    expect(attempt.resultType).toBe('passed');
    expect(attempt.assistUsed).toBe(false);
    // 통과하면 모든 마디 단추가 가득 채워졌다고 읽는다
    for (let m = 0; m < 4; m++) expect(measureButton(host, m).getAttribute('aria-label')).not.toContain('비어 있어요');
  });

  it('틀린 곳은 그 성부의 그 마디에만 표시한다: 마디 단추의 느낌표, 줄의 안내, 조각의 표식과 이름', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    solve(host, r);
    // 2마디 위 성부의 첫 음(A4)을 C4로 바꿔 틀리게 한다
    click(measureButton(host, 1));
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(blockAt(host, 'v1', 0));
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('needsRevision');
    expect(qa(host, '.measure-button.has-error').map((b) => b.getAttribute('data-measure'))).toEqual(['1']);
    expect(measureButton(host, 1).getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    expect(qa(measureButton(host, 1), '.beat-mark')).toHaveLength(1);
    // 열려 있는 2마디: 위 성부 줄에만 안내가 있고 틀린 조각에 표식이 붙는다
    expect(qa(voiceRow(host, 'v1'), '.song-voice-flag')).toHaveLength(1);
    expect(qa(voiceRow(host, 'v2'), '.song-voice-flag')).toHaveLength(0);
    expect(mine(host, 'v1')[0]!.getAttribute('aria-label')).toContain('고칠 곳이 있어요');
    expect(qa(host, '.feedback-line').length).toBeGreaterThan(0);
    // 다른 마디를 열면 그곳엔 표시가 없다
    click(measureButton(host, 0));
    expect(qa(host, '.song-voice-flag')).toHaveLength(0);
    // 고치면 표시가 사라지고 다시 확인하면 통과한다
    click(measureButton(host, 1));
    pick(host, 'note', { value: 'quarter', pitch: 'A4' });
    click(blockAt(host, 'v1', 0));
    expect(feedback(host)).toBe('none');
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('passed');
  });

  it('성부가 통째로 비어 있으면 그 성부의 모든 마디 단추에 표시한다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    // 위 성부만 채운다
    const def = r.controller.current!.def;
    for (let m = 0; m < 4; m++) {
      click(measureButton(host, m));
      for (const e of def.score.events.filter((x) => x.measureIndex === m && x.voiceId === 'v1')) {
        if (isNote(e)) pick(host, 'note', { value: valueOf(e.durationTicks), pitch: `${e.writtenPitch.letter}${e.writtenPitch.octave}` });
        click(blockAt(host, 'v1', e.onsetTicks));
      }
    }
    click(button(host, '배치 확인'));
    expect(feedback(host)).toBe('needsRevision');
    expect(qa(host, '.measure-button.has-error')).toHaveLength(4);
  });

  it('놓을 수 없는 자리는 이유를 문장으로 말한다(마디 선을 넘는 온음표)', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    pick(host, 'note', { value: 'whole', pitch: 'C4' });
    click(blockAt(host, 'v1', 960));
    expect(text(q(host, '[data-rejection]'))).toContain('마디 선을');
    expect(r.controller.content().events).toHaveLength(0);
  });
});

describe('키보드(7.9 1번)', () => {
  it('← →로 칸을 옮기고, 줄 끝에서 한 번 더 누르면 옆 마디로 넘어가 첫 칸에 초점이 간다', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    const first = mine(host, 'v1');
    first[0]!.focus();
    keydown(first[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(mine(host, 'v1')[1]);
    mine(host, 'v1')[3]!.focus();
    keydown(mine(host, 'v1')[3]!, 'ArrowRight');
    expect(measureButton(host, 1).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(mine(host, 'v1')[0]);
    // 거꾸로: 2마디 첫 칸에서 ←를 누르면 1마디 마지막 칸
    keydown(mine(host, 'v1')[0]!, 'ArrowLeft');
    expect(measureButton(host, 0).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(mine(host, 'v1')[3]);
  });

  it('↑ ↓로 같은 시간 자리의 다른 성부 조각으로 옮긴다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    mine(host, 'v1')[2]!.focus();
    keydown(mine(host, 'v1')[2]!, 'ArrowDown');
    // 아래 성부는 1마디 안에 칸 네 개이고 2박(960)에 걸쳐 있는 칸은 세 번째가 아니라 같은 시작 틱의 칸이다
    const lower = mine(host, 'v2');
    expect(document.activeElement).toBe(lower[2]);
    keydown(lower[2]!, 'ArrowUp');
    expect(document.activeElement).toBe(mine(host, 'v1')[2]);
    // 맨 위·맨 아래에서는 옮기지 않는다
    keydown(mine(host, 'v1')[2]!, 'ArrowUp');
    expect(document.activeElement).toBe(mine(host, 'v1')[2]);
  });

  it('PageDown·PageUp으로 마디를 바꾸고 같은 성부, 같은 시간 자리에 초점이 간다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    mine(host, 'v2')[1]!.focus();
    keydown(mine(host, 'v2')[1]!, 'PageDown');
    expect(measureButton(host, 1).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(mine(host, 'v2')[1]);
    keydown(mine(host, 'v2')[1]!, 'PageUp');
    expect(measureButton(host, 0).getAttribute('aria-pressed')).toBe('true');
  });

  it('Enter로 놓고 Delete로 비우며, 놓은 자리에 초점이 남는다. Ctrl+Z로 되돌린다', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    pick(host, 'note', { value: 'quarter', pitch: 'E4' });
    const b = mine(host, 'v1')[2]!;
    b.focus();
    click(b);
    expect(r.controller.content().events).toHaveLength(1);
    expect(document.activeElement).toBe(mine(host, 'v1')[2]);
    expect(mine(host, 'v1')[2]!.getAttribute('aria-label')).toContain('E4');
    keydown(mine(host, 'v1')[2]!, 'Delete');
    expect(r.controller.content().events).toHaveLength(0);
    expect(document.activeElement).toBe(mine(host, 'v1')[2]);
    // Ctrl+Z: 비운 것을 되돌린다
    keydown(q(host, '.panel-body')!, 'z', { ctrlKey: true });
    expect(r.controller.content().events).toHaveLength(1);
    keydown(q(host, '.panel-body')!, 'y', { ctrlKey: true });
    expect(r.controller.content().events).toHaveLength(0);
  });
});

describe('듣기 범위(4.2, 4.9)', () => {
  const scopeButton = (host: HTMLElement, name: string): HTMLButtonElement => button(q(host, '.song-scope')!, name);

  it('한 성부 판본은 전체와 고른 마디만 있고, 두 성부 판본은 성부별 단추가 더 있다', () => {
    const r = newRig();
    let host = open(r, 'one-voice');
    expect(qa(host, '.song-scope .choice').map((b) => text(b))).toEqual(['✓전체', '1마디만']);
    current!.unmount();
    host = open(r, 'two-voices');
    expect(qa(host, '.song-scope .choice').map((b) => text(b))).toEqual(['✓전체', '위 성부만', '아래 성부만', '1마디만']);
  });

  it('성부를 고르면 도움 사용으로 적히고, 전체로 되돌려도 이미 쓴 것은 남는다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    expect(r.controller.usedAssist()).toBe(false);
    click(scopeButton(host, '아래 성부만'));
    expect(r.controller.scopeChoice).toEqual({ kind: 'voice', voiceId: 'v2' });
    expect(r.controller.aids.scoped).toBe(true);
    expect(r.controller.usedAssist()).toBe(true);
    expect(text(q(host, '.song-scope-now'))).toBe('듣기 단추는 아래 성부만 들려 줘요.');
    expect(scopeButton(host, '아래 성부만').getAttribute('aria-pressed')).toBe('true');
    click(scopeButton(host, '전체'));
    expect(r.controller.scopeChoice).toEqual({ kind: 'all' });
    expect(r.controller.usedAssist()).toBe(true);
  });

  it('고른 마디만은 지금 연 마디를 따라가고, 마디 이름이 단추에 보인다', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    click(scopeButton(host, '1마디만'));
    expect(r.controller.listenScope()).toEqual({ kind: 'measure', measureIndex: 0 });
    click(measureButton(host, 2));
    expect(r.controller.listenScope()).toEqual({ kind: 'measure', measureIndex: 2 });
    expect(text(q(host, '.song-scope .choice[aria-pressed="true"]'))).toBe('✓3마디만');
    expect(text(q(host, '.song-scope-now'))).toBe('듣기 단추는 3마디만 들려 줘요.');
  });

  it('범위를 바꾸지 않고 전체로 들으면 도움을 쓰지 않은 것이다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    solve(host, r);
    click(button(host, '내 배치 듣기'));
    click(button(host, '배치 확인'));
    expect(r.controller.attempts.at(-1)!.assistUsed).toBe(false);
  });
});

describe('기본 연습(5-5, 7.5)', () => {
  it('곡 패널의 기본 연습 단추 셋: 쉼표, 짧은 음과 셋잇단, 장3화음', () => {
    const r = newRig();
    const host = open(r, 'one-voice');
    expect(text(q(host, '#practice-title'))).toBe('기본 연습');
    expect(qa(host, 'button[data-practice]').map((b) => [b.getAttribute('data-practice'), text(b)])).toEqual([
      [Q02, '쉼표 연습'],
      [Q03, '짧은 음과 셋잇단 연습'],
      [Q05, '장3화음 연습'],
    ]);
  });

  it('누르면 연습 과제가 열리고 그 주소로 간다. 지금 곡의 초안은 보관되며 돌아오면 그대로다', () => {
    const r = newRig();
    const went: Went = [];
    const host = open(r, 'one-voice', went);
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(blockAt(host, 'v1', 0));
    click(measureButton(host, 2));
    expect(r.controller.content().events).toHaveLength(1);

    click(q(host, `button[data-practice="${Q02}"]`));
    expect(r.controller.inAssist).toBe(true);
    expect(r.controller.current!.entry.questId).toBe(Q02);
    expect(went).toHaveLength(1);
    expect(went[0]!.startsWith(`#/q/${Q02}/`)).toBe(true);
    expect(r.controller.origin()).toMatchObject({ title: '선택한 짧은 곡 완성하기', hash: ContentCatalog.hashFor(Q08, 'one-voice') });
    // 연습하는 동안 곡 패널은 그려지지 않는다(앱이 주소에 맞는 패널로 바꾼다)
    expect(q(host, '.song-voice')).toBeNull();

    act(() => r.controller.returnToOrigin());
    expect(r.controller.inAssist).toBe(false);
    expect(r.controller.current!.entry.questId).toBe(Q08);
    expect(r.controller.content().events.map((e) => [e.measureIndex, e.onsetTicks])).toEqual([[0, 0]]);
    // 열어 둔 마디도 그대로다
    expect(r.controller.selectedCell()?.measureIndex).toBe(2);
    expect(measureButton(host, 2).getAttribute('aria-pressed')).toBe('true');
  });

  it('연습을 열지 못하면(목록에 없는 과제) 이유를 보여 주고 아무것도 바꾸지 않는다', () => {
    const r = rig('preview', [Q03, Q08]);
    const went: Went = [];
    const host = open(r, 'one-voice', went);
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(blockAt(host, 'v1', 0));
    click(q(host, `button[data-practice="chord.major-triad"]`));
    expect(r.controller.inAssist).toBe(false);
    expect(r.controller.current!.entry.questId).toBe(Q08);
    expect(went).toEqual([]);
    expect(text(q(host, '[data-practice-notice]')).length).toBeGreaterThan(0);
    expect(r.controller.content().events).toHaveLength(1);
  });
});

describe('악보로 보기와 읽어 주는 문장(7.9 8번)', () => {
  it('두 성부 판본은 목표·내 악보 둘 다 그림과 문장이 있고, 문장은 마디마다 성부별로 읽는다', () => {
    const r = newRig();
    const host = open(r, 'two-voices');
    const figures = qa(host, '.score-figure');
    expect(figures.map((f) => text(q(f, 'figcaption')))).toEqual(['목표 악보', '내 악보']);
    expect(qa(host, 'svg.notation-svg')).toHaveLength(2);
    const target = r.controller.current!.def.score;
    const sentence = describeScore(target);
    expect(sentence.startsWith('높은음자리표, 낮은음자리표, 4/4박자.')).toBe(true);
    expect(sentence).toContain('1번째 마디. 위 성부: ');
    expect(sentence).toContain('. 아래 성부: ');
    expect(sentence.indexOf('1번째 마디')).toBeLessThan(sentence.indexOf('2번째 마디'));
    // 내 악보는 아직 비어 있다고 읽는다
    expect(describeScore(r.controller.current!.def.score)).not.toContain('아직 놓은 음이 없어요');
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(blockAt(host, 'v1', 0));
    expect(qa(host, 'svg.notation-svg')).toHaveLength(2);
  });

  it('성부가 하나면 기존 문장 모양을 그대로 쓴다(성부 이름이 끼지 않는다)', () => {
    const r = newRig();
    open(r, 'one-voice');
    const sentence = describeScore(r.controller.current!.def.score);
    expect(sentence).toContain('1번째 마디: ');
    expect(sentence).not.toContain('위 성부');
  });
});

// ───── 자유 가락(4.9, 5-6) ─────
const PIECES = loadDiscoveries('preview').filter(isSoundPiece);
const P1 = 'disc.village.piece-1'; // 첫걸음: C4 D4 E4 G4
const P2 = 'disc.village.piece-2'; // 바람결: E4 D4 C4

/** 합주 무대의 자유 가락을 열고 곡 패널을 그린다. melody를 빼면 저장 칸과 재료함이 없는 패널이다 */
function openFreeMelody(r: Rig, opts: { melody?: boolean; found?: string[] } = {}) {
  act(() => {
    expect(r.controller.openFree(installation('inst.village.ensemble-stage'))).toBe(true);
  });
  const creations = new Creations();
  const found = new FoundDiscoveries(opts.found ?? []);
  const melody = new FreeMelody({ controller: r.controller, creations, found, pieces: PIECES, nowIso: () => '2026-11-11T09:00:00.000Z' });
  const nav: NavApi = { close: () => undefined, go: () => undefined };
  const props = opts.melody === false ? { controller: r.controller } : { controller: r.controller, melody };
  const m = mount(h(NavContext.Provider, { value: nav }, h(SongPanel, props)));
  current = m;
  return { host: m.host, creations, found, melody };
}

const typeName = (host: HTMLElement, value: string): void => {
  const input = q<HTMLInputElement>(host, '.melody-name-input')!;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('자유 가락: 목표도 판정도 없다', () => {
  it('제목은 자유 가락이고 안내와 칩은 한 성부 4마디 4/4다. 목표 악보와 목표 줄과 배치 확인이 없다', () => {
    const r = newRig();
    const { host } = openFreeMelody(r);
    expect(text(q(host, 'h1'))).toBe('자유 가락');
    expect(text(q(host, '.subtitle'))).toBe(FREE_SUBTITLE);
    expect(qa(host, '.chips .chip').map((c) => text(c))).toEqual(['4/4박자', tempoText('quarter', 80), '한 성부', '가장 짧은 음 = 8분음표']);
    expect(qa(host, '.measure-button').map((b) => b.getAttribute('data-measure'))).toEqual(['0', '1', '2', '3']);
    expect(qa(host, '.song-voice')).toHaveLength(1);
    expect(qa(host, '.trow-target')).toHaveLength(0);
    expect(mine(host, 'v1')).toHaveLength(8);
    expect(text(q(host, '.song-voice .row-label'))).toBe('내 가락');
    // 악보는 내 가락 하나뿐이다
    expect(qa(host, 'svg.notation-svg')).toHaveLength(1);
    expect(q(host, '.score-pair-single')).not.toBeNull();
    expect(text(q(host, '.score-figure figcaption'))).toBe('내 가락 악보');
    expect(text(q(host, '.feedback-idle'))).toBe(FREE_IDLE_TEXT);
    // 판정 도구가 없다
    expect(() => button(host, '배치 확인')).toThrow();
    expect(() => button(host, '목표 듣기')).toThrow();
    expect(button(host, '내 가락 듣기')).toBeTruthy();
  });

  it('음을 놓으면 내 가락에 놓이고 시도는 남지 않는다. 확인 결과도 나오지 않는다', () => {
    const r = newRig();
    const { host } = openFreeMelody(r);
    pick(host, 'note', { value: 'quarter', pitch: 'E4' });
    click(blockAt(host, 'v1', 0));
    expect(r.controller.content().events).toHaveLength(1);
    expect(r.controller.attempts).toHaveLength(0);
    expect(r.controller.feedback).toBeNull();
    expect(q(host, '.feedback')!.getAttribute('data-feedback')).toBe('none');
  });

  it('저장 칸과 재료함은 melody를 받았을 때만 있다', () => {
    const none = openFreeMelody(newRig(), { melody: false });
    expect(q(none.host, '[data-melody-save]')).toBeNull();
    expect(q(none.host, '[data-melody-pieces]')).toBeNull();
    current?.unmount();
    const withTools = openFreeMelody(newRig());
    expect(q(withTools.host, '[data-melody-save]')).not.toBeNull();
    expect(q(withTools.host, '[data-melody-pieces]')).not.toBeNull();
  });

  it('과제 판본에서는 melody를 줘도 저장 칸과 재료함이 없다(자유 가락에서만 쓴다)', () => {
    const r = newRig();
    act(() => {
      r.controller.open(Q08, 'one-voice');
    });
    const melody = new FreeMelody({ controller: r.controller, creations: new Creations(), found: new FoundDiscoveries(), pieces: PIECES, nowIso: () => 'x' });
    const nav: NavApi = { close: () => undefined, go: () => undefined };
    const m = mount(h(NavContext.Provider, { value: nav }, h(SongPanel, { controller: r.controller, melody })));
    current = m;
    expect(q(m.host, '[data-melody-save]')).toBeNull();
    expect(q(m.host, '[data-melody-pieces]')).toBeNull();
    expect(targets(m.host, 'v1')).toHaveLength(4);
  });
});

describe('자유 가락: 내 곡으로 저장', () => {
  it('이름 칸에는 다음 기본 이름이 안내로 보이고 글자 수 제한이 있다', () => {
    const { host } = openFreeMelody(newRig());
    const input = q<HTMLInputElement>(host, '.melody-name-input')!;
    expect(input.placeholder).toBe('내 곡 1');
    expect(input.maxLength).toBe(CREATION_NAME_MAX);
    expect(text(q(host, '.melody-save'))).toContain("비워 두면 '내 곡 1'로 저장돼요");
  });

  it('음이 없으면 저장하지 않고 이유를 알린다. 상태 글은 화면 낭독기가 읽는다(role=status)', () => {
    const { host, creations } = openFreeMelody(newRig());
    click(q(host, '[data-melody-save-button]'));
    const status = q(host, '[data-melody-status]')!;
    expect(status.getAttribute('data-melody-status')).toBe('error');
    expect(status.getAttribute('role')).toBe('status');
    expect(text(status)).toBe(EMPTY_MELODY_MESSAGE);
    expect(creations.list()).toHaveLength(0);
  });

  it('저장 결과 글은 색만으로 알리지 않는다: 성공과 실패 모두 글 앞에 서로 다른 기호가 붙고, 기호는 낭독기에 읽히지 않는다 (7.9의 4번)', () => {
    const { host } = openFreeMelody(newRig());
    click(q(host, '[data-melody-save-button]'));
    const bad = q(host, '[data-melody-status]')!;
    const badIcon = bad.querySelector('svg.icon');
    expect(badIcon, '실패 글의 기호').not.toBeNull();
    expect(badIcon!.getAttribute('aria-hidden')).toBe('true');
    const badShape = badIcon!.querySelector('path')!.getAttribute('d');
    pick(host, 'note', { value: 'quarter', pitch: 'E4' });
    click(blockAt(host, 'v1', 0));
    click(q(host, '[data-melody-save-button]'));
    const ok = q(host, '[data-melody-status]')!;
    expect(ok.getAttribute('data-melody-status')).toBe('ok');
    const okIcon = ok.querySelector('svg.icon');
    expect(okIcon, '성공 글의 기호').not.toBeNull();
    expect(okIcon!.getAttribute('aria-hidden')).toBe('true');
    expect(okIcon!.querySelector('path')!.getAttribute('d')).not.toBe(badShape);
    // 기호는 글이 아니므로 읽히는 글은 문장 그대로다
    expect(text(ok)).toBe(ok.textContent!.trim());
  });

  it('이름을 적고 저장하면 내 곡이 쌓이고, 이름 칸은 비워지고, 다음 기본 이름이 앞으로 간다', () => {
    const r = newRig();
    const { host, creations } = openFreeMelody(r);
    pick(host, 'note', { value: 'quarter', pitch: 'E4' });
    click(blockAt(host, 'v1', 0));
    typeName(host, '아침 노래');
    click(q(host, '[data-melody-save-button]'));
    expect(creations.list().map((c) => [c.creationId, c.name, c.installationId])).toEqual([['creation-1', '아침 노래', 'inst.village.ensemble-stage']]);
    expect(q(host, '[data-melody-status]')!.getAttribute('data-melody-status')).toBe('ok');
    expect(text(q(host, '[data-melody-status]'))).toBe('아침 노래를 저장했어요. 무대에서 다시 들을 수 있어요.');
    expect(q<HTMLInputElement>(host, '.melody-name-input')!.value).toBe('');
    // 같은 가락을 또 저장하면 새로 만들지 않는다
    click(q(host, '[data-melody-save-button]'));
    expect(creations.list()).toHaveLength(1);
    expect(text(q(host, '[data-melody-status]'))).toBe('같은 가락이 이미 아침 노래로 저장되어 있어요.');
    // 놓은 음은 그대로다: 하나 더 놓으면 새 곡이 되고 이름 칸의 안내는 '내 곡 1'이다
    pick(host, 'note', { value: 'quarter', pitch: 'G4' });
    click(blockAt(host, 'v1', 960));
    click(q(host, '[data-melody-save-button]'));
    expect(creations.list().map((c) => c.name)).toEqual(['아침 노래', '내 곡 1']);
    expect(q<HTMLInputElement>(host, '.melody-name-input')!.placeholder).toBe('내 곡 2');
  });

  it('이름 칸에서 Enter를 누르면 저장한다(글자를 조합하는 중에는 아니다)', () => {
    const r = newRig();
    const { host, creations } = openFreeMelody(r);
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(blockAt(host, 'v1', 0));
    typeName(host, '엔터 곡');
    const input = q<HTMLInputElement>(host, '.melody-name-input')!;
    expect(keydown(input, 'Enter', { isComposing: true })).toBe(false);
    expect(creations.list()).toHaveLength(0);
    expect(keydown(input, 'Enter')).toBe(true);
    expect(creations.list().map((c) => c.name)).toEqual(['엔터 곡']);
  });

  it('저장할 수 없는 이름이면 저장하지 않고 이유를 알린다', () => {
    const r = newRig();
    const { host, creations } = openFreeMelody(r);
    pick(host, 'note', { value: 'quarter', pitch: 'C4' });
    click(blockAt(host, 'v1', 0));
    const input = q<HTMLInputElement>(host, '.melody-name-input')!;
    // maxLength는 입력 상자를 막을 뿐 값을 넣는 시험 도구는 막지 않으므로, 서비스의 검사가 한 번 더 막는지 본다
    typeName(host, '가'.repeat(CREATION_NAME_MAX + 1));
    expect(input.value.length).toBe(CREATION_NAME_MAX + 1);
    click(q(host, '[data-melody-save-button]'));
    expect(q(host, '[data-melody-status]')!.getAttribute('data-melody-status')).toBe('error');
    expect(creations.list()).toHaveLength(0);
  });
});

describe('자유 가락: 찾은 소리 조각 재료함', () => {
  it('아직 찾은 조각이 없으면 걷다 보면 찾는다고만 말하고 어디에 있는지는 말하지 않는다', () => {
    const { host } = openFreeMelody(newRig());
    const tray = q(host, '[data-melody-pieces]')!;
    expect(qa(tray, '[data-piece]')).toHaveLength(0);
    expect(text(tray)).toContain('마을을 걷다 보면 소리 조각을 찾을 수 있어요');
    expect(text(tray)).not.toMatch(/광장|동쪽|서쪽|남쪽|북쪽|좌표|근처/);
  });

  it('찾은 조각만 올라오고, 찾는 순간 다시 그려진다. 개념 쪽지는 올라오지 않는다', () => {
    const { host, found } = openFreeMelody(newRig(), { found: [P2] });
    expect(qa(host, '[data-piece]').map((li) => li.getAttribute('data-piece'))).toEqual([P2]);
    expect(text(q(host, `[data-piece="${P2}"]`))).toContain('바람결');
    expect(text(q(host, `[data-piece="${P2}"]`))).toContain('E4 D4 C4');
    act(() => void found.mark(P1));
    act(() => void found.mark('disc.village.note-1'));
    expect(qa(host, '[data-piece]').map((li) => li.getAttribute('data-piece'))).toEqual([P1, P2]);
  });

  it('놓기 단추는 지금 연 마디에 놓는다. 마디를 바꾸면 단추 이름의 마디도 바뀐다', () => {
    const r = newRig();
    const { host } = openFreeMelody(r, { found: [P1] });
    const place = () => q<HTMLButtonElement>(host, `[data-piece-place="${P1}"]`)!;
    expect(place().getAttribute('aria-label')).toBe('첫걸음을 1마디에 놓기');
    click(measureButton(host, 2));
    expect(place().getAttribute('aria-label')).toBe('첫걸음을 3마디에 놓기');
    click(place());
    expect(text(q(host, '[data-piece-note]'))).toBe('첫걸음을 3마디에 놓았어요.');
    expect(r.controller.content().events.filter((e) => e.measureIndex === 2)).toHaveLength(4);
    expect(r.controller.content().events.filter((e) => e.measureIndex !== 2)).toHaveLength(0);
    // 열려 있는 3마디의 내 가락 줄에 조각의 음 넷이 4분음표로 보인다
    expect(mine(host, 'v1').map((b) => b.getAttribute('aria-label'))).toEqual(['3마디 1박, C4 4분음표', '3마디 2박, D4 4분음표', '3마디 3박, E4 4분음표', '3마디 4박, G4 4분음표']);
  });

  it('조각을 놓은 뒤 실행 취소를 한 번 하면 놓기 전으로 돌아간다. 같은 마디에 다른 조각을 놓으면 바뀐다', () => {
    const r = newRig();
    const { host } = openFreeMelody(r, { found: [P1, P2] });
    click(q(host, `[data-piece-place="${P1}"]`));
    expect(r.controller.content().events).toHaveLength(4);
    click(q(host, `[data-piece-place="${P2}"]`));
    expect(r.controller.content().events).toHaveLength(3);
    act(() => r.controller.undo());
    expect(r.controller.content().events).toHaveLength(4);
    act(() => r.controller.undo());
    expect(r.controller.content().events).toHaveLength(0);
  });

  it('듣기 단추는 조각을 미리 들려 준다. 도전은 그대로다', () => {
    const r = newRig();
    const { host } = openFreeMelody(r, { found: [P1] });
    expect(r.controller.previewing).toBe(false);
    click(q(host, `[data-piece-hear="${P1}"]`));
    expect(r.controller.previewing).toBe(true);
    expect(r.controller.isFree).toBe(true);
    expect(q(host, `[data-piece-hear="${P1}"]`)!.getAttribute('aria-label')).toBe('첫걸음 듣기');
  });
});
