// 시간선 과제의 재료 상자. 세 번에 나눠 고른다: 종류(음, 쉼, 셋잇단 묶음, 비우기), 길이, 음높이.
// 길이와 음높이는 쓰는 종류에서만 눌린다. 고른 것은 종류를 바꿔도 남는다.
import { midiOf, pitchName } from '../../domain/pitch';
import { materialValueName, timelinePitches, tupletKindName } from '../../domain/timeline';
import type { TimelineSpec } from '../../domain/timeline';
import type { ChallengeController } from '../challenge/controller';
import { Glyph } from '../common/Glyphs';
import { beatNameOfTicks } from '../common/format';
import { Icon } from '../common/Icon';
import { resolveTool, restName, toolText, tupletKeyOf, usesPitch, usesValue, valueTicksText } from './tool';
import type { ToolKind, ToolState } from './tool';

export interface MaterialTrayProps {
  controller: ChallengeController;
  spec: TimelineSpec;
  tool: ToolState;
  onTool: (next: ToolState) => void;
  /** 마지막으로 놓지 못한 이유. 다음에 놓거나 재료를 바꾸면 지운다 */
  rejection: string | null;
  /** 재료 상자의 제목 앞에 붙는 말(여러 상자를 구분할 때). 기본은 없다 */
  title?: string;
}

export function MaterialTray({ controller, spec, tool, onTool, rejection, title = '배치할 재료' }: MaterialTrayProps) {
  const resolved = resolveTool(tool, spec);
  const pitches = timelinePitches(spec);
  const content = controller.content();
  const kinds: Array<{ kind: ToolKind; name: string; sub: string; glyph: 'quarter-note' | 'quarter-rest' | null }> = [
    { kind: 'note', name: '음', sub: '소리가 나요', glyph: 'quarter-note' },
    { kind: 'rest', name: '쉼', sub: '소리가 없어요', glyph: 'quarter-rest' },
    ...(spec.tuplets.length > 0 ? [{ kind: 'raft' as const, name: '셋잇단 묶음', sub: `한 박(${beatNameOfTicks(spec.beatTicks)})을 셋으로`, glyph: null }] : []),
    { kind: 'erase', name: '비우기', sub: '자리를 비워요', glyph: null },
  ];
  // 길이 단추: 음가마다 하나, 점음표를 놓을 수 있는 음가에는 점이 붙은 단추가 이어진다
  const lengths = spec.values.flatMap((value) => [{ value, dotted: false }, ...(spec.dottedValues.includes(value) ? [{ value, dotted: true }] : [])]);
  const pick = (kind: ToolKind): void => onTool(tool.kind === kind ? { ...tool, kind: null } : { ...tool, kind });

  return (
    <section class="card tray tray-timeline" aria-labelledby="tray-title">
      <div class="tray-head">
        <h2 id="tray-title">{title}</h2>
        <p class="muted small">무엇을, 얼마나 길게, 어떤 음으로 놓을지 차례로 고른 뒤 칸을 누르세요.</p>
      </div>

      <div class="tray-step" role="group" aria-labelledby="tray-kind-title">
        <h3 id="tray-kind-title" class="tray-sub">1. 무엇을 놓을까요</h3>
        <div class="tray-items">
          {kinds.map((k) => {
            const on = tool.kind === k.kind;
            return (
              <button type="button" key={k.kind} class={`material${on ? ' is-selected' : ''}${k.kind === 'erase' ? ' material-erase' : ''}`} data-kind={k.kind} aria-pressed={on} onClick={() => pick(k.kind)}>
                {k.glyph ? <Glyph kind={k.glyph} /> : k.kind === 'erase' ? <Icon name="eraser" /> : <span class="raft-sample" aria-hidden="true">3</span>}
                <span class="material-name">{k.name}</span>
                <span class="material-sub">{k.sub}</span>
              </button>
            );
          })}
          {spec.tuplets.length > 1
            ? spec.tuplets.map((t) => {
                const on = resolved.kind === 'raft' && resolved.tuplet !== null && tupletKeyOf(resolved.tuplet) === tupletKeyOf(t);
                return (
                  <button type="button" key={tupletKeyOf(t)} class={`material${on ? ' is-selected' : ''}`} data-tuplet={tupletKeyOf(t)} aria-pressed={on} onClick={() => onTool({ ...tool, kind: 'raft', tupletKey: tupletKeyOf(t) })}>
                    <span class="material-name">{tupletKindName(t)}</span>
                    <span class="material-sub">묶음으로 놓아요</span>
                  </button>
                );
              })
            : null}
        </div>
      </div>

      <div class="tray-step" role="group" aria-labelledby="tray-value-title">
        <h3 id="tray-value-title" class="tray-sub">
          2. 길이 <span class="muted small">음과 쉼에 써요</span>
        </h3>
        <div class="tray-items">
          {lengths.map(({ value: v, dotted }) => {
            const on = usesValue(resolved.kind) && resolved.value === v && resolved.dotted === dotted;
            return (
              <button
                type="button"
                key={`${v}${dotted ? '-dotted' : ''}`}
                class={`material material-value${on ? ' is-selected' : ''}`}
                data-value={v}
                data-dotted={dotted ? 'true' : undefined}
                aria-pressed={on}
                disabled={!usesValue(resolved.kind)}
                onClick={() => onTool({ ...tool, value: v, dotted })}
              >
                <span class="material-name">{resolved.kind === 'rest' ? restName(v, dotted) : materialValueName(v, dotted)}</span>
                <span class="material-sub">{valueTicksText(v, dotted)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div class="tray-step" role="group" aria-labelledby="tray-pitch-title">
        <h3 id="tray-pitch-title" class="tray-sub">
          3. 음높이 <span class="muted small">음과 셋잇단 묶음에 써요</span>
        </h3>
        <div class="tray-items">
          {pitches.map((p) => {
            const name = pitchName(p);
            const on = usesPitch(resolved.kind) && pitchName(resolved.pitch) === name;
            return (
              <button
                type="button"
                key={name}
                class={`material material-pitch${on ? ' is-selected' : ''}`}
                data-pitch={name}
                aria-pressed={on}
                disabled={!usesPitch(resolved.kind)}
                onClick={() => {
                  onTool({ ...tool, pitchKey: name });
                  controller.previewPitch(midiOf(p));
                }}
              >
                <span class="material-name">{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p class="tray-mode" role="status" data-tool={resolved.kind ?? 'none'}>
        {toolText(resolved)}
      </p>
      {rejection ? (
        <p class="tray-reject" data-rejection="true">
          <Icon name="alert" /> {rejection}
        </p>
      ) : null}

      <div class="tray-tools">
        <button type="button" class="btn btn-quiet" onClick={() => controller.undo()} disabled={!controller.canUndo}>
          <Icon name="undo" /> 실행 취소
        </button>
        <button type="button" class="btn btn-quiet" onClick={() => controller.redo()} disabled={!controller.canRedo}>
          <Icon name="redo" /> 다시 실행
        </button>
        <button type="button" class="btn btn-quiet" onClick={() => controller.clearAll()} disabled={content.events.length === 0}>
          <Icon name="trash" /> 모두 지우기
        </button>
        <span class="muted small">드래그 없이도 가능</span>
      </div>
    </section>
  );
}
