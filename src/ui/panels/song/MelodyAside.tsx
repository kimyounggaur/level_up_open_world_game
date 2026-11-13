// 곡 패널의 자유 가락(4.9) 쪽 도구: 내 곡으로 저장하기, 찾은 소리 조각 재료함.
// 자유 가락은 판정하지 않는다. 저장하면 내 곡이 되어 광장 게시판에 걸리고 무대에서 다시 들을 수 있다(6.1 '만듦').
import { useState } from 'preact/hooks';
import { CREATION_NAME_MAX } from '../../../domain/creation';
import { fillTemplate } from '../../../domain/feedback';
import type { FreeMelody } from '../../challenge/melody';
import { useStore } from '../../common/hooks';
import { Icon } from '../../common/Icon';

/** 이름을 붙여 저장하기. 이름을 비우면 '내 곡 N'이다 */
export function MelodySave({ melody }: { melody: FreeMelody }) {
  useStore(melody.creations);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const suggested = melody.suggestedName();

  const save = (): void => {
    const r = melody.save(name);
    setStatus({ ok: r.ok, text: r.message });
    if (r.ok) setName('');
  };

  return (
    <aside class="assist-panel melody-save" aria-labelledby="melody-save-title" data-melody-save>
      <h2 id="melody-save-title">내 곡으로 저장</h2>
      <p class="muted">이름을 붙여 저장하면 광장 게시판에 걸리고, 무대에서 다시 들을 수 있어요. 저장한 곡은 수첩에서 이름을 바꾸거나 지울 수 있어요.</p>
      <label class="melody-name">
        <span class="melody-name-label">곡 이름</span>
        <input
          type="text"
          class="melody-name-input"
          value={name}
          maxLength={CREATION_NAME_MAX}
          placeholder={suggested}
          autoComplete="off"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.isComposing) {
              e.preventDefault();
              save();
            }
          }}
        />
      </label>
      <p class="muted small">비워 두면 '{suggested}'로 저장돼요. 이름은 {CREATION_NAME_MAX}글자까지 적을 수 있어요.</p>
      <button type="button" class="btn btn-primary btn-wide" data-melody-save-button onClick={save}>
        <Icon name="check" /> 저장하기
      </button>
      {status ? (
        <p class={`hint${status.ok ? '' : ' hint-notice'}`} role="status" data-melody-status={status.ok ? 'ok' : 'error'}>
          <Icon name={status.ok ? 'check' : 'alert'} />
          {status.text}
        </p>
      ) : null}
    </aside>
  );
}

/** 찾은 소리 조각 재료함. 못 찾은 것은 올라오지 않는다: 어디에 있는지도 알려 주지 않는다(3.6) */
export function PieceTray({ melody, measureIndex }: { melody: FreeMelody; measureIndex: number }) {
  useStore(melody.found);
  const [note, setNote] = useState<string | null>(null);
  const pieces = melody.foundPieces();
  return (
    <aside class="assist-panel melody-pieces" aria-labelledby="melody-pieces-title" data-melody-pieces>
      <h2 id="melody-pieces-title">찾은 소리 조각</h2>
      {pieces.length === 0 ? (
        <p class="muted">마을을 걷다 보면 소리 조각을 찾을 수 있어요. 찾으면 여기에 모이고, 마디에 놓아 쓸 수 있어요.</p>
      ) : (
        <>
          <p class="muted">조각을 놓으면 {measureIndex + 1}마디의 음이 조각으로 바뀌어요. 실행 취소로 되돌릴 수 있어요.</p>
          <ul class="piece-list">
            {pieces.map((p) => (
              <li key={p.discoveryId} class="piece-item" data-piece={p.discoveryId}>
                <div class="piece-name">
                  <strong>{p.name}</strong> <span class="muted small">{p.notes}</span>
                </div>
                <div class="piece-actions">
                  <button type="button" class="btn btn-quiet" data-piece-hear={p.discoveryId} aria-label={`${p.name} 듣기`} onClick={() => void melody.previewPiece(p.discoveryId)}>
                    <Icon name="play" /> 듣기
                  </button>
                  <button
                    type="button"
                    class="btn btn-quiet"
                    data-piece-place={p.discoveryId}
                    aria-label={fillTemplate('{name:을를} {measure}마디에 놓기', { name: p.name, measure: measureIndex + 1 })}
                    onClick={() => setNote(melody.placePiece(p.discoveryId, measureIndex).message)}
                  >
                    {measureIndex + 1}마디에 놓기
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {note ? (
            <p class="hint" role="status" data-piece-note>
              {note}
            </p>
          ) : null}
        </>
      )}
    </aside>
  );
}
