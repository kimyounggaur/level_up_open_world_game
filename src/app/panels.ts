// 패널 id → 패널 화면. 만들어진 패널만 올라 있다. 없는 패널은 '준비 중'으로 알린다(W-2의 '모든 판본에 패널'은 데이터 규칙이고, 화면은 단계마다 늘어난다).
import type { FunctionComponent } from 'preact';
import type { ChallengeController } from '../ui/challenge/controller';
import type { FreeMelody } from '../ui/challenge/melody';
import type { SlotBench } from '../ui/challenge/slotBench';
import { ClefPanel } from '../ui/panels/clef/ClefPanel';
import { ChordPanel } from '../ui/panels/chord/ChordPanel';
import { RhythmPanel } from '../ui/panels/rhythm/RhythmPanel';
import { ScalePanel } from '../ui/panels/scale/ScalePanel';
import { SongPanel } from '../ui/panels/song/SongPanel';

/**
 * 패널은 컨트롤러를 받는다. 놓기 작업대(bench)는 필요한 패널만 쓴다: 월드의 설치물과 같은 작업대라 손에 든 음이 이어진다.
 * 자유 가락(melody)은 곡 패널만 쓴다: 저장하기와 찾은 소리 조각 재료함이 이것을 본다.
 */
export type PanelComponent = FunctionComponent<{ controller: ChallengeController; bench: SlotBench; melody: FreeMelody }>;

export const PANELS: Readonly<Record<string, PanelComponent>> = {
  'panel.clef': ClefPanel,
  'panel.chord': ChordPanel,
  'panel.rhythm': RhythmPanel,
  'panel.scale': ScalePanel,
  'panel.song': SongPanel,
};

export const availablePanelIds = (): ReadonlySet<string> => new Set(Object.keys(PANELS));
