// 6-9c 놀이 악기를 그리는 층(world/play/layer.ts): 바닥의 돌과 돌 위의 음 이름, 밟으면 잠깐 금빛으로 차는 모습,
// 메아리 악기는 한 박 뒤에 같은 돌에 고리가 한 번 더 비치는 모습, 움직임 줄이기에서는 번지는 고리가 없는 모습을 본다.
// 7-4: 악기가 다섯(높낮이 미끄럼길, 물방울 북, 메아리 벽, 바람개비 줄, 연잎 합창)이 되었고 돌 아래 바닥도 물·비탈·밧줄·연못으로 늘었다.
// 악기는 번호가 아니라 이름(playId)으로 고른다: 그림판, 바닥, 글자는 모두 악기 차례대로 만들어진다.
// Phaser 없이 가짜 장면(tests/unit/fake-phaser.ts)으로 시험한다. 실제 화면의 모습은 브라우저 흐름 시험과 눈으로 보는 점검의 몫이다.
import { describe, expect, it } from 'vitest';
import { loadPlayInstruments } from '@/app/discovery-data';
import { padSitesOf, PAD_RADIUS } from '@/domain/play';
import { BEAT_SEC } from '@/domain/worldsound';
import { ECHO_FLASH_SECONDS, PLAY_DEPTH, PlayLayer, STRIKE_FLASH_SECONDS } from '@/world/play/layer';
import { GOLD_TEXT_CSS, INK_CSS } from '@/world/installations/palette';
import { FakeScene, fakeCull } from './fake-phaser';

const PLAYS = loadPlayInstruments('preview');
const SLIDE = 'play.staff-hill.pitch-slide';
const DRUM = 'play.beat-river.drum';
const WALL = 'play.bell-grove.echo-wall';
const PINWHEELS = 'play.scale-trail.pinwheels';
const LILIES = 'play.key-marsh.lily-chorus';
/** 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪) */
const IDS = [SLIDE, DRUM, WALL, PINWHEELS, LILIES];

const nums = (calls: unknown[][]): number[][] => calls as number[][];
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

function rig() {
  const scene = new FakeScene();
  const layer = new PlayLayer(scene as never, PLAYS, fakeCull());
  const order = PLAYS.map((p) => p.playId);
  /** 악기마다 하나인 돌 그림판(깊이 PLAY_DEPTH): 악기 차례대로 */
  const boards = scene.graphics.filter((g) => g.depth === PLAY_DEPTH);
  /** 바닥이 있는 악기에만 하나씩 있는 바닥 그림(깊이 PLAY_DEPTH − 1): 악기 차례대로 */
  const grounds = scene.graphics.filter((g) => g.depth === PLAY_DEPTH - 1);
  const withGround = PLAYS.filter((p) => p.ground !== 'none').map((p) => p.playId);
  const instrument = (playId: string) => PLAYS.find((p) => p.playId === playId)!;
  const boardOf = (playId: string) => boards[order.indexOf(playId)]!;
  const groundOf = (playId: string) => grounds[withGround.indexOf(playId)];
  /** 그 악기의 돌 위 글자들(글자는 악기 차례, 돌 차례대로 만들어진다) */
  const labelsOf = (playId: string) => {
    const before = PLAYS.slice(0, order.indexOf(playId)).reduce((n, p) => n + padSitesOf(p).length, 0);
    return scene.texts.slice(before, before + padSitesOf(instrument(playId)).length);
  };
  const states = (playId: string): string[] => layer.debug().find((p) => p.playId === playId)!.pads.map((p) => p.state);
  return { scene, layer, boards, grounds, boardOf, groundOf, labelsOf, states, instrument };
}

describe('놀이 악기 층: 처음 모습', () => {
  it('보이는 악기는 지역 차례의 다섯이다', () => {
    expect(PLAYS.map((p) => p.playId)).toEqual(IDS);
  });

  it('악기마다 돌 그림판 하나와 돌마다 음 이름 글자 하나를 만든다. 바닥 그림은 바닥이 있는 네 악기에만 있다', () => {
    const r = rig();
    expect(r.boards).toHaveLength(5);
    expect(r.grounds).toHaveLength(4);
    expect(r.scene.texts).toHaveLength(4 + 5 + 5 + 5 + 5);
    expect(r.layer.debug().map((d) => [d.playId, d.ground])).toEqual([
      [SLIDE, 'slope'],
      [DRUM, 'pool'],
      [WALL, 'none'],
      [PINWHEELS, 'rope'],
      [LILIES, 'lilies'],
    ]);
    expect(r.groundOf(WALL)).toBeUndefined();
    // 바닥은 돌보다 아래, 글자는 돌 위
    for (const id of IDS) {
      const ground = r.groundOf(id);
      if (ground) expect(ground.depth).toBeLessThan(r.boardOf(id).depth);
      for (const t of r.labelsOf(id)) expect(t.depth).toBe(PLAY_DEPTH + 1);
    }
  });

  it('깊이는 바닥 그림 위, 설치물 돌 층(-90000) 아래다', () => {
    expect(PLAY_DEPTH).toBeLessThan(-90_000);
    expect(PLAY_DEPTH).toBeGreaterThan(-100_000);
  });

  it('돌 위의 음 이름은 돌의 음이다: 물방울 북 C3 G3 C4 E4, 나머지 넷은 C4 D4 E4 G4 A4', () => {
    const r = rig();
    const labels = (id: string) => r.layer.debug().find((p) => p.playId === id)!.pads.map((p) => p.label);
    expect(labels(DRUM)).toEqual(['C3', 'G3', 'C4', 'E4']);
    for (const id of [SLIDE, WALL, PINWHEELS, LILIES]) expect(labels(id), id).toEqual(['C4', 'D4', 'E4', 'G4', 'A4']);
    for (const id of IDS) expect(r.labelsOf(id).map((t) => t.text), id).toEqual(labels(id));
    const names = Object.fromEntries(r.layer.debug().map((p) => [p.playId, p.name]));
    expect(names).toEqual({
      [SLIDE]: '높낮이 미끄럼길',
      [DRUM]: '물방울 북',
      [WALL]: '메아리 벽',
      [PINWHEELS]: '바람개비 줄',
      [LILIES]: '연잎 합창',
    });
  });

  it('돌의 자리는 악기의 돌 자리와 같고 처음에는 모두 쉬는 모습이다', () => {
    const r = rig();
    for (const inst of PLAYS) {
      const drawn = r.layer.debug().find((p) => p.playId === inst.playId)!;
      expect(drawn.pads.map((p) => [p.x, p.y, p.midi])).toEqual(padSitesOf(inst).map((s) => [s.x, s.y, s.midi]));
      expect(drawn.pads.every((p) => p.state === 'idle')).toBe(true);
    }
  });

  it('쉬는 돌은 그림자 원과 돌 원(반지름 44)과 가장자리 선이다. 다섯 악기 모두 같은 모양이다', () => {
    const r = rig();
    for (const id of IDS) {
      const board = r.boardOf(id);
      const pads = padSitesOf(r.instrument(id)).length;
      const radii = board.calls('fillCircle').map((a) => a[2]);
      expect(radii, id).toHaveLength(2 * pads);
      expect(radii.every((x) => x === PAD_RADIUS)).toBe(true);
      expect(board.count('strokeCircle'), id).toBe(pads);
    }
  });

  it('물방울 북의 물 바닥은 한 번만 그린다: 물빛 원 하나와 물결 고리 둘', () => {
    const r = rig();
    const pool = r.groundOf(DRUM)!;
    expect(pool.count('fillCircle')).toBe(1);
    expect(pool.count('strokeCircle')).toBe(2);
  });
});

describe('돌 아래의 바닥 그림(7-4)', () => {
  it('바닥은 한 번만 그린다: 돌을 밟고 프레임이 흘러도 바닥 그림은 다시 그려지지 않는다', () => {
    const r = rig();
    const before = r.grounds.map((g) => g.log.length);
    expect(before.every((n) => n > 0)).toBe(true);
    for (const id of IDS) r.layer.strike(id, 2, 1);
    for (let i = 0; i < 60; i++) r.layer.update(1 + i / 60, false);
    expect(r.grounds.map((g) => g.log.length)).toEqual(before);
    expect(r.grounds.every((g) => g.count('clear') === 0)).toBe(true);
  });

  it('높낮이 미끄럼길: 비탈 띠 하나에 돌 사이마다 \'더 높은 음\' 쪽(화면 위)을 가리키는 쐐기(^)가 있다', () => {
    const r = rig();
    const ground = r.groundOf(SLIDE)!;
    expect(ground.count('fillRoundedRect')).toBe(2); // 그림자와 비탈
    expect(ground.count('strokeRoundedRect')).toBe(1); // 가장자리 선
    const sites = padSitesOf(r.instrument(SLIDE));
    const lines = nums(ground.calls('lineBetween'));
    expect(lines).toHaveLength(2 * (sites.length - 1)); // 쐐기마다 두 날개
    for (let i = 0; i + 1 < sites.length; i++) {
      const a = sites[i]!;
      const b = sites[i + 1]!;
      expect(b.midi, `${i + 1}번 돌 → ${i + 2}번 돌`).toBeGreaterThan(a.midi); // 번호가 커지면 음이 높다
      const [w1, w2] = [lines[2 * i]!, lines[2 * i + 1]!];
      // 두 날개는 같은 꼭짓점에서 만난다
      expect([w1[2], w1[3]]).toEqual([w2[2], w2[3]]);
      const [tipX, tipY] = [w1[2]!, w1[3]!];
      // 꼭짓점은 두 돌 사이에 있고 높은 음 쪽 돌에 더 가깝다
      expect(dist(tipX, tipY, b.x, b.y)).toBeLessThan(dist(tipX, tipY, a.x, a.y));
      expect(tipY).toBeLessThan((a.y + b.y) / 2); // 높은 음이 화면 위쪽이다
      // 날개는 꼭짓점 아래(낮은 음 쪽)에서 좌우로 벌어진다
      expect(w1[1]!).toBeGreaterThan(tipY);
      expect(w2[1]!).toBeGreaterThan(tipY);
      expect(Math.sign(w1[0]! - tipX)).toBe(-Math.sign(w2[0]! - tipX));
    }
  });

  it('바람개비 줄: 첫 돌에서 마지막 돌 너머까지 밧줄이 걸리고, 양 끝에 기둥이 서고, 돌마다 위에 바람개비가 꽂힌다', () => {
    const r = rig();
    const ground = r.groundOf(PINWHEELS)!;
    const sites = padSitesOf(r.instrument(PINWHEELS));
    const first = sites[0]!;
    const last = sites[sites.length - 1]!;
    const lines = nums(ground.calls('lineBetween'));
    expect(lines).toHaveLength(2 + sites.length); // 밧줄 그림자와 밧줄, 돌마다 막대 하나
    const [, rope] = lines as [number[], number[]];
    const [sx, sy, ex, ey] = rope as [number, number, number, number];
    // 밧줄은 첫 돌과 마지막 돌 바깥까지 뻗고 돌 줄과 같은 높이에 걸린다
    expect(sx).toBeLessThan(first.x - PAD_RADIUS);
    expect(ex).toBeGreaterThan(last.x + PAD_RADIUS);
    expect([sy, ey]).toEqual([first.y, last.y]);
    // 기둥(둥근 모서리 직사각형) 둘과 그 그림자: 기둥 가운데가 밧줄 끝에 선다
    const posts = nums(ground.calls('fillRoundedRect'));
    expect(posts).toHaveLength(4);
    for (const [px, py] of [[sx, sy], [ex, ey]] as const) {
      expect(posts.some(([x, y, w, h]) => x === px - w! / 2 && y === py - h! / 2), `기둥 ${px},${py}`).toBe(true);
    }
    // 돌마다 바람개비: 날개 넷(삼각형)과 가운데 축(원 하나)이 돌 바로 위(돌 위쪽 가장자리보다 위)에 있다
    expect(ground.count('fillTriangle')).toBe(4 * sites.length);
    const hubs = nums(ground.calls('fillCircle'));
    expect(hubs).toHaveLength(sites.length);
    sites.forEach((s, i) => {
      const [hx, hy] = hubs[i]!;
      expect(hx, `${i + 1}번 돌`).toBe(s.x);
      expect(hy!).toBeLessThan(s.y - PAD_RADIUS);
    });
  });

  it('연잎 합창: 돌들을 감싸는 연못 하나와, 돌마다 그 돌을 받치는 연잎 한 장(한 귀퉁이가 연못 가운데를 향해 터졌다)', () => {
    const r = rig();
    const ground = r.groundOf(LILIES)!;
    const inst = r.instrument(LILIES);
    const sites = padSitesOf(inst);
    const circles = nums(ground.calls('fillCircle'));
    expect(circles).toHaveLength(1 + 2 * sites.length); // 연못, 돌마다 연잎 그림자와 연잎
    const [px, py, pondRadius] = circles[0] as [number, number, number];
    expect([px, py]).toEqual([inst.x, inst.y]);
    // 연잎: 돌 가운데에 놓인 돌보다 큰 원이고, 서로 겹치지 않고, 연못 안에 다 들어간다
    const leaves = sites.map((s) => circles.find(([x, y, rad]) => x === s.x && y === s.y && rad! > PAD_RADIUS));
    leaves.forEach((leaf, i) => expect(leaf, `${i + 1}번 돌의 연잎`).toBeDefined());
    const leafRadius = leaves[0]![2]!;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i]!;
      expect(dist(s.x, s.y, px, py) + leafRadius, `${i + 1}번 연잎이 연못 안`).toBeLessThan(pondRadius);
      for (let j = i + 1; j < sites.length; j++) {
        const t = sites[j]!;
        expect(dist(s.x, s.y, t.x, t.y), `${i + 1}번과 ${j + 1}번 연잎`).toBeGreaterThanOrEqual(2 * leafRadius);
      }
    }
    // 터진 곳: 연잎마다 삼각형 하나, 꼭짓점은 돌 가운데에 있고 나머지 두 점은 연못 가운데 쪽이다
    const notches = nums(ground.calls('fillTriangle'));
    expect(notches).toHaveLength(sites.length);
    sites.forEach((s, i) => {
      const [ax, ay, bx, by, cx, cy] = notches[i] as [number, number, number, number, number, number];
      expect([ax, ay], `${i + 1}번 연잎`).toEqual([s.x, s.y]);
      const mid = [(bx + cx) / 2, (by + cy) / 2] as const;
      expect(dist(mid[0], mid[1], px, py)).toBeLessThan(dist(s.x, s.y, px, py));
    });
  });

  it('바닥은 길과 막힘에 영향이 없는 그림일 뿐이라 그림판 개수 말고는 장면에 더하는 것이 없다', () => {
    const r = rig();
    // 장면에 더한 것은 바닥 4 + 돌 그림판 5 + 글자 24뿐이다
    expect(r.scene.graphics).toHaveLength(4 + 5);
    expect(r.scene.texts).toHaveLength(24);
  });
});

describe('돌을 밟으면', () => {
  it('밟은 돌만 잠깐 밝아지고(struck) 곧 쉬는 모습으로 돌아온다', () => {
    const r = rig();
    r.layer.strike(DRUM, 2, 10);
    r.layer.update(10.05, false);
    expect(r.states(DRUM)).toEqual(['idle', 'struck', 'idle', 'idle']);
    expect(r.states(WALL)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
    r.layer.update(10 + STRIKE_FLASH_SECONDS - 0.01, false);
    expect(r.states(DRUM)[1]).toBe('struck');
    r.layer.update(10 + STRIKE_FLASH_SECONDS + 0.01, false);
    expect(r.states(DRUM)).toEqual(['idle', 'idle', 'idle', 'idle']);
  });

  it('다섯 악기 모두 밟은 돌만 밝아진다(새 악기 셋 포함)', () => {
    for (const id of IDS) {
      const r = rig();
      const pads = padSitesOf(r.instrument(id)).length;
      r.layer.strike(id, pads, 4);
      r.layer.update(4.05, false);
      const expected = Array.from({ length: pads }, (_, i) => (i === pads - 1 ? 'struck' : 'idle'));
      expect(r.states(id), id).toEqual(expected);
      for (const other of IDS.filter((o) => o !== id)) expect(r.states(other).every((s) => s === 'idle'), `${id} → ${other}`).toBe(true);
      r.layer.update(4 + STRIKE_FLASH_SECONDS + 0.01, false);
      expect(r.states(id).every((s) => s === 'idle'), id).toBe(true);
    }
  });

  it('밝은 돌은 색만 바뀌지 않는다: 금빛 원에 겹고리(안쪽 선)가 생기고, 번지는 고리가 하나 더 생긴다', () => {
    const r = rig();
    const board = r.boardOf(DRUM);
    board.reset();
    r.layer.strike(DRUM, 1, 3);
    r.layer.update(3.1, false);
    // 돌 하나가 밝다: 쉬는 돌 셋은 선 하나씩(3), 밝은 돌은 선 둘 + 번지는 고리(3)
    expect(board.count('strokeCircle')).toBe(3 + 3);
    r.layer.update(3.2, false);
    expect(board.count('strokeCircle')).toBe(2 * (3 + 3)); // 번지는 동안은 프레임마다 다시 그린다
  });

  it('움직임 줄이기에서는 번지는 고리가 없고 그 자리에서 채워질 뿐이라 다시 그리지 않는다', () => {
    const r = rig();
    const board = r.boardOf(DRUM);
    r.layer.strike(DRUM, 1, 3);
    board.reset();
    r.layer.update(3.1, true);
    expect(board.count('strokeCircle')).toBe(3 + 2); // 쉬는 돌 셋 + 밝은 돌의 겹고리 둘, 번지는 고리 없음
    const clears = board.count('clear');
    r.layer.update(3.2, true);
    r.layer.update(3.25, true);
    expect(board.count('clear')).toBe(clears); // 같은 모습이면 다시 그리지 않는다
    r.layer.update(3.5, true);
    expect(r.states(DRUM)).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(board.count('clear')).toBe(clears + 1); // 쉬는 모습으로 돌아올 때 한 번
  });

  it('아무도 밟지 않으면 프레임마다 다시 그리지 않는다', () => {
    const r = rig();
    const before = r.boards.map((b) => b.count('clear'));
    for (let i = 0; i < 30; i++) r.layer.update(i / 60, false);
    expect(r.boards.map((b) => b.count('clear'))).toEqual(before);
  });

  it('돌 위의 글자는 밝은 돌에서도 읽히는 먹색이다', () => {
    const r = rig();
    r.layer.strike(DRUM, 3, 1);
    r.layer.update(1.1, false);
    const labels = r.labelsOf(DRUM);
    expect(labels[2]!.color).toBe(INK_CSS);
    expect(labels.every((t) => t.color === INK_CSS)).toBe(true);
  });

  it('모르는 악기나 없는 돌을 알려 와도 아무 일도 없다', () => {
    const r = rig();
    expect(() => {
      r.layer.strike('play.beat-river.nothing', 1, 2);
      r.layer.strike(DRUM, 0, 2);
      r.layer.strike(DRUM, 9, 2);
      r.layer.update(2.1, false);
    }).not.toThrow();
    expect(r.states(DRUM)).toEqual(['idle', 'idle', 'idle', 'idle']);
  });

  it('같은 돌을 다시 밟으면 처음부터 다시 밝아진다', () => {
    const r = rig();
    r.layer.strike(DRUM, 4, 1);
    r.layer.update(1.5, false);
    expect(r.states(DRUM)[3]).toBe('idle');
    r.layer.strike(DRUM, 4, 2);
    r.layer.update(2.05, false);
    expect(r.states(DRUM)[3]).toBe('struck');
  });
});

describe('메아리 벽: 한 박 뒤에 같은 돌에 고리가 한 번 더 비친다', () => {
  it('밟은 직후는 밝고, 한 박(0.75초) 뒤에 고리(echo), 그 뒤는 다시 쉰다', () => {
    const r = rig();
    r.layer.strike(WALL, 3, 5);
    r.layer.update(5.1, false);
    expect(r.states(WALL)).toEqual(['idle', 'idle', 'struck', 'idle', 'idle']);
    r.layer.update(5 + STRIKE_FLASH_SECONDS + 0.05, false); // 밝음이 끝나고 메아리가 오기 전
    expect(r.states(WALL)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
    r.layer.update(5 + BEAT_SEC + 0.05, false);
    expect(r.states(WALL)).toEqual(['idle', 'idle', 'echo', 'idle', 'idle']);
    r.layer.update(5 + BEAT_SEC + ECHO_FLASH_SECONDS - 0.01, false);
    expect(r.states(WALL)[2]).toBe('echo');
    r.layer.update(5 + BEAT_SEC + ECHO_FLASH_SECONDS + 0.01, false);
    expect(r.states(WALL)).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
  });

  it('되돌아온 소리는 밟은 돌의 겹고리와 다른 모양이다: 돌 가장자리 바깥의 얇은 금빛 고리 하나', () => {
    const r = rig();
    const board = r.boardOf(WALL);
    r.layer.strike(WALL, 1, 5);
    r.layer.update(5 + BEAT_SEC + 0.05, false);
    board.reset();
    r.layer.update(5 + BEAT_SEC + 0.1, false);
    const rings = board.calls('strokeCircle').map((a) => a[2]);
    expect(rings).toContain(PAD_RADIUS + 4); // 메아리 고리
    expect(board.count('strokeCircle')).toBe(5 + 1); // 돌 다섯의 가장자리 선 + 메아리 고리 하나
  });

  it('되돌아온 돌의 음 이름 글자는 금빛이 도는 글자색이고, 끝나면 먹색으로 돌아온다', () => {
    const r = rig();
    const wallLabels = r.labelsOf(WALL);
    r.layer.strike(WALL, 2, 5);
    r.layer.update(5 + BEAT_SEC + 0.05, false);
    expect(wallLabels[1]!.color).toBe(GOLD_TEXT_CSS);
    r.layer.update(5 + BEAT_SEC + ECHO_FLASH_SECONDS + 0.05, false);
    expect(wallLabels[1]!.color).toBe(INK_CSS);
  });

  it('메아리가 없는 악기(물방울 북과 나머지 셋)는 한 박 뒤에 아무 일도 없다', () => {
    const r = rig();
    for (const id of IDS.filter((x) => x !== WALL)) r.layer.strike(id, 1, 5);
    r.layer.update(5 + BEAT_SEC + 0.05, false);
    for (const id of IDS.filter((x) => x !== WALL)) expect(r.states(id).every((s) => s === 'idle'), id).toBe(true);
  });

  it('움직임 줄이기에서도 메아리 고리는 그려진다(번지지 않고 그 자리에서만)', () => {
    const r = rig();
    r.layer.strike(WALL, 5, 5);
    r.layer.update(5 + BEAT_SEC + 0.05, true);
    expect(r.states(WALL)[4]).toBe('echo');
    const board = r.boardOf(WALL);
    const clears = board.count('clear');
    r.layer.update(5 + BEAT_SEC + 0.1, true);
    expect(board.count('clear')).toBe(clears); // 같은 모습이면 다시 그리지 않는다
  });
});

describe('정리', () => {
  it('destroy하면 돌 그림판과 바닥 그림과 글자를 모두 없앤다. 그 뒤 알림은 아무 일도 없다', () => {
    const r = rig();
    expect(r.scene.graphics).toHaveLength(9);
    r.layer.destroy();
    expect(r.scene.graphics.every((g) => g.destroyed)).toBe(true);
    expect(r.scene.texts.every((t) => t.destroyed)).toBe(true);
    expect(() => {
      r.layer.strike(DRUM, 1, 1);
      r.layer.update(1.1, false);
    }).not.toThrow();
    expect(r.layer.debug()).toEqual([]);
  });

  it('악기가 하나도 없으면 아무것도 만들지 않는다', () => {
    const scene = new FakeScene();
    const layer = new PlayLayer(scene as never, [], fakeCull());
    expect(scene.graphics).toEqual([]);
    expect(scene.texts).toEqual([]);
    layer.update(1, false);
    expect(layer.debug()).toEqual([]);
  });
});
