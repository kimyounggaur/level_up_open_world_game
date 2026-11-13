// 3-6 상호작용 선택: 96 px 안, 가장 가까운 하나, 이름이 있는 사물만. 값은 손으로 센 것이다.
import { describe, expect, it } from 'vitest';
import { chipText, nearestInteractable, pickInteractableAt, squareAround } from '../../src/world/interact';
import type { Interactable } from '../../src/world/interact';

const mk = (id: string, name: string, x: number, y: number): Interactable => ({ id, name, x, y, hit: squareAround(x, y, 64), kind: 'panel' });
const items = [mk('H1', '음자리 작업대', 3219, 2964), mk('H2', '리듬 작업대', 4956, 2856), mk('H5', '합주 무대', 4056, 3081)];

describe('7.4 안내 칩: 가까운 사물 하나', () => {
  it('96 px 안에 들어오면 뜬다: 정확히 96은 포함, 96.01은 제외', () => {
    expect(nearestInteractable({ x: 3219 + 96, y: 2964 }, items)?.item.id).toBe('H1');
    expect(nearestInteractable({ x: 3219 + 96.01, y: 2964 }, items)).toBeNull();
  });

  it('아무것도 없으면 null', () => {
    expect(nearestInteractable({ x: 0, y: 0 }, items)).toBeNull();
    expect(nearestInteractable({ x: 3219, y: 2964 }, [])).toBeNull();
  });

  it('여러 사물이 범위에 있으면 가장 가까운 것 하나만', () => {
    const near = [mk('A1', '가', 100, 100), mk('A2', '나', 150, 100), mk('A3', '다', 100, 190)];
    const r = nearestInteractable({ x: 130, y: 100 }, near)!;
    expect(r.item.id).toBe('A2'); // 거리 20, 30, 90
    expect(r.distance).toBeCloseTo(20, 9);
  });

  it('거리가 같으면 id가 앞서는 것', () => {
    const tie = [mk('B2', '둘', 200, 100), mk('B1', '하나', 100, 100)];
    expect(nearestInteractable({ x: 150, y: 100 }, tie)?.item.id).toBe('B1');
    expect(nearestInteractable({ x: 150, y: 100 }, [...tie].reverse())?.item.id).toBe('B1');
  });

  it('범위를 바꿀 수 있다', () => {
    expect(nearestInteractable({ x: 3319, y: 2964 }, items, 120)?.item.id).toBe('H1');
    expect(nearestInteractable({ x: 3319, y: 2964 }, items, 50)).toBeNull();
  });

  it('안내 칩 글: "음계 디딤돌 · E 또는 누르기", 터치 전용은 "누르기"만', () => {
    expect(chipText('음계 디딤돌')).toBe('음계 디딤돌 · E 또는 누르기');
    expect(chipText('음계 디딤돌', true)).toBe('음계 디딤돌 · 누르기');
  });
});

describe('7.2 사물을 누르면 그 앞까지 걸어간다: 누른 곳의 사물 고르기', () => {
  it('영역 안을 누르면 그 사물, 영역 둘레 24 px까지 너그럽게 본다', () => {
    expect(pickInteractableAt({ x: 3219, y: 2964 }, items)?.id).toBe('H1');
    expect(pickInteractableAt({ x: 3219 + 32 + 24, y: 2964 }, items)?.id).toBe('H1');
    expect(pickInteractableAt({ x: 3219 + 32 + 24.5, y: 2964 }, items)).toBeNull();
    expect(pickInteractableAt({ x: 10, y: 10 }, items)).toBeNull();
  });

  it('겹치면 영역 가운데가 더 가까운 사물', () => {
    const two = [mk('C1', '가', 100, 100), mk('C2', '나', 150, 100)];
    expect(pickInteractableAt({ x: 130, y: 100 }, two)?.id).toBe('C2');
    expect(pickInteractableAt({ x: 110, y: 100 }, two)?.id).toBe('C1');
  });

  it('영역을 직접 줄 수 있다(건물 지붕)', () => {
    const roof: Interactable = { id: 'H1', name: '음자리 작업대', x: 3219, y: 2964, hit: { x: 2910, y: 2532, w: 618, h: 354 }, kind: 'panel' };
    expect(pickInteractableAt({ x: 3219, y: 2700 }, [roof])?.id).toBe('H1');
    expect(pickInteractableAt({ x: 3219, y: 2886 + 24 }, [roof])?.id).toBe('H1');
  });
});
