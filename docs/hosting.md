# 호스팅 (8-5)

정식 공개(release) 빌드를 정적 호스팅에 올릴 때 지켜야 할 조건이다. 이 저장소는 서버를 갖지 않는다. 앱이 하는 일은 같은 주소에서 파일을 받는 것뿐이라(`docs/privacy-flow.md`) 아래 조건은 모두 **호스팅의 설정**이다.

이 문서의 값은 시험 도구 `tests/flow/hosting.ts`가 보내는 머리말과 같다. 같은지는 단위 시험 `tests/unit/hosting-doc.test.ts`가 지키고, 값을 고치려면 세 곳(`hosting.ts`, 이 문서, 저장소 뿌리의 `vercel.json`)을 함께 고친다. `vercel.json`이 같은지도 같은 시험이 지킨다. 이 저장소는 아래 설정을 실제 호스팅에 올려 본 적이 없다. 같은 머리말을 보내는 시험 서버로 실제 Chrome에서 본 것이 전부다(맨 아래 '알려진 한계').

## 한눈에

| 조건 | 값 | 왜 | 확인한 방법 |
|---|---|---|---|
| 올리는 폴더 | `npm run build:release`가 만드는 `dist-release/`의 안쪽 전부. 미리보기 빌드(`dist/`)는 공개 호스팅에 올리지 않는다(`vercel.json`은 지금 미리보기를 짓도록 적혀 있다: D-307) | 미리보기는 검수 전 콘텐츠를 '검수 전' 표지로 열고, 점검용 연결(`window.__game`)과 개발용 화면이 있다 | `release.flow.ts`가 공개 빌드에 점검용 연결이 없고 개발용 주소가 닫혀 있음을 실제 Chrome에서 본다 |
| 글 파일 압축 | **gzip 필수**(html, js, css, json, svg, txt). brotli는 선택이고 재지 않았다 | 느린 회선(3G Fast, CPU 4배 느리게)에서 월드 준비가 압축이 없으면 20.86초, gzip이면 10.89초다(D-292) | 8-4의 불러오기 시간 표, `release.flow.ts`가 받은 응답의 `content-encoding`을 본다 |
| 캐시 | `assets/*`는 `public, max-age=31536000, immutable`. 나머지(`index.html`, `world/*`, `THIRD-PARTY-NOTICES.txt`)는 `no-cache`(검사자 `ETag`) | `assets/*`는 이름에 해시가 있어 내용이 바뀌면 이름이 바뀐다. 나머지는 이름이 그대로라 쓸 때마다 확인해야 낡은 파일이 새 앱과 섞이지 않는다 | `release.flow.ts`가 받은 응답의 `cache-control`, `revisit.flow.ts`의 두 번째 방문 측정 |
| 내용 보안 정책 | 아래 '보안 머리말'의 한 줄 | 앱이 부르는 곳은 같은 주소뿐이고 그것을 브라우저가 지키게 한다 | `default-src 'self'`에서 시작해 막힌 것을 하나씩 열었다. `release.flow.ts`와 `FLOW_HOSTED=1` 흐름 시험 |
| HTTPS와 HSTS | 주소는 HTTPS만 쓰고 `Strict-Transport-Security`를 보낸다 | 개인정보 보호와 머리말의 신뢰 | 시험 서버는 HTTP라 **확인하지 못했다**(사람) |
| 접속 분석 | 끈다. 이 앱은 분석 도구를 싣지 않고 호스팅도 쓰지 않는다 | 앱이 사용 기록을 보내지 않는다는 약속(`docs/privacy-flow.md`)과 맞춘다 | 앱 쪽은 `release.flow.ts`가 요청이 모두 같은 주소임을 본다. 호스팅 쪽은 **사람** |
| 접속 기록 | 호스팅 서버가 남기는 요청 기록의 보관 기간을 정하고 적는다 | 요청의 주소, 시각, 브라우저 종류는 서버에 보인다 | **사람**(법률 검토 포함) |
| 경로 처리 | 별도 설정이 필요 없다 | 주소는 `#/...`(해시)라 모든 화면이 `index.html` 한 파일이다. 없는 경로는 404여도 된다 | `release.flow.ts`가 해시 주소(`#/list`, `#/q/…`, `#/s/…`)로 화면을 연다 |

## 올릴 폴더

```
npm run build:release
```

공개 점검(`npm run check:release`, `docs/operations.md`)을 통과해야 `dist-release/`가 만들어진다. 지금처럼 공개 채널에서 열리는 과제가 0개이거나 권리가 미확인인 대장 항목이 있으면 점검이 멈추고 빌드하지 않는다. 점검이 통과해도 G2가 통과한 것이 아니다. 점검이 대신하지 않는 일의 목록(`HUMAN_RELEASE_STEPS`)을 매번 함께 적는다.

`index.html`은 `base: './'`로 지어서 파일을 상대 경로로 부른다. 도메인 뿌리가 아니라 하위 경로(`https://예시.kr/music/`)에 올려도 된다. 다만 아래 머리말의 `/assets/` 같은 경로 조건은 올린 하위 경로에 맞춘다.

## 보안 머리말

모든 응답에 붙인다.

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

HTTPS에서는 여기에 `Strict-Transport-Security: max-age=31536000`을 더한다(`includeSubDomains`와 `preload`는 같은 도메인의 다른 서비스에 영향을 주므로 주인이 정한다).

### 내용 보안 정책을 어떻게 정했나

`default-src 'self'` 하나로 시작해, 실제 Chrome에서 공개 빌드를 열어 마을이 그려지고 소리를 켠 뒤 설정을 여는 사용을 하면서 막힌 것을 모았다.

| 정책 | 막힌 것 | 결과 |
|---|---|---|
| `default-src 'self'`만 | 그림 data 주소 5건(Phaser의 기본 그림 4개와 아이콘 1개), 글꼴 data 주소 3건(VexFlow가 악보 글꼴 세 개를 data 주소로 담고 있다가 올린다), 작업자 blob 주소 1건(Tone.js의 시계) | 월드가 `Cannot read properties of undefined (reading 'glTexture')` 오류로 그려지지 않는다 |
| 위에 `img-src data:`, `font-src data:`, `worker-src blob:`을 열고 `img-src blob:`은 열지 않음 | 그림 blob 주소(Phaser가 받은 그림 파일을 blob 주소로 올린다) 10건 | 땅 그림이 막힌다 |
| 위에 `img-src blob:`까지 열고 나머지는 `default-src 'self'` | 없음(0건) | 월드가 그려지고 소리가 켜진다 |

그래서 열어 둔 것은 네 가지다: `img-src data:`, `img-src blob:`, `font-src data:`, `worker-src blob:`. 스크립트와 스타일은 `default-src 'self'`를 그대로 따른다. 인라인 스크립트와 `eval`, 다른 주소에서 오는 스크립트는 허용하지 않는다. `connect-src 'self'`라서 앱이 다른 주소로 요청을 보내려 해도 브라우저가 막는다.

네 가지가 정말 필요한지는 `release.flow.ts`의 대조 시험이 하나씩 빼서 본다. 열린 정책에서 위반이 없는지는 `FLOW_HOSTED=1`로 돌린 흐름 시험(`tests/flow/harness.ts`가 막힌 것을 모아 시험을 끝낼 때 실패시킨다)이 본다.

스타일도 같은 정책을 따른다. HTML 글자 안의 `style` 속성과 `<style>` 요소는 적용되지 않고 `Applying inline style violates…` 위반으로 세어진다. 자바스크립트가 `el.style`(CSSOM)로 주는 모양은 막지 않는다. 최종 점검에서 흐름 시험 35개 파일을 이 정책 아래서 돌렸을 때 정책이 막은 것은 시험이 일부러 심은 결함 다섯 건뿐이었다(`docs/approvals.md`의 '최종 점검', D-304). 앞으로 화면이 `style` 속성이 든 HTML 글자를 만들어 넣으면(예: `innerHTML`) 호스팅에서는 그 모양이 빠진다.

`frame-ancestors 'none'`과 `X-Frame-Options: DENY`는 이 앱을 다른 사이트의 `iframe`에 넣지 못하게 한다. 학교 학습 관리 시스템 등에 넣을 계획이 생기면 이 둘을 새 결정으로 연다.

보고 주소(`report-uri`, `report-to`)는 두지 않았다. 앱이 어디에도 보내지 않는다는 약속과 맞추기 위해서다. 정책 위반은 브라우저의 콘솔에서만 보인다.

## 캐시

| 경로 | `Cache-Control` | 까닭 |
|---|---|---|
| `assets/*` (앱 번들, 소리 모듈, 스타일) | `public, max-age=31536000, immutable` | 파일 이름에 내용의 해시가 있다. 바뀌면 이름이 바뀐다 |
| `index.html`, `world/*`, `THIRD-PARTY-NOTICES.txt` | `no-cache` | 이름이 그대로라서 쓸 때마다 호스팅에 물어(`ETag`, 304) 낡은 것을 쓰지 않는다 |

`world/*`(바닥 조각 48장(가로 8 × 세로 6), 사물 그림판과 그 목록, 지도 그림, 조각 목록, 모두 52개)는 이름에 해시가 없어서 `no-cache`다. 두 번째 방문에도 파일마다 확인 요청이 가고 내용은 오지 않는다(304). 느린 회선에서는 이 요청의 왕복이 쌓인다(측정은 아래). 이름에 해시를 붙이는 것은 `world/` 빌드(`npm run build:world`)를 바꾸는 일이라 이 단계에서 하지 않았다.

## 압축

글 파일(`.html`, `.js`, `.css`, `.json`, `.svg`, `.txt`)에 gzip을 켠다. 이미지(`.webp`, `.png`)와 글꼴(`.woff2`)은 이미 압축된 형식이라 다시 압축하지 않는다. 첫 화면까지 받는 양은 압축 없이 3.29 MiB, gzip으로 1.21 MiB다(8-4).

## 호스팅별 예시 (이 저장소가 올려 보지 못했다)

문법과 값은 각 호스팅의 문서에서 확인한다. 아래는 위 값을 옮긴 것이다.

**Netlify**(배포 폴더의 `_headers` 파일. 압축은 자동):

```
/*
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

**Vercel**(저장소 뿌리의 `vercel.json`이 이 내용이다. 압축은 자동. 설치(`npm ci`), 빌드(`npm run build`), 출력 폴더(`dist`)도 함께 적었다. `index.html`, 루트 주소, `world/*`, 고지문은 `no-cache`를 `source`마다 적었다. **지금의 `vercel.json`은 미리보기 빌드(`dist/`)를 짓는다**: 공개 점검이 막혀 `dist-release/`를 만들 수 없어서다(D-307). 정식 공개 빌드를 올릴 때는 `buildCommand`를 `npm run build:release`로, `outputDirectory`를 `dist-release`로 바꾼다):

```json
{
  "framework": "vite",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000" }
      ]
    },
    { "source": "/assets/(.*)", "headers": [ { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] },
    { "source": "/", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] },
    { "source": "/index.html", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] },
    { "source": "/world/(.*)", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] },
    { "source": "/THIRD-PARTY-NOTICES.txt", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] }
  ]
}
```

**Nginx**: `gzip on; gzip_types text/css text/javascript application/javascript application/json image/svg+xml text/plain;` 과 `location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; }`. 주의: `location` 안에서 `add_header`를 쓰면 바깥(`server`)의 `add_header`를 물려받지 않는다. 보안 머리말을 그 `location`에도 되풀이하거나 한 파일로 묶어 `include`한다. `index.html`과 `world/`에는 `add_header Cache-Control "no-cache" always;`.

**Caddy**: `encode gzip`, `header { Content-Security-Policy "…" … }`, `@assets path /assets/*` 다음 `header @assets Cache-Control "public, max-age=31536000, immutable"`.

## 접속 분석과 접속 기록 (사람이 한다)

- 호스팅이 제공하는 방문 분석(페이지 조회수, 지역, 기기 종류를 모으는 것)은 **끈다**. 앱이 아무것도 보내지 않는다는 말이 호스팅의 분석 때문에 거짓이 되지 않게 한다.
- 호스팅 서버는 파일 요청마다 주소, 시각, 브라우저 종류, 접속 주소를 남길 수 있다. 호스팅을 고를 때 기록의 보관 기간과 끄는 방법을 확인하고 이 문서에 적는다. 이 저장소가 알 수 없다.
- 개인정보 보호법의 적용(특히 대상 이용자가 정해지면, 만 14세 미만이면)은 법률 검토가 필요하다(`docs/privacy-flow.md`). 이 문서와 점검이 대신하지 않는다.

## 두 번째 방문과 불러오기 (실제 Chrome, 시험 서버)

위 캐시 머리말을 보내는 시험 서버(`tests/flow/hosting.ts`)에 실제 Chrome을 붙여, 같은 브라우저 안에서 처음 열고 바로 다시 열었다(`tests/flow/revisit.flow.ts`). 회선은 3G Fast(1.6 Mbps, 왕복 150 ms), CPU는 4배 느리게다(8-4의 표와 같은 조건). 점검용 연결(`window.__game`)이 필요해서 미리보기 빌드(`dist/`)로 쟀다. 파일 이름, 머리말, 캐시 동작은 공개 빌드와 같다. 이 컨테이너(CPU 코어 2개, 소프트웨어 그리기)의 값이고 기기의 값이 아니다. 같은 시험을 두 번 돌렸다(1차 / 2차).

| | 처음 열기 | 다시 열기 |
|---|---|---|
| 안내 카드가 보일 때까지 | 4.30초 / 4.25초 | 0.97초 / 0.88초 |
| 월드가 준비될 때까지 | 10.45초 / 10.53초 | 4.17초 / 4.52초 |
| 바닥 조각이 올라올 때까지 | 12.36초 / 12.48초 | 6.32초 / 7.23초 |
| 서버가 받은 요청 | 18개 | 15개(모두 304) |
| 본문으로 받은 양(gzip) | 1,273,441 B | 0 B |

- `assets/*` 3개는 다시 받지 않는다(브라우저 캐시). 요청 18개에서 이 3개가 빠진 15개가 남는다.
- 남은 15개는 `index.html` 1개와 `world/*` 14개다. 모두 확인 요청에 304가 돌아오고 본문은 오지 않는다.
- 다시 열어도 월드가 준비되기까지 4~4.5초가 걸린다. 받는 양은 0인데도 드는 이 시간에서 회선(확인 요청 15개의 왕복)과 CPU(코드를 읽고 월드를 만드는 시간)가 각각 얼마인지는 나누어 재지 않았다.
- **같은 시험을 `release.flow.ts` 안에서 다른 시험들 뒤에 돌렸을 때는 처음 열기가 월드 준비 15~16초, 다시 열기가 9.4초로 나왔다**(두 번 돌려 모두 비슷했다). 새 브라우저에서 따로 열면 위 표의 값이고 8-4의 표(월드 준비 10.89초)와 같은 수준이다. 서버(보안 머리말이 있는 시험 서버, 머리말을 뺀 같은 서버, 8-4의 하니스 서버)와 `FLOW_HOSTED=1`의 콘솔 감시를 바꿔 같은 빌드를 열어 본 임시 실험은 모두 약 10초였다. 그러므로 서버나 머리말 탓이 아니고 같은 브라우저에서 앞선 시험이 돈 뒤의 영향으로 보이지만 **원인은 가리지 못했다.** 그래서 시간을 재는 시험은 새 브라우저에서 도는 별도 파일로 두었다. 이 표를 다른 기록과 견줄 때는 같은 조건(새 브라우저)끼리 견준다.
- 시험이 지키는 것은 시간의 크기가 아니라 관계다: `assets/*`를 다시 받지 않는다, 다시 열 때 받는 응답이 모두 304이고 본문이 0바이트다, 다시 열 때가 처음보다 짧다(바닥 조각이 올라올 때까지).

## 알려진 한계

- **실제 호스팅에서 확인하지 못했다.** 위의 모든 것은 같은 머리말을 보내는 시험 서버(`tests/flow/hosting.ts`)에 실제 Chrome을 붙여 본 것이다. 호스팅이 머리말을 덮어쓰거나, 압축을 끄거나, 다른 값을 보내는 것은 올려 본 사람이 확인한다.
- HTTPS와 HSTS는 시험 서버가 HTTP라 보지 못했다. HTTPS에서만 달라지는 브라우저의 동작(혼합 콘텐츠, 보안 맥락이 필요한 기능)은 이 앱이 쓰지 않는 것으로 알지만 시험하지 않았다.
- 내용 보안 정책은 Chrome 하나에서 쟀다. 사파리와 파이어폭스가 같은 네 가지로 충분한지는 **사람이** 기준 기기에서 본다(점검표 P6의 첫 열기와 함께).
- `world/*`가 이름에 해시가 없어 `no-cache`라서 두 번째 방문에도 마을을 여는 데 쓰는 `world/*` 14개와 `index.html`에 확인 요청이 간다(내용은 오지 않는다, 위 표).
- 새 판을 올리는 순간 이미 열려 있던 탭은 옛 파일로 계속 돈다(`docs/operations.md`).
- brotli와 HTTP/2 이상의 효과는 재지 않았다.
