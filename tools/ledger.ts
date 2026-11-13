// 8-1 출처·권리 대장 도구.
//   npm run ledger          대장과 콘텐츠의 권리 현황을 찍는다
//   npm run build:notices   public/THIRD-PARTY-NOTICES.txt(제3자 소프트웨어와 글꼴의 고지)를 만든다
//   npm run check:notices   대장 검사와 함께, 고지 파일이 낡았으면 1로 끝난다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTICES_FILE, buildNotices, loadLedger, validateLedgerDir } from './ledger-files';
import { rightsReportText } from './ledger-report';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.includes('--write')) {
  const text = buildNotices(root, loadLedger(root));
  fs.writeFileSync(path.join(root, NOTICES_FILE), text);
  console.log(`${NOTICES_FILE}를 만들었어요(${text.length}자).`);
} else if (args.includes('--check')) {
  // 대장 검사는 고지 파일이 낡았는지도 본다(validateLedgerDir)
  const problems = validateLedgerDir(root).map((i) => `[${i.code}] ${i.path}: ${i.message}`);
  if (problems.length > 0) {
    console.error(`출처·권리 점검 실패: ${problems.length}건`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('출처·권리 점검 통과(대장과 배포 파일·글꼴·패키지·음색이 맞고 고지 파일이 새것이다).');
} else {
  process.stdout.write(rightsReportText(root));
}
