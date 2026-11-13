// 음이름·변화표·옥타브를 따로 눌러 고르는 부품(이름표, 종). 고른 것은 부모가 초안의 편집으로 바꾼다(`pitchPickEdit`).
// 변화표와 옥타브는 음이름이 걸린 뒤에 바꿀 수 있고, 아직 걸리지 않았을 때 누르면 이유를 문장으로 알린다(막지 않는다).
import { LETTERS } from '../../domain/pitch';
import type { WrittenPitch } from '../../domain/pitch';
import { PICK_ACCIDENTALS } from '../../domain/slotplan';
import type { PitchChange, PitchPickRules } from '../../domain/slotplan';
import { ChoiceGroup } from './ChoiceGroup';
import type { ChoiceOption } from './ChoiceGroup';

export interface PitchPickerProps {
  /** DOM id의 앞부분. 화면에서 겹치지 않아야 한다 */
  id: string;
  /** 칸의 이름. 예: '올려 부른 이름표', '종 2' */
  label: string;
  written: WrittenPitch | null;
  rules: PitchPickRules;
  onChange: (change: PitchChange) => void;
}

const LETTER_OPTIONS: ChoiceOption[] = LETTERS.map((l) => ({ value: l, label: l, data: { letter: l } }));

const ACCIDENTAL_OPTIONS: ChoiceOption[] = PICK_ACCIDENTALS.map((a) => ({
  value: a ?? 'none',
  data: { accidental: a ?? 'none' },
  label:
    a === 'sharp' ? (
      <>
        <span class="glyph" aria-hidden="true">♯</span> 샵
      </>
    ) : a === 'flat' ? (
      <>
        <span class="glyph" aria-hidden="true">♭</span> 플랫
      </>
    ) : (
      '변화 없음'
    ),
}));

export function PitchPicker({ id, label, written, rules, onChange }: PitchPickerProps) {
  const octaveOptions: ChoiceOption[] = rules.octaves.map((o) => ({ value: String(o), label: String(o), data: { octave: String(o) } }));
  return (
    <div class="pitch-picker">
      <ChoiceGroup id={`${id}-letter`} title={`${label}: 음이름`} class="pick-letters" options={LETTER_OPTIONS} selected={written?.letter ?? null} onPick={(v) => onChange({ part: 'letter', letter: v as (typeof LETTERS)[number] })} />
      <ChoiceGroup
        id={`${id}-accidental`}
        title={`${label}: 변화표`}
        class="pick-accidentals"
        options={ACCIDENTAL_OPTIONS}
        selected={written ? (written.accidental === 'sharp' || written.accidental === 'flat' ? written.accidental : 'none') : null}
        onPick={(v) => onChange({ part: 'accidental', accidental: v === 'sharp' || v === 'flat' ? v : null })}
      />
      {octaveOptions.length > 1 ? (
        <ChoiceGroup id={`${id}-octave`} title={`${label}: 옥타브`} class="pick-octaves" options={octaveOptions} selected={written ? String(written.octave) : null} onPick={(v) => onChange({ part: 'octave', octave: Number(v) })} />
      ) : null}
    </div>
  );
}
