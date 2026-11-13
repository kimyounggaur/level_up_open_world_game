// 'panel.clef'는 음높이·음정 이름 과제 전체의 패널이다. 열린 판본에 따라 화면이 갈린다.
//  - Q01(음자리표)과 Q09–Q12(오선 언덕): 오선에 음을 놓는 화면(이 파일의 StaffPanel). Q01은 두 보표에 같은 음을 하나씩, 나머지는 칸마다 한 보표에 하나씩 놓는다
//  - Q04 이름표 판본: 건반 그림에서 검은 건반에 이름표를 거는 NameTagPanel
//  - Q04 음정 판본: 두 음의 소리·표기·음정 이름을 고르는 IntervalPanel
// 오선을 누르거나 한 칸씩 옮기는 단추로 놓고, '배치 확인'을 눌러야 맞고 틀림이 나온다.
import { isNameTagVariant } from '../../../domain/slotplan';
import { describeStaffPosition } from '../../../domain/staff';
import type { StaffSlot } from '../../../domain/challenge';
import { PanelFrame } from '../PanelFrame';
import { AssistPanel } from '../../assist/ListeningAids';
import type { ChallengeController } from '../../challenge/controller';
import { SOUND_OFF_HINT } from '../../challenge/controller';
import { isTwoClefPair, staffIdleText, staffListenLabel, staffPassedText } from '../../challenge/staffText';
import { spellingPrompt } from '../../common/format';
import { useController, usePlayheadSlot } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { Toggle } from '../../common/Toggle';
import { IntervalPanel } from './IntervalPanel';
import { NameTagPanel } from './NameTagPanel';
import { StaffSurface } from './StaffSurface';
import type { SlotStatus } from './StaffSurface';

function slotStatusOf(controller: ChallengeController, slot: StaffSlot): { status: SlotStatus; message: string | null } {
  const f = controller.feedback;
  if (!f || f.technical) return { status: 'idle', message: null };
  const i = f.issues.findIndex((x) => x.target?.slotId === slot.slotId);
  if (i >= 0) return { status: 'error', message: f.messages[i] ?? null };
  return { status: 'ok', message: null };
}

/** 음높이·음정 패널: 열린 판본의 종류에 맞는 화면을 보인다 */
export function ClefPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const def = controller.current?.def;
  if (def && isNameTagVariant(def)) return <NameTagPanel controller={controller} />;
  if (def && def.evaluatorSpec.type === 'interval') return <IntervalPanel controller={controller} />;
  return <StaffPanel controller={controller} />;
}

function StaffPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlot(controller);
  const cur = controller.current;
  if (!cur) return null;
  const slots = controller.staffSlots();
  const selected = controller.selectedSlot();
  const feedback = controller.feedback;
  const aids = controller.aids;
  const playing = controller.playing;
  const messages = feedback && !feedback.passed ? feedback.messages : [];
  const placedCount = slots.filter((s) => controller.slotPosition(s) !== null).length;

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body">
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">{spellingPrompt(cur.def)}</p>
              </div>
              <div class="chips">
                <span class="chip">{isTwoClefPair(slots) ? `보표 ${slots.length}개` : `음 ${slots.length}개`}</span>
                <span class="chip">온음표 하나씩</span>
              </div>
            </header>

            <section class="card" aria-labelledby="slots-title">
              <div class="card-head">
                <h2 id="slots-title">오선에 놓기</h2>
                <span class="muted small">오선을 누르면 그 자리에 놓여요. 단추로 한 칸씩 옮길 수 있어요.</span>
              </div>
              <ol class="slot-grid">
                {slots.map((slot) => {
                  const position = controller.slotPosition(slot);
                  const { status, message } = slotStatusOf(controller, slot);
                  const isSelected = selected === slot.slot;
                  const readoutId = `slot-readout-${slot.slotId}`;
                  return (
                    <li key={slot.slotId} class={`slot-card${isSelected ? ' is-selected' : ''}${status === 'error' ? ' has-error' : ''}${sounding === slot.slot ? ' is-sounding' : ''}`} data-slot={slot.slotId}>
                      <div class="slot-head">
                        <h3>{slot.label}</h3>
                        {sounding === slot.slot ? (
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
                      <StaffSurface controller={controller} slot={slot} status={status} describedBy={readoutId} />
                      <p class="slot-readout" id={readoutId} data-position={position ?? ''}>
                        {position === null ? '아직 놓지 않았어요. 오선을 눌러 보세요.' : `놓은 자리: ${describeStaffPosition(position)}`}
                      </p>
                      {message ? <p class="slot-message">{message}</p> : null}
                      <div class="slot-controls" role="group" aria-label={`${slot.label}의 음 옮기기`}>
                        <button type="button" class="btn btn-quiet" onClick={() => controller.moveOnStaff(slot, 1)} aria-label={`${slot.label}: 한 칸 위로`}>
                          <Icon name="up" /> 한 칸 위로
                        </button>
                        <button type="button" class="btn btn-quiet" onClick={() => controller.moveOnStaff(slot, -1)} aria-label={`${slot.label}: 한 칸 아래로`}>
                          <Icon name="down" /> 한 칸 아래로
                        </button>
                        <button type="button" class="btn btn-quiet" onClick={() => controller.clearStaffSlot(slot)} disabled={position === null} aria-label={`${slot.label}: 음 지우기`}>
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
                    <Icon name="check" /> <strong>통과했어요.</strong> {staffPassedText(slots)}
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
                    {staffIdleText(placedCount, slots)} 확인하기 전에는 맞고 틀림을 알려 주지 않아요.
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <div class="panel-side">
            <AssistPanel>
              <Toggle
                id="aid-ledger"
                label="덧줄 보기"
                checked={aids.ledger}
                onChange={(on) => controller.setLedger(on)}
                hint="보표 밖에 덧줄이 놓일 자리를 점선으로 보여 줘요"
              />

              <h3 class="assist-sub">듣고 비교하기</h3>
              <div class="listen-buttons">
                <button type="button" class="btn btn-primary btn-wide" onClick={() => controller.playPlacedNotes()} aria-pressed={playing === 'mine'}>
                  <Icon name="play" /> {staffListenLabel(slots)}
                </button>
                <div class="listen-row">
                  <button type="button" class="btn btn-quiet" onClick={() => controller.stopPlayback()} disabled={playing === null}>
                    <Icon name="stop" /> 정지
                  </button>
                </div>
              </div>
              {!controller.soundAudible ? <p class="hint" id="sound-off-hint">{SOUND_OFF_HINT}</p> : null}
              {controller.notice ? (
                <p class="hint hint-notice" role="status">
                  {controller.notice}
                </p>
              ) : null}

              <button type="button" class="btn btn-check btn-wide" onClick={() => controller.check()}>
                배치 확인
              </button>
              {controller.inAssist ? (
                <p class="return-note">
                  <strong>통과하지 않아도 돌아갈 수 있어요.</strong>
                  <span>기본 연습 결과는 원곡의 완료로 합산하지 않아요.</span>
                </p>
              ) : null}
            </AssistPanel>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
