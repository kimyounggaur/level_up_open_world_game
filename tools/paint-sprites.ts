// 햇살 과슈 화풍으로 사물 그림을 다시 칠한다(docs/art-direction.md): world-src/art의 코드 → world-src/sprites/*.svg.
//   npm run paint:sprites            칠해서 파일을 쓴다(이 화풍이 아는 이름은 덮어쓴다). 이어서 npm run build:world로 아틀라스를 다시 굽는다.
//   npm run paint:sprites -- --check 파일이 코드와 같은지만 본다(다르면 실패)
// 이 화풍이 모르는 이름의 그림(손으로 그려 넣은 것)은 건드리지 않고 이름만 알려 준다.
import fs from 'node:fs';
import path from 'node:path';
import { paintIntroBanner } from '../world-src/art/banner';
import { paintedSprites } from '../world-src/art/index';
import { SPRITES_DIR } from './world-source';

/** 화면 그림(ui-<이름>.svg, 설계서 9.6)을 두는 곳. 배포물의 world/ 아래라야 출처·권리 대장의 검사(⑥)를 지나고 대장이 덮는다 */
export const UI_ART_DIR = 'public/world';

function main(): void {
  const root = process.cwd();
  const dir = path.join(root, SPRITES_DIR);
  const check = process.argv.includes('--check');
  const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  const { sprites, skipped } = paintedSprites(existing);
  const stale: string[] = [];
  // 사물 그림(아틀라스로 굽는다)과 화면 그림(ui-*.svg, 그대로 싣는다)
  const files: Array<[string, string]> = [
    ...Object.entries(sprites).map(([file, svg]): [string, string] => [path.join(dir, file), svg]),
    [path.join(root, UI_ART_DIR, 'ui-intro-banner.svg'), paintIntroBanner()],
  ];
  for (const [p, svg] of files) {
    const now = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    if (now === svg) continue;
    stale.push(path.relative(root, p));
    if (!check) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, svg);
    }
  }
  if (skipped.length > 0) console.log(`이 화풍이 모르는 그림 ${skipped.length}개는 그대로 두었어요: ${skipped.join(', ')}`);
  if (check) {
    if (stale.length > 0) {
      console.error(`코드와 다른 그림이 ${stale.length}개 있어요(npm run paint:sprites): ${stale.slice(0, 8).join(', ')}${stale.length > 8 ? ' …' : ''}`);
      process.exit(1);
    }
    console.log(`칠한 그림 ${files.length}개가 모두 코드와 같아요`);
    return;
  }
  console.log(`칠한 그림 ${files.length}개 가운데 ${stale.length}개를 새로 썼어요. 사물 그림이 바뀌었으면 이어서 npm run build:world로 아틀라스를 다시 구워요`);
}

main();
