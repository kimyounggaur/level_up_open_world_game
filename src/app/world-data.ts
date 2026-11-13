// 지역 파일(content/regions/*.json)을 읽어 월드 지도(WorldMap)로 만든다. 빌드 때 `npm run validate`가 먼저 검사한다.
import { WorldMap, parseRegion, validateRegionSet } from '../domain/world';
import type { RegionDef } from '../domain/world';

const REGION_MODULES = import.meta.glob('../../content/regions/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadRegions(): RegionDef[] {
  const regions: RegionDef[] = [];
  for (const [file, raw] of Object.entries(REGION_MODULES).sort(([a], [b]) => a.localeCompare(b))) {
    const { region, issues } = parseRegion(raw, file);
    if (!region) throw new Error(`지역 파일을 읽을 수 없어요: ${file} — ${issues.map((i) => i.message).join(' / ')}`);
    regions.push(region);
  }
  const problems = validateRegionSet(regions);
  if (problems.length > 0) throw new Error(`지역 파일에 문제가 있어요: ${problems.map((p) => p.message).join(' / ')}`);
  return regions;
}

export const loadWorldMap = (): WorldMap => new WorldMap(loadRegions());
