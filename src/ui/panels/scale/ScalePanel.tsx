// 4-3 음계 패널(Q07, '패널 쌍둥이'). 월드의 디딤돌 길과 같은 초안, 같은 놓기 작업대를 쓴다(4.2 '패널로 보기').
// 월드에서 놓은 것이 여기 있고, 여기서 고친 것이 월드로 돌아가면 반영되어 있다: 초안은 하나이고 보는 방법이 둘이다.
// 끌지 않아도 모두 할 수 있다(W-4): 재료를 누르고, 자리를 누르고, 단추를 누르거나 키보드(4.2의 키 표)를 쓴다.
import { useRef, useState } from 'preact/hooks';
import { parsePitch, pitchName } from '../../../domain/pitch';
import { CLEF_NAME_KO } from '../../../domain/staff';
import { scaleNameOf } from '../../../domain/scaleKind';
import { SLOT_NOTE_TICKS } from '../../../domain/slotmap';
import type { Hand, SlotView } from '../../../domain/slotmap';
import type { QuestVariant } from '../../../domain/content';
import { measureTicks } from '../../../domain/time';
import { ListeningAids } from '../../assist/ListeningAids';
import { BENCH_KEY_TABLE, benchActionOf, isActivatableElement, isTypingElement } from '../../challenge/benchKeys';
import { slotIdleText, slotPassedText } from '../../challenge/slotText';
import type { ChallengeController } from '../../challenge/controller';
import type { SlotBench } from '../../challenge/slotBench';
import { Glyph } from '../../common/Glyphs';
import { useBench, useController, usePlayheadSlot } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';
import { AccidentalPanel } from './AccidentalPanel';

export interface ScalePanelProps {
  controller: ChallengeController;
  /** 놓기 작업대. 월드의 설치물 모드와 같은 것을 쓰면 손에 든 음도 이어진다 */
  bench: SlotBench;
}

const ACCIDENTALS: ReadonlyArray<{ value: Hand['accidental']; mark: string; label: string }> = [
  { value: 'flat', mark: '♭', label: '내림표' },
  { value: null, mark: '없음', label: '변화표 없음' },
  { value: 'sharp', mark: '♯', label: '올림표' },
];

/** 과제 문장. 목표 악보의 음은 말하지 않는다(음계 과제는 목표가 곧 답이다). 음계의 이름은 판본의 간격 목록에서 읽는다(7-2) */
export function scalePrompt(def: QuestVariant, count: number): string {
  const spec = def.evaluatorSpec;
  const keyName = spec.type === 'orderedScale' ? spec.keyName : undefined;
  const [from, to] = def.challengeDescriptor.range.split('-');
  const range = from && to ? `${pitchName(parsePitch(from))}부터 ${pitchName(parsePitch(to))}까지 ` : '';
  return `${keyName ? `${keyName}의 ` : ''}${scaleNameOf(spec.type === 'orderedScale' ? spec.midiSteps : undefined)}를 ${range}${count}자리에 차례로 놓아 보세요.`;
}

/** 조 이름('G장조', 'D단조')인가. 음계의 이름('C 반음계(오름)')은 조가 아니라서 '조표'를 붙여 읽지 않는다 */
const isKeyName = (name: string): boolean => /(장조|단조)$/.test(name);

/** 화면 낭독기가 읽는 '내 악보' 설명. 그림은 role="img"의 이름과 이 설명으로 같은 내용을 전한다 */
export function describeSlotScore(def: QuestVariant, views: readonly SlotView[]): string {
  const clef = def.score.staves[0] ? CLEF_NAME_KO[def.score.staves[0].clef] : '';
  const spec = def.evaluatorSpec;
  const keyName = spec.type === 'orderedScale' ? spec.keyName : undefined;
  const head = [clef, `${def.score.meter}박자`, keyName ? (isKeyName(keyName) ? `${keyName}의 조표` : keyName) : ''].filter(Boolean).join(', ');
  return `${head}. ${views.map((v) => `${v.slot}번째 자리 ${v.name ?? '비어 있음'}`).join(', ')}.`;
}

/**
 * 음계 패널: 방향이 sequence인 음 순서 과제(Q30 마디 안의 임시표)는 악보를 읽고 널에 깃발을 꽂는 화면이고, 나머지는 디딤돌 배치 화면이다.
 * 화면이 갈리는 곳을 이 껍데기에 둔다: 열린 판본이 바뀌어도 각 화면의 훅 순서는 그대로다.
 */
export function ScalePanel({ controller, bench }: ScalePanelProps) {
  useController(controller);
  const spec = controller.current?.def.evaluatorSpec;
  if (spec?.type === 'orderedScale' && spec.direction === 'sequence') return <AccidentalPanel controller={controller} />;
  return <OrderedScalePanel controller={controller} bench={bench} />;
}

function OrderedScalePanel({ controller, bench }: ScalePanelProps) {
  useController(controller);
  useBench(bench);
  const sounding = usePlayheadSlot(controller);
  const [helpOpen, setHelpOpen] = useState(false);
  const stones = useRef<Array<HTMLButtonElement | null>>([]);
  const cur = controller.current;
  if (!cur || !bench.available) return null;

  const def = cur.def;
  const map = bench.map;
  const hand = bench.hand;
  const views = bench.views();
  const cursor = bench.cursor;
  const flagged = new Set(bench.flagged());
  const feedback = controller.feedback;
  const playing = controller.playing;
  const content = controller.content();
  const spec = def.evaluatorSpec;
  const keyName = spec.type === 'orderedScale' ? spec.keyName : undefined;
  const scaleName = scaleNameOf(spec.type === 'orderedScale' ? spec.midiSteps : undefined);
  const placedCount = views.filter((v) => v.written).length;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];

  const perMeasure = Math.max(1, Math.floor(measureTicks(def.score.meter) / SLOT_NOTE_TICKS));
  const rows: SlotView[][] = [];
  for (let i = 0; i < views.length; i += perMeasure) rows.push(views.slice(i, i + perMeasure));

  const myScore = map.score(content);
  const errorEvents: Record<string, 'error'> = {};
  for (const slot of flagged) errorEvents[`slot-${slot}`] = 'error';

  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingElement(e.target)) return;
    const action = benchActionOf(e);
    // Esc는 앱 전체의 '닫기'가 한다
    if (!action || action === 'exit') return;
    // 단추에 초점이 있을 때 Enter·Space는 그 단추를 누르는 일이다
    if (action === 'place' && isActivatableElement(e.target)) return;
    e.preventDefault();
    const request = bench.perform(action);
    if (request === 'view-panel') controller.announce('지금 패널로 보고 있어요. 마을로 돌아가면 같은 배치가 디딤돌에 놓여 있어요.');
    else if (request === 'help') setHelpOpen((open) => !open);
    else if ((action === 'cursor-left' || action === 'cursor-right') && (e.target as HTMLElement | null)?.dataset?.slot !== undefined) {
      // 자리 단추에서 방향키를 눌렀으면 초점도 고른 자리를 따라간다
      const now = bench.cursor;
      if (now !== null) stones.current[now - 1]?.focus();
    }
  };

  const handName = bench.handName();
  const selectedView = cursor !== null ? views[cursor - 1] : undefined;

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body" onKeyDown={onKeyDown}>
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">{scalePrompt(def, map.count)}</p>
              </div>
              <div class="chips">
                {keyName ? <span class="chip">{keyName}</span> : null}
                <span class="chip">자리 {map.count}개</span>
                <span class="chip">한 자리 = 4분음표</span>
              </div>
            </header>

            <section class="card" aria-labelledby="stones-title">
              <div class="card-head">
                <h2 id="stones-title">내 디딤돌</h2>
                <span class="muted small">자리를 누르면 손에 든 음이 놓여요. 월드의 디딤돌과 같은 배치예요.</span>
              </div>
              {rows.map((row, r) => (
                <div class="timeline-row" key={r}>
                  <h3 class="row-label">{rows.length === 1 ? '자리' : `${r + 1}번째 마디`}</h3>
                  <ol class="cells" aria-label={rows.length === 1 ? '디딤돌 자리' : `${r + 1}번째 마디의 디딤돌 자리`} style={`--cells:${row.length}`}>
                    {row.map((v) => {
                      const isError = flagged.has(v.slot);
                      const isSelected = cursor === v.slot;
                      const isPlaying = sounding === v.slot && playing !== null;
                      return (
                        <li key={v.slot} class="cell-item">
                          <button
                            type="button"
                            class={`cell cell-mine${isError ? ' has-error' : ''}${isSelected ? ' is-selected' : ''}${isPlaying ? ' is-playing' : ''}`}
                            data-slot={v.slot}
                            data-name={v.name ?? ''}
                            ref={(el) => {
                              stones.current[v.slot - 1] = el;
                            }}
                            aria-label={`${v.slot}번째 자리, ${v.name ?? '비어 있음'}${isError ? ', 고칠 곳이 있어요' : ''}${isSelected ? ', 고른 자리' : ''}${isPlaying ? ', 지금 울리는 자리' : ''}`}
                            aria-current={isSelected ? 'true' : undefined}
                            onClick={() => bench.press(v.slot)}
                          >
                            <span class="cell-label" aria-hidden="true">{v.slot}번 자리</span>
                            <span class="cell-face" aria-hidden="true">
                              <Glyph kind={v.written ? 'quarter-note' : 'empty'} />
                              <span class="cell-name">{v.name ?? '비어 있음'}</span>
                            </span>
                            {isError ? <span class="cell-mark" aria-hidden="true"><Icon name="alert" /></span> : null}
                            {isPlaying ? <span class="cell-now" aria-hidden="true"><Icon name="play" /> 지금</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> {slotPassedText(keyName, map.count, scaleName)}
                  </p>
                ) : null}
                {messages.map((m) => (
                  <p key={m} class="feedback-line">
                    <Icon name="alert" /> <strong>{m}</strong>
                  </p>
                ))}
                {feedback?.technical ? (
                  <p class="feedback-line">
                    <Icon name="alert" /> {feedback.messages[0]}
                  </p>
                ) : null}
                {!feedback ? (
                  <p class="feedback-idle muted">{slotIdleText(placedCount, map.count)}</p>
                ) : null}
              </div>
            </section>

            <section class="card tray" aria-labelledby="shelf-title">
              <div class="tray-head">
                <h2 id="shelf-title">재료 선반</h2>
                <p class="muted small">낮은 음에서 높은 음 순서예요. 음을 고른 뒤 자리를 누르세요.</p>
              </div>
              <div class="tray-items" role="group" aria-label="소리 높이">
                {map.shelf.map((position, i) => {
                  const on = hand.shelfIndex === i;
                  const name = map.nameOf({ shelfIndex: i, accidental: hand.accidental });
                  return (
                    <button type="button" key={position.name} class={`material${on ? ' is-selected' : ''}`} data-shelf={i} aria-pressed={on} onClick={() => bench.pickShelf(i)}>
                      <Glyph kind="quarter-note" />
                      <span class="material-name">{name}</span>
                    </button>
                  );
                })}
              </div>
              <div class="tray-items" role="group" aria-label="변화표">
                {ACCIDENTALS.map((a) => {
                  const on = hand.accidental === a.value;
                  return (
                    <button type="button" key={a.label} class={`material${on ? ' is-selected' : ''}`} data-accidental={a.value ?? 'none'} aria-pressed={on} onClick={() => bench.pickAccidental(a.value)}>
                      <span class="material-name">{a.mark}</span>
                      <span class="material-sub">{a.label}</span>
                    </button>
                  );
                })}
              </div>
              <p class="tray-mode" data-hand={handName}>
                손에 든 음: <strong>{handName}</strong>. {cursor !== null ? `${cursor}번째 자리를 골랐어요. 놓기를 누르면 이 음으로 바뀌어요.` : '자리를 누르면 놓여요.'}
              </p>
              <div class="tray-tools">
                <button type="button" class="btn btn-primary" onClick={() => bench.place()}>
                  <Icon name="plus" /> {cursor !== null ? `${cursor}번째 자리에 놓기` : '첫 자리에 놓기'}
                </button>
                <button type="button" class="btn btn-quiet" onClick={() => bench.remove()} disabled={!selectedView?.written}>
                  <Icon name="eraser" /> 고른 자리 비우기
                </button>
                <button type="button" class="btn btn-quiet" onClick={() => controller.undo()} disabled={!controller.canUndo}>
                  <Icon name="undo" /> 실행 취소
                </button>
                <button type="button" class="btn btn-quiet" onClick={() => controller.redo()} disabled={!controller.canRedo}>
                  <Icon name="redo" /> 다시 실행
                </button>
                <button type="button" class="btn btn-quiet" onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen} aria-controls="bench-help">
                  <Icon name="help" /> 키 도움
                </button>
                <span class="muted small">드래그 없이도 가능</span>
              </div>
              {helpOpen ? (
                <div class="bench-help" id="bench-help">
                  <h3>키보드로 놓기</h3>
                  <ul class="help-list">
                    {BENCH_KEY_TABLE.map((row) => (
                      <li key={row.keys}>
                        <kbd>{row.keys}</kbd> {row.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section class="card score-view" aria-labelledby="score-title">
              <div class="card-head">
                <h2 id="score-title">악보로 보기</h2>
                <span class="muted small">내가 놓은 음을 오선에 그린 것이에요. 빈 자리는 쉼표예요</span>
              </div>
              <figure class="score-figure">
                <figcaption class="sr-only">내 악보</figcaption>
                <StaffView score={myScore} title="내 악보" description={describeSlotScore(def, views)} options={{ highlight: errorEvents, measuresPerSystem: rows.length }} />
              </figure>
            </section>
          </div>

          <div class="panel-side">
            <ListeningAids controller={controller} onCheck={() => controller.check()} beatAids={false} />
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
