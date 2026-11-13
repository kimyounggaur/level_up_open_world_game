// @vitest-environment jsdom
// 7-6 주민(악사)이 앱에서 하는 일: 월드가 말을 걸었다고 알리면(open-resident) 한 줄을 말하는 카드를 띄우고(떠 있는 동안 월드는 멈춘다),
// 추천이면 그 도전을 열 수 있게 하고, 연주하는 주민(그 지역의 층이 1 이상)을 월드 다리에 알린다. 말하는 것은 저장에 적지 않고 아무것도 열거나 닫지 않는다.
// 월드(Phaser)는 가짜다. 진짜 월드에서 말을 거는 일은 tests/flow/phase7-residents.flow.ts가 본다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeAttemptResult } from '@/domain/attempt';
import type { AttemptResult } from '@/domain/attempt';
import { placeOnStaffEdit, staffSlotsOf } from '@/domain/challenge';
import { ContentCatalog } from '@/domain/catalog';
import { RESIDENTS } from '@/domain/residents';
import { bootApp, cleanupApps } from './app-rig';
import type { QuestDefinition } from '@/domain/content';
import { Q01, Q02, Q07, button, click, q, quest, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => {
  vi.useRealTimers();
  cleanupApps();
});

type Booted = Awaited<ReturnType<typeof bootApp>>;

const pass = (questId: string): AttemptResult =>
  makeAttemptResult({
    attemptId: `a-${questId}`,
    questId,
    variantId: 'v',
    contentVersion: '0.1.0',
    evaluation: { type: 'x', evaluator: 'orderedScale', evaluatorVersion: '1', passed: true, issues: [], facts: {} },
    context: { tempoBpm: 80, originalTempoBpm: 80, assistUsed: false, soundState: 'on', soundPlayed: true },
  } as never);

const resident = (regionId: string) => RESIDENTS.find((r) => r.regionId === regionId)!;
/** 월드가 주민에게 말을 걸었다고 알린다 */
const talk = (t: Booted, residentId: string): void => {
  act(() => t.ctx.world.bridge.events.send({ type: 'open-resident', residentId }));
};
const card = (t: Booted): HTMLElement | null => q(t.host, '[data-resident-card]');
const line = (t: Booted): string => text(q(card(t)!, '[data-resident-line]'));

describe('주민에게 말을 걸면(7-6)', () => {
  it('한 줄을 말하는 카드가 뜬다: 이름, 말, 닫기. 떠 있는 동안 월드는 멈추고 뒤의 화면은 눌리지 않는다', async () => {
    const t = await bootApp('');
    const r = resident('village');
    expect(card(t)).toBeNull();
    talk(t, r.residentId);

    const c = card(t)!;
    expect(c).not.toBeNull();
    expect(c.getAttribute('data-resident-card')).toBe(r.residentId);
    expect(text(q(c, 'h1'))).toBe('음악 마을의 화음 악사');
    expect(q(c, '[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(true);
    // 닫기 단추에 초점이 가 있다(키보드로 바로 닫을 수 있다)
    expect(document.activeElement).toBe(button(c, '닫기'));
    // 대화의 선택지가 없다: 단추는 닫기뿐이고 링크는 추천한 도전뿐이다
    expect(c.querySelectorAll('button')).toHaveLength(1);
    expect([...c.querySelectorAll('a')].every((a) => a.hasAttribute('data-related'))).toBe(true);
  });

  it('말은 그 지역의 추천 한 줄이다: 마을은 음자리 작업대의 첫 과제와 추천의 이유를 말한다', async () => {
    const t = await bootApp('');
    talk(t, resident('village').residentId);
    expect(line(t)).toBe("'같은 음의 자리 찾기'는 음자리 작업대에 있어요. 지금 있는 음악 마을에서 아직 열어 보지 않은 도전이에요.");
    expect(q(card(t)!, '[data-resident-line]')!.getAttribute('data-say')).toBe('recommendation');
  });

  it('추천한 도전을 열 수 있으면 그 주소와 이름을 단 링크가 있다. 따라가면 카드는 사라진다', async () => {
    const t = await bootApp('');
    talk(t, resident('village').residentId);
    const link = q<HTMLAnchorElement>(card(t)!, '[data-related]')!;
    expect(link.getAttribute('href')).toBe(ContentCatalog.hashFor(Q01, 'middle-c'));
    expect(link.getAttribute('aria-label')).toBe('추천한 도전 열기: 같은 음의 자리 찾기');
    expect(link.getAttribute('aria-label')).toContain(text(link));
    act(() => {
      t.win.location.hash = link.getAttribute('href')!;
    });
    expect(card(t)).toBeNull();
    expect(text(q(t.host, 'h1'))).toBe('같은 음의 자리 찾기');
  });

  it('그 지역에 열어 보지 않은 과제가 없으면 층의 사실만 말한다. 링크는 없다', async () => {
    // 박자 강가: 이 판에는 Q02(첫 징검다리)만 있다. 열어 보았다
    const t = await bootApp('', { opened: ['rhythm.rest-in-a-bar'] });
    talk(t, resident('beat-river').residentId);
    expect(line(t)).toBe('박자 강가에서 도전을 하나 통과하면 합주에 타악이 더해져요.');
    expect(q(card(t)!, '[data-resident-line]')!.getAttribute('data-say')).toBe('layer');
    expect(q(card(t)!, '[data-related]')).toBeNull();
  });

  it('과제가 없는 지역의 주민은 층의 사실을 말한다(종나무 숲: 이 판에는 화음 과제가 없다)', async () => {
    const t = await bootApp('');
    talk(t, resident('bell-grove').residentId);
    expect(line(t)).toBe('종나무 숲에서 도전을 하나 통과하면 합주에 베이스가 더해져요.');
  });

  it('층이 오른 지역의 주민은 몇 층인지를 말한다: Q01을 통과했고 마을과 오선 언덕의 과제를 모두 열어 보았다', async () => {
    const t = await bootApp('', { attempts: [pass(Q01)], opened: [Q01, 'rhythm.rest-in-a-bar', 'scale.major'] });
    talk(t, resident('staff-hill').residentId);
    expect(line(t)).toBe('합주에 가락이 1층으로 더해져 있어요.');
  });

  it('말을 걸어도 저장할 것이 생기지 않는다: 열어 본 과제, 찾은 것, 시도 기록, 사용 기록이 그대로다. 주소도 그대로다', async () => {
    const t = await bootApp('');
    const before = JSON.stringify({ opened: [...t.ctx.opened.store.get()], found: [...t.ctx.found.store.get()], attempts: t.ctx.controller.attempts.length, log: t.ctx.usageLog.snapshot().events.length });
    talk(t, resident('staff-hill').residentId);
    talk(t, resident('village').residentId);
    expect(JSON.stringify({ opened: [...t.ctx.opened.store.get()], found: [...t.ctx.found.store.get()], attempts: t.ctx.controller.attempts.length, log: t.ctx.usageLog.snapshot().events.length })).toBe(before);
    expect(t.win.location.hash).toBe('');
  });

  it('이 판에 없는 id의 사건은 무시한다: 카드가 뜨지 않고 월드는 멈추지 않는다', async () => {
    const t = await bootApp('');
    talk(t, 'resident.nowhere');
    expect(card(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });
});

describe('정식 공개(release) 채널의 주민(7-6이 8-5로 넘긴 일)', () => {
  // 실제 월드에서 주민에게 걸어가 말을 거는 길은 채널과 상관없다(tests/flow/phase7-residents.flow.ts). 채널이 바꾸는 것은 '무엇을 추천하고 링크로 열어 주는가'이고, 이 시험이 앱 전체와 실제 과제 파일로 본다.
  const published = (id: string): QuestDefinition => ({ ...quest(id), availability: 'published' }) as QuestDefinition;

  it('열 수 있는 도전이 하나도 없으면(지금 내용: 모두 검수 전) 여섯 주민 모두 층의 사실만 말하고, 도전의 이름도 링크도 없다', async () => {
    const t = await bootApp('', { channel: 'release' });
    for (const r of RESIDENTS) {
      talk(t, r.residentId);
      const c = card(t)!;
      expect(q(c, '[data-resident-line]')!.getAttribute('data-say'), r.residentId).toBe('layer');
      expect(q(c, '[data-related]'), `${r.residentId}의 링크`).toBeNull();
      expect(line(t), r.residentId).toMatch(/합주에 .*(더해져|더해져요)/);
      for (const def of [Q01, Q02, Q07]) expect(line(t), `${r.residentId}가 ${def}의 이름을 말한다`).not.toContain(quest(def).title);
    }
  });

  it('같은 판에서 미리보기 채널은 추천한다(대조): 마을 주민이 첫 과제를 말하고 링크가 있다', async () => {
    const t = await bootApp('');
    talk(t, resident('village').residentId);
    expect(q(card(t)!, '[data-resident-line]')!.getAttribute('data-say')).toBe('recommendation');
    expect(q(card(t)!, '[data-related]')).not.toBeNull();
  });

  it('공개한 도전만 추천한다: 첫 과제(Q01)는 검수 전이라 건너뛰고 공개한 Q02를 말하며, 링크는 Q02의 주소다', async () => {
    const t = await bootApp('', { channel: 'release', definitions: [quest(Q01), published(Q02), quest(Q07)] });
    talk(t, resident('village').residentId);
    const c = card(t)!;
    expect(q(c, '[data-resident-line]')!.getAttribute('data-say')).toBe('recommendation');
    expect(line(t)).toContain('쉼이 있는 한 마디');
    expect(line(t)).not.toContain('같은 음의 자리 찾기');
    const link = q<HTMLAnchorElement>(c, '[data-related]')!;
    expect(link.getAttribute('href')).toBe(ContentCatalog.hashFor(Q02, 'quarter-rest'));
    // 링크를 따라가면 실제로 열린다(준비 중 안내가 아니다)
    act(() => {
      t.win.location.hash = link.getAttribute('href')!;
    });
    expect(card(t)).toBeNull();
    expect(text(q(t.host, 'h1'))).toBe('쉼이 있는 한 마디');
    expect(q(t.host, '[role="alert"]')).toBeNull();
  });

  it('공개한 도전을 이미 열어 보았으면 다시 추천하지 않고 층의 사실을 말한다', async () => {
    const t = await bootApp('', { channel: 'release', definitions: [quest(Q01), published(Q02), quest(Q07)], opened: [Q02] });
    talk(t, resident('village').residentId);
    expect(q(card(t)!, '[data-resident-line]')!.getAttribute('data-say')).toBe('layer');
    expect(q(card(t)!, '[data-related]')).toBeNull();
  });
});

describe('카드를 닫는 법', () => {
  it('Esc로 닫으면 카드가 사라지고 월드가 다시 움직인다. 주소는 그대로다', async () => {
    const t = await bootApp('');
    talk(t, resident('village').residentId);
    expect(t.ctx.world.bridge.pause.get()).toBe(true);
    t.press('Escape');
    expect(card(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
    expect(q(t.host, '.hud')!.hasAttribute('inert')).toBe(false);
    expect(t.win.location.hash).toBe('');
  });

  it('닫기 단추로도 닫는다', async () => {
    const t = await bootApp('');
    talk(t, resident('staff-hill').residentId);
    click(button(card(t)!, '닫기'));
    expect(card(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it('카드가 떠 있는 채로 지도(M)로 가면 카드는 닫히고, 지도를 닫아 돌아오면 다시 뜨지 않는다', async () => {
    const t = await bootApp('');
    talk(t, resident('village').residentId);
    t.press('KeyM');
    expect(card(t)).toBeNull();
    expect(t.win.location.hash).toBe('#/map');
    t.press('Escape');
    expect(q(t.host, '.hud')).not.toBeNull();
    expect(card(t)).toBeNull();
    expect(t.ctx.world.bridge.pause.get()).toBe(false);
  });

  it('같은 주민에게 다시 말을 걸면 카드가 다시 뜬다. 다른 주민에게 걸면 그 주민의 말로 바뀐다', async () => {
    const t = await bootApp('');
    talk(t, resident('village').residentId);
    t.press('Escape');
    talk(t, resident('village').residentId);
    expect(card(t)).not.toBeNull();
    talk(t, resident('staff-hill').residentId);
    expect(card(t)!.getAttribute('data-resident-card')).toBe('resident.staff-hill');
    expect(text(q(card(t)!, 'h1'))).toBe('오선 언덕의 가락 악사');
  });
});

describe('연주하는 주민을 월드에 알린다(그 지역의 층이 1 이상)', () => {
  it('처음에는 아무도 연주하지 않는다', async () => {
    const t = await bootApp('');
    expect(t.ctx.world.bridge.residents.get()).toEqual([]);
  });

  it('통과 기록이 있으면 처음부터 맞게 알린다: Q01은 마을과 오선 언덕의 정거장에 놓여 있다', async () => {
    const t = await bootApp('', { attempts: [pass(Q01)] });
    expect(t.ctx.world.bridge.residents.get()).toEqual(['resident.village', 'resident.staff-hill']);
  });

  it('새로 통과하면 그 지역의 주민이 연주하기 시작한다. 그 뒤에 틀려도 그대로다(더해질 뿐, W-6)', async () => {
    const t = await bootApp('');
    act(() => void t.ctx.controller.open(Q01, 'middle-c'));
    const slots = staffSlotsOf(t.ctx.controller.current!.def);
    // 높은음자리표 맨 아랫줄(E4)에 놓으면 틀린다: 아직 아무도 연주하지 않는다
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, 0)));
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[1]!, 10)));
    act(() => void t.ctx.controller.check());
    expect(t.ctx.world.bridge.residents.get()).toEqual([]);
    // 아래 첫 덧줄(C4)로 고치면 통과한다: Q01이 놓인 마을과 오선 언덕의 주민이 연주한다
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, -2)));
    act(() => void t.ctx.controller.check());
    expect(t.ctx.world.bridge.residents.get()).toEqual(['resident.village', 'resident.staff-hill']);
    // 그 뒤에 틀려도 그대로다
    act(() => t.ctx.controller.edit(placeOnStaffEdit(slots[0]!, 0)));
    act(() => void t.ctx.controller.check());
    expect(t.ctx.controller.attempts.at(-1)!.resultType).not.toBe('passed');
    expect(t.ctx.world.bridge.residents.get()).toEqual(['resident.village', 'resident.staff-hill']);
  });

  it('이 값은 반응 저장소의 지역 층에서 나온다: 지역의 층이 1 이상인 지역의 주민이 모두 들어 있다', async () => {
    const t = await bootApp('', { attempts: [pass(Q01)] });
    const layers = t.ctx.reaction.store.get().regionLayers;
    const expected = RESIDENTS.filter((r) => layers[r.regionId] >= 1).map((r) => r.residentId);
    expect(t.ctx.world.bridge.residents.get()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });
});
