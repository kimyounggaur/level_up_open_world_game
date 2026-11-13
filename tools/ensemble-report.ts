// 광장 합주의 악보 점검표(7-5, 설계서 11.5, 12.10): 대표 조합 12가지와 층의 모든 조합(0–3의 여섯 자리, 4096가지)을 소리 없이 악보에서 훑어 센다.
//   npm run ensemble                 대표 조합 12가지의 점검표를 찍는다
//   npm run ensemble -- --all        층의 모든 조합 4096가지도 훑는다
//   npm run check:ensemble           12가지와 4096가지를 모두 훑고, 문제가 하나라도 있으면 1로 끝난다
// 이 점검은 귀로 듣는 점검(D-4)을 대신하지 않는다. 악보에서 셀 수 있는 것(다장조 밖의 음, 센 박의 부딪힘, 꾸밈음의 부딪힘, 성부끼리의 겹침, 소리의 겹친 정도)만 센다.
import { ENSEMBLE_COMBOS, ensembleProblems, ensembleReport } from '../src/domain/ensemblecheck';
import type { EnsembleReport } from '../src/domain/ensemblecheck';
import { MUSICIAN_ORDER } from '../src/domain/festival';
import { ENSEMBLE_LAYER_KEYS } from '../src/domain/worldsound';
import type { EnsembleLayers } from '../src/domain/worldsound';

const args = process.argv.slice(2);
const check = args.includes('--check');
const all = check || args.includes('--all');

const pad = (s: string | number, n: number): string => String(s).padEnd(n, ' ');
const layersText = (l: EnsembleLayers): string => ENSEMBLE_LAYER_KEYS.map((k) => l[k]).join('');

const header = ['id', '층(마을·가락·타악·베이스·달림·꾸밈)', '합', '음 수(맥박/화음/타악/베이스/가락/달림/꾸밈)', '동시', '겹침', '센박', '앞꾸밈', '시작', '지나감', '문제'];
console.log('광장 합주의 악보 점검표(귀로 듣는 점검을 대신하지 않는다)');
console.log('  동시: 한꺼번에 울리는 소리 높이 있는 음의 가장 많은 수, 겹침: 울리는 음의 세기 합의 가장 큰 값(겹친 정도의 눈금이지 귀에 들리는 크기가 아니다)');
console.log('  센박: 첫 박과 셋째 박의 날카로운 부딪힘(단2도·장7도·단9도), 앞꾸밈: 꾸밈음의 앞꾸밈이 다른 성부와 부딪히는 수, 시작: 센 박이 아닌 곳에서 같이 시작해 부딪히는 수, 지나감: 울리는 중에 다른 음이 시작해 부딪히는 수');
console.log(header.join(' | '));

let problems = 0;
const rowOf = (id: string, r: EnsembleReport): string => {
  const issues = ensembleProblems(r);
  problems += issues.length;
  const n = r.notes;
  return [
    pad(id, 16),
    layersText(r.layers),
    pad(r.level, 2),
    `${n.pulse}/${n.bed}/${n.percussion}/${n.bass}/${n.melody}/${n.runner}/${n.ornament}`,
    r.maxSimultaneous,
    r.peakVelocity.toFixed(2),
    r.strongBeatRubs,
    r.graceRubs,
    r.attackRubs,
    r.passingRubs,
    issues.length === 0 ? '없음' : issues.join('; '),
  ].join(' | ');
};

for (const combo of ENSEMBLE_COMBOS) console.log(rowOf(combo.id, ensembleReport(combo.layers)));
console.log(`  악사가 서는 차례: ${MUSICIAN_ORDER.join(', ')}`);

if (all) {
  const values = [0, 1, 2, 3];
  let count = 0;
  let strong = 0;
  let grace = 0;
  let bad = 0;
  let maxVelocity = 0;
  let maxAt = '';
  let maxSimultaneous = 0;
  for (const village of values) {
    for (const melody of values) {
      for (const percussion of values) {
        for (const bass of values) {
          for (const runner of values) {
            for (const ornament of values) {
              const layers: EnsembleLayers = { village, melody, percussion, bass, runner, ornament };
              const r = ensembleReport(layers);
              count++;
              strong += r.strongBeatRubs;
              grace += r.graceRubs;
              const issues = ensembleProblems(r);
              if (issues.length > 0) {
                bad++;
                console.log(`  문제: 층 ${layersText(layers)}: ${issues.join('; ')}`);
              }
              if (r.peakVelocity > maxVelocity) {
                maxVelocity = r.peakVelocity;
                maxAt = layersText(layers);
              }
              maxSimultaneous = Math.max(maxSimultaneous, r.maxSimultaneous);
            }
          }
        }
      }
    }
  }
  problems += bad;
  console.log(
    `층의 모든 조합 ${count}가지: 문제가 있는 조합 ${bad}가지, 센 박의 부딪힘 ${strong}쌍, 꾸밈음 앞꾸밈의 부딪힘 ${grace}쌍. ` +
      `겹침 눈금의 가장 큰 값 ${maxVelocity.toFixed(2)}(층 ${maxAt}), 동시에 울리는 음의 가장 많은 수 ${maxSimultaneous}.`,
  );
}

if (check && problems > 0) {
  console.error(`합주 점검에서 문제 ${problems}건을 찾았어요.`);
  process.exit(1);
}
console.log(check ? '합주 점검 통과(악보에서 셀 수 있는 것만 본 것이다. 귀로 듣는 점검은 따로 남는다).' : '');
