// 조작 안내(7.8의 '조작 안내 다시 보기'). 월드와 패널의 조작을 한곳에 모은다. 끌지 않아도, 키보드만으로도, 터치만으로도 모두 할 수 있다(W-4).
import { overlayHash } from '../../platform/router';
import { BENCH_KEY_TABLE } from '../challenge/benchKeys';
import { OverlayFrame } from './OverlayFrame';

export function HelpOverlay() {
  return (
    <OverlayFrame title="조작 안내" subtitle="끌지 않아도 모두 할 수 있어요. 키보드만으로도, 터치만으로도 같은 일을 할 수 있어요." testId="help">
      <section class="help-section" aria-labelledby="help-walk">
        <h2 id="help-walk">마을에서 걷기</h2>
        <ul class="help-list">
          <li>
            <strong>키보드</strong>: 방향키 또는 W A S D로 걸어요. 대각선으로도 걸을 수 있어요.
          </li>
          <li>
            <strong>마우스·터치</strong>: 가고 싶은 곳을 누르면 길을 찾아 걸어가요. 작업대나 설치물을 누르면 그 앞까지 걸어가서 열어요.
          </li>
          <li>
            <strong>열기</strong>: 작업대 가까이 가면 아래에 이름이 나와요. E 또는 Enter를 누르거나, 이름 칩을 눌러요.
          </li>
        </ul>
      </section>
      <section class="help-section" aria-labelledby="help-screens">
        <h2 id="help-screens">화면 열기와 닫기</h2>
        <ul class="help-list">
          <li>
            <kbd>M</kbd> 지도: 모든 정거장이 처음부터 보여요. '걸어가기'나 '바로 이동'을 고를 수 있어요.
          </li>
          <li>
            <kbd>L</kbd> 목록: 걷지 않고 바로 어느 도전이든 열어요. 지금 하는 일에 이어지는 도전이 있으면 앞에 놓이고 이유가 한 줄 붙어요. 어느 것이든 열 수 있어요.
          </li>
          <li>
            <kbd>N</kbd> 수첩: 열어 본 것과 통과한 것이 적혀 있어요. 통과에는 그때의 템포와 도움을 썼는지도 함께 적혀요. 세로 화면에서는 아래의 '최근 작업'이에요.
          </li>
          <li>
            <kbd>Esc</kbd> 또는 '돌아가기': 열린 화면을 닫고 온 곳으로 돌아가요.
          </li>
          <li>도전은 <code>#/q/과제 id/판본 id</code> 주소로도 바로 열 수 있어요.</li>
        </ul>
      </section>
      <section class="help-section" aria-labelledby="help-panel">
        <h2 id="help-panel">도전 패널 안에서</h2>
        <ul class="help-list">
          <li>Tab / Shift+Tab: 다음 · 이전 단추로 이동</li>
          <li>Enter 또는 Space: 누르기</li>
          <li>오선에서 ↑ ↓: 한 칸씩 위아래로 옮기기</li>
          <li>박 칸에서 ← →: 옆 칸으로 이동, Delete: 칸 비우기</li>
          <li>Ctrl+Z / Ctrl+Y: 실행 취소 / 다시 실행</li>
          <li>글자를 입력하는 동안에는 걷기 키가 캐릭터에게 전달되지 않아요.</li>
        </ul>
      </section>
      <section class="help-section" aria-labelledby="help-installation">
        <h2 id="help-installation">음계 디딤돌에서 놓기</h2>
        <ul class="help-list">
          <li>음계 디딤돌 가까이 가서 열면 그 앞에서 작업대가 열려요. 돌을 누르면 손에 든 음이 놓여요. 끌지 않아도 돼요.</li>
          <li>맨 위 '표지판'에서 '자유로 놀기'(판정 없음)나 과제를 골라요. 과제는 '패널로 보기'로 같은 것을 패널에서 풀 수도 있어요.</li>
          {BENCH_KEY_TABLE.map((row) => (
            <li key={row.keys}>
              <kbd>{row.keys}</kbd> {row.label}
            </li>
          ))}
          <li>걷는 중에 돌을 밟으면 그 음이 잠깐 울려요. 빈 돌은 조용해요.</li>
        </ul>
      </section>
      <section class="help-section" aria-labelledby="help-sound">
        <h2 id="help-sound">소리</h2>
        <p>소리는 '소리 켜기'를 누른 뒤에만 나요. 소리를 끈 채로도 걷고, 도전을 풀 수 있어요.</p>
        <p data-testid="help-no-sound">
          소리를 켰는데 들리지 않으면 기기의 음량을 먼저 확인해 보세요. 아이폰과 아이패드는 무음 모드이면 브라우저 소리가 나지 않을 수 있어요. 이어폰이나 블루투스 스피커가
          연결되어 있는지도 살펴보세요.
        </p>
        <p>바깥 지역에는 큰 악기가 있어요. 물방울 북이나 메아리 벽 앞의 돌에 걸어 올라서면 그 돌의 음이 울려요. 찾을 것도, 기록도 없이 그냥 노는 곳이에요.</p>
      </section>
      <section class="help-section" aria-labelledby="help-settings">
        <h2 id="help-settings">글자 크기와 움직임</h2>
        <p>글자를 키우거나, 화면 움직임을 줄이거나, 소리 크기를 바꾸는 것은 설정에서 해요.</p>
        <p>
          <a class="btn" href={overlayHash('settings')}>
            설정 열기
          </a>
        </p>
      </section>
    </OverlayFrame>
  );
}
