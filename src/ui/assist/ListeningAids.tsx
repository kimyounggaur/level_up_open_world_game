// '필요한 도움만': 느리게 듣기, 고른 박 반복, 박 수 표시와 듣고 비교하기. 각각 따로 켜고 끈다(시안 B02).
// 이 도움들은 도전 설정(원래 템포)을 바꾸지 않는다. 쓴 사실은 통과 기록에 남는다(7.6).
import type { ComponentChildren } from 'preact';
import { tempoText } from '../common/format';
import { useController } from '../common/hooks';
import { Icon } from '../common/Icon';
import { Toggle } from '../common/Toggle';
import { SOUND_OFF_HINT } from '../challenge/controller';
import type { ChallengeController } from '../challenge/controller';

export function AssistPanel({ children }: { children: ComponentChildren }) {
  return (
    <aside class="assist-panel" aria-labelledby="assist-title">
      <h2 id="assist-title">필요한 도움만</h2>
      <p class="muted">각 도움을 따로 켜고 끌 수 있어요.</p>
      {children}
    </aside>
  );
}

export interface ListeningAidsProps {
  controller: ChallengeController;
  /** 오른쪽 아래에 놓는 확인 단추 */
  onCheck: () => void;
  /** 고른 박 반복과 박 수 표시는 박 칸이 있는 리듬 과제의 도움이다. 음계 패널처럼 박 칸이 없으면 false */
  beatAids?: boolean;
  /** 박 수 표시를 쓰는가. 기본은 박 도움과 같다. 곡 패널(Q08)은 박 수 표시는 없고 마디 반복만 쓴다 */
  countAid?: boolean;
  /** 느리게·반복 도움 아래, 듣고 비교하기 위에 끼워 넣는 도움(예: 곡 패널의 듣기 범위) */
  children?: ComponentChildren;
}

export function ListeningAids({ controller, onCheck, beatAids = true, countAid = beatAids, children }: ListeningAidsProps) {
  useController(controller);
  const cur = controller.current!;
  const tempo = controller.tempo();
  const aids = controller.aids;
  const reference = cur.def.score.tempoReference;
  const hasCell = controller.selectedCell() !== null;
  const playing = controller.playing;
  // 자유 가락은 판정하지 않는다: 들을 목표도 확인할 것도 없다(4.9)
  const free = controller.isFree;
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
      {beatAids ? (
        <>
          <Toggle
            id="aid-repeat"
            label={controller.repeatLabel()}
            checked={aids.repeat}
            onChange={(on) => controller.setRepeat(on)}
            disabled={!hasCell}
            hint={hasCell ? undefined : controller.isArrangement ? '마디를 고르면 켤 수 있어요' : '박 칸을 고르면 켤 수 있어요'}
          />
          {countAid ? <Toggle id="aid-count" label="박 수 표시" checked={aids.showCount} onChange={(on) => controller.setShowCount(on)} /> : null}
        </>
      ) : null}
      {children}

      <h3 class="assist-sub">{free ? '들어 보기' : '듣고 비교하기'}</h3>
      <div class="listen-buttons">
        <button type="button" class="btn btn-primary btn-wide" onClick={() => controller.playMine()} aria-pressed={playing === 'mine'}>
          <Icon name="play" /> {free ? '내 가락 듣기' : '내 배치 듣기'}
        </button>
        <div class="listen-row">
          {free ? null : (
            <button type="button" class="btn btn-quiet" onClick={() => controller.playTarget()} aria-pressed={playing === 'target'}>
              <Icon name="play" /> 목표 듣기
            </button>
          )}
          <button type="button" class="btn btn-quiet" onClick={() => controller.stopPlayback()} disabled={playing === null && !controller.previewing}>
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

      {free ? null : (
        <button type="button" class="btn btn-check btn-wide" onClick={onCheck}>
          배치 확인
        </button>
      )}
      {controller.inAssist ? (
        <p class="return-note">
          <strong>통과하지 않아도 돌아갈 수 있어요.</strong>
          <span>기본 연습 결과는 원곡의 완료로 합산하지 않아요.</span>
        </p>
      ) : null}
    </AssistPanel>
  );
}
