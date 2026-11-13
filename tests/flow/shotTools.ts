// 흐름 시험이 사진을 남기기 전에 찍힌 그림의 점 색을 읽는 도구. 6-9c의 사진 점검(phase6-play.flow.ts)이 쓰던 것과 같은 방법이다.
// 사진은 눈으로 보는 점검 자료이고 이 도구는 사람의 눈 점검을 대신하지 않는다. 다만 '돌이 나무 잎에 가려졌다'처럼 사진이 쓸모없어지는 일은 점으로 잡을 수 있다.
import sharp from 'sharp';

export type Rgb = [number, number, number];
export type PixelAt = (x: number, y: number) => Rgb;

/** 스크린샷(PNG)의 한 점 색을 읽는 함수 */
export async function pixelReader(png: Buffer): Promise<PixelAt> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x, y) => {
    const cx = Math.min(Math.max(Math.round(x), 0), info.width - 1);
    const cy = Math.min(Math.max(Math.round(y), 0), info.height - 1);
    const i = (cy * info.width + cx) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
}

export const luma = ([r, g, b]: Rgb): number => 0.299 * r + 0.587 * g + 0.114 * b;
/** 쉬는 돌의 채움색(0xf4f3ea = 244, 243, 234)은 푸른 기가 많다 */
export const isRestFill = ([r, , b]: Rgb): boolean => r >= 225 && b >= 215;
/** 밟은 돌의 채움색(0xfbe7a1 = 251, 231, 161)은 푸른 기가 적다 */
export const isGoldFill = ([r, , b]: Rgb): boolean => r >= 235 && b >= 120 && b <= 200;
export const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** 돌 가운데에서 오른쪽으로 ±70도 부채꼴(캐릭터가 서 있는 왼쪽은 캐릭터 그림이 돌을 가리므로 보지 않는다) */
export const ARC_DEG = Array.from({ length: 15 }, (_, i) => -70 + i * 10);
/** 돌 가운데에서 오른쪽 부채꼴의 점들(반지름은 월드 px, 화면 배율을 곱해서 읽는다) */
export const arcPoints = (c: { x: number; y: number }, zoom: number, radii: number[]): Array<{ x: number; y: number }> =>
  ARC_DEG.flatMap((deg) => radii.map((r) => ({ x: c.x + Math.cos((deg * Math.PI) / 180) * r * zoom, y: c.y + Math.sin((deg * Math.PI) / 180) * r * zoom })));

/** 돌 안쪽 채움을 읽은 값: 채움색에 맞는 점의 비율과 가운데 값. 음 이름 글자를 피하려고 반지름 20~26 px를 본다 */
export function fillOf(at: PixelAt, c: { x: number; y: number }, zoom: number): { gold: number; rest: number; mid: Rgb } {
  const px = arcPoints(c, zoom, [20, 23, 26]).map((p) => at(p.x, p.y));
  return {
    gold: px.filter(isGoldFill).length / px.length,
    rest: px.filter(isRestFill).length / px.length,
    mid: [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))],
  };
}

export const rgbText = (c: Rgb): string => `(${c.join(', ')})`;
export const pct = (v: number): string => `${Math.round(v * 100)}%`;
