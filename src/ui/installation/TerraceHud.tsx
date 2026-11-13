// 7-1 계단밭(T5, 설계서 4.7)의 화면: 표지판(과제 고르기), 고른 열의 읽기, 변화표 선반, 조작 막대, 도움 카드, 확인 결과.
// 월드(Phaser)는 큰보표 밭과 열, 놓인 등, 덧줄 돌담, 고른 열, 판정이 가리킨 열을 그리고, 여기서는 단추와 글을 맡는다. 둘은 다리(WorldBridge)로만 만난다.
// 끌지 않아도 모두 할 수 있다(W-4): 키보드(terraceKeys의 표), 높이를 눌러 놓기, 이 화면의 단추.
// 맞고 틀림은 색만으로 말하지 않는다: 기호(그림)와 문장을 함께 두고, 같은 문장을 오선 패널과 같이 쓴다(staffText).
// 문제를 푸는 중에는 높이를 보표 위치(아래 첫 덧줄 …)로만 말한다. 이름을 알려 주면 높이를 찾는 일이 사라진다. 자유로 놀 때만 이름도 말한다(4.7).
import { useEffect, useRef } from 'preact/hooks';
import { terraceSpeakOf } from '../../domain/terrace';
import type { WorldBridge } from '../../platform/bridge';
import { isActivatableElement, isTypingElement } from '../challenge/benchKeys';
import type { ChallengeController } from '../challenge/controller';
import { FREE_IDLE_TEXT } from '../challenge/slotText';
import { staffPassedText } from '../challenge/staffText';
import type { TerraceBench } from '../challenge/terraceBench';
import { terraceActionOf, terraceKeyTableOf } from '../challenge/terraceKeys';
import type { TerraceAction } from '../challenge/terraceKeys';
import { terraceIdleLead } from '../challenge/terraceText';
import { useBench, useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import type { InstallationController } from './controller';
import { BarButton, SignButton, SignList, useBottomInset, useSignMenu } from './hudParts';
import type { HudIconName } from './hudParts';

export interface TerraceHudProps {
  bridge: WorldBridge;
  controller: ChallengeController;
  bench: TerraceBench;
  installation: InstallationController;
  /** 화면을 옮긴다(패널로 보기) */
  onNavigate: (hash: string) => void;
  /** 키보드가 없는 터치 화면인가(키 안내 글을 줄인다) */
  touchOnly?: boolean;
  /** 위에 모달 카드가 떠 있어 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
}

const ACCIDENTALS: ReadonlyArray<{ value: 'flat' | 'sharp' | null; mark: string; label: string }> = [
  { value: 'flat', mark: '♭', label: '내림표' },
  { value: null, mark: '없음', label: '변화표 없음' },
  { value: 'sharp', mark: '♯', label: '올림표' },
];

/** 작업대에서는 월드가 가려지지 않게 확인 결과를 이만큼만 보인다. 나머지는 열 위의 ! 표시와 패널이 알려 준다 */
const MAX_MESSAGES = 3;

/** 키를 꾹 눌러도 되풀이되는 동작: 열과 높이와 변화표를 옮기는 것뿐이다. 놓기, 빼기, 듣기 같은 것은 한 번에 한 번이다 */
const REPEATABLE: ReadonlySet<TerraceAction> = new Set(['cursor-left', 'cursor-right', 'step-up', 'step-down', 'octave-up', 'octave-down', 'accidental-up', 'accidental-down']);

export function TerraceHud({ bridge, controller, bench, installation, onNavigate, touchOnly = false, inert }: TerraceHudProps) {
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

  // 키보드(terraceKeys의 표). 모드에 있는 동안 월드는 키를 받지 않는다.
  // Esc는 열려 있는 표지판 목록이나 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다
  const helpOpen = ui.helpOpen;
  useEffect(() => {
    if (!installationId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || bridge.pause.get()) return;
      if (isTypingElement(e.target)) return;
      const action = terraceActionOf(e);
      if (!action) return;
      // 표지판 목록 안에 초점이 있는 동안은 목록이 키를 쓴다(Tab, Enter, ↑ ↓). 놓기 키가 아니라 Esc만 이쪽에서 받는다
      if (action !== 'exit' && signListRef.current?.contains(e.target as Node | null)) return;
      // 단추에 초점이 있을 때 Enter·Space는 그 단추를 누르는 일이다
      if (action === 'place' && isActivatableElement(e.target)) return;
      // 방향키는 '등을 다루는 중'이라는 뜻이다. 단추에 머물러 있던 초점은 놓아 준다: 이어서 누르는 Enter가 그 단추가 아니라 놓기가 되게
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
      const go = installation.performTerrace(action);
      if (go) onNavigate(go.navigate);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, bench, installation, installationId, onNavigate, signOpen, setSignOpen, signListRef, helpOpen]);

  if (!inst || !ui.mode || !bench.available) return null;

  const columns = bench.columns();
  const states = bench.states();
  const cursorColumn = bench.cursorColumn();
  const atCursor = cursorColumn ? states.find((s) => s.draft === cursorColumn.draft) : undefined;
  const placed = states.filter((s) => s.written !== null).length;
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  const free = bench.free;
  const accidentals = bench.accidentalsAllowed;
  const playing = controller.playing;
  const entries = installation.signOf(inst);
  const selectedEntry = entries.find((e) => e.selected);
  const notice = controller.notice;

  const run = (action: TerraceAction): void => {
    const go = installation.performTerrace(action);
    if (go) onNavigate(go.navigate);
  };

  const barButton = (action: TerraceAction, label: string, icon: HudIconName | null, opts: { glyph?: string; key?: string; disabled?: boolean; pressed?: boolean; primary?: boolean; short?: string } = {}) => (
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

  // 고른 열을 말로: 비어 있으면 그렇게, 놓여 있으면 보표 위치(자유로 놀 때는 이름도)
  const cursorText = !cursorColumn ? '· 열을 고르세요' : atCursor?.written ? `· ${terraceSpeakOf(atCursor, free)}` : '· 비어 있어요';
  const pickedAccidental = atCursor?.written ? (atCursor.written.accidental === 'sharp' || atCursor.written.accidental === 'flat' ? atCursor.written.accidental : null) : null;

  return (
    <section class="inst-hud inst-terrace" aria-label={`${inst.name} 작업대`} data-installation-hud={inst.installationId} data-target={ui.targetKey} data-terrace-columns={columns.length} {...(inert ? { inert: true } : {})}>
      {/* 눈에 보이지 않지만 화면 낭독기가 읽는 알림 */}
      <div class="sr-only" role="status" aria-live="polite" data-live>
        {controller.live}
      </div>
      {/* 화면 낭독기가 열마다 둘러볼 수 있는 목록: 월드의 밭은 그림이라 읽히지 않는다 */}
      <ul class="sr-only" aria-label="열 목록" data-terrace-list>
        {columns.map((c) => (
          <li key={c.draft}>{bench.describe(c)}</li>
        ))}
      </ul>

      <div class="inst-float">
        {signOpen ? <SignList entries={entries} installation={installation} menu={menu} /> : null}

        {ui.helpOpen ? (
          <div class="inst-help card" id="inst-help" role="region" aria-label="키보드 도움">
            <h2>키보드로 등 놓기</h2>
            <ul class="help-list">
              {terraceKeyTableOf(accidentals).map((row) => (
                <li key={row.keys}>
                  <kbd>{row.keys}</kbd> {row.label}
                </li>
              ))}
            </ul>
            <p class="muted small">밭의 높이를 눌러도 등이 놓여요. 다른 높이를 누르면 그 열의 등이 옮겨 가요. 끌지 않아도 모두 할 수 있어요.</p>
          </div>
        ) : null}
      </div>

      <div class="inst-main" ref={mainRef}>
        <div class={`feedback inst-feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
          {playing ? (
            <p class="feedback-line" data-listening={playing}>
              <Icon name="play" /> {playing === 'mine' ? '내 등을 듣는 중이에요.' : '목표를 듣는 중이에요.'}
            </p>
          ) : null}
          {feedback?.passed ? (
            <p class="feedback-line">
              <Icon name="check" /> <strong>통과했어요.</strong> {staffPassedText(columns)}
            </p>
          ) : null}
          {feedback?.passed
            ? (feedback.notes ?? []).map((n) => (
                <p key={n} class="feedback-line" data-shape-note>
                  {n}
                </p>
              ))
            : null}
          {messages.slice(0, MAX_MESSAGES).map((m) => (
            <p key={m} class="feedback-line">
              <Icon name="alert" /> <strong>{m}</strong>
            </p>
          ))}
          {messages.length > MAX_MESSAGES ? <p class="feedback-more">그 밖에 {messages.length - MAX_MESSAGES}가지가 더 있어요. 열 위의 ! 표시를 보세요.</p> : null}
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
          {!feedback && !notice && !playing ? <p class="feedback-idle muted">{free ? FREE_IDLE_TEXT : terraceIdleLead(columns.length, placed)}</p> : null}
        </div>

        <div class="inst-row inst-top">
          <SignButton menu={menu} current={selectedEntry?.label ?? '자유로 놀기'} />
          <p class="inst-hand" data-selected-column={cursorColumn?.draft ?? undefined}>
            고른 열 <strong>{cursorColumn ? cursorColumn.label : '없음'}</strong> <span class="inst-cursor">{cursorText}</span>
          </p>
        </div>

        {accidentals ? (
          <div class="inst-row inst-shelf" role="group" aria-label="변화표: 고른 열의 등에 달아요">
            <span class="inst-shelf-label" aria-hidden="true">변화표</span>
            <div class="inst-accidentals" role="group" aria-label="변화표">
              {ACCIDENTALS.map((a) => {
                const on = !!atCursor?.written && pickedAccidental === a.value;
                return (
                  <button
                    type="button"
                    key={a.label}
                    class={`material inst-material${on ? ' is-selected' : ''}`}
                    data-accidental={a.value ?? 'none'}
                    aria-pressed={on}
                    aria-label={a.label}
                    disabled={!atCursor?.written}
                    onClick={() => bench.pickAccidental(a.value)}
                  >
                    <span class="material-name" aria-hidden="true">{a.mark}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div class="inst-row inst-bar" role="toolbar" aria-label="조작 막대">
          {barButton('cursor-left', '이전 열', null, { glyph: '←', key: '←' })}
          {barButton('cursor-right', '다음 열', null, { glyph: '→', key: '→' })}
          {barButton('step-up', '등을 한 칸 위로', null, { glyph: '↑', key: '↑', short: '한 칸 위' })}
          {barButton('step-down', '등을 한 칸 아래로', null, { glyph: '↓', key: '↓', short: '한 칸 아래' })}
          {barButton('octave-up', '등을 한 옥타브 위로', null, { glyph: '⇑', key: 'PgUp', short: '옥타브 위' })}
          {barButton('octave-down', '등을 한 옥타브 아래로', null, { glyph: '⇓', key: 'PgDn', short: '옥타브 아래' })}
          {barButton('place', atCursor?.written ? '놓은 등 울려 보기' : cursorColumn ? `${cursorColumn.label} 열에 등 놓기` : '첫 열 고르기', atCursor?.written ? 'play' : 'plus', { key: 'Enter', primary: true, short: atCursor?.written ? '울려 보기' : cursorColumn ? '놓기' : '열 고르기' })}
          {barButton('remove', '등 빼기', 'eraser', { key: '⌫', disabled: !atCursor?.written, short: '빼기' })}
          {barButton('undo', '실행 취소', 'undo', { key: 'Z', disabled: !controller.canUndo })}
          {barButton('redo', '다시 실행', 'redo', { key: 'Y', disabled: !controller.canRedo })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('hear-mine', '내 등 듣기', 'play', { key: 'P' })}
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
            {`← → 열 · ↑ ↓ 한 칸 · PgUp PgDn 한 옥타브${accidentals ? ' · Shift+↑↓ 변화표' : ''} · Enter 놓기 · P 듣기 · C 확인 · H 도움 · Esc 나가기`}
          </p>
        )}
      </div>
    </section>
  );
}
