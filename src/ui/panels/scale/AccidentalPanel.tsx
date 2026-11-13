// 7-3 Q30 임시표 패널(마디 안의 임시표): 오선의 악보를 읽고, 음표 순서대로 어느 널(건반)의 소리인지 깃발을 꽂아 고른다.
// 건반 다리(K3)와 같은 초안(소리 높이만 담는 칸)을 쓰므로, 다리에서 꽂은 깃발이 여기 있고 여기서 꽂은 깃발이 다리로 돌아가면 서 있다(초안 하나, 보는 방법 둘).
// 문제를 푸는 중에는 검은 널을 이웃한 흰 널로만 말한다: 이 과제는 이름이 아니라 '어떤 소리가 나는가'를 묻는다(4.8).
// 끌지 않아도 모두 할 수 있다(W-4): 깃발을 고르고, 널을 누르고, 단추를 누른다. '배치 확인'을 눌러야 맞고 틀림이 나온다.
import { midiToSharpName } from '../../../domain/pitch';
import { flagClearResult, flagPlantResult, flagSpotsOf, flagTargetsOf, planksOfRange, plankSpeakOf } from '../../../domain/keyBridge';
import type { BridgeEditResult, Plank } from '../../../domain/keyBridge';
import { flaggedSlots } from '../../../domain/slotmap';
import type { ToneNote } from '../../../domain/slotplan';
import { ToneAids } from '../../assist/ToneAids';
import { BRIDGE_NOTE_TICKS } from '../../challenge/keyBridgeBench';
import { NO_FLAG_NOTICE, PICK_ITEM_FIRST, bridgeIdleLead, bridgePassedText } from '../../challenge/keyBridgeText';
import type { ChallengeController } from '../../challenge/controller';
import { ChoiceGroup } from '../../common/ChoiceGroup';
import type { ChoiceOption } from '../../common/ChoiceGroup';
import { useController, usePlayheadSlots } from '../../common/hooks';
import { Icon } from '../../common/Icon';
import { describeScore } from '../../notation/describe';
import { StaffView } from '../../notation/StaffView';
import { PanelFrame } from '../PanelFrame';

/** 널을 고르는 단추의 글: 흰 널은 이름, 검은 널은 이웃한 흰 널(이름을 알려 주지 않는다) */
function plankOptionOf(p: Plank): ChoiceOption {
  const label = p.black ? `검은 널 (${midiToSharpName(p.midi - 1)}·${midiToSharpName(p.midi + 1)} 사이)` : p.name;
  return { value: String(p.slot), label, data: { plank: String(p.slot), black: p.black ? '1' : '0' } };
}

export function AccidentalPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const sounding = usePlayheadSlots(controller);
  const cur = controller.current;
  if (!cur) return null;

  const def = cur.def;
  const spec = def.evaluatorSpec;
  const planks = planksOfRange(def.challengeDescriptor.range) ?? [];
  const content = controller.content();
  const spots = flagSpotsOf(def, content, planks) ?? [];
  const total = spots.length;
  const done = spots.filter((s) => s.plank !== null).length;
  const selectedDraft = controller.orderedCursor();
  const selectedSpot = spots.find((s) => s.draft === selectedDraft) ?? null;
  const feedback = controller.feedback;
  const messages = feedback && !feedback.passed && !feedback.technical ? feedback.messages : [];
  const flagged = new Set(feedback && !feedback.technical && !feedback.passed ? flaggedSlots(feedback.issues) : []);
  const keyName = spec.type === 'orderedScale' ? spec.keyName : undefined;
  const plankOf = (slot: number | null): Plank | undefined => (slot === null ? undefined : planks.find((p) => p.slot === slot));

  const apply = (r: BridgeEditResult): void => {
    if (r.edit) controller.edit(r.edit, r.text);
    else controller.announce(r.text);
    if (r.midi !== null) controller.previewPitch(r.midi);
  };

  const pickFlag = (draft: number): void => {
    controller.selectOrderedSlot(draft);
    const spot = spots.find((s) => s.draft === draft);
    const p = plankOf(spot?.plank ?? null);
    controller.announce(p ? `${draft}번 깃발, ${plankSpeakOf(p, false)}에 꽂혀 있어요.` : `${draft}번 깃발, 아직 꽂지 않았어요.`);
  };

  const plant = (value: string): void => {
    const plank = plankOf(Number(value));
    if (!plank) return;
    if (!selectedSpot) {
      // 깃발을 고르지 않았으면 널의 소리만 들려 주고 먼저 깃발을 고르라고 알린다
      controller.previewPitch(plank.midi);
      controller.announce(PICK_ITEM_FIRST);
      return;
    }
    apply(flagPlantResult(content, selectedSpot, plank));
  };

  const clear = (draft: number): void => {
    const spot = spots.find((s) => s.draft === draft);
    if (spot) apply(flagClearResult(content, spot));
  };

  const listenMine = (): void => {
    const notes = spots
      .filter((s) => s.plank !== null)
      .map((s, k): ToneNote => ({ slot: s.draft, midi: plankOf(s.plank)!.midi, onsetTick: k * BRIDGE_NOTE_TICKS, durationTick: BRIDGE_NOTE_TICKS }));
    controller.playTones(notes, NO_FLAG_NOTICE, 'mine');
  };

  const listenTarget = (): void => {
    const notes = flagTargetsOf(def).map((midi, k): ToneNote => ({ slot: k + 1, midi, onsetTick: k * BRIDGE_NOTE_TICKS, durationTick: BRIDGE_NOTE_TICKS }));
    controller.playTones(notes, NO_FLAG_NOTICE, 'target');
  };

  const options = planks.map(plankOptionOf);

  return (
    <PanelFrame controller={controller}>
      <div class="panel-body">
        <div class="panel-grid">
          <div class="panel-column">
            <header class="panel-head">
              <div>
                <h1 id="panel-title">{cur.entry.title}</h1>
                <p class="subtitle">악보를 읽고, 음표 순서대로 어느 널의 소리인지 깃발을 꽂아 보세요. '배치 확인'을 눌러야 맞고 틀림이 나와요.</p>
              </div>
              <div class="chips">
                {keyName ? <span class="chip">{keyName}</span> : null}
                <span class="chip">깃발 {total}개</span>
              </div>
            </header>

            <section class="card score-view" aria-labelledby="sign-title">
              <div class="card-head">
                <h2 id="sign-title">표지판의 악보</h2>
                <span class="muted small">다리 앞 표지판과 같은 악보예요. 음표를 왼쪽부터 차례로 읽어요.</span>
              </div>
              <figure class="score-figure">
                <figcaption class="sr-only">표지판의 악보</figcaption>
                <StaffView score={def.score} title="표지판의 악보" description={describeScore(def.score)} />
              </figure>
            </section>

            <section class="card" aria-labelledby="flags-title">
              <div class="card-head">
                <h2 id="flags-title">깃발 꽂기</h2>
                <span class="muted small">깃발을 고른 뒤 아래 널을 눌러요. 널을 누르면 그 널의 소리가 나요.</span>
              </div>
              <ol class="slot-grid flag-grid">
                {spots.map((s) => {
                  const p = plankOf(s.plank);
                  const isSelected = selectedDraft === s.draft;
                  const isError = flagged.has(s.draft);
                  const isSounding = sounding.includes(s.draft);
                  return (
                    <li key={s.draft} class={`slot-card flag-card${isSelected ? ' is-selected' : ''}${isError ? ' has-error' : ''}${isSounding ? ' is-sounding' : ''}`} data-flag={s.draft}>
                      <div class="slot-head">
                        <h3>{s.order}번 깃발</h3>
                        {isSounding ? (
                          <span class="slot-status is-sounding" role="status">
                            <Icon name="play" /> 지금 울리는 음
                          </span>
                        ) : null}
                        {isError ? (
                          <span class="slot-status is-error">
                            <Icon name="alert" /> 고칠 곳이 있어요
                          </span>
                        ) : null}
                      </div>
                      <p class="tag-name" data-plank={p ? p.slot : ''}>
                        {p ? (
                          <>
                            꽂은 널: <strong class="tag-value">{plankSpeakOf(p, false)}</strong>
                          </>
                        ) : (
                          '아직 꽂지 않았어요.'
                        )}
                      </p>
                      <div class="slot-controls">
                        <button type="button" class="btn btn-quiet" onClick={() => pickFlag(s.draft)} aria-pressed={isSelected} aria-label={`${s.order}번 깃발 고르기`}>
                          <Icon name="pin" /> {isSelected ? '고른 깃발' : '고르기'}
                        </button>
                        <button type="button" class="btn btn-quiet" onClick={() => clear(s.draft)} disabled={s.plank === null} aria-label={`${s.order}번 깃발: 빼기`}>
                          <Icon name="trash" /> 빼기
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <ChoiceGroup
                id="plank-pick"
                title="널"
                class="plank-choice"
                options={options}
                selected={selectedSpot?.plank !== null && selectedSpot?.plank !== undefined ? String(selectedSpot.plank) : null}
                onPick={plant}
                hint={selectedSpot ? `${selectedSpot.order}번 깃발을 꽂을 널을 골라요. 낮은 소리부터 높은 소리 순서예요.` : '먼저 위에서 깃발을 골라요.'}
              />

              <div class={`feedback ${feedback ? (feedback.passed ? 'is-ok' : feedback.technical ? 'is-tech' : 'is-error') : 'is-idle'}`} data-feedback={feedback ? (feedback.passed ? 'passed' : feedback.technical ? 'technical' : 'needsRevision') : 'none'}>
                {feedback?.passed ? (
                  <p class="feedback-line">
                    <Icon name="check" /> <strong>통과했어요.</strong> {bridgePassedText('flags')}
                  </p>
                ) : null}
                {messages.map((m) => (
                  <p key={m} class="feedback-line">
                    <Icon name="alert" /> <strong>{m}</strong>
                  </p>
                ))}
                {feedback?.technical ? (
                  <p class="feedback-line">
                    <Icon name="alert" /> {feedback.messages[0]}
                  </p>
                ) : null}
                {!feedback ? (
                  <p class="feedback-idle muted">
                    {bridgeIdleLead('flags', total, done)} 확인하기 전에는 맞고 틀림을 알려 주지 않아요.
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <div class="panel-side">
            <ToneAids controller={controller} onCheck={() => controller.check()}>
              <button type="button" class="btn btn-primary btn-wide" onClick={listenMine} aria-pressed={controller.playing === 'mine'}>
                <Icon name="play" /> 내 깃발 듣기
              </button>
              <div class="listen-row">
                <button type="button" class="btn btn-quiet" onClick={listenTarget} aria-pressed={controller.playing === 'target'}>
                  <Icon name="play" /> 목표 소리 듣기
                </button>
              </div>
            </ToneAids>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
