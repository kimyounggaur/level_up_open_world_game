// 7.5 화면 상태와 전역 단축키: Esc는 닫기, M은 지도, L은 목록, N은 수첩(다시 누르면 닫기). 입력 중이나 한글 조합 중에는 가로채지 않는다.
import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '../../src/app/shortcuts';
import type { Route } from '../../src/platform/router';
import { benchActionOf } from '../../src/ui/challenge/benchKeys';
import { stageActionOf } from '../../src/ui/challenge/stageKeys';
import { timelineActionOf } from '../../src/ui/challenge/timelineKeys';

const home: Route = { kind: 'home' };
const map: Route = { kind: 'overlay', page: 'map' };
const list: Route = { kind: 'overlay', page: 'list' };
const notebook: Route = { kind: 'overlay', page: 'notebook' };
const station: Route = { kind: 'station', stationId: 'H4' };
const quest: Route = { kind: 'quest', hash: '#/q/rhythm.rest-in-a-bar/quarter-rest' };
const dev: Route = { kind: 'dev', page: 'sound-check' };
const unknown: Route = { kind: 'unknown', hash: '#/whatever' };

const key = (code: string, extra: Record<string, unknown> = {}) => ({ code, ...extra });

describe('Esc', () => {
  it('열린 화면(지도, 목록, 정거장 안내, 패널, 개발 화면, 모르는 주소)을 닫는다', () => {
    for (const r of [map, list, notebook, station, quest, dev, unknown]) expect(resolveShortcut(key('Escape'), r)).toEqual({ type: 'close' });
  });

  it('탐험 화면에서는 아무 일도 없다(월드가 받는다)', () => {
    expect(resolveShortcut(key('Escape'), home)).toBeNull();
  });

  it('입력칸에서도 닫는다(입력칸에서는 Esc가 다른 일을 하지 않는다). 한글 조합 중에는 조합이 먼저다', () => {
    expect(resolveShortcut(key('Escape', { target: { tagName: 'INPUT' } }), quest)).toEqual({ type: 'close' });
    expect(resolveShortcut(key('Escape', { isComposing: true }), quest)).toBeNull();
  });

  it('code가 없는 합성 이벤트는 key로 읽는다', () => {
    expect(resolveShortcut({ key: 'Escape' }, map)).toEqual({ type: 'close' });
  });
});

describe('M(지도), L(목록), N(수첩)', () => {
  it('탐험 화면과 겹침 화면, 정거장 안내에서 연다', () => {
    for (const r of [home, list, station]) expect(resolveShortcut(key('KeyM'), r)).toEqual({ type: 'go', hash: '#/map' });
    for (const r of [home, map, station]) expect(resolveShortcut(key('KeyL'), r)).toEqual({ type: 'go', hash: '#/list' });
    for (const r of [home, map, list, station]) expect(resolveShortcut(key('KeyN'), r)).toEqual({ type: 'go', hash: '#/notebook' });
  });

  it('수첩에서 지도나 목록으로 바로 건너갈 수 있다(수첩에 갇히지 않는다)', () => {
    expect(resolveShortcut(key('KeyM'), notebook)).toEqual({ type: 'go', hash: '#/map' });
    expect(resolveShortcut(key('KeyL'), notebook)).toEqual({ type: 'go', hash: '#/list' });
  });

  it('같은 화면에서 다시 누르면 닫는다(토글)', () => {
    expect(resolveShortcut(key('KeyM'), map)).toEqual({ type: 'close' });
    expect(resolveShortcut(key('KeyL'), list)).toEqual({ type: 'close' });
    expect(resolveShortcut(key('KeyN'), notebook)).toEqual({ type: 'close' });
  });

  it('한글 자판(ㅡ, ㅣ)에서도 물리 키 위치로 동작한다. code가 없을 때만 key를 본다', () => {
    expect(resolveShortcut({ code: 'KeyM', key: 'ㅡ' }, home)).toEqual({ type: 'go', hash: '#/map' });
    expect(resolveShortcut({ code: 'KeyL', key: 'ㅣ' }, home)).toEqual({ type: 'go', hash: '#/list' });
    expect(resolveShortcut({ key: 'm' }, home)).toEqual({ type: 'go', hash: '#/map' });
    expect(resolveShortcut({ key: 'L' }, home)).toEqual({ type: 'go', hash: '#/list' });
    expect(resolveShortcut({ code: 'KeyN', key: 'ㅜ' }, home)).toEqual({ type: 'go', hash: '#/notebook' });
    expect(resolveShortcut({ key: 'n' }, home)).toEqual({ type: 'go', hash: '#/notebook' });
    expect(resolveShortcut({ key: 'N' }, home)).toEqual({ type: 'go', hash: '#/notebook' });
  });

  it('과제 패널 안에서는 글자 키를 가로채지 않는다', () => {
    for (const r of [quest, dev, unknown]) {
      expect(resolveShortcut(key('KeyM'), r)).toBeNull();
      expect(resolveShortcut(key('KeyL'), r)).toBeNull();
      expect(resolveShortcut(key('KeyN'), r)).toBeNull();
    }
  });

  it('글자를 입력하는 중에는 가로채지 않는다', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(resolveShortcut(key('KeyM', { target: { tagName: tag } }), home)).toBeNull();
    expect(resolveShortcut(key('KeyL', { target: { tagName: 'DIV', isContentEditable: true } }), home)).toBeNull();
    expect(resolveShortcut(key('KeyN', { target: { tagName: 'INPUT' } }), home)).toBeNull();
  });

  it('꾹 누르기(repeat)는 한 번으로 센다', () => {
    expect(resolveShortcut(key('KeyM', { repeat: true }), home)).toBeNull();
    expect(resolveShortcut(key('KeyN', { repeat: true }), home)).toBeNull();
  });

  it('Ctrl, Alt, Meta와 함께 누른 것은 브라우저 단축키이므로 받지 않는다. 이미 처리된 이벤트도 받지 않는다', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey']) {
      expect(resolveShortcut(key('KeyM', { [mod]: true }), home)).toBeNull();
      expect(resolveShortcut(key('KeyN', { [mod]: true }), home)).toBeNull();
      expect(resolveShortcut(key('Escape', { [mod]: true }), quest)).toBeNull();
    }
    expect(resolveShortcut(key('KeyM', { defaultPrevented: true }), home)).toBeNull();
    expect(resolveShortcut(key('KeyN', { defaultPrevented: true }), home)).toBeNull();
    expect(resolveShortcut(key('Escape', { defaultPrevented: true }), quest)).toBeNull();
  });

  it('그 밖의 키는 월드와 패널의 것이다', () => {
    for (const code of ['KeyE', 'Enter', 'ArrowUp', 'KeyW', 'Space', 'Tab', 'KeyB', 'KeyO']) expect(resolveShortcut(key(code), home)).toBeNull();
  });
});

describe('설치물 작업대의 키와 겹치지 않는다', () => {
  it('돌 작업대(4.2), 무대 작업대(4.6), 징검다리 작업대(4.4)가 받는 키는 전역 단축키가 아니다(M 지도, L 목록, N 수첩)', () => {
    // 한 번의 키 누름이 작업대와 전역 단축키에 함께 가면 수첩이 열려 작업대가 가려진다. 새 작업대의 키를 정할 때 이 시험이 막는다
    const candidates = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `Key${l}`).concat(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'NumpadEnter', 'Space', 'Backspace', 'Delete', 'Tab', 'Digit1', 'Digit2', 'Digit3']);
    const readers = { 돌: benchActionOf, 무대: stageActionOf, 징검다리: timelineActionOf };
    for (const [name, read] of Object.entries(readers)) {
      const both = candidates.filter((code) => read({ code }) !== null && resolveShortcut(key(code), home) !== null);
      expect({ name, both }).toEqual({ name, both: [] });
    }
  });
});
