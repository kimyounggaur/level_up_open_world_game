// 8-2 문구 점검의 파일 쪽 도구: 화면에 나올 수 있는 한글 문구를 코드(src)와 콘텐츠(content)에서 모으고,
// 규칙(copy-rules.ts)에 대 보고, 사람이 읽을 검수표(마크다운)를 만든다. 단위 시험과 npm run copy가 같은 함수를 쓴다.
//
// 모으는 것: 한글이 한 글자라도 든 글자 상수(따옴표 글, 템플릿 글, 화면 JSX의 글). 주석은 모으지 않는다(문법 트리를 읽으므로).
// 못 잡는 것: 글자를 쪼개서 이어 붙이는 식으로 만든 문구, 한글이 없는 문구(키 이름 'M', 'L' 같은 것), 그림 안의 글자.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { checkCopy, COPY_RULES, sentences } from './copy-rules';
import type { CopyFinding } from './copy-rules';

export type CopySource = 'code' | 'content';

export interface CopyString {
  source: CopySource;
  /** 저장소 기준 경로 */
  file: string;
  /** 코드는 줄 번호, 콘텐츠는 0 */
  line: number;
  /** 어떤 자리의 글인가: jsx-text, attr:aria-label, string, template, error, log (코드) / 키 경로(콘텐츠) */
  role: string;
  text: string;
  /** screen=화면 층(ui, app, world, content)에서 온 글. support=그 밖(domain, audio, platform). 뒤쪽에는 개발자가 읽는 검증 메시지가 많이 섞여 있다 */
  surface: 'screen' | 'support';
}

export interface CheckedCopy extends CopyString {
  findings: CopyFinding[];
}

const HANGUL = /[가-힣]/;
const posix = (p: string): string => p.split(path.sep).join('/');
const surfaceOf = (file: string): 'screen' | 'support' => (/^(?:src\/(?:ui|app|world)\/|content\/)/.test(file) ? 'screen' : 'support');

function walkFiles(root: string, dir: string, accept: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  const walk = (d: string): void => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && accept(posix(path.relative(root, p)))) out.push(posix(path.relative(root, p)));
    }
  };
  walk(abs);
  return out.sort();
}

/** 템플릿 글의 자리표시자: 이름이나 속성 사슬(CREATION_NAME_MAX, slot.duration)은 그대로 보이고, 식(삼항, 호출, !)은 …로 가린다 */
const placeholder = (expr: string): string => (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expr.trim()) ? expr.trim() : '…');

/** 글자 상수가 어떤 자리에 놓였는가 */
function roleOf(node: ts.Node): string {
  const parent = node.parent;
  if (ts.isJsxAttribute(parent)) return `attr:${parent.name.getText()}`;
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && /Error$/.test(parent.expression.text)) return 'error';
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && ts.isIdentifier(parent.expression.expression) && parent.expression.expression.text === 'console') return 'log';
  return 'string';
}

/** 한 파일의 한글 문구. 속성 이름, 가져오기 경로, 형식 이름에 든 글자는 화면에 나오지 않으므로 뺀다 */
export function collectFromSource(file: string, text: string): CopyString[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, kind);
  const out: CopyString[] = [];
  const add = (node: ts.Node, role: string, value: string): void => {
    if (!HANGUL.test(value)) return;
    out.push({ source: 'code', file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, role, text: value, surface: surfaceOf(file) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isLiteralTypeNode(node) || ts.isTypeReferenceNode(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const p = node.parent;
      const isName = (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isEnumMember(p)) && p.name === node;
      if (!isName) add(node, roleOf(node), node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text];
      for (const span of node.templateSpans) parts.push(`{${placeholder(span.expression.getText(sf))}}`, span.literal.text);
      add(node, 'template', parts.join(''));
      for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (t) add(node, 'jsx-text', t);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** 콘텐츠 키 경로에서 변형 이름을 *로 바꿔 같은 자리끼리 묶는다 */
const normalizeKeyPath = (p: string): string => p.replace(/^variants\.[^.[]+/, 'variants.*');

/** 출처 기록(sourceRefs)은 개발자가 적은 메모라 화면에 나오지 않는다 */
const CONTENT_SKIP_KEYS = new Set(['sourceRefs']);

export function collectFromContent(file: string, json: unknown): CopyString[] {
  const out: CopyString[] = [];
  const visit = (v: unknown, keyPath: string): void => {
    if (typeof v === 'string') {
      if (HANGUL.test(v)) out.push({ source: 'content', file, line: 0, role: normalizeKeyPath(keyPath), text: v, surface: 'screen' });
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x, `${keyPath}[]`);
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (!CONTENT_SKIP_KEYS.has(k)) visit(x, keyPath === '' ? k : `${keyPath}.${k}`);
      }
    }
  };
  visit(json, '');
  return out;
}

/** 저장소 전체의 한글 문구: src의 .ts/.tsx(타입 선언 제외)와 content의 .json(sources 폴더 제외) */
export function collectCopy(root: string): CopyString[] {
  const out: CopyString[] = [];
  for (const rel of walkFiles(root, 'src', (r) => /\.tsx?$/.test(r) && !r.endsWith('.d.ts'))) {
    out.push(...collectFromSource(rel, fs.readFileSync(path.join(root, rel), 'utf-8')));
  }
  for (const rel of walkFiles(root, 'content', (r) => r.endsWith('.json') && !r.startsWith('content/sources/'))) {
    out.push(...collectFromContent(rel, JSON.parse(fs.readFileSync(path.join(root, rel), 'utf-8'))));
  }
  return out;
}

export function checkAll(strings: readonly CopyString[]): CheckedCopy[] {
  return strings.map((s) => ({ ...s, findings: checkCopy(s.text) }));
}

export interface CopySummary {
  total: number;
  bySource: Record<CopySource, number>;
  /** 규칙별로 걸린 문구의 수(전체) */
  byRule: Record<string, number>;
  /** 규칙별로 걸린 문구 가운데 화면 층(ui, app, world, content)의 수 */
  byRuleScreen: Record<string, number>;
  screenTotal: number;
  mustCount: number;
}

export function summarize(checked: readonly CheckedCopy[]): CopySummary {
  const byRule: Record<string, number> = Object.fromEntries(COPY_RULES.map((r) => [r.code, 0]));
  const byRuleScreen: Record<string, number> = Object.fromEntries(COPY_RULES.map((r) => [r.code, 0]));
  const bySource: Record<CopySource, number> = { code: 0, content: 0 };
  let mustCount = 0;
  let screenTotal = 0;
  for (const c of checked) {
    bySource[c.source] += 1;
    if (c.surface === 'screen') screenTotal += 1;
    for (const f of c.findings) {
      byRule[f.code] = (byRule[f.code] ?? 0) + 1;
      if (c.surface === 'screen') byRuleScreen[f.code] = (byRuleScreen[f.code] ?? 0) + 1;
      if (f.severity === 'must') mustCount += 1;
    }
  }
  return { total: checked.length, bySource, byRule, byRuleScreen, screenTotal, mustCount };
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** 사람이 읽는 문구 검수표(마크다운). 걸린 것을 맨 앞에 두고, 그 뒤에 파일별로 모든 문구를 적는다 */
export function buildDeck(checked: readonly CheckedCopy[], generatedOn: string): string {
  const sum = summarize(checked);
  const lines: string[] = [];
  lines.push('# 문구 검수표 (자동 생성)');
  lines.push('');
  lines.push(`만든 날: ${generatedOn}. 만든 도구: npm run copy -- --deck. 이 파일은 저장소에 두지 않고 검수할 때마다 새로 만든다.`);
  lines.push('');
  lines.push('설계서 7.6(한 문장에 한 가지, 음악 용어는 처음 나올 때 한 번 풀어 쓴다)과 W-9(사실만 말하기, 능력이나 나이를 추정하지 않는다)에 맞는지 사람이 본다.');
  lines.push('아래 자동 점검은 글자 모양만 본다. 말뜻, 용어를 처음 풀어 쓰는 자리, 읽기 수준(대상 이용자 D-3이 정해지면)은 사람이 판단한다.');
  lines.push('');
  lines.push('## 요약');
  lines.push('');
  lines.push(`- 한글 문구 ${sum.total}개 (코드 ${sum.bySource.code}, 콘텐츠 ${sum.bySource.content}). 화면 층(ui, app, world, content)은 ${sum.screenTotal}개, 나머지(domain, audio, platform)는 개발자가 읽는 검증 메시지가 많이 섞여 있다`);
  for (const r of COPY_RULES) lines.push(`- ${r.code} (${r.severity === 'must' ? '반드시 0' : '사람이 판단'}) ${r.label}: 전체 ${sum.byRule[r.code] ?? 0}개, 화면 층 ${sum.byRuleScreen[r.code] ?? 0}개`);
  lines.push('');
  for (const r of COPY_RULES) {
    // 화면 층이 먼저 오게 한다(사람이 먼저 볼 것)
    const hits = checked.filter((c) => c.findings.some((f) => f.code === r.code)).sort((a, b) => (a.surface === b.surface ? 0 : a.surface === 'screen' ? -1 : 1));
    if (hits.length === 0) continue;
    lines.push(`## 걸린 것: ${r.code} — ${r.label} (${hits.length}개)`);
    lines.push('');
    lines.push('| 층 | 자리 | 걸린 말 | 문구 |');
    lines.push('|---|---|---|---|');
    for (const h of hits) {
      const f = h.findings.find((x) => x.code === r.code)!;
      lines.push(`| ${h.surface === 'screen' ? '화면' : '그 밖'} | ${cell(h.line > 0 ? `${h.file}:${h.line}` : `${h.file} · ${h.role}`)} | ${cell(f.fragment)} | ${cell(h.text)} |`);
    }
    lines.push('');
  }
  lines.push('## 긴 문장의 수');
  lines.push('');
  const allSentences = checked.flatMap((c) => sentences(c.text));
  lines.push(`- 문장 ${allSentences.length}개, 가장 긴 문장 ${Math.max(0, ...allSentences.map((s) => [...s].length))}글자`);
  lines.push('');
  lines.push('## 모든 문구 (파일별)');
  lines.push('');
  const byFile = new Map<string, CheckedCopy[]>();
  for (const c of checked) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
  for (const [file, list] of [...byFile].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`### ${file} (${list.length}개)`);
    lines.push('');
    lines.push('| 줄·자리 | 문구 | 걸린 규칙 |');
    lines.push('|---|---|---|');
    for (const c of list) lines.push(`| ${cell(c.line > 0 ? `${c.line} ${c.role}` : c.role)} | ${cell(c.text)} | ${c.findings.map((f) => f.code).join(', ')} |`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
