// 발견 요소 파일(content/discoveries/*.json)을 읽는다(3.6). 빌드 때 `npm run validate`가 배치 규칙까지 먼저 검사하고,
// 여기서는 파일 하나하나의 모양만 다시 확인한다(loadInstallations와 같은 방식). 정식 공개(release)에서는 공개 상태인 것만 보인다(G2-7).
import type { Channel } from '../domain/catalog';
import { parseDiscoveryFile, visibleDiscoveries, visiblePlayInstruments } from '../domain/discovery';
import type { DiscoveryDef, DiscoveryFile } from '../domain/discovery';
import type { PlayInstrumentDef } from '../domain/play';

const DISCOVERY_MODULES = import.meta.glob('../../content/discoveries/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadDiscoveryFiles(): DiscoveryFile[] {
  const files: DiscoveryFile[] = [];
  for (const [file, raw] of Object.entries(DISCOVERY_MODULES).sort(([a], [b]) => a.localeCompare(b))) {
    const { file: parsed, issues } = parseDiscoveryFile(raw, file);
    if (!parsed) throw new Error(`발견 요소 파일을 읽을 수 없어요: ${file} — ${issues.map((i) => i.message).join(' / ')}`);
    files.push(parsed);
  }
  return files;
}

/** 이 채널에서 보이는 발견 요소들(id 순서) */
export const loadDiscoveries = (channel: Channel): DiscoveryDef[] => visibleDiscoveries(loadDiscoveryFiles(), channel);

/** 이 채널에서 보이는 놀이 악기들(3.5, 지역 차례) */
export const loadPlayInstruments = (channel: Channel): PlayInstrumentDef[] => visiblePlayInstruments(loadDiscoveryFiles(), channel);
