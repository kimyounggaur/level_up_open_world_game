import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// 0-3: 의존 규칙 검사 (설계서 10.2). 임시 프로젝트를 만들어 검사 도구를 실제로 실행한다.
const tool = path.resolve(__dirname, '../../tools/check-deps.mjs');

function run(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-'));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(root, 'src', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  const r = spawnSync('node', [tool, root], { encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('의존 규칙 검사', () => {
  it('domain에서 Phaser를 가져오면 실패한다', () => {
    const r = run({ 'domain/a.ts': `import Phaser from 'phaser';\nexport const x = Phaser;\n` });
    expect(r.code).toBe(1);
    expect(r.out).toContain('phaser');
  });

  it('domain에서 다른 폴더(world, ui, audio)를 가져오면 실패한다', () => {
    for (const dep of ['world/w', 'ui/u', 'audio/a', 'platform/p']) {
      const r = run({ 'domain/a.ts': `import { z } from '../${dep}';\nexport const x = z;\n`, [`${dep}.ts`]: 'export const z = 1;\n' });
      expect(r.code, dep).toBe(1);
    }
  });

  it('domain에서 시계, 난수, 화면, 저장소를 직접 쓰면 실패한다', () => {
    for (const code of ['Date.now()', 'performance.now()', 'Math.random()', 'window.innerWidth', 'localStorage.getItem("a")', 'new AudioContext()']) {
      const r = run({ 'domain/a.ts': `export const x = ${code};\n` });
      expect(r.code, code).toBe(1);
    }
  });

  it('주석 속의 단어는 위반으로 보지 않는다', () => {
    const r = run({ 'domain/a.ts': `// window, Date.now() 같은 것은 쓰지 않는다\n/* Math.random() */\nexport const x = 1;\n` });
    expect(r.code).toBe(0);
  });

  it('domain끼리의 상대 경로와 @/ 별칭은 허용된다', () => {
    const r = run({
      'domain/a.ts': `import { b } from './b';\nimport { c } from '@/domain/c';\nexport const x = b + c;\n`,
      'domain/b.ts': 'export const b = 1;\n',
      'domain/c.ts': 'export const c = 1;\n',
    });
    expect(r.code).toBe(0);
  });

  it('audio는 domain과 tone만 가져올 수 있다', () => {
    expect(run({ 'audio/a.ts': `import * as Tone from 'tone';\nimport { d } from '../domain/d';\nexport const x = [Tone, d];\n`, 'domain/d.ts': 'export const d = 1;\n' }).code).toBe(0);
    expect(run({ 'audio/a.ts': `import { u } from '../ui/u';\nexport const x = u;\n`, 'ui/u.ts': 'export const u = 1;\n' }).code).toBe(1);
    expect(run({ 'audio/a.ts': `import 'phaser';\n` }).code).toBe(1);
  });

  it('world와 ui는 서로를 직접 가져올 수 없다', () => {
    expect(run({ 'world/a.ts': `import { u } from '../ui/u';\nexport const x = u;\n`, 'ui/u.ts': 'export const u = 1;\n' }).code).toBe(1);
    expect(run({ 'ui/a.ts': `import { w } from '../world/w';\nexport const x = w;\n`, 'world/w.ts': 'export const w = 1;\n' }).code).toBe(1);
  });

  it('world는 phaser, ui는 preact와 vexflow를 쓸 수 있고 서로의 패키지는 쓸 수 없다', () => {
    expect(run({ 'world/a.ts': `import Phaser from 'phaser';\nexport const x = Phaser;\n` }).code).toBe(0);
    expect(run({ 'ui/a.tsx': `import { h } from 'preact';\nimport { Flow } from 'vexflow';\nexport const x = [h, Flow];\n` }).code).toBe(0);
    expect(run({ 'ui/a.ts': `import Phaser from 'phaser';\nexport const x = Phaser;\n` }).code).toBe(1);
    expect(run({ 'world/a.ts': `import { h } from 'preact';\nexport const x = h;\n` }).code).toBe(1);
  });

  it('src 밖(콘텐츠 파일 등)을 domain에서 가져오면 실패하고 app은 허용된다', () => {
    expect(run({ 'domain/a.ts': `import q from '../../content/q.json';\nexport const x = q;\n` }).code).toBe(1);
    expect(run({ 'app/a.ts': `import q from '../../content/q.json';\nimport Phaser from 'phaser';\nexport const x = [q, Phaser];\n` }).code).toBe(0);
  });

  it('node 내장 모듈은 src 어디에서도 가져올 수 없다(app 제외)', () => {
    expect(run({ 'platform/a.ts': `import fs from 'node:fs';\nexport const x = fs;\n` }).code).toBe(1);
  });

  it('이 프로젝트의 실제 src는 규칙을 지킨다', () => {
    const r = spawnSync('node', [tool, path.resolve(__dirname, '../..')], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
