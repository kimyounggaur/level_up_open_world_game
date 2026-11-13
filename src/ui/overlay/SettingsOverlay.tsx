// 설정(7.8): 소리 크기(전체, 배경, 과제), 과제 중 배경 끄기, 글자 크기, 움직임 줄이기, 소리 물결 표시, 조작 안내 다시 보기,
// (저장 내보내기와 가져오기는 저장 구역, 관찰용 사용 기록은 사용 기록 구역, 받지 않는 것과 고지는 정보 구역으로 끼워 넣는다).
// 바꾸면 바로 적용된다: 설정 저장소가 하나의 진실이고, 앱이 소리, 글자, 월드, 소리 물결에 옮긴다(app/settings, app/App).
// 발견 위치 표시처럼 아직 기능이 없는 설정은 기능이 생기는 단계에서 이 화면에 들어온다(빈 스위치를 먼저 보이지 않는다).
import type { ComponentChildren } from 'preact';
import { TEXT_SIZES, TEXT_SIZE_LABEL_KO } from '../../domain/save/settings';
import type { Settings, TextSize } from '../../domain/save/settings';
import type { Store } from '../../platform/bridge';
import type { ChallengeController } from '../challenge/controller';
import { useController, useStore } from '../common/hooks';
import { SoundControl } from '../common/SoundControl';
import { Slider } from '../common/Slider';
import { Toggle } from '../common/Toggle';
import { Icon } from '../common/Icon';
import { OverlayFrame } from './OverlayFrame';

export interface SettingsOverlayProps {
  settings: Store<Settings>;
  controller: ChallengeController;
  /** 브라우저(운영체제)의 '움직임 줄이기'가 켜져 있는가 */
  browserReducedMotion: boolean;
  /** 첫 조작 안내를 다시 보인다 */
  onReplayIntro: () => void;
  /** 저장 내보내기와 가져오기 구역 */
  saveSection?: ComponentChildren;
  /** 사용 기록 구역(관찰용 행동 기록의 내보내기와 지우기) */
  usageSection?: ComponentChildren;
  /** 정보 구역(받지 않는 것, 오픈소스와 글꼴 고지) */
  aboutSection?: ComponentChildren;
}

export function SettingsOverlay({ settings, controller, browserReducedMotion, onReplayIntro, saveSection, usageSection, aboutSection }: SettingsOverlayProps) {
  useController(controller);
  const s = useStore(settings);
  const patch = (p: Partial<Settings>): void => settings.update((prev) => ({ ...prev, ...p }));
  return (
    <OverlayFrame title="설정" subtitle="소리, 글자, 움직임을 내게 맞춰요. 바꾸면 바로 적용돼요." testId="settings">
      <section class="settings-section" aria-labelledby="set-sound">
        <h2 id="set-sound">소리</h2>
        <p class="muted small settings-note">소리는 '소리 켜기'를 누른 뒤에만 나요. 소리를 끈 채로도 모두 할 수 있어요.</p>
        <SoundControl sound={controller.sound} onEnable={() => void controller.enableSound()} onToggleMute={() => controller.toggleMute()} />
        <Slider id="set-master" label="전체 소리 크기" value={s.masterVolume} onChange={(v) => patch({ masterVolume: v })} />
        <Slider id="set-world" label="배경 소리 크기" hint="마을의 합주와 정거장에서 나는 소리의 크기예요." value={s.worldVolume} onChange={(v) => patch({ worldVolume: v })} />
        <Slider id="set-task" label="과제 소리 크기" hint="악보를 들려 줄 때 나는 소리의 크기예요." value={s.taskVolume} onChange={(v) => patch({ taskVolume: v })} />
        <Toggle
          id="set-mute-world"
          label="과제 중 배경 끄기"
          hint="악보를 들려 주는 동안 배경 소리를 완전히 꺼요. 끄지 않으면 작아지기만 해요."
          checked={s.muteWorldDuringQuest}
          onChange={(v) => patch({ muteWorldDuringQuest: v })}
        />
      </section>

      <section class="settings-section" aria-labelledby="set-display">
        <h2 id="set-display">화면</h2>
        <div class="size-row" role="group" aria-labelledby="set-textsize-label">
          <div class="toggle-text">
            <span id="set-textsize-label" class="toggle-label">
              글자 크기
            </span>
            <span class="toggle-hint">'크게'는 글자를 1.25배로 키워요.</span>
          </div>
          <div class="size-choices">
            {TEXT_SIZES.map((t: TextSize) => (
              <button key={t} type="button" class={`chip chip-button${s.textSize === t ? ' is-selected' : ''}`} aria-pressed={s.textSize === t} data-text-size={t} onClick={() => patch({ textSize: t })}>
                {TEXT_SIZE_LABEL_KO[t]}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          id="set-reduce"
          label="움직임 줄이기"
          hint="화면이 따라 움직이는 것, 확대, 흔들림, 물결 연출을 없애요."
          checked={s.reducedMotion}
          onChange={(v) => patch({ reducedMotion: v })}
          detail={browserReducedMotion && !s.reducedMotion ? '지금은 브라우저의 움직임 줄이기 설정 때문에 줄여서 보여요.' : undefined}
        />
        <Toggle
          id="set-ripples"
          label="소리 물결 표시"
          hint="화면 밖 가까이에 정거장이나 소리 조각이 있으면 그쪽 가장자리에 물결을 그려요. 소리를 꺼도 방향을 알 수 있어요."
          checked={s.soundRipples}
          onChange={(v) => patch({ soundRipples: v })}
        />
        <Toggle
          id="set-discoveries"
          label="발견 위치 표시"
          hint="지도에 소리 조각과 개념 쪽지가 있는 자리를 모두 보여 줘요. 걷기가 어렵거나 찾지 않고 알고 싶을 때 켜세요. 이름은 찾은 것만 알려 줘요."
          checked={s.showDiscoveries}
          onChange={(v) => patch({ showDiscoveries: v })}
        />
      </section>

      <section class="settings-section" aria-labelledby="set-help">
        <h2 id="set-help">도움</h2>
        <div class="settings-actions">
          <button type="button" class="btn" onClick={onReplayIntro}>
            조작 안내 다시 보기
          </button>
          <a class="btn btn-quiet" href="#/help">
            도움말 열기 <Icon name="arrow-right" />
          </a>
        </div>
      </section>

      {saveSection}
      {usageSection}
      {aboutSection}
    </OverlayFrame>
  );
}
