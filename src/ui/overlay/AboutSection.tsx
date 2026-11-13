// 설정의 '정보' 구역(8-2, 설계서 10.9, 13.3의 8-1): 이 앱이 받지 않는 것과 저장하는 곳을 한 단락으로 말하고,
// 이 앱에 들어 있는 오픈소스와 악보 글꼴의 고지(저작권 표기와 라이선스 원문)를 접었다 펴는 상자에 보인다.
// 고지 원문은 빌드가 만드는 파일(public/THIRD-PARTY-NOTICES.txt)이고, src 밖이라 조립 지점(app)이 가져와 넘긴다.
// 파일 링크를 쓰지 않는 까닭: 서버가 글자 인코딩을 알리지 않으면 한글이 깨져 보일 수 있고, 오프라인에서도 열려야 한다.
export interface AboutSectionProps {
  /** 고지 원문(빌드가 만든 THIRD-PARTY-NOTICES.txt) */
  notices: string;
}

export function AboutSection({ notices }: AboutSectionProps) {
  return (
    <section class="settings-section" aria-labelledby="set-about" data-testid="about-section">
      <h2 id="set-about">정보</h2>
      <p class="muted small settings-note" data-testid="about-privacy">
        계정이 없고, 이름이나 연락처를 받지 않아요. 진행과 기록은 이 기기에만 저장되고 어디로도 보내지 않아요.
      </p>
      <details class="settings-details" data-testid="notices">
        <summary class="btn btn-quiet">오픈소스와 글꼴 고지 보기</summary>
        <p class="muted small settings-note">이 앱에 들어 있는 소프트웨어와 악보 글꼴의 저작권 표기와 라이선스예요.</p>
        <pre class="notices-text" tabIndex={0} aria-label="오픈소스와 글꼴 고지 원문" data-testid="notices-text">
          {notices}
        </pre>
      </details>
    </section>
  );
}
