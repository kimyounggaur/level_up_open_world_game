// 6-4 징검다리(T2) 작업대의 키 지도. 설치물 모드의 공통 키(4.2, benchKeys)를 그대로 쓰고, 징검다리에 필요한 것(돌 길이, 재료 종류)만 더한다.
import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '@/app/shortcuts';
import { BENCH_KEY_TABLE, benchActionOf } from '@/ui/challenge/benchKeys';
import { TIMELINE_KEY_TABLE, timelineActionOf } from '@/ui/challenge/timelineKeys';
import type { TimelineAction } from '@/ui/challenge/timelineKeys';

const code = (c: string, extra: object = {}) => timelineActionOf({ code: c, ...extra });

describe('징검다리 키 지도(4.4)', () => {
  it('공통 키는 4.2의 표 그대로다', () => {
    const table: Array<[string, TimelineAction]> = [
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
    for (const [c, action] of table) {
      expect(code(c), c).toBe(action);
      expect(code(c), `${c}: 공통 키와 같은 동작`).toBe(benchActionOf({ code: c }));
    }
  });

  it('Shift+↑ ↓는 변화표가 아니라 돌 길이를 바꾼다(징검다리에는 변화표가 없다)', () => {
    expect(code('ArrowUp', { shiftKey: true })).toBe('length-up');
    expect(code('ArrowDown', { shiftKey: true })).toBe('length-down');
    expect(benchActionOf({ code: 'ArrowUp', shiftKey: true })).toBe('accidental-up');
  });

  it('R은 울림돌과 이끼돌을 바꾼다. 한글 자판에서도 같은 자리의 키다(key가 한글이어도 code를 따른다)', () => {
    expect(code('KeyR')).toBe('kind-next');
    expect(timelineActionOf({ code: 'KeyR', key: 'ㄱ' })).toBe('kind-next');
    // code가 없는 합성 이벤트는 key로 읽는다
    expect(timelineActionOf({ key: 'r' })).toBe('kind-next');
    expect(timelineActionOf({ key: 'R' })).toBe('kind-next');
  });

  it('PageUp과 PageDown은 박 단위로 옮긴다(6-5: 길어진 줄에서 칸을 하나씩 넘기지 않아도 된다). 다른 키와 함께 누르면 받지 않는다', () => {
    expect(code('PageUp')).toBe('beat-prev');
    expect(code('PageDown')).toBe('beat-next');
    // code가 없는 합성 이벤트는 key로 읽는다
    expect(timelineActionOf({ key: 'PageUp' })).toBe('beat-prev');
    expect(timelineActionOf({ key: 'PageDown' })).toBe('beat-next');
    for (const c of ['PageUp', 'PageDown']) for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) expect(code(c, { [m]: true }), `${c}+${m}`).toBeNull();
    // 공통 키 지도(benchKeys)에는 없는 키라 4.2의 표가 바뀌지 않는다
    expect(benchActionOf({ code: 'PageUp' })).toBeNull();
    expect(benchActionOf({ code: 'PageDown' })).toBeNull();
  });

  it('R과 함께 다른 키를 눌렀거나 모르는 키이면 받지 않는다(브라우저 단축키를 건드리지 않는다)', () => {
    expect(code('KeyR', { ctrlKey: true })).toBeNull();
    expect(code('KeyR', { metaKey: true })).toBeNull();
    expect(code('KeyR', { altKey: true })).toBeNull();
    expect(code('KeyR', { shiftKey: true })).toBeNull();
    expect(code('KeyQ')).toBeNull();
    expect(code('Tab')).toBeNull();
    expect(timelineActionOf({})).toBeNull();
  });

  it('앱 전체의 단축키(M 지도, L 목록, N 수첩, 7.5)는 작업대가 받지 않는다: 작업대가 받는 키와 전역 단축키가 겹치지 않는다', () => {
    // 겹치면 한 번의 키 누름이 작업대와 수첩에 함께 가서 수첩이 열리고 작업대가 가려진다(실제 Chrome에서 찾은 문제)
    for (const c of ['KeyM', 'KeyL', 'KeyN']) {
      expect(resolveShortcut({ code: c }, { kind: 'home' })).not.toBeNull();
      expect(code(c)).toBeNull();
    }
    const candidates = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `Key${l}`).concat(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter', 'NumpadEnter', 'Space', 'Backspace', 'Delete', 'Escape', 'Tab']);
    const both = candidates.filter((c) => code(c) !== null && resolveShortcut({ code: c }, { kind: 'home' }) !== null);
    expect(both).toEqual([]);
  });

  it('Alt와 함께 누른 화살표와 Ctrl·Cmd와 함께 누른 화살표는 받지 않는다', () => {
    expect(code('ArrowLeft', { altKey: true })).toBeNull();
    expect(code('ArrowUp', { altKey: true, shiftKey: true })).toBeNull();
    expect(code('ArrowUp', { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(code('ArrowDown', { metaKey: true })).toBeNull();
  });

  it('실행 취소와 다시 실행은 공통 키와 같다(Ctrl·Cmd+Z, Ctrl+Y, Shift+Z)', () => {
    expect(code('KeyZ', { ctrlKey: true })).toBe('undo');
    expect(code('KeyZ', { metaKey: true })).toBe('undo');
    expect(code('KeyZ', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(code('KeyY', { ctrlKey: true })).toBe('redo');
    expect(code('KeyZ', { shiftKey: true })).toBe('redo');
  });

  it('도움 카드의 키 표: 공통 표의 키를 모두 싣고 돌 길이 키와 종류 키를 더한다. 변화표 줄은 없다', () => {
    const keys = TIMELINE_KEY_TABLE.map((r) => r.keys);
    for (const k of ['← →', 'Enter, Space', 'Backspace', 'Z, Y', 'P', 'T', 'S', 'C', 'V', 'H', 'Esc']) expect(keys).toContain(k);
    expect(keys).toContain('R');
    expect(keys).toContain('Shift+↑ ↓');
    expect(TIMELINE_KEY_TABLE.find((r) => r.keys === 'Shift+↑ ↓')!.label).toBe('돌 길이 바꾸기(뗏목은 뗏목의 종류)');
    expect(TIMELINE_KEY_TABLE.find((r) => r.keys === '↑ ↓')!.label).toBe('음높이 바꾸기');
    expect(TIMELINE_KEY_TABLE.find((r) => r.keys === 'R')!.label).toBe('울림돌과 이끼돌 바꾸기(뗏목이 있으면 뗏목까지)');
    expect(TIMELINE_KEY_TABLE.find((r) => r.keys === 'PageUp PageDown')!.label).toBe('박 옮기기');
    expect(TIMELINE_KEY_TABLE.some((r) => r.label.includes('변화표'))).toBe(false);
    // 공통 표에 더한 줄은 둘이다: R(돌의 종류)과 PageUp PageDown(박 옮기기). 변화표 줄은 돌 길이 줄로 바뀐다
    expect(TIMELINE_KEY_TABLE).toHaveLength(BENCH_KEY_TABLE.length + 2);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
