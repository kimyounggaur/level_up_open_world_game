// 6-7 화음 사건 목록(확장 X-3) 패널: Q21 다장조의 세 기둥, Q23 화음 이어 걷기. 종나무 여러 그루에 화음을 하나씩 건다.
// 월드의 빈터(W4)와 같은 초안을 보는 다른 모양이다: 나무마다 종 카드 넷(칸 번호는 나무 × 넷 + 열)이고, 종탑·나무와 같은 음 고르기(PitchPicker)를 쓴다.
// 목표 악보는 정답이라서 보여 주지 않는다. '배치 확인'을 눌러야 맞고 틀림이 나온다. 화음의 길(사건의 차례)은 문제의 일부라서 처음부터 보인다.
// 판정에 쓰이는 것은 종의 음이름·변화표·옥타브뿐이다. 나무의 가로 자리와 걸은 시간은 판정에 들어가지 않는다(W-3).
import { useState } from 'preact/hooks';
import { midiOf } from '../../../domain/pitch';
import { TRIAD_SLOT_COUNT, chordRouteNotesOf, hungTonesOfTree, pitchPickEdit, pitchPickRulesOf, sequenceSpecOf, toneDisplayScore, toneLabelOf, toneNotesOf, treeBellsOf } from '../../../domain/slotplan';
import type { PitchChange, ToneMode, TriadBell } from '../../../domain/slotplan';
import { ToneAids } from '../../assist/ToneAids';
import { HEAR_MODES, NO_BELL_NOTICE, bellLabelOf, bellPassedText, treeNameOf } from '../../challenge/bellText';
import type { ChallengeController } from '../../challenge/controller';
import { useController, usePlayheadSlots } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { PitchPicker } from '../../common/PitchPicker';
import { describeScore } from '../../notation/describe';
import { COMPACT_VIEW, StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';
import { BellTree } from './BellTree';

type Status = 'idle' | 'ok' | 'error';

export function SequencePanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlots(controller);
  const [mode, setMode] = useState<ToneMode | null>(null);
  const cur = controller.current;
  if (!cur) return null;
  const variant = cur.def;
  if (variant.evaluatorSpec.type !== 'chordSequence') return null;
  const spec = sequenceSpecOf(variant);
  const rules = pitchPickRulesOf(variant);
  const content = controller.content();
  const trees = Array.from({ length: spec.trees }, (_, tree) => tree);
  const map = { trees: spec.trees, columns: TRIAD_SLOT_COUNT };
  const feedback = controller.feedback;
  const checked = feedback !== null && !feedback.technical;
  const messages = feedback && !feedback.passed ? feedback.messages : [];
  const hungCount = trees.reduce((n, tree) => n + hungTonesOfTree(variant, content, tree).length, 0);
  // 나무마다 어떤 화음을 거는지: 그 나무를 가리키는 첫 사건의 이름
  const eventOfTree = (tree: number): string | null => spec.events.find((e) => e.tree === tree)?.label ?? null;

  // 판정이 종마다 알려 준 문제(target.slotId가 'tone-N'). 목표가 없는 문제(빠진 음 등)는 아래 문장에만 나온다
  const issueOf = (b: TriadBell): { message: string } | null => {
    if (!feedback || feedback.technical) return null;
    const i = feedback.issues.findIndex((x) => x.target?.slotId === b.slotId);
    return i >= 0 ? { message: feedback.messages[i] ?? '' } : null;
  };
  const octaveIssue = checked && feedback!.issues.some((x) => x.code === 'WRONG_OCTAVE_SET');
  const statusOf = (b: TriadBell): Status => {
    if (!b.written || !checked) return 'idle';
    if (issueOf(b)) return 'error';
    return octaveIssue ? 'idle' : 'ok';
  };

  const change = (b: TriadBell, c: PitchChange): void => {
    const r = pitchPickEdit(variant, controller.content(), b.slot, bellLabelOf(map, b.slot), c, rules);
    if (!r.ok || !r.edit) {
      controller.announce(r.text);
      return;
    }
    controller.edit(r.edit, r.text);
    // 고른 종의 소리를 한 번 들려 준다(소리가 꺼져 있으면 아무 일도 하지 않는다)
    const now = hungTonesOfTree(variant, controller.content(), Math.floor(b.slot / TRIAD_SLOT_COUNT)).find((t) => t.slot === b.slot);
    if (now && c.part !== 'clear') controller.previewPitch(midiOf(now.pitch));
  };

  // 나무 하나의 화음만 듣는다
  const hearTree = (tree: number, m: ToneMode): void => {
    setMode(m);
    controller.playTones(toneNotesOf(hungTonesOfTree(variant, controller.content(), tree), m), `${treeNameOf(tree)}에는 아직 걸린 종이 없어요.`);
  };

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body">
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">
                  나무 {spec.trees}그루에 화음을 하나씩 걸어 보세요. 나무마다 종은 최대 {TRIAD_SLOT_COUNT}개까지 걸 수 있어요.
                </p>
              </div>
              <div class="chips">
                <span class="chip">걸린 종 {hungCount}개</span>
                <span class="chip">옥타브 {rules.octaves.join('·')}</span>
              </div>
            </header>

            <section class="card" aria-labelledby="route-title">
              <div class="card-head">
                <h2 id="route-title">화음의 길</h2>
                <span class="muted small">나무를 이 차례로 지나며 화음이 울려요.</span>
              </div>
              <ol class="route-list" data-events={spec.events.length}>
                {spec.events.map((e, i) => (
                  <li key={`${i}-${e.label}`} class="route-step" data-tree={e.tree}>
                    <span class="route-no" aria-hidden="true">{i + 1}</span>
                    <strong>{e.label}</strong>
                    <span class="muted small">{treeNameOf(e.tree)}</span>
                  </li>
                ))}
              </ol>
            </section>

            {trees.map((tree) => {
              const bells = treeBellsOf(variant, content, tree);
              const hung = bells.filter((b) => b.written).length;
              const title = eventOfTree(tree);
              const treeScore = toneDisplayScore(variant, hungTonesOfTree(variant, content, tree));
              return (
                <section key={tree} class="card" aria-labelledby={`tree-${tree}-title`} data-tree={tree}>
                  <div class="card-head">
                    <h2 id={`tree-${tree}-title`}>
                      {treeNameOf(tree)}
                      {title ? <span class="muted small"> · {title}</span> : null}
                    </h2>
                    <span class="muted small">걸린 종 {hung}개</span>
                  </div>
                  <figure class="tree-figure">
                    <BellTree
                      octaves={rules.octaves}
                      slotCount={TRIAD_SLOT_COUNT}
                      bells={bells.flatMap((b) => (b.pitch && b.name ? [{ slot: b.slot - tree * TRIAD_SLOT_COUNT, octave: b.pitch.octave, name: b.name, sounding: sounding.includes(b.slot) }] : []))}
                    />
                    <figcaption class="muted small">가지의 높이가 옥타브예요. 아래 카드에서 종을 걸어요.</figcaption>
                  </figure>
                  <ol class="slot-grid bell-grid">
                    {bells.map((b) => {
                      const status = statusOf(b);
                      const issue = issueOf(b);
                      const label = bellLabelOf(map, b.slot);
                      const short = toneLabelOf(b.slot % TRIAD_SLOT_COUNT);
                      const isSounding = sounding.includes(b.slot);
                      return (
                        <li key={b.slotId} class={`slot-card bell-card${status === 'error' ? ' has-error' : ''}${isSounding ? ' is-sounding' : ''}`} data-slot={b.slotId}>
                          <div class="slot-head">
                            <h3>{short}</h3>
                            {isSounding ? (
                              <span class="slot-status is-sounding" role="status">
                                <Icon name="play" /> 지금 울리는 음
                              </span>
                            ) : null}
                            {status === 'ok' ? (
                              <span class="slot-status is-ok">
                                <Icon name="check" /> 맞아요
                              </span>
                            ) : status === 'error' ? (
                              <span class="slot-status is-error">
                                <Icon name="alert" /> 고칠 곳이 있어요
                              </span>
                            ) : null}
                          </div>
                          <p class="tag-name" data-name={b.name ?? ''}>
                            {b.name ? (
                              <>
                                걸린 종: <strong class="tag-value">{b.name}</strong>
                              </>
                            ) : (
                              '비어 있어요. 음이름을 골라 걸어 보세요.'
                            )}
                          </p>
                          <PitchPicker id={`bell-${b.slotId}`} label={label} written={b.written} rules={rules} onChange={(c) => change(b, c)} />
                          {issue?.message ? <p class="slot-message">{issue.message}</p> : null}
                          <div class="slot-controls">
                            <button type="button" class="btn btn-quiet" onClick={() => change(b, { part: 'clear' })} disabled={b.written === null} aria-label={`${label}: 비우기`}>
                              <Icon name="trash" /> 비우기
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <div class="listen-row">
                    <button type="button" class="btn btn-quiet" onClick={() => hearTree(tree, 'together')} aria-label={`이 나무 듣기: ${treeNameOf(tree)}의 화음`} data-hear-tree={tree}>
                      <Icon name="play" /> 이 나무 듣기
                    </button>
                  </div>
                  <figure class="score-figure">
                    <figcaption>{treeNameOf(tree)}의 종</figcaption>
                    <StaffView score={treeScore} title={`${treeNameOf(tree)}의 종의 악보`} description={describeScore(treeScore)} options={COMPACT_VIEW} />
                  </figure>
                </section>
              );
            })}

            <section class="card" aria-labelledby="check-title">
              <div class="card-head">
                <h2 id="check-title">확인 결과</h2>
                <span class="muted small">'배치 확인'을 눌러야 나와요.</span>
              </div>
              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> {bellPassedText(variant)}
                  </p>
                ) : null}
                {feedback?.passed ? (feedback.notes ?? []).map((n) => (
                  <p key={n} class="feedback-line" data-shape-note>
                    {n}
                  </p>
                )) : null}
                {messages.map((m) => (
                  <p key={m} class="feedback-line">
                    <Icon name="alert" /> {feedback?.technical ? m : <strong>{m}</strong>}
                  </p>
                ))}
                {!feedback ? <p class="feedback-idle muted">나무마다 종을 걸고 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.</p> : null}
              </div>
            </section>
          </div>

          <div class="panel-side">
            <ToneAids controller={controller} onCheck={() => controller.check()}>
              <p class="muted small" id="route-hear-label">
                내 화음을 길의 차례대로 이어 들어요.
              </p>
              {HEAR_MODES.map((m) => (
                <button
                  type="button"
                  key={m.mode}
                  class={`btn ${m.mode === 'together' ? 'btn-primary btn-wide' : 'btn-quiet'}`}
                  data-hear-route={m.mode}
                  onClick={() => {
                    setMode(m.mode);
                    controller.playTones(chordRouteNotesOf(variant, controller.content(), m.mode), NO_BELL_NOTICE);
                  }}
                  aria-pressed={controller.playing === 'mine' && mode === m.mode}
                >
                  <Icon name="play" /> {m.mode === 'together' ? `이어 듣기: ${m.label}` : m.label}
                </button>
              ))}
              <div class="listen-row">
                <button type="button" class="btn btn-quiet" onClick={() => controller.playTarget()} aria-pressed={controller.playing === 'target'}>
                  <Icon name="play" /> 목표 화음 듣기
                </button>
              </div>
            </ToneAids>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
