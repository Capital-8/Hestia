import { orientedRect } from '@hestia/geom';
import {
  frameOfWall,
  openingGeometry,
  openingPlanPathsAt,
  openingPreviewLocalPaths,
  pointAt,
  toLocal,
  type OpeningPlanPath,
} from '@hestia/engine';
import { dimensionSettingsOf, openingTypeById, openingType, openingsOfWall, unitsOf, type DetailLevel, type Opening, type OpeningType, type Project, type Wall, type WallType } from '@hestia/model';
import { ToolBase, makeId } from './base.ts';
import { hostUnder, occupiedRanges } from './infer.ts';
import { parseQuantityText } from './numeric.ts';
import {
  anchorCenter,
  clampOpeningCenter,
  facingForCursor,
  freeSpans,
  overlapsPerpendicular,
  perpendicularNeighbors,
  sideWithHysteresis,
  type PerpendicularWall,
} from './openingPlacement.ts';
import { openingDimProvider, type OpeningDimSubject } from './dims/providers/opening.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import type { PointerInfo } from './types.ts';

/**
 * Cache da prévia: os traços LOCAIS do vão (não dependem do `offset`) valem enquanto o tipo, a parede, as inversões e o
 * detalhe não mudarem de identidade. A cada movimento só se converte para o mundo, que é a translação ao longo da parede.
 */
interface PreviewCache {
  type: OpeningType;
  wall: Wall;
  wallType: WallType;
  thickness: number;
  flipHand: boolean;
  flipFacing: boolean;
  detail: DetailLevel;
  paths: OpeningPlanPath[];
}

/** Porta e janela: hospedadas na parede sob o cursor (docs/02 §5). */
export class OpeningTool extends ToolBase {
  readonly id: 'door' | 'window';
  readonly label: string;
  override get hint(): string {
    return this.t('tl_hint_opening', { label: this.t(this.id === 'door' ? 'tl_tool_door' : 'tl_tool_window') });
  }
  private flipHand = false;
  private flipFacing = false;
  private lastSide: 1 | -1 = 1;
  private current: { wallId: string; offset: number } | null = null;
  private lastPointer: PointerInfo | null = null;
  private previewCache: PreviewCache | null = null;
  /** Esquadria da prévia para as cotas dinâmicas; null sem parede sob o cursor. */
  private dimSubject: OpeningDimSubject | null = null;

  constructor(env: ConstructorParameters<typeof ToolBase>[0], kind: 'door' | 'window') {
    super(env);
    this.id = kind;
    this.label = kind === 'door' ? 'Porta' : 'Janela';
  }

  protected reset(): void {
    this.items = [];
    this.dimSubject = null;
    this.current = null;
    this.lastSide = 1;
    this.lastPointer = null;
  }

  protected busy(): boolean {
    return false;
  }

  private typeId(): string {
    const o = this.env.options();
    return this.id === 'door' ? o.doorTypeId : o.windowTypeId;
  }

  /** Redesenha a prévia na hora: reexecuta o cálculo na última posição do ponteiro, sem esperar o próximo movimento. */
  private refreshPreview(): void {
    if (this.lastPointer) this.move(this.lastPointer);
  }

  override tab(): void {
    this.flipFacing = !this.flipFacing;
    this.refreshPreview();
  }

  flipHandToggle(): void {
    this.flipHand = !this.flipHand;
    this.refreshPreview();
  }

  override space(): void {
    this.flipHandToggle();
  }

  /** Intenção corrente: dobradiça e sentido já com os toggles (Espaço/Tab) por cima do modo das opções. */
  private intent(): { flipHand: boolean; flipFacing: boolean } {
    const o = this.env.options();
    return {
      flipHand: (o.openingFlipHand ?? false) !== this.flipHand,
      flipFacing: facingForCursor(this.lastSide, o) !== this.flipFacing,
    };
  }

  override inputPrompt(): string | null {
    return this.current ? this.t('tl_inp_wall_offset') : null;
  }

  private resolve(offset: number, wallId: string, neighbors = perpendicularNeighbors(this.env.project(), wallId, this.env.levelId())): number | null {
    const p = this.env.project();
    const t = openingTypeById(p, this.typeId());
    const f = frameOfWall(p, wallId);
    if (!t || !f) return null;
    const half = t.width / 2;
    if (f.length < t.width + 0.02) return null;
    const o = Math.max(half + 0.01, Math.min(f.length - half - 0.01, offset));
    // A abertura fica no trecho livre: não atravessa parede perpendicular que encosta na hospedeira.
    if (overlapsPerpendicular(neighbors, o, t.width)) return null;
    for (const [a, b] of occupiedRanges(p, wallId, undefined, [t.sill, t.sill + t.height])) {
      if (o + half > a + 1e-6 && o - half < b - 1e-6) return null;
    }
    return o;
  }

  /**
   * Captura da posição na parede (S-11): a borda da abertura encosta na ponta da parede, em outra abertura (encosto,
   * batente ou eixo), no centro do trecho livre entre as perpendiculares, ou a `openingClear` da face delas. Só com a
   * captura ligada (F3 desliga). Digitar a distância não passa por aqui: é exata.
   */
  private snapOffset(offset: number, wallId: string, width: number, neighbors: PerpendicularWall[]): { offset: number; note: string | null } {
    if (this.env.options().snap?.enabled === false) return { offset, note: null };
    const pr = this.env.project();
    const f = frameOfWall(pr, wallId);
    if (!f) return { offset, note: null };
    const tol = 10 * this.env.metersPerPixel();
    const h = width / 2;
    const targets: Array<{ c: number; note: string }> = [
      { c: h + 0.01, note: this.t('tl_note_wall_start') },
      { c: f.length - h - 0.01, note: this.t('tl_note_wall_end') },
    ];
    // Centro do trecho livre entre as paredes perpendiculares vizinhas.
    for (const span of freeSpans(neighbors, f.length)) {
      if (span.hi - span.lo >= width + 0.02) targets.push({ c: (span.lo + span.hi) / 2, note: this.t('tl_note_span_center') });
    }
    // Folga da quina: a borda da abertura fica a `openingClear` da face da perpendicular.
    const clear = this.env.options().openingClear ?? 0.1;
    for (const n of neighbors) {
      for (const [face, dir] of [[n.faceLo, -1], [n.faceHi, 1]] as Array<[number, 1 | -1]>) {
        const c = face + dir * (clear + h);
        if (c > 0 && c < f.length) targets.push({ c, note: this.t('tl_note_clear_from_wall', { d: Math.round(clear * 100) }) });
      }
    }
    for (const o of openingsOfWall(pr, wallId)) {
      const ot = openingTypeById(pr, o.typeId);
      const ow = (ot?.width ?? 0.8) / 2;
      targets.push(
        { c: o.offset - ow - h, note: this.t('tl_note_opening_butt') },
        { c: o.offset + ow + h, note: this.t('tl_note_opening_butt') },
        { c: o.offset - ow + h, note: this.t('tl_note_jamb_aligned') },
        { c: o.offset + ow - h, note: this.t('tl_note_jamb_aligned') },
        { c: o.offset, note: this.t('tl_note_axis_aligned') },
      );
    }
    let best: { c: number; note: string; d: number } | null = null;
    for (const t of targets) {
      const d = Math.abs(t.c - offset);
      if (d <= tol && (!best || d < best.d)) best = { ...t, d };
    }
    return best ? { offset: best.c, note: best.note } : { offset, note: null };
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.dimSubject = null;
    this.raw = p.raw;
    this.lastPointer = p;
    const pr = this.env.project();
    const mpp = this.env.metersPerPixel();
    const options = this.env.options();
    const snapOn = options.snap?.enabled !== false;
    // A abertura é mais tolerante que o resto: 16 px além da face ainda conta como sobre a parede.
    const host = hostUnder(p.raw, pr, this.env.levelId(), mpp, snapOn, 16);
    this.inf = null;
    this.current = null;
    if (!host) {
      this.env.say(this.hint);
      return;
    }
    const f = frameOfWall(pr, host.wallId);
    const t = openingTypeById(pr, this.typeId());
    if (!f || !t) return;
    const neighbors = perpendicularNeighbors(pr, host.wallId, this.env.levelId());
    // O lado do cursor define o sentido, com histerese de 3 px perto do eixo.
    this.lastSide = sideWithHysteresis(toLocal(f, p.raw).s, this.lastSide, 3 * mpp);
    const { flipHand, flipFacing } = this.intent();
    const center = anchorCenter(host.offset, t.width, flipHand, options.openingAnchor);
    const aligned = this.snapOffset(center, host.wallId, t.width, neighbors);
    const off = this.resolve(aligned.offset, host.wallId, neighbors);
    const preview = off ?? clampOpeningCenter(aligned.offset, t.width, f.length, host.offset);
    this.items.push({ kind: 'highlight', ids: [host.wallId] });
    this.drawPreview(host.wallId, f, t.width, preview, flipHand, flipFacing, off !== null);
    if (off === null) {
      this.env.say(this.t('tl_msg_no_free_space'));
      return;
    }
    this.current = { wallId: host.wallId, offset: off };
    const hinge = this.t(flipHand ? 'tl_side_right' : 'tl_side_left');
    const abre = this.t(flipFacing === (this.lastSide < 0) ? 'tl_msg_opens_this_side' : 'tl_msg_opens_other_side');
    this.env.say(
      this.t('tl_msg_opening_preview', {
        type: t.name,
        hinge,
        side: abre,
        note: aligned.note ? ` · ${aligned.note}` : '',
      }),
    );
  }

  /** Traços locais da prévia (cache): não dependem do `offset`, só do tipo, da parede, das inversões e do detalhe. */
  private previewPaths(p: Project, temp: Opening, f: NonNullable<ReturnType<typeof frameOfWall>>): OpeningPlanPath[] {
    const raw = p.openingTypes[temp.typeId];
    if (!raw) return [];
    const detail = p.settings.detail;
    const c = this.previewCache;
    if (
      c &&
      c.type === raw &&
      c.wall === f.wall &&
      c.wallType === f.type &&
      c.thickness === f.thickness &&
      c.flipHand === temp.flipHand &&
      c.flipFacing === temp.flipFacing &&
      c.detail === detail
    ) {
      return c.paths;
    }
    const paths = openingPreviewLocalPaths(p, temp, f, detail);
    this.previewCache = {
      type: raw,
      wall: f.wall,
      wallType: f.type,
      thickness: f.thickness,
      flipHand: temp.flipHand,
      flipFacing: temp.flipFacing,
      detail,
      paths,
    };
    return paths;
  }

  /** Prévia: símbolo real da esquadria + retângulo do vão + duas cotas temporárias. Inválida em vermelho. */
  private drawPreview(
    wallId: string,
    f: NonNullable<ReturnType<typeof frameOfWall>>,
    width: number,
    offset: number,
    flipHand: boolean,
    flipFacing: boolean,
    valid: boolean,
  ): void {
    const options = this.env.options();
    const tone = valid ? undefined : ('invalid' as const);
    const temp: Opening = {
      id: 'preview',
      kind: this.id,
      typeId: this.typeId(),
      hostId: wallId,
      offset,
      flipHand,
      flipFacing,
      sillOverride: options.openingSillOverride ?? null,
      mark: '',
    };
    const pr = this.env.project();
    const g = openingGeometry(pr, temp, f);
    for (const s of openingPlanPathsAt(g, this.previewPaths(pr, temp, f))) {
      const count = s.closed ? s.pts.length : s.pts.length - 1;
      for (let i = 0; i < count; i++) {
        this.items.push({ kind: 'line', a: s.pts[i]!, b: s.pts[(i + 1) % s.pts.length]!, dashed: s.dash !== undefined, tone });
      }
    }
    const c = pointAt(f, offset, f.sMid);
    this.items.push({ kind: 'polygon', ring: orientedRect(c.x, c.y, f.u.x, f.u.y, width / 2, f.thickness / 2 + 0.02), tone });
    this.dimSubject = { hostId: wallId, offset, typeId: this.typeId(), flipFacing, flipHand, side: this.lastSide };
  }

  /** Cotas dinâmicas da prévia (duas, só de leitura): o sistema único de cotas cuida do desenho. */
  tempDims(overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const subject = this.dimSubject;
    if (!subject) return [];
    const project = this.env.project();
    return openingDimProvider.compute({ project, levelId: this.env.levelId(), settings: dimensionSettingsOf(project), overrides }, subject);
  }

  private place(wallId: string, offset: number): void {
    const options = this.env.options();
    const { flipHand, flipFacing } = this.intent();
    const o: Opening = {
      id: makeId(this.id === 'door' ? 'd' : 'j'),
      kind: this.id,
      typeId: this.typeId(),
      hostId: wallId,
      offset,
      flipHand,
      flipFacing,
      sillOverride: options.openingSillOverride ?? null,
      mark: options.placementMark ?? '',
    };
    // A esquadria e a etiqueta ao inserir formam UM passo de desfazer: o primeiro Ctrl+Z remove a porta e o flag juntos.
    this.env.transaction(this.t(this.id === 'door' ? 'tl_undo_insert_door' : 'tl_undo_insert_window'), () => {
      this.env.exec({ type: 'addOpening', opening: o });
      // Revit "Tag on Placement": a etiqueta do tipo nasce junto com a esquadria (a opção desliga só esta ligação).
      if (options.openingTagOnPlace !== false && !this.env.project().settings.showOpeningTags) {
        this.env.exec({ type: 'setSettings', patch: { showOpeningTags: true } });
      }
    });
    const pr = this.env.project();
    this.env.say(this.t('tl_msg_opening_inserted', { type: openingType(pr, o).name }));
  }

  override click(p: PointerInfo): void {
    this.move(p);
    if (this.current) this.place(this.current.wallId, this.current.offset);
  }

  override type(text: string): boolean {
    if (!this.current) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) return false;
    const off = this.resolve(v, this.current.wallId);
    if (off === null) {
      this.env.say(this.t('tl_msg_opening_position'));
      return false;
    }
    this.place(this.current.wallId, off);
    return true;
  }
}
