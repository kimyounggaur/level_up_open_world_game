// @vitest-environment jsdom
// 설정의 '사용 기록' 구역(설계서 10.9, 13.2): 무엇을 적는지 말해 주고, 끄고 켜고, 파일로 내보내고, 한 번 더 묻고 지운다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, cleanupApps, flush } from './app-rig';
import { Store } from '@/platform/bridge';
import type { UsageLogStatus } from '@/platform/log';
import { USAGE_NOT_RECORDED, USAGE_RECORDED, UsageLogSection, statusLine } from '@/ui/overlay/UsageLogSection';
import { button, click, mount, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const m of mounted.splice(0)) m();
  cleanupApps();
});

const status = (over: Partial<UsageLogStatus> = {}): Store<UsageLogStatus> => new Store<UsageLogStatus>({ enabled: true, count: 12, dropped: 0, backend: 'indexeddb', phase: 'idle', problem: null, ...over });

const flushAll = (): Promise<void> => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

function section(over: Partial<Parameters<typeof UsageLogSection>[0]> = {}, st = status()) {
  const downloads: Array<{ fileName: string; text: string }> = [];
  const toggles: boolean[] = [];
  let cleared = 0;
  const m = mount(
    <UsageLogSection
      status={st}
      onToggle={(on) => void toggles.push(on)}
      exportFile={() => ({ fileName: 'usage.json', text: '{"events":[]}' })}
      onClear={async () => void cleared++}
      download={(fileName, t) => downloads.push({ fileName, text: t })}
      {...over}
    />,
  );
  mounted.push(m.unmount);
  return { host: m.host, st, downloads, toggles, cleared: () => cleared };
}

describe('무엇을 적고 무엇을 적지 않는지(10.9)', () => {
  it('이 기기에만 쌓이고 내보낼 때만 밖으로 나간다고 말한다', () => {
    const a = section();
    expect(text(q(a.host, 'h2'))).toBe('사용 기록');
    expect(text(q(a.host, '.settings-note'))).toMatch(/이 기기에만 쌓이고 어디로도 보내지 않아요.*내보낼 때만 밖으로 나가요/);
  });

  it('적는 것에 13.2의 사건 종류가 모두 말로 들어 있다', () => {
    const a = section();
    const recorded = text(q(a.host, '[data-testid="usage-recorded"]'));
    expect(recorded).toContain('적는 것');
    for (const word of ['걷기', '지도', '목록', '수첩', '주소', '도움을 연 것', '원래 도전으로 돌아온 것', '놓은 것을 고친 것', '다시 들은 것', '확인한 결과', '돌을 밟은 것']) {
      expect(recorded, word).toContain(word);
    }
    expect(recorded).toContain(USAGE_RECORDED);
  });

  it('적지 않는 것에 이름, 연락처, 생년월일, 녹음, 놓은 음의 내용이 들어 있다', () => {
    const a = section();
    const not = text(q(a.host, '[data-testid="usage-not-recorded"]'));
    expect(not).toContain('적지 않는 것');
    for (const word of ['이름', '연락처', '생년월일', '녹음', '놓은 음의 내용']) expect(not, word).toContain(word);
    expect(not).toContain(USAGE_NOT_RECORDED);
  });

  it('적는 것의 글에 적지 않는 것이 섞여 있지 않다', () => {
    for (const word of ['이름', '연락처', '생년월일', '녹음']) expect(USAGE_RECORDED).not.toContain(word);
  });
});

describe('상태 문장', () => {
  const base = status().get();
  it('기록이 없을 때와 쌓였을 때, 한도가 찼을 때, 끈 때를 가른다', () => {
    expect(statusLine({ ...base, count: 0 })).toBe('아직 쌓인 기록이 없어요.');
    expect(statusLine({ ...base, count: 0, enabled: false })).toBe('아직 쌓인 기록이 없고, 지금은 쌓지 않아요.');
    expect(statusLine({ ...base, count: 7 })).toBe('기록 7건이 쌓여 있어요.');
    expect(statusLine({ ...base, count: 3000, dropped: 120 })).toBe('기록 3000건이 쌓여 있어요. 한도가 차서 오래된 120건은 지웠어요.');
    expect(statusLine({ ...base, count: 7, enabled: false })).toBe('기록 7건이 쌓여 있어요. 지금은 더 쌓지 않아요.');
  });

  it('상태가 바뀌면 화면이 따라 바뀐다', () => {
    const a = section({}, status({ count: 2 }));
    expect(text(q(a.host, '[data-testid="usage-status"]'))).toBe('기록 2건이 쌓여 있어요.');
    act(() => a.st.set({ ...a.st.get(), count: 5 }));
    expect(text(q(a.host, '[data-testid="usage-status"]'))).toBe('기록 5건이 쌓여 있어요.');
  });

  it('구역에 켜짐과 저장소 종류가 표시로 붙는다', () => {
    const a = section({}, status({ enabled: false, backend: 'memory' }));
    const el = q(a.host, '#set-usage')!.closest('section')!;
    expect(el.getAttribute('data-usage-enabled')).toBe('off');
    expect(el.getAttribute('data-usage-backend')).toBe('memory');
  });
});

describe('기록 남기기', () => {
  it('켜져 있으면 켜짐이고, 누르면 끄라고 알린다. 꺼져 있으면 켜라고 알린다', () => {
    const a = section();
    const sw = q(a.host, '#set-usage-on')!;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    click(sw);
    expect(a.toggles).toEqual([false]);
    act(() => a.st.set({ ...a.st.get(), enabled: false }));
    expect(q(a.host, '#set-usage-on')!.getAttribute('aria-checked')).toBe('false');
    click(q(a.host, '#set-usage-on'));
    expect(a.toggles).toEqual([false, true]);
  });

  it('스위치에 이름과 설명이 이어져 있다', () => {
    const a = section();
    const sw = q(a.host, '#set-usage-on')!;
    expect(text(q(a.host, `#${sw.getAttribute('aria-labelledby')}`))).toBe('기록 남기기');
    expect(text(q(a.host, `#${sw.getAttribute('aria-describedby')}`))).toContain('이미 쌓인 기록은 그대로예요');
  });
});

describe('내보내기', () => {
  it('파일을 내려받게 하고 파일 이름을 알려 준다', () => {
    const a = section();
    click(button(a.host, '기록 내보내기'));
    expect(a.downloads).toEqual([{ fileName: 'usage.json', text: '{"events":[]}' }]);
    expect(text(q(a.host, '.save-note'))).toContain('usage.json');
    expect(q(a.host, '.save-note')!.getAttribute('role')).toBe('status');
    expect(q(a.host, '.save-note')!.getAttribute('data-kind')).toBe('ok');
  });

  it('쌓인 기록이 없으면 내보내기와 지우기를 누를 수 없다', () => {
    const a = section({}, status({ count: 0 }));
    expect(button(a.host, '기록 내보내기').disabled).toBe(true);
    expect(button(a.host, '기록 지우기').disabled).toBe(true);
    act(() => a.st.set({ ...a.st.get(), count: 1 }));
    expect(button(a.host, '기록 내보내기').disabled).toBe(false);
    expect(button(a.host, '기록 지우기').disabled).toBe(false);
  });

  it('끄고 있어도 쌓인 기록은 내보낼 수 있다', () => {
    const a = section({}, status({ enabled: false, count: 4 }));
    click(button(a.host, '기록 내보내기'));
    expect(a.downloads).toHaveLength(1);
  });

  it('파일을 만들다 던져도 화면이 깨지지 않고 이유를 알린다', () => {
    const a = section({
      exportFile: () => {
        throw new Error('만들 수 없어요');
      },
    });
    click(button(a.host, '기록 내보내기'));
    expect(text(q(a.host, '.save-note'))).toContain('내보내지 못했어요: 만들 수 없어요');
    expect(q(a.host, '.save-note')!.getAttribute('data-kind')).toBe('error');
  });
});

describe('지우기', () => {
  it('누르면 한 번 더 묻고 초점을 결정 단추로 옮긴다. 묻는 동안 지우기 단추는 잠긴다. 아직 지우지 않았다', () => {
    const a = section();
    click(button(a.host, '기록 지우기'));
    const confirm = q(a.host, '.save-confirm')!;
    expect(confirm.getAttribute('role')).toBe('group');
    expect(text(confirm)).toContain('쌓인 기록을 모두 지울까요?');
    expect(text(confirm)).toContain('진행(저장)에는 영향이 없어요');
    expect(document.activeElement).toBe(button(confirm, '모두 지우기'));
    expect(button(a.host, '기록 지우기').disabled).toBe(true);
    expect(a.cleared()).toBe(0);
  });

  it('취소하면 아무것도 지우지 않는다', () => {
    const a = section();
    click(button(a.host, '기록 지우기'));
    click(button(a.host, '취소'));
    expect(q(a.host, '.save-confirm')).toBeNull();
    expect(a.cleared()).toBe(0);
    expect(button(a.host, '기록 지우기').disabled).toBe(false);
  });

  it('모두 지우기를 누르면 지우고, 진행은 그대로라고 알린다', async () => {
    const a = section();
    click(button(a.host, '기록 지우기'));
    click(button(a.host, '모두 지우기'));
    await flushAll();
    expect(a.cleared()).toBe(1);
    expect(q(a.host, '.save-confirm')).toBeNull();
    expect(text(q(a.host, '.save-note'))).toContain('기록을 모두 지웠어요. 진행은 그대로예요.');
    expect(q(a.host, '.save-note')!.getAttribute('data-kind')).toBe('ok');
  });

  it('지우기가 실패하면 이유를 알리고 확인 단계에 남는다', async () => {
    const a = section({
      onClear: async () => {
        throw new Error('저장소가 응답하지 않아요');
      },
    });
    click(button(a.host, '기록 지우기'));
    click(button(a.host, '모두 지우기'));
    await flushAll();
    expect(text(q(a.host, '.save-note'))).toContain('지우지 못했어요: 저장소가 응답하지 않아요');
    expect(q(a.host, '.save-note')!.getAttribute('data-kind')).toBe('error');
    expect(q(a.host, '.save-confirm')).not.toBeNull();
    expect(button(a.host, '모두 지우기').disabled).toBe(false); // 다시 시도할 수 있다
  });

  it('지우는 중에 한 번 더 눌러도 한 번만 지운다', async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    const a = section({
      onClear: () => {
        calls++;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    click(button(a.host, '기록 지우기'));
    click(button(a.host, '모두 지우기'));
    expect(button(a.host, '모두 지우기').disabled).toBe(true);
    expect(button(a.host, '취소').disabled).toBe(true);
    click(button(a.host, '모두 지우기')); // 잠긴 단추를 다시 눌러도
    expect(calls).toBe(1);
    release();
    await flushAll();
    expect(q(a.host, '.save-confirm')).toBeNull();
  });
});

describe('문제를 알린다', () => {
  it('저장소를 쓸 수 없으면 창을 닫으면 사라진다고 기호와 글자로 알린다', () => {
    const a = section({}, status({ backend: 'memory' }));
    const p = q(a.host, '.save-problem')!;
    expect(text(p)).toMatch(/저장소를 쓸 수 없어요.*사라져요.*내보내 두세요/);
    expect(p.getAttribute('role')).toBe('status');
    expect(q(p, 'svg')).not.toBeNull(); // 색만으로 말하지 않는다
  });

  it('저장소가 정상이면 경고가 없다', () => {
    expect(q(section().host, '.save-problem')).toBeNull();
  });

  it('상태에 문제 문장이 있으면 그대로 보여 준다', () => {
    const a = section({}, status({ problem: '지난 기록을 읽을 수 없어 새로 시작했어요.' }));
    expect(text(q(a.host, '.save-problem'))).toContain('지난 기록을 읽을 수 없어 새로 시작했어요.');
  });

  it('저장소가 없고 문제도 있으면 두 문장이 따로 나온다', () => {
    const a = section({}, status({ backend: 'memory', problem: '저장하지 못했어요: x' }));
    expect(qa(a.host, '.save-problem')).toHaveLength(2);
  });
});

describe('이름과 키보드', () => {
  it('누르는 곳은 모두 이름이 있는 단추이다', () => {
    const a = section();
    click(button(a.host, '기록 지우기'));
    const buttons = qa(a.host, 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const b of buttons) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
  });

  it('구역은 제목으로 이름이 붙은 영역이다', () => {
    const a = section();
    const el = q(a.host, 'section')!;
    expect(el.getAttribute('aria-labelledby')).toBe('set-usage');
  });
});

describe('앱 안의 설정 화면', () => {
  it('설정 맨 아래에 사용 기록 구역이 있고, 실제 기록에 이어져 있다(켜고 끄고 지운다)', async () => {
    const t = await bootApp('#/settings');
    const sec = q(t.host, '#set-usage')!.closest('section')!;
    expect(sec).not.toBeNull();
    // 시작 사건 하나가 쌓여 있다
    expect(text(q(sec, '[data-testid="usage-status"]'))).toBe('기록 1건이 쌓여 있어요.');
    // 끄면 새 사건이 쌓이지 않고 표시가 바뀐다
    click(q(sec, '#set-usage-on'));
    expect(t.ctx.usageLog.enabled).toBe(false);
    expect(q(sec, '#set-usage-on')!.getAttribute('aria-checked')).toBe('false');
    act(() => t.ctx.usage.discoveryFound('x'));
    expect(t.ctx.usageLog.snapshot().events).toHaveLength(1);
    // 켜면 다시 쌓인다
    click(q(sec, '#set-usage-on'));
    act(() => t.ctx.usage.discoveryFound('x'));
    expect(t.ctx.usageLog.snapshot().events).toHaveLength(2);
    expect(text(q(sec, '[data-testid="usage-status"]'))).toBe('기록 2건이 쌓여 있어요.');
    // 지우기
    click(button(sec, '기록 지우기'));
    click(button(sec, '모두 지우기'));
    await flush();
    await flushAll();
    expect(t.ctx.usageLog.snapshot().events).toHaveLength(0);
    expect(text(q(sec, '[data-testid="usage-status"]'))).toBe('아직 쌓인 기록이 없어요.');
  });
});
