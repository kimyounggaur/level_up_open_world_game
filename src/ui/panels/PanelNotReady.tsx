// 열 수는 있지만 이 단계에서는 아직 화면을 만들지 않은 도전. 열린 척하지 않고 사실대로 알린다.
import { ContentCatalog } from '../../domain/catalog';
import type { QuestEntry, VariantEntry } from '../../domain/catalog';
import { Icon } from '../common/Icon';
import { useNav } from '../common/nav';
import { Brand } from './PanelFrame';

export interface PanelNotReadyProps {
  entry: QuestEntry;
  variant: VariantEntry;
}

export function PanelNotReady({ entry, variant }: PanelNotReadyProps) {
  const nav = useNav();
  return (
    <div class="list-shell">
      <header class="topbar">
        <Brand />
        <nav class="topnav" aria-label="이동">
          <button type="button" class="nav-link nav-button" onClick={() => nav.close()} aria-keyshortcuts="Escape">
            <Icon name="close" /> 돌아가기
          </button>
          <a class="nav-link" href="#/list">
            <Icon name="list" /> 전체 도전
          </a>
        </nav>
      </header>
      <main class="list-main" id="list-main" tabIndex={-1}>
        <h1>{entry.title}</h1>
        <p class="subtitle">{variant.label}</p>
        <p class="problem" role="status" data-panel-not-ready={variant.panelIds[0] ?? ''}>
          <Icon name="alert" /> 이 도전의 화면은 아직 만들고 있어요. 주소는 올바르고, 만들어지면 같은 주소로 열려요.
        </p>
        <p>
          <a class="btn btn-primary" href="#/list">
            전체 도전 보기 <Icon name="arrow-right" />
          </a>
        </p>
        <p class="muted small">주소: {ContentCatalog.hashFor(entry.questId, variant.variantId)}</p>
      </main>
    </div>
  );
}
