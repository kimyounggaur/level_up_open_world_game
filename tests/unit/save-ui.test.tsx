// @vitest-environment jsdom
// 설정의 '저장' 구역(7.8, 10.6)과 저장 문제 알림 띠: 상태를 말해 주고, 내보내고, 가져오기 전에 한 번 더 묻는다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeStorage } from '@/app/boot';
import { emptySave, serializeSave } from '@/domain/save/save';
import { memoryBackend } from '@/platform/storage';
import type { SaveStatus } from '@/platform/storage';
import { Store } from '@/platform/bridge';
import { cleanupApps, bootApp, flush } from './app-rig';
import { SaveNotice } from '@/ui/overlay/SaveNotice';
import { MAX_IMPORT_BYTES, MAX_SHOWN_WARNINGS, SaveSection, saveProblem } from '@/ui/overlay/SaveSection';
import { Q01, button, click, mount, q, qa, setupDom, text } from './ui-rig';

beforeAll(() => setupDom());
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const m of mounted.splice(0)) m();
  cleanupApps();
});

const status = (over: Partial<SaveStatus> = {}): Store<SaveStatus> =>
  new Store<SaveStatus>({ backend: 'indexeddb', phase: 'idle', savedAt: null, problem: null, recoveredFromPrevious: false, unreadable: false, salvaged: false, loadWarnings: [], keptUnread: false, volatile: false, fallback: null, ...over });

const flushAll = (): Promise<void> => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

function chooseFile(host: HTMLElement, file: { name: string; size?: number; text: () => Promise<string> }): Promise<void> {
  const input = q<HTMLInputElement>(host, 'input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 100, ...file }] });
  return act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

const GOOD = serializeSave({ ...emptySave('2026-11-12T03:04:00.000Z'), explorationState: { ...emptySave('x').explorationState, openedQuests: ['a', 'b', 'c'] } });

describe('SaveSection', () => {
  function section(over: Partial<Parameters<typeof SaveSection>[0]> = {}, st = status()) {
    const downloads: Array<{ fileName: string; text: string }> = [];
    const imports: string[] = [];
    let imported = 0;
    const m = mount(
      <SaveSection
        status={st}
        exportFile={() => ({ fileName: 'save.json', text: '{"x":1}' })}
        importText={async (t) => {
          imports.push(t);
          return { ok: true };
        }}
        onImported={() => void imported++}
        download={(fileName, t) => downloads.push({ fileName, text: t })}
        {...over}
      />,
    );
    mounted.push(m.unmount);
    return { host: m.host, st, downloads, imports, imported: () => imported };
  }

  it('어디에 저장하는지와 마지막 저장을 말한다. 아직 없으면 그렇게 말한다', () => {
    const a = section();
    expect(text(q(a.host, '.settings-note'))).toContain('이 기기의 브라우저에 저장돼요');
    expect(text(q(a.host, '[data-testid="save-status"]'))).toBe('아직 저장한 것이 없어요.');
    act(() => a.st.set({ ...a.st.get(), phase: 'saved', savedAt: '2026-11-11T03:00:00.000Z' }));
    expect(text(q(a.host, '[data-testid="save-status"]'))).toMatch(/^마지막 저장: /);
    act(() => a.st.set({ ...a.st.get(), phase: 'saving' }));
    expect(text(q(a.host, '[data-testid="save-status"]'))).toBe('저장하는 중…');
  });

  it('문제가 없으면 문제 문장이 없고, 문제가 있으면 기호와 글자로 말한다', () => {
    const ok = section();
    expect(q(ok.host, '.save-problem')).toBeNull();
    const memory = section({}, status({ backend: 'memory', volatile: true }));
    expect(text(q(memory.host, '.save-problem'))).toMatch(/저장소를 쓸 수 없어요.*파일로 내보내 두세요/);
    expect(q(memory.host, '.save-problem svg')).not.toBeNull(); // 색만으로 말하지 않는다
    expect(text(q(memory.host, '.settings-note'))).toContain('저장소를 쓸 수 없어요');
  });

  it('내보내기: 파일을 내려받게 하고 파일 이름을 알려 준다', () => {
    const a = section();
    click(button(a.host, '저장 내보내기'));
    expect(a.downloads).toEqual([{ fileName: 'save.json', text: '{"x":1}' }]);
    expect(text(q(a.host, '.save-note'))).toContain('save.json');
    expect(q(a.host, '.save-note')!.getAttribute('role')).toBe('status');
  });

  it('내보내기가 던져도 화면이 깨지지 않고 이유를 알린다', () => {
    const a = section({
      exportFile: () => {
        throw new Error('만들 수 없어요');
      },
    });
    click(button(a.host, '저장 내보내기'));
    expect(text(q(a.host, '.save-note'))).toContain('내보내지 못했어요: 만들 수 없어요');
    expect(q(a.host, '.save-note')!.getAttribute('data-kind')).toBe('error');
  });

  it('가져오기: 파일을 고르면 요약을 보이고 한 번 더 묻는다. 묻기 전에는 바꾸지 않는다', async () => {
    const a = section();
    await chooseFile(a.host, { name: 'mine.json', text: async () => GOOD });
    const confirm = q(a.host, '.save-confirm')!;
    expect(confirm).not.toBeNull();
    expect(text(confirm)).toContain('mine.json');
    expect(text(confirm)).toContain('열어 본 도전 3개');
    expect(text(confirm)).toContain('직전 저장으로 한 번 남아요');
    expect(a.imports).toEqual([]);
    expect(document.activeElement).toBe(button(confirm, '가져와서 바꾸기')); // 키보드로 곧바로 정할 수 있다
  });

  it('가져와서 바꾸기를 누르면 가져오고, 끝났음을 알리고, 화면을 새로 불러오게 한다', async () => {
    const a = section();
    await chooseFile(a.host, { name: 'mine.json', text: async () => GOOD });
    click(button(a.host, '가져와서 바꾸기'));
    await flushAll();
    expect(a.imports).toEqual([GOOD]);
    expect(a.imported()).toBe(1);
    expect(q(a.host, '.save-confirm')).toBeNull();
    expect(text(q(a.host, '.save-note'))).toContain('가져왔어요');
  });

  it('취소하면 아무것도 바꾸지 않는다', async () => {
    const a = section();
    await chooseFile(a.host, { name: 'mine.json', text: async () => GOOD });
    click(button(a.host, '취소'));
    expect(q(a.host, '.save-confirm')).toBeNull();
    expect(a.imports).toEqual([]);
    expect(a.imported()).toBe(0);
  });

  it('저장 파일이 아닌 파일은 묻기 전에 거르고, 이유를 보여 준다', async () => {
    const a = section();
    await chooseFile(a.host, { name: 'photo.json', text: async () => '이건 저장이 아니에요' });
    expect(q(a.host, '.save-confirm')).toBeNull();
    expect(text(q(a.host, '.save-note'))).toContain('가져올 수 없어요');
    expect(text(q(a.host, '.save-note'))).toContain('JSON 형식이 아니에요');
    const other = JSON.stringify({ ...JSON.parse(GOOD), projectId: 'another-game' });
    await chooseFile(a.host, { name: 'x.json', text: async () => other });
    expect(text(q(a.host, '.save-note'))).toContain('다른 게임의 저장');
    expect(a.imports).toEqual([]);
  });

  it('너무 큰 파일은 읽지 않는다', async () => {
    const a = section();
    let read = 0;
    await chooseFile(a.host, {
      name: 'big.json',
      size: MAX_IMPORT_BYTES + 1,
      text: async () => {
        read++;
        return GOOD;
      },
    });
    expect(read).toBe(0);
    expect(text(q(a.host, '.save-note'))).toContain('너무 커요');
  });

  it('가져오기가 실패하면 지금 진행은 그대로라고 알리고 이유를 보인다. 화면은 새로 불러오지 않는다', async () => {
    const a = section({ importText: async () => ({ ok: false, errors: ['저장 공간이 가득 찼어요'] }) });
    await chooseFile(a.host, { name: 'mine.json', text: async () => GOOD });
    click(button(a.host, '가져와서 바꾸기'));
    await flushAll();
    expect(text(q(a.host, '.save-note'))).toContain('지금 진행은 그대로예요');
    expect(text(q(a.host, '.save-note'))).toContain('저장 공간이 가득 찼어요');
    expect(a.imported()).toBe(0);
  });

  it('저장을 읽으면서 있었던 일이 있으면 목록으로 보여 준다. 많으면 여덟 개까지만 보이고 나머지는 개수를 알린다', () => {
    const none = section();
    expect(q(none.host, '.save-warnings')).toBeNull();
    const warnings = Array.from({ length: MAX_SHOWN_WARNINGS + 3 }, (_, i) => `경고 ${i + 1}`);
    const a = section({}, status({ loadWarnings: warnings }));
    const box = q(a.host, '.save-warnings')!;
    expect(box.getAttribute('role')).toBe('group');
    expect(box.getAttribute('aria-labelledby')).toBe('save-warnings-title');
    expect(text(q(box, '#save-warnings-title'))).toBe('저장을 읽으면서 있었던 일');
    expect(qa(box, 'li').map((e) => text(e))).toEqual(warnings.slice(0, MAX_SHOWN_WARNINGS));
    expect(text(box)).toContain('그 밖에 3가지가 더 있어요');
    // 문제 문장도 함께 뜬다
    expect(text(q(a.host, '.save-problem'))).toContain('일부를 기본값으로 돌렸어요');
    act(() => a.st.set({ ...a.st.get(), loadWarnings: ['하나뿐'] }));
    expect(qa(q(a.host, '.save-warnings')!, 'li')).toHaveLength(1);
    expect(text(q(a.host, '.save-warnings'))).not.toContain('그 밖에');
  });

  it('읽지 못해 따로 둔 저장이 있고 내려받는 길이 있을 때만 내려받기 단추가 있다', () => {
    const noWay = section({}, status({ keptUnread: true }));
    expect(q(noWay.host, '[data-testid="save-unread-download"]')).toBeNull(); // 길을 안 넘기면 그리지 않는다
    const nothing = section({ exportUnread: async () => null }, status());
    expect(q(nothing.host, '[data-testid="save-unread-download"]')).toBeNull(); // 따로 둔 것이 없다
    const a = section({ exportUnread: async () => null }, status({ keptUnread: true }));
    expect(text(q(a.host, '[data-testid="save-unread-download"]'))).toBe('읽지 못한 저장 내려받기');
    act(() => a.st.set({ ...a.st.get(), keptUnread: false }));
    expect(q(a.host, '[data-testid="save-unread-download"]')).toBeNull();
  });

  it('내려받기 단추: 따로 둔 원본을 파일로 내려받게 하고, 없거나 실패하면 이유를 알린다', async () => {
    const a = section({ exportUnread: async () => ({ fileName: 'unread.json', text: '{깨짐' }) }, status({ keptUnread: true }));
    click(q(a.host, '[data-testid="save-unread-download"]')!);
    await flushAll();
    expect(a.downloads).toEqual([{ fileName: 'unread.json', text: '{깨짐' }]);
    expect(text(q(a.host, '.save-note'))).toContain('읽지 못한 저장을 파일로 내려받았어요: unread.json');
    expect(q(a.host, '.save-note')!.getAttribute('data-kind')).toBe('ok');

    const gone = section({ exportUnread: async () => null }, status({ keptUnread: true }));
    click(q(gone.host, '[data-testid="save-unread-download"]')!);
    await flushAll();
    expect(gone.downloads).toEqual([]);
    expect(text(q(gone.host, '.save-note'))).toContain('따로 남겨 둔 저장을 찾지 못했어요');
    expect(q(gone.host, '.save-note')!.getAttribute('data-kind')).toBe('error');

    const bad = section(
      {
        exportUnread: async () => {
          throw new Error('읽기 오류');
        },
      },
      status({ keptUnread: true }),
    );
    click(q(bad.host, '[data-testid="save-unread-download"]')!);
    await flushAll();
    expect(text(q(bad.host, '.save-note'))).toContain('내려받지 못했어요: 읽기 오류');
  });

  it('누르는 곳은 이름이 있는 단추이고 파일 입력은 이름이 있다', () => {
    const a = section();
    for (const b of qa(a.host, 'button')) expect((b.getAttribute('aria-label') ?? text(b)).length).toBeGreaterThan(0);
    expect(q(a.host, 'input[type="file"]')!.getAttribute('aria-label')).toBe('가져올 저장 파일 고르기');
  });
});

describe('saveProblem', () => {
  const base = status().get();
  it('문제가 없으면 null이다', () => {
    expect(saveProblem(base)).toBeNull();
    expect(saveProblem({ ...base, phase: 'saved', savedAt: '2026-11-11T00:00:00.000Z' })).toBeNull();
  });
  it('읽을 수 없음, 일부만 살려 엶, 직전 저장으로 엶, 메모리, 저장 실패, 읽기 알림 순으로 우선한다', () => {
    expect(saveProblem({ ...base, unreadable: true, salvaged: true, recoveredFromPrevious: true, volatile: true })).toContain('읽을 수 없어');
    expect(saveProblem({ ...base, salvaged: true, recoveredFromPrevious: true, volatile: true })).toContain('읽을 수 있는 것만 살려서 열었어요');
    expect(saveProblem({ ...base, recoveredFromPrevious: true, volatile: true })).toContain('직전 저장으로 열었어요');
    expect(saveProblem({ ...base, volatile: true, loadWarnings: ['x'] })).toContain('사라져요');
    expect(saveProblem({ ...base, phase: 'failed', problem: '저장하지 못했어요: x', loadWarnings: ['x'] })).toBe('저장하지 못했어요: x');
    expect(saveProblem({ ...base, loadWarnings: ['x'] })).toContain('일부를 기본값으로 돌렸어요');
  });
  it('원본을 따로 남겼는지에 따라 사실대로 말한다(남기지 못했는데 남겼다고 하지 않는다)', () => {
    expect(saveProblem({ ...base, unreadable: true, keptUnread: true })).toContain('지우지 않고 따로 남겨 뒀어요');
    expect(saveProblem({ ...base, unreadable: true, keptUnread: false })).toContain('따로 남겨 두지는 못했어요');
    expect(saveProblem({ ...base, unreadable: true, keptUnread: false })).not.toContain('지우지 않고');
  });
  it('일부만 살려 열었다는 말은 원본이 남아 있다는 것까지 알린다', () => {
    const m = saveProblem({ ...base, salvaged: true })!;
    expect(m).toContain('못 읽은 부분이 든 원본은 지우지 않고 따로 남겨 뒀어요');
  });
});

describe('SaveNotice', () => {
  it('문제가 없으면 아무것도 그리지 않는다', () => {
    const m = mount(<SaveNotice status={status()} onOpenSettings={() => undefined} />);
    mounted.push(m.unmount);
    expect(q(m.host, '[data-save-notice]')).toBeNull();
  });

  it('문제가 있으면 말하고, 설정으로 가는 길과 닫기가 있다. 닫아도 문제가 바뀌면 다시 뜬다', () => {
    const st = status({ volatile: true, backend: 'memory' });
    let opened = 0;
    const m = mount(<SaveNotice status={st} onOpenSettings={() => void opened++} />);
    mounted.push(m.unmount);
    const notice = q(m.host, '[data-save-notice]')!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(text(notice)).toContain('진행이 사라져요');
    click(button(notice, '설정에서 보기'));
    expect(opened).toBe(1);
    click(button(notice, '닫기'));
    expect(q(m.host, '[data-save-notice]')).toBeNull();
    act(() => st.set({ ...st.get(), unreadable: true }));
    expect(q(m.host, '[data-save-notice]')).not.toBeNull(); // 다른 문제는 다시 알린다
  });

  it('설정 화면에서는 숨긴다(같은 말이 아래에 있다)', () => {
    const m = mount(<SaveNotice status={status({ volatile: true })} onOpenSettings={() => undefined} hidden />);
    mounted.push(m.unmount);
    expect(q(m.host, '[data-save-notice]')).toBeNull();
  });

  it('일부만 살려 열었거나 읽으면서 기본값으로 돌린 것이 있으면 알리고, 닫을 수 있다', () => {
    const st = status({ salvaged: true, keptUnread: true, loadWarnings: ['통과 기록 1개를 읽을 수 없어 건너뛰었어요'] });
    const m = mount(<SaveNotice status={st} onOpenSettings={() => undefined} />);
    mounted.push(m.unmount);
    expect(text(q(m.host, '[data-save-notice]'))).toContain('읽을 수 있는 것만 살려서 열었어요');
    click(button(q(m.host, '[data-save-notice]')!, '닫기'));
    expect(q(m.host, '[data-save-notice]')).toBeNull();
    // 알림만 있는 경우는 다른 말로 다시 뜬다
    act(() => st.set({ ...st.get(), salvaged: false }));
    expect(text(q(m.host, '[data-save-notice]'))).toContain('일부를 기본값으로 돌렸어요');
  });
});

describe('앱 안에서', () => {
  const memStorage = () => {
    const mem = memoryBackend();
    // 이름만 IndexedDB다(메모리 저장소라고 밝히면 '진행이 사라져요' 띠가 뜬다)
    const storage = makeStorage({ kind: 'indexeddb', fallback: null, sync: mem, backend: mem });
    return { mem, storage };
  };

  it('저장소가 없는 실행에서는 설정에 저장 구역이 없고 띠도 없다', async () => {
    const t = await bootApp('#/settings');
    expect(q(t.host, '#set-save')).toBeNull();
    expect(q(t.host, '[data-save-notice]')).toBeNull();
  });

  it('저장소가 있으면 설정 아래쪽에 저장 구역과 사용 기록 구역이 있고, 맨 아래는 정보 구역이다(8-2)', async () => {
    const { storage } = memStorage();
    const t = await bootApp('#/settings', { persistence: { storage, restored: null, pageEvents: null } });
    const sections = qa(t.host, '.settings-section > h2').map((e) => text(e));
    expect(sections).toEqual(['소리', '화면', '도움', '저장', '사용 기록', '정보']);
    expect(button(t.host, '저장 내보내기')).toBeTruthy();
    expect(button(t.host, '저장 가져오기')).toBeTruthy();
  });

  it('가져오기가 끝나면 마을로 돌아가 화면을 새로 불러온다', async () => {
    const { storage, mem } = memStorage();
    let reloads = 0;
    const t = await bootApp('#/settings', { persistence: { storage, restored: null, pageEvents: null }, onReload: () => void reloads++ });
    await chooseFile(t.host, { name: 'mine.json', text: async () => GOOD });
    click(button(t.host, '가져와서 바꾸기'));
    await flushAll();
    await flush();
    expect(reloads).toBe(1);
    expect(t.win.location.hash).toBe('#/');
    expect(mem.data.get('levelup-music-world:v1:save:current')).toBe(GOOD);
  });

  it('저장 문제가 있으면 어느 화면에서나 띠가 뜨고, 설정에서 보기를 누르면 설정으로 간다', async () => {
    const { storage } = memStorage();
    const t = await bootApp('', { persistence: { storage, restored: null, pageEvents: null } });
    expect(q(t.host, '[data-save-notice]')).toBeNull();
    act(() => storage.status.set({ ...storage.status.get(), phase: 'failed', problem: '저장하지 못했어요: 디스크 오류' }));
    expect(text(q(t.host, '[data-save-notice]'))).toContain('디스크 오류');
    click(button(q(t.host, '[data-save-notice]')!, '설정에서 보기'));
    expect(t.win.location.hash).toBe('#/settings');
    expect(q(t.host, '[data-save-notice]')).toBeNull(); // 설정 화면에는 구역이 대신 말한다
    expect(text(q(t.host, '.save-problem'))).toContain('디스크 오류');
  });

  it('읽다가 일부를 살려 연 저장이면 설정의 저장 구역이 무슨 일이 있었는지 보여 주고, 원본을 내려받게 한다', async () => {
    const { storage, mem } = memStorage();
    mem.data.set('levelup-music-world:v1:save:unreadable', '{"원본":"깨짐"}');
    const t = await bootApp('#/settings', { persistence: { storage, restored: null, pageEvents: null } });
    expect(q(t.host, '.save-warnings')).toBeNull();
    expect(q(t.host, '[data-testid="save-unread-download"]')).toBeNull();
    act(() =>
      storage.status.set({ ...storage.status.get(), salvaged: true, keptUnread: true, loadWarnings: ['통과 기록 1개를 읽을 수 없어 건너뛰었어요. 예: 기록 2'] }),
    );
    expect(text(q(t.host, '.save-problem'))).toContain('읽을 수 있는 것만 살려서 열었어요');
    expect(text(q(t.host, '.save-warnings'))).toContain('통과 기록 1개를 읽을 수 없어');
    // 내려받기: 브라우저의 내려받기를 가짜로 바꿔 어떤 파일이 나가는지 본다
    const sent: Array<{ name: string; blob: Blob }> = [];
    const urlApi = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
    const saved = { create: urlApi.createObjectURL, revoke: urlApi.revokeObjectURL };
    const clickProto = HTMLAnchorElement.prototype as unknown as { click: () => void };
    const savedClick = clickProto.click;
    let lastBlob: Blob | null = null;
    urlApi.createObjectURL = (b: Blob) => {
      lastBlob = b;
      return 'blob:fake';
    };
    urlApi.revokeObjectURL = () => undefined;
    clickProto.click = function (this: HTMLAnchorElement) {
      sent.push({ name: this.download, blob: lastBlob! });
    };
    try {
      click(q(t.host, '[data-testid="save-unread-download"]')!);
      await flushAll();
      await flush();
    } finally {
      urlApi.createObjectURL = saved.create;
      urlApi.revokeObjectURL = saved.revoke;
      clickProto.click = savedClick;
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toMatch(/^levelup-music-world-unread-\d{4}-\d{2}-\d{2}\.json$/);
    const body = await new Promise<string>((resolve) => {
      const r = new FileReader(); // jsdom의 Blob에는 text()가 없다
      r.onload = () => resolve(String(r.result));
      r.readAsText(sent[0]!.blob);
    });
    expect(body).toBe('{"원본":"깨짐"}');
    expect(text(q(t.host, '.save-note'))).toContain('읽지 못한 저장을 파일로 내려받았어요');
  });

  it('도전 패널을 열었다 나가면(화면이 바뀌면) 바로 저장한다', async () => {
    const { storage, mem } = memStorage();
    const t = await bootApp('#/q/pitch.same-note-two-clefs/middle-c', { persistence: { storage, restored: null, pageEvents: null } });
    await flushAll();
    const saved = mem.data.get('levelup-music-world:v1:save:current');
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).activeChallenge).toMatchObject({ questId: Q01, variantId: 'middle-c' });
    act(() => {
      t.win.location.hash = '#/';
    });
    await flushAll();
    expect(JSON.parse(mem.data.get('levelup-music-world:v1:save:current')!).activeChallenge).toBeNull();
  });
});
