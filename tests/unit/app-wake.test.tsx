// @vitest-environment jsdom
// 8.6, 10.8: 소리를 켠 뒤 오디오 장치가 멈추면(전화, 화면 잠금, 앱 전환) 사용자의 다음 누르기와 화면이 돌아올 때 앱이 깨운다.
// 아이폰은 멈춘 장치를 저절로 깨우지 않는다. 소리를 켜기 전에는 장치를 만들지도 건드리지도 않는다(W-11).
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, cleanupApps, flush } from './app-rig';
import { setupDom } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  cleanupApps();
});

const fire = (target: EventTarget, type: string): void => {
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });
};
const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  fire(document, 'visibilitychange');
};
const GESTURES = ['pointerup', 'click', 'touchend', 'keydown'] as const;

async function bootWithSoundOn() {
  const t = await bootApp('#/');
  await act(async () => {
    await t.ctx.mixer.enable();
  });
  await flush();
  return t;
}

describe('멈춘 오디오 장치를 앱이 깨운다 (8.6)', () => {
  it('소리를 켜기 전에는 누르거나 키를 눌러도, 화면이 돌아와도 장치를 만들지 않는다(W-11)', async () => {
    const t = await bootApp('#/');
    for (const g of GESTURES) fire(document.body, g);
    setHidden(true);
    setHidden(false);
    expect(t.engine()).toBeNull();
    expect(t.ctx.mixer.state).toBe('off');
  });

  it('소리를 켠 뒤에는 누르기, 터치, 키 누르기마다 장치를 깨우라고 요청한다', async () => {
    const t = await bootWithSoundOn();
    const engine = t.engine()!;
    expect(engine.resumeCalls).toBe(0);
    for (const [i, g] of GESTURES.entries()) {
      fire(document.body, g);
      expect(engine.resumeCalls, g).toBe(i + 1);
    }
    expect(t.ctx.mixer.state).toBe('on');
  });

  it('화면이 다시 보일 때 깨우고, 가려질 때는 깨우지 않는다', async () => {
    const t = await bootWithSoundOn();
    const engine = t.engine()!;
    setHidden(true);
    expect(engine.resumeCalls).toBe(0);
    setHidden(false);
    expect(engine.resumeCalls).toBe(1);
  });

  it('앱을 내리면 더는 깨우지 않는다(듣는 것을 모두 풀어 준다)', async () => {
    const t = await bootWithSoundOn();
    const engine = t.engine()!;
    cleanupApps();
    fire(document.body, 'click');
    setHidden(false);
    expect(engine.resumeCalls).toBe(0);
  });
});
