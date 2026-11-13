// 5-2 Q04 음정 이름 패널(interval-names): 질문마다 두 음을 오선에서 보고 소리와 표기가 같은지, 음정 이름이 무엇인지 눌러 고른다.
// 소리가 같다는 것과 이름(표기)이 같다는 것을 따로 묻는다. 세 반음이라는 이유만으로 증2도와 단3도를 같게 보지 않는다.
import { useState } from 'preact/hooks';
import type { IntervalQuestion } from '../../../domain/evaluators';
import { midiOf } from '../../../domain/pitch';
import {
  CHOICE_DIFFERENT,
  CHOICE_SAME,
  EMPTY_INTERVAL_PICK,
  INTERVAL_PICK_NUMBERS,
  INTERVAL_PICK_QUALITIES,
  clearChoiceEdit,
  intervalPickEdit,
  intervalPickName,
  intervalPickOf,
  intervalQualityName,
  intervalSlotsOf,
  pickedNameOf,
  pitchPickEdit,
  pitchPickRulesOf,
  questionPitches,
  questionScoreOf,
  setChoiceEdit,
  toneNotesOf,
} from '../../../domain/slotplan';
import type { IntervalPick, IntervalSlotPlan, PitchChange } from '../../../domain/slotplan';
import { spellWritten } from '../../../domain/session';
import { ToneAids } from '../../assist/ToneAids';
import type { ChallengeController } from '../../challenge/controller';
import { intervalTextsOf } from '../../challenge/intervalText';
import { ChoiceGroup } from '../../common/ChoiceGroup';
import type { ChoiceOption } from '../../common/ChoiceGroup';
import { useController, usePlayheadSlots } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { PitchPicker } from '../../common/PitchPicker';
import { describeScore } from '../../notation/describe';
import { COMPACT_VIEW, StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';

type Status = 'idle' | 'ok' | 'error';

const SAME_OPTIONS: ChoiceOption[] = [
  { value: CHOICE_SAME, label: '같아요', data: { answer: CHOICE_SAME } },
  { value: CHOICE_DIFFERENT, label: '달라요', data: { answer: CHOICE_DIFFERENT } },
];
const QUALITY_OPTIONS: ChoiceOption[] = INTERVAL_PICK_QUALITIES.map((q) => ({ value: q, label: intervalQualityName(q), data: { quality: q } }));
const NUMBER_OPTIONS: ChoiceOption[] = INTERVAL_PICK_NUMBERS.map((n) => ({ value: String(n), label: `${n}도`, data: { number: String(n) } }));

const STATUS_TEXT: Record<Exclude<Status, 'idle'>, string> = { ok: '맞아요', error: '고칠 곳이 있어요' };

export function IntervalPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlots(controller);
  // 성질과 도수를 하나만 골라 둔 상태(둘이 모여야 초안에 담긴다). 질문 id별
  const [partial, setPartial] = useState<Record<string, IntervalPick>>({});
  const cur = controller.current;
  if (!cur) return null;
  const variant = cur.def;
  const spec = variant.evaluatorSpec;
  if (spec.type !== 'interval') return null;
  const plan = intervalSlotsOf(variant);
  const content = controller.content();
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed ? feedback.messages : [];
  const keySignature = variant.score.staves[0]?.keySignature ?? 0;
  const choiceOf = (slot: number): string | undefined => content.slots.find((s) => s.slot === slot)?.choice;
  const answeredSlot = (slot: number): boolean => content.slots.some((x) => x.slot === slot && (x.choice !== undefined || x.writtenPitch));

  // 질문과 부분의 판정 상태. 알려 준 이슈의 코드로 소리와 표기를 가른다
  const issuesOf = (qid: string) => (feedback && !feedback.technical ? feedback.issues.map((issue, i) => ({ issue, message: feedback.messages[i] ?? '' })).filter((x) => x.issue.target?.slotId === qid) : []);
  // 답이 빠진 질문은 판정기가 맞고 틀림을 따지지 않는다. 그런 질문에서는 빠진 답만 고칠 곳이고, 고른 답은 아직 판정받지 않았다
  const partStatus = (p: IntervalSlotPlan): Status => {
    if (!feedback || feedback.technical) return 'idle';
    const mine = issuesOf(p.qid).map((x) => x.issue.code);
    if (mine.includes('MISSING_PLACEMENT')) return answeredSlot(p.slot) ? 'idle' : 'error';
    if (p.part === 'sound') return mine.includes('WRONG_SOUND_EQUIV') ? 'error' : 'ok';
    if (p.part === 'notation') return mine.includes('WRONG_NOTATION_EQUIV') ? 'error' : 'ok';
    return mine.length > 0 ? 'error' : 'ok';
  };
  const questionStatus = (qid: string): Status => {
    const parts = plan.filter((p) => p.qid === qid).map(partStatus);
    return parts.includes('error') ? 'error' : parts.length > 0 && parts.every((x) => x === 'ok') ? 'ok' : 'idle';
  };

  const hear = (q: IntervalQuestion, slot: number): void => {
    const notes = toneNotesOf(
      questionPitches(q).map((pitch) => ({ slot, pitch })),
      'ascending',
    );
    controller.playTones(notes);
  };

  const answerSame = (p: IntervalSlotPlan, value: string): void => {
    const what = p.part === 'sound' ? '소리 높이' : '표기(음이름)';
    controller.edit(setChoiceEdit(p.slot, value), `${p.question.label}: ${what}가 ${value === CHOICE_SAME ? '같다' : '다르다'}고 골랐어요.`);
  };

  const pickInterval = (p: IntervalSlotPlan, part: 'quality' | 'number', value: string): void => {
    const now = partial[p.qid] ?? intervalPickOf(choiceOf(p.slot));
    const next: IntervalPick = part === 'quality' ? { ...now, quality: value as IntervalPick['quality'] } : { ...now, number: Number(value) };
    const edit = intervalPickEdit(p.slot, next);
    if (edit) {
      setPartial((prev) => {
        const { [p.qid]: _gone, ...rest } = prev;
        return rest;
      });
      controller.edit(edit, `${p.question.label}: ${intervalPickName(next)}라고 골랐어요.`);
    } else {
      setPartial((prev) => ({ ...prev, [p.qid]: next }));
      controller.announce(`${p.question.label}: ${part === 'quality' ? `${intervalQualityName(next.quality!)}을 골랐어요. 도수도 골라 주세요.` : `${next.number}도를 골랐어요. 성질도 골라 주세요.`}`);
    }
  };

  const clearInterval = (p: IntervalSlotPlan): void => {
    setPartial((prev) => {
      const { [p.qid]: _gone, ...rest } = prev;
      return rest;
    });
    if (choiceOf(p.slot) !== undefined) controller.edit(clearChoiceEdit(p.slot), `${p.question.label}: 고른 음정을 지웠어요.`);
    else controller.announce(`${p.question.label}: 고른 음정이 없어요.`);
  };

  const pickBuilt = (p: IntervalSlotPlan, c: PitchChange): void => {
    const rules = pitchPickRulesOf(variant);
    const r = pitchPickEdit(variant, controller.content(), p.slot, p.question.label, c, rules);
    if (!r.ok || !r.edit) {
      controller.announce(r.text);
      return;
    }
    controller.edit(r.edit, r.text);
    const w = controller.content().slots.find((s) => s.slot === p.slot)?.writtenPitch;
    if (w && c.part !== 'clear') controller.previewPitch(midiOf(spellWritten(w, keySignature)));
  };

  const answered = (qid: string): boolean => plan.filter((p) => p.qid === qid).every((p) => answeredSlot(p.slot));
  const allAnswered = [...new Set(plan.map((p) => p.qid))].every(answered);
  const questions = spec.questions;
  const texts = intervalTextsOf(questions);

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body">
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">{texts.subtitle}</p>
              </div>
              <div class="chips">
                <span class="chip">질문 {questions.length}개</span>
                <span class="chip">{texts.chip}</span>
              </div>
            </header>

            <section class="card" aria-labelledby="questions-title">
              <div class="card-head">
                <h2 id="questions-title">질문</h2>
                <span class="muted small">{texts.hint}</span>
              </div>
              <ol class="slot-grid question-grid">
                {questions.map((q) => {
                  const parts = plan.filter((p) => p.qid === q.qid);
                  const first = parts[0]!;
                  const status = questionStatus(q.qid);
                  const mine = issuesOf(q.qid);
                  const isSounding = sounding.includes(first.slot);
                  return (
                    <li key={q.qid} class={`slot-card question-card${status === 'error' ? ' has-error' : ''}${isSounding ? ' is-sounding' : ''}`} data-qid={q.qid}>
                      <div class="slot-head">
                        <h3>{q.label}</h3>
                        {isSounding ? (
                          <span class="slot-status is-sounding" role="status">
                            <Icon name="play" /> 지금 울리는 음
                          </span>
                        ) : null}
                        {status !== 'idle' ? (
                          <span class={`slot-status is-${status}`}>
                            <Icon name={status === 'ok' ? 'check' : 'alert'} /> {STATUS_TEXT[status]}
                          </span>
                        ) : null}
                      </div>
                      <div class="question-staff">
                        <StaffView score={questionScoreOf(variant, q)} title={`${q.label}의 음`} description={describeScore(questionScoreOf(variant, q))} options={COMPACT_VIEW} />
                      </div>
                      {q.kind !== 'build' ? (
                        <button type="button" class="btn btn-quiet" onClick={() => hear(q, first.slot)} aria-label={`${q.label}: 두 음 듣기`}>
                          <Icon name="play" /> 두 음 듣기
                        </button>
                      ) : null}

                      {q.kind === 'compare'
                        ? parts.map((p) => (
                            <ChoiceGroup
                              key={p.slot}
                              id={`q-${q.qid}-${p.part}`}
                              title={p.part === 'sound' ? `${q.label}: 소리 높이는` : `${q.label}: 표기(음이름)는`}
                              class={`answer-${p.part}${partStatus(p) === 'error' ? ' has-error' : ''}`}
                              options={SAME_OPTIONS}
                              selected={choiceOf(p.slot) === CHOICE_SAME || choiceOf(p.slot) === CHOICE_DIFFERENT ? choiceOf(p.slot)! : null}
                              onPick={(v) => answerSame(p, v)}
                            />
                          ))
                        : null}

                      {q.kind === 'identify'
                        ? (() => {
                            const p = parts[0]!;
                            const pick = partial[q.qid] ?? intervalPickOf(choiceOf(p.slot));
                            const name = intervalPickName(pick);
                            return (
                              <>
                                <ChoiceGroup id={`q-${q.qid}-quality`} title={`${q.label}: 성질`} class="answer-quality" options={QUALITY_OPTIONS} selected={pick.quality} onPick={(v) => pickInterval(p, 'quality', v)} />
                                <ChoiceGroup id={`q-${q.qid}-number`} title={`${q.label}: 도수`} class="answer-number" options={NUMBER_OPTIONS} selected={pick.number === null ? null : String(pick.number)} onPick={(v) => pickInterval(p, 'number', v)} />
                                <p class="tag-name" data-name={name ?? ''}>
                                  {name ? (
                                    <>
                                      고른 음정: <strong class="tag-value">{name}</strong>
                                    </>
                                  ) : (
                                    '성질과 도수를 모두 골라야 답이 돼요.'
                                  )}
                                </p>
                                <div class="slot-controls">
                                  <button type="button" class="btn btn-quiet" onClick={() => clearInterval(p)} disabled={pick === EMPTY_INTERVAL_PICK || (pick.quality === null && pick.number === null)} aria-label={`${q.label}: 고른 음정 지우기`}>
                                    <Icon name="trash" /> 지우기
                                  </button>
                                </div>
                              </>
                            );
                          })()
                        : null}

                      {q.kind === 'build'
                        ? (() => {
                            const p = parts[0]!;
                            const written = content.slots.find((s) => s.slot === p.slot)?.writtenPitch ?? null;
                            const name = pickedNameOf(variant, content, p.slot);
                            return (
                              <>
                                <p class="tag-name" data-name={name ?? ''}>
                                  {name ? (
                                    <>
                                      고른 음: <strong class="tag-value">{name}</strong>
                                    </>
                                  ) : (
                                    '음이름과 변화표를 골라 음을 만들어 보세요.'
                                  )}
                                </p>
                                <PitchPicker id={`q-${q.qid}-pitch`} label={q.label} written={written} rules={pitchPickRulesOf(variant)} onChange={(c) => pickBuilt(p, c)} />
                              </>
                            );
                          })()
                        : null}

                      {mine.map((x) => (
                        <p key={x.message} class="slot-message">
                          {x.message}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ol>

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> {texts.passed}
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
                {!feedback ? <p class="feedback-idle muted">{allAnswered ? "다 답했어요. '배치 확인'을 눌러 보세요." : "모든 질문에 답하고 '배치 확인'을 눌러 보세요."} 확인하기 전에는 맞고 틀림을 알려 주지 않아요.</p> : null}
              </div>
            </section>
          </div>

          <div class="panel-side">
            <ToneAids controller={controller} onCheck={() => controller.check()}>
              <div class="listen-row">
                <button type="button" class="btn btn-quiet" onClick={() => controller.playTarget()} aria-pressed={controller.playing === 'target'}>
                  <Icon name="play" /> 목표 소리 듣기
                </button>
              </div>
            </ToneAids>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
