// 2-3 버스와 '소리 켜기' 검사. 누르기 전에는 무음, 오디오가 실패해도 편집은 계속된다, 과제 소리가 나면 배경이 줄어든다.
import { describe, expect, it } from 'vitest';
import { BUS_DEFAULT_DB, DUCK_ATTACK_SEC, DUCK_DB, DUCK_RELEASE_SEC, DUCK_TAIL_SEC, Mixer, SILENT_DB, volumeToDb } from '@/audio/mixer';
import { FakeEngine } from './audio-fakes';

function setup(settings = {}, configure?: (e: FakeEngine) => void, monotonicNow = () => 50) {
  const engines: FakeEngine[] = [];
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const mixer = new Mixer({
    createEngine: () => {
      const e = new FakeEngine();
      configure?.(e);
      engines.push(e);
      return e;
    },
    settings,
    monotonicNow,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
  });
  return { mixer, engines, timers };
}

const note = (id = 'n') => ({ id, midi: 60, time: 1, duration: 0.5, velocity: 0.8 });
const approx = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('소리 켜기 전에는 무음이다 (W-11)', () => {
  it('누르기 전에는 오디오 장치를 만들지도 않는다', () => {
    const { mixer, engines } = setup();
    expect(engines).toHaveLength(0);
    expect(mixer.state).toBe('off');
    expect(mixer.audible).toBe(false);
    expect(mixer.canPlaySound).toBe(false);
  });

  it('누르기 전에 재생을 시도해도 아무 소리도 예약되지 않고 오류도 없다', () => {
    const { mixer, engines } = setup();
    expect(() => mixer.taskSink.schedule(note())).not.toThrow();
    expect(() => mixer.taskSink.cancelAll()).not.toThrow();
    mixer.playTaskNote(60);
    expect(engines).toHaveLength(0);
  });

  it('누르기 전의 소리 상태는 muted다(듣기 성과로 세지 않는다)', () => {
    expect(setup().mixer.soundState()).toBe('muted');
  });

  it('소리 켜기를 누르면 장치를 깨우고 켜진다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    expect(engines).toHaveLength(1);
    expect(engines[0]!.startCalls).toBe(1);
    expect(mixer.state).toBe('on');
    expect(mixer.audible).toBe(true);
    expect(mixer.soundState()).toBe('on');
  });

  it('켠 뒤에는 소리 받이가 엔진으로 음을 보낸다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.taskSink.schedule(note('a'));
    expect(engines[0]!.sinks.get('task')!.requests.map((r) => r.id)).toEqual(['a']);
    mixer.taskSink.cancelAll();
    expect(engines[0]!.sinks.get('task')!.cancelCalls).toBe(1);
  });

  it('여러 번, 동시에 눌러도 장치는 한 번만 깨운다', async () => {
    const { mixer, engines } = setup();
    await Promise.all([mixer.enable(), mixer.enable(), mixer.enable()]);
    await mixer.enable();
    expect(engines).toHaveLength(1);
    expect(engines[0]!.startCalls).toBe(1);
  });

  it('켜지는 중에는 starting이다', async () => {
    const { mixer } = setup();
    const p = mixer.enable();
    expect(mixer.state).toBe('starting');
    expect(mixer.audible).toBe(false);
    await p;
    expect(mixer.state).toBe('on');
  });
});

describe('오디오가 실패해도 편집은 계속된다 (W-8)', () => {
  it('브라우저가 소리를 막으면 failed(blocked)이고 던지지 않는다. 소리 받이는 조용히 아무것도 하지 않는다', async () => {
    const err = Object.assign(new Error('no gesture'), { name: 'NotAllowedError' });
    const { mixer, engines } = setup({}, (e) => (e.startError = err));
    await expect(mixer.enable()).resolves.toBeUndefined();
    expect(mixer.state).toBe('failed');
    expect(mixer.snapshot().failure).toBe('blocked');
    expect(mixer.snapshot().message).toContain('소리 없이도 계속할 수 있어요');
    expect(mixer.soundState()).toBe('failed');
    expect(() => mixer.taskSink.schedule(note())).not.toThrow();
    expect(engines[0]!.disposed).toBe(true); // 실패한 장치는 정리한다
    expect(mixer.audible).toBe(false);
  });

  it('지원하지 않는 브라우저는 unavailable로 기록한다', async () => {
    const err = Object.assign(new Error('no webaudio'), { name: 'UnsupportedError' });
    const { mixer } = setup({}, (e) => (e.startError = err));
    await mixer.enable();
    expect(mixer.snapshot().failure).toBe('unsupported');
    expect(mixer.soundState()).toBe('unavailable');
    expect(mixer.snapshot().message).toContain('이 브라우저에서는 소리를 낼 수 없어요');
  });

  it('그 밖의 오류는 failed(error)다', async () => {
    const { mixer } = setup({}, (e) => (e.startError = new Error('boom')));
    await mixer.enable();
    expect(mixer.snapshot().failure).toBe('error');
    expect(mixer.snapshot().message).toContain('소리를 켜지 못했어요');
  });

  it('장치를 만드는 단계에서 던져도 failed다', async () => {
    const mixer = new Mixer({
      createEngine: () => {
        throw new Error('no AudioContext');
      },
    });
    await mixer.enable();
    expect(mixer.state).toBe('failed');
    expect(() => mixer.taskSink.schedule(note())).not.toThrow();
  });

  it('실패한 뒤 다시 누르면 새 장치로 다시 시도하고, 성공하면 켜진다', async () => {
    let fail = true;
    const mixer = new Mixer({
      createEngine: () => {
        const e = new FakeEngine();
        if (fail) e.startError = Object.assign(new Error('x'), { name: 'NotAllowedError' });
        return e;
      },
    });
    await mixer.enable();
    expect(mixer.state).toBe('failed');
    fail = false;
    await mixer.enable();
    expect(mixer.state).toBe('on');
    expect(mixer.snapshot().failure).toBeNull();
    expect(mixer.snapshot().message).toBeNull();
  });

  it('실패한 상태에서 재료를 놓는 소리를 내려 해도 오류가 없다', async () => {
    const { mixer } = setup({}, (e) => (e.startError = new Error('boom')));
    await mixer.enable();
    expect(() => mixer.playTaskNote(62)).not.toThrow();
    expect(() => mixer.beginTaskSound()()).not.toThrow();
  });
});

describe('재생기의 시계와 오디오 장치의 시계', () => {
  it('소리 켜기 전에도 재생기 시계는 흐른다(재생 막대와 편집이 소리 없이 움직인다)', () => {
    let t = 10;
    const { mixer } = setup({}, undefined, () => t);
    expect(mixer.clock.now()).toBe(10);
    t = 12.5;
    expect(mixer.clock.now()).toBe(12.5);
  });

  it('소리 받이는 음의 시각을 재생기 시계에서 오디오 장치 시계로 옮겨 준다', async () => {
    const { mixer, engines } = setup({}, undefined, () => 10);
    await mixer.enable();
    mixer.taskSink.schedule({ id: 'a', midi: 60, time: 10.5, duration: 0.5, velocity: 0.8 });
    expect(engines[0]!.sinks.get('task')!.requests[0]!.time).toBeCloseTo(50.5, 9); // 오디오 시계는 50, 재생기 시계는 10
  });

  it('소리 켜기를 재생 도중에 눌러도 시계가 튀지 않는다(재생기 시계는 그대로, 옮기는 값만 생긴다)', async () => {
    let t = 10;
    const { mixer, engines } = setup({}, undefined, () => t);
    const before = mixer.clock.now();
    await mixer.enable();
    expect(mixer.clock.now()).toBe(before);
    t = 10.2;
    engines[0]!.clock.t = 50.2; // 두 시계는 같은 속도로 흐른다
    mixer.taskSink.schedule({ id: 'a', midi: 60, time: 10.3, duration: 0.5, velocity: 0.8 });
    expect(engines[0]!.sinks.get('task')!.requests[0]!.time).toBeCloseTo(50.3, 9);
  });
});

describe('음소거와 음량', () => {
  it('켠 뒤 음소거하면 소리 받이가 막히고 전체 음량이 무음이 된다. 풀면 돌아온다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.setMuted(true);
    expect(mixer.muted).toBe(true);
    expect(mixer.soundState()).toBe('muted');
    expect(mixer.audible).toBe(false);
    mixer.taskSink.schedule(note());
    expect(engines[0]!.sinks.get('task')!.requests).toHaveLength(0);
    expect(engines[0]!.masterCalls.at(-1)!.db).toBe(SILENT_DB);
    mixer.setMuted(false);
    approx(engines[0]!.masterCalls.at(-1)!.db, volumeToDb(0.6));
    mixer.taskSink.schedule(note());
    expect(engines[0]!.sinks.get('task')!.requests).toHaveLength(1);
  });

  it('음소거 중에도 정지(cancelAll)는 엔진까지 간다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.setMuted(true);
    mixer.taskSink.cancelAll();
    expect(engines[0]!.sinks.get('task')!.cancelCalls).toBe(1);
  });

  it('기본 음량은 낮다: 전체 0.6, 배경 0.5', async () => {
    const { mixer } = setup();
    expect(mixer.settings).toEqual({ masterVolume: 0.6, worldVolume: 0.5, taskVolume: 1, muteWorldDuringQuest: false });
  });

  it('켤 때 버스 기본 음량을 설계서 8.1대로 만든다(과제 0, 바탕 −18, 층 −14, 서명 −12, 화면 −20 dB 더하기 배경 음량 설정)', async () => {
    const { mixer, engines } = setup({ worldVolume: 1 });
    await mixer.enable();
    const e = engines[0]!;
    expect(e.busCalls.get('task')![0]!.db).toBe(0);
    expect(e.busCalls.get('worldBed')![0]!.db).toBe(-18);
    expect(e.busCalls.get('worldLayer')![0]!.db).toBe(-14);
    expect(e.busCalls.get('worldSignature')![0]!.db).toBe(-12);
    expect(e.busCalls.get('ui')![0]!.db).toBe(-20);
    expect(BUS_DEFAULT_DB).toEqual({ task: 0, worldBed: -18, worldLayer: -14, worldSignature: -12, ui: -20 });
  });

  it('음량을 바꾸면 0–1로 자르고 부드럽게 반영한다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.setSettings({ masterVolume: 2, worldVolume: -1, taskVolume: Number.NaN });
    expect(mixer.settings).toMatchObject({ masterVolume: 1, worldVolume: 0, taskVolume: 0 });
    expect(engines[0]!.masterCalls.at(-1)).toEqual({ db: 0, ramp: 0.05 });
    expect(engines[0]!.lastBusDb('worldBed')).toBe(SILENT_DB);
    expect(engines[0]!.lastBusDb('task')).toBe(SILENT_DB);
  });

  it('volumeToDb: 1은 0 dB, 0.5는 약 −6 dB, 0은 무음', () => {
    expect(volumeToDb(1)).toBe(0);
    approx(volumeToDb(0.5), -6.0206);
    expect(volumeToDb(0)).toBe(SILENT_DB);
    expect(volumeToDb(5)).toBe(0);
  });
});

describe('과제 소리가 나면 배경이 줄어든다 (W-7)', () => {
  it('시작하면 세계 버스 셋을 0.15초에 걸쳐 12 dB 낮추고, 끝나면 0.6초에 걸쳐 되돌린다', async () => {
    const { mixer, engines } = setup({ worldVolume: 1 });
    await mixer.enable();
    const e = engines[0]!;
    const end = mixer.beginTaskSound();
    for (const id of ['worldBed', 'worldLayer', 'worldSignature'] as const) {
      expect(e.lastBusCall(id)).toEqual({ db: BUS_DEFAULT_DB[id] + DUCK_DB, ramp: DUCK_ATTACK_SEC });
    }
    expect(e.lastBusDb('ui')).toBe(-20); // 화면 버스는 줄이지 않는다
    expect(e.lastBusDb('task')).toBe(0);
    expect(mixer.ducked).toBe(true);
    end();
    for (const id of ['worldBed', 'worldLayer', 'worldSignature'] as const) {
      expect(e.lastBusCall(id)).toEqual({ db: BUS_DEFAULT_DB[id], ramp: DUCK_RELEASE_SEC });
    }
    expect(mixer.ducked).toBe(false);
  });

  it('과제 소리가 겹치면 처음 시작할 때만 낮추고 마지막이 끝날 때만 되돌린다', async () => {
    const { mixer, engines } = setup({ worldVolume: 1 });
    await mixer.enable();
    const e = engines[0]!;
    const a = mixer.beginTaskSound();
    const callsAfterFirst = e.busCalls.get('worldBed')!.length;
    const b = mixer.beginTaskSound();
    expect(e.busCalls.get('worldBed')!.length).toBe(callsAfterFirst); // 두 번째는 다시 낮추지 않는다
    a();
    expect(e.lastBusDb('worldBed')).toBe(-18 + DUCK_DB); // 아직 하나가 남아 있다
    b();
    expect(e.lastBusDb('worldBed')).toBe(-18);
  });

  it('끝 함수를 두 번 불러도 한 번만 센다', async () => {
    const { mixer } = setup();
    await mixer.enable();
    const a = mixer.beginTaskSound();
    const b = mixer.beginTaskSound();
    a();
    a();
    expect(mixer.ducked).toBe(true);
    b();
    expect(mixer.ducked).toBe(false);
  });

  it("'과제 중 배경 끄기'를 고르면 과제 소리 동안 세계 버스를 아예 끈다", async () => {
    const { mixer, engines } = setup({ worldVolume: 1, muteWorldDuringQuest: true });
    await mixer.enable();
    const e = engines[0]!;
    const end = mixer.beginTaskSound();
    for (const id of ['worldBed', 'worldLayer', 'worldSignature'] as const) expect(e.lastBusDb(id)).toBe(SILENT_DB);
    end();
    expect(e.lastBusDb('worldLayer')).toBe(-14);
  });

  it('배경을 줄이는 중에 설정을 바꿔도 줄어든 값에 반영된다', async () => {
    const { mixer, engines } = setup({ worldVolume: 1 });
    await mixer.enable();
    mixer.beginTaskSound();
    mixer.setSettings({ worldVolume: 0.5 });
    approx(engines[0]!.lastBusDb('worldBed'), -18 + volumeToDb(0.5) + DUCK_DB);
  });

  it('재료를 놓을 때 나는 음: 과제 버스로 한 음을 내고, 음이 끝나면 배경을 되돌린다', async () => {
    const { mixer, engines, timers } = setup({ worldVolume: 1 });
    await mixer.enable();
    const e = engines[0]!;
    mixer.playTaskNote(64, 0.6, 0.7);
    const req = e.sinks.get('task')!.requests[0]!;
    expect(req).toMatchObject({ midi: 64, duration: 0.6, velocity: 0.7 });
    expect(req.time).toBe(e.now());
    expect(e.lastBusDb('worldBed')).toBe(-18 + DUCK_DB);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBeCloseTo((0.6 + DUCK_TAIL_SEC) * 1000, 6);
    timers[0]!.fn();
    expect(e.lastBusDb('worldBed')).toBe(-18);
  });

  it('소리가 나갈 수 없는 상태에서 재료 음을 내면 배경도 줄이지 않는다', async () => {
    const { mixer, timers } = setup();
    mixer.playTaskNote(60);
    await mixer.enable();
    mixer.setMuted(true);
    mixer.playTaskNote(60);
    expect(timers).toHaveLength(0);
    expect(mixer.ducked).toBe(false);
  });
});

describe('돌을 밟을 때 나는 음(4.3, W-7, W-11)', () => {
  it('소리를 켜기 전에는 아무 일도 하지 않는다. 장치도 만들지 않는다(W-11)', () => {
    const { mixer, engines } = setup();
    expect(() => mixer.playWorldNote(60)).not.toThrow();
    expect(engines).toHaveLength(0);
    expect(mixer.audible).toBe(false);
  });

  it('켠 뒤에는 서명 버스(worldSignature)로 한 음을 내고, 배경을 줄이지는 않는다(세계의 소리다)', async () => {
    const { mixer, engines, timers } = setup({ worldVolume: 1 });
    await mixer.enable();
    const e = engines[0]!;
    mixer.playWorldNote(67, 0.5, 0.7);
    const req = e.sinks.get('worldSignature')!.requests[0]!;
    expect(req).toMatchObject({ midi: 67, duration: 0.5, velocity: 0.7 });
    expect(req.time).toBe(e.now());
    expect(e.sinks.get('task')?.requests ?? []).toHaveLength(0);
    expect(mixer.ducked).toBe(false);
    expect(timers).toHaveLength(0);
  });

  it('기본 길이는 0.5초이고, 기본 세기는 0.7이다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.playWorldNote(60);
    expect(engines[0]!.sinks.get('worldSignature')!.requests[0]).toMatchObject({ midi: 60, duration: 0.5, velocity: 0.7 });
  });

  it('음소거 중에는 소리를 내지 않는다. 풀면 다시 난다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.setMuted(true);
    mixer.playWorldNote(60);
    expect(engines[0]!.sinks.get('worldSignature')!.requests).toHaveLength(0);
    mixer.setMuted(false);
    mixer.playWorldNote(60);
    expect(engines[0]!.sinks.get('worldSignature')!.requests).toHaveLength(1);
  });

  it('과제 소리가 나는 동안에는 서명 버스도 다른 세계 소리처럼 줄어 있고, 끝나면 돌아온다(W-7)', async () => {
    const { mixer, engines, timers } = setup({ worldVolume: 1 });
    await mixer.enable();
    const e = engines[0]!;
    mixer.playTaskNote(64, 0.6, 0.7);
    expect(e.lastBusDb('worldSignature')).toBe(-12 + DUCK_DB);
    timers[0]!.fn();
    expect(e.lastBusDb('worldSignature')).toBe(-12);
  });

  it('소리를 켜다가 실패한 상태에서도 오류 없이 조용하다(W-8)', async () => {
    const { mixer } = setup({}, (e) => {
      e.startError = new Error('NotAllowedError');
    });
    await mixer.enable();
    expect(() => mixer.playWorldNote(60)).not.toThrow();
  });

  it('dispose 뒤에는 소리를 내지 않는다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.dispose();
    expect(() => mixer.playWorldNote(60)).not.toThrow();
    expect(engines[0]!.sinks.get('worldSignature')!.requests).toHaveLength(0);
  });
});

describe('상태 알림', () => {
  it('상태가 바뀔 때만 알리고, 바뀌지 않은 동안에는 같은 스냅샷을 준다', async () => {
    const { mixer } = setup();
    let n = 0;
    const off = mixer.subscribe(() => n++);
    const s0 = mixer.snapshot();
    expect(mixer.snapshot()).toBe(s0);
    await mixer.enable();
    expect(n).toBeGreaterThanOrEqual(2); // starting, on
    const s1 = mixer.snapshot();
    expect(s1).not.toBe(s0);
    expect(s1.state).toBe('on');
    mixer.setMuted(true);
    mixer.setMuted(true); // 같은 값은 알리지 않는다
    const before = n;
    off();
    mixer.setMuted(false);
    expect(n).toBe(before); // 구독을 끊은 뒤에는 알리지 않는다
  });

  it('dispose하면 꺼진 상태로 돌아가고 장치를 정리한다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    mixer.dispose();
    expect(engines[0]!.disposed).toBe(true);
    expect(mixer.state).toBe('off');
    expect(() => mixer.taskSink.schedule(note())).not.toThrow();
  });
});

describe('멈춘 오디오 장치를 깨운다 (8.6)', () => {
  it('소리를 켜기 전에는 장치를 만들지도 건드리지도 않는다(W-11)', () => {
    const { mixer, engines } = setup();
    mixer.wake();
    mixer.wake();
    expect(engines).toHaveLength(0);
    expect(mixer.state).toBe('off');
  });

  it('소리를 켠 뒤에는 장치에 깨우라고 요청한다. 부를 때마다 요청한다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    expect(engines[0]!.resumeCalls).toBe(0);
    mixer.wake();
    mixer.wake();
    expect(engines[0]!.resumeCalls).toBe(2);
    expect(mixer.state).toBe('on');
  });

  it('소리를 켜지 못한 상태에서는 깨우라고 요청하지 않고, 상태도 그대로다', async () => {
    const { mixer, engines } = setup({}, (e) => {
      e.startError = Object.assign(new Error('막힘'), { name: 'NotAllowedError' });
    });
    await mixer.enable();
    expect(mixer.state).toBe('failed');
    mixer.wake();
    expect(engines[0]!.resumeCalls).toBe(0);
    expect(mixer.state).toBe('failed');
  });

  it('브라우저가 거절해도 오류가 새지 않고 상태는 그대로다(다음 누르기에서 다시 한다)', async () => {
    const { mixer, engines } = setup({}, (e) => {
      e.resumeError = Object.assign(new Error('거절'), { name: 'NotAllowedError' });
    });
    await mixer.enable();
    expect(() => mixer.wake()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(engines[0]!.resumeCalls).toBe(1);
    expect(mixer.state).toBe('on');
    expect(mixer.audible).toBe(true);
  });

  it('장치를 깨우는 일이 없는 엔진(선택 기능)이어도 안전하다. 직접 끈 음소거는 깨우기와 상관없다', async () => {
    const { mixer, engines } = setup();
    await mixer.enable();
    (engines[0] as unknown as { resume?: unknown }).resume = undefined;
    expect(() => mixer.wake()).not.toThrow();
    mixer.setMuted(true);
    mixer.wake();
    expect(mixer.muted).toBe(true);
    expect(mixer.audible).toBe(false);
  });
});
