// 잔치 카드(설계서 6.4, 7.5 '잔치' 상태): 합주 무대의 '잔치 열기'를 고르면 무대 위쪽이 아니라 화면 아래에 작게 뜬다. 악사들이 선 무대가 가려지지 않도록
// 뒤를 어둡게 하지 않는다. 떠 있는 동안 월드는 멈추고 뒤의 화면은 눌리지 않는다(이동 키는 아무 일도 하지 않는다).
//  - 합주가 울리는 중: 무엇이 일어나는지, 무대에 선 악사(모양만이 아니라 글로도), 소리가 꺼져 있으면 조용히 흐른다는 말과 '소리 켜기'. 단추는 '건너뛰기'.
//  - 끝난 뒤(저장한 곡이 있을 때만): 곡 수와 함께 내 곡을 이어서 들을지 묻는다. '내 곡 듣기', '닫기'.
//  - 내 곡을 듣는 중: '멈추기'.
// Esc는 그 단계의 '건너뛰기', '닫기', '멈추기'와 같다(정지, 닫기, 뒤로 가기는 어느 상태에서나 닿는다). 판정도 점수도 없다(W-5).
import { useEffect, useRef } from 'preact/hooks';
import { FESTIVAL_SILENT_TEXT, FESTIVAL_SONGS_TEXT, FESTIVAL_START_TEXT, FESTIVAL_TITLE, festivalAskText, musiciansText } from '../../domain/festival';
import type { MusicianPart } from '../../domain/festival';
import type { ChallengeController } from '../challenge/controller';
import { useController } from '../common/hooks';
import { SoundControl } from '../common/SoundControl';

/** 화면이 잔치에서 읽는 것(app의 Festival.state가 이 모양을 품는다) */
export type FestivalView =
  | { phase: 'idle' }
  /** 합주가 울리는 중(소리를 켜지 않았으면 조용히 흐른다) */
  | { phase: 'playing'; musicians: readonly MusicianPart[] }
  /** 끝났다. 저장한 곡이 있어서 이어서 들을지 묻는 중 */
  | { phase: 'asking'; songs: number }
  /** 내 곡을 차례로 들려 주는 중 */
  | { phase: 'songs'; songs: number };

export type OpenFestivalView = Exclude<FestivalView, { phase: 'idle' }>;

export interface FestivalCardProps {
  view: OpenFestivalView;
  /** '소리 켜기'와 소리 상태를 보여 주는 데 쓴다 */
  controller: ChallengeController;
  /** 합주를 건너뛴다(끝으로 가지 않고 닫는다) */
  onSkip: () => void;
  /** 끝난 뒤의 물음에 답한다. true면 내 곡을 이어서 듣는다 */
  onAnswer: (listen: boolean) => void;
  /** 내 곡 듣기를 멈춘다 */
  onStopSongs: () => void;
}

export function FestivalCard({ view, controller, onSkip, onAnswer, onStopSongs }: FestivalCardProps) {
  useController(controller);
  const primary = useRef<HTMLButtonElement>(null);
  // 단계가 바뀔 때마다 그 단계의 주 단추로 초점을 옮긴다(이전 단추는 사라진다). 낭독기는 카드의 이름과 설명을 함께 읽는다
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [view.phase]);
  // Esc: 그 단계에서 나가는 단추와 같다. 카드가 떠 있는 동안만 듣는다
  const latest = useRef({ view, onSkip, onAnswer, onStopSongs });
  latest.current = { view, onSkip, onAnswer, onStopSongs };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      const cur = latest.current;
      if (cur.view.phase === 'playing') cur.onSkip();
      else if (cur.view.phase === 'asking') cur.onAnswer(false);
      else cur.onStopSongs();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const text = view.phase === 'playing' ? FESTIVAL_START_TEXT : view.phase === 'asking' ? festivalAskText(view.songs) : FESTIVAL_SONGS_TEXT;
  const silent = view.phase === 'playing' && !controller.soundAudible;
  return (
    <div class="festival-shell" data-festival-shell>
      <section class="festival-card" role="dialog" aria-modal="true" aria-labelledby="festival-title" aria-describedby="festival-text" data-festival={view.phase}>
        {view.phase === 'playing' && view.musicians.length > 0 ? (
          <div class="festival-portraits" aria-hidden="true">
            {view.musicians.map((part) => <img key={part} src={`/assets/remaster/characters/${part}-portrait.webp`} alt="" width="48" height="48" />)}
          </div>
        ) : null}
        <h2 id="festival-title" class="festival-title">
          {FESTIVAL_TITLE}
        </h2>
        <p id="festival-text" class="festival-text" data-festival-text>
          {text}
        </p>
        {view.phase === 'playing' && view.musicians.length > 0 ? (
          <p class="festival-musicians muted small" data-festival-musicians>
            {musiciansText(view.musicians)}
          </p>
        ) : null}
        {silent ? (
          <div class="festival-sound" data-festival-silent>
            <p class="festival-silent muted small">{FESTIVAL_SILENT_TEXT}</p>
            <SoundControl sound={controller.sound} onEnable={() => void controller.enableSound()} onToggleMute={() => controller.toggleMute()} />
          </div>
        ) : null}
        <div class="festival-actions">
          {view.phase === 'playing' ? (
            <button type="button" class="btn btn-primary btn-large" ref={primary} onClick={onSkip} data-festival-skip>
              건너뛰기
            </button>
          ) : null}
          {view.phase === 'asking' ? (
            <>
              <button type="button" class="btn btn-primary btn-large" ref={primary} onClick={() => onAnswer(true)} data-festival-listen>
                내 곡 듣기
              </button>
              <button type="button" class="btn btn-large" onClick={() => onAnswer(false)} data-festival-close>
                닫기
              </button>
            </>
          ) : null}
          {view.phase === 'songs' ? (
            <button type="button" class="btn btn-primary btn-large" ref={primary} onClick={onStopSongs} data-festival-stop>
              멈추기
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
