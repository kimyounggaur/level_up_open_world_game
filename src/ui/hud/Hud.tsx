// 탐험 화면의 겹침 화면(7.6): 왼쪽 위 지역 이름, 오른쪽 위 메뉴(지도 M, 목록 L, 수첩 N, 소리, 도움, 설정), 아래 가운데 안내 칩.
// 세로 화면은 아래 탭 막대(지도, 도전, 최근 작업, 도움)와 64 px 상호작용 버튼을 쓴다(시안 B03). 월드(Phaser)와는 WorldBridge로만 말한다.
import { useEffect, useState } from 'preact/hooks';
import { appendNews, ensembleLabel } from '../../domain/reaction';
import type { Reaction } from '../../domain/reaction';
import type { RippleSource } from '../../domain/ripple';
import type { SpotKind, WorldMap } from '../../domain/world';
import { chipText } from '../../domain/world';
import type { Store, WorldBridge } from '../../platform/bridge';
import { overlayHash } from '../../platform/router';
import type { ChallengeController } from '../challenge/controller';
import { useController, useStore } from '../common/hooks';
import { Icon } from '../common/Icon';
import type { IconName } from '../common/Icon';
import { SoundControl } from '../common/SoundControl';
import { Ripples } from './Ripples';
import type { RippleClock } from './Ripples';

/** 세계 반응(4-4)을 보여 주는 데 필요한 것. app의 ReactionTracker가 이 모양이다 */
export interface ReactionView {
  /** 지금의 세계 반응. 왼쪽 위 '합주 ○층'이 이것을 읽는다 */
  readonly store: Store<Reaction>;
  /** 아직 보여 주지 않은 새 소식(사실 문장들) */
  readonly pending: Store<readonly string[]>;
  /** 새 소식을 가져간다. 가져가면 비워진다 */
  takePending(): readonly string[];
}

/** 소리 물결(4-6)을 그리는 데 필요한 것. 설정의 '소리 물결 표시'가 꺼져 있으면 그리지 않는다 */
export interface HudRipples {
  /** 소리가 나는 정거장들. 소리와 같은 순서여야 물결이 서명 소리와 같은 박에 퍼진다 */
  stations: readonly RippleSource[];
  /** 소리 조각들(8.4). 소리와 같은 순서여야 조각이 울리는 마디에 물결이 퍼진다 */
  pieces?: readonly RippleSource[];
  /** 세계 시계(박) */
  clock: RippleClock;
  enabled: boolean;
  /** 움직임 줄이기: 퍼지는 물결 없이 멈춘 표식만 */
  reducedMotion: boolean;
}

/** 새 소식을 화면에 띄워 두는 시간(초). 낭독기에는 나타나는 즉시 읽힌다 */
export const NEWS_SECONDS = 8;

export interface HudProps {
  bridge: WorldBridge;
  map: WorldMap;
  controller: ChallengeController;
  reaction: ReactionView;
  /** 소리 물결(4-6). 없으면 그리지 않는다 */
  ripples?: HudRipples;
  /** 키보드가 없는 터치 화면인가(안내 칩의 글이 달라진다) */
  touchOnly: boolean;
  onNavigate: (hash: string) => void;
  /** 위에 모달 카드가 떠 있어 이 화면의 단추가 눌리거나 초점을 받으면 안 될 때 */
  inert?: boolean;
  /** 설치물 모드: 정거장 안내 칩과 '열기' 단추를 숨긴다(이미 안에 들어와 있다). 나머지 메뉴는 그대로다 */
  quiet?: boolean;
}

interface MenuItem {
  hash: string;
  label: string;
  icon: IconName;
  key?: string;
}

const MENU: readonly MenuItem[] = [
  { hash: overlayHash('map'), label: '지도', icon: 'map', key: 'M' },
  { hash: overlayHash('list'), label: '목록', icon: 'list', key: 'L' },
  { hash: overlayHash('notebook'), label: '수첩', icon: 'notebook', key: 'N' },
];

/** 새로 생긴 것(등불, 층)을 잠깐 보여 준다. 월드가 아닌 화면(패널)에서 생긴 것은 이 화면으로 돌아올 때 보인다 */
function useNews(reaction: ReactionView): readonly string[] {
  const pending = useStore(reaction.pending);
  const [shown, setShown] = useState<readonly string[]>([]);
  useEffect(() => {
    if (pending.length === 0) return;
    const lines = reaction.takePending();
    setShown((prev) => appendNews(prev, lines));
  }, [pending, reaction]);
  useEffect(() => {
    if (shown.length === 0) return;
    const timer = setTimeout(() => setShown([]), NEWS_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [shown]);
  return shown;
}

/** 가까운 사물의 단추 이름: 정거장은 '열기', 발견 표식과 게시판은 '살피기', 주민은 '말 걸기'(7-6) */
export const interactLabel = (spot: SpotKind | undefined): string => (spot === 'resident' ? '말 걸기' : spot ? '살피기' : '열기');

export function Hud({ bridge, map, controller, reaction, ripples, touchOnly, onNavigate, inert, quiet = false }: HudProps) {
  useController(controller);
  const status = useStore(bridge.status);
  const level = useStore(reaction.store).ensembleLevel;
  const news = useNews(reaction);
  const region = map.region(status.regionId);
  const near = quiet ? null : status.near;
  const text = near ? chipText(near.name, touchOnly) : '';
  const interact = (): void => bridge.commands.send({ type: 'interact' });
  return (
    <div class="hud" data-hud {...(inert ? { inert: true } : {})}>
      <div class="hud-corner">
        <p class="hud-region" aria-live="polite" data-region={region.regionId}>
          <span class="hud-region-dot" style={{ background: region.accentColor }} aria-hidden="true" />
          <span class="hud-region-name">{region.name}</span>
        </p>
        <p class="hud-ensemble" data-ensemble={level}>
          {ensembleLabel(level)}
        </p>
        {/* 새 소식은 비어 있을 때도 자리를 지켜야 낭독기가 나타나는 글을 읽는다 */}
        <div class="hud-news" role="status" aria-live="polite" data-news>
          {news.map((line, i) => (
            <p key={`${i}:${line}`}>{line}</p>
          ))}
        </div>
      </div>

      <nav class="hud-menu" aria-label="탐험 메뉴">
        {MENU.map((m) => (
          <button key={m.hash} type="button" class="hud-btn" onClick={() => onNavigate(m.hash)} {...(m.key ? { 'aria-keyshortcuts': m.key } : {})}>
            <Icon name={m.icon} />
            <span class="hud-btn-label">{m.label}</span>
            {m.key ? <kbd class="hud-key" aria-hidden="true">{m.key}</kbd> : null}
          </button>
        ))}
        <SoundControl sound={controller.sound} onEnable={() => void controller.enableSound()} onToggleMute={() => controller.toggleMute()} compact />
        <button type="button" class="hud-btn" onClick={() => onNavigate(overlayHash('help'))}>
          <Icon name="help" />
          <span class="hud-btn-label">도움</span>
        </button>
        <button type="button" class="hud-btn hud-btn-settings" onClick={() => onNavigate(overlayHash('settings'))}>
          <Icon name="settings" />
          <span class="hud-btn-label">설정</span>
        </button>
      </nav>

      {near ? (
        <div class="hud-chip-wrap">
          <button type="button" class="hud-chip" onClick={interact} data-near={near.stationId}>
            {text}
          </button>
        </div>
      ) : null}
      {near ? (
        <button type="button" class="hud-interact" onClick={interact} aria-label={`${near.name} ${interactLabel(near.spot)}`}>
          <Icon name="arrow-right" />
          <span>{interactLabel(near.spot)}</span>
        </button>
      ) : null}

      <nav class="hud-tabs" aria-label="화면 이동">
        <button type="button" class="hud-tab" onClick={() => onNavigate(overlayHash('map'))}>
          <Icon name="map" />
          <span>지도</span>
        </button>
        <button type="button" class="hud-tab" onClick={() => onNavigate(overlayHash('list'))}>
          <Icon name="list" />
          <span>도전</span>
        </button>
        <button type="button" class="hud-tab" onClick={() => onNavigate(overlayHash('notebook'))} aria-label="수첩, 최근 작업">
          <Icon name="notebook" />
          <span>최근 작업</span>
        </button>
        <button type="button" class="hud-tab" onClick={() => onNavigate(overlayHash('help'))}>
          <Icon name="help" />
          <span>도움</span>
        </button>
      </nav>

      {!status.ready && !status.error ? (
        <p class="hud-loading" role="status">
          마을을 불러오는 중이에요…
        </p>
      ) : null}
      {ripples?.enabled && !quiet && !status.error ? <Ripples bridge={bridge} stations={ripples.stations} {...(ripples.pieces ? { pieces: ripples.pieces } : {})} clock={ripples.clock} reducedMotion={ripples.reducedMotion} /> : null}
      {status.error ? (
        <div class="hud-error" role="alert">
          <Icon name="alert" />
          <div>
            <strong>마을을 그리지 못했어요.</strong>
            <p>목록이나 주소로는 모든 도전을 그대로 열 수 있어요.</p>
            <button type="button" class="btn btn-primary" onClick={() => onNavigate(overlayHash('list'))}>
              목록 열기 <Icon name="arrow-right" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
