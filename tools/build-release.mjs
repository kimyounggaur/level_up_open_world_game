// 8-5 공개 빌드: 공개 점검(check:release)을 통과해야 정식 공개(release) 채널로 dist-release/에 짓는다.
//   npm run build:release
// 순서: 공개 점검(내용 잠금 포함) → 콘텐츠 검사 → 타입 검사 → 정식 공개 채널 빌드. 하나라도 틀리면 거기서 멈춘다.
// 환경 변수를 정하는 글자가 운영체제마다 달라서 노드로 부른다. 미리보기(preview) 빌드는 `npm run build`(dist/)다.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, env = {}) {
  const r = spawnSync(npm, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\n공개 빌드를 멈췄어요: \`npm ${args.join(' ')}\`가 실패했어요.`);
    process.exit(r.status ?? 1);
  }
}

run(['run', 'check:release']);
run(['run', 'validate']);
run(['run', 'typecheck']);
run(['exec', '--', 'vite', 'build', '--outDir', 'dist-release', '--emptyOutDir'], { VITE_RELEASE_CHANNEL: 'release' });
console.log('\ndist-release/에 정식 공개(release) 채널 빌드를 만들었어요. 올리는 방법과 머리말은 docs/hosting.md를 봐요.');
