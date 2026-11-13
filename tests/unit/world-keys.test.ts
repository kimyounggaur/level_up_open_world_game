// 7.2, 7.4, 7.5 키보드: 방향키와 WASD, E와 Enter, 한글 자판, 단축키, 입력칸.
import { describe, expect, it } from 'vitest';
import { KeyTracker, actionOf, isActivatable, isTypingTarget } from '../../src/world/keys';

describe('actionOf', () => {
  it.each([
    ['ArrowLeft', 'left'],
    ['KeyA', 'left'],
    ['ArrowRight', 'right'],
    ['KeyD', 'right'],
    ['ArrowUp', 'up'],
    ['KeyW', 'up'],
    ['ArrowDown', 'down'],
    ['KeyS', 'down'],
    ['KeyE', 'interact'],
    ['Enter', 'interact'],
    ['NumpadEnter', 'interact'],
  ])('%s → %s', (code, action) => {
    expect(actionOf({ code })).toBe(action);
  });

  it('한글 자판에서도 물리 키로 읽는다(글자는 ㅁ, ㅈ, ㄴ, ㅇ, ㄷ)', () => {
    expect(actionOf({ code: 'KeyA', key: 'ㅁ' })).toBe('left');
    expect(actionOf({ code: 'KeyW', key: 'ㅈ' })).toBe('up');
    expect(actionOf({ code: 'KeyS', key: 'ㄴ' })).toBe('down');
    expect(actionOf({ code: 'KeyD', key: 'ㅇ' })).toBe('right');
    expect(actionOf({ code: 'KeyE', key: 'ㄷ' })).toBe('interact');
  });

  it('code가 없으면 글자로 읽고, 대문자도 같다', () => {
    expect(actionOf({ key: 'a' })).toBe('left');
    expect(actionOf({ key: 'A' })).toBe('left');
    expect(actionOf({ key: 'e' })).toBe('interact');
    expect(actionOf({ key: 'Enter' })).toBe('interact');
    expect(actionOf({ key: 'x' })).toBeNull();
  });

  it('Ctrl, Alt, Meta와 함께 누른 것(브라우저 단축키)은 받지 않는다', () => {
    expect(actionOf({ code: 'KeyA', ctrlKey: true })).toBeNull();
    expect(actionOf({ code: 'KeyE', metaKey: true })).toBeNull();
    expect(actionOf({ code: 'ArrowLeft', altKey: true })).toBeNull();
  });

  it('Shift는 상관없다', () => {
    expect(actionOf({ code: 'KeyD' })).toBe('right');
  });

  it('쓰지 않는 키는 null이다', () => {
    expect(actionOf({ code: 'Space' })).toBeNull();
    expect(actionOf({ code: 'Escape' })).toBeNull();
    expect(actionOf({ code: 'KeyM' })).toBeNull();
  });
});

describe('KeyTracker', () => {
  it('누르는 동안 방향이 유지되고 떼면 사라진다', () => {
    const k = new KeyTracker();
    expect(k.input).toEqual({ dx: 0, dy: 0 });
    k.down({ code: 'KeyD' });
    k.down({ code: 'ArrowUp' });
    expect(k.input).toEqual({ dx: 1, dy: -1 });
    k.up({ code: 'KeyD' });
    expect(k.input).toEqual({ dx: 0, dy: -1 });
    k.up({ code: 'ArrowUp' });
    expect(k.input).toEqual({ dx: 0, dy: 0 });
    expect(k.anyHeld).toBe(false);
  });

  it('반대쪽 키를 함께 누르면 서로 지운다', () => {
    const k = new KeyTracker();
    k.down({ code: 'ArrowLeft' });
    k.down({ code: 'ArrowRight' });
    expect(k.input.dx).toBe(0);
    k.up({ code: 'ArrowLeft' });
    expect(k.input.dx).toBe(1);
  });

  it('방향키와 WASD를 섞어 눌러도 한 방향이다', () => {
    const k = new KeyTracker();
    k.down({ code: 'ArrowRight' });
    k.down({ code: 'KeyD' });
    expect(k.input).toEqual({ dx: 1, dy: 0 });
    k.up({ code: 'KeyD' });
    expect(k.input).toEqual({ dx: 1, dy: 0 }); // 방향키는 아직 누르고 있다
    k.up({ code: 'ArrowRight' });
    expect(k.input).toEqual({ dx: 0, dy: 0 });
    expect(k.anyHeld).toBe(false);
  });

  it('상호작용 키는 처음 누른 순간에만 알리고, 꾹 누르기(repeat)는 알리지 않는다', () => {
    const k = new KeyTracker();
    expect(k.down({ code: 'KeyE' })).toBe('interact');
    expect(k.down({ code: 'KeyE', repeat: true })).toBeNull();
    expect(k.down({ code: 'Enter' })).toBe('interact');
    expect(k.anyHeld).toBe(false);
  });

  it('clear는 눌린 키를 모두 놓는다(창 포커스를 잃을 때)', () => {
    const k = new KeyTracker();
    k.down({ code: 'KeyW' });
    k.down({ code: 'KeyD' });
    k.clear();
    expect(k.input).toEqual({ dx: 0, dy: 0 });
  });

  it('Ctrl을 누른 채 떼는 키도 지운다(눌린 채로 남지 않는다)', () => {
    const k = new KeyTracker();
    k.down({ code: 'KeyA' });
    k.down({ code: 'KeyA', ctrlKey: true, repeat: true }); // 무시
    k.up({ code: 'KeyA', ctrlKey: true });
    expect(k.input.dx).toBe(0);
  });

  it('code 없는 합성 이벤트도 뗄 수 있다', () => {
    const k = new KeyTracker();
    k.down({ key: 'd' });
    expect(k.input.dx).toBe(1);
    k.up({ key: 'D' });
    expect(k.input.dx).toBe(0);
  });
});

describe('초점 판별', () => {
  it('입력칸과 편집 영역에서는 월드 키를 받지 않는다', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window_like())).toBe(false);
  });

  it('버튼, 링크, 요약, 역할이 버튼인 요소에서는 Enter가 이미 누르기다', () => {
    expect(isActivatable({ tagName: 'BUTTON' })).toBe(true);
    expect(isActivatable({ tagName: 'A' })).toBe(true);
    expect(isActivatable({ tagName: 'SUMMARY' })).toBe(true);
    expect(isActivatable({ tagName: 'DIV', getAttribute: (n: string) => (n === 'role' ? 'button' : null) })).toBe(true);
    expect(isActivatable({ tagName: 'DIV', getAttribute: () => null })).toBe(false);
    expect(isActivatable({ tagName: 'BODY' })).toBe(false);
    expect(isActivatable(undefined)).toBe(false);
  });
});

function window_like(): unknown {
  return { addEventListener: () => undefined }; // tagName이 없는 객체(window 등)
}
