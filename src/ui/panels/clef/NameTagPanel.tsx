// 5-2 Q04 이름표 패널(name-tags): 같은 소리의 검은 건반 하나에 이름표 두 개를 건다.
// 음이름과 변화표를 눌러 고르고, '배치 확인'을 눌러야 맞고 틀림이 나온다. 이름이 달라도 소리는 같다는 것을 들어 볼 수 있다.
import { fillTemplate } from '../../../domain/feedback';
import { midiOf, pitchName } from '../../../domain/pitch';
import { nameTagPlanOf, nameTagTonesOf, pickedNameOf, pitchPickEdit, toneNotesOf } from '../../../domain/slotplan';
import type { NameTagKey, NameTagSlot, PitchChange } from '../../../domain/slotplan';
import { ToneAids } from '../../assist/ToneAids';
import type { ChallengeController } from '../../challenge/controller';
import { useController, usePlayheadSlots } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { PitchPicker } from '../../common/PitchPicker';
import { PanelFrame } from '../PanelFrame';

/** 건반 그림: 흰 건반 둘과 그 사이의 검은 건반 하나. 소리가 울리는 동안 검은 건반에 표시가 붙는다 */
function KeyPicture({ keyInfo, sounding }: { keyInfo: NameTagKey; sounding: boolean }) {
  const lower = pitchName(keyInfo.lower);
  const upper = pitchName(keyInfo.upper);
  return (
    <figure class="key-figure">
      <svg class="key-picture" viewBox="0 0 220 150" width="220" height="150" role="img" aria-label={`건반 그림: 흰 건반 ${lower}와 ${upper} 사이에 검은 건반이 하나 있어요`}>
        <rect class="key-white" x="10" y="10" width="98" height="112" rx="6" />
        <rect class="key-white" x="112" y="10" width="98" height="112" rx="6" />
        <text class="key-name" x="59" y="140" text-anchor="middle">{lower}</text>
        <text class="key-name" x="161" y="140" text-anchor="middle">{upper}</text>
        <rect class={`key-black${sounding ? ' is-sounding' : ''}`} x="78" y="10" width="64" height="72" rx="5" />
        {sounding ? <path class="key-sound" d="M110 94v10m-12-4 6 6m18-6-6 6" /> : null}
      </svg>
      <figcaption class="muted small">검은 건반은 하나인데, 부르는 이름은 둘이에요.</figcaption>
    </figure>
  );
}

export function NameTagPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlots(controller);
  const cur = controller.current;
  if (!cur) return null;
  const variant = cur.def;
  const plan = nameTagPlanOf(variant);
  const content = controller.content();
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed ? feedback.messages : [];
  const hung = nameTagTonesOf(variant, content);
  const keyInfo = plan.key;

  const statusOf = (slot: NameTagSlot): { status: 'idle' | 'ok' | 'error'; message: string | null } => {
    if (!feedback || feedback.technical) return { status: 'idle', message: null };
    const i = feedback.issues.findIndex((x) => x.target?.slotId === slot.slotId);
    return i >= 0 ? { status: 'error', message: feedback.messages[i] ?? null } : { status: 'ok', message: null };
  };

  const change = (slot: NameTagSlot, c: PitchChange): void => {
    const r = pitchPickEdit(variant, controller.content(), slot.slot, slot.label, c, plan.rules);
    if (!r.ok || !r.edit) {
      controller.announce(r.text);
      return;
    }
    controller.edit(r.edit, r.text);
    // 고른 이름의 소리를 한 번 들려 준다(소리가 꺼져 있으면 아무 일도 하지 않는다)
    const now = nameTagTonesOf(variant, controller.content()).find((t) => t.slot === slot.slot);
    if (now && c.part !== 'clear') controller.previewPitch(midiOf(now.pitch));
  };

  const listenMine = (): void => {
    controller.playTones(toneNotesOf(nameTagTonesOf(variant, controller.content()), 'ascending'), '아직 걸린 이름표가 없어요. 이름을 골라 걸어 보세요.');
  };

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body">
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">같은 소리를 두 가지 이름으로 불러 보세요. 이름표를 걸고 '배치 확인'을 눌러요.</p>
              </div>
              <div class="chips">
                <span class="chip">이름표 {plan.slots.length}개</span>
                <span class="chip">옥타브 {plan.rules.octaves.join('·')}</span>
              </div>
            </header>

            {keyInfo ? (
              <section class="card" aria-labelledby="key-title">
                <div class="card-head">
                  <h2 id="key-title">같은 소리의 건반</h2>
                </div>
                <div class="key-row">
                  <KeyPicture keyInfo={keyInfo} sounding={sounding.length > 0} />
                  <p class="key-note">
                    {fillTemplate('검은 건반은 왼쪽 흰 건반 {a:와과} 오른쪽 흰 건반 {b} 사이에 있어요.', { a: pitchName(keyInfo.lower), b: pitchName(keyInfo.upper) })} 왼쪽 {pitchName(keyInfo.lower)}에서 한 반음 올려 부르면 '올려 부른 이름', 오른쪽{' '}
                    {pitchName(keyInfo.upper)}에서 한 반음 내려 부르면 '내려 부른 이름'이에요.
                  </p>
                </div>
              </section>
            ) : null}

            <section class="card" aria-labelledby="tags-title">
              <div class="card-head">
                <h2 id="tags-title">이름표 걸기</h2>
                <span class="muted small">음이름을 먼저 고르고, 변화표를 골라요. 화살표 키로 옮기고 Enter로 골라요.</span>
              </div>
              <ol class="slot-grid tag-grid">
                {plan.slots.map((slot) => {
                  const { status, message } = statusOf(slot);
                  const name = pickedNameOf(variant, content, slot.slot);
                  const written = content.slots.find((s) => s.slot === slot.slot)?.writtenPitch ?? null;
                  const isSounding = sounding.includes(slot.slot);
                  const readoutId = `tag-readout-${slot.slotId}`;
                  return (
                    <li key={slot.slotId} class={`slot-card tag-card${status === 'error' ? ' has-error' : ''}${isSounding ? ' is-sounding' : ''}`} data-slot={slot.slotId}>
                      <div class="slot-head">
                        <h3>{slot.label}</h3>
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
                      <p class="tag-name" id={readoutId} data-name={name ?? ''}>
                        {name ? (
                          <>
                            걸린 이름: <strong class="tag-value">{name}</strong>
                          </>
                        ) : (
                          '아직 걸지 않았어요. 음이름을 골라 보세요.'
                        )}
                      </p>
                      <PitchPicker id={`tag-${slot.slotId}`} label={slot.label} written={written} rules={plan.rules} onChange={(c) => change(slot, c)} />
                      {message ? <p class="slot-message">{message}</p> : null}
                      <div class="slot-controls">
                        <button type="button" class="btn btn-quiet" onClick={() => change(slot, { part: 'clear' })} disabled={name === null} aria-label={`${slot.label}: 지우기`}>
                          <Icon name="trash" /> 지우기
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> 이름은 다르지만 같은 소리예요.
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
                  <p class="feedback-idle muted">
                    {hung.length === plan.slots.length ? "다 걸었어요. '배치 확인'을 눌러 보세요." : '이름표를 모두 걸고 \'배치 확인\'을 눌러 보세요.'} 확인하기 전에는 맞고 틀림을 알려 주지 않아요.
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <div class="panel-side">
            <ToneAids controller={controller} onCheck={() => controller.check()}>
              <button type="button" class="btn btn-primary btn-wide" onClick={listenMine} aria-pressed={controller.playing === 'mine'}>
                <Icon name="play" /> 내 이름표 듣기
              </button>
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
