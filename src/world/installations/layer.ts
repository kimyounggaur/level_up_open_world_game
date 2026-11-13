// 설치물 층(설계서 4.2, 4.3, 4.9): 구워 둔 돌 위에 놓인 음의 이름, 자리 번호, 고른 자리, 느낌표 표식, 듣는 중인 자리를 그린다.
// 합주 무대(T7)는 돌 대신 바닥 칸(성부 줄 × 마디)을 그린다: 칸마다 채운 정도, 고른 마디, 마디 이름과 성부 이름.
// 그리는 일만 맡는다. 무엇을 그릴지(돌마다 이름, 고른 자리, 판정이 가리킨 자리)는 화면이 정해 다리(WorldBridge)에 올려 두고, 여기서는 읽어서 옮겨 그린다.
// 색만으로 뜻을 전하지 않는다: 놓인 돌은 이름 글자, 고른 자리는 굵은 테두리와 ▼, 틀린 자리는 '!' 글자가 든 배지, 듣는 자리는 ♪ 글자가 함께 있다.
// 무대 칸은 쓰지 않는 칸 = 빗금, 비어 있음 = 흰 바탕, 일부 = 옅은 바탕과 'n/N' 글자, 가득 = 진한 바탕과 흰 'N/N' 글자로 가리고, 고른 마디는 굵은 테두리와 채워진 마디 이름표가 함께 있다.
// 채운 정도는 맞고 틀림이 아니다: ✓처럼 맞다고 읽히는 기호는 칸에 쓰지 않는다(맞고 틀림은 판정을 거친 '!' 배지와 글로만 알린다).
// 징검다리(T2, 4.4)는 칸이 아니라 돌의 틱 구간으로 그린다: 이 파일은 설치물마다 timelineLayer.ts에 맡기고 칸 요약(slots)만 점검용으로 돌려준다.
// 종나무(T4, 4.6)도 같다: 줄기와 가지, 고리, 걸린 종은 bellLayer.ts가 그리고, 이 파일은 고리 요약(slots)과 그려진 종(bell)을 점검용으로 돌려준다.
// 계단밭(T5, 4.7)도 같다: 돌담과 등과 덧줄 돌담은 terraceLayer.ts가 그리고, 이 파일은 열 요약(slots)과 그려진 밭(terrace)을 점검용으로 돌려준다.
// 세 계단밭(N1 N2 N3)은 한 땅을 나눠 쓰므로 밭 단위로 한 번에 그린다.
// 건반 다리(T6, 4.8)도 같다: 널 위의 표시와 이름표, 밧줄, 깃발, 표지판 악보는 keyBridgeLayer.ts가 그리고, 이 파일은 널 요약(slots)과 그려진 다리(keyBridge)를 점검용으로 돌려준다.
import Phaser from 'phaser';
import { stageCellOfSlot, stageLayoutOf } from '../../domain/ensemble';
import type { StageFill, StageLayout } from '../../domain/ensemble';
import { STAGE_LABEL_TOP, slotBounds } from '../../domain/installation';
import type { InstallationDef, SlotRect } from '../../domain/installation';
import type { InstallationView, SlotMark, WorldBridge } from '../../platform/bridge';
import { NO_DRAW, grow } from '../cull';
import type { Box, ViewCull } from '../cull';
import { BellLayer } from './bellLayer';
import type { DrawnBells } from './bellLayer';
import { hatchSegments } from './hatch';
import { KeyBridgeLayer } from './keyBridgeLayer';
import type { DrawnKeyBridge } from './keyBridgeLayer';
import { CORAL, FONT, GOLD, GOLD_TEXT_CSS, INK, INK_CSS, TEAL, TEAL_LIGHT, WHITE, WHITE_CSS } from './palette';
import { TerraceLayer } from './terraceLayer';
import type { DrawnTerrace } from './terraceLayer';
import { TimelineLayer } from './timelineLayer';
import type { DrawnTimeline } from './timelineLayer';
import { WheelLayer } from './wheelLayer';
import type { DrawnWheel } from './wheelLayer';


/** 바닥 표시(도착 물결) 위, 사물과 캐릭터(발 위치 y) 아래 */
export const LAYER_DEPTH = -90_000;
/** 밟은 돌이 반짝이는 시간(초). 움직임 줄이기에서는 반짝이지 않는다 */
export const STEP_FLASH_SECONDS = 0.5;
/**
 * 설치물이 화면 밖인지 가를 때, 설치물 전체(slotBounds: 돌, 이름표 띠, 바퀴, 밭과 다리의 위아래 띠까지)에 더 얹는 여유(월드 px).
 * slotBounds가 이미 그린 것 전체를 담으므로(카메라가 그 사각형으로 설치물을 담는다) 이 여유는 겉 상자를 마지막으로 한 번 더 받치는 값이다.
 */
export const INSTALLATION_CULL_PAD = 160;

export interface DrawnSlot {
  slot: number;
  /** 돌에 쓴 이름. 비었으면 null */
  label: string | null;
  /** 자리 번호를 그렸는가(설치물 모드에서만) */
  numbered: boolean;
  selected: boolean;
  flagged: boolean;
  playing: boolean;
  /** 무대 칸의 채운 정도(돌이면 없다) */
  fill?: StageFill;
}

export interface DrawnInstallation {
  installationId: string;
  active: boolean;
  slots: DrawnSlot[];
  /** 무대 바닥이면 고른 마디(0부터), 고른 것이 없으면 null. 돌이면 없다 */
  selectedMeasure?: number | null;
  /** 무대 바닥이면 마디 이름과 성부 이름을 그렸는가(설치물 모드에서만) */
  labelled?: boolean;
  /** 징검다리이면 그린 돌, 남은 물, 놓으려는 자리, 물결 선(점검용). slots는 가장 잘게 나눈 칸의 요약이다 */
  timeline?: DrawnTimeline;
  /** 물레방아이면 그린 바퀴: 못, 빈 구멍, 놓으려는 자리, 도는 각도(점검용). 띠(timeline)와 같은 초안을 읽는다 */
  wheel?: DrawnWheel;
  /** 종나무이면 그린 종, 쓰지 않는 가지, 이름표, 고른 자리(점검용). slots는 고리 하나하나의 요약이다 */
  bell?: DrawnBells;
  /** 계단밭이면 그린 돌담, 등, 덧줄 돌담, 쓰지 않는 구간, 이름표, 고른 자리(점검용). slots는 열 하나하나의 요약이다 */
  terrace?: DrawnTerrace;
  /** 건반 다리이면 그린 널 표시, 이름표, 밧줄, 깃발, 표지판 악보(점검용). slots는 널 하나하나의 요약이다 */
  keyBridge?: DrawnKeyBridge;
}

interface SlotTexts {
  name: Phaser.GameObjects.Text;
  num: Phaser.GameObjects.Text;
  bang: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text;
  /** 이름 글자가 지금 흰색인가: 바꿀 때만 setColor를 부른다 */
  nameWhite: boolean;
}

/** 무대 바닥의 글자: 첫 줄 위의 마디 이름, 첫 칸 왼쪽의 성부 이름 */
interface StageLabels {
  layout: StageLayout;
  cols: Phaser.GameObjects.Text[];
  rows: Phaser.GameObjects.Text[];
  /** 마디 이름 글자가 지금 흰색인가(고른 마디) */
  colWhite: boolean[];
}

const EMPTY_MARK = (slot: number): SlotMark => ({ slot, name: null, midi: null, flagged: false, selected: false, playing: false });
const EMPTY_CELL = (slot: number): SlotMark => ({ ...EMPTY_MARK(slot), fill: 'empty' });

export class InstallationLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts = new Map<string, SlotTexts[]>();
  private readonly stages = new Map<string, StageLabels>();
  /** 징검다리(T2)의 돌과 물과 물결 선은 이 층이 그린다(timelineLayer.ts) */
  private readonly lanes: TimelineLayer;
  /** 물레방아(T3)의 바퀴는 이 층이 그린다(wheelLayer.ts). 띠와 같은 TimelineView를 읽는다 */
  private readonly wheels: WheelLayer;
  /** 종나무(T4)의 줄기와 가지와 종은 이 층이 그린다(bellLayer.ts) */
  private readonly bells: BellLayer;
  /** 계단밭(T5)의 돌담과 등은 이 층이 그린다(terraceLayer.ts). 세 설치물이 한 밭을 나눠 쓰므로 밭 단위로 그린다 */
  private readonly terraces: TerraceLayer;
  /** 건반 다리(T6)의 널 표시와 이름표와 밧줄과 깃발은 이 층이 그린다(keyBridgeLayer.ts) */
  private readonly bridges: KeyBridgeLayer;
  private readonly flashes = new Map<string, number>();
  /** 설치물마다 그려지는 범위(월드). 화면에 닿지 않으면 그리는 호출을 건너뛴다(cull.ts) */
  private readonly reach = new Map<string, Box>();
  private drawn: DrawnInstallation[] = [];
  /** 지난 프레임에 화면 밖이라 그리는 호출을 건너뛴 설치물 수(점검용) */
  private skipped = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly installations: readonly InstallationDef[],
    private readonly bridge: WorldBridge,
    private readonly cull: ViewCull,
  ) {
    this.g = scene.add.graphics().setDepth(LAYER_DEPTH);
    for (const inst of installations) {
      const r = slotBounds(inst);
      this.reach.set(inst.installationId, grow({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, INSTALLATION_CULL_PAD));
    }
    this.lanes = new TimelineLayer(scene, installations, LAYER_DEPTH);
    this.wheels = new WheelLayer(scene, installations, LAYER_DEPTH);
    this.bells = new BellLayer(scene, installations, LAYER_DEPTH);
    this.terraces = new TerraceLayer(scene, installations, LAYER_DEPTH);
    this.bridges = new KeyBridgeLayer(scene, installations, LAYER_DEPTH);
    const res = Math.min(3, Math.max(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2));
    const text = (content: string, size: number, color: string, originX: number): Phaser.GameObjects.Text =>
      scene.add
        .text(0, 0, content, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
        .setOrigin(originX, 0.5)
        .setResolution(res)
        .setDepth(LAYER_DEPTH + 1)
        .setVisible(false);
    for (const inst of installations) {
      // 징검다리는 칸이 아니라 돌 구간을, 종나무는 고리 칸 안의 종을, 계단밭은 열 안의 등을, 건반 다리는 널 위의 표시를 따로 그린다: 칸마다 글자를 두지 않는다
      if (this.lanes.has(inst.installationId) || this.bells.has(inst.installationId) || this.terraces.has(inst.installationId) || this.bridges.has(inst.installationId)) continue;
      const layout = stageLayoutOf(inst);
      this.texts.set(
        inst.installationId,
        inst.slots.map((): SlotTexts => {
          const t: SlotTexts = {
            name: text('', 30, INK_CSS, 0.5),
            num: text('', 20, INK_CSS, 0.5),
            bang: text('', 30, WHITE_CSS, 0.5),
            note: text('', 26, GOLD_TEXT_CSS, 0.5),
            nameWhite: false,
          };
          // 무대 칸은 돌보다 작다: 느낌표 배지와 ♪를 줄여 그린다
          if (layout) {
            t.bang.setScale(0.7);
            t.note.setScale(0.8);
          }
          return t;
        }),
      );
      if (layout) {
        this.stages.set(inst.installationId, {
          layout,
          cols: Array.from({ length: layout.measures }, (_, m) => text(`${m + 1}마디`, 22, INK_CSS, 0.5)),
          rows: layout.rows.map((r) => text(r.label, 18, INK_CSS, 1)),
          colWhite: Array.from({ length: layout.measures }, () => false),
        });
      }
    }
  }

  /** 밟은 돌을 잠깐 반짝이게 한다(소리를 꺼 두어도 밟았다는 것이 보인다, W-8) */
  flash(installationId: string, slot: number, now: number): void {
    this.flashes.set(`${installationId}#${slot}`, now);
  }

  /** 밟은 칸의 남은 반짝임(1에서 0으로 줄어든다). 다 지나갔으면 기억을 지운다. 움직임 줄이기에서는 반짝이지 않는다 */
  private flashLeftOf(installationId: string, slot: number, now: number, reduce: boolean): number {
    const key = `${installationId}#${slot}`;
    const flashAt = this.flashes.get(key);
    const left = flashAt === undefined || reduce ? 0 : 1 - (now - flashAt) / STEP_FLASH_SECONDS;
    if (flashAt !== undefined && left <= 0) this.flashes.delete(key);
    return left;
  }

  /** 지금 그린 것(점검용) */
  debug(): readonly DrawnInstallation[] {
    return this.drawn;
  }

  /** 지난 프레임에 화면 밖이라 그리는 호출을 건너뛴 설치물 수(점검용). 기록(debug)과 글자 자리는 건너뛰지 않는다 */
  skippedCount(): number {
    return this.skipped;
  }

  /** 매 프레임: 다리의 상태를 읽어 돌 위에 그린다. now는 장면의 시계(초), reduce는 움직임 줄이기 */
  update(now: number, reduce: boolean): void {
    const g = this.g;
    g.clear();
    const mode = this.bridge.installationMode.get();
    const views = this.bridge.installationViews.get();
    const drawn: DrawnInstallation[] = [];
    // 화면 밖 설치물은 그리는 호출만 건너뛴다(8-4): 그린 기록과 글자 자리는 그대로 계산하므로 점검과 낭독은 달라지지 않는다
    const seen = (id: string): boolean => this.cull.sees(this.reach.get(id)!);
    const to = (id: string): Phaser.GameObjects.Graphics => (seen(id) ? g : NO_DRAW);
    this.skipped = this.installations.reduce((n, inst) => n + (seen(inst.installationId) ? 0 : 1), 0);
    // 계단밭은 한 땅을 세 설치물이 나눠 쓰므로 밭 단위로 한 번만 그린다(밭의 설치물 중 하나라도 화면에 닿으면 밭을 그린다)
    const fields = this.terraces.drawAll((ids) => (ids.some(seen) ? g : NO_DRAW), views, mode?.installationId ?? null, (id, slot) => this.flashLeftOf(id, slot, now, reduce));
    // 건반 다리도 한 번에 그린다: 글자를 프레임마다 돌려 쓰므로 다리마다 따로 시작하고 끝내지 않는다
    const spans = this.bridges.drawAll(to, views, mode?.installationId ?? null, (id, slot) => this.flashLeftOf(id, slot, now, reduce));
    for (const inst of this.installations) {
      const target = to(inst.installationId);
      const active = mode?.installationId === inst.installationId;
      const view: InstallationView | undefined = views.find((v) => v.installationId === inst.installationId);
      if (this.lanes.has(inst.installationId)) {
        const timeline = this.lanes.draw(target, inst, view, active);
        // 물레방아는 같은 초안을 바퀴로도 그린다(띠와 바퀴가 같은 TimelineView를 읽는다)
        const wheel = this.wheels.draw(target, inst, view, active, reduce);
        const marks = inst.slots.map((rect) => view?.slots.find((s) => s.slot === rect.slot) ?? EMPTY_MARK(rect.slot));
        const entry: DrawnInstallation = {
          installationId: inst.installationId,
          active,
          slots: marks.map((m) => ({ slot: m.slot, label: m.name, numbered: false, selected: active && m.selected, flagged: m.flagged, playing: m.playing })),
          timeline,
        };
        if (wheel) entry.wheel = wheel;
        drawn.push(entry);
        continue;
      }
      if (this.bells.has(inst.installationId)) {
        const bell = this.bells.draw(target, inst, view, active);
        const marks = inst.slots.map((rect) => view?.slots.find((s) => s.slot === rect.slot) ?? EMPTY_MARK(rect.slot));
        drawn.push({
          installationId: inst.installationId,
          active,
          slots: marks.map((m) => ({ slot: m.slot, label: m.name, numbered: false, selected: active && m.selected, flagged: m.flagged, playing: m.playing })),
          bell,
        });
        continue;
      }
      const terrace = fields.get(inst.installationId);
      if (terrace) {
        const marks = inst.slots.map((rect) => view?.slots.find((s) => s.slot === rect.slot) ?? EMPTY_MARK(rect.slot));
        drawn.push({
          installationId: inst.installationId,
          active,
          slots: marks.map((m) => ({ slot: m.slot, label: m.name, numbered: false, selected: active && m.selected, flagged: m.flagged, playing: m.playing })),
          terrace,
        });
        continue;
      }
      const keyBridge = spans.get(inst.installationId);
      if (keyBridge) {
        const marks = inst.slots.map((rect) => view?.slots.find((s) => s.slot === rect.slot) ?? EMPTY_MARK(rect.slot));
        drawn.push({
          installationId: inst.installationId,
          active,
          slots: marks.map((m) => ({ slot: m.slot, label: m.name, numbered: false, selected: active && m.selected, flagged: m.flagged, playing: m.playing })),
          keyBridge,
        });
        continue;
      }
      const texts = this.texts.get(inst.installationId)!;
      const stage = this.stages.get(inst.installationId) ?? null;
      const slots: DrawnSlot[] = [];
      inst.slots.forEach((rect, i) => {
        const mark = view?.slots.find((s) => s.slot === rect.slot) ?? (stage ? EMPTY_CELL(rect.slot) : EMPTY_MARK(rect.slot));
        const flashLeft = this.flashLeftOf(inst.installationId, rect.slot, now, reduce);
        slots.push(mark.fill !== undefined ? this.drawStageCell(target, rect, mark, active, flashLeft, texts[i]!) : this.drawSlot(target, rect, mark, active, flashLeft, texts[i]!));
      });
      const out: DrawnInstallation = { installationId: inst.installationId, active, slots };
      if (stage) {
        const selectedMeasure = selectedMeasureOf(stage.layout, slots);
        this.drawStageLabels(target, inst, stage, active, selectedMeasure);
        out.selectedMeasure = selectedMeasure;
        out.labelled = active;
      }
      drawn.push(out);
    }
    this.drawn = drawn;
  }

  private drawSlot(g: Phaser.GameObjects.Graphics, r: SlotRect, m: SlotMark, active: boolean, flashLeft: number, t: SlotTexts): DrawnSlot {
    const cx = r.x + r.w / 2;
    const placed = m.name !== null;

    // 놓인 돌: 옅은 초록 바탕과 테두리, 이름 글자
    if (placed) {
      g.fillStyle(TEAL_LIGHT, 0.88).fillRoundedRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 14);
      g.lineStyle(3, TEAL, 0.9).strokeRoundedRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 14);
    } else if (active) {
      // 빈 돌은 설치물 모드에서만 점선 느낌의 옅은 테두리로 자리를 알려 준다
      g.lineStyle(2, TEAL, 0.45).strokeRoundedRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 14);
    }
    if (flashLeft > 0) {
      g.fillStyle(GOLD, 0.4 * flashLeft).fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 16);
      g.lineStyle(4, GOLD, flashLeft).strokeRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 16);
    }
    if (m.playing) {
      g.fillStyle(GOLD, 0.38).fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 16);
      g.lineStyle(6, GOLD, 1).strokeRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 16);
    }

    // 고른 자리: 굵은 테두리와 위쪽의 ▼
    if (active && m.selected) {
      g.lineStyle(8, TEAL, 1).strokeRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 18);
      g.fillStyle(TEAL, 1).fillTriangle(cx - 14, r.y - 34, cx + 14, r.y - 34, cx, r.y - 12);
    }

    // 이름
    t.name.setVisible(placed);
    if (placed) t.name.setText(m.name!).setPosition(cx, r.y + r.h * 0.4);

    // 자리 번호(설치물 모드에서만): 아래쪽 흰 원 안에
    t.num.setVisible(active);
    if (active) {
      const ny = r.y + r.h - 24;
      g.fillStyle(WHITE, 1).fillCircle(cx, ny, 17);
      g.lineStyle(2, INK, 0.9).strokeCircle(cx, ny, 17);
      t.num.setText(String(m.slot)).setPosition(cx, ny);
    }

    // 판정이 가리킨 자리: 오른쪽 위의 산호색 배지와 '!' 글자(색만으로 전하지 않는다)
    t.bang.setVisible(m.flagged);
    if (m.flagged) {
      const bx = r.x + r.w - 6;
      const by = r.y + 6;
      g.fillStyle(CORAL, 1).fillCircle(bx, by, 20);
      g.lineStyle(3, WHITE, 1).strokeCircle(bx, by, 20);
      t.bang.setText('!').setPosition(bx, by + 1);
    }

    // 듣는 중인 자리: ♪ 글자
    t.note.setVisible(m.playing);
    if (m.playing) t.note.setText('♪').setPosition(cx, r.y - 22);

    return { slot: m.slot, label: m.name, numbered: active, selected: active && m.selected, flagged: m.flagged, playing: m.playing };
  }

  /**
   * 무대 바닥의 칸 하나(4.9). 채운 정도로 모양이 갈린다: 쓰지 않음(빗금) · 비어 있음(흰 바탕) · 일부(옅은 초록과 n/N) · 가득(진한 초록과 N/N). 채운 정도일 뿐 맞고 틀림이 아니다.
   * 걷는 동안에는 채운 칸만 보이고, 설치물 모드에서는 빈 칸과 쓰지 않는 칸의 자리도 보인다.
   */
  private drawStageCell(g: Phaser.GameObjects.Graphics, r: SlotRect, m: SlotMark, active: boolean, flashLeft: number, t: SlotTexts): DrawnSlot {
    const fill = m.fill ?? 'empty';
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const x = r.x + 2;
    const y = r.y + 2;
    const w = r.w - 4;
    const h = r.h - 4;

    if (fill === 'unused') {
      if (active) {
        g.fillStyle(INK, 0.08).fillRoundedRect(x, y, w, h, 10);
        g.lineStyle(2, INK, 0.3).strokeRoundedRect(x, y, w, h, 10);
        g.lineStyle(2, INK, 0.28);
        for (const [x0, y0, x1, y1] of hatchSegments(x + 6, y + 6, w - 12, h - 12, 12)) g.lineBetween(x0, y0, x1, y1);
      }
    } else if (fill === 'full') {
      g.fillStyle(TEAL, 0.95).fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(3, TEAL, 1).strokeRoundedRect(x, y, w, h, 10);
    } else if (fill === 'partial') {
      g.fillStyle(TEAL_LIGHT, 0.95).fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(3, TEAL, 0.9).strokeRoundedRect(x, y, w, h, 10);
    } else if (active) {
      g.fillStyle(WHITE, 0.72).fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(2.5, TEAL, 0.6).strokeRoundedRect(x, y, w, h, 10);
    }
    if (flashLeft > 0) {
      g.fillStyle(GOLD, 0.4 * flashLeft).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 11);
      g.lineStyle(4, GOLD, flashLeft).strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, 11);
    }
    if (m.playing) {
      g.fillStyle(GOLD, 0.38).fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(5, GOLD, 1).strokeRoundedRect(x, y, w, h, 10);
    }

    // 고른 마디: 굵은 테두리(칸마다 ▼를 달지 않는다. 고른 마디는 위쪽 마디 이름표가 채워져 함께 알린다)
    const selected = active && m.selected && fill !== 'unused';
    if (selected) g.lineStyle(6, TEAL, 1).strokeRoundedRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, 12);

    // 채운 정도 글자: 일부와 가득 모두 'n/N'(색만으로 전하지 않는다). ✓는 맞다는 뜻으로 읽히므로 쓰지 않는다
    const showName = fill === 'partial' || fill === 'full';
    t.name.setVisible(showName && m.name !== null);
    if (showName && m.name !== null) {
      const white = fill === 'full';
      t.name.setText(m.name).setPosition(cx, cy + 2);
      if (t.nameWhite !== white) {
        t.name.setColor(white ? WHITE_CSS : INK_CSS);
        t.nameWhite = white;
      }
    }
    t.num.setVisible(false);

    // 판정이 가리킨 칸: 오른쪽 위의 작은 산호색 배지와 '!' 글자
    t.bang.setVisible(m.flagged);
    if (m.flagged) {
      const bx = r.x + r.w - 10;
      const by = r.y + 10;
      g.fillStyle(CORAL, 1).fillCircle(bx, by, 14);
      g.lineStyle(2.5, WHITE, 1).strokeCircle(bx, by, 14);
      t.bang.setText('!').setPosition(bx, by + 1);
    }

    // 듣는 중인 칸: 왼쪽 위의 ♪ 글자
    t.note.setVisible(m.playing);
    if (m.playing) t.note.setText('♪').setPosition(r.x + 16, r.y + 16);

    return { slot: m.slot, label: m.name, numbered: false, selected, flagged: m.flagged, playing: m.playing, fill };
  }

  /** 마디 이름(첫 줄 위)과 성부 이름(첫 칸 왼쪽). 설치물 모드에서만 보인다. 고른 마디의 이름표는 진한 바탕에 흰 글자로 채운다 */
  private drawStageLabels(g: Phaser.GameObjects.Graphics, inst: InstallationDef, stage: StageLabels, active: boolean, selectedMeasure: number | null): void {
    const { measures } = stage.layout;
    const minX = Math.min(...inst.slots.map((s) => s.x));
    const minY = Math.min(...inst.slots.map((s) => s.y));
    const bandY = minY - STAGE_LABEL_TOP / 2 + 2;
    stage.cols.forEach((t, m) => {
      t.setVisible(active);
      if (!active) return;
      const rect = inst.slots[m];
      if (!rect) return;
      const cx = rect.x + rect.w / 2;
      const on = selectedMeasure === m;
      const pw = t.width + 22;
      const ph = 32;
      if (on) g.fillStyle(TEAL, 1).fillRoundedRect(cx - pw / 2, bandY - ph / 2, pw, ph, 16);
      else {
        g.fillStyle(WHITE, 0.92).fillRoundedRect(cx - pw / 2, bandY - ph / 2, pw, ph, 16);
        g.lineStyle(2, TEAL, 0.55).strokeRoundedRect(cx - pw / 2, bandY - ph / 2, pw, ph, 16);
      }
      if (stage.colWhite[m] !== on) {
        t.setColor(on ? WHITE_CSS : INK_CSS);
        stage.colWhite[m] = on;
      }
      t.setPosition(cx, bandY + 1);
    });
    stage.rows.forEach((t, r) => {
      t.setVisible(active);
      if (!active) return;
      const rect = inst.slots[r * measures];
      if (!rect) return;
      const right = minX - 8;
      const cy = rect.y + rect.h / 2;
      const pw = t.width + 18;
      const ph = 30;
      g.fillStyle(WHITE, 0.92).fillRoundedRect(right - pw, cy - ph / 2, pw, ph, 15);
      g.lineStyle(2, TEAL, 0.55).strokeRoundedRect(right - pw, cy - ph / 2, pw, ph, 15);
      t.setPosition(right - 9, cy + 1);
    });
  }

  destroy(): void {
    this.g.destroy();
    this.lanes.destroy();
    this.wheels.destroy();
    this.bells.destroy();
    this.terraces.destroy();
    this.bridges.destroy();
    for (const list of this.texts.values()) for (const t of list) for (const o of [t.name, t.num, t.bang, t.note]) o.destroy();
    for (const s of this.stages.values()) for (const o of [...s.cols, ...s.rows]) o.destroy();
    this.texts.clear();
    this.stages.clear();
    this.flashes.clear();
  }
}

/** 그려진 칸들 가운데 고른 칸이 있는 마디(0부터). 없으면 null */
function selectedMeasureOf(layout: StageLayout, slots: readonly DrawnSlot[]): number | null {
  for (const s of slots) {
    if (!s.selected) continue;
    const cell = stageCellOfSlot(layout, s.slot);
    if (cell) return cell.measureIndex;
  }
  return null;
}
