// 화면 안에서 이동하는 길을 컴포넌트에 알려 준다. 주소 규칙(router)은 앱이 쥐고, 화면은 '닫기'와 '가기'만 안다.
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export interface NavApi {
  /** 지금 화면을 닫는다. 앱 안에서 온 화면이면 온 곳으로, 주소로 바로 열었으면 fallback(없으면 월드)으로 간다 */
  close(fallback?: string): void;
  /** 다른 화면으로 간다 */
  go(hash: string): void;
}

export const NavContext = createContext<NavApi>({ close: () => undefined, go: () => undefined });

export const useNav = (): NavApi => useContext(NavContext);
