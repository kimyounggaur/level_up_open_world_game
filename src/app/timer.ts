// 과제 재생기가 쓰는 일정 간격 장치(setInterval). 소리 계층과 화면 장치를 잇는 조립 지점에 둔다. 시계는 믹서의 시계가 맡고, 이것은 깨우는 일만 한다(8.2).
import type { IntervalTimer } from '../audio/types';

export const intervalTimer: IntervalTimer = {
  start(callback, intervalMs) {
    const handle = setInterval(callback, intervalMs);
    return () => clearInterval(handle);
  },
};
