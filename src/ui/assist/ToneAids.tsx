// 이름표·종·음정 화면의 '필요한 도움만': 느리게 듣기와, 화면마다 다른 듣기 단추. 확인 단추와 돌아가는 안내는 다른 패널과 같다.
import type { ComponentChildren } from 'preact';
import { tempoText } from '../common/format';
import { useController } from '../common/hooks';
import { Icon } from '../common/Icon';
import { Toggle } from '../common/Toggle';
import { SOUND_OFF_HINT } from '../challenge/controller';
import type { ChallengeController } from '../challenge/controller';
import { AssistPanel } from './ListeningAids';

export interface ToneAidsProps {
  controller: ChallengeController;
  onCheck: () => void;
  /** 이 화면의 듣기 단추들. 정지 단추는 이 부품이 둔다 */
  children: ComponentChildren;
}

export function ToneAids({ controller, onCheck, children }: ToneAidsProps) {
  useController(controller);
  const cur = controller.current!;
  const tempo = controller.tempo();
  const aids = controller.aids;
  const reference = cur.def.score.tempoReference;
  return (
    <AssistPanel>
      <Toggle
        id="aid-slow"
        label="느리게 듣기"
        checked={aids.slow}
        onChange={(on) => controller.setSlow(on)}
        detail={
          <>
            <strong class="tempo-now">현재: {tempoText(reference, tempo.effective)}</strong>
            <span class="tempo-original">원래 도전: {tempoText(reference, tempo.original)}</span>
          </>
        }
      />

      <h3 class="assist-sub">듣고 비교하기</h3>
      <div class="listen-buttons">
        {children}
        <div class="listen-row">
          <button type="button" class="btn btn-quiet" onClick={() => controller.stopPlayback()} disabled={controller.playing === null}>
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

      <button type="button" class="btn btn-check btn-wide" onClick={onCheck}>
        배치 확인
      </button>
      {controller.inAssist ? (
        <p class="return-note">
          <strong>통과하지 않아도 돌아갈 수 있어요.</strong>
          <span>기본 연습 결과는 원곡의 완료로 합산하지 않아요.</span>
        </p>
      ) : null}
    </AssistPanel>
  );
}
