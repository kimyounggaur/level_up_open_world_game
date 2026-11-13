// 2-5 리듬 패널(Q02). 시안 B02의 구성: 한 마디 시간선(목표 줄, 내 배치 줄, 피드백), 배치할 재료, 필요한 도움만.
// 재료를 고른 뒤 박 칸을 누르면 놓인다. 끌지 않아도 모두 할 수 있다(7.9 2번).
// 'panel.rhythm'은 리듬 과제 전체의 패널이다: 박 하나가 한 칸인 과제(Q02)는 이 파일의 박 칸 화면이,
// 박 안을 쪼개는 과제(Q03: 32분음표와 셋잇단)는 TimelinePanel의 확대 시간선이 맡는다.
import { useRef, useState } from 'preact/hooks';
import { clearCellEdit, draftScoreOf, eventAtCell, materialsOf, placeInCellEdit } from '../../../domain/challenge';
import type { GridCell, Material } from '../../../domain/challenge';
import { midiOf } from '../../../domain/pitch';
import type { ScoreEvent } from '../../../domain/score';
import { eventLabel } from '../../../domain/challenge';
import { VALUE_NAME_KO } from '../../../domain/time';
import { isTimelineVariant } from '../../../domain/timeline';
import { ListeningAids } from '../../assist/ListeningAids';
import type { ChallengeController } from '../../challenge/controller';
import { beatName, eventName, materialName, restValueName } from '../../common/format';
import { Glyph } from '../../common/Glyphs';
import type { GlyphKind } from '../../common/Glyphs';
import { useController, usePlayheadCell } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { describeScore } from '../../notation/describe';
import { StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';
import { TimelinePanel } from './TimelinePanel';

type Tool = { kind: 'material'; material: Material } | { kind: 'erase' } | null;

const glyphOf = (e: ScoreEvent | undefined): GlyphKind => (!e ? 'empty' : e.type === 'rest' ? 'quarter-rest' : 'quarter-note');

function sameMaterial(a: Material, b: Material): boolean {
  if (a.kind !== b.kind || a.value !== b.value) return false;
  return a.kind === 'note' && b.kind === 'note' ? a.pitch.letter === b.pitch.letter && a.pitch.octave === b.pitch.octave && a.pitch.alter === b.pitch.alter : true;
}

/** 리듬 패널: 열린 판본이 시간선 과제면 확대 시간선을, 아니면 박 칸 화면을 보인다 */
export function RhythmPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const def = controller.current?.def;
  return def && isTimelineVariant(def) ? <TimelinePanel controller={controller} /> : <BeatGridPanel controller={controller} />;
}

function BeatGridPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const playheadId = usePlayheadCell(controller);
  const [tool, setTool] = useState<Tool>(null);
  const cellButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const cur = controller.current;
  if (!cur) return null;

  const def = cur.def;
  const cells = controller.cells();
  const content = controller.content();
  const selected = controller.selectedCell();
  const feedback = controller.feedback;
  const aids = controller.aids;
  const materials = materialsOf(def);
  const targetAt = (cell: GridCell): ScoreEvent | undefined => def.score.events.find((e) => e.measureIndex === cell.measureIndex && e.onsetTicks === cell.onsetTicks);

  // 판정이 알려 준 칸(시작 틱이 있는 문제)에 표식을 붙인다
  const errorCells = new Set<string>();
  for (const issue of feedback?.issues ?? []) {
    const at = issue.target;
    if (at?.onsetTicks === undefined) continue;
    const cell = cells.find((c) => c.measureIndex === (at.measureIndex ?? 0) && c.onsetTicks === at.onsetTicks);
    if (cell) errorCells.add(cell.cellId);
  }
  const errorEventIds: Record<string, 'error'> = {};
  for (const cell of cells) {
    const ev = eventAtCell(content, cell);
    if (ev && errorCells.has(cell.cellId)) errorEventIds[ev.eventId] = 'error';
  }

  const pressCell = (cell: GridCell): void => {
    if (tool?.kind === 'material') {
      controller.edit(placeInCellEdit(def, content, cell, tool.material), `${cell.label}에 ${materialName(tool.material)}를 놓았어요.`);
      if (tool.material.kind === 'note') controller.previewPitch(midiOf(tool.material.pitch));
      controller.selectCell(cell);
    } else if (tool?.kind === 'erase') {
      const edit = clearCellEdit(content, cell);
      if (edit) controller.edit(edit, `${cell.label}을 비웠어요.`);
      else controller.announce(`${cell.label}은 이미 비어 있어요.`);
      controller.selectCell(cell);
    } else {
      controller.selectCell(cell);
      controller.announce(`${cell.label}을 골랐어요.`);
    }
  };

  const onCellKey = (e: KeyboardEvent, index: number): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = cellButtons.current[index + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        next.focus();
        e.preventDefault();
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const cell = cells[index]!;
      const edit = clearCellEdit(content, cell);
      if (edit) controller.edit(edit, `${cell.label}을 비웠어요.`);
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

  const myScore = draftScoreOf(def.score, content);
  const messages = feedback && !feedback.passed ? feedback.messages : [];

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body" onKeyDown={onPanelKey}>
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">목표 악보와 같게 박 칸에 음과 쉼을 놓아 보세요.</p>
              </div>
              <div class="chips">
                <span class="chip">{def.score.meter}박자</span>
                <span class="chip">한 박 = {beatName(def.score.meter)}</span>
              </div>
            </header>

            <section class="card timeline" aria-labelledby="timeline-title">
              <div class="card-head">
                <h2 id="timeline-title">한 마디 시간선</h2>
                <span class="muted small">목표·배치의 시간 위치가 같아요</span>
              </div>

              <div class="timeline-row">
                <h3 class="row-label">목표</h3>
                <ol class="cells" aria-label="목표 시간선" style={`--cells:${cells.length}`}>
                  {cells.map((cell) => {
                    const ev = targetAt(cell);
                    return (
                      <li key={cell.cellId} class={`cell cell-target${playheadId === cell.cellId && controller.playing === 'target' ? ' is-playing' : ''}`} data-cell={cell.cellId}>
                        <span class="cell-label">{cell.label}</span>
                        {aids.showCount ? <span class="cell-count" aria-hidden="true">{cell.cellIndex + 1}</span> : null}
                        <span class="cell-face">
                          <Glyph kind={glyphOf(ev)} />
                          <span class="cell-name">{ev ? eventLabel(ev) : ''}</span>
                        </span>
                        <span class="sr-only">{ev ? `목표: ${eventName(ev)}` : '목표: 비어 있음'}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div class="timeline-row">
                <h3 class="row-label">내 배치</h3>
                <ol class="cells" aria-label="내 배치 시간선" style={`--cells:${cells.length}`}>
                  {cells.map((cell, i) => {
                    const ev = eventAtCell(content, cell);
                    const isError = errorCells.has(cell.cellId);
                    const isSelected = selected?.cellId === cell.cellId;
                    const isPlaying = playheadId === cell.cellId && controller.playing === 'mine';
                    const name = ev ? eventName(ev) : '비어 있음';
                    return (
                      <li key={cell.cellId} class="cell-item">
                        <button
                          type="button"
                          class={`cell cell-mine${isError ? ' has-error' : ''}${isSelected ? ' is-selected' : ''}${isPlaying ? ' is-playing' : ''}`}
                          data-cell={cell.cellId}
                          ref={(el) => {
                            cellButtons.current[i] = el;
                          }}
                          aria-label={`${cell.label}, ${name}${isError ? ', 고칠 곳이 있어요' : ''}${isSelected ? ', 고른 칸' : ''}`}
                          aria-current={isSelected ? 'true' : undefined}
                          onClick={() => pressCell(cell)}
                          onKeyDown={(e) => onCellKey(e, i)}
                        >
                          <span class="cell-label" aria-hidden="true">{cell.label}</span>
                          {aids.showCount ? <span class="cell-count" aria-hidden="true">{cell.cellIndex + 1}</span> : null}
                          <span class="cell-face" aria-hidden="true">
                            <Glyph kind={glyphOf(ev)} />
                            <span class="cell-name">{ev ? eventLabel(ev) : '비어 있음'}</span>
                          </span>
                          {isError ? <span class="cell-mark" aria-hidden="true"><Icon name="alert" /></span> : null}
                          {isPlaying ? <span class="cell-now" aria-hidden="true"><Icon name="play" /> 지금</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
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

            <section class="card tray" aria-labelledby="tray-title">
              <div class="tray-head">
                <h2 id="tray-title">배치할 재료</h2>
                <p class="muted small">재료를 고른 뒤 원하는 박을 선택하세요.</p>
              </div>
              <div class="tray-items" role="group" aria-label="재료">
                {materials.values.flatMap((value) =>
                  materials.pitches.map((pitch) => {
                    const material: Material = { kind: 'note', pitch, value };
                    const on = tool?.kind === 'material' && sameMaterial(tool.material, material);
                    return (
                      <button type="button" key={`${pitch.letter}${pitch.octave}-${value}`} class={`material${on ? ' is-selected' : ''}`} aria-pressed={on} onClick={() => { setTool(on ? null : { kind: 'material', material }); controller.previewPitch(midiOf(pitch)); }}>
                        <Glyph kind="quarter-note" />
                        <span class="material-name">{eventLabel({ eventId: '', type: 'note', voiceId: '', staffId: '', measureIndex: 0, onsetTicks: 0, durationTicks: 0, writtenPitch: { letter: pitch.letter, accidental: null, octave: pitch.octave } })}</span>
                        <span class="material-sub">{VALUE_NAME_KO[value]}</span>
                      </button>
                    );
                  }),
                )}
                {materials.rests
                  ? materials.values.map((value) => {
                      const material: Material = { kind: 'rest', value };
                      const on = tool?.kind === 'material' && sameMaterial(tool.material, material);
                      return (
                        <button type="button" key={`rest-${value}`} class={`material${on ? ' is-selected' : ''}`} aria-pressed={on} onClick={() => setTool(on ? null : { kind: 'material', material })}>
                          <Glyph kind="quarter-rest" />
                          <span class="material-name">쉼</span>
                          <span class="material-sub">{restValueName(value)}</span>
                        </button>
                      );
                    })
                  : null}
                <button type="button" class={`material material-erase${tool?.kind === 'erase' ? ' is-selected' : ''}`} aria-pressed={tool?.kind === 'erase'} onClick={() => setTool(tool?.kind === 'erase' ? null : { kind: 'erase' })}>
                  <Icon name="eraser" />
                  <span class="material-name">비우기</span>
                  <span class="material-sub">칸을 비워요</span>
                </button>
              </div>
              <p class="tray-mode" role="status" data-tool={tool ? tool.kind : 'none'}>
                {tool?.kind === 'material'
                  ? `고른 재료: ${materialName(tool.material)}. 박 칸을 누르면 놓여요.`
                  : tool?.kind === 'erase'
                    ? '비우기를 골랐어요. 박 칸을 누르면 그 칸을 비워요.'
                    : '고른 재료가 없어요. 박 칸을 누르면 그 칸만 골라요.'}
              </p>
              <div class="tray-tools">
                <button type="button" class="btn btn-quiet" onClick={() => controller.undo()} disabled={!controller.canUndo}>
                  <Icon name="undo" /> 실행 취소
                </button>
                <button type="button" class="btn btn-quiet" onClick={() => controller.redo()} disabled={!controller.canRedo}>
                  <Icon name="redo" /> 다시 실행
                </button>
                <button type="button" class="btn btn-quiet" onClick={() => controller.clearAll()} disabled={content.events.length === 0}>
                  <Icon name="trash" /> 모두 지우기
                </button>
                <span class="muted small">드래그 없이도 가능</span>
              </div>
            </section>

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
                  <StaffView score={myScore} title="내 악보" description={describeScore(myScore)} options={{ highlight: errorEventIds }} />
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
