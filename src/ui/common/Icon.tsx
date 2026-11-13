// 작은 선 그림. 장식이므로 화면 낭독기에는 숨긴다. 뜻은 늘 옆의 글자가 전한다(맞고 틀림도 기호와 문장으로).
export type IconName = 'speaker' | 'speaker-off' | 'play' | 'stop' | 'undo' | 'redo' | 'check' | 'alert' | 'arrow-right' | 'arrow-left' | 'list' | 'help' | 'eraser' | 'up' | 'down' | 'trash' | 'map' | 'settings' | 'close' | 'pin' | 'plus' | 'minus' | 'footsteps' | 'sparkle' | 'notebook';

const PATHS: Record<IconName, string> = {
  speaker: 'M4 9v6h4l5 4V5L8 9H4zm11.5-1.5a5.5 5.5 0 0 1 0 9M18 5a9 9 0 0 1 0 14',
  'speaker-off': 'M4 9v6h4l5 4V5L8 9H4zm12 0 5 6m0-6-5 6',
  play: 'M7 5v14l12-7z',
  stop: 'M6 6h12v12H6z',
  undo: 'M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'm15 7 5 5-5 5M20 12H10a6 6 0 0 0 0 12',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  alert: 'M12 7v6m0 4h.01M12 3 2.5 20h19z',
  'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
  'arrow-left': 'M19 12H5m6-6-6 6 6 6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  eraser: 'm7 20-4-4 11-11 7 7-8 8H7zm4-9 5 5',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  trash: 'M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13',
  map: 'm9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  settings: 'M4 7h10m4 0h2M4 17h4m4 0h8M16 5v4M10 15v4',
  close: 'M6 6l12 12M18 6 6 18',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  footsteps: 'M8 4c1.7 0 2.5 1.7 2.5 3.5S9.7 11 8 11 5.5 9.3 5.5 7.5 6.3 4 8 4zm.5 9v3m6-8c1.7 0 2.5 1.7 2.5 3.5S16.2 18 14.5 18 12 16.3 12 14.5 12.8 11 14.5 11zm0 9v1',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6.5 6.5l2.5 2.5m6 6 2.5 2.5m0-11-2.5 2.5m-6 6-2.5 2.5',
  notebook: 'M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 0v18m4-13h5m-5 4h5',
};

const FILLED = new Set<IconName>(['play', 'stop']);

export function Icon({ name }: { name: IconName }) {
  const filled = FILLED.has(name);
  return (
    <svg class="icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
