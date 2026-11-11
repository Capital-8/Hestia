import type { PlanView, PlanViewRef } from './planView.ts';
import type { Id, Project } from './types.ts';

/**
 * Busca de vista SEM memória: serve ao código que roda sobre o RASCUNHO do projeto (comandos), onde as leituras
 * memorizadas por identidade (`planViewOf`) podem ficar velhas se um comando anterior do mesmo lote mexeu em `p.planViews`
 * no lugar. Lê direto de `p.planViews`. Fora de comandos, prefira `planViewOf`.
 */
export function resolvePlanView(p: Pick<Project, 'planViews'>, viewId: Id): PlanView | undefined {
  return (p.planViews ?? []).find((v) => v.id === viewId);
}

/** Como `resolvePlanView`, no formato `PlanViewRef` (tipo, nível e, na planta de área, o id dela). Id inexistente: `undefined`. */
export function resolvePlanViewRef(p: Pick<Project, 'planViews'>, viewId: Id): PlanViewRef | undefined {
  const v = resolvePlanView(p, viewId);
  if (!v) return undefined;
  return v.kind === 'area' ? { kind: 'area', levelId: v.levelId, areaPlanId: v.id } : { kind: v.kind, levelId: v.levelId };
}
