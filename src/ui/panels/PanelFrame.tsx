// 패널 공통 틀: 윗줄(이름, 전체 도전, 소리, 도움), 도움 연습 띠, 본문, 화면 낭독기용 알림.
// 시안 B02의 윗줄 구성을 따르되, 아직 만들지 않은 곳(악보 지도, 최근 작업)으로 가는 단추는 두지 않는다.
import type { ComponentChildren } from 'preact';
import { STATE_LABEL_KO } from '../../domain/catalog';
import { useController } from '../common/hooks';
import { Icon } from '../common/Icon';
import { useNav } from '../common/nav';
import { SoundControl } from '../common/SoundControl';
import { AssistBanner } from '../assist/AssistBanner';
import type { ChallengeController } from '../challenge/controller';

export function Brand() {
  return (
    <a class="brand" href="#/" aria-label="음악 마을 가칭, 처음으로">
      <svg class="brand-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <rect width="36" height="36" rx="9" fill="#17675D" />
        <path d="M9 23V12h8v15h10V9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="9" cy="24" r="3" fill="#fff" />
        <circle cx="27" cy="10" r="3" fill="#fff" />
      </svg>
      <span class="brand-name">음악 마을</span>
      <span class="chip">가칭</span>
    </a>
  );
}

export function HelpMenu() {
  return (
    <details class="help-menu">
      <summary class="btn btn-quiet">
        <Icon name="help" /> 도움
      </summary>
      <div class="help-body">
        <h2>조작 안내</h2>
        <ul>
          <li>Tab / Shift+Tab: 다음 · 이전 단추로 이동</li>
          <li>Enter 또는 Space: 누르기</li>
          <li>오선에서 ↑ ↓: 한 칸씩 위아래로 옮기기</li>
          <li>박 칸에서 ← →: 옆 칸으로 이동, Delete: 칸 비우기</li>
          <li>Ctrl+Z / Ctrl+Y: 실행 취소 / 다시 실행</li>
          <li>끌지 않아도 모두 할 수 있어요. 눌러서 고르고, 눌러서 놓아요.</li>
        </ul>
      </div>
    </details>
  );
}

export interface PanelFrameProps {
  controller: ChallengeController;
  children: ComponentChildren;
}

export function PanelFrame({ controller, children }: PanelFrameProps) {
  useController(controller);
  const nav = useNav();
  const cur = controller.current;
  const origin = controller.origin();
  const stateLabel = cur ? STATE_LABEL_KO[cur.variant.state] : '';
  return (
    <div class="panel-shell">
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
        <div class="topbar-tools">
          <SoundControl sound={controller.sound} onEnable={() => void controller.enableSound()} onToggleMute={() => controller.toggleMute()} />
          <HelpMenu />
        </div>
      </header>

      {origin ? (
        <AssistBanner
          origin={origin}
          onReturn={() => {
            // 원래 곡을 먼저 되돌리고(항상 성공한다), 화면은 연습을 열기 전 자리로 돌아간다. 주소로 바로 열었다면 원래 곡의 주소로 간다(7.5)
            controller.returnToOrigin();
            nav.close(origin.hash);
          }}
        />
      ) : null}

      <main class="panel-main" id="panel-main" tabIndex={-1}>
        {stateLabel ? <p class="review-note">이 과제는 <strong>{stateLabel}</strong> 상태예요. 음악 선생님의 확인과 권리 확인이 끝나지 않았어요.</p> : null}
        {children}
      </main>

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {controller.live}
      </div>
    </div>
  );
}
