// 5-1 Q03 시간선 패널(확대형 시간선): 한 마디를 박마다 확대해서 32분음표, 쉼, 셋잇단 묶음을 놓는다.
// 위에는 한 마디 전체 개요(목표와 내 배치), 가운데에는 고른 박의 확대 창, 아래에는 재료와 악보가 있다.
// 칸 하나는 120틱(32분음표), 셋잇단 돌 하나는 320틱이라서 같은 8분음표 셋이라도 보통 음표와 셋잇단은 길이가 눈으로 다르다.
// 끌지 않아도 모두 할 수 있다: 재료를 고르고 칸을 누르면 놓인다(7.9 2번).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { draftScoreOf } from '../../../domain/challenge';
import { VALUE_NAME_KO, tupletNoteTicks } from '../../../domain/time';
import { beatWindows, blocksOf, timelineOf } from '../../../domain/timeline';
import type { TimelineBlock } from '../../../domain/timeline';
import type { DraftContent } from '../../../domain/session';
import { ListeningAids } from '../../assist/ListeningAids';
import type { ChallengeController } from '../../challenge/controller';
import { beatName } from '../../common/format';
import { useController, usePlayheadTick } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { describeScore } from '../../notation/describe';
import { StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';
import { BlockRow } from '../../timeline/BlockRow';
import { MaterialTray } from '../../timeline/MaterialTray';
import { errorEventIdsOf, marksOf, windowsWithMarks } from '../../timeline/marks';
import { clearBlock, pressBlock } from '../../timeline/press';
import { NO_TOOL, resolveTool } from '../../timeline/tool';
import type { ToolState } from '../../timeline/tool';

export function TimelinePanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const playTick = usePlayheadTick(controller);
  const [tool, setTool] = useState<ToolState>(NO_TOOL);
  const [rejection, setRejection] = useState<string | null>(null);
  const [localBeat, setLocalBeat] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const windowBlocks = useRef<TimelineBlock[]>([]);
  const refocus = useRef<number | null>(null);

  // 놓거나 비운 뒤, 또는 옆 박으로 넘어간 뒤에는 그 자리를 덮는 조각에 초점을 돌려 놓는다(조각의 key가 바뀌어도 키보드 흐름이 끊기지 않게)
  useLayoutEffect(() => {
    const tick = refocus.current;
    if (tick === null) return;
    refocus.current = null;
    const i = windowBlocks.current.findIndex((b) => b.startTick <= tick && tick < b.endTick);
    buttons.current[i]?.focus();
  });

  // 처음 열면 1박을 고른 박으로 삼는다(고른 박 반복이 바로 쓰이도록). 원래 곡을 고칠 수 없는 도움 연습 중에는 선택을 보관하지 않으므로 건드리지 않는다
  const variantId = controller.current?.variant.variantId;
  useEffect(() => {
    if (variantId && !controller.readOnly && !controller.selectedCell()) controller.selectCell(controller.cells()[0] ?? null);
  }, [controller, variantId]);

  const cur = controller.current;
  if (!cur) return null;

  const def = cur.def;
  const spec = timelineOf(def);
  const voice = spec.voices[0]!;
  const measureIndex = 0;
  const content = controller.content();
  const targetContent: DraftContent = { slots: [], events: [...def.score.events], tuplets: [...(def.score.tuplets ?? [])] };
  const feedback = controller.feedback;
  const aids = controller.aids;

  // 확대할 박: 컨트롤러가 고른 박 칸(도움 연습 중에는 보관하지 않으므로 이 화면의 값)
  const beatCells = controller.cells();
  const selected = controller.selectedCell();
  const windows = beatWindows(spec);
  const beatIndex = Math.min(windows.length - 1, selected && selected.measureIndex === measureIndex ? selected.cellIndex : localBeat);
  const win = windows[beatIndex]!;

  const targetFull = blocksOf(spec, targetContent, voice.voiceId, measureIndex, 0, spec.measureTicks);
  const mineFull = blocksOf(spec, content, voice.voiceId, measureIndex, 0, spec.measureTicks);
  const targetWin = blocksOf(spec, targetContent, voice.voiceId, measureIndex, win.from, win.to);
  const mineWin = blocksOf(spec, content, voice.voiceId, measureIndex, win.from, win.to);
  windowBlocks.current = mineWin;

  // 판정이 알려 준 자리. 확인하기 전이나 고친 뒤에는 feedback이 null이라 표시도 없다
  const issues = feedback && !feedback.passed ? feedback.issues : [];
  const marks = marksOf(issues, mineFull, { measureIndex, voiceId: voice.voiceId });
  const markedWindows = windowsWithMarks(spec, mineFull, marks);
  const myScore = draftScoreOf(def.score, content);
  const messages = feedback && !feedback.passed ? feedback.messages : [];

  const playingWhich = controller.playing;
  const playHere = playTick !== null && playTick < spec.measureTicks * spec.measures ? playTick - measureIndex * spec.measureTicks : null;
  const targetPlay = playingWhich === 'target' ? playHere : null;
  const minePlay = playingWhich === 'mine' ? playHere : null;

  const resolved = resolveTool(tool, spec);
  const changeTool = (next: ToolState): void => {
    setTool(next);
    setRejection(null);
  };

  const openBeat = (index: number): void => {
    const cell = beatCells.find((c) => c.measureIndex === measureIndex && c.cellIndex === index) ?? null;
    setLocalBeat(index);
    controller.selectCell(cell);
    controller.announce(`${windows[index]!.label}을 확대했어요.`);
  };

  const onPress = (block: TimelineBlock): void => {
    const outcome = pressBlock(controller, spec, { voiceId: voice.voiceId, measureIndex, from: win.from }, resolved, block);
    setRejection(outcome.kind === 'rejected' || outcome.kind === 'empty' ? outcome.text : null);
    if (outcome.kind === 'placed' || outcome.kind === 'cleared') refocus.current = outcome.tick;
  };

  const onBlockKey = (e: KeyboardEvent, block: TimelineBlock, index: number): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = buttons.current[index + dir];
      if (next) next.focus();
      else if (beatIndex + dir >= 0 && beatIndex + dir < windows.length) {
        // 창의 끝에서 한 번 더 누르면 옆 박으로 넘어간다
        const to = windows[beatIndex + dir]!;
        refocus.current = dir > 0 ? to.from : to.to - 1;
        openBeat(beatIndex + dir);
      }
      e.preventDefault();
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const dir = e.key === 'PageDown' ? 1 : -1;
      if (beatIndex + dir >= 0 && beatIndex + dir < windows.length) {
        refocus.current = windows[beatIndex + dir]!.from;
        openBeat(beatIndex + dir);
      }
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const outcome = clearBlock(controller, spec, { voiceId: voice.voiceId, measureIndex, from: win.from }, block);
      if (outcome) {
        setRejection(null);
        refocus.current = outcome.tick;
      }
      e.preventDefault();
    }
  };

  const onPanelKey = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) controller.undo();
    else if (key === 'y' || (key === 'z' && e.shiftKey)) controller.redo();
    else return;
    e.preventDefault();
  };

  const tuplet = spec.tuplets[0];
  const eachStone = tuplet ? tupletNoteTicks(tuplet.writtenBaseDuration, tuplet.actualNotes, tuplet.normalNotes) : null;

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body" onKeyDown={onPanelKey}>
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">박을 하나씩 확대해서, 목표 악보와 같게 짧은 음과 셋잇단 묶음, 쉼을 놓아 보세요.</p>
              </div>
              <div class="chips">
                <span class="chip">{def.score.meter}박자</span>
                <span class="chip">한 박 = {beatName(def.score.meter)}</span>
                <span class="chip">가장 짧은 음 = {VALUE_NAME_KO[def.challengeDescriptor.smallestValue]}</span>
              </div>
            </header>

            <section class="card timeline timeline-zoomable" aria-labelledby="timeline-title">
              <div class="card-head">
                <h2 id="timeline-title">한 마디 시간선</h2>
                <span class="muted small">목표·배치의 시간 위치가 같아요</span>
              </div>

              <div class="timeline-row">
                <h3 class="row-label">확대할 박</h3>
                <div class="beat-picker" role="group" aria-label="확대할 박" style={`--beats:${windows.length}`}>
                  {windows.map((w) => {
                    const on = w.beat === beatIndex;
                    const bad = markedWindows.has(w.beat);
                    return (
                      <button
                        type="button"
                        key={w.beat}
                        class={`beat-button${on ? ' is-selected' : ''}${bad ? ' has-error' : ''}`}
                        data-beat={w.beat}
                        aria-pressed={on}
                        aria-label={`${w.label} 확대${bad ? ', 고칠 곳이 있어요' : ''}`}
                        onClick={() => openBeat(w.beat)}
                      >
                        {aids.showCount ? <span class="cell-count" aria-hidden="true">{w.beat + 1}</span> : null}
                        <span class="beat-name" aria-hidden="true">{w.label}</span>
                        {bad ? <span class="beat-mark" aria-hidden="true"><Icon name="alert" /></span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div class="timeline-row">
                <h3 class="row-label" aria-hidden="true">목표</h3>
                <BlockRow spec={spec} blocks={targetFull} from={0} to={spec.measureTicks} label="목표 전체 시간선" size="overview" who="target" playTick={targetPlay} />
              </div>
              <div class="timeline-row">
                <h3 class="row-label" aria-hidden="true">내 배치</h3>
                <BlockRow
                  spec={spec}
                  blocks={mineFull}
                  from={0}
                  to={spec.measureTicks}
                  label="내 배치 전체 시간선"
                  size="overview"
                  who="mine"
                  errorKeys={marks.errorKeys}
                  remainKeys={marks.remainKeys}
                  playTick={minePlay}
                />
              </div>

              <div class="zoom-box" data-beat={win.beat}>
                <div class="zoom-head">
                  <h3 id="zoom-title">{win.label} 확대</h3>
                  <span class="muted small">
                    칸 하나 = {VALUE_NAME_KO[def.challengeDescriptor.smallestValue]}({spec.cellTicks}틱)
                    {eachStone ? ` · 셋잇단 돌 하나 = ${eachStone}틱` : ''}
                  </span>
                </div>
                <div class="zoom-scroll">
                  <div class="timeline-row" aria-hidden="true">
                    <span />
                    <div class="zoom-ruler" style={`--units:${Math.round((win.to - win.from) / spec.unitTicks)}`}>
                      {Array.from({ length: Math.round((win.to - win.from) / spec.cellTicks) }, (_, i) => (
                        <span key={i} style={`grid-column:${Math.round((i * spec.cellTicks) / spec.unitTicks) + 1} / span ${Math.round(spec.cellTicks / spec.unitTicks)}`}>
                          {i + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div class="timeline-row">
                    <h4 class="row-label">목표</h4>
                    <BlockRow spec={spec} blocks={targetWin} from={win.from} to={win.to} label={`목표 ${win.label} 확대`} size="zoom" who="target" playTick={targetPlay} />
                  </div>
                  <div class="timeline-row">
                    <h4 class="row-label">내 배치</h4>
                    <BlockRow
                      spec={spec}
                      blocks={mineWin}
                      from={win.from}
                      to={win.to}
                      label={`내 배치 ${win.label} 확대`}
                      size="zoom"
                      who="mine"
                      onPress={onPress}
                      onBlockKey={onBlockKey}
                      register={(i, el) => {
                        buttons.current[i] = el;
                      }}
                      errorKeys={marks.errorKeys}
                      remainKeys={marks.remainKeys}
                      playTick={minePlay}
                    />
                  </div>
                </div>
                <p class="zoom-keys muted small">키보드: ← → 로 칸 이동(끝에서는 옆 박으로), Enter로 놓기, Delete로 비우기, PageUp·PageDown으로 박 바꾸기</p>
              </div>

              <div
                class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`}
                data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}
              >
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> 목표와 같아요.
                  </p>
                ) : null}
                {messages.slice(0, 3).map((m) => (
                  <p key={m} class="feedback-line">
                    <Icon name="alert" /> {feedback?.technical ? m : <strong>{m}</strong>}
                  </p>
                ))}
                {messages.length > 3 ? <p class="feedback-more">그 밖에 {messages.length - 3}가지가 더 있어요.</p> : null}
                {!feedback ? <p class="feedback-idle muted">다 놓았으면 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.</p> : null}
              </div>
            </section>

            <MaterialTray controller={controller} spec={spec} tool={tool} onTool={changeTool} rejection={rejection} />

            <section class="card score-view" aria-labelledby="score-title">
              <div class="card-head">
                <h2 id="score-title">악보로 보기</h2>
                <span class="muted small">같은 내용을 오선에 그린 것이에요</span>
              </div>
              <div class="score-pair">
                <figure class="score-figure">
                  <figcaption>목표 악보</figcaption>
                  <StaffView score={def.score} title="목표 악보" description={describeScore(def.score)} />
                </figure>
                <figure class="score-figure">
                  <figcaption>내 악보</figcaption>
                  <StaffView score={myScore} title="내 악보" description={describeScore(myScore)} options={{ highlight: errorEventIdsOf(mineFull, marks) }} />
                </figure>
              </div>
            </section>
          </div>

          <div class="panel-side">
            <ListeningAids controller={controller} onCheck={() => controller.check()} />
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
