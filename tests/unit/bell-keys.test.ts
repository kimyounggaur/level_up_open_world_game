// 6-7 종나무(T4) 작업대의 키 지도. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 종나무에 필요한 것(높이, 음이름, 나무 건너뛰기, 가로 자리 맞바꾸기, 소리 끄기, 듣는 방식)만 더한다.
import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '@/app/shortcuts';
import { bellActionOf, bellKeyTableOf } from '@/ui/challenge/bellKeys';
import type { BellAction, BellForm } from '@/ui/challenge/bellKeys';
import { BENCH_KEY_TABLE, benchActionOf } from '@/ui/challenge/benchKeys';

const FORMS: BellForm[] = ['tree', 'tower', 'glade'];
const code = (c: string, form: BellForm = 'tree', extra: object = {}) => bellActionOf({ code: c, ...extra }, form);

describe('종나무 키 지도(4.6)', () => {
  it('공통 키는 4.2의 표 그대로다. ↑ ↓만 손이 아니라 종의 높이(가지)를 바꾼다. 세 모양 모두 같다', () => {
    const table: Array<[string, BellAction]> = [
      ['ArrowLeft', 'cursor-left'],
      ['ArrowRight', 'cursor-right'],
      ['ArrowUp', 'ring-up'],
      ['ArrowDown', 'ring-down'],
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
    for (const form of FORMS) {
      for (const [c, action] of table) {
        expect(code(c, form), `${form} ${c}`).toBe(action);
        // 높이 키를 뺀 나머지는 공통 키와 같은 동작이다
        if (c !== 'ArrowUp' && c !== 'ArrowDown') expect(code(c, form), `${c}: 공통 키와 같은 동작`).toBe(benchActionOf({ code: c }));
      }
    }
  });

  it('Shift+↑ ↓는 변화표다(공통 키와 같다). PageUp과 PageDown은 손에 든 종의 음이름이다', () => {
    for (const form of FORMS) {
      expect(code('ArrowUp', form, { shiftKey: true })).toBe('accidental-up');
      expect(code('ArrowDown', form, { shiftKey: true })).toBe('accidental-down');
      expect(code('PageUp', form)).toBe('letter-next');
      expect(code('PageDown', form)).toBe('letter-prev');
    }
    expect(bellActionOf({ key: 'PageUp' }, 'tree')).toBe('letter-next');
    expect(bellActionOf({ key: 'PageDown' }, 'tree')).toBe('letter-prev');
    // 공통 키 지도에는 없는 키라 4.2의 표가 바뀌지 않는다
    expect(benchActionOf({ code: 'PageUp' })).toBeNull();
    for (const c of ['PageUp', 'PageDown']) for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) expect(code(c, 'tree', { [m]: true }), `${c}+${m}`).toBeNull();
  });

  it('Shift+← →: 종탑은 가로 자리 맞바꾸기, 빈터는 나무 건너뛰기, 나무 하나짜리(tree)는 받지 않는다', () => {
    expect(code('ArrowLeft', 'tower', { shiftKey: true })).toBe('swap-left');
    expect(code('ArrowRight', 'tower', { shiftKey: true })).toBe('swap-right');
    expect(code('ArrowLeft', 'glade', { shiftKey: true })).toBe('tree-prev');
    expect(code('ArrowRight', 'glade', { shiftKey: true })).toBe('tree-next');
    expect(code('ArrowLeft', 'tree', { shiftKey: true })).toBeNull();
    expect(code('ArrowRight', 'tree', { shiftKey: true })).toBeNull();
    // 합성 이벤트(code 없음)도 key로 읽는다
    expect(bellActionOf({ key: 'ArrowLeft', shiftKey: true }, 'tower')).toBe('swap-left');
    // Ctrl·Alt·Cmd와 함께 누른 것은 받지 않는다
    for (const m of ['ctrlKey', 'altKey', 'metaKey']) expect(code('ArrowLeft', 'tower', { shiftKey: true, [m]: true }), m).toBeNull();
  });

  it('X는 소리 끄기(종탑), R은 듣는 방식, Shift+P는 고른 나무만 듣기다. 한글 자판에서도 같은 자리의 키다', () => {
    for (const form of FORMS) {
      expect(code('KeyX', form)).toBe('mute');
      expect(code('KeyR', form)).toBe('mode-next');
      expect(code('KeyP', form, { shiftKey: true })).toBe('hear-tree');
    }
    expect(bellActionOf({ code: 'KeyX', key: 'ㅌ' }, 'tower')).toBe('mute');
    expect(bellActionOf({ code: 'KeyR', key: 'ㄱ' }, 'tree')).toBe('mode-next');
    // code가 없는 합성 이벤트는 key로 읽는다
    expect(bellActionOf({ key: 'x' }, 'tower')).toBe('mute');
    expect(bellActionOf({ key: 'R' }, 'tree')).toBe('mode-next');
  });

  it('다른 키와 함께 누른 글자 키, 모르는 키는 받지 않는다(브라우저 단축키를 건드리지 않는다)', () => {
    for (const c of ['KeyX', 'KeyR']) {
      expect(code(c, 'tower', { ctrlKey: true }), `Ctrl+${c}`).toBeNull();
      expect(code(c, 'tower', { metaKey: true }), `Meta+${c}`).toBeNull();
      expect(code(c, 'tower', { altKey: true }), `Alt+${c}`).toBeNull();
      expect(code(c, 'tower', { shiftKey: true }), `Shift+${c}`).toBeNull();
    }
    expect(code('KeyQ')).toBeNull();
    expect(code('Tab')).toBeNull();
    expect(bellActionOf({}, 'tree')).toBeNull();
  });

  it('앱 전체의 단축키(M 지도, L 목록, N 수첩, 7.5)는 작업대가 받지 않는다: 작업대가 받는 키와 전역 단축키가 겹치지 않는다', () => {
    for (const c of ['KeyM', 'KeyL', 'KeyN']) {
      expect(resolveShortcut({ code: c }, { kind: 'home' })).not.toBeNull();
      for (const form of FORMS) expect(code(c, form), `${form} ${c}`).toBeNull();
    }
    const candidates = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `Key${l}`).concat(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter', 'NumpadEnter', 'Space', 'Backspace', 'Delete', 'Escape', 'Tab']);
    for (const form of FORMS) {
      const both = candidates.filter((c) => code(c, form) !== null && resolveShortcut({ code: c }, { kind: 'home' }) !== null);
      expect(both, form).toEqual([]);
    }
  });

  it('실행 취소와 다시 실행은 공통 키와 같다(Ctrl·Cmd+Z, Ctrl+Y, Shift+Z)', () => {
    expect(code('KeyZ', 'tree', { ctrlKey: true })).toBe('undo');
    expect(code('KeyZ', 'tree', { metaKey: true })).toBe('undo');
    expect(code('KeyZ', 'tree', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(code('KeyY', 'tree', { ctrlKey: true })).toBe('redo');
    expect(code('KeyZ', 'tree', { shiftKey: true })).toBe('redo');
    // Ctrl과 함께 누른 화살표와 높이 키는 받지 않는다
    expect(code('ArrowUp', 'tree', { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(code('ArrowDown', 'tree', { altKey: true })).toBeNull();
  });
});

describe('종나무 도움 카드의 키 표', () => {
  const keysOf = (form: BellForm): string[] => bellKeyTableOf(form).map((r) => r.keys);

  it('공통 표의 키 가운데 이 작업대가 받는 것(Z Y, P, T, S, C, V, H, Esc, ← →, Enter)을 모두 싣는다', () => {
    for (const form of FORMS) {
      const keys = keysOf(form);
      for (const row of BENCH_KEY_TABLE) {
        // ↑ ↓와 변화표 줄은 종나무가 자기 말로 다시 쓴다
        if (row.keys === '↑ ↓' || row.keys === 'Shift+↑ ↓' || row.keys === 'Backspace') continue;
        if (row.keys === 'Enter, Space') expect(keys, form).toContain('Enter, Space');
        else if (row.keys === '← →') expect(keys, form).toContain('← →');
        else expect(keys, `${form}: ${row.keys}`).toContain(row.keys);
      }
      expect(keys, form).toContain('↑ ↓');
      expect(keys, form).toContain('R');
    }
  });

  it('나무와 빈터는 음이름(PageUp PageDown)과 변화표(Shift+↑ ↓)와 빼기(Backspace)를 싣고, 종탑은 싣지 않는다', () => {
    for (const form of ['tree', 'glade'] as const) {
      expect(keysOf(form), form).toEqual(expect.arrayContaining(['PageUp PageDown', 'Shift+↑ ↓', 'Backspace']));
    }
    const tower = keysOf('tower');
    for (const k of ['PageUp PageDown', 'Shift+↑ ↓', 'Backspace']) expect(tower).not.toContain(k);
    expect(tower).toEqual(expect.arrayContaining(['Shift+← →', 'X']));
  });

  it('Shift+← →의 뜻이 모양마다 다르다: 종탑은 가로 자리(전위는 그대로), 빈터는 나무 건너뛰기, 나무 하나짜리는 줄이 없다', () => {
    const row = (form: BellForm) => bellKeyTableOf(form).find((r) => r.keys === 'Shift+← →');
    expect(row('tower')?.label).toContain('가로 자리');
    expect(row('tower')?.label).toContain('전위는 그대로');
    expect(row('glade')?.label).toBe('나무 건너뛰기');
    expect(row('tree')).toBeUndefined();
    // Shift+P(고른 나무의 화음만 듣기)는 빈터에만 있다
    expect(keysOf('glade')).toContain('Shift+P');
    expect(keysOf('tree')).not.toContain('Shift+P');
    expect(keysOf('tower')).not.toContain('Shift+P');
  });

  it('줄마다 키와 말이 있고 같은 키 줄이 겹치지 않는다. 키 표에 싣는 키는 모두 실제로 받는 키다', () => {
    for (const form of FORMS) {
      const table = bellKeyTableOf(form);
      expect(table.every((r) => r.keys.length > 0 && r.label.length > 0)).toBe(true);
      expect(new Set(table.map((r) => r.keys)).size).toBe(table.length);
    }
    // 표에 적힌 단순한 키(한 글자, 이름이 하나인 키)는 같은 모양에서 어떤 동작으로 읽힌다
    const byName: Record<string, string> = { X: 'KeyX', R: 'KeyR', P: 'KeyP', T: 'KeyT', S: 'KeyS', C: 'KeyC', V: 'KeyV', H: 'KeyH', Esc: 'Escape' };
    for (const form of FORMS) {
      for (const [name, c] of Object.entries(byName)) {
        if (keysOf(form).includes(name)) expect(code(c, form), `${form} ${name}`).not.toBeNull();
      }
    }
  });
});
