// 8-1 출처·권리 대장의 현황 보고. 대장(그림·소리·글꼴·라이브러리)과, 콘텐츠 파일에 적힌 교재·작곡 콘텐츠의 권리 기록(11.4의 첫 항목)을
// 한 장으로 모아 '미확인'이 어디에 몇 건 남았는지 보여 준다. 사람이 확인해야 할 것을 세는 것이지 확인을 대신하지 않는다.
import { summarizeLedger } from '../src/domain/ledger';
import type { AssetLedger } from '../src/domain/ledger';
import { loadContent } from './content-loader';
import { loadLedger } from './ledger-files';

type Counts = Record<string, number>;
const bump = (c: Counts, key: unknown): void => {
  const k = typeof key === 'string' ? key : '(없음)';
  c[k] = (c[k] ?? 0) + 1;
};
const show = (c: Counts): string =>
  Object.entries(c)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ') || '없음';

export interface ContentRights {
  quests: number;
  questAvailability: Counts;
  questRefs: number;
  questRefRights: Counts;
  questRefReview: Counts;
  reviewSteps: number;
  reviewStepStatus: Counts;
  discoveryItems: number;
  discoveryReview: Counts;
  discoveryRights: Counts;
  textbookRefs: number;
  textbookRefRights: Counts;
  playInstruments: number;
  playRights: Counts;
}

const asObjects = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []);

/** 콘텐츠 파일에 적힌 출처·검수·권리 상태를 센다 */
export function contentRightsOf(root: string): ContentRights {
  const loaded = loadContent(root);
  const r: ContentRights = {
    quests: loaded.quests.length,
    questAvailability: {},
    questRefs: 0,
    questRefRights: {},
    questRefReview: {},
    reviewSteps: 0,
    reviewStepStatus: {},
    discoveryItems: 0,
    discoveryReview: {},
    discoveryRights: {},
    textbookRefs: 0,
    textbookRefRights: {},
    playInstruments: 0,
    playRights: {},
  };
  for (const q of loaded.quests) {
    const d = q.data as Record<string, unknown>;
    bump(r.questAvailability, d['availability']);
    for (const ref of asObjects(d['sourceRefs'])) {
      r.questRefs += 1;
      bump(r.questRefRights, ref['rightsStatus']);
      bump(r.questRefReview, ref['reviewStatus']);
    }
  }
  for (const step of asObjects(loaded.reviewLog)) {
    r.reviewSteps += 1;
    bump(r.reviewStepStatus, step['status']);
  }
  for (const f of loaded.discoveries) {
    const d = f.data as Record<string, unknown>;
    for (const item of asObjects(d['items'])) {
      r.discoveryItems += 1;
      bump(r.discoveryReview, item['reviewStatus']);
      bump(r.discoveryRights, item['rightsStatus']);
      for (const ref of asObjects(item['textbookRefs'])) {
        r.textbookRefs += 1;
        bump(r.textbookRefRights, ref['rightsStatus']);
      }
    }
    for (const p of asObjects(d['playInstruments'])) {
      r.playInstruments += 1;
      bump(r.playRights, p['rightsStatus']);
    }
  }
  return r;
}

export function rightsReportText(root: string, ledger: AssetLedger = loadLedger(root)): string {
  const s = summarizeLedger(ledger);
  const c = contentRightsOf(root);
  const lines: string[] = [];
  lines.push('출처·권리 대장 현황 (자동으로 셀 수 있는 것만 센다. 권리를 확인해 주는 것이 아니다)');
  lines.push('');
  lines.push(`대장 항목 ${s.total}개: ${show(s.byKind)}`);
  lines.push(`  권리: 자체 제작 ${s.byRights.own} · 외부(라이선스 확인) ${s.byRights.licensed} · 미확인 ${s.byRights.unconfirmed} · 배포물 아님 ${s.byRights['not-shipped']}`);
  lines.push('');
  lines.push('1) 그림·소리·글꼴·외부 코드(대장)');
  if (s.unconfirmed.length === 0) lines.push('  미확인 0건');
  for (const u of s.unconfirmed) lines.push(`  미확인: ${u.assetId} — 공개 전에 막는 방법: ${u.gate}`);
  lines.push('');
  lines.push('2) 교재에서 온 콘텐츠와 작곡 콘텐츠(콘텐츠 파일의 기록)');
  lines.push(`  과제 ${c.quests}개: 공개 상태 ${show(c.questAvailability)}`);
  lines.push(`  과제의 출처 기록 ${c.questRefs}개: 권리 ${show(c.questRefRights)} · 검수 ${show(c.questRefReview)}`);
  lines.push(`  검수 기록(review-log) ${c.reviewSteps}단계: ${show(c.reviewStepStatus)}`);
  lines.push(`  발견 요소 ${c.discoveryItems}개: 검수 ${show(c.discoveryReview)} · 권리 ${show(c.discoveryRights)}`);
  lines.push(`  발견 요소의 교재 참조 ${c.textbookRefs}개: 권리 ${show(c.textbookRefRights)}`);
  lines.push(`  놀이 악기 ${c.playInstruments}개: 권리 ${show(c.playRights)}`);
  lines.push('');
  const unconfirmedContent = (c.questRefRights['unconfirmed'] ?? 0) + (c.discoveryRights['unconfirmed'] ?? 0) + (c.textbookRefRights['unconfirmed'] ?? 0) + (c.playRights['unconfirmed'] ?? 0);
  lines.push(`콘텐츠 쪽 미확인 ${unconfirmedContent}건과 대장의 미확인 ${s.unconfirmed.length}건은 사람이 확인해야 한다. 공개 채널은 승인되지 않은 과제와 발견 요소를 숨긴다(D-12, D-184).`);
  return lines.join('\n') + '\n';
}
