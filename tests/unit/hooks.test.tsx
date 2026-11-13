// @vitest-environment jsdom
// useStore: 월드가 상태를 연달아 바꾸거나, 그리는 일과 구독하는 일 사이에 바뀌어도 화면이 오래된 값에 머물지 않는다.
// (실제 Chrome에서 지도의 '바로 이동' 뒤에 왼쪽 위 지역 이름이 새 지역으로 바뀌지 않던 결함을 막는다.)
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '@/platform/bridge';
import { useStore } from '@/ui/common/hooks';
import { setupDom } from './ui-rig';

beforeAll(() => setupDom());

const mounted: Array<() => void> = [];
afterEach(() => {
  for (const u of mounted.splice(0)) u();
});

function Show({ store }: { store: Store<{ n: number }> }) {
  const v = useStore(store);
  return h('p', { 'data-v': v.n }, String(v.n));
}

function mountShow(store: Store<{ n: number }>): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(h(Show, { store }), host);
  mounted.push(() => {
    render(null, host);
    host.remove();
  });
  return host;
}
const shown = (host: HTMLElement): string => host.querySelector('p')!.textContent ?? '';
const later = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('useStore', () => {
  it('값이 바뀌면 다시 그린다', async () => {
    const store = new Store({ n: 1 });
    const host = mountShow(store);
    await act(async () => {
      await later(150);
    });
    expect(shown(host)).toBe('1');
    act(() => store.set({ n: 2 }));
    expect(shown(host)).toBe('2');
  });

  it('한 순간에 연달아 두 번 바뀌어도 마지막 값을 보인다', async () => {
    const store = new Store({ n: 1 });
    const host = mountShow(store);
    await act(async () => {
      await later(150);
    });
    act(() => {
      store.set({ n: 2 });
      store.set({ n: 3 });
    });
    expect(shown(host)).toBe('3');
    // 처음 값으로 돌아오는 연속 변화도 그렇다
    const first = store.get();
    act(() => {
      store.set({ n: 9 });
      store.set(first);
    });
    expect(shown(host)).toBe('3');
  });

  it('그린 뒤 구독하기 전에 바뀌었어도(효과가 늦게 돌 때) 구독하자마자 새 값으로 그린다', async () => {
    const store = new Store({ n: 1 });
    const host = mountShow(store); // act 없이 그렸다: 효과(구독)는 다음 프레임 뒤에 돈다
    expect(shown(host)).toBe('1');
    store.set({ n: 5 }); // 구독 전에 바뀐다
    await later(250); // 효과가 돌 시간
    expect(shown(host)).toBe('5');
    store.set({ n: 6 });
    await later(50);
    expect(shown(host)).toBe('6');
  });

  it('내려가면 구독을 푼다', async () => {
    const store = new Store({ n: 1 });
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => {
      render(h(Show, { store }), host);
      await later(150);
    });
    const before = (store as unknown as { channel: { size: number } }).channel.size;
    expect(before).toBe(1);
    await act(async () => {
      render(null, host);
      await later(50);
    });
    expect((store as unknown as { channel: { size: number } }).channel.size).toBe(0);
    host.remove();
  });
});
