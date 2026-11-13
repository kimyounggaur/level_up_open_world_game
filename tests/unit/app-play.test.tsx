// @vitest-environment jsdom
// 6-9c 놀이 악기를 앱 전체에서: 월드가 돌을 밟았다고 알리면 그 돌의 음이 난다(소리를 켠 뒤에만, W-11), 메아리 벽은 한 번 더 난다.
// 월드에는 이 채널에서 보이는 악기가 넘어가고, 밟은 일은 기록에도 찾은 목록에도 세계 반응에도 남지 않는다(W-5 '기록 없음. 그냥 논다').
// 월드(Phaser)는 가짜다. 실제 걷기와 그림은 tests/flow가 확인한다.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadPlayInstruments } from '@/app/discovery-data';
import { PAD_NOTE_SEC } from '@/domain/play';
import { BEAT_SEC } from '@/domain/worldsound';
import { bootApp, cleanupApps } from './app-rig';
import { setupDom } from './ui-rig';

beforeAll(() => setupDom());
afterEach(() => cleanupApps());

const PLAYS = loadPlayInstruments('preview');
const DRUM = 'play.beat-river.drum';
const WALL = 'play.bell-grove.echo-wall';
/** 이 채널의 놀이 악기 다섯, 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪) */
const ALL_PLAY = ['play.staff-hill.pitch-slide', DRUM, WALL, 'play.scale-trail.pinwheels', 'play.key-marsh.lily-chorus'];

type Booted = Awaited<ReturnType<typeof bootApp>>;
const strike = (t: Booted, playId: string, pad: number): void => {
  act(() => t.ctx.world.bridge.events.send({ type: 'pad-struck', playId, pad }));
};
/** 소리를 켠다(가짜 엔진). 켜진 뒤에만 엔진의 소리 받이가 생긴다 */
const soundOn = async (t: Booted): Promise<void> => {
  await act(async () => {
    await t.ctx.mixer.enable();
  });
  expect(t.ctx.mixer.state).toBe('on');
};
const kalimba = (t: Booted) => t.engine()!.sinkLog.filter((l) => l.bus === 'worldSignature' && l.options.timbre === 'kalimba');
const thump = (t: Booted) => t.engine()!.sinkLog.filter((l) => l.bus === 'worldSignature' && l.options.timbre === 'thump');

describe('이 채널에서 보이는 놀이 악기가 월드로 넘어간다', () => {
  it('앱의 놀이 악기 목록은 미리보기 채널의 다섯 악기이고, 월드를 켜면 그대로 넘어간다', async () => {
    const t = await bootApp('');
    expect(t.ctx.playInstruments.map((p) => p.playId)).toEqual(ALL_PLAY);
    expect(t.starts).toHaveLength(1);
    expect(t.starts[0]!.play?.map((p) => p.playId)).toEqual(ALL_PLAY);
    expect(t.starts[0]!.play?.map((p) => [p.x, p.y])).toEqual([[3300, 500], [7700, 2200], [600, 600], [6550, 4540], [3720, 5180]]);
    // 바닥의 종류도 그대로 넘어간다(7-4: 미끄럼길 slope, 바람개비 줄 rope, 연잎 합창 lilies)
    expect(t.starts[0]!.play?.map((p) => p.ground)).toEqual(['slope', 'pool', 'none', 'rope', 'lilies']);
  });

  it('악기를 따로 넘기면 그것이 쓰인다(없으면 월드에도 없다)', async () => {
    const t = await bootApp('', { playInstruments: [] });
    expect(t.ctx.playInstruments).toEqual([]);
    expect(t.starts[0]!.play).toEqual([]);
  });
});

describe('W-11 소리를 켜기 전에는 돌을 밟아도 소리 장치가 없다', () => {
  it('켜기 전에 밟으면 엔진을 만들지 않는다. 밟은 일은 조용히 지나간다', async () => {
    const t = await bootApp('');
    expect(t.ctx.mixer.state).toBe('off');
    strike(t, WALL, 3);
    strike(t, DRUM, 1);
    expect(t.engine()).toBeNull();
    expect(t.ctx.mixer.state).toBe('off');
  });

  it('소리를 끄면(음소거) 밟아도 새 소리가 예약되지 않는다', async () => {
    const t = await bootApp('');
    await soundOn(t);
    strike(t, DRUM, 1);
    expect(thump(t)[0]!.sink.requests).toHaveLength(1);
    act(() => t.ctx.mixer.setMuted(true));
    strike(t, DRUM, 2);
    expect(thump(t)[0]!.sink.requests).toHaveLength(1);
    act(() => t.ctx.mixer.setMuted(false));
    strike(t, DRUM, 3);
    expect(thump(t)[0]!.sink.requests.map((q) => q.midi)).toEqual([48, 60]);
  });
});

describe('소리를 켠 뒤에 돌을 밟으면', () => {
  it('물방울 북의 돌은 그 돌의 음 하나가 thump 음색으로 난다', async () => {
    const t = await bootApp('');
    await soundOn(t);
    strike(t, DRUM, 4);
    expect(thump(t)).toHaveLength(1);
    const reqs = thump(t)[0]!.sink.requests;
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ midi: 64, velocity: 0.75, duration: PAD_NOTE_SEC });
  });

  it('메아리 벽의 돌은 바로 한 번, 한 박(0.75초) 뒤에 절반 세기로 한 번 더 난다(kalimba)', async () => {
    const t = await bootApp('');
    await soundOn(t);
    strike(t, WALL, 5);
    expect(kalimba(t)).toHaveLength(1);
    const reqs = kalimba(t)[0]!.sink.requests;
    expect(reqs.map((q) => [q.midi, q.velocity])).toEqual([[69, 0.75], [69, 0.375]]);
    // 두 음은 같은 시계 읽기에서 계산하지만, 믹서가 장치의 시각으로 옮길 때 음마다 차이를 다시 재서 마이크로초 단위로 어긋날 수 있다
    expect(reqs[1]!.time - reqs[0]!.time).toBeCloseTo(BEAT_SEC, 3);
  });

  it('여러 번 밟아도 소리 받이는 음색마다 하나다', async () => {
    const t = await bootApp('');
    await soundOn(t);
    for (let pad = 1; pad <= 4; pad++) strike(t, DRUM, pad);
    for (let pad = 1; pad <= 5; pad++) strike(t, WALL, pad);
    expect(thump(t)).toHaveLength(1);
    expect(kalimba(t)).toHaveLength(1);
    expect(thump(t)[0]!.sink.requests.map((q) => q.midi)).toEqual([48, 55, 60, 64]);
    expect(kalimba(t)[0]!.sink.requests.filter((q) => q.velocity === 0.75).map((q) => q.midi)).toEqual([60, 62, 64, 67, 69]);
  });

  it('모르는 악기나 없는 돌을 알려 와도 소리도 오류도 없다', async () => {
    const t = await bootApp('');
    await soundOn(t);
    expect(() => {
      strike(t, 'play.beat-river.nothing', 1);
      strike(t, DRUM, 9);
      strike(t, DRUM, 0);
    }).not.toThrow();
    expect(thump(t)).toEqual([]);
  });

  it('앱을 내리면 더 이상 소리를 내지 않는다', async () => {
    const t = await bootApp('');
    await soundOn(t);
    const bridge = t.ctx.world.bridge;
    t.ctx.dispose();
    expect(() => bridge.events.send({ type: 'pad-struck', playId: WALL, pad: 1 })).not.toThrow();
  });
});

describe('W-5 기록 없음, 그냥 논다', () => {
  it('돌을 밟아도 찾은 목록, 사용 기록, 세계 반응(층), 수첩은 달라지지 않는다', async () => {
    const t = await bootApp('');
    await soundOn(t);
    t.ctx.usageLog.setEnabled(true);
    const before = {
      found: [...t.ctx.found.store.get()],
      log: t.ctx.usageLog.snapshot().events.length,
      reaction: JSON.stringify(t.ctx.reaction.store.get()),
      attempts: JSON.stringify(t.ctx.controller.attempts),
    };
    for (let pad = 1; pad <= 5; pad++) strike(t, WALL, pad);
    for (let pad = 1; pad <= 4; pad++) strike(t, DRUM, pad);
    expect([...t.ctx.found.store.get()]).toEqual(before.found);
    expect(t.ctx.usageLog.snapshot().events.length).toBe(before.log);
    expect(JSON.stringify(t.ctx.reaction.store.get())).toBe(before.reaction);
    expect(JSON.stringify(t.ctx.controller.attempts)).toBe(before.attempts);
  });

  it('놀이 악기는 발견 요소 목록에 들지 않는다: 소리 조각 36, 쪽지 18, 합쳐 54 그대로', async () => {
    const t = await bootApp('');
    expect(t.ctx.discoveries).toHaveLength(54);
    expect(t.ctx.discoveries.some((d) => d.discoveryId.startsWith('play.'))).toBe(false);
    expect(PLAYS).toHaveLength(5);
  });
});
