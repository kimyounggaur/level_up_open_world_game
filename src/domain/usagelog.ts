// 사용 기록(설계서 13.2, 10.9): 사용 관찰(G1)에 쓰는 행동 기록의 모양과 규칙. 이 파일은 순수하다: 시계도 저장소도 모른다.
//
// 기록하는 사건: 13.2가 정한 일곱 가지에, 기록을 읽는 데 꼭 필요한 둘을 더했다.
//   13.2  정거장 진입과 진입 경로(걷기, 지도, 목록, 주소), 도움 열기, 원래 도전으로 복귀, 배치 수정, 다시 듣기,
//         설치물 모드 밖에서 돌 밟기, 소리 조각 발견
//   더함  '시작'(실행마다 한 번. H1의 "2분 안에"를 잴 기준 시각), '확인'(결과. H3의 "스스로 고친다"와 H4의 "마친 뒤"를 볼 근거)
// 받지 않는 것(10.9): 이름, 연락처, 생년월일, 녹음, 기기를 가리키는 값, 입력한 글, 놓은 음의 내용.
// 사건에는 과제·정거장·설치물의 id와 일어난 사실만 있다. 점수나 평가는 적지 않는다.
//
// 기록은 기기 안에만 쌓이고 파일로 내보낼 때만 밖으로 나간다(10.9). 한도가 차면 되풀이되는 사건(돌 밟기, 배치 수정, 듣기)부터 오래된 순으로 지운다.
import type { AttemptResultType } from './attempt';
import { PROJECT_ID } from './content';

export const LOG_FORMAT = 'levelup-music-world.usage-log';
export const LOG_FORMAT_VERSION = 1;
/** 들고 있는 사건의 상한. 한 사람이 20–30분 쓰는 동안(13.2)에는 이보다 훨씬 적게 쌓인다 */
export const MAX_LOG_EVENTS = 3000;

/** 과제나 정거장에 어떻게 들어왔는가. 걷기=월드에서 가까이 가서 열었다, 주소=주소를 직접 열었거나 새로 불러왔다 */
export type EntryRoute = 'walk' | 'map' | 'list' | 'notebook' | 'address' | 'other';
export const ENTRY_ROUTES: readonly EntryRoute[] = ['walk', 'map', 'list', 'notebook', 'address', 'other'];

/** 열려 있던 첫 화면 */
export type StartScreen = 'world' | 'quest' | 'station' | 'overlay' | 'other';
export const START_SCREENS: readonly StartScreen[] = ['world', 'quest', 'station', 'overlay', 'other'];

/** 도움이 어떤 모습으로 열렸는가: aid=도움 설정(느리게 듣기 등), practice=도움 연습, page=조작 안내 화면, card=설치물의 도움 카드 */
export type HelpKind = 'aid' | 'practice' | 'page' | 'card';
export const HELP_KINDS: readonly HelpKind[] = ['aid', 'practice', 'page', 'card'];

/** 사건이 일어난 곳: 패널 화면인가, 월드의 설치물인가 */
export type Surface = 'panel' | 'world';
export const SURFACES: readonly Surface[] = ['panel', 'world'];

export type ListenWhat = 'mine' | 'target';
export const LISTEN_WHATS: readonly ListenWhat[] = ['mine', 'target'];

const RESULT_TYPES: readonly AttemptResultType[] = ['passed', 'needsRevision', 'unscored', 'technicalError'];

export type LogBody =
  | { type: 'session-start'; screen: StartScreen }
  | { type: 'station-enter'; stationId: string; route: EntryRoute }
  | { type: 'quest-enter'; questId: string; variantId: string; route: EntryRoute; surface: Surface; stationId?: string }
  | { type: 'help-open'; kind: HelpKind; what: string; questId?: string; variantId?: string }
  | { type: 'return-to-origin'; questId: string; variantId: string }
  | { type: 'placement-edit'; questId: string; variantId: string; surface: Surface; free?: true }
  | { type: 'listen'; questId: string; variantId: string; what: ListenWhat; surface: Surface; free?: true }
  | { type: 'check'; questId: string; variantId: string; result: AttemptResultType; assistUsed: boolean }
  | { type: 'stone-step'; installationId: string; slot: number }
  | { type: 'discovery-found'; discoveryId: string };

export type LogEventType = LogBody['type'];
export const LOG_EVENT_TYPES: readonly LogEventType[] = [
  'session-start',
  'station-enter',
  'quest-enter',
  'help-open',
  'return-to-origin',
  'placement-edit',
  'listen',
  'check',
  'stone-step',
  'discovery-found',
];

/** 사건 하나. seq는 기록 전체에서 이어지는 번호, sid는 실행(페이지를 연 한 번)의 번호, at은 일어난 때(ISO 8601) */
export type LogEvent = LogBody & { seq: number; sid: number; at: string };

export interface UsageLogData {
  format: typeof LOG_FORMAT;
  formatVersion: number;
  /** 새 사건을 적는가. 끄면 있던 기록은 그대로 두고 더 적지 않는다 */
  enabled: boolean;
  /** 다음 사건의 번호 */
  nextSeq: number;
  /** 마지막으로 시작한 실행의 번호 */
  lastSid: number;
  /** 한도가 차서 지운 사건의 수 */
  dropped: number;
  events: LogEvent[];
}

export function emptyUsageLog(enabled = true): UsageLogData {
  return { format: LOG_FORMAT, formatVersion: LOG_FORMAT_VERSION, enabled, nextSeq: 1, lastSid: 0, dropped: 0, events: [] };
}

/** 한도가 차면 되풀이되는 사건부터 지운다. 시작·진입·복귀·확인은 기록의 뼈대라 마지막까지 남긴다 */
const REPEATING: ReadonlySet<LogEventType> = new Set<LogEventType>(['stone-step', 'placement-edit', 'listen']);

/** 사건을 한도 안으로 줄인다. 되풀이되는 사건 가운데 가장 오래된 것부터, 그것이 없으면 가장 오래된 것부터 지운다 */
export function trimEvents(events: readonly LogEvent[], max: number): { events: LogEvent[]; dropped: number } {
  const out = [...events];
  let dropped = 0;
  while (out.length > max) {
    const i = out.findIndex((e) => REPEATING.has(e.type));
    out.splice(i === -1 ? 0 : i, 1);
    dropped += 1;
  }
  return { events: out, dropped };
}

/** 사건 하나를 더한 새 기록을 돌려준다. 꺼져 있으면 그대로 돌려준다 */
export function appendEvent(data: UsageLogData, body: LogBody, at: string, sid: number, max: number = MAX_LOG_EVENTS): UsageLogData {
  if (!data.enabled) return data;
  const event = { ...cleanBody(body), seq: data.nextSeq, sid, at } as LogEvent;
  const trimmed = trimEvents([...data.events, event], max);
  return { ...data, nextSeq: data.nextSeq + 1, dropped: data.dropped + trimmed.dropped, events: trimmed.events };
}

// ---------------------------------------------------------------------------
// 읽기: 저장소에서 읽은 값을 믿을 수 있는 기록으로 만든다. 던지지 않는다.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const optionalId = (v: unknown): boolean => v === undefined || isId(v);

/** 사건의 내용이 형식에 맞는가 */
export function isLogBody(v: unknown): v is LogBody {
  if (!isRecord(v)) return false;
  switch (v['type']) {
    case 'session-start':
      return isOneOf(START_SCREENS, v['screen']);
    case 'station-enter':
      return isId(v['stationId']) && isOneOf(ENTRY_ROUTES, v['route']);
    case 'quest-enter':
      return isId(v['questId']) && isId(v['variantId']) && isOneOf(ENTRY_ROUTES, v['route']) && isOneOf(SURFACES, v['surface']) && optionalId(v['stationId']);
    case 'help-open':
      return isOneOf(HELP_KINDS, v['kind']) && isId(v['what']) && optionalId(v['questId']) && optionalId(v['variantId']);
    case 'return-to-origin':
      return isId(v['questId']) && isId(v['variantId']);
    case 'placement-edit':
      return isId(v['questId']) && isId(v['variantId']) && isOneOf(SURFACES, v['surface']) && (v['free'] === undefined || v['free'] === true);
    case 'listen':
      return isId(v['questId']) && isId(v['variantId']) && isOneOf(LISTEN_WHATS, v['what']) && isOneOf(SURFACES, v['surface']) && (v['free'] === undefined || v['free'] === true);
    case 'check':
      return isId(v['questId']) && isId(v['variantId']) && isOneOf(RESULT_TYPES, v['result']) && typeof v['assistUsed'] === 'boolean';
    case 'stone-step':
      return isId(v['installationId']) && typeof v['slot'] === 'number' && Number.isInteger(v['slot']) && v['slot'] >= 1 && v['slot'] <= 99;
    case 'discovery-found':
      return isId(v['discoveryId']);
    default:
      return false;
  }
}

/**
 * 사건의 내용에서 정해진 필드만 남긴다(10.9, 8-2). 저장소에서 읽은 값이나 부르는 쪽이 넘긴 값에 이름이나 글 같은 다른 필드가 끼어 있어도
 * 파일로 나가지 않게 한다: 내보내는 필드는 이 목록이 정한다. 형식에 맞는 사건(isLogBody)만 넘긴다.
 */
export function cleanBody(b: LogBody): LogBody {
  switch (b.type) {
    case 'session-start':
      return { type: b.type, screen: b.screen };
    case 'station-enter':
      return { type: b.type, stationId: b.stationId, route: b.route };
    case 'quest-enter':
      return { type: b.type, questId: b.questId, variantId: b.variantId, route: b.route, surface: b.surface, ...(b.stationId !== undefined ? { stationId: b.stationId } : {}) };
    case 'help-open':
      return { type: b.type, kind: b.kind, what: b.what, ...(b.questId !== undefined ? { questId: b.questId } : {}), ...(b.variantId !== undefined ? { variantId: b.variantId } : {}) };
    case 'return-to-origin':
      return { type: b.type, questId: b.questId, variantId: b.variantId };
    case 'placement-edit':
      return { type: b.type, questId: b.questId, variantId: b.variantId, surface: b.surface, ...(b.free === true ? { free: true as const } : {}) };
    case 'listen':
      return { type: b.type, questId: b.questId, variantId: b.variantId, what: b.what, surface: b.surface, ...(b.free === true ? { free: true as const } : {}) };
    case 'check':
      return { type: b.type, questId: b.questId, variantId: b.variantId, result: b.result, assistUsed: b.assistUsed };
    case 'stone-step':
      return { type: b.type, installationId: b.installationId, slot: b.slot };
    case 'discovery-found':
      return { type: b.type, discoveryId: b.discoveryId };
  }
}

function isEvent(v: unknown): v is LogEvent {
  if (!isLogBody(v)) return false;
  const r = v as unknown as Record<string, unknown>;
  return isCount(r['seq']) && isCount(r['sid']) && typeof r['at'] === 'string' && !Number.isNaN(Date.parse(r['at']));
}

/**
 * 저장소에서 읽은 값을 기록으로 만든다. 형식에 맞지 않는 사건은 버리고(몇 개를 버렸는지 알린다), 기록 전체를 읽을 수 없으면 빈 기록으로 시작한다.
 * 읽은 사건이 한도보다 많으면(한도를 줄인 판) 한도 안으로 줄인다.
 */
export function normalizeUsageLog(raw: unknown, max: number = MAX_LOG_EVENTS): { data: UsageLogData; issues: string[] } {
  const issues: string[] = [];
  if (raw === undefined || raw === null) return { data: emptyUsageLog(), issues };
  if (!isRecord(raw) || raw['format'] !== LOG_FORMAT) return { data: emptyUsageLog(), issues: ['사용 기록의 형식을 알 수 없어 비어 있는 기록으로 시작해요'] };
  if (typeof raw['formatVersion'] !== 'number' || raw['formatVersion'] > LOG_FORMAT_VERSION) {
    return { data: emptyUsageLog(), issues: [`사용 기록의 판(${String(raw['formatVersion'])})을 읽을 수 없어 비어 있는 기록으로 시작해요`] };
  }
  const list = Array.isArray(raw['events']) ? (raw['events'] as unknown[]) : [];
  const valid = list.filter(isEvent);
  if (valid.length !== list.length) issues.push(`형식에 맞지 않는 사건 ${list.length - valid.length}개를 버렸어요`);
  // 정해진 필드만 남긴다(cleanBody): 저장소에 다른 필드가 끼어 있어도 파일로 나가지 않는다
  const events: LogEvent[] = valid.map((e) => ({ ...cleanBody(e), seq: e.seq, sid: e.sid, at: e.at }));
  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0);
  const maxSid = events.reduce((m, e) => Math.max(m, e.sid), 0);
  const trimmed = trimEvents(events, max);
  const data: UsageLogData = {
    format: LOG_FORMAT,
    formatVersion: LOG_FORMAT_VERSION,
    enabled: raw['enabled'] !== false,
    nextSeq: Math.max(isCount(raw['nextSeq']) ? raw['nextSeq'] : 1, maxSeq + 1),
    lastSid: Math.max(isCount(raw['lastSid']) ? raw['lastSid'] : 0, maxSid),
    dropped: (isCount(raw['dropped']) ? raw['dropped'] : 0) + trimmed.dropped,
    events: trimmed.events,
  };
  return { data, issues };
}

// ---------------------------------------------------------------------------
// 내보내기

export interface LogSummary {
  /** 파일에 든 사건의 수 */
  events: number;
  /** 실행(페이지를 연 횟수) */
  sessions: number;
  byType: Partial<Record<LogEventType, number>>;
  /** 과제에 들어간 횟수를 들어온 길별로(H5) */
  questEntriesByRoute: Record<EntryRoute, number>;
  /** 과제에 들어간 횟수 가운데 걸어서 들어간 비율(0–1, 소수 둘째 자리까지). 들어간 적이 없으면 null */
  walkShare: number | null;
}

export function summarizeLog(data: Pick<UsageLogData, 'events'>): LogSummary {
  const byType: Partial<Record<LogEventType, number>> = {};
  const byRoute = Object.fromEntries(ENTRY_ROUTES.map((r) => [r, 0])) as Record<EntryRoute, number>;
  const sessions = new Set<number>();
  for (const e of data.events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    sessions.add(e.sid);
    if (e.type === 'quest-enter') byRoute[e.route] += 1;
  }
  const total = ENTRY_ROUTES.reduce((n, r) => n + byRoute[r], 0);
  return { events: data.events.length, sessions: sessions.size, byType, questEntriesByRoute: byRoute, walkShare: total === 0 ? null : Math.round((byRoute.walk / total) * 100) / 100 };
}

export const LOG_FILE_NOTE =
  '이 파일은 이 기기에서 쌓은 사용 기록이에요. 어떤 정거장과 도전에 어떻게 들어갔고, 도움과 듣기와 확인을 언제 했는지만 있어요. 이름, 연락처, 생년월일, 녹음, 놓은 음의 내용은 들어 있지 않아요.';

export interface LogExportDocument {
  format: typeof LOG_FORMAT;
  formatVersion: number;
  projectId: string;
  exportedAt: string;
  note: string;
  /** 한도가 차서 지운 사건의 수 */
  dropped: number;
  summary: LogSummary;
  events: LogEvent[];
}

export function buildLogExport(data: UsageLogData, exportedAt: string): LogExportDocument {
  return {
    format: LOG_FORMAT,
    formatVersion: LOG_FORMAT_VERSION,
    projectId: PROJECT_ID,
    exportedAt,
    note: LOG_FILE_NOTE,
    dropped: data.dropped,
    summary: summarizeLog(data),
    events: data.events,
  };
}

/** 파일로 내보낼 글자와 이름. 사건은 한 줄에 하나씩 적어 편집기에서도 읽기 쉽다 */
export function exportLogFile(data: UsageLogData, exportedAt: string): { fileName: string; text: string } {
  const { events, ...head } = buildLogExport(data, exportedAt);
  const headText = JSON.stringify(head, null, 2);
  const eventsText = events.length === 0 ? '[]' : `[\n${events.map((e) => `    ${JSON.stringify(e)}`).join(',\n')}\n  ]`;
  return {
    fileName: `${PROJECT_ID}-usage-log-${exportedAt.slice(0, 10)}.json`,
    text: `${headText.slice(0, -2)},\n  "events": ${eventsText}\n}\n`,
  };
}
