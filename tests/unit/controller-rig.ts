// 컨트롤러·작업대·패널 시험이 함께 쓰는 틀. 제품 코드가 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mixer } from '@/audio/mixer';
import { TaskTransport } from '@/audio/transport';
import { ContentCatalog } from '@/domain/catalog';
import type { Channel } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { addCreation, pieceInsertEdit } from '@/domain/creation';
import type { Creation } from '@/domain/creation';
import { parseInstallation } from '@/domain/installation';
import type { InstallationDef } from '@/domain/installation';
import { ChallengeSession } from '@/domain/session';
import type { ScoreEvent } from '@/domain/score';
import type { SessionSnapshot } from '@/domain/session';
import { ChallengeController } from '@/ui/challenge/controller';
import { SlotBench } from '@/ui/challenge/slotBench';
import { FakeClock, FakeEngine, FakeTimer } from './audio-fakes';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const Q01 = 'pitch.same-note-two-clefs';
export const Q02 = 'rhythm.rest-in-a-bar';
export const Q07 = 'scale.major';

export const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;

export function installation(id = 'inst.village.scale-stones'): InstallationDef {
  const file = `${id}.json`;
  const { installation: def, issues } = parseInstallation(JSON.parse(fs.readFileSync(path.join(root, 'content', 'installations', file), 'utf-8')), file);
  if (!def) throw new Error(`설치물을 읽지 못했어요: ${JSON.stringify(issues)}`);
  return def;
}

export interface RigOptions {
  definitions?: readonly QuestDefinition[];
  channel?: Channel;
  session?: SessionSnapshot;
}

/** 컨트롤러와 가짜 소리 장치. 시계를 직접 흘려 보낼 수 있다 */
export function rig(options: RigOptions = {}) {
  const catalog = new ContentCatalog(options.definitions ?? [quest(Q01), quest(Q02), quest(Q07)], options.channel ?? 'preview');
  const session = new ChallengeSession(options.session);
  const engine = new FakeEngine();
  const mono = new FakeClock(10);
  const mixer = new Mixer({ createEngine: () => engine, monotonicNow: () => mono.now(), setTimer: () => () => {} });
  const timer = new FakeTimer();
  const transport = new TaskTransport({ clock: mixer.clock, timer, sink: mixer.taskSink });
  let n = 0;
  const controller = new ChallengeController({ catalog, session, mixer, transport, makeId: () => `att-${++n}`, nowIso: () => '2026-11-11T00:00:00.000Z' });
  const bench = new SlotBench(controller);
  const run = (seconds: number): void => {
    const end = mono.t + seconds;
    while (mono.t < end - 1e-9) {
      mono.t = Math.min(end, mono.t + 0.025);
      engine.clock.t += 0.025;
      timer.fire();
    }
  };
  return { catalog, session, engine, mono, mixer, timer, transport, controller, bench, run };
}

export type Rig = ReturnType<typeof rig>;

// ───── 자유 가락(4.9, 5-6) 시험용 재료 ─────

/** 한 마디를 8분음표 여덟 개로 가득 채우는 소리 조각 모양의 음들 */
export const EIGHT = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({ midi, onsetTicks: i * 480, durationTicks: 480 }));

/** 한 마디를 EIGHT로 채운 가락의 사건들(저장한 곡을 만드는 데 쓴다) */
export function melodyEvents(measure: number, idBase: string): ScoreEvent[] {
  const edit = pieceInsertEdit({ events: [] }, EIGHT, measure, idBase)!;
  return (edit as { type: 'batch'; edits: Array<{ type: 'addEvent'; event: ScoreEvent }> }).edits.map((e) => e.event);
}

/** 합주 무대에서 저장한 곡 n개(곡 1 … 곡 n, 곡 i는 i번째 마디만 채운다) */
export function songsOf(n: number, installationId = 'inst.village.ensemble-stage'): Creation[] {
  let list: Creation[] = [];
  for (let i = 0; i < n; i++) {
    const r = addCreation(list, { name: `곡 ${i + 1}`, installationId, events: melodyEvents(i % 4, `s${i}`), createdAt: '2026-11-11T00:00:00.000Z' });
    if (!r.ok) throw new Error(r.message);
    list = r.creations;
  }
  return list;
}
