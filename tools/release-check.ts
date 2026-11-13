// 8-5 공개 점검 도구.
//   npm run check:release   정식 공개(release) 빌드를 내보내도 되는지 기계가 볼 수 있는 조건을 점검한다. 막는 것이 있으면 1로 끝난다
// `npm run build:release`가 이 점검을 먼저 부른다. 통과해도 G2의 통과가 아니다(사람이 해야 하는 일을 늘 함께 적는다).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUMAN_RELEASE_STEPS, evaluateReleaseGate } from '../src/domain/release';
import { releaseFactsOf } from './release-facts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const facts = releaseFactsOf(root);
const gate = evaluateReleaseGate(facts);
console.log('정식 공개 점검(기계가 볼 수 있는 조건)');
console.log(`  공개 채널에서 열리는 과제 ${facts.openQuests}/${facts.questCount}개, 판본 ${facts.openVariants}/${facts.variantCount}개`);
console.log(`  권리가 미확인인 대장 항목 ${facts.unconfirmed.length}건`);
console.log(`  내용 잠금과 어긋남 ${facts.lockProblems.length}건`);
console.log(`  공개 채널에서 보이는 발견 요소가 가까이에 없는 막다른 길 끝 ${facts.bareDeadEnds.length}/${facts.deadEndCount}곳`);
console.log('');
if (gate.ok) {
  console.log('막는 것이 없어요. 아래는 이 점검이 대신하지 않는 일이고, G2의 통과는 이 점검이 말하지 않는다:');
} else {
  console.error(`공개 빌드를 막는 것: ${gate.blockers.length}건`);
  for (const b of gate.blockers) console.error(`  - ${b}`);
  console.error('');
  console.error('사람이 해야 하는 일(이 점검이 대신하지 않는다):');
}
for (const s of HUMAN_RELEASE_STEPS) (gate.ok ? console.log : console.error)(`  · ${s}`);
if (!gate.ok) process.exit(1);
