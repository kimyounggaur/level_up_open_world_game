// @vitest-environment jsdom
// 7-2 음계 길의 설치물 화면(S1 장음계 길, S2 단음계 길, S3 다섯 음 길): 표지판, 재료 선반, 키보드, 확인 결과가 데이터대로 나온다.
// 월드(Phaser)는 쓰지 않는다: 다리(WorldBridge)와 컨트롤러, 작업대만으로 화면이 하는 일을 확인한다(installation-hud.test.tsx와 같은 방식).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WorldMap } from '@/domain/world';
import { WorldBridge } from '@/platform/bridge';
import { InstallationHud } from '@/ui/installation/InstallationHud';
import { InstallationController } from '@/ui/installation/controller';
import { loadRegionDefs } from '../../tools/world-files';
import { installation, quest, rig } from './controller-rig';
import { click, mount, q, qa, setupDom, text } from './ui-rig';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const map = new WorldMap(loadRegionDefs(root));

beforeAll(() => setupDom());

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

const NATURAL = 'scale.natural-minor';
const HARMONIC = 'scale.harmonic-minor';
const PENTA = 'scale.pentatonic';
const MAJOR = 'scale.major';
const CHROMATIC = 'scale.chromatic';

interface Station {
  code: string;
  installationId: string;
  name: string;
  count: number;
  /** 표지판의 항목: 키와 글자 */
  sign: Array<[string, string]>;
  /** 처음 열려 있는 '자유로 놀기'의 선반(변화표 없이 쓴 이름) */
  freeShelf: string[];
}

const STATIONS: Station[] = [
  {
    code: 'S1',
    installationId: 'inst.scale-trail.major-path',
    name: '장음계 길',
    count: 8,
    sign: [
      ['free', '자유로 놀기'],
      ['scale.major/g-major', '장음계 배열하기 · G장조'],
      ['scale.major/d-major', '장음계 배열하기 · D장조'],
      ['scale.major/bflat-major', '장음계 배열하기 · B♭장조'],
    ],
    freeShelf: ['F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5', 'G5', 'A5'],
  },
  {
    code: 'S2',
    installationId: 'inst.scale-trail.minor-path',
    name: '단음계 길',
    count: 8,
    sign: [
      ['free', '자유로 놀기'],
      ['scale.natural-minor/a-minor', '자연단음계 · A단조'],
      ['scale.natural-minor/d-minor', '자연단음계 · D단조'],
      ['scale.natural-minor/e-minor', '자연단음계 · E단조'],
      ['scale.harmonic-minor/a-harmonic-minor', '화성단음계 · A단조'],
    ],
    freeShelf: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
  },
  {
    code: 'S3',
    installationId: 'inst.scale-trail.pentatonic-path',
    name: '다섯 음 길',
    count: 6,
    sign: [
      ['free', '자유로 놀기'],
      ['scale.pentatonic/c-pentatonic', '다섯 음 음계 · C장조'],
    ],
    freeShelf: ['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'],
  },
];

function boot(station: Pick<Station, 'code' | 'installationId'>, channel: 'preview' | 'release' = 'preview') {
  const r = rig({ definitions: [MAJOR, NATURAL, HARMONIC, PENTA, CHROMATIC].map(quest), channel });
  const inst = installation(station.installationId);
  const bridge = new WorldBridge({ x: inst.interactPoint.x, y: inst.interactPoint.y, facing: 'right' });
  const ic = new InstallationController({
    bridge,
    map,
    catalog: r.catalog,
    session: r.session,
    controller: r.controller,
    bench: r.bench,
    mixer: { playWorldNote: () => undefined },
    installations: [inst],
    panels: new Set(['panel.scale']),
    frames: { request: () => 0, cancel: () => undefined },
  });
  act(() => void ic.enter(station.code));
  const m = mount(<InstallationHud bridge={bridge} controller={r.controller} bench={r.bench} installation={ic} onNavigate={() => undefined} touchOnly={false} />);
  cleanups.push(() => {
    m.unmount();
    ic.dispose();
    r.bench.dispose();
    r.controller.dispose();
  });
  const hud = (): HTMLElement | null => q(m.host, '[data-installation-hud]');
  const slots = () => bridge.installationViews.get()[0]?.slots ?? [];
  const press = (code: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    act(() => void document.body.dispatchEvent(ev));
    return ev;
  };
  const action = (name: string): HTMLButtonElement => q<HTMLButtonElement>(m.host, `[data-action="${name}"]`)!;
  const choose = (key: string): void => {
    click(q(m.host, '[data-sign-toggle]'));
    click(q(m.host, `[data-sign="${key}"]`));
  };
  const shelfNames = (): string[] => qa(m.host, '[data-shelf]').map((b) => text(b));
  return { ...r, bridge, inst, ic, m, host: m.host, hud, slots, press, action, choose, shelfNames };
}

type Boot = ReturnType<typeof boot>;

/** 키보드로 으뜸음부터 한 음씩 위로 놓는다(→, Enter, ↑) */
function typeScale(t: Boot, count: number): void {
  for (let i = 0; i < count; i++) {
    t.press('ArrowRight');
    t.press('Enter');
    t.press('ArrowUp');
  }
}

describe('들어가면 작업대가 나타난다', () => {
  it.each(STATIONS.map((s) => [s.code, s] as const))('%s: 이름, 자리 수, 선반, 들어온 알림', (_code, s) => {
    const t = boot(s);
    expect(t.hud()).not.toBeNull();
    expect(t.hud()!.getAttribute('aria-label')).toBe(`${s.name} 작업대`);
    expect(t.hud()!.getAttribute('data-installation-hud')).toBe(s.installationId);
    expect(t.slots()).toHaveLength(s.count);
    expect(t.inst.slots).toHaveLength(s.count);
    expect(t.shelfNames()).toEqual(s.freeShelf);
    expect(text(q(t.host, '[data-live]'))).toContain(`${s.name}에 들어왔어요`);
    expect(text(q(t.host, '[data-sign-toggle]'))).toContain('자유로 놀기');
  });

  it('나가기 단추로 나온다', () => {
    const t = boot(STATIONS[1]!);
    click(t.action('exit'));
    expect(t.hud()).toBeNull();
    expect(t.ic.state.get().mode).toBeNull();
  });
});

describe('표지판: 이 정거장의 과제와 판본만 보인다(4.2, 5.6)', () => {
  it.each(STATIONS.map((s) => [s.code, s] as const))('%s', (_code, s) => {
    const t = boot(s);
    click(q(t.host, '[data-sign-toggle]'));
    const items = qa<HTMLButtonElement>(t.host, '[data-sign]');
    expect(items.map((b) => b.getAttribute('data-sign'))).toEqual(s.sign.map(([key]) => key));
    s.sign.forEach(([, label], i) => expect(text(items[i]!)).toContain(label));
    // 검수가 끝나기 전의 판본은 '검수 전'이라고 적혀 있다(W-10). 자유로 놀기에는 없다
    for (const b of items.slice(1)) expect(text(b)).toContain('검수 전');
    expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(s.sign.map(([key]) => String(key === 'free')));
  });

  it('릴리스에서는 새 판본이 준비 중이라 눌러도 열리지 않고 이유가 글로 있다(자물쇠는 없다, W-10)', () => {
    const t = boot(STATIONS[1]!, 'release');
    click(q(t.host, '[data-sign-toggle]'));
    const item = q<HTMLButtonElement>(t.host, '[data-sign="scale.natural-minor/d-minor"]')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(text(item)).toContain('준비 중');
    expect(text(item)).toContain('검수가 끝나면 열려요');
    click(item);
    expect(t.controller.current?.free).toBe(true);
    expect(q(t.host, '#inst-sign-list')!.innerHTML).not.toMatch(/자물쇠|🔒|잠김|잠겨|잠금/);
  });

  it('판본을 고르면 그 도전이 열리고 선반이 그 판본의 조표를 따른다(D단조는 B가 B♭, E단조는 F가 F♯)', () => {
    const t = boot(STATIONS[1]!);
    t.choose('scale.natural-minor/d-minor');
    expect(t.controller.current?.variant.variantId).toBe('d-minor');
    expect(t.hud()!.getAttribute('data-target')).toBe('scale.natural-minor/d-minor');
    expect(text(q(t.host, '.inst-sign-current'))).toBe('자연단음계 · D단조');
    expect(t.shelfNames()).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5']);
    expect(t.bench.handName()).toBe('D4');
    t.choose('scale.natural-minor/e-minor');
    expect(t.shelfNames()).toEqual(['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5']);
    expect(t.bench.handName()).toBe('E4');
  });
});

describe('키보드로 풀고 확인하면 통과 문장이 음계의 이름으로 나온다', () => {
  const cases: Array<[string, string, string, number]> = [
    ['S1', 'scale.major/g-major', '8자리의 음이 G장조의 장음계와 같아요.', 8],
    ['S1', 'scale.major/d-major', '8자리의 음이 D장조의 장음계와 같아요.', 8],
    ['S1', 'scale.major/bflat-major', '8자리의 음이 B♭장조의 장음계와 같아요.', 8],
    ['S2', 'scale.natural-minor/a-minor', '8자리의 음이 A단조의 자연단음계와 같아요.', 8],
    ['S2', 'scale.natural-minor/d-minor', '8자리의 음이 D단조의 자연단음계와 같아요.', 8],
    ['S2', 'scale.natural-minor/e-minor', '8자리의 음이 E단조의 자연단음계와 같아요.', 8],
  ];

  it.each(cases)('%s %s', (code, key, sentence, count) => {
    const t = boot(STATIONS.find((s) => s.code === code)!);
    t.choose(key);
    typeScale(t, count);
    click(t.action('check'));
    const fb = q(t.host, '.inst-feedback')!;
    expect(fb.getAttribute('data-feedback')).toBe('passed');
    const line = q(fb, '.feedback-line')!;
    expect(q(line, 'svg.icon')).not.toBeNull(); // 문장 앞의 기호(색만으로 전하지 않는다)
    expect(text(line)).toContain('통과했어요.');
    expect(text(line)).toContain(sentence);
    expect(t.slots().some((s) => s.flagged)).toBe(false);
  });

  it('S2 화성단음계: 온음계로만 놓으면 일곱째가 틀리고 그 돌에 표시가 선다. ♯을 붙이면 통과한다', () => {
    const t = boot(STATIONS[1]!);
    t.choose('scale.harmonic-minor/a-harmonic-minor');
    typeScale(t, 8);
    click(t.action('check'));
    const fb = q(t.host, '.inst-feedback')!;
    expect(fb.getAttribute('data-feedback')).toBe('needsRevision');
    expect(text(fb)).toContain('일곱 번째 자리: 지금은 G4예요. 목표는 G♯4예요.');
    expect(t.slots().filter((s) => s.flagged).map((s) => s.slot)).toEqual([7]);
    // 일곱째 자리를 고르고 G에 올림표를 붙여 놓는다
    click(q(t.host, '[data-shelf="7"]'));
    click(q(t.host, '[data-accidental="sharp"]'));
    expect(t.bench.handName()).toBe('G♯4');
    t.bench.selectSlot(7);
    click(t.action('place'));
    expect(t.slots()[6]!.name).toBe('G♯4');
    expect(t.slots().some((s) => s.flagged)).toBe(false);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(t.host, '.inst-feedback'))).toContain('8자리의 음이 A단조의 화성단음계와 같아요.');
  });

  it('S3 다섯 음 길: 6자리다. F와 B를 건너뛰며 놓으면 통과하고, 온음계로 놓으면 셋이 틀린다', () => {
    const t = boot(STATIONS[2]!);
    t.choose('scale.pentatonic/c-pentatonic');
    expect(t.slots()).toHaveLength(6);
    // 온음계의 여섯 음(C D E F G A): 넷째부터 어긋난다
    typeScale(t, 6);
    expect(t.slots().map((s) => s.name)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4']);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('needsRevision');
    expect(t.slots().filter((s) => s.flagged).map((s) => s.slot)).toEqual([4, 5, 6]);
    // 고쳐 놓는다: 선반 0부터 B3, C4, D4, E4, F4, G4, A4, B4, C5, D5 이므로 G4=5, A4=6, C5=8
    [5, 6, 8].forEach((shelfIndex, i) => {
      click(q(t.host, `[data-shelf="${shelfIndex}"]`));
      t.bench.selectSlot(4 + i);
      click(t.action('place'));
    });
    expect(t.slots().map((s) => s.name)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4', 'C5']);
    click(t.action('check'));
    expect(q(t.host, '.inst-feedback')!.getAttribute('data-feedback')).toBe('passed');
    expect(text(q(t.host, '.inst-feedback'))).toContain('6자리의 음이 C장조의 다섯 음 음계와 같아요.');
  });

  it('→ 는 6번째 자리에서 멈추고 알린다(S3)', () => {
    const t = boot(STATIONS[2]!);
    for (let i = 0; i < 9; i++) click(t.action('cursor-right'));
    expect(t.bench.cursor).toBe(6);
    expect(text(q(t.host, '[data-live]'))).toContain('마지막 자리예요');
  });
});

describe('11.2의 6: 도움을 쓰는 동안 통과는 없다', () => {
  /**
   * 디딤돌 길 작업대 네 곳(음계 길의 S1–S3와 건반 늪의 반음 계단 K4)에 놓인 판본 전부를 콘텐츠에서 읽는다:
   * Q07의 장음계 길 판본 셋, 새 과제 Q24·Q25·Q26의 다섯, Q31의 둘. 7-8 전에는 이 작업대들의 도움 카드를 여닫아 보는 시험이 없었다.
   */
  const PATHS = [...STATIONS.map(({ code, installationId }) => ({ code, installationId })), { code: 'K4', installationId: 'inst.key-marsh.chromatic-path' }];
  const CASES = PATHS.flatMap((path) =>
    [MAJOR, NATURAL, HARMONIC, PENTA, CHROMATIC].flatMap((qid) => quest(qid).placements.flatMap((p) => (p.kind === 'installation' && p.installationId === path.installationId ? p.variantIds.map((vid) => [path.code, `${qid}/${vid}`, path] as const) : []))),
  );

  it('디딤돌 길에 놓인 판본을 하나도 빠뜨리지 않는다: S1 셋, S2 넷, S3 하나, K4 둘', () => {
    expect(CASES.map(([code, key]) => `${code} ${key}`).sort()).toEqual(
      [
        'S1 scale.major/g-major',
        'S1 scale.major/d-major',
        'S1 scale.major/bflat-major',
        'S2 scale.natural-minor/a-minor',
        'S2 scale.natural-minor/d-minor',
        'S2 scale.natural-minor/e-minor',
        'S2 scale.harmonic-minor/a-harmonic-minor',
        'S3 scale.pentatonic/c-pentatonic',
        'K4 scale.chromatic/ascending',
        'K4 scale.chromatic/descending',
      ].sort(),
    );
  });

  it.each(CASES)('%s의 %s: 도움 카드를 열고 닫고, 목표와 내 돌을 들어도 기록되는 시도는 없고 작업대에서 그대로 이어진다', (_code, key, path) => {
    const t = boot(path);
    t.choose(key);
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).not.toBeNull();
    click(t.action('hear-target'));
    expect(t.controller.playing).toBe('target');
    typeScale(t, 2);
    click(t.action('hear-mine'));
    expect(t.controller.playing).toBe('mine');
    click(t.action('stop'));
    expect(t.controller.playing).toBeNull();
    click(t.action('help'));
    expect(q(t.host, '#inst-help')).toBeNull();
    // 도움과 듣기는 판정을 부르지 않는다: 시도도 설명도 없고, 작업대는 그대로 열려 있다
    expect(t.controller.attempts).toHaveLength(0);
    expect(t.controller.feedback).toBeNull();
    expect(q(t.host, '[data-installation-hud]')).not.toBeNull();
  });
});
