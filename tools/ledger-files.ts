// 8-1 출처·권리 대장의 파일 쪽 도구: 저장소와 빌드 입력에서 사실(LedgerFacts)을 읽어 오고, 대장과 맞춰 보고, 고지 파일을 만든다.
// 빌드 도구(validate-content), 고지 파일 도구(ledger.ts), 단위 테스트가 같은 함수를 쓴다. 판단은 src/domain/ledger.ts가 한다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NATURE_TIMBRES, TIMBRES } from '../src/audio/instruments';
import type { ContentIssue } from '../src/domain/content';
import { entryCovers, parseLedger, validateLedger } from '../src/domain/ledger';
import type { AssetLedger, EmbeddedFont, LedgerEntry, LedgerFacts } from '../src/domain/ledger';

export const LEDGER_FILE = 'content/sources/asset-ledger.json';
export const NOTICES_FILE = 'public/THIRD-PARTY-NOTICES.txt';

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|oga|wav|m4a|aac|flac|mp4|webm|woff2?|ttf|otf)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-release', '.git']);
/** 글꼴 목록에서 이름이 아니라 '계열'을 가리키는 낱말 */
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', 'inherit', 'initial', 'unset']);

const sha256 = (buf: Buffer | string): string => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p: string): string => p.split(path.sep).join('/');

/** 저장소의 모든 파일(node_modules, dist, dist-release, .git은 뺀다). 저장소 기준 경로를 정렬해서 준다 */
export function listRepoFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name));
      } else if (ent.isFile()) {
        out.push(posix(path.relative(root, path.join(dir, ent.name))));
      }
    }
  };
  walk(root);
  return out.sort();
}

const readText = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');

/** package-lock.json에서 dev가 아닌 패키지(= 배포물에 들어가는 외부 패키지)를 읽는다 */
export function productionPackages(root: string): Array<{ name: string; version: string; license: string }> {
  const lock = JSON.parse(readText(root, 'package-lock.json')) as { packages: Record<string, { version?: string; license?: string; dev?: boolean }> };
  const out: Array<{ name: string; version: string; license: string }> = [];
  for (const [key, v] of Object.entries(lock.packages)) {
    if (key === '' || v.dev) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.push({ name, version: v.version ?? '', license: v.license ?? '' });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** src 안의 모든 .ts .tsx .css 파일(생성 파일 제외) */
function sourceFiles(files: string[]): string[] {
  return files.filter((f) => f.startsWith('src/') && /\.(ts|tsx|css)$/.test(f) && !f.startsWith('src/world/generated/'));
}

/**
 * 악보 라이브러리가 빌드에 싣는 글꼴. src가 가져오는 vexflow 진입점(예: 'vexflow/bravura')을 패키지 설명(exports)으로 찾아,
 * 그 진입점이 불러오는 글꼴 모듈의 바이트를 읽는다. 기본 진입점('vexflow')은 글꼴 여섯 개를 모두 싣는다.
 */
export function embeddedFontsOf(root: string, files: string[]): EmbeddedFont[] {
  const specifiers = new Set<string>();
  for (const f of sourceFiles(files).filter((x) => /\.tsx?$/.test(x))) {
    for (const m of readText(root, f).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](vexflow(?:\/[a-z0-9-]+)?)['"]/g)) specifiers.add(m[1]!);
  }
  const pkgDir = path.join(root, 'node_modules', 'vexflow');
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { exports: Record<string, { import: string }> };
  const modules = new Set<string>();
  for (const spec of specifiers) {
    const sub = spec === 'vexflow' ? '.' : `./${spec.slice('vexflow/'.length)}`;
    const entry = pkg.exports[sub]?.import;
    if (!entry) throw new Error(`vexflow의 진입점 '${spec}'를 패키지 설명에서 찾지 못했어요`);
    const entryText = fs.readFileSync(path.join(pkgDir, entry), 'utf-8');
    for (const m of entryText.matchAll(/from\s+'\.\.\/src\/fonts\/([a-z0-9]+)\.js'/g)) modules.add(m[1]!);
  }
  const out: EmbeddedFont[] = [];
  for (const module of [...modules].sort()) {
    const text = fs.readFileSync(path.join(pkgDir, 'build', 'esm', 'src', 'fonts', `${module}.js`), 'utf-8');
    const b64 = /base64,([A-Za-z0-9+/=]+)/.exec(text)?.[1];
    if (!b64) throw new Error(`vexflow의 글꼴 모듈 '${module}'에서 글꼴 바이트를 읽지 못했어요`);
    out.push({ module, sha256: sha256(Buffer.from(b64, 'base64')) });
  }
  return out;
}

const splitFamilies = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s.length > 0);

/** 글꼴 목록(tokens.css의 --font-* 와 글자 그림의 FONT)이 부르는 이름과, 그 밖에서 글꼴을 정하는 선언 */
export function fontNamesOf(root: string, files: string[]): { named: string[]; stray: string[] } {
  const named = new Set<string>();
  const stray: string[] = [];
  const tokens = readText(root, 'src/ui/tokens.css');
  for (const m of tokens.matchAll(/^\s*--font-[a-z-]+:\s*([^;]+);/gm)) for (const fam of splitFamilies(m[1]!)) if (!GENERIC_FAMILIES.has(fam)) named.add(fam);
  const palette = /export const FONT\s*=\s*(["'])(.*?)\1;/.exec(readText(root, 'src/world/installations/palette.ts'));
  if (!palette) throw new Error('src/world/installations/palette.ts에서 FONT를 읽지 못했어요');
  for (const fam of splitFamilies(palette[2]!)) if (!GENERIC_FAMILIES.has(fam)) named.add(fam);
  const allowed = (v: string): boolean => /^var\(--font-[a-z-]+\)$/.test(v) || v === 'FONT' || v === 'inherit';
  for (const f of sourceFiles(files)) {
    const text = readText(root, f);
    for (const m of text.matchAll(/font-family:\s*([^;}\n]+)/g)) if (!allowed(m[1]!.trim())) stray.push(`${f}: font-family ${m[1]!.trim()}`);
    for (const m of text.matchAll(/fontFamily:\s*([A-Za-z_][\w.]*|'[^']*'|"[^"]*")/g)) if (!allowed(m[1]!.trim())) stray.push(`${f}: fontFamily ${m[1]!.trim()}`);
    // font 줄임 표기는 글꼴 목록 변수를 쓰거나 inherit이어야 한다
    for (const m of text.matchAll(/(?:^|[\s;{])font:\s*([^;}\n]+)/g)) {
      const v = m[1]!.trim();
      if (!v.includes('var(--font-') && v !== 'inherit') stray.push(`${f}: font ${v}`);
    }
  }
  return { named: [...named].sort(), stray: stray.sort() };
}

/** Local runtime images must exist and be covered by the provenance ledger.
 * Legacy world/ references retain their existing rules. External URLs and
 * missing literal remaster filenames remain errors. */
export function strayAssetRefsOf(root: string, files: string[], publicFiles: string[], ledger?: AssetLedger): string[] {
  const re = /['"`(]([^'"`()\s]*\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|oga|wav|m4a|aac|flac|mp4|webm|woff2?|ttf|otf))['"`)?#]/g;
  const inWorld = new Set(publicFiles.filter((f) => f.startsWith('public/world/')).map((f) => f.slice('public/'.length)));
  const remasterFiles = publicFiles.filter((f) => f.startsWith('public/assets/remaster/') && ledger?.entries.some((e) => e.rights === 'own' && entryCovers(e, f))).map((f) => f.slice('public/'.length));
  const remasterRefExists = (ref: string): boolean => {
    if (!ref.startsWith('assets/remaster/')) return false;
    const expression = ref.split(/\$\{[^}]+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+');
    return remasterFiles.some((f) => new RegExp(`^${expression}$`).test(f));
  };
  const out: string[] = [];
  for (const f of [...sourceFiles(files), 'index.html']) {
    const text = readText(root, f);
    for (const m of text.matchAll(re)) {
      const ref = m[1]!.replace(/^\.?\//, '');
      if (ref.startsWith('data:')) continue;
      if (ref.startsWith('world/') && (ref.includes('${') || inWorld.has(ref))) continue;
      if (inWorld.has(`world/${ref}`)) continue;
      if (remasterRefExists(ref)) continue;
      out.push(`${f}: ${m[1]}`);
    }
  }
  return out.sort();
}

export function collectFacts(root: string, ledgerRaw: unknown): LedgerFacts {
  const allFiles = listRepoFiles(root);
  const publicFiles = allFiles.filter((f) => f.startsWith('public/'));
  const fonts = fontNamesOf(root, allFiles);
  let fontFaceCount = 0;
  // 검사 규칙을 적은 src/domain/ledger.ts는 글자만 쓰고 규칙을 두지 않으니 센 것에서 뺀다
  for (const f of [...sourceFiles(allFiles), 'index.html']) if (f !== 'src/domain/ledger.ts') fontFaceCount += (readText(root, f).match(/@font-face/g) ?? []).length;
  // 대장이 가리키는 라이선스 원문 파일의 해시
  const fileHashes: Record<string, string> = {};
  const parsed = parseLedger(ledgerRaw).ledger;
  for (const e of parsed?.entries ?? []) {
    if (e.licenseFile && fs.existsSync(path.join(root, e.licenseFile))) fileHashes[e.licenseFile] = sha256(fs.readFileSync(path.join(root, e.licenseFile)));
  }
  return {
    allFiles,
    mediaFiles: allFiles.filter((f) => MEDIA_EXT.test(f)),
    publicFiles,
    packages: productionPackages(root),
    embeddedFonts: embeddedFontsOf(root, allFiles),
    namedFonts: fonts.named,
    strayFontDeclarations: fonts.stray,
    fontFaceCount,
    timbreIds: [...Object.keys(TIMBRES), ...Object.keys(NATURE_TIMBRES)].sort(),
    fileHashes,
    strayAssetRefs: strayAssetRefsOf(root, allFiles, publicFiles, parsed ?? undefined),
  };
}

export function loadLedgerRaw(root: string): unknown {
  return JSON.parse(readText(root, LEDGER_FILE));
}

export function loadLedger(root: string): AssetLedger {
  const { ledger, issues } = parseLedger(loadLedgerRaw(root));
  if (!ledger) throw new Error(`대장을 읽지 못했어요: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
  return ledger;
}

/** 대장을 사실과 맞춰 본 문제 목록. 비어 있으면 통과 */
export function validateLedgerDir(root: string): ContentIssue[] {
  if (!fs.existsSync(path.join(root, LEDGER_FILE))) return [{ code: 'LEDGER_MISSING', path: LEDGER_FILE, message: '출처·권리 대장이 없어요' }];
  let raw: unknown;
  try {
    raw = loadLedgerRaw(root);
  } catch (err) {
    return [{ code: 'JSON', path: LEDGER_FILE, message: `JSON을 읽을 수 없어요: ${(err as Error).message}` }];
  }
  const issues = validateLedger(raw, collectFacts(root, raw));
  // 고지 파일은 대장과 설치된 패키지에서 만든 것과 같아야 한다(낡으면 배포물의 고지가 틀린다)
  if (issues.length === 0) {
    const file = path.join(root, NOTICES_FILE);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== buildNotices(root, loadLedger(root))) {
      issues.push({ code: 'LEDGER_NOTICES', path: NOTICES_FILE, message: '고지 파일이 대장이나 설치된 패키지와 달라요. npm run build:notices로 다시 만드세요' });
    }
  }
  return issues;
}

const licenseFileOf = (root: string, name: string): string => {
  const dir = path.join(root, 'node_modules', name);
  const hit = fs
    .readdirSync(dir)
    .filter((n) => /^(LICENSE|LICENCE|COPYING)(\.(md|txt))?$/i.test(n))
    .sort()[0];
  if (!hit) throw new Error(`패키지 ${name}에 라이선스 파일이 없어요`);
  return path.join('node_modules', name, hit);
};

/** 제3자 소프트웨어와 글꼴의 고지 파일 본문. 원문은 받은 그대로 옮기고(줄바꿈만 LF로), 차례는 이름순이다 */
export function buildNotices(root: string, ledger: AssetLedger): string {
  const lf = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
  const out: string[] = [
    '음악 마을 (가칭) · 레벨업 음악이론',
    '제3자 소프트웨어와 글꼴의 고지',
    '',
    '이 앱에는 아래 소프트웨어와 글꼴이 들어 있습니다. 각 저작권 표기와 라이선스 원문은 받은 그대로 옮겼습니다.',
    '(npm run build:notices가 만든 파일입니다. 직접 고치지 마세요.)',
    '',
  ];
  const libs = ledger.entries.filter((e) => e.kind === '라이브러리').flatMap((e) => e.ids.map((name) => ({ name, entry: e }))).sort((a, b) => (a.name < b.name ? -1 : 1));
  const fonts = ledger.entries.filter((e) => e.kind === '글꼴' && e.licenseFile).sort((a, b) => (a.assetId < b.assetId ? -1 : 1));
  const section = (title: string, body: string): void => {
    out.push('='.repeat(72), title, '='.repeat(72), '', lf(body), '');
  };
  for (const { name, entry } of libs) section(`${name} ${entry.version ?? ''} — ${entry.license}`.trim(), fs.readFileSync(path.join(root, licenseFileOf(root, name)), 'utf-8'));
  for (const e of fonts as LedgerEntry[]) section(`글꼴 ${e.ids.join(', ')} ${e.version ?? ''} — ${e.license}`.replace(/\s+/g, ' ').trim(), fs.readFileSync(path.join(root, e.licenseFile!), 'utf-8'));
  return out.join('\n').replace(/\n+$/, '\n');
}
