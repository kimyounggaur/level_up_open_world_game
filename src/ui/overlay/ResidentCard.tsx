// 주민(악사)의 한 줄 안내(설계서 1.5, 6.6, 12.10 7-6): 월드에서 주민에게 다가가 E나 누르기로 말을 걸면 마을 위에 작은 카드로 뜬다.
// 말은 한 줄뿐이다. 고르는 대화도 끝내야 하는 줄거리도 없고, 사실과 추천 이유만 말한다(W-9). 추천이면 그 도전을 바로 열 수 있다(막거나 경고하지 않는다).
// 떠 있는 동안 월드는 멈추고 뒤의 화면은 눌리지 않는다(쪽지 카드와 같다). Esc나 '닫기'로 닫는다. 판정도 기록도 없다.
import { useEffect, useRef } from 'preact/hooks';
import type { ResidentDef, ResidentSay } from '../../domain/residents';

export interface ResidentCardProps {
  resident: ResidentDef;
  say: ResidentSay;
  /** 추천한 도전을 열 수 있으면 그 주소와 이름. 사실만 말했거나 열 수 없으면 null(단추를 뺀다) */
  related: { href: string; title: string } | null;
  onClose: () => void;
}

export function ResidentCard({ resident, say, related, onClose }: ResidentCardProps) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  // Esc로 닫는다. 카드가 열려 있는 동안만 듣는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="intro-shell" data-resident-card={resident.residentId}>
      <section class="intro-card note-card" role="dialog" aria-modal="true" aria-labelledby="resident-card-title" aria-describedby="resident-card-line">
        <p class="muted small">주민</p>
        <h1 id="resident-card-title">{resident.name}</h1>
        <p id="resident-card-line" class="note-card-text" data-resident-line data-say={say.kind}>
          {say.text}
        </p>
        <div class="intro-actions">
          {related ? (
            <a class="btn btn-large" href={related.href} aria-label={`추천한 도전 열기: ${related.title}`} data-related>
              도전 열기
            </a>
          ) : null}
          <button type="button" class="btn btn-primary btn-large" ref={close} onClick={onClose}>
            닫기
          </button>
        </div>
      </section>
    </div>
  );
}
