// 4.2 설치물 모드의 화면: 표지판(과제 고르기), 재료 선반, 조작 막대, 도움 카드, 확인 결과.
// 월드(Phaser)는 돌과 카메라를 맡고, 여기서는 단추와 글을 맡는다. 둘은 다리(WorldBridge)로만 만난다.
// 끌지 않아도 모두 할 수 있다(W-4): 키보드(4.2의 키 표), 돌을 눌러 놓기, 이 화면의 단추.
// 맞고 틀림은 색만으로 말하지 않는다: 기호(그림)와 문장을 함께 두고, 같은 문장을 패널과 같이 쓴다.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { scaleNameOf } from '../../domain/scaleKind';
import type { Hand } from '../../domain/slotmap';
import type { WorldBridge } from '../../platform/bridge';
import { BENCH_KEY_TABLE, benchActionOf, isActivatableElement, isTypingElement } from '../challenge/benchKeys';
import type { BenchAction } from '../challenge/benchKeys';
import type { ChallengeController } from '../challenge/controller';
import type { SlotBench } from '../challenge/slotBench';
import { FREE_IDLE_TEXT, slotIdleLead, slotPassedText } from '../challenge/slotText';
import { useBench, useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import type { InstallationController } from './controller';
import { BarButton, SignButton, SignList, useBottomInset, useSignMenu } from './hudParts';
import type { HudIconName } from './hudParts';

export interface InstallationHudProps {
  bridge: WorldBridge;
  controller: ChallengeController;
  bench: SlotBench;
  installation: InstallationController;
  /** 화면을 옮긴다(패널로 보기) */
  onNavigate: (hash: string) => void;
  /** 키보드가 없는 터치 화면인가(키 안내 글을 줄인다) */
  touchOnly?: boolean;
  /** 위에 모달 카드가 떠 있어 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
}

const ACCIDENTALS: ReadonlyArray<{ value: Hand['accidental']; mark: string; label: string }> = [
  { value: 'flat', mark: '♭', label: '내림표' },
  { value: null, mark: '없음', label: '변화표 없음' },
  { value: 'sharp', mark: '♯', label: '올림표' },
];

/** 작업대에서는 월드가 가려지지 않게 확인 결과를 이만큼만 보인다. 나머지는 돌 위의 ! 표시와 패널이 알려 준다 */
const MAX_MESSAGES = 3;

/** 키를 꾹 눌러도 되풀이되는 동작: 자리와 높이를 옮기는 것뿐이다. 놓기, 빼기, 듣기 같은 것은 한 번에 한 번이다 */
const REPEATABLE: ReadonlySet<BenchAction> = new Set(['cursor-left', 'cursor-right', 'hand-up', 'hand-down', 'accidental-up', 'accidental-down']);

export function InstallationHud({ bridge, controller, bench, installation, onNavigate, touchOnly = false, inert }: InstallationHudProps) {
  const ui = useStore(installation.state);
  useController(controller);
  useBench(bench);
  const menu = useSignMenu();
  const { open: signOpen, listRef: signListRef, setOpen: setSignOpen } = menu;
  const mainRef = useRef<HTMLDivElement | null>(null);
  const inst = installation.active;
  const installationId = inst?.installationId ?? null;

  // 조작 막대가 화면 아래를 가리는 높이를 월드에 알린다(hudParts)
  useBottomInset(bridge, installationId, mainRef);

  // 키보드(4.2의 표). 모드에 있는 동안 월드는 키를 받지 않는다.
  // Esc는 열려 있는 표지판 목록이나 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다.
  // 키 처리는 화면을 그린 직후(레이아웃 효과)에 붙인다: 작업대가 화면에 나타난 뒤 바로 누른 키도 잃지 않는다(D-312)
  const helpOpen = ui.helpOpen;
  useLayoutEffect(() => {
    if (!installationId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || bridge.pause.get()) return;
      if (isTypingElement(e.target)) return;
      const action = benchActionOf(e);
      if (!action) return;
      // 표지판 목록 안에 초점이 있는 동안은 목록이 키를 쓴다(Tab, Enter, ↑ ↓). 놓기 키가 아니라 Esc만 이쪽에서 받는다
      if (action !== 'exit' && signListRef.current?.contains(e.target as Node | null)) return;
      // 단추에 초점이 있을 때 Enter·Space는 그 단추를 누르는 일이다
      if (action === 'place' && isActivatableElement(e.target)) return;
      // 방향키는 '돌을 다루는 중'이라는 뜻이다. 단추에 머물러 있던 초점은 놓아 준다: 이어서 누르는 Enter가 그 단추가 아니라 놓기가 되게
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
      const go = installation.perform(action);
      if (go) onNavigate(go.navigate);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, installation, installationId, onNavigate, signOpen, setSignOpen, signListRef, helpOpen]);

  if (!inst || !ui.mode || !bench.available) return null;

  const map = bench.map;
  const hand = bench.hand;
  const cursor = bench.cursor;
  const views = bench.views();
  const placedCount = views.filter((v) => v.written).length;
  const selectedView = cursor !== null ? views[cursor - 1] : undefined;
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  const free = bench.free;
  const playing = controller.playing;
  const entries = installation.signOf(inst);
  const selectedEntry = entries.find((e) => e.selected);
  const spec = controller.current?.def.evaluatorSpec;
  const keyName = spec?.type === 'orderedScale' ? spec.keyName : undefined;
  const scaleName = scaleNameOf(spec?.type === 'orderedScale' ? spec.midiSteps : undefined);
  const notice = controller.notice;

  const run = (action: BenchAction): void => {
    const go = installation.perform(action);
    if (go) onNavigate(go.navigate);
  };

  const barButton = (action: BenchAction, label: string, icon: HudIconName | null, opts: { glyph?: string; key?: string; disabled?: boolean; pressed?: boolean; primary?: boolean; short?: string } = {}) => (
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

  return (
    <section class="inst-hud" aria-label={`${inst.name} 작업대`} data-installation-hud={inst.installationId} data-target={ui.targetKey} {...(inert ? { inert: true } : {})}>
      {/* 눈에 보이지 않지만 화면 낭독기가 읽는 알림 */}
      <div class="sr-only" role="status" aria-live="polite" data-live>
        {controller.live}
      </div>

      <div class="inst-float">
        {signOpen ? <SignList entries={entries} installation={installation} menu={menu} /> : null}

        {ui.helpOpen ? (
          <div class="inst-help card" id="inst-help" role="region" aria-label="키보드 도움">
            <h2>키보드로 놓기</h2>
            <ul class="help-list">
              {BENCH_KEY_TABLE.map((row) => (
                <li key={row.keys}>
                  <kbd>{row.keys}</kbd> {row.label}
                </li>
              ))}
            </ul>
            <p class="muted small">돌을 눌러도 손에 든 음이 놓여요. 끌지 않아도 모두 할 수 있어요.</p>
          </div>
        ) : null}
      </div>

      <div class="inst-main" ref={mainRef}>
        <div class={`feedback inst-feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
          {playing ? (
            <p class="feedback-line" data-listening={playing}>
              <Icon name="play" /> {playing === 'mine' ? '내 배치를 듣는 중이에요.' : '목표를 듣는 중이에요.'}
            </p>
          ) : null}
          {feedback?.passed ? (
            <p class="feedback-line">
              <Icon name="check" /> <strong>통과했어요.</strong> {slotPassedText(keyName, map.count, scaleName)}
            </p>
          ) : null}
          {messages.slice(0, MAX_MESSAGES).map((m) => (
            <p key={m} class="feedback-line">
              <Icon name="alert" /> <strong>{m}</strong>
            </p>
          ))}
          {messages.length > MAX_MESSAGES ? <p class="feedback-more">그 밖에 {messages.length - MAX_MESSAGES}가지가 더 있어요. 돌 위의 ! 표시를 보세요.</p> : null}
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
          {!feedback && !notice && !playing ? <p class="feedback-idle muted">{free ? FREE_IDLE_TEXT : slotIdleLead(placedCount, map.count)}</p> : null}
        </div>
        <div class="inst-row inst-top">
          <SignButton menu={menu} current={selectedEntry?.label ?? '자유로 놀기'} />
          <p class="inst-hand" data-hand={bench.handName()}>
            손에 든 음 <strong>{bench.handName()}</strong>{' '}
            <span class="inst-cursor">{cursor !== null ? `· ${cursor}번째 자리` : '· 자리를 고르세요'}</span>
          </p>
        </div>

        <div class="inst-row inst-shelf" role="group" aria-label="재료 선반: 소리 높이">
          {map.shelf.map((position, i) => {
            const on = hand.shelfIndex === i;
            return (
              <button type="button" key={position.name} class={`material inst-material${on ? ' is-selected' : ''}`} data-shelf={i} aria-pressed={on} onClick={() => bench.pickShelf(i)}>
                <span class="material-name">{map.nameOf({ shelfIndex: i, accidental: hand.accidental })}</span>
              </button>
            );
          })}
          <span class="inst-divider" aria-hidden="true" />
          <div class="inst-accidentals" role="group" aria-label="변화표">
            {ACCIDENTALS.map((a) => {
              const on = hand.accidental === a.value;
              return (
                <button type="button" key={a.label} class={`material inst-material${on ? ' is-selected' : ''}`} data-accidental={a.value ?? 'none'} aria-pressed={on} aria-label={a.label} onClick={() => bench.pickAccidental(a.value)}>
                  <span class="material-name" aria-hidden="true">{a.mark}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div class="inst-row inst-bar" role="toolbar" aria-label="조작 막대">
          {barButton('cursor-left', '이전 자리', null, { glyph: '←', key: '←' })}
          {barButton('cursor-right', '다음 자리', null, { glyph: '→', key: '→' })}
          {barButton('place', cursor !== null ? `${cursor}번째 자리에 놓기` : '첫 자리에 놓기', 'plus', { key: 'Enter', primary: true, short: '놓기' })}
          {barButton('remove', '빼기', 'eraser', { key: '⌫', disabled: !selectedView?.written })}
          {barButton('undo', '실행 취소', 'undo', { key: 'Z', disabled: !controller.canUndo })}
          {barButton('redo', '다시 실행', 'redo', { key: 'Y', disabled: !controller.canRedo })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('hear-mine', '내 배치 듣기', 'play', { key: 'P' })}
          {barButton('hear-target', '목표 듣기', 'speaker', { key: 'T' })}
          {barButton('stop', '정지', 'stop', { key: 'S', disabled: playing === null })}
          {barButton('check', '배치 확인', 'check', { key: 'C' })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('view-panel', '패널로 보기', 'map', { key: 'V' })}
          {barButton('help', '도움', 'help', { key: 'H', pressed: ui.helpOpen })}
          {barButton('exit', '나가기', 'close', { key: 'Esc' })}
        </div>
        {touchOnly ? null : <p class="inst-hint muted" aria-hidden="true">← → 자리 · ↑ ↓ 음 · Enter 놓기 · P 듣기 · C 확인 · H 도움 · Esc 나가기</p>}
      </div>
    </section>
  );
}
