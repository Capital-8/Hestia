import type { Id, Project, SectionView } from './types.ts';

/** Extensão 2D de uma linha de nível no corte/elevação: coordenadas `t` ao longo da linha do corte. */
export interface SectionLevelExtent {
  a: number;
  b: number;
}

/** Extensão gravada para o nível, ou undefined quando a linha atravessa a vista inteira. */
export function sectionLevelExtentOf(v: Pick<SectionView, 'levelExtents'> | undefined, levelId: Id): SectionLevelExtent | undefined {
  return v?.levelExtents?.[levelId];
}

/** Motivo de recusa de uma extensão, ou null. */
export function sectionLevelExtentIssue(extent: SectionLevelExtent): string | null {
  if (!extent || typeof extent !== 'object') return 'A extensão da linha do nível é inválida.';
  if (!Number.isFinite(extent.a) || !Number.isFinite(extent.b)) return 'As extremidades da linha do nível devem ser números finitos.';
  if (Math.abs(extent.b - extent.a) < 1e-6) return 'A linha do nível precisa de duas extremidades distintas.';
  return null;
}

/**
 * Aplica ou limpa a extensão da linha de nível numa vista de corte/elevação.
 * `undefined` devolve a linha ao comprimento inteiro da vista (remove a entrada).
 */
export function applySectionLevelExtent(p: Project, sectionId: Id, levelId: Id, extent: SectionLevelExtent | undefined): void {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) throw new Error('Vista de corte/elevação inexistente.');
  if (extent === undefined) {
    if (!view.levelExtents || !(levelId in view.levelExtents)) return;
    const next = { ...view.levelExtents };
    delete next[levelId];
    if (Object.keys(next).length > 0) view.levelExtents = next;
    else delete view.levelExtents;
    return;
  }
  if (!p.levels.some((l) => l.id === levelId)) throw new Error('Nível inexistente.');
  const issue = sectionLevelExtentIssue(extent);
  if (issue) throw new Error(issue);
  view.levelExtents = { ...(view.levelExtents ?? {}), [levelId]: { a: extent.a, b: extent.b } };
}
