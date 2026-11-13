// 악보를 화면에 그리는 컴포넌트. 그리기가 실패해도 편집과 판정은 계속된다(W-8): 안내 문장만 보인다.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Score } from '../../domain/score';
import { renderScore } from './render';
import type { NotationOptions, RenderedScore } from './render';

/**
 * 화음과 음정을 보여 주는 작은 악보의 옵션: 박자표는 이 장면의 뜻과 상관없어 빼고, 마디 폭을 줄인다.
 * 그림의 크기는 높이로 정해지므로(보표 하나 198, 큰 보표 388) 폭을 줄여도 음 크기는 그대로다.
 */
export const COMPACT_VIEW: NotationOptions = { showTimeSignature: false, minMeasureWidth: 96 };

export interface StaffViewProps {
  score: Score;
  title: string;
  description?: string;
  options?: NotationOptions;
  onRendered?: (rendered: RenderedScore) => void;
  class?: string;
}

export function StaffView({ score, title, description, options, onRendered, class: className }: StaffViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify([score, options ?? null, title, description ?? null]);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    try {
      const rendered = renderScore(el, score, { ...options, title, ...(description ? { description } : {}) });
      setFailed(false);
      onRendered?.(rendered);
    } catch {
      el.replaceChildren();
      setFailed(true);
    }
    // key가 score, options, title, description을 모두 담고 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div class={`staff-view${className ? ` ${className}` : ''}`}>
      <div class="staff-host" ref={host} />
      {failed ? (
        <p class="staff-error" role="status">
          악보를 그리지 못했어요. 놓은 것은 그대로 있고, 아래 칸에서 계속할 수 있어요.
        </p>
      ) : null}
    </div>
  );
}
