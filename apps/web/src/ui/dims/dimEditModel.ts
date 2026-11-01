import { dimensionGeometry, dimensionPoints, formatQuantity, sectionAnnotationsOf, type Command, type Dimension, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import { drivenEditCommands, parseQuantityText, viewAnnotationsOf } from '@hestia/tools';
import type { Vec2 } from '@hestia/geom';

export interface DimEditScope {
  view: string;
  levelId: Id;
  areaPlanId: Id | null;
  planKind: string;
  sectionId: Id | null;
}

export interface FoundDim { dim: Dimension; inSection: boolean; scale: number }

/** Acha a cota permanente editada: na vista de corte/elevação (anotações da vista) ou na planta (nível ou planta de área). */
export function findEditDim(project: Project, scope: DimEditScope, id: Id): FoundDim | null {
  if (scope.view === 'section') {
    const v = project.views.find((x) => x.id === scope.sectionId);
    const dim = sectionAnnotationsOf(v as never).dimensions.find((d) => d.id === id);
    return dim ? { dim, inSection: true, scale: 100 } : null;
  }
  const va = viewAnnotationsOf(project, scope.levelId, scope.planKind === 'area' ? (scope.areaPlanId ?? undefined) : undefined);
  const dim = va.dimensions.find((d) => d.id === id);
  return dim ? { dim, inSection: false, scale: va.scale } : null;
}

/** Ponto (m) do centro do texto da cota, para ancorar o campo. */
export function dimTextPoint(project: Project, dim: Dimension, scale: number): Vec2 {
  const { a, b } = dimensionPoints(project, dim);
  return dimensionGeometry(a, b, dim.offset, scale / 1000, dim.textHeight ?? 2.5, dim.textAt).textAt;
}

export type DimEditInput = { ok: true; commands: Command[] } | { ok: false; reason: string };

export const SECTION_REFUSAL = 'Cota de corte é só anotação: não move elementos.';

/** Texto digitado -> comandos da cota dirigida (ou motivo da recusa). */
export function resolveDimEditInput(project: Project, dim: Dimension, text: string, units: ResolvedUnits, opts: { fixed?: 'a' | 'b'; inSection?: boolean } = {}): DimEditInput {
  if (opts.inSection) return { ok: false, reason: SECTION_REFUSAL };
  const value = parseQuantityText(text, units, 'length');
  if (value === null) return { ok: false, reason: `Medida inválida: digite uma distância, como ${formatQuantity(units, 'length', 1.2, { trim: true })}.` };
  const r = drivenEditCommands(project, dim, value, opts.fixed);
  return r.ok ? { ok: true, commands: r.commands as Command[] } : { ok: false, reason: r.reason };
}
