// 7-1 계단밭(T5) 작업대의 키 지도. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 계단밭에 필요한 것(한 칸씩 올리고 내리기, 한 옥타브 건너뛰기)만 더한다.
import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '@/app/shortcuts';
import { benchActionOf } from '@/ui/challenge/benchKeys';
import { OCTAVE_STEPS, terraceActionOf, terraceKeyTableOf } from '@/ui/challenge/terraceKeys';
import type { TerraceAction } from '@/ui/challenge/terraceKeys';

const code = (c: string, extra: object = {}) => terraceActionOf({ code: c, ...extra });

describe('계단밭 키 지도(4.7)', () => {
  it('공통 키는 4.2의 표 그대로다. ↑ ↓만 손에 든 재료가 아니라 등의 높이(한 칸)를 바꾼다', () => {
    const table: Array<[string, TerraceAction]> = [
      ['ArrowLeft', 'cursor-left'],
      ['ArrowRight', 'cursor-right'],
      ['ArrowUp', 'step-up'],
      ['ArrowDown', 'step-down'],
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
    for (const [c, action] of table) {
      expect(code(c), c).toBe(action);
      if (c !== 'ArrowUp' && c !== 'ArrowDown') expect(code(c), `${c}: 공통 키와 같은 동작`).toBe(benchActionOf({ code: c }));
    }
  });

  it('Shift+↑ ↓는 변화표다(공통 키와 같다). PageUp과 PageDown은 한 옥타브(일곱 칸)다', () => {
    expect(code('ArrowUp', { shiftKey: true })).toBe('accidental-up');
    expect(code('ArrowDown', { shiftKey: true })).toBe('accidental-down');
    expect(code('PageUp')).toBe('octave-up');
    expect(code('PageDown')).toBe('octave-down');
    expect(OCTAVE_STEPS).toBe(7);
    // 합성 이벤트(code 없음)도 key로 읽는다
    expect(terraceActionOf({ key: 'PageUp' })).toBe('octave-up');
    expect(terraceActionOf({ key: 'PageDown' })).toBe('octave-down');
    expect(terraceActionOf({ key: 'ArrowUp' })).toBe('step-up');
    // 공통 키 지도에는 없는 키라 4.2의 표가 바뀌지 않는다
    expect(benchActionOf({ code: 'PageUp' })).toBeNull();
    // 다른 키와 함께 누른 것은 받지 않는다
    for (const c of ['PageUp', 'PageDown']) for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) expect(code(c, { [m]: true }), `${c}+${m}`).toBeNull();
  });

  it('글자 키는 물리 키로 읽어서 한글 자판에서도 같은 자리가 같은 동작이다', () => {
    expect(terraceActionOf({ code: 'KeyP', key: 'ㅔ' })).toBe('hear-mine');
    expect(terraceActionOf({ code: 'KeyT', key: 'ㅅ' })).toBe('hear-target');
    expect(terraceActionOf({ code: 'KeyC', key: 'ㅊ' })).toBe('check');
  });

  it('Ctrl·Meta와 함께 누르면 실행 취소·다시 실행만 받는다. Alt와 함께 누른 것은 받지 않는다', () => {
    expect(code('KeyZ', { ctrlKey: true })).toBe('undo');
    expect(code('KeyZ', { metaKey: true, shiftKey: true })).toBe('redo');
    expect(code('KeyY', { ctrlKey: true })).toBe('redo');
    for (const c of ['KeyP', 'KeyS', 'KeyC', 'KeyH', 'ArrowUp', 'Enter']) expect(code(c, { ctrlKey: true }), `Ctrl+${c}`).toBeNull();
    for (const c of ['KeyP', 'ArrowUp', 'PageUp', 'Enter']) expect(code(c, { altKey: true }), `Alt+${c}`).toBeNull();
  });

  it('모르는 키는 받지 않는다', () => {
    for (const c of ['KeyQ', 'KeyX', 'KeyR', 'Tab', 'Home', 'End']) expect(code(c), c).toBeNull();
    expect(terraceActionOf({})).toBeNull();
  });

  it('앱 전체의 단축키(M 지도, L 목록, N 수첩, 7.5)와 겹치지 않는다. PageUp·PageDown도 전역 단축키가 아니다', () => {
    for (const c of ['KeyM', 'KeyL', 'KeyN']) {
      expect(resolveShortcut({ code: c }, { kind: 'home' })).not.toBeNull();
      expect(code(c), c).toBeNull();
    }
    const candidates = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `Key${l}`).concat(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter', 'NumpadEnter', 'Space', 'Backspace', 'Delete', 'Escape', 'Tab']);
    const both = candidates.filter((c) => code(c) !== null && resolveShortcut({ code: c }, { kind: 'home' }) !== null);
    expect(both).toEqual([]);
  });

  it('도움 카드의 키 표: 변화표 키는 변화표를 쓸 때만 보이고, 높이 키(PageUp PageDown)와 4.2의 공통 키가 있다', () => {
    const quest = terraceKeyTableOf(false).map((r) => r.keys);
    const free = terraceKeyTableOf(true).map((r) => r.keys);
    expect(quest).not.toContain('Shift+↑ ↓');
    expect(free).toContain('Shift+↑ ↓');
    expect(free.filter((k) => k !== 'Shift+↑ ↓')).toEqual(quest);
    for (const k of ['← →', '↑ ↓', 'PageUp PageDown', 'Enter, Space', 'Backspace', 'Z, Y', 'P', 'T', 'S', 'C', 'V', 'H', 'Esc']) expect(quest, k).toContain(k);
    for (const row of terraceKeyTableOf(true)) expect(row.label.length, row.keys).toBeGreaterThan(0);
  });
});
