// 6-3: 사물은 Tiled 지도 파일에 놓고, 그림은 한 장(아틀라스)으로 묶는다. 완료 기준: 사물을 더할 때 코드를 고치지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, TILE, WORLD_H, WORLD_TILES_X, WORLD_TILES_Y, WORLD_W } from '../../src/domain/world';
import { WORLD_OBJECTS } from '../../src/world/generated/worldData';
import { bakeAtlas, planAtlas } from '../../tools/atlas';
import { MAPS_DIR, SPRITES_DIR, loadWorldSource, orderMapFiles, parseWorldSource } from '../../tools/world-source';
import { WORLD_PUBLIC_DIR, loadRegionDefs, sourceHashOf } from '../../tools/world-files';
import { ATLAS_GAP, ATLAS_HEIGHT_STEP, ATLAS_MAX_WIDTH, bakedSize, frameName, packShelves, spritesHash } from '../../world-src/atlas';
import { buildWorld } from '../../world-src/index';
import { placeAll, shadowsSvg, svgSize } from '../../world-src/placements';
import { parseTiledMap, renderTiledMap } from '../../world-src/tiled';
import type { TiledObjectInput } from '../../world-src/tiled';

const root = path.resolve(__dirname, '../..');
const regions = loadRegionDefs(root);
const DIMS = { width: WORLD_TILES_X, height: WORLD_TILES_Y, tile: TILE };
const mapText = (objects: TiledObjectInput[]): string => renderTiledMap(objects, DIMS);

const TREE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120" viewBox="0 0 100 120"><circle cx="50" cy="50" r="40" fill="#2a7"/></svg>\n';
const SPRITES = { 'obj-test-tree.svg': TREE_SVG, 'obj-test-lamp.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="80"><rect width="40" height="80" fill="#c84"/></svg>\n' };

const place = (objects: TiledObjectInput[], sprites: Record<string, string> = SPRITES): ReturnType<typeof placeAll> => {
  const src = parseWorldSource([{ file: 'test.tmj', text: mapText(objects) }], sprites);
  expect(src.issues).toEqual([]);
  return placeAll(src.maps, src.sprites);
};

describe('6-3 Tiled 지도 읽기(parseTiledMap)', () => {
  const ok = (raw: unknown): ReturnType<typeof parseTiledMap> => parseTiledMap(raw, 'x.tmj', DIMS);

  it('우리가 쓴 지도를 Tiled 모양 그대로 읽는다: 점 사물과 속성(글·숫자·참거짓)', () => {
    const text = mapText([{ name: 'a', kind: 'prop', x: 10, y: 20, props: { sprite: 'obj-test-tree', ay: 0.5, blockR: 12, flag: true } }]);
    const { map, issues } = ok(JSON.parse(text));
    expect(issues).toEqual([]);
    expect(map!.objects).toEqual([{ id: 1, name: 'a', kind: 'prop', x: 10, y: 20, width: 0, height: 0, point: true, ellipse: false, props: { ay: 0.5, blockR: 12, flag: true, sprite: 'obj-test-tree' }, file: 'x.tmj' }]);
  });

  it('Tiled 1.9 이전의 type 속성과 사각형, 타원도 읽는다. 눈 아이콘으로 감춘 사물과 사물이 아닌 층은 건너뛴다', () => {
    const raw = {
      type: 'map', orientation: 'orthogonal', infinite: false, width: 256, height: 192, tilewidth: 32, tileheight: 32,
      layers: [
        { type: 'tilelayer', name: '바닥', data: [] },
        { type: 'objectgroup', name: '사물', objects: [
          { id: 1, name: 'r', type: 'block', x: 1, y: 2, width: 3, height: 4 },
          { id: 2, name: 'e', class: 'block', x: 1, y: 2, width: 6, height: 6, ellipse: true },
          { id: 3, name: 'h', class: 'tree', x: 1, y: 2, point: true, visible: false },
        ] },
        { type: 'objectgroup', name: '감춘 층', visible: false, objects: [{ id: 9, name: 'z', class: 'tree', x: 0, y: 0, point: true }] },
      ],
    };
    const { map, issues } = ok(raw);
    expect(issues).toEqual([]);
    expect(map!.objects.map((o) => [o.name, o.kind, o.ellipse])).toEqual([['r', 'block', false], ['e', 'block', true]]);
  });

  it('문제가 있으면 어느 파일 어느 사물인지와 이유를 알려 주고 지도를 돌려주지 않는다', () => {
    const bad = (raw: unknown): string => ok(raw).issues.join(' | ');
    expect(bad(42)).toContain('x.tmj');
    expect(bad({ type: 'map', orientation: 'orthogonal', width: 10, height: 10, tilewidth: 32, tileheight: 32, layers: [] })).toContain('256×192칸');
    expect(bad({ type: 'map', orientation: 'orthogonal', width: 256, height: 192, tilewidth: 16, tileheight: 16, layers: [] })).toContain('32 px');
    expect(bad({ type: 'map', orientation: 'isometric', width: 256, height: 192, tilewidth: 32, tileheight: 32, layers: [] })).toContain('orthogonal');
    const withObj = (o: Record<string, unknown>): unknown => ({ type: 'map', orientation: 'orthogonal', width: 256, height: 192, tilewidth: 32, tileheight: 32, layers: [{ type: 'objectgroup', name: 'L', objects: [o] }] });
    expect(bad(withObj({ id: 1, name: '', class: 'tree', x: 0, y: 0 }))).toContain('이름(name)이 없어요');
    expect(bad(withObj({ id: 1, name: 'q', class: 'bush', x: 0, y: 0 }))).toContain('class는 tree / sign / prop / hit / block');
    expect(bad(withObj({ id: 1, name: 'q', class: 'tree', x: 'a', y: 0 }))).toContain('x와 y가 숫자');
    expect(bad(withObj({ id: 1, name: 'q', class: 'tree', x: 0, y: 0, properties: [{ name: 'p', type: 'string', value: { a: 1 } }] }))).toContain('속성 p의 값은 글, 숫자, 참/거짓');
    expect(bad(withObj({ id: 1, name: 'q', class: 'tree', x: 0, y: 0, properties: [{ name: 'p', type: 'int', value: 1 }, { name: 'p', type: 'int', value: 2 }] }))).toContain('속성 p이 두 번');
    const twice = { type: 'map', orientation: 'orthogonal', width: 256, height: 192, tilewidth: 32, tileheight: 32, layers: [{ type: 'objectgroup', name: 'L', objects: [{ id: 1, name: 'a', class: 'tree', x: 0, y: 0 }, { id: 1, name: 'b', class: 'tree', x: 0, y: 0 }] }] };
    expect(bad(twice)).toContain('Tiled 번호(id) 1');
    expect(ok(twice).map).toBeNull();
  });

  it('JSON이 아닌 파일은 파일 이름과 함께 알려 준다', () => {
    const src = parseWorldSource([{ file: 'broken.tmj', text: '{ not json' }], {});
    expect(src.maps).toEqual([]);
    expect(src.issues[0]).toContain('broken.tmj');
  });
});

describe('6-3 지도 점 → 월드 사물(placeAll)', () => {
  it('그림만 적으면 기본값이 채워진다: 그림 크기, 아래 가운데 기준점, 발은 놓은 점', () => {
    const p = place([{ name: 'lamp-1', kind: 'prop', x: 300, y: 500, props: { sprite: 'obj-test-lamp' } }]);
    expect(p.issues).toEqual([]);
    expect(p.objects).toEqual([{ id: 'lamp-1', kind: 'prop', file: 'obj-test-lamp.svg', x: 300, y: 500, ax: 0.5, ay: 1, w: 40, h: 80, sortY: 500 }]);
    expect(p.colliders).toEqual([]);
    expect(p.shadows).toEqual([]);
    expect(p.hits).toEqual({});
  });

  it('나무: 줄기 막힘(발에 놓은 원), 그림자, 겹침 순서(발 y)가 속성으로 정해진다', () => {
    const p = place([{ name: 'big-tree', kind: 'tree', x: 1000, y: 800, props: { sprite: 'obj-test-tree', ay: 0.5, footDy: 45, blockR: 25.2, shadowR: 90 } }]);
    expect(p.objects[0]).toMatchObject({ kind: 'tree', x: 1000, y: 800, ay: 0.5, sortY: 845 });
    expect(p.colliders).toEqual([{ kind: 'circle', x: 1000, y: 845, r: 25.2, note: 'big-tree 줄기' }]);
    expect(p.shadows).toEqual([{ x: 1000, y: 800, r: 90 }]);
    // 그림자는 오른쪽 아래로 (15, 24)만큼 어긋난 원이다(9.1)
    expect(shadowsSvg(p.shadows)).toContain('cx="1015" cy="824" r="90"');
  });

  it('표지판: 가리키는 정거장과 누르기 영역(놓은 점에서의 거리)을 쓴다. station이 없으면 막는다', () => {
    const p = place([{ name: 'sign-X1', kind: 'sign', x: 500, y: 600, props: { sprite: 'obj-test-lamp', station: 'X1', hitDx: -20, hitDy: -70, hitW: 40, hitH: 80, blockR: 14 } }]);
    expect(p.objects[0]!.stationId).toBe('X1');
    expect(p.hits).toEqual({ X1: { x: 480, y: 530, w: 40, h: 80 } });
    expect(p.colliders[0]).toMatchObject({ note: 'X1 표지판' });
    const src = parseWorldSource([{ file: 't.tmj', text: mapText([{ name: 's', kind: 'sign', x: 1, y: 1, props: { sprite: 'obj-test-lamp' } }]) }], SPRITES);
    expect(placeAll(src.maps, src.sprites).issues.join('|')).toContain('station 속성');
  });

  it('누르기 영역(hit)과 막힌 자리(block)는 Tiled의 사각형과 원으로 그린다', () => {
    const p = place([
      { name: 'hit-E9', kind: 'hit', x: 100, y: 200, width: 64, height: 32, props: { station: 'E9' } },
      { name: 'wall', kind: 'block', x: 10, y: 20, width: 30, height: 40 },
      { name: 'rock', kind: 'block', x: 100, y: 100, width: 40, height: 40, ellipse: true },
    ]);
    expect(p.issues).toEqual([]);
    expect(p.hits).toEqual({ E9: { x: 100, y: 200, w: 64, h: 32 } });
    expect(p.colliders).toEqual([
      { kind: 'rect', x: 10, y: 20, w: 30, h: 40, note: 'wall 막힘' },
      { kind: 'circle', x: 120, y: 120, r: 20, note: 'rock 막힘' },
    ]);
  });

  it('틀린 사물은 이유와 함께 잡는다: 없는 그림, 모르는 속성, 겹친 이름, 점이 아닌 그림 사물, 일부만 적은 누르기 영역, 타원, 두 번 놓은 정거장', () => {
    const issuesOf = (objects: TiledObjectInput[]): string => {
      const src = parseWorldSource([{ file: 't.tmj', text: mapText(objects) }], SPRITES);
      return [...src.issues, ...placeAll(src.maps, src.sprites).issues].join(' | ');
    };
    expect(issuesOf([{ name: 'a', kind: 'prop', x: 1, y: 1, props: { sprite: 'obj-none' } }])).toContain('obj-none.svg이 world-src/sprites/에 없어요');
    expect(issuesOf([{ name: 'a', kind: 'prop', x: 1, y: 1, props: { sprite: 'obj-test-lamp', blokR: 3 } }])).toContain('알 수 없는 속성 blokR');
    expect(issuesOf([{ name: 'a', kind: 'prop', x: 1, y: 1, props: { sprite: 'obj-test-lamp' } }, { name: 'a', kind: 'prop', x: 2, y: 2, props: { sprite: 'obj-test-lamp' } }])).toContain('사물 이름 a이 다른 사물과 겹쳐요');
    expect(issuesOf([{ name: 'a', kind: 'prop', x: 1, y: 1, width: 5, height: 5, props: { sprite: 'obj-test-lamp' } }])).toContain('점 사물이어야 해요');
    expect(issuesOf([{ name: 'a', kind: 'prop', x: 1, y: 1, props: { sprite: 'obj-test-lamp', station: 'X', hitDx: 1 } }])).toContain('hitDx, hitDy, hitW, hitH를 모두');
    expect(issuesOf([{ name: 'a', kind: 'block', x: 1, y: 1, width: 10, height: 20, ellipse: true }])).toContain('가로와 세로가 같은 원');
    expect(issuesOf([{ name: 'a', kind: 'hit', x: 1, y: 1, width: 10, height: 20, props: { station: 'X' } }, { name: 'b', kind: 'hit', x: 5, y: 5, width: 10, height: 20, props: { station: 'X' } }])).toContain('정거장 X의 누르기 영역이 a에도 있어요');
    expect(issuesOf([{ name: 'a', kind: 'prop', x: 1, y: 1, props: { sprite: 'obj-test-lamp', ax: 2 } }])).toContain('ax와 ay는 0과 1 사이');
  });

  it('사물은 발 위치 y 순서로 정렬된다(같으면 id 순서). 값이 큰(남쪽) 사물이 앞에 그려진다', () => {
    const p = place([
      { name: 'b', kind: 'prop', x: 1, y: 300, props: { sprite: 'obj-test-lamp' } },
      { name: 'a', kind: 'prop', x: 2, y: 300, props: { sprite: 'obj-test-lamp' } },
      { name: 'c', kind: 'prop', x: 3, y: 100, props: { sprite: 'obj-test-lamp' } },
    ]);
    expect(p.objects.map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('SVG의 그림 크기는 최상위 <svg>의 width와 height에서 읽는다', () => {
    expect(svgSize(TREE_SVG)).toEqual({ width: 100, height: 120 });
    expect(svgSize('<svg viewBox="0 0 1 1"/>')).toBeNull();
    expect(svgSize('<svg width="0" height="5"/>')).toBeNull();
  });

  it('지도 파일은 지역 순서(마을, 오선 언덕, 박자 강가, …)로 읽고, 그 밖의 이름은 이름순으로 뒤에 읽는다', () => {
    expect(orderMapFiles(['zzz.tmj', 'key-marsh.tmj', 'village.tmj', 'aaa.tmj', 'beat-river.tmj'])).toEqual(['village.tmj', 'beat-river.tmj', 'key-marsh.tmj', 'aaa.tmj', 'zzz.tmj']);
  });
});

describe('6-3 지금 놓인 지도(world-src/regions/*.tmj)', () => {
  const source = loadWorldSource(root);
  const build = buildWorld(regions, source);

  it('지역마다 지도 파일이 하나씩 있고 읽는 동안 문제가 없다', () => {
    expect(source.issues).toEqual([]);
    expect(source.maps.map((m) => path.basename(m.file))).toEqual(['village.tmj', 'staff-hill.tmj', 'beat-river.tmj', 'bell-grove.tmj', 'scale-trail.tmj', 'key-marsh.tmj']);
    expect(fs.readdirSync(path.join(root, MAPS_DIR)).filter((f) => f.endsWith('.tmj'))).toHaveLength(6);
  });

  it('나무 130그루, 표지판 18개, 소품 18개(메아리 벽, 세 지역의 표지, 허수아비 밭의 밧줄과 허수아비 일곱, 길목 표지판 여섯)가 놓여 있고, 놓인 사물은 모두 그림 틀이 있다(5단계까지의 나무 163그루에서 종나무 틀 안의 여섯 그루를 치웠고 6-7c, 메아리 벽 자리의 두 그루와 물방울 북 넷째 돌 위의 한 그루를 더 치웠고 6-9c, 계단밭 틀과 겹친 열세 그루를 더 치웠고 7-1d, 허수아비 밭의 그림을 덮는 두 그루를 더 치웠고 7-1 O1, 음계 길 단음계 길의 틀과 겹친 두 그루를 더 치웠고 7-2, 건반 늪의 다리 틀·늪과 겹친 일곱 그루를 더 치웠다 7-3. 7-4의 표지 셋은 나무를 더 치우지 않고 나무 없는 자리에 놓았다)', () => {
    expect(build.issues).toEqual([]);
    expect(build.stats).toMatchObject({ trees: 130, signs: 18, props: 18 });
    expect(build.objects).toHaveLength(166);
    expect(build.objects.filter((o) => o.kind === 'prop').map((o) => o.id).sort()).toEqual([
      'prop-bell-grove-echo-wall',
      'prop-key-marsh-tuning-tower',
      'prop-scale-trail-gazebo',
      'prop-staff-hill-weathervane',
      'rope-staff-hill-middle-line',
      ...[1, 2, 3, 4, 5, 6, 7].map((p) => `scarecrow-staff-hill-p${p}`),
      'waysign-beat-river-1',
      'waysign-beat-river-2',
      'waysign-bell-grove-1',
      'waysign-key-marsh-1',
      'waysign-key-marsh-2',
      'waysign-staff-hill-1',
    ]);
    expect(WORLD_OBJECTS).toEqual(build.objects);
  });

  it('표지판 18개는 정거장 하나씩을 가리키고, 누르기 영역을 가진다', () => {
    const signs = build.objects.filter((o) => o.kind === 'sign');
    expect(new Set(signs.map((s) => s.stationId)).size).toBe(18);
    for (const s of signs) expect(build.hits[s.stationId!], s.id).toBeDefined();
  });

  it('지도 파일은 Tiled가 저장하는 글과 같은 모양이다(다시 써도 달라지지 않는다)', () => {
    for (const f of fs.readdirSync(path.join(root, MAPS_DIR)).filter((x) => x.endsWith('.tmj'))) {
      const text = fs.readFileSync(path.join(root, MAPS_DIR, f), 'utf-8');
      const raw = JSON.parse(text) as { layers: Array<{ objects: Array<Record<string, unknown>> }> };
      // 다시 직렬화해도 같은 글: 손으로 고친 흔적(들여쓰기, 줄 끝)이 없다
      expect(`${JSON.stringify(raw, null, 1)}\n`, f).toBe(text);
    }
  });
});

describe('6-3 완료 기준: 사물을 더할 때 코드를 고치지 않는다', () => {
  const base = loadWorldSource(root);
  const baseBuild = buildWorld(regions, base);
  const baseHash = sourceHashOf(baseBuild);

  /** 걸을 수 있는 빈 풀밭: 박자 강가 동쪽 위, 길과 나무에서 떨어진 곳 */
  const SPOT = { x: 7400, y: 800 };
  const NEW_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="144" viewBox="0 0 96 144"><rect x="24" y="12" width="48" height="120" rx="10" fill="#8a6a2c"/><circle cx="48" cy="40" r="22" fill="#f1d27a"/></svg>\n';
  const NEW_OBJECTS: TiledObjectInput[] = [
    { name: 'new-lamppost', kind: 'prop', x: SPOT.x, y: SPOT.y, props: { sprite: 'obj-beat-river-lamppost', footDy: 0, blockR: 20, shadowR: 30, station: 'X1', hitDx: -48, hitDy: -144, hitW: 96, hitH: 150 } },
  ];

  it('새 사물 하나를 더해도(지도에 점 하나 + SVG 한 장) 코드 파일은 하나도 바뀌지 않고 월드에 나타난다', () => {
    const extra = parseWorldSource([{ file: 'world-src/regions/beat-river.tmj', text: mapText(NEW_OBJECTS) }], {});
    expect(extra.issues).toEqual([]);
    const source = { maps: [...base.maps, ...extra.maps], sprites: { ...base.sprites, 'obj-beat-river-lamppost.svg': NEW_SVG }, issues: [] as string[] };
    const build = buildWorld(regions, source);
    expect(build.issues).toEqual([]);

    // 사물 목록에 들어가고, 정렬이 유지되고, 그림 틀이 생긴다
    const added = build.objects.find((o) => o.id === 'new-lamppost');
    expect(added).toEqual({ id: 'new-lamppost', kind: 'prop', file: 'obj-beat-river-lamppost.svg', x: SPOT.x, y: SPOT.y, ax: 0.5, ay: 1, w: 96, h: 144, sortY: SPOT.y, stationId: 'X1' });
    expect(build.objects).toHaveLength(baseBuild.objects.length + 1);
    for (let i = 1; i < build.objects.length; i++) expect(build.objects[i]!.sortY).toBeGreaterThanOrEqual(build.objects[i - 1]!.sortY);
    expect(Object.keys(build.sprites)).toContain('obj-beat-river-lamppost.svg');

    // 막힌 자리와 그림자와 누르기 영역이 생긴다
    expect(baseBuild.grid.isBlockedPoint(SPOT.x, SPOT.y)).toBe(false);
    expect(build.grid.isBlockedPoint(SPOT.x, SPOT.y)).toBe(true);
    expect(build.svgBody).toContain(`cx="${SPOT.x + 15}" cy="${SPOT.y + 24}" r="30"`);
    expect(baseBuild.svgBody).not.toContain(`cx="${SPOT.x + 15}" cy="${SPOT.y + 24}" r="30"`);
    expect(build.hits.X1).toEqual({ x: SPOT.x - 48, y: SPOT.y - 144, w: 96, h: 150 });

    // 원본이 바뀐 것을 해시가 알아채고, 아틀라스에는 틀이 하나 더 들어간다
    expect(sourceHashOf(build)).not.toBe(baseHash);
    const planned = planAtlas(build.sprites);
    expect(planned.layout.frames).toHaveLength(planAtlas(baseBuild.sprites).layout.frames.length + 1);
    expect(planned.layout.frames.find((f) => f.name === 'obj-beat-river-lamppost')).toMatchObject({ w: 192, h: 288 });
  });

  it('파일로도 같다: 지도 파일과 그림 파일만 복사본에 더하면 굽는 도구가 읽어서 아틀라스 그림에 칠한다', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'world-source-'));
    try {
      fs.cpSync(path.join(root, 'world-src', 'regions'), path.join(tmp, MAPS_DIR), { recursive: true });
      fs.cpSync(path.join(root, 'world-src', 'sprites'), path.join(tmp, SPRITES_DIR), { recursive: true });
      // 새 사물: 지도에 점 하나, 그림 한 장. 다른 파일은 건드리지 않는다
      fs.writeFileSync(path.join(tmp, MAPS_DIR, 'beat-river.tmj'), (() => {
        const raw = JSON.parse(fs.readFileSync(path.join(tmp, MAPS_DIR, 'beat-river.tmj'), 'utf-8')) as { layers: Array<{ objects: unknown[] }>; nextobjectid: number };
        const more = JSON.parse(mapText(NEW_OBJECTS)) as { layers: Array<{ objects: Array<Record<string, unknown>> }> };
        const obj = { ...more.layers[0]!.objects[0]!, id: raw.nextobjectid };
        raw.layers[0]!.objects.push(obj);
        raw.nextobjectid += 1;
        return `${JSON.stringify(raw, null, 1)}\n`;
      })());
      fs.writeFileSync(path.join(tmp, SPRITES_DIR, 'obj-beat-river-lamppost.svg'), NEW_SVG);

      const source = loadWorldSource(tmp);
      expect(source.issues).toEqual([]);
      const build = buildWorld(regions, source);
      expect(build.issues).toEqual([]);
      expect(build.objects.some((o) => o.id === 'new-lamppost')).toBe(true);

      const out = path.join(tmp, 'out');
      const r = await bakeAtlas(build.sprites, out);
      const json = JSON.parse(fs.readFileSync(path.join(out, 'objects.json'), 'utf-8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
      const f = json.frames['obj-beat-river-lamppost']!.frame;
      expect([f.w, f.h]).toEqual([192, 288]);
      // 새 틀 한가운데(둥근 등불 머리)가 칠해져 있다
      const { data, info } = await sharp(path.join(out, 'objects.webp')).raw().toBuffer({ resolveWithObject: true });
      const px = (x: number, y: number): number[] => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + info.channels));
      const head = px(f.x + 96, f.y + 80);
      expect(head[3]).toBe(255);
      expect(head[0]).toBeGreaterThan(200); // #f1d27a의 붉은 기운
      expect(r.layout.frames).toHaveLength(Object.keys(build.sprites).length);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('새 사물이 정거장 앞을 막으면 굽는 도구가 알린다(서는 자리가 막힘, 닿지 못함)', () => {
    // 첫 징검다리(E1)의 서는 자리(6700, 2800) 둘레를 큰 막힘으로 덮는다
    const wall: TiledObjectInput[] = [{ name: 'e1-wall', kind: 'block', x: 6600, y: 2700, width: 200, height: 200 }];
    const extra = parseWorldSource([{ file: 'x.tmj', text: mapText(wall) }], {});
    const build = buildWorld(regions, { maps: [...base.maps, ...extra.maps], sprites: base.sprites, issues: [] });
    expect(build.issues.some((i) => i.includes('E1의 서는 자리') && i.includes('막혀 있어요'))).toBe(true);
  });

  it('새 사물이 그림 틀 없이 놓이면 막는다(그림 원본이 없는 사물은 월드에 나오지 않는다)', () => {
    const extra = parseWorldSource([{ file: 'x.tmj', text: mapText([{ name: 'ghost', kind: 'prop', x: 7400, y: 800, props: { sprite: 'obj-none' } }]) }], {});
    const build = buildWorld(regions, { maps: [...base.maps, ...extra.maps], sprites: base.sprites, issues: [] });
    expect(build.issues.join('|')).toContain('obj-none.svg이 world-src/sprites/에 없어요');
    expect(build.objects.some((o) => o.id === 'ghost')).toBe(false);
  });

});

describe('6-3 사물 그림 한 장(아틀라스)', () => {
  const sprites = loadWorldSource(root).sprites;

  it('틀이 서로 겹치지 않고 한 장 안에 있으며 틀 사이는 4 px 이상 비어 있다', () => {
    const layout = planAtlas(sprites).layout;
    expect(layout.width).toBeLessThanOrEqual(ATLAS_MAX_WIDTH);
    // 가로는 2의 거듭제곱, 세로는 16의 배수다(8-4: 4096으로 올리면 쓰지 않는 그림 메모리가 15 MiB 남는다. 바닥 조각도 1028×1028이라 2의 거듭제곱이 아닌 그림은 이미 쓴다)
    expect((layout.width & (layout.width - 1)) === 0).toBe(true);
    expect(layout.height % ATLAS_HEIGHT_STEP).toBe(0);
    const fs_ = layout.frames;
    for (const f of fs_) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(layout.width);
      expect(f.y + f.h).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < fs_.length; i++) {
      for (let j = i + 1; j < fs_.length; j++) {
        const a = fs_[i]!;
        const b = fs_[j]!;
        const sepX = a.x + a.w + ATLAS_GAP <= b.x || b.x + b.w + ATLAS_GAP <= a.x;
        const sepY = a.y + a.h + ATLAS_GAP <= b.y || b.y + b.h + ATLAS_GAP <= a.y;
        expect(sepX || sepY, `${a.name}와 ${b.name}이 겹치거나 붙어 있어요`).toBe(true);
      }
    }
  });

  it('틀의 크기는 그림 크기의 2배다(9.3: 사물은 2배로 구워 선명하게)', () => {
    const layout = planAtlas(sprites).layout;
    for (const f of layout.frames) {
      const svg = sprites[`${f.name}.svg`]!;
      const s = svgSize(svg)!;
      expect([f.w, f.h], f.name).toEqual([s.width * 2, s.height * 2]);
      expect(bakedSize(svg)).toEqual({ w: f.w, h: f.h });
    }
  });

  it('같은 그림이면 늘 같은 자리가 나온다. 한 장의 가로보다 넓은 그림은 던진다', () => {
    expect(planAtlas(sprites).json).toBe(planAtlas({ ...sprites }).json);
    expect(() => packShelves([{ name: 'wide', w: ATLAS_MAX_WIDTH + 1, h: 10 }])).toThrow('가로');
    const packed = packShelves([{ name: 'a', w: 1000, h: 50 }, { name: 'b', w: 1000, h: 50 }, { name: 'c', w: 100, h: 20 }]);
    // 가로 2048 안에 a, b가 나란히(1000 + 4 + 1000), c는 다음 줄
    expect(packed.frames.find((f) => f.name === 'b')).toMatchObject({ x: 1004, y: 0 });
    expect(packed.frames.find((f) => f.name === 'c')).toMatchObject({ x: 0, y: 54 });
  });

  it('아틀라스의 세로는 쓴 높이를 16의 배수로 올린 만큼이다(2의 거듭제곱으로 올려 그림 메모리를 낭비하지 않는다, 8-4)', () => {
    const packed = packShelves([{ name: 'a', w: 1000, h: 50 }, { name: 'b', w: 1000, h: 50 }, { name: 'c', w: 100, h: 20 }]);
    // 쓴 높이는 줄 하나(50) + 틈(4) + 줄 하나(20) = 74 → 80, 쓴 너비는 1000 + 4 + 1000 = 2004 → 2048
    expect([packed.width, packed.height]).toEqual([2048, 80]);
    const layout = planAtlas(sprites).layout;
    const usedH = Math.max(...layout.frames.map((f) => f.y + f.h));
    expect(layout.height % ATLAS_HEIGHT_STEP).toBe(0);
    expect(layout.height - usedH).toBeLessThan(ATLAS_HEIGHT_STEP);
    expect(layout.height).toBeGreaterThanOrEqual(usedH);
  });

  it('틀 이름은 그림 파일 이름에서 .svg를 뗀 것이고, 그림 해시는 내용이 바뀌면 달라진다', () => {
    expect(frameName('obj-x.svg')).toBe('obj-x');
    expect(spritesHash(sprites)).toBe(spritesHash({ ...sprites }));
    expect(spritesHash({ ...sprites, 'obj-village-tree-r66.svg': `${sprites['obj-village-tree-r66.svg']}<!-- -->` })).not.toBe(spritesHash(sprites));
  });

  it('public/world의 objects.json이 지금 그림 원본에서 다시 만든 것과 같다(낡았으면 npm run build:world)', () => {
    const text = fs.readFileSync(path.join(root, WORLD_PUBLIC_DIR, 'objects.json'), 'utf-8');
    expect(text).toBe(planAtlas(sprites).json);
  });

  it('구운 그림에서 모든 틀 안에 칠한 픽셀이 있고, 틀 바깥(빈 곳)은 투명하다', async () => {
    const layout = planAtlas(sprites).layout;
    const { data, info } = await sharp(path.join(root, WORLD_PUBLIC_DIR, 'objects.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([layout.width, layout.height]);
    const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3]!;
    for (const f of layout.frames) {
      let painted = 0;
      for (let y = f.y; y < f.y + f.h; y += 4) for (let x = f.x; x < f.x + f.w; x += 4) if (alphaAt(x, y) > 0) painted++;
      expect(painted, f.name).toBeGreaterThan(50);
      // 틀 바로 오른쪽·아래의 빈틈은 투명하다(번지지 않았다)
      for (let k = 0; k < f.h; k += 8) expect(alphaAt(Math.min(info.width - 1, f.x + f.w + 1), f.y + k), `${f.name} 오른쪽 빈틈`).toBe(0);
    }
    // 아틀라스는 월드 바닥 조각 한 장(1024)보다 큰 한 장이지만 가로 2048을 넘지 않는다
    expect(layout.width).toBeLessThanOrEqual(2 * CHUNK_SIZE);
  });

  it('월드 크기와 칸 수는 바뀌지 않았다(256×192칸, 8192×6144 px)', () => {
    expect([WORLD_W, WORLD_H]).toEqual([8192, 6144]);
  });
});
