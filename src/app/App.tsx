// 앱 최상위: 주소를 읽어 탐험(월드), 겹침 화면(지도·목록·수첩·설정·도움), 정거장 안내, 과제 패널, 소리 점검 중 하나를 보여 준다.
// 월드는 #game-root에 붙고 이 화면들은 그 위(#ui-root)에 얹힌다. 겹침 화면이나 패널이 열리면 월드는 멈춘다(7.5).
// 주소로 여는 과제는 선행 완료나 기록을 보지 않고 월드를 기다리지도 않는다(W-2). 열 수 없으면 이유와 전체 목록을 보여 준다(7.7).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { HOME_HASH, closeTo, isExploring, navigateTo, overlayHash, parseRoute, startRouter } from '../platform/router';
import type { Route, RouterWindow } from '../platform/router';
import { Hud } from '../ui/hud/Hud';
import { useController, useStore, useTouchOnly } from '../ui/common/hooks';
import { NavContext } from '../ui/common/nav';
import { BellHud } from '../ui/installation/BellHud';
import { InstallationHud } from '../ui/installation/InstallationHud';
import { StageHud } from '../ui/installation/StageHud';
import { KeyBridgeHud } from '../ui/installation/KeyBridgeHud';
import { TerraceHud } from '../ui/installation/TerraceHud';
import { TimelineHud } from '../ui/installation/TimelineHud';
import type { NavApi } from '../ui/common/nav';
import { QuestList } from '../ui/list/QuestList';
import { MapOverlay } from '../ui/map/MapOverlay';
import { Notebook } from '../ui/notebook/Notebook';
import type { NotebookPageId } from '../ui/notebook/Notebook';
import { relatedQuest } from '../ui/notebook/NotebookPages';
import { AboutSection } from '../ui/overlay/AboutSection';
import { HelpOverlay } from '../ui/overlay/HelpOverlay';
import { IntroCard } from '../ui/overlay/IntroCard';
import { FestivalCard } from '../ui/overlay/FestivalCard';
import { NoteCard } from '../ui/overlay/NoteCard';
import { ResidentCard } from '../ui/overlay/ResidentCard';
import { SaveNotice } from '../ui/overlay/SaveNotice';
import { SaveSection } from '../ui/overlay/SaveSection';
import { SettingsOverlay } from '../ui/overlay/SettingsOverlay';
import { StationSheet } from '../ui/overlay/StationSheet';
import { UsageLogSection } from '../ui/overlay/UsageLogSection';
import { PanelNotReady } from '../ui/panels/PanelNotReady';
import { SoundCheck } from '../ui/dev/SoundCheck';
import type { AppContext } from './composition';
import { NOTICES } from './notices';
import { PANELS, availablePanelIds } from './panels';
import { effectiveReducedMotion, prefersReducedMotion } from './settings';
import { resolveShortcut } from './shortcuts';
import { isSelectable } from '../domain/catalog';
import type { QuestEntry } from '../domain/catalog';
import { FREE_VARIANT_ID, freeInstallationOfHash, freeQuestId } from '../domain/content';
import { soundPiecesOf } from '../domain/discovery';
import type { ConceptNoteDef } from '../domain/discovery';
import { recommend } from '../domain/recommend';
import { residentOf, residentSay } from '../domain/residents';
import type { ResidentDef, ResidentSay } from '../domain/residents';
import { stationQuests } from '../domain/station-quests';
import { topicName } from '../ui/common/format';
import { stationTarget } from './station';

export interface AppProps {
  ctx: AppContext;
  win?: RouterWindow;
  /** 월드를 붙일 요소. 기본은 #game-root. 시험에서는 없어도 된다(월드 없이 화면만 그린다) */
  worldParent?: HTMLElement | null;
}

const PANEL_IDS = availablePanelIds();

export function App({ ctx, win = window, worldParent }: AppProps) {
  const { catalog, controller, world } = ctx;
  useController(controller);
  const touchOnly = useTouchOnly();
  const [route, setRoute] = useState<Route>(() => parseRoute(win.location.hash));
  // 주소가 바뀔 때마다 사용 기록(4-8)에도 알린다. 기록은 화면이 다시 그려지기 전에, 주소를 바꾼 그 흐름 안에서 받는다
  useEffect(
    () =>
      startRouter(win, (r) => {
        ctx.usage.routeChanged(r);
        setRoute(r);
      }),
    [win, ctx.usage],
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  // 지금 하는 과제(6.6 추천의 첫 규칙): 가장 최근에 연 과제. 저장하지 않는다
  const lastQuestRef = useRef<string | null>(null);
  // 지금 열 수 있는 과제인가(공개 상태와 화면). 추천(6.6)과 주민의 안내(7-6)가 같은 기준을 쓴다
  const openable = (e: QuestEntry): boolean => e.variants.some((v) => isSelectable(v.state) && v.panelIds.some((id) => PANEL_IDS.has(id)));

  const nav = useMemo<NavApi>(() => ({ close: (fallback) => closeTo(win, fallback), go: (hash) => navigateTo(win, hash) }), [win]);
  // 무대 바닥의 칸을 누르면 그 마디를 패널에서 연다(4.9): 컨트롤러는 화면을 옮길 길을 여기서 받는다
  useEffect(() => {
    ctx.installation.setNavigator(nav.go);
    return () => ctx.installation.setNavigator(null);
  }, [ctx.installation, nav]);

  // 첫 안내 카드(1.6): 처음 주소가 마을(#/)이고 아직 안내를 보지 않았을 때만 켠다. 설정의 '조작 안내 다시 보기'도 켠다
  const prefs = useStore(ctx.preferences);
  const openedQuests = useStore(ctx.opened.store);
  const installationUi = useStore(ctx.installation.state);
  const inInstallation = installationUi.mode !== null;
  // 합주 무대(T7)이면 돌 작업대 대신 무대 작업대를 보인다(4.9)
  const stageBench = inInstallation ? ctx.installation.stage : null;
  // 징검다리(T2)이면 돌 작업대 대신 징검다리 작업대를 보인다(4.4): 쉼표와 길이 있는 돌을 고르는 재료 선반이 다르다
  const timelineBench = inInstallation && !stageBench ? ctx.installation.timeline : null;
  // 종나무(T4)이면 종을 거는 작업대를 보인다(4.6): 음이름과 변화표 선반, 가지 위의 종이 다르다
  const bellBench = inInstallation && !stageBench && !timelineBench ? ctx.installation.bell : null;
  // 계단밭(T5)이면 큰보표 밭에 등을 놓는 작업대를 보인다(4.7): 변화표 선반과 높이 단추가 다르다
  const terraceBench = inInstallation && !stageBench && !timelineBench && !bellBench ? ctx.installation.terrace : null;
  // 건반 다리(T6)이면 널에 이름표를 걸고 말뚝과 깃발을 꽂는 작업대를 보인다(4.8): 이름표 선반과 음정 이름 단추가 다르다
  const keyBridgeBench = inInstallation && !stageBench && !timelineBench && !bellBench && !terraceBench ? ctx.installation.keyBridge : null;
  // 소리 물결(4-6): 정거장의 순서는 서명 소리가 쓰는 것과 같아야 같은 박에 퍼진다(composition의 worldAudio)
  const settings = useStore(ctx.settings);
  const rippleStations = useMemo(() => world.map.stations.map((s) => ({ id: s.stationId, name: s.name, x: s.x, y: s.y })), [world]);
  // 소리 조각의 물결(8.4): 이름은 싣지 않는다(못 찾은 것은 이름도 모른다). 차례는 소리 쪽과 같은 soundPiecesOf다
  const ripplePieces = useMemo(() => soundPiecesOf(ctx.discoveries).map((p) => ({ id: p.discoveryId, name: '소리 조각', x: p.x, y: p.y })), [ctx.discoveries]);
  const ripples = { stations: rippleStations, pieces: ripplePieces, clock: ctx.worldClock, enabled: settings.soundRipples, reducedMotion: effectiveReducedMotion(settings) };
  const [introArmed, setIntroArmed] = useState<boolean>(() => !ctx.preferences.get().introSeen && parseRoute(win.location.hash).kind === 'home');
  const introOpen = introArmed && !prefs.introSeen && route.kind === 'home';
  // 월드에서 연 개념 쪽지(3.6): 마을 위에 카드로 뜬다. 다른 화면으로 가면 닫는다
  const [note, setNote] = useState<ConceptNoteDef | null>(null);
  const noteOpen = note !== null && route.kind === 'home';
  // 잔치(6.4, 7.5): 합주 무대의 '잔치 열기'로 열린다. 열려 있는 동안 월드는 멈추고 뒤의 화면은 눌리지 않는다. 마을을 떠나면 끝난다
  const festivalState = useStore(ctx.festival.state);
  const festivalOpen = festivalState.phase !== 'idle' && route.kind === 'home';
  // 주민(악사)에게 말을 걸었다(1.5, 7-6): 그 주민의 한 줄이 마을 위에 카드로 뜬다. 말은 걸 때 한 번 만들고(떠 있는 동안 바뀌지 않는다) 저장하지 않는다. 다른 화면으로 가면 닫는다
  const [talk, setTalk] = useState<{ resident: ResidentDef; say: ResidentSay } | null>(null);
  const talkOpen = talk !== null && route.kind === 'home';
  const modalOpen = introOpen || noteOpen || festivalOpen || talkOpen;
  useEffect(() => {
    if (route.kind !== 'home') {
      setNote(null);
      setTalk(null);
      ctx.festival.interrupt();
    }
  }, [route.kind, ctx.festival]);
  // 광장 게시판(6.1)에서 수첩을 열면 '내 곡' 쪽이 먼저 펼쳐진다. 수첩을 나가면 잊는다
  const [notebookStart, setNotebookStart] = useState<NotebookPageId | null>(null);
  useEffect(() => {
    if (!(route.kind === 'overlay' && route.page === 'notebook')) setNotebookStart(null);
  }, [route]);
  const finishIntro = (): void => {
    ctx.preferences.update((p) => (p.introSeen ? p : { ...p, introSeen: true }));
    setIntroArmed(false);
  };
  const replayIntro = (): void => {
    ctx.preferences.update((p) => (p.introSeen ? { ...p, introSeen: false } : p));
    setIntroArmed(true);
    navigateTo(win, HOME_HASH);
  };
  // 안내가 떠 있는 채로 다른 화면으로 가면(M, L, 단추) 안내를 본 것으로 친다
  const prevKind = useRef(route.kind);
  useEffect(() => {
    if (introArmed && prevKind.current === 'home' && route.kind !== 'home') finishIntro();
    prevKind.current = route.kind;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.kind, introArmed]);

  const resolved = route.kind === 'quest' ? catalog.resolveHash(route.hash) : null;
  // 합주 무대의 자유 가락(4.9)은 과제 목록에 없는 주소로 연다('#/q/free.<설치물 id>/play'). 무대 설치물이 있어야 연다
  const freeId = route.kind === 'quest' ? freeInstallationOfHash(route.hash) : null;
  const freeDef = freeId ? ctx.installation.definition(freeId) : null;
  const freeInst = freeDef && ctx.installation.hasFreeMelody(freeDef) ? freeDef : null;
  const wanted = resolved && resolved.ok ? `${resolved.quest.questId}/${resolved.variant.variantId}` : freeInst ? `${freeQuestId(freeInst.installationId)}/${FREE_VARIANT_ID}` : null;

  // 주소가 가리키는 과제를 컨트롤러에 열고, 주소를 떠나면 닫는다(재생을 멈추고 초안은 남긴다)
  useEffect(() => {
    if (resolved && resolved.ok) {
      controller.open(resolved.quest.questId, resolved.variant.variantId);
      ctx.opened.mark(resolved.quest.questId);
      lastQuestRef.current = resolved.quest.questId;
    } else if (freeInst) {
      // 열 수 없으면(틀로 삼을 과제가 없다) 닫아 둔다: 아래에서 전체 도전 목록이 보인다
      if (!controller.openFree(freeInst)) controller.close();
    } else controller.close();
    // wanted가 같으면 같은 과제다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, controller]);

  // 화면이 바뀔 때(정거장에서 나가기, 도전 전환 등) 저장한다. 바뀐 것이 없으면 저장소는 건드리지 않는다(10.6)
  useEffect(() => {
    ctx.persistence?.touch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.kind, wanted]);

  // 월드는 탐험 화면이나 그 위의 겹침 화면을 처음 보일 때 켠다. 주소로 패널을 바로 여는 길은 월드를 기다리지 않는다
  const wantsWorld = route.kind === 'home' || route.kind === 'overlay' || route.kind === 'station';
  useEffect(() => {
    if (!wantsWorld) return;
    const parent = worldParent ?? (typeof document !== 'undefined' ? document.getElementById('game-root') : null);
    if (parent) void world.mount(parent);
  }, [wantsWorld, world, worldParent]);

  // 겹침 화면이나 패널이 열리면 월드는 멈춘다
  useEffect(() => {
    world.bridge.pause.set(!isExploring(route) || modalOpen);
  }, [route, world, modalOpen]);

  // 월드에서 정거장을 열었다: 설치물이 있는 정거장은 그 앞에서 설치물 모드로 들어가고(4.2),
  // 열 수 있는 과제가 하나뿐인 작업대는 바로 패널, 그 밖에는 정거장 안내
  useEffect(
    () =>
      world.bridge.events.subscribe((ev) => {
        if (ev.type === 'open-discovery') {
          // 소리 조각은 열 때 들려 주고 적는다. 개념 쪽지는 글을 카드로 띄운다(3.6)
          const out = ctx.discoverer.open(ev.discoveryId);
          if (out?.kind === 'note') setNote(out.note);
          return;
        }
        if (ev.type === 'open-board') {
          // 광장 게시판: 수첩의 '내 곡' 쪽이 열린다(6.1)
          setNotebookStart('creations');
          navigateTo(win, overlayHash('notebook'));
          return;
        }
        if (ev.type === 'open-resident') {
          // 주민: 그 지역의 추천(없으면 층의 사실) 한 줄을 카드로 띄운다. 아무것도 적거나 열거나 닫지 않는다(W-1, W-5)
          const resident = residentOf(ev.residentId);
          if (!resident) return;
          const layer = ctx.reaction.store.get().regionLayers[resident.regionId] ?? 0;
          const say = residentSay(resident, { catalog, map: world.map, attempts: controller.attempts, opened: ctx.opened.store.get(), currentQuestId: lastQuestRef.current, openable, topicName, layer });
          setTalk({ resident, say });
          return;
        }
        if (ev.type !== 'open-station') return;
        if (ctx.installation.enter(ev.stationId)) return;
        const station = world.map.station(ev.stationId);
        if (station) navigateTo(win, stationTarget(catalog, PANEL_IDS, station));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, catalog, win, ctx.installation, ctx.discoverer, ctx.reaction, ctx.opened, controller],
  );

  // 전역 단축키: Esc 닫기, M 지도, L 목록
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const action = resolveShortcut(e, routeRef.current);
      if (!action) return;
      e.preventDefault();
      if (action.type === 'close') closeTo(win);
      else navigateTo(win, action.hash);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [win]);

  // 화면이 가려지면 소리를 멈춘다
  useEffect(() => {
    const onHide = (): void => {
      if (document.hidden) controller.stopPlayback();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [controller]);

  // 소리를 켠 뒤 오디오 장치가 멈추면(전화, 화면 잠금, 앱 전환) 다음 누르기와 화면이 돌아올 때 깨운다(8.6).
  // 아이폰은 멈춘 장치를 저절로 깨우지 않고, 누르는 동작 안에서 불러야 받아 준다. 소리를 켜기 전에는 아무 일도 하지 않는다(W-11).
  useEffect(() => {
    const wake = (): void => ctx.mixer.wake();
    const onShow = (): void => {
      if (!document.hidden) wake();
    };
    const gestures = ['pointerup', 'click', 'touchend', 'keydown'] as const;
    for (const g of gestures) window.addEventListener(g, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onShow);
    return () => {
      for (const g of gestures) window.removeEventListener(g, wake, { capture: true });
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [ctx.mixer]);

  const showDev = catalog.channel === 'preview';
  // 추천(6.6): 목록의 순서를 바꾸고 이유 한 줄을 붙일 뿐이다. 지금 열 수 있는 과제(공개 상태와 화면)만 올린다
  const list = (problem?: string) => {
    const recommendations = recommend({ catalog, map: world.map, attempts: controller.attempts, opened: openedQuests, currentQuestId: lastQuestRef.current, regionId: world.bridge.status.get().regionId, openable, topicName });
    return <QuestList catalog={catalog} panels={PANEL_IDS} showDev={showDev} map={world.map} opened={openedQuests} recommendations={recommendations} {...(problem ? { problem } : {})} />;
  };

  // 지도의 '걸어가기'와 '바로 이동': 명령을 보내고 마을로 돌아간다. 월드는 겹침 화면이 닫혀 움직이기 시작할 때 명령을 받는다
  const goWalk = (stationId: string): void => {
    world.command({ type: 'walk-to-station', stationId });
    navigateTo(win, HOME_HASH);
  };
  const goTeleport = (stationId: string): void => {
    ctx.usage.mapTeleported(stationId); // 걷지 않고 선 것: 이어서 정거장을 열어도 '걸어서 들어간' 것으로 세지 않는다(13.2 H5)
    world.teleportToStation(stationId);
    navigateTo(win, HOME_HASH);
  };

  let body;
  if (route.kind === 'dev') {
    body = route.page === 'sound-check' && showDev ? <SoundCheck mixer={ctx.mixer} measure={ctx.measure} /> : list('이 개발용 화면은 열 수 없어요.');
  } else if (route.kind === 'unknown') {
    body = list(`알 수 없는 주소예요: ${route.hash}. 아래 목록에서 골라 주세요.`);
  } else if (route.kind === 'quest' && freeInst) {
    const cur = controller.current;
    if (!cur || !cur.free || cur.entry.questId !== freeQuestId(freeInst.installationId)) {
      body = null; // 위 효과가 곧 연다
    } else {
      const panelId = cur.variant.panelIds.find((id) => id in PANELS);
      const Panel = panelId ? PANELS[panelId] : undefined;
      body = Panel ? <Panel controller={controller} bench={ctx.bench} melody={ctx.melody} /> : <PanelNotReady entry={cur.entry} variant={cur.variant} />;
    }
  } else if (route.kind === 'quest' && resolved) {
    if (!resolved.ok) {
      body = list(resolved.message);
    } else {
      const cur = controller.current;
      if (!cur || `${cur.entry.questId}/${cur.variant.variantId}` !== wanted) {
        body = null; // 위 효과가 곧 연다
      } else {
        const panelId = resolved.variant.panelIds.find((id) => id in PANELS);
        const Panel = panelId ? PANELS[panelId] : undefined;
        body = Panel ? <Panel controller={controller} bench={ctx.bench} melody={ctx.melody} /> : <PanelNotReady entry={resolved.quest} variant={resolved.variant} />;
      }
    }
  } else if (route.kind === 'station') {
    const station = world.map.station(route.stationId);
    body = (
      <StationSheet
        station={station}
        stationId={route.stationId}
        region={station ? world.map.region(station.regionId) : undefined}
        quests={station ? stationQuests(catalog, PANEL_IDS, station) : []}
      />
    );
  } else if (route.kind === 'overlay') {
    if (route.page === 'list') body = list();
    else if (route.page === 'notebook') body = <Notebook catalog={catalog} map={world.map} attempts={controller.attempts} opened={openedQuests} regionId={world.bridge.status.get().regionId} panels={PANEL_IDS} melody={ctx.melody} controller={controller} discoveries={ctx.discoveries} {...(notebookStart ? { initialPage: notebookStart } : {})} />;
    else if (route.page === 'help') body = <HelpOverlay />;
    else if (route.page === 'map') body = <MapOverlay map={world.map} catalog={catalog} panels={PANEL_IDS} position={world.bridge.position} onWalk={goWalk} onTeleport={goTeleport} found={ctx.found.store} {...(settings.showDiscoveries ? { finds: ctx.discoveries, plays: ctx.playInstruments } : {})} />;
    else {
      const persistence = ctx.persistence;
      const saveSection = persistence ? (
        <SaveSection
          status={persistence.status}
          exportFile={() => persistence.exportFile()}
          importText={(text) => persistence.importText(text)}
          exportUnread={() => persistence.exportUnread()}
          onImported={() => {
            // 가져온 저장으로 다시 시작한다: 마을로 돌아가 화면을 새로 불러온다
            navigateTo(win, HOME_HASH);
            win.location.reload?.();
          }}
        />
      ) : undefined;
      const usageSection = (
        <UsageLogSection status={ctx.usageLog.status} onToggle={(on) => ctx.usageLog.setEnabled(on)} exportFile={() => ctx.usageLog.exportFile()} onClear={() => ctx.usageLog.clear()} />
      );
      body = <SettingsOverlay settings={ctx.settings} controller={controller} browserReducedMotion={prefersReducedMotion()} onReplayIntro={replayIntro} {...(saveSection ? { saveSection } : {})} usageSection={usageSection} aboutSection={<AboutSection notices={NOTICES} />} />;
    }
  } else {
    body = (
      <>
        <Hud bridge={world.bridge} map={world.map} controller={controller} reaction={ctx.reaction} ripples={ripples} touchOnly={touchOnly} onNavigate={nav.go} inert={modalOpen} quiet={inInstallation} />
        {inInstallation ? (
          stageBench ? (
            <StageHud bridge={world.bridge} controller={controller} installation={ctx.installation} stage={stageBench} onNavigate={nav.go} touchOnly={touchOnly} inert={modalOpen} />
          ) : timelineBench ? (
            <TimelineHud bridge={world.bridge} controller={controller} bench={timelineBench} installation={ctx.installation} onNavigate={nav.go} touchOnly={touchOnly} inert={modalOpen} />
          ) : bellBench ? (
            <BellHud bridge={world.bridge} controller={controller} bench={bellBench} installation={ctx.installation} onNavigate={nav.go} touchOnly={touchOnly} inert={modalOpen} />
          ) : terraceBench ? (
            <TerraceHud bridge={world.bridge} controller={controller} bench={terraceBench} installation={ctx.installation} onNavigate={nav.go} touchOnly={touchOnly} inert={modalOpen} />
          ) : keyBridgeBench ? (
            <KeyBridgeHud bridge={world.bridge} controller={controller} bench={keyBridgeBench} installation={ctx.installation} onNavigate={nav.go} touchOnly={touchOnly} inert={modalOpen} />
          ) : (
            <InstallationHud bridge={world.bridge} controller={controller} bench={ctx.bench} installation={ctx.installation} onNavigate={nav.go} touchOnly={touchOnly} inert={modalOpen} />
          )
        ) : null}
        {noteOpen && note ? <NoteCard note={note} related={relatedQuest(catalog, PANEL_IDS, note.questId)} onClose={() => setNote(null)} /> : null}
        {talkOpen && talk ? (
          <ResidentCard resident={talk.resident} say={talk.say} related={talk.say.questId ? relatedQuest(catalog, PANEL_IDS, talk.say.questId) : null} onClose={() => setTalk(null)} />
        ) : null}
        {festivalOpen ? (
          <FestivalCard view={festivalState} controller={controller} onSkip={() => ctx.festival.skip()} onAnswer={(listen) => ctx.festival.answer(listen)} onStopSongs={() => ctx.festival.stopSongs()} />
        ) : null}
        {introOpen ? (
          <IntroCard
            controller={controller}
            touchOnly={touchOnly}
            onStart={finishIntro}
            onList={() => {
              finishIntro();
              navigateTo(win, overlayHash('list'));
            }}
          />
        ) : null}
      </>
    );
  }

  const notice = ctx.persistence ? <SaveNotice status={ctx.persistence.status} onOpenSettings={() => navigateTo(win, overlayHash('settings'))} hidden={route.kind === 'overlay' && route.page === 'settings'} /> : null;
  return (
    <NavContext.Provider value={nav}>
      {notice}
      {body}
    </NavContext.Provider>
  );
}
