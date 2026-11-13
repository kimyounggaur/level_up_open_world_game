// '소리 켜기' 단추와 소리 상태. 누르기 전에는 소리가 나지 않고(W-11), 소리가 안 나도 편집은 계속된다(W-8).
import type { MixerSnapshot } from '../../audio/mixer';
import { Icon } from './Icon';

export interface SoundControlProps {
  sound: MixerSnapshot;
  onEnable: () => void;
  onToggleMute: () => void;
  /** 월드 화면의 좁은 자리: 상태 글은 화면 낭독기에만 읽히게 한다 */
  compact?: boolean;
}

export function soundStatusText(s: MixerSnapshot): string {
  if (s.state === 'starting') return '소리를 켜는 중이에요';
  if (s.state === 'failed') return s.message ?? '소리를 켜지 못했어요. 소리 없이 계속할 수 있어요.';
  if (s.state === 'on') return s.muted ? '소리를 껐어요' : '소리가 켜져 있어요';
  return '소리가 꺼져 있어요';
}

export function SoundControl({ sound, onEnable, onToggleMute, compact }: SoundControlProps) {
  const on = sound.state === 'on';
  const label = sound.state === 'starting' ? '소리 켜는 중' : sound.state === 'failed' ? '소리 다시 켜 보기' : on ? (sound.muted ? '소리 켜기' : '소리 끄기') : '소리 켜기';
  const click = on ? onToggleMute : onEnable;
  return (
    <div class="sound-control">
      <button type="button" class={`btn ${on && !sound.muted ? 'btn-quiet' : 'btn-primary'}`} onClick={click} disabled={sound.state === 'starting'} aria-pressed={on ? !sound.muted : undefined}>
        <Icon name={on && !sound.muted ? 'speaker' : 'speaker-off'} /> {label}
      </button>
      <span class={compact ? 'sound-status sr-only' : 'sound-status'} role="status" data-sound-state={sound.state}>
        {soundStatusText(sound)}
      </span>
    </div>
  );
}
