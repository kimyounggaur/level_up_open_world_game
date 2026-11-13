// 5-4 Q08 곡 패널(합주 악보): 곡 하나를 마디 하나씩 열어서, 성부마다 목표 악보와 같게 음과 쉼을 놓는다. 설계서 4.9.
// 위에는 마디 고르기(마디마다 성부별로 얼마나 채웠는지), 가운데에는 고른 마디의 성부별 목표·내 배치 줄, 아래에는 재료와 악보가 있다.
// 무대 바닥(T7)의 칸을 고르면 그 마디가 이 패널에서 열린다. 음을 놓는 일은 이 패널에서만 한다(바닥은 읽고 듣는 곳이다).
// 끌지 않아도 모두 할 수 있다: 재료를 고르고 칸을 누르면 놓인다(7.9 2번).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { draftScoreOf } from '../../../domain/challenge';
import { flaggedStageSlots, stageCellOfSlot } from '../../../domain/ensemble';
import type { StageLayout } from '../../../domain/ensemble';
import type { DraftContent } from '../../../domain/session';
import { VALUE_NAME_KO } from '../../../domain/time';
import { blocksOf, filledTicks, timelineOf } from '../../../domain/timeline';
import type { TimelineBlock, TimelineSpec, TimelineVoice } from '../../../domain/timeline';
import { ListeningAids } from '../../assist/ListeningAids';
import type { ChallengeController } from '../../challenge/controller';
import type { FreeMelody } from '../../challenge/melody';
import { tempoText } from '../../common/format';
import { useController, usePlayheadTick } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { describeScore } from '../../notation/describe';
import { StaffView } from '../../notation/StaffView';
import { BlockRow } from '../../timeline/BlockRow';
import { MaterialTray } from '../../timeline/MaterialTray';
import { errorEventIdsOf, marksOf } from '../../timeline/marks';
import type { BlockMarks } from '../../timeline/marks';
import { clearBlock, pressBlock } from '../../timeline/press';
import { NO_TOOL, resolveTool } from '../../timeline/tool';
import type { ToolState } from '../../timeline/tool';
import { PanelFrame } from '../PanelFrame';
import { MelodySave, PieceTray } from './MelodyAside';
import { PracticeLinks, SongAids } from './SongAids';

/** 한 성부의 한 마디가 얼마나 채워졌는가: 칸 수와 상태. 마디 고르기 단추와 성부 줄 이름이 같은 말을 쓴다 */
export interface VoiceFill {
  voiceId: string;
  label: string;
  state: 'empty' | 'partial' | 'full';
  filledCells: number;
  totalCells: number;
}

export function voiceFillOf(spec: TimelineSpec, content: DraftContent, voice: TimelineVoice, measureIndex: number): VoiceFill {
  const ticks = filledTicks(content, voice.voiceId, measureIndex);
  const totalCells = Math.round(spec.measureTicks / spec.cellTicks);
  const filledCells = Math.min(totalCells, Math.floor(ticks / spec.cellTicks));
  const state = ticks <= 0 ? 'empty' : ticks >= spec.measureTicks ? 'full' : 'partial';
  return { voiceId: voice.voiceId, label: voice.label, state, filledCells, totalCells };
}

const fillText = (f: VoiceFill): string => (f.state === 'empty' ? '비어 있어요' : f.state === 'full' ? '가득 채워졌어요' : `${f.totalCells}칸 중 ${f.filledCells}칸이 채워졌어요`);

/** 곡의 성부 줄과 마디 수로 만든 무대 틀. 판정이 가리킨 칸을 찾는 계산(flaggedStageSlots)을 무대 바닥과 같이 쓰려는 것이다 */
const layoutOf = (spec: TimelineSpec): StageLayout => ({ rows: spec.voices.map((v) => ({ voiceId: v.voiceId, label: v.label })), measures: spec.measures });

/** 자유 가락(4.9)을 열었을 때 맨 위 안내. 목표도 판정도 없다 */
export const FREE_SUBTITLE = '4마디 가락을 마음대로 만들어 보세요. 목표도 판정도 없어요. 마디를 하나씩 열어서 음과 쉼을 놓으면 돼요.';
export const FREE_IDLE_TEXT = '다 만들었으면 이름을 붙여 저장해 보세요. 저장하면 내 곡이 돼요. 판정하지 않아요.';

export function SongPanel({ controller, melody }: { controller: ChallengeController; melody?: FreeMelody }) {
  useController(controller);
  const playTick = usePlayheadTick(controller);
  const [tool, setTool] = useState<ToolState>(NO_TOOL);
  const [rejection, setRejection] = useState<string | null>(null);
  const [localMeasure, setLocalMeasure] = useState(0);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const rowBlocks = useRef(new Map<string, TimelineBlock[]>());
  const refocus = useRef<{ voiceId: string; tick: number } | null>(null);

  // 놓거나 비운 뒤, 또는 옆 마디로 넘어간 뒤에는 그 자리를 덮는 조각에 초점을 돌려 놓는다(조각의 key가 바뀌어도 키보드 흐름이 끊기지 않게)
  useLayoutEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const i = (rowBlocks.current.get(want.voiceId) ?? []).findIndex((b) => b.startTick <= want.tick && want.tick < b.endTick);
    buttons.current.get(`${want.voiceId}:${i}`)?.focus();
  });

  // 처음 열면 1마디를 고른 마디로 삼는다(고른 마디 반복과 '고른 마디만 듣기'가 바로 쓰이도록). 원래 곡을 고칠 수 없는 동안에는 선택을 보관하지 않으므로 건드리지 않는다
  const variantId = controller.current?.variant.variantId;
  useEffect(() => {
    if (variantId && !controller.readOnly && !controller.selectedCell()) controller.selectCell(controller.cells()[0] ?? null);
  }, [controller, variantId]);

  const cur = controller.current;
  // 기본 연습으로 다른 과제가 열린 순간에는 이 화면을 그리지 않는다(앱은 주소에 맞는 패널을 다시 고른다)
  if (!cur || !controller.isArrangement) return null;

  const def = cur.def;
  // 자유 가락: 목표 악보와 판정이 없다. 같은 시간선과 재료로 내 가락만 놓는다(4.9)
  const free = cur.free === true;
  const spec = timelineOf(def);
  const content = controller.content();
  const targetContent: DraftContent = { slots: [], events: [...def.score.events], tuplets: [...(def.score.tuplets ?? [])] };
  const feedback = controller.feedback;
  const measureCells = controller.cells();
  const selected = controller.selectedCell();
  const measureIndex = Math.min(spec.measures - 1, selected ? selected.measureIndex : localMeasure);
  const measureLabel = `${measureIndex + 1}마디`;

  // 판정이 알려 준 자리. 확인하기 전이나 고친 뒤에는 feedback이 null이라 표시도 없다
  const issues = feedback && !feedback.passed ? feedback.issues : [];
  const layout = layoutOf(spec);
  const flagged = new Set(
    flaggedStageSlots(layout, issues)
      .map((slot) => stageCellOfSlot(layout, slot))
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => `${c.voiceId}:${c.measureIndex}`),
  );
  const marksByVoice = new Map<string, { mine: TimelineBlock[]; marks: BlockMarks }>();
  for (const v of spec.voices) {
    const mine = blocksOf(spec, content, v.voiceId, measureIndex, 0, spec.measureTicks);
    marksByVoice.set(v.voiceId, { mine, marks: marksOf(issues, mine, { measureIndex, voiceId: v.voiceId }) });
  }
  const highlight: Record<string, 'error'> = {};
  for (let m = 0; m < spec.measures; m++) {
    for (const v of spec.voices) {
      const mine = blocksOf(spec, content, v.voiceId, m, 0, spec.measureTicks);
      Object.assign(highlight, errorEventIdsOf(mine, marksOf(issues, mine, { measureIndex: m, voiceId: v.voiceId })));
    }
  }
  const myScore = draftScoreOf(def.score, content);
  const messages = feedback && !feedback.passed ? feedback.messages : [];

  const playingWhich = controller.playing;
  const songTicks = spec.measureTicks * spec.measures;
  const playMeasure = playTick !== null && playTick >= 0 && playTick < songTicks ? Math.floor(playTick / spec.measureTicks) : null;
  const playHere = playMeasure === measureIndex && playTick !== null ? playTick - measureIndex * spec.measureTicks : null;
  const targetPlay = playingWhich === 'target' ? playHere : null;
  const minePlay = playingWhich === 'mine' ? playHere : null;

  const resolved = resolveTool(tool, spec);
  const changeTool = (next: ToolState): void => {
    setTool(next);
    setRejection(null);
  };

  const openMeasure = (index: number): void => {
    const cell = measureCells.find((c) => c.measureIndex === index) ?? null;
    setLocalMeasure(index);
    controller.selectCell(cell);
    controller.announce(`${index + 1}마디를 열었어요.`);
  };

  const onPress = (voice: TimelineVoice, block: TimelineBlock): void => {
    const outcome = pressBlock(controller, spec, { voiceId: voice.voiceId, measureIndex, from: 0 }, resolved, block);
    setRejection(outcome.kind === 'rejected' || outcome.kind === 'empty' ? outcome.text : null);
    if (outcome.kind === 'placed' || outcome.kind === 'cleared') refocus.current = { voiceId: voice.voiceId, tick: outcome.tick };
  };

  const onBlockKey = (e: KeyboardEvent, voice: TimelineVoice, block: TimelineBlock, index: number): void => {
    const vi = spec.voices.findIndex((v) => v.voiceId === voice.voiceId);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = buttons.current.get(`${voice.voiceId}:${index + dir}`);
      if (next) next.focus();
      else if (measureIndex + dir >= 0 && measureIndex + dir < spec.measures) {
        // 줄의 끝에서 한 번 더 누르면 옆 마디로 넘어간다
        refocus.current = { voiceId: voice.voiceId, tick: dir > 0 ? 0 : spec.measureTicks - 1 };
        openMeasure(measureIndex + dir);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // 같은 시간 자리의 아래·위 성부 조각으로 옮긴다
      const other = spec.voices[vi + (e.key === 'ArrowDown' ? 1 : -1)];
      if (other) {
        const j = (rowBlocks.current.get(other.voiceId) ?? []).findIndex((b) => b.startTick <= block.startTick && block.startTick < b.endTick);
        buttons.current.get(`${other.voiceId}:${j}`)?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const dir = e.key === 'PageDown' ? 1 : -1;
      if (measureIndex + dir >= 0 && measureIndex + dir < spec.measures) {
        refocus.current = { voiceId: voice.voiceId, tick: block.startTick };
        openMeasure(measureIndex + dir);
      }
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const outcome = clearBlock(controller, spec, { voiceId: voice.voiceId, measureIndex, from: 0 }, block);
      if (outcome) {
        setRejection(null);
        refocus.current = { voiceId: voice.voiceId, tick: outcome.tick };
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

  const cellCount = Math.round(spec.measureTicks / spec.cellTicks);
  const units = Math.round(spec.measureTicks / spec.unitTicks);
  const voiceLabels = spec.voices.map((v) => v.label).join(', ');

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body" onKeyDown={onPanelKey}>
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">{free ? FREE_SUBTITLE : '마디를 하나씩 열어서, 성부마다 목표 악보와 같게 음과 쉼을 놓아 보세요.'}</p>
              </div>
              <div class="chips">
                <span class="chip">{def.score.meter}박자</span>
                <span class="chip">{tempoText(def.score.tempoReference, def.score.tempoBpm)}</span>
                <span class="chip">{spec.voices.length === 1 ? '한 성부' : `${spec.voices.length}성부`}</span>
                <span class="chip">가장 짧은 음 = {VALUE_NAME_KO[def.challengeDescriptor.smallestValue]}</span>
              </div>
            </header>

            <section class="card song-measures" aria-labelledby="measures-title">
              <div class="card-head">
                <h2 id="measures-title">열 마디</h2>
                <span class="muted small">마디를 누르면 아래에서 그 마디를 고칠 수 있어요</span>
              </div>
              <div class="measure-picker" role="group" aria-label="열 마디" style={`--measures:${measureCells.length}`}>
                {measureCells.map((c) => {
                  const m = c.measureIndex;
                  const on = m === measureIndex;
                  const bad = spec.voices.some((v) => flagged.has(`${v.voiceId}:${m}`));
                  const fills = spec.voices.map((v) => voiceFillOf(spec, content, v, m));
                  const sounding = playMeasure === m;
                  const name = `${c.label} 열기. ${fills.map((f) => `${f.label} ${fillText(f)}`).join('. ')}.${bad ? ' 고칠 곳이 있어요.' : ''}${sounding ? ' 지금 이 마디가 울리고 있어요.' : ''}`;
                  return (
                    <button
                      type="button"
                      key={c.cellId}
                      class={`measure-button${on ? ' is-selected' : ''}${bad ? ' has-error' : ''}${sounding ? ' is-playing' : ''}`}
                      data-measure={m}
                      aria-pressed={on}
                      aria-label={name}
                      onClick={() => openMeasure(m)}
                    >
                      <span class="measure-name" aria-hidden="true">{c.label}</span>
                      <span class="measure-fills" aria-hidden="true">
                        {fills.map((f) => (
                          <span key={f.voiceId} class={`voice-fill fill-${f.state}`} data-voice={f.voiceId}>
                            {spec.voices.length > 1 ? <span class="voice-fill-name">{f.label}</span> : null}
                            <span class="voice-fill-count">{f.state === 'full' ? '✓' : `${f.filledCells}/${f.totalCells}`}</span>
                          </span>
                        ))}
                      </span>
                      {bad ? <span class="beat-mark" aria-hidden="true"><Icon name="alert" /></span> : null}
                      {sounding ? <span class="measure-now" aria-hidden="true"><Icon name="play" /></span> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section class="card timeline timeline-song" aria-labelledby="song-title" data-measure={measureIndex}>
              <div class="card-head">
                <h2 id="song-title">{measureLabel} 시간선</h2>
                <span class="muted small">
                  칸 하나 = {VALUE_NAME_KO[def.challengeDescriptor.smallestValue]}({spec.cellTicks}틱){free ? '' : ' · 목표와 내 배치의 시간 위치가 같아요'}
                </span>
              </div>

              <div class="zoom-scroll">
                <div class="timeline-row" aria-hidden="true">
                  <span />
                  <div class="zoom-ruler" style={`--units:${units}`}>
                    {Array.from({ length: cellCount }, (_, i) => (
                      <span key={i} style={`grid-column:${Math.round((i * spec.cellTicks) / spec.unitTicks) + 1} / span ${Math.round(spec.cellTicks / spec.unitTicks)}`}>
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
                {spec.voices.map((v) => {
                  const targetBlocks = blocksOf(spec, targetContent, v.voiceId, measureIndex, 0, spec.measureTicks);
                  const found = marksByVoice.get(v.voiceId)!;
                  rowBlocks.current.set(v.voiceId, found.mine);
                  const fill = voiceFillOf(spec, content, v, measureIndex);
                  const bad = flagged.has(`${v.voiceId}:${measureIndex}`);
                  return (
                    <div class="song-voice" role="group" aria-label={`${v.label}, ${measureLabel}`} data-voice={v.voiceId} key={v.voiceId}>
                      <div class="song-voice-head">
                        <h3 class="song-voice-name">{v.label}</h3>
                        <span class={`muted small song-voice-fill fill-${fill.state}`}>{fillText(fill)}</span>
                        {bad ? (
                          <span class="song-voice-flag">
                            <Icon name="alert" /> 고칠 곳이 있어요
                          </span>
                        ) : null}
                      </div>
                      {free ? null : (
                        <div class="timeline-row">
                          <h4 class="row-label">목표</h4>
                          <BlockRow spec={spec} blocks={targetBlocks} from={0} to={spec.measureTicks} label={`${v.label} 목표 ${measureLabel}`} size="zoom" who="target" playTick={targetPlay} />
                        </div>
                      )}
                      <div class="timeline-row">
                        <h4 class="row-label">{free ? '내 가락' : '내 배치'}</h4>
                        <BlockRow
                          spec={spec}
                          blocks={found.mine}
                          from={0}
                          to={spec.measureTicks}
                          label={`${v.label} ${free ? '내 가락' : '내 배치'} ${measureLabel}`}
                          size="zoom"
                          who="mine"
                          onPress={(b) => onPress(v, b)}
                          onBlockKey={(e, b, i) => onBlockKey(e, v, b, i)}
                          register={(i, el) => {
                            if (el) buttons.current.set(`${v.voiceId}:${i}`, el);
                            else buttons.current.delete(`${v.voiceId}:${i}`);
                          }}
                          errorKeys={found.marks.errorKeys}
                          remainKeys={found.marks.remainKeys}
                          playTick={minePlay}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p class="zoom-keys muted small">
                키보드: ← → 로 칸 이동(끝에서는 옆 마디로), ↑ ↓ 로 성부 바꾸기{spec.voices.length > 1 ? `(${voiceLabels})` : ''}, Enter로 놓기, Delete로 비우기, PageUp·PageDown으로 마디 바꾸기
              </p>

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
                {!feedback ? <p class="feedback-idle muted">{free ? FREE_IDLE_TEXT : "다 놓았으면 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요."}</p> : null}
              </div>
            </section>

            <MaterialTray controller={controller} spec={spec} tool={tool} onTool={changeTool} rejection={rejection} />

            <section class="card score-view" aria-labelledby="score-title">
              <div class="card-head">
                <h2 id="score-title">악보로 보기</h2>
                <span class="muted small">곡 전체를 오선에 그린 것이에요{spec.voices.length > 1 ? ' (성부마다 한 줄)' : ''}</span>
              </div>
              <div class={`score-pair score-pair-song${free ? ' score-pair-single' : ''}`}>
                {free ? null : (
                  <figure class="score-figure">
                    <figcaption>목표 악보</figcaption>
                    <StaffView score={def.score} title="목표 악보" description={describeScore(def.score)} />
                  </figure>
                )}
                <figure class="score-figure">
                  <figcaption>{free ? '내 가락 악보' : '내 악보'}</figcaption>
                  <StaffView score={myScore} title={free ? '내 가락 악보' : '내 악보'} description={describeScore(myScore)} options={{ highlight }} />
                </figure>
              </div>
            </section>
          </div>

          <div class="panel-side panel-side-tall">
            {free && melody ? <MelodySave melody={melody} /> : null}
            <ListeningAids controller={controller} onCheck={() => controller.check()} countAid={false}>
              <SongAids controller={controller} />
            </ListeningAids>
            {free && melody ? <PieceTray melody={melody} measureIndex={measureIndex} /> : null}
            <PracticeLinks controller={controller} />
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
