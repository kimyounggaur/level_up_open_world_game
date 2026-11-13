#!/usr/bin/env node
// 의존 규칙 검사 (설계서 10.2). 사용법: node tools/check-deps.mjs [프로젝트 루트]
//  1. domain은 다른 폴더와 외부 패키지를 가져오지 않는다. 화면, 소리, 저장 장치, 시계를 직접 쓰지 않는다(W-3).
//  2. audio는 domain만 가져온다(소리 패키지 tone 제외).
//  3. world와 ui는 domain, audio, platform을 가져온다. 서로(world ↔ ui)는 직접 가져오지 않는다.
//  4. platform은 domain만 가져온다.
//  5. app(src/main.ts, src/app/**)은 모든 것을 가져올 수 있다(조립 지점).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = {
  domain: { internal: ['domain'], external: [] },
  audio: { internal: ['domain', 'audio'], external: ['tone'] },
  platform: { internal: ['domain', 'platform'], external: [] },
  world: { internal: ['domain', 'audio', 'platform', 'world'], external: ['phaser'] },
  ui: { internal: ['domain', 'audio', 'platform', 'ui'], external: ['preact', 'vexflow'] },
  app: { internal: '*', external: '*' },
};

// domain 안에서 쓰면 안 되는 전역(순수성). 주석은 지우고 검사한다.
const DOMAIN_FORBIDDEN_GLOBALS = [
  [/\bwindow\b/, 'window'],
  [/\bdocument\./, 'document'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/\bAudioContext\b/, 'AudioContext'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bperformance\.now\b/, 'performance.now'],
  [/\bDate\.now\b/, 'Date.now'],
  [/\bnew Date\(/, 'new Date()'],
  [/\bMath\.random\b/, 'Math.random'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'setTimeout/setInterval'],
];

const SRC_EXT = /\.(ts|tsx|mts|js|mjs)$/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SRC_EXT.test(name)) out.push(p);
  }
  return out;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function importSpecifiers(text) {
  const specs = [];
  const clean = stripComments(text);
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(clean))) specs.push(m[1]);
  }
  return specs;
}

function layerOf(srcRel) {
  const parts = srcRel.split(path.sep);
  // src 바로 아래의 파일(main.ts, env.d.ts 등)과 src/app/** 은 조립 지점(app)이다.
  if (parts.length === 1 || parts[0] === 'app') return 'app';
  return parts[0];
}

export function checkFile(root, file) {
  const srcDir = path.join(root, 'src');
  const rel = path.relative(srcDir, file);
  const layer = layerOf(rel);
  const problems = [];
  const text = fs.readFileSync(file, 'utf8');
  const rule = LAYERS[layer];
  if (!rule) {
    problems.push(`${rel}: 알 수 없는 폴더 '${layer}'. 10.2의 폴더(domain, audio, platform, world, ui, app) 안에 두세요.`);
    return problems;
  }
  if (rule.internal !== '*') {
    for (const spec of importSpecifiers(text)) {
      let target;
      if (spec.startsWith('.')) {
        target = path.relative(srcDir, path.resolve(path.dirname(file), spec));
      } else if (spec.startsWith('@/')) {
        target = spec.slice(2).split('/').join(path.sep);
      } else {
        const pkg = spec.startsWith('node:') ? spec : spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!rule.external.includes(pkg)) {
          problems.push(`${rel}: '${spec}'는 ${layer}에서 가져올 수 없는 외부 패키지입니다.`);
        }
        continue;
      }
      if (target.startsWith('..')) {
        problems.push(`${rel}: '${spec}'는 src 밖(콘텐츠, 도구 등)을 가져옵니다. ${layer}에서는 허용되지 않습니다.`);
        continue;
      }
      const targetLayer = layerOf(target);
      if (!rule.internal.includes(targetLayer)) {
        problems.push(`${rel}: ${layer}가 ${targetLayer}를 가져옵니다('${spec}'). 허용: ${rule.internal.join(', ')}.`);
      }
    }
  }
  if (layer === 'domain') {
    const clean = stripComments(text);
    for (const [re, name] of DOMAIN_FORBIDDEN_GLOBALS) {
      if (re.test(clean)) problems.push(`${rel}: domain에서 ${name}을(를) 쓸 수 없습니다(순수 계산만, W-3).`);
    }
  }
  return problems;
}

export function checkProject(root) {
  const files = walk(path.join(root, 'src'));
  return files.flatMap((f) => checkFile(root, f));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const problems = checkProject(root);
  if (problems.length) {
    console.error(`의존 규칙 위반 ${problems.length}건:`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`의존 규칙 검사 통과 (${walk(path.join(root, 'src')).length}개 파일)`);
}
