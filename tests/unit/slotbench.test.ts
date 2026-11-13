// 4단계 놓기 작업대(SlotBench)와 컨트롤러의 순서 칸·자유로 놀기. 설계서 4.2, 4.3.
// 완료 기준 4-2: 디딤돌을 키보드로(←→ ↑↓ Enter) 놓아 음계를 만들고 확인하면 통과한다. 놓은 것은 초안 하나에 담긴다.
import { describe, expect, it } from 'vitest';
import { FREE_PLAY_NO_CHECK, FREE_PLAY_NO_TARGET, NO_SLOT_NOTES_NOTICE } from '@/ui/challenge/controller';
import type { TouchEvent } from '@/ui/challenge/controller';
import { Q07, installation, quest, rig } from './controller-rig';
import type { Rig } from './controller-rig';

const names = (r: Rig): Array<string | null> => r.bench.views().map((v) => v.name);

/** 8자리를 키보드만으로 놓는다: → 로 자리를 옮기고 Enter로 놓고 ↑ 로 손의 음을 한 칸 올린다(으뜸음부터 한 음씩 위로) */
function typeScale(r: Rig): void {
  for (let i = 0; i < 8; i++) {
    r.bench.perform('cursor-right');
    r.bench.perform('place');
    r.bench.perform('hand-up');
  }
}

describe('열기와 손', () => {
  it('열려 있는 과제가 없으면 작업대를 쓸 수 없다', () => {
    const r = rig();
    expect(r.bench.available).toBe(false);
    expect(() => r.bench.map).toThrow(/놓기 작업대가 없어요/);
    // 쓸 수 없는 동안의 조작은 아무 일도 하지 않는다
    r.bench.perform('place');
    r.bench.moveCursor(1);
    r.bench.moveHand(1);
    expect(r.session.serialize().challengeDrafts).toEqual({});
  });

  it('음계 과제를 열면 으뜸음 한 음 아래부터 옥타브 위 한 음까지 선반이 있고 손에는 으뜸음이 들린다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    expect(r.bench.available).toBe(true);
    expect(r.bench.map.count).toBe(8);
    expect(r.bench.map.shelf.map((s) => s.name)).toEqual(['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']);
    expect(r.bench.handName()).toBe('C4');
    expect(r.bench.cursor).toBeNull();
  });

  it('↑ ↓ 는 손에 든 음을 선반을 따라 올리고 내리며, 끝에서는 멈추고 알린다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('hand-up');
    expect(r.bench.handName()).toBe('D4');
    expect(r.controller.live).toBe('손에 든 음은 D4예요.');
    r.bench.perform('hand-down');
    r.bench.perform('hand-down');
    expect(r.bench.handName()).toBe('B3');
    r.bench.perform('hand-down');
    expect(r.bench.handName()).toBe('B3');
    expect(r.controller.live).toContain('재료 선반의 맨 아래예요');
    for (let i = 0; i < 20; i++) r.bench.perform('hand-up');
    expect(r.bench.handName()).toBe('D5');
    expect(r.controller.live).toContain('재료 선반의 맨 위예요');
  });

  it('Shift+↑ ↓ 는 변화표를 ♭ 없음 ♯ 사이로 바꾸고, 끝에서는 멈춘다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('accidental-up');
    expect(r.bench.handName()).toBe('C♯4');
    r.bench.perform('accidental-up');
    expect(r.bench.handName()).toBe('C♯4');
    expect(r.controller.live).toContain('변화표를 더 올릴 수 없어요');
    r.bench.perform('accidental-down');
    r.bench.perform('accidental-down');
    expect(r.bench.handName()).toBe('C♭4');
    r.bench.perform('accidental-down');
    expect(r.controller.live).toContain('변화표를 더 내릴 수 없어요');
  });

  it('조표가 있는 판본에서는 변화표 없는 B가 B♭으로 읽힌다(F장조)', () => {
    const r = rig();
    r.controller.open(Q07, 'f-major');
    expect(r.bench.map.shelf.map((s) => s.name)).toEqual(['E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']);
    expect(r.bench.handName()).toBe('F4');
    r.bench.pickShelf(4);
    expect(r.bench.handName()).toBe('B♭4');
  });

  it('도전이 바뀌면 손은 다시 으뜸음으로 돌아온다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.pickShelf(5);
    expect(r.bench.handName()).toBe('G4');
    r.controller.open(Q07, 'f-major');
    expect(r.bench.handName()).toBe('F4');
    r.controller.open(Q07, 'c-major');
    expect(r.bench.handName()).toBe('C4');
  });

  it('선반 칸과 변화표를 눌러서 고를 수 있다. 범위 밖은 무시한다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.pickShelf(7);
    r.bench.pickAccidental('flat');
    expect(r.bench.handName()).toBe('B♭4');
    r.bench.pickShelf(99);
    r.bench.pickShelf(-1);
    r.bench.pickShelf(1.5);
    expect(r.bench.handName()).toBe('B♭4');
  });
});

describe('자리 고르기', () => {
  it('→ 를 처음 누르면 첫 자리를 고르고, 이어서 한 칸씩 옮긴다. 끝에서는 멈추고 알린다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('cursor-right');
    expect(r.bench.cursor).toBe(1);
    expect(r.controller.live).toBe('1번째 자리, 비어 있어요.');
    r.bench.perform('cursor-left');
    expect(r.bench.cursor).toBe(1);
    expect(r.controller.live).toContain('첫 자리예요');
    for (let i = 0; i < 10; i++) r.bench.perform('cursor-right');
    expect(r.bench.cursor).toBe(8);
    expect(r.controller.live).toContain('마지막 자리예요');
  });

  it('고른 자리는 초안의 선택으로 저장된다(월드와 패널이 같은 자리를 본다)', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.selectSlot(5);
    const saved = r.session.serialize().challengeDrafts['scale.major/c-major']!;
    expect(saved.selectedSlot).toBe(5);
    r.bench.selectSlot(null);
    expect(r.bench.cursor).toBeNull();
    r.bench.selectSlot(9);
    expect(r.bench.cursor).toBeNull();
  });
});

describe('놓기와 빼기', () => {
  it('고른 자리에 손에 든 음을 놓는다. 놓은 자리를 알리고 소리 켠 뒤에는 그 음을 들려 준다', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    await r.controller.enableSound();
    r.bench.selectSlot(3);
    r.bench.pickShelf(3); // E4
    r.engine.sinks.get('task')?.requests.splice(0);
    r.bench.perform('place');
    expect(r.bench.views()[2]).toMatchObject({ slot: 3, name: 'E4', midi: 64 });
    expect(r.controller.live).toBe('3번째 자리에 E4를 놓았어요.');
    expect(r.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([64]);
    expect(r.session.contentOf(Q07, 'c-major').slots).toEqual([{ slot: 3, writtenPitch: { letter: 'E', accidental: null, octave: 4 } }]);
  });

  it('소리를 켜기 전에는 놓아도 소리가 나지 않는다(W-11)', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place');
    expect(r.bench.views()[0]!.name).toBe('C4');
    expect(r.engine.startCalls).toBe(0);
    expect(r.engine.sinks.size).toBe(0);
  });

  it('자리를 고르지 않고 놓으면 첫 자리에 놓인다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place');
    expect(names(r)[0]).toBe('C4');
    expect(r.bench.cursor).toBe(1);
  });

  it('같은 음을 같은 자리에 또 놓으면 아무것도 바뀌지 않고 알려 준다(실행 취소 기록이 늘지 않는다)', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place');
    const depth = r.session.undoDepth;
    r.bench.perform('place');
    expect(r.session.undoDepth).toBe(depth);
    expect(r.controller.live).toBe('1번째 자리에는 이미 C4가 있어요.');
  });

  it('놓인 자리에 다른 음을 놓으면 바뀐다. 빼면 비고, 실행 취소와 다시 실행이 되돌린다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place');
    r.bench.perform('hand-up');
    r.bench.perform('place');
    expect(names(r)[0]).toBe('D4');
    r.bench.perform('remove');
    expect(names(r)[0]).toBeNull();
    expect(r.controller.live).toBe('1번째 자리의 음을 뺐어요.');
    r.bench.perform('undo');
    expect(names(r)[0]).toBe('D4');
    r.bench.perform('undo');
    expect(names(r)[0]).toBe('C4');
    r.bench.perform('redo');
    expect(names(r)[0]).toBe('D4');
  });

  it('비어 있는 자리를 빼려 하면 이미 비어 있다고 알린다. 자리를 고르지 않았으면 먼저 고르라고 한다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('remove');
    expect(r.controller.live).toBe('빼려면 먼저 자리를 골라 주세요.');
    r.bench.selectSlot(2);
    r.bench.perform('remove');
    expect(r.controller.live).toBe('2번째 자리는 이미 비어 있어요.');
    expect(r.session.undoDepth).toBe(0);
  });

  it('눌러서: 빈 자리를 누르면 손에 든 음이 놓이고, 놓인 자리를 누르면 고르기만 한다(덮어쓰지 않는다)', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.press(2);
    expect(names(r)[1]).toBe('C4');
    r.bench.pickShelf(4);
    r.bench.press(2);
    expect(names(r)[1]).toBe('C4'); // 덮어쓰지 않았다
    expect(r.bench.cursor).toBe(2);
    expect(r.controller.live).toBe('2번째 자리, C4가 놓여 있어요. 바꾸려면 놓기를 누르세요.');
    r.bench.perform('place'); // '놓기'는 바꾼다
    expect(names(r)[1]).toBe('F4');
    r.bench.press(99); // 없는 자리
    expect(r.session.contentOf(Q07, 'c-major').slots).toHaveLength(1);
  });

  it('놓은 것은 모두 초안 하나에 담기고 저장된다. 닫았다 열어도 그대로다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place');
    r.bench.perform('cursor-right');
    r.bench.perform('hand-up');
    r.bench.perform('place');
    const saved = r.session.serialize();
    r.controller.close();
    r.controller.open(Q07, 'c-major');
    expect(names(r).slice(0, 3)).toEqual(['C4', 'D4', null]);
    expect(saved.challengeDrafts['scale.major/c-major']!.slots).toHaveLength(2);
  });
});

describe('키보드만으로 음계 만들기(완료 기준 4-2)', () => {
  it('C장조: ← → ↑ ↓ Enter로 C D E F G A B C를 놓고 확인하면 통과한다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    expect(names(r)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(true);
    expect(r.controller.attempts.at(-1)).toMatchObject({ questId: Q07, variantId: 'c-major', resultType: 'passed' });
    expect(r.bench.flagged()).toEqual([]);
  });

  it('F장조: 4번째 자리에 A♯을 놓으면 같은 소리지만 이름이 다르다고 알리고, 그 자리에만 표식이 선다', () => {
    const r = rig();
    r.controller.open(Q07, 'f-major');
    typeScale(r);
    expect(names(r)).toEqual(['F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5', 'F5']);
    r.bench.selectSlot(4);
    r.bench.pickShelf(3); // A4
    r.bench.pickAccidental('sharp');
    r.bench.perform('place');
    expect(names(r)[3]).toBe('A♯4');
    r.bench.perform('check');
    const f = r.controller.feedback!;
    expect(f.passed).toBe(false);
    expect(f.messages).toEqual(['네 번째 자리는 B 이름을 써요. F장조에서는 B♭4예요. 소리 높이는 같아요.']);
    expect(r.bench.flagged()).toEqual([4]);
    // 고치면 표식이 사라진다(놓은 것이 바뀌면 이전 판정은 맞지 않는다)
    r.bench.pickShelf(4);
    r.bench.pickAccidental(null);
    r.bench.perform('place');
    expect(r.bench.flagged()).toEqual([]);
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(true);
  });

  it('두 자리를 바꿔 놓으면 두 자리 모두에 표식이 서고, 목표 듣기는 끝까지 정답을 들려 준다', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    r.bench.selectSlot(3);
    r.bench.pickShelf(4); // F4
    r.bench.perform('place');
    r.bench.selectSlot(4);
    r.bench.pickShelf(3); // E4
    r.bench.perform('place');
    r.bench.perform('check');
    expect(r.controller.feedback?.passed).toBe(false);
    expect(r.bench.flagged()).toEqual([3, 4]);
    await r.controller.enableSound();
    r.bench.perform('hear-target');
    r.run(6);
    expect(r.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('비어 있는 자리가 있으면 몇 번째 자리인지 알려 준다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    r.bench.selectSlot(6);
    r.bench.perform('remove');
    r.bench.perform('check');
    expect(r.controller.feedback?.messages).toEqual(['6번째 자리가 비어 있어요.']);
    expect(r.bench.flagged()).toEqual([6]);
  });
});

describe('듣기(내 배치, 목표, 정지)', () => {
  it('내 배치 듣기: 4분음표 80으로 자리 번호 순서대로 울리고, 빈 자리는 쉰다', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    await r.controller.enableSound();
    r.bench.perform('place'); // 1: C4
    r.bench.selectSlot(3);
    r.bench.pickShelf(3); // E4
    r.bench.perform('place'); // 3: E4
    r.engine.sinks.get('task')!.requests.splice(0);
    r.bench.perform('hear-mine');
    expect(r.controller.playing).toBe('mine');
    r.run(7); // 8자리 × 0.75초 = 6초
    const live = r.engine.sinks.get('task')!.live();
    expect(live.map((q) => q.midi)).toEqual([60, 64]);
    // 4분음표 하나는 0.75초(80 BPM): 3번째 자리는 시작에서 1.5초 뒤
    expect(live[1]!.time - live[0]!.time).toBeCloseTo(1.5, 2);
    expect(live[0]!.duration).toBeCloseTo(0.75, 2);
    expect(r.controller.playing).toBeNull();
  });

  it('듣는 동안 지금 울리는 자리가 1번부터 8번까지 지나간다. 소리가 꺼져 있어도 움직인다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    r.bench.perform('hear-mine');
    const seen: number[] = [];
    for (let i = 0; i < 280; i++) {
      r.run(0.025);
      const now = r.bench.playhead();
      if (now !== null && seen.at(-1) !== now) seen.push(now);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.engine.startCalls).toBe(0);
  });

  it('놓은 음이 없으면 재생하지 않고 이유를 알려 준다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('hear-mine');
    expect(r.controller.playing).toBeNull();
    expect(r.controller.notice).toBe(NO_SLOT_NOTES_NOTICE);
  });

  it('정지는 재생을 멈춘다. 고치면 재생이 멈춘다', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    await r.controller.enableSound();
    r.bench.perform('hear-mine');
    r.run(0.3);
    expect(r.controller.playing).toBe('mine');
    r.bench.perform('stop');
    expect(r.controller.playing).toBeNull();
    r.bench.perform('hear-mine');
    r.run(0.3);
    r.bench.perform('remove');
    expect(r.controller.playing).toBeNull();
    expect(r.engine.sinks.get('task')!.pending()).toHaveLength(0);
  });

  it('느리게 듣기를 켜도 원래 템포는 그대로다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    r.controller.setSlow(true);
    expect(r.controller.tempo().original).toBe(80);
    expect(r.controller.tempo().effective).toBeLessThan(80);
    r.bench.perform('hear-mine');
    expect(r.controller.playing).toBe('mine');
  });

  it('듣는 동안 세계 소리는 줄고, 멈추면 돌아온다(W-7)', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    typeScale(r);
    await r.controller.enableSound();
    r.bench.perform('hear-mine');
    expect(r.mixer.snapshot().ducked).toBe(true);
    r.bench.perform('stop');
    expect(r.mixer.snapshot().ducked).toBe(false);
  });
});

describe('손으로 들어 보기와 듣기 보조', () => {
  it('손에 든 음을 바꾸면 그 음이 들린다. 소리를 켜기 전에는 들리지 않는다(W-11)', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('hand-up');
    expect(r.engine.startCalls).toBe(0);
    await r.controller.enableSound();
    r.bench.perform('hand-up'); // E4
    r.bench.perform('hand-down'); // D4
    expect(r.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([64, 62]);
  });

  it('목표 듣기에서도 지금 울리는 자리가 1번부터 8번까지 지나간다(비어 있는 판에서도 목표는 8자리 모두 있다)', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('hear-target');
    expect(r.controller.playing).toBe('target');
    const seen: number[] = [];
    for (let i = 0; i < 280; i++) {
      r.run(0.025);
      const now = r.bench.playhead();
      if (now !== null && seen.at(-1) !== now) seen.push(now);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('느리게 듣기는 음 하나의 길이를 늘린다. 켜 둔 채로 다시 꺼도 원래 박자로 돌아온다', async () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    await r.controller.enableSound();
    r.bench.perform('place');
    r.engine.sinks.get('task')!.requests.splice(0);
    r.bench.perform('hear-mine');
    r.run(1);
    const normal = r.engine.sinks.get('task')!.live().at(-1)!.duration;
    r.bench.perform('stop');
    r.controller.setSlow(true);
    r.engine.sinks.get('task')!.requests.splice(0);
    r.bench.perform('hear-mine');
    r.run(2);
    const slow = r.engine.sinks.get('task')!.live().at(-1)!.duration;
    expect(slow).toBeGreaterThan(normal);
    r.bench.perform('stop');
    r.controller.setSlow(false);
    expect(r.controller.tempo().effective).toBe(r.controller.tempo().original);
  });
});

describe('바깥에 부탁하는 동작', () => {
  it('V, H, Esc는 작업대가 하지 않고 부탁으로 돌려준다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    expect(r.bench.perform('view-panel')).toBe('view-panel');
    expect(r.bench.perform('help')).toBe('help');
    expect(r.bench.perform('exit')).toBe('exit');
    expect(r.bench.perform('place')).toBeNull();
  });
});

describe('자유로 놀기(4.2 표지판 맨 위, 판정하지 않는다)', () => {
  it('자유로 열면 과제도 목표도 판정도 없다. 같은 자리와 선반으로 놓고 들을 수 있다', async () => {
    const r = rig();
    expect(r.controller.openFree(installation())).toBe(true);
    expect(r.controller.isFree).toBe(true);
    expect(r.controller.current!.entry.title).toBe('자유로 놀기');
    expect(r.bench.free).toBe(true);
    expect(r.bench.map.count).toBe(8);
    expect(r.bench.map.shelf.map((s) => s.name)[1]).toBe('C4');
    r.bench.perform('place');
    r.bench.perform('cursor-right');
    r.bench.perform('hand-up');
    r.bench.perform('place');
    expect(names(r).slice(0, 3)).toEqual(['C4', 'D4', null]);
    await r.controller.enableSound();
    r.bench.perform('hear-mine');
    r.run(3);
    expect(r.engine.sinks.get('task')!.live().map((q) => q.midi)).toEqual([60, 62]);
  });

  it('배치 확인(C)은 판정하지 않고 안내만 한다. 시도 기록이 남지 않는다', () => {
    const r = rig();
    r.controller.openFree(installation());
    r.bench.perform('place');
    r.bench.perform('check');
    expect(r.controller.notice).toBe(FREE_PLAY_NO_CHECK);
    expect(r.controller.attempts).toHaveLength(0);
    expect(() => r.controller.check()).toThrow(FREE_PLAY_NO_CHECK);
    expect(r.controller.attempts).toHaveLength(0);
  });

  it('목표 듣기(T)는 목표가 없다고 안내한다', () => {
    const r = rig();
    r.controller.openFree(installation());
    r.bench.perform('hear-target');
    expect(r.controller.playing).toBeNull();
    expect(r.controller.notice).toBe(FREE_PLAY_NO_TARGET);
  });

  it('자유로 놀기 초안은 과제 초안과 따로이고, 저장하고 되살릴 수 있다', () => {
    const r = rig();
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place'); // 과제 초안에 C4
    r.controller.openFree(installation());
    r.bench.perform('hand-up');
    r.bench.perform('place'); // 자유 초안에 D4
    expect(names(r)[0]).toBe('D4');
    const snap = JSON.parse(JSON.stringify(r.session.serialize())) as ReturnType<Rig['session']['serialize']>;
    expect(Object.keys(snap.challengeDrafts).sort()).toEqual(['free.inst.village.scale-stones/play', 'scale.major/c-major']);
    expect(snap.activeChallenge).toMatchObject({ questId: 'free.inst.village.scale-stones', variantId: 'play' });
    // 되살린 뒤: 활성 도전은 자유지만 카탈로그에 없으므로 컨트롤러는 아직 도전을 갖지 않는다. 설치물이 다시 열어 준다
    const r2 = rig({ session: snap });
    expect(r2.controller.current).toBeNull();
    expect(r2.session.contentOf('scale.major', 'c-major').slots).toHaveLength(1);
    expect(r2.controller.openFree(installation())).toBe(true);
    expect(r2.bench.views().map((v) => v.name).slice(0, 2)).toEqual(['D4', null]);
    // 과제로 돌아가면 과제 초안이 그대로다
    r2.controller.open(Q07, 'c-major');
    expect(r2.bench.views()[0]!.name).toBe('C4');
  });

  it('틀로 삼을 판본이 없으면 열지 못한다', () => {
    const r = rig({ definitions: [] });
    expect(r.controller.openFree(installation())).toBe(false);
    expect(r.controller.current).toBeNull();
  });

  it('틀로 삼은 판본이 검수 전이라 release에서 준비 중이어도 자유로 놀 수는 있다(자리 수와 음역만 가져온다)', () => {
    const r = rig({ channel: 'release' });
    expect(r.controller.open(Q07, 'c-major').ok).toBe(false); // 과제는 준비 중이라 열리지 않는다(W-10)
    expect(r.controller.openFree(installation())).toBe(true);
    expect(r.bench.map.count).toBe(8);
  });
});

describe('만짐 알림(등불을 켜는 신호, 4.2)', () => {
  it('재료를 놓거나 들어 보면 어떤 과제를 만졌는지 알린다. 열기만 해서는 알리지 않는다', () => {
    const r = rig();
    const seen: TouchEvent[] = [];
    r.controller.onTouch((t) => seen.push(t));
    r.controller.open(Q07, 'c-major');
    expect(seen).toEqual([]);
    r.bench.perform('place');
    expect(seen.map((t) => t.kind)).toContain('edit');
    expect(seen.every((t) => t.questId === Q07 && t.variantId === 'c-major' && t.freeInstallationId === undefined)).toBe(true);
    seen.length = 0;
    r.bench.perform('hear-mine');
    expect(seen.map((t) => t.kind)).toEqual(['listen']);
    seen.length = 0;
    r.bench.perform('undo'); // 되돌리기는 만진 것으로 세지 않는다
    expect(seen).toEqual([]);
  });

  it('자유로 놀기에서는 그 설치물을 알려 준다', () => {
    const r = rig();
    const seen: TouchEvent[] = [];
    r.controller.onTouch((t) => seen.push(t));
    r.controller.openFree(installation());
    r.bench.perform('hand-up'); // 재료를 들어 본다
    expect(seen.at(-1)).toMatchObject({ kind: 'listen', freeInstallationId: 'inst.village.scale-stones' });
  });

  it('소리가 꺼져 있어도 만진 것으로 센다(손으로 한 일이다)', () => {
    const r = rig();
    let n = 0;
    r.controller.onTouch(() => n++);
    r.controller.open(Q07, 'c-major');
    r.bench.perform('place');
    expect(n).toBeGreaterThan(0);
    expect(r.engine.startCalls).toBe(0);
  });
});

describe('콘텐츠 규칙', () => {
  it("과제 id가 'free.'로 시작하면 콘텐츠 검사가 막는다(자유로 놀기 초안이 쓰는 이름)", async () => {
    const { validateQuestDefinition } = await import('@/domain/content');
    const bad = { ...quest(Q07), questId: 'free.scale-major' };
    const issues = validateQuestDefinition(bad, { installationIds: new Set(['inst.village.scale-stones']) });
    expect(issues.some((i) => i.code === 'RESERVED_ID')).toBe(true);
  });
});
