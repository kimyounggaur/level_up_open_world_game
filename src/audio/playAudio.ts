// 놀이 악기의 소리(설계서 3.5, 6-9c): 돌을 밟으면 그 돌의 음이 바로 울리고, 메아리 악기라면 한 박 뒤에 같은 음이 절반 세기로 한 번 더 울린다.
// 마디 단위로 예약하는 세계 소리(worldAudio)와 달리 밟은 순간에 낸다. 세계 서명 버스로 나가므로 과제 소리가 나는 동안에는 줄어들고 꺼진다(W-7),
// 소리를 켜기 전이거나 꺼져 있으면 아무것도 하지 않는다(W-11). 소리 받이는 음색마다 하나씩, 처음 쓸 때 믹서에서 신청한다.
import { PAD_NOTE_SEC, strikePlan } from '../domain/play';
import type { PlayInstrumentDef } from '../domain/play';
import type { WorldBusId } from './mixer';
import type { AudioClock, NoteSink, SinkOptions } from './types';

/** 믹서에서 필요한 것만. 가짜 믹서로 시험한다 */
export interface PlayMixer {
  registerWorldSink(bus: WorldBusId, options?: SinkOptions): NoteSink;
  /** 늘 흐르는 시계(초). 소리 받이의 시각은 이 시계 기준이다 */
  readonly clock: AudioClock;
}

/** 소리에 필요한 것만 */
export type PlayVoice = Pick<PlayInstrumentDef, 'playId' | 'timbre' | 'pads' | 'echo'>;

/** 낸 소리 하나의 기록(진단과 시험용) */
export interface PadNoteRecord {
  playId: string;
  pad: number;
  midi: number;
  /** 시계 기준 시작 시각 */
  time: number;
  velocity: number;
}

export class PlayAudio {
  private readonly byId = new Map<string, PlayVoice>();
  private readonly sinks = new Map<string, NoteSink>();
  private readonly log: PadNoteRecord[] = [];
  private seq = 0;
  private disposed = false;

  constructor(
    private readonly mixer: PlayMixer,
    instruments: readonly PlayVoice[],
  ) {
    for (const inst of instruments) this.byId.set(inst.playId, inst);
  }

  /** 돌 하나(1부터)를 밟았다. 아는 악기의 아는 돌이면 true */
  strike(playId: string, pad: number): boolean {
    if (this.disposed) return false;
    const inst = this.byId.get(playId);
    if (!inst) return false;
    const plan = strikePlan(inst, pad);
    if (plan.length === 0) return false;
    const sink = this.sinkFor(inst);
    const now = this.mixer.clock.now();
    for (const n of plan) {
      const time = now + n.delaySec;
      this.seq += 1;
      sink.schedule({ id: `play-${playId}-${pad}-${this.seq}`, midi: n.midi, time, duration: PAD_NOTE_SEC, velocity: n.velocity });
      this.log.push({ playId, pad, midi: n.midi, time, velocity: n.velocity });
      if (this.log.length > 64) this.log.shift();
    }
    return true;
  }

  /** 최근에 낸 소리들(진단과 시험용). 최대 64개 */
  recent(): readonly PadNoteRecord[] {
    return this.log;
  }

  /** 아직 울리지 않은 예약(메아리)을 지우고, 이 객체는 더 소리를 내지 않는다 */
  dispose(): void {
    this.disposed = true;
    for (const sink of this.sinks.values()) sink.cancelAll();
    this.sinks.clear();
  }

  /** 음색마다 소리 받이 하나. 같은 음색의 악기는 받이를 함께 쓴다 */
  private sinkFor(inst: PlayVoice): NoteSink {
    let sink = this.sinks.get(inst.timbre);
    if (!sink) {
      sink = this.mixer.registerWorldSink('worldSignature', { timbre: inst.timbre });
      this.sinks.set(inst.timbre, sink);
    }
    return sink;
  }
}
