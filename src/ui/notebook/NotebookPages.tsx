// 수첩의 '발견' 쪽과 '내 곡' 쪽(6.5). 지역 쪽과 관찰 쪽은 Notebook.tsx가 맡는다.
// 발견: 찾은 것은 이름과 다시 듣기(쪽지는 설명 글과 이어진 도전), 못 찾은 것은 빈칸만. 어디에 있는지도, 몇 개 남았는지도 말하지 않는다(3.6, 6.7).
// 내 곡: 저장한 자유 가락의 다시 듣기, 이름 바꾸기, 지우기. 지우기는 사람이 여기서만 하고, 한 번 더 확인한다(W-6의 '사라지지 않음'은 앱이 알아서 지우지 않는다는 뜻이다).
// 끌지 않아도 모두 된다(W-4). 쪽을 떠나거나 수첩을 닫으면 듣던 소리는 멈춘다.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ContentCatalog, STATE_LABEL_KO, isSelectable } from '../../domain/catalog';
import { CREATION_NAME_MAX, describeCreation } from '../../domain/creation';
import type { Creation } from '../../domain/creation';
import { describePiece, isConceptNote, isSoundPiece } from '../../domain/discovery';
import type { ConceptNoteDef, DiscoveryDef, SoundPieceDef } from '../../domain/discovery';
import { fillTemplate } from '../../domain/feedback';
import type { ChallengeController } from '../challenge/controller';
import { pieceKey, songKey } from '../challenge/melody';
import type { FreeMelody } from '../challenge/melody';
import { useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';

/** 쪽이 사라질 때(쪽을 넘기거나 수첩을 닫을 때) 듣던 소리를 멈춘다. 들어올 때 다른 곳에서 듣던 것도 멈춘다 */
function useStopOnLeave(melody: FreeMelody): void {
  useEffect(() => {
    melody.stopPreview();
    return () => melody.stopPreview();
  }, [melody]);
}

/** 듣기 단추: 듣는 중이면 같은 단추가 정지가 된다. 이름이 바뀌므로 눌림 상태(aria-pressed)는 따로 달지 않는다 */
function ReplayButton({ id, name, on, onToggle }: { id: string; name: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" class="btn" data-replay={id} data-playing={on ? 'true' : 'false'} aria-label={`${name} ${on ? '정지' : '듣기'}`} onClick={onToggle}>
      <Icon name={on ? 'stop' : 'play'} /> {on ? '정지' : '듣기'}
    </button>
  );
}

/** 검수를 마치지 않은 것의 표지. 미리보기 채널에서만 이런 것이 보인다(과제 목록과 같은 말, W-10) */
export function DraftChip({ item }: { item: DiscoveryDef }) {
  return item.availability === 'draft' ? <span class="chip chip-state is-unreviewed">{STATE_LABEL_KO.unreviewed}</span> : null;
}

/** 쪽지가 이어 주는 도전을 열 수 있으면 그 주소와 이름. 열 수 없으면 null(없는 것처럼 두지 않고 단추만 뺀다) */
export function relatedQuest(catalog: ContentCatalog, panels: ReadonlySet<string> | undefined, questId: string): { href: string; title: string } | null {
  const entry = catalog.get(questId);
  if (!entry) return null;
  const variant = entry.variants.find((v) => isSelectable(v.state) && (!panels || v.panelIds.some((id) => panels.has(id))));
  return variant ? { href: ContentCatalog.hashFor(questId, variant.variantId), title: entry.title } : null;
}

/** 못 찾은 것의 자리. 이름도 위치도 힌트도 없다 */
function EmptySlot() {
  return (
    <li class="nb-slot" data-found="false" data-discovery-slot>
      <span class="nb-slot-mark" aria-hidden="true">
        ○
      </span>
      <span class="muted">비어 있어요</span>
    </li>
  );
}

function FoundPiece({ piece, melody, on }: { piece: SoundPieceDef; melody: FreeMelody; on: boolean }) {
  return (
    <li class="nb-found" data-found="true" data-discovery={piece.discoveryId}>
      <div class="nb-found-text">
        <strong>{piece.name}</strong> <span class="muted small">{describePiece(piece)}</span> <DraftChip item={piece} />
      </div>
      <ReplayButton id={piece.discoveryId} name={piece.name} on={on} onToggle={() => (on ? melody.stopPreview() : void melody.previewPiece(piece.discoveryId))} />
    </li>
  );
}

function FoundNote({ note, link }: { note: ConceptNoteDef; link: { href: string; title: string } | null }) {
  return (
    <li class="nb-found nb-note" data-found="true" data-discovery={note.discoveryId}>
      <div class="nb-found-text">
        <h4 class="nb-note-name">
          {note.name} <DraftChip item={note} />
        </h4>
        <p class="nb-note-text">{note.text}</p>
      </div>
      {link ? (
        <a class="btn" href={link.href} aria-label={`이어진 도전 열기: ${link.title}`} data-related>
          이어진 도전 열기
        </a>
      ) : null}
    </li>
  );
}

export interface DiscoveriesPageProps {
  /** 이 채널에서 보이는 발견 요소(id 순서) */
  discoveries: readonly DiscoveryDef[];
  melody: FreeMelody;
  /** 듣기가 끝나면 단추가 다시 그려지게 한다 */
  controller: ChallengeController;
  catalog: ContentCatalog;
  panels?: ReadonlySet<string> | undefined;
}

export function DiscoveriesPage({ discoveries, melody, controller, catalog, panels }: DiscoveriesPageProps) {
  const found = useStore(melody.found);
  useController(controller);
  useStopOnLeave(melody);
  const listening = melody.listening();
  const pieces = discoveries.filter(isSoundPiece);
  const notes = discoveries.filter(isConceptNote);
  return (
    <>
      <h2>발견</h2>
      <p class="muted nb-lead">걷다가 찾은 것은 이름과 다시 듣기가 여기에 적혀요. 아직 찾지 못한 것은 빈칸으로만 남아요.</p>
      {discoveries.length === 0 ? (
        <p class="empty-note" data-empty>
          이 판에는 숨어 있는 것이 아직 들어 있지 않아요.
        </p>
      ) : (
        <>
          {pieces.length > 0 ? (
            <section class="nb-group" aria-labelledby="nb-pieces-title" data-group="pieces">
              <h3 id="nb-pieces-title">소리 조각</h3>
              <ul class="nb-found-list">
                {pieces.map((p) => (found.has(p.discoveryId) ? <FoundPiece key={p.discoveryId} piece={p} melody={melody} on={listening === pieceKey(p.discoveryId)} /> : <EmptySlot key={p.discoveryId} />))}
              </ul>
            </section>
          ) : null}
          {notes.length > 0 ? (
            <section class="nb-group" aria-labelledby="nb-notes-title" data-group="notes">
              <h3 id="nb-notes-title">개념 쪽지</h3>
              <ul class="nb-found-list">
                {notes.map((n) => (found.has(n.discoveryId) ? <FoundNote key={n.discoveryId} note={n} link={relatedQuest(catalog, panels, n.questId)} /> : <EmptySlot key={n.discoveryId} />))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

/** 이름 바꾸기 칸. 열리면 바로 글자를 쓸 수 있게 초점을 받는다. Esc는 그만두기다(수첩이 닫히지 않게 여기서 멈춘다) */
function RenameForm({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      class="nb-rename"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
      }}
    >
      <label class="melody-name">
        <span class="melody-name-label">새 이름</span>
        <input
          ref={input}
          type="text"
          class="melody-name-input"
          value={draft}
          maxLength={CREATION_NAME_MAX}
          autoComplete="off"
          onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
        />
      </label>
      <div class="nb-actions">
        <button type="submit" class="btn btn-primary" data-rename-save>
          이름 저장
        </button>
        <button type="button" class="btn" data-rename-cancel onClick={onCancel}>
          그만두기
        </button>
      </div>
    </form>
  );
}

export interface CreationsPageProps {
  melody: FreeMelody;
  controller: ChallengeController;
}

export function CreationsPage({ melody, controller }: CreationsPageProps) {
  const all = useStore(melody.creations);
  useController(controller);
  useStopOnLeave(melody);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const moveFocus = useRef(false);
  const focusTo = useRef<{ id: string; button: 'rename' | 'delete' | 'confirm-cancel' } | null>(null);
  // 단추를 누르면 그 단추가 사라지고 다른 칸이 나온다. 초점이 문서 처음으로 날아가지 않게 옮겨 준다:
  // 이름을 바꾸거나 곡을 지우면 결과를 알리는 글로(화면 낭독기가 이어 읽는다), 지우기를 누르면 확인 상자의 '그만두기'로(되돌릴 수 없는 일의 기본은 안전한 쪽),
  // 이름 바꾸기나 지우기를 그만두면 처음 눌렀던 단추로 돌아간다
  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      statusRef.current?.focus();
    }
    const want = focusTo.current;
    if (want) {
      focusTo.current = null;
      const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-creation]') ?? []).find((li) => li.getAttribute('data-creation') === want.id);
      row?.querySelector<HTMLElement>(want.button === 'rename' ? '[data-rename]' : want.button === 'delete' ? '[data-delete]' : '[data-confirm-cancel]')?.focus();
    }
  });
  const listening = melody.listening();
  // 가장 최근에 저장한 곡이 위에 온다(무대의 표지판과 같다)
  const list = [...all].reverse();

  const say = (ok: boolean, text: string, focus: boolean): void => {
    moveFocus.current = focus;
    setStatus({ ok, text });
  };
  const submitRename = (c: Creation, name: string): void => {
    const r = melody.rename(c.creationId, name);
    if (!r.ok) {
      say(false, r.message, false);
      return;
    }
    const now = r.creations.find((x) => x.creationId === c.creationId)?.name ?? name;
    setRenaming(null);
    say(true, fillTemplate('이름을 {name:으로로} 바꿨어요.', { name: now }), true);
  };
  const doDelete = (c: Creation): void => {
    setConfirming(null);
    if (melody.remove(c.creationId)) say(true, fillTemplate('{name:을를} 지웠어요.', { name: c.name }), true);
  };

  return (
    <>
      <h2>내 곡</h2>
      <p class="muted nb-lead">자유롭게 만들어 저장한 곡이 여기에 적혀요. 다시 듣고, 이름을 바꾸고, 지울 수 있어요.</p>
      {status ? (
        <p ref={statusRef} tabIndex={-1} class={`hint${status.ok ? '' : ' hint-notice'}`} role="status" data-creation-status={status.ok ? 'ok' : 'error'}>
          <Icon name={status.ok ? 'check' : 'alert'} />
          {status.text}
        </p>
      ) : null}
      {list.length === 0 ? (
        <p class="empty-note" data-empty>
          저장한 곡이 아직 없어요. 합주 무대에서 자유 가락을 만들어 저장하면 여기에 적혀요.
        </p>
      ) : (
        <ul class="quest-list nb-creations" ref={listRef}>
          {list.map((c) => {
            const on = listening === songKey(c.creationId);
            return (
              <li class="quest-card nb-creation" key={c.creationId} data-creation={c.creationId}>
                <div class="quest-card-head">
                  <h3>{c.name}</h3>
                  <span class="muted small">{describeCreation(c)}</span>
                </div>
                {renaming === c.creationId ? (
                  <RenameForm
                    initial={c.name}
                    onSubmit={(name) => submitRename(c, name)}
                    onCancel={() => {
                      focusTo.current = { id: c.creationId, button: 'rename' };
                      setRenaming(null);
                    }}
                  />
                ) : confirming === c.creationId ? (
                  <div class="nb-confirm" role="group" aria-label={`${c.name} 지우기 확인`}>
                    <p id={`nb-confirm-${c.creationId}`}>{fillTemplate('{name:을를} 지울까요? 광장 게시판에서도 사라지고 되돌릴 수 없어요.', { name: c.name })}</p>
                    <div class="nb-actions">
                      <button type="button" class="btn btn-primary" data-confirm-delete onClick={() => doDelete(c)}>
                        지우기
                      </button>
                      <button
                        type="button"
                        class="btn"
                        data-confirm-cancel
                        aria-describedby={`nb-confirm-${c.creationId}`}
                        onClick={() => {
                          focusTo.current = { id: c.creationId, button: 'delete' };
                          setConfirming(null);
                        }}
                      >
                        그만두기
                      </button>
                    </div>
                  </div>
                ) : (
                  <div class="nb-actions">
                    <ReplayButton id={c.creationId} name={c.name} on={on} onToggle={() => (on ? melody.stopPreview() : void melody.replay(c.creationId))} />
                    <button
                      type="button"
                      class="btn"
                      data-rename
                      aria-label={`${c.name} 이름 바꾸기`}
                      onClick={() => {
                        setConfirming(null);
                        setStatus(null);
                        setRenaming(c.creationId);
                      }}
                    >
                      이름 바꾸기
                    </button>
                    <button
                      type="button"
                      class="btn"
                      data-delete
                      aria-label={`${c.name} 지우기`}
                      onClick={() => {
                        setRenaming(null);
                        setStatus(null);
                        focusTo.current = { id: c.creationId, button: 'confirm-cancel' };
                        setConfirming(c.creationId);
                      }}
                    >
                      지우기
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
