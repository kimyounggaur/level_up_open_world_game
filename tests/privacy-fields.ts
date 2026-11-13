// 개인정보 흐름 시험(8-2)의 정답표: 사용 기록 파일에 나갈 수 있는 필드. 단위 시험(tests/unit/privacy.test.ts)과 흐름 시험(tests/flow/privacy.flow.ts)이 함께 쓴다.
// 이 표는 src의 코드(cleanBody)에서 만들지 않고 손으로 적은 것이다: 코드가 필드를 늘리면 이 표와 달라져 시험이 깨지고, 그때 사람이 '받아도 되는가'를 정한다(10.9).
import type { LogEventType } from '../src/domain/usagelog';

/** 사건 종류별로 파일에 나갈 수 있는 필드(그 밖에 모든 사건에 COMMON_FIELDS가 있다) */
export const EVENT_FIELDS: Record<LogEventType, readonly string[]> = {
  'session-start': ['type', 'screen'],
  'station-enter': ['type', 'stationId', 'route'],
  'quest-enter': ['type', 'questId', 'variantId', 'route', 'surface', 'stationId'],
  'help-open': ['type', 'kind', 'what', 'questId', 'variantId'],
  'return-to-origin': ['type', 'questId', 'variantId'],
  'placement-edit': ['type', 'questId', 'variantId', 'surface', 'free'],
  listen: ['type', 'questId', 'variantId', 'what', 'surface', 'free'],
  check: ['type', 'questId', 'variantId', 'result', 'assistUsed'],
  'stone-step': ['type', 'installationId', 'slot'],
  'discovery-found': ['type', 'discoveryId'],
};

export const COMMON_FIELDS: readonly string[] = ['seq', 'sid', 'at'];

/** 파일 맨 위에 나갈 수 있는 필드(정렬) */
export const TOP_FIELDS: readonly string[] = ['dropped', 'events', 'exportedAt', 'format', 'formatVersion', 'note', 'projectId', 'summary'];

/** 사건의 글자 값은 정해진 이름(id), 고르는 값, 날짜뿐이다: 공백이나 한글 같은 글이 없다 */
export const ID_VALUE = /^[A-Za-z0-9._:/#+-]{1,200}$/;

// ---------------------------------------------------------------------------
// 저장 파일(사용자가 '저장 내보내기'를 눌러 받는 파일)에 나갈 수 있는 필드. 사용 기록과 달리 진행 그 자체(놓은 음, 만든 곡, 곡 이름)가 들어 있다

export const SAVE_TOP_FIELDS: readonly string[] = ['activeChallenge', 'attempts', 'challengeDrafts', 'contentVersions', 'explorationState', 'preferences', 'projectId', 'saveSchemaVersion', 'savedAt', 'supportContext'];
export const SAVE_EXPLORATION_FIELDS: readonly string[] = ['creations', 'foundDiscoveries', 'openedQuests', 'position', 'settings', 'visitedStations'];
export const SAVE_SETTINGS_FIELDS: readonly string[] = ['masterVolume', 'muteWorldDuringQuest', 'reducedMotion', 'showDiscoveries', 'soundRipples', 'taskVolume', 'textSize', 'worldVolume'];
export const SAVE_PREFERENCES_FIELDS: readonly string[] = ['introSeen', 'language'];

/** 저장소(IndexedDB)에 남는 키의 이름 끝(앞에는 프로젝트 id와 저장 형식 판이 붙는다) */
export const STORAGE_KEY_SUFFIXES: readonly string[] = ['save:current', 'save:previous', 'save:next', 'save:emergency', 'save:unreadable', 'usage-log'];
