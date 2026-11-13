// 사물 그림 아틀라스만 다시 굽는다(설계서 10.2 tools/build-atlas). `npm run build:world`도 같은 일을 하므로, 그림만 바꿨을 때 빠르게 쓰는 길이다.
//   npm run build:atlas
import path from 'node:path';
import { bakeAtlas } from './atlas';
import { WORLD_PUBLIC_DIR } from './world-files';
import { loadWorldSource } from './world-source';

async function main(): Promise<void> {
  const root = process.cwd();
  const source = loadWorldSource(root);
  if (source.issues.length > 0) {
    console.error(`사물 원본에 문제가 ${source.issues.length}건 있어요:\n- ${source.issues.join('\n- ')}`);
    process.exit(1);
  }
  const started = Date.now();
  const r = await bakeAtlas(source.sprites, path.join(root, WORLD_PUBLIC_DIR));
  console.log(`아틀라스 ${r.layout.width}×${r.layout.height}, 그림 ${r.layout.frames.length}개, ${(r.imageBytes / 1024).toFixed(0)} KB, 해시 ${r.hash}, ${((Date.now() - started) / 1000).toFixed(1)}초`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
