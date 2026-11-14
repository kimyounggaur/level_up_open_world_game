// 6-7 종나무(T4, 설계서 4.6)의 화면: 표지판(과제 고르기), 재료 선반(음이름과 변화표, 종탑은 종 세 개), 듣는 방식, 조작 막대, 도움 카드, 확인 결과.
// 월드(Phaser)는 나무와 가지(고리), 걸린 종, 고른 자리, 판정이 가리킨 종을 그리고, 여기서는 단추와 글을 맡는다. 둘은 다리(WorldBridge)로만 만난다.
// 끌지 않아도 모두 할 수 있다(W-4): 키보드(bellKeys의 표), 가지를 눌러 걸기, 이 화면의 단추.
// 맞고 틀림은 색만으로 말하지 않는다: 기호(그림)와 문장을 함께 두고, 같은 문장을 패널과 같이 쓴다.
// 소리를 끈 종과 가장 낮게 울리는 종도 글로 말한다(꺼짐, 낮음): 종탑의 전위는 눈이 아니라 귀로 확인하는 것이라서, 보이는 것이 소리와 어긋나지 않게 한다.
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { WorldBridge } from '../../platform/bridge';
import { BELL_LETTERS, handNameOf } from '../challenge/bellBench';
import type { BellBench, BellHand } from '../challenge/bellBench';
import { bellActionOf, bellKeyTableOf } from '../challenge/bellKeys';
import type { BellAction } from '../challenge/bellKeys';
import { HEAR_MODES, bellIdleLead, bellPassedText } from '../challenge/bellText';
import { isActivatableElement, isTypingElement } from '../challenge/benchKeys';
import type { ChallengeController } from '../challenge/controller';
import { FREE_IDLE_TEXT } from '../challenge/slotText';
import { useBench, useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import type { InstallationController } from './controller';
import { BarButton, SignButton, SignList, useBottomInset, useSignMenu } from './hudParts';
import type { HudIconName } from './hudParts';

export interface BellHudProps {
  bridge: WorldBridge;
  controller: ChallengeController;
  bench: BellBench;
  installation: InstallationController;
  /** 화면을 옮긴다(패널로 보기) */
  onNavigate: (hash: string) => void;
  /** 키보드가 없는 터치 화면인가(키 안내 글을 줄인다) */
  touchOnly?: boolean;
  /** 위에 모달 카드가 떠 있어 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
}

const ACCIDENTALS: ReadonlyArray<{ value: BellHand['accidental']; mark: string; label: string }> = [
  { value: 'flat', mark: '♭', label: '내림표' },
  { value: null, mark: '없음', label: '변화표 없음' },
  { value: 'sharp', mark: '♯', label: '올림표' },
];

/** 작업대에서는 월드가 가려지지 않게 확인 결과를 이만큼만 보인다. 나머지는 종 위의 ! 표시와 패널이 알려 준다 */
const MAX_MESSAGES = 3;

/** 키를 꾹 눌러도 되풀이되는 동작: 자리와 높이와 음이름과 변화표를 옮기는 것뿐이다. 걸기, 빼기, 맞바꾸기, 듣기 같은 것은 한 번에 한 번이다 */
const REPEATABLE: ReadonlySet<BellAction> = new Set(['cursor-left', 'cursor-right', 'ring-up', 'ring-down', 'letter-next', 'letter-prev', 'accidental-up', 'accidental-down']);

export function BellHud({ bridge, controller, bench, installation, onNavigate, touchOnly = false, inert }: BellHudProps) {
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

  // 키보드(bellKeys의 표). 모드에 있는 동안 월드는 키를 받지 않는다.
  // Esc는 열려 있는 표지판 목록이나 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다
  const helpOpen = ui.helpOpen;
  useLayoutEffect(() => {
    if (!installationId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || bridge.pause.get()) return;
      if (isTypingElement(e.target)) return;
      const action = bellActionOf(e, bench.form);
      if (!action) return;
      // 표지판 목록 안에 초점이 있는 동안은 목록이 키를 쓴다(Tab, Enter, ↑ ↓). 놓기 키가 아니라 Esc만 이쪽에서 받는다
      if (action !== 'exit' && signListRef.current?.contains(e.target as Node | null)) return;
      // 단추에 초점이 있을 때 Enter·Space는 그 단추를 누르는 일이다
      if (action === 'place' && isActivatableElement(e.target)) return;
      // 방향키는 '종을 다루는 중'이라는 뜻이다. 단추에 머물러 있던 초점은 놓아 준다: 이어서 누르는 Enter가 그 단추가 아니라 걸기가 되게
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
      const go = installation.performBell(action);
      if (go) onNavigate(go.navigate);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, bench, installation, installationId, onNavigate, signOpen, setSignOpen, signListRef, helpOpen]);

  if (!inst || !ui.mode || !bench.available) return null;

  const form = bench.form;
  const tower = form === 'tower';
  const glade = form === 'glade';
  const hand = bench.hand;
  const cursor = bench.cursor;
  const states = bench.states();
  const atCursor = cursor !== null ? states.find((s) => s.draft === cursor) : undefined;
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  const free = bench.free;
  const playing = controller.playing;
  const entries = installation.signOf(inst);
  const selectedEntry = entries.find((e) => e.selected);
  const notice = controller.notice;
  const cursorLabel = cursor !== null ? bench.labelOf(cursor) : null;
  const mode = bench.mode;

  const run = (action: BellAction): void => {
    const go = installation.performBell(action);
    if (go) onNavigate(go.navigate);
  };

  const barButton = (action: BellAction, label: string, icon: HudIconName | null, opts: { glyph?: string; key?: string; disabled?: boolean; pressed?: boolean; primary?: boolean; short?: string } = {}) => (
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
    <section class="inst-hud inst-bells" aria-label={`${inst.name} 작업대`} data-installation-hud={inst.installationId} data-target={ui.targetKey} data-bell-form={form} {...(inert ? { inert: true } : {})}>
      {/* 눈에 보이지 않지만 화면 낭독기가 읽는 알림 */}
      <div class="sr-only" role="status" aria-live="polite" data-live>
        {controller.live}
      </div>

      <div class="inst-float">
        {signOpen ? <SignList entries={entries} installation={installation} menu={menu} /> : null}

        {ui.helpOpen ? (
          <div class="inst-help card" id="inst-help" role="region" aria-label="키보드 도움">
            <h2>키보드로 종 걸기</h2>
            <ul class="help-list">
              {bellKeyTableOf(form).map((row) => (
                <li key={row.keys}>
                  <kbd>{row.keys}</kbd> {row.label}
                </li>
              ))}
            </ul>
            <p class="muted small">
              {tower ? '가지(고리)를 눌러도 그 종이 그 높이로 옮겨 가요. ' : '가지(고리)를 눌러도 손에 든 종이 걸려요. 같은 열의 다른 가지를 누르면 그 열의 종이 옮겨 가요. '}끌지 않아도 모두 할 수 있어요.
            </p>
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
              <Icon name="check" /> <strong>통과했어요.</strong> {bellPassedText(bench.variant)}
            </p>
          ) : null}
          {feedback?.passed ? (feedback.notes ?? []).map((n) => (
            <p key={n} class="feedback-line" data-shape-note>
              {n}
            </p>
          )) : null}
          {messages.slice(0, MAX_MESSAGES).map((m) => (
            <p key={m} class="feedback-line">
              <Icon name="alert" /> <strong>{m}</strong>
            </p>
          ))}
          {messages.length > MAX_MESSAGES ? <p class="feedback-more">그 밖에 {messages.length - MAX_MESSAGES}가지가 더 있어요. 종 위의 ! 표시를 보세요.</p> : null}
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
          {!feedback && !notice && !playing ? <p class="feedback-idle muted">{free ? FREE_IDLE_TEXT : bellIdleLead(form, bench.trees, bench.hungCount())}</p> : null}
        </div>

        <div class="inst-row inst-top">
          <SignButton menu={menu} current={selectedEntry?.label ?? '자유로 놀기'} />
          {tower ? (
            <p class="inst-hand" data-selected-bell={cursor ?? undefined}>
              고른 종 <strong>{atCursor ? `${cursorLabel} · ${atCursor.name}` : (cursorLabel ?? '없음')}</strong>{' '}
              <span class="inst-cursor">{atCursor ? (atCursor.muted ? '· 소리가 꺼져 있어요' : atCursor.lowest ? '· 가장 낮게 울려요' : '· 소리가 켜져 있어요') : '· 종을 고르세요'}</span>
            </p>
          ) : (
            <p class="inst-hand" data-hand={bench.handName()}>
              손에 든 종 <strong>{bench.handName()}</strong> <span class="inst-cursor">{cursorLabel !== null ? `· ${cursorLabel}` : '· 종 자리를 고르세요'}</span>
            </p>
          )}
        </div>

        {tower ? (
          <div class="inst-row inst-shelf" role="group" aria-label="종탑의 종">
            {states.map((s) => {
              const on = cursor === s.draft;
              return (
                <button
                  type="button"
                  key={s.draft}
                  class={`material inst-material inst-bell${on ? ' is-selected' : ''}${s.muted ? ' is-muted' : ''}${s.lowest ? ' is-lowest' : ''}`}
                  data-bell={s.draft}
                  data-muted={s.muted ? 'true' : undefined}
                  data-lowest={s.lowest ? 'true' : undefined}
                  aria-pressed={on}
                  aria-label={`${bench.labelOf(s.draft)}, ${s.name}${s.muted ? ', 소리가 꺼져 있어요' : s.lowest ? ', 가장 낮게 울려요' : ''}`}
                  onClick={() => bench.selectColumn(s.draft)}
                >
                  <span class="material-name" aria-hidden="true">
                    {s.muted ? '✕ ' : ''}
                    {s.name}
                  </span>
                  {s.muted ? (
                    <span class="material-sub" aria-hidden="true">꺼짐</span>
                  ) : s.lowest ? (
                    <span class="material-sub" aria-hidden="true">낮음</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div class="inst-row inst-shelf" role="group" aria-label="재료 선반: 종의 음이름과 변화표">
            {BELL_LETTERS.map((letter) => {
              const on = hand.letter === letter;
              return (
                <button type="button" key={letter} class={`material inst-material${on ? ' is-selected' : ''}`} data-letter={letter} aria-pressed={on} onClick={() => bench.pickLetter(letter)}>
                  <span class="material-name">{handNameOf({ letter, accidental: hand.accidental })}</span>
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
        )}

        <div class="inst-row inst-shelf inst-hearing" role="group" aria-label="듣는 방식">
          <span class="inst-shelf-label" aria-hidden="true">듣는 방식</span>
          {HEAR_MODES.map((m) => {
            const on = mode === m.mode;
            return (
              <button type="button" key={m.mode} class={`material inst-material${on ? ' is-selected' : ''}`} data-hear-mode={m.mode} aria-pressed={on} onClick={() => bench.setMode(m.mode)}>
                <span class="material-name">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div class="inst-row inst-bar" role="toolbar" aria-label="조작 막대">
          {barButton('cursor-left', tower ? '이전 종' : '이전 종 자리', null, { glyph: '←', key: '←' })}
          {barButton('cursor-right', tower ? '다음 종' : '다음 종 자리', null, { glyph: '→', key: '→' })}
          {glade ? barButton('tree-prev', '이전 나무', null, { glyph: '«', key: 'Shift+←', short: '이전 나무' }) : null}
          {glade ? barButton('tree-next', '다음 나무', null, { glyph: '»', key: 'Shift+→', short: '다음 나무' }) : null}
          {barButton('ring-up', tower ? '한 옥타브 올리기' : '한 단 위 가지로', null, { glyph: '↑', key: '↑', short: tower ? '옥타브 올리기' : '위 가지' })}
          {barButton('ring-down', tower ? '한 옥타브 내리기' : '한 단 아래 가지로', null, { glyph: '↓', key: '↓', short: tower ? '옥타브 내리기' : '아래 가지' })}
          {tower ? barButton('swap-left', '고른 종을 왼쪽과 바꾸기', null, { glyph: '⇠', key: 'Shift+←', short: '왼쪽과 바꾸기', disabled: cursor === null || cursor === 0 }) : null}
          {tower ? barButton('swap-right', '고른 종을 오른쪽과 바꾸기', null, { glyph: '⇢', key: 'Shift+→', short: '오른쪽과 바꾸기', disabled: cursor === null || cursor === bench.map.columns - 1 }) : null}
          {tower ? barButton('mute', atCursor?.muted ? '종 소리 켜기' : '종 소리 끄기', 'speaker-off', { key: 'X', disabled: cursor === null, short: atCursor?.muted ? '소리 켜기' : '소리 끄기' }) : null}
          {barButton('place', tower ? '고른 종 울려 보기' : cursorLabel !== null ? `${cursorLabel}에 걸기` : '첫 종 자리에 걸기', tower ? 'play' : 'plus', { key: 'Enter', primary: true, short: tower ? '울려 보기' : '걸기' })}
          {tower ? null : barButton('remove', '종 빼기', 'eraser', { key: '⌫', disabled: !atCursor, short: '빼기' })}
          {barButton('undo', '실행 취소', 'undo', { key: 'Z', disabled: !controller.canUndo })}
          {barButton('redo', '다시 실행', 'redo', { key: 'Y', disabled: !controller.canRedo })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('hear-mine', glade ? '내 화음 이어 듣기' : '내 배치 듣기', 'play', { key: 'P', short: glade ? '이어 듣기' : '내 배치 듣기' })}
          {glade ? barButton('hear-tree', '고른 나무 듣기', 'speaker', { key: 'Shift+P', short: '나무 듣기' }) : null}
          {barButton('hear-target', '목표 듣기', 'speaker', { key: 'T' })}
          {barButton('stop', '정지', 'stop', { key: 'S', disabled: playing === null })}
          {barButton('check', '배치 확인', 'check', { key: 'C' })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('view-panel', '패널로 보기', 'map', { key: 'V' })}
          {barButton('help', '도움', 'help', { key: 'H', pressed: ui.helpOpen })}
          {barButton('exit', '나가기', 'close', { key: 'Esc' })}
        </div>
        {touchOnly ? null : (
          <p class="inst-hint muted" aria-hidden="true">
            {tower
              ? '← → 종 · ↑ ↓ 높이 · Shift+← → 가로 자리 · X 소리 · R 듣는 방식 · P 듣기 · C 확인 · H 도움 · Esc 나가기'
              : `← → 자리${glade ? ' · Shift+← → 나무' : ''} · ↑ ↓ 가지 · PgUp PgDn 음이름 · Shift+↑↓ 변화표 · Enter 걸기 · P 듣기 · C 확인 · H 도움 · Esc 나가기`}
          </p>
        )}
      </div>
    </section>
  );
}
