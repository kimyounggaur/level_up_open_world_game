// 곡 패널(Q08)의 도움: 듣기 범위(전체, 성부 하나만, 고른 마디만)와 기본 연습 연결. 설계서 4.2, 4.9, 7.5.
// 듣기 범위는 도움이다: 전체가 아닌 범위로 들으면 '도움 사용'으로 적힌다(4.2 도움 메뉴의 성부 분리).
// 기본 연습은 지금 만든 곡을 그대로 두고 연습 과제를 연다. 어떻게 끝나도 '원래 곡으로 돌아가기'가 늘 눌린다(7.5).
import { useState } from 'preact/hooks';
import { ContentCatalog } from '../../../domain/catalog';
import { practiceLinksOf } from '../../../domain/content';
import type { AssistanceLink } from '../../../domain/content';
import type { ChallengeController } from '../../challenge/controller';
import { scopeChoiceOf, scopeOptionsOf, scopeValueOf } from '../../challenge/scopeChoices';
import { ChoiceGroup } from '../../common/ChoiceGroup';
import type { ChoiceOption } from '../../common/ChoiceGroup';
import { useController } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { useNav } from '../../common/nav';

export function SongAids({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const options: ChoiceOption[] = scopeOptionsOf(controller).map((o): ChoiceOption => ({ value: o.value, label: o.label, ...(o.voiceId ? { data: { voice: o.voiceId } } : {}) }));
  return (
    <div class="song-scope" data-scope={controller.scopeChoice.kind}>
      <ChoiceGroup id="aid-scope" title="들을 범위" hint="전체가 아니면 도움 사용으로 적혀요" options={options} selected={scopeValueOf(controller.scopeChoice)} onPick={(v) => controller.setScope(scopeChoiceOf(v))} />
      <p class="muted small song-scope-now" role="status">
        듣기 단추는 <strong>{controller.scopeLabel()}</strong> 들려 줘요.
      </p>
    </div>
  );
}

const linkKey = (l: AssistanceLink): string => `${l.questId}:${l.variantId ?? ''}`;

/** 기본 연습 목록. 누르면 지금 곡의 초안과 선택을 보관하고 연습 과제를 연다 */
export function PracticeLinks({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const nav = useNav();
  const [notice, setNotice] = useState<string | null>(null);
  const cur = controller.current;
  if (!cur || controller.readOnly) return null;
  const links = practiceLinksOf(cur.definition);
  if (links.length === 0) return null;

  const start = (link: AssistanceLink): void => {
    const r = controller.startPractice(link.questId!, link.variantId);
    if (!r.ok) {
      setNotice(r.message);
      return;
    }
    setNotice(null);
    nav.go(ContentCatalog.hashFor(r.quest.questId, r.variant.variantId));
  };

  return (
    <aside class="assist-panel practice-panel" aria-labelledby="practice-title">
      <h2 id="practice-title">기본 연습</h2>
      <p class="muted">막히면 쉬운 연습을 해 보고 돌아오세요. 지금 만든 곡은 그대로 남아 있어요.</p>
      <ul class="practice-list">
        {links.map((l) => (
          <li key={linkKey(l)}>
            <button type="button" class="btn btn-quiet btn-wide" data-practice={l.questId} onClick={() => start(l)}>
              {l.label} <Icon name="arrow-right" />
            </button>
          </li>
        ))}
      </ul>
      {notice ? (
        <p class="hint hint-notice" role="status" data-practice-notice="true">
          {notice}
        </p>
      ) : null}
    </aside>
  );
}
