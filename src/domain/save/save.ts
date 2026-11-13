// 저장 상태(설계서 10.6, 부록 A.3). 이 파일은 순수하다: 지금 상태로 저장 값을 만들고(buildSave), 읽은 값이 믿을 만한지 확인한다(parseSave).
// 저장소(platform/storage)는 새 저장을 '현재'로 바꾸기 전에 이 확인을 거친다(검사한 뒤 바꾸기).
//
// 저장하지 않는 것: 소리 층과 합주 층수(통과 기록에서 매번 계산한다), 열린 화면, 재생 위치.
// 설계서가 정한 필드(position, visitedStations, foundDiscoveries, creations, settings)에 이 구현이 더한 칸은 둘이다:
//   explorationState.openedQuests(7.7 '아직 열어 보지 않은 것') 와 attempts(통과 기록 — 합주 층수를 매번 계산하는 원본, W-6).
import { salvageAttemptResults, validateAttemptResults } from '../attempt';
import type { AttemptResult } from '../attempt';
import { PROJECT_ID } from '../content';
import { salvageSessionSnapshot, validateSessionSnapshot } from '../session';
import type { SessionSnapshot } from '../session';
import { WORLD_H, WORLD_W } from '../world';
import type { Facing } from '../world';
import { DEFAULT_PREFERENCES, normalizePreferences, normalizeSettings } from './settings';
import type { Preferences, Settings } from './settings';

export { PROJECT_ID };
export const SAVE_SCHEMA_VERSION = 1;

/** 판 n의 저장(JSON 객체)을 판 n+1의 저장으로 바꾸는 함수. 받은 값을 고치지 않고 새 객체를 돌려준다 */
export type SaveMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * 옛 판의 저장을 한 판씩 올리는 변환들. 키는 바꾸기 전의 판이다(키 1은 1판을 2판으로).
 * 저장 형식을 바꿀 때: SAVE_SCHEMA_VERSION을 올리고, 바로 이전 판의 변환을 여기에 더하고, 이전 판의 저장 예시가 tests/fixtures/saves/에 얼려 있는지 본다(docs/operations.md).
 * 아직 판이 하나뿐이라 비어 있다. 변환 없이 판만 올리면 tests/unit/save-compat.test.ts가 실패한다.
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {};

export type MigrationResult =
  /** 바꿀 것이 없다: 현재 판이거나, 판이 올바르지 않거나 더 새롭다(그런 저장은 parseSave가 거절한다) */
  | { kind: 'none' }
  | { kind: 'ok'; raw: Record<string, unknown>; from: number }
  /** 어느 판의 변환이 없다 */
  | { kind: 'missing'; from: number; at: number };

/** 저장을 현재 판까지 한 판씩 올린다. 받은 객체는 고치지 않는다. 변환이 판 번호를 안 적어도 한 판씩 오른 것으로 친다 */
export function migrateSaveRaw(raw: Record<string, unknown>, current: number = SAVE_SCHEMA_VERSION, table: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS): MigrationResult {
  const v = raw.saveSchemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v >= current) return { kind: 'none' };
  let cur = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  for (let at = v; at < current; at++) {
    const step = table[at];
    if (!step) return { kind: 'missing', from: v, at };
    cur = { ...step(cur), saveSchemaVersion: at + 1 };
  }
  return { kind: 'ok', raw: cur, from: v };
}
/** 통과하지 못한 시도 기록을 남기는 수의 상한(가장 최근 것부터). 통과 기록은 모두 남긴다 */
export const MAX_OTHER_ATTEMPTS = 300;

export interface SavedPosition {
  x: number;
  y: number;
  regionId: string;
  facing: Facing;
}

export interface ExplorationState {
  /** 마지막 위치와 지역. 아직 걷지 않았으면 null(처음 자리에서 시작한다) */
  position: SavedPosition | null;
  /** 등불이 켜진 정거장 id(4단계) */
  visitedStations: string[];
  /** 찾은 발견 요소 id(6단계) */
  foundDiscoveries: string[];
  /** 저장한 자유 편집(6단계) */
  creations: unknown[];
  /** 열어 본 과제 id(7.7) */
  openedQuests: string[];
  settings: Settings;
}

export interface SaveData {
  projectId: string;
  saveSchemaVersion: number;
  /** 이 저장을 만든 때(ISO 8601). 두 저장 중 어느 쪽이 새것인지 가릴 때 쓴다 */
  savedAt: string;
  /** 저장할 때의 과제별 콘텐츠 판. 판이 바뀌어도 통과 기록은 계속 센다(W-6) */
  contentVersions: Record<string, string>;
  explorationState: ExplorationState;
  activeChallenge: SessionSnapshot['activeChallenge'];
  challengeDrafts: SessionSnapshot['challengeDrafts'];
  supportContext: SessionSnapshot['supportContext'];
  attempts: AttemptResult[];
  preferences: Preferences;
}

export interface SaveParts {
  savedAt: string;
  contentVersions: Readonly<Record<string, string>>;
  position: SavedPosition | null;
  visitedStations?: readonly string[];
  foundDiscoveries?: readonly string[];
  creations?: readonly unknown[];
  openedQuests: readonly string[];
  settings: Settings;
  session: SessionSnapshot;
  attempts: readonly AttemptResult[];
  preferences: Preferences;
  projectId?: string;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const uniqueSorted = (list: readonly string[]): string[] => [...new Set(list)].sort();

/** 통과 기록은 모두, 그 밖의 시도는 가장 최근 것 limit개만 남긴다(저장 크기가 끝없이 커지지 않게). 순서는 그대로다 */
export function compactAttempts(attempts: readonly AttemptResult[], limit = MAX_OTHER_ATTEMPTS): AttemptResult[] {
  const others = attempts.filter((a) => a.resultType !== 'passed').length;
  let drop = Math.max(0, others - limit);
  const out: AttemptResult[] = [];
  for (const a of attempts) {
    if (a.resultType !== 'passed' && drop > 0) {
      drop--;
      continue;
    }
    out.push(a);
  }
  return out;
}

/** 지금 상태로 저장 값을 만든다. 넘긴 값은 복사해서 쓰므로 나중에 바뀌어도 저장 값은 변하지 않는다 */
export function buildSave(p: SaveParts): SaveData {
  return {
    projectId: p.projectId ?? PROJECT_ID,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: p.savedAt,
    contentVersions: { ...p.contentVersions },
    explorationState: {
      position: p.position ? { ...p.position } : null,
      visitedStations: uniqueSorted(p.visitedStations ?? []),
      foundDiscoveries: uniqueSorted(p.foundDiscoveries ?? []),
      creations: clone([...(p.creations ?? [])]),
      openedQuests: uniqueSorted(p.openedQuests),
      settings: { ...p.settings },
    },
    activeChallenge: clone(p.session.activeChallenge),
    challengeDrafts: clone(p.session.challengeDrafts),
    supportContext: clone(p.session.supportContext),
    attempts: clone(compactAttempts(p.attempts)),
    preferences: { ...p.preferences },
  };
}

export const serializeSave = (save: SaveData): string => JSON.stringify(save);

/** 저장 값에서 세션 부분만 꺼낸다(ChallengeSession.restore에 넘긴다) */
export const sessionOf = (save: SaveData): SessionSnapshot => ({ activeChallenge: save.activeChallenge, challengeDrafts: save.challengeDrafts, supportContext: save.supportContext });

/** 아직 아무것도 하지 않은 저장 */
export function emptySave(savedAt: string, projectId = PROJECT_ID): SaveData {
  return buildSave({
    projectId,
    savedAt,
    contentVersions: {},
    position: null,
    openedQuests: [],
    settings: normalizeSettings(undefined).settings,
    session: { activeChallenge: null, challengeDrafts: {}, supportContext: null },
    attempts: [],
    preferences: { ...DEFAULT_PREFERENCES },
  });
}

export type ParseResult = { ok: true; save: SaveData; warnings: string[] } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const FACINGS: readonly string[] = ['up', 'down', 'left', 'right'];

function stringList(raw: unknown, path: string, warnings: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push(`${path}: 목록이 아니라서 비웠어요`);
    return [];
  }
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.length > 0) out.push(v);
    else warnings.push(`${path}: 글자가 아닌 값을 건너뛰었어요`);
  }
  return uniqueSorted(out);
}

function readPosition(raw: unknown, warnings: string[]): SavedPosition | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw) || typeof raw.x !== 'number' || typeof raw.y !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || typeof raw.regionId !== 'string') {
    warnings.push('explorationState.position: 올바르지 않아서 처음 자리에서 시작해요');
    return null;
  }
  if (raw.x < 0 || raw.x >= WORLD_W || raw.y < 0 || raw.y >= WORLD_H) {
    warnings.push('explorationState.position: 월드 밖이라서 처음 자리에서 시작해요');
    return null;
  }
  const facing = typeof raw.facing === 'string' && FACINGS.includes(raw.facing) ? (raw.facing as Facing) : 'down';
  return { x: raw.x, y: raw.y, regionId: raw.regionId, facing };
}

export interface ParseOptions {
  /**
   * true면 일부만 망가진 저장에서 읽을 수 있는 것만 살린다(저장소의 마지막 복구 단계, 10.6 '전체 초기화를 자동으로 하지 않는다').
   * 못 읽는 통과 기록·초안은 그것만 버리고, 못 읽는 진행 중 도전과 도움 연습 상태는 비워서 처음 상태로 돌리며, 버린 것은 warnings에 남긴다.
   * 형식이 아님, 다른 게임의 저장, 못 읽는 판, 저장한 때(savedAt) 오류는 이 모드에서도 못 읽는 저장이다.
   */
  salvage?: boolean;
}

/** 버린 것이 여러 개일 때 한 문장으로 줄인다(첫 이유만 예로 든다) */
function droppedWarning(label: string, dropped: readonly string[]): string[] {
  if (dropped.length === 0) return [];
  return [`${label} ${dropped.length}개를 읽을 수 없어 건너뛰었어요. 예: ${dropped[0]!}`];
}

/**
 * 읽은 값을 믿을 만한 저장 값으로 만든다. 못 읽는 것이 하나라도 있으면(errors) 저장소는 이 값으로 바꾸지 않는다:
 * 형식이 아님, 다른 게임의 저장, 더 새로운 판, 세션(초안) 형식 오류, 기록 형식 오류.
 * 덜 중요한 칸(위치, 목록, 설정)이 잘못됐으면 그 칸만 기본값으로 돌리고 이유를 warnings에 남긴다.
 * opts.salvage가 켜져 있으면 세션과 기록의 오류도 그 부분만 버리고 나머지를 살린다(ParseOptions).
 */
export function parseSave(input: unknown, expectedProjectId: string = PROJECT_ID, opts: ParseOptions = {}): ParseResult {
  if (!isRecord(input)) return { ok: false, errors: ['저장이 객체가 아니에요'] };
  const salvage = opts.salvage === true;
  const errors: string[] = [];
  const warnings: string[] = [];
  // 옛 판의 저장은 현재 판으로 한 판씩 올린 뒤에 읽는다(8-6). 올릴 수 없는 판은 이유를 알리고 거절한다. 판이 올바르지 않거나 더 새로운 저장은 아래 검사가 거절한다
  const migrated = migrateSaveRaw(input);
  if (migrated.kind === 'missing') errors.push(`이 앱은 ${migrated.at}판 저장을 ${migrated.at + 1}판으로 바꾸는 방법을 몰라요(저장은 ${migrated.from}판)`);
  const raw = migrated.kind === 'ok' ? migrated.raw : input;

  if (raw.projectId !== expectedProjectId) errors.push(`다른 게임의 저장이에요(projectId: ${String(raw.projectId)})`);
  const v = raw.saveSchemaVersion;
  if (!Number.isInteger(v) || (v as number) < 1) errors.push('saveSchemaVersion이 올바르지 않아요');
  else if ((v as number) > SAVE_SCHEMA_VERSION) errors.push(`더 새로운 판의 저장이에요(saveSchemaVersion ${String(v)}). 이 앱은 ${SAVE_SCHEMA_VERSION}판까지 읽어요`);
  if (typeof raw.savedAt !== 'string' || Number.isNaN(Date.parse(raw.savedAt))) errors.push('savedAt이 올바른 시각이 아니에요');

  let session: SessionSnapshot = {
    activeChallenge: (raw.activeChallenge ?? null) as SessionSnapshot['activeChallenge'],
    challengeDrafts: (raw.challengeDrafts ?? {}) as SessionSnapshot['challengeDrafts'],
    supportContext: (raw.supportContext ?? null) as SessionSnapshot['supportContext'],
  };
  const attemptsRaw = raw.attempts ?? [];
  let attempts: AttemptResult[] = [];
  if (salvage) {
    // 판이나 프로젝트가 맞지 않는 저장은 아래 errors로 걸러지므로, 살리는 일은 읽을 수 있는 저장에서만 일어난다
    const s = salvageSessionSnapshot(session);
    session = s.session;
    warnings.push(...s.dropped);
    if (Array.isArray(attemptsRaw)) {
      const a = salvageAttemptResults(attemptsRaw);
      attempts = a.attempts;
      warnings.push(...droppedWarning('통과 기록', a.dropped));
    } else warnings.push('통과 기록 목록을 읽을 수 없어 비웠어요');
  } else {
    for (const e of validateSessionSnapshot(session)) errors.push(e);
    if (!Array.isArray(attemptsRaw)) errors.push('attempts가 목록이 아니에요');
    else {
      for (const e of validateAttemptResults(attemptsRaw)) errors.push(e);
      attempts = attemptsRaw as AttemptResult[];
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const versions: Record<string, string> = {};
  if (isRecord(raw.contentVersions)) {
    for (const [k, val] of Object.entries(raw.contentVersions)) {
      if (typeof val === 'string') versions[k] = val;
      else warnings.push(`contentVersions.${k}: 글자가 아니라서 건너뛰었어요`);
    }
  } else if (raw.contentVersions !== undefined) warnings.push('contentVersions: 객체가 아니라서 비웠어요');

  const ex = isRecord(raw.explorationState) ? raw.explorationState : {};
  if (raw.explorationState !== undefined && !isRecord(raw.explorationState)) warnings.push('explorationState: 객체가 아니라서 기본값으로 시작해요');
  const settings = normalizeSettings(ex.settings, 'explorationState.settings');
  const prefs = normalizePreferences(raw.preferences);
  warnings.push(...settings.issues, ...prefs.issues);

  const save: SaveData = {
    projectId: expectedProjectId,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: raw.savedAt as string,
    contentVersions: versions,
    explorationState: {
      position: readPosition(ex.position, warnings),
      visitedStations: stringList(ex.visitedStations, 'explorationState.visitedStations', warnings),
      foundDiscoveries: stringList(ex.foundDiscoveries, 'explorationState.foundDiscoveries', warnings),
      creations: Array.isArray(ex.creations) ? clone(ex.creations) : [],
      openedQuests: stringList(ex.openedQuests, 'explorationState.openedQuests', warnings),
      settings: settings.settings,
    },
    activeChallenge: clone(session.activeChallenge),
    challengeDrafts: clone(session.challengeDrafts),
    supportContext: clone(session.supportContext),
    attempts: clone(attempts),
    preferences: prefs.preferences,
  };
  return { ok: true, save, warnings };
}

/** 글자(JSON)에서 읽는다 */
export function parseSaveText(text: string, expectedProjectId: string = PROJECT_ID, opts: ParseOptions = {}): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON 형식이 아니에요'] };
  }
  return parseSave(raw, expectedProjectId, opts);
}

/** 저장소가 '현재'로 바꾸기 전에 거는 확인(platform/storage의 SaveInspector). 믿을 수 없으면 errors에 이유가 든다 */
export function inspectSave(text: string, expectedProjectId: string = PROJECT_ID): { errors: string[]; savedAt: string | null } {
  const r = parseSaveText(text, expectedProjectId);
  return r.ok ? { errors: [], savedAt: r.save.savedAt } : { errors: r.errors, savedAt: null };
}

/**
 * 저장소가 직전 저장으로도 열 수 없을 때 마지막으로 거는 부분 복구(platform/storage의 SaveSalvager).
 * 읽을 수 있는 것만 살려 엄격한 검사를 통과하는 저장 글자로 다시 만든다(저장소는 검사를 통과하지 못한 글자를 현재로 올리지 않는다).
 * 살릴 수 없으면(JSON이 아님, 다른 게임, 못 읽는 판, 저장한 때 오류) null. 버린 것은 warnings에 사람이 읽는 문장으로 든다.
 */
export function salvageSaveText(text: string, expectedProjectId: string = PROJECT_ID): { text: string; savedAt: string; warnings: string[] } | null {
  const r = parseSaveText(text, expectedProjectId, { salvage: true });
  if (!r.ok) return null;
  const repaired = serializeSave(r.save);
  const check = inspectSave(repaired, expectedProjectId);
  if (check.errors.length > 0 || !check.savedAt) return null;
  return { text: repaired, savedAt: check.savedAt, warnings: r.warnings };
}
