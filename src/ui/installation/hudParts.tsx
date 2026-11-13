// 설치물 모드의 화면(돌 작업대 InstallationHud, 합주 무대 StageHud)이 함께 쓰는 조각: 조작 막대 단추, 표지판 목록과 그 초점 관리, 막대 높이를 월드에 알리기.
// 두 화면은 같은 모양의 단추와 같은 표지판 목록을 쓰므로, 한쪽만 고쳐서 어긋나지 않게 한곳에 둔다.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { WorldBridge } from '../../platform/bridge';
import { Icon } from '../common/Icon';
import type { InstallationController, SignEntry } from './controller';

export type HudIconName = Parameters<typeof Icon>[0]['name'];

export interface BarButtonProps {
  /** 어떤 동작인가(data-action). 점검과 시험이 단추를 찾는 이름이다 */
  action: string;
  label: string;
  icon: HudIconName | null;
  /** 그림이 없을 때 대신 쓰는 글자(← → 같은 것) */
  glyph?: string;
  /** 단추 옆에 보이는 키 이름 */
  keyName?: string;
  disabled?: boolean;
  /** 눌린 상태를 알리는 단추(도움)의 상태. 없으면 일반 단추 */
  pressed?: boolean;
  primary?: boolean;
  /** 좁은 화면에서 보이는 짧은 글. 없으면 label */
  short?: string;
  onRun: () => void;
}

/** 조작 막대의 단추: 그림(또는 글자) + 짧은 글 + 키 이름. 화면 낭독기는 label을 읽는다 */
export function BarButton({ action, label, icon, glyph, keyName, disabled, pressed, primary, short, onRun }: BarButtonProps) {
  return (
    <button
      type="button"
      class={`btn inst-btn${primary ? ' btn-primary' : ' btn-quiet'}`}
      data-action={action}
      aria-label={label}
      {...(keyName ? { 'aria-keyshortcuts': keyName } : {})}
      {...(pressed !== undefined ? { 'aria-expanded': pressed } : {})}
      disabled={disabled === true}
      onClick={onRun}
    >
      {icon ? <Icon name={icon} /> : <span class="inst-glyph" aria-hidden="true">{glyph}</span>}
      <span class="inst-btn-label" aria-hidden="true">{short ?? label}</span>
      {keyName ? <kbd class="inst-key" aria-hidden="true">{keyName}</kbd> : null}
    </button>
  );
}

/**
 * 조작 막대가 화면 아래를 가리는 높이를 월드에 알린다: 설치물이 막대 위쪽에 가려지지 않게 담긴다(4.2).
 * 표지판 목록, 도움 카드, 확인 결과는 이 영역 위에 떠서 높이를 바꾸지 않는다. 그래서 열고 닫아도 카메라가 흔들리지 않는다.
 */
export function useBottomInset(bridge: WorldBridge, installationId: string | null, mainRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = mainRef.current;
    if (!el || !installationId) return;
    const publish = (): void => {
      const rect = el.getBoundingClientRect();
      bridge.bottomInset.set(rect.height > 0 ? Math.max(0, Math.round(window.innerHeight - rect.top)) : 0);
    };
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      bridge.bottomInset.set(0);
    };
  }, [bridge, installationId, mainRef]);
}

export interface SignMenu {
  open: boolean;
  setOpen: (open: boolean | ((was: boolean) => boolean)) => void;
  toggleRef: RefObject<HTMLButtonElement>;
  listRef: RefObject<HTMLUListElement>;
  /** 표지판 목록 안에서 ↑ ↓ Home End로 항목 사이를 옮긴다(Tab으로도 된다) */
  onListKey: (e: KeyboardEvent) => void;
}

/**
 * 표지판 목록(떠 있는 목록)은 화면 구조상 작업대보다 앞에 있어서, 키보드로 열어도 Tab이 선반으로 가 버린다.
 * 열면 초점을 목록의 고른 항목(없으면 첫 항목)으로 옮기고, 닫으면 표지판 단추로 돌려보낸다(키보드만으로 쓸 수 있어야 한다, W-4).
 */
export function useSignMenu(): SignMenu {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      const list = listRef.current;
      const target = list?.querySelector<HTMLButtonElement>('.inst-sign-item.is-selected') ?? list?.querySelector<HTMLButtonElement>('.inst-sign-item');
      target?.focus();
    } else if (wasOpen.current) {
      const active = document.activeElement;
      // 목록 안에 있던 초점(또는 목록이 사라지며 잃은 초점)만 되돌린다. 다른 곳을 누른 사람의 초점은 건드리지 않는다
      if (!active || active === document.body || toggleRef.current === active) toggleRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const onListKey = (e: KeyboardEvent): void => {
    const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const edge = e.key === 'Home' ? 0 : e.key === 'End' ? -1 : null;
    if (delta === 0 && edge === null) return;
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.inst-sign-item') ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = edge !== null ? (edge === 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta));
    e.preventDefault();
    items[next]?.focus();
  };

  return { open, setOpen, toggleRef, listRef, onListKey };
}

export interface SignListProps {
  entries: readonly SignEntry[];
  installation: InstallationController;
  menu: SignMenu;
}

/** 표지판 목록: 이 정거장에서 할 수 있는 것들. 열 수 없는 것은 '준비 중'으로 적고 고를 수 없다(W-10) */
export function SignList({ entries, installation, menu }: SignListProps) {
  return (
    <ul class="inst-sign-list card" id="inst-sign-list" aria-label="이 정거장에서 할 수 있는 것" ref={menu.listRef} onKeyDown={menu.onListKey}>
      {entries.map((e) => (
        <li key={e.key}>
          <button
            type="button"
            class={`inst-sign-item${e.selected ? ' is-selected' : ''}${e.selectable ? '' : ' is-unready'}`}
            data-sign={e.key}
            aria-pressed={e.selected}
            aria-disabled={e.selectable ? undefined : 'true'}
            onClick={() => {
              if (!e.selectable) return;
              if (installation.select(e.key)) menu.setOpen(false);
            }}
          >
            <span class="inst-sign-label">
              {e.selected ? <Icon name="check" /> : null}
              {e.label}
            </span>
            {e.badge ? <span class="chip">{e.badge}</span> : null}
            {e.note ? <span class="inst-sign-note muted">{e.note}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface SignButtonProps {
  menu: SignMenu;
  /** 지금 고른 것의 이름 */
  current: string;
}

/** 표지판 단추: 지금 고른 것을 보이고 누르면 목록을 연다 */
export function SignButton({ menu, current }: SignButtonProps) {
  return (
    <button type="button" class="btn btn-quiet inst-sign-btn" aria-expanded={menu.open} aria-controls="inst-sign-list" data-sign-toggle ref={menu.toggleRef} onClick={() => menu.setOpen((open) => !open)}>
      <Icon name="list" />
      <span class="inst-sign-title">표지판</span>
      <strong class="inst-sign-current">{current}</strong>
      <Icon name={menu.open ? 'up' : 'down'} />
    </button>
  );
}
