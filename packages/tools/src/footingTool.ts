import { dist, type Vec2 } from '@hestia/geom';
import {
  columnsOnLevel,
  findFootingType,
  footingPolygon,
  isColumn,
  isFooting,
  makeFooting,
  type Column,
  type FootingType,
  type Id,
  type Project,
} from '@hestia/model';
import { ToolBase, makeId } from './base.ts';
import {
  footingPresetOffset,
  isAnchorNumKey,
  matchingFootingPreset,
  nextBoundaryPreset,
  PRESET_BY_NUMKEY,
  type StructuralAnchorPreset,
} from './structuralPresets.ts';
import type { PointerInfo, ToolEnv, ToolOptions } from './types.ts';

export function defaultFootingTypeId(p: Project): Id {
  if (p.footingTypes) {
    const ids = Object.keys(p.footingTypes);
    if (ids.length > 0) return ids[0]!;
  }
  return 'ft_iso_100x100';
}

/**
 * Cria sapatas isoladas alinhadas a pilares (selecionados ou de todo o nível ativo).
 * Pula colunas que já possuem uma sapata vinculada.
 */
export function placeFootingsAtColumns(env: ToolEnv, columnIds?: Id[]): Id[] {
  const p = env.project();
  const levelId = env.levelId();
  const cols = Object.values(p.elements).filter(isColumn);
  const targetCols = columnIds
    ? cols.filter((c) => columnIds.includes(c.id))
    : columnsOnLevel(p, levelId);

  const existingFootingCols = new Set(
    Object.values(p.elements)
      .filter(isFooting)
      .map((f) => f.columnId)
      .filter((id): id is Id => Boolean(id)),
  );

  const o = env.options();
  const typeId = o.footingTypeId ?? defaultFootingTypeId(p);
  const heightOffset = o.footingHeightOffset ?? 0;
  const eccentric = Boolean(o.footingEccentric);
  const eccentricityX = eccentric ? (o.footingEccentricityX ?? 0) : 0;
  const eccentricityY = eccentric ? (o.footingEccentricityY ?? 0) : 0;
  const createdIds: Id[] = [];

  const toCreate = targetCols.filter((col) => !existingFootingCols.has(col.id));
  if (toCreate.length === 0) return createdIds;

  env.transaction('Sapatas nos pilares', () => {
    for (const col of toCreate) {
      const id = makeId('ft');
      const footing = makeFooting({
        id,
        typeId,
        levelId: col.levelId,
        at: { x: col.at.x, y: col.at.y },
        rotation: col.rotation,
        heightOffset,
        eccentricityX,
        eccentricityY,
        columnId: col.id,
        mark: o.placementMark ?? '',
        comments: o.placementComments ?? '',
      });
      env.exec({ type: 'addFooting', footing });
      createdIds.push(id);
    }
  });

  return createdIds;
}

/**
 * Ferramenta de colocação de sapatas isoladas.
 * No modo 'free', insere por clique livre ou vinculando ao pilar sob o clique.
 * No modo 'atColumns', posiciona diretamente sobre pilares existentes.
 */
export class FootingTool extends ToolBase {
  readonly id = 'footing';
  readonly label = 'Sapata';

  override get hint(): string {
    const mode = this.env.options().footingMode ?? 'free';
    return this.t(mode === 'atColumns' ? 'tl_hint_footing_column' : 'tl_hint_footing');
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

  override space(): void {
    const o = this.env.options();
    if (o.footingEccentric) {
      const ctx = this.presetContext();
      const cur = matchingFootingPreset(
        this.env.project(),
        this.activeType().id,
        ctx.columnId,
        ctx.rotation,
        o.footingEccentricityX ?? 0,
        o.footingEccentricityY ?? 0,
      );
      this.applyPreset(nextBoundaryPreset(cur));
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
      this.applyPreset(PRESET_BY_NUMKEY[k]);
      return true;
    }
    return false;
  }

  private setToolOptions(patch: Partial<ToolOptions>): void {
    if (this.env.setOptions) {
      this.env.setOptions(patch);
    } else {
      Object.assign(this.env.options(), patch);
    }
  }

  private presetContext(): { columnId: Id | null; rotation: number } {
    const o = this.env.options();
    if (o.footingMode === 'atColumns' && this.lastPointer) {
      const cols = columnsOnLevel(this.env.project(), this.env.levelId());
      const near = this.findNearestColumn(cols, this.lastPointer.raw);
      if (near) return { columnId: near.id, rotation: near.rotation };
    }
    return { columnId: null, rotation: this.effectiveRotation() };
  }

  private applyPreset(preset: StructuralAnchorPreset): void {
    if (preset === 'center') {
      this.setToolOptions({ footingEccentric: false, footingEccentricityX: 0, footingEccentricityY: 0 });
    } else {
      const ctx = this.presetContext();
      const off = footingPresetOffset(this.env.project(), this.activeType().id, ctx.columnId, ctx.rotation, preset);
      this.setToolOptions({
        footingEccentric: true,
        footingEccentricityX: off.eccentricityX,
        footingEccentricityY: off.eccentricityY,
      });
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
    const base = this.env.options().footingRotation ?? 0;
    return (base + this.tempRotation) % (2 * Math.PI);
  }

  private activeType(): FootingType {
    const p = this.env.project();
    const typeId = this.env.options().footingTypeId ?? defaultFootingTypeId(p);
    return findFootingType(p, typeId);
  }

  override move(p: PointerInfo): void {
    this.lastPointer = p;
    const mode = this.env.options().footingMode ?? 'free';
    if (mode === 'atColumns') {
      this.moveAtColumns(p);
    } else {
      this.moveFree(p);
    }
  }

  private findNearestColumn(cols: Column[], pt: Vec2, maxDist = 1.0): Column | null {
    let closest: Column | null = null;
    let minD = maxDist;
    for (const c of cols) {
      const d = dist(c.at, pt);
      if (d < minD) {
        minD = d;
        closest = c;
      }
    }
    return closest;
  }

  private activeEccentricity(): { eccentricityX: number; eccentricityY: number } {
    const o = this.env.options();
    if (!o.footingEccentric) return { eccentricityX: 0, eccentricityY: 0 };
    return { eccentricityX: o.footingEccentricityX ?? 0, eccentricityY: o.footingEccentricityY ?? 0 };
  }

  private moveAtColumns(p: PointerInfo): void {
    const pProject = this.env.project();
    const cols = columnsOnLevel(pProject, this.env.levelId());
    const near = this.findNearestColumn(cols, p.raw);
    this.items = [];

    if (!near) {
      this.env.say(this.t('tl_hint_footing_column'));
      return;
    }

    const { eccentricityX, eccentricityY } = this.activeEccentricity();
    const ring = footingPolygon({ at: near.at, rotation: near.rotation, eccentricityX, eccentricityY }, this.activeType());
    this.items.push({ kind: 'highlight', ids: [near.id] });
    this.items.push({ kind: 'polygon', ring });
    this.env.say(this.t('tl_hint_footing_column'));
  }

  private moveFree(p: PointerInfo): void {
    const inf = this.snap(p);
    const { eccentricityX, eccentricityY } = this.activeEccentricity();
    const ring = footingPolygon({ at: inf.point, rotation: this.effectiveRotation(), eccentricityX, eccentricityY }, this.activeType());
    this.items = Math.hypot(eccentricityX, eccentricityY) > 1e-6
      ? [{ kind: 'polygon', ring }, { kind: 'point', at: inf.point }]
      : [{ kind: 'polygon', ring }];
    this.env.say(this.hint);
  }

  override click(p: PointerInfo): void {
    this.lastPointer = p;
    const mode = this.env.options().footingMode ?? 'free';
    if (mode === 'atColumns') {
      this.clickAtColumns(p);
    } else {
      this.clickFree(p);
    }
  }

  private clickAtColumns(p: PointerInfo): void {
    const pProject = this.env.project();
    const cols = columnsOnLevel(pProject, this.env.levelId());
    const near = this.findNearestColumn(cols, p.raw);
    if (!near) {
      this.env.say(this.t('tl_hint_footing_column'));
      return;
    }

    const alreadyHas = Object.values(pProject.elements).some(
      (e) => isFooting(e) && e.columnId === near.id,
    );
    if (alreadyHas) {
      this.env.say(this.t('tl_msg_footing_exists'));
      return;
    }

    placeFootingsAtColumns(this.env, [near.id]);
    this.env.say(this.t('tl_msg_footing_at_columns_done'));
  }

  private clickFree(p: PointerInfo): void {
    const inf = this.snap(p);
    const o = this.env.options();
    const type = this.activeType();
    const cols = columnsOnLevel(this.env.project(), this.env.levelId());
    const nearCol = cols.find((c) => dist(c.at, inf.point) < 0.1);

    const { eccentricityX, eccentricityY } = this.activeEccentricity();
    const footing = makeFooting({
      id: makeId('ft'),
      typeId: type.id,
      levelId: this.env.levelId(),
      at: inf.point,
      rotation: this.effectiveRotation(),
      heightOffset: o.footingHeightOffset ?? 0,
      eccentricityX,
      eccentricityY,
      columnId: nearCol ? nearCol.id : null,
      mark: o.placementMark ?? '',
      comments: o.placementComments ?? '',
    });

    this.env.transaction('Criar sapata', () => {
      this.env.exec({ type: 'addFooting', footing });
    });
    this.env.say(this.hint);
  }
}
