// 6-4 징검다리(T2, 설계서 4.4)의 화면: 표지판(과제 고르기), 재료 선반(돌의 종류, 길이, 음높이), 남은 물 한 줄, 조작 막대, 도움 카드, 확인 결과.
// 월드(Phaser)는 여울과 돌, 놓으려는 자리, 물결 선을 맡고, 여기서는 단추와 글을 맡는다. 둘은 다리(WorldBridge)로만 만난다.
// 끌지 않아도 모두 할 수 있다(W-4): 키보드(timelineKeys의 표), 돌을 눌러 놓기, 이 화면의 단추.
// 맞고 틀림은 색만으로 말하지 않는다: 기호(그림)와 문장을 함께 두고, 같은 문장을 패널과 같이 쓴다.
// 남은 물은 판정이 아니라 지금 초안의 사실이라서 확인하기 전에도 늘 문장으로 보인다. 마디가 덜 채워졌다는 판정이 있으면 그 줄이 강조된다.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { pitchName } from '../../domain/pitch';
import { eventCovering, tupletKindName } from '../../domain/timeline';
import { followsBeat } from '../../domain/timelineStones';
import type { WorldBridge } from '../../platform/bridge';
import { isActivatableElement, isTypingElement } from '../challenge/benchKeys';
import type { ChallengeController } from '../challenge/controller';
import { FREE_IDLE_TEXT } from '../challenge/slotText';
import { kindNamesOf, passedTextOf, stoneIdleLead } from '../challenge/stoneText';
import type { TimelineBench } from '../challenge/timelineBench';
import { timelineActionOf, timelineKeyTableOf } from '../challenge/timelineKeys';
import type { TimelineAction } from '../challenge/timelineKeys';
import { useBench, useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import { restName, tupletKeyOf, usesPitch, usesValue } from '../timeline/tool';
import type { InstallationController } from './controller';
import { BarButton, SignButton, SignList, useBottomInset, useSignMenu } from './hudParts';
import type { HudIconName } from './hudParts';

export interface TimelineHudProps {
  bridge: WorldBridge;
  controller: ChallengeController;
  bench: TimelineBench;
  installation: InstallationController;
  /** 화면을 옮긴다(패널로 보기) */
  onNavigate: (hash: string) => void;
  /** 키보드가 없는 터치 화면인가(키 안내 글을 줄인다) */
  touchOnly?: boolean;
  /** 위에 모달 카드가 떠 있어 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
}

/** 작업대에서는 월드가 가려지지 않게 확인 결과를 이만큼만 보인다. 나머지는 돌 위의 ! 표시와 패널이 알려 준다 */
const MAX_MESSAGES = 3;

/** 키를 꾹 눌러도 되풀이되는 동작: 칸과 박과 높이와 길이를 옮기는 것뿐이다. 놓기, 빼기, 듣기 같은 것은 한 번에 한 번이다 */
const REPEATABLE: ReadonlySet<TimelineAction> = new Set(['cursor-left', 'cursor-right', 'beat-prev', 'beat-next', 'hand-up', 'hand-down', 'length-up', 'length-down']);

/** 고른 칸을 말로: '2박'은 '2박 칸', '1박 2번째 칸'과 '2박 둘째 돌'은 그대로(이미 '칸'이나 '돌'로 끝나는 말에는 '칸'을 또 붙이지 않는다) */
const cellWord = (label: string): string => (/[칸돌]$/.test(label) ? label : `${label} 칸`);

export function TimelineHud({ bridge, controller, bench, installation, onNavigate, touchOnly = false, inert }: TimelineHudProps) {
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

  // 키보드(timelineKeys의 표). 모드에 있는 동안 월드는 키를 받지 않는다.
  // Esc는 열려 있는 표지판 목록이나 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다
  const helpOpen = ui.helpOpen;
  useLayoutEffect(() => {
    if (!installationId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || bridge.pause.get()) return;
      if (isTypingElement(e.target)) return;
      const action = timelineActionOf(e);
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
      const go = installation.performTimeline(action);
      if (go) onNavigate(go.navigate);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, installation, installationId, onNavigate, signOpen, setSignOpen, signListRef, helpOpen]);

  if (!inst || !ui.mode || !bench.available) return null;

  const spec = bench.spec;
  // 놓는 것을 돌이라고 부를지(징검다리) 못이라고 부를지(물레방아, 4.5): 같은 작업대에 말만 다르다
  const vocab = bench.vocab;
  const kindNames = kindNamesOf(vocab);
  const hand = bench.hand;
  const cursor = bench.cursor;
  const content = controller.content();
  const covering = cursor !== null ? eventCovering(content, { voiceId: bench.lane.voiceId, measureIndex: 0, tick: cursor }) : undefined;
  const water = bench.water(content);
  const waterText = bench.waterLine(content);
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  // 마디가 덜 채워졌다는 판정이 있었다: 남은 물 줄을 강조한다(문장은 같고 기호와 굵은 글씨가 붙는다)
  const emphasis = !!feedback && !feedback.passed && !feedback.technical && feedback.issues.some((i) => i.code === 'MEASURE_TICKS_REMAIN');
  const free = bench.free;
  const playing = controller.playing;
  const entries = installation.signOf(inst);
  const selectedEntry = entries.find((e) => e.selected);
  const notice = controller.notice;
  const lengths = bench.lengths();
  const pitches = bench.pitches();
  const kinds = bench.kinds();
  const tuplets = bench.tuplets();
  // 뗏목을 들었고 뗏목 종류가 둘 이상이면 길이 단추 자리에 뗏목 종류 단추가 온다(뗏목의 길이는 종류가 정한다)
  const showTuplets = hand.kind === 'raft' && tuplets.length > 1;
  const byBeat = followsBeat(inst);
  const cursorLabel = bench.cursorLabel();

  const run = (action: TimelineAction): void => {
    const go = installation.performTimeline(action);
    if (go) onNavigate(go.navigate);
  };

  const barButton = (action: TimelineAction, label: string, icon: HudIconName | null, opts: { glyph?: string; key?: string; disabled?: boolean; pressed?: boolean; primary?: boolean; short?: string } = {}) => (
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
    <section class="inst-hud inst-timeline" aria-label={`${inst.name} 작업대`} data-installation-hud={inst.installationId} data-target={ui.targetKey} {...(inert ? { inert: true } : {})}>
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
              {timelineKeyTableOf(vocab).map((row) => (
                <li key={row.keys}>
                  <kbd>{row.keys}</kbd> {row.label}
                </li>
              ))}
            </ul>
            <p class="muted small">
              칸을 눌러도 손에 든 {vocab.piece}이 놓여요. {vocab.piece}은 칸에 맞춰 놓이고, 다른 {vocab.piece}과 겹치면 놓이지 않고 이유를 알려 줘요. 끌지 않아도 모두 할 수 있어요.
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
              <Icon name="check" /> <strong>통과했어요.</strong> {passedTextOf(vocab)}
            </p>
          ) : null}
          {messages.slice(0, MAX_MESSAGES).map((m) => (
            <p key={m} class="feedback-line">
              <Icon name="alert" /> <strong>{m}</strong>
            </p>
          ))}
          {messages.length > MAX_MESSAGES ? <p class="feedback-more">그 밖에 {messages.length - MAX_MESSAGES}가지가 더 있어요. {vocab.piece} 위의 ! 표시를 보세요.</p> : null}
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
          {!feedback && !notice && !playing ? <p class="feedback-idle muted">{free ? FREE_IDLE_TEXT : stoneIdleLead(bench.filled(), spec.measureTicks, vocab)}</p> : null}
        </div>

        <p class={`inst-water${emphasis ? ' is-emphasis' : ''}`} data-water={water.length} data-emphasis={emphasis ? 'true' : undefined}>
          <Icon name={emphasis ? 'alert' : 'footsteps'} /> {emphasis ? <strong>{waterText}</strong> : waterText}
        </p>

        <div class="inst-row inst-top">
          <SignButton menu={menu} current={selectedEntry?.label ?? '자유로 놀기'} />
          <p class="inst-hand" data-hand={bench.handName()}>
            손에 든 것 <strong>{bench.handName()}</strong> <span class="inst-cursor">{cursorLabel !== null ? `· ${cellWord(cursorLabel)}` : '· 칸을 고르세요'}</span>
          </p>
        </div>

        <div class="inst-row inst-shelf" role="group" aria-label={showTuplets ? `재료 선반: ${vocab.piece}의 종류와 뗏목의 종류` : `재료 선반: ${vocab.piece}의 종류와 길이`}>
          {kinds.map((k) => {
            const on = hand.kind === k;
            return (
              <button type="button" key={k} class={`material inst-material${on ? ' is-selected' : ''}${k === 'erase' ? ' material-erase' : ''}`} data-kind={k} aria-pressed={on} onClick={() => bench.pickKind(k)}>
                <span class="material-name">{kindNames[k].name}</span>
              </button>
            );
          })}
          <span class="inst-divider" aria-hidden="true" />
          {showTuplets
            ? tuplets.map((t) => {
                const key = tupletKeyOf(t);
                const on = hand.tuplet !== null && tupletKeyOf(hand.tuplet) === key;
                return (
                  <button type="button" key={key} class={`material inst-material${on ? ' is-selected' : ''}`} data-tuplet={key} aria-pressed={on} onClick={() => bench.pickTuplet(key)}>
                    <span class="material-name">{tupletKindName(t)}</span>
                  </button>
                );
              })
            : null}
          {showTuplets ? null : lengths.map((l) => {
            const on = usesValue(hand.kind) && hand.value === l.value && hand.dotted === l.dotted;
            return (
              <button
                type="button"
                key={`${l.value}${l.dotted ? '-dotted' : ''}`}
                class={`material inst-material${on ? ' is-selected' : ''}`}
                data-value={l.value}
                data-dotted={l.dotted ? 'true' : undefined}
                aria-pressed={on}
                disabled={!usesValue(hand.kind)}
                onClick={() => bench.pickLength(l.value, l.dotted)}
              >
                <span class="material-name">{hand.kind === 'rest' ? restName(l.value, l.dotted) : l.name}</span>
              </button>
            );
          })}
        </div>

        <div class="inst-row inst-shelf" role="group" aria-label="재료 선반: 소리 높이">
          {pitches.map((p) => {
            const name = pitchName(p);
            const on = usesPitch(hand.kind) && pitchName(hand.pitch) === name;
            return (
              <button type="button" key={name} class={`material inst-material${on ? ' is-selected' : ''}`} data-pitch={name} aria-pressed={on} disabled={!usesPitch(hand.kind)} onClick={() => bench.pickPitch(p)}>
                <span class="material-name">{name}</span>
              </button>
            );
          })}
        </div>

        <div class="inst-row inst-bar" role="toolbar" aria-label="조작 막대">
          {barButton('cursor-left', '이전 칸', null, { glyph: '←', key: '←' })}
          {barButton('cursor-right', '다음 칸', null, { glyph: '→', key: '→' })}
          {byBeat ? barButton('beat-prev', '이전 박', null, { glyph: '«', key: 'PgUp', short: '이전 박' }) : null}
          {byBeat ? barButton('beat-next', '다음 박', null, { glyph: '»', key: 'PgDn', short: '다음 박' }) : null}
          {barButton('place', cursorLabel !== null ? `${cellWord(cursorLabel)}에 놓기` : '첫 칸에 놓기', 'plus', { key: 'Enter', primary: true, short: '놓기' })}
          {barButton('remove', '빼기', 'eraser', { key: '⌫', disabled: covering === undefined })}
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
        {touchOnly ? null : <p class="inst-hint muted" aria-hidden="true">← → 칸 · PgUp PgDn 박 · ↑ ↓ 음 · Shift+↑↓ 길이 · R 종류 · Enter 놓기 · P 듣기 · C 확인 · H 도움 · Esc 나가기</p>}
      </div>
    </section>
  );
}
