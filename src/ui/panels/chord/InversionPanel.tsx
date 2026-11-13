// 5-3 Q06 전위 패널(종탑형): 종 세 개가 기본 위치로 걸린 채 시작한다. 종마다 옥타브를 올리고 내리고, 소리를 끄고 켜고, 가로 자리를 바꾼다.
// 전위는 가로 순서가 아니라 실제로 울리는 가장 낮은 음이 정한다. 순서만 바꿔서는 바뀌지 않는다는 것을 직접 확인하게 하는 화면이다.
import { useState } from 'preact/hooks';
import { fillTemplate } from '../../../domain/feedback';
import { midiOf, pitchName } from '../../../domain/pitch';
import {
  INVERSION_SLOT_COUNT,
  lowestToneOf,
  octavesOfRange,
  soundingTonesOf,
  toneCardsOf,
  toneDisplayScore,
  toneLabelOf,
  toneMuteResult,
  toneNotesOf,
  toneShiftResult,
  toneSwapResult,
} from '../../../domain/slotplan';
import type { ToneEditResult, ToneMode } from '../../../domain/slotplan';
import { ToneAids } from '../../assist/ToneAids';
import type { ChallengeController } from '../../challenge/controller';
import { useController, usePlayheadSlots } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { describeScore } from '../../notation/describe';
import { COMPACT_VIEW, StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';
import { BellTree } from './BellTree';

export const NO_SOUNDING_BELL_NOTICE = '소리가 켜진 종이 없어요. 종의 소리를 켜 보세요.';

const MODES: ReadonlyArray<{ mode: ToneMode; label: string }> = [
  { mode: 'together', label: '함께 울리기' },
  { mode: 'ascending', label: '아래부터 차례로' },
  { mode: 'lowest', label: '가장 낮은 종만' },
];

export function InversionPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlots(controller);
  const [mode, setMode] = useState<ToneMode | null>(null);
  const cur = controller.current;
  if (!cur) return null;
  const variant = cur.def;
  if (variant.evaluatorSpec.type !== 'inversion') return null;
  const content = controller.content();
  const cards = toneCardsOf(variant, content);
  const live = soundingTonesOf(variant, content);
  const lowest = lowestToneOf(live);
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed ? feedback.messages : [];
  const range = variant.challengeDescriptor.range.split('-');
  const myScore = toneDisplayScore(variant, live);
  const target = variant.label ?? cur.entry.title;

  const apply = (r: ToneEditResult, preview?: number): void => {
    if (!r.ok) {
      controller.announce(r.text);
      return;
    }
    controller.edit(r.edit, r.text);
    if (preview !== undefined) controller.previewPitch(preview);
  };

  const shift = (slot: number, delta: 1 | -1): void => {
    const r = toneShiftResult(variant, controller.content(), slot, delta);
    const card = toneCardsOf(variant, controller.content()).find((c) => c.slot === slot);
    // 옮긴 뒤의 높이를 한 번 들려 준다(소리를 끈 종은 들려 주지 않는다)
    apply(r, r.ok && card && !card.muted ? midiOf({ ...card.pitch, octave: card.pitch.octave + delta }) : undefined);
  };

  const hear = (m: ToneMode): void => {
    setMode(m);
    controller.playTones(toneNotesOf(soundingTonesOf(variant, controller.content()), m), NO_SOUNDING_BELL_NOTICE);
  };

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body">
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">{fillTemplate('{target:으로로} 만들어 보세요. 가장 낮게 울리는 종이 베이스예요.', { target })}</p>
              </div>
              <div class="chips">
                <span class="chip">종 {INVERSION_SLOT_COUNT}개</span>
                <span class="chip">
                  음역 {range[0]}–{range[1] ?? range[0]}
                </span>
              </div>
            </header>

            <section class="card" aria-labelledby="tower-title">
              <div class="card-head">
                <h2 id="tower-title">종탑</h2>
                <span class="muted small">가지의 높이가 옥타브예요. 가로 자리는 낮고 높은 것과 상관없어요.</span>
              </div>
              <figure class="tree-figure">
                <BellTree
                  octaves={octavesOfRange(variant.challengeDescriptor.range)}
                  slotCount={INVERSION_SLOT_COUNT}
                  bells={cards.map((c) => ({ slot: c.slot, octave: c.pitch.octave, name: c.name, muted: c.muted, sounding: sounding.includes(c.slot), lowest: lowest?.slot === c.slot }))}
                />
                <figcaption class="muted small">소리가 꺼진 종은 점선이에요.</figcaption>
              </figure>
              <p class="bass-readout" data-bass={lowest ? pitchName(lowest.pitch) : ''}>
                {lowest ? (
                  <>
                    지금 가장 낮은 음: <strong class="tag-value">{pitchName(lowest.pitch)}</strong> ({toneLabelOf(lowest.slot)})
                  </>
                ) : (
                  '소리가 켜진 종이 없어요.'
                )}
              </p>
            </section>

            <section class="card" aria-labelledby="bells-title">
              <div class="card-head">
                <h2 id="bells-title">종 고치기</h2>
                <span class="muted small">종마다 옥타브를 바꾸고, 소리를 끄고, 자리를 옮길 수 있어요.</span>
              </div>
              <ol class="slot-grid bell-grid">
                {cards.map((c) => {
                  const label = toneLabelOf(c.slot);
                  const isLowest = lowest?.slot === c.slot;
                  const isSounding = sounding.includes(c.slot);
                  return (
                    <li key={c.slotId} class={`slot-card bell-card${c.muted ? ' is-muted' : ''}${isLowest ? ' is-lowest' : ''}${isSounding ? ' is-sounding' : ''}`} data-slot={c.slotId} data-name={c.name} data-muted={c.muted ? 'true' : 'false'}>
                      <div class="slot-head">
                        <h3>{label}</h3>
                        {isSounding ? (
                          <span class="slot-status is-sounding" role="status">
                            <Icon name="play" /> 지금 울리는 음
                          </span>
                        ) : null}
                        {isLowest ? (
                          <span class="slot-status is-lowest">
                            <Icon name="down" /> 가장 낮은 종
                          </span>
                        ) : null}
                        {c.muted ? (
                          <span class="slot-status is-muted">
                            <Icon name="speaker-off" /> 소리 꺼짐
                          </span>
                        ) : null}
                      </div>
                      <p class="tag-name" data-name={c.name}>
                        걸린 종: <strong class="tag-value">{c.name}</strong>
                      </p>
                      <div class="slot-controls" role="group" aria-label={`${label}의 높이`}>
                        <button type="button" class="btn btn-quiet" onClick={() => shift(c.slot, 1)} aria-label={`${label}: 옥타브 올리기`}>
                          <Icon name="up" /> 옥타브 올리기
                        </button>
                        <button type="button" class="btn btn-quiet" onClick={() => shift(c.slot, -1)} aria-label={`${label}: 옥타브 내리기`}>
                          <Icon name="down" /> 옥타브 내리기
                        </button>
                      </div>
                      <div class="slot-controls" role="group" aria-label={`${label}의 소리와 자리`}>
                        <button type="button" class="btn btn-quiet" onClick={() => apply(toneMuteResult(variant, controller.content(), c.slot))} aria-label={`${label}: 소리 ${c.muted ? '켜기' : '끄기'}`}>
                          <Icon name={c.muted ? 'speaker' : 'speaker-off'} /> 소리 {c.muted ? '켜기' : '끄기'}
                        </button>
                        <button type="button" class="btn btn-quiet" onClick={() => apply(toneSwapResult(variant, controller.content(), c.slot, 'left'))} disabled={c.slot === 0} aria-label={`${label}: 왼쪽으로 자리 바꾸기`}>
                          <Icon name="arrow-left" /> 왼쪽으로
                        </button>
                        <button type="button" class="btn btn-quiet" onClick={() => apply(toneSwapResult(variant, controller.content(), c.slot, 'right'))} disabled={c.slot === cards.length - 1} aria-label={`${label}: 오른쪽으로 자리 바꾸기`}>
                          오른쪽으로 <Icon name="arrow-right" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> 가장 낮은 종이 목표의 베이스예요.
                  </p>
                ) : null}
                {messages.map((m) => (
                  <p key={m} class="feedback-line">
                    <Icon name="alert" /> {feedback?.technical ? m : <strong>{m}</strong>}
                  </p>
                ))}
                {!feedback ? <p class="feedback-idle muted">종을 고친 뒤 '배치 확인'을 눌러 보세요. 확인하기 전에는 맞고 틀림을 알려 주지 않아요.</p> : null}
              </div>
            </section>

            <section class="card score-view" aria-labelledby="score-title">
              <div class="card-head">
                <h2 id="score-title">악보로 보기</h2>
                <span class="muted small">울리는 종을 오선에 그린 것이에요. 가로 자리를 바꿔도 악보는 같아요.</span>
              </div>
              <figure class="score-figure score-grand">
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
