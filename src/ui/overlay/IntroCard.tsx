// 첫 화면(1.6): 조작 안내 세 줄(걷기, 다가가서 E, 지도는 M)과 '시작', '전체 도전 보기', '소리 켜기'.
// 가입이나 진단 시험은 없고, 무엇을 먼저 하라고 시키지 않는다. Esc나 '시작'으로 건너뛸 수 있고, 설정에서 다시 볼 수 있다(7.8).
// 카드가 떠 있는 동안 월드는 멈춰 있고(앱이 멈춘다), 뒤의 화면은 눌리지 않는다.
import { useEffect, useRef } from 'preact/hooks';
import type { ChallengeController } from '../challenge/controller';
import { useController } from '../common/hooks';
import { Icon } from '../common/Icon';
import { SoundControl } from '../common/SoundControl';

export interface IntroCardProps {
  controller: ChallengeController;
  /** 키보드가 없는 터치 화면인가: 키 이름 대신 누르기로 말한다 */
  touchOnly: boolean;
  /** '시작'이나 Esc: 안내를 닫고 걷기 시작한다 */
  onStart: () => void;
  /** '전체 도전 보기': 안내를 닫고 목록으로 간다 */
  onList: () => void;
}

export interface IntroLine {
  head: string;
  text: string;
}

/** 조작 안내 세 줄. 한 줄에 한 가지만 말한다(7.6) */
export function introLines(touchOnly: boolean): IntroLine[] {
  return touchOnly
    ? [
        { head: '걷기', text: '가고 싶은 곳을 누르면 걸어가요.' },
        { head: '열기', text: '작업대에 다가가면 나오는 이름을 눌러요.' },
        { head: '지도', text: '위의 지도 단추로 마을 전체를 봐요.' },
      ]
    : [
        { head: '걷기', text: '방향키나 W A S D로 걸어요. 가고 싶은 곳을 눌러도 돼요.' },
        { head: '열기', text: '작업대에 다가가서 E를 눌러요.' },
        { head: '지도', text: 'M을 누르면 마을 전체가 보여요.' },
      ];
}

export function IntroCard({ controller, touchOnly, onStart, onList }: IntroCardProps) {
  useController(controller);
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    start.current?.focus({ preventScroll: true });
  }, []);
  // Esc로 건너뛴다. 카드가 열려 있는 동안만 듣는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onStart();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onStart]);
  const lines = introLines(touchOnly);
  return (
    <div class="intro-shell" data-intro>
      <section class="intro-card intro-welcome" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div class="intro-landscape" aria-hidden="true">
          <img src="/assets/remaster/frottage/backgrounds/webp/bg-village.webp" alt="" width="1536" height="1024" fetchPriority="high" />
          <img class="intro-player-portrait" src="/assets/remaster/characters/player-portrait.webp" alt="" width="112" height="112" />
        </div>
        <p class="intro-eyebrow">레벨업 음악이론 오픈월드</p>
        <h1 id="intro-title">음악 마을</h1>
        <p class="subtitle">걸어 다니며 음악 이론을 만져 보는 마을이에요.</p>
        <ol class="intro-steps">
          {lines.map((l) => (
            <li key={l.head}>
              <strong class="intro-head">{l.head}</strong>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
        <div class="intro-actions">
          <button type="button" class="btn btn-primary btn-large" ref={start} onClick={onStart}>
            시작 <Icon name="arrow-right" />
          </button>
          <button type="button" class="btn btn-large" onClick={onList}>
            <Icon name="list" /> 전체 도전 보기
          </button>
        </div>
        <SoundControl sound={controller.sound} onEnable={() => void controller.enableSound()} onToggleMute={() => controller.toggleMute()} />
        <p class="muted small">Esc나 '시작'으로 건너뛸 수 있어요. 설정에서 다시 볼 수 있어요.</p>
      </section>
    </div>
  );
}
