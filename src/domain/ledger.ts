// 8-1 출처·권리 대장(설계서 11.4). 그림, 소리, 글꼴, 그리고 배포물에 들어가는 외부 코드의 출처와 권리를 항목으로 적고,
// 배포물과 소스에 실제로 있는 것과 맞추어 본다. 파일을 읽는 일은 tools/ledger-files.ts가 하고, 여기서는 읽어 온 사실(LedgerFacts)만 본다.
// 이 파일은 대장을 믿지 않는다: 형식 → 항목 사이의 모순 → 사실과의 대조 순으로 확인하고, 틀린 것을 모두 목록으로 돌려준다.
import type { ContentIssue } from './content';

export const LEDGER_SCHEMA_VERSION = 1;

/** 종류. 11.4의 그림·소리·글꼴에, 배포물에 들어가는 외부 코드와 그 고지문을 더했다 */
export const LEDGER_KINDS = ['그림', '소리', '글꼴', '라이브러리', '고지문'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_ORIGINS = ['자체 제작', '외부'] as const;
export type LedgerOrigin = (typeof LEDGER_ORIGINS)[number];

/**
 * 권리 상태.
 *  · own: 자체 제작이라 외부 라이선스가 없다
 *  · licensed: 외부 것이고 라이선스를 확인했다(원문이 저장소나 설치된 패키지에 있다)
 *  · unconfirmed: 아직 확인하지 못했다. 공개 전에 막는 방법(gate)을 적어야 하고, 배포 파일에는 있을 수 없다
 *  · not-shipped: 배포물에 들어가지 않는다(시험·기록용, 또는 글꼴 이름만 부르고 파일은 싣지 않는 것)
 */
export const LEDGER_RIGHTS = ['own', 'licensed', 'unconfirmed', 'not-shipped'] as const;
export type LedgerRights = (typeof LEDGER_RIGHTS)[number];

export interface EmbeddedFont {
  /** 악보 라이브러리 안의 글꼴 모듈 이름(예: bravura) */
  module: string;
  /** 모듈에 들어 있는 글꼴 바이트의 sha256. 라이선스를 확인한 바로 그 파일인지 묶어 두는 값이다 */
  sha256: string;
}

export interface LedgerEntry {
  assetId: string;
  kind: LedgerKind;
  origin: LedgerOrigin;
  rights: LedgerRights;
  license: string;
  basis: string;
  /** 확인한 날(YYYY-MM-DD) */
  checkedOn: string;
  /** 저장소 기준 경로. `*`는 한 폴더 안의 글자, `**`는 폴더를 건너뛴 글자와 맞는다 */
  files: string[];
  /** 코드가 이름으로 정하는 것: 음색 이름, 글꼴 이름, 패키지 이름 */
  ids: string[];
  version?: string;
  copyright?: string;
  /** 라이선스 원문을 그대로 옮겨 둔 파일(저장소 기준 경로)과 그 sha256 */
  licenseFile?: string;
  licenseSha256?: string;
  embedded?: EmbeddedFont[];
  /** rights가 unconfirmed일 때: 공개 전에 어떻게 막는가 */
  gate?: string;
}

export interface AssetLedger {
  schemaVersion: number;
  entries: LedgerEntry[];
}

/** 대장과 맞추어 볼, 저장소와 빌드에서 읽어 온 사실 */
export interface LedgerFacts {
  /** 저장소의 모든 파일(node_modules, dist, .git은 뺀다). 저장소 기준 경로 */
  allFiles: string[];
  /** 그 가운데 그림·소리·글꼴 파일(확장자로 가른다) */
  mediaFiles: string[];
  /** 그 가운데 배포물(public/)에 있는 파일 */
  publicFiles: string[];
  /** 배포물에 들어가는 외부 패키지(운영 의존성 전부) */
  packages: Array<{ name: string; version: string; license: string }>;
  /** 악보 라이브러리가 빌드에 싣는 글꼴 모듈과 그 바이트의 sha256 */
  embeddedFonts: EmbeddedFont[];
  /** 글꼴 목록(CSS와 글자 그림)이 이름으로 부르는 글꼴. 일반 계열(sans-serif 등)은 뺀다 */
  namedFonts: string[];
  /** 위 두 곳에서 벗어난 글꼴 선언(font-family 값). 있으면 이름을 모아 본 것이 빠뜨렸다는 뜻이다 */
  strayFontDeclarations: string[];
  /** `@font-face` 규칙의 수 */
  fontFaceCount: number;
  /** 소스가 만드는 합성 음색의 이름 */
  timbreIds: string[];
  /** 저장소 기준 경로 → sha256. 대장이 가리키는 라이선스 원문 파일마다 있어야 한다 */
  fileHashes: Record<string, string>;
  /** 소스·CSS·HTML이 가리키는 그림·소리·글꼴 파일 가운데 배포물의 world/ 밖을 가리키는 것 */
  strayAssetRefs: string[];
}

const ENTRY_KEYS: ReadonlySet<string> = new Set(['assetId', 'kind', 'origin', 'rights', 'license', 'basis', 'checkedOn', 'files', 'ids', 'version', 'copyright', 'licenseFile', 'licenseSha256', 'embedded', 'gate']);
const ID_PATTERN = /^[a-z][a-z0-9.-]*$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** YYYY-MM-DD이고 실제로 있는 날인가(시계를 읽지 않고 달력만 본다) */
export function isLedgerDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]!;
  return d <= days;
}

/** 경로 무늬를 정규식으로: `*`는 `/`를 뺀 글자들, `**`는 `/`까지 포함한 글자들, `**` 다음에 `/`가 오면 폴더 0개 이상, `?`는 `/`를 뺀 글자 하나 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** 항목의 files 무늬 가운데 하나라도 이 파일과 맞는가 */
export const entryCovers = (entry: Pick<LedgerEntry, 'files'>, file: string): boolean => entry.files.some((g) => globToRegExp(g).test(file));

export function parseLedger(raw: unknown): { ledger: AssetLedger | null; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string): void => {
    issues.push({ code, path, message });
  };
  if (!isObject(raw)) {
    add('LEDGER_SHAPE', 'asset-ledger', '대장이 객체가 아니에요');
    return { ledger: null, issues };
  }
  if (raw['schemaVersion'] !== LEDGER_SCHEMA_VERSION) add('LEDGER_SHAPE', 'asset-ledger.schemaVersion', `schemaVersion은 ${LEDGER_SCHEMA_VERSION}이어야 해요`);
  const list = raw['entries'];
  if (!Array.isArray(list)) {
    add('LEDGER_SHAPE', 'asset-ledger.entries', 'entries가 배열이 아니에요');
    return { ledger: null, issues };
  }
  const entries: LedgerEntry[] = [];
  const seen = new Set<string>();
  list.forEach((item, index) => {
    const at = `asset-ledger.entries[${index}]`;
    if (!isObject(item)) return add('LEDGER_SHAPE', at, '항목이 객체가 아니에요');
    const id = item['assetId'];
    const p = isText(id) ? `asset-ledger:${id}` : at;
    for (const key of Object.keys(item)) if (!ENTRY_KEYS.has(key)) add('LEDGER_SHAPE', p, `알 수 없는 필드 '${key}'가 있어요`);
    const before = issues.length;
    if (!isText(id) || !ID_PATTERN.test(id)) add('LEDGER_SHAPE', p, "assetId는 소문자로 시작하고 소문자·숫자·'.'·'-'로만 적어야 해요");
    else if (seen.has(id)) add('LEDGER_DUP', p, `assetId '${id}'가 두 번 나와요`);
    else seen.add(id);
    const kind = item['kind'];
    if (typeof kind !== 'string' || !(LEDGER_KINDS as readonly string[]).includes(kind)) add('LEDGER_SHAPE', `${p}.kind`, `kind는 ${LEDGER_KINDS.join(', ')} 가운데 하나여야 해요`);
    const origin = item['origin'];
    if (typeof origin !== 'string' || !(LEDGER_ORIGINS as readonly string[]).includes(origin)) add('LEDGER_SHAPE', `${p}.origin`, `origin은 ${LEDGER_ORIGINS.join(', ')} 가운데 하나여야 해요`);
    const rights = item['rights'];
    if (typeof rights !== 'string' || !(LEDGER_RIGHTS as readonly string[]).includes(rights)) add('LEDGER_SHAPE', `${p}.rights`, `rights는 ${LEDGER_RIGHTS.join(', ')} 가운데 하나여야 해요`);
    for (const key of ['license', 'basis'] as const) if (!isText(item[key])) add('LEDGER_SHAPE', `${p}.${key}`, `${key}가 비어 있어요`);
    const checkedOn = item['checkedOn'];
    if (typeof checkedOn !== 'string' || !isLedgerDate(checkedOn)) add('LEDGER_SHAPE', `${p}.checkedOn`, '확인한 날(checkedOn)은 실제 있는 날의 YYYY-MM-DD여야 해요');
    for (const key of ['files', 'ids'] as const) {
      const v = item[key];
      if (v !== undefined && !(Array.isArray(v) && v.every(isText))) add('LEDGER_SHAPE', `${p}.${key}`, `${key}는 글자 배열이어야 해요`);
    }
    for (const key of ['version', 'copyright', 'licenseFile', 'licenseSha256', 'gate'] as const) {
      const v = item[key];
      if (v !== undefined && !isText(v)) add('LEDGER_SHAPE', `${p}.${key}`, `${key}는 비어 있지 않은 글자여야 해요`);
    }
    const sha = item['licenseSha256'];
    if (isText(sha) && !SHA_PATTERN.test(sha)) add('LEDGER_SHAPE', `${p}.licenseSha256`, 'sha256은 소문자 16진수 64자리여야 해요');
    const embedded = item['embedded'];
    if (embedded !== undefined) {
      if (!Array.isArray(embedded)) add('LEDGER_SHAPE', `${p}.embedded`, 'embedded는 배열이어야 해요');
      else
        embedded.forEach((e, i) => {
          if (!isObject(e) || !isText(e['module']) || !isText(e['sha256']) || !SHA_PATTERN.test(e['sha256'])) add('LEDGER_SHAPE', `${p}.embedded[${i}]`, '{ module, sha256(64자리) }여야 해요');
        });
    }
    if (issues.length > before) return;
    entries.push({
      assetId: id as string,
      kind: kind as LedgerKind,
      origin: origin as LedgerOrigin,
      rights: rights as LedgerRights,
      license: item['license'] as string,
      basis: item['basis'] as string,
      checkedOn: checkedOn as string,
      files: (item['files'] as string[] | undefined) ?? [],
      ids: (item['ids'] as string[] | undefined) ?? [],
      ...(isText(item['version']) ? { version: item['version'] } : {}),
      ...(isText(item['copyright']) ? { copyright: item['copyright'] } : {}),
      ...(isText(item['licenseFile']) ? { licenseFile: item['licenseFile'] } : {}),
      ...(isText(item['licenseSha256']) ? { licenseSha256: item['licenseSha256'] } : {}),
      ...(Array.isArray(embedded) ? { embedded: embedded as EmbeddedFont[] } : {}),
      ...(isText(item['gate']) ? { gate: item['gate'] } : {}),
    });
  });
  return { ledger: issues.length > 0 ? null : { schemaVersion: LEDGER_SCHEMA_VERSION, entries }, issues };
}

/** 항목 사이의 모순과, 대장이 사실과 어긋난 곳을 모두 찾는다 */
export function checkLedger(ledger: AssetLedger, facts: LedgerFacts): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string): void => {
    issues.push({ code, path, message });
  };
  const at = (e: LedgerEntry): string => `asset-ledger:${e.assetId}`;
  const publicSet = new Set(facts.publicFiles);

  // ① 항목 하나 안의 모순
  for (const e of ledger.entries) {
    const p = at(e);
    if (e.files.length + e.ids.length === 0) add('LEDGER_EMPTY', p, '무엇을 가리키는지(files나 ids)가 없어요');
    if (e.rights === 'own' && e.origin !== '자체 제작') add('LEDGER_RIGHTS', p, "rights가 own이면 만든 곳은 '자체 제작'이어야 해요");
    if (e.rights === 'licensed' && e.origin !== '외부') add('LEDGER_RIGHTS', p, "rights가 licensed이면 만든 곳은 '외부'여야 해요");
    if (e.origin === '외부' && e.rights === 'own') add('LEDGER_RIGHTS', p, "'외부' 것을 own으로 적을 수 없어요");
    if (e.rights === 'unconfirmed' && !e.gate) add('LEDGER_GATE', p, '권리가 미확인(unconfirmed)이면 공개 전에 어떻게 막는지(gate)를 적어야 해요');
    if (e.rights !== 'unconfirmed' && e.gate) add('LEDGER_GATE', p, 'gate는 권리가 미확인(unconfirmed)인 항목만 써요');
    if (e.kind === '라이브러리' && !e.version) add('LEDGER_RIGHTS', p, '라이브러리는 version을 적어야 해요');
    if (e.kind === '글꼴' && e.rights === 'licensed') {
      if (!e.licenseFile || !e.licenseSha256) add('LEDGER_RIGHTS', p, '라이선스를 확인한 글꼴은 원문 파일(licenseFile)과 그 sha256(licenseSha256)을 적어야 해요');
      if (!e.copyright) add('LEDGER_RIGHTS', p, '라이선스를 확인한 글꼴은 저작권 표기(copyright)를 적어야 해요');
      if (!e.embedded || e.embedded.length === 0) add('LEDGER_RIGHTS', p, '싣는 글꼴은 어느 글꼴 모듈의 바이트인지(embedded)를 적어야 해요');
    }
    if (e.kind === '라이브러리' && e.rights !== 'licensed') add('LEDGER_RIGHTS', p, '외부 라이브러리는 rights가 licensed여야 해요');
    // 배포물에 있는 파일과의 관계
    const shippedFiles = facts.publicFiles.filter((f) => entryCovers(e, f));
    if (e.rights === 'unconfirmed' && shippedFiles.length > 0) add('LEDGER_UNCONFIRMED_SHIPPED', p, `권리가 미확인인데 배포 파일 ${shippedFiles.length}개가 이 항목에 속해요(${shippedFiles[0]} …). 빌드에서 빠져야 해요`);
    if (e.rights === 'not-shipped' && shippedFiles.length > 0) add('LEDGER_UNCONFIRMED_SHIPPED', p, `배포물이 아니라고 적었는데 배포 파일 ${shippedFiles.length}개가 이 항목에 속해요(${shippedFiles[0]} …)`);
    // 가리키는 파일이 사라졌는가
    for (const g of e.files) {
      const re = globToRegExp(g);
      if (!facts.allFiles.some((f) => re.test(f))) add('LEDGER_STALE', p, `files의 '${g}'와 맞는 파일이 저장소에 없어요. 낡은 항목이면 지우세요`);
    }
    // 라이선스 원문 파일
    if (e.licenseFile) {
      const actual = facts.fileHashes[e.licenseFile];
      if (actual === undefined) add('LEDGER_LICENSE_TEXT', p, `라이선스 원문 파일 '${e.licenseFile}'이 없어요`);
      else if (e.licenseSha256 && actual !== e.licenseSha256) add('LEDGER_LICENSE_TEXT', p, `라이선스 원문 '${e.licenseFile}'이 대장에 적은 것과 달라요(sha256 불일치). 원문을 바꿨다면 라이선스를 다시 확인하고 대장을 고치세요`);
    }
  }

  // ② 저장소 안의 모든 그림·소리·글꼴 파일과 배포 파일이 대장에 있는가
  const uncovered = [...new Set([...facts.mediaFiles, ...facts.publicFiles])].filter((f) => !ledger.entries.some((e) => entryCovers(e, f))).sort();
  for (const f of uncovered) add('LEDGER_UNCOVERED', f, publicSet.has(f) ? '배포 파일인데 대장에 없어요(출처·권리를 먼저 적어야 해요)' : '그림·소리·글꼴 파일인데 대장에 없어요(출처·권리를 먼저 적어야 해요)');

  // ③ 외부 패키지: 운영 의존성과 라이브러리 항목이 1대1이고 버전과 라이선스가 같다
  const libs = ledger.entries.filter((e) => e.kind === '라이브러리');
  const libOf = new Map<string, LedgerEntry>();
  for (const e of libs)
    for (const name of e.ids) {
      if (libOf.has(name)) add('LEDGER_LIB', at(e), `패키지 '${name}'가 두 항목에 나와요`);
      libOf.set(name, e);
    }
  for (const pkg of facts.packages) {
    const e = libOf.get(pkg.name);
    if (!e) {
      add('LEDGER_LIB', `package:${pkg.name}`, `배포물에 들어가는 패키지 ${pkg.name} ${pkg.version}(${pkg.license})가 대장에 없어요`);
      continue;
    }
    if (e.version !== pkg.version) add('LEDGER_LIB', at(e), `${pkg.name}의 버전이 ${pkg.version}인데 대장에는 ${e.version ?? '(없음)'}이에요. 라이선스를 다시 확인하세요`);
    if (e.license !== pkg.license) add('LEDGER_LIB', at(e), `${pkg.name}의 라이선스가 ${pkg.license}인데 대장에는 ${e.license}이에요`);
  }
  for (const e of libs)
    for (const name of e.ids) if (!facts.packages.some((p) => p.name === name)) add('LEDGER_LIB', at(e), `패키지 '${name}'는 배포물에 들어가지 않아요. 낡은 항목이면 지우세요`);

  // ④ 글꼴: 빌드가 싣는 글꼴 바이트, 이름으로만 부르는 글꼴, 글꼴 규칙
  const fonts = ledger.entries.filter((e) => e.kind === '글꼴');
  const embeddedOf = new Map<string, { entry: LedgerEntry; sha256: string }>();
  for (const e of fonts)
    for (const em of e.embedded ?? []) {
      if (embeddedOf.has(em.module)) add('LEDGER_FONT', at(e), `글꼴 모듈 '${em.module}'가 두 항목에 나와요`);
      embeddedOf.set(em.module, { entry: e, sha256: em.sha256 });
    }
  for (const f of facts.embeddedFonts) {
    const rec = embeddedOf.get(f.module);
    if (!rec) add('LEDGER_FONT', `font:${f.module}`, `빌드에 글꼴 ${f.module}(sha256 ${f.sha256.slice(0, 12)}…)가 실려요. 대장에 라이선스를 적거나, 쓰지 않으면 싣지 않게 하세요`);
    else if (rec.sha256 !== f.sha256) add('LEDGER_FONT', at(rec.entry), `빌드에 실리는 글꼴 ${f.module}의 바이트가 대장과 달라요(라이브러리를 올렸나요?). 라이선스를 다시 확인하세요`);
  }
  for (const [module, rec] of embeddedOf) if (!facts.embeddedFonts.some((f) => f.module === module)) add('LEDGER_FONT', at(rec.entry), `글꼴 모듈 '${module}'는 이제 빌드에 실리지 않아요. 낡은 항목이면 지우세요`);
  const namedOk = new Set(fonts.filter((e) => e.rights === 'not-shipped').flatMap((e) => e.ids));
  for (const name of facts.namedFonts) if (!namedOk.has(name)) add('LEDGER_FONT', `font-name:${name}`, `글꼴 목록이 '${name}'을 부르는데 대장에 없어요(싣지 않는 글꼴이면 not-shipped 항목의 ids에 적으세요)`);
  for (const name of namedOk) if (!facts.namedFonts.includes(name)) add('LEDGER_FONT', `font-name:${name}`, `대장이 적은 글꼴 이름 '${name}'을 글꼴 목록이 부르지 않아요. 낡은 항목이면 지우세요`);
  for (const decl of facts.strayFontDeclarations) add('LEDGER_FONT', `font-declaration:${decl}`, `글꼴 목록(tokens.css의 --font-*, 글자 그림의 FONT) 밖에서 글꼴을 정해요: ${decl}`);
  if (facts.fontFaceCount > 0) add('LEDGER_FONT', 'font-face', `@font-face가 ${facts.fontFaceCount}개 있어요. 글꼴 파일을 싣는 것은 D-271을 바꾸는 결정이에요: 결정과 대장(라이선스 원문 포함)을 먼저 적고 이 검사를 고치세요`);

  // ⑤ 합성 음색: 소스의 음색 이름과 소리 항목이 1대1이다
  const sounds = ledger.entries.filter((e) => e.kind === '소리' && e.ids.length > 0);
  const soundIdOf = new Map<string, LedgerEntry>();
  for (const e of sounds)
    for (const id of e.ids) {
      if (soundIdOf.has(id)) add('LEDGER_SOUND', at(e), `음색 '${id}'가 두 항목에 나와요`);
      soundIdOf.set(id, e);
      if (!facts.timbreIds.includes(id)) add('LEDGER_SOUND', at(e), `음색 '${id}'는 소스에 없어요. 낡은 항목이면 지우세요`);
    }
  for (const id of facts.timbreIds) if (!soundIdOf.has(id)) add('LEDGER_SOUND', `timbre:${id}`, `소스에 음색 '${id}'가 있는데 대장에 없어요`);

  // ⑥ 소스·CSS·HTML이 배포물의 world/ 밖 그림·소리·글꼴 파일을 가리키지 않는다
  for (const ref of facts.strayAssetRefs) add('LEDGER_STRAY_REF', ref, '배포물의 world/ 밖 그림·소리·글꼴 파일을 가리켜요. 파일이면 대장에 먼저 적고, 외부 주소면 쓰지 마세요');

  return issues;
}

export function validateLedger(raw: unknown, facts: LedgerFacts): ContentIssue[] {
  const { ledger, issues } = parseLedger(raw);
  return ledger ? [...issues, ...checkLedger(ledger, facts)] : issues;
}

export interface LedgerSummary {
  total: number;
  byKind: Record<string, number>;
  byRights: Record<LedgerRights, number>;
  unconfirmed: Array<{ assetId: string; gate: string }>;
}

export function summarizeLedger(ledger: AssetLedger): LedgerSummary {
  const byKind: Record<string, number> = {};
  const byRights: Record<LedgerRights, number> = { own: 0, licensed: 0, unconfirmed: 0, 'not-shipped': 0 };
  const unconfirmed: Array<{ assetId: string; gate: string }> = [];
  for (const e of ledger.entries) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    byRights[e.rights] += 1;
    if (e.rights === 'unconfirmed') unconfirmed.push({ assetId: e.assetId, gate: e.gate ?? '' });
  }
  return { total: ledger.entries.length, byKind, byRights, unconfirmed };
}
