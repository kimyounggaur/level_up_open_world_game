// 눌러서 고르는 단추 모음(음이름, 변화표, 옥타브, 같아요/달라요 …). 모음 전체가 Tab 정지 하나이고 화살표로 옮긴다.
// 화살표는 초점만 옮기고 고르는 것은 Enter나 Space(누르기)다. 고른 것은 aria-pressed와 모양으로 알린다(색만으로 알리지 않는다).
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';

export interface ChoiceOption {
  value: string;
  /** 눈에 보이는 글. 그림 글자(♯ ♭)는 aria-hidden으로 감싸 읽는 이름에서 뺀다 */
  label: ComponentChildren;
  /** 단추에 붙이는 데이터 이름표(시험과 스타일용). 예: { letter: 'C' } → data-letter="C" */
  data?: Record<string, string>;
}

export interface ChoiceGroupProps {
  id: string;
  /** 모음의 이름. 눈에 보이는 작은 제목이고 화면 낭독기는 모음의 이름으로 읽는다 */
  title: string;
  options: readonly ChoiceOption[];
  /** 지금 고른 값. 아직 고르지 않았으면 null */
  selected: string | null;
  onPick: (value: string) => void;
  class?: string;
  /** 제목 옆에 붙는 짧은 설명 */
  hint?: string;
}

export function ChoiceGroup({ id, title, options, selected, onPick, class: className, hint }: ChoiceGroupProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState<number | null>(null);
  const selectedIndex = options.findIndex((o) => o.value === selected);
  // 초점이 있던 단추가 Tab 정지다. 처음에는 고른 단추, 고른 것이 없으면 첫 단추
  const tabStop = Math.min(options.length - 1, active ?? (selectedIndex >= 0 ? selectedIndex : 0));

  const move = (e: KeyboardEvent, i: number): void => {
    const n = options.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    buttons.current[next]?.focus();
  };

  return (
    <div class={`choice-group${className ? ` ${className}` : ''}`} role="group" aria-labelledby={`${id}-title`}>
      <span id={`${id}-title`} class="choice-title">
        {title}
        {hint ? <span class="choice-hint muted small"> {hint}</span> : null}
      </span>
      <div class="choice-row">
        {options.map((o, i) => {
          const on = o.value === selected;
          const data: Record<string, string> = {};
          for (const [k, v] of Object.entries(o.data ?? {})) data[`data-${k}`] = v;
          return (
            <button
              type="button"
              key={o.value}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              class={`choice${on ? ' is-selected' : ''}`}
              aria-pressed={on}
              tabIndex={i === tabStop ? 0 : -1}
              onFocus={() => setActive(i)}
              onKeyDown={(e) => move(e, i)}
              onClick={() => onPick(o.value)}
              {...data}
            >
              {on ? <span class="choice-mark" aria-hidden="true">✓</span> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
