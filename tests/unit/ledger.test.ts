// 8-1 출처·권리 대장(설계서 11.4, 12.11의 8-1 '미확인 0건').
// ① 검사기 자체: 형식, 항목 안의 모순, 사실과의 대조를 일부러 망가뜨려 잡는지 본다(가짜 사실 사용)
// ② 실제 저장소: 대장이 배포 파일·내장 글꼴·패키지·음색과 맞는다. 진짜 사실에 같은 망가뜨리기를 해서 잡는지도 본다
// ③ 고지 파일: 낡지 않았고, 라이브러리와 글꼴의 라이선스 원문을 그대로 담는다
// 이 시험은 권리를 확인해 주지 않는다. 대장에 적힌 것이 저장소의 사실과 어긋나지 않는지, 그리고 아직 사람이 확인하지 못한 것이 어디에 남았는지를 지킨다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkLedger, entryCovers, globToRegExp, isLedgerDate, parseLedger, summarizeLedger, validateLedger } from '@/domain/ledger';
import type { AssetLedger, LedgerFacts } from '@/domain/ledger';
import { NOTICES_FILE, buildNotices, collectFacts, embeddedFontsOf, fontNamesOf, listRepoFiles, loadLedger, loadLedgerRaw, productionPackages, strayAssetRefsOf, validateLedgerDir } from '../../tools/ledger-files';
import { contentRightsOf, rightsReportText } from '../../tools/ledger-report';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// ① 검사기

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

type Raw = { schemaVersion: number; entries: Array<Record<string, unknown>> };

const baseRaw = (): Raw => ({
  schemaVersion: 1,
  entries: [
    { assetId: 'img.world', kind: '그림', origin: '자체 제작', rights: 'own', license: '자체 제작', basis: '코드로 구웠다', checkedOn: '2026-11-13', files: ['public/world/*.webp'], ids: [] },
    { assetId: 'snd.tones', kind: '소리', origin: '자체 제작', rights: 'own', license: '자체 제작', basis: '합성', checkedOn: '2026-11-13', files: ['src/audio/instruments.ts'], ids: ['task'] },
    {
      assetId: 'font.bravura',
      kind: '글꼴',
      origin: '외부',
      rights: 'licensed',
      license: 'OFL-1.1',
      copyright: 'Copyright (c) Steinberg',
      basis: '원문 옮김',
      checkedOn: '2026-11-13',
      files: [],
      ids: ['Bravura'],
      licenseFile: 'content/sources/licenses/OFL-Bravura.txt',
      licenseSha256: SHA_B,
      embedded: [{ module: 'bravura', sha256: SHA_A }],
    },
    { assetId: 'font.names', kind: '글꼴', origin: '외부', rights: 'not-shipped', license: '해당 없음', basis: '이름만 부른다', checkedOn: '2026-11-13', files: [], ids: ['Noto Sans KR'] },
    { assetId: 'lib.preact', kind: '라이브러리', origin: '외부', rights: 'licensed', license: 'MIT', version: '10.0.0', basis: '운영 의존성', checkedOn: '2026-11-13', files: [], ids: ['preact'] },
    { assetId: 'img.test', kind: '그림', origin: '자체 제작', rights: 'not-shipped', license: '해당 없음', basis: '시험용', checkedOn: '2026-11-13', files: ['tests/fixtures/*.png'], ids: [] },
  ],
});

const baseFacts = (): LedgerFacts => ({
  allFiles: ['public/world/a.webp', 'public/world/b.webp', 'src/audio/instruments.ts', 'tests/fixtures/x.png', 'content/sources/licenses/OFL-Bravura.txt'],
  mediaFiles: ['public/world/a.webp', 'public/world/b.webp', 'tests/fixtures/x.png'],
  publicFiles: ['public/world/a.webp', 'public/world/b.webp'],
  packages: [{ name: 'preact', version: '10.0.0', license: 'MIT' }],
  embeddedFonts: [{ module: 'bravura', sha256: SHA_A }],
  namedFonts: ['Noto Sans KR'],
  strayFontDeclarations: [],
  fontFaceCount: 0,
  timbreIds: ['task'],
  fileHashes: { 'content/sources/licenses/OFL-Bravura.txt': SHA_B },
  strayAssetRefs: [],
});

const codes = (issues: Array<{ code: string }>): string[] => [...new Set(issues.map((i) => i.code))].sort();
const run = (mutate: (raw: Raw, facts: LedgerFacts) => void): string[] => {
  const raw = baseRaw();
  const facts = baseFacts();
  mutate(raw, facts);
  return codes(validateLedger(raw, facts));
};
const entry = (raw: Raw, id: string): Record<string, unknown> => raw.entries.find((e) => e['assetId'] === id)!;

describe('대장 검사기: 기본 모양', () => {
  it('모순 없는 대장과 사실은 문제가 없다', () => {
    expect(validateLedger(baseRaw(), baseFacts())).toEqual([]);
  });

  it('날짜는 달력에 있는 날이어야 한다', () => {
    expect(isLedgerDate('2026-11-13')).toBe(true);
    expect(isLedgerDate('2024-02-29')).toBe(true);
    expect(isLedgerDate('2026-02-29')).toBe(false);
    expect(isLedgerDate('2026-13-01')).toBe(false);
    expect(isLedgerDate('2026-00-10')).toBe(false);
    expect(isLedgerDate('2026-11-31')).toBe(false);
    expect(isLedgerDate('26-11-13')).toBe(false);
    expect(isLedgerDate('2026-1-3')).toBe(false);
  });

  it('경로 무늬: *는 한 폴더 안, **는 폴더를 건너뛴다, ?는 한 글자', () => {
    expect(globToRegExp('public/world/ground-*.webp').test('public/world/ground-0-1.webp')).toBe(true);
    expect(globToRegExp('public/world/ground-*.webp').test('public/world/sub/ground-0-1.webp')).toBe(false);
    expect(globToRegExp('public/world/ground-*.webp').test('public/world/ground-0-1.png')).toBe(false);
    expect(globToRegExp('docs/**/*.png').test('docs/a.png')).toBe(true);
    expect(globToRegExp('docs/**/*.png').test('docs/x/y/a.png')).toBe(true);
    expect(globToRegExp('docs/**').test('docs/x/y/a.png')).toBe(true);
    expect(globToRegExp('a?c.txt').test('abc.txt')).toBe(true);
    expect(globToRegExp('a?c.txt').test('a/c.txt')).toBe(false);
    // 점과 괄호는 글자 그대로다
    expect(globToRegExp('a.b(1).txt').test('a.b(1).txt')).toBe(true);
    expect(globToRegExp('a.b(1).txt').test('aXb(1).txt')).toBe(false);
    expect(entryCovers({ files: ['x/*.svg', 'y.png'] }, 'y.png')).toBe(true);
    expect(entryCovers({ files: ['x/*.svg'] }, 'x/y/z.svg')).toBe(false);
  });
});

describe('대장 검사기: 형식을 망가뜨리면 잡는다', () => {
  it('객체가 아니거나 schemaVersion이 다르거나 entries가 배열이 아니다', () => {
    expect(codes(parseLedger(null).issues)).toEqual(['LEDGER_SHAPE']);
    expect(codes(parseLedger([]).issues)).toEqual(['LEDGER_SHAPE']);
    expect(parseLedger({ schemaVersion: 2, entries: [] }).issues.length).toBe(1);
    expect(parseLedger({ schemaVersion: 1, entries: {} }).ledger).toBeNull();
  });

  it('필수 글자 필드가 비면 잡는다', () => {
    for (const key of ['license', 'basis', 'checkedOn', 'kind', 'origin', 'rights', 'assetId']) {
      expect(run((raw) => delete entry(raw, 'img.world')[key]), key).toContain('LEDGER_SHAPE');
    }
    expect(run((raw) => (entry(raw, 'img.world')['license'] = '   '))).toContain('LEDGER_SHAPE');
  });

  it('알 수 없는 필드(오타)를 잡는다', () => {
    expect(run((raw) => (entry(raw, 'img.world')['rigths'] = 'own'))).toContain('LEDGER_SHAPE');
  });

  it('종류, 만든 곳, 권리 상태는 정해진 값만 쓴다', () => {
    expect(run((raw) => (entry(raw, 'img.world')['kind'] = '영상'))).toContain('LEDGER_SHAPE');
    expect(run((raw) => (entry(raw, 'img.world')['origin'] = '남의 것'))).toContain('LEDGER_SHAPE');
    expect(run((raw) => (entry(raw, 'img.world')['rights'] = 'confirmed'))).toContain('LEDGER_SHAPE');
  });

  it('assetId는 소문자 점 표기이고 겹치지 않는다', () => {
    expect(run((raw) => (entry(raw, 'img.world')['assetId'] = 'Img World'))).toContain('LEDGER_SHAPE');
    expect(run((raw) => (entry(raw, 'img.world')['assetId'] = 'snd.tones'))).toContain('LEDGER_DUP');
  });

  it('확인한 날이 달력에 없으면 잡는다', () => {
    expect(run((raw) => (entry(raw, 'img.world')['checkedOn'] = '2026-02-30'))).toContain('LEDGER_SHAPE');
  });

  it('sha256과 embedded의 모양을 본다', () => {
    expect(run((raw) => (entry(raw, 'font.bravura')['licenseSha256'] = 'xyz'))).toContain('LEDGER_SHAPE');
    expect(run((raw) => (entry(raw, 'font.bravura')['embedded'] = [{ module: 'bravura', sha256: 'abc' }]))).toContain('LEDGER_SHAPE');
    expect(run((raw) => (entry(raw, 'font.bravura')['embedded'] = {}))).toContain('LEDGER_SHAPE');
  });

  it('files와 ids는 글자 배열이다', () => {
    expect(run((raw) => (entry(raw, 'img.world')['files'] = 'public/world/*.webp'))).toContain('LEDGER_SHAPE');
    expect(run((raw) => (entry(raw, 'snd.tones')['ids'] = [1]))).toContain('LEDGER_SHAPE');
  });
});

describe('대장 검사기: 항목 안의 모순을 잡는다', () => {
  it('아무것도 가리키지 않는 항목', () => {
    expect(run((raw) => {
      entry(raw, 'img.test')['files'] = [];
    })).toContain('LEDGER_EMPTY');
  });

  it("만든 곳과 권리 상태가 어긋난다: 외부인데 own, 자체 제작인데 licensed", () => {
    expect(run((raw) => (entry(raw, 'img.world')['origin'] = '외부'))).toContain('LEDGER_RIGHTS');
    expect(run((raw) => (entry(raw, 'font.bravura')['origin'] = '자체 제작'))).toContain('LEDGER_RIGHTS');
  });

  it('미확인은 공개 전에 막는 방법(gate)이 있어야 하고, 다른 상태에는 gate가 없다', () => {
    expect(run((raw) => (entry(raw, 'img.test')['rights'] = 'unconfirmed'))).toContain('LEDGER_GATE');
    expect(run((raw) => (entry(raw, 'img.world')['gate'] = '사람이 본다'))).toContain('LEDGER_GATE');
    expect(
      run((raw) => {
        entry(raw, 'img.test')['rights'] = 'unconfirmed';
        entry(raw, 'img.test')['gate'] = '사람이 본다';
      }),
    ).toEqual([]);
  });

  it('권리가 미확인인 항목의 파일이 배포물에 있으면 빌드에서 빠져야 한다(11.4)', () => {
    const issues = (() => {
      const raw = baseRaw();
      entry(raw, 'img.world')['rights'] = 'unconfirmed';
      entry(raw, 'img.world')['origin'] = '외부';
      entry(raw, 'img.world')['gate'] = '확인 전에는 올리지 않는다';
      return validateLedger(raw, baseFacts());
    })();
    expect(codes(issues)).toEqual(['LEDGER_UNCONFIRMED_SHIPPED']);
    expect(issues[0]!.message).toContain('빌드에서 빠져야');
  });

  it('배포물이 아니라고 적은 항목의 파일이 배포물에 있으면 잡는다', () => {
    expect(run((raw) => (entry(raw, 'img.test')['files'] = ['public/world/*.webp']))).toContain('LEDGER_UNCONFIRMED_SHIPPED');
  });

  it('라이선스를 확인한 글꼴은 원문 파일·해시·저작권 표기·내장 모듈을 적어야 한다', () => {
    for (const key of ['licenseFile', 'licenseSha256', 'copyright', 'embedded']) {
      expect(run((raw) => delete entry(raw, 'font.bravura')[key]), key).toContain('LEDGER_RIGHTS');
    }
  });

  it('라이브러리는 version이 있고 licensed여야 한다', () => {
    expect(run((raw) => delete entry(raw, 'lib.preact')['version'])).toContain('LEDGER_RIGHTS');
    expect(run((raw) => (entry(raw, 'lib.preact')['rights'] = 'not-shipped'))).toContain('LEDGER_RIGHTS');
  });
});

describe('대장 검사기: 사실과 어긋나면 잡는다', () => {
  it('배포 파일이 대장에 없다', () => {
    const issues = (() => {
      const facts = baseFacts();
      facts.publicFiles.push('public/world/new.png');
      facts.mediaFiles.push('public/world/new.png');
      facts.allFiles.push('public/world/new.png');
      return validateLedger(baseRaw(), facts);
    })();
    expect(codes(issues)).toEqual(['LEDGER_UNCOVERED']);
    expect(issues[0]!.path).toBe('public/world/new.png');
    expect(issues[0]!.message).toContain('배포 파일');
  });

  it('저장소 어디든 그림·소리·글꼴 파일이 대장에 없으면 잡는다(배포물이 아니어도)', () => {
    const issues = (() => {
      const facts = baseFacts();
      facts.mediaFiles.push('docs/new.mp3');
      facts.allFiles.push('docs/new.mp3');
      return validateLedger(baseRaw(), facts);
    })();
    expect(codes(issues)).toEqual(['LEDGER_UNCOVERED']);
  });

  it('대장이 가리키는 파일이 사라졌다', () => {
    expect(run((raw) => (entry(raw, 'img.world')['files'] = ['public/world/*.webp', 'public/gone/*.webp']))).toContain('LEDGER_STALE');
  });

  it('라이브러리: 대장에 없는 패키지, 버전이 바뀐 패키지, 라이선스가 바뀐 패키지, 빠진 패키지', () => {
    expect(run((_, facts) => facts.packages.push({ name: 'phaser', version: '4.0.0', license: 'MIT' }))).toContain('LEDGER_LIB');
    expect(run((_, facts) => (facts.packages[0]!.version = '10.0.1'))).toContain('LEDGER_LIB');
    expect(run((_, facts) => (facts.packages[0]!.license = 'GPL-3.0'))).toContain('LEDGER_LIB');
    expect(run((_, facts) => (facts.packages.length = 0))).toContain('LEDGER_LIB');
  });

  it('글꼴: 빌드가 새 글꼴을 싣는다, 바이트가 바뀌었다, 더는 싣지 않는다', () => {
    const added = (() => {
      const facts = baseFacts();
      facts.embeddedFonts.push({ module: 'petaluma', sha256: SHA_C });
      return validateLedger(baseRaw(), facts);
    })();
    expect(codes(added)).toEqual(['LEDGER_FONT']);
    expect(added[0]!.message).toContain('petaluma');
    expect(run((_, facts) => (facts.embeddedFonts[0]!.sha256 = SHA_C))).toContain('LEDGER_FONT');
    expect(run((_, facts) => (facts.embeddedFonts.length = 0))).toContain('LEDGER_FONT');
  });

  it('글꼴: 글꼴 목록이 대장에 없는 이름을 부른다, 대장의 이름을 더는 부르지 않는다', () => {
    expect(run((_, facts) => facts.namedFonts.push('Pretendard'))).toContain('LEDGER_FONT');
    expect(run((_, facts) => (facts.namedFonts.length = 0))).toContain('LEDGER_FONT');
  });

  it('글꼴: 목록 밖의 글꼴 선언과 @font-face를 잡는다', () => {
    expect(run((_, facts) => facts.strayFontDeclarations.push('src/ui/x.css: font-family Pretendard'))).toContain('LEDGER_FONT');
    expect(run((_, facts) => (facts.fontFaceCount = 1))).toContain('LEDGER_FONT');
  });

  it('라이선스 원문: 파일이 없다, 해시가 다르다', () => {
    expect(run((_, facts) => (facts.fileHashes = {}))).toContain('LEDGER_LICENSE_TEXT');
    expect(run((_, facts) => (facts.fileHashes['content/sources/licenses/OFL-Bravura.txt'] = SHA_C))).toContain('LEDGER_LICENSE_TEXT');
  });

  it('음색: 소스의 음색이 대장에 없다, 대장의 음색이 소스에 없다', () => {
    expect(run((_, facts) => facts.timbreIds.push('bell'))).toContain('LEDGER_SOUND');
    expect(run((_, facts) => (facts.timbreIds.length = 0))).toContain('LEDGER_SOUND');
  });

  it('배포물의 world/ 밖 그림·소리·글꼴 파일을 가리키는 소스를 잡는다', () => {
    expect(run((_, facts) => facts.strayAssetRefs.push('src/ui/a.tsx: https://cdn.example.com/x.woff2'))).toContain('LEDGER_STRAY_REF');
  });

  it('요약은 종류와 권리 상태를 센다', () => {
    const { ledger } = parseLedger(baseRaw());
    const s = summarizeLedger(ledger as AssetLedger);
    expect(s.total).toBe(6);
    expect(s.byRights).toEqual({ own: 2, licensed: 2, unconfirmed: 0, 'not-shipped': 2 });
    expect(s.byKind).toEqual({ 그림: 2, 소리: 1, 글꼴: 2, 라이브러리: 1 });
  });
});

// ---------------------------------------------------------------------------
// ② 실제 저장소

describe('실제 저장소의 대장(8-1)', () => {
  const raw = loadLedgerRaw(root);
  const facts = collectFacts(root, raw);
  const ledger = loadLedger(root);

  it('대장이 배포 파일, 내장 글꼴, 패키지, 음색, 글꼴 이름과 모두 맞는다', () => {
    expect(validateLedgerDir(root)).toEqual([]);
  });

  it('배포 파일은 모두 대장에 있다. 월드 그림 50장과 목록 2개와 고지 파일이다', () => {
    const pub = facts.publicFiles;
    expect(pub.filter((f) => f.endsWith('.webp')).length).toBe(50);
    expect(pub.filter((f) => f.endsWith('.json')).length).toBe(2);
    expect(pub).toContain(NOTICES_FILE);
    expect(pub.length).toBe(53);
    for (const f of pub) expect(ledger.entries.some((e) => entryCovers(e, f)), f).toBe(true);
  });

  it('저장소의 그림·소리·글꼴 파일은 배포물이 아니어도 모두 대장에 있다', () => {
    expect(facts.mediaFiles.length).toBeGreaterThan(300);
    for (const f of facts.mediaFiles) expect(ledger.entries.some((e) => entryCovers(e, f)), f).toBe(true);
  });

  it('악보 글꼴은 Bravura 묶음만 싣는다: Gonville·Petaluma 계열 글꼴이 빌드에 들어가지 않는다(8-4의 용량)', () => {
    expect(facts.embeddedFonts.map((f) => f.module)).toEqual(['academico', 'academicobold', 'bravura']);
    const imports = listRepoFiles(root)
      .filter((f) => f.startsWith('src/') && /\.tsx?$/.test(f))
      .flatMap((f) => [...fs.readFileSync(path.join(root, f), 'utf-8').matchAll(/from\s+'(vexflow[^']*)'/g)].map((m) => m[1]!));
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec, '기본 진입점은 글꼴 여섯 개를 모두 싣는다').not.toBe('vexflow');
  });

  it('VexFlow의 기본 진입점으로 되돌리면 대장이 알아챈다(글꼴 여섯 개)', () => {
    // 진입점 → 글꼴 읽기를 가짜 파일 목록으로 시험할 수는 없으니, 기본 진입점의 글꼴 모듈 목록을 패키지에서 직접 읽는다
    const entry = fs.readFileSync(path.join(root, 'node_modules/vexflow/build/esm/entry/vexflow.js'), 'utf-8');
    const modules = [...entry.matchAll(/from\s+'\.\.\/src\/fonts\/([a-z0-9]+)\.js'/g)].map((m) => m[1]!).sort();
    expect(modules).toEqual(['academico', 'academicobold', 'bravura', 'gonville', 'petaluma', 'petalumascript']);
    const mutated = { ...facts, embeddedFonts: [...facts.embeddedFonts, { module: 'gonville', sha256: SHA_C }, { module: 'petaluma', sha256: SHA_C }, { module: 'petalumascript', sha256: SHA_C }] };
    const issues = checkLedger(ledger, mutated).filter((i) => i.code === 'LEDGER_FONT');
    expect(issues.length).toBe(3);
  });

  it('운영 의존성 아홉 개(MIT 여덟, 0BSD 하나)가 모두 대장에 있다', () => {
    const pk = productionPackages(root);
    expect(pk.map((p) => p.name)).toEqual(['@babel/runtime', 'automation-events', 'eventemitter3', 'phaser', 'preact', 'standardized-audio-context', 'tone', 'tslib', 'vexflow']);
    expect(pk.filter((p) => p.license === 'MIT').length).toBe(8);
    expect(pk.filter((p) => p.license === '0BSD').length).toBe(1);
    for (const p of pk) {
      const e = ledger.entries.find((x) => x.kind === '라이브러리' && x.ids.includes(p.name));
      expect(e?.version, p.name).toBe(p.version);
      expect(e?.license, p.name).toBe(p.license);
    }
  });

  it('합성 음색 스무 개(과제·세계 15, 자연음 5)가 모두 대장에 있고 소리 파일은 배포물에 없다', () => {
    expect(facts.timbreIds.length).toBe(20);
    expect(facts.publicFiles.filter((f) => /\.(mp3|ogg|wav|m4a|flac|aac)$/i.test(f))).toEqual([]);
    expect(facts.strayAssetRefs).toEqual([]);
  });

  it('글꼴 파일은 싣지 않는다: @font-face 0개, 글꼴 이름은 목록 한 곳에서만 부른다(D-271)', () => {
    expect(facts.fontFaceCount).toBe(0);
    expect(facts.strayFontDeclarations).toEqual([]);
    expect(facts.namedFonts).toEqual(['Apple SD Gothic Neo', 'Bravura Text', 'Malgun Gothic', 'Noto Music', 'Noto Sans CJK KR', 'Noto Sans KR', 'Segoe UI Symbol']);
  });

  it('외부 주소를 부르는 코드가 없다(그림·소리·글꼴을 바깥에서 받아 오지 않는다)', () => {
    const offenders: string[] = [];
    for (const f of listRepoFiles(root).filter((x) => x.startsWith('src/') && /\.(tsx?|css)$/.test(x) && !x.startsWith('src/world/generated/'))) {
      const text = fs.readFileSync(path.join(root, f), 'utf-8');
      for (const m of text.matchAll(/(?:fetch|import)\s*\(\s*['"`]https?:|url\(\s*['"]?https?:|src=["']https?:|href=["']https?:/g)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('미확인 항목은 하나뿐이고(작곡 소리), 배포 파일이 아니며, 공개 전에 막는 방법이 적혀 있다', () => {
    const s = summarizeLedger(ledger);
    expect(s.unconfirmed.map((u) => u.assetId)).toEqual(['snd.music.world-parts']);
    const e = ledger.entries.find((x) => x.assetId === 'snd.music.world-parts')!;
    expect(facts.publicFiles.filter((f) => entryCovers(e, f))).toEqual([]);
    expect(e.gate).toContain('공개 전에 사람이');
    // 그림·글꼴·라이브러리·합성 음색은 미확인이 없다
    for (const x of ledger.entries.filter((y) => y.kind !== '소리' || y.ids.length > 0)) expect(x.rights, x.assetId).not.toBe('unconfirmed');
  });

  it('외부 글꼴의 라이선스 원문이 옮겨져 있고 해시가 맞는다', () => {
    for (const id of ['font.bravura', 'font.academico']) {
      const e = ledger.entries.find((x) => x.assetId === id)!;
      expect(e.license).toBe('SIL Open Font License 1.1');
      const text = fs.readFileSync(path.join(root, e.licenseFile!), 'utf-8');
      expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(text).toContain(e.copyright!.replace('Copyright © ', '').split(',')[0]!);
      expect(facts.fileHashes[e.licenseFile!]).toBe(e.licenseSha256);
    }
  });

  it('진짜 사실에 같은 망가뜨리기를 해도 잡는다', () => {
    const withFile = { ...facts, publicFiles: [...facts.publicFiles, 'public/world/stolen.png'], mediaFiles: [...facts.mediaFiles, 'public/world/stolen.png'], allFiles: [...facts.allFiles, 'public/world/stolen.png'] };
    expect(codes(checkLedger(ledger, withFile))).toEqual(['LEDGER_UNCOVERED']);
    const withoutEntry: AssetLedger = { ...ledger, entries: ledger.entries.filter((e) => e.assetId !== 'lib.tone') };
    expect(codes(checkLedger(withoutEntry, facts))).toEqual(['LEDGER_LIB']);
    const bumped = { ...facts, packages: facts.packages.map((p) => (p.name === 'phaser' ? { ...p, version: '9.9.9' } : p)) };
    expect(codes(checkLedger(ledger, bumped))).toEqual(['LEDGER_LIB']);
    const swapped = { ...facts, embeddedFonts: facts.embeddedFonts.map((f) => (f.module === 'bravura' ? { ...f, sha256: SHA_C } : f)) };
    expect(codes(checkLedger(ledger, swapped))).toEqual(['LEDGER_FONT']);
    const edited = { ...facts, fileHashes: { ...facts.fileHashes, 'content/sources/licenses/OFL-Bravura.txt': SHA_C } };
    expect(codes(checkLedger(ledger, edited))).toEqual(['LEDGER_LICENSE_TEXT']);
    const newFont = { ...facts, namedFonts: [...facts.namedFonts, 'Pretendard'] };
    expect(codes(checkLedger(ledger, newFont))).toEqual(['LEDGER_FONT']);
    const newTimbre = { ...facts, timbreIds: [...facts.timbreIds, 'organ'] };
    expect(codes(checkLedger(ledger, newTimbre))).toEqual(['LEDGER_SOUND']);
  });

  it('도구가 사실을 읽는 부분: 글꼴 이름, 글꼴 선언, 외부 파일 참조를 가짜 소스로 시험한다', () => {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env['TMPDIR'] ?? '/tmp'), 'ledger-'));
    const write = (rel: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), text);
    };
    write('src/ui/tokens.css', ":root {\n  --font-body: 'Noto Sans KR', system-ui, sans-serif;\n  --font-music: 'Noto Music', serif;\n}\nbody { font-family: var(--font-body); }\n");
    write('src/world/installations/palette.ts', 'export const FONT = "\'Noto Sans KR\', \'Malgun Gothic\', sans-serif";\n');
    write('src/ui/ok.css', '.a { font: 600 14px/1.4 var(--font-body); }\n.b { font: inherit; }\n');
    write('src/ui/bad.css', '.a { font-family: Pretendard, sans-serif; }\n.b { font: 12px Arial; }\n@font-face { font-family: X; src: url(x.woff2); }\n');
    write('src/ui/bad.ts', "const a = { fontFamily: 'Papyrus' };\nconst b = { fontFamily: FONT };\nconst u = 'https://cdn.example.com/f.woff2';\nconst w = 'world/overview.webp';\nconst d = 'data:image/svg+xml,x.svg';\n");
    write('index.html', '<link rel="icon" href="icon.png" />\n');
    write('public/world/overview.webp', 'x');
    try {
      const files = listRepoFiles(tmp);
      expect(fontNamesOf(tmp, files).named).toEqual(['Malgun Gothic', 'Noto Music', 'Noto Sans KR']);
      expect(fontNamesOf(tmp, files).stray).toEqual(['src/ui/bad.css: font 12px Arial', 'src/ui/bad.css: font-family Pretendard, sans-serif', 'src/ui/bad.css: font-family X', "src/ui/bad.ts: fontFamily 'Papyrus'"]);
      expect(strayAssetRefsOf(tmp, files, files.filter((f) => f.startsWith('public/')))).toEqual(['index.html: icon.png', 'src/ui/bad.css: x.woff2', 'src/ui/bad.ts: https://cdn.example.com/f.woff2']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('도구가 글꼴을 읽는 부분: 진입점이 실제로 싣는 글꼴 바이트를 읽는다(내려받은 글꼴 패키지와 같은 바이트다)', () => {
    const fonts = embeddedFontsOf(root, listRepoFiles(root));
    // 2026-11-13에 @vexflow-fonts/bravura 1.0.2(1.392), @vexflow-fonts/academico 1.0.1의 woff2와 비교해 같았던 해시
    expect(fonts).toEqual([
      { module: 'academico', sha256: '363caf009818b9cebc7a2644d96b5dc10a20d3b5e557afdb4fb1a9a53d57e329' },
      { module: 'academicobold', sha256: '575c2e30fcf7dd9363e49890644b2ed23b6b518c9866aadb5370d470473297b6' },
      { module: 'bravura', sha256: '5c25278c208ca455dc7c3c0c95d833e134aca6d740a023767af50d0dfa06ef82' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// ③ 고지 파일과 현황 보고

describe('제3자 고지 파일(8-1)', () => {
  const ledger = loadLedger(root);
  const text = buildNotices(root, ledger);

  it('고지 파일이 낡지 않았다(npm run build:notices로 다시 만든 것과 같다)', () => {
    expect(fs.readFileSync(path.join(root, NOTICES_FILE), 'utf-8')).toBe(text);
  });

  it('운영 의존성 아홉 개와 글꼴 둘의 저작권 표기와 라이선스 원문이 모두 들어 있다', () => {
    for (const name of productionPackages(root).map((p) => p.name)) {
      const dir = path.join(root, 'node_modules', name);
      const licenseName = fs.readdirSync(dir).find((n) => /^(LICENSE|LICENCE|COPYING)(\.(md|txt))?$/i.test(n))!;
      const original = fs.readFileSync(path.join(dir, licenseName), 'utf-8').replace(/\r\n/g, '\n').trim();
      expect(text.includes(original), name).toBe(true);
    }
    for (const f of ['OFL-Bravura.txt', 'OFL-Academico.txt']) {
      const original = fs.readFileSync(path.join(root, 'content/sources/licenses', f), 'utf-8').replace(/\r\n/g, '\n').trim();
      expect(text.includes(original), f).toBe(true);
    }
    expect(text).toContain('Reserved Font Name "Bravura"');
    expect(text).toContain('Reserved Font Name "Academico"');
  });

  it('고지 파일은 빌드에 실리는 것만 담는다: 개발용 도구(vite, vitest, sharp 등)나 싣지 않는 글꼴은 없다', () => {
    for (const name of ['vitest', 'playwright', 'sharp', 'typescript', 'Gonville', 'Petaluma', 'Noto Sans KR']) expect(text.includes(name), name).toBe(false);
  });
});

describe('권리 현황 보고(8-1)', () => {
  it('콘텐츠 쪽 숫자가 파일에서 온 것과 같고, 승인되지 않은 것이 공개 상태가 아니다', () => {
    const c = contentRightsOf(root);
    expect(c.quests).toBe(31);
    expect(Object.values(c.questAvailability).reduce((a, b) => a + b, 0)).toBe(c.quests);
    expect(Object.values(c.questRefRights).reduce((a, b) => a + b, 0)).toBe(c.questRefs);
    expect(Object.values(c.reviewStepStatus).reduce((a, b) => a + b, 0)).toBe(c.reviewSteps);
    expect(Object.values(c.discoveryRights).reduce((a, b) => a + b, 0)).toBe(c.discoveryItems);
    expect(Object.values(c.textbookRefRights).reduce((a, b) => a + b, 0)).toBe(c.textbookRefs);
    expect(Object.values(c.playRights).reduce((a, b) => a + b, 0)).toBe(c.playInstruments);
    // 권리가 확인되지 않은 출처 기록이 있는 과제는 공개 상태가 될 수 없다(11.2의 G2의 7과 같은 뜻)
    if ((c.questRefRights['unconfirmed'] ?? 0) > 0) expect(c.questAvailability['published'] ?? 0).toBe(0);
  });

  it('보고서가 미확인 건수를 한 줄로 모아 준다', () => {
    const report = rightsReportText(root);
    const c = contentRightsOf(root);
    const unconfirmed = (c.questRefRights['unconfirmed'] ?? 0) + (c.discoveryRights['unconfirmed'] ?? 0) + (c.textbookRefRights['unconfirmed'] ?? 0) + (c.playRights['unconfirmed'] ?? 0);
    expect(report).toContain(`콘텐츠 쪽 미확인 ${unconfirmed}건과 대장의 미확인 1건은 사람이 확인해야 한다`);
    expect(report).toContain('snd.music.world-parts');
    expect(report).toContain('권리를 확인해 주는 것이 아니다');
  });
});
