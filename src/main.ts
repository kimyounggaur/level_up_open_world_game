// 시작점. 월드(Phaser)는 #game-root에, 화면(HUD, 패널, 겹침 화면)은 #ui-root에 붙는다. 월드는 처음 보일 때 늦게 켠다.
// 화면을 그리기 전에 저장을 읽는다: 새로 고쳐도 같은 자리, 같은 초안, 같은 설정으로 시작한다(10.6).
import { render, h } from 'preact';
import { App } from './app/App';
import { openSave, optionsFromSave } from './app/boot';
import { createAppContext } from './app/composition';
import { browserPageEvents } from './app/persistence';
import { browserStorageEnv } from './platform/storage';
import './ui/panels.css';
import './ui/hud.css';
import './ui/map.css';
import './ui/notebook.css';
import './ui/installation.css';
// 햇살 과슈 UI 스킨(D-308): 겉모습만 덮어쓰므로 마지막에 불러온다
import './ui/skin.css';
import './ui/remaster.css';

async function start(): Promise<void> {
  const root = document.getElementById('ui-root');
  if (!root) return;
  const loaded = await openSave(browserStorageEnv(window));
  const ctx = createAppContext({
    ...optionsFromSave(loaded.save),
    usageLog: loaded.usageLog,
    persistence: { storage: loaded.storage, restored: loaded.save, pageEvents: browserPageEvents(window) },
  });
  render(h(App, { ctx }), root);
  // 개발 중에 콘솔에서 살펴볼 수 있게 한다(미리보기 채널)
  if (__RELEASE_CHANNEL__ === 'preview') (window as unknown as { __game?: unknown }).__game = ctx;
}

void start();
