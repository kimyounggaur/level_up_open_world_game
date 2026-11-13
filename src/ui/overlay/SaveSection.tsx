// 설정의 '저장' 구역(7.8, 10.6): 어디에 저장하는지, 마지막 저장, 파일로 내보내기와 가져오기.
// 브라우저 저장소는 지워질 수 있어서(10.6) 파일로 내보내 두는 길을 항상 열어 둔다. 가져오기는 바꾸기 전에 파일의 요약을 보이고 한 번 더 묻는다.
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseSaveText } from '../../domain/save/save';
import type { SaveData } from '../../domain/save/save';
import type { Store } from '../../platform/bridge';
import type { SaveStatus } from '../../platform/storage';
import { Icon } from '../common/Icon';
import { useStore } from '../common/hooks';

/** 저장 파일로 보기엔 너무 큰 파일은 읽지 않는다 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const savedAtText = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
};

/** 저장 상태에서 알려야 할 문제 한 줄(없으면 null). 설정 화면과 알림 띠가 함께 쓴다 */
export function saveProblem(s: SaveStatus): string | null {
  if (s.unreadable) {
    return s.keptUnread
      ? '저장된 내용을 읽을 수 없어 새로 시작했어요. 망가진 저장은 지우지 않고 따로 남겨 뒀어요.'
      : '저장된 내용을 읽을 수 없어 새로 시작했어요. 망가진 저장을 따로 남겨 두지는 못했어요.';
  }
  if (s.salvaged) return '저장이 일부 망가져 있어, 읽을 수 있는 것만 살려서 열었어요. 못 읽은 부분이 든 원본은 지우지 않고 따로 남겨 뒀어요.';
  if (s.recoveredFromPrevious) return '저장이 망가져 있어 직전 저장으로 열었어요. 가장 최근 작업이 조금 빠졌을 수 있어요.';
  if (s.volatile) return '이 브라우저에서는 저장소를 쓸 수 없어요. 창을 닫거나 새로 고치면 진행이 사라져요. 설정에서 저장을 파일로 내보내 두세요.';
  if (s.phase === 'failed' && s.problem) return s.problem;
  if (s.loadWarnings.length > 0) return '저장을 읽으면서 일부를 기본값으로 돌렸어요. 자세한 내용은 설정의 저장 구역에서 볼 수 있어요.';
  return null;
}

/** 화면에 늘어놓을 읽기 알림의 최대 수. 나머지는 개수만 알린다 */
export const MAX_SHOWN_WARNINGS = 8;

function backendText(s: SaveStatus): string {
  if (s.backend === 'indexeddb') return '진행은 이 기기의 브라우저에 저장돼요.';
  if (s.backend === 'localstorage') return '진행은 이 기기의 브라우저에 저장돼요(보조 저장소).';
  return '이 브라우저에서는 저장소를 쓸 수 없어요.';
}

function summarize(save: SaveData): string {
  const passed = new Set(save.attempts.filter((a) => a.resultType === 'passed').map((a) => `${a.questId}/${a.variantId}`)).size;
  return `${savedAtText(save.savedAt)}에 저장한 파일 · 통과한 도전 ${passed}개 · 열어 본 도전 ${save.explorationState.openedQuests.length}개`;
}

/** 파일 내용을 글자로 읽는다(File.text가 없는 환경은 FileReader로) */
function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('파일을 읽지 못했어요'));
    r.readAsText(file);
  });
}

/** 글자를 파일로 내려받게 한다 */
export function browserDownload(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ImportResult = { ok: true } | { ok: false; errors: string[] };

export interface SaveSectionProps {
  status: Store<SaveStatus>;
  /** 지금 상태를 파일로 만들 글자와 이름 */
  exportFile: () => { fileName: string; text: string };
  /** 파일 내용을 저장으로 가져온다. 성공하면 앱은 더 저장하지 않으므로 화면을 새로 불러와야 한다 */
  importText: (text: string) => Promise<ImportResult>;
  /** 가져오기가 끝났다: 화면을 새로 불러와 가져온 저장으로 다시 시작한다 */
  onImported: () => void;
  /** 읽지 못해 따로 둔 저장의 원본(없으면 null). 없으면 내려받기 버튼을 그리지 않는다 */
  exportUnread?: () => Promise<{ fileName: string; text: string } | null>;
  /** 내려받기. 시험에서는 가짜를 넣는다 */
  download?: (fileName: string, text: string) => void;
}

interface Note {
  kind: 'ok' | 'error';
  text: string;
  details?: string[];
}

export function SaveSection({ status, exportFile, importText, onImported, exportUnread, download = browserDownload }: SaveSectionProps) {
  const s = useStore(status);
  const picker = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [pending, setPending] = useState<{ fileName: string; text: string; summary: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 확인 단계가 뜨면 키보드 사용자가 곧바로 결정할 수 있게 초점을 옮긴다
  useEffect(() => {
    if (pending) confirmButton.current?.focus();
  }, [pending]);

  const doExport = (): void => {
    try {
      const f = exportFile();
      download(f.fileName, f.text);
      setNote({ kind: 'ok', text: `파일로 내보냈어요: ${f.fileName}` });
    } catch (e) {
      setNote({ kind: 'error', text: `내보내지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const doExportUnread = async (): Promise<void> => {
    if (!exportUnread) return;
    try {
      const f = await exportUnread();
      if (!f) {
        setNote({ kind: 'error', text: '따로 남겨 둔 저장을 찾지 못했어요.' });
        return;
      }
      download(f.fileName, f.text);
      setNote({ kind: 'ok', text: `읽지 못한 저장을 파일로 내려받았어요: ${f.fileName}` });
    } catch (e) {
      setNote({ kind: 'error', text: `내려받지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const onPick = async (e: Event): Promise<void> => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // 같은 파일을 다시 골라도 알리게 한다
    if (!file) return;
    setPending(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setNote({ kind: 'error', text: '이 파일은 저장 파일로 보기엔 너무 커요.' });
      return;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch {
      setNote({ kind: 'error', text: '파일을 읽지 못했어요.' });
      return;
    }
    const r = parseSaveText(text);
    if (!r.ok) {
      setNote({ kind: 'error', text: '이 파일은 가져올 수 없어요. 이 게임이 내보낸 저장 파일이 맞는지 확인해 주세요.', details: r.errors });
      return;
    }
    setNote(null);
    setPending({ fileName: file.name, text, summary: summarize(r.save) });
  };

  const confirm = async (): Promise<void> => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const r = await importText(pending.text);
      if (r.ok) {
        setPending(null);
        setNote({ kind: 'ok', text: '가져왔어요. 화면을 새로 불러와 시작해요.' });
        onImported();
      } else {
        setNote({ kind: 'error', text: '가져오지 못했어요. 지금 진행은 그대로예요.', details: r.errors });
      }
    } finally {
      setBusy(false);
    }
  };

  const problem = saveProblem(s);
  return (
    <section class="settings-section" aria-labelledby="set-save" data-save-phase={s.phase} data-save-backend={s.backend}>
      <h2 id="set-save">저장</h2>
      <p class="muted small settings-note">{backendText(s)} 브라우저가 저장소를 지우면 사라질 수 있으니, 가끔 파일로 내보내 두세요.</p>
      <p class="save-status" data-testid="save-status">
        {s.phase === 'saving' ? '저장하는 중…' : s.savedAt ? `마지막 저장: ${savedAtText(s.savedAt)}` : '아직 저장한 것이 없어요.'}
      </p>
      {problem ? (
        <p class="save-problem" role="status">
          <Icon name="alert" /> {problem}
        </p>
      ) : null}
      {s.loadWarnings.length > 0 ? (
        <div class="save-warnings" role="group" aria-labelledby="save-warnings-title">
          <p id="save-warnings-title" class="small">
            <strong>저장을 읽으면서 있었던 일</strong>
          </p>
          <ul class="small">
            {s.loadWarnings.slice(0, MAX_SHOWN_WARNINGS).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {s.loadWarnings.length > MAX_SHOWN_WARNINGS ? <p class="muted small">그 밖에 {s.loadWarnings.length - MAX_SHOWN_WARNINGS}가지가 더 있어요.</p> : null}
        </div>
      ) : null}
      <div class="settings-actions">
        <button type="button" class="btn" onClick={doExport}>
          저장 내보내기
        </button>
        <button type="button" class="btn" onClick={() => picker.current?.click()}>
          저장 가져오기
        </button>
        <input ref={picker} type="file" accept=".json,application/json" hidden onChange={(e) => void onPick(e)} data-testid="save-file" aria-label="가져올 저장 파일 고르기" />
        {exportUnread && s.keptUnread ? (
          <button type="button" class="btn btn-quiet" onClick={() => void doExportUnread()} data-testid="save-unread-download">
            읽지 못한 저장 내려받기
          </button>
        ) : null}
      </div>
      {pending ? (
        <div class="save-confirm" role="group" aria-labelledby="save-confirm-title">
          <p id="save-confirm-title">
            <strong>이 파일로 바꿀까요?</strong>
          </p>
          <p class="small">
            {pending.fileName}
            <br />
            {pending.summary}
          </p>
          <p class="muted small">지금 진행은 파일의 내용으로 바뀌어요. 지금 저장은 직전 저장으로 한 번 남아요.</p>
          <div class="settings-actions">
            <button type="button" class="btn btn-primary" ref={confirmButton} disabled={busy} onClick={() => void confirm()}>
              가져와서 바꾸기
            </button>
            <button type="button" class="btn btn-quiet" disabled={busy} onClick={() => setPending(null)}>
              취소
            </button>
          </div>
        </div>
      ) : null}
      <div class="save-note" role="status" aria-live="polite" data-kind={note?.kind ?? 'none'}>
        {note ? (
          <>
            <Icon name={note.kind === 'ok' ? 'check' : 'alert'} /> {note.text}
            {note.details && note.details.length > 0 ? (
              <ul class="small">
                {note.details.slice(0, 5).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
