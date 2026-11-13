// 설정과 환경설정(설계서 7.8, 10.6, 부록 A.3). 저장 파일의 explorationState.settings, preferences와 같은 모양이다.
// 소리 크기는 믹서의 설정과 같은 이름이다. 이 파일은 순수하다: 읽은 값이 잘못되면 그 칸만 기본값으로 돌리고 이유를 돌려준다.

export type TextSize = 'normal' | 'large';
export const TEXT_SIZES: readonly TextSize[] = ['normal', 'large'];
export const TEXT_SIZE_LABEL_KO: Readonly<Record<TextSize, string>> = { normal: '보통', large: '크게' };
/** 글자 크기 '크게'일 때 글자에 곱하는 배율. 화면의 모든 글자 크기가 이 값을 따른다 */
export const TEXT_SCALE: Readonly<Record<TextSize, number>> = { normal: 1, large: 1.25 };

export interface Settings {
  /** 전체 소리 크기(0–1) */
  masterVolume: number;
  /** 마을의 소리 층 크기(0–1). 마을 소리는 4단계에서 생긴다 */
  worldVolume: number;
  /** 과제를 풀 때 나는 소리의 크기(0–1) */
  taskVolume: number;
  /** 과제 소리가 나는 동안 마을 소리를 끄는가 */
  muteWorldDuringQuest: boolean;
  /** 움직임 줄이기. 브라우저의 '움직임 줄이기'와 함께 따진다 */
  reducedMotion: boolean;
  textSize: TextSize;
  /** 소리 물결 표시(8.4). 4단계에서 생긴다 */
  soundRipples: boolean;
  /** 발견 위치를 지도에 표시한다(3.6). 6단계에서 생긴다 */
  showDiscoveries: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  masterVolume: 0.6,
  worldVolume: 0.5,
  taskVolume: 1,
  muteWorldDuringQuest: false,
  reducedMotion: false,
  textSize: 'normal',
  soundRipples: true,
  showDiscoveries: false,
};

export interface Preferences {
  language: 'ko';
  /** 첫 조작 안내(걷기, 가까이 가서 E, 지도는 M)를 이미 봤거나 건너뛰었는가 */
  introSeen: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = { language: 'ko', introSeen: false };

const VOLUME_KEYS = ['masterVolume', 'worldVolume', 'taskVolume'] as const;
const FLAG_KEYS = ['muteWorldDuringQuest', 'reducedMotion', 'soundRipples', 'showDiscoveries'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 저장에서 읽은 설정을 믿을 수 있는 값으로 만든다. 없는 칸은 기본값이고(오래된 저장), 잘못된 칸은 기본값으로 돌리며 이유를 남긴다 */
export function normalizeSettings(raw: unknown, path = 'settings'): { settings: Settings; issues: string[] } {
  const issues: string[] = [];
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (raw === undefined || raw === null) return { settings, issues };
  if (!isRecord(raw)) return { settings, issues: [`${path}: 설정이 객체가 아니에요`] };
  for (const k of VOLUME_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) settings[k] = v;
    else issues.push(`${path}.${k}: 0과 1 사이의 수여야 해요`);
  }
  for (const k of FLAG_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v === 'boolean') settings[k] = v;
    else issues.push(`${path}.${k}: true나 false여야 해요`);
  }
  const ts = raw.textSize;
  if (ts !== undefined) {
    if (typeof ts === 'string' && (TEXT_SIZES as readonly string[]).includes(ts)) settings.textSize = ts as TextSize;
    else issues.push(`${path}.textSize: 'normal'이나 'large'여야 해요`);
  }
  return { settings, issues };
}

export function normalizePreferences(raw: unknown, path = 'preferences'): { preferences: Preferences; issues: string[] } {
  const issues: string[] = [];
  const preferences: Preferences = { ...DEFAULT_PREFERENCES };
  if (raw === undefined || raw === null) return { preferences, issues };
  if (!isRecord(raw)) return { preferences, issues: [`${path}: 환경설정이 객체가 아니에요`] };
  if (raw.language !== undefined && raw.language !== 'ko') issues.push(`${path}.language: 지금은 'ko'만 있어요`);
  if (raw.introSeen !== undefined) {
    if (typeof raw.introSeen === 'boolean') preferences.introSeen = raw.introSeen;
    else issues.push(`${path}.introSeen: true나 false여야 해요`);
  }
  return { preferences, issues };
}
