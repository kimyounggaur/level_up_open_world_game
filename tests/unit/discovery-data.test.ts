// 앱이 발견 요소 파일(content/discoveries/*.json)을 읽는 길: 빌드에 묶이는 파일을 모양까지 다시 확인하고, 채널에 맞게 보이는 것만 돌려준다.
import { describe, expect, it } from 'vitest';
import { loadDiscoveries, loadDiscoveryFiles } from '@/app/discovery-data';
import { isConceptNote, isSoundPiece } from '@/domain/discovery';

/** 한 지역의 발견 요소 id를 쪽지 3개, 소리 조각 6개 차례로 */
const idsOf = (region: string): string[] => [
  ...[1, 2, 3].map((n) => `disc.${region}.note-${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `disc.${region}.piece-${n}`),
];

describe('발견 요소 파일 읽기', () => {
  it('지역 파일 여섯을 읽는다(파일 이름 순서): 지역마다 소리 조각 6개와 개념 쪽지 3개', () => {
    const files = loadDiscoveryFiles();
    expect(files.map((f) => f.regionId)).toEqual(['beat-river', 'bell-grove', 'key-marsh', 'scale-trail', 'staff-hill', 'village']);
    for (const f of files) {
      expect(f.items, f.regionId).toHaveLength(9);
      expect(f.items.filter(isSoundPiece), f.regionId).toHaveLength(6);
      expect(f.items.filter(isConceptNote), f.regionId).toHaveLength(3);
    }
  });

  it('미리보기 채널에서는 검수 전이어도 모두 보이고, 차례는 마을이 먼저, 이어서 지역 차례(오선 언덕, 박자 강가, 종나무 숲, 음계 길, 건반 늪), 지역 안에서는 id의 숫자 순서다(쪽지가 소리 조각 앞)', () => {
    const items = loadDiscoveries('preview');
    expect(items).toHaveLength(54);
    expect(items.map((d) => d.discoveryId)).toEqual(['village', 'staff-hill', 'beat-river', 'bell-grove', 'scale-trail', 'key-marsh'].flatMap(idsOf));
  });

  it('정식 공개(release)에서는 검수와 권리 확인을 마친 것만 보인다: 지금은 모두 사람 확인 대기라 하나도 보이지 않는다(G2-7)', () => {
    expect(loadDiscoveries('release')).toEqual([]);
    for (const d of loadDiscoveries('preview')) {
      expect(d.availability, d.discoveryId).toBe('draft');
      expect(d.reviewStatus, d.discoveryId).not.toBe('reviewed');
    }
  });
});
