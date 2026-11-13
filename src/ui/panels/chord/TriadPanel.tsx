// 5-3 Q05 장3화음 조립 패널: 종나무에 종을 걸어 화음을 만든다. 종은 최대 넷이다.
// 음이름·변화표·옥타브를 눌러 고르고, '배치 확인'을 눌러야 맞고 틀림이 나온다. 목표 악보는 정답이라서 보여 주지 않는다.
import { useState } from 'preact/hooks';
import { midiOf } from '../../../domain/pitch';
import {
  TRIAD_SLOT_COUNT,
  chordTitleOf,
  hungTonesOf,
  pitchPickEdit,
  pitchPickRulesOf,
  toneDisplayScore,
  toneLabelOf,
  toneNotesOf,
  triadBellsOf,
} from '../../../domain/slotplan';
import type { PitchChange, ToneMode, TriadBell } from '../../../domain/slotplan';
import { ToneAids } from '../../assist/ToneAids';
import type { ChallengeController } from '../../challenge/controller';
import { useController, usePlayheadSlots } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { PitchPicker } from '../../common/PitchPicker';
import { describeScore } from '../../notation/describe';
import { COMPACT_VIEW, StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';
import { BellTree } from './BellTree';

type Status = 'idle' | 'ok' | 'error';

export const NO_BELL_NOTICE = '아직 걸린 종이 없어요. 종에 이름을 골라 걸어 보세요.';

const MODES: ReadonlyArray<{ mode: ToneMode; label: string }> = [
  { mode: 'together', label: '함께 울리기' },
  { mode: 'ascending', label: '아래부터 차례로' },
  { mode: 'lowest', label: '가장 낮은 종만' },
];

export function TriadPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlots(controller);
  const [mode, setMode] = useState<ToneMode | null>(null);
  const cur = controller.current;
  if (!cur) return null;
  const variant = cur.def;
  if (variant.evaluatorSpec.type !== 'triadMembership') return null;
  const rules = pitchPickRulesOf(variant);
  const content = controller.content();
  const bells = triadBellsOf(variant, content);
  const hung = hungTonesOf(variant, content);
  const feedback = controller.feedback;
  const checked = feedback !== null && !feedback.technical;
  const messages = feedback && !feedback.passed ? feedback.messages : [];
  const chord = chordTitleOf(variant);
  const myScore = toneDisplayScore(variant, hung);

  // 판정이 종마다 알려 준 문제(target.slotId가 'tone-N'). 목표가 없는 문제(빠진 음 등)는 아래 문장에만 나온다
  const issueOf = (b: TriadBell): { message: string } | null => {
    if (!feedback || feedback.technical) return null;
    const i = feedback.issues.findIndex((x) => x.target?.slotId === b.slotId);
    return i >= 0 ? { message: feedback.messages[i] ?? '' } : null;
  };
  const octaveIssue = checked && feedback!.issues.some((x) => x.code === 'WRONG_OCTAVE_SET');
  // 걸린 종 가운데 어떤 문제도 가리키지 않은 종은 맞는 구성음이다. 높이를 따로 묻는 문제가 있으면 그렇게 말하지 않는다
  const statusOf = (b: TriadBell): Status => {
    if (!b.written || !checked) return 'idle';
    if (issueOf(b)) return 'error';
    return octaveIssue ? 'idle' : 'ok';
  };

  const change = (b: TriadBell, c: PitchChange): void => {
    const r = pitchPickEdit(variant, controller.content(), b.slot, toneLabelOf(b.slot), c, rules);
    if (!r.ok || !r.edit) {
      controller.announce(r.text);
      return;
    }
    controller.edit(r.edit, r.text);
    // 고른 종의 소리를 한 번 들려 준다(소리가 꺼져 있으면 아무 일도 하지 않는다)
    const now = hungTonesOf(variant, controller.content()).find((t) => t.slot === b.slot);
    if (now && c.part !== 'clear') controller.previewPitch(midiOf(now.pitch));
  };

  const hear = (m: ToneMode): void => {
    setMode(m);
    controller.playTones(toneNotesOf(hungTonesOf(variant, controller.content()), m), NO_BELL_NOTICE);
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
                  {chord}의 구성음을 종으로 걸어 보세요. 종은 최대 {TRIAD_SLOT_COUNT}개까지 걸 수 있어요.
                </p>
              </div>
              <div class="chips">
                <span class="chip">걸린 종 {hung.length}개</span>
                <span class="chip">옥타브 {rules.octaves.join('·')}</span>
              </div>
            </header>

            <section class="card" aria-labelledby="tree-title">
              <div class="card-head">
                <h2 id="tree-title">종나무</h2>
                <span class="muted small">가지의 높이가 옥타브예요. 아래 카드에서 종을 걸어요.</span>
              </div>
              <figure class="tree-figure">
                <BellTree
                  octaves={rules.octaves}
                  slotCount={TRIAD_SLOT_COUNT}
                  bells={bells.flatMap((b) => (b.pitch && b.name ? [{ slot: b.slot, octave: b.pitch.octave, name: b.name, sounding: sounding.includes(b.slot) }] : []))}
                />
                <figcaption class="muted small">종을 걸면 그 음의 가지에 매달려요.</figcaption>
              </figure>
            </section>

            <section class="card" aria-labelledby="bells-title">
              <div class="card-head">
                <h2 id="bells-title">종 걸기</h2>
                <span class="muted small">음이름을 먼저 고르고, 변화표와 옥타브를 골라요. 화살표 키로 옮기고 Enter로 골라요.</span>
              </div>
              <ol class="slot-grid bell-grid">
                {bells.map((b) => {
                  const status = statusOf(b);
                  const issue = issueOf(b);
                  const label = toneLabelOf(b.slot);
                  const isSounding = sounding.includes(b.slot);
                  return (
                    <li key={b.slotId} class={`slot-card bell-card${status === 'error' ? ' has-error' : ''}${isSounding ? ' is-sounding' : ''}`} data-slot={b.slotId}>
                      <div class="slot-head">
                        <h3>{label}</h3>
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

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> {chord}의 구성음이 모두 걸렸어요.
                  </p>
                ) : null}
                {messages.map((m) => (
                  <p key={m} class="feedback-line">
                    <Icon name="alert" /> {feedback?.technical ? m : <strong>{m}</strong>}
                  </p>
                ))}
                {!feedback ? <p class="feedback-idle muted">종을 걸고 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.</p> : null}
              </div>
            </section>

            <section class="card score-view" aria-labelledby="score-title">
              <div class="card-head">
                <h2 id="score-title">악보로 보기</h2>
                <span class="muted small">걸린 종을 오선에 그린 것이에요. 같은 높이의 종은 하나로 보여요.</span>
              </div>
              <figure class="score-figure">
                <figcaption>내 종</figcaption>
                <StaffView score={myScore} title="내 종의 악보" description={describeScore(myScore)} options={COMPACT_VIEW} />
              </figure>
            </section>
          </div>

          <div class="panel-side">
            <ToneAids controller={controller} onCheck={() => controller.check()}>
              {MODES.map((m) => (
                <button type="button" key={m.mode} class={`btn ${m.mode === 'together' ? 'btn-primary btn-wide' : 'btn-quiet'}`} onClick={() => hear(m.mode)} aria-pressed={controller.playing === 'mine' && mode === m.mode}>
                  <Icon name="play" /> {m.label}
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
