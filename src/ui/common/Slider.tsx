// 크기 조절 슬라이더. 끌지 않아도 − + 단추로 바꿀 수 있다(W-4). 값은 0–1이고 화면에는 퍼센트로 보인다.
// 단추는 한계에서도 비활성으로 만들지 않는다: 초점이 단추에 있는 채로 사라지지 않게, 눌러도 아무 일이 없고 aria-disabled로 알린다.
import { Icon } from './Icon';

export interface SliderProps {
  id: string;
  label: string;
  /** 0–1 */
  value: number;
  onChange: (next: number) => void;
  /** 이름 아래 한 줄 설명 */
  hint?: string;
  /** − +를 한 번 누를 때 바뀌는 크기(0–1). 기본 0.1 */
  step?: number;
}

export const toPercent = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 100);

/** 0–1로 자르고 소수 둘째 자리까지만 남긴다(0.1씩 더해도 0.6000000000000001이 되지 않게) */
export const snap01 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

export function Slider({ id, label, value, onChange, hint, step = 0.1 }: SliderProps) {
  const pct = toPercent(value);
  const atMin = value <= 0;
  const atMax = value >= 1;
  return (
    <div class="slider-row">
      <div class="slider-text">
        <label id={`${id}-label`} for={id} class="toggle-label">
          {label}
        </label>
        {hint ? (
          <span id={`${id}-hint`} class="toggle-hint">
            {hint}
          </span>
        ) : null}
      </div>
      <div class="slider-control">
        <button type="button" class="btn btn-quiet slider-step" aria-label={`${label} 줄이기`} aria-disabled={atMin} onClick={() => !atMin && onChange(snap01(value - step))}>
          <Icon name="minus" />
        </button>
        <input
          id={id}
          class="slider-input"
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          aria-valuetext={`${pct}퍼센트`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onInput={(e) => onChange(snap01(Number((e.currentTarget as HTMLInputElement).value) / 100))}
        />
        <button type="button" class="btn btn-quiet slider-step" aria-label={`${label} 키우기`} aria-disabled={atMax} onClick={() => !atMax && onChange(snap01(value + step))}>
          <Icon name="plus" />
        </button>
        <output class="slider-value" for={id}>
          {pct}%
        </output>
      </div>
    </div>
  );
}
