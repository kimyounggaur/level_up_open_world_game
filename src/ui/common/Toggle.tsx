// 켜고 끄는 스위치. 화면 낭독기가 '스위치, 켜짐/꺼짐'으로 읽는다. 누르는 영역은 48px 이상이다.
import type { ComponentChildren } from 'preact';

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** 이름 아래 한 줄 설명 */
  hint?: string;
  /** 켜졌을 때 보여 줄 값. 예: '현재: 4분음표 = 50 BPM' */
  detail?: ComponentChildren;
}

export function Toggle({ id, label, checked, onChange, disabled, hint, detail }: ToggleProps) {
  const describedBy = [hint ? `${id}-hint` : '', detail ? `${id}-detail` : ''].filter(Boolean).join(' ');
  return (
    <div class={`toggle-row${disabled ? ' is-disabled' : ''}`}>
      <div class="toggle-text">
        <span id={`${id}-label`} class="toggle-label">
          {label}
        </span>
        {detail ? (
          <span id={`${id}-detail`} class="toggle-detail">
            {detail}
          </span>
        ) : null}
        {hint ? (
          <span id={`${id}-hint`} class="toggle-hint">
            {hint}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        class="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy || undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span class="switch-state">{checked ? '켜짐' : '꺼짐'}</span>
        <span class="switch-track" aria-hidden="true">
          <span class="switch-knob" />
        </span>
      </button>
    </div>
  );
}
