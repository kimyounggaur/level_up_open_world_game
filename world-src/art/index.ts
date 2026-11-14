// 햇살 과슈 화풍으로 칠한 그림 목록(docs/art-direction.md). 사물 그림(world-src/sprites/)의 원본을 코드에서 만든다.
// 이름으로 그림을 고른다: 나무(obj-<지역>-tree-r<반지름>), 표지판(obj-<지역>-signpost), 표지와 소품(이름 하나하나), 캐릭터(chr-player-…).
// 이 목록에 없는 그림 파일은 손으로 그린 원본으로 보고 건드리지 않는다(사물을 더할 때 코드를 고치지 않는다는 6-3의 약속은 그대로다).
import { REGION_IDS } from '../../src/domain/world';
import type { RegionId } from '../../src/domain/world';
import { playerFrames } from './characters';
import { paintFieldRope, paintScarecrowDown, paintScarecrowUp } from './field';
import { paintEchoWall, paintGazebo, paintTuningTower, paintWeathervane } from './landmarks';
import { SIGN_HEADER, paintSignpost } from './signs';
import { FOLIAGE, paintTree } from './trees';

const isRegion = (s: string): s is RegionId => (REGION_IDS as readonly string[]).includes(s);

const NAMED: Readonly<Record<string, (name: string) => string>> = {
  'obj-staff-hill-weathervane': paintWeathervane,
  'obj-scale-trail-gazebo': paintGazebo,
  'obj-key-marsh-tuning-tower': paintTuningTower,
  'obj-bell-grove-echo-wall': paintEchoWall,
  'obj-staff-hill-scarecrow-up': paintScarecrowUp,
  'obj-staff-hill-scarecrow-down': paintScarecrowDown,
  'obj-staff-hill-field-rope': paintFieldRope,
};

/** 그림 파일 이름(…svg) 하나를 칠한다. 이 화풍이 모르는 이름이면 null */
export function paintSprite(file: string): string | null {
  const name = file.replace(/\.svg$/, '');
  const tree = /^obj-([a-z-]+)-tree-r(\d+)$/.exec(name);
  if (tree) return isRegion(tree[1]!) ? paintTree(name, Number(tree[2]), FOLIAGE[tree[1]]) : null;
  const sign = /^obj-([a-z-]+)-signpost$/.exec(name);
  if (sign) {
    const region = sign[1]!;
    return region in SIGN_HEADER ? paintSignpost(name, region as keyof typeof SIGN_HEADER) : null;
  }
  const named = NAMED[name];
  return named ? named(name) : null;
}

/**
 * 칠한 그림 전체: 지금 있는 그림 파일 가운데 이 화풍이 아는 것 + 캐릭터 그림.
 * existing은 world-src/sprites/에 지금 있는 파일 이름이다(나무와 표지판은 지도에 놓인 크기만 칠한다).
 */
export function paintedSprites(existing: readonly string[]): { sprites: Record<string, string>; skipped: string[] } {
  const sprites: Record<string, string> = {};
  const skipped: string[] = [];
  for (const file of existing) {
    if (file.startsWith('chr-')) continue;
    const svg = paintSprite(file);
    if (svg === null) skipped.push(file);
    else sprites[file] = svg;
  }
  Object.assign(sprites, playerFrames());
  return { sprites, skipped };
}
