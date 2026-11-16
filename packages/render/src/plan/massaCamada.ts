import { levelElevation, viewRangeOf } from '@hestia/model';
import type { PlanInput } from './build.ts';
import { massaOps, ocultosDaMassa } from './massa.ts';
import { paintOps, planStyleOf } from './style.ts';
import { areaPlanProfile, FLOOR_PLAN_PROFILE, type PlanOps, type PlanProfile } from './types.ts';

/**
 * Camada própria das massas (plano de massa, A.4 regra 10): as linhas vêm do kernel (`massa_planta`), no estilo da categoria `mass`. Lê só as
 * massas, a vista e as opções de exibição, nunca a resolução das paredes. Com a categoria desligada ou sem kernel, sai o que `massaOps` decide.
 */
export function buildPlanMassa(input: PlanInput): PlanOps {
  const { project: p, theme } = input;
  const vazio: PlanOps = { fills: [], strokes: [], labels: [] };
  const profile: PlanProfile = input.profile ?? (input.areaPlan ? areaPlanProfile(input.areaPlan) : FLOOR_PLAN_PROFILE);
  if (!profile.stairs || input.roofPlanMode === true) return vazio;
  if (!p.levels.some((l) => l.id === input.levelId)) return vazio;
  const style = planStyleOf(p, input.levelId, input.viewport.zoom, input.areaPlan?.scale);
  const fillBase = input.dark ? theme.bg : '#ffffff';
  const cutZ = levelElevation(p, input.levelId) + viewRangeOf(p, input.levelId).cut;
  const ocultos = ocultosDaMassa(p, input.hidden, input.revealed, style.paint.mass.visible);
  const o = paintOps(massaOps(p, input.levelId, ocultos, theme, input.dark, style.paint.mass, cutZ), style.paint.mass, fillBase);
  return { fills: o.fills, strokes: o.strokes, labels: o.labels };
}
