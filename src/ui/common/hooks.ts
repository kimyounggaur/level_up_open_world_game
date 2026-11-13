// 컨트롤러가 바뀔 때 화면을 다시 그리는 작은 도구들.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mixer, MixerSnapshot } from '../../audio/mixer';
import type { Store } from '../../platform/bridge';
import type { ChallengeController } from '../challenge/controller';
import type { SlotBench } from '../challenge/slotBench';

/**
 * 저장소(Store)의 값을 읽고, 바뀔 때마다 이 컴포넌트를 다시 그린다.
 * 값은 그릴 때마다 저장소에서 새로 읽는다(상태로 복사해 두지 않는다): 월드가 한 순간에 상태를 연달아 바꾸거나,
 * 그리는 일과 구독하는 일 사이에 값이 바뀌어도 오래된 값이 화면에 남지 않는다.
 */
export function useStore<T>(store: Store<T>): T {
  const [, bump] = useState(0);
  const shown = useRef<T>(store.get());
  shown.current = store.get();
  useEffect(() => {
    // 구독하기 전에 이미 바뀌었으면 한 번 더 그린다
    if (!Object.is(shown.current, store.get())) bump((n) => n + 1);
    return store.subscribe(() => bump((n) => n + 1));
  }, [store]);
  return shown.current;
}

/** 키보드와 마우스 없이 손가락으로만 쓰는 화면인가. 안내 칩의 글이 달라진다 */
export function useTouchOnly(): boolean {
  const [query] = useState<MediaQueryList | null>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(hover: none) and (pointer: coarse)') : null,
  );
  const [touchOnly, setTouchOnly] = useState<boolean>(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (): void => setTouchOnly(query.matches);
    on();
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, [query]);
  return touchOnly;
}

/** 세로 화면인가(hud.css의 `orientation: portrait`와 같은 기준). 세로에서는 아래 탭 막대가 화면 아래를 가린다 */
export function usePortrait(): boolean {
  const [query] = useState<MediaQueryList | null>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: portrait)') : null,
  );
  const [portrait, setPortrait] = useState<boolean>(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (): void => setPortrait(query.matches);
    on();
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, [query]);
  return portrait;
}

/** 컨트롤러가 바뀔 때마다 이 컴포넌트를 다시 그리게 한다 */
export function useController(controller: ChallengeController): ChallengeController {
  const [, setVersion] = useState(0);
  useEffect(() => controller.subscribe(() => setVersion((v) => v + 1)), [controller]);
  return controller;
}

/** 놓기 작업대(손에 든 재료, 고른 자리)가 바뀔 때마다 이 컴포넌트를 다시 그리게 한다. 돌 작업대(SlotBench)와 징검다리 작업대(TimelineBench)가 함께 쓴다 */
export function useBench<B extends Pick<SlotBench, 'subscribe'>>(bench: B): B {
  const [, setVersion] = useState(0);
  useEffect(() => bench.subscribe(() => setVersion((v) => v + 1)), [bench]);
  return bench;
}

/**
 * 재생하는 동안 지금 재생 위치가 있는 박 칸의 id를 알려 준다. 칸이 바뀔 때만 다시 그린다.
 * 움직임 줄이기와 무관하다: 위치 표시는 연출이 아니라 정보다.
 */
export function usePlayheadCell(controller: ChallengeController): string | null {
  const [cellId, setCellId] = useState<string | null>(null);
  const playing = controller.playing;
  useEffect(() => {
    if (!playing) {
      setCellId(null);
      return;
    }
    let frame = 0;
    const tick = (): void => {
      const id = controller.playheadCell()?.cellId ?? null;
      setCellId((prev) => (prev === id ? prev : id));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [controller, playing]);
  return cellId;
}

/**
 * 지금 재생 위치(틱). 멈춰 있으면 null. 소리를 꺼 두어도 위치는 움직인다.
 * 시간선 과제처럼 박보다 작은 단위로 위치를 보여 줄 때 쓴다. `quantum` 틱 단위로 바뀔 때만 다시 그린다.
 */
export function usePlayheadTick(controller: ChallengeController, quantum = 40): number | null {
  const [tick, setTick] = useState<number | null>(null);
  const playing = controller.playing;
  useEffect(() => {
    if (!playing) {
      setTick(null);
      return;
    }
    let frame = 0;
    const loop = (): void => {
      const now = controller.positionTick();
      const snapped = now === null ? null : Math.floor(now / quantum) * quantum;
      setTick((prev) => (prev === snapped ? prev : snapped));
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [controller, playing, quantum]);
  return tick;
}

/** '두 음 듣기'로 지금 울리는 보표 칸 번호. 바뀔 때만 다시 그린다 */
export function usePlayheadSlot(controller: ChallengeController): number | null {
  const [slot, setSlot] = useState<number | null>(null);
  const playing = controller.playing;
  useEffect(() => {
    if (!playing) {
      setSlot(null);
      return;
    }
    let frame = 0;
    const tick = (): void => {
      const now = controller.playheadSlot();
      setSlot((prev) => (prev === now ? prev : now));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [controller, playing]);
  return slot;
}

const NO_SLOTS: readonly number[] = [];

/** `playTones`로 지금 울리는 칸 번호들(함께 울릴 때는 여럿). 바뀔 때만 다시 그린다. 소리를 꺼 두어도 위치는 움직인다 */
export function usePlayheadSlots(controller: ChallengeController): readonly number[] {
  const [slots, setSlots] = useState<readonly number[]>(NO_SLOTS);
  const playing = controller.playing;
  useEffect(() => {
    if (!playing) {
      setSlots(NO_SLOTS);
      return;
    }
    let frame = 0;
    const tick = (): void => {
      const now = controller.playheadSlots();
      setSlots((prev) => (prev.length === now.length && prev.every((v, i) => v === now[i]) ? prev : now));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [controller, playing]);
  return slots;
}

/** 믹서의 상태가 바뀔 때 다시 그리고 현재 상태를 돌려준다 */
export function useMixer(mixer: Mixer): MixerSnapshot {
  const [, setVersion] = useState(0);
  useEffect(() => mixer.subscribe(() => setVersion((v) => v + 1)), [mixer]);
  return mixer.snapshot();
}
