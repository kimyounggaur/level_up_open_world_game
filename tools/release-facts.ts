// 8-5 공개 점검의 사실 모으기: 과제·판본·대장·내용 잠금에서 공개 점검(src/domain/release.ts)이 보는 값을 읽는다.
import { stateOf } from '../src/domain/catalog';
import type { QuestDefinition } from '../src/domain/content';
import { deadEndsOf, parseDiscoveryFile } from '../src/domain/discovery';
import type { DiscoveryFile } from '../src/domain/discovery';
import { summarizeLedger } from '../src/domain/ledger';
import { bareDeadEnds } from '../src/domain/release';
import type { ReleaseFacts } from '../src/domain/release';
import { discoveryWorld, loadContent } from './content-loader';
import { validateLockDir } from './content-lock-files';
import { loadLedger } from './ledger-files';
import { loadRegionDefs } from './world-files';

/** 공개 채널에서 열리는 과제와 판본을 세는 규칙은 앱의 `stateOf`와 같다(판본에 따로 적힌 공개 상태가 과제의 것보다 앞선다) */
export function releaseFactsOf(rootDir: string): ReleaseFacts {
  const loaded = loadContent(rootDir);
  let variantCount = 0;
  let openVariants = 0;
  let openQuests = 0;
  for (const f of loaded.quests) {
    const def = f.data as QuestDefinition;
    let open = 0;
    for (const v of Object.values(def.variants)) {
      variantCount += 1;
      if (stateOf(v.availability ?? def.availability, 'release') === 'open') open += 1;
    }
    openVariants += open;
    if (open > 0) openQuests += 1;
  }
  // 막다른 길 끝(3.4의 규칙 2): 길과 문은 world-src의 것이고(discoveryWorld), 발견 요소는 rootDir의 content/discoveries에서 읽는다
  const files: DiscoveryFile[] = [];
  for (const f of loaded.discoveries) {
    const { file, issues } = parseDiscoveryFile(f.data, f.file);
    if (!file) throw new Error(`발견 요소 파일을 읽을 수 없어요: ${f.file} ${issues.map((i) => i.message).join('; ')}`);
    files.push(file);
  }
  const { geometry } = discoveryWorld(loadRegionDefs(rootDir));
  const deadEndCount = Object.values(geometry).reduce((n, g) => n + (g ? deadEndsOf(g.roads, g.gates).length : 0), 0);
  return {
    questCount: loaded.quests.length,
    variantCount,
    openQuests,
    openVariants,
    unconfirmed: summarizeLedger(loadLedger(rootDir)).unconfirmed,
    lockProblems: validateLockDir(rootDir, { requireFile: true }).map((i) => `[${i.code}] ${i.path}: ${i.message}`),
    deadEndCount,
    bareDeadEnds: bareDeadEnds(files, geometry),
  };
}
