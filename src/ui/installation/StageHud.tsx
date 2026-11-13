// 4.9 합주 무대(T7)의 화면: 표지판, 마디 고르기, 듣기 범위, 조작 막대, 도움 카드, 확인 결과.
// 월드(Phaser)는 바닥 칸과 카메라를 맡고, 여기서는 단추와 글을 맡는다. 둘은 다리(WorldBridge)로만 만난다.
// 음표를 놓고 빼는 일은 없다: 마디를 고르고 '패널에서 열기'를 누르면(바닥 칸을 눌러도 같다) 그 마디가 패널에서 열린다.
// 끌지 않아도 모두 할 수 있다(W-4): 키보드(stageKeys의 표), 바닥 칸을 눌러 열기, 이 화면의 단추.
// 맞고 틀림은 색만으로 말하지 않는다: 기호(그림)와 문장을 함께 두고, 같은 문장을 패널과 같이 쓴다.
import { useEffect, useRef } from 'preact/hooks';
import type { WorldBridge } from '../../platform/bridge';
import { benchActionOf, isActivatableElement, isTypingElement } from '../challenge/benchKeys';
import type { ChallengeController } from '../challenge/controller';
import { scopeChoiceOf, scopeOptionsOf, scopeValueOf } from '../challenge/scopeChoices';
import type { StageBench } from '../challenge/stageBench';
import { STAGE_FREE_KEY_TABLE, STAGE_KEY_TABLE, stageActionOf } from '../challenge/stageKeys';
import type { StageAction } from '../challenge/stageKeys';
import { STAGE_PASSED_TEXT, stageFreeIdleText, stageIdleShort, stageIdleText } from '../challenge/stageText';
import { fillTemplate } from '../../domain/feedback';
import { useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import type { InstallationController } from './controller';
import { BarButton, SignButton, SignList, useBottomInset, useSignMenu } from './hudParts';
import type { HudIconName } from './hudParts';

export interface StageHudProps {
  bridge: WorldBridge;
  controller: ChallengeController;
  installation: InstallationController;
  stage: StageBench;
  /** 화면을 옮긴다(마디를 패널에서 열기) */
  onNavigate: (hash: string) => void;
  /** 키보드가 없는 터치 화면인가(키 안내 글을 줄인다) */
  touchOnly?: boolean;
  /** 위에 모달 카드가 떠 있어 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
}

/** 작업대에서는 월드가 가려지지 않게 확인 결과를 이만큼만 보인다. 나머지는 바닥 칸의 ! 표시와 패널이 알려 준다 */
const MAX_MESSAGES = 3;

/** 키를 꾹 눌러도 되풀이되는 동작: 마디를 옮기는 것뿐이다 */
const REPEATABLE: ReadonlySet<StageAction> = new Set(['cell-left', 'cell-right']);

export function StageHud({ bridge, controller, installation, stage, onNavigate, touchOnly = false, inert }: StageHudProps) {
  const ui = useStore(installation.state);
  useController(controller);
  const menu = useSignMenu();
  const { open: signOpen, listRef: signListRef, setOpen: setSignOpen } = menu;
  const mainRef = useRef<HTMLDivElement | null>(null);
  const inst = installation.active;
  const installationId = inst?.installationId ?? null;

  useBottomInset(bridge, installationId, mainRef);

  // 키보드(stageKeys의 표). 모드에 있는 동안 월드는 키를 받지 않는다.
  // Esc는 열려 있는 표지판 목록이나 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다
  const helpOpen = ui.helpOpen;
  useEffect(() => {
    if (!installationId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || bridge.pause.get()) return;
      if (isTypingElement(e.target)) return;
      const action = stageActionOf(e);
      if (!action) return;
      // 표지판 목록 안에 초점이 있는 동안은 목록이 키를 쓴다(Tab, Enter, ↑ ↓). Esc만 이쪽에서 받는다
      if (action !== 'exit' && signListRef.current?.contains(e.target as Node | null)) return;
      // 단추에 초점이 있을 때 Enter·Space는 그 단추를 누르는 일이다(V는 어디에 초점이 있어도 패널 열기다)
      if (benchActionOf(e) === 'place' && isActivatableElement(e.target)) return;
      // 방향키는 '마디를 고르는 중'이라는 뜻이다. 단추에 머물러 있던 초점은 놓아 준다: 이어서 누르는 Enter가 그 단추가 아니라 패널 열기가 되게
      if (REPEATABLE.has(action) && isActivatableElement(e.target)) (e.target as HTMLElement).blur();
      e.preventDefault();
      if (e.repeat && !REPEATABLE.has(action)) return;
      if (action === 'exit' && signOpen) {
        setSignOpen(false);
        return;
      }
      if (action === 'exit' && helpOpen) {
        installation.toggleHelp();
        return;
      }
      const go = installation.performStage(action);
      if (go) onNavigate(go.navigate);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, installation, installationId, onNavigate, signOpen, setSignOpen, signListRef, helpOpen]);

  if (!inst || !ui.mode || !stage.available) return null;

  const views = stage.views();
  const used = views.filter((v) => v.fill !== 'unused');
  const fullCells = used.filter((v) => v.fill === 'full').length;
  const selected = stage.measure();
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  const playing = controller.playing;
  const entries = installation.signOf(inst);
  const selectedEntry = entries.find((e) => e.selected);
  const notice = controller.notice;
  // 자유 가락: 판정하지 않으므로 목표 듣기와 배치 확인이 없다. 저장한 곡을 듣는 중이면 그 이름을 보인다
  const free = stage.free;
  const songName = installation.previewLabel();
  const busy = playing !== null || controller.previewing;
  const scopeOptions = scopeOptionsOf(controller);
  const scopeNow = scopeValueOf(controller.scopeChoice);

  const run = (action: StageAction): void => {
    const go = installation.performStage(action);
    if (go) onNavigate(go.navigate);
  };

  const bar = (action: StageAction, label: string, icon: HudIconName | null, opts: { glyph?: string; key?: string; disabled?: boolean; pressed?: boolean; primary?: boolean; short?: string } = {}) => (
    <BarButton
      action={action}
      label={label}
      icon={icon}
      {...(opts.glyph !== undefined ? { glyph: opts.glyph } : {})}
      {...(opts.key ? { keyName: opts.key } : {})}
      {...(opts.disabled !== undefined ? { disabled: opts.disabled } : {})}
      {...(opts.pressed !== undefined ? { pressed: opts.pressed } : {})}
      {...(opts.primary !== undefined ? { primary: opts.primary } : {})}
      {...(opts.short !== undefined ? { short: opts.short } : {})}
      onRun={() => run(action)}
    />
  );

  // 마디 단추는 마디를 고르기만 한다(패널은 '패널에서 열기'나 바닥 칸 누르기로 연다). 고른 마디의 두 성부 칸이 함께 고른 것이다
  const measureLabel = (m: number): string => {
    const cells = views.filter((v) => v.measureIndex === m && v.fill !== 'unused');
    return `${m + 1}마디 고르기. ${cells.map((c) => c.text).join(' ')}`.trim();
  };

  return (
    <section class="inst-hud inst-stage" aria-label={`${inst.name} 작업대`} data-installation-hud={inst.installationId} data-stage="true" data-target={ui.targetKey} {...(free ? { 'data-free': 'true' } : {})} {...(inert ? { inert: true } : {})}>
      {/* 눈에 보이지 않지만 화면 낭독기가 읽는 알림 */}
      <div class="sr-only" role="status" aria-live="polite" data-live>
        {controller.live}
      </div>

      <div class="inst-float">
        {signOpen ? <SignList entries={entries} installation={installation} menu={menu} /> : null}

        {ui.helpOpen ? (
          <div class="inst-help card" id="inst-help" role="region" aria-label="키보드 도움">
            <h2>키보드로 무대 쓰기</h2>
            <ul class="help-list">
              {(free ? STAGE_FREE_KEY_TABLE : STAGE_KEY_TABLE).map((row) => (
                <li key={row.keys}>
                  <kbd>{row.keys}</kbd> {row.label}
                </li>
              ))}
            </ul>
            <p class="muted small">바닥 칸을 눌러도 그 마디가 패널에서 열려요. 끌지 않아도 모두 할 수 있어요.</p>
          </div>
        ) : null}
      </div>

      <div class="inst-main" ref={mainRef}>
        <div class={`feedback inst-feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
          {playing ? (
            <p class="feedback-line" data-listening={playing}>
              <Icon name="play" /> {playing === 'mine' ? (free ? '내 가락을 듣는 중이에요.' : '내 곡을 듣는 중이에요.') : '목표를 듣는 중이에요.'} <span class="muted">({controller.scopeLabel()})</span>
            </p>
          ) : null}
          {songName ? (
            <p class="feedback-line" data-listening="song">
              <Icon name="play" /> {fillTemplate('{name:을를} 듣는 중이에요.', { name: songName })}
            </p>
          ) : null}
          {feedback?.passed ? (
            <p class="feedback-line">
              <Icon name="check" /> <strong>통과했어요.</strong> {STAGE_PASSED_TEXT}
            </p>
          ) : null}
          {messages.slice(0, MAX_MESSAGES).map((m) => (
            <p key={m} class="feedback-line">
              <Icon name="alert" /> <strong>{m}</strong>
            </p>
          ))}
          {messages.length > MAX_MESSAGES ? <p class="feedback-more">그 밖에 {messages.length - MAX_MESSAGES}가지가 더 있어요. 바닥 칸의 ! 표시를 보세요.</p> : null}
          {feedback?.technical ? (
            <p class="feedback-line">
              <Icon name="alert" /> {feedback.messages[0]}
            </p>
          ) : null}
          {notice ? (
            <p class="feedback-line" data-notice>
              <Icon name="help" /> {notice}
            </p>
          ) : null}
          {!feedback && !notice && !busy ? <p class="feedback-idle muted">{free ? stageFreeIdleText(used.length, fullCells) : stageIdleText(used.length, fullCells)}</p> : null}
          {/* 작은 세로 휴대폰에서는 위의 긴 안내 대신 이 한 줄만 보인다(installation.css). 긴 안내는 화면 낭독기가 읽는다 */}
          {!feedback && !notice && !busy ? (
            <p class="feedback-idle-short muted" aria-hidden="true">
              {stageIdleShort(used.length, fullCells)}
            </p>
          ) : null}
        </div>

        <div class="inst-row inst-top">
          <SignButton menu={menu} current={selectedEntry?.label ?? '합주 무대'} />
          <p class="inst-hand" data-selected-measure={selected ?? ''}>
            고른 마디 <strong>{selected !== null ? `${selected + 1}마디` : '없음'}</strong>{' '}
            <span class="inst-cursor">· 듣기 범위 {controller.scopeLabel()}</span>
          </p>
        </div>

        <div class="inst-row inst-shelf inst-stage-picks">
          <div class="inst-picks inst-picks-measures" role="group" aria-label="마디 고르기">
            {Array.from({ length: stage.layout.measures }, (_, m) => {
              const on = selected === m;
              return (
                <button type="button" key={m} class={`material inst-material${on ? ' is-selected' : ''}`} data-measure={m} aria-pressed={on} aria-label={measureLabel(m)} onClick={() => stage.selectMeasure(m)}>
                  <span class="material-name" aria-hidden="true">{m + 1}마디</span>
                </button>
              );
            })}
          </div>
          <span class="inst-divider" aria-hidden="true" />
          <div class="inst-picks" role="group" aria-label="들을 범위">
            {scopeOptions.map((o) => {
              const on = scopeNow === o.value;
              return (
                <button type="button" key={o.value} class={`material inst-material${on ? ' is-selected' : ''}`} data-scope={o.value} aria-pressed={on} onClick={() => controller.setScope(scopeChoiceOf(o.value))}>
                  <span class="material-name">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div class="inst-row inst-bar" role="toolbar" aria-label="조작 막대">
          {bar('cell-left', '이전 마디', null, { glyph: '←', key: '←' })}
          {bar('cell-right', '다음 마디', null, { glyph: '→', key: '→' })}
          {bar('view-panel', selected !== null ? `${selected + 1}마디를 패널에서 열기` : '1마디를 패널에서 열기', 'map', { key: 'Enter', primary: true, short: '패널에서 열기' })}
          <span class="inst-divider" aria-hidden="true" />
          {bar('hear-mine', free ? '내 가락 듣기' : '내 곡 듣기', 'play', { key: 'P' })}
          {free ? null : bar('hear-target', '목표 듣기', 'speaker', { key: 'T' })}
          {bar('stop', '정지', 'stop', { key: 'S', disabled: !busy })}
          {free ? null : bar('check', '배치 확인', 'check', { key: 'C' })}
          <span class="inst-divider" aria-hidden="true" />
          {bar('help', '도움', 'help', { key: 'H', pressed: ui.helpOpen })}
          {bar('exit', '나가기', 'close', { key: 'Esc' })}
        </div>
        {touchOnly ? null : (
          <p class="inst-hint muted" aria-hidden="true">
            {free ? '← → 마디 · Enter 패널에서 열기 · R 듣기 범위 · P 듣기 · H 도움 · Esc 나가기' : '← → 마디 · Enter 패널에서 열기 · R 듣기 범위 · P 듣기 · C 확인 · H 도움 · Esc 나가기'}
          </p>
        )}
      </div>
    </section>
  );
}
