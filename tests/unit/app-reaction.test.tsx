// @vitest-environment jsdom
// 4-4 세계 반응의 화면: 왼쪽 위 '합주 ○층', 새로 생긴 것을 사실 문장으로 잠깐 알리기(낭독기에도), 월드에 알리는 등불 값.
// 월드(Phaser)는 가짜다. 진짜 월드에서 등불이 그려지는지는 tests/flow/reaction.flow.ts가 본다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import { placeOnStaffEdit, staffSlotsOf } from '@/domain/challenge';
import type { AttemptResult } from '@/domain/attempt';
import { NEWS_SECONDS } from '@/ui/hud/Hud';
import { bootApp, cleanupApps, flush } from './app-rig';
import { Q01, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => {
  vi.useRealTimers();
  cleanupApps();
});

const pass = (questId: string): AttemptResult =>
  makeAttemptResult({
    attemptId: `a-${questId}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);

const newsLines = (host: HTMLElement): string[] => qa(host, '[data-news] p').map((p) => text(p));

describe('왼쪽 위 합주 층수(6.3, 7.6)', () => {
  it('처음에는 합주 0층이다. 지역 이름 아래에 있고, 소식 자리는 비어 있다', async () => {
    const t = await bootApp('');
    const chip = q(t.host, '.hud-ensemble')!;
    expect(text(chip)).toBe('합주 0층');
    expect(chip.getAttribute('data-ensemble')).toBe('0');
    expect(chip.closest('.hud-corner')).toBe(q(t.host, '.hud-region')!.closest('.hud-corner'));
    expect(newsLines(t.host)).toEqual([]);
  });

  it('통과 기록이 있으면 층수가 처음부터 맞게 보이고, 이미 있던 것은 소식으로 알리지 않는다', async () => {
    const t = await bootApp('', { attempts: [pass(Q01)] });
    expect(Number(q(t.host, '.hud-ensemble')!.getAttribute('data-ensemble'))).toBeGreaterThan(0);
    expect(text(q(t.host, '.hud-ensemble'))).toMatch(/^합주 [1-9]\d*층$/);
    expect(newsLines(t.host)).toEqual([]);
  });

  it('누르는 것이 없다: 단추나 링크가 아니라 월드의 누르기를 막지 않는 글자다', async () => {
    const t = await bootApp('');
    const corner = q(t.host, '.hud-corner')!;
    expect(corner.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  });
});

describe('새 소식(W-9: 사실만 말한다)', () => {
  it('재료를 놓아 등불이 켜지면 그 사실을 알리고, 정해진 시간 뒤에 거둔다', async () => {
    const t = await bootApp('');
    vi.useFakeTimers();
    act(() => void t.ctx.visited.mark(['H4']));
    expect(newsLines(t.host)).toEqual(['음계 디딤돌의 등불이 켜졌어요.']);
    // 낭독기: 나타나는 글을 읽는 영역(status, polite)이 그 자리에 미리 있었다
    const region = q(t.host, '[data-news]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    act(() => void vi.advanceTimersByTime(NEWS_SECONDS * 1000 - 1));
    expect(newsLines(t.host)).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(2));
    expect(newsLines(t.host)).toEqual([]);
    expect(q(t.host, '[data-news]')).toBe(region); // 영역은 그대로 있다
    expect(t.ctx.reaction.pending.get()).toEqual([]); // 화면이 가져갔다
  });

  it('실제로 통과하면 꽃등, 지역의 소리 층, 합주 층수가 오른 것을 알리고 합주 층수 칩이 바뀐다. 틀린 시도는 아무것도 바꾸지 않는다', async () => {
    const t = await bootApp('');
    act(() => void t.ctx.controller.open(Q01, 'middle-c'));
    const slots = staffSlotsOf(t.ctx.controller.current!.def);
    // 높은음자리표 맨 아랫줄(E4)에 놓으면 틀린다. 그 사이 재료를 놓았으므로 등불은 먼저 켜진다
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, 0)));
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[1]!, 10)));
    act(() => void t.ctx.controller.check());
    expect(newsLines(t.host).some((l) => l.endsWith('의 등불이 켜졌어요.'))).toBe(true);
    expect(newsLines(t.host).some((l) => l.includes('꽃등'))).toBe(false);
    expect(text(q(t.host, '.hud-ensemble'))).toBe('합주 0층');
    // 아래 첫 덧줄(C4)로 고치면 통과한다
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, -2)));
    act(() => void t.ctx.controller.check());
    const lines = newsLines(t.host);
    expect(lines.some((l) => l === `${t.ctx.world.map.station('H1')!.name}의 등불이 꽃등이 되었어요.`)).toBe(true);
    expect(lines).toContain('음악 마을의 소리가 1층이 되었어요.');
    expect(lines.at(-1)).toMatch(/^합주 [1-9]\d*층이 되었어요\.$/);
    expect(text(q(t.host, '.hud-ensemble'))).toMatch(/^합주 [1-9]\d*층$/);
    for (const l of lines) expect(l).not.toMatch(/잘했|훌륭|축하|대단|최고/);
    // 그 뒤에 틀려도 그대로다(W-6)
    const level = text(q(t.host, '.hud-ensemble'));
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, 0)));
    act(() => void t.ctx.controller.check());
    expect(t.ctx.controller.attempts.at(-1)!.resultType).not.toBe('passed');
    expect(text(q(t.host, '.hud-ensemble'))).toBe(level);
  });

  it('패널에 있는 동안 생긴 소식은 월드로 돌아오면 보인다', async () => {
    const t = await bootApp('#/q/rhythm.rest-in-a-bar/quarter-rest');
    expect(q(t.host, '.hud')).toBeNull();
    act(() => void t.ctx.visited.mark(['H2']));
    expect(t.ctx.reaction.pending.get().length).toBeGreaterThan(0);
    act(() => {
      t.win.location.hash = '#/';
    });
    await flush();
    expect(newsLines(t.host).some((l) => l.endsWith('의 등불이 켜졌어요.'))).toBe(true);
    expect(t.ctx.reaction.pending.get()).toEqual([]);
  });

  it('소식이 여러 개면 한 영역에 차례로 보인다', async () => {
    const t = await bootApp('');
    act(() => void t.ctx.visited.mark(['H1']));
    act(() => void t.ctx.visited.mark(['H2']));
    expect(newsLines(t.host)).toHaveLength(2);
  });
});

describe('월드에 알리는 등불', () => {
  it('다리의 lanterns 값이 모든 정거장을 가지고, 놓으면 켜짐으로 바뀐다', async () => {
    const t = await bootApp('');
    const before = t.ctx.world.bridge.lanterns.get();
    expect(Object.keys(before)).toHaveLength(t.ctx.world.map.stations.length);
    expect(new Set(Object.values(before))).toEqual(new Set(['off']));
    const seen: Array<Record<string, string>> = [];
    t.ctx.world.bridge.lanterns.subscribe((l) => seen.push({ ...l }));
    act(() => void t.ctx.visited.mark(['K3']));
    expect(t.ctx.world.bridge.lanterns.get().K3).toBe('on');
    expect(seen).toHaveLength(1);
  });
});
