// 햇살 과슈 화풍(D-308)으로 칠한 그림의 약속을 지킨다(docs/art-direction.md).
// ① 같은 코드는 늘 같은 그림을 칠한다(씨앗) ② 저장소의 그림 파일이 코드와 같다(npm run check:paint와 같은 검사)
// ③ 그림 틀의 크기가 지도와 시험이 아는 크기 그대로다 ④ 나무의 덮개는 파일 이름의 반지름 안에만 칠해져 있다(덮개 시험들이 이 반지름을 쓴다)
// ⑤ 캐릭터 그림 32장이 모두 있고 아틀라스에 들어 있다 ⑥ 칠한 그림은 외부 그림을 끌어오지 않는다(출처·권리 대장 img.world.sources)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { paintIntroBanner } from '../../world-src/art/banner';
import { paintedSprites } from '../../world-src/art/index';
import { svgSize } from '../../world-src/placements';
import { playerFrameNames, PLAYER_FRAME_H, PLAYER_FRAME_W } from '../../src/world/playerSprite';

const root = path.resolve(__dirname, '../..');
const spritesDir = path.join(root, 'world-src', 'sprites');
const existing = fs.readdirSync(spritesDir).filter((f) => f.endsWith('.svg')).sort();
const painted = paintedSprites(existing);

describe('칠하기 도구(world-src/art)', () => {
  it('같은 이름이면 늘 같은 그림을 칠한다', () => {
    const again = paintedSprites(existing);
    expect(Object.keys(again.sprites).sort()).toEqual(Object.keys(painted.sprites).sort());
    for (const [file, svg] of Object.entries(painted.sprites)) expect(again.sprites[file], file).toBe(svg);
    expect(paintIntroBanner()).toBe(paintIntroBanner());
  });

  it('저장소의 그림 파일이 코드와 같다(다르면 npm run paint:sprites)', () => {
    const stale = Object.entries(painted.sprites)
      .filter(([file, svg]) => !fs.existsSync(path.join(spritesDir, file)) || fs.readFileSync(path.join(spritesDir, file), 'utf-8') !== svg)
      .map(([file]) => file);
    expect(stale).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'public', 'world', 'ui-intro-banner.svg'), 'utf-8')).toBe(paintIntroBanner());
  });

  it('지금 있는 사물 그림은 모두 이 화풍이 안다(손으로 그린 그림이 생기면 이 목록이 알려 준다)', () => {
    expect(painted.skipped).toEqual([]);
    expect(Object.keys(painted.sprites).filter((f) => f.startsWith('obj-'))).toHaveLength(33);
  });

  it('그림 틀의 크기가 이전과 같다: 나무는 2r + 8, 표지판 120×120, 표지와 소품은 지도가 아는 크기', () => {
    const want: Record<string, [number, number]> = {
      'obj-staff-hill-weathervane.svg': [112, 192],
      'obj-scale-trail-gazebo.svg': [200, 190],
      'obj-key-marsh-tuning-tower.svg': [160, 250],
      'obj-bell-grove-echo-wall.svg': [520, 150],
      'obj-staff-hill-scarecrow-up.svg': [104, 176],
      'obj-staff-hill-scarecrow-down.svg': [104, 176],
      'obj-staff-hill-field-rope.svg': [700, 44],
    };
    for (const [file, svg] of Object.entries(painted.sprites)) {
      const size = svgSize(svg);
      expect(size, file).not.toBeNull();
      const tree = /-tree-r(\d+)\.svg$/.exec(file);
      if (tree) expect([size!.width, size!.height], file).toEqual([2 * Number(tree[1]) + 8, 2 * Number(tree[1]) + 8]);
      else if (file.endsWith('-signpost.svg')) expect([size!.width, size!.height], file).toEqual([120, 120]);
      else if (file.startsWith('chr-player-')) expect([size!.width, size!.height], file).toEqual([PLAYER_FRAME_W, PLAYER_FRAME_H]);
      else expect([size!.width, size!.height], file).toEqual(want[file]);
    }
  });

  it('외부 그림을 끌어오지 않는다: <image>, href, data:image가 없다', () => {
    for (const [file, svg] of [...Object.entries(painted.sprites), ['ui-intro-banner.svg', paintIntroBanner()] as const]) {
      expect(/<image\b|href=|data:image/.test(svg), file).toBe(false);
    }
  });
});

describe('나무의 덮개는 반지름 r 안에만 칠해져 있다(덮개를 재는 시험들의 전제)', () => {
  const trees = Object.entries(painted.sprites).filter(([f]) => /-tree-r\d+\.svg$/.test(f));

  it('나무 그림이 21장이고, 1배로 칠한 화소 가운데 반지름 r + 1 px 밖에 색이 있는 점이 없다', async () => {
    expect(trees).toHaveLength(21);
    for (const [file, svg] of trees) {
      const r = Number(/-tree-r(\d+)\.svg$/.exec(file)![1]);
      const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const c = r + 4;
      let outside = 0;
      let inside = 0;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const a = data[(y * info.width + x) * 4 + 3]!;
          if (a < 24) continue;
          const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
          if (d > r + 1) outside++;
          else inside++;
        }
      }
      expect(outside, `${file}: 반지름 ${r} 밖의 화소`).toBe(0);
      // 검사가 헛돌지 않는다: 덮개가 원 넓이의 대부분을 채운다(잎 뭉치의 가장자리가 물결져서 70–90%다)
      expect(inside / (Math.PI * r * r), `${file}: 덮개가 채운 비율`).toBeGreaterThan(0.6);
    }
  });
});

describe('캐릭터 그림(설계서 9.3: 4방향 × (서 있기 2 + 걷기 6))', () => {
  it('32장이 칠해지고 아틀라스(objects.json)에 모두 들어 있다', () => {
    const names = playerFrameNames();
    expect(names).toHaveLength(32);
    for (const name of names) expect(painted.sprites[`${name}.svg`], name).toBeTypeOf('string');
    const atlas = JSON.parse(fs.readFileSync(path.join(root, 'public', 'world', 'objects.json'), 'utf-8')) as { frames: Record<string, { frame: { w: number; h: number } }> };
    for (const name of names) {
      expect(atlas.frames[name], name).toBeDefined();
      expect([atlas.frames[name]!.frame.w, atlas.frames[name]!.frame.h], name).toEqual([PLAYER_FRAME_W * 2, PLAYER_FRAME_H * 2]);
    }
  });

  it('오른쪽을 보는 장은 왼쪽을 보는 장을 좌우로 뒤집은 것이다', () => {
    const left = painted.sprites['chr-player-left-walk-2.svg']!;
    const right = painted.sprites['chr-player-right-walk-2.svg']!;
    expect(right).toContain(`<g transform="translate(${PLAYER_FRAME_W} 0) scale(-1 1)">`);
    expect(left).not.toContain('scale(-1 1)');
  });
});
