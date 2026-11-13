// 4-8 사용 기록의 모델(설계서 13.2, 10.9): 사건의 모양, 한도, 읽기 검증, 요약, 내보내기 파일. 저장소와 화면 없이 순수하게 확인한다.
import { describe, expect, it } from 'vitest';
import {
  ENTRY_ROUTES,
  LOG_EVENT_TYPES,
  LOG_FORMAT,
  LOG_FORMAT_VERSION,
  MAX_LOG_EVENTS,
  appendEvent,
  buildLogExport,
  emptyUsageLog,
  exportLogFile,
  isLogBody,
  normalizeUsageLog,
  summarizeLog,
  trimEvents,
} from '@/domain/usagelog';
import type { LogBody, LogEvent, UsageLogData } from '@/domain/usagelog';

const AT = '2026-11-11T09:00:00.000Z';

/** 사건 종류마다 올바른 예 하나 */
const SAMPLE: Record<LogBody['type'], LogBody> = {
  'session-start': { type: 'session-start', screen: 'world' },
  'station-enter': { type: 'station-enter', stationId: 'H4', route: 'walk' },
  'quest-enter': { type: 'quest-enter', questId: 'scale.major', variantId: 'c-major', route: 'list', surface: 'panel', stationId: 'H4' },
  'help-open': { type: 'help-open', kind: 'aid', what: 'slow', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' },
  'return-to-origin': { type: 'return-to-origin', questId: 'rhythm.rest-in-a-bar', variantId: 'quarter-rest' },
  'placement-edit': { type: 'placement-edit', questId: 'scale.major', variantId: 'c-major', surface: 'world' },
  listen: { type: 'listen', questId: 'scale.major', variantId: 'c-major', what: 'target', surface: 'panel' },
  check: { type: 'check', questId: 'scale.major', variantId: 'c-major', result: 'passed', assistUsed: false },
  'stone-step': { type: 'stone-step', installationId: 'inst.village.scale-stones', slot: 3 },
  'discovery-found': { type: 'discovery-found', discoveryId: 'disc.village.bell' },
};

const ev = (body: LogBody, seq = 1, sid = 1, at = AT): LogEvent => ({ ...body, seq, sid, at }) as LogEvent;

function chain(bodies: LogBody[], max = MAX_LOG_EVENTS): UsageLogData {
  let d: UsageLogData = { ...emptyUsageLog(), lastSid: 1 }; // 첫 실행이 시작된 뒤
  bodies.forEach((b, i) => {
    d = appendEvent(d, b, `2026-11-11T09:00:${String(i).padStart(2, '0')}.000Z`, 1, max);
  });
  return d;
}

describe('사건의 종류(13.2)', () => {
  it('13.2의 일곱 가지 사건이 모두 있다: 진입(정거장·과제), 도움 열기, 복귀, 배치 수정, 다시 듣기, 설치물 밖 돌 밟기, 소리 조각 발견', () => {
    for (const t of ['station-enter', 'quest-enter', 'help-open', 'return-to-origin', 'placement-edit', 'listen', 'stone-step', 'discovery-found'] as const) {
      expect(LOG_EVENT_TYPES).toContain(t);
    }
  });

  it('13.2 밖의 사건은 둘뿐이다: 시작(H1의 기준 시각)과 확인(H3·H4의 근거)', () => {
    const outside = LOG_EVENT_TYPES.filter((t) => !['station-enter', 'quest-enter', 'help-open', 'return-to-origin', 'placement-edit', 'listen', 'stone-step', 'discovery-found'].includes(t));
    expect(outside.sort()).toEqual(['check', 'session-start']);
  });

  it('진입 경로는 걷기, 지도, 목록, 주소가 있고 수첩과 그 밖이 더해진다', () => {
    expect(ENTRY_ROUTES).toEqual(['walk', 'map', 'list', 'notebook', 'address', 'other']);
  });

  it('사건 종류마다 올바른 예는 형식 검사를 통과한다', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual([...LOG_EVENT_TYPES].sort());
    for (const body of Object.values(SAMPLE)) expect(isLogBody(body), body.type).toBe(true);
  });

  it('형식이 틀린 사건은 통과하지 못한다', () => {
    const bad: unknown[] = [
      null,
      'station-enter',
      {},
      { type: 'unknown-type' },
      { type: 'session-start', screen: 'moon' },
      { type: 'station-enter', stationId: '', route: 'walk' },
      { type: 'station-enter', stationId: 'H4', route: 'teleport' },
      { type: 'quest-enter', questId: 'a', variantId: 'b', route: 'walk', surface: 'sky' },
      { type: 'quest-enter', questId: 'a', variantId: 'b', route: 'walk', surface: 'panel', stationId: 7 },
      { type: 'help-open', kind: 'magic', what: 'x' },
      { type: 'placement-edit', questId: 'a', variantId: 'b', surface: 'panel', free: false },
      { type: 'listen', questId: 'a', variantId: 'b', what: 'note', surface: 'panel' },
      { type: 'check', questId: 'a', variantId: 'b', result: 'failed', assistUsed: false },
      { type: 'check', questId: 'a', variantId: 'b', result: 'passed', assistUsed: 'no' },
      { type: 'stone-step', installationId: 'i', slot: 0 },
      { type: 'stone-step', installationId: 'i', slot: 1.5 },
      { type: 'discovery-found', discoveryId: 'x'.repeat(201) },
    ];
    for (const b of bad) expect(isLogBody(b), JSON.stringify(b)).toBe(false);
  });
});

describe('사건 더하기와 한도', () => {
  it('사건에는 번호(seq), 실행 번호(sid), 때(at)가 붙고 번호가 이어진다', () => {
    const d = chain([SAMPLE['session-start'], SAMPLE['station-enter']]);
    expect(d.events.map((e) => [e.seq, e.sid, e.type])).toEqual([
      [1, 1, 'session-start'],
      [2, 1, 'station-enter'],
    ]);
    expect(d.nextSeq).toBe(3);
    expect(d.events[1]!.at).toBe('2026-11-11T09:00:01.000Z');
  });

  it('꺼져 있으면 사건을 더하지 않고 같은 기록을 돌려준다', () => {
    const off = emptyUsageLog(false);
    expect(appendEvent(off, SAMPLE['listen'], AT, 1)).toBe(off);
  });

  it('원래 기록은 바꾸지 않는다(새 기록을 돌려준다)', () => {
    const d = emptyUsageLog();
    const next = appendEvent(d, SAMPLE['listen'], AT, 1);
    expect(d.events).toHaveLength(0);
    expect(next.events).toHaveLength(1);
  });

  it('한도가 차면 되풀이되는 사건(돌 밟기, 배치 수정, 듣기)부터 오래된 순으로 지운다', () => {
    const step = (slot: number): LogBody => ({ type: 'stone-step', installationId: 'i', slot });
    const d = chain([SAMPLE['session-start'], step(1), SAMPLE['quest-enter'], step(2), step(3), SAMPLE['check']], 4);
    expect(d.events.map((e) => e.type)).toEqual(['session-start', 'quest-enter', 'stone-step', 'check']);
    expect(d.events.filter((e) => e.type === 'stone-step').map((e) => (e as { slot: number }).slot)).toEqual([3]);
    expect(d.dropped).toBe(2);
  });

  it('되풀이되는 사건이 없으면 가장 오래된 것부터 지운다', () => {
    const d = chain([SAMPLE['session-start'], SAMPLE['station-enter'], SAMPLE['quest-enter'], SAMPLE['check']], 3);
    expect(d.events.map((e) => e.type)).toEqual(['station-enter', 'quest-enter', 'check']);
    expect(d.dropped).toBe(1);
  });

  it('뼈대(시작, 진입, 복귀, 확인)는 되풀이 사건이 남아 있는 한 지워지지 않는다', () => {
    const bodies: LogBody[] = [SAMPLE['session-start'], SAMPLE['quest-enter'], SAMPLE['check']];
    for (let i = 0; i < 50; i++) bodies.push(SAMPLE['listen']);
    const d = chain(bodies, 10);
    expect(d.events).toHaveLength(10);
    expect(d.events.slice(0, 3).map((e) => e.type)).toEqual(['session-start', 'quest-enter', 'check']);
    expect(d.dropped).toBe(43);
  });

  it('번호(seq)는 지워진 뒤에도 계속 늘어난다', () => {
    const d = chain([SAMPLE['listen'], SAMPLE['listen'], SAMPLE['listen']], 2);
    expect(d.events.map((e) => e.seq)).toEqual([2, 3]);
    expect(d.nextSeq).toBe(4);
  });

  it('trimEvents는 한도 안이면 아무것도 지우지 않는다', () => {
    const events = [ev(SAMPLE['listen'], 1), ev(SAMPLE['check'], 2)];
    expect(trimEvents(events, 2)).toEqual({ events, dropped: 0 });
  });

  it('기본 한도는 3,000건이다', () => {
    expect(MAX_LOG_EVENTS).toBe(3000);
  });
});

describe('읽기: 저장소에서 읽은 값을 믿을 수 있게 만든다', () => {
  it('없는 값은 켜져 있는 빈 기록이다', () => {
    for (const raw of [undefined, null]) {
      const r = normalizeUsageLog(raw);
      expect(r.data).toEqual(emptyUsageLog());
      expect(r.issues).toEqual([]);
    }
  });

  it('우리 기록이 아니거나 더 새로운 판이면 읽지 않고 빈 기록으로 시작한다고 알린다', () => {
    expect(normalizeUsageLog({ format: 'other', events: [] }).issues[0]).toContain('형식을 알 수 없어');
    expect(normalizeUsageLog('text').issues).toHaveLength(1);
    const future = normalizeUsageLog({ format: LOG_FORMAT, formatVersion: LOG_FORMAT_VERSION + 1, events: [ev(SAMPLE['listen'])] });
    expect(future.data.events).toEqual([]);
    expect(future.issues[0]).toContain('읽을 수 없어');
  });

  it('쓴 것을 그대로 읽는다(JSON을 거쳐도 같다)', () => {
    const d = chain(Object.values(SAMPLE));
    const r = normalizeUsageLog(JSON.parse(JSON.stringify(d)));
    expect(r.issues).toEqual([]);
    expect(r.data).toEqual(d);
  });

  it('형식에 맞지 않는 사건은 버리고 몇 개를 버렸는지 알린다. 맞는 사건은 남긴다', () => {
    const raw = { ...chain([SAMPLE['listen']]), events: [ev(SAMPLE['listen'], 1), { type: 'listen' }, ev(SAMPLE['check'], 2, 1, 'not a date'), 'x', ev(SAMPLE['check'], 3)] };
    const r = normalizeUsageLog(raw);
    expect(r.data.events.map((e) => e.seq)).toEqual([1, 3]);
    expect(r.issues).toEqual(['형식에 맞지 않는 사건 3개를 버렸어요']);
  });

  it('다음 번호와 마지막 실행 번호가 사건보다 작게 적혀 있어도 사건 뒤로 이어 간다', () => {
    const r = normalizeUsageLog({ format: LOG_FORMAT, formatVersion: 1, enabled: true, nextSeq: 1, lastSid: 0, dropped: 0, events: [ev(SAMPLE['listen'], 7, 3)] });
    expect(r.data.nextSeq).toBe(8);
    expect(r.data.lastSid).toBe(3);
  });

  it('꺼 둔 것은 꺼진 채로 읽고, 켜고 끄는 값이 없으면 켜진 것으로 본다', () => {
    expect(normalizeUsageLog({ ...emptyUsageLog(false) }).data.enabled).toBe(false);
    const { enabled: _e, ...without } = emptyUsageLog();
    expect(normalizeUsageLog(without).data.enabled).toBe(true);
  });

  it('읽은 사건이 한도보다 많으면 한도 안으로 줄이고 지운 수를 더한다', () => {
    const events = [1, 2, 3, 4].map((n) => ev(SAMPLE['listen'], n));
    const r = normalizeUsageLog({ ...emptyUsageLog(), dropped: 5, events }, 3);
    expect(r.data.events.map((e) => e.seq)).toEqual([2, 3, 4]);
    expect(r.data.dropped).toBe(6);
  });
});

describe('요약과 H5', () => {
  it('종류별 수, 실행 수, 과제에 들어간 길별 수와 걸어서 들어간 비율을 센다', () => {
    const q = (route: 'walk' | 'map' | 'list'): LogBody => ({ type: 'quest-enter', questId: 'a', variantId: 'b', route, surface: 'panel' });
    const d = chain([SAMPLE['session-start'], q('walk'), q('list'), q('list'), q('map'), SAMPLE['listen']]);
    const events = [...d.events.slice(0, 5), ev(SAMPLE['listen'], 99, 2)];
    const s = summarizeLog({ events });
    expect(s.events).toBe(6);
    expect(s.sessions).toBe(2);
    expect(s.byType).toEqual({ 'session-start': 1, 'quest-enter': 4, listen: 1 });
    expect(s.questEntriesByRoute).toEqual({ walk: 1, map: 1, list: 2, notebook: 0, address: 0, other: 0 });
    expect(s.walkShare).toBe(0.25);
  });

  it('걸어서 들어간 비율은 소수 둘째 자리까지고, 들어간 적이 없으면 null이다', () => {
    const q = (route: 'walk' | 'list'): LogBody => ({ type: 'quest-enter', questId: 'a', variantId: 'b', route, surface: 'panel' });
    expect(summarizeLog(chain([q('walk'), q('list'), q('list')])).walkShare).toBe(0.33);
    expect(summarizeLog(chain([SAMPLE['listen']])).walkShare).toBeNull();
    expect(summarizeLog(emptyUsageLog()).walkShare).toBeNull();
  });
});

describe('내보내기 파일', () => {
  const data = chain(Object.values(SAMPLE));

  it('파일 이름에 내보낸 날짜가 들어간다', () => {
    expect(exportLogFile(data, '2026-11-12T03:04:05.000Z').fileName).toBe('levelup-music-world-usage-log-2026-11-12.json');
  });

  it('글자는 올바른 JSON이고, 머리말에 형식, 프로젝트, 내보낸 때, 설명, 지운 수, 요약이 있다', () => {
    const f = exportLogFile(data, AT);
    const doc = JSON.parse(f.text) as ReturnType<typeof buildLogExport>;
    expect(doc).toEqual(JSON.parse(JSON.stringify(buildLogExport(data, AT))));
    expect(doc.format).toBe(LOG_FORMAT);
    expect(doc.projectId).toBe('levelup-music-world');
    expect(doc.exportedAt).toBe(AT);
    expect(doc.note).toContain('이름, 연락처, 생년월일, 녹음');
    expect(doc.summary.events).toBe(LOG_EVENT_TYPES.length);
    expect(doc.events).toHaveLength(LOG_EVENT_TYPES.length);
  });

  it('13.2의 사건이 파일에 모두 나온다', () => {
    const doc = JSON.parse(exportLogFile(data, AT).text) as { events: Array<{ type: string }> };
    expect(new Set(doc.events.map((e) => e.type))).toEqual(new Set(LOG_EVENT_TYPES));
  });

  it('사건은 한 줄에 하나씩 적혀 편집기에서도 읽기 쉽다', () => {
    const lines = exportLogFile(data, AT).text.split('\n');
    const eventLines = lines.filter((l) => l.startsWith('    {"'));
    expect(eventLines).toHaveLength(LOG_EVENT_TYPES.length);
    for (const l of eventLines) expect(() => JSON.parse(l.replace(/,$/, ''))).not.toThrow();
  });

  it('사건이 없으면 빈 목록으로 내보낸다', () => {
    const doc = JSON.parse(exportLogFile(emptyUsageLog(), AT).text) as { events: unknown[]; summary: { walkShare: number | null } };
    expect(doc.events).toEqual([]);
    expect(doc.summary.walkShare).toBeNull();
  });

  it('받지 않는 것(10.9)이 파일에 없다: 사건에는 id와 사실 말고 다른 칸이 없다', () => {
    const allowed = new Set(['type', 'seq', 'sid', 'at', 'screen', 'stationId', 'route', 'questId', 'variantId', 'surface', 'kind', 'what', 'free', 'result', 'assistUsed', 'installationId', 'slot', 'discoveryId']);
    const doc = JSON.parse(exportLogFile(data, AT).text) as { events: Array<Record<string, unknown>> };
    for (const e of doc.events) for (const k of Object.keys(e)) expect(allowed.has(k), `${e['type']}.${k}`).toBe(true);
    const text = exportLogFile(data, AT).text.toLowerCase();
    for (const word of ['email', 'phone', 'birth', 'name":', 'recording', 'userAgent'.toLowerCase(), 'deviceid']) expect(text).not.toContain(word);
  });
});
