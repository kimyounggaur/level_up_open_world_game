// 설정을 소리, 화면, 월드에 연결한다(설계서 7.8). 설정 저장소(Store)가 하나의 진실이고, 바뀔 때마다 아래 세 곳에 적용한다.
//   소리 크기 → 믹서, 글자 크기와 움직임 줄이기 → 문서 루트의 data 속성(tokens.css가 읽는다), 움직임 줄이기 → 월드(카메라 보간, 물결, 전환)
import type { Mixer } from '../audio/mixer';
import type { Settings } from '../domain/save/settings';
import type { Store } from '../platform/bridge';

/** 브라우저(운영체제)의 '움직임 줄이기' */
export const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 이 게임의 설정이나 브라우저의 설정 어느 한쪽이라도 켜져 있으면 줄인다 */
export const effectiveReducedMotion = (s: Pick<Settings, 'reducedMotion'>): boolean => s.reducedMotion || prefersReducedMotion();

export interface SettingsRoot {
  dataset: DOMStringMap;
}

export function applySettings(s: Settings, mixer: Pick<Mixer, 'setSettings'>, root: SettingsRoot | null): void {
  mixer.setSettings({ masterVolume: s.masterVolume, worldVolume: s.worldVolume, taskVolume: s.taskVolume, muteWorldDuringQuest: s.muteWorldDuringQuest });
  if (root) {
    root.dataset.textSize = s.textSize;
    root.dataset.reducedMotion = String(s.reducedMotion);
  }
}

/** 지금 값을 한 번 적용하고, 바뀔 때마다 적용한다. 돌려주는 함수를 부르면 멈춘다 */
export function bindSettings(settings: Store<Settings>, mixer: Pick<Mixer, 'setSettings'>, root: SettingsRoot | null): () => void {
  applySettings(settings.get(), mixer, root);
  return settings.subscribe((s) => applySettings(s, mixer, root));
}
