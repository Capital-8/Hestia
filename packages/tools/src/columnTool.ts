import { columnPolygon, findColumnType, makeColumn, type ColumnType, type Id, type Project } from '@hestia/model';
import { ToolBase, makeId } from './base.ts';
import {
  columnAnchorOffset,
  isAnchorNumKey,
  nextBoundaryPreset,
  PRESET_BY_NUMKEY,
  STRUCTURAL_BOUNDARY_CYCLE,
  type StructuralAnchorPreset,
} from './structuralPresets.ts';
import type { PointerInfo } from './types.ts';

export function defaultColumnTypeId(p: Project): Id {
  if (p.columnTypes) {
    const ids = Object.keys(p.columnTypes);
    if (ids.length > 0) return ids[0]!;
  }
  return 'ct_conc_20x40';
}

/**
 * Ferramenta de colocação de pilares estruturais por clique único na planta.
 * O pilar acompanha a rotação definida na barra de opções ou rotaciona a cada toque na barra de Espaço (+90°).
 */
export class ColumnTool extends ToolBase {
  readonly id = 'column';
  readonly label = 'Pilar';

  override get hint(): string {
    return this.t('tl_hint_column');
  }

  private tempRotation = 0;
  private lastPointer: PointerInfo | null = null;

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.tempRotation = 0;
    this.lastPointer = null;
  }

  protected busy(): boolean {
    return false;
  }

  override tab(reverso?: boolean): void {
    const all: readonly StructuralAnchorPreset[] = ['center', ...STRUCTURAL_BOUNDARY_CYCLE];
    const idx = all.indexOf(this.activeAnchor());
    const delta = reverso ? -1 : 1;
    const next = all[(idx + delta + all.length) % all.length]!;
    this.setAnchor(next);
  }

  override space(): void {
    const anchor = this.activeAnchor();
    if (anchor !== 'center') {
      this.setAnchor(nextBoundaryPreset(anchor));
      return;
    }
    this.rotateStep();
  }

  onKey(k: string): boolean {
    if (k === ' ') {
      this.space();
      return true;
    }
    if (isAnchorNumKey(k)) {
      this.setAnchor(PRESET_BY_NUMKEY[k]);
      return true;
    }
    return false;
  }

  private activeAnchor(): StructuralAnchorPreset {
    return this.env.options().columnAnchor ?? 'center';
  }

  private setAnchor(columnAnchor: StructuralAnchorPreset): void {
    if (this.env.setOptions) {
      this.env.setOptions({ columnAnchor });
    } else {
      this.env.options().columnAnchor = columnAnchor;
    }
    if (this.lastPointer) {
      this.move(this.lastPointer);
    }
  }

  private rotateStep(): void {
    this.tempRotation = (this.tempRotation + Math.PI / 2) % (2 * Math.PI);
    if (this.lastPointer) {
      this.move(this.lastPointer);
    }
  }

  private effectiveRotation(): number {
    const base = this.env.options().columnRotation ?? 0;
    return (base + this.tempRotation) % (2 * Math.PI);
  }

  private activeType(): ColumnType {
    const p = this.env.project();
    const typeId = this.env.options().columnTypeId ?? defaultColumnTypeId(p);
    return findColumnType(p, typeId);
  }

  private computeSpan(): { topLevelId: Id | null; baseOffset: number; topOffset: number; height: number } {
    const o = this.env.options();
    const currentLevelId = this.env.levelId();
    const baseOffset = o.columnBaseOffset ?? 0;
    const topOffset = o.columnTopOffset ?? 0;

    if (o.columnTopLevelId !== undefined) {
      const topLevelId = o.columnTopLevelId;
      const height = o.columnHeight ?? 2.8;
      return { topLevelId, baseOffset, topOffset: topLevelId ? topOffset : 0, height };
    }

    if (o.columnDepthMode === 'depth') {
      return { topLevelId: null, baseOffset, topOffset: 0, height: o.columnHeight ?? 2.8 };
    }

    // Modo altura padrão: conecta ao próximo nível acima, se existir.
    const levels = [...this.env.project().levels].sort((a, b) => a.elevation - b.elevation);
    const curIdx = levels.findIndex((l) => l.id === currentLevelId);
    if (curIdx >= 0 && curIdx + 1 < levels.length) {
      const nextLevel = levels[curIdx + 1]!;
      const h = Math.max(0.05, (nextLevel.elevation + topOffset) - (levels[curIdx]!.elevation + baseOffset));
      return { topLevelId: nextLevel.id, baseOffset, topOffset, height: h };
    }

    return { topLevelId: null, baseOffset, topOffset: 0, height: o.columnHeight ?? 2.8 };
  }

  override move(p: PointerInfo): void {
    this.lastPointer = p;
    const inf = this.snap(p);
    const rot = this.effectiveRotation();
    const type = this.activeType();
    const anchor = this.activeAnchor();
    const off = columnAnchorOffset(type, rot, anchor);
    const at = { x: inf.point.x + off.x, y: inf.point.y + off.y };
    const ring = columnPolygon({ at, rotation: rot }, type);
    this.items = anchor !== 'center'
      ? [{ kind: 'polygon', ring }, { kind: 'point', at: inf.point }]
      : [{ kind: 'polygon', ring }];
    this.env.say(this.hint);
  }

  override click(p: PointerInfo): void {
    this.lastPointer = p;
    const inf = this.snap(p);
    const o = this.env.options();
    const span = this.computeSpan();
    const type = this.activeType();
    const rot = this.effectiveRotation();
    const off = columnAnchorOffset(type, rot, this.activeAnchor());
    const at = { x: inf.point.x + off.x, y: inf.point.y + off.y };

    const column = makeColumn({
      id: makeId('col'),
      typeId: type.id,
      levelId: this.env.levelId(),
      at,
      rotation: rot,
      baseOffset: span.baseOffset,
      topLevelId: span.topLevelId,
      topOffset: span.topOffset,
      height: span.height,
      mark: o.placementMark ?? '',
      comments: o.placementComments ?? '',
    });

    this.env.transaction('Criar pilar', () => {
      this.env.exec({ type: 'addColumn', column });
    });

    this.env.say(this.hint);
  }
}
