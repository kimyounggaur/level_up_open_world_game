// 2-6 오선에 놓기. 오선을 누르면 가까운 보표 위치에 온음표가 놓이고, 단추나 ↑ ↓ 키로 한 칸씩 옮긴다.
// 끌기는 쓰지 않는다(7.9 2번). 눌린 화면 좌표는 여기서 정수 보표 위치로 바뀌고, 그 뒤로는 좌표가 쓰이지 않는다(W-3).
// 읽을 이름은 '위치'만 말한다: 음이름은 '배치 확인' 뒤의 판정 문장에서만 알려 준다.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { describeStaffPosition } from '../../../domain/staff';
import type { StaffSlot } from '../../../domain/challenge';
import { slotDisplayScore, slotEventId } from '../../../domain/challenge';
import type { ChallengeController } from '../../challenge/controller';
import { useController } from '../../common/hooks';
import { StaffView } from '../../notation/StaffView';
import type { RenderedScore } from '../../notation/render';
import { SURFACE_MAX_POSITION, SURFACE_MIN_POSITION, SURFACE_START_POSITION, clientYToSvgY, cropToPlacementRange, drawLedgerGuides, positionOfY } from '../../notation/staffSurface';

export type SlotStatus = 'idle' | 'ok' | 'error';

export interface StaffSurfaceProps {
  controller: ChallengeController;
  slot: StaffSlot;
  status: SlotStatus;
  /** 이 칸의 설명 문장 id(화면 낭독기가 이름과 함께 읽는다) */
  describedBy?: string;
}

/** 슬라이더 값의 말. 놓지 않았으면 그렇게 말한다 */
export function positionValueText(position: number | null): string {
  return position === null ? '아직 놓지 않았어요' : describeStaffPosition(position);
}

export function StaffSurface({ controller, slot, status, describedBy }: StaffSurfaceProps) {
  useController(controller);
  const cur = controller.current!;
  const position = controller.slotPosition(slot);
  const ledger = controller.aids.ledger;
  const rendered = useRef<RenderedScore | null>(null);
  const score = slotDisplayScore(cur.def, slot, controller.content());
  const highlight = status === 'idle' || position === null ? undefined : { [slotEventId(slot)]: status === 'ok' ? ('ok' as const) : ('error' as const) };

  const paintGuides = (r: RenderedScore | null): void => {
    const stave = r?.staves[0];
    if (r && stave) drawLedgerGuides(r.svg, stave, controller.aids.ledger);
  };
  useLayoutEffect(() => paintGuides(rendered.current), [ledger]);

  const press = (clientY: number): void => {
    const r = rendered.current;
    const stave = r?.staves[0];
    if (!r || !stave) return;
    controller.placeOnStaff(slot, positionOfY(stave, clientYToSvgY(r.svg, clientY)));
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const step = (delta: number): void => {
      controller.moveOnStaff(slot, delta);
      e.preventDefault();
    };
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        return step(1);
      case 'ArrowDown':
      case 'ArrowLeft':
        return step(-1);
      case 'PageUp':
        return step(7);
      case 'PageDown':
        return step(-7);
      case 'Home':
        controller.placeOnStaff(slot, SURFACE_MIN_POSITION);
        e.preventDefault();
        return;
      case 'End':
        controller.placeOnStaff(slot, SURFACE_MAX_POSITION);
        e.preventDefault();
        return;
      case 'Delete':
      case 'Backspace':
        controller.clearStaffSlot(slot);
        e.preventDefault();
        return;
      case 'Enter':
      case ' ':
        if (position === null) controller.placeOnStaff(slot, SURFACE_START_POSITION);
        else controller.announce(`${slot.label}의 음은 ${describeStaffPosition(position)}에 있어요.`);
        e.preventDefault();
        return;
      default:
    }
  };

  return (
    <div
      class={`staff-surface is-${status}${position === null ? ' is-empty' : ''}`}
      data-slot-id={slot.slotId}
      role="slider"
      tabIndex={0}
      aria-label={`${slot.label}: 음의 자리`}
      aria-orientation="vertical"
      aria-valuemin={SURFACE_MIN_POSITION}
      aria-valuemax={SURFACE_MAX_POSITION}
      aria-valuenow={position ?? SURFACE_START_POSITION}
      aria-valuetext={positionValueText(position)}
      aria-describedby={describedBy}
      onClick={(e) => press((e as MouseEvent).clientY)}
      onKeyDown={onKeyDown}
    >
      <StaffView
        score={score}
        title={`${slot.label}의 오선`}
        description={position === null ? '아직 놓은 음이 없어요.' : `온음표가 ${describeStaffPosition(position)}에 있어요.`}
        options={{ measuresPerSystem: 1, minMeasureWidth: 96, showTimeSignature: false, ...(highlight ? { highlight } : {}) }}
        onRendered={(r) => {
          rendered.current = r;
          const stave = r.staves[0];
          if (stave) cropToPlacementRange(r.svg, stave);
          paintGuides(r);
        }}
      />
    </div>
  );
}
