// Tiled(.tmj) 지도 파일 읽기(설계서 6-3, 10.1 "맵 편집: B부터 Tiled").
// 사물을 코드가 아니라 지도 파일에 놓는다. 지도는 월드와 같은 칸(32 px, 256×192)이고, 사물 층(objectgroup)만 읽는다.
//   점 사물(point)        class = tree | sign | prop : 그림(sprite 속성)을 놓는다
//   사각형 사물(rectangle) class = hit            : 정거장의 누르기 영역(station 속성)
//   사각형·타원 사물       class = block          : 막힌 자리(타원은 가로 = 세로인 원만)
// 속성 이름과 뜻은 docs/world-source.md에 적는다. 순수 계산이다: 파일을 읽는 일은 tools/world-source.ts가 한다.

export type TiledPropValue = string | number | boolean;

export interface TiledObject {
  /** Tiled가 붙인 번호(지도 안에서 겹치지 않는다) */
  id: number;
  /** 사물의 id. 월드 전체에서 겹치지 않는다 */
  name: string;
  /** class(Tiled 1.9 이후) 또는 type(그 이전) */
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point: boolean;
  ellipse: boolean;
  props: Record<string, TiledPropValue>;
  /** 어느 지도 파일에서 읽었는가(오류 문구용) */
  file: string;
}

export interface TiledMap {
  file: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  objects: TiledObject[];
}

export const TILED_KINDS = ['tree', 'sign', 'prop', 'hit', 'block'] as const;
export type TiledKind = (typeof TILED_KINDS)[number];
export const isTiledKind = (v: string): v is TiledKind => (TILED_KINDS as readonly string[]).includes(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 읽는 도중 모은 문제 목록과 함께 지도를 돌려준다. 문제가 하나라도 있으면 map은 null이다 */
export function parseTiledMap(raw: unknown, file: string, expected: { width: number; height: number; tile: number }): { map: TiledMap | null; issues: string[] } {
  const issues: string[] = [];
  const bad = (msg: string): void => {
    issues.push(`${file}: ${msg}`);
  };
  if (!isRecord(raw)) return { map: null, issues: [`${file}: Tiled 지도(JSON 객체)가 아니에요`] };
  if (raw.type !== 'map') bad(`type이 "map"이어야 해요(받은 값: ${JSON.stringify(raw.type)})`);
  if (raw.orientation !== 'orthogonal') bad('orientation은 orthogonal이어야 해요');
  if (raw.infinite !== false && raw.infinite !== undefined) bad('끝없는 지도(infinite)는 쓰지 않아요');
  const width = raw.width;
  const height = raw.height;
  const tw = raw.tilewidth;
  const th = raw.tileheight;
  if (!isNum(width) || !isNum(height)) bad('width와 height(칸 수)가 숫자여야 해요');
  else if (width !== expected.width || height !== expected.height) bad(`지도 크기는 ${expected.width}×${expected.height}칸이어야 해요(받은 값: ${width}×${height})`);
  if (!isNum(tw) || !isNum(th)) bad('tilewidth와 tileheight가 숫자여야 해요');
  else if (tw !== expected.tile || th !== expected.tile) bad(`칸 크기는 ${expected.tile} px이어야 해요(받은 값: ${tw}×${th})`);
  if (!Array.isArray(raw.layers)) {
    bad('layers가 목록이어야 해요');
    return { map: null, issues };
  }

  const objects: TiledObject[] = [];
  const seenIds = new Set<number>();
  for (const [li, layer] of raw.layers.entries()) {
    if (!isRecord(layer)) {
      bad(`layers[${li}]가 객체가 아니에요`);
      continue;
    }
    // 사물 층만 읽는다. 그림 층이나 칸 층은 참고용이므로 건너뛴다
    if (layer.type !== 'objectgroup') continue;
    if (layer.visible === false) continue;
    const lname = typeof layer.name === 'string' ? layer.name : `#${li}`;
    if (!Array.isArray(layer.objects)) {
      bad(`층 ${lname}: objects가 목록이어야 해요`);
      continue;
    }
    for (const [oi, o] of layer.objects.entries()) {
      const where = `층 ${lname}의 ${oi + 1}번째 사물`;
      if (!isRecord(o)) {
        bad(`${where}이 객체가 아니에요`);
        continue;
      }
      // Tiled에서 눈 아이콘으로 감춘 사물은 월드에 놓지 않는다
      if (o.visible === false) continue;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name) {
        bad(`${where}에 이름(name)이 없어요. 이름이 사물의 id예요`);
        continue;
      }
      const id = o.id;
      if (!isNum(id) || !Number.isInteger(id)) bad(`${name}: id가 정수가 아니에요`);
      else if (seenIds.has(id)) bad(`${name}: Tiled 번호(id) ${id}가 같은 지도의 다른 사물과 겹쳐요`);
      else seenIds.add(id);
      const kindRaw = typeof o.class === 'string' && o.class !== '' ? o.class : typeof o.type === 'string' ? o.type : '';
      if (!isTiledKind(kindRaw)) {
        bad(`${name}: class는 ${TILED_KINDS.join(' / ')} 중 하나여야 해요(받은 값: ${JSON.stringify(kindRaw)})`);
        continue;
      }
      if (!isNum(o.x) || !isNum(o.y)) {
        bad(`${name}: x와 y가 숫자여야 해요`);
        continue;
      }
      const w = o.width === undefined ? 0 : o.width;
      const h = o.height === undefined ? 0 : o.height;
      if (!isNum(w) || !isNum(h)) {
        bad(`${name}: width와 height가 숫자여야 해요`);
        continue;
      }
      const props: Record<string, TiledPropValue> = {};
      if (o.properties !== undefined) {
        if (!Array.isArray(o.properties)) {
          bad(`${name}: properties가 목록이어야 해요`);
          continue;
        }
        for (const p of o.properties) {
          if (!isRecord(p) || typeof p.name !== 'string') {
            bad(`${name}: 속성 하나가 {name, type, value} 꼴이 아니에요`);
            continue;
          }
          const v = p.value;
          if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
            bad(`${name}: 속성 ${p.name}의 값은 글, 숫자, 참/거짓이어야 해요`);
            continue;
          }
          if (p.name in props) bad(`${name}: 속성 ${p.name}이 두 번 적혔어요`);
          props[p.name] = v;
        }
      }
      objects.push({ id: isNum(id) ? id : -1, name, kind: kindRaw, x: o.x, y: o.y, width: w, height: h, point: o.point === true, ellipse: o.ellipse === true, props, file });
    }
  }
  if (issues.length > 0) return { map: null, issues };
  return { map: { file, width: expected.width, height: expected.height, tilewidth: expected.tile, tileheight: expected.tile, objects }, issues };
}

// ───── 속성을 꺼내는 도우미 ─────
export interface PropReader {
  str(name: string): string | undefined;
  num(name: string): number | undefined;
  /** 쓰지 않은 속성 이름(오타를 잡는다) */
  unknown(known: readonly string[]): string[];
}

/** 속성 읽기. 형이 틀리면 issues에 문제를 적고 undefined를 돌려준다 */
export function propReader(o: TiledObject, issues: string[]): PropReader {
  return {
    str(name) {
      const v = o.props[name];
      if (v === undefined) return undefined;
      if (typeof v !== 'string') {
        issues.push(`${o.file}: ${o.name}의 속성 ${name}은 글이어야 해요`);
        return undefined;
      }
      return v;
    },
    num(name) {
      const v = o.props[name];
      if (v === undefined) return undefined;
      if (typeof v !== 'number') {
        issues.push(`${o.file}: ${o.name}의 속성 ${name}은 숫자여야 해요`);
        return undefined;
      }
      return v;
    },
    unknown(known) {
      return Object.keys(o.props).filter((k) => !known.includes(k));
    },
  };
}

// ───── 지도 파일 쓰기(처음 옮겨 담을 때와 시험에서 쓴다) ─────
export interface TiledObjectInput {
  name: string;
  kind: TiledKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  ellipse?: boolean;
  props?: Record<string, TiledPropValue>;
}

/**
 * Tiled가 저장하는 것과 같은 모양의 .tmj 글을 만든다(들여쓰기 한 칸, 속성은 이름순).
 * Tiled에서 열고 저장해도 글이 거의 달라지지 않아서, 사람이 고친 부분만 차이로 보인다.
 */
export function renderTiledMap(objects: readonly TiledObjectInput[], dims: { width: number; height: number; tile: number }): string {
  const typeOf = (v: TiledPropValue): 'string' | 'int' | 'float' | 'bool' => (typeof v === 'string' ? 'string' : typeof v === 'boolean' ? 'bool' : Number.isInteger(v) ? 'int' : 'float');
  const out = objects.map((o, i) => {
    const props = Object.entries(o.props ?? {})
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, value]) => ({ name, type: typeOf(value), value }));
    const obj: Record<string, unknown> = {};
    obj.class = o.kind;
    if (o.ellipse) obj.ellipse = true;
    obj.height = o.height ?? 0;
    obj.id = i + 1;
    obj.name = o.name;
    if (o.point ?? (o.width === undefined && o.height === undefined)) obj.point = true;
    if (props.length > 0) obj.properties = props;
    obj.rotation = 0;
    obj.visible = true;
    obj.width = o.width ?? 0;
    obj.x = o.x;
    obj.y = o.y;
    return obj;
  });
  const map = {
    compressionlevel: -1,
    height: dims.height,
    infinite: false,
    layers: [{ draworder: 'topdown', id: 1, name: '사물', objects: out, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 }],
    nextlayerid: 2,
    nextobjectid: objects.length + 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    tileheight: dims.tile,
    tilesets: [],
    tilewidth: dims.tile,
    type: 'map',
    version: '1.10',
    width: dims.width,
  };
  return `${JSON.stringify(map, null, 1)}\n`;
}
