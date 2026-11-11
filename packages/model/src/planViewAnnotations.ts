import { current, isDraft } from 'immer';
import type { PlanAnnotations } from './planView.ts';
import type { Id } from './types.ts';

/** As cinco famílias de anotação de uma vista de planta, na ordem em que são guardadas. */
export const ANNOTATION_FAMILIES = ['dimensions', 'texts', 'detailLines', 'detailRegions', 'tags'] as const;
export type AnnotationFamily = (typeof ANNOTATION_FAMILIES)[number];

/** Id da cópia de uma anotação na vista `viewId` (determinístico: a migração e os comandos usam a mesma regra). */
export const annotationCopyId = (id: Id, viewId: Id): Id => `${id}__${viewId}`;

/** Cópia profunda (resolve rascunhos do immer): comandos e migração nunca compartilham objetos entre vistas. */
export function plainClone<T>(x: T): T {
  return structuredClone(isDraft(x) ? current(x) : x);
}

/** Anotações vazias (arrays novos). */
export const newAnnotations = (): PlanAnnotations => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });

/** Completa listas ausentes com `[]` (`{}` = conjunto próprio e vazio). */
export function normalizeAnnotations(a: Partial<PlanAnnotations> | undefined): PlanAnnotations {
  return { dimensions: a?.dimensions ?? [], texts: a?.texts ?? [], detailLines: a?.detailLines ?? [], detailRegions: a?.detailRegions ?? [], tags: a?.tags ?? [] };
}

/**
 * Cópia das anotações de `source` para a vista `viewId` (ids `<id>__<viewId>`), só das famílias em `families`. `refs`
 * (cotas) e `hostId` (etiquetas) apontam para elementos, não para a vista: continuam como estão.
 */
export function copyAnnotationsToView(source: Partial<PlanAnnotations> | undefined, viewId: Id, families: Partial<Record<AnnotationFamily, boolean>>): PlanAnnotations {
  const out = newAnnotations();
  for (const f of ANNOTATION_FAMILIES) {
    if (!families[f]) continue;
    const copies = (source?.[f] ?? []).map((x) => ({ ...plainClone(x), id: annotationCopyId(x.id, viewId) }));
    (out[f] as unknown[]) = copies;
  }
  return out;
}

/** Ids de todas as anotações do conjunto. */
export function annotationIdsOf(a: Partial<PlanAnnotations> | undefined): Id[] {
  return ANNOTATION_FAMILIES.flatMap((f) => (a?.[f] ?? []).map((x) => x.id));
}

/** Total de anotações do conjunto. */
export const annotationCount = (a: Partial<PlanAnnotations> | undefined): number => ANNOTATION_FAMILIES.reduce((n, f) => n + (a?.[f]?.length ?? 0), 0);

/**
 * Famílias que a planta de área desenha a partir dos gráficos (a mesma condição de `drawnAnnotations` em
 * `packages/render/src/plan/notes.ts` e de `areaLayersOf`): cotas por `showDimensions`; textos, detalhes e etiquetas por
 * `showAnnotations`. Campo ausente vale o padrão (ligado).
 */
export function familiesDrawnByArea(g: { showDimensions?: boolean; showAnnotations?: boolean } | undefined): Record<AnnotationFamily, boolean> {
  const notes = g?.showAnnotations !== false;
  return { dimensions: g?.showDimensions !== false, texts: notes, detailLines: notes, detailRegions: notes, tags: notes };
}

/**
 * Anotações de uma planta de área nova a partir das do nível ("herança" materializada): cópia só das famílias que a
 * planta desenha, com id `<id>__<idDaVista>`.
 */
export function inheritedAnnotations(levelAnnotations: Partial<PlanAnnotations> | undefined, viewId: Id, g: { showDimensions?: boolean; showAnnotations?: boolean } | undefined): PlanAnnotations {
  return copyAnnotationsToView(levelAnnotations, viewId, familiesDrawnByArea(g));
}

/**
 * Conjunto próprio de uma planta de área: as próprias (normalizadas) mais a cópia das etiquetas do nível, porque a planta
 * de área as desenha além das próprias (`profile.elementTags` = `showAnnotations`, `build.ts`; plano §10.4.1).
 */
export function ownAreaAnnotations(own: Partial<PlanAnnotations>, levelAnnotations: Partial<PlanAnnotations> | undefined, viewId: Id, g: { showAnnotations?: boolean } | undefined): PlanAnnotations {
  const a = plainClone(normalizeAnnotations(own));
  if (g?.showAnnotations === false) return a;
  return { ...a, tags: [...a.tags, ...copyAnnotationsToView(levelAnnotations, viewId, { tags: true }).tags] };
}

/**
 * Troca em `elements` os ids de anotação do nível pelos ids das cópias na vista (`copies`), ou os remove quando não há
 * cópia. Ids que não são de anotação do nível ficam como estão.
 */
export function remapHiddenElements(elements: readonly Id[] | undefined, levelIds: ReadonlySet<Id>, viewId: Id, copies: ReadonlySet<Id>): Id[] {
  return (elements ?? []).flatMap((id) => {
    if (!levelIds.has(id)) return [id];
    const copy = annotationCopyId(id, viewId);
    return copies.has(copy) ? [copy] : [];
  });
}
