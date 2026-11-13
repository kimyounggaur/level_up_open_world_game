// 시간선 칸과 재료 상자에 쓰는 음표·쉼표 그림. 보표 악보가 아니라 짧은 표식이다(악보는 VexFlow가 그린다).
export type GlyphKind = 'quarter-note' | 'quarter-rest' | 'empty';

export function Glyph({ kind }: { kind: GlyphKind }) {
  if (kind === 'empty') {
    return (
      <svg class="glyph" width="24" height="36" viewBox="0 0 24 36" aria-hidden="true" focusable="false">
        <path d="M5 18h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 5" fill="none" />
      </svg>
    );
  }
  if (kind === 'quarter-note') {
    return (
      <svg class="glyph" width="24" height="36" viewBox="0 0 24 36" aria-hidden="true" focusable="false">
        <ellipse cx="9" cy="28" rx="6.6" ry="4.8" transform="rotate(-22 9 28)" fill="currentColor" />
        <path d="M14.8 26.2V5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg class="glyph" width="24" height="36" viewBox="0 0 24 36" aria-hidden="true" focusable="false">
      <path d="M8 4l8 9-6 7 8 8c-5-1-8 2-6 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </svg>
  );
}
