// 7-2 음계의 종류 이름: 간격 목록(midiSteps)에서 읽고, 통과 문장과 주제 이름이 그 이름을 쓴다.
// 장음계(Q07)의 문장은 이전과 글자까지 같아야 하고, 아는 목록이 아니면 틀린 이름을 붙이지 않고 '음계'라고만 부른다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENERIC_SCALE_NAME, SCALE_KINDS, scaleKindOf, scaleNameOf } from '@/domain/scaleKind';
import { slotPassedText } from '@/ui/challenge/slotText';
import { topicName } from '@/ui/common/format';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUESTS: Array<Record<string, any>> = fs
  .readdirSync(path.join(root, 'content', 'quests'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'content', 'quests', f), 'utf-8')));

describe('음계 종류(scaleKind): 간격 목록에서 이름을 읽는다', () => {
  it('설계서 5.8의 간격 네 가지: 장음계, 자연단음계, 화성단음계, 다섯 음 음계', () => {
    expect(scaleNameOf([2, 2, 1, 2, 2, 2, 1])).toBe('장음계');
    expect(scaleNameOf([2, 1, 2, 2, 1, 2, 2])).toBe('자연단음계');
    expect(scaleNameOf([2, 1, 2, 2, 1, 3, 1])).toBe('화성단음계');
    expect(scaleNameOf([2, 2, 3, 2, 3])).toBe('다섯 음 음계');
    expect(scaleKindOf([2, 1, 2, 2, 1, 3, 1])?.id).toBe('harmonicMinor');
  });

  it('아는 목록이 아니면 음계라고만 부른다: 길이가 다른 목록, 앞부분만 같은 목록, 간격이 없는 판정기', () => {
    expect(GENERIC_SCALE_NAME).toBe('음계');
    expect(scaleNameOf([4, 3, 5, 4, 3, 5])).toBe('음계'); // Q12 음역 사다리
    expect(scaleNameOf(Array(12).fill(1))).toBe('음계'); // 반음계
    expect(scaleNameOf([2, 2, 1, 2, 2, 2])).toBe('음계'); // 장음계의 앞부분만
    expect(scaleNameOf([2, 2, 1, 2, 2, 2, 1, 2])).toBe('음계'); // 뒤가 더 있다
    expect(scaleNameOf([])).toBe('음계');
    expect(scaleNameOf(undefined)).toBe('음계');
    expect(scaleKindOf(undefined)).toBeNull();
    expect(scaleKindOf([1])).toBeNull();
  });

  it('목록의 이름과 간격은 서로 겹치지 않고, 오르는 간격의 합은 한 옥타브(12)다', () => {
    expect(new Set(SCALE_KINDS.map((k) => k.name)).size).toBe(SCALE_KINDS.length);
    expect(new Set(SCALE_KINDS.map((k) => k.steps.join(','))).size).toBe(SCALE_KINDS.length);
    for (const k of SCALE_KINDS) expect(k.steps.reduce((a, b) => a + b, 0), k.name).toBe(12);
  });

  it('음계 순서(orderedScale)를 쓰는 모든 판본이 어떤 이름으로 불리는지 못 박는다: 새 과제가 생기면 여기서 정한다', () => {
    const want: Record<string, string> = {
      'scale.major': '장음계',
      'scale.natural-minor': '자연단음계',
      'scale.harmonic-minor': '화성단음계',
      'scale.pentatonic': '다섯 음 음계',
      'staff.range-ladder': '음계', // 간격이 4, 3, 5…나 12…라서 아는 음계가 아니다
      'scale.chromatic': '음계', // 간격이 열둘 모두 1이라 목록에 없다. 반음계라는 말과 오름·내림은 판본의 keyName('C 반음계(오름)')에 담았다
      'key.accidentals-in-a-bar': '음계', // 방향이 sequence(X-4)라 간격 목록이 없다. 이 과제의 안내 글은 ScalePanel이 아니라 임시표 패널과 건반 다리가 쓴다
    };
    const seen = new Set<string>();
    for (const q of QUESTS) {
      for (const vid of q.variantIds as string[]) {
        const spec = q.variants[vid].evaluatorSpec;
        if (spec.type !== 'orderedScale') continue;
        seen.add(q.questId);
        expect(want[q.questId], `${q.questId}의 이름을 이 시험이 정하지 않았어요`).toBeDefined();
        expect(scaleNameOf(spec.midiSteps), `${q.questId}/${vid}`).toBe(want[q.questId]);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(want).sort());
  });
});

describe('통과 문장(slotPassedText)', () => {
  it('음계 이름을 주지 않으면 장음계로 읽는다: Q07의 문장은 이전과 글자까지 같다', () => {
    expect(slotPassedText('C장조', 8)).toBe('8자리의 음이 C장조의 장음계와 같아요.');
    expect(slotPassedText('B♭장조', 8)).toBe('8자리의 음이 B♭장조의 장음계와 같아요.');
    expect(slotPassedText(undefined, 8)).toBe('8자리의 음이 장음계와 같아요.');
  });

  it('음계 이름을 주면 그 이름으로 말한다(자리 수도 데이터에서 온다)', () => {
    expect(slotPassedText('D단조', 8, '자연단음계')).toBe('8자리의 음이 D단조의 자연단음계와 같아요.');
    expect(slotPassedText('A단조', 8, '화성단음계')).toBe('8자리의 음이 A단조의 화성단음계와 같아요.');
    expect(slotPassedText('C장조', 6, '다섯 음 음계')).toBe('6자리의 음이 C장조의 다섯 음 음계와 같아요.');
    expect(slotPassedText(undefined, 8, '음계')).toBe('8자리의 음이 음계와 같아요.');
  });

  it('새 과제의 판본마다 간격 목록에서 읽은 이름으로 문장이 나온다', () => {
    const sentence = (questId: string, vid: string): string => {
      const q = QUESTS.find((x) => x.questId === questId)!;
      const spec = q.variants[vid].evaluatorSpec;
      return slotPassedText(spec.keyName, spec.count, scaleNameOf(spec.midiSteps));
    };
    expect(sentence('scale.natural-minor', 'a-minor')).toBe('8자리의 음이 A단조의 자연단음계와 같아요.');
    expect(sentence('scale.natural-minor', 'd-minor')).toBe('8자리의 음이 D단조의 자연단음계와 같아요.');
    expect(sentence('scale.natural-minor', 'e-minor')).toBe('8자리의 음이 E단조의 자연단음계와 같아요.');
    expect(sentence('scale.harmonic-minor', 'a-harmonic-minor')).toBe('8자리의 음이 A단조의 화성단음계와 같아요.');
    expect(sentence('scale.pentatonic', 'c-pentatonic')).toBe('6자리의 음이 C장조의 다섯 음 음계와 같아요.');
    expect(sentence('scale.major', 'g-major')).toBe('8자리의 음이 G장조의 장음계와 같아요.');
  });
});

describe('주제 이름(topicName)', () => {
  it('음계 길 과제의 새 주제 태그에 화면 이름이 있다', () => {
    expect(['minor', 'natural-minor', 'harmonic-minor', 'pentatonic'].map(topicName)).toEqual(['단음계', '자연단음계', '화성단음계', '다섯 음 음계']);
    // 이미 있던 이름은 그대로다
    expect(['scale', 'major', 'whole-and-half-steps'].map(topicName)).toEqual(['음계', '장음계', '온음과 반음']);
  });

  it('Q24–Q26의 주제 태그는 모두 화면 이름이 있다(영어 태그가 그대로 보이지 않는다)', () => {
    for (const id of ['scale.natural-minor', 'scale.harmonic-minor', 'scale.pentatonic']) {
      const q = QUESTS.find((x) => x.questId === id)!;
      for (const tag of q.topicTags as string[]) expect(topicName(tag), `${id}의 ${tag}`).not.toBe(tag);
    }
  });
});
