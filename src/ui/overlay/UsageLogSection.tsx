// 설정의 '사용 기록' 구역(설계서 10.9, 13.2): 사용 관찰에 쓰는 행동 기록. 무엇을 적는지, 어디에 쌓이는지, 파일로 내보내기와 지우기.
// 기록은 이 기기에만 쌓이고 어디로도 보내지 않는다. 내보내기를 눌렀을 때만 파일이 만들어진다.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../../platform/bridge';
import type { UsageLogStatus } from '../../platform/log';
import { Icon } from '../common/Icon';
import { Toggle } from '../common/Toggle';
import { useStore } from '../common/hooks';
import { browserDownload } from './SaveSection';

export interface UsageLogSectionProps {
  status: Store<UsageLogStatus>;
  /** 새 사건을 적을지 정한다 */
  onToggle: (on: boolean) => void;
  /** 지금까지의 기록을 파일로 만들 글자와 이름 */
  exportFile: () => { fileName: string; text: string };
  /** 기록을 모두 지운다 */
  onClear: () => Promise<void>;
  /** 내려받기. 시험에서는 가짜를 넣는다 */
  download?: (fileName: string, text: string) => void;
}

export const USAGE_RECORDED = '정거장과 도전에 들어간 길(걷기, 지도, 목록, 수첩, 주소), 도움을 연 것, 원래 도전으로 돌아온 것, 놓은 것을 고친 것, 다시 들은 것, 확인한 결과, 지나가며 돌을 밟은 것';
export const USAGE_NOT_RECORDED = '이름, 연락처, 생년월일, 녹음, 놓은 음의 내용';

interface Note {
  kind: 'ok' | 'error';
  text: string;
}

export function statusLine(s: UsageLogStatus): string {
  if (s.count === 0) return s.enabled ? '아직 쌓인 기록이 없어요.' : '아직 쌓인 기록이 없고, 지금은 쌓지 않아요.';
  const base = `기록 ${s.count}건이 쌓여 있어요.`;
  const dropped = s.dropped > 0 ? ` 한도가 차서 오래된 ${s.dropped}건은 지웠어요.` : '';
  return `${base}${dropped}${s.enabled ? '' : ' 지금은 더 쌓지 않아요.'}`;
}

export function UsageLogSection({ status, onToggle, exportFile, onClear, download = browserDownload }: UsageLogSectionProps) {
  const s = useStore(status);
  const [note, setNote] = useState<Note | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  // 확인 단계가 뜨면 키보드 사용자가 곧바로 결정할 수 있게 초점을 옮긴다
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const doExport = (): void => {
    try {
      const f = exportFile();
      download(f.fileName, f.text);
      setNote({ kind: 'ok', text: `파일로 내보냈어요: ${f.fileName}` });
    } catch (e) {
      setNote({ kind: 'error', text: `내보내지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const doClear = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onClear();
      setConfirming(false);
      setNote({ kind: 'ok', text: '기록을 모두 지웠어요. 진행은 그대로예요.' });
    } catch (e) {
      setNote({ kind: 'error', text: `지우지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="settings-section" aria-labelledby="set-usage" data-usage-enabled={s.enabled ? 'on' : 'off'} data-usage-backend={s.backend}>
      <h2 id="set-usage">사용 기록</h2>
      <p class="muted small settings-note">
        어떻게 쓰는지 살펴볼 때 쓰는 기록이에요. 이 기기에만 쌓이고 어디로도 보내지 않아요. 아래에서 파일로 내보낼 때만 밖으로 나가요.
      </p>
      <p class="small settings-note" data-testid="usage-recorded">
        <strong>적는 것</strong>: {USAGE_RECORDED}.
      </p>
      <p class="small settings-note" data-testid="usage-not-recorded">
        <strong>적지 않는 것</strong>: {USAGE_NOT_RECORDED}.
      </p>
      <Toggle id="set-usage-on" label="기록 남기기" hint="끄면 지금부터 더 쌓지 않아요. 이미 쌓인 기록은 그대로예요." checked={s.enabled} onChange={onToggle} />
      <p class="save-status" data-testid="usage-status">
        {statusLine(s)}
      </p>
      {s.backend === 'memory' ? (
        <p class="save-problem" role="status">
          <Icon name="alert" /> 이 브라우저에서는 저장소를 쓸 수 없어요. 기록은 창을 닫거나 새로 고치면 사라져요. 필요하면 먼저 내보내 두세요.
        </p>
      ) : null}
      {s.problem ? (
        <p class="save-problem" role="status">
          <Icon name="alert" /> {s.problem}
        </p>
      ) : null}
      <div class="settings-actions">
        <button type="button" class="btn" onClick={doExport} disabled={s.count === 0}>
          기록 내보내기
        </button>
        <button type="button" class="btn btn-quiet" onClick={() => setConfirming(true)} disabled={s.count === 0 || confirming}>
          기록 지우기
        </button>
      </div>
      {confirming ? (
        <div class="save-confirm" role="group" aria-labelledby="usage-confirm-title">
          <p id="usage-confirm-title">
            <strong>쌓인 기록을 모두 지울까요?</strong>
          </p>
          <p class="muted small">지운 기록은 되돌릴 수 없어요. 진행(저장)에는 영향이 없어요. 필요하면 먼저 내보내 두세요.</p>
          <div class="settings-actions">
            <button type="button" class="btn btn-primary" ref={confirmButton} disabled={busy} onClick={() => void doClear()}>
              모두 지우기
            </button>
            <button type="button" class="btn btn-quiet" disabled={busy} onClick={() => setConfirming(false)}>
              취소
            </button>
          </div>
        </div>
      ) : null}
      <div class="save-note" role="status" aria-live="polite" data-kind={note?.kind ?? 'none'}>
        {note ? (
          <>
            <Icon name={note.kind === 'ok' ? 'check' : 'alert'} /> {note.text}
          </>
        ) : null}
      </div>
    </section>
  );
}
