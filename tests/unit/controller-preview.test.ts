// 만들어 둔 재생을 듣기(ChallengeController.previewPlayback): 저장한 곡, 찾은 소리 조각. 열려 있는 도전과 상관없이 들려 주고,
// 초안·판정·기록·사용 기록을 건드리지 않는다. 소리가 꺼져 있어도 위치는 움직이고, 켜져 있으면 소리가 나며 세계 소리를 낮췄다가 돌려 놓는다.
import { describe, expect, it } from 'vitest';
import { piecePlayback } from '@/domain/discovery';
import type { Playback } from '@/domain/playback';
import { Q01, installation, quest, rig } from './controller-rig';

const Q08 = 'song.short-piece';

/** 4분음표 80에서 4분음표 넷(한 마디, 3초) */
const BAR: Playback = {
  notes: [60, 62, 64, 67].map((midi, i) => ({ id: `n${i + 1}`, midi, onsetTick: i * 960, durationTick: 960 })),
  lengthTicks: 3840,
  tempoBpm: 80,
  tempoReference: 'quarter',
};

function setup() {
  return rig({ definitions: [quest(Q01), quest(Q08)] });
}

describe('previewPlayback', () => {
  it('열려 있는 도전이 없어도 들려 준다. 듣는 동안 previewing이고 도전의 재생(playing)은 아니다', () => {
    const t = setup();
    expect(t.controller.current).toBeNull();
    expect(t.controller.previewing).toBe(false);
    expect(t.controller.previewTick()).toBeNull();
    expect(t.controller.previewPlayback(BAR)).toBe(true);
    expect(t.controller.previewing).toBe(true);
    expect(t.controller.playing).toBeNull();
    expect(t.controller.previewTick()).not.toBeNull();
  });

  it('끝까지 가면 저절로 멈춘다. 위치는 앞으로만 간다', () => {
    const t = setup();
    t.controller.previewPlayback(BAR);
    t.run(1);
    const mid = t.controller.previewTick()!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(BAR.lengthTicks);
    t.run(1);
    expect(t.controller.previewTick()!).toBeGreaterThan(mid);
    t.run(3);
    expect(t.controller.previewing).toBe(false);
    expect(t.controller.previewTick()).toBeNull();
  });

  it('정지하면 멈춘다. 멈춘 뒤에 다시 들을 수 있다', () => {
    const t = setup();
    t.controller.previewPlayback(BAR);
    t.controller.stopPlayback();
    expect(t.controller.previewing).toBe(false);
    expect(t.controller.previewTick()).toBeNull();
    expect(t.controller.previewPlayback(BAR)).toBe(true);
    expect(t.controller.previewing).toBe(true);
  });

  it('음이 없으면 듣지 않고 이유를 알린다', () => {
    const t = setup();
    expect(t.controller.previewPlayback({ ...BAR, notes: [] })).toBe(false);
    expect(t.controller.previewing).toBe(false);
    expect(t.controller.notice).toBe('들려 줄 음이 없어요.');
  });

  it('듣는 중에 다른 것을 들으면 먼저 듣던 것은 멈추고 새것이 처음부터 들린다', () => {
    const t = setup();
    t.controller.previewPlayback(BAR);
    t.run(2);
    const before = t.controller.previewTick()!;
    expect(t.controller.previewPlayback(piecePlayback({ notes: [{ midi: 69, onsetTicks: 0, durationTicks: 1920 }] }))).toBe(true);
    expect(t.controller.previewing).toBe(true);
    expect(t.controller.previewTick()!).toBeLessThan(before);
  });

  it('도전을 닫으면 듣던 것도 멈춘다', () => {
    const t = setup();
    t.controller.open(Q01);
    t.controller.previewPlayback(BAR);
    t.controller.close();
    expect(t.controller.previewing).toBe(false);
  });

  it('초안, 시도, 판정 결과, 되돌리기 기록을 건드리지 않는다', () => {
    const t = setup();
    t.controller.open(Q01);
    const draft = JSON.stringify(t.controller.content());
    const attempts = t.controller.attempts.length;
    t.controller.previewPlayback(BAR);
    t.run(4);
    expect(JSON.stringify(t.controller.content())).toBe(draft);
    expect(t.controller.attempts).toHaveLength(attempts);
    expect(t.controller.feedback).toBeNull();
    expect(t.controller.canUndo).toBe(false);
  });

  it('자유 가락이 열려 있어도 도전은 그대로다(자유 가락, 같은 초안)', () => {
    const t = setup();
    expect(t.controller.openFree(installation('inst.village.ensemble-stage'))).toBe(true);
    const free = t.controller.current;
    t.controller.previewPlayback(BAR);
    expect(t.controller.current).toBe(free);
    expect(t.controller.isFree).toBe(true);
    expect(t.controller.previewing).toBe(true);
  });

  it('소리를 켜 두면 음이 소리 받이로 가고 세계 소리가 낮아졌다가, 끝나면 돌아온다', async () => {
    const t = setup();
    await t.controller.enableSound();
    expect(t.mixer.ducked).toBe(false);
    t.controller.previewPlayback(BAR);
    expect(t.mixer.ducked).toBe(true);
    t.run(4);
    expect(t.engine.sinks.get('task')!.live().map((n) => n.midi)).toEqual([60, 62, 64, 67]);
    expect(t.controller.previewing).toBe(false);
    expect(t.mixer.ducked).toBe(false);
  });

  it('정지하면 낮췄던 세계 소리를 바로 돌려 놓는다. 이어서 또 들어도 낮춤이 겹치지 않는다', async () => {
    const t = setup();
    await t.controller.enableSound();
    t.controller.previewPlayback(BAR);
    t.controller.previewPlayback(BAR);
    expect(t.mixer.ducked).toBe(true);
    t.controller.stopPlayback();
    expect(t.mixer.ducked).toBe(false);
  });

  it('소리가 꺼져 있어도 위치는 움직인다(소리 없는 사람도 따라갈 수 있다)', () => {
    const t = setup();
    expect(t.controller.soundAudible).toBe(false);
    t.controller.previewPlayback(BAR);
    t.run(1);
    expect(t.controller.previewTick()!).toBeGreaterThan(0);
    expect(t.engine.sinks.size).toBe(0);
  });
});
