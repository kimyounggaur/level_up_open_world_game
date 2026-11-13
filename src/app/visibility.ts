// 탭이 보이는지(Page Visibility)를 세계 소리가 읽는 모양으로 준다(8.2). 가려지면 세계 시계가 멈추고, 돌아오면 다음 마디부터 흐른다.
// 문서가 없는 실행(서버 쪽 시험 등)에서는 늘 보이는 것으로 친다.
import type { WorldAudioDeps } from '../audio/worldAudio';

export type VisibilitySource = NonNullable<WorldAudioDeps['visibility']>;

type DocLike = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export function documentVisibility(doc: DocLike | null | undefined = typeof document !== 'undefined' ? document : null): VisibilitySource | undefined {
  if (!doc) return undefined;
  return {
    hidden: () => doc.visibilityState === 'hidden',
    subscribe(listener) {
      doc.addEventListener('visibilitychange', listener);
      return () => doc.removeEventListener('visibilitychange', listener);
    },
  };
}
