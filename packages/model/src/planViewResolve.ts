import { planViewRef, type PlanViewRef } from './planView.ts';
import type { Id, Project } from './types.ts';

/**
 * Resolve um `viewId` de planta (piso, cobertura ou planta de área) para o armazenamento atual SEM memória:
 * serve ao código que roda sobre o RASCUNHO do projeto (comandos), onde a projeção memorizada de `planViewsOf`
 * pode ficar velha se um comando anterior do mesmo lote mexeu no `Level`/`AreaPlan` no lugar. Mesma regra de
 * `planViewRefOf` (piso e cobertura pelo id determinístico; o resto é o id de uma planta de área; o nível precisa existir).
 * Fora de comandos, prefira `planViewRefOf`/`planViewOf`.
 */
// armazenamento (Fase 2): vira busca em `Project.planViews`.
export function resolvePlanViewRef(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): PlanViewRef | undefined {
  const decoded = planViewRef(viewId);
  if (decoded && p.levels.some((l) => l.id === decoded.levelId)) return decoded;
  const plan = (p.areaPlans ?? []).find((a) => a.id === viewId);
  if (plan && p.levels.some((l) => l.id === plan.levelId)) return { kind: 'area', levelId: plan.levelId, areaPlanId: plan.id };
  return undefined;
}
