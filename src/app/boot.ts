// 시작할 때 저장을 읽는다(설계서 10.6, 3-8 '새로 고친 뒤 같은 자리, 같은 초안').
// 저장소를 열고, 현재 저장(없거나 망가졌으면 직전 저장)을 읽어 확인하고, 앱 조립(createAppContext)에 넘길 값으로 바꾼다.
// 읽다가 멈추는 저장소가 시작을 붙잡지 않도록 시간을 둔다. 이때는 이번 실행에서만 메모리에 적어, 있던 저장을 덮어쓰지 않는다.
import { parseCreations } from '../domain/creation';
import { PROJECT_ID, SAVE_SCHEMA_VERSION, inspectSave, parseSaveText, salvageSaveText, sessionOf } from '../domain/save/save';
import type { SaveData } from '../domain/save/save';
import { UsageLog, usageLogKey } from '../platform/log';
import { SaveStorage, memoryBackend, olderKeyPrefixes, openBestBackend, storageKeyPrefix, withTimeout } from '../platform/storage';
import type { OpenedBackend, StorageEnv } from '../platform/storage';
import type { AppOptions } from './composition';

export interface LoadedSave {
  storage: SaveStorage;
  /** 읽은 저장. 처음이거나 읽을 수 없었으면 null */
  save: SaveData | null;
  /** 저장은 읽었지만 일부를 버리거나 기본값으로 돌렸다는 알림들(사람이 읽는 문장). 저장소의 상태(SaveStatus.loadWarnings)에도 같은 목록이 올라 화면에 나온다 */
  warnings: string[];
  /** 사용 기록(4-8, 13.2): 저장과 같은 저장소에 다른 키로 쌓는다. 열지 못했거나 저장을 읽다가 멈췄으면 이번 실행만 메모리에 쌓는다 */
  usageLog: UsageLog;
}

export interface OpenSaveOptions {
  /** 저장소를 여는 시간 */
  openTimeoutMs?: number;
  /** 저장을 읽는 시간 */
  readTimeoutMs?: number;
  dbName?: string;
  projectId?: string;
  /** 저장소를 직접 넘긴다(시험). 없으면 브라우저에서 가장 좋은 것을 고른다 */
  opened?: OpenedBackend;
}

export const makeStorage = (opened: OpenedBackend, projectId: string = PROJECT_ID): SaveStorage =>
  new SaveStorage({
    keyPrefix: storageKeyPrefix(projectId, SAVE_SCHEMA_VERSION),
    // 저장 형식 판이 오르면 옛 판의 키를 읽어 옮긴다(8-6). 판이 하나뿐인 지금은 비어 있다
    olderPrefixes: olderKeyPrefixes(projectId, SAVE_SCHEMA_VERSION),
    opened,
    inspect: (t) => inspectSave(t, projectId),
    // 현재와 직전 저장이 모두 일부 망가졌을 때, 통째로 새로 시작하지 않고 읽을 수 있는 것만 살린다(10.6)
    salvage: (t) => salvageSaveText(t, projectId),
  });

const nowIsoNow = (): string => new Date().toISOString();

/** 사용 기록을 연다. 읽다가 멈추면 있던 기록을 모르는 채로 덮어쓰지 않도록 이번 실행은 메모리에만 쌓는다 */
async function openUsageLog(opened: OpenedBackend, projectId: string, timeoutMs: number): Promise<UsageLog> {
  try {
    return await withTimeout(UsageLog.open({ backend: opened.backend, key: usageLogKey(storageKeyPrefix(projectId, SAVE_SCHEMA_VERSION)), olderKeys: olderKeyPrefixes(projectId, SAVE_SCHEMA_VERSION).map(usageLogKey), nowIso: nowIsoNow }), timeoutMs, '사용 기록 읽기');
  } catch {
    return UsageLog.inMemory(nowIsoNow);
  }
}

export async function openSave(env: StorageEnv, opts: OpenSaveOptions = {}): Promise<LoadedSave> {
  const projectId = opts.projectId ?? PROJECT_ID;
  const opened = opts.opened ?? (await openBestBackend(env, { ...(opts.dbName ? { dbName: opts.dbName } : {}), ...(opts.openTimeoutMs ? { timeoutMs: opts.openTimeoutMs } : {}) }));
  let storage = makeStorage(opened, projectId);
  const warnings: string[] = [];
  let loaded;
  try {
    loaded = await withTimeout(storage.load(), opts.readTimeoutMs ?? 4000, '저장 읽기');
  } catch {
    // 읽다가 멈췄다. 있는 저장을 모르는 채로 덮어쓰지 않도록 이번 실행은 메모리에만 적는다
    const mem = memoryBackend();
    storage = makeStorage({ backend: mem, sync: mem, kind: 'memory', fallback: '저장을 읽는 데 너무 오래 걸려, 이번에는 저장하지 않아요' }, projectId);
    return { storage, save: null, warnings, usageLog: UsageLog.inMemory(nowIsoNow) };
  }
  const usageLog = await openUsageLog(opened, projectId, opts.readTimeoutMs ?? 4000);
  if (loaded.kind !== 'loaded') return { storage, save: null, warnings, usageLog };
  const parsed = parseSaveText(loaded.text, projectId);
  if (!parsed.ok) return { storage, save: null, warnings, usageLog }; // 저장소가 이미 확인했으므로 여기서 걸릴 일은 없다
  warnings.push(...parsed.warnings, ...parseCreations(parsed.save.explorationState.creations).warnings);
  // 알릴 것이 있으면 상태에 올려 화면에 보이고, 바로 다음 저장이 덮어쓰기 전에 그 저장의 원본을 따로 둔다.
  // 부분 복구로 연 저장은 저장소가 이미 원본을 두었다(여기서 받은 글자는 고쳐 쓴 것이다)
  try {
    await withTimeout(storage.noteLoadWarnings(warnings, loaded.source === 'salvaged' ? null : loaded.text), opts.readTimeoutMs ?? 4000, '읽기 알림');
  } catch {
    /* 알림을 올리지 못해도 게임은 시작한다 */
  }
  const noted = storage.status.get().loadWarnings; // 부분 복구에서 버린 것과 위의 알림을 함께 담고 있다(올리지 못했으면 비어 있다)
  return { storage, save: parsed.save, warnings: noted.length > 0 ? [...noted] : warnings, usageLog };
}

/** 읽은 저장에서 앱 조립에 넘길 값을 꺼낸다. 저장이 없으면 빈 값(모두 기본값) */
export function optionsFromSave(save: SaveData | null): Pick<AppOptions, 'settings' | 'preferences' | 'opened' | 'visited' | 'found' | 'creations' | 'session' | 'attempts' | 'world'> {
  if (!save) return {};
  const pos = save.explorationState.position;
  return {
    settings: save.explorationState.settings,
    preferences: save.preferences,
    opened: save.explorationState.openedQuests,
    visited: save.explorationState.visitedStations,
    found: save.explorationState.foundDiscoveries,
    creations: parseCreations(save.explorationState.creations).creations,
    session: sessionOf(save),
    attempts: save.attempts,
    ...(pos ? { world: { start: { x: pos.x, y: pos.y, facing: pos.facing } } } : {}),
  };
}
