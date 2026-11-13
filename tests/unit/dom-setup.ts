// jsdom에는 글자 크기를 재는 기능이 없어서 VexFlow가 오류를 낸다. 테스트에서만 쓰는 대체 구현이다. 제품 코드가 아니다.
export function installDomStubs(): void {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: (kind: string) => unknown };
  proto.getContext = () => ({
    font: '',
    measureText: (text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 8,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 3,
    }),
  });
  const svgProto = SVGElement.prototype as unknown as { getBBox?: () => { x: number; y: number; width: number; height: number } };
  svgProto.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
}
