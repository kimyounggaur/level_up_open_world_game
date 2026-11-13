// 개념 쪽지(3.6): 월드에서 쪽지에 다가가 E나 누르기로 열면 마을 위에 작은 카드로 뜬다. 짧은 설명 글을 읽고, 이어진 도전을 열 수 있으면 열 수 있다.
// 찾으면 수첩의 '발견' 쪽에 적히므로(앱이 적는다) 여기서는 읽기만 한다. 첫 안내 카드(IntroCard)처럼 떠 있는 동안 월드는 멈추고 뒤의 화면은 눌리지 않는다.
// Esc나 '닫기'로 닫는다. 판정도 점수도 없다(W-5).
import { useEffect, useRef } from 'preact/hooks';
import type { ConceptNoteDef } from '../../domain/discovery';
import { DraftChip } from '../notebook/NotebookPages';

export interface NoteCardProps {
  note: ConceptNoteDef;
  /** 이 쪽지가 이어 주는 도전을 열 수 있으면 그 주소와 이름. 열 수 없으면 null(단추를 뺀다) */
  related: { href: string; title: string } | null;
  onClose: () => void;
}

export function NoteCard({ note, related, onClose }: NoteCardProps) {
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
    <div class="intro-shell" data-note-card={note.discoveryId}>
      <section class="intro-card note-card" role="dialog" aria-modal="true" aria-labelledby="note-card-title">
        <p class="muted small">개념 쪽지</p>
        <h1 id="note-card-title">
          {note.name} <DraftChip item={note} />
        </h1>
        <p class="note-card-text">{note.text}</p>
        <p class="muted small">수첩의 '발견' 쪽에 적었어요.</p>
        <div class="intro-actions">
          {related ? (
            <a class="btn btn-large" href={related.href} aria-label={`이어진 도전 열기: ${related.title}`} data-related>
              이어진 도전 열기
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
