// 8-2 문구 점검 도구(설계서 7.6, W-9).
//   npm run copy                 화면에 나오는 한글 문구를 모아 규칙에 대 보고 요약과 걸린 것을 찍는다
//   npm run copy -- --deck 경로   사람이 읽는 문구 검수표(마크다운)를 그 경로에 만든다. 저장소 밖 경로를 권한다(검수할 때마다 새로 만든다)
//   npm run check:copy           반드시 0이어야 하는 규칙(칭찬·능력·나이를 말하는 말)이 걸리면 1로 끝난다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeck, checkAll, collectCopy, summarize } from './copy-files';
import { COPY_RULES } from './copy-rules';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checked = checkAll(collectCopy(root));
const sum = summarize(checked);

const deckAt = args.indexOf('--deck');
if (deckAt >= 0) {
  const target = args[deckAt + 1];
  if (!target) {
    console.error('--deck 다음에 파일 경로를 적어 주세요.');
    process.exit(2);
  }
  const text = buildDeck(checked, new Date().toISOString().slice(0, 10));
  fs.writeFileSync(path.resolve(target), text);
  console.log(`문구 검수표를 만들었어요: ${path.resolve(target)} (한글 문구 ${sum.total}개, ${text.length}자)`);
} else if (args.includes('--check')) {
  const musts = checked.flatMap((c) => c.findings.filter((f) => f.severity === 'must').map((f) => ({ c, f })));
  if (musts.length > 0) {
    console.error(`문구 점검 실패: 반드시 0이어야 하는 규칙에 ${musts.length}건 걸렸어요.`);
    for (const { c, f } of musts) console.error(`  [${f.code}] ${c.line > 0 ? `${c.file}:${c.line}` : `${c.file} · ${c.role}`} "${f.fragment}" ← ${c.text.slice(0, 60)}`);
    process.exit(1);
  }
  console.log(`문구 점검 통과(한글 문구 ${sum.total}개에서 칭찬·능력·나이를 말하는 말 0건).`);
} else {
  console.log(`한글 문구 ${sum.total}개 (코드 ${sum.bySource.code}, 콘텐츠 ${sum.bySource.content}; 화면 층 ${sum.screenTotal}개)`);
  for (const r of COPY_RULES) console.log(`  ${r.code.padEnd(15)} ${r.severity === 'must' ? '반드시 0 ' : '사람 판단'} 전체 ${String(sum.byRule[r.code] ?? 0).padStart(4)}개 / 화면 층 ${String(sum.byRuleScreen[r.code] ?? 0).padStart(3)}개  ${r.label}`);
  for (const r of COPY_RULES.filter((x) => x.severity === 'must')) {
    for (const c of checked.filter((x) => x.findings.some((f) => f.code === r.code))) {
      console.log(`  ! [${r.code}] ${c.line > 0 ? `${c.file}:${c.line}` : `${c.file} · ${c.role}`} ← ${c.text.slice(0, 60)}`);
    }
  }
}
