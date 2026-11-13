// 악보를 화면 낭독기가 읽을 문장으로 바꾼다. 그림은 role="img" 이름과 설명으로 같은 내용을 전한다(7.9 8번).
import { isNote } from '../../domain/score';
import type { Score, ScoreEvent } from '../../domain/score';
import { describeTicks, positionLabel } from '../../domain/time';
import { CLEF_NAME_KO } from '../../domain/staff';
import { eventLabel } from '../../domain/challenge';

function eventText(e: ScoreEvent, meter: string): string {
  const where = positionLabel(e.onsetTicks, meter);
  const what = isNote(e) ? eventLabel(e) : '쉼';
  return `${where} ${what} ${describeTicks(e.durationTicks).replace(/ 길이$/, '')}`;
}

/**
 * 조표를 말로 바꾼다. 예: 1 → '조표는 올림표 1개', -2 → '조표는 내림표 2개'. 조표가 없으면 null.
 * 그림의 조표는 올림표·내림표의 개수만 보여 준다. 어느 음이 올라가거나 내려가는지 읽는 것이 과제일 수 있어(Q30) 말로도 개수까지만 말한다.
 */
export function describeKeySignature(keySignature: number): string | null {
  if (!Number.isInteger(keySignature) || keySignature === 0) return null;
  return keySignature > 0 ? `조표는 올림표 ${keySignature}개` : `조표는 내림표 ${-keySignature}개`;
}

/**
 * 예: '높은음자리표, 4/4박자. 한 마디: 첫 번째 박 C4 4분음표 하나, …'
 * 조표가 있으면 박자 뒤에 개수를 말한다: '높은음자리표, 4/4박자, 조표는 올림표 1개. 1번째 마디: …'
 * 성부가 둘 이상이면 마디마다 성부별로 나눠 읽는다: '1번째 마디. 위 성부: …. 아래 성부: ….' (소리 나는 순서가 아니라 성부별로 읽어야 화음이 섞여 들리지 않는다)
 */
export function describeScore(score: Score): string {
  const staffs = score.staves.map((s) => CLEF_NAME_KO[s.clef]).join(', ');
  const measures = Math.max(1, ...score.events.map((e) => e.measureIndex + 1));
  const key = describeKeySignature(score.staves[0]?.keySignature ?? 0);
  const parts: string[] = [`${staffs}, ${score.meter}박자${key ? `, ${key}` : ''}.`];
  if (score.events.length === 0) return `${parts[0]} 아직 놓은 음이 없어요.`;
  const voices = score.voices.length > 1 ? score.voices : null;
  for (let m = 0; m < measures; m++) {
    const head = measures === 1 ? '한 마디' : `${m + 1}번째 마디`;
    const inMeasure = score.events.filter((e) => e.measureIndex === m);
    if (inMeasure.length === 0) continue;
    if (!voices) {
      const list = inMeasure.sort((a, b) => a.onsetTicks - b.onsetTicks);
      parts.push(`${head}: ${list.map((e) => eventText(e, score.meter)).join(', ')}.`);
      continue;
    }
    const byVoice = voices
      .map((v) => {
        const list = inMeasure.filter((e) => e.voiceId === v.voiceId).sort((a, b) => a.onsetTicks - b.onsetTicks);
        return list.length === 0 ? null : `${v.label ?? v.voiceId}: ${list.map((e) => eventText(e, score.meter)).join(', ')}`;
      })
      .filter((x): x is string => x !== null);
    parts.push(`${head}. ${byVoice.join('. ')}.`);
  }
  return parts.join(' ');
}
