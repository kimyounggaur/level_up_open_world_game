// 7-3 건반 다리(T6, 설계서 4.8)의 화면: 표지판(과제 고르기), 할 것 칩, 이름표와 음정 이름 단추, 조작 막대, 도움 카드, 확인 결과.
// 월드(Phaser)는 널(건반)과 이름표 자리, 말뚝과 밧줄, 깃발, 표지판 악보, 커서와 판정이 가리킨 곳을 그리고, 여기서는 단추와 글을 맡는다. 둘은 다리(WorldBridge)로만 만난다.
// 끌지 않아도 모두 할 수 있다(W-4): 키보드(keyBridgeKeys의 표), 널 눌러 놓기, 이 화면의 단추.
// 맞고 틀림은 색만으로 말하지 않는다: 기호(그림)와 문장을 함께 두고, 문장은 판정기의 설명을 그대로 쓴다.
// 문제를 푸는 중에는 검은 널을 이웃한 흰 널로만 말하고 이름은 말하지 않는다. 자유로 놀 때만 이름도 말한다(4.8).
import { useEffect, useRef } from 'preact/hooks';
import { NAME_TAGS, namesForMidi, stakeNameOf } from '../../domain/keyBridge';
import { INTERVAL_PICK_NUMBERS, INTERVAL_PICK_QUALITIES, intervalQualityName } from '../../domain/slotplan';
import type { WorldBridge } from '../../platform/bridge';
import { isActivatableElement, isTypingElement } from '../challenge/benchKeys';
import type { ChallengeController } from '../challenge/controller';
import type { BridgeItem, KeyBridgeBench, QuestionItem } from '../challenge/keyBridgeBench';
import { bridgeActionOf, bridgeKeyTableOf } from '../challenge/keyBridgeKeys';
import type { BridgeAction } from '../challenge/keyBridgeKeys';
import { bridgeIdleLead, bridgePassedText } from '../challenge/keyBridgeText';
import { FREE_IDLE_TEXT } from '../challenge/slotText';
import { useBench, useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import type { InstallationController } from './controller';
import { BarButton, SignButton, SignList, useBottomInset, useSignMenu } from './hudParts';
import type { HudIconName } from './hudParts';

export interface KeyBridgeHudProps {
  bridge: WorldBridge;
  controller: ChallengeController;
  bench: KeyBridgeBench;
  installation: InstallationController;
  /** 화면을 옮긴다(패널로 보기) */
  onNavigate: (hash: string) => void;
  /** 키보드가 없는 터치 화면인가(키 안내 글을 줄인다) */
  touchOnly?: boolean;
  /** 위에 모달 카드가 떠 있어 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
}

/** 작업대에서는 월드가 가려지지 않게 확인 결과를 이만큼만 보인다. 나머지는 널 위의 ! 표시와 패널이 알려 준다 */
const MAX_MESSAGES = 3;

/** 키를 꾹 눌러도 되풀이되는 동작: 널과 할 것과 이름을 옮기는 것뿐이다. 놓기, 빼기, 듣기 같은 것은 한 번에 한 번이다 */
const REPEATABLE: ReadonlySet<BridgeAction> = new Set(['cursor-left', 'cursor-right', 'hand-up', 'hand-down', 'accidental-up', 'accidental-down']);

const SAME_OPTIONS: ReadonlyArray<{ same: boolean; label: string }> = [
  { same: true, label: '같아요' },
  { same: false, label: '달라요' },
];

/** 할 것 칩에 쓰는 짧은 글(화면 낭독기는 문장을 읽는다) */
function chipText(item: BridgeItem, index: number): string {
  if (item.kind === 'tag') return `${index + 1}번 ${item.text ?? '—'}`;
  if (item.kind === 'flag') return `${item.order}번 ${item.plank !== null ? '✓' : '—'}`;
  const done = item.parts.every((p) => p.value !== null);
  return `${item.label} ${done ? '✓' : '—'}`;
}

/** 고른 것을 한 줄로: 이름표는 걸린 글자, 깃발은 꽂힌 널, 밧줄은 도수와 반음 수 */
function itemStateText(item: BridgeItem, speak: (plank: number) => string): string {
  if (item.kind === 'tag') return item.text ? `· ${item.text} 이름표` : '· 비어 있어요';
  if (item.kind === 'flag') return item.plank !== null ? `· ${speak(item.plank)}에 꽂혀 있어요` : '· 아직 꽂지 않았어요';
  return item.rope ? `· 밧줄 ${item.rope}` : '· 끝 말뚝을 꽂아 주세요';
}

export function KeyBridgeHud({ bridge, controller, bench, installation, onNavigate, touchOnly = false, inert }: KeyBridgeHudProps) {
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

  // 키보드(keyBridgeKeys의 표). 모드에 있는 동안 월드는 키를 받지 않는다.
  // Esc는 열려 있는 표지판 목록이나 도움 카드를 먼저 닫고, 닫을 것이 없을 때만 나간다
  const helpOpen = ui.helpOpen;
  useEffect(() => {
    if (!installationId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing || bridge.pause.get()) return;
      if (isTypingElement(e.target)) return;
      const action = bridgeActionOf(e);
      if (!action) return;
      // 표지판 목록 안에 초점이 있는 동안은 목록이 키를 쓴다(Tab, Enter, ↑ ↓). 놓기 키가 아니라 Esc만 이쪽에서 받는다
      if (action !== 'exit' && signListRef.current?.contains(e.target as Node | null)) return;
      // 단추에 초점이 있을 때 Enter·Space는 그 단추를 누르는 일이다
      if (action === 'place' && isActivatableElement(e.target)) return;
      // 방향키는 '널과 할 것을 다루는 중'이라는 뜻이다. 단추에 머물러 있던 초점은 놓아 준다: 이어서 누르는 Enter가 그 단추가 아니라 놓기가 되게
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
      const go = installation.performKeyBridge(action);
      if (go) onNavigate(go.navigate);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, bench, installation, installationId, onNavigate, signOpen, setSignOpen, signListRef, helpOpen]);

  if (!inst || !ui.mode || !bench.available) return null;

  const task = bench.task!;
  const items = bench.items();
  const selected = items.find((i) => i.selected) ?? null;
  const done = bench.filledCount();
  const free = bench.free;
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  const playing = controller.playing;
  const entries = installation.signOf(inst);
  const selectedEntry = entries.find((e) => e.selected);
  const notice = controller.notice;
  const cursor = bench.cursor;

  const run = (action: BridgeAction): void => {
    const go = installation.performKeyBridge(action);
    if (go) onNavigate(go.navigate);
  };

  const barButton = (action: BridgeAction, label: string, icon: HudIconName | null, opts: { glyph?: string; key?: string; disabled?: boolean; pressed?: boolean; primary?: boolean; short?: string } = {}) => (
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

  // ----- 과제에 따라 달라지는 글
  const noun = task === 'names' ? '이름표 자리' : task === 'flags' ? '깃발' : '밧줄';
  // 막대에 보이는 짧은 글은 접근 이름(이전 이름표 자리)의 앞부분이다: 보이는 글자가 접근 이름에 들어 있어야 음성 조작이 된다
  const shortNoun = task === 'names' ? '이름표' : noun;
  const buildSelected: QuestionItem | null = selected?.kind === 'question' && selected.qkind === 'build' ? selected : null;
  // 키 안내 줄은 이 판본의 질문 종류를 따른다: 음 쌓기에서만 끝 말뚝을 꽂고 말뚝 이름을 바꾼다(이름 묻기와 비교는 두 음을 들어 본다)
  const hasBuild = items.some((i) => i.kind === 'question' && i.qkind === 'build');
  const placeLabel =
    task === 'names' ? '이 널의 이름표 자리 고르기' : task === 'flags' ? (selected ? `${selected.label} 꽂기` : '깃발 꽂기') : buildSelected ? '끝 말뚝 꽂기' : '두 음 들어 보기';
  const placeShort = task === 'names' ? '자리 고르기' : task === 'flags' ? '꽂기' : buildSelected ? '꽂기' : '두 음';
  const removeLabel = task === 'names' ? '이름표 떼기' : task === 'flags' ? '깃발 빼기' : '답 비우기';
  const removeShort = task === 'names' ? '떼기' : task === 'flags' ? '빼기' : '비우기';
  const hearLabel = task === 'names' ? '내 이름표 듣기' : task === 'flags' ? '내 깃발 듣기' : '고른 질문 듣기';
  const canRemove =
    !!selected && (selected.kind === 'tag' ? selected.text !== null : selected.kind === 'flag' ? selected.plank !== null : selected.parts.some((p) => p.value !== null) || selected.pick.quality !== null || selected.pick.number !== null);

  // 고른 것을 말로
  const stateText = selected ? itemStateText(selected, (p) => bench.speak(p)) : '· 위 칩이나 ↑ ↓로 골라 주세요';
  const cursorText = cursor !== null ? bench.speak(cursor) : '없음';

  // 재료 선반: 이름 과제는 이름표 열 개, 음정 과제는 고른 질문의 답 단추, 임시표 과제는 선반이 없다(널에 깃발을 꽂는다)
  const stakeNames = buildSelected && buildSelected.endPlank !== null ? namesForMidi(bench.plank(buildSelected.endPlank)!.midi) : [];
  const pickedStake = buildSelected?.parts[0]?.value ?? null;
  const identify: QuestionItem | null = selected?.kind === 'question' && selected.qkind === 'identify' ? selected : null;
  const compare: QuestionItem | null = selected?.kind === 'question' && selected.qkind === 'compare' ? selected : null;
  const hungText = selected?.kind === 'tag' ? selected.text : null;

  return (
    <section class="inst-hud inst-bridge" aria-label={`${inst.name} 작업대`} data-installation-hud={inst.installationId} data-target={ui.targetKey} data-bridge-task={task} data-bridge-items={items.length} {...(inert ? { inert: true } : {})}>
      {/* 눈에 보이지 않지만 화면 낭독기가 읽는 알림 */}
      <div class="sr-only" role="status" aria-live="polite" data-live>
        {controller.live}
      </div>
      {/* 화면 낭독기가 할 것마다 둘러볼 수 있는 목록: 월드의 다리는 그림이라 읽히지 않는다 */}
      <ul class="sr-only" aria-label="할 것 목록" data-bridge-list>
        {items.map((item) => (
          <li key={item.kind === 'question' ? item.qid : item.draft}>{bench.describe(item)}</li>
        ))}
      </ul>

      <div class="inst-float">
        {signOpen ? <SignList entries={entries} installation={installation} menu={menu} /> : null}

        {ui.helpOpen ? (
          <div class="inst-help card" id="inst-help" role="region" aria-label="키보드 도움">
            <h2>키보드로 건반 다리 쓰기</h2>
            <ul class="help-list">
              {bridgeKeyTableOf(task).map((row) => (
                <li key={row.keys}>
                  <kbd>{row.keys}</kbd> {row.label}
                </li>
              ))}
            </ul>
            <p class="muted small">널을 눌러도 돼요. 널을 밟으면 그 널의 소리가 나요. 끌지 않아도 모두 할 수 있어요.</p>
          </div>
        ) : null}
      </div>

      <div class="inst-main" ref={mainRef}>
        <div class={`feedback inst-feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
          {playing ? (
            <p class="feedback-line" data-listening={playing}>
              <Icon name="play" /> {playing === 'mine' ? '내 것을 듣는 중이에요.' : '목표를 듣는 중이에요.'}
            </p>
          ) : null}
          {feedback?.passed ? (
            <p class="feedback-line">
              <Icon name="check" /> <strong>통과했어요.</strong> {bridgePassedText(task)}
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
          {messages.length > MAX_MESSAGES ? <p class="feedback-more">그 밖에 {messages.length - MAX_MESSAGES}가지가 더 있어요. 다리 위의 ! 표시를 보세요.</p> : null}
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
          {!feedback && !notice && !playing ? <p class="feedback-idle muted">{free ? FREE_IDLE_TEXT : bridgeIdleLead(task, items.length, done)}</p> : null}
        </div>

        <div class="inst-row inst-top">
          <SignButton menu={menu} current={selectedEntry?.label ?? '자유로 놀기'} />
          <p class="inst-hand" data-selected-item={selected ? (selected.kind === 'question' ? selected.qid : selected.draft) : undefined} data-plank-cursor={cursor ?? undefined}>
            고른 {noun} <strong>{selected ? selected.label : '없음'}</strong> <span class="inst-cursor">{stateText}</span> <span class="inst-cursor" data-plank-text>· 널 {cursorText}</span>
          </p>
        </div>

        {/* 할 것 칩: 손가락만으로도 고를 수 있게 한다. 길면 옆으로 넘긴다 */}
        <div class="inst-row inst-shelf" role="group" aria-label={`${noun} 고르기`} data-bridge-chips>
          {items.map((item, i) => (
            <button
              type="button"
              key={item.kind === 'question' ? item.qid : item.draft}
              class={`material inst-material${item.selected ? ' is-selected' : ''}`}
              data-item={item.kind === 'question' ? item.qid : item.draft}
              data-flagged={item.flagged ? 'true' : undefined}
              aria-pressed={item.selected}
              aria-label={bench.describe(item)}
              onClick={() => bench.selectItem(item.kind === 'question' ? item.parts[0]!.draft : item.draft)}
            >
              <span class="material-name" aria-hidden="true">{chipText(item, i)}</span>
              {item.flagged ? <span class="material-sub" aria-hidden="true">!</span> : null}
            </button>
          ))}
        </div>

        {task === 'names' ? (
          <div class="inst-row inst-shelf" role="group" aria-label="이름표: 고른 자리에 걸어요" data-bridge-tags>
            <span class="inst-shelf-label" aria-hidden="true">이름표</span>
            {NAME_TAGS.map((tag) => {
              const on = hungText === tag.text;
              return (
                <button
                  type="button"
                  key={tag.text}
                  class={`material inst-material${on ? ' is-selected' : ''}`}
                  data-tag={tag.text}
                  aria-pressed={on}
                  aria-label={`${tag.text} 이름표`}
                  disabled={selected?.kind !== 'tag'}
                  onClick={() => bench.hangTag(tag)}
                >
                  <span class="material-name" aria-hidden="true">{tag.text}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {identify ? (
          <div class="inst-row inst-shelf" role="group" aria-label="음정 이름: 성질과 도수를 골라요" data-bridge-pick="identify">
            <span class="inst-shelf-label" aria-hidden="true">성질</span>
            {INTERVAL_PICK_QUALITIES.map((q) => {
              const on = identify.pick.quality === q;
              return (
                <button type="button" key={q} class={`material inst-material${on ? ' is-selected' : ''}`} data-quality={q} aria-pressed={on} aria-label={`성질 ${intervalQualityName(q)}`} onClick={() => bench.pickQuality(q)}>
                  <span class="material-name" aria-hidden="true">{intervalQualityName(q)}</span>
                </button>
              );
            })}
            <span class="inst-shelf-label" aria-hidden="true">도수</span>
            {INTERVAL_PICK_NUMBERS.map((n) => {
              const on = identify.pick.number === n;
              return (
                <button type="button" key={n} class={`material inst-material${on ? ' is-selected' : ''}`} data-number={n} aria-pressed={on} aria-label={`${n}도`} onClick={() => bench.pickNumber(n)}>
                  <span class="material-name" aria-hidden="true">{n}도</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {compare ? (
          <div class="inst-row inst-shelf" role="group" aria-label="같은가 다른가: 소리와 표기를 따로 답해요" data-bridge-pick="compare">
            {compare.parts.map((part, index) => (
              <span class="inst-accidentals" role="group" aria-label={`${part.label}이 같은가요`} key={part.draft}>
                <span class="inst-shelf-label" aria-hidden="true">{part.label}</span>
                {SAME_OPTIONS.map((o) => {
                  const on = part.value === o.label;
                  return (
                    <button type="button" key={o.label} class={`material inst-material${on ? ' is-selected' : ''}`} data-part={part.part} data-answer={o.same ? 'same' : 'different'} aria-pressed={on} aria-label={`${part.label} ${o.label}`} onClick={() => bench.pickSame(index === 0 ? 0 : 1, o.same)}>
                      <span class="material-name" aria-hidden="true">{o.label}</span>
                    </button>
                  );
                })}
              </span>
            ))}
          </div>
        ) : null}

        {buildSelected ? (
          <div class="inst-row inst-shelf" role="group" aria-label="끝 말뚝의 이름을 골라요" data-bridge-pick="build">
            <span class="inst-shelf-label" aria-hidden="true">끝 말뚝</span>
            {stakeNames.length === 0 ? <span class="muted">널을 눌러 끝 말뚝을 꽂아 주세요.</span> : null}
            {stakeNames.map((w) => {
              const name = stakeNameOf(w);
              const on = pickedStake === name;
              return (
                <button type="button" key={name} class={`material inst-material${on ? ' is-selected' : ''}`} data-stake={name} aria-pressed={on} aria-label={`끝 말뚝 이름 ${name}`} onClick={() => bench.pickName(w)}>
                  <span class="material-name" aria-hidden="true">{name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div class="inst-row inst-bar" role="toolbar" aria-label="조작 막대">
          {barButton('cursor-left', '이전 널', null, { glyph: '←', key: '←' })}
          {barButton('cursor-right', '다음 널', null, { glyph: '→', key: '→' })}
          {barButton('hand-up', `이전 ${noun}`, null, { glyph: '↑', key: '↑', short: `이전 ${shortNoun}` })}
          {barButton('hand-down', `다음 ${noun}`, null, { glyph: '↓', key: '↓', short: `다음 ${shortNoun}` })}
          {barButton('place', placeLabel, selected ? 'play' : 'plus', { key: 'Enter', primary: true, short: placeShort })}
          {barButton('remove', removeLabel, 'eraser', { key: '⌫', disabled: !canRemove, short: removeShort })}
          {barButton('undo', '실행 취소', 'undo', { key: 'Z', disabled: !controller.canUndo })}
          {barButton('redo', '다시 실행', 'redo', { key: 'Y', disabled: !controller.canRedo })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('hear-mine', hearLabel, 'play', { key: 'P' })}
          {barButton('hear-target', '목표 듣기', 'speaker', { key: 'T' })}
          {barButton('stop', '정지', 'stop', { key: 'S', disabled: playing === null })}
          {barButton('check', '확인', 'check', { key: 'C' })}
          <span class="inst-divider" aria-hidden="true" />
          {barButton('view-panel', '패널로 보기', 'map', { key: 'V' })}
          {barButton('help', '도움', 'help', { key: 'H', pressed: ui.helpOpen })}
          {barButton('exit', '나가기', 'close', { key: 'Esc' })}
        </div>
        {touchOnly ? null : (
          <p class="inst-hint muted" aria-hidden="true">
            {`← → 널 · ↑ ↓ ${noun}${task === 'names' ? ' · Shift+↑↓ 이름표' : hasBuild ? ' · Shift+↑↓ 말뚝 이름' : ''} · Enter ${task === 'flags' ? '꽂기' : task === 'names' ? '자리 고르기' : hasBuild ? '말뚝 꽂기' : '두 음 듣기'} · P 듣기 · C 확인 · H 도움 · Esc 나가기`}
          </p>
        )}
      </div>
    </section>
  );
}
