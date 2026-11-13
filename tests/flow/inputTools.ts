// 흐름 시험 공용 도구(실제 Chrome): 입력 기록(W-4)과 오디오 장치 세기(W-11).
// 설치물 시험(installation.flow.ts)과 합주 무대 시험(stage.flow.ts)이 함께 쓴다. 컨텍스트를 만든 직후, 페이지를 열기 전에 설치한다.
import type { BrowserContext, Page } from 'playwright-core';

/** 입력 기록(`window.__input`): 키 누름 수, 누른 도구의 종류, 눌렀다 뗀 사이 가장 멀리 간 거리 */
export interface InputLog {
  keys: number;
  downs: number;
  types: string[];
  maxDrag: number;
}

/** 오디오 장치(AudioContext)가 만들어진 횟수를 센다: 소리를 켜기 전에는 0이어야 한다(W-11) */
export async function installAudioCounter(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __audioContexts: AudioContext[]; AudioContext: typeof AudioContext };
    w.__audioContexts = [];
    const Orig = w.AudioContext;
    w.AudioContext = class extends Orig {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__audioContexts.push(this);
      }
    } as typeof AudioContext;
  });
}

/** 다른 도구를 쓰지 않았다는 것을 시험이 스스로 확인한다(W-4): 키, 누르기(마우스·터치), 끌기 거리를 센다 */
export async function installInputLog(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const log: InputLog = { keys: 0, downs: 0, types: [], maxDrag: 0 };
    (window as unknown as { __input: InputLog }).__input = log;
    let down: { x: number; y: number } | null = null;
    window.addEventListener('keydown', () => void log.keys++, true);
    window.addEventListener(
      'pointerdown',
      (e) => {
        log.downs++;
        if (!log.types.includes(e.pointerType)) log.types.push(e.pointerType);
        down = { x: e.clientX, y: e.clientY };
      },
      true,
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        if (down) log.maxDrag = Math.max(log.maxDrag, Math.hypot(e.clientX - down.x, e.clientY - down.y));
        down = null;
      },
      true,
    );
  });
}

export const inputLog = (page: Page): Promise<InputLog> => page.evaluate(() => (window as unknown as { __input: InputLog }).__input);

/** 지금까지 만들어진 오디오 장치의 수 (installAudioCounter를 설치했을 때만) */
export const audioContextCount = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __audioContexts: unknown[] }).__audioContexts.length);
