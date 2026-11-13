// 화면 컴포넌트 테스트용 도구(jsdom). 제품 코드가 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { Mixer } from '@/audio/mixer';
import { TaskTransport } from '@/audio/transport';
import { ContentCatalog } from '@/domain/catalog';
import type { Channel } from '@/domain/catalog';
import type { QuestDefinition } from '@/domain/content';
import { ChallengeSession } from '@/domain/session';
import { ChallengeController } from '@/ui/challenge/controller';
import { FakeClock, FakeEngine, FakeTimer } from './audio-fakes';
import { installDomStubs } from './dom-setup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const quest = (id: string): QuestDefinition => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', `${id}.json`), 'utf-8')) as QuestDefinition;
export const Q01 = 'pitch.same-note-two-clefs';
export const Q02 = 'rhythm.rest-in-a-bar';
export const Q07 = 'scale.major';
export const Q03 = 'rhythm.short-notes-and-triplets';
export const Q04 = 'pitch.same-sound-different-names';
export const Q05 = 'chord.major-triad';
export const Q06 = 'chord.inversion';
export const Q08 = 'song.short-piece';

/** 어떤 패널 목록에도 오른 적 없는 패널 id. 화면이 없는 패널을 시험하려면 이 id를 가리키게 한다 */
export const UNBUILT_PANEL = 'panel.unbuilt';

/**
 * 패널 화면이 아직 만들어지지 않은 상태의 같은 과제: 패널 배치가 화면 없는 패널(UNBUILT_PANEL)을 가리킨다.
 * 데이터는 올바르고 화면만 없는 경우('화면 준비 중' 경로)를 시험할 때 쓴다. 패널이 하나씩 만들어져도 이 id는 늘 화면이 없다.
 */
export function screenless(def: QuestDefinition): QuestDefinition {
  return { ...def, placements: def.placements.map((p) => (p.kind === 'panel' ? { ...p, panelId: UNBUILT_PANEL as never } : p)) };
}

export function setupDom(): void {
  installDomStubs();
}

/** `extra`: 기본 세 과제(Q01, Q02, Q07)에 더해 올릴 과제 id */
export function rig(channel: Channel = 'preview', extra: string[] = []) {
  const catalog = new ContentCatalog([quest(Q01), quest(Q02), quest(Q07), ...extra.map(quest)], channel);
  const session = new ChallengeSession();
  const engine = new FakeEngine();
  const mono = new FakeClock(10);
  const mixer = new Mixer({ createEngine: () => engine, monotonicNow: () => mono.now(), setTimer: () => () => {} });
  const timer = new FakeTimer();
  const transport = new TaskTransport({ clock: mixer.clock, timer, sink: mixer.taskSink });
  let n = 0;
  const controller = new ChallengeController({ catalog, session, mixer, transport, makeId: () => `att-${++n}`, nowIso: () => '2026-11-10T00:00:00.000Z' });
  const run = (seconds: number): void => {
    const end = mono.t + seconds;
    act(() => {
      while (mono.t < end - 1e-9) {
        mono.t = Math.min(end, mono.t + 0.025);
        engine.clock.t += 0.025;
        timer.fire();
      }
    });
  };
  return { catalog, session, engine, mono, mixer, timer, transport, controller, run };
}

export type Rig = ReturnType<typeof rig>;

export function mount(ui: ComponentChild): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(ui, host);
  });
  return {
    host,
    unmount: () => {
      act(() => {
        render(null, host);
      });
      host.remove();
    },
  };
}

export function click(el: Element | null, init: MouseEventInit = {}): void {
  if (!el) throw new Error('누를 요소가 없어요');
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  });
}

export function keydown(el: Element | null, key: string, init: KeyboardEventInit = {}): boolean {
  if (!el) throw new Error('키를 보낼 요소가 없어요');
  let prevented = false;
  act(() => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(ev);
    prevented = ev.defaultPrevented;
  });
  return prevented;
}

export const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export const q = <T extends Element = HTMLElement>(host: ParentNode, selector: string): T | null => host.querySelector<T>(selector);
export const qa = <T extends Element = HTMLElement>(host: ParentNode, selector: string): T[] => [...host.querySelectorAll<T>(selector)];

/** 이름(글자)으로 단추를 찾는다. 아이콘 글자는 없으므로 보이는 글자의 일부로 찾는다 */
export function button(host: ParentNode, label: string | RegExp): HTMLButtonElement {
  const all = qa<HTMLButtonElement>(host, 'button');
  const found = all.find((b) => {
    const name = b.getAttribute('aria-label') ?? text(b);
    return typeof label === 'string' ? name.includes(label) : label.test(name);
  });
  if (!found) throw new Error(`'${String(label)}' 단추를 찾지 못했어요. 있는 단추: ${all.map((b) => b.getAttribute('aria-label') ?? text(b)).join(' | ')}`);
  return found;
}
