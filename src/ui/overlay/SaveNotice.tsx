// 저장에 문제가 있을 때만 화면 위쪽에 뜨는 알림 띠(10.6). 진행이 사라질 수 있다는 것을 조용히 두지 않는다.
// 문제가 없으면 아무것도 그리지 않는다. 닫아도 문제의 내용이 바뀌면 다시 뜬다.
import { useState } from 'preact/hooks';
import type { Store } from '../../platform/bridge';
import type { SaveStatus } from '../../platform/storage';
import { Icon } from '../common/Icon';
import { useStore } from '../common/hooks';
import { saveProblem } from './SaveSection';

export interface SaveNoticeProps {
  status: Store<SaveStatus>;
  /** 설정 화면의 저장 구역으로 간다 */
  onOpenSettings: () => void;
  /** 이미 설정 화면이면 띠를 숨긴다(같은 말이 아래에 있다) */
  hidden?: boolean;
}

export function SaveNotice({ status, onOpenSettings, hidden }: SaveNoticeProps) {
  const s = useStore(status);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const message = saveProblem(s);
  if (!message || hidden || dismissed === message) return null;
  return (
    <div class="save-notice" role="status" data-save-notice>
      <p>
        <Icon name="alert" /> {message}
      </p>
      <div class="save-notice-actions">
        <button type="button" class="btn btn-quiet" onClick={onOpenSettings}>
          설정에서 보기
        </button>
        <button type="button" class="btn btn-quiet" onClick={() => setDismissed(message)}>
          닫기
        </button>
      </div>
    </div>
  );
}
