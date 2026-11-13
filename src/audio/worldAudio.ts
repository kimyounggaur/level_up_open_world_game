// 4-5, 4-6 세계 소리(설계서 8.1~8.4). 세계 시계에 맞춰 마디마다 두 가지를 예약한다.
//  - 광장 합주(성부 여섯 × 밀도 셋, 7-5): 맥박과 마을의 화음 깔기(마을의 소리 층 0–3에 따라 없음 → 온음표 → 2분음표 → 4분음표로 펼침)에, 박자 강가의 층에 따라
//    타악(첫 박 → 4분음표 → 8분음표 채움)이, 종나무 숲의 층에 따라 베이스(온음표 근음 → 근음과 5음 → 걷는 베이스)가, 오선 언덕의 층에 따라 가락(뼈대 음 → 가락 전체 → 옥타브 위 겹침)이,
//    음계 길의 층에 따라 달리는 음(오름 음계 → 내림 음계 추가 → 2마디마다)이, 건반 늪의 층에 따라 꾸밈음(8마디에 하나 → 4마디마다 → 2마디마다)이 더해진다(6.2, 6-8, 7-5). 마을에서만 들린다.
//  - 지역의 바탕 소리(6-8, 7-4, 8.1 '세계 바탕'): 마을 밖 다섯 지역 안에서만, 긴 화음과 자연음(물소리, 바람 소리, 바람결, 풀 소리, 안개 소리)에
//    그 지역이 맡은 성부(타악, 베이스, 가락, 달리는 음, 꾸밈음)가 층만큼 더해진다. 지역 경계에서 2초에 걸쳐 들리고 사라진다(마을의 광장 합주도 같다).
//  - 표지의 소리(3.5, 7-4): 건반 늪의 기준음 탑이 A4를 낮게 울린다. 서명 소리와 같은 거리 감쇠(900 px)로, 마디마다 이어서 울린다.
//  - 정거장의 서명 소리: 4마디에 한 번, 정거장마다 시작 마디를 어긋나게. 900 px 안에서만, (1 − 거리 ÷ 900)의 제곱으로 줄어들고,
//    왼쪽에 있으면 왼쪽이 더 크다. 꽃등이 켜진 정거장은 성부가 하나 더해진 판이 울린다.
//  - 잔치(6.4): 열려 있는 동안 광장 합주를 합주의 첫 마디부터 두 번(16마디) 울린다. 그 밖에는 세계 시계의 마디를 그대로 따라 도는 합주다.
//  - 소리 조각(3.6): 마을 곳곳에 놓인 짧은 가락. 600 px 안에서만, 한 마디 울리고 한 마디 쉬며 이웃한 조각과 번갈아 울린다.
//    찾았는지와 무관하게 들린다: 소리가 찾는 길잡이다(발견은 판정이 없다, W-5).
// 세계 소리는 믹서의 세계 버스로 나가므로 과제 소리가 나는 동안 12 dB 줄거나 꺼진다(W-7). 이 파일은 그 일을 하지 않는다:
// 소리 받이만 믹서에서 얻어 쓴다. 소리를 켜기 전에는(W-11) 마디를 예약하지 않는다.
// 탭이 가려지면 멈추고, 돌아오면 다음 마디부터 저절로 다시 흐른다(과제 재생은 사용자가 다시 시작한다).
import { pieceHearGain } from '../domain/discovery';
import type { SoundPieceDef } from '../domain/discovery';
import { festivalLoopBar } from '../domain/festival';
import type { FestivalRun } from '../domain/festival';
import { BEAT_SEC, MIN_HEARD_GAIN, REGION_BEDS, REGION_TIMBRE, barInLoop, ensembleLayersOf, hearGain, hearPan, landmarkNotes, pieceRings, pieceWorldNotes, plazaBar, regionBedBar, rings, signatureOf, signatureOffset } from '../domain/worldsound';
import type { EnsembleLayers, LandmarkSoundDef, RegionBedDef, RegionPart, SignatureVersion, WorldNote } from '../domain/worldsound';
import type { LanternState } from '../domain/reaction';
import type { RegionId } from '../domain/world';
import { BarScheduler } from './clock';
import type { WorldClock } from './clock';
import type { WorldBusId } from './mixer';
import type { IntervalTimer, NoteSink, SinkOptions, TimbreId, ToneTimbreId } from './types';

/** 마을 소리 층이 들리는 지역. 광장 합주는 마을의 것이다(6.2) */
export const PLAZA_REGION: RegionId = 'village';
/** 지역 경계에서 광장 합주가 들리고 사라지는 데 걸리는 시간(8.1) */
export const REGION_FADE_SEC = 2;
const SILENT = -Infinity;
const MAX_RINGS_KEPT = 24;
/** 지역이 맡은 성부를 내는 음색: 타악은 딱, 베이스는 둥글게, 가락은 맑게, 달리는 음은 짧게 튕기고, 꾸밈음은 방울처럼(6-8, 7-4) */
export const PART_TIMBRE: Readonly<Record<RegionPart, ToneTimbreId>> = { percussion: 'tick', bass: 'bass', melody: 'lead', runner: 'run', ornament: 'spark' };

export interface SoundStation {
  stationId: string;
  regionId: RegionId;
  x: number;
  y: number;
}

/** 믹서에서 필요한 것만. 가짜 믹서로 시험한다 */
export interface WorldSoundMixer {
  registerWorldSink(bus: WorldBusId, options?: SinkOptions): NoteSink;
  readonly audible: boolean;
  subscribe(listener: () => void): () => void;
}

/** 월드에서 들리는 소리 조각. 발견 요소의 소리 조각에서 소리에 필요한 것만 */
export type SoundPieceSource = Pick<SoundPieceDef, 'discoveryId' | 'regionId' | 'x' | 'y' | 'notes'>;

/** 소리를 내는 지역 표지: 어느 음을 울리는지(LANDMARK_SOUNDS)와 표지가 선 자리 */
export interface SoundLandmark extends LandmarkSoundDef {
  x: number;
  y: number;
}

export interface WorldAudioDeps {
  mixer: WorldSoundMixer;
  clock: WorldClock;
  timer: IntervalTimer;
  /** 서명 소리가 있는 정거장들. 순서가 시작 마디를 정한다 */
  stations: readonly SoundStation[];
  /** 마을에 놓인 소리 조각들. 순서가 울리는 마디의 짝홀을 정한다. 없으면 조각 소리는 없다 */
  pieces?: readonly SoundPieceSource[];
  /** 소리를 내는 지역 표지들(건반 늪의 기준음 탑). 없으면 표지의 소리는 없다 */
  landmarks?: readonly SoundLandmark[];
  /** 지금 열려 있는 잔치의 마디 구간. 없거나 null이면 잔치가 아니다(6.4) */
  festival?: () => FestivalRun | null;
  /**
   * 소리에 필요한 세계 반응: 마을의 소리 층, 정거장마다 등불, 지역마다 소리 층(박자 강가의 타악, 종나무 숲의 베이스가 읽는다).
   * 지역마다 소리 층을 주지 않은 지역은 0층이다
   */
  reaction: () => { villageLayer: number; lanterns: Readonly<Record<string, LanternState>>; regionLayers?: Readonly<Partial<Record<RegionId, number>>> };
  /** 듣는 자리(캐릭터) */
  listener: () => { x: number; y: number; regionId: RegionId };
  /** 탭이 가려져 있는가와 그 변화. 없으면 늘 보이는 것으로 친다 */
  visibility?: { hidden(): boolean; subscribe(listener: () => void): () => void };
}

/** 울린 서명 소리 하나의 기록(진단과 시험용) */
export interface RingRecord {
  bar: number;
  stationId: string;
  version: SignatureVersion;
  /** 0–1 거리에 따른 음량 */
  gain: number;
  /** −1–1 */
  pan: number;
  /** 시계 기준 시작 시각 */
  time: number;
}

/** 울린 소리 조각 하나의 기록(진단과 시험용) */
export interface PieceRingRecord {
  bar: number;
  discoveryId: string;
  /** 0–1 거리에 따른 음량 */
  gain: number;
  /** −1–1 */
  pan: number;
  /** 시계 기준 시작 시각 */
  time: number;
}

/** 울린 표지 소리 하나의 기록(진단과 시험용) */
export interface LandmarkRingRecord {
  bar: number;
  regionId: RegionId;
  /** 0–1 거리에 따른 음량 */
  gain: number;
  /** −1–1 */
  pan: number;
  /** 시계 기준 시작 시각 */
  time: number;
}

/** 광장 합주로 예약한 마디 하나의 기록(진단과 시험용). 성부마다 예약한 음의 수와 그때 읽은 층 */
export interface PlazaBarRecord {
  bar: number;
  chord: string;
  pulse: number;
  bed: number;
  percussion: number;
  bass: number;
  melody: number;
  runner: number;
  ornament: number;
  layers: EnsembleLayers;
}

/** 지역의 바탕 소리로 예약한 마디 하나의 기록(진단과 시험용) */
export interface RegionBarRecord {
  bar: number;
  regionId: RegionId;
  /** 그때 읽은 그 지역의 소리 층 */
  layer: number;
  chord: number;
  nature: number;
  part: number;
}

export interface WorldAudioDebug {
  running: boolean;
  bar: number;
  nextBar: number | null;
  villageLayer: number;
  /** 광장 합주가 지금 들리는 자리인가(마을 안) */
  plazaAudible: boolean;
  /** 지금 소리가 들리게 열어 둔 지역(광장 합주의 마을, 바탕 소리가 있는 지역) */
  audibleRegions: RegionId[];
  /** 최근에 예약한 광장 합주의 마디들 */
  plazaBars: PlazaBarRecord[];
  /** 최근에 예약한 지역 바탕 소리의 마디들 */
  regionBars: RegionBarRecord[];
  barsScheduled: number;
  notesScheduled: number;
  rings: RingRecord[];
  /** 최근에 울린 소리 조각들 */
  pieceRings: PieceRingRecord[];
  /** 최근에 울린 표지의 소리들 */
  landmarkRings: LandmarkRingRecord[];
  /** 잔치의 마디로 예약한 광장 합주의 마디 수(잔치가 아닌 마디는 세지 않는다) */
  festivalBars: number;
}

export class WorldAudio {
  private readonly d: WorldAudioDeps;
  private readonly scheduler: BarScheduler;
  private readonly pulse: NoteSink;
  private readonly bed: NoteSink;
  /** 광장 합주의 타악(박자 강가의 층), 베이스(종나무 숲), 가락(오선 언덕), 달리는 음(음계 길), 꾸밈음(건반 늪) */
  private readonly percussion: NoteSink;
  private readonly bass: NoteSink;
  private readonly melody: NoteSink;
  private readonly runner: NoteSink;
  private readonly ornament: NoteSink;
  /** 지역의 바탕 소리: 긴 화음과 자연음(세계 바탕 버스), 그 지역이 맡은 성부(세계 층 버스) */
  private readonly beds: Array<{ def: RegionBedDef; chord: NoteSink; nature: NoteSink; part: NoteSink }>;
  private readonly signatureSinks = new Map<TimbreId, NoteSink>();
  private readonly offs: Array<() => void> = [];
  /** 지역마다 소리가 열려 있는가. 아직 모르면 비어 있다 */
  private readonly audibleIn = new Map<RegionId, boolean>();
  private recentPlazaBars: PlazaBarRecord[] = [];
  private recentRegionBars: RegionBarRecord[] = [];
  private lastLayer = 0;
  private notes = 0;
  private recent: RingRecord[] = [];
  private recentPieces: PieceRingRecord[] = [];
  private recentLandmarks: LandmarkRingRecord[] = [];
  private festivalBars = 0;
  private disposed = false;

  constructor(deps: WorldAudioDeps) {
    this.d = deps;
    this.pulse = deps.mixer.registerWorldSink('worldLayer', { timbre: 'thump' });
    this.bed = deps.mixer.registerWorldSink('worldLayer', { timbre: 'pad' });
    this.percussion = deps.mixer.registerWorldSink('worldLayer', { timbre: PART_TIMBRE.percussion });
    this.bass = deps.mixer.registerWorldSink('worldLayer', { timbre: PART_TIMBRE.bass });
    this.melody = deps.mixer.registerWorldSink('worldLayer', { timbre: PART_TIMBRE.melody });
    this.runner = deps.mixer.registerWorldSink('worldLayer', { timbre: PART_TIMBRE.runner });
    this.ornament = deps.mixer.registerWorldSink('worldLayer', { timbre: PART_TIMBRE.ornament });
    this.beds = REGION_BEDS.map((def) => ({
      def,
      chord: deps.mixer.registerWorldSink('worldBed', { timbre: 'pad' }),
      nature: deps.mixer.registerWorldSink('worldBed', { timbre: def.nature }),
      part: deps.mixer.registerWorldSink('worldLayer', { timbre: PART_TIMBRE[def.part] }),
    }));
    this.scheduler = new BarScheduler({
      clock: deps.clock,
      timer: deps.timer,
      onBar: (bar, start) => this.onBar(bar, start),
      onTick: () => this.syncRegions(),
    });
    this.offs.push(deps.mixer.subscribe(() => this.evaluate()));
    if (deps.visibility) this.offs.push(deps.visibility.subscribe(() => this.evaluate()));
    this.evaluate();
  }

  /** 소리가 나갈 수 있고(켰고 음소거가 아니다) 탭이 보일 때만 돈다 */
  private evaluate(): void {
    if (this.disposed) return;
    const hidden = this.d.visibility?.hidden() ?? false;
    const should = this.d.mixer.audible && !hidden;
    if (should && !this.scheduler.running) {
      this.audibleIn.clear();
      this.scheduler.start();
    } else if (!should && this.scheduler.running) {
      this.scheduler.halt();
      this.cancelAll();
    }
  }

  private cancelAll(): void {
    for (const s of this.plazaSinks()) s.cancelAll();
    for (const b of this.beds) for (const s of [b.chord, b.nature, b.part]) s.cancelAll();
    for (const s of this.signatureSinks.values()) s.cancelAll();
  }

  private plazaSinks(): NoteSink[] {
    return [this.pulse, this.bed, this.percussion, this.bass, this.melody, this.runner, this.ornament];
  }

  /**
   * 광장 합주는 마을 안에서만, 지역의 바탕 소리는 그 지역 안에서만 들린다. 경계를 넘으면 2초에 걸쳐 들리고 사라진다(8.1):
   * 나가는 지역의 소리는 잦아들고 들어가는 지역의 소리는 일어서서 서로 섞인다.
   */
  private syncRegions(): void {
    const here = this.d.listener().regionId;
    const groups: Array<{ regionId: RegionId; sinks: NoteSink[] }> = [
      { regionId: PLAZA_REGION, sinks: this.plazaSinks() },
      ...this.beds.map((b) => ({ regionId: b.def.regionId, sinks: [b.chord, b.nature, b.part] })),
    ];
    for (const g of groups) {
      const on = here === g.regionId;
      if (this.audibleIn.get(g.regionId) === on) continue;
      this.audibleIn.set(g.regionId, on);
      for (const sink of g.sinks) sink.setLevel?.(on ? 0 : SILENT, REGION_FADE_SEC);
    }
  }

  private signatureSink(timbre: TimbreId): NoteSink {
    let sink = this.signatureSinks.get(timbre);
    if (!sink) {
      sink = this.d.mixer.registerWorldSink('worldSignature', { timbre, pan: true });
      this.signatureSinks.set(timbre, sink);
    }
    return sink;
  }

  private onBar(absBar: number, start: number): void {
    const { villageLayer, lanterns, regionLayers } = this.d.reaction();
    const here = this.d.listener();
    const layerOf = (id: RegionId): number => (id === PLAZA_REGION ? villageLayer : (regionLayers?.[id] ?? 0));
    this.lastLayer = villageLayer;
    this.syncRegions();

    // 광장 합주(마을 안에서만 예약한다). 잔치 동안은 합주의 첫 마디부터 두 번 울린다(6.4).
    // 마을 밖 지역은 자기 층만큼 성부를 더한다: 박자 강가는 타악, 종나무 숲은 베이스, 오선 언덕은 가락, 음계 길은 달리는 음, 건반 늪은 꾸밈음(6.2 표)
    if (here.regionId === PLAZA_REGION) {
      const fest = festivalLoopBar(this.d.festival?.() ?? null, absBar);
      if (fest !== null) this.festivalBars += 1;
      const layers = ensembleLayersOf(layerOf);
      const plaza = plazaBar(fest ?? barInLoop(absBar), layers.village, layers);
      this.send(this.pulse, plaza.pulse, `pulse-${absBar}`, start);
      this.send(this.bed, plaza.bed, `bed-${absBar}`, start);
      this.send(this.percussion, plaza.percussion, `perc-${absBar}`, start);
      this.send(this.bass, plaza.bass, `bass-${absBar}`, start);
      this.send(this.melody, plaza.melody, `melody-${absBar}`, start);
      this.send(this.runner, plaza.runner, `runner-${absBar}`, start);
      this.send(this.ornament, plaza.ornament, `ornament-${absBar}`, start);
      this.recentPlazaBars.push({
        bar: absBar,
        chord: plaza.chord,
        pulse: plaza.pulse.length,
        bed: plaza.bed.length,
        percussion: plaza.percussion.length,
        bass: plaza.bass.length,
        melody: plaza.melody.length,
        runner: plaza.runner.length,
        ornament: plaza.ornament.length,
        layers,
      });
      if (this.recentPlazaBars.length > MAX_RINGS_KEPT) this.recentPlazaBars.splice(0, this.recentPlazaBars.length - MAX_RINGS_KEPT);
    }

    // 지역의 바탕 소리(그 지역 안에서만 예약한다): 긴 화음과 자연음, 그 지역이 맡은 성부
    const bed = this.beds.find((b) => b.def.regionId === here.regionId);
    if (bed) {
      const layer = layerOf(bed.def.regionId);
      const bar = regionBedBar(bed.def.regionId, barInLoop(absBar), layer);
      if (bar) {
        const id = `${bed.def.regionId}-${absBar}`;
        this.send(bed.chord, bar.chord, `bedchord-${id}`, start);
        this.send(bed.nature, bar.nature, `nature-${id}`, start);
        this.send(bed.part, bar.part, `part-${id}`, start);
        this.recentRegionBars.push({ bar: absBar, regionId: bed.def.regionId, layer, chord: bar.chord.length, nature: bar.nature.length, part: bar.part.length });
        if (this.recentRegionBars.length > MAX_RINGS_KEPT) this.recentRegionBars.splice(0, this.recentRegionBars.length - MAX_RINGS_KEPT);
      }
    }

    // 정거장의 서명 소리
    this.d.stations.forEach((st, i) => {
      if (!rings(absBar, signatureOffset(i))) return;
      const dx = st.x - here.x;
      const gain = hearGain(Math.hypot(dx, st.y - here.y));
      if (gain < MIN_HEARD_GAIN) return;
      const flower = lanterns[st.stationId] === 'flower';
      const sig = signatureOf(st.stationId);
      const pan = hearPan(dx);
      this.send(this.signatureSink(REGION_TIMBRE[st.regionId]), flower ? [...sig.base, ...sig.flowerVoice] : sig.base, `sig-${st.stationId}-${absBar}`, start, gain, pan);
      this.recent.push({ bar: absBar, stationId: st.stationId, version: flower ? 'flower' : 'base', gain, pan, time: start });
      if (this.recent.length > MAX_RINGS_KEPT) this.recent.splice(0, this.recent.length - MAX_RINGS_KEPT);
    });

    // 소리 조각: 600 px 안에서만 들린다
    (this.d.pieces ?? []).forEach((p, i) => {
      if (!pieceRings(absBar, i)) return;
      const dx = p.x - here.x;
      const gain = pieceHearGain(Math.hypot(dx, p.y - here.y));
      if (gain < MIN_HEARD_GAIN) return;
      const pan = hearPan(dx);
      this.send(this.signatureSink(REGION_TIMBRE[p.regionId]), pieceWorldNotes(p), `piece-${p.discoveryId}-${absBar}`, start, gain, pan);
      this.recentPieces.push({ bar: absBar, discoveryId: p.discoveryId, gain, pan, time: start });
      if (this.recentPieces.length > MAX_RINGS_KEPT) this.recentPieces.splice(0, this.recentPieces.length - MAX_RINGS_KEPT);
    });

    // 표지의 소리(기준음 탑): 900 px 안에서만, 서명 소리와 같은 거리 감쇠로 들린다. 마디마다 이어서 울린다
    (this.d.landmarks ?? []).forEach((lm) => {
      const dx = lm.x - here.x;
      const gain = hearGain(Math.hypot(dx, lm.y - here.y));
      if (gain < MIN_HEARD_GAIN) return;
      const pan = hearPan(dx);
      this.send(this.signatureSink('fork'), landmarkNotes(lm), `landmark-${lm.regionId}-${absBar}`, start, gain, pan);
      this.recentLandmarks.push({ bar: absBar, regionId: lm.regionId, gain, pan, time: start });
      if (this.recentLandmarks.length > MAX_RINGS_KEPT) this.recentLandmarks.splice(0, this.recentLandmarks.length - MAX_RINGS_KEPT);
    });
  }

  private send(sink: NoteSink, notes: readonly WorldNote[], idBase: string, barStart: number, gain = 1, pan?: number): void {
    notes.forEach((n, k) => {
      this.notes += 1;
      sink.schedule({
        id: `${idBase}-${k}`,
        midi: n.midi,
        time: barStart + n.beat * BEAT_SEC,
        duration: n.beats * BEAT_SEC,
        velocity: Math.min(1, n.velocity * gain),
        ...(pan === undefined ? {} : { pan }),
      });
    });
  }

  debug(): WorldAudioDebug {
    return {
      running: this.scheduler.running,
      bar: this.d.clock.bar(),
      nextBar: this.scheduler.nextBar,
      villageLayer: this.lastLayer,
      plazaAudible: this.audibleIn.get(PLAZA_REGION) === true,
      audibleRegions: [...this.audibleIn].filter(([, on]) => on).map(([id]) => id),
      plazaBars: [...this.recentPlazaBars],
      regionBars: [...this.recentRegionBars],
      barsScheduled: this.scheduler.barsScheduled,
      notesScheduled: this.notes,
      rings: [...this.recent],
      pieceRings: [...this.recentPieces],
      landmarkRings: [...this.recentLandmarks],
      festivalBars: this.festivalBars,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.halt();
    this.cancelAll();
    for (const off of this.offs.splice(0)) off();
  }
}
