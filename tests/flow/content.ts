// 흐름 시험이 내용 파일(content/)에서 읽는 사실. 과제의 수나 지역별 배치를 시험에 손으로 적어 두면 과제를 더할 때마다 어긋난다
// (5단계에서 열 수 있는 과제가 3개에서 8개가 되자 목록 시험 다섯 곳이 그렇게 깨졌다). 앱 코드가 아니라 내용 파일을 직접 읽어 세므로,
// 앱이 과제를 빠뜨리거나 더 보여 주면 시험이 그것을 잡아낸다.
import fs from 'node:fs';
import path from 'node:path';

const CONTENT = path.resolve(__dirname, '../../content');

/** 내용 폴더에 놓인 과제 id들(파일 이름 차례). 목록은 열 수 있는 과제와 화면이 아직 없는 과제를 모두 카드로 보여 준다 */
export const QUEST_IDS: readonly string[] = fs
  .readdirSync(path.join(CONTENT, 'quests'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

/** 목록에 보이는 과제 카드의 수 */
export const QUEST_COUNT = QUEST_IDS.length;

/** 지역의 정거장에 놓인 과제 가운데 지금 만들어진 것(지역 파일의 정거장 배치 ∩ 과제 파일). 목록을 지역으로 거르면 이것만 남는다 */
export function builtQuestsIn(regionId: string): string[] {
  const region = JSON.parse(fs.readFileSync(path.join(CONTENT, 'regions', `${regionId}.json`), 'utf-8')) as { stations: Array<{ questIds?: string[] }> };
  const placed = new Set(region.stations.flatMap((s) => s.questIds ?? []));
  return QUEST_IDS.filter((id) => placed.has(id));
}
