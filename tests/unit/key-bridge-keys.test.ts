// 7-3 건반 다리(T6) 작업대의 키 지도와 안내 문장(4.8). 설치물 모드의 공통 키(4.2, benchActionOf)를 그대로 쓰고 다리에서 각 키가 하는 일만 정한다.
import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '@/app/shortcuts';
import type { BridgeTask } from '@/domain/keyBridge';
import { benchActionOf } from '@/ui/challenge/benchKeys';
import { bridgeActionOf, bridgeKeyTableOf } from '@/ui/challenge/keyBridgeKeys';
import type { BridgeAction } from '@/ui/challenge/keyBridgeKeys';
import { NO_FLAG_NOTICE, NO_STAKE_NOTICE, NO_TAG_NOTICE, PICK_ITEM_FIRST, PICK_PLANK_FIRST, PICK_STAKE_FIRST, TAG_ONLY_NOTICE, bridgeEntryText, bridgeIdleLead, bridgePassedText } from '@/ui/challenge/keyBridgeText';

const code = (c: string, extra: object = {}) => bridgeActionOf({ code: c, ...extra });
const TASKS: BridgeTask[] = ['names', 'interval', 'flags'];

describe('건반 다리 키 지도(4.8)', () => {
  it('키는 4.2의 표 그대로다: ← →는 널, ↑ ↓는 할 것, Shift+↑ ↓는 이름 바꾸기, Enter와 Space는 놓기다', () => {
    const table: Array<[string, BridgeAction]> = [
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
    expect(code('ArrowUp', { shiftKey: true })).toBe('accidental-up');
    expect(code('ArrowDown', { shiftKey: true })).toBe('accidental-down');
  });

  it('글자 키는 물리 키로 읽어서 한글 자판에서도 같은 자리가 같은 동작이다', () => {
    expect(bridgeActionOf({ code: 'KeyP', key: 'ㅔ' })).toBe('hear-mine');
    expect(bridgeActionOf({ code: 'KeyT', key: 'ㅅ' })).toBe('hear-target');
    expect(bridgeActionOf({ code: 'KeyC', key: 'ㅊ' })).toBe('check');
  });

  it('Ctrl·Meta와 함께 누르면 실행 취소·다시 실행만 받고, Alt와 함께 누른 것은 받지 않는다. 모르는 키는 받지 않는다', () => {
    expect(code('KeyZ', { ctrlKey: true })).toBe('undo');
    expect(code('KeyZ', { metaKey: true, shiftKey: true })).toBe('redo');
    for (const c of ['KeyP', 'KeyS', 'KeyC', 'ArrowUp', 'Enter']) expect(code(c, { ctrlKey: true }), `Ctrl+${c}`).toBeNull();
    for (const c of ['KeyP', 'ArrowUp', 'Enter']) expect(code(c, { altKey: true }), `Alt+${c}`).toBeNull();
    for (const c of ['KeyQ', 'KeyX', 'Tab', 'Home', 'PageUp', 'PageDown']) expect(code(c), c).toBeNull();
    expect(bridgeActionOf({})).toBeNull();
  });

  it('앱 전체의 단축키(M 지도, L 목록, N 수첩, 7.5)와 겹치지 않는다', () => {
    for (const c of ['KeyM', 'KeyL', 'KeyN']) {
      expect(resolveShortcut({ code: c }, { kind: 'home' })).not.toBeNull();
      expect(code(c), c).toBeNull();
    }
    const candidates = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `Key${l}`).concat(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'NumpadEnter', 'Space', 'Backspace', 'Delete', 'Escape', 'Tab']);
    expect(candidates.filter((c) => code(c) !== null && resolveShortcut({ code: c }, { kind: 'home' }) !== null)).toEqual([]);
  });
});

describe('도움 카드의 키 표(bridgeKeyTableOf)', () => {
  const keysOf = (task: BridgeTask | null): string[] => bridgeKeyTableOf(task).map((r) => r.keys);

  it('과제를 열지 않았으면 널을 옮기는 키와 공통 키만 보인다', () => {
    expect(keysOf(null)).toEqual(['← →', 'Z, Y', 'P', 'T', 'S', 'C', 'V', 'H', 'Esc']);
  });

  it('이름 과제는 이름표 자리를 고르고 이름표를 바꾸고 떼는 키가 있다', () => {
    expect(bridgeKeyTableOf('names').map((r) => [r.keys, r.label])).toEqual([
      ['← →', '널 옮기기(소리가 울려요)'],
      ['↑ ↓', '이름표 자리 고르기'],
      ['Enter, Space', '이 널의 이름표 자리 고르기'],
      ['Shift+↑ ↓', '이름표 바꾸기'],
      ['Backspace', '이름표 떼기'],
      ['Z, Y', '실행 취소, 다시 실행'],
      ['P', '내 것 듣기'],
      ['T', '목표 듣기'],
      ['S', '정지'],
      ['C', '확인'],
      ['V', '패널로 보기'],
      ['H', '도움'],
      ['Esc', '나가기'],
    ]);
  });

  it('음정 과제는 밧줄을 고르고 끝 말뚝을 꽂고 이름을 바꾸는 키가 있고, 깃발 과제는 깃발을 고르고 꽂고 빼는 키가 있다', () => {
    expect(bridgeKeyTableOf('interval').slice(0, 5).map((r) => r.label)).toEqual(['널 옮기기(소리가 울려요)', '밧줄 고르기', '끝 말뚝 꽂기(음 쌓기), 두 음 들어 보기', '끝 말뚝의 이름 바꾸기(음 쌓기)', '답 비우기']);
    expect(bridgeKeyTableOf('flags').slice(0, 4).map((r) => r.label)).toEqual(['널 옮기기(소리가 울려요)', '깃발 고르기', '고른 깃발 꽂기', '고른 깃발 빼기']);
  });

  it('모든 과제의 표에 4.2의 공통 키가 있고 설명이 비어 있지 않다. 같은 키가 두 번 나오지 않는다', () => {
    for (const task of [...TASKS, null]) {
      const rows = bridgeKeyTableOf(task);
      for (const k of ['← →', 'Z, Y', 'P', 'T', 'S', 'C', 'V', 'H', 'Esc']) expect(rows.map((r) => r.keys), `${task} ${k}`).toContain(k);
      for (const r of rows) expect(r.label.length, `${task} ${r.keys}`).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.keys)).size, String(task)).toBe(rows.length);
    }
  });
});

describe('안내 문장(keyBridgeText)', () => {
  it('들어왔을 때의 말: 다리의 이름과 과제에 맞는 조작을 알려 준다. 도움(H)과 나가기(Esc)도 알린다', () => {
    expect(bridgeEntryText('건반 다리', 'names')).toBe('건반 다리에 들어왔어요. ← →로 널을 옮기며 소리를 들어 보고, ↑ ↓로 이름표 자리를 골라요. Shift+↑↓나 이름표 단추로 이름표를 걸어요. 도움은 H, 나가기는 Esc예요.');
    expect(bridgeEntryText('음정 밧줄', 'interval')).toContain('↑ ↓로 질문을 골라요');
    expect(bridgeEntryText('제자리표 다리', 'flags')).toContain('깃발을 꽂아요');
    expect(bridgeEntryText('건반 다리', null)).toBe('건반 다리에 들어왔어요. ← →로 널을 옮기며 소리를 들어 보세요. 도움은 H, 나가기는 Esc예요.');
    for (const task of TASKS) expect(bridgeEntryText('다리', task), task).toMatch(/도움은 H, 나가기는 Esc/);
  });

  it('문제를 푸는 중의 안내에는 검은 널의 이름(♯, ♭)이 나오지 않는다: 이름을 알려 주면 이름 붙이는 일이 사라진다', () => {
    const texts = [
      PICK_ITEM_FIRST,
      NO_TAG_NOTICE,
      NO_FLAG_NOTICE,
      NO_STAKE_NOTICE,
      TAG_ONLY_NOTICE,
      PICK_STAKE_FIRST,
      PICK_PLANK_FIRST,
      ...TASKS.map((t) => bridgeEntryText('다리', t)),
      ...TASKS.map((t) => bridgeIdleLead(t, 4, 0)),
    ];
    for (const t of texts) expect(t, t).not.toMatch(/[♯♭]/);
  });

  it('확인하기 전의 한 줄: 하나도 안 채웠으면 모두 채우라고, 일부만 채웠으면 채운 수를, 다 채웠으면 확인을 누르라고 한다', () => {
    expect(bridgeIdleLead('names', 10, 0)).toBe("이름표를 모두 채우고 '확인'을 눌러 보세요.");
    expect(bridgeIdleLead('flags', 4, 0)).toBe("깃발을 모두 채우고 '확인'을 눌러 보세요.");
    expect(bridgeIdleLead('interval', 4, 0)).toBe("답을 모두 채우고 '확인'을 눌러 보세요.");
    expect(bridgeIdleLead('names', 10, 3)).toBe("이름표가 3/10개 채워져 있어요. 모두 채우고 '확인'을 눌러 보세요.");
    expect(bridgeIdleLead('flags', 4, 4)).toBe("다 채웠어요. '확인'을 눌러 보세요.");
  });

  it('통과했을 때 덧붙이는 말은 과제마다 그 과제의 핵심이다', () => {
    expect(bridgePassedText('names')).toBe('검은 널 하나에 이름이 둘이에요. 이름은 달라도 소리는 같아요.');
    expect(bridgePassedText('interval')).toBe('도수는 이름의 글자 수로, 반음 수는 널의 수로 세어요.');
    expect(bridgePassedText('flags')).toBe('임시표는 그 마디가 끝날 때까지 이어지고, 다음 마디에서는 조표가 다시 적용돼요.');
  });
});
