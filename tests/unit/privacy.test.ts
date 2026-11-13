// 개인정보 흐름(8-2, 설계서 10.9, D-6): 이 앱이 받지 않는 것과 저장하는 곳을 코드와 파일이 지킨다. 문서는 docs/privacy-flow.md다.
//   받는 것이 없다(통신 코드, 외부 주소, 개인 정보 필드, 녹음·위치·기기 식별 API가 없다) → 보내는 곳이 없다
//   저장하는 곳이 정해져 있다(저장소 API는 한 파일, 키는 모두 프로젝트 판 접두어) → 기기 안에만 있다
//   나가는 것은 사용자가 누른 내보내기 파일뿐이고, 사용 기록 파일에는 정해진 필드만 있다
// 코드 검사는 문법 트리로 본다(주석과 글 속의 낱말에는 걸리지 않는다). 한계는 docs/privacy-flow.md에 적었다.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PROJECT_ID } from '@/domain/content';
import { emptySave, inspectSave, serializeSave } from '@/domain/save/save';
import { SAVE_SCHEMA_VERSION } from '@/domain/save/save';
import { LOG_EVENT_TYPES, LOG_FILE_NOTE, appendEvent, emptyUsageLog, exportLogFile, normalizeUsageLog } from '@/domain/usagelog';
import type { LogBody, LogEventType } from '@/domain/usagelog';
import { UsageLog, usageLogKey } from '@/platform/log';
import { COMMON_FIELDS, EVENT_FIELDS, ID_VALUE, STORAGE_KEY_SUFFIXES, TOP_FIELDS } from '../privacy-fields';
import { SaveStorage, memoryBackend, openBestBackend, storageKeyPrefix } from '@/platform/storage';
import type { OpenedBackend } from '@/platform/storage';

const root = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// 코드 읽기 도구

function listFiles(dir: string, accept: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && accept(ent.name)) out.push(p);
    }
  };
  walk(path.join(root, dir));
  return out.sort();
}

const rel = (abs: string): string => path.relative(root, abs).split(path.sep).join('/');
const SRC_TS = listFiles('src', (n) => /\.tsx?$/.test(n) && !n.endsWith('.d.ts'));

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** 코드에 나오는 이름(식별자). 주석과 글 속의 낱말은 이름이 아니다 */
function identifiers(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) out.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** 코드에 나오는 글자 상수(따옴표 글, 템플릿 글의 조각, JSX 속성값) */
function literals(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const filesUsing = (names: ReadonlySet<string>): Array<{ file: string; name: string }> =>
  SRC_TS.flatMap((abs) => {
    const ids = identifiers(parse(abs, fs.readFileSync(abs, 'utf-8')));
    return [...names].filter((n) => ids.has(n)).map((name) => ({ file: rel(abs), name }));
  });

// ---------------------------------------------------------------------------
// 1. 통신 코드가 없다

const NETWORK_NAMES = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts', 'Worker', 'SharedWorker', 'serviceWorker', 'RTCPeerConnection', 'WebTransport']);

describe('받는 것이 없다: 통신 코드', () => {
  it('찾는 도구가 정말 잡는다(민감도): 통신 이름은 잡고 주석과 글 속의 낱말은 잡지 않는다', () => {
    const bad = identifiers(parse('x.ts', "fetch('/a'); new WebSocket(u); navigator.sendBeacon(u, d); navigator.serviceWorker.register(s);"));
    for (const n of ['fetch', 'WebSocket', 'sendBeacon', 'serviceWorker']) expect(bad.has(n), n).toBe(true);
    const fine = identifiers(parse('x.ts', "// fetch 하지 않는다\nconst a = '여기서는 fetch 를 쓰지 않아요'; /* WebSocket */"));
    expect(fine.has('fetch')).toBe(false);
    expect(fine.has('WebSocket')).toBe(false);
  });

  it('src 전체(2백여 파일)에 통신하는 이름이 하나도 없다. 월드 그림 파일은 Phaser 적재기가 같은 주소에서 읽는다(흐름 시험이 요청을 센다)', () => {
    expect(SRC_TS.length).toBeGreaterThan(150);
    expect(filesUsing(NETWORK_NAMES)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. 저장소 API는 한 파일에서만

const STORAGE_NAMES = new Set(['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'caches', 'cookie', 'cookieStore']);

describe('저장하는 곳이 정해져 있다: 저장소 API', () => {
  it('src에서 저장소 API를 만지는 파일은 src/platform/storage.ts 하나다', () => {
    expect(SRC_TS.length).toBeGreaterThan(150);
    const using = filesUsing(STORAGE_NAMES);
    expect([...new Set(using.map((u) => u.file))]).toEqual(['src/platform/storage.ts']);
    // 쿠키는 어디에도 없다
    expect(using.filter((u) => u.name === 'cookie' || u.name === 'cookieStore')).toEqual([]);
  });

  it('찾는 도구가 정말 잡는다(민감도)', () => {
    const ids = identifiers(parse('x.ts', 'document.cookie = a; window.sessionStorage.setItem(k, v); caches.open(n);'));
    for (const n of ['cookie', 'sessionStorage', 'caches']) expect(ids.has(n), n).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. 밖으로 가는 주소가 없다

const EXTERNAL = /^(?:https?:|wss?:)?\/\//i;
/** XML 이름공간 문자열은 주소로 가는 요청이 아니다(SVG를 만들 때만 쓴다) */
const XML_NAMESPACES = new Set(['http://www.w3.org/2000/svg']);

describe('받는 것이 없다: 외부 주소', () => {
  it('코드의 글자 상수에 http(s)·ws(s)·// 주소가 없다(SVG 이름공간 하나만 있다)', () => {
    const hits = SRC_TS.flatMap((abs) => literals(parse(abs, fs.readFileSync(abs, 'utf-8'))).filter((l) => EXTERNAL.test(l.trim())).map((l) => `${rel(abs)}: ${l.slice(0, 60)}`));
    expect(hits.filter((h) => !XML_NAMESPACES.has(h.slice(h.indexOf(': ') + 2)))).toEqual([]);
    expect(hits.length).toBeGreaterThan(0); // 이름공간은 실제로 있다: 도구가 글자 상수를 읽고 있다는 증거
  });

  it('찾는 도구가 정말 잡는다(민감도)', () => {
    const lits = literals(parse('x.tsx', "const a = 'https://example.com/x'; const b = `//cdn.example.com/${n}`; const c = <a href=\"http://example.org\">x</a>;"));
    expect(lits.filter((l) => EXTERNAL.test(l))).toEqual(['https://example.com/x', '//cdn.example.com/', 'http://example.org']);
  });

  it('index.html의 속성에는 바깥 주소가 없고(아이콘은 data 주소다), 스타일 파일에도 바깥 주소가 없다', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
    expect(html).not.toMatch(/\s(?:src|href|action|srcset|poster|data)\s*=\s*["'](?:https?:|wss?:)?\/\//i);
    expect(html).toMatch(/rel="icon" href="data:image\/svg\+xml,/);
    for (const css of listFiles('src', (n) => n.endsWith('.css'))) {
      const text = fs.readFileSync(css, 'utf-8');
      expect(text, rel(css)).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i);
      expect(text, rel(css)).not.toMatch(/@import\s+(?:url\(\s*)?['"]?(?:https?:)?\/\//i);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. 받지 않는 것: 개인 정보 필드와 장치 API

/** 이름, 연락처, 생년월일, 녹음, 위치, 기기를 가리키는 값(10.9)을 다루는 이름. 코드에 하나도 없어야 한다 */
const COLLECT_NAMES = new Set([
  // 사람을 가리키는 값
  'email', 'phone', 'phoneNumber', 'password', 'passwd', 'birthday', 'birthdate', 'birthDate', 'birthYear', 'nickname', 'username', 'userName', 'realName', 'fullName',
  // 녹음과 사진
  'getUserMedia', 'mediaDevices', 'MediaRecorder', 'enumerateDevices', 'getDisplayMedia',
  // 위치
  'geolocation', 'getCurrentPosition', 'watchPosition',
  // 연락처와 알림과 권한
  'ContactsManager', 'Notification', 'requestPermission', 'PushManager',
  // 기기를 가리키는 값
  'userAgent', 'userAgentData', 'deviceMemory', 'hardwareConcurrency', 'getBattery', 'fingerprint', 'deviceId',
]);

describe('받지 않는 것: 이름, 연락처, 생년월일, 녹음, 위치, 기기를 가리키는 값(10.9)', () => {
  it('src에 그런 값을 다루는 이름이 하나도 없다', () => {
    expect(filesUsing(COLLECT_NAMES)).toEqual([]);
  });

  it('찾는 도구가 정말 잡는다(민감도)', () => {
    const ids = identifiers(parse('x.ts', 'navigator.mediaDevices.getUserMedia({ audio: true }); const email = form.email; navigator.geolocation.getCurrentPosition(f); navigator.userAgent;'));
    for (const n of ['mediaDevices', 'getUserMedia', 'email', 'geolocation', 'getCurrentPosition', 'userAgent']) expect(ids.has(n), n).toBe(true);
  });

  it('글을 적는 입력칸은 작품 이름(20글자까지) 둘뿐이다. 그 밖의 입력칸은 슬라이더와 파일 고르기다', () => {
    const found: string[] = [];
    for (const abs of listFiles('src/ui', (n) => n.endsWith('.tsx'))) {
      const sf = parse(abs, fs.readFileSync(abs, 'utf-8'));
      const visit = (n: ts.Node): void => {
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && /^(?:input|textarea|select)$/.test(n.tagName.getText(sf))) {
          const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
          const typeAttr = attrs.find((a) => a.name.getText(sf) === 'type');
          const type = typeAttr?.initializer && ts.isStringLiteral(typeAttr.initializer) ? typeAttr.initializer.text : typeAttr ? '(식)' : 'text';
          const limited = attrs.some((a) => a.name.getText(sf) === 'maxLength');
          found.push(`${rel(abs)} ${n.tagName.getText(sf)}:${type}${type === 'text' ? (limited ? ':maxLength' : ':제한없음') : ''}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(found.sort()).toEqual(
      [
        'src/ui/common/Slider.tsx input:range',
        'src/ui/notebook/NotebookPages.tsx input:text:maxLength',
        'src/ui/overlay/SaveSection.tsx input:file',
        'src/ui/panels/song/MelodyAside.tsx input:text:maxLength',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. 저장 키는 모두 프로젝트 판 접두어를 갖는다

const PREFIX = storageKeyPrefix(PROJECT_ID, SAVE_SCHEMA_VERSION);

const openedOf = (b: ReturnType<typeof memoryBackend>): OpenedBackend => ({ backend: b, sync: b, kind: b.kind, fallback: null });

describe('저장하는 곳이 정해져 있다: 키', () => {
  it('저장과 사용 기록을 여러 번 적고 나면 저장소에 남은 키는 모두 정해진 이름이고 프로젝트 id와 판이 앞에 붙는다', async () => {
    const mem = memoryBackend();
    const storage = new SaveStorage({ keyPrefix: PREFIX, opened: openedOf(mem), inspect: (t) => inspectSave(t) });
    await storage.load();
    expect(await storage.save(serializeSave(emptySave('2026-11-13T01:00:00.000Z')))).toBe(true);
    expect(await storage.save(serializeSave(emptySave('2026-11-13T02:00:00.000Z')))).toBe(true);
    storage.saveEmergency(serializeSave(emptySave('2026-11-13T03:00:00.000Z')));

    let tick = 0;
    const log = await UsageLog.open({ backend: mem, key: usageLogKey(PREFIX), nowIso: () => new Date(Date.UTC(2026, 10, 13, 4, 0, tick++)).toISOString(), timers: { setTimeout: () => 0, clearTimeout: () => undefined } });
    log.beginSession();
    log.record({ type: 'station-enter', stationId: 'S2', route: 'map' });
    expect(await log.flush()).toBe(true);

    const keys = [...mem.data.keys()].sort();
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const k of keys) {
      expect(k.startsWith(PREFIX), k).toBe(true);
      expect(STORAGE_KEY_SUFFIXES, k).toContain(k.slice(PREFIX.length));
    }
    expect(keys).toContain(`${PREFIX}save:current`);
    expect(keys).toContain(`${PREFIX}usage-log`);
  });

  it('저장소가 쓸 수 있는지 한 번 적어 보는 시험 키는 곧 지운다(남기지 않는다)', async () => {
    const data = new Map<string, string>();
    const ls = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    const opened = await openBestBackend({ localStorage: ls });
    expect(opened.kind).toBe('localstorage');
    expect(data.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. 사용 기록 파일에는 정해진 필드만 있다

const BODIES: Record<LogEventType, LogBody> = {
  'session-start': { type: 'session-start', screen: 'world' },
  'station-enter': { type: 'station-enter', stationId: 'S2', route: 'walk' },
  'quest-enter': { type: 'quest-enter', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest', route: 'list', surface: 'panel', stationId: 'S2' },
  'help-open': { type: 'help-open', kind: 'aid', what: 'slowListen', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' },
  'return-to-origin': { type: 'return-to-origin', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' },
  'placement-edit': { type: 'placement-edit', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest', surface: 'world', free: true },
  listen: { type: 'listen', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest', what: 'mine', surface: 'panel', free: true },
  check: { type: 'check', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest', result: 'needsRevision', assistUsed: true },
  'stone-step': { type: 'stone-step', installationId: 'tl-stage-1', slot: 3 },
  'discovery-found': { type: 'discovery-found', discoveryId: 'beat-river.snd.01' },
};

/** 몰래 끼어들 수 있는 것들: 이름, 연락처, 입력한 글, 놓은 음의 내용, 기기를 가리키는 값 */
const INTRUDERS = { name: '홍길동', email: 'gildong@example.com', text: '오늘 일기', notes: [60, 62, 64], deviceId: 'abc-123', creationName: '내 첫 곡' };

describe('나가는 것: 사용 기록 파일에는 정해진 필드만 있다', () => {
  it('표가 모든 사건 종류를 덮는다', () => {
    expect(Object.keys(EVENT_FIELDS).sort()).toEqual([...LOG_EVENT_TYPES].sort());
    expect(Object.keys(BODIES).sort()).toEqual([...LOG_EVENT_TYPES].sort());
  });

  function exported(build: () => ReturnType<typeof emptyUsageLog>) {
    const file = exportLogFile(build(), '2026-11-13T05:00:00.000Z');
    return { file, doc: JSON.parse(file.text) as Record<string, unknown> & { events: Array<Record<string, unknown>> } };
  }

  it('모든 사건 종류를 적어 내보내면 파일의 맨 위 필드와 사건 필드가 표 안에 있다', () => {
    const { doc } = exported(() => {
      let d = emptyUsageLog();
      for (const b of Object.values(BODIES)) d = appendEvent(d, b, '2026-11-13T04:00:00.000Z', 1);
      return d;
    });
    expect(Object.keys(doc).sort()).toEqual(TOP_FIELDS);
    expect(doc.events).toHaveLength(LOG_EVENT_TYPES.length);
    for (const e of doc.events) {
      const type = e['type'] as LogEventType;
      for (const k of Object.keys(e)) expect([...EVENT_FIELDS[type], ...COMMON_FIELDS], `${type}.${k}`).toContain(k);
    }
    // 값은 정해진 이름(id), 고르는 값, 숫자, 날짜뿐이다: 공백이나 한글 같은 글이 없다
    for (const e of doc.events) {
      for (const [k, v] of Object.entries(e)) {
        if (typeof v === 'string') expect(v, `${e['type']}.${k}`).toMatch(ID_VALUE);
        else expect(['number', 'boolean'], `${e['type']}.${k}`).toContain(typeof v);
      }
    }
  });

  it('부르는 쪽이 이름이나 글을 얹어 넘겨도 기록하는 순간 걸러진다(10.9)', () => {
    let d = emptyUsageLog();
    for (const b of Object.values(BODIES)) d = appendEvent(d, { ...b, ...INTRUDERS } as LogBody, '2026-11-13T04:00:00.000Z', 1);
    const { file, doc } = exported(() => d);
    for (const word of ['홍길동', 'gildong@example.com', '오늘 일기', 'abc-123', '내 첫 곡', '60, 62']) expect(file.text, word).not.toContain(word);
    for (const e of doc.events) for (const k of Object.keys(INTRUDERS)) expect(Object.keys(e), `${e['type']}.${k}`).not.toContain(k);
  });

  it('저장소에서 읽은 기록에 다른 필드가 끼어 있어도 읽는 순간 걸러져 파일로 나가지 않는다(예전 판이나 손으로 고친 값)', () => {
    const raw = {
      format: 'levelup-music-world.usage-log',
      formatVersion: 1,
      enabled: true,
      nextSeq: 11,
      lastSid: 1,
      dropped: 0,
      events: Object.values(BODIES).map((b, i) => ({ ...b, ...INTRUDERS, seq: i + 1, sid: 1, at: '2026-11-13T04:00:00.000Z' })),
    };
    const { data, issues } = normalizeUsageLog(raw);
    expect(issues).toEqual([]);
    expect(data.events).toHaveLength(LOG_EVENT_TYPES.length);
    const { file } = exported(() => data);
    for (const word of ['홍길동', 'gildong@example.com', '오늘 일기', 'abc-123', '내 첫 곡']) expect(file.text, word).not.toContain(word);
    for (const e of data.events) for (const k of Object.keys(INTRUDERS)) expect(Object.keys(e)).not.toContain(k);
  });

  it('파일 머리말(LOG_FILE_NOTE)이 받지 않는 것을 말하고, 파일 이름에는 날짜뿐이다', () => {
    for (const word of ['이름', '연락처', '생년월일', '녹음', '놓은 음의 내용']) expect(LOG_FILE_NOTE).toContain(word);
    const { file } = exported(() => emptyUsageLog());
    expect(file.fileName).toBe(`${PROJECT_ID}-usage-log-2026-11-13.json`);
  });
});
