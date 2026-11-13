// 'panel.chord'는 화음 과제 전체의 패널이다. 열린 판본의 판정 종류에 따라 화면이 갈린다.
//  - 구성음 판정(Q05 장3화음): 종나무에 종을 걸어 화음을 만드는 TriadPanel
//  - 전위 판정(Q06): 종탑에서 옥타브·소리·자리를 고쳐 베이스를 바꾸는 InversionPanel
//  - 화음 사건 목록 판정(Q21 세 기둥, Q23 화음 이어 걷기, 확장 X-3): 나무 여러 그루에 화음을 하나씩 거는 SequencePanel
import type { ChallengeController } from '../../challenge/controller';
import { useController } from '../../common/hooks';
import { InversionPanel } from './InversionPanel';
import { SequencePanel } from './SequencePanel';
import { TriadPanel } from './TriadPanel';

export function ChordPanel({ controller }: { controller: ChallengeController }) {
  useController(controller);
  const type = controller.current?.def.evaluatorSpec.type;
  if (type === 'inversion') return <InversionPanel controller={controller} />;
  if (type === 'triadMembership') return <TriadPanel controller={controller} />;
  if (type === 'chordSequence') return <SequencePanel controller={controller} />;
  return null;
}
