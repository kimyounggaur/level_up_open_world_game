# 참고 문서

원본은 Google Drive에 있다. 이 저장소에는 설계서만 복사해 두고, 나머지는 문서 ID로 가리킨다.

| 문서 | 위치 |
|---|---|
| 리메이크 설계서 v0.1 | `docs/design/open-world-remake-design-v0.1.md` (이 저장소의 복사본) |
| 기획안 v1.0 | Drive 문서 `12j4iB0Aw_r5v3nJqbWKrmN5EFHWhXk89zNaFuuTmeSI` |
| 상세 구현 설계 v1.0 | Drive 문서 `1niUYeRZAfGM0p-76cppuFxwtBMZtrf7-h3eNHPRE5gY` |
| 회의 정리와 설계 원칙 | Drive 문서 `1XQN-Qc2npDOcV_XfniEWfbNE2t5A0-aFf34Mgu70ZsI` |
| UI 시안 v2 | Drive 폴더 `1biQ0t_3z2wmm4kecuiHFPR5gToLYd5yx` |
| 프로젝트 폴더 | Drive 폴더 `1rsIXAE2rBcMjy5EgxLQQQ5npfDVcUMEk` |

## 코드 규칙 요약 (설계서 10.2)

- `src/domain`: 순수 계산. 화면, 소리, 저장 장치, 시계를 모른다. `npm run check:deps`가 강제한다.
- `src/audio`: domain만. `src/platform`: domain만. `src/world`와 `src/ui`: 서로 직접 부르지 않는다(이벤트로만).
- 작업은 12장의 번호 단위로 한다. 테스트를 먼저 쓰고, 통과시키려고 고정값을 바꾸지 않는다.
