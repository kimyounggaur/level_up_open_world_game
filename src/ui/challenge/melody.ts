// 자유 가락(4.9, 6.1 '만듦')을 화면이 쓰는 한곳: 저장하기, 저장한 곡 다시 듣기, 찾은 소리 조각을 재료함에서 고르고 마디에 놓기.
// 초안과 소리는 컨트롤러가 쥐고, 저장한 곡과 찾은 것은 앱이 쥔 목록(구조만 맞으면 된다)을 본다. 판정하지 않는다.
import { FREE_QUEST_PREFIX } from '../../domain/content';
import { creationPlayback, defaultName, pieceInsertEdit } from '../../domain/creation';
import type { AddResult, Creation, RenameResult } from '../../domain/creation';
import { describePiece, piecePlayback } from '../../domain/discovery';
import type { SoundPieceDef } from '../../domain/discovery';
import { fillTemplate } from '../../domain/feedback';
import { midiOf } from '../../domain/pitch';
import type { ScoreEvent } from '../../domain/score';
import { timelineOf, timelinePitches } from '../../domain/timeline';
import type { Store } from '../../platform/bridge';
import type { ChallengeController } from './controller';

/** 앱이 쥔 저장한 곡 목록(Creations)의 구조 */
export interface CreationBook {
  readonly store: Store<readonly Creation[]>;
  list(): readonly Creation[];
  get(creationId: string): Creation | undefined;
  save(input: { name?: string; installationId: string; events: readonly ScoreEvent[]; createdAt: string }): AddResult;
  rename(creationId: string, name: string): RenameResult;
  remove(creationId: string): boolean;
}

/** 앱이 쥔 찾은 발견 요소(FoundDiscoveries)의 구조 */
export interface FoundBook {
  readonly store: Store<ReadonlySet<string>>;
  has(discoveryId: string): boolean;
}

export interface MelodyDeps {
  controller: ChallengeController;
  creations: CreationBook;
  found: FoundBook;
  /** 이 채널에서 보이는 소리 조각들. 찾은 것만 재료함에 올라온다 */
  pieces: readonly SoundPieceDef[];
  nowIso: () => string;
}

export type SaveOutcome = { ok: true; creation: Creation; duplicate: boolean; message: string } | { ok: false; message: string };

/** 재료함에 올라온 소리 조각 */
export interface PieceChoice {
  discoveryId: string;
  name: string;
  /** 음 이름 읽기. 예: 'C4 D4 E4 G4' */
  notes: string;
}

export const NOT_FREE_MELODY = '자유 가락이 열려 있을 때만 쓸 수 있어요.';
export const PIECE_OUT_OF_RANGE = '이 조각은 자유 가락의 음 높이를 벗어나서 놓을 수 없어요.';

/** 듣고 있는 것의 열쇠(listening) */
export const songKey = (creationId: string): string => `song:${creationId}`;
export const pieceKey = (discoveryId: string): string => `piece:${discoveryId}`;

export class FreeMelody {
  /** 이 서비스가 마지막으로 들려 주기 시작한 것. 듣는 중인지는 컨트롤러가 안다 */
  private lastPreview: string | null = null;

  constructor(private readonly d: MelodyDeps) {}

  /** 찾은 발견 요소가 바뀌면 알리는 곳(재료함이 다시 그려진다) */
  get found(): Store<ReadonlySet<string>> {
    return this.d.found.store;
  }

  /** 저장한 곡이 바뀌면 알리는 곳 */
  get creations(): Store<readonly Creation[]> {
    return this.d.creations.store;
  }

  /** 지금 열려 있는 것이 자유 가락인가 */
  get active(): boolean {
    return this.d.controller.isFree && this.d.controller.isArrangement;
  }

  /** 다음에 저장하면 붙을 이름('내 곡 N') */
  suggestedName(): string {
    return defaultName(this.d.creations.list());
  }

  /**
   * 지금 자유 가락의 가락을 내 곡으로 저장한다. 이름이 비어 있으면 기본 이름이다.
   * 음이 없으면 저장하지 않는다. 이미 저장한 같은 가락이면 새로 만들지 않고 그 곡을 알려 준다.
   */
  save(rawName?: string): SaveOutcome {
    const cur = this.d.controller.current;
    if (!cur || !cur.free || !this.active) return { ok: false, message: NOT_FREE_MELODY };
    const trimmed = rawName?.trim() ?? '';
    const r = this.d.creations.save({
      ...(trimmed ? { name: trimmed } : {}),
      installationId: cur.entry.questId.slice(FREE_QUEST_PREFIX.length),
      events: this.d.controller.content().events,
      createdAt: this.d.nowIso(),
    });
    if (!r.ok) {
      this.d.controller.notify(r.message);
      return { ok: false, message: r.message };
    }
    const message = r.duplicate
      ? fillTemplate('같은 가락이 이미 {name:으로로} 저장되어 있어요.', { name: r.creation.name })
      : fillTemplate('{name:을를} 저장했어요. 무대에서 다시 들을 수 있어요.', { name: r.creation.name });
    this.d.controller.notify(message);
    return { ok: true, creation: r.creation, duplicate: r.duplicate, message };
  }

  /** 저장한 곡을 다시 듣는다(수첩, 무대). 곡이 없으면 false */
  replay(creationId: string): boolean {
    const c = this.d.creations.get(creationId);
    const started = c ? this.d.controller.previewPlayback(creationPlayback(c)) : false;
    if (started) this.lastPreview = songKey(creationId);
    return started;
  }

  /** 저장한 곡 목록(먼저 저장한 곡이 앞) */
  list(): readonly Creation[] {
    return this.d.creations.list();
  }

  /** 곡 이름을 바꾼다(수첩, 6.5). 이름 규칙은 저장할 때와 같다 */
  rename(creationId: string, rawName: string): RenameResult {
    return this.d.creations.rename(creationId, rawName);
  }

  /** 곡을 지운다(수첩, 6.5). 사람이 하는 일이라 여기서만 지운다. 그 곡을 듣는 중이었으면 멈춘다. 지웠으면 true */
  remove(creationId: string): boolean {
    if (this.listening() === songKey(creationId)) this.stopPreview();
    return this.d.creations.remove(creationId);
  }

  /** 지금 듣고 있는 것의 열쇠: 저장한 곡은 'song:<곡 id>', 소리 조각은 'piece:<발견 id>'. 듣는 중이 아니면 null */
  listening(): string | null {
    return this.d.controller.previewing ? this.lastPreview : null;
  }

  /** 듣던 것을 멈춘다. 듣는 중이 아니면 아무 일도 없다(열려 있는 도전의 재생은 건드리지 않는다) */
  stopPreview(): void {
    if (this.d.controller.previewing) this.d.controller.stopPlayback();
  }

  /** 찾은 소리 조각들(id 순서). 못 찾은 것은 올라오지 않는다: 어디에 있는지도 알려 주지 않는다(3.6) */
  foundPieces(): PieceChoice[] {
    return this.d.pieces.filter((p) => this.d.found.has(p.discoveryId)).map((p) => ({ discoveryId: p.discoveryId, name: p.name, notes: describePiece(p) }));
  }

  private pieceOf(discoveryId: string): SoundPieceDef | undefined {
    return this.d.pieces.find((p) => p.discoveryId === discoveryId && this.d.found.has(p.discoveryId));
  }

  /** 지금 열린 자유 가락의 음역(패널의 음 높이 단추가 보이는 범위) 안에 조각의 모든 음이 드는가. 밖의 음은 패널에서 다시 놓거나 바꿀 수 없다 */
  private fitsRange(piece: SoundPieceDef): boolean {
    const cur = this.d.controller.current;
    if (!cur) return false;
    const allowed = new Set(timelinePitches(timelineOf(cur.def)).map((p) => midiOf(p)));
    return piece.notes.every((n) => allowed.has(n.midi));
  }

  /** 찾은 소리 조각을 미리 듣는다 */
  previewPiece(discoveryId: string): boolean {
    const piece = this.pieceOf(discoveryId);
    const started = piece ? this.d.controller.previewPlayback(piecePlayback(piece)) : false;
    if (started) this.lastPreview = pieceKey(discoveryId);
    return started;
  }

  /**
   * 찾은 소리 조각을 한 마디에 놓는다. 그 마디에 있던 음은 걷어 내고 조각의 음이 놓인다. 실행 취소 한 번으로 되돌린다.
   * 자유 가락이 열려 있지 않거나 찾지 못한 조각이면 아무것도 바꾸지 않는다.
   */
  placePiece(discoveryId: string, measureIndex: number): { ok: boolean; message: string } {
    if (!this.active) return { ok: false, message: NOT_FREE_MELODY };
    const piece = this.pieceOf(discoveryId);
    if (!piece) return { ok: false, message: '아직 찾지 못한 소리 조각이에요.' };
    if (!this.fitsRange(piece)) return { ok: false, message: PIECE_OUT_OF_RANGE };
    const idBase = `pc-${discoveryId.slice(discoveryId.lastIndexOf('-') + 1)}-m${measureIndex}`;
    const edit = pieceInsertEdit(this.d.controller.content(), piece.notes, measureIndex, idBase);
    if (!edit) return { ok: false, message: '이 마디에는 놓을 수 없어요.' };
    const message = fillTemplate('{name:을를} {measure}마디에 놓았어요.', { name: piece.name, measure: measureIndex + 1 });
    this.d.controller.edit(edit, message);
    return { ok: true, message };
  }
}
