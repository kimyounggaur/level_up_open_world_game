// 4.2 키보드 표: 키 → 놓기 작업대 동작. 물리 키(code)로 읽는다.
import { describe, expect, it } from 'vitest';
import { BENCH_KEY_TABLE, benchActionOf, isActivatableElement, isTypingElement } from '@/ui/challenge/benchKeys';
import type { BenchAction } from '@/ui/challenge/benchKeys';

const code = (c: string, extra: object = {}) => benchActionOf({ code: c, ...extra });

describe('키 지도(4.2 표)', () => {
  it('표의 키가 모두 설계서의 동작으로 이어진다', () => {
    const table: Array<[string, BenchAction]> = [
      ['ArrowLeft', 'cursor-left'],
      ['ArrowRight', 'cursor-right'],
      ['ArrowUp', 'hand-up'],
      ['ArrowDown', 'hand-down'],
      ['Enter', 'place'],
      ['NumpadEnter', 'place'],
      ['Space', 'place'],
      ['Backspace', 'remove'],
      ['Delete', 'remove'],
      ['KeyZ', 'undo'],
      ['KeyY', 'redo'],
      ['KeyP', 'hear-mine'],
      ['KeyT', 'hear-target'],
      ['KeyS', 'stop'],
      ['KeyC', 'check'],
      ['KeyV', 'view-panel'],
      ['KeyH', 'help'],
      ['Escape', 'exit'],
    ];
    for (const [c, action] of table) expect(code(c), c).toBe(action);
  });

  it('도움 카드에 보이는 표는 4.2의 키를 빠짐없이 싣는다(더한 Shift+↑ ↓ 한 줄 포함)', () => {
    const keys = BENCH_KEY_TABLE.map((r) => r.keys);
    for (const k of ['← →', '↑ ↓', 'Enter, Space', 'Backspace', 'Z, Y', 'P', 'T', 'S', 'C', 'V', 'H', 'Esc']) expect(keys).toContain(k);
    expect(keys).toContain('Shift+↑ ↓');
    expect(BENCH_KEY_TABLE.find((r) => r.keys === 'P')!.label).toBe('내 배치 듣기');
    expect(BENCH_KEY_TABLE.find((r) => r.keys === 'Esc')!.label).toBe('나가기');
  });

  it('Shift와 함께 누른 ↑ ↓ 는 변화표를 바꾼다', () => {
    expect(code('ArrowUp', { shiftKey: true })).toBe('accidental-up');
    expect(code('ArrowDown', { shiftKey: true })).toBe('accidental-down');
  });

  it('한글 자판에서도 같은 자리의 키가 같은 동작이다(key가 한글이어도 code를 따른다)', () => {
    expect(benchActionOf({ code: 'KeyZ', key: 'ㅋ' })).toBe('undo');
    expect(benchActionOf({ code: 'KeyP', key: 'ㅔ' })).toBe('hear-mine');
    expect(benchActionOf({ code: 'KeyC', key: 'ㅊ' })).toBe('check');
  });

  it('code가 없는 합성 이벤트는 key로 읽는다', () => {
    expect(benchActionOf({ key: 'ArrowUp' })).toBe('hand-up');
    expect(benchActionOf({ key: 'ArrowDown', shiftKey: true })).toBe('accidental-down');
    expect(benchActionOf({ key: 'Enter' })).toBe('place');
    expect(benchActionOf({ key: ' ' })).toBe('place');
    expect(benchActionOf({ key: 'Z' })).toBe('undo');
    expect(benchActionOf({ key: 'Escape' })).toBe('exit');
  });

  it('Ctrl·Cmd+Z는 실행 취소, Ctrl+Y와 Ctrl+Shift+Z는 다시 실행이다. 다른 브라우저 단축키는 건드리지 않는다', () => {
    expect(code('KeyZ', { ctrlKey: true })).toBe('undo');
    expect(code('KeyZ', { metaKey: true })).toBe('undo');
    expect(code('KeyZ', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(code('KeyY', { ctrlKey: true })).toBe('redo');
    for (const c of ['KeyS', 'KeyP', 'KeyC', 'KeyV', 'KeyH', 'KeyT', 'Enter', 'ArrowUp', 'ArrowLeft']) {
      expect(code(c, { ctrlKey: true }), `Ctrl+${c}`).toBeNull();
      expect(code(c, { metaKey: true }), `Cmd+${c}`).toBeNull();
    }
  });

  it('Alt와 함께 누른 키(뒤로 가기 Alt+←)는 받지 않는다', () => {
    expect(code('ArrowLeft', { altKey: true })).toBeNull();
    expect(code('ArrowUp', { altKey: true })).toBeNull();
    expect(code('KeyZ', { altKey: true })).toBeNull();
  });

  it('Shift+Z는 다시 실행으로도 읽는다', () => {
    expect(code('KeyZ', { shiftKey: true })).toBe('redo');
  });

  it('월드를 걷던 키(W A D E)는 설치물 모드에서 아무 동작도 아니다', () => {
    for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyE', 'KeyM', 'KeyL', 'Tab', 'KeyX']) expect(code(c), c).toBeNull();
    expect(benchActionOf({})).toBeNull();
  });
});

describe('초점이 있는 곳', () => {
  it('글자를 입력하는 칸은 작업대가 가로채지 않는다', () => {
    expect(isTypingElement({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingElement({ tagName: 'textarea' })).toBe(true);
    expect(isTypingElement({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingElement({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingElement(null)).toBe(false);
    expect(isTypingElement('x')).toBe(false);
  });

  it('단추나 링크에 초점이 있으면 Enter·Space는 그 단추의 것이다', () => {
    expect(isActivatableElement({ tagName: 'BUTTON' })).toBe(true);
    expect(isActivatableElement({ tagName: 'a' })).toBe(true);
    expect(isActivatableElement({ tagName: 'SUMMARY' })).toBe(true);
    expect(isActivatableElement({ tagName: 'DIV', getAttribute: (n: string) => (n === 'role' ? 'radio' : null) })).toBe(true);
    expect(isActivatableElement({ tagName: 'DIV', getAttribute: () => null })).toBe(false);
    expect(isActivatableElement(undefined)).toBe(false);
  });
});
