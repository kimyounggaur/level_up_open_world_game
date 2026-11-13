// 합주 과제(Q08)의 듣기 범위 단추들: 곡 패널의 도움 메뉴와 무대 작업대의 단추가 같은 이름과 같은 값을 쓴다. 4.2, 4.9.
import type { ChallengeController, ScopeChoice } from './controller';

const VOICE_PREFIX = 'voice:';

/** 듣기 범위 ↔ 선택 단추의 값 */
export const scopeValueOf = (choice: ScopeChoice): string => (choice.kind === 'voice' ? `${VOICE_PREFIX}${choice.voiceId}` : choice.kind);

export const scopeChoiceOf = (value: string): ScopeChoice =>
  value.startsWith(VOICE_PREFIX) ? { kind: 'voice', voiceId: value.slice(VOICE_PREFIX.length) } : value === 'measure' ? { kind: 'measure' } : { kind: 'all' };

export interface ScopeOption {
  value: string;
  label: string;
  /** 성부 하나만 듣는 단추이면 그 성부의 id */
  voiceId?: string;
}

/**
 * 지금 고를 수 있는 듣기 범위 단추들: 전체, 성부별, 고른 마디.
 * 성부가 하나뿐이면 '그 성부만'은 전체와 같으므로 성부별은 없다. 마디를 고르지 않았으면 '고른 마디만'이다.
 */
export function scopeOptionsOf(controller: ChallengeController): ScopeOption[] {
  const voices = controller.scopeVoices();
  const cell = controller.selectedCell();
  return [
    { value: 'all', label: '전체' },
    ...(voices.length > 1 ? voices.map((v): ScopeOption => ({ value: `${VOICE_PREFIX}${v.voiceId}`, label: `${v.label}만`, voiceId: v.voiceId })) : []),
    { value: 'measure', label: cell ? `${cell.measureIndex + 1}마디만` : '고른 마디만' },
  ];
}
