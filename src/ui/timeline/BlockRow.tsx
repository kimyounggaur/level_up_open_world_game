// 시간선 줄: 한 성부의 한 창(박 하나, 마디 하나)을 시간에 비례한 조각으로 그린다.
// 조각의 너비는 틱에 비례한다(칸 하나 = 120틱, 셋잇단 돌 하나 = 320틱). 같은 창의 목표 줄과 내 줄은 같은 열 눈금을 쓰므로 위아래가 시간으로 맞는다.
// 맞고 틀림은 색만으로 말하지 않는다: 틀린 조각에는 기호가 붙고 이름에 '고칠 곳이 있어요'가 들어간다.
import type { TimelineBlock, TimelineSpec } from '../../domain/timeline';
import { Glyph } from '../common/Glyphs';
import { Icon } from '../common/Icon';

export interface BlockRowProps {
  spec: TimelineSpec;
  blocks: TimelineBlock[];
  /** 창의 시작과 끝(마디 처음부터 센 틱) */
  from: number;
  to: number;
  /** 낭독기가 읽는 목록 이름 */
  label: string;
  size: 'zoom' | 'overview';
  who: 'target' | 'mine';
  /** 있으면 조각이 단추가 된다(내 줄의 확대 창) */
  onPress?: (block: TimelineBlock, index: number) => void;
  onBlockKey?: (e: KeyboardEvent, block: TimelineBlock, index: number) => void;
  register?: (index: number, el: HTMLButtonElement | null) => void;
  /** 판정이 고치라고 한 조각의 key */
  errorKeys?: ReadonlySet<string>;
  /** 채워지지 않은 채 남은 구간으로 강조할 빈 조각의 key */
  remainKeys?: ReadonlySet<string>;
  /** 지금 울리는 위치(마디 처음부터 센 틱). 이 줄이 소리를 내고 있을 때만 준다 */
  playTick?: number | null;
}

export function BlockRow({ spec, blocks, from, to, label, size, who, onPress, onBlockKey, register, errorKeys, remainKeys, playTick = null }: BlockRowProps) {
  const units = Math.round((to - from) / spec.unitTicks);
  const col = (tick: number): number => Math.round((Math.min(Math.max(tick, from), to) - from) / spec.unitTicks) + 1;
  const groups = new Map<string, TimelineBlock[]>();
  for (const b of blocks) if (b.groupId) groups.set(b.groupId, [...(groups.get(b.groupId) ?? []), b]);
  const playing = playTick !== null && playTick >= from && playTick < to;

  return (
    <div class={`trow trow-${size} trow-${who}`} style={`--units:${units}`}>
      <div class="trow-marks" aria-hidden="true">
        {[...groups.entries()].map(([groupId, g]) => (
          <span key={groupId} class="raft-mark" style={`grid-column:${col(g[0]!.startTick)} / ${col(g[g.length - 1]!.endTick)}`}>
            {g[0]!.groupSize ?? g.length}
          </span>
        ))}
      </div>
      <div class="trow-track">
        <ol class="trow-blocks" aria-label={label} aria-hidden={size === 'overview' ? 'true' : undefined}>
          {blocks.map((b, i) => {
            const marked = errorKeys?.has(b.key) ?? false;
            const remain = remainKeys?.has(b.key) ?? false;
            const now = playTick !== null && b.startTick <= playTick && playTick < b.endTick;
            const classes = [
              'tblock',
              `kind-${b.kind}`,
              b.groupId ? 'in-raft' : '',
              marked ? 'has-error' : '',
              remain ? 'is-remain' : '',
              b.continues.before ? 'cont-before' : '',
              b.continues.after ? 'cont-after' : '',
              now ? 'is-playing' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const style = `grid-column:${col(b.startTick)} / ${col(b.endTick)}`;
            const face = (
              <>
                {b.kind === 'empty' ? null : <Glyph kind={b.kind === 'rest' ? 'quarter-rest' : 'quarter-note'} />}
                <span class="tblock-name">{b.kind === 'empty' || size === 'overview' ? '' : b.label}</span>
                {marked && size === 'zoom' ? (
                  <span class="tblock-mark" aria-hidden="true">
                    <Icon name="alert" />
                  </span>
                ) : null}
              </>
            );
            if (onPress) {
              const name = `${b.description}${marked ? ', 고칠 곳이 있어요' : ''}${remain ? ', 아직 채워지지 않은 구간' : ''}`;
              return (
                <li key={b.key} class={classes} style={style}>
                  <button
                    type="button"
                    class="tblock-face"
                    data-key={b.key}
                    data-start={b.fullStart}
                    data-kind={b.kind}
                    ref={(el) => register?.(i, el)}
                    aria-label={name}
                    onClick={() => onPress(b, i)}
                    onKeyDown={(e) => onBlockKey?.(e, b, i)}
                  >
                    {face}
                  </button>
                </li>
              );
            }
            return (
              <li key={b.key} class={classes} style={style} data-key={b.key}>
                <span class="tblock-face">
                  {face}
                  {size === 'zoom' ? <span class="sr-only">{who === 'target' ? '목표: ' : ''}{b.description}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {playing ? (
          <span class="trow-playhead" style={`left:${(((playTick as number) - from) / (to - from)) * 100}%`} aria-hidden="true">
            <Icon name="play" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
