import { planViewOf as vistaDoModelo, planViewsOfLevel, type Id, type PlanAnnotations, type PlanView, type Project } from '@hestia/model';

/**
 * Leituras da planta de área pela API de vistas do modelo (docs/vistas/PLANO-MESTRE.md §4.2), no lugar de
 * `areaPlanOf`/`areaPlansOfLevel`. Os dados da área (`scale`, `graphics`, `tags`, `legend`, `table`, `schemeId`) vêm em
 * `vista.area`.
 */

/** Planta de área pelo id (que é também o id da vista); `undefined` se o id não existe ou não é de uma planta de área. */
export function vistaDeArea(p: Project, planId: Id | null | undefined): PlanView | undefined {
  if (!planId) return undefined;
  const v = vistaDoModelo(p, planId);
  return v?.kind === 'area' && v.area ? v : undefined;
}

/** Primeira planta de área do nível (a que o rótulo de ambiente da planta de piso usa como padrão). */
export function primeiraVistaDeAreaDoNivel(p: Project, levelId: Id): PlanView | undefined {
  return planViewsOfLevel(p, levelId, 'area')[0];
}

/** Ids de todas as anotações de um conjunto (cotas, textos, linhas e regiões de detalhe, etiquetas). */
export function idsDeAnotacoes(a: PlanAnnotations): Id[] {
  return [...a.dimensions.map((x) => x.id), ...a.texts.map((x) => x.id), ...a.detailLines.map((x) => x.id), ...a.detailRegions.map((x) => x.id), ...a.tags.map((x) => x.id)];
}
