// 도움 연습 중에 늘 보이는 띠. '원래 곡으로 돌아가기'는 연습의 결과나 오류와 무관하게 항상 눌린다(7.5).
import { Icon } from '../common/Icon';

export interface AssistBannerProps {
  origin: { title: string; variantLabel: string };
  onReturn: () => void;
}

export function AssistBanner({ origin, onReturn }: AssistBannerProps) {
  return (
    <section class="assist-banner" aria-label="도움 연습">
      <div class="assist-banner-text">
        <span class="chip chip-solid">도움 연습</span>
        <strong>
          원래 도전: {origin.title} · {origin.variantLabel}
        </strong>
      </div>
      <button type="button" class="btn btn-primary btn-large" onClick={onReturn}>
        원래 곡으로 돌아가기 <Icon name="arrow-right" />
      </button>
    </section>
  );
}
