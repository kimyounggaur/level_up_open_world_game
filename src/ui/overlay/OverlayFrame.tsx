// 겹침 화면의 공통 틀: 윗줄(제목, 돌아가기)과 본문. 월드 위에 전체 화면으로 덮는다. Esc와 돌아가기는 어느 화면에서나 닿는다(7.5).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../common/Icon';
import { useNav } from '../common/nav';
import { Brand } from '../panels/PanelFrame';

export interface OverlayFrameProps {
  title: string;
  /** 본문 위의 한 줄 설명 */
  subtitle?: string;
  /** 'wide'는 지도처럼 화면을 꽉 채우는 본문 */
  layout?: 'page' | 'wide';
  children: ComponentChildren;
  /** 주소 형식 문제 같은 알림. 있으면 본문 위에 보여 준다 */
  problem?: string | null;
  testId?: string;
}

export function OverlayFrame({ title, subtitle, layout = 'page', children, problem, testId }: OverlayFrameProps) {
  const nav = useNav();
  const main = useRef<HTMLElement>(null);
  // 열리면 본문으로 초점을 옮겨, 화면 낭독기가 제목부터 읽고 키보드 사용자가 월드가 아닌 이 화면 안에서 움직이게 한다
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div class={`overlay-shell overlay-${layout}`} data-overlay={testId ?? title}>
      <header class="topbar">
        <Brand />
        <nav class="topnav" aria-label="이동">
          <button type="button" class="nav-link nav-button" onClick={() => nav.close()} aria-keyshortcuts="Escape">
            <Icon name="close" /> 돌아가기
          </button>
        </nav>
      </header>
      <main class="overlay-main" id="overlay-main" tabIndex={-1} ref={main}>
        <div class="overlay-head">
          <h1>{title}</h1>
          {subtitle ? <p class="subtitle">{subtitle}</p> : null}
          {problem ? (
            <p class="problem" role="alert">
              <Icon name="alert" /> {problem}
            </p>
          ) : null}
        </div>
        {children}
      </main>
    </div>
  );
}
