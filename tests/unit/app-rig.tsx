// 앱 전체를 jsdom에 올리는 시험 도구(제품 코드가 아니다). 월드는 가짜로 대신한다. 진짜 월드는 tests/flow가 확인한다.
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { App } from '@/app/App';
import { createAppContext } from '@/app/composition';
import type { AppContext } from '@/app/composition';
import type { StartWorld } from '@/app/world-host';
import type { IntervalTimer } from '@/audio/types';
import type { AttemptResult } from '@/domain/attempt';
import type { QuestDefinition } from '@/domain/content';
import type { Creation } from '@/domain/creation';
import type { DiscoveryDef } from '@/domain/discovery';
import type { PlayInstrumentDef } from '@/domain/play';
import type { Preferences, Settings } from '@/domain/save/settings';
import type { SessionSnapshot } from '@/domain/session';
import type { WorldCommand } from '@/platform/bridge';
import type { RouterWindow } from '@/platform/router';
import type { StartWorldOptions, WorldHandle } from '@/world/start';
import { FakeEngine } from './audio-fakes';
import { Q01, Q02, Q07, mount, quest } from './ui-rig';

/** 만든 앱의 내림 함수들. 시험이 중간에 앱 하나를 내리고 싶을 때 마지막 것을 꺼내 부른다 */
export const appCleanups: Array<() => void> = [];

/** 만든 앱을 모두 내린다. 시험 파일의 afterEach에서 부른다 */
export function cleanupApps(): void {
  for (const c of appCleanups.splice(0)) c();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
}

/** 해시를 바꾸면 듣는 쪽에 알리는 가짜 창. 기록(history)이 없어 닫기는 월드(#/)로 바꾼다 */
export function fakeWindow(hash: string, onReload?: () => void): RouterWindow {
  const listeners = new Set<() => void>();
  let current = hash;
  return {
    location: {
      get hash() {
        return current;
      },
      set hash(v: string) {
        current = v;
        for (const l of [...listeners]) l();
      },
      reload: () => onReload?.(),
    },
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
  };
}

export const flush = (): Promise<void> =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

export interface BootOptions {
  /** 채널. 기본은 미리보기(preview)다. 정식 공개(release)에서는 공개 상태인 과제와 발견 요소만 열리고 보인다(G2-7) */
  channel?: 'preview' | 'release';
  /** 과제 정의. 기본은 Q01, Q02, Q07 */
  definitions?: QuestDefinition[];
  /** 첫 안내 카드를 보이게 한다(기본은 이미 본 것으로 두어 월드가 바로 움직인다) */
  intro?: boolean;
  opened?: string[];
  /** 이미 다녀간 정거장 id들(저장에서 읽은 값) */
  visited?: string[];
  /** 저장에서 읽은 지난 시도 기록 */
  attempts?: AttemptResult[];
  /** 저장에서 읽은 도전 초안과 도움 연습 상태 */
  session?: SessionSnapshot;
  settings?: Settings;
  preferences?: Preferences;
  /** 저장(주도자와 저장소). 없으면 저장하지 않는 실행이다 */
  persistence?: NonNullable<Parameters<typeof createAppContext>[0]>['persistence'];
  /** 화면을 새로 불러오라는 요청을 받는다(저장 가져오기 뒤) */
  onReload?: () => void;
  /** 저장에서 읽은 찾은 발견 요소 id들 */
  found?: string[];
  /** 저장에서 읽은 저장한 곡들 */
  creations?: Creation[];
  /** 발견 요소. 기본은 content/discoveries의 것(채널에서 보이는 것) */
  discoveries?: DiscoveryDef[];
  /** 놀이 악기. 기본은 content/discoveries의 것(채널에서 보이는 것) */
  playInstruments?: PlayInstrumentDef[];
  /** 세계 시계(믹서가 쓰는 단조 시계)와 세계 소리의 타이머를 시험이 쥔다. 잔치처럼 시간이 흐르는 것을 시험할 때 쓴다 */
  clock?: { now: () => number; timer: IntervalTimer };
}

export async function bootApp(hash = '', opts: BootOptions = {}) {
  const starts: StartWorldOptions[] = [];
  let destroyed = 0;
  /** 믹서가 만든 가짜 엔진(소리를 켜기 전에는 만들어지지 않아 null이다) */
  let engine: FakeEngine | null = null;
  const startWorld: StartWorld = (o) => {
    starts.push(o);
    return { runtime: {} as WorldHandle['runtime'], scene: {} as WorldHandle['scene'], game: {} as WorldHandle['game'], destroy: () => void destroyed++ };
  };
  const ctx: AppContext = createAppContext({
    channel: opts.channel ?? 'preview',
    definitions: opts.definitions ?? [quest(Q01), quest(Q02), quest(Q07)],
    createEngine: () => (engine = new FakeEngine()),
    makeId: () => 'att',
    nowIso: () => '2026-11-10T00:00:00.000Z',
    world: { load: async () => startWorld },
    preferences: opts.preferences ?? { language: 'ko', introSeen: !opts.intro },
    ...(opts.settings ? { settings: opts.settings } : {}),
    ...(opts.opened ? { opened: opts.opened } : {}),
    ...(opts.visited ? { visited: opts.visited } : {}),
    ...(opts.attempts ? { attempts: opts.attempts } : {}),
    ...(opts.session ? { session: opts.session } : {}),
    ...(opts.persistence ? { persistence: opts.persistence } : {}),
    ...(opts.found ? { found: opts.found } : {}),
    ...(opts.creations ? { creations: opts.creations } : {}),
    ...(opts.discoveries ? { discoveries: opts.discoveries } : {}),
    ...(opts.playInstruments ? { playInstruments: opts.playInstruments } : {}),
    ...(opts.clock ? { monotonicNow: opts.clock.now, worldSound: { timer: opts.clock.timer } } : {}),
  });
  const win = fakeWindow(hash, opts.onReload);
  const parent = document.createElement('div');
  const m = mount(h(App, { ctx, win, worldParent: parent }));
  appCleanups.push(() => {
    m.unmount();
    ctx.dispose();
  });
  await flush();
  const commands: WorldCommand[] = [];
  ctx.world.bridge.commands.subscribe((c) => commands.push(c));
  const press = (code: string, init: KeyboardEventInit = {}): void => {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : undefined, bubbles: true, cancelable: true, ...init }));
    });
  };
  const send = (stationId: string): void => {
    act(() => ctx.world.bridge.events.send({ type: 'open-station', stationId }));
  };
  /** 가짜 월드가 준비되었다고 알린다(실제 월드는 첫 장면 조각이 올라오면 알린다) */
  const ready = (): void => {
    act(() => ctx.world.bridge.patchStatus({ ready: true }));
  };
  return { ctx, win, host: m.host, starts, parent, commands, press, send, ready, destroyed: () => destroyed, engine: () => engine };
}
