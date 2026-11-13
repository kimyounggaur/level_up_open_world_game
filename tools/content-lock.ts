// 8-6 내용 잠금 도구.
//   npm run lock:content   잠금(content/content-lock.json)을 지금 콘텐츠로 새로 쓴다. 이미 나간 판의 의미를 해치는 어긋남이 있으면 쓰지 않는다
//   npm run check:lock     잠금과 지금 콘텐츠가 맞는지 본다. 어긋나면 1로 끝난다(잠금이 없으면 알리기만 한다)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockWritable } from '../src/domain/contentlock';
import { buildLock, currentQuests, loadLockFile, validateLockDir, writeLock } from './content-lock-files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.slice(2).includes('--write');

const { lock, issues: shape } = loadLockFile(root);
if (shape.length > 0) {
  console.error('내용 잠금 파일을 읽을 수 없어요:');
  for (const i of shape) console.error(`  [${i.code}] ${i.path}: ${i.message}`);
  process.exit(1);
}
const problems = validateLockDir(root, { requireFile: false });

if (write) {
  if (!lockWritable(problems)) {
    console.error('잠금을 새로 쓰지 않았어요. 이미 나간 판의 의미를 해치는 어긋남이 있어요:');
    for (const i of problems) console.error(`  [${i.code}] ${i.path}: ${i.message}`);
    process.exit(1);
  }
  const next = buildLock(root, new Date().toISOString().slice(0, 10));
  writeLock(root, next);
  const n = Object.keys(next.quests).length;
  const added = Object.keys(next.quests).filter((id) => !lock || !(id in lock.quests)).length;
  const raised = Object.keys(next.quests).filter((id) => lock && lock.quests[id] && lock.quests[id]!.contentVersion !== next.quests[id]!.contentVersion).length;
  console.log(`내용 잠금을 썼어요: 과제 ${n}개(새 ${added}, 판이 오른 ${raised}). ${next.lockedOn}`);
} else if (!lock) {
  console.log(`내용 잠금이 아직 없어요(지금 과제 ${Object.keys(currentQuests(root)).length}개). 내보낼 내용이 정해지면 \`npm run lock:content\`로 만들어요.`);
} else if (problems.length > 0) {
  console.error(`내용 잠금과 어긋나요: ${problems.length}건`);
  for (const i of problems) console.error(`  [${i.code}] ${i.path}: ${i.message}`);
  process.exit(1);
} else {
  console.log(`내용 잠금이 지금 콘텐츠와 맞아요(과제 ${Object.keys(lock.quests).length}개, 잠근 날 ${lock.lockedOn}).`);
}
