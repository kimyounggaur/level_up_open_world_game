// 설치물 파일(content/installations/*.json)을 읽는다. 빌드 때 `npm run validate`가 정거장·과제와의 연결까지 먼저 검사하고,
// 여기서는 파일 하나하나의 모양과 설치물 사이의 겹침(같은 id, 자리 번호, 자리 겹침)만 다시 확인한다(loadRegions와 같은 방식).
import { parseInstallation, validateInstallationSet } from '../domain/installation';
import type { InstallationDef } from '../domain/installation';

const INSTALLATION_MODULES = import.meta.glob('../../content/installations/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadInstallations(): InstallationDef[] {
  const list: InstallationDef[] = [];
  for (const [file, raw] of Object.entries(INSTALLATION_MODULES).sort(([a], [b]) => a.localeCompare(b))) {
    const { installation, issues } = parseInstallation(raw, file);
    if (!installation) throw new Error(`설치물 파일을 읽을 수 없어요: ${file} — ${issues.map((i) => i.message).join(' / ')}`);
    list.push(installation);
  }
  const problems = validateInstallationSet(list);
  if (problems.length > 0) throw new Error(`설치물 파일에 문제가 있어요: ${problems.map((p) => p.message).join(' / ')}`);
  return list;
}
