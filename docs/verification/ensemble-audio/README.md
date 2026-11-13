# 광장 합주 열두 가지 조합의 녹음 (7-5)

설계서 12.10의 7-5 완료 기준 '대표 조합 12가지를 들어 통과'를 사람이 확인할 때 쓰는 듣기 자료입니다. **이 녹음이 귀로 듣는 점검을 대신하지는 않습니다.** 점검표와 자동 점검(`npm run ensemble`, `npm run check:ensemble`)이 센 것은 악보에서 셀 수 있는 거슬림뿐이고, 어떻게 들리는지는 사람이 들어야 합니다. 이 점검이 끝나기 전에는 7-5에 '통과'를 적지 않습니다(`docs/approvals.md`의 7-5).

## 어떻게 만들었나
- 조합마다 그 층이 되도록 통과한 과제를 저장에 심고(`seedSave`) 실제 Chrome(headless, 화면 640×360)으로 앱을 열어 마을 광장에 서서 소리를 켠 뒤, 앱이 내는 소리를 33초 녹음했습니다(`tests/flow/phase7-ensemble.flow.ts`가 `ENSEMBLE_RECORD_DIR`에 `<조합 이름>.webm`으로 남깁니다). Opus(webm)로 받은 것을 `ffmpeg`로 mp3(128 kbps, 44.1 kHz, 스테레오)로 바꿨고 음량은 건드리지 않았습니다. 그래서 조합끼리 크기를 견줄 수 있습니다.
- 처음 약 2초는 첫 마디가 시작하기 전의 침묵입니다. 33초는 8마디 되풀이(24초)를 한 번 넘게 들려줍니다. 마디 하나는 3초(4분음표 80, 4/4)입니다.
- 다장조, 진행 C F G C Am F G C입니다. 맥박은 늘 있고, 층이 오르면 소리가 더해지기만 합니다(먼저 있던 성부는 그대로입니다).
- 소프트웨어로 소리를 내는 headless Chrome의 출력이라 휴대폰이나 노트북 스피커, 헤드폰에서 직접 듣는 것과 다릅니다. 가락과 꾸밈음은 이 구현이 자동으로 만든 임시 판입니다(사람의 음악 검수 전).
- 이 녹음은 7-5 시점의 소리입니다. 가락, 달리는 음, 꾸밈음을 고치면 낡으니 다시 만드세요: `npm run build` 뒤에 `ENSEMBLE_RECORD_DIR=<빈 폴더> npx vitest run -c vitest.flow.config.ts tests/flow/phase7-ensemble.flow.ts`로 webm을 얻고 `ffmpeg -i <조합>.webm -ac 2 -ar 44100 -codec:a libmp3lame -b:a 128k <조합>.mp3`로 바꿉니다.

## 열두 가지
층은 마을, 오선 언덕(가락), 박자 강가(타악), 종나무 숲(베이스), 음계 길(달리는 음), 건반 늪(꾸밈음) 차례입니다. '합'은 여섯 층의 합(0–18), '성부'는 소리 나는 성부의 수(맥박 포함), 최댓값(선형, 1이 꼭대기)과 RMS(dBFS)는 실제 Chrome 흐름 시험이 33초 동안 잰 앱 출력의 값입니다.

| 파일 | 이름 | 층 | 합 | 성부 | 최댓값 | RMS(dBFS) |
|---|---|---|---|---|---|---|
| c01-start.mp3 | 처음(층이 모두 0) | 000000 | 0 | 1 | 0.0297 | −43.7 |
| c02-first-quest.mp3 | 첫 과제 하나(Q01) | 110000 | 2 | 3 | 0.0977 | −29.6 |
| c03-melody.mp3 | 오선 언덕만 끝낸 소리 | 030000 | 3 | 2 | 0.0623 | −35.2 |
| c04-percussion.mp3 | 박자 강가만 끝낸 소리 | 003000 | 3 | 2 | 0.0524 | −42.8 |
| c05-bass.mp3 | 종나무 숲만 끝낸 소리 | 000300 | 3 | 2 | 0.0586 | −36.2 |
| c06-runner.mp3 | 음계 길만 끝낸 소리 | 000030 | 3 | 2 | 0.0515 | −42.8 |
| c07-ornament.mp3 | 건반 늪만 끝낸 소리 | 000003 | 3 | 2 | 0.0383 | −41.1 |
| c08-high-three.mp3 | 높은 소리 셋(가락, 달리는 음, 꾸밈음) | 030033 | 9 | 4 | 0.0712 | −34.2 |
| c09-low-three.mp3 | 낮은 소리 셋(화음, 타악, 베이스) | 303300 | 9 | 4 | 0.0805 | −33.3 |
| c10-ones.mp3 | 마을 3층, 바깥 지역 1층씩 | 311111 | 8 | 7 | 0.0907 | −32.2 |
| c11-twos.mp3 | 마을 3층, 바깥 지역 2층씩 | 322222 | 13 | 7 | 0.0930 | −32.4 |
| c12-full.mp3 | 모두 3층(합주 18층) | 333333 | 18 | 7 | 0.1088 | −30.0 |

## 조합마다 무엇을 들으면 되는가
- **c01-start** (처음(층이 모두 0), 층 000000): 맥박 하나뿐인 첫 소리. 잔치도 이 소리로 열린다.
  - 만드는 과제: 없음(처음 상태)
- **c02-first-quest** (첫 과제 하나(Q01), 층 110000): 과제 하나로 마을의 화음 깔기(온음표)와 오선 언덕의 가락 뼈대가 처음 더해지는 소리. 맥박 위에 소리가 겹치는 첫 순간.
  - 만드는 과제: `pitch.same-note-two-clefs`
- **c03-melody** (오선 언덕만 끝낸 소리, 층 030000): 가락이 옥타브 위 겹침까지 다 있고 화음은 없다: 가락 하나가 맥박 위에 선다.
  - 만드는 과제: `staff.lines-and-spaces`, `staff.ledger-lines`, `staff.middle-c-neighbors`
- **c04-percussion** (박자 강가만 끝낸 소리, 층 003000): 타악의 8분음표 채움. 소리 높이가 없어 맥박 곁에서 박자만 촘촘해진다.
  - 만드는 과제: `rhythm.three-four`, `rhythm.rest-lengths`, `rhythm.note-values`
- **c05-bass** (종나무 숲만 끝낸 소리, 층 000300): 걷는 베이스가 마디마다 다음 화음의 뿌리로 걸어간다. 맥박의 뿌리음과 겹치는 낮은 소리.
  - 만드는 과제: `chord.major-and-minor`, `chord.diminished-augmented`, `chord.primary-triads`
- **c06-runner** (음계 길만 끝낸 소리, 층 000030): 달리는 음이 2마디마다 오르고 내린다. 화음이 없는 채로 음계만 달린다.
  - 만드는 과제: `scale.natural-minor`, `scale.harmonic-minor`, `scale.pentatonic`
- **c07-ornament** (건반 늪만 끝낸 소리, 층 000003): 꾸밈음이 2마디마다 반음 아래에서 들어와 화음의 음에 앉는다. 다장조 밖의 음이 나오는 유일한 성부.
  - 만드는 과제: `key.black-key-names`, `key.whole-and-half-steps`, `key.build-intervals`
- **c08-high-three** (높은 소리 셋(가락, 달리는 음, 꾸밈음), 층 030033): 가락, 달리는 음, 꾸밈음이 모두 C5 안팎의 같은 높이에서 겹친다. 낮은 소리가 없어 높은 소리끼리 부딪히기 쉬운 조합.
  - 만드는 과제: `staff.lines-and-spaces`, `staff.ledger-lines`, `staff.middle-c-neighbors`, `scale.natural-minor`, `scale.harmonic-minor`, `scale.pentatonic`, `key.black-key-names`, `key.whole-and-half-steps`, `key.build-intervals`
- **c09-low-three** (낮은 소리 셋(화음, 타악, 베이스), 층 303300): 마을의 4분음표 펼친 화음, 타악의 8분음표 채움, 걷는 베이스가 낮은 곳에서 겹친다. 낮은 소리가 뭉치기 쉬운 조합.
  - 만드는 과제: `rhythm.rest-in-a-bar`, `rhythm.short-notes-and-triplets`, `chord.major-triad`, `chord.inversion`, `song.short-piece`, `rhythm.three-four`, `chord.major-and-minor`
- **c10-ones** (마을 3층, 바깥 지역 1층씩, 층 311111): 여섯 성부가 모두 들어 있되 모두 가장 성긴 모습. 층을 올리며 지나는 중간 지점.
  - 만드는 과제: `pitch.same-note-two-clefs`, `rhythm.rest-in-a-bar`, `chord.major-triad`, `scale.major`, `pitch.same-sound-different-names`
- **c11-twos** (마을 3층, 바깥 지역 2층씩, 층 322222): 여섯 성부가 모두 중간 밀도. 가락 전체와 4분음표 타악, 근음과 5음의 베이스, 내림 음계가 함께 든다.
  - 만드는 과제: `pitch.same-note-two-clefs`, `rhythm.rest-in-a-bar`, `chord.major-triad`, `scale.major`, `pitch.same-sound-different-names`, `staff.lines-and-spaces`, `rhythm.three-four`, `chord.major-and-minor`, `scale.natural-minor`, `key.black-key-names`
- **c12-full** (모두 3층(합주 18층), 층 333333): 여섯 성부가 모두 가장 빽빽한 완성된 합주. 가장 많이 겹치는 소리다.
  - 만드는 과제: `pitch.same-note-two-clefs`, `rhythm.rest-in-a-bar`, `chord.major-triad`, `scale.major`, `pitch.same-sound-different-names`, `rhythm.short-notes-and-triplets`, `chord.inversion`, `song.short-piece`, `staff.lines-and-spaces`, `staff.ledger-lines`, `staff.middle-c-neighbors`, `rhythm.three-four`, `rhythm.rest-lengths`, `rhythm.note-values`, `chord.major-and-minor`, `chord.diminished-augmented`, `chord.primary-triads`, `scale.natural-minor`, `scale.harmonic-minor`, `scale.pentatonic`, `key.black-key-names`, `key.whole-and-half-steps`, `key.build-intervals`

## 들을 때 볼 곳
- 조합마다 노래로 들리는지, 어디서 거슬리는지. 점검표에서 센 박이 아닌 곳의 짧은 부딪힘이 많은 조합은 c12(완성), c08(높은 소리 셋), c11(중간 밀도)입니다.
- 층이 오르며(c01 → c02 → c10 → c11 → c12) 소리가 더해질 때 먼저 있던 성부가 그대로 들리는지.
- 꾸밈음(c07)의 반음 앞꾸밈이 꾸밈으로 들리는지, 어긋난 소리로 들리는지.
- 소리 크기와 성부 사이의 균형. 가장 큰 c12도 최댓값이 꼭대기보다 19 dB 넘게 낮아서 작게 들릴 수 있습니다.
