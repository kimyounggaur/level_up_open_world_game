// 빌드 전에 content/ 전체를 검사한다. 하나라도 틀리면 종료 코드 1로 빌드를 멈춘다(설계서 10.4).
//  · 형식과 필수 필드  · id 중복, 과제와 설치물 사이의 참조  · 마디 길이의 합이 박자표와 같은가
//  · 음이름·옥타브·변화와 MIDI 번호가 일치하는가  · 공개 상태인데 검수나 권리가 미확인인 항목이 있는가
//  · 그림·소리·글꼴·외부 패키지가 출처·권리 대장에 모두 있는가(8-1)
//  · 내용 잠금(content/content-lock.json)이 있으면, 정답 기준이 바뀐 과제의 contentVersion을 올렸는가(8-6)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, validateContentDir } from './content-loader';
import { loadLockFile, validateLockDir } from './content-lock-files';
import { validateLedgerDir } from './ledger-files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 출처·권리 대장(8-1, 11.4): 배포 파일·내장 글꼴·패키지·음색이 대장과 맞는가
const issues = [...validateContentDir(root), ...validateLedgerDir(root)];
// 내용 잠금(8-6, 12.11): 이전 기록을 새 정답 기준으로 다시 계산하지 않으므로, 정답 기준을 고치면 판을 올려야 한다.
// 잠금 파일이 없으면 이 검사는 하지 않는다(정식 공개 점검 `npm run check:release`는 파일을 요구한다). 내용이 이미 틀렸으면 잠금과 견주지 않는다
if (issues.length === 0) issues.push(...validateLockDir(root, { requireFile: false }));
if (issues.length > 0) {
  console.error(`콘텐츠 검사 실패: ${issues.length}건`);
  for (const i of issues) console.error(`  [${i.code}] ${i.path}: ${i.message}`);
  process.exit(1);
}
const loaded = loadContent(root);
const discoveryCount = loaded.discoveries.reduce((n, f) => n + ((f.data as { items?: unknown[] }).items?.length ?? 0), 0);
const playCount = loaded.discoveries.reduce((n, f) => n + ((f.data as { playInstruments?: unknown[] }).playInstruments?.length ?? 0), 0);
const lock = loadLockFile(root).lock;
console.log(`콘텐츠 검사 통과: 과제 ${loaded.quests.length}개, 설치물 ${loaded.installations.length}개, 지역 ${loaded.regions.length}개, 발견 요소 ${discoveryCount + playCount}개, 내용 잠금 ${lock ? `${Object.keys(lock.quests).length}개와 맞음` : '없음'}(소리 조각과 쪽지 ${discoveryCount}, 놀이 악기 ${playCount})`);
