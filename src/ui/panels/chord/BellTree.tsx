// 종나무 그림: 가지 높이가 옥타브이고, 종이 걸린 가로 자리가 칸 번호다(설계서 4.6).
// 그림은 장식이다. 같은 내용을 종 카드가 글로 알리므로 화면 낭독기에는 읽어 주지 않는다.
// 소리가 꺼진 종은 점선과 ✕ 표시, 가장 낮은 종은 굵은 테두리와 ▲ 표시, 지금 울리는 종은 금색으로 칠한다(색만으로 알리지 않는다).
export interface BellTreeBell {
  slot: number;
  octave: number;
  /** 음이름과 옥타브. 예: E3 */
  name: string;
  muted?: boolean;
  sounding?: boolean;
  lowest?: boolean;
}

export interface BellTreeProps {
  /** 가지가 되는 옥타브. 작은 것부터 */
  octaves: readonly number[];
  /** 종이 걸릴 수 있는 칸의 수 */
  slotCount: number;
  bells: readonly BellTreeBell[];
}

const ROW = 56;
const LEFT = 76;
const SLOT_W = 68;
const TOP = 8;

export function BellTree({ octaves, slotCount, bells }: BellTreeProps) {
  const width = LEFT + slotCount * SLOT_W + 8;
  const height = TOP + octaves.length * ROW + 12;
  const branchY = (octave: number): number => {
    const index = octaves.indexOf(octave);
    return TOP + (octaves.length - 1 - index) * ROW + 12;
  };
  return (
    <svg class="bell-tree" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false" data-bells={bells.length}>
      {octaves.map((o) => (
        <g key={o} class="tree-row" data-octave={o}>
          <line class="tree-branch" x1={LEFT - 8} x2={width - 8} y1={branchY(o)} y2={branchY(o)} />
          <text class="tree-label" x={4} y={branchY(o) + 5}>
            {o}옥타브
          </text>
        </g>
      ))}
      {bells.map((b) => {
        const y = octaves.includes(b.octave) ? branchY(b.octave) : null;
        if (y === null) return null;
        const x = LEFT + b.slot * SLOT_W + SLOT_W / 2;
        return (
          <g key={b.slot} class={`tree-bell${b.muted ? ' is-muted' : ''}${b.sounding ? ' is-sounding' : ''}${b.lowest ? ' is-lowest' : ''}`} data-slot={b.slot} data-octave={b.octave} transform={`translate(${x} ${y})`}>
            <path class="bell-body" d="M-12 24C-12 12-7 4 0 4s12 8 12 20z" />
            <rect class="bell-lip" x={-15} y={24} width={30} height={4} rx={2} />
            <circle class="bell-clapper" cx={0} cy={32} r={3} />
            <text class="tree-name" y={48} text-anchor="middle">
              {b.name}
            </text>
            {b.muted ? (
              <text class="tree-x" y={20} text-anchor="middle">
                ✕
              </text>
            ) : null}
            {b.lowest ? (
              <text class="tree-flag" y={-8} text-anchor="middle">
                ▲ 낮음
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
