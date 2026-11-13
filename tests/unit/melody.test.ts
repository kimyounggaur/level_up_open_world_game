// 4.9 자유 가락을 화면이 쓰는 한곳(FreeMelody): 저장하기, 저장한 곡 다시 듣기, 찾은 소리 조각 올리기·미리 듣기·마디에 놓기.
// 컨트롤러·작업대는 가짜 소리와 함께 쓰고, 저장한 곡과 찾은 것은 앱이 쓰는 같은 클래스(Creations, FoundDiscoveries)를 쓴다.
import { describe, expect, it } from 'vitest';
import { loadDiscoveries } from '@/app/discovery-data';
import { Creations } from '@/app/creations';
import { FoundDiscoveries } from '@/app/found';
import { EMPTY_MELODY_MESSAGE, pieceInsertEdit } from '@/domain/creation';
import { isSoundPiece } from '@/domain/discovery';
import type { SoundPieceDef } from '@/domain/discovery';
import { FreeMelody, NOT_FREE_MELODY, PIECE_OUT_OF_RANGE } from '@/ui/challenge/melody';
import { EIGHT, Q01, Q02, Q07, installation, melodyEvents, quest, rig } from './controller-rig';

const Q08 = 'song.short-piece';
const STAGE = 'inst.village.ensemble-stage';
const PIECES = loadDiscoveries('preview').filter(isSoundPiece);
const P1 = 'disc.village.piece-1'; // 첫걸음: C4 D4 E4 G4 (온음표 아닌 2분음표 넷)
const P2 = 'disc.village.piece-2'; // 바람결: E4 D4 C4
const P4 = 'disc.village.piece-4'; // 물동이: C4 D4 E4 D4 G4
const NOTE = 'disc.village.note-1'; // 개념 쪽지(소리 조각이 아니다)

function setup(opts: { open?: boolean; found?: string[] } = {}) {
  const r = rig({ definitions: [quest(Q01), quest(Q02), quest(Q07), quest(Q08)] });
  const creations = new Creations();
  const found = new FoundDiscoveries(opts.found ?? []);
  const melody = new FreeMelody({ controller: r.controller, creations, found, pieces: PIECES, nowIso: () => '2026-11-11T09:00:00.000Z' });
  if (opts.open !== false) expect(r.controller.openFree(installation(STAGE))).toBe(true);
  const measure = (m: number) => r.controller.content().events.filter((e) => e.measureIndex === m);
  return { ...r, creations, found, melody, measure };
}

describe('열려 있는 것이 자유 가락일 때만 쓸 수 있다', () => {
  it('아무것도 열려 있지 않으면 active가 아니고, 자유 가락이 열리면 active다. 닫으면 다시 아니다', () => {
    const t = setup({ open: false });
    expect(t.melody.active).toBe(false);
    t.controller.openFree(installation(STAGE));
    expect(t.melody.active).toBe(true);
    t.controller.close();
    expect(t.melody.active).toBe(false);
  });

  it('돌 설치물의 자유로 놀기는 배치 도전이 아니므로 active가 아니다', () => {
    const t = setup({ open: false });
    expect(t.controller.openFree(installation('inst.village.scale-stones'))).toBe(true);
    expect(t.melody.active).toBe(false);
  });

  it('과제 판본이 열려 있으면 저장도 놓기도 하지 않고 이유를 말한다', () => {
    const t = setup({ open: false, found: [P1] });
    expect(t.controller.open(Q08, 'one-voice').ok).toBe(true);
    expect(t.melody.active).toBe(false);
    expect(t.melody.save('x')).toEqual({ ok: false, message: NOT_FREE_MELODY });
    expect(t.melody.placePiece(P1, 0)).toEqual({ ok: false, message: NOT_FREE_MELODY });
    expect(t.creations.list()).toHaveLength(0);
    expect(t.controller.content().events).toHaveLength(0);
  });

  it('찾은 것과 저장한 곡의 알림 곳을 그대로 내놓는다(재료함과 목록이 바뀔 때 다시 그려진다)', () => {
    const t = setup();
    expect(t.melody.found).toBe(t.found.store);
    expect(t.melody.creations).toBe(t.creations.store);
  });
});

describe('저장하기', () => {
  it('음이 없으면 저장하지 않고, 이유를 돌려주며 알림에도 띄운다', () => {
    const t = setup();
    expect(t.melody.save()).toEqual({ ok: false, message: EMPTY_MELODY_MESSAGE });
    expect(t.creations.list()).toHaveLength(0);
    expect(t.controller.notice).toBe(EMPTY_MELODY_MESSAGE);
  });

  it('이름을 주지 않으면 기본 이름(내 곡 1)이고, 만든 자리(무대 설치물)와 때와 음을 함께 적는다', () => {
    const t = setup();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    expect(t.melody.suggestedName()).toBe('내 곡 1');
    const r = t.melody.save();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.duplicate).toBe(false);
    expect(r.creation).toMatchObject({ creationId: 'creation-1', name: '내 곡 1', installationId: STAGE, createdAt: '2026-11-11T09:00:00.000Z' });
    expect(r.creation.events).toHaveLength(8);
    expect(r.message).toBe('내 곡 1을 저장했어요. 무대에서 다시 들을 수 있어요.');
    expect(t.controller.notice).toBe(r.message);
    expect(t.creations.list()).toEqual([r.creation]);
    // 다음에 저장하면 붙을 이름이 앞으로 간다
    expect(t.melody.suggestedName()).toBe('내 곡 2');
  });

  it('이름은 앞뒤 공백을 걷어 내고 받침에 맞게 조사를 붙인다. 공백뿐이면 기본 이름이다', () => {
    const t = setup();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    const r = t.melody.save('  아침 노래  ');
    expect(r.ok && r.creation.name).toBe('아침 노래');
    expect(r.ok && r.message).toBe('아침 노래를 저장했어요. 무대에서 다시 들을 수 있어요.');
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT.slice(0, 4), 1, 'b')!);
    const blank = t.melody.save('   ');
    expect(blank.ok && blank.creation.name).toBe('내 곡 1');
  });

  it('너무 긴 이름은 저장하지 않고 이유를 알린다', () => {
    const t = setup();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    const r = t.melody.save('가'.repeat(21));
    expect(r.ok).toBe(false);
    expect(t.creations.list()).toHaveLength(0);
    expect(t.controller.notice).toBe(r.message);
  });

  it('같은 가락을 또 저장하면 새로 만들지 않고 이미 저장한 곡을 알려 준다', () => {
    const t = setup();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    const first = t.melody.save('봄바람');
    const again = t.melody.save('다른 이름');
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.duplicate).toBe(true);
    expect(again.creation.creationId).toBe(first.creation.creationId);
    expect(again.message).toBe('같은 가락이 이미 봄바람으로 저장되어 있어요.');
    expect(t.creations.list()).toHaveLength(1);
  });

  it('저장해도 놓은 음은 그대로다(저장은 복사다): 이어서 고쳐서 다른 곡으로 저장할 수 있다', () => {
    const t = setup();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    t.melody.save('하나');
    expect(t.measure(0)).toHaveLength(8);
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT.slice(0, 3), 1, 'b')!);
    const second = t.melody.save('둘');
    expect(second.ok && second.duplicate).toBe(false);
    expect(t.creations.list().map((c) => c.name)).toEqual(['하나', '둘']);
    expect(t.creations.list()[0]!.events).toHaveLength(8);
    expect(t.creations.list()[1]!.events).toHaveLength(11);
  });
});

describe('저장한 곡 다시 듣기', () => {
  it('있는 곡은 미리 듣기로 들려 주고(도전은 그대로), 없는 곡은 false다', () => {
    const t = setup();
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 0, 'a')!);
    const saved = t.melody.save('봄바람');
    if (!saved.ok) throw new Error(saved.message);
    expect(t.controller.previewing).toBe(false);
    expect(t.melody.replay(saved.creation.creationId)).toBe(true);
    expect(t.controller.previewing).toBe(true);
    expect(t.controller.playing).toBeNull();
    expect(t.controller.isFree).toBe(true);
    t.controller.stopPlayback();
    expect(t.controller.previewing).toBe(false);
    expect(t.melody.replay('creation-99')).toBe(false);
    expect(t.controller.previewing).toBe(false);
  });

  it('자유 가락이 열려 있지 않아도 들을 수 있다(수첩에서 다시 듣는다)', () => {
    const t = setup({ open: false });
    const r = t.creations.save({ name: '수첩 곡', installationId: STAGE, events: melodyEvents(0, 'z'), createdAt: '2026-11-11T09:00:00.000Z' });
    if (!r.ok) throw new Error(r.message);
    expect(t.melody.active).toBe(false);
    expect(t.controller.current).toBeNull();
    expect(t.melody.replay(r.creation.creationId)).toBe(true);
    expect(t.controller.previewing).toBe(true);
    t.controller.stopPlayback();
    expect(t.controller.previewing).toBe(false);
  });
});

describe('재료함: 찾은 소리 조각', () => {
  it('찾기 전에는 하나도 올라오지 않고, 찾은 것만 id 순서로 올라온다. 개념 쪽지는 올라오지 않는다', () => {
    const t = setup();
    expect(t.melody.foundPieces()).toEqual([]);
    t.found.mark(P4);
    t.found.mark(NOTE);
    t.found.mark(P2);
    expect(t.melody.foundPieces()).toEqual([
      { discoveryId: P2, name: '바람결', notes: 'E4 D4 C4' },
      { discoveryId: P4, name: '물동이', notes: 'C4 D4 E4 D4 G4' },
    ]);
  });

  it('못 찾은 조각은 미리 듣지도 놓지도 못하고, 어디에 있는지도 말하지 않는다', () => {
    const t = setup();
    expect(t.melody.previewPiece(P1)).toBe(false);
    expect(t.controller.previewing).toBe(false);
    const r = t.melody.placePiece(P1, 0);
    expect(r).toEqual({ ok: false, message: '아직 찾지 못한 소리 조각이에요.' });
    expect(t.measure(0)).toHaveLength(0);
    expect(r.message).not.toMatch(/마을|길|근처|위치|\d/);
  });

  it('찾은 조각은 미리 들을 수 있다', () => {
    const t = setup({ found: [P2] });
    expect(t.melody.previewPiece(P2)).toBe(true);
    expect(t.controller.previewing).toBe(true);
    // 개념 쪽지나 없는 id는 소리 조각이 아니다
    t.controller.stopPlayback();
    expect(t.melody.previewPiece(NOTE)).toBe(false);
    expect(t.melody.previewPiece('disc.village.nope')).toBe(false);
  });
});

describe('마디에 놓기', () => {
  it('찾은 조각을 고른 마디에 놓으면 그 조각의 음이 놓이고 알림이 난다. 실행 취소 한 번으로 되돌린다', () => {
    const t = setup({ found: [P1] });
    const r = t.melody.placePiece(P1, 2);
    expect(r).toEqual({ ok: true, message: '첫걸음을 3마디에 놓았어요.' });
    expect(t.controller.live).toBe(r.message);
    expect(t.measure(2).map((e) => e.type === 'note' ? e.resolvedPitch?.midi : null)).toEqual([60, 62, 64, 67]);
    expect(t.measure(2).map((e) => e.onsetTicks)).toEqual([0, 960, 1920, 2880]);
    expect(t.measure(0)).toHaveLength(0);
    t.controller.undo();
    expect(t.controller.content().events).toHaveLength(0);
  });

  it('이미 음이 있던 마디에 놓으면 있던 음을 걷어 내고 조각이 놓인다(겹치지 않는다). 같은 조각을 또 놓아도 같다', () => {
    const t = setup({ found: [P1, P4] });
    t.controller.edit(pieceInsertEdit(t.controller.content(), EIGHT, 1, 'x')!);
    expect(t.measure(1)).toHaveLength(8);
    t.melody.placePiece(P4, 1);
    expect(t.measure(1).map((e) => e.type === 'note' ? e.resolvedPitch?.midi : null)).toEqual([60, 62, 64, 62, 67]);
    t.melody.placePiece(P4, 1);
    expect(t.measure(1)).toHaveLength(5);
    t.melody.placePiece(P1, 1);
    expect(t.measure(1)).toHaveLength(4);
  });

  it('다른 마디의 음은 건드리지 않고, 조각마다 사건 id가 겹치지 않는다', () => {
    const t = setup({ found: [P1, P2] });
    t.melody.placePiece(P1, 0);
    t.melody.placePiece(P2, 1);
    t.melody.placePiece(P1, 2);
    const ids = t.controller.content().events.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(t.measure(0)).toHaveLength(4);
    expect(t.measure(1)).toHaveLength(3);
    expect(t.measure(2)).toHaveLength(4);
  });

  it('없는 마디(0~3 밖)에는 놓을 수 없고 아무것도 바꾸지 않는다', () => {
    const t = setup({ found: [P1] });
    for (const m of [-1, 4, 1.5]) {
      expect(t.melody.placePiece(P1, m)).toEqual({ ok: false, message: '이 마디에는 놓을 수 없어요.' });
    }
    expect(t.controller.content().events).toHaveLength(0);
  });

  it('놓은 가락은 저장하면 그대로 곡이 된다(찾은 조각을 모아 만든 곡)', () => {
    const t = setup({ found: [P1, P2] });
    t.melody.placePiece(P1, 0);
    t.melody.placePiece(P2, 1);
    const r = t.melody.save('조각 모음');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.creation.events).toHaveLength(7);
    expect(t.melody.replay(r.creation.creationId)).toBe(true);
  });
});

describe('자유 가락의 음역(C4–A4)을 벗어나는 조각', () => {
  /** 이 마을의 조각 모양을 빌려 C5(72)가 낀 조각을 만든다(다른 지역의 조각을 미리 대 보는 것) */
  const high: SoundPieceDef = { ...PIECES[0]!, discoveryId: 'disc.future.piece-1', name: '높은 종', notes: [{ midi: 69, onsetTicks: 0, durationTicks: 960 }, { midi: 72, onsetTicks: 960, durationTicks: 960 }] };

  function withHigh() {
    const r = rig({ definitions: [quest(Q01), quest(Q02), quest(Q07), quest(Q08)] });
    const found = new FoundDiscoveries([high.discoveryId, P1]);
    const melody = new FreeMelody({ controller: r.controller, creations: new Creations(), found, pieces: [...PIECES, high], nowIso: () => 'x' });
    r.controller.openFree(installation(STAGE));
    return { ...r, melody };
  }

  it('음역 밖의 음이 있는 조각은 놓지 않고 이유를 알린다. 아무것도 바꾸지 않는다', () => {
    const t = withHigh();
    expect(t.melody.placePiece(high.discoveryId, 0)).toEqual({ ok: false, message: PIECE_OUT_OF_RANGE });
    expect(t.controller.content().events).toHaveLength(0);
  });

  it('음역 안의 조각은 그대로 놓인다. 음역 밖의 조각도 재료함에는 올라오고 미리 들을 수 있다', () => {
    const t = withHigh();
    expect(t.melody.placePiece(P1, 0).ok).toBe(true);
    expect(t.melody.foundPieces().map((p) => p.discoveryId)).toContain(high.discoveryId);
    expect(t.melody.previewPiece(high.discoveryId)).toBe(true);
  });

  it('모든 지역의 조각은 모두 음역 안이다(놓을 수 없는 조각을 찾는 일이 없다): 마을과 다섯 바깥 지역의 서른여섯 조각', () => {
    expect(PIECES).toHaveLength(36);
    const t = setup({ found: PIECES.map((p) => p.discoveryId) });
    for (const [i, p] of PIECES.entries()) expect(t.melody.placePiece(p.discoveryId, i % 4), p.discoveryId).toMatchObject({ ok: true });
  });
});
